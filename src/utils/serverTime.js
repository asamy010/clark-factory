/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Server-time client helper (V19.76.4)
   ───────────────────────────────────────────────────────────────────────
   Many users have computers with mis-set clocks (wrong timezone, battery-
   drained CMOS, no NTP). Before V19.76.4, every `new Date()` call inherited
   that drift, so payments saved on a 2-day-stale machine got created_at
   timestamps from 2 days ago — corrupting the eventHistory chronology and
   the kashf date columns.

   This module exposes Cairo-anchored time helpers backed by `/api/now`:

     await syncClock()   → fetches server time, computes skew vs local clock
     nowMs()             → corrected epoch ms (Date.now() + skewMs)
     nowDate()           → corrected Date instance
     nowISO()            → corrected ISO 8601 string (UTC, ends in Z)
     cairoDateStr()      → YYYY-MM-DD in Africa/Cairo timezone (today's date)
     cairoTimeStr()      → HH:MM:SS in Africa/Cairo timezone

   `syncClock()` is best-effort — if the fetch fails (offline, server down),
   the helpers fall back to plain `new Date()` so the app keeps working. The
   fallback is logged once so devs notice if a deploy broke /api/now.

   Re-sync every 30 minutes so long-lived sessions don't drift if the user
   leaves the browser open and the local clock is gradually wrong.
   ═══════════════════════════════════════════════════════════════════════ */

const TZ = "Africa/Cairo";
const RESYNC_MS = 30 * 60 * 1000;/* 30 min */

let _skewMs = 0;
let _synced = false;
let _lastSyncAt = 0;
let _inflight = null;
let _warnedOnce = false;

/* Compute round-trip-aware skew. We can't avoid network latency entirely, but
   approximating the one-way trip as half the RTT brings us within ~50ms of
   server time — good enough for human-readable timestamps. */
async function _doSync(){
  const t0 = Date.now();
  try {
    const r = await fetch("/api/now", { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const data = await r.json();
    const t1 = Date.now();
    const halfRtt = (t1 - t0) / 2;
    const serverMs = Number(data.nowMs);
    if (!Number.isFinite(serverMs)) throw new Error("invalid nowMs");
    /* Server's `now` was captured at ~ (t0 + halfRtt) local time */
    _skewMs = serverMs - (t0 + halfRtt);
    _synced = true;
    _lastSyncAt = t1;
    /* Surface large skews in console so user can see why timestamps may shift */
    if (Math.abs(_skewMs) > 60_000) {
      console.warn("[serverTime] Local clock is " + Math.round(_skewMs/1000) +
        "s off from server. Timestamps will be corrected.");
    }
    return _skewMs;
  } catch (e) {
    if (!_warnedOnce) {
      _warnedOnce = true;
      console.warn("[serverTime] /api/now sync failed (using local clock):", e?.message || e);
    }
    /* Don't update _synced — fallback is plain Date */
    throw e;
  }
}

export function syncClock(){
  /* De-dupe concurrent calls so multiple tabs/components don't spam /api/now. */
  if (_inflight) return _inflight;
  _inflight = _doSync().finally(() => { _inflight = null; });
  return _inflight;
}

/* Periodic re-sync — call once at app boot. */
export function startClockSync(){
  syncClock().catch(() => {});
  /* No setInterval here — we re-sync lazily on each nowMs() call if stale,
     so the user doesn't pay for re-syncs they don't need. */
}

export function nowMs(){
  /* Trigger a fresh sync if we've drifted past the resync window — non-blocking,
     so this call still uses the previous skew. */
  if (_synced && (Date.now() - _lastSyncAt) > RESYNC_MS) {
    syncClock().catch(() => {});
  }
  return Date.now() + _skewMs;
}

export function nowDate(){
  return new Date(nowMs());
}

export function nowISO(){
  return nowDate().toISOString();
}

/* YYYY-MM-DD in Africa/Cairo, regardless of user's timezone. */
export function cairoDateStr(d){
  const dt = d || nowDate();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(dt);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.year}-${map.month}-${map.day}`;
}

/* HH:MM:SS in Africa/Cairo. */
export function cairoTimeStr(d){
  const dt = d || nowDate();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(dt);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  const h = map.hour === "24" ? "00" : map.hour;
  return `${h}:${map.minute}:${map.second}`;
}

/* For diagnostics — exposed mainly for the Settings page if we ever surface it. */
export function getClockState(){
  return {
    synced: _synced,
    skewMs: _skewMs,
    lastSyncAt: _lastSyncAt ? new Date(_lastSyncAt).toISOString() : null,
  };
}
