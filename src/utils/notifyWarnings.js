/* ═══════════════════════════════════════════════════════════════
   CLARK — Warning Notification Hooks (V21.9.175, Slice 7/14)
   ───────────────────────────────────────────────────────────────
   Central place to trigger high-urgency push notifications for
   system-level warnings. Wraps notifyWarning from notifications.js
   with dedup + throttle to prevent notification storms.

   Use cases:
   - Critical autoPost failures (accounting integration errors)
   - Listener errors (firestore.rules drift)
   - Bridge offline (WhatsApp Bridge health check failures)
   - Data integrity issues (orphaned references, balance mismatches)

   Architectural decisions:
   - Throttle: same warning category fires AT MOST once per N minutes
   - Dedup: same (category, key) tuple consolidated in the throttle window
   - In-memory state: throttling is per-tab — multiple tabs may each
     fire once per window. Acceptable for now; a Firestore-backed
     dedup would add complexity for marginal value.
   ═══════════════════════════════════════════════════════════════ */

import { notifyWarning } from "./notifications.js";

const DEFAULT_THROTTLE_MS = 5 * 60 * 1000;  /* 5 minutes */
const recentFires = new Map();  /* key → last-fire-timestamp */

/* Public API — call from anywhere a system warning is detected.

   notifyCriticalError({
     key:      "listener:notificationSubscriptions",  // dedup key
     title:    "تحذير — قاعدة بيانات",
     body:     "فشل قراءة الاشتراكات...",
     throttleMs: 5 * 60 * 1000,  // optional, default 5min
   })

   The actual push fires only if the key hasn't fired in the
   throttle window. Returns true if fired, false if throttled.
*/
export function notifyCriticalError({ key, title, body, throttleMs, data }) {
  if (typeof window === "undefined") return false;  /* SSR guard */
  const k = String(key || title || "untitled");
  const now = Date.now();
  const last = recentFires.get(k) || 0;
  const window_ = Number(throttleMs) || DEFAULT_THROTTLE_MS;
  if (now - last < window_) return false;
  recentFires.set(k, now);

  /* Fire-and-forget — the notifyWarning helper has its own .catch. */
  notifyWarning({
    title: String(title || "تحذير CLARK"),
    body: String(body || ""),
    data: { type: "warning", ...(data || {}), key: k },
    audience: { mode: "role", role: "admin" },  /* admin only by default */
  });
  return true;
}

/* Wrap a function so any uncaught exception fires a critical warning
   to admins. Use this around critical paths:

     const safeApprove = withWarningOnError(approveTransfer, {
       key: "approve_transfer",
       title: "خطأ في اعتماد التحويل",
     });
*/
export function withWarningOnError(fn, { key, title }) {
  return async function wrapped(...args) {
    try {
      return await fn(...args);
    } catch (e) {
      notifyCriticalError({
        key,
        title: title || "خطأ غير متوقع",
        body: String(e?.message || e).slice(0, 400),
      });
      throw e;  /* re-throw — we don't swallow errors, just notify */
    }
  };
}

/* Install a global window.onerror + unhandledrejection handler that
   fires a warning notification for crashes the user might not see
   (e.g. background async failures). Call this ONCE in App.jsx main
   useEffect.

   The handler is throttled per-message (1 per message per 10 min)
   to prevent floods if a tight loop crashes. */
let _installed = false;
export function installGlobalErrorWarnings() {
  if (_installed || typeof window === "undefined") return;
  _installed = true;

  window.addEventListener("error", (event) => {
    /* Ignore extension errors + cross-origin script errors (event.error null) */
    if (!event || !event.message) return;
    notifyCriticalError({
      key: "window_error:" + String(event.message).slice(0, 100),
      title: "خطأ في التطبيق",
      body: String(event.message).slice(0, 400),
      throttleMs: 10 * 60 * 1000,  /* 10 min for global errors */
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event?.reason;
    const msg = reason?.message || String(reason || "unknown");
    notifyCriticalError({
      key: "unhandled_rejection:" + msg.slice(0, 100),
      title: "خطأ غير معالج",
      body: msg.slice(0, 400),
      throttleMs: 10 * 60 * 1000,
    });
  });
}
