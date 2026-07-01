/* V21.27.218 (C1): اختبارات خصم/استرداد مخزون أوامر التشغيل.
   بتغطي الجذر اللي الفحص الشامل لقاه: الخصم على draft فاضي (config مقصوص) كان
   بيختم «مخصوم» كذبًا — دلوقتي _stockDeductedActual بيسجّل الحقيقة فقط،
   والاسترداد عند الحذف بيتم منه (مش من الـ snapshot الوهمي). */
import { describe, it, expect } from "vitest";
import { calcStockNeeded, checkStockAvailability, deductStockForOrder, refundActualStockForOrder } from "../orders.js";
import { collectStockIds } from "../orderStockTx.js";

const PS = { stockEnabled: true, autoDeductOnCut: true, blockOnInsufficientStock: true, stockActivationDate: "" };
/* أوردر: قماش f1 استهلاك 2م/فرشة × 10 فرشات = 20م · إكسسوار a1 = 2/قطعة × 50 قطعة = 100 */
const mkOrder = (over = {}) => ({
  id: "ord1", modelNo: "M1", date: "2026-07-01",
  fabricA: "f1", consA: 2, colorsA: [{ color: "أسود", layers: 10, pcsPerLayer: 5, qty: 50 }],
  accItems: [{ accId: "a1", name: "زرار", qtyPerPiece: 2, price: 1 }],
  ...over,
});
const mkDraft = (fabStock = 100, accStock = 500) => ({
  purchaseSettings: { ...PS },
  fabrics: [{ id: "f1", name: "قطن", unit: "متر", stock: fabStock, avgCost: 40 }],
  accessories: [{ id: "a1", name: "زرار", unit: "قطعة", stock: accStock, avgCost: 1 }],
  stockMovements: [],
});

describe("C1 — خصم مخزون أمر التشغيل (needed/actual)", () => {
  it("calcStockNeeded: 20م قماش + 100 إكسسوار", () => {
    const n = calcStockNeeded(mkOrder());
    expect(n.fabrics.f1).toBe(20);
    expect(n.accessories.a1).toBe(100);
  });

  it("خصم على draft مائي: الرصيد ينزل + حركات cut + actual = needed", () => {
    const d = mkDraft(), o = mkOrder();
    expect(checkStockAvailability(o, d).ok).toBe(true);
    deductStockForOrder(d, o, "t");
    expect(d.fabrics[0].stock).toBe(80);
    expect(d.accessories[0].stock).toBe(400);
    expect(d.stockMovements).toHaveLength(2);
    expect(d.stockMovements.every(m => m.sourceType === "cut" && m.type === "out")).toBe(true);
    expect(o._stockDeducted).toEqual({ fabrics: { f1: 20 }, accessories: { a1: 100 } });
    expect(o._stockDeductedActual).toEqual({ fabrics: { f1: 20 }, accessories: { a1: 100 } });
  });

  it("C1 regression: خصم على draft فاضي (config مقصوص) — الختم فيكشن لكن actual فاضي", () => {
    const d = { purchaseSettings: { ...PS }, fabrics: [], accessories: [], stockMovements: [] };
    const o = mkOrder();
    /* الفحص بيعدّي (الصنف مش موجود → skip) — ده كان الـ bug */
    expect(checkStockAvailability(o, d).ok).toBe(true);
    deductStockForOrder(d, o, "t");
    expect(d.stockMovements).toHaveLength(0);          // صفر حركات فعلية
    expect(o._stockDeducted.fabrics.f1).toBe(20);       // الختم الوهمي (العقد القديم محفوظ)
    expect(o._stockDeductedActual).toEqual({ fabrics: {}, accessories: {} }); // الحقيقة
  });

  it("تعديل (delta): زيادة القص بتخصم الفرق بس، وactual بيتراكم", () => {
    const d = mkDraft(), o = mkOrder();
    deductStockForOrder(d, o, "t");                     // 20م
    o.colorsA = [{ color: "أسود", layers: 15, pcsPerLayer: 5, qty: 75 }]; // 30م
    deductStockForOrder(d, o, "t");
    expect(d.fabrics[0].stock).toBe(70);                // 100 − 30
    expect(o._stockDeductedActual.fabrics.f1).toBe(30);
  });

  it("refundActualStockForOrder: بيرجّع المخصوم فعليًا + حركات in", () => {
    const d = mkDraft(), o = mkOrder();
    deductStockForOrder(d, o, "t");
    const d2 = mkDraft(80, 400);                        // حالة المخزن بعد الخصم
    const any = refundActualStockForOrder(d2, o, "t");
    expect(any).toBe(true);
    expect(d2.fabrics[0].stock).toBe(100);
    expect(d2.accessories[0].stock).toBe(500);
    expect(d2.stockMovements.every(m => m.type === "in")).toBe(true);
  });

  it("C1 regression: حذف أوردر الفترة الوهمية لا يرجّع مخزون ماتخصمش", () => {
    /* أوردر اتعمل والـ config مقصوص: مختوم _stockDeducted بس مفيش actual */
    const o = mkOrder({ _stockDeducted: { fabrics: { f1: 20 }, accessories: { a1: 100 } } });
    const d = mkDraft();
    const any = refundActualStockForOrder(d, o, "t");
    expect(any).toBe(false);
    expect(d.fabrics[0].stock).toBe(100);               // قبل الإصلاح: كان هيبقى 120 (تضخّم كاذب)
    expect(d.stockMovements).toHaveLength(0);
  });

  it("collectStockIds: اتحاد المطلوب + السابق + الفعلي", () => {
    const o = mkOrder({
      _stockDeducted: { fabrics: { fOld: 5 }, accessories: {} },
      _stockDeductedActual: { fabrics: { fReal: 3 }, accessories: {} },
    });
    const ids = collectStockIds(o);
    expect(new Set(ids.fabricIds)).toEqual(new Set(["f1", "fOld", "fReal"]));
    expect(ids.accessoryIds).toEqual(["a1"]);
  });

  it("النقص بيتكشف على draft مائي (المنع الصارم شغّال فعلاً)", () => {
    const d = mkDraft(10);                              // 10م بس والمطلوب 20م
    const r = checkStockAvailability(mkOrder(), d);
    expect(r.ok).toBe(false);
    expect(r.shortages[0]).toMatchObject({ itemType: "fabric", itemId: "f1", needed: 20, available: 10 });
  });
});
