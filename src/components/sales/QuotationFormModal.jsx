/* ═══════════════════════════════════════════════════════════════════════
   CLARK · QuotationFormModal (V21.10.0 — Phase 12a)
   إنشاء/تعديل عرض سعر. Item picker من 4 مصادر: أوردر / صنف مخزون /
   منتج عام / خدمة (نص حر). إجماليات live. مفيش مساس مخزون/محاسبة.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { Btn, Inp, Sel, SearchSel } from "../ui.jsx";
import { T } from "../../theme.js";
import { FS } from "../../constants/index.js";
import { fmt } from "../../utils/format.js";
import { showToast } from "../../utils/popups.js";
import { recalcQuotationTotals, validateQuotation, nextQuotationNo } from "../../utils/sales/quotations.js";

const SOURCE_LABELS = {
  order: "📋 أوردر",
  inventoryItem: "📦 صنف مخزون",
  generalProduct: "🏷️ منتج عام",
  service: "🛠️ خدمة",
};

const emptyItem = () => ({
  sourceType: "service", sourceId: "", modelNo: "", description: "",
  qty: 1, unitPrice: 0, discountType: "pct", discountValue: 0,
});

function _addDays(iso, n){
  const t = new Date((iso || new Date().toISOString().split("T")[0]) + "T00:00:00Z").getTime();
  if(isNaN(t)) return "";
  return new Date(t + n * 86400000).toISOString().split("T")[0];
}

export function QuotationFormModal({ data, editQuote, defaultValidityDays = 14, userName, onSave, onClose, mode = "quote", previewNo }){
  const isOrder = mode === "order";
  const customers = useMemo(() => (data.customers || []).filter(c => !c.archived), [data.customers]);
  const orders = data.orders || [];
  const inventoryItems = data.inventoryItems || [];
  const generalProducts = data.generalProducts || [];

  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(editQuote?.date || today);
  const [validUntil, setValidUntil] = useState(editQuote?.validUntil || _addDays(today, defaultValidityDays));
  const [customerId, setCustomerId] = useState(editQuote?.customerId || "");
  const [customerNameAdHoc, setCustomerNameAdHoc] = useState(editQuote?.customerNameAdHoc || "");
  const [items, setItems] = useState(() =>
    (editQuote?.items && editQuote.items.length) ? editQuote.items.map(it => ({ ...it })) : [emptyItem()]
  );
  const [discountPct, setDiscountPct] = useState(editQuote?.discountPct || 0);
  const [notes, setNotes] = useState(editQuote?.notes || "");

  const isEdit = !!editQuote?.id;

  /* live totals */
  const totals = useMemo(
    () => recalcQuotationTotals({ items, discountPct }),
    [items, discountPct]
  );

  const setItem = (idx, patch) => setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  const addItem = () => setItems(prev => [...prev, emptyItem()]);
  const removeItem = (idx) => setItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);

  /* when source picked → autofill name + price */
  const pickSource = (idx, sourceType, sourceId) => {
    let modelNo = "", description = "", unitPrice = items[idx].unitPrice;
    if(sourceType === "order"){
      const o = orders.find(x => x.id === sourceId);
      if(o){ modelNo = o.modelNo || ""; description = o.modelDesc || ""; unitPrice = Number(o.sellPrice) || unitPrice; }
    } else if(sourceType === "inventoryItem"){
      const it = inventoryItems.find(x => x.id === sourceId);
      if(it){ modelNo = it.name || ""; description = it.type || ""; unitPrice = Number(it.price ?? it.sellPrice ?? 0) || unitPrice; }
    } else if(sourceType === "generalProduct"){
      const p = generalProducts.find(x => x.id === sourceId);
      if(p){ modelNo = p.name || p.modelNo || ""; description = p.description || ""; unitPrice = Number(p.price ?? p.sellPrice ?? 0) || unitPrice; }
    }
    setItem(idx, { sourceId, modelNo, description, unitPrice });
  };

  const sourceOptions = (sourceType) => {
    if(sourceType === "order") return orders.map(o => ({ value: o.id, label: (o.modelNo || "") + (o.modelDesc ? " — " + o.modelDesc : "") }));
    if(sourceType === "inventoryItem") return inventoryItems.map(i => ({ value: i.id, label: i.name + (i.unit ? " (" + i.unit + ")" : "") }));
    if(sourceType === "generalProduct") return generalProducts.map(p => ({ value: p.id, label: p.name || p.modelNo || p.id }));
    return [];
  };

  const handleSave = () => {
    const cust = customers.find(c => c.id === customerId);
    const payload = {
      id: editQuote?.id,
      date, validUntil,
      customerId,
      customerName: cust?.name || "",
      customerPhone: cust?.phone || "",
      customerNameAdHoc: customerId ? "" : customerNameAdHoc.trim(),
      items, discountPct, notes,
    };
    const v = validateQuotation(payload);
    if(!v.ok){ showToast("⛔ " + v.errors[0]); return; }
    onSave(payload);
  };

  return (
    <div className="pop-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 99998, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => { if(e.target === e.currentTarget) onClose(); }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.cardSolid, borderRadius: 16, width: "100%", maxWidth: 720, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ position: "sticky", top: 0, background: T.cardSolid, padding: "16px 18px", borderBottom: "1px solid " + T.brd, display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 2 }}>
          <div style={{ fontWeight: 800, fontSize: FS + 2, color: T.text }}>{isOrder ? (isEdit ? "✏️ تعديل أمر بيع" : "📑 أمر بيع جديد") : (isEdit ? "✏️ تعديل عرض — " + (editQuote.quoteNo || "") : "📋 عرض سعر جديد")}</div>
          <Btn ghost small onClick={onClose}>✕</Btn>
        </div>

        <div style={{ padding: 18 }}>
          {!isEdit && <div style={{ fontSize: FS - 2, color: T.textMut, marginBottom: 10 }}>الرقم الجاي: <b style={{ color: "#0EA5E9" }}>{previewNo || nextQuotationNo(data)}</b></div>}

          {/* العميل */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 600 }}>العميل</label>
              <SearchSel value={customerId} onChange={v => { setCustomerId(v); if(v) setCustomerNameAdHoc(""); }} options={customers.map(c => ({ value: c.id, label: c.name + (c.phone ? " — " + c.phone : "") }))} placeholder="اختر عميل..." showAllOnFocus maxResults={12} />
            </div>
            <div>
              <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 600 }}>أو اسم عميل (غير مسجّل)</label>
              <Inp value={customerNameAdHoc} onChange={v => { setCustomerNameAdHoc(v); if(v) setCustomerId(""); }} placeholder="اسم العميل..." />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isOrder ? "1fr" : "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <div><label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 600 }}>{isOrder ? "تاريخ الأمر" : "تاريخ العرض"}</label><Inp type="date" value={date} onChange={setDate} /></div>
            {!isOrder && <div><label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 600 }}>صالح حتى</label><Inp type="date" value={validUntil} onChange={setValidUntil} /></div>}
          </div>

          {/* البنود */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontWeight: 700, fontSize: FS, color: T.text }}>📦 البنود</div>
            <Btn ghost small onClick={addItem}>+ بند</Btn>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((it, idx) => (
              <div key={idx} style={{ border: "1px solid " + T.brd, borderRadius: 10, padding: 10, background: T.bg }}>
                <div style={{ display: "grid", gridTemplateColumns: "120px 1fr auto", gap: 8, alignItems: "end" }}>
                  <div>
                    <label style={{ fontSize: FS - 3, color: T.textMut, fontWeight: 600 }}>المصدر</label>
                    <Sel value={it.sourceType} onChange={v => setItem(idx, { sourceType: v, sourceId: "", modelNo: v === "service" ? it.modelNo : "", description: "" })}>
                      {Object.entries(SOURCE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </Sel>
                  </div>
                  <div>
                    {it.sourceType === "service" ? (
                      <>
                        <label style={{ fontSize: FS - 3, color: T.textMut, fontWeight: 600 }}>الوصف</label>
                        <Inp value={it.description || it.modelNo} onChange={v => setItem(idx, { description: v, modelNo: v })} placeholder="وصف الخدمة/البند..." />
                      </>
                    ) : (
                      <>
                        <label style={{ fontSize: FS - 3, color: T.textMut, fontWeight: 600 }}>اختر {SOURCE_LABELS[it.sourceType]}</label>
                        <SearchSel value={it.sourceId} onChange={v => pickSource(idx, it.sourceType, v)} options={sourceOptions(it.sourceType)} placeholder="ابحث..." showAllOnFocus maxResults={10} />
                      </>
                    )}
                  </div>
                  <Btn ghost small onClick={() => removeItem(idx)} style={{ color: T.err }}>🗑</Btn>
                </div>
                {it.sourceType !== "service" && (it.modelNo || it.description) && (
                  <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 4 }}>{it.modelNo}{it.description ? " — " + it.description : ""}</div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 8, marginTop: 8, alignItems: "end" }}>
                  <div><label style={{ fontSize: FS - 3, color: T.textMut, fontWeight: 600 }}>كمية</label><Inp type="number" value={it.qty} onChange={v => setItem(idx, { qty: v })} /></div>
                  <div><label style={{ fontSize: FS - 3, color: T.textMut, fontWeight: 600 }}>سعر الوحدة</label><Inp type="number" value={it.unitPrice} onChange={v => setItem(idx, { unitPrice: v })} /></div>
                  <div><label style={{ fontSize: FS - 3, color: T.textMut, fontWeight: 600 }}>نوع الخصم</label><Sel value={it.discountType} onChange={v => setItem(idx, { discountType: v })}><option value="pct">%</option><option value="amount">مبلغ</option></Sel></div>
                  <div><label style={{ fontSize: FS - 3, color: T.textMut, fontWeight: 600 }}>قيمة الخصم</label><Inp type="number" value={it.discountValue} onChange={v => setItem(idx, { discountValue: v })} /></div>
                  <div style={{ fontWeight: 800, color: T.text, fontSize: FS, paddingBottom: 6, whiteSpace: "nowrap" }}>{fmt(recalcLineTotal(it))}</div>
                </div>
              </div>
            ))}
          </div>

          {/* خصم الرأس + ملاحظات + إجماليات */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
            <div>
              <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 600 }}>خصم إجمالي (%)</label>
              <Inp type="number" value={discountPct} onChange={setDiscountPct} />
              <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 600, marginTop: 8, display: "block" }}>ملاحظات</label>
              <Inp value={notes} onChange={setNotes} placeholder="ملاحظات على العرض..." />
            </div>
            <div style={{ background: T.bg, borderRadius: 10, padding: 12, border: "1px solid " + T.brd, alignSelf: "start" }}>
              <Row label="الإجمالي قبل الخصم" value={fmt(totals.subtotal)} />
              <Row label="إجمالي الخصومات" value={"− " + fmt(totals.totalDiscount)} color={T.err} />
              <div style={{ height: 1, background: T.brd, margin: "8px 0" }} />
              <Row label="الإجمالي" value={fmt(totals.total)} big />
            </div>
          </div>
        </div>

        <div style={{ position: "sticky", bottom: 0, background: T.cardSolid, padding: "12px 18px", borderTop: "1px solid " + T.brd, display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn ghost onClick={onClose}>إلغاء</Btn>
          <Btn primary onClick={handleSave} style={{ background: "#0EA5E9" }}>{isOrder ? (isEdit ? "💾 حفظ" : "📑 حفظ أمر البيع") : (isEdit ? "💾 حفظ التعديل" : "📋 حفظ العرض")}</Btn>
        </div>
      </div>
    </div>
  );
}

/* inline line-total preview (mirrors recalcLine without importing — qty*price-discount) */
function recalcLineTotal(it){
  const qty = Number(it.qty) || 0, up = Number(it.unitPrice) || 0;
  const sub = qty * up;
  const dv = Number(it.discountValue) || 0;
  const disc = it.discountType === "amount" ? Math.min(Math.max(dv, 0), sub) : sub * (Math.min(Math.max(dv, 0), 100) / 100);
  return Math.round((sub - disc) * 100) / 100;
}

function Row({ label, value, color, big }){
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0" }}>
      <span style={{ fontSize: big ? FS : FS - 2, color: big ? T.text : T.textSec, fontWeight: big ? 800 : 600 }}>{label}</span>
      <span style={{ fontSize: big ? FS + 2 : FS - 1, color: color || T.text, fontWeight: 800 }}>{value}</span>
    </div>
  );
}
