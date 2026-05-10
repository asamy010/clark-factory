/* ════════════════════════════════════════════════════════════════════════
   CLARK V16.75 — Partitioned Collections Manager
   ════════════════════════════════════════════════════════════════════════
   
   ─── الفرق بين Split (V16.74) و Partitioned (V16.75) ───
   
   Split (V16.74): array من entries صغيرة، نقسمها بـday
     - treasury: [{id, type, amount, date}, ...]
     - بنجمع بـdate → treasuryDays/2026-04-26 → {entries: [...]}
   
   Partitioned (V16.75): array من objects كبيرة، كل object document
     - hrWeeks: [{id, weekStart, weekEnd, attendance: {...}, draftInputs: {...}}, ...]
     - كل week.id → hrWeeksDocs/{weekId} → الـobject كامل
   
   ─── ليه مختلف ───
   hrWeeks objects كبيرة (~67 KB لكل أسبوع) ومعقّدة (nested maps).
   لو حطّيناهم في day documents مع entries تانية، كل تعديل صغير
   هيعيد كتابة الـday كاملاً.
   
   النمط المختار: كل object document مستقل = أبسط + أسرع كتابة.
   ════════════════════════════════════════════════════════════════════════ */

import { 
  collection, doc, getDocs, setDoc, deleteDoc, writeBatch
} from "firebase/firestore";
import { db } from "../firebase.js";

/* الـcollections المُجزّأة بنمط byId — field name → collection name */
export const PARTITIONED_COLLECTIONS = {
  /* V16.75 */
  hrWeeks:         "hrWeeksDocs",
  /* V19.57 — master data (every entity = own doc, factory/config stays settings-only) */
  customers:       "customersDocs",
  suppliers:       "suppliersDocs",
  workshops:       "workshopsDocs",
  employees:       "employeesDocs",
  empDebts:        "empDebtsDocs",
  generalProducts: "generalProductsDocs",
  fabrics:         "fabricsDocs",
  accessories:     "accessoriesDocs",
  /* V21.9.2 — Shopify products + customers (were 80% of factory/config doc size) */
  shopifyProducts:  "shopifyProductsDocs",
  shopifyCustomers: "shopifyCustomersDocs",
};

/* مفاتيح الـfields */
export const PARTITIONED_FIELDS = Object.keys(PARTITIONED_COLLECTIONS);

/* V19.57: Field groups by migration version — used for selective stripping
   so a newly-added field is NOT stripped from config before its migration runs.
   Same pattern as splitCollections.js (V19.49+). */
export const PARTITIONED_FIELDS_V1675 = ["hrWeeks"];
export const PARTITIONED_FIELDS_V1957 = [
  "customers", "suppliers", "workshops", "employees",
  "empDebts", "generalProducts", "fabrics", "accessories",
];
/* V21.9.2 — split Shopify Products + Customers (were 80% of factory/config) */
export const PARTITIONED_FIELDS_V2192 = ["shopifyProducts", "shopifyCustomers"];

export const PARTITIONED_FLAG_V1675 = "_partitionedV1675Done";
export const PARTITIONED_FLAG_V1957 = "_partitionedV1957Done";
export const PARTITIONED_FLAG_V2192 = "_partitionedV2192Done";

/* ════════════════════════════════════════════════════════════════════════
   READ
   ════════════════════════════════════════════════════════════════════════ */

/* قراءة كل documents في collection ودمجهم في array واحد */
export async function readPartitionedCollection(collectionName) {
  try {
    const snap = await getDocs(collection(db, collectionName));
    const all = [];
    snap.forEach(docSnap => {
      const data = docSnap.data();
      if (data && data.id) {
        all.push(data);
      }
    });
    /* sort by id (متوافق مع الترتيب القديم) */
    all.sort((a, b) => String(a.id || "").localeCompare(String(b.id || "")));
    return all;
  } catch (err) {
    console.error(`[partitioned] Failed to read ${collectionName}:`, err);
    return [];
  }
}

/* قراءة كل الـpartitioned collections بالتوازي */
export async function readAllPartitionedCollections() {
  const result = {};
  const tasks = PARTITIONED_FIELDS.map(async field => {
    result[field] = await readPartitionedCollection(PARTITIONED_COLLECTIONS[field]);
  });
  await Promise.all(tasks);
  return result;
}

/* ════════════════════════════════════════════════════════════════════════
   WRITE — sync changes to individual documents
   ════════════════════════════════════════════════════════════════════════ */

/**
 * بياخد old & new arrays، بيحدد أي objects اتغيرت/اتضافت/اتحذفت،
 * ويكتب الـdocuments المتأثرة فقط.
 *
 * V16.75 CRITICAL FIX: only delete if the deletion is INTENTIONAL.
 * 
 * Why: previously if oldArr was incomplete (race condition, multi-tab), the function
 * could not distinguish "intentionally deleted" from "missing because state was incomplete".
 * 
 * Now: writes are ALWAYS safe (just upsert). Deletes happen only if oldArr explicitly
 * had the id AND newArr explicitly removed it. If oldArr is empty/undefined, NO deletes.
 */
/* V17.1 FIX #4: Deep equality check that's order-independent.
   JSON.stringify is order-dependent — same object with different key insertion
   order yields different strings, causing false negatives → unnecessary writes.
   For complex hrWeek objects with nested receipts/attendance maps, this can
   cause 5-10× more writes than needed. */
function _deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!_deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!_deepEqual(a[k], b[k])) return false;
  }
  return true;
}

export async function syncPartitionedCollection(collectionName, oldArr, newArr) {
  if (!Array.isArray(newArr)) newArr = [];
  if (!Array.isArray(oldArr)) oldArr = [];
  
  /* index by id */
  const oldById = new Map();
  oldArr.forEach(o => { if (o && o.id) oldById.set(String(o.id), o); });
  const newById = new Map();
  newArr.forEach(o => { if (o && o.id) newById.set(String(o.id), o); });
  
  const writes = [];
  
  /* SAFETY: only consider deletions if oldArr was non-empty.
     Empty oldArr usually means we never loaded the data — never delete in that case. */
  if (oldById.size > 0) {
    for (const id of oldById.keys()) {
      if (!newById.has(id)) {
        /* explicit delete */
        writes.push(deleteDoc(doc(db, collectionName, id)));
      }
    }
  }
  
  /* writes: add or modify */
  for (const [id, newObj] of newById) {
    const oldObj = oldById.get(id);
    /* V17.1 FIX #4: deep equality (order-independent) instead of JSON.stringify */
    if (oldObj && _deepEqual(oldObj, newObj)) continue;
    writes.push(setDoc(doc(db, collectionName, id), newObj));
  }
  
  if (writes.length === 0) return 0;
  
  await Promise.all(writes);
  return writes.length;
}

/* V19.57: Selective strip — only strips field-groups whose migration has run.
   Critical: until V19.57 migration completes, the 8 master-data fields MUST stay
   in config — otherwise the next write would silently delete them before they're
   moved to per-id collections. Same safety pattern as splitCollections.js. */
export function stripPartitionedArrays(configObj) {
  if (!configObj) return configObj;
  const stripped = { ...configObj };
  if (configObj[PARTITIONED_FLAG_V1675]) {
    for (const field of PARTITIONED_FIELDS_V1675) delete stripped[field];
  }
  if (configObj[PARTITIONED_FLAG_V1957]) {
    for (const field of PARTITIONED_FIELDS_V1957) delete stripped[field];
  }
  if (configObj[PARTITIONED_FLAG_V2192]) {
    for (const field of PARTITIONED_FIELDS_V2192) delete stripped[field];
  }
  return stripped;
}

/**
 * يقارن config قديم بـconfig جديد، يحدد أي partitioned arrays اتغيرت،
 * ويـsync الـdocuments المتأثرة.
 */
export async function syncAllPartitionedChanges(oldConfig, newConfig) {
  const tasks = [];
  for (const field of PARTITIONED_FIELDS) {
    const oldArr = oldConfig?.[field] || [];
    const newArr = newConfig?.[field] || [];
    
    if (oldArr === newArr) continue;
    /* V17.1 FIX #4: deep equality instead of JSON.stringify */
    if (oldArr.length === newArr.length && _deepEqual(oldArr, newArr)) continue;
    
    tasks.push(syncPartitionedCollection(PARTITIONED_COLLECTIONS[field], oldArr, newArr));
  }
  
  if (tasks.length === 0) return;
  await Promise.all(tasks);
}

/* ════════════════════════════════════════════════════════════════════════
   STATS — للـsettings page
   ════════════════════════════════════════════════════════════════════════ */

export async function getPartitionedCollectionStats(collectionName) {
  try {
    const snap = await getDocs(collection(db, collectionName));
    const items = [];
    let totalSize = 0;

    snap.forEach(docSnap => {
      const data = docSnap.data();
      const size = new Blob([JSON.stringify(data)]).size;
      /* V19.57: generic label resolver — works for hrWeeks AND master data
         (customer/supplier/workshop/employee/etc.) without per-entity branches. */
      let label;
      if (data.weekNum) label = `أسبوع ${data.weekNum}`;
      else if (data.name) label = data.name;
      else if (data.weekStart) label = data.weekStart;
      else label = docSnap.id;
      let subLabel;
      if (data.weekStart && data.weekEnd) subLabel = `${data.weekStart} → ${data.weekEnd}`;
      else if (data.phone) subLabel = data.phone;
      else if (data.code) subLabel = data.code;
      else subLabel = data.status || "";
      items.push({
        id: docSnap.id,
        label,
        subLabel,
        size,
        status: data.status || null,
      });
      totalSize += size;
    });

    /* sort by id desc — أحدث أولاً (ids عشوائية لكن بـtimestamp encoding) */
    items.sort((a, b) => String(b.id).localeCompare(String(a.id)));

    return {
      collectionName,
      itemCount: items.length,
      totalSize,
      avgSize: items.length > 0 ? Math.round(totalSize / items.length) : 0,
      items,
    };
  } catch (err) {
    console.error(`[partitioned] Failed to get stats for ${collectionName}:`, err);
    return null;
  }
}

export async function getAllPartitionedStats() {
  const result = {};
  const tasks = PARTITIONED_FIELDS.map(async field => {
    result[field] = await getPartitionedCollectionStats(PARTITIONED_COLLECTIONS[field]);
  });
  await Promise.all(tasks);
  return result;
}
