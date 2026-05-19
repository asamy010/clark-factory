/* ═══════════════════════════════════════════════════════════════
   CLARK V21.9.101 — Universal Tagging utility
   ───────────────────────────────────────────────────────────────
   Pure functions for the Tag Registry. The Registry lives at
   data.tagRegistry (plain array on factory/config doc for MVP —
   same trade-off as documentsTree, will split to tagRegistryDocs
   once the array passes ~300 entries).

   Tags are stored on entities as ID references (NOT names):
     entity.tags = ["tag_kf3a_xyz123", "tag_kf4b_abc987"]

   Why IDs and not names:
     - Rename in registry → reflects everywhere instantly
     - Archive → entity displays auto-filter
     - Merge → migrate IDs in one pass
     - No fragmentation from "VIP" vs "vip" vs " VIP "

   All mutations are PURE: callers pass in registry/data, the
   functions return new arrays. The caller wires them through
   the standard upConfig() flow in App.jsx — same pattern as
   every other config-mutating helper in CLARK.
   ═══════════════════════════════════════════════════════════════ */

/* Preset 12-color palette. Hand-picked from the existing CLARK theme
   so chips look native against the light/dark/pink/odoo themes alike.
   Free hex picker was rejected (V21.9.101 design): consistency > flexibility. */
export const TAG_COLORS = [
  "#0EA5E9", "#10B981", "#F59E0B", "#8B5CF6",
  "#EF4444", "#06B6D4", "#84CC16", "#EC4899",
  "#F97316", "#14B8A6", "#A855F7", "#64748B",
];

/* Phase 1 entity types — Customer, Supplier, Item/Product, Order.
   Phase 2 (Workshop, Employee, Invoice, Treasury, Check, Session)
   will extend this array. ANY new entity type added here MUST also
   get an entry in TAG_ENTITY_LABELS + the page integration slice. */
export const TAGGABLE_ENTITY_TYPES = [
  "customer", "supplier", "item", "order",
];

export const TAG_ENTITY_LABELS = {
  customer: "عميل",
  supplier: "مورد",
  item: "صنف",
  order: "أوردر",
};

/* Error codes thrown by the mutating helpers. UI layer maps them
   to user-facing Arabic messages. Strings (not Error subclasses)
   keep them ergonomic for try/catch + showToast chains. */
export const TAG_ERRORS = {
  EMPTY: "TAG_NAME_EMPTY",
  EXISTS: "TAG_EXISTS",
  NOT_FOUND: "TAG_NOT_FOUND",
  INVALID_TYPE: "TAG_INVALID_ENTITY_TYPE",
};

/* ── Helpers ── */

/* Normalize a tag name for matching/comparison.
   Collapses whitespace runs and lowercases — so "VIP", " vip ",
   "Vip\t" all match the same registry entry. Display name keeps
   the original casing (just trimmed); nameLC is the lookup key. */
export function normalizeTagName(name){
  return String(name == null ? "" : name).trim().replace(/\s+/g, " ").toLowerCase();
}

/* Display-form name: trimmed + whitespace-collapsed, original case. */
export function displayTagName(name){
  return String(name == null ? "" : name).trim().replace(/\s+/g, " ");
}

/* Generate a stable, opaque tag ID. NOT name-derived — the name
   can change but the ID must stay stable so entity references
   don't break on rename. */
export function generateTagId(){
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 8);
  return "tag_" + ts + "_" + rnd;
}

export function sanitizeAppliesTo(appliesTo){
  if(!Array.isArray(appliesTo)) return [...TAGGABLE_ENTITY_TYPES];
  const filtered = appliesTo.filter(t => TAGGABLE_ENTITY_TYPES.includes(t));
  return filtered.length === 0 ? [...TAGGABLE_ENTITY_TYPES] : filtered;
}

/* ── Lookups ── */

export function findTagByName(name, registry){
  const nameLC = normalizeTagName(name);
  if(!nameLC) return null;
  return (registry || []).find(t => t && t.nameLC === nameLC && !t.archived) || null;
}

export function findTagById(id, registry){
  if(!id) return null;
  return (registry || []).find(t => t && t.id === id) || null;
}

/* Filter the registry for picker/filter UI. By default returns
   only active (non-archived) tags applicable to the given entity
   type. Pass entityType=null to get all active tags. */
export function getTagsByEntityType(registry, entityType, options){
  const includeArchived = !!(options && options.includeArchived);
  return (registry || []).filter(t => {
    if(!t) return false;
    if(!includeArchived && t.archived) return false;
    if(!entityType) return true;
    if(!Array.isArray(t.appliesTo) || t.appliesTo.length === 0) return true;
    return t.appliesTo.includes(entityType);
  });
}

/* ── Create / Update / Archive / Rename ── */

/* Create a tag. Soft-create semantics: if a tag with the same nameLC
   already exists active, return it (idempotent). If archived, un-archive
   and return. Only throws on empty name. This makes the picker's
   "create on Enter" flow safe to call without try/catch on duplicates. */
export function createTag(name, opts, registry, currentUser){
  const trimmed = displayTagName(name);
  if(!trimmed) throw new Error(TAG_ERRORS.EMPTY);

  const nameLC = trimmed.toLowerCase();
  const existing = (registry || []).find(t => t && t.nameLC === nameLC);

  if(existing){
    if(existing.archived){
      const updated = (registry || []).map(t =>
        t.id === existing.id
          ? { ...t, archived: false, archivedAt: null, archivedBy: null }
          : t
      );
      return { tag: updated.find(t => t.id === existing.id), registry: updated, isNew: false, wasArchived: true };
    }
    return { tag: existing, registry: registry || [], isNew: false, wasArchived: false };
  }

  const o = opts || {};
  const uid = (currentUser && (currentUser.uid || currentUser.email)) || "";
  const newTag = {
    id: generateTagId(),
    name: trimmed,
    nameLC,
    color: o.color || TAG_COLORS[0],
    icon: o.icon || "",
    description: o.description || "",
    appliesTo: sanitizeAppliesTo(o.appliesTo),
    createdBy: uid,
    createdAt: Date.now(),
    lastUsedAt: null,
    archived: false,
    archivedAt: null,
    archivedBy: null,
  };

  return {
    tag: newTag,
    registry: [...(registry || []), newTag],
    isNew: true,
    wasArchived: false,
  };
}

/* Update a tag's mutable properties (color/icon/description/appliesTo).
   The name uses renameTag separately because it has collision logic. */
export function updateTag(tagId, updates, registry){
  if(!tagId) throw new Error(TAG_ERRORS.NOT_FOUND);
  const u = updates || {};
  return (registry || []).map(t => {
    if(t.id !== tagId) return t;
    const next = { ...t };
    if(u.color !== undefined) next.color = u.color;
    if(u.icon !== undefined) next.icon = u.icon;
    if(u.description !== undefined) next.description = u.description;
    if(u.appliesTo !== undefined) next.appliesTo = sanitizeAppliesTo(u.appliesTo);
    return next;
  });
}

/* Rename a tag. Throws TAG_EXISTS if the new name collides with another
   ACTIVE tag (collisions with self-archived tag are allowed since we'll
   archive the colliding one is impossible — same id). */
export function renameTag(tagId, newName, registry){
  if(!tagId) throw new Error(TAG_ERRORS.NOT_FOUND);
  const trimmed = displayTagName(newName);
  if(!trimmed) throw new Error(TAG_ERRORS.EMPTY);
  const newLC = trimmed.toLowerCase();

  const collision = (registry || []).find(t =>
    t && t.id !== tagId && t.nameLC === newLC && !t.archived
  );
  if(collision) throw new Error(TAG_ERRORS.EXISTS + ":" + collision.id);

  return (registry || []).map(t =>
    t.id === tagId ? { ...t, name: trimmed, nameLC: newLC } : t
  );
}

export function archiveTag(tagId, registry, currentUser){
  const uid = (currentUser && (currentUser.uid || currentUser.email)) || "";
  return (registry || []).map(t =>
    t.id === tagId
      ? { ...t, archived: true, archivedAt: Date.now(), archivedBy: uid }
      : t
  );
}

export function unarchiveTag(tagId, registry){
  return (registry || []).map(t =>
    t.id === tagId
      ? { ...t, archived: false, archivedAt: null, archivedBy: null }
      : t
  );
}

/* Touch lastUsedAt — called from entity write flows to keep the registry
   informed about which tags are alive. Best-effort: throttled by caller
   if needed; this function itself is pure and synchronous. */
export function touchTagLastUsed(tagIds, registry){
  if(!Array.isArray(tagIds) || tagIds.length === 0) return registry;
  const set = new Set(tagIds);
  const now = Date.now();
  return (registry || []).map(t =>
    t && set.has(t.id) ? { ...t, lastUsedAt: now } : t
  );
}

/* ── Filtering / Display ── */

/* Filter a list of entities by tag IDs. Set-based membership test
   gives O(N) overall (N = entities, K = tagIds — K is tiny in practice).
   Mode "AND": entity must have ALL listed tagIds.
   Mode "OR" (default): entity must have ANY of the listed tagIds. */
export function filterByTags(entities, tagIds, mode){
  if(!Array.isArray(tagIds) || tagIds.length === 0) return entities || [];
  const isAnd = mode === "AND";

  if(isAnd){
    return (entities || []).filter(e => {
      if(!e) return false;
      const eTags = Array.isArray(e.tags) ? e.tags : null;
      if(!eTags || eTags.length === 0) return false;
      const eSet = new Set(eTags);
      for(const required of tagIds){
        if(!eSet.has(required)) return false;
      }
      return true;
    });
  }

  const tagSet = new Set(tagIds);
  return (entities || []).filter(e => {
    if(!e) return false;
    const eTags = Array.isArray(e.tags) ? e.tags : null;
    if(!eTags || eTags.length === 0) return false;
    for(const t of eTags){
      if(tagSet.has(t)) return true;
    }
    return false;
  });
}

/* Resolve an array of tag IDs to their full registry objects.
   Filters out missing IDs (silently — useful when the registry
   loaded but an entity has stale references after a hard-delete).
   By default skips archived tags too. */
export function resolveTagsForDisplay(tagIds, registry, options){
  if(!Array.isArray(tagIds) || tagIds.length === 0) return [];
  const includeArchived = !!(options && options.includeArchived);
  return tagIds
    .map(id => (registry || []).find(t => t && t.id === id))
    .filter(t => t && (includeArchived || !t.archived));
}

/* ── Usage analytics ── */

/* Count how many entities use this tag, across the standard taggable
   collections. Orders are NOT counted here because they live in
   seasons/{S}/orders subcollection — caller must pass an `extraSources`
   array if order coverage is needed. */
export function getTagUsageCount(tagId, data, extraSources){
  if(!tagId || !data) return 0;
  let count = 0;
  const sources = [
    data.customers,
    data.suppliers,
    data.generalProducts,
    data.fabrics,
    data.accessories,
  ];
  if(Array.isArray(extraSources)){
    for(const s of extraSources) sources.push(s);
  }
  for(const arr of sources){
    if(!Array.isArray(arr)) continue;
    for(const e of arr){
      if(e && Array.isArray(e.tags) && e.tags.includes(tagId)) count++;
    }
  }
  return count;
}

/* Bulk count across all registry tags. Single-pass O(N×E) where E is
   the count of taggable entities. Used by the Settings → Tags page
   to show usage column without per-row queries. */
export function getAllTagsUsageCounts(registry, data, extraSources){
  const result = {};
  if(!Array.isArray(registry) || registry.length === 0) return result;
  for(const t of registry){
    if(t && t.id) result[t.id] = 0;
  }
  const sources = [
    data && data.customers,
    data && data.suppliers,
    data && data.generalProducts,
    data && data.fabrics,
    data && data.accessories,
  ];
  if(Array.isArray(extraSources)){
    for(const s of extraSources) sources.push(s);
  }
  for(const arr of sources){
    if(!Array.isArray(arr)) continue;
    for(const e of arr){
      if(!e || !Array.isArray(e.tags)) continue;
      for(const tid of e.tags){
        if(result[tid] !== undefined) result[tid]++;
      }
    }
  }
  return result;
}

/* ── Merge ── */

/* Merge tags: rewrite all loser-ID references to winner-ID across
   the standard entity arrays, then archive the losers (with
   mergedInto pointer for audit). Returns a patch object the caller
   applies via upConfig.

   IMPORTANT: this function is PURE and returns NEW arrays. It does
   not mutate data in-place. The caller decides whether to commit. */
export function mergeTags(winnerId, losersIds, registry, data){
  const noop = { registry, patch: {}, changedFields: [] };
  if(!winnerId || !Array.isArray(losersIds) || losersIds.length === 0) return noop;

  const loserSet = new Set(losersIds);
  loserSet.delete(winnerId);
  if(loserSet.size === 0) return noop;

  const patch = {};
  const changedFields = [];

  const remap = (arr) => {
    if(!Array.isArray(arr)) return { changed: false, value: arr };
    let any = false;
    const next = arr.map(e => {
      if(!e || !Array.isArray(e.tags) || e.tags.length === 0) return e;
      let touched = false;
      const seen = new Set();
      const out = [];
      for(const tid of e.tags){
        const final = loserSet.has(tid) ? winnerId : tid;
        if(final !== tid) touched = true;
        if(!seen.has(final)){
          seen.add(final);
          out.push(final);
        }
      }
      if(touched){
        any = true;
        return { ...e, tags: out };
      }
      return e;
    });
    return { changed: any, value: next };
  };

  const fields = ["customers", "suppliers", "generalProducts", "fabrics", "accessories"];
  for(const f of fields){
    const r = remap(data && data[f]);
    if(r.changed){
      patch[f] = r.value;
      changedFields.push(f);
    }
  }

  const newRegistry = (registry || []).map(t =>
    loserSet.has(t.id)
      ? { ...t, archived: true, archivedAt: Date.now(), mergedInto: winnerId }
      : t
  );

  return { registry: newRegistry, patch, changedFields };
}
