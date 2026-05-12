/* ═══════════════════════════════════════════════════════════════
   CLARK Service Worker — V21.9.35
   ───────────────────────────────────────────────────────────────
   Two cache strategies:
   1. Images (Firebase Storage / common image extensions): cache-first.
      The SW always fetches images with explicit `mode: 'cors'` so the
      cached Response is readable by JS (`response.blob()`). Without this,
      an <img>'s default no-cors fetch caches an OPAQUE response — display
      works but `fetch(url).blob()` returns 0 bytes, breaking Web Share
      (e.g. the WhatsApp image-share flow in DetPg's sendWa). Firebase
      Storage with default download URLs supports CORS for any origin.
   2. Everything else: network-first with cache fallback (offline).

   ═══════════════════════════════════════════════════════════════
   V21.9.21 — Versioned cache + auto-update notification
   ───────────────────────────────────────────────────────────────
   Pre-V21.9.21 the cache name was hardcoded ("clark-app-v2"), so every
   release LANDED FINE on first new fetch but the Service Worker would
   keep serving stale JS for any cached chunk until the user manually
   hard-refreshed (Ctrl+Shift+R). Mobile users almost never do this →
   they'd be running V21.9.10 JS while the server was on V21.9.20.

   The V21.9.21 fix:
   1. SW_VERSION below is bumped on every release (matches APP_VERSION).
      The bump invalidates all old caches via the activate listener.
   2. install: skipWaiting so the new SW activates immediately instead
      of waiting for all tabs to close.
   3. activate: claim clients + delete every cache whose name doesn't
      start with the current version prefix.
   4. message listener: clients can send {type:'SKIP_WAITING'} to force
      the new SW to take over (used by the "Update available" toast).
   5. fetch: for HTML / JS / CSS we use network-first with a 3s timeout,
      then fall back to cache. This means an UP-TO-DATE app always wins
      over stale cache as long as the network responds within 3s.

   Net result: deploy lands → SW updates within 1 page-load → "نسخة
   جديدة متاحة" toast → user clicks "تحديث" → seamless reload to
   new JS. No manual cache clears needed.
   ═══════════════════════════════════════════════════════════════ */

const SW_VERSION = 'v21.9.35';
const APP_CACHE = 'clark-app-' + SW_VERSION;
const IMG_CACHE = 'clark-images-' + SW_VERSION;
const KEEP_CACHES = [APP_CACHE, IMG_CACHE];
const STATIC_ASSETS = ['/'];

/* Network-first timeout for HTML/JS/CSS so a slow connection still
   serves the cached version instead of hanging. */
const NETWORK_TIMEOUT_MS = 3000;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(APP_CACHE).then(c => c.addAll(STATIC_ASSETS)));
  /* V21.9.21: skipWaiting so the new SW activates without waiting for
     all tabs to close. Combined with clients.claim in activate, this
     means new code lands in <1 page load. */
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  /* Delete ALL caches whose name doesn't match the current version.
     This guarantees that bumping SW_VERSION clears the slate. */
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => !KEEP_CACHES.includes(k)).map(k => caches.delete(k))
    );
    await self.clients.claim();
    /* Notify all clients that a new version has activated. The client
       code shows a toast "نسخة جديدة متاحة" and offers a reload button. */
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const c of clients) {
      try {
        c.postMessage({ type: 'SW_ACTIVATED', version: SW_VERSION });
      } catch (_) { /* ignore */ }
    }
  })());
});

/* V21.9.21: allow the client to force a waiting SW to take over.
   The client uses this when the user clicks "تحديث" on the update toast. */
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function isImageRequest(url) {
  /* Firebase Storage hosts model images uploaded via uploadOrderImageFile. */
  if (url.hostname === 'firebasestorage.googleapis.com') return true;
  /* Generic image extensions (covers same-origin / public assets). */
  if (/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?|#|$)/i.test(url.pathname)) return true;
  return false;
}

function isAppShellRequest(url, request) {
  /* HTML navigations + JS/CSS assets — the things that change with deploys. */
  if (request.mode === 'navigate') return true;
  if (/\.(html|js|mjs|css|map)(\?|#|$)/i.test(url.pathname)) return true;
  return false;
}

/* V21.9.21: network-first with timeout. If the network is slow or down,
   serve from cache so the app still works offline. */
function networkFirstWithTimeout(request) {
  return new Promise((resolve) => {
    let resolved = false;
    const fallback = () => {
      if (resolved) return;
      resolved = true;
      caches.match(request).then(cached => {
        resolve(cached || Response.error());
      });
    };
    const timer = setTimeout(fallback, NETWORK_TIMEOUT_MS);
    fetch(request).then(r => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      /* Cache the fresh response for offline */
      if (r && r.ok) {
        const clone = r.clone();
        caches.open(APP_CACHE).then(c => c.put(request, clone)).catch(() => {});
      }
      resolve(r);
    }).catch(() => fallback());
  });
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  let url;
  try { url = new URL(e.request.url); } catch (_) { return; }

  /* Skip API calls — they should always go to the network and never be
     cached (each response is fresh data). */
  if (url.pathname.startsWith('/api/')) return;

  /* Image cache-first with forced-CORS fetch (V19.80.10 behavior). */
  if (isImageRequest(url)) {
    e.respondWith(
      caches.open(IMG_CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          if (cached) return cached;
          const corsReq = new Request(e.request.url, {
            method: 'GET',
            mode: 'cors',
            credentials: 'omit',
            cache: 'default'
          });
          return fetch(corsReq).then(resp => {
            if (resp && resp.ok && resp.type !== 'opaque') {
              cache.put(e.request, resp.clone()).catch(() => {});
            }
            return resp;
          }).catch(() => {
            return fetch(e.request).catch(() => Response.error());
          });
        })
      )
    );
    return;
  }

  /* V21.9.21: App shell (HTML/JS/CSS) — network-first with 3s timeout so
     deploys land fast but offline still works. */
  if (isAppShellRequest(url, e.request)) {
    e.respondWith(networkFirstWithTimeout(e.request));
    return;
  }

  /* Default: network-first with cache fallback. */
  e.respondWith(
    fetch(e.request).then(r => {
      const clone = r.clone();
      caches.open(APP_CACHE).then(c => c.put(e.request, clone)).catch(() => {});
      return r;
    }).catch(() => caches.match(e.request))
  );
});

/* ═══════════════════════════════════════════════════════════════════════
   V21.12.0 — Push Notification Handlers (#13 Slice 1)
   ───────────────────────────────────────────────────────────────────────
   ADDITIVE — no existing handlers modified.

   • push event: shows notification when server sends a push
   • notificationclick: closes notification + focuses/opens CLARK tab
   • pushsubscriptionchange: re-registers subscription on browser renewal

   Payload format expected from server:
     { title, body, icon?, badge?, image?, tag?, data?, actions?, urgency? }

   data.url: where to navigate on click (default '/')
   data.type: optional routing hint ('treasury'|'task'|'instruction'|'warning')
   ═══════════════════════════════════════════════════════════════════════ */

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = {};
  try { payload = event.data.json(); }
  catch (e) {
    payload = { title: 'CLARK', body: event.data.text() };
  }
  const { title, body, icon, badge, image, tag, data, actions, urgency } = payload;
  const options = {
    body: body || '',
    icon: icon || '/icon-192.png',
    badge: badge || '/icon-192.png',
    image,
    tag: tag || ('clark-' + Date.now()),
    data: data || {},
    actions: actions || [],
    dir: 'rtl',
    lang: 'ar-EG',
    vibrate: [200, 100, 200],
    requireInteraction: urgency === 'high',
    silent: urgency === 'low',
    timestamp: Date.now(),
  };
  event.waitUntil(
    self.registration.showNotification(title || 'CLARK', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const action = event.action;
  let url = '/';
  if (data.url) url = data.url;
  else if (data.type === 'treasury') url = '/?tab=treasury' + (data.entryId ? '&entryId=' + data.entryId : '');
  else if (data.type === 'task') url = '/?tab=tasks' + (data.taskId ? '&taskId=' + data.taskId : '');
  else if (data.type === 'instruction') url = '/?tab=home&inst=' + (data.instructionId || '');
  else if (data.type === 'warning') url = '/?tab=' + (data.target || 'home');
  if (action === 'approve' && data.actionUrl) url = data.actionUrl + '?action=approve';
  else if (action === 'snooze' && data.snoozeUrl) url = data.snoozeUrl;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(wins => {
      for (const win of wins) {
        if (win.url.includes(self.location.origin)) {
          win.focus();
          try { win.postMessage({ type: 'NOTIFICATION_CLICK', data, action, url }); } catch (e) {}
          return;
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager.subscribe(event.oldSubscription ? event.oldSubscription.options : { userVisibleOnly: true })
      .then(sub => {
        return fetch('/api/notifications/renew-subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub.toJSON() }),
        }).catch(() => {});
      }).catch(() => {})
  );
});

