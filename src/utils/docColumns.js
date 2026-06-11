/* ═══════════════════════════════════════════════════════════════════════
   CLARK · أعمدة المستندات الموحّدة (V21.21.42)
   ───────────────────────────────────────────────────────────────────────
   مصدر واحد لعرض بنود أي مستند (عرض سعر · أمر بيع · فاتورة · RFQ · أمر شراء ·
   استلام) بأعمدة موحّدة:
     الكود | اسم الصنف | الوحدة | الكمية | السعر | إجمالي قبل الخصم | الخصم | إجمالي بعد الخصم

   ⚠️ طبقة عرض بحتة — مابتغيّرش أي بيانات مخزّنة ولا حسابات المستند. بتقرأ
   الحقول الموجودة فعلاً (lineSubtotal/lineDiscount + خصم الرأس) وبتوزّع
   «الخصم الكلي» على الصفوف بالتناسب عشان كل صف يبيّن نصيبه — والمجموع يساوي
   إجمالي المستند بالظبط (آخر صف بيمتص فرق التقريب).

   أشكال البنود المدعومة:
   - مبيعات: { modelNo, description, unit, qty, unitPrice, discountType,
              discountValue, lineSubtotal, lineDiscount, lineTotal, isSection, title }
   - فاتورة: { modelNo, modelDesc, qty, unitPrice, lineTotal }  (الخصم على الرأس)
   - مشتريات: { itemName|name, unit, qty, price, amount }
   ═══════════════════════════════════════════════════════════════════════ */

import { r2, fmt } from "./format.js";
import { tafqitEGP } from "./tafqit.js";

function _lineDiscount(subBefore, raw){
  if(raw.lineDiscount != null && raw.lineDiscount !== "")
    return r2(Math.min(Math.max(Number(raw.lineDiscount) || 0, 0), subBefore));
  if(raw.discountValue != null && raw.discountValue !== ""){
    const dv = Number(raw.discountValue) || 0;
    if(raw.discountType === "amount") return r2(Math.min(Math.max(dv, 0), subBefore));
    return r2(subBefore * (Math.min(Math.max(dv, 0), 100) / 100));
  }
  return 0;
}

/* يبني صفوف الأعمدة الموحّدة + الإجماليات، موزّعاً خصم الرأس على الصفوف.
   opts.headerDiscountAmount  — خصم رأس بقيمة مطلقة (الفواتير).
   opts.headerDiscountPct     — خصم رأس بنسبة % (عرض السعر/أمر البيع).
   لو الاتنين غايبين → مفيش خصم رأس (خصم البنود فقط). */
export function buildDocColumns(items, opts = {}){
  const raw = Array.isArray(items) ? items : [];
  const norm = [];
  for(const it of raw){
    if(it && it.isSection){ norm.push({ isSection: true, title: it.title || it.description || "" }); continue; }
    const qty = Number(it.qty) || 0;
    const price = Number(it.unitPrice != null ? it.unitPrice : it.price) || 0;
    const subBefore = r2(qty * price);
    const lineDiscount = _lineDiscount(subBefore, it);
    /* V21.21.55: لو البند له كود صنف حقيقي (الحقل code من كارت الصنف) → الكود في
       عمود الكود والاسم في عمود الاسم («الكود - اسم الصنف»). غير كده السلوك القديم
       (للأوامر: modelNo = رقم الموديل في عمود الكود، والوصف في عمود الاسم). */
    const realCode = String(it.code || "").trim();
    const code = realCode || String(it.modelNo || "");
    const name = realCode
      ? (String(it.modelNo || it.itemName || it.name || it.description || it.modelDesc || "") || "—")
      : (String(it.description || it.modelDesc || it.itemName || it.name || "") || (code ? "" : "—"));
    const unit = String(it.unit || "");
    norm.push({ isSection: false, code, name, unit, qty, price, subBefore, lineDiscount, _afterLine: r2(subBefore - lineDiscount) });
  }

  const lines = norm.filter(r => !r.isSection);
  const subBefore = r2(lines.reduce((s, r) => s + r.subBefore, 0));
  const lineDiscTotal = r2(lines.reduce((s, r) => s + r.lineDiscount, 0));
  const afterLine = r2(subBefore - lineDiscTotal);

  let headerDisc = 0;
  if(opts.headerDiscountAmount != null) headerDisc = Math.max(0, Number(opts.headerDiscountAmount) || 0);
  else if(opts.headerDiscountPct != null) headerDisc = r2(afterLine * (Math.min(Math.max(Number(opts.headerDiscountPct) || 0, 0), 100) / 100));
  headerDisc = r2(Math.min(headerDisc, afterLine));

  /* index of the LAST non-section line — يمتص فرق التقريب */
  let lastLineIdx = -1;
  norm.forEach((r, i) => { if(!r.isSection) lastLineIdx = i; });

  const rows = [];
  let distributed = 0;
  norm.forEach((r, i) => {
    if(r.isSection){ rows.push({ isSection: true, title: r.title }); return; }
    let share = 0;
    if(headerDisc > 0 && afterLine > 0){
      share = (i === lastLineIdx) ? r2(headerDisc - distributed) : r2(headerDisc * (r._afterLine / afterLine));
    }
    distributed = r2(distributed + share);
    const discount = r2(r.lineDiscount + share);
    /* V21.21.45: نسبة الخصم الفعلية للصف (قيمة الخصم ÷ الإجمالي قبل الخصم) */
    const discountPct = r.subBefore > 0 ? r2(discount / r.subBefore * 100) : 0;
    rows.push({ isSection: false, code: r.code, name: r.name, unit: r.unit, qty: r.qty, price: r.price, subBefore: r.subBefore, discountPct, discount, subAfter: r2(r.subBefore - discount) });
  });

  const discount = r2(lineDiscTotal + headerDisc);
  /* V21.21.45: نسبة الخصم الإجمالية الفعلية */
  const discountPct = subBefore > 0 ? r2(discount / subBefore * 100) : 0;
  return { rows, totals: { subBefore, discount, discountPct, subAfter: r2(subBefore - discount) } };
}

/* hتجنّب حقن HTML في حقول النصوص داخل الـ PDF */
function _esc(s){
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

/* جدول HTML للأعمدة الموحّدة (للـ PDF/الطباعة) + بلوك الإجماليات. */
export function docColumnsHTML(items, opts = {}){
  const { rows, totals } = buildDocColumns(items, opts);
  const accent = opts.accent || "#0EA5E9";
  const bd = "1px solid #cbd5e1";
  const pctStr = (p) => (p > 0 ? (Number.isInteger(p) ? p : p) + "%" : "—");
  const body = rows.map(r => r.isSection
    ? `<tr><td colspan="9" style="background:#F1F5F9;font-weight:800;color:#0369A1;padding:6px;border:${bd}">📑 ${_esc(r.title)}</td></tr>`
    : `<tr>
        <td style="text-align:center;padding:5px;border:${bd}">${_esc(r.code) || "—"}</td>
        <td style="padding:5px;border:${bd}">${_esc(r.name) || "—"}</td>
        <td style="text-align:center;padding:5px;border:${bd}">${_esc(r.unit) || "—"}</td>
        <td style="text-align:center;padding:5px;border:${bd}">${fmt(r.qty)}</td>
        <td style="text-align:left;padding:5px;border:${bd}">${fmt(r.price)}</td>
        <td style="text-align:left;padding:5px;border:${bd}">${fmt(r.subBefore)}</td>
        <td style="text-align:center;padding:5px;border:${bd};color:#EF4444">${pctStr(r.discountPct)}</td>
        <td style="text-align:left;padding:5px;border:${bd};color:#EF4444">${r.discount > 0 ? "− " + fmt(r.discount) : "—"}</td>
        <td style="text-align:left;padding:5px;border:${bd}"><b>${fmt(r.subAfter)}</b></td>
      </tr>`
  ).join("");
  const th = `padding:5px;border:${bd}`;
  return `<table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead><tr style="background:${accent};color:#fff">
        <th style="${th}">الكود</th><th style="${th}">اسم الصنف</th><th style="${th}">الوحدة</th><th style="${th}">الكمية</th><th style="${th}">السعر</th><th style="${th}">إجمالي قبل الخصم</th><th style="${th}">نسبة الخصم</th><th style="${th}">الخصم</th><th style="${th}">إجمالي بعد الخصم</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>
    <div style="margin-top:12px;width:340px;margin-inline-start:auto;font-size:13px">
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span>الإجمالي قبل الخصم</span><b>${fmt(totals.subBefore)}</b></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0;color:#EF4444"><span>إجمالي الخصومات${totals.discountPct > 0 ? " (" + totals.discountPct + "%)" : ""}</span><b>${totals.discount > 0 ? "− " + fmt(totals.discount) : fmt(0)}</b></div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:2px solid #1E293B;font-size:16px;font-weight:800"><span>الإجمالي</span><span>${fmt(totals.subAfter)} ج.م</span></div>
    </div>
    <div style="margin-top:8px;padding:8px 10px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;font-size:12px;font-weight:700;color:#334155">${_esc(tafqitEGP(totals.subAfter))}</div>`;
}
