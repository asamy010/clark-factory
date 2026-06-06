/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Sales Orders Utility (V21.10.1 — Phase 12b)
   ───────────────────────────────────────────────────────────────────────
   أوامر البيع (Odoo-style document chain — Slice 2). أمر البيع بيتولّد من
   عرض سعر (Quote → SO). عند التأكيد بيخصم المخزون فعلياً للأصناف من
   inventoryItems فقط (قرار Ahmed V21.10.0) — موديلات الـ orders بتفضل
   عبر CustDeliverPg زي ما هي (مش بنلمسها).

   ⚠️ هذا الملف بيعدّل رصيد مخزون حقيقي. كل عملية خصم لها deduction record
   مخزّن على الـ SO (stockDeductions[]) عشان الـ cancel يعكسها بدقّة
   (self-contained — مش بيعتمد على البحث في stockMovements).

   الخصم/العكس بيستخدم applyStockDelta (نفس آلية الاستلام المثبتة في
   PurchasePg) + بيسجّل حركة في stockMovements (split → stockMovementsDays).
   مفيش قيود محاسبية في هذه المرحلة — الإيراد/COGS بيحصلوا عند الفاتورة
   (Slice 3).

   ─── Schema (data.salesOrders[i]) ───
   {
     id, orderNo: "أمر-2026-0001", date,
     customerId, customerName, customerPhone, customerNameAdHoc,
     items: [...snapshot من العرض],
     subtotal, discountPct, totalDiscount, total,
     status: "confirmed"|"partial_delivered"|"delivered"|"invoiced"|"cancelled",
     fromQuotationId, fromQuotationNo,
     salesInvoiceId, salesInvoiceNo,           // Slice 3
     stockDeducted, stockDeductions: [{itemId, categoryId, qty, itemName, unit, unitCost}],
     stockMovementIds: [], stockDeductedAt, stockDeductedBy,
     cancelReason, cancelledAt, cancelledBy,
     statusHistory: [{from, to, at, by, note}],
     notes, salesPerson, createdAt, createdBy
   }
   data.invoiceCounters.salesOrder = { 2026: 0 }
   ═══════════════════════════════════════════════════════════════════════ */

import { applyStockDelta } from "../categories.js";
import { reserveInvoiceNo } from "../invoices.js";

const SO_PREFIX = "أمر"; /* عربي حسب قرار Ahmed (V21.10.0) */

export const SO_STATUSES = ["confirmed", "partial_delivered", "delivered", "invoiced", "cancelled"];

function _gid(){ return "so_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7); }
function _mid(){ return "mv_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7); }

/* ── Counter ── */
export function nextSalesOrderNo(data){
  const year = new Date().getFullYear();
  const yearMap = (data?.invoiceCounters || {}).salesOrder || {};
  const next = (yearMap[year] || 0) + 1;
  return `${SO_PREFIX}-${year}-${String(next).padStart(4, "0")}`;
}
export function reserveSalesOrderNo(d){
  if(!d.invoiceCounters) d.invoiceCounters = {};
  if(!d.invoiceCounters.salesOrder) d.invoiceCounters.salesOrder = {};
  const year = new Date().getFullYear();
  const next = (d.invoiceCounters.salesOrder[year] || 0) + 1;
  d.invoiceCounters.salesOrder[year] = next;
  return `${SO_PREFIX}-${year}-${String(next).padStart(4, "0")}`;
}

/* ── Stock helpers ── */

/* جمّع الكميات المطلوبة من inventoryItems لكل صنف (بنود متعددة لنفس الصنف). */
function _aggregateInventoryNeeds(items){
  const needs = new Map(); /* itemId → qty */
  (items || []).forEach(it => {
    if(it.sourceType !== "inventoryItem" || !it.sourceId) return;
    const q = Number(it.qty) || 0;
    if(q <= 0) return;
    needs.set(it.sourceId, (needs.get(it.sourceId) || 0) + q);
  });
  return needs;
}

/* افحص توفّر المخزون. بيرجّع [{itemId, name, need, have}] للنواقص فقط. */
export function checkStockForItems(d, items){
  const needs = _aggregateInventoryNeeds(items);
  const short = [];
  for(const [itemId, need] of needs){
    const it = (d.inventoryItems || []).find(x => x.id === itemId);
    const have = Number(it?.stock) || 0;
    if(have < need) short.push({ itemId, name: it?.name || itemId, need, have });
  }
  return short;
}

/* ── Convert Quotation → Sales Order (+ stock deduction) ── */
/* opts: { stockEnabled, blockOnInsufficientStock }
   بيرجّع { ok, error?, salesOrder? }. */
export function convertQuotationToSalesOrderMutator(d, quoteId, userName, opts = {}){
  if(!Array.isArray(d.salesQuotations)) return { ok: false, error: "لا توجد عروض" };
  const quote = d.salesQuotations.find(q => q && q.id === quoteId);
  if(!quote) return { ok: false, error: "العرض غير موجود" };
  if(quote.status === "rejected") return { ok: false, error: "العرض مرفوض — مينفعش يتحوّل" };
  /* V21.10.2 SELF-HEAL: block فقط لو أمر البيع موجود فعلاً. لو العرض متعلّم
     "متحوّل" بس الأمر مش موجود (partial write — مثلاً rules اتنشرت متأخرة أو
     انقطع النت وقت الكتابة عبر الـ collections) نسمح بإعادة التحويل بدل ما
     يفضل العرض orphan مش بيتحوّل ولا بيتحذف. */
  if(quote.convertedToSalesOrderId){
    const existingSO = (d.salesOrders || []).find(s => s && s.id === quote.convertedToSalesOrderId);
    if(existingSO) return { ok: false, error: "العرض متحوّل بالفعل لأمر بيع" };
    /* orphan — نكمّل ونعيد التحويل (الحقول هتتكتب من جديد تحت) */
  }

  const items = Array.isArray(quote.items) ? quote.items : [];
  if(items.length === 0) return { ok: false, error: "العرض مفيهوش بنود" };

  /* فحص المخزون (للأصناف فقط) لو التفعيل + المنع شغّالين */
  if(opts.stockEnabled && opts.blockOnInsufficientStock){
    const short = checkStockForItems(d, items);
    if(short.length > 0){
      const msg = short.map(s => `${s.name} (متاح ${s.have} / مطلوب ${s.need})`).join("، ");
      return { ok: false, error: "مخزون غير كافٍ: " + msg };
    }
  }

  const nowIso = new Date().toISOString();
  const orderNo = reserveSalesOrderNo(d);
  const so = {
    id: _gid(),
    orderNo,
    date: new Date().toISOString().split("T")[0],
    customerId: quote.customerId || "",
    customerName: quote.customerName || "",
    customerPhone: quote.customerPhone || "",
    customerNameAdHoc: quote.customerNameAdHoc || "",
    items: JSON.parse(JSON.stringify(items)), /* snapshot لحظة التحويل */
    subtotal: quote.subtotal || 0,
    discountPct: quote.discountPct || 0,
    totalDiscount: quote.totalDiscount || 0,
    total: quote.total || 0,
    status: "confirmed",
    fromQuotationId: quote.id,
    fromQuotationNo: quote.quoteNo || "",
    salesInvoiceId: "", salesInvoiceNo: "",
    stockDeducted: false,
    stockDeductions: [],
    stockMovementIds: [],
    stockDeductedAt: "", stockDeductedBy: "",
    cancelReason: "", cancelledAt: "", cancelledBy: "",
    statusHistory: [{ from: "", to: "confirmed", at: nowIso, by: userName || "", note: "تحويل من " + (quote.quoteNo || "") }],
    notes: quote.notes || "",
    salesPerson: quote.salesPerson || userName || "",
    createdAt: nowIso,
    createdBy: userName || "",
  };

  /* خصم المخزون (inventoryItems فقط) */
  if(opts.stockEnabled){
    if(!Array.isArray(d.stockMovements)) d.stockMovements = [];
    const needs = _aggregateInventoryNeeds(items);
    for(const [itemId, qty] of needs){
      const it = (d.inventoryItems || []).find(x => x.id === itemId);
      if(!it) continue; /* صنف اتمسح — نتخطّاه بأمان */
      const unitCost = Number(it.avgCost) || 0;
      const ok = applyStockDelta(d, it.categoryId, itemId, -qty, null);
      if(!ok) continue;
      const mvId = _mid();
      so.stockDeductions.push({ itemId, categoryId: it.categoryId, qty, itemName: it.name || "", unit: it.unit || "", unitCost });
      so.stockMovementIds.push(mvId);
      d.stockMovements.push({
        id: mvId, type: "out", itemType: it.categoryId, itemId, itemName: it.name || "",
        qty: -qty, unit: it.unit || "", price: unitCost, date: so.date,
        sourceType: "sales_order", sourceId: so.id,
        notes: "خصم أمر بيع " + orderNo,
        createdBy: userName || "", createdAt: nowIso,
      });
    }
    so.stockDeducted = so.stockDeductions.length > 0;
    so.stockDeductedAt = nowIso;
    so.stockDeductedBy = userName || "";
  }

  if(!Array.isArray(d.salesOrders)) d.salesOrders = [];
  d.salesOrders.unshift(so);

  /* علّم العرض كـ متحوّل */
  quote.status = "converted";
  quote.convertedToSalesOrderId = so.id;
  quote.convertedToSalesOrderNo = orderNo;
  quote.convertedAt = nowIso;
  quote.convertedBy = userName || "";
  if(!Array.isArray(quote.statusHistory)) quote.statusHistory = [];
  quote.statusHistory.push({ from: quote.statusHistory.slice(-1)[0]?.to || "draft", to: "converted", at: nowIso, by: userName || "" });

  return { ok: true, salesOrder: so };
}

/* ── Create Sales Invoice from Sales Order (Slice 3 / Phase 12c) ── */
/* بيعمل فاتورة مبيعات DRAFT من أمر البيع باستخدام نظام الفواتير الموجود
   (salesInvoices → salesInvoicesDays + counter INV). بيربط الفاتورة بأمر
   البيع وعرض السعر (cross-links) ويعلّم الأمر "مفوتر". مفيش ترحيل/محاسبة
   هنا — الفاتورة draft، الترحيل + الدفع في Slice 4.
   SELF-HEAL: بيبلوك بس لو الفاتورة موجودة فعلاً (يعالج partial write).
   بيرجّع { ok, error?, invoice? }. */
export function createInvoiceFromSalesOrderMutator(d, soId, userName){
  if(!Array.isArray(d.salesOrders)) return { ok: false, error: "لا توجد أوامر بيع" };
  const so = d.salesOrders.find(x => x && x.id === soId);
  if(!so) return { ok: false, error: "أمر البيع غير موجود" };
  if(so.status === "cancelled") return { ok: false, error: "أمر البيع ملغي — لا يمكن فوترته" };
  if(so.salesInvoiceId){
    const existingInv = (d.salesInvoices || []).find(i => i && i.id === so.salesInvoiceId);
    if(existingInv) return { ok: false, error: "أمر البيع مفوتر بالفعل (" + (so.salesInvoiceNo || "") + ")" };
    /* فاتورة مفقودة (partial write) — نسمح بإعادة الفوترة */
  }

  const nowIso = new Date().toISOString();
  const invoiceNo = reserveInvoiceNo(d, "sales");
  const items = (so.items || []).map(it => ({
    orderId: it.sourceType === "order" ? (it.sourceId || "") : "",
    modelNo: it.modelNo || it.description || "",
    modelDesc: it.description || "",
    qty: Number(it.qty) || 0,
    unitPrice: Number(it.unitPrice) || 0,
    lineTotal: Number(it.lineTotal) || 0,
  }));
  const invoice = {
    id: "inv_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7),
    invoiceNo,
    type: "sales",
    customerId: so.customerId || "",
    customerName: so.customerName || "",
    customerNameAdHoc: so.customerId ? "" : (so.customerNameAdHoc || ""),
    date: new Date().toISOString().split("T")[0],
    deliveryRef: null,
    deliveryRefs: [],
    items,
    subtotal: so.subtotal || 0,
    discountPct: so.discountPct || 0,
    discount: so.totalDiscount || 0,
    total: so.total || 0,
    status: "draft",
    notes: so.notes || "",
    /* V21.10.3 cross-links (add-only on the existing invoice schema) */
    fromSalesOrderId: so.id,
    fromSalesOrderNo: so.orderNo || "",
    fromQuotationId: so.fromQuotationId || "",
    fromQuotationNo: so.fromQuotationNo || "",
    createdAt: nowIso,
    createdBy: userName || "",
  };
  if(!Array.isArray(d.salesInvoices)) d.salesInvoices = [];
  d.salesInvoices.unshift(invoice);

  const from = so.status;
  so.salesInvoiceId = invoice.id;
  so.salesInvoiceNo = invoiceNo;
  so.status = "invoiced";
  if(!Array.isArray(so.statusHistory)) so.statusHistory = [];
  so.statusHistory.push({ from, to: "invoiced", at: nowIso, by: userName || "", note: "فاتورة " + invoiceNo });

  return { ok: true, invoice };
}

/* ── Cancel Sales Order (+ stock reversal) ── */
/* بيعكس الخصم بدقّة من stockDeductions[] (self-contained). بيرجّع {ok, error?}. */
export function cancelSalesOrderMutator(d, soId, userName, reason){
  if(!Array.isArray(d.salesOrders)) return { ok: false, error: "لا توجد أوامر بيع" };
  const so = d.salesOrders.find(x => x && x.id === soId);
  if(!so) return { ok: false, error: "أمر البيع غير موجود" };
  if(so.status === "cancelled") return { ok: false, error: "أمر البيع ملغي بالفعل" };
  if(so.status === "invoiced") return { ok: false, error: "أمر البيع مفوتر — لا يمكن إلغاؤه (الغِ الفاتورة أولاً)" };

  const nowIso = new Date().toISOString();

  /* عكس خصم المخزون (لو كان متخصم) */
  if(so.stockDeducted && Array.isArray(so.stockDeductions) && so.stockDeductions.length > 0){
    if(!Array.isArray(d.stockMovements)) d.stockMovements = [];
    for(const ded of so.stockDeductions){
      /* رجّع الكمية (delta موجب). unitCost = avgCost وقت الخصم عشان
         الـ weighted-average يرجع متّسق لو الصنف فضي وقت الإرجاع. */
      applyStockDelta(d, ded.categoryId, ded.itemId, +ded.qty, ded.unitCost || null);
      d.stockMovements.push({
        id: _mid(), type: "in", itemType: ded.categoryId, itemId: ded.itemId, itemName: ded.itemName || "",
        qty: +ded.qty, unit: ded.unit || "", price: ded.unitCost || 0, date: new Date().toISOString().split("T")[0],
        sourceType: "sales_order_cancel", sourceId: so.id,
        notes: "إلغاء أمر بيع " + (so.orderNo || "") + " — استرجاع مخزون",
        createdBy: userName || "", createdAt: nowIso,
      });
    }
  }

  const from = so.status;
  so.status = "cancelled";
  so.stockDeducted = false;
  so.cancelReason = reason || "";
  so.cancelledAt = nowIso;
  so.cancelledBy = userName || "";
  if(!Array.isArray(so.statusHistory)) so.statusHistory = [];
  so.statusHistory.push({ from, to: "cancelled", at: nowIso, by: userName || "", note: reason || "" });

  /* رجّع العرض المصدر لحالة "مقبول" عشان يتحوّل تاني لو حبّ */
  if(so.fromQuotationId && Array.isArray(d.salesQuotations)){
    const q = d.salesQuotations.find(x => x && x.id === so.fromQuotationId);
    if(q && q.status === "converted"){
      q.status = "accepted";
      q.convertedToSalesOrderId = "";
      q.convertedToSalesOrderNo = "";
      if(!Array.isArray(q.statusHistory)) q.statusHistory = [];
      q.statusHistory.push({ from: "converted", to: "accepted", at: nowIso, by: userName || "", note: "إلغاء " + (so.orderNo || "") });
    }
  }

  return { ok: true };
}
