/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Invoice Print (V18.51)
   ───────────────────────────────────────────────────────────────────────
   Generates a professional HTML invoice in a new window for printing.
   Supports sales invoices, purchase invoices, and credit notes.
   ═══════════════════════════════════════════════════════════════════════ */

import { openPrintWindow } from "./print.js";
import { PRINT_CSS } from "../constants/index.js";
import { ltrPhone } from "./format.js";
import { docColumnsHTML, sumQtyByUnit, fmtQtyByUnit, salesAckHTML } from "./docColumns.js";

const fmt = n => Math.round(Number(n)||0).toLocaleString("en-US");
const r2  = n => Math.round((Number(n)||0)*100)/100;
const fmt2 = n => (Math.round((Number(n)||0)*100)/100).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});

/* Print a sales/purchase invoice. type: "sales" | "purchase" */
export function printInvoice(invoice, party, factoryInfo, type){
  const w = openPrintWindow();
  if(!w){ alert("المتصفح بيمنع فتح نافذة الطباعة — فعّل النوافذ المنبثقة"); return; }

  const isPurchase = type === "purchase";
  /* V21.27.121/125: تصميم أبيض/أسود (mono) للمبيعات والمشتريات (طلب Ahmed). */
  const mono = true;
  const docTitle = isPurchase ? "فاتورة مشتريات" : "فاتورة مبيعات";
  const docIcon  = isPurchase ? "📥" : "📤";
  const accentColor = "#333333";
  const partyLabel = isPurchase ? "المورد" : "العميل";

  /* V21.21.42: البنود اتنقلت لجدول الأعمدة الموحّد (docColumnsHTML) تحت. */
  const factoryName = (factoryInfo && factoryInfo.name) || "CLARK ERP System";
  const factoryAddr = (factoryInfo && factoryInfo.address) || "";
  const factoryPhone = (factoryInfo && factoryInfo.phone) || "";
  const factoryEmail = (factoryInfo && factoryInfo.email) || "";

  /* V21.27.121: شارة الحالة بالأبيض/أسود في المبيعات */
  const _badge = (txt, c) => `<span style="background:${mono ? "#eee" : c + "15"};color:${mono ? "#333" : c};padding:4px 12px;border-radius:6px;font-weight:700;font-size:12px;border:${mono ? "1px solid #ccc" : "none"}">${txt}</span>`;
  const statusBadge = invoice.status === "posted"
    ? _badge("✓ مرحّلة", "#10B981")
    : invoice.status === "void"
    ? _badge("✕ ملغية", "#EF4444")
    : _badge("📝 مسودة", "#6B7280");

  const html = `<html dir="rtl">
<head>
<meta charset="UTF-8">
<title>${invoice.invoiceNo}</title>
<style>
${PRINT_CSS}
.center{text-align:center}
.inv-letterhead{border-bottom:3px solid ${accentColor};padding:12px 20px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center}
.inv-brand{font-size:22px;font-weight:900;color:${accentColor}}
.inv-meta{text-align:left;font-size:11px;color:#475569}
.inv-meta b{color:#1E293B}
.inv-title{font-size:18px;font-weight:800;color:${accentColor};margin:14px 0 6px;display:flex;justify-content:space-between;align-items:center}
.inv-num{font-family:monospace;background:#F8FAFC;padding:4px 12px;border-radius:6px;border:1px solid #E2E8F0;color:${accentColor};font-size:14px;font-weight:800}
.inv-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:14px 0}
.inv-box{background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;padding:10px}
.inv-box .lbl{font-size:10px;color:#64748B;font-weight:600;margin-bottom:3px}
.inv-box .val{font-size:13px;color:#1E293B;font-weight:700}
.inv-totals{display:flex;justify-content:flex-end;margin:14px 0}
.inv-totals .box{min-width:280px;padding:14px;background:#F8FAFC;border-radius:8px;border:1px solid #E2E8F0}
.inv-totals .row{display:flex;justify-content:space-between;padding:5px 0;font-size:12px}
.inv-totals .row.disc{color:#EF4444}
.inv-totals .row.total{font-size:16px;font-weight:800;border-top:2px solid ${accentColor};margin-top:6px;padding-top:8px;color:${accentColor}}
@media print { .no-print{display:none} }
</style>
</head>
<body>

<div class="inv-letterhead">
  <div>
    <div class="inv-brand">${_esc(factoryName)}</div>
    ${factoryAddr ? `<div style="font-size:11px;color:#64748B;margin-top:2px">${_esc(factoryAddr)}</div>` : ""}
  </div>
  <div class="inv-meta">
    ${factoryPhone ? `<div>📞 ${_esc(ltrPhone(factoryPhone))}</div>` : ""}
    ${factoryEmail ? `<div>✉️ ${_esc(factoryEmail)}</div>` : ""}
  </div>
</div>

<div class="inv-title">
  <span>${docIcon} ${docTitle}</span>
  <div style="display:flex;align-items:center;gap:10px">
    ${statusBadge}
    <span class="inv-num">${_esc(invoice.invoiceNo)}</span>
  </div>
</div>

<div class="inv-grid">
  <div class="inv-box">
    <div class="lbl">${partyLabel}</div>
    <div class="val">${_esc((party && party.name) || (isPurchase ? invoice.supplierName : invoice.customerName) || "—")}</div>
    ${party && party.phone ? `<div style="font-size:11px;color:#64748B;margin-top:3px">📞 ${_esc(ltrPhone(party.phone))}</div>` : ""}
    ${party && party.address ? `<div style="font-size:11px;color:#64748B;margin-top:2px">📍 ${_esc(party.address)}</div>` : ""}
  </div>
  <div class="inv-box">
    <div class="lbl">التاريخ</div>
    <div class="val" style="font-family:monospace">${_esc(invoice.date)}</div>
    ${invoice.postedAt ? `<div style="font-size:11px;color:#64748B;margin-top:3px">مُرحّل: ${_esc(invoice.postedAt.split("T")[0])}</div>` : ""}
  </div>
</div>

<h3 style="margin-top:18px;margin-bottom:8px;color:#1E293B">البنود</h3>
${docColumnsHTML(invoice.items, { headerDiscountAmount: Number(invoice.discount) || 0, accent: accentColor, mono })}

${invoice.notes ? `<h3 style="margin-top:18px">ملاحظات</h3><p style="padding:10px;background:${mono ? "#f4f4f4;border:1px solid #ddd" : "#FEF3C7"};border-radius:6px;font-size:12px">${_esc(invoice.notes)}</p>` : ""}

${mono ? salesAckHTML() : `<div class="sig">
  <div class="sig-box">${isPurchase ? "المسؤول" : "البائع"}</div>
  <div class="sig-box">المحاسب</div>
  <div class="sig-box">${isPurchase ? "المورد" : "العميل"}</div>
</div>`}

<div class="foot">
  ${factoryName} — ${docTitle} — تم الإنشاء: ${new Date(invoice.createdAt||Date.now()).toLocaleString("ar-EG")} — بواسطة: ${_esc(invoice.createdBy||"—")}
</div>

<script>setTimeout(function(){window.print()},500)</script>
</body></html>`;

  w.document.write(html);
  w.document.close();
}

/* Print a credit note (sales return). Similar to invoice but with red theme. */
export function printCreditNote(creditNote, customer, factoryInfo){
  const w = openPrintWindow();
  if(!w){ alert("المتصفح بيمنع فتح نافذة الطباعة — فعّل النوافذ المنبثقة"); return; }

  /* V21.27.121: تصميم أبيض/أسود «كيرفي» موحّد + أعمدة الفاتورة الموحّدة
     (docColumnsHTML) + إقرار الاستلام. الإجماليات من القيم المخزّنة (authoritative). */
  const accentColor = "#333333";

  const factoryName = (factoryInfo && factoryInfo.name) || "CLARK ERP System";
  const factoryAddr = (factoryInfo && factoryInfo.address) || "";
  const factoryPhone = (factoryInfo && factoryInfo.phone) || "";
  const factoryEmail = (factoryInfo && factoryInfo.email) || "";

  const _cnBadge = (txt) => `<span style="background:#eee;color:#333;padding:4px 12px;border-radius:6px;font-weight:700;font-size:12px;border:1px solid #ccc">${txt}</span>`;
  const statusBadge = creditNote.status === "posted" ? _cnBadge("✓ مرحّل") : creditNote.status === "void" ? _cnBadge("✕ ملغي") : _cnBadge("📝 مسودة");

  const html = `<html dir="rtl">
<head>
<meta charset="UTF-8">
<title>${creditNote.creditNoteNo}</title>
<style>
${PRINT_CSS}
.center{text-align:center}
.inv-letterhead{border-bottom:3px solid ${accentColor};padding:12px 20px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center}
.inv-brand{font-size:22px;font-weight:900;color:${accentColor}}
.inv-meta{text-align:left;font-size:11px;color:#475569}
.inv-title{font-size:18px;font-weight:800;color:${accentColor};margin:14px 0 6px;display:flex;justify-content:space-between;align-items:center}
.inv-num{font-family:monospace;background:#f4f4f4;padding:4px 12px;border-radius:6px;border:1px solid #ccc;color:${accentColor};font-size:14px;font-weight:800}
.inv-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:14px 0}
.inv-box{background:#f6f6f6;border:1px solid #ddd;border-radius:6px;padding:10px}
.inv-box .lbl{font-size:10px;color:#64748B;font-weight:600;margin-bottom:3px}
.inv-box .val{font-size:13px;color:#1E293B;font-weight:700}
.inv-totals{display:flex;justify-content:flex-end;margin:14px 0}
.inv-totals .box{min-width:300px;background:#fff;border-radius:10px;border:1px solid #000;overflow:hidden}
.inv-totals .row{display:flex;justify-content:space-between;padding:7px 12px;font-size:12px;border-bottom:1px solid #ccc;color:#000}
.inv-totals .row.total{font-size:15px;font-weight:800;background:#000;color:#fff !important;padding:10px 12px;border-bottom:none;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.inv-totals .row.total span{color:#fff !important}
</style>
</head>
<body>

<div class="inv-letterhead">
  <div>
    <div class="inv-brand">${_esc(factoryName)}</div>
    ${factoryAddr ? `<div style="font-size:11px;color:#64748B;margin-top:2px">${_esc(factoryAddr)}</div>` : ""}
  </div>
  <div class="inv-meta">
    ${factoryPhone ? `<div>📞 ${_esc(ltrPhone(factoryPhone))}</div>` : ""}
    ${factoryEmail ? `<div>✉️ ${_esc(factoryEmail)}</div>` : ""}
  </div>
</div>

<div class="inv-title">
  <span>↩️ إشعار دائن (مرتجع مبيعات)</span>
  <div style="display:flex;align-items:center;gap:10px">
    ${statusBadge}
    <span class="inv-num">${_esc(creditNote.creditNoteNo)}</span>
  </div>
</div>

${creditNote.linkedInvoiceNo ? `<div style="background:#f4f4f4;padding:8px 12px;border-radius:6px;margin-bottom:12px;font-size:12px;color:#333;border:1px solid #ddd"><b>للفاتورة الأصلية:</b> ${_esc(creditNote.linkedInvoiceNo)}</div>` : ""}

<div class="inv-grid">
  <div class="inv-box">
    <div class="lbl">العميل</div>
    <div class="val">${_esc((customer && customer.name) || creditNote.customerName || "—")}</div>
    ${customer && customer.phone ? `<div style="font-size:11px;color:#64748B;margin-top:3px">📞 ${_esc(ltrPhone(customer.phone))}</div>` : ""}
  </div>
  <div class="inv-box">
    <div class="lbl">التاريخ</div>
    <div class="val" style="font-family:monospace">${_esc(creditNote.date)}</div>
  </div>
</div>

<h3 style="margin-top:18px;margin-bottom:8px;color:#1E293B">الأصناف المُرتجعة</h3>
${docColumnsHTML(creditNote.items, { headerDiscountAmount: Number(creditNote.discount) || 0, mono: true, noTotals: true })}

<div class="inv-totals">
  <div class="box">
    <div class="row">
      <span>الإجمالي قبل الخصم</span>
      <span style="direction:ltr;font-weight:700">${fmt2(creditNote.subtotal)}</span>
    </div>
    ${(creditNote.discount||0) > 0 ? `<div class="row" style="color:#64748B">
      <span>الخصم${creditNote.discountPct ? ` (${creditNote.discountPct.toFixed(1)}%)` : ""}</span>
      <span style="direction:ltr;font-weight:700">- ${fmt2(creditNote.discount)}</span>
    </div>` : ""}
    <div class="row total">
      <span>المستحق رد</span>
      <span style="direction:ltr">${fmt2(creditNote.total)} ج.م</span>
    </div>
  </div>
</div>

${creditNote.notes ? `<h3 style="margin-top:18px">سبب المرتجع</h3><p style="padding:10px;background:#f4f4f4;border:1px solid #ddd;border-radius:6px;font-size:12px">${_esc(creditNote.notes)}</p>` : ""}

${salesAckHTML()}

<div class="foot">
  ${factoryName} — إشعار دائن — تم الإنشاء: ${new Date(creditNote.createdAt||Date.now()).toLocaleString("ar-EG")} — بواسطة: ${_esc(creditNote.createdBy||"—")}
</div>

<script>setTimeout(function(){window.print()},500)</script>
</body></html>`;

  w.document.write(html);
  w.document.close();
}

/* HTML escape helper */
function _esc(s){
  return String(s||"").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* V19.41 — Debit Note (purchase return) printable.
   Mirror of printCreditNote but for purchase returns: blue accent (matches
   purchase invoice color scheme), supplier instead of customer, "المستحق رد
   من المورد" instead of "المستحق رد للعميل". */
export function printDebitNote(debitNote, supplier, factoryInfo, showPrices = true){
  const w = openPrintWindow();
  if(!w){ alert("المتصفح بيمنع فتح نافذة الطباعة — فعّل النوافذ المنبثقة"); return; }

  /* Use a distinct accent — different from credit notes (red) and from
     purchase invoices (orange). Blue signals "money coming back to us"
     while orange means "money owed". */
  /* V21.27.125: تصميم أبيض/أسود موحّد زي المبيعات (طلب Ahmed). */
  const accentColor = "#333333";
  /* V21.27.84: showPrices=false → كميات فقط (بدون عمود سعر/إجمالي ولا صندوق الإجماليات) */
  const totalQty = (debitNote.items||[]).reduce((s, it) => s + (Number(it.qty)||0), 0);
  /* جدول الكميات فقط (mono) — حالة showPrices=false */
  const _pca = "-webkit-print-color-adjust:exact;print-color-adjust:exact";
  const qtyRows = (debitNote.items||[]).map((it,i) => `<tr style="background:${i%2?"#f0f0f0":"#fff"};${_pca}">
    <td style="padding:5px;border:1px solid #b4b4b4;text-align:center">${_esc(it.name||"—")}${it.itemType?` <span style="font-size:10px;color:#555">(${_esc(it.itemType)})</span>`:""}</td>
    <td style="padding:5px;border:1px solid #b4b4b4;text-align:center;font-weight:600">${fmt(it.qty)}</td>
  </tr>`).join("");

  const factoryName = (factoryInfo && factoryInfo.name) || "CLARK ERP System";
  const factoryAddr = (factoryInfo && factoryInfo.address) || "";
  const factoryPhone = (factoryInfo && factoryInfo.phone) || "";
  const factoryEmail = (factoryInfo && factoryInfo.email) || "";

  const _dnBadge = (txt) => `<span style="background:#eee;color:#333;padding:4px 12px;border-radius:6px;font-weight:700;font-size:12px;border:1px solid #ccc">${txt}</span>`;
  const statusBadge = debitNote.status === "posted" ? _dnBadge("✓ مرحّل") : debitNote.status === "void" ? _dnBadge("✕ ملغي") : _dnBadge("📝 مسودة");

  const html = `<html dir="rtl">
<head>
<meta charset="UTF-8">
<title>${debitNote.debitNoteNo}</title>
<style>
${PRINT_CSS}
.center{text-align:center}
.inv-letterhead{border-bottom:3px solid ${accentColor};padding:12px 20px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center}
.inv-brand{font-size:22px;font-weight:900;color:${accentColor}}
.inv-meta{text-align:left;font-size:11px;color:#475569}
.inv-title{font-size:18px;font-weight:800;color:${accentColor};margin:14px 0 6px;display:flex;justify-content:space-between;align-items:center}
.inv-num{font-family:monospace;background:#f4f4f4;padding:4px 12px;border-radius:6px;border:1px solid #ccc;color:${accentColor};font-size:14px;font-weight:800}
.inv-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:14px 0}
.inv-box{background:#f6f6f6;border:1px solid #ddd;border-radius:6px;padding:10px}
.inv-box .lbl{font-size:10px;color:#64748B;font-weight:600;margin-bottom:3px}
.inv-box .val{font-size:13px;color:#1E293B;font-weight:700}
.inv-totals{display:flex;justify-content:flex-end;margin:14px 0}
.inv-totals .box{min-width:300px;background:#fff;border-radius:10px;border:1px solid #000;overflow:hidden}
.inv-totals .row{display:flex;justify-content:space-between;padding:7px 12px;font-size:12px;border-bottom:1px solid #ccc;color:#000}
.inv-totals .row.total{font-size:15px;font-weight:800;background:#000;color:#fff !important;padding:10px 12px;border-bottom:none;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.inv-totals .row.total span{color:#fff !important}
</style>
</head>
<body>

<div class="inv-letterhead">
  <div>
    <div class="inv-brand">${_esc(factoryName)}</div>
    ${factoryAddr ? `<div style="font-size:11px;color:#64748B;margin-top:2px">${_esc(factoryAddr)}</div>` : ""}
  </div>
  <div class="inv-meta">
    ${factoryPhone ? `<div>📞 ${_esc(ltrPhone(factoryPhone))}</div>` : ""}
    ${factoryEmail ? `<div>✉️ ${_esc(factoryEmail)}</div>` : ""}
  </div>
</div>

<div class="inv-title">
  <span>↪️ إشعار مدين (مرتجع مشتريات)</span>
  <div style="display:flex;align-items:center;gap:10px">
    ${statusBadge}
    <span class="inv-num">${_esc(debitNote.debitNoteNo)}</span>
  </div>
</div>

${debitNote.linkedInvoiceNo ? `<div style="background:#f4f4f4;padding:8px 12px;border-radius:6px;margin-bottom:12px;font-size:12px;color:#333;border:1px solid #ddd"><b>للفاتورة الأصلية:</b> ${_esc(debitNote.linkedInvoiceNo)}</div>` : ""}

<div class="inv-grid">
  <div class="inv-box">
    <div class="lbl">المورد</div>
    <div class="val">${_esc((supplier && supplier.name) || debitNote.supplierName || "—")}</div>
    ${supplier && supplier.phone ? `<div style="font-size:11px;color:#64748B;margin-top:3px">📞 ${_esc(ltrPhone(supplier.phone))}</div>` : ""}
  </div>
  <div class="inv-box">
    <div class="lbl">التاريخ</div>
    <div class="val" style="font-family:monospace">${_esc(debitNote.date)}</div>
  </div>
</div>

<h3 style="margin-top:18px;margin-bottom:8px;color:#1E293B">الأصناف المُرتجعة للمورد${showPrices?"":" — كميات"}</h3>
${showPrices
  ? docColumnsHTML((debitNote.items||[]).map(it=>({ itemName:it.name, name:it.name, qty:it.qty, unitPrice:it.unitPrice, unit:it.unit||"" })), { headerDiscountAmount: Number(debitNote.discount)||0, mono:true, noTotals:true })
  : `<div style="border-radius:10px;overflow:hidden;border:1px solid #000"><table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead><tr>
        <th style="padding:6px;border:1px solid #b4b4b4;background:#000;color:#fff !important;text-align:center;${_pca}">الصنف</th>
        <th style="padding:6px;border:1px solid #b4b4b4;background:#000;color:#fff !important;text-align:center;${_pca}">الكمية</th>
      </tr></thead>
      <tbody>${qtyRows}</tbody>
      <tfoot><tr style="background:#ececec;font-weight:800;${_pca}"><td style="padding:6px;border:1px solid #b4b4b4;text-align:center">الإجمالي</td><td style="padding:6px;border:1px solid #b4b4b4;text-align:center">${_esc(fmtQtyByUnit(sumQtyByUnit(debitNote.items)))}</td></tr></tfoot>
    </table></div>`}

${showPrices ? `<div class="inv-totals">
  <div class="box">
    <div class="row">
      <span>الإجمالي قبل الخصم</span>
      <span style="direction:ltr;font-weight:700">${fmt2(debitNote.subtotal)}</span>
    </div>
    ${(debitNote.discount||0) > 0 ? `<div class="row" style="color:#64748B">
      <span>الخصم${debitNote.discountPct ? ` (${debitNote.discountPct.toFixed(1)}%)` : ""}</span>
      <span style="direction:ltr;font-weight:700">- ${fmt2(debitNote.discount)}</span>
    </div>` : ""}
    <div class="row total">
      <span>المستحق رد من المورد</span>
      <span style="direction:ltr">${fmt2(debitNote.total)} ج.م</span>
    </div>
  </div>
</div>` : `<div class="inv-totals"><div class="box"><div class="row total"><span>إجمالي الكميات المرتجعة</span><span style="direction:ltr">${fmt(totalQty)}</span></div></div></div>`}

${debitNote.notes ? `<h3 style="margin-top:18px">سبب المرتجع</h3><p style="padding:10px;background:#f4f4f4;border:1px solid #ddd;border-radius:6px;font-size:12px">${_esc(debitNote.notes)}</p>` : ""}

<div class="sig">
  <div class="sig-box">المستلم بالمصنع</div>
  <div class="sig-box">المحاسب</div>
  <div class="sig-box">المورد</div>
</div>

<div class="foot">
  ${factoryName} — إشعار مدين — تم الإنشاء: ${new Date(debitNote.createdAt||Date.now()).toLocaleString("ar-EG")} — بواسطة: ${_esc(debitNote.createdBy||"—")}
</div>

<script>setTimeout(function(){window.print()},500)</script>
</body></html>`;

  w.document.write(html);
  w.document.close();
}
