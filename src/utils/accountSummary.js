/* V18.33: Account summary helpers for WhatsApp message footers.
   Computes overall account totals for a customer or a workshop
   (sales, payments, returns, balance) and formats them as WA-ready
   text honoring per-line visibility toggles from settings.

   Used by:
   - CustDeliverPg.jsx: customer delivery WA messages (single + multi-shipment)
   - ExtProdPg.jsx: workshop delivery / receive / batch / late-alert WA messages

   The summary text is appended at the END of the existing message, after
   a separator line. If the user disables all lines (or the master toggle),
   the summary is omitted entirely. */

/* Format a number with thousand separators, no decimals */
const _fmt = (n) => Math.round(Number(n) || 0).toLocaleString("en-US");

/* V21.21.8: إجماليات نظرة عامة المبيعات (كل الموسم) — نسخة طبق الأصل من حساب
   CustDeliverPg overview: خصم لكل تسليم (delivery.discPct → customer.discount →
   10)، شيكات التحصيل (دفعة عميل فقط)، والرصيد = مبيعات − مرتجعات − كاش − شيكات.
   تُستخدم في أعلى نظرة عامة المبيعات (نفس الأرقام بالظبط). */
export function computeSalesOverviewTotals(data){
  const orders = data.orders || [], customers = data.customers || [];
  const perCust = {};
  const init = () => ({ sales: 0, salesNet: 0, returns: 0, returnsNet: 0, cash: 0, check: 0 });
  const eff = (entry, cust) => {
    if(entry && entry.discPct != null){ const n = Number(entry.discPct); if(!isNaN(n)) return n; }
    if(cust && cust.discount != null){ const n = Number(cust.discount); if(!isNaN(n)) return n; }
    return 10;
  };
  orders.forEach(o => {
    const sp = Number(o.sellPrice) || 0;
    (o.customerDeliveries || []).forEach(d => {
      const gross = (Number(d.qty) || 0) * (Number(d.price) || sp);
      if(!perCust[d.custId]) perCust[d.custId] = init();
      perCust[d.custId].sales += gross;
      const cust = customers.find(c => c.id === d.custId);
      perCust[d.custId].salesNet += Math.round(gross * (1 - eff(d, cust) / 100));
    });
    (o.customerReturns || []).forEach(r => {
      const gross = (Number(r.qty) || 0) * sp;
      if(!perCust[r.custId]) perCust[r.custId] = init();
      perCust[r.custId].returns += gross;
      const cust = customers.find(c => c.id === r.custId);
      perCust[r.custId].returnsNet += Math.round(gross * (1 - eff(r, cust) / 100));
    });
  });
  (data.custPayments || []).forEach(p => {
    const amt = Number(p.amount) || 0; const m = (p.method || "").toLowerCase();
    /* V21.27.153: استبعاد custPayments بـ method «شيك» — الشيكات بتتعدّ من
       data.checks تحت (نفس المصدر الكنوني: statement.js gatherCustomerPayments
       + buildCustomerSummary + api/customer-portal.js). عدّها هنا كمان كان خطر
       تكرار للشيك (custPayments-شيك + data.checks لنفس الشيك). */
    if(m.includes("شيك") || m.includes("check")) return;
    if(!perCust[p.custId]) perCust[p.custId] = init();
    perCust[p.custId].cash += amt;
  });
  (data.checks || []).filter(c => c.type === "receivable" && c.status !== "مرتد" && c.status !== "ملغي" && ((c.category || "دفعة عميل") === "دفعة عميل")).forEach(c => {
    const amt = Number(c.amount) || 0;
    if(c.partyId){ if(!perCust[c.partyId]) perCust[c.partyId] = init(); perCust[c.partyId].check += amt; }
  });
  let totalSales = 0, totalReturns = 0, totalCashPay = 0, totalCheckPay = 0;
  Object.keys(perCust).forEach(cid => { const p = perCust[cid]; totalSales += p.salesNet; totalReturns += p.returnsNet; totalCashPay += p.cash; totalCheckPay += p.check; });
  return { totalSales, totalReturns, totalCashPay, totalCheckPay, totalBalance: totalSales - totalReturns - totalCashPay - totalCheckPay };
}

/* V21.9.83 (Treasury audit Bug #1): central helper to compute workshop "due".
   The DUE is the cash amount owed to the workshop for received pieces.
   Settlement entries (r.isSettlement===true) are WASTE/dispute markers — they
   adjust workshop balance count but the factory does NOT owe cash for them.
   Pre-V21.9.83 the duplicate ad-hoc implementations in DashPg/TreasuryPg
   counted settlements in due, inflating the balance by thousands of ج.م
   whenever a settlement existed.
   Also: r2() is applied per-receive to prevent float-accumulation drift in
   long lists of receives. Used by ALL callers now to ensure consistency. */
const _r2 = (n) => Math.round((n || 0) * 100) / 100;
export function computeWorkshopDue(wsName, data) {
  if (!wsName || !data) return 0;
  let due = 0;
  (data.orders || []).forEach(o => {
    (o.workshopDeliveries || []).filter(wd => wd.wsName === wsName).forEach(wd => {
      (wd.receives || []).forEach(r => {
        if (r && r.isSettlement) return; /* skip settlements */
        due += _r2((Number(r.qty) || 0) * (Number(r.price) || 0));
      });
    });
  });
  return _r2(due);
}
export function computeWorkshopBalance(wsName, data) {
  const due = computeWorkshopDue(wsName, data);
  const payments = (data.wsPayments || []).filter(p => p.wsName === wsName);
  const totalPaid = _r2(payments.filter(p => p.type === "payment").reduce((s, p) => s + (Number(p.amount) || 0), 0));
  const totalPurchase = _r2(payments.filter(p => p.type === "purchase").reduce((s, p) => s + (Number(p.amount) || 0), 0));
  const balance = _r2(due + totalPurchase - totalPaid);
  return { due, totalPaid, totalPurchase, balance };
}

/* ═══ CUSTOMER ACCOUNT SUMMARY ═══
   Returns: {salesGross, discAmt, salesNet, payCash, payCheck, returnsGross, returnsNet, balance}
   All fields are in EGP, applying the customer's discount % to sales/returns.
   Mirrors the math used in V18.27 customer stats cards (CustDeliverPg.jsx). */
export function buildCustomerSummary(custId, data) {
  if (!custId || !data) return null;
  const customer = (data.customers || []).find(c => c.id === custId);
  if (!customer) return null;
  /* V21.27.216 FIX (H4): الخصم per-delivery بنفس أسبقية statement.js
     (جلسة custDisc → delivery discPct → customer.discount → 10%) بدل خصم ثابت من
     customer.discount بافتراضي 0. قبل كده الملخّص (هنا) والكشف (statement.js)
     كانوا بيطلعوا رصيدين مختلفين لنفس العميل (مثال: عميل بلا خصم مسجّل، الكشف
     يخصم 10% افتراضي والملخّص 0%). LOGIC MUST MATCH statement.js:115-141. */
  const _sessions = data.custDeliverySessions || [];
  const _sessDisc = (e) => {
    const sid = e && (e.sessionId || e.sessId);
    if(!sid) return null;
    const s = _sessions.find(x => x && x.id === sid);
    const m = s && s.custDisc;
    if(m && m[custId] != null && m[custId] !== ""){ const n = Number(m[custId]); if(!isNaN(n)) return n; }
    return null;
  };
  const pickDiscPct = (e) => {
    const sd = _sessDisc(e); if(sd != null) return sd;
    if(e && e.discPct != null){ const n = Number(e.discPct); if(!isNaN(n)) return n; }
    if(customer && customer.discount != null){ const n = Number(customer.discount); if(!isNaN(n)) return n; }
    return 10;
  };

  /* Sales + returns من الأوامر — الصافي per-entry (خصم لكل تسليم) */
  let salesGross = 0, salesNet = 0, returnsGross = 0, returnsNet = 0;
  (data.orders || []).forEach(o => {
    const sp = Number(o.sellPrice) || 0;
    (o.customerDeliveries || []).forEach(e => {
      if (e.custId !== custId) return;
      const qty = Number(e.qty) || 0; if(qty <= 0) return;
      const gross = qty * (Number(e.price) || sp);
      salesGross += gross;
      salesNet += Math.round(gross * (1 - pickDiscPct(e) / 100));
    });
    (o.customerReturns || []).forEach(e => {
      if (e.custId !== custId) return;
      const qty = Number(e.qty) || 0; if(qty <= 0) return;
      const gross = qty * (Number(e.price) || sp);
      returnsGross += gross;
      returnsNet += Math.round(gross * (1 - pickDiscPct(e) / 100));
    });
  });
  const discAmt = salesGross - salesNet;
  /* discPct للعرض فقط (نسبة الخصم الفعلية المخلوطة) — الحساب per-entry فوق */
  const discPct = salesGross > 0 ? Math.round(discAmt / salesGross * 100) : (Number(customer.discount) || 0);

  /* Cash + other payments */
  let payCash = 0, payOther = 0;
  (data.custPayments || []).forEach(p => {
    if (p.custId !== custId) return;
    const amt = Number(p.amount) || 0;
    const m = (p.method || "").toLowerCase();
    const isCheck = m.includes("شيك") || m.includes("check");
    const isCash = m.includes("كاش") || m.includes("cash") || !m;
    if (isCheck) return;/* checks counted from data.checks below */
    if (isCash) payCash += amt;
    else payOther += amt;
  });

  /* Receivable checks (only category = 'دفعة عميل') */
  let payCheck = 0;
  (data.checks || []).filter(c =>
    c.type === "receivable" &&
    c.status !== "مرتد" && c.status !== "ملغي" &&
    ((c.category || "دفعة عميل") === "دفعة عميل") &&
    c.partyId === custId
  ).forEach(c => { payCheck += Number(c.amount) || 0; });

  /* V21.21.30 (قرار Ahmed: «الدفعة في أي مكان تتسجل تظهر في الكشف والملخصات»):
     دفعات الخزنة اليتيمة — حركة وارد بعميل من غير صف مقابل في custPayments.
     كانت بتظهر في كشف الحساب (statement.js gatherCustomerPayments) لكن مش
     بتدخل رصيد الملخص → الكشف والملخص يطلعوا رقمين مختلفين (نفس صنف حادثة
     V21.21.22). LOGIC MUST MATCH statement.js:55-66 — أي تعديل هنا لازم
     يتعمل هناك (اختبارات التطابق في statement.test.js بتضمن ده). */
  const _knownCustTxIds = new Set((data.custPayments || []).map(p => p.treasuryTxId).filter(Boolean));
  (data.treasury || []).forEach(t => {
    if (!t || !t.id || t.type !== "in") return;
    if (t.custId !== custId) return;
    if (_knownCustTxIds.has(t.id)) return;
    /* حركات الشيكات مستبعدة — الشيك متعدّ من data.checks فوق (V21.21.14) */
    if (t.sourceType === "check_collect" || t.sourceType === "check_pay") return;
    payOther += Number(t.amount) || 0;
  });

  /* V21.20.5: أوامر البيع كبيع تشغيلي («أمر البيع = البيع»). صافي الأمر (so.total)
     يضاف للرصيد التشغيلي. (لو العميل بيتسلّم عبر سجل التوزيعات بدل الأوامر،
     مايبقاش عنده أوامر بيع فمفيش تكرار.) */
  let salesOrdersNet = 0;
  (data.salesOrders || []).forEach(so => {
    if(!so || so.status === "cancelled") return;
    if(so.sourceDistributionId) return; /* V21.21.1: مرآة توزيعة — التوزيعة محتسبة بالفعل */
    if(String(so.customerId) !== String(custId)) return;
    /* V21.27.97: الأمر يفضل كامل؛ نطرح قيمة مرتجعاته (so.returns) من الصافي.
       (مش متكرر مع returnsNet — اللي بييجي من customerReturns بس، ولا مع
       الإشعارات الدائنة — اللي kind!=="discount" مش متحسبة في الرصيد التشغيلي.) */
    const retVal = (so.returns || []).reduce((s, rr) => s + (Number(rr && rr.net) || 0), 0);
    salesOrdersNet += (Number(so.total) || 0) - retVal;
  });

  /* V21.21.59: خصومات إضافية (إشعارات خصم مرحّلة) — تقلّل رصيد العميل.
     المسودات مستبعدة (زي statement.js). */
  let discounts = 0;
  (data.salesCreditNotes || []).forEach(cn => {
    if(!cn || cn.kind !== "discount") return;
    if(cn.customerId !== custId) return;
    if(cn.status !== "posted") return;
    discounts += Number(cn.total) || 0;
  });

  const balance = salesNet + salesOrdersNet - returnsNet - payCash - payCheck - payOther - discounts;

  return {
    salesGross, discPct, discAmt, salesNet, salesOrdersNet,
    payCash, payCheck, payOther,
    returnsGross, returnsNet,
    discounts,
    balance,
  };
}

/* ═══ SUPPLIER ACCOUNT SUMMARY (V21.9.117) ═══
   Returns: {totalInvoiced, totalPaid, balance, receiptCount, lastActivity}
   Mirrors the math used in PurchasePg.jsx supplierStats — the canonical
   "live" supplier balance shown to the user in the suppliers list.

   Why we need this: the parallel `computeSupplierStatement` in rollups.js
   computes from `purchaseInvoices` (the accounting layer), but the user
   sees the operational view in PurchasePg which sources from
   `purchaseReceipts` + `supplierPayments` + treasury orphans.
   Using rollups in the Contacts ledger created visible discrepancies
   with the suppliers list (e.g., a receipt not yet promoted to a posted
   invoice would show different balances on the two pages).

   V21.21.30: PurchasePg.jsx supplierStats now CALLS this function (the
   old ad-hoc copy was removed), so the suppliers list + Contacts ledger
   + dashboard all share one balance. Debit notes (V21.21.20) and
   unlinked payable checks (V21.21.30) are included everywhere. */
export function buildSupplierSummary(supId, data) {
  if (!supId || !data) return null;
  const supplier = (data.suppliers || []).find(s => s.id === supId);
  if (!supplier) return null;

  let totalInvoiced = 0, totalPaid = 0, receiptCount = 0, lastActivity = "";

  /* 1. Receipts (the operational source of truth for "what we bought") */
  (data.purchaseReceipts || []).forEach(r => {
    if (r.supplierId !== supId) return;
    totalInvoiced += Number(r.totalAmount) || 0;
    totalPaid += Number(r.paidAmount) || 0;  /* paid at receipt time */
    receiptCount++;
    if (r.date > lastActivity) lastActivity = r.date;
  });

  /* 2. Standalone supplier payments (not linked to a specific receipt) */
  (data.supplierPayments || []).forEach(p => {
    if (p.supplierId !== supId) return;
    if (p.receiptId) return;  /* already counted via receipts.paidAmount */
    totalPaid += Number(p.amount) || 0;
    if (p.date > lastActivity) lastActivity = p.date;
  });

  /* 3. V19.12: orphan treasury payments linked to supplierId but not yet
        reflected in supplierPayments. Honors tombstones. */
  const knownTxIds = new Set((data.supplierPayments || []).map(p => p.treasuryTxId).filter(Boolean));
  const tombstones = new Set(data._deletedSupplierPayTreasuryIds || []);
  (data.treasury || []).forEach(t => {
    if (!t || !t.id) return;
    if (t.type !== "out") return;
    if (t.supplierId !== supId) return;
    if (knownTxIds.has(t.id)) return;
    if (tombstones.has(t.id)) return;
    if (t.sourceType === "check_bounce") return;
    /* V21.27.215 FIX (H3): استبعاد حركات الشيكات — الشيك متعدّ بالفعل من
       data.checks تحت (payChecks). من غير الاستبعاد ده، شيك دفع مورد مدفوع (رِجل
       خزنة check_pay بـ supplierId، بدون supplierPayments record) كان بيتحسب
       مرتين: مرة هنا في totalPaid ومرة في payChecks → رصيد المورد ينزل الضِعف.
       LOGIC MUST MATCH statement.js:275 (اللي بيستبعد check_collect/check_pay). */
    if (t.sourceType === "check_collect" || t.sourceType === "check_pay") return;
    totalPaid += Number(t.amount) || 0;
    if (t.date > lastActivity) lastActivity = t.date;
  });

  /* 4. V21.21.20: مرتجعات المشتريات (إشعارات مدينة) بتقلّل المستحق للمورد */
  let totalReturns = 0;
  (data.purchaseDebitNotes || []).forEach(dn => {
    if (!dn || dn.supplierId !== supId || dn.status === "void") return;
    totalReturns += Number(dn.total) || 0;
    if (dn.date > lastActivity) lastActivity = dn.date;
  });

  /* 5. V21.21.30 (قرار Ahmed: «الدفعة في أي مكان تتسجل تظهر في الكشف
        والملخصات»): شيكات الدفع للمورد (دفعة مورد) غير المرتبطة بدفعة —
        معلّقة أو مدفوعة — تُحتسب التزاماً مدفوعاً زي ما بتظهر في كشف
        الحساب. الشيك المرتبط بدفعة مورد (بالـ checkId) متعدّ بالفعل في
        totalPaid فمايتكرّرش. LOGIC MUST MATCH statement.js:206-218. */
  let payChecks = 0;
  const _supPayCheckIds = new Set((data.supplierPayments || []).filter(p => p && p.supplierId === supId && p.checkId).map(p => p.checkId));
  (data.checks || []).forEach(c => {
    if (!c || c.type !== "payable") return;
    if (c.partyId !== supId) return;
    if (c.status === "ملغي" || c.status === "مرتد") return;
    if ((c.category || "دفعة مورد") !== "دفعة مورد") return;
    if (_supPayCheckIds.has(c.id)) return;
    payChecks += Number(c.amount) || 0;
    const cDate = c.date || c.dueDate || "";
    if (cDate > lastActivity) lastActivity = cDate;
  });

  totalInvoiced = _r2(totalInvoiced);
  totalPaid = _r2(totalPaid);
  totalReturns = _r2(totalReturns);
  payChecks = _r2(payChecks);
  const balance = _r2(totalInvoiced - totalReturns - totalPaid - payChecks);

  return { totalInvoiced, totalReturns, totalPaid, payChecks, balance, receiptCount, lastActivity };
}

/* ═══ WORKSHOP ACCOUNT SUMMARY ═══
   Returns: {totalDelivered, totalReceived, pendingPieces, due, totalPurchase, totalPaid, balance}
   Mirrors the math used in DashPg.jsx wsAccounts().
   - due = sum of (receive_qty × receive_price) across all orders
   - totalPaid = sum of wsPayments where type='payment'
   - totalPurchase = sum of wsPayments where type='purchase' (raw materials etc.)
   - balance = due + totalPurchase - totalPaid (positive = factory owes workshop) */
export function buildWorkshopSummary(wsName, data) {
  if (!wsName || !data) return null;
  let totalDelivered = 0, totalReceived = 0;
  (data.orders || []).forEach(o => {
    (o.workshopDeliveries || []).filter(wd => wd.wsName === wsName).forEach(wd => {
      totalDelivered += Number(wd.qty) || 0;
      (wd.receives || []).forEach(r => {
        totalReceived += Number(r.qty) || 0;
      });
    });
  });
  const pendingPieces = Math.max(0, totalDelivered - totalReceived);
  /* V21.9.83 (Treasury audit Bug #1 + #4): use central helper which excludes
     settlement entries from `due` and applies r2() per-receive to prevent
     float drift. Previously this helper had its own ad-hoc loop that
     double-counted settlements and accumulated rounding errors. */
  const { due, totalPaid, totalPurchase, balance } = computeWorkshopBalance(wsName, data);
  return { totalDelivered, totalReceived, pendingPieces, due, totalPurchase, totalPaid, balance };
}

/* ═══ FORMAT FOR WHATSAPP ═══
   Renders a customer/workshop summary as WA-ready Arabic text, with
   per-line visibility honoring settings.
   Returns "" (empty string) if disabled or all lines hidden.

   `settings` shape (data.printSettings.whatsappSummary):
   {
     customer: { enabled: bool, fields: { salesGross:{show}, discount:{show},
                  salesNet:{show}, payments:{show}, checks:{show},
                  returnsNet:{show}, balance:{show} } },
     workshop: { enabled: bool, fields: { totalDelivered:{show},
                  totalReceived:{show}, pendingPieces:{show}, due:{show},
                  totalPurchase:{show}, totalPaid:{show}, balance:{show} } }
   } */
export function formatCustomerSummaryWA(summary, settings) {
  if (!summary) return "";
  const cs = (settings && settings.customer) || {};
  if (cs.enabled === false) return "";
  const f = cs.fields || {};
  const show = (k, defaultOn) => {
    const v = f[k];
    if (v === undefined) return defaultOn !== false;/* default ON if not set */
    return v.show !== false;
  };
  const lines = [];
  if (show("salesGross", true))  lines.push("• اجمالي المبيعات (قبل الخصم): *" + _fmt(summary.salesGross) + "* ج.م");
  if (show("discount", true) && summary.discPct > 0) {
    lines.push("• اجمالي الخصم (" + summary.discPct + "%): *-" + _fmt(summary.discAmt) + "* ج.م");
  }
  if (show("salesNet", true))    lines.push("• اجمالي بعد الخصم: *" + _fmt(summary.salesNet) + "* ج.م");
  if (show("returnsNet", true) && summary.returnsNet > 0) {
    lines.push("• المرتجع بعد الخصم: *-" + _fmt(summary.returnsNet) + "* ج.م");
  }
  if (show("payments", true) && summary.payCash + summary.payOther > 0) {
    lines.push("• دفعات (كاش): *-" + _fmt(summary.payCash + summary.payOther) + "* ج.م");
  }
  if (show("checks", true) && summary.payCheck > 0) {
    lines.push("• شيكات: *-" + _fmt(summary.payCheck) + "* ج.م");
  }
  if (show("balance", true)) {
    const bal = summary.balance;
    const balLabel = bal > 0 ? "📊 المستحق علي" : bal < 0 ? "📊 المستحق لكم" : "📊 الرصيد";
    lines.push(balLabel + ": *" + _fmt(Math.abs(bal)) + "* ج.م");
  }
  if (lines.length === 0) return "";
  return "\n\n━━━━━━━━━━━━━━\n💼 *ملخص الحساب*\n" + lines.join("\n");
}

export function formatWorkshopSummaryWA(summary, settings) {
  if (!summary) return "";
  const ws = (settings && settings.workshop) || {};
  if (ws.enabled === false) return "";
  const f = ws.fields || {};
  const show = (k, defaultOn) => {
    const v = f[k];
    if (v === undefined) return defaultOn !== false;
    return v.show !== false;
  };
  const lines = [];
  if (show("totalDelivered", true))  lines.push("• اجمالي تسليم للورشة: *" + _fmt(summary.totalDelivered) + "* قطعة");
  if (show("totalReceived", true))   lines.push("• اجمالي استلام من الورشة: *" + _fmt(summary.totalReceived) + "* قطعة");
  if (show("pendingPieces", true) && summary.pendingPieces > 0)
    lines.push("• رصيد قطع عند الورشة: *" + _fmt(summary.pendingPieces) + "* قطعة");
  if (show("due", true))             lines.push("• اجمالي مستحق للورشة: *" + _fmt(summary.due) + "* ج.م");
  if (show("totalPurchase", true) && summary.totalPurchase > 0)
    lines.push("• مشتريات: *" + _fmt(summary.totalPurchase) + "* ج.م");
  if (show("totalPaid", true) && summary.totalPaid > 0)
    lines.push("• مدفوعات: *-" + _fmt(summary.totalPaid) + "* ج.م");
  if (show("balance", true)) {
    const bal = summary.balance;
    const balLabel = bal > 0 ? "📊 المستحق للورشة" : bal < 0 ? "📊 المستحق علي الورشة" : "📊 الرصيد";
    lines.push(balLabel + ": *" + _fmt(Math.abs(bal)) + "* ج.م");
  }
  if (lines.length === 0) return "";
  return "\n\n━━━━━━━━━━━━━━\n💼 *ملخص الحساب*\n" + lines.join("\n");
}
