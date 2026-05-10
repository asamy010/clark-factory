/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/shopify/update-customer (V20.2 Phase 11)
   ───────────────────────────────────────────────────────────────
   Update user-set fields on a Shopify customer (tags, notes,
   accepts_marketing, do_not_contact, contact_count++).

   Body: {
     customerId: string,
     // Field updates (any subset)
     tags?: string[],
     notes?: string,
     accepts_marketing?: bool,
     do_not_contact?: bool,
     // Bulk: apply to multiple customers
     bulkCustomerIds?: string[],
     // Special action: increment contact_count + set last_contacted_at
     bumpContact?: bool,
   }

   Auth: admin

   Returns: { ok, updated, customer? (single) }
   ═══════════════════════════════════════════════════════════════ */

import admin from "firebase-admin";
import { getDb, setCors, verifyAdminToken } from "../_firebase.js";
import {
  readAllShopifyCustomers, writeShopifyCustomer, FLAG_V2192, CUSTOMERS_COL,
} from "./_partitioned.js";

const FieldValue = admin.firestore.FieldValue;

const ALLOWED_FIELDS = new Set([
  "tags", "notes", "accepts_marketing", "do_not_contact",
]);

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
  const singleId = String(body.customerId || "").trim();
  const bulkIds = Array.isArray(body.bulkCustomerIds) ? body.bulkCustomerIds.map(String) : null;
  const bumpContact = !!body.bumpContact;

  if(!singleId && !bulkIds){
    return res.status(400).json({ ok:false, error: "customerId أو bulkCustomerIds مطلوب" });
  }

  /* Sanitize incoming fields */
  const updates = {};
  for(const k of Object.keys(body)){
    if(!ALLOWED_FIELDS.has(k)) continue;
    let v = body[k];
    if(k === "tags"){
      v = Array.isArray(v) ? v.map(t => String(t).trim().slice(0, 50)).filter(Boolean) : [];
      if(v.length > 20) v = v.slice(0, 20);
    } else if(k === "notes"){
      v = String(v || "").slice(0, 2000);
    } else if(k === "accepts_marketing" || k === "do_not_contact"){
      v = !!v;
    }
    updates[k] = v;
  }

  if(Object.keys(updates).length === 0 && !bumpContact){
    return res.status(400).json({ ok:false, error: "مفيش تحديثات صالحة" });
  }

  try {
    const db = getDb();
    const cfgRef = db.collection("factory").doc("config");
    let updated = 0;
    let updatedCustomer = null;

    /* V21.9.2: branch on partition flag */
    const cfgSnap = await cfgRef.get();
    const cfg = cfgSnap.exists ? (cfgSnap.data() || {}) : {};
    const isPartitioned = !!cfg[FLAG_V2192];
    const ids = bulkIds || [singleId];
    const now = new Date().toISOString();

    /* V21.9.11: track ids that didn't match any document so the caller can
       surface a clear error. Pre-V21.9.11 the per-doc branch silently
       continued on `!docSnap.exists`, returning `{ ok:true, updated:0 }` —
       which the UI rendered as "✅ تم" even when nothing happened. */
    const notFound = [];

    if(isPartitioned){
      /* V21.9.11 ROOT-CAUSE FIX (race):
         Pre-V21.9.11 this branch did `read → spread merge → set` per id WITHOUT
         a transaction. Two admins clicking "Bulk WhatsApp" concurrently on the
         same customer would race on `contact_count`: A reads 5, B reads 5,
         both write 6 (instead of 7). Worse, the spread `...docSnap.data()`
         could clobber any field the partitioner re-derived between read and
         write (e.g. `tier` from `aggregateCustomersFromOrders`).

         Fix: split the write into a primitive `set(updates, {merge:true})`
         (so we DON'T spread the doc — we patch only the changed fields) and,
         for `bumpContact`, use Firestore's atomic `FieldValue.increment(1)`
         which is race-free at the database level.

         Existence check is cheap (1 read) and tells us whether to count the
         id as updated vs notFound. */
      for(const id of ids){
        const safeId = String(id).replace(/\//g, "_");
        const docRef = db.collection(CUSTOMERS_COL).doc(safeId);
        const docSnap = await docRef.get();
        if(!docSnap.exists){ notFound.push(id); continue; }
        const patch = { ...updates, updated_at: now };
        if(bumpContact){
          patch.last_contacted_at = now;
          patch.contact_count = FieldValue.increment(1);
        }
        await docRef.set(patch, { merge: true });
        updated++;
        if(!bulkIds){
          /* For the single-customer path the UI expects the full updated doc.
             Re-read so the response reflects the post-increment value. */
          const after = await docRef.get();
          updatedCustomer = after.exists ? (after.data() || null) : null;
        }
      }
    } else {
      /* Legacy: array update inside tx */
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(cfgRef);
        const c2 = snap.exists ? (snap.data() || {}) : {};
        const customers = Array.isArray(c2.shopifyCustomers) ? c2.shopifyCustomers.slice() : [];
        const idSet = new Set(ids);
        const matchedIds = new Set();

        for(let i = 0; i < customers.length; i++){
          if(!idSet.has(customers[i].id)) continue;
          matchedIds.add(customers[i].id);
          const c = { ...customers[i], ...updates, updated_at: now };
          if(bumpContact){
            c.last_contacted_at = now;
            c.contact_count = (Number(c.contact_count) || 0) + 1;
          }
          customers[i] = c;
          updated++;
          if(!bulkIds) updatedCustomer = c;
        }

        /* V21.9.11: surface ids that didn't match (were never in the array). */
        for(const id of ids){
          if(!matchedIds.has(id)) notFound.push(id);
        }

        tx.set(cfgRef, { shopifyCustomers: customers }, { merge: true });
      });
    }

    return res.status(200).json({
      ok: true,
      updated,
      ...(notFound.length ? { notFound } : {}),
      ...(updatedCustomer ? { customer: updatedCustomer } : {}),
    });
  } catch(e){
    return res.status(500).json({ ok:false, error: e.message });
  }
}
