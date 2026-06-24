/* ═══════════════════════════════════════════════════════════════════════
   CLARK · OpeningBalanceModal (V21.27.116) — رصيد افتتاحي للمخزن
   ───────────────────────────────────────────────────────────────────────
   بوب اب بتابات لكل مجموعة (قماش / إكسسوار / منتج عام). في كل تاب قائمة
   الأصناف + الرصيد الحالي + حقل الكمية الافتتاحية + التكلفة/الوحدة. الحفظ
   بيسجّل لكل صنف (كمية > 0) حركة مخزن type="opening" sourceType="opening"
   (نفس منطق saveOpeningBalance في المشتريات) — متوسط تكلفة مرجّح.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { Btn, Inp } from "./ui.jsx";
import { fmt, r2 } from "../utils/format.js";
import { ask, showToast } from "../utils/popups.js";

const _gid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const CATS = [
  { key: "fabric", label: "🧵 قماش/خامات", listKey: "fabrics" },
  { key: "accessory", label: "🪡 إكسسوار", listKey: "accessories" },
  { key: "generalProduct", label: "➕ منتجات عامة", listKey: "generalProducts" },
];

export function OpeningBalanceModal({ data, upConfig, canEdit, userName, isMob, onClose }){
  const today = new Date().toISOString().split("T")[0];
  const [activeCat, setActiveCat] = useState("fabric");
  const [date, setDate] = useState(today);
  const [filter, setFilter] = useState("");
  /* rows: { [itemId]: { qty, cost, listKey, catKey } } */
  const [rows, setRows] = useState({});
  const [busy, setBusy] = useState(false);

  const catDef = CATS.find(c => c.key === activeCat) || CATS[0];
  const itemList = Array.isArray(data[catDef.listKey]) ? data[catDef.listKey] : [];
  const fdeb = filter.trim().toLowerCase();
  const shown = useMemo(() => fdeb
    ? itemList.filter(x => String(x.name || "").toLowerCase().includes(fdeb) || String(x.code || "").toLowerCase().includes(fdeb))
    : itemList, [itemList, fdeb]);

  const setRow = (item, field, v) => setRows(p => {
    const cur = p[item.id] || { qty: "", cost: "", listKey: catDef.listKey, catKey: catDef.key };
    return { ...p, [item.id]: { ...cur, [field]: v, listKey: catDef.listKey, catKey: catDef.key } };
  });

  const entries = useMemo(() => Object.entries(rows).filter(([, v]) => (Number(v.qty) || 0) > 0), [rows]);
  const totalVal = entries.reduce((s, [, v]) => s + (Number(v.qty) || 0) * (Number(v.cost) || 0), 0);

  const save = async () => {
    if(!canEdit){ showToast("⛔ مالكش صلاحية"); return; }
    if(entries.length === 0){ showToast("⚠️ ادخل كمية لصنف واحد على الأقل"); return; }
    if(!await ask("حفظ الرصيد الافتتاحي", "تسجيل رصيد افتتاحي لـ " + entries.length + " صنف بإجمالي قيمة " + fmt(r2(totalVal)) + " ج.م؟\n\nبيتسجّل كحركة مخزن (رصيد افتتاحي) لكل صنف.", { confirmText: "حفظ" })) return;
    setBusy(true);
    try {
      const od = date || today;
      upConfig(d => {
        if(!Array.isArray(d.stockMovements)) d.stockMovements = [];
        entries.forEach(([itemId, v]) => {
          const q = Number(v.qty) || 0, cost = Number(v.cost) || 0;
          const list = d[v.listKey] || [];
          const idx = list.findIndex(x => String(x.id) === String(itemId));
          if(idx < 0) return;
          const it = list[idx];
          const oldStock = Number(it.stock) || 0, oldAvg = Number(it.avgCost) || Number(it.price) || 0;
          const total = oldStock + q;
          it.avgCost = total > 0 ? r2((oldStock * oldAvg + q * cost) / total) : cost;
          it.stock = total;
          it.lastMovementDate = od;
          d.stockMovements.push({
            id: _gid(), type: "opening", itemType: v.catKey, itemId, itemName: it.name || "",
            qty: q, unit: it.unit || "", price: cost, date: od,
            sourceType: "opening", sourceId: null, notes: "رصيد افتتاحي (بدون مورد)",
            createdBy: userName || "", createdAt: new Date().toISOString(),
          });
        });
      });
      showToast("✅ تم حفظ الرصيد الافتتاحي (" + entries.length + " صنف)");
      onClose && onClose();
    } catch(e){ showToast("⛔ تعذّر الحفظ: " + (e?.message || e)); }
    finally { setBusy(false); }
  };

  const th = { padding: "7px 10px", textAlign: "right", fontSize: FS - 3, fontWeight: 800, color: T.textSec, borderBottom: "1.5px solid " + T.brd, whiteSpace: "nowrap", background: T.bg, position: "sticky", top: 0 };
  const td = { padding: "5px 10px", fontSize: FS - 1, borderBottom: "1px solid " + T.brd };

  return <div onClick={busy ? undefined : onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 10003, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: isMob ? 8 : 24, overflowY: "auto" }}>
    <div onClick={e => e.stopPropagation()} style={{ background: T.cardSolid, borderRadius: 16, width: "100%", maxWidth: 820, margin: "auto", border: "1px solid " + T.brd, boxShadow: "0 25px 70px rgba(0,0,0,0.4)", direction: "rtl", maxHeight: "92vh", display: "flex", flexDirection: "column" }}>
      {/* header */}
      <div style={{ padding: "16px 18px", borderBottom: "2px solid " + T.brd, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: FS + 3, fontWeight: 800, color: T.accent }}>📥 رصيد افتتاحي للمخزن</div>
          <div style={{ fontSize: FS - 2, color: T.textSec }}>دخّل الكمية الافتتاحية لكل صنف — بتتسجّل كحركة مخزن</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div><label style={{ fontSize: FS - 3, color: T.textSec, display: "block" }}>التاريخ</label><Inp type="date" value={date} onChange={setDate} /></div>
          <Btn ghost small onClick={onClose}>✕</Btn>
        </div>
      </div>

      {/* تابات الفئات */}
      <div style={{ display: "flex", gap: 4, padding: "10px 18px 0", flexWrap: "wrap" }}>
        {CATS.map(c => { const active = activeCat === c.key; const cnt = Object.values(rows).filter(v => v.catKey === c.key && (Number(v.qty) || 0) > 0).length; return <div key={c.key} onClick={() => { setActiveCat(c.key); setFilter(""); }} style={{ padding: "8px 14px", cursor: "pointer", borderBottom: active ? "3px solid " + T.accent : "3px solid transparent", fontWeight: active ? 800 : 600, color: active ? T.accent : T.textSec, fontSize: FS - 1, display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>{c.label}{cnt > 0 && <span style={{ fontSize: FS - 4, padding: "1px 6px", borderRadius: 10, background: T.ok + "18", color: T.ok }}>{cnt}</span>}</div>; })}
      </div>

      {/* بحث + جدول */}
      <div style={{ padding: "10px 18px", overflowY: "auto", flex: 1 }}>
        <div style={{ marginBottom: 8 }}><Inp value={filter} onChange={setFilter} placeholder={"🔍 ابحث في " + catDef.label + "..."} /></div>
        {itemList.length === 0
          ? <div style={{ padding: 16, textAlign: "center", color: T.textMut, fontSize: FS - 1 }}>مفيش أصناف في {catDef.label}.</div>
          : <div style={{ border: "1px solid " + T.brd, borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={th}>الصنف</th><th style={{ ...th, textAlign: "center", width: 90 }}>الرصيد الحالي</th><th style={{ ...th, textAlign: "center", width: 110 }}>كمية افتتاحية</th><th style={{ ...th, textAlign: "center", width: 110 }}>التكلفة/وحدة</th></tr></thead>
              <tbody>
                {shown.map(it => { const rv = rows[it.id] || {}; const has = (Number(rv.qty) || 0) > 0; return <tr key={it.id} style={{ background: has ? T.ok + "08" : "transparent" }}>
                  <td style={{ ...td, fontWeight: 700, color: T.text }}>{it.name}{it.unit ? <span style={{ color: T.textMut, fontWeight: 400, fontSize: FS - 3 }}> ({it.unit})</span> : ""}</td>
                  <td style={{ ...td, textAlign: "center", color: T.textSec, direction: "ltr" }}>{fmt(Number(it.stock) || 0)}</td>
                  <td style={{ ...td, textAlign: "center" }}><input type="number" value={rv.qty ?? ""} onChange={e => setRow(it, "qty", e.target.value)} placeholder="0" style={{ width: 80, padding: "5px 6px", borderRadius: 6, border: "1.5px solid " + (has ? T.ok : T.brd), textAlign: "center", direction: "ltr", fontWeight: 700, background: T.cardSolid, color: T.text, fontFamily: "inherit" }} /></td>
                  <td style={{ ...td, textAlign: "center" }}><input type="number" value={rv.cost ?? ""} onChange={e => setRow(it, "cost", e.target.value)} placeholder={String(r2(Number(it.avgCost) || Number(it.price) || 0))} style={{ width: 90, padding: "5px 6px", borderRadius: 6, border: "1px solid " + T.brd, textAlign: "center", direction: "ltr", background: T.cardSolid, color: T.text, fontFamily: "inherit" }} /></td>
                </tr>; })}
              </tbody>
            </table>
          </div>}
      </div>

      {/* footer */}
      <div style={{ padding: "12px 18px", borderTop: "2px solid " + T.brd, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: FS - 1, color: T.textSec }}>المُدخل: <b style={{ color: T.ok }}>{entries.length}</b> صنف · القيمة: <b style={{ color: T.accent, direction: "ltr" }}>{fmt(r2(totalVal))}</b> ج.م</div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn ghost onClick={onClose} disabled={busy}>إلغاء</Btn>
          <Btn onClick={save} disabled={busy || !canEdit || entries.length === 0} style={{ background: T.ok, color: "#fff", border: "none" }}>{busy ? "⏳ جاري الحفظ..." : "💾 حفظ الرصيد الافتتاحي"}</Btn>
        </div>
      </div>
    </div>
  </div>;
}
