/* ═══════════════════════════════════════════════════════════════════════
   postingRules.js test-suite (V21.21.27 — Roadmap Phase 1.1)
   ───────────────────────────────────────────────────────────────────────
   Every builder is pure (no I/O) → tested directly, no mocks.
   The golden invariant for EVERY builder: the returned entry is BALANCED
   (Σ debit = Σ credit within 0.01) — an imbalanced builder corrupts the
   trial balance silently.

   Regression coverage (each maps to a documented incident):
   - V19.66:   sale return must reverse at the ORIGINAL sale price
               (ret.price), not the list price.
   - V21.9.40: hr_other_expense treasury entries must NOT be skipped.
   - V21.9.53: check_collect / check_pay treasury entries must NOT be
               skipped.
   - V21.9.56: service purchase invoice WITH discount must produce an
               exactly-balanced entry (proportional distribution +
               last-line rounding compensation).
   ═══════════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from "vitest";
import { TEST_COA, expectBalanced, sumDr, sumCr } from "./fixtures.js";
import {
  resolveRules,
  buildSaleEntry,
  buildSaleReturnEntry,
  buildSaleCogsEntry,
  buildSaleReturnCogsEntry,
  buildCustomerPaymentEntry,
  buildCustomerCheckEntry,
  buildCheckCollectionEntry,
  buildWorkshopReceiveEntry,
  buildWorkshopPaymentEntry,
  buildHrEntry,
  buildTreasuryEntry,
  buildSalesInvoicePostedEntry,
  buildSalesInvoiceCogsEntry,
  buildPurchaseInvoicePostedEntry,
  buildInvoiceVoidEntry,
  buildCreditNotePostedEntry,
  buildCreditNoteCogsEntry,
  buildDiscountPostedEntry,
  buildDebitNotePostedEntry,
} from "../postingRules.js";

const CUSTOMER = { id: "c1", name: "عميل اختبار", discount: 0 };
const CUSTOMER_DISC = { id: "c2", name: "عميل بخصم", discount: 10 };
const ORDER = { id: "o1", modelNo: "M-100", sellPrice: 200, costPrice: 80 };
const WS = { id: "w1", name: "ورشة اختبار" };

/* ───────────────────────── resolveRules ───────────────────────── */
describe("resolveRules", () => {
  it("يعيد الافتراضيات عند غياب overrides", () => {
    const r = resolveRules(null);
    expect(r.sale.customerAccount).toBe("1210");
    expect(r.sale.revenueAccount).toBe("4100");
    expect(r.treasuryExpense.cashAccount).toBe("1110");
  });

  it("يدمج override جزئياً مع بقاء باقي المفاتيح افتراضية", () => {
    const r = resolveRules({ sale: { revenueAccount: "4101" } });
    expect(r.sale.revenueAccount).toBe("4101");
    expect(r.sale.customerAccount).toBe("1210");/* untouched key in same rule */
    expect(r.saleReturn.returnAccount).toBe("4120");/* untouched rule */
  });
});

/* ───────────────────────── buildSaleEntry ───────────────────────── */
describe("buildSaleEntry", () => {
  it("يعيد null للكمية أو السعر صفر", () => {
    expect(buildSaleEntry({ qty: 0, price: 100, date: "2026-06-10" }, CUSTOMER, ORDER, TEST_COA, null)).toBeNull();
    expect(buildSaleEntry({ qty: 3, price: 0, date: "2026-06-10" }, CUSTOMER, { ...ORDER, sellPrice: 0 }, TEST_COA, null)).toBeNull();
  });

  it("بدون خصم: مدين عملاء = دائن إيرادات", () => {
    const e = buildSaleEntry({ qty: 3, price: 100, date: "2026-06-10", custId: "c1" }, CUSTOMER, ORDER, TEST_COA, null);
    expectBalanced(e);
    expect(e.sourceType).toBe("sale");
    expect(e.lines).toHaveLength(2);
    expect(e.lines[0].accountCode).toBe("1210");
    expect(e.lines[0].debit).toBe(300);
    expect(e.lines[1].accountCode).toBe("4100");
    expect(e.lines[1].credit).toBe(300);
    expect(e.partyHint).toEqual({ kind: "customer", id: "c1", name: "عميل اختبار" });
  });

  it("بخصم 10%: ثلاثة أسطر متوازنة (صافي + خصم = إجمالي)", () => {
    const e = buildSaleEntry({ qty: 3, price: 100, date: "2026-06-10", custId: "c2" }, CUSTOMER_DISC, ORDER, TEST_COA, null);
    expectBalanced(e);
    expect(e.lines).toHaveLength(3);
    expect(e.lines[0].debit).toBe(270);/* net AR */
    expect(e.lines[1].credit).toBe(300);/* gross revenue */
    expect(e.lines[2].accountCode).toBe("4110");
    expect(e.lines[2].debit).toBe(30);/* discount */
  });

  it("يسقط لسعر الأوردر عند غياب سعر التسليمة", () => {
    const e = buildSaleEntry({ qty: 2, date: "2026-06-10" }, CUSTOMER, ORDER, TEST_COA, null);
    expect(e.lines[1].credit).toBe(400);/* 2 × sellPrice 200 */
  });

  it("يرمي خطأً مفهوماً عند غياب حساب من الشجرة", () => {
    const coaNoRevenue = TEST_COA.filter((a) => a.code !== "4100");
    expect(() =>
      buildSaleEntry({ qty: 1, price: 100, date: "2026-06-10" }, CUSTOMER, ORDER, coaNoRevenue, null)
    ).toThrow(/غير موجود في شجرة الحسابات/);
  });

  it("يستخدم _key كـ sourceId عند توفره", () => {
    const e = buildSaleEntry({ qty: 1, price: 100, date: "2026-06-10", _key: "o1:7" }, CUSTOMER, ORDER, TEST_COA, null);
    expect(e.sourceId).toBe("o1:7");
  });
});

/* ───────────────────── buildSaleReturnEntry ───────────────────── */
describe("buildSaleReturnEntry", () => {
  it("V19.66 regression: يعكس بسعر البيع الفعلي (ret.price) لا سعر القائمة", () => {
    /* sale was at a custom 90 EGP while list price is 200 — reversing at
       list price would leave a permanent debit drift on the customer */
    const e = buildSaleReturnEntry({ qty: 2, price: 90, date: "2026-06-10" }, CUSTOMER, ORDER, TEST_COA, null);
    expectBalanced(e);
    expect(e.lines[0].debit).toBe(180);/* 2 × 90, NOT 2 × 200 */
    expect(e.lines[1].credit).toBe(180);
  });

  it("يسقط لسعر القائمة للمرتجعات القديمة بدون سعر", () => {
    const e = buildSaleReturnEntry({ qty: 2, date: "2026-06-10" }, CUSTOMER, ORDER, TEST_COA, null);
    expect(e.lines[1].credit).toBe(400);/* 2 × sellPrice 200 */
  });

  it("يطبق خصم العميل على الصافي", () => {
    const e = buildSaleReturnEntry({ qty: 1, price: 100, date: "2026-06-10" }, CUSTOMER_DISC, ORDER, TEST_COA, null);
    expectBalanced(e);
    expect(e.lines[0].debit).toBe(90);/* 100 × (1 − 10%) */
    expect(e.lines[0].accountCode).toBe("4120");
    expect(e.lines[1].accountCode).toBe("1210");
  });

  it("يعيد null للكمية صفر", () => {
    expect(buildSaleReturnEntry({ qty: 0, price: 100 }, CUSTOMER, ORDER, TEST_COA, null)).toBeNull();
  });
});

/* ───────────────────── COGS builders ───────────────────── */
describe("buildSaleCogsEntry / buildSaleReturnCogsEntry", () => {
  it("بيع: مدين COGS / دائن منتج تام بقيمة الكمية × التكلفة", () => {
    const e = buildSaleCogsEntry({ qty: 3, date: "2026-06-10", _key: "o1:7" }, ORDER, 50, TEST_COA, null);
    expectBalanced(e);
    expect(e.sourceId).toBe("o1:7:cogs");
    expect(e.lines[0].accountCode).toBe("5130");
    expect(e.lines[0].debit).toBe(150);
    expect(e.lines[1].accountCode).toBe("1320");
  });

  it("تكلفة صفر → null (بيع بدون COGS بدلاً من قيد صفري)", () => {
    expect(buildSaleCogsEntry({ qty: 3, date: "2026-06-10" }, ORDER, 0, TEST_COA, null)).toBeNull();
  });

  it("مرتجع: الاتجاه معكوس — مدين منتج تام / دائن COGS", () => {
    const e = buildSaleReturnCogsEntry({ qty: 2, date: "2026-06-10" }, ORDER, 50, TEST_COA, null);
    expectBalanced(e);
    expect(e.lines[0].accountCode).toBe("1320");
    expect(e.lines[0].debit).toBe(100);
    expect(e.lines[1].accountCode).toBe("5130");
  });
});

/* ───────────────── buildCustomerPaymentEntry ───────────────── */
describe("buildCustomerPaymentEntry", () => {
  it("كاش: مدين الخزينة 1110", () => {
    const e = buildCustomerPaymentEntry({ id: "p1", amount: 500, method: "كاش", date: "2026-06-10" }, CUSTOMER, TEST_COA, null);
    expectBalanced(e);
    expect(e.lines[0].accountCode).toBe("1110");
    expect(e.lines[1].accountCode).toBe("1210");
    expect(e.lines[1].partyId).toBe("c1");
  });

  it("تحويل بنكي: مدين البنك 1120", () => {
    const e = buildCustomerPaymentEntry({ id: "p2", amount: 500, method: "تحويل بنكي", date: "2026-06-10" }, CUSTOMER, TEST_COA, null);
    expect(e.lines[0].accountCode).toBe("1120");
  });

  it("شيك → null (للشيكات مسار منفصل)", () => {
    expect(buildCustomerPaymentEntry({ id: "p3", amount: 500, method: "شيك", date: "2026-06-10" }, CUSTOMER, TEST_COA, null)).toBeNull();
  });

  it("مبلغ صفر أو سالب → null", () => {
    expect(buildCustomerPaymentEntry({ id: "p4", amount: 0 }, CUSTOMER, TEST_COA, null)).toBeNull();
    expect(buildCustomerPaymentEntry({ id: "p5", amount: -100 }, CUSTOMER, TEST_COA, null)).toBeNull();
  });
});

/* ───────────────── check builders ───────────────── */
describe("buildCustomerCheckEntry / buildCheckCollectionEntry", () => {
  const CHECK = { id: "ch1", type: "receivable", amount: 1000, checkNo: "123", bank: "CIB", date: "2026-06-10" };

  it("استلام شيك عميل: مدين شيكات تحت التحصيل / دائن عملاء", () => {
    const e = buildCustomerCheckEntry(CHECK, CUSTOMER, TEST_COA, null);
    expectBalanced(e);
    expect(e.lines[0].accountCode).toBe("1130");
    expect(e.lines[1].accountCode).toBe("1210");
  });

  it("شيك مدفوعات (payable) أو فئة غير 'دفعة عميل' → null", () => {
    expect(buildCustomerCheckEntry({ ...CHECK, type: "payable" }, CUSTOMER, TEST_COA, null)).toBeNull();
    expect(buildCustomerCheckEntry({ ...CHECK, category: "ضمان" }, CUSTOMER, TEST_COA, null)).toBeNull();
  });

  it("تحصيل الشيك: فقط عند الحالة 'محصل' — مدين خزينة / دائن شيكات", () => {
    expect(buildCheckCollectionEntry(CHECK, TEST_COA, null)).toBeNull();/* still pending */
    const e = buildCheckCollectionEntry({ ...CHECK, status: "محصل", collectedAt: "2026-06-12" }, TEST_COA, null);
    expectBalanced(e);
    expect(e.date).toBe("2026-06-12");
    expect(e.lines[0].accountCode).toBe("1110");
    expect(e.lines[1].accountCode).toBe("1130");
  });
});

/* ───────────────── workshop builders ───────────────── */
describe("buildWorkshopReceiveEntry / buildWorkshopPaymentEntry", () => {
  it("استلام قطع: مدين منتج تام / دائن تحت التشغيل", () => {
    const e = buildWorkshopReceiveEntry({ id: "r1", qty: 4, price: 25, date: "2026-06-10" }, WS, ORDER, {}, TEST_COA, null);
    expectBalanced(e);
    expect(e.lines[0].accountCode).toBe("1320");
    expect(e.lines[0].debit).toBe(100);
    expect(e.lines[1].accountCode).toBe("1330");
  });

  it("يسقط لسعر بند الورشة (wd.price) عند غياب سعر الاستلام", () => {
    const e = buildWorkshopReceiveEntry({ id: "r2", qty: 2, date: "2026-06-10" }, WS, ORDER, { price: 30 }, TEST_COA, null);
    expect(e.lines[0].debit).toBe(60);
  });

  it("دفعة ورشة: مدين ورش خارجية / دائن خزينة", () => {
    const e = buildWorkshopPaymentEntry({ id: "wp1", amount: 700, date: "2026-06-10" }, WS, TEST_COA, null);
    expectBalanced(e);
    expect(e.sourceType).toBe("workshopPay");
    expect(e.lines[0].accountCode).toBe("2120");
    expect(e.lines[1].accountCode).toBe("1110");
  });

  it("مشتريات عبر الورشة: مدين مخزون خامات", () => {
    const e = buildWorkshopPaymentEntry({ id: "wp2", amount: 700, type: "purchase", date: "2026-06-10" }, WS, TEST_COA, null);
    expect(e.sourceType).toBe("workshopPurchase");
    expect(e.lines[0].accountCode).toBe("1310");
  });
});

/* ───────────────── buildHrEntry ───────────────── */
describe("buildHrEntry", () => {
  const EMP = { id: "e1", name: "موظف اختبار" };

  it("يوجّه راتب/سلفة/مكافأة للحساب الصحيح", () => {
    const salary = buildHrEntry({ id: "h1", type: "راتب شهري", amount: 3000, date: "2026-06-10" }, EMP, TEST_COA, null);
    expect(salary.lines[0].accountCode).toBe("5210");
    expectBalanced(salary);

    const advance = buildHrEntry({ id: "h2", type: "سلفة", amount: 500, date: "2026-06-10" }, EMP, TEST_COA, null);
    expect(advance.lines[0].accountCode).toBe("1220");

    const bonus = buildHrEntry({ id: "h3", type: "مكافأة", amount: 200, date: "2026-06-10" }, EMP, TEST_COA, null);
    expect(bonus.lines[0].accountCode).toBe("5230");
  });

  it("نوع غير معروف أو مبلغ صفر → null", () => {
    expect(buildHrEntry({ id: "h4", type: "بدل انتقال", amount: 100 }, EMP, TEST_COA, null)).toBeNull();
    expect(buildHrEntry({ id: "h5", type: "راتب", amount: 0 }, EMP, TEST_COA, null)).toBeNull();
  });
});

/* ───────────────── buildTreasuryEntry ───────────────── */
describe("buildTreasuryEntry", () => {
  it("V21.9.40 regression: hr_other_expense لا يُتخطى", () => {
    const e = buildTreasuryEntry(
      { id: "t1", sourceType: "hr_other_expense", type: "out", amount: 100, category: "أخرى", date: "2026-06-10" },
      TEST_COA, null, null, null
    );
    expect(e).not.toBeNull();
    expectBalanced(e);
    expect(e.lines[0].accountCode).toBe("5390");/* أخرى → 5390 */
    expect(e.lines[1].accountCode).toBe("1110");/* cash credited on 'out' */
  });

  it("V21.9.53 regression: check_collect / check_pay لا يُتخطيان", () => {
    const collect = buildTreasuryEntry(
      { id: "t2", sourceType: "check_collect", type: "in", amount: 500, category: "أخرى", date: "2026-06-10" },
      TEST_COA, null, null, null
    );
    expect(collect).not.toBeNull();
    const pay = buildTreasuryEntry(
      { id: "t3", sourceType: "check_pay", type: "out", amount: 500, category: "أخرى", date: "2026-06-10" },
      TEST_COA, null, null, null
    );
    expect(pay).not.toBeNull();
  });

  it("sourceType له معالج مخصص (customerPay) → null لمنع الترحيل المزدوج", () => {
    expect(
      buildTreasuryEntry({ id: "t4", sourceType: "customerPay", type: "in", amount: 100 }, TEST_COA, null, null, null)
    ).toBeNull();
  });

  it("وارد: مدين خزينة / دائن إيرادات أخرى (الافتراضي)", () => {
    const e = buildTreasuryEntry(
      { id: "t5", type: "in", amount: 250, category: "فئة غير معروفة", date: "2026-06-10" },
      TEST_COA, null, null, null
    );
    expectBalanced(e);
    expect(e.lines[0].accountCode).toBe("1110");
    expect(e.lines[1].accountCode).toBe("4900");
  });

  it("منصرف: خريطة الفئات توجّه للحساب الصحيح (إيجار → 5310)", () => {
    const e = buildTreasuryEntry(
      { id: "t6", type: "out", amount: 1200, category: "إيجار", date: "2026-06-10" },
      TEST_COA, null, null, null
    );
    expectBalanced(e);
    expect(e.lines[0].accountCode).toBe("5310");
    expect(e.lines[1].accountCode).toBe("1110");
  });
});

/* ───────────── invoice-based builders (V18.50+) ───────────── */
describe("buildSalesInvoicePostedEntry", () => {
  it("مسودة → null", () => {
    expect(buildSalesInvoicePostedEntry({ status: "draft", total: 100 }, CUSTOMER, ORDER, TEST_COA, null)).toBeNull();
  });

  it("فاتورة بضائع بخصم: صافي + خصم = إجمالي، متوازنة", () => {
    const inv = {
      id: "inv1", invoiceNo: "SI-001", status: "posted", date: "2026-06-10",
      subtotal: 1000, discount: 100, total: 900,
      customerName: "عميل اختبار",
      items: [{ qty: 5, modelNo: "M-100" }],
    };
    const e = buildSalesInvoicePostedEntry(inv, CUSTOMER, ORDER, TEST_COA, null);
    expectBalanced(e);
    expect(e.lines[0].debit).toBe(900);/* AR net */
    expect(e.lines[1].credit).toBe(1000);/* gross revenue */
    expect(e.lines[2].debit).toBe(100);/* discount */
    expect(e.sourceId).toBe("inv1");
  });

  it("فاتورة خدمات: تجميع الإيراد حسب accountId مع fallback", () => {
    const inv = {
      id: "inv2", invoiceNo: "SI-002", status: "posted", subtype: "service",
      date: "2026-06-10", subtotal: 500, discount: 0, total: 500,
      items: [
        { lineTotal: 300, accountId: "acc-4900", description: "خدمة أ" },
        { lineTotal: 200, description: "خدمة ب" },/* → fallback 4100 */
      ],
    };
    const e = buildSalesInvoicePostedEntry(inv, CUSTOMER, ORDER, TEST_COA, null);
    expectBalanced(e);
    const codes = e.lines.map((l) => l.accountCode);
    expect(codes).toContain("4900");
    expect(codes).toContain("4100");
  });
});

describe("buildSalesInvoiceCogsEntry", () => {
  const POSTED = {
    id: "inv3", invoiceNo: "SI-003", status: "posted", date: "2026-06-10",
    items: [{ qty: 2 }],
  };
  const CFG_MANUAL = { accountingSettings: { cogsCostSource: "manual" } };

  it("يحسب COGS من التكلفة اليدوية للأوردر", () => {
    const e = buildSalesInvoiceCogsEntry(POSTED, ORDER, TEST_COA, null, CFG_MANUAL);
    expectBalanced(e);
    expect(e.lines[0].debit).toBe(160);/* 2 × costPrice 80 */
    expect(e.lines[0].accountCode).toBe("5130");
    expect(e.lines[1].accountCode).toBe("1320");/* V21.9.87: unified finishedAccount */
    expect(e.sourceId).toBe("inv3#cogs");
  });

  it("COGS معطل في الإعدادات → null", () => {
    expect(
      buildSalesInvoiceCogsEntry(POSTED, ORDER, TEST_COA, null, { accountingSettings: { cogsEnabled: false } })
    ).toBeNull();
  });
});

describe("buildPurchaseInvoicePostedEntry", () => {
  it("فاتورة بضائع: مدين مخزون خامات / دائن موردون", () => {
    const inv = { id: "pi1", invoiceNo: "PI-001", status: "posted", date: "2026-06-10", total: 500, supplierName: "مورد" };
    const e = buildPurchaseInvoicePostedEntry(inv, { id: "s1", name: "مورد" }, TEST_COA, null);
    expectBalanced(e);
    expect(e.lines[0].accountCode).toBe("1310");
    expect(e.lines[1].accountCode).toBe("2110");
  });

  it("V21.9.56 regression: فاتورة خدمات بخصم تتوازن بالقرش تماماً", () => {
    /* 3 lines × 100 with a 22 EGP discount → factor 278/300 = 0.92666…
       per-line r2 gives 92.67 × 3 = 278.01 ≠ 278 → the builder must
       compensate on the last line so Σ debits === total EXACTLY. */
    const inv = {
      id: "pi2", invoiceNo: "PI-002", status: "posted", subtype: "service",
      date: "2026-06-10", subtotal: 300, discount: 22, total: 278,
      supplierName: "مورد خدمات",
      items: [
        { lineTotal: 100, accountId: "acc-5310", description: "إيجار" },
        { lineTotal: 100, accountId: "acc-5390", description: "إدارية" },
        { lineTotal: 100, description: "بدون حساب" },/* → fallback 5290 */
      ],
    };
    const e = buildPurchaseInvoicePostedEntry(inv, { id: "s2", name: "مورد خدمات" }, TEST_COA, null);
    expectBalanced(e);
    expect(sumDr(e)).toBe(278);/* exact, not 278.01 */
    expect(sumCr(e)).toBe(278);
    const apLine = e.lines.find((l) => l.accountCode === "2110");
    expect(apLine.credit).toBe(278);
  });

  it("إجمالي صفر → null", () => {
    expect(buildPurchaseInvoicePostedEntry({ id: "pi3", status: "posted", total: 0 }, null, TEST_COA, null)).toBeNull();
  });
});

describe("buildInvoiceVoidEntry", () => {
  it("يعكس الأسطر ويربط القيد الأصلي", () => {
    const original = {
      id: "je1", sourceType: "salesInvoice", narration: "فاتورة مبيعات SI-001",
      lines: [
        { accountId: "acc-1210", accountCode: "1210", accountName: "العملاء", debit: 900, credit: 0 },
        { accountId: "acc-4100", accountCode: "4100", accountName: "إيرادات", debit: 0, credit: 900 },
      ],
    };
    const e = buildInvoiceVoidEntry(original, { id: "inv1", invoiceNo: "SI-001", voidedAt: "2026-06-11T10:00:00Z" });
    expectBalanced(e);
    expect(e.sourceType).toBe("salesInvoiceVoid");
    expect(e.sourceId).toBe("inv1#void");
    expect(e.voidsEntry).toBe("je1");
    expect(e.date).toBe("2026-06-11");
    expect(e.lines[0].debit).toBe(0);
    expect(e.lines[0].credit).toBe(900);/* swapped */
  });

  it("بدون قيد أصلي → null", () => {
    expect(buildInvoiceVoidEntry(null, { id: "x" })).toBeNull();
  });
});

describe("buildCreditNotePostedEntry / buildDebitNotePostedEntry", () => {
  it("إشعار دائن: مدين مرتجع مبيعات / دائن عملاء", () => {
    const cn = {
      id: "cn1", creditNoteNo: "CN-001", status: "posted", date: "2026-06-10",
      subtotal: 200, discount: 0, total: 200, customerName: "عميل",
      items: [{ qty: 1, modelNo: "M-100" }],
    };
    const e = buildCreditNotePostedEntry(cn, CUSTOMER, ORDER, TEST_COA, null);
    expectBalanced(e);
    expect(e.lines[0].accountCode).toBe("4120");
    expect(e.lines[1].accountCode).toBe("1210");
  });

  it("إشعار دائن COGS: يرجع البضاعة للمخزون بتكلفة الأوردر", () => {
    const cn = { id: "cn2", creditNoteNo: "CN-002", status: "posted", date: "2026-06-10", items: [{ qty: 3 }] };
    const e = buildCreditNoteCogsEntry(cn, ORDER, TEST_COA, null, { accountingSettings: { cogsCostSource: "manual" } });
    expectBalanced(e);
    expect(e.lines[0].accountCode).toBe("1320");/* Dr inventory back in */
    expect(e.lines[0].debit).toBe(240);/* 3 × 80 */
    expect(e.lines[1].accountCode).toBe("5130");
  });

  it("إشعار مدين: مدين موردون / دائن مرتجع مشتريات", () => {
    const dn = {
      id: "dn1", debitNoteNo: "DN-001", status: "posted", date: "2026-06-10",
      total: 150, supplierName: "مورد", items: [{ qty: 2, name: "قماش" }],
    };
    const e = buildDebitNotePostedEntry(dn, { id: "s1", name: "مورد" }, TEST_COA, null);
    expectBalanced(e);
    expect(e.lines[0].accountCode).toBe("2110");
    expect(e.lines[1].accountCode).toBe("5140");
  });

  it("غير المرحّل → null", () => {
    expect(buildCreditNotePostedEntry({ status: "draft", total: 100 }, CUSTOMER, ORDER, TEST_COA, null)).toBeNull();
    expect(buildDebitNotePostedEntry({ status: "draft", total: 100 }, null, TEST_COA, null)).toBeNull();
  });
});

describe("buildDiscountPostedEntry (خصم إضافي)", () => {
  it("خصم إضافي: مدين خصم مسموح به (4110) / دائن عملاء (1210)", () => {
    const dn = {
      id: "disc1", creditNoteNo: "خصم-2026-0001", kind: "discount", status: "posted",
      date: "2026-06-12", subtotal: 500, discount: 0, total: 500,
      customerName: "عميل", reason: "خصم آخر الموسم", items: [],
    };
    const e = buildDiscountPostedEntry(dn, CUSTOMER, TEST_COA, null);
    expectBalanced(e);
    expect(e.sourceType).toBe("salesDiscount");
    expect(e.sourceId).toBe("disc1");
    expect(e.lines[0].accountCode).toBe("4110");/* Dr خصم مسموح به */
    expect(e.lines[0].debit).toBe(500);
    expect(e.lines[1].accountCode).toBe("1210");/* Cr عملاء */
    expect(e.lines[1].credit).toBe(500);
    expect(e.lines[1].partyId).toBe(CUSTOMER.id);
  });

  it("غير المرحّل أو صفر → null", () => {
    expect(buildDiscountPostedEntry({ status: "draft", total: 100 }, CUSTOMER, TEST_COA, null)).toBeNull();
    expect(buildDiscountPostedEntry({ status: "posted", total: 0 }, CUSTOMER, TEST_COA, null)).toBeNull();
  });
});
