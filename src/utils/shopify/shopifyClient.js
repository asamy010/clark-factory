/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Shopify Client (V19.91 — Phase 0)
   ───────────────────────────────────────────────────────────────────────
   Browser-side wrapper for the /api/shopify/* serverless endpoints.

   ⚠️ Why no direct Shopify Admin API calls from the browser?
   The Admin API access token has full store access (read/write orders,
   customers, products, inventory). Exposing it to the client = anyone
   with browser dev-tools can dump the entire store. So:
     • The token lives ONLY in factory/config.shopifyConfig (server-readable)
       OR in Vercel env (SHOPIFY_ACCESS_TOKEN).
     • All Shopify Admin API calls go through /api/shopify/* (server-side).
     • This file calls those /api endpoints — it never touches Shopify directly.

   Auth: caller must be admin/manager. Endpoints accept an admin Firebase
   ID token (Authorization: Bearer <token>) and verify role server-side.
   ═══════════════════════════════════════════════════════════════════════ */

const API_TIMEOUT_MS = 20000;

/* Get a fresh admin ID token from the currently signed-in Firebase user.
   Throws if no user is logged in. The token is short-lived (~1h), so we
   fetch a fresh one on every call rather than caching. */
async function getIdToken(user){
  if(!user || typeof user.getIdToken !== "function"){
    throw new Error("لازم تسجّل دخول كأدمن قبل ما تستخدم Shopify");
  }
  return await user.getIdToken();
}

/* Generic fetch wrapper with timeout + JSON parsing + error normalization.
   All endpoints return { ok:bool, ...payload } or { ok:false, error }. */
async function call(method, path, body, user){
  const idToken = await getIdToken(user);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);
  try {
    const opts = {
      method,
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + idToken,
      },
      signal: ctrl.signal,
    };
    if(body && method !== "GET") opts.body = JSON.stringify(body);
    const r = await fetch(path, opts);
    let data;
    try { data = await r.json(); } catch(_) { data = {}; }
    if(!r.ok){
      const msg = data?.error || ("HTTP " + r.status);
      throw new Error(msg);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/* ── Public client API ────────────────────────────────────────────────── */

/* Test + save Shopify credentials.
   { storeUrl, accessToken, apiVersion } → { ok, store: {name, currency, plan, productsCount} } */
export function shopifyConnect(creds, user){
  return call("POST", "/api/shopify/connect", creds, user);
}

/* Read connection status (without exposing the token).
   → { ok, connected, storeUrl, apiVersion, lastConnectedAt, store: {...} } */
export function shopifyStatus(user){
  return call("GET", "/api/shopify/status", null, user);
}

/* Wipe credentials from factory/config.shopifyConfig.
   → { ok } */
export function shopifyDisconnect(user){
  return call("POST", "/api/shopify/disconnect", {}, user);
}

/* V19.92: Initiate OAuth 2.0 install flow.
   { storeUrl } → { ok, authUrl, redirectUri }
   The caller redirects window.location to authUrl. Shopify shows the
   approve-scopes screen, then redirects back to /api/shopify/oauth-callback
   which saves the resulting shpat_ token to Firestore and bounces the
   browser back to /?tab=shopify&shopify_connected=1. */
export function shopifyOAuthInit({ storeUrl }, user){
  return call("POST", "/api/shopify/oauth-init", { storeUrl }, user);
}

/* V19.93 Phase 1: Manual orders sync.
   { sinceHours?, force? } → { ok, count, new, updated, skipped, lastSyncAt } */
export function shopifySyncOrdersNow(opts, user){
  return call("POST", "/api/shopify/sync-orders-now", opts || {}, user);
}

/* V19.93 Phase 1: Mark a Shopify pending order as delivered.
   { orderId, deliveredAt? } → { ok, order } */
export function shopifyMarkDelivered({ orderId, deliveredAt }, user){
  return call("POST", "/api/shopify/mark-delivered", { orderId, deliveredAt }, user);
}

/* V19.93 Phase 1: Mark a Shopify pending order as refused.
   { orderId, reason? } → { ok, order } */
export function shopifyMarkRefused({ orderId, reason }, user){
  return call("POST", "/api/shopify/mark-refused", { orderId, reason }, user);
}

/* V19.93 Phase 1: Pull all Shopify products into factory/config.shopifyProducts.
   {} → { ok, total, matched, missing, mismatch } */
export function shopifySyncProductsNow(user){
  return call("POST", "/api/shopify/sync-products-now", {}, user);
}

/* V19.95 Phase 3: Process a return for a delivered Shopify order.
   Generates a draft credit note + flips order status to "returned".
   { orderId, reason? } → { ok, order, creditNote, hint } */
export function shopifyProcessReturn({ orderId, reason }, user){
  return call("POST", "/api/shopify/process-return", { orderId, reason }, user);
}

/* V19.96 Phase 4: Push CLARK's computed available stock to Shopify.
   { dryRun?, skus? } → { ok, total, pushed, skipped, errors, details } */
export function shopifyPushInventoryNow(opts, user){
  return call("POST", "/api/shopify/push-inventory-now", opts || {}, user);
}

/* V19.96 Phase 4: Update per-product inventory-push settings.
   { shopifyProductId, settings } → { ok, product } */
export function shopifyUpdateProductSettings({ shopifyProductId, settings }, user){
  return call("POST", "/api/shopify/update-product-settings", { shopifyProductId, settings }, user);
}

/* V19.99 Phase 7: Bulk update operations on shopifyProducts.
   { productIds, action, payload? } → { ok, updated, deleted, blacklistSize } */
export function shopifyBulkUpdateProducts({ productIds, action, payload }, user){
  return call("POST", "/api/shopify/bulk-update-products", { productIds, action, payload }, user);
}

/* V19.99: Sync products with optional filters.
   { filters?, replaceMode? } → { ok, total, fetched, afterFilters, matched, ... } */
export function shopifySyncProductsWithFilters(opts, user){
  return call("POST", "/api/shopify/sync-products-now", opts || {}, user);
}

/* V20.0 Phase 8: Create CLARK inventoryItems from Shopify products.
   Single product: { shopifyProductId, stock?, unit?, categoryId? }
   Bulk: { bulkProductIds: [...], stock?, unit?, categoryId? }
   → { ok, created, linked, skipped, items: [...] } */
export function shopifyCreateClarkItem(opts, user){
  return call("POST", "/api/shopify/create-clark-item", opts, user);
}

/* V20.2 Phase 11: Aggregate customers from existing orders.
   V21.9.4: accept opts.jobId (and any other body params) for progress tracking.
   Backward-compat: still accepts (user) signature with no opts.
   { jobId? } → { ok, total, with_delivered, vip, regular, new, at_risk, ... } */
export function shopifySyncCustomers(optsOrUser, maybeUser){
  /* Detect legacy call: shopifySyncCustomers(user) */
  if(optsOrUser && typeof optsOrUser.getIdToken === "function"){
    return call("POST", "/api/shopify/sync-customers", {}, optsOrUser);
  }
  /* New call: shopifySyncCustomers({ jobId }, user) */
  return call("POST", "/api/shopify/sync-customers", optsOrUser || {}, maybeUser);
}

/* V20.2 Phase 11: Update a single or many customers.
   Single: { customerId, tags?, notes?, accepts_marketing?, do_not_contact?, bumpContact? }
   Bulk: { bulkCustomerIds: [...], tags?, ... }
   → { ok, updated, customer? } */
export function shopifyUpdateCustomer(opts, user){
  return call("POST", "/api/shopify/update-customer", opts, user);
}

/* V21.0 Phase 10: Push a CLARK order/model to Shopify with matrix
   variants, multiple images, description.
   { orderId, description?, images?, colorSourceFabric?, skuPattern?, ... }
   → { ok, action, shopify_product_id, variants_count, images_uploaded, errors } */
export function shopifyPushProductFromClark(opts, user){
  return call("POST", "/api/shopify/push-product-from-clark", opts, user);
}

/* V21.1 Phase 10b: Sync abandoned carts.
   { hoursBack? } → { ok, total, withPhone, withEmail, totalValue } */
export function shopifySyncAbandonedCarts(opts, user){
  return call("POST", "/api/shopify/sync-abandoned-carts", opts || {}, user);
}

/* V21.1 Phase 10b: Update cart recovery state (bump contact, mark recovered, etc).
   { cartId | bulkCartIds, bumpContact?, recovered?, do_not_contact?, user_note? } */
export function shopifyUpdateCartRecovery(opts, user){
  return call("POST", "/api/shopify/update-cart-recovery", opts, user);
}

/* V21.2 Phase 10c: Discount codes manager.
   { action: "list" | "sync" | "create" | "delete", ... } */
export function shopifyDiscountCodes(opts, user){
  return call("POST", "/api/shopify/discount-codes", opts, user);
}

/* V21.6 Phase 10g: Push CLARK customer tags + notes to Shopify customer.
   { customerId | bulkCustomerIds, mode? } → { ok, pushed, skipped, errors } */
export function shopifyPushCustomerTags(opts, user){
  return call("POST", "/api/shopify/push-customer-tags", opts, user);
}

/* V21.9 Phase 11c: FULL-HISTORY backfill of Shopify orders. Walks every
   order from sinceISO forward (default 2 years), splits per yearmonth in
   shopifyOrdersArchive collection.
   { sinceISO?, maxOrders?, maxPages?, status? }
   → { ok, totalFetched, monthlyBreakdown, archiveDocsWritten, durationMs } */
export function shopifySyncHistoricalOrders(opts, user){
  return call("POST", "/api/shopify/sync-historical-orders", opts || {}, user);
}

/* V21.9 Phase 11d: Pull all Bosta deliveries + run verification check
   against existing CLARK orders to catch state mismatches.
   { sinceISO?, maxDeliveries? }
   → { ok, totalFetched, verification: { linked, matching, mismatches[], ... } } */
export function bostaSyncHistorical(opts, user){
  return call("POST", "/api/bosta/sync-historical", opts || {}, user);
}

/* V21.9 Phase 11e: Smart diagnostics — file-size, connection-health,
   critical data alerts.
   {} → full report (see api/diagnostics.js for shape) */
export function fetchDiagnostics(user){
  return call("GET", "/api/diagnostics", null, user);
}

/* V21.9.1 Phase 11g: List archived orders from shopifyOrdersArchive
   collection. Each order includes payment + shipment status.
   { month?, limit?, status? }
   → { ok, month, orders: [...], available_months: [...] } */
export function shopifyListArchivedOrders(opts, user){
  return call("POST", "/api/shopify/list-archived-orders", opts || {}, user);
}

/* V21.9.2 Phase 11h: Migrate shopifyProducts + shopifyCustomers from
   factory/config arrays into per-id collections (shopifyProductsDocs,
   shopifyCustomersDocs). One-shot, idempotent.
   { dryRun? }
   → { ok, products_migrated, customers_migrated, freed_kb, ... } */
export function splitShopifyCollections(opts, user){
  return call("POST", "/api/maintenance/split-shopify-collections", opts || {}, user);
}

/* V21.9.7 Phase 11m: Return Requests CRUD.
   Create — { shopify_order_id, reason, reason_text, items[], refund_amount?, ... }
   List   — { status?, search?, limit?, offset? }
   Update — { id, action: "approve"|"reject"|..., notes?, refund_amount?, create_bosta_pickup? } */
export function returnRequestCreate(opts, user){
  return call("POST", "/api/shopify/return-request-create", opts, user);
}
export function returnRequestsList(opts, user){
  return call("POST", "/api/shopify/return-requests-list", opts || {}, user);
}
export function returnRequestUpdate(opts, user){
  return call("POST", "/api/shopify/return-request-update", opts, user);
}

/* V21.9.8 Phase 11n: WhatsApp Campaigns CRUD + run preparation. */
export function campaignCreate(opts, user){
  return call("POST", "/api/shopify/campaign-create", opts, user);
}
export function campaignsList(opts, user){
  return call("POST", "/api/shopify/campaigns-list", opts || {}, user);
}
export function campaignUpdate(opts, user){
  return call("POST", "/api/shopify/campaign-update", opts, user);
}
export function campaignPrepareRun(opts, user){
  return call("POST", "/api/shopify/campaign-prepare-run", opts, user);
}
