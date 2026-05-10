/* ═══════════════════════════════════════════════════════════════
   CLARK — Shopify Invoice helpers (V19.95 Phase 3, server-side)
   ───────────────────────────────────────────────────────────────
   Builds draft sales invoices from Shopify pending orders. Mirrors
   the schema used by src/utils/invoices.js so the existing Sales
   Invoices UI can render Shopify-sourced invoices alongside regular
   ones.

   Per spec § Two-Stage Workflow Stage 2A:
     • Customer ID = shopify_default (virtual aggregate)
     • Customer info actually shown on the invoice fields
       (shopify_customer_name, _phone, _address) — keeps KASF clean
     • source = "shopify", source_ref = shopify_order_id
     • status = "draft" (user posts manually via the existing Sales
       Invoices tab — Phase 3.5+ will auto-post via journal entries)

   Invoice numbering reuses CLARK's invoiceCounters.sales counter so
   numbering stays sequential across regular + Shopify invoices.
   ═══════════════════════════════════════════════════════════════ */

const SALES_PREFIX = "INV";

function newInvId(){
  return "inv_shop_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
}

/* Reserve the next invoice number using the same counter as CLARK's
   regular invoicing (invoiceCounters.sales[year]). Returns the new
   counter object so the caller writes it back along with the invoice. */
function reserveSalesInvoiceNo(cfg){
  const counters = cfg.invoiceCounters || {};
  const sales = counters.sales || {};
  const year = new Date().getFullYear();
  const next = (sales[year] || 0) + 1;
  const updated = {
    ...counters,
    sales: { ...sales, [year]: next },
  };
  const invoiceNo = `${SALES_PREFIX}-${year}-${String(next).padStart(4, "0")}`;
  return { invoiceNo, updatedCounters: updated };
}

/* Round to 2 decimals — same as utils/format.js r2 */
function r2(n){
  return Math.round((Number(n) || 0) * 100) / 100;
}

/* Build a CLARK sales invoice object from a Shopify pending order.
   Returns { invoice, updatedCounters }. The caller appends to
   cfg.salesInvoices and replaces cfg.invoiceCounters atomically.

   Idempotency guard is at the caller level — check if an invoice
   already exists for this order_id before calling this function. */
export function buildShopifyInvoiceFromOrder(cfg, order, deliveredBy){
  const { invoiceNo, updatedCounters } = reserveSalesInvoiceNo(cfg);
  const today = (order.delivered_at || new Date().toISOString()).slice(0, 10);
  const customerId = cfg.shopifyConfig?.default_customer_id || "shopify_default";
  /* Find the default customer for the customerName field.
     Falls back to a stable label if the migration hasn't run. */
  const customers = Array.isArray(cfg.customers) ? cfg.customers : [];
  const defaultCust = customers.find(c => c.id === customerId);
  const customerName = defaultCust?.nameAr || defaultCust?.name || "Shopify Customer";

  const lineItems = Array.isArray(order.line_items) ? order.line_items : [];
  const items = lineItems.map(li => {
    const qty = Number(li.quantity) || 0;
    const unitPrice = Number(li.price) || 0;
    return {
      /* Use the Shopify order id as the orderId so the invoice item
         is traceable back. This isn't a CLARK order id — but the
         schema accepts any string. */
      orderId: String(order.shopify_order_id),
      modelNo: li.sku || "",
      modelDesc: li.title || "",
      qty,
      unitPrice,
      lineTotal: r2(unitPrice * qty),
    };
  });
  /* If shipping fee > 0, add a separate "shipping" line so the invoice
     subtotal matches the order total. The Sales Invoices UI renders
     it as a regular item — Phase 3.5 may split into a separate field. */
  const shippingFee = Number(order.shipping_fee) || 0;
  if(shippingFee > 0){
    items.push({
      orderId: String(order.shopify_order_id),
      modelNo: "SHIPPING",
      modelDesc: "رسوم الشحن (Shopify)",
      qty: 1,
      unitPrice: shippingFee,
      lineTotal: shippingFee,
    });
  }

  const subtotal = r2(items.reduce((s, it) => s + (Number(it.lineTotal) || 0), 0));
  const total = r2(Number(order.total) || subtotal); /* trust Shopify total if mismatch */
  const customer = order.customer_info || {};

  const invoice = {
    id: newInvId(),
    invoiceNo,
    type: "sales",
    customerId,
    customerName,
    date: today,
    /* No deliveryRef — Shopify doesn't go through CLARK's CustDeliver flow */
    deliveryRef: null,
    deliveryRefs: [],
    items,
    subtotal,
    discountPct: 0,
    discount: 0,
    total,
    status: "draft",
    notes: "طلب Shopify #" + (order.shopify_order_number || order.shopify_order_id),
    createdAt: new Date().toISOString(),
    createdBy: deliveredBy || "system:shopify-mark-delivered",

    /* V19.95: Shopify-specific fields per spec § Data Schema additions
       to salesInvoices. The Sales Invoices UI doesn't render these by
       default but they're available for reports + custom views. */
    source: "shopify",
    source_ref: String(order.shopify_order_id),
    shopify_order_number: order.shopify_order_number || "",
    shopify_customer_name: customer.name || "",
    shopify_customer_phone: customer.phone || "",
    shopify_customer_email: customer.email || "",
    shopify_customer_address: customer.address || {},
    shopify_payment_method: order.payment_method || "cod",
    shopify_shipping_fee: shippingFee,
  };

  return { invoice, updatedCounters };
}

/* Find an existing Shopify-sourced invoice for an order id (to avoid
   creating duplicates if the user clicks Mark Delivered twice).

   V21.9.11 ROOT-CAUSE FIX: after the V19.50 split migration, `cfg.salesInvoices`
   is stripped from factory/config (data lives in `salesInvoicesDays/{YYYY-MM-DD}`
   collection). Reading `cfg.salesInvoices` returns `undefined` → `[]` → no
   match → caller always built a fresh invoice → duplicate invoices.
   Now accepts an optional `fromList` parameter. Callers that pre-read the
   split collection via `readSplitCollection("salesInvoicesDays")` pass the
   merged list here. Backwards-compatible: if `fromList` is omitted we fall
   back to `cfg.salesInvoices` (legacy/pre-migration behavior). */
export function findInvoiceByShopifyOrderId(cfg, shopifyOrderId, fromList){
  const list = Array.isArray(fromList)
    ? fromList
    : (Array.isArray(cfg.salesInvoices) ? cfg.salesInvoices : []);
  const id = String(shopifyOrderId);
  return list.find(inv => inv.source === "shopify" && String(inv.source_ref) === id) || null;
}
