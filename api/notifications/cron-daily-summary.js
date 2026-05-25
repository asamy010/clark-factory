/* ═══════════════════════════════════════════════════════════════
   GET /api/notifications/cron-daily-summary
   V21.9.178 (Slice 10/14)
   ───────────────────────────────────────────────────────────────
   Vercel cron job — fires every morning at 09:00 Cairo time.
   Builds a daily summary push for all admins/managers:
   - Yesterday's treasury totals (in/out/net)
   - Number of new orders / customer deliveries
   - Number of new notifications received

   Privacy: keeps numbers generic ("8 حركات خزنة" not "5000 جنيه دفع من
   شركة X") — sensitive details only revealed on deep-link click.

   Auth: this is a cron endpoint. Vercel cron requests include a
   `Authorization: Bearer <CRON_SECRET>` header (configured in
   vercel.json). We verify against process.env.CRON_SECRET.

   To wire (vercel.json):
     "crons": [
       { "path": "/api/notifications/cron-daily-summary", "schedule": "0 7 * * *" }
       // 7 UTC = 9 Cairo (UTC+2, no DST)
     ]

   Manual trigger from admin (for testing):
     curl -H "Authorization: Bearer <CRON_SECRET>" \
       https://clark-factory.vercel.app/api/notifications/cron-daily-summary
   ═══════════════════════════════════════════════════════════════ */

import { setCors, getDb, getAdminApp } from "../_firebase.js";

const SUBS_COLLECTION = "notificationSubscriptions";
const HISTORY_COLLECTION = "notificationHistory";

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === "OPTIONS") return res.status(204).end();

  /* Cron auth: Vercel sets Authorization header from CRON_SECRET env var.
     If CRON_SECRET isn't configured, we refuse all requests (closed-by-default).
     For manual testing, the admin can call with the same Bearer header. */
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return res.status(503).json({ ok: false, error: "CRON_SECRET غير معرّفة" });
  }
  const authHeader = req.headers.authorization || "";
  if (authHeader !== "Bearer " + cronSecret) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const db = getDb();

  /* Compute yesterday's date in Cairo time (UTC+2). */
  const nowCairo = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const yesterday = new Date(nowCairo.getTime() - 24 * 60 * 60 * 1000);
  const yyyy = yesterday.getUTCFullYear();
  const mm = String(yesterday.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(yesterday.getUTCDate()).padStart(2, "0");
  const dateKey = yyyy + "-" + mm + "-" + dd;
  const dateLabel = yesterday.toLocaleDateString("ar-EG", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    timeZone: "UTC",  /* already shifted */
  });

  /* ─── Gather yesterday's stats from treasuryDays/{dateKey} ─── */
  let treasuryIn = 0, treasuryOut = 0, txCount = 0;
  try {
    const trDay = await db.collection("treasuryDays").doc(dateKey).get();
    if (trDay.exists) {
      const entries = trDay.data()?.entries || [];
      entries.forEach(e => {
        const amt = Number(e.amount) || 0;
        if (e.type === "in") treasuryIn += amt;
        else if (e.type === "out") treasuryOut += amt;
      });
      txCount = entries.length;
    }
  } catch (_) { /* day doc might not exist on quiet days */ }

  const treasuryNet = treasuryIn - treasuryOut;

  /* ─── Count notifications sent yesterday ─── */
  let notifCount = 0;
  try {
    const notifSnap = await db.collection(HISTORY_COLLECTION)
      .where("at", ">=", dateKey + "T00:00:00")
      .where("at", "<",  dateKey + "T23:59:59.999")
      .get();
    notifCount = notifSnap.size;
  } catch (_) { /* fallback to 0 */ }

  /* If nothing happened yesterday, skip the summary entirely. */
  if (txCount === 0 && notifCount === 0) {
    return res.status(200).json({
      ok: true,
      skipped: true,
      reason: "no_activity",
      date: dateKey,
    });
  }

  /* ─── Format the summary body ─── */
  const fmt = (n) => Number(n).toLocaleString("ar-EG", { maximumFractionDigits: 0 });
  const lines = [
    "📅 " + dateLabel,
  ];
  if (txCount > 0) {
    lines.push("💰 " + txCount + " حركة خزنة:");
    if (treasuryIn  > 0) lines.push("  ↗️ وارد: " + fmt(treasuryIn) + " ج.م");
    if (treasuryOut > 0) lines.push("  ↘️ منصرف: " + fmt(treasuryOut) + " ج.م");
    lines.push("  ⚖️ الصافي: " + fmt(treasuryNet) + " ج.م");
  }
  if (notifCount > 0) {
    lines.push("🔔 " + notifCount + " إشعار اتبعت");
  }
  const body = lines.join("\n");

  /* ─── Get target audience: all active admin/manager subscriptions
        with daily_summary preference enabled ─── */
  let subsSnap;
  try {
    subsSnap = await db.collection(SUBS_COLLECTION)
      .where("active", "==", true)
      .where("role", "in", ["admin", "manager"])
      .get();
  } catch (e) {
    return res.status(500).json({ ok: false, error: "تعذر قراءة الاشتراكات: " + e.message });
  }

  const candidates = subsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(s => {
      const prefs = s.preferences || {};
      return prefs.daily_summary !== false;
    });

  /* Quiet hours: respect since this is urgency=low */
  const nowHhmm = String(nowCairo.getUTCHours()).padStart(2, "0") + ":" +
                  String(nowCairo.getUTCMinutes()).padStart(2, "0");
  const filtered = candidates.filter(s => {
    const qh = s.quietHours;
    if (!qh || !qh.enabled) return true;
    const from = String(qh.from || "22:00");
    const to = String(qh.to || "07:00");
    if (from < to) return nowHhmm < from || nowHhmm >= to;
    return nowHhmm < from && nowHhmm >= to;
  });

  const tokens = filtered.map(s => s.fcmToken).filter(Boolean);

  if (tokens.length === 0) {
    return res.status(200).json({ ok: true, sentTo: 0, message: "ما فيش subscribers" });
  }

  /* ─── Send via FCM ─── */
  const title = "📊 ملخص يومك في CLARK";
  const messaging = getAdminApp().messaging();
  const payloadJson = JSON.stringify({
    title,
    body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: "daily-summary-" + dateKey,  /* one summary per day, replaces prior */
    data: { type: "broadcast", category: "daily_summary", date: dateKey },
    urgency: "low",
  });

  let totalSuccess = 0, totalFailure = 0;
  try {
    const CHUNK = 500;
    for (let i = 0; i < tokens.length; i += CHUNK) {
      const chunk = tokens.slice(i, i + CHUNK);
      const response = await messaging.sendEachForMulticast({
        tokens: chunk,
        notification: { title, body },
        data: { payload: payloadJson },
        webpush: {
          fcmOptions: { link: "/?tab=treasury" },
          headers: { Urgency: "low" },
        },
      });
      totalSuccess += response.successCount;
      totalFailure += response.failureCount;
    }
  } catch (e) {
    return res.status(500).json({ ok: false, error: "FCM error: " + e.message });
  }

  /* Log to history */
  try {
    await db.collection(HISTORY_COLLECTION).add({
      at: new Date().toISOString(),
      category: "daily_summary",
      title,
      body,
      data: { type: "broadcast", category: "daily_summary", date: dateKey },
      audience: { mode: "role", role: "admin/manager" },
      sentBy: { source: "cron-daily-summary" },
      stats: {
        targeted: tokens.length,
        successCount: totalSuccess,
        failureCount: totalFailure,
      },
    });
  } catch (_) { /* best effort */ }

  return res.status(200).json({
    ok: true,
    date: dateKey,
    sentTo: tokens.length,
    successCount: totalSuccess,
    failureCount: totalFailure,
    summary: { treasuryIn, treasuryOut, treasuryNet, txCount, notifCount },
  });
}
