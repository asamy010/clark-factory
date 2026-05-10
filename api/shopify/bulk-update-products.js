/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/shopify/bulk-update-products (V19.99 Phase 7)
   ───────────────────────────────────────────────────────────────
   Apply a single action to many shopifyProducts entries at once.
   Atomic via Firestore transaction.

   Body:
   {
     productIds: ['shopifyId1', 'shopifyId2', ...],
     action: 'set_synced'        — payload: { value: bool }
           | 'set_wholesale_only' — payload: { value: bool }
           | 'set_safety_buffer'  — payload: { value: number|null }
           | 'delete_from_clark'  — removes from list + adds to blacklist
           | 'restore_from_blacklist' — removes from blacklist (for re-sync)
           | 'delete_all'         — empties shopifyProducts entirely
                                     (productIds ignored)
           | 'clear_blacklist'    — empties deletedProductIds
   }

   Auth: admin

   Returns: { ok, updated, deleted?, blacklist? }
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";
import {
  readAllShopifyProducts, writeManyShopifyProducts, FLAG_V2192, PRODUCTS_COL,
} from "./_partitioned.js";

const VALID_ACTIONS = new Set([
  "set_synced",
  "set_wholesale_only",
  "set_safety_buffer",
  "set_max_qty",
  "set_auto_disable_at_zero",
  "delete_from_clark",
  "restore_from_blacklist",
  "delete_all",
  "clear_blacklist",
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
  const action = String(body.action || "").trim();
  const ids = Array.isArray(body.productIds) ? body.productIds.map(String) : [];
  const payload = body.payload || {};

  if(!VALID_ACTIONS.has(action)){
    res.status(400).json({ ok:false, error: "action مش معروف. الـ allowed: " + Array.from(VALID_ACTIONS).join(", ") });
    return;
  }

  /* Validate per-action requirements */
  if(action === "set_synced" || action === "set_wholesale_only" || action === "set_auto_disable_at_zero"){
    if(typeof payload.value !== "boolean"){
      res.status(400).json({ ok:false, error: "payload.value (boolean) مطلوب" });
      return;
    }
  }
  if(action === "set_safety_buffer" || action === "set_max_qty"){
    if(payload.value !== null && !Number.isFinite(Number(payload.value))){
      res.status(400).json({ ok:false, error: "payload.value (number أو null) مطلوب" });
      return;
    }
  }
  /* For most actions other than delete_all/clear_blacklist, productIds required */
  if(action !== "delete_all" && action !== "clear_blacklist" && ids.length === 0){
    res.status(400).json({ ok:false, error: "productIds (array) مطلوب" });
    return;
  }

  try {
    const db = getDb();
    const cfgRef = db.collection("factory").doc("config");
    let updated = 0, deleted = 0, blacklistSize = 0;

    /* V21.9.2: read products from per-doc collection if migrated.
       Read OUTSIDE the tx since collection reads aren't transaction-safe. */
    const cfgPreRead = await cfgRef.get();
    const cfgEarly = cfgPreRead.exists ? (cfgPreRead.data() || {}) : {};
    const isPartitioned = !!cfgEarly[FLAG_V2192];
    const productsRead = await readAllShopifyProducts(cfgEarly);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(cfgRef);
      const cfg = snap.exists ? (snap.data() || {}) : {};
      /* Use the products we read above (matches whichever storage the migration is on) */
      const products = productsRead.slice();
      const blacklist = new Set(
        Array.isArray(cfg.shopifyConfig?.deletedProductIds)
          ? cfg.shopifyConfig.deletedProductIds.map(String) : []
      );
      const idSet = new Set(ids);

      let nextProducts = products;
      let nextBlacklist = blacklist;

      switch(action){
        case "set_synced":
          for(const p of nextProducts){
            if(idSet.has(String(p.shopify_id))){
              p.shopify_synced = !!payload.value;
              updated++;
            }
          }
          break;
        case "set_wholesale_only":
          for(const p of nextProducts){
            if(idSet.has(String(p.shopify_id))){
              p.wholesale_only = !!payload.value;
              updated++;
            }
          }
          break;
        case "set_safety_buffer":
          {
            const v = payload.value === null ? null : Math.max(0, Math.min(99999, Math.floor(Number(payload.value))));
            for(const p of nextProducts){
              if(idSet.has(String(p.shopify_id))){
                p.safety_buffer = v;
                updated++;
              }
            }
          }
          break;
        case "set_max_qty":
          {
            const v = payload.value === null ? null : Math.max(0, Math.min(99999, Math.floor(Number(payload.value))));
            for(const p of nextProducts){
              if(idSet.has(String(p.shopify_id))){
                p.max_shopify_qty = v;
                updated++;
              }
            }
          }
          break;
        case "set_auto_disable_at_zero":
          for(const p of nextProducts){
            if(idSet.has(String(p.shopify_id))){
              p.auto_disable_at_zero = !!payload.value;
              updated++;
            }
          }
          break;
        case "delete_from_clark":
          /* Remove from shopifyProducts + add to blacklist so re-sync
             doesn't bring them back. */
          nextProducts = nextProducts.filter(p => {
            if(idSet.has(String(p.shopify_id))){
              nextBlacklist.add(String(p.shopify_id));
              deleted++;
              return false;
            }
            return true;
          });
          break;
        case "delete_all":
          deleted = nextProducts.length;
          nextProducts.forEach(p => nextBlacklist.add(String(p.shopify_id)));
          nextProducts = [];
          break;
        case "restore_from_blacklist":
          /* Remove ids from blacklist so the next sync brings them back */
          for(const id of ids){
            if(nextBlacklist.delete(id)) updated++;
          }
          break;
        case "clear_blacklist":
          updated = nextBlacklist.size;
          nextBlacklist = new Set();
          break;
      }

      blacklistSize = nextBlacklist.size;
      const cfgUpdate = {
        shopifyConfig: {
          ...(cfg.shopifyConfig || {}),
          deletedProductIds: Array.from(nextBlacklist),
          last_bulk_action_at: new Date().toISOString(),
          last_bulk_action_by: auth.email || auth.uid,
          last_bulk_action_type: action,
        },
      };
      /* Pre-migration: write the array. Post-migration: skip array, we'll
         do per-doc writes after the transaction. */
      if(!isPartitioned){
        cfgUpdate.shopifyProducts = nextProducts;
      }
      tx.set(cfgRef, cfgUpdate, { merge: true });

      /* Stash for post-tx work */
      tx.__nextProducts = nextProducts;
      tx.__nextBlacklist = nextBlacklist;
    });

    /* V21.9.2 post-tx: per-doc writes.
       V21.9.11: track per-id success/failure so partial failures surface to
       the caller (was previously `.catch(() => {})` — silent). For delete
       actions, failed deletes mean the blacklist (committed in the tx)
       doesn't match reality — we report them so the user can re-run. */
    const deleteFailures = [];
    if(isPartitioned){
      let nextProducts = productsRead.slice();
      const idSet = new Set(ids);

      switch(action){
        case "set_synced":
          for(const p of nextProducts) if(idSet.has(String(p.shopify_id))) p.shopify_synced = !!payload.value;
          break;
        case "set_wholesale_only":
          for(const p of nextProducts) if(idSet.has(String(p.shopify_id))) p.wholesale_only = !!payload.value;
          break;
        case "set_safety_buffer": {
          const v = payload.value === null ? null : Math.max(0, Math.min(99999, Math.floor(Number(payload.value))));
          for(const p of nextProducts) if(idSet.has(String(p.shopify_id))) p.safety_buffer = v;
          break;
        }
        case "set_max_qty": {
          const v = payload.value === null ? null : Math.max(0, Math.min(99999, Math.floor(Number(payload.value))));
          for(const p of nextProducts) if(idSet.has(String(p.shopify_id))) p.max_shopify_qty = v;
          break;
        }
        case "set_auto_disable_at_zero":
          for(const p of nextProducts) if(idSet.has(String(p.shopify_id))) p.auto_disable_at_zero = !!payload.value;
          break;
        case "delete_from_clark":
        case "delete_all": {
          const toDelete = action === "delete_all" ? nextProducts.map(p => String(p.shopify_id)) : ids;
          for(const id of toDelete){
            const safeId = String(id).replace(/\//g, "_");
            try {
              await db.collection(PRODUCTS_COL).doc(safeId).delete();
            } catch(delErr){
              deleteFailures.push({ id, error: delErr?.message || String(delErr) });
              console.warn("[bulk-update-products] delete failed for", id, "—", delErr?.message);
            }
          }
          /* Filter local copy too so the writeManyShopifyProducts below doesn't re-add */
          nextProducts = nextProducts.filter(p => !toDelete.includes(String(p.shopify_id)));
          break;
        }
        /* restore_from_blacklist + clear_blacklist don't touch products */
      }

      if(action.startsWith("set_")){
        /* Just write the affected docs, not the whole list */
        const affected = nextProducts.filter(p => idSet.has(String(p.shopify_id)));
        await writeManyShopifyProducts({ [FLAG_V2192]: true }, affected);
      }
    }

    res.status(200).json({
      ok: true,
      action,
      updated,
      deleted,
      blacklistSize,
      ...(deleteFailures.length ? { deleteFailures } : {}),
    });
  } catch(e){
    res.status(500).json({ ok:false, error: e.message });
  }
}
