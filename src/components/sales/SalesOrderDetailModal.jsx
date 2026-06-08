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
import { SendDocWhatsApp } from "../SendDocWhatsApp.jsx";

const STATUS_META = {
  confirmed:         { label: "مؤكّد",        color: "#0EA5E9", bg: "#0EA5E915" },
  partial_delivered: { label: "تسليم جزئي",   color: "#F59E0B", bg: "#F59E0B15" },
  delivered:         { label: "مُسلّم",        color: "#10B981", bg: "#10B98115" },
  invoiced:          { label: "مفوتر",        color: "#8B5CF6", bg: "#8B5CF615" },
  cancelled:         { label: "ملغي",         color: "#EF4444", bg: "#EF444415" },
};

export function SalesOrderDetailModal({ so, data, canEdit, onCancelOrder, onDelete, onEdit, onCreateInvoice, onClose }){
  if(!so) return null;
  const meta = STATUS_META[so.status] || STATUS_META.confirmed;
  const canCancel = canEdit && so.status !== "cancelled" && so.status !== "invoiced";
  /* V21.10.3: invoice existence (self-heal — re-invoice if the doc is missing) */
  const invExists = !!(so.salesInvoiceId && (data?.salesInvoices || []).some(i => i && i.id === so.salesInvoiceId));
  const invMissing = !!so.salesInvoiceId && !invExists;
  const canInvoice = canEdit && so.status !== "cancelled" && !invExists;
  const canEditOrder = canEdit && so.status !== "cancelled" && !invExists; /* مايتعدّلش لو ملغي أو مفوتر */
  const [sendWa, setSendWa] = useState(false);

  return (<>
    <div className="pop-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 99998, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => { if(e.target === e.currentTarget) onClose(); }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.cardSolid, borderRadius: 16, width: "100%", maxWidth: 620, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ position: "sticky", top: 0, background: T.cardSolid, padding: "16px 18px", borderBottom: "1px solid " + T.brd, display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontWeight: 800, fontSize: FS + 2, color: T.text }}>{so.orderNo}</div>
            <span style={{ fontSize: FS - 3, fontWeight: 700, color: meta.color, background: meta.bg, padding: "2px 10px", borderRadius: 20 }}>{meta.label}</span>
          </div>
          <Btn ghost small onClick={onClose}>✕</Btn>
        </div>

        <div style={{ padding: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: FS - 1, marginBottom: 14 }}>
            <div><span style={{ color: T.textMut }}>العميل: </span><b style={{ color: T.text }}>{so.customerName || so.customerNameAdHoc || "—"}</b></div>
            <div><span style={{ color: T.textMut }}>الهاتف: </span><span style={{ color: T.text }}>{so.customerPhone || "—"}</span></div>
            <div><span style={{ color: T.textMut }}>التاريخ: </span><span style={{ color: T.text }}>{so.date}</span></div>
            <div><span style={{ color: T.textMut }}>المخزون: </span><span style={{ color: so.stockDeducted ? "#10B981" : T.textMut }}>{so.stockDeducted ? "متخصم ✓" : "غير متخصم"}</span></div>
          </div>

          {/* البنود */}
          <div style={{ border: "1px solid " + T.brd, borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FS - 2 }}>
              <thead><tr style={{ background: T.bg }}>
                <th style={{ textAlign: "right", padding: "8px 10px" }}>البند</th>
                <th style={{ textAlign: "center", padding: "8px 6px" }}>كمية</th>
                <th style={{ textAlign: "left", padding: "8px 10px" }}>السعر</th>
                <th style={{ textAlign: "left", padding: "8px 10px" }}>الإجمالي</th>
              </tr></thead>
              <tbody>
                {(so.items || []).map((it, i) => it.isSection ? (
                  <tr key={i} style={{ borderTop: "1px solid " + T.brd, background: "#0EA5E90c" }}>
                    <td colSpan={4} style={{ padding: "8px 10px", fontWeight: 800, color: "#0EA5E9" }}>📑 {it.title || ""}</td>
                  </tr>
                ) : (
                  <tr key={i} style={{ borderTop: "1px solid " + T.brd }}>
                    <td style={{ padding: "8px 10px", color: T.text }}>{it.modelNo || it.description || "—"}{it.unit ? <span style={{ color: T.textMut, fontSize: FS - 4 }}> / {it.unit}</span> : null}{it.sourceType === "inventoryItem" ? <span style={{ color: "#0EA5E9", fontSize: FS - 4 }}> 📦</span> : null}</td>
                    <td style={{ textAlign: "center", padding: "8px 6px", color: T.textSec }}>{it.qty}</td>
                    <td style={{ textAlign: "left", padding: "8px 10px", color: T.textSec }}>{fmt(it.unitPrice)}</td>
                    <td style={{ textAlign: "left", padding: "8px 10px", fontWeight: 700, color: T.text }}>{fmt(it.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ background: T.bg, borderRadius: 10, padding: 12, border: "1px solid " + T.brd, marginBottom: 12 }}>
            <Row label="الإجمالي قبل الخصم" value={fmt(so.subtotal)} />
            <Row label="إجمالي الخصومات" value={"− " + fmt(so.totalDiscount)} color={T.err} />
            <div style={{ height: 1, background: T.brd, margin: "6px 0" }} />
            <Row label="الإجمالي" value={fmt(so.total)} big />
          </div>

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
