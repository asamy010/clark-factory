/* ════════════════════════════════════════════════════════════════════════
   AI AGENT — Daily cost cap / budget   (V21.9.239)
   ════════════════════════════════════════════════════════════════════════
   Sonnet is billable, so the admin can set a daily USD cap. We keep a tiny
   per-day counter in aiAgentBudget/{YYYY-MM-DD} (Cairo day), incremented after
   every Claude call. The gate reads it BEFORE each call; once today's spend
   reaches the cap, the agent stops calling Claude until tomorrow (a new day =
   a fresh counter, so it auto-recovers — no need to flip enabled).

   Writes are Admin-SDK only (this module), so NO firestore.rules clause is
   needed: the dashboard shows "today's spend" by summing the turns it already
   subscribes to (same Sonnet pricing as turnCostUsd here), not by reading this
   collection. Fail-OPEN everywhere: a budget read/write error never blocks a
   reply (losing a customer reply is worse than a small overspend).
   ════════════════════════════════════════════════════════════════════════ */
import admin from "firebase-admin";

const TZ = "Africa/Cairo";

/* Cairo day-key (YYYY-MM-DD) doc id for an epoch ms. */
export function budgetDocId(nowMs) {
  const d = new Date(Number(nowMs) || Date.now());
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

/* USD cost of one turn's usage at Sonnet-4 pricing per 1M tokens
   (input $3, output $15, cache-write $3.75, cache-read $0.30). MUST match the
   frontend turnCost() so the dashboard's "today spend" agrees with the cap. */
export function turnCostUsd(u) {
  if (!u) return 0;
  return (Number(u.input_tokens) || 0) * 3.0 / 1e6
       + (Number(u.output_tokens) || 0) * 15.0 / 1e6
       + (Number(u.cache_creation_input_tokens) || 0) * 3.75 / 1e6
       + (Number(u.cache_read_input_tokens) || 0) * 0.30 / 1e6;
}

/* Today's spend so far (USD). Fail-open → 0 on any error. */
export async function readTodaySpend(db, nowMs) {
  try {
    const snap = await db.collection("aiAgentBudget").doc(budgetDocId(nowMs)).get();
    return snap.exists ? (Number((snap.data() || {}).costUsd) || 0) : 0;
  } catch (e) {
    console.warn("[ai-agent/budget] read failed:", e?.message || e);
    return 0;
  }
}

/* Atomically add a turn's cost + tokens to today's counter. Best-effort. */
export async function addSpend(db, nowMs, usage) {
  try {
    const inc = admin.firestore.FieldValue.increment;
    const u = usage || {};
    const id = budgetDocId(nowMs);
    await db.collection("aiAgentBudget").doc(id).set({
      dayKey: id,
      costUsd:          inc(turnCostUsd(u)),
      turns:            inc(1),
      inputTokens:      inc(Number(u.input_tokens) || 0),
      outputTokens:     inc(Number(u.output_tokens) || 0),
      cacheReadTokens:  inc(Number(u.cache_read_input_tokens) || 0),
      cacheWriteTokens: inc(Number(u.cache_creation_input_tokens) || 0),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (e) {
    console.warn("[ai-agent/budget] add failed:", e?.message || e);
  }
}
