/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Purchase RFQ Utility (V21.12.1 — طلب عروض أسعار)
   ───────────────────────────────────────────────────────────────────────
   نظير «عروض أسعار المبيعات» بس على جهة المورّدين: مستند بنرسله للمورد
   نطلب فيه أسعار، وبعد ما يردّ بالأسعار نحوّله لأمر شراء.
   مستند مستقل تماماً — مفيش خصم مخزون ولا قيود محاسبية.

   التخزين: daily-split على `purchaseRfqsDays/{YYYY-MM-DD}` (مسجّل في
   splitCollections.js V21.12.1 — CLAUDE.md §2). day key = rfq.date.

   ─── Schema (data.purchaseRfqs[i]) ───
   {
     id, rfqNo: "طلب-2026-0001",
     date, validUntil,
     supplierId, supplierName, supplierPhone, supplierNameAdHoc,
     items: [{ description, qty, unit, unitPrice, notes, lineTotal }],
     subtotal, total,
     status: "draft"|"sent"|"received"|"converted"|"rejected"|"expired",
     notes, requestedBy,
     convertedToPoId, convertedToPoNo, convertedAt, convertedBy,
     sentAt, sentBy, sentChannel,
     statusHistory: [{from, to, at, by}],
     createdAt, createdBy
   }
   data.invoiceCounters.rfq = { 2026: 0 }
   ═══════════════════════════════════════════════════════════════════════ */

import { r2 } from "../format.js";

const RFQ_PREFIX = "طلب"; /* عربي حسب نمط عروض الأسعار */

export const RFQ_STATUSES = ["draft", "sent", "received", "converted", "rejected", "expired"];

/* V21.21.82: عملات الشراء المدعومة (الجنيه = العملة الوظيفية). */
/* V21.27.76: عرض السعر بالجنيه المصري فقط (طلب Ahmed — امسح باقي العملات) */
export const PURCHASE_CURRENCIES = ["EGP"];
export const CURRENCY_LABELS = { EGP: "ج.م", USD: "$ دولار", EUR: "€ يورو", SAR: "ريال سعودي", AED: "درهم", CNY: "¥ يوان", TRY: "ليرة تركية" };

/* ── Counter ── */
export function nextRfqNo(data){
  const year = new Date().getFullYear();
  const yearMap = (data?.invoiceCounters || {}).rfq || {};
  const next = (yearMap[year] || 0) + 1;
  return `${RFQ_PREFIX}-${year}-${String(next).padStart(4, "0")}`;
}
export function reserveRfqNo(d){
  if(!d.invoiceCounters) d.invoiceCounters = {};
  if(!d.invoiceCounters.rfq) d.invoiceCounters.rfq = {};
  const year = new Date().getFullYear();
  const next = (d.invoiceCounters.rfq[year] || 0) + 1;
  d.invoiceCounters.rfq[year] = next;
  return `${RFQ_PREFIX}-${year}-${String(next).padStart(4, "0")}`;
}

/* ── Totals (تقديرية — أسعار المورد المتوقعة) ── */
export function recalcRfqLine(item){
  if(item && item.isSection) return { ...item, isSection: true, qty: 0, unitPrice: 0, discountValue: 0, lineTotal: 0 };
  const qty = Number(item.qty) || 0;
  const unitPrice = Number(item.unitPrice) || 0;
  const sub = qty * unitPrice;
  const dType = item.discountType === "amount" ? "amount" : "pct";
  const dVal = Number(item.discountValue) || 0;
  const disc = dType === "amount" ? Math.min(Math.max(dVal, 0), sub) : sub * (Math.min(Math.max(dVal, 0), 100) / 100);
  const lineTotal = r2(sub - disc);
  return { ...item, qty, unitPrice, discountType: dType, discountValue: dVal, lineTotal };
}
export function recalcRfqTotals(rfq){
  const items = (rfq.items || []).map(recalcRfqLine);
  /* afterLine = إجمالي البنود بعد خصومات البنود */
  const afterLine = r2(items.reduce((s, it) => s + (it.lineTotal || 0), 0));
  /* V21.21.43: خصم كلي على مستوى الرأس (discountPct) فوق خصومات البنود. */
  const discountPct = Math.min(Math.max(Number(rfq.discountPct) || 0, 0), 100);
  const headerDiscount = r2(afterLine * (discountPct / 100));
  const total = r2(afterLine - headerDiscount);
  /* V21.21.82: عملة متعددة — الجنيه هو العملة الوظيفية، والعملة الأجنبية +
     سعر الصرف metadata. الأسعار في البنود بالعملة المختارة؛ المكافئ بالجنيه
     = total × fxRate (للعرض + للتحويل لأمر شراء بالجنيه). */
  const currency = rfq.currency || "EGP";
  const fxRate = currency === "EGP" ? 1 : Math.max(0, Number(rfq.fxRate) || 0);
  return { ...rfq, items, subtotal: afterLine, discountPct, headerDiscount, total,
    currency, fxRate,
    subtotalEGP: r2(afterLine * (fxRate || 1)), totalEGP: r2(total * (fxRate || 1)) };
}

/* ── Validation ── */
export function validateRfq(q){
  const errors = [];
  if(!q) return { ok: false, errors: ["الطلب فاضي"] };
  const hasSupplier = (q.supplierId && String(q.supplierId).trim()) || (q.supplierNameAdHoc && q.supplierNameAdHoc.trim());
  if(!hasSupplier) errors.push("اختر مورد أو اكتب اسم مورد");
  if(!q.date || !/^\d{4}-\d{2}-\d{2}$/.test(q.date)) errors.push("تاريخ الطلب غير صالح");
  /* V21.21.82: لو العملة مش جنيه لازم سعر صرف موجب */
  if(q.currency && q.currency !== "EGP" && !(Number(q.fxRate) > 0)) errors.push("اكتب سعر صرف صحيح للعملة الأجنبية");
  const items = Array.isArray(q.items) ? q.items : [];
  const realItems = items.filter(it => !(it && it.isSection));
  if(realItems.length === 0) errors.push("أضف بند واحد على الأقل");
  items.forEach((it, i) => {
    if(it && it.isSection){ if(!String(it.title || "").trim()) errors.push(`القسم ${i + 1}: محتاج عنوان`); return; }
    if(!(Number(it.qty) > 0)) errors.push(`البند ${i + 1}: الكمية لازم تكون أكبر من صفر`);
    if(Number(it.unitPrice) < 0) errors.push(`البند ${i + 1}: السعر غير صالح`);
    if(!String(it.modelNo || it.description || "").trim()) errors.push(`البند ${i + 1}: محتاج وصف الصنف`);
  });
  return { ok: errors.length === 0, errors };
}

/* ── Status helpers ── */
export function isRfqExpired(q, todayIso){
  if(!q) return false;
  if(q.status === "converted" || q.status === "received" || q.status === "rejected") return false;
  const today = todayIso || new Date().toISOString().split("T")[0];
  return !!(q.validUntil && q.validUntil < today);
}
export function displayStatus(q, todayIso){
  if(isRfqExpired(q, todayIso)) return "expired";
  return q.status || "draft";
}

/* ── Mutators (تُمرّر داخل upConfig) ── */
export function saveRfqMutator(d, payload, userName){
  if(!Array.isArray(d.purchaseRfqs)) d.purchaseRfqs = [];
  const nowIso = new Date().toISOString();
  const idx = payload.id ? d.purchaseRfqs.findIndex(x => x && x.id === payload.id) : -1;

  if(idx >= 0){
    const prev = d.purchaseRfqs[idx];
    const merged = recalcRfqTotals({
      ...prev,
      date: payload.date || prev.date,
      validUntil: payload.validUntil || prev.validUntil || "",
      supplierId: payload.supplierId ?? prev.supplierId,
      supplierName: payload.supplierName ?? prev.supplierName,
      supplierPhone: payload.supplierPhone ?? prev.supplierPhone,
      supplierNameAdHoc: payload.supplierNameAdHoc ?? prev.supplierNameAdHoc,
      items: payload.items || prev.items,
      notes: payload.notes ?? prev.notes,
      requestedBy: payload.requestedBy ?? prev.requestedBy,
      currency: payload.currency ?? prev.currency,        /* V21.21.82 */
      fxRate: payload.fxRate ?? prev.fxRate,
      updatedAt: nowIso,
      updatedBy: userName || "",
    });
    d.purchaseRfqs[idx] = merged;
    return merged;
  }

  const rfqNo = reserveRfqNo(d);
  const fresh = recalcRfqTotals({
    id: "rfq_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7),
    rfqNo,
    date: payload.date || new Date().toISOString().split("T")[0],
    validUntil: payload.validUntil || "",
    supplierId: payload.supplierId || "",
    supplierName: payload.supplierName || "",
    supplierPhone: payload.supplierPhone || "",
    supplierNameAdHoc: payload.supplierNameAdHoc || "",
    items: payload.items || [],
    currency: payload.currency || "EGP",   /* V21.21.82 */
    fxRate: payload.fxRate || 1,
    status: "draft",
    notes: payload.notes || "",
    requestedBy: payload.requestedBy || userName || "",
    convertedToPoId: "", convertedToPoNo: "", convertedAt: "", convertedBy: "",
    sentAt: "", sentBy: "", sentChannel: "",
    statusHistory: [{ from: "", to: "draft", at: nowIso, by: userName || "" }],
    createdAt: nowIso,
    createdBy: userName || "",
  });
  d.purchaseRfqs.unshift(fresh);
  return fresh;
}

export function setRfqStatusMutator(d, id, status, userName){
  if(!Array.isArray(d.purchaseRfqs)) return false;
  if(!RFQ_STATUSES.includes(status)) return false;
  const q = d.purchaseRfqs.find(x => x && x.id === id);
  if(!q) return false;
  const from = q.status || "draft";
  if(from === status) return true;
  q.status = status;
  if(!Array.isArray(q.statusHistory)) q.statusHistory = [];
  q.statusHistory.push({ from, to: status, at: new Date().toISOString(), by: userName || "" });
  return true;
}

export function sendRfqMutator(d, id, channel, userName){
  if(!Array.isArray(d.purchaseRfqs)) return false;
  const q = d.purchaseRfqs.find(x => x && x.id === id);
  if(!q) return false;
  const nowIso = new Date().toISOString();
  const from = q.status || "draft";
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

export function deleteRfqMutator(d, id){
  if(!Array.isArray(d.purchaseRfqs)) return { ok: false, error: "لا توجد طلبات" };
  const q = d.purchaseRfqs.find(x => x && x.id === id);
  if(!q) return { ok: false, error: "الطلب غير موجود" };
  /* V21.21.4: السلسلة المستندية — طلب عرض السعر «أول» السلسلة، فمينفعش يتحذف
     طالما فيه أمر شراء متولّد منه لسه موجود (احذف أمر الشراء الأول). */
  if(q.convertedToPoId && Array.isArray(d.purchaseOrders)){
    const po = d.purchaseOrders.find(x => x && x.id === q.convertedToPoId);
    if(po) return { ok: false, error: "الطلب متحوّل لأمر شراء (" + (q.convertedToPoNo || po.poNo || "") + ") — احذف أمر الشراء الأول" };
  }
  d.purchaseRfqs = d.purchaseRfqs.filter(x => x && x.id !== id);
  return { ok: true };
}

/* ── تحويل RFQ → أمر شراء (purchaseOrder) ──
   بيبني purchaseOrder بنفس شكل savePo في PurchasePg (توثيقي — مايأثرش على
   المخزن حتى الاستلام). بيرجّع {ok, error?, po?}. */
export function convertRfqToPurchaseOrderMutator(d, rfqId, userName){
  if(!Array.isArray(d.purchaseRfqs)) return { ok: false, error: "لا توجد طلبات" };
  const q = d.purchaseRfqs.find(x => x && x.id === rfqId);
  if(!q) return { ok: false, error: "الطلب غير موجود" };
  if(q.convertedToPoId) return { ok: false, error: "الطلب متحوّل بالفعل لأمر شراء " + (q.convertedToPoNo || "") };

  const nowIso = new Date().toISOString();
  /* رقم أمر الشراء — نفس منطق nextPoNo في PurchasePg */
  const prefix = (d.purchaseSettings || {}).poPrefix || "PO-";
  const year = new Date().getFullYear();
  const existing = (d.purchaseOrders || []).filter(p => (p.poNo || "").startsWith(prefix + year));
  const maxNum = existing.reduce((m, r) => { const n = Number((r.poNo || "").split("-").pop()) || 0; return n > m ? n : m; }, 0);
  const poNo = prefix + year + "-" + String(maxNum + 1).padStart(3, "0");

  /* V21.21.82: العملة الأجنبية تتحوّل لجنيه عند التحويل لأمر شراء (الجنيه هو
     العملة الوظيفية في باقي السلسلة: استلام/فاتورة/خزنة/محاسبة). المبلغ
     الأجنبي + السعر يتحفظوا كـ metadata (fcPrice/fcAmount/currency/fxRate)
     للعرض ولحساب فرق الصرف لاحقاً. */
  const currency = q.currency || "EGP";
  const fxRate = currency === "EGP" ? 1 : (Math.max(0, Number(q.fxRate) || 0) || 1);
  const foreign = currency !== "EGP";

  /* بنحمّل الربط بالمخزون (itemType/itemId) للأمر عشان الاستلام يزوّد المخزون صح.
     الخصم بيتبني داخل السعر الصافي (PO مفيهوش حقل خصم). الأقسام بتتشال. */
  const items = (q.items || []).filter(it => !(it && it.isSection)).map(it => {
    const qty = Number(it.qty) || 0, up = Number(it.unitPrice) || 0;
    const sub = qty * up;
    const dVal = Number(it.discountValue) || 0;
    const disc = it.discountType === "amount" ? Math.min(Math.max(dVal, 0), sub) : sub * (Math.min(Math.max(dVal, 0), 100) / 100);
    const net = r2(sub - disc);              /* صافي البند بالعملة الأجنبية */
    const netEGP = r2(net * fxRate);          /* المكافئ بالجنيه */
    return {
      itemType: (it.sourceType && it.sourceType !== "service") ? it.sourceType : "",
      itemId: it.sourceId || "",
      itemName: it.modelNo || it.description || "",
      qty,
      unit: it.unit || "",
      price: qty > 0 ? r2(netEGP / qty) : netEGP,   /* بالجنيه (العملة الوظيفية) */
      amount: netEGP,
      ...(foreign ? { fcPrice: qty > 0 ? r2(net / qty) : net, fcAmount: net } : {}),
      notes: it.notes || "",
    };
  });
  const totalAmount = r2(items.reduce((s, it) => s + (it.amount || 0), 0));        /* جنيه */
  const fcTotalAmount = foreign ? r2(items.reduce((s, it) => s + (it.fcAmount || 0), 0)) : 0;

  const poId = "po_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
  const po = {
    id: poId, poNo,
    supplierId: q.supplierId || "",
    supplierName: q.supplierName || q.supplierNameAdHoc || "",
    date: new Date().toISOString().split("T")[0],
    items, totalAmount,
    ...(foreign ? { currency, fxRate, fcTotalAmount } : {}),
    notes: (q.notes ? q.notes + " — " : "") + "محوّل من طلب عروض أسعار " + (q.rfqNo || "") + (foreign ? ` (${currency} × ${fxRate})` : ""),
    createdBy: userName || "", createdAt: nowIso,
    _fromRfqId: q.id, _fromRfqNo: q.rfqNo || "",
  };
  if(!Array.isArray(d.purchaseOrders)) d.purchaseOrders = [];
  d.purchaseOrders.push(po);

  /* علّم الـ RFQ converted */
  q.status = "converted";
  q.convertedToPoId = poId;
  q.convertedToPoNo = poNo;
  q.convertedAt = nowIso;
  q.convertedBy = userName || "";
  if(!Array.isArray(q.statusHistory)) q.statusHistory = [];
  q.statusHistory.push({ from: q.statusHistory.slice(-1)[0]?.to || "sent", to: "converted", at: nowIso, by: userName || "" });

  return { ok: true, po };
}
