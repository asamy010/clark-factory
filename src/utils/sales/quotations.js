/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Sales Quotations Utility (V21.10.0 — #3 Slice 1)
   ───────────────────────────────────────────────────────────────────────
   Standalone quote builder — Step 1 of the Quote → Sales Order → Invoice
   → Payment document chain (prompt #3).

   This slice ships quotations as an add-only feature: free-form items
   (orders + general products + inventoryItems + ad-hoc services),
   per-line + per-document discount, status workflow (draft / sent /
   accepted / rejected / expired / converted), validity date, and
   counter QT-YYYY-NNNN.

   ⚠️ DOES NOT touch stock yet. Stock deduction happens at Sales Order
   confirm (Slice 2). DOES NOT auto-create invoices (Slice 3).

   --- Schema ---
   data.salesQuotations = [
     {
       id, quoteNo: "QT-2026-0012",
       date, validUntil,
       customerId, customerName, customerPhone,
       items: [{
         sourceType: "order" | "generalProduct" | "inventoryItem" | "service",
         sourceId, modelNo, description,
         qty, unitPrice, discountType ("pct"|"amount"), discountValue,
         lineSubtotal, lineDiscount, lineTotal,
       }],
       subtotal, discountPct, totalDiscount, total,
       status: "draft" | "sent" | "accepted" | "rejected" | "converted" | "expired",
       notes, salesPerson,
       -- Cross-links (filled in Slice 2+) --
       convertedToSalesOrderId, convertedToSalesOrderNo, convertedAt, convertedBy,
       sentAt, sentBy, sentChannel,
       -- Audit --
       statusHistory: [{from, to, at, by}],
       createdAt, createdBy,
     }
   ]
   data.quotationCounters  = { 2026: 12 }
   data.quotationSettings  = { defaultValidityDays: 14 }
   ═══════════════════════════════════════════════════════════════════════ */

import { r2 } from "../format.js";

const PREFIX = "QT";

/* Generate the next quotation number for the current year (read-only peek). */
export function nextQuotationNo(data){
  const year = new Date().getFullYear();
  const counters = data.quotationCounters || {};
  const next = (counters[year] || 0) + 1;
  return `${PREFIX}-${year}-${String(next).padStart(4, "0")}`;
}

/* Reserve and increment — pass into upConfig mutator. */
export function reserveQuotationNo(d){
  if(!d.quotationCounters) d.quotationCounters = {};
  const year = new Date().getFullYear();
  const next = (d.quotationCounters[year] || 0) + 1;
  d.quotationCounters[year] = next;
  return `${PREFIX}-${year}-${String(next).padStart(4, "0")}`;
}

/* Compute totals for an items array. Used by both build and edit flows.
   Each line: lineSubtotal = qty * unitPrice (rounded), lineDiscount per its
   own type (pct of subtotal OR fixed amount), lineTotal = subtotal - discount.
   Document: subtotal = sum(lineSubtotal), totalDiscount = sum(lineDiscount)
   + an optional document-level pct (applied AFTER per-line discounts), total =
   subtotal - totalDiscount. */
export function computeQuotationTotals(items, documentDiscountPct = 0){
  let subtotal = 0;
  let totalLineDiscount = 0;
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

/* Build a fresh quotation object. Caller spreads into upConfig + reserves no.
   Returns the object — does NOT push. */
export function buildQuotation(d, args){
  const {
    customer, items, documentDiscountPct = 0,
    validityDays, notes, salesPerson, userName,
  } = args;
  if(!customer || !customer.id) throw new Error("اختر العميل");
  if(!items || items.length === 0) throw new Error("أضف بنود للعرض");

  const quoteNo = reserveQuotationNo(d);
  const date = new Date().toISOString().split("T")[0];
  const validity = Number(validityDays) || Number(d.quotationSettings?.defaultValidityDays) || 14;
  const validUntil = new Date(Date.now() + validity * 86400000).toISOString().split("T")[0];

  const totals = computeQuotationTotals(items, documentDiscountPct);

  return {
    id: "qt_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,7),
    quoteNo,
    date, validUntil,
    customerId: customer.id,
    customerName: customer.name || "",
    customerPhone: customer.phone || "",
    items: totals.items,
    subtotal: totals.subtotal,
    discountPct: Number(documentDiscountPct) || 0,
    totalDiscount: totals.totalDiscount,
    total: totals.total,
    status: "draft",
    notes: notes || "",
    salesPerson: salesPerson || userName || "",
    statusHistory: [{ from: null, to: "draft", at: new Date().toISOString(), by: userName || "" }],
    createdAt: new Date().toISOString(),
    createdBy: userName || "",
  };
}

/* Status transition mutators. All are idempotent on already-matching status. */
export function markQuotationSentMutator(d, quoteId, channel, userName){
  const q = (d.salesQuotations || []).find(x => x.id === quoteId);
  if(!q) throw new Error("العرض غير موجود");
  if(q.status === "sent") return;
  if(!["draft"].includes(q.status)) throw new Error(`لا يمكن الإرسال من حالة "${q.status}"`);
  const prev = q.status;
  q.status = "sent";
  q.sentAt = new Date().toISOString();
  q.sentBy = userName || "";
  q.sentChannel = channel || "manual";
  if(!Array.isArray(q.statusHistory)) q.statusHistory = [];
  q.statusHistory.push({ from: prev, to: "sent", at: q.sentAt, by: userName || "" });
}

export function markQuotationAcceptedMutator(d, quoteId, userName){
  const q = (d.salesQuotations || []).find(x => x.id === quoteId);
  if(!q) throw new Error("العرض غير موجود");
  if(q.status === "accepted") return;
  if(!["draft","sent"].includes(q.status)) throw new Error(`لا يمكن الموافقة من حالة "${q.status}"`);
  const prev = q.status;
  q.status = "accepted";
  if(!Array.isArray(q.statusHistory)) q.statusHistory = [];
  q.statusHistory.push({ from: prev, to: "accepted", at: new Date().toISOString(), by: userName || "" });
}

export function markQuotationRejectedMutator(d, quoteId, userName, reason){
  const q = (d.salesQuotations || []).find(x => x.id === quoteId);
  if(!q) throw new Error("العرض غير موجود");
  if(q.status === "rejected") return;
  if(["converted"].includes(q.status)) throw new Error(`لا يمكن رفض عرض ${q.status}`);
  const prev = q.status;
  q.status = "rejected";
  q.rejectedReason = reason || "";
  if(!Array.isArray(q.statusHistory)) q.statusHistory = [];
  q.statusHistory.push({ from: prev, to: "rejected", at: new Date().toISOString(), by: userName || "", note: reason || "" });
}

export function deleteDraftQuotationMutator(d, quoteId){
  if(!Array.isArray(d.salesQuotations)) return;
  const q = d.salesQuotations.find(x => x.id === quoteId);
  if(!q) return;
  if(q.status !== "draft") throw new Error("لا يمكن حذف عرض بعد الإرسال — اعمل rejected بدلاً");
  d.salesQuotations = d.salesQuotations.filter(x => x.id !== quoteId);
}

/* Mark an existing draft as expired if validUntil < today. Called on page load
   so admin sees current state. Idempotent. */
export function autoExpireQuotationsMutator(d){
  if(!Array.isArray(d.salesQuotations)) return 0;
  const today = new Date().toISOString().split("T")[0];
  let count = 0;
  d.salesQuotations.forEach(q => {
    if(["draft","sent"].includes(q.status) && q.validUntil && q.validUntil < today){
      const prev = q.status;
      q.status = "expired";
      if(!Array.isArray(q.statusHistory)) q.statusHistory = [];
      q.statusHistory.push({ from: prev, to: "expired", at: new Date().toISOString(), by: "system" });
      count++;
    }
  });
  return count;
}

/* Validate an items array before save. Returns {ok, errors[]}. */
export function validateQuotation(args){
  const errors = [];
  if(!args.customer || !args.customer.id) errors.push("العميل مطلوب");
  if(!args.items || args.items.length === 0) errors.push("أضف بند واحد على الأقل");
  (args.items || []).forEach((it, i) => {
    if(!(Number(it.qty) > 0)) errors.push(`السطر ${i+1}: الكمية لازم أكبر من صفر`);
    if(!(Number(it.unitPrice) >= 0)) errors.push(`السطر ${i+1}: السعر مش صالح`);
    if(!it.modelNo && !it.description) errors.push(`السطر ${i+1}: ضع وصف للبند`);
  });
  return { ok: errors.length === 0, errors };
}

/* Stats for the page header. */
export function getQuotationStats(data, filters = {}){
  const list = (data.salesQuotations || []).filter(q => {
    if(filters.from && (q.date || "") < filters.from) return false;
    if(filters.to && (q.date || "") > filters.to) return false;
    if(filters.partyId && q.customerId !== filters.partyId) return false;
    if(filters.status && filters.status !== "all" && q.status !== filters.status) return false;
    return true;
  });
  return {
    count: list.length,
    totalValue: r2(list.reduce((s, q) => s + (Number(q.total) || 0), 0)),
    drafts:    list.filter(q => q.status === "draft").length,
    sent:      list.filter(q => q.status === "sent").length,
    accepted:  list.filter(q => q.status === "accepted").length,
    rejected:  list.filter(q => q.status === "rejected").length,
    converted: list.filter(q => q.status === "converted").length,
    expired:   list.filter(q => q.status === "expired").length,
  };
}
