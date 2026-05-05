/* ═══════════════════════════════════════════════════════════════════════
   CLARK Automation · Daily Report Builder (V19.68)
   ───────────────────────────────────────────────────────────────────────
   Pure function. Takes the merged `data` object + report config + a date
   string ("YYYY-MM-DD") and returns a WhatsApp-ready Arabic-formatted
   message + analytics summary.

   Sections (each toggle-able via config.sections):
     - sales:      مبيعات اليوم + عدد الفواتير + top-3 customers
     - purchases:  مشتريات اليوم + عدد الإذونات
     - treasury:   محصلات/مدفوعات/أرصدة الخزنات
     - production: جاهز للتسليم + متأخر + ورش متأخرة
     - alerts:     شيكات تستحق + عملاء بأرصدة عالية بدون دفع
     - tasks:      المهام المعلقة لكل user
     - comparison: مبيعات اليوم vs الأسبوع اللي فات
   ═══════════════════════════════════════════════════════════════════════ */

const _r0 = (n) => Math.round(Number(n) || 0);
const _fmt = (n) => _r0(n).toLocaleString("en-US");
/* V19.70 FIX: currency suffix — standardized to "ج.م" (Egyptian pound abbreviation). */
const _money = (n) => _fmt(n) + " ج.م";

/* Helper: filter array by date (YYYY-MM-DD prefix). */
function _dayItems(arr, date) {
  return (arr || []).filter(x => {
    const d = String(x?.date || x?.createdAt || "").slice(0, 10);
    return d === date;
  });
}

/* Helper: parse "YYYY-MM-DD" → Date at noon UTC (avoid TZ drift). */
function _toDate(s) { return new Date(String(s) + "T12:00:00Z"); }

/* Helper: days between two YYYY-MM-DD strings. */
function _daysBetween(a, b) {
  return Math.floor((_toDate(b) - _toDate(a)) / 86400000);
}

/* ── 1. Sales section ── */
function _salesSection(data, date) {
  const lines = [];
  /* Customer deliveries flagged as sale */
  let salesQty = 0, salesValue = 0;
  const byCustomer = {};
  (data.orders || []).forEach(o => {
    (o.customerDeliveries || []).forEach(d => {
      if (String(d.date || "").slice(0, 10) !== date) return;
      const qty = Number(d.qty) || 0;
      const price = Number(d.price) || Number(o.sellPrice) || 0;
      const value = qty * price;
      salesQty += qty;
      salesValue += value;
      const cName = d.custName || "—";
      if (!byCustomer[cName]) byCustomer[cName] = { qty: 0, value: 0 };
      byCustomer[cName].qty += qty;
      byCustomer[cName].value += value;
    });
  });
  /* Sales invoices count for the day (preferred) */
  const todayInvs = _dayItems(data.salesInvoices, date)
    .filter(i => i.status === "posted" || i.status === "draft");
  lines.push("💰 *المبيعات*");
  lines.push(`• قيمة مبيعات اليوم: ${_money(salesValue)}`);
  lines.push(`• قطع مباعة: ${_fmt(salesQty)}`);
  lines.push(`• فواتير: ${todayInvs.length}`);
  /* Top 3 customers by value */
  const top = Object.entries(byCustomer)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);
  if (top.length > 0) {
    lines.push("• أكثر العملاء:");
    top.forEach(c => lines.push(`   ◦ ${c.name}: ${_money(c.value)} (${_fmt(c.qty)} قطعة)`));
  }
  return lines.join("\n");
}

/* ── 2. Purchases section ── */
function _purchasesSection(data, date) {
  const lines = [];
  const todayReceipts = _dayItems(data.purchaseReceipts, date);
  const todayInvs = _dayItems(data.purchaseInvoices, date);
  let totalValue = 0;
  todayInvs.forEach(i => { totalValue += Number(i.total) || 0; });
  lines.push("🛒 *المشتريات*");
  lines.push(`• قيمة مشتريات اليوم: ${_money(totalValue)}`);
  lines.push(`• فواتير: ${todayInvs.length} • إذونات: ${todayReceipts.length}`);
  return lines.join("\n");
}

/* ── 3. Treasury section ──
   V19.70 FIX: pre-V19.70 we queried data.custPayments / wsPayments / supplierPayments
   / hrLog separately with a `_dayItems(date)` filter. That under-counted because:
     1. Some movements live in `data.treasury` only (manual cash entries, internal
        transfers between accounts, opening balance corrections, etc.)
     2. Some payment records have a date/createdAt mismatch with the actual
        treasury transaction date (e.g. payment recorded today but the treasury
        row has the bank value-date)
     3. The MEANING of "today's movements" the user wants is "what hit the
        treasury today" — which IS data.treasury filtered by date.
   New approach: iterate data.treasury directly (single source of truth) and
   group by category. The report shows EVERY category that had movement today
   instead of fixed cash/transfer/checks columns. */
function _treasurySection(data, date) {
  const lines = [];

  /* 1. Today's treasury movements grouped by category */
  const todayTx = _dayItems(data.treasury, date);
  const inByCategory = {};/* {category: {total, count}} */
  const outByCategory = {};
  let totalIn = 0, totalOut = 0;
  todayTx.forEach(t => {
    const amt = Number(t.amount) || 0;
    if (amt <= 0) return;
    const cat = (t.category || "").trim() ||
      (t.type === "in" ? "إيراد عام" : t.type === "out" ? "مصروف عام" : "غير مصنف");
    if (t.type === "in") {
      totalIn += amt;
      if (!inByCategory[cat]) inByCategory[cat] = { total: 0, count: 0 };
      inByCategory[cat].total += amt;
      inByCategory[cat].count++;
    } else if (t.type === "out") {
      totalOut += amt;
      if (!outByCategory[cat]) outByCategory[cat] = { total: 0, count: 0 };
      outByCategory[cat].total += amt;
      outByCategory[cat].count++;
    }
  });

  /* 2. Current balance per treasury account */
  const balByAcct = {};
  (data.treasury || []).forEach(t => {
    const acct = (t.account || "").trim() || "غير محدد";
    if (!balByAcct[acct]) balByAcct[acct] = 0;
    if (t.type === "in") balByAcct[acct] += Number(t.amount) || 0;
    else if (t.type === "out") balByAcct[acct] -= Number(t.amount) || 0;
  });

  /* Build message */
  lines.push("💵 *الخزنة*");

  /* Incoming */
  if (totalIn > 0 || Object.keys(inByCategory).length > 0) {
    lines.push("");
    lines.push(`• *محصّلات اليوم:* ${_money(totalIn)}`);
    /* Sort categories by total desc */
    Object.entries(inByCategory)
      .sort((a, b) => b[1].total - a[1].total)
      .forEach(([cat, v]) => {
        const cnt = v.count > 1 ? ` (${v.count} عمليات)` : "";
        lines.push(`   ◦ ${cat}: ${_money(v.total)}${cnt}`);
      });
  } else {
    lines.push("");
    lines.push("• *محصّلات اليوم:* لا يوجد");
  }

  /* Outgoing */
  if (totalOut > 0 || Object.keys(outByCategory).length > 0) {
    lines.push("");
    lines.push(`• *مدفوعات اليوم:* ${_money(totalOut)}`);
    Object.entries(outByCategory)
      .sort((a, b) => b[1].total - a[1].total)
      .forEach(([cat, v]) => {
        const cnt = v.count > 1 ? ` (${v.count} عمليات)` : "";
        lines.push(`   ◦ ${cat}: ${_money(v.total)}${cnt}`);
      });
  } else {
    lines.push("");
    lines.push("• *مدفوعات اليوم:* لا يوجد");
  }

  /* Net of the day */
  const net = totalIn - totalOut;
  if (totalIn > 0 || totalOut > 0) {
    const arrow = net > 0 ? "▲" : net < 0 ? "▼" : "—";
    lines.push("");
    lines.push(`• *صافي اليوم:* ${arrow} ${_money(Math.abs(net))}`);
  }

  /* Current balances */
  const accts = Object.entries(balByAcct).filter(([, v]) => Math.abs(v) > 1);
  if (accts.length > 0) {
    lines.push("");
    lines.push("• *أرصدة الخزنة الحالية:*");
    accts.sort((a, b) => b[1] - a[1]).forEach(([n, v]) =>
      lines.push(`   ◦ ${n}: ${_money(v)}`)
    );
    const totalBal = accts.reduce((s, [, v]) => s + v, 0);
    if (accts.length > 1) {
      lines.push(`   ◦ *الإجمالي: ${_money(totalBal)}*`);
    }
  }
  return lines.join("\n");
}

/* ── 4. Production section ── */
function _productionSection(data, date) {
  const lines = [];
  const orders = data.orders || [];
  /* Delivered today (any customerDelivery.date === date) */
  let deliveredToday = 0;
  orders.forEach(o => {
    (o.customerDeliveries || []).forEach(d => {
      if (String(d.date || "").slice(0, 10) === date) deliveredToday += Number(d.qty) || 0;
    });
  });
  /* Late orders: not finalized + last activity > 7 days ago */
  const today = date;
  const lateOrders = orders.filter(o => {
    if (o.status === "تم التسليم لمخزن الجاهز") return false;
    let last = String(o.date || "").slice(0, 10);
    (o.workshopDeliveries || []).forEach(wd => {
      if (wd.date > last) last = wd.date;
      (wd.receives || []).forEach(r => { if (r.date > last) last = r.date; });
    });
    (o.customerDeliveries || []).forEach(d => { if (d.date > last) last = d.date; });
    return _daysBetween(last, today) > 7;
  });
  /* Workshops delayed: deliveries pending receive for > 7 days */
  const wsDelayed = {};
  orders.forEach(o => {
    (o.workshopDeliveries || []).forEach(wd => {
      const recvQty = (wd.receives || []).reduce((s, r) => s + (Number(r.qty) || 0), 0);
      const pending = (Number(wd.qty) || 0) - recvQty;
      if (pending > 0 && _daysBetween(wd.date, today) > 7) {
        const k = wd.wsName || "—";
        if (!wsDelayed[k]) wsDelayed[k] = { pieces: 0, days: 0 };
        wsDelayed[k].pieces += pending;
        wsDelayed[k].days = Math.max(wsDelayed[k].days, _daysBetween(wd.date, today));
      }
    });
  });

  lines.push("🏭 *التشغيل*");
  lines.push(`• تسليم العملاء اليوم: ${_fmt(deliveredToday)} قطعة`);
  lines.push(`• أوردرات متأخرة (>7 أيام): ${lateOrders.length}`);
  if (lateOrders.length > 0 && lateOrders.length <= 5) {
    lateOrders.slice(0, 5).forEach(o => lines.push(`   ◦ ${o.modelNo || o.id}`));
  } else if (lateOrders.length > 5) {
    lateOrders.slice(0, 3).forEach(o => lines.push(`   ◦ ${o.modelNo || o.id}`));
    lines.push(`   ◦ ...و ${lateOrders.length - 3} غيرهم`);
  }
  const wsList = Object.entries(wsDelayed);
  if (wsList.length > 0) {
    lines.push(`• ورش متأخرة:`);
    wsList.slice(0, 5).forEach(([n, v]) => lines.push(`   ◦ ${n}: ${_fmt(v.pieces)} قطعة (${v.days} يوم)`));
  }
  return lines.join("\n");
}

/* ── 5. Alerts section ── */
function _alertsSection(data, date, opts) {
  const lines = [];
  const today = date;
  /* Checks due in next 7 days */
  const dueChecks = (data.checks || []).filter(c => {
    if (c.status === "محصل" || c.status === "مرتد" || c.status === "ملغي") return false;
    const due = String(c.dueDate || c.date || "").slice(0, 10);
    if (!due) return false;
    const days = _daysBetween(today, due);
    return days >= 0 && days <= 7;
  });

  /* Customers with balance > minBalance and no payment for > minDaysNoPay days.
     Compute balance per customer from their deliveries minus payments. */
  const minBalance = Number(opts?.minBalance) || 5000;
  const minDaysNoPay = Number(opts?.minDaysNoPay) || 30;
  const custBalances = {};/* custId → { balance, lastPay } */
  (data.orders || []).forEach(o => {
    (o.customerDeliveries || []).forEach(d => {
      if (!d.custId) return;
      if (!custBalances[d.custId]) custBalances[d.custId] = { balance: 0, lastPay: "" };
      const price = Number(d.price) || Number(o.sellPrice) || 0;
      custBalances[d.custId].balance += (Number(d.qty) || 0) * price;
    });
    (o.customerReturns || []).forEach(r => {
      if (!r.custId) return;
      if (!custBalances[r.custId]) custBalances[r.custId] = { balance: 0, lastPay: "" };
      const price = Number(r.price) || Number(o.sellPrice) || 0;
      custBalances[r.custId].balance -= (Number(r.qty) || 0) * price;
    });
  });
  (data.custPayments || []).forEach(p => {
    if (!p.custId) return;
    if (!custBalances[p.custId]) custBalances[p.custId] = { balance: 0, lastPay: "" };
    custBalances[p.custId].balance -= Number(p.amount) || 0;
    const pd = String(p.date || "").slice(0, 10);
    if (pd > custBalances[p.custId].lastPay) custBalances[p.custId].lastPay = pd;
  });
  const stalledCustomers = [];
  (data.customers || []).forEach(c => {
    const b = custBalances[c.id];
    if (!b) return;
    if (b.balance < minBalance) return;
    const daysSincePay = b.lastPay ? _daysBetween(b.lastPay, today) : 9999;
    if (daysSincePay >= minDaysNoPay) {
      stalledCustomers.push({ name: c.name, balance: b.balance, days: daysSincePay });
    }
  });
  stalledCustomers.sort((a, b) => b.balance - a.balance);

  lines.push("⚠️ *تحذيرات*");
  lines.push(`• شيكات تستحق خلال 7 أيام: ${dueChecks.length}`);
  if (dueChecks.length > 0 && dueChecks.length <= 5) {
    dueChecks.forEach(c => lines.push(`   ◦ ${_money(c.amount)} — ${c.dueDate || c.date}`));
  } else if (dueChecks.length > 5) {
    const sumAmt = dueChecks.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    lines.push(`   ◦ إجمالي القيمة: ${_money(sumAmt)}`);
  }
  if (stalledCustomers.length > 0) {
    lines.push(`• عملاء متأخرين على الدفع (رصيد>${_money(minBalance)} و >${minDaysNoPay} يوم):`);
    stalledCustomers.slice(0, 5).forEach(c =>
      lines.push(`   ◦ ${c.name}: ${_money(c.balance)} (${c.days} يوم)`)
    );
    if (stalledCustomers.length > 5) lines.push(`   ◦ ...و ${stalledCustomers.length - 5} غيرهم`);
  }
  return lines.join("\n");
}

/* ── 6. Tasks section ── */
function _tasksSection(data) {
  const lines = [];
  const tasks = (data.tasks || []).filter(t => !t.done);
  /* Group by toEmail */
  const byUser = {};
  tasks.forEach(t => {
    const u = t.toEmail || t.toName || "غير محدد";
    if (!byUser[u]) byUser[u] = 0;
    byUser[u]++;
  });
  lines.push("📋 *المهام المعلقة*");
  lines.push(`• إجمالي مهام مفتوحة: ${tasks.length}`);
  const sorted = Object.entries(byUser).sort((a, b) => b[1] - a[1]).slice(0, 5);
  sorted.forEach(([u, n]) => lines.push(`   ◦ ${u}: ${n}`));
  return lines.join("\n");
}

/* ── 7. Comparison section (today vs same day last week) ── */
function _comparisonSection(data, date) {
  const today = _toDate(date);
  const lastWeek = new Date(today.getTime() - 7 * 86400000)
    .toISOString().slice(0, 10);
  /* Sum sales value for both days */
  const sumSales = (d) => {
    let v = 0;
    (data.orders || []).forEach(o => {
      (o.customerDeliveries || []).forEach(del => {
        if (String(del.date || "").slice(0, 10) !== d) return;
        const price = Number(del.price) || Number(o.sellPrice) || 0;
        v += (Number(del.qty) || 0) * price;
      });
    });
    return v;
  };
  const todayV = sumSales(date);
  const weekAgoV = sumSales(lastWeek);
  const diff = todayV - weekAgoV;
  const pct = weekAgoV > 0 ? Math.round((diff / weekAgoV) * 100) : null;
  const arrow = diff > 0 ? "▲" : diff < 0 ? "▼" : "—";
  return [
    "📊 *مقارنة*",
    `• مبيعات اليوم: ${_money(todayV)}`,
    `• نفس اليوم الأسبوع اللي فات: ${_money(weekAgoV)}`,
    `• الفرق: ${arrow} ${_money(Math.abs(diff))}${pct !== null ? ` (${pct >= 0 ? "+" : ""}${pct}%)` : ""}`,
  ].join("\n");
}

/* ── Main builder ── */
export function buildDailyReport(data, opts) {
  const config = opts?.config || {};
  const sections = config.sections || {
    sales: true, purchases: true, treasury: true,
    production: true, alerts: true, tasks: true, comparison: false,
  };
  const date = opts?.date || new Date().toISOString().slice(0, 10);
  const factoryName = (data.factoryName || "CLARK Factory");

  const parts = [];
  /* Header */
  const dateLabel = new Date(date + "T12:00:00").toLocaleDateString("ar-EG", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  parts.push(`🏭 *${factoryName} — التقرير اليومي*`);
  parts.push(`📅 ${dateLabel}`);
  parts.push("━━━━━━━━━━━━━━━━━━━━");

  if (sections.sales)      parts.push(_salesSection(data, date));
  if (sections.purchases)  parts.push(_purchasesSection(data, date));
  if (sections.treasury)   parts.push(_treasurySection(data, date));
  if (sections.production) parts.push(_productionSection(data, date));
  if (sections.alerts)     parts.push(_alertsSection(data, date, config.alertThresholds));
  if (sections.tasks)      parts.push(_tasksSection(data));
  if (sections.comparison) parts.push(_comparisonSection(data, date));

  parts.push("━━━━━━━━━━━━━━━━━━━━");
  parts.push("🤖 _تم الإرسال تلقائياً من نظام CLARK_");

  return {
    date,
    text: parts.join("\n\n"),
    sectionsIncluded: Object.entries(sections).filter(([, v]) => v).map(([k]) => k),
  };
}

/* Default config object — used when initializing data.automation. */
export const DEFAULT_AUTOMATION_CONFIG = {
  recipients: [],/* [{name, phone, subscribedReports: ["dailyReport"]}] */
  dailyReport: {
    enabled: false,
    time: "08:00",/* HH:MM 24h, factory local time */
    sections: {
      sales: true, purchases: true, treasury: true,
      production: true, alerts: true, tasks: true, comparison: true,
    },
    alertThresholds: {
      minBalance: 5000,/* customer balance threshold */
      minDaysNoPay: 30,/* days since last payment */
    },
    lastSentAt: null,/* ISO timestamp of last successful send */
  },
  history: [],/* [{at, type, recipientCount, success, failed, error}] last 50 */
};
