/* ═══════════════════════════════════════════════════════════════════════
   اختبارات حارس المسح الجماعي (massWipeGuard.js) — V21.21.41
   ───────────────────────────────────────────────────────────────────────
   بتثبّت سلوك الشبكة بالظبط (عشان ما تضعفش بالغلط في تعديل لاحق) + بتغطي
   ثغرة الحذف المجمّع اللي بلّغ عنها Ahmed (حذف كل الشيكات → ترجع بعد
   الريفريش).
   ═══════════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from "vitest";
import { collectMassWipes } from "../massWipeGuard.js";

const counts = (obj) => (f) => obj[f] || 0;

describe("collectMassWipes — العتبة ≥2→0", () => {
  it("≥2 → 0 يُكتشف كمسح", () => {
    const w = collectMassWipes(["checks"], counts({ checks: 5 }), { checks: [] }, [], "split");
    expect(w).toEqual(["checks: 5 → 0 (split)"]);
  });

  it("1 → 0 لا يُكتشف (تحت العتبة — حذف آخر عنصر مسموح)", () => {
    const w = collectMassWipes(["checks"], counts({ checks: 1 }), { checks: [] }, [], "split");
    expect(w).toEqual([]);
  });

  it("N → M حيث M≥1 لا يُكتشف (حذف جزئي)", () => {
    const w = collectMassWipes(["checks"], counts({ checks: 5 }), { checks: [{ id: "a" }, { id: "b" }] }, [], "split");
    expect(w).toEqual([]);
  });

  it("الحقل غير الداخل في الكتابة (مش في afterObj) لا يُفحص", () => {
    const w = collectMassWipes(["checks", "treasury"], counts({ checks: 5, treasury: 9 }), { checks: [] }, [], "split");
    /* treasury مش في afterObj → ما يتفحصش، checks بس */
    expect(w).toEqual(["checks: 5 → 0 (split)"]);
  });
});

describe("collectMassWipes — allowEmpty (إصلاح V21.21.41)", () => {
  it("الحقل المسموح تفريغه لا يُمنع (حذف مجمّع مؤكّد)", () => {
    const w = collectMassWipes(["checks"], counts({ checks: 5 }), { checks: [] }, ["checks"], "split");
    expect(w).toEqual([]);
  });

  it("الحماية تفضل شغّالة على الحقول التانية حتى مع allowEmpty", () => {
    /* المستخدم أكّد تفريغ checks بس — لو bug فضّى custPayments في نفس
       الكتابة، لازم يتمسك */
    const w = collectMassWipes(
      ["checks", "custPayments"],
      counts({ checks: 5, custPayments: 8 }),
      { checks: [], custPayments: [] },
      ["checks"],
      "split"
    );
    expect(w).toEqual(["custPayments: 8 → 0 (split)"]);
  });

  it("سيناريو الثغرة: حذف كل الشيكات بـ allowEmpty يمر، بدونها يُمنع", () => {
    const before = counts({ checks: 4 });
    const after = { checks: [] };
    expect(collectMassWipes(["checks"], before, after, [], "split")).toHaveLength(1);/* قديماً: متمنوع */
    expect(collectMassWipes(["checks"], before, after, ["checks"], "split")).toHaveLength(0);/* الإصلاح */
  });

  it("حذف الخزنة المجمّع: كل الحقول المرتبطة مسموح تفريغها", () => {
    const w = collectMassWipes(
      ["treasury", "treasuryTransfers", "custPayments", "salesInvoices"],
      counts({ treasury: 10, treasuryTransfers: 3, custPayments: 2, salesInvoices: 7 }),
      { treasury: [], treasuryTransfers: [], custPayments: [], salesInvoices: [{ id: "x" }, { id: "y" }] },
      ["treasury", "treasuryTransfers", "custPayments", "supplierPayments", "wsPayments"],
      "split"
    );
    /* salesInvoices مش في القائمة لكنه 7→2 (مش →0) فمايتمسكش — والباقي مسموح */
    expect(w).toEqual([]);
  });
});
