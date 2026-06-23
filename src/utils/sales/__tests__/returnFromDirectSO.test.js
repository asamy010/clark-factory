import { describe, it, expect } from "vitest";
import { returnFromDirectSalesOrderMutator, salesOrderReturnedValue, salesOrderNetTotal, cancelReturnMutator, removeOperationalReturnForCreditNote, computeDirectSoReturnables } from "../salesOrders.js";
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

/* ── V21.27.103: computeDirectSoReturnables — الأصناف القابلة للمرتجع ── */
describe("computeDirectSoReturnables (returnable items per customer)", () => {
  it("MODEL + selected customer → appears as returnable (the reported case)", () => {
    const sos = [directSO("so1", "c1", "o1", 5, 100)]; // model, customerId=c1
    const out = computeDirectSoReturnables(sos);
    expect(out.c1).toBeTruthy();
    expect(out.c1.models.o1).toMatchObject({ sourceId: "o1", sold: 5, returned: 0 });
    expect(out.c1.total).toBe(5);          // > 0 → customer shows in picker
  });

  it("net reduces after a return (sold − returned)", () => {
    const d = { salesOrders: [directSO("so1", "c1", "o1", 5, 100)], salesInvoices: [], salesCreditNotes: [], customers: [{ id: "c1", name: "x" }] };
    returnFromDirectSalesOrderMutator(d, { customerId: "c1", returns: [{ sourceId: "o1", qty: 2 }] }, "t");
    const out = computeDirectSoReturnables(d.salesOrders);
    expect(out.c1.models.o1).toMatchObject({ sold: 5, returned: 2 });
    expect(out.c1.total).toBe(3);
  });

  it("generalProduct & service items are returnable (bucketed in invItems with itemType)", () => {
    const so = {
      id: "so1", orderNo: "so1", customerId: "c1", status: "confirmed", date: "2026-06-01",
      items: [
        { sourceType: "generalProduct", sourceId: "gp1", modelNo: "علبة", unit: "علبة", qty: 3, unitPrice: 50, lineTotal: 150 },
        { sourceType: "service", sourceId: "sv1", modelNo: "شحن", qty: 1, unitPrice: 80, lineTotal: 80 },
      ],
    };
    const out = computeDirectSoReturnables([so]);
    expect(out.c1.invItems.gp1).toMatchObject({ sold: 3, itemType: "generalProduct" });
    expect(out.c1.invItems.sv1).toMatchObject({ sold: 1, itemType: "service" });
  });

  it("excludes ad-hoc customer (no customerId), mirrors, and cancelled", () => {
    const sos = [
      { id: "a", customerNameAdHoc: "زبون نقدي", status: "confirmed", items: [{ sourceType: "order", sourceId: "o1", qty: 5 }] }, // ad-hoc → no customerId
      directSO("mir", "c1", "o1", 5, 100, { isDistributionMirror: true, sourceDistributionId: "S:c1" }),
      directSO("can", "c1", "o2", 5, 100, {}),
    ];
    sos[2].status = "cancelled";
    const out = computeDirectSoReturnables(sos);
    expect(out.c1 && out.c1.models.o1).toBeFalsy(); // mirror excluded
    expect(out.c1 && out.c1.models.o2).toBeFalsy(); // cancelled excluded
    expect(Object.keys(out).length).toBe(0);        // ad-hoc has no customerId key
  });
});

/* ── V21.27.101 (issue #4): إلغاء مرتجع موحّد ── */
describe("cancelReturnMutator (unified return cancellation)", () => {
  it("cancels a direct-SO MODEL return: removes so.returns + deletes draft CN + restores reserved", () => {
    const d = { salesOrders: [directSO("so1", "c1", "o1", 10, 100)], salesInvoices: [], salesCreditNotes: [], customers: [{ id: "c1", name: "عميل" }] };
    returnFromDirectSalesOrderMutator(d, { customerId: "c1", returns: [{ sourceId: "o1", qty: 4 }] }, "t");
    expect(computeSoReserved(d.salesOrders)["o1"]).toBe(6);
    const retId = d.salesOrders[0].returns[0].id;
    const r = cancelReturnMutator(d, { kind: "so", soId: "so1", retId }, "t");
    expect(r.ok).toBe(true);
    expect(d.salesOrders[0].returns.length).toBe(0);       // operational return removed
    expect(d.salesCreditNotes.length).toBe(0);             // draft CN deleted
    expect(computeSoReserved(d.salesOrders)["o1"]).toBe(10); // reserved fully restored
  });

  it("cancels a direct-SO INVENTORY return: re-deducts stock + restores deduction + deletes CN", () => {
    const d = invData(directSOInv("so1", "c1", "it1", 10, 60), 90);
    returnFromDirectSalesOrderMutator(d, { customerId: "c1", returns: [{ sourceId: "it1", qty: 4 }] }, "t");
    expect(d.inventoryItems[0].stock).toBe(94);            // return added 4 back
    expect(d.salesCreditNotes.length).toBe(1);
    const retId = d.salesOrders[0].returns[0].id;
    const r = cancelReturnMutator(d, { kind: "so", soId: "so1", retId }, "t");
    expect(r.ok).toBe(true);
    expect(d.inventoryItems[0].stock).toBe(90);            // re-deducted → back to sold state
    expect(d.salesOrders[0].stockDeductions[0].qty).toBe(10); // deduction restored
    expect(d.salesOrders[0].returns.length).toBe(0);
    expect(d.salesCreditNotes.length).toBe(0);
    const cancelMv = d.stockMovements.find(m => m.sourceType === "sales_order_return_cancel");
    expect(cancelMv).toBeTruthy();
    expect(cancelMv.qty).toBe(-4);
  });

  it("voids (not deletes) a POSTED credit note and reports postedJournalRef for GL reversal", () => {
    const d = invData(directSOInv("so1", "c1", "it1", 5, 60), 95);
    returnFromDirectSalesOrderMutator(d, { customerId: "c1", returns: [{ sourceId: "it1", qty: 2 }] }, "t");
    /* simulate the CN being posted */
    const cn = d.salesCreditNotes[0];
    cn.status = "posted"; cn.postedJournalRef = { id: "je1", date: cn.date };
    const retId = d.salesOrders[0].returns[0].id;
    const r = cancelReturnMutator(d, { kind: "so", soId: "so1", retId }, "t");
    expect(r.ok).toBe(true);
    expect(r.cn).toMatchObject({ was: "posted", postedJournalRef: { id: "je1" } });
    expect(d.salesCreditNotes[0].status).toBe("void");     // voided, not removed
  });

  it("cancels a DISTRIBUTION return: removes customerReturns + linked CN; returns ret for GL", () => {
    const d = {
      orders: [{ id: "ord1", modelNo: "M1", customerReturns: [{ id: "r1", custId: "c1", qty: 3, date: "2026-06-01", _key: "ord1:saleReturn:s1:c1:2026-06-01" }] }],
      salesCreditNotes: [{ id: "cn1", status: "draft", creditNoteNo: "CN-1", returnRefs: [{ orderId: "ord1", custId: "c1", _key: "ord1:saleReturn:s1:c1:2026-06-01" }] }],
      salesOrders: [],
    };
    const r = cancelReturnMutator(d, { kind: "dist", orderId: "ord1", retId: "r1" }, "t");
    expect(r.ok).toBe(true);
    expect(r.kind).toBe("dist");
    expect(d.orders[0].customerReturns.length).toBe(0);    // operational removed
    expect(d.salesCreditNotes.length).toBe(0);             // draft CN deleted
    expect(r.ret).toMatchObject({ qty: 3 });               // returned so handler can reverse GL
  });

  it("does NOT auto-void a CONSOLIDATED CN (>1 returnRefs) — flags cnMulti", () => {
    const d = {
      orders: [{ id: "ord1", customerReturns: [{ id: "r1", custId: "c1", qty: 3, _key: "k1" }] }],
      salesCreditNotes: [{ id: "cn1", status: "posted", creditNoteNo: "CN-1", returnRefs: [{ orderId: "ord1", custId: "c1", _key: "k1" }, { orderId: "ord2", custId: "c1", _key: "k2" }] }],
      salesOrders: [],
    };
    const r = cancelReturnMutator(d, { kind: "dist", orderId: "ord1", retId: "r1" }, "t");
    expect(r.ok).toBe(true);
    expect(r.cnMulti).toBe(true);
    expect(d.orders[0].customerReturns.length).toBe(0);    // operational still removed
    expect(d.salesCreditNotes[0].status).toBe("posted");   // CN untouched (manual handling)
  });

  it("cancels a DISTRIBUTION return with NO credit note (operational-only)", () => {
    const d = { orders: [{ id: "ord1", customerReturns: [{ id: "r1", custId: "c1", qty: 2, date: "2026-06-01" }] }], salesCreditNotes: [], salesOrders: [] };
    const r = cancelReturnMutator(d, { kind: "dist", orderId: "ord1", retId: "r1" }, "t");
    expect(r.ok).toBe(true);
    expect(d.orders[0].customerReturns.length).toBe(0);
    expect(r.cn).toBeNull();
  });

  it("removeOperationalReturnForCreditNote: voiding a CN removes the linked so.returns (bidirectional)", () => {
    const d = invData(directSOInv("so1", "c1", "it1", 5, 60), 95);
    returnFromDirectSalesOrderMutator(d, { customerId: "c1", returns: [{ sourceId: "it1", qty: 2 }] }, "t");
    const cnId = d.salesCreditNotes[0].id;
    expect(d.salesOrders[0].returns.length).toBe(1);
    expect(d.inventoryItems[0].stock).toBe(97);            // 95 + 2 (return restored it)
    const out = removeOperationalReturnForCreditNote(d, cnId);
    expect(out.removed).toBe("so");
    expect(d.salesOrders[0].returns.length).toBe(0);       // operational cleaned up
    expect(d.inventoryItems[0].stock).toBe(95);            // re-deducted back to sold state
  });

  it("removeOperationalReturnForCreditNote: removes linked distribution customerReturns", () => {
    const d = {
      orders: [{ id: "ord1", customerReturns: [{ id: "r1", custId: "c1", qty: 3, _key: "k1" }] }],
      salesCreditNotes: [{ id: "cn1", status: "posted", returnRefs: [{ orderId: "ord1", custId: "c1", _key: "k1" }] }],
      salesOrders: [],
    };
    const out = removeOperationalReturnForCreditNote(d, "cn1");
    expect(out.removed).toBe("dist");
    expect(d.orders[0].customerReturns.length).toBe(0);
  });
});
