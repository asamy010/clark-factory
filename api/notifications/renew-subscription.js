/* ═══════════════════════════════════════════════════════════════
   POST /api/notifications/renew-subscription
   V21.9.171 (Phase 22c — Slice 3/14)
   ───────────────────────────────────────────────────────────────
   Called by the Service Worker's `pushsubscriptionchange` handler
   when the browser rotates the underlying Web Push subscription.
   Because this fires from inside the SW, there's NO user gesture
   context and NO Authorization header — we cannot identify the user
   directly.

   Strategy: log the rotation event for audit, and rely on the next
   in-app session to re-subscribe via /api/notifications/subscribe.
   When the user opens the app, `requestPermissionAndSubscribe`
   (notifications.js) calls getToken() which produces a fresh token,
   then POSTs to /subscribe — that's the authoritative renewal path.

   Body:
     {
       oldEndpoint:     string | null,         // raw Web Push endpoint, may be undefined for FCM
       newSubscription: WebPushSubscription?,  // toJSON() of new subscription if browser gave one
     }

   Response: { ok: true } always — best-effort log only.

   Why not block on auth here:
   - The SW can't get an idToken without going through the client
   - Failing this endpoint would leave the SW in a retry loop
   - The actual security boundary is /subscribe (auth required)
     — if a malicious actor calls /renew-subscription with fake data,
     they can only fill the log; they can't bind a token to a user.
   ═══════════════════════════════════════════════════════════════ */

import { setCors, getDb } from "../_firebase.js";

const LOG_COLLECTION = "notificationSubscriptionRenewals";
const MAX_LOG_ENTRIES = 1000; /* soft cap — Slice 11 cleanup will trim */

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  } catch (_) {
    /* Fail silent — this endpoint is best-effort */
    return res.status(200).json({ ok: true });
  }

  /* Best-effort: log the renewal event. If logging fails, still return ok
     so the SW doesn't retry indefinitely. */
  try {
    const db = getDb();
    await db.collection(LOG_COLLECTION).add({
      at: new Date().toISOString(),
      oldEndpoint: String(body.oldEndpoint || "").slice(0, 1000),
      newEndpointPresent: !!(body.newSubscription && body.newSubscription.endpoint),
      ua: String((req.headers["user-agent"] || "")).slice(0, 500),
      ip: String((req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "")).slice(0, 100),
    });

    /* If oldEndpoint can be matched to an existing subscription,
       deactivate it so the user's next subscribe creates a fresh one. */
    if (body.oldEndpoint) {
      try {
        const snap = await db.collection("notificationSubscriptions")
          .where("active", "==", true)
          .get();
        const matching = snap.docs.filter(d => {
          const data = d.data();
          /* FCM tokens don't carry the raw endpoint; this matches only
             if a future migration stores it. Keep the check for forward
             compatibility — currently a no-op. */
          return data && data.fcmEndpoint === body.oldEndpoint;
        });
        if (matching.length > 0) {
          const batch = db.batch();
          matching.forEach(d => batch.update(d.ref, {
            active: false,
            deactivatedAt: new Date().toISOString(),
            deactivatedReason: "subscription_rotated",
          }));
          await batch.commit();
        }
      } catch (_) { /* silent */ }
    }
  } catch (_) { /* silent — best effort */ }

  return res.status(200).json({ ok: true });
}
