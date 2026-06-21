import { describe, it, expect } from "vitest";
import { computeStockNetMap, netStockOf } from "../stockLedger.js";

const mv = (o) => ({ createdAt: "2026-01-01T00:00:00Z", ...o });

describe("computeStockNetMap", () => {
  it("adds in/opening, subtracts out", () => {
    const m = computeStockNetMap([
      mv({ itemType: "fabric", itemId: "f1", type: "opening", qty: 100 }),
      mv({ itemType: "fabric", itemId: "f1", type: "in", qty: 50 }),
      mv({ itemType: "fabric", itemId: "f1", type: "out", qty: 30 }),
    ]);
    expect(m.get("f1")).toBe(120); // 100 + 50 - 30
  });

  it("treats out qty by absolute value (stored negative or positive)", () => {
    const m = computeStockNetMap([
      mv({ itemType: "accessory", itemId: "a1", type: "in", qty: 200 }),
      mv({ itemType: "accessory", itemId: "a1", type: "out", qty: -50 }), // stored negative
    ]);
    expect(m.get("a1")).toBe(150);
  });

  it("adjust SETS the absolute value (does not add)", () => {
    const m = computeStockNetMap([
      mv({ createdAt: "2026-01-01", itemType: "fabric", itemId: "f1", type: "in", qty: 100 }),
      mv({ createdAt: "2026-01-02", itemType: "fabric", itemId: "f1", type: "adjust", qty: 70 }),
      mv({ createdAt: "2026-01-03", itemType: "fabric", itemId: "f1", type: "out", qty: 20 }),
    ]);
    expect(m.get("f1")).toBe(50); // set to 70, then -20
  });

  it("orders by createdAt so adjust applies at the right point", () => {
    // out-of-order input: adjust(50) created AFTER in(100) but listed first
    const m = computeStockNetMap([
      mv({ createdAt: "2026-01-05", itemType: "fabric", itemId: "f1", type: "out", qty: 10 }),
      mv({ createdAt: "2026-01-02", itemType: "fabric", itemId: "f1", type: "adjust", qty: 50 }),
      mv({ createdAt: "2026-01-01", itemType: "fabric", itemId: "f1", type: "in", qty: 100 }),
    ]);
    expect(m.get("f1")).toBe(40); // in 100 → adjust to 50 → out 10 = 40
  });

  it("excludes finished-goods movements (itemType:'order')", () => {
    const m = computeStockNetMap([
      mv({ itemType: "order", itemId: "ord1", type: "out", qty: 12 }),
      mv({ itemType: "fabric", itemId: "f1", type: "in", qty: 5 }),
    ]);
    expect(m.has("ord1")).toBe(false);
    expect(m.get("f1")).toBe(5);
  });

  it("handles empty / null input", () => {
    expect(computeStockNetMap(null).size).toBe(0);
    expect(computeStockNetMap([]).size).toBe(0);
  });
});

describe("netStockOf", () => {
  it("returns ledger net when the item has movements", () => {
    const m = computeStockNetMap([mv({ itemType: "fabric", itemId: "f1", type: "in", qty: 80 })]);
    expect(netStockOf(m, { id: "f1", stock: 999 })).toBe(80); // ledger wins over stale item.stock
  });

  it("falls back to item.stock when no movements exist", () => {
    const m = computeStockNetMap([]);
    expect(netStockOf(m, { id: "f2", stock: 42 })).toBe(42);
    expect(netStockOf(m, { id: "f3" })).toBe(0);
  });

  it("returns 0 for a missing item", () => {
    expect(netStockOf(new Map(), null)).toBe(0);
  });
});
