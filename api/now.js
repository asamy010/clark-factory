/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Server-time endpoint (V19.76.4)
   ───────────────────────────────────────────────────────────────────────
   GET /api/now
   Returns the current server time + Cairo wall-clock time + Cairo date.

   Why: many client computers have wrong system clocks (timezone mis-set,
   battery-drained CMOS, NTP disabled). When those wrong times get baked
   into createdAt fields and WhatsApp message timestamps, the data is
   forever offset and customer-facing dates are nonsense.

   The fix: clients fetch this on boot, compute (server - local) skew, and
   apply it to every nowMs()/nowDate()/nowISO() call. Vercel servers are
   reliably NTP-synced, so this is a trustworthy reference.

   Response shape:
     {
       now:      "2026-05-06T17:30:45.123Z",  // server UTC ISO
       nowMs:    1746559845123,                // server UTC epoch ms
       cairo:    "2026-05-06 19:30:45",        // wall-clock in Africa/Cairo
       cairoDate:"2026-05-06"                  // YYYY-MM-DD in Africa/Cairo
     }

   No auth required (read-only, no sensitive data).
   ═══════════════════════════════════════════════════════════════════════ */

const TZ = "Africa/Cairo";

function pad2(n){ return String(n).padStart(2, "0"); }

/* Render a Date as YYYY-MM-DD HH:MM:SS in the given IANA tz, without DST math
   tricks — uses Intl with explicit options (works on Vercel's Node runtime). */
function formatInTz(d, tz){
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  /* Some hour=24 edge case in older Node — normalize */
  const h = map.hour === "24" ? "00" : map.hour;
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    time: `${h}:${map.minute}:${map.second}`,
  };
}

export default function handler(req, res){
  if (req.method !== "GET" && req.method !== "HEAD") {
    return res.status(405).json({ ok: false, error: "GET only" });
  }
  /* CORS: allow same-origin clients (Vercel deploys all use same origin, but
     custom domains via Caddy/Cloudflare benefit from this). */
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  const now = new Date();
  const cairo = formatInTz(now, TZ);
  return res.status(200).json({
    ok: true,
    now: now.toISOString(),
    nowMs: now.getTime(),
    cairo: `${cairo.date} ${cairo.time}`,
    cairoDate: cairo.date,
    tz: TZ,
  });
}
