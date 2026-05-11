/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/shopify/sync-customers (V20.2 Phase 11
                                              + V21.9.1 Phase 11g)
   ───────────────────────────────────────────────────────────────
   Aggregate customers from existing shopifyPendingOrders into a
   dedicated customers list (factory/config.shopifyCustomers).

   V21.9.1 (Phase 11g): Now ALSO scans shopifyOrdersArchive collection
   so customers from historical orders (after sync-historical-orders)
   get included with full delivered_count, revenue, and tier data.

   Why aggregate instead of pulling from Shopify /customers.json?
   • The user only wants customers who actually purchased.
   • Phone-based dedup handles the same-customer-multiple-orders case.
   • Free — no extra Shopify API quota usage.

   Body (optional): {
     skipShopifyDirect?: boolean,    // skip Shopify Customer API fetch
     skipArchive?: boolean,          // skip scanning shopifyOrdersArchive
   }
   Auth: admin

   Returns: {
     ok, total, with_delivered, vip, at_risk,
     created (new), updated (existing-merged),
     from_orders, from_archive, from_shopify
   }

   Idempotent: preserves user-added fields (tags, notes, accepts_marketing,
   do_not_contact, last_contacted_at, contact_count) on existing customers.
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";
import { aggregateCustomersFromOrders, mergeShopifyCustomers } from "./_customers.js";
import { getShopifyCreds, fetchAllShopifyCustomers } from "./_shopifyAdmin.js";
import {
  readAllShopifyCustomers, writeManyShopifyCustomers, FLAG_V2192,
} from "./_partitioned.js";
import { readAllPendingOrders } from "./_pendingOrders.js";
import { withProgress } from "../_progressTracker.js";

const CUSTOMERS_CAP = 25000; /* enough for fashion B2C even with mailing-list opt-ins */
const ARCHIVE_COLLECTION = "shopifyOrdersArchive";

/* V21.9.1: Read all archived orders from shopifyOrdersArchive collection.
   Each doc holds up to ~600 orders (split per yearmonth). We aggregate
   everything into a single flat array. */
async function readArchivedOrders(db){
  try {
    const snap = await db.collection(ARCHIVE_COLLECTION).get();
    const all = [];
    snap.forEach(d => {
      const data = d.data() || {};
      const arr = Array.isArray(data.orders) ? data.orders : [];
      for(const o of arr) all.push(o);
    });
    return all;
  } catch(e){
    console.warn("[sync-customers] failed to read archive:", e.message);
    return [];
  }
}

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
     (e.g. if user is offline or wants only order-aggregated).
     V21.9.1: optional body.skipArchive = true to skip historical archive scan. */
  const body = (typeof req.body === "string") ? JSON.parse(req.body || "{}") : (req.body || {});
  const skipShopifyDirect = body.skipShopifyDirect === true;
  const skipArchive = body.skipArchive === true;

  /* V21.9.4: wrap in withProgress overlay */
  return withProgress(req, res, {
    jobId: body.jobId,
    type: "shopify-sync-customers",
    label: "تجميع عملاء Shopify",
    by: auth.email || auth.uid,
  }, async (update) => {
    /* Step 1: Try to pull from Shopify Customer API (best-effort, outside the tx) */
    await update({ message: "سحب العملاء من Shopify Customer API..." });
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
    await update({ message: `تم سحب ${shopifyCustomers.length} عميل من Shopify · جاري قراءة الأرشيف...` });

    /* V21.9.1 Step 1.5: Read archived orders (read-only, outside the tx).
       Could be 1000s of orders → big payload. We dedup later by shopify_order_id. */
    const db = getDb();
    let archivedOrders = [];
    if(!skipArchive){
      archivedOrders = await readArchivedOrders(db);
    }

    /* Step 2: Aggregate from orders + merge Shopify-direct (inside tx) */
    const cfgRef = db.collection("factory").doc("config");
    let stats = {
      total: 0, with_delivered: 0,
      vip: 0, regular: 0, new_: 0, at_risk: 0, inactive: 0, shopify_only: 0,
      created: 0, updated: 0,
      from_shopify: shopifyCustomers.length,
      from_orders: 0,
      from_archive: archivedOrders.length,
    };

    /* V21.9.2: Read existing customers from per-doc collection if migrated.
       This MUST happen before the transaction because Firestore Admin SDK
       transactions require all reads to be inside the tx OR passed in. */
    const cfgSnapForRead = await cfgRef.get();
    const cfgForRead = cfgSnapForRead.exists ? (cfgSnapForRead.data() || {}) : {};
    const existingCustomers = await readAllShopifyCustomers(cfgForRead);
    const isPartitioned = !!cfgForRead[FLAG_V2192];

    /* V21.9.18: pre-tx read live orders via the split-aware helper.
       Pre-V21.9.18 we read `cfg.shopifyPendingOrders` directly inside the
       transaction. After the V21.9.18 split migration that array is
       stripped from factory/config — entries live in shopifyOrdersDays/*.
       The helper returns the flat array regardless of split state. */
    const liveOrders = await readAllPendingOrders(cfgForRead);

    let cappedResult = null;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(cfgRef);
      const cfg = snap.exists ? (snap.data() || {}) : {};
      const existing = existingCustomers; /* read above, outside tx */

      /* V21.9.1: Combine live orders + archived orders, dedup by shopify_order_id.
         Live orders win (they have most-recent CLARK status mutations like
         delivered_at, refused_at, invoice_id that the archive doesn't have). */
      const seenIds = new Set();
      const combinedOrders = [];
      for(const o of liveOrders){
        const id = String(o.shopify_order_id || "");
        if(id && !seenIds.has(id)){ seenIds.add(id); combinedOrders.push(o); }
      }
      for(const o of archivedOrders){
        const id = String(o.shopify_order_id || "");
        if(id && !seenIds.has(id)){ seenIds.add(id); combinedOrders.push(o); }
      }

      /* Order-aggregated (rich CLARK stats) — now uses combined dataset */
      const fromOrders = aggregateCustomersFromOrders(combinedOrders, existing);
      stats.from_orders = fromOrders.length;
      stats.combined_order_count = combinedOrders.length;

      /* Merge with Shopify direct */
      const merged = mergeShopifyCustomers(fromOrders, shopifyCustomers, existing);
      const capped = merged.slice(0, CUSTOMERS_CAP);
      cappedResult = capped;

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

      /* V21.9.2: write metadata to factory/config; the actual customers array
         goes either to factory/config.shopifyCustomers (legacy) or to
         shopifyCustomersDocs (post-migration). For post-migration we do the
         per-doc writes OUTSIDE the transaction (after it commits) to avoid
         hitting the 500-write tx limit.

         V21.9.11 ROOT-CAUSE FIX:
         Pre-V21.9.11 we wrote `last_customers_sync_at` + counts INSIDE the
         transaction, then did the per-doc writes OUTSIDE. If the per-doc
         loop crashed or timed out partway, the metadata would lie:
           "last_customers_sync_count: 1500" but only ~700 docs actually
           landed in shopifyCustomersDocs.
         Fix: write only `last_customers_sync_started_at` inside the tx; the
         authoritative `last_customers_sync_at` + counts are written AFTER
         the per-doc writes succeed (post-tx, below). */
      const baseUpdate = {
        shopifyConfig: {
          ...(cfg.shopifyConfig || {}),
          last_customers_sync_started_at: new Date().toISOString(),
          last_customers_sync_shopify_error: shopifyFetchError || null,
        },
      };
      if(!isPartitioned){
        /* Legacy: keep array in config — and DO mark sync complete inline,
           since the array write is itself inside the tx (atomic). */
        baseUpdate.shopifyCustomers = capped;
        baseUpdate.shopifyConfig.last_customers_sync_at = new Date().toISOString();
        baseUpdate.shopifyConfig.last_customers_sync_count = capped.length;
        baseUpdate.shopifyConfig.last_customers_sync_shopify_count = shopifyCustomers.length;
        baseUpdate.shopifyConfig.last_customers_sync_archive_count = archivedOrders.length;
        baseUpdate.shopifyConfig.last_customers_sync_combined_orders = stats.combined_order_count || 0;
      }
      tx.set(cfgRef, baseUpdate, { merge: true });
    });

    /* V21.9.2: post-migration, write per-doc OUTSIDE the tx.
       V21.9.11: only mark sync complete (with authoritative counts) AFTER
       the per-doc writes succeed. If writeManyShopifyCustomers throws, the
       outer catch in withProgress fires error status — so the metadata stays
       at "last_customers_sync_started_at" (caller can detect partial state).
       Uses dot-path update() so we don't have to re-fetch + re-spread
       shopifyConfig (which would race with concurrent edits to other
       shopifyConfig fields like store_url, access_token, etc.). */
    if(isPartitioned && cappedResult){
      await update({
        message: `حفظ ${cappedResult.length} عميل (per-doc)...`,
        progress: 0,
        total: cappedResult.length,
      });
      await writeManyShopifyCustomers({ [FLAG_V2192]: true }, cappedResult);
      /* Now mark sync complete with authoritative counts */
      await cfgRef.update({
        "shopifyConfig.last_customers_sync_at": new Date().toISOString(),
        "shopifyConfig.last_customers_sync_count": cappedResult.length,
        "shopifyConfig.last_customers_sync_shopify_count": shopifyCustomers.length,
        "shopifyConfig.last_customers_sync_archive_count": archivedOrders.length,
        "shopifyConfig.last_customers_sync_combined_orders": stats.combined_order_count || 0,
      });
    }

    return {
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
      from_archive: stats.from_archive,
      combined_order_count: stats.combined_order_count || 0,
      shopify_fetch_error: shopifyFetchError,
      message: `تم! ${stats.total} عميل · ${stats.with_delivered} اشتروا · 👑 ${stats.vip} VIP`,
    };
  });
}

