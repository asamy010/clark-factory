/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/shopify/sync-orders-now (V19.93 Phase 1)
   ───────────────────────────────────────────────────────────────
   Manual trigger to pull recent orders from Shopify into
   factory/config.shopifyPendingOrders. Same logic as the cron
   endpoint at /api/cron/shopify-poll-orders, just authenticated
   via admin Bearer token instead of cron secret.

   Body (optional):
     {
       sinceHours: 168     -- look back N hours (default 168 = 7 days)
                              ignored if last_orders_sync_at is set
       force: false        -- if true, ignore last_orders_sync_at and
                              use sinceHours as the lookback window
     }

   Returns:
     {
       ok: true,
       count: 12,            -- total orders fetched
       new: 8,               -- newly added to CLARK
       updated: 4,           -- existing orders refreshed
       skipped: 0,           -- skipped (e.g. wrong currency)
       lastSyncAt: "..."
     }

   Behavior notes:
   • Local CLARK changes (status, invoice_id, delivered_at) are
     PRESERVED on update — we only refresh Shopify-side fields
     (totals, customer info, fulfillment_status).
   • Pre-existing orders aren't reset to "pending_delivery" if the
     user already marked them delivered/refused locally.
   • Cap = 200 most-recent orders kept in factory/config to stay
     under Firestore's 1MB doc limit. Older orders are dropped from
     the live array (they're still in Shopify; can be re-synced).
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";
import { getShopifyCreds, fetchOrdersSince } from "./_shopifyAdmin.js";
import { createReservationsForOrder } from "./_reservations.js";
import { withProgress } from "../_progressTracker.js";

const ORDERS_CAP = 200;
const DEFAULT_LOOKBACK_HOURS = 168; /* 7 days */

export default async function handler(req, res){
  setCors(res, req);
  if(req.method === "OPTIONS"){ res.status(204).end(); return; }
  if(req.method !== "POST"){
    res.status(405).json({ ok:false, error: "POST فقط" });
    return;
  }

  /* ── Auth ── */
  const auth = await verifyAdminToken(req.headers.authorization);
  if(!auth.ok){
    res.status(auth.status).json({ ok:false, error: auth.error });
    return;
  }

  /* ── Get creds ── */
  const creds = await getShopifyCreds();
  if(!creds){
    res.status(400).json({ ok:false, error: "الاتصال بـ Shopify مش معدّ — روح تاب Connection" });
    return;
  }

  /* ── Compute sinceISO ── */
  const body = (typeof req.body === "string") ? JSON.parse(req.body || "{}") : (req.body || {});
  const force = !!body.force;
  const sinceHours = Math.max(1, Math.min(720, Number(body.sinceHours) || DEFAULT_LOOKBACK_HOURS));

  /* V21.9.4: wrap in withProgress for live overlay tracking */
  return withProgress(req, res, {
    jobId: body.jobId,
    type: "shopify-sync-orders",
    label: "سحب الطلبات الجديدة من Shopify",
    by: auth.email || auth.uid,
  }, async (update) => {
    await update({ message: "قراءة آخر sync timestamp..." });

    let sinceISO;
    let lastSyncAt;
    {
      const db = getDb();
      const cfgRef = db.collection("factory").doc("config");
      const cfgSnap = await cfgRef.get();
      const cfg = cfgSnap.exists ? (cfgSnap.data() || {}) : {};
      lastSyncAt = cfg.shopifyConfig?.last_orders_sync_at || null;
      if(force || !lastSyncAt){
        sinceISO = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString();
      } else {
        sinceISO = new Date(new Date(lastSyncAt).getTime() - 5 * 60 * 1000).toISOString();
      }
    }

    /* ── Fetch from Shopify ── */
    await update({ message: "سحب الطلبات من Shopify API..." });
    const fetchedOrders = await fetchOrdersSince(creds, {
      updatedSince: sinceISO,
      limit: 250,
      status: "any",
    });
    await update({
      progress: fetchedOrders.length,
      total: Math.max(fetchedOrders.length, 1),
      message: `تم سحب ${fetchedOrders.length} طلب · جاري الدمج...`,
    });

    /* ── Merge into factory/config.shopifyPendingOrders ── */
    let counts = { count: 0, new: 0, updated: 0, skipped: 0 };
    {
      const db = getDb();
      const cfgRef = db.collection("factory").doc("config");
      await db.runTransaction(async (tx) => {
      const snap = await tx.get(cfgRef);
      const cfg = snap.exists ? (snap.data() || {}) : {};
      const existing = Array.isArray(cfg.shopifyPendingOrders)
        ? cfg.shopifyPendingOrders : [];
      const existingMap = new Map(existing.map(o => [String(o.shopify_order_id), o]));
      counts.count = fetchedOrders.length;
      /* V19.94 Phase 2: Auto-create stock reservations for new orders.
         We mutate `reservations` array per-order then write the final
         array at the end of the transaction. */
      let reservations = Array.isArray(cfg.stockReservations) ? cfg.stockReservations.slice() : [];
      const ttlDays = Number(cfg.shopifyConfig?.pending_order_timeout_days) || 7;
      const autoReserve = cfg.shopifyConfig?.auto_reserve_stock !== false;
      for(const o of fetchedOrders){
        const id = String(o.shopify_order_id);
        /* Skip non-EGP orders for the MVP (spec edge case #8). User can
           manually re-sync after we add multi-currency support. */
        if(o.currency && o.currency !== "EGP"){
          counts.skipped++;
          continue;
        }
        const prev = existingMap.get(id);
        /* Phase 2: reserve stock for NEW orders that are still pending.
           Skip if the order is already cancelled / refused / delivered to
           avoid useless work (and avoid a reservation that immediately
           gets released by the auto-promote logic below). */
        const willReserve = autoReserve && !prev &&
          o.status === "pending_delivery";
        if(willReserve){
          reservations = createReservationsForOrder(cfg, reservations, o, ttlDays);
        }
        if(prev){
          /* Update — preserve local CLARK state (status mutation by user,
             invoice_id, delivered_at, etc). Only refresh Shopify-side
             fields. */
          const merged = {
            ...prev,
            /* Shopify-side fields refreshed: */
            shopify_order_number: o.shopify_order_number || prev.shopify_order_number,
            shopify_name: o.shopify_name || prev.shopify_name,
            customer_info: o.customer_info,
            line_items: o.line_items,
            subtotal: o.subtotal,
            shipping_fee: o.shipping_fee,
            total: o.total,
            currency: o.currency,
            payment_method: o.payment_method,
            shopify_status_synced: o.shopify_status_synced,
            shopify_updated_at: o.shopify_updated_at,
            last_synced_at: o.last_synced_at,
            /* Local CLARK fields preserved: status, stock_reserved, invoice_id,
               delivered_at, refused_at, refusal_reason, returned_at, etc.
               (already on prev, not overwritten) */
            /* Auto-promote status if Shopify marked fulfilled+paid AND
               the user didn't already set a final state locally. */
            status: ((prev.status === "pending_delivery") &&
                     o.shopify_status_synced.fulfillment_status === "fulfilled" &&
                     o.shopify_status_synced.financial_status === "paid")
                    ? "delivered"
                    : prev.status,
          };
          existingMap.set(id, merged);
          counts.updated++;
        } else {
          /* New — flag stock_reserved if auto_reserve is on */
          existingMap.set(id, {
            ...o,
            stock_reserved: willReserve,
            stock_reservations: willReserve
              ? reservations.filter(r => r.source_ref === id && r.status === "active").map(r => r.id)
              : [],
          });
          counts.new++;
        }
      }
      /* Sort newest first by shopify_created_at, cap to ORDERS_CAP */
      const merged = Array.from(existingMap.values())
        .sort((a, b) => {
          const ta = a.shopify_created_at ? new Date(a.shopify_created_at).getTime() : 0;
          const tb = b.shopify_created_at ? new Date(b.shopify_created_at).getTime() : 0;
          return tb - ta;
        })
        .slice(0, ORDERS_CAP);
      const now = new Date().toISOString();
      tx.set(cfgRef, {
        shopifyPendingOrders: merged,
        stockReservations: reservations,
        shopifyConfig: {
          ...(cfg.shopifyConfig || {}),
          last_orders_sync_at: now,
          last_orders_sync_count: counts.new + counts.updated,
        },
      }, { merge: true });
    });
    }

    return {
      count: counts.count,
      new: counts.new,
      updated: counts.updated,
      skipped: counts.skipped,
      lastSyncAt: new Date().toISOString(),
      message: `تم! ${counts.new} جديد · ${counts.updated} محدّث · ${counts.skipped} skip`,
    };
  });
}
