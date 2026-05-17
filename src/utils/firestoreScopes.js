/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Firestore Scope Map (V21.9.61)
   ─────────────────────────────────────────────────────────────────────
   Mirror of the `firestore.rules` scope assignments — used by the client
   to predict which collection reads will be denied for the current user's
   role. This lets the top-bar listener-health banner suppress LEGITIMATE
   denials (e.g., warehouse_keeper denied from HR/payment collections —
   correct by design) and only surface UNEXPECTED denials (e.g., a missing
   firestore.rules clause for a newly-added collection, or a custom role
   not yet mapped in factory/roleScopes).

   IMPORTANT: keep this in sync with `firestore.rules`. If a new collection
   is added there, or a scope is changed, mirror it here. The runtime
   audit in DiagnosticsPanel cross-checks against rules anyway, but this
   map is the source for the UX-level banner filter.

   Pre-V21.9.61: warehouse_keeper saw a scary red "6 مجموعات بيانات denied"
   banner on every login — even though all 6 were collections HR/finance
   collections he was correctly never supposed to see. That banner blocked
   the actual signal (e.g., a truly broken rule).
   ═══════════════════════════════════════════════════════════════════════ */

/* Hardcoded scope → role list. Matches the fallbackRoles in firestore.rules.
   Note: if admin has customized factory/roleScopes, this map will be slightly
   off (we don't read the live doc here — would add a round-trip per filter
   call). The worst case is a denial gets shown that should have been hidden
   (or vice versa); never a security impact. */
export const SCOPE_ROLES = {
  isAdmin:          ["admin"],
  isManagerPlus:    ["admin", "manager"],
  isSalesScope:     ["admin", "manager", "sales_accountant"],
  isPurchaseScope:  ["admin", "manager", "purchase_accountant", "warehouse_keeper"],
  isWarehouseScope: ["admin", "manager", "purchase_accountant", "warehouse_keeper"],
  isAnyAccountant:  ["admin", "manager", "sales_accountant", "purchase_accountant", "payroll_accountant"],
  isHRRole:         ["admin", "manager", "payroll_accountant", "payroll_verifier"],
  isHRWriter:       ["admin", "manager", "payroll_accountant"],
  isAnyUser:        ["admin", "manager", "sales_accountant", "purchase_accountant",
                     "warehouse_keeper", "payroll_accountant", "payroll_verifier", "viewer"],
};

/* Collection name → required read scope. Only collections that DON'T use
   `isAnyUser()` for read appear here. Anything not in this map is assumed
   readable by everyone (so a denial = unexpected = banner-worthy).

   V21.9.66: added the missing post-V19.50 collections that were causing
   phantom banners for users who legitimately don't have access (Bossy
   Mostafa case — banner showed salesCreditNotesDays + purchaseDebitNotesDays
   denials because the map didn't know they were scope-restricted).
   Also covers the AI Agent collections. Keep this in sync with
   firestore.rules whenever a new collection is added. */
export const COLLECTION_READ_SCOPE = {
  /* HR / payroll — restricted to HR scope */
  hrLogDays:       "isHRRole",
  hrWeeksDocs:     "isHRRole",
  employeesDocs:   "isHRRole",
  empDebtsDocs:    "isHRRole",

  /* Accounting / financial */
  accountingDays:   "isAnyAccountant",
  custPaymentsDays: "isAnyAccountant",
  checksDays:       "isAnyAccountant",
  fixedAssets:      "isAnyAccountant",

  /* Treasury + purchase-scope */
  treasuryDays:           "isPurchaseScope",
  supplierPaymentsDays:   "isPurchaseScope",
  wsPaymentsDays:         "isPurchaseScope",
  purchaseInvoicesDays:   "isPurchaseScope",
  purchaseOrdersDays:     "isPurchaseScope",
  purchaseReceiptsDays:   "isPurchaseScope",
  treasuryTransfersDays:  "isPurchaseScope",
  /* V21.9.66: purchase debit notes (V21.9.5) — purchase-scope read */
  purchaseDebitNotesDays: "isPurchaseScope",

  /* Sales-scope */
  salesInvoicesDays: "isSalesScope",
  /* V21.9.66: sales credit notes (V21.9.5) — sales-scope read */
  salesCreditNotesDays: "isSalesScope",

  /* Manager+ */
  auditDays:                "isManagerPlus",
  /* V21.9.66: AI Agent collections (V19.71+) — manager-only by design */
  aiAgentConversations:     "isManagerPlus",
  aiAgentEscalations:       "isManagerPlus",
  aiAgentSuggestions:       "isManagerPlus",
  aiAgentAnalytics:         "isManagerPlus",
  /* V21.9.66: AI sales notifications — sales-scope */
  aiAgentSalesNotifications: "isSalesScope",

  /* Admin only */
  backups: "isAdmin",
};

/* Predicate: is this collection EXPECTED to be denied for this role?
   Returns true if the user's role is NOT in the scope that owns this
   collection — meaning the denial is intentional (security-by-design)
   and the banner should suppress it.

   V21.9.62: now takes an optional `liveScopes` arg — the data from
   `factory/roleScopes` doc. If provided, lookups go through that first
   (so admin customizations are honored), falling back to hardcoded
   defaults only when the doc has no entry. Pre-V21.9.62 the check used
   hardcoded defaults only, which gave false negatives for users who had
   customized scopes (e.g., Ahmed removed `manager` from `isHRRole` so
   his production manager wouldn't see salaries — but the banner still
   showed because the hardcoded list still had manager).
*/
export function isExpectedDenial(role, collectionName, liveScopes) {
  if (!role || !collectionName) return false;
  /* Admin is in every scope (auto-protection from V21.9.32 — never demoted) */
  if (role === "admin") return false;

  const scope = COLLECTION_READ_SCOPE[collectionName];
  if (!scope) return false; /* collection not in our map = treat as unexpected */

  /* Prefer live scopes from factory/roleScopes; fall back to hardcoded */
  const live = liveScopes && typeof liveScopes === "object" ? liveScopes[scope] : null;
  const allowedRoles = Array.isArray(live) ? live : (SCOPE_ROLES[scope] || []);

  /* Custom roles created via the UI may not appear in any scope (admin
     hasn't mapped them yet). Treat their denials as UNEXPECTED so the
     banner surfaces and prompts the admin to update roleScopes.
     Built-in roles, when not in the allowed list, are intentional denials. */
  const isKnownBuiltIn = SCOPE_ROLES.isAnyUser.includes(role);
  if (!isKnownBuiltIn) return false;

  return !allowedRoles.includes(role);
}
