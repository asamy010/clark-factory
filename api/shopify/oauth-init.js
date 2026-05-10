/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/shopify/oauth-init (V19.92 Phase 0.5)
   ───────────────────────────────────────────────────────────────
   First step of Shopify OAuth 2.0 install flow.

   Body: { storeUrl }
   Auth: Bearer <admin Firebase ID token>

   Returns: { ok:true, authUrl }
     The UI redirects the browser to authUrl. Shopify shows the
     "approve scopes" page; on approval, Shopify redirects back to
     /api/shopify/oauth-callback with the auth code.

   Why this needs admin auth even though it's just building a URL:
     • Prevents anyone with our Client ID from initiating an OAuth
       flow against an arbitrary store URL (they'd just get a token
       for that store, not ours — but it pollutes our app's install
       count and creates an audit trail mess).
     • Confirms the requester is allowed to manage CLARK config.

   Required Vercel env vars:
     SHOPIFY_CLIENT_ID
     DELIVERY_CONFIRM_SECRET (re-used for state HMAC)
   ═══════════════════════════════════════════════════════════════ */

import { setCors, verifyAdminToken } from "../_firebase.js";
import {
  normalizeStoreUrl,
  isValidStoreUrl,
  signOAuthState,
  buildAuthorizeUrl,
  getRequiredScopesString,
} from "./_shopifyAdmin.js";

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

  /* ── Body ── */
  const body = (typeof req.body === "string") ? JSON.parse(req.body || "{}") : (req.body || {});
  const storeUrl = normalizeStoreUrl(body.storeUrl || "");
  if(!storeUrl || !isValidStoreUrl(storeUrl)){
    res.status(400).json({ ok:false, error: "صيغة Store URL غير صحيحة. مثال: clarkstore.myshopify.com" });
    return;
  }

  /* ── Env ── */
  const clientId = (process.env.SHOPIFY_CLIENT_ID || "").trim();
  if(!clientId){
    res.status(500).json({
      ok: false,
      error: "SHOPIFY_CLIENT_ID مش مضبوط في Vercel env vars. اضبطه من Vercel Dashboard → Settings → Environment Variables.",
    });
    return;
  }
  if(!process.env.DELIVERY_CONFIRM_SECRET){
    res.status(500).json({ ok:false, error: "DELIVERY_CONFIRM_SECRET مش مضبوط — مطلوب للـ OAuth state signing" });
    return;
  }

  /* ── Build redirect URI from request host ──
     The redirect URI MUST match exactly what's registered in the Dev
     Dashboard under the app's "Allowed redirection URLs". If they
     don't match, Shopify rejects with "redirect_uri is not whitelisted". */
  const host = req.headers.host || "";
  if(!host){
    res.status(500).json({ ok:false, error: "تعذر تحديد الـ host header" });
    return;
  }
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0];
  /* Allow override via env var for staging/preview deployments where the
     request host doesn't match the production OAuth-registered URL */
  const baseOverride = (process.env.SHOPIFY_REDIRECT_BASE_URL || "").trim().replace(/\/+$/, "");
  const baseUrl = baseOverride || (proto + "://" + host);
  const redirectUri = baseUrl + "/api/shopify/oauth-callback";

  /* ── Sign state ──
     Tied to: storeUrl (so callback can verify it matches `shop` param),
     uid (so we can audit who initiated), redirectUri (so an attacker
     can't reuse a state with a different callback). */
  let state;
  try {
    state = signOAuthState({
      storeUrl,
      uid: auth.uid,
      redirectUri,
      nonce: Math.random().toString(36).slice(2, 12),
    });
  } catch(e){
    res.status(500).json({ ok:false, error: e.message });
    return;
  }

  /* ── Build the authorize URL ── */
  const authUrl = buildAuthorizeUrl({
    storeUrl,
    clientId,
    scopes: getRequiredScopesString(),
    redirectUri,
    state,
    online: false, /* offline = permanent shpat_ token */
  });

  res.status(200).json({
    ok: true,
    authUrl,
    redirectUri, /* echo for debugging — user should add this to Dev Dashboard */
  });
}
