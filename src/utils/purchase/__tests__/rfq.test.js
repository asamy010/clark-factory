/* ═══════════════════════════════════════════════════════════════════════
   اختبارات حسابات طلب عرض السعر (rfq.js) — V21.21.43
   التركيز على الخصم الكلي الجديد فوق خصومات البنود.
   ═══════════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from "vitest";
import { recalcRfqLine, recalcRfqTotals } from "../rfq.js";

describe("recalcRfqLine — خصم البند", () => {
  it("نسبة %: lineTotal = الكمية × السعر − الخصم", () => {
    const r = recalcRfqLine({ qty: 10, unitPrice: 100, discountType: "pct", discountValue: 10 });
    expect(r.lineTotal).toBe(900);
  });
  it("مبلغ: الخصم لا يتعدّى قيمة البند", () => {
    const r = recalcRfqLine({ qty: 1, unitPrice: 100, discountType: "amount", discountValue: 999 });
    expect(r.lineTotal).toBe(0);
  });
  it("سطر القسم يرجع بأصفار", () => {
    expect(recalcRfqLine({ isSection: true, title: "أ" }).lineTotal).toBe(0);
  });
});

describe("recalcRfqTotals — الخصم الكلي (V21.21.43)", () => {
  it("بدون خصم كلي: total = subtotal (إجمالي البنود)", () => {
    const r = recalcRfqTotals({ items: [{ qty: 2, unitPrice: 100 }, { qty: 1, unitPrice: 100 }] });
    expect(r.subtotal).toBe(300);
    expect(r.headerDiscount).toBe(0);
    expect(r.total).toBe(300);
  });

  it("خصم كلي 10% فوق خصومات البنود", () => {
    /* بند 1: 1000 بخصم بند 10% = 900 · بند 2: 500 → afterLine 1400 · خصم كلي 10% = 140 */
    const r = recalcRfqTotals({
      discountPct: 10,
      items: [
        { qty: 10, unitPrice: 100, discountType: "pct", discountValue: 10 },
        { qty: 5, unitPrice: 100 },
      ],
    });
    expect(r.subtotal).toBe(1400);/* بعد خصومات البنود، قبل الخصم الكلي */
    expect(r.discountPct).toBe(10);
    expect(r.headerDiscount).toBe(140);
    expect(r.total).toBe(1260);
  });

  it("الخصم الكلي مقيّد بين 0 و100", () => {
    expect(recalcRfqTotals({ discountPct: 999, items: [{ qty: 1, unitPrice: 100 }] }).total).toBe(0);
    expect(recalcRfqTotals({ discountPct: -5, items: [{ qty: 1, unitPrice: 100 }] }).total).toBe(100);
  });
});
