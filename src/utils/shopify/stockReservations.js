/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Stock Reservations — client-side helpers (V19.94 Phase 2)
   ───────────────────────────────────────────────────────────────────────
   Read-only utilities for the UI. Server-side mutations live in
   api/shopify/_reservations.js — the client never writes to this array
   directly (transactions need server context).

   Source of truth: data.stockReservations (an array).
   ═══════════════════════════════════════════════════════════════════════ */

/* Get all active reservations (excludes committed/released/expired). */
export function getActiveReservations(data){
  const all = Array.isArray(data?.stockReservations) ? data.stockReservations : [];
  return all.filter(r => r.status === "active");
}

/* Get active+committed reservations for a SKU.
   Used by Phase 4 inventory push to compute available = physical - reserved. */
export function getReservedQtyForSku(data, sku){
  if(!sku) return 0;
  const all = Array.isArray(data?.stockReservations) ? data.stockReservations : [];
  return all
    .filter(r => (r.status === "active" || r.status === "committed") && r.product_sku === sku)
    .reduce((sum, r) => sum + (Number(r.qty) || 0), 0);
}

/* Get reservations linked to a Shopify order id (any status — for the UI
   to render "this order has 3 active reservations" etc). */
export function getReservationsForOrder(data, shopifyOrderId){
  const id = String(shopifyOrderId || "");
  if(!id) return [];
  const all = Array.isArray(data?.stockReservations) ? data.stockReservations : [];
  return all.filter(r => String(r.source_ref) === id);
}

/* Aggregate stats for the Dashboard tab card. */
export function getReservationsSummary(data){
  const all = Array.isArray(data?.stockReservations) ? data.stockReservations : [];
  const summary = {
    total: all.length,
    active: 0,
    committed: 0,
    released: 0,
    expired: 0,
    activeQty: 0,
    unmatchedActive: 0,
    bySku: new Map(), /* sku → { qty, count } for active+committed */
  };
  for(const r of all){
    summary[r.status] = (summary[r.status] || 0) + 1;
    if(r.status === "active"){
      summary.activeQty += Number(r.qty) || 0;
      if(r.unmatched) summary.unmatchedActive++;
    }
    if(r.status === "active" || r.status === "committed"){
      const k = r.product_sku || "(no-sku)";
      const cur = summary.bySku.get(k) || { qty: 0, count: 0 };
      cur.qty += Number(r.qty) || 0;
      cur.count += 1;
      summary.bySku.set(k, cur);
    }
  }
  return summary;
}
