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

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";
import { commitReservationsForOrder } from "./_reservations.js";
import { buildShopifyInvoiceFromOrder, findInvoiceByShopifyOrderId } from "./_invoices.js";

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
    let updatedOrder = null;
    let createdInvoice = null;
    let invoiceWasNew = false;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(cfgRef);
      const cfg = snap.exists ? (snap.data() || {}) : {};
      const orders = Array.isArray(cfg.shopifyPendingOrders) ? cfg.shopifyPendingOrders : [];
      const idx = orders.findIndex(o => String(o.shopify_order_id) === orderId);
      if(idx < 0){
        throw new Error("الطلب مش موجود في CLARK — اعمل sync الأول");
      }
      const prev = orders[idx];
      if(prev.status === "refused" || prev.status === "cancelled"){
        throw new Error("الطلب اتـ mark كـ " + prev.status + " — مش هينفع تـ deliver-ه");
      }

      /* V19.95 Phase 3: build the invoice (idempotent — reuse existing). */
      let salesInvoices = Array.isArray(cfg.salesInvoices) ? cfg.salesInvoices.slice() : [];
      let updatedCounters = cfg.invoiceCounters || {};
      let invoice = findInvoiceByShopifyOrderId(cfg, orderId);
      if(!invoice){
        const built = buildShopifyInvoiceFromOrder(
          { ...cfg, salesInvoices },
          { ...prev, delivered_at: deliveredAt },
          auth.email || auth.uid
        );
        invoice = built.invoice;
        updatedCounters = built.updatedCounters;
        salesInvoices = [invoice, ...salesInvoices];
        invoiceWasNew = true;
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

      tx.set(cfgRef, {
        shopifyPendingOrders: updated,
        salesInvoices,
        invoiceCounters: updatedCounters,
        stockReservations: committedReservations,
      }, { merge: true });
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
