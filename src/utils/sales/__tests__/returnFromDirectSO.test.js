import { describe, it, expect } from "vitest";
import { returnFromDirectSalesOrderMutator } from "../salesOrders.js";
import { computeSoReserved } from "../../stockCatalog.js";

/* بنّاء أمر بيع مباشر بسيط (بند موديل واحد، خصم per-line 0). */
const directSO = (id, custId, sourceId, qty, unitPrice, extra = {}) => ({
  id, orderNo: id, customerId: custId, status: "delivered",
  date: extra.date || "2026-06-01", createdAt: extra.createdAt || id,
  items: [{ sourceType: "order", sourceId, modelNo: "M-" + sourceId, description: "موديل " + sourceId, qty, unitPrice, discountType: "pct", discountValue: 0, lineTotal: qty * unitPrice }],
  subtotal: qty * unitPrice, discountPct: 0, totalDiscount: 0, total: qty * unitPrice,
  salesInvoiceId: extra.salesInvoiceId || "", salesInvoiceNo: extra.salesInvoiceNo || "",
  sourceDistributionId: extra.sourceDistributionId, isDistributionMirror: extra.isDistributionMirror,
});

describe("returnFromDirectSalesOrderMutator", () => {
  it("reduces the SO item qty (partial) → reserved drops by the returned amount", () => {
    const d = { salesOrders: [directSO("so1", "c1", "o1", 10, 100)], salesInvoices: [] };
    const before = computeSoReserved(d.salesOrders)["o1"];
    expect(before).toBe(10);
    const r = returnFromDirectSalesOrderMutator(d, { customerId: "c1", returns: [{ sourceId: "o1", qty: 3 }] }, "tester");
    expect(r.ok).toBe(true);
    expect(r.reduced).toEqual([{ sourceId: "o1", qty: 3 }]);
    expect(r.blocked).toEqual([]);
    const so = d.salesOrders[0];
    expect(so.items[0].qty).toBe(7);
    expect(so.total).toBe(700); // 7 × 100
    expect(computeSoReserved(d.salesOrders)["o1"]).toBe(7);
  });

  it("full return cancels the SO", () => {
    const d = { salesOrders: [directSO("so1", "c1", "o1", 5, 100)], salesInvoices: [] };
    const r = returnFromDirectSalesOrderMutator(d, { customerId: "c1", returns: [{ sourceId: "o1", qty: 5 }] }, "t");
    expect(r.ok).toBe(true);
    expect(d.salesOrders[0].status).toBe("cancelled");
    expect(computeSoReserved(d.salesOrders)["o1"] || 0).toBe(0); // cancelled excluded
  });

  it("BLOCKS the posted-invoiced portion; only non-posted is reduced", () => {
    const d = {
      salesOrders: [
        directSO("soPosted", "c1", "o1", 4, 100, { salesInvoiceId: "inv1" }),
        directSO("soOpen", "c1", "o1", 6, 100, { createdAt: "so2" }),
      ],
      salesInvoices: [{ id: "inv1", status: "posted", invoiceNo: "INV-1" }],
    };
    const r = returnFromDirectSalesOrderMutator(d, { customerId: "c1", returns: [{ sourceId: "o1", qty: 8 }] }, "t");
    expect(r.ok).toBe(true);
    // only 6 (non-posted) reducible; 2 blocked
    expect(r.reduced).toEqual([{ sourceId: "o1", qty: 6 }]);
    expect(r.blocked.length).toBe(1);
    expect(r.blocked[0]).toMatchObject({ sourceId: "o1", requested: 8, available: 6, postedBlocked: 4 });
    // posted SO untouched, open SO emptied → cancelled
    expect(d.salesOrders.find(s => s.id === "soPosted").items[0].qty).toBe(4);
    expect(d.salesOrders.find(s => s.id === "soOpen").status).toBe("cancelled");
  });

  it("FIFO: reduces the oldest SO first", () => {
    const d = {
      salesOrders: [
        directSO("soNew", "c1", "o1", 5, 100, { date: "2026-06-10", createdAt: "soNew" }),
        directSO("soOld", "c1", "o1", 5, 100, { date: "2026-06-01", createdAt: "soOld" }),
      ],
      salesInvoices: [],
    };
    const r = returnFromDirectSalesOrderMutator(d, { customerId: "c1", returns: [{ sourceId: "o1", qty: 4 }] }, "t");
    expect(r.ok).toBe(true);
    expect(d.salesOrders.find(s => s.id === "soOld").items[0].qty).toBe(1); // oldest reduced first
    expect(d.salesOrders.find(s => s.id === "soNew").items[0].qty).toBe(5);
  });

  it("syncs the linked DRAFT invoice when reducing", () => {
    const d = {
      salesOrders: [directSO("so1", "c1", "o1", 10, 100, { salesInvoiceId: "inv1", salesInvoiceNo: "INV-1" })],
      salesInvoices: [{ id: "inv1", status: "draft", invoiceNo: "INV-1", items: [{ orderId: "o1", modelNo: "M-o1", qty: 10, unitPrice: 100, lineTotal: 1000 }], subtotal: 1000, discount: 0, total: 1000 }],
    };
    const r = returnFromDirectSalesOrderMutator(d, { customerId: "c1", returns: [{ sourceId: "o1", qty: 4 }] }, "t");
    expect(r.ok).toBe(true);
    const inv = d.salesInvoices.find(i => i.id === "inv1");
    expect(inv.items[0].qty).toBe(6);
    expect(inv.total).toBe(600);
  });

  it("full return on a DRAFT-invoiced SO removes the draft invoice + cancels SO", () => {
    const d = {
      salesOrders: [directSO("so1", "c1", "o1", 3, 100, { salesInvoiceId: "inv1", salesInvoiceNo: "INV-1" })],
      salesInvoices: [{ id: "inv1", status: "draft", invoiceNo: "INV-1", items: [{ orderId: "o1", qty: 3, unitPrice: 100, lineTotal: 300 }], subtotal: 300, total: 300 }],
    };
    const r = returnFromDirectSalesOrderMutator(d, { customerId: "c1", returns: [{ sourceId: "o1", qty: 3 }] }, "t");
    expect(r.ok).toBe(true);
    expect(d.salesInvoices.find(i => i.id === "inv1")).toBeUndefined(); // draft removed
    expect(d.salesOrders[0].status).toBe("cancelled");
    expect(d.salesOrders[0].salesInvoiceId).toBe("");
  });

  it("ignores distribution mirrors and other customers", () => {
    const d = {
      salesOrders: [
        directSO("mir", "c1", "o1", 5, 100, { isDistributionMirror: true, sourceDistributionId: "S:c1" }),
        directSO("other", "c2", "o1", 5, 100),
      ],
      salesInvoices: [],
    };
    const r = returnFromDirectSalesOrderMutator(d, { customerId: "c1", returns: [{ sourceId: "o1", qty: 5 }] }, "t");
    expect(r.ok).toBe(true);
    expect(r.reduced).toEqual([{ sourceId: "o1", qty: 0 }]); // nothing reducible for c1
    expect(r.blocked[0]).toMatchObject({ available: 0 });
    expect(d.salesOrders.find(s => s.id === "mir").items[0].qty).toBe(5); // untouched
    expect(d.salesOrders.find(s => s.id === "other").items[0].qty).toBe(5);
  });

  it("returns one model without touching others in a multi-line SO", () => {
    const d = {
      salesOrders: [{
        id: "so1", customerId: "c1", status: "delivered", date: "2026-06-01", createdAt: "so1",
        items: [
          { sourceType: "order", sourceId: "o1", modelNo: "M1", description: "m1", qty: 4, unitPrice: 100, discountType: "pct", discountValue: 0, lineTotal: 400 },
          { sourceType: "order", sourceId: "o2", modelNo: "M2", description: "m2", qty: 6, unitPrice: 50, discountType: "pct", discountValue: 0, lineTotal: 300 },
        ],
        subtotal: 700, discountPct: 0, totalDiscount: 0, total: 700, salesInvoiceId: "",
      }],
      salesInvoices: [],
    };
    const r = returnFromDirectSalesOrderMutator(d, { customerId: "c1", returns: [{ sourceId: "o1", qty: 4 }] }, "t");
    expect(r.ok).toBe(true);
    const so = d.salesOrders[0];
    expect(so.status).toBe("delivered"); // o2 still live → not cancelled
    expect(so.items.find(it => it.sourceId === "o1")).toBeUndefined(); // o1 removed
    expect(so.items.find(it => it.sourceId === "o2").qty).toBe(6);
    expect(so.total).toBe(300);
  });

  it("guards: no customer / no qty", () => {
    expect(returnFromDirectSalesOrderMutator({ salesOrders: [] }, { returns: [] }).ok).toBe(false);
    const d = { salesOrders: [directSO("so1", "c1", "o1", 5, 100)], salesInvoices: [] };
    const r = returnFromDirectSalesOrderMutator(d, { customerId: "c1", returns: [{ sourceId: "o1", qty: 0 }] }, "t");
    expect(r.ok).toBe(true);
    expect(r.reduced).toEqual([]);
    expect(d.salesOrders[0].items[0].qty).toBe(5);
  });
});
