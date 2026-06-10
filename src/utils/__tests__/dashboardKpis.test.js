/* ═══════════════════════════════════════════════════════════════════════
   اختبارات مؤشرات لوحة التحكم (dashboardKpis.js) — V21.21.29
   ───────────────────────────────────────────────────────────────────────
   معادلة الربح (§14.4): الربح التجاري = مبيعات فعلية − مشتريات فعلية +
   تقييم المخزون. وصافي الربح = مجمل الربح (مبيعات − COGS) − المصروفات
   التشغيلية المختارة. الأرقام الذهبية محسوبة يدوياً في dataFixture.js.
   ═══════════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from "vitest";
import { computeDashboardKpis } from "../dashboardKpis.js";
import { makeFactoryData } from "./dataFixture.js";

describe("computeDashboardKpis — الأرقام الذهبية", () => {
  it("المبيعات: صافي 720 ورصيد عملاء 370 (شامل أوامر البيع المباشرة — V21.21.32)", () => {
    const k = computeDashboardKpis(makeFactoryData());
    expect(k.sales.total).toBe(900);
    expect(k.sales.returns).toBe(180);
    expect(k.sales.net).toBe(720);
    /* V21.21.32: البطاقة = مجموع أرصدة العملاء (مع so1 المباشر) مش 220 */
    expect(k.sales.balance).toBe(370);
  });

  it("V21.21.32: بطاقة الرصيد تساوي مجموع صفوف التفاصيل دائماً", () => {
    const k = computeDashboardKpis(makeFactoryData());
    const detailSum = k.sales.detail.reduce((a, x) => a + x.balance, 0);
    expect(k.sales.balance).toBe(detailSum);
  });

  it("المشتريات: صافي 450 ومستحق للموردين 230", () => {
    const k = computeDashboardKpis(makeFactoryData());
    expect(k.purchases.total).toBe(500);
    expect(k.purchases.returns).toBe(50);
    expect(k.purchases.net).toBe(450);
    expect(k.purchases.payable).toBe(230);
  });

  it("تقييم المخزون: جاهز 820 (بعد خصم محجوز أمر البيع) + خامات 50 = 870", () => {
    const k = computeDashboardKpis(makeFactoryData());
    /* متاح = مؤكد 50 − (مسلَّم 10 − مرتجع 2 + محجوز so1 = 1) = 41 × تكلفة 20 */
    expect(k.inventory.finished).toBe(820);
    expect(k.inventory.fabric).toBe(50);
    expect(k.inventory.total).toBe(870);
  });

  it("V21.21.1: مرآة التوزيعة لا تحجز مخزوناً (so2 كميتها 5 متجاهَلة)", () => {
    const data = makeFactoryData();
    /* لو المرآة اتحسبت في الحجز: متاح = 50 − (8 + 6) = 36 × 20 = 720 ≠ 820 */
    const k = computeDashboardKpis(data);
    expect(k.inventory.finished).toBe(820);
  });

  it("الربح: COGS 160 → مجمل 560 → مصروفات 100 → صافي 460", () => {
    const k = computeDashboardKpis(makeFactoryData());
    expect(k.profit.cogs).toBe(160);/* (10 − 2) × 20 */
    expect(k.profit.grossProfit).toBe(560);
    expect(k.profit.opex).toBe(100);/* فئة «إيجار» المختارة */
    expect(k.profit.netProfit).toBe(460);
    expect(k.profit.value).toBe(460);
  });

  it("الربح التجاري (§14.4): مبيعات − مشتريات + مخزون = 1140", () => {
    const k = computeDashboardKpis(makeFactoryData());
    expect(k.profit.tradingProfit).toBe(1140);/* 720 − 450 + 870 */
  });

  it("المصروفات التشغيلية اختيار يدوي: فئة غير مختارة لا تُحتسب", () => {
    const data = makeFactoryData();
    data.treasury.push({ id: "t-x", type: "out", amount: 999, category: "صيانة", date: "2026-06-09" });
    const k = computeDashboardKpis(data);
    expect(k.profit.opex).toBe(100);/* «صيانة» مش في opexCategories */

    data.profitSettings.opexCategories = ["إيجار", "صيانة"];
    expect(computeDashboardKpis(data).profit.opex).toBe(1099);
  });

  it("بدون إعداد مصروفات: opex صفر وconfigured=false", () => {
    const data = makeFactoryData();
    delete data.profitSettings;
    const k = computeDashboardKpis(data);
    expect(k.profit.opex).toBe(0);
    expect(k.profit.configured).toBe(false);
    expect(k.profit.netProfit).toBe(k.profit.grossProfit);
  });

  it("تفاصيل العملاء/الموردين متسقة مع الملخصات", () => {
    const k = computeDashboardKpis(makeFactoryData());
    expect(k.sales.detail).toHaveLength(1);
    /* تفصيلة العميل تشمل أوامر البيع المباشرة (so1 = 150) فوق صافي التوزيعات */
    expect(k.sales.detail[0].sales).toBe(1050);/* 900 + 150 */
    expect(k.sales.detail[0].balance).toBe(370);
    expect(k.purchases.detail[0].balance).toBe(230);
  });

  it("بيانات فارغة لا تنهار — كل الأرقام أصفار", () => {
    const k = computeDashboardKpis({});
    expect(k.sales.net).toBe(0);
    expect(k.purchases.net).toBe(0);
    expect(k.inventory.total).toBe(0);
    expect(k.profit.tradingProfit).toBe(0);
  });
});
