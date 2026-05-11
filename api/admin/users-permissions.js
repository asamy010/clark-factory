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

/* V21.9.26: warehouse_keeper added (was missing in V21.9.24!) */
const VALID_ROLES = [
  "admin", "manager",
  "sales_accountant", "purchase_accountant",
  "warehouse_keeper",
  "payroll_accountant", "payroll_verifier",
  "viewer",
];

/* V21.9.26: Arabic role labels → English keys mapping.
   The legacy cfg.usersList sometimes stored roles as Arabic labels
   ("محاسب مشتريات") instead of English keys ("purchase_accountant").
   The Firestore rules' getRole() compares against English keys, so
   Arabic-labeled users default to viewer → can't write anything.

   This map covers all standard labels + common variations + custom
   titles users gave their roles. Custom roles (cfg.customRoles[]) use
   their own keys and are passed through as-is. */
const ARABIC_TO_ENGLISH_ROLES = {
  "مدير عام": "admin",
  "مدير النظام": "admin",
  "أدمن": "admin",
  "admin": "admin",
  "مدير": "manager",
  "manager": "manager",
  "محاسب مبيعات": "sales_accountant",
  "محاسب المبيعات": "sales_accountant",
  "محاسب مشتريات": "purchase_accountant",
  "محاسب المشتريات": "purchase_accountant",
  "محاسب الخزنة": "purchase_accountant", /* treasury is under purchase scope */
  "محاسب خزنة": "purchase_accountant",
  "أمين مخزن": "warehouse_keeper",
  "أمين المخزن": "warehouse_keeper",
  "أمين مخازن": "warehouse_keeper",
  "محاسب مرتبات": "payroll_accountant",
  "محاسب الرواتب": "payroll_accountant",
  "محاسب رواتب": "payroll_accountant",
  "مُؤكِّد استلام": "payroll_verifier",
  "مؤكد استلام": "payroll_verifier",
  "مشاهد": "viewer",
  "viewer": "viewer",
  /* English keys map to themselves (idempotent) */
  "sales_accountant": "sales_accountant",
  "purchase_accountant": "purchase_accountant",
  "warehouse_keeper": "warehouse_keeper",
  "payroll_accountant": "payroll_accountant",
  "payroll_verifier": "payroll_verifier",
};

function normalizeRole(rawRole, customRoleKeys) {
  /* Returns the English key for a role string. Handles:
     - English keys (idempotent)
     - Arabic labels (lookup in map)
     - Custom role keys (passed through if in cfg.customRoles)
     - Unknown/empty → "viewer" (safe default) */
  if (!rawRole) return "viewer";
  const trimmed = String(rawRole).trim();
  if (ARABIC_TO_ENGLISH_ROLES[trimmed]) return ARABIC_TO_ENGLISH_ROLES[trimmed];
  if (customRoleKeys && customRoleKeys.has(trimmed)) return trimmed;
  if (VALID_ROLES.includes(trimmed)) return trimmed;
  return "viewer";
}

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
    if (action === "sync_audit") return handleSyncAudit(res, auth);
    if (action === "sync_apply") return handleSyncApply(res, auth, body);
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

/* ═══════════════════════════════════════════════════════════════
   V21.9.26 — handleSyncAudit + handleSyncApply
   ───────────────────────────────────────────────────────────────
   Audit + fix mismatches between cfg.users (rules-source) and
   cfg.usersList (legacy/display-source).

   Common bugs this fixes:
   - User in cfg.usersList with Arabic role "محاسب مشتريات" but
     cfg.users has them as "sales_accountant" (or missing entirely)
     → Firestore rules deny purchase scope → user can't access
     treasury/warehouse despite the Settings page showing the right role
   - Custom roles in cfg.customRoles not propagated to cfg.users
   - "محاسب الخزنة" / "أمين مخزن" titles weren't covered by V21.9.24
     VALID_ROLES (warehouse_keeper was missing!)
   ═══════════════════════════════════════════════════════════════ */
async function handleSyncAudit(res, auth) {
  const db = getDb();
  const cfgSnap = await db.collection("factory").doc("config").get();
  const cfg = cfgSnap.exists ? (cfgSnap.data() || {}) : {};

  const customRoleKeys = new Set(
    (Array.isArray(cfg.customRoles) ? cfg.customRoles : [])
      .map(r => r && r.key)
      .filter(Boolean)
  );

  /* Build a unified view: for each known user, show what each source says */
  const merged = new Map(); /* uid|email → entry */

  /* 1) cfg.users */
  if (cfg.users && typeof cfg.users === "object") {
    for (const [uid, val] of Object.entries(cfg.users)) {
      const rawRole = typeof val === "string" ? val : (val && val.role) || "";
      const email = (typeof val === "object" && val) ? (val.email || "") : "";
      merged.set(uid, {
        uid, email,
        users_raw_role: rawRole,
        users_normalized: normalizeRole(rawRole, customRoleKeys),
        userslist_raw_role: null,
        userslist_normalized: null,
      });
    }
  }

  /* 2) cfg.usersList */
  if (Array.isArray(cfg.usersList)) {
    for (const u of cfg.usersList) {
      if (!u || !u.email) continue;
      /* Find existing by uid or email */
      const existing = Array.from(merged.values()).find(
        x => (u.uid && x.uid === u.uid) || (u.email && x.email === u.email)
      );
      if (existing) {
        if (!existing.email) existing.email = u.email;
        if (!existing.uid && u.uid) {
          /* Promote: remove old key, set new uid key */
          merged.delete(existing.email);
          existing.uid = u.uid;
          merged.set(u.uid, existing);
        }
        existing.userslist_raw_role = u.role || "";
        existing.userslist_normalized = normalizeRole(u.role, customRoleKeys);
      } else {
        const key = u.uid || "email:" + u.email;
        merged.set(key, {
          uid: u.uid || "",
          email: u.email,
          users_raw_role: null,
          users_normalized: null,
          userslist_raw_role: u.role || "",
          userslist_normalized: normalizeRole(u.role, customRoleKeys),
        });
      }
    }
  }

  /* 3) Enrich with Firebase Auth for display name + resolve missing UIDs */
  const auth_app = getAdminApp().auth();
  const finalUsers = [];
  for (const entry of merged.values()) {
    let displayName = "";
    let lastSignIn = "";
    let resolvedUid = entry.uid;
    if (!resolvedUid && entry.email) {
      try {
        const rec = await auth_app.getUserByEmail(entry.email);
        resolvedUid = rec.uid;
        displayName = rec.displayName || "";
        lastSignIn = rec.metadata?.lastSignInTime || "";
      } catch (_) { /* not in Auth */ }
    } else if (resolvedUid) {
      try {
        const rec = await auth_app.getUser(resolvedUid);
        displayName = rec.displayName || "";
        lastSignIn = rec.metadata?.lastSignInTime || "";
        if (!entry.email) entry.email = rec.email || "";
      } catch (_) { /* may have been deleted */ }
    }

    /* Decide the recommended FINAL role */
    let recommendedRole;
    let recommendedReason;
    const u = entry.users_normalized;
    const l = entry.userslist_normalized;

    if (u && l) {
      if (u === l) {
        recommendedRole = u;
        recommendedReason = "matched";
      } else {
        /* MISMATCH — prefer cfg.usersList (the source admin edits via Settings) */
        recommendedRole = l;
        recommendedReason = "mismatch — using usersList value";
      }
    } else if (u && !l) {
      recommendedRole = u;
      recommendedReason = "only in cfg.users";
    } else if (!u && l) {
      recommendedRole = l;
      recommendedReason = "only in cfg.usersList — needs sync to cfg.users";
    } else {
      recommendedRole = "viewer";
      recommendedReason = "no role anywhere — defaulting to viewer";
    }

    /* Detect issues */
    const issues = [];
    if (!resolvedUid) issues.push("missing_uid"); /* Can't be in cfg.users without UID */
    if (u && !l) issues.push("missing_from_userslist");
    if (!u && l) issues.push("missing_from_users"); /* ← the rules will deny everything */
    if (u && l && u !== l) issues.push("role_mismatch");
    if (entry.userslist_raw_role && !ARABIC_TO_ENGLISH_ROLES[entry.userslist_raw_role] && !customRoleKeys.has(entry.userslist_raw_role) && !VALID_ROLES.includes(entry.userslist_raw_role)) {
      issues.push("unknown_role_label");
    }
    if (!u && !l) issues.push("no_role");

    finalUsers.push({
      uid: resolvedUid || "",
      email: entry.email,
      display_name: displayName,
      last_sign_in: lastSignIn,
      users_raw: entry.users_raw_role,
      users_normalized: entry.users_normalized,
      userslist_raw: entry.userslist_raw_role,
      userslist_normalized: entry.userslist_normalized,
      recommended_role: recommendedRole,
      recommended_reason: recommendedReason,
      issues,
      will_change: (entry.users_normalized !== recommendedRole) ||
                   (entry.userslist_normalized !== recommendedRole) ||
                   issues.includes("missing_from_users") ||
                   issues.includes("missing_from_userslist"),
    });
  }

  /* Sort: issues first, then alphabetically */
  finalUsers.sort((a, b) => {
    if (a.issues.length !== b.issues.length) return b.issues.length - a.issues.length;
    return (a.email || "").localeCompare(b.email || "");
  });

  const totalIssues = finalUsers.reduce((sum, u) => sum + u.issues.length, 0);
  const willChangeCount = finalUsers.filter(u => u.will_change).length;

  return res.status(200).json({
    ok: true,
    users: finalUsers,
    total: finalUsers.length,
    total_issues: totalIssues,
    will_change_count: willChangeCount,
    valid_roles: VALID_ROLES,
    custom_roles: Array.from(customRoleKeys),
    arabic_to_english: ARABIC_TO_ENGLISH_ROLES,
    your_uid: auth.uid,
    summary: {
      role_mismatches: finalUsers.filter(u => u.issues.includes("role_mismatch")).length,
      missing_from_users: finalUsers.filter(u => u.issues.includes("missing_from_users")).length,
      missing_from_userslist: finalUsers.filter(u => u.issues.includes("missing_from_userslist")).length,
      unknown_labels: finalUsers.filter(u => u.issues.includes("unknown_role_label")).length,
      missing_uid: finalUsers.filter(u => u.issues.includes("missing_uid")).length,
    },
  });
}

async function handleSyncApply(res, auth, body) {
  /* Body: { changes: [{ uid, email, role }] } — explicitly approved list
     from the audit. Each entry will be written to BOTH cfg.users[uid] = role
     AND cfg.usersList[i].role = role. */
  const changes = Array.isArray(body.changes) ? body.changes : null;
  if (!changes || changes.length === 0) {
    return res.status(400).json({ ok: false, error: "changes array مطلوبة" });
  }
  /* Validate all roles */
  const db = getDb();
  const cfgSnap = await db.collection("factory").doc("config").get();
  const cfg = cfgSnap.exists ? (cfgSnap.data() || {}) : {};
  const customRoleKeys = new Set(
    (Array.isArray(cfg.customRoles) ? cfg.customRoles : [])
      .map(r => r && r.key).filter(Boolean)
  );
  const validKeys = new Set([...VALID_ROLES, ...customRoleKeys]);
  for (const c of changes) {
    if (!c.uid && !c.email) {
      return res.status(400).json({ ok: false, error: "كل change لازم يحتوي uid أو email" });
    }
    if (!validKeys.has(c.role)) {
      return res.status(400).json({ ok: false, error: "role غير صالح في change: " + c.role });
    }
  }

  /* Backup before any write */
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupId = "pre-users-sync-v21.9.26-" + ts;
  await db.collection("backups").doc(backupId).set({
    label: "Backup قبل users-sync V21.9.26",
    autoGenerated: true,
    migrationType: "users-sync-v21.9.26",
    createdAt: new Date().toISOString(),
    createdBy: auth.email || auth.uid,
    users_before: cfg.users || {},
    usersList_before: cfg.usersList || [],
    changes_to_apply: changes,
  });

  const cfgRef = db.collection("factory").doc("config");
  await db.runTransaction(async (tx) => {
    const fresh = (await tx.get(cfgRef)).data() || {};
    const users = { ...(fresh.users || {}) };
    let usersList = Array.isArray(fresh.usersList) ? fresh.usersList.slice() : [];

    for (const c of changes) {
      /* Update cfg.users[uid] (the rules source) */
      if (c.uid) users[c.uid] = c.role;

      /* Update cfg.usersList[i] (the Settings page source) */
      const idx = usersList.findIndex(u =>
        u && ((c.uid && u.uid === c.uid) || (c.email && u.email === c.email))
      );
      const entry = {
        uid: c.uid || "",
        email: c.email || "",
        role: c.role,
        syncedAt: new Date().toISOString(),
      };
      if (idx >= 0) {
        usersList[idx] = { ...usersList[idx], ...entry };
      } else {
        usersList.push(entry);
      }
    }

    tx.set(cfgRef, { users, usersList }, { merge: true });
  });

  /* Audit log */
  try {
    await db.collection("migrationLog").doc("users-sync-v21.9.26-" + Date.now()).set({
      type: "users-sync-v21.9.26",
      changes_count: changes.length,
      changes,
      backup_doc_id: backupId,
      by: auth.email || auth.uid,
      at: new Date().toISOString(),
    });
  } catch (_) {}

  return res.status(200).json({
    ok: true,
    applied: changes.length,
    backup_doc_id: backupId,
    message: "✅ تم sync " + changes.length + " user. اطلب من المستخدمين يعملوا hard refresh (Ctrl+Shift+R) عشان الصلاحيات تتفعّل.",
  });
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
