/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/admin/role-scopes (V21.9.32)
   ───────────────────────────────────────────────────────────────
   Dynamic role-scope management. Pre-V21.9.32 the scopes (which
   roles map to isPurchaseScope, isSalesScope, etc.) were
   hardcoded in firestore.rules. To change them you had to edit
   the file and republish.

   Post-V21.9.32 the scopes live in factory/roleScopes and rules
   read them via get() on every request. Admin can edit them from
   the UI, changes take effect IMMEDIATELY (no rule republish).

   Actions:
     • action="get" — return current factory/roleScopes (or defaults)
     • action="set" — update factory/roleScopes (admin only)
     • action="init" — create factory/roleScopes with defaults if missing
     • action="reset" — restore defaults

   Auth: admin Bearer
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";

const VALID_ROLES = [
  "admin", "manager",
  "sales_accountant", "purchase_accountant",
  "warehouse_keeper",
  "payroll_accountant", "payroll_verifier",
  "viewer",
];

/* Default scopes — must match the fallback values in firestore.rules.
   When you bump these, also update the inScope() fallback arrays in
   firestore.rules so behavior matches when the doc doesn't exist. */
const DEFAULT_SCOPES = {
  isAdmin:         ["admin"],
  isManagerPlus:   ["admin", "manager"],
  isSalesScope:    ["admin", "manager", "sales_accountant"],
  isPurchaseScope: ["admin", "manager", "purchase_accountant", "warehouse_keeper"],
  isWarehouseScope:["admin", "manager", "purchase_accountant", "warehouse_keeper"],
  isAnyAccountant: ["admin", "manager", "sales_accountant", "purchase_accountant", "payroll_accountant"],
  isHRRole:        ["admin", "manager", "payroll_accountant", "payroll_verifier"],
  isHRWriter:      ["admin", "manager", "payroll_accountant"],
  isAnyUser:       ["admin", "manager", "sales_accountant", "purchase_accountant", "warehouse_keeper", "payroll_accountant", "payroll_verifier", "viewer"],
};

const SCOPE_LABELS_AR = {
  isAdmin:         "👑 Admin فقط",
  isManagerPlus:   "⭐ Manager+",
  isSalesScope:    "💰 Sales Scope (مبيعات + عملاء + invoices)",
  isPurchaseScope: "🛒 Purchase Scope (مشتريات + خزنة + warehouse)",
  isWarehouseScope:"📦 Warehouse Scope (مخزن + استلام)",
  isAnyAccountant: "📊 Any Accountant (محاسبين عموماً)",
  isHRRole:        "🧑‍💼 HR Role (مرتبات قراءة)",
  isHRWriter:      "✍️ HR Writer (مرتبات كتابة)",
  isAnyUser:       "👥 Any User (أي مستخدم authed)",
};

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST فقط" });
  }
  const auth = await verifyAdminToken(req.headers.authorization);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  const body = (typeof req.body === "string") ? JSON.parse(req.body || "{}") : (req.body || {});
  const action = String(body.action || "get").trim();

  try {
    if (action === "get") return handleGet(res);
    if (action === "init") return handleInit(res, auth);
    if (action === "reset") return handleReset(res, auth);
    if (action === "set") return handleSet(res, auth, body);
    return res.status(400).json({ ok: false, error: "action غير معروف" });
  } catch (e) {
    console.error("[V21.9.32 role-scopes] failed:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}

async function handleGet(res) {
  const db = getDb();
  const snap = await db.collection("factory").doc("roleScopes").get();
  const exists = snap.exists;
  const data = exists ? (snap.data() || {}) : {};
  /* Merge with defaults so missing scopes show their fallback */
  const merged = {};
  for (const [scope, defaultRoles] of Object.entries(DEFAULT_SCOPES)) {
    merged[scope] = Array.isArray(data[scope]) ? data[scope] : defaultRoles;
  }
  return res.status(200).json({
    ok: true,
    exists,
    scopes: merged,
    defaults: DEFAULT_SCOPES,
    labels: SCOPE_LABELS_AR,
    valid_roles: VALID_ROLES,
    raw: data,
  });
}

async function handleInit(res, auth) {
  const db = getDb();
  const ref = db.collection("factory").doc("roleScopes");
  const snap = await ref.get();
  if (snap.exists) {
    return res.status(200).json({
      ok: true,
      skipped: true,
      message: "factory/roleScopes موجود بالفعل. استخدم action='reset' لاسترجاع الـ defaults.",
    });
  }
  await ref.set({
    ...DEFAULT_SCOPES,
    initialized_at: new Date().toISOString(),
    initialized_by: auth.email || auth.uid,
  });
  try {
    await db.collection("migrationLog").doc("init-role-scopes-v21.9.32-" + Date.now()).set({
      type: "init-role-scopes-v21.9.32",
      status: "success",
      by: auth.email || auth.uid,
      at: new Date().toISOString(),
    });
  } catch (_) {}
  return res.status(200).json({
    ok: true,
    message: "✅ تم إنشاء factory/roleScopes بـ defaults",
    scopes: DEFAULT_SCOPES,
  });
}

async function handleReset(res, auth) {
  const db = getDb();
  const ref = db.collection("factory").doc("roleScopes");
  /* Backup current before reset */
  const snap = await ref.get();
  const before = snap.exists ? (snap.data() || {}) : null;
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  if (before) {
    await db.collection("backups").doc("pre-reset-role-scopes-v21.9.32-" + ts).set({
      label: "Backup قبل reset role-scopes",
      autoGenerated: true,
      migrationType: "reset-role-scopes-v21.9.32",
      createdAt: new Date().toISOString(),
      createdBy: auth.email || auth.uid,
      before,
    });
  }
  await ref.set({
    ...DEFAULT_SCOPES,
    reset_at: new Date().toISOString(),
    reset_by: auth.email || auth.uid,
  });
  try {
    await db.collection("migrationLog").doc("reset-role-scopes-v21.9.32-" + Date.now()).set({
      type: "reset-role-scopes-v21.9.32",
      status: "success",
      by: auth.email || auth.uid,
      at: new Date().toISOString(),
    });
  } catch (_) {}
  return res.status(200).json({
    ok: true,
    message: "✅ تم استرجاع الـ defaults",
    scopes: DEFAULT_SCOPES,
  });
}

async function handleSet(res, auth, body) {
  const scopes = body.scopes;
  if (!scopes || typeof scopes !== "object") {
    return res.status(400).json({ ok: false, error: "scopes (object) مطلوب" });
  }

  /* Validate: each scope is an array of valid role keys */
  const errors = [];
  const sanitized = {};
  for (const [scopeName, roles] of Object.entries(scopes)) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_SCOPES, scopeName)) {
      errors.push(`Unknown scope: ${scopeName}`);
      continue;
    }
    if (!Array.isArray(roles)) {
      errors.push(`Scope ${scopeName}: roles must be array`);
      continue;
    }
    const cleanRoles = [];
    for (const r of roles) {
      const role = String(r).trim();
      if (!role) continue;
      if (!VALID_ROLES.includes(role)) {
        errors.push(`Scope ${scopeName}: invalid role "${role}"`);
        continue;
      }
      if (cleanRoles.indexOf(role) < 0) cleanRoles.push(role);
    }
    /* Safety check: admin MUST be in every scope (else admin would lose access) */
    if (cleanRoles.indexOf("admin") < 0) {
      cleanRoles.unshift("admin");
    }
    sanitized[scopeName] = cleanRoles;
  }

  if (errors.length > 0) {
    return res.status(400).json({ ok: false, error: errors.join("; ") });
  }

  const db = getDb();
  const ref = db.collection("factory").doc("roleScopes");

  /* Backup before set */
  const beforeSnap = await ref.get();
  const before = beforeSnap.exists ? (beforeSnap.data() || {}) : null;
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  if (before) {
    await db.collection("backups").doc("pre-set-role-scopes-v21.9.32-" + ts).set({
      label: "Backup قبل تعديل role-scopes",
      autoGenerated: true,
      migrationType: "set-role-scopes-v21.9.32",
      createdAt: new Date().toISOString(),
      createdBy: auth.email || auth.uid,
      before,
      after: sanitized,
    });
  }

  await ref.set({
    ...sanitized,
    updated_at: new Date().toISOString(),
    updated_by: auth.email || auth.uid,
  }, { merge: true });

  try {
    await db.collection("migrationLog").doc("set-role-scopes-v21.9.32-" + Date.now()).set({
      type: "set-role-scopes-v21.9.32",
      status: "success",
      scopes_updated: Object.keys(sanitized),
      by: auth.email || auth.uid,
      at: new Date().toISOString(),
    });
  } catch (_) {}

  return res.status(200).json({
    ok: true,
    scopes_updated: Object.keys(sanitized),
    message: "✅ تم تحديث الـ scopes. التغيير بـ يـ take effect فوراً (مفيش rules republish).",
  });
}
