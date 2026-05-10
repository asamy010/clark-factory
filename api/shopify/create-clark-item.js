/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/shopify/create-clark-item (V20.0 Phase 8)
   ───────────────────────────────────────────────────────────────
   Create a CLARK inventoryItem from a Shopify product, automatically
   linking the two via SKU = model_no. Solves the "I synced from
   Shopify but where do these products live in CLARK?" problem.

   Body: {
     shopifyProductId: string,    -- which Shopify product to create from
     stock?: number,               -- initial stock (default 0)
     unit?: string,                -- e.g. "قطعة" (default)
     categoryId?: string,          -- optional CLARK category
     bulkProductIds?: [string]     -- bulk mode: skip shopifyProductId
   }

   Auth: admin

   Behavior:
   • Looks up shopifyProducts[id]
   • Generates a new inventoryItems entry:
     - id: auto
     - name: product.title
     - model_no: product.sku   ← key match field
     - sku: product.sku
     - unit, stock, price (from variant), categoryId
     - source: "shopify_import" (audit marker)
   • Links: shopifyProducts[id].clark_inventory_id = newItem.id
   • Sets: shopifyProducts[id].mapping_status = "matched"
   • Idempotent: if a CLARK item with model_no=SKU already exists,
     just links to it (doesn't create duplicate).

   Returns: { ok, created, item, linkedShopifyProductId }
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";

function newItemId(){
  return "inv_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

function r2(n){ return Math.round((Number(n) || 0) * 100) / 100; }

/* Try to find an existing CLARK inventoryItem matching the SKU.
   Match priority: model_no > sku > name. */
function findExistingItem(items, sku){
  if(!sku) return null;
  const s = String(sku).trim();
  return items.find(it => it.model_no && String(it.model_no).trim() === s)
      || items.find(it => it.sku && String(it.sku).trim() === s)
      || items.find(it => it.name && String(it.name).trim() === s)
      || null;
}

function buildItemFromProduct(product, opts = {}){
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  const v0 = variants[0] || {};
  const price = Number(v0.price) || Number(product?.min_price) || 0;
  return {
    id: newItemId(),
    categoryId: opts.categoryId || null,
    name: product.title || product.sku || "(no title)",
    model_no: product.sku || "",
    sku: product.sku || "",
    type: product.product_type || "",
    unit: opts.unit || "قطعة",
    stock: Math.max(0, Number(opts.stock) || 0),
    minStock: 0,
    avgCost: 0,
    price: r2(price),
    /* V20.0: enrich with Shopify-source metadata for traceability */
    notes: "تم إنشاؤه من Shopify integration. Shopify product: " +
           (product.title || product.sku) + " (ID: " + product.shopify_id + ")",
    image_url: product.image_url || "",
    source: "shopify_import",
    source_shopify_id: String(product.shopify_id),
    createdAt: new Date().toISOString(),
    createdBy: "system:shopify-import",
  };
}

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
  const productId = String(body.shopifyProductId || "").trim();
  const bulkIds = Array.isArray(body.bulkProductIds) ? body.bulkProductIds.map(String) : null;
  const opts = {
    stock: body.stock,
    unit: body.unit,
    categoryId: body.categoryId,
  };

  if(!productId && !bulkIds){
    res.status(400).json({ ok:false, error: "shopifyProductId أو bulkProductIds مطلوب" });
    return;
  }

  try {
    const db = getDb();
    const cfgRef = db.collection("factory").doc("config");
    const result = { created: 0, linked: 0, skipped: 0, items: [], errors: [] };

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(cfgRef);
      const cfg = snap.exists ? (snap.data() || {}) : {};
      const shopifyProducts = Array.isArray(cfg.shopifyProducts) ? cfg.shopifyProducts.slice() : [];
      const inventoryItems = Array.isArray(cfg.inventoryItems) ? cfg.inventoryItems.slice() : [];

      const targetIds = bulkIds ? bulkIds : [productId];
      for(const pid of targetIds){
        const idx = shopifyProducts.findIndex(p => String(p.shopify_id) === pid);
        if(idx < 0){
          result.errors.push({ id: pid, error: "Shopify product not found in CLARK list" });
          continue;
        }
        const product = shopifyProducts[idx];
        const sku = (product.sku || "").trim();
        if(!sku){
          result.errors.push({ id: pid, sku: "", error: "المنتج مش عنده SKU في Shopify" });
          continue;
        }

        /* Idempotent: link to existing CLARK item if one exists */
        const existing = findExistingItem(inventoryItems, sku);
        let item;
        if(existing){
          item = existing;
          result.linked++;
        } else {
          item = buildItemFromProduct(product, opts);
          inventoryItems.push(item);
          result.created++;
        }

        /* Update Shopify product entry to point to CLARK */
        shopifyProducts[idx] = {
          ...product,
          clark_inventory_id: item.id,
          mapping_status: "matched",
        };
        result.items.push({ id: item.id, name: item.name, model_no: item.model_no, sku, was_existing: !!existing });
      }

      tx.set(cfgRef, {
        shopifyProducts,
        inventoryItems,
      }, { merge: true });
    });

    res.status(200).json({
      ok: true,
      ...result,
      total: result.created + result.linked,
    });
  } catch(e){
    res.status(500).json({ ok:false, error: e.message });
  }
}
