/* ═══════════════════════════════════════════════════════════════
   CLARK Service Worker — V19.80.2
   ───────────────────────────────────────────────────────────────
   Two cache strategies:
   1. Images (Firebase Storage / common image extensions): cache-first.
      Once an image is loaded for a model, it's served from cache forever
      so navigating between orders / coming back from an order edit shows
      the image instantly (no flash, no re-fetch). Browser auto-evicts on
      storage pressure; typical model image is 100-500KB so the cache
      stays small. The user's policy: "keep images in cache regardless
      of size; max image size is 5MB."
   2. Everything else: network-first with cache fallback (offline).
   ═══════════════════════════════════════════════════════════════ */

const APP_CACHE = 'clark-app-v2';
const IMG_CACHE = 'clark-images-v1';
const KEEP_CACHES = [APP_CACHE, IMG_CACHE];
const STATIC_ASSETS = ['/'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(APP_CACHE).then(c => c.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  /* Delete any cache that isn't in our keep-list. Keeps the image cache
     across SW updates so users don't lose cached model images on deploy. */
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

  /* Image cache-first: hit cache immediately, fall back to network on miss. */
  if (isImageRequest(url)) {
    e.respondWith(
      caches.open(IMG_CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          if (cached) return cached;
          return fetch(e.request).then(resp => {
            /* Only cache successful responses (skip 4xx/5xx). Firebase Storage
               returns 200 for valid token-signed download URLs. */
            if (resp && resp.ok) {
              cache.put(e.request, resp.clone()).catch(() => {});
            }
            return resp;
          }).catch(() => cached || Response.error());
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
