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
import { aggregateCustomersFromOrders } from "./_customers.js";

const CUSTOMERS_CAP = 5000; /* well above realistic catalog for fashion B2C */

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

  try {
    const db = getDb();
    const cfgRef = db.collection("factory").doc("config");
    let stats = { total: 0, with_delivered: 0, vip: 0, regular: 0, new_: 0, at_risk: 0, inactive: 0, created: 0, updated: 0 };

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(cfgRef);
      const cfg = snap.exists ? (snap.data() || {}) : {};
      const orders = Array.isArray(cfg.shopifyPendingOrders) ? cfg.shopifyPendingOrders : [];
      const existing = Array.isArray(cfg.shopifyCustomers) ? cfg.shopifyCustomers : [];

      const aggregated = aggregateCustomersFromOrders(orders, existing);
      const capped = aggregated.slice(0, CUSTOMERS_CAP);
      const existingIds = new Set(existing.map(c => c.id));
      capped.forEach(c => {
        stats.total++;
        if(c.delivered_count > 0) stats.with_delivered++;
        if(c.tier === "vip") stats.vip++;
        else if(c.tier === "regular") stats.regular++;
        else if(c.tier === "new") stats.new_++;
        else if(c.tier === "at_risk") stats.at_risk++;
        else if(c.tier === "inactive") stats.inactive++;
        if(existingIds.has(c.id)) stats.updated++;
        else stats.created++;
      });

      tx.set(cfgRef, {
        shopifyCustomers: capped,
        shopifyConfig: {
          ...(cfg.shopifyConfig || {}),
          last_customers_sync_at: new Date().toISOString(),
          last_customers_sync_count: capped.length,
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
      created: stats.created,
      updated: stats.updated,
    });
  } catch(e){
    return res.status(500).json({ ok:false, error: e.message });
  }
}
