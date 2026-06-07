/* ═══════════════════════════════════════════════════════════════════════
   CLARK · DocLineEditor (V21.17.0 — Phase 12c)
   محرّر بنود على طراز Odoo — جريد سطر-بسطر للمستندات (عرض سعر/أمر بيع...).
   أعمدة: المنتج (مصدر + اختيار) · الوحدة · الكمية · السعر · خصم % · المبلغ.
   + «إضافة منتج» + «إضافة قسم» (section header). reusable عبر الفورمات.

   item shape (سطر منتج):
     { sourceType, sourceId, modelNo, description, unit, qty, unitPrice,
       discountType:"pct", discountValue }
   item shape (قسم):
     { isSection:true, title }

   Props:
     items, setItems         — الحالة (مصفوفة) + setter
     sourceLabels            — { key: label } لأنواع المصدر
     sourceOptions(type)     — () => [{value,label}]
     resolveSource(type,id,cur) → { modelNo, description, unitPrice, unit }
     isMob, accent
   ═══════════════════════════════════════════════════════════════════════ */

import { Btn, Inp, Sel, SearchSel } from "../ui.jsx";
import { T } from "../../theme.js";
import { FS } from "../../constants/index.js";
import { fmt } from "../../utils/format.js";

/* معاينة إجمالي السطر (qty×price − خصم) — نفس منطق recalcLine */
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

export function DocLineEditor({ items, setItems, sourceLabels, sourceOptions, resolveSource, isMob, accent = "#0EA5E9" }){
  const setItem = (idx, patch) => setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  const addProduct = () => setItems(prev => [...prev, emptyProduct()]);
  const addSection = () => setItems(prev => [...prev, emptySection()]);
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));
  const pick = (idx, sourceType, sourceId) => {
    const af = resolveSource ? resolveSource(sourceType, sourceId, items[idx]) : {};
    setItem(idx, { sourceId, ...af });
  };

  const lbl = { fontSize: FS - 3, color: T.textMut, fontWeight: 600 };
  const COLS = "minmax(160px,2.4fr) 80px 70px 100px 64px 104px 32px";
  const HEAD = ["المنتج", "الوحدة", "الكمية", "السعر", "خصم %", "المبلغ", ""];

  /* ── سطر منتج (Desktop grid) ── */
  const productRowDesktop = (it, idx) => (
    <div key={idx} style={{ display: "grid", gridTemplateColumns: COLS, gap: 6, alignItems: "center", padding: "6px 8px", borderTop: "1px solid " + T.brd }}>
      {/* المنتج: مصدر + اختيار */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <Sel value={it.sourceType} onChange={v => setItem(idx, { sourceType: v, sourceId: "", modelNo: v === "service" ? it.modelNo : "", description: "" })} style={{ fontSize: FS - 3, padding: "4px 6px" }}>
          {Object.entries(sourceLabels).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Sel>
        {it.sourceType === "service" ? (
          <Inp value={it.description || it.modelNo} onChange={v => setItem(idx, { description: v, modelNo: v })} placeholder="وصف البند..." />
        ) : (
          <>
            <SearchSel value={it.sourceId} onChange={v => pick(idx, it.sourceType, v)} options={sourceOptions(it.sourceType)} placeholder="ابحث..." showAllOnFocus maxResults={10} />
            {(it.modelNo || it.description) && <div style={{ fontSize: FS - 4, color: T.textMut }}>{it.modelNo}{it.description ? " — " + it.description : ""}</div>}
          </>
        )}
      </div>
      <Inp value={it.unit || ""} onChange={v => setItem(idx, { unit: v })} placeholder="قطعة" />
      <Inp type="number" value={it.qty} onChange={v => setItem(idx, { qty: v })} />
      <Inp type="number" value={it.unitPrice} onChange={v => setItem(idx, { unitPrice: v })} />
      <Inp type="number" value={it.discountValue} onChange={v => setItem(idx, { discountValue: v, discountType: "pct" })} />
      <div style={{ fontWeight: 800, color: T.text, fontSize: FS - 1, textAlign: "left", whiteSpace: "nowrap" }}>{fmt(lineTotalPreview(it))}</div>
      <Btn ghost small onClick={() => removeItem(idx)} style={{ color: T.err, padding: "2px 6px" }}>🗑</Btn>
    </div>
  );

  /* ── سطر قسم (Desktop) ── */
  const sectionRowDesktop = (it, idx) => (
    <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 32px", gap: 6, alignItems: "center", padding: "6px 8px", borderTop: "1px solid " + T.brd, background: accent + "0c" }}>
      <Inp value={it.title || ""} onChange={v => setItem(idx, { title: v })} placeholder="📑 عنوان القسم (مثلاً: الأطقم الصيفي)" style={{ fontWeight: 800, color: accent, background: "transparent", border: "none" }} />
      <Btn ghost small onClick={() => removeItem(idx)} style={{ color: T.err, padding: "2px 6px" }}>🗑</Btn>
    </div>
  );

  /* ── سطر منتج/قسم (Mobile cards) ── */
  const rowMobile = (it, idx) => it.isSection ? (
    <div key={idx} style={{ border: "1px solid " + accent + "44", borderRadius: 10, padding: 8, background: accent + "0c", display: "flex", gap: 6, alignItems: "center" }}>
      <Inp value={it.title || ""} onChange={v => setItem(idx, { title: v })} placeholder="📑 عنوان القسم" style={{ fontWeight: 800, color: accent }} />
      <Btn ghost small onClick={() => removeItem(idx)} style={{ color: T.err }}>🗑</Btn>
    </div>
  ) : (
    <div key={idx} style={{ border: "1px solid " + T.brd, borderRadius: 10, padding: 10, background: T.bg }}>
      <div style={{ display: "grid", gridTemplateColumns: "120px 1fr auto", gap: 8, alignItems: "end" }}>
        <div><label style={lbl}>المصدر</label><Sel value={it.sourceType} onChange={v => setItem(idx, { sourceType: v, sourceId: "", modelNo: v === "service" ? it.modelNo : "", description: "" })}>{Object.entries(sourceLabels).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Sel></div>
        <div>
          {it.sourceType === "service"
            ? <><label style={lbl}>الوصف</label><Inp value={it.description || it.modelNo} onChange={v => setItem(idx, { description: v, modelNo: v })} placeholder="وصف البند..." /></>
            : <><label style={lbl}>اختر {sourceLabels[it.sourceType]}</label><SearchSel value={it.sourceId} onChange={v => pick(idx, it.sourceType, v)} options={sourceOptions(it.sourceType)} placeholder="ابحث..." showAllOnFocus maxResults={10} /></>}
        </div>
        <Btn ghost small onClick={() => removeItem(idx)} style={{ color: T.err }}>🗑</Btn>
      </div>
      {it.sourceType !== "service" && (it.modelNo || it.description) && <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 4 }}>{it.modelNo}{it.description ? " — " + it.description : ""}</div>}
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
        <div style={{ border: "1px solid " + T.brd, borderRadius: 10, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 6, padding: "8px", background: accent, color: "#fff", fontSize: FS - 3, fontWeight: 800 }}>
            {HEAD.map((h, i) => <div key={i} style={{ textAlign: i >= 2 && i <= 5 ? "center" : "right" }}>{h}</div>)}
          </div>
          {items.length === 0 ? <div style={{ color: T.textMut, fontSize: FS - 2, padding: 14, textAlign: "center" }}>اضغط «+ إضافة منتج» لبدء البنود</div>
            : items.map((it, idx) => it.isSection ? sectionRowDesktop(it, idx) : productRowDesktop(it, idx))}
        </div>
      )}
    </div>
  );
}
