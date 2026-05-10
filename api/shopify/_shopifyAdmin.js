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

const DEFAULT_API_VERSION = "2024-10";

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
