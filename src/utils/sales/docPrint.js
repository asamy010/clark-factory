/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Sales doc print HTML (V21.20.3)
   بناء HTML لطباعة/PDF عرض السعر وأمر البيع. مشترك بين تفاصيل المستند
   ومودال إرسال الواتساب (يتجنّب circular import).
   ═══════════════════════════════════════════════════════════════════════ */

import { fmt } from "../format.js";

export function buildSalesDocHTML(doc, data, kind){
  const title = kind === "quote" ? "عرض سعر" : "أمر بيع";
  const accent = "#0EA5E9";
  let n = 0;
  const rows = (doc.items || []).map(it => it.isSection
    ? `<tr><td colspan="5" style="background:#F1F5F9;font-weight:800;color:#0369A1">📑 ${it.title || ""}</td></tr>`
    : `<tr><td style="text-align:center">${++n}</td><td>${(it.modelNo || it.description || "")}${it.unit ? " (" + it.unit + ")" : ""}</td><td style="text-align:center">${it.qty}</td><td style="text-align:left">${fmt(it.unitPrice)}</td><td style="text-align:left"><b>${fmt(it.lineTotal)}</b></td></tr>`
  ).join("");
  return `
    <h2 style="color:${accent};margin:0 0 4px">${title} — ${doc.orderNo || doc.quoteNo || ""}</h2>
    <div style="font-size:12px;color:#64748b;margin-bottom:10px">
      العميل: ${doc.customerName || doc.customerNameAdHoc || "—"}${doc.customerPhone ? " · " + doc.customerPhone : ""} · التاريخ: ${doc.date || ""}${doc.validUntil ? " · صالح حتى: " + doc.validUntil : ""}
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="background:${accent};color:#fff">
        <th style="padding:6px;border:1px solid #cbd5e1">#</th><th style="padding:6px;border:1px solid #cbd5e1">البند</th><th style="padding:6px;border:1px solid #cbd5e1">كمية</th><th style="padding:6px;border:1px solid #cbd5e1">السعر</th><th style="padding:6px;border:1px solid #cbd5e1">الإجمالي</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:12px;width:300px;margin-inline-start:auto;font-size:13px">
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span>الإجمالي قبل الخصم</span><b>${fmt(doc.subtotal || 0)}</b></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0;color:#EF4444"><span>إجمالي الخصومات</span><b>− ${fmt(doc.totalDiscount || 0)}</b></div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:2px solid #1E293B;font-size:16px;font-weight:800"><span>الإجمالي</span><span>${fmt(doc.total || 0)} ج.م</span></div>
    </div>
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
