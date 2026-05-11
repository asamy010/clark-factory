/* ═══════════════════════════════════════════════════════════════
   CLARK — GET /api/admin/my-permissions (V21.9.24)
   ───────────────────────────────────────────────────────────────
   User-self diagnostic — returns the current user's role and
   effective permissions. Used by DiagnosticsPanel "My Permissions"
   panel to detect "I have permissions but my writes are denied".

   The bug this surfaces:
     - User UID not in factory/config.users
     - Firestore rules getRole() → 'viewer'
     - Viewer can't write to most collections → operations fail silently

   Auth: any authenticated user (NOT admin-only — every user needs
   to be able to check their own permissions).

   Returns: {
     ok, uid, email, role, isBootstrap, isInUsersList,
     permissions: { dashboard: "edit"|"view"|"hide", ... },
     warnings: ["..."],
     can_admin_changes: bool
   }
   ═══════════════════════════════════════════════════════════════ */

import { getDb, getAdminApp, setCors } from "../_firebase.js";

/* Same lookup logic as the Firestore rules — kept in sync manually.
   Order:
     1. Bootstrap UID (env BOOTSTRAP_ADMIN_UID OR rules-hardcoded UID)
     2. cfg.users[uid] (object or string)
     3. cfg.usersList[].find(u => u.email === decoded.email)
     4. Default: "viewer" */
const RULES_BOOTSTRAP_UID = "fJDTS57ndvVfPozGgwYybKJymuA3";

async function verifyAnyAuthedToken(token) {
  /* Lighter version of verifyAdminToken — accepts ANY authenticated user
     (not only admin/manager). We need this because viewers should be able
     to diagnose their own permissions. */
  if (!token || typeof token !== "string") {
    return { ok: false, status: 401, error: "رمز المصادقة مطلوب" };
  }
  const clean = token.startsWith("Bearer ") ? token.slice(7).trim() : token.trim();
  if (!clean) return { ok: false, status: 401, error: "رمز فارغ" };
  try {
    const decoded = await getAdminApp().auth().verifyIdToken(clean);
    if (!decoded || !decoded.uid) return { ok: false, status: 401, error: "Token غير صالح" };
    return { ok: true, uid: decoded.uid, email: decoded.email || "" };
  } catch (e) {
    return { ok: false, status: 401, error: "Token غير صالح: " + (e.message || "") };
  }
}

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "GET/POST فقط" });
  }
  const auth = await verifyAnyAuthedToken(req.headers.authorization);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  try {
    const db = getDb();
    const cfgSnap = await db.collection("factory").doc("config").get();
    const cfg = cfgSnap.exists ? (cfgSnap.data() || {}) : {};

    /* Determine role using the same logic as verifyAdminToken + Firestore rules */
    let role = "viewer";
    let source = "default (viewer)";
    let isBootstrap = false;
    let isInUsersList = false;

    const bootstrapEnv = (process.env.BOOTSTRAP_ADMIN_UID || "").trim();
    if (bootstrapEnv && auth.uid === bootstrapEnv) {
      role = "admin";
      source = "BOOTSTRAP_ADMIN_UID env var";
      isBootstrap = true;
    } else if (auth.uid === RULES_BOOTSTRAP_UID) {
      role = "admin";
      source = "Hardcoded rules bootstrap UID";
      isBootstrap = true;
    } else if (cfg.users && cfg.users[auth.uid] !== undefined) {
      const u = cfg.users[auth.uid];
      role = typeof u === "string"
        ? (u || "viewer")
        : (u && u.role) || "viewer";
      source = "cfg.users[" + auth.uid + "]";
      isInUsersList = true;
    } else if (Array.isArray(cfg.usersList) && auth.email) {
      const byEmail = cfg.usersList.find(u => u && u.email === auth.email);
      if (byEmail) {
        role = byEmail.role || "viewer";
        source = "cfg.usersList (by email)";
        isInUsersList = true;
      }
    }

    /* Effective permissions for this role */
    const permissions = (cfg.permissions && cfg.permissions[role]) || {};

    /* Warnings */
    const warnings = [];
    if (role === "viewer" && !isBootstrap) {
      warnings.push(
        "⚠️ الـ role بتاعك = 'viewer' — مفيش write permissions على معظم البيانات. " +
        "أي محاولة لـ save/edit/delete هـ تـ fail بصمت. " +
        "الـ admin لازم يضيف الـ UID بتاعك (" + auth.uid + ") لـ cfg.users."
      );
    }
    if (!isInUsersList && !isBootstrap) {
      warnings.push(
        "⚠️ الـ UID بتاعك مش موجود في cfg.users. الـ Firestore rules بـ تـ default لـ 'viewer'."
      );
    }
    if (Object.keys(permissions).length === 0 && role !== "admin") {
      warnings.push(
        "⚠️ مفيش permissions matrix معرّفة للـ role '" + role + "' في cfg.permissions. كل الصفحات هـ تكون hidden."
      );
    }

    /* Determine "what I can do" — common write operations */
    const can = {
      edit_settings: role === "admin",
      manage_users: role === "admin",
      edit_orders: ["admin", "manager"].includes(role),
      edit_sales: ["admin", "manager", "sales_accountant"].includes(role),
      edit_purchases: ["admin", "manager", "purchase_accountant"].includes(role),
      edit_treasury: ["admin", "manager", "purchase_accountant"].includes(role),
      edit_hr: ["admin", "manager", "payroll_accountant"].includes(role),
      edit_warehouse: ["admin", "manager", "purchase_accountant"].includes(role),
      view_audit_log: ["admin", "manager"].includes(role),
    };

    /* Total users assigned + admin count for context */
    const usersAssignedCount = Object.keys(cfg.users || {}).length;
    const admins = [];
    if (cfg.users) {
      for (const [uid, u] of Object.entries(cfg.users)) {
        const r = typeof u === "string" ? u : (u && u.role);
        if (r === "admin") admins.push(uid);
      }
    }

    return res.status(200).json({
      ok: true,
      uid: auth.uid,
      email: auth.email,
      role,
      source,
      isBootstrap,
      isInUsersList,
      permissions,
      can,
      warnings,
      cfg_users_count: usersAssignedCount,
      admin_count: admins.length,
      generated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[V21.9.24 my-permissions] failed:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
