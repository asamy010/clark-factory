/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Invoices Utility (V18.49)
   ───────────────────────────────────────────────────────────────────────
   Manages sales and purchase invoices as a layer between the inventory
   movement entities (deliveries / receipts) and the accounting journal
   entries.

   ─── Data Schema ───
   data.salesInvoices = [
     {
       id, invoiceNo: "INV-2026-0001",
       type: "sales",
       customerId, customerName,
       date,
       deliveryRef: { sessionId, orderId, custId, _key },  // 1:1 link
       items: [ { orderId, modelNo, modelDesc, qty, unitPrice, lineTotal } ],
       subtotal, discountPct, discount, total,
       status: "draft" | "posted" | "void",
       postedAt?, postedBy?,
       voidedAt?, voidedBy?, voidReason?,
       notes?,
       createdAt, createdBy,
     }
   ]
   data.purchaseInvoices = [ same shape, type:"purchase", supplierId ]
   data.invoiceCounters = { sales: {2026: 42}, purchase: {2026: 13} }
   data.invoiceSettings = { autoCreateForSales: false, autoCreateForPurchase: false }
   ═══════════════════════════════════════════════════════════════════════ */

const SALES_PREFIX    = "INV";
const PURCHASE_PREFIX = "PINV";

/* Generate the next invoice number for the given type and year.
   Format: PREFIX-YYYY-NNNN (e.g. INV-2026-0042). */
export function nextInvoiceNo(data, type){
  const year = new Date().getFullYear();
  const counters = data.invoiceCounters || {};
  const typeKey = type === "purchase" ? "purchase" : "sales";
  const yearMap = counters[typeKey] || {};
  const next = (yearMap[year] || 0) + 1;
  const prefix = type === "purchase" ? PURCHASE_PREFIX : SALES_PREFIX;
  return `${prefix}-${year}-${String(next).padStart(4, "0")}`;
}

/* Reserve the next invoice number — increments the counter atomically.
   Pass into upConfig as the mutator for safety. */
export function reserveInvoiceNo(d, type){
  if(!d.invoiceCounters) d.invoiceCounters = {};
  const typeKey = type === "purchase" ? "purchase" : "sales";
  if(!d.invoiceCounters[typeKey]) d.invoiceCounters[typeKey] = {};
  const year = new Date().getFullYear();
  const next = (d.invoiceCounters[typeKey][year] || 0) + 1;
  d.invoiceCounters[typeKey][year] = next;
  const prefix = type === "purchase" ? PURCHASE_PREFIX : SALES_PREFIX;
  return `${prefix}-${year}-${String(next).padStart(4, "0")}`;
}

/* ═══ SALES INVOICES ═══ */

/* Build an invoice from a single delivery entry (customer delivery row).
   delivery: { custId, custName, qty, date, sessionId, _key, price?, ... }
   order: the order object containing this delivery
   Returns: a new salesInvoice object (NOT yet pushed to state — caller does that) */
export function buildSalesInvoiceFromDelivery(d, delivery, order, customer, userName){
  const invoiceNo = reserveInvoiceNo(d, "sales");
  const unitPrice = Number(delivery.price) || Number(order.sellPrice) || 0;
  const qty       = Number(delivery.qty) || 0;
  const lineTotal = unitPrice * qty;
  /* Apply customer-level discount if present */
  const customerDiscountPct = Number(customer?.discount) || 0;
  const discount = lineTotal * (customerDiscountPct / 100);
  const total    = lineTotal - discount;

  return {
    id: "inv_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,7),
    invoiceNo,
    type: "sales",
    customerId: customer?.id || delivery.custId,
    customerName: customer?.name || delivery.custName || "",
    date: delivery.date || new Date().toISOString().split("T")[0],
    deliveryRef: {
      sessionId: delivery.sessionId || null,
      orderId: order.id,
      custId: delivery.custId,
      _key: delivery._key || null,
    },
    items: [{
      orderId: order.id,
      modelNo: order.modelNo || "",
      modelDesc: order.modelDesc || "",
      qty,
      unitPrice,
      lineTotal,
    }],
    subtotal: lineTotal,
    discountPct: customerDiscountPct,
    discount,
    total,
    status: "draft",
    notes: "",
    createdAt: new Date().toISOString(),
    createdBy: userName || "",
  };
}

/* Build an invoice from a single purchase receipt.
   receipt: { id, supplierId, supplierName, date, items: [...], totalAmount }
   Returns: a new purchaseInvoice object (NOT yet pushed — caller does that) */
export function buildPurchaseInvoiceFromReceipt(d, receipt, supplier, userName){
  const invoiceNo = reserveInvoiceNo(d, "purchase");
  const items = (receipt.items || []).map(it => ({
    itemType: it.itemType,
    itemId:   it.itemId,
    name:     it.name || it.itemName || "",
    qty:      Number(it.qty) || 0,
    unitPrice:Number(it.unitPrice) || Number(it.price) || 0,
    lineTotal:(Number(it.qty)||0) * (Number(it.unitPrice)||Number(it.price)||0),
  }));
  const subtotal = items.reduce((s, it) => s + it.lineTotal, 0);
  const discount = Number(receipt.discount) || 0;
  const total = subtotal - discount;

  return {
    id: "pinv_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,7),
    invoiceNo,
    type: "purchase",
    supplierId: supplier?.id || receipt.supplierId,
    supplierName: supplier?.name || receipt.supplierName || "",
    date: receipt.date || new Date().toISOString().split("T")[0],
    receiptRef: { receiptId: receipt.id, receiptNo: receipt.receiptNo || receipt.id },
    items,
    subtotal,
    discountPct: subtotal > 0 ? (discount / subtotal * 100) : 0,
    discount,
    total,
    status: "draft",
    notes: receipt.notes || "",
    createdAt: new Date().toISOString(),
    createdBy: userName || "",
  };
}

/* ═══ STATUS TRANSITIONS ═══ */

/* Move a draft invoice to posted state. Pass into upConfig mutator. */
export function postInvoiceMutator(d, invoiceId, type, userName){
  const arr = type === "purchase" ? d.purchaseInvoices : d.salesInvoices;
  if(!Array.isArray(arr)) return false;
  const idx = arr.findIndex(i => i.id === invoiceId);
  if(idx < 0) return false;
  if(arr[idx].status !== "draft") return false;
  arr[idx] = {
    ...arr[idx],
    status: "posted",
    postedAt: new Date().toISOString(),
    postedBy: userName || "",
  };
  return true;
}

/* Move a posted invoice to void state. Pass into upConfig mutator. */
export function voidInvoiceMutator(d, invoiceId, type, userName, reason){
  const arr = type === "purchase" ? d.purchaseInvoices : d.salesInvoices;
  if(!Array.isArray(arr)) return false;
  const idx = arr.findIndex(i => i.id === invoiceId);
  if(idx < 0) return false;
  if(arr[idx].status !== "posted") return false;
  arr[idx] = {
    ...arr[idx],
    status: "void",
    voidedAt: new Date().toISOString(),
    voidedBy: userName || "",
    voidReason: reason || "",
  };
  return true;
}

/* Delete a draft invoice (only drafts can be deleted; posted invoices must
   be voided first). Pass into upConfig mutator. */
export function deleteDraftInvoiceMutator(d, invoiceId, type){
  const key = type === "purchase" ? "purchaseInvoices" : "salesInvoices";
  if(!Array.isArray(d[key])) return false;
  const idx = d[key].findIndex(i => i.id === invoiceId);
  if(idx < 0) return false;
  if(d[key][idx].status !== "draft") return false;
  d[key].splice(idx, 1);
  return true;
}

/* ═══ LOOKUPS ═══ */

/* Find an invoice by its delivery reference (sessionId + orderId + custId) */
export function findInvoiceByDelivery(data, sessionId, orderId, custId){
  return (data.salesInvoices || []).find(i =>
    i.deliveryRef &&
    i.deliveryRef.sessionId === sessionId &&
    i.deliveryRef.orderId === orderId &&
    i.deliveryRef.custId === custId &&
    i.status !== "void"
  ) || null;
}

/* Find a purchase invoice by its receipt reference */
export function findInvoiceByReceipt(data, receiptId){
  return (data.purchaseInvoices || []).find(i =>
    i.receiptRef && i.receiptRef.receiptId === receiptId && i.status !== "void"
  ) || null;
}

/* Aggregate stats: total counts + amounts by status, optionally filtered */
export function getInvoiceStats(data, type, filter){
  const arr = type === "purchase" ? (data.purchaseInvoices || []) : (data.salesInvoices || []);
  let list = arr;
  if(filter){
    if(filter.from) list = list.filter(i => i.date >= filter.from);
    if(filter.to)   list = list.filter(i => i.date <= filter.to);
    if(filter.partyId) list = list.filter(i =>
      type === "purchase" ? i.supplierId === filter.partyId : i.customerId === filter.partyId
    );
    if(filter.status && filter.status !== "all") list = list.filter(i => i.status === filter.status);
  }
  const stats = {
    total: list.length,
    draftCount: 0, draftAmount: 0,
    postedCount: 0, postedAmount: 0,
    voidCount: 0, voidAmount: 0,
    totalAmount: 0,
  };
  list.forEach(i => {
    const amt = Number(i.total) || 0;
    if(i.status === "draft"){ stats.draftCount++; stats.draftAmount += amt; }
    else if(i.status === "posted"){ stats.postedCount++; stats.postedAmount += amt; stats.totalAmount += amt; }
    else if(i.status === "void"){ stats.voidCount++; stats.voidAmount += amt; }
  });
  return stats;
}
