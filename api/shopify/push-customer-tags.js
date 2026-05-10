/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/shopify/push-customer-tags (V21.6 Phase 10g)
   ───────────────────────────────────────────────────────────────
   Push CLARK customer tags + notes to Shopify customers (PUT).
   Bi-directional with sync-customers (which pulls shopify_tags).

   Body: {
     customerId: string,         // CLARK shopifyCustomers[].id
     mode?: "merge" | "replace"  // merge (default): combine with shopify_tags
                                 // replace: overwrite Shopify tags
     bulkCustomerIds?: string[]  // bulk mode
   }

   Auth: admin

   Behavior:
   - For each customer with shopify_customer_id:
     PUT /admin/api/X/customers/{shopify_customer_id}.json
     with body { customer: { id, tags: "...", note: "..." } }
   - Skips customers without shopify_customer_id (orders-only)

   Returns: { ok, pushed, skipped, errors }
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";
import { getShopifyCreds, shopifyFetch } from "./_shopifyAdmin.js";
import { readAllShopifyCustomers, FLAG_V2192, CUSTOMERS_COL } from "./_partitioned.js";

async function pushOneCustomer(creds, shopifyId, tagsString, note){
  const r = await shopifyFetch(creds, "/customers/" + shopifyId + ".json", {
    method: "PUT",
    body: { customer: { id: shopifyId, tags: tagsString, note } },
  });
  return r.data?.customer;
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

  const body = (typeof req.body === "string") ? JSON.parse(req.body || "{}") : (req.body || {});
  const ids = Array.isArray(body.bulkCustomerIds) ? body.bulkCustomerIds.map(String)
            : (body.customerId ? [String(body.customerId)] : []);
  const mode = body.mode === "replace" ? "replace" : "merge";

  if(ids.length === 0){
    return res.status(400).json({ ok:false, error: "customerId أو bulkCustomerIds مطلوب" });
  }

  const creds = await getShopifyCreds();
  if(!creds){
    return res.status(400).json({ ok:false, error: "Shopify creds مش معدّة" });
  }

  let cfg;
  try {
    const db = getDb();
    const snap = await db.collection("factory").doc("config").get();
    cfg = snap.exists ? (snap.data() || {}) : {};
  } catch(e){
    return res.status(500).json({ ok:false, error: e.message });
  }

  /* V21.9.2: read from per-doc collection if migrated */
  const customers = await readAllShopifyCustomers(cfg);
  const isPartitioned = !!cfg[FLAG_V2192];
  const idSet = new Set(ids);
  const targets = customers.filter(c => idSet.has(c.id));

  let pushed = 0, skipped = 0;
  const errors = [];

  for(const c of targets){
    if(!c.shopify_customer_id){
      skipped++;
      errors.push({ id: c.id, reason: "no_shopify_id" });
      continue;
    }
    /* Compute final tags string */
    const userTags = Array.isArray(c.tags) ? c.tags : [];
    const shopifyTags = Array.isArray(c.shopify_tags) ? c.shopify_tags : [];
    let finalTags;
    if(mode === "replace"){
      finalTags = userTags.join(", ");
    } else {
      /* merge: dedup case-insensitive */
      const seen = new Set();
      const merged = [];
      [...userTags, ...shopifyTags].forEach(t => {
        const key = String(t).trim().toLowerCase();
        if(key && !seen.has(key)){
          seen.add(key);
          merged.push(String(t).trim());
        }
      });
      finalTags = merged.join(", ");
    }
    const note = c.notes || "";
    try {
      await pushOneCustomer(creds, c.shopify_customer_id, finalTags, note);
      pushed++;
    } catch(e){
      errors.push({ id: c.id, error: e.message });
    }
  }

  /* Update local: stamp last_pushed_to_shopify_at */
  try {
    const db = getDb();
    const cfgRef = db.collection("factory").doc("config");
    const now = new Date().toISOString();
    if(isPartitioned){
      /* Per-doc updates */
      for(const c of targets){
        if(!c.shopify_customer_id) continue;
        const safeId = String(c.id).replace(/\//g, "_");
        await db.collection(CUSTOMERS_COL).doc(safeId).set({ last_pushed_to_shopify_at: now }, { merge: true });
      }
    } else {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(cfgRef);
        const fresh = snap.exists ? (snap.data() || {}) : {};
        const list = Array.isArray(fresh.shopifyCustomers) ? fresh.shopifyCustomers.slice() : [];
        for(let i = 0; i < list.length; i++){
          if(idSet.has(list[i].id) && list[i].shopify_customer_id){
            list[i] = { ...list[i], last_pushed_to_shopify_at: now };
          }
        }
        tx.set(cfgRef, { shopifyCustomers: list }, { merge: true });
      });
    }
  } catch(_){}

  return res.status(200).json({ ok: true, pushed, skipped, errors });
}
