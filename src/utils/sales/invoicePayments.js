/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Invoice Payments Utility (V21.10.4 — Phase 12d)
   ───────────────────────────────────────────────────────────────────────
   تسجيل دفعة من داخل الفاتورة. بيعيد استخدام آليات الدفع الموجودة بالظبط
   (نفس نمط CustDeliverPg «تسجيل دفعة»):
     - حركة خزنة type:"in" category:"دفعة عميل"  (treasury → treasuryDays)
     - سجل دفعة عميل custPayments (→ custPaymentsDays) مربوط بـ treasuryTxId
     - تحديث invoice.paidAmount / balanceDue / paymentIds[]
   القيد المحاسبي (Cash Dr / AR Cr) بيتعمل بـ autoPost.customerPay من
   الـ caller بعد الـ upConfig (زي CustDeliverPg) — مش جوّة الـ mutator.

   ⚠️ سياسة: الدفع متاح فقط للفاتورة المرحّلة (posted) — عشان الـ AR يكون
   اتسجّل بالفعل. الفاتورة المسودة لازم تترحّل الأول.

   ملاحظة صلاحيات: كتابة treasuryDays تتطلب isPurchaseScope (admin/manager/
   purchase_accountant). محاسب المبيعات مش بيقدر يكتب الخزنة (قيد قائم في
   firestore.rules مش بنغيّره هنا) — نفس قيد دفعات CustDeliverPg الحالية.
   ═══════════════════════════════════════════════════════════════════════ */

import { r2 } from "../format.js";

function _dayNameAr(iso){
  try { return new Date(iso + "T00:00:00Z").toLocaleDateString("ar-EG", { weekday: "long" }); }
  catch(e){ return ""; }
}

/* بيرجّع المتبقي على الفاتورة (total − paidAmount). */
export function invoiceBalance(inv){
  const total = Number(inv?.total) || 0;
  const paid = Number(inv?.paidAmount) || 0;
  return r2(total - paid);
}

/* mutator — يُمرّر داخل upConfig. بيرجّع { ok, error?, payment?, invoice? }.
   الـ caller لازم ينادي autoPost.customerPay(data, payment, customer, userName)
   بعد نجاح الـ upConfig. */
export function recordInvoicePaymentMutator(d, { invoiceId, type = "sales", amount, method, account, date, notes, userName }){
  if(type !== "sales") return { ok: false, error: "الدفع من فاتورة المشتريات هييجي في تحديث لاحق" };
  const listKey = "salesInvoices";
  if(!Array.isArray(d[listKey])) return { ok: false, error: "لا توجد فواتير" };
  const inv = d[listKey].find(i => i && i.id === invoiceId);
  if(!inv) return { ok: false, error: "الفاتورة غير موجودة" };
  if(inv.status !== "posted") return { ok: false, error: "لازم ترحّل الفاتورة الأول قبل تسجيل دفعة" };
  if(!inv.customerId) return { ok: false, error: "الفاتورة لعميل غير مسجّل — مينفعش تسجّل دفعة مربوطة" };

  const amt = r2(Number(amount) || 0);
  if(amt <= 0) return { ok: false, error: "المبلغ لازم يكون أكبر من صفر" };
  const total = Number(inv.total) || 0;
  const prevPaid = Number(inv.paidAmount) || 0;
  const balance = r2(total - prevPaid);
  if(balance <= 0) return { ok: false, error: "الفاتورة مدفوعة بالكامل" };
  if(amt > balance + 0.01) return { ok: false, error: "المبلغ أكبر من المتبقي (" + balance + ")" };

  const nowIso = new Date().toISOString();
  const payDate = date || nowIso.split("T")[0];
  const payId = "pay_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
  const txId = "txi_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
  const acc = account || "SUB CASH";
  const payMethod = method || "نقدي كاش";

  /* سجل الدفعة (custPayments → custPaymentsDays) — نفس شكل CustDeliverPg + cross-links */
  const payment = {
    id: payId,
    custId: inv.customerId,
    custName: inv.customerName || "",
    amount: amt,
    date: payDate,
    note: notes || ("دفعة فاتورة " + (inv.invoiceNo || "")),
    method: payMethod,
    account: acc,
    by: userName || "",
    treasuryTxId: txId,
    /* V21.10.4 cross-links */
    linkedInvoiceId: inv.id,
    linkedInvoiceNo: inv.invoiceNo || "",
    linkedSalesOrderId: inv.fromSalesOrderId || "",
    linkedQuotationId: inv.fromQuotationId || "",
    createdAt: nowIso,
  };
  if(!Array.isArray(d.custPayments)) d.custPayments = [];
  d.custPayments.push(payment);

  /* حركة الخزنة (treasury → treasuryDays) — نفس شكل CustDeliverPg + ربط بالفاتورة */
  if(!Array.isArray(d.treasury)) d.treasury = [];
  d.treasury.unshift({
    id: txId, type: "in", amount: amt,
    desc: "دفعة فاتورة " + (inv.invoiceNo || "") + " — " + (inv.customerName || ""),
    notes: payMethod, category: "دفعة عميل", account: acc,
    season: d.activeSeason || "", date: payDate, day: _dayNameAr(payDate),
    sourceType: "cust_payment", custPaymentId: payId, custId: inv.customerId,
    linkedInvoiceId: inv.id, linkedInvoiceNo: inv.invoiceNo || "",
    by: userName || "", createdAt: nowIso,
  });

  /* تحديث الفاتورة */
  const newPaid = r2(prevPaid + amt);
  inv.paidAmount = newPaid;
  inv.balanceDue = r2(total - newPaid);
  if(!Array.isArray(inv.paymentIds)) inv.paymentIds = [];
  inv.paymentIds.push(payId);

  return { ok: true, payment, invoice: inv };
}
