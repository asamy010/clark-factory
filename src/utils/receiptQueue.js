/* ═══════════════════════════════════════════════════════════════
   CLARK - Receipt Queue
   
   V15.25: Persistent local queue for salary receipt confirmations.
   
   Purpose: Ensures no receipt is ever lost, even if:
     • Network fails mid-scan
     • Firestore transaction conflicts occur
     • User closes the tab before Firestore sync completes
     • Rapid scanning causes race conditions
   
   How it works:
     1. Every scan is written to localStorage FIRST (instant, zero-delay)
     2. A background worker attempts to push the queue to Firestore every 500ms
     3. Successfully-synced entries are removed from the queue
     4. Failed entries retry with exponential backoff
     5. The UI merges Firestore + queue for unified display
   ═══════════════════════════════════════════════════════════════ */

const STORAGE_KEY="clark_receipt_queue_v1";

/* Safely read the queue from localStorage. Returns {} on any error. */
function _read(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    if(!raw)return{};
    const parsed=JSON.parse(raw);
    return(parsed&&typeof parsed==="object")?parsed:{};
  }catch(e){
    console.warn("[receiptQueue] read failed:",e);
    return{};
  }
}

/* Safely write the queue to localStorage. Swallows quota errors gracefully. */
function _write(q){
  try{
    localStorage.setItem(STORAGE_KEY,JSON.stringify(q));
    return true;
  }catch(e){
    console.error("[receiptQueue] write failed (quota?):",e);
    return false;
  }
}

/* Add a receipt to the queue. Idempotent — if (weekId, empId) already exists, it is overwritten.
   data shape: {at, by, verifiedAt, verifiedBy, mode}
   Returns true on success, false if localStorage is unavailable. */
export function addReceipt(weekId,empId,data){
  if(!weekId||!empId)return false;
  const q=_read();
  if(!q[weekId])q[weekId]={};
  q[weekId][empId]={
    ...data,
    _queuedAt:Date.now(),
    _retries:0,
    _nextAttempt:Date.now(),
  };
  return _write(q);
}

/* Remove a receipt from the queue (after successful Firestore commit). */
export function removeReceipt(weekId,empId){
  if(!weekId||!empId)return false;
  const q=_read();
  if(q[weekId]&&q[weekId][empId]){
    delete q[weekId][empId];
    if(Object.keys(q[weekId]).length===0)delete q[weekId];
    return _write(q);
  }
  return true;/* already not in queue */
}

/* Get all pending receipts across all weeks. Returns array of {weekId, empId, data}. */
export function getAllPending(){
  const q=_read();
  const out=[];
  Object.keys(q).forEach(weekId=>{
    Object.keys(q[weekId]||{}).forEach(empId=>{
      out.push({weekId,empId,data:q[weekId][empId]});
    });
  });
  return out;
}

/* Get pending receipts for a specific week. Returns {empId: data}. */
export function getPendingForWeek(weekId){
  if(!weekId)return{};
  const q=_read();
  return q[weekId]||{};
}

/* Get pending receipts ready for retry (nextAttempt <= now). */
export function getReadyForRetry(){
  const now=Date.now();
  return getAllPending().filter(r=>(r.data._nextAttempt||0)<=now);
}

/* Mark a receipt as failed — increments retry counter and schedules next attempt.
   Exponential backoff: 500ms, 1s, 2s, 4s, 8s, capped at 10s.
   After 10 retries, returns {permanentlyFailed: true} — caller should alert user. */
export function markAsFailed(weekId,empId){
  if(!weekId||!empId)return{permanentlyFailed:false};
  const q=_read();
  if(!q[weekId]||!q[weekId][empId])return{permanentlyFailed:false};
  const entry=q[weekId][empId];
  entry._retries=(entry._retries||0)+1;
  /* Exponential backoff, capped at 10 seconds */
  const delayMs=Math.min(500*Math.pow(2,entry._retries-1),10000);
  entry._nextAttempt=Date.now()+delayMs;
  entry._lastFailedAt=Date.now();
  _write(q);
  return{permanentlyFailed:entry._retries>=10,retries:entry._retries};
}

/* Count helpers for UI indicators. */
export function getPendingCount(weekId){
  if(weekId){
    return Object.keys(getPendingForWeek(weekId)).length;
  }
  return getAllPending().length;
}

export function getFailedCount(weekId){
  const pending=weekId?Object.values(getPendingForWeek(weekId)):getAllPending().map(p=>p.data);
  return pending.filter(d=>(d._retries||0)>=3).length;/* 3+ retries = likely problematic */
}

/* Force-reset all retry counters (e.g. "retry now" button) — sets nextAttempt to now. */
export function forceRetryAll(weekId){
  const q=_read();
  const target=weekId?{[weekId]:q[weekId]||{}}:q;
  Object.keys(target).forEach(wId=>{
    Object.keys(target[wId]||{}).forEach(eId=>{
      if(q[wId]&&q[wId][eId]){
        q[wId][eId]._nextAttempt=Date.now();
        /* Don't reset _retries — preserve history for visibility */
      }
    });
  });
  return _write(q);
}

/* Emergency clear — only use if queue is corrupted and you want to start fresh.
   WARNING: This will cause any unsent receipts to be lost. Only call with user confirmation. */
export function clearQueue(weekId){
  if(weekId){
    const q=_read();
    if(q[weekId]){delete q[weekId];return _write(q)}
    return true;
  }
  try{localStorage.removeItem(STORAGE_KEY);return true}catch(e){return false}
}
