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
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";

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
    let updatedOrder = null;
    let createdCN = null;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(cfgRef);
      const cfg = snap.exists ? (snap.data() || {}) : {};
      const orders = Array.isArray(cfg.shopifyPendingOrders) ? cfg.shopifyPendingOrders : [];
      const idx = orders.findIndex(o => String(o.shopify_order_id) === orderId);
      if(idx < 0){
        throw new Error("الطلب مش موجود في CLARK");
      }
      const order = orders[idx];
      if(order.status !== "delivered"){
        throw new Error("الـ Process Return بـ يشتغل بس على الطلبات اللي تم استلامها فعلاً (status=delivered)");
      }

      /* Find the linked invoice */
      const invoices = Array.isArray(cfg.salesInvoices) ? cfg.salesInvoices : [];
      const linkedInvoice = invoices.find(inv => inv.id === order.invoice_id) || null;

      /* Check for existing credit note (idempotent) */
      const existingCNs = Array.isArray(cfg.salesCreditNotes) ? cfg.salesCreditNotes : [];
      const existing = existingCNs.find(cn =>
        cn.source === "shopify" && String(cn.source_ref) === orderId
      );
      if(existing){
        /* Already returned — refresh the order's status but don't dupe the CN */
        const next = {
          ...order,
          status: "returned",
          returned_at: order.returned_at || new Date().toISOString(),
          returned_by: order.returned_by || (auth.email || auth.uid),
          return_credit_note_id: existing.id,
          return_credit_note_no: existing.creditNoteNo,
          return_reason: order.return_reason || reason || "—",
        };
        const updated = orders.slice();
        updated[idx] = next;
        tx.set(cfgRef, { shopifyPendingOrders: updated }, { merge: true });
        updatedOrder = next;
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
        date: new Date().toISOString().slice(0, 10),
        linkedInvoiceId: linkedInvoice?.id || null,
        linkedInvoiceNo: linkedInvoice?.invoiceNo || null,
        returnRef: null, /* No CLARK-side return record; this is direct from Shopify */
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
        /* Shopify-specific fields */
        source: "shopify",
        source_ref: String(orderId),
        shopify_order_number: order.shopify_order_number || "",
        shopify_customer_name: customer.name || "",
        shopify_customer_phone: customer.phone || "",
      };

      const nextCNs = [cn, ...existingCNs];

      /* Update the order */
      const next = {
        ...order,
        status: "returned",
        returned_at: new Date().toISOString(),
        returned_by: auth.email || auth.uid,
        return_reason: reason || "—",
        return_credit_note_id: cn.id,
        return_credit_note_no: cn.creditNoteNo,
      };
      const updated = orders.slice();
      updated[idx] = next;

      tx.set(cfgRef, {
        shopifyPendingOrders: updated,
        salesCreditNotes: nextCNs,
        invoiceCounters: updatedCounters,
      }, { merge: true });
      updatedOrder = next;
      createdCN = cn;
    });
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
