/* ═══════════════════════════════════════════════════════════════════════
   CLARK Automation · Cron Tick Endpoint (V19.69)
   ───────────────────────────────────────────────────────────────────────
   Called by VPS crontab every 5 minutes:
     */5 * * * * curl -fsS https://app.../api/automation-tick \
                      -H "Authorization: Bearer $AUTOMATION_TICK_SECRET"

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

import { getDb, readSplitCollection, readPartitionedCollection } from "./_firebase.js";
import { buildDailyReport } from "../src/utils/automation/buildDailyReport.js";

/* ─── Auth ─── */
function checkAuth(req) {
  const expected = (process.env.AUTOMATION_TICK_SECRET || "").trim();
  if (!expected) {
    return { ok: false, status: 500, error: "AUTOMATION_TICK_SECRET not set in Vercel env" };
  }
  const auth = req.headers.authorization || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match || match[1].trim() !== expected) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
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

/* ─── Main handler ─── */
export default async function handler(req, res) {
  /* Allow GET (simpler curl) and POST */
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  /* Auth */
  const auth = checkAuth(req);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

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

    /* ── Daily report decision ── */
    let dailyDue = false;
    let dailyReason = "";
    if (!dailyReport.enabled) {
      dailyReason = "disabled";
    } else if (recipients.length === 0) {
      dailyReason = "no-recipients";
    } else {
      const scheduledMin = timeToMinutes(dailyReport.time || "08:00");
      if (scheduledMin < 0) {
        dailyReason = "invalid-time";
      } else {
        /* Window: now must be >= scheduledMin AND we haven't sent today yet.
           Using >= (not exact match) so missed ticks (server downtime) still
           catch up later in the day, e.g. scheduled 08:00 but cron came up at
           08:14 — the 08:14 tick still triggers the send. */
        if (cairo.minutesOfDay < scheduledMin) {
          dailyReason = "before-scheduled";
        } else if (alreadySentToday(dailyReport.lastSentAt, cairo.date)) {
          dailyReason = "already-sent-today";
        } else {
          dailyDue = true;
        }
      }
    }
    result.actions.push({ type: "dailyReport", due: dailyDue, reason: dailyReason });

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
          source: "scheduled",
          recipientCount: messages.length,
          accepted: sendResult?.queued || sendResult?.accepted || messages.length,
          success: true,
          by: "cron",
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
            source: "scheduled",
            recipientCount: recipients.length,
            success: false,
            error: errMsg,
            by: "cron",
            cairoTime: result.cairoTime,
          });
        } catch (_) {}
      }
    } else {
      /* Heartbeat only — so UI shows the cron is alive */
      await updateTickHeartbeat(db);
    }

    return res.status(200).json(result);
  } catch (e) {
    result.ok = false;
    result.errors.push({ type: "fatal", error: e.message || String(e) });
    return res.status(503).json(result);
  }
}
