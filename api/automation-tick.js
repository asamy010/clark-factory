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
   V19.70: Sale-completed scan
   ───────────────────────────────────────────────────────────────────────
   Iterate orders → customerDeliveries with date within last 24 hours.
   For each, fire saleCompleted event. Idempotency via eventHistory keyed
   by `sale:${orderId}:${date}:${qty}:${custId}`. The 24-hour window means
   old deliveries that roll off eventHistory still won't re-fire (they
   simply fail the date filter). Limit: 50 sales per tick to avoid runaway.
   ─────────────────────────────────────────────────────────────────────── */
async function scanRecentSales(db, cfg, eventCfg, cairoDate){
  const activeSeason = cfg.activeSeason || (cfg.seasons || [])[0];
  if (!activeSeason) return { scanned: 0, fired: 0 };
  const ordersSnap = await db.collection("seasons").doc(activeSeason).collection("orders").get();
  const orders = [];
  ordersSnap.forEach(d => orders.push({ _docId: d.id, ...d.data() }));

  let customersById = {};
  if (eventCfg.recipients?.customer) {
    const cs = await readPartitionedCollection("customersDocs");
    cs.forEach(c => { if (c.id) customersById[c.id] = c; });
  }

  const yesterday = new Date(Date.parse(cairoDate) - 86400000).toISOString().slice(0, 10);
  let scanned = 0, fired = 0, skipped = 0;
  let processed = 0;
  for (const o of orders) {
    if (!o.id) continue;
    for (const d of (o.customerDeliveries || [])) {
      const date = String(d.date || "").slice(0, 10);
      if (!date || date < yesterday) continue;/* only last 24h */
      if (processed >= 50) break;/* safety cap */
      processed++;
      scanned++;
      const customer = customersById[d.custId] || {};
      const qty = Number(d.qty) || 0;
      const price = Number(d.price) || Number(o.sellPrice) || 0;
      const value = qty * price;
      const idempotencyKey = `sale:${o.id}:${date}:${qty}:${d.custId || "x"}`;
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
  return { scanned, fired, skipped };
}

/* ═══════════════════════════════════════════════════════════════════════
   V19.70: Payment-received scan
   ───────────────────────────────────────────────────────────────────────
   Iterate custPayments with date within last 24 hours. Idempotency via
   `payment:${paymentId}`. Limit: 50 payments per tick.
   ─────────────────────────────────────────────────────────────────────── */
async function scanRecentPayments(db, cfg, eventCfg, cairoDate){
  let payments = [];
  if (cfg._splitDaysV1949Done) {
    payments = await readSplitCollection("custPaymentsDays");
  } else {
    payments = Array.isArray(cfg.custPayments) ? cfg.custPayments : [];
  }

  let customersById = {};
  if (eventCfg.recipients?.customer) {
    const cs = await readPartitionedCollection("customersDocs");
    cs.forEach(c => { if (c.id) customersById[c.id] = c; });
  }

  const yesterday = new Date(Date.parse(cairoDate) - 86400000).toISOString().slice(0, 10);
  let scanned = 0, fired = 0, skipped = 0;
  let processed = 0;
  for (const p of payments) {
    if (!p || !p.id) continue;
    const date = String(p.date || "").slice(0, 10);
    if (!date || date < yesterday) continue;
    if (processed >= 50) break;
    processed++;
    scanned++;
    const customer = customersById[p.custId] || {};
    const idempotencyKey = `payment:${p.id}`;
    const r = await processEvent(db, {
      eventType: "paymentReceived",
      payload: {
        customerName: customer.name || p.custName || "—",
        amount: Number(p.amount) || 0,
        method: p.method || "—",
        balance: Number(p.balanceAfter) || 0,/* may be missing if not computed */
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
  return { scanned, fired, skipped };
}

/* ═══════════════════════════════════════════════════════════════════════
   V19.70: Late-order scan
   ───────────────────────────────────────────────────────────────────────
   For each non-delivered order whose last activity is >= thresholdDays ago,
   fire a `lateOrder` event. Idempotent per (orderId × Cairo-date) so one
   alert per order per day max.
   ─────────────────────────────────────────────────────────────────────── */
async function scanLateOrders(db, cfg, lateCfg, cairoDate){
  const threshold = Number(lateCfg.thresholdDays) || 7;

  /* Load active-season orders (lightweight read) */
  const activeSeason = cfg.activeSeason || (cfg.seasons || [])[0];
  if (!activeSeason) return { scanned: 0, fired: 0 };
  const ordersSnap = await db.collection("seasons").doc(activeSeason).collection("orders").get();
  const orders = [];
  ordersSnap.forEach(d => orders.push({ _docId: d.id, ...d.data() }));

  /* Load customers (for phone lookup) — only if customer-recipient is enabled */
  let customersById = {};
  if (lateCfg.recipients?.customer) {
    const custDocs = await readPartitionedCollection("customersDocs");
    custDocs.forEach(c => { if (c.id) customersById[c.id] = c; });
  }

  let scanned = 0, fired = 0, skipped = 0;
  for (const o of orders) {
    if (!o.id) continue;
    if (o.status === "تم التسليم لمخزن الجاهز") continue;

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
  return { scanned, fired, skipped };
}

/* ═══════════════════════════════════════════════════════════════════════
   V19.70: Check-due scan
   ───────────────────────────────────────────────────────────────────────
   For each open check whose dueDate is within thresholdDays from today,
   fire a `checkDue` event. Idempotent per (checkId × Cairo-date).
   ─────────────────────────────────────────────────────────────────────── */
async function scanChecksDue(db, cfg, checkCfg, cairoDate){
  const threshold = Number(checkCfg.thresholdDays) || 3;

  /* Load checks from split collection */
  let checks = [];
  if (cfg._splitDaysV1949Done) {
    checks = await readSplitCollection("checksDays");
  } else {
    checks = Array.isArray(cfg.checks) ? cfg.checks : [];
  }

  const todayMs = Date.parse(cairoDate);
  let scanned = 0, fired = 0, skipped = 0;
  for (const c of checks) {
    if (!c || !c.id) continue;
    if (c.status === "محصل" || c.status === "مرتد" || c.status === "ملغي") continue;
    const due = String(c.dueDate || c.date || "").slice(0, 10);
    if (!due) continue;
    const daysToDue = Math.floor((Date.parse(due) - todayMs) / 86400000);
    if (daysToDue < 0 || daysToDue > threshold) continue;

    scanned++;
    /* "kind": received (we hold) vs issued (we owe) — affects which party label */
    const kind = c.kind || c.type || "received";
    const kindLabel = kind === "issued" ? "المستفيد" : "الساحب";
    const partyName = c.party || c.beneficiary || c.drawer || c.customerName || "—";

    const idempotencyKey = `checkDue:${c.id}:${cairoDate}`;
    const r = await processEvent(db, {
      eventType: "checkDue",
      payload: {
        bank: c.bank || "—",
        checkNo: c.checkNo || c.number || c.id,
        amount: Number(c.amount) || 0,
        dueDate: due,
        daysToDue,
        kindLabel,
        partyName,
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
  return { scanned, fired, skipped };
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

    /* ── B. Sale-completed scan (last 24h) ── */
    const saleCfg = (eventTriggers.events || {}).saleCompleted;
    if (saleCfg?.enabled) {
      try {
        const r = await scanRecentSales(db, cfg, saleCfg, cairo.date);
        if (r.scanned > 0) result.actions.push({ type: "saleCompleted", ...r });
      } catch (e) { result.errors.push({ type: "saleCompleted", error: e.message }); }
    }

    /* ── C. Payment-received scan (last 24h) ── */
    const payCfg = (eventTriggers.events || {}).paymentReceived;
    if (payCfg?.enabled) {
      try {
        const r = await scanRecentPayments(db, cfg, payCfg, cairo.date);
        if (r.scanned > 0) result.actions.push({ type: "paymentReceived", ...r });
      } catch (e) { result.errors.push({ type: "paymentReceived", error: e.message }); }
    }

    /* ── D. Late order scan (daily) ── */
    const lateCfg = (eventTriggers.events || {}).lateOrder;
    if (lateCfg?.enabled) {
      try {
        const r = await scanLateOrders(db, cfg, lateCfg, cairo.date);
        if (r.scanned > 0) result.actions.push({ type: "lateOrder", ...r });
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

    return res.status(200).json(result);
  } catch (e) {
    result.ok = false;
    result.errors.push({ type: "fatal", error: e.message || String(e) });
    return res.status(503).json(result);
  }
}
