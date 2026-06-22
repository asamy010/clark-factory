import { describe, it, expect } from "vitest";
import { returnFromDirectSalesOrderMutator, salesOrderReturnedValue, salesOrderNetTotal } from "../salesOrders.js";
import { computeSoReserved } from "../../stockCatalog.js";
import { creditNotePostBlocker } from "../../invoices.js";

/* أمر بيع مباشر: بند موديل واحد. */
const directSO = (id, custId, sourceId, qty, unitPrice, extra = {}) => ({
  id, orderNo: id, customerId: custId, customerName: extra.customerName || "عميل", status: "delivered",
  date: extra.date || "2026-06-01", createdAt: extra.createdAt || id,
  items: [{ sourceType: "order", sourceId, modelNo: "M-" + sourceId, description: "موديل " + sourceId, qty, unitPrice, discountType: "pct", discountValue: extra.discountValue || 0, lineTotal: qty * unitPrice }],
  subtotal: qty * unitPrice, discountPct: 0, totalDiscount: 0, total: qty * unitPrice,
  salesInvoiceId: extra.salesInvoiceId || "", salesInvoiceNo: extra.salesInvoiceNo || "",
  sourceDistributionId: extra.sourceDistributionId, isDistributionMirror: extra.isDistributionMirror,
});

describe("returnFromDirectSalesOrderMutator (separate-document, immutable SO)", () => {
  it("does NOT mutate SO items; records so.returns + a draft credit note", () => {
    const d = { salesOrders: [directSO("so1", "c1", "o1", 10, 100)], salesInvoices: [], salesCreditNotes: [] };
    const r = returnFromDirectSalesOrderMutator(d, { customerId: "c1", returns: [{ sourceId: "o1", qty: 3 }] }, "tester");
    expect(r.ok).toBe(true);
    expect(r.reduced).toEqual([{ sourceId: "o1", qty: 3 }]);
    const so = d.salesOrders[0];
    /* SO items untouched (الأمر يفضل كامل) */
    expect(so.items[0].qty).toBe(10);
    expect(so.total).toBe(1000);
    expect(so.status).toBe("delivered");
    /* return recorded separately */
    expect(so.returns.length).toBe(1);
    expect(so.returns[0]).toMatchObject({ sourceId: "o1", qty: 3, net: 300 });
    /* credit note created (draft, references the model order) */
    expect(d.salesCreditNotes.length).toBe(1);
    const cn = d.salesCreditNotes[0];
    expect(cn.status).toBe("draft");
    expect(cn.total).toBe(300);
    expect(cn.returnRef.orderId).toBe("o1");
    expect(cn.fromSalesOrderId).toBe("so1");
    expect(so.returns[0].creditNoteId).toBe(cn.id);
  });

  it("stock recovers via computeSoReserved (items − returns) without editing items", () => {
    const d = { salesOrders: [directSO("so1", "c1", "o1", 10, 100)], salesInvoices: [], salesCreditNotes: [] };
    expect(computeSoReserved(d.salesOrders)["o1"]).toBe(10);
    returnFromDirectSalesOrderMutator(d, { customerId: "c1", returns: [{ sourceId: "o1", qty: 4 }] }, "t");
    expect(computeSoReserved(d.salesOrders)["o1"]).toBe(6); // 10 sold − 4 returned
    expect(d.salesOrders[0].items[0].qty).toBe(10); // still full
  });

  it("full return leaves the SO complete (not cancelled), reserved → 0", () => {
    const d = { salesOrders: [directSO("so1", "c1", "o1", 5, 100)], salesInvoices: [], salesCreditNotes: [] };
    const r = returnFromDirectSalesOrderMutator(d, { customerId: "c1", returns: [{ sourceId: "o1", qty: 5 }] }, "t");
    expect(r.ok).toBe(true);
    expect(d.salesOrders[0].status).toBe("delivered"); // SO stays
    expect(d.salesOrders[0].items[0].qty).toBe(5);     // items full
    expect(computeSoReserved(d.salesOrders)["o1"]).toBe(0);
    expect(salesOrderReturnedValue(d.salesOrders[0])).toBe(500);
    expect(salesOrderNetTotal(d.salesOrders[0])).toBe(0);
  });

  it("posted-invoiced SO is returnable too; credit note links the posted invoice", () => {
    const d = {
      salesOrders: [directSO("so1", "c1", "o1", 4, 100, { salesInvoiceId: "inv1", salesInvoiceNo: "INV-1" })],
      salesInvoices: [{ id: "inv1", status: "posted", invoiceNo: "INV-1" }],
      salesCreditNotes: [],
    };
    const r = returnFromDirectSalesOrderMutator(d, { customerId: "c1", returns: [{ sourceId: "o1", qty: 2 }] }, "t");
    expect(r.ok).toBe(true);
    const cn = d.salesCreditNotes[0];
    expect(cn.linkedInvoiceId).toBe("inv1");
    expect(cn.total).toBe(200);
    /* postable because linked invoice is posted */
    expect(creditNotePostBlocker(d, cn.id)).toBeNull();
  });

  it("credit note for a NON-invoiced SO return is NOT postable (would reverse an unposted sale)", () => {
    const d = { salesOrders: [directSO("so1", "c1", "o1", 5, 100)], salesInvoices: [], salesCreditNotes: [] };
    returnFromDirectSalesOrderMutator(d, { customerId: "c1", returns: [{ sourceId: "o1", qty: 2 }] }, "t");
    const cn = d.salesCreditNotes[0];
    expect(cn.linkedInvoiceId).toBeNull();
    expect(creditNotePostBlocker(d, cn.id)).toMatch(/غير متفوتر/);
  });

  it("blocks the over-returned portion (more than sold − already returned)", () => {
    const d = { salesOrders: [directSO("so1", "c1", "o1", 5, 100)], salesInvoices: [], salesCreditNotes: [] };
    /* first return 3 */
    returnFromDirectSalesOrderMutator(d, { customerId: "c1", returns: [{ sourceId: "o1", qty: 3 }] }, "t");
    /* try to return 4 more → only 2 available */
    const r = returnFromDirectSalesOrderMutator(d, { customerId: "c1", returns: [{ sourceId: "o1", qty: 4 }] }, "t");
    expect(r.reduced).toEqual([{ sourceId: "o1", qty: 2 }]);
    expect(r.blocked[0]).toMatchObject({ sourceId: "o1", requested: 4, available: 2 });
    expect(d.salesOrders[0].returns.reduce((s, x) => s + x.qty, 0)).toBe(5); // 3 + 2
    expect(computeSoReserved(d.salesOrders)["o1"]).toBe(0);
  });

  it("FIFO: returns the oldest SO first", () => {
    const d = {
      salesOrders: [
        directSO("soNew", "c1", "o1", 5, 100, { date: "2026-06-10", createdAt: "soNew" }),
        directSO("soOld", "c1", "o1", 5, 100, { date: "2026-06-01", createdAt: "soOld" }),
      ],
      salesInvoices: [], salesCreditNotes: [],
    };
    returnFromDirectSalesOrderMutator(d, { customerId: "c1", returns: [{ sourceId: "o1", qty: 4 }] }, "t");
    const old = d.salesOrders.find(s => s.id === "soOld");
    const neu = d.salesOrders.find(s => s.id === "soNew");
    expect(old.returns.reduce((s, x) => s + x.qty, 0)).toBe(4); // oldest fully tapped first
    expect((neu.returns || []).length).toBe(0); // newest untouched
  });

  it("uses the SO line's discount when valuing the credit note", () => {
    const d = { salesOrders: [directSO("so1", "c1", "o1", 10, 100, { discountValue: 20 })], salesInvoices: [], salesCreditNotes: [] };
    returnFromDirectSalesOrderMutator(d, { customerId: "c1", returns: [{ sourceId: "o1", qty: 5 }] }, "t");
    const cn = d.salesCreditNotes[0];
    expect(cn.subtotal).toBe(500);   // 5 × 100
    expect(cn.discount).toBe(100);   // 20%
    expect(cn.total).toBe(400);
    expect(d.salesOrders[0].returns[0].net).toBe(400);
  });

  it("ignores mirrors and other customers", () => {
    const d = {
      salesOrders: [
        directSO("mir", "c1", "o1", 5, 100, { isDistributionMirror: true, sourceDistributionId: "S:c1" }),
        directSO("other", "c2", "o1", 5, 100),
      ],
      salesInvoices: [], salesCreditNotes: [],
    };
    const r = returnFromDirectSalesOrderMutator(d, { customerId: "c1", returns: [{ sourceId: "o1", qty: 5 }] }, "t");
    expect(r.reduced).toEqual([{ sourceId: "o1", qty: 0 }]);
    expect(d.salesOrders.find(s => s.id === "mir").returns).toBeUndefined();
    expect(d.salesCreditNotes.length).toBe(0);
  });

  /* ── V21.27.99: مرتجع صنف مخزون (خامة/إكسسوار) — استرجاع مخزون فعلي ── */
  /* أمر بيع مباشر فيه بند صنف مخزون متخصم فعليًا (so.stockDeductions). */
  const directSOInv = (id, custId, itemId, qty, unitPrice, opts = {}) => ({
    id, orderNo: id, customerId: custId, customerName: "عميل", status: "delivered",
    date: opts.date || "2026-06-01", createdAt: opts.createdAt || id,
    items: [{ sourceType: "inventoryItem", sourceId: itemId, modelNo: "قماش قطن", description: "قطن", unit: "متر", qty, unitPrice, discountType: "pct", discountValue: opts.discountValue || 0, lineTotal: qty * unitPrice }],
    subtotal: qty * unitPrice, discountPct: 0, totalDiscount: 0, total: qty * unitPrice,
    salesInvoiceId: opts.salesInvoiceId || "", salesInvoiceNo: opts.salesInvoiceNo || "",
    stockDeducted: opts.stockDeducted !== false,
    stockDeductions: opts.stockDeducted === false ? [] : [{ itemId, categoryId: "cat1", qty, itemName: "قماش قطن", unit: "متر", unitCost: opts.unitCost != null ? opts.unitCost : 40 }],
  });
  const invData = (so, stock = 100) => ({
    salesOrders: [so], salesInvoices: [], salesCreditNotes: [],
    itemCategories: [{ id: "cat1", name: "خامات" }],
    inventoryItems: [{ id: "it1", name: "قماش قطن", unit: "متر", categoryId: "cat1", stock, avgCost: 40 }],
    stockMovements: [],
    customers: [{ id: "c1", name: "عميل" }],
  });

  it("inventoryItem return restores ACTUAL stock + records movement + credit note", () => {
    const d = invData(directSOInv("so1", "c1", "it1", 10, 60), 90); // 90 in stock after a 10m sale
    const r = returnFromDirectSalesOrderMutator(d, { customerId: "c1", returns: [{ sourceId: "it1", qty: 4 }] }, "t");
    expect(r.ok).toBe(true);
    expect(r.reduced).toEqual([{ sourceId: "it1", qty: 4 }]);
    /* physical stock restored */
    expect(d.inventoryItems[0].stock).toBe(94);
    /* stock movement recorded (in) */
    const mv = d.stockMovements.find(m => m.sourceType === "sales_order_return");
    expect(mv).toBeTruthy();
    expect(mv.qty).toBe(4);
    expect(mv.itemId).toBe("it1");
    /* return entry stamped as inventoryItem (so computeSoReserved skips it) */
    const so = d.salesOrders[0];
    expect(so.returns[0]).toMatchObject({ sourceId: "it1", qty: 4, itemSourceType: "inventoryItem", categoryId: "cat1" });
    /* deduction decremented (prevents double-restore on later cancel) */
    expect(so.stockDeductions[0].qty).toBe(6);
    expect(so.stockDeducted).toBe(true);
    /* credit note created */
    expect(d.salesCreditNotes.length).toBe(1);
    expect(d.salesCreditNotes[0].total).toBe(240); // 4 × 60
    /* SO items untouched (document stays whole) */
    expect(so.items[0].qty).toBe(10);
  });

  it("inventoryItem returns do NOT pollute computeSoReserved (model reservation)", () => {
    const so = directSOInv("so1", "c1", "it1", 10, 60);
    /* add a model line too — its reservation must be unaffected by the inv return */
    so.items.push({ sourceType: "order", sourceId: "o9", modelNo: "M", description: "M", qty: 7, unitPrice: 100, lineTotal: 700 });
    const d = invData(so, 90);
    returnFromDirectSalesOrderMutator(d, { customerId: "c1", returns: [{ sourceId: "it1", qty: 4 }] }, "t");
    const res = computeSoReserved(d.salesOrders);
    expect(res["o9"]).toBe(7);          // model reservation intact
    expect(res["it1"] || 0).toBe(0);    // inv item NOT in derived reservation
  });

  it("full inventoryItem return empties the deduction (stockDeducted → false)", () => {
    const d = invData(directSOInv("so1", "c1", "it1", 5, 60), 95);
    returnFromDirectSalesOrderMutator(d, { customerId: "c1", returns: [{ sourceId: "it1", qty: 5 }] }, "t");
    expect(d.inventoryItems[0].stock).toBe(100);
    expect(d.salesOrders[0].stockDeductions[0].qty).toBe(0);
    expect(d.salesOrders[0].stockDeducted).toBe(false);
  });

  it("inventoryItem sold WITHOUT stock deduction → return records doc but stock unchanged", () => {
    const d = invData(directSOInv("so1", "c1", "it1", 5, 60, { stockDeducted: false }), 100);
    const r = returnFromDirectSalesOrderMutator(d, { customerId: "c1", returns: [{ sourceId: "it1", qty: 3 }] }, "t");
    expect(r.ok).toBe(true);
    expect(d.inventoryItems[0].stock).toBe(100); // unchanged — was never deducted
    expect(d.stockMovements.length).toBe(0);
    expect(d.salesOrders[0].returns[0]).toMatchObject({ sourceId: "it1", qty: 3, itemSourceType: "inventoryItem" });
    expect(d.salesCreditNotes.length).toBe(1); // credit note still issued
  });

  it("guards: no customer / no qty", () => {
    expect(returnFromDirectSalesOrderMutator({ salesOrders: [] }, { returns: [] }).ok).toBe(false);
    const d = { salesOrders: [directSO("so1", "c1", "o1", 5, 100)], salesInvoices: [], salesCreditNotes: [] };
    const r = returnFromDirectSalesOrderMutator(d, { customerId: "c1", returns: [{ sourceId: "o1", qty: 0 }] }, "t");
    expect(r.ok).toBe(true);
    expect(r.reduced).toEqual([]);
    expect(d.salesOrders[0].returns).toBeUndefined();
    expect(d.salesCreditNotes.length).toBe(0);
  });
});
