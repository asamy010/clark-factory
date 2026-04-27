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
  hrWeeks: "hrWeeksDocs",
};

/* مفاتيح الـfields */
export const PARTITIONED_FIELDS = Object.keys(PARTITIONED_COLLECTIONS);

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
    if (oldObj && JSON.stringify(oldObj) === JSON.stringify(newObj)) continue;
    writes.push(setDoc(doc(db, collectionName, id), newObj));
  }
  
  if (writes.length === 0) return 0;
  
  await Promise.all(writes);
  return writes.length;
}

/* يحذف الـpartitioned arrays من config object قبل الكتابة لـfactory/config */
export function stripPartitionedArrays(configObj) {
  if (!configObj) return configObj;
  const stripped = { ...configObj };
  for (const field of PARTITIONED_FIELDS) {
    delete stripped[field];
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
    if (oldArr.length === newArr.length && 
        JSON.stringify(oldArr) === JSON.stringify(newArr)) continue;
    
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
      /* حقل وصفي للعرض — أهم حاجة في hrWeeks هو weekNum + weekStart */
      const label = data.weekNum 
        ? `أسبوع ${data.weekNum}` 
        : (data.weekStart || docSnap.id);
      const subLabel = data.weekStart && data.weekEnd
        ? `${data.weekStart} → ${data.weekEnd}`
        : (data.status || "");
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
