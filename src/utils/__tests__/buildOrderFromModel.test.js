/* ═══ V21.22.0 (المرحلة ٣): snapshot الموديل → أمر تشغيل ═══ */
import { describe, it, expect } from "vitest";
import { buildOrderFromModel } from "../orders.js";

const model = {
  id: "m1", modelNo: "M-100", modelDesc: "قميص أطفال", sizeSetId: 4, sizeLabel: "M-L-XL",
  orderPieces: ["قميص", "شورت"], image: "data:img", instructions: "خياطة دبل",
  fabricA: "10", consA: 2.5, fabricPiecesA: ["قميص"],
  colorsA: [{ color: "أحمر", colorHex: "#f00", layers: 0, pcsPerLayer: 0, qty: 0 }, { color: "أزرق", colorHex: "#00f" }],
  accItems: [{ accId: "1", name: "زر", qtyPerPiece: 5, price: 0.5 }],
  colorImages: { "أحمر": "data:red", "أزرق": "data:blue" },
};

describe("buildOrderFromModel", () => {
  it("بينسخ وصفة الموديل + يربط بـ modelId", () => {
    const o = buildOrderFromModel(model);
    expect(o.modelId).toBe("m1");
    expect(o.modelNo).toBe("M-100");
    expect(o.modelDesc).toBe("قميص أطفال");
    expect(o.sizeSetId).toBe(4);
    expect(o.orderPieces).toEqual(["قميص", "شورت"]);
    expect(o.fabricA).toBe("10");
    expect(o.consA).toBe(2.5);
    expect(o.fabricPiecesA).toEqual(["قميص"]);
    expect(o.accItems).toEqual([{ accId: "1", name: "زر", qtyPerPiece: 5, price: 0.5 }]);
    expect(o.image).toBe("data:img");
  });

  it("أمر جديد: id فريد + PO فاضي (تلقائي) + حالة افتراضية", () => {
    const o = buildOrderFromModel(model);
    expect(o.id).toBeTruthy();
    expect(o.id).not.toBe("m1");            /* مش id الموديل */
    expect(o.poNumber).toBe("");            /* يتولّد تلقائياً عند الحفظ */
    expect(o.status).toBeTruthy();
  });

  it("الألوان تتنسخ كـ palette بأرقام صحيحة (المستخدم يكتب الكميات)", () => {
    const o = buildOrderFromModel(model);
    expect(o.colorsA.map(c => c.color)).toEqual(["أحمر", "أزرق"]);
    expect(o.colorsA[1]).toEqual({ color: "أزرق", colorHex: "#00f", layers: 0, pcsPerLayer: 0, qty: 0 });
  });

  it("snapshot — تعديل الأمر مايأثرش على الموديل (نسخ عميق)", () => {
    const o = buildOrderFromModel(model);
    o.colorsA[0].layers = 99;
    o.accItems[0].qtyPerPiece = 999;
    expect(model.colorsA[0].layers).toBe(0);
    expect(model.accItems[0].qtyPerPiece).toBe(5);
  });

  it("موديل ناقص/فاضي مايكسرش", () => {
    const o = buildOrderFromModel(null);
    expect(o.id).toBeTruthy();
    expect(o.modelId).toBeUndefined();
  });

  it("صور الألوان بتنتقل لـ shopify_meta.color_images بالشكل الصح", () => {
    const o = buildOrderFromModel(model);
    expect(o.shopify_meta.color_images).toEqual({
      "أحمر": { url: "data:red", alt: "أحمر", source: "model" },
      "أزرق": { url: "data:blue", alt: "أزرق", source: "model" },
    });
  });

  it("موديل من غير صور ألوان مايعملش shopify_meta", () => {
    const o = buildOrderFromModel({ ...model, colorImages: {} });
    expect(o.shopify_meta).toBeUndefined();
  });
});
