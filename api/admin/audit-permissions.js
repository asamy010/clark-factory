/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/admin/audit-permissions (V21.9.30)
   ───────────────────────────────────────────────────────────────
   Cross-checks the 3 layers of CLARK's permission system:
     Layer 1 — firestore.rules (server-side enforcement)
     Layer 2 — cfg.users[uid] (role assignment per user)
     Layer 3 — cfg.permissions[role] (UI tab visibility)

   Detects MISMATCHES that cause "user sees tab but data is empty"
   bugs:

     payroll_accountant.treasury = "view" in cfg.permissions
       → UI shows the tab
       → Firestore rule for treasuryDays = isPurchaseScope (NOT
         payroll_accountant)
       → onSnapshot fails with permission-denied → tab shows 0 rows

   Actions:
     • action="audit" — returns conflict report
     • action="autofix" — adjusts cfg.permissions[role] to match rules
       (downgrades "view"/"edit" → "hide" where rules deny)

   Auth: admin Bearer
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";

/* The firestore.rules scope-to-role mapping, hardcoded.
   MUST stay in sync with firestore.rules. */
const SCOPES = {
  isAdmin:        ["admin"],
  isManagerPlus:  ["admin", "manager"],
  isSalesScope:   ["admin", "manager", "sales_accountant"],
  isPurchaseScope:["admin", "manager", "purchase_accountant", "warehouse_keeper"],
  isAnyAccountant:["admin", "manager", "sales_accountant", "purchase_accountant", "payroll_accountant"],
  isHRRole:       ["admin", "manager", "payroll_accountant", "payroll_verifier"],
  isHRWriter:     ["admin", "manager", "payroll_accountant"],
  isAnyUser:      ["admin", "manager", "sales_accountant", "purchase_accountant", "warehouse_keeper", "payroll_accountant", "payroll_verifier", "viewer"],
};

/* Collection → { read scope, write scope } mapping.
   Hardcoded from firestore.rules — keep in sync. */
const COLLECTION_RULES = {
  /* factory/config — special (admin always, manager non-sensitive) */
  "factory/config":           { read: "isAnyUser", write: "isManagerPlus" },
  "seasons/orders":           { read: "isAnyUser", write: "isManagerPlus" },
  "accountingDays":           { read: "isAnyAccountant", write: "isAnyAccountant" },
  "treasuryDays":             { read: "isPurchaseScope", write: "isPurchaseScope" },
  "auditDays":                { read: "isManagerPlus", write: "isManagerPlus" },
  "hrLogDays":                { read: "isHRRole", write: "isHRRole" },
  "hrWeeksDocs":              { read: "isHRRole", write: "isHRWriter" },
  "customersDocs":            { read: "isAnyUser", write: "isSalesScope" },
  "suppliersDocs":            { read: "isAnyUser", write: "isPurchaseScope" },
  "workshopsDocs":            { read: "isAnyUser", write: "isManagerPlus" },
  "employeesDocs":            { read: "isHRRole", write: "isHRWriter" },
  "empDebtsDocs":             { read: "isHRRole", write: "isHRWriter" },
  "generalProductsDocs":      { read: "isAnyUser", write: "isPurchaseScope" },
  "fabricsDocs":              { read: "isAnyUser", write: "isManagerPlus" },
  "accessoriesDocs":          { read: "isAnyUser", write: "isManagerPlus" },
  "custPaymentsDays":         { read: "isAnyAccountant", write: "isSalesScope_or_Purchase" }, /* hybrid */
  "supplierPaymentsDays":     { read: "isPurchaseScope", write: "isPurchaseScope" },
  "wsPaymentsDays":           { read: "isPurchaseScope", write: "isPurchaseScope" },
  "checksDays":               { read: "isAnyAccountant", write: "isPurchaseScope" },
  "salesInvoicesDays":        { read: "isSalesScope", write: "isSalesScope" },
  "purchaseInvoicesDays":     { read: "isPurchaseScope", write: "isPurchaseScope" },
  "purchaseOrdersDays":       { read: "isPurchaseScope", write: "isPurchaseScope" },
  "packagesDays":             { read: "isAnyUser", write: "isSalesScope" },
  "custDeliverySessionsDays": { read: "isAnyUser", write: "isSalesScope" },
  "tasksDays":                { read: "isAnyUser", write: "isAnyUser" },
  "stickyNotesDays":          { read: "isAnyUser", write: "isAnyUser" },
  "inventoryAuditsDays":      { read: "isAnyUser", write: "isSalesScope" },
  "stockMovementsDays":       { read: "isAnyUser", write: "isPurchaseScope" },
  "purchaseReceiptsDays":     { read: "isPurchaseScope", write: "isPurchaseScope" },
  "treasuryTransfersDays":    { read: "isPurchaseScope", write: "isPurchaseScope" },
  "salesAuditsDays":          { read: "isAnyUser", write: "isSalesScope" },
  "notificationsDays":        { read: "isAnyUser", write: "isAnyUser" },
  "fixedAssets":              { read: "isAnyAccountant", write: "isManagerPlus" },
  "shopifyProductsDocs":      { read: "isAnyUser", write: "isManagerPlus" },
  "shopifyCustomersDocs":     { read: "isAnyUser", write: "isSalesScope" },
  "shopifyOrdersDays":        { read: "isAnyUser", write: "isSalesScope" },
  "shopifyOrdersArchive":     { read: "isAnyUser", write: "isManagerPlus" },
  "bostaDeliveriesArchive":   { read: "isAnyUser", write: "isManagerPlus" },
  "salesCreditNotesDays":     { read: "isSalesScope", write: "isSalesScope" },
  "purchaseDebitNotesDays":   { read: "isPurchaseScope", write: "isPurchaseScope" },
  "shopifyReturnRequestsDays":{ read: "isAnyUser", write: "isSalesScope" },
  "whatsappCampaignsDays":    { read: "isAnyUser", write: "isSalesScope" },
  "whatsappCampaignRunsDays": { read: "isAnyUser", write: "isSalesScope" },
  "syncJobs":                 { read: "isAnyUser", write: "isManagerPlus" },
};

/* Permission tab → primary collection(s) mapping.
   When the UI tab "treasury" is shown, the listener subscribes to
   treasuryDays + treasuryTransfersDays. */
const TAB_COLLECTIONS = {
  dashboard:        ["factory/config"],
  details:          ["seasons/orders"],
  external:         ["seasons/orders", "stockMovementsDays"],
  reports:          ["factory/config"],
  tasks:            ["tasksDays", "stickyNotesDays"],
  db:               ["customersDocs", "suppliersDocs", "workshopsDocs"],
  custDeliver:      ["custDeliverySessionsDays", "packagesDays", "custPaymentsDays"],
  salesInvoices:    ["salesInvoicesDays"],
  creditNotes:      ["salesCreditNotesDays"],
  purchase:         ["purchaseOrdersDays", "purchaseReceiptsDays"],
  purchaseInvoices: ["purchaseInvoicesDays"],
  debitNotes:       ["purchaseDebitNotesDays"],
  warehouse:        ["stockMovementsDays", "generalProductsDocs", "inventoryAuditsDays"],
  pieces:           ["seasons/orders"],
  treasury:         ["treasuryDays", "treasuryTransfersDays", "supplierPaymentsDays", "wsPaymentsDays", "checksDays"],
  hr:               ["hrWeeksDocs", "hrLogDays", "employeesDocs", "empDebtsDocs"],
  campaigns:        ["whatsappCampaignsDays", "whatsappCampaignRunsDays"],
  automation:       ["factory/config"],
  aiAgent:          ["factory/config"],
  shopify:          ["shopifyProductsDocs", "shopifyCustomersDocs", "shopifyOrdersDays", "shopifyOrdersArchive", "bostaDeliveriesArchive", "shopifyReturnRequestsDays"],
  audit:            ["auditDays"],
  accounting:       ["accountingDays"],
  fixedAssets:      ["fixedAssets"],
  settings:         ["factory/config"],
};

const ROLES = ["admin", "manager", "sales_accountant", "purchase_accountant", "warehouse_keeper", "payroll_accountant", "payroll_verifier", "viewer"];

/* V21.9.64: accept an `effectiveScopes` arg so we honor admin customizations
   from factory/roleScopes. Without this, the audit reports FALSE POSITIVES
   whenever admin has edited scopes (e.g., added sales_accountant to
   isPurchaseScope via the V21.9.63 auto-sync) — the hardcoded SCOPES map
   would still show the role as denied, even though the live rules allow.
   This was Ahmed's "بعد ما حفظت الصلاحيات لسه فيه 14 conflict" complaint. */
function ruleAllowsRead(role, collection, effectiveScopes) {
  const rule = COLLECTION_RULES[collection];
  if (!rule) return null; /* unknown collection */
  const scopes = effectiveScopes || SCOPES;
  const readScope = rule.read;
  if (readScope === "isSalesScope_or_Purchase") {
    return (scopes.isSalesScope || []).includes(role) || (scopes.isPurchaseScope || []).includes(role);
  }
  const allowedRoles = scopes[readScope] || [];
  return allowedRoles.includes(role);
}

function ruleAllowsWrite(role, collection, effectiveScopes) {
  const rule = COLLECTION_RULES[collection];
  if (!rule) return null;
  const scopes = effectiveScopes || SCOPES;
  const writeScope = rule.write;
  if (writeScope === "isSalesScope_or_Purchase") {
    return (scopes.isSalesScope || []).includes(role) || (scopes.isPurchaseScope || []).includes(role);
  }
  const allowedRoles = scopes[writeScope] || [];
  return allowedRoles.includes(role);
}

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
  const action = String(body.action || "audit").trim();

  try {
    if (action === "audit") return handleAudit(res, body);
    if (action === "autofix") return handleAutofix(res, auth, body);
    return res.status(400).json({ ok: false, error: "action غير معروف" });
  } catch (e) {
    console.error("[V21.9.30 audit-permissions] failed:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}

async function handleAudit(res, body) {
  const db = getDb();
  const cfgSnap = await db.collection("factory").doc("config").get();
  const cfg = cfgSnap.exists ? (cfgSnap.data() || {}) : {};
  const permissions = cfg.permissions || {};

  /* V21.9.64: read the live factory/roleScopes doc and merge over the
     hardcoded SCOPES defaults. The Firestore rules read this doc at runtime
     (firestore.rules:inScope), so the audit MUST use the same view of
     truth — otherwise admin customizations via Diagnostics → Role Scopes
     Editor or via the V21.9.63 auto-sync produce false-positive conflicts.

     Pre-V21.9.64: hardcoded SCOPES only → after admin adds sales_accountant
     to isPurchaseScope, the live rules allow but audit still says deny → 14
     phantom conflicts in the panel even though everything works. */
  let effectiveScopes = { ...SCOPES };
  try {
    const scopesSnap = await db.collection("factory").doc("roleScopes").get();
    if (scopesSnap.exists) {
      const live = scopesSnap.data() || {};
      for (const k of Object.keys(SCOPES)) {
        if (Array.isArray(live[k])) effectiveScopes[k] = live[k];
      }
    }
  } catch (e) {
    console.warn("[V21.9.64 audit] could not read factory/roleScopes — falling back to hardcoded defaults:", e?.message || e);
  }

  /* The role-to-tab matrix per cfg.permissions */
  const matrix = {};
  for (const role of ROLES) {
    matrix[role] = permissions[role] || {};
  }

  /* Conflicts: per role, per tab */
  const conflicts = [];
  /* Cells: per (role, tab) what's expected vs actual */
  const cells = [];

  for (const role of ROLES) {
    for (const [tab, collections] of Object.entries(TAB_COLLECTIONS)) {
      const matrixVal = (matrix[role] || {})[tab];
      const effectiveMatrix = matrixVal === undefined ? null : (typeof matrixVal === "object" ? "object" : matrixVal);

      /* For each collection this tab depends on, check rules using
         effectiveScopes (live + defaults), not just hardcoded. */
      let canReadAll = true, canWriteAll = true;
      const deniedReads = [];
      const deniedWrites = [];
      for (const coll of collections) {
        const r = ruleAllowsRead(role, coll, effectiveScopes);
        const w = ruleAllowsWrite(role, coll, effectiveScopes);
        if (r === false) { canReadAll = false; deniedReads.push(coll); }
        if (w === false) { canWriteAll = false; deniedWrites.push(coll); }
      }

      const cell = {
        role, tab,
        matrix: effectiveMatrix,
        can_read: canReadAll,
        can_write: canWriteAll,
        denied_reads: deniedReads,
        denied_writes: deniedWrites,
        recommended: null,
        conflict: null,
      };

      /* Detect conflicts */
      if (effectiveMatrix === "edit" && !canWriteAll) {
        /* UI says "edit" but rules deny write → user can't save */
        cell.conflict = "matrix_says_edit_but_rules_deny_write";
        cell.recommended = canReadAll ? "view" : "hide";
        conflicts.push(cell);
      } else if (effectiveMatrix === "view" && !canReadAll) {
        /* UI says "view" but rules deny read → user sees empty tab */
        cell.conflict = "matrix_says_view_but_rules_deny_read";
        cell.recommended = "hide";
        conflicts.push(cell);
      /* V21.21.39 (اكتشفه ESLint no-dupe-else-if): كان هنا فرع ثالث
         `edit && canReadAll && !canWriteAll` — مستحيل يتنفذ لأن الفرع
         الأول (edit && !canWriteAll) أعمّ منه وبيمسك حالته بنفس التوصية
         (view لو canReadAll). فرع ميت اتشال — صفر تغيير في السلوك. */
      } else if (effectiveMatrix === "hide" && canReadAll && role !== "admin") {
        /* Rules allow but UI hides — informational only, not a critical bug */
        cell.conflict = "hidden_but_rules_allow"; /* low severity */
        cell.recommended = "view"; /* suggest */
      }

      cells.push(cell);
    }
  }

  /* Summary */
  const criticalConflicts = conflicts.filter(c =>
    c.conflict === "matrix_says_edit_but_rules_deny_write" ||
    c.conflict === "matrix_says_view_but_rules_deny_read"
  );
  const summary = {
    total_cells: cells.length,
    total_conflicts: conflicts.length,
    critical_conflicts: criticalConflicts.length,
    by_role: {},
  };
  for (const role of ROLES) {
    const rolesConflicts = conflicts.filter(c => c.role === role);
    summary.by_role[role] = {
      total: rolesConflicts.length,
      critical: rolesConflicts.filter(c =>
        c.conflict === "matrix_says_edit_but_rules_deny_write" ||
        c.conflict === "matrix_says_view_but_rules_deny_read"
      ).length,
    };
  }

  return res.status(200).json({
    ok: true,
    conflicts: criticalConflicts, /* return only critical to keep response light */
    all_conflicts: conflicts,     /* for full inspection */
    cells,
    summary,
    roles: ROLES,
    tabs: Object.keys(TAB_COLLECTIONS),
  });
}

async function handleAutofix(res, auth, body) {
  /* Apply the audit recommendations: for each critical conflict, change
     cfg.permissions[role][tab] to the recommended value. */
  const dryRun = body.dryRun === true;
  const db = getDb();
  const cfgRef = db.collection("factory").doc("config");
  const cfgSnap = await cfgRef.get();
  const cfg = cfgSnap.exists ? (cfgSnap.data() || {}) : {};
  const permissions = { ...(cfg.permissions || {}) };

  /* V21.9.64: same live-scopes merge as handleAudit. Without this, autofix
     would propose downgrades for cells where admin has legitimately granted
     access via scope customization — undoing the admin's intent silently. */
  let effectiveScopes = { ...SCOPES };
  try {
    const scopesSnap = await db.collection("factory").doc("roleScopes").get();
    if (scopesSnap.exists) {
      const live = scopesSnap.data() || {};
      for (const k of Object.keys(SCOPES)) {
        if (Array.isArray(live[k])) effectiveScopes[k] = live[k];
      }
    }
  } catch (e) {
    console.warn("[V21.9.64 autofix] could not read factory/roleScopes:", e?.message || e);
  }

  /* Re-run audit logic */
  const changes = [];
  for (const role of ROLES) {
    if (role === "admin") continue; /* admin is hardcoded */
    const rolePerms = { ...(permissions[role] || {}) };
    let changed = false;

    for (const [tab, collections] of Object.entries(TAB_COLLECTIONS)) {
      const matrixVal = rolePerms[tab];
      if (matrixVal === undefined || typeof matrixVal === "object") continue;

      let canReadAll = true, canWriteAll = true;
      for (const coll of collections) {
        const r = ruleAllowsRead(role, coll, effectiveScopes);
        const w = ruleAllowsWrite(role, coll, effectiveScopes);
        if (r === false) canReadAll = false;
        if (w === false) canWriteAll = false;
      }

      let recommended = null;
      if (matrixVal === "edit" && !canWriteAll && canReadAll) recommended = "view";
      else if (matrixVal === "edit" && !canReadAll) recommended = "hide";
      else if (matrixVal === "view" && !canReadAll) recommended = "hide";

      if (recommended && recommended !== matrixVal) {
        changes.push({ role, tab, from: matrixVal, to: recommended });
        rolePerms[tab] = recommended;
        changed = true;
      }
    }
    if (changed) permissions[role] = rolePerms;
  }

  if (dryRun || changes.length === 0) {
    return res.status(200).json({
      ok: true, dryRun, changes,
      message: changes.length === 0
        ? "✨ مفيش conflicts للـ fix"
        : "Dry run — " + changes.length + " تعديل planned",
    });
  }

  /* Backup */
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupId = "pre-audit-permissions-v21.9.30-" + ts;
  await db.collection("backups").doc(backupId).set({
    label: "Backup قبل audit-permissions autofix",
    autoGenerated: true,
    migrationType: "audit-permissions-autofix-v21.9.30",
    createdAt: new Date().toISOString(),
    createdBy: auth.email || auth.uid,
    permissions_before: cfg.permissions || {},
    changes,
  });

  await cfgRef.set({ permissions }, { merge: true });

  try {
    await db.collection("migrationLog").doc("audit-permissions-autofix-v21.9.30-" + Date.now()).set({
      type: "audit-permissions-autofix-v21.9.30",
      status: "success",
      changes_count: changes.length,
      changes,
      backup_doc_id: backupId,
      by: auth.email || auth.uid,
      at: new Date().toISOString(),
    });
  } catch (_) {}

  return res.status(200).json({
    ok: true,
    changes_applied: changes.length,
    changes,
    backup_doc_id: backupId,
    message: "✅ تم! " + changes.length + " conflict اتـ fix. اطلب من المستخدمين Ctrl+Shift+R.",
  });
}
