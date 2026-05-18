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
  const discPct = Number(customer.discount) || 0;

  /* Sales + returns gross from orders */
  let salesGross = 0, returnsGross = 0;
  (data.orders || []).forEach(o => {
    const sp = Number(o.sellPrice) || 0;
    (o.customerDeliveries || []).forEach(d => {
      if (d.custId === custId) {
        const effPrice = Number(d.price) || sp;
        salesGross += (Number(d.qty) || 0) * effPrice;
      }
    });
    (o.customerReturns || []).forEach(r => {
      if (r.custId === custId) {
        returnsGross += (Number(r.qty) || 0) * sp;
      }
    });
  });

  /* Apply customer discount */
  const discAmt = Math.round(salesGross * discPct / 100);
  const returnsDisc = Math.round(returnsGross * discPct / 100);
  const salesNet = salesGross - discAmt;
  const returnsNet = returnsGross - returnsDisc;

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

  const balance = salesNet - returnsNet - payCash - payCheck - payOther;

  return {
    salesGross, discPct, discAmt, salesNet,
    payCash, payCheck, payOther,
    returnsGross, returnsNet,
    balance,
  };
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
