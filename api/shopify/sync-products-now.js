/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/shopify/sync-products-now (V19.93 → V19.99)
   ───────────────────────────────────────────────────────────────
   Pull the full product catalog from Shopify into
   factory/config.shopifyProducts[]. For each product, attempt to
   match its SKU to a CLARK inventoryItems entry by model_no:

     SKU == inventoryItems[i].model_no  →  matched
     SKU exists in Shopify but not in CLARK  →  missing_in_clark
     CLARK item flagged shopify_synced but no Shopify product  →  mismatch

   V19.99 additions:
   • Filters: status, vendor, product_type, published_only, sku_prefix
   • Blacklist: skip products whose shopify_id is in deletedProductIds
   • Preserve user-set flags (shopify_synced, wholesale_only,
     safety_buffer, clark_inventory_id) when the product already
     exists in CLARK — sync only refreshes the Shopify-side fields.

   Auth: admin
   Body: {
     filters?: {
       status?: 'active' | 'draft' | 'archived',
       vendor?: string,
       product_type?: string,
       published_only?: bool,
       sku_prefix?: string
     },
     replaceMode?: 'merge' | 'replace'  // default 'merge' (preserves flags)
   }

   Returns: { ok, total, matched, missing, mismatch, blacklisted }
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";
import { getShopifyCreds, fetchAllProducts } from "./_shopifyAdmin.js";
import {
  readAllShopifyProducts, writeManyShopifyProducts, FLAG_V2192,
} from "./_partitioned.js";
import { withProgress } from "../_progressTracker.js";

const PRODUCTS_CAP = 500; /* same logic as orders cap */

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
  const filters = (body.filters && typeof body.filters === "object") ? body.filters : {};
  const replaceMode = body.replaceMode === "replace" ? "replace" : "merge";

  const creds = await getShopifyCreds();
  if(!creds){
    res.status(400).json({ ok:false, error: "الاتصال بـ Shopify مش معدّ" });
    return;
  }

  /* V21.9.4: wrap in withProgress for live overlay */
  return withProgress(req, res, {
    jobId: body.jobId,
    type: "shopify-sync-products",
    label: "سحب منتجات Shopify",
    by: auth.email || auth.uid,
  }, async (update) => {
    await update({ message: "بدء سحب المنتجات من Shopify..." });

    /* ── Fetch all Shopify products ── */
    const shopifyProducts = await fetchAllProducts(creds);
    await update({
      progress: shopifyProducts.length,
      total: shopifyProducts.length,
      message: `تم سحب ${shopifyProducts.length} منتج · جاري المطابقة...`,
    });

  /* ── Read current CLARK config ── */
  let cfg = {};
  try {
    const db = getDb();
    const snap = await db.collection("factory").doc("config").get();
    cfg = snap.exists ? (snap.data() || {}) : {};
  } catch(_){ /* non-fatal — proceed with empty config */ }

  const inventoryItems = Array.isArray(cfg.inventoryItems) ? cfg.inventoryItems : [];
  /* V21.9.2: read existing products from per-doc collection if migrated,
     else from cfg.shopifyProducts array. */
  const existingProducts = await readAllShopifyProducts(cfg);
  const blacklist = new Set(
    Array.isArray(cfg.shopifyConfig?.deletedProductIds) ? cfg.shopifyConfig.deletedProductIds.map(String) : []
  );
  const existingByShopifyId = new Map(existingProducts.map(p => [String(p.shopify_id), p]));

  /* Build a SKU → inventory item lookup */
  const skuToItem = new Map();
  inventoryItems.forEach(item => {
    if(item.model_no) skuToItem.set(String(item.model_no).trim(), item);
    if(item.sku) skuToItem.set(String(item.sku).trim(), item);
  });

  /* ── Apply filters ── */
  let filtered = shopifyProducts;
  if(filters.status){
    filtered = filtered.filter(p => p.status === filters.status);
  }
  if(filters.vendor){
    const v = String(filters.vendor).toLowerCase();
    filtered = filtered.filter(p => (p.vendor || "").toLowerCase() === v);
  }
  if(filters.product_type){
    const t = String(filters.product_type).toLowerCase();
    filtered = filtered.filter(p => (p.product_type || "").toLowerCase() === t);
  }
  if(filters.published_only){
    filtered = filtered.filter(p => !!p.published_at);
  }
  if(filters.sku_prefix){
    const pre = String(filters.sku_prefix).trim();
    filtered = filtered.filter(p => (p.sku || "").startsWith(pre));
  }

  /* ── Classify + merge with existing user flags ── */
  let matched = 0, missing = 0, mismatch = 0, blacklisted = 0;
  const classified = [];
  for(const p of filtered){
    if(blacklist.has(String(p.shopify_id))){
      blacklisted++;
      continue;
    }
    const sku = p.sku || "";
    const clarkItem = sku ? skuToItem.get(sku) : null;
    let mappingStatus = "missing_in_clark";
    let clarkInventoryId = null;
    if(sku && clarkItem){
      mappingStatus = "matched";
      clarkInventoryId = clarkItem.id;
      matched++;
    } else if(sku){
      mappingStatus = "missing_in_clark";
      missing++;
    } else {
      mappingStatus = "mismatch";
      mismatch++;
    }
    /* V19.99: preserve user-set flags from existing product (merge mode) */
    const existing = existingByShopifyId.get(String(p.shopify_id));
    const userFlags = (replaceMode === "merge" && existing) ? {
      shopify_synced: existing.shopify_synced,
      wholesale_only: existing.wholesale_only,
      safety_buffer: existing.safety_buffer,
      max_shopify_qty: existing.max_shopify_qty,
      auto_disable_at_zero: existing.auto_disable_at_zero,
      /* If user manually mapped to CLARK, preserve that mapping. */
      clark_inventory_id: existing.clark_inventory_id || clarkInventoryId,
      /* If a manual mapping exists, override mapping_status to matched. */
      mapping_status: existing.clark_inventory_id ? "matched" : mappingStatus,
    } : {
      clark_inventory_id: clarkInventoryId,
      mapping_status: mappingStatus,
    };
    classified.push({ ...p, ...userFlags });
  }

  /* In replace mode, kill any existing products NOT in the synced list.
     In merge mode, keep them (but they won't be re-classified this run). */
  let finalProducts;
  if(replaceMode === "replace"){
    finalProducts = classified.slice(0, PRODUCTS_CAP);
  } else {
    /* Merge: classified entries replace matching existing ones; unknown
       existing entries are kept (e.g. manually-added or filtered-out). */
    const classifiedByShopifyId = new Map(classified.map(p => [String(p.shopify_id), p]));
    const merged = [];
    /* First, add all classified (newly-fetched) entries */
    for(const p of classified) merged.push(p);
    /* Then, add existing entries NOT in the new fetch (untouched) */
    for(const existing of existingProducts){
      if(blacklist.has(String(existing.shopify_id))) continue;
      if(!classifiedByShopifyId.has(String(existing.shopify_id))){
        merged.push(existing);
      }
    }
    finalProducts = merged.slice(0, PRODUCTS_CAP);
  }

  /* ── Save ── */
  /* V21.9.2: write per-doc to shopifyProductsDocs collection if migrated,
     else to cfg.shopifyProducts array (legacy). */
  await update({ message: `حفظ ${finalProducts.length} منتج...` });
  {
    const db = getDb();
    const cfgRef = db.collection("factory").doc("config");
    const now = new Date().toISOString();
    /* Always write data — to either per-doc collection or array */
    await writeManyShopifyProducts(cfg, finalProducts);
    /* Always update sync metadata in shopifyConfig (small) */
    await cfgRef.set({
      shopifyConfig: {
        ...(cfg.shopifyConfig || {}),
        last_products_sync_at: now,
        last_products_sync_count: classified.length,
        last_products_sync_filters: filters,
      },
    }, { merge: true });
  }

  return {
    total: classified.length,
    fetched: shopifyProducts.length,
    afterFilters: filtered.length,
    matched,
    missing,
    mismatch,
    blacklisted,
    replaceMode,
    cap: PRODUCTS_CAP,
    truncated: classified.length > PRODUCTS_CAP,
    message: `تم! ${classified.length} منتج · ${matched} مطابق · ${missing} مش موجود في CLARK`,
  };
  });
}
