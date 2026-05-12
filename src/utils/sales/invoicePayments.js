/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Invoice Payments Utility (V21.10.3 — #3 Slice 4)
   ───────────────────────────────────────────────────────────────────────
   "Pay from invoice" workflow — when an admin opens a posted sales invoice
   with positive balance, they can record a payment that:
     1. Creates a custPayment entry with linked Quote/SO/Invoice IDs
     2. Creates a treasury entry (deposit) referencing all parents
     3. Updates invoice.paidAmount + invoice.balanceDue
     4. (Caller responsibility): triggers autoPost.salePayment for the
        journal entry — kept out of the mutator since autoPost is async
        and must run AFTER the upConfig settle.

   Mirrors the Purchase side via `recordPurchaseInvoicePaymentMutator`
   (added in Slice 9 — V21.10.6).

   ⚠️ Idempotency: a unique payment ID is generated per call. Re-clicking
   the Save button while the upConfig is in-flight is gated by the modal's
   `saving` state — the mutator itself doesn't dedupe by content.

   --- Args shape ---
   args = {
     invoiceId,                  // required — must exist + status="posted"
     invoiceType: "sales",       // "sales" only in Slice 4; purchase comes in Slice 9
     amount,                     // > 0 and <= invoice.balanceDue
     method: "cash"|"bank"|"check",
     treasuryAccountId,          // which cash/bank account receives the deposit
     date,                       // YYYY-MM-DD (defaults to today)
     notes,
     userName,
   }
   ═══════════════════════════════════════════════════════════════════════ */

import { r2 } from "../format.js";

/* Resolve current paid + balance for an invoice. Pure — works on either
   the stored invoice object or a snapshot. paidAmount sums all
   custPayments linked to this invoiceId. */
export function computeInvoiceBalance(invoice, allCustPayments){
  const total = Number(invoice?.total) || 0;
  if(!Array.isArray(allCustPayments)) return { paid: 0, balance: total };
  const paid = allCustPayments
    .filter(p => p.linkedInvoiceId === invoice.id && p.type === "payment" && !p.voided)
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  return { paid: r2(paid), balance: r2(total - paid) };
}

/* Reserve next payment number across both sales + purchase (one shared
   PMT counter). Format: PMT-YYYY-NNNN. */
export function reservePaymentNo(d){
  if(!d.paymentCounters) d.paymentCounters = {};
  const year = new Date().getFullYear();
  const next = (d.paymentCounters[year] || 0) + 1;
  d.paymentCounters[year] = next;
  return `PMT-${year}-${String(next).padStart(4, "0")}`;
}

/* Record a sales invoice payment. Throws on invariant violation.
   Returns the inserted custPayment object for the caller to pass to
   autoPost.salePayment (or autoPost.customerPayment). */
export function recordInvoicePaymentMutator(d, args){
  const { invoiceId, amount, method, treasuryAccountId, date, notes, userName } = args;
  if(!invoiceId) throw new Error("الفاتورة غير محددة");
  const inv = (d.salesInvoices || []).find(x => x.id === invoiceId);
  if(!inv) throw new Error("الفاتورة غير موجودة");
  if(inv.status !== "posted") throw new Error("الدفع متاح للفواتير المرحّلة فقط");

  const amt = Number(amount);
  if(!(amt > 0)) throw new Error("المبلغ لازم أكبر من صفر");

  /* Compute current balance INSIDE the mutator so we see latest state */
  const { balance } = computeInvoiceBalance(inv, d.custPayments || []);
  if(amt > balance + 0.001){
    throw new Error(`المبلغ (${amt}) أكبر من الرصيد المتبقي (${balance})`);
  }
  if(!treasuryAccountId) throw new Error("اختر حساب الخزنة");
  if(!["cash","bank","check"].includes(method)) throw new Error("طريقة دفع غير صالحة");

  const today = date || new Date().toISOString().split("T")[0];
  const paymentNo = reservePaymentNo(d);
  const paymentId = "pay_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,7);

  /* 1. custPayments entry */
  const payment = {
    id: paymentId,
    paymentNo,
    type: "payment",
    custId: inv.customerId,
    customerName: inv.customerName,
    date: today,
    amount: r2(amt),
    method,
    treasuryAccountId,
    notes: notes || "",
    /* V21.10.3 — cross-link to the document chain */
    linkedInvoiceId: inv.id,
    linkedInvoiceNo: inv.invoiceNo,
    linkedSalesOrderId: inv.fromSalesOrderId || null,
    linkedSalesOrderNo: inv.fromSalesOrderNo || null,
    linkedQuotationId: inv.fromQuotationId || null,
    linkedQuotationNo: inv.fromQuotationNo || null,
    createdAt: new Date().toISOString(),
    createdBy: userName || "",
  };
  if(!Array.isArray(d.custPayments)) d.custPayments = [];
  d.custPayments.push(payment);

  /* 2. Treasury entry (deposit) */
  const treasuryId = "tr_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,7);
  if(!Array.isArray(d.treasury)) d.treasury = [];
  d.treasury.push({
    id: treasuryId,
    date: today,
    type: "deposit",
    accountId: treasuryAccountId,
    amount: r2(amt),
    method,
    description: `دفعة فاتورة ${inv.invoiceNo} — ${inv.customerName}`,
    relatedTo: "invoice_payment",
    refInvoiceId: inv.id,
    refInvoiceNo: inv.invoiceNo,
    refSalesOrderId: inv.fromSalesOrderId || null,
    refSalesOrderNo: inv.fromSalesOrderNo || null,
    refQuotationId: inv.fromQuotationId || null,
    refQuotationNo: inv.fromQuotationNo || null,
    refCustPaymentId: paymentId,
    customerId: inv.customerId,
    customerName: inv.customerName,
    notes: notes || "",
    createdAt: new Date().toISOString(),
    createdBy: userName || "",
  });

  /* 3. Update invoice with cached paid + balance + payment id ref. */
  if(!Array.isArray(inv.paymentIds)) inv.paymentIds = [];
  inv.paymentIds.push(paymentId);
  inv.paidAmount = r2((Number(inv.paidAmount) || 0) + amt);
  inv.balanceDue = r2((Number(inv.total) || 0) - inv.paidAmount);
  if(inv.balanceDue <= 0.001){
    inv.fullyPaidAt = new Date().toISOString();
    inv.fullyPaidBy = userName || "";
  }

  /* 4. Update SO ref (if the invoice was created from one) — for "is paid" status */
  if(inv.fromSalesOrderId){
    const so = (d.salesOrders || []).find(x => x.id === inv.fromSalesOrderId);
    if(so){
      so.paidAmount = (Number(so.paidAmount) || 0) + amt;
      if(inv.balanceDue <= 0.001){
        if(!Array.isArray(so.statusHistory)) so.statusHistory = [];
        so.statusHistory.push({ from: so.status, to: so.status, at: new Date().toISOString(), by: userName || "", note: `دفعة كاملة ${paymentNo}` });
      }
    }
  }

  return payment;
}
