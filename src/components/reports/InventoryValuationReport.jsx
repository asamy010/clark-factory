/* ═══════════════════════════════════════════════════════════════════════
   CLARK · InventoryValuationReport (V21.16.0 — Phase 14a)
   تقرير تقييم المخزون — قراءة فقط (view-only، صفر mutation).

   kind="finished"  → المنتجات الجاهزة (هَب المبيعات): الكمية × سعر البيع
                      (قيمة بيع) + الكمية × التكلفة المحسوبة (قيمة تكلفة) + الربح.
                      الكمية = رصيد المخزن الجاهز = getConfirmedStock(o) −
                      تسليمات العملاء (نفس معادلة orders.js:808-810).
   kind="materials" → الخامات + الإكسسوار (هَب المشتريات): الرصيد ×
                      (avgCost‖price) = قيمة التكلفة. (مواد خام بلا سعر بيع.)
   ═══════════════════════════════════════════════════════════════════════ */

import { Fragment, useMemo, useState } from "react";
import { Btn, Card, Inp } from "../ui.jsx";
import { T } from "../../theme.js";
import { FS } from "../../constants/index.js";
import { fmt, r2 } from "../../utils/format.js";
import { getConfirmedStock, getConfirmedSeriesStock, calcOrder, orderCostPerPiece } from "../../utils/orders.js";
import { computeStockNetMap, netStockOf } from "../../utils/stockLedger.js";
import { VALUATION_POLICIES, valuateItem } from "../../utils/accounting/inventoryPolicies.js";
import { showToast } from "../../utils/popups.js";
import { printPage } from "../../utils/print.js";
import { exportExcel } from "../../utils/print-extras.js";

export function InventoryValuationReport({ data, kind = "finished", isMob }){
  const [q, setQ] = useState("");
  const [stockType, setStockType] = useState("series"); /* series | broken | all */
  const [groupByModel, setGroupByModel] = useState(true); /* V21.22.5: الجرد بالموديل (افتراضي) */
  const [expanded, setExpanded] = useState(() => new Set()); /* modelNo المفتوحة لعرض أوامرها */
  /* V21.27.130: سياسة تقييم الخامات/الإكسسوار (none|average|fifo|lifo) */
  const [policy, setPolicy] = useState("none");
  const accent = kind === "finished" ? "#0EA5E9" : "#D97706";
  const policyMeta = VALUATION_POLICIES.find(p => p.key === policy) || VALUATION_POLICIES[0];

  /* ── المنتجات الجاهزة (سيري + كسر كصفوف منفصلة) ── */
  const finished = useMemo(() => {
    if(kind !== "finished") return { rows: [] };
    /* V21.20.5: كميات أوامر البيع المحجوزة («أمر البيع = بيع») تُطرح من المتاح */
    const soReserved = {};
    (data.salesOrders || []).forEach(so => { if(!so || so.status === "cancelled") return; if(so.sourceDistributionId) return; /* V21.21.1: مرآة توزيعة لا تُحتسب */ (so.items || []).forEach(it => { if(it && it.sourceType === "order" && it.sourceId) soReserved[it.sourceId] = (soReserved[it.sourceId] || 0) + (Number(it.qty) || 0); }); /* V21.27.97: مرتجعات الأمر المباشر تُطرح */ (so.returns || []).forEach(rr => { if(rr && rr.sourceId) soReserved[rr.sourceId] = (soReserved[rr.sourceId] || 0) - (Number(rr.qty) || 0); }); });
    const rows = [];
    (data.orders || []).forEach(o => {
      /* الرصيد الفعلي للمخزن الجاهز — مطابق لـ «الموديلات المتاحة» (CustDeliverPg
         stockModels + popup): net = تسليمات − مرتجعات ، avail = الإجمالي ،
         availSeries = السيري المتاح ، availBroken = الكسر المتاح. */
      const sd = getConfirmedStock(o); if(sd <= 0) return;
      const cd = (o.customerDeliveries || []).reduce((s, d) => s + (Number(d.qty) || 0), 0);
      const ret = (o.customerReturns || []).reduce((s, r) => s + (Number(r.qty) || 0), 0);
      const net = cd - ret + (soReserved[o.id] || 0);
      const avail = sd - net;
      if(avail <= 0) return; /* مطابق لفلتر popup (m.avail > 0) */
      const availSeries = Math.max(0, getConfirmedSeriesStock(o) - net);
      const availBroken = Math.max(0, avail - availSeries);
      const sell = Number(o.sellPrice) || 0;
      /* V21.27.128: تكلفة الوحدة = نفس رقم «تكلفة القطعة» في الأمر بالضبط. */
      let cost = 0; try { cost = orderCostPerPiece(o); } catch(_) {}
      const mk = (type, qty) => ({ id: o.id + "-" + type, oid: o.id, poNumber: o.poNumber || "", type, modelNo: o.modelNo || "—", modelDesc: o.modelDesc || "", qty,
        sell: r2(sell), cost: r2(cost), sellVal: r2(qty * sell), costVal: r2(qty * cost), profit: r2(qty * (sell - cost)) });
      if(availSeries > 0) rows.push(mk("series", availSeries));
      if(availBroken > 0) rows.push(mk("broken", availBroken));
    });
    rows.sort((a, b) => b.sellVal - a.sellVal);
    return { rows };
  }, [kind, data.orders]);

  /* ── الخامات + الإكسسوار ──
     V21.27.130: الرصيد = صافي حركات المخزون (استلامات+إذونات+مرتجعات)، والقيمة
     حسب سياسة التسعير المختارة (بدون/متوسط/FIFO/LIFO). */
  const matNetMap = useMemo(() => computeStockNetMap(data.stockMovements), [data.stockMovements]);
  const materials = useMemo(() => {
    if(kind !== "materials") return [];
    const moves = data.stockMovements || [];
    const mk = (arr, label, icon) => {
      const rows = (arr || []).map(x => {
        const qty = netStockOf(matNetMap, x);
        const v = valuateItem(x, qty, moves, policy);
        return { id: x.id, name: x.name || "—", qty, unit: x.unit || "", unitCost: r2(v.unitCost), value: r2(v.value) };
      }).filter(r => r.qty !== 0);
      rows.sort((a, b) => b.value - a.value);
      return { label, icon, rows, total: r2(rows.reduce((s, r) => s + r.value, 0)), count: rows.length, qtyNeg: rows.some(r => r.qty < 0) };
    };
    return [mk(data.fabrics, "الخامات", "🧵"), mk(data.accessories, "الإكسسوار", "🧷")];
  }, [kind, data.fabrics, data.accessories, data.stockMovements, matNetMap, policy]);

  const matchesQ = (s) => !q.trim() || String(s || "").toLowerCase().includes(q.trim().toLowerCase());
  const fRows = finished.rows
    .filter(r => stockType === "all" || r.type === stockType)
    .filter(r => matchesQ(r.modelNo) || matchesQ(r.modelDesc));
  const fTot = fRows.reduce((t, r) => ({ qty: t.qty + r.qty, sellVal: r2(t.sellVal + r.sellVal), costVal: r2(t.costVal + r.costVal), profit: r2(t.profit + r.profit) }), { qty: 0, sellVal: 0, costVal: 0, profit: 0 });
  const seriesQty = fRows.filter(r => r.type === "series").reduce((s, r) => s + r.qty, 0);
  const brokenQty = fRows.filter(r => r.type === "broken").reduce((s, r) => s + r.qty, 0);
  const modelCount = new Set(fRows.map(r => r.modelNo)).size; /* V21.22.5: عدد الموديلات الحقيقي (كان بيعد الأوامر) */
  /* V21.22.5 — تجميع الجرد بالموديل: كل modelNo صف واحد = مجموع أوامره.
     السعر/التكلفة المعروضة = متوسط مرجّح (للعرض فقط — مش COGS). الأوامر
     المساهمة بتظهر كمعلومة (توسعة). */
  const fModels = useMemo(() => {
    const m = {};
    fRows.forEach(r => {
      const k = r.modelNo;
      if(!m[k]) m[k] = { modelNo: r.modelNo, modelDesc: r.modelDesc, qty: 0, sellVal: 0, costVal: 0, profit: 0, oids: new Set(), orders: [] };
      const g = m[k];
      g.qty += r.qty; g.sellVal = r2(g.sellVal + r.sellVal); g.costVal = r2(g.costVal + r.costVal); g.profit = r2(g.profit + r.profit);
      if(!g.oids.has(r.oid)){ g.oids.add(r.oid); g.orders.push({ oid: r.oid, poNumber: r.poNumber, qty: 0 }); }
      const ord = g.orders.find(x => x.oid === r.oid); if(ord) ord.qty += r.qty;
    });
    return Object.values(m).map(g => ({ ...g, orderCount: g.oids.size, sell: g.qty > 0 ? r2(g.sellVal / g.qty) : 0, cost: g.qty > 0 ? r2(g.costVal / g.qty) : 0 })).sort((a, b) => b.sellVal - a.sellVal);
  }, [fRows]);
  const showType = stockType === "all" && !groupByModel;
  const TYPE_LBL = { series: "سيري", broken: "كسر" };
  const matFiltered = materials.map(sec => ({ ...sec, vRows: sec.rows.filter(r => matchesQ(r.name)) }));
  const matGrand = r2(materials.reduce((s, sec) => s + sec.total, 0));

  /* ── طباعة + Excel ── */
  const doPrint = () => {
    let h = `<h2 style="color:${accent};text-align:center">📈 تقييم المخزون — ${kind === "finished" ? "المنتجات الجاهزة" : "الخامات والإكسسوار"}</h2>`;
    h += `<div style="text-align:center;font-size:11px;color:#64748b;margin-bottom:10px">${new Date().toLocaleDateString("en-GB")}</div>`;
    const tbl = (head, body, foot) => `<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px"><thead><tr style="background:${accent};color:#fff">${head.map(x => `<th style="padding:6px;border:1px solid #cbd5e1">${x}</th>`).join("")}</tr></thead><tbody>${body}</tbody>${foot || ""}</table>`;
    if(kind === "finished"){
      const td0 = 'style="border:1px solid #e2e8f0;padding:5px"';
      const tdC = 'style="border:1px solid #e2e8f0;padding:5px;text-align:center"';
      const body = fRows.map(r => `<tr><td ${td0}>${r.modelNo}</td>${showType ? `<td ${tdC}>${TYPE_LBL[r.type]}</td>` : ""}<td ${tdC}>${fmt(r.qty)}</td><td ${tdC}>${fmt(r.sell)}</td><td ${tdC}>${fmt(r.cost)}</td><td ${tdC}>${fmt(r.sellVal)}</td><td ${tdC}>${fmt(r.costVal)}</td><td ${tdC}>${fmt(r.profit)}</td></tr>`).join("");
      const foot = `<tfoot><tr style="background:#eff6ff;font-weight:800"><td colspan="${showType ? 2 : 1}" style="padding:6px;border:1px solid #cbd5e1">الإجمالي (${modelCount} موديل)</td><td style="padding:6px;border:1px solid #cbd5e1;text-align:center">${fmt(fTot.qty)}</td><td colspan="2" style="border:1px solid #cbd5e1"></td><td style="padding:6px;border:1px solid #cbd5e1;text-align:center">${fmt(fTot.sellVal)}</td><td style="padding:6px;border:1px solid #cbd5e1;text-align:center">${fmt(fTot.costVal)}</td><td style="padding:6px;border:1px solid #cbd5e1;text-align:center">${fmt(fTot.profit)}</td></tr></tfoot>`;
      const head = ["الموديل"]; if(showType) head.push("النوع"); head.push("الكمية", "سعر البيع", "التكلفة", "قيمة البيع", "قيمة التكلفة", "الربح المتوقع");
      h += `<div style="text-align:center;font-size:11px;color:#64748b;margin-bottom:6px">النوع المعروض: ${stockType === "all" ? "سيري + كسر" : TYPE_LBL[stockType]}</div>`;
      h += tbl(head, body, foot);
    } else {
      h += `<div style="text-align:center;font-size:11px;color:#64748b;margin-bottom:6px">سياسة التقييم: <b>${policyMeta.label}</b></div>`;
      matFiltered.forEach(sec => {
        h += `<h3 style="color:${accent}">${sec.icon} ${sec.label}</h3>`;
        const body = sec.vRows.map(r => `<tr><td style="border:1px solid #e2e8f0;padding:5px">${r.name}</td><td style="border:1px solid #e2e8f0;padding:5px;text-align:center">${fmt(r.qty)} ${r.unit}</td><td style="border:1px solid #e2e8f0;padding:5px;text-align:center">${fmt(r.unitCost)}</td><td style="border:1px solid #e2e8f0;padding:5px;text-align:center">${fmt(r.value)}</td></tr>`).join("");
        const foot = `<tfoot><tr style="background:#fff7ed;font-weight:800"><td colspan="3" style="padding:6px;border:1px solid #cbd5e1">إجمالي ${sec.label} (${sec.vRows.length})</td><td style="padding:6px;border:1px solid #cbd5e1;text-align:center">${fmt(sec.total)}</td></tr></tfoot>`;
        h += tbl(["الصنف", "الرصيد", "تكلفة الوحدة" + (policy !== "none" ? " (" + policyMeta.short + ")" : ""), "القيمة"], body, foot);
      });
      h += `<h3 style="text-align:left;color:${accent}">الإجمالي الكلي: ${fmt(matGrand)} ج.م</h3>`;
    }
    printPage("تقييم المخزون", h, { factoryName: data.factoryName, logo: data.logo });
  };

  const doExcel = async () => {
    try {
      const aoa = [];
      if(kind === "finished"){
        aoa.push(["تقييم المخزون — المنتجات الجاهزة (" + (stockType === "all" ? "سيري + كسر" : TYPE_LBL[stockType]) + ")"], []);
        aoa.push(showType ? ["الموديل", "النوع", "الكمية", "سعر البيع", "التكلفة", "قيمة البيع", "قيمة التكلفة", "الربح المتوقع"] : ["الموديل", "الكمية", "سعر البيع", "التكلفة", "قيمة البيع", "قيمة التكلفة", "الربح المتوقع"]);
        fRows.forEach(r => aoa.push(showType ? [r.modelNo, TYPE_LBL[r.type], r.qty, r.sell, r.cost, r.sellVal, r.costVal, r.profit] : [r.modelNo, r.qty, r.sell, r.cost, r.sellVal, r.costVal, r.profit]));
        aoa.push(showType ? ["الإجمالي", "", fTot.qty, "", "", fTot.sellVal, fTot.costVal, fTot.profit] : ["الإجمالي", fTot.qty, "", "", fTot.sellVal, fTot.costVal, fTot.profit]);
      } else {
        aoa.push(["تقييم المخزون — الخامات والإكسسوار — سياسة: " + policyMeta.label], []);
        matFiltered.forEach(sec => {
          aoa.push([sec.label]);
          aoa.push(["الصنف", "الرصيد", "الوحدة", "تكلفة الوحدة" + (policy !== "none" ? " (" + policyMeta.short + ")" : ""), "القيمة"]);
          sec.vRows.forEach(r => aoa.push([r.name, r.qty, r.unit, r.unitCost, r.value]));
          aoa.push(["إجمالي " + sec.label, "", "", "", sec.total], []);
        });
        aoa.push(["الإجمالي الكلي", "", "", "", matGrand]);
      }
      await exportExcel(aoa, "تقييم-المخزون-" + (kind === "finished" ? "جاهز" : "خامات"));
    } catch(e){ showToast("⛔ تعذّر التصدير: " + (e?.message || e)); }
  };

  const th = { padding: "8px 6px", fontSize: FS - 2, fontWeight: 800, color: "#fff", textAlign: "center", whiteSpace: "nowrap" };
  const td = { padding: "6px", fontSize: FS - 1, borderBottom: "1px solid " + T.brd, textAlign: "center" };

  const KPI = ({ label, value, color, suffix }) => (
    <div style={{ flex: 1, minWidth: 140, padding: "10px 14px", background: (color || accent) + "10", borderRadius: 10, border: "1px solid " + (color || accent) + "30" }}>
      <div style={{ fontSize: FS - 3, color: T.textSec, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: FS + 4, fontWeight: 900, color: color || accent }}>{fmt(value)}<span style={{ fontSize: FS - 3, marginInlineStart: 4 }}>{suffix || "ج.م"}</span></div>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ fontSize: FS + 2, fontWeight: 800, color: accent }}>📈 تقييم المخزون — {kind === "finished" ? "المنتجات الجاهزة" : "الخامات والإكسسوار"}</div>
        {kind === "finished" && (
          <div style={{ display: "flex", gap: 4, background: T.bg, borderRadius: 9, padding: 3, border: "1px solid " + T.brd }}>
            {[["series", "سيري"], ["broken", "كسر"], ["all", "الكل"]].map(([v, l]) => (
              <div key={v} onClick={() => setStockType(v)} style={{ padding: "5px 14px", borderRadius: 7, fontSize: FS - 1, fontWeight: 700, cursor: "pointer", background: stockType === v ? accent : "transparent", color: stockType === v ? "#fff" : T.textSec }}>{l}</div>
            ))}
          </div>
        )}
        {kind === "finished" && (
          <div style={{ display: "flex", gap: 4, background: T.bg, borderRadius: 9, padding: 3, border: "1px solid " + T.brd }}>
            {[[true, "🧩 بالموديل"], [false, "📋 بالأوردر"]].map(([v, l]) => (
              <div key={String(v)} onClick={() => setGroupByModel(v)} style={{ padding: "5px 12px", borderRadius: 7, fontSize: FS - 1, fontWeight: 700, cursor: "pointer", background: groupByModel === v ? "#8B5CF6" : "transparent", color: groupByModel === v ? "#fff" : T.textSec }}>{l}</div>
            ))}
          </div>
        )}
        <div style={{ marginInlineStart: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Btn small onClick={doPrint} style={{ background: T.accentBg, color: T.accent }}>🖨 طباعة</Btn>
          <Btn small onClick={doExcel} style={{ background: "#10B98112", color: "#059669", border: "1px solid #10B98130" }}>📊 Excel</Btn>
        </div>
      </div>

      {/* KPIs */}
      {kind === "finished" ? (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <KPI label="عدد الموديلات" value={modelCount} color={T.textSec} suffix="موديل" />
          {stockType !== "broken" && <KPI label="السيري المتاح" value={seriesQty} color="#6366F1" suffix="قطعة" />}
          {stockType !== "series" && <KPI label="الكسر المتاح" value={brokenQty} color="#8B5CF6" suffix="قطعة" />}
          <KPI label="قيمة البيع (المتوقعة)" value={fTot.sellVal} color="#0EA5E9" />
          <KPI label="قيمة التكلفة" value={fTot.costVal} color="#D97706" />
          <KPI label="الربح المتوقع" value={fTot.profit} color="#10B981" />
        </div>
      ) : (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <KPI label="قيمة الخامات" value={materials[0]?.total || 0} color="#D97706" />
          <KPI label="قيمة الإكسسوار" value={materials[1]?.total || 0} color="#8B5CF6" />
          <KPI label="إجمالي قيمة المواد" value={matGrand} color="#0EA5E9" />
        </div>
      )}

      {/* V21.27.130: منتقي سياسة التقييم — للخامات/الإكسسوار فقط */}
      {kind === "materials" && <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 10, background: T.bg, border: "1px solid " + T.brd }}>
        <div style={{ fontSize: FS - 2, fontWeight: 700, color: T.textSec, marginBottom: 8 }}>📐 سياسة تقييم المخزون <span style={{ fontWeight: 600, color: T.textMut }}>(عند اختلاف الأسعار وتقادم المخزون)</span></div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {VALUATION_POLICIES.map(p => {
            const active = policy === p.key;
            return <div key={p.key} onClick={() => setPolicy(p.key)} title={p.desc} style={{ cursor: "pointer", padding: "7px 14px", borderRadius: 9, fontSize: FS - 1, fontWeight: 700, border: "1.5px solid " + (active ? accent : T.brd), background: active ? accent : T.cardSolid, color: active ? "#fff" : T.text, transition: "all .15s" }}>{p.label}</div>;
          })}
        </div>
        <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 8, lineHeight: 1.6 }}>{policyMeta.desc}</div>
      </div>}

      <div style={{ marginBottom: 10, maxWidth: 320 }}>
        <Inp value={q} onChange={setQ} placeholder={kind === "finished" ? "بحث بالموديل..." : "بحث بالصنف..."} />
      </div>

      {kind === "finished" ? (
        <Card>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
              <thead><tr style={{ background: accent }}>
                <th style={{ ...th, textAlign: "right" }}>الموديل</th>{showType && <th style={th}>النوع</th>}<th style={th}>الكمية</th><th style={th}>سعر البيع</th><th style={th}>التكلفة</th>
                <th style={th}>قيمة البيع</th><th style={th}>قيمة التكلفة</th><th style={th}>الربح المتوقع</th>
              </tr></thead>
              <tbody>
                {(groupByModel ? fModels : fRows).length === 0 ? (
                  <tr><td colSpan={showType ? 8 : 7} style={{ ...td, textAlign: "center", color: T.textMut, padding: 24 }}>لا يوجد مخزون</td></tr>
                ) : groupByModel ? fModels.map(g => {
                  const open = expanded.has(g.modelNo);
                  return <Fragment key={g.modelNo}>
                    <tr>
                      <td style={{ ...td, textAlign: "right" }}>
                        <span style={{ fontWeight: 700 }}>{g.modelNo}</span>{g.modelDesc && <span style={{ color: T.textMut, fontSize: FS - 3 }}> — {g.modelDesc}</span>}
                        <span onClick={() => setExpanded(s => { const n = new Set(s); if(n.has(g.modelNo)) n.delete(g.modelNo); else n.add(g.modelNo); return n; })}
                          title="عرض الأوامر المساهمة" style={{ marginInlineStart: 8, cursor: "pointer", fontSize: FS - 3, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "#8B5CF615", color: "#8B5CF6", border: "1px solid #8B5CF630", whiteSpace: "nowrap" }}>🔗 {g.orderCount} أمر {open ? "▴" : "▾"}</span>
                      </td>
                      <td style={{ ...td, fontWeight: 700 }}>{fmt(g.qty)}</td>
                      <td style={td}>{fmt(g.sell)}</td><td style={td}>{fmt(g.cost)}</td>
                      <td style={{ ...td, color: "#0EA5E9", fontWeight: 700 }}>{fmt(g.sellVal)}</td>
                      <td style={{ ...td, color: "#D97706" }}>{fmt(g.costVal)}</td>
                      <td style={{ ...td, color: g.profit >= 0 ? T.ok : T.err, fontWeight: 700 }}>{fmt(g.profit)}</td>
                    </tr>
                    {open && <tr><td colSpan={7} style={{ padding: "4px 10px 10px 24px", background: T.bg, borderBottom: "1px solid " + T.brd }}>
                      <div style={{ fontSize: FS - 3, color: T.textSec, marginBottom: 4, fontWeight: 600 }}>الأوامر المساهمة (معلومة فقط):</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {g.orders.map(ord => <span key={ord.oid} style={{ fontSize: FS - 3, fontWeight: 600, padding: "3px 9px", borderRadius: 8, background: T.cardSolid, border: "1px solid " + T.brd }}>{ord.poNumber || ord.oid} · <b style={{ color: accent }}>{fmt(ord.qty)}</b> قطعة</span>)}
                      </div>
                    </td></tr>}
                  </Fragment>;
                }) : fRows.map(r => (
                  <tr key={r.id}>
                    <td style={{ ...td, textAlign: "right" }}>{r.modelNo}{r.modelDesc && <span style={{ color: T.textMut, fontSize: FS - 3 }}> — {r.modelDesc}</span>}</td>
                    {showType && <td style={td}><span style={{ fontSize: FS - 3, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: (r.type === "series" ? "#6366F1" : "#8B5CF6") + "18", color: r.type === "series" ? "#6366F1" : "#8B5CF6" }}>{TYPE_LBL[r.type]}</span></td>}
                    <td style={{ ...td, fontWeight: 700 }}>{fmt(r.qty)}</td>
                    <td style={td}>{fmt(r.sell)}</td><td style={td}>{fmt(r.cost)}</td>
                    <td style={{ ...td, color: "#0EA5E9", fontWeight: 700 }}>{fmt(r.sellVal)}</td>
                    <td style={{ ...td, color: "#D97706" }}>{fmt(r.costVal)}</td>
                    <td style={{ ...td, color: r.profit >= 0 ? T.ok : T.err, fontWeight: 700 }}>{fmt(r.profit)}</td>
                  </tr>
                ))}
              </tbody>
              {fRows.length > 0 && <tfoot><tr style={{ background: T.accentBg }}>
                <td colSpan={showType ? 2 : 1} style={{ ...td, textAlign: "right", fontWeight: 800, color: accent }}>الإجمالي ({modelCount} موديل)</td>
                <td style={{ ...td, fontWeight: 800 }}>{fmt(fTot.qty)}</td>
                <td colSpan={2} style={td}></td>
                <td style={{ ...td, fontWeight: 900, color: "#0EA5E9" }}>{fmt(fTot.sellVal)}</td>
                <td style={{ ...td, fontWeight: 800, color: "#D97706" }}>{fmt(fTot.costVal)}</td>
                <td style={{ ...td, fontWeight: 900, color: T.ok }}>{fmt(fTot.profit)}</td>
              </tr></tfoot>}
            </table>
          </div>
          <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 8 }}>* الكمية = الرصيد المتاح (= المنتَج − المبيعات + المرتجعات) مطابق لـ «الموديلات المتاحة». «سيري» = القابل للبيع كامل، «كسر» = القطع الناقصة. بدّل بين سيري/كسر/الكل من فوق.</div>
        </Card>
      ) : (
        <>
          {matFiltered.map((sec, si) => (
            <Card key={si} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: FS + 1, fontWeight: 800, color: accent, marginBottom: 8 }}>{sec.icon} {sec.label} <span style={{ fontSize: FS - 2, color: T.textMut, fontWeight: 600 }}>({sec.vRows.length})</span></div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 420 }}>
                  <thead><tr style={{ background: accent }}>
                    <th style={{ ...th, textAlign: "right" }}>الصنف</th><th style={th}>الرصيد</th><th style={th}>تكلفة الوحدة{policy !== "none" ? " (" + policyMeta.short + ")" : ""}</th><th style={th}>القيمة</th>
                  </tr></thead>
                  <tbody>
                    {sec.vRows.length === 0 ? (
                      <tr><td colSpan={4} style={{ ...td, textAlign: "center", color: T.textMut, padding: 18 }}>لا يوجد رصيد</td></tr>
                    ) : sec.vRows.map(r => (
                      <tr key={r.id}>
                        <td style={{ ...td, textAlign: "right" }}>{r.name}</td>
                        <td style={{ ...td, fontWeight: 700, color: r.qty < 0 ? T.err : T.text }}>{fmt(r.qty)} <span style={{ fontSize: FS - 3, color: T.textMut }}>{r.unit}</span></td>
                        <td style={td}>{fmt(r.unitCost)}</td>
                        <td style={{ ...td, fontWeight: 700, color: "#D97706" }}>{fmt(r.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {sec.vRows.length > 0 && <tfoot><tr style={{ background: T.accentBg }}>
                    <td colSpan={3} style={{ ...td, textAlign: "right", fontWeight: 800, color: accent }}>إجمالي {sec.label}</td>
                    <td style={{ ...td, fontWeight: 900, color: "#D97706" }}>{fmt(sec.total)}</td>
                  </tr></tfoot>}
                </table>
              </div>
            </Card>
          ))}
          <Card style={{ background: accent + "10", border: "1px solid " + accent + "30" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: FS + 1, fontWeight: 800, color: accent }}>💰 الإجمالي الكلي لقيمة المواد</div>
              <div style={{ fontSize: FS + 5, fontWeight: 900, color: accent }}>{fmt(matGrand)} <span style={{ fontSize: FS - 2 }}>ج.م</span></div>
            </div>
            <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 6 }}>* المواد الخام تُقيّم بالتكلفة (متوسط التكلفة ‖ السعر) — لا يوجد سعر بيع لها.</div>
          </Card>
        </>
      )}
    </div>
  );
}
