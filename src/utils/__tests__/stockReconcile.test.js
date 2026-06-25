import { describe, it, expect } from "vitest";
import {
  analyzeStockReconciliation,
  recomputeItemLedgerState,
  relinkOrphanMovements,
  syncStoredStockFromLedger,
  getAllStockItems,
} from "../stockReconcile.js";
import { computeStockNetMap, netStockOf } from "../stockLedger.js";

const mv = (o) => ({ id: Math.random().toString(36).slice(2), createdAt: "2026-01-01T00:00:00Z", ...o });

describe("recomputeItemLedgerState", () => {
  it("computes net stock + weighted avg cost from in/out/adjust", () => {
    const moves = [
      mv({ createdAt: "2026-01-01", itemType: "fabric", itemId: "f1", type: "in", qty: 100, price: 10 }),
      mv({ createdAt: "2026-01-02", itemType: "fabric", itemId: "f1", type: "in", qty: 100, price: 20 }),
      mv({ createdAt: "2026-01-03", itemType: "fabric", itemId: "f1", type: "out", qty: 50, price: 0 }),
    ];
    const { stock, avgCost } = recomputeItemLedgerState(moves, "f1");
    expect(stock).toBe(150); // 100 + 100 - 50
    expect(avgCost).toBe(15); // weighted (100*10 + 100*20)/200 = 15, unchanged by out
  });

  it("resets avg cost to 0 when stock empties on out", () => {
    const moves = [
      mv({ itemType: "fabric", itemId: "f1", type: "in", qty: 10, price: 5 }),
      mv({ createdAt: "2026-01-02", itemType: "fabric", itemId: "f1", type: "out", qty: 10 }),
    ];
    expect(recomputeItemLedgerState(moves, "f1")).toEqual({ stock: 0, avgCost: 0 });
  });

  it("matches computeStockNetMap for stock quantity", () => {
    const moves = [
      mv({ createdAt: "2026-01-01", itemType: "fabric", itemId: "f1", type: "in", qty: 100 }),
      mv({ createdAt: "2026-01-02", itemType: "fabric", itemId: "f1", type: "adjust", qty: 70 }),
      mv({ createdAt: "2026-01-03", itemType: "fabric", itemId: "f1", type: "out", qty: 20 }),
    ];
    expect(recomputeItemLedgerState(moves, "f1").stock).toBe(computeStockNetMap(moves).get("f1"));
  });
});

describe("analyzeStockReconciliation — orphan detection", () => {
  it("flags movements whose itemId matches no current item", () => {
    const data = {
      fabrics: [{ id: "NEW_TEST", name: "TEST", unit: "متر", stock: 50 }],
      stockMovements: [
        // purchases recorded against the OLD id of TEST (deleted+recreated)
        mv({ itemType: "fabric", itemId: "OLD_TEST", itemName: "TEST", type: "in", qty: 30, price: 10 }),
        mv({ itemType: "fabric", itemId: "OLD_TEST", itemName: "TEST", type: "in", qty: 20, price: 10 }),
      ],
    };
    const r = analyzeStockReconciliation(data);
    expect(r.counts.orphanGroups).toBe(1);
    expect(r.counts.orphanMoves).toBe(2);
    const o = r.orphans[0];
    expect(o.itemId).toBe("OLD_TEST");
    expect(o.itemName).toBe("TEST");
    expect(o.net).toBe(50); // 30 + 20
    // auto-suggests the current TEST fabric by name
    expect(o.suggestId).toBe("NEW_TEST");
    expect(o.ambiguous).toBe(false);
  });

  it("excludes finished-goods (order) and service movements from orphans", () => {
    const data = {
      fabrics: [],
      stockMovements: [
        mv({ itemType: "order", itemId: "ord1", type: "out", qty: 5 }),
        mv({ itemType: "service", itemId: "svc1", type: "out", qty: 1 }),
      ],
    };
    const r = analyzeStockReconciliation(data);
    expect(r.counts.orphanGroups).toBe(0);
    expect(r.hasIssues).toBe(false);
  });

  it("marks ambiguous when two current items share the orphan name", () => {
    const data = {
      fabrics: [{ id: "f1", name: "قطن" }, { id: "f2", name: "قطن" }],
      stockMovements: [mv({ itemType: "fabric", itemId: "GONE", itemName: "قطن", type: "in", qty: 5 })],
    };
    const o = analyzeStockReconciliation(data).orphans[0];
    expect(o.ambiguous).toBe(true);
    expect(o.suggestId).toBe(null);
    expect(o.candidates).toHaveLength(2);
  });
});

describe("analyzeStockReconciliation — stored drift", () => {
  it("flags items whose stored stock differs from the ledger net", () => {
    const data = {
      fabrics: [{ id: "f1", name: "قماش", stock: 999 }], // stale stored
      stockMovements: [mv({ itemType: "fabric", itemId: "f1", type: "in", qty: 80 })],
    };
    const r = analyzeStockReconciliation(data);
    expect(r.counts.drift).toBe(1);
    expect(r.drift[0]).toMatchObject({ id: "f1", stored: 999, net: 80, diff: -919 });
  });

  it("does not flag items without movements (stored is the source)", () => {
    const data = { fabrics: [{ id: "f1", name: "قماش", stock: 42 }], stockMovements: [] };
    expect(analyzeStockReconciliation(data).counts.drift).toBe(0);
  });
});

describe("relinkOrphanMovements + sync", () => {
  it("re-links orphan movements to the target and fixes the displayed balance", () => {
    const d = {
      fabrics: [{ id: "NEW_TEST", name: "TEST", unit: "متر", stock: 50, avgCost: 0 }],
      stockMovements: [
        mv({ id: "m1", itemType: "fabric", itemId: "OLD_TEST", itemName: "TEST", type: "in", qty: 30, price: 10 }),
        mv({ id: "m2", itemType: "fabric", itemId: "OLD_TEST", itemName: "TEST", type: "in", qty: 20, price: 12 }),
      ],
    };
    const target = getAllStockItems(d).find(x => x.id === "NEW_TEST");
    const changed = relinkOrphanMovements(d, "OLD_TEST", target);
    expect(changed).toBe(2);
    // movements now point at the current item
    expect(d.stockMovements.every(m => m.itemId === "NEW_TEST")).toBe(true);
    expect(d.stockMovements[0]._relinkedFrom).toBe("OLD_TEST");
    // displayed balance (ledger) now aggregates the purchases
    const fab = d.fabrics[0];
    expect(netStockOf(computeStockNetMap(d.stockMovements), fab)).toBe(50);
    // stored stock + weighted avg synced
    expect(fab.stock).toBe(50);
    expect(fab.avgCost).toBe(10.8); // (30*10 + 20*12)/50 = 10.8
    // re-analysis is clean
    expect(analyzeStockReconciliation(d).hasIssues).toBe(false);
  });

  it("is idempotent — re-running with a gone orphan id changes nothing", () => {
    const d = {
      fabrics: [{ id: "NEW_TEST", name: "TEST", stock: 50 }],
      stockMovements: [mv({ id: "m1", itemType: "fabric", itemId: "NEW_TEST", type: "in", qty: 50, price: 10 })],
    };
    const target = getAllStockItems(d).find(x => x.id === "NEW_TEST");
    expect(relinkOrphanMovements(d, "OLD_TEST", target)).toBe(0);
  });

  it("syncStoredStockFromLedger updates only the matched list item", () => {
    const d = {
      accessories: [{ id: "a1", name: "زرار", stock: 5, avgCost: 1 }],
      stockMovements: [
        mv({ itemType: "accessory", itemId: "a1", type: "in", qty: 200, price: 2 }),
        mv({ createdAt: "2026-01-02", itemType: "accessory", itemId: "a1", type: "out", qty: 50 }),
      ],
    };
    const target = getAllStockItems(d).find(x => x.id === "a1");
    expect(syncStoredStockFromLedger(d, target)).toBe(true);
    expect(d.accessories[0].stock).toBe(150);
    expect(d.accessories[0].avgCost).toBe(2);
  });
});
