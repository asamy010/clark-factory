import { describe, it, expect } from "vitest";
import { planSessionSaleDeletion } from "../salesOrders.js";

const order = (id, sessionIds) => ({
  id,
  customerDeliveries: sessionIds.map((s, i) => ({ id: id + ":" + i, sessionId: s, qty: 1 })),
});

describe("planSessionSaleDeletion", () => {
  it("plans a full cascade: deliveries + mirror SOs + linked draft invoice", () => {
    const ctx = {
      orders: [order("o1", ["S1", "S1", "S2"]), order("o2", ["S1"])],
      salesOrders: [
        { id: "so1", sourceSessionId: "S1", salesInvoiceId: "inv1" },
        { id: "so2", sourceSessionId: "S2", salesInvoiceId: "" },
      ],
      salesInvoices: [{ id: "inv1", status: "draft", invoiceNo: "INV-1" }],
    };
    const r = planSessionSaleDeletion("S1", ctx);
    expect(r.ok).toBe(true);
    expect(r.plan.affectedOrderIds.sort()).toEqual(["o1", "o2"]);
    expect(r.plan.deliveryCount).toBe(3); // 2 in o1 + 1 in o2 (S2 delivery excluded)
    expect(r.plan.mirrorSOIds).toEqual(["so1"]);
    expect(r.plan.draftInvoiceIds).toEqual(["inv1"]);
  });

  it("BLOCKS when a linked invoice is posted", () => {
    const ctx = {
      orders: [order("o1", ["S1"])],
      salesOrders: [{ id: "so1", sourceSessionId: "S1", salesInvoiceId: "inv1" }],
      salesInvoices: [{ id: "inv1", status: "posted", invoiceNo: "INV-9" }],
    };
    const r = planSessionSaleDeletion("S1", ctx);
    expect(r.ok).toBe(false);
    expect(r.blockedReason).toBe("posted_invoice");
    expect(r.postedInvoiceNos).toEqual(["INV-9"]);
  });

  it("ignores other sessions entirely", () => {
    const ctx = {
      orders: [order("o1", ["S2"])],
      salesOrders: [{ id: "so2", sourceSessionId: "S2" }],
      salesInvoices: [],
    };
    const r = planSessionSaleDeletion("S1", ctx);
    expect(r.ok).toBe(true);
    expect(r.plan.affectedOrderIds).toEqual([]);
    expect(r.plan.deliveryCount).toBe(0);
    expect(r.plan.mirrorSOIds).toEqual([]);
    expect(r.plan.draftInvoiceIds).toEqual([]);
  });

  it("does NOT delete a draft invoice that consolidates multiple sessions", () => {
    const ctx = {
      orders: [order("o1", ["S1"])],
      salesOrders: [{ id: "so1", sourceSessionId: "S1", salesInvoiceId: "" }],
      salesInvoices: [
        { id: "inv1", status: "draft", invoiceNo: "INV-1", deliveryRefs: [{ sessionId: "S1" }, { sessionId: "SOTHER" }] },
      ],
    };
    const r = planSessionSaleDeletion("S1", ctx);
    expect(r.ok).toBe(true);
    expect(r.plan.draftInvoiceIds).toEqual([]); // consolidated → left intact
  });

  it("deletes a draft invoice whose deliveryRefs are all this session (no SO link)", () => {
    const ctx = {
      orders: [order("o1", ["S1"])],
      salesOrders: [],
      salesInvoices: [
        { id: "inv1", status: "draft", invoiceNo: "INV-1", deliveryRefs: [{ sessionId: "S1" }, { sessionId: "S1" }] },
      ],
    };
    const r = planSessionSaleDeletion("S1", ctx);
    expect(r.ok).toBe(true);
    expect(r.plan.draftInvoiceIds).toEqual(["inv1"]);
  });

  it("blocks if a delivery-ref consolidated invoice is posted", () => {
    const ctx = {
      orders: [order("o1", ["S1"])],
      salesOrders: [],
      salesInvoices: [
        { id: "inv1", status: "posted", invoiceNo: "INV-7", deliveryRefs: [{ sessionId: "S1" }] },
      ],
    };
    const r = planSessionSaleDeletion("S1", ctx);
    expect(r.ok).toBe(false);
    expect(r.blockedReason).toBe("posted_invoice");
  });

  it("empty session (no sales) → ok plan with zeros", () => {
    const r = planSessionSaleDeletion("S1", { orders: [], salesOrders: [], salesInvoices: [] });
    expect(r.ok).toBe(true);
    expect(r.plan.deliveryCount).toBe(0);
  });

  it("returns no_session when sessionId is missing", () => {
    expect(planSessionSaleDeletion("", {}).ok).toBe(false);
    expect(planSessionSaleDeletion("", {}).blockedReason).toBe("no_session");
  });

  it("ignores void invoices in the block check", () => {
    const ctx = {
      orders: [order("o1", ["S1"])],
      salesOrders: [{ id: "so1", sourceSessionId: "S1", salesInvoiceId: "inv1" }],
      salesInvoices: [{ id: "inv1", status: "void", invoiceNo: "INV-V" }],
    };
    const r = planSessionSaleDeletion("S1", ctx);
    expect(r.ok).toBe(true);
    expect(r.plan.draftInvoiceIds).toEqual([]); // void not deleted, not blocked
  });
});
