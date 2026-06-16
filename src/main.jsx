import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'
import { installGlobalErrorLogging } from './utils/errorLog.js'

/* Lock to portrait on mobile */
try{screen.orientation?.lock?.("portrait").catch(()=>{})}catch(e){}

/* V21.27.25: التقاط الأخطاء خارج شجرة React (window.onerror +
   unhandledrejection) وتسجيلها عن بُعد best-effort. */
installGlobalErrorLogging();

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)

/* ═══════════════════════════════════════════════════════════════
   V21.9.21: Service Worker registration + auto-update
   V21.9.141: REMOVED the "update available" toast UI per user feedback.
              It appeared at awkward times and persisted post-update with
              styling glitches. New flow is silent: the new SW skip-waits
              + the page reloads. The user sees a momentary red flash on
              the version pill in the topbar (handled in App.jsx via a
              localStorage timestamp check), then it returns to normal.
   ───────────────────────────────────────────────────────────────
   Flow:
   1. Register the SW on load.
   2. On `updatefound`+`installed`: immediately tell the new SW to
      skipWaiting — no toast, no user prompt.
   3. On `controllerchange` (new SW took over): reload the page.
      App.jsx detects the version bump on next mount via
      `localStorage.getItem('clark-last-seen-version')` and flashes
      the version pill red for ~60s.
   4. Periodic check (every 60 min) for users who keep the tab open.
   ═══════════════════════════════════════════════════════════════ */
if('serviceWorker' in navigator){
  /* V21.9.141: Clean up any stale toast left over from V21.9.21-V21.9.140
     installs (the toast DOM persisted in cached HTML after a reload). */
  try { document.getElementById('clark-sw-update-toast')?.remove(); } catch(_) {}

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      /* If there's already a SW waiting at load time (= update ready),
         immediately activate it — no toast, no prompt. */
      if(reg.waiting && navigator.serviceWorker.controller){
        try { reg.waiting.postMessage({ type: 'SKIP_WAITING' }); } catch(_) {}
      }

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if(!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if(newWorker.state === 'installed' && navigator.serviceWorker.controller){
            /* New SW is ready and an existing controller is in place.
               Tell the new SW to take over immediately. The subsequent
               `controllerchange` event triggers the reload below. */
            try { newWorker.postMessage({ type: 'SKIP_WAITING' }); } catch(_) {}
          }
        });
      });

      /* Periodic check (every 60 min) for users who keep the tab open */
      setInterval(() => { try { reg.update(); } catch(_){} }, 60 * 60 * 1000);
    }).catch(() => { /* registration failed — non-fatal */ });

    /* When the active SW changes (= new version took over), reload so
       all cached chunks are re-fetched fresh. */
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if(reloading) return;
      reloading = true;
      window.location.reload();
    });

    /* Listen for the SW's "I just activated" broadcast — used by App.jsx
       to stamp localStorage so it can flash the version pill red. */
    navigator.serviceWorker.addEventListener('message', (e) => {
      if(e.data?.type === 'SW_ACTIVATED'){
        try { console.log('[CLARK SW] Activated version', e.data.version); } catch(_){}
        try { localStorage.setItem('clark-sw-just-updated-at', String(Date.now())); } catch(_){}
      }
    });
  });
}
