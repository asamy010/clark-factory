/* V16.59: Central unit list — single source of truth for all unit dropdowns
   across the app (warehouse products, fabric defs, accessory defs, order
   form, purchase items). Previously each dropdown hard-coded its own list,
   so adding a new unit required editing 5 different files.
   
   The list lives in `config.inventoryUnits` (a plain string array) so the
   user can manage it from the Warehouse → Units tab. If `config.inventoryUnits`
   is undefined (fresh install or pre-V16.59 data), we fall back to a default
   list AND union in any units already in use across `inventoryItems[]` —
   this guarantees no legacy unit silently disappears from a dropdown.
   
   The optional `includeValue` parameter is the current value of the field
   being edited. If that value isn't already in the resolved list (e.g. an
   item imported from CSV with an unusual unit), we prepend it so the dropdown
   can render it correctly without losing data. */

export const DEFAULT_UNITS = [
  "قطعة", "متر", "كيلو", "لتر", "يارد",
  "علبة", "عبوة", "شريط", "رول"
];

export function getUnits(config, includeValue) {
  const stored = (config && Array.isArray(config.inventoryUnits))
    ? config.inventoryUnits
    : null;

  let result;
  if (stored && stored.length > 0) {
    /* User has configured an explicit list — use it verbatim. */
    result = [...stored];
  } else if (stored && stored.length === 0) {
    /* Explicit empty list — respect it but still surface the current value
       if any, so the editor isn't left with an empty <Sel>. */
    result = [];
  } else {
    /* Not configured yet — defaults + units already in use across the
       inventory. Order: defaults first (most common units stay on top),
       then any extras unique to existing data (preserves user data on
       first run before they open the Units tab). */
    result = [...DEFAULT_UNITS];
    const inUse = new Set();
    const items = (config && Array.isArray(config.inventoryItems))
      ? config.inventoryItems : [];
    items.forEach(it => {
      if (it && typeof it.unit === "string" && it.unit.trim()) {
        inUse.add(it.unit.trim());
      }
    });
    inUse.forEach(u => {
      if (!result.includes(u)) result.push(u);
    });
  }

  /* Backward-compat: if the field's current value isn't in the resolved list,
     prepend it so the <Sel> can render the existing data without dropping it
     to "" or silently mutating it on first interaction. */
  if (includeValue && typeof includeValue === "string" && includeValue.trim() &&
      !result.includes(includeValue)) {
    return [includeValue, ...result];
  }
  return result;
}

/* Detect how many inventory items are using a given unit string. Used by
   the Units management UI to warn before deleting a unit currently in use. */
export function countUnitUsage(config, unit) {
  if (!unit) return 0;
  const items = (config && Array.isArray(config.inventoryItems))
    ? config.inventoryItems : [];
  return items.filter(it => it && it.unit === unit).length;
}
