/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · Season Closing Snapshot (Phase 1 — V21.21.62)
   ───────────────────────────────────────────────────────────────────────
   «كشف إقفال الموسم» — لقطة شاملة للمركز المالي/التشغيلي عند إقفال موسم
   (= سنة مالية، علاقة 1:1 حسب قرار Ahmed). الكشف ده هو نفسه:
     • كشف إقفال الموسم القديم، و
     • أساس الأرصدة الافتتاحية للموسم الجديد.

   التصميم — لماذا (ROOT CAUSE / مبدأ):
   ─────────────────────────────────────
   1. **دالة نقية صفر mutation.** بتقرأ `data` الحيّة فقط وبترجّع object. مفيش
      أي كتابة في Firestore هنا (الكتابة بتتعمل في مرحلة لاحقة بـ upConfig).
      كده الكشف يتعرض/يتطبع بأمان تام قبل أي إقفال فعلي.

   2. **بنعيد استخدام `computeDashboardKpis` بدل ما نلوب على آلاف العملاء/
      الموردين تاني.** بعد استيراد V21.21.61 (آلاف الجهات) أي لوب O(N×M) جديد
      هيكون بطيء. `computeDashboardKpis` بيعمل التمريرة دي مرة واحدة وبيدي نفس
      الأرقام اللي المستخدم شايفها في لوحة التحكم (مصدر حقيقة واحد — مفيش
      تعارض بين الكشف واللوحة).

   3. **النقدية لكل خزنة** بتتحسب بنفس منطق `TreasuryPg.accBalances`
      (مدين = حركات "in"، دائن = حركات "out"، مجمّعة بـ `t.account`). `data.
      treasury` بيكون مدموج من `treasuryDays/*` وقت تحميل الـ split.

   ملاحظة عن النطاق: الكشف بيقرأ `data.orders` (= أوامر الموسم النشط المُحمَّلة)
   فهو دقيق للموسم النشط الجاري إقفاله. أرقام الأرصدة (نقدية/ذمم/مخزون) لحظية
   تراكمية «حتى asOfDate» — وده الصحيح للمركز المالي.

   Public API:
     buildTreasuryBalances(data)               → { rows:[{name,type,balance,inflow,outflow}], total }
     buildOpenOrders(data)                     → [{id,modelNo,...,status}]
     buildSeasonClosingSnapshot(data, opts)    → snapshot object (للعرض/التخزين)
     summarizeSnapshotForRecord(snapshot)      → نسخة مصغّرة (بدون تفاصيل) للحفظ في config
   ═══════════════════════════════════════════════════════════════════════ */

import { r2 } from "../format.js";
import { computeDashboardKpis } from "../dashboardKpis.js";
import { calcOrder, getConfirmedStock } from "../orders.js";

/* ─── النقدية لكل حساب خزنة ─── */
/* نفس دلالة TreasuryPg: رصيد الحساب = Σ(in) − Σ(out) لكل t.account.
   الحساب الافتراضي لأي حركة بدون account = "MAIN CASH" (متوافق مع التطبيق). */
export function buildTreasuryBalances(data){
  const d = data || {};
  const bal = {}; /* name → {in, out, type} */
  /* ابدأ بكل الخزن المعرّفة (عشان تظهر حتى لو رصيدها صفر) */
  (Array.isArray(d.treasuryAccounts) ? d.treasuryAccounts : []).forEach(a => {
    const name = (a && typeof a === "object") ? a.name : (typeof a === "string" ? a : "");
    if(!name) return;
    bal[name] = { in: 0, out: 0, type: (a && a.type) || "cash" };
  });
  (Array.isArray(d.treasury) ? d.treasury : []).forEach(t => {
    if(!t) return;
    const acc = t.account || "MAIN CASH";
    if(!bal[acc]) bal[acc] = { in: 0, out: 0, type: "cash" };
    const amt = Number(t.amount) || 0;
    if(t.type === "in") bal[acc].in += amt;
    else if(t.type === "out") bal[acc].out += amt;
  });
  const rows = Object.entries(bal).map(([name, v]) => ({
    name, type: v.type,
    balance: r2(v.in - v.out),
    inflow: r2(v.in),
    outflow: r2(v.out),
  }))
  /* أخفِ الخزن الفاضية تماماً (صفر حركة) من الكشف لتقليل الضوضاء */
  .filter(r => r.balance !== 0 || r.inflow !== 0 || r.outflow !== 0)
  .sort((a, b) => b.balance - a.balance);
  const total = r2(rows.reduce((s, r) => s + r.balance, 0));
  return { rows, total };
}

/* ─── الأوامر المفتوحة (شغل تحت التنفيذ + مخزون جاهز غير مُسلَّم) ─── */
/* «مفتوح» = أمر مش مقفول بالكامل: لسه في إنتاج (تسليمات pending أو المؤكَّد أقل
   من المقصوص) أو فيه مخزون جاهز متاح لم يُسلَّم بعد. ده اللي بيترحّل للموسم
   الجديد. (الترحيل الفعلي = Phase 2 — هنا عرض/وعي فقط.) */
export function buildOpenOrders(data){
  const d = data || {};
  const orders = Array.isArray(d.orders) ? d.orders : [];
  const out = [];
  orders.forEach(o => {
    if(!o || o.cancelled || o.status === "cancelled") return;
    let cut = 0;
    try { cut = Number(calcOrder(o).cutQty) || 0; } catch(_) {}
    const confirmed = getConfirmedStock(o);
    const pending = (o.deliveries || [])
      .filter(x => x && x.status === "pending")
      .reduce((s, x) => s + (Number(x.qty) || 0), 0);
    const delivered = (o.customerDeliveries || []).reduce((s, x) => s + (Number(x.qty) || 0), 0);
    const returned = (o.customerReturns || []).reduce((s, x) => s + (Number(x.qty) || 0), 0);
    const avail = Math.max(0, confirmed - delivered + returned);
    const inProduction = pending > 0 || confirmed < cut;
    const undelivered = avail > 0;
    if(!inProduction && !undelivered) return; /* مقفول بالكامل — تخطَّاه */
    out.push({
      id: o.id,
      modelNo: o.modelNo || "—",
      modelDesc: o.modelDesc || "",
      customer: o.customerName || o.custName || o.customer || "",
      ordered: cut,
      confirmed,
      delivered,
      avail,
      pending,
      status: inProduction ? "production" : "stock",
    });
  });
  /* الأكثر أولوية أولاً: تحت التنفيذ قبل المخزون، والأكبر كمية أولاً */
  out.sort((a, b) => {
    if(a.status !== b.status) return a.status === "production" ? -1 : 1;
    return (b.ordered || 0) - (a.ordered || 0);
  });
  return out;
}

/* ─── اللقطة الكاملة ─── */
export function buildSeasonClosingSnapshot(data, opts){
  const d = data || {};
  const o = opts || {};
  const seasonId = o.seasonId || d.activeSeason || "";
  const asOfDate = o.asOfDate || new Date().toISOString().slice(0, 10);

  const kpis = computeDashboardKpis(d);
  const cash = buildTreasuryBalances(d);
  const openOrders = buildOpenOrders(d);

  /* المركز المالي المبسّط (تجاري — مش قائمة مركز محاسبية كاملة):
       الأصول  = نقدية + ذمم عملاء + مخزون بالتكلفة
       الخصوم  = ذمم موردين (دائنة)
       صافي الثروة = الأصول − الخصوم  (≈ حقوق الملكية التشغيلية) */
  const arTotal = r2(kpis.sales.balance);            /* رصيد العملاء (مدين) */
  const apTotal = r2(kpis.purchases.payable);        /* رصيد الموردين (دائن) */
  const invTotal = r2(kpis.inventory.total);
  const totalAssets = r2(cash.total + arTotal + invTotal);
  const totalLiabilities = apTotal;
  const netWorth = r2(totalAssets - totalLiabilities);

  return {
    /* تعريف */
    seasonId,
    label: o.label || seasonId,
    fromDate: o.fromDate || null,
    toDate: o.toDate || asOfDate,
    asOfDate,
    generatedAt: new Date().toISOString(),

    /* أرصدة المركز */
    cash: { total: cash.total, accounts: cash.rows },
    receivables: { total: arTotal, detail: kpis.sales.detail || [] },
    payables: { total: apTotal, detail: kpis.purchases.detail || [] },
    inventory: kpis.inventory, /* finished/fabric/accessory/other/total + *Detail */

    /* تدفقات الموسم (تراكمية حتى asOfDate) */
    sales: { total: r2(kpis.sales.total), returns: r2(kpis.sales.returns), net: r2(kpis.sales.net) },
    purchases: { total: r2(kpis.purchases.total), returns: r2(kpis.purchases.returns), net: r2(kpis.purchases.net) },
    profit: kpis.profit, /* grossProfit / cogs / opex / netProfit / tradingProfit */

    /* المركز المجمّع */
    position: { totalAssets, totalLiabilities, netWorth },

    /* ملخص تشغيلي */
    ordersCount: Array.isArray(d.orders) ? d.orders.length : 0,
    openOrders,
    openOrdersCount: openOrders.length,
  };
}

/* ─── نسخة مصغّرة للحفظ في config (بدون مصفوفات التفاصيل لتفادي تضخّم 1MB) ─── */
/* القاعدة (§10 anti-pattern): مفيش مصفوفات per-party في config. بنحفظ
   الإجماليات + نقدية لكل خزنة (محدودة) + ملخص. التفاصيل تتعرض حيّة وقت العرض. */
export function summarizeSnapshotForRecord(snapshot){
  const s = snapshot || {};
  return {
    seasonId: s.seasonId || "",
    label: s.label || s.seasonId || "",
    fromDate: s.fromDate || null,
    toDate: s.toDate || null,
    asOfDate: s.asOfDate || null,
    generatedAt: s.generatedAt || new Date().toISOString(),
    cashTotal: r2(s.cash?.total),
    cashAccounts: (s.cash?.accounts || []).map(a => ({ name: a.name, type: a.type, balance: r2(a.balance) })),
    arTotal: r2(s.receivables?.total),
    apTotal: r2(s.payables?.total),
    inventory: {
      finished: r2(s.inventory?.finished),
      fabric: r2(s.inventory?.fabric),
      accessory: r2(s.inventory?.accessory),
      other: r2(s.inventory?.other),
      total: r2(s.inventory?.total),
    },
    salesNet: r2(s.sales?.net),
    purchasesNet: r2(s.purchases?.net),
    grossProfit: r2(s.profit?.grossProfit),
    netProfit: r2(s.profit?.netProfit),
    position: {
      totalAssets: r2(s.position?.totalAssets),
      totalLiabilities: r2(s.position?.totalLiabilities),
      netWorth: r2(s.position?.netWorth),
    },
    ordersCount: s.ordersCount || 0,
    openOrdersCount: s.openOrdersCount || 0,
  };
}
