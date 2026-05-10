/* ═══════════════════════════════════════════════════════════════
   CLARK — GET/POST /api/cron/shopify-push-inventory (V19.96 Phase 4)
   ───────────────────────────────────────────────────────────────
   Cron variant of push-inventory-now. Same logic, accepts cron
   secret OR admin Bearer token. Default schedule (vercel.json):
   every 30 min on Pro, daily on Hobby.

   For a smaller payload, this version pushes ONLY products whose
   computed available differs from Shopify's cached quantity.
   ═══════════════════════════════════════════════════════════════ */

import { getDb, verifyAdminToken } from "../_firebase.js";
import {
  getShopifyCreds,
  fetchPrimaryLocation,
  setInventoryLevel,
  computeAvailableForSku,
} from "../shopify/_shopifyAdmin.js";
import { readAllShopifyProducts, FLAG_V2192, PRODUCTS_COL } from "../shopify/_partitioned.js";

const CRON_PUSH_LIMIT = 100; /* per run, to bound cost */

function isAuthorizedCron(req){
  const secret = (process.env.CRON_SECRET || "").trim();
  if(!secret) return false;
  if((req.headers["x-vercel-cron-secret"] || "") === secret) return true;
  if(String(req.headers.authorization || "").trim() === "Bearer " + secret) return true;
  return false;
}

export default async function handler(req, res){
  if(req.method !== "GET" && req.method !== "POST"){
    res.status(405).json({ ok:false, error: "Method not allowed" });
    return;
  }
  let authBy = null;
  if(isAuthorizedCron(req)){
    authBy = "cron";
  } else {
    const a = await verifyAdminToken(req.headers.authorization);
    if(a.ok) authBy = "admin:" + (a.email || a.uid);
  }
  if(!authBy){
    res.status(401).json({ ok:false, error: "Unauthorized" });
    return;
  }

  const creds = await getShopifyCreds();
  if(!creds){
    res.status(200).json({ ok:true, skipped: "shopify not configured", authBy });
    return;
  }

  let cfg;
  try {
    const db = getDb();
    const snap = await db.collection("factory").doc("config").get();
    cfg = snap.exists ? (snap.data() || {}) : {};
  } catch(e){
    res.status(500).json({ ok:false, error: "Read config failed: " + e.message });
    return;
  }

  /* V21.9.2: read products from per-doc collection if migrated */
  const shopifyProducts = await readAllShopifyProducts(cfg);
  const isPartitioned = !!cfg[FLAG_V2192];
  if(shopifyProducts.length === 0){
    res.status(200).json({ ok:true, skipped: "no products to push", authBy });
    return;
  }

  const location = await fetchPrimaryLocation(creds);
  if(!location){
    res.status(502).json({ ok:false, error: "Failed to fetch location" });
    return;
  }

  /* Build push list — only products whose desired != current */
  const queue = [];
  for(const p of shopifyProducts){
    if(p.wholesale_only === true) continue;
    if(p.shopify_synced === false) continue;
    if(p.mapping_status !== "matched") continue;
    const variants = Array.isArray(p.variants) ? p.variants : [];
    for(const v of variants){
      if(!v.inventory_item_id) continue;
      const sku = v.sku || p.sku || "";
      const { available } = computeAvailableForSku(cfg, sku, p.safety_buffer);
      const prev = Number(v.inventory_quantity) || 0;
      if(available !== prev){
        queue.push({ product: p, variant: v, sku, desired: available, prev });
      }
    }
  }

  if(queue.length === 0){
    res.status(200).json({ ok:true, authBy, skipped: "all in sync", checked: shopifyProducts.length });
    return;
  }

  /* Push, capped */
  const toPush = queue.slice(0, CRON_PUSH_LIMIT);
  let pushed = 0, errors = 0;
  const details = [];
  for(const item of toPush){
    try {
      await setInventoryLevel(creds, item.variant.inventory_item_id, location.id, item.desired);
      pushed++;
      details.push({ sku: item.sku, prev: item.prev, available: item.desired, status: "pushed" });
    } catch(e){
      errors++;
      details.push({ sku: item.sku, status: "error", error: e.message });
    }
  }

  /* Update timestamps + cached qty */
  try {
    const db = getDb();
    const cfgRef = db.collection("factory").doc("config");
    const now = new Date().toISOString();
    if(isPartitioned){
      /* Per-doc updates */
      const skuToPushed = new Map();
      for(const d of details){
        if(d.status === "pushed") skuToPushed.set(d.sku, d.available);
      }
      for(const p of shopifyProducts){
        const variants = Array.isArray(p.variants) ? p.variants : [];
        let touched = false;
        for(const v of variants){
          if(skuToPushed.has(v.sku)){
            v.inventory_quantity = skuToPushed.get(v.sku);
            touched = true;
          }
        }
        if(touched){
          p.last_synced_at = now;
          const safeId = String(p.shopify_id || p.id).replace(/\//g, "_");
          await db.collection(PRODUCTS_COL).doc(safeId).set(p);
        }
      }
      await cfgRef.set({
        shopifyConfig: {
          ...(cfg.shopifyConfig || {}),
          last_inventory_push_at: now,
          last_inventory_push_count: pushed,
          last_inventory_push_by: authBy,
        },
      }, { merge: true });
    } else {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(cfgRef);
        const fresh = snap.exists ? (snap.data() || {}) : {};
        const products = Array.isArray(fresh.shopifyProducts) ? fresh.shopifyProducts : [];
        for(const d of details){
          if(d.status !== "pushed") continue;
          for(const p of products){
            const v = (p.variants || []).find(vv => vv.sku === d.sku);
            if(v){ v.inventory_quantity = d.available; p.last_synced_at = now; break; }
          }
        }
        tx.set(cfgRef, {
          shopifyProducts: products,
          shopifyConfig: {
            ...(fresh.shopifyConfig || {}),
            last_inventory_push_at: now,
            last_inventory_push_count: pushed,
            last_inventory_push_by: authBy,
          },
        }, { merge: true });
      });
    }
  } catch(_){}

  res.status(200).json({
    ok: true,
    authBy,
    location: location.id,
    queued: queue.length,
    pushed,
    errors,
    truncated: queue.length > CRON_PUSH_LIMIT,
    details: details.slice(0, 50),
  });
}
