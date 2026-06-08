/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Sales Quotations Utility (V21.10.0 — Phase 12a)
   ───────────────────────────────────────────────────────────────────────
   عروض الأسعار (Odoo-style document chain — Slice 1, standalone).
   مستند "عرض سعر" مستقل تماماً: مش بيخصم مخزون ولا بيعمل قيود محاسبية.
   مجرد عرض قابل للطباعة/الإرسال + يتحوّل لأمر بيع لاحقاً (Slice 2).

   التخزين: daily-split على `salesQuotationsDays/{YYYY-MM-DD}` (مسجّل في
   splitCollections.js من اليوم الأول — CLAUDE.md §2). الـ entries بتتوجّه
   بالـ `date` field.

   ─── Schema (data.salesQuotations[i]) ───
   {
     id, quoteNo: "عرض-2026-0001",
     date, validUntil,
     customerId, customerName, customerPhone, customerNameAdHoc,
     items: [{
       sourceType: "order"|"inventoryItem"|"generalProduct"|"service",
       sourceId, modelNo, description,
       qty, unitPrice,
       discountType: "pct"|"amount", discountValue,
       lineSubtotal, lineDiscount, lineTotal
     }],
     subtotal, discountPct, totalDiscount, total,
     status: "draft"|"sent"|"accepted"|"rejected"|"converted"|"expired",
     notes, salesPerson,
     convertedToSalesOrderId, convertedToSalesOrderNo, convertedAt, convertedBy,
     sentAt, sentBy, sentChannel,
     statusHistory: [{from, to, at, by}],
     createdAt, createdBy
   }
   data.invoiceCounters.quotation = { 2026: 0 }
   ═══════════════════════════════════════════════════════════════════════ */

import { r2 } from "../format.js";
import { previewDocNo, reserveDocNo } from "../docNumbering.js";

const QUOTE_PREFIX = "عرض"; /* legacy fallback */

export const QUOTE_STATUSES = ["draft", "sent", "accepted", "rejected", "converted", "expired"];

/* ── Counter (V21.20.0: موحّد عبر docNumbering — صيغة قابلة للإعداد) ── */

/* توليد رقم العرض الجاي (read-only preview، مش بيـ increment). */
export function nextQuotationNo(data){
  return previewDocNo(data, "quotation");
}

/* حجز رقم العرض — بيـ increment العدّاد atomically. يُمرّر داخل upConfig. */
export function reserveQuotationNo(d, dateStr){
  return reserveDocNo(d, "quotation", dateStr);
}

/* ── Totals ── */

/* احسب إجماليات بند واحد (immutable — بيرجّع نسخة معدّلة).
   الأقسام (isSection) سطور عناوين بدون قيمة — بترجع بأصفار. */
export function recalcLine(item){
  if(item && item.isSection) return { ...item, isSection: true, qty: 0, unitPrice: 0, discountValue: 0, lineSubtotal: 0, lineDiscount: 0, lineTotal: 0 };
  const qty = Number(item.qty) || 0;
  const unitPrice = Number(item.unitPrice) || 0;
  const lineSubtotal = r2(qty * unitPrice);
  const dType = item.discountType === "amount" ? "amount" : "pct";
  const dVal = Number(item.discountValue) || 0;
  let lineDiscount;
  if(dType === "amount") lineDiscount = r2(Math.min(Math.max(dVal, 0), lineSubtotal));
  else lineDiscount = r2(lineSubtotal * (Math.min(Math.max(dVal, 0), 100) / 100));
  const lineTotal = r2(lineSubtotal - lineDiscount);
  return { ...item, qty, unitPrice, discountType: dType, discountValue: dVal, lineSubtotal, lineDiscount, lineTotal };
}

/* احسب إجماليات العرض كله (بنود + خصم الرأس). */
export function recalcQuotationTotals(quote){
  const items = (quote.items || []).map(recalcLine);
  const subtotal = r2(items.reduce((s, it) => s + (it.lineSubtotal || 0), 0));
  const lineDiscounts = r2(items.reduce((s, it) => s + (it.lineDiscount || 0), 0));
  const afterLineDisc = r2(subtotal - lineDiscounts);
  const discountPct = Math.min(Math.max(Number(quote.discountPct) || 0, 0), 100);
  const headerDiscount = r2(afterLineDisc * (discountPct / 100));
  const totalDiscount = r2(lineDiscounts + headerDiscount);
  const total = r2(afterLineDisc - headerDiscount);
  return { ...quote, items, subtotal, discountPct, totalDiscount, total };
}

/* ── Validation ── */

export function validateQuotation(q){
  const errors = [];
  if(!q) return { ok: false, errors: ["العرض فاضي"] };
  const hasCustomer = (q.customerId && String(q.customerId).trim()) || (q.customerNameAdHoc && q.customerNameAdHoc.trim());
  if(!hasCustomer) errors.push("اختر عميل أو اكتب اسم عميل");
  if(!q.date || !/^\d{4}-\d{2}-\d{2}$/.test(q.date)) errors.push("تاريخ العرض غير صالح");
  const items = Array.isArray(q.items) ? q.items : [];
  const realItems = items.filter(it => !(it && it.isSection));
  if(realItems.length === 0) errors.push("أضف بند واحد على الأقل");
  items.forEach((it, i) => {
    if(it && it.isSection){
      if(!String(it.title || "").trim()) errors.push(`القسم ${i + 1}: محتاج عنوان`);
      return;
    }
    if(!(Number(it.qty) > 0)) errors.push(`البند ${i + 1}: الكمية لازم تكون أكبر من صفر`);
    if(Number(it.unitPrice) < 0) errors.push(`البند ${i + 1}: السعر غير صالح`);
    if(!String(it.modelNo || it.description || "").trim()) errors.push(`البند ${i + 1}: محتاج وصف أو موديل`);
  });
  return { ok: errors.length === 0, errors };
}

/* ── Status helpers ── */

/* هل العرض منتهي الصلاحية؟ (يُحسب وقت العرض — من غير cron). */
export function isQuotationExpired(q, todayIso){
  if(!q) return false;
  if(q.status === "converted" || q.status === "accepted" || q.status === "rejected") return false;
  const today = todayIso || new Date().toISOString().split("T")[0];
  return !!(q.validUntil && q.validUntil < today);
}

/* الحالة المعروضة (بتحوّل draft/sent المنتهية لـ expired افتراضياً). */
export function displayStatus(q, todayIso){
  if(isQuotationExpired(q, todayIso)) return "expired";
  return q.status || "draft";
}

/* ── Mutators (تُمرّر داخل upConfig) ── */

/* احفظ عرض (جديد أو تعديل). للجديد: بيحجز رقم + status=draft + history.
   للتعديل (q.id موجود): بيستبدل + يعيد حساب الإجماليات، ويحافظ على
   الرقم/الحالة/التاريخ السجلّي. بيرجّع العرض المحفوظ. */
export function saveQuotationMutator(d, payload, userName){
  if(!Array.isArray(d.salesQuotations)) d.salesQuotations = [];
  const nowIso = new Date().toISOString();
  const idx = payload.id ? d.salesQuotations.findIndex(x => x && x.id === payload.id) : -1;

  if(idx >= 0){
    /* تعديل عرض موجود — حافظ على الحقول السجلّية */
    const prev = d.salesQuotations[idx];
    const merged = recalcQuotationTotals({
      ...prev,
      date: payload.date || prev.date,
      validUntil: payload.validUntil || prev.validUntil || "",
      customerId: payload.customerId ?? prev.customerId,
      customerName: payload.customerName ?? prev.customerName,
      customerPhone: payload.customerPhone ?? prev.customerPhone,
      customerNameAdHoc: payload.customerNameAdHoc ?? prev.customerNameAdHoc,
      items: payload.items || prev.items,
      discountPct: payload.discountPct ?? prev.discountPct,
      notes: payload.notes ?? prev.notes,
      salesPerson: payload.salesPerson ?? prev.salesPerson,
      updatedAt: nowIso,
      updatedBy: userName || "",
    });
    d.salesQuotations[idx] = merged;
    return merged;
  }

  /* عرض جديد */
  const quoteNo = reserveQuotationNo(d, payload.date);
  const fresh = recalcQuotationTotals({
    id: "qt_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7),
    quoteNo,
    date: payload.date || new Date().toISOString().split("T")[0],
    validUntil: payload.validUntil || "",
    customerId: payload.customerId || "",
    customerName: payload.customerName || "",
    customerPhone: payload.customerPhone || "",
    customerNameAdHoc: payload.customerNameAdHoc || "",
    items: payload.items || [],
    discountPct: payload.discountPct || 0,
    status: "draft",
    notes: payload.notes || "",
    salesPerson: payload.salesPerson || userName || "",
    convertedToSalesOrderId: "", convertedToSalesOrderNo: "", convertedAt: "", convertedBy: "",
    sentAt: "", sentBy: "", sentChannel: "",
    statusHistory: [{ from: "", to: "draft", at: nowIso, by: userName || "" }],
    createdAt: nowIso,
    createdBy: userName || "",
  });
  d.salesQuotations.unshift(fresh);
  return fresh;
}

/* غيّر حالة العرض + سجّل في statusHistory. */
export function setQuotationStatusMutator(d, id, status, userName){
  if(!Array.isArray(d.salesQuotations)) return false;
  if(!QUOTE_STATUSES.includes(status)) return false;
  const q = d.salesQuotations.find(x => x && x.id === id);
  if(!q) return false;
  const from = q.status || "draft";
  if(from === status) return true;
  q.status = status;
  if(!Array.isArray(q.statusHistory)) q.statusHistory = [];
  q.statusHistory.push({ from, to: status, at: new Date().toISOString(), by: userName || "" });
  return true;
}

/* علّم العرض كـ "مُرسل" + سجّل القناة. */
export function sendQuotationMutator(d, id, channel, userName){
  if(!Array.isArray(d.salesQuotations)) return false;
  const q = d.salesQuotations.find(x => x && x.id === id);
  if(!q) return false;
  const nowIso = new Date().toISOString();
  const from = q.status || "draft";
  /* مننقلش حالة عرض مقبول/متحوّل لـ sent — بس نسجّل آخر إرسال */
  if(from === "draft"){
    q.status = "sent";
    if(!Array.isArray(q.statusHistory)) q.statusHistory = [];
    q.statusHistory.push({ from, to: "sent", at: nowIso, by: userName || "" });
  }
  q.sentAt = nowIso;
  q.sentBy = userName || "";
  q.sentChannel = channel || "manual";
  return true;
}

/* احذف عرض (نهائياً). يُسمح فقط للمسودات/المرفوضة/المنتهية في الـ UI. */
export function deleteQuotationMutator(d, id){
  if(!Array.isArray(d.salesQuotations)) return false;
  /* V21.20.1: لو العرض متحوّل لأمر بيع، فُكّ ربط الأمر (عشان ما يفضلش يشير
     لعرض محذوف، ويبقى الأمر قابل للحذف بعد كده). */
  const q = d.salesQuotations.find(x => x && x.id === id);
  if(q && q.convertedToSalesOrderId && Array.isArray(d.salesOrders)){
    const so = d.salesOrders.find(x => x && x.id === q.convertedToSalesOrderId);
    if(so){ so.fromQuotationId = ""; so.fromQuotationNo = ""; }
  }
  const before = d.salesQuotations.length;
  d.salesQuotations = d.salesQuotations.filter(x => x && x.id !== id);
  return d.salesQuotations.length < before;
}
