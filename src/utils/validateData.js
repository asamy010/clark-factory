/* ════════════════════════════════════════════════════════════════════════
   CLARK V19.58 — Data validation layer (WARN-only mode)
   ════════════════════════════════════════════════════════════════════════

   Wraps Zod schemas with a non-blocking validator: every upConfig/upSales/
   upTasks call passes the post-mutation document through `validateDoc()`,
   which checks each field whose name appears in FIELD_SCHEMAS. Failures are:
     1. logged to console.warn
     2. accumulated in window.__clarkValidationErrors (last 100)
     3. surfaced in Settings → "آخر أخطاء التحقق" card

   The write proceeds regardless. After observing real production for a
   while we can switch problematic schemas to STRICT mode (throws → caller
   aborts).

   Why "diff-only": validating the entire array on every write would be
   expensive (e.g. 5000 customers × every keystroke). We only validate
   entries that actually CHANGED relative to the previous state.

   ════════════════════════════════════════════════════════════════════════ */

import { FIELD_SCHEMAS, VALIDATED_FIELDS } from "../schemas/index.js";
import { validatePermissions } from "./validatePermissions.js";

/* In-memory ring buffer of recent errors. Read by Settings UI. */
const RECENT_ERRORS_LIMIT = 100;
function getStore() {
  if (typeof window === "undefined") return { errors: [] };
  if (!window.__clarkValidationErrors) {
    window.__clarkValidationErrors = { errors: [] };
  }
  return window.__clarkValidationErrors;
}

function pushError(record) {
  const store = getStore();
  store.errors.unshift({
    ...record,
    at: new Date().toISOString(),
  });
  if (store.errors.length > RECENT_ERRORS_LIMIT) {
    store.errors.length = RECENT_ERRORS_LIMIT;
  }
}

export function getRecentValidationErrors() {
  return getStore().errors.slice();
}

export function clearValidationErrors() {
  const store = getStore();
  store.errors = [];
}

/* ─── core diff ─────────────────────────────────────────────────────────
   Returns the entries in `next` that are different from `prev` (by id).
   New entries (no match in prev) are included. Edits (same id, different
   content) are included. Pure deletes are NOT validated (nothing to check).
   We compare via JSON.stringify for simplicity — false positives just mean
   we re-validate an unchanged entry, which is harmless. */
function diffArrays(prev, next) {
  if (!Array.isArray(next)) return [];
  const prevById = new Map();
  if (Array.isArray(prev)) {
    for (const e of prev) {
      if (e && (e.id || e.id === 0)) prevById.set(String(e.id), e);
    }
  }
  const changed = [];
  for (const entry of next) {
    if (!entry || (!entry.id && entry.id !== 0)) continue;/* skip id-less */
    const id = String(entry.id);
    const prevEntry = prevById.get(id);
    if (!prevEntry) {
      changed.push(entry);
      continue;
    }
    /* Order-independent check is overkill here; a string compare catches
       99% of changes and is fast. */
    try {
      if (JSON.stringify(prevEntry) !== JSON.stringify(entry)) {
        changed.push(entry);
      }
    } catch {
      changed.push(entry);
    }
  }
  return changed;
}

/* ─── public API ─────────────────────────────────────────────────────── */

/**
 * Validate every entry in `next` whose schema is registered in FIELD_SCHEMAS.
 * Compares against `prev` to validate only changed entries.
 *
 * Returns {ok: boolean, errorCount: number, fieldsChecked: number}.
 * Always proceeds (WARN-only). Caller never needs to abort.
 *
 * @param {object} prev   The pre-mutation doc (for diffing).
 * @param {object} next   The post-mutation doc.
 * @param {string} docKey Optional label for error context ("config"/"sales"/"tasks").
 */
export function validateDoc(prev, next, docKey = "config") {
  if (!next || typeof next !== "object") {
    return { ok: true, errorCount: 0, fieldsChecked: 0 };
  }
  let errorCount = 0;
  let fieldsChecked = 0;
  for (const field of VALIDATED_FIELDS) {
    const schema = FIELD_SCHEMAS[field];
    if (!schema) continue;
    const arr = next[field];
    if (!Array.isArray(arr)) continue;/* field absent or not an array — skip */
    fieldsChecked++;

    const prevArr = (prev && Array.isArray(prev[field])) ? prev[field] : [];
    const changedEntries = diffArrays(prevArr, arr);
    if (changedEntries.length === 0) continue;

    for (const entry of changedEntries) {
      const result = schema.safeParse(entry);
      if (result.success) continue;
      errorCount++;
      const issues = (result.error?.issues || []).slice(0, 5).map(i => ({
        path: (i.path || []).join("."),
        message: i.message,
        code: i.code,
      }));
      const record = {
        docKey,
        field,
        entryId: String(entry?.id ?? "?"),
        entryLabel: entry?.name || entry?.invoiceNo || entry?.poNo || String(entry?.id ?? "?"),
        issues,
      };
      pushError(record);
      /* Single grouped warn per failed entry (avoid console spam in tight loops) */
      console.warn(
        "[V19.58 validation] " + docKey + "." + field + "[" + record.entryId + "]",
        "(" + record.entryLabel + ")",
        issues.map(i => i.path + ": " + i.message).join("; ")
      );
    }
  }

  /* ─── V21.9.182: permissions/users/customRoles validation ─────────────
     The Zod loop above only walks ARRAY fields (customers, invoices, …).
     The permissions system lives on OBJECT fields (config.permissions,
     config.users) which the loop skipped entirely — so typos in tab keys
     or invalid levels never surfaced. Run a dedicated imperative pass and
     funnel issues through the same pushError() store so they show up in
     Settings → "آخر أخطاء التحقق". */
  if (docKey === "config") {
    try {
      const permsChanged =
        !prev ||
        prev.permissions !== next.permissions ||
        prev.users !== next.users ||
        prev.customRoles !== next.customRoles;
      if (permsChanged) {
        const issues = validatePermissions(prev, next);
        for (const rec of issues) {
          errorCount++;
          const enriched = { ...rec, docKey: "config" };
          pushError(enriched);
          console.warn(
            "[V21.9.182 perms validation] config." + rec.field + "[" + rec.entryId + "]",
            "(" + rec.entryLabel + ")",
            (rec.issues || []).map(i => i.path + ": " + i.message).join("; ")
          );
        }
      }
    } catch (e) {
      console.warn("[V21.9.182 perms validator threw]", e);
    }
  }

  return { ok: errorCount === 0, errorCount, fieldsChecked };
}
