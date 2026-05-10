/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/shopify/update-product-settings (V19.96 Phase 4)
   ───────────────────────────────────────────────────────────────
   Update per-product inventory-push settings (safety_buffer,
   shopify_synced flag, etc.) for a single Shopify product.

   Body: { shopifyProductId, settings: {...} }
   Auth: admin

   Updateable fields:
     • shopify_synced (bool) — push inventory or not
     • safety_buffer (number) — overrides default
     • max_shopify_qty (number) — cap pushed qty
     • auto_disable_at_zero (bool) — set status=draft if stock=0
     • clark_inventory_id (string) — manual mapping override

   Returns: { ok, product }
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";
import { FLAG_V2192, PRODUCTS_COL } from "./_partitioned.js";

const ALLOWED_KEYS = new Set([
  "shopify_synced",
  "safety_buffer",
  "max_shopify_qty",
  "auto_disable_at_zero",
  "clark_inventory_id",
]);

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
  const settings = body.settings && typeof body.settings === "object" ? body.settings : {};
  if(!productId){
    res.status(400).json({ ok:false, error: "shopifyProductId مطلوب" });
    return;
  }

  /* Sanitize incoming settings */
  const clean = {};
  for(const k of Object.keys(settings)){
    if(!ALLOWED_KEYS.has(k)) continue;
    let v = settings[k];
    if(k === "safety_buffer" || k === "max_shopify_qty"){
      if(v === null || v === "") v = null;
      else {
        const n = Number(v);
        if(!Number.isFinite(n)) continue;
        v = Math.max(0, Math.min(99999, Math.floor(n)));
      }
    }
    if(k === "shopify_synced" || k === "auto_disable_at_zero"){
      v = !!v;
    }
    if(k === "clark_inventory_id"){
      v = v ? String(v).trim() : null;
    }
    clean[k] = v;
  }
  if(Object.keys(clean).length === 0){
    res.status(400).json({ ok:false, error: "مفيش settings صالحة في الـ body" });
    return;
  }

  try {
    const db = getDb();
    const cfgRef = db.collection("factory").doc("config");
    let updatedProduct = null;

    /* V21.9.2: branch on partition flag */
    const cfgSnap = await cfgRef.get();
    const cfg = cfgSnap.exists ? (cfgSnap.data() || {}) : {};
    const isPartitioned = !!cfg[FLAG_V2192];

    if(isPartitioned){
      /* Per-doc update */
      const safeId = String(productId).replace(/\//g, "_");
      const docRef = db.collection(PRODUCTS_COL).doc(safeId);
      const docSnap = await docRef.get();
      if(!docSnap.exists) throw new Error("المنتج مش موجود");
      const next = { ...docSnap.data(), ...clean };
      if("clark_inventory_id" in clean){
        next.mapping_status = clean.clark_inventory_id ? "matched" : (next.sku ? "missing_in_clark" : "mismatch");
      }
      await docRef.set(next);
      updatedProduct = next;
    } else {
      /* Legacy: array update */
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(cfgRef);
        const c2 = snap.exists ? (snap.data() || {}) : {};
        const products = Array.isArray(c2.shopifyProducts) ? c2.shopifyProducts : [];
        const idx = products.findIndex(p => String(p.shopify_id) === productId);
        if(idx < 0) throw new Error("المنتج مش موجود");
        const next = products.slice();
        next[idx] = { ...products[idx], ...clean };
        /* Re-classify mapping if clark_inventory_id changed */
        if("clark_inventory_id" in clean){
          next[idx].mapping_status = clean.clark_inventory_id ? "matched" : (next[idx].sku ? "missing_in_clark" : "mismatch");
        }
        tx.set(cfgRef, { shopifyProducts: next }, { merge: true });
        updatedProduct = next[idx];
      });
    }

    res.status(200).json({ ok:true, product: updatedProduct });
  } catch(e){
    res.status(400).json({ ok:false, error: e.message });
  }
}
