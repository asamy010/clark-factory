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

/* ═══ V21.21.82: عملة متعددة + سعر صرف ═══ */
import { convertRfqToPurchaseOrderMutator } from "../rfq.js";

describe("recalcRfqTotals — عملة + سعر صرف", () => {
  it("الافتراضي EGP بسعر 1، والمكافئ = الإجمالي", () => {
    const r = recalcRfqTotals({ items: [{ qty: 2, unitPrice: 100 }] });
    expect(r.currency).toBe("EGP");
    expect(r.fxRate).toBe(1);
    expect(r.total).toBe(200);
    expect(r.totalEGP).toBe(200);
  });
  it("USD بسعر 50: totalEGP = total × 50", () => {
    const r = recalcRfqTotals({ currency: "USD", fxRate: 50, items: [{ qty: 2, unitPrice: 100 }] });
    expect(r.currency).toBe("USD");
    expect(r.fxRate).toBe(50);
    expect(r.total).toBe(200);       /* بالدولار */
    expect(r.totalEGP).toBe(10000);  /* بالجنيه */
  });
});

describe("convertRfqToPurchaseOrderMutator — يحوّل لجنيه + يحفظ الأجنبي", () => {
  it("PO يتسجّل بالجنيه (× السعر) مع metadata الأجنبي", () => {
    const d = {
      purchaseRfqs: [recalcRfqTotals({
        id: "rfq_1", rfqNo: "طلب-1", currency: "USD", fxRate: 50,
        supplierId: "s1", supplierName: "مورد",
        items: [{ qty: 2, unitPrice: 100, sourceType: "fabric", sourceId: "f1", modelNo: "قماش" }],
      })],
      purchaseOrders: [],
    };
    const res = convertRfqToPurchaseOrderMutator(d, "rfq_1", "tester");
    expect(res.ok).toBe(true);
    const po = d.purchaseOrders[0];
    expect(po.totalAmount).toBe(10000);     /* جنيه = 200 × 50 */
    expect(po.fcTotalAmount).toBe(200);     /* دولار */
    expect(po.currency).toBe("USD");
    expect(po.fxRate).toBe(50);
    expect(po.items[0].amount).toBe(10000); /* جنيه */
    expect(po.items[0].fcAmount).toBe(200); /* دولار */
  });
  it("EGP عادي: مفيش حقول عملة أجنبية على الـ PO", () => {
    const d = {
      purchaseRfqs: [recalcRfqTotals({ id: "rfq_2", rfqNo: "طلب-2", supplierId: "s1", items: [{ qty: 1, unitPrice: 500 }] })],
      purchaseOrders: [],
    };
    convertRfqToPurchaseOrderMutator(d, "rfq_2", "tester");
    const po = d.purchaseOrders[0];
    expect(po.totalAmount).toBe(500);
    expect(po.currency).toBeUndefined();
    expect(po.items[0].fcAmount).toBeUndefined();
  });
});
