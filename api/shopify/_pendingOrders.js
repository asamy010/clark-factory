/* ═══════════════════════════════════════════════════════════════
   CLARK — Shopify pending-orders split-collection helper (V21.9.18)
   ───────────────────────────────────────────────────────────────
   Pre-V21.9.18, server endpoints (sync-orders-now, mark-delivered,
   mark-refused, process-return, sync-customers, bosta-*) read and
   wrote `cfg.shopifyPendingOrders` as a flat array on factory/config.
   That worked while the cap was 200 but at full load was ~280 KB —
   67.8% of factory/config, which was 40.9% of the 1 MB doc limit.
   Every additional order brought the doc closer to writes failing
   with "document too large", and every sync rewrote the whole array.

   V21.9.18 splits the array into per-day docs:
     shopifyOrdersDays/{YYYY-MM-DD} → { date, entries: [...], count }

   The day key comes from order.shopify_created_at (Shopify's
   creation timestamp, ISO 8601). Each day doc carries the orders
   created on that day — typical fashion store has 5–80 orders/day,
   so the per-day doc stays well under 100 KB.

   This module wraps the read/write pattern so endpoints can stay
   simple. After the V21.9.18 migration flag is set on
   factory/config, all server reads/writes route through here.
   Pre-migration, the helpers fall back to the legacy in-config
   array for backwards compatibility.
   ═══════════════════════════════════════════════════════════════ */

import { getDb } from "../_firebase.js";

export const SHOPIFY_ORDERS_COL = "shopifyOrdersDays";
export const SHOPIFY_ORDERS_SPLIT_FLAG = "_splitDaysV2199Done";

/* Day key from a Shopify-created-at timestamp.
   Falls back to today if the timestamp is missing/invalid — better than
   "unknown" because the order is still routable. */
function dayKey(order) {
  const iso = order?.shopify_created_at || order?.createdAt || order?.date;
  if (iso) {
    try {
      const d = new Date(iso);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    } catch (_) { /* fall through */ }
  }
  return new Date().toISOString().slice(0, 10);
}

/* Returns true if the V21.9.18 migration has been applied — meaning
   `cfg.shopifyPendingOrders` no longer exists and all data is in
   shopifyOrdersDays/*. */
export function isPendingOrdersSplit(cfg) {
  return !!(cfg && cfg[SHOPIFY_ORDERS_SPLIT_FLAG]);
}

/* Read ALL pending orders. Post-migration: flatten every day doc.
   Pre-migration: legacy cfg.shopifyPendingOrders array. */
export async function readAllPendingOrders(cfg) {
  if (!isPendingOrdersSplit(cfg)) {
    return Array.isArray(cfg?.shopifyPendingOrders) ? cfg.shopifyPendingOrders : [];
  }
  const db = getDb();
  const snap = await db.collection(SHOPIFY_ORDERS_COL).get();
  const all = [];
  snap.forEach(d => {
    const data = d.data();
    if (data && Array.isArray(data.entries)) {
      all.push(...data.entries);
    }
  });
  /* Sort newest-first by shopify_created_at to match the cfg-array
     convention. Callers that already sort can ignore the order. */
  all.sort((a, b) => {
    const ta = a?.shopify_created_at ? new Date(a.shopify_created_at).getTime() : 0;
    const tb = b?.shopify_created_at ? new Date(b.shopify_created_at).getTime() : 0;
    return tb - ta;
  });
  return all;
}

/* Find a single pending order by shopify_order_id. Returns
   { order, dayId } so the caller can write back to the right day doc.
   Post-migration: queries every day doc (O(days) reads, typically small).
   Pre-migration: walks the legacy cfg array.

   For performance-critical callers, prefer readAllPendingOrders once
   and search the flat array. */
export async function findPendingOrder(cfg, shopifyOrderId) {
  const id = String(shopifyOrderId);
  if (!isPendingOrdersSplit(cfg)) {
    const arr = Array.isArray(cfg?.shopifyPendingOrders) ? cfg.shopifyPendingOrders : [];
    const order = arr.find(o => String(o?.shopify_order_id) === id) || null;
    return { order, dayId: null /* legacy: lives in cfg, not a day */, fromLegacy: true };
  }
  const db = getDb();
  const snap = await db.collection(SHOPIFY_ORDERS_COL).get();
  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    if (!data || !Array.isArray(data.entries)) continue;
    const order = data.entries.find(o => String(o?.shopify_order_id) === id);
    if (order) {
      return { order, dayId: docSnap.id, fromLegacy: false };
    }
  }
  return { order: null, dayId: null, fromLegacy: false };
}

/* Upsert a single pending order. Routes to the correct day doc by
   shopify_created_at; matches by shopify_order_id within the day.

   IMPORTANT: this writes a single day doc — it does NOT remove the
   order from another day doc if its shopify_created_at field changed.
   Shopify created_at is immutable, so this is fine for normal flow.
   Edge case: if an admin manually edited the date, the old day doc
   would retain a duplicate; that's acceptable cleanup-on-restart UX. */
export async function upsertPendingOrder(cfg, order) {
  const id = String(order?.shopify_order_id || "");
  if (!id) throw new Error("upsertPendingOrder: missing shopify_order_id");

  if (!isPendingOrdersSplit(cfg)) {
    /* Pre-migration: update legacy array inside transaction */
    const db = getDb();
    const cfgRef = db.collection("factory").doc("config");
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(cfgRef);
      const c = snap.exists ? (snap.data() || {}) : {};
      const arr = Array.isArray(c.shopifyPendingOrders) ? c.shopifyPendingOrders.slice() : [];
      const idx = arr.findIndex(o => String(o?.shopify_order_id) === id);
      if (idx >= 0) arr[idx] = order;
      else arr.unshift(order);
      tx.set(cfgRef, { shopifyPendingOrders: arr }, { merge: true });
    });
    return;
  }

  /* Post-migration: write to the specific day doc */
  const db = getDb();
  const day = dayKey(order);
  const dayRef = db.collection(SHOPIFY_ORDERS_COL).doc(day);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(dayRef);
    const data = snap.exists ? (snap.data() || {}) : {};
    const entries = Array.isArray(data.entries) ? data.entries.slice() : [];
    const idx = entries.findIndex(o => String(o?.shopify_order_id) === id);
    if (idx >= 0) entries[idx] = order;
    else entries.unshift(order);
    tx.set(dayRef, {
      date: day,
      entries,
      count: entries.length,
      updatedAt: new Date().toISOString(),
    });
  });
}

/* Bulk upsert — used by sync-orders-now and historical sync. Routes
   each order to its own day doc, batched. Much more efficient than
   N separate upsertPendingOrder calls for sync flows. */
export async function upsertManyPendingOrders(cfg, orders) {
  if (!Array.isArray(orders) || orders.length === 0) return { count: 0 };

  if (!isPendingOrdersSplit(cfg)) {
    /* Pre-migration: single tx that updates the legacy array */
    const db = getDb();
    const cfgRef = db.collection("factory").doc("config");
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(cfgRef);
      const c = snap.exists ? (snap.data() || {}) : {};
      const arr = Array.isArray(c.shopifyPendingOrders) ? c.shopifyPendingOrders.slice() : [];
      const byId = new Map(arr.map((o, i) => [String(o?.shopify_order_id), i]));
      for (const o of orders) {
        const id = String(o?.shopify_order_id || "");
        if (!id) continue;
        const idx = byId.get(id);
        if (idx != null) arr[idx] = o;
        else { arr.unshift(o); byId.set(id, 0); }
      }
      tx.set(cfgRef, { shopifyPendingOrders: arr }, { merge: true });
    });
    return { count: orders.length };
  }

  /* Post-migration: group orders by day, then one tx per day doc.
     Each tx reads the existing entries and merges. We can't use a
     single big batch because each day doc needs read-before-write
     for correct merging. */
  const db = getDb();
  const byDay = new Map();
  for (const o of orders) {
    const id = String(o?.shopify_order_id || "");
    if (!id) continue;
    const day = dayKey(o);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(o);
  }
  let totalWritten = 0;
  for (const [day, dayOrders] of byDay.entries()) {
    const dayRef = db.collection(SHOPIFY_ORDERS_COL).doc(day);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(dayRef);
      const data = snap.exists ? (snap.data() || {}) : {};
      const entries = Array.isArray(data.entries) ? data.entries.slice() : [];
      const byId = new Map(entries.map((o, i) => [String(o?.shopify_order_id), i]));
      for (const o of dayOrders) {
        const id = String(o.shopify_order_id);
        const idx = byId.get(id);
        if (idx != null) entries[idx] = o;
        else { entries.unshift(o); byId.set(id, 0); }
      }
      tx.set(dayRef, {
        date: day,
        entries,
        count: entries.length,
        updatedAt: new Date().toISOString(),
      });
      totalWritten += dayOrders.length;
    });
  }
  return { count: totalWritten, days: byDay.size };
}

/* Delete a pending order. Returns true if found+deleted. */
export async function deletePendingOrder(cfg, shopifyOrderId) {
  const id = String(shopifyOrderId);
  if (!isPendingOrdersSplit(cfg)) {
    const db = getDb();
    const cfgRef = db.collection("factory").doc("config");
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(cfgRef);
      const c = snap.exists ? (snap.data() || {}) : {};
      const arr = (Array.isArray(c.shopifyPendingOrders) ? c.shopifyPendingOrders : [])
        .filter(o => String(o?.shopify_order_id) !== id);
      tx.set(cfgRef, { shopifyPendingOrders: arr }, { merge: true });
    });
    return true;
  }
  /* Post-migration: scan day docs (rare operation; full scan is fine) */
  const db = getDb();
  const snap = await db.collection(SHOPIFY_ORDERS_COL).get();
  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    if (!data || !Array.isArray(data.entries)) continue;
    const idx = data.entries.findIndex(o => String(o?.shopify_order_id) === id);
    if (idx >= 0) {
      const next = data.entries.slice();
      next.splice(idx, 1);
      await docSnap.ref.set({
        date: data.date,
        entries: next,
        count: next.length,
        updatedAt: new Date().toISOString(),
      });
      return true;
    }
  }
  return false;
}
