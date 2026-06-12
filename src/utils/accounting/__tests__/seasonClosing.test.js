/* ═══════════════════════════════════════════════════════════════════════
   seasonClosing.js test-suite (Phase 1 — V21.21.62)
   ───────────────────────────────────────────────────────────────────────
   The snapshot builder is PURE (no Firestore I/O), so we test it directly
   against hand-crafted minimal `data` objects. We cover:
   - per-treasury cash balances (in/out aggregation + default account name)
   - open-orders detection (production vs ready-stock vs fully-closed)
   - the full snapshot shape (position arithmetic) on empty + realistic data
   - the config-record summarizer drops per-party detail arrays (1MB safety)
   ═══════════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from "vitest";
import {
  buildTreasuryBalances,
  buildOpenOrders,
  buildSeasonClosingSnapshot,
  summarizeSnapshotForRecord,
} from "../seasonClosing.js";

describe("buildTreasuryBalances", () => {
  it("aggregates in/out per account and defaults to MAIN CASH", () => {
    const data = {
      treasuryAccounts: [{ id: "MAIN CASH", name: "MAIN CASH", type: "cash" }, { id: "CIB", name: "CIB", type: "bank" }],
      treasury: [
        { type: "in", amount: 1000, account: "MAIN CASH" },
        { type: "out", amount: 300, account: "MAIN CASH" },
        { type: "in", amount: 5000, account: "CIB" },
        { type: "in", amount: 200 }, /* no account → MAIN CASH */
      ],
    };
    const { rows, total } = buildTreasuryBalances(data);
    const main = rows.find(r => r.name === "MAIN CASH");
    const cib = rows.find(r => r.name === "CIB");
    expect(main.balance).toBe(900);   /* 1000 - 300 + 200 */
    expect(main.inflow).toBe(1200);
    expect(main.outflow).toBe(300);
    expect(cib.balance).toBe(5000);
    expect(cib.type).toBe("bank");
    expect(total).toBe(5900);
  });

  it("hides accounts with zero activity and sorts by balance desc", () => {
    const data = {
      treasuryAccounts: [{ name: "EMPTY", type: "cash" }, { name: "A", type: "cash" }, { name: "B", type: "cash" }],
      treasury: [
        { type: "in", amount: 100, account: "A" },
        { type: "in", amount: 500, account: "B" },
      ],
    };
    const { rows } = buildTreasuryBalances(data);
    expect(rows.map(r => r.name)).toEqual(["B", "A"]); /* EMPTY hidden, sorted desc */
  });

  it("handles missing data gracefully", () => {
    expect(buildTreasuryBalances(null)).toEqual({ rows: [], total: 0 });
    expect(buildTreasuryBalances({})).toEqual({ rows: [], total: 0 });
  });
});

describe("buildOpenOrders", () => {
  it("flags in-production orders (pending deliveries)", () => {
    const data = { orders: [
      { id: "o1", modelNo: "M1", deliveries: [{ qty: 50, status: "pending" }], customerDeliveries: [] },
    ] };
    const open = buildOpenOrders(data);
    expect(open).toHaveLength(1);
    expect(open[0].status).toBe("production");
    expect(open[0].pending).toBe(50);
  });

  it("flags ready-stock orders (confirmed, undelivered) as 'stock'", () => {
    const data = { orders: [
      /* confirmed 100 (delivery confirmed), delivered 0 → avail 100, no production left */
      { id: "o2", modelNo: "M2",
        deliveries: [{ qty: 100, status: "done" }],
        customerDeliveries: [],
        /* cut qty resolves to 0 via calcOrder on this minimal order, so confirmed(100) >= cut(0) */
      },
    ] };
    const open = buildOpenOrders(data);
    expect(open).toHaveLength(1);
    expect(open[0].status).toBe("stock");
    expect(open[0].avail).toBe(100);
  });

  it("excludes fully-closed and cancelled orders", () => {
    const data = { orders: [
      { id: "done", deliveries: [{ qty: 30, status: "done" }], customerDeliveries: [{ qty: 30 }] }, /* avail 0, no production */
      { id: "cx", status: "cancelled", deliveries: [{ qty: 10, status: "pending" }] },
    ] };
    expect(buildOpenOrders(data)).toEqual([]);
  });
});

describe("buildSeasonClosingSnapshot", () => {
  it("does not throw on empty data and returns zeroed position", () => {
    const snap = buildSeasonClosingSnapshot({}, { seasonId: "WS26", asOfDate: "2026-06-12" });
    expect(snap.seasonId).toBe("WS26");
    expect(snap.asOfDate).toBe("2026-06-12");
    expect(snap.cash.total).toBe(0);
    expect(snap.receivables.total).toBe(0);
    expect(snap.payables.total).toBe(0);
    expect(snap.position.netWorth).toBe(0);
    expect(snap.openOrdersCount).toBe(0);
  });

  it("computes position = assets − liabilities from live data", () => {
    const data = {
      activeSeason: "WS26",
      treasuryAccounts: [{ name: "MAIN CASH", type: "cash" }],
      treasury: [{ type: "in", amount: 10000, account: "MAIN CASH" }],
      fabrics: [{ name: "Cotton", stock: 10, avgCost: 50 }], /* inventory 500 */
    };
    const snap = buildSeasonClosingSnapshot(data, { seasonId: "WS26" });
    expect(snap.cash.total).toBe(10000);
    expect(snap.inventory.fabric).toBe(500);
    /* assets = cash(10000) + AR(0) + inventory(500) = 10500; liabilities 0 */
    expect(snap.position.totalAssets).toBe(10500);
    expect(snap.position.netWorth).toBe(10500);
  });
});

describe("summarizeSnapshotForRecord", () => {
  it("strips per-party detail arrays but keeps totals (1MB safety)", () => {
    const snap = buildSeasonClosingSnapshot({
      treasuryAccounts: [{ name: "MAIN CASH", type: "cash" }],
      treasury: [{ type: "in", amount: 7000, account: "MAIN CASH" }],
    }, { seasonId: "WS26" });
    const rec = summarizeSnapshotForRecord(snap);
    expect(rec.seasonId).toBe("WS26");
    expect(rec.cashTotal).toBe(7000);
    expect(rec.cashAccounts).toHaveLength(1);
    /* No detail arrays leaked into the config record */
    expect(rec.receivables).toBeUndefined();
    expect(JSON.stringify(rec)).not.toContain("detail");
  });
});
