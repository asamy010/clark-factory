/* ═══════════════════════════════════════════════════════════════
   CLARK — GET /api/diagnostics (V21.9 Phase 11e)
   ───────────────────────────────────────────────────────────────
   Smart diagnostics endpoint — health check + storage monitor.

   Detects:
     • File size issues per app/feature (factory/config sub-arrays)
     • Connection issues (Shopify, Bosta creds + last sync recency)
     • Critical data issues (e.g. orphaned reservations, malformed orders)
     • Catastrophic file size levels (≥ 800KB → near 1MB Firestore cap)
     • Archive collection sizes (shopifyOrdersArchive,
       bostaDeliveriesArchive)

   Severity levels:
     ok        — green
     info      — blue ("just so you know")
     warn      — yellow (action recommended)
     error     — red (action required)
     critical  — pulsing red (data loss / outage imminent)

   Auth: admin Bearer token

   Returns: {
     ok, generated_at,
     overall_severity: "ok"|"info"|"warn"|"error"|"critical",
     storage: {
       config_doc_bytes, config_doc_pct_of_max,
       arrays: [{ name, count, est_bytes, pct_of_doc, severity }],
       archive_collections: [{ name, doc_count, est_total_bytes }],
     },
     connections: {
       shopify: { configured, last_orders_sync_at, age_hours, severity },
       bosta:   { configured, has_webhook, last_sync_at, age_hours, severity },
     },
     critical: [{ kind, message, severity, action_url? }],
     summary: { total_checks, ok, info, warn, error, critical }
   }
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "./_firebase.js";

/* Firestore document hard cap is 1,048,576 bytes (1 MiB).
   Working ceiling = 800KB so we have headroom for a single transaction
   write that grows the doc by ~20%. */
const FIRESTORE_DOC_HARD_CAP = 1048576;
const FIRESTORE_DOC_SAFE_CAP = 800 * 1024;
const FIRESTORE_DOC_WARN_CAP = 600 * 1024;

/* Approximate byte size of a JSON-serializable value. Not perfect (Firestore
   uses its own encoding) but close enough for triage. */
function approxBytes(v){
  try {
    return Buffer.byteLength(JSON.stringify(v) || "", "utf8");
  } catch(_) {
    return 0;
  }
}

function severityOfPct(pct){
  if(pct >= 80) return "critical";
  if(pct >= 60) return "error";
  if(pct >= 40) return "warn";
  if(pct >= 20) return "info";
  return "ok";
}

function severityOfHours(hours, thresholds){
  if(hours == null) return "warn";
  if(hours >= thresholds.critical) return "critical";
  if(hours >= thresholds.error) return "error";
  if(hours >= thresholds.warn) return "warn";
  return "ok";
}

function maxSeverity(severities){
  const order = ["ok", "info", "warn", "error", "critical"];
  let best = "ok";
  for(const s of severities){
    if(order.indexOf(s) > order.indexOf(best)) best = s;
  }
  return best;
}

export default async function handler(req, res){
  setCors(res, req);
  if(req.method === "OPTIONS"){ res.status(204).end(); return; }
  if(req.method !== "GET" && req.method !== "POST"){
    return res.status(405).json({ ok:false, error: "GET/POST فقط" });
  }
  const auth = await verifyAdminToken(req.headers.authorization);
  if(!auth.ok){
    return res.status(auth.status).json({ ok:false, error: auth.error });
  }

  const report = {
    ok: true,
    generated_at: new Date().toISOString(),
    overall_severity: "ok",
    storage: {
      config_doc_bytes: 0,
      config_doc_pct_of_max: 0,
      arrays: [],
      archive_collections: [],
    },
    connections: {
      shopify: { configured: false, last_orders_sync_at: null, age_hours: null, severity: "warn" },
      bosta:   { configured: false, has_webhook: false, last_sync_at: null, age_hours: null, severity: "warn" },
    },
    critical: [],
    summary: { total_checks: 0, ok: 0, info: 0, warn: 0, error: 0, critical: 0 },
  };

  let cfg = {};
  try {
    const db = getDb();
    const snap = await db.collection("factory").doc("config").get();
    cfg = snap.exists ? (snap.data() || {}) : {};
  } catch(e){
    return res.status(500).json({ ok:false, error: "تعذر قراءة config: " + e.message });
  }

  /* ── Storage analysis: factory/config doc ── */
  const docBytes = approxBytes(cfg);
  const docPct = (docBytes / FIRESTORE_DOC_HARD_CAP) * 100;
  report.storage.config_doc_bytes = docBytes;
  report.storage.config_doc_pct_of_max = Math.round(docPct * 10) / 10;
  const docSeverity = severityOfPct(docPct);
  if(docSeverity !== "ok"){
    report.critical.push({
      kind: "config_doc_size",
      message: `Document factory/config = ${(docBytes/1024).toFixed(1)} KB (${report.storage.config_doc_pct_of_max}% من الحد الأقصى 1MB)` +
        (docPct >= 80 ? " — ممكن يفشل عند أي write جديد!" : ""),
      severity: docSeverity,
      bytes: docBytes,
      pct: report.storage.config_doc_pct_of_max,
      action_url: "/api/diagnostics?action=migrate_to_archives",
    });
  }

  /* Per-array breakdown — figure out which arrays are biggest */
  const arrayKeys = [
    { key: "orders",                 label: "أوامر القص (orders)" },
    { key: "shopifyPendingOrders",   label: "طلبات Shopify (pending)" },
    { key: "shopifyProducts",        label: "منتجات Shopify" },
    { key: "shopifyCustomers",       label: "عملاء Shopify" },
    { key: "shopifyAbandonedCarts",  label: "Carts متروكة" },
    { key: "shopifyDiscounts",       label: "أكواد خصم" },
    { key: "shopifyInvoices",        label: "فواتير Shopify" },
    { key: "shopifyReturns",         label: "مرتجعات" },
    { key: "stockReservations",      label: "حجوزات مخزون" },
    { key: "inventoryItems",         label: "مخزون CLARK" },
    { key: "fabrics",                label: "خامات" },
    { key: "rolls",                  label: "رولات" },
    { key: "movements",              label: "حركات" },
    { key: "purchases",              label: "مشتريات" },
    { key: "bostaIntegrationLogs",   label: "logs Bosta" },
    { key: "shopifyIntegrationLogs", label: "logs Shopify" },
  ];
  for(const a of arrayKeys){
    const v = cfg[a.key];
    if(!Array.isArray(v)) continue;
    const bytes = approxBytes(v);
    const pctOfDoc = docBytes > 0 ? (bytes / docBytes) * 100 : 0;
    const pctOfMax = (bytes / FIRESTORE_DOC_HARD_CAP) * 100;
    const sev = severityOfPct(pctOfMax * 1.5); /* arrays should stay <30% of cap */
    report.storage.arrays.push({
      name: a.key,
      label: a.label,
      count: v.length,
      est_bytes: bytes,
      pct_of_doc: Math.round(pctOfDoc * 10) / 10,
      pct_of_max: Math.round(pctOfMax * 10) / 10,
      severity: sev,
    });
    if(sev === "error" || sev === "critical"){
      report.critical.push({
        kind: "array_too_large",
        message: `مصفوفة ${a.label} (${v.length} عنصر, ${(bytes/1024).toFixed(0)} KB) قاربت تتعدى الحد — تحتاج split-collection storage`,
        severity: sev,
        array: a.key,
      });
    }
  }
  /* Sort by size descending */
  report.storage.arrays.sort((a, b) => b.est_bytes - a.est_bytes);

  /* ── Archive + partitioned collections (count only — we don't read all docs to keep cost low) ── */
  try {
    const db = getDb();
    /* V21.9.2: include the new partitioned collections */
    for(const colName of [
      "shopifyOrdersArchive",
      "bostaDeliveriesArchive",
      "shopifyProductsDocs",
      "shopifyCustomersDocs",
    ]){
      const snap = await db.collection(colName).count().get();
      const count = snap.data().count;
      /* Per-doc collections: ~5KB avg (products) / ~1KB avg (customers).
         Archive: ~600 docs × 1KB = ~600KB per doc. */
      const isArchive = colName.endsWith("Archive");
      const isProducts = colName === "shopifyProductsDocs";
      const avgBytes = isArchive ? 600 * 1024 : (isProducts ? 5000 : 1000);
      report.storage.archive_collections.push({
        name: colName,
        doc_count: count,
        est_total_bytes: count * avgBytes,
      });
    }
  } catch(e){
    /* not fatal — just skip */
    report.storage.archive_collections.push({
      name: "(error reading archives)",
      doc_count: 0,
      est_total_bytes: 0,
      error: e.message,
    });
  }

  /* ── Connection health: Shopify ── */
  const sc = cfg.shopifyConfig || {};
  const shopifyConfigured = !!(sc.store_url && sc.api_token);
  const lastShopSync = sc.last_orders_sync_at;
  const shopAgeHours = lastShopSync
    ? (Date.now() - new Date(lastShopSync).getTime()) / 3600000
    : null;
  const shopSyncSeverity = !shopifyConfigured
    ? "warn"
    : severityOfHours(shopAgeHours, { warn: 6, error: 24, critical: 72 });
  report.connections.shopify = {
    configured: shopifyConfigured,
    store_url: sc.store_url || "",
    last_orders_sync_at: lastShopSync,
    age_hours: shopAgeHours == null ? null : Math.round(shopAgeHours * 10) / 10,
    severity: shopSyncSeverity,
    last_orders_sync_count: sc.last_orders_sync_count || 0,
  };
  if(!shopifyConfigured){
    report.critical.push({
      kind: "shopify_not_configured",
      message: "Shopify مش متصل — اربط المتجر من تاب Connection",
      severity: "warn",
    });
  } else if(shopSyncSeverity === "error" || shopSyncSeverity === "critical"){
    report.critical.push({
      kind: "shopify_sync_stale",
      message: `آخر sync لطلبات Shopify منذ ${Math.round(shopAgeHours)} ساعة — الـ cron مش شغال؟`,
      severity: shopSyncSeverity,
    });
  }

  /* ── Connection health: Bosta ── */
  const bostaConfigured = !!sc.bosta_api_key;
  const bostaWebhookSet = !!process.env.BOSTA_WEBHOOK_SECRET;
  const lastBostaSync = sc.last_bosta_historical_sync_at || sc.bosta_webhook_secret_generated_at;
  const bostaAgeHours = lastBostaSync
    ? (Date.now() - new Date(lastBostaSync).getTime()) / 3600000
    : null;
  const bostaSeverity = !bostaConfigured
    ? "info"
    : !bostaWebhookSet
      ? "warn"
      : "ok";
  report.connections.bosta = {
    configured: bostaConfigured,
    has_webhook: bostaWebhookSet,
    last_sync_at: lastBostaSync,
    age_hours: bostaAgeHours == null ? null : Math.round(bostaAgeHours * 10) / 10,
    severity: bostaSeverity,
  };
  if(bostaConfigured && !bostaWebhookSet){
    report.critical.push({
      kind: "bosta_webhook_missing",
      message: "Bosta متصل لكن webhook secret مش متعرّف في Vercel — لن نستلم تحديثات state تلقائياً",
      severity: "warn",
    });
  }

  /* ── Critical data issues ── */
  /* 1. Orphaned reservations (status=active but source order is gone) */
  const reservations = Array.isArray(cfg.stockReservations) ? cfg.stockReservations : [];
  const orderIds = new Set((cfg.shopifyPendingOrders || []).map(o => String(o.shopify_order_id)));
  const orphans = reservations.filter(r =>
    r.status === "active" &&
    r.source_type === "shopify" &&
    r.source_ref &&
    !orderIds.has(String(r.source_ref))
  );
  if(orphans.length > 0){
    report.critical.push({
      kind: "orphaned_reservations",
      message: `${orphans.length} حجز مخزون معلّق بدون طلب مرتبط — يأكل من الـ available stock بدون داعي`,
      severity: orphans.length > 20 ? "error" : "warn",
      orphan_count: orphans.length,
      action_url: "/api/maintenance/cleanup-orphan-reservations",
    });
  }

  /* 2. Pending orders > 14 days old (should have been refused or delivered) */
  const veryOldPending = (cfg.shopifyPendingOrders || []).filter(o => {
    if(o.status !== "pending_delivery") return false;
    const ts = o.shopify_created_at;
    if(!ts) return false;
    const ageDays = (Date.now() - new Date(ts).getTime()) / 86400000;
    return ageDays > 14;
  });
  if(veryOldPending.length > 0){
    report.critical.push({
      kind: "stale_pending_orders",
      message: `${veryOldPending.length} طلب لسه pending_delivery من أكتر من 14 يوم — يحتاج مراجعة`,
      severity: veryOldPending.length > 10 ? "error" : "warn",
      count: veryOldPending.length,
    });
  }

  /* 3. Customers without phone (can't WhatsApp / call them).
     V21.9.2: post-migration, customers live in shopifyCustomersDocs collection.
     We don't read all of them here (cost) — we just check the partitioned flag
     and either read the array (legacy) or skip the check (post-migration —
     the user can run sync-customers to refresh stats). */
  const customersForCheck = Array.isArray(cfg.shopifyCustomers) ? cfg.shopifyCustomers : [];
  const customersNoPhone = customersForCheck.filter(c => !c.phone);
  if(customersNoPhone.length > 0){
    report.critical.push({
      kind: "customers_no_phone",
      message: `${customersNoPhone.length} عميل بدون رقم تليفون — لا يمكن التواصل بـ WhatsApp/SMS`,
      severity: "info",
      count: customersNoPhone.length,
    });
  }

  /* ── Summary tally ── */
  report.summary.total_checks = report.critical.length + 3; /* connections + storage */
  for(const c of report.critical){
    report.summary[c.severity]++;
  }
  /* Add the connection-level severities */
  report.summary[shopSyncSeverity] = (report.summary[shopSyncSeverity] || 0) + 1;
  report.summary[bostaSeverity] = (report.summary[bostaSeverity] || 0) + 1;
  report.summary[docSeverity] = (report.summary[docSeverity] || 0) + 1;

  report.overall_severity = maxSeverity([
    docSeverity,
    shopSyncSeverity,
    bostaSeverity,
    ...report.critical.map(c => c.severity),
  ]);

  return res.status(200).json(report);
}
