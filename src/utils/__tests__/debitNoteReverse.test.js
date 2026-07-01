/* V21.27.219 (M6): إلغاء/حذف الإشعار المدين الناتج عن مرتجع استلام يعكس المرتجع
   التشغيلي (المخزون + الكمية المتاحة). نظير removeOperationalReturnForCreditNote
   في المبيعات. */
import { describe, it, expect } from "vitest";
import { reverseDebitNoteReceiptReturns } from "../invoices.js";
import { computeStockNetMap, netStockOf } from "../stockLedger.js";

/* بيانات: مورد استلم 100 قطعة من صنف مخزون it1، رجّع 30 (إشعار مدين dn1). */
const mkData = () => ({
  itemCategories: [{ id: "cat1", name: "خامات" }],
  inventoryItems: [{ id: "it1", name: "زرار", unit: "قطعة", categoryId: "cat1", stock: 70, avgCost: 5 }],
  purchaseReceipts: [{
    id: "r1", receiptNo: "REC-1", supplierId: "s1",
    items: [{ itemType: "cat1", itemId: "it1", itemName: "زرار", qty: 100, price: 5 }],
    _returns: [{ itemType: "cat1", itemId: "it1", itemName: "زرار", qty: 30, price: 5, date: "2026-06-02", debitNoteId: "dn1" }],
  }],
  purchaseDebitNotes: [{ id: "dn1", debitNoteNo: "DN-1", supplierId: "s1", status: "draft", total: 150 }],
  stockMovements: [
    { id: "m0", type: "in", itemType: "cat1", itemId: "it1", qty: 100, date: "2026-06-01", sourceType: "receipt", sourceId: "r1" },
    { id: "m1", type: "out", itemType: "cat1", itemId: "it1", qty: -30, date: "2026-06-02", sourceType: "purchase_return", sourceId: "r1", debitNoteId: "dn1" },
  ],
});

describe("reverseDebitNoteReceiptReturns (M6)", () => {
  it("يرجّع المخزون + يشيل _returns المرتبطة بالإشعار", () => {
    const d = mkData();
    const out = reverseDebitNoteReceiptReturns(d, "dn1", { stockEnabled: true, userName: "t" });
    expect(out.restored).toBe(1);
    expect(d.inventoryItems[0].stock).toBe(100);              // 70 + 30 رجعوا
    expect(d.purchaseReceipts[0]._returns).toHaveLength(0);    // اترفع القيد التشغيلي
    /* حركة عكسية in بقيمة 30 مضافة → صافي الحركات = 100 (in) − 30 (out) + 30 (cancel) */
    expect(netStockOf(computeStockNetMap(d.stockMovements), d.inventoryItems[0])).toBe(100);
    expect(d.stockMovements.some(m => m.sourceType === "purchase_return_cancel" && m.qty === 30)).toBe(true);
  });

  it("بدون تفعيل المخزن: يشيل _returns بس (مفيش لمس مخزون)", () => {
    const d = mkData();
    const out = reverseDebitNoteReceiptReturns(d, "dn1", { stockEnabled: false, userName: "t" });
    expect(out.restored).toBe(0);
    expect(d.inventoryItems[0].stock).toBe(70);               // ما اتلمسش
    expect(d.purchaseReceipts[0]._returns).toHaveLength(0);
  });

  it("legacy: مرتجع قديم من غير debitNoteId على الحركة → fallback من _returns.qty", () => {
    const d = mkData();
    d.stockMovements = d.stockMovements.filter(m => m.sourceType !== "purchase_return"); // مفيش حركة موسومة
    const out = reverseDebitNoteReceiptReturns(d, "dn1", { stockEnabled: true, userName: "t" });
    expect(out.restored).toBe(1);
    expect(d.inventoryItems[0].stock).toBe(100);              // رجع من _returns.qty=30
  });

  it("إشعار غير مرتبط بأي مرتجع استلام → no-op آمن", () => {
    const d = mkData();
    const out = reverseDebitNoteReceiptReturns(d, "dn-other", { stockEnabled: true });
    expect(out.restored).toBe(0);
    expect(d.inventoryItems[0].stock).toBe(70);
    expect(d.purchaseReceipts[0]._returns).toHaveLength(1);    // مرتجع dn1 ما اتلمسش
  });
});
