/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/shopify/mark-refused (V19.93 Phase 1)
   ───────────────────────────────────────────────────────────────
   Manually mark a Shopify pending order as refused (customer
   declined the COD delivery).

   Body: { orderId, reason? }
   Auth: admin

   Phase 1 behavior:
   • Status → "refused"
   • Stores refusal_reason + refused_at + actor

   Phase 2 will hook in stock release (delete the reservations).
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";

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
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(cfgRef);
      const cfg = snap.exists ? (snap.data() || {}) : {};
      const orders = Array.isArray(cfg.shopifyPendingOrders) ? cfg.shopifyPendingOrders : [];
      const idx = orders.findIndex(o => String(o.shopify_order_id) === orderId);
      if(idx < 0){
        throw new Error("الطلب مش موجود في CLARK");
      }
      const prev = orders[idx];
      if(prev.status === "delivered"){
        throw new Error("الطلب اتـ mark كـ delivered — استخدم Process Return بدل ده");
      }
      const next = {
        ...prev,
        status: "refused",
        refused_at: new Date().toISOString(),
        refused_by: auth.email || auth.uid,
        refusal_reason: reason || "—",
      };
      const updated = orders.slice();
      updated[idx] = next;
      tx.set(cfgRef, { shopifyPendingOrders: updated }, { merge: true });
      updatedOrder = next;
    });
    res.status(200).json({ ok: true, order: updatedOrder });
  } catch(e){
    res.status(400).json({ ok:false, error: e.message || "فشل التعديل" });
  }
}
