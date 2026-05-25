/* ═══════════════════════════════════════════════════════════════
   CLARK — Push Notifications Client Utility
   V21.9.170 (Phase 22b — Slice 2/14)
   ───────────────────────────────────────────────────────────────

   Lazy-init Firebase Cloud Messaging (FCM) client + permission flow.

   The module is NEVER auto-initialized — `initNotifications(user)` is
   called only when the user clicks "تفعيل الإشعارات" (the banner in
   Slice 5 settings, or a future opt-in modal). This avoids:
   - Permission popups on page load (which auto-deny in Chrome/Safari)
   - Loading firebase/messaging into the main bundle unconditionally
   - Initialization side effects when the feature isn't wired yet

   Module state:
   - messaging:   cached FCM messaging instance (after first init)
   - currentToken: cached FCM registration token (after subscribe)

   Public API:
   - isPushSupported()                  → bool — basic capability check
   - getEnvironmentInfo()               → { ios, standalone, supported, requiresInstall, permission }
   - initNotifications(user)            → { ok, requiresInstall?, error? }
   - requestPermissionAndSubscribe(user)→ { ok, token?, reason? }
   - getCurrentToken()                  → string | null
   - onForegroundMessage(handler)       → unsubscribe fn
   - detectDevice()                     → { type, os, browser, userAgent }

   Architectural notes:
   - We use the modular Firebase SDK (`firebase/messaging`) which is
     already in node_modules via the firebase ^10.8.0 dep in package.json.
   - The VAPID public key MUST be set as `VITE_FIREBASE_VAPID_KEY` in
     Vercel env vars BEFORE this can produce a real token. If the env
     var is missing, `getToken()` throws a clear error which we surface
     to the user as "إعدادات الإشعارات ناقصة — اتصل بالأدمن".
   - iOS Safari requires the PWA to be installed (Add to Home Screen)
     BEFORE push permission can be granted. We detect this and return
     `requiresInstall: true` so the UI can guide the user.

   Privacy:
   - We never log the FCM token to console
   - The token is sent to /api/notifications/subscribe (Slice 3) over
     HTTPS only; the server stores it bound to the user's UID.
   ═══════════════════════════════════════════════════════════════ */

import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";

/* The Firebase app/auth/db/storage exports are already created in
   src/firebase.js. We import the app instance lazily inside init
   because importing firebase.js at module top-level would defeat the
   tree-shaking goal of keeping messaging out of the main bundle for
   users who don't enable push. */

let messaging = null;
let currentToken = null;
let foregroundUnsub = null;
const foregroundHandlers = new Set();

/* ─────────────────────────────────────────────────────────────
   Capability + environment detection
   ──────────────────────────────────────────────────────────── */

export function isPushSupported() {
  if (typeof window === "undefined") return false;
  if (!("Notification" in window)) return false;
  if (!("serviceWorker" in navigator)) return false;
  if (!("PushManager" in window)) return false;
  return true;
}

/* Detect iOS Safari + PWA install status. iOS 16.4+ supports Web Push
   ONLY when the app is installed to the home screen (display-mode:
   standalone). We surface this so the UI can show install instructions. */
export function getEnvironmentInfo() {
  if (typeof window === "undefined") {
    return { supported: false, ios: false, standalone: false, requiresInstall: false, permission: "default" };
  }
  const ua = navigator.userAgent || "";
  const ios = /iPad|iPhone|iPod/.test(ua);
  /* matchMedia is the canonical PWA standalone check; navigator.standalone
     is an old Safari fallback that's still useful for older iOS. */
  const standalone = (typeof window.matchMedia === "function"
      && window.matchMedia("(display-mode: standalone)").matches)
    || window.navigator?.standalone === true;
  const supported = isPushSupported();
  const requiresInstall = ios && !standalone;
  const permission = (typeof Notification !== "undefined" && Notification.permission) || "default";
  return { supported, ios, standalone, requiresInstall, permission };
}

/* ─────────────────────────────────────────────────────────────
   Device detection — sent with the subscription so the user can
   manage devices individually in Settings (Slice 5).
   ──────────────────────────────────────────────────────────── */

export function detectDevice() {
  if (typeof navigator === "undefined") {
    return { type: "unknown", os: "unknown", browser: "unknown", userAgent: "" };
  }
  const ua = navigator.userAgent || "";
  const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
  const isStandalone = (typeof window.matchMedia === "function"
      && window.matchMedia("(display-mode: standalone)").matches)
    || window.navigator?.standalone === true;

  let os = "unknown";
  if (/iPhone|iPad|iPod/.test(ua)) os = "ios";
  else if (/Android/.test(ua)) os = "android";
  else if (/Win/.test(ua)) os = "windows";
  else if (/Mac/.test(ua)) os = "macos";
  else if (/Linux/.test(ua)) os = "linux";

  let browser = "unknown";
  /* Order matters — Edge/Chrome both contain "Chrome", check Edge first. */
  if (/Edg\//.test(ua)) browser = "edge";
  else if (/Chrome\//.test(ua)) browser = "chrome";
  else if (/Firefox\//.test(ua)) browser = "firefox";
  else if (/Safari\//.test(ua)) browser = "safari";

  const type = isMobile
    ? (isStandalone ? "mobile_pwa" : "browser")
    : (isStandalone ? "desktop_pwa" : "browser");

  return { type, os, browser, userAgent: ua };
}

/* ─────────────────────────────────────────────────────────────
   Initialization — call once before any subscribe attempt.
   Idempotent: returns cached messaging instance on subsequent calls.
   ──────────────────────────────────────────────────────────── */

export async function initNotifications(/* user (reserved for future per-user ctx) */) {
  if (!isPushSupported()) {
    return { ok: false, supported: false, reason: "unsupported_browser" };
  }
  /* Firebase 10's messaging only works in secure browser contexts that
     support all required APIs. isSupported() is the canonical async check. */
  try {
    const supported = await isSupported();
    if (!supported) {
      return { ok: false, supported: false, reason: "firebase_messaging_unsupported" };
    }
  } catch (_) {
    return { ok: false, supported: false, reason: "firebase_messaging_check_failed" };
  }

  const env = getEnvironmentInfo();
  if (env.requiresInstall) {
    /* iOS Safari needs the PWA installed first. The UI shows
       instructions; we return early so we don't try to subscribe
       (which would fail with a confusing error). */
    return {
      ok: false,
      supported: true,
      requiresInstall: true,
      reason: "ios_requires_install",
      instructions: "لتفعيل الإشعارات على iPhone، اضغط زر المشاركة في Safari ثم اختار 'إضافة إلى الشاشة الرئيسية'، وافتح التطبيق من الأيقونة الجديدة.",
    };
  }

  if (!messaging) {
    /* Lazy import to keep firebase/messaging out of the initial bundle
       for users who never enable push. */
    try {
      const { app } = await import("../firebase.js");
      messaging = getMessaging(app);
    } catch (e) {
      return { ok: false, supported: true, reason: "messaging_init_failed", error: e?.message || String(e) };
    }
  }

  /* Wire foreground message handler — fires when the app is in focus.
     The user chose "native only (no toast)" in the architecture Q&A,
     so we DO NOT show an in-app toast here. The native banner will
     still appear because the service worker's `push` handler runs
     in parallel (Slice 1). Foreground handlers are exposed for future
     use cases (e.g., refreshing data in the background). */
  if (!foregroundUnsub) {
    foregroundUnsub = onMessage(messaging, (payload) => {
      foregroundHandlers.forEach(h => {
        try { h(payload); } catch (_) { /* ignore handler errors */ }
      });
      /* Also fire a window event for any non-React listener. */
      try {
        window.dispatchEvent(new CustomEvent("clark-push-foreground", { detail: payload }));
      } catch (_) { /* ignore */ }
    });
  }

  return { ok: true, supported: true, ready: true };
}

/* ─────────────────────────────────────────────────────────────
   Permission + subscribe — call from a user gesture (button click).
   Never call this on page load — auto-requests get auto-denied.
   ──────────────────────────────────────────────────────────── */

export async function requestPermissionAndSubscribe(user) {
  const init = await initNotifications(user);
  if (!init.ok) return init;

  /* Browser permission prompt. MUST be called from a user gesture
     handler — Chrome/Safari ignore programmatic requests. */
  let permission;
  try {
    permission = await Notification.requestPermission();
  } catch (e) {
    return { ok: false, reason: "permission_request_failed", error: e?.message || String(e) };
  }

  if (permission !== "granted") {
    return { ok: false, reason: "permission_denied", permission };
  }

  /* VAPID public key from env. Vite exposes anything prefixed VITE_
     to the client at build time. The key is a public identifier
     (it's safe to expose), but the server private key MUST stay on
     the server (used by Slice 4's send endpoint via the Admin SDK). */
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  if (!vapidKey) {
    /* Surfaced as a clear admin-actionable error rather than a
       confusing FirebaseError. */
    return {
      ok: false,
      reason: "vapid_key_missing",
      error: "VITE_FIREBASE_VAPID_KEY غير مُعرَّفة. اطلب من الأدمن إضافتها في إعدادات Vercel.",
    };
  }

  /* Get the FCM registration token. The browser bundles the
     subscription endpoint + VAPID identifier into a single token
     for FCM-routed delivery. */
  let token;
  try {
    /* Make sure the SW is ready BEFORE getToken — Firebase will
       grab the active registration internally, but on a fresh page
       load the SW might not be activated yet. */
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      await navigator.serviceWorker.ready;
    }
    token = await getToken(messaging, { vapidKey });
  } catch (e) {
    return { ok: false, reason: "token_failed", error: e?.message || String(e) };
  }

  if (!token) {
    return { ok: false, reason: "token_null" };
  }

  currentToken = token;

  /* Send to backend to persist (Slice 3 endpoint). If the endpoint
     isn't deployed yet, the fetch will 404 — we return ok:true with
     a warning so the user sees "permission granted" but knows the
     server-side wiring is pending. */
  try {
    const idToken = user && typeof user.getIdToken === "function"
      ? await user.getIdToken()
      : null;
    const response = await fetch("/api/notifications/subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(idToken ? { "Authorization": `Bearer ${idToken}` } : {}),
      },
      body: JSON.stringify({
        fcmToken: token,
        device: detectDevice(),
      }),
    });
    if (!response.ok) {
      /* Backend not ready or error — return ok:true with warning so
         the user isn't blocked; they can retry from Settings later. */
      return { ok: true, token, warning: "backend_save_failed", status: response.status };
    }
    const result = await response.json().catch(() => ({}));
    return { ok: true, token, subscriptionId: result.subscriptionId || null };
  } catch (e) {
    return { ok: true, token, warning: "backend_unreachable", error: e?.message || String(e) };
  }
}

/* ─────────────────────────────────────────────────────────────
   Foreground message subscription — React components can register
   a handler that fires when a push arrives while the app is open.
   Returns an unsubscribe function.
   ──────────────────────────────────────────────────────────── */

export function onForegroundMessage(handler) {
  if (typeof handler !== "function") return () => {};
  foregroundHandlers.add(handler);
  return () => { foregroundHandlers.delete(handler); };
}

export function getCurrentToken() {
  return currentToken;
}

/* ─────────────────────────────────────────────────────────────
   Unsubscribe — clear local state. The actual token revocation on
   the backend happens via /api/notifications/unsubscribe (Slice 3).
   ──────────────────────────────────────────────────────────── */

export async function unsubscribeNotifications(user) {
  if (!currentToken) return { ok: true, alreadyUnsubscribed: true };
  const token = currentToken;
  currentToken = null;
  try {
    const idToken = user && typeof user.getIdToken === "function"
      ? await user.getIdToken()
      : null;
    await fetch("/api/notifications/unsubscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(idToken ? { "Authorization": `Bearer ${idToken}` } : {}),
      },
      body: JSON.stringify({ fcmToken: token }),
    });
  } catch (_) { /* best effort */ }
  return { ok: true };
}
