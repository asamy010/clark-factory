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
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(cfgRef);
      const cfg = snap.exists ? (snap.data() || {}) : {};
      const orders = Array.isArray(cfg.shopifyPendingOrders) ? cfg.shopifyPendingOrders : [];
      const idx = orders.findIndex(o => String(o.shopify_order_id) === orderId);
      if(idx < 0){
        throw new Error("الطلب مش موجود في CLARK — اعمل sync الأول");
      }
      const prev = orders[idx];
      if(prev.status === "delivered"){
        /* Idempotent — just refresh the timestamp */
      }
      if(prev.status === "refused" || prev.status === "cancelled"){
        throw new Error("الطلب اتـ mark كـ " + prev.status + " — مش هينفع تـ deliver-ه");
      }
      const next = {
        ...prev,
        status: "delivered",
        delivered_at: deliveredAt,
        delivered_by: auth.email || auth.uid,
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
