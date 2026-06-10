/* ═══════════════════════════════════════════════════════════════════════
   posting.js test-suite (V21.21.27 — Roadmap Phase 1.1)
   ───────────────────────────────────────────────────────────────────────
   posting.js's only impure dependency is dayDoc.js (Firestore I/O). We
   mock it with an in-memory store that mirrors the REAL semantics:
   - mutateDay: read-mutate-write of one day's entries array
   - findEntryBySource: skips void entries (same as dayDoc.js:182-190)
   so the idempotency / in-place-edit / void+mirror logic in postEntry &
   reverseEntry runs unchanged against realistic storage behavior.

   Regression coverage:
   - V21.9.87 (Accounting audit Bug #3): re-posting identical lines must
     be a true no-op (no silent mutation, no editedAt).
   ═══════════════════════════════════════════════════════════════════════ */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TEST_COA, expectBalanced, sumDr, sumCr } from "./fixtures.js";

const store = vi.hoisted(() => new Map());

vi.mock("../dayDoc.js", () => {
  const toDayId = (d) => {
    const m = String(d || "").match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : new Date().toISOString().split("T")[0];
  };
  return {
    toDayId,
    mutateDay: async (date, mutator) => {
      const id = toDayId(date);
      const cur = store.get(id) || [];
      const next = mutator(cur);
      if (!Array.isArray(next)) throw new Error("mutator must return an array");
      store.set(id, next);
      return next;
    },
    /* Mirrors the real implementation: void entries are NOT returned. */
    findEntryBySource: async (date, sourceType, sourceId) => {
      if (!sourceType || !sourceId) return null;
      const id = toDayId(date);
      const entry = (store.get(id) || []).find(
        (e) => e.sourceType === sourceType && e.sourceId === sourceId && e.status !== "void"
      );
      return entry ? { date: id, entry } : null;
    },
  };
});

import { validateLines, buildRefNo, postEntry, reverseEntry, postManualEntry } from "../posting.js";

const DAY = "2026-06-10";
const ar = (debit) => ({ accountId: "acc-1210", debit, credit: 0 });
const rv = (credit) => ({ accountId: "acc-4100", debit: 0, credit });

beforeEach(() => store.clear());

/* ───────────────────────── validateLines ───────────────────────── */
describe("validateLines", () => {
  it("يرفض أقل من سطرين", () => {
    expect(() => validateLines([ar(10)], null)).toThrow(/سطرين/);
    expect(() => validateLines([], null)).toThrow(/سطرين/);
    expect(() => validateLines(null, null)).toThrow(/سطرين/);
  });

  it("يرفض المبالغ السالبة", () => {
    expect(() => validateLines([{ accountId: "a", debit: -5, credit: 0 }, rv(5)], null))
      .toThrow(/سالب/);
  });

  it("يرفض سطر مدين ودائن معاً", () => {
    expect(() => validateLines([{ accountId: "a", debit: 5, credit: 5 }, rv(5)], null))
      .toThrow(/نفس السطر/);
  });

  it("يرفض سطر بدون مدين أو دائن", () => {
    expect(() => validateLines([{ accountId: "a", debit: 0, credit: 0 }, rv(5)], null))
      .toThrow(/يجب أن يكون مدين أو دائن/);
  });

  it("يرفض سطر بدون حساب", () => {
    expect(() => validateLines([{ debit: 5, credit: 0 }, rv(5)], null))
      .toThrow(/حساب غير محدد/);
  });

  it("يرفض حساباً غير موجود في الشجرة", () => {
    expect(() =>
      validateLines([{ accountId: "missing", debit: 5, credit: 0 }, rv(5)], TEST_COA)
    ).toThrow(/غير موجود في الشجرة/);
  });

  it("يرفض الترحيل لحساب أم (غير فرعي)", () => {
    expect(() =>
      validateLines([{ accountId: "acc-1000", debit: 5, credit: 0 }, rv(5)], TEST_COA)
    ).toThrow(/حساب أم/);
  });

  it("يرفض القيد غير المتوازن (فرق > 0.01)", () => {
    expect(() => validateLines([ar(100), rv(99.5)], TEST_COA)).toThrow(/غير متوازن/);
  });

  it("يقبل فرقاً داخل حد السماح 0.01 ويعيد الإجماليات", () => {
    const { totalDr, totalCr } = validateLines([ar(100.005), rv(100)], TEST_COA);
    expect(totalDr).toBeCloseTo(100.005, 5);
    expect(totalCr).toBe(100);
  });

  it("يقبل قيداً متعدد الأسطر متوازناً", () => {
    const lines = [ar(270), { accountId: "acc-4110", debit: 30, credit: 0 }, rv(300)];
    const { totalDr, totalCr } = validateLines(lines, TEST_COA);
    expect(totalDr).toBe(300);
    expect(totalCr).toBe(300);
  });
});

/* ───────────────────────── buildRefNo ───────────────────────── */
describe("buildRefNo", () => {
  it("يولّد JE-<سنة>-0001 ليوم فارغ", () => {
    expect(buildRefNo("2026-06-10", [])).toBe("JE-2026-0001");
    expect(buildRefNo("2026-06-10", null)).toBe("JE-2026-0001");
  });

  it("يكمل التسلسل من القيود الموجودة", () => {
    const existing = Array.from({ length: 41 }, (_, i) => ({ id: String(i) }));
    expect(buildRefNo("2025-01-01", existing)).toBe("JE-2025-0042");
  });
});

/* ───────────────────────── postEntry ───────────────────────── */
describe("postEntry", () => {
  const base = {
    date: DAY,
    sourceType: "sale",
    sourceId: "s1",
    narration: "بيع اختباري",
    coa: TEST_COA,
    createdBy: "test@clark",
  };

  it("ينشئ قيداً جديداً مرقّماً بحالة posted", async () => {
    const result = await postEntry({ ...base, lines: [ar(100), rv(100)] });
    expect(result).toHaveLength(1);
    const e = result[0];
    expect(e.refNo).toBe("JE-2026-0001");
    expect(e.status).toBe("posted");
    expect(e.sourceType).toBe("sale");
    /* normalizeLines enriches with accountCode/accountName from CoA */
    expect(e.lines[0].accountCode).toBe("1210");
    expect(e.lines[1].accountName).toBe("إيرادات المبيعات");
    expectBalanced(e);
  });

  it("يرفض القيد غير المتوازن ولا يكتب شيئاً", async () => {
    await expect(postEntry({ ...base, lines: [ar(100), rv(50)] })).rejects.toThrow(/غير متوازن/);
    expect(store.get(DAY)).toBeUndefined();
  });

  it("V21.9.87 regression: إعادة ترحيل نفس الأسطر = no-op حقيقي", async () => {
    await postEntry({ ...base, lines: [ar(100), rv(100)] });
    const before = JSON.parse(JSON.stringify(store.get(DAY)));
    await postEntry({ ...base, lines: [ar(100), rv(100)] });
    const after = store.get(DAY);
    expect(after).toHaveLength(1);
    expect(after[0].editedAt).toBeUndefined();
    expect(after).toEqual(before);
  });

  it("إعادة الترحيل بأسطر مختلفة تعدّل في المكان وتحافظ على id/refNo", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await postEntry({ ...base, lines: [ar(100), rv(100)] });
      const original = store.get(DAY)[0];
      await postEntry({ ...base, lines: [ar(150), rv(150)] });
      const updated = store.get(DAY);
      expect(updated).toHaveLength(1);
      expect(updated[0].id).toBe(original.id);
      expect(updated[0].refNo).toBe(original.refNo);
      expect(updated[0].createdAt).toBe(original.createdAt);
      expect(updated[0].lines[0].debit).toBe(150);
      expect(updated[0].editedAt).toBeTruthy();
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("مصدر مختلف على نفس اليوم يُضاف كقيد ثانٍ بتسلسل تالٍ", async () => {
    await postEntry({ ...base, lines: [ar(100), rv(100)] });
    await postEntry({ ...base, sourceId: "s2", lines: [ar(70), rv(70)] });
    const day = store.get(DAY);
    expect(day).toHaveLength(2);
    expect(day[1].refNo).toBe("JE-2026-0002");
  });

  it("يقرّب الأسطر لرقمين عشريين عند التخزين", async () => {
    await postEntry({ ...base, lines: [ar(100.006), rv(100.01)] });
    const e = store.get(DAY)[0];
    expect(e.lines[0].debit).toBe(100.01);
    expect(e.lines[1].credit).toBe(100.01);
  });

  it("يحفظ حقول العملة الأجنبية فقط لغير الـ EGP", async () => {
    await postEntry({
      ...base,
      lines: [
        { ...ar(500), fcAmount: 10, fcCurrency: "USD", fxRate: 50 },
        rv(500),
      ],
    });
    const fxLine = store.get(DAY)[0].lines[0];
    expect(fxLine.fcAmount).toBe(10);
    expect(fxLine.fcCurrency).toBe("USD");
    expect(fxLine.fxRate).toBe(50);

    await postEntry({
      ...base,
      sourceId: "s-egp",
      lines: [
        { ...ar(200), fcAmount: 200, fcCurrency: "EGP", fxRate: 1 },
        rv(200),
      ],
    });
    const egpLine = store.get(DAY)[1].lines[0];
    expect(egpLine.fcAmount).toBeUndefined();
    expect(egpLine.fcCurrency).toBeUndefined();
  });
});

/* ───────────────────────── reverseEntry ───────────────────────── */
describe("reverseEntry", () => {
  const base = {
    date: DAY,
    sourceType: "sale",
    sourceId: "s1",
    narration: "بيع اختباري",
    coa: TEST_COA,
    createdBy: "test@clark",
  };

  it("يرفض بدون sourceType/sourceId", async () => {
    const r = await reverseEntry({ date: DAY, sourceType: "", sourceId: "" });
    expect(r.reversed).toBe(false);
    expect(r.reason).toMatch(/مفقود/);
  });

  it("يعيد reversed:false عند عدم وجود قيد", async () => {
    const r = await reverseEntry({ date: DAY, sourceType: "sale", sourceId: "ghost" });
    expect(r.reversed).toBe(false);
    expect(r.reason).toMatch(/لا يوجد قيد/);
  });

  it("يلغي القيد بقيد مرآة معكوس الاتجاه مع روابط متبادلة", async () => {
    await postEntry({ ...base, lines: [ar(100), rv(100)] });
    const r = await reverseEntry({
      date: DAY, sourceType: "sale", sourceId: "s1",
      reason: "اختبار", createdBy: "test@clark",
    });
    expect(r.reversed).toBe(true);

    const day = store.get(DAY);
    expect(day).toHaveLength(2);

    const original = day.find((e) => e.id === r.originalId);
    const mirror = day.find((e) => e.id === r.reversalId);

    expect(original.status).toBe("void");
    expect(original.voidedBy).toBe(mirror.id);
    expect(mirror.voidsEntry).toBe(original.id);
    expect(mirror.sourceType).toBe("sale:reversal");
    expect(mirror.refNo).toMatch(/-VOID$/);

    /* Dr/Cr swapped, same amounts, still balanced */
    expect(mirror.lines[0].debit).toBe(original.lines[0].credit);
    expect(mirror.lines[0].credit).toBe(original.lines[0].debit);
    expectBalanced(mirror);
  });

  it("الإلغاء المزدوج يفشل بأمان (القيد الملغى لا يُعثر عليه)", async () => {
    await postEntry({ ...base, lines: [ar(100), rv(100)] });
    await reverseEntry({ date: DAY, sourceType: "sale", sourceId: "s1" });
    const r2 = await reverseEntry({ date: DAY, sourceType: "sale", sourceId: "s1" });
    expect(r2.reversed).toBe(false);
    /* dayDoc.findEntryBySource skips void entries → "لا يوجد قيد مرتبط" */
    expect(r2.reason).toMatch(/لا يوجد قيد/);
    expect(store.get(DAY)).toHaveLength(2);/* no extra mirror appended */
  });
});

/* ───────────────────────── postManualEntry ───────────────────────── */
describe("postManualEntry", () => {
  it("القيود اليدوية تُضاف دائماً (لا idempotency بدون sourceId)", async () => {
    const args = {
      date: DAY, narration: "قيد يدوي",
      lines: [ar(50), rv(50)], coa: TEST_COA, createdBy: "test@clark",
    };
    await postManualEntry(args);
    await postManualEntry(args);
    const day = store.get(DAY);
    expect(day).toHaveLength(2);
    expect(day[0].sourceType).toBe("manual");
    expect(sumDr(day[0])).toBe(sumCr(day[0]));
  });
});
