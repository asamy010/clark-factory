/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Sales doc print HTML (V21.20.3)
   بناء HTML لطباعة/PDF عرض السعر وأمر البيع. مشترك بين تفاصيل المستند
   ومودال إرسال الواتساب (يتجنّب circular import).
   ═══════════════════════════════════════════════════════════════════════ */

import { fmt } from "../format.js";
import { docColumnsHTML, buildDocColumns, sumQtyByUnit, fmtQtyByUnit, salesAckHTML } from "../docColumns.js";

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
/* V21.27.113: الصورة بدون crossorigin — الطباعة العادية على iOS كانت بترفض
   الصورة مع crossorigin لو الـ CORS مش مظبوط (صورة مكسورة). من غيره بتتحمّل
   عادي للعرض/الطباعة؛ وحفظ PDF بيشتغل عبر html2canvas useCORS+allowTaint في
   printPage. onerror يبدّل الصورة المكسورة بـ placeholder نظيف بدل أيقونة الكسر. */
function _imgCell(img, w, h){
  const ph = `<div style=&quot;width:${w}px;height:${h}px;border-radius:6px;border:1px dashed #cbd5e1;display:inline-flex;align-items:center;justify-content:center;color:#94a3b8;font-size:18px&quot;>📷</div>`;
  return img
    ? `<img src="${_esc(img)}" loading="eager" referrerpolicy="no-referrer" onerror="this.outerHTML='${ph}'" style="width:${w}px;height:${h}px;object-fit:cover;border-radius:6px;border:1px solid #cbd5e1"/>`
    : `<div style="width:${w}px;height:${h}px;border-radius:6px;border:1px dashed #cbd5e1;display:inline-flex;align-items:center;justify-content:center;color:#94a3b8;font-size:18px">📷</div>`;
}

export function buildSalesDocHTML(doc, data, kind){
  const title = kind === "quote" ? "عرض سعر" : "أمر بيع";
  /* V21.27.121: تصميم أبيض/أسود «كيرفي» موحّد (mono) + إقرار الاستلام تحت الجدول.
     الأعمدة والبيانات زي ما هي — تغيير شكل فقط. */
  return `
    <h2 style="color:#111;margin:0 0 4px">${title} — ${doc.orderNo || doc.quoteNo || ""}</h2>
    <div style="font-size:12px;color:#555;margin-bottom:10px">
      العميل: ${doc.customerName || doc.customerNameAdHoc || "—"}${doc.customerPhone ? " · " + doc.customerPhone : ""} · التاريخ: ${doc.date || ""}${doc.validUntil ? " · صالح حتى: " + doc.validUntil : ""}
    </div>
    ${docColumnsHTML(doc.items, { headerDiscountPct: doc.discountPct, mono: true })}
    ${doc.notes ? '<p style="margin-top:10px;font-size:12px"><b>ملاحظات:</b> ' + doc.notes + "</p>" : ""}
    ${salesAckHTML()}`;
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
  /* V21.27.121: تصميم أبيض/أسود «كيرفي» (mono) — نفس الأعمدة والبيانات. */
  const bd = "1px solid #000";
  /* V21.27.122: نفس إصلاح mono — print-color-adjust + كتابة بيضاء !important +
     توسيط، عشان الهيدر/الإجمالي الأسود يبان واضح في الطباعة والـ PDF. */
  const pca = ";-webkit-print-color-adjust:exact;print-color-adjust:exact";
  const th = `padding:6px;border:${bd};font-size:11px;background:#000;color:#fff !important;text-align:center${pca}`;
  const td = `padding:5px;border:${bd};font-size:11px;text-align:center`;
  const { rows, totals } = buildDocColumns(doc.items, { headerDiscountPct: doc.discountPct });
  const items = doc.items || [];
  let body = "", n = 0, di = -1;
  rows.forEach((r, i) => {
    if(r.isSection){ body += `<tr><td colspan="7" style="background:#e4e4e4;font-weight:800;color:#111;padding:6px;border:${bd};text-align:center${pca}">📑 ${_esc(r.title)}</td></tr>`; return; }
    n++; di++;
    const rowBg = di % 2 ? "#f0f0f0" : "#ffffff";
    body += `<tr style="background:${rowBg}${pca}">
      <td style="text-align:center;padding:4px;border:${bd}">${_imgCell(_itemImage(items[i], data), 54, 68)}</td>
      <td style="${td}">${n}</td>
      <td style="${td};font-weight:700">${_esc(r.code || "—")}</td>
      <td style="${td}">${_esc(r.name || "—")}</td>
      <td style="${td}">${fmt(r.qty)}${r.unit ? " " + _esc(r.unit) : ""}</td>
      <td style="${td}">${fmt(r.price)}</td>
      <td style="${td};font-weight:700">${fmt(r.subAfter)}</td>
    </tr>`;
  });
  const totalQ = fmtQtyByUnit(sumQtyByUnit(doc.items));
  const footTh = `padding:6px;border:${bd};font-size:11px;text-align:center`;
  return `
    <h2 style="color:#111;margin:0 0 4px">🖼 ${title} بالصور — ${_esc(doc.orderNo || doc.quoteNo || "")}</h2>
    <div style="font-size:12px;color:#555;margin-bottom:10px">العميل: ${_esc(doc.customerName || doc.customerNameAdHoc || "—")}${doc.customerPhone ? " · " + _esc(doc.customerPhone) : ""} · التاريخ: ${_esc(doc.date || "")}</div>
    <div style="border-radius:10px;overflow:hidden;border:${bd}">
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead><tr>
        <th style="${th}">الصورة</th><th style="${th}">#</th><th style="${th}">رقم الموديل</th><th style="${th}">الوصف</th><th style="${th}">الكمية</th><th style="${th}">السعر</th><th style="${th}">الإجمالي</th>
      </tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr style="background:#ececec;font-weight:800${pca}">
        <td style="${footTh}" colspan="4">الإجمالي</td><td style="${footTh}">${_esc(totalQ)}</td><td style="${footTh}"></td><td style="${footTh}"></td>
      </tr></tfoot>
    </table></div>
    <div style="margin-top:14px;width:300px;margin-inline-start:auto;font-size:12px;border:1px solid #000;border-radius:10px;overflow:hidden">
      <div style="display:flex;justify-content:space-between;padding:7px 12px;border-bottom:1px solid #ccc;color:#000"><span>الإجمالي قبل الخصم</span><b>${fmt(totals.subBefore)}</b></div>
      <div style="display:flex;justify-content:space-between;padding:7px 12px;border-bottom:1px solid #ccc;color:#000"><span>إجمالي الخصومات${totals.discountPct > 0 ? " (" + totals.discountPct + "%)" : ""}</span><b>${totals.discount > 0 ? "− " + fmt(totals.discount) : fmt(0)}</b></div>
      <div style="display:flex;justify-content:space-between;padding:10px 12px;background:#000;font-weight:800;font-size:15px${pca}"><span style="color:#fff !important">الإجمالي</span><span style="color:#fff !important">${fmt(totals.subAfter)} ج.م</span></div>
    </div>
    ${salesAckHTML()}`;
}
