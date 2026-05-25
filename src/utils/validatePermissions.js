/* ════════════════════════════════════════════════════════════════════════
   CLARK V21.9.182 — Permissions validator (WARN-only)
   ════════════════════════════════════════════════════════════════════════

   Imperative validator for factory/config.users + .permissions + .customRoles.
   Used to be implicit (silent fallback to "hide" on unknown keys); now
   every gap surfaces as a warning in the console + the Settings UI.

   Why imperative (vs pure Zod safeParse): the rules cross multiple fields —
   e.g. "this user's role must exist somewhere", or "this permissions[role]
   block refers to a custom role that was deleted". Zod can validate
   individual shapes; the imperative pass validates the cross-references.

   Called by validateData.js when ANY of {users, permissions, customRoles}
   changed in a config write. Diffed at the doc level (not per-key) for
   simplicity — the validation runtime is tiny (< 50 users × ~25 tabs).

   Output: an array of issue records. Each record has the same shape as
   the existing validateData errors so they flow through the same
   pushError() ring buffer and Settings UI card.
   ════════════════════════════════════════════════════════════════════════ */

import {
  PERMISSION_TAB_KEYS,
  HR_SUBKEYS,
  ROLE_KEYS,
} from "./permissions.js";
import {
  userEntrySchema,
  customRoleSchema,
  rolePermsSchema,
  tabLevelSchema,
} from "../schemas/permissionsSchema.js";

const VALID_LEVELS = new Set(["edit", "view", "hide"]);
const HR_SUB_KEY_SET = new Set(HR_SUBKEYS.map(s => s.key));
const TAB_KEY_SET = new Set(PERMISSION_TAB_KEYS);
const BUILT_IN_ROLE_SET = new Set(ROLE_KEYS);

/* Build the full set of valid role keys for THIS config snapshot.
   Includes built-in roles + every key from customRoles[]. */
function buildValidRoleSet(config){
  const set = new Set(BUILT_IN_ROLE_SET);
  const customs = (config && Array.isArray(config.customRoles)) ? config.customRoles : [];
  for(const c of customs){
    if(c && typeof c === "object" && c.key) set.add(c.key);
  }
  return set;
}

/* Helper: format a Zod issue list for display. */
function zodIssues(error){
  const issues = (error && error.issues) || [];
  return issues.slice(0, 5).map(i => ({
    path: (i.path || []).join("."),
    message: i.message,
    code: i.code,
  }));
}

/* ─── PUBLIC ──────────────────────────────────────────────────────────────
   Returns an array of { docKey, field, entryId, entryLabel, issues } —
   same shape as validateData.js for uniform error surfacing.

   `prev` is used to skip re-warning about issues that existed before this
   write (avoids spamming the user when they edit an unrelated permissions
   cell and pre-existing typos resurface). If a typo is NEW in this write,
   it's reported; if it was already there in `prev`, it's suppressed (but
   still visible if the user runs the diagnostics scan-all action).

   Pass `force: true` to skip the diff and report every issue (used by the
   diagnostics panel "scan now" button).
*/
export function validatePermissions(prev, next, opts){
  const force = !!(opts && opts.force);
  const out = [];
  if(!next || typeof next !== "object") return out;

  /* If only NEW issues should be reported, build a signature set from prev. */
  const prevIssueKeys = force ? null : collectIssueSignatures(prev);

  const validRoles = buildValidRoleSet(next);

  /* ─── 1. customRoles[] ─────────────────────────────────────────────── */
  const customs = Array.isArray(next.customRoles) ? next.customRoles : [];
  for(let i = 0; i < customs.length; i++){
    const c = customs[i];
    if(!c || typeof c !== "object"){
      pushIssue(out, prevIssueKeys, {
        field: "customRoles",
        entryId: "[" + i + "]",
        entryLabel: "(empty)",
        issues: [{ path: String(i), message: "custom role entry must be an object", code: "shape" }],
      });
      continue;
    }
    /* Reject duplicate or built-in-shadowing keys */
    if(c.key && BUILT_IN_ROLE_SET.has(c.key)){
      pushIssue(out, prevIssueKeys, {
        field: "customRoles",
        entryId: c.key,
        entryLabel: c.label || c.key,
        issues: [{ path: "key", message: "custom role key conflicts with built-in role: " + c.key, code: "shadow" }],
      });
    }
    /* Schema shape */
    const r = customRoleSchema.safeParse(c);
    if(!r.success){
      pushIssue(out, prevIssueKeys, {
        field: "customRoles",
        entryId: c.key || "[" + i + "]",
        entryLabel: c.label || c.key || "(unnamed)",
        issues: zodIssues(r.error),
      });
    }
    /* Deep walk: defaults map keys + values */
    if(c.defaults && typeof c.defaults === "object"){
      const cellIssues = walkRolePerms(c.defaults, c.key || "custom_?");
      for(const ci of cellIssues){
        pushIssue(out, prevIssueKeys, {
          field: "customRoles",
          entryId: c.key || "[" + i + "]",
          entryLabel: c.label || c.key || "(unnamed)",
          issues: [ci],
        });
      }
    }
  }

  /* ─── 2. permissions{ role: {tab: level | hrObj} } ─────────────────── */
  const perms = (next.permissions && typeof next.permissions === "object") ? next.permissions : null;
  if(perms){
    for(const role of Object.keys(perms)){
      /* Role must exist somewhere (built-in or custom) */
      if(!validRoles.has(role)){
        pushIssue(out, prevIssueKeys, {
          field: "permissions",
          entryId: role,
          entryLabel: role,
          issues: [{
            path: role,
            message: "permissions[" + role + "] يـ reference دور غير موجود (لا مدمج ولا مخصص) — orphan",
            code: "orphan_role",
          }],
        });
      }
      const map = perms[role];
      if(map && typeof map === "object"){
        const cellIssues = walkRolePerms(map, role);
        for(const ci of cellIssues){
          pushIssue(out, prevIssueKeys, {
            field: "permissions",
            entryId: role,
            entryLabel: role,
            issues: [ci],
          });
        }
      } else if(map !== undefined){
        pushIssue(out, prevIssueKeys, {
          field: "permissions",
          entryId: role,
          entryLabel: role,
          issues: [{ path: role, message: "permissions[" + role + "] لازم يكون object", code: "shape" }],
        });
      }
    }
  }

  /* ─── 3. users { uid: roleStr | {role, customPerms?} } ─────────────── */
  const users = (next.users && typeof next.users === "object") ? next.users : null;
  if(users){
    for(const uid of Object.keys(users)){
      const u = users[uid];
      const label = (u && typeof u === "object" && (u.name || u.email)) ? (u.name || u.email) : uid;
      /* Shape */
      const r = userEntrySchema.safeParse(u);
      if(!r.success){
        pushIssue(out, prevIssueKeys, {
          field: "users",
          entryId: uid,
          entryLabel: label,
          issues: zodIssues(r.error),
        });
        continue;
      }
      /* Cross-ref: role must exist */
      const roleKey = (typeof u === "string") ? u : (u && u.role);
      if(roleKey && !validRoles.has(roleKey)){
        pushIssue(out, prevIssueKeys, {
          field: "users",
          entryId: uid,
          entryLabel: label,
          issues: [{
            path: "role",
            message: "user يـ point لدور غير موجود: " + roleKey,
            code: "orphan_role",
          }],
        });
      }
      /* customPerms (if any) — same walk as permissions[role] */
      if(u && typeof u === "object" && u.customPerms && typeof u.customPerms === "object"){
        const cellIssues = walkRolePerms(u.customPerms, "user:" + uid);
        for(const ci of cellIssues){
          pushIssue(out, prevIssueKeys, {
            field: "users",
            entryId: uid,
            entryLabel: label,
            issues: [ci],
          });
        }
      }
    }
  }

  return out;
}

/* ─── INTERNAL ───────────────────────────────────────────────────────── */

/* Walk one role's permission map and yield issues for unknown tab keys
   or invalid levels. Strict beyond Zod's passthrough() — Zod allows
   unknown keys; we want them flagged. */
function walkRolePerms(map, contextLabel){
  const issues = [];
  if(!map || typeof map !== "object") return issues;
  for(const key of Object.keys(map)){
    const val = map[key];
    /* Tab key validity */
    if(!TAB_KEY_SET.has(key)){
      issues.push({
        path: contextLabel + "." + key,
        message: "tab key غير معروف: \"" + key + "\" (لازم يكون من PERMISSION_TAB_KEYS)",
        code: "unknown_tab",
      });
      continue;
    }
    /* Special case: hr can be string or object */
    if(key === "hr"){
      if(typeof val === "string"){
        if(!VALID_LEVELS.has(val)){
          issues.push({
            path: contextLabel + ".hr",
            message: "hr level غير صحيح: \"" + val + "\" (المسموح: edit/view/hide)",
            code: "invalid_level",
          });
        }
      } else if(val && typeof val === "object"){
        for(const subK of Object.keys(val)){
          if(!HR_SUB_KEY_SET.has(subK)){
            issues.push({
              path: contextLabel + ".hr." + subK,
              message: "hr sub-key غير معروف: \"" + subK + "\" (المسموح: weeks/verify/employees/security)",
              code: "unknown_hr_sub",
            });
            continue;
          }
          if(!VALID_LEVELS.has(val[subK])){
            issues.push({
              path: contextLabel + ".hr." + subK,
              message: "hr." + subK + " level غير صحيح: \"" + val[subK] + "\"",
              code: "invalid_level",
            });
          }
        }
      } else if(val !== undefined){
        issues.push({
          path: contextLabel + ".hr",
          message: "hr لازم يكون string أو object",
          code: "shape",
        });
      }
      continue;
    }
    /* Regular tabs: value must be a level string */
    if(val !== undefined && !VALID_LEVELS.has(val)){
      issues.push({
        path: contextLabel + "." + key,
        message: key + " level غير صحيح: \"" + val + "\" (المسموح: edit/view/hide)",
        code: "invalid_level",
      });
    }
  }
  return issues;
}

/* Build a Set of issue signatures from a prior config snapshot — used
   to suppress re-warnings about pre-existing issues. */
function collectIssueSignatures(prev){
  if(!prev || typeof prev !== "object") return new Set();
  const list = validatePermissions(null, prev, { force: true });
  return new Set(list.map(issueSignature));
}

function issueSignature(rec){
  /* Stable key per issue: field + entryId + path + code */
  const issues = (rec && rec.issues) || [];
  const first = issues[0] || {};
  return (rec.field || "") + "|" + (rec.entryId || "") + "|" + (first.path || "") + "|" + (first.code || "");
}

function pushIssue(out, prevSignatures, record){
  if(prevSignatures){
    const sig = issueSignature(record);
    if(prevSignatures.has(sig)) return;
  }
  out.push(record);
}

/* ─── PUBLIC HELPER for diagnostics panel ──────────────────────────────
   Run a full scan of the current config (no diff suppression) and return
   the issue list. Used by the "تحقّق من الصلاحيات" button in Settings. */
export function scanPermissionsConfig(config){
  return validatePermissions(null, config, { force: true });
}
