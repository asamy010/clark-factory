/* ═══════════════════════════════════════════════════════════════════════
   CLARK · DocLineEditor (V21.17.1 — Phase 12c)
   محرّر بنود على طراز Odoo — جريد سطر-بسطر، كل بند في صف واحد.
   خانة المنتج = بحث موحّد واحد (تكتب يظهر الفلتر زي Odoo، بدون اختيار نوع)
   + نص حر للخدمات/البنود اليدوية. أعمدة: المنتج · الوحدة · الكمية · السعر ·
   خصم % · المبلغ. + «إضافة منتج» + «إضافة قسم».

   Props:
     items, setItems
     productOptions   — [{ value:"type:id", label }] قائمة موحّدة لكل المصادر
     resolveProduct(value, cur) → { sourceType, sourceId, modelNo, description, unitPrice, unit }
     isMob, accent
   ═══════════════════════════════════════════════════════════════════════ */

import { Btn, Inp, SearchSel } from "../ui.jsx";
import { T } from "../../theme.js";
import { FS } from "../../constants/index.js";
import { fmt } from "../../utils/format.js";

function lineTotalPreview(it){
  if(it.isSection) return 0;
  const qty = Number(it.qty) || 0, up = Number(it.unitPrice) || 0;
  const sub = qty * up;
  const dv = Number(it.discountValue) || 0;
  const disc = it.discountType === "amount" ? Math.min(Math.max(dv, 0), sub) : sub * (Math.min(Math.max(dv, 0), 100) / 100);
  return Math.round((sub - disc) * 100) / 100;
}

const emptyProduct = () => ({ sourceType: "service", sourceId: "", modelNo: "", description: "", unit: "", qty: 1, unitPrice: 0, discountType: "pct", discountValue: 0 });
const emptySection = () => ({ isSection: true, title: "" });

export function DocLineEditor({ items, setItems, productOptions = [], resolveProduct, isMob, accent = "#0EA5E9", stockInfo }){
  /* V21.27.79: شارة الكمية المتاحة بالمخزن تحت الصنف (باهتة). stockInfo(it) → {qty,unit,label?}|null */
  const stockBadge = (it) => {
    if(!stockInfo) return null;
    const s = stockInfo(it);
    if(!s) return null;
    const q = Number(s.qty) || 0;
    const lbl = s.label || "المتاح بالمخزن";
    return <div style={{ fontSize: FS - 4, color: T.textMut, marginTop: 2, opacity: 0.85, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>📦 {lbl}: <b style={{ color: q > 0 ? T.ok : T.err }}>{fmt(q)}</b> {s.unit || ""}</div>;
  };
  const setItem = (idx, patch) => setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  const addProduct = () => setItems(prev => [...prev, emptyProduct()]);
  const addSection = () => setItems(prev => [...prev, emptySection()]);
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));

  /* قيمة + خيارات خانة المنتج (مع إظهار البند الحر الحالي كخيار مختار) */
  const rowValue = (it) => it.sourceType === "service"
    ? ((it.modelNo || it.description) ? "service:" + (it.modelNo || it.description) : "")
    : (it.sourceId ? it.sourceType + ":" + it.sourceId : "");
  const rowOptions = (it) => (it.sourceType === "service" && (it.modelNo || it.description))
    ? [{ value: "service:" + (it.modelNo || it.description), label: "🛠️ " + (it.modelNo || it.description) }, ...productOptions]
    : productOptions;
  const onPick = (idx, it, val) => {
    if(String(val).startsWith("service:")) return; /* البند الحر الحالي — مفيش تغيير */
    const r = resolveProduct ? resolveProduct(val, it) : {};
    setItem(idx, r);
  };
  const onCustom = (idx, text) => setItem(idx, { sourceType: "service", sourceId: "", modelNo: text, description: text });

  const ProductPicker = ({ it, idx }) => (
    <SearchSel value={rowValue(it)} options={rowOptions(it)} allowCustom onCustom={t => onCustom(idx, t)} onChange={v => onPick(idx, it, v)} placeholder="اكتب اسم المنتج / الخدمة..." showAllOnFocus maxResults={14} />
  );

  const lbl = { fontSize: FS - 3, color: T.textMut, fontWeight: 600 };
  const COLS = "minmax(220px,3fr) 88px 70px 104px 66px 112px 30px";
  const HEAD = ["المنتج", "الوحدة", "الكمية", "السعر", "خصم %", "المبلغ", ""];

  /* ── Desktop: كل بند صف واحد ── */
  const productRowDesktop = (it, idx) => (
    <div key={idx} style={{ display: "grid", gridTemplateColumns: COLS, gap: 6, alignItems: "center", padding: "6px 8px", borderTop: "1px solid " + T.brd }}>
      <div style={{ minWidth: 0 }}><ProductPicker it={it} idx={idx} />{stockBadge(it)}</div>
      <Inp value={it.unit || ""} onChange={v => setItem(idx, { unit: v })} placeholder="قطعة" />
      <Inp type="number" value={it.qty} onChange={v => setItem(idx, { qty: v })} />
      <Inp type="number" value={it.unitPrice} onChange={v => setItem(idx, { unitPrice: v })} />
      <Inp type="number" value={it.discountValue} onChange={v => setItem(idx, { discountValue: v, discountType: "pct" })} />
      <div style={{ fontWeight: 800, color: T.text, fontSize: FS - 1, textAlign: "left", whiteSpace: "nowrap" }}>{fmt(lineTotalPreview(it))}</div>
      <Btn ghost small onClick={() => removeItem(idx)} style={{ color: T.err, padding: "2px 4px" }}>🗑</Btn>
    </div>
  );

  const sectionRowDesktop = (it, idx) => (
    <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 30px", gap: 6, alignItems: "center", padding: "6px 8px", borderTop: "1px solid " + T.brd, background: accent + "0c" }}>
      <Inp value={it.title || ""} onChange={v => setItem(idx, { title: v })} placeholder="📑 عنوان القسم (مثلاً: الأطقم الصيفي)" style={{ fontWeight: 800, color: accent, background: "transparent", border: "none" }} />
      <Btn ghost small onClick={() => removeItem(idx)} style={{ color: T.err, padding: "2px 4px" }}>🗑</Btn>
    </div>
  );

  /* ── Mobile: كروت ── */
  const rowMobile = (it, idx) => it.isSection ? (
    <div key={idx} style={{ border: "1px solid " + accent + "44", borderRadius: 10, padding: 8, background: accent + "0c", display: "flex", gap: 6, alignItems: "center" }}>
      <Inp value={it.title || ""} onChange={v => setItem(idx, { title: v })} placeholder="📑 عنوان القسم" style={{ fontWeight: 800, color: accent }} />
      <Btn ghost small onClick={() => removeItem(idx)} style={{ color: T.err }}>🗑</Btn>
    </div>
  ) : (
    <div key={idx} style={{ border: "1px solid " + T.brd, borderRadius: 10, padding: 10, background: T.bg }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ flex: 1 }}><ProductPicker it={it} idx={idx} />{stockBadge(it)}</div>
        <Btn ghost small onClick={() => removeItem(idx)} style={{ color: T.err }}>🗑</Btn>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginTop: 8, alignItems: "end" }}>
        <div><label style={lbl}>الوحدة</label><Inp value={it.unit || ""} onChange={v => setItem(idx, { unit: v })} placeholder="قطعة" /></div>
        <div><label style={lbl}>كمية</label><Inp type="number" value={it.qty} onChange={v => setItem(idx, { qty: v })} /></div>
        <div><label style={lbl}>السعر</label><Inp type="number" value={it.unitPrice} onChange={v => setItem(idx, { unitPrice: v })} /></div>
        <div><label style={lbl}>خصم %</label><Inp type="number" value={it.discountValue} onChange={v => setItem(idx, { discountValue: v, discountType: "pct" })} /></div>
      </div>
      <div style={{ textAlign: "left", marginTop: 6, fontWeight: 800, color: T.text }}>المبلغ: {fmt(lineTotalPreview(it))}</div>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <Btn ghost small onClick={addProduct} style={{ color: accent }}>+ إضافة منتج</Btn>
        <Btn ghost small onClick={addSection} style={{ color: accent }}>+ إضافة قسم</Btn>
      </div>

      {isMob ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.length === 0 ? <div style={{ color: T.textMut, fontSize: FS - 2, padding: 12, textAlign: "center" }}>اضغط «+ إضافة منتج»</div> : items.map(rowMobile)}
        </div>
      ) : (
        <div style={{ border: "1px solid " + T.brd, borderRadius: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 6, padding: "8px", background: accent, color: "#fff", fontSize: FS - 3, fontWeight: 800, borderRadius: "10px 10px 0 0" }}>
            {HEAD.map((h, i) => <div key={i} style={{ textAlign: i >= 2 && i <= 5 ? "center" : "right" }}>{h}</div>)}
          </div>
          {items.length === 0 ? <div style={{ color: T.textMut, fontSize: FS - 2, padding: 14, textAlign: "center" }}>اضغط «+ إضافة منتج» لبدء البنود</div>
            : items.map((it, idx) => it.isSection ? sectionRowDesktop(it, idx) : productRowDesktop(it, idx))}
        </div>
      )}
    </div>
  );
}
