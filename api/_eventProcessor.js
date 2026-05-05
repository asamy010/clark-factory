/* ═══════════════════════════════════════════════════════════════════════
   CLARK Automation · Event Processor (V19.70)
   ───────────────────────────────────────────────────────────────────────
   Shared logic for firing an event-driven WhatsApp message. Used by:
     - api/event-trigger.js  (HTTP handler from client/cron)
     - api/automation-tick.js (cron-detected events + pending drain)

   Single source of truth for: idempotency, manual-mode queueing, bridge
   call, history logging, pending-queue management.
   ═══════════════════════════════════════════════════════════════════════ */

import { buildEventMessages, validateEventPayload, EVENT_VARIABLES } from "./_eventBuilder.js";

/* ─── Bridge call ─── */
export async function bridgeSend(bridgeUrl, bridgeToken, messages){
  const url = String(bridgeUrl || "").replace(/\/+$/, "") + "/send";
  const headers = { "Content-Type": "application/json" };
  if (bridgeToken) headers["Authorization"] = "Bearer " + bridgeToken;
  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify({ messages }) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || ("HTTP " + r.status));
  return data;
}

/* ─── Compact summary for history view ─── */
export function summarizePayload(eventType, p){
  if (!p) return "";
  try {
    if (eventType === "saleCompleted")    return `${p.customerName || "—"} • ${p.qty} × ${p.modelNo}`;
    if (eventType === "paymentReceived")  return `${p.customerName || "—"} • ${p.amount} ج.م`;
    if (eventType === "lateOrder")        return `${p.modelNo || "—"} (${p.daysLate} يوم)`;
    if (eventType === "checkDue")         return `${p.bank || "—"} #${p.checkNo} • ${p.amount} ج.م`;
  } catch (_) {}
  return "";
}

/* ─── Append to eventHistory + maintain pending queue ─── */
export async function recordResult(db, opts){
  const { idempotencyKey, eventType, payload, success, recipientCount, error, source } = opts;
  const ref = db.collection("factory").doc("config");
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cfg = snap.exists ? snap.data() : {};
    const auto = cfg.automation || {};
    const et = auto.eventTriggers || {};
    const history = Array.isArray(et.eventHistory) ? et.eventHistory : [];
    history.unshift({
      id: idempotencyKey || ("evt_" + Date.now().toString(36)),
      idempotencyKey,
      eventType,
      at: new Date().toISOString(),
      success: !!success,
      recipientCount: recipientCount || 0,
      error: error || null,
      source: source || "unknown",
      payloadSummary: summarizePayload(eventType, payload),
    });
    et.eventHistory = history.slice(0, 100);

    if (success && Array.isArray(et.pending) && idempotencyKey) {
      et.pending = et.pending.filter(p => p.idempotencyKey !== idempotencyKey);
    }
    if (!success && Array.isArray(et.pending) && idempotencyKey) {
      et.pending = et.pending.map(p => p.idempotencyKey === idempotencyKey
        ? { ...p, attempts: (p.attempts || 0) + 1, lastAttemptAt: new Date().toISOString(), lastError: error }
        : p
      );
    }
    auto.eventTriggers = et;
    tx.set(ref, { automation: auto }, { merge: true });
  });
}

/* ─── Queue an entry (manual mode, or after bridge failure) ─── */
export async function queuePending(db, entry){
  const ref = db.collection("factory").doc("config");
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cfg = snap.exists ? snap.data() : {};
    const auto = cfg.automation || {};
    const et = auto.eventTriggers || {};
    const pending = Array.isArray(et.pending) ? et.pending : [];
    if (pending.some(p => p.idempotencyKey === entry.idempotencyKey)) return;
    pending.push(entry);
    et.pending = pending.slice(-200);
    auto.eventTriggers = et;
    tx.set(ref, { automation: auto }, { merge: true });
  });
}

/* ─── Idempotency check ─── */
export function isAlreadyFired(et, idempotencyKey){
  if (!idempotencyKey) return false;
  const hist = Array.isArray(et?.eventHistory) ? et.eventHistory : [];
  return hist.some(h => h.idempotencyKey === idempotencyKey && h.success);
}

/* ─── Resolve owner phones ─── */
export function resolveOwnerPhones(et){
  return (et?.ownerPhones || []).filter(p => typeof p === "string" && p.trim());
}

/* ═══ MAIN: process one event ═══════════════════════════════════════════
   Inputs:
     db                 — Firestore Admin instance
     cfgCache           — pre-fetched config doc (optional, saves a read)
     eventType          — "saleCompleted" | ... | "checkDue"
     payload            — event-specific data (must have required fields)
     customerPhone      — destination for "customer"-targeted message
     idempotencyKey     — required, unique per real-world event
     force              — bypass mode check ("manual" → auto-fire)
     source             — "client" | "cron" | "manual" — for history
   Returns: { ok, status, body }
   - status: HTTP-like code (200/400/401/502/503)
   - body: JSON-safe response object
   ═══════════════════════════════════════════════════════════════════════ */
export async function processEvent(db, params){
  /* V19.70.10: supplierPhone added for checkPaymentIssued and supplier-recipient events */
  const { eventType, payload, customerPhone, supplierPhone, idempotencyKey, force, source, cfgCache } = params;

  /* Validate input */
  if (!eventType || !EVENT_VARIABLES[eventType]) {
    return { ok: false, status: 400, body: { error: "unknown eventType: " + String(eventType) } };
  }
  if (!payload || typeof payload !== "object") {
    return { ok: false, status: 400, body: { error: "payload required" } };
  }
  if (!idempotencyKey) {
    return { ok: false, status: 400, body: { error: "idempotencyKey required" } };
  }
  const v = validateEventPayload(eventType, payload);
  if (!v.ok) return { ok: false, status: 400, body: { error: "missing fields: " + v.missing.join(", ") } };

  /* Load config (or use cached) */
  let cfg = cfgCache;
  if (!cfg) {
    const snap = await db.collection("factory").doc("config").get();
    cfg = snap.exists ? snap.data() : {};
  }
  const auto = cfg.automation || {};
  const et = auto.eventTriggers || {};
  const eventCfg = (et.events || {})[eventType] || {};

  /* Idempotency */
  if (!force && isAlreadyFired(et, idempotencyKey)) {
    return { ok: true, status: 200, body: { ok: true, deduped: true, reason: "already-fired" } };
  }

  /* Disabled */
  if (!eventCfg.enabled) {
    return { ok: true, status: 200, body: { ok: true, skipped: true, reason: "event-disabled" } };
  }

  /* Resolve phones */
  const phones = {
    customer: customerPhone || null,
    supplier: supplierPhone || null,/* V19.70.10 */
    owner: resolveOwnerPhones(et),
    salesperson: payload.salespersonPhone || null,
  };

  /* Manual mode → queue */
  const mode = et.mode || "auto";
  if (mode === "manual" && !force) {
    await queuePending(db, {
      id: "p_" + Date.now().toString(36),
      idempotencyKey, eventType, payload, customerPhone,
      createdAt: new Date().toISOString(),
      attempts: 0,
    });
    return { ok: true, status: 200, body: { ok: true, queued: true, mode: "manual" } };
  }

  /* Build messages */
  const messages = buildEventMessages(eventType, eventCfg, payload, phones);
  if (messages.length === 0) {
    return { ok: true, status: 200, body: { ok: true, skipped: true, reason: "no-recipients" } };
  }

  /* Bridge config */
  const bridgeUrl = (cfg.campaignBridge || {}).url || "";
  const bridgeToken = (cfg.campaignBridge || {}).token || "";
  if (!bridgeUrl) {
    await queuePending(db, {
      id: "p_" + Date.now().toString(36),
      idempotencyKey, eventType, payload, customerPhone,
      createdAt: new Date().toISOString(),
      attempts: 0,
      lastError: "bridge-not-configured",
    });
    return { ok: false, status: 200, body: { ok: false, queued: true, error: "campaignBridge.url not set" } };
  }

  /* Fire */
  let bridgeResult;
  try {
    bridgeResult = await bridgeSend(bridgeUrl, bridgeToken,
      messages.map(m => ({ phone: m.phone, message: m.message })));
  } catch (e) {
    await queuePending(db, {
      id: "p_" + Date.now().toString(36),
      idempotencyKey, eventType, payload, customerPhone,
      createdAt: new Date().toISOString(),
      attempts: 1,
      lastError: e.message,
    });
    await recordResult(db, {
      idempotencyKey, eventType, payload,
      success: false, error: e.message, source: source || "unknown",
    });
    return { ok: false, status: 502, body: { ok: false, error: "bridge: " + e.message, queued: true } };
  }

  /* Success */
  await recordResult(db, {
    idempotencyKey, eventType, payload,
    success: true, recipientCount: messages.length, source: source || "unknown",
  });

  return {
    ok: true,
    status: 200,
    body: {
      ok: true,
      sent: messages.length,
      accepted: bridgeResult?.queued || bridgeResult?.accepted || messages.length,
    },
  };
}
