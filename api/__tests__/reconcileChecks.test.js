/* ═══════════════════════════════════════════════════════════════════════
   اختبارات فحوصات المطابقة المالية (api/_reconcileChecks.js) — V21.21.34
   ───────────────────────────────────────────────────────────────────────
   كل فحص متغطي بسيناريو سليم (صفر مشاكل) وسيناريو منحرف (المشكلة تُلتقط)
   — لأن فحص مطابقة بيكذب في الاتجاهين أسوأ من عدمه: false-negative يفوّت
   انحراف حقيقي، وfalse-positive يبعت واتساب مزعج كل يوم لحد ما يتقفل.
   ═══════════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from "vitest";
import {
  checkTransferLegs,
  checkJournalBalance,
  checkDuplicateTreasuryIds,
  checkPostedInvoicesHaveJournal,
  checkUnresolvedPostFailures,
  checkConfigSize,
  runAllChecks,
  buildAlertMessage,
} from "../_reconcileChecks.js";

const TF = { id: "tf1", status: "confirmed", fromAccount: "MAIN", toAccount: "SUB", amount: 1000, date: "2026-06-01" };
const LEG = (type) => ({ id: "tf-tf1-" + type, type, amount: 1000, transferId: "tf1", date: "2026-06-01" });

/* ───── فحص ١: أرجل التحويلات ───── */
describe("checkTransferLegs", () => {
  it("تحويل سليم برجلين → صفر مشاكل", () => {
    expect(checkTransferLegs([TF], [LEG("out"), LEG("in")])).toEqual([]);
  });

  it("V21.9.45 class: رجل ناقصة تُلتقط", () => {
    const issues = checkTransferLegs([TF], [LEG("out")]);/* الـ in مفقودة */
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe("transfer-missing-legs");
    expect(issues[0].severity).toBe("high");
    expect(issues[0].details[0].id).toBe("tf1");
  });

  it("V21.9.14 class: أرجل مكررة تُلتقط", () => {
    const dup = { ...LEG("out"), id: "leg-rand-2" };
    const issues = checkTransferLegs([TF], [LEG("out"), dup, LEG("in")]);
    expect(issues.map(i => i.type)).toContain("transfer-duplicate-legs");
  });

  it("التحويل المعلق (غير المؤكد) لا يُفحص", () => {
    expect(checkTransferLegs([{ ...TF, status: "pending" }], [])).toEqual([]);
  });
});

/* ───── فحص ٢: توازن القيود ───── */
describe("checkJournalBalance", () => {
  const balanced = { id: "je1", refNo: "JE-1", status: "posted", lines: [{ debit: 100, credit: 0 }, { debit: 0, credit: 100 }] };

  it("قيود متوازنة → صفر مشاكل (وحد السماح 0.01 محترم)", () => {
    const within = { ...balanced, id: "je2", lines: [{ debit: 100.005, credit: 0 }, { debit: 0, credit: 100 }] };
    expect(checkJournalBalance([balanced, within])).toEqual([]);
  });

  it("قيد غير متوازن يُلتقط بقيمتيه", () => {
    const bad = { id: "je3", refNo: "JE-3", status: "posted", _day: "2026-06-05", lines: [{ debit: 300, credit: 0 }, { debit: 0, credit: 278 }] };
    const issues = checkJournalBalance([bad]);
    expect(issues[0].type).toBe("journal-imbalanced");
    expect(issues[0].details[0]).toMatchObject({ refNo: "JE-3", dr: 300, cr: 278 });
  });

  it("القيد الملغي (void) لا يُفحص", () => {
    const voided = { id: "je4", status: "void", lines: [{ debit: 999, credit: 0 }] };
    expect(checkJournalBalance([voided])).toEqual([]);
  });
});

/* ───── فحص ٣: تكرار الخزنة ───── */
describe("checkDuplicateTreasuryIds", () => {
  it("معرّفات فريدة → صفر مشاكل", () => {
    expect(checkDuplicateTreasuryIds([{ id: "t1" }, { id: "t2" }])).toEqual([]);
  });

  it("نفس المعرّف مرتين (عبر يومين) يُلتقط", () => {
    const issues = checkDuplicateTreasuryIds([
      { id: "t1", _day: "2026-06-01" },
      { id: "t1", _day: "2026-06-02" },
    ]);
    expect(issues[0].type).toBe("treasury-duplicate-ids");
    expect(issues[0].details[0]).toMatchObject({ id: "t1", occurrences: 2 });
  });
});

/* ───── فحص ٤: فواتير بلا قيد ───── */
describe("checkPostedInvoicesHaveJournal", () => {
  const INV = { id: "inv1", invoiceNo: "INV-1", date: "2026-06-05", status: "posted", _kind: "sales" };
  const JE = { id: "je1", status: "posted", sourceType: "salesInvoice", sourceId: "inv1" };
  const OPTS = { autoPostFromInvoice: true, autoPostEnabled: undefined, fromDate: "2026-06-01" };

  it("فاتورة لها قيد → صفر مشاكل", () => {
    expect(checkPostedInvoicesHaveJournal([INV], [JE], OPTS)).toEqual([]);
  });

  it("فاتورة مرحّلة بلا قيد تُلتقط (تحذير مش خطر)", () => {
    const issues = checkPostedInvoicesHaveJournal([INV], [], OPTS);
    expect(issues[0].type).toBe("invoice-missing-journal");
    expect(issues[0].severity).toBe("warn");
  });

  it("الفحص معطل خارج وضع الترحيل-من-الفاتورة (يمنع false-positives)", () => {
    expect(checkPostedInvoicesHaveJournal([INV], [], { ...OPTS, autoPostFromInvoice: false })).toEqual([]);
    expect(checkPostedInvoicesHaveJournal([INV], [], { ...OPTS, autoPostEnabled: false })).toEqual([]);
  });

  it("المسودة وفاتورة ما قبل النافذة لا يُفحصان", () => {
    const draft = { ...INV, id: "inv2", status: "draft" };
    const old = { ...INV, id: "inv3", date: "2026-05-20" };
    expect(checkPostedInvoicesHaveJournal([draft, old], [], OPTS)).toEqual([]);
  });
});

/* ───── فحص ٥ + ٦ ───── */
describe("checkUnresolvedPostFailures / checkConfigSize", () => {
  it("الفشل المُعالج (resolvedAt) لا يُحتسب", () => {
    const cfg = { accountingPostFailures: [
      { id: "f1", type: "sale", resolvedAt: "2026-06-01" },
      { id: "f2", type: "treasury", errorMessage: "x" },
    ]};
    const issues = checkUnresolvedPostFailures(cfg);
    expect(issues[0].count).toBe(1);
  });

  it("حجم config: هادي تحت 70% · تحذير 70-84% · خطر 85%+", () => {
    const MB = 1048576;
    expect(checkConfigSize(Math.round(MB * 0.5))).toEqual([]);
    expect(checkConfigSize(Math.round(MB * 0.75))[0].severity).toBe("warn");
    expect(checkConfigSize(Math.round(MB * 0.9))[0].severity).toBe("high");
  });
});

/* ───── المجمّع + الرسالة ───── */
describe("runAllChecks / buildAlertMessage", () => {
  it("بيانات سليمة → ok:true وصفر مشاكل", () => {
    const r = runAllChecks({
      transfers: [TF],
      treasury: [LEG("out"), LEG("in")],
      accountingEntries: [],
      invoices: [],
      cfg: {},
      cfgBytes: 1000,
      fromDate: "2026-06-01", toDate: "2026-06-10", windowDays: 45,
    });
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
    expect(r.scanned.transfers).toBe(1);
  });

  it("الانحرافات تتجمع بعدّادي high/warn صحيحين", () => {
    const r = runAllChecks({
      transfers: [TF],
      treasury: [LEG("out")],/* رجل ناقصة = high */
      accountingEntries: [],
      invoices: [],
      cfg: { accountingPostFailures: [{ id: "f1", type: "sale" }] },/* warn */
      cfgBytes: 0,
      fromDate: "2026-06-01", toDate: "2026-06-10", windowDays: 45,
    });
    expect(r.ok).toBe(false);
    expect(r.highCount).toBe(1);
    expect(r.warnCount).toBe(1);
  });

  it("رسالة الواتساب تتضمن كل مشكلة بعدّها وإيموجي خطورتها", () => {
    const r = runAllChecks({
      transfers: [TF], treasury: [LEG("out")],
      accountingEntries: [], invoices: [], cfg: {}, cfgBytes: 0,
      fromDate: "2026-06-01", toDate: "2026-06-10", windowDays: 45,
    });
    const msg = buildAlertMessage(r, "2026-06-10");
    expect(msg).toContain("CLARK — تقرير المطابقة المالية");
    expect(msg).toContain("2026-06-10");
    expect(msg).toContain("🔴");
    expect(msg).toContain("*1*");
  });
});
