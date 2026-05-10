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

  /* ── Read CLARK order ──
     V21.9.3 fix: orders live in `seasons/{activeSeason}/orders` subcollection,
     NOT in `factory/config.orders`. The previous code always returned 404
     because cfg.orders was empty in this schema.
     We find the order across all seasons (no need to know the active season
     up front, and orders may be linked across seasons). */
  let order, cfg;
  try {
    const db = getDb();
    const snap = await db.collection("factory").doc("config").get();
    cfg = snap.exists ? (snap.data() || {}) : {};

    /* Strategy:
       1. Try active season first (most common case)
       2. If not found, scan all seasons */
    const activeSeason = cfg.activeSeason || "WS26";
    /* Try: query by `id == orderId` in active season */
    let orderSnap = await db.collection("seasons").doc(activeSeason)
      .collection("orders").where("id", "==", orderId).limit(1).get();
    if(orderSnap.empty){
      /* Try numeric id */
      const numId = Number(orderId);
      if(Number.isFinite(numId)){
        orderSnap = await db.collection("seasons").doc(activeSeason)
          .collection("orders").where("id", "==", numId).limit(1).get();
      }
    }
    if(orderSnap.empty){
      /* Fallback: scan other seasons */
      const seasonsSnap = await db.collection("seasons").listDocuments();
      for(const seasonRef of seasonsSnap){
        if(seasonRef.id === activeSeason) continue;
        const ss = await seasonRef.collection("orders").where("id", "==", orderId).limit(1).get();
        if(!ss.empty){ orderSnap = ss; break; }
        /* Also try numeric */
        const numId = Number(orderId);
        if(Number.isFinite(numId)){
          const ssN = await seasonRef.collection("orders").where("id", "==", numId).limit(1).get();
          if(!ssN.empty){ orderSnap = ssN; break; }
        }
      }
    }
    if(orderSnap.empty){
      return res.status(404).json({
        ok:false,
        error: "الموديل مش موجود في CLARK orders. تأكد إن الموديل محفوظ في الموسم النشط.",
      });
    }
    order = orderSnap.docs[0].data();
    /* Stash docId + season for later write-back */
    order._docId = orderSnap.docs[0].id;
    order._docPath = orderSnap.docs[0].ref.path;
  } catch(e){
    return res.status(500).json({ ok:false, error: "Read failed: " + e.message });
  }

  /* ── Resolve effective settings (body wins, then order.shopify_meta defaults) ── */
  const meta = order.shopify_meta || {};
  /* V21.9.5: explicit title from body */
  const titleOverride = (typeof body.title === "string" && body.title.trim()) ? body.title.trim() : null;
  const description = body.description != null ? body.description : (meta.description || "");
  let images = Array.isArray(body.images) ? body.images : (Array.isArray(meta.images) ? meta.images : []);
  /* V21.9.5: per-color images map { [colorName]: { url, alt, color, source } }.
     Merged into images list below if not already there. */
  const colorImages = (body.colorImages && typeof body.colorImages === "object") ? body.colorImages : (meta.color_images || {});
  /* V21.9.5: add CLARK order's main image as fallback if no images supplied */
  if(images.length === 0 && order.image){
    images = [{ url: order.image, alt: order.modelNo || "", position: 1, source: "clark_order_image" }];
  }
  /* Merge colorImages into images list */
  for(const colorName of Object.keys(colorImages)){
    const ci = colorImages[colorName];
    if(!ci?.url) continue;
    /* Skip if already in images by same url */
    if(images.find(im => im.url === ci.url)) continue;
    images.push({ ...ci, color: colorName, position: images.length + 1 });
  }
  const colorSourceFabric = body.colorSourceFabric || meta.color_source_fabric || "A";
  const skuPattern = body.skuPattern || meta.sku_pattern || "{modelNo}-{color}-{size}";
  const vendor = body.vendor || meta.vendor || cfg.shopifyConfig?.shop_name || "CLARK Store";
  const productType = body.product_type || meta.product_type || order.garmentType || "";
  const tags = body.tags || meta.tags || "";
  const status = body.status || meta.status || "active";
  const stockMatrix = body.stockMatrix || meta.stock_matrix || {};
  const mode = body.mode || "auto";

  /* ── Build variants matrix ──
     V21.9.3 fix: pass sizeSets so buildVariantMatrix can resolve order.sizeSetId → sizes[].
     CLARK orders don't have `order.sizes` directly. */
  const matrix = buildVariantMatrix(order, {
    colorSourceFabric,
    skuPattern,
    sellPrice: order.sellPrice,
    stockMatrix,
    sizeSets: Array.isArray(cfg.sizeSets) ? cfg.sizeSets : [],
  });

  if(matrix.count === 0){
    return res.status(400).json({ ok:false, error: "مفيش variants للـ push (مفيش colors ولا sizes — راجع خامة الألوان والـ sizeSet)" });
  }

  /* ── Build product payload for Shopify ── */
  /* V21.9.5: title can be overridden by body.title; falls back to derived */
  const derivedTitle = (order.modelNo ? order.modelNo : "")
    + (order.modelDesc ? (order.modelNo ? " — " : "") + order.modelDesc : "");
  const finalTitle = titleOverride || derivedTitle.trim() || "Untitled";
  const payload = {
    title: finalTitle,
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

  /* ── Upload images (if create) or sync (if update + new images) ──
     V21.9.5: For color-tagged images, attach them to all variants of that
     color so Shopify shows the right image when the customer selects the color.
     Variant matching uses option1 (Color) from Shopify's response. */
  let imagesUploaded = 0;
  if(images.length > 0){
    const existingImageSrcs = new Set((shopifyProduct.images || []).map(img => img.src));
    /* Map color name → array of Shopify variant IDs for that color */
    const variantsByColor = new Map();
    for(const sv of (shopifyProduct.variants || [])){
      const colorVal = sv.option1 || ""; /* Color is option1 in our matrix */
      if(!variantsByColor.has(colorVal)) variantsByColor.set(colorVal, []);
      variantsByColor.get(colorVal).push(sv.id);
    }

    for(let i = 0; i < images.length; i++){
      const img = images[i];
      if(!img.url) continue;
      if(existingImageSrcs.has(img.url)) continue;
      try {
        const imageBody = {
          url: img.url,
          alt: img.alt || (order.modelNo + " - " + (i + 1)),
          position: img.position || (i + 1),
        };
        /* If this image is tagged with a color, attach to all variants of that color */
        if(img.color && variantsByColor.has(img.color)){
          imageBody.variant_ids = variantsByColor.get(img.color);
        }
        await uploadProductImageBySrc(creds, shopifyProduct.id, imageBody);
        imagesUploaded++;
      } catch(e){
        errors.push({ stage: "image", index: i, error: e.message, color: img.color || null });
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

  /* ── Save back to CLARK order.shopify_meta ──
     V21.9.3 fix: orders live in seasons/{season}/orders/{docId}, NOT in
     factory/config.orders. We saved order._docPath above; use it directly. */
  try {
    const db = getDb();
    if(!order._docPath){
      throw new Error("order._docPath missing — can't save shopify_meta");
    }
    const orderRef = db.doc(order._docPath);
    const orderSnap = await orderRef.get();
    if(orderSnap.exists){
      const fresh = orderSnap.data() || {};
      const next = {
        ...fresh,
        shopify_meta: {
          ...(fresh.shopify_meta || {}),
          shopify_product_id: String(shopifyProduct.id),
          shopify_handle: shopifyProduct.handle || "",
          shopify_title: shopifyProduct.title || "",
          push_status: "synced",
          last_pushed_at: new Date().toISOString(),
          last_pushed_by: auth.email || auth.uid,
          last_push_action: pushResult.action,
          /* Save the settings used for this push so re-syncs are stable */
          title: finalTitle, /* V21.9.5 */
          description,
          images,
          color_images: colorImages, /* V21.9.5: per-color image map */
          color_source_fabric: colorSourceFabric,
          sku_pattern: skuPattern,
          vendor,
          product_type: productType,
          tags,
          status,
          variants_count: matrix.count,
        },
      };
      delete next._docId;
      delete next._docPath;
      await orderRef.set(next);
    }
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
