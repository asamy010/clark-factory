import { describe, it, expect } from "vitest";
import { buildInventoryValuationReport } from "../inventoryValuation.js";

const r2 = n => Math.round(n * 100) / 100;

/* بيانات تنتج أرصدة معروفة:
   - مخزون: قماش 100×5=500 · إكسسوار 200×1=200
   - جاهز: أمر متاحه 8 (مؤكّد 10 − مُسلّم 2)، سعر بيع 100 → قيمة بيع 800
   - مستحقات: مورد s1 فاتورة 1000 (موجب=علينا له) · عميل c1 تسليم 2×100=200
     (موجب=علينا منه) · عميل c2 دفعة 200 بدون مبيعات (سالب=رصيد دائن) */
const data = {
  customers: [{ id: "c1", name: "عميل أ" }, { id: "c2", name: "عميل ب" }],
  suppliers: [{ id: "s1", name: "مورد أ" }],
  orders: [
    { id: "o1", modelNo: "M1", sellPrice: 100, deliveries: [{ qty: 10, status: "confirmed" }], customerDeliveries: [{ custId: "c1", qty: 2 }], customerReturns: [] },
  ],
  custPayments: [{ custId: "c2", amount: 200, method: "cash" }],
  purchaseReceipts: [{ supplierId: "s1", totalAmount: 1000, paidAmount: 0, date: "2026-01-01" }],
  fabrics: [{ id: "f1", name: "قطن", stock: 100, avgCost: 5 }],
  accessories: [{ id: "a1", name: "زرار", stock: 200, avgCost: 1 }],
};
const rep = buildInventoryValuationReport(data);

describe("buildInventoryValuationReport", () => {
  it("قيمة القماش والإكسسوار = الرصيد × متوسط التكلفة", () => {
    expect(rep.fabric).toBe(500);
    expect(rep.accessory).toBe(200);
  });

  it("قيمة الجاهز بسعر المبيعات = المتاح × سعر البيع (8 × 100 = 800)", () => {
    expect(rep.finishedSell).toBe(800);
    expect(Number.isFinite(rep.finishedCost)).toBe(true);
    expect(rep.finishedProfit).toBe(r2(rep.finishedSell - rep.finishedCost));
  });

  it("إجمالي تقييم المخزون = جاهز(تكلفة) + قماش + إكسسوار + أخرى", () => {
    expect(rep.inventoryTotal).toBe(r2(rep.finishedCost + rep.fabric + rep.accessory + rep.other));
  });

  it("مستحق الموردين = الأرصدة الموجبة فقط (1000)", () => {
    expect(rep.supplierPayable).toBe(1000);
    expect(rep.supplierRows).toEqual([{ name: "مورد أ", balance: 1000 }]);
  });

  it("مستحق العملاء = الأرصدة الموجبة فقط (200)؛ الرصيد الدائن مستبعد", () => {
    expect(rep.customerReceivable).toBe(200);
    expect(rep.customerRows).toEqual([{ name: "عميل أ", balance: 200 }]);
    expect(rep.customerCredit).toBe(200); // c2 دفع 200 بدون مبيعات
  });

  it("صافي مركز رأس المال العامل = المخزون + مستحق العملاء − مستحق الموردين", () => {
    expect(rep.netWorkingPosition).toBe(r2(rep.inventoryTotal + rep.customerReceivable - rep.supplierPayable));
  });

  it("لا يكسر على بيانات فاضية", () => {
    const empty = buildInventoryValuationReport({});
    expect(empty.inventoryTotal).toBe(0);
    expect(empty.supplierPayable).toBe(0);
    expect(empty.customerReceivable).toBe(0);
    expect(empty.finishedDetail).toEqual([]);
  });
});
