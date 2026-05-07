/* ═══════════════════════════════════════════════════════════════
   CLARK Service Worker — V19.80.10
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

   Cache version bump (v1 → v2) on the image cache invalidates older
   opaque entries from V19.80.2-V19.80.9 so users get clean CORS
   responses after upgrade.
   ═══════════════════════════════════════════════════════════════ */

const APP_CACHE = 'clark-app-v2';
const IMG_CACHE = 'clark-images-v2';
const KEEP_CACHES = [APP_CACHE, IMG_CACHE];
const STATIC_ASSETS = ['/'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(APP_CACHE).then(c => c.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  /* Delete any cache that isn't in our keep-list. The image-cache rename
     to v2 here drops the V19.80.2-V19.80.9 opaque entries automatically. */
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => !KEEP_CACHES.includes(k)).map(k => caches.delete(k))
  )));
  self.clients.claim();
});

function isImageRequest(url) {
  /* Firebase Storage hosts model images uploaded via uploadOrderImageFile. */
  if (url.hostname === 'firebasestorage.googleapis.com') return true;
  /* Generic image extensions (covers same-origin / public assets). */
  if (/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?|#|$)/i.test(url.pathname)) return true;
  return false;
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  let url;
  try { url = new URL(e.request.url); } catch (_) { return; }

  /* Image cache-first with forced-CORS fetch. */
  if (isImageRequest(url)) {
    e.respondWith(
      caches.open(IMG_CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          if (cached) return cached;
          /* Force cors mode so the cached Response is JS-readable for
             Web Share (sendWa). <img> elements accept cors responses too,
             so this works for both display and programmatic fetch. */
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
            /* CORS fetch failed (server doesn't allow CORS for this origin).
               Fall back to original-mode fetch so <img> still loads, but
               DON'T cache an opaque response — that would re-introduce the
               broken-share bug. */
            return fetch(e.request).catch(() => Response.error());
          });
        })
      )
    );
    return;
  }

  /* Default: network-first with cache fallback (so app updates land fast
     but offline still works). */
  e.respondWith(
    fetch(e.request).then(r => {
      const clone = r.clone();
      caches.open(APP_CACHE).then(c => c.put(e.request, clone)).catch(() => {});
      return r;
    }).catch(() => caches.match(e.request))
  );
});
