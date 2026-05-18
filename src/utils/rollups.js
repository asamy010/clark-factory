/* ════════════════════════════════════════════════════════════════════════
   CLARK V19.58 — Aggregation/Rollup engine for reports
   ════════════════════════════════════════════════════════════════════════

   Why this exists:
   Pages like DashPg, RepPg, AccountingPg, AuditPg recompute the same totals
   from the same arrays every render. With 5000+ invoices + 10000 payments
   + 30000 treasury entries, this is ~5s of pure JS (visible jank). Each
   page also rolls up the same data slightly differently, leading to
   discrepancies between "Total revenue this month" on the dashboard vs the
   reports tab.

   This module gives pages a single, pure-function rollup API:
     - computeFinancialRollup(data, {from, to}) → totals + per-customer + per-supplier
     - computeMonthlyRollup(data, "YYYY-MM") → for one month
     - computeCustomerStatement(data, custId) → per-customer ledger
     - computeSupplierStatement(data, supplierId) → per-supplier ledger

   These functions are PURE — no side effects, no Firestore reads. The data
   is already in memory (loaded by App.jsx listeners). Pages wrap calls in
   useMemo so the result is cached until inputs change.

   ─── Why not server-side rollups? ───
   - The data is already on the client (real-time listeners).
   - Pure JS reductions on 50k records = ~50-200ms (acceptable for reports).
   - No Cloud Function cost / cold-start latency.
   - When we DO outgrow client-side (>500k records), we'll add a Firestore
     `rollups/{period}` cache. For now, pure functions are simpler + fast.

   ─── Conventions ───
   - All inputs read from `data` (the merged useMemo from App.jsx).
   - Optional `{from, to}` filter — strings "YYYY-MM-DD". Defaults: all-time.
   - All money returned as numbers (caller formats).
   - All counts are integers.
   - "ar" property on each rollup = Arabic label for UI display.

   ════════════════════════════════════════════════════════════════════════ */

/* ─── helpers ────────────────────────────────────────────────────────── */

function r2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/* Date is in [from, to] inclusive. Empty filter passes through. */
function inDateRange(date, from, to) {
  if (!date) return !from && !to;
  const d = String(date).slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

/* Map customers/suppliers/employees by id for fast lookup. */
function indexById(arr) {
  const m = new Map();
  for (const x of arr || []) {
    if (x && (x.id || x.id === 0)) m.set(String(x.id), x);
  }
  return m;
}

/* ─── financial rollup — sales/purchases/payments grouped by entity ─── */

/**
 * Comprehensive financial rollup over a date range.
 * Returns totals plus per-customer and per-supplier breakdowns.
 *
 * @param {object} data    Merged data (config useMemo result)
 * @param {object} filter  { from?: "YYYY-MM-DD", to?: "YYYY-MM-DD" }
 * @returns {object} See JSDoc inside.
 */
export function computeFinancialRollup(data, filter = {}) {
  const { from, to } = filter;
  const invoices  = (data?.salesInvoices || []).filter(i => inDateRange(i.date, from, to));
  const purchases = (data?.purchaseInvoices || []).filter(i => inDateRange(i.date, from, to));
  const custPay   = (data?.custPayments || []).filter(p => inDateRange(p.date, from, to));
  const supPay    = (data?.supplierPayments || []).filter(p => inDateRange(p.date, from, to));
  const wsPay     = (data?.wsPayments || []).filter(p => inDateRange(p.date, from, to));
  const treasury  = (data?.treasury || []).filter(t => inDateRange(t.date, from, to));

  /* posted-only for revenue/expense headlines (drafts/voids excluded) */
  const postedSales    = invoices.filter(i => i.status === "posted");
  const postedPurchase = purchases.filter(i => i.status === "posted");

  /* totals (numbers — caller formats) */
  const totalSales       = r2(postedSales.reduce((s, i) => s + (Number(i.total) || 0), 0));
  const totalPurchases   = r2(postedPurchase.reduce((s, i) => s + (Number(i.total) || 0), 0));
  const totalCustPay     = r2(custPay.reduce((s, p) => s + (Number(p.amount) || 0), 0));
  const totalSupPay      = r2(supPay.reduce((s, p) => s + (Number(p.amount) || 0), 0));
  const totalWsPay       = r2(wsPay.filter(p => p.type === "payment").reduce((s, p) => s + (Number(p.amount) || 0), 0));
  const totalWsPurchase  = r2(wsPay.filter(p => p.type === "purchase").reduce((s, p) => s + (Number(p.amount) || 0), 0));
  const treasuryIn       = r2(treasury.filter(t => t.type === "in").reduce((s, t) => s + (Number(t.amount) || 0), 0));
  const treasuryOut      = r2(treasury.filter(t => t.type === "out").reduce((s, t) => s + (Number(t.amount) || 0), 0));

  /* per-customer */
  const custMap = indexById(data?.customers);
  const perCustomer = new Map();
  const ensureCust = (id) => {
    const k = String(id);
    if (!perCustomer.has(k)) {
      const c = custMap.get(k);
      perCustomer.set(k, {
        custId: k,
        name: c?.name || "غير معروف",
        salesTotal: 0, paymentsTotal: 0, invoiceCount: 0, paymentCount: 0,
      });
    }
    return perCustomer.get(k);
  };
  for (const inv of postedSales) {
    if (!inv.customerId && inv.customerId !== 0) continue;
    const e = ensureCust(inv.customerId);
    e.salesTotal += Number(inv.total) || 0;
    e.invoiceCount++;
  }
  for (const pay of custPay) {
    if (!pay.custId && pay.custId !== 0) continue;
    const e = ensureCust(pay.custId);
    e.paymentsTotal += Number(pay.amount) || 0;
    e.paymentCount++;
  }
  /* round + balance */
  const customers = Array.from(perCustomer.values()).map(e => ({
    ...e,
    salesTotal: r2(e.salesTotal),
    paymentsTotal: r2(e.paymentsTotal),
    balance: r2(e.salesTotal - e.paymentsTotal),
  })).sort((a, b) => b.salesTotal - a.salesTotal);

  /* per-supplier */
  const supMap = indexById(data?.suppliers);
  const perSupplier = new Map();
  const ensureSup = (id) => {
    const k = String(id);
    if (!perSupplier.has(k)) {
      const s = supMap.get(k);
      perSupplier.set(k, {
        supplierId: k,
        name: s?.name || "غير معروف",
        purchaseTotal: 0, paymentsTotal: 0, invoiceCount: 0, paymentCount: 0,
      });
    }
    return perSupplier.get(k);
  };
  for (const inv of postedPurchase) {
    if (!inv.supplierId && inv.supplierId !== 0) continue;
    const e = ensureSup(inv.supplierId);
    e.purchaseTotal += Number(inv.total) || 0;
    e.invoiceCount++;
  }
  for (const pay of supPay) {
    if (!pay.supplierId && pay.supplierId !== 0) continue;
    const e = ensureSup(pay.supplierId);
    e.paymentsTotal += Number(pay.amount) || 0;
    e.paymentCount++;
  }
  const suppliers = Array.from(perSupplier.values()).map(e => ({
    ...e,
    purchaseTotal: r2(e.purchaseTotal),
    paymentsTotal: r2(e.paymentsTotal),
    balance: r2(e.purchaseTotal - e.paymentsTotal),
  })).sort((a, b) => b.purchaseTotal - a.purchaseTotal);

  return {
    period: { from: from || null, to: to || null },
    totals: {
      sales: totalSales,
      purchases: totalPurchases,
      grossProfit: r2(totalSales - totalPurchases),
      custPayments: totalCustPay,
      supplierPayments: totalSupPay,
      wsPayments: totalWsPay,
      wsPurchases: totalWsPurchase,
      treasuryIn,
      treasuryOut,
      treasuryNet: r2(treasuryIn - treasuryOut),
      receivables: r2(totalSales - totalCustPay), /* what customers owe us */
      payables: r2(totalPurchases - totalSupPay),  /* what we owe suppliers */
    },
    counts: {
      invoiceCount: postedSales.length,
      purchaseInvoiceCount: postedPurchase.length,
      custPaymentCount: custPay.length,
      supPaymentCount: supPay.length,
      wsPaymentCount: wsPay.length,
      treasuryEntryCount: treasury.length,
    },
    customers,
    suppliers,
  };
}

/* ─── monthly rollup (convenience wrapper) ───────────────────────────── */

/**
 * Rollup for a single month. monthKey is "YYYY-MM".
 */
export function computeMonthlyRollup(data, monthKey) {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) {
    return computeFinancialRollup(data, {});
  }
  const from = monthKey + "-01";
  /* last day of the month — quick & dirty */
  const [y, m] = monthKey.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const to = monthKey + "-" + String(lastDay).padStart(2, "0");
  return computeFinancialRollup(data, { from, to });
}

/* ─── per-customer statement ─────────────────────────────────────────── */

/**
 * Detailed per-customer statement — useful for CustDeliverPg "كشف حساب".
 * Returns ALL invoices, ALL payments, AND ALL deliveries for the customer.
 */
export function computeCustomerStatement(data, custId, filter = {}) {
  if (!custId && custId !== 0) return null;
  const k = String(custId);
  const cust = (data?.customers || []).find(c => String(c.id) === k);
  if (!cust) return null;
  const { from, to } = filter;

  const invoices = (data?.salesInvoices || []).filter(i =>
    String(i.customerId) === k && i.status === "posted" && inDateRange(i.date, from, to)
  );
  const payments = (data?.custPayments || []).filter(p =>
    String(p.custId) === k && inDateRange(p.date, from, to)
  );
  /* checks where this customer is the receivable party */
  const checks = (data?.checks || []).filter(c =>
    c.type === "receivable" && String(c.partyId) === k && inDateRange(c.date, from, to)
  );

  const totalSales    = r2(invoices.reduce((s, i) => s + (Number(i.total) || 0), 0));
  const totalPaidCash = r2(payments.reduce((s, p) => s + (Number(p.amount) || 0), 0));
  const totalChecks   = r2(checks.reduce((s, c) => s + (Number(c.amount) || 0), 0));
  const balance       = r2(totalSales - totalPaidCash - totalChecks);

  return {
    customer: cust,
    period: { from: from || null, to: to || null },
    invoices,
    payments,
    checks,
    totals: {
      sales: totalSales,
      cashPayments: totalPaidCash,
      checks: totalChecks,
      balance,
    },
  };
}

/* ─── per-supplier statement ─────────────────────────────────────────── */

export function computeSupplierStatement(data, supplierId, filter = {}) {
  if (!supplierId && supplierId !== 0) return null;
  const k = String(supplierId);
  const sup = (data?.suppliers || []).find(s => String(s.id) === k);
  if (!sup) return null;
  const { from, to } = filter;

  const invoices = (data?.purchaseInvoices || []).filter(i =>
    String(i.supplierId) === k && i.status === "posted" && inDateRange(i.date, from, to)
  );
  const payments = (data?.supplierPayments || []).filter(p =>
    String(p.supplierId) === k && inDateRange(p.date, from, to)
  );
  const checks = (data?.checks || []).filter(c =>
    c.type === "payable" && String(c.partyId) === k && inDateRange(c.date, from, to)
  );
  /* V21.9.89 (Purchase audit Bug #1): include purchase debit notes (returns
     to supplier) in the supplier balance calc. Pre-V21.9.89 the balance was
     `totalPurchase - paid - checks`, IGNORING posted debitNotes. A 200 ج
     return that reduces our liability would silently NOT reduce the
     balance → factory overpaid by the debit note amount. */
  const debitNotes = (data?.purchaseDebitNotes || []).filter(dn =>
    String(dn.supplierId) === k && dn.status === "posted" && inDateRange(dn.date, from, to)
  );

  const totalPurchase = r2(invoices.reduce((s, i) => s + (Number(i.total) || 0), 0));
  const totalPaidCash = r2(payments.reduce((s, p) => s + (Number(p.amount) || 0), 0));
  const totalChecks   = r2(checks.reduce((s, c) => s + (Number(c.amount) || 0), 0));
  const totalDebitNotes = r2(debitNotes.reduce((s, dn) => s + (Number(dn.total) || 0), 0));
  const balance       = r2(totalPurchase - totalDebitNotes - totalPaidCash - totalChecks);

  return {
    supplier: sup,
    period: { from: from || null, to: to || null },
    invoices,
    payments,
    checks,
    debitNotes,
    totals: {
      purchases: totalPurchase,
      debitNotes: totalDebitNotes,
      cashPayments: totalPaidCash,
      checks: totalChecks,
      balance,
    },
  };
}

/* ─── small helpers exposed for ad-hoc use in pages ──────────────────── */

export const rollupsHelpers = {
  inDateRange,
  indexById,
  r2,
};
