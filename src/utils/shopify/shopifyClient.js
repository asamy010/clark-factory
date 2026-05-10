/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Shopify Client (V19.91 — Phase 0)
   ───────────────────────────────────────────────────────────────────────
   Browser-side wrapper for the /api/shopify/* serverless endpoints.

   ⚠️ Why no direct Shopify Admin API calls from the browser?
   The Admin API access token has full store access (read/write orders,
   customers, products, inventory). Exposing it to the client = anyone
   with browser dev-tools can dump the entire store. So:
     • The token lives ONLY in factory/config.shopifyConfig (server-readable)
       OR in Vercel env (SHOPIFY_ACCESS_TOKEN).
     • All Shopify Admin API calls go through /api/shopify/* (server-side).
     • This file calls those /api endpoints — it never touches Shopify directly.

   Auth: caller must be admin/manager. Endpoints accept an admin Firebase
   ID token (Authorization: Bearer <token>) and verify role server-side.
   ═══════════════════════════════════════════════════════════════════════ */

const API_TIMEOUT_MS = 20000;

/* Get a fresh admin ID token from the currently signed-in Firebase user.
   Throws if no user is logged in. The token is short-lived (~1h), so we
   fetch a fresh one on every call rather than caching. */
async function getIdToken(user){
  if(!user || typeof user.getIdToken !== "function"){
    throw new Error("لازم تسجّل دخول كأدمن قبل ما تستخدم Shopify");
  }
  return await user.getIdToken();
}

/* Generic fetch wrapper with timeout + JSON parsing + error normalization.
   All endpoints return { ok:bool, ...payload } or { ok:false, error }. */
async function call(method, path, body, user){
  const idToken = await getIdToken(user);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);
  try {
    const opts = {
      method,
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + idToken,
      },
      signal: ctrl.signal,
    };
    if(body && method !== "GET") opts.body = JSON.stringify(body);
    const r = await fetch(path, opts);
    let data;
    try { data = await r.json(); } catch(_) { data = {}; }
    if(!r.ok){
      const msg = data?.error || ("HTTP " + r.status);
      throw new Error(msg);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/* ── Public client API ────────────────────────────────────────────────── */

/* Test + save Shopify credentials.
   { storeUrl, accessToken, apiVersion } → { ok, store: {name, currency, plan, productsCount} } */
export function shopifyConnect(creds, user){
  return call("POST", "/api/shopify/connect", creds, user);
}

/* Read connection status (without exposing the token).
   → { ok, connected, storeUrl, apiVersion, lastConnectedAt, store: {...} } */
export function shopifyStatus(user){
  return call("GET", "/api/shopify/status", null, user);
}

/* Wipe credentials from factory/config.shopifyConfig.
   → { ok } */
export function shopifyDisconnect(user){
  return call("POST", "/api/shopify/disconnect", {}, user);
}

/* V19.92: Initiate OAuth 2.0 install flow.
   { storeUrl } → { ok, authUrl, redirectUri }
   The caller redirects window.location to authUrl. Shopify shows the
   approve-scopes screen, then redirects back to /api/shopify/oauth-callback
   which saves the resulting shpat_ token to Firestore and bounces the
   browser back to /?tab=shopify&shopify_connected=1. */
export function shopifyOAuthInit({ storeUrl }, user){
  return call("POST", "/api/shopify/oauth-init", { storeUrl }, user);
}
