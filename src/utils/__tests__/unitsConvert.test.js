import { describe, it, expect } from "vitest";
import { convertLineUnit, toBaseForStock, isSecondaryUnit, hasDualUnit } from "../units.js";

/* خامة: المتر = 30 قطعة (unit=متر أساسية، unit2=قطعة فرعية، rate=30) */
const fab = { unit: "متر", unit2: "قطعة", unit2Rate: 30 };
const single = { unit: "كيلو" }; /* صنف بوحدة واحدة */

describe("convertLineUnit — تبديل الوحدة في بند الشراء (الإجمالي ثابت)", () => {
  it("أساسية → فرعية: 1 متر بسعر 300 → 30 قطعة بسعر 10", () => {
    const r = convertLineUnit(fab, "متر", "قطعة", 1, 300);
    expect(r).toEqual({ qty: 30, unitPrice: 10 });
    expect(r.qty * r.unitPrice).toBe(300); /* الإجمالي ثابت */
  });
  it("فرعية → أساسية: 60 قطعة بسعر 10 → 2 متر بسعر 300", () => {
    const r = convertLineUnit(fab, "قطعة", "متر", 60, 10);
    expect(r).toEqual({ qty: 2, unitPrice: 300 });
    expect(r.qty * r.unitPrice).toBe(600);
  });
  it("نفس الوحدة → بدون تغيير", () => {
    expect(convertLineUnit(fab, "متر", "متر", 5, 100)).toEqual({ qty: 5, unitPrice: 100 });
  });
  it("صنف بوحدة واحدة → بدون تغيير", () => {
    expect(convertLineUnit(single, "كيلو", "متر", 5, 100)).toEqual({ qty: 5, unitPrice: 100 });
  });
});

describe("toBaseForStock — الكمية/التكلفة بالوحدة الأساسية للمخزون", () => {
  it("بند بالوحدة الفرعية (قطعة) يتحوّل للأساسية (متر)", () => {
    expect(toBaseForStock(fab, "قطعة", 90, 10)).toEqual({ qty: 3, unitCost: 300 });
  });
  it("بند بالوحدة الأساسية يفضل زي ما هو", () => {
    expect(toBaseForStock(fab, "متر", 3, 300)).toEqual({ qty: 3, unitCost: 300 });
  });
  it("صنف بوحدة واحدة يفضل زي ما هو", () => {
    expect(toBaseForStock(single, "كيلو", 5, 100)).toEqual({ qty: 5, unitCost: 100 });
  });
  it("وحدة مش معروفة (مش الفرعية) تتعامل كأساسية", () => {
    expect(toBaseForStock(fab, "متر", 4, 50)).toEqual({ qty: 4, unitCost: 50 });
  });
});

describe("isSecondaryUnit / hasDualUnit", () => {
  it("يميّز الوحدة الفرعية", () => {
    expect(isSecondaryUnit(fab, "قطعة")).toBe(true);
    expect(isSecondaryUnit(fab, "متر")).toBe(false);
    expect(isSecondaryUnit(single, "كيلو")).toBe(false);
    expect(hasDualUnit(fab)).toBe(true);
    expect(hasDualUnit(single)).toBe(false);
  });
});
