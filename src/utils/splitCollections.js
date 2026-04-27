/* ════════════════════════════════════════════════════════════════════════
   CLARK V16.74 — Split Collections Manager
   ════════════════════════════════════════════════════════════════════════
   
   ─── المشكلة ───
   factory/config كان فيه 3 arrays بتكبر يومياً وممكن تعدي حد الـ1MB:
   - treasury (~250 byte/حركة)
   - auditLog (~400 byte/سجل)
   - hrLog    (~150 byte/سجل)
   
   ─── الحل ───
   نقسم الثلاثة arrays لـcollections يومية:
     factory/config              ← باقي البيانات
     treasuryDays/{YYYY-MM-DD}   ← { entries: [...] }
     auditDays/{YYYY-MM-DD}      ← { entries: [...] }
     hrLogDays/{YYYY-MM-DD}      ← { entries: [...] }
   
   كل document ≤ 5KB. سنوياً = 365 ملف × 5KB موزّعة → بدل ملف واحد كبير.
   
   ─── الشفافية ───
   الصفحات (TreasuryPg, HRPg, AuditPg) **مش محتاجة تتعدّل**.
   data.treasury / data.auditLog / data.hrLog يستمروا يبانوا كـarrays.
   الـmagic بيحصل في App.jsx فقط.
   ════════════════════════════════════════════════════════════════════════ */

import { 
  collection, doc, getDoc, getDocs, setDoc, deleteDoc, writeBatch
} from "firebase/firestore";
import { db } from "../firebase.js";

/* الـcollections اللي مقسّمة — field name → collection name */
export const SPLIT_COLLECTIONS = {
  treasury:  "treasuryDays",
  auditLog:  "auditDays",
  hrLog:     "hrLogDays",
};

/* مفاتيح الـfields اللي مقسّمة (للحلقات السريعة) */
export const SPLIT_FIELDS = Object.keys(SPLIT_COLLECTIONS);

/* helper: استخراج YYYY-MM-DD من entry بحسب نوعه */
function _getEntryDate(entry) {
  if (!entry) return new Date().toISOString().slice(0, 10);
  /* treasury: t.date موجود مباشرة */
  if (entry.date && /^\d{4}-\d{2}-\d{2}/.test(entry.date)) {
    return entry.date.slice(0, 10);
  }
  /* auditLog: a.ts ISO timestamp */
  if (entry.ts) {
    try { return new Date(entry.ts).toISOString().slice(0, 10); }
    catch (e) { /* fall through */ }
  }
  if (entry.createdAt) {
    try { return new Date(entry.createdAt).toISOString().slice(0, 10); }
    catch (e) { /* fall through */ }
  }
  return new Date().toISOString().slice(0, 10);
}

/* ════════════════════════════════════════════════════════════════════════
   READ
   ════════════════════════════════════════════════════════════════════════ */

/* قراءة كل documents في collection ودمجهم لـarray واحد */
export async function readSplitCollection(collectionName) {
  try {
    const snap = await getDocs(collection(db, collectionName));
    const all = [];
    snap.forEach(docSnap => {
      const data = docSnap.data();
      if (data && Array.isArray(data.entries)) {
        all.push(...data.entries);
      }
    });
    return all;
  } catch (err) {
    console.error(`[splitCollections] Failed to read ${collectionName}:`, err);
    return [];
  }
}

/* قراءة الـ3 collections بالتوازي */
export async function readAllSplitCollections() {
  const [treasury, auditLog, hrLog] = await Promise.all([
    readSplitCollection(SPLIT_COLLECTIONS.treasury),
    readSplitCollection(SPLIT_COLLECTIONS.auditLog),
    readSplitCollection(SPLIT_COLLECTIONS.hrLog),
  ]);
  return { treasury, auditLog, hrLog };
}

/* ════════════════════════════════════════════════════════════════════════
   WRITE — sync changes to day documents
   ════════════════════════════════════════════════════════════════════════ */

/**
 * بياخد old و new arrays، بيحدد إيه اللي اتغير، وبيكتب الـday docs المتأثرة.
 * النمط: لو حصل أي تغيير في يوم معيّن، نعيد كتابة الـdoc بتاع اليوم بالكامل.
 */
/**
 * V16.75 CRITICAL FIX: read existing day doc first, then merge.
 * 
 * Why: previously this function overwrote the day document with newEntries
 * (computed from local splitDataRef + fn changes). If splitData was incomplete
 * (listener still firing, race condition, multi-tab), the local snapshot was
 * a SUBSET of the actual server state. Writing it back wiped real entries.
 * 
 * Now the strategy is delta-based: 
 * 1. Compute which entry IDs were ADDED/REMOVED in the local fn diff
 * 2. Read the day document from server
 * 3. Apply ADD/REMOVE to the server's actual entries (not local)
 * 4. Write merged result back
 */
export async function syncSplitCollection(collectionName, oldArr, newArr) {
  if (!Array.isArray(newArr)) newArr = [];
  if (!Array.isArray(oldArr)) oldArr = [];
  
  /* index entries by id for fast diff */
  const oldById = new Map();
  oldArr.forEach(e => { if (e && e.id) oldById.set(String(e.id), e); });
  const newById = new Map();
  newArr.forEach(e => { if (e && e.id) newById.set(String(e.id), e); });
  
  /* Compute deltas */
  const addedOrModified = [];
  const removedIds = new Set();
  
  for (const [id, newEntry] of newById) {
    const oldEntry = oldById.get(id);
    if (!oldEntry) {
      addedOrModified.push(newEntry);
    } else if (JSON.stringify(oldEntry) !== JSON.stringify(newEntry)) {
      addedOrModified.push(newEntry);
    }
  }
  for (const id of oldById.keys()) {
    if (!newById.has(id)) removedIds.add(id);
  }
  
  /* No changes at all? */
  if (addedOrModified.length === 0 && removedIds.size === 0) return 0;
  
  /* Group adds/mods by day */
  const addsByDay = new Map();
  for (const entry of addedOrModified) {
    const date = _getEntryDate(entry);
    if (!addsByDay.has(date)) addsByDay.set(date, []);
    addsByDay.get(date).push(entry);
  }
  
  /* Group removes by day — need to find which day each removed id belonged to.
     We use oldById for that since it has the full entry. */
  const removesByDay = new Map();
  for (const id of removedIds) {
    const oldEntry = oldById.get(id);
    if (!oldEntry) continue;
    const date = _getEntryDate(oldEntry);
    if (!removesByDay.has(date)) removesByDay.set(date, new Set());
    removesByDay.get(date).add(id);
  }
  
  const allDays = new Set([...addsByDay.keys(), ...removesByDay.keys()]);
  
  /* For each affected day: read current server state, apply delta, write back */
  const writes = [];
  for (const date of allDays) {
    writes.push((async () => {
      const dayRef = doc(db, collectionName, date);
      
      /* Read current server state for this day */
      let serverEntries = [];
      try {
        const snap = await getDoc(dayRef);
        if (snap.exists()) {
          const data = snap.data();
          serverEntries = Array.isArray(data?.entries) ? data.entries : [];
        }
      } catch (e) {
        console.warn(`[splitCollections] Could not read ${collectionName}/${date}, treating as empty:`, e);
      }
      
      /* Apply removes */
      const removeIds = removesByDay.get(date) || new Set();
      let merged = removeIds.size > 0
        ? serverEntries.filter(e => !removeIds.has(String(e?.id || "")))
        : [...serverEntries];
      
      /* Apply adds/modifications: for each new entry, replace if exists else prepend (treasury/audit/hrLog use unshift pattern) */
      const addList = addsByDay.get(date) || [];
      for (const newEntry of addList) {
        const newId = String(newEntry?.id || "");
        if (!newId) {
          /* No id — just prepend (defensive) */
          merged.unshift(newEntry);
          continue;
        }
        const existingIdx = merged.findIndex(e => String(e?.id || "") === newId);
        if (existingIdx >= 0) {
          merged[existingIdx] = newEntry;  /* update in place */
        } else {
          merged.unshift(newEntry);  /* prepend new entry */
        }
      }
      
      /* Write the merged result */
      if (merged.length === 0) {
        await deleteDoc(dayRef);
      } else {
        await setDoc(dayRef, {
          entries: merged,
          count: merged.length,
          updatedAt: new Date().toISOString(),
        });
      }
    })());
  }
  
  await Promise.all(writes);
  return writes.length;
}

/* يحذف الـ3 arrays المقسّمة من config object قبل الكتابة لـfactory/config */
export function stripSplitArrays(configObj) {
  if (!configObj) return configObj;
  const stripped = { ...configObj };
  for (const field of SPLIT_FIELDS) {
    delete stripped[field];
  }
  return stripped;
}

/**
 * يقارن config قديم بـconfig جديد، يحدد أي split arrays اتغيرت،
 * ويـsync الـday documents المتأثرة.
 * بتنادى بعد كل upConfig() في App.jsx.
 */
export async function syncAllSplitChanges(oldConfig, newConfig) {
  const tasks = [];
  for (const field of SPLIT_FIELDS) {
    const oldArr = oldConfig?.[field] || [];
    const newArr = newConfig?.[field] || [];
    
    if (oldArr === newArr) continue;
    if (oldArr.length === newArr.length && 
        JSON.stringify(oldArr) === JSON.stringify(newArr)) continue;
    
    tasks.push(syncSplitCollection(SPLIT_COLLECTIONS[field], oldArr, newArr));
  }
  
  if (tasks.length === 0) return;
  await Promise.all(tasks);
}

/* ════════════════════════════════════════════════════════════════════════
   SIZE TRACKING — للـsettings page
   ════════════════════════════════════════════════════════════════════════ */

export async function getSplitCollectionStats(collectionName) {
  try {
    const snap = await getDocs(collection(db, collectionName));
    const days = [];
    let totalSize = 0;
    let totalCount = 0;
    
    snap.forEach(docSnap => {
      const data = docSnap.data();
      const entries = (data && data.entries) || [];
      const size = new Blob([JSON.stringify(data)]).size;
      days.push({
        date: docSnap.id,
        count: entries.length,
        size: size,
      });
      totalSize += size;
      totalCount += entries.length;
    });
    
    days.sort((a, b) => b.date.localeCompare(a.date));
    
    return {
      collectionName,
      dayCount: days.length,
      totalCount,
      totalSize,
      avgDaySize: days.length > 0 ? Math.round(totalSize / days.length) : 0,
      avgPerEntry: totalCount > 0 ? Math.round(totalSize / totalCount) : 0,
      days,
    };
  } catch (err) {
    console.error(`[splitCollections] Failed to get stats for ${collectionName}:`, err);
    return null;
  }
}

export async function getAllSplitStats() {
  const [treasuryStats, auditStats, hrLogStats] = await Promise.all([
    getSplitCollectionStats(SPLIT_COLLECTIONS.treasury),
    getSplitCollectionStats(SPLIT_COLLECTIONS.auditLog),
    getSplitCollectionStats(SPLIT_COLLECTIONS.hrLog),
  ]);
  return {
    treasury: treasuryStats,
    auditLog: auditStats,
    hrLog: hrLogStats,
  };
}
