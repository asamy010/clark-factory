/* ═══ V21.22.7 — المرحلة ب: تجميع المخزون بالموديل + توزيع FIFO ═══ */
import { describe, it, expect } from "vitest";
import { buildModelStock, allocateModelSale, modelKeyOf } from "../sales/modelStock.js";

const orders = [
  { id: "o1", modelNo: "ABC", modelDesc: "قميص", createdAt: "2026-01-01", avail: 30 },
  { id: "o2", modelNo: "ABC", createdAt: "2026-02-01", avail: 40 },
  { id: "o3", modelNo: "ABC", createdAt: "2026-03-01", avail: 30 },
  { id: "o4", modelNo: "XYZ", createdAt: "2026-01-15", avail: 10 },
  { id: "o5", modelNo: "ABC", createdAt: "2026-04-01", avail: 0 }, /* متاح صفر → يتجاهل */
];
const availOf = o => o.avail;

describe("buildModelStock", () => {
  it("بيجمّع الأوامر بالـ modelNo ويجمع المتاح", () => {
    const m = buildModelStock(orders, availOf);
    expect(Object.keys(m).sort()).toEqual(["ABC", "XYZ"]);
    expect(m.ABC.totalAvail).toBe(100);
    expect(m.XYZ.totalAvail).toBe(10);
    expect(m.ABC.lots).toHaveLength(3); /* o5 (صفر) اتجاهل */
  });

  it("اللوطات مرتبة FIFO (الأقدم أولاً)", () => {
    const m = buildModelStock(orders, availOf);
    expect(m.ABC.lots.map(l => l.orderId)).toEqual(["o1", "o2", "o3"]);
  });

  it("أوردر بلا modelNo مايتجمّعش مع غيره", () => {
    const m = buildModelStock([{ id: "x", avail: 5 }, { id: "y", avail: 7 }], availOf);
    expect(Object.keys(m)).toEqual(["#x", "#y"]);
    expect(modelKeyOf({ id: "x" })).toBe("#x");
  });
});

describe("allocateModelSale (FIFO)", () => {
  const lots = buildModelStock(orders, availOf).ABC.lots;

  it("بيوزّع البيعة FIFO عبر اللوطات", () => {
    const r = allocateModelSale(lots, 50); /* 30 من o1 + 20 من o2 */
    expect(r.allocations).toEqual([{ orderId: "o1", qty: 30 }, { orderId: "o2", qty: 20 }]);
    expect(r.allocated).toBe(50);
    expect(r.shortfall).toBe(0);
  });

  it("بيع كل المتاح بالظبط", () => {
    const r = allocateModelSale(lots, 100);
    expect(r.allocations).toEqual([{ orderId: "o1", qty: 30 }, { orderId: "o2", qty: 40 }, { orderId: "o3", qty: 30 }]);
    expect(r.shortfall).toBe(0);
  });

  it("طلب أكبر من المتاح → shortfall", () => {
    const r = allocateModelSale(lots, 120);
    expect(r.allocated).toBe(100);
    expect(r.shortfall).toBe(20);
  });

  it("بيعة جوّه لوط واحد", () => {
    const r = allocateModelSale(lots, 20);
    expect(r.allocations).toEqual([{ orderId: "o1", qty: 20 }]);
  });

  it("كمية صفر/سالبة → مفيش توزيع", () => {
    expect(allocateModelSale(lots, 0).allocations).toEqual([]);
    expect(allocateModelSale(lots, -5).allocations).toEqual([]);
  });
});
