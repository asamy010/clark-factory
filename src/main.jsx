import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'

/* Lock to portrait on mobile */
try{screen.orientation?.lock?.("portrait").catch(()=>{})}catch(e){}

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)

/* ═══════════════════════════════════════════════════════════════
   V21.9.21: Service Worker registration + auto-update notification
   ───────────────────────────────────────────────────────────────
   Pre-V21.9.21 the SW was registered inline in index.html with no
   update detection. After every deploy, users kept the old JS until
   they manually closed all tabs OR did Ctrl+Shift+R. Mobile users
   almost never do either — they'd run V21.9.10 while the server was
   on V21.9.20, never benefiting from fixes.

   V21.9.21 flow:
   1. Register the SW on load (same as before).
   2. Listen for `updatefound` events: when a new SW is installing in
      the background, wait until it's `installed` (= ready), then
      either auto-skip-waiting (if no controller exists yet — first
      install) or show a toast asking the user to reload.
   3. On `controllerchange` (= new SW took over), reload the page so
      all JS chunks are fresh.
   4. Periodically check for updates every 60 minutes (covers users
      who keep the tab open all day).
   ═══════════════════════════════════════════════════════════════ */
if('serviceWorker' in navigator){
  /* Toast UI for the "update available" banner.
     Renders inline in the body via plain DOM — avoids React tree
     coupling and works even if React hasn't mounted yet. */
  function showUpdateToast(onReload){
    if(document.getElementById('clark-sw-update-toast')) return;
    const wrap = document.createElement('div');
    wrap.id = 'clark-sw-update-toast';
    wrap.style.cssText = "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);" +
      "background:#0EA5E9;color:#fff;padding:14px 22px;border-radius:14px;" +
      "box-shadow:0 12px 40px rgba(0,0,0,0.25);font-family:'Cairo',sans-serif;" +
      "font-size:14px;display:flex;align-items:center;gap:14px;z-index:99999;" +
      "max-width:90vw;direction:rtl";
    wrap.innerHTML =
      '<span style="font-weight:700;">⬆️ نسخة جديدة من CLARK متاحة</span>' +
      '<button id="clark-sw-update-btn" style="background:#fff;color:#0EA5E9;border:none;' +
      'padding:8px 18px;border-radius:10px;font-weight:800;cursor:pointer;font-family:inherit;' +
      'font-size:13px;">تحديث الآن</button>' +
      '<button id="clark-sw-update-dismiss" style="background:transparent;color:#fff;border:1px solid rgba(255,255,255,0.4);' +
      'padding:6px 12px;border-radius:8px;cursor:pointer;font-family:inherit;font-size:12px;opacity:0.8;">لاحقاً</button>';
    document.body.appendChild(wrap);
    document.getElementById('clark-sw-update-btn').onclick = () => {
      onReload();
      wrap.remove();
    };
    document.getElementById('clark-sw-update-dismiss').onclick = () => wrap.remove();
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      /* Check for an SW that's installed but waiting (= update ready
         but controller hasn't switched yet) */
      function tryShowUpdate(){
        if(reg.waiting && navigator.serviceWorker.controller){
          showUpdateToast(() => {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          });
        }
      }

      tryShowUpdate();

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if(!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if(newWorker.state === 'installed'){
            if(navigator.serviceWorker.controller){
              /* Existing SW is in control → new one is waiting → show toast */
              showUpdateToast(() => {
                newWorker.postMessage({ type: 'SKIP_WAITING' });
              });
            } else {
              /* No controller → first install, no need to prompt */
            }
          }
        });
      });

      /* Periodic check (every 60 min) for users who keep the tab open */
      setInterval(() => { try { reg.update(); } catch(_){} }, 60 * 60 * 1000);
    }).catch(() => { /* registration failed — non-fatal */ });

    /* When the active SW changes (after the user clicks "تحديث"),
       reload the page so all cached chunks are re-fetched fresh. */
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if(reloading) return;
      reloading = true;
      window.location.reload();
    });

    /* Listen for the SW's "I just activated" broadcast — useful if the
       user already has the old controller and we want to surface the
       version bump. Currently a no-op but reserved for future analytics. */
    navigator.serviceWorker.addEventListener('message', (e) => {
      if(e.data?.type === 'SW_ACTIVATED'){
        try { console.log('[CLARK SW] Activated version', e.data.version); } catch(_){}
      }
    });
  });
}
