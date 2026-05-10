/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/shopify/connect (V19.91 Phase 0)
   ───────────────────────────────────────────────────────────────
   Body:
     { storeUrl, accessToken, apiVersion? }
   Auth: Bearer <Firebase admin/manager ID token>

   Steps:
     1. Validate inputs (URL format + token shape).
     2. Test the creds: GET /admin/api/X/shop.json.
     3. On success, save to factory/config.shopifyConfig (encrypted-at-rest
        by Firestore — but the field is still sensitive; do NOT echo it
        back in any response).
     4. Return { ok, store: {name, currency, plan, productsCount} } so the
        UI can show the connection summary.

   Failure modes return { ok:false, error } with appropriate HTTP status.
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";
import {
  normalizeStoreUrl,
  isValidStoreUrl,
  isValidAccessToken,
  shopifyFetch,
  fetchShop,
  fetchProductsCount,
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

  /* ── Parse body ── */
  const body = (typeof req.body === "string") ? JSON.parse(req.body || "{}") : (req.body || {});
  const storeUrl = normalizeStoreUrl(body.storeUrl || "");
  const accessToken = String(body.accessToken || "").trim();
  const apiVersion = String(body.apiVersion || "2024-10").trim();

  if(!storeUrl || !isValidStoreUrl(storeUrl)){
    res.status(400).json({ ok:false, error: "صيغة Store URL غير صحيحة. مثال: clarkfashion.myshopify.com" });
    return;
  }
  if(!accessToken){
    res.status(400).json({ ok:false, error: "ادخل الـ Admin API Access Token" });
    return;
  }
  /* V19.91.1: more specific error for the common shpss_ confusion.
     shpss_ is the OAuth Client Secret — it can't authenticate Admin API
     calls. The user needs the shpat_ token from "Install app" or
     "Create token" in the API credentials tab. */
  if(/^shpss_/i.test(accessToken.trim())){
    res.status(400).json({ ok:false, error: "ده Client Secret مش Access Token! روح API credentials tab واضغط Install app أو Create token عشان تجيب التوكين اللي بيبدأ بـ shpat_" });
    return;
  }
  if(/^shpca_/i.test(accessToken.trim())){
    res.status(400).json({ ok:false, error: "ده Collaborator token — مش بيشتغل مع الـ Admin API. لازم تجيب shpat_ من Install app أو Create token" });
    return;
  }
  if(!isValidAccessToken(accessToken)){
    res.status(400).json({ ok:false, error: "صيغة الـ Access Token غير صحيحة. الصيغ المقبولة: shpat_ (custom app) أو atkn_ (Dev Dashboard) أو shppa_ (Partners). لازم 25+ حرف بعد الـ prefix." });
    return;
  }

  const creds = { storeUrl, accessToken, apiVersion };

  /* ── Test connection ── */
  let shop;
  try {
    shop = await fetchShop(creds);
    if(!shop){
      res.status(502).json({ ok:false, error: "Shopify ردّ بدون بيانات الـ shop — راجع الـ token والصلاحيات" });
      return;
    }
  } catch(e){
    /* V21.9.11: distinguish auth errors (caller-fixable, 401) from upstream
       failures (Shopify down/network, 502). Pre-V21.9.11 every failure was
       400 — observability suffered (couldn't tell from logs whether to
       retry or escalate). CLAUDE.md §9: 400=client, 502=upstream, 500=ours. */
    const msg = e.message || "فشل الاتصال بـ Shopify";
    let statusCode = 502; /* default: assume upstream issue */
    if(/401|unauthorized|invalid.*token|access.*denied|forbidden|403/i.test(msg)){
      statusCode = 401;
    }
    res.status(statusCode).json({ ok:false, error: msg });
    return;
  }

  /* Get products count for the summary card (not a hard failure). */
  let productsCount = 0;
  try { productsCount = await fetchProductsCount(creds); } catch(_){ productsCount = 0; }

  /* ── Save creds to Firestore (factory/config.shopifyConfig) ── */
  try {
    const db = getDb();
    const ref = db.collection("factory").doc("config");
    const now = new Date().toISOString();
    /* Read existing config to preserve other shopifyConfig fields the UI
       may have set (polling intervals, account mappings, etc.). Phase 0
       only sets credentials — other fields default in the migration helper. */
    const snap = await ref.get();
    const existing = snap.exists ? (snap.data() || {}) : {};
    const prevShopify = existing.shopifyConfig || {};
    const updated = {
      ...prevShopify,
      store_url: storeUrl,
      api_token: accessToken,
      api_version: apiVersion,
      connected: true,
      last_connected_at: now,
      last_connected_by: auth.email || auth.uid,
      shop_name: shop.name || "",
      shop_currency: shop.currency || "",
      shop_plan: shop.plan_name || shop.plan_display_name || "",
      shop_email: shop.email || "",
      shop_country: shop.country_name || shop.country || "",
    };
    await ref.set({ shopifyConfig: updated }, { merge: true });
  } catch(e){
    console.error("[shopify/connect] Firestore write failed:", e);
    res.status(500).json({ ok:false, error: "فشل حفظ الإعدادات: " + e.message });
    return;
  }

  /* ── Respond with safe summary (NO token echoed back) ── */
  res.status(200).json({
    ok: true,
    store: {
      name: shop.name || "",
      currency: shop.currency || "",
      plan: shop.plan_name || shop.plan_display_name || "",
      email: shop.email || "",
      country: shop.country_name || shop.country || "",
      domain: shop.domain || storeUrl,
      productsCount,
    },
  });
}
