# CLARK Push Notifications — Setup & Usage Guide

**Version**: V21.9.180 (all 14 slices complete)
**Status**: Feature-complete, ready for production after infrastructure setup

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser / PWA)                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  React App (src/)                                         │   │
│  │  ┌──────────────────────────┐  ┌──────────────────────┐ │   │
│  │  │ NotificationSettingsCard │  │ NotificationBell      │ │   │
│  │  │ - Enable / disable        │  │ - Bell + dropdown    │ │   │
│  │  │ - Category preferences    │  │ - Unread tracking    │ │   │
│  │  │ - Quiet hours             │  │ - Deep-link routing  │ │   │
│  │  │ - Device list             │  └──────────────────────┘ │   │
│  │  │ - Admin broadcast form    │                            │   │
│  │  └────────────┬─────────────┘                            │   │
│  │               │                                            │   │
│  │  ┌────────────▼──────────────────────────────────────┐    │   │
│  │  │ src/utils/notifications.js                         │    │   │
│  │  │ - initNotifications                                │    │   │
│  │  │ - requestPermissionAndSubscribe                    │    │   │
│  │  │ - notifyTreasuryEntry / Broadcast / Warning        │    │   │
│  │  └────────────┬───────────────────────────────────────┘    │   │
│  │               │                                            │   │
│  └───────────────┼────────────────────────────────────────────┘   │
│                  │                                                 │
│  ┌───────────────▼────────────────────────────────────────────┐   │
│  │ Service Worker (public/sw.js V21.9.169+)                   │   │
│  │ - push handler        (displays OS notification)            │   │
│  │ - notificationclick   (deep-link routing)                   │   │
│  │ - pushsubscriptionchange (renewal best-effort)              │   │
│  └─────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
                  │ HTTPS
                  ▼
┌──────────────────────────────────────────────────────────────────┐
│                   VERCEL SERVERLESS FUNCTIONS                     │
│  /api/notifications/                                              │
│  ├── subscribe.js              POST  (any authed user)            │
│  ├── unsubscribe.js            POST  (any authed user)            │
│  ├── renew-subscription.js     POST  (no auth, SW-only)           │
│  ├── send.js                   POST  (admin/manager)              │
│  ├── send-internal.js          POST  (X-CLARK-INTERNAL secret)    │
│  ├── whatsapp-fallback.js      POST  (X-CLARK-INTERNAL secret)    │
│  ├── cron-daily-summary.js     GET   (Vercel cron, 09:00 Cairo)   │
│  └── analytics.js              GET   (admin/manager)              │
└──────────────────┬───────────────────────────────────────────────┘
                   │
       ┌───────────┼──────────────┐
       ▼           ▼              ▼
   ┌────────┐ ┌──────────┐ ┌──────────────┐
   │  FCM   │ │Firestore │ │ WA Bridge    │
   │ (FCM)  │ │          │ │ (fallback)   │
   └────────┘ └──────────┘ └──────────────┘
```

---

## 2. Setup Steps (one-time)

### 2.1 Firebase Console

1. Open https://console.firebase.google.com/project/clarkfactorymanagement
2. Project Settings → **Cloud Messaging** tab
3. Under **Web configuration** → **Web Push certificates**
4. Click **"Generate key pair"**
5. Copy the **public key** (starts with `BNxxx...`)

### 2.2 Vercel Environment Variables

Add the following in Vercel → Project Settings → Environment Variables
(scopes: Production + Preview + Development):

| Name | Value | Purpose |
|---|---|---|
| `VITE_FIREBASE_VAPID_KEY` | The public key from step 2.1 | Client subscribe |
| `FIREBASE_ADMIN_CREDENTIALS` | (already exists for `/api/ai.js`) | Server send |
| `AUTOMATION_TICK_SECRET` | (already exists for `/api/automation-tick`) | `/send-internal`, `/whatsapp-fallback`, `/cron-daily-summary` |
| `WHATSAPP_BRIDGE_URL` | (optional, default `https://clark-rmg.duckdns.org`) | WhatsApp fallback |
| `BOOTSTRAP_ADMIN_UID` | (already exists) | Admin recovery |

V21.9.181 consolidation: instead of adding `CLARK_INTERNAL_SECRET`
and `CRON_SECRET` as new env vars, all 3 push-notification server-to-
server endpoints reuse the existing `AUTOMATION_TICK_SECRET` (already
configured for the automation-tick cron infrastructure). Less env var
sprawl, same security posture.

### 2.3 Deploy

```bash
git push origin main
```

Vercel auto-deploys. The `firestore.rules` update happens via the
existing GitHub Actions workflow (`.github/workflows/deploy-firebase-rules.yml`).

### 2.4 (Optional) Wire NotificationBell into TopBar

The Bell component is shipped but not auto-mounted (`App.jsx` is huge
and edits carry regression risk). To enable:

```jsx
// In App.jsx, find the TopBar JSX and add:
import { NotificationBell } from "./components/NotificationBell.jsx";

// Inside the topbar, near the user menu / version pill:
<NotificationBell T={T} FS={FS}/>
```

---

## 3. User Journey

### 3.1 First-time enablement (any user)

1. Open CLARK → ⚙️ **Settings** → **التواصل والإشعارات** tab
2. Scroll to the **🔔 إعدادات الإشعارات** card
3. Click **"🔔 تفعيل الإشعارات على هذا الجهاز"**
4. Browser shows native permission prompt → click **"سماح"**
5. Card refreshes:
   - Status: ✅ ممنوح
   - Device appears in the list
   - 7 category toggles become visible (all on by default)
   - Quiet hours toggle becomes available

### 3.2 iOS Safari special handling

On iPhone, the card shows an install prompt instead of the enable button:
> 📱 على iPhone — لازم تثبت التطبيق على الشاشة الرئيسية أولاً

Steps:
1. In Safari: tap the **Share** button (⬆️)
2. Scroll down to **"Add to Home Screen"**
3. Confirm
4. Open CLARK from the new home-screen icon (NOT Safari)
5. Now the enable button works

### 3.3 Admin broadcast

In the same Settings card (admin/manager only):

1. Scroll to **📢 إرسال إشعار يدوي** section
2. Choose category (treasury / tasks / instructions / warnings / broadcast / approvals / daily_summary)
3. Choose urgency (low / normal / high)
4. Type title (≤200 chars) and body (≤500 chars)
5. Click **"📤 إرسال لكل المستخدمين"**

A success modal shows delivery stats:
- N أجهزة استهدفت
- N نجحت
- N فشلت
- (N جهاز قديم تم إيقافه) — auto-cleanup of dead tokens

---

## 4. Programmatic API

### 4.1 Fire a notification from client code

```javascript
import { notifyTreasuryEntry, notifyBroadcast, notifyWarning } from "./utils/notifications.js";

// Treasury entry — already wired in TreasuryPg.saveTx
notifyTreasuryEntry({
  type: "in",
  amount: 5000,
  category: "دفعة عميل",
  partyName: "شركة الأمل",
  by: "ahmed",
});  // fire-and-forget, never throws

// Broadcast (any admin/manager)
notifyBroadcast({
  title: "اجتماع طارئ",
  body: "اجتماع 3 العصر في المكتب",
  urgency: "high",
});

// Warning (admin only by default)
notifyWarning({
  title: "تحذير: اختلال جرد",
  body: "موديل M-1234 فيه فرق -5 قطعة في المخزن",
});
```

### 4.2 Critical error wrapper

```javascript
import { withWarningOnError } from "./utils/notifyWarnings.js";

const safeApprove = withWarningOnError(approveTransfer, {
  key: "approve_transfer",
  title: "خطأ في اعتماد التحويل",
});

await safeApprove(transferId);  // if it throws, admins get push + re-throws
```

### 4.3 Server-side (cron, automation)

```javascript
await fetch("https://clark-factory.vercel.app/api/notifications/send-internal", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer " + process.env.AUTOMATION_TICK_SECRET,
  },
  body: JSON.stringify({
    category: "warnings",
    title: "Bridge offline",
    body: "WhatsApp Bridge مش شغال — راجع Contabo",
    urgency: "high",
    audience: { mode: "role", role: "admin" },
    triggeredBy: { source: "health-check-cron" },
  }),
});
```

---

## 5. Privacy & Safety

| Concern | Mitigation |
|---|---|
| Lock-screen visibility | Title + body capped at 200/500 chars; admin discretion required |
| Token theft | Bound to user UID server-side, not from body |
| Notification storms | Per-key 5-min throttle (notifyWarnings); send dedup via tag |
| Browser ban risk | OS-level permission required; user can revoke anytime |
| WhatsApp Bridge ban | Fallback is opt-in only, never auto-triggered |
| Dead tokens | Auto-deactivated on `messaging/invalid-registration-token` |
| Quiet hours | Server-side enforcement (except high urgency) |
| Cross-user token | Server uses verified UID, not body UID |

---

## 6. Slice Map (V21.9.169 → V21.9.180)

| # | Version | Files | Status |
|---|---|---|---|
| 1 | V21.9.169 | `public/sw.js` | ✅ SW handlers |
| 2 | V21.9.170 | `src/utils/notifications.js` | ✅ Client setup |
| 3 | V21.9.171 | `api/notifications/{subscribe,unsubscribe,renew-subscription}.js` + rules | ✅ Subscription backend |
| 4 | V21.9.172 | `api/notifications/{send,send-internal}.js` + rules | ✅ Send endpoints |
| 5 | V21.9.173 | `src/components/NotificationSettingsCard.jsx` + `SettingsPg.jsx` | ✅ Settings UI |
| 6 | V21.9.174 | `src/pages/TreasuryPg.jsx` + helpers in notifications.js | ✅ Treasury auto-trigger |
| 7 | V21.9.175 | `src/utils/notifyWarnings.js` | ✅ Warning infrastructure |
| 8 | V21.9.176 | `src/components/NotificationBell.jsx` | ✅ Notification Center (not yet wired in TopBar) |
| 9 | V21.9.177 | `api/notifications/send.js` | ✅ Rich actions (action buttons) |
| 10 | V21.9.178 | `api/notifications/cron-daily-summary.js` + `vercel.json` | ✅ Daily summary cron |
| 11 | V21.9.177 | `api/notifications/{send,send-internal}.js` + UI | ✅ Quiet hours |
| 12 | V21.9.179 | `api/notifications/whatsapp-fallback.js` | ✅ WhatsApp fallback (opt-in) |
| 13 | V21.9.180 | `api/notifications/analytics.js` | ✅ Analytics endpoint |
| 14 | V21.9.180 | `docs/PUSH_NOTIFICATIONS.md` | ✅ This document |

---

## 7. Troubleshooting

### "إعدادات السيرفر ناقصة — تواصل مع الأدمن"
→ `VITE_FIREBASE_VAPID_KEY` not set in Vercel. See section 2.2.

### Permission prompt never appears
→ Either browser blocked the request (check site settings), or you're
on iOS Safari without PWA install. See section 3.2.

### Permission granted but no push arrives
1. Check `notificationHistory` in Firestore — was the send logged?
2. Check `notificationSubscriptions` — is your token there with `active: true`?
3. Check Vercel function logs for `/api/notifications/send`
4. Check browser DevTools → Application → Service Workers → verify
   the SW is activated (status: "activated and running")

### "Authorization: Bearer header مطلوب"
→ Calling `/send-internal` or `/whatsapp-fallback` without the Bearer
header. See section 4.3.

### Daily summary not arriving at 9 AM
1. Confirm `AUTOMATION_TICK_SECRET` env var is set in Vercel
2. Check Vercel cron logs (Project → Settings → Crons)
3. Verify your subscription has `preferences.daily_summary !== false`
4. Verify your `quietHours` doesn't include 9 AM Cairo

---

## 8. Future Extensions (not in current scope)

- TopBar Bell integration (manual step per section 2.4)
- AI-generated daily summary content (depends on AI Agent feature)
- Geofenced notifications (location permission flow)
- Notification translation (English variant)
- Sustained-failure detection cron (auto-WhatsApp fallback)
- Push from server events without webhook glue (would need Firebase
  Cloud Functions or similar)

---

*Last updated: V21.9.180, 2026-05-24*
