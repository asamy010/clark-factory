/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/shopify/mark-delivered (V19.93 Phase 1)
   ───────────────────────────────────────────────────────────────
   Manually mark a Shopify pending order as delivered.

   Body: { orderId, deliveredAt? }
   Auth: admin

   Phase 1 behavior (this version):
   • Updates status to "delivered" in factory/config.shopifyPendingOrders
   • Sets delivered_at timestamp
   • Stamps the actor (admin email) for audit trail

   Phase 3 will hook in:
   • Stock commit (consume reservations)
   • Auto-create salesInvoices entry
   • Treasury entry (Dr. MAIN_CASH / Cr. Sales Revenue)

   We DO NOT call Shopify here. The user might be marking delivered
   in CLARK before the courier marks fulfilled in Shopify, or for
   orders where Shopify will never reflect delivery (e.g. WhatsApp
   sales bypass). The cron poll-orders endpoint reconciles either way.
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken, readSplitCollection } from "../_firebase.js";
import { commitReservationsForOrder } from "./_reservations.js";
import { buildShopifyInvoiceFromOrder, findInvoiceByShopifyOrderId } from "./_invoices.js";

/* V21.9.11: dayId helper — matches the YYYY-MM-DD format used by App.jsx
   for split day-doc keys (see splitCollections.js syncSplitCollection). */
function dayIdOf(isoDate){
  const s = String(isoDate || new Date().toISOString());
  const d = s.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : new Date().toISOString().slice(0, 10);
}

export default async function handler(req, res){
  setCors(res, req);
  if(req.method === "OPTIONS"){ res.status(204).end(); return; }
  if(req.method !== "POST"){
    res.status(405).json({ ok:false, error: "POST فقط" });
    return;
  }

  const auth = await verifyAdminToken(req.headers.authorization);
  if(!auth.ok){
    res.status(auth.status).json({ ok:false, error: auth.error });
    return;
  }

  const body = (typeof req.body === "string") ? JSON.parse(req.body || "{}") : (req.body || {});
  const orderId = String(body.orderId || "").trim();
  if(!orderId){
    res.status(400).json({ ok:false, error: "orderId مطلوب" });
    return;
  }
  const deliveredAt = body.deliveredAt || new Date().toISOString();

  try {
    const db = getDb();
    const cfgRef = db.collection("factory").doc("config");

    /* V21.9.11 ROOT-CAUSE FIX:
       Pre-V21.9.11 the handler read `cfg.salesInvoices` directly. After the
       V19.50 split migration that array is stripped from factory/config
       (entries live in `salesInvoicesDays/{YYYY-MM-DD}`). The legacy read
       returned [], so:
         (a) `findInvoiceByShopifyOrderId` never matched → duplicate invoices
             on every Mark-Delivered click
         (b) the new invoice was written back to `cfg.salesInvoices` → which
             gets stripped again by the next client load → invoice LOST.
       Fix: pre-read all invoices from the split collection, do idempotency
       against that snapshot, and write the new invoice into today's day
       doc (same tx as the order update, so atomicity holds). Keep a
       legacy fallback for stores that haven't migrated yet (V19.50 flag
       check). */
    const allInvoices = await readSplitCollection("salesInvoicesDays");

    let updatedOrder = null;
    let createdInvoice = null;
    let invoiceWasNew = false;
    await db.runTransaction(async (tx) => {
      /* ── ALL READS FIRST (Firestore tx rule) ── */
      const snap = await tx.get(cfgRef);
      const cfg = snap.exists ? (snap.data() || {}) : {};
      const splitActive = !!cfg._splitDaysV1950Done;

      /* Pre-read today's day doc (only used in split-active path).
         Always read it so the tx contract is uniform — cost = 1 doc/call. */
      const today = dayIdOf(deliveredAt);
      const dayRef = db.collection("salesInvoicesDays").doc(today);
      const dayDocSnap = splitActive ? await tx.get(dayRef) : null;

      /* ── LOGIC ── */
      const orders = Array.isArray(cfg.shopifyPendingOrders) ? cfg.shopifyPendingOrders : [];
      const idx = orders.findIndex(o => String(o.shopify_order_id) === orderId);
      if(idx < 0){
        throw new Error("الطلب مش موجود في CLARK — اعمل sync الأول");
      }
      const prev = orders[idx];
      if(prev.status === "refused" || prev.status === "cancelled"){
        throw new Error("الطلب اتـ mark كـ " + prev.status + " — مش هينفع تـ deliver-ه");
      }

      /* V19.95 Phase 3: build the invoice (idempotent — reuse existing).
         V21.9.11: idempotency now consults the split-collection snapshot
         (or legacy cfg.salesInvoices if migration hasn't run). */
      let updatedCounters = cfg.invoiceCounters || {};
      let invoice = findInvoiceByShopifyOrderId(cfg, orderId, splitActive ? allInvoices : null);
      let legacySalesInvoices = null;
      if(!invoice){
        const built = buildShopifyInvoiceFromOrder(
          cfg,
          { ...prev, delivered_at: deliveredAt },
          auth.email || auth.uid
        );
        invoice = built.invoice;
        updatedCounters = built.updatedCounters;
        invoiceWasNew = true;
        if(!splitActive){
          /* Legacy mode: inline into cfg.salesInvoices (will be migrated later). */
          const existing = Array.isArray(cfg.salesInvoices) ? cfg.salesInvoices : [];
          legacySalesInvoices = [invoice, ...existing];
        }
      }

      /* V19.95 Phase 3: commit reservations for this order. */
      const reservations = Array.isArray(cfg.stockReservations) ? cfg.stockReservations : [];
      const committedReservations = commitReservationsForOrder(reservations, orderId, invoice.id);

      /* Update the order */
      const next = {
        ...prev,
        status: "delivered",
        delivered_at: deliveredAt,
        delivered_by: auth.email || auth.uid,
        invoice_id: invoice.id,
        invoice_no: invoice.invoiceNo,
        stock_reserved: false, /* moved to committed */
        stock_committed: true,
      };
      const updated = orders.slice();
      updated[idx] = next;

      /* ── WRITES ── */
      const cfgPatch = {
        shopifyPendingOrders: updated,
        invoiceCounters: updatedCounters,
        stockReservations: committedReservations,
      };
      if(legacySalesInvoices){
        cfgPatch.salesInvoices = legacySalesInvoices;
      }
      tx.set(cfgRef, cfgPatch, { merge: true });

      /* V21.9.11: split-active path — append the new invoice to its day doc
         atomically within the same tx so it persists past the next client
         strip cycle. */
      if(splitActive && invoiceWasNew){
        const dayEntries = (dayDocSnap && dayDocSnap.exists && Array.isArray(dayDocSnap.data()?.entries))
          ? dayDocSnap.data().entries
          : [];
        /* Defensive de-dup in case a concurrent write landed between pre-read and tx */
        const filtered = dayEntries.filter(e => e && e.id !== invoice.id);
        const merged = [invoice, ...filtered];
        tx.set(dayRef, {
          entries: merged,
          count: merged.length,
          updatedAt: new Date().toISOString(),
        }, { merge: false });
      }

      updatedOrder = next;
      createdInvoice = invoice;
    });
    res.status(200).json({
      ok: true,
      order: updatedOrder,
      invoice: createdInvoice ? { id: createdInvoice.id, invoiceNo: createdInvoice.invoiceNo, total: createdInvoice.total } : null,
      invoiceWasNew,
      hint: invoiceWasNew
        ? "فاتورة draft اتعملت. روح تاب \"فواتير المبيعات\" → اضغط Post عشان تـ generate الـ journal entry."
        : "الفاتورة موجودة قبل كده. مفيش حاجة جديدة اتعملت.",
    });
  } catch(e){
    res.status(400).json({ ok:false, error: e.message || "فشل التعديل" });
  }
}
