/* ═══════════════════════════════════════════════════════════════════════
   CLARK · StockPermitsTab (V21.27.115) — إذونات مخزنية
   ───────────────────────────────────────────────────────────────────────
   تاب في هب المخازن:
   1) إعدادات أنواع الإذونات — قائمة المستخدم بيدخل فيها أنواع الإذونات، كل
      نوع: اسم + اتجاه (داخل ➕ بيزوّد الرصيد / خارج ➖ بيخصم الرصيد).
      التخزين: data.stockPermitTypes (config settings، صغيرة).
   2) إنشاء إذن — اختيار النوع (يحدّد الاتجاه) + الفئة + الصنف + الكمية →
      يطبّق حركة مخزن (نفس منطق saveMovement: in = متوسط تكلفة مرجّح، out =
      خصم) + يسجّل stockMovement بـ sourceType="permit".
   3) سجل الإذونات — من stockMovements (sourceType="permit").
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { Btn, Inp, Sel, SearchSel } from "./ui.jsx";
import { fmt, r2 } from "../utils/format.js";
import { ask, tell, showToast } from "../utils/popups.js";
import { computeStockNetMap, netStockOf } from "../utils/stockLedger.js";

const _gid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const CATS = [
  { key: "fabric", label: "🧵 خامة/قماش", listKey: "fabrics" },
  { key: "accessory", label: "🪡 إكسسوار", listKey: "accessories" },
  { key: "generalProduct", label: "➕ منتج عام", listKey: "generalProducts" },
];

export function StockPermitsTab({ data, upConfig, canEdit, userName, isMob }){
  const today = new Date().toISOString().split("T")[0];
  const permitTypes = Array.isArray(data.stockPermitTypes) ? data.stockPermitTypes : [];
  const [showSettings, setShowSettings] = useState(permitTypes.length === 0);
  const [newName, setNewName] = useState("");
  const [newDir, setNewDir] = useState("out");
  /* form الإذن */
  const [permitTypeId, setPermitTypeId] = useState("");
  const [cat, setCat] = useState("fabric");
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");

  const selType = permitTypes.find(t => String(t.id) === String(permitTypeId)) || null;
  const direction = selType ? selType.direction : null; /* "in" | "out" */
  const listKey = (CATS.find(c => c.key === cat) || CATS[0]).listKey;
  const itemList = Array.isArray(data[listKey]) ? data[listKey] : [];
  const selItem = itemList.find(x => String(x.id) === String(itemId)) || null;
  /* V21.27.129: الرصيد = صافي حركات المخزون (استلامات + إذونات + مرتجعات
     بالاتجاه) — نفس مصدر العرض في «المخازن» بدل item.stock اللي ممكن يدرِف. */
  const netMap = useMemo(() => computeStockNetMap(data.stockMovements), [data.stockMovements]);
  const stockOf = (it) => netStockOf(netMap, it);

  /* ── إعدادات الأنواع ── */
  const addType = () => {
    if(!canEdit){ showToast("⛔ مالكش صلاحية"); return; }
    const nm = newName.trim(); if(!nm){ showToast("⚠️ اكتب اسم نوع الإذن"); return; }
    upConfig(d => { if(!Array.isArray(d.stockPermitTypes)) d.stockPermitTypes = []; d.stockPermitTypes.push({ id: _gid(), name: nm, direction: newDir }); });
    setNewName(""); showToast("✓ اتضاف نوع الإذن");
  };
  const delType = async (t) => {
    if(!canEdit){ showToast("⛔ مالكش صلاحية"); return; }
    if(!await ask("حذف نوع الإذن", "حذف نوع الإذن «" + t.name + "»؟ (الإذونات المتسجّلة قبل كده مش هتتأثر)", { danger: true, confirmText: "حذف" })) return;
    upConfig(d => { d.stockPermitTypes = (d.stockPermitTypes || []).filter(x => String(x.id) !== String(t.id)); });
    if(String(permitTypeId) === String(t.id)) setPermitTypeId("");
  };

  /* ── سجل الإذونات ── */
  const permitLog = useMemo(() => (data.stockMovements || [])
    .filter(m => m && m.sourceType === "permit")
    .slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, 100), [data.stockMovements]);

  /* ── تنفيذ الإذن ── */
  const executePermit = async () => {
    if(!canEdit){ showToast("⛔ مالكش صلاحية"); return; }
    if(!selType){ showToast("⚠️ اختر نوع الإذن"); return; }
    if(!selItem){ showToast("⚠️ اختر الصنف"); return; }
    const q = Number(qty) || 0;
    if(q <= 0){ showToast("⚠️ ادخل كمية صحيحة"); return; }
    const cur = stockOf(selItem);
    if(direction === "out" && q > cur){ await tell("المخزن غير كافٍ", "المتاح: " + fmt(cur) + " " + (selItem.unit || "") + "\nالمطلوب: " + fmt(q)); return; }
    const cost = direction === "in" ? (Number(price) || Number(selItem.avgCost) || Number(selItem.price) || 0) : 0;
    const ok = await ask("تنفيذ الإذن المخزني",
      "• النوع: " + selType.name + " (" + (direction === "in" ? "داخل ➕ بيزوّد" : "خارج ➖ بيخصم") + ")\n" +
      "• الصنف: " + selItem.name + "\n• الكمية: " + fmt(q) + " " + (selItem.unit || "") +
      (direction === "in" ? "\n• التكلفة/الوحدة: " + fmt(r2(cost)) + " ج.م" : "") + "\n\nمتابعة؟", { confirmText: "تنفيذ" });
    if(!ok) return;
    upConfig(d => {
      const list = d[listKey] || [];
      const idx = list.findIndex(x => String(x.id) === String(selItem.id));
      if(idx < 0) return;
      const it = list[idx];
      if(direction === "in"){
        const oldStock = Number(it.stock) || 0, oldAvg = Number(it.avgCost) || Number(it.price) || 0;
        const total = oldStock + q;
        it.avgCost = total > 0 ? r2((oldStock * oldAvg + q * cost) / total) : cost;
        it.stock = total;
      } else {
        it.stock = Math.max(0, (Number(it.stock) || 0) - q);
      }
      it.lastMovementDate = date || today;
      if(!Array.isArray(d.stockMovements)) d.stockMovements = [];
      d.stockMovements.push({
        id: _gid(), type: direction, itemType: cat, itemId: selItem.id, itemName: selItem.name,
        qty: q, unit: selItem.unit || "", price: cost, date: date || today,
        sourceType: "permit", sourceId: null, permitTypeId: selType.id, permitTypeName: selType.name,
        notes: notes.trim() || ("إذن مخزني: " + selType.name), createdBy: userName || "", createdAt: new Date().toISOString(),
      });
    });
    setQty(""); setPrice(""); setNotes("");
    showToast("✅ اتنفّذ الإذن — " + (direction === "in" ? "زاد" : "خصم") + " " + fmt(q) + " " + (selItem.unit || ""));
  };

  const lbl = { fontSize: FS - 2, color: T.textSec, fontWeight: 600, display: "block", marginBottom: 4 };
  const card = { background: T.cardSolid, border: "1px solid " + T.brd, borderRadius: 12, padding: 14, marginBottom: 14 };

  return <div>
    {/* ════ إعدادات الأنواع ════ */}
    <div style={card}>
      <div onClick={() => setShowSettings(s => !s)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
        <div style={{ fontWeight: 800, color: T.text, fontSize: FS }}>⚙️ إعدادات أنواع الإذونات <span style={{ fontSize: FS - 3, color: T.textMut, fontWeight: 600 }}>({permitTypes.length})</span></div>
        <span style={{ color: T.textMut }}>{showSettings ? "▲" : "▼"}</span>
      </div>
      {showSettings && <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: FS - 2, color: T.textMut, marginBottom: 10, lineHeight: 1.6 }}>دخّل أنواع الإذونات اللي بتستخدمها، وحدّد لكل نوع: <b style={{ color: T.ok }}>داخل ➕</b> (بيزوّد الرصيد) أو <b style={{ color: T.err }}>خارج ➖</b> (بيخصم الرصيد).</div>
        {/* قائمة الأنواع */}
        {permitTypes.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          {permitTypes.map(t => <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, background: T.bg, border: "1px solid " + T.brd }}>
            <span style={{ fontSize: FS - 2, fontWeight: 700, color: t.direction === "in" ? T.ok : T.err, background: (t.direction === "in" ? T.ok : T.err) + "12", padding: "2px 8px", borderRadius: 6, whiteSpace: "nowrap" }}>{t.direction === "in" ? "داخل ➕" : "خارج ➖"}</span>
            <span style={{ flex: 1, fontWeight: 700, color: T.text }}>{t.name}</span>
            {canEdit && <Btn ghost small onClick={() => delType(t)} style={{ color: T.err }}>🗑</Btn>}
          </div>)}
        </div>}
        {/* إضافة نوع */}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 160 }}><label style={lbl}>اسم نوع الإذن</label><Inp value={newName} onChange={setNewName} placeholder="مثلاً: إذن صرف للإنتاج" /></div>
          <div style={{ minWidth: 150 }}><label style={lbl}>الاتجاه</label><Sel value={newDir} onChange={setNewDir}><option value="out">خارج ➖ بيخصم الرصيد</option><option value="in">داخل ➕ بيزوّد الرصيد</option></Sel></div>
          <Btn small onClick={addType} style={{ background: T.accent, color: "#fff", border: "none" }}>+ إضافة</Btn>
        </div>
      </div>}
    </div>

    {/* ════ إنشاء إذن ════ */}
    <div style={card}>
      <div style={{ fontWeight: 800, color: T.text, fontSize: FS, marginBottom: 12 }}>📋 إنشاء إذن مخزني</div>
      {permitTypes.length === 0
        ? <div style={{ fontSize: FS - 2, color: T.textMut, padding: 8 }}>⚠️ ضيف نوع إذن واحد على الأقل من «إعدادات أنواع الإذونات» فوق.</div>
        : <>
          <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div><label style={lbl}>نوع الإذن</label><Sel value={permitTypeId} onChange={setPermitTypeId}><option value="">اختر النوع...</option>{permitTypes.map(t => <option key={t.id} value={t.id}>{t.name + (t.direction === "in" ? " (داخل ➕)" : " (خارج ➖)")}</option>)}</Sel></div>
            <div><label style={lbl}>الفئة</label><Sel value={cat} onChange={v => { setCat(v); setItemId(""); }}>{CATS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</Sel></div>
          </div>
          <div style={{ marginBottom: 10 }}><label style={lbl}>الصنف</label>
            <SearchSel value={itemId} onChange={setItemId} options={itemList.map(x => ({ value: x.id, label: x.name + (x.unit ? " (" + x.unit + ")" : "") + " — رصيد: " + fmt(stockOf(x)) }))} placeholder="ابحث واختر الصنف..." showAllOnFocus maxResults={14} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr 1fr" : (direction === "in" ? "1fr 1fr 1fr" : "1fr 1fr"), gap: 10, marginBottom: 10 }}>
            <div><label style={lbl}>الكمية{selItem ? " (" + (selItem.unit || "") + ")" : ""}</label><Inp type="number" value={qty} onChange={setQty} placeholder="0" /></div>
            {direction === "in" && <div><label style={lbl}>التكلفة/الوحدة</label><Inp type="number" value={price} onChange={setPrice} placeholder={selItem ? String(r2(Number(selItem.avgCost) || Number(selItem.price) || 0)) : "0"} /></div>}
            <div><label style={lbl}>التاريخ</label><Inp type="date" value={date} onChange={setDate} /></div>
          </div>
          <div style={{ marginBottom: 12 }}><label style={lbl}>ملاحظات (اختياري)</label><Inp value={notes} onChange={setNotes} placeholder="سبب الإذن..." /></div>
          {selItem && selType && <div style={{ fontSize: FS - 2, color: direction === "in" ? T.ok : T.err, fontWeight: 700, marginBottom: 10 }}>
            {direction === "in" ? "➕ هيزوّد" : "➖ هيخصم"} {fmt(Number(qty) || 0)} {selItem.unit || ""} {direction === "in" ? "للرصيد" : "من الرصيد"} (الرصيد الحالي: {fmt(stockOf(selItem))})
          </div>}
          <Btn onClick={executePermit} disabled={!canEdit || !selType || !selItem || !(Number(qty) > 0)} style={{ background: direction === "in" ? T.ok : (direction === "out" ? T.err : T.accent), color: "#fff", border: "none", width: "100%" }}>✓ تنفيذ الإذن</Btn>
        </>}
    </div>

    {/* ════ سجل الإذونات ════ */}
    <div style={card}>
      <div style={{ fontWeight: 800, color: T.text, fontSize: FS, marginBottom: 12 }}>📜 سجل الإذونات <span style={{ fontSize: FS - 3, color: T.textMut, fontWeight: 600 }}>(آخر {permitLog.length})</span></div>
      {permitLog.length === 0
        ? <div style={{ fontSize: FS - 2, color: T.textMut, padding: 8, textAlign: "center" }}>مفيش إذونات متسجّلة بعد.</div>
        : <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FS - 1, minWidth: 560 }}>
            <thead><tr style={{ background: T.bg }}>
              {["التاريخ", "النوع", "الاتجاه", "الصنف", "الكمية", "ملاحظات"].map(h => <th key={h} style={{ padding: "7px 10px", textAlign: "right", fontSize: FS - 3, fontWeight: 800, color: T.textSec, borderBottom: "1.5px solid " + T.brd, whiteSpace: "nowrap" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {permitLog.map((m, i) => <tr key={m.id || i} style={{ borderBottom: "1px solid " + T.brd }}>
                <td style={{ padding: "6px 10px", color: T.textSec, whiteSpace: "nowrap" }}>{m.date || "—"}</td>
                <td style={{ padding: "6px 10px", fontWeight: 700, color: T.text }}>{m.permitTypeName || "—"}</td>
                <td style={{ padding: "6px 10px", fontWeight: 700, color: m.type === "in" ? T.ok : T.err, whiteSpace: "nowrap" }}>{m.type === "in" ? "داخل ➕" : "خارج ➖"}</td>
                <td style={{ padding: "6px 10px", color: T.text }}>{m.itemName || "—"}</td>
                <td style={{ padding: "6px 10px", fontWeight: 700, color: m.type === "in" ? T.ok : T.err, direction: "ltr", textAlign: "right" }}>{(m.type === "in" ? "+" : "−") + fmt(m.qty)} {m.unit || ""}</td>
                <td style={{ padding: "6px 10px", color: T.textMut, fontSize: FS - 3 }}>{m.notes || ""}</td>
              </tr>)}
            </tbody>
          </table>
        </div>}
    </div>
  </div>;
}
