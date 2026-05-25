/* ═══════════════════════════════════════════════════════════════
   POST /api/notifications/send-internal
   V21.9.172 (Phase 22d — Slice 4/14)
   ───────────────────────────────────────────────────────────────
   System-internal trigger for push notifications. Same logic as
   /send but auth via a shared secret header instead of Firebase
   admin token — for use from cron jobs (Slice 10), autoPost hooks
   (Slice 6 treasury integration), and other system events.

   Auth: X-CLARK-INTERNAL header must match CLARK_INTERNAL_SECRET
         env var.

   Body: same shape as /send.

   To rotate the secret:
     1. Generate a new random string (`openssl rand -hex 32`)
     2. Update CLARK_INTERNAL_SECRET in Vercel env vars
     3. Update any callers (cron, server-side integrations)
   ═══════════════════════════════════════════════════════════════ */

import { setCors, getDb, getAdminApp } from "../_firebase.js";

const SUBS_COLLECTION = "notificationSubscriptions";
const HISTORY_COLLECTION = "notificationHistory";

const VALID_CATEGORIES = new Set([
  "treasury", "tasks", "instructions", "warnings",
  "broadcast", "approvals", "daily_summary",
]);
const VALID_URGENCY = new Set(["low", "normal", "high"]);
const TERMINAL_FCM_ERRORS = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
  "messaging/invalid-argument",
]);

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  /* ─── Internal-secret auth ───
     Constant-time comparison via Buffer to avoid timing attacks.
     If the env var isn't configured, the endpoint refuses ALL requests
     (closed-by-default) rather than silently allowing through. */
  const provided = req.headers["x-clark-internal"];
  const expected = process.env.CLARK_INTERNAL_SECRET;
  if (!expected) {
    return res.status(503).json({
      ok: false,
      error: "CLARK_INTERNAL_SECRET غير معرّفة في إعدادات السيرفر — تواصل مع الأدمن",
    });
  }
  if (!provided || typeof provided !== "string") {
    return res.status(401).json({ ok: false, error: "X-CLARK-INTERNAL header مطلوب" });
  }
  /* Compare lengths first to prevent length-based timing leak */
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) {
    return res.status(401).json({ ok: false, error: "secret غير صالح" });
  }
  /* timingSafeEqual is in crypto but we can use a manual loop to avoid the import */
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  if (diff !== 0) {
    return res.status(401).json({ ok: false, error: "secret غير صالح" });
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  } catch (_) {
    return res.status(400).json({ ok: false, error: "JSON body غير صالح" });
  }

  const category = String(body.category || "").trim();
  if (!VALID_CATEGORIES.has(category)) {
    return res.status(400).json({ ok: false, error: "category غير صالح" });
  }

  const title = String(body.title || "").trim().slice(0, 200);
  const bodyText = String(body.body || "").trim().slice(0, 500);
  if (!title) {
    return res.status(400).json({ ok: false, error: "title مطلوب" });
  }

  const urgency = VALID_URGENCY.has(body.urgency) ? body.urgency : "normal";
  const dataPayload = (body.data && typeof body.data === "object") ? body.data : {};
  if (!dataPayload.type) dataPayload.type = category;

  const audience = body.audience && typeof body.audience === "object"
    ? body.audience
    : { mode: "all" };

  /* Caller identity for audit (internal triggers should pass triggeredBy) */
  const triggeredBy = body.triggeredBy && typeof body.triggeredBy === "object"
    ? body.triggeredBy
    : { source: "unknown" };

  const db = getDb();

  /* ─── Resolve target tokens — same logic as /send ─── */
  let query = db.collection(SUBS_COLLECTION).where("active", "==", true);
  if (audience.mode === "role") {
    if (!audience.role) return res.status(400).json({ ok: false, error: "audience.role مطلوب" });
    query = query.where("role", "==", String(audience.role));
  } else if (audience.mode === "user") {
    if (!audience.userId) return res.status(400).json({ ok: false, error: "audience.userId مطلوب" });
    query = query.where("userId", "==", String(audience.userId));
  } else if (audience.mode === "userIds") {
    if (!Array.isArray(audience.userIds) || audience.userIds.length === 0) {
      return res.status(400).json({ ok: false, error: "audience.userIds مطلوب" });
    }
    if (audience.userIds.length <= 30) {
      query = query.where("userId", "in", audience.userIds);
    }
  }

  let subsSnap;
  try {
    subsSnap = await query.get();
  } catch (e) {
    return res.status(500).json({ ok: false, error: "تعذر قراءة الاشتراكات: " + (e?.message || String(e)) });
  }

  let candidates = subsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (audience.mode === "userIds" && audience.userIds.length > 30) {
    const allowed = new Set(audience.userIds.map(String));
    candidates = candidates.filter(s => allowed.has(String(s.userId)));
  }
  candidates = candidates.filter(s => {
    const prefs = s.preferences || {};
    return prefs[category] !== false;
  });

  /* V21.9.177 (Slice 11) — Quiet hours, same logic as /send. */
  if (urgency !== "high") {
    const nowCairo = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const hhmm = String(nowCairo.getUTCHours()).padStart(2, "0") + ":" +
                 String(nowCairo.getUTCMinutes()).padStart(2, "0");
    candidates = candidates.filter(s => {
      const qh = s.quietHours;
      if (!qh || !qh.enabled) return true;
      const from = String(qh.from || "22:00");
      const to = String(qh.to || "07:00");
      if (from < to) return hhmm < from || hhmm >= to;
      return hhmm < from && hhmm >= to;
    });
  }

  if (candidates.length === 0) {
    return res.status(200).json({
      ok: true, sentTo: 0, successCount: 0, failureCount: 0,
      message: "ما فيش أجهزة مشتركة تطابق الشروط",
    });
  }

  const tokens = candidates.map(s => s.fcmToken).filter(Boolean);

  /* ─── Build + send FCM message ─── */
  const payloadJson = JSON.stringify({
    title, body: bodyText,
    icon: body.icon || "/icon-192.png",
    badge: "/icon-192.png",
    image: body.image || undefined,
    tag: body.tag || (category + "_" + Date.now()),
    data: { ...dataPayload, category, _sentAt: new Date().toISOString() },
    urgency,
  });

  const messaging = getAdminApp().messaging();
  const CHUNK = 500;
  let totalSuccess = 0;
  let totalFailure = 0;
  const invalidTokens = [];

  for (let i = 0; i < tokens.length; i += CHUNK) {
    const chunk = tokens.slice(i, i + CHUNK);
    try {
      const response = await messaging.sendEachForMulticast({
        tokens: chunk,
        notification: { title, body: bodyText },
        data: { payload: payloadJson },
        webpush: {
          fcmOptions: { link: dataPayload.url || "/" },
          headers: {
            Urgency: urgency === "high" ? "high" : (urgency === "low" ? "low" : "normal"),
          },
        },
      });
      totalSuccess += response.successCount;
      totalFailure += response.failureCount;
      response.responses.forEach((r, idx) => {
        if (!r.success && r.error) {
          const code = r.error.code || "";
          if (TERMINAL_FCM_ERRORS.has(code)) {
            invalidTokens.push(chunk[idx]);
          }
        }
      });
    } catch (e) {
      totalFailure += chunk.length;
    }
  }

  /* Auto-deactivate invalid tokens */
  if (invalidTokens.length > 0) {
    try {
      const batch = db.batch();
      const tokenSet = new Set(invalidTokens);
      candidates.filter(c => tokenSet.has(c.fcmToken)).forEach(c => {
        batch.update(db.collection(SUBS_COLLECTION).doc(c.id), {
          active: false,
          deactivatedAt: new Date().toISOString(),
          deactivatedReason: "fcm_invalid_token",
        });
      });
      await batch.commit();
    } catch (_) { /* best effort */ }
  }

  /* Log to history */
  let historyId = null;
  try {
    const histRef = await db.collection(HISTORY_COLLECTION).add({
      at: new Date().toISOString(),
      category, title, body: bodyText, data: dataPayload, audience,
      sentBy: { ...triggeredBy, role: "system" },
      stats: {
        targeted: tokens.length,
        successCount: totalSuccess,
        failureCount: totalFailure,
        invalidTokenCount: invalidTokens.length,
      },
    });
    historyId = histRef.id;
  } catch (_) { /* best effort */ }

  return res.status(200).json({
    ok: true,
    sentTo: tokens.length,
    successCount: totalSuccess,
    failureCount: totalFailure,
    invalidTokens: invalidTokens.length,
    historyId,
  });
}
