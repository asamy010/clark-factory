/* ═══════════════════════════════════════════════════════════════════════
   CLARK · PurchaseHubPg (V21.12.0 — توحيد المشتريات، المرحلة 1)
   ───────────────────────────────────────────────────────────────────────
   تايل «مشتريات» واحد بتابات مسطّحة (نظير هَب المبيعات):
     📊 نظرة عامة · 📋 أوامر الشراء · 📥 الاستلام · 📤 فواتير المشتريات ·
     ↪️ إشعارات مدينة · 👥 الموردون · 📦 المخزن · 🏷️ الأصناف
   (💬 طلب عروض أسعار RFQ — يُضاف في المرحلة 2.)

   التابات اللي مصدرها PurchasePg (أوامر/استلام/موردون/مخزن/أصناف) بتتعرض عبر
   prop `hubView` على نفس المكوّن — من غير إعادة كتابة منطقه. الصلاحيات: أقسام
   PurchasePg بـ canViewTab("purchase")، الفواتير بـ purchaseInvoices،
   الإشعارات المدينة بـ debitNotes. عرض كامل للشاشة.
   ═══════════════════════════════════════════════════════════════════════ */

import { lazy, Suspense, useState, useEffect, useMemo } from "react";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { fmt } from "../utils/format.js";

const PurchaseRfqPg      = lazy(() => import("./purchase/PurchaseRfqPg.jsx").then(m => ({ default: m.PurchaseRfqPg })));
const PurchasePg         = lazy(() => import("./PurchasePg.jsx").then(m => ({ default: m.PurchasePg })));
const PurchaseInvoicesPg = lazy(() => import("./PurchaseInvoicesPg.jsx").then(m => ({ default: m.PurchaseInvoicesPg })));
const DebitNotesPg       = lazy(() => import("./DebitNotesPg.jsx").then(m => ({ default: m.DebitNotesPg })));
const AccountStatementView = lazy(() => import("../components/AccountStatementView.jsx").then(m => ({ default: m.AccountStatementView })));
const InventoryValuationReport = lazy(() => import("../components/reports/InventoryValuationReport.jsx").then(m => ({ default: m.InventoryValuationReport })));
const ReportsHub = lazy(() => import("../components/reports/ReportsHub.jsx").then(m => ({ default: m.ReportsHub })));

/* map: مفتاح الـ tab الخارجي → id التاب جوّه الهَب */
function mapTabToId(tab){
  switch(tab){
    case "purchase":         return "receipts";   // الـ default القديم لـ PurchasePg
    case "purchaseInvoices": return "invoices";
    case "debitNotes":       return "debitNotes";
    case "purchases":
    default:                 return "overview";
  }
}

const PURCH_VIEWS = ["orders", "receipts", "suppliers", "stock", "categories"]; // أقسام PurchasePg

const Loading = () => (
  <div style={{ padding: 60, textAlign: "center", color: T.textMut }}>
    <div style={{ fontSize: 28, marginBottom: 8, opacity: .6 }}>⏳</div>
    <div style={{ fontSize: FS, fontWeight: 600 }}>جاري التحميل...</div>
  </div>
);

export function PurchaseHubPg(props){
  const { tab, data, canViewTab, canEditTab, isMob } = props;

  const canPurch = canViewTab("purchase");        // أوامر/استلام/موردون/مخزن/أصناف
  const canInv   = canViewTab("purchaseInvoices");
  const canDN    = canViewTab("debitNotes");
  const canRfq   = canViewTab("purchaseRfq");

  const tabs = useMemo(() => [
    { id: "overview",   label: "📊 نظرة عامة",        show: true },
    { id: "rfq",        label: "💬 طلب عروض أسعار",   show: canRfq,   cnt: (data.purchaseRfqs || []).length },
    { id: "orders",     label: "📋 أوامر الشراء",     show: canPurch, cnt: (data.purchaseOrders || []).length },
    { id: "receipts",   label: "📥 الاستلام",         show: canPurch, cnt: (data.purchaseReceipts || []).length },
    { id: "invoices",   label: "📤 فواتير المشتريات", show: canInv,   cnt: (data.purchaseInvoices || []).length },
    { id: "debitNotes", label: "↪️ إشعارات مدينة",    show: canDN,    cnt: (data.purchaseDebitNotes || []).length },
    { id: "ledger",     label: "📊 كشف محاسبي",       show: canInv || canPurch },
    { id: "reports",    label: "📈 تقارير",            show: canPurch || canInv },
    { id: "suppliers",  label: "👥 الموردون",         show: canPurch, cnt: (data.suppliers || []).length },
    { id: "stock",      label: "📦 المخزن",           show: canPurch },
    { id: "categories", label: "🏷️ الأصناف",          show: canPurch, cnt: (data.itemCategories || []).length },
  ].filter(t => t.show), [data.purchaseRfqs, data.purchaseOrders, data.purchaseReceipts, data.purchaseInvoices, data.purchaseDebitNotes, data.suppliers, data.itemCategories, canViewTab]);

  const allowed = (id) => tabs.some(t => t.id === id);
  const firstId = tabs[0]?.id || "overview";

  const [active, setActive] = useState(() => { const id = mapTabToId(tab); return allowed(id) ? id : firstId; });

  useEffect(() => { const id = mapTabToId(tab); setActive(allowed(id) ? id : firstId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
  useEffect(() => { if(!allowed(active)) setActive(firstId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs.length]);

  /* V21.12.2: cross-links — تبديل التاب من جوّه المستندات (PO ↔ RFQ ...) */
  useEffect(() => {
    const h = (e) => { const id = e?.detail; if(id && allowed(id)) setActive(id); };
    window.addEventListener("clark-open-purchase-tab", h);
    return () => window.removeEventListener("clark-open-purchase-tab", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs.length]);

  /* حسابات لوحة النظرة العامة */
  const ov = useMemo(() => {
    const invoices = data.purchaseInvoices || [], receipts = data.purchaseReceipts || [];
    const pays = data.supplierPayments || [], orders = data.purchaseOrders || [], dnotes = data.purchaseDebitNotes || [];
    const monthPrefix = new Date().toISOString().slice(0, 7);
    const posted = invoices.filter(i => i.status === "posted");
    const monthBuy = posted.filter(i => (i.date || "").startsWith(monthPrefix)).reduce((s, i) => s + (Number(i.total) || 0), 0);
    /* مستحق للموردين (تقديري): إجمالي الاستلامات − المدفوع منها − دفعات مستقلة */
    const totRec = receipts.reduce((s, r) => s + (Number(r.totalAmount) || 0), 0);
    const paidRec = receipts.reduce((s, r) => s + (Number(r.paidAmount) || 0), 0);
    const standalone = pays.filter(p => !p.receiptId).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const payable = Math.max(0, totRec - paidRec - standalone);
    /* V21.21.6: بطاقات مالية مطابقة لنظرة عامة المبيعات */
    const totalBuy = totRec; /* إجمالي قيمة الاستلامات (المشتريات الفعلية) */
    const totalReturns = dnotes.filter(d => d && d.status !== "void").reduce((s, d) => s + (Number(d.total) || 0), 0);
    const cashPaid = pays.filter(p => (p.method || "") === "cash").reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const checksPaid = pays.filter(p => (p.method || "") === "check").reduce((s, p) => s + (Number(p.amount) || 0), 0);
    return { monthBuy, postedCount: posted.length, poCount: orders.length,
      dnMonth: dnotes.filter(c => (c.date || "").startsWith(monthPrefix)).length, payable,
      totalBuy, totalReturns, cashPaid, checksPaid };
  }, [data.purchaseInvoices, data.purchaseReceipts, data.supplierPayments, data.purchaseOrders, data.purchaseDebitNotes]);

  const subBtn = (on) => ({ padding: "8px 13px", borderRadius: 9, fontSize: FS - 1, fontWeight: 700, cursor: "pointer",
    color: on ? T.warn : T.textSec, background: on ? T.cardSolid : "transparent",
    border: "1px solid " + (on ? T.brd : "transparent"), boxShadow: on ? T.shadow : "none",
    display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" });
  const cntChip = (on) => ({ background: on ? "#FEF3C7" : T.brd, color: on ? "#D97706" : T.textSec, fontSize: FS - 3, padding: "1px 7px", borderRadius: 20, fontWeight: 800 });

  return (
    <div style={{ padding: isMob ? 10 : "12px 16px 40px", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <div style={{ width: 38, height: 38, borderRadius: 11, background: "#FEF3C7", color: "#D97706", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19 }}>🛍️</div>
        <div style={{ fontSize: isMob ? 18 : 20, fontWeight: 800, color: T.text }}>المشتريات</div>
      </div>

      {/* V21.21.15: على الموبايل بنخفي شريط تابات الهَب (الشريط العلوي الثابت كفاية) —
          التنقّل بين الأقسام عبر شبكة «الأقسام» في نظرة عامة + زر رجوع. */}
      {!isMob && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "6px 2px", borderBottom: "1px solid " + T.brd, marginBottom: 14, overflowX: "auto" }}>
        {tabs.map(t => (
          <div key={t.id} style={subBtn(active === t.id)} onClick={() => setActive(t.id)}>
            <span>{t.label}</span>
            {t.cnt != null && <span style={cntChip(active === t.id)}>{t.cnt}</span>}
          </div>
        ))}
      </div>}
      {isMob && active !== "overview" && (
        <div onClick={() => setActive("overview")} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", marginBottom: 12, borderRadius: 10, background: T.cardSolid, border: "1px solid " + T.brd, cursor: "pointer" }}>
          <span style={{ fontSize: 16, color: T.warn, fontWeight: 800 }}>‹</span>
          <span style={{ fontWeight: 700, fontSize: FS - 1, color: T.text }}>كل الأقسام</span>
          <span style={{ marginInlineStart: "auto", fontSize: FS - 2, color: T.textMut }}>{(tabs.find(t => t.id === active) || {}).label || ""}</span>
        </div>
      )}

      <Suspense fallback={<Loading />}>
        {active === "overview" && <Overview ov={ov} isMob={isMob} tabs={tabs} go={(id) => allowed(id) && setActive(id)} allowed={allowed} />}
        {active === "rfq"        && canRfq && <PurchaseRfqPg data={data} upConfig={props.upConfig} isMob={isMob} user={props.user} canEdit={canEditTab("purchaseRfq")} />}
        {active === "invoices"   && canInv && <PurchaseInvoicesPg data={data} upConfig={props.upConfig} isMob={isMob} canEdit={canEditTab("purchaseInvoices")} user={props.user} />}
        {active === "debitNotes" && canDN  && <DebitNotesPg data={data} upConfig={props.upConfig} isMob={isMob} canEdit={canEditTab("debitNotes")} user={props.user} />}
        {active === "ledger"     && <AccountStatementView data={data} partyType="supplier" isMob={isMob} />}
        {active === "reports"    && <ReportsHub isMob={isMob} reports={[
          { id: "inv-materials", icon: "🧵", title: "تقييم المخزون — الخامات والإكسسوار", desc: "قيمة أرصدة الخامات والإكسسوار بالتكلفة (متوسط التكلفة ‖ السعر)", color: "#D97706", render: () => <InventoryValuationReport data={data} kind="materials" isMob={isMob} /> },
        ]} />}
        {/* أقسام PurchasePg تشارك instance واحد (hubView={active}) — مفيش remount عند التبديل */}
        {PURCH_VIEWS.includes(active) && canPurch
          && <PurchasePg data={data} upConfig={props.upConfig} isMob={isMob} isTab={props.isTab} canEdit={canEditTab("purchase")} user={props.user} userRole={props.userRole} hubView={active} />}
      </Suspense>
    </div>
  );
}

/* ═══════════ Overview (لوحة النظرة العامة للمشتريات) ═══════════ */
function Overview({ ov, isMob, tabs, go, allowed }){
  const kpi = (lab, val, sub, accent, danger) => (
    <div style={{ flex: isMob ? "1 1 45%" : "1 1 150px", minWidth: isMob ? 0 : 140, background: accent ? "linear-gradient(135deg,#F59E0B,#D97706)" : T.cardSolid, border: accent ? "none" : "1px solid " + T.brd, borderRadius: 13, padding: 14 }}>
      <div style={{ fontSize: FS - 1, color: accent ? "rgba(255,255,255,.9)" : T.textSec, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lab}</div>
      <div style={{ fontSize: isMob ? 19 : 22, fontWeight: 800, marginTop: 5, color: accent ? "#fff" : (danger ? T.err : T.text) }}>{val}</div>
      {sub && <div style={{ fontSize: FS - 3, marginTop: 3, fontWeight: 700, color: accent ? "rgba(255,255,255,.9)" : T.textMut }}>{sub}</div>}
    </div>
  );
  const card = (id, ic, bg, col, title, desc, stat) => allowed(id) ? (
    <div onClick={() => go(id)} style={{ flex: isMob ? "1 1 45%" : "1 1 180px", minWidth: isMob ? 0 : 170, background: T.cardSolid, border: "1px solid " + T.brd, borderRadius: 13, padding: 15, cursor: "pointer" }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = T.warn; e.currentTarget.style.boxShadow = "0 6px 18px rgba(245,158,11,.15)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = T.brd; e.currentTarget.style.boxShadow = "none"; }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: bg, color: col, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19 }}>{ic}</div>
      <div style={{ fontSize: FS + 1, fontWeight: 800, marginTop: 9, color: T.text }}>{title}</div>
      <div style={{ fontSize: FS - 2, color: T.textSec, marginTop: 2 }}>{desc}</div>
      <div style={{ fontSize: FS - 1, color: T.textSec, marginTop: 8 }}>{stat}</div>
    </div>
  ) : null;

  return (
    <div>
      {/* V21.21.6: كل بطاقات الـ KPI على صف واحد (flex + scroll أفقي لو ضاق على الديسكتوب).
          أُضيفت البطاقات المالية المطابقة لنظرة عامة المبيعات. */}
      <div style={{ display: "flex", flexWrap: isMob ? "wrap" : "nowrap", gap: 10, marginBottom: 16, overflowX: isMob ? "visible" : "auto", paddingBottom: isMob ? 0 : 4 }}>
        {kpi("🛒 مشتريات الشهر", fmt((ov.monthBuy || 0).toFixed(0)), "فواتير مرحّلة", true)}
        {kpi("🧾 إجمالي المشتريات", fmt((ov.totalBuy || 0).toFixed(0)) + " ج.م", "قيمة الاستلامات", false)}
        {kpi("↩️ إجمالي المرتجعات", fmt((ov.totalReturns || 0).toFixed(0)) + " ج.م", "إشعارات مدينة", false, true)}
        {kpi("💵 الدفعات النقدية للموردين", fmt((ov.cashPaid || 0).toFixed(0)) + " ج.م", "نقدي", false)}
        {kpi("📝 شيكات الدفع", fmt((ov.checksPaid || 0).toFixed(0)) + " ج.م", "للموردين", false)}
        {kpi("⚖️ رصيد الموردين", fmt((ov.payable || 0).toFixed(0)) + " ج.م", "مستحق (تقديري)", false, true)}
        {kpi("📤 فواتير مرحّلة", ov.postedCount, "إجمالي", false)}
        {kpi("📋 أوامر شراء", ov.poCount, "إجمالي", false)}
      </div>

      <div style={{ fontSize: FS, fontWeight: 800, color: T.textSec, margin: "8px 0 10px" }}>📂 الأقسام</div>
      {isMob ? (
        /* V21.21.15: موبايل — شبكة كاملة بكل أقسام الهَب (بديل شريط التابات المخفي) */
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
          {(tabs || []).filter(t => t.id !== "overview").map(t => (
            <div key={t.id} onClick={() => go(t.id)} style={{ background: T.cardSolid, border: "1px solid " + T.brd, borderRadius: 13, padding: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontWeight: 800, fontSize: FS, color: T.text }}>{t.label}</span>
              {t.cnt != null && <span style={{ background: "#FEF3C7", color: "#D97706", fontSize: FS - 3, padding: "1px 7px", borderRadius: 20, fontWeight: 800 }}>{t.cnt}</span>}
            </div>
          ))}
        </div>
      ) : (
      <div style={{ display: "flex", flexWrap: "nowrap", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
        {card("rfq", "💬", "#FEF3C7", "#D97706", "طلب عروض أسعار", "اطلب أسعار + قارن + حوّل لأمر", "")}
        {card("orders", "📋", "#FEF3C7", "#D97706", "أوامر الشراء", "إنشاء + تحويل لاستلام", ov.poCount + " أمر")}
        {card("receipts", "📥", "#DBEAFE", "#2563EB", "الاستلام", "استلام البضاعة + الدفع", "")}
        {card("invoices", "📤", "#FEF3C7", "#D97706", "فواتير المشتريات", "ترحيل + دفع", ov.postedCount + " مرحّلة")}
        {card("debitNotes", "↪️", "#DBEAFE", "#2563EB", "إشعارات مدينة", "مرتجعات للموردين", ov.dnMonth + " هذا الشهر")}
        {card("suppliers", "👥", "#ECFDF5", "#059669", "الموردون", "كشوف حساب + أرصدة", "")}
      </div>
      )}
    </div>
  );
}
