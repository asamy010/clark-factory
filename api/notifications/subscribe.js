/* ═══════════════════════════════════════════════════════════════════════
   CLARK · POST /api/notifications/subscribe (V21.12.0 — #13 Slice 1)
   ───────────────────────────────────────────────────────────────────────
   Saves an FCM device token + device metadata to a per-user document in
   the notificationSubscriptions collection.

   Auth: Firebase ID token in Authorization header (any authed user).

   Request body:
     { fcmToken: string, device: { type, os, browser, userAgent } }

   Doc structure: notificationSubscriptions/{userId}
     {
       userId, userEmail,
       devices: [{
         fcmToken, addedAt, lastSeenAt, active,
         type, os, browser, userAgent,
       }],
       preferences: { treasury, tasks, instructions, warnings, ... },
       updatedAt,
     }

   Idempotent: re-saving the same fcmToken updates lastSeenAt instead of
   appending duplicate. Stale tokens (>90 days inactive) flagged active=false
   by the daily cron (Slice 2+).
   ═══════════════════════════════════════════════════════════════════════ */

import admin from "firebase-admin";

let _app = null;
function getApp(){
  if(_app) return _app;
  if(admin.apps.length > 0){ _app = admin.apps[0]; return _app; }
  const raw = process.env.FIREBASE_ADMIN_CREDENTIALS;
  if(!raw) throw new Error("FIREBASE_ADMIN_CREDENTIALS not set");
  const creds = typeof raw === "string" ? JSON.parse(raw) : raw;
  _app = admin.initializeApp({ credential: admin.credential.cert(creds) });
  return _app;
}

const DEFAULT_PREFERENCES = {
  treasury: true,
  tasks: true,
  instructions: true,
  warnings: true,
  approvals: true,
  ai_agent: false,
  daily_summary: true,
  document_expiry: true,
};

export default async function handler(req, res){
  /* CORS */
  res.setHeader("Access-Control-Allow-Origin", process.env.AI_ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if(req.method === "OPTIONS") return res.status(200).end();
  if(req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

  /* Auth */
  let uid, email;
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if(!token) return res.status(401).json({ ok: false, error: "Authentication required" });
    const decoded = await getApp().auth().verifyIdToken(token);
    uid = decoded.uid;
    email = decoded.email || "";
    if(!uid) return res.status(401).json({ ok: false, error: "Invalid token" });
  } catch(e){
    return res.status(401).json({ ok: false, error: "Invalid or expired token" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  const { fcmToken, device } = body;
  if(!fcmToken || typeof fcmToken !== "string"){
    return res.status(400).json({ ok: false, error: "fcmToken required" });
  }

  try {
    const db = getApp().firestore();
    const ref = db.collection("notificationSubscriptions").doc(uid);
    const snap = await ref.get();
    const now = new Date().toISOString();
    const deviceEntry = {
      fcmToken,
      addedAt: now,
      lastSeenAt: now,
      active: true,
      ...(device || {}),
    };

    if(!snap.exists){
      await ref.set({
        userId: uid,
        userEmail: email,
        devices: [deviceEntry],
        preferences: DEFAULT_PREFERENCES,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      const data = snap.data();
      const devices = Array.isArray(data.devices) ? [...data.devices] : [];
      /* Idempotent: dedupe by fcmToken */
      const existing = devices.findIndex(d => d.fcmToken === fcmToken);
      if(existing >= 0){
        devices[existing] = { ...devices[existing], lastSeenAt: now, active: true,
          ...(device || {}) };
      } else {
        devices.push(deviceEntry);
      }
      await ref.update({ devices, userEmail: email, updatedAt: now });
    }

    return res.status(200).json({ ok: true });
  } catch(e){
    console.error("[notifications/subscribe]", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
