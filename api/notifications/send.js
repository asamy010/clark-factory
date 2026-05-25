/* ═══════════════════════════════════════════════════════════════
   POST /api/notifications/send
   V21.9.172 (Phase 22d — Slice 4/14)
   ───────────────────────────────────────────────────────────────
   Admin/manager-only endpoint to send a push notification to a target
   audience. Uses Firebase Admin Messaging SDK to fan-out to FCM.

   This is the FIRST endpoint that produces an actual push delivery —
   after this lands, Slice 1's SW handlers (V21.9.169) finally have
   something to handle.

   Auth: admin or manager (verifyAdminToken).
   Body:
     {
       category: "treasury" | "tasks" | "instructions" | "warnings" | "broadcast",
       title:    string,         // OS notification heading
       body:     string,         // notification body
       data:     {               // routing payload — read by SW click handler
         type?:        string,   // overrides category for click routing
         url?:         string,   // explicit destination URL
         entryId?:     string,
         taskId?:      string,
         instructionId?: string,
         target?:      string,
         broadcastId?: string,
       },
       audience: {
         mode: "all" | "role" | "user" | "userIds",
         role?:    string,       // when mode="role"
         userId?:  string,       // when mode="user"
         userIds?: string[],     // when mode="userIds"
       },
       icon?:    string,         // override notification icon
       image?:   string,         // optional banner image (Android)
       tag?:     string,         // groups same-tag notifications
       urgency?: "low" | "normal" | "high",
     }

   Response:
     {
       ok: true,
       sentTo: N,                // total tokens targeted
       successCount, failureCount,
       invalidTokens: [...],     // tokens that FCM rejected (likely
                                 // unsubscribed devices) — auto-deactivated
       historyId: string,
     }

   Privacy guard: title + body are visible on the lock screen. Server
   does NOT block sensitive content — that's the admin's responsibility.
   We DO log every send to notificationHistory for audit.
   ═══════════════════════════════════════════════════════════════ */

import { setCors, verifyAdminToken, getDb, getAdminApp } from "../_firebase.js";

const SUBS_COLLECTION = "notificationSubscriptions";
const HISTORY_COLLECTION = "notificationHistory";

const VALID_CATEGORIES = new Set([
  "treasury", "tasks", "instructions", "warnings",
  "broadcast", "approvals", "daily_summary",
]);
const VALID_URGENCY = new Set(["low", "normal", "high"]);

/* FCM error codes that mean "stop sending to this token forever" —
   we auto-deactivate these subscriptions to keep the active set clean
   and avoid wasted FCM API calls. */
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

  /* Auth — admin/manager only. */
  const auth = await verifyAdminToken(req.headers.authorization);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  } catch (_) {
    return res.status(400).json({ ok: false, error: "JSON body غير صالح" });
  }

  /* Validate inputs. */
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
  /* Default the click routing `type` to the category if not explicitly set */
  if (!dataPayload.type) dataPayload.type = category;

  const audience = body.audience && typeof body.audience === "object"
    ? body.audience
    : { mode: "all" };
  if (!["all", "role", "user", "userIds"].includes(audience.mode)) {
    return res.status(400).json({ ok: false, error: "audience.mode غير صالح" });
  }

  const db = getDb();

  /* ─── Resolve target tokens ─── */
  let query = db.collection(SUBS_COLLECTION).where("active", "==", true);

  if (audience.mode === "role") {
    if (!audience.role) return res.status(400).json({ ok: false, error: "audience.role مطلوب" });
    query = query.where("role", "==", String(audience.role));
  } else if (audience.mode === "user") {
    if (!audience.userId) return res.status(400).json({ ok: false, error: "audience.userId مطلوب" });
    query = query.where("userId", "==", String(audience.userId));
  } else if (audience.mode === "userIds") {
    if (!Array.isArray(audience.userIds) || audience.userIds.length === 0) {
      return res.status(400).json({ ok: false, error: "audience.userIds مطلوب (array غير فاضي)" });
    }
    /* Firestore `in` queries are capped at 30 values. For larger sets,
       fall back to fetching all-active and filtering in memory. */
    if (audience.userIds.length <= 30) {
      query = query.where("userId", "in", audience.userIds);
    }
    /* else: filter post-fetch below */
  }

  let subsSnap;
  try {
    subsSnap = await query.get();
  } catch (e) {
    return res.status(500).json({ ok: false, error: "تعذر قراءة الاشتراكات: " + (e?.message || String(e)) });
  }

  let candidates = subsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  /* Post-fetch filtering for large userIds sets. */
  if (audience.mode === "userIds" && audience.userIds.length > 30) {
    const allowed = new Set(audience.userIds.map(String));
    candidates = candidates.filter(s => allowed.has(String(s.userId)));
  }

  /* Apply per-user preferences — respect users who turned off this category. */
  candidates = candidates.filter(s => {
    const prefs = s.preferences || {};
    /* If category not in prefs (unknown category for that user), default to true */
    return prefs[category] !== false;
  });

  /* V21.9.177 (Slice 11) — Quiet hours enforcement.
     If the user has quietHours.enabled in their subscription, skip sending
     when the current Cairo time falls within their from-to window.
     EXCEPTION: high urgency notifications (warnings) bypass quiet hours —
     critical events must reach the user even at night. */
  if (urgency !== "high") {
    /* Cairo time HH:MM — Egypt has no DST since 2015 so UTC+02:00 is safe. */
    const nowCairo = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const hhmm = String(nowCairo.getUTCHours()).padStart(2, "0") + ":" +
                 String(nowCairo.getUTCMinutes()).padStart(2, "0");
    candidates = candidates.filter(s => {
      const qh = s.quietHours;
      if (!qh || !qh.enabled) return true;
      const from = String(qh.from || "22:00");
      const to = String(qh.to || "07:00");
      /* Window may cross midnight (22:00 → 07:00). Two cases:
         - from < to: simple range (e.g. 13:00 → 14:00 lunch break)
         - from > to: crosses midnight (e.g. 22:00 → 07:00 sleep) */
      if (from < to) {
        return hhmm < from || hhmm >= to;  /* OUTSIDE window = OK to send */
      } else {
        return hhmm < from && hhmm >= to;  /* OUTSIDE window = OK to send */
      }
    });
  }

  if (candidates.length === 0) {
    return res.status(200).json({
      ok: true,
      sentTo: 0,
      successCount: 0,
      failureCount: 0,
      message: "ما فيش أجهزة مشتركة تطابق الشروط",
    });
  }

  const tokens = candidates.map(s => s.fcmToken).filter(Boolean);

  /* ─── Build FCM message ─── */
  /* Note: FCM has two ways to send — `notification` (handled by the
     browser automatically with no SW intervention) vs `data` (delivered
     as a data-only push the SW handles). We use BOTH: notification for
     OS-managed display when SW isn't active, data with `payload` json
     for the SW's `push` event (which then calls showNotification with
     RTL Arabic + actions). The SW's handler ignores notification block
     when payload.title is present — it builds its own from the data. */
  /* V21.9.177 (Slice 9) — Rich notifications: actions + tag-based grouping.
     `actions` is an array of {action, title} (max 2 per FCM/Web Push spec).
     Each action's click target URL must be in data.actions[<action>] so the
     SW notificationclick handler can route. */
  const actions = Array.isArray(body.actions)
    ? body.actions.slice(0, 2).filter(a => a && a.action && a.title).map(a => ({
        action: String(a.action).slice(0, 50),
        title: String(a.title).slice(0, 50),
        ...(a.icon ? { icon: String(a.icon) } : {}),
      }))
    : [];

  /* Action URL routing — collect in data.actions so SW can look them up */
  const actionUrls = (body.actions && typeof body.actions === "object")
    ? body.actions.reduce((acc, a) => {
        if (a && a.action && a.url) acc[a.action] = String(a.url);
        return acc;
      }, {})
    : {};

  const payloadJson = JSON.stringify({
    title,
    body: bodyText,
    icon: body.icon || "/icon-192.png",
    badge: "/icon-192.png",
    image: body.image || undefined,
    /* V21.9.177: explicit tag for grouping. If caller passes tag, similar
       notifications replace each other. e.g. tag='treasury-summary' means
       only the latest summary stays visible — no notification stacking. */
    tag: body.tag || (category + "_" + Date.now()),
    data: {
      ...dataPayload,
      category,
      actions: actionUrls,  /* SW reads to route action clicks */
      _sentAt: new Date().toISOString(),
    },
    actions,
    urgency,
  });

  /* Build the FCM multicast message. We send to up to 500 tokens per
     call (FCM limit). For larger fan-outs, chunk. */
  const messaging = getAdminApp().messaging();
  const CHUNK = 500;
  let totalSuccess = 0;
  let totalFailure = 0;
  const invalidTokens = [];
  const failureDetails = [];

  for (let i = 0; i < tokens.length; i += CHUNK) {
    const chunk = tokens.slice(i, i + CHUNK);
    try {
      const response = await messaging.sendEachForMulticast({
        tokens: chunk,
        /* notification block — fallback when SW isn't active */
        notification: { title, body: bodyText },
        /* data block — SW reads this to build the rich notification.
           V21.9.177: payload now includes actions + actionUrls for routing. */
        data: { payload: payloadJson },
        /* webpush-specific options */
        webpush: {
          fcmOptions: {
            /* link is the click destination if the SW's
               notificationclick handler doesn't run for some reason */
            link: dataPayload.url || "/",
          },
          headers: {
            /* Urgency hints the browser whether to wake the device */
            Urgency: urgency === "high" ? "high" : (urgency === "low" ? "low" : "normal"),
          },
        },
      });
      totalSuccess += response.successCount;
      totalFailure += response.failureCount;
      /* Identify invalid tokens for cleanup */
      response.responses.forEach((r, idx) => {
        if (!r.success && r.error) {
          const code = r.error.code || "";
          failureDetails.push({ tokenIdx: i + idx, code, message: r.error.message });
          if (TERMINAL_FCM_ERRORS.has(code)) {
            invalidTokens.push(chunk[idx]);
          }
        }
      });
    } catch (e) {
      /* Whole chunk failed (transport-level, not per-token) — count
         all as failures and continue to next chunk. */
      totalFailure += chunk.length;
      failureDetails.push({ chunkStart: i, error: e?.message || String(e) });
    }
  }

  /* ─── Auto-deactivate invalid tokens ─── */
  if (invalidTokens.length > 0) {
    try {
      const batch = db.batch();
      /* Look up each invalid token to find its doc id. We have the
         token but not the docId mapping in memory; query in chunks. */
      const tokenSet = new Set(invalidTokens);
      candidates.filter(c => tokenSet.has(c.fcmToken)).forEach(c => {
        batch.update(db.collection(SUBS_COLLECTION).doc(c.id), {
          active: false,
          deactivatedAt: new Date().toISOString(),
          deactivatedReason: "fcm_invalid_token",
        });
      });
      await batch.commit();
    } catch (_) { /* best effort — don't fail the send */ }
  }

  /* ─── Log to history ─── */
  let historyId = null;
  try {
    const histRef = await db.collection(HISTORY_COLLECTION).add({
      at: new Date().toISOString(),
      category,
      title,
      body: bodyText,
      data: dataPayload,
      audience,
      sentBy: { uid: auth.uid, email: auth.email, role: auth.role },
      stats: {
        targeted: tokens.length,
        successCount: totalSuccess,
        failureCount: totalFailure,
        invalidTokenCount: invalidTokens.length,
      },
      /* Cap failureDetails to 50 entries to keep the doc small (1MB Firestore limit) */
      failureDetails: failureDetails.slice(0, 50),
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
