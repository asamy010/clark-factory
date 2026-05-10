/* ═══════════════════════════════════════════════════════════════════════
   CLARK · syncProgress utility (V21.9.4)
   ───────────────────────────────────────────────────────────────────────
   Wraps any async operation (typically a Shopify/Bosta sync call) with:
     • Auto-generated jobId
     • Full-screen progress overlay (locks UI)
     • Subscribes to syncJobs/{jobId} for live progress
     • Comprehensive error handling — never crashes the app
     • Auto-dismiss on success, manual dismiss on error

   Usage:
     import { runWithProgress } from "../utils/syncProgress.js";
     import { shopifySyncOrdersNow } from "./shopify/shopifyClient.js";

     const result = await runWithProgress({
       label: "سحب طلبات Shopify",
       type: "shopify-sync-orders",
       fn: (jobId) => shopifySyncOrdersNow({ ...opts, jobId }, user),
     });
     if(result?.ok){ ... }

   The endpoint must accept `jobId` in its body and use the server-side
   `withProgress` helper from api/_progressTracker.js to report progress.
   ═══════════════════════════════════════════════════════════════════════ */

import { startSyncProgress, dismissSyncProgress } from "../components/SyncProgressOverlay.jsx";

function genId(){
  return "job_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
}

/* Run an async function under the progress overlay.
   Always resolves to a result object — NEVER throws.
   On error, returns { ok: false, error: <message> } so callers can branch
   without try/catch boilerplate.

   Args:
     label:      string  — Arabic label shown in the overlay header
     type:       string  — analytic tag (e.g. "shopify-sync-orders")
     fn:         (jobId) => Promise<result>  — the async work
     allowCancel:bool    — whether to show a Cancel button (default true)
     onSuccess:  (result) => void  — optional callback after dismiss
     onError:    (error) => void   — optional callback on error
*/
export async function runWithProgress({
  label,
  type,
  fn,
  allowCancel = true,
  onSuccess,
  onError,
}){
  const jobId = genId();

  /* Show the overlay immediately — even before the request is sent —
     so the user gets instant feedback and the UI is locked during the
     network round-trip. */
  startSyncProgress({
    jobId,
    label: label || "جاري التنفيذ...",
    type: type || "generic",
    allowCancel,
  });

  let result = null;
  let error = null;
  try {
    result = await fn(jobId);
    /* If the function didn't return an object with ok:true, treat as failure */
    if(!result || result.ok === false){
      error = result?.error || "العملية فشلت بدون رسالة";
      result = null;
    }
  } catch(e){
    /* Network error / fetch failure / SDK timeout */
    error = e?.message || String(e) || "خطأ غير معروف";
    /* Don't dismiss yet — keep the overlay so the server's error message
       (already in the job doc) is shown to the user. The onSnapshot will
       have updated the doc with the failure state. */
    /* But if our own fetch failed before the server even started, we need
       to surface that — overwrite the job doc state. Best effort. */
    try {
      const { db } = await import("../firebase.js");
      const { doc, setDoc } = await import("firebase/firestore");
      await setDoc(doc(db, "syncJobs", jobId), {
        status: "error",
        message: error,
        error: { message: error },
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { merge: true });
    } catch(_){ /* if even this fails, the overlay will show "still running"
                   — at least the user can manually close. */ }
  }

  if(error){
    /* Leave the overlay visible — user dismisses manually after seeing the error */
    if(typeof onError === "function") onError(error);
    return { ok: false, error };
  }

  /* Success — overlay auto-dismisses (handled by SyncProgressOverlay
     useEffect when status becomes "done"). Just call the callback. */
  if(typeof onSuccess === "function") onSuccess(result);
  return { ok: true, ...result };
}

/* Lower-level helper for endpoints that don't (yet) report progress.
   Shows the overlay with indeterminate bar; dismisses on completion. */
export async function runWithSimpleSpinner({ label, type, fn, allowCancel = false, onSuccess, onError }){
  return runWithProgress({ label, type, fn, allowCancel, onSuccess, onError });
}
