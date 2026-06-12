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
    /* V21.9.13: also apply settings on existing apps if first time we're using them */
    try {
      _app.firestore().settings({ ignoreUndefinedProperties: true });
    } catch (_) { /* already configured — ignore */ }
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
  /* V21.9.13 ROOT-CAUSE FIX:
     Pre-V21.9.13 the historical sync (and other server endpoints) crashed with
       Cannot use "undefined" as a Firestore value (found in field "shopifyPendingOrders.0.bosta")
     when a merged order had no bosta tracking (legitimate state — bosta is
     attached lazily). Code like `merged.bosta = prev.bosta || o.bosta;`
     produces undefined when both sides are undefined, and Firestore's strict
     mode rejects the whole write.
     Setting ignoreUndefinedProperties:true makes the Admin SDK silently strip
     fields whose value is undefined before sending them to Firestore — same
     behavior as the JSON spec. This is defense in depth: bug-prone object
     spreads and merges no longer blow up the entire transaction. We DON'T
     use this to mask data validation issues — we still validate user input
     at endpoint boundaries; this only handles internal undefined leaks. */
  try {
    _app.firestore().settings({ ignoreUndefinedProperties: true });
  } catch (_) { /* settings can only be applied once — ignore on retry */ }
  return _app;
}

export function getDb() {
  return getAdminApp().firestore();
}

/* ─── V19.51 hotfix ──────────────────────────────────────────────────────
   readSplitCollection: read all day docs from a daily-split collection
   and flatten their `entries` arrays into one. Use this in serverless
   endpoints (customer-portal, workshop-portal) instead of reading
   `config.<field>` directly — those fields no longer exist after V19.49+
   migrations moved them out to {field}Days/* collections.

   Example:
     const allCustPayments = await readSplitCollection("custPaymentsDays");
     const allChecks       = await readSplitCollection("checksDays");
     const allWsPayments   = await readSplitCollection("wsPaymentsDays");

   Returns [] on error or empty collection — never throws. */
export async function readSplitCollection(collectionName) {
  try {
    const db = getDb();
    const snap = await db.collection(collectionName).get();
    const all = [];
    snap.forEach(docSnap => {
      const data = docSnap.data();
      if (data && Array.isArray(data.entries)) {
        all.push(...data.entries);
      }
    });
    return all;
  } catch (err) {
    console.error("[api:readSplitCollection] failed for", collectionName, err);
    return [];
  }
}

/* ─── V19.53 ─────────────────────────────────────────────────────────────
   appendToSplitDay: append an entry to the proper day doc of a split
   collection. Use in API endpoints that previously did:
     tx.set(configRef, { notifications: [newEntry, ...existing.slice(0,499)] }, { merge:true })
   The new equivalent:
     await appendToSplitDay("notificationsDays", newEntry);

   The day is derived from entry.date (YYYY-MM-DD) or entry.createdAt
   (ISO timestamp) or current date as fallback. Entry MUST have an `id`
   for the dedup logic in the day doc; if missing, one is auto-generated.

   Uses a transaction to safely merge the entry into existing entries:
   reads current entries, prepends the new one (newest-first), writes back.
   ─────────────────────────────────────────────────────────────────────── */
export async function appendToSplitDay(collectionName, entry) {
  if (!entry || typeof entry !== "object") return;
  const db = getDb();
  /* Resolve the day key from entry */
  const rawDate = entry.date || entry.createdAt || entry.ts || new Date().toISOString();
  let date;
  try {
    date = String(rawDate).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      date = new Date(rawDate).toISOString().slice(0, 10);
    }
  } catch (_) {
    date = new Date().toISOString().slice(0, 10);
  }
  /* Auto-id if missing — matches the auto-id pattern in splitCollections.js */
  if (!entry.id) {
    entry.id = "auto_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
  }

  const dayRef = db.collection(collectionName).doc(date);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(dayRef);
    const existing = snap.exists && Array.isArray(snap.data()?.entries)
      ? snap.data().entries
      : [];
    /* Prepend (newest-first convention used elsewhere) */
    const merged = [entry, ...existing];
    tx.set(dayRef, {
      entries: merged,
      count: merged.length,
      updatedAt: new Date().toISOString(),
    });
  });
}

/* ─── V19.57 ─────────────────────────────────────────────────────────────
   readPartitionedCollection: read all docs in a byId partitioned collection.
   Each doc IS the entity (no `entries` wrapper). Used for master data
   collections after V19.57 migration: customersDocs, suppliersDocs, etc.

   Example:
     const customers = await readPartitionedCollection("customersDocs");
     const workshops = await readPartitionedCollection("workshopsDocs");

   Returns [] on error or empty collection — never throws. */
export async function readPartitionedCollection(collectionName) {
  try {
    const db = getDb();
    const snap = await db.collection(collectionName).get();
    const all = [];
    snap.forEach(docSnap => {
      const data = docSnap.data();
      if (data && data.id) all.push(data);
    });
    return all;
  } catch (err) {
    console.error("[api:readPartitionedCollection] failed for", collectionName, err);
    return [];
  }
}

/* V21.21.76: read ONE doc from a byId-partitioned collection directly (perf).
   مستندات customersDocs/suppliersDocs/… مفهرسة بالـ id، فبدل ما نقرأ كل
   المجموعة عشان عنصر واحد (هدر شديد على البورتال)، نقرأ المستند مباشرة.
   بيرجّع null لو مش موجود — والـ caller يقدر يعمل fallback scan دفاعياً. */
export async function readPartitionedDoc(collectionName, id) {
  if (id == null) return null;
  try {
    const snap = await getDb().collection(collectionName).doc(String(id)).get();
    return snap.exists ? (snap.data() || null) : null;
  } catch (err) {
    console.error("[api:readPartitionedDoc] failed for", collectionName, id, err);
    return null;
  }
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

/* ── CORS helper — used by all public endpoints ──
   V19.64: respects API_ALLOWED_ORIGIN env (single origin) or API_ALLOWED_ORIGINS
   (comma-separated list, matched against req.headers.origin). Falls back to "*"
   for back-compat — but production deployments should set the env to lock down
   to the deployed domain. */
export function setCors(res, req) {
  const single = (process.env.API_ALLOWED_ORIGIN || "").trim();
  const list = (process.env.API_ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  /* V21.9.91 (Permissions audit CRITICAL): if neither env var is set, fall
     back to the Vercel production domain instead of "*". Pre-V21.9.91 the
     wildcard fallback meant ANY origin could call the API (e.g., a
     malicious site could sign delivery confirmations from a logged-in
     user's browser). The fallback below derives the safe default from
     Vercel's deployment URL or a hardcoded clark domain.
     If you need true wildcard for local dev, explicitly set
     API_ALLOWED_ORIGIN="*". */
  const productionDefault = (process.env.VERCEL_URL ? ("https://" + process.env.VERCEL_URL) : "https://clark-factory.vercel.app");
  let origin = productionDefault;
  if (single) {
    origin = single;
  } else if (list.length > 0 && req && req.headers && req.headers.origin) {
    origin = list.includes(req.headers.origin) ? req.headers.origin : list[0];
  }
  res.setHeader("Access-Control-Allow-Origin", origin);
  if (origin !== "*") res.setHeader("Vary", "Origin");
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
  /* V18.70: Bootstrap admin escape hatch.
     If BOOTSTRAP_ADMIN_UID is set in Vercel env vars and matches the
     decoded UID, grant admin role unconditionally — even if config is
     corrupted or the role list locked everyone out. Use sparingly. */
  const bootstrapUid = (process.env.BOOTSTRAP_ADMIN_UID || "").trim();
  if (bootstrapUid && decoded.uid === bootstrapUid) {
    return { ok: true, uid: decoded.uid, email: decoded.email, role: "admin" };
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
