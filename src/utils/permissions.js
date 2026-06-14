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
  { key: "details",          label: "التصنيع",         icon: "✂️", group: "core" },
  { key: "aiStudio",         label: "AI Studio",          icon: "🪄", group: "core" },
  { key: "external",         label: "تشغيل خارجي",        icon: "🏗️", group: "production" },
  { key: "reports",          label: "التقارير",            icon: "📑", group: "core" },
  { key: "tasks",            label: "المهام",              icon: "✅", group: "core" },
  { key: "db",               label: "قاعدة البيانات",      icon: "🗃️", group: "core" },
  { key: "custDeliver",      label: "مبيعات (تسليم)",      icon: "🛒", group: "sales" },
  /* V21.9.115: Unified Contacts (customers + suppliers + workshops + employees).
     Lives in `core` group so admins/managers see it by default. Sales accountants
     get it via the sales-side gate; purchase accountants via purchase-side. */
  { key: "contacts",         label: "جهات الاتصال",        icon: "👥", group: "core" },
  /* V19.44 — These six tabs were UNGATED before V19.44 (open to all roles).
     Added them to the matrix to close the gap. */
  /* V21.10.0/12b — Sales Quotations + Orders (Odoo-style document chain) */
  { key: "salesQuotations",  label: "عروض الأسعار",        icon: "📋", group: "sales" },
  { key: "salesOrders",      label: "أوامر البيع",         icon: "📑", group: "sales" },
  { key: "salesInvoices",    label: "فواتير المبيعات",     icon: "📤", group: "sales" },
  { key: "creditNotes",      label: "إشعارات دائنة",       icon: "↩️", group: "sales" },
  { key: "purchaseRfq",      label: "طلب عروض أسعار",      icon: "💬", group: "purchase" },
  { key: "purchase",         label: "مشتريات",             icon: "🛍️", group: "purchase" },
  { key: "purchaseInvoices", label: "فواتير المشتريات",    icon: "📥", group: "purchase" },
  { key: "debitNotes",       label: "إشعارات مدينة",       icon: "↪️", group: "purchase" },
  { key: "warehouse",        label: "المخازن",             icon: "📦", group: "warehouse" },
  /* V19.81.0: Pieces lookup — scan QR → see lifecycle (which customer, when, returned/re-sold) */
  { key: "pieces",           label: "تتبع القطع (QR)",     icon: "🔍", group: "warehouse" },
  { key: "treasury",         label: "الخزنة",              icon: "💵", group: "finance" },
  { key: "hr",               label: "مرتبات + موظفين",     icon: "🧑‍💼", group: "hr" },
  { key: "campaigns",        label: "الحملات والرسائل",    icon: "📣", group: "comms" },
  { key: "automation",       label: "Automation",          icon: "🤖", group: "comms" },
  /* V19.71: AI Agent control center — the conversational LLM agent for WhatsApp B2B sales */
  { key: "aiAgent",          label: "AI Agent",            icon: "🤖", group: "comms" },
  /* V19.91 — Shopify B2C integration tab */
  { key: "shopify",          label: "Shopify",             icon: "🛍️", group: "sales" },
  { key: "audit",            label: "سجل التدقيق",         icon: "🔍", group: "admin" },
  { key: "accounting",       label: "محاسبة",              icon: "📊", group: "finance" },
  { key: "fixedAssets",      label: "أصول ثابتة",          icon: "🏭", group: "finance" },
  { key: "settings",         label: "الإعدادات",           icon: "⚙️", group: "admin" },
  /* V21.9.94 — Documents Tree (folder-based document manager) */
  { key: "documents",        label: "مساحة التخزين",        icon: "💾", group: "core" },
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
    tasks:"edit", db:"edit", custDeliver:"edit", contacts:"edit",
    salesQuotations:"edit", salesOrders:"edit", salesInvoices:"edit", creditNotes:"edit",
    purchaseRfq:"edit", purchase:"edit", purchaseInvoices:"edit", debitNotes:"edit",
    warehouse:"edit", pieces:"edit", treasury:"edit",
    hr: {weeks:"edit",verify:"edit",employees:"edit",security:"edit"},
    campaigns:"edit", automation:"edit", aiAgent:"edit", shopify:"edit", audit:"edit",
    accounting:"edit", fixedAssets:"edit",
    settings:"edit", documents:"edit",
  },
  manager: {
    dashboard:"edit", details:"edit", external:"edit", reports:"edit",
    tasks:"edit", db:"edit", custDeliver:"edit", contacts:"edit",
    salesQuotations:"edit", salesOrders:"edit", salesInvoices:"edit", creditNotes:"edit",
    purchaseRfq:"edit", purchase:"edit", purchaseInvoices:"edit", debitNotes:"edit",
    warehouse:"edit", pieces:"edit", treasury:"view",
    hr: {weeks:"view",verify:"view",employees:"view",security:"view"},
    campaigns:"edit", automation:"view", aiAgent:"edit", shopify:"edit", audit:"view",
    accounting:"view", fixedAssets:"view",
    settings:"hide", documents:"edit",
  },
  /* V21.9.60 — Sales accountant: expanded default access to warehouse + customer DB.
     The real-world workflow needs sales to: see what's available in stock before
     promising delivery dates, look up customers/products from the DB, and check
     piece status by QR. Previously they had view-only on warehouse/pieces and
     no access to db at all — which forced warehouse/admin to be a bottleneck. */
  sales_accountant: {
    dashboard:"view", details:"view", external:"view", reports:"edit",
    tasks:"edit", db:"view", custDeliver:"edit", contacts:"edit",
    salesQuotations:"edit", salesOrders:"edit", salesInvoices:"edit", creditNotes:"edit",
    purchaseRfq:"hide", purchase:"hide", purchaseInvoices:"hide", debitNotes:"hide",
    warehouse:"edit", pieces:"edit", treasury:"hide",
    hr: {weeks:"hide",verify:"hide",employees:"hide",security:"hide"},
    campaigns:"edit", automation:"hide", aiAgent:"edit", shopify:"edit", audit:"hide",
    accounting:"hide", fixedAssets:"hide",
    settings:"hide", documents:"edit",
  },
  purchase_accountant: {
    dashboard:"view", details:"view", external:"edit", reports:"edit",
    tasks:"edit", db:"edit", custDeliver:"hide", contacts:"edit",
    salesQuotations:"hide", salesOrders:"hide", salesInvoices:"hide", creditNotes:"hide",
    purchaseRfq:"edit", purchase:"edit", purchaseInvoices:"edit", debitNotes:"edit",
    warehouse:"edit", pieces:"edit", treasury:"edit",
    hr: {weeks:"hide",verify:"hide",employees:"hide",security:"hide"},
    campaigns:"hide", automation:"hide", aiAgent:"hide", shopify:"hide", audit:"hide",
    accounting:"hide", fixedAssets:"hide",
    settings:"hide", documents:"edit",
  },
  /* V19.44 — Warehouse keeper: the role that prompted this whole audit.
     Common scenario: a worker who scans purchase receipts and counts stock.
     Should NOT see prices, treasury, invoices, or accounting. Should be able
     to record received quantities, do stock takes, and complete tasks
     assigned to them. Sales/purchase invoices are HIDE because those are
     financial documents — the receipts page (purchase) is where they work. */
  warehouse_keeper: {
    dashboard:"view", details:"view", external:"hide", reports:"view",
    tasks:"edit", db:"view", custDeliver:"hide", contacts:"view",
    salesQuotations:"hide", salesOrders:"hide", salesInvoices:"hide", creditNotes:"hide",
    purchaseRfq:"hide", purchase:"edit", purchaseInvoices:"hide", debitNotes:"hide",
    warehouse:"edit", pieces:"edit", treasury:"hide",
    hr: {weeks:"hide",verify:"hide",employees:"hide",security:"hide"},
    campaigns:"hide", automation:"hide", aiAgent:"hide", shopify:"hide", audit:"hide",
    accounting:"hide", fixedAssets:"hide",
    settings:"hide", documents:"edit",
  },
  payroll_accountant: {
    dashboard:"view", details:"view", external:"hide", reports:"view",
    tasks:"edit", db:"hide", custDeliver:"hide", contacts:"view",
    salesQuotations:"hide", salesOrders:"hide", salesInvoices:"hide", creditNotes:"hide",
    purchaseRfq:"hide", purchase:"hide", purchaseInvoices:"hide", debitNotes:"hide",
    warehouse:"hide", pieces:"hide", treasury:"view",
    hr: {weeks:"edit",verify:"hide",employees:"edit",security:"view"},
    campaigns:"hide", automation:"hide", aiAgent:"hide", shopify:"hide", audit:"hide",
    accounting:"hide", fixedAssets:"hide",
    settings:"hide", documents:"edit",
  },
  payroll_verifier: {
    dashboard:"view", details:"view", external:"hide", reports:"view",
    tasks:"edit", db:"hide", custDeliver:"hide", contacts:"view",
    salesQuotations:"hide", salesOrders:"hide", salesInvoices:"hide", creditNotes:"hide",
    purchaseRfq:"hide", purchase:"hide", purchaseInvoices:"hide", debitNotes:"hide",
    warehouse:"hide", pieces:"hide", treasury:"view",
    hr: {weeks:"view",verify:"edit",employees:"view",security:"view"},
    campaigns:"hide", automation:"hide", aiAgent:"hide", shopify:"hide", audit:"hide",
    accounting:"hide", fixedAssets:"hide",
    settings:"hide", documents:"view",
  },
  viewer: {
    dashboard:"view", details:"view", external:"hide", reports:"view",
    tasks:"edit", db:"hide", custDeliver:"hide", contacts:"view",
    salesQuotations:"view", salesOrders:"view", salesInvoices:"view", creditNotes:"view",
    purchaseRfq:"view", purchase:"view", purchaseInvoices:"view", debitNotes:"view",
    warehouse:"view", pieces:"view", treasury:"hide",
    hr: {weeks:"hide",verify:"hide",employees:"hide",security:"hide"},
    campaigns:"hide", automation:"hide", aiAgent:"hide", shopify:"view", audit:"hide",
    accounting:"hide", fixedAssets:"hide",
    settings:"hide", documents:"view",
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

/* ═══════════════════════════════════════════════════════════════════════
   V21.21.91 — resolveUserRole: single source of truth لحلّ دور المستخدم.

   كان فيه نسخ متفرّقة في App.jsx بتحسب الدور بمنطق فيه باگان:

   ① حساسية حالة أحرف الإيميل: الإيميل بيتخزّن lowercase في usersList، لكن
      المقارنة كانت `u.email === user.email` بـ===؛ أي اختلاف في الحالة
      (إيميل Firebase فيه كابيتال) → اللوكاب يفشل → الدور يرجع "viewer" →
      المستخدم مايستلمش أي صلاحية مهما الأدمن يعمل. (السبب الجذري للباگ.)

   ② الأسبقية: الكود كان بيقرأ config.users[uid] الأول، لكن واجهة الإعدادات
      بتكتب على usersList بس (مابتكتبش config.users[uid] إطلاقاً). فلو فيه
      entry قديم في config.users[uid] → تعديلات الأدمن بتتجاهَل.

   الحل: usersList (اللي الإعدادات بتديره) هو المرجع لو المستخدم موجود فيه؛
   وإلا fallback لـ config.users[uid] (legacy/uid) ثم "viewer". المقارنة
   case-insensitive على الطرفين. */
export function resolveUserRole(config, user){
  if(!config || !user) return "viewer";
  const email = String(user.email || "").trim().toLowerCase();
  if(email){
    const byEmail = (Array.isArray(config.usersList) ? config.usersList : [])
      .find(u => String((u && u.email) || "").trim().toLowerCase() === email);
    if(byEmail && byEmail.role) return byEmail.role;
  }
  const uid = user.uid;
  if(uid && config.users && config.users[uid]){
    const r = config.users[uid];
    return (typeof r === "string") ? r : ((r && r.role) || "viewer");
  }
  return "viewer";
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

/* ═══════════════════════════════════════════════════════════════════════
   V21.21.92 — Phase 2: تجاوز الصلاحيات لكل مستخدم (per-user override).

   التخزين: على entry المستخدم في usersList (نفس المصدر اللي الإعدادات
   بتديره + اللي Phase 1 خلّاه المرجع):
     usersList[i].perms = { [tabKey]: "edit"|"view"|"hide" | {hr subs}, ... }
   غياب المفتاح (أو "inherit") = يرث من الدور. السلوك متوافق رجعياً تماماً:
   مستخدم من غير perms = نفس حساب الدور بالظبط (مفيش تغيير).

   الأسبقية: admin دايماً كامل (V18.61 — مايتقفلش) ← ثم تجاوز المستخدم ←
   ثم صلاحية الدور (effectivePermWithCustoms). */

/* القيمة الخام للتجاوز لتابٍ معيّن (string | object | null=يرث). */
export function getUserPermOverride(config, user, tabKey){
  if(!config || !user) return null;
  const email = String(user.email || "").trim().toLowerCase();
  if(!email) return null;
  const entry = (Array.isArray(config.usersList) ? config.usersList : [])
    .find(u => String((u && u.email) || "").trim().toLowerCase() === email);
  if(!entry || !entry.perms || typeof entry.perms !== "object") return null;
  const v = entry.perms[tabKey];
  if(v === undefined || v === null || v === "inherit") return null;
  return v;
}

/* الصلاحية الفعّالة لمستخدمٍ بعينه (تجاوز المستخدم يكسب، وإلا الدور). */
export function effectivePermForUser(config, user, tabKey){
  const role = resolveUserRole(config, user);
  if(role === "admin") return DEFAULT_PERMS.admin[tabKey] || "edit";  /* غير قابل للتجاوز */
  const override = getUserPermOverride(config, user, tabKey);
  if(override != null) return override;
  return effectivePermWithCustoms(role, tabKey, config);
}

export function canEditPermForUser(config, user, tabKey){
  const p = effectivePermForUser(config, user, tabKey);
  if(typeof p === "object") return Object.values(p).some(v => v === "edit");
  return p === "edit";
}

export function canViewPermForUser(config, user, tabKey){
  const p = effectivePermForUser(config, user, tabKey);
  if(typeof p === "object") return Object.values(p).some(v => v !== "hide");
  return p !== "hide";
}

export function getHrSubPermForUser(config, user, subKey){
  const hrPerm = effectivePermForUser(config, user, "hr");
  if(typeof hrPerm === "string") return hrPerm;
  if(hrPerm && typeof hrPerm === "object") return hrPerm[subKey] || "hide";
  return "hide";
}

/* ═══════════════════════════════════════════════════════════════════════
   V21.21.93 — Phase 3: صلاحيات التابات الداخلية (sub-tabs).

   كل تاب داخلي ليه مفتاح فرعي مستقل (مش في PERMISSION_TABS). افتراضياً
   **بيورّث القسم الأصلي** (inheritFrom) = السلوك الحالي بالظبط، فمفيش
   regression؛ الأدمن يقدر يكسره صراحة (إظهار/عرض/إخفاء) لكل مستخدم أو دور.

   SUB_TABS: مجمّعة تحت مفتاح القسم الأب (للعرض في الإعدادات).
   inheritFrom = مفتاح الصلاحية اللي بيورّث منها لو مفيش override. */
export const SUB_TABS = {
  salesOrders: [
    { key: "portalRequests", label: "🛒 طلبات البورتال", inheritFrom: "salesOrders" },
  ],
  purchase: [
    { key: "purchaseSuppliers",  label: "👥 الموردون", inheritFrom: "purchase" },
    { key: "purchaseStock",      label: "📦 المخزن",   inheritFrom: "purchase" },
    { key: "purchaseCategories", label: "🏷️ الأصناف",  inheritFrom: "purchase" },
  ],
};

/* كل المفاتيح الفرعية مسطّحة (للتحقق/التكرار) */
export const ALL_SUB_TABS = Object.values(SUB_TABS).flat();

/* صلاحية تاب داخلي لمستخدمٍ بعينه. أسبقية: admin كامل ← تجاوز المستخدم على
   المفتاح الفرعي ← تجاوز الدور على المفتاح الفرعي ← fallbackLevel (السلوك
   الحالي = يرث القسم؛ بيحسبه الـ hub ويمرّره). */
export function resolveSubPermForUser(config, user, subKey, fallbackLevel){
  const role = resolveUserRole(config, user);
  if(role === "admin") return "edit";
  const ov = getUserPermOverride(config, user, subKey);
  if(ov === "edit" || ov === "view" || ov === "hide") return ov;
  const rp = config && config.permissions && config.permissions[role] && config.permissions[role][subKey];
  if(rp === "edit" || rp === "view" || rp === "hide") return rp;
  return fallbackLevel || "hide";
}
export function canViewSubForUser(config, user, subKey, fallbackLevel){
  return resolveSubPermForUser(config, user, subKey, fallbackLevel) !== "hide";
}
export function canEditSubForUser(config, user, subKey, fallbackLevel){
  return resolveSubPermForUser(config, user, subKey, fallbackLevel) === "edit";
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
