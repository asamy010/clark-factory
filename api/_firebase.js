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

/* ── CORS helper — used by all public endpoints ── */
export function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
