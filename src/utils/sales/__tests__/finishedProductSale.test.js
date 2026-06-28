import { describe, it, expect } from "vitest";
import { createSalesOrderDirectMutator, returnFromDirectSalesOrderMutator, cancelSalesOrderMutator } from "../salesOrders.js";

/* V21.27.160: بيع المنتج الجاهز الافتتاحي (generalProduct + isFinishedGood) —
   لازم يخصم رصيد d.generalProducts عند البيع، ويرجّعه عند المرتجع/الإلغاء،
   من غير ما يأثّر على بيع المنتجات العامة العادية (مش isFinishedGood). */

const mkData = (stock = 100, avgCost = 40) => ({
  salesOrders: [], salesInvoices: [], salesCreditNotes: [],
  generalProducts: [{ id: "gp1", name: "تيشيرت جاهز", unit: "قطعة", stock, avgCost, isFinishedGood: true }],
  stockMovements: [],
  customers: [{ id: "c1", name: "عميل" }],
});
const gpPayload = (qty = 10, price = 120) => ({
  customerId: "c1", customerName: "عميل", date: "2026-06-10",
  items: [{ sourceType: "generalProduct", sourceId: "gp1", modelNo: "تيشيرت جاهز", description: "", unit: "قطعة", qty, unitPrice: price, discountType: "pct", discountValue: 0 }],
});

describe("بيع المنتج الجاهز الافتتاحي (V21.27.160)", () => {
  it("البيع بيخصم رصيد المنتج الجاهز + stockDeducted + قيد categoryId=general", () => {
    const d = mkData(100);
    const r = createSalesOrderDirectMutator(d, gpPayload(10, 120), "tester", { stockEnabled: true });
    expect(r.ok).toBe(true);
    expect(d.generalProducts[0].stock).toBe(90);
    const so = r.salesOrder;
    expect(so.stockDeducted).toBe(true);
    expect(so.stockDeductions).toHaveLength(1);
    expect(so.stockDeductions[0]).toMatchObject({ itemId: "gp1", categoryId: "general", qty: 10 });
    const mv = d.stockMovements.find(m => m.itemType === "general" && m.type === "out");
    expect(mv).toBeTruthy();
    expect(mv.qty).toBe(-10);
  });

  it("منتج عام NOT isFinishedGood ما بيتخصمش (متوافق رجعيًا — صفر regression)", () => {
    const d = mkData(100); d.generalProducts[0].isFinishedGood = false;
    const r = createSalesOrderDirectMutator(d, gpPayload(10, 120), "tester", { stockEnabled: true });
    expect(r.ok).toBe(true);
    expect(d.generalProducts[0].stock).toBe(100);
    expect(r.salesOrder.stockDeducted).toBe(false);
  });

  it("مخزون غير كافٍ + blockOnInsufficientStock بيمنع البيع ومفيش خصم", () => {
    const d = mkData(5);
    const r = createSalesOrderDirectMutator(d, gpPayload(10, 120), "tester", { stockEnabled: true, blockOnInsufficientStock: true });
    expect(r.ok).toBe(false);
    expect(d.generalProducts[0].stock).toBe(5);
  });

  it("المرتجع بيرجّع الرصيد ويقلّل الـ deduction", () => {
    const d = mkData(100);
    createSalesOrderDirectMutator(d, gpPayload(10, 120), "tester", { stockEnabled: true });
    expect(d.generalProducts[0].stock).toBe(90);
    const so = d.salesOrders[0];
    const r = returnFromDirectSalesOrderMutator(d, { customerId: "c1", returns: [{ sourceId: "gp1", qty: 3 }] }, "tester");
    expect(r.ok).toBe(true);
    expect(d.generalProducts[0].stock).toBe(93);
    const ded = so.stockDeductions.find(x => x.itemId === "gp1");
    expect(ded.qty).toBe(7);
  });

  it("الإلغاء بيرجّع كل الرصيد المخصوم", () => {
    const d = mkData(100);
    const r0 = createSalesOrderDirectMutator(d, gpPayload(10, 120), "tester", { stockEnabled: true });
    expect(d.generalProducts[0].stock).toBe(90);
    const r = cancelSalesOrderMutator(d, r0.salesOrder.id, "tester", "test");
    expect(r.ok).toBe(true);
    expect(d.generalProducts[0].stock).toBe(100);
  });
});
