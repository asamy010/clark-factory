/* ═══════════════════════════════════════════════════════════════
   CLARK - Data Limits Utility (V15.5 → V19.65 hardened)

   Caps large arrays in factory/config to stay under Firestore 1MB.
   Must be called inside upConfig callbacks before write.

   ─── V19.65 CRITICAL BUGFIX ───────────────────────────────────────
   Pre-V19.65 enforceDataLimits truncated split-migrated fields too
   (treasury, hrLog, custPayments, salesInvoices, etc.). Once those
   fields moved to day-docs (V16.74 / V19.49 / V19.50 / V19.52 / V19.53),
   the merged `next.treasury` (full hydrated array, possibly 10K+ entries)
   went through enforceDataLimits → truncated to 3000 → syncAllSplitChanges
   diff saw 7K IDs in `before` but missing in `after` → issued deleteDoc()
   for all of them → SILENTLY destroyed years of history.

   Fix: skip any field that has migrated to a day-split collection. Day-docs
   don't have a 1MB total limit (each day doc has ~hundreds of entries max
   in practice). Only legacy (pre-migration) fields still in factory/config
   need the cap.
   ═══════════════════════════════════════════════════════════════ */

import {
  SPLIT_FIELDS_V1674, SPLIT_FIELDS_V1949, SPLIT_FIELDS_V1950, SPLIT_FIELDS_V1952, SPLIT_FIELDS_V1953, SPLIT_FIELDS_V2195, SPLIT_FIELDS_V2197, SPLIT_FIELDS_V2198,
  SPLIT_FLAG_V1674, SPLIT_FLAG_V1949, SPLIT_FLAG_V1950, SPLIT_FLAG_V1952, SPLIT_FLAG_V1953, SPLIT_FLAG_V2195, SPLIT_FLAG_V2197, SPLIT_FLAG_V2198,
} from "./splitCollections.js";

const LIMITS = {
  stockMovements: 2000,
  notifications: 500,
  hrLog: 2000,
  custPayments: 3000,
  supplierPayments: 3000,
  wsPayments: 3000,
  checks: 1000,
  auditLog: 5000, /* already capped in addAudit but safe to enforce here too */
  treasury: 3000,
};

/* Build the set of migrated fields (where the array lives in day-docs, not config). */
function _migratedFields(d){
  const set = new Set();
  if (!d) return set;
  if (d[SPLIT_FLAG_V1674]) SPLIT_FIELDS_V1674.forEach(f => set.add(f));
  if (d[SPLIT_FLAG_V1949]) SPLIT_FIELDS_V1949.forEach(f => set.add(f));
  if (d[SPLIT_FLAG_V1950]) SPLIT_FIELDS_V1950.forEach(f => set.add(f));
  if (d[SPLIT_FLAG_V1952]) SPLIT_FIELDS_V1952.forEach(f => set.add(f));
  if (d[SPLIT_FLAG_V1953]) SPLIT_FIELDS_V1953.forEach(f => set.add(f));
  if (d[SPLIT_FLAG_V2195]) SPLIT_FIELDS_V2195.forEach(f => set.add(f));
  if (d[SPLIT_FLAG_V2197]) SPLIT_FIELDS_V2197.forEach(f => set.add(f));
  if (d[SPLIT_FLAG_V2198]) SPLIT_FIELDS_V2198.forEach(f => set.add(f));
  return set;
}

/* Call this inside any upConfig callback to keep data trim.
   V19.65: skips fields that have migrated to day-split collections. */
export function enforceDataLimits(d){
  if(!d)return;
  const skip = _migratedFields(d);
  Object.entries(LIMITS).forEach(([key,limit])=>{
    /* V19.65: silently skip migrated fields — day-docs don't need the 1MB cap.
       Truncating here would cause syncAllSplitChanges to delete the missing
       entries from server day-docs (silent data destruction). */
    if (skip.has(key)) return;
    const arr=d[key];
    if(Array.isArray(arr)&&arr.length>limit){
      /* Keep most recent entries. Assume newer entries are at the start (unshift pattern) */
      /* If the list uses push pattern, keep the end */
      /* Check by looking at first vs last entry's timestamp/date */
      if(arr.length>=2){
        const first=arr[0];const last=arr[arr.length-1];
        const firstTime=first&&(first.ts||first.date||first.createdAt||"");
        const lastTime=last&&(last.ts||last.date||last.createdAt||"");
        if(firstTime&&lastTime&&firstTime<lastTime){
          /* Oldest first → keep last N */
          d[key]=arr.slice(-limit);
        } else {
          /* Newest first → keep first N */
          d[key]=arr.slice(0,limit);
        }
      } else {
        d[key]=arr.slice(0,limit);
      }
    }
  });
}

export{LIMITS};
