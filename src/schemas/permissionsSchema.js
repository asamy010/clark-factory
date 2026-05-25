/* ════════════════════════════════════════════════════════════════════════
   CLARK V21.9.182 — Permissions schema (WARN-only mode)
   ════════════════════════════════════════════════════════════════════════

   Why this exists:
   The permissions system (factory/config.users + .permissions + .customRoles)
   is the most security-sensitive part of CLARK. A typo in a permission key
   (e.g. `salesInvoces` instead of `salesInvoices`) silently lets the role
   keep its default — there's no error, no warning, just an invisible gap
   between intent and effective access. Same for an invalid level
   ("EDIT" vs "edit", "show" vs "view") — the lookup falls through to
   "hide" and the user loses access without being told why.

   Before V21.9.182, the schema validator in `validateData.js` only covered
   array-shaped fields (customers, invoices, payments, …). It skipped
   factory/config.permissions (object) and factory/config.users (object map)
   entirely. This file fills that gap with WARN-only validation: any typo,
   unknown tab, invalid level, orphan role reference is logged to console
   + recorded in the recent-errors store + surfaced in Settings →
   "آخر أخطاء التحقق".

   ─── Mode ───
   WARN-only. The write proceeds regardless. After observing real production
   for a week or two (no false positives), V21.9.184+ can promote to STRICT
   (reject invalid permission writes at upConfig time).

   ─── What is checked ───
   1. config.users[uid] — must be a string role key OR {role, customPerms?, …}
      and the referenced role must exist (built-in or custom).
   2. config.permissions[role][tabKey] — role must exist, tabKey must be
      in PERMISSION_TAB_KEYS, value must be "edit"|"view"|"hide" or
      (for hr) an object with valid sub-keys + valid levels.
   3. config.customRoles[i] — key must start with "custom_", label required,
      defaults map (if present) must follow the same rules as permissions.

   ─── What is NOT checked ───
   - Whether the user actually exists in Firebase Auth (we can't see Auth
     from the client; that's a separate cross-system check).
   - Whether `basedOn` for custom roles points to a still-existing role
     (we just check it's a non-empty string).
   ════════════════════════════════════════════════════════════════════════ */

import { z } from "zod";
import {
  PERMISSION_TAB_KEYS,
  ROLE_KEYS,
  HR_SUBKEYS,
} from "../utils/permissions.js";

/* The three valid levels. Anything else (typo, wrong case) fails. */
export const PERMISSION_LEVEL = z.enum(["edit", "view", "hide"]);

const HR_SUB_KEY_LIST = HR_SUBKEYS.map(s => s.key);

/* HR sub-permission object: { weeks: "edit", verify: "view", … }.
   passthrough() so future sub-keys don't break the validator immediately;
   but unknown keys are surfaced as warnings by the imperative validator
   (see validatePermissions.js) which is stricter than Zod alone. */
export const hrSubPermSchema = z.object(
  HR_SUB_KEY_LIST.reduce((acc, k) => {
    acc[k] = PERMISSION_LEVEL.optional();
    return acc;
  }, {})
).passthrough();

/* A tab's value: either a level string, OR (for hr) an object of sub-levels. */
export const tabLevelSchema = z.union([PERMISSION_LEVEL, hrSubPermSchema]);

/* A role's full permission map: { dashboard: "edit", hr: {…}, … }. */
export const rolePermsSchema = z.object(
  PERMISSION_TAB_KEYS.reduce((acc, k) => {
    acc[k] = tabLevelSchema.optional();
    return acc;
  }, {})
).passthrough();

/* A custom role entry from config.customRoles[]. */
export const customRoleSchema = z.object({
  key: z
    .string()
    .min(1, "custom role key مطلوب")
    .regex(/^custom_/, "custom role key لازم يبدأ بـ 'custom_'"),
  label: z.string().min(1, "اسم الدور (label) مطلوب"),
  basedOn: z.string().optional(),
  defaults: rolePermsSchema.optional(),
  isCustom: z.boolean().optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
  description: z.string().optional(),
  createdAt: z.string().optional(),
  createdBy: z.string().optional(),
}).passthrough();

/* A user entry from config.users[uid].
   Legacy form: bare string (e.g. "manager").
   Modern form: { role, customPerms? }. */
export const userEntrySchema = z.union([
  z.string().min(1),
  z.object({
    role: z.string().min(1, "role مطلوب على entry الـ user"),
    customPerms: z.object({}).passthrough().optional(),
  }).passthrough(),
]);

/* Re-export for callers that want the raw role-key set (built-in only). */
export const BUILT_IN_ROLE_KEYS = ROLE_KEYS;
