/* ═══════════════════════════════════════════════════════════════════════
   اختبارات مزامنة خصومات الفواتير من التوزيعات (syncInvoiceDiscounts.js) — V21.26.17
   ───────────────────────────────────────────────────────────────────────
   تغطية:
   - الفاتورة المسودة بخصم قديم (10%) والتوزيعة بخصم (40%) → تظهر في draft
     وتتطابق عند التطبيق (discount/total يتعاد حسابهم من subtotal).
   - الفاتورة المرحّلة (posted) المختلفة → تظهر في posted ومابتتلمسش (سلامة GL).
   - الفاتورة المرتبطة بتوزيعتين بخصمين مختلفين → ambiguous وتتخطّى.
   - الفاتورة المطابقة بالفعل / الملغية / الخدمات / بدون توزيعة → تتجاهل.
   - idempotent: إعادة المطابقة على مسودة متزامنة مابتغيّرش حاجة.
   ═══════════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from "vitest";
import { computeInvoiceDiscountDiffs, applyDraftDiscountSyncMutator } from "../syncInvoiceDiscounts.js";

function baseData(){
  return {
    custDeliverySessions: [
      { id: "s40", custDisc: { c1: 40 } },     /* توزيعة بخصم 40% */
      { id: "s25", custDisc: { c1: 25 } },     /* توزيعة بخصم 25% */
      { id: "snone", custDisc: {} },            /* بدون override */
    ],
    salesInvoices: [
      /* مسودة بخصم قديم 10% بينما التوزيعة 40% — لازم تتصلّح */
      { id: "inv_draft", status: "draft", customerId: "c1", customerName: "عميل", date: "2026-06-01",
        invoiceNo: "INV-1", subtotal: 1000, discountPct: 10, discount: 100, total: 900,
        deliveryRefs: [{ sessionId: "s40", orderId: "o1", custId: "c1" }] },
      /* مرحّلة مختلفة — لازم تظهر في posted ومتتلمسش */
      { id: "inv_posted", status: "posted", customerId: "c1", customerName: "عميل", date: "2026-06-02",
        invoiceNo: "INV-2", subtotal: 2000, discountPct: 10, discount: 200, total: 1800,
        deliveryRefs: [{ sessionId: "s40", orderId: "o2", custId: "c1" }] },
      /* مرتبطة بتوزيعتين بخصمين مختلفين — ambiguous */
      { id: "inv_amb", status: "draft", customerId: "c1", customerName: "عميل", date: "2026-06-03",
        invoiceNo: "INV-3", subtotal: 500, discountPct: 10, discount: 50, total: 450,
        deliveryRefs: [{ sessionId: "s40", orderId: "o3", custId: "c1" }, { sessionId: "s25", orderId: "o4", custId: "c1" }] },
      /* مطابقة بالفعل (40%) — تتجاهل */
      { id: "inv_match", status: "draft", customerId: "c1", customerName: "عميل", date: "2026-06-04",
        invoiceNo: "INV-4", subtotal: 100, discountPct: 40, discount: 40, total: 60,
        deliveryRefs: [{ sessionId: "s40", orderId: "o5", custId: "c1" }] },
      /* بدون توزيعة override — تتجاهل */
      { id: "inv_noov", status: "draft", customerId: "c1", customerName: "عميل", date: "2026-06-05",
        invoiceNo: "INV-5", subtotal: 100, discountPct: 10, discount: 10, total: 90,
        deliveryRefs: [{ sessionId: "snone", orderId: "o6", custId: "c1" }] },
      /* ملغية — تتجاهل */
      { id: "inv_void", status: "void", customerId: "c1", customerName: "عميل", date: "2026-06-06",
        invoiceNo: "INV-6", subtotal: 100, discountPct: 10, discount: 10, total: 90,
        deliveryRefs: [{ sessionId: "s40", orderId: "o7", custId: "c1" }] },
      /* خدمات — تتجاهل (مفيش deliveryRef أصلاً) */
      { id: "inv_svc", status: "draft", subtype: "service", customerId: "c1", customerName: "عميل", date: "2026-06-07",
        invoiceNo: "INV-7", subtotal: 300, discountPct: 0, discount: 0, total: 300 },
    ],
  };
}

describe("computeInvoiceDiscountDiffs — التحليل", () => {
  it("يصنّف الفواتير في الدلاء الصحيحة", () => {
    const r = computeInvoiceDiscountDiffs(baseData());
    expect(r.draft.map(x => x.id)).toEqual(["inv_draft"]);
    expect(r.posted.map(x => x.id)).toEqual(["inv_posted"]);
    expect(r.ambiguous.map(x => x.id)).toEqual(["inv_amb"]);
  });

  it("يحسب الخصم/الإجمالي الجديد من subtotal للمسودة", () => {
    const r = computeInvoiceDiscountDiffs(baseData());
    const row = r.draft[0];
    expect(row.newPct).toBe(40);
    expect(row.newDiscount).toBe(400);
    expect(row.newTotal).toBe(600);
    expect(row.delta).toBe(-300);   /* 600 - 900 */
  });

  it("يتجاهل الملغية/الخدمات/المطابقة/بدون توزيعة", () => {
    const r = computeInvoiceDiscountDiffs(baseData());
    const allIds = [...r.draft, ...r.posted, ...r.ambiguous].map(x => x.id);
    expect(allIds).not.toContain("inv_match");
    expect(allIds).not.toContain("inv_noov");
    expect(allIds).not.toContain("inv_void");
    expect(allIds).not.toContain("inv_svc");
  });
});

describe("applyDraftDiscountSyncMutator — التطبيق الآمن", () => {
  it("يطابق المسودة فقط ويعيد حساب الإجمالي", () => {
    const d = baseData();
    const diffs = computeInvoiceDiscountDiffs(d);
    const applied = applyDraftDiscountSyncMutator(d, diffs.draft);
    expect(applied).toBe(1);
    const inv = d.salesInvoices.find(i => i.id === "inv_draft");
    expect(inv.discountPct).toBe(40);
    expect(inv.discount).toBe(400);
    expect(inv.total).toBe(600);
    expect(inv._discSyncedAt).toBeTruthy();
  });

  it("لا يلمس الفاتورة المرحّلة حتى لو مرّرنا صفّها (سلامة GL)", () => {
    const d = baseData();
    const diffs = computeInvoiceDiscountDiffs(d);
    /* نمرّر صف posted بالغلط — لازم يتجاهل */
    const postedRow = diffs.posted[0];
    applyDraftDiscountSyncMutator(d, [postedRow]);
    const inv = d.salesInvoices.find(i => i.id === "inv_posted");
    expect(inv.discountPct).toBe(10);
    expect(inv.total).toBe(1800);   /* لم يتغيّر */
  });

  it("idempotent — إعادة التشغيل بعد المطابقة لا تنتج أي تغيير", () => {
    const d = baseData();
    applyDraftDiscountSyncMutator(d, computeInvoiceDiscountDiffs(d).draft);
    const again = computeInvoiceDiscountDiffs(d);
    expect(again.draft).toHaveLength(0);   /* مفيش مسودات مختلفة بعد المطابقة */
  });
});
