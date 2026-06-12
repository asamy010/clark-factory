/* ═══════════════════════════════════════════════════════════════════════
   CLARK · partnerPortal (V21.21.69)
   ───────────────────────────────────────────────────────────────────────
   طبقة بيانات بورتال الشريك — مصدر الحقيقة الموحّد مع لوحة التحكم.

   الفكرة الأساسية: computeDashboardKpis(data) بيحسب «كل شيء زي الداش بورد»
   أصلاً — المبيعات/المرتجعات/الرصيد + المشتريات/المورّدين + تقييم المخزون +
   الربح، **وكمان** القوايم المفصّلة (sales.detail = العملاء عليهم لينا،
   purchases.detail = علينا للموردين بالأسماء). فبورتال الشريك = نفس الحساب
   مُقسَّماً حسب إعدادات العرض (visibility) + تصنيف حالة الأوامر.

   pure (browser refs كلها جوّا دوال الـ deps) → آمن في الـ serverless bundle
   (computeDashboardKpis → accountSummary + orders + format، كلهم نقيّون).
   ═══════════════════════════════════════════════════════════════════════ */

import { computeDashboardKpis } from "./dashboardKpis.js";
import { calcOrder, getConfirmedStock } from "./orders.js";

/* مفاتيح العرض القابلة للتحكّم — المالك يقرر إيه يتعرض للشريك. */
export const PARTNER_TOGGLES = [
  "sales",        /* المبيعات (إجمالي/مرتجعات/صافي + التحصيلات + رصيد العملاء) */
  "purchases",    /* المشتريات (إجمالي/مرتجعات/صافي + المستحق للموردين) */
  "inventory",    /* تقييم المخزون (جاهز/خامات/إكسسوار/أخرى) */
  "profit",       /* الربح (مجمل/صافي/COGS) — حسّاس */
  "orders",       /* حالة الأوامر + معدل الإنجاز */
  "receivables",  /* تفصيل العملاء (عليهم لينا) بالأسماء */
  "payables",     /* تفصيل الموردين (علينا ليهم) بالأسماء */
];

export const PARTNER_TOGGLE_LABELS = {
  sales: "المبيعات والتحصيلات",
  purchases: "المشتريات",
  inventory: "تقييم المخزون",
  profit: "الأرباح",
  orders: "حالة الأوامر والإنجاز",
  receivables: "تفصيل أرصدة العملاء (عليهم لينا)",
  payables: "تفصيل أرصدة الموردين (علينا ليهم)",
};

/* افتراضياً كله ظاهر — الشريك شريك في المصنع. */
export function defaultVisibility() {
  const v = {};
  PARTNER_TOGGLES.forEach(k => { v[k] = true; });
  return v;
}

/* تصنيف حالة الأوامر (الموسم النشط): تحت التشغيل / مكتملة + معدل الإنجاز.
   معدل الإنجاز الإجمالي = Σ(المؤكّد المحدود بالمقصوص) / Σ(المقصوص) × 100. */
export function buildOrdersStatus(orders) {
  const list = [];
  let totalCut = 0, totalConfirmed = 0, working = 0, done = 0;
  (orders || []).forEach(o => {
    if (!o || o.cancelled || o.status === "ملغي" || o.status === "cancelled") return;
    let cut = 0;
    try { cut = Number(calcOrder(o).cutQty) || 0; } catch (_) {}
    if (cut <= 0) return; /* لسه ما اتقصّش — مش في عدّ التشغيل */
    const confirmed = getConfirmedStock(o);
    const cd = (o.customerDeliveries || []).reduce((s, d) => s + (Number(d.qty) || 0), 0);
    const ret = (o.customerReturns || []).reduce((s, r) => s + (Number(r.qty) || 0), 0);
    const delivered = cd - ret;
    totalCut += cut;
    totalConfirmed += Math.min(confirmed, cut);
    const isDone = confirmed >= cut;
    if (isDone) done++; else working++;
    list.push({
      modelNo: o.modelNo || "—",
      modelDesc: o.modelDesc || "",
      cut,
      confirmed,
      delivered,
      completion: cut > 0 ? Math.round((Math.min(confirmed, cut) / cut) * 100) : 0,
      status: isDone ? "done" : "production",
    });
  });
  list.sort((a, b) => a.completion - b.completion); /* الأقل إنجازاً أولاً */
  return {
    total: list.length,
    working,
    done,
    completionRate: totalCut > 0 ? Math.round((totalConfirmed / totalCut) * 100) : 0,
    totalCut,
    totalConfirmed,
    items: list,
  };
}

/* تجميع بورتال الشريك من نفس رياضة الداش بورد، مُقسَّماً حسب visibility.
   كل قسم بيتحسب مرة واحدة (computeDashboardKpis) وبيتعرض فقط لو مفعّل. */
export function buildPartnerPortalData(data, visibility) {
  const vis = { ...defaultVisibility(), ...(visibility || {}) };
  const k = computeDashboardKpis(data || {});
  const out = { visibility: vis };

  /* إجماليات التحصيلات والرصيد من نفس تفاصيل العملاء (مضمون التطابق). */
  const collected = (k.sales.detail || []).reduce((s, c) => s + (Number(c.paid) || 0), 0);
  const custBalance = (k.sales.detail || []).reduce((s, c) => s + (Number(c.balance) || 0), 0);

  if (vis.sales) {
    out.sales = {
      total: k.sales.total, returns: k.sales.returns, net: k.sales.net,
      collected: Math.round(collected), balance: Math.round(custBalance),
    };
  }
  if (vis.purchases) {
    out.purchases = {
      total: k.purchases.total, returns: k.purchases.returns, net: k.purchases.net,
      payable: k.purchases.payable,
    };
  }
  if (vis.inventory) {
    out.inventory = {
      finished: k.inventory.finished, fabric: k.inventory.fabric,
      accessory: k.inventory.accessory, other: k.inventory.other, total: k.inventory.total,
    };
  }
  if (vis.profit) {
    out.profit = {
      grossProfit: k.profit.grossProfit, cogs: k.profit.cogs,
      netProfit: k.profit.netProfit, tradingProfit: k.profit.tradingProfit,
      salesNet: k.profit.salesNet, configured: k.profit.configured,
    };
  }
  if (vis.orders) {
    out.orders = buildOrdersStatus((data || {}).orders);
  }
  if (vis.receivables) {
    /* العملاء عليهم لينا — موجبي الرصيد أولاً (مرتّبين بالفعل بالصافي). */
    out.receivables = (k.sales.detail || []).map(c => ({
      name: c.name, sales: c.sales, returns: c.returns, paid: c.paid, balance: c.balance,
    }));
  }
  if (vis.payables) {
    /* علينا للموردين — مرتّبين بالرصيد تنازلياً (بالفعل في supDetail). */
    out.payables = (k.purchases.detail || []).map(s => ({
      name: s.name, purchases: s.purchases, paid: s.paid, balance: s.balance,
    }));
  }
  return out;
}
