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

import { normalizePhone, r2 } from "./format.js";
import { getDeleteBlocker } from "./dataIntegrity.js";
import { buildCustomerSummary, buildSupplierSummary } from "./accountSummary.js";

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
    /* V21.9.131: customer type honors form.customerType (مكتب/محل/أونلاين/أخرى).
       Falls back to "مكتب" for backward compatibility (pre-V21.9.131 callers). */
    const custType = (form && typeof form.customerType === "string" && form.customerType.trim())
                       ? form.customerType.trim()
                       : "مكتب";
    appendEntity("customers", () => ({
      id: "cust_" + now.toString(36) + "_" + Math.random().toString(36).slice(2, 6),
      name: trimmedName,
      phone: phoneCanon,
      address: "",
      type: custType,
      /* V21.9.189: new customers default to 10% discount (was 0). Existing
         customers are not touched. Admin can override per-customer in the
         customer edit form. Phase 2 will add per-delivery-row override. */
      discount: 10,
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
          /* V21.9.189: default discount 10% (was 0) */
          name, phone, address: "", type: "مكتب", discount: 10, archived: false,
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

/* ── Cross-account settlement (V21.9.119, Phase 4) ────────────────
   For a contact that is both customer AND supplier, "مقاصة" creates
   2 payment entries that net the two balances against each other —
   no real cash movement, but the audit trail records the offset.

   The pattern:
     - custPayment with method="مقاصة" → reduces customer.balance
     - supplierPayment with method="مقاصة" → reduces supplier.balance
     - both share a `settlementId` for paired audit + future reversal
     - linked back to the `contactId` for traceability

   Pre-condition: the caller must ensure amount > 0 AND
   amount <= min(customer.balance, supplier.balance). The helper
   doesn't recompute balances (cheap pure function). */
export function settleContactCrossAccount(seed, data, user){
  const { contactId, amount, date, notes } = seed || {};
  if(!contactId) throw new Error("CONTACT_ID_REQUIRED");

  const contact = (Array.isArray(data && data.contacts) ? data.contacts : []).find(c => c && c.id === contactId);
  if(!contact) throw new Error("CONTACT_NOT_FOUND");

  const linkedIds = contact.linkedIds || {};
  const custId = linkedIds.customer;
  const supId = linkedIds.supplier;
  if(!custId || !supId) throw new Error("CONTACT_NOT_DUAL");

  const cleanAmount = Math.round((Number(amount) || 0) * 100) / 100;
  if(cleanAmount <= 0) throw new Error("SETTLE_AMOUNT_INVALID");

  /* Look up name fields for the payment "name" snapshots — matches
     the pattern in CustDeliverPg/TreasuryPg which freezes the name on
     the payment record so it survives if the entity is later renamed. */
  const cust = (data.customers || []).find(c => String(c.id) === String(custId));
  const sup  = (data.suppliers || []).find(s => String(s.id) === String(supId));
  const custName = (cust && cust.name) || contact.name;
  const supName  = (sup  && sup.name)  || contact.name;

  const cleanDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().split("T")[0];
  const cleanNotes = String(notes || "").trim() || ("مقاصة بين العميل والمورد — جهة موحّدة: " + contact.name);
  const uid = (user && (user.uid || user.email)) || "";
  const now = Date.now();
  const settlementId = "settle_" + now.toString(36) + "_" + Math.random().toString(36).slice(2, 7);
  const nowISO = new Date(now).toISOString();

  const custPayment = {
    id: "cp_" + now.toString(36) + "_" + Math.random().toString(36).slice(2, 5),
    custId,
    custName,
    amount: cleanAmount,
    date: cleanDate,
    note: cleanNotes,
    method: "مقاصة",
    by: uid,
    createdAt: nowISO,
    /* Audit links — bidirectional so a future "reverse settlement" can find both legs */
    settlementId,
    contactId: contact.id,
    settledAgainstSupplierId: supId,
  };

  const supPayment = {
    id: "sp_" + now.toString(36) + "_" + Math.random().toString(36).slice(2, 5),
    supplierId: supId,
    supplierName: supName,
    amount: cleanAmount,
    date: cleanDate,
    note: cleanNotes,
    method: "مقاصة",
    by: uid,
    createdAt: nowISO,
    settlementId,
    contactId: contact.id,
    settledAgainstCustomerId: custId,
  };

  const patch = {
    custPayments: [...(Array.isArray(data && data.custPayments) ? data.custPayments : []), custPayment],
    supplierPayments: [...(Array.isArray(data && data.supplierPayments) ? data.supplierPayments : []), supPayment],
  };

  return { patch, settlementId, custPayment, supPayment };
}

/* ── Generalized account transfer «تحميل حساب» (V21.22.20) ──────────
   نقل رصيد طرف (الطرف الأول/المصدر) بالكامل أو جزئياً إلى طرف آخر
   (الطرف التاني/الوجهة) — والطرفان أي مزيج من عميل/مورد (مش لازم نفس
   الجهة زي مقاصة).

   الحالة الأساسية اللي طلبها Ahmed: مورد بيسدّد حسابات عملاء من رصيده —
   فبيقلّ رصيد العميل (المدين) ورصيد المورد (الدائن عليّ) في نفس الوقت.
   نفس آلية «مقاصة» بالظبط (دفعتان مقابلتان، مفيش حركة خزنة) لكن لطرفين
   مختلفين.

   ── نموذج الإشارة الموحّد ──
   نعرّف «المستحَق لنا» (owedToUs) لكل طرف:
     • عميل:  owedToUs = +balance  (رصيد موجب = العميل مدين لنا).
     • مورد:  owedToUs = −balance  (رصيد المورد الموجب = نحن مدينون له).

   التحويل ينقل مقدار موجّب من «المستحَق لنا» من المصدر للوجهة مع الحفاظ
   على الإشارة — فيصفّر المصدر ويزود/يقلّل الوجهة حسب طبيعة المصدر:
     • المصدر:  deltaOwed = −X   (يقرّب رصيده للصفر)
     • الوجهة:  deltaOwed = +X   (يمتص نفس الالتزام الموجّه)

   تحويل deltaOwed لمبلغ دفعة في كل طرف (الدفعة الموجبة بـتـقلّل الرصيد):
     • عميل:  custPayment.amount  = −deltaOwed   (تقلّل الرصيد بالموجب)
     • مورد:  supplierPayment.amount = +deltaOwed (تقلّل المستحق للمورد)

   النتيجة لكل الحالات الأربع (عميل↔مورد بأي اتجاه + عميل↔عميل + مورد↔مورد):
     مصدر عميل  → custPayment.amount     = +X   (يصفّره)
     مصدر مورد  → supplierPayment.amount = −X   (يصفّره؛ X سالب فالمبلغ موجب)
     وجهة عميل  → custPayment.amount     = −X
     وجهة مورد  → supplierPayment.amount = +X
   X = sign(srcOwed) × المقدار الموجب المختار. الطرف المماثل النوع للمصدر
   بيـ get مبلغ سالب (دفعة عكسية) للحفاظ على الإشارة — صحيح حسابياً في كل
   الملخّصات/الكشوف (كلها balance −= amount). */
export function partyAccountBalance(type, id, data){
  if(type === "customer"){ const s = buildCustomerSummary(id, data); return s ? r2(s.balance) : 0; }
  if(type === "supplier"){ const s = buildSupplierSummary(id, data); return s ? r2(s.balance) : 0; }
  return 0;
}

function _ownedToUs(type, bal){ return type === "customer" ? bal : -bal; }

function _partyName(type, id, data){
  if(type === "customer"){ const c = (data.customers || []).find(x => String(x.id) === String(id)); return (c && c.name) || ""; }
  if(type === "supplier"){ const s = (data.suppliers || []).find(x => String(x.id) === String(id)); return (s && s.name) || ""; }
  return "";
}

export function transferPartyBalance(seed, data, user){
  const { fromType, fromId, toType, toId, amount, date, notes } = seed || {};
  if(!fromType || fromId == null) throw new Error("TRANSFER_FROM_REQUIRED");
  if(!toType || toId == null) throw new Error("TRANSFER_TO_REQUIRED");
  if(fromType === toType && String(fromId) === String(toId)) throw new Error("TRANSFER_SAME_PARTY");
  if(fromType !== "customer" && fromType !== "supplier") throw new Error("TRANSFER_FROM_TYPE");
  if(toType !== "customer" && toType !== "supplier") throw new Error("TRANSFER_TO_TYPE");

  const fromBal = partyAccountBalance(fromType, fromId, data);
  const srcOwed = _ownedToUs(fromType, fromBal);
  const maxMag = r2(Math.abs(srcOwed));
  if(maxMag <= 0) throw new Error("TRANSFER_SOURCE_ZERO");

  /* المقدار الموجب المطلوب نقله — افتراضي = الرصيد الكامل (تصفير المصدر) */
  let mag = amount == null || amount === "" ? maxMag : r2(Math.abs(Number(amount) || 0));
  if(mag <= 0) throw new Error("TRANSFER_AMOUNT_INVALID");
  if(mag > maxMag + 0.001) throw new Error("TRANSFER_AMOUNT_OVER_MAX");
  if(mag > maxMag) mag = maxMag; /* clamp float drift */

  const X = (srcOwed < 0 ? -1 : 1) * mag; /* الالتزام الموجّه المنقول */

  const fromName = _partyName(fromType, fromId, data);
  const toName = _partyName(toType, toId, data);
  const cleanDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().split("T")[0];
  const cleanNotes = String(notes || "").trim() ||
    ("تحميل حساب: من " + (fromName || fromType) + " إلى " + (toName || toType));
  const uid = (user && (user.uid || user.email)) || "";
  const now = Date.now();
  const transferId = "xfer_" + now.toString(36) + "_" + Math.random().toString(36).slice(2, 7);
  const nowISO = new Date(now).toISOString();

  const common = {
    date: cleanDate,
    note: cleanNotes,
    method: "تحميل حساب",
    by: uid,
    createdAt: nowISO,
    transferId,
    transferFrom: { type: fromType, id: String(fromId), name: fromName },
    transferTo: { type: toType, id: String(toId), name: toName },
  };

  /* مبلغ كل رِجل (الموجب = يقلّل الرصيد) */
  const fromAmt = r2(fromType === "customer" ? X : -X);  /* يصفّر المصدر */
  const toAmt   = r2(toType   === "customer" ? -X : X);  /* يمتص الالتزام في الوجهة */

  const custPays = [];
  const supPays = [];
  const mkCust = (id, nm, amt, side) => ({
    id: "cp_" + now.toString(36) + "_" + Math.random().toString(36).slice(2, 5) + "_" + side,
    custId: String(id), custName: nm, amount: amt, transferSide: side, ...common,
  });
  const mkSup = (id, nm, amt, side) => ({
    id: "sp_" + now.toString(36) + "_" + Math.random().toString(36).slice(2, 5) + "_" + side,
    supplierId: String(id), supplierName: nm, amount: amt, transferSide: side, ...common,
  });

  if(fromType === "customer") custPays.push(mkCust(fromId, fromName, fromAmt, "from"));
  else supPays.push(mkSup(fromId, fromName, fromAmt, "from"));
  if(toType === "customer") custPays.push(mkCust(toId, toName, toAmt, "to"));
  else supPays.push(mkSup(toId, toName, toAmt, "to"));

  const patch = {};
  if(custPays.length) patch.custPayments = [...(Array.isArray(data && data.custPayments) ? data.custPayments : []), ...custPays];
  if(supPays.length)  patch.supplierPayments = [...(Array.isArray(data && data.supplierPayments) ? data.supplierPayments : []), ...supPays];

  const toBal = partyAccountBalance(toType, toId, data);
  return { patch, transferId, magnitude: mag, signedTransfer: X, custPays, supPays,
    preview: { fromBal, fromAfter: r2(fromBal - fromAmt), toBal, toAfter: r2(toBal - toAmt) } };
}

/* معاينة حيّة لتحميل حساب (للـ UI) — نفس حساب transferPartyBalance لكن
   بترجّع أرقام بس (مفيش records، مفيش throw) عشان الـ validation اللحظي. */
export function previewPartyTransfer(seed, data){
  const { fromType, fromId, toType, toId, amount } = seed || {};
  const base = { ok: false, fromBal: 0, fromAfter: 0, toBal: 0, toAfter: 0, maxMag: 0, magnitude: 0 };
  if(!fromType || fromId == null || !toType || toId == null) return { ...base, error: "INCOMPLETE" };
  if(fromType === toType && String(fromId) === String(toId)) return { ...base, error: "SAME_PARTY" };

  const fromBal = partyAccountBalance(fromType, fromId, data);
  const toBal = partyAccountBalance(toType, toId, data);
  const srcOwed = _ownedToUs(fromType, fromBal);
  const maxMag = r2(Math.abs(srcOwed));
  if(maxMag <= 0) return { ...base, fromBal, toBal, error: "SOURCE_ZERO" };

  let mag = amount == null || amount === "" ? maxMag : r2(Math.abs(Number(amount) || 0));
  let error = "";
  if(mag <= 0) error = "AMOUNT_INVALID";
  else if(mag > maxMag + 0.001) error = "AMOUNT_OVER_MAX";
  if(mag > maxMag) mag = maxMag;

  const X = (srcOwed < 0 ? -1 : 1) * mag;
  const fromAmt = r2(fromType === "customer" ? X : -X);
  const toAmt   = r2(toType   === "customer" ? -X : X);
  return {
    ok: !error, error,
    fromBal, fromAfter: r2(fromBal - fromAmt),
    toBal, toAfter: r2(toBal - toAmt),
    maxMag, magnitude: mag,
  };
}

/* عكس تحميل حساب — يشيل رِجلَي التحويل بالـ transferId من الدفعتين. */
export function reversePartyTransfer(transferId, data){
  if(!transferId) throw new Error("TRANSFER_ID_REQUIRED");
  const cps = Array.isArray(data && data.custPayments) ? data.custPayments : [];
  const sps = Array.isArray(data && data.supplierPayments) ? data.supplierPayments : [];
  const removedCust = cps.filter(p => p && p.transferId === transferId).length;
  const removedSup  = sps.filter(p => p && p.transferId === transferId).length;
  if(removedCust + removedSup === 0) throw new Error("TRANSFER_NOT_FOUND");
  return {
    patch: {
      custPayments: cps.filter(p => !(p && p.transferId === transferId)),
      supplierPayments: sps.filter(p => !(p && p.transferId === transferId)),
    },
    removedCust, removedSup,
  };
}

/* V21.27.52: تعديل تحميل حساب «في المكان» — يعدّل المقدار/التاريخ/الملاحظة في
   رِجلَي التحويل (بنفس transferId) مع الحفاظ على إشارة كل رِجل (from/to). مفيش
   قيد محاسبي للتحويل (دفعات طرف فقط)، فالأرصدة مشتقّة وبتتظبط تلقائيًا.
   يرجّع { patch, touched }. يرمي لو الـ id ناقص/المقدار غير صالح/التحويل مش موجود. */
export function editPartyTransfer(transferId, data, { magnitude, date, note }){
  if(!transferId) throw new Error("TRANSFER_ID_REQUIRED");
  const mag = r2(Math.abs(Number(magnitude) || 0));
  if(mag <= 0) throw new Error("INVALID_MAGNITUDE");
  const cps = Array.isArray(data && data.custPayments) ? data.custPayments : [];
  const sps = Array.isArray(data && data.supplierPayments) ? data.supplierPayments : [];
  let touched = 0;
  const upd = (p) => {
    if(!(p && p.transferId === transferId)) return p;
    touched++;
    const sign = (Number(p.amount) || 0) < 0 ? -1 : 1; /* حافظ على اتجاه الرِجل */
    const next = { ...p, amount: r2(sign * mag) };
    if(date) next.date = String(date).slice(0, 10);
    if(note != null) next.note = String(note).slice(0, 300);
    next.editedAt = new Date().toISOString();
    return next;
  };
  const nextCps = cps.map(upd);
  const nextSps = sps.map(upd);
  if(touched === 0) throw new Error("TRANSFER_NOT_FOUND");
  return { patch: { custPayments: nextCps, supplierPayments: nextSps }, touched };
}

/* قائمة تحويلات «تحميل حساب» (مجمّعة بالـ transferId) — للعرض/العكس. */
export function listAccountTransfers(data){
  const cps = Array.isArray(data && data.custPayments) ? data.custPayments : [];
  const sps = Array.isArray(data && data.supplierPayments) ? data.supplierPayments : [];
  const byId = {};
  const push = (p) => {
    if(!p || p.method !== "تحميل حساب" || !p.transferId) return;
    if(!byId[p.transferId]) byId[p.transferId] = {
      transferId: p.transferId, date: p.date, createdAt: p.createdAt,
      from: p.transferFrom, to: p.transferTo, note: p.note, by: p.by, legs: [],
    };
    byId[p.transferId].legs.push(p);
  };
  cps.forEach(push); sps.forEach(push);
  return Object.values(byId)
    .map(t => {
      const fromLeg = t.legs.find(l => l.transferSide === "from");
      t.magnitude = fromLeg ? r2(Math.abs(Number(fromLeg.amount) || 0)) : 0;
      return t;
    })
    .sort((a, b) => String(b.createdAt || b.date || "").localeCompare(String(a.createdAt || a.date || "")));
}

/* ── Duplicate detection (V21.9.122, Phase 5c) ────────────────────
   Fuzzy matching to surface similar existing contacts during create —
   prevents the admin from accidentally creating a duplicate when the
   same party already exists under a slight variant of the name or
   with a different phone format. */

/* Normalize Arabic + Latin name for fuzzy compare. Strips:
   - tashkeel (diacritics)
   - alef variants (أإآ → ا)
   - taa marbuta (ة → ه)
   - alef maksura (ى → ي)
   - whitespace runs */
export function normalizeArabicName(name){
  return String(name == null ? "" : name)
    .trim()
    .toLowerCase()
    .replace(/[ً-ْ]/g, "")     /* tashkeel */
    .replace(/[أإآ]/g, "ا")  /* أإآ → ا */
    .replace(/ى/g, "ي")        /* ى → ي */
    .replace(/ة/g, "ه")        /* ة → ه */
    .replace(/\s+/g, " ");
}

/* Returns up to 5 contacts/entities that resemble the input. Confidence
   thresholds:
     • Phone exact match (after normalizePhone)     → 100
     • Phone last-9-digits match (covers leading 0) →  80
     • Name exact match (Arabic-normalized)          →  70
     • Name substring match (either direction)       →  40
   We sum the matched signals — so a contact with both name AND phone
   match scores 100+70 = 170. Sorting by score puts the strongest
   suggestions first.

   `excludeContactId` lets the caller skip the current contact when
   used in an edit flow (avoid suggesting "yourself"). */
export function findSimilarContacts(name, phone, data, excludeContactId){
  const nameNorm = normalizeArabicName(name);
  const phoneCanon = normalizePhone(String(phone || "").trim());
  if(!nameNorm && !phoneCanon) return [];

  const merged = buildMergedContacts(data);
  const out = [];

  for(const c of merged){
    if(excludeContactId && c.contactId === excludeContactId) continue;
    let score = 0;
    const reasons = [];

    if(phoneCanon){
      const cPhone = normalizePhone(c.phone || "");
      if(cPhone){
        if(cPhone === phoneCanon){
          score += 100;
          reasons.push("تليفون مطابق");
        } else {
          const ps = phoneCanon.slice(-9);
          const cs = cPhone.slice(-9);
          if(ps && cs && ps === cs){
            score += 80;
            reasons.push("آخر 9 أرقام مطابقة");
          }
        }
      }
    }

    if(nameNorm){
      const cName = normalizeArabicName(c.name);
      if(cName){
        if(cName === nameNorm){
          score += 70;
          reasons.push("اسم مطابق");
        } else if(nameNorm.length >= 3 && cName.length >= 3){
          /* substring match — require ≥3 chars to avoid silly matches */
          if(cName.includes(nameNorm) || nameNorm.includes(cName)){
            score += 40;
            reasons.push("اسم متشابه");
          }
        }
      }
    }

    if(score >= 40){
      out.push({ ...c, _confidence: score, _reason: reasons.join(" + ") });
    }
  }

  out.sort((a, b) => b._confidence - a._confidence);
  return out.slice(0, 5);
}

/* ── Add types to existing contact (V21.9.121, Phase 5b) ──────────
   Lets the admin extend a contact's classifications. The behavior is
   parallel to linkExistingContact() but operates on an existing
   registry record instead of creating one.

   `additionalLinks` shape:
     [
       { type: "supplier", action: "create" },
       { type: "workshop", action: "use", entityId: "5142..." },
     ]

   For each link:
     - "create" → spawn a new entity carrying the contact's name/phone/tags
     - "use"    → stamp contactId on the existing entity + propagate fields
*/
export function addTypesToContact(contactId, additionalLinks, data, user){
  if(!contactId) throw new Error("CONTACT_ID_REQUIRED");
  const contacts = Array.isArray(data && data.contacts) ? data.contacts : [];
  const contactIdx = contacts.findIndex(c => c && c.id === contactId);
  if(contactIdx < 0) throw new Error("CONTACT_NOT_FOUND");
  const contact = contacts[contactIdx];

  const extras = Array.isArray(additionalLinks) ? additionalLinks.filter(l => l && l.type) : [];
  if(extras.length === 0) throw new Error("CONTACT_NO_TYPES_TO_ADD");

  const name = String(contact.name || "").trim();
  const phone = normalizePhone(String(contact.phone || "").trim());
  const tags = Array.isArray(contact.tags) ? contact.tags.slice() : [];
  const uid = (user && (user.uid || user.email)) || "";
  const now = Date.now();

  const newLinkedIds = { ...(contact.linkedIds || { customer:null, supplier:null, workshop:null, employee:null }) };
  const newTypes = new Set(Array.isArray(contact.types) ? contact.types : []);
  let newWorkshopSubType = contact.workshopSubType || "";

  const patch = {};
  const workingArr = (collectionKey) => {
    if(patch[collectionKey]) return patch[collectionKey];
    const existing = Array.isArray(data && data[collectionKey]) ? data[collectionKey] : [];
    patch[collectionKey] = existing.slice();
    return patch[collectionKey];
  };

  for(const link of extras){
    const t = link.type;
    if(!["customer","supplier","workshop","employee"].includes(t)) continue;
    if(newTypes.has(t)) continue;  /* skip — already linked */

    const collectionKey = (t === "customer" ? "customers" :
                           t === "supplier" ? "suppliers" :
                           t === "workshop" ? "workshops" : "employees");
    const arr = workingArr(collectionKey);

    if(link.action === "use"){
      const idx = arr.findIndex(e => String(e.id) === String(link.entityId));
      if(idx < 0) throw new Error("CONTACT_LINK_TARGET_NOT_FOUND:" + t);
      if(arr[idx].contactId) throw new Error("CONTACT_LINK_TARGET_ALREADY_LINKED:" + t + ":" + arr[idx].contactId);
      arr[idx] = { ...arr[idx], contactId, name, phone, tags: tags.slice() };
      newLinkedIds[t] = arr[idx].id;
      if(t === "workshop") newWorkshopSubType = arr[idx].type || newWorkshopSubType;
    } else if(link.action === "create"){
      let entity;
      if(t === "customer"){
        entity = {
          id: "cust_" + now.toString(36) + "_" + Math.random().toString(36).slice(2, 6),
          /* V21.9.189: default discount 10% (was 0) */
          name, phone, address: "", type: "مكتب", discount: 10, archived: false,
          tags: tags.slice(), contactId,
          createdAt: new Date(now).toISOString(), createdBy: uid,
        };
      } else if(t === "supplier"){
        entity = {
          id: "sup_" + now.toString(36) + "_" + Math.random().toString(36).slice(2, 6),
          name, phone, address: "", notes: "",
          tags: tags.slice(), contactId,
          createdAt: new Date(now).toISOString(), createdBy: uid,
        };
      } else if(t === "workshop"){
        const subType = link.workshopSubType || "";
        if(!subType) throw new Error("CONTACT_LINK_WORKSHOP_SUBTYPE_REQUIRED");
        newWorkshopSubType = subType;
        entity = {
          id: Math.floor(now / 1000) * 100 + Math.floor(Math.random() * 100),
          name, owner: "", phone, address: "", idCard: "", ownerPhoto: "",
          rating: 7, type: subType,
          tags: tags.slice(), contactId,
        };
      } else { /* employee */
        entity = {
          id: "emp_" + now.toString(36) + "_" + Math.random().toString(36).slice(2, 6),
          name, phone, role: "", basicSalary: 0,
          hireDate: new Date(now).toISOString().split("T")[0], active: true,
          tags: tags.slice(), contactId,
          createdAt: new Date(now).toISOString(), createdBy: uid,
        };
      }
      arr.push(entity);
      newLinkedIds[t] = entity.id;
    }
    newTypes.add(t);
  }

  /* Update the contact record */
  const updatedContacts = contacts.slice();
  updatedContacts[contactIdx] = {
    ...contact,
    types: Array.from(newTypes),
    linkedIds: newLinkedIds,
    workshopSubType: newWorkshopSubType,
    updatedAt: now,
  };
  patch.contacts = updatedContacts;

  return { patch, contact: updatedContacts[contactIdx] };
}

/* Remove a type from an existing contact. Disconnects (does NOT delete) the
   underlying entity — it stays in data.<collection> as a "legacy/standalone"
   row. Admin can re-link or delete it from its own page later.

   Guards:
     - The contact must keep at least 1 type. Removing the last type would
       orphan the contact. Caller should delete the contact instead in that
       case (future feature).
*/
export function removeTypeFromContact(contactId, typeKey, data){
  if(!contactId) throw new Error("CONTACT_ID_REQUIRED");
  if(!["customer","supplier","workshop","employee"].includes(typeKey)){
    throw new Error("CONTACT_BAD_TYPE");
  }
  const contacts = Array.isArray(data && data.contacts) ? data.contacts : [];
  const idx = contacts.findIndex(c => c && c.id === contactId);
  if(idx < 0) throw new Error("CONTACT_NOT_FOUND");
  const contact = contacts[idx];
  const currentTypes = Array.isArray(contact.types) ? contact.types : [];
  if(!currentTypes.includes(typeKey)) throw new Error("CONTACT_TYPE_NOT_LINKED");
  if(currentTypes.length <= 1) throw new Error("CONTACT_CANNOT_REMOVE_LAST_TYPE");

  const linkedIds = contact.linkedIds || {};
  const entityId = linkedIds[typeKey];
  const collectionKey = (typeKey === "customer" ? "customers" :
                         typeKey === "supplier" ? "suppliers" :
                         typeKey === "workshop" ? "workshops" : "employees");

  const patch = {};

  /* 1. Clear contactId on the entity (keep the entity itself!). */
  if(entityId){
    const sourceArr = Array.isArray(data && data[collectionKey]) ? data[collectionKey] : [];
    const eIdx = sourceArr.findIndex(e => String(e.id) === String(entityId));
    if(eIdx >= 0){
      const next = sourceArr.slice();
      const e = next[eIdx];
      const cleaned = { ...e };
      delete cleaned.contactId;
      next[eIdx] = cleaned;
      patch[collectionKey] = next;
    }
  }

  /* 2. Update the contact record. */
  const nextLinkedIds = { ...linkedIds, [typeKey]: null };
  const nextTypes = currentTypes.filter(t => t !== typeKey);
  const updatedContacts = contacts.slice();
  updatedContacts[idx] = {
    ...contact,
    types: nextTypes,
    linkedIds: nextLinkedIds,
    /* If we removed the workshop type, clear the subType too. */
    workshopSubType: typeKey === "workshop" ? "" : contact.workshopSubType,
    updatedAt: Date.now(),
  };
  patch.contacts = updatedContacts;

  return { patch, contact: updatedContacts[idx] };
}

/* ── Settlement history + reverse (V21.9.120, Phase 5a) ──────────────
   Settlements are stored as paired entries in custPayments + supplierPayments
   sharing a `settlementId`. This helper finds both legs and groups them. */
export function getContactSettlements(contactId, data){
  if(!contactId) return [];
  const custPayments = Array.isArray(data && data.custPayments) ? data.custPayments : [];
  const supplierPayments = Array.isArray(data && data.supplierPayments) ? data.supplierPayments : [];

  /* Index by settlementId for fast pairing. */
  const byId = new Map();
  for(const p of custPayments){
    if(!p || p.contactId !== contactId || !p.settlementId) continue;
    if(p.method !== "مقاصة") continue;
    const entry = byId.get(p.settlementId) || { settlementId: p.settlementId, contactId };
    entry.custPayment = p;
    byId.set(p.settlementId, entry);
  }
  for(const p of supplierPayments){
    if(!p || p.contactId !== contactId || !p.settlementId) continue;
    if(p.method !== "مقاصة") continue;
    const entry = byId.get(p.settlementId) || { settlementId: p.settlementId, contactId };
    entry.supPayment = p;
    byId.set(p.settlementId, entry);
  }

  /* Surface synthesized fields for the UI. Recent first. */
  const out = [];
  for(const e of byId.values()){
    const date = (e.custPayment && e.custPayment.date) || (e.supPayment && e.supPayment.date) || "";
    const amount = (e.custPayment && Number(e.custPayment.amount)) || (e.supPayment && Number(e.supPayment.amount)) || 0;
    const note = (e.custPayment && e.custPayment.note) || (e.supPayment && e.supPayment.note) || "";
    const createdAt = (e.custPayment && e.custPayment.createdAt) || (e.supPayment && e.supPayment.createdAt) || "";
    const status = (e.custPayment && e.supPayment) ? "complete" : "partial";  /* partial = one leg missing (data integrity flag) */
    out.push({ ...e, date, amount, note, createdAt, status });
  }
  out.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return out;
}

/* Reverse a settlement by removing BOTH payment entries that share its
   settlementId. Pure function — returns patch the caller commits via upConfig.

   If a leg is missing (status:"partial"), we still remove the existing leg
   so the data integrity flag clears on next render. The admin can re-create
   the settlement if needed. */
export function reverseContactSettlement(settlementId, data){
  if(!settlementId) throw new Error("SETTLEMENT_ID_REQUIRED");
  const custPayments = Array.isArray(data && data.custPayments) ? data.custPayments : [];
  const supplierPayments = Array.isArray(data && data.supplierPayments) ? data.supplierPayments : [];

  const nextCust = custPayments.filter(p => !p || p.settlementId !== settlementId);
  const nextSup  = supplierPayments.filter(p => !p || p.settlementId !== settlementId);

  const removedCust = custPayments.length - nextCust.length;
  const removedSup  = supplierPayments.length - nextSup.length;
  if(removedCust === 0 && removedSup === 0){
    throw new Error("SETTLEMENT_NOT_FOUND");
  }

  return {
    patch: {
      custPayments: nextCust,
      supplierPayments: nextSup,
    },
    removedCust,
    removedSup,
  };
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

/* ═══════════════════════════════════════════════════════════════
   V21.21.96 — حذف جماعي لجهات الاتصال (يشيلها من السجل الموحّد + من
   قائمتها الأصلية: customers / suppliers / workshops / employees).

   آمن (نفس فحص dataIntegrity المستخدم في الحذف الفردي): أي جهة مرتبطة
   بأوردر/فاتورة/دفعة/خزنة بتتسكِب (بترجع في `blocked` مع السبب) — مفيش
   cascade-delete للحركات أبداً. الباقي بيترسم في `patch` (يتطبّق في upConfig).

   rows = صفوف من buildMergedContacts (فيها entityIds + contactId).
   returns: { patch, deletable:[name], blocked:[{name, reason}] }
   ═══════════════════════════════════════════════════════════════ */
const _ENTITY_COLLECTION = { customer: "customers", supplier: "suppliers", workshop: "workshops", employee: "employees" };

/* فحص هل جهة قابلة للحذف (كل entities المرتبطة بيها غير محظورة). */
export function contactDeleteBlocker(row, data){
  const ids = (row && row.entityIds) || {};
  const reasons = [];
  for(const [type, id] of Object.entries(ids)){
    if(!_ENTITY_COLLECTION[type]) continue;
    const b = getDeleteBlocker(data, type, id);   /* kind === type (customer/supplier/workshop/employee) */
    if(b) reasons.push(labelForType(type) + ": " + b);
  }
  return reasons.length ? reasons.join(" • ") : null;
}

export function planContactsDeletion(rows, data){
  const d = data || {};
  const blocked = [];
  const deletable = [];
  /* اجمع الـ ids المطلوب حذفها لكل collection + الـ contactIds */
  const delByCollection = { customers: new Set(), suppliers: new Set(), workshops: new Set(), employees: new Set() };
  const delContactIds = new Set();
  for(const row of (Array.isArray(rows) ? rows : [])){
    const reason = contactDeleteBlocker(row, d);
    if(reason){ blocked.push({ name: row.name || "—", reason }); continue; }
    const ids = row.entityIds || {};
    for(const [type, id] of Object.entries(ids)){
      const col = _ENTITY_COLLECTION[type];
      if(col) delByCollection[col].add(String(id));
    }
    if(row.contactId) delContactIds.add(String(row.contactId));
    deletable.push(row.name || "—");
  }
  /* ابنِ الـ patch (نسخ مفلترة — مفيش mutation للأصل) */
  const patch = {};
  for(const col of Object.keys(delByCollection)){
    const set = delByCollection[col];
    if(set.size === 0) continue;
    patch[col] = (Array.isArray(d[col]) ? d[col] : []).filter(e => !set.has(String(e && e.id)));
  }
  if(delContactIds.size > 0){
    patch.contacts = (Array.isArray(d.contacts) ? d.contacts : []).filter(c => !delContactIds.has(String(c && c.id)));
  }
  return { patch, deletable, blocked };
}
