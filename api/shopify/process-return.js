/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/shopify/process-return (V19.95 Phase 3)
   ───────────────────────────────────────────────────────────────
   Process a return for a previously-delivered Shopify order.
   Generates a credit note (CN-YYYY-NNNN) using CLARK's existing
   credit-note schema, links it to the original invoice, and flips
   the order's status to "returned".

   Body: { orderId, reason?, partial?: boolean, items?: [...] }
   Auth: admin

   Phase 3 MVP behavior:
   • Full return only (partial returns deferred to Phase 5+)
   • Credit note status = draft → user posts via existing Credit
     Notes tab to fire the journal reversal
   • Stock NOT auto-returned to inventory (manual step for now —
     Phase 5 will integrate with CLARK's stock movement logic)

   This endpoint mirrors the rare Stage 2D in the spec (returned
   after delivery — usually <2% of orders).

   ═══════════════════════════════════════════════════════════════
   V21.9.20 ROOT-CAUSE FIX: pre-V21.9.20 the order was read from
   cfg.shopifyPendingOrders inside the tx and written back via
   tx.set(cfgRef, { shopifyPendingOrders: updated }). Post-migration
   that read empty and the write re-created the legacy array,
   undoing the V21.9.18 split. Fix: pre-read order via helper,
   write back via upsertPendingOrder. The CN creation logic stays
   in the cfg transaction for atomicity.
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken, readSplitCollection } from "../_firebase.js";
import { findPendingOrder, upsertPendingOrder } from "./_pendingOrders.js";

const CN_PREFIX = "CN";

function newCnId(){
  return "cn_shop_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
}

function r2(n){
  return Math.round((Number(n) || 0) * 100) / 100;
}

/* Reserve next credit-note number from invoiceCounters.creditNotes[year] */
function reserveCreditNoteNo(cfg){
  const counters = cfg.invoiceCounters || {};
  const cn = counters.creditNotes || {};
  const year = new Date().getFullYear();
  const next = (cn[year] || 0) + 1;
  return {
    creditNoteNo: `${CN_PREFIX}-${year}-${String(next).padStart(4, "0")}`,
    updatedCounters: {
      ...counters,
      creditNotes: { ...cn, [year]: next },
    },
  };
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
  const reason = String(body.reason || "").trim().slice(0, 500);
  if(!orderId){
    res.status(400).json({ ok:false, error: "orderId مطلوب" });
    return;
  }

  try {
    const db = getDb();
    const cfgRef = db.collection("factory").doc("config");

    /* ── Pre-reads (outside any tx) ── */
    /* V21.9.11: invoices + CNs from split collections (they live in day docs
       post-V19.50 / V21.9.5 migrations, NOT in cfg). */
    const splitInvoices = await readSplitCollection("salesInvoicesDays");
    const splitCNs = await readSplitCollection("salesCreditNotesDays");
    /* V21.9.20: order from split-aware helper (works both pre- and post-migration). */
    const cfgPreSnap = await cfgRef.get();
    const cfgPre = cfgPreSnap.exists ? (cfgPreSnap.data() || {}) : {};
    const { order } = await findPendingOrder(cfgPre, orderId);
    if(!order){
      res.status(404).json({ ok:false, error: "الطلب مش موجود في CLARK" });
      return;
    }
    if(order.status !== "delivered"){
      res.status(400).json({
        ok: false,
        error: "الـ Process Return بـ يشتغل بس على الطلبات اللي تم استلامها فعلاً (status=delivered)",
      });
      return;
    }

    let updatedOrder = null;
    let createdCN = null;

    /* ── Credit-note tx (cfg + cnDay only — order goes to its own day doc after tx) ── */
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(cfgRef);
      const cfg = snap.exists ? (snap.data() || {}) : {};
      const invoiceSplitActive = !!cfg._splitDaysV1950Done;
      const cnSplitActive = !!cfg._splitDaysV2195Done;

      const today = new Date().toISOString().slice(0, 10);
      const cnDayRef = db.collection("salesCreditNotesDays").doc(today);
      const cnDaySnap = cnSplitActive ? await tx.get(cnDayRef) : null;

      /* Find the linked invoice */
      const invoiceList = invoiceSplitActive
        ? splitInvoices
        : (Array.isArray(cfg.salesInvoices) ? cfg.salesInvoices : []);
      const linkedInvoice = invoiceList.find(inv => inv.id === order.invoice_id) || null;

      /* Check for existing credit note (idempotent) */
      const cnList = cnSplitActive
        ? splitCNs
        : (Array.isArray(cfg.salesCreditNotes) ? cfg.salesCreditNotes : []);
      const existing = cnList.find(cn =>
        cn.source === "shopify" && String(cn.source_ref) === orderId
      );
      if(existing){
        /* Already returned — flip the order's status outside the tx. */
        updatedOrder = {
          ...order,
          status: "returned",
          returned_at: order.returned_at || new Date().toISOString(),
          returned_by: order.returned_by || (auth.email || auth.uid),
          return_credit_note_id: existing.id,
          return_credit_note_no: existing.creditNoteNo,
          return_reason: order.return_reason || reason || "—",
        };
        createdCN = existing;
        return;
      }

      /* Build the credit note items — mirror the invoice items */
      const sourceItems = Array.isArray(linkedInvoice?.items) ? linkedInvoice.items : [];
      const items = sourceItems.map(it => ({
        orderId: it.orderId,
        modelNo: it.modelNo,
        modelDesc: it.modelDesc,
        qty: Number(it.qty) || 0,
        unitPrice: Number(it.unitPrice) || 0,
        lineTotal: r2((Number(it.qty) || 0) * (Number(it.unitPrice) || 0)),
      }));
      const subtotal = r2(items.reduce((s, it) => s + (Number(it.lineTotal) || 0), 0));
      const total = r2(linkedInvoice?.total || subtotal);

      const { creditNoteNo, updatedCounters } = reserveCreditNoteNo(cfg);
      const customerId = cfg.shopifyConfig?.default_customer_id || "shopify_default";
      const customers = Array.isArray(cfg.customers) ? cfg.customers : [];
      const defaultCust = customers.find(c => c.id === customerId);
      const customerName = defaultCust?.nameAr || defaultCust?.name || "Shopify Customer";
      const customer = order.customer_info || {};

      const cn = {
        id: newCnId(),
        creditNoteNo,
        customerId,
        customerName,
        date: today,
        linkedInvoiceId: linkedInvoice?.id || null,
        linkedInvoiceNo: linkedInvoice?.invoiceNo || null,
        returnRef: null,
        returnRefs: [],
        items,
        subtotal,
        discountPct: 0,
        discount: 0,
        total,
        status: "draft",
        notes: "إرجاع طلب Shopify #" + (order.shopify_order_number || orderId)
             + (reason ? " — " + reason : ""),
        createdAt: new Date().toISOString(),
        createdBy: auth.email || auth.uid,
        source: "shopify",
        source_ref: String(orderId),
        shopify_order_number: order.shopify_order_number || "",
        shopify_customer_name: customer.name || "",
        shopify_customer_phone: customer.phone || "",
      };

      /* ── WRITES — cfg patches (counters + legacy CN array only) + cnDay ── */
      const cfgPatch = { invoiceCounters: updatedCounters };
      if(!cnSplitActive){
        const existingCfgCNs = Array.isArray(cfg.salesCreditNotes) ? cfg.salesCreditNotes : [];
        cfgPatch.salesCreditNotes = [cn, ...existingCfgCNs];
      }
      tx.set(cfgRef, cfgPatch, { merge: true });

      if(cnSplitActive){
        const dayEntries = (cnDaySnap && cnDaySnap.exists && Array.isArray(cnDaySnap.data()?.entries))
          ? cnDaySnap.data().entries
          : [];
        const filtered = dayEntries.filter(e => e && e.id !== cn.id);
        const merged = [cn, ...filtered];
        tx.set(cnDayRef, {
          entries: merged,
          count: merged.length,
          updatedAt: new Date().toISOString(),
        }, { merge: false });
      }

      updatedOrder = {
        ...order,
        status: "returned",
        returned_at: new Date().toISOString(),
        returned_by: auth.email || auth.uid,
        return_reason: reason || "—",
        return_credit_note_id: cn.id,
        return_credit_note_no: cn.creditNoteNo,
      };
      createdCN = cn;
    });

    /* ── V21.9.20: flip the order's status in its day doc (post-tx) ── */
    if(updatedOrder){
      await upsertPendingOrder(cfgPre, updatedOrder);
    }

    res.status(200).json({
      ok: true,
      order: updatedOrder,
      creditNote: createdCN ? { id: createdCN.id, creditNoteNo: createdCN.creditNoteNo, total: createdCN.total } : null,
      hint: "Credit note draft اتعمل. روح تاب \"إشعارات دائنة\" → اضغط Post عشان تـ generate الـ journal reversal.",
    });
  } catch(e){
    res.status(400).json({ ok:false, error: e.message || "فشل المعالجة" });
  }
}
