/* V19.66: import r2 for monetary rounding (was missing → float drift in totals).
   Pre-V19.66 every consolidation accumulated 0.0000000001-class rounding error
   into AR balances and reports. */
import { r2 } from "./format.js";

/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Invoices Utility (V18.65 → V19.66 hardened)
   ───────────────────────────────────────────────────────────────────────
   Manages sales and purchase invoices as a layer between the inventory
   movement entities (deliveries / receipts) and the accounting journal
   entries.

   V18.65: Same-day same-customer DRAFT invoices/credit-notes consolidate
   into a single document. Multiple deliveries/returns merge as line items
   (or bump qty if same model+price). Refs become arrays (deliveryRefs[],
   returnRefs[]) while keeping legacy singular fields for backward compat.
   Also fixes credit-note price bug (was using order.sellPrice only;
   now mirrors the actual invoice price for proper return matching).

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
  const lineTotal = r2(unitPrice * qty);/* V19.66: round to 2 decimals to avoid float drift */
  /* Apply customer-level discount if present */
  const customerDiscountPct = Number(customer?.discount) || 0;
  const discount = r2(lineTotal * (customerDiscountPct / 100));
  const total    = r2(lineTotal - discount);

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
    /* V18.65: refs as array (singular `deliveryRef` kept for backward compat) */
    deliveryRefs: [{
      sessionId: delivery.sessionId || null,
      orderId: order.id,
      custId: delivery.custId,
      _key: delivery._key || null,
    }],
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

/* V18.65: Smart upsert — consolidates same-day same-customer DRAFT invoices.
   Looks for an existing draft invoice for (customerId, date). If found,
   merges this delivery into it (bumps qty for same orderId+price, else adds
   a new line item). Otherwise creates a brand new invoice and pushes to
   d.salesInvoices. Returns { invoice, isNew } so callers can fire post-side
   effects (e.g. autoPost) only on brand-new invoices.

   Behavior is identical for autoPostOnCreate=false (the recommended setup).
   When autoPostOnCreate=true, only the FIRST delivery of the day creates
   a posted invoice; subsequent deliveries to same customer same day will
   create new posted invoices (since the first is no longer draft and
   cannot be merged into). */
export function upsertSalesInvoiceFromDelivery(d, delivery, order, customer, userName){
  if(!Array.isArray(d.salesInvoices)) d.salesInvoices = [];

  const date = delivery.date || new Date().toISOString().split("T")[0];
  const customerId = customer?.id || delivery.custId;
  const unitPrice = Number(delivery.price) || Number(order.sellPrice) || 0;
  const qty = Number(delivery.qty) || 0;
  if(qty <= 0) return { invoice: null, isNew: false };

  const customerDiscountPct = Number(customer?.discount) || 0;
  const ref = {
    sessionId: delivery.sessionId || null,
    orderId: order.id,
    custId: delivery.custId,
    _key: delivery._key || null,
  };

  /* Try to find an existing DRAFT invoice for same customer + same date */
  const existing = d.salesInvoices.find(i =>
    i.status === "draft" &&
    i.customerId === customerId &&
    i.date === date
  );

  if(existing){
    /* Merge: bump qty if same orderId+unitPrice, else add a new line item */
    if(!Array.isArray(existing.items)) existing.items = [];
    const matchedItem = existing.items.find(it =>
      it.orderId === order.id && Number(it.unitPrice) === unitPrice
    );
    if(matchedItem){
      matchedItem.qty = (Number(matchedItem.qty) || 0) + qty;
      matchedItem.lineTotal = r2(matchedItem.qty * Number(matchedItem.unitPrice));/* V19.66 */
    } else {
      existing.items.push({
        orderId: order.id,
        modelNo: order.modelNo || "",
        modelDesc: order.modelDesc || "",
        qty,
        unitPrice,
        lineTotal: r2(qty * unitPrice),/* V19.66 */
      });
    }
    /* Track this delivery in the refs array (migrate legacy singular if needed) */
    if(!Array.isArray(existing.deliveryRefs)){
      existing.deliveryRefs = existing.deliveryRef ? [existing.deliveryRef] : [];
    }
    existing.deliveryRefs.push(ref);
    /* Recompute totals — V19.66: route through r2 to prevent accumulated drift */
    existing.subtotal = r2(existing.items.reduce((s, it) => s + (Number(it.lineTotal) || 0), 0));
    existing.discountPct = customerDiscountPct;
    existing.discount = r2(existing.subtotal * (customerDiscountPct / 100));
    existing.total = r2(existing.subtotal - existing.discount);
    return { invoice: existing, isNew: false };
  }

  /* Create new draft invoice */
  const invoiceNo = reserveInvoiceNo(d, "sales");
  const lineTotal = r2(unitPrice * qty);/* V19.66 */
  const discount = r2(lineTotal * (customerDiscountPct / 100));
  const total = r2(lineTotal - discount);
  const inv = {
    id: "inv_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,7),
    invoiceNo,
    type: "sales",
    customerId,
    customerName: customer?.name || delivery.custName || "",
    date,
    deliveryRef: ref,        /* legacy compat */
    deliveryRefs: [ref],     /* V18.65 */
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
  d.salesInvoices.unshift(inv);
  return { invoice: inv, isNew: true };
}

/* Build an invoice from a single purchase receipt.
   receipt: { id, supplierId, supplierName, date, items: [...], totalAmount }
   Returns: a new purchaseInvoice object (NOT yet pushed — caller does that)

   V19.39: Kept for callers that need a fresh invoice object (e.g. tests, edge
   cases). Production callers should use upsertPurchaseInvoiceFromReceipt below
   so multiple receipts on the same day from the same supplier get merged into
   ONE draft invoice — mirroring the V18.65 behavior on the sales side. */
export function buildPurchaseInvoiceFromReceipt(d, receipt, supplier, userName){
  const invoiceNo = reserveInvoiceNo(d, "purchase");
  const items = (receipt.items || []).map(it => ({
    itemType: it.itemType,
    itemId:   it.itemId,
    name:     it.name || it.itemName || "",
    qty:      Number(it.qty) || 0,
    unitPrice:Number(it.unitPrice) || Number(it.price) || 0,
    lineTotal:r2((Number(it.qty)||0) * (Number(it.unitPrice)||Number(it.price)||0)),/* V19.66 */
  }));
  const subtotal = r2(items.reduce((s, it) => s + it.lineTotal, 0));
  const discount = r2(Number(receipt.discount) || 0);
  const total = r2(subtotal - discount);
  const ref = { receiptId: receipt.id, receiptNo: receipt.receiptNo || receipt.id };

  return {
    id: "pinv_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,7),
    invoiceNo,
    type: "purchase",
    supplierId: supplier?.id || receipt.supplierId,
    supplierName: supplier?.name || receipt.supplierName || "",
    date: receipt.date || new Date().toISOString().split("T")[0],
    receiptRef: ref,           /* legacy compat — singular */
    receiptRefs: [ref],        /* V19.39 — plural for multi-receipt invoices */
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

/* V19.39 — UPSERT variant: consolidates same-supplier same-date DRAFT invoices.
   Mirrors upsertSalesInvoiceFromDelivery semantics so the data shape and merge
   rules stay symmetrical between sales and purchases.

   Returns { invoice, isNew } so callers can do post-side effects (toast,
   audit log, etc.) only on brand-new invoices. */
export function upsertPurchaseInvoiceFromReceipt(d, receipt, supplier, userName){
  if(!Array.isArray(d.purchaseInvoices)) d.purchaseInvoices = [];

  const supplierId = supplier?.id || receipt.supplierId;
  const date = receipt.date || new Date().toISOString().split("T")[0];
  const ref = { receiptId: receipt.id, receiptNo: receipt.receiptNo || receipt.id };

  /* Try to find an existing DRAFT invoice for same supplier + same date.
     Posted/void invoices are excluded — accounting has already committed to
     them, so we never modify them retroactively. */
  const existing = d.purchaseInvoices.find(i =>
    i.status === "draft" &&
    i.supplierId === supplierId &&
    i.date === date
  );

  /* Normalize incoming items to our line shape */
  const incomingItems = (receipt.items || []).map(it => ({
    itemType: it.itemType,
    itemId:   it.itemId,
    name:     it.name || it.itemName || "",
    qty:      Number(it.qty) || 0,
    unitPrice:Number(it.unitPrice) || Number(it.price) || 0,
    lineTotal:r2((Number(it.qty)||0) * (Number(it.unitPrice)||Number(it.price)||0)),/* V19.66 */
  }));
  const incomingDiscount = r2(Number(receipt.discount) || 0);

  if(existing){
    /* Merge: bump qty if same itemType+itemId+unitPrice matches an existing line,
       else append a new line. This matches how the sales side dedupes by
       orderId+unitPrice. Items that share an item but differ in price stay
       on separate lines (price history matters for accounting). */
    if(!Array.isArray(existing.items)) existing.items = [];
    for(const inc of incomingItems){
      const matched = existing.items.find(it =>
        it.itemType === inc.itemType &&
        it.itemId === inc.itemId &&
        Number(it.unitPrice) === Number(inc.unitPrice)
      );
      if(matched){
        matched.qty = (Number(matched.qty) || 0) + inc.qty;
        matched.lineTotal = r2(matched.qty * Number(matched.unitPrice));/* V19.66 */
      } else {
        existing.items.push(inc);
      }
    }
    /* Track this receipt in the refs array (and migrate legacy singular if needed) */
    if(!Array.isArray(existing.receiptRefs)){
      existing.receiptRefs = existing.receiptRef ? [existing.receiptRef] : [];
    }
    existing.receiptRefs.push(ref);
    /* Recompute totals — V19.66: route through r2 to prevent accumulated drift */
    existing.subtotal = r2(existing.items.reduce((s, it) => s + (Number(it.lineTotal) || 0), 0));
    existing.discount = r2((Number(existing.discount) || 0) + incomingDiscount);
    existing.total = r2(existing.subtotal - existing.discount);
    existing.discountPct = existing.subtotal > 0 ? r2(existing.discount / existing.subtotal * 100) : 0;
    /* Append receipt notes if the new receipt has any */
    if(receipt.notes && receipt.notes.trim()){
      existing.notes = existing.notes
        ? existing.notes + "\n— " + receipt.notes.trim()
        : receipt.notes.trim();
    }
    return { invoice: existing, isNew: false };
  }

  /* No matching draft found — create a fresh one. */
  const invoiceNo = reserveInvoiceNo(d, "purchase");
  const subtotal = r2(incomingItems.reduce((s, it) => s + it.lineTotal, 0));/* V19.66 */
  const total = r2(subtotal - incomingDiscount);
  const inv = {
    id: "pinv_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,7),
    invoiceNo,
    type: "purchase",
    supplierId,
    supplierName: supplier?.name || receipt.supplierName || "",
    date,
    receiptRef: ref,           /* legacy compat */
    receiptRefs: [ref],        /* V19.39 */
    items: incomingItems,
    subtotal,
    discountPct: subtotal > 0 ? r2(incomingDiscount / subtotal * 100) : 0,
    discount: incomingDiscount,
    total,
    status: "draft",
    notes: receipt.notes || "",
    createdAt: new Date().toISOString(),
    createdBy: userName || "",
  };
  d.purchaseInvoices.unshift(inv);
  return { invoice: inv, isNew: true };
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

/* ═══ V18.85: SERVICE INVOICES ═══
   Direct invoices for services (shipping, maintenance, consultations, rent,
   etc.) that don't pass through inventory. No order/receipt linkage.

   Each line has: description (free text), qty, unitPrice, lineTotal,
   accountId (optional — for auto-post), accountName (display only).

   subtype: "service" — distinguishes from regular goods invoices.
   Sales: status starts "draft". Purchase: same.
   Auto-post happens when status flips to "posted" (handled by the existing
   postInvoiceMutator + autoPost.salePost / purchasePost flows).
*/
export function buildSalesServiceInvoice(d, payload, userName){
  /* payload: {date, customerId?, customerNameAdHoc?, items:[{description,qty,unitPrice,accountId,accountName}], discountPct, notes} */
  const invoiceNo = reserveInvoiceNo(d, "sales");
  const cust = payload.customerId ? (d.customers||[]).find(c => c.id === payload.customerId) : null;
  const items = (payload.items||[]).map(it => ({
    description: (it.description||"").trim(),
    qty: Number(it.qty)||1,
    unitPrice: Number(it.unitPrice)||0,
    lineTotal: (Number(it.qty)||1) * (Number(it.unitPrice)||0),
    accountId: it.accountId||"",
    accountName: it.accountName||"",
  }));
  const subtotal = items.reduce((s, it) => s + (it.lineTotal||0), 0);
  const discountPct = Number(payload.discountPct)||0;
  const discount = subtotal * (discountPct/100);
  const total = subtotal - discount;
  return {
    id: "inv_svc_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,7),
    invoiceNo,
    type: "sales",
    subtype: "service",
    customerId: payload.customerId || null,
    customerName: cust?.name || payload.customerNameAdHoc || "",
    date: payload.date || new Date().toISOString().split("T")[0],
    items,
    subtotal,
    discountPct,
    discount,
    total,
    notes: (payload.notes||"").trim(),
    status: "draft",
    createdBy: userName||"",
    createdAt: new Date().toISOString(),
  };
}

export function buildPurchaseServiceInvoice(d, payload, userName){
  /* payload: {date, supplierId?, supplierNameAdHoc?, items:[{description,qty,unitPrice,accountId,accountName}], discountPct, notes} */
  const invoiceNo = reserveInvoiceNo(d, "purchase");
  const sup = payload.supplierId ? (d.suppliers||[]).find(s => s.id === payload.supplierId) : null;
  const items = (payload.items||[]).map(it => ({
    description: (it.description||"").trim(),
    qty: Number(it.qty)||1,
    unitPrice: Number(it.unitPrice)||0,
    lineTotal: (Number(it.qty)||1) * (Number(it.unitPrice)||0),
    accountId: it.accountId||"",
    accountName: it.accountName||"",
  }));
  const subtotal = items.reduce((s, it) => s + (it.lineTotal||0), 0);
  const discountPct = Number(payload.discountPct)||0;
  const discount = subtotal * (discountPct/100);
  const total = subtotal - discount;
  return {
    id: "pinv_svc_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,7),
    invoiceNo,
    type: "purchase",
    subtype: "service",
    supplierId: payload.supplierId || null,
    supplierName: sup?.name || payload.supplierNameAdHoc || "",
    date: payload.date || new Date().toISOString().split("T")[0],
    items,
    subtotal,
    discountPct,
    discount,
    total,
    notes: (payload.notes||"").trim(),
    status: "draft",
    createdBy: userName||"",
    createdAt: new Date().toISOString(),
  };
}

/* ═══ LOOKUPS ═══ */

/* Find an invoice by its delivery reference (sessionId + orderId + custId).
   V18.65: scans deliveryRefs[] array (consolidated invoices) first, then
   falls back to legacy singular deliveryRef. */
export function findInvoiceByDelivery(data, sessionId, orderId, custId){
  return (data.salesInvoices || []).find(i => {
    if(i.status === "void") return false;
    if(Array.isArray(i.deliveryRefs) && i.deliveryRefs.length > 0){
      return i.deliveryRefs.some(r =>
        r && r.sessionId === sessionId && r.orderId === orderId && r.custId === custId
      );
    }
    return i.deliveryRef &&
      i.deliveryRef.sessionId === sessionId &&
      i.deliveryRef.orderId === orderId &&
      i.deliveryRef.custId === custId;
  }) || null;
}

/* Find a purchase invoice by its receipt reference.
   V19.39: scans receiptRefs[] (consolidated invoices) first, falls back to
   legacy singular receiptRef. */
export function findInvoiceByReceipt(data, receiptId){
  return (data.purchaseInvoices || []).find(i => {
    if(i.status === "void") return false;
    if(Array.isArray(i.receiptRefs) && i.receiptRefs.length > 0){
      return i.receiptRefs.some(r => r.receiptId === receiptId);
    }
    return i.receiptRef && i.receiptRef.receiptId === receiptId;
  }) || null;
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

/* ═══════════════════════════════════════════════════════════════════════
   V18.51 — CREDIT NOTES (مرتجع المبيعات كـentity منفصل)
   ───────────────────────────────────────────────────────────────────────
   Schema:
     data.salesCreditNotes = [{
       id, creditNoteNo: "CN-2026-0001",
       customerId, customerName, date,
       linkedInvoiceId?: string,        // الفاتورة الأصلية (اختياري)
       returnRef: { orderId, custId, _key },
       items: [...],
       subtotal, discountPct, discount, total,
       status: "draft" | "posted" | "void",
       postedAt?, postedBy?, voidedAt?, voidedBy?,
       postedJournalRef?: { date, entryId, refNo },
       notes, createdAt, createdBy,
     }]
     data.invoiceCounters.creditNotes = { 2026: N }
   ═══════════════════════════════════════════════════════════════════════ */

const CREDIT_NOTE_PREFIX = "CN";

/* Reserve next credit note number. Pass into upConfig as mutator. */
export function reserveCreditNoteNo(d){
  if(!d.invoiceCounters) d.invoiceCounters = {};
  if(!d.invoiceCounters.creditNotes) d.invoiceCounters.creditNotes = {};
  const year = new Date().getFullYear();
  const next = (d.invoiceCounters.creditNotes[year] || 0) + 1;
  d.invoiceCounters.creditNotes[year] = next;
  return `${CREDIT_NOTE_PREFIX}-${year}-${String(next).padStart(4, "0")}`;
}

/* V18.65: Resolve the unit price for a customer return.
   Priority order to mirror the actual sale price (fixes V18.51 bug where
   credit notes always used order.sellPrice, ignoring quick-sale custom
   prices):
     1) Same-day non-void invoice for this customer with this orderId.
     2) Most recent non-void invoice for this customer with this orderId.
     3) order.sellPrice fallback. */
function resolveReturnUnitPrice(d, customerId, orderId, date){
  const invs = d.salesInvoices || [];
  const sameDay = invs.find(i =>
    i.customerId === customerId && i.date === date && i.status !== "void" &&
    Array.isArray(i.items) && i.items.some(it => it.orderId === orderId)
  );
  if(sameDay){
    const m = sameDay.items.find(it => it.orderId === orderId);
    if(m && Number(m.unitPrice) > 0) return Number(m.unitPrice);
  }
  const candidates = invs.filter(i =>
    i.customerId === customerId && i.status !== "void" &&
    Array.isArray(i.items) && i.items.some(it => it.orderId === orderId)
  ).sort((a,b) => (b.date||"").localeCompare(a.date||""));
  if(candidates.length > 0){
    const m = candidates[0].items.find(it => it.orderId === orderId);
    if(m && Number(m.unitPrice) > 0) return Number(m.unitPrice);
  }
  return 0;
}

/* Build a credit note from a customer return entry.
   Mirrors buildSalesInvoiceFromDelivery but for returns. */
export function buildCreditNoteFromReturn(d, returnEntry, order, customer, userName){
  const creditNoteNo = reserveCreditNoteNo(d);
  const date = returnEntry.date || new Date().toISOString().split("T")[0];
  const customerId = customer?.id || returnEntry.custId;
  /* V18.65: use actual invoice price (fixes price-mismatch bug) */
  const resolvedPrice = resolveReturnUnitPrice(d, customerId, order.id, date);
  const unitPrice = resolvedPrice > 0 ? resolvedPrice : (Number(order.sellPrice) || 0);
  const qty       = Number(returnEntry.qty) || 0;
  /* V21.9.52 ROOT-CAUSE FIX: wrap all credit-note arithmetic in r2() to match
     the V19.66 hardening that was applied to sales invoices but never
     backported here. Pre-V21.9.52 the credit-note total would drift
     ±0.05 EGP per return, accumulating to ±60 EGP/year of unexplained
     balance drift in the customer ledger. */
  const lineTotal = r2(unitPrice * qty);
  const customerDiscountPct = Number(customer?.discount) || 0;
  const discount = r2(lineTotal * (customerDiscountPct / 100));
  const total    = r2(lineTotal - discount);

  /* Try to find the original invoice this return relates to.
     V21.9.52: also check deliveryRefs[] (the V18.65 plural form), since
     consolidated invoices have NO singular deliveryRef. Pre-V21.9.52 the
     linkedInvoiceId stayed null for any consolidated parent, breaking
     the audit trail from return → invoice. */
  const linkedInv = (d.salesInvoices||[]).find(i => {
    if(i.status === "void") return false;
    /* Legacy singular */
    if(i.deliveryRef
       && i.deliveryRef.orderId === order.id
       && i.deliveryRef.custId === returnEntry.custId) return true;
    /* V18.65 plural — also check */
    if(Array.isArray(i.deliveryRefs) && i.deliveryRefs.some(r =>
      r && r.orderId === order.id && r.custId === returnEntry.custId
    )) return true;
    return false;
  });

  const ref = {
    orderId: order.id,
    custId: returnEntry.custId,
    _key: returnEntry._key || null,
  };

  return {
    id: "cn_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,7),
    creditNoteNo,
    customerId,
    customerName: customer?.name || returnEntry.custName || "",
    date,
    linkedInvoiceId: linkedInv ? linkedInv.id : null,
    linkedInvoiceNo: linkedInv ? linkedInv.invoiceNo : null,
    returnRef: ref,            /* legacy compat */
    returnRefs: [ref],         /* V18.65 */
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
    notes: returnEntry.note || "",
    createdAt: new Date().toISOString(),
    createdBy: userName || "",
  };
}

/* V18.65: Smart upsert — consolidates same-day same-customer DRAFT credit
   notes. Mirrors upsertSalesInvoiceFromDelivery semantics. Returns
   { creditNote, isNew }. */
export function upsertCreditNoteFromReturn(d, returnEntry, order, customer, userName){
  if(!Array.isArray(d.salesCreditNotes)) d.salesCreditNotes = [];

  const date = returnEntry.date || new Date().toISOString().split("T")[0];
  const customerId = customer?.id || returnEntry.custId;
  const qty = Number(returnEntry.qty) || 0;
  if(qty <= 0) return { creditNote: null, isNew: false };

  /* V18.65: use actual invoice price */
  const resolvedPrice = resolveReturnUnitPrice(d, customerId, order.id, date);
  const unitPrice = resolvedPrice > 0 ? resolvedPrice : (Number(order.sellPrice) || 0);
  const customerDiscountPct = Number(customer?.discount) || 0;
  const ref = {
    orderId: order.id,
    custId: returnEntry.custId,
    _key: returnEntry._key || null,
  };

  /* Try to find an existing DRAFT credit note for same customer + same date */
  const existing = d.salesCreditNotes.find(c =>
    c.status === "draft" &&
    c.customerId === customerId &&
    c.date === date
  );

  if(existing){
    if(!Array.isArray(existing.items)) existing.items = [];
    const matchedItem = existing.items.find(it =>
      it.orderId === order.id && Number(it.unitPrice) === unitPrice
    );
    if(matchedItem){
      matchedItem.qty = (Number(matchedItem.qty) || 0) + qty;
      /* V21.9.52: r2() wrap on line total — drift fix (matches V19.66 sales-invoice pattern) */
      matchedItem.lineTotal = r2(matchedItem.qty * Number(matchedItem.unitPrice));
    } else {
      existing.items.push({
        orderId: order.id,
        modelNo: order.modelNo || "",
        modelDesc: order.modelDesc || "",
        qty,
        unitPrice,
        lineTotal: r2(qty * unitPrice),/* V21.9.52 */
      });
    }
    if(!Array.isArray(existing.returnRefs)){
      existing.returnRefs = existing.returnRef ? [existing.returnRef] : [];
    }
    existing.returnRefs.push(ref);
    /* Recompute totals — V21.9.52: route through r2 to prevent accumulated drift */
    existing.subtotal = r2(existing.items.reduce((s, it) => s + (Number(it.lineTotal) || 0), 0));
    existing.discountPct = customerDiscountPct;
    existing.discount = r2(existing.subtotal * (customerDiscountPct / 100));
    existing.total = r2(existing.subtotal - existing.discount);
    return { creditNote: existing, isNew: false };
  }

  /* Create new draft credit note */
  const creditNoteNo = reserveCreditNoteNo(d);
  const lineTotal = r2(unitPrice * qty);/* V21.9.52 */
  const discount = r2(lineTotal * (customerDiscountPct / 100));/* V21.9.52 */
  const total = r2(lineTotal - discount);/* V21.9.52 */
  /* Try to find the original invoice this return relates to */
  const linkedInv = (d.salesInvoices||[]).find(i =>
    i.customerId === customerId && i.status !== "void" &&
    Array.isArray(i.items) && i.items.some(it => it.orderId === order.id)
  );

  const cn = {
    id: "cn_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,7),
    creditNoteNo,
    customerId,
    customerName: customer?.name || returnEntry.custName || "",
    date,
    linkedInvoiceId: linkedInv ? linkedInv.id : null,
    linkedInvoiceNo: linkedInv ? linkedInv.invoiceNo : null,
    returnRef: ref,            /* legacy compat */
    returnRefs: [ref],         /* V18.65 */
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
  d.salesCreditNotes.unshift(cn);
  return { creditNote: cn, isNew: true };
}

/* Status transition mutators for credit notes */
export function postCreditNoteMutator(d, creditNoteId, userName){
  if(!Array.isArray(d.salesCreditNotes)) return false;
  const idx = d.salesCreditNotes.findIndex(c => c.id === creditNoteId);
  if(idx < 0) return false;
  if(d.salesCreditNotes[idx].status !== "draft") return false;
  d.salesCreditNotes[idx] = {
    ...d.salesCreditNotes[idx],
    status: "posted",
    postedAt: new Date().toISOString(),
    postedBy: userName || "",
  };
  return true;
}

export function voidCreditNoteMutator(d, creditNoteId, userName, reason){
  if(!Array.isArray(d.salesCreditNotes)) return false;
  const idx = d.salesCreditNotes.findIndex(c => c.id === creditNoteId);
  if(idx < 0) return false;
  if(d.salesCreditNotes[idx].status !== "posted") return false;
  d.salesCreditNotes[idx] = {
    ...d.salesCreditNotes[idx],
    status: "void",
    voidedAt: new Date().toISOString(),
    voidedBy: userName || "",
    voidReason: reason || "",
  };
  return true;
}

export function deleteDraftCreditNoteMutator(d, creditNoteId){
  if(!Array.isArray(d.salesCreditNotes)) return false;
  const idx = d.salesCreditNotes.findIndex(c => c.id === creditNoteId);
  if(idx < 0) return false;
  if(d.salesCreditNotes[idx].status !== "draft") return false;
  d.salesCreditNotes.splice(idx, 1);
  return true;
}

/* Find credit note by return reference.
   V18.65: scans returnRefs[] array (consolidated CNs) first, then falls
   back to legacy singular returnRef. */
export function findCreditNoteByReturn(data, orderId, custId, key){
  return (data.salesCreditNotes || []).find(c => {
    if(c.status === "void") return false;
    if(Array.isArray(c.returnRefs) && c.returnRefs.length > 0){
      return c.returnRefs.some(r =>
        r && r.orderId === orderId && r.custId === custId && (!key || r._key === key)
      );
    }
    return c.returnRef &&
      c.returnRef.orderId === orderId &&
      c.returnRef.custId === custId &&
      (!key || c.returnRef._key === key);
  }) || null;
}

/* Stats for credit notes (similar to getInvoiceStats) */
export function getCreditNoteStats(data, filter){
  const arr = data.salesCreditNotes || [];
  let list = arr;
  if(filter){
    if(filter.from) list = list.filter(c => c.date >= filter.from);
    if(filter.to)   list = list.filter(c => c.date <= filter.to);
    if(filter.partyId) list = list.filter(c => c.customerId === filter.partyId);
    if(filter.status && filter.status !== "all") list = list.filter(c => c.status === filter.status);
  }
  const stats = {
    total: list.length,
    draftCount: 0, draftAmount: 0,
    postedCount: 0, postedAmount: 0,
    voidCount: 0, voidAmount: 0,
    totalAmount: 0,
  };
  list.forEach(c => {
    const amt = Number(c.total) || 0;
    if(c.status === "draft"){ stats.draftCount++; stats.draftAmount += amt; }
    else if(c.status === "posted"){ stats.postedCount++; stats.postedAmount += amt; stats.totalAmount += amt; }
    else if(c.status === "void"){ stats.voidCount++; stats.voidAmount += amt; }
  });
  return stats;
}

/* ═══════════════════════════════════════════════════════════════════════
   V19.40 — DEBIT NOTES (مرتجع المشتريات كـentity منفصل)
   ───────────────────────────────────────────────────────────────────────
   Symmetric to V18.51 credit notes (sales returns) but for the purchase side:
   instead of returning goods to a customer (credit note → reduces revenue),
   we're returning goods to a supplier (debit note → reduces what we owe them).

   Schema:
     data.purchaseDebitNotes = [{
       id, debitNoteNo: "DN-2026-0001",
       supplierId, supplierName, date,
       linkedInvoiceId?, linkedInvoiceNo?,   // the original purchase invoice (optional)
       items: [{itemType, itemId, name, qty, unitPrice, lineTotal}],
       subtotal, discountPct, discount, total,
       status: "draft" | "posted" | "void",
       postedAt?, postedBy?, voidedAt?, voidedBy?,
       postedJournalRef?: { date, entryId, refNo },
       notes, createdAt, createdBy,
     }]
     data.invoiceCounters.debitNotes = { 2026: N }

   The posting rule "purchaseReturn" generates:
     Dr موردون خامات (2110)        <total>     ← reduces our payable
       Cr مرتجع المشتريات (5140)   <total>     ← contra-expense
   ═══════════════════════════════════════════════════════════════════════ */

const DEBIT_NOTE_PREFIX = "DN";

/* Reserve next debit note number. Pass into upConfig as mutator. */
export function reserveDebitNoteNo(d){
  if(!d.invoiceCounters) d.invoiceCounters = {};
  if(!d.invoiceCounters.debitNotes) d.invoiceCounters.debitNotes = {};
  const year = new Date().getFullYear();
  const next = (d.invoiceCounters.debitNotes[year] || 0) + 1;
  d.invoiceCounters.debitNotes[year] = next;
  return `${DEBIT_NOTE_PREFIX}-${year}-${String(next).padStart(4, "0")}`;
}

/* Resolve unit price for a purchase return — mirrors resolveReturnUnitPrice
   on the sales side. We try to use the price the supplier actually charged
   on the original invoice (rather than current item.price which may have
   drifted), so the debit note credits the supplier exactly the right amount. */
function resolvePurchaseReturnUnitPrice(d, supplierId, itemType, itemId, date){
  const invs = d.purchaseInvoices || [];
  /* Same-day exact match wins */
  const sameDay = invs.find(i =>
    i.supplierId === supplierId && i.date === date && i.status !== "void" &&
    Array.isArray(i.items) && i.items.some(it => it.itemType === itemType && it.itemId === itemId)
  );
  if(sameDay){
    const m = sameDay.items.find(it => it.itemType === itemType && it.itemId === itemId);
    if(m && Number(m.unitPrice) > 0) return Number(m.unitPrice);
  }
  /* Otherwise most-recent non-void invoice */
  const candidates = invs.filter(i =>
    i.supplierId === supplierId && i.status !== "void" &&
    Array.isArray(i.items) && i.items.some(it => it.itemType === itemType && it.itemId === itemId)
  ).sort((a,b) => (b.date||"").localeCompare(a.date||""));
  if(candidates.length > 0){
    const m = candidates[0].items.find(it => it.itemType === itemType && it.itemId === itemId);
    if(m && Number(m.unitPrice) > 0) return Number(m.unitPrice);
  }
  return 0;
}

/* Build a debit note from a single return entry.
   returnEntry: { supplierId, date, items: [{itemType, itemId, name, qty, unitPrice?}], notes?, linkedInvoiceId? }
   Returns the new debit-note object (NOT yet pushed). */
export function buildDebitNoteFromReturn(d, returnEntry, supplier, userName){
  const debitNoteNo = reserveDebitNoteNo(d);
  const supplierId = supplier?.id || returnEntry.supplierId;
  const date = returnEntry.date || new Date().toISOString().split("T")[0];

  /* Normalize items: resolve missing prices from invoice history */
  const items = (returnEntry.items || []).map(it => {
    const provided = Number(it.unitPrice) || 0;
    const resolved = provided > 0 ? provided : resolvePurchaseReturnUnitPrice(d, supplierId, it.itemType, it.itemId, date);
    const qty = Number(it.qty) || 0;
    return {
      itemType: it.itemType,
      itemId: it.itemId,
      name: it.name || it.itemName || "",
      qty,
      unitPrice: resolved,
      lineTotal: qty * resolved,
    };
  });
  const subtotal = items.reduce((s, it) => s + (Number(it.lineTotal) || 0), 0);
  const discount = Number(returnEntry.discount) || 0;
  const total = subtotal - discount;

  /* Try to find the original invoice this return relates to */
  const linkedInv = returnEntry.linkedInvoiceId
    ? (d.purchaseInvoices||[]).find(i => i.id === returnEntry.linkedInvoiceId && i.status !== "void")
    : (d.purchaseInvoices||[]).find(i =>
        i.supplierId === supplierId && i.status !== "void" &&
        Array.isArray(i.items) && i.items.some(invIt =>
          items.some(retIt => retIt.itemType === invIt.itemType && retIt.itemId === invIt.itemId))
      );

  return {
    id: "dn_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,7),
    debitNoteNo,
    supplierId,
    supplierName: supplier?.name || returnEntry.supplierName || "",
    date,
    linkedInvoiceId: linkedInv ? linkedInv.id : null,
    linkedInvoiceNo: linkedInv ? linkedInv.invoiceNo : null,
    items,
    subtotal,
    discountPct: subtotal > 0 ? (discount / subtotal * 100) : 0,
    discount,
    total,
    status: "draft",
    notes: returnEntry.notes || "",
    createdAt: new Date().toISOString(),
    createdBy: userName || "",
  };
}

/* V19.40 — Smart upsert: consolidates same-day same-supplier DRAFT debit notes.
   Mirrors upsertCreditNoteFromReturn semantics. Returns { debitNote, isNew }. */
export function upsertDebitNoteFromReturn(d, returnEntry, supplier, userName){
  if(!Array.isArray(d.purchaseDebitNotes)) d.purchaseDebitNotes = [];

  const supplierId = supplier?.id || returnEntry.supplierId;
  const date = returnEntry.date || new Date().toISOString().split("T")[0];

  /* Normalize incoming items to canonical line shape */
  const incomingItems = (returnEntry.items || []).map(it => {
    const provided = Number(it.unitPrice) || 0;
    const resolved = provided > 0 ? provided : resolvePurchaseReturnUnitPrice(d, supplierId, it.itemType, it.itemId, date);
    const qty = Number(it.qty) || 0;
    return {
      itemType: it.itemType,
      itemId: it.itemId,
      name: it.name || it.itemName || "",
      qty,
      unitPrice: resolved,
      lineTotal: qty * resolved,
    };
  }).filter(it => it.qty > 0);

  if(incomingItems.length === 0) return { debitNote: null, isNew: false };

  const incomingDiscount = Number(returnEntry.discount) || 0;

  /* Look for an existing DRAFT debit note for the same supplier+date.
     Posted/void debit notes are excluded — accounting has committed to them. */
  const existing = d.purchaseDebitNotes.find(dn =>
    dn.status === "draft" &&
    dn.supplierId === supplierId &&
    dn.date === date
  );

  if(existing){
    if(!Array.isArray(existing.items)) existing.items = [];
    /* Merge by itemType+itemId+unitPrice — same as purchase invoice upsert.
       Returns at different prices stay on separate lines because each
       price line ties back to a different historical purchase. */
    for(const inc of incomingItems){
      const matched = existing.items.find(it =>
        it.itemType === inc.itemType &&
        it.itemId === inc.itemId &&
        Number(it.unitPrice) === Number(inc.unitPrice)
      );
      if(matched){
        matched.qty = (Number(matched.qty) || 0) + inc.qty;
        /* V21.9.52: r2() to prevent debit-note drift (matches purchase-invoice V19.66 pattern) */
        matched.lineTotal = r2(matched.qty * Number(matched.unitPrice));
      } else {
        existing.items.push(inc);
      }
    }
    /* Recompute totals — V21.9.52: route through r2 to prevent accumulated drift.
       Mirrors the credit-note fix in upsertCreditNoteFromReturn above. */
    existing.subtotal = r2(existing.items.reduce((s, it) => s + (Number(it.lineTotal) || 0), 0));
    existing.discount = r2((Number(existing.discount) || 0) + incomingDiscount);
    existing.total = r2(existing.subtotal - existing.discount);
    existing.discountPct = existing.subtotal > 0 ? r2(existing.discount / existing.subtotal * 100) : 0;
    if(returnEntry.notes && returnEntry.notes.trim()){
      existing.notes = existing.notes
        ? existing.notes + "\n— " + returnEntry.notes.trim()
        : returnEntry.notes.trim();
    }
    return { debitNote: existing, isNew: false };
  }

  /* New draft */
  const debitNoteNo = reserveDebitNoteNo(d);
  const subtotal = r2(incomingItems.reduce((s, it) => s + it.lineTotal, 0));/* V21.9.52 */
  const total = r2(subtotal - incomingDiscount);/* V21.9.52 */

  const linkedInv = returnEntry.linkedInvoiceId
    ? (d.purchaseInvoices||[]).find(i => i.id === returnEntry.linkedInvoiceId && i.status !== "void")
    : (d.purchaseInvoices||[]).find(i =>
        i.supplierId === supplierId && i.status !== "void" &&
        Array.isArray(i.items) && i.items.some(invIt =>
          incomingItems.some(retIt => retIt.itemType === invIt.itemType && retIt.itemId === invIt.itemId))
      );

  const dn = {
    id: "dn_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,7),
    debitNoteNo,
    supplierId,
    supplierName: supplier?.name || returnEntry.supplierName || "",
    date,
    linkedInvoiceId: linkedInv ? linkedInv.id : null,
    linkedInvoiceNo: linkedInv ? linkedInv.invoiceNo : null,
    items: incomingItems,
    subtotal,
    discountPct: subtotal > 0 ? (incomingDiscount / subtotal * 100) : 0,
    discount: incomingDiscount,
    total,
    status: "draft",
    notes: returnEntry.notes || "",
    createdAt: new Date().toISOString(),
    createdBy: userName || "",
  };
  d.purchaseDebitNotes.unshift(dn);
  return { debitNote: dn, isNew: true };
}

/* Status transitions — mirror creditNote mutators. */
export function postDebitNoteMutator(d, debitNoteId, userName){
  if(!Array.isArray(d.purchaseDebitNotes)) return false;
  const idx = d.purchaseDebitNotes.findIndex(dn => dn.id === debitNoteId);
  if(idx < 0) return false;
  if(d.purchaseDebitNotes[idx].status !== "draft") return false;
  d.purchaseDebitNotes[idx] = {
    ...d.purchaseDebitNotes[idx],
    status: "posted",
    postedAt: new Date().toISOString(),
    postedBy: userName || "",
  };
  return true;
}

export function voidDebitNoteMutator(d, debitNoteId, userName, reason){
  if(!Array.isArray(d.purchaseDebitNotes)) return false;
  const idx = d.purchaseDebitNotes.findIndex(dn => dn.id === debitNoteId);
  if(idx < 0) return false;
  if(d.purchaseDebitNotes[idx].status !== "posted") return false;
  d.purchaseDebitNotes[idx] = {
    ...d.purchaseDebitNotes[idx],
    status: "void",
    voidedAt: new Date().toISOString(),
    voidedBy: userName || "",
    voidReason: reason || "",
  };
  return true;
}

export function deleteDraftDebitNoteMutator(d, debitNoteId){
  if(!Array.isArray(d.purchaseDebitNotes)) return false;
  const idx = d.purchaseDebitNotes.findIndex(dn => dn.id === debitNoteId);
  if(idx < 0) return false;
  if(d.purchaseDebitNotes[idx].status !== "draft") return false;
  d.purchaseDebitNotes.splice(idx, 1);
  return true;
}

/* Stats — mirrors getCreditNoteStats. */
export function getDebitNoteStats(data, filter){
  const arr = data.purchaseDebitNotes || [];
  let list = arr;
  if(filter){
    if(filter.from) list = list.filter(dn => dn.date >= filter.from);
    if(filter.to)   list = list.filter(dn => dn.date <= filter.to);
    if(filter.partyId) list = list.filter(dn => dn.supplierId === filter.partyId);
    if(filter.status && filter.status !== "all") list = list.filter(dn => dn.status === filter.status);
  }
  const stats = {
    total: list.length,
    draftCount: 0, draftAmount: 0,
    postedCount: 0, postedAmount: 0,
    voidCount: 0, voidAmount: 0,
    totalAmount: 0,
  };
  list.forEach(dn => {
    const amt = Number(dn.total) || 0;
    if(dn.status === "draft"){ stats.draftCount++; stats.draftAmount += amt; }
    else if(dn.status === "posted"){ stats.postedCount++; stats.postedAmount += amt; stats.totalAmount += amt; }
    else if(dn.status === "void"){ stats.voidCount++; stats.voidAmount += amt; }
  });
  return stats;
}
