/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Purchase Invoice Payments Utility (V21.10.6 — #3 Slice 9)
   ───────────────────────────────────────────────────────────────────────
   Mirror of utils/sales/invoicePayments.js for the Purchase side.
   When an admin opens a posted purchase invoice with positive balance, they
   can record a payment that:
     1. Creates a supplierPayments entry with linked RFQ/PPO/Invoice IDs
     2. Creates a treasury entry (withdrawal — money leaves the cash box)
     3. Updates invoice.paidAmount + invoice.balanceDue

   Shares the PMT-YYYY-NNNN counter (paymentCounters) with the sales side.
   ═══════════════════════════════════════════════════════════════════════ */

import { r2 } from "../format.js";
import { reservePaymentNo } from "../sales/invoicePayments.js";

export function computePurchaseInvoiceBalance(invoice, allSupplierPayments){
  const total = Number(invoice?.total) || 0;
  if(!Array.isArray(allSupplierPayments)) return { paid: 0, balance: total };
  const paid = allSupplierPayments
    .filter(p => p.linkedInvoiceId === invoice.id && p.type === "payment" && !p.voided)
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  return { paid: r2(paid), balance: r2(total - paid) };
}

export function recordPurchaseInvoicePaymentMutator(d, args){
  const { invoiceId, amount, method, treasuryAccountId, date, notes, userName } = args;
  if(!invoiceId) throw new Error("الفاتورة غير محددة");
  const inv = (d.purchaseInvoices || []).find(x => x.id === invoiceId);
  if(!inv) throw new Error("الفاتورة غير موجودة");
  if(inv.status !== "posted") throw new Error("الدفع متاح للفواتير المرحّلة فقط");

  const amt = Number(amount);
  if(!(amt > 0)) throw new Error("المبلغ لازم أكبر من صفر");

  const { balance } = computePurchaseInvoiceBalance(inv, d.supplierPayments || []);
  if(amt > balance + 0.001){
    throw new Error(`المبلغ (${amt}) أكبر من الرصيد المتبقي (${balance})`);
  }
  if(!treasuryAccountId) throw new Error("اختر حساب الخزنة");
  if(!["cash","bank","check"].includes(method)) throw new Error("طريقة دفع غير صالحة");

  const today = date || new Date().toISOString().split("T")[0];
  const paymentNo = reservePaymentNo(d);
  const paymentId = "spay_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,7);

  /* 1. supplierPayments entry */
  const payment = {
    id: paymentId,
    paymentNo,
    type: "payment",
    supplierId: inv.supplierId,
    supplierName: inv.supplierName,
    date: today,
    amount: r2(amt),
    method,
    treasuryAccountId,
    notes: notes || "",
    linkedInvoiceId: inv.id,
    linkedInvoiceNo: inv.invoiceNo,
    linkedPipelinePOId: inv.fromPipelinePOId || null,
    linkedPipelinePONo: inv.fromPipelinePONo || null,
    linkedRFQId: inv.fromRFQId || null,
    linkedRFQNo: inv.fromRFQNo || null,
    createdAt: new Date().toISOString(),
    createdBy: userName || "",
  };
  if(!Array.isArray(d.supplierPayments)) d.supplierPayments = [];
  d.supplierPayments.push(payment);

  /* 2. Treasury entry (withdrawal — money going OUT for purchase payment) */
  const treasuryId = "tr_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,7);
  if(!Array.isArray(d.treasury)) d.treasury = [];
  d.treasury.push({
    id: treasuryId,
    date: today,
    type: "withdrawal",
    accountId: treasuryAccountId,
    amount: r2(amt),
    method,
    description: `سداد فاتورة شراء ${inv.invoiceNo} — ${inv.supplierName}`,
    relatedTo: "purchase_invoice_payment",
    refInvoiceId: inv.id,
    refInvoiceNo: inv.invoiceNo,
    refPipelinePOId: inv.fromPipelinePOId || null,
    refPipelinePONo: inv.fromPipelinePONo || null,
    refRFQId: inv.fromRFQId || null,
    refRFQNo: inv.fromRFQNo || null,
    refSupplierPaymentId: paymentId,
    supplierId: inv.supplierId,
    supplierName: inv.supplierName,
    notes: notes || "",
    createdAt: new Date().toISOString(),
    createdBy: userName || "",
  });

  /* 3. Update invoice */
  if(!Array.isArray(inv.paymentIds)) inv.paymentIds = [];
  inv.paymentIds.push(paymentId);
  inv.paidAmount = r2((Number(inv.paidAmount) || 0) + amt);
  inv.balanceDue = r2((Number(inv.total) || 0) - inv.paidAmount);
  if(inv.balanceDue <= 0.001){
    inv.fullyPaidAt = new Date().toISOString();
    inv.fullyPaidBy = userName || "";
  }

  /* 4. PPO link update */
  if(inv.fromPipelinePOId){
    const ppo = (d.purchasePipelineOrders || []).find(x => x.id === inv.fromPipelinePOId);
    if(ppo){
      ppo.paidAmount = (Number(ppo.paidAmount) || 0) + amt;
    }
  }

  return payment;
}
