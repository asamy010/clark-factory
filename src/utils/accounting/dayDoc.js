/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · accountingDays Collection I/O
   ───────────────────────────────────────────────────────────────────────
   Each document in the `accountingDays` collection represents one day of
   journal entries, keyed by ISO date string (YYYY-MM-DD).

   Document shape:
   {
     date: "2026-04-29",
     entries: [
       {
         id: gid,
         refNo: "JE-2026-0042",            // human-readable, sequential
         narration: "بيع للعميل ...",
         sourceType: "manual" | "sale" | "saleReturn" | "customerPay" | ...,
         sourceId: "<id of the source operation, if auto-posted>",
         lines: [
           { accountId: "<coaId>", accountCode: "1210", debit: 4000, credit: 0, partyId?: "...", partyName?: "..." },
           { accountId: "<coaId>", accountCode: "4100", debit: 0, credit: 4000 }
         ],
         status: "posted" | "void",
         voidedBy?: "<entryId of reversal>",
         voidsEntry?: "<entryId being reversed>",
         createdAt: ISO,
         createdBy: string,
         editedAt?: ISO,
         editedBy?: string,
       }
     ]
   }

   All writes use Firestore transactions to prevent lost updates when
   multiple operations target the same day.
   ═══════════════════════════════════════════════════════════════════════ */

import { doc, getDoc, setDoc, runTransaction } from "firebase/firestore";
import { db } from "../../firebase";

const COLLECTION = "accountingDays";

/* Coerce any date input (Date, ISO, "2026-04-29") to "YYYY-MM-DD". */
export function toDayId(d){
  if(!d) return new Date().toISOString().split("T")[0];
  if(typeof d === "string"){
    /* Assume it's already YYYY-MM-DD or contains it */
    const m = d.match(/^(\d{4}-\d{2}-\d{2})/);
    if(m) return m[1];
  }
  const dt = (d instanceof Date) ? d : new Date(d);
  if(isNaN(dt.getTime())) return new Date().toISOString().split("T")[0];
  /* Use local-date components to avoid TZ flips at midnight */
  const y  = dt.getFullYear();
  const mo = String(dt.getMonth()+1).padStart(2,"0");
  const da = String(dt.getDate()).padStart(2,"0");
  return `${y}-${mo}-${da}`;
}

/* Read one day's document. Returns {date, entries} or null if missing. */
export async function readDay(date){
  const id = toDayId(date);
  const ref = doc(db, COLLECTION, id);
  try {
    const snap = await getDoc(ref);
    if(!snap.exists()) return {date:id, entries:[]};
    const d = snap.data();
    return {date:id, entries: Array.isArray(d.entries) ? d.entries : []};
  } catch(e){
    console.error("[CLARK accounting] readDay failed:", id, e);
    return null;
  }
}

/* Read multiple days within an inclusive range [from, to]. Concurrent. */
export async function readDayRange(fromDate, toDate){
  const from = toDayId(fromDate);
  const to   = toDayId(toDate);
  /* Build the list of day-ids between from..to inclusive */
  const ids = [];
  const cur = new Date(from);
  const end = new Date(to);
  while(cur <= end){
    ids.push(toDayId(cur));
    cur.setDate(cur.getDate()+1);
    if(ids.length > 366*5){ /* safety cap: 5 years */
      console.warn("[CLARK accounting] readDayRange capped at 5 years"); break;
    }
  }
  /* Fire all reads in parallel */
  const results = await Promise.all(ids.map(id => readDay(id)));
  return results.filter(Boolean);
}

/* Atomically append/update/remove an entry on a specific day.
   `mutator(entries)` is a function that returns the new entries array.
   Wrapped in a Firestore transaction to prevent races. */
export async function mutateDay(date, mutator){
  const id = toDayId(date);
  const ref = doc(db, COLLECTION, id);
  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.exists() ? (snap.data().entries||[]) : [];
    const next = mutator(cur);
    if(!Array.isArray(next)) throw new Error("mutator must return an array");
    tx.set(ref, {date:id, entries:next, updatedAt: new Date().toISOString()});
    return next;
  });
}

/* Helper: append a single entry. */
export async function appendEntry(entry){
  if(!entry || !entry.date) throw new Error("entry.date is required");
  return await mutateDay(entry.date, (cur) => [...cur, entry]);
}

/* Helper: replace an entry in-place (matched by id). Throws if not found. */
export async function replaceEntry(date, entryId, newEntry){
  return await mutateDay(date, (cur) => {
    const idx = cur.findIndex(e => e.id === entryId);
    if(idx < 0) throw new Error(`Entry ${entryId} not found on ${date}`);
    const next = [...cur];
    next[idx] = newEntry;
    return next;
  });
}

/* Helper: void an entry (mark status:'void' and optionally link a reversal).
   We never hard-delete entries — audit trail must survive. */
export async function voidEntry(date, entryId, voidedByEntryId){
  return await mutateDay(date, (cur) => cur.map(e =>
    e.id === entryId ? {...e, status:"void", voidedBy: voidedByEntryId, voidedAt: new Date().toISOString()} : e
  ));
}

/* Look for an existing auto-posted entry by sourceType+sourceId.
   Returns {date, entry} or null. Used by the posting engine for idempotency.
   This requires a known date (since entries are partitioned per-day) — when
   the source operation might have been posted on a different date, the
   caller should pass the *operation's* date, which we use as posting date. */
export async function findEntryBySource(date, sourceType, sourceId){
  if(!sourceType || !sourceId) return null;
  const d = await readDay(date);
  if(!d) return null;
  const entry = (d.entries||[]).find(e =>
    e.sourceType === sourceType && e.sourceId === sourceId && e.status !== "void"
  );
  return entry ? {date: d.date, entry} : null;
}
