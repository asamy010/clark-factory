/* ═══════════════════════════════════════════════════════════════════════
   CLARK · SalesOrderDetailModal (V21.10.1 — Phase 12b)
   تفاصيل أمر البيع + لوحة cross-links (العرض المصدر + الفاتورة) + إلغاء
   (مع استرجاع مخزون) + طباعة. زرار "إنشاء فاتورة" معطّل لحد Slice 3.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState } from "react";
import { Btn } from "../ui.jsx";
import { T } from "../../theme.js";
import { FS } from "../../constants/index.js";
import { fmt } from "../../utils/format.js";
import { openSalesDoc } from "../../utils/sales/navDoc.js";
import { printPage } from "../../utils/print.js";
import { buildSalesDocHTML } from "../../utils/sales/docPrint.js";
import { DocItemsTable, DocTotals } from "../DocItemsTable.jsx";
import { SendDocWhatsApp } from "../SendDocWhatsApp.jsx";

const STATUS_META = {
  confirmed:         { label: "مؤكّد",        color: "#0EA5E9", bg: "#0EA5E915" },
  partial_delivered: { label: "تسليم جزئي",   color: "#F59E0B", bg: "#F59E0B15" },
  delivered:         { label: "مُسلّم",        color: "#10B981", bg: "#10B98115" },
  invoiced:          { label: "مفوتر",        color: "#8B5CF6", bg: "#8B5CF615" },
  cancelled:         { label: "ملغي",         color: "#EF4444", bg: "#EF444415" },
};

const SHIPPING_COMPANIES = ["بوسطة", "أرامكس", "ميلرز", "R2S", "البريد المصري", "سمسا", "خطّاب", "شركة أخرى"];

export function SalesOrderDetailModal({ so, data, canEdit, onCancelOrder, onDelete, onEdit, onCreateInvoice, onSetShipping, onPrintWaybill, onClose }){
  if(!so) return null;
  const meta = STATUS_META[so.status] || STATUS_META.confirmed;
  const canCancel = canEdit && so.status !== "cancelled" && so.status !== "invoiced";
  /* V21.10.3: invoice existence (self-heal — re-invoice if the doc is missing) */
  const invExists = !!(so.salesInvoiceId && (data?.salesInvoices || []).some(i => i && i.id === so.salesInvoiceId));
  const invMissing = !!so.salesInvoiceId && !invExists;
  const canInvoice = canEdit && so.status !== "cancelled" && !invExists;
  const isMirror = !!so.sourceDistributionId; /* V21.21.1: مرآة توزيعة — مقفولة للتعديل */
  const canEditOrder = canEdit && so.status !== "cancelled" && !invExists && !isMirror; /* مايتعدّلش لو ملغي أو مفوتر أو مرآة توزيعة */
  const [sendWa, setSendWa] = useState(false);
  /* V21.21.16: شحن عبر شركة + بوليصة حرارية */
  const isShipping = (so.shipping && so.shipping.method) === "shipping";
  const [shipOn, setShipOn] = useState(isShipping);
  const [shipCompany, setShipCompany] = useState((so.shipping && so.shipping.company) || "");
  const shipDirty = shipOn !== isShipping || (shipCompany.trim() !== ((so.shipping && so.shipping.company) || ""));

  return (<>
    <div className="pop-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 99998, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => { if(e.target === e.currentTarget) onClose(); }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.cardSolid, borderRadius: 16, width: "100%", maxWidth: 880, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ position: "sticky", top: 0, background: T.cardSolid, padding: "16px 18px", borderBottom: "1px solid " + T.brd, display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontWeight: 800, fontSize: FS + 2, color: T.text }}>{so.orderNo}</div>
            <span style={{ fontSize: FS - 3, fontWeight: 700, color: meta.color, background: meta.bg, padding: "2px 10px", borderRadius: 20 }}>{meta.label}</span>
          </div>
          <Btn ghost small onClick={onClose}>✕</Btn>
        </div>

        <div style={{ padding: 18 }}>
          {isMirror && <div style={{ background: "#10B98110", border: "1px solid #10B98130", color: "#047857", borderRadius: 10, padding: "8px 12px", fontSize: FS - 2, marginBottom: 12, fontWeight: 600 }}>🧾 أمر متولّد من {so.distributionNo || "توزيعة"} (مرآة مقفولة). التوزيعة هي مصدر الرصيد والمخزون — للتعديل عدّل التوزيعة وأعد التأكيد.</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: FS - 1, marginBottom: 14 }}>
            <div><span style={{ color: T.textMut }}>العميل: </span><b style={{ color: T.text }}>{so.customerName || so.customerNameAdHoc || "—"}</b></div>
            <div><span style={{ color: T.textMut }}>الهاتف: </span><span style={{ color: T.text }}>{so.customerPhone || "—"}</span></div>
            <div><span style={{ color: T.textMut }}>التاريخ: </span><span style={{ color: T.text }}>{so.date}</span></div>
            <div><span style={{ color: T.textMut }}>المخزون: </span><span style={{ color: so.stockDeducted ? "#10B981" : T.textMut }}>{so.stockDeducted ? "متخصم ✓" : "غير متخصم"}</span></div>
          </div>

          {/* البنود — V21.21.45: أعمدة موحّدة + نسبة الخصم + الإجماليات/التفقيط */}
          <DocItemsTable items={so.items} headerDiscountPct={so.discountPct} accent="#0EA5E9" />
          <DocTotals items={so.items} headerDiscountPct={so.discountPct} accent="#0EA5E9" />

          {/* V21.27.97: المرتجعات — مستندات منفصلة (الأمر يفضل كامل فوق). كل
              مرتجع له إشعار دائن. الصافي = الأمر − المرتجعات. */}
          {Array.isArray(so.returns) && so.returns.length > 0 && (() => {
            const retVal = so.returns.reduce((s, r) => s + (Number(r && r.net) || 0), 0);
            const retQty = so.returns.reduce((s, r) => s + (Number(r && r.qty) || 0), 0);
            return (
              <div style={{ background: "#EF444408", border: "1px solid #EF444425", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
                <div style={{ fontWeight: 800, color: T.err, fontSize: FS - 1, marginBottom: 6 }}>↩️ مرتجعات ({retQty} قطعة · {fmt(retVal)})</div>
                {so.returns.map((r, i) => (
                  <div key={r.id || i} style={{ display: "flex", justifyContent: "space-between", fontSize: FS - 2, color: T.text, padding: "3px 0", borderTop: i ? "1px solid " + T.brd : "none" }}>
                    <span>{r.date} · {r.modelNo || ""} × {r.qty}{r.creditNoteNo ? <span style={{ color: "#8B5CF6", marginInlineStart: 6 }}>🧾 {r.creditNoteNo}</span> : null}</span>
                    <span style={{ fontWeight: 700, color: T.err }}>-{fmt(Number(r.net) || 0)}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: FS, color: "#047857", borderTop: "2px solid " + T.brd, marginTop: 6, paddingTop: 6 }}>
                  <span>الصافي بعد المرتجع</span><span>{fmt((Number(so.total) || 0) - retVal)}</span>
                </div>
              </div>
            );
          })()}

          {/* cross-links */}
          <div style={{ background: "#8B5CF608", border: "1px dashed #8B5CF630", borderRadius: 10, padding: "10px 12px", marginBottom: 12, fontSize: FS - 2 }}>
            <div style={{ fontWeight: 700, color: "#8B5CF6", marginBottom: 4 }}>🔗 المستندات المرتبطة</div>
            {so.fromQuotationId
              ? <div onClick={() => openSalesDoc("quotation", so.fromQuotationId)} style={{ color: "#8B5CF6", cursor: "pointer", fontWeight: 600 }}>عرض السعر: <b>{so.fromQuotationNo || "—"}</b> ↗</div>
              : <div style={{ color: T.textMut }}>عرض السعر: — (أمر مباشر)</div>}
            {invExists
              ? <div onClick={() => openSalesDoc("invoice", so.salesInvoiceId)} style={{ color: "#8B5CF6", cursor: "pointer", fontWeight: 600 }}>الفاتورة: <b>{so.salesInvoiceNo}</b> ↗</div>
              : invMissing
                ? <div style={{ color: T.err }}>⚠️ الفاتورة ({so.salesInvoiceNo}) مكانتش اتحفظت — اضغط «إعادة إنشاء فاتورة»</div>
                : <div style={{ color: T.textMut }}>الفاتورة: — لسه مفيش</div>}
          </div>

          {so.status === "cancelled" && so.cancelReason && (
            <div style={{ fontSize: FS - 2, color: T.err, marginBottom: 12 }}><b>سبب الإلغاء:</b> {so.cancelReason}</div>
          )}

          {Array.isArray(so.statusHistory) && so.statusHistory.length > 0 && (
            <details style={{ marginBottom: 8 }}>
              <summary style={{ cursor: "pointer", fontSize: FS - 2, color: T.textMut, fontWeight: 600 }}>سجل الحالة ({so.statusHistory.length})</summary>
              <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
                {so.statusHistory.map((h, i) => (
                  <div key={i} style={{ fontSize: FS - 3, color: T.textMut }}>{(STATUS_META[h.to]?.label || h.to)}{h.note ? " — " + h.note : ""} · {h.by || "—"} · {(h.at || "").slice(0, 16).replace("T", " ")}</div>
                ))}
              </div>
            </details>
          )}

          {/* V21.21.16: الشحن عبر شركة + بوليصة حرارية 15×10 */}
          {onSetShipping && (
            <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 12, background: shipOn ? "#0EA5E908" : T.bg, border: "1px solid " + (shipOn ? "#0EA5E940" : T.brd) }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontWeight: 800, fontSize: FS, color: T.text, marginBottom: shipOn ? 10 : 0 }}>
                <input type="checkbox" checked={shipOn} onChange={e => { setShipOn(e.target.checked); }} style={{ width: 17, height: 17, cursor: "pointer" }} />
                🚚 الأوردر هيوصل عن طريق شركة شحن
              </label>
              {shipOn && <>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 600, display: "block", marginBottom: 4 }}>شركة الشحن</label>
                    <input list="so-ship-companies" value={shipCompany} onChange={e => setShipCompany(e.target.value)} placeholder="اختر أو اكتب اسم الشركة..." style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid " + T.brd, fontSize: FS, fontFamily: "inherit", background: T.cardSolid, color: T.text, boxSizing: "border-box" }} />
                    <datalist id="so-ship-companies">{SHIPPING_COMPANIES.map(c => <option key={c} value={c} />)}</datalist>
                  </div>
                  {canEdit && shipDirty && <Btn small onClick={() => onSetShipping({ method: "shipping", company: shipCompany })} style={{ background: T.ok, color: "#fff", border: "none" }}>💾 حفظ</Btn>}
                </div>
                <Btn small onClick={onPrintWaybill} disabled={!shipCompany.trim() || shipDirty} style={{ marginTop: 10, background: "#0EA5E9", color: "#fff", border: "none" }} title={shipDirty ? "احفظ شركة الشحن أولاً" : ""}>🖨 طباعة بوليصة الشحن (15×10)</Btn>
                {shipDirty && shipCompany.trim() && <div style={{ fontSize: FS - 3, color: T.warn, marginTop: 4 }}>احفظ التغييرات قبل الطباعة.</div>}
              </>}
            </div>
          )}
        </div>

        <div style={{ position: "sticky", bottom: 0, background: T.cardSolid, padding: "12px 18px", borderTop: "1px solid " + T.brd, display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Btn ghost small onClick={() => printPage("أمر بيع — " + (so.orderNo || ""), buildSalesDocHTML(so, data, "order"), { factoryName: data.factoryName, logo: data.logo })}>🖨 طباعة / PDF</Btn>
          <Btn ghost small onClick={() => setSendWa(true)} style={{ color: "#1DA851" }}>📤 إرسال واتساب</Btn>
          {canEditOrder && onEdit && <Btn ghost small onClick={onEdit} style={{ color: T.accent }}>✏️ تعديل</Btn>}
          {canCancel && <Btn ghost small onClick={onCancelOrder} style={{ color: T.err }}>✗ إلغاء الأمر (استرجاع مخزون)</Btn>}
          {canEdit && onDelete && <Btn ghost small onClick={onDelete} style={{ color: T.err }}>🗑 حذف الأمر</Btn>}
          {canInvoice
            ? <Btn small onClick={() => onCreateInvoice && onCreateInvoice(so)} style={{ background: "#8B5CF6", color: "#fff" }}>🧾 {invMissing ? "إعادة إنشاء فاتورة" : "إنشاء فاتورة"}</Btn>
            : invExists
              ? <span style={{ alignSelf: "center", fontSize: FS - 2, color: "#8B5CF6", fontWeight: 700 }}>🧾 {so.salesInvoiceNo}</span>
              : null}
        </div>
      </div>
    </div>
    {sendWa && <SendDocWhatsApp data={data} doc={so} kind="order" onClose={() => setSendWa(false)} />}
    </>
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
