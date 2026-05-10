/* ═══════════════════════════════════════════════════════════════════════
   CLARK · SyncProgressOverlay (V21.9.4)
   ───────────────────────────────────────────────────────────────────────
   Full-screen modal that locks the UI during a sync/pull operation.
   Subscribes to syncJobs/{jobId} via Firestore onSnapshot and shows:
     • Progress bar (% complete or indeterminate)
     • Current step / message (Arabic)
     • Sub-message (e.g. "12 من 50 منتج")
     • Elapsed time
     • Cancel button (best-effort — server should respect status="cancelled")
     • Error state (red, with retry option) if the job fails

   The overlay is rendered globally (mounted in App.jsx). To trigger it,
   any code calls `runWithProgress({ ... })` from utils/syncProgress.js,
   which:
     1. Generates a jobId.
     2. Dispatches an event "clark-sync-start" with the job metadata.
     3. The overlay listens to this event, mounts itself, and starts
        the Firestore listener.
     4. The work fn runs (the Shopify endpoint).
     5. Endpoint completes → job doc has status="done"/"error".
     6. Overlay shows the final state, then dismisses (auto for success,
        manual for error).

   Lock semantics:
     • z-index 99999 (above everything)
     • Backdrop covers full viewport
     • pointer-events on backdrop = auto (intercepts clicks)
     • Esc key is intercepted (no escape)
     • The user sees only Cancel + (after completion) Close
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase.js";
import { Btn } from "./ui.jsx";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";

/* Module-level state: a queue of active overlays, plus the singleton instance */
let _activeJob = null;
let _setterRef = null;

/* Public API: trigger the overlay from anywhere.
   `meta` shape: { jobId, label, type, onComplete?, onError?, allowCancel? }
   Returns nothing — listeners on the job doc handle completion. */
export function startSyncProgress(meta){
  _activeJob = { ...meta, _started: Date.now() };
  if(_setterRef) _setterRef(_activeJob);
}

/* Public API: dismiss the overlay (called by syncProgress utility on completion). */
export function dismissSyncProgress(){
  _activeJob = null;
  if(_setterRef) _setterRef(null);
}

export function SyncProgressOverlay(){
  const [job, setJob] = useState(_activeJob);
  const [snap, setSnap] = useState(null); /* live snapshot of the job doc */
  const [elapsedSec, setElapsedSec] = useState(0);
  const tickRef = useRef(null);

  /* Register the setter so external triggers can update us */
  useEffect(() => {
    _setterRef = setJob;
    return () => { _setterRef = null; };
  }, []);

  /* Subscribe to the Firestore job doc when a job is active */
  useEffect(() => {
    if(!job?.jobId){ setSnap(null); return; }
    const unsub = onSnapshot(doc(db, "syncJobs", job.jobId), (s) => {
      if(s.exists()){
        setSnap(s.data());
      }
    }, (err) => {
      /* onSnapshot error is non-fatal — UI just won't update.
         User can still see the initial state. */
      console.warn("[SyncProgressOverlay] listener error:", err.message);
    });
    return () => unsub();
  }, [job?.jobId]);

  /* Tick elapsed seconds */
  useEffect(() => {
    if(!job?.jobId){ setElapsedSec(0); return; }
    const start = job._started || Date.now();
    setElapsedSec(0);
    const interval = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    tickRef.current = interval;
    return () => clearInterval(interval);
  }, [job?.jobId]);

  /* Block Escape key while overlay is shown */
  useEffect(() => {
    if(!job) return;
    const stop = (e) => {
      if(e.key === "Escape"){ e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener("keydown", stop, true);
    return () => window.removeEventListener("keydown", stop, true);
  }, [job]);

  /* V21.9.5 CRITICAL FIX: this useEffect was AFTER the early return → React
     Error #310 ("rendered fewer hooks than expected") whenever job toggled
     null↔value. ALL hooks MUST be called unconditionally before any early
     return. We compute isDone here and gate inside the effect itself. */
  const isDoneForDismiss = (snap?.status === "done");
  useEffect(() => {
    if(!isDoneForDismiss) return;
    const t = setTimeout(() => dismissSyncProgress(), 1500);
    return () => clearTimeout(t);
  }, [isDoneForDismiss]);

  if(!job) return null;

  const status = snap?.status || "running";
  const percent = Math.max(0, Math.min(100, Number(snap?.percent) || 0));
  const message = snap?.message || job.label || "...";
  const total = snap?.total || 0;
  const progress = snap?.progress || 0;
  const errorMsg = snap?.error?.message || "";
  const isDone = status === "done";
  const isError = status === "error";
  const isCancelled = status === "cancelled";
  const isFinal = isDone || isError || isCancelled;

  /* Indeterminate state: when total is 0 and we're still running, show
     an animated bar instead of a precise %. */
  const indeterminate = !isFinal && total === 0 && percent === 0;

  const fmtElapsed = (s) => {
    const m = Math.floor(s / 60);
    const ss = s % 60;
    return m > 0 ? `${m}:${String(ss).padStart(2, "0")}` : `${s}ث`;
  };

  const banner =
    isDone ? { color: T.ok, icon: "✅", label: "تمت بنجاح" } :
    isError ? { color: T.err, icon: "⛔", label: "فشلت العملية" } :
    isCancelled ? { color: T.textMut, icon: "⏹", label: "تم الإلغاء" } :
    { color: T.accent, icon: "🔄", label: "جاري التنفيذ..." };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 99999,
      background: "rgba(15, 23, 42, 0.65)",
      backdropFilter: "blur(4px)",
      WebkitBackdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16, direction: "rtl",
      animation: "clark-sync-fade-in 0.2s ease-out",
    }}>
      <style>{`
        @keyframes clark-sync-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes clark-sync-bar-indeterminate {
          0%   { background-position: 0% 0; }
          100% { background-position: 200% 0; }
        }
        .clark-sync-bar-indet {
          background: linear-gradient(90deg, ${T.accent}30, ${T.accent}, ${T.accent}30);
          background-size: 200% 100%;
          animation: clark-sync-bar-indeterminate 1.4s linear infinite;
        }
      `}</style>
      <div style={{
        background: T.cardSolid,
        borderRadius: 16,
        width: "100%",
        maxWidth: 480,
        boxShadow: "0 24px 60px rgba(0,0,0,0.4)",
        overflow: "hidden",
        border: "2px solid " + banner.color + "30",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px",
          background: "linear-gradient(135deg," + banner.color + "12," + banner.color + "04)",
          borderBottom: "1px solid " + banner.color + "20",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>{banner.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: FS + 1, fontWeight: 800, color: banner.color }}>
                {job.label || "مزامنة"}
              </div>
              <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 2 }}>
                {banner.label} · {fmtElapsed(elapsedSec)}
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Progress bar */}
          {!isFinal && (
            <div>
              <div style={{
                height: 10,
                background: T.brd,
                borderRadius: 5,
                overflow: "hidden",
                position: "relative",
              }}>
                {indeterminate ? (
                  <div className="clark-sync-bar-indet" style={{
                    width: "100%", height: "100%",
                  }} />
                ) : (
                  <div style={{
                    width: percent + "%",
                    height: "100%",
                    background: "linear-gradient(90deg," + T.accent + "," + T.accent + "DD)",
                    transition: "width 400ms ease-out",
                  }} />
                )}
              </div>
              <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", fontSize: FS - 2, color: T.textSec }}>
                <span>{indeterminate ? "" : percent + "%"}</span>
                <span>{total > 0 ? `${progress} / ${total}` : ""}</span>
              </div>
            </div>
          )}

          {/* Done state — solid green bar */}
          {isDone && (
            <div style={{ height: 10, background: T.ok, borderRadius: 5 }} />
          )}

          {/* Message */}
          <div style={{
            fontSize: FS,
            color: T.text,
            fontWeight: 600,
            lineHeight: 1.6,
            textAlign: "center",
            padding: "8px 4px",
          }}>
            {isError ? (errorMsg || message) : message}
          </div>

          {/* Sub-message (when present) */}
          {snap?.sub_message && (
            <div style={{
              fontSize: FS - 2,
              color: T.textMut,
              textAlign: "center",
            }}>
              {snap.sub_message}
            </div>
          )}

          {/* Result preview for done state */}
          {isDone && snap?.result && typeof snap.result === "object" && (
            <div style={{
              padding: "10px 12px",
              background: T.ok + "10",
              borderRadius: 8,
              fontSize: FS - 2,
              lineHeight: 1.7,
              color: T.text,
            }}>
              {Object.entries(snap.result).slice(0, 5).map(([k, v]) => (
                typeof v === "number" || typeof v === "string" ? (
                  <div key={k}>
                    <span style={{ color: T.textMut }}>{k}:</span> <b>{String(v)}</b>
                  </div>
                ) : null
              ))}
            </div>
          )}

          {/* Error details */}
          {isError && (
            <div style={{
              padding: "10px 12px",
              background: T.err + "10",
              border: "1px solid " + T.err + "30",
              borderRadius: 8,
              fontSize: FS - 2,
              color: T.err,
              fontFamily: "monospace",
              maxHeight: 120,
              overflowY: "auto",
              direction: "ltr",
              textAlign: "left",
            }}>
              {errorMsg || "خطأ غير معروف"}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 20px",
          borderTop: "1px solid " + T.brd,
          background: T.bg,
          display: "flex",
          justifyContent: isFinal ? "center" : "space-between",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}>
          {!isFinal && (
            <>
              <div style={{ fontSize: FS - 3, color: T.textMut }}>
                ⏳ يرجى عدم إغلاق الصفحة...
              </div>
              {job.allowCancel !== false && (
                <Btn small ghost onClick={() => {
                  /* Best-effort cancel — overlay closes immediately, server may
                     finish anyway but we mark the job cancelled. */
                  if(typeof job.onCancel === "function") job.onCancel();
                  dismissSyncProgress();
                }}>
                  إلغاء
                </Btn>
              )}
            </>
          )}
          {isError && (
            <>
              <Btn small ghost onClick={() => dismissSyncProgress()}>إغلاق</Btn>
              {typeof job.onRetry === "function" && (
                <Btn small primary onClick={() => {
                  job.onRetry();
                  dismissSyncProgress();
                }}>
                  🔄 حاول تاني
                </Btn>
              )}
            </>
          )}
          {isCancelled && (
            <Btn small ghost onClick={() => dismissSyncProgress()}>إغلاق</Btn>
          )}
        </div>
      </div>
    </div>
  );
}
