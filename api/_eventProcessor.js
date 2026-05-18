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

/* ─── Bridge call ───
   V21.9.41 ROOT CAUSE FIX: pre-V21.9.41 this fetch had NO timeout. If the bridge
   hangs > Vercel's function limit (~10s hobby / 60s pro), Vercel KILLS the
   serverless function BEFORE the success-side recordResult() runs at line 369.
   Result: eventHistory entry stuck on { inFlight:true, success:false } even
   though the bridge actually delivered the message. After INFLIGHT_LOCK_MS
   the cron tick reclaims the "stale" lock and fires AGAIN → customer gets
   TWO identical WhatsApp messages on the same phone.

   Fix: AbortController with 8s timeout — comfortably under Vercel's 10s hobby
   limit. If the bridge is slow/dead, we abort cleanly, bridgeSend throws,
   the try/catch at line 350 runs recordResult({success:false}), and the
   atomic claim record gets a FINAL state instead of orphaned inFlight.
   The atomic claim's idempotencyKey is preserved, so the cron retry that
   follows will see the failed-recorded entry, requeue via queuePending,
   and the message will fire exactly once on next bridge availability.

   Anti-pattern: external HTTP calls inside serverless functions WITHOUT
   an explicit timeout < function-kill timeout. Always set AbortController. */
const BRIDGE_SEND_TIMEOUT_MS = 8_000;

export async function bridgeSend(bridgeUrl, bridgeToken, messages){
  const url = String(bridgeUrl || "").replace(/\/+$/, "") + "/send";
  const headers = { "Content-Type": "application/json" };
  if (bridgeToken) headers["Authorization"] = "Bearer " + bridgeToken;
  /* V21.9.41: AbortController so the fetch can't outlive Vercel's function
     timeout — without this, recordResult would be skipped and the cron
     would later reclaim the stale inFlight lock and double-fire. */
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), BRIDGE_SEND_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ messages }),
      signal: ctrl.signal,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || ("HTTP " + r.status));
    return data;
  } catch (e) {
    /* V21.9.41: surface AbortError as a meaningful Arabic message so the
       Vercel log + eventHistory entry says exactly what happened. */
    if (e?.name === "AbortError") {
      throw new Error("Bridge timeout بعد " + (BRIDGE_SEND_TIMEOUT_MS/1000) + "s");
    }
    throw e;
  } finally {
    clearTimeout(tid);
  }
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

/* ─── V19.76.3 → V21.9.41: Stale in-flight claim timeout (ms) ───
   If a claim is older than this and never reached recordResult (e.g. serverless
   instance crashed mid-bridge), the next caller can reclaim it.

   V21.9.41 ROOT CAUSE FIX: pre-V21.9.41 this was 60s. The Vercel cron
   `automation-tick` runs every 5 minutes. If recordResult got skipped (Vercel
   function killed mid-bridgeSend, network drop between fetch return + Firestore
   write, etc.), the eventHistory entry remained `inFlight:true` indefinitely.
   At T+60s the lock expired; at T+5min the cron reclaimed and re-fired the
   bridge → customer received TWO identical messages.

   Fix: bump to 5 minutes — strictly longer than the cron interval + buffer for
   bridge worst case (typing simulation up to 25s × N messages). Combined with
   the V21.9.41 bridgeSend AbortController above, recordResult is now guaranteed
   to run within 8s of the bridge call (success or abort), so this generous
   lock window is purely defensive.

   ⚠️ NEVER set this BELOW the cron interval — it re-opens the race that
   V19.76.3 was designed to close.

   Anti-pattern: stale-claim timeout < async retry interval (cron tick). */
/* V21.9.86 (Shopify audit Bug #10): bumped to 6 min to provide buffer above
   the 5-min cron interval. Pre-V21.9.86 at exactly 300_000 the lock could
   expire at the same instant the next cron tick fires → race window at the
   boundary. New value = cron interval (5min) + bridge worst-case (8s) +
   buffer (52s) = 360_000ms. */
const INFLIGHT_LOCK_MS = 360_000;

/* ─── V19.76.8 → V21.9.41: Content-based dedupe window ───
   Last-resort safety net for duplicate WhatsApp messages. If the SAME content
   (eventType + recipient phone + payloadSummary) was claimed/fired within this
   window — even with a different idempotencyKey — refuse.

   V21.9.41: bumped 30s → 15min. Reason: the original 30s window was tuned for
   the race between client instant fire + cron tick happening near-simultaneously.
   But the real-world race we saw was: instant fire succeeded at T=0, recordResult
   skipped (Vercel kill), cron retries at T=300s with a NEW idempotencyKey (when
   the user edited then re-saved the payment, OR when the cron rescanned the
   day-split doc which gets the payment-doc rewritten on every cust_payment edit).
   30s was useless against that timing. 15min comfortably beats every cron tick
   and any reasonable edit-then-resave cadence.

   Tradeoff: legitimate sequential events to the same customer (e.g., 2 different
   payments within 15min) MIGHT collide on contentSig if amounts + balance happen
   to match the prior payload's summarizePayload exactly. summarizePayload for
   paymentReceived is `${customerName} • ${amount}` — same customer + same amount
   in 15min would collide. We accept this — the user can use `force:true` to
   bypass for legitimate identical re-fires (rare). */
const CONTENT_DEDUPE_MS = 900_000;

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

/* V21.9.92 (WhatsApp audit Warning #5): classify pending errors so cron
   retry logic can be smarter. Pre-V21.9.92 all errors got the same retry
   treatment, including permanent ones like 'invalid-phone' that will never
   succeed. Categories:
   - timeout: retryable with exponential backoff
   - invalid-phone: permanent (don't retry)
   - opted-out: permanent (don't retry)
   - unknown: conservative retry */
function _classifyError(message){
  if (!message || typeof message !== "string") return "unknown";
  const m = message.toLowerCase();
  if (m.includes("timeout") || m.includes("aborterror") || m.includes("abort")) return "timeout";
  if (m.includes("invalid") || m.includes("not a valid") || m.includes("not on whatsapp")) return "invalid-phone";
  if (m.includes("opted") || m.includes("block")) return "opted-out";
  return "unknown";
}

/* ─── Queue an entry (manual mode, or after bridge failure) ─── */
export async function queuePending(db, entry){
  const ref = db.collection("factory").doc("config");
  /* V21.9.92: annotate the entry with errorCategory so the cron retry
     loop can make informed retry decisions (skip permanent failures). */
  const annotated = {
    ...entry,
    errorCategory: _classifyError(entry.lastError),
  };
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cfg = snap.exists ? snap.data() : {};
    const auto = cfg.automation || {};
    const et = auto.eventTriggers || {};
    const pending = Array.isArray(et.pending) ? et.pending : [];
    if (pending.some(p => p.idempotencyKey === annotated.idempotencyKey)) return;
    pending.push(annotated);
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

/* ─── Resolve owner phones ───
   V21.9.55 (Audit B8): dedupe by canonical digits-only form. If admin enters
   the same number twice (e.g., once with country code, once without), we
   normalize first then dedupe so the owner receives ONE message instead of N.
   Empty/whitespace entries dropped. */
export function resolveOwnerPhones(et){
  const raw = (et?.ownerPhones || []).filter(p => typeof p === "string" && p.trim());
  const seen = new Set();
  const out = [];
  for (const phone of raw) {
    const digits = phone.replace(/[^0-9]/g, "");
    if (!digits) continue;
    if (seen.has(digits)) continue;
    seen.add(digits);
    out.push(phone); /* keep original format (with + etc.) for the bridge */
  }
  return out;
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

  /* Disabled
     V21.9.58 (Automation Audit C3): if a pending entry is being drained for
     an event that's now disabled, the previous behavior just returned skipped
     but LEFT the entry in pending[] forever. Now the caller (automation-tick
     drain loop) knows to remove it from pending via the `dequeueIfPending`
     flag in the response. This prevents orphan pending entries from accumulating
     after admin disables an event mid-backlog. */
  if (!eventCfg.enabled) {
    return { ok: true, status: 200, body: { ok: true, skipped: true, reason: "event-disabled", dequeueIfPending: true } };
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
      idempotencyKey, eventType, payload, customerPhone, supplierPhone,/* V21.9.58 (C2) */
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
      idempotencyKey, eventType, payload, customerPhone, supplierPhone,/* V21.9.58 (C2) */
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

  /* V21.9.41: track whether recordResult got committed. If we exit this function
     WITHOUT calling it, the eventHistory entry stays { inFlight:true } forever
     and the cron tick will reclaim it after INFLIGHT_LOCK_MS → duplicate WA send.
     The finally block below uses this flag to fire a last-ditch failure record.
     Anti-pattern: claim-then-fire without guaranteed result write closes the
     happy path but leaves orphans on crash. ALWAYS finalize the claim. */
  let _recordCommitted = false;
  let _bridgeResult;
  let _bridgeError = null;

  try {
    /* Fire */
    try {
      _bridgeResult = await bridgeSend(bridgeUrl, bridgeToken,
        messages.map(m => ({ phone: m.phone, message: m.message })));
    } catch (e) {
      _bridgeError = e;
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
      _recordCommitted = true;
      return { ok: false, status: 502, body: { ok: false, error: "bridge: " + e.message, queued: true } };
    }

    /* Success */
    await recordResult(db, {
      idempotencyKey, eventType, payload,
      success: true, recipientCount: messages.length, source: source || "unknown",
    });
    _recordCommitted = true;

    return {
      ok: true,
      status: 200,
      body: {
        ok: true,
        sent: messages.length,
        accepted: _bridgeResult?.queued || _bridgeResult?.accepted || messages.length,
      },
    };
  } finally {
    /* V21.9.41 SAFETY NET: if we're exiting without a committed result (Firestore
       transaction conflict on recordResult, an unexpected throw inside the success
       path, etc.), do a best-effort failure record so the inFlight lock has SOME
       final state. The bridge may have delivered — we record failure to be safe;
       the user can see the entry in eventHistory and decide whether to resend.
       Without this, the cron would reclaim and re-fire 5 minutes later. */
    if (!_recordCommitted) {
      try {
        await recordResult(db, {
          idempotencyKey, eventType, payload,
          success: false,
          error: "unrecorded: " + (_bridgeError?.message || "result-write-failed"),
          source: (source || "unknown") + "-finally",
        });
        console.warn("[event-trigger] FINALLY recordResult (last-ditch)", { idempotencyKey, eventType });
      } catch (recErr) {
        /* If even the finally recordResult fails, log loudly — the inFlight lock
           will eventually expire after INFLIGHT_LOCK_MS (5 min). The cron retry
           will then surface as "DEDUPED: in-flight" until then. */
        console.error("[event-trigger] FINALLY recordResult also failed:", recErr?.message || recErr);
      }
    }
  }
}
