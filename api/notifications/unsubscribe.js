/* ═══════════════════════════════════════════════════════════════
   POST /api/notifications/unsubscribe
   V21.9.171 (Phase 22c — Slice 3/14)
   ───────────────────────────────────────────────────────────────
   Deactivates an FCM token subscription. We mark the doc inactive
   rather than delete it — this preserves the audit trail of which
   devices were ever subscribed (useful when investigating "why didn't
   I get notification X"), and lets a re-subscribe from the same device
   reuse the same docId with `active: true`.

   Auth: any authenticated user. The caller can only unsubscribe
   their OWN subscriptions (server checks docs.userId === auth.uid).
   Admins/managers can unsubscribe anyone (e.g. revoke a stolen device).

   Body:
     {
       fcmToken:        string?,   // unsubscribe this specific device
       subscriptionId:  string?,   // OR unsubscribe by doc ID
       all:             bool?,     // OR unsubscribe ALL of caller's devices
     }
   ═══════════════════════════════════════════════════════════════ */

import crypto from "crypto";
import { setCors, verifyAuthedToken, getDb } from "../_firebase.js";

const COLLECTION = "notificationSubscriptions";

function tokenDocId(fcmToken) {
  const hash = crypto.createHash("sha256").update(String(fcmToken)).digest("hex");
  return "sub_" + hash.slice(0, 32);
}

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const auth = await verifyAuthedToken(req.headers.authorization);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  } catch (_) {
    return res.status(400).json({ ok: false, error: "JSON body غير صالح" });
  }

  const db = getDb();
  const isPrivileged = auth.role === "admin" || auth.role === "manager";

  /* Branch 1: unsubscribe ALL devices for this user */
  if (body.all === true) {
    try {
      const snap = await db.collection(COLLECTION)
        .where("userId", "==", auth.uid)
        .get();
      const batch = db.batch();
      snap.docs.forEach(d => {
        batch.update(d.ref, {
          active: false,
          unsubscribedAt: new Date().toISOString(),
          unsubscribedBy: auth.uid,
        });
      });
      await batch.commit();
      return res.status(200).json({ ok: true, deactivated: snap.size });
    } catch (e) {
      return res.status(500).json({ ok: false, error: "تعذر إلغاء الاشتراك: " + (e?.message || String(e)) });
    }
  }

  /* Branch 2: unsubscribe by token or subscriptionId */
  let docId = "";
  if (typeof body.subscriptionId === "string" && body.subscriptionId.startsWith("sub_")) {
    docId = body.subscriptionId;
  } else if (typeof body.fcmToken === "string" && body.fcmToken.trim()) {
    docId = tokenDocId(body.fcmToken.trim());
  } else {
    return res.status(400).json({ ok: false, error: "fcmToken أو subscriptionId مطلوب (أو all:true)" });
  }

  try {
    const docRef = db.collection(COLLECTION).doc(docId);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      /* Idempotent — already unsubscribed counts as success */
      return res.status(200).json({ ok: true, alreadyUnsubscribed: true });
    }
    const data = docSnap.data() || {};
    if (data.userId !== auth.uid && !isPrivileged) {
      /* Don't leak existence — pretend the doc doesn't exist */
      return res.status(200).json({ ok: true, alreadyUnsubscribed: true });
    }
    await docRef.update({
      active: false,
      unsubscribedAt: new Date().toISOString(),
      unsubscribedBy: auth.uid,
    });
    return res.status(200).json({ ok: true, subscriptionId: docId });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "تعذر إلغاء الاشتراك: " + (e?.message || String(e)) });
  }
}
