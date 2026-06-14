/* ═══════════════════════════════════════════════════════════════════════
   اختبارات «تحميل حساب» (transferPartyBalance) — V21.22.20
   ───────────────────────────────────────────────────────────────────────
   feature مالي بدون بيئة اختبار → smoke test إلزامي (CLAUDE.md §0.1).
   بيتحقّق إن النقل صحيح في كل الحالات: الحفاظ على الإشارة + تصفير المصدر +
   تعديل الوجهة، والأرصدة بتتقرأ صح من buildCustomerSummary/buildSupplierSummary
   (نفس الطبقة اللي بيقرأها كشف الحساب). فيكسچر: c1=370 ، sup1=230.
   ═══════════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from "vitest";
import {
  transferPartyBalance, reversePartyTransfer,
  previewPartyTransfer, partyAccountBalance,
} from "../contacts.js";
import { buildCustomerSummary, buildSupplierSummary } from "../accountSummary.js";
import { makeFactoryData } from "./dataFixture.js";

const apply = (data, patch) => {
  const d = JSON.parse(JSON.stringify(data));
  for(const k of Object.keys(patch)) d[k] = patch[k];
  return d;
};
const custBal = (d, id) => buildCustomerSummary(id, d).balance;
const supBal  = (d, id) => buildSupplierSummary(id, d).balance;

describe("transferPartyBalance — الحالة الأساسية (مورد بيسدّد حساب عميل)", () => {
  it("عميل→مورد: الاتنين بيقلّوا (زي مقاصة)", () => {
    const data = makeFactoryData();
    expect(custBal(data, "c1")).toBe(370);
    expect(supBal(data, "sup1")).toBe(230);
    const { patch } = transferPartyBalance(
      { fromType: "customer", fromId: "c1", toType: "supplier", toId: "sup1", amount: 200 }, data, { uid: "u" });
    const d = apply(data, patch);
    expect(custBal(d, "c1")).toBe(170);   /* 370 − 200 */
    expect(supBal(d, "sup1")).toBe(30);   /* 230 − 200 */
  });

  it("الافتراضي = الرصيد الكامل → يصفّر المصدر", () => {
    const data = makeFactoryData();
    const { patch, magnitude } = transferPartyBalance(
      { fromType: "customer", fromId: "c1", toType: "supplier", toId: "sup1" }, data, { uid: "u" });
    expect(magnitude).toBe(370);
    const d = apply(data, patch);
    expect(custBal(d, "c1")).toBe(0);     /* اتصفّر */
    expect(supBal(d, "sup1")).toBe(230 - 370); /* −140 (المورد امتص أكتر من رصيده) */
  });
});

describe("transferPartyBalance — الحفاظ على المجموع (نفس النوع)", () => {
  it("عميل→عميل: المصدر يقلّ والوجهة تزيد (مجموع المدين ثابت)", () => {
    const data = makeFactoryData();
    data.customers.push({ id: "c2", name: "عميل ٢", discount: 0 });
    expect(custBal(data, "c2")).toBe(0);
    const { patch } = transferPartyBalance(
      { fromType: "customer", fromId: "c1", toType: "customer", toId: "c2", amount: 200 }, data, { uid: "u" });
    const d = apply(data, patch);
    expect(custBal(d, "c1")).toBe(170);   /* 370 − 200 */
    expect(custBal(d, "c2")).toBe(200);   /* 0 + 200 (دفعة سالبة = زيادة) */
    expect(custBal(d, "c1") + custBal(d, "c2")).toBe(370); /* الإجمالي محفوظ */
  });
});

describe("transferPartyBalance — حماية + عكس", () => {
  it("يرفض نفس الطرف", () => {
    const data = makeFactoryData();
    expect(() => transferPartyBalance(
      { fromType: "customer", fromId: "c1", toType: "customer", toId: "c1", amount: 10 }, data, {}))
      .toThrow("TRANSFER_SAME_PARTY");
  });

  it("يرفض المبلغ الأكبر من رصيد المصدر", () => {
    const data = makeFactoryData();
    expect(() => transferPartyBalance(
      { fromType: "customer", fromId: "c1", toType: "supplier", toId: "sup1", amount: 5000 }, data, {}))
      .toThrow("TRANSFER_AMOUNT_OVER_MAX");
  });

  it("يرفض مصدر رصيده صفر", () => {
    const data = makeFactoryData();
    data.customers.push({ id: "c2", name: "عميل ٢", discount: 0 });
    expect(() => transferPartyBalance(
      { fromType: "customer", fromId: "c2", toType: "supplier", toId: "sup1" }, data, {}))
      .toThrow("TRANSFER_SOURCE_ZERO");
  });

  it("العكس بيرجّع الأرصدة زي ما كانت بالظبط", () => {
    const data = makeFactoryData();
    const { patch, transferId } = transferPartyBalance(
      { fromType: "customer", fromId: "c1", toType: "supplier", toId: "sup1", amount: 200 }, data, { uid: "u" });
    const d = apply(data, patch);
    expect(custBal(d, "c1")).toBe(170);
    const { patch: rpatch, removedCust, removedSup } = reversePartyTransfer(transferId, d);
    expect(removedCust).toBe(1);
    expect(removedSup).toBe(1);
    const d2 = apply(d, rpatch);
    expect(custBal(d2, "c1")).toBe(370);
    expect(supBal(d2, "sup1")).toBe(230);
  });
});

describe("previewPartyTransfer — معاينة UI", () => {
  it("بترجّع نفس أرقام التنفيذ من غير mutation", () => {
    const data = makeFactoryData();
    const pv = previewPartyTransfer(
      { fromType: "customer", fromId: "c1", toType: "supplier", toId: "sup1", amount: 200 }, data);
    expect(pv.ok).toBe(true);
    expect(pv.fromBal).toBe(370);
    expect(pv.fromAfter).toBe(170);
    expect(pv.toBal).toBe(230);
    expect(pv.toAfter).toBe(30);
    expect(pv.maxMag).toBe(370);
  });
  it("partyAccountBalance يطابق الملخّصات", () => {
    const data = makeFactoryData();
    expect(partyAccountBalance("customer", "c1", data)).toBe(370);
    expect(partyAccountBalance("supplier", "sup1", data)).toBe(230);
  });
});
