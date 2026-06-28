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
import { calcOrder, getConfirmedStock, orderCostPerPiece } from "./orders.js";
import { getCategoryById } from "./categories.js";
import { computeStockNetMap, netStockOf } from "./stockLedger.js";

export function computeDashboardKpis(data){
  const d = data || {};

  /* ── المبيعات ── */
  const s = computeSalesOverviewTotals(d);
  const salesTotal = r2(s.totalSales);
  const salesReturns = r2(s.totalReturns);
  const salesNet = r2(salesTotal - salesReturns);
  const salesDetail = (d.customers || []).map(c => {
    const cs = buildCustomerSummary(c.id, d);
    const sales = r2((cs.salesNet || 0) + (cs.salesOrdersNet || 0));
    const returns = r2(cs.returnsNet || 0);
    const paid = r2((cs.payCash || 0) + (cs.payCheck || 0) + (cs.payOther || 0));
    return { name: c.name || "—", sales, returns, net: r2(sales - returns), paid, balance: r2(cs.balance || 0) };
  }).filter(x => x.sales || x.returns || x.paid || x.balance).sort((a, b) => b.net - a.net);
  /* V21.21.32: بطاقة «رصيد العملاء» = مجموع أرصدة العملاء الفعلية (نفس
     buildCustomerSummary اللي بيبني التفاصيل) — بالبناء البطاقة تساوي مجموع
     الصفوف. قبل كده كانت من computeSalesOverviewTotals اللي ما بيحتسبش
     أوامر البيع المباشرة ولا دفعات الخزنة اليتيمة → رقم البطاقة كان ممكن
     يخالف مجموع التفاصيل اللي تحتها. */
  const custBalance = r2(salesDetail.reduce((acc, x) => acc + (x.balance || 0), 0));

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
    /* V21.27.97: مرتجعات الأمر المباشر (so.returns) تطرح من المحجوز.
       V21.27.99: مرتجعات أصناف المخزون بترجع فعليًا (applyStockDelta) مش
       للمحجوز المشتق — فبنتخطّاها (الموديلات order بس هي اللي تُطرح هنا). */
    (so.returns || []).forEach(rr => { if(rr && rr.sourceId && (!rr.itemSourceType || rr.itemSourceType === "order")) soReserved[rr.sourceId] = (soReserved[rr.sourceId] || 0) - (Number(rr.qty) || 0); });
  });
  let finishedVal = 0, finishedSellVal = 0; const finishedDetail = [];
  (d.orders || []).forEach(o => {
    const sd = getConfirmedStock(o); if(sd <= 0) return;
    const cd = (o.customerDeliveries || []).reduce((a, x) => a + (Number(x.qty) || 0), 0);
    const ret = (o.customerReturns || []).reduce((a, x) => a + (Number(x.qty) || 0), 0);
    const avail = Math.max(0, sd - (cd - ret + (soReserved[o.id] || 0)));
    if(avail <= 0) return;
    /* V21.27.128: تكلفة الوحدة = نفس رقم «تكلفة القطعة» في الأمر بالضبط
       (orderCostPerPiece = costAllProjected + التسوية + المصروفات الإضافية ÷
       كمية القص). قبل كده كانت تستخدم costPer (الفعلي) وتتجاهل التسوية
       والمصروفات → رقم مخالف للأمر. */
    let cost = 0; try { cost = orderCostPerPiece(o); } catch(_) {}
    const val = r2(avail * cost);
    /* V21.27.104: قيمة الجاهز بسعر البيع (avail × سعر بيع الأمر) — لتقرير
       تقييم المخزون المحاسبي (الجاهز بالتكلفة + بسعر المبيعات). سعر البيع
       مخزّن مباشرة على الأمر (o.sellPrice) — مش محسوب. */
    const sell = Number(o.sellPrice) || 0;
    const sval = r2(avail * sell);
    finishedVal += val; finishedSellVal += sval;
    finishedDetail.push({ name: (o.modelNo || "—") + (o.modelDesc ? " — " + o.modelDesc : ""), qty: avail, unitCost: r2(cost), value: val, unitSell: r2(sell), sellValue: sval });
  });
  /* V21.27.164: المنتجات الجاهزة الافتتاحية (مخزون قديم جاهز — مالهاش أمر إنتاج،
     isFinishedGood) جزء من تقييم الجاهز — نفس مصدر الحقيقة في هَب المخازن
     (WarehousePg.wStats.finished = موديلات الإنتاج + الجاهز الافتتاحي). قبل كده
     كانت متغيّبة عن الداشبورد فبطاقة «تقييم مخزن جاهز» كانت أقل من تاب الجاهز
     بقيمة الأصناف دي. الرصيد من الـ ledger (حركة opening) مش item.stock. */
  const _finNetMap = computeStockNetMap(d.stockMovements);
  (d.generalProducts || []).forEach(x => {
    if(!x || !x.isFinishedGood) return;
    const q = netStockOf(_finNetMap, x); if(q <= 0) return;
    const uc = Number(x.avgCost) || Number(x.costPrice) || Number(x.price) || 0;
    const val = r2(q * uc);
    const sell = Number(x.price) || 0;      /* المنتج العام: price = سعر البيع */
    const sval = r2(q * sell);
    finishedVal += val; finishedSellVal += sval;
    finishedDetail.push({ name: ((x.code ? x.code + " — " : "") + (x.name || "—")) + " (افتتاحي)", qty: q, unitCost: r2(uc), value: val, unitSell: r2(sell), sellValue: sval });
  });
  finishedVal = r2(finishedVal); finishedSellVal = r2(finishedSellVal);
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

  /* ── تكلفة البضاعة المباعة (COGS) — المُسلَّم فعلاً × تكلفة الوحدة الكاملة
     (costPerProjected: خامات + إكسسوار + أجور التشغيل). أساس البيع الفعلي. ── */
  let cogs = 0;
  (d.orders || []).forEach(o => {
    const sold = (o.customerDeliveries || []).reduce((a, x) => a + (Number(x.qty) || 0), 0) - (o.customerReturns || []).reduce((a, x) => a + (Number(x.qty) || 0), 0);
    if(sold <= 0) return;
    let cp = 0; try { const t = calcOrder(o); cp = Number(t.costPerProjected) || Number(t.costPer) || 0; } catch(_) {}
    cogs += sold * cp;
  });
  cogs = r2(cogs);
  const grossProfit = r2(salesNet - cogs);

  /* ── المصروفات التشغيلية — حركات خزنة (out) في الفئات المختارة يدوياً
     (data.profitSettings.opexCategories). مستبعدة ضمناً: دفعة مورد/ورشة/تحويل
     لو المستخدم ما اختارهاش (الاختيار يدوي بالكامل). ── */
  const opexCats = (d.profitSettings && Array.isArray(d.profitSettings.opexCategories)) ? d.profitSettings.opexCategories : [];
  const opexSet = new Set(opexCats);
  const opexByCat = {}; let opex = 0;
  if(opexSet.size){
    (d.treasury || []).forEach(t => {
      if(!t || t.type !== "out") return;
      const cat = (t.category || "").trim() || "غير مصنف";
      if(!opexSet.has(cat)) return;
      const amt = Number(t.amount) || 0; opex += amt;
      opexByCat[cat] = (opexByCat[cat] || 0) + amt;
    });
  }
  opex = r2(opex);
  const opexDetail = Object.entries(opexByCat).map(([name, value]) => ({ name, value: r2(value) })).sort((a, b) => b.value - a.value);
  const netProfit = r2(grossProfit - opex);

  /* الربح التجاري القديم (مرجعي): مبيعات فعلية − مشتريات فعلية + تقييم المخزون */
  const tradingProfit = r2(salesNet - buyNet + inventoryTotal);

  return {
    sales: { total: salesTotal, returns: salesReturns, net: salesNet, balance: custBalance, detail: salesDetail },
    purchases: { total: buyTotal, returns: buyReturns, net: buyNet, payable, detail: supDetail },
    inventory: { finished: finishedVal, finishedSell: finishedSellVal, fabric: fabricVal, accessory: accessoryVal, other: otherVal, total: inventoryTotal, finishedDetail, fabricDetail, accessoryDetail, otherDetail },
    profit: { value: netProfit, salesNet, cogs, grossProfit, opex, opexDetail, netProfit, tradingProfit, configured: opexSet.size > 0 },
  };
}
