/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · Accounting Reports Hub (V21.27.104)
   ───────────────────────────────────────────────────────────────────────
   تاب «تقارير محاسبية» — حاوية لتقارير محاسبية مشتقّة (read-only، صفر
   mutation). كل تقرير زر في الشبكة؛ الضغط يفتح التقرير كـ view ملء التاب
   (نمط views-vs-popups §15 — المستند الكبير view مش popup) مع رجوع للشبكة.

   التقرير الأول: «تقرير تقييم مخزون» — يجمع تقييم المخزون بالكامل + مستحقات
   الموردين والعملاء، قابل للتصدير Excel + طباعة احترافية. تقارير تانية
   هتتضاف لنفس التاب لاحقًا (نفس النمط — أضف entry في REPORT_DEFS).
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { fmt } from "../../utils/format.js";
import { buildInventoryValuationReport } from "../../utils/accounting/inventoryValuation.js";
import { exportExcel } from "../../utils/print-extras.js";
import { printPage } from "../../utils/print.js";

const REPORT_DEFS = [
  { key: "inventory", label: "تقرير تقييم مخزون", icon: "🏭",
    desc: "تقييم المخزون بالكامل (جاهز/قماش/إكسسوار) + مستحقات الموردين والعملاء" },
];

const todayAr = () => { try { return new Date().toLocaleDateString("ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric" }); } catch (_) { return new Date().toISOString().split("T")[0]; } };
const todayIso = () => new Date().toISOString().split("T")[0];

export function AccountingReportsTab({ data, configInfo, T, FS, isMob, showToast }){
  const [selected, setSelected] = useState(null);

  if(selected === "inventory")
    return <InventoryValuationReportView data={data} configInfo={configInfo} T={T} FS={FS} isMob={isMob} showToast={showToast} onBack={() => setSelected(null)} />;

  /* ── شبكة أزرار التقارير ── */
  return <div>
    <div style={{ fontSize: FS - 1, color: T.textSec, marginBottom: 14, fontWeight: 600 }}>
      اختر تقريرًا لعرضه. كل التقارير مشتقّة من البيانات الحيّة (للقراءة فقط) وقابلة للتصدير Excel والطباعة.
    </div>
    <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
      {REPORT_DEFS.map(r => (
        <div key={r.key} onClick={() => setSelected(r.key)} style={{
          cursor: "pointer", padding: 16, borderRadius: 12,
          background: T.cardSolid, border: "2px solid " + T.brd,
          display: "flex", alignItems: "flex-start", gap: 12, transition: "all 0.15s",
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.background = T.accent + "0C"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = T.brd; e.currentTarget.style.background = T.cardSolid; }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, background: "linear-gradient(135deg,#0EA5E9,#8B5CF6)", color: "#fff" }}>{r.icon}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: FS + 1, fontWeight: 800, color: T.text, marginBottom: 4 }}>{r.label}</div>
            <div style={{ fontSize: FS - 3, color: T.textMut, lineHeight: 1.5 }}>{r.desc}</div>
          </div>
          <div style={{ fontSize: 18, color: T.textMut, alignSelf: "center" }}>←</div>
        </div>
      ))}
    </div>
  </div>;
}

/* ─────────────────────────────────────────────────────────────────────
   تقرير تقييم المخزون — view
   ───────────────────────────────────────────────────────────────────── */
function InventoryValuationReportView({ data, configInfo, T, FS, isMob, showToast, onBack }){
  const rep = useMemo(() => buildInventoryValuationReport(data), [data]);

  const cards = [
    { label: "إجمالي تقييم المخزون (بالتكلفة)", value: rep.inventoryTotal, color: "#0EA5E9", big: true },
    { label: "مخزن الجاهز — بالتكلفة", value: rep.finishedCost, color: "#8B5CF6" },
    { label: "مخزن الجاهز — بسعر المبيعات", value: rep.finishedSell, color: "#10B981" },
    { label: "الربح المتوقع على الجاهز", value: rep.finishedProfit, color: "#10B981", muted: true },
    { label: "مخزن القماش — بالتكلفة", value: rep.fabric, color: "#F59E0B" },
    { label: "مخزن الإكسسوار — بالتكلفة", value: rep.accessory, color: "#EC4899" },
    ...(rep.other > 0 ? [{ label: "مخازن أخرى — بالتكلفة", value: rep.other, color: "#64748B" }] : []),
    { label: "مستحق على المصنع للموردين", value: rep.supplierPayable, color: "#EF4444", big: true },
    { label: "مستحق للمصنع من العملاء", value: rep.customerReceivable, color: "#22C55E", big: true },
  ];

  const doExcel = () => {
    try { buildInventoryExcel(rep, configInfo); showToast && showToast("✓ تم تصدير ملف Excel"); }
    catch(e){ showToast && showToast("⛔ تعذّر التصدير: " + (e.message || e)); }
  };
  const doPrint = () => {
    try { printPage("تقرير تقييم المخزون", buildInventoryPrintHtml(rep, T), configInfo); }
    catch(e){ showToast && showToast("⛔ تعذّر فتح الطباعة: " + (e.message || e)); }
  };

  const sec = (title) => <div style={{ fontSize: FS, fontWeight: 800, color: T.text, margin: "20px 0 8px", paddingBottom: 5, borderBottom: "2px solid " + T.brd }}>{title}</div>;
  const th = { padding: "7px 10px", textAlign: "right", fontSize: FS - 3, fontWeight: 800, color: T.textSec, background: T.bg, borderBottom: "1.5px solid " + T.brd, position: "sticky", top: 0 };
  const td = { padding: "6px 10px", textAlign: "right", fontSize: FS - 2, color: T.text, borderBottom: "1px solid " + T.brd };

  return <div>
    {/* Toolbar */}
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
      <button onClick={onBack} style={{ padding: "8px 14px", borderRadius: 8, border: "1.5px solid " + T.brd, background: T.cardSolid, color: T.text, fontSize: FS - 1, fontWeight: 700, cursor: "pointer" }}>↩ رجوع</button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: FS + 3, fontWeight: 800, color: T.text }}>🏭 تقرير تقييم المخزون</div>
        <div style={{ fontSize: FS - 3, color: T.textMut }}>{todayAr()}</div>
      </div>
      <button onClick={doExcel} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#10B981", color: "#fff", fontSize: FS - 1, fontWeight: 800, cursor: "pointer" }}>📊 تصدير Excel</button>
      <button onClick={doPrint} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: T.accent, color: "#fff", fontSize: FS - 1, fontWeight: 800, cursor: "pointer" }}>🖨 طباعة</button>
    </div>

    {/* KPI cards */}
    <div style={{ display: "grid", gridTemplateColumns: isMob ? "repeat(2,1fr)" : "repeat(auto-fill,minmax(220px,1fr))", gap: 10 }}>
      {cards.map((c, i) => (
        <div key={i} style={{
          padding: 14, borderRadius: 12, background: T.cardSolid,
          border: "1.5px solid " + (c.big ? c.color + "55" : T.brd),
          borderInlineStart: "4px solid " + c.color,
          opacity: c.muted ? 0.92 : 1,
        }}>
          <div style={{ fontSize: FS - 3, color: T.textSec, fontWeight: 700, marginBottom: 6, lineHeight: 1.4 }}>{c.label}</div>
          <div style={{ fontSize: c.big ? FS + 6 : FS + 2, fontWeight: 800, color: c.color }}>{fmt(c.value)} <span style={{ fontSize: FS - 4, color: T.textMut, fontWeight: 600 }}>ج.م</span></div>
        </div>
      ))}
    </div>

    {/* تفاصيل الجاهز */}
    {sec("📦 تفاصيل مخزن الجاهز (" + rep.finishedDetail.length + " موديل)")}
    <div style={{ overflowX: "auto", border: "1px solid " + T.brd, borderRadius: 10 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
        <thead><tr>
          <th style={th}>الموديل</th><th style={th}>المتاح</th><th style={th}>تكلفة الوحدة</th>
          <th style={th}>القيمة بالتكلفة</th><th style={th}>سعر بيع الوحدة</th><th style={th}>القيمة بالبيع</th>
        </tr></thead>
        <tbody>
          {rep.finishedDetail.length === 0 && <tr><td style={{ ...td, textAlign: "center", color: T.textMut }} colSpan={6}>لا يوجد مخزون جاهز متاح</td></tr>}
          {rep.finishedDetail.map((r, i) => <tr key={i}>
            <td style={td}>{r.name}</td><td style={td}>{r.qty}</td><td style={td}>{fmt(r.unitCost)}</td>
            <td style={{ ...td, fontWeight: 700 }}>{fmt(r.value)}</td><td style={td}>{fmt(r.unitSell || 0)}</td>
            <td style={{ ...td, fontWeight: 700, color: "#10B981" }}>{fmt(r.sellValue || 0)}</td>
          </tr>)}
        </tbody>
        {rep.finishedDetail.length > 0 && <tfoot><tr>
          <td style={{ ...td, fontWeight: 800, background: T.bg }}>الإجمالي</td>
          <td style={{ ...td, background: T.bg }}></td><td style={{ ...td, background: T.bg }}></td>
          <td style={{ ...td, fontWeight: 800, background: T.bg }}>{fmt(rep.finishedCost)}</td>
          <td style={{ ...td, background: T.bg }}></td>
          <td style={{ ...td, fontWeight: 800, color: "#10B981", background: T.bg }}>{fmt(rep.finishedSell)}</td>
        </tr></tfoot>}
      </table>
    </div>

    {/* تفاصيل القماش + الإكسسوار */}
    {[{ t: "🧵 تفاصيل مخزن القماش", rows: rep.fabricDetail, total: rep.fabric }, { t: "🔘 تفاصيل مخزن الإكسسوار", rows: rep.accessoryDetail, total: rep.accessory }, ...(rep.other > 0 ? [{ t: "📁 مخازن أخرى", rows: rep.otherDetail, total: rep.other }] : [])].map((blk, bi) => <div key={bi}>
      {sec(blk.t + " (" + blk.rows.length + " صنف)")}
      <div style={{ overflowX: "auto", border: "1px solid " + T.brd, borderRadius: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
          <thead><tr><th style={th}>الصنف</th><th style={th}>الرصيد المتاح</th><th style={th}>متوسط التكلفة</th><th style={th}>القيمة</th></tr></thead>
          <tbody>
            {blk.rows.length === 0 && <tr><td style={{ ...td, textAlign: "center", color: T.textMut }} colSpan={4}>لا يوجد رصيد</td></tr>}
            {blk.rows.map((r, i) => <tr key={i}><td style={td}>{r.name}</td><td style={td}>{r.qty}</td><td style={td}>{fmt(r.unitCost)}</td><td style={{ ...td, fontWeight: 700 }}>{fmt(r.value)}</td></tr>)}
          </tbody>
          {blk.rows.length > 0 && <tfoot><tr><td style={{ ...td, fontWeight: 800, background: T.bg }}>الإجمالي</td><td style={{ ...td, background: T.bg }}></td><td style={{ ...td, background: T.bg }}></td><td style={{ ...td, fontWeight: 800, background: T.bg }}>{fmt(blk.total)}</td></tr></tfoot>}
        </table>
      </div>
    </div>)}

    {/* المستحقات */}
    {[{ t: "🔴 مستحق على المصنع للموردين", rows: rep.supplierRows, total: rep.supplierPayable, col: "#EF4444", c1: "المورد" }, { t: "🟢 مستحق للمصنع من العملاء", rows: rep.customerRows, total: rep.customerReceivable, col: "#22C55E", c1: "العميل" }].map((blk, bi) => <div key={bi}>
      {sec(blk.t + " (" + blk.rows.length + " طرف)")}
      <div style={{ overflowX: "auto", border: "1px solid " + T.brd, borderRadius: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 360 }}>
          <thead><tr><th style={th}>{blk.c1}</th><th style={th}>المبلغ المستحق (ج.م)</th></tr></thead>
          <tbody>
            {blk.rows.length === 0 && <tr><td style={{ ...td, textAlign: "center", color: T.textMut }} colSpan={2}>لا توجد مستحقات</td></tr>}
            {blk.rows.map((r, i) => <tr key={i}><td style={td}>{r.name}</td><td style={{ ...td, fontWeight: 700, color: blk.col }}>{fmt(r.balance)}</td></tr>)}
          </tbody>
          {blk.rows.length > 0 && <tfoot><tr><td style={{ ...td, fontWeight: 800, background: T.bg }}>الإجمالي</td><td style={{ ...td, fontWeight: 800, color: blk.col, background: T.bg }}>{fmt(blk.total)}</td></tr></tfoot>}
        </table>
      </div>
    </div>)}

    <div style={{ marginTop: 18, fontSize: FS - 4, color: T.textMut, lineHeight: 1.7, background: T.bg, padding: 12, borderRadius: 10 }}>
      ℹ️ تقييم المخزون بالتكلفة (المعيار المحاسبي) — سعر المبيعات بند معلوماتي منفصل لا يدخل في الإجمالي.
      الجاهز = المتاح × تكلفة الوحدة الكاملة (خامات + إكسسوار + تشغيل + هالك). القماش/الإكسسوار = الرصيد × متوسط التكلفة المرجّح.
      المستحقات = أرصدة الأطراف المدينة فقط (المورد: علينا له · العميل: لنا عليه).
    </div>
  </div>;
}

/* ── Excel export (aoa) ── */
function buildInventoryExcel(rep, configInfo){
  const factory = (configInfo && configInfo.factoryName) || "CLARK";
  const rows = [];
  rows.push(["تقرير تقييم المخزون", factory, todayAr()]);
  rows.push([]);
  rows.push(["الملخص", ""]);
  rows.push(["البند", "القيمة (ج.م)"]);
  rows.push(["إجمالي تقييم المخزون (بالتكلفة)", rep.inventoryTotal]);
  rows.push(["مخزن الجاهز — بالتكلفة", rep.finishedCost]);
  rows.push(["مخزن الجاهز — بسعر المبيعات", rep.finishedSell]);
  rows.push(["الربح المتوقع على الجاهز", rep.finishedProfit]);
  rows.push(["مخزن القماش — بالتكلفة", rep.fabric]);
  rows.push(["مخزن الإكسسوار — بالتكلفة", rep.accessory]);
  if(rep.other > 0) rows.push(["مخازن أخرى — بالتكلفة", rep.other]);
  rows.push(["مستحق على المصنع للموردين", rep.supplierPayable]);
  rows.push(["مستحق للمصنع من العملاء", rep.customerReceivable]);
  rows.push([]);
  rows.push(["تفاصيل مخزن الجاهز"]);
  rows.push(["الموديل", "المتاح", "تكلفة الوحدة", "القيمة بالتكلفة", "سعر بيع الوحدة", "القيمة بالبيع"]);
  rep.finishedDetail.forEach(r => rows.push([r.name, r.qty, r.unitCost, r.value, r.unitSell || 0, r.sellValue || 0]));
  rows.push(["الإجمالي", "", "", rep.finishedCost, "", rep.finishedSell]);
  rows.push([]);
  rows.push(["تفاصيل مخزن القماش"]);
  rows.push(["الصنف", "الرصيد", "متوسط التكلفة", "القيمة"]);
  rep.fabricDetail.forEach(r => rows.push([r.name, r.qty, r.unitCost, r.value]));
  rows.push(["الإجمالي", "", "", rep.fabric]);
  rows.push([]);
  rows.push(["تفاصيل مخزن الإكسسوار"]);
  rows.push(["الصنف", "الرصيد", "متوسط التكلفة", "القيمة"]);
  rep.accessoryDetail.forEach(r => rows.push([r.name, r.qty, r.unitCost, r.value]));
  rows.push(["الإجمالي", "", "", rep.accessory]);
  if(rep.other > 0){
    rows.push([]);
    rows.push(["مخازن أخرى"]);
    rows.push(["الصنف", "الرصيد", "متوسط التكلفة", "القيمة"]);
    rep.otherDetail.forEach(r => rows.push([r.name, r.qty, r.unitCost, r.value]));
    rows.push(["الإجمالي", "", "", rep.other]);
  }
  rows.push([]);
  rows.push(["مستحق على المصنع للموردين"]);
  rows.push(["المورد", "المبلغ المستحق"]);
  rep.supplierRows.forEach(r => rows.push([r.name, r.balance]));
  rows.push(["الإجمالي", rep.supplierPayable]);
  rows.push([]);
  rows.push(["مستحق للمصنع من العملاء"]);
  rows.push(["العميل", "المبلغ المستحق"]);
  rep.customerRows.forEach(r => rows.push([r.name, r.balance]));
  rows.push(["الإجمالي", rep.customerReceivable]);
  exportExcel(rows, "تقييم_المخزون_" + todayIso());
}

/* ── Print HTML (consumes PRINT_CSS table/h2/h3 styles via printPage) ── */
function buildInventoryPrintHtml(rep){
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const money = (n) => fmt(n) + " ج.م";
  let h = "";

  /* الملخص */
  h += "<h2>ملخص تقييم المخزون والمستحقات</h2>";
  h += "<table><thead><tr><th>البند</th><th style='text-align:left'>القيمة</th></tr></thead><tbody>";
  const sumRow = (label, val, strong) => "<tr><td" + (strong ? " style='font-weight:800'" : "") + ">" + esc(label) + "</td><td style='text-align:left" + (strong ? ";font-weight:800" : "") + "'>" + money(val) + "</td></tr>";
  h += sumRow("إجمالي تقييم المخزون (بالتكلفة)", rep.inventoryTotal, true);
  h += sumRow("مخزن الجاهز — بالتكلفة", rep.finishedCost);
  h += sumRow("مخزن الجاهز — بسعر المبيعات", rep.finishedSell);
  h += sumRow("الربح المتوقع على الجاهز", rep.finishedProfit);
  h += sumRow("مخزن القماش — بالتكلفة", rep.fabric);
  h += sumRow("مخزن الإكسسوار — بالتكلفة", rep.accessory);
  if(rep.other > 0) h += sumRow("مخازن أخرى — بالتكلفة", rep.other);
  h += sumRow("مستحق على المصنع للموردين", rep.supplierPayable, true);
  h += sumRow("مستحق للمصنع من العملاء", rep.customerReceivable, true);
  h += "</tbody></table>";

  /* تفاصيل الجاهز */
  h += "<h3>تفاصيل مخزن الجاهز (" + rep.finishedDetail.length + " موديل)</h3>";
  h += "<table><thead><tr><th>الموديل</th><th>المتاح</th><th>تكلفة الوحدة</th><th>القيمة بالتكلفة</th><th>سعر بيع الوحدة</th><th>القيمة بالبيع</th></tr></thead><tbody>";
  rep.finishedDetail.forEach(r => { h += "<tr><td>" + esc(r.name) + "</td><td>" + r.qty + "</td><td>" + fmt(r.unitCost) + "</td><td>" + fmt(r.value) + "</td><td>" + fmt(r.unitSell || 0) + "</td><td>" + fmt(r.sellValue || 0) + "</td></tr>"; });
  h += "<tr><td style='font-weight:800'>الإجمالي</td><td></td><td></td><td style='font-weight:800'>" + fmt(rep.finishedCost) + "</td><td></td><td style='font-weight:800'>" + fmt(rep.finishedSell) + "</td></tr>";
  h += "</tbody></table>";

  /* القماش/الإكسسوار/أخرى */
  const matBlock = (title, list, total) => {
    let s = "<h3>" + esc(title) + " (" + list.length + " صنف)</h3>";
    s += "<table><thead><tr><th>الصنف</th><th>الرصيد</th><th>متوسط التكلفة</th><th>القيمة</th></tr></thead><tbody>";
    list.forEach(r => { s += "<tr><td>" + esc(r.name) + "</td><td>" + r.qty + "</td><td>" + fmt(r.unitCost) + "</td><td>" + fmt(r.value) + "</td></tr>"; });
    s += "<tr><td style='font-weight:800'>الإجمالي</td><td></td><td></td><td style='font-weight:800'>" + fmt(total) + "</td></tr>";
    s += "</tbody></table>";
    return s;
  };
  h += matBlock("تفاصيل مخزن القماش", rep.fabricDetail, rep.fabric);
  h += matBlock("تفاصيل مخزن الإكسسوار", rep.accessoryDetail, rep.accessory);
  if(rep.other > 0) h += matBlock("مخازن أخرى", rep.otherDetail, rep.other);

  /* المستحقات */
  const partyBlock = (title, list, total, c1) => {
    let s = "<h3>" + esc(title) + " (" + list.length + " طرف)</h3>";
    s += "<table><thead><tr><th>" + c1 + "</th><th style='text-align:left'>المبلغ المستحق</th></tr></thead><tbody>";
    list.forEach(r => { s += "<tr><td>" + esc(r.name) + "</td><td style='text-align:left'>" + money(r.balance) + "</td></tr>"; });
    s += "<tr><td style='font-weight:800'>الإجمالي</td><td style='text-align:left;font-weight:800'>" + money(total) + "</td></tr>";
    s += "</tbody></table>";
    return s;
  };
  h += partyBlock("مستحق على المصنع للموردين", rep.supplierRows, rep.supplierPayable, "المورد");
  h += partyBlock("مستحق للمصنع من العملاء", rep.customerRows, rep.customerReceivable, "العميل");

  return h;
}
