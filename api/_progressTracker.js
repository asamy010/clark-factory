/* ═══════════════════════════════════════════════════════════════
   CLARK — Server-side Progress Tracker (V21.9.4)
   ───────────────────────────────────────────────────────────────
   Provides job-progress reporting via Firestore docs that the client
   can subscribe to. The pattern:

     1. Client generates a `jobId` (random UUID) and opens an overlay
        listening to `syncJobs/{jobId}` via onSnapshot.
     2. Client calls a Shopify/Bosta endpoint passing `jobId` in body.
     3. Server creates the job doc, then calls update() periodically
        as work proceeds. Throttled to ≤ 1 write/sec to stay under
        Firestore quota.
     4. Server completes the job (success or failure) when done.
     5. Client overlay sees the completion and closes.

   The job doc shape:
     {
       id, type, label,
       status: "running" | "done" | "error" | "cancelled",
       progress, total, percent,
       message, sub_message?,
       started_at, updated_at, finished_at?,
       result?: <any>,
       error?: { message, stack? },
       by: <email|uid>,
     }

   Usage in an endpoint:
     import { withProgress } from "../_progressTracker.js";
     return withProgress(req, res, {
       jobId,
       type: "shopify-sync-products",
       label: "سحب منتجات Shopify",
       total: 0,  // optional, can be set later
       by: auth.email,
     }, async (update) => {
       // ... work ...
       await update({ progress: 50, total: 100, message: "جاري معالجة المنتجات" });
       // ... more work ...
       return { ok: true, total: 100 };  // returned to client AND saved to job.result
     });
   ═══════════════════════════════════════════════════════════════ */

import { getDb } from "./_firebase.js";

const JOBS_COLLECTION = "syncJobs";
const MIN_UPDATE_INTERVAL_MS = 1000; /* throttle to 1 write per second */
const JOB_TTL_MS = 24 * 3600 * 1000; /* old jobs auto-cleaned by cron */

/* Generate a job id if the caller didn't provide one */
export function genJobId(){
  return "job_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
}

/* Create a new job doc.
   Returns the doc reference + an `update` function (throttled) + `complete`. */
export async function createJob(jobId, init){
  const db = getDb();
  const ref = db.collection(JOBS_COLLECTION).doc(jobId);
  const startedAt = new Date().toISOString();
  await ref.set({
    id: jobId,
    type: init.type || "unknown",
    label: init.label || "...",
    status: "running",
    progress: 0,
    total: Number(init.total) || 0,
    percent: 0,
    message: init.message || "بدء العملية...",
    started_at: startedAt,
    updated_at: startedAt,
    finished_at: null,
    by: init.by || "system",
  });

  let lastWriteAt = 0;
  let pendingUpdate = null;
  let pendingTimer = null;
  let cancelled = false;
  /* V21.9.11: track Firestore write failures so persistent connectivity
     issues surface in logs instead of being completely silent. We don't
     reject from `update()` (callers shouldn't have to handle progress-write
     errors), but a flat-line at "بدء العملية..." is the worst UX. */
  let silentErrCount = 0;
  const SILENT_ERR_LOG_THRESHOLD = 3;

  const safeWrite = async (data) => {
    try {
      await ref.set(data, { merge: true });
      if(silentErrCount > 0) silentErrCount = 0; /* recovered */
    } catch(e){
      silentErrCount++;
      if(silentErrCount === SILENT_ERR_LOG_THRESHOLD){
        console.warn(
          "[progressTracker] job " + jobId + ": " + silentErrCount +
          " consecutive update writes failed — overlay may be stale. Last err:",
          (e && e.message) || e
        );
      }
    }
  };

  /* Throttled update — coalesces multiple updates into 1/sec.
     V21.9.11: every write path re-checks `cancelled` so a delayed timer
     can't fire AFTER `complete()` and overwrite the final state. */
  const update = async (patch) => {
    if(cancelled) return;
    const merged = {
      ...(patch || {}),
      updated_at: new Date().toISOString(),
    };
    if(typeof merged.progress === "number" && typeof merged.total === "number" && merged.total > 0){
      merged.percent = Math.min(100, Math.round((merged.progress / merged.total) * 100));
    } else if(typeof merged.percent === "number"){
      merged.percent = Math.min(100, Math.max(0, Math.round(merged.percent)));
    }
    pendingUpdate = { ...(pendingUpdate || {}), ...merged };
    const now = Date.now();
    const wait = MIN_UPDATE_INTERVAL_MS - (now - lastWriteAt);
    if(wait <= 0){
      lastWriteAt = now;
      const data = pendingUpdate;
      pendingUpdate = null;
      /* Re-check cancelled — `complete()` may have flipped it during the
         async micro-tasks above (timestamp construction, percent math). */
      if(cancelled) return;
      await safeWrite(data);
    } else {
      /* Schedule a delayed flush */
      if(!pendingTimer){
        pendingTimer = setTimeout(async () => {
          pendingTimer = null;
          if(cancelled) return; /* race fix: complete() may have flushed already */
          if(!pendingUpdate) return;
          lastWriteAt = Date.now();
          const data = pendingUpdate;
          pendingUpdate = null;
          await safeWrite(data);
        }, wait);
      }
    }
  };

  /* Force-flush any pending throttled update before completion */
  const flushPending = async () => {
    if(pendingTimer){ clearTimeout(pendingTimer); pendingTimer = null; }
    if(pendingUpdate){
      const data = pendingUpdate;
      pendingUpdate = null;
      await safeWrite(data);
    }
  };

  /* Mark complete with success/failure.
     V21.9.11: flip `cancelled` BEFORE flushPending so any timer that fires
     mid-flush sees the flag and bails out. */
  const complete = async (status, payload) => {
    cancelled = true;
    if(pendingTimer){ clearTimeout(pendingTimer); pendingTimer = null; }
    pendingUpdate = null; /* drop any queued throttled patch — `final` supersedes */
    const finishedAt = new Date().toISOString();
    const final = {
      status,
      finished_at: finishedAt,
      updated_at: finishedAt,
      percent: status === "done" ? 100 : (payload?.percent || 0),
    };
    if(status === "done"){
      final.message = payload?.message || "تم بنجاح";
      if(payload?.result !== undefined) final.result = payload.result;
    } else if(status === "error"){
      final.message = payload?.message || "فشل العملية";
      final.error = {
        message: String(payload?.error?.message || payload?.error || "unknown error").slice(0, 500),
        ...(payload?.error?.stack ? { stack: String(payload.error.stack).slice(0, 2000) } : {}),
      };
    } else {
      final.message = payload?.message || status;
    }
    try { await ref.set(final, { merge: true }); } catch(e){
      console.warn("[progressTracker] complete() write failed for job " + jobId + ":", (e && e.message) || e);
    }
    return final;
  };

  return { ref, update, complete, jobId };
}

/* High-level wrapper: takes care of req→res lifecycle + job creation + error
   trapping. Use this from any endpoint that wants progress reporting.

   The job is created BEFORE the handler runs, so the client (which is
   already subscribed) sees an immediate "running" state. The handler
   gets the `update` function as its only arg.

   On success, returns { ok: true, jobId, ...result } as the HTTP response.
   On failure, returns { ok: false, jobId, error } with appropriate status.

   Caller should NOT call res.json() themselves — withProgress handles it. */
export async function withProgress(req, res, init, handler){
  const jobId = init.jobId || genJobId();
  let job;
  try {
    job = await createJob(jobId, init);
  } catch(e){
    /* Couldn't even create the job doc — fall back to running without progress */
    console.warn("[progressTracker] createJob failed:", e.message);
    try {
      const result = await handler(async () => {});
      return res.status(200).json({ ok: true, jobId: null, no_progress: true, ...(result || {}) });
    } catch(err){
      return res.status(500).json({ ok: false, error: err.message || String(err) });
    }
  }

  try {
    const result = await handler(job.update);
    await job.complete("done", { result, message: result?.message || "تم بنجاح" });
    return res.status(200).json({ ok: true, jobId, ...(result || {}) });
  } catch(err){
    await job.complete("error", { error: err, message: err.message || "فشل" });
    /* Determine the HTTP status from the error if possible */
    const status = err.statusCode || err.status || 500;
    return res.status(status).json({
      ok: false,
      jobId,
      error: err.message || String(err),
    });
  }
}

/* Standalone: mark a job as cancelled. Used by client cancel button. */
export async function cancelJob(jobId, reason){
  if(!jobId) return;
  const db = getDb();
  try {
    await db.collection(JOBS_COLLECTION).doc(jobId).set({
      status: "cancelled",
      message: reason || "تم الإلغاء بواسطة المستخدم",
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { merge: true });
  } catch(_){}
}

/* Cleanup: delete jobs older than JOB_TTL_MS. Call from a cron. */
export async function cleanupOldJobs(){
  const db = getDb();
  const cutoff = new Date(Date.now() - JOB_TTL_MS).toISOString();
  try {
    const snap = await db.collection(JOBS_COLLECTION)
      .where("started_at", "<", cutoff)
      .limit(500)
      .get();
    if(snap.empty) return 0;
    const batch = db.batch();
    snap.forEach(d => batch.delete(d.ref));
    await batch.commit();
    return snap.size;
  } catch(e){
    console.warn("[progressTracker] cleanup failed:", e.message);
    return 0;
  }
}
