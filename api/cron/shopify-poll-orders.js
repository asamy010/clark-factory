/* ═══════════════════════════════════════════════════════════════
   CLARK — POST/GET /api/cron/shopify-poll-orders (V19.93 Phase 1)
   ───────────────────────────────────────────────────────────────
   Vercel cron entry point. Same logic as /api/shopify/sync-orders-now
   but auth'd via cron secret (Vercel automatic) or Authorization
   header (manual hit).

   Configured in vercel.json:
     "schedule": "every 5 min" — i.e. cron expression "X/5 X X X X" (X=*).
     The literal "* / 5 * * * *" can't be written inside a JS block comment.

   Auth strategies (any one passes):
     1. Vercel cron header: x-vercel-cron-secret matches CRON_SECRET
     2. Authorization: Bearer <CRON_SECRET>
     3. Authorization: Bearer <admin Firebase ID token> (manual hit)

   This dual auth lets you trigger manually for debugging without
   waiting for cron.

   ═══════════════════════════════════════════════════════════════
   V21.9.20 ROOT-CAUSE FIX: pre-V21.9.20 this cron re-created the
   legacy `cfg.shopifyPendingOrders` array EVERY 5 MINUTES, even
   after V21.9.18 daily-split migration completed. The migration
   would run, strip the array, set `_splitDaysV2199Done=true` —
   then this cron would tx.set(cfgRef, { shopifyPendingOrders: ... })
   and re-bloat factory/config. The user reported "the split
   didn't happen" because no matter how many times they refreshed,
   within 5 minutes the array would be back.

   Fix: route through _pendingOrders.js helper. Post-migration it
   writes to shopifyOrdersDays day docs; pre-migration it writes
   to the legacy array (back-compat).
   ═══════════════════════════════════════════════════════════════ */

import { getDb, verifyAdminToken } from "../_firebase.js";
import { getShopifyCreds, fetchOrdersSince } from "../shopify/_shopifyAdmin.js";
import { createReservationsForOrder } from "../shopify/_reservations.js";
import {
  readAllPendingOrders, upsertManyPendingOrders, isPendingOrdersSplit,
} from "../shopify/_pendingOrders.js";

/* V21.9.18: legacy mode keeps the 200 cap to stay under 1 MB doc limit.
   Post-migration each day doc is independent — no cap needed. */
const LEGACY_ORDERS_CAP = 200;
const DEFAULT_LOOKBACK_HOURS = 168;

function isAuthorizedCron(req){
  const secret = (process.env.CRON_SECRET || "").trim();
  if(!secret) return false;
  const headerSecret = req.headers["x-vercel-cron-secret"] || "";
  if(headerSecret && headerSecret === secret) return true;
  const authz = String(req.headers.authorization || "").trim();
  if(authz === "Bearer " + secret) return true;
  return false;
}

export default async function handler(req, res){
  /* Allow both GET (Vercel cron uses GET) and POST */
  if(req.method !== "GET" && req.method !== "POST"){
    res.status(405).json({ ok:false, error: "Method not allowed" });
    return;
  }

  /* ── Auth: cron secret OR admin token ── */
  let authBy = null;
  if(isAuthorizedCron(req)){
    authBy = "cron";
  } else {
    const a = await verifyAdminToken(req.headers.authorization);
    if(a.ok){
      authBy = "admin:" + (a.email || a.uid);
    }
  }
  if(!authBy){
    res.status(401).json({ ok:false, error: "Unauthorized — pass CRON_SECRET or admin Bearer token" });
    return;
  }

  /* ── Get creds ── */
  const creds = await getShopifyCreds();
  if(!creds){
    /* Don't error loudly — just skip (cron runs even when not configured) */
    res.status(200).json({ ok:true, skipped: "shopify not configured", authBy });
    return;
  }

  /* ── Compute since timestamp ── */
  let sinceISO;
  let cfgForRead;
  try {
    const db = getDb();
    const cfgSnap = await db.collection("factory").doc("config").get();
    cfgForRead = cfgSnap.exists ? (cfgSnap.data() || {}) : {};
    const lastSync = cfgForRead.shopifyConfig?.last_orders_sync_at;
    if(lastSync){
      sinceISO = new Date(new Date(lastSync).getTime() - 5 * 60 * 1000).toISOString();
    } else {
      sinceISO = new Date(Date.now() - DEFAULT_LOOKBACK_HOURS * 3600 * 1000).toISOString();
    }
  } catch(e){
    res.status(500).json({ ok:false, error: "Read config failed: " + e.message });
    return;
  }

  /* ── Fetch orders ── */
  let fetched;
  try {
    fetched = await fetchOrdersSince(creds, { updatedSince: sinceISO, limit: 250, status: "any" });
  } catch(e){
    res.status(502).json({ ok:false, error: "Shopify fetch failed: " + (e.message || e) });
    return;
  }

  /* ── Merge + save — V21.9.20: split-aware ── */
  let counts = { count: fetched.length, new: 0, updated: 0, skipped: 0 };
  try {
    const db = getDb();
    const cfgRef = db.collection("factory").doc("config");

    /* V21.9.20: read existing pending orders via helper — works regardless
       of whether the daily split is active. */
    const ordersSplitActive = isPendingOrdersSplit(cfgForRead);
    const existing = await readAllPendingOrders(cfgForRead);
    const existingMap = new Map(existing.map(o => [String(o.shopify_order_id), o]));

    let reservations = Array.isArray(cfgForRead.stockReservations)
      ? cfgForRead.stockReservations.slice() : [];
    const ttlDays = Number(cfgForRead.shopifyConfig?.pending_order_timeout_days) || 7;
    const autoReserve = cfgForRead.shopifyConfig?.auto_reserve_stock !== false;
    const ordersToWrite = [];

    for(const o of fetched){
      const id = String(o.shopify_order_id);
      if(o.currency && o.currency !== "EGP"){ counts.skipped++; continue; }
      const prev = existingMap.get(id);
      const willReserve = autoReserve && !prev && o.status === "pending_delivery";
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
      /* V21.9.20: write only changed orders to their day docs. The legacy
         shopifyPendingOrders field stays absent from factory/config. */
      await upsertManyPendingOrders(cfgForRead, ordersToWrite);
      /* Commit reservations + sync metadata to factory/config — NEVER touch
         shopifyPendingOrders here, that's what triggered the bloat regression. */
      await db.runTransaction(async (tx) => {
        tx.set(cfgRef, {
          stockReservations: reservations,
          shopifyConfig: {
            ...(cfgForRead.shopifyConfig || {}),
            last_orders_sync_at: now,
            last_orders_sync_count: counts.new + counts.updated,
            last_orders_sync_by: authBy,
          },
        }, { merge: true });
      });
    } else {
      /* Legacy mode (pre-migration): same behavior as before — cap at 200. */
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
            last_orders_sync_by: authBy,
          },
        }, { merge: true });
      });
    }
  } catch(e){
    res.status(500).json({ ok:false, error: "Save failed: " + (e.message || e) });
    return;
  }

  res.status(200).json({ ok:true, authBy, splitActive: isPendingOrdersSplit(cfgForRead), ...counts });
}
