/* ═══════════════════════════════════════════════════════════════════════
   CLARK · POST /api/notifications/renew-subscription (V21.13.0)
   ───────────────────────────────────────────────────────────────────────
   Called by the service worker's `pushsubscriptionchange` event when the
   browser auto-renews a push subscription. This is a best-effort endpoint
   — if it fails, the user will need to re-enable notifications manually.

   No-op stub for now: the SW gets a fresh subscription object but the
   FCM token-based flow (subscribe.js) is the authoritative path. This
   endpoint exists to prevent the SW's fetch from 404-ing (which floods
   the network panel with errors).

   TODO V21.14: implement actual renewal by mapping the new subscription
   to the existing user's notificationSubscriptions doc.
   ═══════════════════════════════════════════════════════════════════════ */

export default async function handler(req, res){
  res.setHeader("Access-Control-Allow-Origin", "*");
  if(req.method === "OPTIONS") return res.status(200).end();
  /* Accept the subscription payload but don't act on it yet.
     The client should call /api/notifications/subscribe on next app load
     anyway, which is the proper auth flow. */
  return res.status(200).json({ ok: true, note: "stub — call /subscribe to re-register" });
}
