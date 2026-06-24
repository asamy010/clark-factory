/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · Inventory Valuation Report (V21.27.104)
   ───────────────────────────────────────────────────────────────────────
   تقرير تقييم المخزون المحاسبي — pure، صفر mutation. بيعيد استخدام
   computeDashboardKpis (نفس مصدر الحقيقة بتاع لوحة التحكم) عشان الأرقام
   تطابق باقي البرنامج بالظبط، وبيضيف:
     • قيمة مخزن الجاهز بالتكلفة + بسعر المبيعات (والفرق = ربح متوقع)
     • قيمة مخزن القماش بالتكلفة (متوسط التكلفة المرجّح)
     • قيمة مخزن الإكسسوار بالتكلفة
     • قيمة أصناف المخازن الأخرى (لو وُجدت)
     • إجمالي تقييم المخزون بالكامل (بالتكلفة — المعيار المحاسبي)
     • إجمالي المستحق على المصنع للموردين (أرصدة دائنة موجبة)
     • إجمالي المستحق للمصنع من العملاء (أرصدة مدينة موجبة)

   تقييم المخزون دايمًا بالتكلفة (lower of cost) — سعر البيع بند معلوماتي
   منفصل، مش بيتجمع في الإجمالي. اتجاه الأرصدة (راجع statement.js):
     • المورد: رصيد موجب = مستحق للمورد (علينا).
     • العميل: رصيد موجب = مستحق علينا من العميل.
   ═══════════════════════════════════════════════════════════════════════ */

import { r2 } from "../format.js";
import { computeDashboardKpis } from "../dashboardKpis.js";

export function buildInventoryValuationReport(data){
  const k = computeDashboardKpis(data || {});
  const inv = k.inventory || {}, pur = k.purchases || {}, sal = k.sales || {};

  /* ── تقييم المخزون (بالتكلفة) ── */
  const finishedCost = r2(inv.finished || 0);
  const finishedSell = r2(inv.finishedSell || 0);
  const finishedProfit = r2(finishedSell - finishedCost);
  const fabric = r2(inv.fabric || 0);
  const accessory = r2(inv.accessory || 0);
  const other = r2(inv.other || 0);
  const inventoryTotal = r2(inv.total || 0); // = finished + fabric + accessory + other

  /* ── مستحق على المصنع للموردين (payable) — أرصدة الموردين الموجبة ── */
  const supplierRows = (pur.detail || [])
    .filter(x => (x.balance || 0) > 0)
    .map(x => ({ name: x.name || "—", balance: r2(x.balance) }))
    .sort((a, b) => b.balance - a.balance);
  const supplierPayable = r2(supplierRows.reduce((s, x) => s + x.balance, 0));
  const supplierCredit = r2((pur.detail || []).filter(x => (x.balance || 0) < 0).reduce((s, x) => s + Math.abs(x.balance), 0));

  /* ── مستحق للمصنع من العملاء (receivable) — أرصدة العملاء الموجبة ── */
  const customerRows = (sal.detail || [])
    .filter(x => (x.balance || 0) > 0)
    .map(x => ({ name: x.name || "—", balance: r2(x.balance) }))
    .sort((a, b) => b.balance - a.balance);
  const customerReceivable = r2(customerRows.reduce((s, x) => s + x.balance, 0));
  const customerCredit = r2((sal.detail || []).filter(x => (x.balance || 0) < 0).reduce((s, x) => s + Math.abs(x.balance), 0));

  /* ── صافي مركز رأس المال العامل (معلوماتي): المخزون + المستحق من العملاء
        − المستحق للموردين ── */
  const netWorkingPosition = r2(inventoryTotal + customerReceivable - supplierPayable);

  return {
    /* تقييم المخزون */
    finishedCost, finishedSell, finishedProfit,
    fabric, accessory, other, inventoryTotal,
    /* المستحقات */
    supplierPayable, supplierCredit, supplierRows,
    customerReceivable, customerCredit, customerRows,
    netWorkingPosition,
    /* تفاصيل البنود (للجداول + الإكسل) */
    finishedDetail: inv.finishedDetail || [],
    fabricDetail: inv.fabricDetail || [],
    accessoryDetail: inv.accessoryDetail || [],
    otherDetail: inv.otherDetail || [],
  };
}
