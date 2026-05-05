/* ═══════════════════════════════════════════════════════════════════════
   CLARK Automation · Cron Tick Endpoint (V19.69)
   ───────────────────────────────────────────────────────────────────────
   Called by VPS crontab every 5 minutes — see docs/V19.69.md for the
   exact crontab line. (NOTE: don't paste the literal cron pattern here;
   the slash-star sequence terminates this block comment and breaks
   Node's ESM parser. Bug found V19.69.4.)

   On each tick:
     1. Verify shared-secret bearer token (env: AUTOMATION_TICK_SECRET)
     2. Read factory/config + needed split/partitioned collections
     3. Compute current Cairo time (Africa/Cairo)
     4. For each scheduled report (e.g. dailyReport):
        - Skip if disabled
        - Compare scheduled time vs Cairo time (±5 min window)
        - Skip if already sent today (lastSentAt covers Cairo today)
        - Build report message
        - POST to bridge /send for each subscribed recipient
        - Append to history, update lastSentAt
     5. Always update `data.automation.lastTickAt` so the UI shows the cron is alive

   Non-Goals (V19.70 will add):
     - Event-driven sends (sale/payment triggers)
     - Multiple report types
     - Retry on bridge transient failure (current: log & move on)

   Failure modes handled:
     - Token mismatch → 401
     - Firestore unreachable → 503 (cron will retry next tick)
     - Bridge unreachable → log error to history, mark failed (don't crash)
     - Already sent today → silent skip
   ═══════════════════════════════════════════════════════════════════════ */

import { getDb, readSplitCollection, readPartitionedCollection, verifyAdminToken } from "./_firebase.js";
/* V19.69.3: import from api/ folder (was ../src/ which fails Vercel function bundling).
   The canonical builder lives at src/utils/automation/buildDailyReport.js for the
   client. _buildDailyReport.js is an exact copy kept in api/ so the serverless
   function can resolve it without cross-folder bundling issues. */
import { buildDailyReport } from "./_buildDailyReport.js";
/* V19.70: shared event processor for cron-detected events + pending-drain. */
import { processEvent } from "./_eventProcessor.js";

/* ─── Auth ──
   V19.69.2: accepts EITHER:
     1. AUTOMATION_TICK_SECRET Bearer (cron from VPS)
     2. Firebase admin ID token Bearer (manual "trigger now" from app)
   The second path lets admins test the scheduled flow without the cron set up. */
async function checkAuth(req) {
  const auth = req.headers.authorization || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return { ok: false, status: 401, error: "Authorization header missing" };
  const token = match[1].trim();
  if (!token) return { ok: false, status: 401, error: "Empty token" };

  /* Path 1: cron secret */
  const expected = (process.env.AUTOMATION_TICK_SECRET || "").trim();
  if (expected && token === expected) {
    return { ok: true, source: "cron" };
  }

  /* Path 2: Firebase admin/manager token */
  try {
    const adminAuth = await verifyAdminToken(token);
    if (adminAuth.ok) return { ok: true, source: "manual-admin", uid: adminAuth.uid, email: adminAuth.email };
  } catch (e) { /* fall through */ }

  if (!expected) {
    return { ok: false, status: 500, error: "AUTOMATION_TICK_SECRET not set in Vercel env (and token is not a valid admin Firebase ID token)" };
  }
  return { ok: false, status: 401, error: "Unauthorized" };
}

/* ─── Cairo time helpers ───
   Africa/Cairo is UTC+2 year-round (no DST since 2020).
   We use Intl.DateTimeFormat to convert reliably regardless of VPS timezone. */
function cairoNowParts() {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now).reduce((a, p) => { a[p.type] = p.value; return a; }, {});
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const time = `${parts.hour}:${parts.minute}`;
  const minutesOfDay = parseInt(parts.hour, 10) * 60 + parseInt(parts.minute, 10);
  return { date, time, minutesOfDay, iso: now.toISOString() };
}

/* Time string "HH:MM" → minutes-of-day */
function timeToMinutes(t) {
  const m = String(t || "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return -1;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/* Has a previous send already covered today (Cairo)? */
function alreadySentToday(lastSentAtIso, cairoToday) {
  if (!lastSentAtIso) return false;
  /* Convert lastSentAt to Cairo date */
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Cairo",
      year: "numeric", month: "2-digit", day: "2-digit",
    });
    const parts = fmt.formatToParts(new Date(lastSentAtIso))
      .reduce((a, p) => { a[p.type] = p.value; return a; }, {});
    const lastDate = `${parts.year}-${parts.month}-${parts.day}`;
    return lastDate === cairoToday;
  } catch (_) { return false; }
}

/* ─── Bridge send ─── */
async function bridgeSend(bridgeUrl, bridgeToken, messages) {
  const url = String(bridgeUrl || "").replace(/\/+$/, "") + "/send";
  const headers = { "Content-Type": "application/json" };
  if (bridgeToken) headers["Authorization"] = "Bearer " + bridgeToken;
  const r = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ messages }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || ("HTTP " + r.status));
  return data;
}

/* ─── Build the merged `data` object same shape as the client `config` useMemo ─── */
async function buildDataSnapshot(db) {
  const cfgRef = db.collection("factory").doc("config");
  const salesRef = db.collection("factory").doc("sales");
  const tasksRef = db.collection("factory").doc("tasks");

  const [cfgSnap, salesSnap, tasksSnap] = await Promise.all([
    cfgRef.get(), salesRef.get(), tasksRef.get(),
  ]);

  const configDoc = cfgSnap.exists ? cfgSnap.data() : {};
  const salesDoc  = salesSnap.exists ? salesSnap.data() : {};
  const tasksDoc  = tasksSnap.exists ? tasksSnap.data() : {};

  /* Merged data — config + salesDoc + tasksDoc + fields hydrated from split/partitioned */
  const data = { ...configDoc, ...salesDoc, ...tasksDoc };
  if (salesDoc.custDeliverySessions) data.custDeliverySessions = salesDoc.custDeliverySessions;
  if (salesDoc.packages)             data.packages = salesDoc.packages;
  if (tasksDoc.tasks)                data.tasks = tasksDoc.tasks;
  if (tasksDoc.stickyNotes)          data.stickyNotes = tasksDoc.stickyNotes;
  if (tasksDoc.inventoryAudits)      data.inventoryAudits = tasksDoc.inventoryAudits;

  /* Hydrate split collections (V16.74 + V19.49+50+52+53) */
  const splitMap = {
    treasury:"treasuryDays", auditLog:"auditDays", hrLog:"hrLogDays",
    custPayments:"custPaymentsDays", supplierPayments:"supplierPaymentsDays",
    wsPayments:"wsPaymentsDays", checks:"checksDays",
    salesInvoices:"salesInvoicesDays", purchaseInvoices:"purchaseInvoicesDays",
    purchaseOrders:"purchaseOrdersDays",
    stockMovements:"stockMovementsDays", purchaseReceipts:"purchaseReceiptsDays",
    treasuryTransfers:"treasuryTransfersDays", salesAudits:"salesAuditsDays",
    notifications:"notificationsDays",
  };
  await Promise.all(Object.entries(splitMap).map(async ([field, coll]) => {
    /* Only hydrate if migration done (else field is still in configDoc) */
    if (configDoc._splitDaysV1674Done && ["treasury","auditLog","hrLog"].includes(field)) {
      data[field] = await readSplitCollection(coll);
    } else if (configDoc._splitDaysV1949Done && ["custPayments","supplierPayments","wsPayments","checks"].includes(field)) {
      data[field] = await readSplitCollection(coll);
    } else if (configDoc._splitDaysV1950Done && ["salesInvoices","purchaseInvoices","purchaseOrders"].includes(field)) {
      data[field] = await readSplitCollection(coll);
    } else if (configDoc._splitDaysV1952Done && ["stockMovements","purchaseReceipts","treasuryTransfers","salesAudits"].includes(field)) {
      data[field] = await readSplitCollection(coll);
    } else if (configDoc._splitDaysV1953Done && field === "notifications") {
      data[field] = await readSplitCollection(coll);
    } else if (salesDoc._salesSplitDaysV1951Done && ["packages","custDeliverySessions"].includes(field)) {
      /* Handled by sales-split below */
    } else if (tasksDoc._tasksSplitDaysV1951Done && ["tasks","stickyNotes","inventoryAudits"].includes(field)) {
      /* Handled by tasks-split below */
    }
  }));

  /* Sales-split (V19.51) */
  if (salesDoc._salesSplitDaysV1951Done) {
    data.packages = await readSplitCollection("packagesDays");
    data.custDeliverySessions = await readSplitCollection("custDeliverySessionsDays");
  }
  if (tasksDoc._tasksSplitDaysV1951Done) {
    data.tasks = await readSplitCollection("tasksDays");
    data.stickyNotes = await readSplitCollection("stickyNotesDays");
    data.inventoryAudits = await readSplitCollection("inventoryAuditsDays");
  }

  /* Partitioned master data (V16.75 + V19.57) */
  if (configDoc._partitionedV1675Done) {
    data.hrWeeks = await readPartitionedCollection("hrWeeksDocs");
  }
  if (configDoc._partitionedV1957Done) {
    const fields = ["customers","suppliers","workshops","employees",
      "empDebts","generalProducts","fabrics","accessories"];
    await Promise.all(fields.map(async f => {
      data[f] = await readPartitionedCollection(f + "Docs");
    }));
  }

  /* Orders — current season only (or active season). For the daily report,
     we mainly need orders to detect deliveries/returns by date — which all
     live on the order doc itself. Read the active season's orders only. */
  const activeSeason = configDoc.activeSeason || (configDoc.seasons || [])[0];
  if (activeSeason) {
    const ordersSnap = await db.collection("seasons").doc(activeSeason).collection("orders").get();
    const orders = [];
    ordersSnap.forEach(d => orders.push({ _docId: d.id, ...d.data() }));
    data.orders = orders.filter(o => o.id);
  } else {
    data.orders = [];
  }

  return { data, configDoc, salesDoc, tasksDoc };
}

/* ─── History append helper (uses transaction for safe concurrent appends) ─── */
async function appendHistory(db, entry) {
  const ref = db.collection("factory").doc("config");
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cfg = snap.exists ? snap.data() : {};
    const auto = cfg.automation || {};
    const history = Array.isArray(auto.history) ? auto.history : [];
    history.unshift(entry);
    auto.history = history.slice(0, 50);
    if (entry.success && entry.type === "dailyReport") {
      if (!auto.dailyReport) auto.dailyReport = {};
      auto.dailyReport.lastSentAt = entry.at;
    }
    auto.lastTickAt = new Date().toISOString();
    tx.update(ref, { automation: auto });
  });
}

/* Update lastTickAt only (no send happened) */
async function updateTickHeartbeat(db) {
  const ref = db.collection("factory").doc("config");
  try {
    await ref.update({ "automation.lastTickAt": new Date().toISOString() });
  } catch (_) {
    /* If no automation field yet, create it */
    try {
      await ref.set({ automation: { lastTickAt: new Date().toISOString() } }, { merge: true });
    } catch (e) {
      console.warn("[automation-tick] heartbeat write failed:", e.message);
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   V19.70.2: Helpers for event scans
   ─────────────────────────────────────────────────────────────────────── */

/* Auto-set enabledAt = now if it's missing on an enabled event.
   Used for backward compat: events enabled in V19.70/V19.70.1 don't have
   enabledAt set. First scan after V19.70.2 sets it = now and skips that
   tick (so we don't fire historical events in the upgrade). */
async function ensureEnabledAt(db, eventType, currentEnabledAt){
  if (currentEnabledAt) return { enabledAt: currentEnabledAt, justSet: false };
  const ref = db.collection("factory").doc("config");
  const now = new Date().toISOString();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const c = snap.exists ? snap.data() : {};
    const auto = c.automation || {};
    const et = auto.eventTriggers || {};
    if (!et.events) et.events = {};
    if (!et.events[eventType]) et.events[eventType] = {};
    if (!et.events[eventType].enabledAt) {
      et.events[eventType].enabledAt = now;
      auto.eventTriggers = et;
      tx.set(ref, { automation: auto }, { merge: true });
    }
  });
  return { enabledAt: now, justSet: true };
}

/* Compute current balance per customer from orders + payments.
   Formula matches `_alertsSection` in buildDailyReport.js:
     balance = Σ(deliveries × price) − Σ(returns × price) − Σ(payments)
   Returns: { custId: number } */
function computeCustomerBalances(orders, payments){
  const balances = {};
  for (const o of orders || []) {
    for (const d of (o.customerDeliveries || [])) {
      if (!d.custId) continue;
      const price = Number(d.price) || Number(o.sellPrice) || 0;
      const qty = Number(d.qty) || 0;
      balances[d.custId] = (balances[d.custId] || 0) + qty * price;
    }
    for (const r of (o.customerReturns || [])) {
      if (!r.custId) continue;
      const price = Number(r.price) || Number(o.sellPrice) || 0;
      const qty = Number(r.qty) || 0;
      balances[r.custId] = (balances[r.custId] || 0) - qty * price;
    }
  }
  for (const p of payments || []) {
    if (!p.custId) continue;
    balances[p.custId] = (balances[p.custId] || 0) - (Number(p.amount) || 0);
  }
  return balances;
}

/* Lightweight orders loader for event scans (no need for full snapshot). */
async function loadActiveOrders(db, cfg){
  const activeSeason = cfg.activeSeason || (cfg.seasons || [])[0];
  if (!activeSeason) return [];
  const snap = await db.collection("seasons").doc(activeSeason).collection("orders").get();
  const orders = [];
  snap.forEach(d => orders.push({ _docId: d.id, ...d.data() }));
  return orders;
}

/* Resolve an entity's "creation timestamp" for backfill filtering.
   Order of preference: createdAt > recordedAt > date.
   Returns 0 if no usable timestamp (caller treats as "skip"). */
function entityTs(entity){
  const t = entity?.createdAt || entity?.recordedAt || entity?.date;
  if (!t) return 0;
  const parsed = Date.parse(t);
  return isNaN(parsed) ? 0 : parsed;
}

/* ═══════════════════════════════════════════════════════════════════════
   V19.70: Sale-completed scan
   ───────────────────────────────────────────────────────────────────────
   Iterate orders → customerDeliveries with date within last 24 hours.
   For each, fire saleCompleted event. Idempotency via eventHistory keyed
   by `sale:${orderId}:${date}:${qty}:${custId}`. The 24-hour window means
   old deliveries that roll off eventHistory still won't re-fire (they
   simply fail the date filter). Limit: 50 sales per tick to avoid runaway.
   ─────────────────────────────────────────────────────────────────────── */
async function scanRecentSales(db, cfg, eventCfg, cairoDate, ordersCache){
  /* V19.70.2: enforce enabledAt — auto-set if missing, skip first scan. */
  const ea = await ensureEnabledAt(db, "saleCompleted", eventCfg.enabledAt);
  if (ea.justSet) return { scanned: 0, fired: 0, reason: "enabledAt-just-set" };
  const enabledTs = Date.parse(ea.enabledAt);

  const orders = ordersCache || await loadActiveOrders(db, cfg);

  let customersById = {};
  if (eventCfg.recipients?.customer) {
    const cs = await readPartitionedCollection("customersDocs");
    cs.forEach(c => { if (c.id) customersById[c.id] = c; });
  }

  const yesterday = new Date(Date.parse(cairoDate) - 86400000).toISOString().slice(0, 10);
  let scanned = 0, fired = 0, skipped = 0, skippedOld = 0;
  let processed = 0;
  for (const o of orders) {
    if (!o.id) continue;
    for (const d of (o.customerDeliveries || [])) {
      const date = String(d.date || "").slice(0, 10);
      if (!date || date < yesterday) continue;/* only last 24h */
      /* V19.70.2: backfill filter — skip entities created before trigger was enabled */
      const ts = entityTs(d);
      if (!ts || ts < enabledTs) { skippedOld++; continue; }
      if (processed >= 50) break;/* safety cap */
      processed++;
      scanned++;
      const customer = customersById[d.custId] || {};
      const qty = Number(d.qty) || 0;
      const price = Number(d.price) || Number(o.sellPrice) || 0;
      const value = qty * price;
      /* V19.70.4: prefer entry.id (matches client-side hook idempotency); fallback
         to composite for legacy entries without id. */
      const idempotencyKey = d.id
        ? `sale:${d.id}`
        : `sale:${o.id}:${date}:${qty}:${d.custId || "x"}`;
      const r = await processEvent(db, {
        eventType: "saleCompleted",
        payload: {
          customerName: customer.name || d.custName || "—",
          qty, modelNo: o.modelNo || o.id, value,
          date, salesperson: d.recordedBy || "—",
          portalLink: "",/* portal link generation skipped in cron path */
        },
        customerPhone: customer.phone || null,
        idempotencyKey,
        force: false,
        source: "cron",
        cfgCache: cfg,
      });
      if (r.body?.sent) fired++;
      else if (r.body?.deduped || r.body?.skipped) skipped++;
    }
    if (processed >= 50) break;
  }
  return { scanned, fired, skipped, skippedOld };
}

/* ═══════════════════════════════════════════════════════════════════════
   V19.70: Payment-received scan
   ───────────────────────────────────────────────────────────────────────
   Iterate custPayments with date within last 24 hours. Idempotency via
   `payment:${paymentId}`. Limit: 50 payments per tick.
   ─────────────────────────────────────────────────────────────────────── */
async function scanRecentPayments(db, cfg, eventCfg, cairoDate, ordersCache){
  /* V19.70.2: enforce enabledAt + compute customer balances for {balance} variable */
  const ea = await ensureEnabledAt(db, "paymentReceived", eventCfg.enabledAt);
  if (ea.justSet) return { scanned: 0, fired: 0, reason: "enabledAt-just-set" };
  const enabledTs = Date.parse(ea.enabledAt);

  let payments = [];
  if (cfg._splitDaysV1949Done) {
    payments = await readSplitCollection("custPaymentsDays");
  } else {
    payments = Array.isArray(cfg.custPayments) ? cfg.custPayments : [];
  }

  /* V19.70.2: load orders + compute balances per customer (deliveries − returns − payments). */
  const orders = ordersCache || await loadActiveOrders(db, cfg);
  const balances = computeCustomerBalances(orders, payments);

  let customersById = {};
  if (eventCfg.recipients?.customer) {
    const cs = await readPartitionedCollection("customersDocs");
    cs.forEach(c => { if (c.id) customersById[c.id] = c; });
  }

  const yesterday = new Date(Date.parse(cairoDate) - 86400000).toISOString().slice(0, 10);
  let scanned = 0, fired = 0, skipped = 0, skippedOld = 0;
  let processed = 0;
  for (const p of payments) {
    if (!p || !p.id) continue;
    const date = String(p.date || "").slice(0, 10);
    if (!date || date < yesterday) continue;
    /* V19.70.2: backfill filter — skip if payment was created before trigger was enabled.
       Use createdAt (system clock) NOT date (which user can backdate). */
    const ts = entityTs(p);
    if (!ts || ts < enabledTs) { skippedOld++; continue; }
    if (processed >= 50) break;
    processed++;
    scanned++;
    const customer = customersById[p.custId] || {};
    /* V19.70.2: balance from full order/payment ledger, not the missing `balanceAfter` field */
    const balance = Math.round(balances[p.custId] || 0);
    const idempotencyKey = `payment:${p.id}`;
    const r = await processEvent(db, {
      eventType: "paymentReceived",
      payload: {
        customerName: customer.name || p.custName || "—",
        amount: Number(p.amount) || 0,
        method: p.method || "—",
        balance,/* signed: positive = customer still owes; negative = credit */
        date, portalLink: "",
      },
      customerPhone: customer.phone || null,
      idempotencyKey,
      force: false,
      source: "cron",
      cfgCache: cfg,
    });
    if (r.body?.sent) fired++;
    else if (r.body?.deduped || r.body?.skipped) skipped++;
  }
  return { scanned, fired, skipped, skippedOld };
}

/* ═══════════════════════════════════════════════════════════════════════
   V19.70.5: Recent-checks-from-customer scan (checkPaymentReceived)
   ───────────────────────────────────────────────────────────────────────
   Scans `data.checks` for newly-added receivable checks (status=معلق, type=
   receivable, category=دفعة عميل) within the last 24h whose createdAt is >=
   trigger enabledAt. Fires ONE checkPaymentReceived event per check, with
   {batchInfo} populated as "(شيك X من Y)" when the check is part of a batch
   (حافظة شيكات).
   ─────────────────────────────────────────────────────────────────────── */
async function scanRecentChecks(db, cfg, eventCfg, cairoDate, ordersCache){
  const ea = await ensureEnabledAt(db, "checkPaymentReceived", eventCfg.enabledAt);
  if (ea.justSet) return { scanned: 0, fired: 0, reason: "enabledAt-just-set" };
  const enabledTs = Date.parse(ea.enabledAt);

  /* Load checks */
  let checks = [];
  if (cfg._splitDaysV1949Done) {
    checks = await readSplitCollection("checksDays");
  } else {
    checks = Array.isArray(cfg.checks) ? cfg.checks : [];
  }

  /* Compute customer balances (orders + custPayments). Note: balance here is
     "current outstanding excluding this check yet". The check increases the
     formal AR but reduces it via collection — accounting-wise it's neutral
     until cashed. For the customer message, "الرصيد المتبقي" should mean
     "what they still owe in cash" — equivalent to current balance after cash
     payments. We compute that from orders+custPayments (cash side only). */
  let custPayments = [];
  if (cfg._splitDaysV1949Done) {
    custPayments = await readSplitCollection("custPaymentsDays");
  } else {
    custPayments = Array.isArray(cfg.custPayments) ? cfg.custPayments : [];
  }
  const orders = ordersCache || await loadActiveOrders(db, cfg);
  const balances = computeCustomerBalances(orders, custPayments);

  /* Customer lookup for office name */
  let customersById = {};
  if (eventCfg.recipients?.customer || eventCfg.recipients?.owner) {
    const cs = await readPartitionedCollection("customersDocs");
    cs.forEach(c => { if (c.id) customersById[c.id] = c; });
  }

  const yesterday = new Date(Date.parse(cairoDate) - 86400000).toISOString().slice(0, 10);
  let scanned = 0, fired = 0, skipped = 0, skippedOld = 0;
  let processed = 0;
  for (const c of checks) {
    if (!c || !c.id) continue;
    /* Receivable + customer category + still pending in factory */
    if (c.type !== "receivable") continue;
    if (c.status !== "معلق") continue;
    const cat = c.category || "دفعة عميل";
    if (cat !== "دفعة عميل") continue;
    /* Recency window — 24h based on `date` field (user-facing date) */
    const date = String(c.date || "").slice(0, 10);
    if (!date || date < yesterday) continue;
    /* Backfill filter — skip if check was created before trigger enabled */
    const ts = entityTs(c);
    if (!ts || ts < enabledTs) { skippedOld++; continue; }
    if (processed >= 50) break;
    processed++;
    scanned++;

    const customer = customersById[c.partyId] || {};
    const office = customer.companyName || customer.company || customer.office || customer.businessName || "";
    /* V19.70.8: progressive balance — subtract checks from same batch up to and
       including this one. Single (non-batch) check: subtract just this check.
       Batch (batchIdx 1..N): subtract sum of amounts of checks with same batchId
       and batchIdx <= this.batchIdx. Matches the client-side hook semantics. */
    const baseBalance = Math.round(balances[c.partyId] || 0);
    let progressiveBalance;
    if (c.batchId && c.batchIdx) {
      const batchSiblings = checks.filter(x => x.batchId === c.batchId && (x.batchIdx || 0) <= c.batchIdx);
      const cumChecksAmt = batchSiblings.reduce((s, x) => s + (Number(x.amount) || 0), 0);
      progressiveBalance = baseBalance - cumChecksAmt;
    } else {
      /* Single (non-batch) check */
      progressiveBalance = baseBalance - (Number(c.amount) || 0);
    }
    /* Batch info: "(شيك X من Y)" if batched, "" otherwise */
    const batchInfo = (c.batchId && c.batchTotal && c.batchTotal > 1)
      ? `(شيك ${c.batchIdx || "?"} من ${c.batchTotal})`
      : "";

    const idempotencyKey = `checkPay:${c.id}`;
    const r = await processEvent(db, {
      eventType: "checkPaymentReceived",
      payload: {
        customerName: customer.name || c.party || "—",
        amount: Number(c.amount) || 0,
        bank: c.bank || "—",
        checkNo: c.checkNo || c.id,
        dueDate: c.dueDate || "—",
        batchInfo,
        office,
        balance: progressiveBalance,
        date,
      },
      customerPhone: customer.phone || null,
      idempotencyKey,
      force: false,
      source: "cron",
      cfgCache: cfg,
    });
    if (r.body?.sent) fired++;
    else if (r.body?.deduped || r.body?.skipped) skipped++;
  }
  return { scanned, fired, skipped, skippedOld };
}

/* ═══════════════════════════════════════════════════════════════════════
   V19.70: Late-order scan
   ───────────────────────────────────────────────────────────────────────
   For each non-delivered order whose last activity is >= thresholdDays ago,
   fire a `lateOrder` event. Idempotent per (orderId × Cairo-date) so one
   alert per order per day max.
   ─────────────────────────────────────────────────────────────────────── */
async function scanLateOrders(db, cfg, lateCfg, cairoDate, ordersCache){
  /* V19.70.2: enforce enabledAt — only alert on orders created after trigger enable. */
  const ea = await ensureEnabledAt(db, "lateOrder", lateCfg.enabledAt);
  if (ea.justSet) return { scanned: 0, fired: 0, reason: "enabledAt-just-set" };
  const enabledTs = Date.parse(ea.enabledAt);

  const threshold = Number(lateCfg.thresholdDays) || 7;

  /* Load active-season orders (lightweight read) */
  const orders = ordersCache || await loadActiveOrders(db, cfg);
  if (orders.length === 0) return { scanned: 0, fired: 0 };

  /* Load customers (for phone lookup) — only if customer-recipient is enabled */
  let customersById = {};
  if (lateCfg.recipients?.customer) {
    const custDocs = await readPartitionedCollection("customersDocs");
    custDocs.forEach(c => { if (c.id) customersById[c.id] = c; });
  }

  let scanned = 0, fired = 0, skipped = 0, skippedOld = 0;
  for (const o of orders) {
    if (!o.id) continue;
    if (o.status === "تم التسليم لمخزن الجاهز") continue;
    /* V19.70.2: skip orders created before trigger was enabled */
    const ts = entityTs(o);
    if (!ts || ts < enabledTs) { skippedOld++; continue; }

    /* Compute last activity date */
    let last = String(o.date || "").slice(0, 10);
    (o.workshopDeliveries || []).forEach(wd => {
      if (wd.date > last) last = wd.date;
      (wd.receives || []).forEach(r => { if (r.date > last) last = r.date; });
    });
    (o.customerDeliveries || []).forEach(d => { if (d.date > last) last = d.date; });
    if (!last) continue;
    const daysLate = Math.floor((Date.parse(cairoDate) - Date.parse(last)) / 86400000);
    if (daysLate < threshold) continue;

    scanned++;
    const customer = customersById[o.custId] || {};
    const idempotencyKey = `lateOrder:${o.id}:${cairoDate}`;
    const r = await processEvent(db, {
      eventType: "lateOrder",
      payload: {
        modelNo: o.modelNo || o.id,
        customerName: customer.name || o.custName || "—",
        daysLate,
        lastActivity: last,
      },
      customerPhone: customer.phone || null,
      idempotencyKey,
      force: false,
      source: "cron",
      cfgCache: cfg,
    });
    if (r.body?.sent) fired++;
    else if (r.body?.deduped) skipped++;
  }
  return { scanned, fired, skipped, skippedOld };
}

/* ═══════════════════════════════════════════════════════════════════════
   V19.70: Check-due scan
   ───────────────────────────────────────────────────────────────────────
   For each PENDING check (status === "معلق", physically still in factory)
   whose dueDate is within thresholdDays from today, fire a `checkDue`
   event. Idempotent per (checkId × Cairo-date).

   IMPORTANT (V19.70.1): we ONLY consider status === "معلق" — endorsed
   checks (status === "مُظهّر") are no longer in our possession, so we
   shouldn't alert about them. Same for collected/paid/bounced/cancelled.

   Coverage:
     - type === "receivable" : ورقة قبض (received from a customer)
     - type === "payable"    : ورقة دفع (issued to a supplier)
   ─────────────────────────────────────────────────────────────────────── */
async function scanChecksDue(db, cfg, checkCfg, cairoDate){
  /* V19.70.2: enforce enabledAt — only alert on checks added after trigger enable. */
  const ea = await ensureEnabledAt(db, "checkDue", checkCfg.enabledAt);
  if (ea.justSet) return { scanned: 0, fired: 0, reason: "enabledAt-just-set" };
  const enabledTs = Date.parse(ea.enabledAt);

  const threshold = Number(checkCfg.thresholdDays) || 3;

  /* Load checks from split collection */
  let checks = [];
  if (cfg._splitDaysV1949Done) {
    checks = await readSplitCollection("checksDays");
  } else {
    checks = Array.isArray(cfg.checks) ? cfg.checks : [];
  }

  /* Lookup parties for enriched details (name + phone + office) */
  let customersById = {};
  let suppliersById = {};
  if (cfg._partitionedV1957Done) {
    const [cs, ss] = await Promise.all([
      readPartitionedCollection("customersDocs"),
      readPartitionedCollection("suppliersDocs"),
    ]);
    cs.forEach(x => { if (x.id) customersById[x.id] = x; });
    ss.forEach(x => { if (x.id) suppliersById[x.id] = x; });
  } else {
    (cfg.customers || []).forEach(x => { if (x.id) customersById[x.id] = x; });
    (cfg.suppliers || []).forEach(x => { if (x.id) suppliersById[x.id] = x; });
  }

  const todayMs = Date.parse(cairoDate);
  let scanned = 0, fired = 0, skipped = 0, skippedOld = 0;
  for (const c of checks) {
    if (!c || !c.id) continue;
    /* V19.70.1: ONLY pending checks (still in our hands).
       Exclude: محصل (cashed), مدفوع (paid out), مُظهّر (endorsed),
                مرتد (bounced), ملغي (cancelled), مرتجع (returned). */
    if (c.status !== "معلق") continue;
    /* V19.70.2: skip checks added before trigger was enabled */
    const ts = entityTs(c);
    if (!ts || ts < enabledTs) { skippedOld++; continue; }

    const due = String(c.dueDate || c.date || "").slice(0, 10);
    if (!due) continue;
    const daysToDue = Math.floor((Date.parse(due) - todayMs) / 86400000);
    if (daysToDue < 0 || daysToDue > threshold) continue;

    scanned++;
    /* Resolve type label + party details */
    const type = c.type || "receivable";
    const checkType = type === "payable" ? "ورقة دفع (للمورد)" : "ورقة قبض (من عميل)";
    const partyKind = type === "payable" ? "المورد" : "العميل";
    const partyRecord = type === "payable"
      ? (suppliersById[c.partyId] || {})
      : (customersById[c.partyId] || {});
    const partyName = partyRecord.name || c.party || "—";
    const office = partyRecord.companyName || partyRecord.company || partyRecord.office || partyRecord.businessName || "";
    const notes = c.notes || "";
    const category = c.category || "";

    const idempotencyKey = `checkDue:${c.id}:${cairoDate}`;
    const r = await processEvent(db, {
      eventType: "checkDue",
      payload: {
        checkType, partyKind, partyName, office, notes, category,
        bank: c.bank || "—",
        checkNo: c.checkNo || c.number || c.id,
        amount: Number(c.amount) || 0,
        dueDate: due,
        daysToDue,
        /* V19.70.1: keep legacy keys for back-compat with existing templates */
        kindLabel: partyKind,
      },
      customerPhone: null,/* check-due is owner-only */
      idempotencyKey,
      force: false,
      source: "cron",
      cfgCache: cfg,
    });
    if (r.body?.sent) fired++;
    else if (r.body?.deduped) skipped++;
  }
  return { scanned, fired, skipped, skippedOld };
}

/* ═══════════════════════════════════════════════════════════════════════
   V19.70.6: Compute next-fire time for a recurring campaign
   ───────────────────────────────────────────────────────────────────────
   Given a recurrence object + the last fire (or first scheduled) ISO time,
   returns the ISO timestamp of the NEXT fire after `afterIso`. Returns null
   if the campaign should stop (end condition reached).

   recurrence.type:
     - "daily":   next day at timeOfDay
     - "weekly":  next day in daysOfWeek[] at timeOfDay
     - "monthly": next month on dayOfMonth at timeOfDay
     - "range":   next day within rangeStart..rangeEnd at timeOfDay
   ─────────────────────────────────────────────────────────────────────── */
function computeNextFireTime(recurrence, afterIso, occurrenceCount){
  if (!recurrence || !recurrence.type) return null;
  /* Stop conditions */
  if (recurrence.maxOccurrences && occurrenceCount >= recurrence.maxOccurrences) return null;
  const [hh, mm] = String(recurrence.timeOfDay || "09:00").split(":").map(n => Number(n) || 0);
  const after = new Date(afterIso || Date.now());

  /* Helper: set time of day on a Date object */
  const atTime = (d) => { const x = new Date(d); x.setHours(hh, mm, 0, 0); return x; };
  /* Helper: format YYYY-MM-DD */
  const ymd = (d) => d.toISOString().slice(0, 10);

  if (recurrence.endDate && ymd(after) > recurrence.endDate) return null;

  if (recurrence.type === "daily") {
    /* Next day at timeOfDay */
    const next = atTime(after); next.setDate(next.getDate() + 1);
    if (recurrence.endDate && ymd(next) > recurrence.endDate) return null;
    return next.toISOString();
  }
  if (recurrence.type === "weekly") {
    const days = Array.isArray(recurrence.daysOfWeek) ? recurrence.daysOfWeek : [];
    if (days.length === 0) return null;
    /* Find next day in `days` after `after` */
    for (let i = 1; i <= 7; i++) {
      const cand = atTime(after); cand.setDate(cand.getDate() + i);
      if (days.includes(cand.getDay())) {
        if (recurrence.endDate && ymd(cand) > recurrence.endDate) return null;
        return cand.toISOString();
      }
    }
    return null;
  }
  if (recurrence.type === "monthly") {
    const dom = Math.max(1, Math.min(28, Number(recurrence.dayOfMonth) || 1));
    const next = new Date(after.getFullYear(), after.getMonth() + 1, dom, hh, mm, 0);
    if (recurrence.endDate && ymd(next) > recurrence.endDate) return null;
    return next.toISOString();
  }
  if (recurrence.type === "range") {
    const next = atTime(after); next.setDate(next.getDate() + 1);
    if (recurrence.rangeEnd && ymd(next) > recurrence.rangeEnd) return null;
    if (recurrence.rangeStart && ymd(next) < recurrence.rangeStart) {
      /* Snap to rangeStart at timeOfDay */
      return new Date(recurrence.rangeStart + "T" + String(hh).padStart(2,"0") + ":" + String(mm).padStart(2,"0") + ":00").toISOString();
    }
    return next.toISOString();
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════════════
   V19.70.4: Scheduled-campaigns scan
   ───────────────────────────────────────────────────────────────────────
   For each `data.scheduledCampaigns[]` entry where:
     - status === "scheduled"
     - scheduledAt <= now
   We:
     1. Mark the entry status="firing" (transient)
     2. Build messages from templateBody + items
     3. POST to bridge /send (the bridge handles anti-ban delays internally)
     4. Mark "done" on success, "failed" on error
   Limit: 1 campaign per tick (campaigns can be large; we don't want one
   tick to time out trying to fire all of them).
   ─────────────────────────────────────────────────────────────────────── */
async function scanScheduledCampaigns(db, cfg, cairoDate){
  const list = Array.isArray(cfg.scheduledCampaigns) ? cfg.scheduledCampaigns : [];
  if (list.length === 0) return { scanned: 0, fired: 0 };

  const nowMs = Date.now();
  /* Find the next-due campaign (oldest scheduledAt that's already passed).
     V19.70.6: this works for BOTH once and recurring — recurring entries
     have their `scheduledAt` updated to the next fire time after each fire,
     so the same "scheduledAt <= now" check works for both. */
  const due = list
    .filter(c => c.status === "scheduled" && c.scheduledAt && Date.parse(c.scheduledAt) <= nowMs)
    .sort((a,b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));

  if (due.length === 0) return { scanned: list.length, fired: 0, dueCount: 0 };

  const target = due[0];/* fire one per tick */

  /* Mark firing — transactional to prevent double-fire if 2 ticks race */
  const ref = db.collection("factory").doc("config");
  let claimed = false;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const c = snap.exists ? snap.data() : {};
    const arr = Array.isArray(c.scheduledCampaigns) ? c.scheduledCampaigns : [];
    const idx = arr.findIndex(x => x.id === target.id);
    if (idx < 0 || arr[idx].status !== "scheduled") return;/* already claimed */
    arr[idx].status = "firing";
    arr[idx].firingStartedAt = new Date().toISOString();
    tx.update(ref, { scheduledCampaigns: arr });
    claimed = true;
  });
  if (!claimed) return { scanned: list.length, fired: 0, raced: true };

  /* Build messages from template + items + images (V19.70.5) */
  const items = Array.isArray(target.items) ? target.items : [];
  const images = Array.isArray(target.images) ? target.images : [];
  /* Bridge expects per-message: { phone, message, media: [{base64, mime, name}] }.
     Same images attached to every recipient in the campaign. */
  const mediaPayload = images
    .filter(img => img && img.base64 && img.mime)
    .map(img => ({ base64: img.base64, mime: img.mime, name: img.name || "image.jpg" }));
  const personalizedMessage = (item) => {
    /* Same personalize() pattern as CampaignsPg — basic placeholders. */
    let body = String(target.templateBody || "");
    body = body.replace(/\{اسم\}|\{الاسم\}|\{name\}/g, item.name || "");
    body = body.replace(/\{رقم\}|\{phone\}/g, item.phone || "");
    /* {لينك} portal link skipped in cron path — needs admin SDK signing. */
    return body;
  };
  const messages = items
    .filter(it => it && it.phone && String(it.phone).trim())
    .map(it => {
      const msg = { phone: String(it.phone).trim(), message: personalizedMessage(it) };
      if (mediaPayload.length > 0) msg.media = mediaPayload;
      return msg;
    });

  if (messages.length === 0) {
    /* No valid recipients — mark done with sentCount=0 */
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const c = snap.exists ? snap.data() : {};
      const arr = Array.isArray(c.scheduledCampaigns) ? c.scheduledCampaigns : [];
      const idx = arr.findIndex(x => x.id === target.id);
      if (idx >= 0) {
        arr[idx].status = "done";
        arr[idx].sentCount = 0;
        arr[idx].completedAt = new Date().toISOString();
        arr[idx].error = "no-valid-recipients";
        tx.update(ref, { scheduledCampaigns: arr });
      }
    });
    return { scanned: list.length, fired: 1, sentCount: 0, dueCount: due.length, campaignId: target.id };
  }

  /* Bridge config */
  const bridgeUrl = (cfg.campaignBridge || {}).url || "";
  const bridgeToken = (cfg.campaignBridge || {}).token || "";
  if (!bridgeUrl) {
    /* Bridge not configured — mark failed */
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const c = snap.exists ? snap.data() : {};
      const arr = Array.isArray(c.scheduledCampaigns) ? c.scheduledCampaigns : [];
      const idx = arr.findIndex(x => x.id === target.id);
      if (idx >= 0) {
        arr[idx].status = "scheduled";/* revert so user can retry */
        arr[idx].error = "bridge-not-configured";
        tx.update(ref, { scheduledCampaigns: arr });
      }
    });
    return { scanned: list.length, fired: 0, error: "bridge-not-configured" };
  }

  /* Fire via bridge */
  let result;
  try {
    const r = await fetch(bridgeUrl.replace(/\/+$/, "") + "/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + bridgeToken },
      body: JSON.stringify({ messages }),
    });
    result = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(result.error || ("HTTP " + r.status));
  } catch (e) {
    /* Failed — mark failed */
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const c = snap.exists ? snap.data() : {};
      const arr = Array.isArray(c.scheduledCampaigns) ? c.scheduledCampaigns : [];
      const idx = arr.findIndex(x => x.id === target.id);
      if (idx >= 0) {
        arr[idx].status = "failed";
        arr[idx].error = e.message || String(e);
        arr[idx].completedAt = new Date().toISOString();
        tx.update(ref, { scheduledCampaigns: arr });
      }
    });
    return { scanned: list.length, fired: 0, error: e.message };
  }

  /* Success — mark done OR re-schedule if recurring (V19.70.6) */
  const accepted = result?.queued || result?.accepted || messages.length;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const c = snap.exists ? snap.data() : {};
    const arr = Array.isArray(c.scheduledCampaigns) ? c.scheduledCampaigns : [];
    const idx = arr.findIndex(x => x.id === target.id);
    if (idx >= 0) {
      const entry = arr[idx];
      const isRecurring = !!entry.recurrence;
      const newOccurrenceCount = (entry.occurrenceCount || 0) + 1;
      entry.occurrenceCount = newOccurrenceCount;
      entry.lastFiredAt = new Date().toISOString();
      /* Accumulate sentCount across occurrences for recurring */
      entry.sentCount = (entry.sentCount || 0) + accepted;
      if (isRecurring) {
        const nextIso = computeNextFireTime(entry.recurrence, entry.lastFiredAt, newOccurrenceCount);
        if (nextIso) {
          entry.status = "scheduled";
          entry.scheduledAt = nextIso;
          /* Clear firingStartedAt since we're back to scheduled */
          delete entry.firingStartedAt;
        } else {
          /* End-condition reached → mark done */
          entry.status = "done";
          entry.completedAt = new Date().toISOString();
        }
      } else {
        /* Once: done after one fire */
        entry.status = "done";
        entry.completedAt = new Date().toISOString();
      }
      tx.update(ref, { scheduledCampaigns: arr });
    }
  });

  return { scanned: list.length, fired: 1, sentCount: accepted, dueCount: due.length, campaignId: target.id };
}

/* ─── Main handler ─── */
export default async function handler(req, res) {
  /* Allow GET (simpler curl) and POST */
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  /* Auth */
  const auth = await checkAuth(req);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });
  const triggerSource = auth.source || "unknown";/* "cron" or "manual-admin" */

  const result = {
    ok: true,
    cairoTime: null,
    actions: [],
    errors: [],
  };

  try {
    const db = getDb();
    const cairo = cairoNowParts();
    result.cairoTime = `${cairo.date} ${cairo.time}`;

    /* Read minimum needed to decide if anything is due */
    const cfgSnap = await db.collection("factory").doc("config").get();
    if (!cfgSnap.exists) {
      await updateTickHeartbeat(db);
      return res.status(200).json({ ...result, note: "factory/config not found" });
    }
    const cfg = cfgSnap.data();
    const automation = cfg.automation || {};
    const dailyReport = automation.dailyReport || {};
    const recipients = (automation.recipients || []).filter(r =>
      r && r.phone &&
      (!r.subscribedReports || r.subscribedReports.includes("dailyReport"))
    );

    /* ── Daily report decision ──
       V19.69.2: manual-admin trigger bypasses the time-of-day check (so admins
       can test the scheduled flow without waiting until 08:00). All other gates
       still apply (enabled, recipients, already-sent-today) — to prevent dup. */
    let dailyDue = false;
    let dailyReason = "";
    const isManualTrigger = triggerSource === "manual-admin";
    if (!dailyReport.enabled) {
      dailyReason = "disabled";
    } else if (recipients.length === 0) {
      dailyReason = "no-recipients";
    } else {
      const scheduledMin = timeToMinutes(dailyReport.time || "08:00");
      if (scheduledMin < 0) {
        dailyReason = "invalid-time";
      } else if (alreadySentToday(dailyReport.lastSentAt, cairo.date)) {
        dailyReason = "already-sent-today";
      } else if (!isManualTrigger && cairo.minutesOfDay < scheduledMin) {
        /* Time check only applies to cron triggers. Manual-admin bypass it. */
        dailyReason = "before-scheduled";
      } else {
        dailyDue = true;
        if (isManualTrigger) dailyReason = "manual-trigger";
      }
    }
    result.actions.push({ type: "dailyReport", due: dailyDue, reason: dailyReason, triggerSource });

    /* ── Execute due actions ── */
    if (dailyDue) {
      try {
        const { data } = await buildDataSnapshot(db);
        const report = buildDailyReport(data, {
          config: dailyReport,
          date: cairo.date,
        });
        const messages = recipients.map(r => ({
          phone: r.phone,
          message: report.text,
        }));

        const bridgeUrl = (cfg.campaignBridge || {}).url || "";
        const bridgeToken = (cfg.campaignBridge || {}).token || "";
        if (!bridgeUrl) throw new Error("campaignBridge.url not configured");

        const sendResult = await bridgeSend(bridgeUrl, bridgeToken, messages);

        await appendHistory(db, {
          id: "tick_" + Date.now().toString(36),
          at: new Date().toISOString(),
          type: "dailyReport",
          source: triggerSource === "manual-admin" ? "manual-trigger" : "scheduled",
          recipientCount: messages.length,
          accepted: sendResult?.queued || sendResult?.accepted || messages.length,
          success: true,
          by: triggerSource === "manual-admin" ? (auth.email || "admin") : "cron",
          cairoTime: result.cairoTime,
        });
        result.actions[result.actions.length - 1].sent = messages.length;
      } catch (e) {
        const errMsg = e.message || String(e);
        result.errors.push({ type: "dailyReport", error: errMsg });
        try {
          await appendHistory(db, {
            id: "tick_" + Date.now().toString(36),
            at: new Date().toISOString(),
            type: "dailyReport",
            source: triggerSource === "manual-admin" ? "manual-trigger" : "scheduled",
            recipientCount: recipients.length,
            success: false,
            error: errMsg,
            by: triggerSource === "manual-admin" ? (auth.email || "admin") : "cron",
            cairoTime: result.cairoTime,
          });
        } catch (_) {}
      }
    } else {
      /* Heartbeat only — so UI shows the cron is alive */
      await updateTickHeartbeat(db);
    }

    /* ═══════════════════════════════════════════════════════════════════
       V19.70: Event-driven actions
       ───────────────────────────────────────────────────────────────────
       Three responsibilities every tick:
         A. Drain pending queue (retry failed events)
         B. Scan for late orders → fire alerts (one per order per day)
         C. Scan for checks due → fire alerts (one per check per day)

       Each action is wrapped in try/catch so a single failure doesn't
       block the others. Errors are accumulated in result.errors. */
    const eventTriggers = (cfg.automation || {}).eventTriggers || {};
    const mode = eventTriggers.mode || "auto";

    /* ── A. Pending drain (auto mode only) ── */
    if (mode === "auto") {
      const pending = Array.isArray(eventTriggers.pending) ? eventTriggers.pending : [];
      const drainable = pending.filter(p => (p.attempts || 0) < 5);
      let drained = 0, drainFailed = 0;
      for (const p of drainable.slice(0, 10)) {/* cap at 10 per tick */
        try {
          const r = await processEvent(db, {
            eventType: p.eventType,
            payload: p.payload,
            customerPhone: p.customerPhone,
            idempotencyKey: p.idempotencyKey,
            force: false,
            source: "cron",
          });
          if (r.ok && r.body?.sent) drained++;
          else if (!r.ok) drainFailed++;
        } catch (e) {
          drainFailed++;
          result.errors.push({ type: "pendingDrain", id: p.id, error: e.message });
        }
      }
      if (drainable.length > 0) {
        result.actions.push({ type: "pendingDrain", attempted: drainable.length, drained, failed: drainFailed });
      }
    }

    /* V19.70.2: load orders ONCE if any of the order-dependent scans is enabled.
       Avoids 3 separate Firestore reads when sale/payment/lateOrder are all on. */
    let ordersCache = null;
    const needsOrders = (eventTriggers.events?.saleCompleted?.enabled)
                     || (eventTriggers.events?.paymentReceived?.enabled)
                     || (eventTriggers.events?.lateOrder?.enabled);
    if (needsOrders) {
      try { ordersCache = await loadActiveOrders(db, cfg); }
      catch (e) { result.errors.push({ type: "ordersLoad", error: e.message }); }
    }

    /* ── B. Sale-completed scan (last 24h) ── */
    const saleCfg = (eventTriggers.events || {}).saleCompleted;
    if (saleCfg?.enabled) {
      try {
        const r = await scanRecentSales(db, cfg, saleCfg, cairo.date, ordersCache);
        if (r.scanned > 0 || r.reason) result.actions.push({ type: "saleCompleted", ...r });
      } catch (e) { result.errors.push({ type: "saleCompleted", error: e.message }); }
    }

    /* ── C. Payment-received scan (last 24h) ── */
    const payCfg = (eventTriggers.events || {}).paymentReceived;
    if (payCfg?.enabled) {
      try {
        const r = await scanRecentPayments(db, cfg, payCfg, cairo.date, ordersCache);
        if (r.scanned > 0 || r.reason) result.actions.push({ type: "paymentReceived", ...r });
      } catch (e) { result.errors.push({ type: "paymentReceived", error: e.message }); }
    }

    /* ── C2. V19.70.5: Check-payment-received scan (last 24h) ── */
    const chkPayCfg = (eventTriggers.events || {}).checkPaymentReceived;
    if (chkPayCfg?.enabled) {
      try {
        const r = await scanRecentChecks(db, cfg, chkPayCfg, cairo.date, ordersCache);
        if (r.scanned > 0 || r.reason) result.actions.push({ type: "checkPaymentReceived", ...r });
      } catch (e) { result.errors.push({ type: "checkPaymentReceived", error: e.message }); }
    }

    /* ── D. Late order scan (daily) ── */
    const lateCfg = (eventTriggers.events || {}).lateOrder;
    if (lateCfg?.enabled) {
      try {
        const r = await scanLateOrders(db, cfg, lateCfg, cairo.date, ordersCache);
        if (r.scanned > 0 || r.reason) result.actions.push({ type: "lateOrder", ...r });
      } catch (e) { result.errors.push({ type: "lateOrder", error: e.message }); }
    }

    /* ── E. Check due scan (daily) ── */
    const checkCfg = (eventTriggers.events || {}).checkDue;
    if (checkCfg?.enabled) {
      try {
        const r = await scanChecksDue(db, cfg, checkCfg, cairo.date);
        if (r.scanned > 0) result.actions.push({ type: "checkDue", ...r });
      } catch (e) { result.errors.push({ type: "checkDue", error: e.message }); }
    }

    /* ── F. V19.70.4: Scheduled campaigns scan (run one due campaign per tick) ── */
    if (Array.isArray(cfg.scheduledCampaigns) && cfg.scheduledCampaigns.length > 0) {
      try {
        const r = await scanScheduledCampaigns(db, cfg, cairo.date);
        if (r.fired > 0 || r.dueCount > 0 || r.error) {
          result.actions.push({ type: "scheduledCampaign", ...r });
        }
      } catch (e) { result.errors.push({ type: "scheduledCampaign", error: e.message }); }
    }

    return res.status(200).json(result);
  } catch (e) {
    result.ok = false;
    result.errors.push({ type: "fatal", error: e.message || String(e) });
    return res.status(503).json(result);
  }
}
