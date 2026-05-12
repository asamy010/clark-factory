/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Universal Tags Utility (V21.11.2 — Feature #10 Slice 1)
   ───────────────────────────────────────────────────────────────────────
   First-class tag objects with stable IDs, colors, icons, and entity-type
   scoping. Slice 1 ships the registry + utility + management UI. Future
   slices wire tags into the entity pages (customers, suppliers, items,
   orders, invoices, treasury entries, checks).

   --- Schema ---
   data.tagRegistry = [{
     id: "tag_vip",                          stable gid
     name: "VIP",                             display name
     nameLC: "vip",                          lowercase for matching
     color: "#F59E0B",                       hex
     icon: "⭐",                              optional emoji
     description: "عميل مميز يستحق معاملة خاصة",
     appliesTo: ["customer","supplier"],     entity types
     createdBy, createdAt, lastUsedAt?,
     usageCount: 0,                           cached/recomputed
     archived: false,
     archivedAt?, archivedBy?,
   }]

   --- Entity tags (Slice 2+) ---
   entity.tags = ["tag_vip", "tag_priority"]  // IDs, not names

   --- Preset color palette ---
   10 colors matching the CLARK theme. Free hex allowed too — picker UI
   uses preset for consistency.
   ═══════════════════════════════════════════════════════════════════════ */

export const TAG_PRESET_COLORS = [
  "#0EA5E9","#10B981","#F59E0B","#EF4444","#8B5CF6",
  "#EC4899","#06B6D4","#84CC16","#F97316","#64748B",
];

export const TAG_PRESET_ICONS = [
  "⭐","🏷️","🔥","💎","⚡","🎯","🚀","💰","🏆","📌",
  "👑","🎁","💼","🛒","📍","✅","⚠️","🌟","💯","🔑",
];

export const TAG_ENTITY_TYPES = [
  { key: "customer",       label: "عملاء",         icon: "👤" },
  { key: "supplier",       label: "موردين",         icon: "🏭" },
  { key: "item",           label: "أصناف عامة",     icon: "📦" },
  { key: "order",          label: "موديلات",        icon: "👕" },
  { key: "workshop",       label: "ورش",            icon: "🏗️" },
  { key: "employee",       label: "موظفين",         icon: "🧑‍💼" },
  { key: "salesInvoice",   label: "فواتير مبيعات",  icon: "📤" },
  { key: "purchaseInvoice",label: "فواتير مشتريات", icon: "📥" },
  { key: "treasury",       label: "حركات خزنة",    icon: "💵" },
  { key: "check",          label: "شيكات",         icon: "📝" },
];

/* Normalize tag name for matching (case-insensitive, trimmed). */
export function normalizeTagName(name){
  return String(name || "").trim().toLowerCase();
}

/* Create a new tag — pass into upConfig mutator.
   Throws if a non-archived tag with the same nameLC already exists. */
export function createTagMutator(d, args){
  const { name, color, icon, description, appliesTo, userName } = args;
  const cleanName = String(name || "").trim();
  if(!cleanName) throw new Error("اسم الـ tag مطلوب");
  if(!color) throw new Error("اختر لون");
  if(!Array.isArray(appliesTo) || appliesTo.length === 0){
    throw new Error("اختر نوع entity واحد على الأقل");
  }
  const nameLC = normalizeTagName(cleanName);
  if(!Array.isArray(d.tagRegistry)) d.tagRegistry = [];
  const dup = d.tagRegistry.find(t => !t.archived && t.nameLC === nameLC);
  if(dup) throw new Error(`فيه tag بنفس الاسم "${dup.name}" بالفعل`);

  const tag = {
    id: "tag_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,7),
    name: cleanName,
    nameLC,
    color,
    icon: icon || "",
    description: description || "",
    appliesTo: [...appliesTo],
    createdBy: userName || "",
    createdAt: new Date().toISOString(),
    usageCount: 0,
    archived: false,
  };
  d.tagRegistry.push(tag);
  return tag;
}

/* Update an existing tag — name, color, icon, description, appliesTo. */
export function updateTagMutator(d, tagId, updates, userName){
  if(!Array.isArray(d.tagRegistry)) return;
  const t = d.tagRegistry.find(x => x.id === tagId);
  if(!t) throw new Error("الـ tag مش موجود");

  if(updates.name !== undefined){
    const cleanName = String(updates.name).trim();
    if(!cleanName) throw new Error("اسم الـ tag مطلوب");
    const newLC = normalizeTagName(cleanName);
    /* Refuse if another tag has this nameLC */
    const dup = d.tagRegistry.find(x => !x.archived && x.nameLC === newLC && x.id !== tagId);
    if(dup) throw new Error(`فيه tag بنفس الاسم "${dup.name}" بالفعل`);
    t.name = cleanName;
    t.nameLC = newLC;
  }
  if(updates.color !== undefined) t.color = updates.color;
  if(updates.icon !== undefined) t.icon = updates.icon;
  if(updates.description !== undefined) t.description = updates.description;
  if(Array.isArray(updates.appliesTo)) t.appliesTo = [...updates.appliesTo];
  t.lastEditedAt = new Date().toISOString();
  t.lastEditedBy = userName || "";
  return t;
}

/* Soft-archive a tag — keeps existing entity references valid but hides
   it from the picker. Use this instead of delete when usageCount > 0. */
export function archiveTagMutator(d, tagId, userName){
  if(!Array.isArray(d.tagRegistry)) return;
  const t = d.tagRegistry.find(x => x.id === tagId);
  if(!t) throw new Error("الـ tag مش موجود");
  t.archived = true;
  t.archivedAt = new Date().toISOString();
  t.archivedBy = userName || "";
}

export function restoreTagMutator(d, tagId){
  if(!Array.isArray(d.tagRegistry)) return;
  const t = d.tagRegistry.find(x => x.id === tagId);
  if(!t) throw new Error("الـ tag مش موجود");
  t.archived = false;
  t.archivedAt = null;
  t.archivedBy = null;
}

/* Hard-delete only safe when nothing references it. Caller MUST first
   verify usageCount === 0. */
export function deleteTagMutator(d, tagId){
  if(!Array.isArray(d.tagRegistry)) return;
  d.tagRegistry = d.tagRegistry.filter(x => x.id !== tagId);
}

/* Compute usage count by scanning all known entity arrays. O(N×K) where
   N=total entities, K=tag ID. Use Set-based lookup for K perf. */
export function getTagUsageCount(tagId, data){
  let count = 0;
  const entityArrays = [
    data.customers, data.suppliers, data.inventoryItems,
    data.orders, data.workshops, data.employees,
    data.salesInvoices, data.purchaseInvoices,
    data.treasury, data.checks,
  ];
  entityArrays.forEach(arr => {
    if(Array.isArray(arr)){
      arr.forEach(e => {
        if(Array.isArray(e.tags) && e.tags.includes(tagId)) count++;
      });
    }
  });
  return count;
}

/* Filter entities by tag IDs. Mode: "OR" (any match) | "AND" (all match).
   Set-based for O(N) perf. */
export function filterByTags(entities, tagIds, mode = "OR"){
  if(!tagIds || tagIds.length === 0) return entities;
  const tagSet = new Set(tagIds);
  return entities.filter(e => {
    const eTags = e.tags || [];
    if(eTags.length === 0) return false;
    if(mode === "AND"){
      for(const t of tagIds) if(!eTags.includes(t)) return false;
      return true;
    }
    for(const t of eTags) if(tagSet.has(t)) return true;
    return false;
  });
}

/* Resolve tag IDs → tag objects (excluding archived by default). */
export function resolveTagsForDisplay(tagIds, tagRegistry, includeArchived = false){
  if(!tagIds || !Array.isArray(tagIds)) return [];
  if(!Array.isArray(tagRegistry)) return [];
  return tagIds
    .map(id => tagRegistry.find(t => t.id === id))
    .filter(t => t && (includeArchived || !t.archived));
}

/* Get tags applicable to a specific entity type. */
export function getTagsForEntityType(tagRegistry, entityType, includeArchived = false){
  if(!Array.isArray(tagRegistry)) return [];
  return tagRegistry.filter(t =>
    (includeArchived || !t.archived) &&
    Array.isArray(t.appliesTo) && t.appliesTo.includes(entityType)
  );
}

/* Migrate string tags to ID-based on a single entity. Used by integration
   slices: looks up nameLC in registry, creates missing tags, replaces
   entity.tags with the ID array. Idempotent: if all entries are already IDs
   (start with "tag_"), no-op. */
export function migrateEntityTagsStringsToIds(d, entity, entityType, userName){
  if(!entity || !Array.isArray(entity.tags)) return;
  if(entity.tags.every(t => typeof t === "string" && t.startsWith("tag_"))) return;
  if(!Array.isArray(d.tagRegistry)) d.tagRegistry = [];
  const newTags = [];
  for(const t of entity.tags){
    if(typeof t !== "string") continue;
    if(t.startsWith("tag_")){ newTags.push(t); continue; }
    const cleanName = t.trim();
    if(!cleanName) continue;
    const nameLC = normalizeTagName(cleanName);
    let tag = d.tagRegistry.find(x => x.nameLC === nameLC);
    if(!tag){
      tag = {
        id: "tag_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,7),
        name: cleanName,
        nameLC,
        color: TAG_PRESET_COLORS[d.tagRegistry.length % TAG_PRESET_COLORS.length],
        icon: "",
        description: "تـ migrate من Shopify/legacy tags",
        appliesTo: [entityType],
        createdBy: userName || "system-migration",
        createdAt: new Date().toISOString(),
        usageCount: 0,
        archived: false,
      };
      d.tagRegistry.push(tag);
    } else if(!tag.appliesTo.includes(entityType)){
      tag.appliesTo.push(entityType);
    }
    if(!newTags.includes(tag.id)) newTags.push(tag.id);
  }
  entity.tags = newTags;
}
