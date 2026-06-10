/* ═══════════════════════════════════════════════════════════════════════
   اختبارات الأعمدة الموحّدة (docColumns.js) — V21.21.42
   ───────────────────────────────────────────────────────────────────────
   الضمانة الذهبية: مجموع «بعد الخصم» للصفوف = إجمالي المستند بالظبط (توزيع
   خصم الرأس بالتناسب + آخر صف يمتص فرق التقريب). أي كسر = أرقام عرض غلط.
   ═══════════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from "vitest";
import { buildDocColumns } from "../docColumns.js";

const sumRows = (rows, key) => rows.filter(r => !r.isSection).reduce((s, r) => s + r[key], 0);

describe("buildDocColumns — الأعمدة الأساسية", () => {
  it("بند بيع: الكود/الاسم/الوحدة + قبل وبعد الخصم لكل صف", () => {
    const { rows, totals } = buildDocColumns([
      { modelNo: "G-101", description: "قميص قطن", unit: "قطعة", qty: 10, unitPrice: 100, discountType: "pct", discountValue: 10 },
    ]);
    expect(rows[0]).toMatchObject({ code: "G-101", name: "قميص قطن", unit: "قطعة", qty: 10, price: 100, subBefore: 1000, discount: 100, subAfter: 900 });
    expect(totals).toEqual({ subBefore: 1000, discount: 100, subAfter: 900 });
  });

  it("بند مشتريات (itemName/price) — الكود فاضي والاسم = itemName", () => {
    const { rows } = buildDocColumns([{ itemName: "قماش", unit: "متر", qty: 5, price: 20 }]);
    expect(rows[0]).toMatchObject({ code: "—" === "" ? "" : "", name: "قماش", unit: "متر", subBefore: 100, discount: 0, subAfter: 100 });
    expect(rows[0].code).toBe("");
  });

  it("سطر قسم (isSection) بيتمرّر كعنوان بدون أرقام", () => {
    const { rows } = buildDocColumns([{ isSection: true, title: "المجموعة أ" }, { modelNo: "X", qty: 1, unitPrice: 50 }]);
    expect(rows[0]).toEqual({ isSection: true, title: "المجموعة أ" });
    expect(rows[1].subBefore).toBe(50);
  });
});

describe("buildDocColumns — توزيع الخصم الكلي (الضمانة الذهبية)", () => {
  it("خصم رأس % بيتوزّع على الصفوف ومجموع بعد الخصم = الإجمالي", () => {
    /* صنفين: 1000 + 500 = 1500 قبل، خصم رأس 10% = 150 → 1350 */
    const items = [
      { modelNo: "A", description: "صنف أ", qty: 10, unitPrice: 100 },
      { modelNo: "B", description: "صنف ب", qty: 5, unitPrice: 100 },
    ];
    const { rows, totals } = buildDocColumns(items, { headerDiscountPct: 10 });
    expect(totals).toEqual({ subBefore: 1500, discount: 150, subAfter: 1350 });
    /* كل صف بيبيّن نصيبه من الخصم */
    expect(rows[0].discount).toBe(100);/* 10% من 1000 */
    expect(rows[1].discount).toBe(50);/* 10% من 500 */
    expect(sumRows(rows, "subAfter")).toBe(1350);
    expect(sumRows(rows, "discount")).toBe(150);
  });

  it("خصم رأس بقيمة مطلقة (فاتورة) بيتوزّع والمجموع مظبوط", () => {
    const items = [
      { modelNo: "A", modelDesc: "أ", qty: 3, unitPrice: 100 },/* 300 */
      { modelNo: "B", modelDesc: "ب", qty: 1, unitPrice: 100 },/* 100 */
    ];
    const { rows, totals } = buildDocColumns(items, { headerDiscountAmount: 40 });
    expect(totals.subBefore).toBe(400);
    expect(totals.discount).toBe(40);
    expect(totals.subAfter).toBe(360);
    expect(sumRows(rows, "subAfter")).toBe(360);
    expect(sumRows(rows, "discount")).toBe(40);
  });

  it("خصم بنود + خصم رأس معاً: الصف بيجمع الاتنين", () => {
    /* صنف واحد 1000 بخصم بند 10% (=100) ثم خصم رأس 10% على المتبقي 900 (=90) */
    const { rows, totals } = buildDocColumns(
      [{ modelNo: "A", qty: 10, unitPrice: 100, discountType: "pct", discountValue: 10 }],
      { headerDiscountPct: 10 }
    );
    expect(rows[0].discount).toBe(190);/* 100 + 90 */
    expect(rows[0].subAfter).toBe(810);
    expect(totals).toEqual({ subBefore: 1000, discount: 190, subAfter: 810 });
  });

  it("التقريب: ٣ أصناف متساوية بخصم رأس فردي — المجموع يفضل مظبوط بالقرش", () => {
    const items = [
      { modelNo: "A", qty: 1, unitPrice: 100 },
      { modelNo: "B", qty: 1, unitPrice: 100 },
      { modelNo: "C", qty: 1, unitPrice: 100 },
    ];
    const { rows, totals } = buildDocColumns(items, { headerDiscountAmount: 10 });/* 10/3 لكل صف */
    expect(sumRows(rows, "discount")).toBe(10);/* مفيش قرش ضايع */
    expect(sumRows(rows, "subAfter")).toBe(290);
    expect(totals.subAfter).toBe(290);
  });

  it("بدون خصم: قبل = بعد، وعمود الخصم صفر", () => {
    const { rows, totals } = buildDocColumns([{ modelNo: "A", qty: 2, unitPrice: 50 }]);
    expect(rows[0].discount).toBe(0);
    expect(rows[0].subAfter).toBe(100);
    expect(totals).toEqual({ subBefore: 100, discount: 0, subAfter: 100 });
  });

  it("الخصم الكلي ما يتعدّاش الإجمالي (clamp)", () => {
    const { totals } = buildDocColumns([{ modelNo: "A", qty: 1, unitPrice: 100 }], { headerDiscountAmount: 999 });
    expect(totals.discount).toBe(100);
    expect(totals.subAfter).toBe(0);
  });
});
