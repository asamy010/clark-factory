/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/shipping/configure (V21.8 Phase 10i)
   ───────────────────────────────────────────────────────────────
   Save credentials + default-provider settings for any shipping
   provider in the registry.

   Body: {
     default_provider?: "bosta" | "aramex" | "mylerz" | "manual",
     bosta?: { api_key?, business_id? },
     aramex?: { username?, password?, account_number? },
     mylerz?: { api_key?, username? }
   }

   Auth: admin
   Returns: { ok, settings }
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

  try {
    const db = getDb();
    const cfgRef = db.collection("factory").doc("config");
    let resultSettings = null;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(cfgRef);
      const cfg = snap.exists ? (snap.data() || {}) : {};
      const sc = cfg.shopifyConfig || {};
      const updates = { ...sc };

      if(typeof body.default_provider === "string"){
        updates.default_shipping_provider = body.default_provider;
      }

      /* Bosta */
      if(body.bosta && typeof body.bosta === "object"){
        if(typeof body.bosta.api_key === "string" && body.bosta.api_key.trim()){
          updates.bosta_api_key = body.bosta.api_key.trim();
        }
        if(typeof body.bosta.business_id === "string"){
          updates.bosta_business_id = body.bosta.business_id.trim();
        }
      }

      /* Aramex */
      if(body.aramex && typeof body.aramex === "object"){
        if(typeof body.aramex.username === "string") updates.aramex_username = body.aramex.username.trim();
        if(typeof body.aramex.password === "string" && body.aramex.password.trim()) updates.aramex_password = body.aramex.password.trim();
        if(typeof body.aramex.account_number === "string") updates.aramex_account_number = body.aramex.account_number.trim();
      }

      /* Mylerz */
      if(body.mylerz && typeof body.mylerz === "object"){
        if(typeof body.mylerz.api_key === "string" && body.mylerz.api_key.trim()) updates.mylerz_api_key = body.mylerz.api_key.trim();
        if(typeof body.mylerz.username === "string") updates.mylerz_username = body.mylerz.username.trim();
      }

      tx.set(cfgRef, { shopifyConfig: updates }, { merge: true });
      /* Strip secrets from response */
      const safeResult = { ...updates };
      delete safeResult.bosta_api_key;
      delete safeResult.aramex_password;
      delete safeResult.mylerz_api_key;
      resultSettings = {
        default_provider: safeResult.default_shipping_provider || "bosta",
        bosta_configured: !!updates.bosta_api_key,
        aramex_configured: !!(updates.aramex_username && updates.aramex_password && updates.aramex_account_number),
        mylerz_configured: !!(updates.mylerz_api_key),
      };
    });

    return res.status(200).json({ ok: true, settings: resultSettings });
  } catch(e){
    return res.status(500).json({ ok:false, error: e.message });
  }
}
