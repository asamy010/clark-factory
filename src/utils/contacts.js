/* ═══════════════════════════════════════════════════════════════
   CLARK V21.9.115 — Contacts Registry (Phase 1 — read-only view + create)
   ───────────────────────────────────────────────────────────────
   Unified contact directory. A single contact can carry multiple
   classifications (customer + supplier + workshop + employee), so
   the same physical party shows up in each list naturally.

   Architecture:
   - `data.contacts[]` is a thin REGISTRY (id, name, phone, types,
     linkedIds, tags, notes). It is NOT the source of truth for
     entity-specific data — that still lives in `data.customers`,
     `data.suppliers`, `data.workshops`, `data.employees`.
   - When a contact is created with `types=["customer","supplier"]`,
     we ALSO create an entry in each of the matching legacy tables,
     stamped with `contactId` back-reference. This keeps every
     existing screen (CustDeliverPg, PurchasePg, …) working with
     zero refactor — they just see a regular customer/supplier row
     that happens to know which contact it belongs to.
   - Existing customers/suppliers/workshops/employees that pre-date
     the registry surface as "unlinked" rows in the contacts page
     (linkedFrom = … , contactId = null). Admin can opt-in link
     them later (slice 3 — deferred).

   All functions in this file are PURE. The caller wires them
   through the standard upConfig() flow.
   ═══════════════════════════════════════════════════════════════ */

import { normalizePhone } from "./format.js";

/* ── Type taxonomy ─────────────────────────────────────────────
   4 main types per the §0.1 design decision (see CLAUDE.md when
   updated). "Workshop" carries a subType because CLARK already
   models 6 workshop kinds via WS_TYPES in constants/index.js. */
export const CONTACT_TYPES = [
  { key: "customer",  label: "عميل",       icon: "👥", color: "#0EA5E9" },
  { key: "supplier",  label: "مورد",       icon: "🏭", color: "#F59E0B" },
  { key: "workshop",  label: "ورشة",       icon: "🛠️", color: "#8B5CF6" },
  { key: "employee",  label: "موظف",       icon: "🧑‍💼", color: "#10B981" },
];

export const CONTACT_TYPE_KEYS = CONTACT_TYPES.map(t => t.key);

/* Workshop subtypes mirror WS_TYPES in constants. We don't import
   the constant directly to keep this module dependency-light;
   callers pass `data.workshops[0]?.type` choices via the form. */

/* Generate a stable contact ID. */
export function generateContactId(){
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 7);
  return "ct_" + ts + "_" + rnd;
}

/* Sanitize types — drop anything that isn't in the known taxonomy
   and ensure at least one type. Defensive against direct config edits. */
export function sanitizeContactTypes(types){
  if(!Array.isArray(types)) return [];
  return Array.from(new Set(types.filter(t => CONTACT_TYPE_KEYS.includes(t))));
}

/* ── Lookups ─────────────────────────────────────────────────── */

export function findContactById(id, contacts){
  if(!id || !Array.isArray(contacts)) return null;
  return contacts.find(c => c && c.id === id) || null;
}

/* Find contact by phone (canonical form). Used for dedup on create. */
export function findContactByPhone(phone, contacts){
  if(!phone || !Array.isArray(contacts)) return null;
  const canon = normalizePhone(String(phone).trim());
  if(!canon) return null;
  return contacts.find(c => c && normalizePhone(c.phone || "") === canon) || null;
}

/* ── Merged view ─────────────────────────────────────────────────
   Build a single list combining:
   - Standalone contacts from data.contacts (already typed)
   - Existing customers/suppliers/workshops/employees that aren't
     yet linked to any contact (contactId missing).

   The unified shape is:
   {
     id,            // contact id OR synthetic "<source>_<entityId>"
     name, phone,
     types: [...],
     workshopSubType?: string,
     linkedFrom: "contact" | "customer" | "supplier" | "workshop" | "employee",
     contactId?: string,  // when linked
     entityIds: { customer?, supplier?, workshop?, employee? },
     tags: [...]
   } */
export function buildMergedContacts(data){
  const out = [];
  const linkedAsContact = new Set();

  /* 1. Real contacts (already in registry) */
  for(const c of (data && data.contacts) || []){
    if(!c || !c.id) continue;
    out.push({
      id: c.id,
      name: c.name || "",
      phone: c.phone || "",
      types: sanitizeContactTypes(c.types),
      workshopSubType: c.workshopSubType || "",
      linkedFrom: "contact",
      contactId: c.id,
      entityIds: { ...(c.linkedIds || {}) },
      tags: Array.isArray(c.tags) ? c.tags : [],
      notes: c.notes || "",
    });
    /* Track which entity IDs are already covered by a contact, so
       we don't double-render them as standalone rows below. */
    const ids = c.linkedIds || {};
    if(ids.customer) linkedAsContact.add("customer:" + ids.customer);
    if(ids.supplier) linkedAsContact.add("supplier:" + ids.supplier);
    if(ids.workshop) linkedAsContact.add("workshop:" + ids.workshop);
    if(ids.employee) linkedAsContact.add("employee:" + ids.employee);
  }

  /* 2. Standalone existing entities (not yet linked). */
  const addEntity = (sourceKey, entity, extraFields) => {
    if(!entity || !entity.id) return;
    if(linkedAsContact.has(sourceKey + ":" + entity.id)) return;
    out.push({
      id: sourceKey + "_" + entity.id,  /* synthetic ID — distinguishable */
      name: entity.name || "",
      phone: entity.phone || "",
      types: [sourceKey],
      workshopSubType: (sourceKey === "workshop" ? (entity.type || "") : ""),
      linkedFrom: sourceKey,
      contactId: null,
      entityIds: { [sourceKey]: entity.id },
      tags: Array.isArray(entity.tags) ? entity.tags : [],
      notes: entity.notes || "",
      ...(extraFields || {}),
    });
  };

  for(const c of (data && data.customers) || []) addEntity("customer", c);
  for(const s of (data && data.suppliers) || []) addEntity("supplier", s);
  for(const w of (data && data.workshops) || []) addEntity("workshop", w);
  for(const e of (data && data.employees) || []) addEntity("employee", e);

  return out;
}

/* ── Create ─────────────────────────────────────────────────────
   PURE function: returns a `patch` object the caller applies via
   upConfig. The patch contains:
     contacts:    new array with the new contact appended
     customers?:  new array if "customer" type selected
     suppliers?:  new array if "supplier" type selected
     workshops?:  new array if "workshop" type selected
     employees?:  new array if "employee" type selected
*/
export function createContact(form, data, user){
  const trimmedName = String(form.name || "").trim();
  if(!trimmedName) throw new Error("CONTACT_NAME_EMPTY");

  const types = sanitizeContactTypes(form.types);
  if(types.length === 0) throw new Error("CONTACT_TYPES_EMPTY");

  const phoneCanon = normalizePhone(String(form.phone || "").trim());
  const workshopSubType = types.includes("workshop") ? (form.workshopSubType || "") : "";
  if(types.includes("workshop") && !workshopSubType){
    throw new Error("CONTACT_WORKSHOP_SUBTYPE_REQUIRED");
  }

  const tagsClean = Array.isArray(form.tags) ? form.tags.filter(Boolean) : [];
  const notesClean = String(form.notes || "").trim();
  const uid = (user && (user.uid || user.email)) || "";
  const now = Date.now();

  const contactId = generateContactId();
  const linkedIds = { customer: null, supplier: null, workshop: null, employee: null };
  const patch = {};

  /* Helper: append entity with contactId back-ref + clone existing array. */
  const appendEntity = (collectionKey, makeEntity) => {
    const existing = Array.isArray(data && data[collectionKey]) ? data[collectionKey] : [];
    const entity = makeEntity();
    linkedIds[collectionKey.replace(/s$/, "")] = entity.id;
    patch[collectionKey] = [...existing, entity];
  };

  if(types.includes("customer")){
    appendEntity("customers", () => ({
      id: "cust_" + now.toString(36) + "_" + Math.random().toString(36).slice(2, 6),
      name: trimmedName,
      phone: phoneCanon,
      address: "",
      type: "مكتب",
      discount: 0,
      archived: false,
      tags: tagsClean.slice(),
      contactId,
      createdAt: new Date(now).toISOString(),
      createdBy: uid,
    }));
  }

  if(types.includes("supplier")){
    appendEntity("suppliers", () => ({
      id: "sup_" + now.toString(36) + "_" + Math.random().toString(36).slice(2, 6),
      name: trimmedName,
      phone: phoneCanon,
      address: "",
      notes: notesClean,
      tags: tagsClean.slice(),
      contactId,
      createdAt: new Date(now).toISOString(),
      createdBy: uid,
    }));
  }

  if(types.includes("workshop")){
    appendEntity("workshops", () => ({
      id: Math.floor(now / 1000) * 100 + Math.floor(Math.random() * 100),  /* numeric ID per WORKSHOP convention */
      name: trimmedName,
      owner: "",
      phone: phoneCanon,
      address: "",
      idCard: "",
      ownerPhoto: "",
      rating: 7,
      type: workshopSubType,
      tags: tagsClean.slice(),
      contactId,
    }));
  }

  if(types.includes("employee")){
    appendEntity("employees", () => ({
      id: "emp_" + now.toString(36) + "_" + Math.random().toString(36).slice(2, 6),
      name: trimmedName,
      phone: phoneCanon,
      role: "",
      basicSalary: 0,
      hireDate: new Date(now).toISOString().split("T")[0],
      active: true,
      tags: tagsClean.slice(),
      contactId,
      createdAt: new Date(now).toISOString(),
      createdBy: uid,
    }));
    /* Note: HR-specific fields (basicSalary, hireDate, etc.) start as
       safe defaults. Admin fills the rest from the HR page. */
  }

  /* 2. The contact record itself */
  const newContact = {
    id: contactId,
    name: trimmedName,
    phone: phoneCanon,
    types,
    workshopSubType,
    linkedIds,
    tags: tagsClean.slice(),
    notes: notesClean,
    createdAt: now,
    createdBy: uid,
  };
  patch.contacts = [...(Array.isArray(data && data.contacts) ? data.contacts : []), newContact];

  return { patch, contact: newContact };
}

/* Friendly Arabic label for a single type key, suitable for chips. */
export function labelForType(typeKey){
  const t = CONTACT_TYPES.find(x => x.key === typeKey);
  return t ? t.label : typeKey;
}

/* ── Link existing entities (V21.9.118, Phase 3) ──────────────────
   Promote an existing customer/supplier/workshop/employee into the
   contacts registry, optionally combining with other existing entities
   (e.g., same person already exists as both customer + supplier).

   The "source" is the entity the admin clicked from the page. Additional
   links can either point to existing entities (the dropdown choice) or
   trigger creation of a new entity with the same name/phone/tags.

   IMPORTANT: any entity already linked to a contact CANNOT be re-linked
   here — would create a duplicate. The caller checks via `findContactsLinkedToEntity`.
*/
export function linkExistingContact(seed, data, user){
  const { sourceLinkedFrom, sourceEntityId, additionalLinks } = seed || {};
  if(!sourceLinkedFrom || !sourceEntityId) throw new Error("CONTACT_LINK_SOURCE_REQUIRED");
  if(!["customer","supplier","workshop","employee"].includes(sourceLinkedFrom)){
    throw new Error("CONTACT_LINK_BAD_SOURCE_TYPE");
  }
  /* `additionalLinks` is an array of { type, action: "use"|"create", entityId?, workshopSubType? } */
  const extras = Array.isArray(additionalLinks) ? additionalLinks : [];

  /* 1. Find the source entity, get name/phone/tags */
  const sourceCollection = (sourceLinkedFrom === "customer" ? "customers" :
                             sourceLinkedFrom === "supplier" ? "suppliers" :
                             sourceLinkedFrom === "workshop" ? "workshops" : "employees");
  const sourceArr = Array.isArray(data && data[sourceCollection]) ? data[sourceCollection] : [];
  const sourceEntity = sourceArr.find(e => String(e.id) === String(sourceEntityId));
  if(!sourceEntity) throw new Error("CONTACT_LINK_SOURCE_NOT_FOUND");

  /* Guard: source entity must not already be linked to a contact. */
  if(sourceEntity.contactId){
    throw new Error("CONTACT_LINK_SOURCE_ALREADY_LINKED:" + sourceEntity.contactId);
  }

  const name = String(sourceEntity.name || "").trim();
  if(!name) throw new Error("CONTACT_NAME_EMPTY");
  const phone = normalizePhone(String(sourceEntity.phone || "").trim());
  const tags = Array.isArray(sourceEntity.tags) ? sourceEntity.tags.slice() : [];
  const uid = (user && (user.uid || user.email)) || "";
  const now = Date.now();

  const contactId = generateContactId();
  const linkedIds = { customer: null, supplier: null, workshop: null, employee: null };
  linkedIds[sourceLinkedFrom] = sourceEntity.id;

  const types = new Set([sourceLinkedFrom]);
  let workshopSubType = "";
  if(sourceLinkedFrom === "workshop") workshopSubType = sourceEntity.type || "";

  const patch = {};

  /* Helper: clone an array if not yet cloned in patch, return the working ref. */
  const workingArr = (collectionKey) => {
    if(patch[collectionKey]) return patch[collectionKey];
    const existing = Array.isArray(data && data[collectionKey]) ? data[collectionKey] : [];
    patch[collectionKey] = existing.slice();
    return patch[collectionKey];
  };

  /* 2. Stamp `contactId` on the source entity */
  const srcWorking = workingArr(sourceCollection);
  const srcIdx = srcWorking.findIndex(e => String(e.id) === String(sourceEntity.id));
  if(srcIdx >= 0){
    srcWorking[srcIdx] = { ...srcWorking[srcIdx], contactId };
  }

  /* 3. Process each additional link */
  for(const link of extras){
    const t = link && link.type;
    if(!t || !["customer","supplier","workshop","employee"].includes(t)) continue;
    if(t === sourceLinkedFrom) continue;  /* defensive — source already handled */
    if(types.has(t)) continue;            /* dedup */
    types.add(t);

    const collectionKey = (t === "customer" ? "customers" :
                           t === "supplier" ? "suppliers" :
                           t === "workshop" ? "workshops" : "employees");
    const arr = workingArr(collectionKey);

    if(link.action === "use"){
      const found = arr.find(e => String(e.id) === String(link.entityId));
      if(!found) throw new Error("CONTACT_LINK_TARGET_NOT_FOUND:" + t);
      if(found.contactId) throw new Error("CONTACT_LINK_TARGET_ALREADY_LINKED:" + t + ":" + found.contactId);
      /* Stamp contactId — propagate name/phone/tags to keep parity */
      const idx = arr.findIndex(e => String(e.id) === String(link.entityId));
      arr[idx] = { ...arr[idx], contactId, name, phone, tags: tags.slice() };
      linkedIds[t] = found.id;
      if(t === "workshop") workshopSubType = found.type || workshopSubType;
    } else if(link.action === "create"){
      /* Create a fresh entity with source's name/phone/tags */
      let newEntity;
      if(t === "customer"){
        newEntity = {
          id: "cust_" + now.toString(36) + "_" + Math.random().toString(36).slice(2, 6),
          name, phone, address: "", type: "مكتب", discount: 0, archived: false,
          tags: tags.slice(), contactId,
          createdAt: new Date(now).toISOString(), createdBy: uid,
        };
      } else if(t === "supplier"){
        newEntity = {
          id: "sup_" + now.toString(36) + "_" + Math.random().toString(36).slice(2, 6),
          name, phone, address: "", notes: "",
          tags: tags.slice(), contactId,
          createdAt: new Date(now).toISOString(), createdBy: uid,
        };
      } else if(t === "workshop"){
        const subType = link.workshopSubType || "";
        if(!subType) throw new Error("CONTACT_LINK_WORKSHOP_SUBTYPE_REQUIRED");
        workshopSubType = subType;
        newEntity = {
          id: Math.floor(now / 1000) * 100 + Math.floor(Math.random() * 100),
          name, owner: "", phone, address: "", idCard: "", ownerPhoto: "",
          rating: 7, type: subType,
          tags: tags.slice(), contactId,
        };
      } else { /* employee */
        newEntity = {
          id: "emp_" + now.toString(36) + "_" + Math.random().toString(36).slice(2, 6),
          name, phone, role: "", basicSalary: 0,
          hireDate: new Date(now).toISOString().split("T")[0], active: true,
          tags: tags.slice(), contactId,
          createdAt: new Date(now).toISOString(), createdBy: uid,
        };
      }
      arr.push(newEntity);
      linkedIds[t] = newEntity.id;
    }
  }

  /* 4. Create contact registry record */
  const newContact = {
    id: contactId,
    name, phone,
    types: Array.from(types),
    workshopSubType,
    linkedIds,
    tags,
    notes: "",
    createdAt: now,
    createdBy: uid,
    linkedFromExisting: true,  /* audit marker: this contact wasn't created from scratch */
  };
  patch.contacts = [...(Array.isArray(data && data.contacts) ? data.contacts : []), newContact];

  return { patch, contact: newContact };
}

/* Find unlinked entities of a given type (for the link-existing dropdown).
   Returns entities WITHOUT contactId, sorted by name. */
export function getUnlinkedEntities(typeKey, data){
  const collectionKey = (typeKey === "customer" ? "customers" :
                         typeKey === "supplier" ? "suppliers" :
                         typeKey === "workshop" ? "workshops" : "employees");
  const arr = Array.isArray(data && data[collectionKey]) ? data[collectionKey] : [];
  return arr
    .filter(e => e && e.id && !e.contactId)
    .slice()
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ar"));
}

/* ── Update / propagate (V21.9.116, Phase 2 — edit flow) ────────
   PURE function: produce a patch the caller applies via upConfig.
   Updates the contact registry record AND propagates name/phone/tags
   to every linked entity (customer, supplier, workshop, employee).

   Type changes are NOT handled here — that requires creating/deleting
   linked entities and is deferred to a future phase.
*/
export function updateContact(contactId, updates, data){
  if(!contactId) throw new Error("CONTACT_ID_REQUIRED");
  const contacts = Array.isArray(data && data.contacts) ? data.contacts : [];
  const existing = contacts.find(c => c && c.id === contactId);
  if(!existing) throw new Error("CONTACT_NOT_FOUND");

  const newName = updates.name !== undefined ? String(updates.name).trim() : existing.name;
  if(!newName) throw new Error("CONTACT_NAME_EMPTY");
  const newPhone = updates.phone !== undefined ? normalizePhone(String(updates.phone).trim()) : existing.phone;
  const newTags = Array.isArray(updates.tags) ? updates.tags.filter(Boolean) : existing.tags;
  const newNotes = updates.notes !== undefined ? String(updates.notes).trim() : (existing.notes || "");

  /* 1. Updated contact registry entry */
  const nextContacts = contacts.map(c =>
    c.id === contactId
      ? { ...c, name: newName, phone: newPhone, tags: newTags, notes: newNotes, updatedAt: Date.now() }
      : c
  );

  const patch = { contacts: nextContacts };

  /* 2. Propagate shared fields (name, phone, tags) to linked entities.
     Notes live ONLY on the contact registry — don't overwrite entity notes
     because each entity (e.g., supplier) may have its own context-specific notes. */
  const linkedIds = existing.linkedIds || {};

  const mapList = (arr, idField, linkedId) => {
    if(!Array.isArray(arr) || !linkedId) return null;
    let touched = false;
    const out = arr.map(e => {
      if(!e || String(e[idField]) !== String(linkedId)) return e;
      touched = true;
      return { ...e, name: newName, phone: newPhone, tags: newTags.slice() };
    });
    return touched ? out : null;
  };

  const custOut = mapList(data && data.customers, "id", linkedIds.customer);
  if(custOut) patch.customers = custOut;
  const supOut  = mapList(data && data.suppliers, "id", linkedIds.supplier);
  if(supOut)  patch.suppliers = supOut;
  const wsOut   = mapList(data && data.workshops, "id", linkedIds.workshop);
  if(wsOut)   patch.workshops = wsOut;
  const empOut  = mapList(data && data.employees, "id", linkedIds.employee);
  if(empOut)  patch.employees = empOut;

  return { patch, contact: nextContacts.find(c => c.id === contactId) };
}
