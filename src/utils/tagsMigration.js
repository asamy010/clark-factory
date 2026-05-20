/* ═══════════════════════════════════════════════════════════════
   CLARK V21.9.104 — Tags Migration helpers (Slice 4 of Universal Tagging)
   ───────────────────────────────────────────────────────────────
   Pure-function migration plan for converting legacy `c.tags = [...strings]`
   to ID references `c.tags = [...ids]`. Scans both customer arrays
   (`data.customers` and `data.shopifyCustomers`) since string tags
   may exist in either.

   Two-phase API:
     1. plan(...) — analyze + produce a preview. NO mutations.
     2. commit(plan, ...) — produce the registry/customer/shopifyCustomer
        diffs the caller writes via upConfig.

   Idempotent: if invoked on already-migrated data, plan() returns
   nothing-to-do (no new tags, no customers to update). Safe to re-run.

   Anti-pattern check (CLAUDE.md §10):
   - Not gated on a one-shot flag — plan() can run anytime
   - The flag _tagsCustomerMigrationV21_104_Done is set on commit
     as a marker, but does NOT block future runs
   - Backup of the pre-migration state is captured by the caller
     and persisted under backups/pre-tagsMigration-<ts>
   ═══════════════════════════════════════════════════════════════ */

import {
  generateTagId,
  normalizeTagName,
  displayTagName,
  TAG_COLORS,
} from "./tags.js";

/* True if the value is already a tag ID reference (vs a legacy string name). */
function isTagId(value){
  return typeof value === "string" && value.startsWith("tag_");
}

/* Same deterministic color picker as TagPicker — keeps inline-created
   tags and migration-created tags visually consistent. */
function pickColorForName(name){
  const s = String(name || "").toLowerCase();
  let h = 2166136261 >>> 0;
  for(let i = 0; i < s.length; i++){
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return TAG_COLORS[h % TAG_COLORS.length];
}

/* Build a fast lookup map from registry — keyed by nameLC for case-insensitive
   matching of legacy strings against existing tags. Skips archived. */
function buildRegistryIndex(registry){
  const map = new Map();
  for(const t of (registry || [])){
    if(t && t.nameLC && !t.archived) map.set(t.nameLC, t);
  }
  return map;
}

/* Analyze a single customer array. Returns:
     {
       analyzed,            // total customers visited
       alreadyMigrated,     // customers whose c.tags are all IDs
       willUpdate,          // customers that need string→ID rewrite
       newNames: Map<nameLC, {name, count}>,  // strings not in registry
       updates: [{id, newTags}]               // ready to apply
     }
   `newNames` is a Map (not array) so callers can merge results from
   multiple arrays without double-counting cross-array duplicates. */
function analyzeOne(customers, registryIndex, newNames){
  let analyzed = 0;
  let alreadyMigrated = 0;
  let willUpdate = 0;
  const updates = [];

  for(const c of (customers || [])){
    if(!c) continue;
    analyzed++;
    if(!Array.isArray(c.tags) || c.tags.length === 0){
      alreadyMigrated++;  // nothing to migrate counts as "already done" for this purpose
      continue;
    }
    /* Already-migrated: every entry is a tag ID. */
    if(c.tags.every(t => isTagId(t))){
      alreadyMigrated++;
      continue;
    }
    /* Mixed or legacy: produce the new IDs list, planning to create
       any names that don't match an existing registry entry. */
    const newTagIds = [];
    const seen = new Set();
    let touched = false;
    for(const raw of c.tags){
      if(typeof raw !== "string") continue;
      if(isTagId(raw)){
        if(!seen.has(raw)){ seen.add(raw); newTagIds.push(raw); }
        continue;
      }
      const display = displayTagName(raw);
      if(!display) continue;
      const lc = display.toLowerCase();
      touched = true;
      const existing = registryIndex.get(lc);
      if(existing){
        if(!seen.has(existing.id)){ seen.add(existing.id); newTagIds.push(existing.id); }
        continue;
      }
      /* Not in registry — plan to create. We use a placeholder marker so
         commit() can assign a real ID later (in case multiple customers
         reference the same legacy name — they should all map to one new tag). */
      const placeholder = "NEW::" + lc;
      if(!seen.has(placeholder)){ seen.add(placeholder); newTagIds.push(placeholder); }
      const entry = newNames.get(lc);
      if(entry) entry.count++;
      else newNames.set(lc, { name: display, count: 1 });
    }
    if(touched){
      willUpdate++;
      updates.push({ id: c.id, oldTags: c.tags.slice(), newTags: newTagIds });
    }else{
      alreadyMigrated++;
    }
  }

  return { analyzed, alreadyMigrated, willUpdate, updates };
}

/* Public: produce a migration preview from the current data.
   The plan is read-only and safe to display to the admin before commit. */
export function planTagsMigration(data){
  const registry = (data && Array.isArray(data.tagRegistry)) ? data.tagRegistry : [];
  const customers = (data && Array.isArray(data.customers)) ? data.customers : [];
  const shopifyCustomers = (data && Array.isArray(data.shopifyCustomers)) ? data.shopifyCustomers : [];

  const registryIndex = buildRegistryIndex(registry);
  const newNames = new Map();

  const customerResult = analyzeOne(customers, registryIndex, newNames);
  const shopifyResult = analyzeOne(shopifyCustomers, registryIndex, newNames);

  /* newTagsToCreate ordered by name for predictable preview UI. */
  const newTagsToCreate = Array.from(newNames.entries())
    .map(([lc, v]) => ({ nameLC: lc, name: v.name, count: v.count }))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ar"));

  return {
    summary: {
      customersAnalyzed: customerResult.analyzed,
      customersAlreadyMigrated: customerResult.alreadyMigrated,
      customersToUpdate: customerResult.willUpdate,
      shopifyCustomersAnalyzed: shopifyResult.analyzed,
      shopifyCustomersAlreadyMigrated: shopifyResult.alreadyMigrated,
      shopifyCustomersToUpdate: shopifyResult.willUpdate,
      newTagsToCreate: newTagsToCreate.length,
      registryEntriesMatched: 0,  // computed below
    },
    newTagsToCreate,
    customerUpdates: customerResult.updates,
    shopifyCustomerUpdates: shopifyResult.updates,
    hasWork: (customerResult.willUpdate + shopifyResult.willUpdate) > 0,
  };
}

/* Public: commit the plan. Returns a patch object the caller applies via upConfig.
   Order of operations matters:
     1. Materialize the new tags (assign real IDs to placeholders)
     2. Resolve customer updates to real IDs
     3. Resolve shopifyCustomer updates to real IDs
     4. Build the registry with new entries appended

   The returned `patch` includes:
     - tagRegistry: new registry array
     - customers: new customers array (if updates exist)
     - shopifyCustomers: new array (if updates exist)
     - _tagsCustomerMigrationV21_104_Done: true (audit flag)
     - _tagsCustomerMigrationV21_104_LastRunAt: ts
*/
export function commitTagsMigration(plan, data, user){
  if(!plan || !plan.hasWork){
    return { patch: { _tagsCustomerMigrationV21_104_LastRunAt: Date.now() }, stats: { newTags:0, customersUpdated:0, shopifyCustomersUpdated:0 } };
  }
  const registry = (data && Array.isArray(data.tagRegistry)) ? data.tagRegistry.slice() : [];
  const uid = (user && (user.uid || user.email)) || "migration";
  const now = Date.now();

  /* 1. Materialize new tags — placeholder "NEW::<lc>" → real tag ID. */
  const placeholderToId = new Map();
  for(const item of plan.newTagsToCreate){
    const newTag = {
      id: generateTagId(),
      name: item.name,
      nameLC: normalizeTagName(item.name),
      color: pickColorForName(item.name),
      icon: "",
      description: "تم الإنشاء تلقائياً أثناء ترحيل tags العملاء من النص الحرفي إلى مرجع الـ ID.",
      appliesTo: ["customer"],
      createdBy: uid,
      createdAt: now,
      lastUsedAt: now,
      archived: false,
      archivedAt: null,
      archivedBy: null,
    };
    registry.push(newTag);
    placeholderToId.set("NEW::" + item.nameLC, newTag.id);
  }

  /* 2. Resolve customer updates */
  const resolveList = (list) => list.map(id => placeholderToId.get(id) || id);

  const buildArrayPatch = (sourceArray, updates) => {
    if(!Array.isArray(sourceArray) || updates.length === 0) return null;
    const updateMap = new Map(updates.map(u => [u.id, resolveList(u.newTags)]));
    let touched = false;
    const next = sourceArray.map(c => {
      if(!c) return c;
      const newTags = updateMap.get(c.id);
      if(!newTags) return c;
      touched = true;
      return { ...c, tags: newTags };
    });
    return touched ? next : null;
  };

  const customers = (data && Array.isArray(data.customers)) ? data.customers : [];
  const shopifyCustomers = (data && Array.isArray(data.shopifyCustomers)) ? data.shopifyCustomers : [];

  const nextCustomers = buildArrayPatch(customers, plan.customerUpdates);
  const nextShopifyCustomers = buildArrayPatch(shopifyCustomers, plan.shopifyCustomerUpdates);

  const patch = {
    tagRegistry: registry,
    _tagsCustomerMigrationV21_104_Done: true,
    _tagsCustomerMigrationV21_104_LastRunAt: now,
  };
  if(nextCustomers) patch.customers = nextCustomers;
  if(nextShopifyCustomers) patch.shopifyCustomers = nextShopifyCustomers;

  return {
    patch,
    stats: {
      newTags: plan.newTagsToCreate.length,
      customersUpdated: plan.customerUpdates.length,
      shopifyCustomersUpdated: plan.shopifyCustomerUpdates.length,
    },
  };
}

/* Resolve tag IDs to display names for Shopify push (the bi-directional
   adapter — called by the server endpoint after reading factory/config).
   Backward-compatible: if a value is already a string name (legacy data
   pre-migration), it passes through untouched. */
export function resolveTagIdsToNames(tagValues, registry){
  if(!Array.isArray(tagValues)) return [];
  const byId = new Map();
  for(const t of (registry || [])){
    if(t && t.id) byId.set(t.id, t.name);
  }
  const out = [];
  for(const v of tagValues){
    if(typeof v !== "string") continue;
    const trimmed = v.trim();
    if(!trimmed) continue;
    if(isTagId(trimmed)){
      const name = byId.get(trimmed);
      if(name) out.push(name);
      /* If ID not found, silently skip — happens when a tag was hard-deleted
         from the registry but a customer still references it. This is rare
         and the safest behavior is to omit (the customer doesn't get a
         wrong tag pushed to Shopify). */
    } else {
      /* Legacy string — pass through. */
      out.push(trimmed);
    }
  }
  return out;
}
