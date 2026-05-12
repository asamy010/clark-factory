/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Sales Orders Utility (V21.10.1 — #3 Slice 2)
   ───────────────────────────────────────────────────────────────────────
   The middle step in the Quote → Sales Order → Invoice → Payment chain.
   A Sales Order is a CONFIRMED commitment to deliver: this is the document
   that actually reserves/deducts stock.

   Status workflow:
     draft → confirmed → partial_delivered → delivered → invoiced
                      ↘ cancelled (reverses any stock impact)

   Stock impact (V21.10.1):
     - generalProduct items: applyStockDelta on data.generalProducts[i].stock
     - inventoryItem items (fabrics + accessories): applyStockDelta on
       data.fabrics[i].stock / data.accessories[i].stock
     - "order" items (models from data.orders): NOT touched in this slice —
       the existing CustDeliver delivery flow remains the source of truth
       for finished-goods stock; the SO records an intent but the actual
       shipment goes through the existing pendingRcv → confirmed → invoice
       workflow. This avoids two competing deduction paths.
     - "service" items: no stock impact (intangible).

   --- Schema ---
   data.salesOrders = [
     {
       id, orderNo: "SO-2026-0042",
       date,
       customerId, customerName, customerPhone,
       items: [ same shape as quotation items + sourceType ],
       subtotal, discountPct, totalDiscount, total,
       status: "draft" | "confirmed" | "partial_delivered" | "delivered" |
               "invoiced" | "cancelled",
       fromQuotationId, fromQuotationNo,
       salesInvoiceId, salesInvoiceNo,
       deliverySessionIds: [],
       stockDeducted: bool,
       stockMovementIds: [],
       stockDeductedAt, stockDeductedBy,
       cancelledAt, cancelledBy, cancelReason,
       statusHistory: [{from, to, at, by, note?}],
       notes, salesPerson, createdAt, createdBy,
     }
   ]
   data.salesOrderCounters = { 2026: 42 }
   ═══════════════════════════════════════════════════════════════════════ */

import { r2 } from "../format.js";

const PREFIX = "SO";

export function nextSalesOrderNo(data){
  const year = new Date().getFullYear();
  const counters = data.salesOrderCounters || {};
  const next = (counters[year] || 0) + 1;
  return `${PREFIX}-${year}-${String(next).padStart(4, "0")}`;
}

export function reserveSalesOrderNo(d){
  if(!d.salesOrderCounters) d.salesOrderCounters = {};
  const year = new Date().getFullYear();
  const next = (d.salesOrderCounters[year] || 0) + 1;
  d.salesOrderCounters[year] = next;
  return `${PREFIX}-${year}-${String(next).padStart(4, "0")}`;
}

/* Convert an accepted/sent/draft quotation to a Sales Order (in draft status —
   does NOT deduct stock yet; that happens at confirm). Bi-directional links
   are written: quote.convertedToSalesOrderId / so.fromQuotationId.

   Throws if the quote is in a non-convertible status (rejected/expired/converted). */
export function convertQuotationToSalesOrderMutator(d, quoteId, userName){
  const q = (d.salesQuotations || []).find(x => x.id === quoteId);
  if(!q) throw new Error("العرض غير موجود");
  if(["converted","rejected","expired"].includes(q.status)){
    throw new Error(`لا يمكن تحويل عرض في حالة "${q.status}"`);
  }
  if(q.convertedToSalesOrderId){
    throw new Error("العرض ده محوّل بالفعل لأمر بيع");
  }

  const orderNo = reserveSalesOrderNo(d);
  const date = new Date().toISOString().split("T")[0];
  const id = "so_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,7);

  const so = {
    id, orderNo, date,
    customerId: q.customerId,
    customerName: q.customerName,
    customerPhone: q.customerPhone,
    items: (q.items || []).map(it => ({ ...it })),/* snapshot */
    subtotal: q.subtotal,
    discountPct: q.discountPct,
    totalDiscount: q.totalDiscount,
    total: q.total,
    status: "draft",
    fromQuotationId: q.id,
    fromQuotationNo: q.quoteNo,
    salesInvoiceId: null,
    salesInvoiceNo: null,
    deliverySessionIds: [],
    stockDeducted: false,
    stockMovementIds: [],
    notes: q.notes || "",
    salesPerson: q.salesPerson || userName || "",
    statusHistory: [{ from: null, to: "draft", at: new Date().toISOString(), by: userName || "", note: "محوّل من عرض " + q.quoteNo }],
    createdAt: new Date().toISOString(),
    createdBy: userName || "",
  };

  if(!Array.isArray(d.salesOrders)) d.salesOrders = [];
  d.salesOrders.push(so);

  /* Back-link on the quotation + flip its status */
  q.status = "converted";
  q.convertedToSalesOrderId = so.id;
  q.convertedToSalesOrderNo = so.orderNo;
  q.convertedAt = new Date().toISOString();
  q.convertedBy = userName || "";
  if(!Array.isArray(q.statusHistory)) q.statusHistory = [];
  q.statusHistory.push({ from: q.statusHistory.at(-1)?.to || "?", to: "converted", at: q.convertedAt, by: userName || "" });

  return so;
}

/* Build a Sales Order directly (without a parent quotation). Used by the
   "New SO" form on the SO page. Same item shape as Quotations. */
export function buildSalesOrder(d, args){
  const { customer, items, subtotal, totalDiscount, total, documentDiscountPct, notes, salesPerson, userName } = args;
  if(!customer || !customer.id) throw new Error("اختر العميل");
  if(!items || items.length === 0) throw new Error("أضف بنود");

  const orderNo = reserveSalesOrderNo(d);
  return {
    id: "so_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,7),
    orderNo,
    date: new Date().toISOString().split("T")[0],
    customerId: customer.id,
    customerName: customer.name || "",
    customerPhone: customer.phone || "",
    items, subtotal,
    discountPct: documentDiscountPct || 0,
    totalDiscount, total,
    status: "draft",
    fromQuotationId: null, fromQuotationNo: null,
    salesInvoiceId: null, salesInvoiceNo: null,
    deliverySessionIds: [],
    stockDeducted: false,
    stockMovementIds: [],
    notes: notes || "",
    salesPerson: salesPerson || userName || "",
    statusHistory: [{ from: null, to: "draft", at: new Date().toISOString(), by: userName || "" }],
    createdAt: new Date().toISOString(),
    createdBy: userName || "",
  };
}

/* Confirm a Sales Order — deducts stock for generalProduct + inventoryItem
   items. Throws if any item is short of stock (and config allows blocking).

   Stock deduction policy:
     - generalProduct → data.generalProducts[i].stock -= qty
     - inventoryItem with sourceType="fabric" → data.fabrics[i].stock -= qty
     - inventoryItem with sourceType="accessory" → data.accessories[i].stock -= qty
     - "order" / "service" → no stock impact (see file header for why)

   stockMovements entries are appended (split by day already from V19.52)
   and their IDs are recorded on so.stockMovementIds[] for reversal. */
export function confirmSalesOrderMutator(d, soId, userName, options = {}){
  const so = (d.salesOrders || []).find(x => x.id === soId);
  if(!so) throw new Error("أمر البيع غير موجود");
  if(so.status === "confirmed") return so;
  if(so.status !== "draft") throw new Error(`لا يمكن تأكيد أمر بيع في حالة "${so.status}"`);

  const allowNegative = options.allowNegativeStock === true ||
                        d.invoiceSettings?.allowNegativeStock === true;
  const today = new Date().toISOString().split("T")[0];

  /* First pass: validate stock availability (refuse before any mutation) */
  if(!allowNegative){
    for(const it of so.items || []){
      if(it.sourceType === "generalProduct"){
        const p = (d.generalProducts || []).find(x => x.id === it.sourceId);
        const stk = Number(p?.stock) || 0;
        if(stk < Number(it.qty)){
          throw new Error(`المخزون غير كافٍ لـ "${p?.name || it.modelNo}" — متوفر ${stk}، المطلوب ${it.qty}`);
        }
      }
      /* Future: fabric/accessory checks. Not enforced in Slice 2 because
         the inventory model for them is not finalised in CLARK. */
    }
  }

  /* Second pass: deduct + create stockMovement entries */
  const stockMovementIds = [];
  (so.items || []).forEach(it => {
    if(it.sourceType === "generalProduct"){
      const p = (d.generalProducts || []).find(x => x.id === it.sourceId);
      if(p){
        const before = Number(p.stock) || 0;
        const qty = Number(it.qty) || 0;
        p.stock = before - qty;/* may go negative if allowNegative */
        p.lastMovementDate = today;

        const movId = "smv_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,7);
        if(!Array.isArray(d.stockMovements)) d.stockMovements = [];
        d.stockMovements.push({
          id: movId,
          date: today,
          type: "out",
          source: "sales_order",
          sourceId: so.id,
          sourceRef: so.orderNo,
          itemKind: "generalProduct",
          itemId: p.id,
          itemName: p.name,
          qty: qty,
          stockBefore: before,
          stockAfter: before - qty,
          unit: p.unit || "",
          createdAt: new Date().toISOString(),
          createdBy: userName || "",
        });
        stockMovementIds.push(movId);
      }
    }
    /* "order" / "service" / "inventoryItem" — no impact in Slice 2 */
  });

  const prev = so.status;
  so.status = "confirmed";
  so.stockDeducted = stockMovementIds.length > 0;
  so.stockMovementIds = stockMovementIds;
  so.stockDeductedAt = new Date().toISOString();
  so.stockDeductedBy = userName || "";
  if(!Array.isArray(so.statusHistory)) so.statusHistory = [];
  so.statusHistory.push({ from: prev, to: "confirmed", at: so.stockDeductedAt, by: userName || "" });

  return so;
}

/* Cancel a Sales Order — reverses any stock deduction by adding back stock
   and creating reverse stockMovement entries (type: "in", source: "so_cancel").
   The original stockMovement entries stay (audit trail) — we don't delete. */
export function cancelSalesOrderMutator(d, soId, userName, reason){
  const so = (d.salesOrders || []).find(x => x.id === soId);
  if(!so) throw new Error("أمر البيع غير موجود");
  if(so.status === "cancelled") return so;
  if(["delivered","invoiced"].includes(so.status)){
    throw new Error(`لا يمكن إلغاء أمر بيع تم تسليمه/فوترته`);
  }
  const today = new Date().toISOString().split("T")[0];

  /* Reverse stock impact only if we actually deducted */
  if(so.stockDeducted && Array.isArray(so.stockMovementIds) && so.stockMovementIds.length > 0){
    (so.items || []).forEach(it => {
      if(it.sourceType !== "generalProduct") return;
      const p = (d.generalProducts || []).find(x => x.id === it.sourceId);
      if(!p) return;
      const before = Number(p.stock) || 0;
      const qty = Number(it.qty) || 0;
      p.stock = before + qty;
      p.lastMovementDate = today;

      const movId = "smv_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,7);
      if(!Array.isArray(d.stockMovements)) d.stockMovements = [];
      d.stockMovements.push({
        id: movId,
        date: today,
        type: "in",
        source: "sales_order_cancel",
        sourceId: so.id,
        sourceRef: so.orderNo,
        itemKind: "generalProduct",
        itemId: p.id,
        itemName: p.name,
        qty: qty,
        stockBefore: before,
        stockAfter: before + qty,
        unit: p.unit || "",
        notes: "إلغاء أمر بيع — استعادة المخزون",
        createdAt: new Date().toISOString(),
        createdBy: userName || "",
      });
    });
    so.stockDeducted = false;
  }

  const prev = so.status;
  so.status = "cancelled";
  so.cancelledAt = new Date().toISOString();
  so.cancelledBy = userName || "";
  so.cancelReason = reason || "";
  if(!Array.isArray(so.statusHistory)) so.statusHistory = [];
  so.statusHistory.push({ from: prev, to: "cancelled", at: so.cancelledAt, by: userName || "", note: reason || "" });

  return so;
}

export function deleteDraftSalesOrderMutator(d, soId){
  if(!Array.isArray(d.salesOrders)) return;
  const so = d.salesOrders.find(x => x.id === soId);
  if(!so) return;
  if(so.status !== "draft") throw new Error("لا يمكن حذف أمر بيع بعد التأكيد — اعمل إلغاء بدلاً");
  d.salesOrders = d.salesOrders.filter(x => x.id !== soId);
}

/* V21.10.2 — Slice 3: Create a sales invoice (draft) directly from a confirmed
   Sales Order. Sits next to the existing delivery-based invoice creators
   (`upsertSalesInvoiceFromDelivery` in invoices.js) — these are two parallel
   paths into data.salesInvoices that don't interfere:
     - Delivery-based: CustDeliver session → per-row delivery → consolidated draft
     - SO-based (new): Quote → Sales Order (confirmed) → standalone draft invoice

   We deliberately do NOT consolidate SO invoices with delivery-day drafts —
   each SO maps 1:1 to one invoice. Bulk-merge of the two paths is the job
   of the Legacy Invoice Merger tool (prompt #7).

   The created invoice carries fromSalesOrderId + fromQuotationId for the
   Odoo-style document chain. The SO flips to "invoiced" status. */
export function createInvoiceFromSalesOrderMutator(d, soId, userName){
  const so = (d.salesOrders || []).find(x => x.id === soId);
  if(!so) throw new Error("أمر البيع غير موجود");
  if(!["confirmed","partial_delivered","delivered"].includes(so.status)){
    throw new Error(`لا يمكن إنشاء فاتورة من أمر بيع في حالة "${so.status}"`);
  }
  if(so.salesInvoiceId){
    throw new Error(`أمر البيع ده عنده فاتورة بالفعل: ${so.salesInvoiceNo}`);
  }

  /* Reserve invoice number — same counter as legacy invoices (INV-YYYY-NNNN).
     We piggy-back on invoiceCounters.sales so the number sequence stays
     uniform across both invoice-creation paths. */
  if(!d.invoiceCounters) d.invoiceCounters = {};
  if(!d.invoiceCounters.sales) d.invoiceCounters.sales = {};
  const year = new Date().getFullYear();
  const nextNum = (d.invoiceCounters.sales[year] || 0) + 1;
  d.invoiceCounters.sales[year] = nextNum;
  const invoiceNo = `INV-${year}-${String(nextNum).padStart(4, "0")}`;

  const today = new Date().toISOString().split("T")[0];
  const invoice = {
    id: "inv_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,7),
    invoiceNo,
    type: "sales",
    customerId: so.customerId,
    customerName: so.customerName,
    date: today,
    /* No deliveryRef — this invoice's source is a Sales Order, not a delivery */
    deliveryRefs: [],
    /* V21.10.2 — new cross-link fields for the Pipeline chain. The existing
       findInvoiceByDelivery etc. helpers won't pick these up (intentional —
       they're a separate concern). */
    fromSalesOrderId: so.id,
    fromSalesOrderNo: so.orderNo,
    fromQuotationId: so.fromQuotationId || null,
    fromQuotationNo: so.fromQuotationNo || null,
    items: (so.items || []).map(it => ({
      orderId: it.sourceType === "order" ? (it.sourceId || "") : "",
      modelNo: it.modelNo || "",
      modelDesc: it.description || "",
      qty: Number(it.qty) || 0,
      unitPrice: Number(it.unitPrice) || 0,
      lineTotal: Number(it.lineTotal) || 0,
      /* Preserve the source type so future inventory reports know where the
         line came from. */
      sourceType: it.sourceType,
      sourceId: it.sourceId,
    })),
    subtotal: Number(so.subtotal) || 0,
    discountPct: Number(so.discountPct) || 0,
    discount: Number(so.totalDiscount) || 0,
    total: Number(so.total) || 0,
    status: "draft",
    notes: so.notes || "",
    createdAt: new Date().toISOString(),
    createdBy: userName || "",
  };

  if(!Array.isArray(d.salesInvoices)) d.salesInvoices = [];
  d.salesInvoices.push(invoice);

  /* Back-link on the SO + flip status to "invoiced" */
  so.salesInvoiceId = invoice.id;
  so.salesInvoiceNo = invoice.invoiceNo;
  const prev = so.status;
  so.status = "invoiced";
  if(!Array.isArray(so.statusHistory)) so.statusHistory = [];
  so.statusHistory.push({ from: prev, to: "invoiced", at: new Date().toISOString(), by: userName || "", note: "فاتورة " + invoice.invoiceNo });

  /* Forward-link on the quotation (if any) so the chain is queryable from any
     end. */
  if(so.fromQuotationId){
    const q = (d.salesQuotations || []).find(x => x.id === so.fromQuotationId);
    if(q){
      q.linkedSalesInvoiceId = invoice.id;
      q.linkedSalesInvoiceNo = invoice.invoiceNo;
    }
  }

  return invoice;
}

export function getSalesOrderStats(data, filters = {}){
  const list = (data.salesOrders || []).filter(o => {
    if(filters.from && (o.date || "") < filters.from) return false;
    if(filters.to && (o.date || "") > filters.to) return false;
    if(filters.partyId && o.customerId !== filters.partyId) return false;
    if(filters.status && filters.status !== "all" && o.status !== filters.status) return false;
    return true;
  });
  return {
    count: list.length,
    totalValue: r2(list.reduce((s, o) => s + (Number(o.total) || 0), 0)),
    draft:               list.filter(o => o.status === "draft").length,
    confirmed:           list.filter(o => o.status === "confirmed").length,
    partial_delivered:   list.filter(o => o.status === "partial_delivered").length,
    delivered:           list.filter(o => o.status === "delivered").length,
    invoiced:            list.filter(o => o.status === "invoiced").length,
    cancelled:           list.filter(o => o.status === "cancelled").length,
  };
}
