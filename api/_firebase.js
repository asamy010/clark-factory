/* ═══════════════════════════════════════════════════════════════
   CLARK — Firebase Admin singleton for Vercel serverless functions.
   Reads credentials from FIREBASE_ADMIN_CREDENTIALS env var (full JSON).
   Shared across all /api/* functions to avoid double-init.
   ═══════════════════════════════════════════════════════════════ */

import admin from "firebase-admin";
import crypto from "crypto";

let _app = null;

export function getAdminApp() {
  if (_app) return _app;
  if (admin.apps.length > 0) {
    _app = admin.apps[0];
    return _app;
  }
  const raw = process.env.FIREBASE_ADMIN_CREDENTIALS;
  if (!raw) throw new Error("FIREBASE_ADMIN_CREDENTIALS not set in Vercel env vars");
  let creds;
  try {
    creds = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (e) {
    throw new Error("FIREBASE_ADMIN_CREDENTIALS is not valid JSON: " + e.message);
  }
  _app = admin.initializeApp({
    credential: admin.credential.cert(creds),
  });
  return _app;
}

export function getDb() {
  return getAdminApp().firestore();
}

/* ── HMAC token helpers ── */
export function getSecret() {
  const s = process.env.DELIVERY_CONFIRM_SECRET;
  if (!s || s.length < 16) {
    throw new Error("DELIVERY_CONFIRM_SECRET not set or too short (min 16 chars)");
  }
  return s;
}

export function signPayload(sessionId, custId) {
  const payload = sessionId + ":" + custId;
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("hex");
}

export function verifySignature(sessionId, custId, sig) {
  if (!sessionId || !custId || !sig) return false;
  const expected = signPayload(sessionId, custId);
  /* Constant-time comparison to prevent timing attacks */
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (e) {
    return false;
  }
}

/* ── V16.73: Workshop delivery signing ──
   Same HMAC scheme as the customer flow, but the payload is a 3-tuple
   (orderId, wsId, deliveryIdx) since a single order can have multiple
   deliveries to multiple workshops. We use a distinct payload prefix
   ("ws:") so a customer signature can never validate against a workshop
   route (defense in depth — even though the routes are separate).        */
export function signWorkshopPayload(orderId, wsId, deliveryIdx) {
  const payload = "ws:" + orderId + ":" + wsId + ":" + String(deliveryIdx);
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("hex");
}

export function verifyWorkshopSignature(orderId, wsId, deliveryIdx, sig) {
  if (!orderId || !wsId || deliveryIdx == null || deliveryIdx === "" || !sig) return false;
  const expected = signWorkshopPayload(orderId, wsId, deliveryIdx);
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (e) {
    return false;
  }
}

/* ── CORS helper — used by all public endpoints ── */
export function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

/* ── V16.12: Admin/manager auth helper ──
   Verifies a Firebase ID token AND checks the user's role from factory/config.
   Used by privileged endpoints (delivery-sign, customer-portal-sign) to
   prevent unauthenticated forgery of customer signatures.

   Returns { ok:true, uid, email, role } on success.
   Returns { ok:false, status, error } on failure (caller should propagate).

   Token can be passed in Authorization header ("Bearer <token>") or in body
   as `idToken` — endpoints that already accept other body fields use body. */
export async function verifyAdminToken(token) {
  if (!token || typeof token !== "string") {
    return { ok: false, status: 401, error: "رمز المصادقة مطلوب" };
  }
  /* Strip "Bearer " prefix if present */
  const clean = token.startsWith("Bearer ") ? token.slice(7).trim() : token.trim();
  if (!clean) {
    return { ok: false, status: 401, error: "رمز المصادقة فارغ" };
  }
  let decoded;
  try {
    decoded = await getAdminApp().auth().verifyIdToken(clean);
  } catch (e) {
    return { ok: false, status: 401, error: "رمز غير صالح" };
  }
  if (!decoded || !decoded.uid) {
    return { ok: false, status: 401, error: "مستخدم غير مصرّح" };
  }
  /* Look up role from config — same shape as getUserRole() in App.jsx */
  let role = "viewer";
  try {
    const cfgSnap = await getDb().collection("factory").doc("config").get();
    if (cfgSnap.exists) {
      const cfg = cfgSnap.data() || {};
      if (cfg.users && cfg.users[decoded.uid]) {
        const r = cfg.users[decoded.uid];
        role = typeof r === "string" ? r : (r && r.role) || "viewer";
      } else if (Array.isArray(cfg.usersList)) {
        const byEmail = cfg.usersList.find((u) => u.email === decoded.email);
        if (byEmail) role = byEmail.role || "viewer";
      }
    }
  } catch (e) {
    return { ok: false, status: 500, error: "تعذر التحقق من الصلاحيات" };
  }
  if (role !== "admin" && role !== "manager") {
    return { ok: false, status: 403, error: "صلاحيات غير كافية — مدير فقط" };
  }
  return { ok: true, uid: decoded.uid, email: decoded.email, role };
}
