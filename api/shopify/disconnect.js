/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/shopify/disconnect (V19.91 Phase 0)
   ───────────────────────────────────────────────────────────────
   Auth: Bearer <Firebase admin/manager ID token>

   Wipes credentials from factory/config.shopifyConfig (token + store URL).
   Preserves user-tweaked settings (intervals, account mappings, safety
   buffers, notification phones) so re-connecting later restores the prefs.

   Returns { ok:true } on success.
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";

export default async function handler(req, res){
  setCors(res, req);
  if(req.method === "OPTIONS"){ res.status(204).end(); return; }
  if(req.method !== "POST"){
    res.status(405).json({ ok:false, error: "POST فقط" });
    return;
  }

  /* ── Auth ── */
  const auth = await verifyAdminToken(req.headers.authorization);
  if(!auth.ok){
    res.status(auth.status).json({ ok:false, error: auth.error });
    return;
  }

  try {
    const db = getDb();
    const ref = db.collection("factory").doc("config");
    const snap = await ref.get();
    const existing = snap.exists ? (snap.data() || {}) : {};
    const prevShopify = existing.shopifyConfig || {};
    /* Strip credentials + connection metadata; keep user prefs. */
    const wiped = { ...prevShopify };
    delete wiped.store_url;
    delete wiped.api_token;
    delete wiped.shop_name;
    delete wiped.shop_currency;
    delete wiped.shop_plan;
    delete wiped.shop_email;
    delete wiped.shop_country;
    delete wiped.last_connected_at;
    delete wiped.last_connected_by;
    wiped.connected = false;
    wiped.disconnected_at = new Date().toISOString();
    wiped.disconnected_by = auth.email || auth.uid;
    await ref.set({ shopifyConfig: wiped }, { merge: true });
    res.status(200).json({ ok:true });
  } catch(e){
    console.error("[shopify/disconnect] failed:", e);
    res.status(500).json({ ok:false, error: "فشل قطع الاتصال: " + e.message });
  }
}
