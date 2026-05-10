/* ═══════════════════════════════════════════════════════════════
   CLARK — Return Requests helpers (V21.9.7)
   ───────────────────────────────────────────────────────────────
   Schema for a return request:
   {
     id: "rr_<timestamp>_<rand>",
     shopify_order_id, shopify_order_number, shopify_name,
     customer: { name, phone, email, address },
     reason: "size_mismatch" | "damaged" | "not_as_described" | "wrong_item" | "other",
     reason_text: "...",
     items: [{ sku, line_item_id, title, qty, price }],
     status: "pending_review" | "approved" | "rejected" | "in_pickup"
           | "received" | "refunded" | "cancelled",
     refund_amount: number,
     refund_method: "cash" | "store_credit" | "shopify_refund",
     bosta_pickup: { delivery_id?, tracking_number?, state_code?, state_value?,
                     state_bucket?, last_state_at?, created_at? },
     created_at, updated_at,
     created_by, processed_by, processed_at,
     notes,
   }

   Storage: shopifyReturnRequests is daily-split (V21.9.7) into
   shopifyReturnRequestsDays/{YYYY-MM-DD}. Pre-migration: array in
   factory/config.shopifyReturnRequests.
   ═══════════════════════════════════════════════════════════════ */

import { getDb } from "../_firebase.js";

export const RETURN_STATUSES = [
  "pending_review",
  "approved",
  "rejected",
  "in_pickup",
  "received",
  "refunded",
  "cancelled",
];

export const RETURN_REASONS = [
  { key: "size_mismatch", label_ar: "المقاس مش مظبوط" },
  { key: "damaged", label_ar: "المنتج تالف / به عيب" },
  { key: "not_as_described", label_ar: "مختلف عن الوصف / الصور" },
  { key: "wrong_item", label_ar: "وصلني صنف خطأ" },
  { key: "changed_mind", label_ar: "غيرت رأيي" },
  { key: "other", label_ar: "سبب آخر" },
];

const SPLIT_FLAG = "_splitDaysV2197Done";
const COLLECTION = "shopifyReturnRequestsDays";

/* Generate a return-request id */
export function genRRId(){
  return "rr_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

/* Read ALL return requests across the daily collection.
   Pre-migration: from factory/config.shopifyReturnRequests array. */
export async function readAllReturnRequests(cfg){
  if(cfg && cfg[SPLIT_FLAG]){
    const db = getDb();
    const snap = await db.collection(COLLECTION).get();
    const all = [];
    snap.forEach(d => {
      const data = d.data() || {};
      const entries = Array.isArray(data.entries) ? data.entries : [];
      for(const e of entries) all.push(e);
    });
    /* Sort newest-first by created_at */
    all.sort((a, b) => {
      const ta = a?.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b?.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });
    return all;
  }
  return Array.isArray(cfg?.shopifyReturnRequests) ? cfg.shopifyReturnRequests : [];
}

/* Read a single return request by id (scans all days — cheap because
   each day-doc is small, and most requests are in the recent days). */
export async function readReturnRequestById(cfg, id){
  if(!id) return null;
  if(cfg && cfg[SPLIT_FLAG]){
    /* Try by created_at hint first if id has timestamp */
    const all = await readAllReturnRequests(cfg);
    return all.find(r => r.id === id) || null;
  }
  const arr = Array.isArray(cfg?.shopifyReturnRequests) ? cfg.shopifyReturnRequests : [];
  return arr.find(r => r.id === id) || null;
}

/* Day key for an entry — picks created_at, falls back to today UTC */
function dayKey(entry){
  const iso = entry?.created_at || new Date().toISOString();
  const d = new Date(iso);
  if(isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/* Add a NEW return request. Routes to the right day-doc post-migration,
   or appends to the array pre-migration. */
export async function addReturnRequest(cfg, entry){
  const db = getDb();
  if(cfg && cfg[SPLIT_FLAG]){
    const day = dayKey(entry);
    const ref = db.collection(COLLECTION).doc(day);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? (snap.data() || {}) : { date: day, entries: [] };
      const entries = Array.isArray(data.entries) ? data.entries.slice() : [];
      entries.unshift(entry);
      tx.set(ref, { ...data, date: day, entries, count: entries.length, updated_at: new Date().toISOString() }, { merge: true });
    });
    return;
  }
  /* Pre-migration: append to factory/config array */
  const cfgRef = db.collection("factory").doc("config");
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(cfgRef);
    const c = snap.exists ? (snap.data() || {}) : {};
    const arr = Array.isArray(c.shopifyReturnRequests) ? c.shopifyReturnRequests.slice() : [];
    arr.unshift(entry);
    tx.set(cfgRef, { shopifyReturnRequests: arr }, { merge: true });
  });
}

/* Update an existing return request by id.
   `patch` is shallow-merged on top of the existing entry.
   Re-uses created_at to find the right day-doc. */
export async function updateReturnRequest(cfg, id, patch){
  if(!id) throw new Error("id required");
  const db = getDb();
  if(cfg && cfg[SPLIT_FLAG]){
    /* Find the day-doc that contains this id. Strategy: scan recent days
       first (most likely), fall back to scanning all. */
    const snap = await db.collection(COLLECTION).get();
    let found = null;
    for(const d of snap.docs){
      const data = d.data() || {};
      const entries = Array.isArray(data.entries) ? data.entries : [];
      const idx = entries.findIndex(e => e.id === id);
      if(idx >= 0){
        found = { docRef: d.ref, data, idx };
        break;
      }
    }
    if(!found) throw new Error("return request not found: " + id);
    const updated = {
      ...found.data.entries[found.idx],
      ...patch,
      updated_at: new Date().toISOString(),
    };
    const newEntries = found.data.entries.slice();
    newEntries[found.idx] = updated;
    await found.docRef.set({
      ...found.data,
      entries: newEntries,
      updated_at: new Date().toISOString(),
    }, { merge: true });
    return updated;
  }
  /* Pre-migration */
  const cfgRef = db.collection("factory").doc("config");
  let updated = null;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(cfgRef);
    const c = snap.exists ? (snap.data() || {}) : {};
    const arr = Array.isArray(c.shopifyReturnRequests) ? c.shopifyReturnRequests.slice() : [];
    const idx = arr.findIndex(r => r.id === id);
    if(idx < 0) throw new Error("return request not found: " + id);
    arr[idx] = { ...arr[idx], ...patch, updated_at: new Date().toISOString() };
    updated = arr[idx];
    tx.set(cfgRef, { shopifyReturnRequests: arr }, { merge: true });
  });
  return updated;
}

/* Count pending-review requests — used for the notification badge. */
export async function countPendingReturnRequests(cfg){
  const all = await readAllReturnRequests(cfg);
  return all.filter(r => r.status === "pending_review").length;
}
