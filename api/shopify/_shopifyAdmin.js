/* ═══════════════════════════════════════════════════════════════
   CLARK — Shopify Admin API helpers (server-side, V19.91 Phase 0)
   ───────────────────────────────────────────────────────────────
   Thin wrapper around the Shopify Admin REST API. Used by the
   /api/shopify/* serverless endpoints.

   - Reads creds from factory/config.shopifyConfig OR from Vercel env
     vars (SHOPIFY_STORE_URL / SHOPIFY_ACCESS_TOKEN / SHOPIFY_API_VERSION).
   - Adds simple in-memory rate limiting (Shopify Basic = 2 req/sec).
   - Normalizes errors so callers can show user-friendly Arabic messages.

   ⚠️ Never expose the access token to the browser. This file runs ONLY
   in Vercel serverless functions.
   ═══════════════════════════════════════════════════════════════ */

import { getDb } from "../_firebase.js";
import crypto from "crypto";

const DEFAULT_API_VERSION = "2024-10";

/* V19.92: Required Admin API scopes for the CLARK ↔ Shopify integration.
   Single source of truth — used by:
     • OAuth init endpoint (passed in scope= query param)
     • Setup instructions UI (must match what user configures in Dev Dashboard)
     • Phase 1+ feature gating (skip features if scope is missing) */
export const REQUIRED_SHOPIFY_SCOPES = [
  "read_orders",
  "read_all_orders",
  "read_products",
  "write_products",
  "read_inventory",
  "write_inventory",
  "read_locations",
  "read_fulfillments",
  "read_customers",
];
export function getRequiredScopesString(){
  return REQUIRED_SHOPIFY_SCOPES.join(",");
}

/* Strip protocol + trailing slash so we always store/use a clean host. */
export function normalizeStoreUrl(raw){
  if(!raw) return "";
  let s = String(raw).trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "");
  s = s.replace(/\/+$/, "");
  return s;
}

/* Validate Shopify store URL format. Accepts <store>.myshopify.com. */
export function isValidStoreUrl(url){
  const clean = normalizeStoreUrl(url);
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(clean);
}

/* Validate Admin API token format.
   V19.91.2: Added atkn_ prefix for Shopify's new "App automation token"
   from the Dev Dashboard (replaces legacy custom app shpat_ tokens, since
   Shopify deprecated legacy custom app creation Jan 1 2026).
   Accepted prefixes:
     • shpat_  — legacy custom app Admin API access token
     • shppa_  — Shopify Partners personal access token
     • atkn_   — Dev Dashboard App automation token (new flow) */
export function isValidAccessToken(token){
  if(!token || typeof token !== "string") return false;
  const t = token.trim();
  return /^(shpat_|shppa_|atkn_)[A-Za-z0-9_-]{20,}$/.test(t);
}

/* ── Credentials reader ──────────────────────────────────────────
   Priority: Firestore factory/config.shopifyConfig (set via UI) →
   Vercel env vars (legacy / bootstrap). UI-set creds win. */
export async function getShopifyCreds(){
  /* 1. Try Firestore */
  try{
    const db = getDb();
    const snap = await db.collection("factory").doc("config").get();
    if(snap.exists){
      const cfg = snap.data() || {};
      const sc = cfg.shopifyConfig || {};
      const storeUrl = normalizeStoreUrl(sc.store_url || "");
      const accessToken = sc.api_token || "";
      const apiVersion = sc.api_version || DEFAULT_API_VERSION;
      if(storeUrl && accessToken){
        return { storeUrl, accessToken, apiVersion, source: "firestore" };
      }
    }
  } catch(e){
    console.error("[shopifyAdmin] failed to read creds from Firestore:", e.message);
  }
  /* 2. Fall back to Vercel env */
  const envUrl = normalizeStoreUrl(process.env.SHOPIFY_STORE_URL || "");
  const envToken = (process.env.SHOPIFY_ACCESS_TOKEN || "").trim();
  const envVersion = (process.env.SHOPIFY_API_VERSION || DEFAULT_API_VERSION).trim();
  if(envUrl && envToken){
    return { storeUrl: envUrl, accessToken: envToken, apiVersion: envVersion, source: "env" };
  }
  return null;
}

/* ── Tiny in-memory rate limiter ─────────────────────────────────
   Shopify Basic: 2 req/sec leaky bucket (40-call burst). On Vercel,
   serverless instances are short-lived so this only protects within
   one warm invocation — but that's enough for the Phase 0 endpoints
   which make at most 1-2 calls each. Real cron loops in Phase 1+
   should use a proper limiter (p-limit) with sequential awaiting. */
let lastCallAt = 0;
const MIN_INTERVAL_MS = 550; /* ~1.8 calls/sec — slightly under the limit */
async function throttle(){
  const now = Date.now();
  const wait = lastCallAt + MIN_INTERVAL_MS - now;
  if(wait > 0) await new Promise(r => setTimeout(r, wait));
  lastCallAt = Date.now();
}

/* ── Core fetch helper ───────────────────────────────────────────
   Handles auth header, JSON parsing, and Shopify-specific errors:
     • 401/403 → "صلاحيات غير كافية — راجع الـ token"
     • 404     → "الـ resource مش موجود"
     • 429     → "تم تجاوز حد الطلبات — حاول كمان شوية"
     • 5xx     → "Shopify بطيء/متعطل دلوقتي"

   Returns { ok:true, data, status, headers } on success.
   Throws Error on failure (caller should map to 4xx/5xx HTTP). */
export async function shopifyFetch(creds, path, opts = {}){
  if(!creds || !creds.storeUrl || !creds.accessToken){
    throw new Error("الاتصال بـ Shopify مش معدّ — راجع تاب الإعدادات");
  }
  await throttle();
  const cleanPath = path.startsWith("/") ? path : "/" + path;
  const version = creds.apiVersion || DEFAULT_API_VERSION;
  const url = "https://" + creds.storeUrl + "/admin/api/" + version + cleanPath;
  const method = (opts.method || "GET").toUpperCase();
  const headers = {
    "X-Shopify-Access-Token": creds.accessToken,
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
  const fetchOpts = { method, headers };
  if(opts.body && method !== "GET"){
    fetchOpts.body = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
  }
  /* Node 18+ has global fetch. Use AbortController for timeout. */
  const ctrl = new AbortController();
  const timeout = opts.timeoutMs || 15000;
  const timer = setTimeout(() => ctrl.abort(), timeout);
  fetchOpts.signal = ctrl.signal;
  let resp;
  try {
    resp = await fetch(url, fetchOpts);
  } catch(e){
    clearTimeout(timer);
    if(e.name === "AbortError"){
      throw new Error("Shopify ما ردّش في الوقت المحدد — جرّب تاني");
    }
    throw new Error("تعذر الاتصال بـ Shopify: " + (e.message || e));
  }
  clearTimeout(timer);
  let data = null;
  try { data = await resp.json(); } catch(_){ data = null; }
  if(!resp.ok){
    const errMsg = (data && (data.errors || data.error)) || ("HTTP " + resp.status);
    if(resp.status === 401 || resp.status === 403){
      throw new Error("صلاحيات Shopify غير كافية — راجع الـ access token والـ scopes");
    }
    if(resp.status === 404){
      throw new Error("الـ resource مش موجود في Shopify (" + cleanPath + ")");
    }
    if(resp.status === 429){
      throw new Error("تم تجاوز حد الطلبات لـ Shopify — حاول كمان شوية");
    }
    if(resp.status >= 500){
      throw new Error("Shopify بطيء/متعطل دلوقتي — حاول بعد دقيقة");
    }
    throw new Error("خطأ من Shopify: " + (typeof errMsg === "string" ? errMsg : JSON.stringify(errMsg)));
  }
  return { ok: true, data, status: resp.status, headers: resp.headers };
}

/* Convenience: GET /admin/api/X/shop.json — used as the "ping" call
   to verify creds during Connection setup. Returns the shop object. */
export async function fetchShop(creds){
  const r = await shopifyFetch(creds, "/shop.json");
  return r.data && r.data.shop ? r.data.shop : null;
}

/* Convenience: GET products count — for the connection summary. */
export async function fetchProductsCount(creds){
  try {
    const r = await shopifyFetch(creds, "/products/count.json");
    return r.data && typeof r.data.count === "number" ? r.data.count : 0;
  } catch(_){
    return 0;
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   V19.92 — OAuth 2.0 flow helpers
   ───────────────────────────────────────────────────────────────────────
   Why we need OAuth:
   Since Jan 1 2026 Shopify deprecated legacy custom apps. The new Dev
   Dashboard apps generate "App automation tokens" (atkn_…) that work for
   APP-LEVEL operations (managing the app itself) but NOT for the Admin
   REST API of an installed store. To call /shop.json, /products.json,
   etc., we need a real Admin API access token (shpat_…).

   The official way to get one: OAuth 2.0 install flow.
     1. Redirect user to Shopify's authorize endpoint with our Client ID +
        scopes + redirect_uri + signed state
     2. User approves → Shopify redirects to our callback with an auth code
     3. We exchange the code (POST + Client Secret) for an offline access
        token — the shpat_ we wanted.
     4. Store the token in factory/config.shopifyConfig and use it for all
        future Admin API calls.

   Required Vercel env vars:
     SHOPIFY_CLIENT_ID      — public, ok to expose in HTML
     SHOPIFY_CLIENT_SECRET  — must stay server-side, used to verify HMAC +
                              exchange auth code
     DELIVERY_CONFIRM_SECRET — already exists; reused to sign OAuth state
   ═══════════════════════════════════════════════════════════════════════ */

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; /* 10 min — generous for slow users */

/* Sign an OAuth state payload with HMAC + timestamp.
   Returns "<base64url(json)>.<base64url(hmac)>". Stateless — no Firestore
   write needed. The signature ties the state to our server (prevents an
   attacker from forging a state). The timestamp inside the payload caps
   replay-window length. */
export function signOAuthState(payload){
  const secret = process.env.DELIVERY_CONFIRM_SECRET;
  if(!secret || secret.length < 16){
    throw new Error("DELIVERY_CONFIRM_SECRET not set (or too short, min 16)");
  }
  const json = JSON.stringify({ ...payload, ts: Date.now() });
  const data = Buffer.from(json, "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return data + "." + sig;
}

/* Verify and decode an OAuth state. Returns payload object on success,
   null on any failure (bad signature, expired, malformed, etc). */
export function verifyOAuthState(state, maxAgeMs){
  try {
    const secret = process.env.DELIVERY_CONFIRM_SECRET;
    if(!secret || !state || typeof state !== "string") return null;
    const dot = state.indexOf(".");
    if(dot < 0) return null;
    const data = state.slice(0, dot);
    const sig = state.slice(dot + 1);
    const expected = crypto.createHmac("sha256", secret).update(data).digest("base64url");
    /* Constant-time compare */
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if(a.length !== b.length) return null;
    if(!crypto.timingSafeEqual(a, b)) return null;
    const json = Buffer.from(data, "base64url").toString("utf8");
    const payload = JSON.parse(json);
    const ttl = typeof maxAgeMs === "number" ? maxAgeMs : OAUTH_STATE_TTL_MS;
    if(!payload.ts || Date.now() - payload.ts > ttl) return null;
    return payload;
  } catch(_){
    return null;
  }
}

/* Verify Shopify's HMAC on the OAuth callback URL. Shopify signs all
   non-hmac query params (sorted by key, joined with &) using the app's
   Client Secret. Validating this proves the redirect actually came from
   Shopify and wasn't forged by an attacker who got our Client ID.

   Spec: https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant#step-3-verify-the-installation-request */
export function verifyShopifyHmac(query, clientSecret){
  if(!query || !query.hmac || !clientSecret) return false;
  const hmac = String(query.hmac);
  const params = { ...query };
  delete params.hmac;
  /* Some Shopify endpoints also include `signature` which is excluded too */
  delete params.signature;
  const sorted = Object.keys(params)
    .sort()
    .map(k => k + "=" + params[k])
    .join("&");
  const computed = crypto.createHmac("sha256", clientSecret).update(sorted).digest("hex");
  try {
    const a = Buffer.from(hmac, "hex");
    const b = Buffer.from(computed, "hex");
    if(a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch(_){
    return false;
  }
}

/* Exchange an OAuth authorization code for a permanent (offline) Admin
   API access token. POST { client_id, client_secret, code } to the
   store's /admin/oauth/access_token endpoint.
   Response: { access_token: "shpat_…", scope: "read_orders,…" } */
export async function exchangeCodeForToken(storeUrl, code, clientId, clientSecret){
  if(!storeUrl || !code || !clientId || !clientSecret){
    throw new Error("exchangeCodeForToken: missing required arg");
  }
  const url = "https://" + storeUrl + "/admin/oauth/access_token";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  let resp;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
      signal: ctrl.signal,
    });
  } catch(e){
    clearTimeout(timer);
    throw new Error("Token exchange request failed: " + (e.message || e));
  }
  clearTimeout(timer);
  let data = null;
  try { data = await resp.json(); } catch(_){ /* leave null */ }
  if(!resp.ok){
    const errTxt = data?.error_description || data?.error || ("HTTP " + resp.status);
    throw new Error("Shopify rejected token exchange: " + errTxt);
  }
  if(!data || !data.access_token){
    throw new Error("Shopify response missing access_token");
  }
  return data;
}

/* Convenience: build the Shopify install URL (the "approve scopes" page).
   Caller passes the redirect_uri (must match what's registered in the
   Dev Dashboard under "Allowed redirection URLs"). */
export function buildAuthorizeUrl({ storeUrl, clientId, scopes, redirectUri, state, online = false }){
  if(!storeUrl || !clientId || !redirectUri || !state){
    throw new Error("buildAuthorizeUrl: missing arg");
  }
  const params = [
    "client_id=" + encodeURIComponent(clientId),
    "scope=" + encodeURIComponent(scopes || getRequiredScopesString()),
    "redirect_uri=" + encodeURIComponent(redirectUri),
    "state=" + encodeURIComponent(state),
  ];
  /* Default = offline access (permanent shpat_ token).
     For online access (per-user, expires after ~24h), uncomment:
       params.push("grant_options[]=per-user");
     We don't need online for server-side polling. */
  if(online) params.push("grant_options[]=per-user");
  return "https://" + storeUrl + "/admin/oauth/authorize?" + params.join("&");
}
