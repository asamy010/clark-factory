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
import {
  readAllPendingOrders, upsertManyPendingOrders, isPendingOrdersSplit,
} from "./_pendingOrders.js";

/* V21.9.18: pre-V21.9.18 we kept only the most recent ORDERS_CAP=200 orders
   in factory/config because the doc had a 1MB hard limit. Post-V21.9.18
   orders live in shopifyOrdersDays/{date} (per-day docs), so we can drop
   the cap — each day doc carries that day's orders only (~5-80 typical),
   well under 1MB. We still cap legacy mode at 200 for safety. */
const LEGACY_ORDERS_CAP = 200;
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

    /* ── Merge into shopifyPendingOrders (split per-day post-V21.9.18 or
           legacy in-config array pre-V21.9.18). ── */
    let counts = { count: 0, new: 0, updated: 0, skipped: 0 };
    {
      const db = getDb();
      const cfgRef = db.collection("factory").doc("config");

      /* V21.9.18: pre-read all existing pending orders. The helper hides
         the split/legacy distinction — same return shape either way. */
      const cfgSnapForRead = await cfgRef.get();
      const cfgForRead = cfgSnapForRead.exists ? (cfgSnapForRead.data() || {}) : {};
      const ordersSplitActive = isPendingOrdersSplit(cfgForRead);
      const existing = await readAllPendingOrders(cfgForRead);
      const existingMap = new Map(existing.map(o => [String(o.shopify_order_id), o]));

      counts.count = fetchedOrders.length;

      /* Build the merged orders + new reservations array IN MEMORY first.
         We'll commit the reservations + sync metadata in one cfg tx, and
         the orders to their day docs via upsertManyPendingOrders. */
      let reservations = Array.isArray(cfgForRead.stockReservations) ? cfgForRead.stockReservations.slice() : [];
      const ttlDays = Number(cfgForRead.shopifyConfig?.pending_order_timeout_days) || 7;
      const autoReserve = cfgForRead.shopifyConfig?.auto_reserve_stock !== false;
      const ordersToWrite = [];
      for(const o of fetchedOrders){
        const id = String(o.shopify_order_id);
        if(o.currency && o.currency !== "EGP"){
          counts.skipped++;
          continue;
        }
        const prev = existingMap.get(id);
        const willReserve = autoReserve && !prev &&
          o.status === "pending_delivery";
        if(willReserve){
          reservations = createReservationsForOrder(cfgForRead, reservations, o, ttlDays);
        }
        if(prev){
          const merged = {
            ...prev,
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
            status: ((prev.status === "pending_delivery") &&
                     o.shopify_status_synced.fulfillment_status === "fulfilled" &&
                     o.shopify_status_synced.financial_status === "paid")
                    ? "delivered"
                    : prev.status,
          };
          existingMap.set(id, merged);
          ordersToWrite.push(merged);
          counts.updated++;
        } else {
          const fresh = {
            ...o,
            stock_reserved: willReserve,
            stock_reservations: willReserve
              ? reservations.filter(r => r.source_ref === id && r.status === "active").map(r => r.id)
              : [],
          };
          existingMap.set(id, fresh);
          ordersToWrite.push(fresh);
          counts.new++;
        }
      }
      const now = new Date().toISOString();

      if(ordersSplitActive){
        /* V21.9.18: write changed orders to their day docs */
        await upsertManyPendingOrders(cfgForRead, ordersToWrite);
        /* Commit reservations + sync metadata to factory/config. The order
           array is NOT touched here — it lives in shopifyOrdersDays now. */
        await db.runTransaction(async (tx) => {
          tx.set(cfgRef, {
            stockReservations: reservations,
            shopifyConfig: {
              ...(cfgForRead.shopifyConfig || {}),
              last_orders_sync_at: now,
              last_orders_sync_count: counts.new + counts.updated,
            },
          }, { merge: true });
        });
      } else {
        /* Legacy mode: rewrite cfg.shopifyPendingOrders array (with cap) */
        await db.runTransaction(async (tx) => {
          const merged = Array.from(existingMap.values())
            .sort((a, b) => {
              const ta = a.shopify_created_at ? new Date(a.shopify_created_at).getTime() : 0;
              const tb = b.shopify_created_at ? new Date(b.shopify_created_at).getTime() : 0;
              return tb - ta;
            })
            .slice(0, LEGACY_ORDERS_CAP);
          tx.set(cfgRef, {
            shopifyPendingOrders: merged,
            stockReservations: reservations,
            shopifyConfig: {
              ...(cfgForRead.shopifyConfig || {}),
              last_orders_sync_at: now,
              last_orders_sync_count: counts.new + counts.updated,
            },
          }, { merge: true });
        });
      }
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
