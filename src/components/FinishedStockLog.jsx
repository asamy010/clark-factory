/* ═══════════════════════════════════════════════════════════════════════
   CLARK · FinishedStockLog (V21.27.92)
   ───────────────────────────────────────────────────────────────────────
   سجل حركات مخزن الجاهز — مكوّن مشترك بين:
     • «المخزن والجرد» في هَب المبيعات (CustDeliverPg) — داخل بوب اب
     • تبويب الجاهز في «المخزن والجرد والتقارير» (WarehousePg) — داخل Card
   المصدر: data.stockMovements اللي itemType==="order" (حركات الموديلات:
   حجز/إلغاء/حذف أوامر البيع — V21.10.7/V21.27.88). بحث بالكود (modelNo) +
   الاسم/الوصف (modelDesc) + المرجع. الأحدث فوق (sort تنازلي بالـ createdAt
   ثم date). pagination 50 + «عرض المزيد» + طباعة.

   presentational بحت — مفيش mutations. الإثراء بالوصف من orders عبر map
   مبني مرة واحدة (§15 — مفيش lookup غالي لكل صف).
   ═══════════════════════════════════════════════════════════════════════ */
import { useMemo, useState } from "react";
import { Btn, Inp, useDebounced } from "./ui.jsx";
import { FS } from "../constants/index.js";
import { T, TH, TD } from "../theme.js";
import { fmt } from "../utils/format.js";
import { printPage } from "../utils/print.js";

export function FinishedStockLog({ stockMovements, orders, isMob, factoryName, logo }) {
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(50);
  const q = useDebounced(search, 200).trim().toLowerCase();

  /* id → {modelNo, modelDesc} — الحركة بتخزّن itemName=modelNo بس، فبنثري
     بوصف الموديل من orders. single-pass map (مفيش find لكل صف). */
  const info = useMemo(() => {
    const m = {};
    (orders || []).forEach(o => { if (o && o.id) m[o.id] = { modelNo: o.modelNo || "", modelDesc: o.modelDesc || "" }; });
    return m;
  }, [orders]);

  const rows = useMemo(() => {
    let list = (stockMovements || [])
      .filter(m => m && m.itemType === "order")
      .map(m => {
        const inf = info[m.itemId] || {};
        return { ...m, _modelNo: inf.modelNo || m.itemName || "", _modelDesc: inf.modelDesc || "" };
      });
    if (q) list = list.filter(m =>
      (m._modelNo || "").toLowerCase().includes(q) ||
      (m._modelDesc || "").toLowerCase().includes(q) ||
      (m.itemName || "").toLowerCase().includes(q) ||
      (m.notes || "").toLowerCase().includes(q)
    );
    /* الأحدث فوق — createdAt (ISO دقيق) ثم date كـ fallback */
    list.sort((a, b) => (b.createdAt || b.date || "").localeCompare(a.createdAt || a.date || ""));
    return list;
  }, [stockMovements, info, q]);

  const shown = rows.slice(0, limit);
  const totalIn = rows.filter(m => m.type === "in").reduce((s, m) => s + Math.abs(Number(m.qty) || 0), 0);
  const totalOut = rows.filter(m => m.type === "out").reduce((s, m) => s + Math.abs(Number(m.qty) || 0), 0);

  const moveMeta = (m) => m.type === "in" ? { icon: "↓", color: T.ok, label: "دخول" }
    : m.type === "out" ? { icon: "↑", color: T.err, label: "خروج" }
      : { icon: "⟲", color: T.warn, label: "تسوية" };

  const printLog = () => {
    let h = "<h2 style='text-align:center;margin:0 0 6px'>📊 سجل حركات مخزن الجاهز</h2>";
    h += "<div style='text-align:center;font-size:12px;color:#475569;margin-bottom:12px'>" + fmt(rows.length) + " حركة" + (q ? " (مفلتر: " + search + ")" : "") + " · دخول " + fmt(totalIn) + " · خروج " + fmt(totalOut) + "</div>";
    h += "<table><thead><tr><th>التاريخ</th><th>الحركة</th><th>الكود</th><th>الوصف</th><th>الكمية</th><th>المرجع</th><th>بواسطة</th></tr></thead><tbody>";
    rows.forEach((m, i) => {
      const mt = moveMeta(m);
      h += "<tr style='background:" + (i % 2 ? "#f8f8f8" : "transparent") + "'>";
      h += "<td style='text-align:center;direction:ltr'>" + (m.date || "—") + "</td>";
      h += "<td style='text-align:center;color:" + mt.color + ";font-weight:700'>" + mt.icon + " " + mt.label + "</td>";
      h += "<td style='font-weight:700'>" + (m._modelNo || m.itemName || "—") + "</td>";
      h += "<td style='font-size:11px'>" + (m._modelDesc || "—") + "</td>";
      h += "<td style='text-align:center;font-weight:700;color:" + mt.color + "'>" + (m.type === "out" ? "-" : "+") + fmt(Math.abs(Number(m.qty) || 0)) + "</td>";
      h += "<td style='font-size:11px;color:#666'>" + (m.notes || m.sourceType || "—") + "</td>";
      h += "<td style='font-size:11px;color:#666'>" + (m.createdBy || "—") + "</td>";
      h += "</tr>";
    });
    h += "</tbody></table>";
    printPage("سجل حركات مخزن الجاهز", h, { factoryName: factoryName || "", logo: logo || "" });
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label style={{ fontSize: FS - 3, color: T.textSec, fontWeight: 600 }}>بحث بالكود أو الاسم</label>
          <Inp value={search} onChange={setSearch} placeholder="🔍 رقم / اسم / وصف الموديل..." />
        </div>
        {search && <Btn small ghost onClick={() => setSearch("")} style={{ marginBottom: 2 }}>✕ مسح</Btn>}
        <div style={{ padding: "8px 12px", borderRadius: 8, background: T.ok + "12", color: T.ok, fontWeight: 700, fontSize: FS - 1, whiteSpace: "nowrap" }}>👕 {fmt(rows.length)} حركة</div>
        <div style={{ padding: "8px 12px", borderRadius: 8, background: T.err + "10", color: T.err, fontWeight: 700, fontSize: FS - 2, whiteSpace: "nowrap" }}>↑ خروج {fmt(totalOut)}</div>
        <div style={{ padding: "8px 12px", borderRadius: 8, background: T.ok + "10", color: T.ok, fontWeight: 700, fontSize: FS - 2, whiteSpace: "nowrap" }}>↓ دخول {fmt(totalIn)}</div>
        {rows.length > 0 && <Btn small onClick={printLog} style={{ background: "#0EA5E912", color: "#0EA5E9", border: "1px solid #0EA5E930", marginBottom: 2 }}>🖨 طباعة</Btn>}
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: 30, textAlign: "center", color: T.textMut, fontSize: FS - 1 }}>
          لا توجد حركات على الجاهز{q ? " مطابقة للبحث" : ""}.<br />حركات الجاهز بتتولّد تلقائياً من أوامر البيع (حجز / تسليم / إلغاء الموديلات).
        </div>
      ) : (
        <>
          <div style={{ overflowX: "auto", maxHeight: isMob ? 360 : 480, overflowY: "auto", border: "1px solid " + T.brd, borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FS - 1 }}>
              <thead style={{ position: "sticky", top: 0, background: T.cardSolid, zIndex: 1 }}><tr>
                <th style={TH}>التاريخ</th>
                <th style={TH}>الحركة</th>
                <th style={TH}>الكود</th>
                {!isMob && <th style={TH}>الوصف</th>}
                <th style={{ ...TH, textAlign: "center" }}>الكمية</th>
                <th style={TH}>المرجع</th>
                {!isMob && <th style={TH}>بواسطة</th>}
              </tr></thead>
              <tbody>
                {shown.map(m => {
                  const mt = moveMeta(m);
                  return (
                    <tr key={m.id} style={{ borderBottom: "1px solid " + T.brd }}>
                      <td style={{ ...TD, fontSize: FS - 2, color: T.textMut, whiteSpace: "nowrap" }}>{m.date || "—"}</td>
                      <td style={{ ...TD }}><span style={{ padding: "2px 8px", borderRadius: 8, fontSize: FS - 3, fontWeight: 700, background: mt.color + "15", color: mt.color, whiteSpace: "nowrap" }}>{mt.icon + " " + mt.label}</span></td>
                      <td style={{ ...TD, fontWeight: 700 }}>{m._modelNo || m.itemName || "—"}</td>
                      {!isMob && <td style={{ ...TD, fontSize: FS - 2, color: T.textMut }}>{m._modelDesc || "—"}</td>}
                      <td style={{ ...TD, textAlign: "center", fontWeight: 700, color: mt.color, whiteSpace: "nowrap" }}>{(m.type === "out" ? "-" : "+") + fmt(Math.abs(Number(m.qty) || 0)) + " قطعة"}</td>
                      <td style={{ ...TD, fontSize: FS - 2, color: T.textMut }}>{m.notes || m.sourceType || "—"}</td>
                      {!isMob && <td style={{ ...TD, fontSize: FS - 2, color: T.textMut }}>{m.createdBy || "—"}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length > limit && <div style={{ textAlign: "center", marginTop: 10 }}>
            <Btn small onClick={() => setLimit(l => l + 50)}>⬇️ عرض المزيد ({fmt(rows.length - limit)} متبقّي)</Btn>
          </div>}
          <div style={{ textAlign: "center", marginTop: 6, fontSize: FS - 3, color: T.textMut }}>عرض {fmt(Math.min(limit, rows.length))} من {fmt(rows.length)} حركة</div>
        </>
      )}
    </div>
  );
}
