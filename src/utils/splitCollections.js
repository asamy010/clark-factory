/* ════════════════════════════════════════════════════════════════════════
   CLARK V16.74 + V19.49 + V19.50 — Split Collections Manager
   ════════════════════════════════════════════════════════════════════════

   ─── المشكلة ───
   factory/config كان فيه arrays بتكبر يومياً وممكن تعدي حد الـ1MB.

   ─── الحل ───
   نقسم الـarrays لـcollections يومية:
     factory/config                   ← باقي البيانات
     treasuryDays/{YYYY-MM-DD}        ← V16.74 { entries: [...] }
     auditDays/{YYYY-MM-DD}           ← V16.74
     hrLogDays/{YYYY-MM-DD}           ← V16.74
     custPaymentsDays/{YYYY-MM-DD}    ← V19.49
     supplierPaymentsDays/{YYYY-MM-DD}← V19.49
     wsPaymentsDays/{YYYY-MM-DD}      ← V19.49
     checksDays/{YYYY-MM-DD}          ← V19.49
     salesInvoicesDays/{YYYY-MM-DD}   ← V19.50 (الأكبر — كان 54% من config)
     purchaseInvoicesDays/{YYYY-MM-DD}← V19.50
     purchaseOrdersDays/{YYYY-MM-DD}  ← V19.50

   كل document ≤ ~150KB في أسوأ حالة (فواتير بيوم نشط). سنوياً = 365 ملف
   موزّعة → بدل ملف واحد كبير.

   ─── الشفافية ───
   الصفحات (TreasuryPg, HRPg, AuditPg, CustDeliverPg, PurchasePg, ExtProdPg,
   SalesInvoicesPg, PurchaseInvoicesPg) **مش محتاجة تتعدّل**.
   data.<field> يستمر يبان كـarray. الـmagic في App.jsx فقط.
   ════════════════════════════════════════════════════════════════════════ */

import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc, writeBatch
} from "firebase/firestore";
import { db } from "../firebase.js";

/* V19.49 + V19.50: Field groups by migration version — used for selective
   stripping so newly-added fields are NOT stripped from config before their
   migration runs. */
export const SPLIT_FIELDS_V1674 = ["treasury", "auditLog", "hrLog"];
export const SPLIT_FIELDS_V1949 = ["custPayments", "supplierPayments", "wsPayments", "checks"];
export const SPLIT_FIELDS_V1950 = ["salesInvoices", "purchaseInvoices", "purchaseOrders"];

export const SPLIT_FLAG_V1674 = "_splitDaysV1674Done";
export const SPLIT_FLAG_V1949 = "_splitDaysV1949Done";
export const SPLIT_FLAG_V1950 = "_splitDaysV1950Done";

/* الـcollections اللي مقسّمة من factory/config — field name → collection name */
export const SPLIT_COLLECTIONS = {
  /* V16.74 */
  treasury:  "treasuryDays",
  auditLog:  "auditDays",
  hrLog:     "hrLogDays",
  /* V19.49 */
  custPayments:     "custPaymentsDays",
  supplierPayments: "supplierPaymentsDays",
  wsPayments:       "wsPaymentsDays",
  checks:           "checksDays",
  /* V19.50 */
  salesInvoices:    "salesInvoicesDays",
  purchaseInvoices: "purchaseInvoicesDays",
  purchaseOrders:   "purchaseOrdersDays",
};

/* مفاتيح الـfields اللي مقسّمة (للحلقات السريعة) */
export const SPLIT_FIELDS = Object.keys(SPLIT_COLLECTIONS);

/* ════════════════════════════════════════════════════════════════════════
   V19.51 — Sales-doc and Tasks-doc daily splits
   ════════════════════════════════════════════════════════════════════════
   ـــ
   factory/sales كان فيه arrays بتكبر يومياً (packages, custDeliverySessions)
   factory/tasks كان فيه arrays بتكبر (tasks, stickyNotes, inventoryAudits)
   ـــ
   نفس النمط (split by day) لكن على docs مختلفة. كل doc ليه:
   - SPLIT_COLLECTIONS map خاصة بيه
   - flag خاص لتتبع الـmigration
   - upTx wrapper في App.jsx بيستدعي helpers الـgeneric
   ـــ
   factory/sales:
     packages           → packagesDays/{YYYY-MM-DD}
     custDeliverySessions → custDeliverySessionsDays/{YYYY-MM-DD}

   factory/tasks:
     tasks              → tasksDays/{YYYY-MM-DD}
     stickyNotes        → stickyNotesDays/{YYYY-MM-DD}
     inventoryAudits    → inventoryAuditsDays/{YYYY-MM-DD}
   ════════════════════════════════════════════════════════════════════════ */

export const SALES_SPLIT_COLLECTIONS = {
  packages:             "packagesDays",
  custDeliverySessions: "custDeliverySessionsDays",
};
export const SALES_SPLIT_FIELDS = Object.keys(SALES_SPLIT_COLLECTIONS);
export const SALES_SPLIT_FIELDS_V1951 = ["packages", "custDeliverySessions"];
export const SALES_SPLIT_FLAG_V1951 = "_salesSplitDaysV1951Done";

export const TASKS_SPLIT_COLLECTIONS = {
  tasks:           "tasksDays",
  stickyNotes:     "stickyNotesDays",
  inventoryAudits: "inventoryAuditsDays",
};
export const TASKS_SPLIT_FIELDS = Object.keys(TASKS_SPLIT_COLLECTIONS);
export const TASKS_SPLIT_FIELDS_V1951 = ["tasks", "stickyNotes", "inventoryAudits"];
export const TASKS_SPLIT_FLAG_V1951 = "_tasksSplitDaysV1951Done";

/* V17.1 FIX #4: Order-independent deep equality.
   JSON.stringify is order-dependent — different key insertion orders produce
   different strings even when objects are structurally identical. This causes
   false positives on "changed" detection → unnecessary writes. */
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

/* helper: استخراج YYYY-MM-DD من entry بحسب نوعه.
   V16.80: لو الـentry مفهاش date/ts/createdAt، نرجّع null بدل ما نـfallback لـtoday بصمت.
   الـcaller لازم يتعامل مع null (يرفض الـwrite، يحط warning، إلخ). */
function _getEntryDate(entry, allowFallback = false) {
  if (!entry) return allowFallback ? new Date().toISOString().slice(0, 10) : null;
  /* treasury: t.date موجود مباشرة */
  if (entry.date && /^\d{4}-\d{2}-\d{2}/.test(entry.date)) {
    return entry.date.slice(0, 10);
  }
  /* auditLog: a.ts ISO timestamp */
  if (entry.ts) {
    try {
      const d = new Date(entry.ts).toISOString().slice(0, 10);
      if (d && d !== "Invalid Date") return d;
    } catch (e) { /* fall through */ }
  }
  if (entry.createdAt) {
    try {
      const d = new Date(entry.createdAt).toISOString().slice(0, 10);
      if (d && d !== "Invalid Date") return d;
    } catch (e) { /* fall through */ }
  }
  if (allowFallback) {
    console.warn("[splitCollections] Entry without date — using today as fallback:", entry?.id);
    return new Date().toISOString().slice(0, 10);
  }
  return null;
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

/* قراءة كل collections بالتوازي (V19.49: dynamic over SPLIT_FIELDS) */
export async function readAllSplitCollections() {
  const entries = await Promise.all(
    SPLIT_FIELDS.map(f =>
      readSplitCollection(SPLIT_COLLECTIONS[f]).then(arr => [f, arr])
    )
  );
  return Object.fromEntries(entries);
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
 * V16.80 FIX #2: Detect date changes — if same id has different date in old vs new,
 *                 remove from old day AND add to new day (was duplicating before).
 * V16.80 FIX #3: Reject entries without a valid date instead of silent fallback to today.
 * 
 * Why: previously this function overwrote the day document with newEntries
 * (computed from local splitDataRef + fn changes). If splitData was incomplete
 * (listener still firing, race condition, multi-tab), the local snapshot was
 * a SUBSET of the actual server state. Writing it back wiped real entries.
 * 
 * Now the strategy is delta-based: 
 * 1. Compute which entry IDs were ADDED/REMOVED/MODIFIED in the local fn diff
 * 2. For modifications where the date changed: schedule remove from old day + add to new day
 * 3. Read each affected day document from server
 * 4. Apply ADD/REMOVE to the server's actual entries (not local)
 * 5. Write merged result back
 */
export async function syncSplitCollection(collectionName, oldArr, newArr) {
  if (!Array.isArray(newArr)) newArr = [];
  if (!Array.isArray(oldArr)) oldArr = [];
  
  /* V17.5 FIX: Auto-generate id for any entry without one. Previously these were
     silently skipped (only a console warning), causing data loss when buggy callers
     created entries without ids. Now we generate a deterministic id based on the
     entry's content + position, so the same input always produces the same id
     (preventing duplicates on retry). */
  const _genIdFor = (entry, idx) => {
    const ts = (entry?.date || entry?.ts || entry?.createdAt || "no-date").toString().slice(0, 19);
    const amt = String(entry?.amount || entry?.action || "");
    const hash = (ts + "|" + amt + "|" + idx).split("").reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
    return "auto-" + Math.abs(hash).toString(36) + "-" + idx;
  };
  newArr = newArr.map((e, i) => (e && !e.id) ? { ...e, id: _genIdFor(e, i) } : e);
  oldArr = oldArr.map((e, i) => (e && !e.id) ? { ...e, id: _genIdFor(e, i) } : e);
  
  /* index entries by id for fast diff */
  const oldById = new Map();
  oldArr.forEach(e => { if (e && e.id) oldById.set(String(e.id), e); });
  const newById = new Map();
  newArr.forEach(e => { if (e && e.id) newById.set(String(e.id), e); });
  
  /* (No more silent skipping — all entries now have ids via auto-gen above) */
  
  /* Compute deltas:
     - addedOrModified: new + modified (same id, different content)
     - removedIds: in old but not in new
     - dateChangedIds: in both, same id, but date differs (V16.80 FIX #2) */
  const addedOrModified = [];
  const removedIds = new Set();
  /* Map: id → old date (for date-changed entries — needed to remove from old day) */
  const dateChanges = new Map();
  
  for (const [id, newEntry] of newById) {
    const oldEntry = oldById.get(id);
    if (!oldEntry) {
      /* genuinely new entry */
      addedOrModified.push(newEntry);
    } else if (!_deepEqual(oldEntry, newEntry)) {
      addedOrModified.push(newEntry);
      /* V16.80 FIX #2: Detect date change */
      const oldDate = _getEntryDate(oldEntry, true);
      const newDate = _getEntryDate(newEntry, true);
      if (oldDate && newDate && oldDate !== newDate) {
        dateChanges.set(id, oldDate);
      }
    }
  }
  for (const id of oldById.keys()) {
    if (!newById.has(id)) removedIds.add(id);
  }
  
  /* No changes at all? */
  if (addedOrModified.length === 0 && removedIds.size === 0) return 0;
  
  /* V16.80 FIX #3: Group adds/mods by day. Reject entries without valid date. */
  const addsByDay = new Map();
  const rejectedNoDate = [];
  for (const entry of addedOrModified) {
    const date = _getEntryDate(entry, false);/* strict — no fallback */
    if (!date) {
      rejectedNoDate.push(entry?.id || "?");
      continue;
    }
    if (!addsByDay.has(date)) addsByDay.set(date, []);
    addsByDay.get(date).push(entry);
  }
  if (rejectedNoDate.length > 0) {
    console.error(`[splitCollections] ${collectionName}: REJECTED ${rejectedNoDate.length} entries without valid date — ids:`, rejectedNoDate);
    /* The entries are kept in the local state but not written to day docs.
       The user's UI will show a stale version. This is by design — we'd rather
       have visible inconsistency than silent corruption (entries written to wrong day). */
  }
  
  /* Group removes by day */
  const removesByDay = new Map();
  for (const id of removedIds) {
    const oldEntry = oldById.get(id);
    if (!oldEntry) continue;
    const date = _getEntryDate(oldEntry, true);/* fallback OK for old entries */
    if (!date) continue;
    if (!removesByDay.has(date)) removesByDay.set(date, new Set());
    removesByDay.get(date).add(id);
  }
  
  /* V16.80 FIX #2: For date-changed entries, also remove from the OLD day */
  for (const [id, oldDate] of dateChanges) {
    if (!removesByDay.has(oldDate)) removesByDay.set(oldDate, new Set());
    removesByDay.get(oldDate).add(id);
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
          /* Already handled above (rejected) — defensive only */
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

/* V19.49 + V19.50: Selective strip — only strips field-groups whose migration
   has run. Critical: until a group's migration completes, its fields MUST stay
   in config — otherwise the next write would silently delete them before they're
   moved to day collections.

   Behavior:
   - V16.74 fields stripped only if _splitDaysV1674Done is set on configObj
   - V19.49 fields stripped only if _splitDaysV1949Done is set on configObj
   - V19.50 fields stripped only if _splitDaysV1950Done is set on configObj
   This makes the function self-contained: pass any config object and it does the
   right thing based on the flags it carries. */
export function stripSplitArrays(configObj) {
  if (!configObj) return configObj;
  const stripped = { ...configObj };
  if (configObj[SPLIT_FLAG_V1674]) {
    for (const field of SPLIT_FIELDS_V1674) delete stripped[field];
  }
  if (configObj[SPLIT_FLAG_V1949]) {
    for (const field of SPLIT_FIELDS_V1949) delete stripped[field];
  }
  if (configObj[SPLIT_FLAG_V1950]) {
    for (const field of SPLIT_FIELDS_V1950) delete stripped[field];
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
    /* V17.1 FIX #4: deep equality instead of JSON.stringify */
    if (oldArr.length === newArr.length && _deepEqual(oldArr, newArr)) continue;
    
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
  /* V19.49: dynamic over SPLIT_FIELDS — adding a new field auto-includes here. */
  const entries = await Promise.all(
    SPLIT_FIELDS.map(f =>
      getSplitCollectionStats(SPLIT_COLLECTIONS[f]).then(stats => [f, stats])
    )
  );
  return Object.fromEntries(entries);
}

/* ════════════════════════════════════════════════════════════════════════
   V19.51 — Generic helpers + sales-doc / tasks-doc wrappers
   ════════════════════════════════════════════════════════════════════════
   نفس الـengine بس على docs غير factory/config. السبب: factory/sales و
   factory/tasks ليهم arrays بتكبر يومياً (packages, custDeliverySessions,
   tasks, stickyNotes, inventoryAudits) — لازم نحميهم من حد 1MB كمان.

   الـAPIs:
   - sync*  → syncDocSplitChanges(oldDoc, newDoc, collectionsMap)
   - strip* → stripDocFieldGroups(docObj, groups)
   - read*  → readDocSplits(collectionsMap)
   - stats* → getDocSplitStats(collectionsMap)
   ════════════════════════════════════════════════════════════════════════ */

/* GENERIC: diff two doc-objects across an arbitrary fields→collections map. */
async function syncDocSplitChanges(oldDoc, newDoc, collectionsMap) {
  const fields = Object.keys(collectionsMap);
  const tasks = [];
  for (const field of fields) {
    const oldArr = oldDoc?.[field] || [];
    const newArr = newDoc?.[field] || [];
    if (oldArr === newArr) continue;
    if (oldArr.length === newArr.length && _deepEqual(oldArr, newArr)) continue;
    tasks.push(syncSplitCollection(collectionsMap[field], oldArr, newArr));
  }
  if (tasks.length === 0) return;
  await Promise.all(tasks);
}

/* GENERIC: strip fields whose migration-flag is set on docObj. */
function stripDocFieldGroups(docObj, groups /* [{fields, flag}] */) {
  if (!docObj) return docObj;
  const stripped = { ...docObj };
  for (const g of groups) {
    if (docObj[g.flag]) {
      for (const f of g.fields) delete stripped[f];
    }
  }
  return stripped;
}

/* GENERIC: read all collections in a fields→collections map in parallel. */
async function readDocSplits(collectionsMap) {
  const fields = Object.keys(collectionsMap);
  const entries = await Promise.all(
    fields.map(f =>
      readSplitCollection(collectionsMap[f]).then(arr => [f, arr])
    )
  );
  return Object.fromEntries(entries);
}

/* GENERIC: stats per collection in a map. */
async function getDocSplitStats(collectionsMap) {
  const fields = Object.keys(collectionsMap);
  const entries = await Promise.all(
    fields.map(f =>
      getSplitCollectionStats(collectionsMap[f]).then(stats => [f, stats])
    )
  );
  return Object.fromEntries(entries);
}

/* ─── factory/sales wrappers ──────────────────────────────────────────── */

const SALES_SPLIT_GROUPS = [
  { fields: SALES_SPLIT_FIELDS_V1951, flag: SALES_SPLIT_FLAG_V1951 },
];

export function stripSalesSplitArrays(salesObj) {
  return stripDocFieldGroups(salesObj, SALES_SPLIT_GROUPS);
}

export async function syncAllSalesSplitChanges(oldSales, newSales) {
  return syncDocSplitChanges(oldSales, newSales, SALES_SPLIT_COLLECTIONS);
}

export async function readAllSalesSplitCollections() {
  return readDocSplits(SALES_SPLIT_COLLECTIONS);
}

export async function getAllSalesSplitStats() {
  return getDocSplitStats(SALES_SPLIT_COLLECTIONS);
}

/* ─── factory/tasks wrappers ──────────────────────────────────────────── */

const TASKS_SPLIT_GROUPS = [
  { fields: TASKS_SPLIT_FIELDS_V1951, flag: TASKS_SPLIT_FLAG_V1951 },
];

export function stripTasksSplitArrays(tasksObj) {
  return stripDocFieldGroups(tasksObj, TASKS_SPLIT_GROUPS);
}

export async function syncAllTasksSplitChanges(oldTasks, newTasks) {
  return syncDocSplitChanges(oldTasks, newTasks, TASKS_SPLIT_COLLECTIONS);
}

export async function readAllTasksSplitCollections() {
  return readDocSplits(TASKS_SPLIT_COLLECTIONS);
}

export async function getAllTasksSplitStats() {
  return getDocSplitStats(TASKS_SPLIT_COLLECTIONS);
}
