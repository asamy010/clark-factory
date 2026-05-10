/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/shopify/update-cart-recovery (V21.1 Phase 10b)
   ───────────────────────────────────────────────────────────────
   Mark cart contact actions: bumpContact, mark recovered, set notes,
   toggle do_not_contact.

   Body: { cartId | bulkCartIds, bumpContact?, recovered?, do_not_contact?, user_note? }
   Auth: admin
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";

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
  const ids = body.bulkCartIds && Array.isArray(body.bulkCartIds) ? body.bulkCartIds.map(String) : (body.cartId ? [String(body.cartId)] : []);
  if(ids.length === 0){
    return res.status(400).json({ ok:false, error: "cartId أو bulkCartIds مطلوب" });
  }

  try {
    const db = getDb();
    const cfgRef = db.collection("factory").doc("config");
    let updated = 0;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(cfgRef);
      const cfg = snap.exists ? (snap.data() || {}) : {};
      const carts = Array.isArray(cfg.shopifyAbandonedCarts) ? cfg.shopifyAbandonedCarts.slice() : [];
      const idSet = new Set(ids);
      const now = new Date().toISOString();
      for(let i = 0; i < carts.length; i++){
        if(!idSet.has(carts[i].id)) continue;
        const c = { ...carts[i] };
        if(body.bumpContact){
          c.last_contacted_at = now;
          c.contact_count = (Number(c.contact_count) || 0) + 1;
        }
        if(body.recovered === true){
          c.recovered_at = now;
          c.recovered_by = auth.email || auth.uid;
        } else if(body.recovered === false){
          c.recovered_at = null;
          c.recovered_by = null;
        }
        if(typeof body.do_not_contact === "boolean") c.do_not_contact = body.do_not_contact;
        if(typeof body.user_note === "string") c.user_note = body.user_note.slice(0, 1000);
        carts[i] = c;
        updated++;
      }
      tx.set(cfgRef, { shopifyAbandonedCarts: carts }, { merge: true });
    });
    return res.status(200).json({ ok: true, updated });
  } catch(e){
    return res.status(500).json({ ok:false, error: e.message });
  }
}
