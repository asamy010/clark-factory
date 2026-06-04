/* ════════════════════════════════════════════════════════════════════════
   AI AGENT — Schedule enforcement   (V21.9.238)
   ════════════════════════════════════════════════════════════════════════
   The ScheduleTab UI already lets the admin configure WHEN the agent answers
   (per-day on/off + from/to windows + holidays, in Africa/Cairo), but the
   backend only ever honored mode==="off". This makes the gate honor the full
   schedule.

   config.aiAgent.schedule = {
     mode: "specific" | "24x7" | "off",
     timezone: "Africa/Cairo",
     days: { sat:{enabled,from:"HH:MM",to:"HH:MM"}, sun:{...}, ... fri:{...} },
     holidays: [{ from:"YYYY-MM-DD", to:"YYYY-MM-DD", name }],
     offHoursMessage, offHoursBehavior: "answer_anyway"|"say_we_reply"|"escalate_all"
   }

   isWithinSchedule() answers "is NOW inside an enabled working window?" for
   mode==="specific". Handles overnight windows (from > to, e.g. 20:00→10:00)
   including the spillover into the next morning, and holidays. All times are
   evaluated in Africa/Cairo regardless of the server/viewer timezone.
   ════════════════════════════════════════════════════════════════════════ */

const TZ = "Africa/Cairo";

/* Cairo date-key + weekday + minute-of-day for an epoch ms. */
function cairoParts(ms) {
  const d = new Date(ms);
  const dateKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d); /* YYYY-MM-DD */
  const dow = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" })
    .format(d).toLowerCase().slice(0, 3); /* sat|sun|mon|tue|wed|thu|fri */
  const hm = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d); /* "HH:MM" (00–23) */
  const [hh, mm] = hm.split(":").map(Number);
  return { dateKey, dow, minutes: (hh * 60 + mm) };
}

function parseHM(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || "").trim());
  if (!m) return null;
  const min = (+m[1]) * 60 + (+m[2]);
  return (min >= 0 && min <= 24 * 60) ? min : null;
}

function inHoliday(dateKey, holidays) {
  if (!Array.isArray(holidays)) return false;
  return holidays.some((h) => h && h.from && dateKey >= h.from && dateKey <= (h.to || h.from));
}

/* True when `nowMs` falls inside an enabled day-window (and not a holiday). */
export function isWithinSchedule(schedule, nowMs) {
  const now = Number(nowMs) || Date.now();
  const days = (schedule && schedule.days) || {};
  const cur = cairoParts(now);
  if (inHoliday(cur.dateKey, schedule && schedule.holidays)) return false;

  /* Today's window. */
  const today = days[cur.dow];
  if (today && today.enabled) {
    const f = parseHM(today.from), t = parseHM(today.to);
    if (f != null && t != null) {
      if (f <= t) { if (cur.minutes >= f && cur.minutes < t) return true; }
      else        { if (cur.minutes >= f) return true; } /* overnight tail [f, 24:00) */
    }
  }

  /* Spillover from yesterday's overnight window into this morning [00:00, t). */
  const y = cairoParts(now - 24 * 60 * 60 * 1000);
  const yday = days[y.dow];
  if (yday && yday.enabled) {
    const f = parseHM(yday.from), t = parseHM(yday.to);
    if (f != null && t != null && f > t && cur.minutes < t) return true;
  }

  return false;
}
