/* ═══════════════════════════════════════════════════════════════════════
   CLARK · whatsappBridge.js (V21.9.35)
   ───────────────────────────────────────────────────────────────────────
   Shared client for the local WhatsApp Bridge service (clark-wa-bridge).

   Previously every caller (CampaignsPg, ShopifyIntegrationPg) re-implemented
   the bridge HTTP calls + phone normalization. This led to bugs: bridges
   from ShopifyIntegrationPg used wrong field names (V21.9.34 fix), wrong
   phone normalization (V21.9.35 fix), and missed pre-flight checks like
   `queuePaused` (V21.9.35 fix).

   Single source of truth now lives here. Both pages import from here.

   Public API:
     • bridge.status(url, token)           → { waReady, queueRunning, queuePaused, daily, queue, stats, ... }
     • bridge.queue(url, token)            → { queue, dailyCounter, optOuts, stats }
     • bridge.activity(url, token, limit)  → { activity: [...], total }
     • bridge.send(url, messages, token)   → { ok, added, queueTotal }
     • bridge.pause / resume / stop / clear(url, token)
     • bridge.optouts(url, token)          → { optOuts: [...] }
     • cleanPhone(raw)                     → canonical 12-digit Egyptian
                                              (e.g., "201001234567")
     • verifyBridgeReady(url, token)       → { ok, blockers: [...], status }
       Comprehensive pre-flight: waReady, queuePaused, daily cap, queue size.
     • pollBridgeActivity(url, token, campaignId, expectedCount, timeoutMs)
       → { sent, failed, skipped, pending, activities: [...] }
       Polls /activity until all expected campaign messages are accounted for
       or timeout. Returns real counts (not bridge-reported `added`).
   ═══════════════════════════════════════════════════════════════════════ */

/* ─── HTTP helper ─── */
async function bridgeFetch(url, path, opts = {}, token){
  const base = (url || "").replace(/\/+$/, "");
  if(!base) throw new Error("Bridge URL not set");
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), opts.timeout || 8000);
  try {
    const headers = {};
    if(opts.body) headers["Content-Type"] = "application/json";
    if(token) headers["Authorization"] = "Bearer " + token;
    const r = await fetch(base + path, {
      method: opts.method || "GET",
      headers: Object.keys(headers).length ? headers : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
    });
    clearTimeout(timeout);
    if(r.status === 401) throw new Error("Unauthorized — تأكد من Auth Token");
    if(!r.ok){
      const text = await r.text().catch(() => "");
      throw new Error("HTTP " + r.status + (text ? ": " + text.slice(0, 200) : ""));
    }
    return await r.json();
  } catch(e) {
    clearTimeout(timeout);
    throw e;
  }
}

/* ─── Bridge methods ─── */
export const bridge = {
  status:    (url, token)              => bridgeFetch(url, "/status",   { timeout: 4000 }, token),
  queue:     (url, token)              => bridgeFetch(url, "/queue",    {}, token),
  send:      (url, messages, token)    => bridgeFetch(url, "/send",     { method: "POST", body: { messages }, timeout: 15000 }, token),
  pause:     (url, token)              => bridgeFetch(url, "/pause",    { method: "POST" }, token),
  resume:    (url, token)              => bridgeFetch(url, "/resume",   { method: "POST" }, token),
  stop:      (url, token)              => bridgeFetch(url, "/stop",     { method: "POST" }, token),
  clear:     (url, token)              => bridgeFetch(url, "/clear",    { method: "POST" }, token),
  optouts:   (url, token)              => bridgeFetch(url, "/optouts",  {}, token),
  activity:  (url, token, limit = 50)  => bridgeFetch(url, "/activity?limit=" + limit, {}, token),
  resetDaily:(url, token)              => bridgeFetch(url, "/reset-daily", { method: "POST" }, token),
  stats:     (url, token)              => bridgeFetch(url, "/stats", {}, token),
};

/* ─── Egyptian phone canonicalizer (battle-tested in CampaignsPg) ───
   Output: 12-digit string starting with "20" (or empty on invalid input).
   Examples:
     "+201001234567"     → "201001234567"
     "01001234567"       → "201001234567"
     "1001234567"        → "201001234567"
     "00201001234567"    → "201001234567"  ← FIX: handles 00 prefix
     ""                  → ""              ← guard
     null/undefined      → ""              ← guard
*/
export function cleanPhone(ph){
  if(!ph) return "";
  let p = String(ph).replace(/[^0-9]/g, "");
  if(p.startsWith("00")) p = p.slice(2);          /* strip international dial-out 00 */
  if(p.startsWith("20")) return p;                /* already canonical 20XXXXXXXXXX */
  if(p.startsWith("0"))  return "20" + p.slice(1); /* 01XXXXXXXXX → 201XXXXXXXXX */
  if(p.length === 11 && p.startsWith("1")) return "20" + p;  /* missing 0/20 prefix */
  if(p.length === 10 && /^[1-9]/.test(p))   return "20" + p;  /* 10-digit Egyptian mobile */
  return p; /* fallback: pass through (bridge will normalize again) */
}

/* ─── Comprehensive pre-flight check ───
   Returns { ok: boolean, blockers: string[], warnings: string[], status: {...} }.
   Blockers must be resolved before sending. Warnings let the user decide.

   This replaces the V21.9.34 single-line `waReady === false` check, which
   missed the most common failure mode (queue paused after daily cap hit). */
export async function verifyBridgeReady(url, token, opts = {}){
  const result = { ok: false, blockers: [], warnings: [], status: null };
  let status;
  try {
    status = await bridge.status(url, token);
    result.status = status;
  } catch(e) {
    result.blockers.push("فشل الاتصال بـ Bridge: " + (e.message || "غير معروف"));
    return result;
  }

  /* Hard blockers — Bridge will not deliver while these are true */
  if(status.waReady === false){
    result.blockers.push("الـ WhatsApp مش متصل (waReady = false). افتح bridge dashboard وامسح QR.");
  }
  if(status.queuePaused === true){
    result.blockers.push("الـ queue موقّف (queuePaused = true). افتح bridge dashboard واضغط Resume.");
  }

  /* Soft warnings — user should know but may proceed */
  const dailySent = status.daily?.sent || 0;
  const dailyCap = status.settings?.dailyCap || 50;
  const expectedCount = opts.messageCount || 0;
  if(dailySent >= dailyCap){
    result.blockers.push(`وصلنا للحد اليومي (${dailySent}/${dailyCap}). الـ queue هـ يـ pause نفسه. استنى بكره أو زوّد الـ cap.`);
  } else if(expectedCount > 0 && dailySent + expectedCount > dailyCap){
    result.warnings.push(`الحد اليومي ${dailyCap}، اتبعت ${dailySent} اليوم. الإرسال هـ يقف عند ${dailyCap - dailySent} رسالة بس.`);
  }

  const pending = status.queue?.pending || 0;
  if(pending > 50){
    result.warnings.push(`في ${pending} رسالة pending في الـ queue قبل المسجات بتاعتك. الإرسال هـ يتأخر.`);
  }

  result.ok = result.blockers.length === 0;
  return result;
}

/* ─── Post-send activity verification ───
   After bridge.send returns { ok, added }, we don't actually know if the
   messages were delivered — they're just queued. Poll /activity for up to
   `timeoutMs` until we see activity entries for all our messages, or
   timeout. Returns real counts (sent/failed/skipped/pending).

   This is the V21.9.35 fix that replaces V21.9.34's silent setTimeout 5s
   console.log. Now the user actually sees what happened. */
export async function pollBridgeActivity(url, token, campaignId, expectedCount, timeoutMs = 30000){
  const result = {
    sent: 0,
    failed: 0,
    skipped: 0,
    pending: expectedCount,
    activities: [],
    timedOut: false,
    finalQueue: null,
  };
  if(!campaignId || !expectedCount) return result;

  const start = Date.now();
  const pollIv = 2500; /* poll every 2.5s — bridge sends 1 msg / 6-12s typically */

  while(Date.now() - start < timeoutMs){
    await new Promise(r => setTimeout(r, pollIv));
    try {
      const act = await bridge.activity(url, token, 200);
      const mine = (act.activity || []).filter(a => a.campaignId === campaignId);
      result.activities = mine;
      result.sent     = mine.filter(a => a.status === "sent").length;
      result.failed   = mine.filter(a => a.status === "failed").length;
      result.skipped  = mine.filter(a => a.status === "skipped").length;
      result.pending  = Math.max(0, expectedCount - result.sent - result.failed - result.skipped);

      /* All accounted for? exit early */
      if(result.pending === 0) return result;
    } catch(_){
      /* activity fetch failed once — retry next tick */
    }
  }

  /* Timeout — return what we have plus a final queue snapshot for context */
  result.timedOut = true;
  try {
    const q = await bridge.queue(url, token);
    result.finalQueue = q;
  } catch(_){}
  return result;
}
