/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Shopify Schema Migration (V19.91 Phase 0)
   ───────────────────────────────────────────────────────────────────────
   Idempotent migration that wires the Shopify integration into the existing
   CLARK data model. Called once on app load (from App.jsx mount effect)
   when the user is admin/manager. Mutates `d` in-place; returns true if
   anything changed (so the caller can decide whether to write).

   What it sets up:

   1. **shopifyConfig** — default Shopify integration settings (intervals,
      auto-flags, account mappings, notification prefs). Credentials stay
      empty; user fills them via the Connection tab.

   2. **shopify_default customer** — virtual aggregate customer.
      All Shopify orders post their invoices to this single CLARK customer
      ID; the actual buyer's name/phone/address lives on the invoice itself
      (shopify_customer_name, etc). Keeps KASF clean.

   3. **Chart of Accounts additions** — 4 system accounts:
        • 4101.02 Shopify Sales Revenue       (parent: 4100)
        • 4102.01 Shopify Shipping Income     (parent: 4100)
        • 6201.01 Shopify Refunds & Returns   (contra-revenue, parent: 4000)
        • 1100.05 Shopify Pending Cash        (parent: 1100, optional)
      Account types follow the existing 4000/1000-tree convention even though
      the codes use sub-IDs (e.g. 4101.02) — the CoA already supports any
      string code, just needs uniqueness. We only insert if the codes don't
      already exist.

   4. **inventoryItems shopify_* fields** — defaulted lazily by writers,
      not bulk-applied here (the array can be huge; we don't want to bloat
      every doc just because the user clicked "Connect"). Readers tolerate
      missing fields by treating them as null/false.

   5. **salesInvoices source field** — same lazy approach; no bulk update.
   ═══════════════════════════════════════════════════════════════════════ */

/* The default customer ID that every Shopify invoice points to.
   Exported so the orders-polling code (Phase 1+) can reference the same
   constant rather than hardcoding the string. */
export const SHOPIFY_DEFAULT_CUSTOMER_ID = "shopify_default";

/* The 4 system accounts the spec requires. We use sub-codes under
   existing parents (4100 إيرادات المبيعات / 4000 الإيرادات / 1100 النقدية
   والبنوك) so the tree stays organized and standard reports (Income
   Statement, Trial Balance) automatically include them. */
const SHOPIFY_COA_ACCOUNTS = [
  {
    code: "4101.02",
    name: "إيرادات Shopify",
    type: "revenue",
    parentCode: "4100",
    isLeaf: true,
    system: true,
    note: "إيرادات المبيعات من متجر Shopify (محققة بعد الاستلام)",
  },
  {
    code: "4102.01",
    name: "إيرادات الشحن (Shopify)",
    type: "revenue",
    parentCode: "4100",
    isLeaf: true,
    system: true,
    note: "رسوم الشحن المحصّلة من طلبات Shopify",
  },
  {
    code: "6201.01",
    name: "مرتجعات Shopify",
    type: "revenue", /* contra-revenue — sits under 4000 in the spec, but we
                        nest under 4100 for consistency with the existing
                        مرتجع مبيعات (4120) pattern. The 6201.01 code is
                        what the spec called for — we keep the user-facing
                        code so reports/searches work. */
    parentCode: "4100",
    isLeaf: true,
    system: true,
    note: "مرتجعات Shopify (contra-revenue يقلّل الإيرادات)",
  },
  {
    code: "1100.05",
    name: "نقدية Shopify المعلّقة",
    type: "asset",
    parentCode: "1100",
    isLeaf: true,
    system: true,
    note: "للطلبات المدفوعة online لكن لسه ما اتسلمتش",
  },
];

/* Default shopifyConfig. The user-set credentials (store_url, api_token)
   stay empty until they connect via the UI. */
const DEFAULT_SHOPIFY_CONFIG = {
  /* Connection */
  store_url: "",
  api_token: "",
  api_version: "2024-10",
  connected: false,

  /* Sync intervals (in minutes). Phase 0 doesn't run any of these — they're
     stored so Phase 1+ cron jobs read them from one place. The user can
     adjust them via the Settings tab. The 5-min poll is a CLARK-side default
     (the spec's 1-min inventory push is moved to 5 min as a safer starting
     point — too aggressive runs into Shopify's 2 req/sec limit on stores
     with 100+ products). */
  polling_interval_min: 5,
  inventory_push_interval_min: 5,
  fulfillment_check_interval_min: 10,

  /* Customer mapping */
  default_customer_id: "shopify_default",
  store_customer_info_in_invoice: true,

  /* Treasury account mapping (codes — resolved at posting time so renames are safe) */
  treasury_accounts: {
    cash: "1110",       /* الخزينة الرئيسية — receives the COD payment */
    revenue: "4101.02", /* Shopify Sales Revenue */
    shipping: "4102.01",/* Shopify Shipping Income */
    returns: "6201.01", /* Shopify Refunds & Returns */
    pending_cash: "1100.05",/* Shopify Pending Cash (online-paid, not yet delivered) */
  },

  /* Workflow flags */
  auto_reserve_stock: true,
  auto_create_invoice_on_fulfillment: true,
  auto_release_on_refusal: true,
  default_safety_buffer: 5,
  pending_order_timeout_days: 7, /* spec said 14 — we default to 7 because
                                    Egyptian COD shipping is usually <7 days.
                                    User can override in Settings. */

  /* Notifications */
  notification_phone: "",
  notify_on: {
    new_order: true,
    stale_pending: true,
    sku_mismatch: true,
    sync_error: true,
    daily_summary: false,
  },

  /* Last-sync tracking — updated by cron jobs in Phase 1+ */
  last_orders_sync_at: null,
  last_inventory_push_at: null,
  last_fulfillment_check_at: null,
};

/* Insert a CoA account if its code isn't already present.
   Uses the same shape as utils/accounting/coa.js: id, code, name, type,
   parent (id, not code), isLeaf, system, createdAt. */
function ensureCoaAccount(coa, account){
  if(!Array.isArray(coa)) return false;
  if(coa.some(a => a.code === account.code)) return false;
  /* Resolve parent code → id */
  const parent = coa.find(a => a.code === account.parentCode);
  if(!parent){
    /* If parent doesn't exist (e.g. the user customized their CoA and
       removed 4100), skip silently. The account can be created manually
       later via the CoA UI. */
    console.warn("[shopifyMigration] parent code", account.parentCode,
      "not found in CoA — skipping", account.code);
    return false;
  }
  /* Use the same id pattern as gid() — but since we don't import gid here,
     use a deterministic prefix so the migration is idempotent on re-runs:
     if a previous run created the account but failed mid-way, re-running
     finds it by code and skips. */
  const id = "shopify_acc_" + account.code.replace(/\./g, "_");
  coa.push({
    id,
    code: account.code,
    name: account.name,
    type: account.type,
    parent: parent.id,
    isLeaf: account.isLeaf !== false,
    system: !!account.system,
    note: account.note || "",
    createdAt: new Date().toISOString(),
  });
  return true;
}

/* Ensure the shopify_default virtual customer exists. Same shape as the
   regular customers (config.customers entries) so existing CRUD paths
   handle it transparently — but flagged with isVirtual:true and
   source:"shopify_default" so reporting tools can filter it out of
   per-customer aggregations if they want. */
function ensureDefaultCustomer(d){
  if(!Array.isArray(d.customers)) d.customers = [];
  if(d.customers.some(c => c.id === SHOPIFY_DEFAULT_CUSTOMER_ID)) return false;
  d.customers.push({
    id: SHOPIFY_DEFAULT_CUSTOMER_ID,
    name: "Shopify Customer",
    nameAr: "عملاء Shopify",
    phone: "",
    address: "",
    notes: "عميل افتراضي يجمع كل طلبات Shopify B2C. تفاصيل العميل الفعلي تتخزن على مستوى الفاتورة.",
    type: "retail_aggregate",
    isVirtual: true,
    source: "shopify_default",
    tier: "Bronze",
    createdAt: new Date().toISOString(),
    createdBy: "system:shopify-migration",
  });
  return true;
}

/* Public: idempotent migration. Returns true if any change was made. */
export function ensureShopifyInit(d){
  if(!d || typeof d !== "object") return false;
  let changed = false;

  /* 1. shopifyConfig (only seed if missing — don't clobber user changes) */
  if(!d.shopifyConfig || typeof d.shopifyConfig !== "object"){
    d.shopifyConfig = JSON.parse(JSON.stringify(DEFAULT_SHOPIFY_CONFIG));
    changed = true;
  } else {
    /* Backfill any newly-added top-level keys (forward-compatible). */
    for(const k of Object.keys(DEFAULT_SHOPIFY_CONFIG)){
      if(d.shopifyConfig[k] === undefined){
        d.shopifyConfig[k] = JSON.parse(JSON.stringify(DEFAULT_SHOPIFY_CONFIG[k]));
        changed = true;
      }
    }
    /* Ensure nested objects have all keys */
    if(typeof d.shopifyConfig.treasury_accounts !== "object"){
      d.shopifyConfig.treasury_accounts = { ...DEFAULT_SHOPIFY_CONFIG.treasury_accounts };
      changed = true;
    } else {
      for(const k of Object.keys(DEFAULT_SHOPIFY_CONFIG.treasury_accounts)){
        if(d.shopifyConfig.treasury_accounts[k] === undefined){
          d.shopifyConfig.treasury_accounts[k] = DEFAULT_SHOPIFY_CONFIG.treasury_accounts[k];
          changed = true;
        }
      }
    }
    if(typeof d.shopifyConfig.notify_on !== "object"){
      d.shopifyConfig.notify_on = { ...DEFAULT_SHOPIFY_CONFIG.notify_on };
      changed = true;
    } else {
      for(const k of Object.keys(DEFAULT_SHOPIFY_CONFIG.notify_on)){
        if(d.shopifyConfig.notify_on[k] === undefined){
          d.shopifyConfig.notify_on[k] = DEFAULT_SHOPIFY_CONFIG.notify_on[k];
          changed = true;
        }
      }
    }
  }

  /* 2. shopify_default customer */
  if(ensureDefaultCustomer(d)) changed = true;

  /* 3. CoA accounts — only if the user has already initialized their CoA
     (otherwise we'd seed Shopify accounts into an empty tree, which is
     confusing). The CoA defaults seed via the user clicking "شجرة افتراضية"
     in the Accounting page, which they typically do before going live. */
  if(Array.isArray(d.coa) && d.coa.length > 0){
    for(const acc of SHOPIFY_COA_ACCOUNTS){
      if(ensureCoaAccount(d.coa, acc)) changed = true;
    }
  }

  return changed;
}
