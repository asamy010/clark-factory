/* ═══════════════════════════════════════════════════════════════════════
   CLARK · ShopifyIntegrationPg.jsx (V19.91 — Phase 0)
   ───────────────────────────────────────────────────────────────────────
   Shopify B2C ↔ CLARK B2B integration hub. Implements the Two-Stage
   COD-aware workflow described in `shopify-integration-spec.md` v2.0.

   Phase 0 scope (this MVP):
     • 7 sub-tabs scaffolded (Dashboard, Connection, Products, Orders,
       Invoices, Reconciliation, Settings).
     • Only **Connection** is functional — connect/disconnect/test creds
       via /api/shopify/* endpoints, persist to factory/config.shopifyConfig.
     • The other 6 tabs render "قيد التطوير — Phase 1+" placeholders so
       the user can navigate around without errors.
     • Schema migration (shopify_default customer + 4 CoA accounts +
       defaultshopifyConfig) runs from App.jsx mount.

   Phase 1+ (future): Orders polling, stock reservations, invoice
   generation, inventory push, reconciliation, returns. Each tab becomes
   live as its phase ships.

   Design notes:
     • All Shopify Admin API calls go through /api/shopify/* (server-side)
       so the access token never leaves Vercel. The UI calls those via
       utils/shopify/shopifyClient.js.
     • Defaults that diverge from the spec are documented inline (e.g. the
       inventory-push interval defaults to 5min, not 1min, to fit Shopify
       Basic's 2 req/sec budget on stores with 100+ products).
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useMemo } from "react";
import { Btn, Card, Inp, Sel, Spinner, LoadingBtn, MetricCard } from "../components/ui.jsx";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { ask, tell, askInput, showToast } from "../utils/popups.js";
import {
  shopifyConnect, shopifyStatus, shopifyDisconnect, shopifyOAuthInit,
  shopifySyncOrdersNow, shopifyMarkDelivered, shopifyMarkRefused, shopifySyncProductsNow,
  shopifyProcessReturn, shopifyPushInventoryNow, shopifyUpdateProductSettings,
  shopifyBulkUpdateProducts, shopifySyncProductsWithFilters, shopifyCreateClarkItem,
  shopifySyncCustomers, shopifyUpdateCustomer,
  shopifySyncAbandonedCarts, shopifyUpdateCartRecovery,
  shopifyDiscountCodes,
} from "../utils/shopify/shopifyClient.js";
import { getReservationsForOrder, getReservationsSummary } from "../utils/shopify/stockReservations.js";
import { buildShopifyDailyReport } from "../utils/shopify/dailyReport.js";
import { bostaConfigure, bostaTrack, bostaCreateShipment } from "../utils/bosta/bostaClient.js";
import { BOSTA_BUCKETS, getBucketMeta } from "../utils/bosta/states.js";
import { TIER_META, getTierMeta, buildWhatsAppLink } from "../utils/shopify/customerTiers.js";
import { fmt } from "../utils/format.js";

const SUB_TABS = [
  { key: "dashboard",      label: "📊 لوحة التحكم",     color: "#0EA5E9" },
  { key: "connection",     label: "🔌 الاتصال",         color: "#10B981" },
  { key: "products",       label: "📦 المنتجات",        color: "#F59E0B" },
  { key: "orders",         label: "🛒 الطلبات",         color: "#8B5CF6" },
  { key: "abandoned",      label: "🛍️ السلال المهجورة", color: "#DB2777" },
  { key: "discounts",      label: "🎟 الكوبونات",        color: "#F97316" },
  { key: "customers",      label: "👥 العملاء",         color: "#7C3AED" },
  { key: "shipping",       label: "🚚 الشحن (Bosta)",   color: "#0D9488" },
  { key: "invoices",       label: "🧾 الفواتير",        color: "#06B6D4" },
  { key: "reconciliation", label: "🔄 المطابقة",         color: "#EC4899" },
  { key: "settings",       label: "⚙️ الإعدادات",       color: "#64748B" },
];

const SHOPIFY_GREEN = "#96BF48";

export function ShopifyIntegrationPg({ data, upConfig, isMob, canEdit, user }){
  const [activeTab, setActiveTab] = useState("connection");

  /* Read live shopifyConfig from factory/config (server is source of truth
     for credentials — UI mirrors via the live data prop, but the token is
     never returned from the API for safety). */
  const shopifyConfig = data?.shopifyConfig || {};

  /* V19.92: Detect OAuth callback redirect.
     When /api/shopify/oauth-callback finishes (success or fail), it 302s
     back to /?tab=shopify&shopify_connected=1 (or &shopify_error=…). We
     surface the result to the user and clean the URL so a refresh doesn't
     re-trigger the toast. */
  useEffect(() => {
    if(typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const ok = params.get("shopify_connected");
    const err = params.get("shopify_error");
    if(ok === "1"){
      const shop = params.get("shop") || "";
      showToast("✅ تم الاتصال بـ Shopify" + (shop ? " (" + shop + ")" : ""));
      setActiveTab("connection"); /* show the summary */
    } else if(err){
      tell("⛔ فشل الاتصال بـ Shopify\n\n" + err);
      setActiveTab("connection");
    }
    if(ok || err){
      /* Strip the params so a refresh doesn't repeat the toast. Keep the
         tab=shopify part so the user stays on this tab. */
      const url = new URL(window.location.href);
      url.searchParams.delete("shopify_connected");
      url.searchParams.delete("shopify_error");
      url.searchParams.delete("shop");
      url.searchParams.delete("products");
      window.history.replaceState({}, "", url.pathname + (url.search || ""));
    }
  }, []);

  return (
    <div style={{ padding: isMob ? 8 : 16, direction: "rtl" }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, " + SHOPIFY_GREEN + "12, " + SHOPIFY_GREEN + "04)",
        border: "1px solid " + SHOPIFY_GREEN + "25",
        borderRadius: 14,
        padding: isMob ? 14 : 18,
        marginBottom: 14,
        display: "flex",
        alignItems: "center",
        gap: 14,
        flexWrap: "wrap",
      }}>
        <div style={{
          width: isMob ? 44 : 52,
          height: isMob ? 44 : 52,
          borderRadius: 12,
          background: SHOPIFY_GREEN + "20",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: isMob ? 24 : 28,
        }}>🛍️</div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: isMob ? FS + 1 : FS + 3, fontWeight: 800, color: T.text, marginBottom: 2 }}>
            Shopify Integration
          </div>
          <div style={{ fontSize: FS - 1, color: T.textSec }}>
            Two-Stage COD Workflow · SKU = model_no · Source of Truth: CLARK
          </div>
        </div>
        <ConnectionPill shopifyConfig={shopifyConfig} />
      </div>

      {/* Sub-tabs nav */}
      <div style={{
        display: "flex",
        gap: 6,
        marginBottom: 14,
        background: T.bg,
        padding: 4,
        borderRadius: 10,
        border: "1px solid " + T.brd,
        overflowX: "auto",
        scrollbarWidth: "thin",
      }}>
        {SUB_TABS.map(t => {
          const active = activeTab === t.key;
          return (
            <div
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                cursor: "pointer",
                padding: isMob ? "8px 10px" : "9px 14px",
                borderRadius: 8,
                fontSize: isMob ? FS - 2 : FS - 1,
                fontWeight: active ? 800 : 600,
                color: active ? "#fff" : T.text,
                background: active ? t.color : "transparent",
                whiteSpace: "nowrap",
                transition: "all 0.15s",
                boxShadow: active ? "0 2px 8px " + t.color + "55" : "none",
              }}
            >
              {t.label}
            </div>
          );
        })}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "connection"     && <ConnectionTab data={data} upConfig={upConfig} canEdit={canEdit} user={user} isMob={isMob} />}
        {activeTab === "dashboard"      && <DashboardTab data={data} isMob={isMob} setActiveTab={setActiveTab} />}
        {activeTab === "products"       && <ProductsTab data={data} canEdit={canEdit} user={user} isMob={isMob} />}
        {activeTab === "orders"         && <OrdersTab data={data} upConfig={upConfig} canEdit={canEdit} user={user} isMob={isMob} />}
        {activeTab === "customers"      && <CustomersTab data={data} canEdit={canEdit} user={user} isMob={isMob} />}
        {activeTab === "abandoned"      && <AbandonedCartsTab data={data} canEdit={canEdit} user={user} isMob={isMob} />}
        {activeTab === "discounts"      && <DiscountCodesTab data={data} canEdit={canEdit} user={user} isMob={isMob} />}
        {activeTab === "shipping"       && <ShippingTab data={data} canEdit={canEdit} user={user} isMob={isMob} />}
        {activeTab === "invoices"       && <ShopifyInvoicesTab data={data} isMob={isMob} />}
        {activeTab === "reconciliation" && <ReconciliationTab data={data} canEdit={canEdit} user={user} isMob={isMob} setActiveTab={setActiveTab} />}
        {activeTab === "settings"       && <SettingsTab data={data} upConfig={upConfig} canEdit={canEdit} user={user} isMob={isMob} />}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Connection status pill — shown in the page header
   ═══════════════════════════════════════════════════════════════════════ */
function ConnectionPill({ shopifyConfig }){
  const connected = !!shopifyConfig?.connected && !!shopifyConfig?.store_url;
  const color = connected ? "#10B981" : "#94A3B8";
  const dot = connected ? "●" : "○";
  return (
    <div style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "8px 14px",
      borderRadius: 10,
      background: color + "12",
      border: "1px solid " + color + "30",
      fontSize: FS - 1,
      fontWeight: 700,
      color,
    }}>
      <span style={{ fontSize: 16, lineHeight: 1 }}>{dot}</span>
      <span>{connected ? "متصل" : "غير متصل"}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   ConnectionTab — Phase 0 functional tab
   ───────────────────────────────────────────────────────────────────────
   Lets the admin paste the Shopify store URL + Admin API access token,
   test the connection (which calls Shopify's /shop.json server-side),
   and save. Shows the resulting shop summary on success.

   Security: the token is sent ONCE during connect; afterwards the UI never
   sees it again. The status endpoint returns metadata only.
   ═══════════════════════════════════════════════════════════════════════ */
function ConnectionTab({ data, upConfig, canEdit, user, isMob }){
  const cfg = data?.shopifyConfig || {};
  const [storeUrl, setStoreUrl] = useState(cfg.store_url || "");
  const [token, setToken] = useState("");
  const [apiVersion, setApiVersion] = useState(cfg.api_version || "2024-10");
  const [busy, setBusy] = useState(false);
  const [pingBusy, setPingBusy] = useState(false);
  const [storeInfo, setStoreInfo] = useState(null);
  const [pingError, setPingError] = useState("");
  /* V19.92: collapse the manual-token form by default and steer users to
     the OAuth flow. Manual entry stays available for legacy custom apps
     and for users who already have a working shpat_ token from elsewhere. */
  const [showManual, setShowManual] = useState(false);

  const connected = !!cfg.connected && !!cfg.store_url;

  /* Build a "store summary" object we can render — prefer fresh data from
     status?fresh=1, fall back to whatever was saved at connect time. */
  const summary = storeInfo || (connected ? {
    name: cfg.shop_name,
    currency: cfg.shop_currency,
    plan: cfg.shop_plan,
    email: cfg.shop_email,
    country: cfg.shop_country,
    domain: cfg.store_url,
    productsCount: null,
  } : null);

  /* On mount: if connected, try a fresh ping to surface any token issues
     (e.g. user revoked the app in Shopify admin). Silent if it fails. */
  useEffect(() => {
    if(!connected) return;
    let cancelled = false;
    (async () => {
      setPingBusy(true);
      try {
        const r = await shopifyStatus(user);
        if(cancelled) return;
        if(r && r.store) setStoreInfo(r.store);
        if(r && r.pingError) setPingError(r.pingError);
      } catch(_){
        /* swallow — initial ping is best-effort */
      } finally {
        if(!cancelled) setPingBusy(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  /* V19.92: OAuth 2.0 install flow — the recommended path for new
     Dev Dashboard apps (since legacy custom apps are deprecated).
     Calls /api/shopify/oauth-init to build the Shopify authorize URL,
     then redirects the browser. After approval, Shopify bounces back
     to /api/shopify/oauth-callback which saves the shpat_ token and
     302s back to /?tab=shopify&shopify_connected=1.

     The page-level useEffect at the top of ShopifyIntegrationPg picks
     up the success/error flag and shows a toast. */
  const handleOAuthInit = async () => {
    if(!canEdit){ showToast("⛔ مفيش صلاحية تعديل"); return; }
    const cleanUrl = String(storeUrl || "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
    if(!cleanUrl){ showToast("⚠️ ادخل Store URL أولاً (مثال: clarkstore.myshopify.com)"); return; }
    setBusy(true);
    try {
      const r = await shopifyOAuthInit({ storeUrl: cleanUrl }, user);
      if(r && r.ok && r.authUrl){
        /* Redirect the entire window — the OAuth flow is multi-step and
           lives outside our SPA. We come back via the callback redirect. */
        window.location.href = r.authUrl;
        /* No setBusy(false) — page is unloading */
      } else {
        showToast("⛔ " + (r?.error || "فشل بدء OAuth"));
        setBusy(false);
      }
    } catch(e){
      const msg = e.message || "فشل بدء OAuth";
      /* Common case: env vars missing on Vercel. Show a descriptive popup. */
      if(/SHOPIFY_CLIENT_ID|SHOPIFY_CLIENT_SECRET|DELIVERY_CONFIRM_SECRET/i.test(msg)){
        await tell("⚙️ مفيش env vars مضبوطة على Vercel\n\n" + msg + "\n\nروح Vercel Dashboard → Settings → Environment Variables واضبطهم.");
      } else {
        showToast("⛔ " + msg);
      }
      setBusy(false);
    }
  };

  const handleConnect = async () => {
    if(!canEdit){ showToast("⛔ مفيش صلاحية تعديل"); return; }
    const cleanUrl = String(storeUrl || "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
    if(!cleanUrl){ showToast("⚠️ ادخل Store URL"); return; }
    if(!token.trim()){ showToast("⚠️ ادخل الـ Access Token"); return; }
    setBusy(true);
    setPingError("");
    try {
      const r = await shopifyConnect({
        storeUrl: cleanUrl,
        accessToken: token.trim(),
        apiVersion: (apiVersion || "2024-10").trim(),
      }, user);
      if(r && r.ok){
        setStoreInfo(r.store || null);
        setToken(""); /* never keep the token in UI state */
        showToast("✅ تم الاتصال بـ " + (r.store?.name || cleanUrl));
        /* Refresh the live data prop — the API already wrote to Firestore,
           the onSnapshot listener in App.jsx will pull it shortly. As a UX
           shortcut we also push the public fields via upConfig so the pill
           flips green immediately without waiting for the snapshot. */
        upConfig(d => {
          if(!d.shopifyConfig) d.shopifyConfig = {};
          d.shopifyConfig.store_url = cleanUrl;
          d.shopifyConfig.api_version = (apiVersion || "2024-10").trim();
          d.shopifyConfig.connected = true;
          d.shopifyConfig.shop_name = r.store?.name || "";
          d.shopifyConfig.shop_currency = r.store?.currency || "";
          d.shopifyConfig.shop_plan = r.store?.plan || "";
          d.shopifyConfig.shop_email = r.store?.email || "";
          d.shopifyConfig.shop_country = r.store?.country || "";
          d.shopifyConfig.last_connected_at = new Date().toISOString();
        });
      } else {
        showToast("⛔ " + (r?.error || "فشل الاتصال"));
      }
    } catch(e){
      showToast("⛔ " + (e.message || "فشل الاتصال"));
    } finally {
      setBusy(false);
    }
  };

  const handleTestOnly = async () => {
    if(!canEdit){ showToast("⛔ مفيش صلاحية تعديل"); return; }
    const cleanUrl = String(storeUrl || "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
    if(!cleanUrl || !token.trim()){
      showToast("⚠️ ادخل URL والـ token عشان أعمل test");
      return;
    }
    /* V19.91.1: catch the common Client-Secret confusion early */
    const t = token.trim();
    if(/^shpss_/i.test(t)){
      await tell("⚠️ ده Client Secret مش Access Token!\n\nالـ shpss_ بيبدأ بيها الـ Client Secret اللي للـ OAuth flow بس — مش بيشتغل مع الـ Admin API.\n\nاللي محتاجه: روح API credentials tab → Install app → Reveal Admin API access token. التوكين الصح بيبدأ بـ shpat_");
      return;
    }
    if(/^shpca_/i.test(t)){
      await tell("⚠️ ده Collaborator token — مش بيشتغل مع الـ Admin API.\n\nاللي محتاجه: التوكين اللي بيبدأ بـ shpat_ (من Install app أو Create token في API credentials tab).");
      return;
    }
    if(!/^(shpat_|shppa_|atkn_)/i.test(t)){
      await tell("⚠️ صيغة الـ Access Token غير معروفة.\n\nالصيغ المقبولة:\n• shpat_ — Custom app Admin API token\n• atkn_ — Dev Dashboard App automation token\n• shppa_ — Shopify Partners token\n\nشيك إنك ناسخ الـ token الصح من Shopify.");
      return;
    }
    setBusy(true);
    try {
      /* Test = same call as connect, but we let the server save creds and
         then immediately tell the user — there's no separate "test only"
         endpoint to avoid duplicating the auth/validation logic. The user
         can disconnect afterwards if they don't want to keep the creds. */
      const r = await shopifyConnect({
        storeUrl: cleanUrl,
        accessToken: token.trim(),
        apiVersion: (apiVersion || "2024-10").trim(),
      }, user);
      if(r && r.ok){
        setStoreInfo(r.store || null);
        setToken("");
        await tell("نجح الاتصال بـ Shopify ✅\n\nالاسم: " + (r.store?.name || "—") +
                   "\nالعملة: " + (r.store?.currency || "—") +
                   "\nالخطة: " + (r.store?.plan || "—") +
                   "\nعدد المنتجات: " + (r.store?.productsCount ?? "—"));
        upConfig(d => {
          if(!d.shopifyConfig) d.shopifyConfig = {};
          d.shopifyConfig.store_url = cleanUrl;
          d.shopifyConfig.api_version = (apiVersion || "2024-10").trim();
          d.shopifyConfig.connected = true;
          d.shopifyConfig.shop_name = r.store?.name || "";
          d.shopifyConfig.shop_currency = r.store?.currency || "";
          d.shopifyConfig.shop_plan = r.store?.plan || "";
          d.shopifyConfig.shop_email = r.store?.email || "";
          d.shopifyConfig.shop_country = r.store?.country || "";
          d.shopifyConfig.last_connected_at = new Date().toISOString();
        });
      } else {
        showToast("⛔ " + (r?.error || "فشل الاختبار"));
      }
    } catch(e){
      showToast("⛔ " + (e.message || "فشل الاختبار"));
    } finally {
      setBusy(false);
    }
  };

  const handleRefreshPing = async () => {
    if(!connected) return;
    setPingBusy(true);
    setPingError("");
    try {
      /* Fetch fresh status with ?fresh=1 */
      const idToken = await user.getIdToken();
      const r = await fetch("/api/shopify/status?fresh=1", {
        headers: { "Authorization": "Bearer " + idToken },
      });
      const j = await r.json();
      if(r.ok && j.ok){
        setStoreInfo(j.store || null);
        if(j.pingError) setPingError(j.pingError);
        else showToast("✅ الاتصال شغّال");
      } else {
        setPingError(j?.error || "فشل الاختبار");
      }
    } catch(e){
      setPingError(e.message || "فشل الاختبار");
    } finally {
      setPingBusy(false);
    }
  };

  const handleDisconnect = async () => {
    if(!canEdit){ showToast("⛔ مفيش صلاحية تعديل"); return; }
    const yes = await ask("⚠️ تأكيد قطع الاتصال", "هتقطع الاتصال بـ Shopify. الـ token هيتمسح. مفيش بيانات هتتمسح، بس الطلبات الجديدة مش هتتسحب لحد ما تعيد الاتصال. تأكيد؟");
    if(!yes) return;
    setBusy(true);
    try {
      const r = await shopifyDisconnect(user);
      if(r && r.ok){
        setStoreInfo(null);
        setStoreUrl("");
        setToken("");
        showToast("🔌 تم قطع الاتصال");
        upConfig(d => {
          if(!d.shopifyConfig) d.shopifyConfig = {};
          d.shopifyConfig.connected = false;
          d.shopifyConfig.store_url = "";
          d.shopifyConfig.shop_name = "";
          d.shopifyConfig.shop_currency = "";
          d.shopifyConfig.shop_plan = "";
          d.shopifyConfig.shop_email = "";
          d.shopifyConfig.shop_country = "";
          d.shopifyConfig.disconnected_at = new Date().toISOString();
        });
      } else {
        showToast("⛔ " + (r?.error || "فشل القطع"));
      }
    } catch(e){
      showToast("⛔ " + (e.message || "فشل القطع"));
    } finally {
      setBusy(false);
    }
  };

  const labelStyle = { display: "block", fontSize: FS - 1, color: T.textSec, fontWeight: 700, marginBottom: 6 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* V19.92: OAuth-first setup card */}
      {!connected && (
        <Card title="🔐 إعداد الاتصال — OAuth (الموصى به)">
          <div style={{ fontSize: FS - 1, lineHeight: 1.9, color: T.textSec }}>
            <div style={{ fontWeight: 800, color: T.text, marginBottom: 10, fontSize: FS }}>
              📋 خطوات الإعداد لمرة واحدة (5 دقايق)
            </div>

            <div style={{ marginBottom: 6 }}><b>1)</b> في Shopify Dev Dashboard → CLARK Integration → <b>Configuration</b>:</div>
            <div style={{ marginInlineStart: 16, marginBottom: 8 }}>
              • أضف الـ scopes دي (لو لسه):
              <div style={{ background: T.bg, padding: 10, borderRadius: 6, marginTop: 4, fontFamily: "monospace", fontSize: FS - 3 }}>
                read_orders, read_all_orders, read_products, write_products,<br/>
                read_inventory, write_inventory, read_locations,<br/>
                read_fulfillments, read_customers
              </div>
            </div>

            <div style={{ marginBottom: 6 }}><b>2)</b> أضف الـ redirect URL:</div>
            <div style={{ marginInlineStart: 16, marginBottom: 8 }}>
              <div style={{ background: T.bg, padding: 10, borderRadius: 6, fontFamily: "monospace", fontSize: FS - 3, color: T.accent, wordBreak: "break-all" }}>
                {typeof window !== "undefined" ? window.location.origin : "https://your-vercel-url"}/api/shopify/oauth-callback
              </div>
              <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 4 }}>
                Configuration → Allowed redirection URLs → أضف الـ URL ده بالظبط
              </div>
            </div>

            <div style={{ marginBottom: 6 }}><b>3)</b> Release version جديدة بعد التعديلات (Versions → New version)</div>

            <div style={{ marginBottom: 6 }}><b>4)</b> في Vercel → Settings → Environment Variables، أضف:</div>
            <div style={{ marginInlineStart: 16, marginBottom: 8 }}>
              <div style={{ background: T.bg, padding: 10, borderRadius: 6, fontFamily: "monospace", fontSize: FS - 3 }}>
                SHOPIFY_CLIENT_ID = <span style={{ color: T.accent }}>(من Settings → Credentials)</span><br/>
                SHOPIFY_CLIENT_SECRET = <span style={{ color: T.accent }}>(الـ shpss_… بعد Rotate)</span><br/>
                DELIVERY_CONFIRM_SECRET = <span style={{ color: T.textMut }}>(لو لسه مضبوط، اعمل أي string عشوائي 32+ حرف)</span>
              </div>
              <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 4 }}>
                بعد ما تضيفهم، Vercel هـ يـ redeploy تلقائياً (دقيقة واحدة).
              </div>
            </div>

            <div style={{ marginBottom: 4 }}><b>5)</b> ادخل الـ Store URL تحت واضغط "اتصل بـ Shopify"</div>

            <div style={{
              marginTop: 14,
              padding: "10px 12px",
              borderRadius: 8,
              background: "#FEF3C7",
              border: "1px solid #F59E0B40",
              color: "#92400E",
              fontSize: FS - 2,
              fontWeight: 600,
              lineHeight: 1.7,
            }}>
              ⚠️ <b>أمان:</b> الـ Client Secret اللي ظهر في الـ screenshots قبل كده <b>محتاج Rotate</b> فوراً (Dev Dashboard → Settings → Credentials → Rotate). استخدم القيمة الجديدة في Vercel.
            </div>
          </div>
        </Card>
      )}

      {/* OAuth Connect button — primary path */}
      {!connected && (
        <Card title="🚀 اتصل بـ Shopify (OAuth)">
          <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 200px", gap: 12, alignItems: "end" }}>
            <div>
              <label style={labelStyle}>Store URL</label>
              <Inp
                value={storeUrl}
                onChange={setStoreUrl}
                placeholder="clarkstore.myshopify.com"
              />
              <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 4 }}>
                بدون https:// — الـ <b>myshopify.com</b> subdomain فقط (مش الدومين الـ custom)
              </div>
            </div>
            <LoadingBtn
              primary
              loading={busy}
              loadingText="جاري التحويل..."
              onClick={handleOAuthInit}
              disabled={!canEdit}
              style={{ minHeight: 44, fontWeight: 800 }}
            >
              🔗 اتصل بـ Shopify
            </LoadingBtn>
          </div>
          <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 10, lineHeight: 1.7 }}>
            🔒 ضغطك على الزر هيـ redirect-ك لـ Shopify عشان توافق على الـ scopes. بعد الموافقة، هترجع هنا تلقائياً والـ token هـ يتحفظ server-side.
          </div>

          {/* Fallback: manual token entry — for legacy custom apps */}
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px dashed " + T.brd }}>
            <div
              onClick={() => setShowManual(s => !s)}
              style={{ cursor: "pointer", fontSize: FS - 2, color: T.textSec, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}
            >
              <span>{showManual ? "▼" : "◀"}</span>
              <span>عندك توكين shpat_ جاهز؟ (من legacy custom app)</span>
            </div>
            {showManual && (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={labelStyle}>API Version</label>
                    <Sel value={apiVersion} onChange={setApiVersion}>
                      <option value="2024-10">2024-10 (الموصى به)</option>
                      <option value="2024-07">2024-07</option>
                      <option value="2024-04">2024-04</option>
                      <option value="2024-01">2024-01</option>
                    </Sel>
                  </div>
                </div>
                <label style={labelStyle}>Admin API Access Token</label>
                <Inp
                  value={token}
                  onChange={setToken}
                  placeholder="shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  type="password"
                />
                <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 4, marginBottom: 10 }}>
                  ⚠️ بس للـ legacy custom apps. الأبس الجديدة في 2026+ لازم OAuth.
                </div>
                <LoadingBtn loading={busy} loadingText="جاري الاختبار..." onClick={handleTestOnly} disabled={!canEdit}>
                  🔍 اختبار + حفظ يدوي
                </LoadingBtn>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Credentials form — shown when connected */}
      {connected && (
      <Card title="🔌 بيانات الاتصال (متصل)">
        <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Store URL</label>
            <Inp
              value={storeUrl}
              onChange={setStoreUrl}
              placeholder="clarkstore.myshopify.com"
            />
            <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 4 }}>بدون https:// — الـ subdomain فقط</div>
          </div>
          <div>
            <label style={labelStyle}>API Version</label>
            <Sel value={apiVersion} onChange={setApiVersion}>
              <option value="2024-10">2024-10 (الموصى به)</option>
              <option value="2024-07">2024-07</option>
              <option value="2024-04">2024-04</option>
              <option value="2024-01">2024-01</option>
            </Sel>
          </div>
        </div>

        {cfg.connected_via === "oauth" && (
          <div style={{ marginTop: 12, padding: "8px 12px", borderRadius: 8, background: T.ok + "12", border: "1px solid " + T.ok + "30", color: T.ok, fontSize: FS - 2, fontWeight: 600 }}>
            ✅ متصل عبر OAuth — التوكين دائم (مفيش expiry)
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <label style={labelStyle}>
            Admin API Access Token
            <span style={{ marginInlineStart: 8, fontSize: FS - 2, color: T.ok, fontWeight: 600 }}>(محفوظ — مش لازم تدخله تاني إلا لو هتغيّره)</span>
          </label>
          <Inp
            value={token}
            onChange={setToken}
            placeholder="اسيبه فاضي للحفاظ على التوكين الحالي، أو ادخل توكين جديد للتحديث"
            type="password"
          />
          <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 4 }}>
            ⚠️ التوكين بـ يتخزن server-side فقط ومش بيظهر في الـ UI تاني. لو نسيته، أعد الاتصال عبر OAuth.
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          <LoadingBtn primary loading={busy} loadingText="جاري التحديث..." onClick={handleConnect} disabled={!canEdit || !token.trim()}>
            💾 تحديث التوكين يدوياً
          </LoadingBtn>
          <LoadingBtn loading={pingBusy} loadingText="جاري التحقق..." onClick={handleRefreshPing}>
            🔄 اختبار الاتصال
          </LoadingBtn>
          <LoadingBtn loading={busy} loadingText="جاري التحويل..." onClick={handleOAuthInit} disabled={!canEdit}>
            🔗 إعادة الاتصال عبر OAuth
          </LoadingBtn>
          <LoadingBtn danger loading={busy} loadingText="..." onClick={handleDisconnect} disabled={!canEdit}>
            🔌 قطع الاتصال
          </LoadingBtn>
        </div>

        {pingError && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: T.err + "10", border: "1px solid " + T.err + "30", color: T.err, fontSize: FS - 1, fontWeight: 600 }}>
            ⚠️ {pingError}
          </div>
        )}
      </Card>
      )}

      {/* Store summary */}
      {summary && connected && (
        <Card title="🏪 معلومات المتجر">
          <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10 }}>
            <MetricCard label="الاسم" value={summary.name || "—"} icon="🏪" color="#0EA5E9" />
            <MetricCard label="العملة" value={summary.currency || "—"} icon="💰" color="#10B981" />
            <MetricCard label="الخطة" value={summary.plan || "—"} icon="📊" color="#8B5CF6" />
            <MetricCard label="المنتجات" value={summary.productsCount != null ? String(summary.productsCount) : "—"} icon="📦" color="#F59E0B" />
          </div>
          <div style={{ marginTop: 12, fontSize: FS - 1, color: T.textSec }}>
            <div>🌐 <b>الدومين:</b> {summary.domain || "—"}</div>
            {summary.email && <div>📧 <b>البريد:</b> {summary.email}</div>}
            {summary.country && <div>🌍 <b>البلد:</b> {summary.country}</div>}
            {cfg.last_connected_at && <div>🕐 <b>آخر اتصال:</b> {new Date(cfg.last_connected_at).toLocaleString("ar-EG")}</div>}
          </div>
        </Card>
      )}

      {/* Phase status */}
      <Card title="📋 حالة التنفيذ">
        <div style={{ fontSize: FS - 1, lineHeight: 1.9, color: T.textSec }}>
          <PhaseDone num="0" title="Foundation" desc="Tab + Connection + Schema migration + 4 CoA accounts + shopify_default customer" />
          <PhaseDone num="0.5" title="OAuth 2.0 install" desc="Replace deprecated legacy custom apps with the official OAuth flow" />
          <PhaseDone num="1" title="Read & Display" desc="Orders polling cron + manual sync + filter/search + status mgmt" />
          <PhaseDone num="2" title="Stock Reservation" desc="Auto-reserve on order, auto-release on refusal, daily TTL cleanup" />
          <PhaseDone num="3" title="Invoice Generation" desc="Auto-create draft invoice on delivery + commit reservations + Process Return → Credit Note" />
          <PhaseDone num="4" title="Inventory Push" desc="Push computed available qty to Shopify (physical − reservations − buffer), per-product settings" />
          <PhaseDone num="5" title="Dashboard + Reconciliation" desc="Comprehensive overview, top products, alerts, stale order resolution, daily reconciliation" />
          <PhaseDone num="6" title="Polish + Daily Report" desc="WhatsApp-ready daily report generator with copy-to-clipboard + WhatsApp share link" />
          <div style={{ marginTop: 16, padding: 12, background: T.ok + "10", border: "1px solid " + T.ok + "30", borderRadius: 8 }}>
            <div style={{ fontSize: FS, fontWeight: 800, color: T.ok }}>🎉 الـ integration كامل!</div>
            <div style={{ fontSize: FS - 2, color: T.textSec, marginTop: 4 }}>
              كل الـ 7 phases خلصت. Two-Stage COD Workflow بـ يشتغل end-to-end. الـ documentation كاملة في الـ CHANGELOG.
            </div>
          </div>
        </div>
      </Card>

    </div>
  );
}

function PhasePending({ num, title, desc }){
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: T.textMut, fontWeight: 800 }}>○ Phase {num} — {title}</span>
      </div>
      <div style={{ marginInlineStart: 24, fontSize: FS - 2, color: T.textMut }}>{desc}</div>
    </div>
  );
}

function PhaseDone({ num, title, desc }){
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: T.ok, fontWeight: 800 }}>✅ Phase {num} — {title}</span>
      </div>
      <div style={{ marginInlineStart: 24, fontSize: FS - 2, color: T.textSec }}>{desc}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   PlaceholderTab — used by Dashboard / Products / Orders / Invoices /
   Reconciliation. Shows "قيد التطوير" + a description of what's coming.
   ═══════════════════════════════════════════════════════════════════════ */
function PlaceholderTab({ title, phase, desc, shopifyConfig }){
  const connected = !!shopifyConfig?.connected;
  return (
    <Card title={"🚧 " + title}>
      <div style={{ textAlign: "center", padding: "30px 16px" }}>
        <div style={{ fontSize: 48, marginBottom: 10, opacity: 0.5 }}>🛠️</div>
        <div style={{ fontSize: FS + 2, fontWeight: 800, color: T.text, marginBottom: 8 }}>قيد التطوير</div>
        <div style={{ display: "inline-block", padding: "4px 12px", borderRadius: 6, background: "#8B5CF615", color: "#8B5CF6", fontSize: FS - 2, fontWeight: 700, marginBottom: 14 }}>
          {phase}
        </div>
        <div style={{ fontSize: FS - 1, color: T.textSec, lineHeight: 1.8, maxWidth: 540, margin: "0 auto" }}>
          {desc}
        </div>
        {!connected && (
          <div style={{ marginTop: 16, padding: 12, background: "#F59E0B15", border: "1px solid #F59E0B30", borderRadius: 8, fontSize: FS - 2, color: "#92400E", fontWeight: 600, maxWidth: 420, margin: "16px auto 0" }}>
            ℹ️ ابدأ بإعداد الاتصال في تاب "🔌 الاتصال" قبل تنفيذ الـ Phase ده.
          </div>
        )}
      </div>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   SettingsTab — read-only-ish view of the shopifyConfig.
   Phase 0 lets the admin tweak the cosmetic flags (intervals, safety
   buffer, notification phone) but the heavy stuff (account mappings, COA
   selectors) ships with Phase 3+ where they actually wire into posting.
   ═══════════════════════════════════════════════════════════════════════ */
function SettingsTab({ data, upConfig, canEdit, user, isMob }){
  const cfg = data?.shopifyConfig || {};
  const setField = (key, value) => upConfig(d => {
    if(!d.shopifyConfig) d.shopifyConfig = {};
    d.shopifyConfig[key] = value;
  });
  const setNested = (parent, key, value) => upConfig(d => {
    if(!d.shopifyConfig) d.shopifyConfig = {};
    if(!d.shopifyConfig[parent] || typeof d.shopifyConfig[parent] !== "object") d.shopifyConfig[parent] = {};
    d.shopifyConfig[parent][key] = value;
  });
  const labelStyle = { display: "block", fontSize: FS - 1, color: T.textSec, fontWeight: 700, marginBottom: 6 };

  const numeric = (v, def = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  };

  const toggleNotify = (k) => setNested("notify_on", k, !(cfg?.notify_on || {})[k]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      <Card title="🔄 المزامنة">
        <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Polling Orders (دقايق)</label>
            <Inp
              type="number"
              value={String(numeric(cfg.polling_interval_min, 5))}
              onChange={v => setField("polling_interval_min", Math.max(1, Math.min(60, numeric(v, 5))))}
              readOnly={!canEdit}
            />
          </div>
          <div>
            <label style={labelStyle}>Push Inventory (دقايق)</label>
            <Inp
              type="number"
              value={String(numeric(cfg.inventory_push_interval_min, 5))}
              onChange={v => setField("inventory_push_interval_min", Math.max(1, Math.min(60, numeric(v, 5))))}
              readOnly={!canEdit}
            />
          </div>
          <div>
            <label style={labelStyle}>Check Fulfillments (دقايق)</label>
            <Inp
              type="number"
              value={String(numeric(cfg.fulfillment_check_interval_min, 10))}
              onChange={v => setField("fulfillment_check_interval_min", Math.max(1, Math.min(60, numeric(v, 10))))}
              readOnly={!canEdit}
            />
          </div>
        </div>
        <div style={{ marginTop: 8, fontSize: FS - 3, color: T.textMut }}>
          💡 Shopify Basic = 2 calls/sec — لو عندك 100+ منتج، خلّي الـ Push Inventory ≥ 5 دقايق.
        </div>
      </Card>

      <Card title="🛒 Workflow الطلبات">
        <CheckLine
          label="حجز المخزون تلقائياً عند ورود طلب"
          checked={cfg.auto_reserve_stock !== false}
          onChange={v => setField("auto_reserve_stock", v)}
          disabled={!canEdit}
        />
        <CheckLine
          label="إنشاء فاتورة تلقائياً عند Shopify fulfillment"
          checked={cfg.auto_create_invoice_on_fulfillment !== false}
          onChange={v => setField("auto_create_invoice_on_fulfillment", v)}
          disabled={!canEdit}
        />
        <CheckLine
          label="تحرير المخزون تلقائياً عند رفض الاستلام"
          checked={cfg.auto_release_on_refusal !== false}
          onChange={v => setField("auto_release_on_refusal", v)}
          disabled={!canEdit}
        />
        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>مهلة Pending Order (أيام)</label>
            <Inp
              type="number"
              value={String(numeric(cfg.pending_order_timeout_days, 7))}
              onChange={v => setField("pending_order_timeout_days", Math.max(1, Math.min(30, numeric(v, 7))))}
              readOnly={!canEdit}
            />
            <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 4 }}>
              Default 7 أيام (الشحن المصري COD غالباً &lt; أسبوع).
            </div>
          </div>
          <div>
            <label style={labelStyle}>Safety Buffer افتراضي (قطع)</label>
            <Inp
              type="number"
              value={String(numeric(cfg.default_safety_buffer, 5))}
              onChange={v => setField("default_safety_buffer", Math.max(0, Math.min(100, numeric(v, 5))))}
              readOnly={!canEdit}
            />
          </div>
        </div>
      </Card>

      <Card title="💰 الحسابات المحاسبية (Codes — Phase 3+)">
        <div style={{ fontSize: FS - 2, color: T.textMut, marginBottom: 10 }}>
          الكودات دي بـ تـ resolve لـ id من الـ Chart of Accounts عند الـ posting. لو غيّرت الكود، تأكد إن الحساب موجود في tab المحاسبة.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 1fr", gap: 12 }}>
          <Field label="حساب الكاش (MAIN)" value={cfg?.treasury_accounts?.cash || "1110"} onChange={v => setNested("treasury_accounts", "cash", v)} disabled={!canEdit} />
          <Field label="حساب الإيرادات" value={cfg?.treasury_accounts?.revenue || "4101.02"} onChange={v => setNested("treasury_accounts", "revenue", v)} disabled={!canEdit} />
          <Field label="حساب الشحن" value={cfg?.treasury_accounts?.shipping || "4102.01"} onChange={v => setNested("treasury_accounts", "shipping", v)} disabled={!canEdit} />
          <Field label="حساب المرتجعات" value={cfg?.treasury_accounts?.returns || "6201.01"} onChange={v => setNested("treasury_accounts", "returns", v)} disabled={!canEdit} />
          <Field label="حساب Pending Cash (online-paid)" value={cfg?.treasury_accounts?.pending_cash || "1100.05"} onChange={v => setNested("treasury_accounts", "pending_cash", v)} disabled={!canEdit} />
        </div>
      </Card>

      <Card title="👤 العميل الافتراضي">
        <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 1fr", gap: 12 }}>
          <Field label="معرّف العميل (Customer ID)" value={cfg.default_customer_id || "shopify_default"} onChange={v => setField("default_customer_id", v)} disabled={!canEdit} />
        </div>
        <CheckLine
          label="حفظ معلومات العميل الفعلية على الفاتورة (الاسم/التليفون/العنوان)"
          checked={cfg.store_customer_info_in_invoice !== false}
          onChange={v => setField("store_customer_info_in_invoice", v)}
          disabled={!canEdit}
        />
      </Card>

      {/* V20.1 Phase 9: Bosta integration settings */}
      <BostaSettingsCard data={data} canEdit={canEdit} user={user} isMob={isMob} />

      <Card title="🚨 التنبيهات (WhatsApp)">
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>رقم الإشعارات</label>
          <Inp value={cfg.notification_phone || ""} onChange={v => setField("notification_phone", v)} placeholder="+20100..." readOnly={!canEdit} />
        </div>
        <CheckLine label="طلب جديد" checked={cfg?.notify_on?.new_order !== false} onChange={() => toggleNotify("new_order")} disabled={!canEdit} />
        <CheckLine label="طلبات Pending قديمة" checked={cfg?.notify_on?.stale_pending !== false} onChange={() => toggleNotify("stale_pending")} disabled={!canEdit} />
        <CheckLine label="SKU mismatch" checked={cfg?.notify_on?.sku_mismatch !== false} onChange={() => toggleNotify("sku_mismatch")} disabled={!canEdit} />
        <CheckLine label="أخطاء المزامنة" checked={cfg?.notify_on?.sync_error !== false} onChange={() => toggleNotify("sync_error")} disabled={!canEdit} />
        <CheckLine label="ملخص يومي" checked={!!cfg?.notify_on?.daily_summary} onChange={() => toggleNotify("daily_summary")} disabled={!canEdit} />
      </Card>

    </div>
  );
}

function Field({ label, value, onChange, disabled }){
  return (
    <div>
      <label style={{ display: "block", fontSize: FS - 1, color: T.textSec, fontWeight: 700, marginBottom: 6 }}>{label}</label>
      <Inp value={value} onChange={onChange} readOnly={disabled} />
    </div>
  );
}

function CheckLine({ label, checked, onChange, disabled }){
  return (
    <div
      onClick={() => !disabled && onChange(!checked)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 4px",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <div style={{
        width: 18,
        height: 18,
        borderRadius: 4,
        border: "2px solid " + (checked ? T.accent : T.brdStrong),
        background: checked ? T.accent : "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}>
        {checked && <span style={{ color: "#fff", fontSize: 12, fontWeight: 900 }}>✓</span>}
      </div>
      <span style={{ fontSize: FS - 1, color: T.text, fontWeight: 600 }}>{label}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   V19.93 Phase 1 — OrdersTab
   ───────────────────────────────────────────────────────────────────────
   Displays Shopify orders pulled from the Shopify Admin API. Reads from
   the live `data.shopifyPendingOrders` array (synced by sync-orders-now
   or the cron poll-orders endpoint).

   Features:
     • Filter by status (all / pending / delivered / refused / cancelled)
     • Filter by date (today / this week / this month / all)
     • Search by customer name or phone
     • Manual sync button ("اسحب الطلبات الجديدة")
     • Per-order action buttons:
       - Mark Delivered / Mark Refused (Phase 1 — status only)
       - Open in Shopify (external link)
   ═══════════════════════════════════════════════════════════════════════ */

const STATUS_META = {
  pending_delivery: { label: "بانتظار الاستلام", emoji: "🟡", color: "#F59E0B", bg: "#FEF3C7" },
  delivered:        { label: "تم الاستلام",      emoji: "🟢", color: "#10B981", bg: "#D1FAE5" },
  refused:          { label: "تم الرفض",          emoji: "🔴", color: "#EF4444", bg: "#FEE2E2" },
  cancelled:        { label: "ملغي",              emoji: "⚪", color: "#94A3B8", bg: "#F1F5F9" },
  returned:         { label: "تم الإرجاع",        emoji: "↩️", color: "#8B5CF6", bg: "#EDE9FE" },
};

function OrdersTab({ data, upConfig, canEdit, user, isMob }){
  const cfg = data?.shopifyConfig || {};
  const allOrders = useMemo(() => Array.isArray(data?.shopifyPendingOrders) ? data.shopifyPendingOrders : [], [data?.shopifyPendingOrders]);

  /* Filters */
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("month"); /* today | week | month | all */
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyOrderId, setBusyOrderId] = useState(null);

  const connected = !!cfg.connected;
  const lastSyncAt = cfg.last_orders_sync_at;

  /* Apply filters */
  const filtered = useMemo(() => {
    let result = allOrders;
    /* Status */
    if(statusFilter !== "all"){
      result = result.filter(o => o.status === statusFilter);
    }
    /* Date */
    const now = Date.now();
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const dayMs = 24 * 3600 * 1000;
    if(dateFilter === "today"){
      result = result.filter(o => new Date(o.shopify_created_at || 0).getTime() >= startOfToday.getTime());
    } else if(dateFilter === "week"){
      result = result.filter(o => now - new Date(o.shopify_created_at || 0).getTime() <= 7 * dayMs);
    } else if(dateFilter === "month"){
      result = result.filter(o => now - new Date(o.shopify_created_at || 0).getTime() <= 30 * dayMs);
    }
    /* Search */
    const q = search.trim().toLowerCase();
    if(q){
      result = result.filter(o => {
        const name = (o.customer_info?.name || "").toLowerCase();
        const phone = (o.customer_info?.phone || "").toLowerCase();
        const num = String(o.shopify_order_number || "").toLowerCase();
        return name.includes(q) || phone.includes(q) || num.includes(q) || ("#" + num).includes(q);
      });
    }
    return result;
  }, [allOrders, statusFilter, dateFilter, search]);

  /* Stats */
  const stats = useMemo(() => {
    const byStatus = { pending_delivery: 0, delivered: 0, refused: 0, cancelled: 0, returned: 0 };
    let totalRevenue = 0;
    let pendingValue = 0;
    allOrders.forEach(o => {
      byStatus[o.status] = (byStatus[o.status] || 0) + 1;
      if(o.status === "delivered") totalRevenue += Number(o.total) || 0;
      if(o.status === "pending_delivery") pendingValue += Number(o.total) || 0;
    });
    return { byStatus, totalRevenue, pendingValue };
  }, [allOrders]);

  /* V19.94 Phase 2: stock reservations stats */
  const reservationsSummary = useMemo(() => getReservationsSummary(data), [data]);

  const handleSync = async () => {
    if(!canEdit){ showToast("⛔ مفيش صلاحية"); return; }
    if(!connected){ showToast("⚠️ مش متصل بـ Shopify — روح تاب Connection"); return; }
    setBusy(true);
    try {
      const r = await shopifySyncOrdersNow({}, user);
      if(r && r.ok){
        showToast(`✅ تم سحب ${r.count} طلب — جديد: ${r.new}، محدّث: ${r.updated}`);
      } else {
        showToast("⛔ " + (r?.error || "فشل السحب"));
      }
    } catch(e){
      showToast("⛔ " + (e.message || "فشل السحب"));
    } finally {
      setBusy(false);
    }
  };

  const handleMarkDelivered = async (order) => {
    if(!canEdit){ showToast("⛔ مفيش صلاحية"); return; }
    const yes = await ask("✅ تأكيد الاستلام", `هل تأكد إن العميل ${order.customer_info?.name || "—"} استلم الطلب فعلاً؟\n\nالقيمة: ${fmt(order.total)} ${order.currency}\n\n⚠️ في Phase 3 ده هيـ generate فاتورة + قيد محاسبي تلقائياً. حالياً (Phase 1) بـ يحدّث الـ status فقط.`);
    if(!yes) return;
    setBusyOrderId(order.shopify_order_id);
    try {
      const r = await shopifyMarkDelivered({ orderId: order.shopify_order_id }, user);
      if(r && r.ok){
        showToast("✅ تم تحديث حالة الطلب");
      } else {
        showToast("⛔ " + (r?.error || "فشل التحديث"));
      }
    } catch(e){
      showToast("⛔ " + (e.message || "فشل التحديث"));
    } finally {
      setBusyOrderId(null);
    }
  };

  /* V21.3 Phase 10d: create Bosta shipment for an order */
  const handleCreateBostaShipment = async (order) => {
    if(!canEdit){ showToast("⛔ مفيش صلاحية"); return; }
    if(order.bosta?.tracking_number){
      showToast("⚠️ الطلب عنده tracking بالفعل");
      return;
    }
    if(!order.customer_info?.phone){
      showToast("⚠️ العميل مالوش تليفون");
      return;
    }
    const cfg = data?.shopifyConfig || {};
    if(!cfg.bosta_api_key){
      await tell("⚠️ Bosta API key مش معدّ", "روح Settings tab → Bosta section واضبط الـ API key أولاً.");
      return;
    }
    const yes = await ask("📦 إنشاء شحنة Bosta",
      `هتعمل شحنة Bosta للطلب #${order.shopify_order_number}\n\n` +
      `العميل: ${order.customer_info?.name || "—"}\n` +
      `التليفون: ${order.customer_info?.phone}\n` +
      `العنوان: ${order.customer_info?.address?.line1 || "—"}\n` +
      `COD: ${fmt(order.total)} ج\n\n` +
      `بعد الإنشاء، الـ tracking number هـ يـ link تلقائياً والـ webhook هـ يستلم updates.\n\nتأكيد؟`);
    if(!yes) return;
    setBusyOrderId(order.shopify_order_id);
    try {
      const r = await bostaCreateShipment({ orderId: order.shopify_order_id }, user);
      if(r?.ok){
        await tell("✅ تم إنشاء الشحنة", `Tracking: ${r.tracking_number}\n\nالـ Bosta هـ يبعت webhook updates للحالات.`);
      } else {
        showToast("⛔ " + (r?.error || "فشل"));
      }
    } catch(e){ showToast("⛔ " + e.message); }
    finally { setBusyOrderId(null); }
  };

  const handleProcessReturn = async (order) => {
    if(!canEdit){ showToast("⛔ مفيش صلاحية"); return; }
    const yes = await ask("↩️ معالجة إرجاع",
      `هل تأكد إن العميل ${order.customer_info?.name || "—"} عاوز يرجّع الطلب؟\n\nالقيمة: ${fmt(order.total)} ج.م\nالفاتورة الأصلية: ${order.invoice_no || "—"}\n\nده هـ:\n• يـ generate Credit Note draft (CN-YYYY-NNNN)\n• يربطه بالفاتورة الأصلية\n• يـ flip الـ status لـ \"returned\"\n\n⚠️ Stock مش هيرجع تلقائياً للـ inventory — هتـ handle ده يدوياً (Phase 5 هـ يـ automate).`);
    if(!yes) return;
    const reason = await askInput("سبب الإرجاع", { placeholder: "اختياري", confirmText: "تأكيد الإرجاع" });
    if(reason === null) return;
    setBusyOrderId(order.shopify_order_id);
    try {
      const r = await shopifyProcessReturn({ orderId: order.shopify_order_id, reason }, user);
      if(r && r.ok){
        await tell("✅ تم معالجة الإرجاع",
          (r.creditNote ? `Credit Note: ${r.creditNote.creditNoteNo}\nالقيمة: ${fmt(r.creditNote.total)} ج\n\n` : "") +
          (r.hint || ""));
      } else {
        showToast("⛔ " + (r?.error || "فشل المعالجة"));
      }
    } catch(e){
      showToast("⛔ " + (e.message || "فشل المعالجة"));
    } finally {
      setBusyOrderId(null);
    }
  };

  const handleMarkRefused = async (order) => {
    if(!canEdit){ showToast("⛔ مفيش صلاحية"); return; }
    const reason = await askInput("❌ سبب الرفض", {
      message: "اكتب السبب (اختياري):",
      placeholder: "العميل غيّر رأيه / مش موجود / إلخ",
      confirmText: "تأكيد الرفض",
    });
    if(reason === null) return; /* cancelled */
    setBusyOrderId(order.shopify_order_id);
    try {
      const r = await shopifyMarkRefused({ orderId: order.shopify_order_id, reason }, user);
      if(r && r.ok){
        showToast("🔴 تم تسجيل الرفض");
      } else {
        showToast("⛔ " + (r?.error || "فشل التحديث"));
      }
    } catch(e){
      showToast("⛔ " + (e.message || "فشل التحديث"));
    } finally {
      setBusyOrderId(null);
    }
  };

  const openInShopify = (order) => {
    const storeUrl = cfg.store_url;
    if(!storeUrl) return;
    /* Admin URLs use the canonical myshopify domain even when there's a custom domain */
    window.open(`https://${storeUrl}/admin/orders/${order.shopify_order_id}`, "_blank");
  };

  if(!connected){
    return (
      <Card title="⚠️ مش متصل">
        <div style={{ padding: 24, textAlign: "center", color: T.textSec }}>
          روح تاب 🔌 الاتصال أولاً.
        </div>
      </Card>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Stats banner */}
      <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr 1fr" : "repeat(5, 1fr)", gap: 10 }}>
        <MetricCard label="إجمالي" value={String(allOrders.length)} icon="🛒" color="#0EA5E9" />
        <MetricCard label="بانتظار" value={String(stats.byStatus.pending_delivery || 0)} icon="🟡" color="#F59E0B" sub={fmt(stats.pendingValue) + " ج"} />
        <MetricCard label="تم الاستلام" value={String(stats.byStatus.delivered || 0)} icon="🟢" color="#10B981" sub={fmt(stats.totalRevenue) + " ج"} />
        <MetricCard label="تم الرفض" value={String(stats.byStatus.refused || 0)} icon="🔴" color="#EF4444" />
        <MetricCard label="ملغي/مرتجع" value={String((stats.byStatus.cancelled || 0) + (stats.byStatus.returned || 0))} icon="⚪" color="#94A3B8" />
      </div>

      {/* V19.94 Phase 2: stock reservations banner */}
      {reservationsSummary.active > 0 && (
        <div style={{
          padding: "10px 14px",
          borderRadius: 10,
          background: "#FEF3C710",
          border: "1px solid #F59E0B30",
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 18 }}>📦</span>
          <span style={{ fontSize: FS - 1, fontWeight: 700, color: T.text }}>
            Stock محجوز: <b>{reservationsSummary.activeQty} قطعة</b> في {reservationsSummary.active} reservation
          </span>
          {reservationsSummary.unmatchedActive > 0 && (
            <span style={{
              fontSize: FS - 2,
              fontWeight: 600,
              color: T.warn,
              padding: "2px 8px",
              borderRadius: 6,
              background: T.warn + "12",
              border: "1px solid " + T.warn + "30",
            }}>
              ⚠️ {reservationsSummary.unmatchedActive} منهم SKU مش متوفر في CLARK
            </span>
          )}
          {reservationsSummary.committed > 0 && (
            <span style={{ fontSize: FS - 2, color: T.textMut }}>
              · {reservationsSummary.committed} committed
            </span>
          )}
        </div>
      )}

      {/* Toolbar */}
      <Card title="🛒 الطلبات" extra={
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <LoadingBtn primary loading={busy} loadingText="جاري السحب..." onClick={handleSync} disabled={!canEdit} small>
            🔄 اسحب الطلبات الجديدة
          </LoadingBtn>
        </div>
      }>
        {lastSyncAt && (
          <div style={{ fontSize: FS - 2, color: T.textMut, marginBottom: 10 }}>
            🕐 آخر مزامنة: {new Date(lastSyncAt).toLocaleString("ar-EG")} — في القائمة: {allOrders.length} طلب
          </div>
        )}

        {/* Filters */}
        <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 1fr 2fr", gap: 8 }}>
          <Sel value={statusFilter} onChange={setStatusFilter}>
            <option value="all">كل الحالات</option>
            <option value="pending_delivery">🟡 بانتظار الاستلام</option>
            <option value="delivered">🟢 تم الاستلام</option>
            <option value="refused">🔴 تم الرفض</option>
            <option value="cancelled">⚪ ملغي</option>
            <option value="returned">↩️ مرتجع</option>
          </Sel>
          <Sel value={dateFilter} onChange={setDateFilter}>
            <option value="today">اليوم</option>
            <option value="week">آخر 7 أيام</option>
            <option value="month">آخر 30 يوم</option>
            <option value="all">الكل</option>
          </Sel>
          <Inp value={search} onChange={setSearch} placeholder="🔍 بحث بالاسم، التليفون، أو رقم الأوردر..." />
        </div>

        {/* Result count */}
        <div style={{ fontSize: FS - 2, color: T.textSec, marginTop: 10, marginBottom: 4 }}>
          عرض <b>{filtered.length}</b> طلب من <b>{allOrders.length}</b>
        </div>
      </Card>

      {/* Orders list */}
      {filtered.length === 0 ? (
        <Card>
          <div style={{ padding: 36, textAlign: "center", color: T.textMut }}>
            <div style={{ fontSize: 40, marginBottom: 10, opacity: 0.5 }}>📭</div>
            <div style={{ fontSize: FS, fontWeight: 600 }}>مفيش طلبات تطابق الـ filters الحالية</div>
            {allOrders.length === 0 && (
              <div style={{ fontSize: FS - 1, marginTop: 8 }}>
                اضغط <b>"اسحب الطلبات الجديدة"</b> لأول مرة لجلب البيانات من Shopify
              </div>
            )}
          </div>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map(order => (
            <OrderCard
              key={order.shopify_order_id}
              order={order}
              reservations={getReservationsForOrder(data, order.shopify_order_id)}
              isMob={isMob}
              canEdit={canEdit}
              busy={busyOrderId === order.shopify_order_id}
              onMarkDelivered={() => handleMarkDelivered(order)}
              onMarkRefused={() => handleMarkRefused(order)}
              onProcessReturn={() => handleProcessReturn(order)}
              onCreateBostaShipment={() => handleCreateBostaShipment(order)}
              onOpenInShopify={() => openInShopify(order)}
            />
          ))}
        </div>
      )}

    </div>
  );
}

function OrderCard({ order, reservations, isMob, canEdit, busy, onMarkDelivered, onMarkRefused, onProcessReturn, onCreateBostaShipment, onOpenInShopify }){
  const meta = STATUS_META[order.status] || STATUS_META.pending_delivery;
  const customer = order.customer_info || {};
  const addr = customer.address || {};
  const items = order.line_items || [];
  const fulfillSync = order.shopify_status_synced || {};

  const created = order.shopify_created_at ? new Date(order.shopify_created_at) : null;
  const delivered = order.delivered_at ? new Date(order.delivered_at) : null;
  const refused = order.refused_at ? new Date(order.refused_at) : null;

  const minutesAgo = created ? Math.floor((Date.now() - created.getTime()) / 60000) : 0;
  const ageLabel = minutesAgo < 60 ? `منذ ${minutesAgo} دقيقة`
                 : minutesAgo < 1440 ? `منذ ${Math.floor(minutesAgo / 60)} ساعة`
                 : `منذ ${Math.floor(minutesAgo / 1440)} يوم`;

  return (
    <div style={{
      background: T.cardSolid,
      borderRadius: 14,
      border: "1px solid " + meta.color + "30",
      borderLeft: "4px solid " + meta.color,
      padding: isMob ? 12 : 16,
      boxShadow: T.shadow,
    }}>
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 18 }}>{meta.emoji}</span>
          <span style={{ fontSize: FS, fontWeight: 800, color: T.text }}>
            #{order.shopify_order_number || order.shopify_order_id}
          </span>
          <span style={{
            fontSize: FS - 2,
            fontWeight: 700,
            padding: "3px 10px",
            borderRadius: 12,
            background: meta.bg,
            color: meta.color,
          }}>{meta.label}</span>
          {order.payment_method === "online" && (
            <span style={{
              fontSize: FS - 3,
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: 10,
              background: "#DBEAFE",
              color: "#1E40AF",
            }}>💳 online</span>
          )}
          {order.payment_method === "cod" && (
            <span style={{
              fontSize: FS - 3,
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: 10,
              background: "#FEF3C7",
              color: "#92400E",
            }}>💵 COD</span>
          )}
        </div>
        <div style={{ fontSize: FS - 2, color: T.textMut }}>{ageLabel}</div>
      </div>

      {/* Customer */}
      <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div style={{ fontSize: FS - 1, lineHeight: 1.7 }}>
          <div>👤 <b>{customer.name || "—"}</b></div>
          {customer.phone && (
            <div>
              📞 <a href={"tel:" + customer.phone} style={{ color: T.accent, textDecoration: "none" }}>{customer.phone}</a>
              {customer.phone && (
                <a
                  href={"https://wa.me/" + customer.phone.replace(/[^0-9]/g, "")}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ marginInlineStart: 8, color: "#25D366", textDecoration: "none", fontSize: FS - 2 }}
                >📱 WhatsApp</a>
              )}
            </div>
          )}
          {customer.email && <div style={{ fontSize: FS - 2, color: T.textSec }}>📧 {customer.email}</div>}
        </div>
        <div style={{ fontSize: FS - 2, color: T.textSec, lineHeight: 1.6 }}>
          📍 {[addr.line1, addr.line2, addr.city, addr.governorate].filter(Boolean).join("، ") || "—"}
        </div>
      </div>

      {/* Line items */}
      <div style={{ background: T.bg, borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}>
        {items.map((it, i) => (
          <div key={i} style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            paddingTop: i > 0 ? 6 : 0,
            borderTop: i > 0 ? "1px dashed " + T.brd : "none",
            paddingBottom: 6,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: FS - 1, fontWeight: 600, color: T.text }}>
                {it.quantity}× {it.title}
                {it.variant_title && it.variant_title !== "Default Title" && (
                  <span style={{ color: T.textMut, fontWeight: 400 }}> — {it.variant_title}</span>
                )}
              </div>
              {it.sku && <div style={{ fontSize: FS - 3, color: T.textMut, fontFamily: "monospace" }}>SKU: {it.sku}</div>}
            </div>
            <div style={{ fontSize: FS - 1, fontWeight: 700, color: T.text }}>
              {fmt(it.total)} ج
            </div>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 10, fontSize: FS - 1 }}>
        <div>
          <span style={{ color: T.textSec }}>Subtotal: </span><span style={{ fontWeight: 600 }}>{fmt(order.subtotal)} ج</span>
          {order.shipping_fee > 0 && (
            <>
              <span style={{ color: T.textSec, marginInlineStart: 12 }}>شحن: </span>
              <span style={{ fontWeight: 600 }}>{fmt(order.shipping_fee)} ج</span>
            </>
          )}
        </div>
        <div style={{ fontSize: FS + 1, fontWeight: 800, color: T.accent }}>
          {fmt(order.total)} {order.currency || "EGP"}
        </div>
      </div>

      {/* Local CLARK status notes */}
      <div style={{ fontSize: FS - 2, color: T.textSec, marginBottom: 10, lineHeight: 1.6 }}>
        {order.status === "pending_delivery" && (
          <div>📋 <b>لا فاتورة بعد</b> — Phase 1 (الفاتورة + Stock تـ commit في Phase 3)</div>
        )}
        {order.status === "delivered" && delivered && (
          <div>✅ تم الاستلام: {delivered.toLocaleString("ar-EG")} {order.delivered_by && <span style={{ color: T.textMut }}>· بواسطة {order.delivered_by}</span>}</div>
        )}
        {order.status === "delivered" && (order.invoice_no || order.invoice_id) && (
          <div>📄 الفاتورة: <b>{order.invoice_no || order.invoice_id}</b> <span style={{ color: T.textMut }}>(draft — اعمل Post من تاب فواتير المبيعات)</span></div>
        )}
        {order.status === "returned" && (order.return_credit_note_no || order.return_credit_note_id) && (
          <div>↩️ Credit Note: <b>{order.return_credit_note_no || order.return_credit_note_id}</b> {order.return_reason && <span style={{ color: T.textMut }}>— "{order.return_reason}"</span>}</div>
        )}
        {order.status === "refused" && refused && (
          <div>🔴 تم الرفض: {refused.toLocaleString("ar-EG")} {order.refusal_reason && <span style={{ color: T.textMut }}>— "{order.refusal_reason}"</span>}</div>
        )}
        {/* V19.94 Phase 2: stock reservations summary */}
        {reservations && reservations.length > 0 && (
          <ReservationSummary reservations={reservations} />
        )}
        <div style={{ marginTop: 4 }}>
          <span style={{ color: T.textMut }}>Shopify status:</span> financial=<b>{fulfillSync.financial_status || "—"}</b>, fulfillment=<b>{fulfillSync.fulfillment_status || "—"}</b>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {order.status === "pending_delivery" && (
          <>
            <LoadingBtn primary loading={busy} loadingText="..." onClick={onMarkDelivered} disabled={!canEdit} small>
              ✅ تم الاستلام
            </LoadingBtn>
            <LoadingBtn danger loading={busy} loadingText="..." onClick={onMarkRefused} disabled={!canEdit} small>
              ❌ تم الرفض
            </LoadingBtn>
          </>
        )}
        {order.status === "delivered" && (
          <LoadingBtn loading={busy} loadingText="..." onClick={onProcessReturn} disabled={!canEdit} small>
            ↩️ معالجة إرجاع
          </LoadingBtn>
        )}
        {/* V21.3 Phase 10d: Bosta shipment button — only show if no tracking yet */}
        {order.status === "pending_delivery" && !order.bosta?.tracking_number && (
          <LoadingBtn loading={busy} loadingText="..." onClick={onCreateBostaShipment} disabled={!canEdit} small style={{ background: "#0D948815", color: "#0D9488", border: "1px solid #0D948830" }}>
            📦 إنشاء شحنة Bosta
          </LoadingBtn>
        )}
        {order.bosta?.tracking_number && (
          <span style={{ fontSize: FS - 2, padding: "4px 8px", borderRadius: 6, background: "#0D948815", color: "#0D9488", fontWeight: 700 }}>
            🚚 {order.bosta.tracking_number}
          </span>
        )}
        <Btn small onClick={onOpenInShopify}>↗ افتح في Shopify</Btn>
      </div>
    </div>
  );
}

/* V19.97 Phase 5: DashboardTab — comprehensive overview of Shopify
   integration health. Pulls from all the data slices (orders, invoices,
   reservations, products) and surfaces:
     • Today's metrics (new orders, delivered, refunds)
     • Month metrics (orders/delivered/refused/conversion rate)
     • Revenue summary (this month + this year)
     • Top products (sold qty)
     • Active stock reservations (qty + value)
     • Alerts (SKU mismatches, stale pending, sync errors)
*/
function DashboardTab({ data, isMob, setActiveTab }){
  const cfg = data?.shopifyConfig || {};
  const orders = useMemo(() => Array.isArray(data?.shopifyPendingOrders) ? data.shopifyPendingOrders : [], [data]);
  const invoices = useMemo(() =>
    (Array.isArray(data?.salesInvoices) ? data.salesInvoices : []).filter(i => i.source === "shopify"),
    [data]
  );
  const creditNotes = useMemo(() =>
    (Array.isArray(data?.salesCreditNotes) ? data.salesCreditNotes : []).filter(c => c.source === "shopify"),
    [data]
  );
  const reservations = useMemo(() => Array.isArray(data?.stockReservations) ? data.stockReservations : [], [data]);
  const products = useMemo(() => Array.isArray(data?.shopifyProducts) ? data.shopifyProducts : [], [data]);

  /* ── Compute metrics ── */
  const metrics = useMemo(() => {
    const now = Date.now();
    const dayMs = 86400000;
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);

    let todayCount = 0, todayDelivered = 0, todayRefused = 0, todayRevenue = 0;
    let monthCount = 0, monthDelivered = 0, monthRefused = 0, monthRevenue = 0;
    let yearRevenue = 0;
    let pendingValue = 0;
    let staleCount = 0;
    let staleSkuMismatch = 0;
    /* Top products by qty sold */
    const skuQty = new Map();

    const timeoutDays = Number(cfg.pending_order_timeout_days) || 7;

    orders.forEach(o => {
      const created = o.shopify_created_at ? new Date(o.shopify_created_at).getTime() : 0;
      const total = Number(o.total) || 0;
      const isToday = created >= startOfToday.getTime();
      const isMonth = created >= startOfMonth.getTime();

      if(isToday){
        todayCount++;
        if(o.status === "delivered"){ todayDelivered++; todayRevenue += total; }
        else if(o.status === "refused"){ todayRefused++; }
      }
      if(isMonth){
        monthCount++;
        if(o.status === "delivered"){ monthDelivered++; monthRevenue += total; }
        else if(o.status === "refused"){ monthRefused++; }
      }
      if(o.status === "delivered") yearRevenue += total;
      if(o.status === "pending_delivery"){
        pendingValue += total;
        const ageDays = (now - created) / dayMs;
        if(ageDays > timeoutDays) staleCount++;
        /* Count line items with unmatched SKU (not matched to inventoryItems) */
      }

      /* Top products — only count delivered orders */
      if(o.status === "delivered"){
        (o.line_items || []).forEach(li => {
          const sku = li.sku || "(no-sku)";
          const cur = skuQty.get(sku) || { qty: 0, title: li.title || sku };
          cur.qty += Number(li.quantity) || 0;
          skuQty.set(sku, cur);
        });
      }
    });

    /* SKU mismatches from products */
    const mismatchedProducts = products.filter(p => p.mapping_status !== "matched").length;
    /* SKU mismatches in active reservations */
    const reservedSkuMismatch = reservations.filter(r => r.status === "active" && r.unmatched).length;

    /* Top products list (top 5) */
    const topProducts = Array.from(skuQty.entries())
      .map(([sku, info]) => ({ sku, ...info }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    /* Net revenue = invoices posted - credit notes posted */
    let postedInvoices = 0, postedRevenue = 0;
    invoices.forEach(i => { if(i.status === "posted"){ postedInvoices++; postedRevenue += Number(i.total) || 0; } });
    let postedCreditNotes = 0, refundsValue = 0;
    creditNotes.forEach(c => { if(c.status === "posted"){ postedCreditNotes++; refundsValue += Number(c.total) || 0; } });

    /* Reservations stats */
    let activeReservationCount = 0, activeReservationQty = 0, reservationValue = 0;
    reservations.forEach(r => {
      if(r.status === "active"){
        activeReservationCount++;
        activeReservationQty += Number(r.qty) || 0;
        /* Approximate value: lookup in orders */
        const order = orders.find(o => String(o.shopify_order_id) === String(r.source_ref));
        if(order){
          const item = (order.line_items || []).find(li => li.sku === r.product_sku);
          if(item) reservationValue += (Number(item.price) || 0) * (Number(r.qty) || 0);
        }
      }
    });

    return {
      today: { count: todayCount, delivered: todayDelivered, refused: todayRefused, revenue: todayRevenue },
      month: {
        count: monthCount,
        delivered: monthDelivered,
        refused: monthRefused,
        revenue: monthRevenue,
        deliveryRate: monthCount > 0 ? Math.round((monthDelivered / monthCount) * 100) : 0,
      },
      yearRevenue,
      pendingValue,
      staleCount,
      mismatchedProducts,
      reservedSkuMismatch,
      topProducts,
      postedInvoices,
      postedRevenue,
      postedCreditNotes,
      refundsValue,
      activeReservationCount,
      activeReservationQty,
      reservationValue,
    };
  }, [orders, invoices, creditNotes, reservations, products, cfg]);

  const connected = !!cfg.connected;
  if(!connected){
    return (
      <Card title="⚠️ مش متصل">
        <div style={{ padding: 24, textAlign: "center", color: T.textSec }}>روح تاب 🔌 الاتصال أولاً.</div>
      </Card>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Today */}
      <Card title="📊 إحصائيات اليوم" extra={
        <span style={{ fontSize: FS - 2, color: T.textMut }}>{new Date().toLocaleDateString("ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</span>
      }>
        <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10 }}>
          <MetricCard label="🛒 طلبات جديدة" value={String(metrics.today.count)} color="#0EA5E9" />
          <MetricCard label="✅ تم الاستلام" value={String(metrics.today.delivered)} color="#10B981" sub={fmt(metrics.today.revenue) + " ج"} />
          <MetricCard label="❌ تم الرفض" value={String(metrics.today.refused)} color="#EF4444" />
          <MetricCard label="📦 محجوز حالياً" value={String(metrics.activeReservationQty)} color="#F59E0B" sub={metrics.activeReservationCount + " reservation"} />
        </div>
      </Card>

      {/* Month */}
      <Card title="📈 إحصائيات الشهر">
        <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10 }}>
          <MetricCard label="إجمالي طلبات" value={String(metrics.month.count)} color="#0EA5E9" />
          <MetricCard label="تم الاستلام" value={String(metrics.month.delivered)} color="#10B981" sub={metrics.month.deliveryRate + "% delivery rate"} />
          <MetricCard label="تم الرفض" value={String(metrics.month.refused)} color="#EF4444" sub={metrics.month.count > 0 ? Math.round((metrics.month.refused / metrics.month.count) * 100) + "%" : "0%"} />
          <MetricCard label="💰 إيرادات" value={fmt(metrics.month.revenue) + " ج"} color="#8B5CF6" />
        </div>
      </Card>

      {/* Revenue summary */}
      <Card title="💰 الإيرادات المحققة">
        <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "repeat(3, 1fr)", gap: 10 }}>
          <MetricCard label="فواتير posted (Net)" value={fmt(metrics.postedRevenue - metrics.refundsValue) + " ج"} color="#10B981" sub={metrics.postedInvoices + " فاتورة"} />
          <MetricCard label="إجمالي مرتجعات" value={fmt(metrics.refundsValue) + " ج"} color="#EF4444" sub={metrics.postedCreditNotes + " credit note"} />
          <MetricCard label="مخزون محجوز" value={fmt(metrics.reservationValue) + " ج"} color="#F59E0B" sub={metrics.activeReservationQty + " قطعة"} />
        </div>
      </Card>

      {/* Top products */}
      {metrics.topProducts.length > 0 && (
        <Card title="🔥 أكتر المنتجات مبيعاً (delivered orders)">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {metrics.topProducts.map((p, i) => (
              <div key={p.sku} style={{
                padding: "8px 12px",
                borderRadius: 8,
                background: T.bg,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                  <span style={{
                    width: 26, height: 26, borderRadius: "50%",
                    background: i === 0 ? "#FCD34D" : i === 1 ? "#E5E7EB" : i === 2 ? "#FCA5A5" : T.bg,
                    color: T.text, fontWeight: 800, fontSize: FS - 2,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: FS, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
                    <div style={{ fontSize: FS - 3, color: T.textMut, fontFamily: "monospace" }}>{p.sku}</div>
                  </div>
                </div>
                <div style={{ fontSize: FS, fontWeight: 800, color: T.accent }}>{p.qty} قطعة</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Alerts */}
      {(metrics.staleCount > 0 || metrics.mismatchedProducts > 0 || metrics.reservedSkuMismatch > 0) && (
        <Card title="⚠️ تنبيهات">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {metrics.staleCount > 0 && (
              <div onClick={() => setActiveTab("reconciliation")} style={{
                cursor: "pointer", padding: "10px 14px", borderRadius: 8,
                background: "#FEE2E215", border: "1px solid #EF444430",
              }}>
                <div style={{ fontSize: FS, fontWeight: 700, color: "#EF4444" }}>
                  🔴 {metrics.staleCount} طلب pending أكثر من {cfg.pending_order_timeout_days || 7} أيام
                </div>
                <div style={{ fontSize: FS - 2, color: T.textSec, marginTop: 4 }}>
                  اضغط لفتح تاب المطابقة وحلّ الـ stale orders
                </div>
              </div>
            )}
            {metrics.mismatchedProducts > 0 && (
              <div onClick={() => setActiveTab("products")} style={{
                cursor: "pointer", padding: "10px 14px", borderRadius: 8,
                background: "#FEF3C715", border: "1px solid #F59E0B30",
              }}>
                <div style={{ fontSize: FS, fontWeight: 700, color: "#F59E0B" }}>
                  ⚠️ {metrics.mismatchedProducts} منتج Shopify مش مربوط بـ CLARK
                </div>
                <div style={{ fontSize: FS - 2, color: T.textSec, marginTop: 4 }}>
                  اضغط لفتح تاب المنتجات وراجع الـ matching
                </div>
              </div>
            )}
            {metrics.reservedSkuMismatch > 0 && (
              <div style={{
                padding: "10px 14px", borderRadius: 8,
                background: "#FEF3C715", border: "1px solid #F59E0B30",
              }}>
                <div style={{ fontSize: FS, fontWeight: 700, color: "#F59E0B" }}>
                  ⚠️ {metrics.reservedSkuMismatch} reservation فيه SKU مش موجود في CLARK
                </div>
                <div style={{ fontSize: FS - 2, color: T.textSec, marginTop: 4 }}>
                  الطلبات دي اتسحبت من Shopify لكن المنتج مش معروف لـ CLARK
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Pending value */}
      {metrics.pendingValue > 0 && (
        <Card title="📋 قيمة الطلبات Pending">
          <div style={{ padding: 16, textAlign: "center" }}>
            <div style={{ fontSize: FS + 8, fontWeight: 800, color: T.accent }}>{fmt(metrics.pendingValue)} ج</div>
            <div style={{ fontSize: FS - 1, color: T.textSec, marginTop: 6 }}>
              قيمة كل الطلبات pending_delivery (لسه ما اتسلمت ولا اتـ refuse)
            </div>
          </div>
        </Card>
      )}

    </div>
  );
}

/* V19.97 Phase 5: ReconciliationTab — surface discrepancies + stale orders.
   Compares Shopify-side state to CLARK-side state and highlights what
   doesn't match. Lets the admin resolve stale pending orders manually. */
function ReconciliationTab({ data, canEdit, user, isMob, setActiveTab }){
  const cfg = data?.shopifyConfig || {};
  const orders = useMemo(() => Array.isArray(data?.shopifyPendingOrders) ? data.shopifyPendingOrders : [], [data]);
  const invoices = useMemo(() =>
    (Array.isArray(data?.salesInvoices) ? data.salesInvoices : []).filter(i => i.source === "shopify"),
    [data]
  );
  const reservations = useMemo(() => Array.isArray(data?.stockReservations) ? data.stockReservations : [], [data]);
  const [busyId, setBusyId] = useState(null);

  /* ── Stale orders ── */
  const staleOrders = useMemo(() => {
    const timeout = Number(cfg.pending_order_timeout_days) || 7;
    const cutoff = Date.now() - timeout * 86400000;
    return orders
      .filter(o => o.status === "pending_delivery" && o.shopify_created_at && new Date(o.shopify_created_at).getTime() < cutoff)
      .sort((a, b) => new Date(a.shopify_created_at).getTime() - new Date(b.shopify_created_at).getTime());
  }, [orders, cfg.pending_order_timeout_days]);

  /* ── Daily reconciliation ── */
  const reconciliation = useMemo(() => {
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const todayStart = startOfToday.getTime();
    /* Shopify orders today (created at) */
    const shopifyOrdersToday = orders.filter(o => o.shopify_created_at && new Date(o.shopify_created_at).getTime() >= todayStart);
    /* Shopify "fulfilled" today — orders whose status flipped to delivered today */
    const fulfilledToday = orders.filter(o => o.delivered_at && new Date(o.delivered_at).getTime() >= todayStart);
    /* Invoices created today */
    const invoicesToday = invoices.filter(i => {
      if(!i.createdAt) return false;
      return new Date(i.createdAt).getTime() >= todayStart;
    });
    /* Cash matching: expected = sum of delivered today */
    const expectedCash = fulfilledToday.reduce((s, o) => s + (Number(o.total) || 0), 0);

    return {
      shopifyOrdersToday: shopifyOrdersToday.length,
      pendingOrdersInClark: orders.filter(o => o.status === "pending_delivery").length,
      fulfilledToday: fulfilledToday.length,
      invoicesToday: invoicesToday.length,
      expectedCash,
      /* Discrepancies */
      diffOrdersVsPending: shopifyOrdersToday.length - orders.filter(o =>
        o.shopify_created_at && new Date(o.shopify_created_at).getTime() >= todayStart
      ).length, // 0 by definition
      diffFulfilledVsInvoices: fulfilledToday.length - invoicesToday.length,
    };
  }, [orders, invoices]);

  /* ── Reservations health ── */
  const reservationHealth = useMemo(() => {
    const now = Date.now();
    const stale = reservations.filter(r =>
      r.status === "active" && r.expires_at && new Date(r.expires_at).getTime() < now
    );
    const expiringSoon = reservations.filter(r =>
      r.status === "active" && r.expires_at &&
      new Date(r.expires_at).getTime() < now + 86400000 &&
      new Date(r.expires_at).getTime() >= now
    );
    const unmatched = reservations.filter(r => r.status === "active" && r.unmatched);
    return { stale: stale.length, expiringSoon: expiringSoon.length, unmatched: unmatched.length };
  }, [reservations]);

  const handleMarkDelivered = async (order) => {
    const yes = await ask("✅ تأكيد الاستلام", `الطلب #${order.shopify_order_number} (${fmt(order.total)} ج) — تأكيد؟`);
    if(!yes) return;
    setBusyId(order.shopify_order_id);
    try {
      const r = await shopifyMarkDelivered({ orderId: order.shopify_order_id }, user);
      if(r && r.ok){ showToast("✅ تم"); }
      else { showToast("⛔ " + (r?.error || "فشل")); }
    } catch(e){ showToast("⛔ " + e.message); }
    finally { setBusyId(null); }
  };

  const handleMarkRefused = async (order) => {
    const reason = await askInput("سبب الرفض", { placeholder: "العميل غيّر رأيه / مش موجود / ..." });
    if(reason === null) return;
    setBusyId(order.shopify_order_id);
    try {
      const r = await shopifyMarkRefused({ orderId: order.shopify_order_id, reason }, user);
      if(r && r.ok){ showToast("🔴 تم"); }
      else { showToast("⛔ " + (r?.error || "فشل")); }
    } catch(e){ showToast("⛔ " + e.message); }
    finally { setBusyId(null); }
  };

  const connected = !!cfg.connected;
  if(!connected){
    return (
      <Card title="⚠️ مش متصل">
        <div style={{ padding: 24, textAlign: "center", color: T.textSec }}>روح تاب 🔌 الاتصال أولاً.</div>
      </Card>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Stale Orders */}
      <Card title={"⏰ طلبات Pending قديمة (>" + (cfg.pending_order_timeout_days || 7) + " أيام)"}>
        {staleOrders.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: T.textMut }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
            <div>مفيش stale orders — كل الطلبات في الـ window الطبيعي</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {staleOrders.map(o => {
              const ageDays = Math.floor((Date.now() - new Date(o.shopify_created_at).getTime()) / 86400000);
              return (
                <div key={o.shopify_order_id} style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: T.cardSolid,
                  border: "1px solid #EF444430",
                  borderInlineStart: "3px solid #EF4444",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 800, fontSize: FS, color: T.text }}>#{o.shopify_order_number || o.shopify_order_id}</span>
                        <span style={{
                          fontSize: FS - 2, fontWeight: 700, padding: "2px 8px",
                          borderRadius: 8, background: "#EF444415", color: "#EF4444",
                        }}>منذ {ageDays} يوم</span>
                      </div>
                      <div style={{ fontSize: FS - 1, color: T.textSec, marginTop: 4 }}>
                        👤 {o.customer_info?.name || "—"}
                        {o.customer_info?.phone && <span style={{ marginInlineStart: 8 }}>📞 {o.customer_info.phone}</span>}
                      </div>
                      <div style={{ fontSize: FS - 1, fontWeight: 700, color: T.accent, marginTop: 4 }}>
                        {fmt(o.total)} {o.currency || "EGP"}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <LoadingBtn primary loading={busyId === o.shopify_order_id} loadingText="..." onClick={() => handleMarkDelivered(o)} disabled={!canEdit} small>
                        ✅ تم الاستلام
                      </LoadingBtn>
                      <LoadingBtn danger loading={busyId === o.shopify_order_id} loadingText="..." onClick={() => handleMarkRefused(o)} disabled={!canEdit} small>
                        ❌ تم الرفض
                      </LoadingBtn>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Daily reconciliation */}
      <Card title="📊 المطابقة اليومية">
        <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 1fr", gap: 10 }}>
          <ReconcileRow label="Shopify orders اليوم" value={reconciliation.shopifyOrdersToday} ok />
          <ReconcileRow label="CLARK pending orders (إجمالي)" value={reconciliation.pendingOrdersInClark} ok />
          <ReconcileRow
            label="Fulfilled اليوم"
            value={reconciliation.fulfilledToday}
            secondary={"CLARK invoices اليوم: " + reconciliation.invoicesToday}
            ok={reconciliation.diffFulfilledVsInvoices === 0}
            mismatch={reconciliation.diffFulfilledVsInvoices !== 0 ? `Diff: ${reconciliation.diffFulfilledVsInvoices}` : null}
          />
          <ReconcileRow
            label="💰 Cash متوقع اليوم"
            value={fmt(reconciliation.expectedCash) + " ج"}
            secondary="من الطلبات اللي اتسلمت اليوم — راجع الـ MAIN_CASH في Treasury"
            ok
          />
        </div>
      </Card>

      {/* Reservations health */}
      <Card title="🛡 صحة الـ Stock Reservations">
        <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "repeat(3, 1fr)", gap: 10 }}>
          <ReconcileRow
            label="Stale active (TTL expired)"
            value={reservationHealth.stale}
            ok={reservationHealth.stale === 0}
            mismatch={reservationHealth.stale > 0 ? "الـ daily cron هـ يـ release-هم تلقائياً" : null}
          />
          <ReconcileRow
            label="بـ تنتهي خلال 24 ساعة"
            value={reservationHealth.expiringSoon}
            ok
            secondary="نبهك مبكراً قبل ما الـ stock يتـ release"
          />
          <ReconcileRow
            label="SKU غير معروف لـ CLARK"
            value={reservationHealth.unmatched}
            ok={reservationHealth.unmatched === 0}
            mismatch={reservationHealth.unmatched > 0 ? "اعمل sync products + ضيف الـ items في CLARK" : null}
          />
        </div>
      </Card>

      {/* V19.98 Phase 6: Daily Report */}
      <DailyReportCard data={data} isMob={isMob} />

      {/* Quick actions */}
      <Card title="⚡ إجراءات سريعة">
        <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "repeat(3, 1fr)", gap: 10 }}>
          <Btn onClick={() => setActiveTab("orders")}>📋 افتح الطلبات</Btn>
          <Btn onClick={() => setActiveTab("products")}>📦 افتح المنتجات</Btn>
          <Btn onClick={() => setActiveTab("invoices")}>🧾 افتح الفواتير</Btn>
        </div>
      </Card>

    </div>
  );
}

/* V19.98 Phase 6: Daily Report card with copy-to-clipboard + WhatsApp link */
function DailyReportCard({ data, isMob }){
  const [report, setReport] = useState("");
  const [copied, setCopied] = useState(false);

  const generate = () => {
    const text = buildShopifyDailyReport(data);
    setReport(text);
    setCopied(false);
  };

  const handleCopy = async () => {
    if(!report) return;
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      showToast("✅ نُسخ — جاهز للصق في أي مكان");
      setTimeout(() => setCopied(false), 3000);
    } catch(_){
      showToast("⚠️ النسخ فشل — حدد النص يدوياً");
    }
  };

  const handleWhatsApp = () => {
    if(!report) return;
    /* Open WhatsApp web/app with the report pre-filled */
    const encoded = encodeURIComponent(report);
    window.open("https://wa.me/?text=" + encoded, "_blank");
  };

  return (
    <Card title="📤 التقرير اليومي" extra={
      <div style={{ display: "flex", gap: 6 }}>
        <Btn onClick={generate} small primary>📊 ولّد التقرير</Btn>
      </div>
    }>
      {!report ? (
        <div style={{ padding: 20, textAlign: "center", color: T.textMut, fontSize: FS - 1 }}>
          اضغط "ولّد التقرير" عشان تشوف ملخص اليوم بصيغة جاهزة للـ WhatsApp.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            <Btn small onClick={handleCopy} primary={!copied}>
              {copied ? "✓ تم النسخ" : "📋 انسخ النص"}
            </Btn>
            <Btn small onClick={handleWhatsApp}>📱 افتح في WhatsApp</Btn>
            <Btn small onClick={generate}>🔄 إعادة توليد</Btn>
          </div>
          <pre style={{
            margin: 0,
            padding: 14,
            background: T.bg,
            borderRadius: 8,
            border: "1px solid " + T.brd,
            fontFamily: "'Cairo', sans-serif",
            fontSize: FS - 1,
            lineHeight: 1.7,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            color: T.text,
            maxHeight: 500,
            overflowY: "auto",
            direction: "rtl",
            textAlign: "start",
          }}>{report}</pre>
        </>
      )}
    </Card>
  );
}

function ReconcileRow({ label, value, secondary, ok, mismatch }){
  const color = ok ? T.ok : T.warn;
  return (
    <div style={{
      padding: "12px 14px",
      borderRadius: 10,
      background: T.bg,
      border: "1px solid " + T.brd,
      borderInlineStart: "3px solid " + color,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: FS - 1, color: T.textSec, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: FS + 2, fontWeight: 800, color: T.text }}>{value}</span>
      </div>
      {secondary && (
        <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 4 }}>{secondary}</div>
      )}
      {mismatch && (
        <div style={{ fontSize: FS - 3, color: T.warn, marginTop: 4, fontWeight: 600 }}>⚠️ {mismatch}</div>
      )}
    </div>
  );
}

/* V19.99 Phase 7: ProductsTab — full product management with bulk select,
   sync filters, wholesale flag, delete from CLARK, image thumbnails. */
function ProductsTab({ data, canEdit, user, isMob }){
  const cfg = data?.shopifyConfig || {};
  const products = useMemo(() =>
    Array.isArray(data?.shopifyProducts) ? data.shopifyProducts : [],
    [data?.shopifyProducts]
  );
  const blacklistCount = (cfg.deletedProductIds || []).length;

  /* Filter state */
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [vendorFilter, setVendorFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showWholesale, setShowWholesale] = useState("all"); /* all|retail|wholesale */
  const [expandedId, setExpandedId] = useState(null);

  /* Selection state */
  const [selected, setSelected] = useState(() => new Set());
  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if(next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());

  /* Busy flags */
  const [busy, setBusy] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [lastPushResult, setLastPushResult] = useState(null);

  /* Sync filters modal */
  const [showSyncFilters, setShowSyncFilters] = useState(false);
  const [syncFilters, setSyncFilters] = useState({
    status: "",
    vendor: "",
    product_type: "",
    published_only: false,
    sku_prefix: "",
  });

  /* Compute stats */
  const stats = useMemo(() => {
    const s = {
      total: products.length,
      matched: 0, missing_in_clark: 0, mismatch: 0,
      synced: 0, paused: 0, wholesale: 0,
    };
    products.forEach(p => {
      s[p.mapping_status] = (s[p.mapping_status] || 0) + 1;
      if(p.wholesale_only) s.wholesale++;
      else if(p.shopify_synced === false) s.paused++;
      else if(p.mapping_status === "matched") s.synced++;
    });
    return s;
  }, [products]);

  /* Vendor list (for filter dropdown) */
  const vendors = useMemo(() => {
    const set = new Set();
    products.forEach(p => { if(p.vendor) set.add(p.vendor); });
    return Array.from(set).sort();
  }, [products]);

  /* Filtered list */
  const filtered = useMemo(() => {
    let res = products;
    if(filter !== "all") res = res.filter(p => p.mapping_status === filter);
    if(vendorFilter) res = res.filter(p => p.vendor === vendorFilter);
    if(statusFilter) res = res.filter(p => p.status === statusFilter);
    if(showWholesale === "wholesale") res = res.filter(p => p.wholesale_only === true);
    else if(showWholesale === "retail") res = res.filter(p => p.wholesale_only !== true);
    const q = search.trim().toLowerCase();
    if(q) res = res.filter(p =>
      String(p.sku || "").toLowerCase().includes(q) ||
      String(p.title || "").toLowerCase().includes(q) ||
      String(p.vendor || "").toLowerCase().includes(q) ||
      String(p.product_type || "").toLowerCase().includes(q)
    );
    return res;
  }, [products, filter, search, vendorFilter, statusFilter, showWholesale]);

  /* Visible IDs for select-all */
  const visibleIds = useMemo(() => filtered.slice(0, 100).map(p => String(p.shopify_id)), [filtered]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selected.has(id));

  const connected = !!cfg.connected;

  /* ── Action handlers ── */
  const handleSyncProducts = async (useFilters = false) => {
    if(!canEdit){ showToast("⛔ مفيش صلاحية"); return; }
    if(!connected){ showToast("⚠️ مش متصل بـ Shopify"); return; }
    setBusy(true);
    try {
      const opts = useFilters ? { filters: syncFilters, replaceMode: "merge" } : {};
      const r = await shopifySyncProductsWithFilters(opts, user);
      if(r && r.ok){
        showToast(`✅ تم سحب ${r.afterFilters || r.total} منتج · matched: ${r.matched} · missing: ${r.missing}${r.blacklisted ? ` · skipped from blacklist: ${r.blacklisted}` : ""}`);
        setShowSyncFilters(false);
      } else {
        showToast("⛔ " + (r?.error || "فشل السحب"));
      }
    } catch(e){
      showToast("⛔ " + (e.message || "فشل السحب"));
    } finally {
      setBusy(false);
    }
  };

  const handlePush = async (dryRun = false) => {
    if(!canEdit){ showToast("⛔ مفيش صلاحية"); return; }
    if(!connected){ showToast("⚠️ مش متصل"); return; }
    if(stats.synced === 0){
      showToast("⚠️ مفيش منتجات matched + synced + retail للـ push");
      return;
    }
    if(!dryRun){
      const yes = await ask("📤 Push المخزون", `هتـ push المخزون لـ ${stats.synced} منتج لـ Shopify.\n\nWholesale-only products بـ تتـ skip تلقائياً.\n\nالحساب: available = stock - reservations - buffer\n\nتأكيد؟`);
      if(!yes) return;
    }
    setPushing(true);
    try {
      const r = await shopifyPushInventoryNow({ dryRun }, user);
      if(r && r.ok){
        setLastPushResult(r);
        showToast(`${dryRun ? "🔍 Dry run" : "✅ تم"} · pushed: ${r.pushed} · skipped: ${r.skipped} · errors: ${r.errors}`);
      } else {
        showToast("⛔ " + (r?.error || "فشل الـ push"));
      }
    } catch(e){
      showToast("⛔ " + (e.message || "فشل الـ push"));
    } finally {
      setPushing(false);
    }
  };

  /* Single-product actions */
  const handleToggleSync = async (product) => {
    if(!canEdit) return;
    try {
      const r = await shopifyUpdateProductSettings({
        shopifyProductId: product.shopify_id,
        settings: { shopify_synced: !(product.shopify_synced !== false) }
      }, user);
      if(!r?.ok) showToast("⛔ " + (r?.error || "فشل"));
    } catch(e){ showToast("⛔ " + e.message); }
  };

  const handleToggleWholesale = async (product) => {
    if(!canEdit) return;
    try {
      const r = await shopifyUpdateProductSettings({
        shopifyProductId: product.shopify_id,
        settings: { wholesale_only: !product.wholesale_only }
      }, user);
      if(!r?.ok) showToast("⛔ " + (r?.error || "فشل"));
    } catch(e){ showToast("⛔ " + e.message); }
  };

  const handleSetBuffer = async (product) => {
    if(!canEdit) return;
    const current = product.safety_buffer != null ? String(product.safety_buffer) : String(cfg.default_safety_buffer || 5);
    const v = await askInput("Safety Buffer للمنتج", {
      defaultValue: current,
      label: "عدد القطع اللي تـ keep-ها للـ Jumla (مش push للـ Shopify)",
      type: "number",
      placeholder: "5",
      confirmText: "حفظ",
    });
    if(v === null) return;
    try {
      const r = await shopifyUpdateProductSettings({
        shopifyProductId: product.shopify_id,
        settings: { safety_buffer: v.trim() === "" ? null : Number(v) }
      }, user);
      if(!r?.ok) showToast("⛔ " + (r?.error || "فشل"));
    } catch(e){ showToast("⛔ " + e.message); }
  };

  const handleDeleteOne = async (product) => {
    if(!canEdit) return;
    const yes = await ask("🗑 حذف من CLARK", `هتشيل المنتج "${product.title || product.sku}" من قائمة CLARK\n\n⚠️ ملاحظات مهمة:\n• المنتج هـ يفضل في Shopify عادي\n• الـ ID بتاعه هـ يضاف لـ blacklist\n• لو عملت sync تاني، مش هـ يرجع تلقائياً\n• تقدر تـ restore من الـ blacklist بعدين\n\nتأكيد؟`);
    if(!yes) return;
    try {
      const r = await shopifyBulkUpdateProducts({
        productIds: [product.shopify_id],
        action: "delete_from_clark"
      }, user);
      if(r?.ok){ showToast("🗑 اتشال"); }
      else { showToast("⛔ " + (r?.error || "فشل")); }
    } catch(e){ showToast("⛔ " + e.message); }
  };

  /* V20.0: Create a CLARK inventoryItem from a Shopify product. */
  const handleCreateInClark = async (product) => {
    if(!canEdit) return;
    if(!product.sku){
      await tell("⚠️ مفيش SKU", "المنتج مالوش SKU في Shopify. روح Shopify Admin، عيّن SKU للمنتج، ثم اعمل sync تاني.");
      return;
    }
    const stock = await askInput("📦 المخزون الابتدائي للمنتج", {
      defaultValue: "0",
      label: "كم قطعة موجود في الـ warehouse الآن؟ (اسيبه 0 لو مش متأكد، ممكن تحدّثه بعدين)",
      type: "number",
      placeholder: "0",
      confirmText: "إنشاء في CLARK",
    });
    if(stock === null) return;
    try {
      const r = await shopifyCreateClarkItem({
        shopifyProductId: product.shopify_id,
        stock: Number(stock) || 0,
      }, user);
      if(r?.ok){
        const it = (r.items || [])[0];
        if(it){
          if(it.was_existing){
            showToast(`🔗 اتربط بـ CLARK item موجود: ${it.name}`);
          } else {
            showToast(`✅ تم إنشاء item في CLARK: ${it.name}`);
          }
        } else {
          showToast("✅ تم");
        }
      } else {
        showToast("⛔ " + (r?.error || "فشل"));
      }
    } catch(e){ showToast("⛔ " + e.message); }
  };

  /* V20.0: Bulk create CLARK items for all selected products. */
  const handleBulkCreateInClark = async () => {
    if(selected.size === 0){ showToast("⚠️ اختار منتجات الأول"); return; }
    if(!canEdit){ showToast("⛔ مفيش صلاحية"); return; }
    const yes = await ask("📦 إنشاء في CLARK",
      `هـ يتعمل CLARK inventoryItem لكل واحد من الـ ${selected.size} منتج محدد:\n\n• المنتجات اللي عندها item في CLARK بـ نفس الـ SKU → هـ تـ link بدل ما تـ duplicate\n• المنتجات الجديدة → هـ تتعمل بـ stock = 0 (تقدر تعدّل بعدين)\n• الـ items هـ تظهر في CLARK Inventory tab\n• الـ mapping_status هـ يبقى \"matched\" لكل واحد\n\nتأكيد؟`);
    if(!yes) return;
    try {
      const r = await shopifyCreateClarkItem({
        bulkProductIds: Array.from(selected),
        stock: 0,
      }, user);
      if(r?.ok){
        await tell("✅ تم",
          `تم إنشاء ${r.created} item جديد في CLARK\n` +
          `تم ربط ${r.linked} item موجود بالفعل\n` +
          (r.errors?.length > 0 ? `⚠️ ${r.errors.length} منتج فشل (مش عنده SKU)` : "") +
          `\n\nالـ items هـ تلاقيها في CLARK → الـ Inventory tab.`);
        clearSelection();
      } else {
        showToast("⛔ " + (r?.error || "فشل"));
      }
    } catch(e){ showToast("⛔ " + e.message); }
  };

  /* Bulk actions */
  const bulkAction = async (action, payload) => {
    if(selected.size === 0){ showToast("⚠️ اختار منتجات الأول"); return; }
    if(!canEdit){ showToast("⛔ مفيش صلاحية"); return; }
    try {
      const r = await shopifyBulkUpdateProducts({
        productIds: Array.from(selected),
        action, payload
      }, user);
      if(r?.ok){
        showToast(`✅ تم · ${r.updated || r.deleted} منتج`);
        clearSelection();
      } else {
        showToast("⛔ " + (r?.error || "فشل"));
      }
    } catch(e){ showToast("⛔ " + e.message); }
  };

  const handleBulkBuffer = async () => {
    if(selected.size === 0){ showToast("⚠️ اختار منتجات الأول"); return; }
    const v = await askInput("Safety Buffer للـ " + selected.size + " منتج", {
      defaultValue: String(cfg.default_safety_buffer || 5),
      label: "عدد القطع — اسيبه فاضي للرجوع للـ default",
      type: "number",
      confirmText: "تطبيق على الكل",
    });
    if(v === null) return;
    bulkAction("set_safety_buffer", { value: v.trim() === "" ? null : Number(v) });
  };

  const handleBulkDelete = async () => {
    if(selected.size === 0){ showToast("⚠️ اختار منتجات الأول"); return; }
    const yes = await ask("🗑 حذف الـ " + selected.size + " منتج",
      `هتشيل ${selected.size} منتج من قائمة CLARK.\n\n⚠️ ملاحظات:\n• المنتجات هـ تفضل في Shopify عادي\n• الـ IDs هـ تضاف لـ blacklist\n• مش هـ يرجعوا تلقائياً مع sync\n\nتأكيد الحذف؟`);
    if(!yes) return;
    bulkAction("delete_from_clark");
  };

  const handleDeleteAll = async () => {
    if(!canEdit) return;
    if(products.length === 0){ showToast("⚠️ مفيش منتجات أصلاً"); return; }
    const yes = await ask("⚠️ حذف كل المنتجات",
      `🚨 هتشيل كل الـ ${products.length} منتج من قائمة CLARK.\n\nالمنتجات في Shopify مش هتتأثر.\nالـ IDs كلها هـ تضاف للـ blacklist.\n\nده action لا يمكن التراجع عنه (إلا بـ Clear Blacklist + sync تاني).\n\nمتأكد 100%؟`);
    if(!yes) return;
    const reason = await askInput("اكتب \"مسح\" للتأكيد", { placeholder: "مسح" });
    if(!reason || reason.trim() !== "مسح"){
      showToast("ℹ️ تم الإلغاء"); return;
    }
    try {
      const r = await shopifyBulkUpdateProducts({ productIds: [], action: "delete_all" }, user);
      if(r?.ok){
        showToast(`🗑 تم مسح ${r.deleted} منتج`);
        clearSelection();
      } else {
        showToast("⛔ " + (r?.error || "فشل"));
      }
    } catch(e){ showToast("⛔ " + e.message); }
  };

  const handleClearBlacklist = async () => {
    if(blacklistCount === 0){ showToast("ℹ️ الـ blacklist فاضي"); return; }
    const yes = await ask("🔄 مسح الـ blacklist", `هتمسح الـ blacklist (${blacklistCount} منتج).\n\nالـ sync الجاي هـ يجيب المنتجات دي تاني.\n\nتأكيد؟`);
    if(!yes) return;
    try {
      const r = await shopifyBulkUpdateProducts({ productIds: [], action: "clear_blacklist" }, user);
      if(r?.ok){ showToast("✅ تم مسح الـ blacklist"); }
      else { showToast("⛔ " + (r?.error || "فشل")); }
    } catch(e){ showToast("⛔ " + e.message); }
  };

  if(!connected){
    return (
      <Card title="⚠️ مش متصل">
        <div style={{ padding: 24, textAlign: "center", color: T.textSec }}>روح تاب 🔌 الاتصال أولاً.</div>
      </Card>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Stats banner */}
      <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr 1fr 1fr" : "repeat(6, 1fr)", gap: 10 }}>
        <MetricCard label="إجمالي" value={String(stats.total)} icon="📦" color="#0EA5E9" />
        <MetricCard label="✅ matched" value={String(stats.matched)} color="#10B981" />
        <MetricCard label="⚠️ missing" value={String(stats.missing_in_clark)} color="#F59E0B" />
        <MetricCard label="🚫 mismatch" value={String(stats.mismatch)} color="#EF4444" />
        <MetricCard label="🛒 retail synced" value={String(stats.synced)} color="#8B5CF6" />
        <MetricCard label="🏭 جملة فقط" value={String(stats.wholesale)} color="#0D9488" />
      </div>

      {/* Top toolbar — sync + push + delete */}
      <Card title="📦 إدارة المنتجات" extra={
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <LoadingBtn primary loading={busy} loadingText="..." onClick={() => handleSyncProducts(false)} disabled={!canEdit} small>
            🔄 سحب الكل
          </LoadingBtn>
          <Btn small onClick={() => setShowSyncFilters(s => !s)} disabled={!canEdit}>
            🎯 سحب بـ filters
          </Btn>
          {stats.missing_in_clark > 0 && (
            <Btn small primary onClick={async () => {
              const yes = await ask("➕ إنشاء CLARK items لكل المفقودين",
                `هتعمل ${stats.missing_in_clark} item جديد في CLARK Inventory للمنتجات اللي SKU بتاعها مش موجود في الـ inventory.\n\n• كل item هـ يبقى بـ stock = 0 (تقدر تعدّل بعدين من تاب الـ Inventory)\n• model_no = SKU عشان الـ matching يشتغل\n• الـ name = title من Shopify\n• الـ price = first variant price\n\nتأكيد؟`);
              if(!yes) return;
              const missingIds = products.filter(p => p.mapping_status === "missing_in_clark" && p.sku).map(p => String(p.shopify_id));
              try {
                const r = await shopifyCreateClarkItem({ bulkProductIds: missingIds, stock: 0 }, user);
                if(r?.ok){
                  await tell("✅ تم", `تم إنشاء ${r.created} item جديد · تم ربط ${r.linked} موجود.\n\nالـ items هـ تلاقيها في CLARK → الـ Inventory tab.`);
                } else {
                  showToast("⛔ " + (r?.error || "فشل"));
                }
              } catch(e){ showToast("⛔ " + e.message); }
            }} disabled={!canEdit}>
              ➕ أنشئ {stats.missing_in_clark} في CLARK
            </Btn>
          )}
          <LoadingBtn loading={pushing} loadingText="..." onClick={() => handlePush(true)} disabled={!canEdit} small>
            🔍 Dry Run
          </LoadingBtn>
          <LoadingBtn loading={pushing} loadingText="..." onClick={() => handlePush(false)} disabled={!canEdit} small>
            📤 Push المخزون
          </LoadingBtn>
        </div>
      }>
        {cfg.last_products_sync_at && (
          <div style={{ fontSize: FS - 2, color: T.textMut, marginBottom: 6 }}>
            آخر sync للمنتجات: {new Date(cfg.last_products_sync_at).toLocaleString("ar-EG")}
          </div>
        )}
        {cfg.last_inventory_push_at && (
          <div style={{ fontSize: FS - 2, color: T.textMut, marginBottom: 10 }}>
            آخر push للمخزون: {new Date(cfg.last_inventory_push_at).toLocaleString("ar-EG")} ({cfg.last_inventory_push_count || 0} منتج)
          </div>
        )}

        {/* Sync filters panel */}
        {showSyncFilters && (
          <div style={{ padding: 14, background: T.bg, borderRadius: 10, marginBottom: 12, border: "1px solid " + T.brd }}>
            <div style={{ fontWeight: 800, fontSize: FS, color: T.text, marginBottom: 10 }}>🎯 Sync Filters — اختر اللي ينزل من Shopify</div>
            <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, display: "block", marginBottom: 4 }}>Status</label>
                <Sel value={syncFilters.status} onChange={v => setSyncFilters(s => ({ ...s, status: v }))}>
                  <option value="">كل الـ statuses</option>
                  <option value="active">active فقط</option>
                  <option value="draft">draft فقط</option>
                  <option value="archived">archived فقط</option>
                </Sel>
              </div>
              <div>
                <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, display: "block", marginBottom: 4 }}>Vendor</label>
                <Inp value={syncFilters.vendor} onChange={v => setSyncFilters(s => ({ ...s, vendor: v }))} placeholder="اسم الـ vendor (اختياري)" />
              </div>
              <div>
                <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, display: "block", marginBottom: 4 }}>Product Type</label>
                <Inp value={syncFilters.product_type} onChange={v => setSyncFilters(s => ({ ...s, product_type: v }))} placeholder="مثلاً: jacket" />
              </div>
              <div>
                <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, display: "block", marginBottom: 4 }}>SKU Prefix</label>
                <Inp value={syncFilters.sku_prefix} onChange={v => setSyncFilters(s => ({ ...s, sku_prefix: v }))} placeholder="مثلاً: WINTER-" />
              </div>
              <div style={{ display: "flex", alignItems: "center", paddingTop: 22 }}>
                <CheckLine label="published فقط" checked={syncFilters.published_only}
                  onChange={v => setSyncFilters(s => ({ ...s, published_only: v }))} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <LoadingBtn primary small loading={busy} onClick={() => handleSyncProducts(true)}>
                🎯 سحب بـ الـ filters دي
              </LoadingBtn>
              <Btn small onClick={() => setSyncFilters({ status: "", vendor: "", product_type: "", published_only: false, sku_prefix: "" })}>
                🔄 reset
              </Btn>
              <Btn small onClick={() => setShowSyncFilters(false)}>إغلاق</Btn>
            </div>
            <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 8 }}>
              ℹ️ الـ filters بـ تنطبق وقت السحب فقط. المنتجات الموجودة في CLARK ما بـ تتأثر — flags الـ user (synced, wholesale, buffer) بـ تتـ preserve.
            </div>
          </div>
        )}

        {/* Bulk actions bar — appears when items selected */}
        {selected.size > 0 && (
          <div style={{
            padding: "10px 14px",
            background: T.accent + "15",
            border: "1px solid " + T.accent + "40",
            borderRadius: 10,
            marginBottom: 12,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}>
            <span style={{ fontWeight: 800, color: T.accent, fontSize: FS }}>{selected.size} منتج محدد</span>
            <Btn small primary onClick={handleBulkCreateInClark}>➕ إنشاء في CLARK</Btn>
            <Btn small onClick={() => bulkAction("set_synced", { value: true })}>🔄 Sync ON</Btn>
            <Btn small onClick={() => bulkAction("set_synced", { value: false })}>⏸ Sync OFF</Btn>
            <Btn small onClick={() => bulkAction("set_wholesale_only", { value: true })}>🏭 جعل Wholesale</Btn>
            <Btn small onClick={() => bulkAction("set_wholesale_only", { value: false })}>🛒 جعل Retail</Btn>
            <Btn small onClick={handleBulkBuffer}>🛡 Set Buffer</Btn>
            <Btn small danger onClick={handleBulkDelete}>🗑 احذف من CLARK</Btn>
            <Btn small ghost onClick={clearSelection}>✕ Clear</Btn>
          </div>
        )}

        {/* Filters row */}
        <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 1fr 1fr 2fr", gap: 8, marginBottom: 12 }}>
          <Sel value={filter} onChange={setFilter}>
            <option value="all">كل الحالات ({products.length})</option>
            <option value="matched">✅ matched ({stats.matched})</option>
            <option value="missing_in_clark">⚠️ missing ({stats.missing_in_clark})</option>
            <option value="mismatch">🚫 mismatch ({stats.mismatch})</option>
          </Sel>
          <Sel value={showWholesale} onChange={setShowWholesale}>
            <option value="all">retail + wholesale</option>
            <option value="retail">🛒 retail فقط</option>
            <option value="wholesale">🏭 wholesale فقط</option>
          </Sel>
          {vendors.length > 0 && (
            <Sel value={vendorFilter} onChange={setVendorFilter}>
              <option value="">كل الـ vendors</option>
              {vendors.map(v => <option key={v} value={v}>{v}</option>)}
            </Sel>
          )}
          <Inp value={search} onChange={setSearch} placeholder="🔍 بحث بالـ SKU، العنوان، أو vendor..." />
        </div>

        {/* Select-all + result count */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, padding: "0 4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={() => {
                if(allVisibleSelected){
                  setSelected(prev => { const n = new Set(prev); visibleIds.forEach(id => n.delete(id)); return n; });
                } else {
                  setSelected(prev => { const n = new Set(prev); visibleIds.forEach(id => n.add(id)); return n; });
                }
              }}
              style={{ cursor: "pointer", width: 18, height: 18 }}
            />
            <span style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 600 }}>
              تحديد الكل المعروض ({visibleIds.length})
            </span>
          </div>
          <span style={{ fontSize: FS - 2, color: T.textSec }}>
            عرض <b>{Math.min(filtered.length, 100)}</b> من <b>{filtered.length}</b>
          </span>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: T.textMut }}>
            <div style={{ fontSize: 36, marginBottom: 8, opacity: 0.5 }}>📭</div>
            <div>{products.length === 0 ? "اضغط \"سحب الكل\" لأول مرة" : "مفيش منتجات تطابق الـ filters"}</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.slice(0, 100).map(p => (
              <ProductRow
                key={p.shopify_id}
                product={p}
                cfg={cfg}
                data={data}
                canEdit={canEdit}
                isMob={isMob}
                isSelected={selected.has(String(p.shopify_id))}
                isExpanded={expandedId === String(p.shopify_id)}
                onToggleSelect={() => toggleSelect(String(p.shopify_id))}
                onToggleExpand={() => setExpandedId(expandedId === String(p.shopify_id) ? null : String(p.shopify_id))}
                onToggleSync={() => handleToggleSync(p)}
                onToggleWholesale={() => handleToggleWholesale(p)}
                onSetBuffer={() => handleSetBuffer(p)}
                onDelete={() => handleDeleteOne(p)}
                onCreateInClark={() => handleCreateInClark(p)}
                storeUrl={cfg.store_url}
              />
            ))}
            {filtered.length > 100 && (
              <div style={{ textAlign: "center", padding: 6, color: T.textMut, fontSize: FS - 2 }}>
                + {filtered.length - 100} منتج أخرى — استخدم البحث/الـ filters للوصول إليهم
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Danger zone */}
      <Card title="⚠️ Danger Zone">
        <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 1fr", gap: 10 }}>
          <div style={{ padding: 14, background: "#FEE2E215", border: "1px solid #EF444430", borderRadius: 10 }}>
            <div style={{ fontWeight: 700, color: "#EF4444", fontSize: FS, marginBottom: 6 }}>🗑 احذف كل المنتجات من CLARK</div>
            <div style={{ fontSize: FS - 2, color: T.textSec, marginBottom: 10, lineHeight: 1.6 }}>
              يـ clear الـ shopifyProducts list كله. المنتجات في Shopify مش بتتأثر. كل الـ IDs بـ تضاف لـ blacklist عشان sync تاني ما يجيبهمش.
            </div>
            <Btn danger small onClick={handleDeleteAll} disabled={!canEdit || products.length === 0}>
              🗑 احذف الكل ({products.length})
            </Btn>
          </div>
          <div style={{ padding: 14, background: "#FEF3C715", border: "1px solid #F59E0B30", borderRadius: 10 }}>
            <div style={{ fontWeight: 700, color: "#92400E", fontSize: FS, marginBottom: 6 }}>🔄 مسح الـ Blacklist ({blacklistCount} منتج)</div>
            <div style={{ fontSize: FS - 2, color: T.textSec, marginBottom: 10, lineHeight: 1.6 }}>
              الـ blacklist بـ يمنع المنتجات المحذوفة من الرجوع وقت الـ sync. مسحه يخلي الـ sync الجاي يجيب كل المنتجات تاني.
            </div>
            <Btn small onClick={handleClearBlacklist} disabled={!canEdit || blacklistCount === 0}>
              🔄 مسح الـ Blacklist
            </Btn>
          </div>
        </div>
      </Card>

      {/* Last push result */}
      {lastPushResult && (
        <Card title="📊 نتيجة آخر Push">
          <div style={{ fontSize: FS - 2, color: T.textSec, marginBottom: 10 }}>
            Location: {lastPushResult.location?.name || lastPushResult.location?.id}
            · Total: {lastPushResult.total}
            · Pushed: {lastPushResult.pushed}
            · Skipped: {lastPushResult.skipped}
            · Errors: {lastPushResult.errors}
          </div>
          {(lastPushResult.details || []).slice(0, 30).map((d, i) => (
            <div key={i} style={{
              padding: "6px 10px",
              fontSize: FS - 2,
              borderRadius: 6,
              background: d.status === "pushed" ? "#10B98110"
                       : d.status === "error" ? "#EF444410"
                       : T.bg,
              border: "1px solid " + T.brd,
              marginBottom: 4,
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
              flexWrap: "wrap",
            }}>
              <span style={{ fontFamily: "monospace" }}>{d.sku} <span style={{ color: T.textMut, fontWeight: 400 }}>· {d.status}{d.skip_reason ? ` (${d.skip_reason})` : ""}</span></span>
              <span style={{ color: T.textSec }}>
                {d.physical != null && (
                  <>physical: {d.physical} − reserved: {d.reserved} − buffer: {d.buffer} = <b>{d.available}</b></>
                )}
                {d.error && <span style={{ color: T.err, marginInlineStart: 8 }}>· {d.error}</span>}
              </span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function ProductRow({ product, cfg, data, canEdit, isMob, isSelected, isExpanded, onToggleSelect, onToggleExpand, onToggleSync, onToggleWholesale, onSetBuffer, onDelete, onCreateInClark, storeUrl }){
  const synced = product.shopify_synced !== false;
  const wholesale = product.wholesale_only === true;
  const matched = product.mapping_status === "matched";
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const options = Array.isArray(product.options) ? product.options : [];
  const v0 = variants[0] || {};
  const inv = (Array.isArray(data?.inventoryItems) ? data.inventoryItems : [])
    .find(it => (it.model_no && it.model_no === product.sku) || (it.sku && it.sku === product.sku));
  const physicalStock = Number(inv?.stock) || 0;
  const reserved = (Array.isArray(data?.stockReservations) ? data.stockReservations : [])
    .filter(r => (r.status === "active" || r.status === "committed") && r.product_sku === product.sku)
    .reduce((s, r) => s + (Number(r.qty) || 0), 0);
  const defaultBuffer = Number(cfg.default_safety_buffer) || 0;
  const buffer = product.safety_buffer != null ? Number(product.safety_buffer) : defaultBuffer;
  const available = Math.max(0, physicalStock - reserved - buffer);
  const shopifyQty = Number(product.total_inventory) || Number(v0.inventory_quantity) || 0;
  const inSync = available === shopifyQty;

  /* Status badge */
  let statusMeta;
  if(wholesale){
    statusMeta = { c: "#0D9488", l: "🏭 جملة فقط" };
  } else if(matched){
    statusMeta = synced ? { c: "#10B981", l: "🛒 retail · synced" } : { c: "#F59E0B", l: "⏸ paused" };
  } else if(product.mapping_status === "missing_in_clark"){
    statusMeta = { c: "#F59E0B", l: "⚠️ missing in CLARK" };
  } else {
    statusMeta = { c: "#EF4444", l: "🚫 mismatch" };
  }

  /* Price label */
  const priceLabel = product.min_price && product.max_price
    ? (product.min_price === product.max_price ? `${fmt(product.min_price)} ج` : `${fmt(product.min_price)} - ${fmt(product.max_price)} ج`)
    : (v0.price ? `${fmt(v0.price)} ج` : "");

  /* Shopify status */
  const shopifyStatus = product.status === "active" ? "🟢 active" : product.status === "draft" ? "📝 draft" : "📦 archived";

  return (
    <div style={{
      padding: "10px 12px",
      borderRadius: 10,
      background: isSelected ? T.accent + "08" : T.cardSolid,
      border: "1px solid " + (isSelected ? T.accent + "40" : T.brd),
      borderInlineStart: "3px solid " + statusMeta.c,
    }}>
      {/* Main row */}
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          style={{ cursor: "pointer", width: 18, height: 18, marginTop: 4, flexShrink: 0 }}
        />

        {/* V20.0: Image thumbnail with 3:4 portrait aspect ratio (matches Shopify default).
            Width is fixed; height = width × 4/3. Click to expand. */}
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.title || ""}
            onClick={onToggleExpand}
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
            style={{
              width: isMob ? 60 : 75,
              height: isMob ? 80 : 100, /* 3:4 portrait */
              objectFit: "cover",
              objectPosition: "center top",
              borderRadius: 8,
              border: "1px solid " + T.brd,
              background: T.bg,
              flexShrink: 0,
              cursor: "pointer",
            }}
            loading="lazy"
            onError={e => {
              /* Try without crossOrigin (Shopify CDN occasionally rejects it). */
              if(!e.target.dataset.retried){
                e.target.dataset.retried = "1";
                e.target.removeAttribute("crossOrigin");
                e.target.src = product.image_url + "?_retry=1";
                return;
              }
              e.target.style.display = "none";
              const fallback = e.target.nextSibling;
              if(fallback) fallback.style.display = "flex";
            }}
          />
        ) : null}
        {/* Fallback placeholder (always rendered, hidden if image loads) */}
        <div
          onClick={onToggleExpand}
          style={{
            display: product.image_url ? "none" : "flex",
            width: isMob ? 60 : 75,
            height: isMob ? 80 : 100, /* 3:4 portrait */
            borderRadius: 8,
            background: T.bg,
            border: "1px solid " + T.brd,
            alignItems: "center",
            justifyContent: "center",
            fontSize: 28,
            flexShrink: 0,
            cursor: "pointer",
          }}
        >📦</div>

        {/* Body */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: FS, color: T.text, cursor: "pointer" }} onClick={onToggleExpand}>
              {product.title || "(no title)"}
            </span>
            <span style={{
              fontSize: FS - 3, fontWeight: 700, padding: "2px 8px",
              borderRadius: 8, background: statusMeta.c + "20", color: statusMeta.c,
            }}>{statusMeta.l}</span>
          </div>
          <div style={{ fontSize: FS - 2, color: T.textSec, marginTop: 3, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "monospace" }}>SKU: {product.sku || "(none)"}</span>
            <span>· variants: {variants.length}</span>
            {priceLabel && <span>· {priceLabel}</span>}
            {product.vendor && <span>· {product.vendor}</span>}
            <span>· {shopifyStatus}</span>
          </div>
          {/* V20.0: inline options summary on the main row */}
          {options.length > 0 && (
            <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {options.map((o, i) => (
                <span key={i} style={{ padding: "1px 6px", borderRadius: 4, background: T.bg }}>
                  <b>{o.name}:</b> {o.values.slice(0, 4).join(", ")}{o.values.length > 4 ? "…" : ""}
                </span>
              ))}
            </div>
          )}
          {matched && !isMob && (
            <div style={{ fontSize: FS - 2, color: T.textSec, marginTop: 6, lineHeight: 1.6 }}>
              <span>📦 CLARK: <b>{physicalStock}</b></span>
              <span style={{ marginInlineStart: 8 }}>− <b>{reserved}</b> reserved</span>
              <span style={{ marginInlineStart: 8 }}>− <b>{buffer}</b> buffer</span>
              <span style={{ marginInlineStart: 8 }}>= <b style={{ color: T.accent }}>{available}</b></span>
              <span style={{ marginInlineStart: 12, padding: "1px 8px", borderRadius: 6, background: inSync ? "#10B98115" : "#F59E0B15", color: inSync ? "#10B981" : "#F59E0B", fontWeight: 700 }}>
                Shopify: {shopifyQty} {inSync ? "✓" : "⚠"}
              </span>
            </div>
          )}
        </div>

        {/* Actions menu (always visible) */}
        <div style={{ display: "flex", flexDirection: isMob ? "row" : "column", gap: 4, flexShrink: 0, flexWrap: "wrap" }}>
          {!matched && product.sku && (
            <Btn small primary onClick={onCreateInClark} disabled={!canEdit} title="إنشاء item في CLARK Inventory">
              ➕
            </Btn>
          )}
          {matched && (
            <Btn small ghost onClick={onToggleSync} disabled={!canEdit} title="Sync ON/OFF">
              {synced ? "🔄" : "⏸"}
            </Btn>
          )}
          <Btn small ghost onClick={onToggleWholesale} disabled={!canEdit} title={wholesale ? "تحويل لـ retail" : "تحويل لـ wholesale"}>
            {wholesale ? "🏭" : "🛒"}
          </Btn>
          <Btn small ghost onClick={onToggleExpand} title={isExpanded ? "إخفاء التفاصيل" : "عرض التفاصيل"}>
            {isExpanded ? "▲" : "▼"}
          </Btn>
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div style={{
          marginTop: 12,
          padding: 12,
          background: T.bg,
          borderRadius: 8,
          border: "1px solid " + T.brd,
          fontSize: FS - 1,
        }}>
          {/* V20.0: Image gallery (3:4 portrait) — show all product images, click to enlarge */}
          {Array.isArray(product.images) && product.images.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700, color: T.text, marginBottom: 6 }}>🖼 الصور ({product.images.length})</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {product.images.slice(0, 8).map((img, i) => (
                  <a
                    key={img.id || i}
                    href={img.src}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="افتح في tab جديد"
                    style={{ display: "block" }}
                  >
                    <img
                      src={img.src}
                      alt={img.alt || ""}
                      referrerPolicy="no-referrer"
                      style={{
                        width: isMob ? 90 : 120,
                        height: isMob ? 120 : 160, /* 3:4 portrait */
                        objectFit: "cover",
                        objectPosition: "center top",
                        borderRadius: 8,
                        border: "1px solid " + T.brd,
                        background: T.cardSolid,
                        cursor: "zoom-in",
                      }}
                      loading="lazy"
                      onError={e => { e.target.style.display = "none"; }}
                    />
                  </a>
                ))}
                {product.images.length > 8 && (
                  <div style={{ fontSize: FS - 3, color: T.textMut, alignSelf: "center" }}>+ {product.images.length - 8} صورة</div>
                )}
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontWeight: 700, color: T.text, marginBottom: 6 }}>📝 معلومات Shopify</div>
              <div style={{ color: T.textSec, lineHeight: 1.8, fontSize: FS - 2 }}>
                <div>Shopify ID: <span style={{ fontFamily: "monospace" }}>{product.shopify_id}</span></div>
                <div>Handle: <span style={{ fontFamily: "monospace" }}>{product.handle || "—"}</span></div>
                <div>Type: {product.product_type || "—"}</div>
                <div>Tags: {product.tags || "—"}</div>
                <div>Total inventory (Shopify): {shopifyQty}</div>
                {product.published_at && <div>Published: {new Date(product.published_at).toLocaleDateString("ar-EG")}</div>}
                {product.last_synced_at && <div>Last synced: {new Date(product.last_synced_at).toLocaleString("ar-EG")}</div>}
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 700, color: T.text, marginBottom: 6 }}>🔗 ربط CLARK</div>
              <div style={{ color: T.textSec, lineHeight: 1.8, fontSize: FS - 2 }}>
                <div>Mapping: <b style={{ color: statusMeta.c }}>{product.mapping_status}</b></div>
                {inv ? (
                  <>
                    <div>CLARK item: <b>{inv.name || inv.id}</b></div>
                    <div>Stock: {physicalStock}</div>
                    <div>Buffer: {buffer} {product.safety_buffer != null ? "(custom)" : "(default)"}</div>
                    <div>Reserved: {reserved}</div>
                    <div>Available for Shopify: <b style={{ color: T.accent }}>{available}</b></div>
                  </>
                ) : (
                  <div style={{ color: T.warn }}>⚠️ مفيش item في CLARK بـ model_no = "{product.sku}". أضفه في الـ inventory الأول، أو ابقى عرّفه manually.</div>
                )}
              </div>
            </div>
          </div>

          {/* V20.0: Variants list with proper option labels */}
          {variants.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700, color: T.text, marginBottom: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                🎨 الـ Variants ({variants.length})
                {options.length > 0 && (
                  <span style={{ fontSize: FS - 2, color: T.textMut, fontWeight: 400 }}>
                    · {options.map(o => o.name).join(" / ")}
                  </span>
                )}
              </div>

              {/* Show options summary (e.g. "Size: S, M, L · Color: Black, White") */}
              {options.length > 0 && (
                <div style={{ marginBottom: 8, padding: 8, background: T.cardSolid, borderRadius: 6, fontSize: FS - 2 }}>
                  {options.map((o, i) => (
                    <div key={i} style={{ marginBottom: i < options.length - 1 ? 6 : 0 }}>
                      <b style={{ color: T.text }}>{o.name}:</b>{" "}
                      <span style={{ color: T.textSec }}>{o.values.join(", ")}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Variant table — only show if there ARE proper variants (not all default) */}
              {variants.some(v => (v.option1 && v.option1 !== "Default Title") || v.option2 || v.option3) ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {variants.slice(0, 12).map((v, i) => {
                    /* Build a display label using the option NAMES from product.options */
                    const labels = [];
                    if(v.option1 && options[0]?.name) labels.push(options[0].name + ": " + v.option1);
                    else if(v.option1) labels.push(v.option1);
                    if(v.option2 && options[1]?.name) labels.push(options[1].name + ": " + v.option2);
                    else if(v.option2) labels.push(v.option2);
                    if(v.option3 && options[2]?.name) labels.push(options[2].name + ": " + v.option3);
                    else if(v.option3) labels.push(v.option3);
                    const label = labels.length > 0 ? labels.join(" · ") : "Default";
                    return (
                      <div key={v.variant_id || i} style={{ padding: "6px 10px", background: T.cardSolid, borderRadius: 6, fontSize: FS - 2, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                        <span style={{ fontWeight: 600 }}>{label}</span>
                        <span style={{ color: T.textSec }}>
                          {v.sku && <span style={{ fontFamily: "monospace" }}>{v.sku} · </span>}
                          {fmt(v.price)} ج · qty: <b style={{ color: v.inventory_quantity > 0 ? T.ok : T.textMut }}>{v.inventory_quantity || 0}</b>
                        </span>
                      </div>
                    );
                  })}
                  {variants.length > 12 && (
                    <div style={{ fontSize: FS - 3, color: T.textMut, textAlign: "center", padding: 4 }}>+ {variants.length - 12} variant آخر</div>
                  )}
                </div>
              ) : (
                <div style={{ padding: 10, background: T.cardSolid, borderRadius: 6, fontSize: FS - 2, color: T.textSec, lineHeight: 1.6 }}>
                  ℹ️ المنتج ده عنده {variants.length} variant بس كلهم بـ <code>Default Title</code> — يعني مفيش options محددة (Size/Color) في Shopify. لو محتاج ده، روح Shopify Admin → المنتج → Variants → ضيف options.
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {!matched && product.sku && (
              <Btn small primary onClick={onCreateInClark} disabled={!canEdit}>
                ➕ إنشاء في CLARK Inventory
              </Btn>
            )}
            {matched && (
              <Btn small onClick={onToggleSync} disabled={!canEdit}>
                {synced ? "⏸ Pause sync" : "🔄 Resume sync"}
              </Btn>
            )}
            <Btn small onClick={onToggleWholesale} disabled={!canEdit}>
              {wholesale ? "🛒 تحويل لـ retail" : "🏭 تحويل لـ wholesale"}
            </Btn>
            {matched && (
              <Btn small onClick={onSetBuffer} disabled={!canEdit}>
                🛡 Buffer ({buffer})
              </Btn>
            )}
            {storeUrl && (
              <Btn small onClick={() => window.open(`https://${storeUrl}/admin/products/${product.shopify_id}`, "_blank")}>
                ↗ افتح في Shopify
              </Btn>
            )}
            <Btn small danger onClick={onDelete} disabled={!canEdit}>
              🗑 حذف من CLARK
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}

/* V19.95 Phase 3: ShopifyInvoicesTab — read-only view of all sales
   invoices + credit notes sourced from Shopify (source === "shopify").
   Posts/voids happen in the regular Sales Invoices and Credit Notes
   tabs — this is just a Shopify-filtered convenience view. */
function ShopifyInvoicesTab({ data, isMob }){
  const allInvoices = useMemo(() =>
    (Array.isArray(data?.salesInvoices) ? data.salesInvoices : [])
      .filter(inv => inv.source === "shopify"),
    [data?.salesInvoices]
  );
  const allCreditNotes = useMemo(() =>
    (Array.isArray(data?.salesCreditNotes) ? data.salesCreditNotes : [])
      .filter(cn => cn.source === "shopify"),
    [data?.salesCreditNotes]
  );

  const stats = useMemo(() => {
    let draftAmt = 0, postedAmt = 0, voidAmt = 0;
    let draftCount = 0, postedCount = 0, voidCount = 0;
    allInvoices.forEach(inv => {
      const amt = Number(inv.total) || 0;
      if(inv.status === "draft"){ draftCount++; draftAmt += amt; }
      else if(inv.status === "posted"){ postedCount++; postedAmt += amt; }
      else if(inv.status === "void"){ voidCount++; voidAmt += amt; }
    });
    let cnTotal = 0;
    allCreditNotes.forEach(cn => { cnTotal += Number(cn.total) || 0; });
    return { draftCount, postedCount, voidCount, draftAmt, postedAmt, voidAmt, cnTotal, cnCount: allCreditNotes.length };
  }, [allInvoices, allCreditNotes]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10 }}>
        <MetricCard label="فواتير draft" value={String(stats.draftCount)} icon="📝" color="#F59E0B" sub={fmt(stats.draftAmt) + " ج"} />
        <MetricCard label="فواتير posted" value={String(stats.postedCount)} icon="✅" color="#10B981" sub={fmt(stats.postedAmt) + " ج"} />
        <MetricCard label="إجمالي إيرادات" value={fmt(stats.postedAmt) + " ج"} icon="💰" color="#0EA5E9" />
        <MetricCard label="مرتجعات" value={String(stats.cnCount)} icon="↩️" color="#EF4444" sub={fmt(stats.cnTotal) + " ج"} />
      </div>

      <Card title="🧾 فواتير Shopify">
        <div style={{ fontSize: FS - 1, color: T.textSec, marginBottom: 10 }}>
          الفواتير الـ draft دي اتعملت من Phase 3 — اضغط على أي واحدة عشان تشوفها في تاب "فواتير المبيعات" وتعمل Post.
        </div>
        {allInvoices.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: T.textMut }}>
            <div style={{ fontSize: 36, marginBottom: 8, opacity: 0.5 }}>📭</div>
            <div style={{ fontSize: FS - 1 }}>مفيش فواتير من Shopify لسه</div>
            <div style={{ fontSize: FS - 2, marginTop: 4 }}>اعمل Mark Delivered لطلب من تاب الطلبات عشان فاتورة تتعمل</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {allInvoices.slice(0, 50).map(inv => {
              const statusMeta = inv.status === "posted" ? { c: "#10B981", l: "Posted" }
                              : inv.status === "void" ? { c: "#94A3B8", l: "Void" }
                              : { c: "#F59E0B", l: "Draft" };
              return (
                <div key={inv.id} style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: T.cardSolid,
                  border: "1px solid " + T.brd,
                  borderInlineStart: "3px solid " + statusMeta.c,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 800, fontSize: FS, color: T.text }}>📄 {inv.invoiceNo}</span>
                      <span style={{
                        fontSize: FS - 3,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 8,
                        background: statusMeta.c + "20",
                        color: statusMeta.c,
                      }}>{statusMeta.l}</span>
                      <span style={{ fontSize: FS - 2, color: T.textMut }}>{inv.date}</span>
                    </div>
                    <div style={{ fontSize: FS - 1, color: T.textSec, marginTop: 4 }}>
                      {inv.shopify_customer_name || inv.customerName || "—"}
                      {inv.shopify_customer_phone && (
                        <span style={{ marginInlineStart: 8 }}>📞 {inv.shopify_customer_phone}</span>
                      )}
                      {inv.shopify_order_number && (
                        <span style={{ marginInlineStart: 8 }}>🛒 #{inv.shopify_order_number}</span>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: FS + 1, fontWeight: 800, color: T.accent }}>
                    {fmt(inv.total)} ج
                  </div>
                </div>
              );
            })}
            {allInvoices.length > 50 && (
              <div style={{ textAlign: "center", padding: 8, color: T.textMut, fontSize: FS - 2 }}>
                + {allInvoices.length - 50} فاتورة أخرى — افتح تاب "فواتير المبيعات" لعرضها كلها
              </div>
            )}
          </div>
        )}
      </Card>

      {allCreditNotes.length > 0 && (
        <Card title="↩️ مرتجعات Shopify (Credit Notes)">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {allCreditNotes.slice(0, 30).map(cn => (
              <div key={cn.id} style={{
                padding: "10px 14px",
                borderRadius: 10,
                background: "#FEE2E210",
                border: "1px solid #EF444430",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: FS, color: T.text }}>↩️ {cn.creditNoteNo}</div>
                  <div style={{ fontSize: FS - 2, color: T.textSec }}>
                    {cn.shopify_customer_name || cn.customerName} · #{cn.shopify_order_number || "—"} · {cn.date}
                  </div>
                </div>
                <div style={{ fontSize: FS, fontWeight: 700, color: "#EF4444" }}>
                  −{fmt(cn.total)} ج
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/* V19.94 Phase 2: Compact summary of an order's stock reservations.
   Shows: active count + qty, plus warnings for unmatched SKUs (which
   means the order's product isn't in CLARK's inventoryItems and Phase 4
   inventory push will skip it). */
function ReservationSummary({ reservations }){
  if(!reservations || reservations.length === 0) return null;
  const active = reservations.filter(r => r.status === "active");
  const committed = reservations.filter(r => r.status === "committed");
  const released = reservations.filter(r => r.status === "released" || r.status === "expired");
  const unmatchedActive = active.filter(r => r.unmatched);
  if(active.length > 0){
    const totalQty = active.reduce((s, r) => s + (Number(r.qty) || 0), 0);
    return (
      <div style={{ marginTop: 4 }}>
        📦 <b>Stock محجوز</b>: {totalQty} قطعة في {active.length} reservation{active.length > 1 ? "s" : ""}
        {unmatchedActive.length > 0 && (
          <span style={{ color: T.warn, marginInlineStart: 8 }}>
            ⚠️ {unmatchedActive.length} منهم SKU مش متوفر في CLARK
          </span>
        )}
      </div>
    );
  }
  if(committed.length > 0){
    return <div style={{ marginTop: 4 }}>📦 Stock تم خصمه ({committed.length} reservation committed)</div>;
  }
  if(released.length > 0){
    return <div style={{ marginTop: 4, color: T.textMut }}>📦 Stock تم تحريره ({released.length} reservation released)</div>;
  }
  return null;
}

/* V20.1 Phase 9: Bosta integration settings card (used in SettingsTab).
   Lets the admin enable Bosta, save the API key, generate a webhook
   secret (returned ONCE for env var setup), and toggle auto-actions. */
function BostaSettingsCard({ data, canEdit, user, isMob }){
  const cfg = data?.shopifyConfig || {};
  const [apiKey, setApiKey] = useState("");
  const [businessId, setBusinessId] = useState(cfg.bosta_business_id || "");
  const [busy, setBusy] = useState(false);
  const [generatedSecret, setGeneratedSecret] = useState(null);
  const [generatedUrl, setGeneratedUrl] = useState("");
  const [hasEnvSecret, setHasEnvSecret] = useState(false);
  const [webhookUrlBase, setWebhookUrlBase] = useState("");

  const enabled = !!cfg.bosta_enabled;
  const apiKeySet = !!cfg.bosta_api_key;

  /* Initial fetch to know if env secret is set + the webhook URL base.
     V20.2.1: guard against `user` being undefined (happens during the
     initial render before auth is fully wired) — bostaConfigure would
     throw "user is not defined" and crash the whole Settings tab. */
  useEffect(() => {
    if(!user || typeof user.getIdToken !== "function") return;
    let cancelled = false;
    (async () => {
      try {
        const r = await bostaConfigure({}, user); /* read current settings */
        if(cancelled) return;
        if(r?.ok){
          setHasEnvSecret(!!r.hasWebhookSecretSet);
          setWebhookUrlBase(r.webhookUrlBase || "");
        }
      } catch(_){}
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const save = async (overrides) => {
    if(!canEdit){ showToast("⛔ مفيش صلاحية"); return; }
    setBusy(true);
    try {
      const payload = {};
      if(apiKey.trim()) payload.api_key = apiKey.trim();
      if(businessId !== cfg.bosta_business_id) payload.business_id = businessId.trim();
      Object.assign(payload, overrides || {});
      const r = await bostaConfigure(payload, user);
      if(r?.ok){
        if(r.generatedSecret){
          setGeneratedSecret(r.generatedSecret);
          setGeneratedUrl(r.webhookUrl || "");
        }
        setApiKey(""); /* never keep API key in UI state */
        setHasEnvSecret(!!r.hasWebhookSecretSet);
        if(r.webhookUrlBase) setWebhookUrlBase(r.webhookUrlBase);
        showToast("✅ تم الحفظ");
      } else {
        showToast("⛔ " + (r?.error || "فشل"));
      }
    } catch(e){ showToast("⛔ " + e.message); }
    finally { setBusy(false); }
  };

  const generateSecret = async () => {
    const yes = await ask("🔑 توليد webhook secret جديد",
      "هـ يتولّد secret جديد. لازم تـ:\n1. تنسخه دلوقتي (مش هـ يظهر تاني)\n2. تضيفه في Vercel env vars (BOSTA_WEBHOOK_SECRET)\n3. تحط الـ URL الكامل في Bosta dashboard\n\nتأكيد؟");
    if(!yes) return;
    save({ regenerate_secret: true });
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast("📋 تم النسخ");
    } catch(_){
      showToast("⚠️ النسخ فشل — حدد النص يدوياً");
    }
  };

  const labelStyle = { display: "block", fontSize: FS - 1, color: T.textSec, fontWeight: 700, marginBottom: 6 };

  return (
    <Card title="🚚 تكامل Bosta للشحن" extra={
      <span style={{
        fontSize: FS - 2, fontWeight: 700,
        padding: "3px 10px", borderRadius: 10,
        background: enabled ? T.ok + "15" : T.textMut + "15",
        color: enabled ? T.ok : T.textMut,
      }}>{enabled ? "● مفعّل" : "○ متوقف"}</span>
    }>
      <CheckLine
        label="تفعيل التكامل مع Bosta"
        checked={enabled}
        onChange={v => save({ enabled: v })}
        disabled={!canEdit}
      />

      <div style={{ marginTop: 12, padding: 12, background: T.bg, borderRadius: 8 }}>
        <div style={{ fontWeight: 700, fontSize: FS, color: T.text, marginBottom: 10 }}>1️⃣ Bosta API Key</div>
        <div style={{ fontSize: FS - 2, color: T.textSec, marginBottom: 8 }}>
          دي للـ outbound calls (refresh status من Bosta API). انسخها من Bosta Dashboard → ربط التطبيقات → API key المسمى "Shopify".
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <Inp
              value={apiKey}
              onChange={setApiKey}
              type="password"
              placeholder={apiKeySet ? "محفوظ — اكتب جديد للتحديث" : "ادخل الـ API key من Bosta"}
            />
          </div>
          <LoadingBtn primary loading={busy} loadingText="..." onClick={() => save({})} disabled={!canEdit || (!apiKey.trim() && businessId === cfg.bosta_business_id)} small>
            💾 حفظ
          </LoadingBtn>
        </div>
        {apiKeySet && <div style={{ fontSize: FS - 3, color: T.ok, marginTop: 4 }}>✅ API key محفوظ server-side</div>}
      </div>

      <div style={{ marginTop: 12, padding: 12, background: T.bg, borderRadius: 8 }}>
        <div style={{ fontWeight: 700, fontSize: FS, color: T.text, marginBottom: 10 }}>2️⃣ Webhook URL — يستلم updates من Bosta</div>
        <div style={{ fontSize: FS - 2, color: T.textSec, lineHeight: 1.7, marginBottom: 10 }}>
          الـ webhook بـ يخلّي Bosta تـ inform CLARK فوراً لما حالة شحنة تتغيّر. لازم secret token عشان نأمن الـ endpoint.
        </div>

        {!hasEnvSecret && !generatedSecret && (
          <div style={{ padding: "8px 12px", background: "#FEF3C715", border: "1px solid #F59E0B40", borderRadius: 6, marginBottom: 10, fontSize: FS - 2, color: "#92400E" }}>
            ⚠️ مفيش webhook secret في Vercel env vars (BOSTA_WEBHOOK_SECRET). اضغط "ولّد Secret" تحت لتوليد واحد.
          </div>
        )}

        {hasEnvSecret && !generatedSecret && (
          <div style={{ padding: "8px 12px", background: "#D1FAE515", border: "1px solid " + T.ok + "40", borderRadius: 6, marginBottom: 10, fontSize: FS - 2, color: T.ok }}>
            ✅ Webhook secret معدّ في Vercel. الـ URL جاهز للاستخدام.
          </div>
        )}

        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Webhook URL (قاعدة)</label>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <code style={{
              flex: 1,
              padding: "8px 10px",
              background: T.cardSolid,
              border: "1px solid " + T.brd,
              borderRadius: 6,
              fontSize: FS - 2,
              wordBreak: "break-all",
            }}>{webhookUrlBase || "(loading…)"}</code>
            {webhookUrlBase && (
              <Btn small onClick={() => copyToClipboard(webhookUrlBase)}>📋</Btn>
            )}
          </div>
        </div>

        {generatedSecret && (
          <div style={{ marginTop: 10, padding: 12, background: "#FEF3C7", border: "2px solid #F59E0B", borderRadius: 8 }}>
            <div style={{ fontWeight: 800, color: "#92400E", marginBottom: 8 }}>🔐 Secret جديد — انسخه فوراً (هـ يظهر مرة واحدة فقط)</div>
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>الـ Secret:</label>
              <div style={{ display: "flex", gap: 6 }}>
                <code style={{
                  flex: 1,
                  padding: "8px 10px",
                  background: "#fff",
                  border: "1px solid " + T.brd,
                  borderRadius: 6,
                  fontFamily: "monospace",
                  fontSize: FS - 1,
                  wordBreak: "break-all",
                }}>{generatedSecret}</code>
                <Btn small primary onClick={() => copyToClipboard(generatedSecret)}>📋 انسخ</Btn>
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>الـ URL الكامل (للصق في Bosta):</label>
              <div style={{ display: "flex", gap: 6 }}>
                <code style={{
                  flex: 1,
                  padding: "8px 10px",
                  background: "#fff",
                  border: "1px solid " + T.brd,
                  borderRadius: 6,
                  fontFamily: "monospace",
                  fontSize: FS - 2,
                  wordBreak: "break-all",
                  color: T.accent,
                }}>{generatedUrl}</code>
                <Btn small primary onClick={() => copyToClipboard(generatedUrl)}>📋</Btn>
              </div>
            </div>
            <div style={{ fontSize: FS - 2, color: "#92400E", lineHeight: 1.8 }}>
              <b>الخطوات:</b><br/>
              1. روح <b>Vercel Dashboard → Settings → Environment Variables</b><br/>
              2. أضف: <code>BOSTA_WEBHOOK_SECRET</code> = الـ Secret اللي فوق<br/>
              3. روح <b>Bosta Dashboard → ربط التطبيقات → إضافة رابط الـ Webhook</b><br/>
              4. الصق الـ URL الكامل (مع <code>?token=…</code>)<br/>
              5. Save في الجانبين — Vercel هـ يـ redeploy تلقائياً
            </div>
            <div style={{ marginTop: 10, textAlign: "center" }}>
              <Btn small ghost onClick={() => { setGeneratedSecret(null); setGeneratedUrl(""); }}>إخفاء</Btn>
            </div>
          </div>
        )}

        <div style={{ marginTop: 10 }}>
          <Btn small onClick={generateSecret} disabled={!canEdit || busy}>
            🔑 {hasEnvSecret ? "ولّد Secret جديد (rotation)" : "ولّد Webhook Secret"}
          </Btn>
        </div>
      </div>

      <div style={{ marginTop: 12, padding: 12, background: T.bg, borderRadius: 8 }}>
        <div style={{ fontWeight: 700, fontSize: FS, color: T.text, marginBottom: 10 }}>3️⃣ Auto Actions</div>
        <CheckLine
          label="✅ Mark order as delivered تلقائياً لما Bosta يقول Delivered"
          checked={!!cfg.bosta_auto_mark_delivered}
          onChange={v => save({ auto_mark_delivered: v })}
          disabled={!canEdit}
        />
        <CheckLine
          label="❌ Mark order as refused تلقائياً لما Bosta يقول Returned"
          checked={!!cfg.bosta_auto_mark_refused}
          onChange={v => save({ auto_mark_refused: v })}
          disabled={!canEdit}
        />
        <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 6 }}>
          ⚠️ الـ Auto-actions بـ تـ trigger الـ flow الكامل (فاتورة + commit reservations). شغّلها بس لما تكون مطمن للتكامل.
        </div>
      </div>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   V20.1 Phase 9 — ShippingTab (Bosta integration)
   ───────────────────────────────────────────────────────────────────────
   Shows all Shopify orders with their Bosta tracking status. Lets the
   admin manually link a tracking number, refresh status from Bosta API,
   or view the full state-history timeline.

   Reads from: data.shopifyPendingOrders[].bosta (set by webhook + manual)
   ═══════════════════════════════════════════════════════════════════════ */
function ShippingTab({ data, canEdit, user, isMob }){
  const cfg = data?.shopifyConfig || {};
  const orders = useMemo(() => Array.isArray(data?.shopifyPendingOrders) ? data.shopifyPendingOrders : [], [data]);
  const misses = useMemo(() => Array.isArray(data?.bostaWebhookMisses) ? data.bostaWebhookMisses : [], [data]);
  const [bucketFilter, setBucketFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showOnlyTracked, setShowOnlyTracked] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const enabled = !!cfg.bosta_enabled;
  const apiKeySet = !!cfg.bosta_api_key;

  /* Stats by bucket */
  const stats = useMemo(() => {
    const s = { total: 0, tracked: 0, untracked: 0, byBucket: {} };
    BOSTA_BUCKETS.forEach(b => { s.byBucket[b.key] = 0; });
    orders.forEach(o => {
      s.total++;
      if(o.bosta?.tracking_number){
        s.tracked++;
        const b = o.bosta?.state_bucket || "unknown";
        s.byBucket[b] = (s.byBucket[b] || 0) + 1;
      } else {
        s.untracked++;
      }
    });
    return s;
  }, [orders]);

  /* Filtered list */
  const filtered = useMemo(() => {
    let res = orders;
    if(showOnlyTracked) res = res.filter(o => o.bosta?.tracking_number);
    if(bucketFilter !== "all"){
      if(bucketFilter === "untracked"){
        res = res.filter(o => !o.bosta?.tracking_number);
      } else {
        res = res.filter(o => o.bosta?.state_bucket === bucketFilter);
      }
    }
    const q = search.trim().toLowerCase();
    if(q){
      res = res.filter(o =>
        String(o.shopify_order_number || "").toLowerCase().includes(q) ||
        String(o.bosta?.tracking_number || "").toLowerCase().includes(q) ||
        String(o.customer_info?.name || "").toLowerCase().includes(q) ||
        String(o.customer_info?.phone || "").toLowerCase().includes(q)
      );
    }
    /* Sort: most-recently-updated bosta state first, then by created_at */
    res = res.slice().sort((a, b) => {
      const ta = new Date(a.bosta?.last_state_at || a.shopify_created_at || 0).getTime();
      const tb = new Date(b.bosta?.last_state_at || b.shopify_created_at || 0).getTime();
      return tb - ta;
    });
    return res;
  }, [orders, bucketFilter, search, showOnlyTracked]);

  const handleLinkTracking = async (order) => {
    if(!canEdit){ showToast("⛔ مفيش صلاحية"); return; }
    const tn = await askInput("🔗 ربط Tracking Number", {
      defaultValue: order.bosta?.tracking_number || "",
      label: "ادخل رقم الـ tracking من Bosta dashboard للطلب ده",
      placeholder: "مثلاً: 12345678",
      confirmText: "ربط",
    });
    if(tn === null) return;
    if(!tn.trim()){ showToast("⚠️ ادخل رقم صالح"); return; }
    setBusyId(order.shopify_order_id);
    try {
      const r = await bostaTrack({ orderId: order.shopify_order_id, trackingNumber: tn.trim() }, user);
      if(r?.ok){ showToast("✅ تم الربط — Bosta هـ يبعت updates webhook لما الحالة تتغيّر"); }
      else { showToast("⛔ " + (r?.error || "فشل")); }
    } catch(e){ showToast("⛔ " + e.message); }
    finally { setBusyId(null); }
  };

  const handleRefresh = async (order) => {
    if(!canEdit) return;
    if(!apiKeySet){ showToast("⚠️ Bosta API key مش معدّ — روح Settings tab"); return; }
    if(!order.bosta?.tracking_number){
      showToast("⚠️ مفيش tracking — اربطه أولاً");
      return;
    }
    setBusyId(order.shopify_order_id);
    try {
      const r = await bostaTrack({ orderId: order.shopify_order_id, refresh: true }, user);
      if(r?.ok){
        showToast(`🔄 ${r.state?.value || ""} (code: ${r.state?.code})`);
      } else {
        showToast("⛔ " + (r?.error || "فشل"));
      }
    } catch(e){ showToast("⛔ " + e.message); }
    finally { setBusyId(null); }
  };

  if(!enabled){
    return (
      <Card title="🚚 Bosta — التكامل مش مفعّل">
        <div style={{ padding: 30, textAlign: "center", color: T.textSec, lineHeight: 1.8 }}>
          <div style={{ fontSize: 40, marginBottom: 10, opacity: 0.6 }}>📦</div>
          <div style={{ fontSize: FS, fontWeight: 700, color: T.text, marginBottom: 6 }}>التكامل مع Bosta مش مفعّل</div>
          <div style={{ fontSize: FS - 1, marginBottom: 14 }}>
            روح <b>تاب الإعدادات → قسم Bosta</b> وفعّل التكامل عشان تتابع شحناتك من هنا.
          </div>
          <div style={{ fontSize: FS - 2, color: T.textMut, maxWidth: 480, margin: "0 auto" }}>
            ℹ️ بعد التفعيل، كل ما حالة شحنة تتغيّر في Bosta، CLARK هـ يستلم webhook فوراً ويحدّث الـ status هنا.
            تقدر كمان تربط tracking يدوياً وتـ refresh من Bosta API.
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Stats banner */}
      <div style={{ display: "grid", gridTemplateColumns: isMob ? "repeat(3, 1fr)" : "repeat(6, 1fr)", gap: 10 }}>
        <MetricCard label="إجمالي الطلبات" value={String(stats.total)} icon="📦" color="#0EA5E9" />
        <MetricCard label="مع tracking" value={String(stats.tracked)} icon="🔗" color="#10B981" />
        <MetricCard label="بدون tracking" value={String(stats.untracked)} icon="⚪" color="#94A3B8" />
        <MetricCard label="🛵 خرج للتوصيل" value={String(stats.byBucket.out_for_del || 0)} color="#0EA5E9" />
        <MetricCard label="✅ تم التوصيل" value={String(stats.byBucket.delivered || 0)} color="#10B981" />
        <MetricCard label="⚠️ مشاكل" value={String((stats.byBucket.delayed || 0) + (stats.byBucket.lost || 0) + (stats.byBucket.damaged || 0))} color="#F59E0B" />
      </div>

      {/* Webhook misses warning */}
      {misses.length > 0 && (
        <div style={{
          padding: "10px 14px",
          borderRadius: 10,
          background: "#FEF3C715",
          border: "1px solid #F59E0B40",
          color: "#92400E",
          fontSize: FS - 1,
        }}>
          ⚠️ <b>{misses.length} webhook</b> من Bosta وصلوا CLARK لكن مفيش طلب يطابقهم.
          <span style={{ marginInlineStart: 6, color: T.textSec, fontSize: FS - 2 }}>
            ممكن يكون الـ tracking number مش مربوط بطلب — افتح آخر مساه تحت لمعرفة التفاصيل.
          </span>
        </div>
      )}

      {/* Toolbar */}
      <Card title="🚚 الشحنات">
        {cfg.bosta_last_webhook_at && (
          <div style={{ fontSize: FS - 2, color: T.textMut, marginBottom: 8 }}>
            آخر webhook من Bosta: {new Date(cfg.bosta_last_webhook_at).toLocaleString("ar-EG")} ({cfg.bosta_last_webhook_status || "—"})
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 2fr", gap: 8, marginBottom: 12 }}>
          <Sel value={bucketFilter} onChange={setBucketFilter}>
            <option value="all">كل الحالات ({stats.total})</option>
            <option value="untracked">⚪ بدون tracking ({stats.untracked})</option>
            {BOSTA_BUCKETS.map(b => (
              <option key={b.key} value={b.key}>
                {b.emoji} {b.label} ({stats.byBucket[b.key] || 0})
              </option>
            ))}
          </Sel>
          <Inp value={search} onChange={setSearch} placeholder="🔍 بحث برقم الـ tracking، الطلب، الاسم، أو التليفون..." />
        </div>

        <div style={{ marginBottom: 8 }}>
          <CheckLine label="عرض الطلبات اللي ليها tracking فقط"
            checked={showOnlyTracked} onChange={setShowOnlyTracked} />
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: T.textMut }}>
            <div style={{ fontSize: 36, marginBottom: 8, opacity: 0.5 }}>📦</div>
            <div>{orders.length === 0 ? "مفيش طلبات Shopify لسه" : "مفيش طلبات تطابق الـ filters"}</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.slice(0, 80).map(o => (
              <ShippingRow
                key={o.shopify_order_id}
                order={o}
                isMob={isMob}
                canEdit={canEdit}
                isExpanded={expandedId === String(o.shopify_order_id)}
                busy={busyId === o.shopify_order_id}
                onToggleExpand={() => setExpandedId(expandedId === String(o.shopify_order_id) ? null : String(o.shopify_order_id))}
                onLink={() => handleLinkTracking(o)}
                onRefresh={() => handleRefresh(o)}
                apiKeySet={apiKeySet}
              />
            ))}
            {filtered.length > 80 && (
              <div style={{ textAlign: "center", padding: 6, color: T.textMut, fontSize: FS - 2 }}>
                + {filtered.length - 80} طلب أخرى
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Webhook misses log */}
      {misses.length > 0 && (
        <Card title={"⚠️ Webhook Misses (" + misses.length + ")"}>
          <div style={{ fontSize: FS - 2, color: T.textSec, marginBottom: 10 }}>
            الـ webhooks دي من Bosta لكن ما لقيناش طلب يطابقها. غالباً السبب إن الـ tracking مش مربوط أو الـ businessReference مش مظبوط.
          </div>
          <div style={{ maxHeight: 360, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {misses.slice(0, 20).map((m, i) => (
              <div key={i} style={{
                padding: "6px 10px",
                background: T.bg,
                borderRadius: 6,
                fontSize: FS - 2,
                fontFamily: "monospace",
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                flexWrap: "wrap",
              }}>
                <span>📦 {m.tracking_number || "—"}</span>
                <span>🧾 {m.business_reference || "—"}</span>
                <span>📞 {m.receiver_phone || "—"}</span>
                <span>{m.state_value} ({m.state_code})</span>
                <span style={{ color: T.textMut }}>{new Date(m.at).toLocaleString("ar-EG")}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function ShippingRow({ order, isMob, canEdit, isExpanded, busy, onToggleExpand, onLink, onRefresh, apiKeySet }){
  const bosta = order.bosta || {};
  const hasTracking = !!bosta.tracking_number;
  const meta = hasTracking ? getBucketMeta(bosta.state_bucket) : { color: "#94A3B8", emoji: "⚪", label: "بدون tracking" };
  const customer = order.customer_info || {};
  const stateLabel = bosta.state_value || meta.label;

  const lastUpdate = bosta.last_state_at ? new Date(bosta.last_state_at) : null;
  const minutesAgo = lastUpdate ? Math.floor((Date.now() - lastUpdate.getTime()) / 60000) : null;
  const ageLabel = minutesAgo == null ? null
                 : minutesAgo < 60 ? `منذ ${minutesAgo} دقيقة`
                 : minutesAgo < 1440 ? `منذ ${Math.floor(minutesAgo / 60)} ساعة`
                 : `منذ ${Math.floor(minutesAgo / 1440)} يوم`;

  return (
    <div style={{
      padding: "10px 14px",
      borderRadius: 10,
      background: T.cardSolid,
      border: "1px solid " + meta.color + "30",
      borderInlineStart: "3px solid " + meta.color,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 800, fontSize: FS, color: T.text }}>
              #{order.shopify_order_number || order.shopify_order_id}
            </span>
            <span style={{
              fontSize: FS - 2, fontWeight: 700, padding: "2px 10px",
              borderRadius: 12, background: meta.color + "20", color: meta.color,
            }}>{meta.emoji} {stateLabel}</span>
            {hasTracking && (
              <span style={{ fontSize: FS - 3, color: T.textMut, fontFamily: "monospace" }}>
                🔗 {bosta.tracking_number}
              </span>
            )}
          </div>
          <div style={{ fontSize: FS - 2, color: T.textSec, marginTop: 4 }}>
            👤 {customer.name || "—"}
            {customer.phone && <span style={{ marginInlineStart: 8 }}>📞 {customer.phone}</span>}
            {ageLabel && <span style={{ marginInlineStart: 8, color: T.textMut }}>· {ageLabel}</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
          {!hasTracking && (
            <Btn small primary onClick={onLink} disabled={!canEdit || busy}>🔗 ربط tracking</Btn>
          )}
          {hasTracking && (
            <>
              <Btn small onClick={onRefresh} disabled={!canEdit || !apiKeySet || busy} title={!apiKeySet ? "API key مش معدّ" : ""}>
                🔄 refresh
              </Btn>
              <Btn small onClick={onLink} disabled={!canEdit || busy}>✏️ تعديل</Btn>
            </>
          )}
          {Array.isArray(bosta.state_history) && bosta.state_history.length > 0 && (
            <Btn small ghost onClick={onToggleExpand}>
              {isExpanded ? "▲" : "▼"} timeline
            </Btn>
          )}
        </div>
      </div>

      {/* Timeline */}
      {isExpanded && Array.isArray(bosta.state_history) && bosta.state_history.length > 0 && (
        <div style={{ marginTop: 12, padding: 12, background: T.bg, borderRadius: 8 }}>
          <div style={{ fontSize: FS - 1, fontWeight: 700, color: T.text, marginBottom: 8 }}>📜 Timeline ({bosta.state_history.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {bosta.state_history.map((h, i) => {
              const m = getBucketMeta(h.bucket);
              return (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: m.color, marginTop: 6, flexShrink: 0 }}/>
                  <div style={{ flex: 1, fontSize: FS - 2 }}>
                    <div style={{ fontWeight: 600, color: T.text }}>
                      {m.emoji} {h.value || m.label}
                      <span style={{ marginInlineStart: 6, color: T.textMut, fontSize: FS - 3 }}>(code {h.code})</span>
                    </div>
                    <div style={{ color: T.textMut, fontSize: FS - 3 }}>
                      {h.at ? new Date(h.at).toLocaleString("ar-EG") : "—"}
                      {h.source && <span style={{ marginInlineStart: 6 }}>· via {h.source}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   V20.2 Phase 11 — CustomersTab (Shopify retail customers)
   ───────────────────────────────────────────────────────────────────────
   Aggregates customers from shopifyPendingOrders (server-side) into a
   customer-centric list with tier (VIP/Regular/New/At-risk/Inactive),
   stats (orders, spent, AOV), and engagement fields (tags, notes,
   accepts_marketing, do_not_contact).

   Designed for WhatsApp marketing campaigns:
   - Filter by tier, delivered-only, accepts-marketing, etc.
   - Bulk select → copy phones / open WhatsApp / set tags
   - Per-customer 📱 WhatsApp button with pre-filled message
   - DO NOT mix with wholesale customers (data.customers) — different array.
   ═══════════════════════════════════════════════════════════════════════ */
function CustomersTab({ data, canEdit, user, isMob }){
  const cfg = data?.shopifyConfig || {};
  const customers = useMemo(() => Array.isArray(data?.shopifyCustomers) ? data.shopifyCustomers : [], [data]);

  /* Filter state */
  const [tierFilter, setTierFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showDeliveredOnly, setShowDeliveredOnly] = useState(true);
  const [showMarketingOnly, setShowMarketingOnly] = useState(false);
  const [showHasPhone, setShowHasPhone] = useState(true);

  /* Selection state */
  const [selected, setSelected] = useState(() => new Set());
  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if(next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());
  const [busy, setBusy] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  /* Stats */
  const stats = useMemo(() => {
    const s = { total: 0, with_delivered: 0, with_phone: 0, vip: 0, regular: 0, new_: 0, at_risk: 0, inactive: 0, shopify_only: 0, total_revenue: 0 };
    customers.forEach(c => {
      s.total++;
      if(c.delivered_count > 0) s.with_delivered++;
      if(c.phone) s.with_phone++;
      if(c.tier === "vip") s.vip++;
      else if(c.tier === "regular") s.regular++;
      else if(c.tier === "new") s.new_++;
      else if(c.tier === "at_risk") s.at_risk++;
      else if(c.tier === "inactive") s.inactive++;
      else if(c.tier === "shopify_only") s.shopify_only++;
      s.total_revenue += Number(c.total_revenue) || 0;
    });
    return s;
  }, [customers]);

  /* Filtered list */
  const filtered = useMemo(() => {
    let res = customers;
    if(tierFilter !== "all") res = res.filter(c => c.tier === tierFilter);
    if(showDeliveredOnly) res = res.filter(c => c.delivered_count > 0);
    if(showMarketingOnly) res = res.filter(c => c.accepts_marketing !== false && !c.do_not_contact);
    if(showHasPhone) res = res.filter(c => !!c.phone);
    const q = search.trim().toLowerCase();
    if(q){
      res = res.filter(c =>
        String(c.name || "").toLowerCase().includes(q) ||
        String(c.phone || "").toLowerCase().includes(q) ||
        String(c.phone_raw || "").toLowerCase().includes(q) ||
        String(c.email || "").toLowerCase().includes(q) ||
        (Array.isArray(c.tags) && c.tags.some(t => String(t).toLowerCase().includes(q)))
      );
    }
    return res;
  }, [customers, tierFilter, search, showDeliveredOnly, showMarketingOnly, showHasPhone]);

  const visibleIds = useMemo(() => filtered.slice(0, 100).map(c => c.id), [filtered]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selected.has(id));
  const selectedCustomers = useMemo(() =>
    customers.filter(c => selected.has(c.id) && !!c.phone && !c.do_not_contact),
    [customers, selected]
  );

  const connected = !!cfg.connected;

  /* Handlers */
  const handleSync = async () => {
    if(!canEdit){ showToast("⛔ مفيش صلاحية"); return; }
    setBusy(true);
    try {
      const r = await shopifySyncCustomers(user);
      if(r?.ok){
        showToast(`✅ ${r.total} عميل · ${r.with_delivered} اشتروا · 👑 ${r.vip} · 🌟 ${r.regular} · 🆕 ${r.new}`);
      } else {
        showToast("⛔ " + (r?.error || "فشل"));
      }
    } catch(e){ showToast("⛔ " + e.message); }
    finally { setBusy(false); }
  };

  const handleSetTags = async (customer) => {
    if(!canEdit) return;
    const current = (customer.tags || []).join(", ");
    const v = await askInput("🏷 Tags للعميل", {
      defaultValue: current,
      label: "اكتب الـ tags بفواصل (مثلاً: VIP, متابعة)",
      placeholder: "tag1, tag2",
      confirmText: "حفظ",
    });
    if(v === null) return;
    const tags = String(v || "").split(",").map(t => t.trim()).filter(Boolean);
    try {
      const r = await shopifyUpdateCustomer({ customerId: customer.id, tags }, user);
      if(r?.ok) showToast("✅ تم");
      else showToast("⛔ " + (r?.error || "فشل"));
    } catch(e){ showToast("⛔ " + e.message); }
  };

  const handleSetNotes = async (customer) => {
    if(!canEdit) return;
    const v = await askInput("📝 ملاحظات على العميل", {
      defaultValue: customer.notes || "",
      placeholder: "ملاحظات (private)",
      confirmText: "حفظ",
    });
    if(v === null) return;
    try {
      const r = await shopifyUpdateCustomer({ customerId: customer.id, notes: v.trim() }, user);
      if(r?.ok) showToast("✅ تم");
      else showToast("⛔ " + (r?.error || "فشل"));
    } catch(e){ showToast("⛔ " + e.message); }
  };

  const handleToggleDoNotContact = async (customer) => {
    if(!canEdit) return;
    try {
      const r = await shopifyUpdateCustomer({ customerId: customer.id, do_not_contact: !customer.do_not_contact }, user);
      if(r?.ok) showToast(customer.do_not_contact ? "✅ بقى يستقبل" : "🚫 عدم الاتصال");
      else showToast("⛔ " + (r?.error || "فشل"));
    } catch(e){ showToast("⛔ " + e.message); }
  };

  const handleWhatsAppSingle = async (customer, customMessage) => {
    if(!customer.phone){ showToast("⚠️ مفيش رقم تليفون"); return; }
    if(customer.do_not_contact){
      const proceed = await ask("⚠️ تأكيد", `العميل ${customer.name} مفعّل عليه "عدم الاتصال". هتكمّل برضه؟`);
      if(!proceed) return;
    }
    const text = customMessage || `أهلاً ${customer.name || ""} 👋`;
    const url = buildWhatsAppLink(customer.phone, text);
    window.open(url, "_blank");
    /* Bump contact count */
    try {
      await shopifyUpdateCustomer({ customerId: customer.id, bumpContact: true }, user);
    } catch(_){}
  };

  /* Bulk WhatsApp message */
  const handleBulkWhatsApp = async () => {
    if(selectedCustomers.length === 0){
      showToast("⚠️ اختار عملاء لهم تليفون أولاً");
      return;
    }
    const message = await askInput("📱 رسالة WhatsApp", {
      label: `هتـ open ${selectedCustomers.length} tab في WhatsApp Web (واحد لكل عميل). الرسالة هـ تكون pre-filled.\n\n✨ تقدر تستخدم {name} عشان يتم استبداله باسم العميل.`,
      placeholder: "أهلاً {name} 👋 معاك CLARK Store...",
      confirmText: "افتح الـ tabs",
    });
    if(message === null) return;
    if(!message.trim()){ showToast("⚠️ ادخل رسالة"); return; }

    const yes = await ask("⚠️ تأكيد", `هـ يتفتح ${selectedCustomers.length} tab في المتصفح. ده ممكن يكون بطئ على الـ device. تأكيد؟`);
    if(!yes) return;

    /* Open in batches with small delays so the browser doesn't block */
    let opened = 0;
    for(let i = 0; i < selectedCustomers.length; i++){
      const c = selectedCustomers[i];
      const text = message.replace(/\{name\}/g, c.name || "");
      const url = buildWhatsAppLink(c.phone, text);
      window.open(url, "_blank");
      opened++;
      if(i < selectedCustomers.length - 1){
        await new Promise(r => setTimeout(r, 400)); /* avoid popup-block */
      }
    }
    showToast("📱 اتفتح " + opened + " tab");

    /* Bulk bump contact count */
    try {
      await shopifyUpdateCustomer({
        bulkCustomerIds: selectedCustomers.map(c => c.id),
        bumpContact: true,
      }, user);
    } catch(_){}
    clearSelection();
  };

  const handleCopyPhones = async () => {
    const phones = selectedCustomers.map(c => c.phone).filter(Boolean);
    if(phones.length === 0){ showToast("⚠️ مفيش أرقام"); return; }
    const text = phones.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      showToast(`📋 تم نسخ ${phones.length} رقم`);
    } catch(_){
      await tell("📋 الأرقام", text);
    }
  };

  const handleBulkTag = async () => {
    if(selected.size === 0){ showToast("⚠️ اختار عملاء"); return; }
    const v = await askInput(`🏷 Tags لـ ${selected.size} عميل`, {
      label: "هتـ replace الـ tags الموجودة. اكتبهم بفواصل.",
      placeholder: "VIP, مستهدف رمضان",
      confirmText: "تطبيق",
    });
    if(v === null) return;
    const tags = String(v || "").split(",").map(t => t.trim()).filter(Boolean);
    try {
      const r = await shopifyUpdateCustomer({
        bulkCustomerIds: Array.from(selected),
        tags,
      }, user);
      if(r?.ok){ showToast("✅ تم تطبيق الـ tags على " + r.updated + " عميل"); clearSelection(); }
      else showToast("⛔ " + (r?.error || "فشل"));
    } catch(e){ showToast("⛔ " + e.message); }
  };

  if(!connected){
    return (
      <Card title="⚠️ مش متصل">
        <div style={{ padding: 24, textAlign: "center", color: T.textSec }}>روح تاب 🔌 الاتصال أولاً.</div>
      </Card>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Stats banner */}
      <div style={{ display: "grid", gridTemplateColumns: isMob ? "repeat(3, 1fr)" : "repeat(7, 1fr)", gap: 10 }}>
        <MetricCard label="إجمالي" value={String(stats.total)} icon="👥" color="#0EA5E9" sub={stats.with_phone + " بـ تليفون"} />
        <MetricCard label="اشتروا" value={String(stats.with_delivered)} icon="✅" color="#10B981" sub={fmt(stats.total_revenue) + " ج"} />
        <MetricCard label="👑 VIP" value={String(stats.vip)} color="#8B5CF6" />
        <MetricCard label="🌟 Regular" value={String(stats.regular)} color="#10B981" />
        <MetricCard label="🆕 جدد" value={String(stats.new_)} color="#0EA5E9" />
        <MetricCard label="⚠️ متابعة" value={String(stats.at_risk)} color="#F59E0B" />
        <MetricCard label="🛍️ Shopify فقط" value={String(stats.shopify_only)} color="#06B6D4" sub="مسجلين بدون شراء" />
      </div>

      {/* Toolbar */}
      <Card title="👥 عملاء Shopify" extra={
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <LoadingBtn primary loading={busy} loadingText="..." onClick={handleSync} disabled={!canEdit} small>
            🔄 تحديث القائمة
          </LoadingBtn>
        </div>
      }>
        {cfg.last_customers_sync_at && (
          <div style={{ fontSize: FS - 2, color: T.textMut, marginBottom: 8 }}>
            آخر تحديث: {new Date(cfg.last_customers_sync_at).toLocaleString("ar-EG")} ({cfg.last_customers_sync_count || 0} عميل)
          </div>
        )}

        <div style={{ padding: "10px 12px", background: "#7C3AED10", border: "1px solid #7C3AED25", borderRadius: 8, fontSize: FS - 2, color: T.text, lineHeight: 1.7, marginBottom: 12 }}>
          ℹ️ <b>قسم منفصل عن عملاء الجملة</b> — العملاء بـ يجوا من مصدرين:<br/>
          1. <b>Shopify Customer DB</b> (كل العملاء المسجلين، حتى لو ما اشتروا) — بـ يـ provide tags + accepts_marketing + total_spent<br/>
          2. <b>الطلبات في CLARK</b> — بـ يـ provide delivered_count و revenue verified و tier دقيق<br/>
          📱 WhatsApp بـ يفتح مباشرة من المتصفح. كل عميل entry واحد بالـ phone (مع normalize).
        </div>

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div style={{
            padding: "10px 14px",
            background: "#7C3AED15",
            border: "1px solid #7C3AED40",
            borderRadius: 10,
            marginBottom: 12,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}>
            <span style={{ fontWeight: 800, color: "#7C3AED", fontSize: FS }}>
              {selected.size} محدد · {selectedCustomers.length} لهم تليفون
            </span>
            <Btn small primary onClick={handleBulkWhatsApp} disabled={selectedCustomers.length === 0}>
              📱 WhatsApp Bulk
            </Btn>
            <Btn small onClick={handleCopyPhones}>
              📋 نسخ الأرقام
            </Btn>
            <Btn small onClick={handleBulkTag}>
              🏷 Tags
            </Btn>
            <Btn small ghost onClick={clearSelection}>
              ✕ Clear
            </Btn>
          </div>
        )}

        {/* Filters */}
        <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 2fr", gap: 8, marginBottom: 8 }}>
          <Sel value={tierFilter} onChange={setTierFilter}>
            <option value="all">كل الـ tiers ({stats.total})</option>
            <option value="vip">👑 VIP ({stats.vip})</option>
            <option value="regular">🌟 Regular ({stats.regular})</option>
            <option value="new">🆕 جدد ({stats.new_})</option>
            <option value="at_risk">⚠️ بحاجة لمتابعة ({stats.at_risk})</option>
            <option value="inactive">😴 غير نشط ({stats.inactive})</option>
            <option value="shopify_only">🛍️ Shopify فقط ({stats.shopify_only})</option>
          </Sel>
          <Inp value={search} onChange={setSearch} placeholder="🔍 بحث بالاسم، التليفون، إيميل، أو tag..." />
        </div>

        <div style={{ display: "flex", gap: 16, marginBottom: 10, flexWrap: "wrap" }}>
          <CheckLine label="اللي اشتروا فقط (delivered ≥ 1)" checked={showDeliveredOnly} onChange={setShowDeliveredOnly} />
          <CheckLine label="يستقبلوا marketing فقط" checked={showMarketingOnly} onChange={setShowMarketingOnly} />
          <CheckLine label="عندهم تليفون" checked={showHasPhone} onChange={setShowHasPhone} />
        </div>

        {/* Select-all + count */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, padding: "0 4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={() => {
                if(allVisibleSelected){
                  setSelected(prev => { const n = new Set(prev); visibleIds.forEach(id => n.delete(id)); return n; });
                } else {
                  setSelected(prev => { const n = new Set(prev); visibleIds.forEach(id => n.add(id)); return n; });
                }
              }}
              style={{ cursor: "pointer", width: 18, height: 18 }}
            />
            <span style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 600 }}>
              تحديد الكل المعروض ({visibleIds.length})
            </span>
          </div>
          <span style={{ fontSize: FS - 2, color: T.textSec }}>
            عرض <b>{Math.min(filtered.length, 100)}</b> من <b>{filtered.length}</b>
          </span>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: T.textMut }}>
            <div style={{ fontSize: 36, marginBottom: 8, opacity: 0.5 }}>👥</div>
            <div>{customers.length === 0 ? "اضغط \"تحديث القائمة\" لأول مرة" : "مفيش عملاء يطابقوا الـ filters"}</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.slice(0, 100).map(c => (
              <CustomerRow
                key={c.id}
                customer={c}
                isMob={isMob}
                canEdit={canEdit}
                isSelected={selected.has(c.id)}
                isExpanded={expandedId === c.id}
                onToggleSelect={() => toggleSelect(c.id)}
                onToggleExpand={() => setExpandedId(expandedId === c.id ? null : c.id)}
                onWhatsApp={() => handleWhatsAppSingle(c)}
                onSetTags={() => handleSetTags(c)}
                onSetNotes={() => handleSetNotes(c)}
                onToggleDoNotContact={() => handleToggleDoNotContact(c)}
              />
            ))}
            {filtered.length > 100 && (
              <div style={{ textAlign: "center", padding: 6, color: T.textMut, fontSize: FS - 2 }}>
                + {filtered.length - 100} عميل آخر — استخدم البحث/الـ filters
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function CustomerRow({ customer, isMob, canEdit, isSelected, isExpanded, onToggleSelect, onToggleExpand, onWhatsApp, onSetTags, onSetNotes, onToggleDoNotContact }){
  const tier = getTierMeta(customer.tier);
  const dnc = !!customer.do_not_contact;
  const hasPhone = !!customer.phone;

  /* Days since last delivery for at-risk indicators */
  const daysSinceLastDelivered = customer.last_delivered_at
    ? Math.floor((Date.now() - new Date(customer.last_delivered_at).getTime()) / 86400000)
    : null;

  return (
    <div style={{
      padding: "10px 12px",
      borderRadius: 10,
      background: isSelected ? tier.color + "12" : T.cardSolid,
      border: "1px solid " + (isSelected ? tier.color + "50" : T.brd),
      borderInlineStart: "3px solid " + tier.color,
      opacity: dnc ? 0.7 : 1,
    }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          style={{ cursor: "pointer", width: 18, height: 18, marginTop: 4, flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 800, fontSize: FS, color: T.text }}>
              {customer.name || "(غير معروف)"}
            </span>
            <span style={{
              fontSize: FS - 3, fontWeight: 700, padding: "2px 8px",
              borderRadius: 8, background: tier.color + "20", color: tier.color,
            }}>{tier.emoji} {tier.label}</span>
            {/* V20.3: source badge */}
            {customer.source === "merged" && (
              <span style={{ fontSize: FS - 4, padding: "1px 6px", borderRadius: 6, background: T.ok + "15", color: T.ok, fontWeight: 600 }} title="Shopify + Orders">
                ✓ verified
              </span>
            )}
            {customer.source === "shopify_only" && (
              <span style={{ fontSize: FS - 4, padding: "1px 6px", borderRadius: 6, background: "#06B6D415", color: "#06B6D4", fontWeight: 600 }} title="من Shopify بس">
                🛍️ Shopify
              </span>
            )}
            {customer.accepts_marketing === false && (
              <span style={{ fontSize: FS - 4, padding: "1px 6px", borderRadius: 6, background: "#94A3B815", color: "#64748B", fontWeight: 600 }} title="مرفوض marketing">
                🔕
              </span>
            )}
            {dnc && (
              <span style={{ fontSize: FS - 3, padding: "2px 8px", borderRadius: 8, background: "#94A3B815", color: "#64748B", fontWeight: 700 }}>
                🚫 لا تتصل
              </span>
            )}
          </div>
          <div style={{ fontSize: FS - 2, color: T.textSec, marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap" }}>
            {hasPhone && (
              <span>
                📞 <a href={"tel:+" + customer.phone} style={{ color: T.accent, textDecoration: "none" }}>+{customer.phone}</a>
              </span>
            )}
            {customer.email && <span>📧 {customer.email}</span>}
            {customer.address?.governorate && <span>📍 {customer.address.governorate}</span>}
          </div>
          <div style={{ fontSize: FS - 2, color: T.textSec, marginTop: 4, display: "flex", gap: 12, flexWrap: "wrap" }}>
            {customer.source === "shopify_only" ? (
              <>
                <span>🛍️ <b>{customer.shopify_orders_count}</b> طلب على Shopify (لسه ما اتـ sync-ت)</span>
                {customer.shopify_total_spent > 0 && <span>💰 <b>{fmt(customer.shopify_total_spent)}</b> ج Shopify total</span>}
              </>
            ) : (
              <>
                <span>🛒 <b>{customer.orders_count}</b> طلب</span>
                <span>✅ <b>{customer.delivered_count}</b> تسلّم</span>
                {customer.refused_count > 0 && <span>❌ <b>{customer.refused_count}</b> رفض</span>}
                <span>💰 <b>{fmt(customer.total_revenue)}</b> ج</span>
                {customer.avg_order_value > 0 && <span style={{ color: T.textMut }}>· AOV {fmt(customer.avg_order_value)}</span>}
              </>
            )}
          </div>
          {customer.tags && customer.tags.length > 0 && (
            <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
              {customer.tags.map((t, i) => (
                <span key={i} style={{ fontSize: FS - 3, padding: "1px 8px", borderRadius: 10, background: "#EDE9FE", color: "#7C3AED", fontWeight: 600 }}>
                  🏷 {t}
                </span>
              ))}
            </div>
          )}
          {daysSinceLastDelivered != null && daysSinceLastDelivered > 60 && customer.delivered_count > 0 && (
            <div style={{ fontSize: FS - 3, color: T.warn, marginTop: 4 }}>
              ⏰ آخر تسليم منذ {daysSinceLastDelivered} يوم
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: isMob ? "row" : "column", gap: 4, flexShrink: 0, flexWrap: "wrap" }}>
          {hasPhone && (
            <Btn small primary onClick={onWhatsApp} title="WhatsApp">
              📱
            </Btn>
          )}
          <Btn small ghost onClick={onToggleExpand} title="تفاصيل">
            {isExpanded ? "▲" : "▼"}
          </Btn>
        </div>
      </div>

      {/* Expanded */}
      {isExpanded && (
        <div style={{
          marginTop: 10,
          padding: 12,
          background: T.bg,
          borderRadius: 8,
          border: "1px solid " + T.brd,
          fontSize: FS - 1,
        }}>
          <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontWeight: 700, color: T.text, marginBottom: 6 }}>📊 الإحصائيات</div>
              <div style={{ color: T.textSec, lineHeight: 1.8, fontSize: FS - 2 }}>
                <div>إجمالي الطلبات: <b>{customer.orders_count}</b></div>
                <div>تم التسليم: <b style={{ color: T.ok }}>{customer.delivered_count}</b></div>
                {customer.refused_count > 0 && <div>تم الرفض: <b style={{ color: T.err }}>{customer.refused_count}</b></div>}
                {customer.cancelled_count > 0 && <div>ملغي: {customer.cancelled_count}</div>}
                {customer.returned_count > 0 && <div>مرتجع: {customer.returned_count}</div>}
                {customer.pending_count > 0 && <div>بانتظار: {customer.pending_count}</div>}
                <div style={{ marginTop: 4 }}>إجمالي الإنفاق: <b>{fmt(customer.total_spent)} ج</b></div>
                <div>إيرادات محققة: <b style={{ color: T.accent }}>{fmt(customer.total_revenue)} ج</b></div>
                <div>متوسط قيمة الطلب: <b>{fmt(customer.avg_order_value)} ج</b></div>
                {customer.first_order_at && <div style={{ marginTop: 4 }}>أول طلب: {new Date(customer.first_order_at).toLocaleDateString("ar-EG")}</div>}
                {customer.last_delivered_at && <div>آخر تسليم: {new Date(customer.last_delivered_at).toLocaleDateString("ar-EG")}</div>}
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 700, color: T.text, marginBottom: 6 }}>📍 العنوان</div>
              <div style={{ color: T.textSec, lineHeight: 1.8, fontSize: FS - 2 }}>
                {customer.address?.line1 && <div>{customer.address.line1}</div>}
                {customer.address?.line2 && <div>{customer.address.line2}</div>}
                {customer.address?.city && <div>{customer.address.city}</div>}
                {customer.address?.governorate && <div>{customer.address.governorate}</div>}
                {!customer.address?.line1 && !customer.address?.city && <div style={{ color: T.textMut }}>(لا يوجد عنوان)</div>}
              </div>

              {customer.favorite_skus && customer.favorite_skus.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontWeight: 700, color: T.text, marginBottom: 6 }}>🔥 أكتر منتج اشتراه</div>
                  {customer.favorite_skus.map((s, i) => (
                    <div key={i} style={{ fontSize: FS - 2, color: T.textSec, fontFamily: "monospace" }}>
                      {i + 1}. {s.sku} ({s.qty}×)
                    </div>
                  ))}
                </div>
              )}

              {customer.contact_count > 0 && (
                <div style={{ marginTop: 8, fontSize: FS - 2, color: T.textSec }}>
                  📱 تم التواصل معاه <b>{customer.contact_count}</b> مرة{customer.last_contacted_at && " · آخرها " + new Date(customer.last_contacted_at).toLocaleDateString("ar-EG")}
                </div>
              )}
            </div>
          </div>

          {customer.notes && (
            <div style={{ marginTop: 12, padding: 10, background: "#FEF9C3", borderRadius: 6, border: "1px solid #EAB30830", fontSize: FS - 1, color: "#1C1917" }}>
              📝 <b>ملاحظات:</b> {customer.notes}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
            {hasPhone && (
              <Btn small primary onClick={onWhatsApp}>
                📱 WhatsApp
              </Btn>
            )}
            <Btn small onClick={onSetTags}>
              🏷 Tags ({(customer.tags || []).length})
            </Btn>
            <Btn small onClick={onSetNotes}>
              📝 ملاحظات
            </Btn>
            <Btn small onClick={onToggleDoNotContact}>
              {dnc ? "🔓 السماح بالتواصل" : "🚫 عدم التواصل"}
            </Btn>
            {hasPhone && (
              <Btn small ghost onClick={() => window.open("tel:+" + customer.phone)}>
                📞 اتصال
              </Btn>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   V21.1 Phase 10b — AbandonedCartsTab
   ───────────────────────────────────────────────────────────────────────
   Pulls Shopify abandoned checkouts (people who started buying but
   didn't complete) and lets the admin send WhatsApp recovery messages
   with the abandoned_checkout_url.
   ═══════════════════════════════════════════════════════════════════════ */
function AbandonedCartsTab({ data, canEdit, user, isMob }){
  const cfg = data?.shopifyConfig || {};
  const carts = useMemo(() => Array.isArray(data?.shopifyAbandonedCarts) ? data.shopifyAbandonedCarts : [], [data]);
  const [filter, setFilter] = useState("active"); /* active | recovered | all */
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [selected, setSelected] = useState(() => new Set());

  const stats = useMemo(() => {
    let total = 0, withPhone = 0, recovered = 0, totalValue = 0, recoveredValue = 0;
    carts.forEach(c => {
      total++;
      if(c.phone) withPhone++;
      if(c.recovered_at){ recovered++; recoveredValue += c.total_price; }
      else totalValue += c.total_price;
    });
    return { total, withPhone, recovered, totalValue, recoveredValue, recoveryRate: total > 0 ? Math.round((recovered/total)*100) : 0 };
  }, [carts]);

  const filtered = useMemo(() => {
    let res = carts;
    if(filter === "active") res = res.filter(c => !c.recovered_at);
    else if(filter === "recovered") res = res.filter(c => c.recovered_at);
    const q = search.trim().toLowerCase();
    if(q) res = res.filter(c =>
      String(c.customer_name || "").toLowerCase().includes(q) ||
      String(c.phone || "").toLowerCase().includes(q) ||
      String(c.email || "").toLowerCase().includes(q) ||
      String(c.token || "").toLowerCase().includes(q)
    );
    return res.slice().sort((a, b) =>
      new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );
  }, [carts, filter, search]);

  const toggleSelect = (id) => setSelected(prev => {
    const n = new Set(prev);
    if(n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const handleSync = async () => {
    if(!canEdit) return;
    setBusy(true);
    try {
      const r = await shopifySyncAbandonedCarts({ hoursBack: 720 }, user);
      if(r?.ok){
        showToast(`✅ ${r.total} سلة مهجورة · ${r.withPhone} لها تليفون · قيمة: ${fmt(r.totalValue)} ج`);
      } else {
        showToast("⛔ " + (r?.error || "فشل"));
      }
    } catch(e){ showToast("⛔ " + e.message); }
    finally { setBusy(false); }
  };

  const handleWhatsApp = async (cart) => {
    if(!cart.phone){ showToast("⚠️ مفيش تليفون"); return; }
    const items = (cart.line_items || []).slice(0, 3).map(li => `• ${li.quantity}× ${li.title}`).join("\n");
    const message = `أهلاً ${cart.customer_name || ""} 👋

شفنا إنك بدأت شراء من CLARK Store بس ما خلّصت ✋

العربة بتاعتك:
${items}
${cart.line_items.length > 3 ? `(و ${cart.line_items.length - 3} منتج تاني)` : ""}

إجمالي: ${fmt(cart.total_price)} ج

كمل الطلب من هنا 👇
${cart.abandoned_checkout_url}

🎁 خصم خاص للعميل الراجع: استخدم كوبون BACK10 للحصول على خصم 10%`;

    const url = "https://wa.me/" + cart.phone.replace(/[^0-9]/g, "") + "?text=" + encodeURIComponent(message);
    window.open(url, "_blank");
    try {
      await shopifyUpdateCartRecovery({ cartId: cart.id, bumpContact: true }, user);
    } catch(_){}
  };

  const handleMarkRecovered = async (cart) => {
    if(!canEdit) return;
    const yes = await ask("✅ تأكيد الاسترداد",
      `هل العميل ${cart.customer_name || cart.phone} كمل الطلب فعلاً؟\n\nده هـ يـ flag الـ cart كـ recovered للـ tracking.`);
    if(!yes) return;
    setBusyId(cart.id);
    try {
      await shopifyUpdateCartRecovery({ cartId: cart.id, recovered: true }, user);
      showToast("✅ تم");
    } catch(e){ showToast("⛔ " + e.message); }
    finally { setBusyId(null); }
  };

  const handleBulkWhatsApp = async () => {
    const selectedCarts = carts.filter(c => selected.has(c.id) && c.phone && !c.do_not_contact && !c.recovered_at);
    if(selectedCarts.length === 0){ showToast("⚠️ مفيش سلال active لها تليفون في الاختيار"); return; }
    const yes = await ask("📱 WhatsApp Bulk",
      `هـ يفتح ${selectedCarts.length} tab في WhatsApp Web. كل tab بـ يحتوي رسالة استرداد مخصصة بـ link الـ checkout بتاعها.\n\nتأكيد؟`);
    if(!yes) return;
    for(let i = 0; i < selectedCarts.length; i++){
      handleWhatsApp(selectedCarts[i]);
      if(i < selectedCarts.length - 1) await new Promise(r => setTimeout(r, 500));
    }
    setSelected(new Set());
  };

  if(!cfg.connected){
    return <Card title="⚠️ مش متصل"><div style={{ padding: 24, textAlign: "center", color: T.textSec }}>روح تاب 🔌 الاتصال أولاً.</div></Card>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr 1fr" : "repeat(5, 1fr)", gap: 10 }}>
        <MetricCard label="إجمالي" value={String(stats.total)} icon="🛍️" color="#DB2777" />
        <MetricCard label="active" value={String(stats.total - stats.recovered)} icon="⏳" color="#F59E0B" sub={fmt(stats.totalValue) + " ج"} />
        <MetricCard label="recovered" value={String(stats.recovered)} icon="✅" color="#10B981" sub={fmt(stats.recoveredValue) + " ج"} />
        <MetricCard label="recovery rate" value={stats.recoveryRate + "%"} icon="📈" color="#8B5CF6" />
        <MetricCard label="بـ تليفون" value={String(stats.withPhone)} icon="📞" color="#0EA5E9" />
      </div>

      <Card title="🛍️ السلال المهجورة" extra={
        <LoadingBtn primary loading={busy} loadingText="..." onClick={handleSync} disabled={!canEdit} small>
          🔄 تحديث
        </LoadingBtn>
      }>
        {cfg.last_abandoned_carts_sync_at && (
          <div style={{ fontSize: FS - 2, color: T.textMut, marginBottom: 8 }}>
            آخر تحديث: {new Date(cfg.last_abandoned_carts_sync_at).toLocaleString("ar-EG")}
          </div>
        )}

        <div style={{ padding: "10px 12px", background: "#DB277710", border: "1px solid #DB277725", borderRadius: 8, fontSize: FS - 2, lineHeight: 1.7, marginBottom: 12, color: T.text }}>
          ℹ️ <b>السلال المهجورة</b> = عملاء بدأوا الـ checkout لكن ما خلّصوش الدفع. WhatsApp recovery campaign بـ يقدر يـ recover ~25-35% منهم. الرسالة بتـ generate تلقائياً مع link الـ checkout الخاص بالعميل + اقتراح كوبون خصم.
        </div>

        {selected.size > 0 && (
          <div style={{ padding: "10px 14px", background: "#DB277715", border: "1px solid #DB277740", borderRadius: 10, marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontWeight: 800, color: "#DB2777" }}>{selected.size} محدد</span>
            <Btn small primary onClick={handleBulkWhatsApp}>📱 WhatsApp Recovery Bulk</Btn>
            <Btn small ghost onClick={() => setSelected(new Set())}>✕</Btn>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 2fr", gap: 8, marginBottom: 12 }}>
          <Sel value={filter} onChange={setFilter}>
            <option value="active">⏳ Active فقط</option>
            <option value="recovered">✅ Recovered فقط</option>
            <option value="all">الكل</option>
          </Sel>
          <Inp value={search} onChange={setSearch} placeholder="🔍 بحث..." />
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: T.textMut }}>
            <div style={{ fontSize: 36, marginBottom: 8, opacity: 0.5 }}>🛍️</div>
            <div>{carts.length === 0 ? "اضغط 'تحديث' للـ sync" : "مفيش سلال تطابق الفلتر"}</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.slice(0, 50).map(cart => (
              <div key={cart.id} style={{
                padding: 12,
                borderRadius: 10,
                background: cart.recovered_at ? "#10B98108" : T.cardSolid,
                border: "1px solid " + (cart.recovered_at ? "#10B98140" : T.brd),
                borderInlineStart: "3px solid " + (cart.recovered_at ? "#10B981" : "#DB2777"),
              }}>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <input type="checkbox" checked={selected.has(cart.id)} onChange={() => toggleSelect(cart.id)} disabled={!!cart.recovered_at} style={{ marginTop: 4, width: 18, height: 18 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, fontSize: FS, color: T.text }}>{cart.customer_name || "(غير معروف)"}</span>
                      {cart.recovered_at && <span style={{ fontSize: FS - 3, padding: "1px 8px", borderRadius: 6, background: "#10B98115", color: "#10B981", fontWeight: 700 }}>✅ recovered</span>}
                      {cart.contact_count > 0 && <span style={{ fontSize: FS - 3, color: T.textMut }}>📱 {cart.contact_count}×</span>}
                    </div>
                    <div style={{ fontSize: FS - 2, color: T.textSec, marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {cart.phone && <span>📞 {cart.phone}</span>}
                      {cart.email && <span>📧 {cart.email}</span>}
                      <span style={{ color: T.textMut }}>📅 {cart.created_at && new Date(cart.created_at).toLocaleDateString("ar-EG")}</span>
                    </div>
                    <div style={{ fontSize: FS - 2, color: T.textSec, marginTop: 4 }}>
                      🛒 {cart.items_count} منتج · 💰 <b style={{ color: T.accent }}>{fmt(cart.total_price)} ج</b>
                      {(cart.line_items || []).slice(0, 2).map((li, i) => (
                        <span key={i} style={{ marginInlineStart: 8, padding: "1px 6px", borderRadius: 4, background: T.bg, fontSize: FS - 3 }}>
                          {li.quantity}× {String(li.title).slice(0, 30)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: isMob ? "row" : "column", gap: 4, flexShrink: 0, flexWrap: "wrap" }}>
                    {!cart.recovered_at && cart.phone && (
                      <Btn small primary onClick={() => handleWhatsApp(cart)} disabled={!canEdit}>📱 Recovery</Btn>
                    )}
                    {cart.abandoned_checkout_url && (
                      <Btn small onClick={() => window.open(cart.abandoned_checkout_url, "_blank")}>↗ Link</Btn>
                    )}
                    {!cart.recovered_at && (
                      <Btn small ghost onClick={() => handleMarkRecovered(cart)} disabled={!canEdit || busyId === cart.id}>✅ Recovered</Btn>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {filtered.length > 50 && <div style={{ textAlign: "center", padding: 6, color: T.textMut, fontSize: FS - 2 }}>+ {filtered.length - 50} سلة أخرى</div>}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   V21.2 Phase 10c — DiscountCodesTab
   ═══════════════════════════════════════════════════════════════════════ */
function DiscountCodesTab({ data, canEdit, user, isMob }){
  const cfg = data?.shopifyConfig || {};
  const codes = useMemo(() => Array.isArray(data?.shopifyDiscountCodes) ? data.shopifyDiscountCodes : [], [data]);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newType, setNewType] = useState("percentage");
  const [newValue, setNewValue] = useState("10");
  const [newUsageLimit, setNewUsageLimit] = useState("");
  const [newEndsAt, setNewEndsAt] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if(!q) return codes;
    return codes.filter(c =>
      String(c.code || "").toLowerCase().includes(q) ||
      String(c.title || "").toLowerCase().includes(q)
    );
  }, [codes, search]);

  const handleSync = async () => {
    if(!canEdit) return;
    setBusy(true);
    try {
      const r = await shopifyDiscountCodes({ action: "sync" }, user);
      if(r?.ok){ showToast(`✅ ${r.count} كوبون`); }
      else { showToast("⛔ " + (r?.error || "فشل")); }
    } catch(e){ showToast("⛔ " + e.message); }
    finally { setBusy(false); }
  };

  const handleCreate = async () => {
    if(!canEdit) return;
    if(!newCode.trim()){ showToast("⚠️ ادخل code"); return; }
    const value = Number(newValue);
    if(!Number.isFinite(value) || value <= 0){ showToast("⚠️ القيمة لازم > 0"); return; }
    if(newType === "percentage" && value > 100){ showToast("⚠️ النسبة لازم ≤ 100"); return; }
    setBusy(true);
    try {
      const r = await shopifyDiscountCodes({
        action: "create",
        code: newCode.trim().toUpperCase(),
        type: newType,
        value,
        usage_limit: newUsageLimit.trim() ? Number(newUsageLimit) : null,
        ends_at: newEndsAt ? new Date(newEndsAt).toISOString() : null,
      }, user);
      if(r?.ok){
        showToast("✅ تم إنشاء " + r.code);
        setShowCreate(false);
        setNewCode(""); setNewValue("10"); setNewUsageLimit(""); setNewEndsAt("");
        await shopifyDiscountCodes({ action: "sync" }, user);
      } else {
        showToast("⛔ " + (r?.error || "فشل"));
      }
    } catch(e){ showToast("⛔ " + e.message); }
    finally { setBusy(false); }
  };

  const handleDelete = async (c) => {
    if(!canEdit) return;
    const yes = await ask("🗑 حذف الكوبون", `هتحذف "${c.code}" نهائياً من Shopify (مش هـ يقدر حد يستخدمه). تأكيد؟`);
    if(!yes) return;
    setBusy(true);
    try {
      const r = await shopifyDiscountCodes({ action: "delete", priceRuleId: c.price_rule_id }, user);
      if(r?.ok){ showToast("🗑 اتحذف"); }
      else { showToast("⛔ " + (r?.error || "فشل")); }
    } catch(e){ showToast("⛔ " + e.message); }
    finally { setBusy(false); }
  };

  const handleCopy = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      showToast("📋 تم النسخ: " + code);
    } catch(_){ showToast("⚠️ فشل النسخ"); }
  };

  if(!cfg.connected){
    return <Card title="⚠️ مش متصل"><div style={{ padding: 24, textAlign: "center", color: T.textSec }}>روح تاب 🔌 الاتصال أولاً.</div></Card>;
  }

  const labelStyle = { display: "block", fontSize: FS - 1, color: T.textSec, fontWeight: 700, marginBottom: 6 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10 }}>
        <MetricCard label="الكوبونات" value={String(codes.length)} icon="🎟" color="#F97316" />
        <MetricCard label="استخدامات" value={String(codes.reduce((s,c)=>s+(c.usage_count||0),0))} icon="📊" color="#0EA5E9" />
        <MetricCard label="نسبة %" value={String(codes.filter(c=>c.value_type==="percentage").length)} icon="%" color="#8B5CF6" />
        <MetricCard label="مبلغ ثابت" value={String(codes.filter(c=>c.value_type==="fixed_amount").length)} icon="💰" color="#10B981" />
      </div>

      <Card title="🎟 إدارة الكوبونات" extra={
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Btn small primary onClick={()=>setShowCreate(s=>!s)} disabled={!canEdit}>{showCreate ? "✕ إلغاء" : "➕ كوبون جديد"}</Btn>
          <LoadingBtn loading={busy} loadingText="..." onClick={handleSync} disabled={!canEdit} small>🔄 تحديث</LoadingBtn>
        </div>
      }>
        {showCreate && (
          <div style={{ padding: 14, background: T.bg, borderRadius: 10, marginBottom: 12, border: "1px solid " + T.brd }}>
            <div style={{ fontWeight: 800, fontSize: FS, marginBottom: 10, color: T.text }}>🎟 إنشاء كوبون جديد</div>
            <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <label style={labelStyle}>الـ Code</label>
                <Inp value={newCode} onChange={v=>setNewCode(v.toUpperCase())} placeholder="VIP25" />
              </div>
              <div>
                <label style={labelStyle}>النوع</label>
                <Sel value={newType} onChange={setNewType}>
                  <option value="percentage">% خصم</option>
                  <option value="fixed_amount">مبلغ ثابت ج</option>
                </Sel>
              </div>
              <div>
                <label style={labelStyle}>القيمة</label>
                <Inp value={newValue} onChange={setNewValue} type="number" placeholder={newType==="percentage"?"10":"50"} />
              </div>
              <div>
                <label style={labelStyle}>حد الاستخدام</label>
                <Inp value={newUsageLimit} onChange={setNewUsageLimit} type="number" placeholder="بدون حد" />
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>تاريخ انتهاء (اختياري)</label>
              <input type="date" value={newEndsAt} onChange={e=>setNewEndsAt(e.target.value)}
                style={{ padding: 8, borderRadius: 6, border: "1px solid " + T.brd, background: T.cardSolid, color: T.text, fontFamily: "inherit" }} />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <LoadingBtn primary loading={busy} loadingText="..." onClick={handleCreate} disabled={!canEdit} small>
                ✅ إنشاء في Shopify
              </LoadingBtn>
              <Btn small onClick={()=>setShowCreate(false)}>إلغاء</Btn>
            </div>
          </div>
        )}

        <Inp value={search} onChange={setSearch} placeholder="🔍 بحث بالـ code..." />

        {filtered.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: T.textMut, marginTop: 14 }}>
            <div style={{ fontSize: 36, marginBottom: 8, opacity: 0.5 }}>🎟</div>
            <div>{codes.length === 0 ? "اضغط 'تحديث' للـ sync أو 'كوبون جديد' للإنشاء" : "مفيش كوبون يطابق البحث"}</div>
          </div>
        ) : (
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map(c => {
              const expired = c.ends_at && new Date(c.ends_at).getTime() < Date.now();
              const exhausted = c.usage_limit && c.usage_count >= c.usage_limit;
              return (
                <div key={c.discount_code_id} style={{
                  padding: 12,
                  borderRadius: 10,
                  background: expired || exhausted ? T.bg : T.cardSolid,
                  border: "1px solid " + (expired || exhausted ? T.warn + "40" : T.brd),
                  borderInlineStart: "3px solid " + (expired || exhausted ? T.warn : "#F97316"),
                  display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap",
                }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <code style={{ fontFamily: "monospace", fontWeight: 800, fontSize: FS + 2, color: "#F97316", padding: "2px 10px", background: "#F9731615", borderRadius: 6, letterSpacing: 1 }}>{c.code}</code>
                      <span style={{ fontWeight: 700, color: T.text }}>
                        {c.value_type === "percentage" ? c.value + "%" : fmt(c.value) + " ج"}
                      </span>
                      {expired && <span style={{ fontSize: FS - 3, padding: "1px 8px", borderRadius: 6, background: T.warn + "20", color: T.warn, fontWeight: 700 }}>⏰ منتهي</span>}
                      {exhausted && <span style={{ fontSize: FS - 3, padding: "1px 8px", borderRadius: 6, background: T.warn + "20", color: T.warn, fontWeight: 700 }}>📊 متشغّل</span>}
                    </div>
                    <div style={{ fontSize: FS - 2, color: T.textSec, marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <span>📊 استخدام: {c.usage_count || 0}{c.usage_limit ? " / " + c.usage_limit : ""}</span>
                      {c.ends_at && <span>⏰ ينتهي: {new Date(c.ends_at).toLocaleDateString("ar-EG")}</span>}
                      {c.once_per_customer && <span>👤 مرة واحدة لكل عميل</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <Btn small onClick={()=>handleCopy(c.code)}>📋</Btn>
                    <Btn small danger onClick={()=>handleDelete(c)} disabled={!canEdit}>🗑</Btn>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
