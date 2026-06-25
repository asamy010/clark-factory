import { describe, it, expect } from "vitest";
import { valuateItem, VALUATION_POLICIES, isValidPolicy } from "../inventoryPolicies.js";

/* سيناريو: استلام 10 @ 5 ثم استلام 10 @ 8 ثم صرف 6 → رصيد صافي = 14
   - none    : 14 × avgCost(7) = 98
   - average : إجمالي الاستلامات (10×5 + 10×8 = 130) ÷ 20 = 6.5 × 14 = 91
   - FIFO    : الصرف من الأقدم (6 من طبقة @5) → متبقّي 4@5 + 10@8 = 20+80 = 100
   - LIFO    : الصرف من الأحدث (6 من طبقة @8) → متبقّي 10@5 + 4@8 = 50+32 = 82 */
const item = { id: "f1", avgCost: 7, price: 0 };
const moves = [
  { itemId: "f1", itemType: "fabric", type: "in", qty: 10, price: 5, createdAt: "2026-01-01T00:00:00Z" },
  { itemId: "f1", itemType: "fabric", type: "in", qty: 10, price: 8, createdAt: "2026-01-02T00:00:00Z" },
  { itemId: "f1", itemType: "fabric", type: "out", qty: 6, createdAt: "2026-01-03T00:00:00Z" },
];
const NET = 14;

describe("valuateItem — سياسات تقييم المخزون (V21.27.130)", () => {
  it("none = الرصيد × التكلفة المخزّنة", () => {
    expect(valuateItem(item, NET, moves, "none").value).toBe(98);
  });
  it("average = الرصيد × متوسط الاستلامات المرجّح", () => {
    const r = valuateItem(item, NET, moves, "average");
    expect(r.unitCost).toBe(6.5);
    expect(r.value).toBe(91);
  });
  it("FIFO = الرصيد بأحدث الأسعار (المصروف من الأقدم)", () => {
    expect(valuateItem(item, NET, moves, "fifo").value).toBe(100);
  });
  it("LIFO = الرصيد بأقدم الأسعار (المصروف من الأحدث)", () => {
    expect(valuateItem(item, NET, moves, "lifo").value).toBe(82);
  });
  it("الكمية المعروضة دائمًا = الرصيد الصافي في كل السياسات", () => {
    for(const p of ["none", "average", "fifo", "lifo"]) {
      expect(valuateItem(item, NET, moves, p).qty).toBe(14);
    }
  });
  it("صنف بلا حركات → التكلفة المخزّنة (fallback)", () => {
    expect(valuateItem({ id: "x", avgCost: 3 }, 5, [], "fifo").value).toBe(15);
    expect(valuateItem({ id: "x", avgCost: 3 }, 5, [], "lifo").value).toBe(15);
  });
  it("رصيد صفر → قيمة صفر", () => {
    expect(valuateItem(item, 0, moves, "fifo").value).toBe(0);
  });
  it("FIFO يستهلك أكثر من طبقة بالكامل", () => {
    /* صرف 12 (كل @5 + 2 من @8) → متبقّي 8@8 = 64، رصيد 8 */
    const m2 = [
      { itemId: "f1", type: "in", qty: 10, price: 5, createdAt: "2026-01-01" },
      { itemId: "f1", type: "in", qty: 10, price: 8, createdAt: "2026-01-02" },
      { itemId: "f1", type: "out", qty: 12, createdAt: "2026-01-03" },
    ];
    expect(valuateItem(item, 8, m2, "fifo").value).toBe(64);
    /* LIFO: صرف 12 (كل @8 + 2 من @5) → متبقّي 8@5 = 40 */
    expect(valuateItem(item, 8, m2, "lifo").value).toBe(40);
  });
  it("تسوية (adjust) تعيد ضبط الطبقات بالتكلفة المرجعية", () => {
    const m3 = [
      { itemId: "f1", type: "in", qty: 10, price: 5, createdAt: "2026-01-01" },
      { itemId: "f1", type: "adjust", qty: 6, createdAt: "2026-01-02" }, /* تعيين الرصيد = 6 */
    ];
    /* بعد adjust: طبقة واحدة 6 × avgCost(7) = 42 */
    expect(valuateItem(item, 6, m3, "fifo").value).toBe(42);
  });
  it("VALUATION_POLICIES + isValidPolicy", () => {
    expect(VALUATION_POLICIES.map(p => p.key)).toEqual(["none", "average", "fifo", "lifo"]);
    expect(isValidPolicy("fifo")).toBe(true);
    expect(isValidPolicy("xxx")).toBe(false);
  });
});
