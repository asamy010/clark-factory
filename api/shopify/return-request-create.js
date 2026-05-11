/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/shopify/return-request-create (V21.9.7)
   ───────────────────────────────────────────────────────────────
   Create a new return request from an existing Shopify order.

   Body:
     {
       shopify_order_id: "...",  // required — the order being returned
       reason: "size_mismatch"|"damaged"|"not_as_described"|...,
       reason_text: "details from customer",
       items: [{ sku, line_item_id, qty, title?, price? }],  // partial returns supported
       refund_amount?: number,
       refund_method?: "cash"|"store_credit"|"shopify_refund",
       notes?: string,
     }

   Auth: admin
   Returns: { ok, request: <full RR doc> }
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";
import { addReturnRequest, genRRId, RETURN_REASONS } from "./_returnRequests.js";
/* V21.9.20: split-aware order read — pre-V21.9.20 we read cfg.shopifyPendingOrders
   directly, which returns [] post-V21.9.18 migration. */
import { findPendingOrder } from "./_pendingOrders.js";

export default async function handler(req, res){
  setCors(res, req);
  if(req.method === "OPTIONS"){ res.status(204).end(); return; }
  if(req.method !== "POST"){
    return res.status(405).json({ ok:false, error: "POST فقط" });
  }
  const auth = await verifyAdminToken(req.headers.authorization);
  if(!auth.ok){
    return res.status(auth.status).json({ ok:false, error: auth.error });
  }

  const body = (typeof req.body === "string") ? JSON.parse(req.body || "{}") : (req.body || {});
  const shopifyOrderId = String(body.shopify_order_id || "").trim();
  const reason = String(body.reason || "other").trim();
  const reasonText = String(body.reason_text || "").trim().slice(0, 1000);
  const items = Array.isArray(body.items) ? body.items : [];
  const refundAmount = Number(body.refund_amount) || 0;
  const refundMethod = String(body.refund_method || "cash").trim();
  const notes = String(body.notes || "").trim().slice(0, 1000);

  if(!shopifyOrderId){
    return res.status(400).json({ ok:false, error: "shopify_order_id مطلوب" });
  }
  if(!RETURN_REASONS.find(r => r.key === reason)){
    return res.status(400).json({ ok:false, error: "السبب غير معروف" });
  }
  if(items.length === 0){
    return res.status(400).json({ ok:false, error: "يجب اختيار عنصر واحد على الأقل للإرجاع" });
  }

  /* Read the order to copy customer info — V21.9.20 split-aware */
  let order, cfg;
  try {
    const db = getDb();
    const cfgSnap = await db.collection("factory").doc("config").get();
    cfg = cfgSnap.exists ? (cfgSnap.data() || {}) : {};
    /* Live lookup via helper (handles both legacy cfg.shopifyPendingOrders
       and post-V21.9.18 shopifyOrdersDays/{day} day docs transparently). */
    const found = await findPendingOrder(cfg, shopifyOrderId);
    order = found.order;
    /* If not found live, try archive (slow but rare) */
    if(!order){
      const archSnap = await db.collection("shopifyOrdersArchive").get();
      for(const d of archSnap.docs){
        const data = d.data() || {};
        const arr = Array.isArray(data.orders) ? data.orders : [];
        const f = arr.find(o => String(o.shopify_order_id) === shopifyOrderId);
        if(f){ order = f; break; }
      }
    }
  } catch(e){
    return res.status(500).json({ ok:false, error: "تعذر قراءة الطلب: " + e.message });
  }
  if(!order){
    return res.status(404).json({ ok:false, error: "الطلب مش موجود" });
  }

  /* Idempotency: don't create duplicate pending requests for the same order */
  try {
    const allReqs = Array.isArray(cfg.shopifyReturnRequests) ? cfg.shopifyReturnRequests : [];
    const dup = allReqs.find(r =>
      r.shopify_order_id === shopifyOrderId &&
      ["pending_review", "approved", "in_pickup"].includes(r.status)
    );
    if(dup){
      return res.status(409).json({
        ok: false,
        error: "في طلب ارتجاع مفتوح بالفعل لهذا الطلب",
        existing_id: dup.id,
        existing_status: dup.status,
      });
    }
  } catch(_){}

  /* Build the return request entry */
  const now = new Date().toISOString();
  const entry = {
    id: genRRId(),
    shopify_order_id: shopifyOrderId,
    shopify_order_number: order.shopify_order_number || "",
    shopify_name: order.shopify_name || "",
    customer: {
      name: order.customer_info?.name || "",
      phone: order.customer_info?.phone || "",
      email: order.customer_info?.email || "",
      shopify_id: order.customer_info?.shopify_id || "",
      address: { ...(order.customer_info?.address || {}) },
    },
    reason,
    reason_text: reasonText,
    items: items.map(it => ({
      sku: String(it.sku || "").trim(),
      line_item_id: it.line_item_id ? String(it.line_item_id) : "",
      title: String(it.title || "").trim(),
      qty: Math.max(1, Number(it.qty) || 1),
      price: Number(it.price) || 0,
    })),
    status: "pending_review",
    refund_amount: refundAmount,
    refund_method: refundMethod,
    bosta_pickup: null,
    notes,
    created_at: now,
    updated_at: now,
    created_by: auth.email || auth.uid,
    processed_by: null,
    processed_at: null,
  };

  try {
    await addReturnRequest(cfg, entry);
  } catch(e){
    return res.status(500).json({ ok:false, error: "تعذر حفظ طلب الارتجاع: " + e.message });
  }

  return res.status(200).json({ ok: true, request: entry });
}
