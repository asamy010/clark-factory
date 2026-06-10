/* ═══════════════════════════════════════════════════════════════════════
   اختبارات الفواتير (invoices.js) — V21.21.29
   ───────────────────────────────────────────────────────────────────────
   تغطية:
   - حساب الفاتورة من التسليمة: السعر/الخصم/الإجمالي (أولوية الخصم V21.9.190:
     discPct بتاع التسليمة → خصم العميل → 10 افتراضي).
   - تحوّلات الحالة: draft → posted → void (والممنوع منها).
   - V21.9.93 regression: ممنوع ترحيل فاتورة بدون طرف (عميل/مورد).
   - V21.21.3: حذف الفاتورة المسودة يفكّ ربط أمر البيع ويرجّع حالته.
   ═══════════════════════════════════════════════════════════════════════ */
import { describe, it, expect, vi } from "vitest";
import {
  buildSalesInvoiceFromDelivery,
  reserveInvoiceNo,
  postInvoiceMutator,
  voidInvoiceMutator,
  deleteDraftInvoiceMutator,
} from "../invoices.js";

const ORDER = { id: "o1", modelNo: "M-100", sellPrice: 200 };
const CUSTOMER = { id: "c1", name: "عميل", discount: 10 };

/* ───────────── البناء والحساب ───────────── */
describe("buildSalesInvoiceFromDelivery — حساب الفاتورة", () => {
  it("الإجمالي = الكمية × السعر − الخصم (خصم العميل 10%)", () => {
    const inv = buildSalesInvoiceFromDelivery({}, { custId: "c1", qty: 5, date: "2026-06-10" }, ORDER, CUSTOMER, "tester");
    expect(inv.subtotal).toBe(1000);/* 5 × سعر الأوردر 200 */
    expect(inv.discountPct).toBe(10);
    expect(inv.discount).toBe(100);
    expect(inv.total).toBe(900);
    expect(inv.status).toBe("draft");
    expect(inv.items[0].qty).toBe(5);
  });

  it("V21.9.190: أولوية الخصم — discPct التسليمة يغلب خصم العميل", () => {
    const inv = buildSalesInvoiceFromDelivery({}, { custId: "c1", qty: 1, price: 100, discPct: 5, date: "2026-06-10" }, ORDER, CUSTOMER, "");
    expect(inv.discountPct).toBe(5);
    expect(inv.total).toBe(95);
  });

  it("بدون عميل وبدون discPct: الخصم الافتراضي 10%", () => {
    const inv = buildSalesInvoiceFromDelivery({}, { custId: "cX", qty: 1, price: 100, date: "2026-06-10" }, ORDER, null, "");
    expect(inv.discountPct).toBe(10);
    expect(inv.total).toBe(90);
  });

  it("سعر التسليمة يغلب سعر الأوردر", () => {
    const inv = buildSalesInvoiceFromDelivery({}, { custId: "c1", qty: 2, price: 50, date: "2026-06-10" }, ORDER, CUSTOMER, "");
    expect(inv.subtotal).toBe(100);/* 2 × 50 مش 2 × 200 */
  });

  it("ترقيم الفواتير يتقدم مع كل حجز ولا يتكرر", () => {
    const d = {};
    const n1 = reserveInvoiceNo(d, "sales");
    const n2 = reserveInvoiceNo(d, "sales");
    expect(n1).toBeTruthy();
    expect(n2).toBeTruthy();
    expect(n1).not.toBe(n2);
  });
});

/* ───────────── تحوّلات الحالة ───────────── */
describe("postInvoiceMutator / voidInvoiceMutator — دورة حياة الفاتورة", () => {
  const makeD = (status = "draft", extra = {}) => ({
    salesInvoices: [{ id: "inv1", invoiceNo: "INV-1", customerId: "c1", customerName: "عميل", status, total: 100, ...extra }],
    purchaseInvoices: [{ id: "pinv1", invoiceNo: "PINV-1", supplierId: "s1", supplierName: "مورد", status, total: 100 }],
  });

  it("الترحيل: مسودة → مرحّلة بطابع زمني", () => {
    const d = makeD();
    expect(postInvoiceMutator(d, "inv1", "sales", "tester")).toBe(true);
    expect(d.salesInvoices[0].status).toBe("posted");
    expect(d.salesInvoices[0].postedAt).toBeTruthy();
    expect(d.salesInvoices[0].postedBy).toBe("tester");
  });

  it("الترحيل المزدوج مرفوض (مرحّلة بالفعل)", () => {
    const d = makeD("posted");
    expect(postInvoiceMutator(d, "inv1", "sales", "tester")).toBe(false);
  });

  it("V21.9.93 regression: ممنوع ترحيل فاتورة مبيعات بدون عميل", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const d = makeD("draft", { customerId: "", customerName: "" });
      expect(postInvoiceMutator(d, "inv1", "sales", "tester")).toBe(false);
      expect(d.salesInvoices[0].status).toBe("draft");/* لم تتغير */
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("V21.9.93: فاتورة الخدمات تقبل عميلاً عابراً (customerNameAdHoc)", () => {
    const d = makeD("draft", { customerId: "", subtype: "service", customerNameAdHoc: "عميل كاش" });
    expect(postInvoiceMutator(d, "inv1", "sales", "tester")).toBe(true);
  });

  it("V21.9.93: ممنوع ترحيل فاتورة مشتريات بدون مورد", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const d = makeD();
      d.purchaseInvoices[0].supplierId = "";
      expect(postInvoiceMutator(d, "pinv1", "purchase", "tester")).toBe(false);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("الإلغاء: مرحّلة → ملغاة بسبب — والمسودة لا تُلغى", () => {
    const d = makeD("posted");
    expect(voidInvoiceMutator(d, "inv1", "sales", "tester", "خطأ إدخال")).toBe(true);
    expect(d.salesInvoices[0].status).toBe("void");
    expect(d.salesInvoices[0].voidReason).toBe("خطأ إدخال");

    const d2 = makeD("draft");
    expect(voidInvoiceMutator(d2, "inv1", "sales", "tester", "")).toBe(false);
  });
});

/* ───────────── الحذف وفك الربط ───────────── */
describe("deleteDraftInvoiceMutator — تسلسل الحذف (§14.2)", () => {
  it("المسودة فقط هي القابلة للحذف", () => {
    const d = { salesInvoices: [{ id: "inv1", status: "posted" }] };
    expect(deleteDraftInvoiceMutator(d, "inv1", "sales")).toBe(false);
    expect(d.salesInvoices).toHaveLength(1);

    d.salesInvoices[0].status = "draft";
    expect(deleteDraftInvoiceMutator(d, "inv1", "sales")).toBe(true);
    expect(d.salesInvoices).toHaveLength(0);
  });

  it("V21.21.3 regression: حذف الفاتورة يفك ربط أمر البيع ويرجّعه «مؤكد»", () => {
    const d = {
      salesInvoices: [{ id: "inv1", status: "draft" }],
      salesOrders: [{ id: "so1", salesInvoiceId: "inv1", salesInvoiceNo: "INV-1", status: "invoiced" }],
    };
    expect(deleteDraftInvoiceMutator(d, "inv1", "sales")).toBe(true);
    expect(d.salesOrders[0].salesInvoiceId).toBe("");
    expect(d.salesOrders[0].status).toBe("confirmed");
  });

  it("V21.21.3: أمر البيع المرآة يرجع «مُسلَّم» بدل «مؤكد»", () => {
    const d = {
      salesInvoices: [{ id: "inv1", status: "draft" }],
      salesOrders: [{ id: "so1", salesInvoiceId: "inv1", status: "invoiced", isDistributionMirror: true, sourceDistributionId: "x:y" }],
    };
    deleteDraftInvoiceMutator(d, "inv1", "sales");
    expect(d.salesOrders[0].status).toBe("delivered");
  });
});
