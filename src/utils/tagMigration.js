/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Tag Migration Helper (V21.11.3 — #10 Slice 2)
   ───────────────────────────────────────────────────────────────────────
   One-time migration that converts legacy string-array tags (mainly from
   Shopify customer sync) to ID-based tags in the new tagRegistry system.

   Idempotent: a flag `_tagMigrationV1Done` on factory/config prevents
   double-runs. Re-running after manual revert is safe — it would just
   re-create missing registry entries.

   --- What it does ---
   For each entity with `.tags` that contains any string (not "tag_..."):
     1. Looks up the nameLC in tagRegistry
     2. If found, replaces the string with the existing tag's ID
     3. If not found, creates a new registry entry with a preset color
     4. Sets `entity.tags = [...IDs]`

   Currently scans:
     - data.customers (Shopify-imported tags)

   Future slices will extend to:
     - data.suppliers
     - data.inventoryItems
     - data.workshops
     - data.employees
   ═══════════════════════════════════════════════════════════════════════ */

import { migrateEntityTagsStringsToIds, TAG_PRESET_COLORS } from "./tags.js";

export const TAG_MIGRATION_FLAG = "_tagMigrationV1Done";

/* Mutator: runs the migration on factory/config. Idempotent via flag. */
export function runTagMigrationV1Mutator(d, userName){
  if(d[TAG_MIGRATION_FLAG]){
    return { skipped: true, reason: "already_done" };
  }
  if(!Array.isArray(d.tagRegistry)) d.tagRegistry = [];

  let migratedCustomers = 0;
  let createdTags = 0;
  const beforeRegistry = d.tagRegistry.length;

  /* Customers — main source of legacy string tags (from Shopify sync) */
  if(Array.isArray(d.customers)){
    d.customers.forEach(c => {
      if(!Array.isArray(c.tags)) return;
      const hasStringTags = c.tags.some(t => typeof t === "string" && !t.startsWith("tag_"));
      if(!hasStringTags) return;
      migrateEntityTagsStringsToIds(d, c, "customer", userName || "system-migration");
      migratedCustomers++;
    });
  }

  createdTags = d.tagRegistry.length - beforeRegistry;

  d[TAG_MIGRATION_FLAG] = {
    ranAt: new Date().toISOString(),
    ranBy: userName || "system-migration",
    migratedCustomers,
    createdTags,
  };

  return {
    skipped: false,
    migratedCustomers,
    createdTags,
  };
}

/* Check if migration is needed (without running). */
export function isTagMigrationNeeded(data){
  if(data[TAG_MIGRATION_FLAG]) return false;
  if(!Array.isArray(data.customers)) return false;
  return data.customers.some(c =>
    Array.isArray(c.tags) && c.tags.some(t => typeof t === "string" && !t.startsWith("tag_"))
  );
}
