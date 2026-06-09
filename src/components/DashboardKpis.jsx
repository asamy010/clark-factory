/* ═══════════════════════════════════════════════════════════════════════
   CLARK · DashboardKpis (V21.21.17)
   صفّان من بطاقات KPI أعلى لوحة التحكم: مبيعات · مشتريات · تقييم مخزون · ربح/خسارة.
   كل بطاقة تُضغط → بوب اب بتفاصيل + إجماليات + طباعة + PDF.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { fmt } from "../utils/format.js";
import { printPage } from "../utils/print.js";
import { computeDashboardKpis } from "../utils/dashboardKpis.js";

const _esc = (s) => String(s == null ? "" : s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

export function DashboardKpis({ data, isMob }){
  const k = useMemo(() => computeDashboardKpis(data), [data]);
  const [popup, setPopup] = useState(null); /* {title,color,columns,rows,summary,note} */

  const money = (n) => fmt(Number(n) || 0) + " ج.م";

  /* بطاقة KPI */
  const Card = ({ label, value, color, sub, onClick, big }) => (
    <div onClick={onClick} style={{
      flex: isMob ? "1 1 45%" : "1 1 150px", minWidth: isMob ? 0 : 140, cursor: "pointer",
      background: big ? "linear-gradient(135deg," + color + "," + color + "CC)" : T.cardSolid,
      border: big ? "none" : "1px solid " + (color || T.brd) + "40", borderRadius: 13, padding: 13,
      boxShadow: big ? "0 4px 16px " + color + "55" : "none", transition: "transform .12s",
    }}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "none"; }}>
      <div style={{ fontSize: FS - 2, color: big ? "rgba(255,255,255,.9)" : T.textSec, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
      <div style={{ fontSize: isMob ? 17 : (big ? 24 : 20), fontWeight: 900, marginTop: 4, color: big ? "#fff" : (color || T.text) }}>{fmt(Number(value) || 0)}<span style={{ fontSize: FS - 3, fontWeight: 600, opacity: .7 }}> ج.م</span></div>
      {sub && <div style={{ fontSize: FS - 3, marginTop: 2, fontWeight: 700, color: big ? "rgba(255,255,255,.85)" : T.textMut }}>{sub}</div>}
    </div>
  );

  const rowStyle = { display: "flex", flexWrap: isMob ? "wrap" : "nowrap", gap: 8, marginBottom: 10, overflowX: isMob ? "visible" : "auto", paddingBottom: isMob ? 0 : 2 };

  /* تجهيز بوب اب لكل بطاقة */
  const open = (cfg) => setPopup(cfg);
  const partyCols = (valLabels) => [{ key: "name", label: "الاسم", align: "right" }, ...valLabels];

  const salesPopup = () => open({
    title: "تفاصيل المبيعات حسب العميل", color: "#0EA5E9",
    columns: partyCols([{ key: "sales", label: "مبيعات" }, { key: "returns", label: "مرتجع" }, { key: "net", label: "صافي" }, { key: "paid", label: "مدفوع" }, { key: "balance", label: "الرصيد" }]),
    rows: k.sales.detail,
    summary: [["إجمالي المبيعات", k.sales.total], ["مرتجع المبيعات", k.sales.returns], ["المبيعات الفعلية", k.sales.net], ["رصيد عند العملاء", k.sales.balance]],
  });
  const purchasesPopup = () => open({
    title: "تفاصيل المشتريات حسب المورد", color: "#D97706",
    columns: partyCols([{ key: "purchases", label: "مشتريات" }, { key: "paid", label: "مدفوع" }, { key: "balance", label: "الرصيد" }]),
    rows: k.purchases.detail,
    summary: [["إجمالي المشتريات", k.purchases.total], ["مرتجع المشتريات", k.purchases.returns], ["المشتريات الفعلية", k.purchases.net], ["رصيد الموردين المستحق", k.purchases.payable]],
  });
  const invCols = [{ key: "name", label: "الصنف", align: "right" }, { key: "qty", label: "الكمية", money: false }, { key: "unitCost", label: "تكلفة الوحدة" }, { key: "value", label: "القيمة" }];
  const finishedPopup = () => open({ title: "تقييم المخزون الجاهز (بالتكلفة)", color: "#10B981", columns: invCols, rows: k.inventory.finishedDetail, summary: [["إجمالي تقييم الجاهز", k.inventory.finished]] });
  const fabricPopup = () => open({ title: "تقييم مخزون القماش (بالتكلفة)", color: "#0EA5E9", columns: invCols, rows: k.inventory.fabricDetail, summary: [["إجمالي تقييم القماش", k.inventory.fabric]] });
  const accessoryPopup = () => open({ title: "تقييم مخزون الإكسسوار (بالتكلفة)", color: "#8B5CF6", columns: invCols, rows: k.inventory.accessoryDetail, summary: [["إجمالي تقييم الإكسسوار", k.inventory.accessory]] });
  const invTotalPopup = () => open({
    title: "إجمالي تقييم المخزون (جاهز + خامات)", color: "#0EA5E9",
    columns: [{ key: "name", label: "النوع", align: "right" }, { key: "value", label: "القيمة بالتكلفة" }],
    rows: [{ name: "🏭 مخزون جاهز", value: k.inventory.finished }, { name: "🧵 قماش", value: k.inventory.fabric }, { name: "🧷 إكسسوار", value: k.inventory.accessory }, ...(k.inventory.other ? [{ name: "📦 خامات أخرى", value: k.inventory.other }] : [])],
    summary: [["إجمالي تقييم المخزون", k.inventory.total]],
  });
  const profitPopup = () => open({
    title: "حساب الربح / الخسارة (مجمل النشاط التجاري)", color: k.profit.value >= 0 ? "#10B981" : "#EF4444",
    columns: [{ key: "name", label: "البند", align: "right" }, { key: "value", label: "القيمة" }],
    rows: [
      { name: "＋ المبيعات الفعلية (مبيعات − مرتجع)", value: k.profit.salesNet },
      { name: "－ المشتريات الفعلية (مشتريات − مرتجع)", value: -k.profit.buyNet },
      { name: "＋ إجمالي تقييم المخزون (بالتكلفة)", value: k.profit.inventoryTotal },
    ],
    summary: [[(k.profit.value >= 0 ? "صافي الربح" : "صافي الخسارة"), k.profit.value]],
    note: "المعادلة: الربح = المبيعات الفعلية − المشتريات الفعلية + إجمالي تقييم المخزون. ⚠️ ده مجمل الربح من النشاط التجاري ولا يشمل المصروفات التشغيلية (إيجار/رواتب/مصاريف). للربح الصافي راجع المحاسبة.",
  });

  /* طباعة البوب اب */
  const printPopup = () => {
    if(!popup) return;
    const cols = popup.columns;
    let h = "<h2 style='text-align:center'>" + _esc(popup.title) + "</h2>";
    if(popup.note) h += "<p style='font-size:11px;color:#555;background:#f7f7f7;padding:8px;border-radius:6px'>" + _esc(popup.note) + "</p>";
    h += "<table style='width:100%;border-collapse:collapse;font-size:12px'><thead><tr style='background:#1e293b;color:#fff'>";
    cols.forEach(c => { h += "<th style='padding:6px;border:1px solid #ddd;text-align:" + (c.align || "center") + "'>" + _esc(c.label) + "</th>"; });
    h += "</tr></thead><tbody>";
    (popup.rows || []).forEach((row, i) => {
      h += "<tr style='background:" + (i % 2 ? "#f8fafc" : "#fff") + "'>";
      cols.forEach(c => { const raw = row[c.key]; const txt = (c.money === false) ? fmt(Number(raw) || 0) : (typeof raw === "number" ? fmt(raw) + " ج.م" : _esc(raw)); h += "<td style='padding:5px;border:1px solid #eee;text-align:" + (c.align || "center") + "'>" + txt + "</td>"; });
      h += "</tr>";
    });
    h += "</tbody></table>";
    if(popup.summary){ h += "<table style='width:100%;border-collapse:collapse;margin-top:12px;font-size:13px'>"; popup.summary.forEach(([lab, val], idx) => { const last = idx === popup.summary.length - 1; h += "<tr><td style='padding:7px;border:1px solid #ddd;font-weight:" + (last ? 800 : 600) + ";background:" + (last ? "#f0f9ff" : "#fff") + "'>" + _esc(lab) + "</td><td style='padding:7px;border:1px solid #ddd;text-align:left;font-weight:800;background:" + (last ? "#f0f9ff" : "#fff") + "'>" + fmt(Number(val) || 0) + " ج.م</td></tr>"; }); h += "</table>"; }
    printPage(popup.title, h, { factoryName: data.factoryName, logo: data.logo });
  };

  return (
    <div style={{ marginBottom: 16 }}>
      {/* صف المبيعات */}
      <div style={rowStyle}>
        <Card label="🛍️ إجمالي مبيعات" value={k.sales.total} color="#0EA5E9" onClick={salesPopup} />
        <Card label="↩️ مرتجع مبيعات" value={k.sales.returns} color="#EF4444" onClick={salesPopup} />
        <Card label="💰 مبيعات فعلية" value={k.sales.net} color="#10B981" sub="مبيعات − مرتجع" onClick={salesPopup} />
        <Card label="⚖️ رصيد عند العملاء" value={k.sales.balance} color="#0EA5E9" onClick={salesPopup} />
      </div>
      {/* صف المشتريات */}
      <div style={rowStyle}>
        <Card label="🛒 إجمالي مشتريات" value={k.purchases.total} color="#D97706" onClick={purchasesPopup} />
        <Card label="↪️ مرتجع مشتريات" value={k.purchases.returns} color="#EF4444" onClick={purchasesPopup} />
        <Card label="📦 مشتريات فعلية" value={k.purchases.net} color="#D97706" sub="مشتريات − مرتجع" onClick={purchasesPopup} />
        <Card label="💸 رصيد موردين مستحق" value={k.purchases.payable} color="#EF4444" onClick={purchasesPopup} />
      </div>
      {/* صف المخزون + الربح */}
      <div style={rowStyle}>
        <Card label="🏭 تقييم مخزن جاهز" value={k.inventory.finished} color="#10B981" onClick={finishedPopup} />
        <Card label="🧵 تقييم مخزن القماش" value={k.inventory.fabric} color="#0EA5E9" onClick={fabricPopup} />
        <Card label="🧷 تقييم مخزن الإكسسوار" value={k.inventory.accessory} color="#8B5CF6" onClick={accessoryPopup} />
        <Card label="📊 إجمالي تقييم المخزون" value={k.inventory.total} color="#0284C7" onClick={invTotalPopup} />
        <Card label={(k.profit.value >= 0 ? "🟢 الربح" : "🔴 الخسارة")} value={k.profit.value} color={k.profit.value >= 0 ? "#10B981" : "#EF4444"} sub={k.profit.value >= 0 ? "ربح حتى الآن" : "خسارة حتى الآن"} big onClick={profitPopup} />
      </div>

      {/* البوب اب */}
      {popup && (
        <div className="pop-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 99998, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setPopup(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.cardSolid, borderRadius: 16, width: "100%", maxWidth: 720, maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid " + T.brd }}>
              <div style={{ fontSize: FS + 1, fontWeight: 800, color: popup.color }}>{popup.title}</div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={printPopup} style={{ background: T.accent + "12", color: T.accent, border: "1px solid " + T.accent + "30", borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontFamily: "inherit", fontSize: FS - 1, fontWeight: 700 }}>🖨 طباعة / PDF</button>
                <button onClick={() => setPopup(null)} style={{ background: T.bg, color: T.textSec, border: "1px solid " + T.brd, borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontFamily: "inherit", fontSize: FS - 1 }}>✕</button>
              </div>
            </div>
            <div style={{ padding: 16, overflowY: "auto" }}>
              {popup.note && <div style={{ fontSize: FS - 2, color: T.textSec, background: T.bg, border: "1px solid " + T.brd, borderRadius: 8, padding: "8px 10px", marginBottom: 12, lineHeight: 1.7 }}>{popup.note}</div>}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FS - 2 }}>
                  <thead><tr style={{ background: T.bg }}>
                    {popup.columns.map(c => <th key={c.key} style={{ padding: "7px", borderBottom: "2px solid " + T.brd, textAlign: c.align || "center", whiteSpace: "nowrap" }}>{c.label}</th>)}
                  </tr></thead>
                  <tbody>
                    {popup.rows.length === 0
                      ? <tr><td colSpan={popup.columns.length} style={{ padding: 20, textAlign: "center", color: T.textMut }}>لا توجد تفاصيل</td></tr>
                      : popup.rows.slice(0, 300).map((row, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid " + T.brd }}>
                          {popup.columns.map(c => {
                            const raw = row[c.key];
                            const txt = (c.money === false) ? fmt(Number(raw) || 0) : (typeof raw === "number" ? money(raw) : raw);
                            const neg = typeof raw === "number" && raw < 0;
                            return <td key={c.key} style={{ padding: "6px 7px", textAlign: c.align || "center", color: neg ? T.err : T.text, fontWeight: c.key === "name" ? 700 : 600, whiteSpace: c.key === "name" ? "normal" : "nowrap" }}>{txt}</td>;
                          })}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {popup.summary && (
                <div style={{ marginTop: 14, borderTop: "2px solid " + T.brd, paddingTop: 10 }}>
                  {popup.summary.map(([lab, val], idx) => {
                    const last = idx === popup.summary.length - 1;
                    return <div key={idx} style={{ display: "flex", justifyContent: "space-between", padding: "5px 4px", fontWeight: last ? 900 : 700, fontSize: last ? FS + 2 : FS - 1, color: last ? popup.color : T.text }}>
                      <span>{lab}</span><span style={{ direction: "ltr" }}>{money(val)}</span>
                    </div>;
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
