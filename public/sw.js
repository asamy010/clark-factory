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

const SW_VERSION = 'v21.9.169';
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

/* ═══════════════════════════════════════════════════════════════
   PUSH NOTIFICATIONS — V21.9.169 (Phase 22a — Slice 1 of 14)
   ───────────────────────────────────────────────────────────────
   Handlers for the Web Push protocol. As of V21.9.169 these are
   STANDALONE: no client subscription path exists yet (Slice 2),
   no backend send endpoint exists yet (Slice 4), so in practice
   no push event will be received until those land. Shipping this
   first slice ALONE is safe and reversible — the handlers are
   passive listeners that only fire when a push actually arrives.

   Three handlers:
   1. push                    → show the OS notification with RTL Arabic
   2. notificationclick       → focus an open tab or open a new one,
                                deep-link to the relevant CLARK tab
   3. pushsubscriptionchange  → best-effort renewal via backend

   Payload schema the server should send (Slice 4):
     {
       title:   string,          // notification heading
       body:    string,          // notification body text
       icon:    string?,         // optional override (default /icon-192.png)
       badge:   string?,         // small monochrome badge (Android)
       image:   string?,         // optional banner image
       tag:     string?,         // notifications with same tag REPLACE each other
       data:    {                // routing payload — read by click handler
         type:   "treasury" | "task" | "instruction" | "warning" | "broadcast",
         url?:   string,         // explicit URL override
         entryId?: string,       // for treasury → /?tab=treasury&entryId=...
         taskId?:  string,
         instructionId?: string,
         target?:  string,       // generic tab name for warning
       },
       actions: [{ action, title }]?,  // up to 2 action buttons
       urgency: "low" | "normal" | "high",  // high = requireInteraction
     }

   Privacy: NEVER put sensitive amounts/balances/customer names
   in title/body — the OS shows these on the lock screen. Use
   generic copy ("تحويل خزنة جديد — اضغط للتفاصيل") and pull the
   actual numbers from inside the app after click. */

self.addEventListener('push', (event) => {
  /* Defensive: an empty push (no data) is sometimes used by browsers
     to wake the SW — show a generic ping rather than crash. */
  if (!event.data) {
    event.waitUntil(
      self.registration.showNotification('CLARK', {
        body: 'لديك تحديث جديد',
        icon: '/icon-192.png',
        dir: 'rtl',
        lang: 'ar-EG',
      })
    );
    return;
  }

  let payload;
  try {
    payload = event.data.json();
  } catch (_) {
    /* Server sent plain text — wrap as generic notification. */
    payload = { title: 'CLARK', body: event.data.text() };
  }

  const {
    title, body, icon, badge, image, tag, data, actions, urgency
  } = payload || {};

  const options = {
    body: body || '',
    icon: icon || '/icon-192.png',
    badge: badge || '/icon-192.png',
    image: image || undefined,
    /* tag groups similar notifications. Without a tag, every push
       creates a new banner. With a tag, a new push replaces the
       previous one with the same tag (e.g. tag='treasury-summary'). */
    tag: tag || ('clark-' + Date.now()),
    data: data || {},
    actions: Array.isArray(actions) ? actions.slice(0, 2) : [],
    /* RTL Arabic — affects how Android lays out title/body. */
    dir: 'rtl',
    lang: 'ar-EG',
    /* Vibration: short-long-short (matches WhatsApp-style attention). */
    vibrate: [200, 100, 200],
    /* high urgency → requires user interaction to dismiss
       low urgency → silent (no sound, no vibration). */
    requireInteraction: urgency === 'high',
    silent: urgency === 'low',
    timestamp: Date.now(),
  };

  event.waitUntil(
    self.registration.showNotification(title || 'CLARK', options)
  );
});

/* Notification click — focus an open CLARK tab if any, otherwise open
   a new one. Deep-link to the relevant tab via URL params (the app
   reads params on mount; see App.jsx browser history wiring). */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const action = event.action || '';

  /* Build destination URL based on payload type. Default to home. */
  let url = '/';
  if (data.url) {
    url = data.url;
  } else if (data.type === 'treasury') {
    url = '/?tab=treasury' + (data.entryId ? ('&entryId=' + encodeURIComponent(data.entryId)) : '');
  } else if (data.type === 'task') {
    url = '/?tab=tasks' + (data.taskId ? ('&taskId=' + encodeURIComponent(data.taskId)) : '');
  } else if (data.type === 'instruction') {
    url = '/?tab=home' + (data.instructionId ? ('&inst=' + encodeURIComponent(data.instructionId)) : '');
  } else if (data.type === 'warning') {
    url = '/?tab=' + encodeURIComponent(data.target || 'home');
  } else if (data.type === 'broadcast') {
    url = '/?tab=home&broadcast=' + encodeURIComponent(data.broadcastId || '');
  }

  /* Action button override (e.g., "approve" → action-specific URL). */
  if (action && data.actions && data.actions[action]) {
    url = data.actions[action];
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(wins => {
      /* Prefer focusing an already-open CLARK tab — postMessage so the
         app can react (switch tab, scroll to entry, etc.) without a
         full reload. Falls back to navigating that tab to the URL. */
      for (const win of wins) {
        try {
          if (win.url && win.url.includes(self.location.origin)) {
            win.focus();
            try {
              win.postMessage({ type: 'NOTIFICATION_CLICK', data, action, url });
            } catch (_) { /* ignore */ }
            /* Also navigate that tab to the URL — in case the app's
               in-memory listener for NOTIFICATION_CLICK isn't wired yet
               (Slice 2 will wire it). The navigate is a no-op if the
               URL is the same. */
            try {
              if (win.url !== self.location.origin + url) {
                /* clients API doesn't expose .navigate on all browsers;
                   guard. */
                if (typeof win.navigate === 'function') {
                  win.navigate(url);
                }
              }
            } catch (_) { /* ignore */ }
            return;
          }
        } catch (_) { /* ignore individual tab errors */ }
      }
      /* No CLARK tab open — open a new one at the destination. */
      return self.clients.openWindow(url);
    })
  );
});

/* Subscription renewal — the browser rotates push subscriptions on
   its schedule (or after the user revokes/regrants permission). Best
   effort: tell the backend so it can replace the stored token. The
   /api/notifications/renew-subscription endpoint will land in Slice 3;
   until then this fails silently which is fine — the next time the
   user opens the app, the client-side init (Slice 2) will re-subscribe. */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    fetch('/api/notifications/renew-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        oldEndpoint: (event.oldSubscription && event.oldSubscription.endpoint) || null,
        newSubscription: event.newSubscription
          ? event.newSubscription.toJSON()
          : null,
      }),
    }).catch(() => { /* backend not ready yet — silent */ })
  );
});

function isImageRequest(url) {
  /* V21.9.100 ROOT-CAUSE FIX (storage/unauthorized after upload):
     Pre-V21.9.100 the SW intercepted ALL firebasestorage.googleapis.com
     GETs (including the metadata fetch that `getDownloadURL` makes during
     uploadBytes -> getDownloadURL flow). The intercept refetched with
     `credentials: omit` which STRIPS the Firebase Auth bearer token, so
     the metadata request was rejected with 403 -> SDK surfaces
     `storage/unauthorized`. The user saw the upload "fail" even though
     the POST to /o succeeded. This was the V21.9.77 Test D mystery and
     why ALL real production uploads (templates, orders, documents)
     appeared broken while the diagnostic A/B/C tests passed (those don't
     call getDownloadURL).

     Fix: only treat firebasestorage URLs as image requests if they carry
     a public download token (`alt=media&token=...`). Those are signed
     public URLs safe to fetch without credentials. Bare paths (metadata
     calls + authenticated downloads) bypass the SW entirely so the SDK
     attaches its bearer token unmodified. */
  if (url.hostname === 'firebasestorage.googleapis.com') {
    const search = url.search || '';
    return search.includes('alt=media') && search.includes('token=');
  }
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
