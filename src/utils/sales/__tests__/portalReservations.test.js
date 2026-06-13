import { describe, it, expect } from "vitest";
import { groupPortalReservations, reservedQtyForOrder } from "../portalReservations.js";

const reqs = [
  { id: "r1", status: "confirmed", custName: "أحمد", date: "2026-06-10", items: [
    { orderId: "o1", qty: 10, colors: [{ color: "أحمر", qty: 6 }, { color: "أزرق", qty: 4 }] },
    { orderId: "o2", qty: 5, colors: [] },
  ] },
  { id: "r2", status: "confirmed", custName: "سارة", date: "2026-06-11", items: [
    { orderId: "o1", qty: 3, colors: [{ color: "أحمر", qty: 3 }] },
  ] },
  /* مرفوض → مايتحجزش */
  { id: "r3", status: "rejected", items: [{ orderId: "o1", qty: 100 }] },
  /* معلّق → مايتحجزش */
  { id: "r4", status: "pending", items: [{ orderId: "o1", qty: 50 }] },
  /* مؤكّد بس اتحوّل لأمر بيع → مايتحجزش (الأمر بيحجزه) */
  { id: "r5", status: "confirmed", salesOrderId: "SO-9", items: [{ orderId: "o1", qty: 20 }] },
];

describe("groupPortalReservations", () => {
  it("بيجمّع المؤكّد غير المتحوّل بس، حسب الأوردر", () => {
    const by = groupPortalReservations(reqs);
    expect(Object.keys(by).sort()).toEqual(["o1", "o2"]);
    expect(by.o1).toHaveLength(2);            /* r1 + r2 (مش r3/r4/r5) */
    expect(by.o1.map(r => r.custName)).toEqual(["أحمد", "سارة"]);
    expect(by.o2).toHaveLength(1);
  });

  it("reservedQtyForOrder = مجموع الكميات المؤكّدة فقط", () => {
    const by = groupPortalReservations(reqs);
    expect(reservedQtyForOrder(by, "o1")).toBe(13);   /* 10 + 3 — مش 100/50/20 */
    expect(reservedQtyForOrder(by, "o2")).toBe(5);
    expect(reservedQtyForOrder(by, "zzz")).toBe(0);
  });

  it("بيتعامل مع مدخلات فاضية/غلط", () => {
    expect(groupPortalReservations(null)).toEqual({});
    expect(groupPortalReservations([{ status: "confirmed" }])).toEqual({});
    expect(reservedQtyForOrder({}, "o1")).toBe(0);
  });
});
