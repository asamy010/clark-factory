/* ═══════════════════════════════════════════════════════════════════════
   CLARK · RfqFormModal (V21.12.1) — إنشاء/تعديل طلب عروض أسعار
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { Btn, Inp, SearchSel } from "../ui.jsx";
import { T } from "../../theme.js";
import { FS } from "../../constants/index.js";
import { fmt, r2 } from "../../utils/format.js";
import { ask, showToast } from "../../utils/popups.js";
import { nextRfqNo, validateRfq, PURCHASE_CURRENCIES, CURRENCY_LABELS } from "../../utils/purchase/rfq.js";
import { DocLineEditor } from "../sales/DocLineEditor.jsx";

const toEditorItem = (it) => it && it.isSection ? { ...it } : ({
  sourceType: it.sourceType || "service", sourceId: it.sourceId || "",
  modelNo: it.modelNo || it.description || "", description: it.description || it.modelNo || "",
  unit: it.unit || "", qty: it.qty ?? 1, unitPrice: it.unitPrice ?? 0,
  discountType: it.discountType || "pct", discountValue: it.discountValue || 0, notes: it.notes || "",
  code: it.code || "",/* V21.21.55: حافظ على الكود في دورة التعديل */
  /* V21.27.117: حافظ على بيانات الوحدة الثنائية في دورة التعديل (عشان منسدلة الوحدة) */
  unit2: it.unit2 || "", unit2Rate: it.unit2Rate || 0, baseUnit: it.baseUnit || "",
});

export function RfqFormModal({ data, editRfq, userName, onSave, onClose, previewNo, isMob = false }){
  const isEdit = !!editRfq?.id;
  const suppliers = data.suppliers || [];
  const fabrics = data.fabrics || [], accessories = data.accessories || [], generalProducts = data.generalProducts || [];

  const [supplierId, setSupplierId] = useState(editRfq?.supplierId || "");
  const [supplierNameAdHoc, setSupplierNameAdHoc] = useState(editRfq?.supplierNameAdHoc || "");
  const [date, setDate] = useState(editRfq?.date || new Date().toISOString().split("T")[0]);
  const [validUntil, setValidUntil] = useState(editRfq?.validUntil || "");
  const [items, setItems] = useState(editRfq?.items?.length ? editRfq.items.map(toEditorItem) : [toEditorItem({})]);
  const [notes, setNotes] = useState(editRfq?.notes || "");
  /* V21.21.43: خصم كلي على مستوى الطلب (فوق خصومات البنود) */
  const [discountPct, setDiscountPct] = useState(editRfq?.discountPct || 0);
  /* V21.21.82: عملة + سعر صرف (الجنيه = العملة الوظيفية) */
  const [currency, setCurrency] = useState(editRfq?.currency || "EGP");
  const [fxRate, setFxRate] = useState(editRfq?.fxRate && editRfq.fxRate !== 1 ? String(editRfq.fxRate) : "");

  const supOpts = suppliers.map(s => ({ value: s.id, label: s.name + (s.phone ? " — " + s.phone : "") }));

  /* قائمة مصادر الشراء الموحّدة (خامات/إكسسوار/منتج عام) + النص الحر */
  const productOptions = useMemo(() => [
    ...fabrics.map(f => ({ value: "fabric:" + f.id, label: "🧵 " + (f.code ? f.code + " - " : "") + (f.name || "") + (f.unit ? " (" + f.unit + ")" : "") })),
    ...accessories.map(a => ({ value: "accessory:" + a.id, label: "🧷 " + (a.code ? a.code + " - " : "") + (a.name || "") + (a.unit ? " (" + a.unit + ")" : "") })),
    ...generalProducts.map(p => ({ value: "generalProduct:" + p.id, label: "🏷️ " + (p.code ? p.code + " - " : "") + (p.name || p.modelNo || p.id) })),
  ], [fabrics, accessories, generalProducts]);
  const resolveProduct = (value, cur) => {
    const s = String(value); const ci = s.indexOf(":");
    const sourceType = s.slice(0, ci), sourceId = s.slice(ci + 1);
    let modelNo = "", unit = cur?.unit || "", unitPrice = cur?.unitPrice, code = "";
    /* V21.27.117: الوحدة الثنائية من الصنف الأصلي (أساسية+فرعية+معدل) */
    let unit2 = "", unit2Rate = 0, baseUnit = "";
    let src = null;
    if(sourceType === "fabric"){ src = fabrics.find(x => String(x.id) === sourceId); if(src){ modelNo = src.name || ""; code = src.code || ""; unit = src.unit || unit; unitPrice = Number(src.avgCost ?? src.price ?? 0) || unitPrice; } }
    else if(sourceType === "accessory"){ src = accessories.find(x => String(x.id) === sourceId); if(src){ modelNo = src.name || ""; code = src.code || ""; unit = src.unit || unit; unitPrice = Number(src.avgCost ?? src.price ?? 0) || unitPrice; } }
    else if(sourceType === "generalProduct"){ src = generalProducts.find(x => String(x.id) === sourceId); if(src){ modelNo = src.name || src.modelNo || ""; code = src.code || ""; unit = src.unit || unit; unitPrice = Number(src.price ?? src.cost ?? 0) || unitPrice; } }
    if(src){ unit2 = src.unit2 || ""; unit2Rate = Number(src.unit2Rate) || 0; baseUnit = src.unit || ""; }
    return { sourceType, sourceId, modelNo, description: modelNo, unit, unitPrice, code, unit2, unit2Rate, baseUnit };/* V21.21.55 / V21.27.117 */
  };

  const afterLine = useMemo(() => r2(items.reduce((s, it) => {
    if(it.isSection) return s;
    const qty = Number(it.qty) || 0, up = Number(it.unitPrice) || 0, sub = qty * up, dv = Number(it.discountValue) || 0;
    const disc = it.discountType === "amount" ? Math.min(Math.max(dv, 0), sub) : sub * (Math.min(Math.max(dv, 0), 100) / 100);
    return s + (sub - disc);
  }, 0)), [items]);
  const _pct = Math.min(Math.max(Number(discountPct) || 0, 0), 100);
  const headerDisc = r2(afterLine * (_pct / 100));
  const total = r2(afterLine - headerDisc);
  /* V21.21.82: المكافئ بالجنيه */
  const _foreign = currency !== "EGP";
  const _rate = _foreign ? (Number(fxRate) || 0) : 1;
  const totalEGP = r2(total * _rate);
  const curSym = CURRENCY_LABELS[currency] || currency;

  const handleSave = () => {
    const sup = suppliers.find(s => String(s.id) === String(supplierId));
    const payload = {
      id: editRfq?.id,
      date, validUntil,
      supplierId: supplierId || "",
      supplierName: sup?.name || "",
      supplierPhone: sup?.phone || "",
      supplierNameAdHoc: supplierId ? "" : supplierNameAdHoc.trim(),
      items: items
        .map(it => it.isSection ? it : ({ ...it, description: it.modelNo || it.description || "" }))
        .filter(it => it.isSection ? String(it.title || "").trim() : (String(it.modelNo || it.description || "").trim() || Number(it.qty) > 0)),
      notes: notes.trim(),
      discountPct: _pct,
      currency,                                       /* V21.21.82 */
      fxRate: _foreign ? (Number(fxRate) || 0) : 1,
      requestedBy: userName || "",
    };
    const v = validateRfq(payload);
    if(!v.ok){ showToast("⛔ " + v.errors[0]); return; }
    onSave(payload);
  };

  const lbl = { fontSize: FS - 2, color: T.textSec, fontWeight: 600, marginBottom: 3, display: "block" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 10001, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.cardSolid, borderRadius: 16, width: "min(980px,100%)", maxHeight: "92vh", overflowY: "auto", border: "1px solid " + T.brd, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid " + T.brd, position: "sticky", top: 0, background: T.cardSolid, zIndex: 2 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: FS + 2, color: T.text }}>{isEdit ? "✏️ تعديل طلب — " + (editRfq.rfqNo || "") : "💬 طلب عروض أسعار جديد"}</div>
            {!isEdit && <div style={{ fontSize: FS - 2, color: T.textMut, marginTop: 2 }}>الرقم الجاي: <b style={{ color: "#D97706" }}>{previewNo || nextRfqNo(data)}</b></div>}
          </div>
          <Btn ghost onClick={onClose}>✕</Btn>
        </div>

        <div style={{ padding: 20 }}>
          {/* المورد */}
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>المورد</label>
            <SearchSel value={supplierId} onChange={setSupplierId} options={supOpts} placeholder="اختر مورد..." showAllOnFocus maxResults={12} />
            {!supplierId && <div style={{ marginTop: 6 }}>
              <Inp value={supplierNameAdHoc} onChange={setSupplierNameAdHoc} placeholder="أو اكتب اسم مورد (بدون تسجيل)" />
            </div>}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <div><label style={lbl}>تاريخ الطلب</label><Inp type="date" value={date} onChange={setDate} /></div>
            <div><label style={lbl}>مهلة الرد (صالح حتى)</label><Inp type="date" value={validUntil} onChange={setValidUntil} /></div>
          </div>

          {/* V21.21.82: العملة + سعر الصرف (الأسعار بتتدخل بالعملة المختارة) */}
          <div style={{ display: "grid", gridTemplateColumns: _foreign ? "1fr 1fr" : "1fr", gap: 10, marginBottom: 14 }}>
            <div>
              <label style={lbl}>العملة</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid " + T.brd, background: T.cardSolid, color: T.text, fontFamily: "inherit", fontSize: FS - 1 }}>
                {PURCHASE_CURRENCIES.map(c => <option key={c} value={c}>{c} — {CURRENCY_LABELS[c] || c}</option>)}
              </select>
            </div>
            {_foreign && <div>
              <label style={lbl}>سعر الصرف (1 {currency} = ؟ ج.م)</label>
              <Inp type="number" value={fxRate} onChange={setFxRate} placeholder="مثال: 50" />
            </div>}
          </div>

          {/* البنود — محرّر Odoo-style */}
          <div style={{ fontSize: FS - 1, fontWeight: 800, color: T.text, marginBottom: 6 }}>الأصناف المطلوب تسعيرها</div>
          <div style={{ marginBottom: 14 }}>
            <DocLineEditor items={items} setItems={setItems} productOptions={productOptions} resolveProduct={resolveProduct} isMob={isMob} accent="#D97706" />
          </div>

          <div><label style={lbl}>ملاحظات الطلب</label><Inp value={notes} onChange={setNotes} placeholder="شروط/مواصفات إضافية..." /></div>

          {/* V21.21.43: خصم كلي + ملخص */}
          <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: 10, background: "#D9770610", border: "1px solid #D9770625" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: FS - 1, color: T.textSec }}>الإجمالي قبل الخصم الكلي</span>
              <span style={{ fontSize: FS, fontWeight: 700, direction: "ltr" }}>{fmt(afterLine.toFixed(2))}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: FS - 1, color: T.textSec, display: "flex", alignItems: "center", gap: 6 }}>
                خصم كلي
                <input type="number" min="0" max="100" value={discountPct} onChange={e => setDiscountPct(e.target.value)} style={{ width: 70, padding: "4px 8px", borderRadius: 6, border: "1px solid " + T.brd, background: T.cardSolid, color: T.text, fontFamily: "inherit", direction: "ltr", textAlign: "left", fontSize: FS - 1 }} placeholder="0" />
                <span style={{ fontSize: FS - 2, color: T.textMut }}>%</span>
              </span>
              <span style={{ fontSize: FS, fontWeight: 700, color: T.err, direction: "ltr" }}>{headerDisc > 0 ? "− " + fmt(headerDisc.toFixed(2)) : "—"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8, borderTop: "1px solid #D9770630" }}>
              <span style={{ fontSize: FS, fontWeight: 800, color: T.text }}>الإجمالي التقديري{_foreign ? " (" + currency + ")" : ""}</span>
              <span style={{ fontSize: FS + 4, fontWeight: 800, color: "#D97706", direction: "ltr" }}>{fmt(total.toFixed(2))}{_foreign ? " " + currency : ""}</span>
            </div>
            {/* V21.21.82: المكافئ بالجنيه */}
            {_foreign && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, paddingTop: 6, borderTop: "1px dashed " + T.brd }}>
              <span style={{ fontSize: FS - 1, color: T.textSec }}>= بالجنيه {_rate > 0 ? "(× " + _rate + ")" : ""}</span>
              <span style={{ fontSize: FS + 1, fontWeight: 800, color: _rate > 0 ? "#059669" : T.err, direction: "ltr" }}>{_rate > 0 ? fmt(totalEGP.toFixed(2)) + " ج.م" : "اكتب سعر الصرف"}</span>
            </div>}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "14px 20px", borderTop: "1px solid " + T.brd, position: "sticky", bottom: 0, background: T.cardSolid }}>
          <Btn ghost onClick={onClose}>إلغاء</Btn>
          <Btn primary onClick={handleSave} style={{ background: "#D97706" }}>{isEdit ? "💾 حفظ التعديل" : "💬 حفظ الطلب"}</Btn>
        </div>
      </div>
    </div>
  );
}
