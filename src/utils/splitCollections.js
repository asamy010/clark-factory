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
  collection, doc, getDocs, setDoc, deleteDoc, writeBatch
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
export async function syncSplitCollection(collectionName, oldArr, newArr) {
  if (!Array.isArray(newArr)) newArr = [];
  if (!Array.isArray(oldArr)) oldArr = [];
  
  /* group entries بـday */
  const groupByDay = (arr) => {
    const m = new Map();
    arr.forEach(e => {
      const d = _getEntryDate(e);
      if (!m.has(d)) m.set(d, []);
      m.get(d).push(e);
    });
    return m;
  };
  
  const newByDay = groupByDay(newArr);
  const oldByDay = groupByDay(oldArr);
  const allDays = new Set([...newByDay.keys(), ...oldByDay.keys()]);
  
  const batch = writeBatch(db);
  let writeCount = 0;
  
  for (const date of allDays) {
    const newEntries = newByDay.get(date) || [];
    const oldEntries = oldByDay.get(date) || [];
    
    /* skip لو ما تغيرش شيء */
    if (oldEntries.length === newEntries.length &&
        JSON.stringify(oldEntries) === JSON.stringify(newEntries)) {
      continue;
    }
    
    const dayRef = doc(db, collectionName, date);
    
    if (newEntries.length === 0) {
      batch.delete(dayRef);
    } else {
      batch.set(dayRef, { 
        entries: newEntries,
        count: newEntries.length,
        updatedAt: new Date().toISOString(),
      });
    }
    writeCount++;
  }
  
  if (writeCount === 0) return 0;
  
  if (writeCount > 500) {
    console.warn(`[splitCollections] ${writeCount} writes exceeds Firestore batch limit (500). Some may fail.`);
  }
  
  await batch.commit();
  return writeCount;
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
