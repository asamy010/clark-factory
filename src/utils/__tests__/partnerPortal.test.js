import { describe, it, expect } from "vitest";
import {
  buildOrdersStatus,
  buildPartnerPortalData,
  defaultVisibility,
  PARTNER_TOGGLES,
} from "../partnerPortal.js";

/* أمر بمخزون مؤكّد: getConfirmedStock يجمع o.deliveries (status != pending). */
function mkOrder(over = {}) {
  return {
    id: over.id || "o1",
    modelNo: over.modelNo || "M-1",
    modelDesc: over.modelDesc || "",
    cutQty: over.cutQty ?? 100,
    status: over.status || "في التشغيل",
    deliveries: over.deliveries || [{ qty: over.confirmed ?? 0, status: "received" }],
    customerDeliveries: over.customerDeliveries || [],
    customerReturns: over.customerReturns || [],
  };
}

describe("buildOrdersStatus", () => {
  it("يصنّف الأوامر ويحسب معدل الإنجاز الإجمالي", () => {
    const orders = [
      mkOrder({ id: "a", cutQty: 100, confirmed: 100 }), /* done 100% */
      mkOrder({ id: "b", cutQty: 100, confirmed: 40 }),  /* production 40% */
      mkOrder({ id: "c", cutQty: 0, confirmed: 0 }),     /* لسه ما اتقصّش → مستبعد */
      mkOrder({ id: "d", cutQty: 100, confirmed: 50, status: "ملغي" }), /* ملغي → مستبعد */
    ];
    const r = buildOrdersStatus(orders);
    expect(r.total).toBe(2);
    expect(r.done).toBe(1);
    expect(r.working).toBe(1);
    /* (100 + 40) / (100 + 100) = 70% */
    expect(r.completionRate).toBe(70);
    /* الأقل إنجازاً أولاً */
    expect(r.items[0].completion).toBe(40);
    expect(r.items[0].status).toBe("production");
    expect(r.items[1].status).toBe("done");
  });

  it("يحدّ المؤكّد بالمقصوص (الإنجاز لا يتجاوز 100%)", () => {
    const r = buildOrdersStatus([mkOrder({ cutQty: 50, confirmed: 80 })]);
    expect(r.completionRate).toBe(100);
    expect(r.items[0].completion).toBe(100);
    expect(r.done).toBe(1);
  });

  it("قائمة فاضية → أصفار", () => {
    expect(buildOrdersStatus([])).toMatchObject({ total: 0, working: 0, done: 0, completionRate: 0 });
  });
});

describe("buildPartnerPortalData — visibility", () => {
  const emptyData = {}; /* computeDashboardKpis يتعامل مع الفاضي بأصفار */

  it("افتراضياً كل الأقسام ظاهرة", () => {
    const out = buildPartnerPortalData(emptyData, undefined);
    expect(out.visibility).toEqual(defaultVisibility());
    expect(out.sales).toBeDefined();
    expect(out.purchases).toBeDefined();
    expect(out.inventory).toBeDefined();
    expect(out.profit).toBeDefined();
    expect(out.orders).toBeDefined();
    expect(out.receivables).toEqual([]);
    expect(out.payables).toEqual([]);
  });

  it("إخفاء قسم يشيله من الـ payload بالكامل", () => {
    const out = buildPartnerPortalData(emptyData, { profit: false, payables: false, sales: false });
    expect(out.profit).toBeUndefined();
    expect(out.payables).toBeUndefined();
    expect(out.sales).toBeUndefined();
    /* الباقي موجود */
    expect(out.purchases).toBeDefined();
    expect(out.receivables).toBeDefined();
    expect(out.visibility.profit).toBe(false);
  });

  it("defaultVisibility يغطّي كل المفاتيح", () => {
    const v = defaultVisibility();
    expect(Object.keys(v).sort()).toEqual([...PARTNER_TOGGLES].sort());
    expect(Object.values(v).every(Boolean)).toBe(true);
  });

  it("التحصيلات والرصيد مشتقّة من تفاصيل العملاء (مجموع الصفوف)", () => {
    const data = {
      customers: [
        { id: "c1", name: "عميل ١", discount: 0 },
        { id: "c2", name: "عميل ٢", discount: 0 },
      ],
      /* أمر مُسلّم لـ c1 — يخلق رصيد/تحصيل عبر buildCustomerSummary */
      orders: [{
        id: "o1", modelNo: "M", sellPrice: 100,
        deliveries: [{ qty: 10, status: "received" }],
        customerDeliveries: [{ custId: "c1", qty: 5, date: "2026-01-01" }],
        customerReturns: [],
      }],
      custPayments: [{ custId: "c1", amount: 200, date: "2026-01-02", method: "كاش" }],
    };
    const out = buildPartnerPortalData(data, undefined);
    /* receivables = نفس sales.detail (بالأسماء) */
    const r = out.receivables.find(x => x.name === "عميل ١");
    expect(r).toBeTruthy();
    /* التحصيلات الكلية = مجموع paid في التفاصيل، والرصيد = مجموع balance */
    const sumPaid = out.receivables.reduce((s, x) => s + x.paid, 0);
    const sumBal = out.receivables.reduce((s, x) => s + x.balance, 0);
    expect(out.sales.collected).toBe(Math.round(sumPaid));
    expect(out.sales.balance).toBe(Math.round(sumBal));
  });
});
