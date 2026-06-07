/* ═══════════════════════════════════════════════════════════════════════
   CLARK · RfqFormModal (V21.12.1) — إنشاء/تعديل طلب عروض أسعار
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { Btn, Inp, SearchSel } from "../ui.jsx";
import { T } from "../../theme.js";
import { FS } from "../../constants/index.js";
import { fmt, r2 } from "../../utils/format.js";
import { ask, showToast } from "../../utils/popups.js";
import { nextRfqNo, validateRfq } from "../../utils/purchase/rfq.js";

const blankItem = () => ({ description: "", qty: 1, unit: "", unitPrice: 0, notes: "" });

export function RfqFormModal({ data, editRfq, userName, onSave, onClose, previewNo }){
  const isEdit = !!editRfq?.id;
  const suppliers = data.suppliers || [];

  const [supplierId, setSupplierId] = useState(editRfq?.supplierId || "");
  const [supplierNameAdHoc, setSupplierNameAdHoc] = useState(editRfq?.supplierNameAdHoc || "");
  const [date, setDate] = useState(editRfq?.date || new Date().toISOString().split("T")[0]);
  const [validUntil, setValidUntil] = useState(editRfq?.validUntil || "");
  const [items, setItems] = useState(editRfq?.items?.length ? editRfq.items.map(it => ({ ...it })) : [blankItem()]);
  const [notes, setNotes] = useState(editRfq?.notes || "");

  const supOpts = suppliers.map(s => ({ value: s.id, label: s.name + (s.phone ? " — " + s.phone : "") }));
  const total = useMemo(() => r2(items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0)), [items]);

  const setItem = (i, k, v) => setItems(arr => arr.map((it, j) => j === i ? { ...it, [k]: v } : it));
  const addItem = () => setItems(arr => [...arr, blankItem()]);
  const delItem = (i) => setItems(arr => arr.length > 1 ? arr.filter((_, j) => j !== i) : arr);

  const handleSave = () => {
    const sup = suppliers.find(s => String(s.id) === String(supplierId));
    const payload = {
      id: editRfq?.id,
      date, validUntil,
      supplierId: supplierId || "",
      supplierName: sup?.name || "",
      supplierPhone: sup?.phone || "",
      supplierNameAdHoc: supplierId ? "" : supplierNameAdHoc.trim(),
      items: items.filter(it => String(it.description || "").trim() || Number(it.qty) > 0),
      notes: notes.trim(),
      requestedBy: userName || "",
    };
    const v = validateRfq(payload);
    if(!v.ok){ showToast("⛔ " + v.errors[0]); return; }
    onSave(payload);
  };

  const lbl = { fontSize: FS - 2, color: T.textSec, fontWeight: 600, marginBottom: 3, display: "block" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 10001, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.cardSolid, borderRadius: 16, width: "min(820px,100%)", maxHeight: "92vh", overflowY: "auto", border: "1px solid " + T.brd, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
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

          {/* البنود */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: FS - 1, fontWeight: 800, color: T.text }}>الأصناف المطلوب تسعيرها</span>
            <Btn small onClick={addItem} style={{ background: "#D9770612", color: "#D97706", border: "1px solid #D9770630" }}>+ بند</Btn>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            {items.map((it, i) => (
              <div key={i} style={{ border: "1px solid " + T.brd, borderRadius: 10, padding: 10, background: T.bg }}>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 0.7fr 0.7fr 0.9fr auto", gap: 6, alignItems: "end" }}>
                  <div><label style={lbl}>الصنف / الوصف</label><Inp value={it.description} onChange={v => setItem(i, "description", v)} placeholder="اسم الصنف" /></div>
                  <div><label style={lbl}>الكمية</label><Inp type="number" value={it.qty} onChange={v => setItem(i, "qty", v)} /></div>
                  <div><label style={lbl}>الوحدة</label><Inp value={it.unit} onChange={v => setItem(i, "unit", v)} placeholder="متر/قطعة" /></div>
                  <div><label style={lbl}>سعر متوقع</label><Inp type="number" value={it.unitPrice} onChange={v => setItem(i, "unitPrice", v)} /></div>
                  <Btn small ghost onClick={() => delItem(i)} style={{ color: T.err }}>🗑</Btn>
                </div>
                <div style={{ marginTop: 6 }}><Inp value={it.notes} onChange={v => setItem(i, "notes", v)} placeholder="ملاحظات البند (اختياري)" /></div>
              </div>
            ))}
          </div>

          <div><label style={lbl}>ملاحظات الطلب</label><Inp value={notes} onChange={setNotes} placeholder="شروط/مواصفات إضافية..." /></div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, padding: "12px 14px", borderRadius: 10, background: "#D9770610", border: "1px solid #D9770625" }}>
            <span style={{ fontSize: FS, fontWeight: 700, color: T.textSec }}>الإجمالي التقديري</span>
            <span style={{ fontSize: FS + 4, fontWeight: 800, color: "#D97706", direction: "ltr" }}>{fmt(total.toFixed(2))}</span>
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
