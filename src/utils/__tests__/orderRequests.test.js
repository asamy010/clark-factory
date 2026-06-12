import { describe, it, expect } from "vitest";
import { validateOrderRequest, buildOrderRequestEntry } from "../orderRequests.js";

const catalog = [
  { id: "o1", modelNo: "M-1", modelDesc: "قميص", image: "img1", sellPrice: 200, status: "available", avail: 10, seriesSize: 1, sizesLabel: "2-3-4-5",
    colors: [{ name: "أحمر", hex: "#f00", image: "redimg" }, { name: "أزرق", hex: "#00f", image: "" }] },
  { id: "o2", modelNo: "M-2", modelDesc: "", image: "", sellPrice: 150, status: "available", avail: 5, seriesSize: 1 },
  { id: "o3", modelNo: "M-3", modelDesc: "", image: "", sellPrice: 100, status: "soon", avail: 0 },
  { id: "o4", modelNo: "M-4", modelDesc: "", image: "", sellPrice: 100, status: "available", avail: 10, seriesSize: 3, sizesLabel: "S-M-L",
    colors: [{ name: "أخضر", hex: "#0f0", image: "" }] },
];

describe("validateOrderRequest (legacy qty path, seriesSize=1)", () => {
  it("يتحقق ويحسب الإجماليات بسعر الكتالوج", () => {
    const r = validateOrderRequest([{ id: "o1", qty: 3 }, { id: "o2", qty: 2 }], catalog);
    expect(r.ok).toBe(true);
    expect(r.totalQty).toBe(5);
    expect(r.totalValue).toBe(3 * 200 + 2 * 150);
    expect(r.items[0]).toMatchObject({ orderId: "o1", modelNo: "M-1", qty: 3, unitPrice: 200, sizesLabel: "2-3-4-5" });
  });

  it("يقصّ الكمية على المتاح الفعلي", () => {
    const r = validateOrderRequest([{ id: "o2", qty: 999 }], catalog);
    expect(r.items[0].qty).toBe(5);
    expect(r.items[0].requestedQty).toBe(999);
  });

  it("يرفض غير المتاح / الكمية صفر / المجهول", () => {
    const r = validateOrderRequest([{ id: "o3", qty: 2 }, { id: "o1", qty: 0 }, { id: "zzz", qty: 1 }], catalog);
    expect(r.ok).toBe(false);
    expect(r.rejected.map(x => x.id).sort()).toEqual(["o1", "o3", "zzz"]);
  });

  it("السعر دايماً من الكتالوج", () => {
    const r = validateOrderRequest([{ id: "o1", qty: 1, unitPrice: 1 }], catalog);
    expect(r.items[0].unitPrice).toBe(200);
  });
});

describe("validateOrderRequest (series alignment)", () => {
  it("يقرّب الكمية لأسفل لأقرب مضاعف سيري", () => {
    const r = validateOrderRequest([{ id: "o4", colors: [{ color: "أخضر", qty: 5 }] }], catalog); /* seriesSize=3 → 5→3 */
    expect(r.items[0].qty).toBe(3);
    expect(r.items[0].seriesSize).toBe(3);
    expect(r.items[0].requestedQty).toBe(5);
  });

  it("يقصّ الإجمالي على أكبر مضاعف سيري ≤ المتاح", () => {
    const r = validateOrderRequest([{ id: "o4", colors: [{ color: "أخضر", qty: 999 }] }], catalog); /* avail10,series3 → 9 */
    expect(r.items[0].qty).toBe(9);
  });
});

describe("validateOrderRequest (per-color breakdown)", () => {
  it("يوزّع الكميات على الألوان ويربط hex/صورة من الكتالوج", () => {
    const r = validateOrderRequest([{ id: "o1", colors: [{ color: "أحمر", qty: 3 }, { color: "أزرق", qty: 2 }] }], catalog);
    expect(r.items[0].qty).toBe(5);
    expect(r.items[0].colors).toEqual([
      { color: "أحمر", hex: "#f00", image: "redimg", qty: 3 },
      { color: "أزرق", hex: "#00f", image: "", qty: 2 },
    ]);
  });

  it("يقصّ مجموع الألوان على المتاح (اللون الأخير بياخد المتبقّي)", () => {
    /* o1 avail10 series1: أحمر7 + أزرق9 → أحمر7، أزرق متبقّي3 */
    const r = validateOrderRequest([{ id: "o1", colors: [{ color: "أحمر", qty: 7 }, { color: "أزرق", qty: 9 }] }], catalog);
    expect(r.items[0].qty).toBe(10);
    expect(r.items[0].colors.find(c => c.color === "أحمر").qty).toBe(7);
    expect(r.items[0].colors.find(c => c.color === "أزرق").qty).toBe(3);
  });

  it("يتجاهل الألوان صفرية الكمية", () => {
    const r = validateOrderRequest([{ id: "o1", colors: [{ color: "أحمر", qty: 2 }, { color: "أزرق", qty: 0 }] }], catalog);
    expect(r.items[0].colors.length).toBe(1);
    expect(r.items[0].colors[0].color).toBe("أحمر");
  });

  it("يحدّ عدد البنود (حماية من الإساءة)", () => {
    const many = Array.from({ length: 80 }, () => ({ id: "o2", qty: 1 }));
    const r = validateOrderRequest(many, catalog);
    expect(r.items.length).toBeLessThanOrEqual(60);
  });
});

describe("buildOrderRequestEntry", () => {
  it("يبني كائن طلب جاهز للتخزين بحالة pending", () => {
    const validated = validateOrderRequest([{ id: "o1", colors: [{ color: "أحمر", qty: 2 }] }], catalog);
    const e = buildOrderRequestEntry({
      id: "req_1", custId: "c1", custName: "عميل", custPhone: "201",
      validated, note: "محتاج بسرعة", nowISO: "2026-06-12T10:00:00.000Z",
    });
    expect(e).toMatchObject({ id: "req_1", custId: "c1", status: "pending", totalQty: 2, date: "2026-06-12" });
    expect(e.items[0].colors[0].color).toBe("أحمر");
    expect(e.handledAt).toBeNull();
  });

  it("يقصّ الملاحظة الطويلة", () => {
    const validated = validateOrderRequest([{ id: "o1", qty: 1 }], catalog);
    const e = buildOrderRequestEntry({ id: "x", custId: "c", validated, note: "x".repeat(900), nowISO: "2026-06-12T00:00:00Z" });
    expect(e.note.length).toBe(500);
  });
});
