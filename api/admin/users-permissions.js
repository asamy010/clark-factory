/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/admin/users-permissions (V21.9.24)
   ───────────────────────────────────────────────────────────────
   Admin-only endpoint for managing user roles in factory/config.users.

   Actions:
     1. action="list" — returns all users from cfg.users + cfg.usersList,
        joined with Firebase Auth data (display name, last sign-in)
     2. action="set" — sets a user's role
        body: { action:"set", uid, email?, role }
     3. action="remove" — removes a user from cfg.users
        body: { action:"remove", uid }
     4. action="auth_search" — search Firebase Auth users by email
        body: { action:"auth_search", email? }
     5. action="bootstrap_self" — adds the CURRENT user as admin
        (only works if cfg.users is empty OR the user matches
        BOOTSTRAP_ADMIN_UID env var). Escape hatch for first-time setup.

   Why this matters:
     - The factory has multiple staff who got 'viewer' role by default
     - All their writes are denied silently because they're not in
       cfg.users
     - This endpoint lets the admin quickly assign proper roles

   Auth: admin Bearer (except bootstrap_self which has its own gate)

   Returns: per-action — see comments
   ═══════════════════════════════════════════════════════════════ */

import { getDb, getAdminApp, setCors, verifyAdminToken } from "../_firebase.js";

const VALID_ROLES = [
  "admin", "manager",
  "sales_accountant", "purchase_accountant",
  "payroll_accountant", "payroll_verifier",
  "viewer",
];

const RULES_BOOTSTRAP_UID = "fJDTS57ndvVfPozGgwYybKJymuA3";

async function verifyAnyAuthedToken(token) {
  if (!token || typeof token !== "string") return { ok: false, status: 401, error: "رمز المصادقة مطلوب" };
  const clean = token.startsWith("Bearer ") ? token.slice(7).trim() : token.trim();
  if (!clean) return { ok: false, status: 401, error: "رمز فارغ" };
  try {
    const decoded = await getAdminApp().auth().verifyIdToken(clean);
    if (!decoded || !decoded.uid) return { ok: false, status: 401, error: "Token غير صالح" };
    return { ok: true, uid: decoded.uid, email: decoded.email || "" };
  } catch (e) {
    return { ok: false, status: 401, error: "Token غير صالح" };
  }
}

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST فقط" });
  }

  const body = (typeof req.body === "string") ? JSON.parse(req.body || "{}") : (req.body || {});
  const action = String(body.action || "").trim();

  /* bootstrap_self has its own auth gate */
  if (action === "bootstrap_self") {
    return handleBootstrapSelf(req, res, body);
  }

  /* All other actions require admin */
  const auth = await verifyAdminToken(req.headers.authorization);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  try {
    if (action === "list") return handleList(res, auth);
    if (action === "set") return handleSet(res, auth, body);
    if (action === "remove") return handleRemove(res, auth, body);
    if (action === "auth_search") return handleAuthSearch(res, auth, body);
    return res.status(400).json({ ok: false, error: "action غير معروف: " + action });
  } catch (e) {
    console.error("[V21.9.24 users-permissions] failed:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}

async function handleList(res, auth) {
  const db = getDb();
  const cfgSnap = await db.collection("factory").doc("config").get();
  const cfg = cfgSnap.exists ? (cfgSnap.data() || {}) : {};

  /* Collect all known users from cfg.users + cfg.usersList */
  const usersMap = new Map(); /* uid → { uid, email, role, source } */

  if (cfg.users && typeof cfg.users === "object") {
    for (const [uid, val] of Object.entries(cfg.users)) {
      const role = typeof val === "string" ? val : ((val && val.role) || "viewer");
      const email = (typeof val === "object" && val) ? (val.email || "") : "";
      usersMap.set(uid, {
        uid, email, role,
        source: "cfg.users",
        meta: typeof val === "object" ? val : null,
      });
    }
  }
  if (Array.isArray(cfg.usersList)) {
    for (const u of cfg.usersList) {
      if (!u || !u.email) continue;
      /* If we don't have an entry with matching UID yet, add this email-based one */
      const existing = Array.from(usersMap.values()).find(
        x => (x.email && x.email === u.email) || x.uid === u.uid
      );
      if (existing) {
        if (!existing.email && u.email) existing.email = u.email;
        if (!existing.role && u.role) existing.role = u.role;
      } else {
        const id = u.uid || ("email:" + u.email);
        usersMap.set(id, {
          uid: u.uid || "",
          email: u.email,
          role: u.role || "viewer",
          source: "cfg.usersList",
          meta: u,
        });
      }
    }
  }

  /* Enrich with Firebase Auth info (lastSignInTime, displayName, etc.) */
  const auth_app = getAdminApp().auth();
  const enriched = [];
  for (const entry of usersMap.values()) {
    let authInfo = null;
    if (entry.uid) {
      try {
        const rec = await auth_app.getUser(entry.uid);
        authInfo = {
          displayName: rec.displayName || "",
          email: rec.email || "",
          emailVerified: rec.emailVerified,
          disabled: rec.disabled,
          lastSignInTime: rec.metadata?.lastSignInTime || "",
          creationTime: rec.metadata?.creationTime || "",
          providerId: (rec.providerData?.[0]?.providerId) || "",
        };
      } catch (_) { /* user may have been deleted from Auth */ }
    } else if (entry.email) {
      try {
        const rec = await auth_app.getUserByEmail(entry.email);
        entry.uid = rec.uid;
        authInfo = {
          displayName: rec.displayName || "",
          email: rec.email || "",
          emailVerified: rec.emailVerified,
          disabled: rec.disabled,
          lastSignInTime: rec.metadata?.lastSignInTime || "",
          creationTime: rec.metadata?.creationTime || "",
          providerId: (rec.providerData?.[0]?.providerId) || "",
        };
      } catch (_) { /* not found in Auth */ }
    }
    enriched.push({ ...entry, auth_info: authInfo });
  }

  return res.status(200).json({
    ok: true,
    users: enriched,
    valid_roles: VALID_ROLES,
    total: enriched.length,
    permissions_matrix: cfg.permissions || {},
    bootstrap_uid: RULES_BOOTSTRAP_UID,
    your_uid: auth.uid,
  });
}

async function handleSet(res, auth, body) {
  const uid = String(body.uid || "").trim();
  const role = String(body.role || "").trim();
  const email = String(body.email || "").trim();

  if (!uid) return res.status(400).json({ ok: false, error: "uid مطلوب" });
  if (!role || !VALID_ROLES.includes(role)) {
    return res.status(400).json({ ok: false, error: "role غير صالح. القيم المتاحة: " + VALID_ROLES.join(", ") });
  }

  const db = getDb();
  const cfgRef = db.collection("factory").doc("config");

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(cfgRef);
    const cfg = snap.exists ? (snap.data() || {}) : {};
    const users = { ...(cfg.users || {}) };
    users[uid] = role;

    /* Also update usersList if it exists (for back-compat) */
    let usersList = Array.isArray(cfg.usersList) ? cfg.usersList.slice() : [];
    if (email) {
      const idx = usersList.findIndex(u => u && (u.uid === uid || u.email === email));
      const entry = { uid, email, role, updatedAt: new Date().toISOString() };
      if (idx >= 0) usersList[idx] = { ...usersList[idx], ...entry };
      else usersList.push(entry);
    }

    tx.set(cfgRef, { users, usersList }, { merge: true });
  });

  /* Audit log */
  try {
    await db.collection("migrationLog").doc("set-role-v21.9.24-" + Date.now()).set({
      type: "set-user-role",
      uid, role, email,
      by: auth.email || auth.uid,
      at: new Date().toISOString(),
    });
  } catch (_) {}

  return res.status(200).json({
    ok: true,
    uid, role,
    message: "✅ تم تعيين الـ role '" + role + "' للـ user " + (email || uid),
  });
}

async function handleRemove(res, auth, body) {
  const uid = String(body.uid || "").trim();
  if (!uid) return res.status(400).json({ ok: false, error: "uid مطلوب" });

  if (uid === auth.uid) {
    return res.status(400).json({ ok: false, error: "مينفعش تحذف نفسك. اطلب من admin تاني." });
  }

  const db = getDb();
  const cfgRef = db.collection("factory").doc("config");

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(cfgRef);
    const cfg = snap.exists ? (snap.data() || {}) : {};
    const users = { ...(cfg.users || {}) };
    delete users[uid];

    let usersList = Array.isArray(cfg.usersList) ? cfg.usersList.filter(u => u && u.uid !== uid) : [];

    tx.set(cfgRef, { users, usersList }, { merge: true });
  });

  try {
    await db.collection("migrationLog").doc("remove-user-v21.9.24-" + Date.now()).set({
      type: "remove-user",
      uid,
      by: auth.email || auth.uid,
      at: new Date().toISOString(),
    });
  } catch (_) {}

  return res.status(200).json({ ok: true, uid, message: "✅ تم حذف الـ user" });
}

async function handleAuthSearch(res, auth, body) {
  const email = String(body.email || "").trim().toLowerCase();
  const auth_app = getAdminApp().auth();

  if (email) {
    try {
      const rec = await auth_app.getUserByEmail(email);
      return res.status(200).json({
        ok: true,
        user: {
          uid: rec.uid,
          email: rec.email,
          displayName: rec.displayName || "",
          emailVerified: rec.emailVerified,
          disabled: rec.disabled,
          lastSignInTime: rec.metadata?.lastSignInTime || "",
          creationTime: rec.metadata?.creationTime || "",
        },
      });
    } catch (e) {
      return res.status(404).json({ ok: false, error: "Email مش موجود في Firebase Auth: " + email });
    }
  }

  /* No email — list all (capped at 1000) */
  try {
    const result = await auth_app.listUsers(1000);
    return res.status(200).json({
      ok: true,
      total: result.users.length,
      users: result.users.map(u => ({
        uid: u.uid,
        email: u.email || "",
        displayName: u.displayName || "",
        lastSignInTime: u.metadata?.lastSignInTime || "",
      })),
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

async function handleBootstrapSelf(req, res, body) {
  /* The "I'm locked out — let me in" escape hatch.
     Only works if:
       (a) cfg.users is empty OR doesn't contain ANY admin, OR
       (b) the user's UID matches BOOTSTRAP_ADMIN_UID env var OR rules bootstrap UID
     Adds the current authenticated user as admin in cfg.users. */
  const auth = await verifyAnyAuthedToken(req.headers.authorization);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

  const db = getDb();
  const cfgRef = db.collection("factory").doc("config");
  const cfgSnap = await cfgRef.get();
  const cfg = cfgSnap.exists ? (cfgSnap.data() || {}) : {};

  /* Check eligibility */
  const bootstrapEnv = (process.env.BOOTSTRAP_ADMIN_UID || "").trim();
  const isEnvBootstrap = bootstrapEnv && auth.uid === bootstrapEnv;
  const isRulesBootstrap = auth.uid === RULES_BOOTSTRAP_UID;

  const existingUsers = cfg.users || {};
  const existingAdmins = Object.entries(existingUsers)
    .filter(([, v]) => (typeof v === "string" ? v : v?.role) === "admin");
  const noAdminExists = existingAdmins.length === 0;

  if (!isEnvBootstrap && !isRulesBootstrap && !noAdminExists) {
    return res.status(403).json({
      ok: false,
      error: "مفيش طريقة لـ bootstrap نفسك — في admin موجود بالفعل. اطلب منه يضيفك.",
      admins_count: existingAdmins.length,
      admins_sample: existingAdmins.slice(0, 3).map(([uid]) => uid),
    });
  }

  /* Add self as admin */
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(cfgRef);
    const c = snap.exists ? (snap.data() || {}) : {};
    const users = { ...(c.users || {}) };
    users[auth.uid] = "admin";

    let usersList = Array.isArray(c.usersList) ? c.usersList.slice() : [];
    const idx = usersList.findIndex(u => u && u.uid === auth.uid);
    const entry = { uid: auth.uid, email: auth.email || "", role: "admin", bootstrappedAt: new Date().toISOString() };
    if (idx >= 0) usersList[idx] = { ...usersList[idx], ...entry };
    else usersList.push(entry);

    tx.set(cfgRef, { users, usersList }, { merge: true });
  });

  try {
    await db.collection("migrationLog").doc("bootstrap-self-v21.9.24-" + Date.now()).set({
      type: "bootstrap-self",
      uid: auth.uid,
      email: auth.email,
      reason: isEnvBootstrap ? "BOOTSTRAP_ADMIN_UID env" : (isRulesBootstrap ? "rules bootstrap UID" : "no admin exists"),
      at: new Date().toISOString(),
    });
  } catch (_) {}

  return res.status(200).json({
    ok: true,
    uid: auth.uid,
    email: auth.email,
    role: "admin",
    message: "✅ تم تعيينك كـ admin. اعمل refresh للـ app.",
  });
}
