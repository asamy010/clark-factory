/* ════════════════════════════════════════════════════════════════════════
   AI AGENT — Manual takeover helpers   (V21.9.235)
   ════════════════════════════════════════════════════════════════════════
   Manual takeover ("التدخّل اليدوي") lets an admin grab a single WhatsApp
   conversation away from the agent: while a wid is "taken over", incoming.js
   stays SILENT (the human handles the chat) and the admin sends replies via
   api/ai-agent/admin-reply.js.

   State lives in ONE doc per wid: aiAgentTakeovers/{takeoverDocId(wid)} =
     { wid, phone, customerName, customerId,
       active:bool,                 // true = agent muted, admin in control
       takenOverBy, takenOverAt,    // who/when grabbed it
       lastAdminReplyAt,            // restarts the idle auto-resume timer
       resumedBy, resumedAt,        // explicit resume
       autoResumedAt,               // idle auto-resume (written by the gate)
       updatedAt }

   ALL writes go through the admin-SDK endpoints (set-takeover / admin-reply);
   the client only READS this collection (firestore.rules: read isManagerPlus,
   write:false). The gate in incoming.js reads it on every otherwise-eligible
   message.

   Auto-resume: a takeover that's been idle longer than the configured window
   (agent.takeover.autoResumeHours, default 24h) is treated as inactive, so a
   forgotten takeover never mutes a customer forever.
   ════════════════════════════════════════════════════════════════════════ */

const DEFAULT_AUTO_RESUME_HOURS = 24;

/* Firestore doc-id from a wid. WhatsApp wids ("201xxxxxxxxx@c.us" / "xxx@lid")
   are already valid ids (no "/"), but sanitize defensively: doc ids can't
   contain "/" and are capped well under the 1500-byte limit. */
export function takeoverDocId(wid) {
  const safe = String(wid || "").replace(/\//g, "_").trim();
  return safe.slice(0, 200) || "_unknown";
}

/* Idle window in ms before an active takeover auto-resumes. */
export function autoResumeMs(agent) {
  const h = Number(agent && agent.takeover && agent.takeover.autoResumeHours);
  const hours = Number.isFinite(h) && h > 0 ? h : DEFAULT_AUTO_RESUME_HOURS;
  return hours * 60 * 60 * 1000;
}

/* True when the agent should stay SILENT for this wid: the takeover is flagged
   active AND its last activity is within the idle window. `nowMs` is injected
   for testability. Fail-safe: an active takeover with no parseable timestamp
   is treated as active (respect the explicit pause rather than wrongly
   re-engaging a customer mid human-handling). */
export function isTakeoverActive(to, agent, nowMs) {
  if (!to || to.active !== true) return false;
  const now = Number(nowMs) || Date.now();
  const last = Date.parse(to.lastAdminReplyAt || to.takenOverAt || to.updatedAt || "");
  if (!last) return true;
  return (now - last) <= autoResumeMs(agent);
}
