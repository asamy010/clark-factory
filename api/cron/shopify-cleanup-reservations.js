/* ═══════════════════════════════════════════════════════════════
   CLARK — GET/POST /api/cron/shopify-cleanup-reservations (V19.94)
   ───────────────────────────────────────────────────────────────
   Daily janitor — expires reservations whose expires_at has passed
   and the underlying Shopify order is still "pending_delivery".

   Why we need this:
   - The COD timeout default is 7 days. A reservation older than that
     usually means the order silently failed (no fulfillment, no
     refusal — courier never came back). Holding the stock reserved
     forever blocks legitimate sales.
   - We DON'T cancel the Shopify order itself — just release the
     CLARK-side hold. The user can still mark it delivered/refused
     later if the courier eventually reports back.

   Behavior:
   - Walks stockReservations[]; flips status=active where expires_at<now
     to status=expired, with release_reason="ttl_expired".
   - Sets the corresponding pending order's stock_reserved=false so the
     UI reflects that the hold dropped.
   - Returns counts for monitoring.

   Auth: same dual auth as poll-orders (cron secret OR admin token).
   Schedule: daily 03:00 — see vercel.json.

   ═══════════════════════════════════════════════════════════════
   V21.9.20 ROOT-CAUSE FIX: pre-V21.9.20 this endpoint wrote back
   `shopifyPendingOrders: nextOrders` to factory/config inside a
   transaction. Post-migration that array was undefined — but the
   tx.set with merge:true re-created it (with the orders that were
   read from… nowhere, since cfg.shopifyPendingOrders was already
   stripped). The result was either:
     (a) a partial/incorrect array re-created in cfg, or
     (b) the array re-created with stale data (because we only
         touched the ones whose reservations expired).

   Fix: post-migration, update individual day docs via the helper
   instead of rewriting the whole array on factory/config.
   ═══════════════════════════════════════════════════════════════ */

import { getDb, verifyAdminToken } from "../_firebase.js";
import { expireStaleReservations } from "../shopify/_reservations.js";
import {
  readAllPendingOrders, upsertPendingOrder, isPendingOrdersSplit,
} from "../shopify/_pendingOrders.js";

function isAuthorizedCron(req){
  const secret = (process.env.CRON_SECRET || "").trim();
  if(!secret) return false;
  if((req.headers["x-vercel-cron-secret"] || "") === secret) return true;
  if(String(req.headers.authorization || "").trim() === "Bearer " + secret) return true;
  return false;
}

export default async function handler(req, res){
  if(req.method !== "GET" && req.method !== "POST"){
    res.status(405).json({ ok:false, error: "Method not allowed" });
    return;
  }
  let authBy = null;
  if(isAuthorizedCron(req)){
    authBy = "cron";
  } else {
    const a = await verifyAdminToken(req.headers.authorization);
    if(a.ok) authBy = "admin:" + (a.email || a.uid);
  }
  if(!authBy){
    res.status(401).json({ ok:false, error: "Unauthorized" });
    return;
  }

  let result = { expiredCount: 0, ordersFlipped: 0 };
  try {
    const db = getDb();
    const cfgRef = db.collection("factory").doc("config");

    /* V21.9.20: pre-read config + pending orders OUTSIDE any tx so we can
       (a) compute expirations, then (b) write the reservation array to
       cfg in one tx and (c) update affected day-doc orders separately.
       Pre-migration: orders live in cfg.shopifyPendingOrders (we keep
       the legacy single-tx path for safety). */
    const cfgSnap = await cfgRef.get();
    const cfg = cfgSnap.exists ? (cfgSnap.data() || {}) : {};
    const splitActive = isPendingOrdersSplit(cfg);

    const reservations = Array.isArray(cfg.stockReservations) ? cfg.stockReservations : [];
    const { array: nextReservations, expiredCount } = expireStaleReservations(reservations);
    result.expiredCount = expiredCount;

    if(expiredCount === 0){
      res.status(200).json({ ok:true, authBy, ...result });
      return;
    }

    /* Set of order ids whose reservations just expired — we'll flip their
       stock_reserved flag */
    const flippedOrderIds = new Set();
    for(let i = 0; i < reservations.length; i++){
      const before = reservations[i];
      const after = nextReservations[i];
      if(before.status === "active" && after.status === "expired"){
        flippedOrderIds.add(String(before.source_ref));
      }
    }

    if(splitActive){
      /* V21.9.20 split-aware path: update reservations on cfg, then
         flip stock_reserved on each affected order in its day doc. */
      const allPending = await readAllPendingOrders(cfg);
      const ordersToUpdate = allPending.filter(o =>
        flippedOrderIds.has(String(o.shopify_order_id)) && o.status === "pending_delivery"
      );
      result.ordersFlipped = ordersToUpdate.length;

      /* Update reservations on factory/config (still lives there) */
      await db.runTransaction(async (tx) => {
        tx.set(cfgRef, {
          stockReservations: nextReservations,
          shopifyConfig: {
            ...(cfg.shopifyConfig || {}),
            last_reservations_cleanup_at: new Date().toISOString(),
            last_reservations_cleanup_count: expiredCount,
            last_reservations_cleanup_by: authBy,
          },
        }, { merge: true });
      });

      /* Flip stock_reserved on each affected day-doc order */
      for(const o of ordersToUpdate){
        await upsertPendingOrder(cfg, { ...o, stock_reserved: false });
      }
    } else {
      /* Legacy single-tx path */
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(cfgRef);
        const c = snap.exists ? (snap.data() || {}) : {};
        const orders = Array.isArray(c.shopifyPendingOrders) ? c.shopifyPendingOrders : [];
        const nextOrders = orders.map(o => {
          if(flippedOrderIds.has(String(o.shopify_order_id)) && o.status === "pending_delivery"){
            result.ordersFlipped++;
            return { ...o, stock_reserved: false };
          }
          return o;
        });
        tx.set(cfgRef, {
          stockReservations: nextReservations,
          shopifyPendingOrders: nextOrders,
          shopifyConfig: {
            ...(c.shopifyConfig || {}),
            last_reservations_cleanup_at: new Date().toISOString(),
            last_reservations_cleanup_count: expiredCount,
            last_reservations_cleanup_by: authBy,
          },
        }, { merge: true });
      });
    }
  } catch(e){
    res.status(500).json({ ok:false, error: "Cleanup failed: " + (e.message || e) });
    return;
  }

  res.status(200).json({ ok:true, authBy, ...result });
}
