/* ═══════════════════════════════════════════════════════════════
   CLARK — GET /api/shopify/oauth-callback (V19.92 Phase 0.5)
   ───────────────────────────────────────────────────────────────
   Second step of Shopify OAuth 2.0 install flow.

   Shopify redirects here after the user approves the app on the
   "approve scopes" screen. URL format:

     /api/shopify/oauth-callback?code=…&shop=…&state=…&hmac=…&timestamp=…&host=…

   Steps:
     1. Verify our state HMAC (proves the request is tied to a flow
        we initiated).
     2. Verify Shopify's HMAC (proves the redirect actually came from
        Shopify and not a forged request).
     3. Confirm `shop` matches the storeUrl in our state.
     4. Exchange `code` for an offline access token (shpat_…) by
        POSTing to the store's /admin/oauth/access_token with our
        Client ID + Client Secret.
     5. Fetch /shop.json to confirm the token works + populate the
        connection summary.
     6. Save token to factory/config.shopifyConfig.
     7. 302 redirect back to CLARK with success/error flag.

   This endpoint does NOT require admin auth — Shopify can't send
   our admin's Bearer token to itself. Security is provided by:
     • Our state HMAC (tied to the originating admin's uid)
     • Shopify's HMAC (proves the redirect is real)
     • TTL on state (10 min — limits replay window)

   Required Vercel env vars:
     SHOPIFY_CLIENT_ID
     SHOPIFY_CLIENT_SECRET
     DELIVERY_CONFIRM_SECRET
   ═══════════════════════════════════════════════════════════════ */

import { getDb } from "../_firebase.js";
import {
  normalizeStoreUrl,
  verifyOAuthState,
  verifyShopifyHmac,
  exchangeCodeForToken,
  fetchShop,
  fetchProductsCount,
} from "./_shopifyAdmin.js";

/* Helper: 302 redirect back to CLARK home with a flag the UI can read.
   We use query params (not hash) so server-rendered analytics can see
   them, and the UI's useEffect strips them after consuming. */
function redirectBack(req, res, params){
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0];
  const host = req.headers.host || "";
  /* Allow env override for cases where the OAuth callback host differs
     from the user-facing CLARK URL (e.g. a vercel preview deployment
     where we want to bounce back to production). */
  const baseOverride = (process.env.SHOPIFY_APP_BASE_URL || "").trim().replace(/\/+$/, "");
  const base = baseOverride || (proto + "://" + host);
  const qs = Object.entries(params)
    .filter(([_, v]) => v !== undefined && v !== null)
    .map(([k, v]) => k + "=" + encodeURIComponent(String(v)))
    .join("&");
  const url = base + "/?tab=shopify" + (qs ? "&" + qs : "");
  res.writeHead(302, { Location: url });
  res.end();
}

export default async function handler(req, res){
  if(req.method !== "GET"){
    res.status(405).send("GET only");
    return;
  }
  const q = req.query || {};
  const code = String(q.code || "");
  const shopParam = String(q.shop || "");
  const state = String(q.state || "");

  /* ── 1. Verify our state ── */
  const payload = verifyOAuthState(state);
  if(!payload){
    return redirectBack(req, res, {
      shopify_error: "OAuth state غير صالح أو منتهي. حاول من الأول.",
    });
  }

  /* ── 2. Confirm shop matches the state's storeUrl ── */
  const storeUrl = normalizeStoreUrl(shopParam);
  if(!storeUrl || storeUrl !== payload.storeUrl){
    return redirectBack(req, res, {
      shopify_error: "Store URL في الـ callback مختلف عن اللي ابتدينا بيه. ممكن يكون هجمة replay أو مشكلة في الـ state.",
    });
  }

  /* ── 3. Env ── */
  const clientId = (process.env.SHOPIFY_CLIENT_ID || "").trim();
  const clientSecret = (process.env.SHOPIFY_CLIENT_SECRET || "").trim();
  if(!clientId || !clientSecret){
    return redirectBack(req, res, {
      shopify_error: "SHOPIFY_CLIENT_ID/SHOPIFY_CLIENT_SECRET مش مضبوطين في Vercel env vars",
    });
  }

  /* ── 4. Verify Shopify HMAC ──
     Shopify signs all callback query params (except hmac itself) with
     our Client Secret. Validating this proves the redirect came from
     Shopify and wasn't forged. */
  if(!verifyShopifyHmac(q, clientSecret)){
    return redirectBack(req, res, {
      shopify_error: "Shopify HMAC verification فشلت — الـ redirect مش من Shopify أو الـ Client Secret غلط",
    });
  }

  if(!code){
    return redirectBack(req, res, { shopify_error: "Authorization code ناقص في الـ callback" });
  }

  /* ── 5. Exchange code for access token ── */
  let tokenResp;
  try {
    tokenResp = await exchangeCodeForToken(storeUrl, code, clientId, clientSecret);
  } catch(e){
    return redirectBack(req, res, {
      shopify_error: "فشل تبديل الـ code بـ توكين: " + (e.message || e),
    });
  }
  const accessToken = tokenResp.access_token;
  const grantedScopes = tokenResp.scope || "";
  if(!accessToken){
    return redirectBack(req, res, { shopify_error: "Shopify ردّ بدون access_token" });
  }

  /* ── 6. Sanity-check the token: fetch /shop.json ── */
  const creds = { storeUrl, accessToken, apiVersion: "2024-10" };
  let shopData = null;
  let productsCount = 0;
  try {
    shopData = await fetchShop(creds);
  } catch(e){
    /* Token came from Shopify but doesn't work — VERY unusual. Possibly
       indicates the Pause-and-Build plan blocks Admin API for some scopes,
       or app needs re-installation. */
    return redirectBack(req, res, {
      shopify_error: "التوكين اتـ generate لكن /shop.json فشل: " + (e.message || e),
    });
  }
  try { productsCount = await fetchProductsCount(creds); } catch(_){ productsCount = 0; }

  /* ── 7. Save to Firestore ── */
  try {
    const db = getDb();
    const ref = db.collection("factory").doc("config");
    const snap = await ref.get();
    const existing = snap.exists ? (snap.data() || {}) : {};
    const prevShopify = existing.shopifyConfig || {};
    const now = new Date().toISOString();
    const updated = {
      ...prevShopify,
      store_url: storeUrl,
      api_token: accessToken,
      api_version: "2024-10",
      oauth_scope: grantedScopes,
      connected: true,
      connected_via: "oauth",
      last_connected_at: now,
      last_connected_by: payload.uid || "oauth",
      shop_name: shopData?.name || "",
      shop_currency: shopData?.currency || "",
      shop_plan: shopData?.plan_name || shopData?.plan_display_name || "",
      shop_email: shopData?.email || "",
      shop_country: shopData?.country_name || shopData?.country || "",
    };
    await ref.set({ shopifyConfig: updated }, { merge: true });
  } catch(e){
    return redirectBack(req, res, {
      shopify_error: "فشل حفظ التوكين في Firestore: " + (e.message || e),
    });
  }

  /* ── 8. Success! Redirect back to CLARK ── */
  return redirectBack(req, res, {
    shopify_connected: "1",
    shop: shopData?.name || storeUrl,
    products: String(productsCount),
  });
}
