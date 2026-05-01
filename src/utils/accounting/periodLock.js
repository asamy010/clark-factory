/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · Period Lock (V18.54)
   ───────────────────────────────────────────────────────────────────────
   Unified helper for checking whether a given date is locked from posting
   journal entries. Two sources of locking:

     1. data.lockedDays[]    — array of "YYYY-MM-DD" strings (individual days)
     2. data.closedPeriods[] — array of {fromDate, toDate, reversedAt?}
                               If reversedAt is set, the period is no longer locked.

   Public API:
     isDateLocked(date, data) → boolean
     getLockReason(date, data) → string (Arabic, for UI display)
     canBypassLock(user, data) → boolean (admin only)
     getActiveLockForDate(date, data) → {type:"day"|"period", info} | null
   ═══════════════════════════════════════════════════════════════════════ */

/* Returns true if the date falls within any active locked range. */
export function isDateLocked(date, data){
  if(!date || !data) return false;
  /* 1. Check explicit locked days */
  const lockedDays = Array.isArray(data.lockedDays) ? data.lockedDays : [];
  if(lockedDays.includes(date)) return true;
  /* 2. Check closed periods (skip reversed ones) */
  const closedPeriods = Array.isArray(data.closedPeriods) ? data.closedPeriods : [];
  for(const p of closedPeriods){
    if(p.reversedAt) continue;
    if(p.fromDate && p.toDate && date >= p.fromDate && date <= p.toDate){
      return true;
    }
  }
  return false;
}

/* Returns a structured lock info object or null if not locked. */
export function getActiveLockForDate(date, data){
  if(!date || !data) return null;
  const lockedDays = Array.isArray(data.lockedDays) ? data.lockedDays : [];
  if(lockedDays.includes(date)){
    return { type: "day", date };
  }
  const closedPeriods = Array.isArray(data.closedPeriods) ? data.closedPeriods : [];
  for(const p of closedPeriods){
    if(p.reversedAt) continue;
    if(p.fromDate && p.toDate && date >= p.fromDate && date <= p.toDate){
      return { type: "period", period: p };
    }
  }
  return null;
}

/* Arabic reason text for UI. */
export function getLockReason(date, data){
  const lock = getActiveLockForDate(date, data);
  if(!lock) return null;
  if(lock.type === "day"){
    return "اليوم " + date + " مقفل (lockedDays) — للمدير فقط";
  }
  /* period */
  const p = lock.period;
  return "الفترة من " + p.fromDate + " إلى " + p.toDate + " مُقفَلة محاسبياً" +
    (p.closedBy ? " (أُقفلت بواسطة " + p.closedBy + ")" : "") +
    " — يجب عكس الإقفال أولاً";
}

/* Check if user has admin privileges to bypass locks.
   Admin = first user OR explicit admin flag. */
export function canBypassLock(user, data){
  if(!user) return false;
  /* Admin email match (multiple sources) */
  const adminEmails = (data && data.adminEmails) || [];
  if(adminEmails.includes(user.email)) return true;
  /* user.role === "admin" */
  if(user.role === "admin") return true;
  /* userRoles map */
  if(data && data.userRoles && data.userRoles[user.email] === "admin") return true;
  return false;
}
