/* ═══════════════════════════════════════════════════════════════════════
   CLARK · SalesHubPg (V21.11.0 — توحيد المبيعات، المرحلة 1)
   ───────────────────────────────────────────────────────────────────────
   هَب واحد يجمع كل المبيعات تحت تايل «مبيعات» واحد. مستويين:
     • ✨ الجديد  — لوحة نظرة عامة + المستندات الأربعة (عروض/أوامر/فواتير/إشعارات).
     • 📋 الحالي  — شاشة التسليمات التشغيلية الحالية (CustDeliverPg) كما هي.

   التصميم (موافقة Ahmed — التصميم ب، مستويين):
     - تايل واحد «مبيعات» (key="sales") بدل الـ5 تايلات القديمة.
     - الروابط القديمة محفوظة: App.jsx بيـ render الهَب لأي من المفاتيح
       (sales / custDeliver / salesQuotations / salesOrders / salesInvoices /
       creditNotes)، والهَب بيـ map المفتاح للوضع/القسم الصح — فأي
       navigate()/goto-tab/notif-deeplink قديم بيفتح المكان الصح مباشرة.
     - الصلاحيات: كل قسم يظهر فقط بـ canViewTab بتاعه (نفس صلاحيات اليوم).

   ملاحظة معمارية: الصفحات الداخلية lazy-loaded (كل قسم في chunk منفصل)
   عشان فتح «نظرة عامة» ما يحمّلش كود CustDeliverPg الضخم (6635 سطر) إلا
   لما المستخدم يفتح تاب «الحالي» فعلاً.
   ═══════════════════════════════════════════════════════════════════════ */

import { lazy, Suspense, useState, useEffect, useMemo } from "react";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { fmt } from "../utils/format.js";
import { invoiceBalance } from "../utils/sales/invoicePayments.js";
import { displayStatus } from "../utils/sales/quotations.js";

/* ── lazy children (نفس مسارات App.jsx؛ الـ named exports) ── */
const CustDeliverPg   = lazy(() => import("./CustDeliverPg.jsx").then(m => ({ default: m.CustDeliverPg })));
const QuotationsPg     = lazy(() => import("./sales/QuotationsPg.jsx").then(m => ({ default: m.QuotationsPg })));
const SalesOrdersPg    = lazy(() => import("./sales/SalesOrdersPg.jsx").then(m => ({ default: m.SalesOrdersPg })));
const SalesInvoicesPg  = lazy(() => import("./SalesInvoicesPg.jsx").then(m => ({ default: m.SalesInvoicesPg })));
const CreditNotesPg    = lazy(() => import("./CreditNotesPg.jsx").then(m => ({ default: m.CreditNotesPg })));

/* map: tab key الداخل → {mode, sub} */
function mapTabToState(tab){
  switch(tab){
    case "custDeliver":     return { mode: "old", sub: "overview" };
    case "salesQuotations": return { mode: "new", sub: "quotations" };
    case "salesOrders":     return { mode: "new", sub: "orders" };
    case "salesInvoices":   return { mode: "new", sub: "invoices" };
    case "creditNotes":     return { mode: "new", sub: "creditNotes" };
    case "sales":
    default:                return { mode: "new", sub: "overview" };
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

  const canNew = canViewTab("salesQuotations") || canViewTab("salesOrders") || canViewTab("salesInvoices") || canViewTab("creditNotes");
  const canOld = canViewTab("custDeliver");

  const init = mapTabToState(tab);
  const [mode, setMode] = useState(canNew ? init.mode : "old");
  const [sub, setSub]   = useState(init.sub);

  /* لما الـ tab الخارجي يتغير (deep-link / goto-tab / tile click) → زامن
     الوضع/القسم. مش بيتأثر بالتنقّل الداخلي (dep = [tab] فقط). */
  useEffect(() => {
    const s = mapTabToState(tab);
    let m = s.mode;
    if(m === "new" && !canNew) m = "old";
    if(m === "old" && !canOld) m = "new";
    setMode(m);
    setSub(s.sub);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  /* ── حسابات لوحة النظرة العامة ── */
  const ov = useMemo(() => {
    const quotes  = data.salesQuotations  || [];
    const orders  = data.salesOrders      || [];
    const invoices= data.salesInvoices    || [];
    const cnotes  = data.salesCreditNotes || [];
    const today   = new Date().toISOString().split("T")[0];
    const monthPrefix = today.slice(0, 7); // YYYY-MM
    const soonLimit = new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0];

    let openQ = 0, openQVal = 0, expiring = 0;
    for(const q of quotes){
      const ds = displayStatus(q, today);
      if(ds === "draft" || ds === "sent"){
        openQ++; openQVal += Number(q.total) || 0;
        if(q.validUntil && q.validUntil >= today && q.validUntil <= soonLimit) expiring++;
      }
    }
    const confirmedOrders = orders.filter(o => o.status === "confirmed");
    const ordVal = confirmedOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);

    const posted = invoices.filter(i => i.status === "posted");
    const monthSales = posted.filter(i => (i.date || "").startsWith(monthPrefix)).reduce((s, i) => s + (Number(i.total) || 0), 0);
    let unpaidCount = 0, unpaidTotal = 0;
    for(const i of posted){ const b = invoiceBalance(i); if(b > 0.01){ unpaidCount++; unpaidTotal += b; } }
    const collected = monthSales - unpaidTotal;
    const collectPct = monthSales > 0 ? Math.round(Math.max(0, collected) / monthSales * 100) : 0;
    const cnMonth = cnotes.filter(c => (c.date || "").startsWith(monthPrefix)).length;

    return {
      openQ, openQVal, expiring,
      ordCount: confirmedOrders.length, ordVal,
      postedCount: posted.length, monthSales,
      unpaidCount, unpaidTotal, collectPct, cnMonth,
    };
  }, [data.salesQuotations, data.salesOrders, data.salesInvoices, data.salesCreditNotes]);

  /* ── أقسام تاب «الجديد» (مفلترة بالصلاحيات) ── */
  const subTabs = [
    { id: "overview",    label: "📊 نظرة عامة", show: true },
    { id: "quotations",  label: "📋 عروض الأسعار", show: canViewTab("salesQuotations"), cnt: (data.salesQuotations || []).length },
    { id: "orders",      label: "📑 أوامر البيع", show: canViewTab("salesOrders"), cnt: (data.salesOrders || []).length },
    { id: "invoices",    label: "📤 الفواتير", show: canViewTab("salesInvoices"), cnt: (data.salesInvoices || []).length },
    { id: "creditNotes", label: "↩️ إشعارات دائنة", show: canViewTab("creditNotes"), cnt: (data.salesCreditNotes || []).length },
  ].filter(s => s.show);

  /* لو القسم الحالي مش مسموح، ارجع لنظرة عامة */
  useEffect(() => {
    if(mode === "new" && sub !== "overview" && !subTabs.some(s => s.id === sub)) setSub("overview");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, sub]);

  /* ── styles ── */
  const modeBtn = (on) => ({ padding: "8px 18px", borderRadius: 9, fontSize: FS, fontWeight: 800, cursor: "pointer",
    color: on ? "#fff" : "#94a3b8", background: on ? T.accent : "rgba(255,255,255,.08)", border: "1px solid " + (on ? T.accent : "rgba(255,255,255,.12)") });
  const subBtn = (on) => ({ padding: "8px 14px", borderRadius: 9, fontSize: FS - 1, fontWeight: 700, cursor: "pointer",
    color: on ? T.accent : T.textSec, background: on ? T.cardSolid : "transparent",
    border: "1px solid " + (on ? T.brd : "transparent"), boxShadow: on ? T.shadow : "none", display: "flex", alignItems: "center", gap: 6 });
  const cntChip = (on) => ({ background: on ? T.accentBg : T.brd, color: on ? T.accent : T.textSec, fontSize: FS - 3, padding: "1px 7px", borderRadius: 20, fontWeight: 800 });

  return (
    <div style={{ padding: isMob ? 10 : "14px 18px 40px", maxWidth: 1320, margin: "0 auto" }}>
      {/* ── header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: "#ECFDF5", color: "#059669", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🛒</div>
        <div><div style={{ fontSize: isMob ? 18 : 20, fontWeight: 800, color: T.text }}>المبيعات</div>
          <div style={{ fontSize: FS - 2, color: T.textSec }}>{mode === "new" ? "المستندات + لوحة المتابعة" : "الشاشة التشغيلية"}</div></div>
      </div>

      {/* ── mode toggle (الجديد / الحالي) — يظهر فقط لو الاتنين متاحين ── */}
      {canNew && canOld && (
        <div style={{ display: "flex", gap: 8, padding: 10, background: "#0F172A", borderRadius: 12, marginBottom: 12, flexWrap: "wrap" }}>
          <div style={modeBtn(mode === "new")} onClick={() => { setMode("new"); }}>✨ الجديد</div>
          <div style={modeBtn(mode === "old")} onClick={() => { setMode("old"); }}>📋 الحالي</div>
        </div>
      )}

      {/* ── sub-tabs (تاب الجديد فقط) ── */}
      {mode === "new" && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "8px 4px", borderBottom: "1px solid " + T.brd, marginBottom: 14 }}>
          {subTabs.map(s => (
            <div key={s.id} style={subBtn(sub === s.id)} onClick={() => setSub(s.id)}>
              <span>{s.label}</span>
              {s.cnt != null && <span style={cntChip(sub === s.id)}>{s.cnt}</span>}
            </div>
          ))}
        </div>
      )}

      {/* ── content ── */}
      <Suspense fallback={<Loading />}>
        {mode === "old" && canOld && <CustDeliverPg {...props} canEdit={canEditTab("custDeliver")} />}
        {mode === "new" && sub === "overview"   && <Overview ov={ov} isMob={isMob} go={(s) => setSub(s)} subs={subTabs} />}
        {mode === "new" && sub === "quotations" && canViewTab("salesQuotations") && <QuotationsPg data={data} upConfig={props.upConfig} isMob={isMob} user={props.user} canEdit={canEditTab("salesQuotations")} />}
        {mode === "new" && sub === "orders"     && canViewTab("salesOrders")     && <SalesOrdersPg data={data} upConfig={props.upConfig} isMob={isMob} user={props.user} canEdit={canEditTab("salesOrders")} />}
        {mode === "new" && sub === "invoices"   && canViewTab("salesInvoices")   && <SalesInvoicesPg data={data} upConfig={props.upConfig} isMob={isMob} user={props.user} />}
        {mode === "new" && sub === "creditNotes"&& canViewTab("creditNotes")     && <CreditNotesPg data={data} upConfig={props.upConfig} isMob={isMob} user={props.user} />}
      </Suspense>
    </div>
  );
}

/* ═══════════ Overview (لوحة النظرة العامة — التصميم ب) ═══════════ */
function Overview({ ov, isMob, go, subs }){
  const has = (id) => subs.some(s => s.id === id);
  const kpi = (lab, val, sub, accent, danger) => (
    <div style={{ background: accent ? "linear-gradient(135deg,#0EA5E9,#0284C7)" : T.cardSolid, border: accent ? "none" : "1px solid " + T.brd, borderRadius: 13, padding: 14 }}>
      <div style={{ fontSize: FS - 1, color: accent ? "rgba(255,255,255,.85)" : T.textSec, fontWeight: 600 }}>{lab}</div>
      <div style={{ fontSize: isMob ? 19 : 22, fontWeight: 800, marginTop: 5, color: accent ? "#fff" : (danger ? T.err : T.text) }}>{val}</div>
      {sub && <div style={{ fontSize: FS - 3, marginTop: 3, fontWeight: 700, color: accent ? "rgba(255,255,255,.85)" : T.textMut }}>{sub}</div>}
    </div>
  );
  const card = (id, ic, bg, col, title, desc, stat) => has(id) ? (
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
      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: isMob ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
        {kpi("💰 مبيعات الشهر", fmt((ov.monthSales || 0).toFixed(0)), "بعد الترحيل", true)}
        {kpi("💸 متبقي تحصيله", fmt((ov.unpaidTotal || 0).toFixed(0)), ov.unpaidCount + " فاتورة", false, true)}
        {kpi("📤 فواتير مرحّلة", ov.postedCount, "إجمالي", false)}
        {kpi("📋 عروض مفتوحة", ov.openQ, "قيمتها " + fmt((ov.openQVal || 0).toFixed(0)), false)}
      </div>

      {/* قمع البيع */}
      <div style={{ fontSize: FS, fontWeight: 800, color: T.textSec, margin: "4px 0 8px" }}>🔻 قمع البيع</div>
      <div style={{ display: "grid", gridTemplateColumns: isMob ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: 8, marginBottom: 16 }}>
        {[
          { ic: "📋", l: "عروض", v: ov.openQ, m: fmt((ov.openQVal || 0).toFixed(0)), c: "#0EA5E9", id: "quotations" },
          { ic: "📑", l: "أوامر", v: ov.ordCount, m: fmt((ov.ordVal || 0).toFixed(0)), c: "#6366F1", id: "orders" },
          { ic: "📤", l: "فواتير", v: ov.postedCount, m: fmt((ov.monthSales || 0).toFixed(0)), c: "#10B981", id: "invoices" },
          { ic: "✅", l: "نسبة التحصيل", v: ov.collectPct + "%", m: "هذا الشهر", c: "#059669", id: null },
        ].map((f, i) => (
          <div key={i} onClick={() => f.id && has(f.id) && go(f.id)} style={{ background: T.cardSolid, border: "1px solid " + T.brd, borderTop: "3px solid " + f.c, borderRadius: 12, padding: 12, textAlign: "center", cursor: f.id && has(f.id) ? "pointer" : "default" }}>
            <div style={{ fontSize: 18 }}>{f.ic}</div>
            <div style={{ fontSize: FS - 1, color: T.textSec, fontWeight: 700, marginTop: 3 }}>{f.l}</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: T.text }}>{f.v}</div>
            <div style={{ fontSize: FS - 3, color: T.textMut }}>{f.m}</div>
          </div>
        ))}
      </div>

      {/* تنبيهات */}
      {ov.unpaidCount > 0 && has("invoices") && (
        <div onClick={() => go("invoices")} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 15px", borderRadius: 11, marginBottom: 9, background: "#EF444412", border: "1px solid #EF444433", cursor: "pointer" }}>
          <span style={{ fontSize: 17 }}>💸</span>
          <div style={{ flex: 1, fontSize: FS - 1, fontWeight: 600, color: T.text }}><b style={{ color: T.err }}>{ov.unpaidCount}</b> فاتورة مرحّلة عليها متبقي — إجمالي <b style={{ color: T.err, direction: "ltr", display: "inline-block" }}>{fmt((ov.unpaidTotal || 0).toFixed(0))}</b></div>
          <span style={{ fontSize: FS - 2, color: T.err, fontWeight: 800 }}>عرض ↗</span>
        </div>
      )}
      {ov.expiring > 0 && has("quotations") && (
        <div onClick={() => go("quotations")} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 15px", borderRadius: 11, marginBottom: 9, background: "#F59E0B14", border: "1px solid #F59E0B38", cursor: "pointer" }}>
          <span style={{ fontSize: 17 }}>⏰</span>
          <div style={{ flex: 1, fontSize: FS - 1, fontWeight: 600, color: T.text }}><b style={{ color: "#D97706" }}>{ov.expiring}</b> عرض سعر قربت تنتهي صلاحيتهم (خلال 3 أيام)</div>
          <span style={{ fontSize: FS - 2, color: "#D97706", fontWeight: 800 }}>عرض ↗</span>
        </div>
      )}

      {/* كروت الأقسام */}
      <div style={{ fontSize: FS, fontWeight: 800, color: T.textSec, margin: "16px 0 10px" }}>📂 الأقسام</div>
      <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "repeat(3,1fr)", gap: 10 }}>
        {card("quotations", "📋", "#E0F2FE", "#0284C7", "عروض الأسعار", "إنشاء وإرسال وتحويل لأوامر", ov.openQ + " مفتوح")}
        {card("orders", "📑", "#EEF2FF", "#6366F1", "أوامر البيع", "حجز مخزون + تحويل لفاتورة", ov.ordCount + " مؤكّد")}
        {card("invoices", "📤", "#D1FAE5", "#059669", "الفواتير", "ترحيل + تحصيل + طباعة", ov.postedCount + " مرحّلة · " + ov.unpaidCount + " غير مدفوعة")}
        {card("creditNotes", "↩️", "#FEE2E2", "#DC2626", "إشعارات دائنة", "مرتجعات بفاتورة + خصومات", ov.cnMonth + " هذا الشهر")}
      </div>
    </div>
  );
}
