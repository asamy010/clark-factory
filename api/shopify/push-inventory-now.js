/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/shopify/push-inventory-now (V19.96 Phase 4)
   ───────────────────────────────────────────────────────────────
   Push CLARK's computed available stock to Shopify for every
   matched product. CLARK is the source of truth — Shopify's number
   gets overwritten if it differs.

   Available formula (per SKU):
     available = max(0, inventoryItems.stock - active_reservations - safety_buffer)

   Body: {
     dryRun?: false   -- if true, compute deltas but don't push
     skus?: ["SKU-A"] -- restrict to specific SKUs (else: all matched)
   }
   Auth: admin

   Returns: {
     ok, total, pushed, skipped, errors,
     details: [{ sku, available, prev, delta, status, error? }]
   }

   Rate limiting: 550ms between calls (Shopify Basic 2 req/sec).
   For 100 products, this means ~55s sequential — fine for manual
   sync. The cron variant (cron/shopify-push-inventory) does the
   same but in chunks.
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";
import {
  getShopifyCreds,
  fetchPrimaryLocation,
  setInventoryLevel,
  computeAvailableForSku,
} from "./_shopifyAdmin.js";

const MAX_PUSH_PER_RUN = 250; /* hard cap — protects against runaway loops */

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
  const dryRun = !!body.dryRun;
  const skuFilter = Array.isArray(body.skus) ? new Set(body.skus.map(s => String(s).trim())) : null;

  const creds = await getShopifyCreds();
  if(!creds){
    res.status(400).json({ ok:false, error: "الاتصال بـ Shopify مش معدّ" });
    return;
  }

  /* ── Read CLARK config + Shopify products ── */
  let cfg;
  try {
    const db = getDb();
    const snap = await db.collection("factory").doc("config").get();
    cfg = snap.exists ? (snap.data() || {}) : {};
  } catch(e){
    res.status(500).json({ ok:false, error: "فشل قراءة الـ config: " + e.message });
    return;
  }

  const shopifyProducts = Array.isArray(cfg.shopifyProducts) ? cfg.shopifyProducts : [];
  if(shopifyProducts.length === 0){
    res.status(400).json({ ok:false, error: "مفيش منتجات Shopify محفوظة. اعمل sync products الأول." });
    return;
  }

  /* ── Get primary location ── */
  const location = await fetchPrimaryLocation(creds);
  if(!location){
    res.status(502).json({ ok:false, error: "تعذر جلب الـ location من Shopify" });
    return;
  }

  /* ── Walk products, compute deltas, push ── */
  const details = [];
  let pushed = 0, skipped = 0, errors = 0;

  /* Build the list of (product, variant) tuples we want to push.
     A product with multiple variants pushes one inventory level per
     variant (same SKU = same model_no in CLARK). */
  const pushTargets = [];
  for(const p of shopifyProducts){
    /* V19.99: skip wholesale-only products explicitly */
    if(p.wholesale_only === true){
      skipped++;
      details.push({ sku: p.sku || "(no-sku)", skip_reason: "wholesale_only", status: "skip" });
      continue;
    }
    /* Only push if the product is shopify_synced (default true) */
    if(p.shopify_synced === false){ skipped++; continue; }
    /* Only push matched products */
    if(p.mapping_status !== "matched"){
      skipped++;
      details.push({
        sku: p.sku || "(no-sku)",
        skip_reason: "unmatched_in_clark",
        status: "skip",
      });
      continue;
    }
    if(skuFilter && !skuFilter.has(String(p.sku || "").trim())){
      skipped++;
      continue;
    }
    /* Each variant has its own inventory_item_id but shares the SKU.
       For the MVP we push the SAME computed qty to all variants of
       a product. Phase 5 can split by variant if needed. */
    const variants = Array.isArray(p.variants) ? p.variants : [];
    if(variants.length === 0){
      skipped++;
      details.push({ sku: p.sku, skip_reason: "no_variants", status: "skip" });
      continue;
    }
    for(const v of variants){
      if(!v.inventory_item_id){ skipped++; continue; }
      pushTargets.push({ product: p, variant: v });
    }
  }

  if(pushTargets.length === 0){
    res.status(200).json({
      ok: true,
      message: "مفيش منتجات تـ push",
      total: shopifyProducts.length,
      pushed: 0,
      skipped,
      errors: 0,
      details,
    });
    return;
  }

  /* Cap to protect against runaway loops */
  const limited = pushTargets.slice(0, MAX_PUSH_PER_RUN);
  const truncated = pushTargets.length > MAX_PUSH_PER_RUN;

  for(const { product, variant } of limited){
    const sku = variant.sku || product.sku || "";
    const computed = computeAvailableForSku(cfg, sku, product.safety_buffer);
    const desired = computed.available;
    const prev = Number(variant.inventory_quantity) || 0;
    const delta = desired - prev;

    if(delta === 0){
      details.push({
        sku, available: desired, prev, delta: 0,
        physical: computed.physical, reserved: computed.reserved, buffer: computed.buffer,
        status: "no_change",
      });
      continue;
    }

    if(dryRun){
      details.push({
        sku, available: desired, prev, delta,
        physical: computed.physical, reserved: computed.reserved, buffer: computed.buffer,
        status: "would_push",
      });
      continue;
    }

    try {
      await setInventoryLevel(creds, variant.inventory_item_id, location.id, desired);
      pushed++;
      details.push({
        sku, available: desired, prev, delta,
        physical: computed.physical, reserved: computed.reserved, buffer: computed.buffer,
        status: "pushed",
      });
    } catch(e){
      errors++;
      details.push({
        sku, available: desired, prev, delta,
        status: "error",
        error: e.message || String(e),
      });
    }
  }

  /* ── Update last-push timestamp + cached qty in shopifyProducts ── */
  try {
    const db = getDb();
    const cfgRef = db.collection("factory").doc("config");
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(cfgRef);
      const fresh = snap.exists ? (snap.data() || {}) : {};
      const now = new Date().toISOString();
      /* Update inventory_quantity on the product variants we just pushed */
      let products = Array.isArray(fresh.shopifyProducts) ? fresh.shopifyProducts : [];
      const productMap = new Map(products.map(p => [String(p.shopify_id), p]));
      for(const d of details){
        if(d.status !== "pushed") continue;
        /* Find the product/variant — match on SKU */
        for(const p of products){
          const variants = Array.isArray(p.variants) ? p.variants : [];
          const v = variants.find(vv => vv.sku === d.sku);
          if(v){
            v.inventory_quantity = d.available;
            p.last_synced_at = now;
            break;
          }
        }
      }
      tx.set(cfgRef, {
        shopifyProducts: products,
        shopifyConfig: {
          ...(fresh.shopifyConfig || {}),
          last_inventory_push_at: now,
          last_inventory_push_count: pushed,
        },
      }, { merge: true });
    });
  } catch(_){ /* non-fatal */ }

  res.status(200).json({
    ok: true,
    location,
    total: shopifyProducts.length,
    targets: pushTargets.length,
    pushed,
    skipped,
    errors,
    truncated,
    dryRun,
    details: details.slice(0, 100), /* cap for response size */
  });
}
