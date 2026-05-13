/* ════════════════════════════════════════════════════════════════════════
   CLARK V16.79 — About Version Modal
   ════════════════════════════════════════════════════════════════════════
   
   Modal popup يعرض changelog لآخر 10 إصدارات.
   يفتح من زر صغير في TopBar.
   
   الإصدار الحالي يظهر مميز في الأعلى بلون مختلف.
   كل إصدار له:
     - رقم الإصدار + تاريخ
     - تصنيف (✨ ميزة جديدة | 🐛 إصلاح | ⚡ تحسين | 🔧 صيانة | ⚠️ تغيير معماري)
     - عناوين التغييرات
     - تفاصيل (لو محتاجة شرح)
   ════════════════════════════════════════════════════════════════════════ */

import { useEffect } from "react";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";

/* ═══ CHANGELOG DATA ═══
   آخر 10 إصدارات (V16.70 → V16.79).
   كل إصدار: version, date, type[], title, changes[]
   
   types: feature (ميزة جديدة), fix (إصلاح), improvement (تحسين), 
          maintenance (صيانة), architectural (تغيير معماري) */
const CHANGELOG = [
  {
    version: "V21.13.0",
    date: "2026-05-13",
    types: ["fix", "architectural", "maintenance"],
    title: "🚨 إصلاح حرج — Writes blocked + SW version sync + missing rules",
    changes: [
      { type: "fix", text: "🚨 [CRITICAL FIX — Write blocking bug]\n\n**الـ Symptom:** بعد التحديث لـ V21.12.0، المستخدمين بـ يضغطوا 'Save' على الخزنة أو أي حاجة في التطبيق، الحركة بـ تختفي بدون ما تتسجل في Firestore. الـ UI بـ يبدو optimistic-updated، لكن بعد reload الـ data بـ ترجع للحالة القديمة.\n\n**الـ ROOT CAUSE (V21.11.3 regression):**\nالـ Tag Migration الـ auto-run في `App.jsx` السطر 1429 كان بـ يـ trigger على كل login لو الـ user عنده Shopify customers بـ string tags. الـ migration بـ يـ mutate كل الـ customers في **upConfig() واحد** — لو 1000+ عميل، ده هينتج write عملاق:\n\n1. الـ migration بـ يـ pile-up في `upConfigWriteQueueRef` (الـ serialized write queue من V19.55)\n2. الـ partitioned sync بـ يحاول يكتب 1000+ Firestore document بالتوازي\n3. بـ يـ hit rate limits أو بـ يـ stall على slow connection\n4. **كل writes بعدها (Treasury, Sales, Settings...) بـ تنتظر في queue blocked**\n5. من user perspective: 'بـ نضغط Save بس مفيش حاجة بـ تتسجل'\n\n**الإصلاح:**\nالـ auto-run بـ disabled تماماً في V21.13.0. الـ tags بـ تشتغل كـ strings (الـ existing code handles both formats). الـ admin يقدر يـ run الـ migration manually من Settings → الصيانة لما يكون مستعد (الـ button بـ يجي في V21.14)." },
      { type: "fix", text: "🔧 [Service Worker version sync]\n\n`public/sw.js` كان عنده `SW_VERSION = 'v21.9.35'` بينما الـ APP_VERSION بقى V21.12.0. ده بـ يكسر الـ V21.9.21 contract:\n\n- الـ cache invalidation gated على bump الـ SW_VERSION مع كل release\n- لو نفس الـ string، الـ SW بـ يـ keep serving stale chunks من cache\n- mobile users بـ يفضلوا على JS قديم لمدة طويلة بعد deploy\n\n**الإصلاح:** SW_VERSION → 'v21.13.0' + توثيق الـ bump في CLAUDE.md release routine." },
      { type: "fix", text: "🔧 [Missing firestore.rules + missing renew-subscription endpoint]\n\nV21.12.0 ضافت push notifications collections بدون ما تـ define الـ rules:\n- `notificationSubscriptions/{uid}` — كل user عنده doc بـ FCM tokens\n- `notificationHistoryDays/{YYYY-MM-DD}` — audit للـ pushes الـ مبعوتة\nالـ default deny كان بـ يـ block الـ client reads — Slice 2 (Notification Center) ما كانش هـ يقدر يـ subscribe على notification history.\n\n**الإصلاح:** rules مضافة بـ scope صحيح (user-own doc + manager+ for history).\n\nكمان: `/api/notifications/renew-subscription` كان referenced في الـ SW بس مش موجود (404). أضفنا stub endpoint يـ accept الـ payload (الـ proper flow هو الـ /subscribe من الـ client بعد reload)." },
      { type: "doc", text: "📋 [Test plan + اللي جاي]\n\n**Test V21.13.0:**\n1. افتح CLARK → جرّب تضيف entry جديدة على الخزنة\n2. Hard refresh (Ctrl+Shift+R) → الـ entry لازم تبقى موجودة\n3. جرّب تعدّل أي customer/supplier/order → يـ persist\n4. لو كان عندك customers بـ Shopify string tags، شوف tagRegistry فاضي = expected (migration اتـ disable)\n5. الإشعارات الـ Push: لسه شغّالة من Settings → الصيانة → 🔔 (نفس flow V21.12.0)\n\n**اللي جاي (V21.14):**\n• Manual 'Run Tag Migration' button في Settings → الصيانة → 🏷️ نظام الـ Tags\n• الـ button هـ يـ batch الـ customers (50 لكل upConfig) عشان ما يـ hang الـ queue تاني\n• Progress bar + cancel option\n\n**Anti-pattern تـ added لـ CLAUDE.md §10:**\nمفيش حاجة auto-run في useEffect تـ trigger upConfig() على كل login لو فيها احتمال يكون كبير الحجم. الـ migrations الكبيرة (>100 entries) لازم تكون manual-triggered أو batched." },
    ]
  },
  {
    version: "V21.12.0",
    date: "2026-05-12",
    types: ["feature", "architectural"],
    title: "🔔 Phase 16 — Push Notifications Foundation (#13 Slice 1)",
    changes: [
      { type: "feature", text: "✨ [Feature #13 Slice 1 — Push Notifications foundation]\n\nأول step في الـ Real-time Push system. الـ FCM VAPID اللي عملته اتـ wire-ـها كاملة. الـ Slice ده بـ يـ ship:\n\n**1. Service Worker push handlers (`public/sw.js`):**\nADDITIVE — مفيش modification لأي existing handler:\n• `push` event: receives payload, shows native notification بـ RTL + Egyptian Arabic\n  - Supports: title, body, icon, badge, image, tag, data, actions, urgency\n  - vibrate pattern للموبايل (200/100/200ms)\n  - requireInteraction للـ urgency='high'\n  - silent للـ urgency='low'\n• `notificationclick`: focuses existing tab أو يفتح جديدة\n  - Smart routing: data.type → /?tab={target}\n  - Action handlers (approve/snooze/dismiss)\n  - postMessage للـ open tab\n• `pushsubscriptionchange`: auto-renew + POST لـ /api/notifications/renew-subscription\n\n**2. Client utility (`src/utils/pushNotifications.js`):**\n• `detectPushSupport()` — يفصل بين browsers + iOS PWA install requirement\n• `detectDevice()` — يـ classify الـ device بـ os/browser/type\n• `requestPermissionAndSubscribe(user)` — الـ full flow: permission → FCM token → save\n• `getCurrentSubscription()` — peek بدون permission prompt\n• `unsubscribe(user)` — mark device inactive\n• `initForegroundPushHandler(cb)` — onMessage handler للـ in-app toasts\n\n**3. Backend endpoints (Vercel functions):**\n• `POST /api/notifications/subscribe` — verifies Firebase token + saves FCM token + device metadata to `notificationSubscriptions/{uid}`. Idempotent — re-subscribe updates lastSeenAt.\n• `POST /api/notifications/unsubscribe` — marks device inactive + unsubscribedAt\n• `POST /api/notifications/send` — admin-only (gates by usersList role). Resolves recipients → tokens → preference filter → FCM sendEachForMulticast → notificationHistory audit. Auto-flags revoked tokens as inactive.\n\n**4. Settings UI (`PushNotificationsCard` in SettingsPg → Maintenance):**\n• Status badge: granted/denied/default\n• 'فعّل الإشعارات' button للـ default state\n• 'إرسال إشعار اختبار' button للـ granted state (sends test push to current user)\n• iOS install instructions لو الـ user على Safari iOS بدون PWA install\n• Permission denied → guide للـ browser settings" },
      { type: "architectural", text: "🏗 [Key decisions]\n\n**1. FCM over raw Web Push:**\nالـ user عمل setup للـ Firebase Cloud Messaging. الـ FCM Admin SDK بـ يـ handle:\n• Batching (up to 500 tokens per send)\n• Auto-retry\n• Token validation\n• Cross-platform (Android via FCM-native, iOS/Web via Web Push)\nبدون ما نـ implement VAPID encryption يدوي.\n\n**2. iOS Safari constraint:**\niOS 16.4+ يدعم Web Push **بس** بعد PWA install (Add to Home Screen). الـ `detectPushSupport()` بـ يـ return `requiresInstall: true` لو Safari iOS غير standalone. الـ Settings UI بـ يـ show install instructions بدل permission button — يمنع silent failure.\n\n**3. Per-device tokens (not per-user):**\nالـ user يقدر يـ subscribe من iPhone + Mac + Android. كل device بـ token مستقل في الـ `devices[]` array داخل `notificationSubscriptions/{uid}`. Idempotent: re-subscribe من نفس الجهاز يحدّث lastSeenAt بدلاً من duplicate.\n\n**4. Category preferences:**\n8 categories: treasury, tasks, instructions, warnings, approvals, ai_agent, daily_summary, document_expiry.\nالـ `/send` endpoint بـ يـ filter بـ `preferences[category] === false` قبل ما يبعت. الـ user يقدر يـ pause specific categories دون unsubscribe كامل.\n\n**5. Daily-split audit (`notificationHistoryDays/{YYYY-MM-DD}`):**\nالـ history غير محفوظ في factory/config — daily split من اليوم الأول لـ avoid 1MB limit. كل send يكتب entry بـ deliveryStatus per-user.\n\n**6. Auto-cleanup of revoked tokens:**\nلو الـ FCM returns `registration-token-not-registered`، الـ `/send` endpoint بـ يـ flag الـ device active=false تلقائياً — مفيش manual cleanup مطلوب.\n\n**7. Critical privacy: NO sensitive data in payload:**\nالـ push payload visible في OS notification center حتى لو phone مقفول. الـ Slice ده مش بـ يـ embed customer phones, balances, passwords. الـ payload = title + body عام; التفاصيل تظهر لما الـ user يفتح الـ app." },
      { type: "doc", text: "📋 [Test plan + Slices الجاية]\n\n**Test V21.12.0:**\n1. افتح CLARK على Chrome desktop (الأسهل للـ test)\n2. Settings → الصيانة → 🔔 الإشعارات الفورية\n3. اضغط '🔔 فعّل الإشعارات على هذا الجهاز' → permission prompt → Allow\n4. الـ status بقى '✓ مفعّلة' + token preview\n5. اضغط '🧪 إرسال إشعار اختبار' → notification يظهر فوراً في الـ system tray\n6. اضغط الـ notification → الـ CLARK tab بـ يـ focus\n7. لـ iOS Safari: نفس الـ flow بس بعد Add to Home Screen أولاً\n\n**اللي جاي (Slices 2-14 من #13):**\n• Slice 2: Notification bell + in-app history dropdown\n• Slice 3: NotificationSettingsTab (per-category prefs + quiet hours)\n• Slice 4: Integration hooks (treasury create, task assign, etc.) — auto-triggers\n• Slice 5: WhatsApp fallback (لو push فشل لـ 24h)\n• Slice 6: Rich actions (approve/snooze buttons)\n• Slice 7: Daily summary cron\n• Slice 8: Document expiry warnings cron\n• Slices 9-14: Analytics, batching, AI summaries, anomaly detection, voice notes, multi-language" },
    ]
  },
  {
    version: "V21.11.3",
    date: "2026-05-12",
    types: ["feature", "architectural"],
    title: "🏷️ Phase 15b — TagPicker + TagFilter components + Shopify migration (#10 Slice 2)",
    changes: [
      { type: "feature", text: "✨ [#10 Slice 2 — Reusable components + auto-migration]\n\nالخطوة الجاية من نظام الـ Tags. الـ Slice ده يـ ship:\n\n**1. Reusable Components (in `src/components/TagPicker.jsx`):**\n• `<TagPicker>` — Multi-select picker للـ entity edit forms. خصائصها:\n  - Filters registry by `appliesTo.includes(entityType) && !archived`\n  - Color-coded chips للـ selected tags\n  - Inline search + dropdown للـ unselected\n  - readOnly mode للـ view-only contexts\n  - Empty state message لو مفيش tags معرّفة\n• `<TagChips>` — Read-only display variant. سحب الـ table rows. يدعم max + size props.\n• `<TagFilter>` — Chip strip filter للـ list views. توجد modes AND/OR.\n\n**2. Auto-migration (`src/utils/tagMigration.js`):**\nيتشغّل تلقائياً مرة واحدة على load — gated on `_tagMigrationV1Done` flag في factory/config:\n• يـ scan `data.customers` للـ entries بـ string-tags (من Shopify sync)\n• يـ lookup الـ nameLC في tagRegistry — لو موجود يستبدل بالـ ID\n• لو مش موجود، يـ create entry جديد في الـ registry مع preset color\n• الـ customers بقت بـ ID-based tags بعد المايجريشن\n\n**3. Wire في App.jsx:**\nuseEffect جديد بعد الـ splitDaysMigration — بـ يتـ guard بـ:\n  - `tagMigrationRef.current` (in-memory lock)\n  - `configDoc[TAG_MIGRATION_FLAG]` (Firestore flag)\n  - `isTagMigrationNeeded(configDoc)` (no-op لو مفيش string tags)" },
      { type: "architectural", text: "🏗 [Why migration before entity integration]\n\nSlice 1 (V21.11.2) شـحن الـ registry. الـ data الموجودة في `data.customers[i].tags` كانت string arrays (من Shopify). الـ Slice 2 محتاج يحوّلها لـ ID arrays قبل ما الـ entity pages تـ render tags بـ TagChips.\n\nالـ migration logic:\n```js\nentity.tags = entity.tags.map(t => {\n  if(t.startsWith('tag_')) return t;        // already an ID\n  let tag = registry.find(r => r.nameLC === t.toLowerCase());\n  if(!tag){\n    tag = createTag({ name: t, color: preset[i++ % 10], appliesTo: [type] });\n    registry.push(tag);\n  }\n  return tag.id;\n});\n```\n\nمميزاته:\n• Idempotent — لو ركض قبل، يـ skip\n• Preserves names — الـ admin يشوف نفس tag names في الـ registry\n• appliesTo extended — لو الـ tag كان لـ customer، يـ added 'customer' لـ appliesTo\n• Audit — `_tagMigrationV1Done` بـ يحفظ `{ranAt, ranBy, migratedCustomers, createdTags}`\n\nالـ Components ready للـ Slice 3+ integration في entity pages بدون أي حاجة تانية." },
      { type: "improvement", text: "🎨 [Component design notes]\n\n**TagPicker:**\n• Compact chip layout مع X button per tag\n• Add button بـ '+ placeholder' wording للـ dashed border style\n• Dropdown يفتح لـ unselected tags filtered by search\n• Search clears + closes after each pick\n• Hover preview على colored bg\n• Empty-registry state بـ link لـ Settings (admin workflow)\n\n**TagChips:**\n• Smallest possible style (1-3px padding)\n• 'sm' و 'md' sizes\n• `max` prop yields '+N' overflow indicator\n• Display-only — مفيش events\n\n**TagFilter:**\n• Toggle each tag chip\n• Clear button بـ count\n• AND/OR mode toggle (يظهر فقط لو > 1 selected)\n• Returns nothing لو الـ registry فاضي لـ هذا الـ entityType" },
      { type: "doc", text: "📋 [Test plan + الـ Slices الجاية]\n\n**Test V21.11.3:**\n1. أنشئ tag في Settings → الصيانة → 🏷️ نظام الـ Tags بـ appliesTo=customer (مثلاً 'VIP')\n2. لو الـ data بـ يحتوي customers من Shopify بـ string tags، الـ migration auto-runs على الـ load\n3. افتح Firebase Console → factory/config → tagRegistry → tags جديدة ظهرت بألوان preset\n4. الـ customer.tags بقت IDs بدل strings\n5. الـ flag `_tagMigrationV1Done` موجود في الـ config — مفيش re-run\n\n**اللي جاي (Slices 3+ من #10):**\n• Slice 3: CustDeliverPg integration — TagFilter في الفلاتر + TagChips في الـ customer rows + TagPicker في الـ edit form\n• Slice 4: PurchasePg supplier tab integration\n• Slice 5: Inventory items + Orders\n• Slice 6-10: Workshops, employees, invoices, treasury, checks + cross-entity view + analytics\n• Slice مستقل: Shopify bi-directional sync adapter (IDs ↔ string names)\n\n**Roadmap status (13 versions shipped today):**\n✅ #3 Sales+Purchase Pipeline (Slices 1-10)\n✅ #4 Statement of Account\n✅ #7 Legacy Invoice Merger\n🚧 #10 Slices 1-2 (foundation + components + migration)\n⏳ #5, #8, #9, #10 Slices 3-10, #11, #12, #13, #14, #15 — pending fresh sessions" },
    ]
  },
  {
    version: "V21.11.2",
    date: "2026-05-12",
    types: ["feature", "architectural"],
    title: "🏷️ Phase 15 — نظام الـ Tags المركزي (#10 Slice 1)",
    changes: [
      { type: "feature", text: "✨ [Feature #10 Slice 1 — Universal Tag Registry]\n\nنظام tags first-class مركزي يشتغل على كل entities المصنع. الـ Slice 1 يشحن الـ foundation:\n• Card جديد في Settings → الصيانة → 🏷️ نظام الـ Tags\n• CRUD كامل: إنشاء، تعديل، أرشفة، استعادة، حذف\n• كل tag بـ ID ثابت + اسم + لون preset + icon اختياري + وصف\n• تحديد الـ entity types اللي ينطبق عليها (10 أنواع: عملاء، موردين، أصناف، موديلات، ورش، موظفين، فواتير مبيعات/مشتريات، حركات خزنة، شيكات)\n• Usage count: يعرض كل tag على كام entity مستخدم\n• 10 ألوان preset + 20 icon preset matching CLARK theme\n• Preview حي قبل الحفظ\n• Archive vs Delete:\n  - Archive: keeps existing references (الـ entities الموصولة بـ الـ tag تفضل)\n  - Delete: فقط لو usageCount=0\n• Duplicate detection: مفيش tag بنفس الـ nameLC (case-insensitive)" },
      { type: "architectural", text: "🏗 [Architecture]\n\n**1. First-class objects, NOT strings:**\n```js\ndata.tagRegistry = [{\n  id: 'tag_vip',        // stable gid — never changes\n  name: 'VIP',\n  nameLC: 'vip',        // for case-insensitive dedup\n  color: '#F59E0B',\n  icon: '⭐',\n  appliesTo: ['customer', 'supplier'],\n  usageCount: 0,\n  archived: false,\n  ...\n}]\n```\n\n**2. IDs في الـ entities (Slice 2+):**\n```js\ncustomer.tags = ['tag_vip', 'tag_cairo']  // IDs مش names\n```\nلما تـ rename الـ tag مرة في الـ registry، الـ entities بـ تـ reflect tلقائياً (مفيش data migration).\n\n**3. Utility functions في src/utils/tags.js:**\n• `createTagMutator(d, args)` — يمنع duplicates\n• `updateTagMutator(d, tagId, updates)` — partial update\n• `archiveTagMutator` / `restoreTagMutator` — soft delete\n• `deleteTagMutator` — hard delete (caller must verify usage=0)\n• `getTagUsageCount(tagId, data)` — scan كل entity arrays\n• `filterByTags(entities, tagIds, mode)` — Set-based O(N) filter\n• `resolveTagsForDisplay(tagIds, registry)` — IDs → objects\n• `getTagsForEntityType(registry, type)` — filtered by appliesTo\n• `migrateEntityTagsStringsToIds(d, entity, type)` — for Shopify legacy migration (Slice 2)\n\n**4. Shopify integration (Slice 2 جاي):**\nالـ customer.tags الحالية من Shopify بـ string format. الـ migrateEntityTagsStringsToIds helper بـ يحوّلها لـ ID-based مع المحافظة على الـ sync الـ bi-directional عبر adapter layer.\n\n**5. Permissions:**\nالـ Card موجود في Settings → الصيانة (admin only). الـ Slices الجاية هـ تضيف per-entity tag filters في List views (تحت الـ permission الموجود للـ entity)." },
      { type: "doc", text: "📋 [Test plan + Roadmap]\n\n**Test V21.11.2:**\n1. Settings → الصيانة tab\n2. Scroll للـ Card '🏷️ نظام الـ Tags'\n3. اضغط '➕ tag جديد'\n4. اكتب 'VIP' + اختر لون أصفر + اختر icon ⭐ + appliesTo: customer + supplier\n5. شوف الـ preview تحت → tag chip بـ ⭐ VIP يظهر\n6. احفظ → الـ tag يظهر في الـ grid\n7. اعمل tag تاني بنفس الاسم 'vip' → ⛔ error 'فيه tag بنفس الاسم'\n8. اضغط ✏️ على VIP → عدّل الوصف → احفظ\n9. اضغط 📦 archive → الـ tag بقى opaque + يختفي\n10. فعّل 'إظهار المؤرشف' → يظهر تاني مع زرار ♻️ restore\n\n**اللي جاي (Slices 2-10 من #10):**\n• Slice 2: TagPicker component + integration في CustDeliverPg (customer tags)\n• Slice 3: PurchasePg supplier tab\n• Slice 4: Inventory items\n• Slice 5: Orders (موديلات)\n• Slice 6: Cross-entity tag view\n• Slice 7: Shopify bi-directional sync adapter\n• Slice 8: Tag analytics dashboard\n• Slice 9-10: Extended entities (invoices, treasury, checks)\n\n**Roadmap status (11 versions shipped today):**\n✅ #3 Sales+Purchase Pipeline (Slices 1-10)\n✅ #4 Statement of Account\n✅ #7 Legacy Invoice Merger\n🚧 #10 Slice 1 (this version)\n⏳ #5 AI Agent — pending fresh session (needs Bridge V2 SSH deploy)\n⏳ #8 Journal Draft + Subsidiary — pending\n⏳ #9 Treasury Close — pending\n⏳ #11/#12/#13/#14/#15 — pending\n⏳ #10 Slices 2-10 — pending" },
    ]
  },
  {
    version: "V21.11.1",
    date: "2026-05-12",
    types: ["feature"],
    title: "🔀 Phase 14 — دمج الفواتير القديمة المتفرقة (Feature #7)",
    changes: [
      { type: "feature", text: "✨ [Feature #7 — Legacy Invoice Merger]\n\nيكمّل الـ #4 Statement of Account: لما الكشف بـ يـ flag الـ legacy fragmented invoices، الأداة دي بـ تنظفها.\n\n**الـ scope:**\n• Card جديد في Settings → الصيانة → 🔀 دمج الفواتير المتفرقة\n• زرار '🔍 افحص' بـ يـ scan الفواتير في:\n  - factory/config.salesInvoices + salesInvoicesDays/*\n  - factory/config.purchaseInvoices + purchaseInvoicesDays/*\n• الـ scan يـ detect الـ sessions اللي عندها > 1 فاتورة (deliveryRefs/receiptRefs مع نفس sessionId)\n• يـ classify كل جلسة:\n  - 'all-draft' — كل الفواتير draft → ✅ مرشحة للدمج (auto-selected)\n  - 'all-posted' — كلها مرحّلة → 🔒 ممنوع التعديل\n  - 'mixed' — بعضها draft + بعضها posted → ⚠️ ممنوع (خطر محاسبي)\n• الـ admin يختار من الجلسات المرشحة + يضغط 🔀 merge\n• الـ backend بـ يعمل backup كامل لـ factory/config قبل أي merge\n• كل merge بـ يـ log في migrationLog collection للـ audit" },
      { type: "architectural", text: "🏗 [Server-side endpoint + DiagnosticsPanel UI]\n\n**1. Server endpoint:** `/api/admin/merge-fragmented-invoices.js`\n• Firebase Admin auth (verifyIdToken) — admin only\n• Two-phase: dryRun=true للـ preview، dryRun=false للـ apply\n• Batch limit: 100 sessions per call (يمنع Vercel timeout)\n• Backup → executeMerge → migrationLog → response\n\n**2. Keeper/Victims pattern:**\n• الـ keeper = أقدم invoice في الجلسة (sorted by invoiceNo ASC)\n• الـ victims = الباقي — يـ get merged في الـ keeper:\n  - الـ items[] concatenated\n  - الـ deliveryRefs[]/receiptRefs[] appended\n  - الـ subtotal + discount summed\n  - الـ total = r2(subtotal - discount)\n• الـ victims يـ removed من الـ daily-split docs\n• الـ keeper بقى يحمل `mergedFrom: [...]` + `mergedAt` + `mergedBy`\n\n**3. Counter gaps accepted:**\nبعد الـ merge، أرقام الـ victim invoices ضاعت (gap في الـ sequence INV-001, INV-003 — مفيش INV-002). ده مقبول محاسبياً للـ drafts ولا يـ rollback. الـ migration log يـ document الأرقام اللي اتشالت.\n\n**4. Two-collection scan:**\nالأداة بـ تـ scan الـ daily splits + الـ factory/config legacy array. الفواتير اللي اتعملت قبل V19.50 ممكن تكون لسه في factory/config، والجديدة في daily splits. كلهم يتم detect-هم.\n\n**5. Posted protection:**\nالـ server-side validation تـ refuse أي merge على session فيها أي invoice بـ status='posted'. ده hard rule مش negotiable — accounting integrity." },
      { type: "doc", text: "📋 [Test plan]\n1. Settings → الصيانة tab\n2. اعمل scroll للـ Card الجديد '🔀 دمج الفواتير المتفرقة'\n3. اختر '📤 مبيعات' → اضغط '🔍 افحص'\n4. لو فيه legacy data، الجدول يظهر بـ الجلسات:\n   - Sessions بـ status='all-draft' (✅ auto-selected)\n   - Sessions بـ status='all-posted' (🔒 disabled، read-only)\n   - Sessions بـ status='mixed' (⚠️ disabled، تحذير)\n5. اضغط '🔀 دمج N جلسة مختارة' → confirm dialog\n6. الـ backend يـ backup ثم يـ execute\n7. Toast '✅ دُمجت N جلسة'\n8. ارجع لـ #4 Statement of Account → الـ legacy fragmentation banner اختفى\n\n**Recovery:** لو حصل أي مشكلة، الـ backup في `backups/pre-invoice-merge-{type}-{timestamp}` collection. يمكن restore يدوياً عبر Firebase Console.\n\n**اللي جاي:** #8 Journal entries Draft/Edit + Subsidiary Linking، ثم #9 Treasury Close، إلخ." },
    ]
  },
  {
    version: "V21.11.0",
    date: "2026-05-12",
    types: ["feature", "architectural"],
    title: "📊 Phase 13 — كشف حساب تراكمي محاسبي (Feature #4)",
    changes: [
      { type: "feature", text: "✨ [Feature #4 — Statement of Account]\n\nأول feature بعد ما حلقة #3 خلصت. كشف حساب تراكمي بـ 3 أعمدة (مدين/دائن/رصيد) لأي عميل أو مورد.\n\n• Tab جديد '📊 كشف حساب' في group الـ finance\n• Party picker: customer أو supplier toggle\n• Filters: date range، رقم فاتورة، نوع الحركة (فواتير/مرتجعات/دفعات)\n• Toggle 'إظهار رصيد افتتاحي' لـ date-range views\n• 6 مصادر بيانات مدمجة في timeline واحدة:\n  - salesInvoices (subtotal + discount lines منفصلة)\n  - salesCreditNotes\n  - custPayments\n  - purchaseInvoices (subtotal + discount lines منفصلة)\n  - purchaseDebitNotes\n  - supplierPayments\n• Running balance مع r2() على كل عملية (no float drift)\n• Cross-link badges: 🔗 Quote → SO → Invoice، أو 🔗 RFQ → PPO → PINV (لو الـ Pipeline chain implemented)\n• Sticky right column للـ balance على mobile\n• Legacy fragmentation banner: لو عميل قديم عنده فواتير متفرقة من توزيعة واحدة، banner تحذير (الأرقام صحيحة، الـ visual بس مفرق)\n• Print template كامل بـ RTL + signature blocks\n• WhatsApp share: ملخص مع الأرصدة + توجيه للبورتال" },
      { type: "architectural", text: "🏗 [Decisions]\n\n**1. Two-row per invoice (Ahmed's explicit ask):**\nكل فاتورة في الكشف تظهر بـ:\n• سطر 1: 'فاتورة مبيعات INV-... — N بند' بـ debit = subtotal\n• سطر 2 (لو فيه خصم): 'خصم فاتورة INV-...' بـ credit = discount\nمتجمعين بـ groupId واحد للـ visual grouping اللاحق.\nالـ sort: subtotal أولاً، خصم تاني (sortKey مخصص).\n\n**2. Float drift protection:**\nالـ buildAccountStatement بـ يستخدم r2() على كل عملية:\n```js\nbal = r2(bal + r.debit - r.credit);\n```\nده يضمن إن balance بعد 10,000 transaction = balance بـ exact precision. كان CLARK عنده bug تاريخي في invoices.js قبل V19.66 بسبب float accumulation.\n\n**3. Opening balance algorithm:**\nلو الـ user اختار from-date، الـ opening = sum(debit-credit) لكل entries before that date (مش بـ filter بنوع — رصيد حقيقي قبل الفترة).\n\n**4. Posted-only by default:**\nالـ statement بـ default يفلتر status='posted'. الـ drafts + void لا تظهر — لأنها مش حركات محاسبية فعلية بعد. (يقدر admin يـ override لو حب يشوف الـ drafts.)\n\n**5. Posted invoices with discount = TWO lines:**\nلو الـ user كان شايف الكشف بـ 5 فواتير عليها خصومات، هـ يشوف 10 سطر (5 subtotal + 5 discount). كل واحد بـ refNo متطابق. الـ groupId يخلي الـ legacy merger (#7) يقدر يـ link them visually لو الـ user حب.\n\n**6. Permissions:**\nadmin/manager: edit. sales/purchase accountant: view. viewer: hide. Treasury accountant + warehouse: hide (مالية حساسة)." },
      { type: "doc", text: "📋 [Test plan]\n\n1. Login admin → السايدبار فيها '📊 كشف حساب' (بين 'الخزنة' و 'محاسبة')\n2. اضغطها → الصفحة بـ تـ open بـ party type = 'عميل'\n3. اختر عميل عنده فواتير/دفعات (يفضّل عميل قديم بـ تاريخ معاملات)\n4. الـ header card يظهر اسمه + الرصيد الحالي (مدين/دائن حسب الـ direction)\n5. الجدول يعرض كل الـ entries بـ:\n   - سطر 'رصيد افتتاحي' أعلاه (لو from-date محدد)\n   - كل فاتورة بسطرين (subtotal + discount لو فيها خصم)\n   - كل دفعة سطر واحد\n   - الـ balance running على اليمين (sticky)\n6. غيّر الـ filters → الجدول بـ يتـ recompute real-time\n7. اضغط '🖨 طباعة' → PDF كامل بـ RTL + بيانات الطرف + الإجماليات + signature blocks\n8. لو الـ user عنده تليفون، '📱 واتساب' → يفتح wa.me مع رسالة ملخص\n9. بدّل لـ 'مورد' → نفس الـ view بـ convention معكوس (purchase credits = supplier owes)\n\n**اللي جاي:**\n• Slice 2 لـ #4 (لو الـ user حب): drill-down modal لـ تفاصيل فاتورة من الـ statement\n• Slice 3 لـ #4: Excel export\n• ثم #5 AI Agent (مع الـ unblocks اللي اتـ provide)" },
    ]
  },
  {
    version: "V21.10.6",
    date: "2026-05-12",
    types: ["feature", "architectural"],
    title: "🏭 Phase 12g — حلقة المشتريات كاملة: PO + استلام + فاتورة + سداد (Slices 7-10 من #3)",
    changes: [
      { type: "feature", text: "✨ [Purchase chain COMPLETE — Slices 7+8+9+10 bundled في V21.10.6]\n\n**Pipeline POs (PPO-YYYY-NNNN):**\n• 'حوّل لأمر شراء' button في RFQ detail (Slice 7) — يحوّل RFQ موافق عليه لـ PPO\n• Tab جديد 'أوامر الشراء' بين 'عروض الموردين' و 'مشتريات'\n• Status workflow: draft → fully_received → invoiced (أو cancelled)\n\n**Stock Receipt (Slice 7 جزء 2):**\n• زرار '📥 استلام + إضافة للمخزون' على PPO في status='مسودة'\n• الـ stock بـ يـ ADD (مش deduct زي الـ SO):\n  - generalProduct: stock += qty + avgCost weighted average update\n  - fabric: stock += qty\n  - accessory: stock += qty\n  - service: no impact\n• stockMovement entry بـ type='in' source='purchase_pipeline_receive'\n• Cancel بـ يـ reverse الكل (stock back DOWN + reverse entry)\n\n**PINV from PPO (Slice 8):**\n• زرار '🧾 إنشاء فاتورة شراء' في PPO fully_received\n• PINV-YYYY-NNNN counter (نفس counter القديم — sequence موحّدة)\n• Cross-links: PINV → fromPipelinePOId + fromRFQId\n• RFQ.linkedPurchaseInvoiceNo updated عشان الـ chain queryable\n• الـ PPO بـ يـ flip لـ 'مفوتر'\n\n**Payment from PINV (Slice 9):**\n• الـ shared PaymentFromInvoiceModal في SalesInvoicesPg.jsx الآن يدعم purchase invoices\n• زرار '💵 سداد للمورد' بـ يظهر في purchase invoice detail (status=posted, balance>0)\n• recordPurchaseInvoicePaymentMutator: ينشئ supplierPayments entry + treasury withdrawal + يحدّث invoice\n• PMT counter shared مع sales (paymentCounters[year])\n\n**autoPost integration (Slice 10):**\n• لو autoPostFromInvoice=true + autoPostOnCreate=true في Settings:\n  - إنشاء فاتورة من PPO = ترحيل + قيد محاسبي تلقائي\n  - autoPost.purchaseInvoicePosted بـ يـ trigger في نفس الـ cycle\n• مثل ما عملنا للـ SO في Slice 5" },
      { type: "architectural", text: "🏗 [Architecture decisions]\n\n**1. Distinct array naming:**\n• `data.purchaseOrders` (V19.50) = legacy receipt-based — مش بـ نـ touch ـه\n• `data.purchasePipelineOrders` (V21.10.6) = new chain-based\n• الـ counter prefix: 'PPO-' vs existing 'PO-' في purchaseSettings\n\n**2. Stock impact reversal:**\nالـ SO flow: deduct on confirm، add back on cancel\nالـ PPO flow: ADD on receive، deduct on cancel\nنفس الـ pattern معكوس — guarantees integrity.\n\n**3. avgCost recalculation:**\nعند الـ receive لـ generalProduct، الـ avgCost بـ يـ update بـ weighted average:\n```js\nnewAvg = (oldAvg * oldStock + newPrice * newQty) / (oldStock + newQty)\n```\nده يعكس الواقع المحاسبي للـ inventory cost.\n\n**4. Shared payment counter:**\nPMT-YYYY-NNNN counter في data.paymentCounters[year] واحد للـ sales + purchase. الـ admin يشوف sequence موحّدة — مفيش 'sales PMT 0001' و 'purchase PMT 0001' في نفس اليوم.\n\n**5. Treasury entry semantics:**\nSales payment → treasury type='deposit' (cash IN)\nPurchase payment → treasury type='withdrawal' (cash OUT)\nنفس الـ accountId structure، direction معكوس.\n\n**6. Cross-link chain (end-to-end):**\nRFQ → PPO → PINV → supplierPayment → treasury entry\nكلهم cross-linked بـ refs IDs. الـ Statement of Account (#4 الجاي) هـ يستخدم نفس الـ refs.\n\n**7. Daily split + firestore.rules:**\n`purchasePipelineOrdersDays/{YYYY-MM-DD}` تحت isPurchaseScope()." },
      { type: "improvement", text: "🎨 [UX wins]\n\n• Shared PaymentFromInvoiceModal (in SalesInvoicesPg) بـ يـ render label مختلف حسب isPurchase: 'سداد للمورد' بدل 'ادفع'\n• Cross-link bar في PPO detail بـ يـ show الـ RFQ الأصلي + الـ PINV لو موجود\n• Source-type badges على items: 📦 منتج عام، 🧵 قماش، 🔧 إكسسوار، 🛠 خدمة\n• 'مستلم' column في PPO items table — يعرض كم تم استلامه (للـ partial receive المستقبلي)\n• الـ stock impact panel في PPO detail بـ يـ display كل stockMovement مع +/− بدلاً من الـ amount فقط" },
      { type: "doc", text: "📋 [Test plan — full Purchase chain]\n\n1. عروض الموردين → طلب جديد لـ مورد + ضيف قماش (مثلاً 50 متر بسعر 100 ج.م)\n2. send → received → accept → '📑 حوّل لأمر شراء' → PPO-2026-0001 ظاهر\n3. افتح 'أوامر الشراء' من السايدبار → PPO detail\n4. اضغط '📥 استلام + إضافة للمخزون' → confirm\n5. افتح PurchasePg → الـ fabric stock زاد 50 متر\n6. ارجع للـ PPO detail → '🧾 إنشاء فاتورة شراء' → PINV-2026-0001\n7. افتح 'فواتير المشتريات' → الفاتورة draft + ترحلها\n8. بعد الترحيل → زرار '💵 سداد للمورد' (أخضر) ظاهر\n9. اضغطه → modal فيه balance + اختر طريقة + احفظ\n10. افتح TreasuryPg → entry بـ type='withdrawal' + ref للـ PINV + RFQ + PPO\n11. لو autoPostOnCreate=true: step 6 يخلص في خطوة واحدة (إنشاء + ترحيل + قيد محاسبي)\n\n**اللي جاي:** Slices 11-12 (cross-page nav + reports) ثم #4 Statement." },
    ]
  },
  {
    version: "V21.10.5",
    date: "2026-05-12",
    types: ["feature"],
    title: "📋 Phase 12f — حلقة المشتريات: عروض الموردين (RFQs) — Slice 6 من #3",
    changes: [
      { type: "feature", text: "✨ [#3 Slice 6: Purchase RFQs standalone]\n\nأول step في حلقة المشتريات — mirror لـ Sales Quotations:\n• tab جديد 'عروض الموردين' (RFQs) في group الـ مشتريات\n• free-form items: منتج عام / قماش / إكسسوار / خدمة حر\n• خصم per-line + خصم على الإجمالي\n• status workflow: draft → sent → received → accepted → rejected → expired\n• الـ 'received' ده مفهوم جديد للـ Purchase: لما المورد رد بعرض السعر بتاعه\n• Counter: RFQ-YYYY-NNNN\n• Print template جاهز للإرسال للمورد بـ 'برجاء الرد بأفضل سعر وشروط التسليم'\n• Auto-expire بعد validUntil" },
      { type: "architectural", text: "🏗 [الـ Architecture mirrors Sales side]\n\n• `data.purchaseRFQs` — daily-split لـ `purchaseRFQsDays/{YYYY-MM-DD}`\n• `data.rfqCounters[year]` — lazy-init\n• `data.rfqSettings.defaultValidityDays = 30` (أطول من Sales الـ 14 — موردين عادة بياخدوا وقت أكتر للرد)\n• Permissions: `purchaseRFQs` tab — admin/manager/purchase_accountant edit، purchase_keeper view، sales/payroll hide\n• firestore.rules: `purchaseRFQsDays/{day}` تحت `isPurchaseScope()`\n• Reuses نفس compute logic من quotations.js (computeRFQTotals = computeQuotationTotals بـ rename)\n\nالـ Slice 7 (Pipeline POs) + Slice 8 (PO Receipt → PINV) + Slice 9 (Payment from PINV) باقيين. الـ chain حالياً: RFQ standalone — لما توافق عرض، الـ next step هـ يـ activate في Slice 7." },
      { type: "doc", text: "📋 [Test plan]\n1. افتح Vercel deploy\n2. السايدبار فيها 'عروض الموردين' (تحت 'مشتريات' في group)\n3. اضغط '➕ طلب عرض جديد'\n4. اختر مورد + ضيف بنود (قماش/إكسسوار/منتج عام/خدمة)\n5. احفظ → toast 'تم إنشاء الطلب RFQ-2026-0001'\n6. افتح الـ row → '📤 إرسال للمورد' → status بقى 'مُرسل'\n7. لما يرد المورد، '📩 وصل عرض' → status 'وصل عرض'\n8. وافق عليه → status 'موافق' (جاهز للـ Slice 7 conversion لـ PO)\n9. '🖨 طباعة' → print template مع 'برجاء الرد بأفضل سعر'\n\n**اللي جاي:** Slice 7 (Pipeline POs) + Slice 8 (Receipt + PINV) + Slice 9 (Payment)." },
    ]
  },
  {
    version: "V21.10.4",
    date: "2026-05-12",
    types: ["improvement"],
    title: "⚡ Phase 12e — autoPostOnCreate يعمل أيضاً على فواتير SO (Slice 5 من #3)",
    changes: [
      { type: "improvement", text: "✨ [#3 Slice 5: extend autoPostOnCreate to SO→Invoice flow]\n\nالـ `invoiceSettings.autoPostOnCreate` flag (موجود من V18.51 للـ delivery-based flow) دلوقتي بـ يطبق على الـ SO-based flow الجديد بنفس الطريقة:\n\n• لو `autoPostFromInvoice=true` + `autoPostOnCreate=true` في الـ Settings:\n  - الـ '🧾 إنشاء فاتورة' button في SO detail modal بقى '🧾 إنشاء + ترحيل'\n  - الفاتورة تتـ post فوراً في نفس upConfig cycle\n  - الـ journal entry بـ يتعمل تلقائياً عبر `autoPost.salesInvoicePosted`\n  - toast بـ يقول 'مرحّلة تلقائياً'\n\n• لو الـ flag معطّل (default):\n  - الـ behavior القديم — فاتورة draft، الترحيل يدوي من 'فواتير المبيعات'\n\n**No new UI** — الـ Settings toggle الموجود (V18.51) كافي. ده bug-prevention slice — يخلي الـ behavior consistent بين الـ delivery flow الـ existing والـ SO flow الجديد." },
      { type: "doc", text: "📋 [Test plan]\n1. افتح Settings → 📄 إعدادات الفواتير\n2. فعّل 'الترحيل من الفاتورة' → فعّل 'ترحيل تلقائي عند الإنشاء'\n3. ارجع لـ SO مؤكد بـ status='confirmed'\n4. اضغط '🧾 إنشاء فاتورة' → الـ confirm dialog بقى 'إنشاء + ترحيل'\n5. اضغط → فاتورة + قيد محاسبي بـ يتعملوا في step واحد\n6. افتح AccountingPg → الـ journal entry موجود\n7. عطّل الـ flag → اعمل تجربة تانية → الفاتورة draft تاني\n\n**اللي جاي:** Slices 6-12 — Purchase mirror الكامل + cross-page nav + reports." },
    ]
  },
];

/* ═══ TYPE METADATA ═══ */
const TYPE_META = {
  feature:       { icon: "✨", label: "ميزة جديدة",      color: "#10B981", bg: "#10B98112" },
  fix:           { icon: "🐛", label: "إصلاح",          color: "#EF4444", bg: "#EF444412" },
  improvement:   { icon: "⚡", label: "تحسين",          color: "#3B82F6", bg: "#3B82F612" },
  maintenance:   { icon: "🔧", label: "صيانة",          color: "#8B5CF6", bg: "#8B5CF612" },
  architectural: { icon: "🏗️", label: "تغيير معماري",    color: "#F59E0B", bg: "#F59E0B12" },
};

/* ═══ MODAL COMPONENT ═══ */
export function AboutVersionModal({ open, onClose, currentVersion = "V16.79" }) {
  /* ESC to close */
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 99999,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16, animation: "fadeIn 0.2s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.cardSolid,
          borderRadius: 16,
          width: "100%", maxWidth: 720, maxHeight: "85vh",
          overflow: "hidden",
          display: "flex", flexDirection: "column",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          border: "1px solid " + T.brd,
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid " + T.brd,
            display: "flex", justifyContent: "space-between", alignItems: "center",
            background: "linear-gradient(135deg, " + T.accent + "08, " + T.accent + "02)",
          }}
        >
          <div>
            <div style={{ fontSize: FS + 4, fontWeight: 800, color: T.accent, marginBottom: 2 }}>
              📋 سجل تحديثات CLARK
            </div>
            <div style={{ fontSize: FS - 2, color: T.textSec }}>
              آخر 10 إصدارات — الإصدار الحالي: <b style={{ color: T.text }}>{currentVersion}</b>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="إغلاق"
            style={{
              width: 36, height: 36, borderRadius: "50%",
              border: "1px solid " + T.brd,
              background: T.cardSolid,
              color: T.textSec,
              fontSize: 18, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.15s",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = T.err + "15";
              e.currentTarget.style.color = T.err;
              e.currentTarget.style.borderColor = T.err + "40";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = T.cardSolid;
              e.currentTarget.style.color = T.textSec;
              e.currentTarget.style.borderColor = T.brd;
            }}
          >
            ✕
          </button>
        </div>

        {/* Type legend */}
        <div
          style={{
            padding: "10px 24px",
            borderBottom: "1px solid " + T.brd + "40",
            background: T.cardSolid,
            display: "flex", flexWrap: "wrap", gap: 8,
            fontSize: FS - 3,
          }}
        >
          {Object.entries(TYPE_META).map(([key, meta]) => (
            <span
              key={key}
              style={{
                padding: "2px 8px", borderRadius: 6,
                background: meta.bg, color: meta.color,
                fontWeight: 600,
                display: "inline-flex", alignItems: "center", gap: 4,
              }}
            >
              <span>{meta.icon}</span>
              <span>{meta.label}</span>
            </span>
          ))}
        </div>

        {/* Body — scrollable list of versions */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
          {CHANGELOG.map((v, idx) => {
            const isCurrent = v.version === currentVersion;
            return (
              <div
                key={v.version}
                style={{
                  marginBottom: 18,
                  padding: 14,
                  borderRadius: 12,
                  border: "1px solid " + (isCurrent ? T.accent + "40" : T.brd),
                  background: isCurrent ? T.accent + "06" : T.cardSolid,
                  position: "relative",
                }}
              >
                {/* Version header */}
                <div
                  style={{
                    display: "flex", justifyContent: "space-between",
                    alignItems: "flex-start", marginBottom: 8, flexWrap: "wrap", gap: 8,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: FS + 2, fontWeight: 800,
                        color: isCurrent ? T.accent : T.text,
                        display: "flex", alignItems: "center", gap: 8,
                      }}
                    >
                      <span style={{ fontFamily: "monospace" }}>{v.version}</span>
                      {isCurrent && (
                        <span
                          style={{
                            fontSize: FS - 3, fontWeight: 700,
                            padding: "2px 8px", borderRadius: 6,
                            background: T.accent, color: "#fff",
                          }}
                        >
                          الحالي
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: FS, color: T.textSec, marginTop: 2 }}>
                      {v.title}
                    </div>
                  </div>
                  <div style={{ fontSize: FS - 3, color: T.textMut, fontFamily: "monospace" }}>
                    📅 {v.date}
                  </div>
                </div>

                {/* Type badges */}
                <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                  {v.types.map((t) => {
                    const meta = TYPE_META[t];
                    if (!meta) return null;
                    return (
                      <span
                        key={t}
                        style={{
                          fontSize: FS - 3, fontWeight: 700,
                          padding: "2px 8px", borderRadius: 6,
                          background: meta.bg, color: meta.color,
                          display: "inline-flex", alignItems: "center", gap: 3,
                        }}
                      >
                        <span>{meta.icon}</span>
                        <span>{meta.label}</span>
                      </span>
                    );
                  })}
                </div>

                {/* Changes list */}
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {v.changes.map((c, i) => {
                    const meta = TYPE_META[c.type] || TYPE_META.improvement;
                    return (
                      <div
                        key={i}
                        style={{
                          display: "flex", alignItems: "flex-start", gap: 8,
                          fontSize: FS - 1, lineHeight: 1.7,
                          padding: "4px 0",
                        }}
                      >
                        <span
                          style={{
                            fontSize: FS, marginTop: 1,
                            flexShrink: 0,
                            color: meta.color,
                          }}
                        >
                          {meta.icon}
                        </span>
                        <span style={{ color: T.text }}>{c.text}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Footer note */}
          <div
            style={{
              marginTop: 20, padding: 12,
              borderRadius: 10,
              background: T.textMut + "08",
              fontSize: FS - 3, color: T.textMut,
              textAlign: "center", lineHeight: 1.6,
            }}
          >
            CLARK Factory Management — © 2026
            <br />
            للمساعدة أو الإبلاغ عن مشاكل، تواصل مع المدير.
          </div>
        </div>
      </div>
    </div>
  );
}
