/* CLARK · POST /api/notifications/unsubscribe (V21.12.0 — #13 Slice 1) */
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

export default async function handler(req, res){
  res.setHeader("Access-Control-Allow-Origin", process.env.AI_ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if(req.method === "OPTIONS") return res.status(200).end();
  if(req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

  let uid;
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if(!token) return res.status(401).json({ ok: false, error: "Authentication required" });
    const decoded = await getApp().auth().verifyIdToken(token);
    uid = decoded.uid;
  } catch(e){
    return res.status(401).json({ ok: false, error: "Invalid token" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  const { fcmToken } = body;
  if(!fcmToken) return res.status(400).json({ ok: false, error: "fcmToken required" });

  try {
    const db = getApp().firestore();
    const ref = db.collection("notificationSubscriptions").doc(uid);
    const snap = await ref.get();
    if(!snap.exists) return res.status(200).json({ ok: true });
    const devices = (snap.data().devices || []).map(d =>
      d.fcmToken === fcmToken ? { ...d, active: false, unsubscribedAt: new Date().toISOString() } : d
    );
    await ref.update({ devices, updatedAt: new Date().toISOString() });
    return res.status(200).json({ ok: true });
  } catch(e){
    return res.status(500).json({ ok: false, error: e.message });
  }
}
