/* ═══════════════════════════════════════════════════════════════
   POST /api/notifications/subscribe
   V21.9.171 (Phase 22c — Slice 3/14)
   ───────────────────────────────────────────────────────────────
   Registers a Firebase Cloud Messaging (FCM) registration token for
   the calling user. Idempotent — re-subscribing the same token just
   updates `lastSeenAt` on the existing doc.

   Auth: any authenticated user. The token is bound to the calling
   user's UID — the server uses the verified token's UID, NOT a UID
   from the body. This prevents a logged-in user from registering a
   subscription as another user.

   Body:
     {
       fcmToken: string,   // the FCM registration token from getToken()
       device:   {         // optional, from detectDevice() on client
         type, os, browser, userAgent
       }
     }

   Storage:
     Top-level collection /notificationSubscriptions/{docId}
     docId = sub_<sha256(token).slice(0,32)>  (stable across re-subs)
     {
       userId, userEmail, role,
       fcmToken,
       device: { ... },
       createdAt, lastSeenAt,
       active: true,
       preferences: { ... }   // populated by Slice 5; default = all-on
     }

   Why a top-level collection (not data.notificationSubscriptions in
   factory/config): per-device docs grow with user count × device count.
   factory/config is already approaching 1 MB (V21.9.42 issue). A
   collection avoids that contention + lets the rules scope reads to
   "own subscriptions" naturally. ═══════════════════════════════════ */

import crypto from "crypto";
import { setCors, verifyAuthedToken, getDb } from "../_firebase.js";

const COLLECTION = "notificationSubscriptions";

/* Default preferences — Slice 5 will add a Settings UI to edit these.
   Architecture decision (confirmed with user): "all users receive all
   categories" by default. Users can toggle off individual categories
   from Settings once Slice 5 ships. */
const DEFAULT_PREFERENCES = {
  treasury: true,
  tasks: true,
  instructions: true,
  warnings: true,
  approvals: true,
  daily_summary: true,
  broadcast: true,
};

function tokenDocId(fcmToken) {
  /* Hash the token to derive a stable doc ID. Using the raw token as
     the doc ID is also possible but the token can contain characters
     Firestore allows-but-discourages in IDs, and exposes the token via
     the doc path in logs. Hashing keeps logs clean. */
  const hash = crypto.createHash("sha256").update(String(fcmToken)).digest("hex");
  return "sub_" + hash.slice(0, 32);
}

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  /* Auth — any authenticated user can subscribe their own device. */
  const auth = await verifyAuthedToken(req.headers.authorization);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

  /* Body parse — handle both string (some Vercel runtimes) and object. */
  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  } catch (_) {
    return res.status(400).json({ ok: false, error: "JSON body غير صالح" });
  }

  const fcmToken = typeof body.fcmToken === "string" ? body.fcmToken.trim() : "";
  if (!fcmToken) {
    return res.status(400).json({ ok: false, error: "fcmToken مطلوب" });
  }
  /* Sanity bound — FCM tokens are typically ~150-200 chars; reject anything
     obviously bogus so a misbehaving client can't fill our collection with
     megabyte-sized "tokens". */
  if (fcmToken.length > 4096) {
    return res.status(400).json({ ok: false, error: "fcmToken طوله غير منطقي" });
  }

  const device = (body.device && typeof body.device === "object") ? {
    type: String(body.device.type || "unknown").slice(0, 50),
    os: String(body.device.os || "unknown").slice(0, 50),
    browser: String(body.device.browser || "unknown").slice(0, 50),
    userAgent: String(body.device.userAgent || "").slice(0, 1000),
  } : { type: "unknown", os: "unknown", browser: "unknown", userAgent: "" };

  const docId = tokenDocId(fcmToken);
  const db = getDb();
  const docRef = db.collection(COLLECTION).doc(docId);

  const now = new Date().toISOString();
  try {
    const existing = await docRef.get();
    if (existing.exists) {
      const data = existing.data() || {};
      /* SECURITY: if this token was previously registered to a DIFFERENT
         user, we deactivate the old binding and rebind to the calling
         user. This handles the case where two users share a browser
         (e.g. laptop hand-off) — the old user shouldn't keep receiving
         notifications routed to that device. */
      const rebinding = data.userId && data.userId !== auth.uid;
      await docRef.set({
        userId: auth.uid,
        userEmail: auth.email || "",
        role: auth.role || "viewer",
        fcmToken,
        device,
        lastSeenAt: now,
        active: true,
        /* preserve preferences across resubscribe so the user doesn't
           lose customizations made in Slice 5 settings. */
        preferences: data.preferences || DEFAULT_PREFERENCES,
        ...(rebinding ? { rebindFromUid: data.userId, rebindAt: now } : {}),
        /* createdAt is set ONCE — keep existing if present. */
        createdAt: data.createdAt || now,
      }, { merge: true });
    } else {
      await docRef.set({
        userId: auth.uid,
        userEmail: auth.email || "",
        role: auth.role || "viewer",
        fcmToken,
        device,
        createdAt: now,
        lastSeenAt: now,
        active: true,
        preferences: DEFAULT_PREFERENCES,
      });
    }
    return res.status(200).json({
      ok: true,
      subscriptionId: docId,
      message: "تم تفعيل الإشعارات على هذا الجهاز",
    });
  } catch (e) {
    /* Surfaced as 500 — the client will see warning:"backend_save_failed"
       per notifications.js error handling. */
    return res.status(500).json({
      ok: false,
      error: "تعذر حفظ الاشتراك: " + (e?.message || String(e)),
    });
  }
}
