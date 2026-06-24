import { describe, it, expect } from "vitest";
import { buildPackingListHTML, buildSalesDocWithImagesHTML } from "../docPrint.js";

const data = {
  factoryName: "CLARK",
  orders: [{ id: "o1", modelNo: "M1", image: "https://store/img1.jpg" }],
};
const doc = {
  orderNo: "SO-100", customerName: "عميل أ", customerPhone: "201234567890", date: "2026-06-24", discountPct: 0,
  items: [
    { sourceType: "order", sourceId: "o1", modelNo: "M1", description: "قميص قطن", unit: "قطعة", qty: 5, unitPrice: 100, lineTotal: 500 },
    { sourceType: "service", modelNo: "شحن", description: "خدمة شحن", qty: 1, unitPrice: 80, lineTotal: 80 },
  ],
};

describe("buildPackingListHTML", () => {
  const html = buildPackingListHTML(doc, data);
  it("يعرض رقم الموديل والوصف والكمية", () => {
    expect(html).toContain("M1");
    expect(html).toContain("قميص قطن");
    expect(html).toContain("قائمة التغليف");
    expect(html).toContain("الصورة");
  });
  it("يضمّن صورة الموديل من أمر الإنتاج، وplaceholder للبند بلا صورة", () => {
    expect(html).toContain("https://store/img1.jpg");
    expect(html).toContain("🧩"); // placeholder لبند الخدمة
  });
  it("إجمالي الكمية مجمّع حسب الوحدة في التذييل", () => {
    expect(html).toContain("5 قطعة"); // وحدة قطعة 5 + خدمة بلا وحدة 1
  });
});

describe("buildSalesDocWithImagesHTML", () => {
  const html = buildSalesDocWithImagesHTML(doc, data, "order");
  it("يعرض الصورة + السعر + الإجمالي للأمر", () => {
    expect(html).toContain("https://store/img1.jpg");
    expect(html).toContain("بالصور");
    expect(html).toContain("100");   // سعر الوحدة
    expect(html).toContain("580");   // إجمالي الأمر (500 + 80)
  });
});
