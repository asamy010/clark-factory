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

/* ─── V19.76.3: Stale in-flight claim timeout (ms) ───
   If a claim is older than this and never reached recordResult (e.g. serverless
   instance crashed mid-bridge), the next caller can reclaim it. Bridge typing
   delay is at most 25s for /send, so 60s is comfortably above the worst case. */
const INFLIGHT_LOCK_MS = 60_000;

/* ─── V19.76.8: Content-based dedupe window ───
   Last-resort safety net for duplicate WhatsApp messages. If the SAME content
   (eventType + recipient phone + payloadSummary) was claimed/fired within this
   window — even with a different idempotencyKey — refuse. This catches cases
   where two custPayments end up with different IDs but the same content
   (e.g. a sync race that double-records, or an edit that fires anew within
   seconds), something the per-key idempotency check misses. */
const CONTENT_DEDUPE_MS = 30_000;

/* ─── Append OR update existing eventHistory entry + maintain pending queue ───
   V19.76.3: now updates the in-flight entry written by claimEvent (instead of
   pushing a duplicate row). If no in-flight entry exists (claim was skipped or
   already collapsed), falls back to unshift for backward compat.
   V19.76.8: preserves contentSig + recipPhone written by the claim so the
   content-based dedupe in claimEvent still sees the entry post-success. */
export async function recordResult(db, opts){
  const { idempotencyKey, eventType, payload, success, recipientCount, error, source } = opts;
  const ref = db.collection("factory").doc("config");
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cfg = snap.exists ? snap.data() : {};
    const auto = cfg.automation || {};
    const et = auto.eventTriggers || {};
    const history = Array.isArray(et.eventHistory) ? et.eventHistory : [];
    const existingIdx = idempotencyKey
      ? history.findIndex(h => h.idempotencyKey === idempotencyKey)
      : -1;
    const prior = existingIdx >= 0 ? history[existingIdx] : null;
    const finalEntry = {
      id: idempotencyKey || ("evt_" + Date.now().toString(36)),
      idempotencyKey,
      eventType,
      at: prior ? (prior.at || new Date().toISOString()) : new Date().toISOString(),
      completedAt: new Date().toISOString(),
      success: !!success,
      recipientCount: recipientCount || 0,
      error: error || null,
      source: source || "unknown",
      payloadSummary: summarizePayload(eventType, payload),
      /* V19.76.8: keep the dedupe signature alive so claimEvent's content check
         still sees this entry within CONTENT_DEDUPE_MS. */
      recipPhone: prior?.recipPhone || "",
      contentSig: prior?.contentSig || null,
      /* drop the inFlight flag — this entry is now final */
    };
    if (existingIdx >= 0) {
      history[existingIdx] = finalEntry;
    } else {
      history.unshift(finalEntry);
    }
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

/* ─── V19.76.3: Atomic claim of an idempotency key ───
   Writes an `inFlight: true` history entry inside a transaction so concurrent
   callers see it and back off. Returns:
     { claimed: true }                     — caller proceeds to bridgeSend
     { claimed: false, reason: "already-succeeded" } — earlier success persists
     { claimed: false, reason: "in-flight" }         — another caller is mid-send

   Why we need this: pre-V19.76.3 the dedupe check was `success === true`. The
   client-side instant fire and the cron tick both call processEvent with the
   same idempotencyKey; the cron is supposed to dedupe via eventHistory. But
   recordResult only ran AFTER bridgeSend completed (which can take seconds for
   the bridge typing simulation). If the cron tick landed in that window, it
   saw an empty history and fired again → customer received TWO identical
   messages. The atomic claim closes that race. */
export async function claimEvent(db, opts){
  const { idempotencyKey, eventType, payload, source, customerPhone, supplierPhone } = opts;
  if (!idempotencyKey) return { claimed: true };/* defensive — caller already validates */
  const ref = db.collection("factory").doc("config");
  /* V19.76.8: pre-compute the content dedupe key. summarizePayload returns the
     same string for two events with the same key fields (customerName + amount,
     etc.), so combining it with the recipient phone + eventType gives a stable
     content signature. The dedupe applies only when at least one recipient phone
     is present — owner-only events never collide on this path. */
  const recipPhone = customerPhone || supplierPhone || "";
  const contentSig = recipPhone
    ? eventType + "|" + recipPhone + "|" + summarizePayload(eventType, payload)
    : null;
  return await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cfg = snap.exists ? snap.data() : {};
    const auto = cfg.automation || {};
    const et = auto.eventTriggers || {};
    const history = Array.isArray(et.eventHistory) ? et.eventHistory : [];
    const existingIdx = history.findIndex(h => h.idempotencyKey === idempotencyKey);
    const existing = existingIdx >= 0 ? history[existingIdx] : null;

    if (existing && existing.success) {
      return { claimed: false, reason: "already-succeeded" };
    }
    if (existing && existing.inFlight) {
      const ageMs = Date.now() - Date.parse(existing.at || 0);
      if (ageMs >= 0 && ageMs < INFLIGHT_LOCK_MS) {
        return { claimed: false, reason: "in-flight" };
      }
      /* lock is stale (caller crashed) — fall through and reclaim */
    }

    /* V19.76.8: content-based safety net — same recipient + same event content
       claimed/sent within CONTENT_DEDUPE_MS counts as a duplicate even if the
       idempotencyKey differs. Excludes the entry we're currently processing. */
    if (contentSig) {
      const now = Date.now();
      const collision = history.find(h => {
        if (!h || h.idempotencyKey === idempotencyKey) return false;
        const sig = (h.contentSig) || (h.payloadSummary && h.eventType
          ? h.eventType + "|" + (h.recipPhone || "") + "|" + h.payloadSummary
          : null);
        if (sig !== contentSig) return false;
        const t = Date.parse(h.at || 0);
        return Number.isFinite(t) && (now - t) < CONTENT_DEDUPE_MS;
      });
      if (collision) {
        return { claimed: false, reason: "content-duplicate" };
      }
    }

    const claimEntry = {
      id: idempotencyKey,
      idempotencyKey,
      eventType,
      at: new Date().toISOString(),
      inFlight: true,
      success: false,/* not yet — recordResult will flip to true on success */
      source: source || "unknown",
      payloadSummary: summarizePayload(eventType, payload),
      /* V19.76.8: persist the recipient + content signature so the content
         dedupe check above sees them on subsequent calls. */
      recipPhone,
      contentSig,
    };
    if (existingIdx >= 0) {
      history[existingIdx] = claimEntry;
    } else {
      history.unshift(claimEntry);
    }
    et.eventHistory = history.slice(0, 100);
    auto.eventTriggers = et;
    tx.set(ref, { automation: auto }, { merge: true });
    return { claimed: true };
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
  /* V19.70.10: supplierPhone added for checkPaymentIssued and supplier-recipient events
     V19.70.18: recipientFilter — array of role names to limit which messages are built.
     Used by checkDue to fire customer + owner as separate calls (different idempotency keys
     so they don't dedupe each other). Omit / null to keep legacy behavior (all roles). */
  const { eventType, payload, customerPhone, supplierPhone, idempotencyKey, force, source, cfgCache, recipientFilter } = params;

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

  /* Build messages. V19.70.18: pass recipientFilter so checkDue can split customer/owner
     into separate processEvent calls (each with its own idempotencyKey so they don't
     accidentally dedupe each other). buildEventMessages drops messages whose role isn't
     in the filter when one is provided. */
  const messages = buildEventMessages(eventType, eventCfg, payload, phones, recipientFilter);
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

  /* V19.76.3: ATOMIC CLAIM before firing. Closes the race where the client-side
     instant fire and the cron tick both pass the pre-check (because recordResult
     hasn't run yet) and both call bridgeSend → customer receives 2 messages.
     The transactional claim writes an `inFlight: true` entry; the loser of the
     race sees it and returns deduped. `force` mode bypasses for manual replays.
     V19.76.8: explicit log line on every dedupe so users can grep Vercel logs to
     pinpoint where duplicate fires originate when they still happen. */
  if (!force) {
    const claim = await claimEvent(db, { idempotencyKey, eventType, payload, source: source || "unknown", customerPhone, supplierPhone });
    if (!claim.claimed) {
      console.log("[event-trigger] DEDUPED", { eventType, idempotencyKey, reason: claim.reason, source });
      return { ok: true, status: 200, body: { ok: true, deduped: true, reason: claim.reason } };
    }
  } else {
    /* V19.76.8: force-bypass surfaces clearly in logs. If the user reports a duplicate
       and this line shows up, the duplicate came from a manual replay or some other
       caller that explicitly set force=true. */
    console.log("[event-trigger] FORCE bypass — claim skipped", { eventType, idempotencyKey, source });
  }
  console.log("[event-trigger] FIRING bridge", { eventType, idempotencyKey, source, recipientCount: messages.length });

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
