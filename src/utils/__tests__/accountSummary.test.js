/* ═══════════════════════════════════════════════════════════════════════
   اختبارات الأرصدة والملخصات (accountSummary.js) — V21.21.29
   ───────────────────────────────────────────────────────────────────────
   تغطية الحوادث/القواعد الموثقة:
   - V21.21.1: مرآة التوزيعة (sourceDistributionId) لا تُحتسب أبداً.
   - V21.9.83: تسويات الورش (isSettlement) لا تدخل المستحق النقدي.
   - V21.21.20: الإشعارات المدينة تقلّل رصيد المورد.
   - §14.5: ترتيب البراميترات (الـ id الأول ثم data) — سهل ينعكس بالغلط.
   ═══════════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from "vitest";
import {
  computeSalesOverviewTotals,
  buildCustomerSummary,
  buildSupplierSummary,
  computeWorkshopDue,
  computeWorkshopBalance,
  buildWorkshopSummary,
} from "../accountSummary.js";
import { makeFactoryData } from "./dataFixture.js";

/* ───────────── buildCustomerSummary ───────────── */
describe("buildCustomerSummary — رصيد العميل التشغيلي", () => {
  it("الرصيد الذهبي: مبيعات − مرتجع + أوامر بيع − دفعات − شيكات = 370", () => {
    const s = buildCustomerSummary("c1", makeFactoryData());
    expect(s.salesGross).toBe(1000);
    expect(s.discAmt).toBe(100);
    expect(s.salesNet).toBe(900);
    expect(s.returnsNet).toBe(180);
    expect(s.salesOrdersNet).toBe(150);/* so1 فقط */
    expect(s.payCash).toBe(300);
    expect(s.payCheck).toBe(200);
    expect(s.balance).toBe(370);
  });

  it("V21.21.1 regression: مرآة التوزيعة لا تدخل الرصيد مهما كان مبلغها", () => {
    const data = makeFactoryData();
    /* المرآة so2 قيمتها 9999 وموجودة فعلاً في الـ fixture — لو اتحسبت
       الرصيد يقفز فوق الـ 10000. كمان نضيف مرآة تانية ضخمة للتأكيد. */
    data.salesOrders.push({
      id: "so3", customerId: "c1", status: "delivered",
      sourceDistributionId: "sessX:c1", total: 50000, items: [],
    });
    expect(buildCustomerSummary("c1", data).balance).toBe(370);
  });

  it("أمر البيع الملغي (cancelled) لا يُحتسب", () => {
    const data = makeFactoryData();
    data.salesOrders.push({ id: "so4", customerId: "c1", status: "cancelled", total: 7777, items: [] });
    expect(buildCustomerSummary("c1", data).balance).toBe(370);
  });

  it("دفعة بطريقة «شيك» في custPayments لا تتعدّ كاش (الشيك يُعدّ من data.checks)", () => {
    const data = makeFactoryData();
    data.custPayments.push({ id: "p2", custId: "c1", amount: 500, method: "شيك", date: "2026-06-06" });
    const s = buildCustomerSummary("c1", data);
    /* المبلغ مش المفروض يظهر لا كاش ولا غيره — الشيك نفسه بيتسجل في checks */
    expect(s.payCash).toBe(300);
    expect(s.payOther).toBe(0);
  });

  it("الشيك المرتد أو الملغي لا يُحتسب كدفعة", () => {
    const data = makeFactoryData();
    data.checks.push(
      { id: "ch2", type: "receivable", partyId: "c1", amount: 400, status: "مرتد", date: "2026-06-06" },
      { id: "ch3", type: "receivable", partyId: "c1", amount: 400, status: "ملغي", date: "2026-06-06" },
    );
    expect(buildCustomerSummary("c1", makeFactoryData()).payCheck).toBe(200);
    expect(buildCustomerSummary("c1", data).payCheck).toBe(200);
  });

  it("§14.5: ترتيب البراميترات معكوساً يرجّع null (مش رقم غلط صامت)", () => {
    const data = makeFactoryData();
    expect(buildCustomerSummary(data, "c1")).toBeNull();
    expect(buildCustomerSummary("c1", data)).not.toBeNull();
  });

  it("V21.21.30: دفعة الخزنة اليتيمة تدخل الرصيد — والمرتبطة لا تتكرر", () => {
    const data = makeFactoryData();
    data.treasury.push({ id: "t-orphan", type: "in", amount: 50, custId: "c1", date: "2026-06-07" });
    const s = buildCustomerSummary("c1", data);
    expect(s.payOther).toBe(50);
    expect(s.balance).toBe(320);/* 370 − 50 */

    /* لما الحركة مرتبطة بدفعة رسمية (treasuryTxId) ماتتعدّش مرتين */
    data.custPayments[0].treasuryTxId = "t-orphan";
    expect(buildCustomerSummary("c1", data).balance).toBe(370);
  });

  it("V21.21.30: حركات تحصيل الشيكات (check_collect) لا تدخل كدفعة يتيمة", () => {
    const data = makeFactoryData();
    data.checks[0].status = "محصل";
    data.treasury.push({ id: "t-cc", type: "in", amount: 200, custId: "c1", sourceType: "check_collect", date: "2026-06-06" });
    expect(buildCustomerSummary("c1", data).balance).toBe(370);/* الشيك متعدّ مرة واحدة */
  });
});

/* ───────────── buildSupplierSummary ───────────── */
describe("buildSupplierSummary — رصيد المورد التشغيلي", () => {
  it("الرصيد الذهبي: استلامات − مرتجعات − مدفوعات = 230", () => {
    const s = buildSupplierSummary("sup1", makeFactoryData());
    expect(s.totalInvoiced).toBe(500);
    expect(s.totalReturns).toBe(50);/* V21.21.20 */
    expect(s.totalPaid).toBe(220);/* 100 عند الاستلام + 120 مستقلة */
    expect(s.balance).toBe(230);
  });

  it("الدفعة المرتبطة باستلام (receiptId) لا تُعدّ مرتين", () => {
    const data = makeFactoryData();
    /* الدفعة دي قيمتها داخلة أصلاً في paidAmount بتاع الاستلام */
    data.supplierPayments.push({ id: "sp2", supplierId: "sup1", receiptId: "r1", amount: 100, date: "2026-06-02" });
    expect(buildSupplierSummary("sup1", data).totalPaid).toBe(220);
  });

  it("حركة خزنة يتيمة (out بمورد) تُحتسب دفعة — مع احترام الـ tombstones", () => {
    const data = makeFactoryData();
    data.treasury.push({ id: "t2", type: "out", amount: 80, supplierId: "sup1", date: "2026-06-08" });
    expect(buildSupplierSummary("sup1", data).totalPaid).toBe(300);

    /* بعد ما المستخدم حذف الدفعة دي (tombstone) ماترجعش تتعدّ تاني */
    data._deletedSupplierPayTreasuryIds = ["t2"];
    expect(buildSupplierSummary("sup1", data).totalPaid).toBe(220);
  });

  it("حركة ارتداد شيك (check_bounce) لا تُحتسب دفعة للمورد", () => {
    const data = makeFactoryData();
    data.treasury.push({ id: "t3", type: "out", amount: 80, supplierId: "sup1", sourceType: "check_bounce", date: "2026-06-08" });
    expect(buildSupplierSummary("sup1", data).totalPaid).toBe(220);
  });

  it("الإشعار المدين الملغي (void) لا يقلّل الرصيد", () => {
    const data = makeFactoryData();
    data.purchaseDebitNotes.push({ id: "dn2", supplierId: "sup1", total: 999, status: "void", date: "2026-06-08" });
    expect(buildSupplierSummary("sup1", data).balance).toBe(230);
  });

  it("V21.21.30: شيك الدفع المعلق غير المرتبط يقلّل الرصيد — والمرتبط لا يتكرر", () => {
    const data = makeFactoryData();
    data.checks.push({ id: "chs1", type: "payable", partyId: "sup1", amount: 60, status: "معلق", date: "2026-06-08" });
    const s = buildSupplierSummary("sup1", data);
    expect(s.payChecks).toBe(60);
    expect(s.balance).toBe(170);/* 230 − 60 */

    /* الشيك المرتبط بدفعة مورد (checkId) متعدّ ضمن المدفوعات — لا يتكرر */
    data.supplierPayments[0].checkId = "chs1";
    const s2 = buildSupplierSummary("sup1", data);
    expect(s2.payChecks).toBe(0);
    expect(s2.balance).toBe(230);
  });

  it("V21.27.215 (H3): شيك دفع مورد مدفوع لا يُحتسب مرتين (رِجل خزنة check_pay + data.checks)", () => {
    const data = makeFactoryData();
    /* شيك دفع مورد اتعمل من فورم الخزنة (غير مرتبط بـ supplierPayment) واتعلّم «مدفوع».
       بيسجّل: (1) شيك في data.checks، (2) رِجل خزنة out بـ sourceType=check_pay. */
    data.checks.push({ id: "chp1", type: "payable", partyId: "sup1", amount: 100, status: "مدفوع", date: "2026-06-09" });
    data.treasury.push({ id: "tp1", type: "out", amount: 100, supplierId: "sup1", sourceType: "check_pay", checkId: "chp1", date: "2026-06-09" });
    const s = buildSupplierSummary("sup1", data);
    /* رِجل check_pay مستبعدة من totalPaid (الشيك متعدّ في payChecks) — قبل الإصلاح
       كانت totalPaid=320 (تكرار) والرصيد ينزل الضِعف. */
    expect(s.totalPaid).toBe(220);
    expect(s.payChecks).toBe(100);
    expect(s.balance).toBe(130);/* 500 − 50 (مرتجعات) − 220 (مدفوعات) − 100 (شيك، مرة واحدة) */
  });

  it("V21.21.30: الشيك المرتد/الملغي وفئة غير «دفعة مورد» لا يُحتسبون", () => {
    const data = makeFactoryData();
    data.checks.push(
      { id: "chx1", type: "payable", partyId: "sup1", amount: 100, status: "مرتد", date: "2026-06-08" },
      { id: "chx2", type: "payable", partyId: "sup1", amount: 100, status: "ملغي", date: "2026-06-08" },
      { id: "chx3", type: "payable", partyId: "sup1", amount: 100, status: "معلق", category: "ضمان", date: "2026-06-08" },
    );
    expect(buildSupplierSummary("sup1", data).balance).toBe(230);
  });
});

/* ───────────── computeSalesOverviewTotals ───────────── */
describe("computeSalesOverviewTotals — إجماليات نظرة عامة المبيعات", () => {
  it("الإجماليات الذهبية (بدون أوامر البيع — حساب التوزيعات فقط)", () => {
    const t = computeSalesOverviewTotals(makeFactoryData());
    expect(t.totalSales).toBe(900);
    expect(t.totalReturns).toBe(180);
    expect(t.totalCashPay).toBe(300);
    expect(t.totalCheckPay).toBe(200);
    expect(t.totalBalance).toBe(220);
  });

  it("الخصم لكل تسليم: أولوية discPct على خصم العميل", () => {
    const data = makeFactoryData();
    /* تسليم بخصم خاص 50% بدل خصم العميل 10% */
    data.orders[0].customerDeliveries.push({ custId: "c1", qty: 1, price: 100, discPct: 50, date: "2026-06-02", sessionId: "s3" });
    const t = computeSalesOverviewTotals(data);
    expect(t.totalSales).toBe(950);/* 900 + round(100 × 0.5) */
  });

  it("custPayments بـ method شيك مستبعدة — الشيكات من data.checks بس (V21.27.153)", () => {
    /* الكنوني (statement.js/buildCustomerSummary/customer-portal) بيستبعد
       custPayments-شيك ويعدّ الشيكات من data.checks بس (منع تكرار). البطاقة
       والتقرير اتوحّدوا معاه. فالدفعة دي لا في الكاش ولا بتتعدّ شيك تاني. */
    const data = makeFactoryData();
    data.custPayments.push({ id: "p3", custId: "c1", amount: 150, method: "شيك بنكي", date: "2026-06-06" });
    const t = computeSalesOverviewTotals(data);
    expect(t.totalCashPay).toBe(300);   /* مش بتتعدّ كاش */
    expect(t.totalCheckPay).toBe(200);  /* data.checks بس (مش 350) */
  });
});

/* ───────────── الورش ───────────── */
describe("computeWorkshopDue / computeWorkshopBalance — مستحقات الورش", () => {
  const wsData = () => ({
    orders: [{
      id: "o1",
      workshopDeliveries: [{
        wsName: "ورشة أ", qty: 20, price: 5,
        receives: [
          { qty: 10, price: 5 },
          { qty: 3, price: 5, isSettlement: true },/* تسوية هالك — مش فلوس */
        ],
      }],
    }],
    wsPayments: [
      { wsName: "ورشة أ", type: "payment", amount: 20 },
      { wsName: "ورشة أ", type: "purchase", amount: 10 },
    ],
  });

  it("V21.9.83 regression: التسويات لا تدخل المستحق النقدي", () => {
    expect(computeWorkshopDue("ورشة أ", wsData())).toBe(50);/* 10 × 5 فقط، مش 65 */
  });

  it("الرصيد = مستحق + مشتريات − مدفوعات", () => {
    const b = computeWorkshopBalance("ورشة أ", wsData());
    expect(b).toEqual({ due: 50, totalPaid: 20, totalPurchase: 10, balance: 40 });
  });

  it("buildWorkshopSummary: المسلَّم/المستلَم/المعلّق (التسوية تُعدّ قطعاً مستلمة)", () => {
    const s = buildWorkshopSummary("ورشة أ", wsData());
    expect(s.totalDelivered).toBe(20);
    expect(s.totalReceived).toBe(13);/* 10 + 3 تسوية (عدّ قطع مش فلوس) */
    expect(s.pendingPieces).toBe(7);
    expect(s.balance).toBe(40);
  });
});
