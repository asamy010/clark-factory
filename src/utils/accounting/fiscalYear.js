/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · Fiscal Year (V18.66)
   ───────────────────────────────────────────────────────────────────────
   Manages fiscal year configuration. By default, the fiscal year starts
   on January 1 and ends on December 31. Some businesses use a different
   start (e.g. July 1 for the old Egyptian fiscal year, or April 1).

   Storage:
     data.fiscalYear = { startMonth: 1, startDay: 1 }   // 1=Jan, 12=Dec

   Public API:
     getFiscalYearConfig(data)                     → {startMonth, startDay}
     setFiscalYearConfig(d, cfg)                   → mutator
     getFiscalYearForDate(dateStr, fyConfig)       → {label, start, end, year}
     getCurrentFiscalYear(data)                    → FY containing today
     getPreviousFiscalYear(data)                   → FY before current
     getFiscalYearOptions(data)                    → suggestions for picker
   ═══════════════════════════════════════════════════════════════════════ */

const DEFAULT_FY = { startMonth: 1, startDay: 1 };

function pad2(n){ return String(n).padStart(2, "0"); }
function fmtDate(y, m, d){ return `${y}-${pad2(m)}-${pad2(d)}`; }
function addDays(dateStr, days){
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

/* Validate config — reject malformed values gracefully */
function _normalize(cfg){
  if(!cfg || typeof cfg !== "object") return DEFAULT_FY;
  const m = Number(cfg.startMonth);
  const d = Number(cfg.startDay);
  if(!Number.isInteger(m) || m < 1 || m > 12) return DEFAULT_FY;
  if(!Number.isInteger(d) || d < 1 || d > 28) return DEFAULT_FY;
  return { startMonth: m, startDay: d };
}

export function getFiscalYearConfig(data){
  return _normalize(data?.fiscalYear);
}

/* Mutator — pass into upConfig */
export function setFiscalYearConfig(d, cfg){
  d.fiscalYear = _normalize(cfg);
}

/* Returns the fiscal year that CONTAINS the given date.
   - If FY starts Jan 1 (default): calendar year IS the fiscal year.
       2026-04-15 → {label: "2026", start: "2026-01-01", end: "2026-12-31"}
   - If FY starts July 1:
       2026-04-15 → falls in FY that started 2025-07-01, ends 2026-06-30
       2026-08-15 → falls in FY that started 2026-07-01, ends 2027-06-30
   - Returns label as "YYYY" for Jan-1 starts, "YYYY/YYYY+1" otherwise. */
export function getFiscalYearForDate(dateStr, fyConfig){
  const cfg = _normalize(fyConfig);
  const date = new Date(dateStr + "T00:00:00");
  const m = date.getMonth() + 1;
  const day = date.getDate();
  const y = date.getFullYear();

  /* Calendar-year FY (most common in Egypt now) */
  if(cfg.startMonth === 1 && cfg.startDay === 1){
    return {
      year: y,
      label: String(y),
      start: fmtDate(y, 1, 1),
      end: fmtDate(y, 12, 31),
      isCalendar: true,
    };
  }

  /* Non-calendar FY */
  const isAfterStart = (m > cfg.startMonth) || (m === cfg.startMonth && day >= cfg.startDay);
  const fyStartYear = isAfterStart ? y : y - 1;
  const start = fmtDate(fyStartYear, cfg.startMonth, cfg.startDay);
  /* End = day before next FY's start */
  const nextStart = fmtDate(fyStartYear + 1, cfg.startMonth, cfg.startDay);
  const end = addDays(nextStart, -1);
  return {
    year: fyStartYear,
    label: `${fyStartYear}/${fyStartYear + 1}`,
    start, end,
    isCalendar: false,
  };
}

export function getCurrentFiscalYear(data){
  const today = new Date().toISOString().split("T")[0];
  return getFiscalYearForDate(today, getFiscalYearConfig(data));
}

export function getPreviousFiscalYear(data){
  const cur = getCurrentFiscalYear(data);
  /* Take the day before current FY start, find its FY */
  const dayBefore = addDays(cur.start, -1);
  return getFiscalYearForDate(dayBefore, getFiscalYearConfig(data));
}

/* Common suggestions for the wizard period picker */
export function getFiscalYearOptions(data){
  const cur = getCurrentFiscalYear(data);
  const prev = getPreviousFiscalYear(data);
  return {
    current: cur,
    previous: prev,
  };
}

/* Human-readable label for the FY config (for settings card) */
export function describeFiscalYear(fyConfig){
  const cfg = _normalize(fyConfig);
  if(cfg.startMonth === 1 && cfg.startDay === 1){
    return "السنة الميلادية (1 يناير → 31 ديسمبر)";
  }
  const months = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  return `${cfg.startDay} ${months[cfg.startMonth-1]} → ${cfg.startDay-1 || 30} ${months[(cfg.startMonth-1+11)%12]}`;
}
