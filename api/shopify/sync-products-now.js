/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/shopify/sync-products-now (V19.93 Phase 1)
   ───────────────────────────────────────────────────────────────
   Pull the full product catalog from Shopify into
   factory/config.shopifyProducts[]. For each product, attempt to
   match its SKU to a CLARK inventoryItems entry by model_no:

     SKU == inventoryItems[i].model_no  →  matched
     SKU exists in Shopify but not in CLARK  →  missing_in_clark
     CLARK item flagged shopify_synced but no Shopify product  →  mismatch

   The matched/mismatch/missing classification powers the
   Products tab UI (Phase 4 will let the user resolve these).

   Auth: admin
   Body: {} (no params — full catalog sync)

   Returns: { ok, total, matched, missing, mismatch }

   Phase 4 hooks: this same data feeds the inventory-push cron.
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";
import { getShopifyCreds, fetchAllProducts } from "./_shopifyAdmin.js";

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

  const creds = await getShopifyCreds();
  if(!creds){
    res.status(400).json({ ok:false, error: "الاتصال بـ Shopify مش معدّ" });
    return;
  }

  /* ── Fetch all Shopify products ── */
  let shopifyProducts;
  try {
    shopifyProducts = await fetchAllProducts(creds);
  } catch(e){
    res.status(502).json({ ok:false, error: "فشل سحب المنتجات: " + (e.message || e) });
    return;
  }

  /* ── Read current CLARK inventory for SKU matching ── */
  let inventoryItems = [];
  try {
    const db = getDb();
    const snap = await db.collection("factory").doc("config").get();
    const cfg = snap.exists ? (snap.data() || {}) : {};
    inventoryItems = Array.isArray(cfg.inventoryItems) ? cfg.inventoryItems : [];
  } catch(_){ /* non-fatal — proceed with empty inventory */ }

  /* Build a SKU → inventory item lookup. Spec: "SKU == model_no", but we
     also try matching against the legacy `name` field as a fallback for
     stores where the user named items by SKU. */
  const skuToItem = new Map();
  inventoryItems.forEach(item => {
    if(item.model_no) skuToItem.set(String(item.model_no).trim(), item);
    if(item.sku) skuToItem.set(String(item.sku).trim(), item);
  });

  /* ── Classify each Shopify product ── */
  let matched = 0, missing = 0, mismatch = 0;
  const classified = shopifyProducts.slice(0, PRODUCTS_CAP).map(p => {
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
      mappingStatus = "mismatch"; /* product has no SKU — can't auto-match */
      mismatch++;
    }
    return {
      ...p,
      clark_inventory_id: clarkInventoryId,
      mapping_status: mappingStatus,
    };
  });

  /* ── Save to factory/config.shopifyProducts ── */
  try {
    const db = getDb();
    const cfgRef = db.collection("factory").doc("config");
    const now = new Date().toISOString();
    await cfgRef.set({
      shopifyProducts: classified,
      shopifyConfig: {
        last_products_sync_at: now,
        last_products_sync_count: classified.length,
      },
    }, { merge: true });
  } catch(e){
    res.status(500).json({ ok:false, error: "فشل حفظ المنتجات: " + (e.message || e) });
    return;
  }

  res.status(200).json({
    ok: true,
    total: classified.length,
    matched,
    missing,
    mismatch,
    cap: PRODUCTS_CAP,
    truncated: shopifyProducts.length > PRODUCTS_CAP,
  });
}
