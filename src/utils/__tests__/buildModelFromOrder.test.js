/* ═══ V21.27.11: عكس buildOrderFromModel — سحب وصفة موديل من أمر تشغيل ═══ */
import { describe, it, expect } from "vitest";
import { buildModelFromOrder } from "../orders.js";

const order = {
  id: "o1", _docId: "doc1", modelNo: "M-200", modelDesc: "قميص", sizeSetId: 4, sizeLabel: "M-L-XL",
  orderPieces: ["قميص"], image: "img1", imageStoragePath: "p1", marker: "mk",
  prodDetails: "<b>تفاصيل</b>", wasteFabricPct: 5, wasteAccPct: 2,
  poNumber: "#M-200-001", status: "تم القص", cutQty: 100, deliveredQty: 40,
  deliveries: [{ qty: 40 }], workshopDeliveries: [{ wsName: "ws" }],
  fabricA: "10", consA: 2.5, pcsPerLayerA: 3, fabricPiecesA: ["قميص"], fabricALabel: "قطن - متر", fabricAPrice: 50, fabricAUnit: "متر",
  colorsA: [{ color: "كحلي", colorHex: "#1B2A4A", layers: 20, pcsPerLayer: 3, qty: 60 }, { color: "", colorHex: "", layers: 0 }],
  accItems: [{ accId: "1", name: "زر", qtyPerPiece: 5, price: 0.5 }],
  shopify_meta: { color_source_fabric: "A", color_images: { "كحلي": { url: "u", alt: "كحلي", source: "ai" } }, stock_matrix: { "كحلي": { "M": 20 } } },
};

describe("buildModelFromOrder", () => {
  it("بيرمي حقول التنفيذ ويسيب الوصفة", () => {
    const m = buildModelFromOrder(order);
    expect(m._isModel).toBe(true);
    expect(m.id).toBeTruthy();
    expect(m.id).not.toBe("o1");
    expect(m.poNumber).toBeUndefined();
    expect(m.status).toBeUndefined();
    expect(m.cutQty).toBeUndefined();
    expect(m.deliveries).toBeUndefined();
    expect(m.workshopDeliveries).toBeUndefined();
  });
  it("بينقل الوصفة صح", () => {
    const m = buildModelFromOrder(order);
    expect(m.modelNo).toBe("M-200");
    expect(m.sizeSetId).toBe(4);
    expect(m.fabricA).toBe("10");
    expect(m.consA).toBe(2.5);
    expect(m.pcsPerLayerA).toBe(3);
    expect(m.fabricPiecesA).toEqual(["قميص"]);
    expect(m.wasteFabricPct).toBe(5);
    expect(m.wasteAccPct).toBe(2);
    expect(m.prodDetails).toBe("<b>تفاصيل</b>");
    expect(m.accItems).toEqual([{ accId: "1", name: "زر", qtyPerPiece: 5, price: 0.5 }]);
  });
  it("الألوان اسم/لون بس (من غير راقات/كميات) + بيشيل الفاضي", () => {
    const m = buildModelFromOrder(order);
    expect(m.colorsA).toEqual([{ color: "كحلي", colorHex: "#1B2A4A" }]);
  });
  it("بيسيب color_images + color_source_fabric ويرمي stock_matrix", () => {
    const m = buildModelFromOrder(order);
    expect(m.shopify_meta.color_source_fabric).toBe("A");
    expect(m.shopify_meta.color_images["كحلي"].url).toBe("u");
    expect(m.shopify_meta.stock_matrix).toBeUndefined();
  });
  it("snapshot — تعديل الموديل مايأثرش على الأمر", () => {
    const m = buildModelFromOrder(order);
    m.colorsA[0].color = "أحمر";
    m.accItems[0].qtyPerPiece = 999;
    expect(order.colorsA[0].color).toBe("كحلي");
    expect(order.accItems[0].qtyPerPiece).toBe(5);
  });
});
