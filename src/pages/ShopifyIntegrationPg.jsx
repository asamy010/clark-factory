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
import { ask, tell, showToast } from "../utils/popups.js";
import { shopifyConnect, shopifyStatus, shopifyDisconnect } from "../utils/shopify/shopifyClient.js";

const SUB_TABS = [
  { key: "dashboard",      label: "📊 لوحة التحكم",   color: "#0EA5E9" },
  { key: "connection",     label: "🔌 الاتصال",       color: "#10B981" },
  { key: "products",       label: "📦 المنتجات",      color: "#F59E0B" },
  { key: "orders",         label: "🛒 الطلبات",       color: "#8B5CF6" },
  { key: "invoices",       label: "🧾 الفواتير",      color: "#06B6D4" },
  { key: "reconciliation", label: "🔄 المطابقة",       color: "#EC4899" },
  { key: "settings",       label: "⚙️ الإعدادات",     color: "#64748B" },
];

const SHOPIFY_GREEN = "#96BF48";

export function ShopifyIntegrationPg({ data, upConfig, isMob, canEdit, user }){
  const [activeTab, setActiveTab] = useState("connection");

  /* Read live shopifyConfig from factory/config (server is source of truth
     for credentials — UI mirrors via the live data prop, but the token is
     never returned from the API for safety). */
  const shopifyConfig = data?.shopifyConfig || {};

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
        {activeTab === "dashboard"      && <PlaceholderTab title="لوحة التحكم" phase="Phase 5" desc="إحصائيات اليوم/الشهر، إيرادات محققة، مخزون محجوز، تنبيهات SKU mismatch، أكثر المنتجات مبيعاً." shopifyConfig={shopifyConfig} />}
        {activeTab === "products"       && <PlaceholderTab title="المنتجات والمخزون" phase="Phase 4" desc="مزامنة المنتجات مع Shopify، إعدادات الـ safety buffer لكل منتج، معالجة SKU mismatches، Push المخزون." shopifyConfig={shopifyConfig} />}
        {activeTab === "orders"         && <PlaceholderTab title="الطلبات" phase="Phase 1" desc="عرض كل الطلبات (Pending/Delivered/Refused)، Mark Delivered/Refused يدوياً، إنشاء الفاتورة، Process Return." shopifyConfig={shopifyConfig} />}
        {activeTab === "invoices"       && <PlaceholderTab title="فواتير Shopify" phase="Phase 3" desc="فواتير المبيعات الـ posted من طلبات Shopify (الـ delivered فقط). تقارير، طباعة، export Excel." shopifyConfig={shopifyConfig} />}
        {activeTab === "reconciliation" && <PlaceholderTab title="المطابقة اليومية" phase="Phase 5" desc="Stale pending orders >7 أيام، Daily reconciliation report، Cash matching مع MAIN_CASH، WhatsApp daily summary." shopifyConfig={shopifyConfig} />}
        {activeTab === "settings"       && <SettingsTab data={data} upConfig={upConfig} canEdit={canEdit} isMob={isMob} />}
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
    if(!/^(shpat_|shppa_)/i.test(t)){
      await tell("⚠️ صيغة الـ Access Token غير معروفة.\n\nالتوكين الصح لازم يبدأ بـ shpat_ (Admin API) أو shppa_ (Partners). شيك إنك ناسخ الـ token الصح من Shopify.");
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

      {/* Setup instructions */}
      {!connected && (
        <Card title="🔐 خطوات الإعداد في Shopify Admin">
          <div style={{ fontSize: FS - 1, lineHeight: 1.9, color: T.textSec }}>
            <div style={{ marginBottom: 8 }}>1. روح Shopify Admin → <b>Settings → Apps and sales channels → Develop apps</b></div>
            <div style={{ marginBottom: 8 }}>2. اعمل <b>Create an app</b> باسم "CLARK Integration"</div>
            <div style={{ marginBottom: 8 }}>3. <b>Configure Admin API scopes</b> ووشّر الـ scopes دي:</div>
            <div style={{ background: T.bg, padding: 12, borderRadius: 8, marginBottom: 8, fontFamily: "monospace", fontSize: FS - 2 }}>
              read_orders, read_all_orders, read_products, write_products,<br/>
              read_inventory, write_inventory, read_locations,<br/>
              read_fulfillments, read_customers
            </div>
            <div style={{ marginBottom: 8 }}>4. روح <b>API credentials tab</b> ثم اضغط <b>Install app</b> فوق الصفحة</div>
            <div style={{ marginBottom: 8 }}>5. هـ يظهر قسم <b>Admin API access token</b> — اضغط <b>Reveal token once</b></div>
            <div style={{ marginBottom: 4 }}>6. ⚠️ التوكين هيظهر <b>مرة واحدة بس</b> — انسخه فوراً والصقه هنا تحت.</div>
            <div style={{
              marginTop: 12,
              padding: "10px 12px",
              borderRadius: 8,
              background: "#FEF3C7",
              border: "1px solid #F59E0B40",
              color: "#92400E",
              fontSize: FS - 2,
              fontWeight: 600,
              lineHeight: 1.7,
            }}>
              ⚠️ <b>تنبيه مهم — متخلطش:</b><br/>
              • الـ <b>Client Secret</b> (بيبدأ بـ <code>shpss_</code>) <b>مش</b> Access Token. ده للـ OAuth handshake بس ومش هيشتغل هنا.<br/>
              • اللي محتاجه = الـ <b>Admin API Access Token</b> اللي بيبدأ بـ <code>shpat_</code> (بيظهر بعد Install app أو Create token).
            </div>
          </div>
        </Card>
      )}

      {/* Credentials form */}
      <Card title={connected ? "🔌 بيانات الاتصال (متصل)" : "🔌 بيانات الاتصال"}>
        <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Store URL</label>
            <Inp
              value={storeUrl}
              onChange={setStoreUrl}
              placeholder="clarkfashion.myshopify.com"
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

        <div style={{ marginTop: 12 }}>
          <label style={labelStyle}>
            Admin API Access Token
            {connected && <span style={{ marginInlineStart: 8, fontSize: FS - 2, color: T.ok, fontWeight: 600 }}>(محفوظ — مش لازم تدخله تاني إلا لو هتغيّره)</span>}
          </label>
          <Inp
            value={token}
            onChange={setToken}
            placeholder={connected ? "اسيبه فاضي للحفاظ على التوكين الحالي، أو ادخل توكين جديد للتحديث" : "shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}
            type="password"
          />
          <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 4 }}>
            ⚠️ التوكين بـ يتخزن server-side فقط ومش بيظهر في الـ UI تاني. لو نسيته، ولّد توكين جديد من Shopify Admin.
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          {!connected ? (
            <>
              <LoadingBtn primary loading={busy} loadingText="جاري الاختبار..." onClick={handleTestOnly} disabled={!canEdit}>
                🔍 اختبار + حفظ الاتصال
              </LoadingBtn>
            </>
          ) : (
            <>
              <LoadingBtn primary loading={busy} loadingText="جاري التحديث..." onClick={handleConnect} disabled={!canEdit || !token.trim()}>
                💾 تحديث التوكين
              </LoadingBtn>
              <LoadingBtn loading={pingBusy} loadingText="جاري التحقق..." onClick={handleRefreshPing}>
                🔄 اختبار الاتصال
              </LoadingBtn>
              <LoadingBtn danger loading={busy} loadingText="..." onClick={handleDisconnect} disabled={!canEdit}>
                🔌 قطع الاتصال
              </LoadingBtn>
            </>
          )}
        </div>

        {pingError && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: T.err + "10", border: "1px solid " + T.err + "30", color: T.err, fontSize: FS - 1, fontWeight: 600 }}>
            ⚠️ {pingError}
          </div>
        )}
      </Card>

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
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ color: T.ok, fontWeight: 800 }}>✅ Phase 0 — الأساس</span>
            <span style={{ color: T.textMut }}>(الحالي)</span>
          </div>
          <div style={{ marginInlineStart: 24, marginBottom: 10, fontSize: FS - 2 }}>
            • Tab Shopify + 7 sub-tabs scaffolded<br/>
            • Connection (اتصال + اختبار + قطع)<br/>
            • Schema migration (4 حسابات + عميل افتراضي + إعدادات)<br/>
            • API endpoints محمية بـ admin auth
          </div>
          <PhasePending num="1" title="Read & Display" desc="مزامنة الطلبات + عرض Pending" />
          <PhasePending num="2" title="Stock Reservation" desc="حجز المخزون عند الطلب، تحرير عند الرفض" />
          <PhasePending num="3" title="Invoice Generation" desc="فاتورة تلقائية عند الـ fulfillment + قيد محاسبي" />
          <PhasePending num="4" title="Inventory Push" desc="Push المخزون إلى Shopify كل 5 دقايق" />
          <PhasePending num="5" title="Reconciliation & Returns" desc="المطابقة اليومية، مرتجعات، تقرير WhatsApp" />
          <PhasePending num="6" title="Polish & Launch" desc="50+ test scenarios، توثيق، soft launch" />
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
function SettingsTab({ data, upConfig, canEdit, isMob }){
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
