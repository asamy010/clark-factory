/* ═══════════════════════════════════════════════════════════════
   CLARK — GET /api/shopify/status (V19.91 Phase 0)
   ───────────────────────────────────────────────────────────────
   Auth: Bearer <Firebase admin/manager ID token>

   Returns the saved connection metadata WITHOUT the access token.
   Optionally re-pings Shopify (?fresh=1) to verify the token still works.

     {
       ok: true,
       connected: bool,
       storeUrl, apiVersion,
       store: { name, currency, plan, email, country, domain, productsCount? },
       lastConnectedAt, lastConnectedBy,
       lastPingAt? (when fresh=1 and successful),
       pingError? (when fresh=1 and failed)
     }
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";
import { getShopifyCreds, fetchShop, fetchProductsCount } from "./_shopifyAdmin.js";

export default async function handler(req, res){
  setCors(res, req);
  if(req.method === "OPTIONS"){ res.status(204).end(); return; }
  if(req.method !== "GET"){
    res.status(405).json({ ok:false, error: "GET فقط" });
    return;
  }

  /* ── Auth ── */
  const auth = await verifyAdminToken(req.headers.authorization);
  if(!auth.ok){
    res.status(auth.status).json({ ok:false, error: auth.error });
    return;
  }

  /* Read saved config */
  let cfg = {};
  try {
    const db = getDb();
    const snap = await db.collection("factory").doc("config").get();
    if(snap.exists) cfg = (snap.data() && snap.data().shopifyConfig) || {};
  } catch(e){
    res.status(500).json({ ok:false, error: "تعذر قراءة الإعدادات: " + e.message });
    return;
  }

  const connected = !!(cfg.store_url && cfg.api_token);
  const base = {
    ok: true,
    connected,
    storeUrl: cfg.store_url || "",
    apiVersion: cfg.api_version || "2024-10",
    store: {
      name: cfg.shop_name || "",
      currency: cfg.shop_currency || "",
      plan: cfg.shop_plan || "",
      email: cfg.shop_email || "",
      country: cfg.shop_country || "",
      domain: cfg.store_url || "",
    },
    lastConnectedAt: cfg.last_connected_at || null,
    lastConnectedBy: cfg.last_connected_by || null,
  };

  /* Optional fresh ping */
  const fresh = req.query && (req.query.fresh === "1" || req.query.fresh === "true");
  if(fresh && connected){
    try {
      const creds = await getShopifyCreds();
      if(creds){
        const shop = await fetchShop(creds);
        const count = await fetchProductsCount(creds);
        base.store = {
          name: shop?.name || base.store.name,
          currency: shop?.currency || base.store.currency,
          plan: shop?.plan_name || shop?.plan_display_name || base.store.plan,
          email: shop?.email || base.store.email,
          country: shop?.country_name || shop?.country || base.store.country,
          domain: shop?.domain || base.store.domain,
          productsCount: count,
        };
        base.lastPingAt = new Date().toISOString();
      } else {
        base.pingError = "الإعدادات ناقصة — أعد الاتصال";
      }
    } catch(e){
      base.pingError = e.message || "فشل التحقق من الاتصال";
    }
  }

  res.status(200).json(base);
}
