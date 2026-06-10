/* ═══════════════════════════════════════════════════════════════════════
   بيانات مصنع تجريبية مشتركة (V21.21.29 — خطة التحصين 1.1)
   ───────────────────────────────────────────────────────────────────────
   makeFactoryData() بيرجّع نسخة جديدة تماماً في كل نداء (deep copy ضمني
   عبر literal جديد) — عشان:
   1. كاش calcOrder/_orderCache المبني على object identity ما يتسرّبش
      بين الاختبارات.
   2. الاختبارات اللي بتعدّل (mutators) ما تأثرش على بعضها.

   الأرقام مختارة أعداداً صحيحة عشان التقريب (Math.round لكل سطر في
   الكشف مقابل r2 للإجمالي في الملخص) ما يعملش فروق — أي اختلاف مستقبلي
   في منطق الخصم/التقريب بين الكشف والملخص هيكسر اختبار «تطابق الرصيد».

   ─── الحسابات الذهبية المتوقعة (محسوبة يدوياً) ───
   العميل c1 (خصم 10%):
     مبيعات تشغيلية: 10 قطع × 100 = 1000 → صافي 900 (جلسة s1)
     مرتجع: 2 × 100 = 200 → صافي 180 (جلسة s2)
     أمر بيع مباشر so1: 150 (المرآة so2 لا تُحتسب)
     دفعة كاش p1: 300 · شيك قبض ch1 (معلق): 200
     الرصيد = 900 − 180 + 150 − 300 − 200 = 370
   المورد sup1:
     استلام r1: 500 (مدفوع عند الاستلام 100)
     إشعار مدين dn1: 50 · دفعة مستقلة sp1: 120
     الرصيد = 500 − 50 − (100 + 120) = 230
   المخزون/الربح (computeDashboardKpis):
     مخزون جاهز O1: متاح = 50 − (10 − 2 + 1 محجوز so1) = 41 × تكلفة 20 = 820
     خامات: 10 × 5 = 50 → إجمالي المخزون 870
     COGS = (10 − 2) × 20 = 160 → مجمل الربح = 720 − 160 = 560
     مصروفات (إيجار) = 100 → صافي = 460
     الربح التجاري = 720 − 450 + 870 = 1140
   ═══════════════════════════════════════════════════════════════════════ */

export function makeFactoryData() {
  return {
    customers: [
      { id: "c1", name: "عميل الاختبار", discount: 10 },
    ],
    suppliers: [
      { id: "sup1", name: "مورد الاختبار" },
    ],
    orders: [
      {
        id: "o1",
        modelNo: "M-100",
        sellPrice: 100,
        /* تكلفة الوحدة عبر الإكسسوار فقط: accPer = 20 → costPer = 20 */
        accItems: [{ name: "زرار", price: 20 }],
        /* مخزون جاهز مؤكد: 50 قطعة */
        deliveries: [{ qty: 50, status: "done", date: "2026-05-20" }],
        customerDeliveries: [
          { custId: "c1", qty: 10, date: "2026-06-01", sessionId: "s1" },
        ],
        customerReturns: [
          { custId: "c1", qty: 2, date: "2026-06-05", sessionId: "s2" },
        ],
      },
    ],
    /* أمر بيع مباشر (يُحتسب) + مرآة توزيعة (لا تُحتسب أبداً — V21.21.1) */
    salesOrders: [
      {
        id: "so1", orderNo: "SO-1", customerId: "c1", status: "confirmed",
        date: "2026-06-08", total: 150,
        items: [{ qty: 1, unitPrice: 150, lineTotal: 150, sourceType: "order", sourceId: "o1" }],
      },
      {
        id: "so2", orderNo: "SO-2", customerId: "c1", status: "delivered",
        sourceDistributionId: "sess1:c1", isDistributionMirror: true,
        date: "2026-06-08", total: 9999,
        items: [{ qty: 5, unitPrice: 100, lineTotal: 500, sourceType: "order", sourceId: "o1" }],
      },
    ],
    custPayments: [
      { id: "p1", custId: "c1", amount: 300, method: "كاش", date: "2026-06-03" },
    ],
    checks: [
      { id: "ch1", type: "receivable", partyId: "c1", amount: 200, status: "معلق", checkNo: "111", date: "2026-06-04" },
    ],
    treasury: [
      /* مصروف تشغيلي (إيجار) — لا يخص عميلاً ولا مورداً */
      { id: "t1", type: "out", amount: 100, category: "إيجار", date: "2026-06-09" },
    ],
    purchaseReceipts: [
      { id: "r1", receiptNo: "RC-1", supplierId: "sup1", totalAmount: 500, paidAmount: 100, date: "2026-06-02", items: [] },
    ],
    supplierPayments: [
      { id: "sp1", supplierId: "sup1", amount: 120, date: "2026-06-07" },
    ],
    purchaseDebitNotes: [
      { id: "dn1", debitNoteNo: "DN-1", supplierId: "sup1", total: 50, status: "posted", date: "2026-06-06" },
    ],
    fabrics: [
      { id: "f1", name: "قماش قطن", stock: 10, avgCost: 5 },
    ],
    accessories: [],
    inventoryItems: [],
    profitSettings: { opexCategories: ["إيجار"] },
  };
}
