/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Invoices Utility (V18.65)
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
      matchedItem.lineTotal = matchedItem.qty * Number(matchedItem.unitPrice);
    } else {
      existing.items.push({
        orderId: order.id,
        modelNo: order.modelNo || "",
        modelDesc: order.modelDesc || "",
        qty,
        unitPrice,
        lineTotal: qty * unitPrice,
      });
    }
    /* Track this delivery in the refs array (migrate legacy singular if needed) */
    if(!Array.isArray(existing.deliveryRefs)){
      existing.deliveryRefs = existing.deliveryRef ? [existing.deliveryRef] : [];
    }
    existing.deliveryRefs.push(ref);
    /* Recompute totals */
    existing.subtotal = existing.items.reduce((s, it) => s + (Number(it.lineTotal) || 0), 0);
    existing.discountPct = customerDiscountPct;
    existing.discount = existing.subtotal * (customerDiscountPct / 100);
    existing.total = existing.subtotal - existing.discount;
    return { invoice: existing, isNew: false };
  }

  /* Create new draft invoice */
  const invoiceNo = reserveInvoiceNo(d, "sales");
  const lineTotal = unitPrice * qty;
  const discount = lineTotal * (customerDiscountPct / 100);
  const total = lineTotal - discount;
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
  const lineTotal = unitPrice * qty;
  const customerDiscountPct = Number(customer?.discount) || 0;
  const discount = lineTotal * (customerDiscountPct / 100);
  const total    = lineTotal - discount;

  /* Try to find the original invoice this return relates to */
  const linkedInv = (d.salesInvoices||[]).find(i =>
    i.deliveryRef &&
    i.deliveryRef.orderId === order.id &&
    i.deliveryRef.custId === returnEntry.custId &&
    i.status !== "void"
  );

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
      matchedItem.lineTotal = matchedItem.qty * Number(matchedItem.unitPrice);
    } else {
      existing.items.push({
        orderId: order.id,
        modelNo: order.modelNo || "",
        modelDesc: order.modelDesc || "",
        qty,
        unitPrice,
        lineTotal: qty * unitPrice,
      });
    }
    if(!Array.isArray(existing.returnRefs)){
      existing.returnRefs = existing.returnRef ? [existing.returnRef] : [];
    }
    existing.returnRefs.push(ref);
    /* Recompute totals */
    existing.subtotal = existing.items.reduce((s, it) => s + (Number(it.lineTotal) || 0), 0);
    existing.discountPct = customerDiscountPct;
    existing.discount = existing.subtotal * (customerDiscountPct / 100);
    existing.total = existing.subtotal - existing.discount;
    return { creditNote: existing, isNew: false };
  }

  /* Create new draft credit note */
  const creditNoteNo = reserveCreditNoteNo(d);
  const lineTotal = unitPrice * qty;
  const discount = lineTotal * (customerDiscountPct / 100);
  const total = lineTotal - discount;
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
