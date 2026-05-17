/* ═══════════════════════════════════════════════════════════════════════
   CLARK · UI Permissions → Firestore Role Scopes Sync (V21.9.63)
   ─────────────────────────────────────────────────────────────────────
   This file is the bridge between the two permission layers in CLARK:

     1. UI permissions      (config.permissions)     → controls what tabs/
                                                       buttons the user sees
     2. Firestore scopes    (factory/roleScopes)     → controls what data
                                                       Firestore lets them
                                                       read/write

   Before V21.9.63 these were edited in two separate places. Admin had to
   change UI perms in Settings, THEN go to Diagnostics → Role Scopes Editor
   and manually update the scopes — easy to forget. Ahmed's repeated bug
   reports about the "permission-denied" banner were rooted in this gap.

   This module:
   - Maps every UI tab to the Firestore scopes it implies (TAB_TO_SCOPES)
   - Computes a full roleScopes doc from UI permissions (computeRoleScopes)
   - Writes it to factory/roleScopes when admin saves UI perms

   Result: admin edits ONE place (the new PermissionsCard), and both
   layers stay in sync automatically. The Role Scopes Editor in
   Diagnostics is kept as a read-only advanced view.

   ═══════════════════════════════════════════════════════════════════════ */

import { doc, setDoc } from "firebase/firestore";
import { db } from "../firebase.js";
import { PERMISSION_TABS, ROLE_KEYS, getEffectiveDefaultPerms, getEffectiveRoleKeys } from "./permissions.js";

/* Per-tab Firestore scope requirements.
   For each UI tab, this records:
     - ifView:  scopes the role needs to be in for VIEW-only access
     - ifEdit:  scopes the role needs to be in for EDIT (write) access
     - any:     scopes added when the perm is view OR edit (not hide)

   Tabs not listed here have no specific Firestore scope requirement —
   they read isAnyUser data only (which everyone has).

   The mapping is derived from firestore.rules. Keep in sync if rules
   change. Adding a new collection? Update both rules + this map. */
const TAB_TO_SCOPES = {
  /* Sales side */
  custDeliver:     { ifEdit: ["isSalesScope"] },
  salesInvoices:   { any: ["isSalesScope"] },
  creditNotes:     { any: ["isSalesScope"] },

  /* Purchase side */
  purchase:           { any: ["isPurchaseScope"] },
  purchaseInvoices:   { any: ["isPurchaseScope"] },
  debitNotes:         { any: ["isPurchaseScope"] },

  /* Warehouse */
  warehouse:  { ifEdit: ["isPurchaseScope", "isWarehouseScope"] },
  pieces:     { ifEdit: ["isWarehouseScope"] },

  /* Treasury / financial */
  treasury:   { any: ["isPurchaseScope"] },

  /* Accounting */
  accounting:  { any: ["isAnyAccountant"] },
  fixedAssets: { ifView: ["isAnyAccountant"], ifEdit: ["isAnyAccountant", "isManagerPlus"] },

  /* Audit */
  audit:      { any: ["isManagerPlus"] },

  /* Order details / external production / master DB
     These write to seasons/orders, workshopsDocs, customersDocs etc.
     which require isManagerPlus or similar. View is always allowed
     (isAnyUser), so no read scope needed. */
  details:    { ifEdit: ["isManagerPlus"] },
  external:   { ifEdit: ["isManagerPlus"] },
  db:         { ifEdit: ["isManagerPlus"] },

  /* Tabs with NO specific scope requirement (all isAnyUser-readable):
     - dashboard, reports, tasks
     - campaigns, automation, aiAgent, shopify
     - settings (admin-only by rule, never granted via sync)
     These aren't listed — falling through to no-op. */
};

/* HR is special — its permission can be a string OR an object with 4
   sub-keys (weeks, verify, employees, security). Compute the scopes
   based on the highest-privilege sub-perm. */
function getHrScopes(hrPerm) {
  const scopes = [];
  let anyView = false;
  let anyEdit = false;
  if (typeof hrPerm === "string") {
    if (hrPerm === "view") anyView = true;
    if (hrPerm === "edit") { anyView = true; anyEdit = true; }
  } else if (hrPerm && typeof hrPerm === "object") {
    for (const sub of ["weeks", "verify", "employees", "security"]) {
      const v = hrPerm[sub];
      if (v === "view") anyView = true;
      if (v === "edit") { anyView = true; anyEdit = true; }
    }
  }
  if (anyView) scopes.push("isHRRole");
  if (anyEdit) scopes.push("isHRWriter");
  return scopes;
}

/* Resolve effective permission for a role (draft override OR default).
   Same logic as effectivePermWithCustoms but lighter — no admin special
   handling needed here (we exclude admin from this iteration). */
function effectiveForRole(role, draftPerms, config) {
  const override = (draftPerms || {})[role] || {};
  const defaults = getEffectiveDefaultPerms(role, config) || {};
  /* Merge: override wins per-tab */
  const merged = { ...defaults };
  for (const k of Object.keys(override)) {
    merged[k] = override[k];
  }
  return merged;
}

/* Compute the full factory/roleScopes object from UI permissions.

   Returns an object like:
     { isAdmin: ['admin'], isManagerPlus: ['admin','manager'], ... }

   Admin is ALWAYS included in every scope (V21.9.32 auto-protection).
   Custom roles are included like built-ins.

   Pure function — no Firestore calls. */
export function computeRoleScopes(permissions, config) {
  const allRoleKeys = getEffectiveRoleKeys(config); /* built-in + custom */

  /* Initialize all scopes with admin baseline */
  const scopes = {
    isAdmin:          ["admin"],
    isManagerPlus:    ["admin"],
    isSalesScope:     ["admin"],
    isPurchaseScope:  ["admin"],
    isWarehouseScope: ["admin"],
    isAnyAccountant:  ["admin"],
    isHRRole:         ["admin"],
    isHRWriter:       ["admin"],
    /* isAnyUser is the universal scope — every authed role is in it,
       built-in or custom. This is what firestore.rules uses for
       "any user can read this collection" rules. */
    isAnyUser:        [...allRoleKeys],
  };

  /* Walk each non-admin role × each tab and add to scopes per the map */
  for (const role of allRoleKeys) {
    if (role === "admin") continue;
    const perms = effectiveForRole(role, permissions, config);

    /* Special handling: manager always in isManagerPlus (legacy convention,
       and UI doesn't have a direct "is this a manager?" toggle — it's
       implied by the built-in role identity). */
    if (role === "manager") {
      if (!scopes.isManagerPlus.includes("manager")) scopes.isManagerPlus.push("manager");
    }

    for (const tab of PERMISSION_TABS) {
      const tabPerm = perms[tab.key];

      /* HR is special — sub-perm object */
      if (tab.key === "hr") {
        const hrScopes = getHrScopes(tabPerm);
        for (const s of hrScopes) {
          if (scopes[s] && !scopes[s].includes(role)) scopes[s].push(role);
        }
        continue;
      }

      /* Skip hide and missing perms */
      if (!tabPerm || tabPerm === "hide") continue;

      const mapping = TAB_TO_SCOPES[tab.key];
      if (!mapping) continue;

      /* "any" — applies for view OR edit (not hide) */
      for (const s of (mapping.any || [])) {
        if (scopes[s] && !scopes[s].includes(role)) scopes[s].push(role);
      }
      /* "ifView" — applies when perm is view (not edit, since edit gets ifEdit) */
      if (tabPerm === "view") {
        for (const s of (mapping.ifView || [])) {
          if (scopes[s] && !scopes[s].includes(role)) scopes[s].push(role);
        }
      }
      /* "ifEdit" — applies for edit (also implies view-level if any) */
      if (tabPerm === "edit") {
        for (const s of (mapping.ifEdit || [])) {
          if (scopes[s] && !scopes[s].includes(role)) scopes[s].push(role);
        }
        /* edit also satisfies ifView (write implies read) */
        for (const s of (mapping.ifView || [])) {
          if (scopes[s] && !scopes[s].includes(role)) scopes[s].push(role);
        }
      }
    }
  }

  /* Determinism: sort each scope's role list alphabetically (admin first
     by virtue of starting with 'a'). Helps with diff/idempotency checks. */
  for (const k of Object.keys(scopes)) {
    scopes[k] = scopes[k].slice().sort();
  }
  return scopes;
}

/* Compare two scopes objects for equality (ignoring role-order within
   each scope's array). Used to skip writes when nothing changed. */
function scopesEqual(a, b) {
  if (!a || !b) return false;
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!bKeys.includes(k)) return false;
    const aArr = (a[k] || []).slice().sort();
    const bArr = (b[k] || []).slice().sort();
    if (aArr.length !== bArr.length) return false;
    for (let i = 0; i < aArr.length; i++) {
      if (aArr[i] !== bArr[i]) return false;
    }
  }
  return true;
}

/* Write the computed scopes to factory/roleScopes.
   - Returns { ok: true, written: true } on successful write
   - Returns { ok: true, written: false, reason: 'no-change' } if nothing
     changed since the last known live scopes
   - Returns { ok: false, error } on failure (e.g., not admin → rules deny)

   Errors are non-fatal — caller should show a soft toast and continue. */
export async function syncRoleScopesToFirestore(permissions, config, currentLiveScopes) {
  try {
    const computed = computeRoleScopes(permissions, config);
    if (currentLiveScopes && scopesEqual(computed, currentLiveScopes)) {
      return { ok: true, written: false, reason: "no-change" };
    }
    const ref = doc(db, "factory", "roleScopes");
    await setDoc(ref, computed, { merge: false });
    return { ok: true, written: true, scopes: computed };
  } catch (err) {
    const code = err?.code || "";
    const msg = err?.message || String(err);
    console.warn("[V21.9.63] syncRoleScopes failed:", code, msg);
    return { ok: false, error: msg, code };
  }
}
