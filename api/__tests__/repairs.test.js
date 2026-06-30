/* ═══════════════════════════════════════════════════════════════════════
   اختبارات منطق الإصلاح المالي المشترك (api/_repairs.js) — V21.27.185
   ───────────────────────────────────────────────────────────────────────
   computeMissingTransferLegs نقية → بنختبرها بحقن makeId/nowIso/dayNameFn
   حتميين. دي نفس الدالة اللي بيستخدمها الـ endpoint اليدوي والـ cron
   التلقائي، فاختبارها بيحمي المسارين.

   الضمانة الذهبية: الإصلاح تحفّظي — بيكمّل بس الأرجل الناقصة لتحويلات مؤكدة،
   مفيش اختراع فلوس، idempotent (تشغيل تاني بعد الإصلاح = صفر).
   ═══════════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from "vitest";
import { computeMissingTransferLegs, dayNameAr } from "../_repairs.js";

const CONFIRMED = {
  id: "tf1", status: "confirmed",
  fromAccount: "الرئيسية", toAccount: "الفرعية",
  amount: 1000, date: "2026-06-07", note: "تشغيل",
  sentBy: "محاسب",
};

/* مولّد id حتمي + طوابع ثابتة للاختبار */
const det = () => {
  let i = 0;
  return {
    makeId: () => "rep-" + (++i),
    nowIso: "2026-06-30T00:00:00.000Z",
    dayNameFn: () => "الأحد",
    actor: "cron:test",
    activeSeason: "WS26",
    reason: "auto-repair-reconcile",
  };
};

const leg = (type) => ({ id: "leg-" + type, type, amount: 1000, transferId: "tf1", date: "2026-06-07" });

describe("computeMissingTransferLegs — الكشف", () => {
  it("الرجلين موجودين → صفر إصلاح (idempotent)", () => {
    const { legsToCreate, stats } = computeMissingTransferLegs([CONFIRMED], [leg("out"), leg("in")], det());
    expect(legsToCreate).toHaveLength(0);
    expect(stats.transfers_scanned).toBe(1);
    expect(stats.transfers_with_missing_legs).toBe(0);
  });

  it("الرجل الـ out ناقصة → بتتكوّن رجل out واحدة بالشكل الصحيح", () => {
    const { legsToCreate, stats } = computeMissingTransferLegs([CONFIRMED], [leg("in")], det());
    expect(legsToCreate).toHaveLength(1);
    const l = legsToCreate[0].leg;
    expect(legsToCreate[0].day).toBe("2026-06-07");
    expect(l).toMatchObject({
      id: "rep-1", type: "out", amount: 1000, account: "الرئيسية",
      category: "تحويل داخلي", transferId: "tf1", season: "WS26",
      date: "2026-06-07", day: "الأحد", by: "محاسب",
      repairedBy: "cron:test", repairReason: "auto-repair-reconcile",
    });
    expect(l.desc).toContain("الفرعية");/* تحويل إلى الوجهة */
    expect(stats.legs_out_to_create).toBe(1);
    expect(stats.legs_in_to_create).toBe(0);
  });

  it("الرجل الـ in ناقصة → بتتكوّن رجل in واحدة", () => {
    const { legsToCreate, stats } = computeMissingTransferLegs([CONFIRMED], [leg("out")], det());
    expect(legsToCreate).toHaveLength(1);
    expect(legsToCreate[0].leg.type).toBe("in");
    expect(legsToCreate[0].leg.account).toBe("الفرعية");/* الوجهة */
    expect(stats.legs_in_to_create).toBe(1);
  });

  it("الرجلين ناقصين → رجلين (out + in)", () => {
    const { legsToCreate, stats } = computeMissingTransferLegs([CONFIRMED], [], det());
    expect(legsToCreate.map(x => x.leg.type).sort()).toEqual(["in", "out"]);
    expect(stats.transfers_with_missing_legs).toBe(1);
    expect(stats.days_affected).toBe(1);
    expect(stats.days_list).toEqual(["2026-06-07"]);
  });

  it("التحويل المعلّق (غير مؤكد) لا يُفحص", () => {
    const { legsToCreate, stats } = computeMissingTransferLegs([{ ...CONFIRMED, status: "pending" }], [], det());
    expect(legsToCreate).toHaveLength(0);
    expect(stats.transfers_scanned).toBe(0);
  });

  it("تاريخ غير صالح → يتخطّى (مش معروف الـ day-doc)", () => {
    const { legsToCreate } = computeMissingTransferLegs([{ ...CONFIRMED, date: "bad-date" }], [], det());
    expect(legsToCreate).toHaveLength(0);
  });

  it("تحويل بدون fromAccount → ما يكوّنش رجل out (بيكمّل اللي المفروض موجود بس)", () => {
    const oneSided = { ...CONFIRMED, fromAccount: "" };
    const { legsToCreate } = computeMissingTransferLegs([oneSided], [], det());
    /* مفيش out (مفيش مصدر)، بس in موجودة (فيه وجهة) */
    expect(legsToCreate.map(x => x.leg.type)).toEqual(["in"]);
  });

  it("sample_repaired محدود بـ 10 عناصر", () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ ...CONFIRMED, id: "tf" + i }));
    const { stats } = computeMissingTransferLegs(many, [], det());
    expect(stats.transfers_with_missing_legs).toBe(15);
    expect(stats.sample_repaired).toHaveLength(10);
  });

  it("مدخلات فاضية/مش-مصفوفة → صفر بدون رمي", () => {
    expect(computeMissingTransferLegs(null, null, det()).legsToCreate).toEqual([]);
    expect(computeMissingTransferLegs(undefined, undefined).legsToCreate).toEqual([]);
  });
});

describe("dayNameAr", () => {
  it("بيرجّع اسم اليوم بالعربي لتاريخ صالح", () => {
    /* 2026-06-07 = الأحد (ICU على Node/Vercel) — نتأكد إنها string غير فاضية */
    expect(typeof dayNameAr("2026-06-07")).toBe("string");
  });
  it("تاريخ فاضي → سلسلة فاضية", () => {
    expect(dayNameAr("")).toBe("");
    expect(dayNameAr(null)).toBe("");
  });
});
