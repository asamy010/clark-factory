/* ═══════════════════════════════════════════════════════════════
   CLARK V21.9.257 — Manual Scheduled Reminders generator (pure)
   ───────────────────────────────────────────────────────────────
   Materializes SIDE-PANEL notifications from user-defined reminder rules
   (cfg.reminderRules). Client-side, on app boot, for the CURRENT user.
   Reuses the existing notification system (notificationsDays + the side
   panel) — generated reminders are indistinguishable from manual notifs.
   NO external/web push.

   Recurrence math is delegated to src/utils/recurring.js (getAllDueDatesBetween)
   — we do NOT reinvent it. The "once" pattern is handled here (single date).

   Deterministic id: `rem_<ruleId>_<dueDateISO>_<recipientEmail>` — so the
   split-collection transactional merge dedups across devices (same principle
   as the V21.9.249/250/254 id schemes). lastGeneratedDate is intentionally
   NOT used for correctness (it conflicts with per-user generation of
   multi-target / "all" rules); dedup is by id + a bounded lookback window.

   computeReminderActions(...) → { toCreate: [notif...] }
   ═══════════════════════════════════════════════════════════════ */

import { getAllDueDatesBetween } from "./recurring.js";

const _MS_PER_DAY = 86400000;

function _isoDaysAgo(todayIso, n){
  const t = new Date(todayIso + "T00:00:00Z").getTime();
  if(isNaN(t)) return todayIso;
  return new Date(t - n * _MS_PER_DAY).toISOString().slice(0, 10);
}

/* expiresAt = end of (dueDate + keepDays). Keeps the panel from accumulating
   stale reminders forever — the existing filter hides expired notifs. */
function _expiryFor(dueIso, keepDays){
  const t = new Date(dueIso + "T00:00:00Z").getTime();
  if(isNaN(t)) return null;
  const d = new Date(t + keepDays * _MS_PER_DAY);
  d.setUTCHours(23, 59, 59, 999);
  return d.toISOString();
}

export function computeReminderActions({ rules, notifications, userEmail, today, lookbackDays = 7, keepDays = 7 }){
  const out = { toCreate: [] };
  if(!userEmail) return out;
  const todayStr = String(today || "").slice(0, 10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(todayStr)) return out;

  const notifs = Array.isArray(notifications) ? notifications : [];
  const existingIds = new Set(notifs.map(n => n && String(n.id)));
  const nowTs = new Date().toISOString();
  const windowStart = _isoDaysAgo(todayStr, Math.max(0, lookbackDays));

  for(const rule of (Array.isArray(rules) ? rules : [])){
    if(!rule || rule.active === false) continue;
    /* eligibility: targeted at me OR "all" */
    const targets = rule.targets;
    const targeted = targets === "all"
      || (Array.isArray(targets) && targets.includes(userEmail));
    if(!targeted) continue;

    const start = String(rule.startDate || "").slice(0, 10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(start)) continue;
    const end = rule.endDate ? String(rule.endDate).slice(0, 10) : null;

    /* Compute due occurrences within the bounded window. */
    let dueDates = [];
    if(rule.pattern === "once"){
      /* fires once on/after its startDate (single notif, deduped by id) */
      if(start <= todayStr && (!end || start <= end)) dueDates = [start];
    } else {
      const from = start > windowStart ? start : windowStart;
      dueDates = getAllDueDatesBetween(rule, from, todayStr) || [];
    }
    if(dueDates.length === 0) continue;

    const notifType = rule.notifType === "task" ? "مهمة" : "تذكير";
    for(const dd of dueDates){
      const id = `rem_${rule.id}_${dd}_${userEmail}`;
      if(existingIds.has(id)) continue;
      existingIds.add(id);
      out.toCreate.push({
        id,
        toEmail: userEmail,
        toName: userEmail.split("@")[0],
        msg: rule.title || "تذكير",
        type: notifType,
        fromName: rule.createdByName || "تذكير مجدول",
        fromEmail: "reminder",
        createdAt: dd,
        createdAtTs: nowTs,
        expiresAt: _expiryFor(dd, Math.max(0, keepDays)),
        endedAt: null,
        endedBy: null,
        ...(rule.link ? { link: rule.link } : {}),
        reminderRuleId: rule.id,
      });
    }
  }

  return out;
}
