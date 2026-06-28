/* ═══════════════════════════════════════════════════════════════════════
   اختبارات computeFinishedValuation (stockCatalog.js) — V21.27.165
   ───────────────────────────────────────────────────────────────────────
   مصدر الحقيقة الموحّد لتقييم المخزن الجاهز. قبله كان الحساب متكرّر في
   WarehousePg.wStats و dashboardKpis فدرِفوا مرّتين (V164: الداشبورد نسي الجاهز
   الافتتاحي؛ V165: الداشبورد عدّ الأوامر المقفولة). دي الاختبارات اللي بتقفل
   البابين: الأمر المقفول مُستبعَد، الجاهز الافتتاحي مُحتسب، والمستهلكين بياخدوا
   نفس الرقم بالظبط.
   ═══════════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from "vitest";
import { computeFinishedValuation } from "../stockCatalog.js";
import { computeDashboardKpis } from "../dashboardKpis.js";
import { makeFactoryData } from "./dataFixture.js";

describe("computeFinishedValuation — مصدر الحقيقة الموحّد للجاهز", () => {
  it("موديلات الإنتاج المتاحة: المتاح × التكلفة = 820 (من الفكسجر)", () => {
    const fin = computeFinishedValuation(makeFactoryData());
    /* متاح = مؤكد 50 − (مسلَّم 10 − مرتجع 2 + محجوز 1) = 41 × تكلفة 20 = 820 */
    expect(fin.models.value).toBe(820);
    expect(fin.value).toBe(820);
    expect(fin.models.count).toBe(1);
  });

  it("V21.27.168: الأمر المقفول (o.closed) **بيتحسب** — قطعه لسه في المخزن", () => {
    const data = makeFactoryData();
    data.orders.forEach(o => { o.closed = true; });
    const fin = computeFinishedValuation(data);
    /* قفل الأوردر مابيشيلش قطعه → المتاح/التقييم زي ما هو (المعادلة: تسليم − مباع = متاح) */
    expect(fin.value).toBe(820);
    expect(fin.models.count).toBe(1);
  });

  it("V21.27.168: خليط مفتوح+مقفول — الاتنين بيتحسبوا (القطع كلها في المخزن)", () => {
    const data = makeFactoryData();
    /* نسخة مقفولة من الأمر بنفس المخزون (بلا محجوز): متاح = 50 − (10 − 2) = 42. */
    const open = data.orders[0];
    const closedClone = JSON.parse(JSON.stringify(open));
    closedClone.id = "ord-closed"; closedClone.closed = true;
    data.orders.push(closedClone);
    const fin = computeFinishedValuation(data);
    expect(fin.models.count).toBe(2);   /* المفتوح + المقفول */
    expect(fin.models.qty).toBe(83);    /* 41 (مفتوح) + 42 (مقفول) — المقفول بيتحسب */
  });

  it("الجاهز الافتتاحي (isFinishedGood) من الـ ledger يدخل الإجمالي والتقسيمة", () => {
    const data = makeFactoryData();
    data.generalProducts = [{ id: "fg1", name: "سوت قديم", isFinishedGood: true, stock: 0, avgCost: 30, price: 50 }];
    data.stockMovements = [{ itemType: "general", itemId: "fg1", type: "opening", qty: 6, createdAt: "2026-06-01T00:00:00Z" }];
    const fin = computeFinishedValuation(data);
    expect(fin.opening.value).toBe(180);   /* 6 × 30 */
    expect(fin.opening.count).toBe(1);
    expect(fin.value).toBe(1000);           /* 820 + 180 */
  });

  it("منتج عام غير معلَّم جاهز لا يدخل التقييم", () => {
    const data = makeFactoryData();
    data.generalProducts = [{ id: "gp1", name: "كرتونة", isFinishedGood: false, stock: 0, avgCost: 30 }];
    data.stockMovements = [{ itemType: "general", itemId: "gp1", type: "opening", qty: 6, createdAt: "2026-06-01T00:00:00Z" }];
    expect(computeFinishedValuation(data).value).toBe(820);
  });

  it("لوحة التحكم بتاخد نفس رقم computeFinishedValuation بالظبط (دالة واحدة)", () => {
    const data = makeFactoryData();
    data.generalProducts = [{ id: "fg1", name: "سوت قديم", isFinishedGood: true, stock: 0, avgCost: 30, price: 50 }];
    data.stockMovements = [{ itemType: "general", itemId: "fg1", type: "opening", qty: 6, createdAt: "2026-06-01T00:00:00Z" }];
    const fin = computeFinishedValuation(data);
    const k = computeDashboardKpis(data);
    expect(k.inventory.finished).toBe(fin.value);
    expect(k.inventory.finishedSell).toBe(fin.sellValue);
  });
});
