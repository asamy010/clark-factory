/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Permissions Registry (V19.44)
   ───────────────────────────────────────────────────────────────────────
   Single source of truth for the permission system. Before V19.44,
   permissions were scattered:
     - DEFAULT_PERMS hardcoded inside App.jsx (with 6 missing tabs!)
     - Tab list in LoginScreen's TABS array
     - Role labels duplicated in 3 different files
     - Permission UI in SettingsPg with its own copy of defaults
   This led to drift: salesInvoices/creditNotes/purchaseInvoices/debitNotes/
   accounting/fixedAssets were added as tabs but never gated — every role
   had full edit access regardless of intent. V19.44 unifies everything.

   Three concepts:
     - PERMISSION_TABS: catalog of every tab that the perms matrix governs
     - ROLES: the set of available roles + display metadata + defaults
     - DEFAULT_PERMS: per-role, per-tab default level ("edit"|"view"|"hide")

   Levels:
     "edit" — can read + write (full access)
     "view" — can read only (UI shows readonly mode where supported)
     "hide" — tab not visible in nav, page returns null if accessed by URL

   Special cases:
     - Admin role's perms are HARDCODED (V18.61). custom permissions[admin]
       in factory/config are ignored at runtime. This prevents lockouts.
     - HR has 4 sub-permissions: weeks, verify, employees, security. The
       hr permission can be a string (legacy) or an object (per-sub).
   ═══════════════════════════════════════════════════════════════════════ */

/* The catalog of tabs that the permission matrix governs.
   Keep this in sync with the TABS array in LoginScreen.jsx — a runtime
   linter (validatePermsRegistry below) emits a console.warn if they drift.

   `icon` is used by the SettingsPg permissions matrix for the tab name column.
   `group` lets future UI cluster tabs (e.g. "show only finance perms"). */
export const PERMISSION_TABS = [
  { key: "dashboard",        label: "لوحة التحكم",       icon: "📊", group: "core" },
  { key: "details",          label: "أوامر القص",         icon: "✂️", group: "core" },
  { key: "external",         label: "تشغيل خارجي",        icon: "🏗️", group: "production" },
  { key: "reports",          label: "التقارير",            icon: "📑", group: "core" },
  { key: "tasks",            label: "المهام",              icon: "✅", group: "core" },
  { key: "db",               label: "قاعدة البيانات",      icon: "🗃️", group: "core" },
  { key: "custDeliver",      label: "مبيعات (تسليم)",      icon: "🛒", group: "sales" },
  /* V19.44 — These six tabs were UNGATED before V19.44 (open to all roles).
     Added them to the matrix to close the gap. */
  { key: "salesInvoices",    label: "فواتير المبيعات",     icon: "📤", group: "sales" },
  { key: "creditNotes",      label: "إشعارات دائنة",       icon: "↩️", group: "sales" },
  { key: "purchase",         label: "مشتريات",             icon: "🛍️", group: "purchase" },
  { key: "purchaseInvoices", label: "فواتير المشتريات",    icon: "📥", group: "purchase" },
  { key: "debitNotes",       label: "إشعارات مدينة",       icon: "↪️", group: "purchase" },
  { key: "warehouse",        label: "المخازن",             icon: "📦", group: "warehouse" },
  { key: "treasury",         label: "الخزنة",              icon: "💵", group: "finance" },
  { key: "hr",               label: "مرتبات + موظفين",     icon: "🧑‍💼", group: "hr" },
  { key: "campaigns",        label: "الحملات والرسائل",    icon: "📣", group: "comms" },
  { key: "audit",            label: "سجل التدقيق",         icon: "🔍", group: "admin" },
  { key: "accounting",       label: "محاسبة",              icon: "📊", group: "finance" },
  { key: "fixedAssets",      label: "أصول ثابتة",          icon: "🏭", group: "finance" },
  { key: "settings",         label: "الإعدادات",           icon: "⚙️", group: "admin" },
];

export const PERMISSION_TAB_KEYS = PERMISSION_TABS.map(t => t.key);

/* HR sub-permissions — applied to the hr tab when its perm is an object */
export const HR_SUBKEYS = [
  { key: "weeks",     label: "جدول المرتبات والأسابيع", icon: "📅" },
  { key: "verify",    label: "تأكيد استلام (QR)",      icon: "🔐" },
  { key: "employees", label: "إدارة الموظفين",         icon: "👷" },
  { key: "security",  label: "الأمن والرقابة",          icon: "🛡️" },
];

/* Roles registry — display metadata + default permissions per tab.
   Order matters here: this is the order they appear in the perms matrix UI. */
export const ROLES = [
  {
    key: "admin",
    label: "مدير عام",
    icon: "👑",
    color: "#0EA5E9",
    description: "كل الصلاحيات + إعدادات النظام (مثبّتة في الكود)",
    locked: true, /* V18.61: hardcoded — cannot be customized */
  },
  {
    key: "manager",
    label: "مدير",
    icon: "⭐",
    color: "#10B981",
    description: "إضافة وتعديل في كل الأقسام التشغيلية، عرض المالية",
  },
  {
    key: "sales_accountant",
    label: "محاسب مبيعات",
    icon: "💰",
    color: "#8B5CF6",
    description: "تسليم العملاء + فواتير المبيعات + المرتجعات + التقارير",
  },
  {
    key: "purchase_accountant",
    label: "محاسب مشتريات",
    icon: "🛒",
    color: "#F59E0B",
    description: "المشتريات + الفواتير + المرتجعات + التشغيل الخارجي + الخزنة",
  },
  /* V19.44 — NEW ROLE: warehouse keeper.
     Real-world need: scan-only role for receiving + stock counting, without
     access to financial data. Before V19.44, the closest fit was
     purchase_accountant which gave dangerous access to treasury + invoices. */
  {
    key: "warehouse_keeper",
    label: "أمين مخزن",
    icon: "📦",
    color: "#0D9488",
    description: "استلام البضاعة + جرد المخزون + مهام. مفيش أسعار أو مالية.",
  },
  {
    key: "payroll_accountant",
    label: "محاسب مرتبات",
    icon: "🧾",
    color: "#7C3AED",
    description: "حساب المرتبات وإدارة الموظفين، مش بيقدر يؤكد الاستلام",
  },
  {
    key: "payroll_verifier",
    label: "مُؤكِّد استلام",
    icon: "🔐",
    color: "#DB2777",
    description: "QR scan لتأكيد استلام المرتبات فقط، مش بيقدر يعدّل أي مبلغ",
  },
  {
    key: "viewer",
    label: "مشاهد",
    icon: "👁",
    color: "#64748B",
    description: "عرض فقط — مفيش تعديل في أي مكان",
  },
];

export const ROLE_KEYS = ROLES.map(r => r.key);
export const NON_ADMIN_ROLES = ROLES.filter(r => r.key !== "admin").map(r => r.key);

/* Quick lookup: { admin: {...}, manager: {...}, ... } */
export const ROLE_META = ROLES.reduce((acc, r) => { acc[r.key] = r; return acc; }, {});

/* Default permissions per role, per tab.
   Levels: "edit" | "view" | "hide"
   ─────────────────────────────────────────────────────────────────────
   Design rationale per role:
   - admin: edit everything (locked, ignored at runtime — see App.jsx)
   - manager: edit operational tabs, view financial, hide settings
   - sales_accountant: edit sales side, view-only on production
   - purchase_accountant: edit purchase side, view production
   - warehouse_keeper [V19.44]: edit warehouse + purchase receipts only,
     hide all financial tabs (no prices/treasury/accounting/invoices)
   - payroll_accountant: edit payroll only, separation of duties enforced
   - payroll_verifier: edit verify only, view payroll
   - viewer: read-only on most things, hide settings/finance */
export const DEFAULT_PERMS = {
  admin: {
    dashboard:"edit", details:"edit", external:"edit", reports:"edit",
    tasks:"edit", db:"edit", custDeliver:"edit",
    salesInvoices:"edit", creditNotes:"edit",
    purchase:"edit", purchaseInvoices:"edit", debitNotes:"edit",
    warehouse:"edit", treasury:"edit",
    hr: {weeks:"edit",verify:"edit",employees:"edit",security:"edit"},
    campaigns:"edit", audit:"edit",
    accounting:"edit", fixedAssets:"edit",
    settings:"edit",
  },
  manager: {
    dashboard:"edit", details:"edit", external:"edit", reports:"edit",
    tasks:"edit", db:"edit", custDeliver:"edit",
    salesInvoices:"edit", creditNotes:"edit",
    purchase:"edit", purchaseInvoices:"edit", debitNotes:"edit",
    warehouse:"edit", treasury:"view",
    hr: {weeks:"view",verify:"view",employees:"view",security:"view"},
    campaigns:"edit", audit:"view",
    accounting:"view", fixedAssets:"view",
    settings:"hide",
  },
  sales_accountant: {
    dashboard:"view", details:"view", external:"hide", reports:"edit",
    tasks:"edit", db:"hide", custDeliver:"edit",
    salesInvoices:"edit", creditNotes:"edit",
    purchase:"hide", purchaseInvoices:"hide", debitNotes:"hide",
    warehouse:"view", treasury:"hide",
    hr: {weeks:"hide",verify:"hide",employees:"hide",security:"hide"},
    campaigns:"edit", audit:"hide",
    accounting:"hide", fixedAssets:"hide",
    settings:"hide",
  },
  purchase_accountant: {
    dashboard:"view", details:"view", external:"edit", reports:"edit",
    tasks:"edit", db:"edit", custDeliver:"hide",
    salesInvoices:"hide", creditNotes:"hide",
    purchase:"edit", purchaseInvoices:"edit", debitNotes:"edit",
    warehouse:"edit", treasury:"edit",
    hr: {weeks:"hide",verify:"hide",employees:"hide",security:"hide"},
    campaigns:"hide", audit:"hide",
    accounting:"hide", fixedAssets:"hide",
    settings:"hide",
  },
  /* V19.44 — Warehouse keeper: the role that prompted this whole audit.
     Common scenario: a worker who scans purchase receipts and counts stock.
     Should NOT see prices, treasury, invoices, or accounting. Should be able
     to record received quantities, do stock takes, and complete tasks
     assigned to them. Sales/purchase invoices are HIDE because those are
     financial documents — the receipts page (purchase) is where they work. */
  warehouse_keeper: {
    dashboard:"view", details:"view", external:"hide", reports:"view",
    tasks:"edit", db:"view", custDeliver:"hide",
    salesInvoices:"hide", creditNotes:"hide",
    purchase:"edit", purchaseInvoices:"hide", debitNotes:"hide",
    warehouse:"edit", treasury:"hide",
    hr: {weeks:"hide",verify:"hide",employees:"hide",security:"hide"},
    campaigns:"hide", audit:"hide",
    accounting:"hide", fixedAssets:"hide",
    settings:"hide",
  },
  payroll_accountant: {
    dashboard:"view", details:"view", external:"hide", reports:"view",
    tasks:"edit", db:"hide", custDeliver:"hide",
    salesInvoices:"hide", creditNotes:"hide",
    purchase:"hide", purchaseInvoices:"hide", debitNotes:"hide",
    warehouse:"hide", treasury:"view",
    hr: {weeks:"edit",verify:"hide",employees:"edit",security:"view"},
    campaigns:"hide", audit:"hide",
    accounting:"hide", fixedAssets:"hide",
    settings:"hide",
  },
  payroll_verifier: {
    dashboard:"view", details:"view", external:"hide", reports:"view",
    tasks:"edit", db:"hide", custDeliver:"hide",
    salesInvoices:"hide", creditNotes:"hide",
    purchase:"hide", purchaseInvoices:"hide", debitNotes:"hide",
    warehouse:"hide", treasury:"view",
    hr: {weeks:"view",verify:"edit",employees:"view",security:"view"},
    campaigns:"hide", audit:"hide",
    accounting:"hide", fixedAssets:"hide",
    settings:"hide",
  },
  viewer: {
    dashboard:"view", details:"view", external:"hide", reports:"view",
    tasks:"edit", db:"hide", custDeliver:"hide",
    salesInvoices:"view", creditNotes:"view",
    purchase:"view", purchaseInvoices:"view", debitNotes:"view",
    warehouse:"view", treasury:"hide",
    hr: {weeks:"hide",verify:"hide",employees:"hide",security:"hide"},
    campaigns:"hide", audit:"hide",
    accounting:"hide", fixedAssets:"hide",
    settings:"hide",
  },
};

/* ═══ RUNTIME LINTER ═══
   In dev/console, validates that PERMISSION_TABS, DEFAULT_PERMS, and TABS
   stay in sync. Logs a clear warning if they drift. Catches the V18→V19
   class of bug where new tabs were added without gating. */
export function validatePermsRegistry(navTabs){
  const navKeys = new Set((navTabs || []).map(t => t.key));
  const permKeys = new Set(PERMISSION_TAB_KEYS);
  const issues = [];

  /* Tabs in nav but not in perms = ungated */
  for(const k of navKeys){
    if(!permKeys.has(k)) issues.push(`⚠ Tab "${k}" in TABS but NOT in PERMISSION_TABS — UNGATED`);
  }
  /* Tabs in perms but not in nav = stale entry */
  for(const k of permKeys){
    if(!navKeys.has(k)) issues.push(`⚠ Tab "${k}" in PERMISSION_TABS but NOT in TABS — stale`);
  }

  /* Each role's defaults should cover every tab */
  for(const role of ROLE_KEYS){
    const rolePerms = DEFAULT_PERMS[role] || {};
    for(const k of permKeys){
      if(rolePerms[k] === undefined){
        issues.push(`⚠ Role "${role}" missing default for tab "${k}"`);
      }
    }
  }

  if(issues.length > 0){
    console.warn("[V19.44 perms registry]", issues);
  }
  return issues;
}

/* ═══ SHARED HELPERS ═══
   These mirror the runtime helpers in App.jsx but are pure functions —
   useful for tests, the perms inspector UI, and anything else that needs
   "what does role X see for tab Y" without instantiating the App. */

/* Get effective permission for a role + tab, considering overrides */
export function effectivePerm(role, tabKey, customPerms){
  /* Admin is hardcoded — always returns DEFAULT_PERMS.admin */
  if(role === "admin"){
    return DEFAULT_PERMS.admin[tabKey] || "edit";
  }
  const defaults = DEFAULT_PERMS[role] || DEFAULT_PERMS.viewer;
  const override = (customPerms || {})[role] || {};
  const fromOverride = override[tabKey];
  const fromDefault = defaults[tabKey];
  /* Object permissions (HR sub-perms): return as-is, don't string-coerce */
  if(fromOverride && typeof fromOverride === "object") return fromOverride;
  if(fromDefault && typeof fromDefault === "object") return fromDefault;
  return fromOverride || fromDefault || "hide";
}

/* Boolean: can role edit this tab? */
export function canEditPerm(role, tabKey, customPerms){
  const p = effectivePerm(role, tabKey, customPerms);
  if(typeof p === "object") return Object.values(p).some(v => v === "edit");
  return p === "edit";
}

/* Boolean: can role view this tab? */
export function canViewPerm(role, tabKey, customPerms){
  const p = effectivePerm(role, tabKey, customPerms);
  if(typeof p === "object") return Object.values(p).some(v => v !== "hide");
  return p !== "hide";
}

/* HR sub-permission helper */
export function getHrSubPermFor(role, subKey, customPerms){
  const hrPerm = effectivePerm(role, "hr", customPerms);
  if(typeof hrPerm === "string") return hrPerm; /* legacy backward compat */
  if(hrPerm && typeof hrPerm === "object") return hrPerm[subKey] || "hide";
  return "hide";
}

/* ═══════════════════════════════════════════════════════════════════════
   V19.45 — CUSTOM ROLES (created by admins from the UI)
   ───────────────────────────────────────────────────────────────────────
   Custom roles live in `config.customRoles[]` and merge with the built-in
   ROLES at runtime. A custom role has the same shape as a built-in role
   plus a `basedOn` field tracking its template. Its initial DEFAULT_PERMS
   are copied from the basedOn role at creation time, then the admin can
   tweak any cell in the permissions matrix as usual (the override goes to
   `config.permissions[customRoleKey]`).

   Why store defaults inline on the custom role rather than always falling
   back to basedOn at lookup time? Because a custom role needs an INDEPENDENT
   default policy. If the admin later edits the basedOn role's perms, that
   shouldn't retroactively change every custom role derived from it. Customs
   are snapshots, not live links.

   Schema:
     config.customRoles = [{
       key: "custom_warehouse_supervisor",  // auto-generated, immutable
       label: "مشرف مخزن",
       icon: "👷",
       color: "#0EA5E9",
       description: "نفس أمين المخزن + يقدر يحذف",
       basedOn: "warehouse_keeper",
       defaults: { dashboard:"view", warehouse:"edit", ... },  // snapshot at creation
       createdAt: "2026-05-04T...",
       createdBy: "admin@...",
       isCustom: true,                      // flag for UI
     }]
   ═══════════════════════════════════════════════════════════════════════ */

/* Validation: a label that's safe to use as a role key.
   Slugifies Arabic text into something Firestore + JSON-safe. */
export function generateRoleKey(label){
  if(!label) return "";
  /* Strip Arabic diacritics + spaces + punctuation, hash if too long */
  const slug = String(label)
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670]/g, "") /* Arabic harakat */
    .replace(/[^\u0600-\u06FFa-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  if(!slug) return "custom_" + Date.now().toString(36);
  return "custom_" + slug;
}

/* Merge built-in ROLES with config.customRoles. Returns array sorted by
   built-ins first then custom ones in creation order. Used by every UI
   surface that lists roles (user select dropdown, perms matrix columns,
   inspector role lookup). */
export function getEffectiveRoles(config){
  const customRoles = (config && Array.isArray(config.customRoles)) ? config.customRoles : [];
  /* Defensive: drop any custom that conflicts with a built-in key */
  const builtInKeys = new Set(ROLE_KEYS);
  const cleanCustom = customRoles
    .filter(c => c && c.key && !builtInKeys.has(c.key))
    .map(c => ({...c, isCustom: true}));
  return [...ROLES, ...cleanCustom];
}

/* { key: roleObj } lookup including customs */
export function getEffectiveRoleMeta(config){
  const all = getEffectiveRoles(config);
  return all.reduce((acc, r) => { acc[r.key] = r; return acc; }, {});
}

/* All role keys (built-in + custom) */
export function getEffectiveRoleKeys(config){
  return getEffectiveRoles(config).map(r => r.key);
}

/* Effective DEFAULT_PERMS lookup — returns built-in defaults for built-in
   roles, OR the snapshot stored on a custom role. Custom roles ALWAYS have
   a defaults snapshot (created at the time the role was added). If somehow
   missing (legacy data corruption), falls back to viewer. */
export function getEffectiveDefaultPerms(role, config){
  if(DEFAULT_PERMS[role]) return DEFAULT_PERMS[role];
  /* Custom role — pull from config */
  const all = (config && Array.isArray(config.customRoles)) ? config.customRoles : [];
  const custom = all.find(r => r && r.key === role);
  if(custom && custom.defaults && typeof custom.defaults === "object"){
    return custom.defaults;
  }
  /* Fallback to viewer's defaults — safest "least privilege" choice */
  return DEFAULT_PERMS.viewer;
}

/* V19.45 variant of effectivePerm that consults custom-role defaults too.
   The original effectivePerm() only knows about built-in roles; this one
   handles customs by looking at their snapshotted defaults. UI code should
   migrate to this where it has `config` available. The original is kept
   as a building block — it still works for built-ins. */
export function effectivePermWithCustoms(role, tabKey, config){
  if(role === "admin"){
    /* V18.61 hardcoded — never customizable */
    return DEFAULT_PERMS.admin[tabKey] || "edit";
  }
  const customPerms = (config && config.permissions) || {};
  const defaults = getEffectiveDefaultPerms(role, config);
  const override = customPerms[role] || {};
  const fromOverride = override[tabKey];
  const fromDefault = defaults[tabKey];
  if(fromOverride && typeof fromOverride === "object") return fromOverride;
  if(fromDefault && typeof fromDefault === "object") return fromDefault;
  return fromOverride || fromDefault || "hide";
}

export function canEditPermWithCustoms(role, tabKey, config){
  const p = effectivePermWithCustoms(role, tabKey, config);
  if(typeof p === "object") return Object.values(p).some(v => v === "edit");
  return p === "edit";
}

export function canViewPermWithCustoms(role, tabKey, config){
  const p = effectivePermWithCustoms(role, tabKey, config);
  if(typeof p === "object") return Object.values(p).some(v => v !== "hide");
  return p !== "hide";
}

export function getHrSubPermWithCustoms(role, subKey, config){
  const hrPerm = effectivePermWithCustoms(role, "hr", config);
  if(typeof hrPerm === "string") return hrPerm;
  if(hrPerm && typeof hrPerm === "object") return hrPerm[subKey] || "hide";
  return "hide";
}

/* Preset color palette for custom-role color picker */
export const ROLE_COLOR_PALETTE = [
  "#0EA5E9", "#10B981", "#F59E0B", "#8B5CF6", "#EF4444", "#06B6D4",
  "#0D9488", "#7C3AED", "#DB2777", "#EC4899", "#F97316", "#84CC16",
  "#14B8A6", "#A855F7", "#3B82F6", "#64748B",
];

/* Preset emoji suggestions for the icon picker. Anything emoji works,
   this is just a starter set. */
export const ROLE_ICON_SUGGESTIONS = [
  "👷", "👨‍💼", "👩‍💼", "🧑‍💼", "🛠", "📋", "🗂", "📊",
  "📦", "🏭", "🚚", "🛒", "💰", "💵", "🧾", "📑",
  "🔐", "🔑", "🛡", "⚙️", "🎯", "🏆", "⭐", "💎",
  "📞", "💻", "📱", "🖥", "🎓", "🩺", "⚖️", "🚀",
];
