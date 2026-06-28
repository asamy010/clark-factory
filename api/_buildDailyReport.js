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
  /* V21.21.2: أوامر البيع المباشرة (مش متولّدة من توزيعة) — كانت مش بتتعد،
     فبيع تم عبر «أوامر البيع» بدل التوزيعة كان بيظهر صفر في التقرير. المرايا
     (sourceDistributionId) بنتخطّاها لأن التوزيعة نفسها محتسبة فوق. */
  (data.salesOrders || []).forEach(so => {
    if (!so || so.status === "cancelled" || so.sourceDistributionId) return;
    if (String(so.date || "").slice(0, 10) !== date) return;
    const value = Number(so.total) || 0;
    const qty = (so.items || []).filter(it => !(it && it.isSection)).reduce((s, it) => s + (Number(it.qty) || 0), 0);
    salesQty += qty;
    salesValue += value;
    const cName = so.customerName || so.customerNameAdHoc || "—";
    if (!byCustomer[cName]) byCustomer[cName] = { qty: 0, value: 0 };
    byCustomer[cName].qty += qty;
    byCustomer[cName].value += value;
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
   V21.27.169 (طلب Ahmed): لكل خزنة — وارد اليوم / منصرف اليوم / رصيد حالي.
   الخزنة اللي رصيدها صفر متتعرضش. + سطر «إجمالي حركات المحافظ الإلكترونية».
   رصيد حالي = صافي كل الحركات حتى تاريخ التقرير شاملاً. */
function _treasurySection(data, date) {
  const lines = [];
  lines.push("💵 *الخزنة*");

  /* meta لكل حساب (النوع: cash/bank/wallet) من treasuryAccounts */
  const accMeta = {};
  (data.treasuryAccounts || []).forEach(a => {
    const nm = (typeof a === "string" ? a : (a && a.name)) || "";
    if(nm) accMeta[nm] = { type: (a && a.type) || "cash" };
  });

  /* تجميع per-account: وارد/منصرف اليوم + الرصيد الحالي حتى التاريخ */
  const acc = {};
  const ensure = (nm) => { if(!acc[nm]) acc[nm] = { totalIn: 0, totalOut: 0, closing: 0 }; return acc[nm]; };
  (data.treasury || []).forEach(t => {
    if(!t) return;
    const nm = (t.account || "").trim() || "غير محدد";
    const a = ensure(nm);
    const amt = Number(t.amount) || 0;
    const txDate = String(t.date || t.createdAt || "").slice(0, 10);
    if(txDate && txDate <= date){
      if(t.type === "in") a.closing += amt;
      else if(t.type === "out") a.closing -= amt;
    }
    if(txDate === date && amt > 0){
      if(t.type === "in") a.totalIn += amt;
      else if(t.type === "out") a.totalOut += amt;
    }
  });

  const names = Object.keys(acc);
  if(names.length === 0){ lines.push(""); lines.push("• لا توجد حسابات خزينة"); return lines.join("\n"); }

  const TYPE_ICON = { cash: "💵", bank: "🏦", wallet: "📱" };
  const TYPE_LABEL = { cash: "خزينة", bank: "بنك", wallet: "محفظة" };
  const TYPE_ORDER = { cash: 0, bank: 1, wallet: 2 };
  const typeOf = (nm) => (accMeta[nm] && accMeta[nm].type) || "cash";

  /* ترتيب: خزائن ثم بنوك ثم محافظ، وداخل كل نوع بالرصيد تنازلياً */
  const sorted = names.sort((x, y) => {
    const ox = (TYPE_ORDER[typeOf(x)] ?? 9), oy = (TYPE_ORDER[typeOf(y)] ?? 9);
    if(ox !== oy) return ox - oy;
    return acc[y].closing - acc[x].closing;
  });

  let grandClosing = 0, walletIn = 0, walletOut = 0, hasWallet = false;
  sorted.forEach(nm => {
    const a = acc[nm];
    grandClosing += a.closing;
    const type = typeOf(nm);
    if(type === "wallet"){ walletIn += a.totalIn; walletOut += a.totalOut; hasWallet = true; }
    /* الخزنة اللي رصيدها صفر متتعرضش (طلب Ahmed) */
    if(Math.round(a.closing) === 0) return;
    lines.push("");
    lines.push(`${TYPE_ICON[type] || "💵"} *${nm}* — ${TYPE_LABEL[type] || "خزينة"}`);
    lines.push(`   • وارد اليوم: ${_money(a.totalIn)}`);
    lines.push(`   • منصرف اليوم: ${_money(a.totalOut)}`);
    lines.push(`   • *رصيد حالي: ${_money(a.closing)}*`);
  });

  /* إجمالي حركات المحافظ الإلكترونية (وارد/منصرف اليوم) */
  if(hasWallet){
    lines.push("");
    lines.push(`📱 *إجمالي حركات المحافظ* — وارد: ${_money(walletIn)} · منصرف: ${_money(walletOut)}`);
  }

  lines.push("");
  lines.push(`• *إجمالي الرصيد الحالي: ${_money(grandClosing)}*`);
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
    /* V21.21.2: أوامر بيع مباشرة (غير المرايا/الملغي) */
    (data.salesOrders || []).forEach(so => {
      if (!so || so.status === "cancelled" || so.sourceDistributionId) return;
      if (String(so.date || "").slice(0, 10) === d) v += Number(so.total) || 0;
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
  /* V21.27.170: دمج فوق الافتراضيات — أي قسم مش متقفّل صراحةً (false) بيظهر.
     قبل كده لو config.sections موجود بس ناقص مفاتيح (مثلاً مفيش sales/purchases)،
     كانت بتطلع undefined → falsy → القسم يختفي. الدمج بيخلّي الناقص ياخد الافتراضي. */
  const DEFAULT_SECTIONS = {
    sales: true, purchases: true, treasury: true,
    production: true, alerts: true, tasks: true, comparison: false,
  };
  const sections = { ...DEFAULT_SECTIONS, ...(config.sections || {}) };
  const date = opts?.date || new Date().toISOString().slice(0, 10);

  const parts = [];
  /* Header — V21.27.169: العلامة «CLARK ERP System» + فاصل أقصر (ماينعملش راب) */
  const dateLabel = new Date(date + "T12:00:00").toLocaleDateString("ar-EG", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  parts.push(`🏭 *CLARK ERP System — التقرير اليومي*`);
  parts.push(`📅 ${dateLabel}`);
  parts.push("━━━━━━━━━━");

  if (sections.sales)      parts.push(_salesSection(data, date));
  if (sections.purchases)  parts.push(_purchasesSection(data, date));
  if (sections.treasury)   parts.push(_treasurySection(data, date));
  if (sections.production) parts.push(_productionSection(data, date));
  if (sections.alerts)     parts.push(_alertsSection(data, date, config.alertThresholds));
  if (sections.tasks)      parts.push(_tasksSection(data));
  if (sections.comparison) parts.push(_comparisonSection(data, date));

  parts.push("━━━━━━━━━━");
  parts.push("🤖 _تم الإرسال تلقائياً من CLARK ERP System_");

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

  /* V19.70: Event triggers — see src/utils/automation/buildDailyReport.js for full doc.
     Mirror kept here so the api/ side has access to the same defaults. */
  eventTriggers: {
    mode: "auto",
    ownerPhones: [],
    events: {
      saleCompleted: {
        enabled: false,
        recipients: { customer: true, owner: true },
        templates: {
          customer: "شكراً {customerName} 🌟\nتم تسليم {qty} قطعة من {modelNo} بقيمة {value} ج.م.\n\nراجع حسابك: {portalLink}",
          owner: "💰 *بيع جديد*\nالعميل: {customerName}\nالموديل: {modelNo}\nالكمية: {qty} قطعة\nالقيمة: {value} ج.م\nالتاريخ: {date}",
        },
        cooldownMinutes: 0,
      },
      paymentReceived: {
        enabled: false,
        recipients: { customer: true, owner: true },
        templates: {
          customer: "✅ *تم استلام دفعة*\nالقيمة: {amount} ج.م\nالطريقة: {method}\nالرصيد المتبقي: {balance} ج.م\nالتاريخ: {date}\n\nشكراً لك 🌟",
          owner: "💵 *دفعة من عميل*\n{customerName}: {amount} ج.م ({method})\nالرصيد المتبقي: {balance} ج.م",
        },
        cooldownMinutes: 0,
      },
      checkPaymentReceived: {
        enabled: false,
        recipients: { customer: true, owner: true },
        templates: {
          customer: "🏦 *تم استلام شيك* {batchInfo}\n\nالبنك: {bank}\nرقم الشيك: {checkNo}\nالقيمة: {amount} ج.م\nتاريخ الاستحقاق: {dueDate}\nالرصيد المتبقي: {balance} ج.م\n\nشكراً لك 🌟",
          owner: "🏦 *شيك من عميل* {batchInfo}\n\n{customerName} — {office}\nالبنك: {bank}\nالشيك: {checkNo}\nالقيمة: {amount} ج.م\nالاستحقاق: {dueDate}\nالرصيد المتبقي: {balance} ج.م",
        },
        cooldownMinutes: 0,
      },
      checkPaymentIssued: {
        enabled: false,
        recipients: { supplier: true, owner: true },
        templates: {
          supplier: "📤 *تم إصدار شيك* {batchInfo}\n\nالبنك: {bank}\nرقم الشيك: {checkNo}\nالقيمة: {amount} ج.م\nتاريخ الاستحقاق: {dueDate}\nالرصيد المتبقي: {balance} ج.م\n\nشكراً لتعاملكم 🌟",
          owner: "📤 *شيك لمورد* {batchInfo}\n\n{supplierName} — {office}\nالبنك: {bank}\nالشيك: {checkNo}\nالقيمة: {amount} ج.م\nالاستحقاق: {dueDate}\nالرصيد المتبقي: {balance} ج.م",
        },
        cooldownMinutes: 0,
      },
      checkCollected: {
        enabled: false,
        recipients: { customer: true, owner: true },
        templates: {
          customer: "✅ *تم تحصيل الشيك بنجاح*\n\nالبنك: {bank}\nرقم الشيك: {checkNo}\nالقيمة: {amount} ج.م\nتاريخ الشيك: {originalDate}\nتاريخ التحصيل: {collectedDate}\nالرصيد المتبقي: {balance} ج.م\n\nشكراً لتعاملكم 🌟",
          owner: "✅ *تم تحصيل شيك*\n\nالعميل: {customerName} — {office}\nالبنك: {bank}\nالشيك: {checkNo}\nالقيمة: {amount} ج.م\nتاريخ التحصيل: {collectedDate}\nالرصيد المتبقي للعميل: {balance} ج.م",
        },
        cooldownMinutes: 0,
      },
      checkEndorsed: {
        enabled: false,
        recipients: { supplier: true, owner: true },
        templates: {
          supplier: "📨 *شيك مُظهَّر إليكم*\n\nالعميل (صاحب الشيك): {customerName}\nمكتب العميل: {customerOffice}\nالبنك: {bank}\nرقم الشيك: {checkNo}\nالقيمة: {amount} ج.م\nتاريخ الاستحقاق: {dueDate}\nالرصيد المتبقي: {balance} ج.م\n\nشكراً لتعاملكم 🌟",
          owner: "📨 *تم تظهير شيك لمورد*\n\nمن العميل: {customerName} ({customerOffice})\nإلى المورد: {supplierName} ({office})\nالبنك: {bank}\nالشيك: {checkNo}\nالقيمة: {amount} ج.م\nالاستحقاق: {dueDate}\nالرصيد المتبقي للمورد: {balance} ج.م",
        },
        cooldownMinutes: 0,
      },
      checkRePresented: {
        enabled: false,
        recipients: { customer: true, owner: true },
        templates: {
          customer: "🔄 *إعادة تقديم شيك للبنك*\n\nالبنك: {bank}\nرقم الشيك: {checkNo}\nالقيمة: {amount} ج.م\nتاريخ الشيك الأصلي: {originalDate}\nتاريخ إعادة التقديم: {rePresentedDate}\nالرصيد المستحق: {balance} ج.م\n\nسيتم تحصيل الشيك مرة أخرى من البنك.",
          owner: "🔄 *إعادة تقديم شيك مرتد*\n\nالعميل: {customerName} — {office}\nالبنك: {bank}\nالشيك: {checkNo}\nالقيمة: {amount} ج.م\nتاريخ إعادة التقديم: {rePresentedDate}\nالرصيد المستحق: {balance} ج.م",
        },
        cooldownMinutes: 0,
      },
      checkBounced: {
        enabled: false,
        recipients: { customer: true, owner: true },
        templates: {
          customer: "⚠️ *شيك مرتد*\n\nالبنك: {bank}\nرقم الشيك: {checkNo}\nالقيمة: {amount} ج.م\nتاريخ الشيك: {originalDate}\nتاريخ الارتداد: {bouncedDate}\nالرصيد المستحق: {balance} ج.م\n\nيرجى التواصل معنا فوراً للسداد.",
          owner: "⚠️ *شيك مرتد من عميل*\n\nالعميل: {customerName} — {office}\nالبنك: {bank}\nالشيك: {checkNo}\nالقيمة: {amount} ج.م\nتاريخ الارتداد: {bouncedDate}\nالرصيد المستحق: {balance} ج.م",
        },
        cooldownMinutes: 0,
      },
      lateOrder: {
        enabled: false,
        thresholdDays: 7,
        recipients: { owner: true, customer: false },
        templates: {
          owner: "⚠️ *أوردر متأخر*\nالموديل: {modelNo}\nالعميل: {customerName}\nأيام بدون activity: {daysLate}\nآخر نشاط: {lastActivity}",
          customer: "نعتذر عن التأخير في تسليم الموديل {modelNo}، نحن نعمل على تسريع الإنتاج.",
        },
      },
      checkDue: {
        enabled: false,
        thresholdDays: 3,
        recipients: { owner: true, customer: false },
        templates: {
          owner: "📅 *{checkType} يستحق قريباً*\n\n👤 {partyKind}: {partyName}\n✍️ صاحب الشيك: {drawerName}\n🏢 المكتب: {office}\n🏦 البنك: {bank}\n#️⃣ رقم الشيك: {checkNo}\n💰 القيمة: {amount} ج.م\n📆 تاريخ الاستحقاق: {dueDate}\n⏱ بعد {daysToDue} يوم\n📝 {notes}",
          customer: "🔔 *تذكير: شيك يستحق الصرف قريباً*\n\nمرحباً {customerName}،\nنود تذكيركم بأن الشيك التالي مستحق الصرف من البنك خلال *{daysToDue}* يوم:\n\n✍️ صاحب الشيك: {drawerName}\n🏦 البنك: {bank}\n#️⃣ رقم الشيك: {checkNo}\n💰 القيمة: {amount} ج.م\n📆 تاريخ الاستحقاق: {dueDate}\n\n⚠️ يرجى التأكد من تغطية الشيك في الحساب البنكي قبل تاريخ الاستحقاق لتجنب ارتداد الشيك.\n\nشكراً لتعاملكم 🌟",
        },
      },
    },
    pending: [],
    eventHistory: [],
  },
};
