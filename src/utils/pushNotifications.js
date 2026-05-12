/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Push Notifications Client (V21.12.0 — #13 Slice 1)
   ───────────────────────────────────────────────────────────────────────
   Client-side push notification setup using Firebase Cloud Messaging (FCM)
   on top of the Web Push standard. Talks to the SW push handlers added
   in public/sw.js.

   --- iOS Safari note ---
   iOS 16.4+ supports Web Push BUT only after PWA install (Add to Home
   Screen). Detect via `display-mode: standalone` + `iPad|iPhone|iPod`
   in userAgent. If iOS + not standalone, return requiresInstall=true and
   show install instructions BEFORE requesting permission.

   --- Env vars needed ---
   VITE_FIREBASE_VAPID_KEY — Firebase Cloud Messaging Web Push public key
                             (Firebase Console → Project Settings →
                              Cloud Messaging → Web Push certificates)

   --- API surface ---
   detectPushSupport() → { supported, requiresInstall, reason }
   requestPermissionAndSubscribe(user) → { ok, token, reason? }
   getCurrentSubscription() → existing FCM token (or null)
   unsubscribe(user) → { ok }
   ═══════════════════════════════════════════════════════════════════════ */

import { getToken, getMessaging, onMessage } from "firebase/messaging";
import { getApp as _getFirebaseApp } from "firebase/app";

let _messaging = null;

function ensureMessaging(){
  if(_messaging) return _messaging;
  if(typeof window === "undefined") return null;
  if(!("Notification" in window)) return null;
  if(!("serviceWorker" in navigator)) return null;
  try {
    _messaging = getMessaging(_getFirebaseApp());
  } catch(e){
    console.warn("[push] FCM init failed:", e?.message);
    return null;
  }
  return _messaging;
}

export function detectPushSupport(){
  if(typeof window === "undefined") return { supported: false, reason: "ssr" };
  if(!("Notification" in window)) return { supported: false, reason: "no_notification_api" };
  if(!("serviceWorker" in navigator)) return { supported: false, reason: "no_sw" };
  if(!("PushManager" in window)) return { supported: false, reason: "no_push_api" };

  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isStandalone = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches
                     || window.navigator.standalone;

  if(isIOS && !isStandalone){
    return {
      supported: true,
      requiresInstall: true,
      reason: "ios_needs_pwa_install",
      message: "لتلقي إشعارات على iPhone، لازم تثبت التطبيق على الشاشة الرئيسية أولاً",
    };
  }

  return { supported: true, ready: true };
}

export function detectDevice(){
  if(typeof window === "undefined") return { type: "unknown", os: "unknown", browser: "unknown" };
  const ua = navigator.userAgent;
  const isMobile = /Android|iPhone|iPad/i.test(ua);
  const isStandalone = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches
                     || window.navigator.standalone;
  let os = "unknown";
  if(/iPhone|iPad|iPod/.test(ua)) os = "ios";
  else if(/Android/.test(ua)) os = "android";
  else if(/Win/.test(ua)) os = "windows";
  else if(/Mac/.test(ua)) os = "macos";
  else if(/Linux/.test(ua)) os = "linux";
  let browser = "unknown";
  if(/Edg\//.test(ua)) browser = "edge";
  else if(/Chrome\//.test(ua)) browser = "chrome";
  else if(/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = "safari";
  else if(/Firefox\//.test(ua)) browser = "firefox";
  return {
    type: isMobile ? (isStandalone ? "mobile_pwa" : "browser") : (isStandalone ? "desktop_pwa" : "browser"),
    os, browser, userAgent: ua,
  };
}

/* Request notification permission + acquire FCM token. */
export async function requestPermissionAndSubscribe(user){
  const support = detectPushSupport();
  if(!support.supported) return { ok: false, reason: support.reason };
  if(support.requiresInstall) return { ok: false, reason: "requires_install", message: support.message };

  /* Permission */
  const perm = await Notification.requestPermission();
  if(perm !== "granted") return { ok: false, reason: "permission_denied" };

  const messaging = ensureMessaging();
  if(!messaging) return { ok: false, reason: "messaging_init_failed" };

  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  if(!vapidKey){
    return { ok: false, reason: "missing_vapid_key",
      message: "VITE_FIREBASE_VAPID_KEY غير معرّف في Vercel env vars" };
  }

  let token;
  try {
    token = await getToken(messaging, { vapidKey });
  } catch(e){
    return { ok: false, reason: "token_failed", message: e?.message };
  }
  if(!token) return { ok: false, reason: "no_token" };

  /* Save to server */
  if(!user || typeof user.getIdToken !== "function"){
    return { ok: false, reason: "no_user_auth" };
  }
  try {
    const idToken = await user.getIdToken();
    const r = await fetch("/api/notifications/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + idToken },
      body: JSON.stringify({ fcmToken: token, device: detectDevice() }),
    });
    const data = await r.json();
    if(!data.ok) return { ok: false, reason: "save_failed", message: data.error };
  } catch(e){
    return { ok: false, reason: "network_error", message: e?.message };
  }

  return { ok: true, token };
}

/* Returns current FCM token if browser already granted permission. */
export async function getCurrentSubscription(){
  const messaging = ensureMessaging();
  if(!messaging) return null;
  if(Notification.permission !== "granted") return null;
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  if(!vapidKey) return null;
  try {
    return await getToken(messaging, { vapidKey });
  } catch(e){
    return null;
  }
}

export async function unsubscribe(user){
  if(!user || typeof user.getIdToken !== "function") return { ok: false };
  const token = await getCurrentSubscription();
  if(!token) return { ok: true };/* already none */
  try {
    const idToken = await user.getIdToken();
    await fetch("/api/notifications/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + idToken },
      body: JSON.stringify({ fcmToken: token }),
    });
  } catch(e){}
  return { ok: true };
}

/* Foreground message handler — call once on app mount. The push event in
   sw.js fires when the app is BACKGROUNDED. When foregrounded, FCM
   delivers via onMessage and we show an in-app toast instead. */
export function initForegroundPushHandler(callback){
  const messaging = ensureMessaging();
  if(!messaging) return null;
  try {
    return onMessage(messaging, (payload) => {
      if(typeof callback === "function") callback(payload);
      else {
        /* Default: dispatch custom event the app can listen to */
        if(typeof window !== "undefined"){
          window.dispatchEvent(new CustomEvent("clark-push-foreground", { detail: payload }));
        }
      }
    });
  } catch(e){
    return null;
  }
}
