/* ═══════════════════════════════════════════════════════════════
   GET /api/notifications/analytics
   V21.9.180 (Slice 13/14)
   ───────────────────────────────────────────────────────────────
   Aggregated stats about the push notification system. Read-only,
   admin/manager-only. Powers the admin dashboard widget that shows:
   - Total active subscriptions (and by role / device type)
   - Notifications sent in last N days (counts + delivery rate)
   - Top categories by volume
   - Failed delivery rate by day (helps spot Bridge / FCM issues)

   Query params:
     ?days=7    (default 7, max 90)

   Response:
     {
       ok: true,
       generatedAt,
       subscriptions: {
         total, active, byRole, byOs, byBrowser, byType,
       },
       deliveries: {
         windowDays,
         total, success, failed, invalidTokens,
         byCategory: { [cat]: { count, success, failed } },
         byDay: [{ date, count, success, failed }],
       },
     }
   ═══════════════════════════════════════════════════════════════ */

import { setCors, verifyAdminToken, getDb } from "../_firebase.js";

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const auth = await verifyAdminToken(req.headers.authorization);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

  const daysParam = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 7));
  const db = getDb();

  /* ─── Subscriptions stats ─── */
  let total = 0, active = 0;
  const byRole = {}, byOs = {}, byBrowser = {}, byType = {};
  try {
    const snap = await db.collection("notificationSubscriptions").get();
    snap.forEach(d => {
      const s = d.data() || {};
      total++;
      if (s.active) active++;
      const role = s.role || "viewer";
      byRole[role] = (byRole[role] || 0) + 1;
      const dev = s.device || {};
      if (dev.os) byOs[dev.os] = (byOs[dev.os] || 0) + 1;
      if (dev.browser) byBrowser[dev.browser] = (byBrowser[dev.browser] || 0) + 1;
      if (dev.type) byType[dev.type] = (byType[dev.type] || 0) + 1;
    });
  } catch (_) { /* fail-safe to zeros */ }

  /* ─── Deliveries stats over the window ─── */
  const windowMs = daysParam * 24 * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - windowMs).toISOString();

  let dTotal = 0, dSuccess = 0, dFailed = 0, dInvalid = 0;
  const byCategory = {};
  const byDay = {};

  try {
    const histSnap = await db.collection("notificationHistory")
      .where("at", ">=", cutoff)
      .get();

    histSnap.forEach(d => {
      const h = d.data() || {};
      const stats = h.stats || {};
      const targeted = Number(stats.targeted) || 0;
      const success = Number(stats.successCount) || 0;
      const failed = Number(stats.failureCount) || 0;
      const invalid = Number(stats.invalidTokenCount) || 0;

      dTotal += targeted;
      dSuccess += success;
      dFailed += failed;
      dInvalid += invalid;

      const cat = h.category || "unknown";
      if (!byCategory[cat]) byCategory[cat] = { count: 0, targeted: 0, success: 0, failed: 0 };
      byCategory[cat].count++;
      byCategory[cat].targeted += targeted;
      byCategory[cat].success += success;
      byCategory[cat].failed += failed;

      const day = String(h.at || "").slice(0, 10);
      if (day) {
        if (!byDay[day]) byDay[day] = { date: day, count: 0, targeted: 0, success: 0, failed: 0 };
        byDay[day].count++;
        byDay[day].targeted += targeted;
        byDay[day].success += success;
        byDay[day].failed += failed;
      }
    });
  } catch (_) { /* fail-safe to zeros */ }

  const byDayArr = Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date));

  return res.status(200).json({
    ok: true,
    generatedAt: new Date().toISOString(),
    subscriptions: {
      total, active,
      byRole, byOs, byBrowser, byType,
    },
    deliveries: {
      windowDays: daysParam,
      total: dTotal,
      success: dSuccess,
      failed: dFailed,
      invalidTokens: dInvalid,
      successRate: dTotal > 0 ? Math.round((dSuccess / dTotal) * 100) : 0,
      byCategory,
      byDay: byDayArr,
    },
  });
}
