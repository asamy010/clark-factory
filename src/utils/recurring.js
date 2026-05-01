/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Recurring Treasury (V18.56)
   ───────────────────────────────────────────────────────────────────────
   Helpers for managing recurring (scheduled) treasury transactions.
   Recurrence patterns: daily / weekly / monthly.

   Schema:
     data.recurringTreasury = [{
       id, name, type:"in"|"out", amount, category, account, description, notes,
       partyId?, partyType?,
       pattern: "daily"|"weekly"|"monthly",
       dayOfMonth?: 1-28,    // for monthly
       dayOfWeek?: 0-6,      // for weekly (0=Sun, 6=Sat)
       startDate, endDate?,
       active: true,
       lastGeneratedDate?: "YYYY-MM-DD",
       generatedTxIds: [],
       createdAt, createdBy,
     }]

   Public API:
     getNextDueDate(rule, asOfDate) → "YYYY-MM-DD" | null
     getAllDueDatesBetween(rule, fromDate, toDate) → ["YYYY-MM-DD", ...]
     calculatePending(rules, todayDate) → [{rule, dueDates: [...]}]
     buildTxFromRule(rule, dueDate, userName) → tx object
   ═══════════════════════════════════════════════════════════════════════ */

const _MS_PER_DAY = 86400000;

function _parseDate(s){
  if(!s) return null;
  const d = new Date(s + "T00:00:00Z");
  return isNaN(d.getTime()) ? null : d;
}
function _toIso(d){
  return d.toISOString().split("T")[0];
}
function _addDays(date, n){
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}
function _addMonths(date, n){
  const d = new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() + n);
  return d;
}

/* Compute the next due date for a rule, on or after `from`.
   Returns null if rule is inactive, expired, or has no future occurrence. */
export function getNextDueDate(rule, fromDate){
  if(!rule || rule.active === false) return null;
  const start = _parseDate(rule.startDate);
  const end   = rule.endDate ? _parseDate(rule.endDate) : null;
  if(!start) return null;
  let from = _parseDate(fromDate) || start;
  if(from < start) from = start;

  let candidate;
  if(rule.pattern === "daily"){
    candidate = from;
  } else if(rule.pattern === "weekly"){
    const targetDow = Number(rule.dayOfWeek) || 0;
    const fromDow = from.getUTCDay();
    const diff = (targetDow - fromDow + 7) % 7;
    candidate = _addDays(from, diff);
  } else if(rule.pattern === "monthly"){
    const targetDom = Math.min(Math.max(Number(rule.dayOfMonth) || 1, 1), 28);
    candidate = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), targetDom));
    if(candidate < from){
      candidate = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, targetDom));
    }
  } else {
    return null;
  }
  if(end && candidate > end) return null;
  return _toIso(candidate);
}

/* Get all due dates between fromDate (inclusive) and toDate (inclusive). */
export function getAllDueDatesBetween(rule, fromDate, toDate){
  if(!rule || rule.active === false) return [];
  const out = [];
  const toD = _parseDate(toDate);
  if(!toD) return [];
  let cursor = fromDate;
  let safety = 5000;/* prevent infinite loop */
  while(safety-- > 0){
    const next = getNextDueDate(rule, cursor);
    if(!next) break;
    if(_parseDate(next) > toD) break;
    out.push(next);
    /* advance cursor by 1 day past the matched date */
    cursor = _toIso(_addDays(_parseDate(next), 1));
  }
  return out;
}

/* For a list of rules, return pending instances that should be generated
   between (lastGeneratedDate or startDate) and today.
   Output: [{rule, dueDates: [...]}] — only rules with at least 1 due date. */
export function calculatePending(rules, todayIsoDate){
  const out = [];
  (rules || []).forEach(rule => {
    if(!rule || rule.active === false) return;
    /* Cursor starts day AFTER lastGeneratedDate, or at startDate */
    let cursorIso;
    if(rule.lastGeneratedDate){
      const last = _parseDate(rule.lastGeneratedDate);
      if(!last) return;
      cursorIso = _toIso(_addDays(last, 1));
    } else {
      cursorIso = rule.startDate;
    }
    const dueDates = getAllDueDatesBetween(rule, cursorIso, todayIsoDate);
    if(dueDates.length > 0){
      out.push({ rule, dueDates });
    }
  });
  return out;
}

/* Build a treasury transaction object from a rule + due date.
   The caller is responsible for inserting it into data.treasury and
   firing the autoPost. */
export function buildTxFromRule(rule, dueDate, userName){
  const txId = "rec_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
  return {
    id: txId,
    type: rule.type || "out",
    amount: Number(rule.amount) || 0,
    desc: rule.description || rule.name || "",
    notes: rule.notes || "",
    category: rule.category || "",
    account: rule.account || "MAIN CASH",
    season: "",
    date: dueDate,
    day: new Date(dueDate + "T00:00:00Z").toLocaleDateString("ar-EG", {weekday:"long"}),
    custId:     rule.partyType === "customer"  ? rule.partyId : "",
    supplierId: rule.partyType === "supplier"  ? rule.partyId : "",
    empId:      rule.partyType === "employee"  ? rule.partyId : "",
    by: userName || "",
    createdAt: new Date().toISOString(),
    /* V18.56: Tag the source so it shows in the UI */
    recurringRuleId: rule.id,
    recurringRuleName: rule.name,
  };
}

/* Format helpers for UI */
export function describeRecurrence(rule){
  if(!rule) return "";
  if(rule.pattern === "daily") return "يومياً";
  if(rule.pattern === "weekly"){
    const days = ["الأحد","الإثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
    return "أسبوعياً يوم " + (days[rule.dayOfWeek] || "—");
  }
  if(rule.pattern === "monthly"){
    return "شهرياً يوم " + (rule.dayOfMonth || 1);
  }
  return "";
}
