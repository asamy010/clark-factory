/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/shopify/push-product-from-clark (V21.0 Phase 10)
   ───────────────────────────────────────────────────────────────
   Push a CLARK order/model to Shopify as a full product:
   • Variants matrix (color × size) from a chosen fabric
   • Multiple images uploaded by URL (Firebase Storage)
   • Description (markdown → HTML)
   • Vendor, product_type, tags
   • Per-variant inventory from CLARK's stock matrix

   Body: {
     orderId: string,
     // Optional overrides — these can be saved to order.shopify_meta
     // OR passed inline. If both, body wins.
     description?: string,
     images?: [{ url, alt?, position? }],
     colorSourceFabric?: "A"|"B"|...,
     skuPattern?: string,
     vendor?: string,
     product_type?: string,
     tags?: string,
     status?: "active"|"draft"|"archived",
     // Variants stock override:
     stockMatrix?: { [color]: { [size]: qty } },
     // If shopify_meta.shopify_product_id exists → update, else create
     mode?: "auto" | "create_only" | "update_only"
   }

   Auth: admin

   Returns: {
     ok, action: "created"|"updated",
     shopify_product_id, shopify_handle,
     variants_count, images_count, errors: [...]
   }

   Idempotency: if order.shopify_meta.shopify_product_id is already set,
   we UPDATE that product instead of creating a duplicate.
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";
import {
  getShopifyCreds,
  fetchPrimaryLocation,
} from "./_shopifyAdmin.js";
import {
  buildVariantMatrix,
  descriptionToHtml,
  pushProductToShopify,
  uploadProductImageBySrc,
  setVariantInventoryLevels,
} from "./_productPush.js";

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

  const body = (typeof req.body === "string") ? JSON.parse(req.body || "{}") : (req.body || {});
  const orderId = String(body.orderId || "").trim();
  if(!orderId){
    return res.status(400).json({ ok:false, error: "orderId مطلوب" });
  }

  /* ── Get creds ── */
  const creds = await getShopifyCreds();
  if(!creds){
    return res.status(400).json({ ok:false, error: "الاتصال بـ Shopify مش معدّ" });
  }

  /* ── Read CLARK order ── */
  let order, cfg;
  try {
    const db = getDb();
    const snap = await db.collection("factory").doc("config").get();
    cfg = snap.exists ? (snap.data() || {}) : {};
    const orders = Array.isArray(cfg.orders) ? cfg.orders : [];
    order = orders.find(o => String(o.id) === orderId);
    if(!order){
      return res.status(404).json({ ok:false, error: "الموديل مش موجود في CLARK orders" });
    }
  } catch(e){
    return res.status(500).json({ ok:false, error: "Read failed: " + e.message });
  }

  /* ── Resolve effective settings (body wins, then order.shopify_meta defaults) ── */
  const meta = order.shopify_meta || {};
  const description = body.description != null ? body.description : (meta.description || "");
  const images = Array.isArray(body.images) ? body.images : (Array.isArray(meta.images) ? meta.images : []);
  const colorSourceFabric = body.colorSourceFabric || meta.color_source_fabric || "A";
  const skuPattern = body.skuPattern || meta.sku_pattern || "{modelNo}-{color}-{size}";
  const vendor = body.vendor || meta.vendor || cfg.shopifyConfig?.shop_name || "CLARK Store";
  const productType = body.product_type || meta.product_type || order.garmentType || "";
  const tags = body.tags || meta.tags || "";
  const status = body.status || meta.status || "active";
  const stockMatrix = body.stockMatrix || meta.stock_matrix || {};
  const mode = body.mode || "auto";

  /* ── Build variants matrix ── */
  const matrix = buildVariantMatrix(order, {
    colorSourceFabric,
    skuPattern,
    sellPrice: order.sellPrice,
    stockMatrix,
  });

  if(matrix.count === 0){
    return res.status(400).json({ ok:false, error: "مفيش variants للـ push (مفيش colors ولا sizes)" });
  }

  /* ── Build product payload for Shopify ── */
  const title = (order.modelNo ? order.modelNo : "")
    + (order.modelDesc ? (order.modelNo ? " — " : "") + order.modelDesc : "");
  const payload = {
    title: title.trim() || "Untitled",
    body_html: descriptionToHtml(description),
    vendor,
    product_type: productType,
    tags: typeof tags === "string" ? tags : (Array.isArray(tags) ? tags.join(", ") : ""),
    status,
    options: matrix.options.length > 0 ? matrix.options.map(o => ({ name: o.name })) : [{ name: "Title" }],
    variants: matrix.variants,
  };

  /* ── Decide create vs update ── */
  const existingShopifyId = meta.shopify_product_id;
  if(mode === "create_only" && existingShopifyId){
    return res.status(400).json({ ok:false, error: "الموديل عنده Shopify product بالفعل (create_only mode)" });
  }
  if(mode === "update_only" && !existingShopifyId){
    return res.status(400).json({ ok:false, error: "الموديل ما اتـ push-ـش قبل كده (update_only mode)" });
  }

  /* ── Push the product (create or update) ── */
  let pushResult;
  try {
    pushResult = await pushProductToShopify(creds, payload, existingShopifyId);
  } catch(e){
    return res.status(502).json({ ok:false, error: "Shopify push failed: " + (e.message || e) });
  }
  const shopifyProduct = pushResult.product;
  if(!shopifyProduct){
    return res.status(502).json({ ok:false, error: "Shopify ردّ بدون product" });
  }

  const errors = [];

  /* ── Upload images (if create) or sync (if update + new images) ── */
  let imagesUploaded = 0;
  if(images.length > 0){
    /* On update, we don't have a clean "diff" — so for simplicity we
       only upload images that don't already match an existing src.
       Shopify deduplicates URL src matches. */
    const existingImageSrcs = new Set((shopifyProduct.images || []).map(img => img.src));
    for(let i = 0; i < images.length; i++){
      const img = images[i];
      if(!img.url) continue;
      if(existingImageSrcs.has(img.url)) continue; /* skip duplicates */
      try {
        await uploadProductImageBySrc(creds, shopifyProduct.id, {
          url: img.url,
          alt: img.alt || (order.modelNo + " - " + (i + 1)),
          position: img.position || (i + 1),
        });
        imagesUploaded++;
      } catch(e){
        errors.push({ stage: "image", index: i, error: e.message });
      }
    }
  }

  /* ── Set per-variant inventory levels ── */
  let inventoryResults = [];
  try {
    const location = await fetchPrimaryLocation(creds);
    if(location && Array.isArray(shopifyProduct.variants)){
      /* Map variants from Shopify back to CLARK's matrix entries by option1/option2.
         We have inventory_item_id from Shopify but need to know which CLARK qty
         corresponds. */
      const enrichedVariants = shopifyProduct.variants.map((sv, i) => ({
        ...sv,
        inventory_quantity: matrix.variants[i]?.inventory_quantity || 0,
      }));
      inventoryResults = await setVariantInventoryLevels(creds, shopifyProduct.id, enrichedVariants, location.id);
      const failed = inventoryResults.filter(r => !r.ok);
      if(failed.length > 0){
        errors.push({ stage: "inventory", failed: failed.length });
      }
    }
  } catch(e){
    errors.push({ stage: "inventory", error: e.message });
  }

  /* ── Save back to CLARK order.shopify_meta ── */
  try {
    const db = getDb();
    const cfgRef = db.collection("factory").doc("config");
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(cfgRef);
      const fresh = snap.exists ? (snap.data() || {}) : {};
      const orders = Array.isArray(fresh.orders) ? fresh.orders.slice() : [];
      const idx = orders.findIndex(o => String(o.id) === orderId);
      if(idx < 0) return;
      const o = { ...orders[idx] };
      o.shopify_meta = {
        ...(o.shopify_meta || {}),
        shopify_product_id: String(shopifyProduct.id),
        shopify_handle: shopifyProduct.handle || "",
        shopify_title: shopifyProduct.title || "",
        push_status: "synced",
        last_pushed_at: new Date().toISOString(),
        last_pushed_by: auth.email || auth.uid,
        last_push_action: pushResult.action,
        /* Save the settings used for this push so re-syncs are stable */
        description,
        images,
        color_source_fabric: colorSourceFabric,
        sku_pattern: skuPattern,
        vendor,
        product_type: productType,
        tags,
        status,
        variants_count: matrix.count,
      };
      orders[idx] = o;
      tx.set(cfgRef, { orders }, { merge: true });
    });
  } catch(e){
    errors.push({ stage: "save_meta", error: e.message });
  }

  return res.status(200).json({
    ok: true,
    action: pushResult.action,
    shopify_product_id: String(shopifyProduct.id),
    shopify_handle: shopifyProduct.handle || "",
    shopify_admin_url: creds.storeUrl
      ? `https://${creds.storeUrl}/admin/products/${shopifyProduct.id}`
      : null,
    variants_count: matrix.count,
    images_uploaded: imagesUploaded,
    errors,
  });
}
