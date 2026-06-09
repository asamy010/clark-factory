/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Dashboard KPIs (V21.21.17)
   ───────────────────────────────────────────────────────────────────────
   مؤشرات لوحة التحكم: مبيعات/مشتريات/مخزون/ربح — pure، صفر mutation.
   بيعيد استخدام computeSalesOverviewTotals + buildCustomer/SupplierSummary +
   calcOrder (تكلفة الوحدة) + getConfirmedStock (المتاح الجاهز).

   ─── معادلة الربح (مجمل الربح التجاري — Trading / Gross Profit) ───
     الربح = المبيعات الفعلية − المشتريات الفعلية + إجمالي تقييم المخزون
     = (مبيعات − مرتجع مبيعات) − (مشتريات − مرتجع مشتريات) + (جاهز + خامات بالتكلفة)

   اشتقاقها: الربح = صافي المبيعات − تكلفة المبيعات (COGS)، و
     COGS = صافي المشتريات − تقييم المخزون الختامي (المخزون الافتتاحي = 0 من
     بداية النظام، تراكمي «حتى هذا الوقت»). فالمخزون اللي لسه عندك (بالتكلفة)
     مايتحسبش خسارة — اتدفع تمنه في المشتريات بس لسه أصل.
     ⚠️ ده مجمل الربح من النشاط التجاري — مش متضمّن المصروفات التشغيلية
     (إيجار/رواتب/مصاريف الخزنة). للربح الصافي راجع المحاسبة/قائمة الدخل.
   ═══════════════════════════════════════════════════════════════════════ */

import { r2 } from "./format.js";
import { computeSalesOverviewTotals, buildCustomerSummary, buildSupplierSummary } from "./accountSummary.js";
import { calcOrder, getConfirmedStock } from "./orders.js";
import { getCategoryById } from "./categories.js";

export function computeDashboardKpis(data){
  const d = data || {};

  /* ── المبيعات ── */
  const s = computeSalesOverviewTotals(d);
  const salesTotal = r2(s.totalSales);
  const salesReturns = r2(s.totalReturns);
  const salesNet = r2(salesTotal - salesReturns);
  const custBalance = r2(s.totalBalance);
  const salesDetail = (d.customers || []).map(c => {
    const cs = buildCustomerSummary(c.id, d);
    const sales = r2((cs.salesNet || 0) + (cs.salesOrdersNet || 0));
    const returns = r2(cs.returnsNet || 0);
    const paid = r2((cs.payCash || 0) + (cs.payCheck || 0) + (cs.payOther || 0));
    return { name: c.name || "—", sales, returns, net: r2(sales - returns), paid, balance: r2(cs.balance || 0) };
  }).filter(x => x.sales || x.returns || x.paid || x.balance).sort((a, b) => b.net - a.net);

  /* ── المشتريات ── */
  const receipts = d.purchaseReceipts || [], dnotes = d.purchaseDebitNotes || [];
  const buyTotal = r2(receipts.reduce((acc, r) => acc + (Number(r.totalAmount) || 0), 0));
  const buyReturns = r2(dnotes.filter(x => x && x.status !== "void").reduce((acc, x) => acc + (Number(x.total) || 0), 0));
  const buyNet = r2(buyTotal - buyReturns);
  const supDetail = (d.suppliers || []).map(sup => {
    const ss = buildSupplierSummary(sup.id, d);
    return { name: sup.name || "—", purchases: r2(ss.totalInvoiced || 0), paid: r2(ss.totalPaid || 0), balance: r2(ss.balance || 0) };
  }).filter(x => x.purchases || x.paid || x.balance).sort((a, b) => b.balance - a.balance);
  const payable = r2(supDetail.reduce((acc, x) => acc + (x.balance > 0 ? x.balance : 0), 0));

  /* ── تقييم المخزون (بالتكلفة) ── */
  /* الجاهز: المتاح لكل أوردر × تكلفة الوحدة (نفس منطق InventoryValuationReport) */
  const soReserved = {};
  (d.salesOrders || []).forEach(so => {
    if(!so || so.status === "cancelled" || so.sourceDistributionId) return;
    (so.items || []).forEach(it => { if(it && it.sourceType === "order" && it.sourceId) soReserved[it.sourceId] = (soReserved[it.sourceId] || 0) + (Number(it.qty) || 0); });
  });
  let finishedVal = 0; const finishedDetail = [];
  (d.orders || []).forEach(o => {
    const sd = getConfirmedStock(o); if(sd <= 0) return;
    const cd = (o.customerDeliveries || []).reduce((a, x) => a + (Number(x.qty) || 0), 0);
    const ret = (o.customerReturns || []).reduce((a, x) => a + (Number(x.qty) || 0), 0);
    const avail = Math.max(0, sd - (cd - ret + (soReserved[o.id] || 0)));
    if(avail <= 0) return;
    let cost = 0; try { cost = Number(calcOrder(o).costPer) || 0; } catch(_) {}
    const val = r2(avail * cost);
    finishedVal += val;
    finishedDetail.push({ name: (o.modelNo || "—") + (o.modelDesc ? " — " + o.modelDesc : ""), qty: avail, unitCost: r2(cost), value: val });
  });
  finishedVal = r2(finishedVal);
  finishedDetail.sort((a, b) => b.value - a.value);

  /* الخامات/الإكسسوار: المخزون × متوسط التكلفة (legacy + أصناف المخازن المخصصة) */
  const fabricDetail = [], accessoryDetail = [], otherDetail = [];
  let fabricVal = 0, accessoryVal = 0, otherVal = 0;
  (d.fabrics || []).forEach(f => { const q = Number(f.stock) || 0; if(!q) return; const uc = Number(f.avgCost) || Number(f.price) || 0; const v = r2(q * uc); fabricVal += v; fabricDetail.push({ name: f.name || "—", qty: q, unitCost: r2(uc), value: v }); });
  (d.accessories || []).forEach(a => { const q = Number(a.stock) || 0; if(!q) return; const uc = Number(a.avgCost) || Number(a.price) || 0; const v = r2(q * uc); accessoryVal += v; accessoryDetail.push({ name: a.name || "—", qty: q, unitCost: r2(uc), value: v }); });
  (d.inventoryItems || []).forEach(it => {
    const q = Number(it.stock) || 0; if(!q) return;
    const uc = Number(it.avgCost) || Number(it.price) || 0; const v = r2(q * uc);
    const cat = getCategoryById(d, it.categoryId); const lg = cat ? cat.legacy : null;
    if(lg === "fabric"){ fabricVal += v; fabricDetail.push({ name: it.name || "—", qty: q, unitCost: r2(uc), value: v }); }
    else if(lg === "accessory"){ accessoryVal += v; accessoryDetail.push({ name: it.name || "—", qty: q, unitCost: r2(uc), value: v }); }
    else { otherVal += v; otherDetail.push({ name: (it.name || "—") + (cat ? " (" + cat.name + ")" : ""), qty: q, unitCost: r2(uc), value: v }); }
  });
  fabricVal = r2(fabricVal); accessoryVal = r2(accessoryVal); otherVal = r2(otherVal);
  fabricDetail.sort((a, b) => b.value - a.value); accessoryDetail.sort((a, b) => b.value - a.value);
  const inventoryTotal = r2(finishedVal + fabricVal + accessoryVal + otherVal);

  /* ── الربح/الخسارة (مجمل الربح التجاري) ── */
  const profit = r2(salesNet - buyNet + inventoryTotal);

  return {
    sales: { total: salesTotal, returns: salesReturns, net: salesNet, balance: custBalance, detail: salesDetail },
    purchases: { total: buyTotal, returns: buyReturns, net: buyNet, payable, detail: supDetail },
    inventory: { finished: finishedVal, fabric: fabricVal, accessory: accessoryVal, other: otherVal, total: inventoryTotal, finishedDetail, fabricDetail, accessoryDetail, otherDetail },
    profit: { value: profit, salesNet, buyNet, inventoryTotal },
  };
}
