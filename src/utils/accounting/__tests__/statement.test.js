/* ═══════════════════════════════════════════════════════════════════════
   اختبارات كشف الحساب (statement.js) — V21.21.29
   ───────────────────────────────────────────────────────────────────────
   أهم اختبار هنا: «تطابق تدفق البيانات» — رصيد إقفال الكشف التشغيلي لازم
   يساوي رصيد الملخص (buildCustomerSummary / buildSupplierSummary) لنفس
   البيانات. ده بالظبط صنف حادثة V21.21.22 (رصيد بوابة العميل ≠ كشف
   الحساب) — أي انحراف مستقبلي بين الحسابين هيقع هنا فوراً.

   تغطية الحوادث الموثقة:
   - V21.21.14: الشيك يظهر مرة واحدة (من data.checks) وحركات الخزنة
     check_collect/check_pay مستبعدة + dedup شيكات المورد بالـ checkId.
   - V21.21.21: الإشعارات المدينة تظهر في الوضع التشغيلي للمورد.
   - V21.21.1: مرايا التوزيعة لا تظهر ولا تُحتسب.
   ═══════════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from "vitest";
import { buildAccountStatement } from "../statement.js";
import { buildCustomerSummary, buildSupplierSummary } from "../../accountSummary.js";
import { makeFactoryData } from "../../__tests__/dataFixture.js";

const custStmt = (data, extra = {}) =>
  buildAccountStatement(data, { partyId: "c1", partyType: "customer", mode: "operational", ...extra });
const supStmt = (data, extra = {}) =>
  buildAccountStatement(data, { partyId: "sup1", partyType: "supplier", mode: "operational", ...extra });

/* ───────────── تطابق تدفق البيانات (الاختبار الأهم) ───────────── */
describe("تطابق الكشف التشغيلي مع الملخصات (صنف حادثة V21.21.22)", () => {
  it("رصيد إقفال كشف العميل = رصيد buildCustomerSummary", () => {
    const data = makeFactoryData();
    const stmt = custStmt(data);
    const summary = buildCustomerSummary("c1", data);
    expect(stmt.totals.closing).toBe(summary.balance);
    expect(stmt.totals.closing).toBe(370);
  });

  it("رصيد إقفال كشف المورد = رصيد buildSupplierSummary", () => {
    const data = makeFactoryData();
    const stmt = supStmt(data);
    const summary = buildSupplierSummary("sup1", data);
    expect(stmt.totals.closing).toBe(summary.balance);
    expect(stmt.totals.closing).toBe(230);
  });
});

/* ───────────── كشف العميل التشغيلي ───────────── */
describe("كشف العميل — الوضع التشغيلي", () => {
  it("الرصيد التراكمي يتحرك بالترتيب الزمني الصحيح", () => {
    const stmt = custStmt(makeFactoryData());
    /* 6-01 تسليم 900 → 6-03 دفعة −300 → 6-04 شيك −200 → 6-05 مرتجع −180 → 6-08 أمر بيع +150 */
    expect(stmt.rows.map((r) => r.balance)).toEqual([900, 600, 400, 220, 370]);
  });

  it("V21.21.1 regression: مرآة التوزيعة لا تظهر كصف في الكشف", () => {
    const stmt = custStmt(makeFactoryData());
    const refs = stmt.rows.map((r) => r.refId);
    expect(refs).toContain("so1");
    expect(refs).not.toContain("so2");/* المرآة قيمتها 9999 — لو ظهرت الرصيد ينفجر */
  });

  it("V21.21.14 regression: حركة خزنة check_collect لا تتكرر مع الشيك", () => {
    const data = makeFactoryData();
    /* المستخدم حصّل الشيك ch1 → اتولّدت حركة خزنة وارد بنفس المبلغ */
    data.checks[0].status = "محصل";
    data.treasury.push({ id: "t-cc", type: "in", amount: 200, custId: "c1", sourceType: "check_collect", date: "2026-06-06" });
    const stmt = custStmt(data);
    /* الشيك يتعدّ مرة واحدة بس — الرصيد ثابت 370 مش 170 */
    expect(stmt.totals.closing).toBe(370);
    expect(stmt.rows.filter((r) => r.type === "treasury")).toHaveLength(0);
  });

  it("V21.21.30: دفعة الخزنة اليتيمة تظهر في الكشف وتدخل رصيد الملخص (تطابق)", () => {
    const data = makeFactoryData();
    data.treasury.push({ id: "t-orphan", type: "in", amount: 50, custId: "c1", date: "2026-06-07" });
    const stmt = custStmt(data);
    const orphan = stmt.rows.find((r) => r.type === "treasury");
    expect(orphan).toBeTruthy();
    expect(orphan.credit).toBe(50);
    expect(stmt.totals.closing).toBe(320);
    /* قرار Ahmed (V21.21.30): «الدفعة في أي مكان تتسجل تظهر في الكشف
       والملخصات» — الرصيدان لازم يتطابقا حتى مع اليتيمة. */
    expect(buildCustomerSummary("c1", data).balance).toBe(320);
  });

  it("الحركة المرتبطة (treasuryTxId) لا تتعدّ مرتين", () => {
    const data = makeFactoryData();
    data.treasury.push({ id: "t-linked", type: "in", amount: 300, custId: "c1", date: "2026-06-03" });
    data.custPayments[0].treasuryTxId = "t-linked";
    expect(custStmt(data).totals.closing).toBe(370);
  });

  it("الرصيد الافتتاحي مع fromDate يساوي صافي ما قبله", () => {
    const stmt = custStmt(makeFactoryData(), { fromDate: "2026-06-04" });
    expect(stmt.openingBalance).toBe(600);/* 900 − 300 */
    expect(stmt.rows.map((r) => r.balance)).toEqual([400, 220, 370]);
    expect(stmt.totals.closing).toBe(370);
  });
});

/* ───────────── كشف العميل المحاسبي ───────────── */
describe("كشف العميل — الوضع المحاسبي (فواتير/إشعارات)", () => {
  const acctData = () => {
    const data = makeFactoryData();
    data.salesInvoices = [
      { id: "inv1", invoiceNo: "INV-1", customerId: "c1", status: "posted", date: "2026-06-01", subtotal: 1000, discount: 100, total: 900, items: [] },
      { id: "inv2", invoiceNo: "INV-2", customerId: "c1", status: "draft", date: "2026-06-02", subtotal: 200, total: 200, items: [] },
      { id: "inv3", invoiceNo: "INV-3", customerId: "c1", status: "void", date: "2026-06-02", subtotal: 555, total: 555, items: [] },
    ];
    data.salesCreditNotes = [
      { id: "cn1", creditNoteNo: "CN-1", customerId: "c1", status: "posted", date: "2026-06-03", total: 100 },
    ];
    return data;
  };

  it("المسودة تظهر باهتة (بدون رصيد) ولا تدخل الإجماليات", () => {
    const stmt = buildAccountStatement(acctData(), { partyId: "c1", partyType: "customer", mode: "accounting" });
    const draft = stmt.rows.find((r) => r.refId === "inv2");
    expect(draft.draft).toBe(true);
    expect(draft.balance).toBeNull();
    /* مرحّلة 900 − إشعار 100 − دفعة 300 − شيك 200 = 300 */
    expect(stmt.totals.closing).toBe(300);
    expect(stmt.totals.debit).toBe(900);/* المسودة مش داخلة */
  });

  it("الفاتورة الملغاة (void) لا تظهر إطلاقاً", () => {
    const stmt = buildAccountStatement(acctData(), { partyId: "c1", partyType: "customer", mode: "accounting" });
    expect(stmt.rows.find((r) => r.refId === "inv3")).toBeUndefined();
  });
});

/* ───────────── كشف المورد ───────────── */
describe("كشف المورد — الوضع التشغيلي", () => {
  it("V21.21.21 regression: الإشعار المدين يظهر في التشغيلي ويقلّل الرصيد", () => {
    const stmt = supStmt(makeFactoryData());
    const dn = stmt.rows.find((r) => r.type === "debit_note");
    expect(dn).toBeTruthy();
    expect(dn.credit).toBe(50);
  });

  it("V21.21.14 regression: شيك الدفع المرتبط بدفعة مورد (checkId) لا يتعدّ مرتين", () => {
    const data = makeFactoryData();
    /* الدفعة المستقلة sp1 اتسجلت بشيك — الشيك نفسه موجود في data.checks */
    data.checks.push({ id: "chs1", type: "payable", partyId: "sup1", amount: 120, status: "معلق", checkNo: "555", date: "2026-06-07" });
    data.supplierPayments[0].checkId = "chs1";
    const stmt = supStmt(data);
    expect(stmt.totals.closing).toBe(230);/* مش 110 */
    expect(stmt.rows.filter((r) => r.type === "check")).toHaveLength(0);
  });

  it("V21.21.30: شيك الدفع المعلق غير المرتبط يظهر في الكشف ويدخل رصيد الملخص (تطابق)", () => {
    const data = makeFactoryData();
    data.checks.push({ id: "chs2", type: "payable", partyId: "sup1", amount: 60, status: "معلق", checkNo: "556", date: "2026-06-08" });
    const stmt = supStmt(data);
    const check = stmt.rows.find((r) => r.type === "check");
    expect(check.credit).toBe(60);
    expect(stmt.totals.closing).toBe(170);/* 230 − 60 */
    /* قرار Ahmed (V21.21.30): الرصيدان لازم يتطابقا حتى مع الشيك المعلق. */
    const sum = buildSupplierSummary("sup1", data);
    expect(sum.payChecks).toBe(60);
    expect(sum.balance).toBe(170);
  });

  it("حركة الخزنة بعد حذفها (tombstone) لا تظهر في الكشف", () => {
    const data = makeFactoryData();
    data.treasury.push({ id: "t-sup", type: "out", amount: 70, supplierId: "sup1", date: "2026-06-08" });
    expect(supStmt(data).totals.closing).toBe(160);/* 230 − 70 */
    data._deletedSupplierPayTreasuryIds = ["t-sup"];
    expect(supStmt(data).totals.closing).toBe(230);
  });
});

/* ───────────── الفلاتر ───────────── */
describe("فلاتر الكشف", () => {
  it("فلتر النوع: إخفاء الدفعات يبقي الفواتير والمرتجعات", () => {
    const stmt = custStmt(makeFactoryData(), { typeFilters: { invoices: true, returns: true, payments: false } });
    expect(stmt.rows.filter((r) => r.type === "payment" || r.type === "check")).toHaveLength(0);
    expect(stmt.rows.filter((r) => r.type === "delivery").length).toBeGreaterThan(0);
  });

  it("فلتر رقم المرجع يطابق جزئياً", () => {
    const stmt = custStmt(makeFactoryData(), { invoiceNoFilter: "SO-1" });
    expect(stmt.rows).toHaveLength(1);
    expect(stmt.rows[0].refId).toBe("so1");
  });
});

/* ───────────── V21.27.56 — locator القيد اليومية للحركة ───────────── */
import { journalLocatorForRow } from "../statement.js";

describe("journalLocatorForRow — ربط الحركة بقيدها اليومي", () => {
  it("فاتورة مبيعات → salesInvoice بـ id المستند", () => {
    const loc = journalLocatorForRow({ type: "sales_invoice", date: "2026-06-10", raw: { id: "inv1", date: "2026-06-10" } }, "customer");
    expect(loc).toEqual({ sourceType: "salesInvoice", sourceId: "inv1", date: "2026-06-10" });
  });

  it("خصم إضافي → salesDiscount", () => {
    const loc = journalLocatorForRow({ type: "discount", date: "2026-06-11", raw: { id: "cn5", date: "2026-06-11", kind: "discount" } }, "customer");
    expect(loc).toMatchObject({ sourceType: "salesDiscount", sourceId: "cn5" });
  });

  it("دفعة عميل → customerPay", () => {
    const loc = journalLocatorForRow({ type: "payment", date: "2026-06-12", raw: { id: "p1", date: "2026-06-12" } }, "customer");
    expect(loc).toMatchObject({ sourceType: "customerPay", sourceId: "p1" });
  });

  it("شيك قبض من عميل → customerCheck", () => {
    const loc = journalLocatorForRow({ type: "check", date: "2026-06-13", raw: { id: "c1", type: "receivable", date: "2026-06-13" } }, "customer");
    expect(loc).toMatchObject({ sourceType: "customerCheck", sourceId: "c1" });
  });

  it("حركة خزنة → treasury", () => {
    const loc = journalLocatorForRow({ type: "treasury", date: "2026-06-14", raw: { id: "t1", date: "2026-06-14" } }, "customer");
    expect(loc).toMatchObject({ sourceType: "treasury", sourceId: "t1" });
  });

  it("فاتورة مشتريات → purchaseInvoice", () => {
    const loc = journalLocatorForRow({ type: "purchase_invoice", date: "2026-06-15", raw: { id: "pinv1", date: "2026-06-15" } }, "supplier");
    expect(loc).toMatchObject({ sourceType: "purchaseInvoice", sourceId: "pinv1" });
  });

  it("دفعة مورد مرتبطة بخزنة → treasury بـ treasuryTxId", () => {
    const loc = journalLocatorForRow({ type: "payment", date: "2026-06-16", raw: { id: "sp1", treasuryTxId: "tx9", date: "2026-06-16" } }, "supplier");
    expect(loc).toMatchObject({ sourceType: "treasury", sourceId: "tx9" });
  });

  it("تسليم تشغيلي مجمّع → null (مفيش قيد منفرد)", () => {
    expect(journalLocatorForRow({ type: "delivery", date: "2026-06-10", detail: { kind: "session" }, raw: {} }, "customer")).toBeNull();
  });

  it("مسودة → null (مش مرحّلة)", () => {
    expect(journalLocatorForRow({ type: "sales_invoice", draft: true, raw: { id: "inv2", date: "2026-06-10" } }, "customer")).toBeNull();
  });
});
