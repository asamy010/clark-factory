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

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";

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

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(cfgRef);
      const cfg = snap.exists ? (snap.data() || {}) : {};
      const customers = Array.isArray(cfg.shopifyCustomers) ? cfg.shopifyCustomers.slice() : [];
      const ids = bulkIds || [singleId];
      const idSet = new Set(ids);
      const now = new Date().toISOString();

      for(let i = 0; i < customers.length; i++){
        if(!idSet.has(customers[i].id)) continue;
        const c = { ...customers[i], ...updates, updated_at: now };
        if(bumpContact){
          c.last_contacted_at = now;
          c.contact_count = (Number(c.contact_count) || 0) + 1;
        }
        customers[i] = c;
        updated++;
        if(!bulkIds) updatedCustomer = c;
      }

      tx.set(cfgRef, { shopifyCustomers: customers }, { merge: true });
    });

    return res.status(200).json({
      ok: true,
      updated,
      ...(updatedCustomer ? { customer: updatedCustomer } : {}),
    });
  } catch(e){
    return res.status(500).json({ ok:false, error: e.message });
  }
}
