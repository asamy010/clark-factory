/* ═══════════════════════════════════════════════════════════════════════
   CLARK · SalesHubPg (V21.11.1 — توحيد المبيعات، تابات مسطّحة)
   ───────────────────────────────────────────────────────────────────────
   تايل «مبيعات» واحد بتابات مسطّحة (بدون toggle جديد/حالي):
     📊 نظرة عامة · 📋 عروض الأسعار · 📑 أوامر البيع · 📤 فواتير البيع ·
     ↩️ مرتجعات-إشعارات دائنة · ⚡ إجراءات سريعة · 📦 سجل التسليمات ·
     ↩️ سجل المرتجعات · 📋 جرد المبيعات · ⚠️ موديلات راكدة

   التابات اللي مصدرها CustDeliverPg (نظرة عامة/إجراءات سريعة/السجلات/الجرد/
   الراكدة) بتتعرض عبر prop `hubView` على نفس المكوّن (من غير إعادة كتابته) —
   كل قسم في chunk منفصل lazy. الصلاحيات: المستندات بـ canViewTab بتاعها،
   وأقسام التسليمات بـ canViewTab("custDeliver"). عرض كامل للشاشة.
   ═══════════════════════════════════════════════════════════════════════ */

import { lazy, Suspense, useState, useEffect, useMemo } from "react";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { fmt } from "../utils/format.js";
import { invoiceBalance } from "../utils/sales/invoicePayments.js";
import { displayStatus } from "../utils/sales/quotations.js";

const CustDeliverPg   = lazy(() => import("./CustDeliverPg.jsx").then(m => ({ default: m.CustDeliverPg })));
const QuotationsPg     = lazy(() => import("./sales/QuotationsPg.jsx").then(m => ({ default: m.QuotationsPg })));
const SalesOrdersPg    = lazy(() => import("./sales/SalesOrdersPg.jsx").then(m => ({ default: m.SalesOrdersPg })));
const SalesInvoicesPg  = lazy(() => import("./SalesInvoicesPg.jsx").then(m => ({ default: m.SalesInvoicesPg })));
const CreditNotesPg    = lazy(() => import("./CreditNotesPg.jsx").then(m => ({ default: m.CreditNotesPg })));

/* map: مفتاح الـ tab الخارجي → id التاب جوّه الهَب */
function mapTabToId(tab){
  switch(tab){
    case "custDeliver":     return "quickActions";
    case "salesQuotations": return "quotations";
    case "salesOrders":     return "orders";
    case "salesInvoices":   return "invoices";
    case "creditNotes":     return "returns";
    case "sales":
    default:                return "overview";
  }
}

const Loading = () => (
  <div style={{ padding: 60, textAlign: "center", color: T.textMut }}>
    <div style={{ fontSize: 28, marginBottom: 8, opacity: .6 }}>⏳</div>
    <div style={{ fontSize: FS, fontWeight: 600 }}>جاري التحميل...</div>
  </div>
);

export function SalesHubPg(props){
  const { tab, data, canViewTab, canEditTab, isMob } = props;

  const canDoc = (k) => canViewTab(k);
  const canOps = canViewTab("custDeliver"); // أقسام التسليمات/الجرد/الراكدة

  /* قائمة التابات (مفلترة بالصلاحيات) — بالترتيب اللي طلبه Ahmed */
  const tabs = useMemo(() => [
    { id: "overview",    label: "📊 نظرة عامة",            show: true },
    { id: "quotations",  label: "📋 عروض الأسعار",         show: canDoc("salesQuotations"), cnt: (data.salesQuotations || []).length },
    { id: "orders",      label: "📑 أوامر البيع",          show: canDoc("salesOrders"),     cnt: (data.salesOrders || []).length },
    { id: "invoices",    label: "📤 فواتير البيع",         show: canDoc("salesInvoices"),   cnt: (data.salesInvoices || []).length },
    { id: "returns",     label: "↩️ مرتجعات - إشعارات دائنة", show: canDoc("creditNotes"),  cnt: (data.salesCreditNotes || []).length },
    { id: "quickActions",label: "⚡ إجراءات سريعة",         show: canOps },
    { id: "deliveryLog", label: "📦 سجل التسليمات",         show: canOps },
    { id: "returnsLog",  label: "↩️ سجل المرتجعات",         show: canOps },
    { id: "audits",      label: "📋 جرد المبيعات",          show: canOps },
    { id: "stale",       label: "⚠️ موديلات راكدة",         show: canOps },
  ].filter(t => t.show), [data.salesQuotations, data.salesOrders, data.salesInvoices, data.salesCreditNotes, canViewTab]);

  const allowed = (id) => tabs.some(t => t.id === id);
  const firstId = tabs[0]?.id || "overview";

  const [active, setActive] = useState(() => { const id = mapTabToId(tab); return allowed(id) ? id : firstId; });

  /* زامن مع الـ tab الخارجي (deep-link / goto-tab / tile click) */
  useEffect(() => {
    const id = mapTabToId(tab);
    setActive(allowed(id) ? id : firstId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  /* لو القسم الحالي بقى ممنوع، ارجع لأول قسم متاح */
  useEffect(() => {
    if(!allowed(active)) setActive(firstId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs.length]);

  /* حسابات لوحة النظرة العامة (المستندات) */
  const ov = useMemo(() => {
    const quotes = data.salesQuotations || [], orders = data.salesOrders || [];
    const invoices = data.salesInvoices || [], cnotes = data.salesCreditNotes || [];
    const today = new Date().toISOString().split("T")[0];
    const monthPrefix = today.slice(0, 7);
    const soonLimit = new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0];
    let openQ = 0, openQVal = 0, expiring = 0;
    for(const q of quotes){
      const ds = displayStatus(q, today);
      if(ds === "draft" || ds === "sent"){ openQ++; openQVal += Number(q.total) || 0;
        if(q.validUntil && q.validUntil >= today && q.validUntil <= soonLimit) expiring++; }
    }
    const confirmed = orders.filter(o => o.status === "confirmed");
    const posted = invoices.filter(i => i.status === "posted");
    const monthSales = posted.filter(i => (i.date || "").startsWith(monthPrefix)).reduce((s, i) => s + (Number(i.total) || 0), 0);
    let unpaidCount = 0, unpaidTotal = 0;
    for(const i of posted){ const b = invoiceBalance(i); if(b > 0.01){ unpaidCount++; unpaidTotal += b; } }
    return { openQ, openQVal, expiring, ordCount: confirmed.length, postedCount: posted.length, monthSales,
      unpaidCount, unpaidTotal, cnMonth: cnotes.filter(c => (c.date || "").startsWith(monthPrefix)).length };
  }, [data.salesQuotations, data.salesOrders, data.salesInvoices, data.salesCreditNotes]);

  const subBtn = (on) => ({ padding: "8px 13px", borderRadius: 9, fontSize: FS - 1, fontWeight: 700, cursor: "pointer",
    color: on ? T.accent : T.textSec, background: on ? T.cardSolid : "transparent",
    border: "1px solid " + (on ? T.brd : "transparent"), boxShadow: on ? T.shadow : "none",
    display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" });
  const cntChip = (on) => ({ background: on ? T.accentBg : T.brd, color: on ? T.accent : T.textSec, fontSize: FS - 3, padding: "1px 7px", borderRadius: 20, fontWeight: 800 });

  return (
    <div style={{ padding: isMob ? 10 : "12px 16px 40px", width: "100%" }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <div style={{ width: 38, height: 38, borderRadius: 11, background: "#ECFDF5", color: "#059669", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19 }}>🛒</div>
        <div style={{ fontSize: isMob ? 18 : 20, fontWeight: 800, color: T.text }}>المبيعات</div>
      </div>

      {/* tab bar */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "6px 2px", borderBottom: "1px solid " + T.brd, marginBottom: 14, overflowX: "auto" }}>
        {tabs.map(t => (
          <div key={t.id} style={subBtn(active === t.id)} onClick={() => setActive(t.id)}>
            <span>{t.label}</span>
            {t.cnt != null && <span style={cntChip(active === t.id)}>{t.cnt}</span>}
          </div>
        ))}
      </div>

      {/* content */}
      <Suspense fallback={<Loading />}>
        {active === "overview" && (
          <div>
            <Overview ov={ov} isMob={isMob} go={(id) => allowed(id) && setActive(id)} allowed={allowed} />
            {canOps && <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: FS, fontWeight: 800, color: T.textSec, margin: "4px 0 8px" }}>📦 ملخص التسليمات (الموسم الحالي)</div>
              <CustDeliverPg {...props} hubView="overview" canEdit={canEditTab("custDeliver")} />
            </div>}
          </div>
        )}
        {active === "quotations" && canDoc("salesQuotations") && <QuotationsPg data={data} upConfig={props.upConfig} isMob={isMob} user={props.user} canEdit={canEditTab("salesQuotations")} />}
        {active === "orders"     && canDoc("salesOrders")     && <SalesOrdersPg data={data} upConfig={props.upConfig} isMob={isMob} user={props.user} canEdit={canEditTab("salesOrders")} />}
        {active === "invoices"   && canDoc("salesInvoices")   && <SalesInvoicesPg data={data} upConfig={props.upConfig} isMob={isMob} user={props.user} />}
        {active === "returns"    && canDoc("creditNotes")     && <CreditNotesPg data={data} upConfig={props.upConfig} isMob={isMob} user={props.user} />}
        {/* أقسام التسليمات تشارك instance واحد (hubView={active}) — التبديل بينها
            ما يعملش remount ولا يضيّع الحالة. */}
        {["quickActions","deliveryLog","returnsLog","audits","stale"].includes(active) && canOps
          && <CustDeliverPg {...props} hubView={active} canEdit={canEditTab("custDeliver")} />}
      </Suspense>
    </div>
  );
}

/* ═══════════ Overview (لوحة النظرة العامة — بدون قمع البيع) ═══════════ */
function Overview({ ov, isMob, go, allowed }){
  const kpi = (lab, val, sub, accent, danger) => (
    <div style={{ background: accent ? "linear-gradient(135deg,#0EA5E9,#0284C7)" : T.cardSolid, border: accent ? "none" : "1px solid " + T.brd, borderRadius: 13, padding: 14 }}>
      <div style={{ fontSize: FS - 1, color: accent ? "rgba(255,255,255,.85)" : T.textSec, fontWeight: 600 }}>{lab}</div>
      <div style={{ fontSize: isMob ? 19 : 22, fontWeight: 800, marginTop: 5, color: accent ? "#fff" : (danger ? T.err : T.text) }}>{val}</div>
      {sub && <div style={{ fontSize: FS - 3, marginTop: 3, fontWeight: 700, color: accent ? "rgba(255,255,255,.85)" : T.textMut }}>{sub}</div>}
    </div>
  );
  const card = (id, ic, bg, col, title, desc, stat) => allowed(id) ? (
    <div onClick={() => go(id)} style={{ background: T.cardSolid, border: "1px solid " + T.brd, borderRadius: 13, padding: 15, cursor: "pointer" }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.boxShadow = "0 6px 18px rgba(14,165,233,.15)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = T.brd; e.currentTarget.style.boxShadow = "none"; }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: bg, color: col, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19 }}>{ic}</div>
      <div style={{ fontSize: FS + 1, fontWeight: 800, marginTop: 9, color: T.text }}>{title}</div>
      <div style={{ fontSize: FS - 2, color: T.textSec, marginTop: 2 }}>{desc}</div>
      <div style={{ fontSize: FS - 1, color: T.textSec, marginTop: 8 }}>{stat}</div>
    </div>
  ) : null;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: isMob ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
        {kpi("💰 مبيعات الشهر", fmt((ov.monthSales || 0).toFixed(0)), "فواتير مرحّلة", true)}
        {kpi("💸 متبقي تحصيله", fmt((ov.unpaidTotal || 0).toFixed(0)), ov.unpaidCount + " فاتورة", false, true)}
        {kpi("📤 فواتير مرحّلة", ov.postedCount, "إجمالي", false)}
        {kpi("📋 عروض مفتوحة", ov.openQ, "قيمتها " + fmt((ov.openQVal || 0).toFixed(0)), false)}
      </div>

      {ov.unpaidCount > 0 && allowed("invoices") && (
        <div onClick={() => go("invoices")} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 15px", borderRadius: 11, marginBottom: 9, background: "#EF444412", border: "1px solid #EF444433", cursor: "pointer" }}>
          <span style={{ fontSize: 17 }}>💸</span>
          <div style={{ flex: 1, fontSize: FS - 1, fontWeight: 600, color: T.text }}><b style={{ color: T.err }}>{ov.unpaidCount}</b> فاتورة مرحّلة عليها متبقي — إجمالي <b style={{ color: T.err, direction: "ltr", display: "inline-block" }}>{fmt((ov.unpaidTotal || 0).toFixed(0))}</b></div>
          <span style={{ fontSize: FS - 2, color: T.err, fontWeight: 800 }}>عرض ↗</span>
        </div>
      )}
      {ov.expiring > 0 && allowed("quotations") && (
        <div onClick={() => go("quotations")} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 15px", borderRadius: 11, marginBottom: 9, background: "#F59E0B14", border: "1px solid #F59E0B38", cursor: "pointer" }}>
          <span style={{ fontSize: 17 }}>⏰</span>
          <div style={{ flex: 1, fontSize: FS - 1, fontWeight: 600, color: T.text }}><b style={{ color: "#D97706" }}>{ov.expiring}</b> عرض سعر قربت تنتهي صلاحيتهم (خلال 3 أيام)</div>
          <span style={{ fontSize: FS - 2, color: "#D97706", fontWeight: 800 }}>عرض ↗</span>
        </div>
      )}

      <div style={{ fontSize: FS, fontWeight: 800, color: T.textSec, margin: "16px 0 10px" }}>📂 الأقسام</div>
      <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "repeat(3,1fr)", gap: 10 }}>
        {card("quotations", "📋", "#E0F2FE", "#0284C7", "عروض الأسعار", "إنشاء وإرسال وتحويل لأوامر", ov.openQ + " مفتوح")}
        {card("orders", "📑", "#EEF2FF", "#6366F1", "أوامر البيع", "حجز مخزون + تحويل لفاتورة", ov.ordCount + " مؤكّد")}
        {card("invoices", "📤", "#D1FAE5", "#059669", "فواتير البيع", "ترحيل + تحصيل + طباعة", ov.postedCount + " مرحّلة · " + ov.unpaidCount + " غير مدفوعة")}
        {card("returns", "↩️", "#FEE2E2", "#DC2626", "مرتجعات - إشعارات دائنة", "مرتجعات بفاتورة + خصومات", ov.cnMonth + " هذا الشهر")}
      </div>
    </div>
  );
}
