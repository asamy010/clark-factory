/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Sales doc print HTML (V21.20.3)
   بناء HTML لطباعة/PDF عرض السعر وأمر البيع. مشترك بين تفاصيل المستند
   ومودال إرسال الواتساب (يتجنّب circular import).
   ═══════════════════════════════════════════════════════════════════════ */

import { fmt } from "../format.js";
import { docColumnsHTML } from "../docColumns.js";

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
