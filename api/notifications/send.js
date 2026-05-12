/* ═══════════════════════════════════════════════════════════════════════
   CLARK · POST /api/notifications/send (V21.12.0 — #13 Slice 1)
   ───────────────────────────────────────────────────────────────────────
   Admin-only endpoint to send a push notification to one or more users.

   Auth: Firebase ID token (admin only — checks usersList role).

   Request body:
     {
       recipients: "all" | string[] (userIds | "email:...@..."),
       category: "treasury"|"tasks"|"instructions"|"warnings"|"approvals"
              |"ai_agent"|"daily_summary"|"document_expiry",
       title: string,
       body: string,
       data?: object,
       actions?: array,
       urgency?: "high"|"normal"|"low",
       icon?: string, badge?: string, image?: string,
     }

   Behavior:
     - Resolves recipients → list of FCM tokens (via notificationSubscriptions)
     - Filters by category preferences
     - Calls FCM admin SDK sendEachForMulticast
     - Records to notificationHistory (audit + analytics)
     - Returns { ok, sent, failed, deliveryStatus }
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

async function isAdminEmail(db, email){
  if(!email) return false;
  try {
    const configSnap = await db.collection("factory").doc("config").get();
    if(!configSnap.exists) return false;
    const users = configSnap.data().usersList || [];
    const match = users.find(u => (u.email || "").toLowerCase() === email.toLowerCase());
    if(!match) return false;
    return match.role === "admin" || match.role === "manager";
  } catch(e){
    return false;
  }
}

export default async function handler(req, res){
  res.setHeader("Access-Control-Allow-Origin", process.env.AI_ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if(req.method === "OPTIONS") return res.status(200).end();
  if(req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

  /* Auth — admin/manager only */
  let senderEmail = "";
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if(!token) return res.status(401).json({ ok: false, error: "Authentication required" });
    const decoded = await getApp().auth().verifyIdToken(token);
    senderEmail = decoded.email || "";
    if(!senderEmail) return res.status(401).json({ ok: false, error: "Invalid token" });
  } catch(e){
    return res.status(401).json({ ok: false, error: "Invalid or expired token" });
  }

  const db = getApp().firestore();
  if(!(await isAdminEmail(db, senderEmail))){
    return res.status(403).json({ ok: false, error: "Admin/Manager only" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  const {
    recipients = "all",
    category = "warnings",
    title, body: msgBody, data: msgData = {}, actions = [],
    urgency = "normal",
    icon, badge, image,
  } = body;

  if(!title || !msgBody){
    return res.status(400).json({ ok: false, error: "title + body required" });
  }

  try {
    /* Resolve recipient subscriptions */
    const subsSnap = await db.collection("notificationSubscriptions").get();
    const candidates = [];
    subsSnap.forEach(doc => {
      const sub = doc.data();
      /* Filter by recipient list */
      if(recipients !== "all"){
        const list = Array.isArray(recipients) ? recipients : [recipients];
        const matchesUid = list.includes(sub.userId);
        const matchesEmail = list.some(r => typeof r === "string" && r.startsWith("email:") && r.slice(6).toLowerCase() === (sub.userEmail || "").toLowerCase());
        if(!matchesUid && !matchesEmail) return;
      }
      /* Filter by category preference */
      const prefs = sub.preferences || {};
      if(prefs[category] === false) return;
      /* Collect active device tokens */
      const devices = Array.isArray(sub.devices) ? sub.devices : [];
      devices.forEach(d => {
        if(d.active !== false && d.fcmToken){
          candidates.push({ userId: sub.userId, userEmail: sub.userEmail, fcmToken: d.fcmToken });
        }
      });
    });

    if(candidates.length === 0){
      return res.status(200).json({ ok: true, sent: 0, failed: 0, message: "No active subscriptions matching" });
    }

    /* FCM Admin SDK send */
    const messaging = getApp().messaging();
    const tokens = candidates.map(c => c.fcmToken);

    /* sendEachForMulticast handles batching for us (up to 500/req) */
    const message = {
      tokens,
      notification: { title, body: msgBody, ...(image ? { imageUrl: image } : {}) },
      data: {
        ...(Object.keys(msgData).reduce((acc, k) => {
          acc[k] = typeof msgData[k] === "string" ? msgData[k] : JSON.stringify(msgData[k]);
          return acc;
        }, {})),
        category,
        urgency,
        sentAt: new Date().toISOString(),
      },
      webpush: {
        notification: {
          icon: icon || "/icon-192.png",
          badge: badge || "/icon-192.png",
          dir: "rtl",
          lang: "ar-EG",
          vibrate: [200, 100, 200],
          requireInteraction: urgency === "high",
          actions: actions || [],
        },
        fcmOptions: { link: msgData.url || "/" },
      },
    };

    const result = await messaging.sendEachForMulticast(message);

    /* Audit to notificationHistory */
    const histId = "notif_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,7);
    const today = new Date().toISOString().split("T")[0];
    const deliveryStatus = {};
    result.responses.forEach((r, i) => {
      deliveryStatus[candidates[i].userId] = r.success ? "delivered" : "failed:" + (r.error?.code || "unknown");
    });

    /* Daily-split: notificationHistoryDays/{YYYY-MM-DD} */
    const dayRef = db.collection("notificationHistoryDays").doc(today);
    const dayDoc = await dayRef.get();
    const entries = dayDoc.exists ? (dayDoc.data().entries || []) : [];
    entries.push({
      id: histId,
      title, body: msgBody, category, urgency, data: msgData,
      sentBy: senderEmail,
      sentAt: new Date().toISOString(),
      sentTo: candidates.map(c => c.userId),
      sentVia: ["push"],
      deliveryStatus,
      successCount: result.successCount,
      failureCount: result.failureCount,
    });
    if(dayDoc.exists){
      await dayRef.update({ entries });
    } else {
      await dayRef.set({ entries });
    }

    /* Cleanup: mark failed device tokens as inactive (e.g. token revoked) */
    for(let i = 0; i < result.responses.length; i++){
      const r = result.responses[i];
      if(!r.success){
        const code = r.error?.code || "";
        if(code.includes("registration-token-not-registered") || code.includes("invalid-argument")){
          /* Bad token — flag inactive */
          const cand = candidates[i];
          const subRef = db.collection("notificationSubscriptions").doc(cand.userId);
          const sub = await subRef.get();
          if(sub.exists){
            const updated = (sub.data().devices || []).map(d =>
              d.fcmToken === cand.fcmToken ? { ...d, active: false, inactiveReason: code } : d
            );
            await subRef.update({ devices: updated, updatedAt: new Date().toISOString() });
          }
        }
      }
    }

    return res.status(200).json({
      ok: true,
      sent: result.successCount,
      failed: result.failureCount,
      historyId: histId,
    });
  } catch(e){
    console.error("[notifications/send]", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
