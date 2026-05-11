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
import { releaseReservationsForOrder } from "./_reservations.js";
import {
  findPendingOrder, isPendingOrdersSplit, SHOPIFY_ORDERS_COL,
} from "./_pendingOrders.js";

function ordersDayKey(order){
  const iso = order?.shopify_created_at || order?.createdAt;
  if(iso){
    try {
      const d = new Date(iso);
      if(!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    } catch(_) { /* fall through */ }
  }
  return new Date().toISOString().slice(0, 10);
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

    /* V21.9.18: pre-tx lookup — works for both legacy (cfg.shopifyPendingOrders)
       and post-migration (shopifyOrdersDays/{day}) modes via the helper. */
    const cfgSnapForRead = await cfgRef.get();
    const cfgForRead = cfgSnapForRead.exists ? (cfgSnapForRead.data() || {}) : {};
    const ordersSplitActive = isPendingOrdersSplit(cfgForRead);
    const { order: foundOrder, dayId: foundOrderDayId } = await findPendingOrder(cfgForRead, orderId);
    if(!foundOrder){
      throw new Error("الطلب مش موجود في CLARK");
    }
    const orderDayId = foundOrderDayId || ordersDayKey(foundOrder);

    let updatedOrder = null;
    await db.runTransaction(async (tx) => {
      /* ── ALL READS FIRST ── */
      const snap = await tx.get(cfgRef);
      const cfg = snap.exists ? (snap.data() || {}) : {};
      const ordersDayRef = ordersSplitActive
        ? db.collection(SHOPIFY_ORDERS_COL).doc(orderDayId)
        : null;
      const ordersDaySnap = ordersDayRef ? await tx.get(ordersDayRef) : null;

      /* ── LOGIC ── */
      let prev = null;
      let legacyOrders = null, legacyIdx = -1;
      let dayEntries = null, dayIdx = -1;
      if(ordersSplitActive){
        const data = ordersDaySnap && ordersDaySnap.exists ? (ordersDaySnap.data() || {}) : {};
        dayEntries = Array.isArray(data.entries) ? data.entries.slice() : [];
        dayIdx = dayEntries.findIndex(o => String(o?.shopify_order_id) === orderId);
        if(dayIdx >= 0) prev = dayEntries[dayIdx];
      } else {
        legacyOrders = Array.isArray(cfg.shopifyPendingOrders) ? cfg.shopifyPendingOrders : [];
        legacyIdx = legacyOrders.findIndex(o => String(o?.shopify_order_id) === orderId);
        if(legacyIdx >= 0) prev = legacyOrders[legacyIdx];
      }
      if(!prev){
        throw new Error("الطلب مش موجود في CLARK");
      }
      if(prev.status === "delivered"){
        throw new Error("الطلب اتـ mark كـ delivered — استخدم Process Return بدل ده");
      }
      const next = {
        ...prev,
        status: "refused",
        refused_at: new Date().toISOString(),
        refused_by: auth.email || auth.uid,
        refusal_reason: reason || "—",
        stock_reserved: false, /* Phase 2: release flag */
      };

      /* V19.94 Phase 2: release the order's active reservations.
         Idempotent — already-released reservations stay released. */
      const reservations = Array.isArray(cfg.stockReservations) ? cfg.stockReservations : [];
      const releasedReservations = releaseReservationsForOrder(reservations, orderId, "order_refused");

      /* ── WRITES ── */
      const cfgPatch = { stockReservations: releasedReservations };
      if(!ordersSplitActive){
        const updatedLegacy = legacyOrders.slice();
        updatedLegacy[legacyIdx] = next;
        cfgPatch.shopifyPendingOrders = updatedLegacy;
      }
      tx.set(cfgRef, cfgPatch, { merge: true });

      if(ordersSplitActive){
        const updatedDayEntries = dayEntries.slice();
        if(dayIdx >= 0) updatedDayEntries[dayIdx] = next;
        else updatedDayEntries.unshift(next);
        tx.set(ordersDayRef, {
          date: orderDayId,
          entries: updatedDayEntries,
          count: updatedDayEntries.length,
          updatedAt: new Date().toISOString(),
        });
      }

      updatedOrder = next;
    });
    res.status(200).json({ ok: true, order: updatedOrder });
  } catch(e){
    res.status(400).json({ ok:false, error: e.message || "فشل التعديل" });
  }
}
