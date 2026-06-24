/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Sales doc print HTML (V21.20.3)
   بناء HTML لطباعة/PDF عرض السعر وأمر البيع. مشترك بين تفاصيل المستند
   ومودال إرسال الواتساب (يتجنّب circular import).
   ═══════════════════════════════════════════════════════════════════════ */

import { fmt } from "../format.js";
import { docColumnsHTML, buildDocColumns, sumQtyByUnit, fmtQtyByUnit } from "../docColumns.js";

/* hحقن HTML آمن */
function _esc(s){ return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

/* V21.27.110: صورة الموديل لبند أمر البيع — الموديلات (sourceType "order")
   صورتها مخزّنة على أمر الإنتاج (data.orders[].image). أنواع البنود الأخرى
   (صنف مخزون/منتج عام/خدمة) مفيش صورة → placeholder. */
function _itemImage(it, data){
  if(it && it.sourceType === "order" && it.sourceId){
    const o = ((data && data.orders) || []).find(x => x && x.id === it.sourceId);
    if(o && o.image) return o.image;
  }
  return "";
}
function _imgCell(img, w, h){
  return img
    ? `<img src="${_esc(img)}" crossorigin="anonymous" style="width:${w}px;height:${h}px;object-fit:cover;border-radius:6px;border:1px solid #cbd5e1"/>`
    : `<div style="width:${w}px;height:${h}px;border-radius:6px;border:1px dashed #cbd5e1;display:inline-flex;align-items:center;justify-content:center;color:#94a3b8;font-size:20px">🧩</div>`;
}

export function buildSalesDocHTML(doc, data, kind){
  const title = kind === "quote" ? "عرض سعر" : "أمر بيع";
  const accent = "#0EA5E9";
  /* V21.21.42: جدول موحّد (كود/اسم/وحدة/كمية/سعر/قبل الخصم/الخصم/بعد الخصم)
     مع توزيع خصم الرأس (discountPct) على الصفوف. */
  return `
    <h2 style="color:${accent};margin:0 0 4px">${title} — ${doc.orderNo || doc.quoteNo || ""}</h2>
    <div style="font-size:12px;color:#64748b;margin-bottom:10px">
      العميل: ${doc.customerName || doc.customerNameAdHoc || "—"}${doc.customerPhone ? " · " + doc.customerPhone : ""} · التاريخ: ${doc.date || ""}${doc.validUntil ? " · صالح حتى: " + doc.validUntil : ""}
    </div>
    ${docColumnsHTML(doc.items, { headerDiscountPct: doc.discountPct, accent })}
    ${doc.notes ? '<p style="margin-top:10px;font-size:12px"><b>ملاحظات:</b> ' + doc.notes + "</p>" : ""}
    <div style="display:flex;justify-content:space-between;margin-top:40px;font-size:12px"><div>توقيع العميل: ____________</div><div>توقيع المصنع: ____________</div></div>`;
}

/* نص رسالة الواتساب (ملخص المستند) */
export function buildSalesDocText(doc, kind){
  const title = kind === "quote" ? "عرض سعر" : "أمر بيع";
  const no = doc.quoteNo || doc.orderNo || "";
  let t = "📄 *" + title + " " + no + "*\n";
  t += "العميل: " + (doc.customerName || doc.customerNameAdHoc || "") + "\nالتاريخ: " + (doc.date || "") + (doc.validUntil ? "\nصالح حتى: " + doc.validUntil : "") + "\n━━━━━━━━━━\n";
  (doc.items || []).forEach(it => {
    if(it.isSection){ t += "📑 " + (it.title || "") + "\n"; return; }
    t += "• " + (it.modelNo || it.description || "") + (it.unit ? " (" + it.unit + ")" : "") + " × " + it.qty + " = " + fmt(it.lineTotal) + "\n";
  });
  t += "━━━━━━━━━━\n💰 *الإجمالي: " + fmt(doc.total || 0) + " ج.م*";
  return t;
}

/* ═══ V21.27.110: قائمة التغليف (Packing List) ═══
   أعمدة واضحة: # | رقم الموديل | وصف الموديل | الكمية | الصورة. بدون أسعار —
   للتغليف/الشحن. إجمالي الكمية (مجمّع حسب الوحدة) في التذييل. */
export function buildPackingListHTML(doc, data){
  const accent = "#0EA5E9", bd = "1px solid #cbd5e1";
  const th = `padding:7px;border:${bd};font-size:12px`;
  const td = `padding:6px;border:${bd};font-size:12px`;
  let body = "", n = 0;
  (doc.items || []).forEach(it => {
    if(!it || it.isSection){
      if(it && it.isSection) body += `<tr><td colspan="5" style="background:#F1F5F9;font-weight:800;color:#0369A1;padding:6px;border:${bd}">📑 ${_esc(it.title || it.description || "")}</td></tr>`;
      return;
    }
    n++;
    body += `<tr>
      <td style="text-align:center;${td}">${n}</td>
      <td style="text-align:center;${td};font-weight:700">${_esc(it.modelNo || it.code || "—")}</td>
      <td style="${td}">${_esc(it.description || it.modelDesc || "—")}</td>
      <td style="text-align:center;${td};font-weight:800;font-size:15px">${fmt(it.qty)}${it.unit ? " " + _esc(it.unit) : ""}</td>
      <td style="text-align:center;padding:4px;border:${bd}">${_imgCell(_itemImage(it, data), 70, 88)}</td>
    </tr>`;
  });
  const totalQ = fmtQtyByUnit(sumQtyByUnit(doc.items));
  return `
    <h2 style="color:${accent};margin:0 0 4px">📦 قائمة التغليف (Packing List) — ${_esc(doc.orderNo || doc.quoteNo || "")}</h2>
    <div style="font-size:12px;color:#64748b;margin-bottom:10px">العميل: ${_esc(doc.customerName || doc.customerNameAdHoc || "—")}${doc.customerPhone ? " · " + _esc(doc.customerPhone) : ""} · التاريخ: ${_esc(doc.date || "")}</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="background:${accent};color:#fff">
        <th style="${th}">#</th><th style="${th}">رقم الموديل</th><th style="${th}">وصف الموديل</th><th style="${th}">الكمية</th><th style="${th}">الصورة</th>
      </tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr style="background:#F1F5F9;font-weight:800">
        <td style="${th}" colspan="3">الإجمالي</td><td style="text-align:center;${th}">${_esc(totalQ)}</td><td style="${th}"></td>
      </tr></tfoot>
    </table>`;
}

/* ═══ V21.27.110: طباعة الأمر بالصور ═══
   الأمر كامل بأسعاره + عمود صورة الموديل لكل بند + الإجماليات. buildDocColumns
   بيرجّع rows بنفس ترتيب items فبنزاوجهم بالـ index لجلب الصورة من البند. */
export function buildSalesDocWithImagesHTML(doc, data, kind){
  const title = kind === "quote" ? "عرض سعر" : "أمر بيع";
  const accent = "#0EA5E9", bd = "1px solid #cbd5e1";
  const th = `padding:6px;border:${bd};font-size:11px`;
  const td = `padding:5px;border:${bd};font-size:11px`;
  const { rows, totals } = buildDocColumns(doc.items, { headerDiscountPct: doc.discountPct });
  const items = doc.items || [];
  let body = "", n = 0;
  rows.forEach((r, i) => {
    if(r.isSection){ body += `<tr><td colspan="7" style="background:#F1F5F9;font-weight:800;color:#0369A1;padding:6px;border:${bd}">📑 ${_esc(r.title)}</td></tr>`; return; }
    n++;
    body += `<tr>
      <td style="text-align:center;padding:4px;border:${bd}">${_imgCell(_itemImage(items[i], data), 54, 68)}</td>
      <td style="text-align:center;${td}">${n}</td>
      <td style="text-align:center;${td};font-weight:700">${_esc(r.code || "—")}</td>
      <td style="${td}">${_esc(r.name || "—")}</td>
      <td style="text-align:center;${td}">${fmt(r.qty)}${r.unit ? " " + _esc(r.unit) : ""}</td>
      <td style="text-align:left;${td}">${fmt(r.price)}</td>
      <td style="text-align:left;${td};font-weight:700">${fmt(r.subAfter)}</td>
    </tr>`;
  });
  const totalQ = fmtQtyByUnit(sumQtyByUnit(doc.items));
  return `
    <h2 style="color:${accent};margin:0 0 4px">🖼 ${title} بالصور — ${_esc(doc.orderNo || doc.quoteNo || "")}</h2>
    <div style="font-size:12px;color:#64748b;margin-bottom:10px">العميل: ${_esc(doc.customerName || doc.customerNameAdHoc || "—")}${doc.customerPhone ? " · " + _esc(doc.customerPhone) : ""} · التاريخ: ${_esc(doc.date || "")}</div>
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead><tr style="background:${accent};color:#fff">
        <th style="${th}">الصورة</th><th style="${th}">#</th><th style="${th}">رقم الموديل</th><th style="${th}">الوصف</th><th style="${th}">الكمية</th><th style="${th}">السعر</th><th style="${th}">الإجمالي</th>
      </tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr style="background:#F1F5F9;font-weight:800">
        <td style="${th}" colspan="4">الإجمالي</td><td style="text-align:center;${th}">${_esc(totalQ)}</td><td style="${th}"></td><td style="${th}"></td>
      </tr></tfoot>
    </table>
    <div style="margin-top:12px;width:340px;margin-inline-start:auto;font-size:13px">
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span>الإجمالي قبل الخصم</span><b>${fmt(totals.subBefore)}</b></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0;color:#EF4444"><span>إجمالي الخصومات${totals.discountPct > 0 ? " (" + totals.discountPct + "%)" : ""}</span><b>${totals.discount > 0 ? "− " + fmt(totals.discount) : fmt(0)}</b></div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:2px solid #1E293B;font-size:16px;font-weight:800"><span>الإجمالي</span><span>${fmt(totals.subAfter)} ج.م</span></div>
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:40px;font-size:12px"><div>توقيع العميل: ____________</div><div>توقيع المصنع: ____________</div></div>`;
}
