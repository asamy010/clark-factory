/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/shopify/sync-customers (V20.2 Phase 11)
   ───────────────────────────────────────────────────────────────
   Aggregate customers from existing shopifyPendingOrders into a
   dedicated customers list (factory/config.shopifyCustomers).

   Why aggregate instead of pulling from Shopify /customers.json?
   • The user only wants customers who actually purchased.
   • Phone-based dedup handles the same-customer-multiple-orders case.
   • Free — no extra Shopify API quota usage.

   Body: {} (no params — full re-aggregation)
   Auth: admin

   Returns: {
     ok, total, with_delivered, vip, at_risk,
     created (new), updated (existing-merged)
   }

   Idempotent: preserves user-added fields (tags, notes, accepts_marketing,
   do_not_contact, last_contacted_at, contact_count) on existing customers.
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";
import { aggregateCustomersFromOrders, mergeShopifyCustomers } from "./_customers.js";
import { getShopifyCreds, fetchAllShopifyCustomers } from "./_shopifyAdmin.js";

const CUSTOMERS_CAP = 25000; /* enough for fashion B2C even with mailing-list opt-ins */

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

  /* V20.3: optional body.skipShopifyDirect = true to skip the API call
     (e.g. if user is offline or wants only order-aggregated). */
  const body = (typeof req.body === "string") ? JSON.parse(req.body || "{}") : (req.body || {});
  const skipShopifyDirect = body.skipShopifyDirect === true;

  try {
    /* Step 1: Try to pull from Shopify Customer API (best-effort, outside the tx) */
    let shopifyCustomers = [];
    let shopifyFetchError = null;
    if(!skipShopifyDirect){
      try {
        const creds = await getShopifyCreds();
        if(creds){
          shopifyCustomers = await fetchAllShopifyCustomers(creds);
        } else {
          shopifyFetchError = "Shopify creds مش معدّة";
        }
      } catch(e){
        shopifyFetchError = e.message;
        console.warn("[sync-customers] Shopify direct fetch failed:", e.message);
      }
    }

    /* Step 2: Aggregate from orders + merge Shopify-direct (inside tx) */
    const db = getDb();
    const cfgRef = db.collection("factory").doc("config");
    let stats = {
      total: 0, with_delivered: 0,
      vip: 0, regular: 0, new_: 0, at_risk: 0, inactive: 0, shopify_only: 0,
      created: 0, updated: 0,
      from_shopify: shopifyCustomers.length,
      from_orders: 0,
    };

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(cfgRef);
      const cfg = snap.exists ? (snap.data() || {}) : {};
      const orders = Array.isArray(cfg.shopifyPendingOrders) ? cfg.shopifyPendingOrders : [];
      const existing = Array.isArray(cfg.shopifyCustomers) ? cfg.shopifyCustomers : [];

      /* Order-aggregated (rich CLARK stats) */
      const fromOrders = aggregateCustomersFromOrders(orders, existing);
      stats.from_orders = fromOrders.length;

      /* Merge with Shopify direct */
      const merged = mergeShopifyCustomers(fromOrders, shopifyCustomers, existing);
      const capped = merged.slice(0, CUSTOMERS_CAP);

      const existingIds = new Set(existing.map(c => c.id));
      capped.forEach(c => {
        stats.total++;
        if(c.delivered_count > 0) stats.with_delivered++;
        if(c.tier === "vip") stats.vip++;
        else if(c.tier === "regular") stats.regular++;
        else if(c.tier === "new") stats.new_++;
        else if(c.tier === "at_risk") stats.at_risk++;
        else if(c.tier === "inactive") stats.inactive++;
        else if(c.tier === "shopify_only") stats.shopify_only++;
        if(existingIds.has(c.id)) stats.updated++;
        else stats.created++;
      });

      tx.set(cfgRef, {
        shopifyCustomers: capped,
        shopifyConfig: {
          ...(cfg.shopifyConfig || {}),
          last_customers_sync_at: new Date().toISOString(),
          last_customers_sync_count: capped.length,
          last_customers_sync_shopify_count: shopifyCustomers.length,
          last_customers_sync_shopify_error: shopifyFetchError || null,
        },
      }, { merge: true });
    });

    return res.status(200).json({
      ok: true,
      total: stats.total,
      with_delivered: stats.with_delivered,
      vip: stats.vip,
      regular: stats.regular,
      new: stats.new_,
      at_risk: stats.at_risk,
      inactive: stats.inactive,
      shopify_only: stats.shopify_only,
      created: stats.created,
      updated: stats.updated,
      from_shopify: stats.from_shopify,
      from_orders: stats.from_orders,
      shopify_fetch_error: shopifyFetchError,
    });
  } catch(e){
    return res.status(500).json({ ok:false, error: e.message });
  }
}
