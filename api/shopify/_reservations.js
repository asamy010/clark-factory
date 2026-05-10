/* ═══════════════════════════════════════════════════════════════
   CLARK — Stock Reservation helpers (V19.94 Phase 2, server-side)
   ───────────────────────────────────────────────────────────────
   Pure helpers that mutate a `cfg.stockReservations[]` array. The
   array shape per spec § Stock Reservation Logic:

     {
       id,                       // reservation id (auto)
       product_sku,              // CLARK model_no = Shopify SKU
       product_id,               // CLARK inventoryItems[].id (if matched, else null)
       qty,
       source,                   // "shopify_pending" | "manual_hold"
       source_ref,               // shopify_order_id (or arbitrary for manual)
       source_line,              // line index in the order (for traceability)
       reserved_at,
       expires_at,
       status,                   // "active" | "committed" | "released" | "expired"
       committed_at, committed_to,
       released_at, release_reason,
       customer_name,            // copied from order for the UI
       order_number,             // copied for display
     }

   The principle: physical stock - active reservations = available stock.
   Phase 4 (inventory push) will use this delta to compute what number
   to publish to Shopify.

   These helpers are STATELESS — they mutate the passed-in array (or
   return a new one) but don't persist. Callers wrap them inside
   db.runTransaction() to write atomically.
   ═══════════════════════════════════════════════════════════════ */

const DEFAULT_RESERVATION_TTL_DAYS = 7; /* matches spec/shopifyConfig default */

function newId(){
  return "rsv_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

/* Create reservations for all matchable line items of an order.
   - cfg: full config doc (we read inventoryItems for the matching).
   - existingReservations: current array (we filter to avoid dupes).
   - order: a mapped CLARK order (mapShopifyOrderToCLARK output).
   - ttlDays: how long the reservation lives before auto-release.
   Returns the next-state array (existing + new entries; idempotent).

   Idempotency: if a reservation already exists for (order_id, line_index)
   with status=active OR committed, we leave it. This means re-sync of
   the same order won't double-reserve. */
export function createReservationsForOrder(cfg, existingReservations, order, ttlDays){
  const days = Number(ttlDays || DEFAULT_RESERVATION_TTL_DAYS);
  const inventory = Array.isArray(cfg?.inventoryItems) ? cfg.inventoryItems : [];
  const skuToItem = new Map();
  inventory.forEach(it => {
    if(it.model_no) skuToItem.set(String(it.model_no).trim(), it);
    if(it.sku && !skuToItem.has(String(it.sku).trim())) skuToItem.set(String(it.sku).trim(), it);
  });
  const orderId = String(order.shopify_order_id);
  /* Fast lookup: existing reservations keyed by source_ref:source_line */
  const existingKey = new Set(
    existingReservations
      .filter(r => r.source_ref === orderId && (r.status === "active" || r.status === "committed"))
      .map(r => orderId + ":" + (r.source_line ?? ""))
  );
  const out = existingReservations.slice();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
  const lineItems = Array.isArray(order.line_items) ? order.line_items : [];
  const customerName = order?.customer_info?.name || "";
  const orderNumber = order?.shopify_order_number || "";
  for(let i = 0; i < lineItems.length; i++){
    const li = lineItems[i];
    const sku = String(li.sku || "").trim();
    const qty = Number(li.quantity) || 0;
    if(!sku || qty <= 0) continue;
    const k = orderId + ":" + i;
    if(existingKey.has(k)) continue;
    const matched = skuToItem.get(sku);
    out.push({
      id: newId(),
      product_sku: sku,
      product_id: matched ? matched.id : null,
      product_title: li.title || "",
      qty,
      source: "shopify_pending",
      source_ref: orderId,
      source_line: i,
      reserved_at: now,
      expires_at: expiresAt,
      status: "active",
      committed_at: null,
      committed_to: null,
      released_at: null,
      release_reason: "",
      customer_name: customerName,
      order_number: orderNumber,
      /* Flag for missing SKU mapping — Phase 4 inventory push will warn. */
      unmatched: !matched,
    });
  }
  return out;
}

/* Release all active reservations for an order. Idempotent (already-released
   stays released). Returns the new array. */
export function releaseReservationsForOrder(existingReservations, orderId, reason){
  const id = String(orderId);
  const now = new Date().toISOString();
  return existingReservations.map(r => {
    if(r.source_ref === id && r.status === "active"){
      return {
        ...r,
        status: "released",
        released_at: now,
        release_reason: String(reason || "manual_release"),
      };
    }
    return r;
  });
}

/* Commit all active reservations for an order (Phase 3 will use this).
   Sets status=committed + committed_to=invoice_id. The actual stock
   deduction happens against CLARK's existing stock model — this just
   marks the reservation as no-longer-pending. */
export function commitReservationsForOrder(existingReservations, orderId, invoiceId){
  const id = String(orderId);
  const now = new Date().toISOString();
  return existingReservations.map(r => {
    if(r.source_ref === id && r.status === "active"){
      return {
        ...r,
        status: "committed",
        committed_at: now,
        committed_to: invoiceId || null,
      };
    }
    return r;
  });
}

/* Expire reservations whose expires_at < now. Returns { array, expiredCount }.
   Used by the daily cleanup cron. */
export function expireStaleReservations(existingReservations){
  const now = Date.now();
  let expiredCount = 0;
  const out = existingReservations.map(r => {
    if(r.status === "active" && r.expires_at && new Date(r.expires_at).getTime() < now){
      expiredCount++;
      return {
        ...r,
        status: "expired",
        released_at: new Date().toISOString(),
        release_reason: "ttl_expired",
      };
    }
    return r;
  });
  return { array: out, expiredCount };
}

/* Quick aggregate: SKU → total active+committed qty. Used by Phase 4
   inventory push to compute "available for Shopify" = physical - reserved. */
export function getReservedQtyMap(existingReservations){
  const map = new Map();
  for(const r of existingReservations || []){
    if(r.status === "active" || r.status === "committed"){
      const k = String(r.product_sku || "");
      if(!k) continue;
      map.set(k, (map.get(k) || 0) + (Number(r.qty) || 0));
    }
  }
  return map;
}

/* Stats: counts by status, plus total reserved qty + value (if order data
   carries unit prices). Used by Dashboard tab. */
export function getReservationStats(existingReservations){
  const stats = { active: 0, committed: 0, released: 0, expired: 0, totalQty: 0, unmatched: 0 };
  for(const r of existingReservations || []){
    stats[r.status] = (stats[r.status] || 0) + 1;
    if(r.status === "active"){
      stats.totalQty += Number(r.qty) || 0;
      if(r.unmatched) stats.unmatched++;
    }
  }
  return stats;
}
