import { describe, it, expect } from "vitest";
import { validateOrderRequest, buildOrderRequestEntry } from "../orderRequests.js";

const catalog = [
  { id: "o1", modelNo: "M-1", modelDesc: "قميص", image: "img1", sellPrice: 200, status: "available", avail: 10, sizesLabel: "2-3-4-5" },
  { id: "o2", modelNo: "M-2", modelDesc: "", image: "", sellPrice: 150, status: "available", avail: 5 },
  { id: "o3", modelNo: "M-3", modelDesc: "", image: "", sellPrice: 100, status: "soon", avail: 0 },
];

describe("validateOrderRequest", () => {
  it("يتحقق ويحسب الإجماليات بسعر الكتالوج (مش العميل)", () => {
    const r = validateOrderRequest([{ id: "o1", qty: 3 }, { id: "o2", qty: 2 }], catalog);
    expect(r.ok).toBe(true);
    expect(r.totalQty).toBe(5);
    expect(r.totalValue).toBe(3 * 200 + 2 * 150); /* 900 */
    expect(r.items[0]).toMatchObject({ orderId: "o1", modelNo: "M-1", qty: 3, unitPrice: 200, sizesLabel: "2-3-4-5" });
  });

  it("يقصّ الكمية على المتاح الفعلي (مايثقش في كمية العميل)", () => {
    const r = validateOrderRequest([{ id: "o2", qty: 999 }], catalog);
    expect(r.items[0].qty).toBe(5); /* avail=5 */
    expect(r.items[0].requestedQty).toBe(999);
    expect(r.totalValue).toBe(5 * 150);
  });

  it("يرفض غير المتاح / الكمية صفر / الموديل المجهول", () => {
    const r = validateOrderRequest([
      { id: "o3", qty: 2 },     /* soon → غير متاح */
      { id: "o1", qty: 0 },     /* كمية صفر */
      { id: "zzz", qty: 1 },    /* مجهول */
    ], catalog);
    expect(r.ok).toBe(false);
    expect(r.items).toEqual([]);
    expect(r.rejected.map(x => x.id).sort()).toEqual(["o1", "o3", "zzz"]);
  });

  it("السعر دايماً من الكتالوج — حتى لو العميل بعت سعر", () => {
    const r = validateOrderRequest([{ id: "o1", qty: 1, unitPrice: 1, sellPrice: 1 }], catalog);
    expect(r.items[0].unitPrice).toBe(200);
  });

  it("يحدّ عدد البنود (حماية من الإساءة)", () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ id: "o1", qty: 1 }));
    const r = validateOrderRequest(many, catalog);
    expect(r.items.length).toBeLessThanOrEqual(60);
  });
});

describe("buildOrderRequestEntry", () => {
  it("يبني كائن طلب جاهز للتخزين بحالة pending", () => {
    const validated = validateOrderRequest([{ id: "o1", qty: 2 }], catalog);
    const e = buildOrderRequestEntry({
      id: "req_1", custId: "c1", custName: "عميل", custPhone: "201",
      validated, note: "محتاج بسرعة", nowISO: "2026-06-12T10:00:00.000Z",
    });
    expect(e).toMatchObject({
      id: "req_1", custId: "c1", custName: "عميل", status: "pending",
      totalQty: 2, date: "2026-06-12", note: "محتاج بسرعة",
    });
    expect(e.items.length).toBe(1);
    expect(e.handledAt).toBeNull();
  });

  it("يقصّ الملاحظة الطويلة", () => {
    const validated = validateOrderRequest([{ id: "o1", qty: 1 }], catalog);
    const e = buildOrderRequestEntry({ id: "x", custId: "c", validated, note: "x".repeat(900), nowISO: "2026-06-12T00:00:00Z" });
    expect(e.note.length).toBe(500);
  });
});
