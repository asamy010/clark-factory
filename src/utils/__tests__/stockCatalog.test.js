import { describe, it, expect } from "vitest";
import {
  computeSoReserved,
  computeOrderAvail,
  buildStockCatalog,
  buildStockKpis,
} from "../stockCatalog.js";

/* أمر بمخزون مؤكّد: getConfirmedStock بيجمع o.deliveries (إيصالات المخزن
   الجاهز) اللي status != "pending". نبني الأمر بالبنية دي بالظبط. */
function mkOrder(over = {}) {
  return {
    id: over.id || "o1",
    modelNo: over.modelNo || "M-100",
    modelDesc: over.modelDesc || "قميص",
    image: over.image || "data:img",
    sellPrice: over.sellPrice ?? 200,
    cutQty: over.cutQty ?? 100,
    status: over.status || "تم القص",
    /* إيصالات المخزن الجاهز المؤكّدة (status != pending) = المخزون المؤكّد */
    deliveries: over.deliveries || [{ qty: over.confirmed ?? 100, status: "received" }],
    customerDeliveries: over.customerDeliveries || [],
    customerReturns: over.customerReturns || [],
    ...over._raw,
  };
}

describe("computeSoReserved", () => {
  it("يجمع كميات أوامر البيع المباشرة لكل أمر مصدر", () => {
    const sos = [
      { status: "open", items: [{ sourceType: "order", sourceId: "o1", qty: 5 }, { sourceType: "order", sourceId: "o1", qty: 3 }] },
      { status: "open", items: [{ sourceType: "order", sourceId: "o2", qty: 7 }] },
    ];
    expect(computeSoReserved(sos)).toEqual({ o1: 8, o2: 7 });
  });

  it("يتخطّى الملغي والمرايا (sourceDistributionId) — منع الحساب المزدوج", () => {
    const sos = [
      { status: "cancelled", items: [{ sourceType: "order", sourceId: "o1", qty: 5 }] },
      { status: "open", sourceDistributionId: "sess:cust", items: [{ sourceType: "order", sourceId: "o1", qty: 9 }] },
      { status: "open", items: [{ sourceType: "order", sourceId: "o1", qty: 2 }] },
    ];
    expect(computeSoReserved(sos)).toEqual({ o1: 2 });
  });

  it("يتجاهل البنود اللي مش sourceType=order", () => {
    const sos = [{ status: "open", items: [{ sourceType: "product", sourceId: "p1", qty: 5 }, { isSection: true }] }];
    expect(computeSoReserved(sos)).toEqual({});
  });
});

describe("computeOrderAvail", () => {
  it("المتاح = المؤكّد − (مُسلَّم − مرتجع) − محجوز", () => {
    const o = mkOrder({ confirmed: 100, customerDeliveries: [{ qty: 30 }], customerReturns: [{ qty: 5 }] });
    const r = computeOrderAvail(o, { o1: 10 });
    expect(r.stockQty).toBe(100);
    expect(r.delivered).toBe(30);
    expect(r.returned).toBe(5);
    expect(r.reserved).toBe(10);
    /* 100 − (30−5) − 10 = 65 */
    expect(r.avail).toBe(65);
  });

  it("بدون محجوز ولا تسليمات → المتاح = المخزون المؤكّد", () => {
    const o = mkOrder({ confirmed: 80 });
    expect(computeOrderAvail(o, {}).avail).toBe(80);
  });
});

describe("buildStockCatalog", () => {
  it("يرجّع الأصناف المتاحة فقط افتراضياً، مرتّبة بالأكبر كمية", () => {
    const data = {
      orders: [
        mkOrder({ id: "o1", confirmed: 50 }),
        mkOrder({ id: "o2", confirmed: 100, customerDeliveries: [{ qty: 100 }] }), /* avail 0 */
        mkOrder({ id: "o3", confirmed: 120 }),
      ],
      salesOrders: [],
    };
    const cat = buildStockCatalog(data);
    expect(cat.map(i => i.id)).toEqual(["o3", "o1"]); /* o2 avail 0 → مستبعد، الترتيب 120 ثم 50 */
    expect(cat.every(i => i.status === "available")).toBe(true);
    expect(cat[0]).toMatchObject({ id: "o3", avail: 120, sellPrice: 200, image: "data:img" });
  });

  it("يطرح المحجوز بأوامر البيع من المتاح", () => {
    const data = {
      orders: [mkOrder({ id: "o1", confirmed: 50 })],
      salesOrders: [{ status: "open", items: [{ sourceType: "order", sourceId: "o1", qty: 20 }] }],
    };
    expect(buildStockCatalog(data)[0].avail).toBe(30);
  });

  it("includeProduction يضيف «قريباً» للمقصوص-مش-جاهز فقط", () => {
    const data = {
      orders: [
        mkOrder({ id: "o1", confirmed: 0, cutQty: 100 }),   /* تحت التشغيل */
        mkOrder({ id: "o2", confirmed: 100, cutQty: 100, customerDeliveries: [{ qty: 100 }] }), /* مباع بالكامل → لا متاح ولا قريباً */
      ],
      salesOrders: [],
    };
    const cat = buildStockCatalog(data, { includeProduction: true });
    expect(cat.map(i => i.id)).toEqual(["o1"]);
    expect(cat[0]).toMatchObject({ status: "soon", avail: 0, expected: 100 });
  });

  it("يتخطّى الأوامر الملغية", () => {
    const data = { orders: [mkOrder({ id: "o1", confirmed: 50, status: "cancelled" })], salesOrders: [] };
    expect(buildStockCatalog(data)).toEqual([]);
  });
});

describe("buildStockKpis", () => {
  it("يحسب الإجماليات من المتاح فقط", () => {
    const items = [
      { status: "available", avail: 10, sellPrice: 200 },
      { status: "available", avail: 5, sellPrice: 100 },
      { status: "soon", avail: 0, expected: 50, sellPrice: 300 },
    ];
    const k = buildStockKpis(items);
    expect(k.models).toBe(2);
    expect(k.pieces).toBe(15);
    expect(k.value).toBe(10 * 200 + 5 * 100); /* 2500 — «قريباً» مستبعد */
    expect(k.soonModels).toBe(1);
  });
});
