/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Purchase RFQs Utility (V21.10.5 — #3 Slice 6)
   ───────────────────────────────────────────────────────────────────────
   Mirror of utils/sales/quotations.js for the Purchase side.
   RFQ = Request for Quotation — pre-PO document used to request supplier
   pricing. Doesn't touch stock or commit funds.

   --- Schema ---
   data.purchaseRFQs = [{
     id, rfqNo: "RFQ-2026-0001",
     date, validUntil,
     supplierId, supplierName, supplierPhone,
     items: [{ sourceType, sourceId, modelNo, description, qty,
               unitPrice, discountType, discountValue,
               lineSubtotal, lineDiscount, lineTotal }],
     subtotal, discountPct, totalDiscount, total,
     status: "draft" | "sent" | "received" | "accepted" | "rejected"
           | "converted" | "expired",
     notes, requestedBy,
     convertedToPipelinePOId, convertedToPipelinePONo, convertedAt, convertedBy,
     sentAt, sentBy, sentChannel,
     statusHistory, createdAt, createdBy,
   }]
   data.rfqCounters = { 2026: 0 }
   data.rfqSettings = { defaultValidityDays: 30 }
   ═══════════════════════════════════════════════════════════════════════ */

import { r2 } from "../format.js";

const PREFIX = "RFQ";

export function nextRFQNo(data){
  const year = new Date().getFullYear();
  const next = ((data.rfqCounters || {})[year] || 0) + 1;
  return `${PREFIX}-${year}-${String(next).padStart(4, "0")}`;
}

export function reserveRFQNo(d){
  if(!d.rfqCounters) d.rfqCounters = {};
  const year = new Date().getFullYear();
  const next = (d.rfqCounters[year] || 0) + 1;
  d.rfqCounters[year] = next;
  return `${PREFIX}-${year}-${String(next).padStart(4, "0")}`;
}

export function computeRFQTotals(items, documentDiscountPct = 0){
  let subtotal = 0, totalLineDiscount = 0;
  const processedItems = (items || []).map(it => {
    const qty = Number(it.qty) || 0;
    const unitPrice = Number(it.unitPrice) || 0;
    const lineSubtotal = r2(qty * unitPrice);
    let lineDiscount = 0;
    if(it.discountType === "pct"){
      lineDiscount = r2(lineSubtotal * (Number(it.discountValue) || 0) / 100);
    } else if(it.discountType === "amount"){
      lineDiscount = r2(Number(it.discountValue) || 0);
    }
    if(lineDiscount > lineSubtotal) lineDiscount = lineSubtotal;
    const lineTotal = r2(lineSubtotal - lineDiscount);
    subtotal += lineSubtotal;
    totalLineDiscount += lineDiscount;
    return { ...it, qty, unitPrice, lineSubtotal, lineDiscount, lineTotal };
  });
  subtotal = r2(subtotal);
  totalLineDiscount = r2(totalLineDiscount);
  const afterLineDisc = r2(subtotal - totalLineDiscount);
  const docDiscount = r2(afterLineDisc * (Number(documentDiscountPct) || 0) / 100);
  const totalDiscount = r2(totalLineDiscount + docDiscount);
  const total = r2(subtotal - totalDiscount);
  return { items: processedItems, subtotal, totalLineDiscount, docDiscount, totalDiscount, total };
}

export function buildRFQ(d, args){
  const { supplier, items, documentDiscountPct = 0, validityDays, notes, requestedBy, userName } = args;
  if(!supplier || !supplier.id) throw new Error("اختر المورد");
  if(!items || items.length === 0) throw new Error("أضف بنود للطلب");
  const rfqNo = reserveRFQNo(d);
  const date = new Date().toISOString().split("T")[0];
  const validity = Number(validityDays) || Number(d.rfqSettings?.defaultValidityDays) || 30;
  const validUntil = new Date(Date.now() + validity * 86400000).toISOString().split("T")[0];
  const totals = computeRFQTotals(items, documentDiscountPct);
  return {
    id: "rfq_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,7),
    rfqNo, date, validUntil,
    supplierId: supplier.id,
    supplierName: supplier.name || "",
    supplierPhone: supplier.phone || "",
    items: totals.items, subtotal: totals.subtotal,
    discountPct: Number(documentDiscountPct) || 0,
    totalDiscount: totals.totalDiscount, total: totals.total,
    status: "draft",
    notes: notes || "",
    requestedBy: requestedBy || userName || "",
    statusHistory: [{ from: null, to: "draft", at: new Date().toISOString(), by: userName || "" }],
    createdAt: new Date().toISOString(), createdBy: userName || "",
  };
}

export function markRFQSentMutator(d, rfqId, channel, userName){
  const r = (d.purchaseRFQs || []).find(x => x.id === rfqId);
  if(!r) throw new Error("الطلب غير موجود");
  if(r.status === "sent") return;
  if(!["draft"].includes(r.status)) throw new Error(`لا يمكن الإرسال من حالة "${r.status}"`);
  const prev = r.status;
  r.status = "sent"; r.sentAt = new Date().toISOString();
  r.sentBy = userName || ""; r.sentChannel = channel || "manual";
  if(!Array.isArray(r.statusHistory)) r.statusHistory = [];
  r.statusHistory.push({ from: prev, to: "sent", at: r.sentAt, by: userName || "" });
}

export function markRFQReceivedMutator(d, rfqId, userName){
  /* "Received" = supplier responded with their quote */
  const r = (d.purchaseRFQs || []).find(x => x.id === rfqId);
  if(!r) throw new Error("الطلب غير موجود");
  if(r.status === "received") return;
  if(!["sent","draft"].includes(r.status)) throw new Error(`لا يمكن استلام عرض من حالة "${r.status}"`);
  const prev = r.status;
  r.status = "received";
  if(!Array.isArray(r.statusHistory)) r.statusHistory = [];
  r.statusHistory.push({ from: prev, to: "received", at: new Date().toISOString(), by: userName || "" });
}

export function markRFQAcceptedMutator(d, rfqId, userName){
  const r = (d.purchaseRFQs || []).find(x => x.id === rfqId);
  if(!r) throw new Error("الطلب غير موجود");
  if(r.status === "accepted") return;
  if(!["draft","sent","received"].includes(r.status)) throw new Error(`لا يمكن الموافقة من حالة "${r.status}"`);
  const prev = r.status;
  r.status = "accepted";
  if(!Array.isArray(r.statusHistory)) r.statusHistory = [];
  r.statusHistory.push({ from: prev, to: "accepted", at: new Date().toISOString(), by: userName || "" });
}

export function markRFQRejectedMutator(d, rfqId, userName, reason){
  const r = (d.purchaseRFQs || []).find(x => x.id === rfqId);
  if(!r) throw new Error("الطلب غير موجود");
  if(r.status === "rejected") return;
  if(["converted"].includes(r.status)) throw new Error(`لا يمكن رفض طلب ${r.status}`);
  const prev = r.status;
  r.status = "rejected"; r.rejectedReason = reason || "";
  if(!Array.isArray(r.statusHistory)) r.statusHistory = [];
  r.statusHistory.push({ from: prev, to: "rejected", at: new Date().toISOString(), by: userName || "", note: reason || "" });
}

export function deleteDraftRFQMutator(d, rfqId){
  if(!Array.isArray(d.purchaseRFQs)) return;
  const r = d.purchaseRFQs.find(x => x.id === rfqId);
  if(!r) return;
  if(r.status !== "draft") throw new Error("لا يمكن حذف طلب بعد الإرسال — اعمل rejected بدلاً");
  d.purchaseRFQs = d.purchaseRFQs.filter(x => x.id !== rfqId);
}

export function autoExpireRFQsMutator(d){
  if(!Array.isArray(d.purchaseRFQs)) return 0;
  const today = new Date().toISOString().split("T")[0];
  let count = 0;
  d.purchaseRFQs.forEach(r => {
    if(["draft","sent","received"].includes(r.status) && r.validUntil && r.validUntil < today){
      const prev = r.status;
      r.status = "expired";
      if(!Array.isArray(r.statusHistory)) r.statusHistory = [];
      r.statusHistory.push({ from: prev, to: "expired", at: new Date().toISOString(), by: "system" });
      count++;
    }
  });
  return count;
}

export function validateRFQ(args){
  const errors = [];
  if(!args.supplier || !args.supplier.id) errors.push("المورد مطلوب");
  if(!args.items || args.items.length === 0) errors.push("أضف بند واحد على الأقل");
  (args.items || []).forEach((it, i) => {
    if(!(Number(it.qty) > 0)) errors.push(`السطر ${i+1}: الكمية لازم أكبر من صفر`);
    if(!(Number(it.unitPrice) >= 0)) errors.push(`السطر ${i+1}: السعر مش صالح`);
    if(!it.modelNo && !it.description) errors.push(`السطر ${i+1}: ضع وصف للبند`);
  });
  return { ok: errors.length === 0, errors };
}

export function getRFQStats(data, filters = {}){
  const list = (data.purchaseRFQs || []).filter(r => {
    if(filters.from && (r.date || "") < filters.from) return false;
    if(filters.to && (r.date || "") > filters.to) return false;
    if(filters.partyId && r.supplierId !== filters.partyId) return false;
    if(filters.status && filters.status !== "all" && r.status !== filters.status) return false;
    return true;
  });
  return {
    count: list.length,
    totalValue: r2(list.reduce((s, r) => s + (Number(r.total) || 0), 0)),
    drafts:    list.filter(r => r.status === "draft").length,
    sent:      list.filter(r => r.status === "sent").length,
    received:  list.filter(r => r.status === "received").length,
    accepted:  list.filter(r => r.status === "accepted").length,
    rejected:  list.filter(r => r.status === "rejected").length,
    converted: list.filter(r => r.status === "converted").length,
    expired:   list.filter(r => r.status === "expired").length,
  };
}
