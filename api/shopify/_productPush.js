/* ═══════════════════════════════════════════════════════════════
   CLARK — Shopify Product Push helpers (V21.0 Phase 10)
   ───────────────────────────────────────────────────────────────
   Build matrix variants (colors × sizes) from a CLARK order/model
   and push the product to Shopify with images + description +
   inventory per variant.

   The principle: CLARK order has fabric A-H, each with its own
   colors[]. The user picks ONE fabric ("color_source_fabric") whose
   colors become the Shopify "Color" option. Sizes come from the
   model's sizes[] array. Each (color × size) pair becomes a Shopify
   variant.

   Stock per variant: pulled from CLARK's confirmed-stock matrix.
   For wholesale-only orders, this is left at 0 since wholesale
   doesn't track per-variant stock.
   ═══════════════════════════════════════════════════════════════ */

import { shopifyFetch } from "./_shopifyAdmin.js";

/* Build the SKU for a variant. Pattern is configurable; defaults to
   "{modelNo}-{color}-{size}". Available placeholders:
     {modelNo}, {color}, {size}, {garment}, {fabric}
   Strips diacritics & non-ASCII for SKU-safety. */
export function buildVariantSku(pattern, ctx){
  const safe = (s) => String(s || "")
    .normalize("NFKD")
    .replace(/[ً-ٰٟ]/g, "") /* Arabic harakat */
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9؀-ۿ\-_]/g, "")
    .slice(0, 60);
  return String(pattern || "{modelNo}-{color}-{size}")
    .replace(/\{modelNo\}/g, safe(ctx.modelNo))
    .replace(/\{color\}/g, safe(ctx.color))
    .replace(/\{size\}/g, safe(ctx.size))
    .replace(/\{garment\}/g, safe(ctx.garment))
    .replace(/\{fabric\}/g, safe(ctx.fabric))
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* Extract the colors array from a CLARK order's selected fabric.
   ⚠ CLARK schema (V21.8 Phase 11a fix):
     • order.fabricA  = fabric ID (string reference to data.fabrics)
     • order.colorsA  = array of { color, colorHex, layers, pcsPerLayer, qty }
   Colors live in a SEPARATE top-level field (`colors` + letter), NOT inside
   the fabric object. The color NAME is in the `.color` property (not `.n`).
   Returns array of color name strings, deduped & non-empty. */
export function extractFabricColors(order, fabricKey){
  if(!order || !fabricKey) return [];
  const key = String(fabricKey).toUpperCase();
  const colors = Array.isArray(order["colors" + key]) ? order["colors" + key] : [];
  const out = [];
  const seen = new Set();
  for(const c of colors){
    let name = "";
    if(typeof c === "string") name = c;
    else if(c && typeof c === "object") name = c.color || c.n || c.name || "";
    name = String(name || "").trim();
    if(!name) continue;
    const k = name.toLowerCase();
    if(seen.has(k)) continue;
    seen.add(k);
    out.push(name);
  }
  return out;
}

/* Compute per-variant inventory from CLARK's confirmed-stock matrix.
   The matrix shape (per orders.js / utils):
     { [color]: { [size]: count } }
   Falls back to 0 if not found. */
export function getVariantStock(stockMatrix, color, size){
  if(!stockMatrix || typeof stockMatrix !== "object") return 0;
  const byColor = stockMatrix[color] || stockMatrix[String(color).trim()] || null;
  if(!byColor) return 0;
  const v = byColor[size] || byColor[String(size).trim()];
  return Math.max(0, Number(v) || 0);
}

/* Build the full variants payload for Shopify from a CLARK order.
   Args:
     order: a CLARK order object
     opts:
       colorSourceFabric: "A" | "B" | ... — which fabric's colors to use
       skuPattern: e.g. "{modelNo}-{color}-{size}"
       sellPrice: per-variant price (defaults to order.sellPrice)
       stockMatrix: optional pre-computed { [color]: { [size]: qty } }
   Returns: { options, variants, count }
*/
export function buildVariantMatrix(order, opts = {}){
  const colorSourceFabric = opts.colorSourceFabric || "A";
  const colors = extractFabricColors(order, colorSourceFabric);
  const sizes = Array.isArray(order.sizes) ? order.sizes : [];
  const sellPrice = Number(opts.sellPrice ?? order.sellPrice) || 0;
  const skuPattern = opts.skuPattern || "{modelNo}-{color}-{size}";
  const stockMatrix = opts.stockMatrix || {};
  const garment = order.garmentType || "";
  const modelNo = order.modelNo || "";

  /* If no colors → single-option (Size only) variants */
  /* If no sizes → single-option (Color only) variants */
  /* If neither → one default variant */
  let options = [];
  let variants = [];

  if(colors.length > 0 && sizes.length > 0){
    options = [
      { name: "Color", values: colors },
      { name: "Size",  values: sizes  },
    ];
    for(const color of colors){
      for(const size of sizes){
        variants.push({
          option1: color,
          option2: size,
          sku: buildVariantSku(skuPattern, { modelNo, color, size, garment, fabric: colorSourceFabric }),
          price: String(sellPrice.toFixed(2)),
          inventory_quantity: getVariantStock(stockMatrix, color, size),
          inventory_management: "shopify",
        });
      }
    }
  } else if(sizes.length > 0){
    options = [{ name: "Size", values: sizes }];
    for(const size of sizes){
      let qty = 0;
      /* Sum all colors' qty for this size */
      for(const c of Object.keys(stockMatrix || {})){
        qty += getVariantStock(stockMatrix, c, size);
      }
      variants.push({
        option1: size,
        sku: buildVariantSku(skuPattern, { modelNo, color: "", size, garment, fabric: colorSourceFabric }),
        price: String(sellPrice.toFixed(2)),
        inventory_quantity: qty,
        inventory_management: "shopify",
      });
    }
  } else if(colors.length > 0){
    options = [{ name: "Color", values: colors }];
    for(const color of colors){
      let qty = 0;
      const byColor = stockMatrix[color] || {};
      for(const s of Object.keys(byColor)) qty += Number(byColor[s]) || 0;
      variants.push({
        option1: color,
        sku: buildVariantSku(skuPattern, { modelNo, color, size: "", garment, fabric: colorSourceFabric }),
        price: String(sellPrice.toFixed(2)),
        inventory_quantity: qty,
        inventory_management: "shopify",
      });
    }
  } else {
    options = [];
    variants.push({
      sku: buildVariantSku(skuPattern, { modelNo, color: "", size: "", garment, fabric: colorSourceFabric }),
      price: String(sellPrice.toFixed(2)),
      inventory_quantity: 0,
      inventory_management: "shopify",
    });
  }

  return { options, variants, count: variants.length };
}

/* Convert a markdown-ish description into HTML for body_html.
   Just a simple converter — Shopify accepts raw HTML.
   Keeps RTL-friendly. */
export function descriptionToHtml(description){
  if(!description) return "";
  let html = String(description).trim();
  /* Escape < > & */
  html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  /* Bold **text** */
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  /* Italic *text* */
  html = html.replace(/(?:^|[^*])\*([^*]+)\*(?!\*)/g, "$&".replace(/\*([^*]+)\*/, "<em>$1</em>"));
  /* Lists - or • starting */
  const lines = html.split(/\n/);
  const out = [];
  let inList = false;
  for(const line of lines){
    if(/^\s*[-•]\s+/.test(line)){
      if(!inList){ out.push("<ul>"); inList = true; }
      out.push("<li>" + line.replace(/^\s*[-•]\s+/, "") + "</li>");
    } else {
      if(inList){ out.push("</ul>"); inList = false; }
      if(line.trim() === ""){ out.push(""); }
      else { out.push("<p>" + line + "</p>"); }
    }
  }
  if(inList) out.push("</ul>");
  return out.filter(Boolean).join("\n");
}

/* Push a product to Shopify (create OR update if shopify_product_id is set).
   Args:
     creds: { storeUrl, accessToken, apiVersion }
     payload: built payload with product fields
     existingShopifyProductId: optional (update mode if set)
   Returns: { ok, product, action: "created"|"updated" } */
export async function pushProductToShopify(creds, payload, existingShopifyProductId){
  if(existingShopifyProductId){
    /* Update path — PUT /products/{id}.json */
    const r = await shopifyFetch(creds, "/products/" + existingShopifyProductId + ".json", {
      method: "PUT",
      body: { product: { ...payload, id: existingShopifyProductId } },
    });
    return { ok: true, product: r.data?.product, action: "updated" };
  } else {
    /* Create path — POST /products.json */
    const r = await shopifyFetch(creds, "/products.json", {
      method: "POST",
      body: { product: payload },
    });
    return { ok: true, product: r.data?.product, action: "created" };
  }
}

/* Upload an image to a Shopify product by URL.
   Shopify supports both `src` (URL) and `attachment` (base64).
   We use src (URL) since CLARK already hosts on Firebase Storage. */
export async function uploadProductImageBySrc(creds, shopifyProductId, imageObj){
  const r = await shopifyFetch(creds, "/products/" + shopifyProductId + "/images.json", {
    method: "POST",
    body: {
      image: {
        src: imageObj.url || imageObj.src,
        alt: imageObj.alt || "",
        position: imageObj.position || 0,
      },
    },
  });
  return { ok: true, image: r.data?.image };
}

/* Set inventory level for ALL variants of a product after the create call.
   Shopify creates the variants but doesn't always honor inventory_quantity
   in the create call (depends on inventory_management settings). To be sure
   the per-variant qty is correct, set each variant's level via /inventory_levels/set. */
export async function setVariantInventoryLevels(creds, shopifyProductId, variants, locationId){
  if(!locationId) return [];
  const results = [];
  for(const v of variants){
    if(!v.inventory_item_id) continue;
    try {
      await shopifyFetch(creds, "/inventory_levels/set.json", {
        method: "POST",
        body: {
          inventory_item_id: v.inventory_item_id,
          location_id: locationId,
          available: Number(v.inventory_quantity) || 0,
        },
      });
      results.push({ variant_id: v.id, ok: true });
    } catch(e){
      results.push({ variant_id: v.id, ok: false, error: e.message });
    }
  }
  return results;
}
