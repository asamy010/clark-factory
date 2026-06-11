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
import { salePriceForCustomer } from "../../utils/pricing.js";
import { DocLineEditor } from "./DocLineEditor.jsx";

const SOURCE_LABELS = {
  order: "📋 أوردر",
  inventoryItem: "📦 صنف مخزون",
  generalProduct: "🏷️ منتج عام",
  service: "🛠️ خدمة",
};

const emptyItem = () => ({
  sourceType: "service", sourceId: "", modelNo: "", description: "", unit: "",
  qty: 1, unitPrice: 0, discountType: "pct", discountValue: 0,
});

function _addDays(iso, n){
  const t = new Date((iso || new Date().toISOString().split("T")[0]) + "T00:00:00Z").getTime();
  if(isNaN(t)) return "";
  return new Date(t + n * 86400000).toISOString().split("T")[0];
}

export function QuotationFormModal({ data, editQuote, defaultValidityDays = 14, userName, onSave, onClose, mode = "quote", previewNo, isMob = false }){
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

  /* عند اختيار مصدر → autofill الاسم + السعر + الوحدة (يُستهلك من DocLineEditor).
     V21.21.54: السعر بياخد نوع تسعير العميل تلقائياً (سعر جملة/قطاعي) لو العميل
     له نوع تسعير والصنف له سعر للنوع ده — وإلا سعر البيع الأساسي (fallback). */
  const resolveSource = (sourceType, sourceId, cur) => {
    let modelNo = "", description = "", unitPrice = cur?.unitPrice, unit = cur?.unit || "", code = "";
    const _cust = customers.find(c => c.id === customerId) || null;
    if(sourceType === "order"){
      const o = orders.find(x => x.id === sourceId);
      if(o){ modelNo = o.modelNo || ""; description = o.modelDesc || ""; unitPrice = Number(o.sellPrice) || unitPrice; if(!unit) unit = "قطعة"; }
    } else if(sourceType === "inventoryItem"){
      const it = inventoryItems.find(x => x.id === sourceId);
      if(it){ modelNo = it.name || ""; description = it.type || ""; code = it.code || ""; unitPrice = salePriceForCustomer(it, "inventoryItem", _cust) || unitPrice; unit = it.unit || unit; }
    } else if(sourceType === "generalProduct"){
      const p = generalProducts.find(x => x.id === sourceId);
      if(p){ modelNo = p.name || p.modelNo || ""; description = p.description || ""; code = p.code || ""; unitPrice = salePriceForCustomer(p, "generalProduct", _cust) || unitPrice; unit = p.unit || unit; }
    }
    return { modelNo, description, unitPrice, unit, code };/* V21.21.55: code للعرض «الكود - الاسم» */
  };

  /* قائمة منتجات موحّدة (كل المصادر) — للبحث الواحد في DocLineEditor */
  const productOptions = useMemo(() => [
    ...orders.map(o => ({ value: "order:" + o.id, label: "📋 " + (o.modelNo || "") + (o.modelDesc ? " — " + o.modelDesc : "") })),
    ...inventoryItems.map(i => ({ value: "inventoryItem:" + i.id, label: "📦 " + (i.code ? i.code + " - " : "") + (i.name || "") + (i.unit ? " (" + i.unit + ")" : "") })),
    ...generalProducts.map(p => ({ value: "generalProduct:" + p.id, label: "🏷️ " + (p.code ? p.code + " - " : "") + (p.name || p.modelNo || p.id) })),
  ], [orders, inventoryItems, generalProducts]);
  const resolveProduct = (value, cur) => {
    const s = String(value); const ci = s.indexOf(":");
    const sourceType = s.slice(0, ci); const sourceId = s.slice(ci + 1);
    return { sourceType, sourceId, ...resolveSource(sourceType, sourceId, cur) };
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
      <div onClick={e => e.stopPropagation()} style={{ background: T.cardSolid, borderRadius: 16, width: "100%", maxWidth: 980, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
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

          {/* البنود — محرّر Odoo-style (DocLineEditor) */}
          <div style={{ fontWeight: 700, fontSize: FS, color: T.text, marginBottom: 8 }}>📦 البنود</div>
          <DocLineEditor items={items} setItems={setItems} productOptions={productOptions} resolveProduct={resolveProduct} isMob={isMob} accent="#0EA5E9" />

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

function Row({ label, value, color, big }){
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0" }}>
      <span style={{ fontSize: big ? FS : FS - 2, color: big ? T.text : T.textSec, fontWeight: big ? 800 : 600 }}>{label}</span>
      <span style={{ fontSize: big ? FS + 2 : FS - 1, color: color || T.text, fontWeight: 800 }}>{value}</span>
    </div>
  );
}
