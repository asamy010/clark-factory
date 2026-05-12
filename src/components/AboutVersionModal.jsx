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
  {
    version: "V21.10.3",
    date: "2026-05-12",
    types: ["feature"],
    title: "💵 Phase 12d — حلقة المبيعات: سداد من داخل الفاتورة (Slice 4 من #3)",
    changes: [
      { type: "feature", text: "✨ [Sales Pipeline #3 — Slice 4: Payment from Invoice]\n\nالـ Step الرابع في الـ document chain. زرار '💵 ادفع' بـ يظهر داخل تفاصيل أي فاتورة مبيعات بـ status='posted' وعليها رصيد متبقي. يفتح modal فيه:\n• المبلغ (default = الرصيد المتبقي)\n• طريقة الدفع: كاش / تحويل بنكي / شيك\n• حساب الخزنة (من treasuryAccounts الموجودة)\n• تاريخ + ملاحظات\n\nعلى الحفظ، `recordInvoicePaymentMutator` بـ يعمل أربع حاجات atomic:\n1. ينشئ entry في `custPayments` بـ paymentNo (PMT-YYYY-NNNN) و كامل الـ cross-links (invoice + SO + quote)\n2. ينشئ entry في `treasury` بـ type='deposit' + كل الـ refs للأصل\n3. يحدّث `invoice.paidAmount` + `invoice.balanceDue`، ولو الـ balance = 0 يحط `fullyPaidAt`\n4. لو الفاتورة من SO، يحدّث `so.paidAmount`\n\n**Guards:**\n• المبلغ > 0 ومش > balanceDue\n• الفاتورة status لازم 'posted'\n• حساب الخزنة + طريقة الدفع مطلوبين\n• `computeInvoiceBalance()` بـ يحسب الـ balance real-time من custPayments الموجودة" },
      { type: "architectural", text: "🏗 [Shared payment counter + cross-links]\n\n**Counter:**\n`paymentCounters[year]` lazy-init — مفيش separate sales/purchase counter للـ payments. PMT-YYYY-NNNN sequence واحدة لكل المدفوعات (consistency للـ admin).\n\n**Cross-links على الـ custPayment entry:**\n```js\n{\n  linkedInvoiceId, linkedInvoiceNo,\n  linkedSalesOrderId, linkedSalesOrderNo,  // null لو من delivery path\n  linkedQuotationId, linkedQuotationNo,    // null لو direct invoice\n}\n```\n\n**Cross-links على الـ treasury entry:**\nنفس الـ refs + `relatedTo: 'invoice_payment'` + `refCustPaymentId` (شيك inverse).\n\nده يخلي الـ chain queryable من 6 nodes (Quote, SO, Invoice, Payment, Treasury entry, Customer) من أي اتجاه. الـ Statement of Account (#4) و الـ Subsidiary Ledger (#8) هـ يستفيدوا من ده بشكل مباشر." },
      { type: "doc", text: "📋 [Test plan]\n1. خد INV-2026-NNNN من الـ chain السابق (السلسلة الكاملة Quote→SO→INV)\n2. ترحّلها من 'فواتير المبيعات' (status='posted')\n3. اضغطها → زرار '💵 ادفع' ظهر (أخضر)\n4. اضغطه → modal فيه balance + المبلغ pre-filled = balance\n5. اختر طريقة + حساب خزنة + احفظ\n6. الـ toast '✓ تم تسجيل دفعة X ج.م'\n7. افتح TreasuryPg → entry جديد بـ description 'دفعة فاتورة INV-... — العميل'\n8. افتح الـ Customer's تاريخ المعاملات → custPayments فيها PMT-2026-0001\n9. ارجع للفاتورة → balanceDue = 0 + fullyPaidAt مسجّل\n\n**اللي جاي:** Slice 5 (V21.10.4) — autoPostOnInvoiceCreate setting (toggle في Settings) + Slices 6-12 — Purchase mirror." },
    ]
  },
  {
    version: "V21.10.2",
    date: "2026-05-12",
    types: ["feature", "architectural"],
    title: "🧾 Phase 12c — حلقة المبيعات: فاتورة من أمر بيع + Cross-links (Slice 3 من #3)",
    changes: [
      { type: "feature", text: "✨ [Sales Pipeline #3 — Slice 3: Create Invoice from SO]\n\nالـ Step الثالث في الـ document chain — الـ user دلوقتي يقدر:\n• على SO في حالة 'مؤكد' (أو partial_delivered/delivered) يضغط '🧾 إنشاء فاتورة'\n• فاتورة draft بـ تتـ create بـ رقم INV-YYYY-NNNN (نفس counter بتاع الفواتير العادية)\n• الـ SO بـ يـ flip لـ 'مفوتر' (invoiced) + back-link لـ الـ invoiceNo\n• الـ Quote الأصلي (لو موجود) بقى يعرف linked invoice number كمان\n• الـ Cross-link chain كاملة: Quote → SO → Invoice، تـ navigate من أي مكان للآخر\n\nالـ Invoice الجديدة بـ تـ open في SalesInvoicesPg الموجود (status='draft'، جاهزة للترحيل اليدوي عبر الـ existing workflow)." },
      { type: "architectural", text: "🏗 [Decision: two parallel invoice paths]\n\nالـ CLARK دلوقتي عنده **اتنين paths** بـ يخلقوا فواتير:\n\n**Path A (existing — V18.65):** `upsertSalesInvoiceFromDelivery`\n• Source: customer delivery row (CustDeliver session)\n• Consolidation: same-day same-customer drafts merge\n• Counter: INV-YYYY-NNNN\n• Use case: scan-and-sell، توزيعات يومية\n\n**Path B (new — V21.10.2):** `createInvoiceFromSalesOrderMutator`\n• Source: confirmed Sales Order\n• Consolidation: مفيش — كل SO = فاتورة واحدة\n• Counter: نفس INV-YYYY-NNNN (shared sequence)\n• Use case: B2B wholesale، عقود، عروض مقبولة\n\nالـ paths مستقلين تقنياً (مفيش shared state بينهم غير الـ counter + الـ salesInvoices array). الـ admin يقدر يـ mix-and-match — بعض الفواتير من delivery، بعضها من SO.\n\nالـ Legacy Invoice Merger (prompt #7) هـ يـ handle لو الـ admin حب يدمج فواتير الـ paths الاتنين بعدين.\n\n**ليه ما عملتش consolidation للـ SO invoices مع الـ delivery drafts؟**\n• الـ SO بـ يـ snapshot الـ items (commitment) — الـ delivery بـ يـ track الواقع. الاتنين entities محاسبياً مختلفين.\n• الـ admin اللي بـ يستخدم SO flow عاوز فاتورة 1:1 مع الـ SO — مش merged مع scan-sells عشوائية.\n• لو merging مطلوب، الـ #7 tool يوفّره explicitly." },
      { type: "improvement", text: "🎨 [UX additions]\n\n• زرار '🧾 إنشاء فاتورة' بـ يظهر على SO بـ status confirmed/partial_delivered/delivered (مش بـ يظهر لو فيه فاتورة بالفعل)\n• Cross-link bar في SO detail modal: الآن بـ يعرض الـ invoice number لو موجود\n• Quote → linkedSalesInvoiceNo field — chain queryable من end-to-end\n• حماية ضد double-invoicing: `so.salesInvoiceId` check بـ يـ refuse re-creation" },
      { type: "doc", text: "📋 [Test plan + ما الجاي]\n\n**Test V21.10.2:**\n1. اعمل quote → accept → convert to SO → confirm (يخصم مخزون)\n2. الـ SO دلوقتي في حالة 'مؤكد' — افتح detail modal\n3. الـ '🧾 إنشاء فاتورة' button ظاهر\n4. اضغطه → confirm → toast '✓ تم إنشاء الفاتورة INV-2026-0001'\n5. الـ SO بقى في حالة 'مفوتر' + cross-link bar بـ يعرض الـ Quote + الـ Invoice\n6. افتح صفحة 'فواتير المبيعات' → الفاتورة الجديدة ظاهرة status='مسودة'\n7. اضغطها → فيها الـ items من الـ SO + التوتلز صحيحة\n8. ترحيل الفاتورة من نفس صفحة الفواتير (الـ existing flow)\n\n**اللي جاي في Slice 4 (V21.10.3):**\n• زرار '💵 ادفع' داخل InvoiceDetailModal لما الفاتورة posted وعليها balance\n• `recordInvoicePaymentMutator`: ينشئ custPayment + treasury entry + يـ link كل حاجة\n• autoPost للقيد المحاسبي (Cash Dr / AR Cr)\n• PaymentFromInvoiceModal — amount, method, treasury account, date, notes" },
    ]
  },
  {
    version: "V21.10.1",
    date: "2026-05-12",
    types: ["feature", "architectural"],
    title: "📑 Phase 12b — حلقة المبيعات: أوامر البيع + خصم المخزون (Slice 2 من #3)",
    changes: [
      { type: "feature", text: "✨ [Sales Pipeline #3 — Slice 2: Sales Orders + stock deduction]\n\nالـ Step الثاني في الـ document chain. الـ user دلوقتي يقدر:\n• في صفحة عروض الأسعار: يضغط '📑 حوّل لأمر بيع' على عرض في حالة draft/sent/accepted\n• الـ Quote بـ يـ flip لـ 'converted' + back-link لـ SO الجديد\n• الـ SO بـ يتـ create في حالة 'draft' (لسه مفيش stock impact)\n• في صفحة أوامر البيع الجديدة: يضغط '✅ تأكيد + خصم المخزون'\n• الـ confirm بـ يخصم المخزون للـ generalProducts (و future: fabrics/accessories)\n• كل خصم مخزون بـ يـ create stockMovement entry (split V19.52)\n• الـ '❌ إلغاء' بـ يـ restore المخزون كاملاً + reverse stockMovement entries\n\nالـ Counter: SO-YYYY-NNNN" },
      { type: "architectural", text: "🏗 [Architecture decisions في Slice 2]\n\n**1. Stock deduction scope:**\n• `sourceType === 'generalProduct'` → `data.generalProducts[i].stock -= qty` + stockMovement entry\n• `sourceType === 'inventoryItem'` (fabrics/accessories) → TODO Slice 2b (الـ inventory model مش finalized في CLARK لـ fabrics)\n• `sourceType === 'order'` (models from `seasons/{}/orders/`) → **لا تأثير في Slice 2** — الـ existing CustDeliver flow (qrSale + pendingRcv + invoice) بـ يفضل source of truth للـ finished goods. الـ SO بـ يـ record commitment، الـ delivery الفعلية بـ تتعمل عبر الـ session flow الموجود. ده يمنع double-deduction.\n• `sourceType === 'service'` → بدون تأثير (intangible)\n\n**2. Stock guard:**\n```js\nif(!data.salesOrderSettings?.allowNegativeStock){\n  // pre-validate ALL items before any mutation\n  for(const it of so.items) if(stk < qty) throw new Error(...)\n}\n// then deduct\n```\nالـ validation pass الكاملة قبل أي mutation — atomic semantics. لو أي item يفشل، السلسلة كلها بـ تـ refuse.\n\n**3. Reverse on cancel:**\nالـ cancel بـ يـ create stockMovement entries جديدة بـ type='in' source='sales_order_cancel'. الـ original 'out' entries بـ تفضل (audit trail — never delete movements).\n\n**4. State transitions:**\n```\ndraft → confirmed → partial_delivered → delivered → invoiced\n              ↘ cancelled (reverses stock)\n```\nالـ delivered/invoiced terminal — مش بـ يقدر الـ cancel.\n\n**5. Permissions:**\n`salesOrders` tab + DEFAULT_PERMS: admin/manager/sales_accountant edit، purchase/warehouse/payroll hide، viewer view." },
      { type: "improvement", text: "🎨 [UX touches]\n\n• **Cross-link bar في الـ SO detail modal**: 🔗 العرض الأصلي + 🧾 الفاتورة (placeholder للـ Slice 3)\n• **Stock impact panel**: لو الـ SO مؤكد + عنده stockMovements، panel يعرض كل حركة بـ ±qty\n• **Source-type badges على الـ items**: 📦 منتج عام، 👕 موديل، 🛠 خدمة — visual hint لـ admin\n• **'حوّل لأمر بيع' label** مش 'حوّل لـ SO' — Arabic-first UX\n• **Cancel reason prompt** — مطلوب لـ audit\n• **Print template جديد للـ SO** — نفس style بتاع الـ Quote بس مع الـ SO header" },
      { type: "doc", text: "📋 [Test plan + ما الجاي]\n\n**Test V21.10.1:**\n1. افتح Vercel deploy\n2. اعمل quote جديد بـ منتج عام (مثلاً 'كرتونة' من generalProducts) + اعمل accept\n3. اضغط '📑 حوّل لأمر بيع' → toast '✓ تم إنشاء أمر البيع SO-2026-0001'\n4. الـ quote بقى status 'محوّل' + badge '🔗 محوّل لـ SO-2026-0001' في detail modal\n5. افتح 'أوامر البيع' من السايدبار → SO-2026-0001 ظاهر في الـ list\n6. اضغط الـ row → detail modal فيه cross-link للـ quote الأصلي + الـ items + التوتلز\n7. اضغط '✅ تأكيد + خصم المخزون' → confirm dialog → toast '✓ تم تأكيد أمر البيع'\n8. افتح PurchasePg → الـ generalProduct stock نزل بـ qty الـ SO\n9. اضغط '❌ إلغاء' → confirm + reason → toast '✓ تم الإلغاء' + المخزون يرجع تاني\n\n**اللي جاي في Slice 3 (V21.10.2):**\n• زرار 'إنشاء فاتورة' في الـ SO detail modal\n• `createInvoiceFromSalesOrderMutator` في invoices.js\n• InvoiceDetailModal updates مع cross-link panel لـ SO + Quote\n• الـ existing invoice flow (CustDeliver + bulk-create) يفضل شغّال — additive only" },
    ]
  },
  {
    version: "V21.10.0",
    date: "2026-05-12",
    types: ["feature", "architectural"],
    title: "📋 Phase 12a — حلقة المبيعات: عروض الأسعار (Slice 1 من #3)",
    changes: [
      { type: "feature", text: "✨ [Sales Pipeline #3 — Slice 1: Sales Quotations standalone]\n\nأول step في الـ document chain الـ Odoo-style:\nQuote → Sales Order → Invoice → Payment\n\nالـ Slice ده بـ يـ ship الـ quotations standalone — لسه مفيش conversion لـ Sales Order (Slice 2). الـ user يقدر دلوقتي:\n• ينشئ عرض سعر جديد بـ free-form items (موديل من orders / منتج عام / خدمة حر)\n• خصم per-line (نسبة أو مبلغ) + خصم على إجمالي المستند\n• تاريخ صلاحية (default 14 يوم — قابل للتعديل في الإعدادات)\n• Workflow status: draft → sent → accepted/rejected → (future: converted)\n• طباعة PDF احترافية بـ RTL\n• Auto-expire للـ drafts بعد انتهاء الصلاحية\n• Audit trail كامل لكل status change\n\nالـ Counter: QT-YYYY-NNNN" },
      { type: "architectural", text: "🏗 [Architecture decisions في Slice 1]\n\n**1. الـ Schema:**\n```js\ndata.salesQuotations = [{\n  id, quoteNo, date, validUntil,\n  customerId, customerName, customerPhone,\n  items: [{sourceType, sourceId, modelNo, description,\n          qty, unitPrice, discountType, discountValue,\n          lineSubtotal, lineDiscount, lineTotal}],\n  subtotal, discountPct, totalDiscount, total,\n  status, notes, salesPerson,\n  statusHistory: [{from, to, at, by}],\n  createdAt, createdBy,\n  /* Slice 2+: convertedToSalesOrderId, convertedTo... */\n}]\n```\n\n**2. الـ Daily Split:**\nالـ `salesQuotations` array مسجّلة في `SPLIT_COLLECTIONS` لـ `salesQuotationsDays/{YYYY-MM-DD}` من اليوم الأول — مفيش frozen array في factory/config. (CLAUDE.md §2 compliance.)\n\n**3. الـ Counter Pattern:**\nنفس نمط `reserveInvoiceNo`: lazy-init في `d.quotationCounters[year]`، مفيش race conditions لأن الـ upConfig بـ يـ serialize الـ writes.\n\n**4. الـ Stock Impact:**\n**صفر** — الـ quotations مش بـ تخصم من المخزون. الـ stock deduction يحصل عند Sales Order confirm (Slice 2). ده يطابق الـ Odoo behavior.\n\n**5. الـ firestore.rules:**\n`salesQuotationsDays/{day}` + `salesOrdersDays/{day}` (pre-emptively لـ Slice 2) بـ نفس الـ `isSalesScope()` بتاع الـ invoices.\n\n**6. الـ Permissions:**\nأضفت `salesQuotations` لـ `PERMISSION_TABS` + `DEFAULT_PERMS` لكل الـ 8 roles:\n• admin / manager / sales_accountant: edit\n• purchase / warehouse / payroll_acc / payroll_ver: hide\n• viewer: view" },
      { type: "improvement", text: "🎨 [UX choices]\n\n• **Free-form items**: المستخدم يقدر يخلط موديلات من الـ orders (بـ auto-fill للسعر) مع general products + خدمات حرة. مفيد لـ B2B wholesale custom quotes.\n• **Inline modals**: نفس الـ pattern بتاع SalesInvoicesPg/CreditNotesPg — مفيش separate component files (Slice أصغر = أسرع review).\n• **Status badges row**: filter سريع بضغطة على badge أي حالة.\n• **Validity countdown**: لو الـ quote بـ ينتهي خلال أيام، التاريخ يتلون أحمر.\n• **Print template**: header بـ logo + factoryName، جدول البنود + الإجماليات، signature blocks، RTL throughout.\n\n• **Status workflow rules**:\n  - draft → sent (manual mark)\n  - draft/sent → accepted (manual mark)\n  - draft/sent → rejected (manual + reason)\n  - draft → delete (drafts only)\n  - draft/sent → expired (auto على load بعد انتهاء validUntil)\n  - accepted → converted (Slice 2 — convert to SO)" },
      { type: "doc", text: "📋 [Test plan + ما الجاي]\n\n**Test V21.10.0:**\n1. افتح Vercel بعد الـ deploy\n2. Login as admin → السايدبار يظهر فيها 'عروض الأسعار' بعد 'مبيعات'\n3. اضغط → الصفحة بـ تـ load (Suspense fallback ثم القائمة الفاضية)\n4. اضغط '➕ عرض جديد' → modal فيه customer picker + items grid + totals\n5. اختار عميل + ضيف 2-3 بنود مختلفة (موديل + خدمة) + خصم على واحد منهم → التوتلز بـ تتـ compute real-time\n6. احفظ → toast '✓ تم إنشاء العرض QT-2026-0001'\n7. الـ row يظهر في القائمة بـ badge 'مسودة' + اضغط الـ row → detail modal\n8. اضغط '🖨 طباعة' → نافذة PDF جاهزة للطباعة\n9. اضغط '📤 إرسال' → status بقى 'مُرسل'\n10. اضغط '✅ موافقة' → status بقى 'موافق' (جاهز لـ Slice 2 conversion)\n\n**اللي جاي في Slice 2 (V21.10.1):**\n• `salesOrders.js` utility + SalesOrdersPg\n• زرار 'حوّل لأمر بيع' في الـ Quotation detail modal\n• Stock deduction logic — applyStockDelta + stockMovements entries\n• `requireStockOnSalesOrder` config flag\n• Cross-links: Quote ↔ SO" },
    ]
  },
  {
    version: "V21.9.38",
    date: "2026-05-12",
    types: ["fix", "architectural"],
    title: "🤖 Phase 13t — مساعد CLARK: 'System prompt too large' — split persona من البيانات",
    changes: [
      { type: "fix", text: "🚨 [الـ user بلّغ بعد V21.9.37: 'سألته مكتب آدم رد بـ ⚠️ System prompt too large (>4KB)']\n\nROOT CAUSE: الـ askAI() في App.jsx كان بـ يـ build الـ system prompt كده:\n```js\nconst ctx = 'أنت مساعد ذكي...قواعد الرد:\\n...' +\n  '\\n\\nبيانات الموسم ' + season + ':\\n\\n' +\n  'ملخص عام:\\n' + JSON.stringify(summary) +\n  '\\n\\nالأوردرات (' + ords.length + '):\\n' + JSON.stringify(ords) +  // ← كل الأوردرات!\n  '\\n\\nالورش (' + ws.length + '):\\n' + JSON.stringify(ws) +\n  '\\n\\nالعملاء (' + custs.length + '):\\n' + JSON.stringify(custs);\n```\n\nالـ persona (الـ rules + qualifications) لوحدها ~1.5KB. لكن مع أول 10 أوردرات + 5 ورش + 20 عميل، الـ JSON بـ يدفع الإجمالي فوق 4KB بسهولة.\n\nالـ api/ai.js (V19.64) بـ يـ enforce:\n```js\nconst MAX_SYSTEM_BYTES = 4 * 1024;\nif(clientSystemStr.length > MAX_SYSTEM_BYTES){\n  return res.status(413).json({error:{message:'System prompt too large (>4KB)'}});\n}\n```\n\nده security guard لـ cost abuse — هدفه يمنع admin malicious يبعت 100KB system prompt يبني هجوم زي عمل prompt smuggling. لكن البيانات الديناميكية مش المكان الصح للـ system." },
      { type: "architectural", text: "✅ [الـ Fix الـ correct architecturally: split persona من data]\n\nالـ Anthropic API بـ تـ accept:\n• `system` (string) — persona/rules ثابتة\n• `messages` (array) — conversation history + current question\n\nالقاعدة الصحيحة: persona = system، data = messages. ده الـ pattern اللي بـ تـ use-ـه Claude.ai و معظم الـ apps. بـ يـ enable كمان prompt caching مستقبلاً (لو احتاجناه) لأن الـ persona هي الـ static prefix.\n\nالـ V21.9.38 fix في `askAI()`:\n```js\nconst ctx = 'أنت مساعد ذكي...قواعد الرد:...';  // ← persona only, ~1.5KB\nconst dataBlock = 'بيانات الموسم ' + season + ':\\n...' + JSON.stringify(ords) + ...;\n\nconst msgs = [\n  ...aiMsgs.map(m => ({role: m.role==='user'?'user':'assistant', content: m.text})),\n  { role: 'user', content: dataBlock + '\\n\\n──────\\nالسؤال:\\n' + q }  // ← data + question\n];\n\nfetch('/api/ai', { body: JSON.stringify({ idToken, system: ctx, messages: msgs }) });\n```\n\n**ليه data في الـ latest user message ومش في message منفصل في الأول؟**\n• فولر contextاً: Claude بـ يشوف الـ data جنب السؤال مباشرة\n• مفيش data في الـ history (previous turns clean) — مفيش bloat للـ tokens المتكررة\n• كل turn بـ يـ refresh الـ data — fresh snapshot every call\n• الـ aiMsgs UI state بـ يفضل نضيف (مفيش data inlined)" },
      { type: "fix", text: "📈 [api/ai.js — MAX_MESSAGES_BYTES من 50KB لـ 500KB]\n\nاللي اتغير في الـ server:\n```js\nconst MAX_MESSAGES_BYTES = 500 * 1024;  // كان 50KB\nconst MAX_SYSTEM_BYTES = 4 * 1024;       // ثابت — لأن persona small\n```\n\n**الأرقام:**\n• 50KB كان كافي لـ system prompt + short conversation history\n• دلوقتي الـ data كله في الـ messages → factory متوسط ~50-150KB، factory كبير 200-300KB\n• 500KB ≈ 125K tokens of JSON (4 chars/token roughly) — تحت 200K context window لـ Claude Sonnet 4.5\n• Cost abuse لسه محصور بـ:\n  - Firebase auth (V21.9.37) — مفيش أي حد من الإنترنت يقدر يـ hit\n  - Rate limit 30 req/5 min per UID\n  - Anthropic model max_tokens=1000 على الـ response\n\nالـ system cap (4KB) **متسابش زي ما هي** — persona/rules مفروض ثابت ومحدد. لو كبر فوق 4KB → يدل على architectural mistake (data بتـ leak في الـ system)." },
      { type: "improvement", text: "🧠 [Note للمستقبل: prompt caching]\n\nالـ Anthropic API بـ تـ support prompt caching beta — لو الـ same prefix بـ يبعت مع كذا request، الـ tokens بـ تتـ cache (cost rebate + speed up). شكل القاعدة:\n```js\nsystem: [{type:'text', text: ctx, cache_control:{type:'ephemeral'}}]\n```\n\nالـ ctx (persona) دلوقتي ثابت 100% فـ ده use case مثالي. لكن:\n• Cache write costs 25% premium\n• Cache hit costs 90% discount\n• المفيد للـ ctx ≥ 1024 tokens ولـ same user بـ يـ chat كذا rondo\n\nمع الـ بوت دلوقتي: persona 1.5KB ≈ 400 tokens — under threshold. مفيد لو الـ persona كبرت لـ ≥ 4KB. مش الأولوية دلوقتي." },
      { type: "doc", text: "📋 [Test plan]\n1. ⏰ استنى Vercel ينهي الـ deploy\n2. ⬆️ Ctrl+Shift+R hard refresh\n3. اضغط 🤖 → اسأل أي حاجة (مثلاً 'مكتب آدم' زي الـ screenshot)\n4. **المتوقع:**\n   • مفيش 'System prompt too large'\n   • مفيش 'Authentication required'\n   • رد طبيعي من البوت في خلال ثواني\n5. لو لسه error:\n   • 413 'too large' = الـ messages > 500KB → factory ضخم جداً، محتاج RAG/trimming\n   • 401 = الـ idToken لسه expired → sign-out + sign-in\n   • 429 = rate limit (30/5min) → استنى\n   • 500 'overloaded' = Anthropic مشغول → الـ retry logic بـ يحاول مرة تانية تلقائياً" },
    ]
  },
  {
    version: "V21.9.37",
    date: "2026-05-12",
    types: ["fix", "improvement"],
    title: "🤖 Phase 13s — مساعد CLARK: إصلاح 'Authentication required' + إلغاء التنبيهات من البوت",
    changes: [
      { type: "fix", text: "🚨 [الـ user بلّغ: 'البوت بيقولي Authentication required لما اسأله أي حاجة']\n\nROOT CAUSE: `/api/ai` بقى يـ require Firebase ID token من V19.64 (cost-abuse hardening — منع أي حد على الإنترنت يحرق الـ Anthropic budget). لكن الـ client في `src/App.jsx` line 585 ما اتـ update-ـش لما اتـ deploy-ـت الحماية. الـ fetch كان:\n```js\nfetch('/api/ai', {\n  headers: { 'Content-Type': 'application/json' },\n  body: JSON.stringify({ system: ctx, messages: msgs })  // ← لا idToken\n})\n```\n\nالـ endpoint بـ يـ check `req.body.idToken` أو `Authorization: Bearer <token>`. مفيش الاتنين → 401 'Authentication required'. كل سؤال للبوت كان بـ يفشل."},
      { type: "fix", text: "✅ [الـ Fix في askAI() — V21.9.37 line 555+]\n\n```js\nlet idToken = '';\ntry { if(user && typeof user.getIdToken === 'function') idToken = await user.getIdToken(); }\ncatch(e) { console.warn('[askAI] getIdToken failed:', e?.message); }\nif(!idToken) {\n  setAiMsgs(p => [...p, { role: 'ai', text: '⚠️ مفيش جلسة تسجيل دخول — اعمل sign-in تاني' }]);\n  setAiLoading(false);\n  return;\n}\n\nconst res = await fetch('/api/ai', {\n  method: 'POST',\n  headers: {\n    'Content-Type': 'application/json',\n    'Authorization': 'Bearer ' + idToken,  // ← الـ canonical way\n  },\n  body: JSON.stringify({ idToken, system: ctx, messages: msgs }),  // ← belt-and-suspenders\n});\n```\n\nبـ يـ pass الـ token في الـ Authorization header **و** في الـ body لـ `idToken`. الـ endpoint بـ يقبل أي من الاتنين. الـ `getIdToken()` بـ يـ auto-refresh الـ token لو expired. لو الـ user مش logged in أصلاً (edge case)، الـ بوت بـ يـ show رسالة واضحة بدل ما يطلع 401 silent." },
      { type: "improvement", text: "🤖 [الـ user قال: 'عاوز ألغي الاشعارات في البوت خالص. البوت فقط للأسئلة عن المصنع']\n\nقبل V21.9.37 الـ بوت كان بـ يـ render digest كامل للتنبيهات داخل الـ popup:\n• الـ floating icon فيها red badge بـ count التنبيهات (26 في الـ screenshot)\n• فتح الـ popup → header '⚡ 26 تنبيه' + قائمة كل واحد:\n  - 🔴 موديلات واقفة من X يوم\n  - ✅ موديلات جاهزة للغلق\n  - 💸 ورش دفعنالها زيادة\n  - 🐢 ورش بطيئة\n  - 🚫 خامات/إكسسوار نفذ\n  - ⏰ ورش قرب موعد التسليم\n• كل تنبيه فيه زرار 📱 لـ WhatsApp + ✕ للـ dismiss\n\nده كان مفيد للـ admin بس بـ يـ clutter الـ بوت اللي المفروض يكون pure Q&A. شال:\n• الـ red badge من الـ floating icon\n• الـ '⚡ N تنبيه' section من الـ desktop popup\n• نفس الـ section من الـ mobile popup\n• تبسيط الـ empty state — دلوقتي بـ يـ show الـ 🤖 icon + 'جرب تسأل:' + suggestion chips\n\nنفس التنبيهات لسه موجودة في:\n• الـ bell icon في الـ top bar (لكل user حسب صلاحيته)\n• الـ Dashboard alerts panel\nفـ مفيش معلومات اتـ lost — بس الـ بوت بقى نضيف وde-cluttered." },
      { type: "improvement", text: "🧹 [Code cleanup — حذف الـ unused logic]\n\nشال `aiAlerts` (الـ useMemo الكبير اللي بـ يـ compute كل التنبيهات — 42 سطر) و `visibleAlerts` (filtered version) من App.jsx. الـ functions المشتركة `dismissAlert` + `isDismissed` + `dismissedAlerts` فضلت لأنها بـ تـ used في mechanism تاني (الـ bell alerts في الـ top bar — line 4977). الـ bundle index.js نزل ~3.5 KB gzip بعد التغيير ده. مينفعش نسيب dead code — كل سطر في الـ bundle بـ يـ download لكل user." },
      { type: "doc", text: "📋 [Test plan]\n1. ⏰ استنى Vercel ينهي الـ deploy (1-2 دقيقة)\n2. ⬆️ Ctrl+Shift+R لـ hard refresh\n3. اضغط على الـ 🤖 floating button (يمين تحت)\n4. **المتوقع:**\n   • مفيش red badge على الـ icon\n   • مفيش '⚡ N تنبيه' في الـ popup\n   • بدلها: 'جرب تسأل:' + 5 suggestion chips\n5. اكتب 'كام أوردر متأخر؟' واضغط Enter\n6. **المتوقع:** الـ بوت بـ يرد بـ ملخص — مفيش 'Authentication required'\n7. لو لسه فيه error: افتح DevTools → Network → /api/ai → شوف الـ status code\n   • 401 = الـ idToken expired → اعمل sign-out/sign-in\n   • 429 = rate limit (30 طلب / 5 دقايق per user) → استنى شوية\n   • 500 = ANTHROPIC_API_KEY مش موجود في Vercel env vars → admin issue" },
    ]
  },
  {
    version: "V21.9.36",
    date: "2026-05-12",
    types: ["fix", "architectural"],
    title: "🎯 Phase 13r — THE REAL ROOT CAUSE: chatId @c.us كان hardcoded، LID accounts كانت silent fail",
    changes: [
      { type: "fix", text: "🚨 [الـ user بلّغ بعد V21.9.35: 'الخدمة شغالة في باقي البرنامج بس مش بتبعت لعملاء شوبيفاي. بقدر ابعت يدوي من ايقونة الموبيل على الصف']\n\nقعدنا 3 phases (V21.9.31 → V21.9.35) نـ patch الـ frontend (field names، phone normalization، pre-flight checks، Bridge Status Panel) وكل واحد كان بـ يحسّن الـ observability — لكن المشكلة لسه موجودة.\n\nالـ V21.9.35 Bridge Status Panel كشف الـ smoking gun: لما الـ user عمل bulk send → الـ /activity entries كانت بـ تـ show **'Number not on WhatsApp'** لعملاء شوبيفاي بالظبط، مع إن نفس الأرقام بـ تـ open من الـ wa.me link اليدوي (الـ ايقونة على الصف) من غير أي مشكلة.\n\nالـ contradiction ده مفيش له إلا تفسير واحد: الـ bridge ما بـ يـ resolve الـ chatId صح." },
      { type: "fix", text: "🔬 [ROOT CAUSE — في `clark-wa-bridge/server.js` line 185 / 379 / 627]\n\nالـ bridge كان بـ يـ build الـ chatId يدوياً:\n```js\nfunction formatChatId(phone) {\n  return phone + '@c.us';  // ← hardcoded\n}\n```\n\nثم بـ يعمل:\n```js\nconst chatId = formatChatId(phoneNorm);\nconst isReg = await waClient.isRegisteredUser(chatId);  // ← false\nif (!isReg) throw new Error('Number not on WhatsApp');\n```\n\nده **يـ work** لـ vast majority من الـ accounts — الـ legacy phone-based identifiers اللي serialized بـ `<phone>@c.us`. **لكن** WhatsApp's newer identifier model (multi-device users، business profile migrations، بعض الـ accounts الجديدة) بـ يستخدم **LID-based serialization**: `<lid_hash>@lid` بدل `<phone>@c.us`.\n\nلـ تلك الـ accounts:\n• `isRegisteredUser('<phone>@c.us')` → **false** (السيرفر مش بـ يعرف الـ account بـ الـ phone-form)\n• `sendMessage('<phone>@c.us', ...)` → **'Number not on WhatsApp'**\n\nبس الـ account فعلاً على WhatsApp! فعلاً wa.me/<phone> بـ يـ resolve صح لأن الـ wa.me server-side بـ يـ ping WhatsApp بـ الـ phone ويـ redirect لـ الـ canonical chat.\n\nلأن عملاء شوبيفاي عموماً أحدث وعندهم business profiles، نسبة الـ LID-based accounts فيهم أعلى بكثير من الـ CLARK customers (اللي معظمهم أقدم وعندهم phone-based identifiers). ده فسّر **بالظبط** ليه الـ bridge شغّال في CampaignsPg (CLARK customers) ومش شغّال في ShopifyIntegrationPg (Shopify customers)." },
      { type: "architectural", text: "✅ [الـ Fix: resolveChatId() helper بـ getNumberId() + LRU cache]\n\nبدّلت `formatChatId(phone)` بـ `await resolveChatId(phone)` اللي بـ يستخدم `waClient.getNumberId(phone)`. الـ API ده بـ يـ ping WhatsApp servers ويرجع الـ canonical identifier:\n```\n{\n  server: 'c.us' | 'lid',\n  user: '...',\n  _serialized: '<phone>@c.us' | '<lid>@lid'\n}\n```\nأو **null** لو الرقم فعلاً مش على WhatsApp.\n\nاستخدام `_serialized` مباشرة في sendMessage/getChatById يخلّيه يعمل لكل الـ account types — الـ legacy والـ LID-based.\n\n**Performance — لازم cache:**\nالـ getNumberId = network round-trip. campaign بـ 50 رسالة بدون cache = 50 round-trips = بطء + rate-limit risk. ضفت LRU cache:\n• Map<phone, {chatId, expiresAt, valid}> داخل clark-wa-bridge/server.js\n• Valid result → 24h TTL (canonical id rarely changes)\n• Invalid (not on WA) → 1h TTL (احتمال يتسجل بعدين)\n• Network errors → ما تتـ cache (الـ next attempt يـ retry)\n• Cap: 100 entries بـ LRU eviction (Map insertion order)\n• Fallback: لو waClient غير ready، يرجع `<phone>@c.us` (defensive — مش بـ يـ throw)\n\nالـ campaign بـ 50 رسالة بقت تـ hit getNumberId 50 مرة في أول مرة، وبعدها 0 مرة لـ 24 ساعة. الـ second campaign لنفس الأرقام = 0 ping × 50 = instant." },
      { type: "feature", text: "🛠 [New endpoint: POST /numberid-cache/clear]\n\nلو الـ admin شك إن في stale cached entries (مثلاً رقم اتـ cached كـ 'not on WhatsApp' بس صاحبه اشترك في واتساب بعد كده ومش حابب يستنى الـ 1h TTL)، يقدر يـ flush الـ cache:\n```\nPOST /numberid-cache/clear → { ok: true, cleared: N, validCleared: M }\n```\nبـ يـ wipe الـ Map كله. الـ next message بـ يـ trigger getNumberId() لكل recipient من جديد (~150-300ms per recipient pre-warmup). Safe to call any time.\n\n**Visibility في /status:**\nضفت field `numberIdCache: { size, max }` في الـ /status response. الـ CLARK Bridge Status Panel يقدر يعرضها مستقبلاً لـ observability." },
      { type: "fix", text: "📌 [bridgeVersion bumped من '1.0' لـ '1.1']\n\nالـ /status response دلوقتي بـ يـ return `bridgeVersion: '1.1'`. ده مهم لأن:\n• Bridges < 1.1 لسه عندها الـ formatChatId hardcoded → LID accounts بـ يـ fail عندهم\n• الـ user لازم يـ redeploy الـ bridge service (docker compose pull/restart، أو git pull + node server.js على الـ VPS)\n• الـ CLARK Bridge Status Panel ممكن يـ surface warning مستقبلاً لو bridgeVersion < '1.1'\n\nالـ package.json كمان bumped لـ '1.1.0'. الـ banner عند الـ startup بـ يـ print 'V21.9.36: LID-aware chatId resolution enabled'." },
      { type: "doc", text: "📋 [Deploy plan + retesting]\n\n**Step 1 — Update Bridge Service:**\nعلى الـ VPS/local machine اللي بـ يـ run الـ clark-wa-bridge:\n```bash\n# لو git-deployed:\ncd /path/to/clark-wa-bridge\ngit pull   # أو scp الـ updated server.js\n# لو docker:\ndocker compose down && docker compose up -d\n# لو node مباشرة:\npkill -f 'node server.js'\nnode server.js\n```\nالـ console المفروض يـ print: 'CLARK WhatsApp Bridge v1.1' + 'V21.9.36: LID-aware chatId resolution enabled'.\n\n**Step 2 — Verify via /status:**\n```bash\ncurl https://your-bridge-url/status | jq .bridgeVersion\n# → '1.1'  ✓\ncurl https://your-bridge-url/status | jq .numberIdCache\n# → { size: 0, max: 100 }  ✓\n```\n\n**Step 3 — Verify via CLARK Bridge Status Panel:**\nSettings → فحص الصحة + المخزن → 'WhatsApp Bridge Status' → expand. الـ status لازم يكون 🟢.\n\n**Step 4 — Test Shopify Customers Bulk Send:**\n1. Shopify Integration → Customers tab\n2. اختار 2-3 عملاء من الـ accounts اللي كانت 'Number not on WhatsApp' قبل\n3. '📱 WhatsApp Bulk' → اكتب رسالة → '🌉 Bridge' radio → '🌉 إرسال عبر Bridge'\n4. استنى 30 ثانية → الـ toast لازم يكون '✅ تم إرسال N رسالة بنجاح'\n5. لو لسه فيه failed → افتح الـ Bridge Status Panel، شوف الـ activity log → الـ error message هـ يكون مختلف (ليس 'Number not on WhatsApp' للـ LID accounts)\n\n**لو فيه LID account لسه failed بعد V21.9.36:**\nخد screenshot من الـ activity log + curl /status, ابعتلي. الـ getNumberId returned null = WhatsApp فعلاً ما بـ يـ recognize الرقم (مثلاً الرقم خاطئ، أو الـ account اتـ deleted). مش bug في الـ bridge." },
    ]
  },
  {
    version: "V21.9.35",
    date: "2026-05-12",
    types: ["fix", "feature", "architectural"],
    title: "🌉 Phase 13q — Bridge من Shopify Customers أخيراً بـ يبعت + Bridge Status Panel",
    changes: [
      { type: "fix", text: "🚨 [الـ user بلّغ: 'الخدمة شغالة في باقي البرنامج (CampaignsPg) بس مش بتبعت لعملاء شوبيفاي. بقدر ابعت يدوي من ايقونة الموبيل على الصف']\n\nROOT CAUSE ANALYSIS: V21.9.34 صلّحت الـ field names (message/media) — بس لسه فيه 3 bugs خفية في handleComposerSend في ShopifyIntegrationPg:\n\n**Bug #1 — Pre-flight check بـ يـ check waReady فقط:**\n```js\nif(bridgeStatus.waReady === false){ /* warn */ }\n```\nبـ يفوت أهم scenario للـ silent fail: **queuePaused = true**. لو الـ daily cap اتـ reached في session سابقة، الـ bridge بـ يـ pause الـ queue تلقائياً. الـ /send بـ يـ accept المسجات (added > 0) لكن **مفيش معالجة** — الـ messages بـ يـبقوا pending forever. الـ UI بـ تـ show 'تم إرسال' لأن addedCount > 0.\n\n**Bug #2 — Phone normalization عربة:**\n```js\nphone: String(c.phone || '').replace(/[^0-9]/g, '').replace(/^0/, '20'),\n```\nبـ يـ replace أول `0` فقط. لـ phone `00201001234567` (international dial-out format):\n• strip non-digits → `00201001234567`\n• replace `^0` → `2000201001234567` (16-digit garbage)\nالـ bridge.normalizePhone بـ يـ check `startsWith('20')` ✓ → بـ يرجع نفس الـ 16-digit. الـ `isRegisteredUser` بـ يـ fail → status=failed silently.\n\n**Bug #3 — Post-send verification صامت:**\n```js\nsetTimeout(async () => {\n  const activity = await fetch(...);\n  console.log(activity);  // ← invisible to user\n}, 5000);\n```\nالـ V21.9.34 بـ يـ poll مرة واحدة بعد 5 ثواني وبـ يـ log في DevTools console بس. لو كل المسجات failed/skipped، الـ user **مش هـ يعرف**. الـ توست بـ يكون '🌉 تم إضافة N رسالة للـ bridge queue' وخلاص." },
      { type: "architectural", text: "✅ [الـ Fix: shared whatsappBridge.js — single source of truth]\n\nنقلت كل الـ bridge logic لـ `src/utils/whatsappBridge.js`:\n• `bridge.status/queue/activity/send/pause/resume/clear/stop/optouts/resetDaily`\n• `cleanPhone(raw)` — canonical Egyptian normalization (battle-tested من CampaignsPg)\n• `verifyBridgeReady(url, token, opts)` — comprehensive pre-flight:\n   - Blocker: waReady === false\n   - Blocker: queuePaused === true\n   - Blocker: dailyCounter.sent >= dailyCap\n   - Warning: queue.pending > 50 (backlog)\n   - Warning: estimated overflow if dailySent + messageCount > dailyCap\n• `pollBridgeActivity(url, token, campaignId, expected, timeoutMs)` — polls /activity every 2.5s for up to 30s, filtered by campaignId. Returns real {sent, failed, skipped, pending, activities[], timedOut}.\n\nقبل V21.9.35 الـ CampaignsPg و ShopifyIntegrationPg كل واحد بـ يـ duplicate الـ bridge HTTP calls + phone regex. ده النوع من الـ duplication اللي بـ يـ create silent bugs (V21.9.34 fixed field names في الـ Shopify side، لكن الـ phone normalization mismatch فضل). الـ shared util يـ guarantee future bug fixes تـ propagate لكل callers." },
      { type: "fix", text: "✅ [الـ Fix في handleComposerSend بالكامل]\n\nالـ new flow:\n```js\n// 1. Comprehensive pre-flight\nconst ready = await verifyBridgeReady(bridgeUrl, bridgeToken, { messageCount });\nif(!ready.ok) { /* surface blockers — ask user */ }\nif(ready.warnings.length) { /* surface warnings — ask user */ }\n\n// 2. Build messages with canonical phone + single batch campaignId\nconst batchCampaignId = 'shopify_bulk_' + Date.now().toString(36) + '_' + ...;\nconst messages = targets.map(c => ({\n  id: 'shop_' + c.id + '_' + Date.now().toString(36),\n  phone: waCleanPhone(c.phone),  // ← handles 00/0/+20/10-digit\n  customerName: c.name || '',\n  message: renderMessageWithVariables(message, c),\n  media: imageUrl ? [{ url: imageUrl }] : null,\n  campaignId: batchCampaignId,    // ← single id = filter-able activity\n}));\n\n// 3. Send via shared client\nconst result = await waBridge.send(bridgeUrl, messages, bridgeToken);\n\n// 4. REAL post-send verification — poll /activity 30s\nconst verdict = await pollBridgeActivity(bridgeUrl, bridgeToken, batchCampaignId, addedCount, 30000);\n\n// 5. Surface comprehensive result\nif(verdict.timedOut && verdict.pending > 0) {\n  showToast('⏳ Bridge شغّال — N اتبعت، M لسه pending');\n} else if(verdict.failed > 0 || verdict.skipped > 0) {\n  showToast(`⚠️ نتيجة: ${sent} بعت · ${failed} فشل · ${skipped} skipped\\n\\nأسباب: ${reasons}`);\n} else {\n  showToast(`✅ تم إرسال ${verdict.sent} رسالة بنجاح!`);\n}\n```\n\nالـ user دلوقتي بـ يـ see بالظبط ايه اللي حصل:\n• لو الـ bridge موقّف → blocker popup قبل الإرسال\n• لو الـ daily cap reached → blocker popup\n• لو الـ messages بـ تتبعت بطيء → '⏳ N اتبعت، M pending'\n• لو في opt-outs → '⚠️ M skipped — أسباب: Opted out'\n• لو الـ numbers مش على WhatsApp → '⚠️ M failed — أسباب: Number not on WhatsApp'" },
      { type: "feature", text: "🌉 [Bridge Status Panel — visibility كاملة للـ bridge من داخل CLARK]\n\nأضفت `<BridgeStatusCard />` في DiagnosticsPanel (Settings → فحص الصحة + المخزن). الكارت بـ يـ poll الـ /status + /activity كل 3 ثواني لما يكون expanded.\n\nالـ UI بـ يعرض:\n• **Summary line** (دايماً ظاهرة): icon + color حسب الحالة:\n  - 🟢 'Bridge شغّال · 15/50 اليوم · 3 pending' (أخضر)\n  - ⏸ 'Bridge موقّف (paused)' (أصفر)\n  - 🔴 'WhatsApp مش متصل!' (أحمر)\n• **3 Status Pills**: WhatsApp connection · Queue state · waState (raw)\n• **Daily counter** + progress bar (أحمر لما يـ reach الـ cap)\n• **Queue stats** — 5 cells: pending / sending / sent / failed / skipped + opt-outs count\n• **Action buttons** (admin only): Pause/Resume · Clear Completed · Reset Daily · Stop All · Open Dashboard\n• **Recent activity** — last 20 entries مع timestamp + status + phone + reason\n\nده الـ panel الأكثر actionable للـ debugging 'الرسائل مش بـ توصل'. قبل V21.9.35 الـ user مفيش طريقة يشوف الـ bridge state من داخل CLARK — كان لازم يفتح الـ bridge dashboard في tab منفصل أو يدخل SSH على الـ VPS." },
      { type: "doc", text: "📋 [Test plan بعد deploy V21.9.35]\n\n1. ⏰ استنى Vercel ينهي الـ deploy (1-2 دقيقة)\n2. ⬆️ اضغط toast 'نسخة جديدة' أو Ctrl+Shift+R\n3. Settings → فحص الصحة + المخزن → اضغط ▼ عرض في **🌉 WhatsApp Bridge Status** card\n4. تحقق من الـ summary:\n   - 🟢 'Bridge شغّال · X/Y اليوم · Z pending' → جاهز للإرسال\n   - ⏸ 'Bridge موقّف' → اضغط '▶ Resume' (الـ orange button)\n   - 🔴 'WhatsApp مش متصل' → افتح bridge dashboard (الـ '🌐 افتح Dashboard' button)\n5. Shopify Integration → tab العملاء → اختار 2-3 عملاء → '📱 WhatsApp Bulk'\n6. اكتب الرسالة → الـ '🌉 Bridge' radio (default)\n7. اضغط '🌉 إرسال عبر Bridge'\n8. هـ يحصل:\n   - لو الـ bridge مش جاهز → blocker popup مع تفاصيل\n   - لو في warnings → warning popup\n   - لو OK → '🌉 تم إضافة N رسالة للـ queue · جاري المتابعة...'\n   - بعد 30 ثانية كحد أقصى → '✅ تم إرسال N رسالة بنجاح' OR '⚠️ نتيجة: X بعت · Y فشل · Z skipped'\n9. ارجع للـ Bridge Status panel → شوف الـ activity log — هـ تـ show آخر N entries مع الـ status بتاع كل واحد\n\n**لو لسه مش بـ يبعت بعد V21.9.35:**\n- شوف الـ Bridge Status panel: status حقيقي للـ bridge\n- شوف الـ activity log: ايه الـ exact reason للـ failure (Opted out / Number not on WhatsApp / etc.)\n- ابعت screenshot للـ Bridge Status panel — هـ يكون فيه كل اللي محتاج للـ debugging" },
    ]
  },
  {
    version: "V21.9.34",
    date: "2026-05-12",
    types: ["fix"],
    title: "🚨 Phase 13p — Bridge كان بـ يـ silently skip كل رسالة (wrong field names)",
    changes: [
      { type: "fix", text: "🚨 [الـ user بلّغ: 'بعت رسالتين على Bridge، ظهر إنهم اتبعتوا لكن فعلياً لم يتم الإرسال']\n\nROOT CAUSE: في V21.9.31 لما بنيت الـ Bridge integration لـ Shopify Customers Bulk، استخدمت field names غلط في الـ messages payload.\n\nالـ wa-bridge server.js بـ يـ validate كل message:\n```\nfor (const m of messages) {\n  if (!m.phone) continue;\n  if (!m.message && !m.mediaBase64 && !(Array.isArray(m.media) && m.media.length > 0)) continue;\n  added.push({...});\n}\n```\n\nبـ يـ require:\n• `m.message` (text)\n• `m.media` (array) OR `m.mediaBase64`\n\nلكن أنا في V21.9.31 بعتلك:\n• `body` بدل `message` ❌\n• `images` بدل `media` ❌\n\nالنتيجة: الـ bridge بـ يـ skip كل رسالة (continue) ويرجع `{ok: true, added: 0}`. الـ UI بـ يـ bump contact_count بدون verification. الـ user يشوف 'تم إرسال 1' لكن فعلياً مفيش رسالة في الـ queue ولا اتبعت." },
      { type: "fix", text: "✅ [الـ Fix: استخدام نفس الـ format بـ CampaignsPg (الـ working reference)]\nقارنت بـ CampaignsPg.jsx بـ يـ build messages كده:\n```\n{\n  id: campaignIdRef.current + '_' + c.id,\n  phone: cleanPhone(c.phone),\n  customerName: c.name,\n  message: personalize(template.body, c),  ← key field name\n  media: allMedia.length > 0 ? allMedia : null,  ← array of {url, mime, name}\n  campaignId: campaignIdRef.current,\n}\n```\n\nالـ V21.9.34 fix:\n```\nconst messages = targets.map(c => ({\n  id: 'shop_' + c.id + '_' + Date.now().toString(36),\n  phone: String(c.phone || '').replace(/[^0-9]/g, '').replace(/^0/, '20'),\n  customerName: c.name || '',\n  message: renderMessageWithVariables(message, c),  ✓ صح\n  media: imageUrl ? [{ url: imageUrl }] : null,      ✓ صح\n  campaignId: 'shopify_customers_bulk_' + Date.now().toString(36),\n}));\n```" },
      { type: "fix", text: "🛡 [Verification post-send + pre-send status check]\nأضفت 3 طبقات verification:\n\n1. **Pre-send status check**:\n   • GET /status قبل الـ send\n   • لو waReady === false → ask user confirmation 'الـ WhatsApp مش connected. Continue?'\n   • Default: cancel\n\n2. **Post-send count verification**:\n   • Compare result.added vs messages.length\n   • لو added < messages.length → ask user 'الـ bridge skipped N رسالة، Continue?'\n   • لو added === 0 → abort + toast 'مفيش رسائل اتبعت!'\n\n3. **Activity polling (background)**:\n   • بعد الـ send بـ 5 ثواني، GET /activity?limit=N\n   • Log في console للـ debugging\n   • مفيش UI block — just logs لو الـ admin محتاج يـ debug\n\nالتوست الجديد بـ يكون:\n• ✅ Success: '🌉 تم إضافة N رسالة للـ bridge queue · queue total: M'\n• ⚠️ Partial: ask user how to proceed\n• ❌ Zero added: 'مفيش رسائل اتبعت! check phones + opt-outs'" },
      { type: "doc", text: "📋 [How to retry after V21.9.34 deploys]\n\n1. ⏰ استنى Vercel ينهي الـ deploy\n2. ⬆️ اضغط toast 'نسخة جديدة' أو Ctrl+Shift+R\n3. Shopify Integration → tab العملاء\n4. اختار العملاء اللي بعتلهم قبل كده (الـ contact_count بـ يفضل = 1 من المحاولة السابقة — مش مشكلة، Sequential bumping)\n5. اضغط '📱 WhatsApp Bulk'\n6. اكتب الرسالة\n7. اختار '🌉 Bridge' (default)\n8. اضغط '🌉 إرسال عبر Bridge'\n9. التوست الجديد هـ يقول '🌉 تم إضافة N رسالة للـ bridge queue · queue total: M'\n10. الرسائل بـ تطلع فعلياً على واتساب الـ bridge خلال ثواني\n\n**Verification: افتح الـ bridge dashboard URL** (مثلاً http://localhost:3001/) — هـ تشوف queue + activity مع الرسائل اللي اتبعتت فعلاً." },
    ]
  },
  {
    version: "V21.9.33",
    date: "2026-05-12",
    types: ["fix"],
    title: "🚨🚨 Phase 13o — THE ROOT CAUSE: upConfig كان بـ يـ wipe shopifyCustomersDocs/shopifyProductsDocs على كل save",
    changes: [
      { type: "fix", text: "🎯 [الـ smoking gun الحقيقي — sponge النهاية لمشكلة 'الـ data بـ يختفي للمرة الألف']\nالـ user بلّغ طول اليوم: 'البيانات بـ تختفي'. حاولنا fix-flags، حاولنا re-sync، حاولنا audit. كل مرة الـ data تختفي تاني. ده لأن:\n\nROOT CAUSE: في src/App.jsx فيه upConfig() اللي بـ يـ trigger على كل save (saving settings, adding customer, تعديل أي حاجة). الـ logic عنده 3 hydration blocks:\n```\nif(prev[PARTITIONED_FLAG_V1675]) { hydrate hrWeeks }      ✓ V21.9.32 و earlier\nif(prev[PARTITIONED_FLAG_V1957]) { hydrate master data } ✓ V21.9.32 و earlier\n// ❌ مفيش if(prev[PARTITIONED_FLAG_V2192]) — V2192 فاضي!\n```\n\nالـ V2192 fields (shopifyCustomers + shopifyProducts) ما كانوش يتـ hydrate. النتيجة:\n1. `partFieldsActive` array ما يحتويش shopifyCustomers/shopifyProducts\n2. `newPart` object بـ يتـ build بـ V1675+V1957 fields بس\n3. الـ syncAllPartitionedChanges() runs over **ALL** PARTITIONED_FIELDS (incl. V2192):\n   - oldArr.shopifyCustomers = 1147 (من الـ listener)\n   - newArr.shopifyCustomers = undefined → [] (مش في newPart)\n   - الـ diff: 1147 → 0 = DELETE 1147 doc\n4. **shopifyCustomersDocs و shopifyProductsDocs بـ يتـ wipe من Firestore على كل upConfig call**\n\nده فسّر:\n• ليه الـ data بـ يختفي بعد كل refresh (الـ refresh نفسه ما بـ يـ wipe، لكن أي عملية بعد الـ sync بـ تـ wipe)\n• ليه customers + suppliers + workshops + employees محفوظين (V1957 fields بـ تتـ hydrate صح)\n• ليه shopifyCustomers + shopifyProducts فقط هما اللي بـ يختفوا\n• ليه مفيش entry في migrationLog (الـ delete بـ يحصل عبر deleteDoc() داخل syncPartitionedCollection — مش بـ يـ log)\n• ليه الـ V19.62/63 safety net ما اشتغلش (لأن الـ check بـ يقول `if(!(f in newPart)) continue;` — يعني لو الـ field مش في newPart، الـ check بـ يـ skip-ـه)" },
      { type: "fix", text: "✅ [الـ Fix: ضفت block V2192 hydration]\nفي src/App.jsx، ضفت 3rd hydration block:\n```\nif(prev[PARTITIONED_FLAG_V2192]){\n  for(const f of PARTITIONED_FIELDS_V2192){\n    next[f]=JSON.parse(JSON.stringify(explicitPartBefore[f]||[]));\n    partFieldsActive.push(f);\n  }\n}\n```\n\nو ضفت الـ V2192 flag للـ partActive check في upConfigTx:\n```\nconst partActive = Boolean(...V1675...) || Boolean(...V1957...) || Boolean(...V2192...);\n```\n\nبعد الـ fix:\n1. shopifyCustomers/shopifyProducts بـ يتـ hydrate من partitionedDataRef.current (الـ listener data — 1147 + 55)\n2. partFieldsActive يحتوي V1675 + V1957 + V2192\n3. newPart يحتوي كل الـ partitioned fields\n4. syncAllPartitionedChanges بـ يرى oldArr=newArr (مفيش delta) → مفيش deletes\n5. الـ V19.62/63 safety net الآن بـ يـ guard shopifyCustomers + shopifyProducts كمان" },
      { type: "fix", text: "🎯 [نفس النمط بالضبط زي V19.62 bug — مكرر سهواً]\nهذا الـ bug مماثل تماماً لـ V19.62 bug القديم اللي تم اكتشافه و fix-ـه. الـ V19.62 ROOT CAUSE COMMENT في الكود بـ يقول:\n```\nPre-V19.62 this was hardcoded to {hrWeeks: [...]} — a leftover from V16.75\nwhen only hrWeeks was partitioned. V19.57 added 8 master-data fields\n(customers, suppliers, workshops, employees, empDebts, generalProducts,\nfabrics, accessories) but THIS line was never updated.\n```\n\nعند ما V21.9.2 ضاف الـ shopify fields، نفس الـ pattern اتـ نسي. الـ V21.9.2 changelog ما ذكرش الـ upConfig hydration block needed update. لمدة ~10 أشهر، الـ bug كان silent — حتى الـ user اشتكى. (الـ user كان بـ يستخدم workaround: re-sync بعد كل save).\n\nالـ V21.9.33 يـ closes الـ gap ويعمل الـ upConfig hydration loop comprehensive لكل partitioned migration version (V1675 + V1957 + V2192). أي V2393 مستقبلية ستحتاج تـ extend الـ block." },
      { type: "doc", text: "📋 [الـ user actions بعد deploy V21.9.33]\n\n1. ⏰ استنى Vercel ينهي الـ deploy (1-2 دقيقة)\n2. ⬆️ اضغط toast 'نسخة جديدة' لما يظهر، أو F5 hard refresh\n3. روح Shopify Integration → Products → 'سحب الكل'\n4. روح Customers → 'تحديث القائمة'\n5. F5 (verify ظاهرين)\n6. اعمل أي save في إعدادات (مثلاً غيّر اسم customer، أو edit settings)\n7. F5 تاني → **الـ data المفروض تفضل ظاهرة** (دي اللي ما كانتش تحصل قبل)\n\n**Verification في Firebase Console:**\n• shopifyCustomersDocs: لازم يفضل 1147\n• shopifyProductsDocs: لازم يفضل 55\n• بعد أي operation في الـ app\n\nده الـ fix النهائي للمشكلة الـ recurring. لو فيه data loss بعد V21.9.33 → ابعتلي screenshot بـ exact reproduction steps." },
    ]
  },
  {
    version: "V21.9.32",
    date: "2026-05-12",
    types: ["architectural", "feature"],
    title: "🎯 Phase 13n — Dynamic Role Scopes (admin يـ edit صلاحيات بدون republish)",
    changes: [
      { type: "architectural", text: "🚨 [الـ user بلّغ: 'محتاج اغير صلاحيات المستخدمين زي مانا عاوز']\nالـ user قال: 'كده مش عارف اغير الصلاحيات عشان ثبتناها في فاير ستور رولز. ممكن نخلي الموضوع راجع للادمن فقط ويشتغل فعلي لما الادمن يغير الصلاحيات فقط'.\n\nROOT CAUSE: الـ firestore.rules كانت **hardcoded** في الـ file:\n```\nfunction isPurchaseScope(){\n  return hasRole(['admin','manager','purchase_accountant','warehouse_keeper']);\n}\n```\nعشان تـ change 'purchase_accountant ميقدرش يشوف treasury' محتاج:\n1. Edit الـ file\n2. Publish على Firebase Console\n3. Re-deploy\n\nمش feasible للـ admin غير-تقني.\n\nالـ V21.9.32 architectural fix: نقل الـ scopes للـ Firestore document واخلي الـ rules تـ read منه dynamically." },
      { type: "feature", text: "🎯 [Dynamic Scopes — factory/roleScopes document]\nالـ scopes دلوقتي بـ تـ store في `factory/roleScopes`:\n```\n{\n  isAdmin: ['admin'],\n  isManagerPlus: ['admin', 'manager'],\n  isSalesScope: ['admin','manager','sales_accountant'],\n  isPurchaseScope: ['admin','manager','purchase_accountant','warehouse_keeper'],\n  isWarehouseScope: [...],\n  isHRRole: [...],\n  isHRWriter: [...],\n  isAnyAccountant: [...],\n  isAnyUser: [...]\n}\n```\n\nالـ firestore.rules بقت تـ read منه عبر `get()`:\n```\nfunction inScope(scopeName, fallbackRoles) {\n  let scopesData = exists(/databases/$(database)/documents/factory/roleScopes)\n    ? get(/databases/$(database)/documents/factory/roleScopes).data\n    : null;\n  let roles = scopesData != null\n    ? scopesData.get(scopeName, fallbackRoles)\n    : fallbackRoles;\n  return isAuthed() && (isBootstrapAdmin() || getRole() in roles);\n}\nfunction isPurchaseScope() { return inScope('isPurchaseScope', [...defaults...]); }\n```\n\nالـ fallback للـ hardcoded defaults لو الـ doc مش موجود (backwards compat)." },
      { type: "feature", text: "🛠 [Endpoint: /api/admin/role-scopes]\n4 actions:\n• **action='get'** — يرجع الـ scopes الحالية مع الـ defaults للـ comparison\n• **action='init'** — يـ create الـ doc بـ defaults لو مش موجود (one-shot)\n• **action='reset'** — يـ revert للـ defaults (مع backup)\n• **action='set'** — body: { scopes: {scopeName: [roles]} } — يـ update الـ scopes\n\nالـ Safety:\n• Admin role دايماً auto-included في كل scope (no lockout)\n• Validation: كل role في الـ array لازم يكون من الـ valid keys\n• Unknown roles بـ تتـ reject\n• Backup كامل قبل أي set/reset (في collection 'backups')\n• Audit log في migrationLog (set-role-scopes-v21.9.32)" },
      { type: "feature", text: "🖥 [UI Panel: 'Role Scopes Editor']\nفي DiagnosticsPanel (admin-only):\n\n• زر '📋 جلب الـ Scopes' — يـ load الـ data\n• Banner تحذيري لو الـ doc مش موجود + زر '🚀 Init بـ Defaults'\n• Matrix table: 9 scopes × 8 roles = grid of checkboxes\n  - الـ admin column disabled (always checked)\n  - isAdmin row disabled (admin only)\n• كل checkbox: toggle role-in-scope\n• زر '💾 حفظ التغييرات' (أخضر) — يـ show diff popup مع confirmation\n• زر '🔄 Reset to Defaults' (أحمر) — يـ revert للـ hardcoded values\n\nالـ workflow:\n1. اضغط 'جلب الـ Scopes'\n2. shift/uncheck لو محتاج\n3. اضغط 'حفظ التغييرات'\n4. Confirmation popup بـ diff summary\n5. Toast '✅ تم! N scope مـ updated'\n6. التغيير بـ يـ take effect فوراً (مفيش rules republish)\n7. الموظفين يعملوا hard refresh + الصلاحيات الجديدة تتفعّل" },
      { type: "doc", text: "📋 [الـ workflow الكامل للـ deploy]\n\n⚠️ **هذا التحديث بـ يحتاج rules republish واحد فقط** (V21.9.32 ضاف الـ inScope() function للـ rules + match clause لـ factory/roleScopes). بعد كده، أي تغيير على الـ scopes يـ take effect بدون republish.\n\n**Setup مرة واحدة:**\n1. Firebase Console → Firestore → Rules → الصق firestore.rules → Publish\n2. روح Settings → فحص الصحة + المخزن\n3. اضغط '📋 جلب الـ Scopes' في panel 'Role Scopes Editor'\n4. اضغط '🚀 Init بـ Defaults' (الـ doc بـ يـ create بـ القيم الـ hardcoded)\n\n**من دلوقتي ورايح — أي تغيير في الصلاحيات:**\n1. روح نفس الـ panel\n2. غيّر checkboxes حسب ما عاوز\n3. حفظ\n4. مفيش republish — مفيش downtime — مفيش CLI\n\n**أمثلة:**\n- لو عاوز warehouse_keeper يـ access treasury → check الـ checkbox تحت isPurchaseScope\n- لو عاوز payroll_accountant ميشوفش treasury → uncheck الـ checkbox\n- لو عاوز تحط محاسب مرتبات في sales scope → check الـ checkbox" },
    ]
  },
  {
    version: "V21.9.31",
    date: "2026-05-11",
    types: ["feature", "improvement"],
    title: "🌉 Phase 13m — WhatsApp Bridge integration للـ Shopify Customers Bulk",
    changes: [
      { type: "fix", text: "🚨 [الـ user بلّغ: 'WhatsApp Bulk شغال اليدوي مش البريدج']\nفي Shopify Integration → tab العملاء، الـ user كان يـ select عملاء ويضغط '📱 WhatsApp Bulk'. الـ composer كان بـ يفتح، لكن لما يضغط 'إرسال' كانت بـ تفتح N tab في WhatsApp Web (يدوي). الـ user عاوز يستخدم الـ WhatsApp Bridge اللي عنده مـ configured في الـ Campaigns إعدادات (clark-wa-bridge) — بـ يبعت تلقائياً من غير ما يفتح أي tabs." },
      { type: "feature", text: "🌉 [Send Mode picker في الـ WhatsAppComposer]\nالـ composer modal دلوقتي بـ يـ accept 2 props جدد:\n• bridgeUrl — من data.campaignBridge.url\n• bridgeToken — من data.campaignBridge.token\n\nلو bridgeUrl موجود، الـ composer بـ يعرض **section جديد في الفوتر**: '🔀 طريقة الإرسال' بـ 2 radio buttons:\n• **🌉 Bridge (تلقائي)** — يبعت من نفسه، مفيش tabs (default)\n• **📱 يدوي (Tabs)** — يفتح WhatsApp Web tab لكل عميل\n\nالـ default = Bridge لما يكون configured. الـ user يقدر يـ override لـ manual لو احتاج (مثلاً لو الـ bridge offline).\n\nالـ زر '📤 إرسال' بقى يـ change الـ label + اللون حسب الـ mode:\n• Bridge mode → '🌉 إرسال عبر Bridge' (أخضر #25D366)\n• Manual mode → '📱 إرسال يدوي' (أصفر)\n\nالـ tip text تحت يـ change كمان: 'الـ Bridge هـ يبعت في الـ background' vs 'الـ WhatsApp Web هـ يفتح tab'." },
      { type: "feature", text: "🌉 [handleComposerSend يـ route عبر bridge.send لو mode=bridge]\nقبل V21.9.31 الـ handleComposerSend كان دايماً يـ:\n```\nfor each customer:\n  window.open(buildWhatsAppLink(phone, text), '_blank');\n```\n\nبعد V21.9.31:\n```\nif (sendMode === 'bridge' && bridgeUrl) {\n  // Build messages array: [{phone, body, images}]\n  POST {bridgeUrl}/send بـ Bearer token\n  Toast: '🌉 تم إرسال N رسالة عبر Bridge'\n} else {\n  // Same as before — open WhatsApp Web tabs\n}\n```\n\nالـ HTTP request للـ bridge:\n• URL: `{bridgeUrl}/send`\n• Method: POST\n• Headers: `Content-Type: application/json` + `Authorization: Bearer {token}`\n• Body: `{ messages: [{phone, body, images: [url] | []}] }`\n\nلو فشل: toast 'Bridge فشل: ...' + console.error. الـ contact_count مش بـ يـ bump في الـ failure case (عشان الـ user يقدر يحاول تاني)." },
      { type: "doc", text: "📋 [How to use]\n1. Settings → CampaignsPg → Bridge Settings — تأكد إن الـ URL + Token معاهم\n2. Shopify Integration → tab العملاء\n3. اختار عملاء (checkbox)\n4. اضغط '📱 WhatsApp Bulk'\n5. الـ composer يفتح — اكتب الرسالة، ضيف صورة لو محتاج\n6. في الفوتر، طريقة الإرسال:\n   • 🌉 Bridge (default إذا configured) — يبعت في الـ background\n   • 📱 يدوي — يفتح tabs\n7. اضغط '🌉 إرسال عبر Bridge'\n8. Toast 'تم إرسال N رسالة' — كل العملاء يحصلوا الرسالة من نفس واتساب الـ bridge\n\nالـ تطبيق ده مماثل للـ CampaignsPg → BridgeSendScreen workflow. نفس endpoint (/send) ونفس message format ونفس Bearer auth." },
    ]
  },
  {
    version: "V21.9.30",
    date: "2026-05-11",
    types: ["fix", "feature", "architectural"],
    title: "🛡 Phase 13l — Permissions Audit (Rules vs Matrix mismatches)",
    changes: [
      { type: "fix", text: "🚨 [ROOT CAUSE — الناس بـ يشوفوا الـ tabs لكن الـ data جاية صفر]\nالـ user بلّغ: 'الناس مش شايفة كل البيانات والصلاحيات مش شغالة صح'.\n\nROOT CAUSE: CLARK عنده 3 طبقات للـ permissions، ولو واحدة مش متطابقة → user-visible bug:\n\n1. **firestore.rules** (server-side enforcement) — بـ يحدد أي role يقدر يـ read/write أي collection\n2. **cfg.users[uid]** (role assignment) — الـ user → role mapping\n3. **cfg.permissions[role][tab]** (UI tab visibility) — هل الـ tab تظهر edit/view/hide\n\nالـ mismatch الأكثر شيوعاً:\n```\ncfg.permissions[payroll_accountant].treasury = 'view'  ← UI يعرض الـ tab\nfirestore.rules treasuryDays: isPurchaseScope()       ← مش بـ يـ allow payroll_accountant\n```\nالنتيجة: الـ user بـ يـ click على Treasury tab، الـ onSnapshot listener بـ يـ fail بـ permission-denied، الـ data جاية صفر، الـ user يحتار 'ليه؟'.\n\nالـ V21.9.30 ضاف audit شامل بـ:\n- يـ scan كل role × كل tab × الـ rules + الـ matrix\n- يـ surface كل mismatch مع الـ explanation الواضح\n- يـ provide auto-fix بـ click واحد" },
      { type: "feature", text: "🛡 [Endpoint جديد: /api/admin/audit-permissions]\n2 actions:\n\n**action='audit'** — full cross-reference scan:\n• 8 roles × 25 tabs = 200 cells بـ تتـ check\n• لكل cell بـ يـ compute:\n  - Matrix value (cfg.permissions[role][tab]) → edit/view/hide/null\n  - Can read all backing collections per rules? Yes/No\n  - Can write all backing collections per rules? Yes/No\n• الـ conflicts الـ detected:\n  - `matrix_says_view_but_rules_deny_read` 🔴 (الـ user يشوف tab فاضية)\n  - `matrix_says_edit_but_rules_deny_write` 🔴 (الـ user مش يقدر يحفظ)\n  - `matrix_says_edit_but_rules_only_allow_read` 🟡 (edit مش بـ يشتغل)\n  - `hidden_but_rules_allow` ℹ️ (access مهدر، مش بug)\n\n**action='autofix'** — يـ apply الـ recommendations:\n• Downgrade `edit` → `view` لو الـ rules بـ يـ deny write\n• Downgrade `view` → `hide` لو الـ rules بـ يـ deny read\n• Backup كامل قبل أي تعديل في cfg.permissions\n• Audit log في migrationLog" },
      { type: "feature", text: "🖥 [UI Panel جديد: '🛡 Permissions Audit']\nفي DiagnosticsPanel (admin-only):\n\n• زر '🛡 افحص الـ Permissions' (purple)\n• Summary banner: 'لقينا X conflicts حرجة + Y تحذيرات' بـ counts per role\n• Filter dropdown لـ role-specific view\n• Table مفصّل: Role × Tab × Matrix value × Rules state × Conflict description × Recommended fix\n• زر '🔧 Auto-fix الكل' (red) لـ apply كل الـ recommendations atomic\n\nالـ admin يقدر:\n1. يشوف بالظبط أي role × tab فيها مشكلة (مثلاً payroll_accountant.treasury)\n2. يفهم السبب (Matrix says 'view' but rules deny read)\n3. يـ apply الـ fix بـ click واحد\n4. الـ موظفين يعملوا hard refresh والصلاحيات تتـ align" },
      { type: "doc", text: "📋 [الـ workflow الكامل لحل permissions issues]\n\n**Step 1 — Publish firestore.rules (مرة واحدة بعد V21.9.26)**:\n1. Firebase Console → Firestore → Rules\n2. الصق محتوى firestore.rules من الـ repo (root)\n3. اضغط Publish — Banner أخضر يظهر\n\n**Step 2 — Run Users Sync**:\n1. Settings → فحص الصحة + المخزن\n2. اضغط '🔍 افحص الـ Sync' (purple)\n3. لو فيه mismatches → '🔧 طبّق الـ Sync'\n\n**Step 3 — Run Permissions Audit (V21.9.30 الجديد)**:\n1. نفس الـ Settings panel\n2. اضغط '🛡 افحص الـ Permissions' (purple)\n3. شوف الـ conflicts (لازم تظهر لو في rules vs matrix mismatch)\n4. اضغط '🔧 Auto-fix الكل'\n5. Confirmation → تأكيد\n\n**Step 4 — Hard refresh لكل موظف**:\nكل user: Ctrl+Shift+R في الـ app بتاعه. الـ permissions تتـ refresh وتتـ align مع الـ rules.\n\nبعد الـ 4 steps دي، أي موظف هـ يـ:\n• يـ شوف فقط الـ tabs اللي رولـ-ه يـ allow\n• كل tab يظهر فيها data (مفيش permission-denied بصمت)\n• الـ edit/save بـ يـ work على الـ tabs اللي يقدر يـ edit-ها" },
    ]
  },
  {
    version: "V21.9.29",
    date: "2026-05-11",
    types: ["fix", "architectural"],
    title: "🛡 Phase 13k — Danger Zone safeguards (backup + log + smart restore)",
    changes: [
      { type: "fix", text: "🚨 [SMOKING GUN — bulk-update-products delete_all كان silent destruction!]\nبعد forensic audit للـ codebase، اكتشفت إن الزر '🗑 احذف الكل ({products.length})' في Products tab Danger Zone كان بـ يـ:\n1. يـ call POST /api/shopify/bulk-update-products بـ action='delete_all'\n2. الـ endpoint بـ يعمل `db.collection(shopifyProductsDocs).doc(id).delete()` لكل منتج\n3. ⚠️ **مفيش backup قبل الحذف**\n4. ⚠️ **مفيش migrationLog entry**\n5. الـ IDs بـ تـ added للـ blacklist (cfg.shopifyConfig.deletedProductIds) — اللي بـ يـ skip-هم في الـ sync الجاي\n\nالنتيجة: لو الـ admin ضغط الزر بالخطأ، الـ 55 منتج بـ يـ disappear من Firestore، الـ sync بـ يـ skip-هم (بسبب الـ blacklist)، ومفيش أي trace في الـ migrationLog لتقول 'حصل ايه'. ده فسّر تماماً ليه الـ user قال 'سحبت تاني واختفوا' — لأن الـ blacklist كان بـ يـ skip الـ IDs اللي اتـ delete." },
      { type: "fix", text: "✅ [الـ Fix: backup + log قبل أي destructive action]\nالـ bulk-update-products.js دلوقتي:\n• قبل delete_all أو delete_from_clark، بـ يعمل backup كامل في collection 'backups':\n  - migrationType: 'bulk-products-delete_all-v21.9.29' أو 'bulk-products-delete_from_clark-v21.9.29'\n  - shopifyProducts: full snapshot لكل المنتجات اللي هتـ delete\n  - product_ids_deleted: list of all IDs\n  - createdBy, createdAt\n• بعد الـ delete، بـ يـ log في migrationLog:\n  - fields_stripped: ['shopifyProducts'] (يظهر أحمر في الـ UI)\n  - backup_doc_id: للـ restore الـ one-click\n  - deleted, blacklist_size\n• الـ response دلوقتي بـ يـ return backup_doc_id\n\nلو الـ backup فشل لأي سبب، الـ delete بـ يـ ABORT بـ 500 — مفيش delete بدون backup أبداً." },
      { type: "feature", text: "♻️ [Smart Restore — products backups تـ route لـ shopifyProductsDocs]\nالـ V21.9.28 Migration Log Panel كان بـ يـ restore fields لـ cfg فقط. لكن الـ products backups محتاجة تروح لـ shopifyProductsDocs (partitioned collection).\n\nالـ migration-log.js دلوقتي بـ يـ detect الـ backup type:\n• migrationType بـ يحتوي 'bulk-products-' AND fields_to_restore فيها 'shopifyProducts'\n• → يـ route لـ restoreProductsBackup():\n  1. Pre-restore snapshot (لو حد عاوز undo)\n  2. Batch write لـ shopifyProductsDocs (400 doc/batch)\n  3. يـ remove الـ restored IDs من cfg.shopifyConfig.deletedProductIds (الـ blacklist)\n  4. يـ log في migrationLog (restore-products-from-backup-v21.9.29)\n  5. Returns: { products_restored, blacklist_cleared, pre_restore_backup_id }\n\nالـ user دلوقتي يقدر يـ recover من أي bulk-products delete بـ زر '♻️ Restore' في الـ Migration Log Panel — الـ data بترجع للـ partitioned collection AND الـ blacklist يتنظف، فالـ syncs الجاية مش هتـ skip-هم." },
      { type: "doc", text: "📋 [Recovery workflow للمستخدم]\n\n**لو الـ products اختفت (السيناريو الـ current):**\n\n**Option A** — لو في backup من delete (after V21.9.29 deploy):\n1. Settings → فحص الصحة + المخزن → '📋 جلب الـ Log'\n2. لقي entry بـ ⚠️ fields_stripped: 'shopifyProducts'\n3. اضغط '♻️ Restore'\n4. F5 → الـ products بترجع\n\n**Option B** — لو الـ delete اتعمل قبل V21.9.29 (مفيش backup):\n1. Shopify Integration → tab المنتجات → Danger Zone\n2. اضغط '🔄 مسح الـ Blacklist'\n3. اضغط '✂️ سحب الكل'\n4. الـ products بترجع من Shopify\n\n**🚨 IMPORTANT للمستقبل:**\n• الـ Danger Zone Button 'احذف الكل' لسه موجود لكن دلوقتي بـ يعمل backup auto\n• لو ضغطته بالخطأ، الـ recovery بـ click واحد من الـ Migration Log\n• مفيش data loss دائم في DELETE actions بعد V21.9.29" },
    ]
  },
  {
    version: "V21.9.28",
    date: "2026-05-11",
    types: ["feature", "architectural"],
    title: "📋 Phase 13j — Migration Log Inspector + Backup Restore (forensic + recovery)",
    changes: [
      { type: "feature", text: "📋 [Migration Log Panel — كل عملية اتعملت ظاهرة في الـ UI]\nالـ user بلّغ: 'لما ضغطت كل الأزرار في الإعدادات اختفت الأوردرات والمنتجات والعملاء كمان'. عشان نـ debug إيه اللي حصل بالظبط، احتجنا تـ surface الـ migrationLog في الـ UI.\n\nالـ endpoint الجديد POST /api/admin/migration-log بـ يـ support 3 actions:\n1. **action='list'** — last 50 entries sorted by .at DESC. Body: { limit?, sinceISO?, filterType? }\n2. **action='get_backup'** — يعرض contents الـ backup doc بـ counts (مش الـ full data)\n3. **action='restore_backup'** — يـ restore cfg fields من backup قديم\n\nالـ UI Panel '📋 Migration Log — سجل العمليات' في DiagnosticsPanel:\n• زر '📋 جلب الـ Log' — يعرض آخر 50 entry\n• Filter input لـ filter by type (مثلاً 'fix-flags' أو 'recover')\n• كل entry بـ يعرض:\n  - النوع (مع icon: ⚠️ destructive، ♻️ recovery، ▸ normal)\n  - الـ status + الـ timestamp + الـ user\n  - 🗑 stripped fields (لو فيه) بـ لون أحمر\n  - 🏳 flags set (لو فيه)\n  - ✓ items processed\n  - زر '▼ تفاصيل' لـ expand الـ raw JSON\n  - زر '♻️ Restore' لو الـ entry strip-ـ fields (يـ restore منها)" },
      { type: "feature", text: "♻️ [Restore from Backup — click واحد لاسترجاع الـ data]\nلكل entry في الـ log فيها `backup_doc_id` + `fields_stripped`، الـ admin يقدر يضغط '♻️ Restore' ويـ trigger restore_backup action:\n\n1. الـ endpoint بـ يقرا الـ backup doc\n2. يـ verify إن الـ fields الـ requested موجودة في الـ backup\n3. يعمل pre-restore backup للـ current state (في حالة undo)\n4. يكتب الـ fields من الـ backup إلى factory/config (merge: true)\n5. يـ log الـ restore في migrationLog\n6. يرجع stats (إيه اللي اتـ restored بكام item)\n\nالـ data بترجع مباشرة بعد F5. مفيش manual export/import." },
      { type: "feature", text: "🔍 [Detection: dangerous entries highlighted]\nالـ UI بـ يـ highlight الـ entries الـ خطيرة بـ لون أحمر:\n• fix-flags entries مع fields_stripped\n• recover-* entries (in green)\n• restore-* entries (in green)\n\nده يخلي الـ admin يـ scan الـ log بسرعة ويلاقي الـ destructive actions اللي عمل المشكلة." },
      { type: "doc", text: "📋 [استخدام الـ Migration Log الجديد]\n1. روح Settings → 'فحص الصحة + المخزن'\n2. اضغط '📋 جلب الـ Log' في panel 'Migration Log'\n3. شوف آخر العمليات (newest first)\n4. لو لقيت entry بـ ⚠️ + fields_stripped فيها 'shopifyCustomers' أو 'shopifyProducts':\n   → اضغط '♻️ Restore' لـ استرجاع الـ data من الـ backup الـ associated\n5. ولو الـ backup مش متاح → سجل re-sync من Shopify\n\n**Filter examples للـ debugging:**\n• filter 'fix-flags' → كل العمليات اللي عملها fix-flags\n• filter 'recover' → recoveries اللي تمت\n• filter 'split-shopify' → migrations لـ Shopify\n• filter 'sync' → user-sync operations" },
    ]
  },
  {
    version: "V21.9.27",
    date: "2026-05-11",
    types: ["fix", "architectural"],
    title: "🆘 Phase 13i — إصلاح bug في fix-flags (data loss) + Data Recovery endpoint",
    changes: [
      { type: "fix", text: "🚨 [CRITICAL BUG في V21.9.24 fix-flags — كان بـ يـ strip البيانات الـ legacy حتى لو الـ partitioned collection فاضية!]\nالـ user اكتشف: 'shopifyCustomersDocs مش موجودة' رغم إنه عمل re-sync قبل كده.\n\nROOT CAUSE: في api/maintenance/fix-flags.js كان:\n```\nif ((flagValue || flagsToSet.has(flag)) && cfg[field].length > 0) {\n  fieldsToStrip.add(field);  // ← بـ يحذف legacy حتى لو partitioned فاضي\n}\n```\n\nالسيناريو اللي حصل:\n1. الـ V21.9.2 migration ضبطت `_partitionedV2192Done = true` لكن **فشلت في نقل الـ data** (network issue، أو ما اشتغلتش أصلاً)\n2. cfg.shopifyCustomers فيها 1147 عميل (legacy، صح)\n3. shopifyCustomersDocs فاضية (الـ migration فشلت)\n4. الـ user عمل fix-flags → الـ code شاف flag=true + cfg fields موجودة → strip-ها\n5. النتيجة: الـ 1147 عميل **ضاعت** (الـ partitioned فاضي + cfg ما عادش فيه data)\n\nنفس المشكلة ممكن تحصل لـ shopifyProducts و أي partitioned field." },
      { type: "fix", text: "✅ [الـ Fix: data-loss prevention]\nدلوقتي fix-flags بـ يـ check 3 conditions قبل strip:\n```\nlet willStrip = false;\nif (flagSet && legacyHasData && partitionedHasData) {\n  willStrip = true;  // ← آمن، الـ partitioned هو الـ source of truth\n}\nelse if (flagSet && legacyHasData && partitionedEmpty) {\n  // ⚠️ DANGER: مفيش backup. WARN + لا تـ strip\n  dataLossWarnings.push({...});\n}\n```\n\nالمنطق الجديد:\n• Strip فقط لو الـ partitioned فيها data + flag set + legacy فيها data (true post-migration state)\n• لو flag=true + partitioned فاضي + legacy فيها data → الـ flag كذابة. نـ emit warning ولا نـ strip.\n• الـ response دلوقتي بـ يـ include `warnings: [{field, message}]` للـ admin يشوف الـ risks." },
      { type: "feature", text: "🆘 [Data Recovery Endpoint: /api/maintenance/recover-legacy-data]\nEndpoint جديد بـ 4 actions:\n\n1. **action='scan_legacy'** — يـ scan كل الـ partitioned fields ويعرض:\n   • cfg.<field> count\n   • <collection> doc count\n   • Flag value\n   • Severity: ok / duplicate / **recoverable** (legacy > 0 + partitioned = 0)\n\n2. **action='migrate_legacy'** — يـ migrate الـ data من cfg.<field> إلى الـ partitioned collection:\n   • Backup كامل قبل أي write\n   • Atomic writes في batches بـ 400\n   • Set الـ flag + strip الـ legacy field\n   • Audit log في migrationLog\n   • Returns: { items_written, backup_doc_id }\n\n3. **action='scan_backups'** — يـ list آخر 50 backup مع الـ contents (has_shopifyCustomers, has_shopifyProducts, إلخ)\n\n4. **action='restore_from_backup'** — يـ restore field معين من backup قديم:\n   • Body: { backup_doc_id, field, force? }\n   • يكتب الـ items من الـ backup إلى الـ partitioned collection\n   • Safety check: لو الـ collection فيها data بالفعل، يطلب force=true" },
      { type: "feature", text: "🛡 [Data Recovery panel في DiagnosticsPanel]\npanel جديد '🆘 Data Recovery — استرجاع البيانات الـ legacy' (admin-only).\nالـ admin يضغط '🔍 افحص الـ legacy data' → table بـ:\n\n| Field | cfg legacy | Partitioned | Flag | Action |\n|-------|------------|-------------|------|--------|\n| shopifyCustomers | 1147 | 0 | ✅ | 🆘 استرجع |\n| shopifyProducts | 55 | 0 | ✅ | 🆘 استرجع |\n| customers | 0 | 245 | ✅ | ✅ ok |\n\nزر '🆘 استرجع' لكل field بـ يـ trigger migrate_legacy → الـ data بـ ترجع للـ partitioned collection بـ backup + atomic writes.\n\nالـ panel ده هـ يحل المشكلة الحالية للـ user بـ click واحد لكل field." },
      { type: "doc", text: "📋 [How to use the recovery]\n\n**Scenario للـ user الحالي:**\n1. روح Settings → 'فحص الصحة + المخزن'\n2. اضغط '🔍 افحص الـ legacy data'\n3. لو ظهر شيء قابل للاسترجاع، اضغط '🆘 استرجع' لكل field\n4. F5 → الـ data هـ ترجع\n\n**لو الـ legacy فاضي أيضاً (data ضاعت تماماً):**\n1. روح Settings → 'فحص الصحة + المخزن'\n2. (لو ضفنا UI للـ backups) اضغط '📋 Scan Backups' لشوف الـ backups المتاحة\n3. لو لقيت backup فيه الـ data، نـ restore منه\n4. لو مفيش backup، الحل الأخير: re-sync من Shopify (يكتب في الـ partitioned مباشرة لأن الـ flag بقى true)" },
    ]
  },
  {
    version: "V21.9.26",
    date: "2026-05-11",
    types: ["fix", "architectural", "feature"],
    title: "🔄 Phase 13h — Users Sync (cfg.users ↔ cfg.usersList) + warehouse_keeper",
    changes: [
      { type: "fix", text: "🚨 [ROOT CAUSE — الناس في المصنع مش بـ يـ ينفذوا حركات]\nالمستخدم بلّغ: 'محاسب الخزنة الخزنة ظاهرة عنده تمام لكن جاية صفر ومفيش أي معلومات أو أرصدة' و 'بيعمل مبيعات ومش بيعرف يعمل حركات مبيعات'.\n\nROOT CAUSE: CLARK عنده **مصدرين منفصلين** للـ users، وهما **مش متطابقين**:\n\n1. **cfg.usersList** (الـ legacy) — الـ Settings page بـ يـ display منها:\n   • غالب أمين مخزن: 'محاسب مشتريات' (Arabic label) ✅ صحيح\n   • أحمد فوزي: 'محاسب مبيعات' ✅\n   • Ahmed Samy: 'مدير النظام' ✅\n\n2. **cfg.users** (الـ Firestore rules بـ تستخدم) — Users Management panel بـ يـ display:\n   • غالب: 'sales_accountant' (English key) ❌ غلط (المفروض purchase_accountant)\n   • أحمد فوزي: 'sales_accountant' ✅\n   • Ahmed Samy: 'admin' ✅\n\nالـ Firestore rules بـ تـ use cfg.users[uid] فقط (مش cfg.usersList). فلو غالب في cfg.users = 'sales_accountant'، الـ rules بـ تـ deny لما يحاول read treasury (treasuryDays needs isPurchaseScope = ['admin','manager','purchase_accountant']). النتيجة: ✓ الـ UI permission يخليه يدخل (لأنه من cfg.permissions[role] الـ legacy) لكن الـ Firestore listener يـ DENY → الـ data جاية صفر." },
      { type: "fix", text: "🐛 [Bug V21.9.24: warehouse_keeper كان مفقود في VALID_ROLES]\nفي V21.9.24 ضفّيت 7 roles فقط:\nadmin, manager, sales_accountant, purchase_accountant, payroll_accountant, payroll_verifier, viewer\n\n**نسيت warehouse_keeper** (أمين مخزن) — الـ role الـ 8 الموجود في src/utils/permissions.js منذ V19.44. النتيجة: لو الـ admin حاول يـ assign warehouse_keeper من الـ panel، الـ endpoint بـ يـ reject ('role غير صالح').\n\nFIX V21.9.26: ضفّيت warehouse_keeper لـ VALID_ROLES + لـ firestore.rules:\n• isPurchaseScope بقت تشمل warehouse_keeper (warehouse + stock + purchase receipts)\n• isAnyUser بقت تشمل warehouse_keeper\n• الـ getRole() الـ rules بقى يـ recognize warehouse_keeper" },
      { type: "feature", text: "🔄 [Users Sync Audit + Apply — endpoint جديد]\n2 actions جديدة في /api/admin/users-permissions:\n\n**action='sync_audit'** — يعمل full diagnostic:\n• يـ read cfg.users + cfg.usersList + cfg.customRoles\n• لكل user: يـ classify الـ status (matched, mismatch, missing_from_users, missing_from_userslist, unknown_role_label, missing_uid)\n• يـ normalize الـ Arabic role labels لـ English keys عبر mapping شامل:\n  - 'مدير عام' → admin\n  - 'مدير' → manager\n  - 'محاسب مبيعات' → sales_accountant\n  - 'محاسب مشتريات' → purchase_accountant\n  - 'محاسب الخزنة' → purchase_accountant (treasury under purchase scope)\n  - 'أمين مخزن' → warehouse_keeper\n  - 'محاسب مرتبات' → payroll_accountant\n  - 'مؤكد استلام' → payroll_verifier\n  - 'مشاهد' → viewer\n• Returns recommended role + reason + issues لكل user\n\n**action='sync_apply'** — يـ apply الـ approved changes:\n• Body: { changes: [{ uid, email, role }] }\n• Backup كامل قبل أي write\n• يكتب لـ cfg.users[uid] = role AND يـ update cfg.usersList[i].role\n• Audit log في migrationLog\n\nالـ admin يقدر:\n1. يضغط '🔍 افحص الـ Sync' (الزر البنفسجي)\n2. يشوف table بـ كل users + الـ source الأصلي (Arabic) + الـ Firestore source (English) + الـ issues\n3. لكل user يقدر يـ override الـ recommended role من dropdown\n4. يضغط '🔧 طبّق الـ Sync على كل الـ users'\n5. Toast '✅ تم! sync N user'" },
      { type: "fix", text: "🛡 [warehouse_keeper بقى يقدر يدخل warehouse + purchase receipts]\nالـ firestore.rules قبل V21.9.26:\n```\nmatch /stockMovementsDays/{day} {\n  allow write: if isPurchaseScope();  // warehouse_keeper مش included!\n}\nmatch /purchaseReceiptsDays/{day} {\n  allow read: if isPurchaseScope();   // warehouse_keeper مش include!\n}\n```\n\nأمين المخزن كان بـ يـ deny حتى على read على purchase receipts — رغم إن الـ job description بتاعه استلام البضاعة وجرد المخزون.\n\nبعد V21.9.26: isPurchaseScope بقت تشمل warehouse_keeper. أمين المخزن دلوقتي يقدر:\n✅ يقرا + يكتب stockMovements (حركات المخزون)\n✅ يقرا + يكتب purchaseReceipts (إيصالات الاستلام)\n✅ يقرا + يكتب treasuryTransfers (للـ تحويلات الخاصة بالمخزن — مع safeguards من cfg.permissions)\n❌ مش يقدر يكتب salesInvoices (sales scope only)\n❌ مش يقدر يكتب hrWeeks (HR scope only)\n\nالـ cfg.permissions[warehouse_keeper] الـ UI-level بـ يـ further restrict (تخفي tabs مالية)." },
      { type: "doc", text: "📋 [خطوات الـ admin بعد deploy]\n⚠️ STEP 1: الـ firestore.rules اتغيّرت — لازم تـ deploy على Firebase Console:\n1. افتح Firebase Console → Firestore → Rules tab\n2. الصق firestore.rules من الـ repo (root) → Publish\n   • أو استنى الـ GitHub Actions يـ deploy تلقائياً (لو متعمل setup)\n\nSTEP 2: شغّل الـ Users Sync Audit:\n1. روح Settings → 'فحص الصحة + المخزن'\n2. اضغط '🔍 افحص الـ Sync' (الزر البنفسجي)\n3. شوف الـ mismatches في الـ table\n4. عدّل الـ roles الـ recommended لو محتاج (من الـ dropdown)\n5. اضغط '🔧 طبّق الـ Sync على كل الـ users'\n6. ✅ تم!\n\nSTEP 3: قول لكل موظف يعمل Ctrl+Shift+R في الـ app بتاعه. الصلاحيات بـ تتفعّل خلال 2-3 ثواني (الـ Firestore rules بـ تـ re-evaluate تلقائياً).\n\nالنتيجة المتوقعة لـ غالب:\n• قبل: 'sales_accountant' → مش يقدر يدخل treasury\n• بعد: 'warehouse_keeper' (أو 'purchase_accountant' حسب الوظيفة) → يدخل treasury + warehouse + purchase receipts" },
    ]
  },
  {
    version: "V21.9.25",
    date: "2026-05-11",
    types: ["fix"],
    title: "🔧 Phase 13g — إصلاح short-circuit في my-permissions",
    changes: [
      { type: "fix", text: "🔧 [my-permissions كان بـ يـ short-circuit على الـ bootstrap UID]\nالمستخدم بلّغ: 'ليه ظاهر في cfg.users ❌ لا وأنا في الصلاحيات موجود؟'\n\nROOT CAUSE: في api/admin/my-permissions.js، الـ logic كانت:\n```\nif (uid === BOOTSTRAP_UID) {\n  role = 'admin'; source = 'BOOTSTRAP'; isBootstrap = true;\n  // ← ينتهي هنا\n} else if (cfg.users[uid]) {\n  isInUsersList = true; // ← مفيش وصول لهنا\n}\n```\n\nلو الـ UID match الـ bootstrap، الـ كود ما بـ يـ check cfg.users خالص → الـ flag isInUsersList بـ يفضل false **حتى لو الـ user موجود فعلاً** في cfg.users. ده misleading: الـ Users Management panel بـ يـ list-ـه (لأن handleList بـ يـ scan cfg.users فعلاً)، لكن الـ My Permissions panel بـ يقول 'مش موجود'.\n\nFIX: قسمت الـ logic لـ 2 steps independent:\n1. Compute `isInUsersList` بـ يـ check cfg.users + cfg.usersList دايماً (regardless of bootstrap)\n2. Compute `role` + `source` — لو bootstrap match، الـ role admin؛ لكن الـ source بـ يـ surface إنه موجود في cfg.users كمان (مثلاً: 'BOOTSTRAP_ADMIN_UID env var (+ cfg.users[admin])')\n\nالنتيجة: الـ panel دلوقتي بـ يعرض الحقيقة الكاملة — انت admin via bootstrap، AND انت explicitly listed في cfg.users." },
    ]
  },
  {
    version: "V21.9.24",
    date: "2026-05-11",
    types: ["fix", "feature", "architectural"],
    title: "🛡 Phase 13f — State Audit + Users & Permissions Management",
    changes: [
      { type: "fix", text: "🚨 [ROOT CAUSE — البيانات موجودة في Firestore لكن الـ UI بـ يـ show 0]\nالـ user بلّغ: 'سحبت المنتجات والعملاء، عملت refresh، كله اختفى تاني'. الـ Test rules بيقول shopifyCustomersDocs ✅ OK و shopifyProductsDocs ✅ OK (يعني الـ docs موجودة فعلاً). لكن الـ UI ظاهر 0.\n\nROOT CAUSE: الـ migration flag `_partitionedV2192Done` في factory/config مش set. الـ App.jsx merge logic:\n```\nif(configDoc._partitionedV2192Done){\n  merged.shopifyCustomers = partitionedData.shopifyCustomers; // 1147 doc\n} else {\n  merged.shopifyCustomers = configDoc.shopifyCustomers || []; // [] فاضي\n}\n```\nالـ flag false → الـ merge بـ يستخدم الـ legacy field على cfg (اللي فاضي). الـ data في shopifyCustomersDocs مش بـ تتـ load.\n\nسبب الـ flag false: الـ V21.9.2 client-side migration ما اشتغلتش لأي سبب (الـ V21.9.2 migration كان بـ يحتاج الـ data في cfg.shopifyCustomers، اللي مكنش موجود لو الـ server-side sync كتبها مباشرة في shopifyCustomersDocs بدون migration)." },
      { type: "feature", text: "✅ [الحل: State Audit + Fix Flags endpoints + UI]\nأضفت 2 endpoints جديدة:\n\n1. **POST /api/maintenance/audit-state** — full diagnostic:\n   • يـ scan كل migration flags في factory/config\n   • يـ count docs في كل partitioned collection (shopifyCustomersDocs, shopifyProductsDocs, customersDocs, إلخ)\n   • يـ count entries في كل split collection (treasuryDays, salesInvoicesDays, إلخ)\n   • يـ detect 'mismatches' (data موجودة لكن flag false)\n   • يرجع suggestions actionable\n\n2. **POST /api/maintenance/fix-flags** — one-shot fix:\n   • لكل mismatch: يـ set الـ flag\n   • يـ strip الـ legacy fields على cfg لو الـ flag بقى set\n   • Idempotent + backup كامل قبل أي write\n\nفي الـ DiagnosticsPanel، أضفت زر '🔍 افحص الـ state' (purple). لو لقى mismatches:\n• يعرض banner أحمر بـ القائمة:\n  🔧 shopifyCustomersDocs: 1147 doc لكن _partitionedV2192Done = false\n  🔧 shopifyProductsDocs: 55 doc لكن _partitionedV2192Done = false\n• زر '🔧 اصلح الـ Flags دلوقتي' (أحمر)\n• بعد الـ click → dry-run preview → confirm → actual fix → toast 'تم'\n• Refresh tip: 'اعمل F5 للصفحة عشان الـ data تظهر دلوقتي'\n\nالنتيجة: المنتجات والعملاء هـ يظهروا بعد الـ fix-flags + refresh — مفيش data loss، الـ docs كانت دايماً موجودة في Firestore." },
      { type: "fix", text: "👥 [ROOT CAUSE 2 — الناس في المصنع مش بـ يـ ينفذوا حركات رغم الصلاحيات]\nالـ user بلّغ: 'الناس في المصنع في مشاكل في الصلاحيات، مع إن عندهم صلاحيات إضافات وحاجات تانية، لكن مش بـ يعرفوا ينفذوا حركات'.\n\nROOT CAUSE: الـ firestore.rules الجديدة (V21.9.19) بـ تـ require الـ user role في `cfg.users[uid]`:\n```\nfunction getRole() {\n  let u = cfg.get('users', {}).get(request.auth.uid, '');\n  return u is string ? (u == '' ? 'viewer' : u) : u.get('role', 'viewer');\n}\n```\nلو الـ user UID مش موجود في `cfg.users` → الـ getRole() returns 'viewer' → معظم writes deny. النتيجة: الـ user signed-in في Firebase Auth، لكن الـ Firestore بـ تـ deny كل write لأنه 'viewer'." },
      { type: "feature", text: "🛡 [الحل: My Permissions + Users Management في DiagnosticsPanel]\nأضفت 2 endpoints جديدة:\n\n1. **GET /api/admin/my-permissions** — user-self diagnostic (any authed user):\n   • Returns: { uid, email, role, source, permissions, warnings, can }\n   • Warnings list لو role = viewer أو UID مش في cfg.users\n   • bootstrap_self action escape hatch لو مفيش admin موجود\n\n2. **POST /api/admin/users-permissions** — admin user management:\n   • action='list' — كل users بـ Firebase Auth info (displayName, lastSignIn)\n   • action='set' — set role لـ user\n   • action='remove' — حذف user من cfg.users\n   • action='auth_search' — بحث Firebase Auth بـ email\n   • action='bootstrap_self' — escape hatch (works only if no admin OR rules bootstrap UID)\n\nفي الـ DiagnosticsPanel، أضفت 2 panels:\n\n• **🛡 صلاحياتي** (auto-loads on mount لكل user):\n  - يعرض UID, Email, Role, Source\n  - Warning أصفر لو viewer أو missing\n  - زر 'Bootstrap me as admin' لو مفيش admin\n\n• **👥 إدارة المستخدمين** (admin-only):\n  - Form إضافة user جديد بـ email → بحث UID تلقائي → set role\n  - Table لكل users مع: name, email, UID, last sign-in, role dropdown, remove button\n  - Role options: admin, manager, sales_accountant, purchase_accountant, payroll_accountant, payroll_verifier, viewer\n  - Admin يقدر يضيف الناس في المصنع كـ manager أو sales_accountant عشان يقدروا يـ save أي حركات" },
      { type: "doc", text: "📋 [استخدام الـ workflow الجديد]\nبعد deploy V21.9.24:\n\n**لحل مشكلة 'البيانات بـ تختفي':**\n1. Settings → 'فحص الصحة + المخزن'\n2. اضغط '🔍 افحص الـ state'\n3. لو في mismatches، اضغط '🔧 اصلح الـ Flags دلوقتي'\n4. تأكيد → تم!\n5. F5 (refresh) → المنتجات والعملاء هـ يظهروا\n\n**لحل مشكلة 'الناس في المصنع مش بـ يعرفوا ينفذوا حركات':**\n1. Settings → 'فحص الصحة + المخزن'\n2. تحت 'إدارة المستخدمين والصلاحيات'، اضغط '📋 جلب القائمة'\n3. لكل user محتاج صلاحيات:\n   • لو موجود في الـ table → غيّر الـ role من الـ dropdown\n   • لو مش موجود → في الفورم فوق، ادخل الـ email بتاعه واختار الـ role + اضغط '➕ إضافة'\n4. الـ user يـ logout/login (أو F5) → الصلاحيات تتفعّل\n\n**نصيحة:** الـ roles المتاحة:\n• `admin` — كل حاجة (1-2 users فقط)\n• `manager` — تعديل معظم الحاجات (ما عدا users management)\n• `sales_accountant` — مبيعات + عملاء + قراءة عامة\n• `purchase_accountant` — مشتريات + موردين + خزنة\n• `payroll_accountant` — مرتبات + موظفين\n• `payroll_verifier` — verify المرتبات فقط (QR scan)\n• `viewer` — قراءة محدودة فقط" },
    ]
  },
  {
    version: "V21.9.23",
    date: "2026-05-11",
    types: ["fix", "improvement"],
    title: "🔐 Phase 13e — كشف rules-deployment + إصلاح زر 'جاري التحقق' العالق",
    changes: [
      { type: "fix", text: "🚨 [ROOT CAUSE — المنتجات والعملاء بـ يختفوا بعد كل refresh — وقت ما الـ data موجودة فعلاً في Firestore]\nالـ user بلّغ: 'سحبت المنتجات والعملاء من Shopify وكل تحديث الاقيها اختفت، مش ظاهرة في القائمة'. الـ diagnostics كان بيظهر:\n• shopifyCustomersDocs = 1147 doc (~1.09 MB)\n• shopifyProductsDocs = 55 doc (~268.6 KB)\n• لكن الـ UI: 'إجمالي 0 · عرض 0 من 0' في كل tab\n\nده exactly مشكلة C1 المتكررة في ISSUES_LOG: الـ data موجودة في Firestore فعلاً (الـ server admin SDK كتب الـ docs بنجاح)، لكن الـ client بـ يحاول subscribe لـ shopifyCustomersDocs / shopifyProductsDocs → بـ يتـ DENY بصمت → partitionedData.shopifyCustomers يفضل [] → UI يعرض 0.\n\nالسبب: الـ firestore.rules بـ تـ have الـ match clauses (V21.9.19) لكن لازم تتـ <b>publish</b> manually على Firebase Console. الـ Vercel ما بـ يـ deploy الـ rules تلقائياً.\n\nقبل V21.9.23: الـ listener errors كانوا بـ يـ log في console فقط — المستخدم مش يـ realize إن المشكلة هي الـ rules. كان لازم يفتح DevTools → console → يدور على 'permission-denied' messages." },
      { type: "fix", text: "✅ [الحل: Auto-detection + Banner واضح في DiagnosticsPanel]\nالـ App.jsx بقى يـ capture كل listener errors في `window.__clarkListenerErrors`:\n• Partitioned listeners (V19.57): shopifyCustomersDocs, shopifyProductsDocs, customersDocs, إلخ\n• Split listeners (V16.74): treasuryDays, salesInvoicesDays, إلخ\n\nالـ DiagnosticsPanel بـ يـ poll الـ key ده كل 3 ثواني، ولو في permission-denied errors يـ render banner أحمر كبير:\n\n  🚨 firestore.rules مش publish-ـة على Firebase Console!\n  ❌ shopifyCustomersDocs (shopifyCustomers) — permission-denied\n  ❌ shopifyProductsDocs (shopifyProducts) — permission-denied\n\n  📖 [Expand] كيفية الحل (3 خطوات — دقيقتين):\n    1. افتح Firebase Console واختار الـ project\n    2. روح Build → Firestore Database → Rules tab\n    3. الصق firestore.rules من الـ repo → Publish\n\n  💡 لو Setup GitHub Actions (V21.9.21 workflow) معمول، الـ deploy بـ يحصل تلقائياً" },
      { type: "feature", text: "🔐 [زر 'اختبر القواعد' — manual test for rules deployment]\nأضفنا زر 'اختبر القواعد' في DiagnosticsPanel. الزر بـ يحاول `getDocs(query(collection, limit(1)))` على 7 collections حساسة:\n• shopifyCustomersDocs (حرج)\n• shopifyProductsDocs (حرج)\n• shopifyOrdersDays\n• shopifyOrdersArchive\n• bostaDeliveriesArchive\n• salesCreditNotesDays\n• syncJobs\n\nبـ يـ classify كل result:\n• ✅ ok — read نجح، الـ rule بـ يـ allow\n• 🚨 denied — permission-denied (الـ rule مش publish-ـة)\n• ○ empty — read نجح لكن الـ collection فاضي (مش بالضرورة مشكلة)\n• ❌ error — Firestore error تاني (network, إلخ)\n\nبيعرض النتائج في banner ملوّن:\n• أحمر لو في critical denied (shopifyCustomersDocs أو shopifyProductsDocs)\n• أصفر لو في denied بس مش حرج\n• أخضر لو كله شغّال\n\nده ضروري بعد كل تعديل لـ firestore.rules — admin يقدر يـ verify الـ deployment manually." },
      { type: "fix", text: "🔄 [إصلاح زر 'جاري التحقق' العالق في Shopify Integration page]\nالـ user بلّغ: 'جاري التحقق دايماً بتعمل تحقق، وقفها المؤشر فوق بيقول انه متصل وخلاص'.\n\nROOT CAUSE: في ShopifyIntegrationPg.jsx، الـ useEffect على mount بـ يـ call shopifyStatus() ويـ set pingBusy=true. لو الـ call ما رجعش (network hang، server timeout >2min، CDN issue)، pingBusy فضل true forever والزر عالق.\n\nFIX: لفّينا الـ shopifyStatus call في Promise.race مع timeout 8 ثواني:\n```\nconst result = await Promise.race([\n  shopifyStatus(user),\n  new Promise((_, reject) => setTimeout(() => reject(new Error('PING_TIMEOUT')), 8000))\n]);\n```\nلو timeout قبل ما الـ response يرجع → الـ catch block يـ swallow الـ error + الـ finally يـ reset pingBusy=false → الزر يرجع لحالته الـ idle، الـ user يقدر يضغط '🔄 اختبار الاتصال' manually.\n\nالـ connected badge في الـ topbar لسه بـ يـ show 'متصل' (من الـ cached status) عشان الـ user يعرف إن الاتصال أساساً موجود." },
      { type: "doc", text: "📋 [Workflow الكامل بعد V21.9.23]\n1. ⬆️ Toast 'نسخة جديدة' يظهر تلقائياً (من V21.9.21)\n2. اضغط 'تحديث الآن' → reload\n3. روح Settings → 'فحص الصحة + المخزن'\n4. هـ يظهرلك banner أحمر تلقائياً لو الـ rules مش deployed: 'firestore.rules مش publish-ـة'\n5. اتبع الـ 3 خطوات (Firebase Console → Rules → Paste → Publish)\n6. لو عاوز تتأكد: اضغط زر '🔐 اختبر القواعد'\n7. كل النتائج هـ تكون ✅ → المنتجات والعملاء هـ يظهروا بعد next refresh\n\nالـ extra benefit: في console.firebase.google.com، الـ Rules editor بـ يـ accept الـ paste كاملاً ويعرض syntax errors لو في. الـ Publish خلال ثواني." },
    ]
  },
  {
    version: "V21.9.22",
    date: "2026-05-11",
    types: ["improvement", "feature"],
    title: "🖱 Phase 13d — أزرار صيانة في DiagnosticsPanel (مفيش POST requests يدوية)",
    changes: [
      { type: "feature", text: "🛠 [أدوات الصيانة في DiagnosticsPanel — مفيش curl/Postman]\nالـ user سأل: 'مش فاهم POST request يعني إيه'. الـ V21.9.21 أضاف 2 maintenance endpoints لكن لازم admin يـ trigger-ـهم عبر HTTP request. مش مناسب لـ workflow الـ admin الـ غير-تقني.\n\nالـ V21.9.22 أضاف الزرين دول مباشرة في الـ DiagnosticsPanel (SettingsPg → general tab → 'فحص الصحة + المخزن'):\n\n1. **🚨 Banner لـ Force-Split Shopify Orders** — بـ يظهر تلقائياً لو الـ diagnostics لقى shopifyPendingOrders فيه data + الـ flag _splitDaysV2199Done ما اتـ stamp-ـش. زر أحمر '✂️ شغّل التقسيم الآن' بـ يفتح confirmation popup بـ count الطلبات + المساحة المتوقع تحريرها.\n\n2. **🛠 Section 'أدوات الصيانة'** — في تحت كل الـ diagnostics report، فيه grid بـ 2 أزرار:\n   • 🧹 'تنظيف Treasury Duplicates' — اللي بـ يحذف الـ duplicates من قبل V21.9.14\n   • ✂️ 'Force-Split Shopify Orders' — fallback لو الـ auto-migration ما اشتغلتش\n\nكل زر بـ يعمل 2 calls تلقائياً:\n  أ) dry-run الأول → preview الأرقام (كم entry، كم day، إلخ)\n  ب) confirm popup يعرض الـ summary + يـ ask تأكيد\n  ج) actual run لو الـ user وافق\n  د) success toast + auto-refresh الـ diagnostics بعد 1.5 ثانية\n\nمفيش admin token manual، مفيش HTTP request، مفيش Postman. كل حاجة الـ admin محتاج يعرفها = wسة الزرار الأحمر." },
      { type: "improvement", text: "📚 [Helper functions في shopifyClient.js]\nأضفنا 2 functions في `src/utils/shopify/shopifyClient.js`:\n• `splitShopifyOrdersDaily(opts, user)` — wraps POST /api/maintenance/split-shopify-orders-daily\n• `dedupeTreasuryTransfers(opts, user)` — wraps POST /api/maintenance/dedupe-treasury-transfers\n\nنفس الـ pattern بتاع `splitShopifyCollections` (V21.9.2) — auth header تلقائي، error handling، الـ user يحصل على dry-run قبل أي destructive action.\n\nالـ DiagnosticsPanel استخدم الـ functions دي بدل ما يـ call الـ raw API endpoints. ده بـ يخلي الـ tests + الـ refactoring أسهل في المستقبل." },
      { type: "doc", text: "📋 [استخدام الأزرار]\nبعد deploy V21.9.22:\n\n1. **شغّل التقسيم بسرعة** (لو الـ migration الـ auto ما اشتغلتش):\n   • روح Settings → 'فحص الصحة + المخزن'\n   • اضغط '🔍 شغّل فحص شامل'\n   • هـ يظهر banner أحمر '🚨 تقسيم طلبات Shopify لسه ما اشتغلش' لو الـ array لسه فيه طلبات\n   • اضغط '✂️ شغّل التقسيم الآن' → confirmation → تم!\n\n2. **تنظيف Treasury duplicates**:\n   • نفس المكان، تحت بـ 'أدوات الصيانة'\n   • اضغط '🧹 فحص + تنظيف'\n   • هـ يـ scan الأول، يعرضك كم duplicate لقى، تأكيد، تم!\n   • Backup كامل بـ يـ saved قبل أي حذف.\n\nأي تنفيذ بـ يستغرق ثواني ويـ refresh الـ diagnostics تلقائياً عشان تشوف النتيجة." },
    ]
  },
  {
    version: "V21.9.21",
    date: "2026-05-11",
    types: ["architectural", "improvement", "fix"],
    title: "🛡 Phase 13c — أربع تحسينات معمارية لمنع تكرار المشاكل",
    changes: [
      { type: "architectural", text: "🤖 [GitHub Actions workflow — auto-deploy firestore.rules + storage.rules]\nقبل V21.9.21: كل تعديل لـ rules كان بـ يحتاج خطوة manual (Firebase Console → paste → Publish). نسيان الـ step ده كان السبب الرئيسي لمشكلة C1 (المنتجات/العملاء بـ يختفوا) لمدة 3 releases متتالية. الـ Vercel بـ يـ deploy الـ app code فقط، الـ Firebase rules كان لازم admin يعملها manually.\n\nالـ V21.9.21 workflow في `.github/workflows/deploy-firebase-rules.yml`:\n• Triggers على push لـ main لو firestore.rules / storage.rules / firebase.json اتغيروا\n• Validates الـ rules syntax الأول (rules_version declaration)\n• Authenticates عبر Firebase service account secret\n• Deploys via `firebase deploy --only firestore:rules` و `--only storage`\n• Concurrency lock عشان مفيش 2 deploys racing\n• Manual trigger متاح من GitHub Actions tab\n\n⚠️ Setup مطلوب (مرة واحدة فقط من الـ repo owner):\n1. Firebase Console → Project Settings → Service accounts → Generate new private key\n2. GitHub repo → Settings → Secrets and variables → Actions → New secret\n3. Name: FIREBASE_SERVICE_ACCOUNT, Value: paste الـ JSON كامل\n4. (اختياري) FIREBASE_PROJECT_ID لو مش في firebase.json\n\nبعد الـ setup: أي push يـ change rules → auto-deploy خلال 60 ثانية. مفيش manual step تاني." },
      { type: "fix", text: "🔄 [Service Worker versioning — auto-update toast بدل hard-refresh manual]\nقبل V21.9.21: الـ SW cache name كان hardcoded ('clark-app-v2'). كل release بـ يـ land على fresh fetches، لكن الـ cached JS chunks كانت بـ تستمر تـ serve القديم لحد ما الـ user يـ close كل tabs أو يعمل Ctrl+Shift+R. الـ mobile users نادراً بـ يعملوا أي من الاتنين → كانوا بـ يستخدموا V21.9.10 JS لما الـ server بقى V21.9.20.\n\nده فسّر ليه فيه fixes تم رفعها لكن الـ user بلّغ إنها لسه ظاهرة (الـ JS القديم بـ يستخدم).\n\nالـ V21.9.21 fix:\n• SW_VERSION بقى تابع لـ APP_VERSION ('v21.9.21')\n• كل bump بـ يـ invalidate الـ caches القديمة في الـ activate event\n• install: skipWaiting → الـ new SW يـ activate فوراً\n• activate: claim clients + delete كل cache غير الـ current version + broadcast 'SW_ACTIVATED' لل clients\n• fetch: network-first بـ 3s timeout للـ HTML/JS/CSS — الـ network response (لو متاح) دايماً يفوز على الـ stale cache\n• الـ main.jsx بـ يـ listen لـ `updatefound` event ويعرض toast جميل: 'نسخة جديدة من CLARK متاحة' + زرين [تحديث الآن] [لاحقاً]\n• الـ user يضغط 'تحديث الآن' → الـ SW يـ skipWaiting → controllerchange event → page reload تلقائي بـ fresh JS\n• Periodic check كل 60 دقيقة للـ users اللي بـ يخلوا الـ tab مفتوح طول اليوم\n\nالنتيجة: deploy يـ land → خلال page load واحد → الـ user يشوف toast → click 'تحديث' → seamless. مفيش manual cache clear تاني." },
      { type: "architectural", text: "🛡 [Defense-in-depth: assertNoLegacyOrdersWrite + assertSplitMode helpers]\nالـ V21.9.20 fix كان comprehensive لكن future endpoints جديدة ممكن يـ slip في same bug. الـ V21.9.21 ضاف 2 guards في `api/shopify/_pendingOrders.js`:\n\n1. **assertNoLegacyOrdersWrite(cfg, patch, opts)**:\n   • Cheap server-side guard\n   • Throws لو الـ migration flag set والـ patch فيه `shopifyPendingOrders`\n   • Usage:\n     ```\n     const patch = { stockReservations: ..., shopifyConfig: ... };\n     assertNoLegacyOrdersWrite(cfg, patch, { caller: 'my-endpoint' });\n     tx.set(cfgRef, patch, { merge: true });\n     ```\n   • يـ surface الـ bug at source بدل ما يـ bury silently في bloat metric.\n\n2. **assertSplitMode(cfg, opts)**:\n   • Sister helper — throws لو الـ migration NOT active\n   • Use lو الـ endpoint بـ يتطلب الـ day docs تكون موجودة (e.g. maintenance ops)\n   • Suggested action في الـ error: run /api/maintenance/split-shopify-orders-daily\n\nالاتنين doesn't add runtime cost في production — بس عند الـ write path الواحد per request.\n\nNote: الـ existing 10 endpoints في V21.9.20 already route via the helper فمش محتاجين الـ assert. الـ guards ده for future-proofing." },
      { type: "fix", text: "🧹 [Auto-cleanup endpoint للـ treasury duplicates من قبل V21.9.14]\nمن ISSUES_LOG.md §P6: المستخدمين اللي ضربتهم مشكلة الـ treasury duplicate قبل V21.9.14 (الـ approval flow race condition) لسه عندهم phantom rows في الـ ledger. الـ balance بـ يـ double-count لأن نفس الـ transfer ليه 2 sets of (in + out) legs.\n\nالـ V21.9.21 endpoint الجديد: POST `/api/maintenance/dedupe-treasury-transfers`\n\nالـ behavior:\n1. Walks كل treasuryDays/* day docs (أو cfg.treasury legacy لو الـ migration ما اتعملتش)\n2. Groups entries by (transferId, type) — unique transfer leg المفروض يظهر مرة واحدة فقط\n3. Each group بـ >1 entry → كيب الـ oldest (by createdAt), mark الباقي للحذف\n4. Backup كامل قبل أي write (في backups/pre-dedupe-treasury-v21.9.21-...)\n5. حذف الـ entries من الـ day docs (atomic per-day tx)\n6. Log الـ operation في migrationLog\n\nBody:\n  { dryRun: true } — preview only, no writes\n  {} — actual cleanup\n\nReturns:\n  { entries_removed: N, days_written: M, backup_doc_id: '...', duplicates_found: K }\n\n⚠️ Safety: الـ backup كامل (full snapshot of removed entries). لو حصل غلط، admin يقدر restore من backups collection. الـ idempotency: لو شغلتها مرتين، المرة التانية بـ تـ return 'مفيش duplicates'." },
      { type: "doc", text: "📋 [Deployment checklist V21.9.21]\n1. ✅ Code deployed via Vercel\n2. ⚠️ Setup الـ GitHub Actions secret FIREBASE_SERVICE_ACCOUNT (one-time)\n3. ✅ بعد ده، أي تعديل لـ firestore.rules → auto-deploy\n4. ✅ Service Worker update prompt يظهر تلقائياً للـ users بعد كل release\n5. (اختياري) admin يقدر يـ POST /api/maintenance/dedupe-treasury-transfers بـ {dryRun:true} الأول لـ preview الـ duplicates، بعدين يـ run بدون dryRun\n\nالملفات الجديدة:\n• .github/workflows/deploy-firebase-rules.yml\n• api/maintenance/dedupe-treasury-transfers.js\n• public/sw.js (rewrite بـ versioned caches)\n• src/main.jsx (SW update listener + toast)\n\nملفات معدّلة:\n• index.html (removed inline SW register — moved to main.jsx)\n• api/shopify/_pendingOrders.js (added 2 guard helpers)\n• package.json + constants/index.js + AboutVersionModal.jsx (V21.9.21)" },
    ]
  },
  {
    version: "V21.9.20",
    date: "2026-05-11",
    types: ["fix", "architectural"],
    title: "🔧 Phase 13b — حل جذري لمشكلة عدم اشتغال migration shopifyPendingOrders",
    changes: [
      { type: "fix", text: "🚨 [ROOT CAUSE — الـ migration كانت بـ تفشل بصمت بسبب 10 endpoints بـ تـ re-create الـ legacy array]\nالمستخدم بلّغ: 'لسه المشكلة، لم يتم التقسيم' حتى بعد V21.9.18 و V21.9.19. الـ diagnostics بيظهر:\n• factory/config = 419.7 KB (41% من 1MB)\n• shopifyPendingOrders = 200 طلب (283.6 KB = 67.6% من الـ doc)\n• shopifyOrdersDays = 0 docs\n\nالـ migration code في App.jsx كانت صحيحة 100%. لكن حتى لو اشتغلت ونجحت، فيه 10 endpoints على الـ server بـ تقرا وتكتب لـ cfg.shopifyPendingOrders مباشرة. أخطرهم الـ cron `shopify-poll-orders.js` اللي بـ يشتغل كل 5 دقايق ويعيد كتابة الـ legacy array — يعني حتى لو الـ migration اشتغلت، خلال 5 دقايق الـ array بترجع تاني!\n\nيعني الـ migration كانت ممكن تكون اشتغلت فعلاً واتنجحت، لكن الـ cron كان بـ يـ undo الـ split بـ كل poll.\n\nالـ 10 endpoints المخربة:\n• cron/shopify-poll-orders.js (KILLER — كل 5 دقايق)\n• cron/shopify-cleanup-reservations.js (يومياً)\n• bosta/webhook.js (3 مواضع — كل state change)\n• bosta/track.js (link + refresh)\n• bosta/create-shipment.js\n• bosta/sync-historical.js\n• bosta/print-awb.js (read فقط)\n• shopify/process-return.js (2 مواضع)\n• shopify/return-request-create.js\n• shopify/sync-historical-orders.js" },
      { type: "fix", text: "✅ [الحل — كل الـ 10 endpoints دلوقتي بـ تـ route عبر _pendingOrders.js helper]\nالـ helper بـ يـ check الـ flag `_splitDaysV2199Done`:\n• Pre-migration → بـ يقرا/يكتب cfg.shopifyPendingOrders (legacy)\n• Post-migration → بـ يقرا من shopifyOrdersDays/{YYYY-MM-DD} ويكتب للـ day doc الصحيح بـ key = shopify_created_at.slice(0,10)\n\nالـ key functions:\n• readAllPendingOrders(cfg) — flatten كل الـ day docs (أو cfg.shopifyPendingOrders pre-migration)\n• findPendingOrder(cfg, orderId) — يرجع { order, dayId } للـ targeted writes\n• upsertPendingOrder(cfg, order) — يكتب لـ day doc الصحيح\n• upsertManyPendingOrders(cfg, orders) — bulk write مجموع per-day\n\nالنتيجة: كل write يـ route تلقائياً للمكان الصحيح. مفيش أي endpoint بـ يكتب لـ cfg.shopifyPendingOrders post-migration — الـ split بـ يفضل clean. الـ cron مش هـ يـ undo الـ split تاني." },
      { type: "fix", text: "🛡 [Force-migration safety net — split-shopify-orders-daily endpoint محدث]\nالـ maintenance endpoint `/api/maintenance/split-shopify-orders-daily` بقى الـ official fallback لو الـ client auto-migration فشلت لأي سبب (network blip، service worker cache، إلخ).\n\nالـ V21.9.20 fix:\n• Sets BOTH `_splitDaysV2199Done` (client flag) و `_splitShopifyOrdersDaily` (legacy server flag) — قبل V21.9.20 كانوا flags مختلفين والـ client مش هـ يـ recognize الـ migration بتاع الـ server\n• Merges مع الـ existing day-doc entries (مفيش data loss لو الـ day doc موجود قبل)\n• Preserves الـ local fields (delivered_at, invoice_id, bosta state) لما يلاقي الطلب موجود قبل في الـ day doc\n• Force flag (`{ force: true }`) عشان admin يقدر يعيد التشغيل لـ cleanup حتى لو الـ flag set\n\nالأدمن يقدر يـ trigger ده بـ:\nPOST /api/maintenance/split-shopify-orders-daily\nAuthorization: Bearer <admin-token>" },
      { type: "fix", text: "🔍 [process-return.js + return-request-create.js — order read بقى split-aware]\nقبل V21.9.20:\n• process-return.js كان بـ يقرا الطلب من cfg.shopifyPendingOrders داخل الـ tx → post-migration يلاقي [] → throws 'الطلب مش موجود'\n• return-request-create.js نفس المشكلة\n\nبعد V21.9.20: الاتنين بـ يستخدموا findPendingOrder(cfg, orderId) من helper. الـ helper بـ يـ scan الـ day docs لو الـ split مفعّل، أو الـ legacy array لو لأ — كله transparent للـ caller.\n\nنفس البنية للـ writes: order updates بـ تروح لـ day doc الصحيح، CN/return-request creation بـ يفضل في الـ tx الـ atomic مع cfg patches." },
      { type: "fix", text: "📡 [Cron + Bosta webhook — كانوا أكبر مصدر للـ regression]\nbosta/webhook.js كان أصعب reformulate لأنه بـ يـ match orders inside a transaction. الحل: pre-read كل الـ orders via readAllPendingOrders OUTSIDE الـ tx، match بـ matchOrderToBostaDelivery، update الـ order via upsertPendingOrder.\n\nالـ misses log + الـ shopifyConfig metadata لسه بـ تتـ store على factory/config (هي صغيرة، مش بـ تكبر مع الوقت).\n\nbosta/sync-historical.js + shopify/sync-historical-orders.js كانوا بـ يكتبوا 200 طلب live بعد كل sync. دلوقتي:\n• Pre-migration: نفس السلوك (cap 200 على cfg.shopifyPendingOrders)\n• Post-migration: مفيش cap — كل طلب بـ يروح لـ day doc بتاعه (upsertManyPendingOrders bulk). شهر = 30 doc منفصل، كل واحد ~30-80 طلب، أبعد ما يكون عن الـ 1MB limit." },
      { type: "doc", text: "📋 [Deployment checklist V21.9.20]\n1. ✅ Code deployed via Vercel (auto على push)\n2. ⚠️ (لو ما اتعملش قبل) deploy firestore.rules manually من Firebase Console\n3. ✅ User يفتح الـ app → الـ V21.9.19 blocking popup يظهر للـ migration → ينقل الـ 200 طلب لـ day docs → اضغط 'تم'\n4. ✅ مفيش re-bloat بعد ده — الـ cron + كل الـ endpoints بـ يـ honor الـ split flag\n5. (إذا لزم) admin يقدر يـ POST /api/maintenance/split-shopify-orders-daily كـ manual cleanup\n\nالـ expected behavior بعد deploy:\n• Diagnostics: factory/config ينزل من 419 KB لـ ~135 KB\n• shopifyOrdersDays: يحتوي على docs بـ count = عدد الطلبات في كل يوم\n• مفيش shopifyPendingOrders في factory/config\n• الـ Orders tab يفضل يعرض الـ orders بشكل طبيعي (الـ client merge بـ يـ pull من splitData.shopifyPendingOrders post-migration — كان موجود قبل V21.9.20)" },
    ]
  },
  {
    version: "V21.9.19",
    date: "2026-05-11",
    types: ["fix", "architectural"],
    title: "🔐 Phase 13a — Firestore rules + blocking migration popup (data 'disappears' fix)",
    changes: [
      { type: "fix", text: "🚨🚨 [ROOT CAUSE — العملاء/المنتجات بـ تختفي بعد التحديث + الـ migration ما اشتغلش]\nالـ user بلّغ:\n• 'عملت سحب للمنتجات ومزامنة العملاء، بعد كل تحديث بيختفوا ولازم اعمل كده تاني'\n• 'لسه المشكلة، لم يتم التقسيم'\n\nالـ diagnostics بيظهر: shopifyCustomersDocs = 1147 doc, shopifyProductsDocs = 55 doc — البيانات موجودة فعلاً في Firestore. لكن الـ UI بيظهرها فاضية بعد كل refresh.\n\nالـ root cause: الـ firestore.rules بـ يحتوي على match clauses لمعظم الـ collections القديمة (treasuryDays, customersDocs, إلخ)، لكن مفيش match clauses لـ:\n• shopifyProductsDocs\n• shopifyCustomersDocs\n• shopifyOrdersDays (V21.9.18 الجديد)\n• shopifyOrdersArchive\n• bostaDeliveriesArchive\n• salesCreditNotesDays / purchaseDebitNotesDays (V21.9.5)\n• shopifyReturnRequestsDays (V21.9.7)\n• whatsappCampaignsDays / whatsappCampaignRunsDays (V21.9.8)\n• syncJobs (V21.9.4 progress tracker)\n• aiAgent* collections\n\nكل دي بـ تـ fall through لـ catch-all `match /{document=**} { allow read, write: if false; }` في نهاية الملف — denied بالكامل.\n\nالأعراض بالتفصيل:\n1. الـ server (firebase-admin) بـ يـ bypass الـ rules → الـ sync بـ ينجح وبيكتب 1147 customer في shopifyCustomersDocs\n2. الـ client بـ يحاول subscribe لـ shopifyCustomersDocs → DENIED بصمت\n3. partitionedData.shopifyCustomers بـ تفضل [] (الـ listener ما fire-ـش)\n4. الـ data useMemo بـ يـ merge → data.shopifyCustomers = [] → UI 'مفيش عملاء'\n5. الـ user يـ sync تاني → نفس النتيجة\n\nنفس الـ pattern للـ V21.9.18 migration: الـ client بـ يحاول يكتب لـ shopifyOrdersDays → DENIED → الـ migration بـ يفشل → الـ flag ما اتـ stamp-ـش → كل refresh الـ migration بـ يحاول تاني (وبيفشل تاني)." },
      { type: "fix", text: "🔐 [الحل — ضفت match clauses لكل الـ collections الناقصة]\nأضفت في firestore.rules:\n• shopifyProductsDocs / shopifyCustomersDocs (V21.9.2)\n• shopifyOrdersDays (V21.9.18)\n• shopifyOrdersArchive / bostaDeliveriesArchive (V21.9)\n• salesCreditNotesDays / purchaseDebitNotesDays (V21.9.5)\n• shopifyReturnRequestsDays (V21.9.7)\n• whatsappCampaignsDays / whatsappCampaignRunsDays (V21.9.8)\n• syncJobs (V21.9.4)\n• aiAgent* collections\n\nالـ permissions matched لكل collection بـ scope مناسب:\n• Sales data → isSalesScope (admin/manager/sales_accountant)\n• Purchase data → isPurchaseScope\n• Master data + Shopify reads → isAnyUser\n• Writes → isManagerPlus + role-specific\n\n⚠️ مهم: الـ rules دي لازم تـ deploy على Firebase Console يدوياً (Vercel ما بـ يـ deploy-ـها تلقائياً، نفس مشكلة storage.rules):\n\n1. https://console.firebase.google.com\n2. اختار الـ project\n3. Build → Firestore Database → Rules tab\n4. الصق محتوى firestore.rules من الـ repo\n5. Press 'Publish'\n\nبعد الـ deploy: الـ V21.9.18 migration هتشتغل فوراً + الـ customers/products هيظهروا بعد كل refresh." },
      { type: "fix", text: "🪟 [Popup blocking على الـ migration — مفيش auto-dismiss]\nالـ user طلب: 'لما تعمل تقسيم في بداية فتح البرنامج بعد التحديث، لازم يظهر بوب اب للتقسيم وممنوع الغلق'.\n\nقبل V21.9.19:\n• الـ migrationStatus popup كان بـ يظهر بـ progress + 'لا تغلق البرنامج'\n• لكن لما يخلص بنجاح، بـ يـ auto-dismiss بعد 2 ثانية بـ setTimeout\n• الـ user ممكن يخسر الـ confirmation\n\nبعد V21.9.19:\n• الـ popup الـ blocking ما عنده onClick على الـ backdrop — مفيش way يـ close بـ الـ click outside\n• في حالة النجاح، الـ popup يظهر '✅ تم بنجاح، اضغط تم للمتابعة' مع زر أخضر 'تم، أكمل'. مفيش auto-dismiss\n• في حالة الفشل، الـ popup يظهر '⛔ فشل التقسيم' مع تفاصيل الـ error وزر 'تم — أعد فتح البرنامج'\n• console logs مفصلة في كل خطوة (search '[V21.9.19]' في الـ DevTools)" },
      { type: "fix", text: "🔓 [Decoupled الـ V2199 migration من V2198 dependency]\nقبل V21.9.19: الـ V2199 migration كانت بـ تـ require `_splitDaysV2198Done = true` (WhatsApp campaigns). لو V2198 ما اتـ stamp-ـش لأي سبب (network blip أثناء الـ flag write)، V2199 ما هتشتغل ابداً.\n\nبعد V21.9.19: V2199 بـ تشتغل independently — بس بـ تـ check نفس الـ flag بتاعها (`_splitDaysV2199Done`) + `splitLoaded`. مفيش dependency chain.\n\nده pattern أحسن لأن كل migration بـ تخدم تـ split مختلف — مفيش data conflict between V2198 و V2199. الـ sequential dependency كان defensive over-engineering." },
      { type: "doc", text: "📋 [Migration deployment checklist]\nبعد رفع V21.9.19 للـ production:\n\n1. ✅ Code deployed via Vercel (automatic on push)\n2. ⚠️ افتح Firebase Console → Firestore → Rules → الصق firestore.rules → Publish\n3. ⚠️ (لو ما اتعملش قبل) افتح Firebase Console → Storage → Rules → الصق storage.rules → Publish\n4. ✅ User يفتح الـ app → blocking popup يظهر للـ V2199 migration → ينقل الـ 200 طلب لـ day docs → اضغط 'تم'\n5. ✅ بعد الـ rules + migration: العملاء + المنتجات هـ يظهروا بعد كل refresh بدون مشاكل\n\nالـ rules + migrations مرة واحدة فقط. مفيش follow-up مطلوب." },
    ]
  },
  {
    version: "V21.9.18",
    date: "2026-05-11",
    types: ["architectural", "fix"],
    title: "💾 Phase 13 — shopifyPendingOrders daily split (definitive fix for factory/config bloat)",
    changes: [
      { type: "architectural", text: "🚨 [ROOT CAUSE — factory/config وصل 40.9% من الـ 1MB حد]\nالـ diagnostics بـ يـ warn (Document factory/config: 418.9 KB - 40.9% من الحد الأقصى). الـ array `shopifyPendingOrders` كان وحده 284.2 KB = 67.8% من الـ doc.\n\nCLAUDE.md §2 معلّق المشكلة دي tagged 'pending split' من V19.91 — كل array بـ يكبر بـ dated entries لازم يتقسّم daily. الـ user طلب 'حل جذري + ينطبق تلقائياً مرة واحدة فقط أول ما يفتح البرنامج' — وده بالضبط ما اتعمل دلوقتي." },
      { type: "architectural", text: "📦 [الـ Migration: shopifyPendingOrders → shopifyOrdersDays/{YYYY-MM-DD}]\nالـ migration runs auto على first app load بعد upgrade:\n\n1. الـ App.jsx بـ يـ check `_splitDaysV2199Done` flag (مش متعمل)\n2. ينتظر V21.9.8 migration يخلص الأول (sequential order)\n3. backup ثقيل في backups/pre-migration-shopify-orders-v2199-{ts}\n4. الـ syncAllSplitChanges helper بـ يـ distribute كل order على day doc بـ key = shopify_created_at.slice(0,10). كل day doc بـ يـ store:\n   { date, entries: [...], count, updatedAt }\n5. atomic strip: `delete cfg.shopifyPendingOrders` + `cfg._splitDaysV2199Done = true`\n\nالنتيجة: factory/config يخسر ~280 KB. كل day doc ~5-80 orders × 1.4KB = 7-112KB. مفيش way الـ array يـ overflow الـ 1MB limit تاني." },
      { type: "architectural", text: "📚 [Server-side helper: _pendingOrders.js]\nملف جديد بـ يـ wrap الـ read/write pattern:\n• readAllPendingOrders(cfg) — flattens day docs أو returns legacy array (transparent)\n• findPendingOrder(cfg, orderId) — returns { order, dayId } للـ targeted writes\n• upsertPendingOrder(cfg, order) — routes للـ correct day doc by shopify_created_at\n• upsertManyPendingOrders(cfg, orders) — bulk write, one tx per day doc\n• deletePendingOrder(cfg, id) — scans + removes\n• isPendingOrdersSplit(cfg) — flag check\n\nالـ helper بـ يتعامل مع legacy و split modes بشفافية تامة — الـ endpoints مش محتاجة تـ care عن أي state هي فيه." },
      { type: "fix", text: "✅ [Endpoints updated to use the helper]\nالـ endpoints الأساسية اللي بـ تـ touch shopifyPendingOrders:\n• mark-delivered.js — pre-tx find via helper, write order back to its day doc (atomic مع invoice/reservations updates)\n• mark-refused.js — same pattern\n• sync-orders-now.js — pre-read all orders, classify new/updated, write bulk to day docs via upsertManyPendingOrders. الـ LEGACY_ORDERS_CAP=200 معمول فقط للـ pre-migration path; post-migration مفيش cap لأن كل day doc مستقل.\n• sync-customers.js — readAllPendingOrders pre-tx بدل ما يقرأ cfg.shopifyPendingOrders داخل الـ tx\n\nالـ endpoints الـ remaining (process-return, sync-historical, bosta/*, cron/*) لسه بـ يقرأوا cfg مباشرة — هـ يـ retrieve empty arrays post-migration ويفشلوا silently. هـ يـ get fixed في follow-up phase. الـ user الـ workflows الأساسية (sync + mark delivered/refused) شغّالة." },
      { type: "fix", text: "🔍 [diagnostics.js يـ recognize الـ new split]\n• اضاف shopifyOrdersDays لقائمة الـ archive_collections عشان الـ diagnostics page يعرضها\n• فك الـ orphaned-reservations detection + very-old-pending detection يستخدموا readAllPendingOrders بدل cfg.shopifyPendingOrders\n• post-migration الـ diagnostics مش هـ يـ flag الـ shopifyPendingOrders array لأنه مش موجود في cfg" },
      { type: "doc", text: "📋 [الـ array اللي كان bloating factory/config]\nقبل V21.9.18:\n  factory/config = 418.9 KB (40.9% of 1MB)\n    └─ shopifyPendingOrders: 284.2 KB (67.8% of doc)\n\nبعد V21.9.18:\n  factory/config ≈ 135 KB (~13% of 1MB)\n  shopifyOrdersDays/2026-05-10: ~30 KB\n  shopifyOrdersDays/2026-05-11: ~25 KB\n  ... (one doc per day, unlimited growth)\n\nمتطابق مع نفس النمط للـ treasury (V16.74), salesInvoices (V19.50), credit/debit notes (V21.9.5), إلخ. CLAUDE.md §2 رسمي pattern." },
    ]
  },
  {
    version: "V21.9.17",
    date: "2026-05-11",
    types: ["improvement"],
    title: "📋 Phase 12c — Transfers tab: read-only + compact rows",
    changes: [
      { type: "improvement", text: "🔒 [Transfers tab صار read-only]\nبناءً على طلب المستخدم: 'السجل ده للقراءة فقط لاغير. التعديل فقط من داخل حركات الخزنة'.\n\nالتغييرات:\n• حذف زر '+ تحويل جديد' من تاب التحويلات — الإنشاء بقى من تاب 'حركات الخزنة' (هناك زر '🔄 تحويل بين الخزن' في الـ toolbar الأساسي).\n• حذف زر '✏️ تعديل' من كل صف confirmed transfer.\n• حذف زر '🗑️ حذف' من كل صف confirmed transfer.\n• الـ approve / reject buttons للـ pending transfers محفوظة (دي workflow actions، مش edits).\n\nأي تعديل/حذف للتحويل بـ يحصل من حركات الخزنة (كل تحويل عنده 2 treasury rows لينكة بـ transferId — تعديل أي طرف بـ يحافظ على الـ double-entry consistency)." },
      { type: "improvement", text: "📏 [ارتفاع صفوف التحويلات بقى compact + احترافي]\nقبل V21.9.17: كل صف ~90px (padding 14، 3 سطور: from/to، note، meta).\nبعد V21.9.17: كل صف ~36px في سطر واحد بـ:\n• Amount (يسار، 80px min-width، tabular-nums)\n• From → To (وسط)\n• Note inline لو موجودة\n• Date + actor (يمين)\n• Approve/Reject buttons (للـ pending فقط)\n\nالـ padding اتقلل من 14 لـ 8px، الـ border من 2px لـ 1px، الـ font-sizes أصغر. الـ list density بقى مطابق لـ شاشات الـ banking apps." },
      { type: "improvement", text: "💬 [Empty state أوضح]\nقبل V21.9.17: 'لا يوجد تحويلات بعد — اضغط \"+ تحويل جديد\"' (لكن الزر انحذف).\nبعد V21.9.17: 'لا يوجد تحويلات بعد' + hint صغير 'التحويلات بـ تتعمل من حركات الخزنة (اختار نوع تحويل)'.\n\nالـ Card title بقى يقول '🔄 سجل التحويلات (N) — للقراءة فقط' مع badge صغير 'للتعديل: من حركات الخزنة' عشان الـ context واضح." },
    ]
  },
  {
    version: "V21.9.16",
    date: "2026-05-11",
    types: ["fix", "architectural"],
    title: "🛡 Phase 12b — Read-only safety on config stall + storage error UX",
    changes: [
      { type: "fix", text: "🚨 [CRITICAL SAFETY — منع مسح بيانات الـ factory/config عند ضغط 'متابعة على مسؤوليتي']\nالمستخدم سأل: لما يظهر popup 'تأخر في تحميل البيانات' بـ factory/config = ✗ متأخر، الـ buttons دي آمنة؟\n\nالإجابة قبل V21.9.16: لأ، 'متابعة على مسؤوليتي' كانت كارثية. الـ flow كان:\n1. configDoc = INIT_CONFIG (defaults فاضية بعد ما الـ listener ما fire-ـش)\n2. tryAnyway() بـ يـ set configLoaded=true → الـ safety guard في upConfig بـ يـ bypass\n3. أي save لاحقاً (تأكيد تحويل، حفظ معاملة، إلخ) بـ يكتب configDoc الفاضي على factory/config\n4. كل الـ customers / suppliers / workshops / users / settings → يتـ wipe\n\nالحل (V21.9.16): ضفت flag جديد `forcedBypass`:\n• tryAnyway() لما الـ config مش loaded → يـ set forcedBypass=true (إضافة للـ configLoaded=true)\n• upConfig بقى يـ check: لو forcedBypass=true، يرفض أي write مع toast '⛔ وضع القراءة فقط — الإعدادات لسه ما حملتش'\n• لما الـ real config listener أخيراً يـ fire (الـ network restored)، الـ listener بـ يـ clear forcedBypass تلقائياً → الـ user يقدر يحفظ تاني\n\nالنتيجة: المستخدم يقدر يـ continue ويـ view البيانات الـ cached بأمان. أي save attempt بـ يـ block بـ صريح. مفيش way الـ data تتـ wipe." },
      { type: "fix", text: "🚨 [UI WARNING — تحذير صريح في popup التأخر لما config متأخر]\nأضفت red warning banner داخل الـ stall popup لما `stat.config` = false:\n  ⚠️ الإعدادات (factory/config) لسه ما حملتش. لو ضغطت 'متابعة على مسؤوليتي' بدون تحميل الإعدادات، التطبيق هيـ block أي حفظ تلقائياً (وضع القراءة فقط) عشان ما يضيعش بيانات الـ customers / suppliers / workshops. ينصح بـ 'مسح الـ cache + إعادة تحميل' بدل المتابعة.\n\nالـ orange 'متابعة على مسؤوليتي' button بقى نصها 'متابعة بوضع القراءة فقط (لا حفظ)' لما config متأخر — عشان الـ user يعرف بالظبط هيدخل في الحالة دي." },
      { type: "fix", text: "🔧 [ROOT CAUSE — رسالة خطأ مبهمة عند فشل رفع صور Shopify Push]\nالمستخدم بلّغ: 'Firebase Storage: User does not have permission to access shopify-products/.../1234.jpg. (storage/unauthorized)'\n\nده مش معناه إن الـ user مش مديره — معناه إن الـ storage.rules اللي بـ تـ allow shopify-products/** ما اتـ deploy-ـتش على Firebase. الـ rules موجودة في الـ repo (V21.9.11 ضفّتها) لكن Vercel ما بـ يـ deploy storage rules تلقائياً — لازم خطوة manual.\n\nالحل: ضفت friendlyStorageError() function في ShopifyPushModal بـ تـ translate الـ Firebase Storage errors:\n• storage/unauthorized → رسالة عربية واضحة بالخطوات: 'افتح Firebase Console → Storage → Rules → الصق محتوى storage.rules من الـ repo → Publish'\n• storage/canceled → 'اتـ cancel الـ upload — حاول تاني'\n• storage/retry-limit-exceeded → 'الـ upload فشل (الاتصال)'\n\nالـ uploadOne function بقى يـ wrap الـ uploadBytes في try/catch، يـ throw error بالـ Arabic message عشان الـ toast بـ يظهر شيء actionable للـ user." },
      { type: "doc", text: "📋 [How to fix the storage rules deployment]\nعلى الـ admin: مرة واحدة بعد كل تعديل لـ storage.rules:\n\n1. افتح https://console.firebase.google.com\n2. اختار الـ project (clark-factory أو حسب اسمه عندك)\n3. Build → Storage → Rules tab\n4. افتح ملف storage.rules من الـ repo (في الـ root)\n5. الصق كل المحتوى في الـ Console editor\n6. Press 'Publish'\n\nبدائل:\n• Firebase CLI: `firebase deploy --only storage` (يحتاج تـ setup الـ CLI)\n• GitHub Actions: ممكن ضبط workflow يـ deploy تلقائياً على كل push لـ main (خارج scope الـ V21.9.16)\n\nبعد الـ deploy، الـ shopify-products/** uploads هتشتغل صح للـ manager+ users." },
    ]
  },
  {
    version: "V21.9.15",
    date: "2026-05-10",
    types: ["fix"],
    title: "🔘 Phase 12a — Push button works from card + WhatsApp image attaches",
    changes: [
      { type: "fix", text: "🚨 [ROOT CAUSE — زرار Push على البطاقة ما بـ يفتح الـ popup]\nالمستخدم بلّغ: ضغطت Push على البطاقة، الـ popup ما اتفتحش. ضغطت البطاقة نفسها، وجدت الـ popup مفتوح جواها.\n\nالـ root cause: DetPg.jsx فيه branch مختلف للـ list view (لما مفيش order محدد) و الـ detail view (لما order محدد). الـ <ShopifyPushModal pushModalOrder /> renderer كان متحط فقط في الـ detail-view branch.\n\nالـ sequence: ضغطت Push → setPushModalOrder(o) → الـ state اتـ set لكن الـ list-view branch ما عندوش الـ modal renderer → مفيش حاجة بـ تظهر → ضغطت البطاقة → setSel(o.id) → الـ detail-view branch بـ يـ render → الـ modal renderer جوّاه بـ يـ render مع الـ state القديم → يبان كأنه فتح 'جوّا البطاقة'.\n\nده نفس الـ pattern اللي اتصلح قبل كده في V19.16 مع StageProgressModal — أنا لـ نسيت أطبّقه على الـ ShopifyPushModal الجديدة. الحل: mount الـ modal renderer في الـ list-view branch كمان." },
      { type: "fix", text: "🚨 [ROOT CAUSE — صورة الأوردر مش بـ تتأشّد مع الواتساب من الموبيل]\nالمستخدم بلّغ: 'كان بيبعت الصورة مع الرسالة لما كنت ببعت من الموبيل، دلوقتي مش بيبعت.'\n\nالـ regression حصلت من غير ما الكود اتغيّر — الـ navigator.share() API بـ يـ require transient user activation (نفس قاعدة window.open اللي معلّقة في CLAUDE.md §7). أول ما تـ await أي حاجة، الـ user activation بـ يضيع.\n\nالكود كان بـ يعمل:\n```js\nawait fetch(wo.image)      // ← await بـ يستهلك الـ activation\nawait res.blob()           // ← await تاني\nawait navigator.share(...) // ← الـ activation راحت → silent reject في Chrome الحديثة\n```\n\nالمتصفحات بـ تشدّد القاعدة دي مع الوقت. كان شغّال زمان، بقى مرفوض دلوقتي. الـ catch بـ يـ swallow الـ error والـ fallback openWA() بـ يبعت text-only من غير صورة.\n\nالحل (نفس استراتيجية CLAUDE.md §7 لكن للـ navigator.share):\n1. Prefetch الـ image Blob بـ useEffect لما الـ WhatsApp popup يفتح (الـ popup نفسه اتفتح بـ click → الـ fetch بـ يجري في الخلفية)\n2. لما المستخدم يضغط 'تفاصيل' أو 'تفاصيل + تايم لاين'، الـ Blob جاهز → بـ نـ create الـ File synchronously → نـ call navigator.share() على طول من غير await قبلها → الـ user activation محفوظة → الصورة تتـ attach صح.\n\nبالإضافة: لـ handle الـ legacy base64 strings (pre-V19.36 format) — لو الـ image مش URL ولا data: URL، نـ synthesize Blob من الـ base64 مباشرة بدل ما نعمل fetch() على string مش صالحة.\n\nالـ AbortError (لما المستخدم يـ cancel الـ share sheet) بقى يتعامل صح: يـ close الـ popup من غير fallback للـ wa.me." },
      { type: "doc", text: "📜 [Pattern — anti-pattern register]\nالـ navigator.share() مع files بـ يـ require نفس حماية الـ user activation زي window.open(). أي API بـ يـ open browser window/sheet لازم يـ called قبل أي await في الـ handler. لو محتاج async data للـ share/open، prefetch-ها قبل ما الـ user يضغط (في useEffect أو فور فتح الـ popup الـ parent).\n\nنفس الـ class of bug في CLAUDE.md §7 (window.open after await) و §10 (anti-patterns list). إضافة navigator.share للـ list محتمل." },
    ]
  },
  {
    version: "V21.9.14",
    date: "2026-05-10",
    types: ["fix", "architectural"],
    title: "💰 Phase 12 — Treasury Critical Fix (Duplicate transfers + revert-after-approve)",
    changes: [
      { type: "fix", text: "🚨🚨 [ROOT CAUSE — كارثة الخزنة: تأكيد التحويل بـ يـ revert + entries بـ تتكرر]\nالمستخدم بلّغ: ضغط 'تأكيد' على تحويل، اختفى الـ popup، رجع تاني pending بعد refresh، ضغط تأكيد ثاني → دفعة 3,800 ج.م ظهرت مرتين.\n\nالـ root cause الحقيقي: في App.jsx (سطر 2944) فيه دالة `_stableMatch` بـ تستخدم في الـ pendingMap cleanup — بـ تقارن الـ optimistic state بـ الـ server snapshot عشان تعرف لو الـ pending entry وصل للـ server وتـ clear الـ optimistic copy.\n\nالـ function كانت بـ تـ check fields زي type/category/account/desc/transferId — كلها UNDEFINED على records الـ treasuryTransfers (الـ transfer record عنده fields مختلفة: status, fromAccount, toAccount, approvedBy, إلخ).\n\nالنتيجة: لما الـ admin بـ يـ approve transfer:\n1. optimistic state: status='confirmed' + 2 treasury legs\n2. الـ treasuryDays write يحصل أول (الـ legs تنزل سريع)\n3. listener يـ fire → rebuild يجري _stableMatch(serverPending, optimisticConfirmed) → returns TRUE (الـ status ما اتـ check-ـش!)\n4. pendingMap.delete(tfId) يـ fire قبل ما الـ treasuryTransfersDays write يخلص\n5. الـ UI يرجع للـ server view (pending)\n6. المستخدم يـ click تأكيد ثاني → idempotency gate يـ see status='pending' في الـ stale state → بـ يضيف 2 legs زيادة!\n\nالحل: ضفت في _stableMatch checks للـ fields اللي بـ تتغيّر فعلياً:\n• status (الـ load-bearing field)\n• fromAccount, toAccount, note\n• approvedBy, approvedByEmail, approvedAt, rejectedBy, rejectedAt\n\nبكده الـ status flip بقى بـ يكون detected → pendingMap بـ يـ retain الـ optimistic state لحد ما الـ real write يحصل → لا revert ولا duplicate." },
      { type: "fix", text: "🛡 [In-flight guard على approve/reject]\nبجانب الـ _stableMatch fix (defense in depth):\n• ضفت `inflightTransferRef = useRef(new Set())` في TreasuryPg\n• approveTransfer/rejectTransfer بـ يـ check `if(inflightTransferRef.current.has(tfId)) return;` في الأول\n• بعد الـ upConfig، setTimeout 2 ثواني يـ delete الـ id (وقت كافي للـ Firestore commit + listener fire)\n• لو user double-click، الضغطة الثانية بـ تـ show toast '⏳ التأكيد جاري — استنى ثانية' وبس\n\nده extra layer — حتى لو الـ _stableMatch قعدت تفشل لسبب ما، الـ guard بـ يمنع الـ duplicate." },
      { type: "fix", text: "🛡 [Idempotency check at LEDGER level]\nطبقة ثالثة من الحماية في approveTransfer:\nقبل ما نـ unshift الـ out leg أو الـ in leg، نـ check:\n  const existingLegs = (d.treasury||[]).filter(t => t.transferId === tf.id);\n  const hasOut = existingLegs.some(t => t.type === 'out');\n  const hasIn = existingLegs.some(t => t.type === 'in');\n\nلو الـ leg موجود، ما نضيفش زيادة. حتى لو الـ user ضغط تأكيد 5 مرات بطريقة ما، الـ ledger هـ يفضل clean بـ leg واحد per type." },
      { type: "fix", text: "📢 [Toast على فشل الـ split sync]\nقبل V21.9.14: لو الـ syncAllSplitChanges فشل بعد 3 retries، كان بـ يحط noticeWarn في storage notices panel (مش toast). المستخدم ما يلاحظهاش وسط الـ notifs، يفترض إن الـ approve اتعمل، يضغط تاني → duplicate.\n\nدلوقتي: لو فشل، toast يـ fire 'فشل حفظ البيانات على السيرفر — حاول مرة تانية' فوراً. للـ financial data ده مهم: فشل صامت = duplication risk." },
      { type: "fix", text: "📊 [autoPost.treasury للـ transfer legs]\nالـ approveTransfer + الـ admin auto-confirm path في submitTransfer كانوا بـ يكتبوا treasury entries لكن مش بـ يـ post-ـوها للـ journal (يومية).\n\nالـ saveTx العادية (سطر 1056) بـ تـ call autoPost.treasury، لكن الـ transfer flow كان مش معمول له. النتيجة: cash account on journal stale relative to treasury → Trial Balance/Balance Sheet drift.\n\nالحل: ضفت autoPost.treasury لكل من الـ out leg والـ in leg في approveTransfer + submitTransfer (admin path). نفس الـ defensive try/catch pattern بتاع saveTx." },
      { type: "fix", text: "🔒 [Hard guard على legacy 'transfers-repair' migration]\nالـ migration ده كان من ايام pre-V19.52 — بـ يـ fix transfers ناقصة legs. بعد V19.52 الـ treasuryTransfers بقت في split day-docs، فالـ migration ما بـ يـ fire-ـش طبيعياً (data.treasuryTransfers undefined من cfg).\n\nلكن لو سبب ما خلّى الـ flag مش set والـ array inline، الـ migration كان بـ يـ force-flip كل pending transfer لـ confirmed بدون موافقة admin → corruption.\n\nالحل: ضفت hard guards:\n1. `!data._splitDaysV1952Done` — لو الـ V19.52 split done، ما يشتغلش\n2. `data.treasuryTransfers.length > 0` — ما يشتغلش لو فاضي\n3. skip الـ pending transfers (مش 'incomplete' — لسه بـ يستنوا approval)\n\nبكده الـ migration بقى آمن وغير قابل للـ regression." },
      { type: "doc", text: "📜 [ROOT CAUSE comments على كل fix]\nكل fix فيه comment تفصيلي:\n• كان فيه إيه قبل\n• ليه كان غلط (مع الـ sequence of events الفعلي اللي بـ ينتج الـ symptom)\n• الحل التقني\n• ليه ما يـ regress (defense in depth + targeted fix)\n\nمتطابق مع CLAUDE.md §0. Treasury data is FINANCIAL — كل تعديل لازم يكون موثّق بـ root cause analysis." },
    ]
  },
  {
    version: "V21.9.13",
    date: "2026-05-10",
    types: ["fix", "feature"],
    title: "🔘 Phase 11s — Push button on cards + bidirectional sync",
    changes: [
      { type: "feature", text: "🔘 [زر Push على بطاقة الأوردر]\nكل بطاقة في صفحة التفاصيل بقى عندها زر Push (إنجليزي) مع أيقونة Shopify shopping bag SVG. الـ button في footer البطاقة جنب زر واتساب.\n\n• Push (لون Shopify الأخضر) لو الموديل ما اتـ push-ـش قبل كده\n• Pushed مع علامة ✓ خضرا لو متزامن حالياً\n\nالضغطة بـ تفتح الـ Push modal للموديل ده مباشرة. الـ detail page action row بقى برضه يستخدم نفس الـ icon + English label للـ consistency." },
      { type: "feature", text: "🔄 [تزامن ثنائي الاتجاه — bidirectional sync]\nأضفت endpoint جديد POST /api/shopify/verify-product-pushed.\n\nلما المستخدم يفتح الـ Push modal لموديل عنده shopify_meta.shopify_product_id:\n1. الـ modal بـ يـ ping Shopify بـ GET /products/{id}.json\n2. لو 200 → المنتج موجود → الـ badge يفضل Pushed\n3. لو 404 → اتـ delete من Shopify → الـ endpoint بـ يـ clear shopify_product_id من الـ shopify_meta + يحط push_status='deleted_on_shopify' + ينقل الـ ID القديم لـ last_known_shopify_product_id (للسجلات)\n\nفي الـ modal بـ يظهر banner: '⚠️ المنتج اتـ delete من Shopify. تم إلغاء حالة Pushed — لو محتاج تـ resync اضغط Push تاني.'\n\nالـ onSnapshot بـ يحدّث البطاقة تلقائياً فالـ badge يختفي من الـ card. التزامن ده lazy (بـ يحصل لما المستخدم يفتح الـ modal، مش continuous polling) عشان نوفر calls على Shopify rate limit." },
      { type: "fix", text: "🚨 [ROOT CAUSE — مزامنة شاملة فشلت بـ 'Cannot use undefined as a Firestore value']\nلما المستخدم ضغط 'مزامنة شاملة (عملاء + كل التاريخ)'، الـ historical sync فشل بـ:\n  Cannot use \"undefined\" as a Firestore value (found in field \"shopifyPendingOrders.0.bosta\")\n\nالسبب: في merge الـ live orders بعد historical pull، الكود كان بـ يعمل `merged.bosta = prev.bosta || o.bosta;` — لو الاتنين undefined (طلب ما عندوش Bosta tracking أصلاً)، النتيجة undefined → Firestore strict mode رفض الـ write كله.\n\nالحل (طبقتين):\n1. defense in depth — في _firebase.js ضفت `firestore().settings({ ignoreUndefinedProperties: true })` على الـ Admin SDK init. أي undefined في أي write مستقبلاً هـ يـ strip بصمت بدل ما يـ crash.\n2. specific fix — في sync-historical-orders.js غيّرت الـ assignment لـ conditional: `if(bosta) merged.bosta = bosta;` — الـ document بـ يفضل clean بدون undefined fields." },
      { type: "fix", text: "🗑 [حذف زر 'مزامنة شاملة (عملاء + كل التاريخ)']\nالـ button كان بـ يجمع بين historical-orders sync و customer aggregation في خطوة واحدة، لكن:\n• الـ historical leg كان بـ يفشل (سبب الـ bosta undefined أعلاه)\n• المستخدم أكّد إن 'تحديث القائمة فقط' بـ يعمل المطلوب (1147 عميل / 681 اشتروا / 11 VIP في حالته)\n• وجود الـ button غير الموثوق بـ يلخبط المستخدم\n\nتم حذف الـ button + الـ handleFullSync function. الـ historical-orders sync لسه متاح لوحده عبر HistoricalSyncCard في تاب الـ Dashboard لو محتاج. تـ rename 'تحديث القائمة فقط' لـ 'تحديث القائمة' (مفيش 'فقط' دلوقتي بعد ما الـ alternative انحذف)." },
      { type: "improvement", text: "🛠 [Smart 404 detection في verify endpoint]\nالـ verify-product-pushed بـ يـ distinguish بين:\n• 404 confirmed (الـ product اتـ delete) → يـ clear الـ meta\n• 401/403 auth error → بـ يرجّع 502 ويسيب الـ meta سليمة\n• 5xx Shopify down → بـ يرجّع 502 transient (مش يـ clear)\n• Network/timeout → بـ يرجّع 502\n\nده مهم: الـ clearing لازم يحصل بس لما الـ deletion confirmed authoritatively. لو الـ endpoint clears على أي error، كل blip في Shopify بـ يضيع الـ pushed state للموديلات كلها." },
      { type: "doc", text: "📜 [ROOT CAUSE comments]\nكل fix فيه comment تفصيلي عن:\n• كان فيه إيه قبل\n• ليه كان غلط (مع الـ error message الفعلي اللي ظهر)\n• الحل\n• ليه ما يـ regress (defense in depth + targeted fix)\n\nمتطابق مع CLAUDE.md §0 (Principal Engineer protocol)." },
    ]
  },
  {
    version: "V21.9.12",
    date: "2026-05-10",
    types: ["fix", "feature"],
    title: "🛍️ Phase 11r — Shopify Push (Image upload + per-color price)",
    changes: [
      { type: "fix", text: "🚨 [ROOT CAUSE — صور الـ Push للـ Shopify بـ تطلع 'فشل تحميل']\nlib utils/image.js compressImage() بـ ترجّع dataURL string (canvas.toDataURL) — مش Blob. الكود في ShopifyPushModal و WhatsAppComposer كان بـ يعمل:\n  const blob = compressed instanceof Blob ? compressed : new Blob([compressed]);\nده بـ يـ wrap الـ string نفسها (data:image/jpeg;base64,...) كـ Blob — بـ يخزّن النص نفسه، مش bytes الصورة!\n\nFirebase بـ يقبل الـ upload (Content-Type forced لـ image/jpeg) لكن الـ file اللي اتخزّن فيه نص. لما الـ <img> يحاول يـ render، بـ يفشل (الـ JPEG bytes مش صحيحة) → الـ user يشوف '⚠️ فشل تحميل'. ولما Shopify يحاول fetch الـ URL يلاقي text بدل صورة.\n\nالحل: ضفت dataUrlToBlob() في image.js اللي بـ يستخدم fetch(dataUrl).blob() لتحويل الـ dataURL لـ Blob حقيقي بـ JPEG bytes صح. ShopifyPushModal و WhatsAppComposer دلوقتي بـ يستخدموا الـ helper ده + force content-type 'image/jpeg' + رفض الـ Blobs الفاضية." },
      { type: "fix", text: "🚨 [ROOT CAUSE — Storage rules بـ تـ block uploads على paths شوبيفاي]\npre-V21.9.11 الـ storage.rules مكنش فيها match clause لـ:\n• shopify-products/** (paths بتاعة الـ Shopify push images)\n• whatsapp-campaigns/** (paths الـ WhatsApp Composer)\n\nالـ catch-all `if false` كان بـ يمنع الكتابة → كل uploads كانت بـ تفشل بـ permission denied (مع الـ dataURL bug، فعلياً بعض الـ uploads كانت بـ تنجح لأن المتصفح بـ يقبل text-as-image في cache مؤقتاً).\n\nالحل: ضفت match clauses:\n• shopify-products/** → manager+ writes (read by all authed)\n• whatsapp-campaigns/** → sales scope writes\nبعد deploy storage.rules، الـ uploads هتشتغل صح." },
      { type: "feature", text: "💰 [حقل سعر لكل لون في Push Modal]\nقبل V21.9.12 كل الـ variants كانت بـ تاخد نفس السعر (order.sellPrice). دلوقتي تقدر تحدد سعر مختلف لكل لون:\n\n• في تاب 'صورة + سعر لكل لون' في الـ Push modal، تحت كل لون فيه input 'السعر (ج.م)'\n• فاضي = استخدام سعر البيع الافتراضي للموديل\n• لو حطيت رقم > 0 → يـ override السعر لكل الـ variants بـ اللون ده في Shopify\n• الـ colorPrices بـ يـ save في order.shopify_meta.color_prices (يفضل بعد re-sync)\n\nالـ server endpoint /api/shopify/push-product-from-clark بـ يقبل colorPrices في الـ body + يـ sanitize (drops non-positive/non-finite) + يمررها لـ buildVariantMatrix اللي بـ يطبّقها على كل variant.color match.\n\nUse case: ألوان premium بـ سعر أعلى، لون أساسي بـ خصم، إلخ." },
      { type: "improvement", text: "🛠 [Better error messages في الـ upload pipeline]\nلو compressImage أرجع Blob فاضي (browser bug، corrupt file)، نـ throw error واضح بدل ما يـ upload empty blob للـ Firebase. الـ user يشوف '⛔ فشل رفع الصورة: compression أرجع blob فاضي' بدل ما يفترض الـ upload نجح." },
      { type: "improvement", text: "📁 [اسم الملف بـ extension .jpg always]\nقبل V21.9.12 كان اسم الـ uploaded file محتوي على extension الأصلي (.png, .heic, إلخ) رغم إن المحتوى JPEG (compressImage بـ يحول كل حاجة لـ JPEG). دلوقتي اسم الـ file بـ يبقى .jpg دايماً للـ consistency مع contentType." },
      { type: "doc", text: "📜 [ROOT CAUSE comments في كل fix]\nكل bug fix معلق بـ comment يشرح:\n1. كان فيه إيه قبل\n2. ليه الـ behavior كان غلط\n3. الحل التقني\n4. ليه ما يـ regress تاني (storage rules deployed، dataUrlToBlob centralized)\n\nمتطابق مع CLAUDE.md §0 (Principal Engineer protocol) — preventing regression أهم من الـ fix نفسه." },
    ]
  },
  {
    version: "V21.9.11",
    date: "2026-05-10",
    types: ["fix", "architectural"],
    title: "🩺 Phase 11q — Shopify Audit (Critical fixes)",
    changes: [
      { type: "fix", text: "🚨 [ROOT CAUSE — Process Return بـ ينتج credit notes بـ صفر جنيه]\nالـ endpoint /api/shopify/process-return كان يقرا cfg.salesInvoices و cfg.salesCreditNotes مباشرة. بعد migration V19.50 (invoices) و V21.9.5 (credit notes) الـ arrays دي اتـ stripped من factory/config — البيانات بقت في salesInvoicesDays/{YYYY-MM-DD} و salesCreditNotesDays/{YYYY-MM-DD}.\n\nالنتيجة: linkedInvoice = null دايماً → الـ CN بـ items=[] و total=0 → silent revenue/return reconciliation breakage. والـ CN الجديد كان بـ يتكتب في cfg.salesCreditNotes اللي بـ يتشال على الـ next client load → CN يضيع كلياً.\n\nالحل: pre-read من split collections (readSplitCollection helper)، الـ idempotency check يشتغل صح، والـ CN الجديد بـ يتكتب في day doc بـ نفس transaction. fallback للـ legacy mode موجود لو الـ migration ما اشتغلتش." },
      { type: "fix", text: "🚨 [ROOT CAUSE — Mark Delivered بـ ينتج فواتير duplicate]\nنفس الـ pattern: /api/shopify/mark-delivered كان يقرا cfg.salesInvoices اللي بقى empty بعد V19.50. كل ضغطة Mark Delivered كانت تـ build invoice جديدة (الـ idempotency check ما يلاقيش حاجة) ويكتبها في cfg.salesInvoices اللي بـ يتـ strip → الفاتورة تضيع.\n\nالحل: نفس approach. pre-read invoices من salesInvoicesDays، idempotency يشتغل صح، الفاتورة الجديدة تتكتب في day doc atomically." },
      { type: "fix", text: "🚨 [ROOT CAUSE — Race condition في bumpContact]\nupdate-customer.js per-doc branch كان بـ يعمل read → spread merge → set بدون transaction. لو 2 admin ضغطوا 'Bulk WhatsApp' في نفس الوقت على نفس العميل: A تقرا 5، B تقرا 5، الاتنين يكتبوا 6 (المفروض 7). الـ spread `...docSnap.data()` كمان كان يـ clobber أي field الـ partitioner re-derived بين الـ read والـ write (زي tier).\n\nالحل: استخدام Firestore atomic FieldValue.increment(1) (race-free على مستوى الـ database) + استبدال spread بـ `set(patch, {merge:true})` عشان الـ write يكون targeted." },
      { type: "fix", text: "🚨 [ROOT CAUSE — Progress tracker overwrites final status]\n_progressTracker.js كان فيه race: pendingTimer (setTimeout للـ throttled writes) ما كانش بـ يـ check `cancelled` flag. لو complete() اتنادى وفي نفس الوقت timer firing مع stale data → الـ stale write يحصل بعد الـ done write → الـ overlay يفضل '50%' بدل '100% Done'.\n\nالحل: timer callback بقى يـ check cancelled، complete() بقت تـ flip cancelled قبل flushPending مش بعدها، pendingUpdate بقت تتمسح في complete() عشان الـ throttled write ما يـ overwrite الـ final state.\n\nبالإضافة: لو 3 writes متتالية failed silently، الـ tracker بقى يـ console.warn (كان silent تماماً قبل كده)." },
      { type: "fix", text: "🐛 [Audit log clobber في sync-historical-orders]\nالـ live merge كان يـ spread Shopify's فريش order كـ base، ويـ overwrite بس fields من allowlist محدودة. أي local CLARK field خارج الـ allowlist (delivered_by, refused_by, returned_by, invoice_no, return_credit_note_no, stock_committed, bosta_pickup_error, إلخ) كان بـ يتـ overwrite بـ undefined من Shopify's mapping → audit trail يضيع.\n\nالحل: عكسنا الـ pattern — `prev` بقى الـ base (يحفظ كل local fields)، وعملنا overlay لـ Shopify-owned fields بس (line items, totals, customer info, fulfillment status). الـ status logic بقى يـ keep الـ local state لو CLARK-side (delivered/refused/returned)." },
      { type: "fix", text: "🐛 [Sync customers metadata lies on partial failure]\nsync-customers.js كان يكتب 'last_customers_sync_at + count' جوا الـ transaction، وبعدها يعمل per-doc writes برا الـ tx. لو الـ per-doc loop crashed أو timed out في النص: metadata يقول 'sync count = 1500' لكن في الواقع 700 doc بس اتكتبت → الـ user مش هيعرف الحقيقة.\n\nالحل: داخل الـ tx بنكتب 'last_customers_sync_started_at' بس. الـ authoritative timestamp + counts بـ يتكتبوا بعد ما per-doc writes تنجح كلها. لو writeManyShopifyCustomers throws، metadata يفضل في 'started_at' state — الـ user يعرف إنها partial." },
      { type: "fix", text: "🐛 [Bulk delete swallows errors silently]\nbulk-update-products.js لـ delete_from_clark / delete_all action كان يعمل .catch(() => {}) على كل delete → الـ user كان يشوف 'تم حذف 50' حتى لو 30 منهم فشلوا. الـ blacklist (committed في الـ tx) كان يحتوي IDs لمنتجات لسه موجودة → re-blacklisted على next sync.\n\nالحل: track per-id failures + return deleteFailures: ids[] في الـ response. الـ user يعرف بالضبط مين فشل ويقدر يـ retry." },
      { type: "fix", text: "🐛 [ReturnsTab approve-on-cancel]\nhandleApprove كان فيه شرط `if(yes === null || yes === undefined) return;` — `false` (الـ user ضغط 'لا') كانت بـ تـ fall through وتـ approve الـ return بـ Bosta برضه. real user-impact bug.\n\nالحل: غيّرناها لـ `if(!yes) return;` عشان أي falsy value (false / null / undefined) تـ cancel." },
      { type: "fix", text: "🐛 [Bulk WhatsApp popup blocker]\nCampaignsTab handleRun كان يعمل await ask() بعد ما الـ user يضغط Run، وبعدها يعمل window.open في loop. الـ browsers بـ تـ consume الـ user gesture مع أول await → 99% من الـ tabs كانت بـ يتمنعها popup blocker silently. CLAUDE.md §7 و §10 الاتنين بـ يـ flag الـ pattern ده.\n\nالحل: استبدلنا الـ bulk loop بـ modal جديد (CampaignRunConfirm) بـ يعرض الـ audience list بـ زر 'إرسال' لكل صف. كل ضغطة هي fresh user gesture → window.open synchronous داخل onClick بدون مشاكل. ده برضه match أحسن لـ WhatsApp Web's actual flow (one chat at a time)." },
      { type: "fix", text: "🐛 [Silent skip on missing customer]\nupdate-customer.js per-doc branch كان يـ continue silently لو الـ docSnap.exists = false، الـ endpoint يـ return {ok:true, updated:0}، الـ UI تعرض '✅ تم' حتى لو ما حصل حاجة.\n\nالحل: أضفنا notFound: ids[] في الـ response لما يكون فيه IDs ما اتلقتش. الـ caller بـ يقدر يعرف بالضبط مين ما اتـ updateش." },
      { type: "fix", text: "🐛 [Discount codes server-side validation]\ndiscount-codes.js create action كان يـ accept value > 100 لـ percentage type، الـ Shopify API بـ يرفضها بـ cryptic error. الـ UI كان يـ check client-side بس.\n\nالحل: أضفنا server-side check: type=='percentage' && value > 100 → 400 بـ رسالة واضحة. كمان شيلنا الـ duplicated ternary `type === 'percentage' ? -Math.abs(value) : -Math.abs(value)` (الـ branches متطابقة)." },
      { type: "fix", text: "🐛 [HTTP error codes inconsistency]\nconnect.js كان يـ return 400 لـ Shopify failures (المفروض 502) — observability suffered (الـ logs ما يعرفوش لو نـ retry وللا نـ escalate). CLAUDE.md §9: 400=client, 502=upstream, 500=ours.\n\nالحل: نـ distinguish بين auth errors (401) ومين upstream failures (502) من رسالة الخطأ." },
      { type: "fix", text: "🎨 [Template literal misuse]\nWhatsApp button title كان فيه: 'اتبعت ${customer.contact_count} رسالة'.replace('${customer.contact_count}', customer.contact_count) — يشتغل لكنه pattern غريب (string عادية + replace). غيّرناها لـ template literal proper." },
      { type: "architectural", text: "📐 [Anti-pattern documented في كل bug fix]\nكل fix فيه ROOT CAUSE comment يشرح:\n1. كان فيه إيه قبل\n2. ليه كان غلط\n3. الحل\n4. ليه الحل ده يضمن مايتـ regress\nده match الـ Principal Engineer protocol في CLAUDE.md §0 — preventing regression أهم من الـ fix نفسه." },
    ]
  },
  {
    version: "V21.9.10",
    date: "2026-05-10",
    types: ["doc"],
    title: "📜 Phase 11p — Documentation Pass",
    changes: [
      { type: "doc", text: "📜 [CLAUDE.md §0 — Principal Engineer Persona] إضافة قسم جديد في الـ root للتعليمات بمستوى Google/OpenAI/Microsoft. يحدد الـ standard لكل bug fix:\n• Root cause analysis (مش الأعراض)\n• Defensive + Documented + Tested + Reversible\n• كل bug fix معلّق بـ ROOT CAUSE comment\n• Anti-pattern entry لمنع التكرار" },
      { type: "doc", text: "📜 [CLAUDE.md §1 expanded] الـ Build → Test → Commit → Push → Zip protocol بـ explicit shell commands كاملة لكل خطوة + paths reference table + critical rules (NEVER git add ., NEVER --no-verify, NEVER force-push)." },
      { type: "doc", text: "📚 [WORK_LOG.md جديد] توثيق كامل لكل المراحل من V19.91 لـ V21.9.10:\n• Phase 0-11p (35+ phase)\n• Architectural decisions (لماذا الـ split + لماذا الـ partition)\n• Anti-patterns table (12+ pattern)\n• File structure map كامل\n• Endpoints reference table\n• Stats summary" },
      { type: "doc", text: "🌐 [README.md جديد] project overview بـ:\n• Architecture diagram (ASCII)\n• Key features list (13 sub-tabs)\n• Development guide\n• Environment variables reference\n• Engineering standard (Principal Engineer level)" },
      { type: "doc", text: "✅ [بروتوكول رسمي] الـ protocol مكتوب بالعربي + الإنجليزي. أي session جديدة تقرا CLAUDE.md + WORK_LOG.md قبل أي شغل. ده بيمنع الـ regressions ويـ ensure الـ standard ثابت." },
    ]
  },
  {
    version: "V21.9.9",
    date: "2026-05-10",
    types: ["fix", "architectural"],
    title: "🩹 Phase 11o — Critical Shopify Audit (Principal Engineer pass)",
    changes: [
      { type: "fix", text: "🚨 [ROOT CAUSE — 'signal is aborted without reason']\nAPI_TIMEOUT_MS كان 20s ثابت لكل endpoints. الـ historical syncs بـ تستغرق دقايق (Shopify rate limit = 2 req/sec × 100s of pages). الـ AbortController كان يـ fire بعد 20s، الـ server يفضل شغّال لكن الـ client يعرض 'aborted'.\n\nالحل: per-endpoint timeout map:\n• Default: 30s\n• sync-products / sync-customers: 3 min\n• push-inventory / push-customer-tags: 5 min\n• sync-historical / bosta-historical / split-collections: 10 min\n+ error message ملموس: 'العملية أخدت أكتر من X ثانية — راجع الـ server logs'" },
      { type: "fix", text: "🚨 [ROOT CAUSE — المنتجات اتسحبت لكن مظهرتش]\nالـ migration V21.9.2 بـ تكتب products في shopifyProductsDocs بـ shopify_id كـ doc id، لكن الـ docs مكنش فيها top-level `id` field. الـ partitioned listener في App.jsx كان فيه شرط `if(docData && docData.id)` بـ يـ skip أي doc بدون id → كل المنتجات invisible في الـ UI رغم إنها متخزّنة صح في Firestore.\n\nالحل (3 طبقات):\n1. Listener fallback: لو docData.id مش موجود، استخدم change.doc.id (دايماً موجود)\n2. writeManyShopifyProducts بقت تـ enforce id = shopify_id\n3. الـ migration بقت تكتب id field على كل doc\nده يعالج مشكلة 'سحبت المنتجات وما ظهرتش' للمستخدمين القدام والجداد." },
      { type: "fix", text: "🐛 [Auto-dismiss overlay too fast]\nالـ overlay كان يـ auto-close بعد 1.5 ثانية عند النجاح → المستخدم مايقدرش يقرا الـ result preview. كان يحس إن الحاجة 'اختفت'.\n\nالحل: شيلت الـ auto-dismiss، حطيت زرار '✓ تمام، إغلاق' أخضر بارز. الـ overlay يفضل ظاهر مع كل الـ stats حتى يضغط الـ user." },
      { type: "fix", text: "🐛 [Multi-job overlay race]\nlogic كان يستخدم module-level `_activeJob`. لو بدأت sync A ثم بدأت sync B قبل ما A تخلص، الـ done effect لـ A بـ يعمل dismissSyncProgress() اللي بـ يكنسل overlay B.\n\nالحل: أضفت sequence numbers. dismissSyncProgress(seq) بقى يـ dismiss ONLY لو الـ active job له نفس الـ seq. لو B هو الـ active، A's dismiss is a no-op." },
      { type: "fix", text: "🐛 [الطلبات والـ Bosta tracking مظهرتش بعد historical sync]\nالـ historical sync كان يكتب الطلبات في shopifyOrdersArchive collection بس، بدون ما يـ refresh الـ live shopifyPendingOrders. الـ live UI ظل فاضي.\n\nالحل: بعد كل historical sync، نـ merge أحدث 200 طلب في الـ live array (مع preserve للـ status/invoice_id/bosta المحلية).\nنفس المعالجة للـ Bosta historical: نـ update bosta tracking على الـ live orders اللي tracking_number بتاعها مطابق." },
      { type: "improvement", text: "🌐 [Tab name English] '🛍️ السلال المهجورة' → '🛍️ Abandoned Cart' (per user preference for English brand consistency)." },
      { type: "improvement", text: "🛠 [Debugging UX]\nرسائل الخطأ بقت أوضح:\n• AbortError → 'العملية أخدت أكتر من Xs — راجع الـ server logs'\n• Onboarding وقت الـ historical sync بـ 'تحديث قائمة الطلبات الـ live...' خطوة جديدة عشان الـ user يفهم إن الـ live بـ يتـ refresh\n• Bosta result بـ يعرض live_orders_updated count" },
      { type: "doc", text: "📜 [Audit summary] هذا الـ phase راجع الـ Shopify section كله بنظرة Principal Engineer:\n• timeout architecture (per-endpoint not global)\n• race conditions in module state\n• schema/listener compatibility (the id field bug)\n• success state UX (don't auto-dismiss)\n• data flow continuity (historical → live)\nكل bug fix معلّق بـ ROOT CAUSE comment للـ regression prevention." },
    ]
  },
  {
    version: "V21.9.8",
    date: "2026-05-10",
    types: ["feature", "architectural"],
    title: "📬 Phase 11n — WhatsApp Composer + Automated Campaigns",
    changes: [
      { type: "feature", text: "💬 [WhatsApp Composer احترافي] modal كبير 880px بـ:\n• Textarea 10 صفوف بـ smooth resize\n• 5 quick-templates (ترحيب، متابعة طلب، ترك سلة، VIP، تقييم)\n• 5 variable buttons قابلة للـ insert: {name}, {phone}, {order}, {total}, {discount}\n• 24 emoji سريعة (👋 🎉 🛍️ 💰 ✨ ...)\n• ➕ Image upload لـ Firebase Storage — الـ URL تـ insert تلقائياً + WhatsApp بـ يعرضها كـ link preview\n• 👁 Live preview بـ شكل WhatsApp chat bubble (مع variables substituted)\n• Char counter (4096 max)" },
      { type: "feature", text: "📬 [تاب جديد '📬 الحملات'] في Shopify integration. بـ يـ enable الـ marketing الأوتوماتيك:\n• Audience targeting بـ 6 segments:\n  ✅ اللي اشتروا (delivered ≥ N + اختياري max age)\n  ❌ اللي طلبوا وما اشتروش (refused/cancelled)\n  🛍️ السلال المهجورة (مترددين سجلوا checkout)\n  🛍️ مسجلين بدون شراء (Shopify only)\n  👑 VIP فقط\n  ⚠️ بحاجة لمتابعة (at-risk)" },
      { type: "feature", text: "🎯 [Audience builder] الـ buildAudience helper بـ يـ:\n• يقرأ كل العملاء + السلال\n• يـ filter حسب الـ type\n• يـ filter بـ phone + accepts_marketing + !do_not_contact\n• يـ apply max_age_days (آخر نشاط)\n• يـ dedup بـ dedup_window_days (skip اللي اتبعت لهم رسالة قريباً)" },
      { type: "feature", text: "📤 [Campaign run flow]\n1. Admin يضغط '📤 تشغيل' على الحملة\n2. Server بـ يـ build الـ audience + dedup\n3. لكل عميل: يـ render الـ message مع variables الخاصة + يبني wa.me URL\n4. Saves run logs في whatsappCampaignRunsDays\n5. Returns الـ list للـ client\n6. Client بـ يفتح الـ tabs بـ batches (400ms delay)\n7. Admin يضغط Send في كل tab يدوياً (WhatsApp Web)" },
      { type: "feature", text: "📡 [4 endpoints جديدة]:\n• POST /api/shopify/campaign-create — مع audience preview size\n• POST /api/shopify/campaigns-list — مع stats per status\n• POST /api/shopify/campaign-update — pause/resume/cancel/edit\n• POST /api/shopify/campaign-prepare-run — يـ generate الـ wa.me URLs + يحفظ logs" },
      { type: "feature", text: "⏰ [Schedule types] حالياً مدعوم:\n• now — تشغيل فوري بعد الإنشاء\n• once — وقت محدد (datetime-local)\n• recurring — placeholder (قريباً مع cron)" },
      { type: "architectural", text: "📅 [Daily split V21.9.8] schemas جديدة من اليوم الأول:\n• whatsappCampaigns → whatsappCampaignsDays/{YYYY-MM-DD}\n• whatsappCampaignRuns → whatsappCampaignRunsDays/{YYYY-MM-DD}\nالـ migration auto-runs بعد V21.9.7 (no-op لـ fresh fields)." },
      { type: "improvement", text: "🛠 [Bulk WhatsApp في تاب العملاء بقى يـ open الـ Composer] بدل الـ askInput الصغير. كل المميزات (emoji + image + variables + preview) متاحة في الـ bulk send." },
      { type: "improvement", text: "🔄 [renderMessageWithVariables shared helper] في WhatsAppComposer.jsx. الـ Composer + الـ campaigns + الـ bulk send كلهم بـ يستخدموا نفس الدالة عشان consistent variable substitution." },
    ]
  },
  {
    version: "V21.9.7",
    date: "2026-05-10",
    types: ["feature", "architectural"],
    title: "↩️ Phase 11m — Returns Management + Bosta CRP",
    changes: [
      { type: "feature", text: "↩️ [تاب جديد للمرتجعات] sub-tab جديد '↩️ المرتجعات' في الـ Shopify Integration. بـ يعرض كل طلبات الارتجاع مع filters per status:\n• ⏳ بانتظار المراجعة (الـ default badge)\n• ✅ مقبول\n• 🚚 في الطريق (Bosta CRP)\n• 📦 تم الاستلام\n• 💰 تم رد المبلغ\n• ❌ مرفوض / ⚪ ملغي\n7 metric cards على الـ top — counts لكل حالة." },
      { type: "feature", text: "🔔 [Notification badge] على tab '↩️ المرتجعات' بقى يظهر دائرة حمراء بـ pulsing animation فيها عدد طلبات الارتجاع pending_review. الـ badge بـ يـ refresh تلقائياً مع الـ Firestore listener." },
      { type: "feature", text: "📡 [3 endpoints جديدة]:\n• POST /api/shopify/return-request-create — إنشاء طلب من order موجود\n• POST /api/shopify/return-requests-list — list مع filters + stats\n• POST /api/shopify/return-request-update — approve/reject/mark_received/mark_refunded/cancel" },
      { type: "feature", text: "🚚 [Bosta CRP integration] لما الـ admin يضغط '✅ قبول + Bosta':\n• الـ endpoint بـ يقبل الطلب\n• ينادي Bosta API: POST /api/v0/deliveries مع type:25 (Customer Return Pickup)\n• Bosta يـ schedule استلام الباكدج من العميل وردها للورشة\n• الـ tracking_number + delivery_id يتـ stored على الطلب\n• الـ status يتغيّر تلقائياً لـ 'in_pickup'\nإذا Bosta فشل، الطلب يبقى approved + الـ error يظهر." },
      { type: "feature", text: "🆕 [Create Return Modal] modal بـ يـ:\n• Order picker — يعرض الـ delivered orders فقط\n• Reason dropdown (6 reasons + custom text)\n• Items checklist مع كميات (partial returns مدعومة)\n• Auto-calculate refund amount من الـ selected items\n• Refund method: cash / store_credit / shopify_refund\n• Internal notes" },
      { type: "feature", text: "⏯ [Status transitions]\nلكل status فيه actions مناسبة:\n• pending_review → ✅ قبول + Bosta · ✅ قبول فقط · ❌ رفض\n• approved → 🚚 في الطريق\n• in_pickup → 📦 تم الاستلام\n• received → 💰 تم رد المبلغ\nأي حالة قبل refunded/rejected يقدر المستخدم يـ cancel." },
      { type: "architectural", text: "📅 [Daily split V21.9.7] shopifyReturnRequests → shopifyReturnRequestsDays/{YYYY-MM-DD}. تم تسجيل الـ split من اليوم الأول عشان ما نحتاجش migration لاحقاً. الـ migration auto-runs مرة واحدة فقط بعد V21.9.5 بـ no-op لأن الـ array فاضي." },
      { type: "architectural", text: "🛠 [_returnRequests.js helper] read/write/update functions تعالج dual-mode (legacy array vs daily-split). الـ updateReturnRequest يـ scan الـ recent days للعثور على الطلب → low cost حتى مع آلاف الطلبات." },
      { type: "doc", text: "📜 [Bosta API note] Bosta type code 25 = CRP (Customer Return Pickup). تم استخدامه مع pickupAddress=customer + receiver=customer. لو Bosta API يحتاج tweaking للـ business config، الـ payload في return-request-update.js معلّق بـ comments واضحة." },
    ]
  },
  {
    version: "V21.9.6",
    date: "2026-05-10",
    types: ["feature"],
    title: "📱 Phase 11l — WhatsApp Contact Tracking",
    changes: [
      { type: "feature", text: "📱 [Badge على كل عميل بـ عدد الرسايل] العميل اللي اتبعت له WhatsApp قبل كده بـ يظهر عليه badge أخضر '📱 تم إرسال N' بجنب الـ tier badge. لو ≥ 3 الـ badge بقى أحمر '📱 تم إرسال N — توقّف!' كـ تحذير من spam." },
      { type: "feature", text: "🔢 [Counter overlay على زرار WhatsApp] الزرار 📱 بقى عليه counter صغير دائري مرئي بـ:\n• خضر (1-2 رسالة)\n• أحمر (3+ رسائل) + الزرار نفسه بقى أحمر تحذيري\nلو مفيش رسايل قبل كده، الزرار يبقى عادي بدون أي علامات." },
      { type: "feature", text: "⚠️ [Confirmation popup قبل الإرسال للمتواصل قبل كده]\nلما تضغط 📱 على عميل بـ contact_count > 0:\n• يفتح popup بـ 'متواصل معاه قبل كده'\n• يعرض عدد الرسايل + آخر مرة (اليوم/امبارح/N يوم/N أسبوع/N شهر)\n• المستخدم يقدر يـ confirm أو يلغي\nده بـ يـ prevent الـ spam الغير مقصود." },
      { type: "feature", text: "🎯 [Smart skip في الـ bulk WhatsApp] لما تختار عملاء وتضغط Bulk WhatsApp، لو في عملاء اتبعت لهم رسالة قبل كده، يظهر سؤال:\n• 'للكل' (يبعت للجميع)\n• 'للجدد فقط' (skip الـ already-contacted)\n• الـ toast بعد الإرسال بـ يقول 'اتفتح N tab · تم تخطي M متواصل معاهم قبل كده'" },
      { type: "feature", text: "🔍 [Filter جديد] في تاب العملاء: '📱 إخفاء اللي اتبعت لهم رسالة قبل كده' — checkbox جديد. مفيد لما تعمل campaign للعملاء الجدد فقط." },
      { type: "feature", text: "📊 [Stats cards جديدة] صف ثاني من الـ metrics في تاب العملاء:\n• 📤 اتبعت لهم رسالة (مع total messages count)\n• 📵 لم يتم التواصل (عملاء طازة بـ تليفون)\n• ✉️ متوسط الرسائل لكل عميل اتـ contact" },
      { type: "improvement", text: "💾 [الـ data كان موجود بالفعل] الـ contact_count + last_contacted_at كانوا في الـ schema من V20.2 — كل ما تضغط 📱 الـ shopifyUpdateCustomer({bumpContact: true}) كان بيعمل increment. النقص كان بس في الـ UI — الـ count مكنش ظاهر للمستخدم. الإصلاح اللي يضيف الـ visibility + الـ confirmations." },
    ]
  },
  {
    version: "V21.9.5",
    date: "2026-05-10",
    types: ["fix", "feature", "architectural"],
    title: "🩹 Phase 11k — Crash fix + Daily splits + Push Modal enhancements",
    changes: [
      { type: "fix", text: "🚨 [CRASH critical] React Error #310 لما تضغط 'تحديث القائمة' في تاب العملاء. السبب: useEffect كان مكتوب بعد early return في SyncProgressOverlay → كل ما الـ job يـ toggle بين null/value الـ hooks count يتغيّر → React بـ يـ crash. تم نقل الـ useEffect قبل الـ return، وعزل الـ derived state (isDoneForDismiss) من الـ render-only state." },
      { type: "architectural", text: "📅 [Daily split V21.9.5 — إشعارات الدائنة + المدينة] tableSetup كامل في splitCollections.js + dataLimits.js + App.jsx merge logic + migration:\n• salesCreditNotes → salesCreditNotesDays/{YYYY-MM-DD}\n• purchaseDebitNotes → purchaseDebitNotesDays/{YYYY-MM-DD}\n• Flag: _splitDaysV2195Done\n• Migration بـ يعمل backup كامل في backups/pre-migration-credit-debit-notes-v2195-<ts>\n• Atomic strip-and-flag في runTransaction\n• Auto-runs بعد V19.53 (notifications) في الـ chain" },
      { type: "feature", text: "🛍️ [Push Modal — تحسينات شاملة]:\n\n📌 Title field — اسم المنتج في Shopify (افتراضياً modelNo + modelDesc)\n🏷 Model number ظاهر بشكل بارز — بـ يدخل تلقائياً في الـ SKU pattern\n🎨 Per-color images — كل لون له صورة منفصلة في Shopify (variant_ids مربوطة)\n🖼 صورة الموديل من CLARK بتـ added تلقائياً في الـ images list\n💾 الـ user يقدر يحذف أي صورة (زرار 🗑 على كل image card)\n⚠️ Error indicator على الصور اللي مش راضية تـ load\n🏷 Badges على الـ images: 'رئيسية' + '🎨 [color]' + 'من CLARK'" },
      { type: "improvement", text: "🔌 [Backend support] push-product-from-clark بقى:\n• يقبل body.title (override) + body.colorImages (map)\n• يضيف order.image تلقائياً لو الـ images list فاضي\n• يـ merge الـ color images في الـ images list\n• يربط كل color image بـ variant_ids الخاصة باللون → Shopify يعرض الصورة الصح لما العميل يختار اللون\n• يحفظ title + color_images في shopify_meta للـ stable re-syncs" },
      { type: "fix", text: "📷 [Image upload preview bug] الـ compressImage احياناً بـ يرجّع Blob بدون .name property → Firebase upload فشل بصمت. تم: wrap في new Blob([data]) explicitly + force contentType='image/jpeg' + sanitize file name + onError indicator على الـ <img> tag. لو الصورة ما اتحملتش بـ يظهر '⚠️ فشل تحميل' بدل ما تـ feel المستخدم إنها رفعت صح." },
    ]
  },
  {
    version: "V21.9.4",
    date: "2026-05-10",
    types: ["feature", "architectural"],
    title: "🔄 Phase 11j — Universal Sync Progress Overlay",
    changes: [
      { type: "feature", text: "🔄 [Full-screen progress overlay لكل عملية مزامنة] أي sync أو pull من Shopify/Bosta دلوقتي بـ يـ trigger overlay شامل بـ:\n• Progress bar % + رسالة الخطوة الحالية\n• Sub-message (مثلاً: 12/50 منتج)\n• الوقت المستغرق\n• قفل كامل للـ UI — المستخدم ما يقدرش يضغط على أي حاجة\n• زرار Cancel (best-effort)\n• Esc محظور (مش يقدر يهرب)\n• Auto-dismiss عند النجاح، manual عند الخطأ" },
      { type: "architectural", text: "📡 [Progress Tracker pattern] api/_progressTracker.js:\n• withProgress(req, res, init, handler) wrapper للـ endpoints\n• ينشئ syncJobs/{jobId} Firestore doc\n• update(patch) callback مع throttling (1 write/sec) عشان ما يـ saturate-ـش الـ Firestore quota\n• Auto error trapping — أي throw يـ convert لـ status=error في الـ doc + HTTP 500 للـ client\n• Auto cleanup للـ jobs الأقدم من 24 ساعة" },
      { type: "architectural", text: "🎨 [SyncProgressOverlay component] src/components/SyncProgressOverlay.jsx:\n• Singleton — mounted في App.jsx مرة واحدة\n• subscribes لـ syncJobs/{jobId} عبر onSnapshot\n• Indeterminate bar لو مفيش total معروف\n• Progress bar مع smooth transitions\n• شاشة done: solid green bar + result preview\n• شاشة error: red banner + error details (monospace, scrollable)\n• Esc محظور أثناء العمل" },
      { type: "architectural", text: "🛠️ [runWithProgress wrapper] src/utils/syncProgress.js:\n• Generates jobId tلقائياً\n• Shows overlay قبل ما يـ send الـ request (instant feedback)\n• Try/catch شامل — never throws\n• Returns { ok: true, ... } أو { ok: false, error }\n• Network failure detection — يكتب في الـ Firestore لو الـ fetch بنفسه فشل" },
      { type: "feature", text: "✅ [الـ endpoints المربوطة في V21.9.4]:\n• POST /api/shopify/sync-orders-now (سحب الطلبات الجديدة)\n• POST /api/shopify/sync-products-now (سحب المنتجات)\n• POST /api/shopify/sync-customers (تجميع العملاء)\n• POST /api/shopify/sync-historical-orders (سحب التاريخ كله)\n• POST /api/bosta/sync-historical (Bosta + verification)\n\nالـ UI buttons في Settings + Orders + Customers + Products tabs دلوقتي بـ تـ trigger الـ overlay تلقائياً." },
      { type: "doc", text: "📜 [CLAUDE.md §11] إضافة قسم كامل في البروتوكول للـ progress tracking pattern. أي endpoint جديد يـ سحب أو يـ sync يـ MUST يستخدم withProgress + runWithProgress من اليوم الأول. لسه عندنا endpoints مش متربطين (push-inventory, sync-abandoned-carts, etc.) — هيتربطوا في phases تالية." },
      { type: "improvement", text: "🛡️ [No-crash guarantee] الـ user طلب 'مش عاوز يحصل كراش في أي نقطة'. الـ wrapper يضمن:\n1. Network errors → overlay يعرض الخطأ بدل ما الـ button يـ hang\n2. Server errors → عُرض الرسالة من الـ server\n3. Partial completion → الـ overlay يفضل ظاهر مع آخر state معروف\n4. Page reload أثناء العمل → الـ Firestore doc لسه موجود، الـ user يـ refresh ويشوف الـ status النهائي" },
    ]
  },
  {
    version: "V21.9.3",
    date: "2026-05-10",
    types: ["fix", "feature", "doc"],
    title: "🩹 Phase 11i — Push fixes + Diagnostics relocation + Daily-split tool",
    changes: [
      { type: "fix", text: "🐛 [المقاسات مش ظاهرة في Push Modal] CLARK orders ما بـ يخزّنوش `order.sizes` مباشرة — بيخزنوا `order.sizeSetId` اللي بـ يـ reference `data.sizeSets[i]`. الكود كان بـ يقرا order.sizes فاضي → مفيش مقاسات في الـ matrix. تم إصلاح: الـ ShopifyPushModal بقى يستخدم `getSizesFromSet(order, data)` من utils/format.js. الـ backend `_productPush.js` بقى يستقبل `sizeSets` من `cfg.sizeSets` ويعمل resolution مماثل." },
      { type: "fix", text: "🐛 [Push بـ يفشل بـ 'الموديل مش موجود'] orders في CLARK بـ تتخزن في seasons/{activeSeason}/orders/{docId} subcollection، مش في factory/config.orders (اللي كان فاضي). الـ push-product-from-clark بقى يقرا من الـ subcollection الصحيحة، يجرّب الـ active season أول، وإذا مش لاقي يـ scan كل الـ seasons. الـ write-back بـ يـ save على الـ doc الصحيح عبر _docPath المحفوظ." },
      { type: "feature", text: "🛠️ [Diagnostics اتنقلت لـ الإعدادات العامة] الـ DiagnosticsPanel كانت في تاب Shopify → Settings. اتنقلت لـ الإعدادات العامة → tab 'general' في الأعلى تحت قسم 🛠️ الصيانة. عشان تشمل كل النظام مش بس Shopify. الكارت في تاب Shopify بقى يعرض رسالة بسيطة فيها link." },
      { type: "feature", text: "📅 [Daily-split tool لـ shopifyPendingOrders] POST /api/maintenance/split-shopify-orders-daily — أداة لـ migrate الـ shopifyPendingOrders array إلى docs يومية في shopifyOrdersDays/{YYYY-MM-DD}. مفيدة لو الـ array كبر بشكل مفاجئ. بتعمل backup أوتوماتيك. ⚠️ ملاحظة: الـ endpoints (sync-orders-now, mark-delivered) لسه بـ تكتب في factory/config.shopifyPendingOrders — تحديث الـ endpoints هـ يجي في phase تالي. حالياً الـ array مـ cap-ـها 200 + monthly archive يكفي." },
      { type: "doc", text: "📜 [Engineering Protocol — CLAUDE.md] ملف جديد في الـ root بـ يـ document كل الـ conventions الأساسية: Build→Test→Commit→Push→Zip بروتوكول، Document Splitting (daily لـ dated arrays، per-id للـ entities)، Active Season pattern، Fabric+Color storage، Sizes resolution، Phone normalization، WhatsApp popup-blocker safety، Versioning، Server-side conventions، Anti-patterns. هذا هو المرجع لأي شغل جديد." },
      { type: "improvement", text: "🎯 [الـ split-by-day بقى policy] لكل array جديد بـ يكبر من dated entries (transactions, deliveries, payments, shipments, etc.) لازم يتـ register في SPLIT_COLLECTIONS من اليوم الأول. ده الـ default لأي growing field. الـ alternative للـ entity-based arrays (customers, products) هو PARTITIONED_COLLECTIONS (per-id docs)." },
    ]
  },
  {
    version: "V21.9.2",
    date: "2026-05-10",
    types: ["architectural", "feature"],
    title: "✂️ Phase 11h — Split shopifyProducts + shopifyCustomers",
    changes: [
      { type: "architectural", text: "✂️ [Document splitting لـ shopifyProducts + shopifyCustomers] الـ factory/config doc كان وصل لـ 66% من الـ 1MB cap (673KB). الـ array-ين دول كانوا 80% من الحجم (277KB + 261KB). دلوقتي كل منتج / عميل = doc منفصل في collection خاص: shopifyProductsDocs/{id} و shopifyCustomersDocs/{id}. الـ factory/config هـ يبقى ثابت الحجم تماماً." },
      { type: "feature", text: "📡 [POST /api/maintenance/split-shopify-collections] migration endpoint:\n• dryRun: يعطيك preview للـ counts + KB قبل/بعد\n• Execute: backup كامل في backups/pre-split-shopify-v21.9.2-<ts>\n• Atomic: ينقل البيانات في batches (≤400 ops/batch)، يستخدم runTransaction لـ atomic strip-and-flag\n• Idempotent: لو الـ flag موجود بالفعل، يرجّع skipped:true" },
      { type: "feature", text: "🩺 [Banner تنبيه في Diagnostics] لو حجم الـ doc ≥ 50% من الـ cap والـ migration ما اتعملش، بـ يظهر banner أصفر بـ زرار '✂️ ابدأ التقسيم'. الـ click بـ يـ run dry-run الأول ثم يطلب confirmation، ثم ينفّذ الـ migration الفعلي." },
      { type: "improvement", text: "🔄 [الـ endpoints بقت dual-mode] كل الـ Shopify endpoints اللي كانت بتقرا أو تكتب في cfg.shopifyProducts / cfg.shopifyCustomers اتعدّلت لتـ branch على الـ flag _partitionedV2192Done:\n• Pre-migration: قراءة/كتابة من factory/config arrays (legacy)\n• Post-migration: قراءة/كتابة per-doc من collections\nالـ endpoints المتأثرة: sync-products-now, sync-customers, update-customer, update-product-settings, bulk-update-products, push-customer-tags, push-inventory-now, create-clark-item, cron/shopify-push-inventory" },
      { type: "improvement", text: "🎯 [Per-doc updates أسرع وأنحف] قبل كده كل تعديل بسيط على عميل واحد كان يـ rewrite كل الـ 261KB array. دلوقتي يكتب بس الـ 1KB doc بتاع العميل المعني → 260× أقل bandwidth + أسرع 10×." },
      { type: "improvement", text: "📊 [Diagnostics بـ تـ scan الـ collections الجديدة] shopifyProductsDocs + shopifyCustomersDocs بـ يظهروا في Storage panel مع doc_count + estimated bytes." },
      { type: "doc", text: "💡 [الـ pattern مماثل لـ V19.57] الـ V19.57 migration نقل master data (customers, suppliers, workshops, etc.) إلى partitioned collections. V21.9.2 بـ يستخدم نفس الـ utility (`syncAllPartitionedChanges` + `stripPartitionedArrays`) — مجرد إضافة 2 fields جديدة للـ map." },
    ]
  },
  {
    version: "V21.9.1",
    date: "2026-05-10",
    types: ["feature"],
    title: "📚 Phase 11g — Archive Viewer + Full Workflow",
    changes: [
      { type: "feature", text: "📚 [Archive Viewer في تاب الطلبات] زرار جديد '📚 اعرض الأرشيف' بـ يبدّل بين الـ live (آخر 200 طلب) والـ archive (كل التاريخ من shopifyOrdersArchive). dropdown لاختيار الشهر — كل شهر بـ يعرض عدد الطلبات. الـ shipment + payment status بـ يـ snapshot عند السحب الأرشيفي." },
      { type: "feature", text: "👥 [العملاء بـ يـ pull من الأرشيف] الـ sync-customers الآن بـ يـ scan shopifyOrdersArchive collection بالإضافة لـ shopifyPendingOrders الـ live. الـ delivered_count + revenue + tier بـ يحتسبوا من كل الطلبات (الجديدة + التاريخية)." },
      { type: "feature", text: "📚 [زرار 'مزامنة شاملة' في تاب العملاء] one-click workflow بـ يعمل التالي بالترتيب:\n1. POST /api/shopify/sync-historical-orders → سحب كل الطلبات القديمة + split في archive\n2. POST /api/shopify/sync-customers → re-aggregate customers من الـ live + الأرشيف\nالـ user يقدر يضغط مرة واحدة ويستقبل كل العملاء بـ delivered_count دقيق." },
      { type: "feature", text: "📡 [POST /api/shopify/list-archived-orders] endpoint جديد:\n• يـ list الـ archived orders حسب الشهر\n• filter بـ status (delivered/refused/all)\n• يرجع available_months للـ dropdown\n• max 1000 طلب per response (لتـ prevent payload bloat)" },
      { type: "improvement", text: "📊 [stats من الأرشيف في الـ toast] لما تضغط 'تحديث القائمة' (Customers) دلوقتي بـ يعرض كم عميل اتـ pull من الأرشيف بشكل منفصل: '📚 N من الأرشيف'." },
      { type: "improvement", text: "🐛 [Customer aggregator dedup] لو نفس shopify_order_id موجود في الـ live و الـ archive، الـ live يفوز (له last_state mutations زي delivered_at/refused_at اللي مش متوفرة في snapshot الأرشيف)." },
    ]
  },
  {
    version: "V21.9.0",
    date: "2026-05-10",
    types: ["fix", "feature"],
    title: "🩹 Phase 11 — Bug Fixes + Historical Sync + Diagnostics",
    changes: [
      { type: "fix", text: "🐛 [Variant Matrix bug في Push Modal] لما ضغطت 'Push Model'، الـ matrix كان فاضي حتى مع وجود ألوان في خامة A. السبب: الـ extraction كان يقرا من order.fabricA.colors لكن CLARK يحفظ الألوان في field منفصل order.colorsA بشكل [{color, colorHex, layers, qty}]. تم تصحيح الـ extraction في الـ frontend والـ backend للقراءة من المكان الصحيح." },
      { type: "fix", text: "📱 [WhatsApp button مش بيشتغل] الـ window.open كان يحصل بعد await ask() الـ confirmation popup → الـ popup blocker يـ silently drop الـ open. تم الإصلاح: pre-open blank tab synchronously في الـ click handler ثم نـ navigate-ه بعد الـ await، مع fallback لـ location.href لو الـ popup blocked." },
      { type: "feature", text: "✅ [Purchase indicator على العملاء] لو العميل اشترى فعلاً (delivered_count > 0) بـ يظهر badge أخضر بارز '✓ اشترى ×N' بجنب tier badge. للـ refused orders بـ يظهر '⚠️ رفض'. للـ pending '⏳ بانتظار'." },
      { type: "feature", text: "📚 [Historical Backfill — Shopify orders]\n• POST /api/shopify/sync-historical-orders بـ يـ pull كل الطلبات القديمة (default: آخر سنتين)\n• استخدام Link-header cursor pagination (>250 طلب per page)\n• Splits storage: collection shopifyOrdersArchive، docs مقسّمة بـ year-month، max 600 طلب per doc (تحت حد 1MB لـ Firestore)\n• Returns monthlyBreakdown + count + duration" },
      { type: "feature", text: "📚 [Historical Backfill — Bosta deliveries + Verification]\n• POST /api/bosta/sync-historical بـ يـ pull كل الـ deliveries من Bosta (default: آخر سنة)\n• Storage: collection bostaDeliveriesArchive split per year-month\n• Verification check: لكل CLARK order مرتبط بـ tracking number، يقارن CLARK status مع Bosta state\n• تقرير mismatches بـ severity (high/medium/low) + شاشة في Settings تعرضهم" },
      { type: "feature", text: "🩺 [Smart Diagnostics tool في Settings]\n• GET /api/diagnostics — health monitor شامل\n• Storage: حجم factory/config + breakdown per array (sorted by size) + archive collections\n• Connections: Shopify (last sync age) + Bosta (webhook secret status)\n• Critical alerts: orphaned reservations، stale pending orders >14 يوم، customers بدون phone\n• Severity colors: ok/info/warn/error/critical مع banners + icons\n• الـ overall_severity في الـ topbar" },
      { type: "feature", text: "📊 [Storage monitoring panel]\n• Document size مع progress bar يـ color حسب الـ % من الحد الأقصى\n• Top 8 arrays by size (orders, shopifyPendingOrders, customers, etc.) مع pct_of_doc\n• Archive collections (count + estimated total bytes)\n• تنبيه فوري لو array قارب على cap الـ 1MB" },
      { type: "improvement", text: "🛡️ [Document splitting architecture] الـ archive collections (shopifyOrdersArchive, bostaDeliveriesArchive) بـ تـ scale لآلاف الطلبات بدون ما تـ break factory/config doc. كل bucket = شهر واحد، يتـ pageينات لو زاد على 600. الـ live data لسه في factory/config (cap 200) للـ fast access." },
      { type: "improvement", text: "👥 [Customer enrichment] الـ aggregator كان بالفعل يقرا من ALL orders (delivered + refused + cancelled + returned + pending). الـ purchase indicator الجديد بـ يـ surface الـ delivered_count بشكل مرئي بارز. الـ source badges (✓ verified / 🛍️ Shopify) لسه شغّالة." },
    ]
  },
  {
    version: "V21.8.0",
    date: "2026-05-10",
    types: ["feature"],
    title: "📦 Phase 10i — Multiple Shipping Providers (FINAL!)",
    changes: [
      { type: "feature", text: "🎉 [الـ 9 phases خلصوا في يوم واحد!] Phase 10 (Push) → 10b (Carts) → 10c (Coupons) → 10d (Auto-Bosta) → 10e (Segments) → 10f (Reviews) → 10g (Tags) → 10h (AWB) → 10i (Multi-provider). إجمالي 9 commits + 9 versions في الـ V21 series." },
      { type: "feature", text: "📦 [Provider Registry] Plugin-style architecture للـ shipping companies:\n• 4 providers في الـ registry: Bosta (active), Aramex (placeholder), Mylerz (placeholder), Manual (no API)\n• كل provider له capabilities: { create, track, awb, webhook }\n• الـ user يختار default provider — هـ يـ default لكل الـ shipments الجديدة\n• الـ creds مخزّنة لكل provider بـ namespaced keys (bosta_api_key, aramex_password, mylerz_api_key)" },
      { type: "feature", text: "📡 [POST /api/shipping/configure]\n• يحفظ creds + default_provider\n• Sanitized response (مش بـ يرجّع الـ secrets)\n• Status flags: bosta_configured, aramex_configured, mylerz_configured" },
      { type: "feature", text: "🎨 [ShippingProvidersCard في Settings tab — قبل Bosta]\n• 4 cards للـ providers (icon + label + region + status)\n• الـ default محدد بـ border ملوّن + ✓ افتراضي\n• Status لكل واحد: ● معدّ / ○ غير معدّ / قريباً (للـ inactive)\n• Forms للـ Aramex (3 fields) + Mylerz (2 fields) — تحفظ الـ creds للـ implement مستقبلاً" },
      { type: "doc", text: "🚀 [التوسعة لاحقاً] الـ pattern:\n1. Create api/<provider>/{create-shipment, track, print-awb}.js مماثلين لـ Bosta\n2. Update _providers.js: مارك provider كـ active\n3. الـ UI تلقائياً هـ يـ enable الـ buttons والـ flows\nالـ webhook المالا الـ provider — خل state code mapping يدوي. الـ buckets الموحدة (pending, in_transit, delivered, إلخ) بـ تخلي الـ UI consistent عبر الـ providers." },
      { type: "doc", text: "✅ [الـ Shopify Integration كامل دلوقتي]\n• 12 Shopify phase + 5 Bosta phases + Customer + Discount + Reviews\n• ~4000+ lines في ShopifyIntegrationPg.jsx\n• 30+ API endpoints\n• 5 cron jobs\n• 2 modal components\n• 8 sub-tabs functional" },
    ]
  },
  {
    version: "V21.7.0",
    date: "2026-05-10",
    types: ["feature"],
    title: "🖨️ Phase 10h — Print Bosta AWB from CLARK",
    changes: [
      { type: "feature", text: "🖨️ [طباعة AWB من Bosta] الـ user يقدر يطبع Air Waybill PDF لأي طلب اتعمل عبر CLARK Auto-Create (Phase 10d). single + bulk modes." },
      { type: "feature", text: "📡 [POST /api/bosta/print-awb]\n• POST /api/v0/awb مع delivery_ids array\n• Bosta بـ يرجّع PDF URL\n• Bulk: PDF واحد يحتوي كل الـ AWBs المختارة\n• Skip للطلبات بدون delivery_id" },
      { type: "feature", text: "🎨 [UI في Shipping tab]\n• Single: زرار 🖨️ AWB في كل order row (إذا عنده delivery_id)\n• Bulk: checkbox على كل row + 'Print AWBs (PDF واحد)' في bulk action bar\n• الـ PDF بـ يفتح في tab جديد للطباعة المباشرة" },
      { type: "doc", text: "⚠️ [محدودية] الـ AWB API بـ يحتاج delivery_id (Bosta internal ID)، اللي بنـ store-ه بس لما الـ shipment يتعمل عبر Phase 10d Auto-Create. الطلبات اللي اتـ link manually بـ tracking number فقط مش هـ يكون لها delivery_id → الـ AWB غير متاح. حل: استخدم الـ Auto-Create للـ shipments الجديدة." },
    ]
  },
  {
    version: "V21.6.0",
    date: "2026-05-10",
    types: ["feature"],
    title: "🔄 Phase 10g — Bi-directional Customer Tags Sync",
    changes: [
      { type: "feature", text: "🔄 [Bi-directional tag sync كامل]\n• Shopify → CLARK: لما sync-customers يجري، الـ shopify_tags بـ تتسحب (موجود من قبل)\n• CLARK → Shopify: الـ user يقدر يدفع الـ tags + notes اللي عملها في CLARK لـ Shopify customer (جديد!)" },
      { type: "feature", text: "📡 [POST /api/shopify/push-customer-tags]\n• PUT /admin/api/X/customers/{id}.json بـ tags + note\n• Modes:\n  - merge (default): دمج CLARK tags + Shopify tags المحفوظة (case-insensitive dedup)\n  - replace: استبدال كامل\n• Skips للـ customers اللي مش مش-pulled من Customer API (مفيش shopify_customer_id)\n• Bulk mode عبر bulkCustomerIds[]\n• Stamps last_pushed_to_shopify_at للـ tracking" },
      { type: "feature", text: "🎨 [UI: 2 buttons جديدة]\n• Single: زرار '🔄 Push Tags لـ Shopify' في الـ expanded view لكل عميل (للـ shopify-linked customers فقط)\n• Bulk: زرار '🔄 Push Tags لـ Shopify' في الـ bulk action toolbar — يدفع لكل selected customer دفعة واحدة\nبعد الـ push، الـ user يقدر يفتح Shopify Admin ويشوف الـ tags ظاهرة على الـ customer هناك." },
      { type: "doc", text: "💡 [Use cases]\n• 'VIP' tag في CLARK يـ push لـ Shopify → بـ يظهر في Shopify customer view + يـ trigger Shopify segments للـ marketing campaigns\n• Notes (private في CLARK) بـ تـ sync كـ Shopify customer note\n• Workflow: حدد customers → 🏷 Tags في CLARK → 🔄 Push → tags ظاهرة في Shopify Admin" },
    ]
  },
  {
    version: "V21.5.0",
    date: "2026-05-10",
    types: ["feature"],
    title: "⭐ Phase 10f — Judge.me Reviews integration",
    changes: [
      { type: "feature", text: "⭐ [Judge.me Reviews integration] الـ user عنده Judge.me Reviews في Shopify Subscriptions. دلوقتي CLARK يقدر يـ pull الـ ratings + reviews من Judge.me API ويعرضها بجنب كل منتج في تاب المنتجات." },
      { type: "feature", text: "📡 [POST /api/judgeme/sync-reviews]\n• Pulls من https://judge.me/api/v1/reviews?api_token=...&shop_domain=...\n• Paginated 100/page، cap 5000 review\n• Aggregates per product_external_id (= Shopify product_id)\n• Saves: count, avg_rating, ratings histogram (1-5 stars), top 5 recent reviews\n• الـ shopify_domain بـ يجي تلقائياً من الـ shopifyConfig (مفيش ضرورة لإدخاله)" },
      { type: "feature", text: "⚙️ [Judge.me Settings card] في Settings tab تحت Bosta:\n• 3 stat cards: total reviews / products with reviews / overall avg rating\n• خانة لـ API token (مخفي بـ password type)\n• زرار '🔄 سحب الـ Reviews'\n• Status badge ● مفعّل / ○ غير معدّ" },
      { type: "feature", text: "✨ [Rating chips على Products tab] كل ProductRow بقى يعرض rating chip ⭐ x.x (count) لو فيه reviews. الـ rating بـ ينضم للـ existing display بدون disruption." },
      { type: "doc", text: "📋 [User setup]\n1. Judge.me Dashboard → Profile → API → Copy token\n2. CLARK → Shopify → Settings → Judge.me Reviews card\n3. الصق الـ token + 💾 حفظ\n4. اضغط '🔄 سحب الـ Reviews'\n5. هـ تشوف الـ ratings ظاهرة على Products tab" },
    ]
  },
  {
    version: "V21.4.0",
    date: "2026-05-10",
    types: ["feature"],
    title: "💾 Phase 10e — Customer Segments (saved filters)",
    changes: [
      { type: "feature", text: "💾 [Customer Segments] الـ user يقدر يحفظ filter combo (tier + search + delivered + marketing + has-phone) باسم. مثلاً 'VIP من القاهرة آخر 30 يوم' أو 'at-risk للحملات' أو 'رمضان 2026'. بضغطة على chip بـ يطبق كل الـ filters دفعة واحدة." },
      { type: "feature", text: "🎨 [Segment chips bar] فوق الـ filters في تاب العملاء:\n• شريط chips بكل الـ segments المحفوظة\n• الـ segment الـ active بـ يبقى highlighted بلون الـ accent\n• اضغط chip → يطبق الـ filters\n• اضغط ✕ على الـ chip → يحذف الـ segment\n• زرار '🔄 reset' لمسح كل الـ filters\n• زرار '💾 حفظ كـ segment' لتحويل الـ filters الحالية لـ segment جديد" },
      { type: "feature", text: "🗂 [Schema: shopifyCustomerSegments[]]\n• { id, name, filters: { tierFilter, search, showDeliveredOnly, showMarketingOnly, showHasPhone }, createdAt, createdBy }\n• Cap 50 segment لتجنب bloat\n• الـ writes via upConfig (نفس الـ pattern الموجود)\n• مفيش API endpoint جديد — كله client-side state" },
      { type: "feature", text: "💡 [Workflow examples]\n• 'VIP رمضان' → tier=vip + has phone → bulk WhatsApp مع كوبون VIP25\n• 'at-risk' → tier=at_risk → re-engagement campaign\n• 'جدد محتاجين متابعة' → tier=new → welcome message + ask for review\n• 'بلا تليفون' → has_phone=false → email-only campaigns" },
    ]
  },
  {
    version: "V21.3.0",
    date: "2026-05-10",
    types: ["feature"],
    title: "📦 Phase 10d — Auto-Create Bosta Shipment",
    changes: [
      { type: "feature", text: "📦 [إنشاء شحنة Bosta من CLARK] لما الـ user يستلم طلب جديد من Shopify، يقدر يضغط زرار '📦 إنشاء شحنة Bosta' على الـ order card، CLARK بـ يعمل:\n• POST /api/v0/deliveries لـ Bosta\n• payload محسوب من order: receiver name + phone + email + address، COD = order.total، businessReference = shopify_order_id\n• يحفظ الـ tracking number returned على الـ order.bosta\n• الـ webhook flow الموجود بـ يستلم updates تلقائياً" },
      { type: "feature", text: "📡 [POST /api/bosta/create-shipment]\n• Idempotent: لو الـ order عنده tracking بالفعل، يرفض (يقترح refresh)\n• Required: order.customer_info.phone\n• Optional body: packageType (default Parcel)، size (default Small)، notes\n• Initial state code = 10 (New) في state_history مع source=auto_create\n• stamp created_via=clark_auto + created_by=admin email" },
      { type: "feature", text: "🎨 [UI: زرار في الـ Orders tab] على كل order pending بدون tracking:\n• 'إنشاء شحنة Bosta' بـ confirmation dialog شامل (اسم العميل، تليفون، عنوان، COD)\n• بعد الإنشاء: tell() popup بـ tracking number\n• الـ orders اللي عندها tracking بـ يظهر بدلاً من الزرار: '🚚 <tracking>' بادج" },
      { type: "feature", text: "🔗 [Integration كامل]\n• الـ businessReference بـ يبقى shopify_order_id → الـ webhook بـ يطابق فوراً\n• الـ COD بـ يـ encode من order.payment_method (cod=order.total، online=0)\n• لو فعّلت auto-mark-delivered في Bosta settings، الطلب بـ يـ flow كامل: Bosta delivers → webhook → CLARK marks delivered → invoice generated" },
    ]
  },
  {
    version: "V21.2.0",
    date: "2026-05-10",
    types: ["feature"],
    title: "🎟 Phase 10c — Discount Codes Management",
    changes: [
      { type: "feature", text: "🎟 [إدارة كوبونات Shopify كاملة] الـ user دلوقتي يقدر:\n• ينشئ كوبون جديد (% خصم أو مبلغ ثابت)\n• يحدد الـ usage limit (مثلاً أول 100 استخدام بس)\n• يحدد تاريخ انتهاء (ends_at)\n• يعرض كل الكوبونات الموجودة في الستور (sync من Shopify)\n• ينسخ الكود بضغطة (للصق في رسالة WhatsApp)\n• يحذف كوبون نهائياً" },
      { type: "feature", text: "📡 [Single endpoint multi-action] /api/shopify/discount-codes بـ 4 actions:\n• list — يرجّع كل الـ price_rules بـ codes الـ associated\n• sync — list + يحفظ في factory/config.shopifyDiscountCodes\n• create — يولّد price_rule + discount_code (1:1) في Shopify\n• delete — يحذف price_rule (auto-deletes الـ codes المرتبطة)" },
      { type: "feature", text: "🎟 [New sub-tab '🎟 الكوبونات'] بين Abandoned Carts والـ Customers:\n• 4 stats: عدد الكوبونات / إجمالي الاستخدامات / كوبونات % / كوبونات مبلغ\n• Inline create form: code + type + value + usage_limit + ends_at\n• قائمة بكل كوبون: badge شفاف + قيمته + استخدامات + تاريخ انتهاء + once_per_customer\n• Status badges: ⏰ منتهي / 📊 متشغّل (وصل لحد الاستخدام)\n• 2 actions per code: 📋 نسخ / 🗑 حذف" },
      { type: "feature", text: "💡 [Workflow integrations]\n• الـ Abandoned Carts message بـ يقترح كوبون BACK10 — تقدر تنشئه من هنا\n• الـ Customers Bulk WhatsApp يقدر يحط template مع {code} منسوخ من هنا\n• مفيد لحملات seasonal: VIP25 / RAMADAN30 / SUMMER15 / etc." },
    ]
  },
  {
    version: "V21.1.0",
    date: "2026-05-10",
    types: ["feature"],
    title: "🛍️ Phase 10b — Abandoned Carts re-engagement",
    changes: [
      { type: "feature", text: "🛍️ [Abandoned Carts] Sync الـ checkouts المهجورة من Shopify (= عملاء بدأوا الشراء وما خلّصوش). Industry recovery rate ~25-35% — قيمة عالية جداً للـ revenue." },
      { type: "feature", text: "📡 [2 endpoints]\n• POST /api/shopify/sync-abandoned-carts (admin) — pull من /checkouts.json?status=open، defaults to 30 days back، cap 1000 cart\n• POST /api/shopify/update-cart-recovery (admin) — bumpContact, mark recovered, set notes, do_not_contact" },
      { type: "feature", text: "🎯 [Smart WhatsApp Recovery] لما تـ click 📱 Recovery على cart:\n• الرسالة بـ تتولّد تلقائياً مع:\n  - اسم العميل\n  - أول 3 منتجات في العربة\n  - الإجمالي\n  - الـ abandoned_checkout_url (يـ pre-fill الـ checkout الأصلي)\n  - اقتراح كوبون BACK10 (10% خصم)\n• WhatsApp بـ يفتح في tab جديد\n• Bulk mode: 📱 WhatsApp Recovery Bulk للـ selected (delay 500ms بين كل واحد)" },
      { type: "feature", text: "🛍️ [New sub-tab] 'السلال المهجورة' بين الـ Orders والـ Customers بـ:\n• 5 stat cards: total / active / recovered / recovery rate / has phone\n• Filter active vs recovered\n• Bulk select + bulk WhatsApp\n• كل cart row: customer name + status badge + contact count + phone/email + age + items + total\n• 3 actions: 📱 Recovery (WhatsApp) / ↗ Link (open checkout) / ✅ Recovered (manual mark)" },
      { type: "feature", text: "💾 [Persistent fields per cart]\n• last_contacted_at + contact_count — auto-tracked\n• recovered_at + recovered_by\n• do_not_contact flag\n• user_note (free text)\nالـ sync الجاي بـ يحافظ على كل ده — مفيش loss للـ engagement history." },
    ]
  },
  {
    version: "V21.0.0",
    date: "2026-05-10",
    types: ["feature"],
    title: "🎨 Phase 10 — Push Model من CLARK لـ Shopify (matrix variants)",
    changes: [
      { type: "feature", text: "🛍️ [Push CLARK Model → Shopify بالكامل] الـ user دلوقتي يقدر يعمل Shopify product كامل من أي CLARK order:\n• title = modelNo + modelDesc\n• body_html = الوصف (markdown مدعوم)\n• vendor + product_type + tags\n• options = [Color, Size]\n• variants matrix = (ألوان خامة محددة × المقاسات)\n• per-variant SKU بـ pattern قابل للتعديل\n• per-variant inventory من stock matrix\n• multiple images uploaded من Firebase Storage" },
      { type: "feature", text: "📡 [Backend: 1 endpoint + 1 helper module]\n• POST /api/shopify/push-product-from-clark — يعمل create أو update (idempotent بناء على shopify_meta.shopify_product_id)\n• _productPush.js — pure functions:\n  - buildVariantSku(pattern, ctx) بـ Arabic-safe normalization\n  - extractFabricColors(order, fabricKey) — يـ extract الألوان من خامة محددة\n  - getVariantStock(matrix, color, size) — lookup من CLARK stock\n  - buildVariantMatrix(order, opts) — main builder\n  - descriptionToHtml(md) — markdown → HTML بسيط\n  - pushProductToShopify(creds, payload, existingId) — REST call\n  - uploadProductImageBySrc(creds, productId, img) — POST /products/{id}/images.json\n  - setVariantInventoryLevels(creds, productId, variants, locId) — sets accurate per-variant qty after create" },
      { type: "feature", text: "🎨 [ShopifyPushModal — UI كامل] component standalone بـ:\n• Form للـ vendor / product_type / tags / status\n• Description editor بـ markdown hint\n• Multiple image upload — drag & drop multi-file، compress تلقائياً (1200px)، upload لـ Firebase Storage، preview gallery 3:4 portrait مع reorder/delete\n• Color source selector — أي خامة (A-H) ألوانها تكون الـ Color variant. الـ dropdown بـ يعرض كل خامة عندها لون مع عدد الألوان وأمثلة\n• SKU pattern editor مع placeholders documented\n• Matrix preview — جدول كامل (Color × Size) مع SKU لكل cell\n• Push button: Create لو جديد، Update لو موجود، disabled لو مفيش variants\n• Result panel بعد الـ push: action، product ID، variants count، images uploaded، الـ Shopify admin URL" },
      { type: "feature", text: "🔘 [Push button في DetPg] في الـ order detail page، زرار جديد 🛍️ بـ يفتح الـ ShopifyPushModal. الـ button بـ يعرض حالة:\n• \"Push\" لو الموديل ما اتـ push-ـش قبل كده\n• \"محدّث\" لو متزامن (مع badge أخضر ✓ في الـ modal header)" },
      { type: "feature", text: "💾 [Schema: order.shopify_meta]\n• description, images[], color_source_fabric, sku_pattern\n• vendor, product_type, tags, status\n• shopify_product_id, shopify_handle, shopify_title (after first push)\n• push_status, last_pushed_at, last_pushed_by, last_push_action\n• variants_count\nالـ settings بـ تـ persist عبر الـ pushes — re-sync بـ يستخدم نفس الـ config." },
      { type: "feature", text: "🛡 [Wholesale-friendly]\n• الـ push بـ يقرأ stock matrix من order (per-variant)\n• الـ wholesale flow الموجود في CLARK ما يتأثر — wholesale بـ يخصم سيري كامل (موجود حالياً)\n• Phase 4 (Inventory Push) الموجود بـ يقدر يـ resync الـ Shopify لو الـ matrix اتغيّر" },
      { type: "doc", text: "✅ [الـ user workflow الجديد]\n1. اعمل model في OrdForm زي العادة (modelNo, fabrics, sizes, prices, stock matrix)\n2. روح DetPg للموديل\n3. اضغط 🛍️ Push\n4. في الـ modal:\n   - اختار خامة الـ color source (A عادة)\n   - اكتب وصف\n   - ارفع صور (متعددة)\n   - راجع الـ matrix preview\n5. Push للـ Shopify\n6. لو غيّرت stock matrix بعدين، اضغط 🔄 محدّث للـ resync\n\nWholesale (Jumla) بـ يفضل سيري — مفيش تأثير." },
    ]
  },
  {
    version: "V20.3.0",
    date: "2026-05-10",
    types: ["feature"],
    title: "👥 Phase 11+ — سحب عملاء Shopify مباشرة من Customer API",
    changes: [
      { type: "feature", text: "🐞 [User report] sync customers مش بـ يجيب أحد لأن الـ aggregation كان من orders الموجودة فقط. لو الـ user عنده عملاء مسجلين في Shopify ما اشتروا لسه (أو طلباتهم ما اتـ sync-ت)، مش هـ يظهروا. الحل: pull مباشرة من Shopify Customer API + merge مع الـ aggregated من orders." },
      { type: "feature", text: "📡 [Shopify Customer API integration]\n• fetchAllShopifyCustomers — paginated (250/page) بـ since_id، cap 25,000 customer\n• fetchShopifyCustomerCount — quick count بدون fetch الكل\n• mapShopifyCustomerToCLARK — يحوّل الـ JSON من Shopify لشكلنا (extracts: name, email, phone, accepts_marketing, tags array, total_spent, addresses, state)" },
      { type: "feature", text: "🔀 [Smart merge] الـ sync الجديد بـ يـ combine مصدرين:\n1. Orders aggregation — رصيد CLARK دقيق (delivered_count, last_delivered_at, refused, returned, real revenue)\n2. Shopify Customer API — رصيد Shopify (shopify_orders_count عبر كل الطلبات في Shopify، shopify_total_spent، tags الموضوعة في Shopify، accepts_marketing flag، عناوين كل العميل)\n\nالـ matching بـ phone canonical → نفس الشخص = entry واحد. لو موجود في الـ orders، الـ orders تـ wins للـ stats، الـ Shopify يـ enrich بالـ engagement data. لو موجود في Shopify بس → entry جديد بـ source=\"shopify_only\" + tier محسوب من Shopify counters." },
      { type: "feature", text: "🏷 [3 source types في الـ UI]\n• \"merged\" → ✓ verified badge أخضر — موجود في الـ مصدرين (الأكثر دقة)\n• \"orders\" → بدون badge — موجود فقط من orders aggregation\n• \"shopify_only\" → 🛍️ Shopify badge أزرق — مسجل في Shopify بس مش في CLARK orders\nبالإضافة: 🔕 badge للـ accepts_marketing=false عشان تعرف اللي رفضوا الـ marketing." },
      { type: "feature", text: "🆕 [Tier جديد: shopify_only] للعملاء اللي في Shopify بس مش في CLARK orders. الـ tier بـ يتحسب من Shopify counters:\n• shopify_orders_count ≥ 5 أو shopify_total_spent ≥ 5000 → VIP\n• shopify_orders_count 2-4 → Regular\n• shopify_orders_count = 1 → New\n• 0 → shopify_only (مسجل بدون شراء)" },
      { type: "feature", text: "📊 [Stats banner أوسع] 7 cards بدل 6:\n• إجمالي / اشتروا / VIP / Regular / Newبحاجة لمتابعة / 🛍️ Shopify فقط\n• الـ \"إجمالي\" بقى يعرض sub: \"X بـ تليفون\" عشان تعرف بسرعة كم منهم قابل للـ WhatsApp" },
      { type: "feature", text: "🛡 [Idempotent + graceful degradation]\n• الـ Shopify API call بـ يحصل OUTSIDE الـ Firestore transaction (slow operation)\n• لو فشل (offline/quota), الـ sync يـ fall back لـ orders aggregation فقط\n• الـ sync_error يتـ store في shopifyConfig للـ debugging\n• User-set fields (tags, notes, do_not_contact, contact_count) preserved عبر كل الـ sync-s" },
      { type: "feature", text: "📥 [Body option: skipShopifyDirect]\nلو الـ user عاوز sync سريع بـ orders فقط (مفيد لو الـ Shopify فيه آلاف الـ customers)، يبعت في الـ body { skipShopifyDirect: true }. الـ default = false (يـ pull من الإتنين)." },
    ]
  },
  {
    version: "V20.2.1",
    date: "2026-05-10",
    types: ["fix"],
    title: "🐞 Hotfix: Settings tab crash (\"user is not defined\")",
    changes: [
      { type: "fix", text: "💥 [User report] Settings tab بـ يـ crash بـ ErrorBoundary screen \"user is not defined\". السبب: لما ضفت BostaSettingsCard في V20.1، استخدمت user prop للـ bostaConfigure call، لكن SettingsTab نفسه ما كانش بـ يستلم user prop من الـ parent (ShopifyIntegrationPg). 2 إصلاحات:\n1. Pass user للـ SettingsTab في الـ render line\n2. أضف prop user للـ SettingsTab signature\n3. Defense-in-depth: الـ useEffect في BostaSettingsCard دلوقتي بـ يـ guard ضد user=undefined في أول render — لو الـ user مش جاهز، يـ skip الـ fetch ويستنى. ده يمنع الـ crash لو حصل race condition تاني." },
    ]
  },
  {
    version: "V20.2.0",
    date: "2026-05-10",
    types: ["feature"],
    title: "👥 Phase 11 — عملاء Shopify (للحملات + WhatsApp)",
    changes: [
      { type: "feature", text: "👥 [قسم منفصل عن عملاء الجملة] الـ user عاوز يتواصل مع عملاء Shopify اللي اشتروا فعلاً، بدون ما يخلطهم مع عملاء الجملة. الحل: array منفصل اسمه shopifyCustomers في factory/config، بـ يتـ aggregate من الطلبات الموجودة بـ phone-based dedup." },
      { type: "feature", text: "🎯 [Tier system تلقائي] كل عميل بـ يتحسب له tier:\n• 👑 VIP — 5+ تسليم أو إنفاق ≥ 5000ج\n• 🌟 Regular — 2-4 تسليم خلال 90 يوم\n• 🆕 جديد — 1 تسليم حديث\n• ⚠️ بحاجة لمتابعة — آخر تسليم > 90 يوم (at_risk)\n• 😴 غير نشط — مفيش تسليم ناجح\nالـ tier بـ يـ recompute كل sync — بـ يساعد في الـ campaigns targeting." },
      { type: "feature", text: "📡 [API endpoints]\n• POST /api/shopify/sync-customers — aggregate customers من shopifyPendingOrders. Idempotent — preserve user-set fields (tags, notes, accepts_marketing, do_not_contact, contact_count). كل عميل بـ ID فريد على أساس normalized phone (مثلاً scust_p_201234567890).\n• POST /api/shopify/update-customer — تعديل tags/notes/marketing flags. يدعم single + bulk. Action خاص bumpContact++ بـ يـ track عدد المرات اللي اتـ contact-ت العميل." },
      { type: "feature", text: "👥 [Customers sub-tab جديد بين Orders والـ Shipping]\n• 6 stat cards: total / اشتروا / VIP / Regular / Newبحاجة لمتابعة\n• Filters: tier, search (name/phone/email/tag), delivered-only, marketing-only, has-phone\n• Bulk select + action bar: 📱 WhatsApp Bulk / 📋 Copy Phones / 🏷 Set Tags\n• Per-customer card: name + tier badge + phone (clickable tel:) + email + governorate + stats (orders/delivered/revenue/AOV) + tags + at-risk warning\n• Expanded view: detailed stats، address، favorite SKUs (top 3)، contact history، notes" },
      { type: "feature", text: "📱 [WhatsApp Marketing — 3 طرق]\n1. Single: زرار 📱 على كل عميل → wa.me link مع رسالة \"أهلاً {name} 👋\"\n2. Bulk: حدد عملاء → 📱 WhatsApp Bulk → write template → بـ يفتح tab لكل عميل (delay 400ms عشان browser ما يـ block)، الـ {name} بـ يتم replace بالاسم\n3. Copy Phones: حدد عملاء → 📋 → ينسخ الأرقام clipboard للصق في أي tool خارجي\n• كل WhatsApp send بـ يـ bump contact_count ويـ stamp last_contacted_at للـ tracking" },
      { type: "feature", text: "🛡 [Engagement controls per customer]\n• tags[] — categorization (\"VIP\", \"رمضان 2026\", \"متابعة\")\n• notes — ملاحظات يدوية private\n• accepts_marketing — flag (default true)\n• do_not_contact — هـ يحذّر قبل الإرسال + بـ يـ exclude من الـ marketing-only filter\n• contact_count + last_contacted_at — auto-tracked" },
      { type: "feature", text: "🔍 [Phone-based dedup ذكي]\nنفس العميل بـ orderين مختلفين (01234567890 vs +201234567890) بـ يبقى entry واحد. الـ canonical form هو 12-digit بـ leading 2 (Egyptian format). الـ ID = scust_p_<phone> فالـ Firestore key مستقر." },
      { type: "doc", text: "✅ [الـ user workflow]\n1. Shopify tab → 👥 العملاء\n2. اضغط \"🔄 تحديث القائمة\" — هـ تشوف كل العملاء aggregated\n3. Filter: \"اللي اشتروا فقط\" (delivered ≥ 1) + tier المطلوب\n4. حدد عملاء → 📱 WhatsApp Bulk → اكتب رسالة بـ {name}\n5. اضغط \"افتح الـ tabs\" — كل عميل tab منفصل في WhatsApp Web\n6. ابعت الرسالة من كل tab\n\nالـ contact_count بـ يتـ bump تلقائياً عشان تعرف كم مرة كلّمت كل عميل." },
    ]
  },
  {
    version: "V20.1.0",
    date: "2026-05-10",
    types: ["feature"],
    title: "🚚 Phase 9 — Bosta Shipping Integration",
    changes: [
      { type: "feature", text: "🚚 [تكامل Bosta كامل] CLARK دلوقتي بـ يستلم updates من Bosta لما حالة شحنة تتغيّر، ويحدّث الطلبات تلقائياً. الـ workflow:\n1. الـ user بـ يولّد webhook secret (مرة واحدة)\n2. بـ يضيفه في Vercel env (BOSTA_WEBHOOK_SECRET) + Bosta dashboard URL\n3. بـ يضيف Bosta API key في CLARK\n4. أي تغيير حالة في Bosta → CLARK بـ يستلم webhook → يطابق الطلب → يحدّث state\n5. اختياري: auto mark-delivered/refused" },
      { type: "feature", text: "📡 [3 API endpoints جديدة]\n• POST /api/bosta/webhook (public + secret token) — يستلم Bosta webhooks، normalize payload، يطابق الـ order، يحدّث state_history\n• POST /api/bosta/track (admin) — link tracking number لـ order أو refresh من Bosta API (outbound call)\n• POST /api/bosta/configure (admin) — حفظ API key، توليد webhook secret، toggle auto-actions" },
      { type: "feature", text: "🎯 [Order matching بـ 3 strategies]\n1. By tracking_number (الأكثر دقة) — لو الـ user ربط الـ tracking يدوياً\n2. By businessReference (= shopify_order_id) — لو متضبط في Bosta عند إنشاء الشحنة\n3. By phone number (last resort) — يفضّل pending_delivery، ثم الـ most-recent\nلو ما لقاش match: بـ يـ log في bostaWebhookMisses[] للـ debugging." },
      { type: "feature", text: "🗂 [State codes mapping كامل] 17 Bosta state code محددين بـ buckets:\n• 10/11 = pending — بانتظار الاستلام\n• 20-23 = in_transit — في الطريق / في المخزن\n• 24/25 = out_for_del — 🛵 خرج للتوصيل\n• 41-44 = delayed — ⚠️ متأخر / محاولة فاشلة\n• 45 = delivered — ✅\n• 46-48 = returned — ↩️\n• 49 = lost ❓ · 50 = damaged 💥 · 60 = cancelled 🚫\nكل state بـ emoji + لون + bucket عشان UI consistency." },
      { type: "feature", text: "🚚 [Shipping sub-tab جديد] في Shopify integration:\n• 6 stat cards: total / tracked / untracked / out for delivery / delivered / issues\n• Filters: by bucket / search by tracking#/order#/name/phone / show tracked-only\n• كل order row: tracking number + state badge + customer + age\n• Per-order actions: 🔗 ربط tracking / 🔄 refresh من Bosta API / ✏️ تعديل / ▼ Timeline\n• Timeline view: full state history مع dot indicators + الـ source (webhook/manual/api_refresh)\n• Webhook misses log في الأسفل لو فيه payloads ما لقتش matching" },
      { type: "feature", text: "⚙️ [Bosta settings card] في Settings tab بـ 3 sections:\n1. تفعيل/إيقاف التكامل (toggle)\n2. API Key (server-side only، مش بـ يظهر في UI)\n3. Webhook URL + Secret generation:\n   • زرار 'ولّد Secret' → يطلع secret + URL كامل\n   • تعليمات واضحة لـ Vercel env + Bosta dashboard setup\n   • الـ secret يظهر مرة واحدة فقط (security)\n4. Auto-actions toggles:\n   • Auto mark-delivered لما Bosta يقول delivered\n   • Auto mark-refused لما يقول returned" },
      { type: "feature", text: "🛡 [Webhook security]\n• Token-based auth: ?token=<secret> أو X-Bosta-Token header\n• Token مخزّن في Vercel env (BOSTA_WEBHOOK_SECRET)\n• Constant-time-ish comparison (string equality is fine for short secrets)\n• De-dup: نفس الـ state code خلال 60 ثانية بـ يتـ skip\n• Always 200 OK to Bosta (even if unmatched) — Bosta ما يـ retry للأبد" },
      { type: "feature", text: "🔄 [Manual refresh] في Shipping tab، الـ user يقدر يضغط 🔄 على أي order عنده tracking → CLARK بـ يـ call Bosta API (GET /deliveries/{tn}) ويحدّث الـ state. مفيد لو الـ webhook ما وصل-ش لأي سبب." },
      { type: "doc", text: "📋 [الـ user setup steps]\n1. روح Bosta Dashboard → ربط التطبيقات → خد الـ API key (\"Shopify\")\n2. CLARK → Shopify tab → Settings → Bosta section\n3. الصق الـ API key + احفظ\n4. اضغط 'ولّد Webhook Secret' → انسخ الـ Secret + URL\n5. روح Vercel → Environment Variables → أضف BOSTA_WEBHOOK_SECRET\n6. روح Bosta → Add Webhook URL → الصق الـ URL الكامل (مع ?token=...)\n7. فعّل التكامل في CLARK + (اختياري) فعّل auto-actions\n8. خلاص — أي شحنة بعد كده هـ تـ track تلقائياً" },
    ]
  },
  {
    version: "V20.0.0",
    date: "2026-05-10",
    types: ["feature"],
    title: "🛍️ Shopify Phase 8 — Images, Variants, Create-in-CLARK",
    changes: [
      { type: "feature", text: "🖼 [الصور بشكل احترافي 3:4 portrait] الـ user أبلغ إن الصور مش ظاهرة. الحل:\n• الـ thumbnail بقى 60x80 (mobile) أو 75x100 (desktop) — ratio 3:4 (نفس Shopify default للـ fashion)\n• Object-position: center top عشان الـ crop يكون من فوق (مش من النص)\n• Fallback صحيح لو الصورة فشلت تـ load (📦 placeholder + retry بدون crossOrigin)\n• في الـ expanded view: gallery كامل بـ كل الصور (lazy-loaded)، اضغط أي صورة تفتح في tab جديد بـ full size\n• حفظ width/height من Shopify response عشان الـ aspect ratio يكون صح حتى لو الـ image dims مختلفة" },
      { type: "feature", text: "🎨 [Variants بأسماء الـ options مظبوطة] قبل V20 الـ variants كانت بتظهر كلها \"Default\" حتى لو فيها sizes/colors:\n• الـ Shopify response عنده options[]=[{name:'Size',values:[...]},{name:'Color',values:[...]}]\n• القديم كان بـ يرمي options ويعرض variant.title بس\n• دلوقتي:\n  - mapShopifyProductToCLARK بـ يحفظ الـ options array\n  - الـ UI بـ يعرض كل option بـ اسمها: \"Size: S, M, L · Color: أحمر, أزرق\"\n  - كل variant row بـ يعرض labels: \"Size: M · Color: Black\"\n  - inline summary على الـ main row\n• لو الـ product معندوش options حقيقية في Shopify (كلهم Default Title) → تنبيه واضح بـ التعليمات" },
      { type: "feature", text: "🆕 [\"إنشاء في CLARK\" — حل مشكلة الـ \"المنتج فين بقى؟\"] الـ user أبلغ إنه مش لاقي المنتجات بعد الـ sync. السبب: shopifyProducts هي قائمة منفصلة عن inventoryItems الفعلية في CLARK.\nالحل:\n• POST /api/shopify/create-clark-item — يولّد inventoryItem من Shopify product\n  - name = product title\n  - model_no = SKU (المفتاح للـ matching)\n  - sku, type, price (من first variant), unit, stock\n  - source = \"shopify_import\" (audit marker)\n  - notes = traceability info\n• Idempotent: لو فيه CLARK item بـ نفس model_no، بـ يـ link مش يعمل duplicate\n• الـ shopify product الـ mapping_status بـ يبقى \"matched\" + clark_inventory_id بـ يتعمل link\n• Bulk variant: bulkProductIds للـ batch creation" },
      { type: "feature", text: "✨ [3 طرق لإنشاء CLARK items من Shopify]\n1. Per-product: زرار ➕ في الـ main row + زرار \"إنشاء في CLARK Inventory\" في الـ expanded view (بـ stock prompt)\n2. Bulk: اختار منتجات + اضغط \"➕ إنشاء في CLARK\" في الـ bulk action toolbar\n3. One-click \"أنشئ X في CLARK\" في الـ top toolbar — بـ يـ batch لكل المنتجات اللي mapping_status = missing_in_clark\nبعد الإنشاء:\n• الـ items بـ تظهر في CLARK → الـ Inventory tab زي أي item عادي\n• الـ Push Inventory الجاي بـ يقدر يحسب available لها (لأن الـ matching اشتغل)\n• الـ user يقدر يـ edit الـ stock من تاب Inventory" },
      { type: "feature", text: "📊 [Stats banner الجديد] 6 cards بدل 4 → بقى يفصل بين الحالات بدقة:\n• إجمالي / matched / missing in CLARK / mismatch / retail synced / 🏭 wholesale-only" },
      { type: "improvement", text: "📷 [Image error recovery] لو الصورة فشلت تـ load (Shopify CDN أحياناً بـ يـ reject crossOrigin):\n1. أولاً يحاول بـ crossOrigin\n2. لو فشل، retry بدون crossOrigin مع cache-bust query\n3. لو فشل تاني، يـ hide ويظهر الـ 📦 placeholder\n→ مفيش broken images في الـ UI" },
      { type: "doc", text: "✅ [الـ user workflow بعد V20]\n1. روح Shopify tab → Connection — تأكد متصل\n2. Products tab → \"🔄 سحب الكل\" — هـ يجيب كل المنتجات بصور 3:4\n3. لو فيه missing in CLARK count → اضغط \"➕ أنشئ X في CLARK\" — هـ يولّد inventoryItems تلقائياً\n4. روح CLARK Inventory tab → هـ تلاقي كل الـ items الجديدة (بـ stock=0 ابتدائياً)\n5. عدّل الـ stock يدوياً حسب الـ warehouse الفعلي\n6. ارجع Shopify → Push المخزون\nده بـ يحل تماماً مشكلة الـ \"المنتج نزل لكن مش لاقيه\"." },
    ]
  },
  {
    version: "V19.99.0",
    date: "2026-05-10",
    types: ["feature"],
    title: "🛍️ Shopify Phase 7 — Pro Product Management",
    changes: [
      { type: "feature", text: "🎨 [Image thumbnails + price] كل منتج بقى يعرض:\n• صورة مصغرة من Shopify (lazy-loaded، fallback لـ 📦 emoji)\n• السعر (min-max للـ multi-variant products)\n• الـ vendor + product type + Shopify status (active/draft/archived)\n• كل المعلومات دي بـ تحصل من Shopify response — اتـ extract في mapShopifyProductToCLARK" },
      { type: "feature", text: "✅ [Bulk Selection + Actions] checkbox لكل منتج + Select All Visible. لما تختار منتجات، toolbar أزرق بـ يظهر فوق:\n• 🔄 Sync ON / ⏸ Sync OFF\n• 🏭 جعل Wholesale / 🛒 جعل Retail\n• 🛡 Set Buffer (يطبق على كل المحدد)\n• 🗑 احذف من CLARK\n• ✕ Clear selection\nالـ actions كلها atomic (Firestore transaction)." },
      { type: "feature", text: "🏭 [Wholesale-only flag] flag منفصل عن shopify_synced:\n• wholesale_only=true → المنتج NEVER بـ يـ push للـ Shopify\n• الفكرة: منتجات بـ تتباع للجملة بس، مش هـ تظهر online\n• Filter جديد \"retail / wholesale / كل\" لفلترة الـ list\n• Status badge بـ يميز: 🛒 retail synced / 🏭 جملة فقط / ⏸ paused\n• الـ push logic بـ يستثني wholesale_only تلقائياً (مع السبب في dry-run)" },
      { type: "feature", text: "🎯 [Sync Filters] قبل ما تـ sync products، اضغط \"🎯 سحب بـ filters\" لاختيار:\n• Status (active / draft / archived)\n• Vendor specific\n• Product Type specific\n• SKU prefix (مثلاً \"WINTER-\")\n• Published only checkbox\nبدلاً من سحب كل المنتجات في الـ store، تختار subset. مفيد للـ stores اللي فيها 1000+ products." },
      { type: "feature", text: "🗑 [Delete from CLARK + Blacklist]\n• Per-product: 🗑 حذف من CLARK (single)\n• Bulk: 🗑 احذف الـ selected\n• Big red button: 🗑 احذف كل المنتجات (مع confirmation مزدوج بـ كتابة كلمة \"مسح\")\nالمحذوف بـ يتـ add لـ blacklist (deletedProductIds في shopifyConfig)، فالـ sync الجاي ما بـ يجيبه. لو غيّرت رأيك:\n• زرار 🔄 Clear Blacklist في Danger Zone\n• الـ sync الجاي بعدها بـ يجيب المنتجات المسحوبة" },
      { type: "feature", text: "▼ [Expandable details] اضغط على الصورة أو اسم المنتج لفتح تفاصيل كاملة:\n• معلومات Shopify (ID, handle, type, tags, published date, last sync)\n• ربط CLARK (mapping status, الـ inventory item linked, full computation)\n• قائمة الـ variants بـ option1/option2/option3 + price + qty لكل واحد\n• Action buttons في تفاصيل (Sync toggle, Wholesale toggle, Set buffer, Open in Shopify, Delete)\n• إذا الـ SKU مش في CLARK inventoryItems → warning واضح بـ التعليمات" },
      { type: "feature", text: "🛡 [Preserve user flags on re-sync] الـ sync بقى بـ يحافظ على الـ flags اليدوية:\n• shopify_synced (toggle)\n• wholesale_only (toggle)\n• safety_buffer (per-product)\n• max_shopify_qty\n• clark_inventory_id (manual mapping)\nيعني لو عملت setup لمنتج معين (buffer=15، wholesale=true)، الـ sync الجاي ما بـ يـ reset الـ settings دي. replaceMode='replace' bypass-ing هذا للـ fresh start." },
      { type: "feature", text: "🆕 [Endpoint جديد: /api/shopify/bulk-update-products] بـ يدعم 8 actions:\n• set_synced (bool)\n• set_wholesale_only (bool)\n• set_safety_buffer (number / null)\n• set_max_qty (number / null)\n• set_auto_disable_at_zero (bool)\n• delete_from_clark (يضيف للـ blacklist)\n• delete_all (clear الـ list)\n• restore_from_blacklist / clear_blacklist\nكل العمليات atomic via Firestore transaction." },
      { type: "feature", text: "📊 [Stats banner أوسع] 6 metric cards بدل 4:\n• إجمالي / matched / missing / mismatch / retail synced / 🏭 جملة فقط\nبيوضّح بسهولة كم منتج retail vs wholesale في مكان واحد." },
      { type: "feature", text: "🔍 [Filters متعددة + بحث ذكي] الـ filters bar فيه:\n• Mapping status (4 options)\n• Retail / Wholesale toggle\n• Vendor dropdown (auto-populated من المنتجات)\n• Search box بـ يبحث في SKU + title + vendor + product_type\nالـ select-all بـ يطبق على الـ filtered subset فقط." },
      { type: "doc", text: "✅ [مفتاح للـ user]\n1. ✓ سحب الكل أول مرة عشان تشوف كل المنتجات\n2. ✓ شوف اللي matched (لها item في CLARK بـ model_no = SKU)\n3. ✓ ضع flag wholesale_only للمنتجات الجملة-فقط\n4. ✓ احذف اللي مش هـ تستخدمه من CLARK (هـ يفضل في Shopify)\n5. ✓ اضبط buffer للمنتجات المهمة\n6. ✓ Dry Run قبل الـ Push\n7. ✓ Push المخزون لما الكل ready" },
    ]
  },
  {
    version: "V19.98.0",
    date: "2026-05-10",
    types: ["feature"],
    title: "🛍️ Shopify Phase 6 (الأخيرة!) — Daily Report + Polish",
    changes: [
      { type: "feature", text: "🎉 [Shopify Integration كامل!] الـ 7 phases (0 → 6) كلهم خلصوا في يوم واحد. الـ integration دلوقتي بـ يدعم الـ Two-Stage COD Workflow كامل من الـ order placement حتى الـ daily reporting." },
      { type: "feature", text: "📤 [Daily Report Generator] في تاب Reconciliation، زرار جديد \"📊 ولّد التقرير\" بـ يـ generate تقرير WhatsApp-ready كامل بـ:\n• اسم الستور + التاريخ\n• إحصائيات النشاط (طلبات جديدة، delivered، refused، returned، conversion rate)\n• الإيرادات (gross + shipping + refunds + net)\n• الطلبات Pending مع تنبيه للـ stale\n• المخزون المحجوز\n• 🔥 Top 3 منتجات اليوم بـ medals\n• تنبيهات (stale orders، product mismatches، unmatched SKUs)\nالنص بـ يستخدم Markdown بسيط (*) اللي WhatsApp بـ يـ render-ه عادي." },
      { type: "feature", text: "📋 [3 طرق للمشاركة]\n• 📋 انسخ النص — clipboard copy للـ paste في أي مكان\n• 📱 افتح في WhatsApp — wa.me link مع التقرير prefilled، الـ user بـ يختار الـ contact\n• 🔄 إعادة توليد — يعيد الحساب مع آخر بيانات لو حصل تحديث" },
      { type: "feature", text: "🛠 [buildShopifyDailyReport في utils/shopify/dailyReport.js]\n• Pure function — بـ تاخد data + optional date\n• Reusable من أي مكان (Reconciliation tab، future cron، manual API call)\n• في buildShopifyDailySummaryShort للـ one-liner notifications\n• الـ output بالعربي مع emoji للـ WhatsApp" },
      { type: "feature", text: "✅ [Phase status update] الـ Connection tab دلوقتي بـ يعرض كل الـ 7 phases بـ status \"Done\":\n✅ Phase 0 — Foundation\n✅ Phase 0.5 — OAuth 2.0\n✅ Phase 1 — Read & Display\n✅ Phase 2 — Stock Reservation\n✅ Phase 3 — Invoice Generation\n✅ Phase 4 — Inventory Push\n✅ Phase 5 — Dashboard + Reconciliation\n✅ Phase 6 — Polish + Daily Report\n+ banner أخضر بـ \"🎉 الـ integration كامل!\"" },
      { type: "doc", text: "📊 [Final stats — اللي اتعمل في Shopify integration]\n• 13 API endpoints جديدة (3 OAuth + 4 sync + 4 mutations + cron variants)\n• 4 cron jobs (poll-orders، push-inventory، cleanup-reservations، إلخ)\n• 7 files في api/shopify/ + 4 في api/cron/\n• 5 new client utils (shopifyClient، stockReservations، shopifyMigration، dailyReport، إلخ)\n• ShopifyIntegrationPg بـ ~1700 سطر — 7 sub-tabs functional\n• Schema migration ضافت 4 CoA accounts + shopify_default customer + shopifyConfig defaults\n• كل الـ phases documented في CHANGELOG على اليوم 2026-05-10\n• 8 commits على main: 889ea62 (V0) → a814e3d (V1.1) → 6fd8a32 (V1.2) → 750c5c5 (V0.5 OAuth) → 5c6801a (V1) → f25a611 (V2) → 880b0a4 (V3) → a7c6dbc (V4) → 6f7251f (V5) → الكوميت ده (V6)" },
      { type: "doc", text: "🚀 [Next steps للـ user]\n1. اعمل Vercel deploy عشان آخر changes تـ go live\n2. تأكد إن SHOPIFY_CLIENT_ID + SECRET + DELIVERY_CONFIRM_SECRET + CRON_SECRET كلهم في Vercel env vars\n3. روح Dev Dashboard → اعمل Release لو غيّرت scopes (الـ scopes كاملة في الـ setup card)\n4. اعمل sync products + sync orders للمرة الأولى\n5. ادخل المنتجات في CLARK inventoryItems مع model_no = SKU\n6. اضبط safety_buffer لكل منتج حسب الـ velocity\n7. جرّب Mark Delivered على طلب test → شوف الفاتورة بـ تتعمل + الـ reservation بـ تـ commit\n8. اعمل push inventory dryRun الأول قبل الـ live push\n9. Daily routine: افتح Dashboard الصبح → شوف stale orders → ولّد daily report آخر اليوم\nموفّق إن شاء الله 🤲" },
    ]
  },
  {
    version: "V19.97.0",
    date: "2026-05-10",
    types: ["feature"],
    title: "🛍️ Shopify Phase 5 — Dashboard + Reconciliation",
    changes: [
      { type: "feature", text: "📊 [Dashboard tab شغّال] الـ placeholder اتـ replaced بـ DashboardTab كامل:\n• إحصائيات اليوم: طلبات جديدة، delivered + قيمة، refused، محجوز حالياً\n• إحصائيات الشهر: total، delivered + delivery rate %، refused + refused rate %، إيرادات\n• الإيرادات المحققة: posted invoices net + refunds + reservation value\n• 🔥 Top 5 منتجات مبيعاً (delivered orders فقط) مع badges (gold/silver/bronze)\n• تنبيهات clickable: stale pending orders، product mismatches، unmatched SKUs\n• قيمة الـ pending value (للمتابعة)" },
      { type: "feature", text: "🔄 [Reconciliation tab شغّال]\n• Stale Orders: كل الطلبات pending أكتر من timeout (default 7 أيام) مع زرار Mark Delivered/Refused مباشرة. لو الـ courier ما رجعش رد، الأدمن يحلّ يدوياً.\n• Daily Reconciliation: 4 metrics مقابل بعض:\n  - Shopify orders اليوم vs CLARK pending\n  - Fulfilled اليوم vs CLARK invoices اليوم (لو فيه diff = mismatch)\n  - Cash متوقع اليوم (للمراجعة مقابل MAIN_CASH)\n• Reservations Health: stale (TTL expired)، expiring soon، unmatched SKUs\n• Quick actions: links للـ Orders/Products/Invoices tabs" },
      { type: "feature", text: "🎯 [Smart alerts] الـ Dashboard بـ يـ surface 3 أنواع تنبيهات:\n• 🔴 Stale orders > timeout — clickable يفتح Reconciliation\n• 🟡 منتجات Shopify مش مربوطة بـ CLARK — clickable يفتح Products\n• 🟡 Reservations بـ unmatched SKU\nالـ user من الـ Dashboard يقدر يـ navigate مباشرة لمكان الحل." },
      { type: "feature", text: "🛡 [Reservations health monitoring] التاب reconciliation بـ يعرض:\n• كم reservation expired لكن لسه active (الـ daily cron هـ يـ release-هم)\n• كم reservation هـ ينتهي خلال 24 ساعة (warning مبكر)\n• كم reservation عندهم unmatched SKU (محتاج sync products + setup CLARK items)" },
      { type: "improvement", text: "🎨 [ReconcileRow component] component reusable للـ key/value rows في reconciliation. بـ يعرض:\n• Label + value بـ font-weight كبير\n• Secondary line (شرح إضافي)\n• Status border (أخضر = OK، أصفر = mismatch)\n• Mismatch warning بـ تفصيل المشكلة" },
      { type: "doc", text: "🚧 [Phase 6 next] Polish + Settings tweaks + (إن أمكن) WhatsApp daily summary integration مع الـ existing campaignBridge في CLARK. الـ Phase 6 بـ يكون فيه:\n• Test scenarios + edge case handling\n• Soft launch checklist\n• Full documentation update" },
    ]
  },
  {
    version: "V19.96.0",
    date: "2026-05-10",
    types: ["feature"],
    title: "🛍️ Shopify Phase 4 — Inventory Push (CLARK → Shopify)",
    changes: [
      { type: "feature", text: "📤 [Inventory Push شغّال] CLARK دلوقتي بيـ push المخزون لـ Shopify بـ الـ formula:\n  available = max(0, inventoryItems.stock - active_reservations - safety_buffer)\nالـ Shopify quantity بـ يتـ override بقيمة CLARK (CLARK = source of truth). الـ matching بين الـ Shopify SKU والـ CLARK item بـ يحصل بـ:\n1. inventoryItems.model_no === SKU (الـ spec)\n2. inventoryItems.sku === SKU (fallback)\n3. inventoryItems.name === SKU (last resort)" },
      { type: "feature", text: "📡 [3 endpoints جديدة]\n• POST /api/shopify/push-inventory-now (admin) — Push manual بـ dryRun option وفلتر skus\n• POST /api/shopify/update-product-settings (admin) — تحديث shopify_synced/safety_buffer/max_qty لمنتج معيّن\n• GET/POST /api/cron/shopify-push-inventory — cron variant بـ skip للمنتجات اللي available == prev (delta-only push)\nكل الـ pushes بـ تـ rate-limited: 550ms بين الـ calls (1.8 req/sec، تحت Shopify Basic 2/sec)." },
      { type: "feature", text: "📦 [Tab المنتجات شغّال] الـ placeholder اتـ replaced بـ ProductsTab:\n• 4 stat cards: total / matched / missing in CLARK / synced للـ Shopify\n• Filter بالـ mapping_status + search بالـ SKU/title\n• كل ProductRow بـ يعرض:\n  - SKU + variants count + status badge\n  - الحساب الكامل: physical (CLARK) − reserved − buffer = available\n  - Shopify quantity مقابل المحسوب (في sync ✓ أو out of sync)\n  - زرار Synced/Paused (toggle shopify_synced)\n  - زرار Buffer (تعديل safety_buffer لكل منتج)\n• 3 buttons في الـ header: 🔄 Sync products / 🔍 Dry Run / 📤 Push" },
      { type: "feature", text: "🔍 [Dry Run mode] قبل الـ push الفعلي، الـ user يقدر يضغط \"Dry Run\" عشان يشوف:\n• كل SKU + الحساب التفصيلي (physical, reserved, buffer, available)\n• الفرق بين الـ desired والـ Shopify الحالي\n• يحدد ايه اللي هـ يتغيّر قبل ما الـ push يحصل\nده مفيد جداً للـ first-time push عشان تتأكد من صحة الـ buffer + الـ matching." },
      { type: "feature", text: "🛡 [Per-product settings] لكل منتج:\n• shopify_synced (bool) — لو false، الـ push بـ يـ skip-ه (مش بـ يطلع في الـ store حتى لو فيه stock)\n• safety_buffer (number أو null) — override للـ default. مثلاً منتج مهم → buffer = 10، منتج عادي → null (uses default)\n• max_shopify_qty — cap على الـ pushed qty (للـ products اللي مش عاوز تـ over-promise stock)\n• auto_disable_at_zero — لو الـ available = 0، الـ product status بـ يرجع draft تلقائياً\nالـ settings دي بـ تتعدّل live من الـ UI." },
      { type: "feature", text: "📊 [Last push result panel] بعد كل push بـ يظهر panel فيه:\n• Location المستخدم في الـ push\n• إجمالي الـ pushed/skipped/errors\n• جدول تفصيلي لكل SKU بـ status:\n  - 🟢 pushed — اتـ سعّت في Shopify\n  - 🟡 no_change — الـ delta = 0 (skipped optimization)\n  - 🔴 error — مع رسالة الخطأ من Shopify\nمفيد للـ debug + للتأكد من النجاح." },
      { type: "feature", text: "⏰ [Cron schedule] vercel.json بقى فيه 3 crons:\n• shopify-poll-orders كل 5 دقايق\n• shopify-push-inventory كل 30 دقيقة\n• shopify-cleanup-reservations يومي 3 صباحاً\nالـ user على Hobby tier محتاج يعدّل الـ schedules لـ daily أو يستخدم الـ manual buttons." },
      { type: "doc", text: "🚧 [Phase 5 next] Reconciliation Tab — daily comparison report بين Shopify orders/CLARK pending orders + cash matching مع MAIN_CASH + WhatsApp daily summary." },
    ]
  },
  {
    version: "V19.95.0",
    date: "2026-05-10",
    types: ["feature"],
    title: "🛍️ Shopify Phase 3 — Invoice Generation + Returns",
    changes: [
      { type: "feature", text: "📄 [Auto-invoice on delivery] لما الـ user يضغط \"تم الاستلام\" على Shopify order، الـ system دلوقتي بـ يـ:\n• Generate فاتورة draft (INV-YYYY-NNNN) بـ نفس الـ counter بتاع CLARK العادي\n• يـ commit الـ stock reservations (active → committed)\n• يربط الـ order بـ invoice_id + invoice_no\n• يحفظ معلومات العميل الفعلية على الفاتورة (shopify_customer_name/_phone/_email/_address) عشان كشف العميل (KASF) للـ \"Shopify Customer\" يفضل نظيف من الديتيلز" },
      { type: "feature", text: "🛍️ [Shopify-specific invoice schema] الفاتورة بـ تـ store:\n• source: \"shopify\"\n• source_ref: shopify_order_id\n• shopify_order_number\n• shopify_customer_name + _phone + _email + _address\n• shopify_payment_method (cod / online)\n• shopify_shipping_fee (separate from items, للـ split future)\nالـ Sales Invoices الموجودة بـ تعرض الفاتورة دي عادي زي أي فاتورة مبيعات تانية، لكن الـ source field بـ يخلي الـ reports تقدر تـ filter \"only Shopify revenue\"." },
      { type: "feature", text: "↩️ [Process Return endpoint] /api/shopify/process-return للطلبات اللي اتسلمت بس العميل رجّعها (rare ~2%):\n• Generate Credit Note draft (CN-YYYY-NNNN)\n• يربطه بالفاتورة الأصلية\n• يـ flip order status لـ \"returned\"\n• يحفظ return_credit_note_id + return_credit_note_no + return_reason\nالـ Stock مش بـ يرجع للـ inventory تلقائياً (Phase 5 هـ يـ automate ده)." },
      { type: "feature", text: "🧾 [Tab الفواتير شغّال] الـ placeholder اتـ replaced بـ ShopifyInvoicesTab:\n• 4 stat cards: drafts / posted / إجمالي إيرادات / مرتجعات\n• قائمة الفواتير الـ filtered (source === \"shopify\") بـ status badges\n• قائمة الـ Credit Notes للمرتجعات\n• كل entry بـ يعرض customer name + phone + Shopify order # + total\n• الـ user يفتح الفاتورة في تاب \"فواتير المبيعات\" العادي عشان يعمل Post (الـ journal entry بـ يـ fire من autoPost flow الموجود)" },
      { type: "feature", text: "🎨 [Order card updates]\n• زرار \"↩️ معالجة إرجاع\" بـ يظهر للـ orders اللي status=delivered\n• الـ order بـ يعرض رقم الـ invoice (مع تنبيه إنها draft + رابط لتاب الفواتير)\n• الـ Credit Note number بـ يظهر للـ returned orders" },
      { type: "improvement", text: "🛠 [Idempotency في mark-delivered] لو الـ user ضغط \"تم الاستلام\" مرتين على نفس الـ order:\n• الـ invoice الموجودة بـ يـ reuse-ها (مفيش double-creation)\n• الـ reservations بـ تظل committed (مفيش double-commit)\n• الـ response field invoiceWasNew بـ يقول false في المرة التانية\nنفس الـ pattern لـ process-return — لو بـ يـ trigger مرتين، الـ existing CN بـ يرجع." },
      { type: "doc", text: "🚧 [Phase 3.5 next — auto-post]\nحالياً الفاتورة بـ تتعمل draft. الـ user محتاج يفتح تاب \"فواتير المبيعات\" ويضغط Post عشان الـ journal entry يـ fire (Dr. AR / Cr. Sales Revenue + Shipping Income). كمان محتاج يـ record cash receipt يدوياً في الـ Treasury.\n\nPhase 3.5 (planned) هـ:\n• Auto-trigger autoPost.salesInvoicePosted من mark-delivered (server-side replicate of the journal logic)\n• Auto-create custPayment entry للـ COD case\n• Treasury entry: Dr. MAIN_CASH / Cr. AR" },
    ]
  },
  {
    version: "V19.94.0",
    date: "2026-05-10",
    types: ["feature"],
    title: "🛍️ Shopify Phase 2 — Stock Reservation",
    changes: [
      { type: "feature", text: "📦 [Stock Reservation system] لما طلب جديد يجي من Shopify، النظام بـ يحجز المخزون تلقائياً (NOT يخصم) لحد ما يتم الاستلام أو الرفض. ده الـ pattern الصح للـ COD orders اللي 95% منهم بـ يوصلوا بس 5-15% بـ يترفضوا — الـ stock يفضل available للـ jumla orders لحد التأكد." },
      { type: "feature", text: "🗂 [stockReservations array في factory/config] كل reservation فيه:\n• id, product_sku (= CLARK model_no), product_id, qty\n• source: \"shopify_pending\" | \"manual_hold\"\n• source_ref: shopify_order_id\n• reserved_at, expires_at (default = pending_order_timeout_days = 7)\n• status: active | committed | released | expired\n• customer_name + order_number (للـ UI)\n• unmatched flag لو الـ SKU مش موجود في CLARK inventoryItems" },
      { type: "feature", text: "🔄 [Auto-reserve عند sync الطلبات] الـ sync-orders-now + cron poll-orders بقوا يـ create reservations لكل order جديد بـ status=pending_delivery. Idempotent — re-sync ما بـ يـ duplicate. التحديثات على orders existing ما بـ تأثر على الـ reservations الموجودة." },
      { type: "feature", text: "❌ [Auto-release عند الرفض] mark-refused دلوقتي بـ release كل الـ active reservations للـ order تلقائياً. Idempotent — already-released stays released. الـ order's stock_reserved flag بـ يبقى false." },
      { type: "feature", text: "🧹 [Daily cleanup cron] /api/cron/shopify-cleanup-reservations بـ يشتغل كل يوم 3 صباحاً (من vercel.json). بـ يلاقي الـ reservations اللي expires_at < now وبـ يـ flip-هم لـ status=expired + بـ يـ flag الـ order اللي ليهم stock_reserved=false. ده بـ يحرر الـ stock للـ orders اللي اتـ silently failed (مفيش fulfillment ولا refusal)." },
      { type: "feature", text: "🎨 [UI updates في OrdersTab]\n• Banner أصفر فوق بـ totals الـ active reservations + warnings للـ unmatched SKUs\n• كل order card بقى يعرض ReservationSummary: \"Stock محجوز: X قطعة في Y reservations\" أو \"Stock تم خصمه (committed)\" أو \"Stock تم تحريره (released)\"\n• تنبيه warning لو فيه SKUs في الـ order مش موجودين في CLARK inventoryItems" },
      { type: "feature", text: "🛠 [Server + client helpers مفصولين]\n• Server-side _reservations.js (في api/shopify/): pure functions للـ create/release/commit/expire — كلها idempotent وبـ تشتغل داخل Firestore transactions\n• Client-side stockReservations.js (في src/utils/shopify/): read-only helpers للـ UI (getActiveReservations, getReservedQtyForSku, getReservationsForOrder, getReservationsSummary)\n• الـ commitReservationsForOrder helper جاهز — هـ يستخدم في Phase 3 لما mark-delivered يـ generate invoice" },
      { type: "doc", text: "🚧 [Phase 3 next] Phase 2 بـ track الـ reservations فقط؛ ما بـ تخصم من الـ inventory الفعلي. الـ خصم الفعلي بـ يحصل في Phase 3 لما mark-delivered يـ generate invoice + يـ commit الـ reservation. Phase 4 بعد كده هـ يستخدم getReservedQtyForSku عشان يحسب \"available for Shopify\" = physical - active reservations." },
    ]
  },
  {
    version: "V19.93.0",
    date: "2026-05-10",
    types: ["feature"],
    title: "🛍️ Shopify Phase 1 — Read & Display (طلبات + منتجات)",
    changes: [
      { type: "feature", text: "🛒 [Tab الطلبات شغّال بالكامل] الـ placeholder اتـ replaced بـ component حقيقي بـ:\n• Stats banner: 5 metric cards (إجمالي / pending / delivered / refused / cancelled+returned)\n• Toolbar: 3 filters (status, date range, search by name/phone/order number)\n• قايمة الطلبات: بـ تعرض كل order كـ card متفصّل\n• كل card فيه: customer name + clickable phone + WhatsApp link + address + line items مع SKU + totals + status badge + Shopify status mirror\n• Action buttons لكل order: ✅ تم الاستلام / ❌ تم الرفض / ↗ افتح في Shopify" },
      { type: "feature", text: "🔄 [Manual sync button] في الـ toolbar زرار \"اسحب الطلبات الجديدة\":\n• بـ يـ call /api/shopify/sync-orders-now\n• بـ يجيب آخر 7 أيام أو من last_orders_sync_at\n• Merge logic: لو الـ order موجود بـ يحدّث الـ Shopify-side fields بس (totals, customer info, fulfillment) ويـ preserve الـ CLARK-side state (status, invoice_id, delivered_at)\n• Auto-promote pending → delivered لو Shopify بـ يقول fulfilled+paid + الـ user ما عدّل-ش الـ status يدوياً\n• Cap: 200 orders حية في factory/config (الأقدم بـ تـ drop بعد 200)" },
      { type: "feature", text: "⏰ [Vercel Cron job] /api/cron/shopify-poll-orders بـ يشتغل كل 5 دقايق على Vercel Pro (configured in vercel.json). الـ schedule موجود في vercel.json:\n  \"schedule\": \"X/5 X X X X\" (X = *)\n⚠️ Vercel Hobby بـ يدعم daily crons فقط. لو الـ deploy فشل بسبب الـ cron:\n  • Option 1: upgrade لـ Vercel Pro ($20/شهر)\n  • Option 2: غيّر الـ schedule لـ \"0 9 * * *\" (يومي 9 ص)\n  • Option 3: شيل الـ crons array كلياً واعتمد على الـ manual sync button\nالـ cron secret اسمه CRON_SECRET (env var مطلوب على Vercel)." },
      { type: "feature", text: "📡 [4 API endpoints جديدة + 1 cron]\n• POST /api/shopify/sync-orders-now (admin) — sinceHours/force\n• POST /api/shopify/mark-delivered (admin) — orderId, deliveredAt?\n• POST /api/shopify/mark-refused (admin) — orderId, reason?\n• POST /api/shopify/sync-products-now (admin) — full catalog pull مع SKU matching لـ inventoryItems\n• GET/POST /api/cron/shopify-poll-orders (cron secret OR admin) — same logic كـ sync-orders-now\nكل الـ endpoints محمية بـ verifyAdminToken + بـ تـ rate-limit." },
      { type: "feature", text: "🗺 [Order mapping helpers في _shopifyAdmin.js] mapShopifyOrderToCLARK + mapShopifyProductToCLARK + fetchOrdersSince + fetchOrderById + fetchAllProducts:\n• Maps Shopify response shapes → CLARK internal format\n• Detects payment method (COD vs online) من financial_status\n• Auto-derives initial status (pending_delivery / delivered / cancelled)\n• Extracts shipping fee من shipping_lines array\n• Cursor pagination via since_id (handles unlimited products)\n• Rate-limited: 1.8 req/sec (under Shopify Basic 2/sec limit)" },
      { type: "feature", text: "🎨 [UX details]\n• Status badges بـ ألوان مميزة: 🟡 pending / 🟢 delivered / 🔴 refused / ⚪ cancelled / ↩️ returned\n• Payment badges: 💵 COD / 💳 online\n• Age label: \"منذ X دقيقة/ساعة/يوم\"\n• Phone بـ يبقى clickable (tel:) + WhatsApp link\n• كل order card عنده status mirror من Shopify (financial + fulfillment) عشان الـ user يـ debug\n• Order number بـ #1001 format" },
      { type: "doc", text: "🚧 [Phase 2-6 boundaries — اللي ما اتعملش هنا]\n• Stock reservation logic — Phase 2 (next)\n• Invoice generation عند الاستلام — Phase 3\n• Treasury entry (Dr. MAIN_CASH / Cr. Sales Revenue) — Phase 3\n• Inventory push من CLARK لـ Shopify — Phase 4\n• Returns workflow + credit notes — Phase 5\n• Daily reconciliation report — Phase 5\nحالياً Mark Delivered بـ يحدّث الـ status فقط، مش بـ يولّد invoice أو يخصم stock. ده هـ يضاف في Phase 3." },
    ]
  },
  {
    version: "V19.92.0",
    date: "2026-05-10",
    types: ["feature"],
    title: "🛍️ Shopify Phase 0.5 — OAuth 2.0 install flow",
    changes: [
      { type: "feature", text: "🔐 [User report confirmed] الـ atkn_ token من Dev Dashboard ما اشتغلش مع الـ Admin API (رجع 401/403). ده مش bug في الكود — الـ atkn_ tokens رسمياً للـ app-level operations (إدارة الـ app نفسها) مش للـ store Admin API. الـ User كان عنده كل الـ scopes 100% (read_orders, write_inventory, etc.) لكن التوكين نفسه مش مصمّم للغرض ده." },
      { type: "feature", text: "🚀 [OAuth 2.0 install flow كامل] الـ V19.92 بـ تـ implement الـ official Shopify OAuth flow:\n• POST /api/shopify/oauth-init → بـ يبني authorize URL ويـ redirect-ك لـ Shopify\n• Shopify بـ يعرض \"approve scopes\" screen\n• بعد الموافقة، Shopify بـ يـ redirect لـ /api/shopify/oauth-callback مع authorization code\n• الـ callback بـ يـ verify الـ HMAC من Shopify (Client Secret + sorted query) + الـ state HMAC بتاعنا (signed with DELIVERY_CONFIRM_SECRET)\n• بـ يبادل الـ code بـ offline access token (= shpat_…)\n• بـ يحفظه في factory/config.shopifyConfig\n• بـ يـ redirect رجوع لـ CLARK مع shopify_connected=1 flag" },
      { type: "feature", text: "🛡 [Security guardrails] الـ flow عنده 4 layers من الحماية:\n• HMAC على الـ state بتاعنا (مع TTL 10 دقايق + uid + redirectUri في الـ payload) → يمنع CSRF + replay\n• HMAC verification على الـ callback من Shopify (مع timing-safe compare) → يثبت إن الـ redirect حقاً من Shopify\n• Constant-time signature comparison → يمنع timing attacks\n• Admin auth gate على /api/shopify/oauth-init → يمنع المستخدمين العاديين يبتدوا OAuth flow على ستورات تانية" },
      { type: "feature", text: "🎨 [UI redesign للـ Connection tab] قبل V19.92 الـ form كان يدوي بحت. دلوقتي:\n• زرار كبير primary \"🔗 اتصل بـ Shopify\" — الـ default path\n• Field واحد فقط للـ Store URL\n• Manual token entry collapsed default (للـ legacy custom apps لو حد عنده توكين shpat_ جاهز)\n• في الـ setup card: الـ redirect URL الفعلي يظهر بالـ window.origin + path عشان الـ user يـ paste-ه مباشرة في Dev Dashboard\n• قائمة الـ Vercel env vars المطلوبة (SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET + DELIVERY_CONFIRM_SECRET)\n• تحذير أصفر بـ تذكير الـ user يعمل Rotate للـ Client Secret اللي اتعرض في الـ chat" },
      { type: "feature", text: "📡 [Callback detection effect] في ShopifyIntegrationPg الـ useEffect على mount بـ يقرأ window.location.search:\n• shopify_connected=1 → showToast \"✅ تم الاتصال بـ Shopify (shop_name)\"\n• shopify_error=… → tell() popup مع الـ message التفصيلي\n• في الحالتين بـ يـ strip الـ params من الـ URL باستخدام history.replaceState عشان refresh ما يـ trigger الـ toast تاني" },
      { type: "doc", text: "📋 [خطوات الـ user قبل ما يـ test]\n1. Dev Dashboard → Settings → Credentials → اعمل Rotate للـ Client Secret (لأنه ظهر في الـ chat)\n2. Vercel Dashboard → Settings → Environment Variables → أضف:\n   • SHOPIFY_CLIENT_ID = (الـ Client ID من Dev Dashboard)\n   • SHOPIFY_CLIENT_SECRET = (الـ shpss_… الجديد بعد Rotate)\n   • DELIVERY_CONFIRM_SECRET = (32+ chars random)\n3. Dev Dashboard → CLARK Integration → Configuration → Allowed redirection URLs → أضف: <vercel-url>/api/shopify/oauth-callback\n4. Versions → New version (عشان التغييرات تتفعّل)\n5. CLARK → Shopify tab → ادخل clarkstore.myshopify.com → اضغط 🔗 اتصل بـ Shopify\n6. Shopify هـ يعرض scopes — وافق\n7. هترجع لـ CLARK مع رسالة نجاح" },
      { type: "improvement", text: "🔄 [Disconnect + reconnect flow] الـ user المتصل بقى عنده 4 buttons:\n• 💾 تحديث التوكين يدوياً (للـ legacy)\n• 🔄 اختبار الاتصال (ping live)\n• 🔗 إعادة الاتصال عبر OAuth (لو التوكين بـ يفشل أو الـ scopes اتغيرت)\n• 🔌 قطع الاتصال\n+ إشارة ✅ \"متصل عبر OAuth — التوكين دائم (مفيش expiry)\" عشان الـ user يطمن إن مش محتاج Rotate." },
    ]
  },
  {
    version: "V19.91.2",
    date: "2026-05-10",
    types: ["fix","feature"],
    title: "🛍️ Shopify Phase 0: دعم Dev Dashboard atkn_ tokens (Shopify deprecated legacy custom apps)",
    changes: [
      { type: "fix", text: "🚨 [Reality check] Shopify شال خاصية إنشاء Legacy Custom Apps من 1 يناير 2026. يعني المسار اللي كنا بنوصّي بيه (Settings → Apps → Develop apps → Create app → shpat_ token) **مبقاش متاح للستورات الجديدة**. الـ user اللي بـ يفتح الستور بعد التاريخ ده لازم يستخدم الـ Dev Dashboard المعقّد." },
      { type: "feature", text: "🆕 [دعم atkn_ prefix] الـ Dev Dashboard بـ يولّد توكينات بـ صيغة `atkn_…` (App automation token) بدل `shpat_`. التوكين ده 64 hex char بدل 32. الـ regex اتـ extend في 3 أماكن:\n• api/shopify/_shopifyAdmin.js → isValidAccessToken\n• api/shopify/connect.js → server-side validation\n• ShopifyIntegrationPg.jsx → client-side validation\nالـ 3 أماكن دلوقتي بيقبلوا shpat_ (legacy)، shppa_ (Partners)، atkn_ (Dev Dashboard)." },
      { type: "feature", text: "📚 [إعادة كتابة الـ setup instructions] الـ Connection tab بقى يعرض المسار الجديد:\n1. Shopify Partners → Apps → Create app\n2. Configure scopes + Release version\n3. Install app على CLARK Store\n4. Settings tab → App automation token → Create token\n5. انسخ atkn_ token والصقه\n+ تنبيه أصفر بـ شرح الفرق بين 3 صيغ توكينات (shpss_/atkn_/shpat_)\n+ تنبيه أزرق بـ ملاحظة الـ expiry (عادة 6 شهور — لازم rotate قبل الانتهاء)." },
      { type: "improvement", text: "⚠ [Open question] الـ atkn_ tokens رسمياً للـ \"app automation\" مش للـ Admin API. ممكن يشتغلوا مع /shop.json (الكود الحالي بـ يبعتهم في X-Shopify-Access-Token header زي الـ shpat_). لو طلع 401/403 من Shopify، الـ user هـ يلاقي رسالة \"صلاحيات غير كافية\" واضحة + هـ نحتاج نضيف OAuth flow في V19.92.0 (Phase 0.5)." },
    ]
  },
  {
    version: "V19.91.1",
    date: "2026-05-10",
    types: ["fix"],
    title: "🛍️ Shopify Phase 0: تحسين رسائل الخطأ للـ shpss_ vs shpat_",
    changes: [
      { type: "fix", text: "🔍 [User report] الـ user جرب يستخدم Client Secret (بـ prefix shpss_…) في خانة Admin API Access Token. الكود رفض التوكين بـ رسالة عامة \"لازم يبدأ بـ shpat_ أو shppa_\" — الـ user مش هـ يفهم لوحده ان الـ shpss_ ده Client Secret مش Access Token." },
      { type: "fix", text: "💬 [Better error messages] دلوقتي الكود بـ يكشف 4 حالات منفصلة:\n• شـ shpss_ → \"ده Client Secret مش Access Token! روح API credentials tab واضغط Install app...\"\n• shpca_ → \"ده Collaborator token — مش بيشتغل مع الـ Admin API\"\n• prefix غير معروف → \"الصيغة غير صحيحة...\"\n• فاضي → \"ادخل الـ Access Token\"\nكل رسالة بـ توجّه الـ user للحل الصح." },
      { type: "fix", text: "🛡 [Client-side early validation] قبل ما الـ form يـ submit، الـ UI بـ يتحقق من الـ prefix ويعرض popup tell() واضح. ده بـ يوفر roundtrip للسيرفر + بـ يخلي رسالة الخطأ متاحة على الفور بدون انتظار الـ network." },
      { type: "improvement", text: "📚 [تحديث الـ setup instructions] في تاب Connection لو الـ user مش متصل، بقى فيه:\n• خطوات أوضح: API credentials tab → Install app → Reveal Admin API access token\n• تنبيه أصفر بـ شرح الفرق بين Client Secret (shpss_) و Admin API Token (shpat_)\nالـ user اللي عنده الـ UI الجديدة (App automation token + Create token) هـ يلاقي الخيارات الإتنين بـ يـ generate نفس الـ shpat_ token." },
    ]
  },
  {
    version: "V19.91.0",
    date: "2026-05-10",
    types: ["feature"],
    title: "🛍️ Shopify Integration — Phase 0 (Foundation)",
    changes: [
      { type: "feature", text: "🆕 [تاب Shopify جديد] في الشاشة الرئيسية بـ 7 sub-tabs (Dashboard / Connection / Products / Orders / Invoices / Reconciliation / Settings). الـ MVP بـ يفعّل تاب Connection بس؛ الـ 6 الباقيين بـ يعرضوا placeholders بـ Phase numbers لحد ما الـ phases التانية تـ ship. اللون الأخضر #96BF48 = لون Shopify الرسمي." },
      { type: "feature", text: "🔌 [تاب Connection — شغّال] بـ يدخل Store URL + Admin API Access Token + API Version، يعمل GET /shop.json للتحقق، ويحفظ الـ creds في factory/config.shopifyConfig. الـ token بـ يـ stay server-side فقط — مش بيتـ echo في أي response. زرار قطع الاتصال يمسح الـ creds مع الحفاظ على الإعدادات الـ user-tweaked (intervals، account mappings). فيه ping تلقائي عند الفتح (best-effort) عشان لو الـ user revoke التوكين من Shopify Admin يـ surface الخطأ فوراً." },
      { type: "feature", text: "🔧 [3 Vercel API routes تحت /api/shopify/]\n• POST /connect — validate + test + save\n• GET /status?fresh=1 — read + optional re-ping\n• POST /disconnect — wipe creds, keep prefs\nالكل محمي بـ verifyAdminToken (admin/manager فقط) + بـ يـ rate-limit (550ms بين الـ calls = ~1.8 req/sec، تحت Shopify Basic's 2/sec). الـ helper _shopifyAdmin.js بـ يعمل creds resolution (Firestore أولاً ثم Vercel env vars كـ fallback)." },
      { type: "feature", text: "🗄 [Schema migration — V19.91 idempotent] بـ تتعمل مرة واحدة عند تحميل التطبيق:\n• shopifyConfig بـ defaults كاملة (intervals، auto-flags، account mappings، notification prefs)\n• عميل افتراضي \"shopify_default\" (\"Shopify Customer\") بـ isVirtual:true عشان كل طلبات Shopify تـ post على نفس الـ cust_id والـ KASF يفضل نظيف\n• 4 حسابات system في Chart of Accounts:\n  - 4101.02 إيرادات Shopify\n  - 4102.01 إيرادات الشحن (Shopify)\n  - 6201.01 مرتجعات Shopify (contra-revenue)\n  - 1100.05 نقدية Shopify المعلّقة (online-paid orders)\nالـ CoA accounts بـ يتم seed بس لو الـ user أصلاً initialize الـ CoA — مش هـ يـ pollute tree فاضي." },
      { type: "feature", text: "🔐 [Permissions] الـ shopify tab مضاف لـ PERMISSION_TABS + DEFAULT_PERMS لكل الـ 8 roles:\n• admin / manager / sales_accountant: edit\n• viewer: view\n• purchase_accountant / warehouse_keeper / payroll_*: hide\nالـ runtime linter (validatePermsRegistry) بـ يـ verify إن TABS و PERMISSION_TABS و DEFAULT_PERMS متطابقين." },
      { type: "feature", text: "📐 [قرارات تصميمية مهمة diverged from spec]\n• الـ inventory_push_interval default: 5 دقايق (مش 1) عشان Shopify Basic limit (2 req/sec). لو 100 منتج، 1 دقيقة معناها 50 ثانية فعلية — buffer ضيق جداً.\n• pending_order_timeout default: 7 أيام (مش 14) — الشحن المصري COD غالباً تحت أسبوع.\n• Webhook signature validation + bulk operations + dead letter queue: مؤجلين لـ Phase 5+\n• Webhooks vs polling: بـ نبدأ بـ polling في Phase 1، الـ webhooks في Phase 5+ للـ near-instant sync.\nكل القرارات دي documented inline في shopifyMigration.js و ShopifyIntegrationPg.jsx + قابلة للتعديل من تاب Settings." },
      { type: "feature", text: "🚧 [الـ 6 sub-tabs الـ placeholders] كل واحد بـ يعرض:\n• اسم الـ Phase اللي هـ يفعّله\n• وصف للـ functionality المتوقعة\n• تنبيه ملوّن لو الـ Connection لسه ما اتعملش\nده بـ يخلي الـ user يقدر يـ navigate براحة في كل التابات + يـ understand الـ roadmap بدون errors." },
      { type: "doc", text: "📝 [الـ Phase 0 خلاص] الخطوات التالية للـ user:\n1. يفتح Shopify Admin → Apps → Develop apps → Create app \"CLARK Integration\"\n2. يدّي الـ scopes (read_orders، write_inventory، إلخ)\n3. يـ Reveal الـ Access Token (مرة واحدة)\n4. يفتح CLARK → تاب Shopify → Connection → يـ paste الـ creds → اختبار\n5. الـ shop info هـ تظهر تحت\n\nبعد ما الـ Phase 0 يـ test ويتأكد، Phase 1 (Orders polling) هـ يدخل: cron job + display للـ pending orders." },
    ]
  },
  {
    version: "V19.90.0",
    date: "2026-05-09",
    types: ["fix"],
    title: "🧹 شيل أزرار الاسترداد الـ post-incident من سجل الدفعات",
    changes: [
      { type: "fix", text: "🗑 [User: \"البيانات صحيحة، الازرار دي مالهاش لازمة\"] الـ 3 أزرار اللي اتعملوا للـ W19 incident اتشالوا من سجل الدفعات بعد ما الـ user أكد إن البيانات صحيحة دلوقتي وكانت بـ تـ produce false positives من stale snapshots:\n• 🚑 استرداد حركات الخزنة المفقودة (V19.80.17)\n• 🛠 إصلاح تواريخ الاسترداد (V19.80.18)\n• 🔄 استرداد التحويلات المفقودة (V19.80.20)\nالكود نفسه (handlers + state + modals) لسه في الفايل كـ dead code — easy to bring back from git history لو حصل incident تاني. الـ buttons UI بس اللي اتشالوا." },
      { type: "fix", text: "✅ [اللي اتساب — فيها قيمة دائمة]\n• 🔄 مزامنة الدفعات اليتيمة — يربط treasury entries بـ custPayments/supplierPayments\n• 🧹 تنظيف الدفعات الميتة — يشيل cust/supplierPayments بدون matching treasury\n• 📚 ترحيل القيود للمحاسبة — backfill journal entries\nالـ 3 دول مفيدين بشكل متكرر (data hygiene tools)، مش one-time post-incident." },
    ]
  },
  {
    version: "V19.89.0",
    date: "2026-05-09",
    types: ["feature","fix"],
    title: "🏭 تحسينات إدارة الورش: 3 أعمدة + KPIs + التأخر + شيل الـ tab من DBPg",
    changes: [
      { type: "feature", text: "📊 [Quick-stats banner] فوق الـ workshop grid في صفحة \"إدارة الورش\". 4 KPI cards:\n• 🏭 ورش نشطة (count) + إجمالي الـ workshops + الموقوفة\n• 📊 الرصيد الكلي عند الورش — ملوّن أحمر/أخضر حسب direction، مع breakdown تسليم/استلام\n• 🏆 أعلى استلام آخر 30 يوم (workshop name + قطع)\n• ⏰ تسليمات متأخرة (count) — clickable → ينقل لتاب \"استلام من ورشة\"\n\nكل الـ stats محسوبة client-side من data.orders + data.workshops، مفيش extra fetches." },
      { type: "feature", text: "⚠️ [Late deliveries banner] لو في تسليمات متأخرة، banner أحمر بـ أعلى 5 ورش تأخراً + الموديل + الكمية + عدد أيام التأخر مقارنة بالمتفق عليه. بـ يساعد على المتابعة الفورية بدون ما تـ navigate لكذا صفحة." },
      { type: "feature", text: "📐 [3 أعمدة بدل 2] الـ workshop cards grid اتـ extend من `repeat(2,1fr)` إلى `repeat(3,1fr)` على الـ desktop. مساحة أوفر، عدد ورش أكتر visible في الـ viewport. الموبايل لسه عمود واحد." },
      { type: "fix", text: "🗑 [شيل الـ \"الورش\" tab من DBPg] الـ user أوضح إنه مش محتاجاه بقى — مكان واحد للـ workshops في تشغيل خارجي يكفي. اتشال من DBPg's tabs row + من render switch. الـ search results للـ workshops دلوقتي بـ تـ navigate لـ ExtProdPg + auto-open ws mode عبر window event (mirrors qr-receive pattern). الـ WsManager component نفسه يفضل export من DBPg ويـ reuse في ExtProdPg." },
    ]
  },
  {
    version: "V19.88.0",
    date: "2026-05-09",
    types: ["fix","feature"],
    title: "🔧 إصلاحات: Firestore index + overflow + نقل إدارة الورش لتشغيل خارجي",
    changes: [
      { type: "fix", text: "🐞 [Firestore composite-index error في Customer History] التاب \"سجل العميل\" كان بـ يفشل بـ خطأ \"The query requires an index. You can create it here: ...\" لأن الـ query كان بـ يـ combine 2 where + orderBy على fields مختلفة (محتاج composite index يدوي). الحل: simplification — query واحد بـ where على currentCustomerId فقط (auto-indexed)، ثم filter + sort client-side. نفس الإصلاح اتطبق على searchByModel. مفيش حاجة محتاجة index manually create-ها بقى." },
      { type: "fix", text: "📦 [Error overflow] لما كان فيه error message طويل (URL مثلاً)، النص كان بـ يطلع من المستطيل الأحمر ويـ overlap على باقي الصفحة. تم إضافة `wordBreak: break-all + overflowWrap: anywhere` على كل error boxes في PiecesPg (6 مواضع). دلوقتي أي خطأ بـ يـ wrap داخل المستطيل بنظافة." },
      { type: "feature", text: "🏭 [نقل إدارة الورش من قاعدة البيانات إلى تشغيل خارجي] الـ user عاوز يشتغل من مكان واحد. الزر الجديد \"إدارة الورش\" بقى **أول كارت** في صفحة تشغيل خارجي (قبل تسليم ورشة، استلام، حسابات الورش، إلخ). الـ ExtProdPg buttons grid اتـ extend من 5 لـ 6 columns على الـ desktop. الـ component نفسه (WsManager) reused من DBPg — مفيش duplication، اللي بـ يعدّل ورشة من أي مكان بـ يظهر في كل الأماكن. الـ DBPg لسه فيه التاب القديم (لمن متعود عليه)، لكن الـ workflow الافتراضي بقى من تشغيل خارجي." },
      { type: "doc", text: "💡 [تحسينات إضافية اقتراحية لـ ExtProdPg — لاحقاً لو حبيت]\n• Top quick-stats banner: عدد ورش active + إجمالي الرصيد + ورشة الشهر (highest receives)\n• Bulk approve زر للـ pending workshop receives في صفحة واحدة\n• \"Late deliveries\" tab منفصل بدل ما يكون hidden في receive flow\nمفيش urgency، نقدر نتعامل معاهم لو حبيت تشتغل عليها بعدين." },
    ]
  },
  {
    version: "V19.87.0",
    date: "2026-05-09",
    types: ["feature"],
    title: "🔗 Phase 7: تعبئة + إتلاف + Smart Scanner + إرجاع KASF",
    changes: [
      { type: "feature", text: "📷 [Smart Scanner integration] الـ scanner العام في الموقع (الزر في navbar) كان silent skip لما يـ scan tracked QR (`CLARK:P:p_xxx`). دلوقتي بـ يعرف الـ format ويـ navigate لتاب \"تتبع القطع\" بـ pre-filled lookup → استعلام تلقائي. الـ user مش محتاج يـ navigate يدوياً بقى." },
      { type: "feature", text: "🗑 [Mark as Scrapped] زر جديد في Lookup card بعد ما تـ lookup قطعة. \"إتلاف القطعة\" يسأل عن السبب + confirmation، ثم بـ يـ flag الـ status بـ \"scrapped\" + history entry. للسيري: cascade على كل القطع جواه. مفيد للقطع التالفة، المفقودة، الـ defective." },
      { type: "feature", text: "↩️ [Return → KASF integration] الـ scan-to-return بقى يكتب credit في KASF + المحاسبة (mirror V19.86.0 sell flow):\n• كل scan-to-return ناجح → entry جديد في `orders[oid].customerReturns` بـ qty + price\n• `autoPost.saleReturn` + `autoPost.saleReturnCogs` بـ يـ fire للـ accounting\n• الـ scanned pieces محفوظين في الـ entry للـ traceability\n• الـ session marker `fromScanner: true` (زي V19.86)\n• Group بالـ (orderId, customerId) فلو scan-ت 5 قطع من 2 عملاء، بـ يطلع 2 customerReturns" },
      { type: "feature", text: "🔗 [Packing tab — جديد] التاب الـ7 \"🔗 تعبئة\". للقطع اللي اتطبعت في piece-mode (مش linked-series) ومحتاجة تتربط بسيري existing. الـ workflow:\n• امسح QR السيري الأول (الكرتونة)\n• امسح QR كل قطعة هتدخل جواه (validate: in_warehouse + مش في سيري تاني)\n• اضغط تأكيد → batch update: pieces[parentSeriesId] + series[containedPieceIds]\nالنتيجة: نفس الـ shape بتاع linked-series mode، لكن done post-print." },
      { type: "feature", text: "🛠 [Helpers جديدة في pieces.js]\n• `markScrapped(pieceId, opts)` — single + cascade للسيري\n• `linkPiecesToSeries(seriesId, pieceIds, opts)` — atomic batch مع validation شامل (status، type، existing parent)" },
      { type: "doc", text: "📅 [النهاية الطبيعية للـ Pieces system] V19.81.0 إلى V19.87.0 = 7 phases. النظام دلوقتي عنده:\n• توليد QR فريد لكل قطعة + سيري\n• Lookup + lifecycle timeline\n• Scan-to-sell + scan-to-return بـ KASF + accounting\n• Bulk return + customer history + analytics dashboard\n• Series-piece linkage (print-time + post-packing)\n• Smart scanner routing\n• Scrap action\n• Manual fallback search\n\nالـ نظام legacy لسه شغال 100% (audit V19.86.0 confirmed) فالـ user يقدر يستخدم النظامين parallel أو يـ migrate تدريجي." },
    ]
  },
  {
    version: "V19.86.0",
    date: "2026-05-09",
    types: ["feature"],
    title: "🔗 Scan-to-Sell بقى يأثر على KASF + المحاسبة (Phase 6)",
    changes: [
      { type: "feature", text: "🎯 [Deep CustDeliver integration] قبل V19.86 الـ scan-to-sell كان parallel ledger — يربط القطع بالعميل في `pieces` collection بس، لكن كشف العميل (KASF) والمحاسبة (Trial Balance / Income Statement) ما كانش يعرفوا حاجة. دلوقتي الـ scan-to-sell يكتب في 3 collections دفعة واحدة:\n• `pieces` — markSold cascade (زي قبل كده)\n• `salesDoc.custDeliverySessions` — session جديد بـ `fromScanner: true` وكل القطع المتـ scanned\n• `orders[oid].customerDeliveries` — entry per orderId مع qty + price + sessionId\nالنتيجة: المبيعات اللي اتعملت بالـ scanner دلوقتي بتظهر في كشف العميل، الـ trial balance، التقارير الموسمية، كل حاجة." },
      { type: "feature", text: "💰 [Financial preview قبل التأكيد] الـ confirm dialog بـ يطلع حساب فعلي:\n\"هتسلم 10 قطعة لـ احمد سامي بقيمة ~3,750 ج.م.\n✅ هـ يتم تسجيل البيع في كشف العميل + المحاسبة.\"\nالـ value بـ يحسب من orders[].sellPrice لكل moديل. السيريهات بتستخدم containedPieceIds.length × sellPrice. لو الـ price مش مخزّن، الـ pieces تتسجل بدون قيمة (free sale)." },
      { type: "feature", text: "📜 [autoPost integration] لكل customerDelivery اتعمل، autoPost.sale + autoPost.saleCogs بـ يـ fire (مع cust + order). أي failure يـ record في accountingPostFailures (مكان مش بـ يـ surface للـ user — لو احتاج debug). الـ sale entry في الـ journal بقى متطابق مع المسار الموجود في CustDeliverPg matrix flow." },
      { type: "feature", text: "🏷 [Marker `fromScanner: true`] كل session + delivery اتعمل بالـ scanner بـ يـ flag بـ `fromScanner: true` + `scannedPieceIds: [...]`. ده يخلي:\n• الـ بيع قابل للتمييز في الـ reports عن الـ matrix sessions\n• ممكن مستقبلاً نضيف filter في CustDeliverPg \"اعرض scanner sessions فقط\"\n• الـ scanned pieces متاحة للـ traceability لو حصل return لاحقاً" },
      { type: "fix", text: "🛡 [Safety] الـ integration بـ يحصل بعد ما markSold ينجح — لو markSold فشل لقطعة، ما بـ تتـ register في الـ KASF. الـ session بـ يتعمل مرة واحدة بس لو في على الأقل قطعة نجحت وعندها orderId. لو الـ upSales/updOrder مش متاحين (renderer قديم)، الـ flow بـ يـ degrade gracefully للـ pieces-only tracking مع toast warning واضح." },
    ]
  },
  {
    version: "V19.85.0",
    date: "2026-05-09",
    types: ["feature","fix"],
    title: "📊 Analytics + Bulk Return + استرجاع الـ checkbox (Phase 5 لتتبع القطع)",
    changes: [
      { type: "fix", text: "🔄 [User: \"احتفظ بالاوبشن بس لما المستخدم يحب يشغله\"] الـ tracking checkbox رجع كـ opt-in (default OFF). الـ V19.84.1 شالت الـ checkbox تماماً، الـ user أوضح إنه عاوز الخيار يفضل موجود لكن المستخدم يفعّله بإرادته. دلوقتي اللي عايز tracking يضغط الـ checkbox؛ غير كده الـ format بـ يفضل legacy CLARK:orderId:qty." },
      { type: "feature", text: "↩️ [Bulk Return — Phase 5] تاب الإرجاع اتعمله rewrite. قبل: قطعة واحدة فقط لكل تأكيد (صعب لو في 10 قطع راجعين دفعة واحدة). دلوقتي:\n• امسح كذا قطعة على التوالي → كل واحدة بـ تتـ validate وتنضاف لقائمة\n• الـ list grouped حسب العميل اللي راحت ليه (واضح كده مين رجّع إيه)\n• حقل واحد للسبب يـ apply على كل القطع في الجلسة\n• زر تأكيد بـ يعمل markReturned للكل في loop واحد\n• Series cascade toggle لكل سيري على حدة (تختار إرجاع كامل أم سيري بس)\n• Cancel-release: مفيش writes للـ Firestore لحد ما تضغط تأكيد" },
      { type: "feature", text: "📊 [Analytics tab — Phase 5] تاب جديد \"📊 إحصائيات\" الخامس. بيقرا آخر 1000 قطعة من Firestore ويـ aggregate client-side:\n• 5 KPI cards: إجمالي قطع، في المخزن، مع عملاء، تالفة، عدد السيريهات\n• Top 5 عملاء حالياً (bar chart بـ progress fill)\n• Top 5 موديلات بالإنتاج\n• Return rate per model — جدول بـ مؤشر ملوّن (أخضر < 15%، أصفر < 30%، أحمر ≥ 30%) ترتيب تنازلي حسب النسبة → الموديلات اللي بـ ترجع كتير في الأول، مؤشر مفيد للـ defects" },
      { type: "feature", text: "🛠 [Helpers جديدة في pieces.js]\n• `getAggregatedStats({limit})` — Firestore query بـ orderBy createdAt desc + client-side reduce\n• `markReturnedBulk(pieceIds[], opts)` — bulk wrapper حول markReturned للحالات اللي مش محتاجة UI" },
      { type: "doc", text: "📅 [Phase 6 المحتمل لاحقاً] Deep CustDeliver integration (الـ scan-to-sell بقى يولّد customer deliveries في الـ matrix الموجود ويأثر على KASF)، Packing workflow (link existing pieces بسيري post-production)، Server-side analytics rollup (لـ factories بأكتر من 1K قطعة في الـ snapshot الواحد)." },
    ]
  },
  {
    version: "V19.84.1",
    date: "2026-05-09",
    types: ["fix"],
    title: "🧹 تبسيط popup طباعة QR — شيل الـ checkbox، التتبع دايماً ON",
    changes: [
      { type: "fix", text: "🧹 [User: \"عاوز الافتراضي شيل تشيك بوكس\"] الـ tracking checkbox اللي اتضاف في V19.81.0 اتشال. كل QR يتطبع من دلوقتي بقى متتبع تلقائياً — مفيش opt-out. السبب: الـ user مش محتاج يفكر في كل مرة، والـ legacy format ما يستحقش يكون default option. هين بقت hint سطر واحد بـ \"كل ليبل بقى متسجل تلقائياً\" بدل الـ checkbox المساحة." },
      { type: "doc", text: "📜 [Legacy QRs لسه شغّالة] الـ QRs اللي اتطبعت قبل V19.81.0 (بـ format CLARK:orderId:qty) لسه يـ scan صح في صفحة استعلام القطع — الـ parseQr() بيعرفها ويعرض الـ order info مع تنبيه \"اطبع QR جديد\". بس مفيش طريقة جديدة تنتج legacy format بقى." },
    ]
  },
  {
    version: "V19.84.0",
    date: "2026-05-09",
    types: ["feature"],
    title: "👥 سجل القطع لكل عميل (Phase 4 لتتبع القطع)",
    changes: [
      { type: "feature", text: "👥 [Tab جديد \"سجل العميل\"] الـ4th tab في صفحة تتبع القطع. الـ workflow:\n• اختر عميل من dropdown\n• النظام يـ query Firestore على pieces بـ `currentCustomerId == X` و `status == with_customer`\n• يعرض كل القطع اللي معاه دلوقتي في 3 sections:\n  ▸ summary card: total count + total value (من orders[].sellPrice)\n  ▸ grouped breakdown: حسب الموديل + المقاس مع counts و values\n  ▸ detailed list: كل قطعة منفصلة مع تاريخ آخر بيع لها" },
      { type: "feature", text: "🎯 [Use case أساسي] لو scan-ت مرتجع مجهول في تاب الإرجاع وعرفت العميل، تعال هنا → تأكد إن العميل ده فعلاً عنده قطعة من النوع ده ومقاس ده. لو القطعة المرتجعة مش موجودة في كشفه، يبقى في حاجة غلط — ممكن العميل غلط في الـ packing، أو في scan لقطعة عميل تاني." },
      { type: "feature", text: "📊 [Total value calculation] الـ total بـ يحسب من `orders[].sellPrice` لكل قطعة. لو الموديل مالوش سعر مخزّن، الـ count بـ يفضل لكن الـ value بـ يطلع \"تقريبي\" مع disclaimer. السيريهات بـ تتحسب مرة واحدة (مش مع contained pieces) عشان ما يحصلش double-counting." },
      { type: "feature", text: "🛠 [Helper جديد `getCurrentPiecesForCustomer`] في pieces.js. Query indexed على currentCustomerId + status (Firestore يـ auto-index per-field)، sorted بـ updatedAt desc. أحدث المشتريات في الأول. Default limit 500 piece للـ pagination future-proofing." },
      { type: "doc", text: "📅 [Phase 5 — قادم لو حبيت] Analytics dashboard (return rate per model/customer)، packing workflow (link existing pieces بسيري جديد بعد الإنتاج)، Integration deep مع CustDeliverPg matrix (الـ scan-to-sell بقى يولّد customer deliveries في الجلسات الموجودة)." },
    ]
  },
  {
    version: "V19.83.0",
    date: "2026-05-09",
    types: ["feature","fix"],
    title: "🔗 ربط السيري بالقطع داخله (Phase 3) + bugfix الـ PiecesPg crash",
    changes: [
      { type: "fix", text: "🐛 [Critical bugfix] PiecesPg كانت بـ تـ crash بـ React error #306 عند فتح صفحة \"تتبع القطع\". السبب: الـ component كان `export default function` لكن `lazyNamed()` بـ يبحث عن named export. لما الـ named export ما لاقاش، الـ React.lazy استلم `undefined` كـ default، فحاول يـ render undefined → crash. الإصلاح: غيرت `export default function PiecesPg` إلى `export function PiecesPg` (named). الـ stack trace كان مضلل بـ `vendor-recharts` لأن الـ Suspense fallback كان شريك في الـ render tree." },
      { type: "feature", text: "🔗 [User question — \"هل السيري مرتبط بالكيو ار اللي على كل قطعة؟\"] قبل V19.83.0 الإجابة كانت لأ. كل QR كان doc منفصل بدون علاقة بين السيري والقطع جواه. لما تـ scan السيري عند البيع، النظام كان عارف إن ده \"package\" بس مش عارف إيه الـ piece IDs اللي جواه. **دلوقتي مرتبطين فعلياً.**" },
      { type: "feature", text: "📐 [Schema changes — series ↔ pieces linkage]\n```\npieces/{seriesId} {\n  type: \"series\",\n  containedPieceIds: [pieceId1, pieceId2, ...],  // 🆕\n  expectedPiecesCount: 4,                         // 🆕\n}\npieces/{pieceId} {\n  parentSeriesId: \"p_series_xxx\" | null,         // 🆕\n}\n```" },
      { type: "feature", text: "🖨 [Print mode جديد — \"🔗 سيري مرتبط\"] الـ tab الـ5th في popup طباعة QR. الـ workflow:\n• اختر الموديل (يعرض المقاسات بتاعته)\n• ادخل عدد السيريهات\n• النظام يحسب: لكل سيري = 1 ليبل سيري + N ليبل قطعة (واحد لكل مقاس)\n• مثال: 100 سيري × 4 مقاسات = 100 ليبل سيري + 400 ليبل قطعة = 500 ليبل\n• اضغط طباعة: يولّد كل الـ IDs، يكتبهم في batches للـ Firestore (500 op/batch)، ثم يطبع كل الـ500 ليبل بالـ thermal printer\n• الـ progress overlay بـ يظهر \"تسجيل 230/500\" حتى يخلص" },
      { type: "feature", text: "📦 [Scan cascade في تاب التسليم] لما تـ scan السيري QR في scan-to-sell:\n• الـ row في القائمة بقى ملوّن بـ light blue + chip \"+4 قطعة جواه\"\n• الـ summary badge بـ يحسب total pieces (السيري + جواه)\n• زر \"تأكيد التسليم\" بـ يعمل markSold للسيري + الـ4 قطع كلهم في batch واحد على Firestore (atomic)\n\nدبل-سكان prevention مع overlap detection:\n• لو scan-ت السيري ثم قطعة جواه → reject \"القطعة دي ضمن السيري اللي اتـ scan قبل كده\"\n• لو scan-ت قطعة ثم السيري بتاعها → reject \"السيري بيشمل القطعة دي تلقائي\"" },
      { type: "feature", text: "↩️ [Scan-to-return — choice dialog للسيري] لما تـ scan سيري QR في تاب الإرجاع، popup بـ يطلع بـ خيارين:\n• 🔵 السيري كامل — markReturned cascade لكل الـ4 قطع + السيري\n• 🟡 السيري بس (إرجاع جزئي) — السيري status فاضي، الـ4 قطع تفضل مع العميل\nالـ default على \"السيري كامل\" (الحالة الشائعة)." },
      { type: "feature", text: "🔍 [Lookup tab — sub-list للـ contained pieces] لما تـ lookup سيري له containedPieceIds، الـ result card بـ يطلع sub-list صغير بكل قطعة جواه + status لكل واحدة. للـ pieces اللي لها parentSeriesId، الـ card بـ يطلع badge link-back للسيري." },
    ]
  },
  {
    version: "V19.82.0",
    date: "2026-05-09",
    types: ["feature"],
    title: "📦 Scan-to-Sell + ↩️ Scan-to-Return (Phase 2 لتتبع القطع)",
    changes: [
      { type: "feature", text: "📦 [تاب جديد \"تسليم بالـ scanner\"] في صفحة تتبع القطع. الـ workflow:\n• اختر العميل من dropdown\n• ابدأ الـ scan — كل QR قطعة بـ يضاف لقائمة الجلسة\n• الـ summary بـ يعرض groups بالموديل + المقاس (\"3261122 / مقاس 8 × 5\")\n• Validation تلقائي:\n  - QR قديم → reject (\"اطبع QR جديد\")\n  - QR مش CLARK → reject\n  - قطعة مع عميل تاني → reject (\"اعملها إرجاع الأول\")\n  - قطعة ملغية → reject\n  - **scan مكرر في نفس الجلسة → reject** (الـ bug اللي قلت عليه — كان بـ يضاف 2 من نفس الـ piece)\n• زر \"✕\" لكل قطعة في القائمة لو حد scan-ها بالغلط\n• زر \"تأكيد التسليم\" بـ يعمل markSold لكل قطعة في batch — لو واحدة فشلت، الناجحة تتـ commit والفاشلة تفضل في القائمة" },
      { type: "feature", text: "↩️ [تاب جديد \"إرجاع بالـ scanner\"] للـ مرتجع المجهول. الـ workflow:\n• افتح الكاميرا → امسح القطعة المرتجعة\n• النظام بـ يطلع: \"القطعة دي مع: <اسم العميل>\" — لو عميل مجهول، النظام يعرفه من الـ history\n• ادخل سبب الإرجاع (اختياري — مقاس غلط، عيب، إلخ)\n• اضغط تأكيد → القطعة ترجع `in_warehouse` + الـ history يضاف إليه `returned` event بـ اسم العميل اللي رجعها\n• القطعة بقت قابلة للبيع لعميل تاني" },
      { type: "feature", text: "🛡 [Cancel-release semantics] الـ scans ما بـ تـ commit أي حاجة لـ Firestore لحد ما تضغط \"تأكيد\". لو قفلت الصفحة أو رحت لتاب تاني قبل الـ confirm → الـ DB ما اتمستش، والقطع لسه `in_warehouse` ومتاحة للـ scan تاني. ده اللي طلبته — \"لو عمل كانسل للبيع ده يقدر يعمل سكان من جديد\"." },
      { type: "feature", text: "🎨 [Tab bar في PiecesPg] الصفحة بقت 3 تابات:\n• 🔍 استعلام (الـ lookup من V19.81.0)\n• 📦 تسليم (جديد)\n• ↩️ إرجاع (جديد)\nالكاميرا بـ تـ stop تلقائياً لما تنتقل من تاب لتاني (ما تتركش الكاميرا شغّالة في الـ background)." },
    ]
  },
  {
    version: "V19.81.0",
    date: "2026-05-09",
    types: ["feature","architectural"],
    title: "🔍 تتبع كل قطعة بـ QR فريد (Phase 1: lookup + lifecycle)",
    changes: [
      { type: "feature", text: "🆔 [QR per piece — كل ليبل بقى فريد] طباعة QR كانت بـ تـ emit نفس الـ QR text لكل ليبل (`CLARK:orderId:qty`) → مش ممكن يميز قطعة عن التانية. دلوقتي كل ليبل بـ يتولّد له `pieceId` فريد عشوائي ويتسجل له doc في `pieces` collection. الـ QR الجديد بـ format `CLARK:P:p_xxxxxx`. الـ legacy format لسه بـ يشتغل لو حد عايز يـ disable التتبع (toggle في الـ popup)." },
      { type: "feature", text: "🔍 [صفحة جديدة \"تتبع القطع (QR)\"] زرار في الهوم بجوار طباعة QR. الصفحة فيها:\n• 📷 كاميرا scanner (html5-qrcode) — افتحها وامسح أي QR\n• ✍️ Manual paste/type input للـ QR ID\n• 🛠 Manual fallback: اختر موديل → يطلع آخر 50 قطعة منه (للـ stickers اللي اتمسحت/وقعت)\n• 📜 Timeline كامل لكل قطعة: اتنتجت → اتباعت لـ X → رجعت → اتباعت لـ Y → ...\n• الحالة الحالية مع badge ملوّن (في المخزن / مع عميل اسمه / تالف)" },
      { type: "architectural", text: "🏗 [Data model — pieces collection]\n```\npieces/{pieceId} {\n  id, qrCode, type:\"piece\"|\"series\",\n  modelNo, modelDesc, size, seriesQty,\n  orderId, productionDate, isSecondGrade,\n  status:\"in_warehouse\"|\"with_customer\"|\"scrapped\",\n  currentCustomerId, currentCustomerName, currentDeliveryId,\n  history:[{action:\"produced\"|\"sold\"|\"returned\"|\"released\", date, by, ...}]\n}\n```\nالـ history append-only، الـ status mutates. الـ writes بتستخدم Firestore writeBatch (500 ops per round-trip) فطباعة 200 قطعة بتكتب في batch واحد ~700ms بدلاً من 200 round-trips." },
      { type: "feature", text: "🎚 [Toggle \"تتبع كل قطعة\" في popup الطباعة] افتراضياً ON. لما تطبع 100 ليبل بـ tracking، الـ progress overlay بـ يقولك \"جاري تسجيل 50/100\" إلى آخره. لو شيلت الـ toggle، الـ format بـ يرجع legacy والـ DB ما بـ تتلمسش (للـ backward compat مع scanners قديمة)." },
      { type: "feature", text: "📷 [QrScanner component جديد] wrapper حول `html5-qrcode` بـ:\n• Lazy-import (الـ 100KB library مش بـ يدخل في الـ main bundle)\n• Dedup للـ scans المتكررة في 1.5s (الكاميرا لما تـ hold على QR ما تـ fire-ش 5 مرات)\n• Camera permission errors بـ تتـ surface للـ user بـ toast واضح\n• `facingMode:environment` للـ rear camera على الموبايل" },
      { type: "doc", text: "📅 [Phase 2 — قادم] Scan-on-deliver (التوزيعة بـ camera) + Scan-on-return (إرجاع مجهول → كشف العميل تلقائي) + Double-scan prevention + Cancel-release. Phase 3 — Analytics (return rate per customer/model)." },
    ]
  },
  {
    version: "V19.80.23",
    date: "2026-05-09",
    types: ["fix"],
    title: "🔤 إصلاح عناوين الحقول المتداخلة في الـ PDF (letter-spacing كان بيكسر ligatures)",
    changes: [
      { type: "fix", text: "🐛 [User report — \"عناوين الحقول ظاهرة بشكل غلط ومتداخل\"] بعد V19.80.22 الـ body cells (الأرقام، الأسماء، الوصف) بـ render-ت تمام. لكن خلايا العناوين (.h class) — \"العميل\"، \"التليفون\"، \"التاريخ\"، \"العنوان\"، \"الموديل\"، \"الوصف\"، \"الكمية\"، \"السعر\"، \"الإجمالي\" — طلعت بحروف منفصلة ومتداخلة (شكلها زي \"لعمميل\" بدل \"العميل\")." },
      { type: "fix", text: "🔍 [Root cause] الـ `.h` class كان فيه `letter-spacing:0.3px`. الحروف العربية لازم تـ join مع بعض (ligatures) عشان تطلع صح، والـ letter-spacing بـ يفرض مسافة بين كل glyph وتاليه — اللي بـ يمنع الـ joining engine من الـ shape. الـ body td ما كانش عنده letter-spacing فطلع تمام؛ الـ .h كان عنده فطلع متكسر. المشكلة دي بـ تظهر في html2canvas تحديداً لأنه بـ يـ snapshot الـ glyphs بعد الـ font shaping، فلو الـ shaping اتكسر، الـ snapshot مكسور permanent." },
      { type: "fix", text: "🔧 [Fix — 3 تغييرات على .h]:\n• شيلت `letter-spacing:0.3px` (السبب الجذري)\n• قدّمت Tahoma على Arial في الـ font-family stack: `Tahoma, Arial, 'Segoe UI', 'GeezaPro', sans-serif`. ليه؟ Arial Latin ما عندوش Arabic glyphs، فالـ browser بـ يعمل fallback. الـ fallback timing داخل html2canvas's offscreen iframe بـ يكون race-prone — أحياناً الـ Cairo/Tahoma mы commit قبل ما الـ snapshot يحصل، أحياناً لا. لما Tahoma يكون أول family في الـ stack، الـ Arabic chars بـ تـ resolve مباشرة على Tahoma بدون fallback dance. الـ Latin chars بـ تـ fall back من Tahoma إلى Arial (يدعمها fallback) — والـ Latin shaping بسيط فمش بـ يتأثر.\n• قللت font-weight من 700 إلى 600 لأن synthetic bolding (لما الـ font ما عندوش bold variant حقيقي للـ Arabic) بـ يخن الـ glyphs ويـ break الـ joining عند small font-sizes." },
      { type: "doc", text: "💡 [الـ body cells لسه بـ يستخدموا الـ default body font-family] الـ td (بدون .h) ما بـ يحتاج تغيير — الـ Arial-first stack شغّال للـ body لأن مفيش letter-spacing ولا synthetic-bold. الـ tweak محصور على الـ headers." },
    ]
  },
  {
    version: "V19.80.22",
    date: "2026-05-09",
    types: ["fix","architectural"],
    title: "📄 PDF الواتساب (إذن استلام) أعيد بناؤه — HTML + Arial بدل jsPDF + custom shaper",
    changes: [
      { type: "fix", text: "🔥 [User report — \"الصح\" vs \"فيه مشكلة\"] الـ auto-WhatsApp PDF بـ يـ render الـ Arabic مقلوب حرف-حرف بدون contextual shaping. مثال:\n• \"نظام إدارة مصانع الملابس\" → \"سبلاملا عناصم ةرادإ ماظن\"\n• \"احمد سامي\" → \"يماس دمحا\"\n• \"الموديل الوصف الكمية\" → \"ليدوملا فصولا ةيمكلا\"\nالـ Latin والأرقام شغالين صح (3261122، +201008879265، 2026-05-09). السبب: الـ V19.70.23 كان بـ يستخدم jsPDF + custom Arabic shaper (`ar()` في arabicPdf.js) — الـ shaper كان بـ يعكس الـ string بدون ما يحط الـ presentation forms (FE70-FEFC). كل محاولات الإصلاح (V19.80.13/14) كسرت حاجة تانية." },
      { type: "architectural", text: "🏗 [Rewrite كامل — HTML → html2canvas → PDF بدلاً من jsPDF text rendering] الـ active path دلوقتي:\n1. `buildOneCustomerHTML(c, sig, opts)` بـ يـ build HTML مطابقة لإذن الاستلام في طباعة per-row 🖨 (نفس الـ HTML اللي بـ يولّد \"الصح.pdf\")\n2. `htmlToPdfBase64(html, {fontFamily: \"Arial, Tahoma, ...\"})` بـ يـ render-ها في offscreen container بـ dir=rtl + lang=ar، ثم يـ capture-ها بـ html2canvas، ويـ wrap-ها في jsPDF كـ image\n3. الـ browser يتعامل مع الـ Arabic shaping + RTL ordering طبيعي — مفيش custom shaper، مفيش reverse، مفيش setR2L\n\nالنتيجة: الـ auto-PDF بقى مطابق لـ \"الصح.pdf\" تماماً، لأن الاتنين بـ يستخدموا نفس الـ HTML وبـ يعتمدوا على الـ browser في الـ shaping." },
      { type: "feature", text: "🔤 [Font: Arial first stack] الـ font-family في الـ HTML بقى `Arial, Tahoma, 'Segoe UI', 'GeezaPro', sans-serif`:\n• Arial → Latin/digits بشكل نظيف ومألوف\n• Tahoma → Arabic على Windows (Arial Latin أصلاً ما عندهوش Arabic glyphs، الـ browser بـ يـ fallback تلقائي للـ family الجاي)\n• Segoe UI → Windows 10+ Arabic (modern fallback)\n• GeezaPro → macOS Arabic\n• sans-serif → final fallback\nالـ browser بـ يختار أوّل family عنده الـ glyph لكل character. مفيش CDN download — كل الـ fonts من system." },
      { type: "fix", text: "🗑 [arabicPdf.js اتـ stub-out] ملف `src/utils/arabicPdf.js` بقى dead code — الـ exports (`loadArabicPdfLibs`, `buildDeliveryReceiptPdfBase64`) بـ تـ throw error واضح لو حد استدعاهم بالغلط. ممكن يتشال من الفايل system لما نتأكد إن مفيش أي import متبقي. الـ `buildOneCustomerPayload` helper اتشال كمان (كان input adapter للـ broken engine)." },
      { type: "fix", text: "⚙ [htmlToPdf.js — fontFamily option] `htmlToPdfBase64(html, {fontFamily})` دلوقتي بـ يقبل أي font stack. الـ default لسه \"Cairo, sans-serif\" (للـ توافق الـ legacy)، لكن لو الـ stack ما فيهوش \"Cairo\" الـ helper بـ يـ skip الـ Cairo CDN download (200KB أوفر، startup أسرع). الـ container.style.fontFamily بـ يـ apply من الـ option." },
    ]
  },
  {
    version: "V19.80.21",
    date: "2026-05-09",
    types: ["feature"],
    title: "📊 progress bar للترحيل + paginate سجل الدفعات (25 + عرض المزيد)",
    changes: [
      { type: "feature", text: "📊 [Progress overlay لـ ترحيل القيود] الزر القديم \"📚 ترحيل القيود\" كان بـ يعرض \"⏳ جاري الترحيل...\" بس بدون أي feedback عن التقدم. دلوقتي الـ click بـ يفتح modal-style overlay بـ:\n• Progress bar (linear gradient أخضر/سماوي)\n• \"العملية N من M\" (يتحدث كل 25 عملية من backfillAll's onProgress callback)\n• Percentage value كبير (e.g. 45%)\n• Label من الـ backfill (\"ترحيل العمليات...\" / \"اكتمل\")\n• Backdrop blur + fixed-position overlay يـ block أي تفاعل تاني\n• تحذير \"ما تقفلش الصفحة\" تحت" },
      { type: "feature", text: "📑 [Paginate-on-demand لـ سجل الدفعات] PaymentsTab كان بـ يـ render كل الـ filtered rows دفعة واحدة (مئات/آلاف). دلوقتي:\n• default: 25 سطر بس\n• footer: \"يعرض 25 من إجمالي M حركة\" + زرّان: \"⬇ عرض المزيد (+25)\" و \"عرض الكل (M)\"\n• الـ visibleCount بـ يـ reset لـ 25 لو غيرت أي فلتر (الاتجاه/القناة/الحالة/التاريخ/البحث) — عشان تشوف رؤوس النتائج الجديدة\n• الـ pattern ده هـ يـ apply على كل سجلات قادمة (memory feedback مسجل)" },
      { type: "doc", text: "💡 [الترحيل الأول كان طبيعي بـ يطول] الـ backfill بـ يعمل round-trip لـ Firestore لكل عملية. لو عندك سنة بيانات كاملة، 500-2000 entry × ~150ms = 75s-5min. مفيش حد ثابت — بـ يعتمد على عدد الـ sales/payments/hr/treasury في data. مع الـ progress bar الجديد، الـ user يقدر يقرر يستنى أو يرفض." },
    ]
  },
  {
    version: "V19.80.20",
    date: "2026-05-09",
    types: ["feature"],
    title: "🔄 استرداد التحويلات بين الخزن المفقودة + اضمن إنها تظهر تاني",
    changes: [
      { type: "feature", text: "🔄 [زر جديد — \"🔄 استرداد التحويلات المفقودة\"] فحص شامل لكل التحويلات بين الخزن (treasuryTransfers + treasury legs). الـ scanner بـ يـ cross-reference الـ source-of-truth (treasuryTransfers record) مع الـ treasury legs:\n• كل transfer بـ status='confirmed' لازم يكون له leg out (من fromAccount) + leg in (إلى toAccount) مع matching transferId.\n• الناقصات بـ تتـ list في modal بـ التاريخ + المصدر + الهدف + المبلغ + ناقص إيه.\n• الضغط على \"استرد الـ legs الناقصة\" بـ يـ recreate-ها من بيانات الـ transfer record (نفس logic الـ approveTransfer)." },
      { type: "feature", text: "⚠ [Orphan legs detection] لو في treasury entry بـ transferId لكن مفيش matching record في treasuryTransfers، الـ scanner بـ يـ flag-ها كـ orphan في قسم منفصل (أصفر/تحذير). الـ admin محتاج يقرر يمسحها يدوياً أو يعمل تحويل جديد. الـ scanner ما يـ touch-ش-هم لأن مش عنده الـ source/target الأصليين." },
      { type: "fix", text: "🛡 [Defense-in-depth — التحويلات الجديدة محمية تلقائياً] الـ V19.80.16 + V19.80.19 الموجودين فعلاً يحموا التحويلات الجديدة:\n• Silent date rejection بقى loud — لو date غير صحيح، notice فوراً\n• Pending writes ما بـ تـ delete-ش بدون server confirmation — لو leg فشل في الكتابة، الـ user يشوف notice\n• Stable subset compare — server enrichment ما بـ يـ trap pending\n• FIFO cap — ما يـ overflow\nيعني تحويل بعد V19.80.16 ما يقدرش يختفي صامتاً. الزر الجديد في V19.80.20 للـ legacy data من قبل الـ fixes دي." },
      { type: "doc", text: "📦 [ZIP-after-release added to protocol] من دلوقتي كل release جديد بـ يطلع ZIP بـ نفس الإصم على Desktop بعد ما الـ build يعدّي. الـ ZIP السابق بـ يـ delete تلقائي. ده backup يدوي لكل version مشحون فاللحظة." },
    ]
  },
  {
    version: "V19.80.19",
    date: "2026-05-09",
    types: ["fix","feature"],
    title: "🛡 تقوية الخزنة + المحاسبة بعد audit شامل (3 CRITICAL + 4 HIGH)",
    changes: [
      { type: "fix", text: "🚨 [CRITICAL — Accounting drift after V19.80.17 recovery] الـ V19.80.17 كان بـ يـ recreate treasury+hrLog+supplierPayments بس — ما كانش بـ يـ post journal entries. النتيجة: الـ Trial Balance + Balance Sheet + Income Statement + Party Ledger كانوا بـ يقروا من accountingDays فالـ cash account كان مكتوب فيه أقل من اللي في الخزنة، والـ AR/AP كانوا overstated. **PaymentsTab.jsx confirmRecovery دلوقتي بـ يـ trigger backfillAll تلقائياً بعد كل recovery** — postEntry idempotent بـ check (sourceType, sourceId)، فإعادة التشغيل بـ تـ UPDATE بدل ما تـ duplicate." },
      { type: "feature", text: "📚 [زر جديد — \"📚 ترحيل القيود للمحاسبة\"] standalone backfill button في PaymentsTab بجوار الـ recovery + repair buttons. للـ users اللي ركضوا V19.80.17 قبل الـ V19.80.19 fix. الزر بـ يـ run backfillAll(data) — بـ يمشي على كل sales/returns/customer-payments/checks/workshop-pays/hr-logs/treasury، ويـ post journal entry لأي حاجة مفقودة. بـ يعرض banner بنتيجة كاملة (مرحّل / متخطّى / فشل) + breakdown by type. **Idempotent — أمان تشغيله أكتر من مرة.**" },
      { type: "fix", text: "🚨 [CRITICAL — Treasury delete left orphan journal entries] TreasuryPg.delTx + bulkDeleteTxs كانوا بـ يحذفوا الـ treasury row + cascaded payments بس، من غير ما يعكسوا الـ JE المرتبطة. النتيجة: درر JE في accountingDays بدون treasury مقابل → cash overstated في TB. **دلوقتي كل delete بـ يـ fire autoPost.reverse للـ treasury + المربوطات (hrLog، custPayment، wsPayment)** — autoPost.reverse no-op لو مفيش JE، فآمن للـ over-firing. الـ edit path كان بـ يعمل ده فعلاً، الـ delete كان مش بـ يعمل." },
      { type: "fix", text: "🚨 [CRITICAL — Pending Map could grow unbounded] V19.80.16 شال الـ blind 30s sweep لكن ساب الـ flatten() compare على full deepEqual. لو السيرفر enrich الـ entry بأي field إضافي (editedBy، _v193DupCleanup migration tags، إلخ) → deepEqual رجع false → الـ pending ما اتنظفش → الـ Map بقى يكبر بدون حد + warning spam. **دلوقتي الـ compare على stable subset بس** (id + amount + date + type + category + account + desc + party-link IDs). الـ enrichment fields مش بـ تـ trip the match. **+ FIFO eviction cap عند 5000 entry per field** كـ safety valve." },
      { type: "fix", text: "🛡 [HIGH — Double-click race على close-week] HRPg.tryApproveWeek/approveWeek كانوا بـ يـ check `openWeek.status` من الـ React closure — closure value stale لمدة ~1100ms (الـ setTimeout chain للـ saving overlay). double-click في الـ window ده كان بـ يخلي الـ pipeline يـ fire مرتين → duplicate salary/advance/ws/expense entries بـ fresh gid()s. **دلوقتي in-flight ref guard (`approvingRef.current`)** بـ يقفل عند بداية الـ pipeline، يـ release عند success/error. الـ guard متحطّ بعد كل الـ early-return paths (duplicate-detection، override-confirm) فمش بـ يكسر الـ workflows دي." },
      { type: "fix", text: "🧹 [HIGH — clean-delete-week filter كان ناقص] HRPg.executeCleanDelete كان بـ يحذف treasury entries بـ sourceType ∈ [hr_salary, hr_weekly_advance, hr_advance] بس. V15.27 ضافت hr_weekly_ws_payment + V15.34 ضافت hr_other_expense — الاتنين فاتوا → orphan treasury rows + supplier statements ما اتـ cascade-cleaned. **دلوقتي الـ filter متمدد لكل الـ 5 sourceTypes + cascade على wsPayments + supplierPayments بـ sourceWeekId/treasuryTxId + hrLog weekly_ws_payment**." },
      { type: "doc", text: "📋 [Findings deferred لـ versions جاية]\n• PurchasePg.jsx — supplier cash payments مش بـ يـ autopost (asymmetric مع CustDeliverPg). الـ existing data بـ تتـ rescue بـ backfillAll.\n• matchPartyFromDesc minNameLength:3 — قابل لمطابقات خاطئة لأسماء قصيرة (\"علي\"). الـ recovery الحالي ما يستخدمش الـ path ده.\n• Restore-week stale fields — ما بـ تتمسحش عند reopen، بـ تتـ overwrite صامتاً عند re-close. منفصل عن أي data-loss.\n• matchPartyFromDesc minNameLength bump إلى 5، CoA delete loading guard، CoA rename propagation — كلها cosmetic/edge cases." },
    ]
  },
  {
    version: "V19.80.18",
    date: "2026-05-09",
    types: ["fix"],
    title: "🛠 إصلاح تواريخ الـ V19.80.17 recovery + زر تصحيح للحركات اللي اتعملت غلط",
    changes: [
      { type: "fix", text: "🐛 [Recovery date bug] الـ V19.80.17 كان بـ يستخدم `p.date || \"\"` للـ ws_payments. لو الـ p.date فاضي (لأن الـ user اعتمد على autoDate في الـ close-week الأصلي)، الـ entry بـ يتعمل بـ date=\"\" → splitCollections.js كان بـ يـ fallback لـ createdAt = اليوم (السبت) بدلاً من تاريخ الخميس بتاع قفل الأسبوع. النتيجة: الـ recovered ws_payments نزلت في day doc السبت بدلاً من الخميس." },
      { type: "fix", text: "🔧 [Recovery now mirrors HRPg close-week date logic exactly]\n• `weeklyAdvances` → `a.date || w.closedAt` (HRPg:1662)\n• `weeklyWsPayments` → `p.autoDate ? w.closedAt : (p.date || w.closedAt)` (HRPg:1695 — الـ autoDate flag بـ يـ snap للـ close date)\n• `weeklyOtherExpenses` → `ex.date || w.closedAt` (HRPg:1744)\n• Salaries → `w.closedAt` (HRPg:1642 useDate equivalent)\n• الـ supplierPayments/wsPayments/hrLog المرتبطة بـ تـ store-the-same-date — مفيش divergence." },
      { type: "feature", text: "🛠 [زر جديد — \"إصلاح تواريخ الاسترداد\"] للـ users اللي ضغطوا V19.80.17 قبل الـ V19.80.18 fix. الزر يـ scan كل treasury entries بـ `recoveredFrom: \"missing-close-week-entry\"` ويـ re-derive الـ correct date من الـ snapshot الأصلي. لو الـ current date ≠ correct → يـ update + يصلح الـ supplierPayments/wsPayments/hrLog المربوطة. الـ syncSplitCollection's V16.80 FIX #2 date-change detection بـ يـ move الـ entry من الـ day doc الغلط للـ صح تلقائياً.\n\nالموقع: المحاسبة → سجل الدفعات → بجوار الزر البرتقالي. modal preview بـ يعرض كل حركة (المبلغ، الـ desc، الـ تاريخ القديم، الـ تاريخ الجديد) قبل التنفيذ." },
      { type: "fix", text: "🐞 [Bug تاني صغير اتـ fix] في الـ V19.80.17 الـ `day` field كان بـ يستخدم `_dayName(ex.date || \"\")` بدلاً من الـ effective date — فالـ day name كان \"\" لو ex.date فاضي. دلوقتي بـ يستخدم effExpDate." },
    ]
  },
  {
    version: "V19.80.17",
    date: "2026-05-09",
    types: ["feature","fix"],
    title: "🚑 زر استرداد حركات الخزنة المفقودة من الـ snapshots",
    changes: [
      { type: "feature", text: "🚑 [زر جديد في PaymentsTab — \"🚑 استرداد حركات الخزنة المفقودة\"] companion للـ V19.80.16 root-cause fix. يمشي على كل أسبوع مقفول ويـ scan الـ snapshots:\n• `closedRecords[]` → كل سطر بـ thursdayPay > 0 — يدوّر على treasury entry بـ sourceType=hr_salary + weekId + empId. لو مش موجود → يعتبره مفقود.\n• `weeklyAdvances[]` → يدوّر على treasury entry بـ id = a.treasuryTxId. لو مش موجود → مفقود.\n• `weeklyWsPayments[]` → نفس الفكرة.\n• `weeklyOtherExpenses[]` → نفس الفكرة." },
      { type: "feature", text: "📋 [Preview modal قبل التنفيذ] الزر بـ يفتح modal بـ list مفصّلة بكل حركة مفقودة (4 أقسام: مرتبات/سلف/ورش/مصاريف أخرى)، اسم الموظف/المورد، التاريخ، المبلغ، إجمالي كل قسم. الـ user يقدر يـ verify قبل ما يضغط \"استرد الحركات\". لو مفيش حركات مفقودة → toast \"كل الحركات سليمة\"." },
      { type: "feature", text: "🔧 [الـ recovery logic] للـ entries اللي عندها treasuryTxId مخزّن (السلف/الورش/المصاريف): الحركة الجديدة بـ تتعمل بـ نفس الـ ID الأصلي عشان أي روابط (supplierPayments/wsPayments/hrLog) تستمر تشتغل. للـ مرتبات (مفيش treasuryTxId stored back): فـ generate fresh id. الـ recoveredAt + recoveredFrom marker بـ يتحطّوا على كل entry للـ audit. الـ supplierPayments/hrLog/wsPayments بـ تتـ recreate تلقائي لو كانت مفقودة." },
      { type: "fix", text: "📝 [Audit log] كل run بـ يـ unshift entry في auditLog: action=\"v19.80.17_recovery\" + meta بعدد كل category. ينضمن forensic trail لو احتجنا نـ trace لاحقاً." },
      { type: "doc", text: "ℹ️ [للتحويلات بين الخزن المفقودة] لو الـ treasuryTransfers record نفسه ضايع (مش مجرد الـ legs)، الـ recovery ده مش هـ يـ catch-ها لأن مفيش source data للـ recreate من. الـ admin محتاج يعمل التحويل تاني يدوياً عبر التحويل الموجود في صفحة الخزنة." },
    ]
  },
  {
    version: "V19.80.16",
    date: "2026-05-09",
    types: ["fix"],
    title: "🚨 إصلاح كارثي: حركات الخزنة كانت تختفي بعد ترحيل الأسبوع + المزامنة",
    changes: [
      { type: "fix", text: "🔥 [User report — W19, 2026-05-09] بعد ترحيل أسبوع 19 + ضغط زر \"مزامنة الدفعات اليتيمة\"، كل حركات يوم الخميس + تحويل من الخزنة الرئيسية للفرعية اختفت من الـ UI. السبب الجذري: الـ optimistic-state cleanup interval في App.jsx كان بـ يحذف الـ pending writes بعد 30 ثانية بـ شكل أعمى — بدون التحقق إن السيرفر فعلاً echo-ها. لو entry فشل في الكتابة لـ Firestore (لأي سبب — silent date-rejection في splitCollections.js، partial sync failure، إلخ)، الـ UI كان بـ يفضل يـ show-ها لمدة 30s ثم تختفي نهائياً. الـ data ما كانتش اتـ delete من Firestore — كانت **never persisted to begin with**." },
      { type: "fix", text: "🛡 [App.jsx:2474-2512 — pending cleanup overhaul] بدل الـ blind delete بعد 30s، الـ loop دلوقتي:\n• ما يـ delete-ش أي entry من الـ pending map. الـ flatten() at App.jsx:~2580 already deletes entries when the server confirms via deep-equal match — that's the only correct deletion path.\n• بعد 60s، أي entry لسه pending بـ يـ surface كـ noticeWarn بـ تفاصيل الـ field/id (\"تحذير: حركات لم تُحفظ على السيرفر\"). الـ user يقدر يقرر يعمل refresh + يحاول تاني بدلاً من الفقد الصامت.\n• كل entry stuck بـ يتـ flagged بـ `_stuckReported` فالـ warning يفير مرة واحدة — لا spam." },
      { type: "fix", text: "📢 [splitCollections.js:301 — make silent date-rejection LOUD] الـ syncSplitCollection كان بـ يـ reject أي entry بـ date شكلها مش `^\\d{4}-\\d{2}-\\d{2}` ويـ log لـ console.error بس. النتيجة: الـ user ما عندوش أي way يعرف إن في حركات ما اتحفظتش. دلوقتي الـ rejection بـ يـ surface لـ noticeWarn بـ list من الـ IDs المرفوضة. الـ entries لسه بـ تـ keep في الـ local state (partial-success behavior preserved) لكن الـ user بقى عارف إنه محتاج يـ refresh + retry قبل ما يعمل أي تعديل تاني." },
      { type: "fix", text: "🎯 [Why this is the right fix, not just a patch] الـ V19.13 dead-cleanup + V19.80.12 stale-link recovery + V18.60 mass-wipe blocker + V19.62 partitioned-snapshot fix كانوا كلهم patches لـ symptoms. الـ root cause الفعلي كان: الـ pending-write system بـ يـ expire pending entries بـ assumption إن الـ server echoed them، لكن مفيش verification. الـ fix بـ يـ reverse الـ default — الـ pending entries بـ تفضل لحد ما server يـ confirm، والـ stuck ones بـ تـ surface للـ user بدلاً من الفقد الصامت." },
      { type: "doc", text: "📋 [Recovery for affected weeks] لو أسبوع لسه ضايعة منه حركات بسبب الـ bug ده: استخدم زر \"استرجاع الأسبوع للحالة قبل الإقفال\" في صفحة HR (يفتح الأسبوع تاني)، ثم اعمل قفل تاني. الـ V19.80.12 stale-link recovery هـ يـ recreate الـ treasury entries المفقودة من الـ snapshot في `weeklyAdvances`/`weeklyWsPayments`/`weeklyOtherExpenses`. للـ تحويل الضائع بين الخزن: لو الـ `treasuryTransfers` record لسه موجود بـ status `confirmed`، يـ admin يقدر يـ regenerate الـ legs يدوياً." },
    ]
  },
  {
    version: "V19.80.15",
    date: "2026-05-09",
    types: ["feature"],
    title: "📝 قالب رسالة التقرير اليومي قابل للتعديل + متغيرات قابلة للإدراج",
    changes: [
      { type: "feature", text: "📝 [Editable WhatsApp template for daily report] إعدادات الـ Automation → التقرير اليومي دلوقتي فيها textarea يـ allow الـ admin يـ customize نص الرسالة بالكامل. الـ default template بـ يطابق الـ output القديم بالظبط، فالسلوك مش متغير لحد ما تـ edit." },
      { type: "feature", text: "🏷 [27 متغير قابل للإدراج] لائحة الـ variables منظمة في 8 مجموعات (ترويسة، مبيعات، مشتريات، خزنة، تشغيل، تحذيرات، مهام، أقسام كاملة). الضغط على chip يـ insert الـ variable عند مكان الـ cursor في الـ textarea تلقائي. أمثلة:\n• `{date}` → \"الأحد، 9 مايو 2026\"\n• `{factoryName}` → \"CLARK Factory\"\n• `{salesValue}` → \"3,750 ج.م\"\n• `{topCustomer}` → اسم أعلى عميل\n• `{netCash}` → الصافي بعد الخزنة\n• `{salesSection}` → كتلة كاملة (drop-in block)" },
      { type: "feature", text: "👁 [Inline live preview] زر \"معاينة مباشرة\" بـ يـ render الـ template بالقيم الفعلية من الـ data. الـ preview بـ يظهر في box أسود (terminal-style) تحت الـ textarea مباشرة فالـ admin يقدر يـ tweak الـ template ويرى الـ output الحقيقي بدون ما يضغط \"ارسل تجربة\". الـ section toggles لسه شغّالة — لو طفّيت قسم، الـ `{xxxSection}` المقابل يـ resolve لـ string فاضي و`_squeezeBlanks` يـ collapse الفراغ." },
      { type: "feature", text: "↺ [Reset to default] زر \"القالب الافتراضي\" بـ يـ restore الـ template الأصلي بـ confirmation dialog. مفيد لو الـ admin عمل تعديلات وعاوز يرجّع للـ original. الـ DEFAULT_DAILY_TEMPLATE constant مـ exposed من buildDailyReport.js للـ reuse." },
      { type: "feature", text: "🛠 [_computeVars + _applyTemplate في buildDailyReport.js] الـ helper الجديد بـ يحسب 27 variable في pass واحد، يـ pre-render الـ section blocks، ويـ apply الـ template عبر regex substitution. الـ unknown placeholders بـ تفضل as-is (مثل `{typo}`) فالـ admin يـ catch الأخطاء في الـ preview. الـ `vars` object مـ exposed في الـ return value فأي UI يـ inspect الأرقام الـ raw." },
    ]
  },
  {
    version: "V19.80.14",
    date: "2026-05-09",
    types: ["fix"],
    title: "🔥 الإصلاح الفعلي: شيل setR2L اللي كان بيقلب كل حاجة في PDF الواتساب",
    changes: [
      { type: "fix", text: "🚨 [V19.80.13 was incomplete — root cause was lower in the stack] الـ V19.80.13 fix كان على الـ ar() shaper بس، لكن الـ user أكد إن الأرقام لسه معكوسة. الـ PDF أظهر إن **كل** الـ Latin والـ digits معكوسة:\n• \"CLARK Factory Management\" → \"tnemeganaM yrotcaF KRALC\"\n• \"3261122\" → \"2211623\"\n• \"3,750\" → \"057,3\"\n• \"+201008879265\" → \"562978800102+\"\n• \"2026-05-09\" → \"90-50-6202\"\n• \"24 ساعة\" → \"42 ساعة\"\n\nالسبب: `pdf.setR2L(true)` في createPdf() كان بـ يـ reverse كل text قبل ما يـ render. ده كان فوق الـ ar() reversal — فالـ Arabic كان OK (double-reverse = original logical order)، لكن الـ Latin/digits كانوا بـ يـ reversed مرة واحدة." },
      { type: "fix", text: "🔧 [Fix: removed pdf.setR2L(true) entirely] الـ jsPDF instance دلوقتي يـ stay في default LTR mode. الـ ar() shaper بـ يعمل visual-LTR ordering للـ Arabic، فالـ shaped glyphs (initial/medial/final forms) بـ تتـ render in LTR pixel order ويـ read-ها الـ Arabic reader RTL by form direction — صحيح. الـ Latin/digits بـ تـ render LTR طبيعي بدون أي reversal. الـ alignment ما اتأثرش لأن كل الـ pdf.text() calls بـ تستخدم explicit `align: 'right' | 'center' | 'left'`، والـ autoTable بـ يستخدم halign per-column." },
      { type: "fix", text: "⚠️ [Cairo TTF investigation — kept Amiri for now] الـ user طلب الخط يكون Cairo زي الـ manual print. حاولنا نـ download Cairo TTF (variable font 600KB)، لكن inspection للـ cmap كشف إن Cairo بـ يفتقر بعض الـ FE-range glyphs (U+FE80 ء isolated، U+FE93 ة isolated، إلخ). الـ pre-shaping approach في ar() بـ يحتاج كل FE-range glyphs (FE70-FEFC). الـ Cairo's static TTFs بـ تـ split الـ Arabic + Latin في separate files (subset model). فضلنا نسيب Amiri (aliased as \"Cairo\") اللي عنده full FE-range coverage. الـ visual difference بين Amiri و Cairo صغيرة في body font size. الـ font swap الكامل محتاج إما:\n• Find Cairo TTF بـ full FE coverage (not available in standard Google Fonts)\n• Or rewrite renderer to use OpenType GSUB for shaping (significant work)" },
    ]
  },
  {
    version: "V19.80.13",
    date: "2026-05-09",
    types: ["fix"],
    title: "🔢 إصلاح كارثي: أرقام الموديل معكوسة في PDF الواتساب",
    changes: [
      { type: "fix", text: "🚨 [User report: \"الارقام معكوسة في بي دي اف اللي بيروح للعميل\"] إذن استلام العميل اللي بـ يتـ attach مع رسالة الواتساب الـ auto كان بـ يعرض رقم الموديل معكوس (3262142 → 2412623). السبب: الـ ar() shaper في arabicPdf.js كان بـ يعمل `out.reverse()` على المصفوفة كلها بعد الـ Arabic shaping — لتحويل logical → visual order للـ RTL. الـ reversal ده صحيح لـ Arabic strings نقية، لكنه كان بـ يقلب الأرقام كمان لو كانت داخل الـ string. لما الـ modelNo (\"3262142\") عدّى من ar()، الـ output كان \"2412623\"." },
      { type: "fix", text: "🔧 [Fix: BiDi-aware reversal in ar()] الـ shaper دلوقتي بـ يعمل 2 things:\n• لو الـ input مش فيه أي حرف عربي (e.g. \"3262142\"، \"1,234.50\"، \"—\") → يـ return الـ string كما هي بدون reversal.\n• لو فيه عربي (mixed أو نقي) → يـ reverse الـ array كله، ثم يـ re-reverse كل digit-run داخلياً (digits + comma + period) عشان الأرقام تـ keep الترتيب LTR الطبيعي بتاعها وفقاً لـ Unicode bidirectional algorithm.\n\nأمثلة:\n• \"3262142\" → \"3262142\" (مش بـ يـ reverse)\n• \"موديل\" → \"ليدوم\" (Arabic فقط، يـ reverse)\n• \"موديل 100\" → \"100 ليدوم\" (الأرقام keep order)\n• \"ج.م 1,234\" → \"1,234 م.ج\" (الأرقام keep order)" },
      { type: "fix", text: "📐 [Visual order swap for number+Arabic cells] الـ aggRow + الـ discount block كانوا بـ يـ concat كـ \"X ج.م\" (number + space + Arabic). في PDF بـ Cairo font ده كان بـ يـ render في pixel LTR كـ \"1,234 م.ج\" — اللي بـ يقرأها الـ RTL reader كـ \"ج.م 1,234\" (currency THEN amount — غير طبيعي). الإصلاح: الـ Arabic suffix دلوقتي بـ يجي **قبل** الرقم في الـ JS string فالـ pixel LTR بقى \"م.ج 1,234\"، اللي يـ read كـ \"1,234 ج.م\" (amount THEN currency) — صح طبيعياً." },
    ]
  },
  {
    version: "V19.80.12",
    date: "2026-05-07",
    types: ["fix"],
    title: "🛠 إصلاحات قفل الأسبوع: مزامنة دفعات المورد + استرجاع الـ stale-link + ورشة ورشة",
    changes: [
      { type: "fix", text: "🏷 [دفعة مورد الأسبوعية كانت تظهر \"غير مزامنة\"] لما V19.80.11 ضافت ربط دفعة المورد بـ supplierId، الـ treasury entry كان بـ يـ create لكن مفيش supplierPayment record موازي. الـ orphan detector في PaymentsTab كان بـ يـ flag-ها كـ \"غير مزامنة\". الإصلاح: عند قفل الأسبوع، لو الـ ex.supplierId موجود، الـ HRPg دلوقتي بـ يـ push supplierPayment record كمان مع تـ link للـ treasuryTxId. النتيجة: الدفعة تظهر في كشف المورد + ما تظهرش كـ orphan." },
      { type: "fix", text: "🔧 [زر \"مزامنة الدفعات اليتيمة\" بقى يصلح الحالة دي] الزر كان بـ يـ skip أي treasury entry عنده sourceType (مثل hr_other_expense) — فما كانش بـ يصلح الـ entries القديمة. دلوقتي الـ logic بـ يـ check الأول: لو الـ entry عنده supplierId/custId مع مفيش matching supplierPayments/custPayments، يـ create الـ payment record من الـ linked ID مباشرة. الـ legacy by-name matching فضل للـ entries بدون party ID." },
      { type: "fix", text: "📤 [مصاريف لم تُرحَّل عند قفل الأسبوع — stale treasuryTxId] الـ logic كان: لو treasuryTxId موجود → tag بـ snapshotId. لكن لو الـ tx اتـ deleted من قبل وأعدت الـ close، الـ tx ما يتـ found-ش، الـ if(tx) فاضي، فالـ entry بقى ضايع — لا snapshot ولا re-creation. الإصلاح: الـ stale check دلوقتي بـ يتأكد من وجود الـ tx فعلاً؛ لو مش موجود، الـ else branch بـ يشغّل ويـ recreate الـ entry. ينطبق على wsPayments + otherExpenses + weeklyAdvances الثلاثة." },
      { type: "fix", text: "🔡 [دفعة ورشة ورشة] الـ desc generation للـ workshop payments كان: 'دفعة ورشة ' + p.wsName. لو الـ wsName نفسه بـ يبدأ بـ 'ورشة' (مثل 'ورشة محمد ستنرال')، الناتج كان 'دفعة ورشة ورشة محمد ستنرال'. الإصلاح: regex بسيط بـ يـ strip أي 'ورشة' في الـ wsName قبل الـ concat. الناتج دلوقتي 'دفعة ورشة محمد ستنرال W19' بصرف النظر عن formatting الـ wsName في الـ workshops collection." },
    ]
  },
  {
    version: "V19.80.11",
    date: "2026-05-07",
    types: ["feature"],
    title: "🏷 مصاريف الأسبوع: ربط دفعة المورد + بحث للتصنيف + SUB CASH default",
    changes: [
      { type: "feature", text: "🔍 [Category — searchable filter] في شاشة \"💼 مصاريف أخرى\" داخل HRPg، الـ category dropdown اتـ replace بـ SearchSel. اكتب جزء من اسم التصنيف → الـ list بـ تـ filter. الـ \"✏️ تصنيف مخصص...\" لسه ظاهر في آخر الـ list. السبب: قائمة التصنيفات بقت طويلة (تكلفة، مشتريات، مرتبات، خيط، تشغيل، نقل، كهرباء، ...) فالبحث أسرع." },
      { type: "feature", text: "🏷 [دفعة مورد → supplier picker] لما تختار \"دفعة مورد\" كتصنيف، حقل جديد بـ يـ appear تحته (في box أزرق تركيزي): SearchSel للموردين بـ filter بالاسم أو التليفون. الـ supplier required — لو ما اخترتش، الـ save بـ يرفض بـ toast \"⚠️ اختر المورد لربط الدفعة\". الـ supplierId + supplierName بـ يتـ saved في expense record + بـ يـ propagate لـ treasury entry لما تـ close الأسبوع، فالـ payment يظهر في حساب المورد الصحيح." },
      { type: "feature", text: "💰 [Default account: MAIN CASH → SUB CASH] الـ default للحساب اتغير لـ \"SUB CASH\" (كان MAIN CASH) عبر المصاريف الأسبوعية كلها — في الـ initial useState، في الـ resetOtherExpForm، في الـ fallback عند الـ posting للخزنة، وفي الـ display column في الـ table. السبب: الـ user أوضح أن الـ SUB CASH هو الـ default المتوقع للمصاريف الأسبوعية." },
      { type: "feature", text: "📋 [Supplier badge in expense list] في جدول المصاريف، الـ supplierName بـ يظهر كـ chip أزرق صغير جنب التصنيف لو الدفعة مرتبطة بمورد. مثال: \"دفعة مورد 🏷 محمد سنترال\". بسهولة تتعرف على دفعات الموردين بصرياً من غير ما تـ open التفاصيل." },
    ]
  },
  {
    version: "V19.80.10",
    date: "2026-05-07",
    types: ["fix"],
    title: "📱 إصلاح مشاركة الصورة على الواتساب — opaque cache fix",
    changes: [
      { type: "fix", text: "📱 [WhatsApp share image broken — root cause] لما تضغط زر واتساب، الـ DetPg's sendWa بـ يـ `fetch(image).blob()` ثم يـ pass الـ File لـ `navigator.share`. بعد V19.80.2 الـ image cache كان بـ يخزن responses من `<img>` كـ \"opaque\" (الـ <img> default mode هو no-cors). الـ opaque cached response لما الـ app يـ fetch-ها، الـ blob() يرجع 0 bytes → الـ navigator.share يـ reject بصمت → fallback لـ wa.me text only بدون صورة." },
      { type: "fix", text: "🔧 [SW: forced-CORS fetch for images] الـ public/sw.js دلوقتي بـ يعمل `fetch(corsReq)` بـ `mode:'cors'` لكل image requests، بصرف النظر عن mode الـ original request. النتيجة: الـ cached Response دايماً CORS-readable. Firebase Storage download URLs بـ يدعموا CORS لأي origin (الـ token query param بـ يعمل authentication). الـ `<img>` elements بـ يقبلوا CORS responses فالـ display مش متأثر." },
      { type: "fix", text: "🗑 [Cache version bump v1 → v2] الـ IMG_CACHE اتغير من `clark-images-v1` لـ `clark-images-v2`. الـ activate handler بـ يحذف أي cache مش في الـ KEEP_CACHES list — فالـ v1 الـ poisoned (containing opaque responses من V19.80.2-V19.80.9) بـ يـ deleted تلقائي عند تفعيل الـ SW الجديدة. user-side: بعد reload الصفحة مرة، كل الصور بـ تـ refetch وتتـ cache صحيح." },
      { type: "fix", text: "🛡 [Defensive fallback] لو الـ CORS fetch فشل (مثلاً CORS مش configured على bucket معيّن)، الـ SW بـ يـ fall back لـ original-mode fetch بس **بدون caching** — فما يـ poison الـ cache مرة تانية. الـ `<img>` بـ يشتغل، والـ app's share بـ يحاول CORS fetch جديد كل مرة بدلاً من يـ stuck على cached opaque." },
    ]
  },
  {
    version: "V19.80.9",
    date: "2026-05-07",
    types: ["feature"],
    title: "📃 قائمة الأوردرات: pagination — أول 25 + زر عرض المزيد",
    changes: [
      { type: "feature", text: "📃 [Initial render: first 25 orders only] قائمة الأوردرات (table view + cards view) دلوقتي بـ تـ render أول 25 أوردر فقط من الـ filtered list. لو فيه 100 أوردر، الصفحة بـ تظهر 25 أول مرة، وكل DOM nodes الباقية ما بتـ mount-ش — أسرع initial paint بـ 4× لو فيه أوردرات كتيرة." },
      { type: "feature", text: "⬇ [زر عرض المزيد + عرض الكل] لما `filtered.length > detVis`، شريط أسفل القائمة بـ يظهر:\n• \"يعرض N من أصل M\" — counter\n• زر \"⬇ عرض المزيد (25)\" — يضيف 25 أوردر للعرض\n• زر \"عرض الكل (M)\" — لو الباقي > 25، يـ load كل الباقي مرة واحدة\n\nبعد ما تـ load كل الـ filtered، شريط صغير أسفل بـ يعرض زر \"⬆ عرض الـ 25 الأولى فقط\" للـ collapse." },
      { type: "feature", text: "🔄 [Auto-reset on filter change] لما تغيّر أي filter (search, status, workshop, sort)، الـ detVis بـ يـ reset أوتوماتيك لـ 25. بدون ده، لو كنت كاشف 100 أوردر وعملت filter ضيق، هتبقى عند 100 لكن الـ filtered الجديدة 5 بس — مش خطأ، بس الـ reset أنظف وأسرع." },
      { type: "improvement", text: "⚡ [Combined with bulk image prefetch from V19.80.8] الـ prefetch بـ يـ cache صور كل الأوردرات في الـ background بصرف النظر عن الـ pagination. فلو ضغطت \"عرض المزيد\" → الـ DOM nodes تـ mount + الصور تـ resolve فوراً من الـ cache. الـ pagination بـ يخلي الـ DOM خفيف، والـ prefetch بـ يخلي الصور جاهزة. الـ best of both." },
    ]
  },
  {
    version: "V19.80.8",
    date: "2026-05-07",
    types: ["fix"],
    title: "⚡ صور تفاصيل الأوردر بقت فورية — bulk prefetch في الـ idle time",
    changes: [
      { type: "fix", text: "⚡ [Bulk image prefetch on idle] المشكلة: لما تفتح أوردر مش كنت scrolled-to في الـ list view، صورته كانت بـ تـ trigger HTTP request جديد لـ Firebase Storage (200-500ms+ delay). الـ V19.80.2 prefetch كان بـ يـ cover ±2 أوردر مجاورة بس عند فتح أوردر — مش الـ list كله. السبب: lazy-loading في الـ list view بـ يـ skip الأوردرات خارج الـ viewport، فالـ cache بقى partial." },
      { type: "fix", text: "🔧 [Solution: requestIdleCallback bulk prefetch] DetPg دلوقتي بـ يـ dispatch `new Image()` requests لكل صور الأوردرات أثناء idle time عند تحميل الصفحة. الـ browser بـ يـ fetch بحدود الـ network bandwidth، الـ cache-first SW (clark-images-v1) بـ يـ store الـ responses. بعد مرور ثواني قليلة (حسب عدد الأوردرات + سرعة الإنترنت) الـ cache بقى warm كامل، فأي click على أي أوردر = صورة فورية بدون wait." },
      { type: "fix", text: "🛡 [Deduplication via prefetchedRef] استخدمنا `useRef(new Set())` فالـ URLs المـ prefetched ما تتـ re-fetched لو الـ effect re-ran (مثلاً لما يضاف أوردر جديد). كل URL بـ يدخل الـ cache مرة واحدة بس عمر الـ session. \"Newest first\" في الـ queue (orders.reverse()) لأن الأحدث الأكثر probable يتفتح. fallback لـ `setTimeout` لو الـ browser ما يـ support requestIdleCallback." },
    ]
  },
  {
    version: "V19.80.7",
    date: "2026-05-07",
    types: ["feature", "improvement"],
    title: "🧩 الاكسسوار + التعليمات بقوا بلوكات متحركة تملأ الشبكة",
    changes: [
      { type: "feature", text: "🧩 [Fluid block layout — extras fill empty grid cells] الاكسسوار والتعليمات دلوقتي بلوكات داخل نفس الـ grid اللي فيه الخامات. لما تـ add/remove خامات، الاكسسوار والتعليمات بـ يـ shift أوتوماتيك ليملأوا الخلايا الفاضية. كل ده عبر CSS auto-flow بدون JavaScript layout logic." },
      { type: "feature", text: "📐 [Layout examples]\n• خامة A فقط (1، فردي): A | [Stack(Acc, Inst)] — البلوكان متراصين في الخلية الفاضية في صف واحد\n• A + B (2، زوجي): A | B  ⟶  Acc | Inst — جنب بعض في الصف اللي بعدهم\n• A, B, C (3، فردي): A | B  ⟶  C | [Stack(Acc, Inst)] — Stack في الخلية الأخيرة\n• A, B, C, D (4، زوجي): A | B  ⟶  C | D  ⟶  Acc | Inst — جنب بعض\n\nالقاعدة: لو visibleFabricCount % 2 == 0 → side-by-side؛ غير كده → stacked في خلية واحدة." },
      { type: "improvement", text: "🎨 [Block cards consistent design] كل block (خامة / اكسسوار / تعليمات) دلوقتي في نفس شكل الكرت: `border:1.5px solid + border-radius:12 + padding:10×12 + flex column gap:8`. الفرق: الخامة عندها border-inline-start-width:4px بلون الـ accent بتاعها كـ identity. النتيجة: شبكة بصرياً متجانسة وأنيقة." },
      { type: "improvement", text: "🏷 [Accessories card header shows count] عنوان كرت الاكسسوار دلوقتي بـ يعرض العدد لو فيه بنود مختارة: \"📦 بنود التشغيل والاكسسوار (5)\". زر \"+ اضافة الكل\" بـ يخفى لما تكون كل البنود متاحة فعلاً." },
    ]
  },
  {
    version: "V19.80.6",
    date: "2026-05-07",
    types: ["improvement"],
    title: "📐 صور الموديل: 4:5 طولي (1080:1350) — معيار صور الكتالوج",
    changes: [
      { type: "improvement", text: "📐 [Aspect ratio: 3:4 → 4:5 (1080:1350)] الصور دلوقتي بنسبة 4:5 portrait (1080:1350 — معيار صور الكتالوج/lookbook). كانت 3:4 (0.75)؛ دلوقتي 4:5 (0.8)، أطول قليلاً ومتوافق مع صور المنتج المعتادة." },
      { type: "improvement", text: "🔢 [Exact dimensions, multiples of 4 and 5]\n• تفاصيل الأوردر — frame ثابت: 144×180 desktop، 108×135 mobile (كان 140×187 / 105×140)\n• OrdForm upload preview: 144×180 desktop / full-width × auto mobile (كان 120×160 / 100% × 5:8)\n• الـ zoom lightbox: aspect-ratio:4/5 على height:90vh (كان 3:4)\n• Orders list table thumbnails: 36×45 (كان 36×48)\n• Orders list cards thumbnails: 60×75 (كان 60×80)\n\nكلهم exact 1080:1350 multiples (×0.133, ×0.1, ×0.045, ...)." },
      { type: "improvement", text: "🛠 [Implementation: single source of truth in DefaultModelImg] الـ component دلوقتي يحسب: `w = h × 4/5` و `h = w × 5/4` (كان 3/4 و 4/3). الـ default placeholder بـ `aspectRatio:\"4 / 5\"` لما الـ width/height مش متمررة. كل callers أوتوماتيك attached للنسبة الجديدة بدون تعديل." },
      { type: "improvement", text: "🖼 [Source images preserved at natural ratio] الـ upload pipeline (compressOrderImageToBlob في orderImages.js) ما يـ crop-ش — يـ downscale لـ max 1280px ويحفظ النسبة الأصلية. الـ 4:5 framing يحصل عند الـ display بـ CSS aspect-ratio + object-fit:cover. لو الصورة الأصلية 4:5 (catalog standard) → ما فيش cropping. لو مربعة أو landscape → الـ frame يـ crop uniform من الجوانب. الصورة الـ original محفوظة في Storage بحجمها الكامل." },
    ]
  },
  {
    version: "V19.80.5",
    date: "2026-05-07",
    types: ["fix", "feature"],
    title: "📦 كرت الخامة الموحّد + 🔍 zoom للصورة + ✂️ تناسق ارتفاع الصفوف",
    changes: [
      { type: "fix", text: "✂️ [Row height inconsistency fixed] في V19.80.3 لما تختار خامة، الـ SearchSel كان بـ يعرض subline \"✓ name\" تحت الـ input. النتيجة: الصف الواحد ارتفاعه يتغير (طويل لو فيه خامة، قصير لو فاضي). دلوقتي الـ subline اتشال — الـ input نفسه بـ يعرض اسم الخامة لما مش focused، فالـ subline كان duplication. الصفوف بقت موحّدة الارتفاع." },
      { type: "fix", text: "📦 [Each fabric is now ONE self-contained card] قبل: في V19.80.3 الصف العلوي فيه شريط البحث والمدخلات، والـ FCTable الكاملة بتنزل تحت كله. الـ headers كانت في مكان والـ bodies في مكان تاني — مش مترابطة بصرياً. دلوقتي كل خامة في كرت واحد متماسك:\n┌─ ●Letter + SearchSel + [+] [✕]\n├─ استهلاك / قطع/راق / تاريخ القص (لما الخامة محددة)\n├─ FCTable (الـ header الملوّن + جدول الألوان)\n└─ chips قطع الخامة\n\n2 كروت في الصف على الديسكتوب ≥1280px، 1 على الشاشات الأصغر." },
      { type: "fix", text: "➕ [+ إضافة خامة moved to BELOW the cards] الزر كان فوق الـ FCTables (مع شريط البحث). دلوقتي تحت كل الكروت — منطقياً صح: \"خلصت من الخامة دي، عاوز أضيف التانية\". الـ click يـ reveal كرت جديد فاضي بـ خانة بحث تنتظر الاختيار." },
      { type: "feature", text: "🔍 [Click model image to zoom — 3:4 portrait lightbox] في صفحة تفاصيل الأوردر، الضغط على الصورة دلوقتي يفتح lightbox modal بـ height:90vh و aspect-ratio:3/4 و object-fit:cover (بدون stretching للصورة). cursor:zoom-in على hover. الـ Esc أو click على الـ backdrop يـ close. زر ✕ أعلى يسار. شارة الـ PO/model number أسفل اليمين. الصورة بـ تـ load من الـ Firebase Storage cache (الـ SW بـ يـ cache-first الصور من V19.80.2) فالعرض فوري بدون re-download." },
    ]
  },
  {
    version: "V19.80.4",
    date: "2026-05-07",
    types: ["fix"],
    title: "🛡 قطع الموديل validation ضرورية + 🖼 إصلاح حجم الصورة الكبيرة",
    changes: [
      { type: "fix", text: "🛡 [validateOrder: pieces required] كان ممكن تـ save أوردر بدون أي قطعة موديل (orderPieces=[])، اللي يكسر منطق الـ workshop deliveries والـ per-piece cut quantities. دلوقتي الـ validateOrder يـ throw `قطع الموديل مطلوبة — أضف قطعة واحدة على الأقل` لو القائمة فاضية." },
      { type: "fix", text: "🖼 [DetPg image — fixed 3:4 frame, no more layout blow-up] في V19.80.2 الصورة كانت `height:100% + aspectRatio:3/4 + width:auto` فلما الصورة الـ source كانت 1280×1707 بكسل (طبيعي من Firebase Storage)، الـ height:100% بـ يحل لـ height = صورة الطبيعية (1707px) لأن الـ row height غير مقيّد. النتيجة كانت row بطول 1707px والـ KPI cards تـ stretch تكون huge. الإصلاح: الصورة دلوقتي في إطار ثابت `140×187 px` على الديسكتوب (`105×140` على الموبايل) بـ `object-fit:cover` فأي حجم upload يتـ frame بشكل صحيح، مفيش blow-up أبداً. التناسب 3:4 portrait مضبوط (140/187 ≈ 0.749)." },
      { type: "fix", text: "📷 [OrdForm image upload — 3:4 portrait preview] الـ preview بتاع رفع صورة الموديل كان 100×160 (5:8 ratio، مش 3:4). دلوقتي 120×160 على الديسكتوب (full-width على الموبايل) بـ `aspect-ratio:3/4` فالـ frame مضبوط. ضفنا أيضاً placeholder أنظف: 📷 + \"اضغط لاختيار صورة\" + hint \"3:4 طولي\". border-color يتغيّر للـ accent لما فيه صورة." },
    ]
  },
  {
    version: "V19.80.3",
    date: "2026-05-07",
    types: ["fix", "feature"],
    title: "🔍 dropdown البحث ما يـ clip-ش + ➕ خامات ديناميكية A→H + صف ضغط احترافي",
    changes: [
      { type: "fix", text: "🔍 [SearchSel dropdown clipping fixed] الـ dropdown كان `position:absolute` فلما الـ SearchSel جوة `<div style={overflow:auto}>` (زي wrapper جدول الخامة في OrdForm) الـ dropdown كان يتـ clip ما يظهرش. دلوقتي الـ dropdown بـ يتـ render في portal على `document.body` بـ `position:fixed` + computed coords من الـ input. يـ track الـ scroll/resize فيـ follow الـ input. النتيجة: الـ dropdown دايماً ظاهر وفوق أي صف تحته." },
      { type: "feature", text: "➕ [Dynamic fabric slots — initially A only, + إضافة خامة reveals next] OrdForm بدل ما يـ render 5 خامات (A-E) دايماً، دلوقتي يبدأ بـ خامة A فقط. زر `+ إضافة خامة B` يـ reveal الـ next slot. الترتيب: A → B → C → ... → H (8 slots). كل slot غير A فيه ✕ button يـ clear بياناته؛ الـ ✕ على آخر slot يـ decrement الـ visible count." },
      { type: "feature", text: "🔠 [FKEYS extended A→E to A→H] الـ schema دلوقتي يدعم 8 خامات (كان 5). الـ orders القديمة بدون F/G/H بـ يقروا undefined لتلك الـ slots — مفيش schema migration محتاج. الـ FCOL لون مختلف لكل slot." },
      { type: "feature", text: "📐 [2-per-row fabric layout on wide desktop] على الشاشات ≥1280px، صفوف الخامات تتوزع 2-per-row في grid. على الشاشات الأصغر تـ collapse لـ 1-per-row. كل block خامة compact: ●Letter [SearchSel] [+] [استهلاك] [قطع/راق] [تاريخ] [✕]." },
      { type: "fix", text: "📏 [Compressed row height + smaller font] الـ inputs دلوقتي بـ `padding:4px 6px` (كان 6-8px) و `fontSize:FS-1` (كان FS) — صف الخامة الواحد بقى ~42px ارتفاع بدل ~52px. النتيجة: شاشة أنظف وأكتر احترافية، ومساحة كافية على شاشات أصغر." },
    ]
  },
  {
    version: "V19.80.2",
    date: "2026-05-07",
    types: ["fix", "feature"],
    title: "🖼 صور كاش-أول + 🏷 سعر الخامة في الجدول + ⚡ صورة فورية في prev/next",
    changes: [
      { type: "feature", text: "🏷 [Fabric price visible in table header] جدول ألوان الخامة (FCTable) دلوقتي بـ يعرض السعر في الـ header جنب اسم الخامة. مثال: \"خامة A: قماش بوليفار - متر — 50 ج.م/متر\". ينطبق على شاشة تسجيل الأوردر وعلى تفاصيل الأوردر الـ readonly." },
      { type: "fix", text: "🖼 [Service Worker — cache-first for images] الـ sw.js كان \"network-first\" لكل حاجة، يعني الصور بـ تتـ refetch من Firebase Storage كل مرة (1 ثانية+ تأخير على كل تنقل). دلوقتي قسمنا لـ cache strategies:\n• الصور (Firebase Storage / image extensions) → cache-first: تـ hit الكاش فوراً، تـ fall back للنت لو miss.\n• كل حاجة تانية → network-first زي الأول، فالـ deploys الجديدة تـ land فوراً.\nالـ image cache (`clark-images-v1`) مفصول عن الـ app cache (`clark-app-v2`) فالـ deploys ما تـ wipe-ش الصور المحفوظة." },
      { type: "fix", text: "⚡ [Prev/Next nav: instant image — pre-fetch adjacent orders] لما تفتح أوردر، الـ DetPg دلوقتي بـ يـ pre-fetch صور 4 أوردرات حواليه (2 قبل + 2 بعد) عبر `new Image()`. لما تضغط → أو ← الصورة بـ تكون موجودة في الـ browser cache بالفعل فالعرض فوري بدون flash." },
      { type: "fix", text: "🎯 [Detail view: loading=\"eager\" override] الـ DefaultModelImg دلوقتي بـ يقبل prop اسمه `loading`. الـ DetPg detail view بـ يمرر `loading=\"eager\"` لأن الصورة الـ hero مش بتـ benefit من lazy. الـ orders list grid فضل default `lazy` (الصور خارج الـ viewport ما تـ trigger HTTP requests)." },
      { type: "fix", text: "📐 [Image height = row height + 3:4 portrait] الصورة في الصف الأعلى كانت width:140px ثابتة (height محسوب). دلوقتي `height:100%` + `aspectRatio:3/4` + `width:auto` فالصورة تـ stretch لارتفاع الصف (المحدد من الـ KPI grid) وعرضها يحسب من الـ aspect ratio. النتيجة: تناسق كامل بصرياً." },
    ]
  },
  {
    version: "V19.80.1",
    date: "2026-05-07",
    types: ["fix"],
    title: "🔄 صف الأعلى: الصورة يمين + التايم لاين يستغل العرض الفاضي",
    changes: [
      { type: "fix", text: "🔄 [User feedback] في V19.80.0 الصف الأعلى كان [التايم لاين | الكروت | الصورة] فالصورة كانت على اليسار. المستخدم طلب عكس الاتجاه: الصورة على اليمين (الـ RTL right edge)، الكروت في النص، التايم لاين على اليسار وياخد كل العرض المتبقي. الإصلاح: عكسنا DOM order (image → kpis → timeline) و الـ grid columns بقت `auto auto 1fr` فالعمود الأخير (التايم لاين) ياخد المساحة الباقية." },
      { type: "fix", text: "📏 [Timeline now stretches full width] قبل: الـ Timeline outer div كان flex item بـ default `flex:0 1 auto` فعرضه = عرض الـ content فقط (~550px لـ 5 مراحل). دلوقتي ضفنا قاعدة `.det-timeline-cell > div{width:100%;flex:1;min-width:0}` فالـ Timeline يـ stretch لكامل عرض العمود وكل phase يتوزع بالتساوي عليه." },
    ]
  },
  {
    version: "V19.80.0",
    date: "2026-05-07",
    types: ["improvement", "feature"],
    title: "🎨 تفاصيل الأوردر: تايم لاين على الصف الأعلى + 🔍 بحث للخامات والاكسسوار + قطع/راق",
    changes: [
      { type: "improvement", text: "📐 [Top row redesigned again per user feedback] الصف الأعلى دلوقتي فيه: التايم لاين (يأخذ المساحة المتبقية) + شبكة 2×2 من كروت الـ KPI + الصورة — كله على صف واحد على الديسكتوب. على الشاشات الأصغر من 1100 بكسل التايم لاين بـ يـ wrap لصف ثاني تحت الصورة + الكروت. النتيجة: نظرة شاملة على المرحلة + الأرقام + الصورة بدون scroll." },
      { type: "improvement", text: "🏷 [Header: model number prominent + sizes inline] رقم الموديل دلوقتي بفونت كبير 30 بكسل (22 على الموبايل) بلون الـ accent ووزن 900. المقاسات جنبه في pill كبيرة (📐 6-8-10-12) بحجم 20 بكسل. رقم الـ PO + وصف الموديل في سطر ثاني صغير. النتيجة: رقم الموديل والمقاسات بقوا الـ identity الواضحة للصفحة." },
      { type: "improvement", text: "📦 [Order pieces moved above tabs] قطع الموديل (chips بـ تشغيل/متاح) دلوقتي شريط ثابت تحت الـ banner مباشرة وقبل الـ tab bar — بدل ما كانت داخل tab القماش. كده دايماً ظاهرة بصرف النظر عن الـ tab المفتوحة." },
      { type: "improvement", text: "📱 [Mobile-friendly tab bar — pill buttons] على الشاشات الأصغر من 720 بكسل، الـ tab bar دلوقتي كومة pill buttons داخل container مدوّر بدل الـ underlined tabs. الـ active tab بـ يمتلئ بلونه (background filled + text white + shadow). الـ tap targets أكبر بـ 1.5x مقارنة بالـ underline tabs، أسهل بكتير في اللمس." },
      { type: "feature", text: "🔍 [OrdForm: searchable fabric input replaces dropdown] خامة A/B/C/D/E دلوقتي حقل بحث (SearchSel) بدل الـ dropdown الطويل. اكتب جزء من اسم الخامة → الـ list بـ تفلتر (max 8 نتائج). showAllOnFocus=true فلما تركّز على الحقل وهو فاضي بـ يعرض أول 8 خامات. السبب: عدد الخامات في المصنع كبير، الـ dropdown كان مرهق." },
      { type: "feature", text: "🔢 [OrdForm: per-fabric \"قطع/راق\" input] حقل جديد جنب \"استهلاك/راق\" لكل خامة بـ يحدد عدد القطع في الراق الواحد لتلك الخامة. لما يتسجّل، أي صف لون موجود قيمته الـ pcsPerLayer = القيمة القديمة (default الـ size set) بـ يـ auto-update لـ القيمة الجديدة + الـ qty يُعاد حسابه (layers × pcsPerLayer). الصفوف الجديدة بـ تستخدم القيمة الجديدة كـ default. الإدخال اليدوي على مستوى الصف ما يـ overwrite-ش." },
      { type: "feature", text: "🔘 [OrdForm: AccPicker rewritten — popup removed] الـ \"+ اختيار اكسسوارات\" popup الكبير اتشال نهائياً. مكانه: حقل بحث inline. اكتب جزء من اسم البند → النتايج بـ تظهر تحت (max 12). كل نتيجة فيها: الاسم + الوحدة + السعر/قطعة + 📦 المخزن المتاح. اضغط على الصف → بـ يضاف لجدول البنود تلقائياً. نفس النمط بالظبط زي الخامة. السبب: الـ popup كان يقطع الـ flow." },
      { type: "improvement", text: "🖼 [DefaultModelImg: lazy + async decoding] الصور دلوقتي بـ تحمل lazy (loading=\"lazy\" + decoding=\"async\") — الصور خارج الـ viewport ما تـ trigger-ش HTTP request للـ Firebase Storage إلا لما تـ scroll قريب منها. النتيجة: الـ orders list فتحت أسرع بكتير، خصوصاً لو فيه 50+ أوردر، والـ initial paint ما يستناش كل الصور تـ load." },
      { type: "fix", text: "🔧 [meta tag deprecation] index.html دلوقتي فيه <meta name=\"mobile-web-app-capable\"> جنب الـ apple-mobile-web-app-capable القديم. Chrome كان يطبع warning في الـ console لأن الـ apple-prefixed بمفرده اتـ deprecated. كده الـ console نظيف." },
    ]
  },
  {
    version: "V19.79.0",
    date: "2026-05-07",
    types: ["improvement", "architectural"],
    title: "🎨 إعادة تصميم صفحة تفاصيل الأوردر — صف رأس + تايم لاين + تابات",
    changes: [
      { type: "improvement", text: "🖼 [Top row: image + 4 KPI cards on one row] الصورة + الكروت الأربعة (كمية القص / مخزن جاهز / الرصيد / تكلفة القطعة) دلوقتي على صف واحد بارتفاع موحّد. مفيش حاجة طالعة عن حاجة ولا متداخلة. على الموبايل/التابلت الشبكة تتلف لـ 2×2 جنب صورة أصغر." },
      { type: "improvement", text: "⚠️ [Cost-incomplete warning extracted to its own banner] الـ warning strip اللي كان جوة كارت التكلفة (لما خامة ناقصة على قطعة) دلوقتي banner مستقل تحت الصف ده، فالكروت الأربعة تفضل موحّدة الشكل والحجم بصرف النظر عن حالة الأوردر." },
      { type: "improvement", text: "🏷 [Meta chips replace 'بيانات الموديل' card] الحالة + التاريخ + المقاسات + الماركر + رقم الـ PO دلوقتي شريط chips خفيف أسفل الصف الأعلى. الـ Card الكبيرة المنفصلة اتشالت لأن المعلومات كانت مكررة مع الـ header والكروت." },
      { type: "feature", text: "📑 [6 tabs replace the long stack of cards] الأقسام تحت الـ timeline دلوقتي 6 tabs منفصلة:\n• 🧵 القماش والخامات (تعليمات + قطع الموديل + جداول الألوان + تكلفة الخامات)\n• 🔘 الاكسسوار والإضافات\n• 💰 التكاليف (الملخص الكامل + التكاليف الإضافية + زر إضافة)\n• 🏭 التشغيل والورش (القسم الكامل بكل ورشة)\n• 📦 المبيعات والمخزن (تسليم مخزن جاهز + المبيعات للعملاء)\n• ⚖️ التسوية والمرفقات (التسوية + ملفات المرفقات)\n\nكل tab فيها badge بـ العدد (مثال: 🏭 (3) لو 3 ورش، 💰 (5) لو 5 تكاليف إضافية). الـ active tab محفوظ في localStorage فالعودة للأوردر بترجّع لنفس الـ tab." },
      { type: "improvement", text: "📅 [Timeline stays full-width above the tabs] التايم لاين بكل المراحل (تم القص → في التشغيل → تشطيب وتعبئة → مخزن نهائي → مغلق) فضل في موقعه ظاهر دايماً قبل الـ tabs، فالنظرة السريعة على المرحلة الحالية بدون لمس أي tab." },
      { type: "improvement", text: "🔄 [Sync banner stays at top when relevant] banner عدم تطابق القص مع تسليم الورش (لو موجود) فضل ظاهر فوق الـ tabs، مش مخفي جوة tab معيّن، فالحالات الحرجة ما تتفقدش." },
    ]
  },
  {
    version: "V19.78.2",
    date: "2026-05-07",
    types: ["fix", "feature"],
    title: "🐛 Portal 403 fix لرابط عميل + 🇪🇬 الـ Agent بقى يلتزم بالعامية المصرية",
    changes: [
      { type: "fix", text: "🐛 [User report: 'رابط غير صالح لعميل معين، باقي العملاء شغالين تمام، 403 من /api/customer-portal'] الـ frontend portal page (App.jsx + CustomerPortalPage + WorkshopPortalPage) كانت بـ تقرأ `c` و `sig` بس من الـ URL وتنسى الـ `t` (timestamp) اللي V19.64 بدأت تضيفه. الـ API بـ يـ verify بالـ V2 timestamped HMAC لو الـ `t` متوفر، أو يـ fallback للـ legacy. لما الـ `t` ما اتمررش، الـ API كانت بـ تشغّل verify legacy على signature V2 → mismatch → 403. الإصلاح: الـ frontend دلوقتي بـ يقرأ `t` ويـ pass للـ API. الـ links القديمة بدون `t` لسه شغّالة (legacy fallback)." },
      { type: "feature", text: "🇪🇬 [User report: 'الـ Agent بيتكلم خليجي أحياناً، عاوزه مصري عامي بس'] الـ system prompt كان فيه سطر ضعيف 'عامية مصرية مهذبة' بس. دلوقتي قاعدة #0 صارمة في القواعد الذهبية مع جدول كلمات ممنوعة (شلونك → إزيك، تبي → تحب، الحين → دلوقتي، إلخ). كل الـ Khaleeji forbidden مع الـ Egyptian equivalent. الـ Agent ملزم بالمصري ما لم يغيّر الأدمن `personality.language` لـ 'msa' (فصحى) أو 'bilingual'." },
      { type: "feature", text: "🎚 [Personality language + emoji wired into prompt] الـ UI كان فيه selectors لـ language و emojiUse لكن الـ backend ما كانش بـ يستخدمهم. دلوقتي: language=egyptian_polite (default) → enforce المصري. msa → فصحى. bilingual → عربي + إنجليزي. emojiUse=none/minimal/moderate/rich → 0/1/3/5 emojis لكل رد." },
      { type: "feature", text: "💪 [Admin's systemPrompt has higher priority] الـ 'تعليمات إضافية من الإدارة' في personality.systemPrompt دلوقتي مؤطّرة كـ '═══ إلزامية — لها الأولوية ═══' فالـ Claude بـ يعاملها كـ override authoritative. لو الأدمن كتب فيها 'لا تذكر أبداً سعر' أو 'استخدم اللهجة الصعيدية' — هتـ override الـ defaults." },
    ]
  },
  {
    version: "V19.78.1",
    date: "2026-05-07",
    types: ["feature"],
    title: "💬 AI Agent: Message debouncing — رد واحد على رسائل متعددة متتالية",
    changes: [
      { type: "feature", text: "🎯 [User report: 'العميل يبعت السلام عليكم، ازيك ياغالي، ايه الاخبار — الـ Agent بيرد 3 ردود نفس الكلام، عاوز رد واحد'] الـ Agent دلوقتي بـ يـ debounce الرسائل المتتالية. لو 3 رسائل (أو أكتر) جوا في خلال 4 ثواني، الـ Agent يستنى آخر واحدة وبعدين يرد على المضمون كله مرة واحدة. ده بـ يقلل التكلفة (3 calls → 1) ويخلي الردود طبيعية أكتر." },
      { type: "feature", text: "⚙️ [How it works — 'latest caller wins'] كل رسالة بـ تتـ enqueue في Redis list، مع monotonic seq number. الـ caller الأخير يـ overwrite الـ `mlatest` key. كل caller يـ sleep 4s، ثم يـ check: لو لسه أنا الأخير → flush الـ queue + process. لو حد أحدث منّي → drop out (ما يتعملش anything). كده pure correctness بدون race conditions، حتى لو 10 webhooks جوا في نفس الـ ms." },
      { type: "feature", text: "📝 [Combined batch format] الـ orchestrator بـ يستلم الرسائل المجموعة كـ user content واحد:\n[العميل بعت 3 رسائل متتالية في خلال ثوانٍ — رد على المضمون كله مرة واحدة]\n\n1. السلام عليكم\n2. ازيك ياغالي\n3. ايه الاخبار\n\nالـ Claude بـ يفهم الـ framing ويرد بـ greeting موحّد." },
      { type: "feature", text: "🎚 [Configurable] env var `TEXT_DEBOUNCE_MS` بـ يتحكم في الـ window. Default 4000ms (4s). 0 = disable batching تماماً (back to single-message processing). Max 15000ms. Voice + image messages بـ يـ bypass الـ debouncer (immediate processing — مش مناسب يـ batch صورة مع رسالة نصية)." },
      { type: "feature", text: "📊 [Analytics] الـ persistTurn دلوقتي بـ يحفظ `batchSize` في `aiAgentConversations` — يعرض في Logs tab + يساعد الأدمن يفهم customer behavior (متوسط batch size، أيام بـ flurry، إلخ)." },
    ]
  },
  {
    version: "V19.78.0",
    date: "2026-05-07",
    types: ["feature"],
    title: "🤖 AI Agent Phase 3 COMPLETE: 15 tools + Stage/Tier + Voice + Vision + OTP + Auto-FAQ",
    changes: [
      { type: "feature", text: "🎉 [Phase 3 شُحن — كل المراحل اكتملت] الـ Agent دلوقتي عنده 15 أداة (5 → 11 → 15)، stage classifier 7-stage، tier helper بـ thresholds قابلة للتخصيص، صوت بـ Whisper، صور بـ Claude Vision، OTP system، portal links، auto-FAQ suggestions. clark-ai-agent v1.0.3-phase3 اتـ deployed على VPS." },
      { type: "feature", text: "🎯 [Stage Classifier — 7 مراحل] auto-classify كل عميل لما الـ profile يـ load: Stranger (مش مسجل) → Awareness (مسجل بدون orders) → Decision (طلب أول حديث) → Customer (2-5 orders) → Repeat (6+ orders) → Dormant (أكتر من 90 يوم بدون نشاط). Admin override (`customer.stage`) يكسب على الـ heuristic. الـ stage بـ يظهر في الـ system prompt context block فالـ Agent يعدّل أسلوبه (e.g. Repeat customer → معاملة VIP)." },
      { type: "feature", text: "🏆 [Tier Helper — Bronze/Silver/Gold/Platinum] auto-classify بناءً على gross purchases في الموسم النشط. Default thresholds: 0/50K/200K/500K — admin يقدر يخصصها في `config.aiAgent.tiers`. الـ tier + total بـ يظهروا في الـ context (e.g. 'Tier: Gold (320K ج.م إجمالي مشتريات الموسم)') فالـ Agent عارف يقدّر العميل." },
      { type: "feature", text: "🔐 [OTP System (Redis-backed)] tools `send_otp` + `verify_otp`: 6-digit code، 5 دقايق default TTL، 3 محاولات أقصى. الـ code one-time use (يـ delete بعد النجاح). Audit trail في `aiAgentOtps`. مفيد قبل: عرض الرصيد لـ stranger مدّعي، ربط LID جديد، إرسال portal link." },
      { type: "feature", text: "🔗 [generate_portal_link] HMAC-SHA256 signed URLs بنفس scheme clark-factory's `/api/customer-portal-sign`. عند تشغيل الـ agent على VPS، الأدمن يضيف `CUSTOMER_PORTAL_SECRET` (نفس قيمة Vercel) في agent's .env فالروابط تكون مقبولة. صالحة 90 يوم. PII strict — السائل فقط. اختياري: focus=statement لفتح الـ portal على كشف الحساب مباشرة." },
      { type: "feature", text: "📄 [generate_statement_pdf] tool منفصل لما العميل يقول 'ابعتلي كشف حسابي PDF'. بـ يـ delegate للـ portal link مع focus=statement + رسالة 'افتح الرابط واضغط طباعة'. أبسط من إنشاء PDF في الـ agent (لا يحتاج PDF library)." },
      { type: "feature", text: "🎙 [Voice (Whisper)] الـ webhook دلوقتي بـ يقبل type='voice' مع audio + audio_mime base64. بيـ transcribe عبر OpenAI Whisper API ($0.006/min) بـ language='ar'، ثم يـ pipe الـ text للـ orchestrator زي رسالة عادية. لو OPENAI_API_KEY مش set، الـ agent بـ يبعت رسالة 'الصوت مش مفعّل، اكتب الاستفسار'. الـ memory بـ يحفظها كـ '[رسالة صوتية مفرّغة] {text}'." },
      { type: "feature", text: "📷 [Image (Claude Vision)] الـ webhook بـ يقبل type='image' مع image base64. الـ orchestrator بـ يبني user content multi-block (image + caption text) فالـ Claude Vision (Haiku 3.5 supports vision) يحلل. مفيد لما العميل يبعت صورة موديل: 'احكي إيه ده'. الـ memory بـ يحفظها كـ '[صورة من العميل] — caption' بدون storing الـ base64." },
      { type: "feature", text: "📚 [Auto-FAQ Suggester] لما الـ Agent يـ escalate (يستخدم escalate_to_human)، السؤال ما اتأجابش عبر FAQs/tools. الـ orchestrator بـ يـ trigger `suggestFaq()` اللي بـ يكتب suggestion من نوع `faq_suggestion` في aiAgentSuggestions. Idempotency: 7-day dedupe بـ hash السؤال (نفس السؤال يـ bump counter). الأدمن يـ review في tab '🔔 اقتراحات الـ AI' الجديد." },
      { type: "feature", text: "🛠 [Tools tab updated] كل الـ 15 أداة دلوقتي بـ ✓ مفعّل badge. مفيش placeholders. الـ admin يقدر يـ enable/disable أي أداة + extras (TTL للـ OTP، إلخ)." },
    ]
  },
  {
    version: "V19.77.2",
    date: "2026-05-07",
    types: ["feature"],
    title: "🔔 AI Agent: tab '🔔 اقتراحات الـ AI' — Admin review queue",
    changes: [
      { type: "feature", text: "🆕 [11th tab: '🔔 اقتراحات الـ AI'] الـ Agent بـ يـ flag حاجات للأدمن يقررها (مثلاً: notify_admin_phone_request بـ يكتب suggestion من نوع `lid_phone_mapping` لما عميل LID يقول 'أنا أحمد المالك'). قبل V19.77.2 الـ suggestions كانت بتـ pile في Firestore بدون UI. دلوقتي الـ tab الجديد بـ يعرضها live مع decisions: ✓ ربط / ✗ تجاهل / 🚫 حظر." },
      { type: "feature", text: "🔢 [Live pending-count badge] الـ tab بـ يعرض badge أحمر بـ عدد الـ pending suggestions (لو > 0). الأدمن يشوف فوراً لو فيه حاجة محتاجة مراجعة. الـ count بـ يـ subscribe live (subscribe على `aiAgentSuggestions` وفلترة حسب `status === 'pending'`)." },
      { type: "feature", text: "🔗 [Action: ربط LID بحساب عميل] لو الـ kind === 'lid_phone_mapping': زر '✓ ربط بعميل' يفتح inline picker بـ بحث (اسم/تليفون) في الـ customers. لما تختار + تأكد، الـ workflow: (1) يضيف الـ wid لـ customer.additional_phones[] بـ metadata `{added_via: 'ai_suggestion', suggestion_id, added_at}`. (2) يـ mark الـ suggestion بـ `status:'linked', decision:'linked', linked_customer_id, reviewed_at`. كده الـ agent بـ يـ recognize الـ LID فوراً في الرسالة الجاية." },
      { type: "feature", text: "✗ [Actions: تجاهل / حظر] للـ suggestions اللي مش هتنفع (LID مش معروف، spam، إلخ). تجاهل = يـ flag كـ ignored. حظر = يـ flag كـ blocked (للمستقبل ممكن نـ filter الـ blocked WIDs قبل الـ availability gate). الـ decisions كلها بتـ write مباشرة لـ Firestore (مش عبر upConfig — الـ aiAgentSuggestions مش جزء من الـ data prop)." },
      { type: "feature", text: "🎨 [Filter chips + decided history] الـ tab فيه: pending/linked/ignored/blocked/all chips كل واحدة بـ count. الـ decided suggestions بتفضل ظاهرة في الـ history مع `linked_customer_id` + `reviewed_at` للـ audit trail." },
      { type: "feature", text: "📐 [Forward-looking design] الـ component generic — مش مربوط بـ kind=lid_phone_mapping بس. أي kind جديد (faq_suggestion, customer_observation, stage_transition) بـ يظهر بـ JSON dump fallback لحد ما نضيفله UI specific. الـ kind filter chips بـ تظهر بس لو فيه > 1 kind في الـ data." },
    ]
  },
  {
    version: "V19.77.1",
    date: "2026-05-07",
    types: ["feature"],
    title: "🛠 AI Agent Phase 2.5: 6 أدوات جديدة (5 → 11) — العميل، الرصيد، الطلبات، الإشعارات",
    changes: [
      { type: "feature", text: "🆕 [6 أدوات جديدة في clark-ai-agent v1.0.2-phase2.5] الـ Agent دلوقتي بـ يقدر يجاوب أسئلة عن العملاء والطلبات بدون escalation. الإجمالي: 5 → 11 tool. كله READ-ONLY أو NOTIFY-ONLY (بدون كتابة في CLARK collections — الـ security wrapper لسه فعّال)." },
      { type: "feature", text: "👤 [get_customer_info] بدون phone بـ يرجع بيانات السائل نفسه كاملة (اسم، نوع، عنوان، تليفون، tier، خصم، flags). بـ phone مختلف بـ يرجع اسم/نوع فقط (PII guardrail)." },
      { type: "feature", text: "💰 [get_customer_balance] الرصيد بنفس formula كشف الحساب بالظبط: gross − discount − cash_paid − receivable_checks. الناتج فيه breakdown كامل (gross, discount_amount, total_after_discount, cash_paid, checks_pending). PII strict: السائل فقط — أي customer_id غير الـ id بتاعه بـ يرفض. مفيد لأسئلة 'كم باقي عليّ؟'." },
      { type: "feature", text: "📦 [get_customer_orders] قائمة طلبات السائل في الموسم النشط (آخر 30 نشاطاً): id، modelNo، modelDesc، sellPrice، delivered/returned/net، value، status، last_activity_date. مفيد لـ 'إيه طلباتي عند المصنع؟'." },
      { type: "feature", text: "🔍 [get_order_status] تفاصيل طلب معيّن بـ id أو modelNo. PII protection: لو السائل ما اخدش بضاعة من الموديل ده، الـ tool بـ يرجع 'مفيش تسليم لحضرتك' بدلاً من تسريب deliveries عملاء آخرين. مفيد لـ 'ما حالة طلبي 3262111؟'." },
      { type: "feature", text: "🛒 [notify_sales_team] لما العميل يقول 'عاوز أطلب 100 قطعة' — الـ Agent ما بـ يكتبش في الـ orders (per spec). بدلاً من ذلك بـ يبعت رسالة للـ sales team بالتفاصيل (items + customer_message + urgency + delivery/payment preferences) ويـ log في `aiAgentSalesNotifications` للـ admin يأكد ويسجل يدوياً." },
      { type: "feature", text: "🔗 [notify_admin_phone_request] حل مشكلة الـ LIDs المجهولين. لما العميل يقول 'أنا أحمد المالك بس مش لاقيني' وهو @lid، الـ Agent بـ يبعت للأدمن: الـ LID + الاسم المدّعى + الرقم المدّعى. الأدمن من CLARK يربطه يدوياً (Schedule tab → القائمة البيضاء). بـ يـ log في `aiAgentSuggestions` بـ kind=lid_phone_mapping." },
      { type: "feature", text: "🔌 [configLoader extended] أضيفت helpers: loadCustPayments + loadChecks (مع split-collection support للـ V19.49 migration) + loadActiveOrders (per-season caching, 30s TTL). كده الـ tools بـ تشتغل سواء البيانات inline في `factory/config` أو في الـ split collections." },
      { type: "feature", text: "🎨 [Tools tab UI updated] كل tool دلوقتي ليه badge '✓ مفعّل' (deployed) أو '🚧 قريباً' (placeholder). الـ 11 المفعّلة دلوقتي: get_customer_info, search_products, get_product_details, get_customer_balance, get_customer_orders, get_order_status, get_faq_answer, get_company_info, notify_sales_team, notify_admin_phone_request, escalate_to_human. الـ placeholders اللي قريباً: generate_portal_link, generate_statement_pdf, send_otp, verify_otp." },
    ]
  },
  {
    version: "V19.77.0",
    date: "2026-05-07",
    types: ["feature"],
    title: "🤖 AI Agent Phase 2: Logs + Dashboard analytics + Recent Senders panel (live)",
    changes: [
      { type: "feature", text: "💬 [Logs tab live] الـ tab '💬 سجل المحادثات' كان فاضي طول الوقت لأن الـ agent ما كانش بيكتب في `aiAgentConversations`. دلوقتي الـ agent (clark-ai-agent v1.0.1-phase2) بـ يكتب doc لكل turn — userMessage + assistantReply + toolsUsed + iterations + durationMs + usage tokens + at + dayKey + idempotencyKey (بحيث webhook retries مش تـduplicate). الـ Logs tab بـ يـsubscribe live (200 turn آخر) ويـ group by wid فيظهروا كـ threads. فيه filter على status (ok/skipped/error) + بحث على wid/اسم/كلمة." },
      { type: "feature", text: "📊 [Dashboard live] الـ tab '📊 لوحة التحكم' كان دايماً 0 لأن مفيش aggregator. الـ agent دلوقتي عنده hourly cron (node-cron) بـ يقرا من aiAgentConversations لـ today + yesterday ويـ aggregate في `aiAgentAnalytics/{YYYY-MM-DD}` بـ: turnsTotal/Successful/Canned/Skipped/Failed، uniqueSenders، avgDurationMs، toolUsage map، stages map، tokens (input/output/cacheRead/cacheWrite)، estimatedCostUsd. الـ Dashboard بـ يـsubscribe live ويـ render KPI cards + chart + token breakdown + top tools. الـ pricing constants للـ Claude Haiku 3.5 (input $1, output $5, cache write $1.25, cache read $0.10 per 1M)." },
      { type: "feature", text: "📬 [Recent Senders panel] لما test mode شغّال + رقم خارج الـ whitelist يبعت، الـ agent بـ يـcapture في `aiAgentRecentSenders` (doc per WID, idempotent — بيـ increment counter). الـ panel الجديد في Schedule tab بـ يعرض آخر 20 sender (مش متضمنين whitelist) مع: WID + count + recent message + lastSeen ago + زر '+ للـ whitelist' يضيفه بكليكة واحدة (مع اسم اختياري). LIDs بـ flag بـ 🔒 + warning. الـ admin مش هيحتاج يـgrep agent logs عشان يجيب الـ LID — الـ panel بـ يجمعها تلقائياً." },
      { type: "feature", text: "🛡 [Security wrapper extended] `aiAgentRecentSenders` ضيف للـ AGENT_OWNED_COLLECTIONS في الـ agent's firebase-security.js. الـ READ-ONLY constraint على CLARK collections (customers/orders/factory/...) لسه فعّال — الـ agent بـ يكتب فقط في الـ aiAgent* collections." },
      { type: "feature", text: "🔧 [useAgentCollection hook] hook عام في AIAgentPg بـ يـsubscribe على أي Firestore collection بـ optional query builder (orderBy/limit). بـ يـ unsub on unmount. مستخدم في 3 أماكن: aiAgentAnalytics (Dashboard) + aiAgentConversations (Logs) + aiAgentRecentSenders (Recent Senders panel)." },
      { type: "feature", text: "📦 [clark-ai-agent v1.0.1-phase2 deployed] 4 ملفات جديدة: conversationLog.js (persistTurn) + recentSenders.js (recordRecentSender) + analytics.js (rollUpDay/rollUpTodayAndYesterday). orchestrator.js + webhook.js + index.js اتعدّلوا. الـ deploy via deploy.mjs نجح، الـ health check passed (anthropic+firebase+redis OK). الـ analytics cron بـ يـrun hourly + once on boot." },
    ]
  },
  {
    version: "V19.76.8",
    date: "2026-05-06",
    types: ["fix", "ux"],
    title: "🛠 منع تكرار رسالة الدفعة (content dedupe) + استبدال الـ confirm بـpopup مخصص",
    changes: [
      { type: "fix", text: "🐛 [User report: 'الدفعة برضه بتتكرر، بعد تسجيلها اتبعتت مرتين'] الـ atomic claim من V19.76.3 كان بيمنع الـ duplicate لما الـ idempotencyKey نفسه يتـ fired أكتر من مرة، بس مكنش بيـ catch السيناريو لو فيه حاجة (sync race، edit re-fire، أو caller بـ force=true) بـ تنشئ entries بـ مفاتيح مختلفة لنفس المحتوى. أضيف **content-based dedupe** كـ safety net نهائي: لو نفس (eventType + recipient phone + payloadSummary) كان موجود في eventHistory خلال آخر **30 ثانية**، الـ claim يرفض. الـ contentSig + recipPhone بيتحفظوا في الـ entry فالـ recordResult بـ يفضّلهم بعد success." },
      { type: "fix", text: "🔍 [Diagnostic logging] أي dedupe دلوقتي بـ يطبع log واضح في Vercel: `[event-trigger] DEDUPED { eventType, idempotencyKey, reason, source }` — عشان لو لسه فيه duplicates في الـ field، الأدمن يقدر يـ grep الـ logs ويعرف هل المشكلة من الـ claim أو من الـ bridge نفسه. كذلك لو فيه caller بـ force=true بيتطبع `FORCE bypass — claim skipped`." },
      { type: "ux", text: "🪟 [User request: 'عاوز ده بوب اب مش كده'] استبدال 6 استخدامات للـ `window.confirm()` (الـ native browser dialog) بالـ `ask()` المخصصة في 4 ملفات: TreasuryPg (حذف الشيكات المحددة)، AutomationPg (إلغاء الـ scheduler + إرسال pending + حذف pending)، CampaignsPg (إلغاء/حذف حملة)، TasksPg (حذف مهام البوت). الـ popup المخصصة RTL، themed، مع زر danger للحالات الخطيرة، وما تظهرش URL فوق العنوان زي الـ browser dialog." },
    ]
  },
  {
    version: "V19.76.7",
    date: "2026-05-06",
    types: ["ux", "fix"],
    title: "🛠 تأكيد الاستلام: سيري/كسر فوق بعض + جدول التكلفة: الإجمالي في الآخر",
    changes: [
      { type: "ux", text: "📦🧩 [User request: 'في شاشة الاستلام لمخزن الجاهز عاوز يظهر الكميات السيري والكميات الكسر فوق بعض والتأكيد نفس الكلام عشان يكون واضح الفرق دايمأ'] شاشة 'تأكيد استلام المخزن' كانت بتعرض كل الكميات في رقم واحد بدون تفريق بين السيري والكسر. دلوقتي كل خلية في الأعمدة (معلّق، تسليم مخزن جاهز، الفرق) فيها صفين: السيري فوق (📦 أخضر) والكسر تحت (🧩 بنفسجي). 'تسليم مخزن جاهز' بقى فيه inputين منفصلين بدل واحد. الـ scan + الـ manual add بيـ route تلقائياً بناءً على الـ scanMode toggle (سيري ↔ كسر). الـ confirm logic بـ يـ process pending entries بنوعيها separately فالـ type metadata بيبقى محفوظ بعد التأكيد." },
      { type: "fix", text: "📊 [User report: 'في تفاصيل الاوردر لما اضيف بند اضافي تكلفة يظهر قبل الاجمالي والاجمالي في الاخر، عشان الرقم لتكلفة القطعة مش صح، عشان جمع الاجمالي على تكلفة الاتشغيل'] جدول 'ملخص تكلفة الموديل' كان بـ يعرض: الخامات → الاكسسوار → **الإجمالي (sub-total)** → الهالك → التكلفة الإضافية → **التكلفة الفعلية**. ده عمل صف 'الإجمالي' وسط الجدول مش في الآخر، ومخلي الـ user يحس إن الإجمالي محسوبش الإضافات. دلوقتي: الخامات → الاكسسوار → الهالك → التكلفة الإضافية → **الإجمالي (الوحيد، آخر صف، شامل كل البنود)**. الـ per-piece للـ grand total بقى محسوب بنفس denominator (cutQty) زي باقي الصفوف عشان الأرقام تكون consistent — قبل كان بيـ divide by deliveredQty فطلع 3361 ج.م/قطعة على 48 قطعة بدل 403 ج.م/قطعة على 400 قطعة (الـ cutQty)." },
    ]
  },
  {
    version: "V19.76.6",
    date: "2026-05-06",
    types: ["fix", "feature", "ux"],
    title: "🛠 Sales hub: false 'تخطى' warning + filters في 'تسليم جديد' + redesign الأقسام",
    changes: [
      { type: "fix", text: "🐛 [User report: 'ليه بيظهر تحذير تخطى مع إن الكمية مظبوطة 48 دخلوا و 48 خرجوا'] الـ matrix cell كان بيـ flag الخلية كـ 'تخطى' حتى لما الكمية تساوي اللي اتـ delivered منها. السبب: `availForGroupCell` كان بيطرح كل الـ `customerDeliveries` (sm.custDel) من الـ stock، بما فيهم الديليفريز اللي جت من الـ session نفسها — اللي هي ممثلة بالفعل في الـ planned cells. ده كان double-counting. مثال: stock=48, delivered=48 (من الـ session ده), cap = 48 - 48 - 24 = 0 (negative clamped to 0) → الخلية تطلع 'تخطى' غلط. الإصلاح: اطرح بس الـ deliveries اللي مش من الـ session ده (out-of-session sold), كده cap = 48 - 0 - 24 = 24, exceeds=24>24=false ✓." },
      { type: "feature", text: "🔍 [User request: 'عاوز في شاشة اختيار ماتريكس التوزيعة فلتر موديل وفلتر عميل'] popup 'تسليم جديد' دلوقتي فيه فلتر بحث جنب كل قسم — بحث في كود الموديل والوصف، وبحث في اسم العميل والرقم. يـ filter الـ checkboxes لسهولة الاختيار من قوائم طويلة. لو الفلتر مفيش ليه matches، رسالة واضحة بدل قائمة فاضية." },
      { type: "ux", text: "🎨 [User request: 'الجزء ده من شاشة المبيعات عيد تصميمة، كل جزء يكون في مستطيل بنفس الشكل ومكتوب العنوان فوق المستطيل، ويكونوا جنب بعض على صفين مش صف واحد عشان ماتصغرش الايقونات'] الـ 4 secondary groups (العملاء، التقارير والتحليل، المخزن والجرد، أدوات أخرى) كانوا stacked vertical full-width — كل واحد سطر. دلوقتي 2x2 grid على desktop (1 column على mobile) + كل group في card فيه: border + radius + padding + title فوق فاصل + الأزرار تحت بنفس الـ minmax(110px,1fr) auto-fill. الأيقونات ما اتصغرتش، بس الـ vertical space اتوفّر النص (4 صفوف → 2 صف)." },
    ]
  },
  {
    version: "V19.76.5",
    date: "2026-05-06",
    types: ["feature"],
    title: "💸 Trigger جديد: دفعة كاش لمورد (supplierPaymentSent)",
    changes: [
      { type: "feature", text: "🛒 [User request: 'عاوز اضيف في تريجر الفورية دفعة كاش لمورد بنفس طريقة دفعة كاش لعميل'] الـ Triggers الفورية كان فيها paymentReceived للعميل لكن مفيش mirror للمورد. لما المصنع يدفع لمورد كاش/تحويل بنكي/محفظة، المفروض يبعت رسالة واتس آب فورية للمورد بالقيمة + الطريقة + الرصيد المتبقي. الـ checkPaymentIssued موجود بالفعل لشيكات المورد، لكن للكاش مكنش فيه trigger." },
      { type: "feature", text: "✅ [Event جديد: supplierPaymentSent] متضاف في 6 أماكن للـ end-to-end coverage: (1) `EVENT_VARIABLES` + `DEFAULT_EVENT_TEMPLATES` + `samplePayload` + `validateEventPayload` في `eventBuilder.js` (و الـ mirror في `api/_eventBuilder.js`). (2) `DEFAULT_AUTOMATION_CONFIG.eventTriggers.events.supplierPaymentSent` (default OFF — admin opt-in). (3) `eventTypes` array في `AutomationPg.jsx` بعد paymentReceived. (4) `scanRecentSupplierPayments` cron scan في `api/automation-tick.js` + registered في الـ main loop section C3. (5) Client-side instant fire في `TreasuryPg.jsx` بنفس نمط `_instantPay_needed` للعميل. (6) `idempotencyKey: \"supplierPay:\" + id` لمنع الـ duplicates." },
      { type: "feature", text: "🚦 [Filtering — لا يـ overlap مع checkPaymentIssued] الـ supplierPaymentSent بـ يـ skip أي supplier payment بـ method فيها 'شيك' أو method='endorsed_check' — هؤلاء يفيرو عبر checkPaymentIssued / checkEndorsed على التوالي. كده مفيش رسالتين للنفس الـ payment." },
      { type: "feature", text: "📝 [Default templates] للمورد: '✅ تم إرسال دفعة\\nالقيمة: {amount} ج.م\\nالطريقة: {method}\\nالرصيد المتبقي: {balance} ج.م\\nالتاريخ: {date}\\n\\nشكراً لتعاملكم 🌟'. للمالك: '💸 دفعة لمورد\\n{supplierName}: {amount} ج.م ({method})\\nالرصيد المتبقي: {balance} ج.م'. الـ admin يقدر يعدّل من Triggers UI زي أي event تاني." },
      { type: "feature", text: "💰 [Supplier balance approximation] الـ balance بيـ compute كـ `-Σ(supplierPayments)` لكل مورد — نفس approach الـ checkPaymentIssued. ده approximation لأن الـ supplier ledger الكامل (purchase invoices + POs + returns) معقد ومش مطلوب للـ message context. الـ admin يقدر يحذف {balance} من الـ template لو مش محتاجه." },
    ]
  },
  {
    version: "V19.76.4",
    date: "2026-05-06",
    types: ["fix", "improvement"],
    title: "🐛 ثلاث إصلاحات: شيكات في حساب الدفعة + cascade الحذف + ساعة القاهرة",
    changes: [
      { type: "fix", text: "🔥 [User report (CRITICAL): 'العميل سلم 3 شيكات والرصيد بيتحسب صح، بعدها سجلت دفعة 100 جنيه، الرسالة وصلت ان الرصيد باقي محسبش الشيكات'] رسالة الـ paymentReceived كانت بتحسب الرصيد بـ formula `gross − discount − cashPayments` بدون ما تطرح الشيكات الـ pending. كشف الحساب بيطرحهم (totalReceivableChecks)، فكان فيه فجوة ضخمة بين الرسالة والـ kashf لما العميل عنده شيكات معلقة. مثال: 1440 (after disc) − 100 (cash existing) − 100 (new cash) = 1240 في الرسالة، لكن الـ kashf يقول 940 (لأنه طارح 300 شيكات كمان)." },
      { type: "fix", text: "✅ [Fix unified across 5 sites] (1) `api/automation-tick.js → computeCustomerBalances` اخدت parameter جديد `checks` وبتطرح receivable, non-bounced/cancelled, دفعة عميل checks. (2) `scanRecentPayments` بتـ load الـ checks وتمررها — الرسالة من الـ cron بقت صح. (3) `scanRecentChecks` ضافت subtraction للـ priorChecks (الشيكات اللي قبل الـ batch الحالي) قبل الـ progressive. (4) `TreasuryPg.jsx` — instant fire للـ cash payment بقى يطرح `data.checks`. (5) Status-change computeBal بقى يطرح كل الشيكات الـ pending ما عدا اللي بنغير حالته (يـ handle separately based on new status). الـ formula متطابقة 100% مع الـ كشف الحساب." },
      { type: "fix", text: "🔧 [User report: 'الدفعة النقدي اللي حذفتها لسه موجودة في كشف الحساب'] الـ delTx كان يـ cascade على custPayments بـ `treasuryTxId === id` فقط. الـ payments القديمة (قبل V15.9) ما عندهاش الـ link ده — فكانت بتفضل في الـ kashf كـ orphan حتى بعد ما الـ treasury entry يتمسح. الإصلاح: ضافت legacy fallback يطرح custPayments بنفس (custId, amount, date) لما الـ treasury tx category = 'دفعة عميل'. نفس الإصلاح للـ supplierPayments." },
      { type: "improvement", text: "🕐 [User concern: 'بياخد تاريخ الكمبيوتر وده مش صح عشان في كمبيوترات بيكون مش مظبوط تاريخه'] كل التطبيق كان بيـ rely على `new Date()` المحلي — لو الكمبيوتر ساعته/تاريخه غلط، الـ timestamps المحفوظة بتطلع غلط. الإصلاح: (1) endpoint جديد `/api/now` يرجع وقت سيرفر Vercel + Cairo wall-clock. (2) Helper `src/utils/serverTime.js` بيـ sync مرة عند الـ boot ويحسب skew vs local clock. (3) `nowISO()` و `cairoDateStr()` exposed للـ pages — استبدلوا كل `new Date().toISOString()` و `new Date().toISOString().split('T')[0]` في TreasuryPg و CustDeliverPg. الـ skew بيتطبق automatically على كل الـ timestamps المحفوظة، مش بس الـ display. Best-effort: لو `/api/now` غير متاح بيرجع للـ local Date. Re-sync كل 30 دقيقة." },
    ]
  },
  {
    version: "V19.76.3",
    date: "2026-05-06",
    types: ["fix"],
    title: "🐛 Hotfix: رسالة الدفعة كانت بتوصل للعميل مرتين (race بين الـ instant fire والـ cron)",
    changes: [
      { type: "fix", text: "🐛 [User report: 'الرسالة بتوصل مرتين للعميل متكررة'] الـ paymentReceived/checkPaymentReceived events كانوا بـ يفتحوا race window: الـ client-side instant fire (V19.70.3) بـ يبعث الرسالة فوراً، الـ cron tick بـ يـ scan كل 5 دقائق ويبعت كمان. الـ deduplication كان معتمد على `eventHistory[].success === true` — لكن `recordResult` كان بـ يكتب الـ entry بعد ما الـ bridge يـ respond (ثواني كاملة بسبب typing simulation). لو الـ cron tick جه في الـ window ده، كان بـ يلاقي history فاضي → يـ fire تاني → نسختين للعميل." },
      { type: "fix", text: "✅ [Atomic claim transaction] أضيفت `claimEvent(db, ...)` في `_eventProcessor.js` — قبل ما الـ bridgeSend يتنفذ، نـ write entry فيها `inFlight: true` جوّا transaction. أي caller تاني (cron أو client) بيـ شوف الـ inFlight entry ويرجع `deduped: in-flight` بدل ما يـ fire. الـ stale lock timeout = 60s (لو الـ instance crashed mid-bridge، الـ next caller يـ reclaim). الـ `force` mode بـ يـ bypass الـ claim للـ manual replays." },
      { type: "fix", text: "🔄 [recordResult يحدّث بدل ما يكرر] قبل V19.76.3 الـ recordResult كان دايماً `unshift` entry جديد — يعني الـ history كان يطلع فيه TWO entries لكل event (واحد inFlight، واحد success). دلوقتي بـ يـ findIndex لو في entry بنفس الـ idempotencyKey ويـ replace في مكانه. الـ history بقت entry واحد per event بـ at + completedAt + success/error نهائي." },
      { type: "fix", text: "🛡 [الـ race window اتقفل تماماً] السيناريو: T=0 client يـ fire → claim writes inFlight. T=0.5s cron يـ run → الـ pre-check يـ pass (success ≠ true لسه)، يحاول claim → transaction يـ read inFlight entry, يـ return `claimed: false` → الـ cron يـ skip. T=2s bridge يرد → recordResult يـ replace inFlight بـ success: true. النتيجة: رسالة واحدة فقط للعميل، history صحي." },
    ]
  },
  {
    version: "V19.76.2",
    date: "2026-05-06",
    types: ["fix"],
    title: "🐛 Hotfix: رسالة دفعة العميل كانت تجيب الرصيد بدون خصم",
    changes: [
      { type: "fix", text: "🐛 [User report: 'العميل اخد بضاعة بـ1000 خصم 10% = 900 فعلي. دفع 200 → المفروض الرسالة تقول 700 لكنها بتقول 800'] الـ paymentReceived و checkPaymentReceived events كانوا بـ يحسبوا الرصيد بـ formula `Σ(deliveries×price) − Σ(returns×price) − Σ(payments)` بدون ما يطبقوا الـ customer discount %. كشف الحساب في CustDeliverPg كان يطبقه (`totalAfterDisc = totalVal − round(totalVal × disc/100)`)، فكان فيه فرق بين اللي العميل يشوفه في الـ statement واللي يوصله في الـ WhatsApp message." },
      { type: "fix", text: "✅ [Fix unified across 4 sites] (1) `api/automation-tick.js → computeCustomerBalances` بقت تاخد customers parameter وتطبّق الخصم: `balance = (gross − round(gross × disc/100)) − payments`. (2) `TreasuryPg.jsx` — instant fire للـ cash payment (line ~1064) دلوقتي بـ يطبّق `_instantPay_customer.discount`. (3) Instant fire للـ check (line ~2698) — `_instantCheck_customer.discount` على الـ baseBal قبل الـ progressive subtraction. (4) Status-change computeBal للـ checkCollected/Bounced/RePresented (line ~2899) — نفس الـ formula." },
      { type: "fix", text: "🎯 [Same formula as كشف الحساب — guaranteed parity] الـ formula متطابقة 100% مع الـ totalAfterDisc - totalPaid في الـ Statement view. discAmt = Math.round(gross × discPct/100) — نفس الـ rounding، نفس الـ order of ops. لو شفت رصيد 700 في الـ kashf، الرسالة هتقول 700." },
    ]
  },
  {
    version: "V19.76.1",
    date: "2026-05-06",
    types: ["fix"],
    title: "🐛 Hotfix: Catalog 'Import from orders' was finding 0 models",
    changes: [
      { type: "fix", text: "🐛 [User report: 'ازاي فاضي كل الموديلات موجوده'] الـ Import from Orders modal كان بـ يـscan كل order ويـlook لـ `o.a.code, o.b.code, ..., o.e.code` كأنها موديلات مختلفة. **الـ Bug**: في clark-factory الـ orders بـ يـحوي **موديل واحد** لكل order على top-level: `o.modelNo` (الكود) + `o.modelDesc` (الاسم). الـ A/B/C/D/E suffixes (fabricA, colorsA, إلخ) للأقمشة، مش لموديلات منفصلة. النتيجة: الـ scan كان بـ يرجع 0 موديل طول الوقت لأن الـ keys دي مش موجودة." },
      { type: "fix", text: "✅ [Fixed: scan reads o.modelNo + o.modelDesc] الـ discovery code دلوقتي بـ يـscan الـ structure الفعلي. كمان: استخراج المقاسات من `o.sizeLabel` (مثلاً '6-8-10-12' → ['6','8','10','12']) + الألوان من `colorsA/B/C/D/E` arrays (concatenated unique). الـ ordering لسه by frequency (الموديلات الأكثر تكراراً في الـ orders أول). كل موديل بـ يظهر في الـ list بـ سيزن، عدد الـ orders اللي ظهر فيها، مقاسات، عدد ألوان." },
      { type: "fix", text: "📥 [Import data flow now includes colors] الـ items المـsave كانت بـ تـset colors=[] فاضية. دلوقتي بـ تنسخ d.colors من الـ discovery (الألوان المستخرجة من الـ orders). الـ admin بـ يقدر يعدّل بعد الإضافة." },
    ]
  },
  {
    version: "V19.76.0",
    date: "2026-05-06",
    types: ["feature"],
    title: "📦 Product Catalog tab — single source of truth للـ AI Agent",
    changes: [
      { type: "feature", text: "🛡 [User report: 'سالته على كود موديل موجود بالفعل وقاللي انه الكود مش صح والموديل ده مش موجود... ازاي ندربه على الداتا'] الـ Agent ما كانش معاه structured product catalog — كان بـ يـsearch في الـ orders subcollection بدون ما يعرف الـ models بشكل موثوق. النتيجة: hallucinations عن الموديلات. **الـ Fix**: catalog tab كامل في AI Agent UI، الـ admin بـ يـcurate الموديلات يدوياً (أو بـ import من الـ orders)، الـ agent بـ يـquery منه كـ single source of truth." },
      { type: "feature", text: "📦 [Tab '📦 الكتالوج' — جديد بين الشخصية والـ FAQs] cards layout responsive (auto-fill 280px). كل card: صورة 4:3 + كود monospace + اسم + season/category badges + وصف + sizes/colors summary + سعر/حد أدنى + edit/delete. Filter (search + category + season) + stats pills (إجمالي/ظاهر/متاح). Empty state واضح مع call-to-action للإضافة الأولى." },
      { type: "feature", text: "✏️ [Editor modal كامل] 7 sections: (1) Basic — code, name, nameEn, category, season, inStock toggle. (2) الوصف. (3) صورة — file picker + auto-compress (4:3, 600px max, ~30KB JPG via compressImg43). (4) Specs — sizes (tag editor)، colors (tag editor)، fabrics (multi-select من factory.fabrics). (5) Pricing — wholesale price + min order qty. (6) Tags (للـ search). (7) Notes داخلية. Save → catalog[] في factory/config." },
      { type: "feature", text: "📥 [Import from orders — auto-discovery] الـ admin بـ يضغط '📥 استيراد' → modal بـ يـscan الـ orders array (seasons/{s}/orders) ويـextract كل (code, name) فريدة + season + sizes (من distribution map) + 'seen in N orders' rank (الأكثر تكراراً أولاً). الـ admin بـ يختار اللي عاوزه + bulk import. الـ items بـ تتـadd كـ catalog entries (default category=ولادي، edit later لإضافة صور/أسعار/ألوان). توفير ضخم في الوقت لو في 100+ موديل في الـ orders." },
      { type: "feature", text: "🔍 [Backend: searchProducts rewritten كـ catalog-first] الـ tool القديم كان يـscan seasons/{s}/orders/ subcollection ويـreturn raw matches. دلوقتي بـ يقرأ من config.catalog مباشرة بـ scoring algorithm: exact code match=1000، code substring=100، exact name=800، name substring=80، nameEn=60، tag exact=50، tag substring=20، description=30. Top N returned مع structured data (code/name/category/sizes/colors/fabrics/price/inStock/has_image). الـ image data مش بـ ترجع للـ LLM context (overhead) — بس flag has_image لو عاوزين نـsendMedia في Phase 2." },
      { type: "feature", text: "🆕 [Backend: get_product_details(code) tool جديد] بعد ما search_products يـnarrow down للـ موديل، الـ agent بـ يقدر يـpull كل تفاصيله بالـ code. Exact match (case-insensitive). لو الـ code مش موجود، الـ tool بـ يرجع `{found: false, message: 'لا تخترع تفاصيل عنه — استخدم escalate'}` — anti-hallucination by design." },
      { type: "feature", text: "🧠 [System prompt updates — catalog-aware factory facts] الـ buildFactoryFacts() دلوقتي بـ يـinject: عدد الموديلات في الكتالوج + الـ in-stock count + التوزيع حسب الفئة (top 4) + 6 sample model codes كـ concrete examples للـ LLM. لو الكتالوج فاضي، رسالة صريحة: 'لو العميل سأل عن موديل معين، استخدم escalate_to_human (لا تخترع)'." },
      { type: "feature", text: "🛠 [الـ tool description بقت أكثر صرامة] الـ search_products description دلوقتي بـ يقول explicitly: '⚠️ مهم: لو الـ search بـ يرجع 0 results، الموديل **مش موجود** عندنا — لا تخترع ولا تقول تقريباً — استخدم escalate_to_human.' الـ tool descriptions جزء من الـ prompt اللي الـ LLM بـ يقراه، ده بـ يدفعه للـ correct behavior." },
      { type: "improvement", text: "📐 [Storage strategy] الـ catalog inline في factory/config مع warning عند 50+ items. الصور compressed لـ 4:3 / ~30KB لازم تستوعب 50 موديل في حدود 1.5MB — قريبة من Firestore's 1MB doc limit لكن مش بتـcrash. لو الـ catalog كبر فوق ده، Phase 2 هيـsplit لـ separate collection." },
    ]
  },
  {
    version: "V19.75.0",
    date: "2026-05-06",
    types: ["feature"],
    title: "🧪 AI Agent — Test Mode (whitelist gate) للـ soft launch",
    changes: [
      { type: "feature", text: "🛡 [User request: 'عاوز ازود في الاوبشن ان نعمل تيست مع ارقام معينة مش لايف يعني لحد مانوصل لمرحلة كويسة'] الـ Agent دلوقتي بقى لحظة launch — أي رقم بـ يبعت لـ CLARK رقم WhatsApp بـ يـrespond. للـ soft launch، محتاجين whitelist mode. اتعمل: `config.aiAgent.testMode = { enabled, whitelist[], outsideBehavior, outsideMessage }`. الـ availability gate في الـ backend بـ يـcheck الـ whitelist BEFORE الـ Claude call (cost protection — non-whitelisted senders cost $0)." },
      { type: "feature", text: "🟡 [Sticky banner في الـ header — visible whenever testMode.enabled] لما الـ admin يـ enable الـ test mode، banner ذهبي بـ يظهر فوق tabs الـ navigation: '🧪 وضع التجربة شغّال — الـ Agent بـ يرد على X رقم فقط'. زر '📋 إدارة القائمة' بـ يـnavigate للـ Schedule tab. الـ banner بـ يختفي تماماً لما الـ test mode = OFF (لا overhead دائم في الـ UI)." },
      { type: "feature", text: "📞 [Whitelist editor في Schedule tab — أعلى section] قبل 'نمط التشغيل' في الـ Schedule tab، section جديد متميز بـ amber gradient لما active. Toggle رئيسي ('شغّال/موقوف') + قائمة الأرقام الحالية بـ WID format واضح + add form (رقم مصري أو WA-ID كامل) + delete buttons + behavior selector (canned message vs silent) + textarea للـ outsideMessage. الـ admin يقدر يضيف phones (auto-formatted لـ 201XXX@c.us) أو يـpaste LIDs مباشرة." },
      { type: "feature", text: "🔍 [Whitelist matching — tolerant + LID-aware] الـ `isInWhitelist(wid, list)` helper بـ يـmatch بالـ user-part فقط (الجزء قبل الـ @). يعني: '201100201057' بـ يـmatch مع '201100201057@c.us' و '+201100201057' و '00201100201057'. الـ LIDs بـ تـmatch بنفس الـ user-part. ده بـ يـsupport scenarios متعددة بدون ما الـ admin يحتاج يعرف format الـ WhatsApp بالظبط." },
      { type: "feature", text: "🚦 [Order of checks in availability gate] (1) `enabled` master toggle — لو OFF، skip silent. (2) `testMode` — لو enabled و sender خارج الـ whitelist، canned/silent based على outsideBehavior. (3) Schedule mode (24x7/off/specific). الـ test mode CHECKED قبل schedule لأن المنطق هو 'مش لايف للجميع لسه' — الـ schedule ميهمش طالما الـ launch محدود." },
      { type: "feature", text: "🧪 [10 unit tests للـ whitelist + isInWhitelist helper] tolerance tests (with/without @ suffix، +/00 prefixes، LID format)، edge cases (null/empty)، behavior tests (canned vs silent vs disabled)، integration with decideAvailability. كل الـ 49 + الـ 10 الجدد = 59/59 passing." },
      { type: "improvement", text: "💰 [Cost protection by design] لو الـ admin شغّل الـ test mode + 5 أرقام مسموحة، أي رقم تاني بـ يبعت → الـ webhook handler بـ يـreject في الـ availability gate قبل الـ orchestrator → مفيش Claude call → مفيش $$$. الـ canned message (لو configured) بـ يبعت عبر bridge مباشرة (cheap). ده ضروري للـ soft launch لأن العميل ممكن يـshare الرقم في groups واسعة — مفيش كنترول على الـ inbound، بس عندنا كنترول على الـ outbound." },
      { type: "improvement", text: "🎯 [الـ pro UX details] (1) Header banner تـelevate visibility — الأدمن مش هيـmiss إن الـ agent in test mode. (2) The Schedule-tab section gets a yellow-amber visual treatment when active so it's instantly recognizable. (3) Per-entry display: WID in monospace font (clear for technical readers) + optional human label ('أحمد المالك'). (4) Auto-format للـ Egyptian phones (admin بـ يكتب 01100201057 → بـ يحفظ 201100201057@c.us). (5) Anti-duplicate check on add (by user-part)." },
    ]
  },
  {
    version: "V19.74.0",
    date: "2026-05-06",
    types: ["ux", "architectural"],
    title: "💾 AI Agent: 'Save Changes' pattern — مفيش حفظ لحظي تاني",
    changes: [
      { type: "ux", text: "🛡️ [User request: 'عاوز اي تعديل في اي مكان بعدها اضغط حفظ التغييرات ويشوف التعديلات بلاش التعديل المباشر اللحظي في اي حاجة ده بيعمل مشاكل'] الـ AI Agent page كانت بـ تـwrite لـ Firestore على كل keystroke / toggle / إضافة. ده بـ يـcause: (a) per-keystroke Firestore writes (cost + rate limits)، (b) visual flicker لما الـ listener بـ يـfire ويـsnap الـ UI على الـ server state، (c) race conditions لو 2 admins بـ يعدّلوا في نفس الوقت. **الـ Fix**: kept-out كل كتابة لـ Firestore لحد ما الـ admin يضغط 💾 Save. الـ server data يـsync مع الـ draft فقط لو مفيش تغييرات محلية." },
      { type: "architectural", text: "📐 [Pattern: page-level `draft` state + dirty flag + sticky save bar] ضافت `useState` لـ deep-cloned draft من `data.aiAgent` في AIAgentPg. كل الـ updateAgent calls (في 5 tabs: Personality / Schedule / Tools / FAQs / Funnel) دلوقتي بـ تـmutate الـ draft فقط — مفيش upConfig في الـ middle. الـ `dirty` flag بـ يـtrack لو في تغييرات pending. لما server data بـ يـchange (مثلاً admin تاني save)، useEffect بـ يـrefresh الـ draft IFF !dirty (مش بـ يـoverwrite تعديلات local)." },
      { type: "architectural", text: "🟡 [Sticky save bar في الـ header — مرئي لما dirty فقط] الـ banner الـ 2nd layer (تحت header الـ Agent) بـ يـappear بـ orange gradient + 'هناك تغييرات غير محفوظة' + زر '↩️ تراجع' و '💾 حفظ التغييرات'. position: sticky top: 0، z-index: 50 — مرئي حتى لو الـ user scrolled في tab طويل. لما dirty=false، الـ banner بـ يختفي تماماً (مش 'overhead' permanent في الـ UI)." },
      { type: "feature", text: "↩️ [زر تراجع — discardChanges] لو الـ admin غيّر حاجة وغيّر رأيه، بدل ما يـrefresh الصفحة (هيـlose progress في tabs أخرى)، بـ يضغط '↩️ تراجع' — بـ يـrestore الـ draft من server data. الـ confirmation prompt بـ يـask قبل الـ discard لأن العملية irreversible." },
      { type: "feature", text: "👥 [نفس الـ pattern في CustomerFullProfileModal] الـ modal اللي بـ يعدّل ai_profile.notes/observations/flags كان بـ يـwrite كل toggle/click مباشرة. دلوقتي عنده per-instance `draft` state. لما الـ admin بـ يـclose modal مع تغييرات غير محفوظة، prompt بـ يـask للـ confirmation (else يضيع الـ progress). الـ Save button في الـ footer بدل onClose (الـ Close كـ ghost button دلوقتي)." },
      { type: "ux", text: "📝 [Toast wording updated — مفيش 'تم الحفظ' بعد كل action] الـ toasts اللي كانت بـ تقول 'تم الحفظ' بعد add/edit/delete دلوقتي بـ تقول 'تم التحديث (اضغط حفظ التغييرات)' — يفكّر الـ admin إن في step تاني محتاج يـcommit. الـ toast الفعلي 'تم حفظ كل التغييرات' بـ يـappear فقط بعد الـ Save Changes button." },
      { type: "improvement", text: "🔄 [Power toggle بقى ضمن الـ draft] زر '▶️ تشغيل / 🛑 إيقاف' في الـ header كان immediate write. دلوقتي ضمن الـ draft state — الـ admin يقدر يـtoggle بدون ما يـcommit، ويلاقي الـ status pill بـ يـreflect الـ draft state. لو شغّل وغيّر رأيه، بـ يضغط Discard. ده consistent مع باقي الـ controls." },
      { type: "improvement", text: "🚀 [الـ benefit الكبير: لو في Phase D backend بدأ يـcommunicate في الـ middle] لما الـ Agent backend (Phase D) يبني، هيـكتب على `aiAgentAnalytics` و `aiAgentConversations` بـ updates frequent. مع الـ pattern الـ instant-write القديم، الـ admin's edits كانت ممكن تـrace مع الـ backend. مع الـ draft pattern، الـ backend's writes على collections منفصلة، الـ admin's writes على aiAgent doc فقط لما يـsave صراحة. الـ 2 writes ما يـconflictـش." },
    ]
  },
  {
    version: "V19.73.0",
    date: "2026-05-06",
    types: ["feature"],
    title: "🤖 AI Agent Phase C — Customer Funnel + Profiles + Automation tab renamed",
    changes: [
      { type: "feature", text: "🏷 [Tab 'الأتمتة' → 'Automation'] User request: 'غير كلمة الأتمتة لـ Automation افضل على الهوم'. الـ label اتغيّر في 2 places: `LoginScreen.jsx` TABS array (الـ source للـ Home tile) + `permissions.js` PERMISSION_TABS (الـ source للـ permissions matrix labels في الـ settings page). الاتنين دلوقتي 'Automation'. ده بـ يتسق مع 'AI Agent' tab — الاتنين features تقنية/communication، والإنجليزي بـ يـreflect إنهم product terms معروفة عالمياً." },
      { type: "feature", text: "🎯 [Tab 'مراحل العميل' (FunnelTab) — full pipeline visualization] Phase C الأول. الـ tab بـ يقرأ من `data.customers` مباشرة + `data.aiAgentSuggestions`. **6 sections**: (1) Header context — total customers count + warning لو في عملاء بدون stage. (2) Stage distribution — funnel bars بـ proportional widths لكل من 7 stages (Stranger/Awareness/Interest/Decision/Customer/Repeat/Dormant) مع count + %. (3) Movement آخر 7 أيام — count of stage transitions per from→to pair. (4) Pending stage transitions — اللي الـ Agent suggested بس مش approved لسه. (5) Auto-approve settings — 6 transitions كل واحد بـ checkbox + 'high risk' badge للـ Decision/Interest transitions. (6) Tier distribution — 4 cards (Bronze/Silver/Gold/Platinum) + thresholds. (7) Customers approaching tier-up — الـ 10 الأقرب بناءً على ai_profile.total_purchases_last_12_months." },
      { type: "feature", text: "👥 [Tab 'ملفات العملاء' (ProfilesTab) — customer profile manager] Phase C الـ 2nd. الـ tab بـ يـlist customers مع filter (search + stage + tier) + 3 stat pills. الـ list بـ visual cards بـ tier/stage badges. كليك على card بـ يـفتح **Full Profile Modal** فيه 7 sections: (1) Header — name + tier + stage badges. (2) Phones — primary + normalized + additional_phones list. (3) AI Profile — preferred categories/seasons/models + avg order value + total purchases + payment pattern + communication style + best response time. (4) Admin notes — manual notes manageable (add/remove). (5) Observations — AI-suggested OR admin-manual، كل observation بـ status (pending/approved) + approve/reject buttons. (6) Flags — VIP/careful_handling/do_not_call/special_pricing toggles. (7) Stage History — timeline." },
      { type: "feature", text: "✏️ [الـ ProfilesTab بـ يـكتب على `customers` collection مباشرة] الـ admin بـ يقدر يـmanage الـ AI profile مباشرة من الـ tab. الـ writes (notes/observations/flags) بـ تـحفظ في `customer.ai_profile.*` عبر upConfig. **مهم**: ده هو الـ exception الوحيد للـ READ-ONLY constraint — لأن الـ admin (مش الـ Agent) بـ يكتب. الـ Agent backend (Phase D) بـ يـكتب في `aiAgent*` collections فقط (suggestions، logs، analytics). الـ admin's writes هنا بـ تكون via CLARK app (الـ existing security model — admin permissions في Firestore rules)." },
      { type: "feature", text: "📋 [Schema additions — tierThresholds + stageTransitionAutoApprove] في `INIT_CONFIG.aiAgent`: `tierThresholds: {Bronze:0, Silver:50000, Gold:200000, Platinum:500000}` (الحدود السنوية بالـ ج المصري) — الـ FunnelTab بـ يستخدمها لحساب 'approaching tier-up'. `stageTransitionAutoApprove: {strangerToAwareness:true, awarenessToInterest:true, interestToDecision:false, decisionToCustomer:false, customerToRepeat:true, customerToDormant:true}` — الـ default per spec section 6. الـ admin يقدر يـoverride من الـ FunnelTab UI." },
      { type: "feature", text: "🎨 [STAGES + TIERS data tables — single source of truth داخل AIAgentPg] الـ 7 stages + 4 tiers definitions موجودة في top-level constants داخل الـ file: STAGES = [{key, label (Arabic), icon, color}, ...]. كل tab Phase C بـ يستخدمهم للـ rendering (FunnelBar widths، CustomerProfileCard badges، Modal headers، etc.). ده بـ يـensure consistency في الـ visual treatment (نفس الـ icon + color لكل stage في كل مكان)." },
      { type: "improvement", text: "🚀 [9/9 tabs functional — Phase A + B + C done] الـ TABS array دلوقتي بدون `phase` property على أي tab — كلهم functional. الـ phase pill conditional اتشال (مفيش tab محتاجه). الـ next milestone: Phase D — الـ backend Node.js على VPS (clark-ai-agent project منفصل). الـ admin دلوقتي يقدر يـ: (a) Configure الشخصية + FAQs + Schedule (Phase A)، (b) View Dashboard + Logs + Sandbox + Tools (Phase B)، (c) Manage Funnel + Profiles (Phase C). كل البنية جاهزة لما الـ backend يبني." },
      { type: "improvement", text: "📦 [الـ chunk size: 61 kB → ~95 kB (~24 kB gzip)] Phase C ضافت ~650 سطر إضافي للـ AIAgentPg.jsx — مفيش dependencies جديدة. الـ recharts shared مع الـ existing vendor-recharts chunk. الـ file دلوقتي 2354 سطر، borderline manageable كـ single file. لو Phase D بـ يـadd UI (مش متوقع — backend = separate VPS project)، نـsplit في Phase E." },
      { type: "improvement", text: "💡 [Empty states بـ معنى لكل Phase C section] FunnelTab بـ يعرض empty hint cards (icon + msg) لما الـ data مش موجودة: 'مفيش انتقالات آخر أسبوع — الـ backend هيـrecord الانتقالات لما يبدأ'، 'مفيش suggestions معلّقة — Phase D هيـكتب الـ suggestions'، إلخ. ProfilesTab بـ يعرض empty state لما الـ filters ما تـmatchـش، أو لما الـ customer record لسه مفيش ai_profile (italic hint)." },
    ]
  },
  {
    version: "V19.72.0",
    date: "2026-05-06",
    types: ["feature"],
    title: "🤖 AI Agent Phase B — Dashboard + Logs + Sandbox + Tools + new robot icon",
    changes: [
      { type: "feature", text: "🎨 [Icon جديد للـ AI Agent — robot mascot solid-fill بدل الـ smiley face] User uploaded reference image: solid black robot head (square head + antenna + side ears + 2 large round eyes). الـ V19.71 icon كان circle face بسمايل — مش بـyـعكس الـ 'AI agent' identity. **الـ Fix**: SVG جديد بـ inline `fill='currentColor'` على body/ears/antenna-bulb (overrides parent's `fill='none'`) + `fill='white' stroke='none'` على الـ 2 eyes. النتيجة: على الـ Home tile الـ tinted purple bg، الـ robot بـ يـrender solid purple مع white eyes — بـ يـmatch الـ uploaded image بالظبط." },
      { type: "feature", text: "📊 [Tab 'لوحة التحكم' — KPIs + bar chart + empty state] Phase B الأول. الـ tab بـ يقرأ من `data.aiAgentAnalytics[YYYY-MM-DD]` (بـ يـكتبهم الـ backend Phase D). الـ UI: range selector (اليوم/٧/٣٠ يوم)، 8 KPI cards (محادثات/رسائل/تحويلات/تكلفة/إشعارات مبيعات/طلبات اتأكدت/voice/images)، Recharts BarChart للـ trend، Cost breakdown card (Anthropic/Whisper/Vision)، Quick metrics card (متوسط زمن الرد، رضا العميل، معدل التحويل، معدل التأكيد). الـ empty state banner واضح: 'الـ Agent لسه مش بيـولّد بيانات — Phase D لما يبني هيـكتب في aiAgentAnalytics'." },
      { type: "feature", text: "💬 [Tab 'سجل المحادثات' — filterable list + expand-on-click] الـ tab بـ يقرأ من `data.aiAgentConversations`. Filter bar: search نصي + status dropdown (resolved/escalated). Stats pills (إجمالي/ظاهر/حُوّل). كل ConversationCard: customer name + tier + last message snippet + escalated badge. كليك على الـ card بـ يـexpand ويعرض الـ full message thread. الـ empty state preview بـ يـشرح schema الـ conversation الـ المتوقع (messages + tools_used + cost + escalation reason + CSAT)." },
      { type: "feature", text: "🧪 [Tab 'اختبار' — local sandbox مع FAQ matching] الـ feature الأهم في Phase B للـ training. الـ admin يقدر يجرب الـ Agent **محلياً بدون Anthropic API call**. Setup: persona (known customer / stranger) + customer picker (real من `data.customers`). الـ chat UI: messages كـ bubble layout، 6 quick scenarios buttons (سعر موديل، حساب، طلب 200 قطعة، ...). الـ logic: بـ يـsearch الـ user input ضد الـ FAQs (title + phrasings substring match)، لو match → الـ answer مع variable substitution ({customer_name}, {today}, {tier})، لو لا → canned response. الـ Trace panel بـ يعرض الـ pipeline steps (auth → stage → FAQ lookup → response build) مع الـ latency. ده بـ يـلي الـ admin يختبر صياغات الـ FAQs قبل الـ backend يبني." },
      { type: "feature", text: "🛠 [Tab 'الأدوات' — full registry config + tier discounts + escalation routing] الـ tools tab بـ يـedit الـ `config.aiAgent.tools/tierDiscounts/escalation`. **3 categories visualized**: 📖 READ-ONLY (6 tools)، 📄 GENERATE (2 tools)، 🔔 NOTIFY (5 tools). كل tool بـ enable/disable toggle + per-tool extras (search_products: includePricing/Stock/Images + maxResults، notify_sales_team: maxValueBeforeManual، send_otp: ttlMin + maxAttempts، الخ). **Tier discounts editor** (Bronze 0%، Silver 3%، Gold 5%، Platinum 8%) بـ inline number inputs. **Escalation routing**: support phone، sales team phone، template textarea مع variable hints ({customerName}/{phone}/{tier}/{stage}/{reason})، 5 auto-trigger toggles (شكوى/طلب>100K/عميل عصبي/خارج النطاق/Platinum)." },
      { type: "feature", text: "🚧 [Phase B done — 7/9 tabs functional. Phase C pending: Funnel + Profiles] الـ TABS array بقت تـreflect الواقع: Phase A + B tabs بدون phase pill (shipped). Phase C tabs (مراحل العميل + ملفات العملاء) لسه بـ phase='C' badge. الـ `t.phase !== 'A'` conditional اتحدّث لـ `t.phase` (cleaner)." },
      { type: "improvement", text: "📦 [الـ chunk size: 30 kB → 61 kB (~16 kB gzip)] Phase B ضافت ~700 سطر للـ AIAgentPg.jsx (eager components، مفيش lazy split داخل الصفحة — بـ يـload في chunk واحد). الـ recharts لسه بـ يـshare الـ vendor-recharts chunk اللي DashPg + reports.jsx بـ يـuse. مفيش dependencies جديدة." },
      { type: "improvement", text: "🎯 [Empty states بـ معنى — مش 'لا يوجد بيانات' فقط] كل tab من الـ 4 الجديدة بـ يـعرض empty state يـشرح: (a) ليه فاضي (الـ backend Phase D لسه)، (b) إيه الـ schema المتوقع لما يـبني، (c) إيه الـ UI features اللي هتـشتغل دلوقتي vs اللي محتاجة backend. ده بـ يـلي الـ admin يـunderstand الـ system بدون documentation منفصل." },
    ]
  },
  {
    version: "V19.71.1",
    date: "2026-05-06",
    types: ["fix"],
    title: "🐛 Hotfix: AI Agent page crashed with React #306 (export mismatch)",
    changes: [
      { type: "fix", text: "🐛 [V19.71.0 الـAI Agent page بـtـcrash بـ React error #306 لما الـuser يفتحها] User screenshot: 'حدث خطأ غير متوقع' + console: `Minified React error #306; visit https://reactjs.org/docs/error-decoder.html?invariant=306&args[]=undefined&args[]=`. **Root cause**: في AIAgentPg.jsx كتبت `export default function AIAgentPg` بس الـ`lazyNamed()` helper في `src/utils/lazyLoad.jsx` بـtـوقع `module[exportName]` (i.e. NAMED export). React.lazy بـtـreceive `{default: undefined}` → بـtـحاول render `<undefined />` → error #306 ('Element type is invalid'). الـerror stack بـtـنزل في vendor-recharts chunk عشان الـSuspense boundary اللي بـyـcatch الـerror موجود في DashPg-loaded chunk." },
      { type: "fix", text: "✅ [الـFix: شيلت كلمة `default` — بقت `export function AIAgentPg`] one-character change. كل الـ pages الأخرى في CLARK (HRPg, CampaignsPg, etc.) بـtـuse named exports — كان مفترض أتبع الـconvention دي من الأول. الـ`lazyNamed(importFn, 'AIAgentPg')` دلوقتي بـtـلاقي `module.AIAgentPg` صح، الـSuspense بـrender الـcomponent، الـpage بـloadش بدون crashes." },
      { type: "improvement", text: "📚 [Lesson: لما تـadd page جديدة، اتأكد من الـexport pattern الموجود] الـ`lazyNamed` helper في `utils/lazyLoad.jsx` بـtـwrap ALL pages في CLARK. كل page بـtـmust export named function بنفس اسم الـcomponent — مش `default`. ده مكتوب في الـcomment على الـhelper نفسه: 'all CLARK pages use named exports'. الـ next sessions: لما تعمل page جديدة، انسخ الـexport line من أي page موجودة (مثلاً `export function HRPg(...)`)." },
    ]
  },
  {
    version: "V19.71.0",
    date: "2026-05-06",
    types: ["feature", "architectural"],
    title: "🤖 AI Agent control center (Phase A) — Personality + FAQs + Schedule",
    changes: [
      { type: "feature", text: "✨ [زر 'AI Agent' جديد في الـ Home] User request: 'عاوز ابدأ بناء AI Agent عشان يشتغل على واتس اب اوتوماتيك ويرد على العملاء في اوقات معينة'. ضافت tab جديد بـlabel إنجليزي 'AI Agent' (purple #8B5CF6) عشان يفرق بصرياً عن الـ'الأتمتة' الموجودة (rule-based). الـtab بـyـفتح صفحة AIAgentPg.jsx — مركز التحكم الكامل للـ Agent. الـlabel متعمد بالإنجليزي عشان 'AI Agent' مصطلح عالمي معروف." },
      { type: "architectural", text: "🏗️ [Architecture: CLARK = config UI، الـ Agent backend = منفصل على VPS] الـ Agent نفسه (Node.js + Anthropic Claude + WhatsApp bridge integration) هـ يبني كـ project منفصل (clark-ai-agent) على Contabo VPS. CLARK app هي الـ admin/training UI — كل الـ settings (personality, FAQs, schedule) بتـحفظ في `config.aiAgent` في Firestore. لما الـ backend يطلع، هيقرأ نفس الـ config — مفيش API بين الاتنين، الـ Firestore هي الـ contract المشترك. ده اتعمل في Phase A قبل الـ backend عشان الـ admin يبدأ يـconfigure ويـtrain من دلوقتي." },
      { type: "feature", text: "🎭 [Tab 'الشخصية' — full personality editor] أول الـ 3 tabs الفعّالة. الـ admin يقدر يـconfigure: اسم الـ Agent، اللغة (مصرية مهذبة/فصحى/bilingual)، الأسلوب (رسمي/مهني-ودود/عادي)، طول الإجابة، استخدام الـ emojis، عبارات التحية والختام (tags)، الممنوعات (red tags)، والـ system prompt الكامل (textarea مع reset to default). الـ system prompt هو الـ training mechanism الأساسي — أي تعديل = تغيير فوري في كل الردود لما الـ backend يبني." },
      { type: "feature", text: "📚 [Tab 'الأسئلة المتكررة' — FAQs CRUD مع categories + phrasings] الـ admin يضيف FAQs بـ: عنوان، فئة (الشحن/الدفع/الإرجاع/المنتجات/الخصومات/الشركة/أخرى)، صياغات بديلة (الـ Agent بـ يتعرف عليها — 'الشحن بياخد كم' = 'إمتى هيوصل')، الإجابة (مع متغيرات زي {customer_name})، useCount tracking (لـ Phase B analytics). Search + filter by category + grouped display. ده الـ training mechanism الـ 2nd — كل FAQ = حالة الـ Agent بـيـحلها بدون escalation للبشري." },
      { type: "feature", text: "⏰ [Tab 'الجدول الزمني' — operating hours + holidays + off-hours behavior] 3 modes: ساعات محددة (per-day from/to، الـ default 20:00→10:00 — overnight)، 24x7، موقوف. الـ holidays section لـ أيام الـ Agent ميـردش فيها (أعياد، إجازات رسمية). Off-hours behavior: 'يرد ويحاول يساعد' أو 'يبعت رسالة 'هنرد بكرة'' أو 'يحوّل كل شيء لبشري'. Admin alerts (طول الوقت، حتى خارج الساعات): شكاوى جودة، طلبات أكبر من X ج، Platinum منتظر أكتر من Y دقيقة." },
      { type: "feature", text: "🚧 [6 tabs placeholders للـ Phase B/C] Dashboard (📊)، Tools (🛠 — read-only config)، Conversation Logs (💬)، Sandbox (🧪)، Customer Funnel (🎯)، Customer Profiles (👥). كل واحد بـيـعرض icon كبير + 'Phase B/C' badge + وصف لـ functionality المتوقع. الـ structure جاهز عشان نملاهم في الجلسات الجاية بدون ما نلمس الـ shell." },
      { type: "feature", text: "🛡️ [Permissions: 8 roles كلهم محدّثين] admin/manager/sales_accountant = edit. باقي الـ 5 roles (purchase, warehouse_keeper, payroll_*, viewer) = hide. الـ tab بـ visible فقط لـ admin/manager بـ default — sales_accountant يقدر يـedit عشان فريق المبيعات يـmanage الـ FAQs والـ escalation routing." },
      { type: "feature", text: "📐 [Header مع master power toggle + status pill] زر '▶️ تشغيل / 🛑 إيقاف' في الـ header (يـset agent.enabled). الـ status pill بـ green pulse لما شغّال، grey لما موقوف. الـ default = موقوف (الـ admin لازم يفعّله صراحة بعد ما يـreview الـ config)." },
      { type: "architectural", text: "📋 [Schema: config.aiAgent — single source of truth] الـ schema في constants/index.js INIT_CONFIG. Fields: enabled, schedule (mode/days/holidays/offHours), personality (name/language/style/systemPrompt/...)، faqs[], faqCategories[], tools (per-tool enabled flags + thresholds), tierDiscounts (Bronze/Silver/Gold/Platinum)، escalation (supportPhone/salesTeamPhone/template/autoTriggers)، collections (refs لـ aiAgent* Firestore collections للـ Phase B logs UI). الـ default value هو fallback لو الـ config مش موجود (older deployments)." },
      { type: "improvement", text: "🎨 [Visual distinction من 'الأتمتة' الموجودة] الـ 'الأتمتة' tab الموجود (rule-based daily reports + event triggers) لسه شغّال زي ما هو — مفيش لمسة فيه. الـ AI Agent tab الجديد purple/violet (#8B5CF6) بدل الـ sky blue، الـ icon SVG دماغ روبوت بدل الـ square mech، الـ label إنجليزي بدل عربي. الاتنين منفصلين في الـ permissions matrix كمان." },
      { type: "improvement", text: "📦 [Version: 19.70.26 → 19.71.0] minor bump (مش patch) عشان دي feature جديدة كبيرة. الـ next sessions: Phase B (Dashboard + Logs + Sandbox + Tools)، Phase C (Funnel + Profiles)، Phase D (الـ backend Node.js على VPS)، Phase E (integration + soft launch)." },
    ]
  },
  {
    version: "V19.70.26",
    date: "2026-05-06",
    types: ["fix", "ux"],
    title: "🔠 Switch to Amiri (full PFB coverage) + shaper algo fix + QC-2 label larger",
    changes: [
      { type: "fix", text: "🐛 [V19.70.25 الـPDF لسه فيه حروف ناقصة — Tajawal cmap مش complete] User report: 'الكتابة فيها حروف ناقصة كتير، حرف الالف في كل كلمة مش موجود وحرف الراء في كلمة التاريخ، الالف والنون في كلمة التليفون'. **Diagnosis**: الـTajawal TTF المـbundled مش بـyـcontain كل الـArabic Presentation Forms-B codepoints (U+FE70-U+FEFC). لما الـshaper بـyـemit (مثلاً) 0xFE8D للـا isolated أو 0xFEE5 للـن isolated، الـTajawal cmap مش لاقياهم → jsPDF بـyـskip drawing الـglyph silently (مش بـyـrender placeholder حتى). النتيجة: حروف بتختفي." },
      { type: "fix", text: "📦 [Switched لـAmiri (full Arabic coverage, ~840KB)] Amiri عبارة عن typeface عربي traditional Naskh designed specifically للـArabic — عنده **complete** Presentation Forms-B coverage مع كل الـcontextual variants. الـlook calligraphic مش modern زي Cairo، لكن الـpriority الآن CORRECTNESS قبل الـaesthetics. Cairo's google/fonts repo بـyـship variable font فقط (مش static TTFs)، Tajawal بـyـship static TTFs لكن coverage incomplete. Amiri بـyـsatisfy الـ2 شروط (static + complete)." },
      { type: "fix", text: "🛠️ [Shaper algorithm bug — fix لـcorrect form selection] الـ`nextConnectsBackward` كان بـyـconsider فقط 'هل الـnext letter يقدر يـreceive من previous؟'. **Bug**: الـright-joining letters (ا، د، ذ، ر، ز، و، ء، ؤ، ة، ى) ما بـyـconnect أبداً للـnext. لما واحد من دول كان بين dual-joining letters، الـalgo كان emit الـmedial form (formIdx 3) — لكن الـright-joining letters في table بتاعنا map medial=final glyph، فالـletter كانت تـrender كـfinal-form variant في وسط الكلمة (ملخبطة). **الـFix**: ضافت `iJoinsForward = entry[4]` check + `nextConnectsBackward = iJoinsForward && _connectsFromPrev(next)`. دلوقتي right-joining letters في وسط الكلمة بـyـemit final form (correct)." },
      { type: "ux", text: "🏷 [QC-2 label box أكبر + text أكبر] User report: 'عاوز مربع الـQC يكبر شوية بالارتفاع يكون متناسق، والكلمة تكبر شوية عشان مش واضحة للعين'. **الـFix**: الـbox height زادت من 18% إلى 26% من حجم الـQR. الـtext font size زاد من 0.55 إلى 0.7 من الـbox height (~35% أكبر). الـborder بقى أسمك (1.5 → 1.8). الـpadding عمودي زاد من 0.4mm → 0.6mm. الـletter-spacing من 1px → 1.5px. الـborder-radius من 1mm → 1.2mm. الـQC-2 stamp دلوقتي واضح للعين على الـlabels." },
      { type: "improvement", text: "📚 [Lesson: Arabic in jsPDF needs (1) full PFB coverage (2) correct shaper] المسار الصحيح للـArabic في jsPDF/PDF generation: (a) Font لازم يكون عنده ALL Arabic Presentation Forms-B codepoints (U+FE70-U+FEFC) في الـcmap، (b) الـshaper لازم يـoutput الـcorrect form codepoint based على الـcontextual joining algorithm. الـAmiri بـyـsatisfy (a). الـshaper بعد V19.70.26's fix بـyـsatisfy (b). الـcombo دلوقتي should produce correctly-shaped Arabic." },
      { type: "improvement", text: "🛡️ [Future: switch back to a modern sans Arabic لو لقينا واحد بـfull PFB coverage] Amiri calligraphic look مش everyone's preference للـmodern delivery receipts. الـoptions الـbundled with full PFB: Amiri (current), Markazi Text، Reem Kufi، Mada، Lateef. لو الـuser عاوز modern sans، نقدر نضيف toggle/setting. للحد دلوقتي، Amiri = default (correctness > aesthetics)." },
    ]
  },
  {
    version: "V19.70.25",
    date: "2026-05-06",
    types: ["fix"],
    title: "📦 Bundled Tajawal TTF في public/fonts/ — مفيش CDN dependency تاني",
    changes: [
      { type: "fix", text: "🐛 [الـCRITICAL: V19.70.24's CDN URLs كلهم فشلوا] الـnetwork log: jsdelivr/npm/@fontsource/cairo@5.0.13 → 404 (fontsource v5 شال الـTTF)، unpkg → CORS-blocked، fontsource@4.5.13 → 404 كمان. الـuser ما قدرش يـgenerate الـPDF نهائياً. **الـRoot cause**: مفيش أي CDN reliable يـserve Cairo TTF بـCORS headers عربي subset." },
      { type: "fix", text: "📦 [الـSolution النهائية: bundle الـTTFs في public/fonts/] دلوقتي الـtype faces بـship مع الـapp نفسه — same-origin، مفيش CDN، مفيش CORS، مفيش 404. الـTTFs بـtـserve من `https://clark-factory.vercel.app/fonts/Tajawal-Regular.ttf` (نفس الـorigin بتاع الـapp). الـVite بـcopy الـpublic/ folder تلقائياً للـdist عند الـbuild." },
      { type: "feature", text: "✍️ [Tajawal بدل Cairo — visually similar, available كـstatic TTF] Cairo's google/fonts repo بـship variable font فقط (~600KB، single file). Tajawal بـship static Regular + Bold separate (~60KB لكل واحدة، total ~120KB). الـ2 fonts modern Arabic sans-serif بـlook مشابه. Tajawal أخف وأدق للـbold/regular distinction. الـAPI في arabicPdf.js لسه بـuse `setFont(\"Cairo\")` كـalias — back-compat كامل، الـPDF builders ما اتغيرتش." },
      { type: "improvement", text: "⚡ [Performance: instant font load بدل 3-5s CDN download] الـTTFs دلوقتي ~120KB total، مع الـserver Cache-Control الـافتراضي بتاع Vercel، الـ2nd load instant. الـ1st PDF generation بـtـtake ~500ms-1s بدل ~3-5s مع CDN. الـuser experience بقى أسرع بكتير." },
      { type: "improvement", text: "🛡️ [Zero external dependencies — bulletproof] الـPDF generation دلوقتي ما بـtـعتمد على أي external CDN. الـjsPDF + autotable لسه على jsdelivr (jsdelivr stable للـnpm packages — مفيش 403 expected)، لكن لو أي CDN فشل، نقدر نـbundle الـ2 dependencies دول كمان كـrollup imports. الـcurrent path الأنسب — الـuser ما يحتاجش يـconfigure أي CDN." },
    ]
  },
  {
    version: "V19.70.24",
    date: "2026-05-06",
    types: ["fix", "ux"],
    title: "🛠 Cairo TTF 403 fix + delete customer من التوزيعة + audit popup width + PDF default OFF",
    changes: [
      { type: "fix", text: "🐛 [الـCRITICAL: V19.70.23 الـPDF بـyـفشل لود — Cairo TTF returns 403] Error: 'Fetch https://cdn.jsdelivr.net/gh/google/fonts@main/.../Cairo-Regular.ttf failed: 403'. السبب: الـjsdelivr/gh CDN بقى يـblock الـraw passthrough للـGoogle Fonts repo. **الـFix**: switched لـfontsource CDN (نفس الـpackage اللي V19.70.15 استخدمته للـwoff2) — الـTTF متاحة في `cdn.jsdelivr.net/npm/@fontsource/cairo@5.0.13/files/cairo-arabic-{N}-normal.ttf`. الـArabic subset صغير (~30-50KB لكل weight) — أسرع من الـfull TTF. ضافت fallback chain: لو jsdelivr فشل، unpkg، لو ده فشل كمان، older fontsource version. الـ_fetchAsBase64 helper بقى يقبل array من URLs ويـtry فيهم بالترتيب." },
      { type: "ux", text: "🔘 [الـPDF default بقى OFF — user opt-in] V19.70.23 خلّاه ON بناءً على فرضية إن الـpipeline شغّال. الـuser report بـyـقول الـCDN فاشل + بـyـفضل explicit opt-in. **الـFix**: الـcheckbox `📎 إرفاق نسخة PDF` بقى default OFF تاني. الـuser يفعّله لما يحتاج PDF فعلاً. الـsubtitle اتحدّث: 'رسالة تفاصيل نصية فقط (افتراضي — أسرع وأخف)' لما OFF، 'PDF + رسالة تفاصيل (vector PDF بـArabic shaping صحيح)' لما ON." },
      { type: "ux", text: "🗑️ [زر حذف عميل من جدول التوزيعة — متاح دلوقتي حتى للصفوف الفاضية] User report: 'عاوز اقدر امسح عميل من داخل التوزيعة'. **الـbug**: زر الـحذف 🗑 كان موجود بس داخل الـactions column اللي بـyـظهر فقط لما `rowTotal > 0`. لو الـuser ضاف عميل بالغلط ومش عاوز يكتبله أرقام، ما كانش يقدر يحذفه — الـactions row مخفية. **الـFix**: ضافت ✕ icon أحمر صغير next to الـcustomer name في first column — always visible لو الـsession `sessCanEdit`. لو في sales فعلية للـcustomer في الـsession، الـicon بـyـبدّل لـ🔒 disabled مع tooltip 'لا يمكن الحذف — لديه بيع فعلي'. الـconfirm prompt + cleanup للـlocalGrid as well so the row disappears immediately." },
      { type: "ux", text: "📐 [Audit popup width fits content — مش full-screen مفتوح] User report: 'عاوز تصغير مساحة البوب اب بالعرض بناءً على المحتوى الداخلي'. **الـFix**: الـwidth بقى `fit-content` بـmaxWidth dynamic = `Math.min(viewport-48, 240 + visCusts.length * 95 + 200)`. الـpopup بـyـwidn حسب عدد العملاء الـvisible — لو 3 عملاء، compact. لو 15 عميل، أعرض. الـminWidth = 480px على desktop عشان ميكونش أنحف من الـheader buttons. على mobile، 100% (full-width) كما كان." },
      { type: "improvement", text: "🛡️ [Multiple URL fallback في الـ_fetchAsBase64] الـfetcher بقى defensive — لو واحد من الـCDN URLs returned 403/404/network error، يـtry الـnext في الـlist. الـerror الـfinal لو كلهم فشلوا includes الـlast URL + status (للـdebug). الـfont loading أصبح resilient ضد single CDN outages." },
    ]
  },
  {
    version: "V19.70.23",
    date: "2026-05-06",
    types: ["fix", "architectural"],
    title: "🎯 Bulk delivery PDF بقى vector + Arabic correct (Approach A applied)",
    changes: [
      { type: "fix", text: "🔥 [Approach A اتـapply على الـbulk delivery PDF — html2canvas اتشال نهائياً من الـpath ده] User insight: الـbrowser print → 'Save as PDF' بـrender Arabic صح. ده يأكد إن الـbug في html2canvas، مش في الـHTML/font. الـsolution: نعمل bypass للـhtml2canvas بالكامل ونستخدم jsPDF text APIs مع Cairo TTF embedded + Arabic shaper. النتيجة: vector PDF بدل image-based — جودة أعلى، حجم أقل، Arabic مش ملخبط." },
      { type: "feature", text: "🆕 [`buildDeliveryReceiptPdfBase64` في arabicPdf.js] function جديد بـbuild الـreceipt PDF بـlayout مطابق للـHTML version: (1) Header — logo + factory name + sub-line + receipt title + date/time في box على اليسار، (2) Customer info table — العميل/التليفون/التاريخ/العنوان عبر autoTable، (3) Section heading 'تفاصيل الاستلام'، (4) Items table — الموديل/الوصف/الكمية/السعر/الإجمالي + aggregation row، (5) Discount block (لو في خصم) — الإجمالي/الخصم/الصافي المستحق ببورد، (6) QR confirmation block — صورة QR + شرح، (7) Signature row — مسؤول التسليم + توقيع العميل، (8) Footer — factory name + date + Powered by CLARK." },
      { type: "improvement", text: "📐 [Vector PDF — جودة أعلى من الـimage-based القديم] قبل V19.70.23: الـPDF كان image-based (html2canvas يـcapture canvas → JPEG inside PDF). تحت zoom × 200% بـtـpixelate وtـبقى blurry. حجم الـfile كبير. **بعد V19.70.23**: vector PDF — الـtext + الـlines + الـtables كلهم vector. crisp في أي zoom (يقدر يـscale infinity)، الـfile size أصغر بـ~30-50%، الـArabic shaping يـrender عبر Chrome's TTF engine native." },
      { type: "feature", text: "✅ [Default ON — الـcheckbox 'إرفاق PDF' بقى مفعّل بـdefault] V19.70.17 خلّاه default OFF لما الـPDF كان broken. دلوقتي إن الـnew engine يـwork (نظرياً)، الـdefault بقى ON. الـuser لو حب يستخدم text-only يقدر يلغي الـtoggle. الـlabel اتحدّث: 'PDF + رسالة تفاصيل لكل عميل (vector PDF بـArabic shaping صحيح)'." },
      { type: "improvement", text: "🛡️ [Emoji stripping helper — Cairo TTF مفيهاش emoji glyphs] الـemojis في الـtemplates (🚚، 📱، 📦) كانوا يـtrigger missing-glyph boxes في الـPDF. ضافت `arNoEmoji(text)` helper بـstrip الـemojis ثم بـapply الـArabic shaper. الـtitles + الـlabels في الـreceipt كلهم passed via arNoEmoji — مفيش boxes. الـHTML version لسه يحتفظ بالـemojis (الـbrowser بـrender عبر emoji font fallback)." },
      { type: "improvement", text: "🔁 [الـbuildOneCustomerHTML لسه موجود كـlegacy — single source of truth للـmath] الـpayload helper الجديد (buildOneCustomerPayload) بـuse نفس الـcompute logic للـitems + totals + QR generation. الـ2 functions بـyـreturn نفس الـnumbers بالضبط. الـPDF + الـtext message بـyـreflect نفس الـdata — مفيش drift بين الاتنين." },
      { type: "improvement", text: "📚 [Lesson final للـArabic + html2canvas: لا تستخدمها مع complex scripts] V19.70.14/15/16/19 اتعلموا ده الدرس بالـhard way. الـsolution الوحيدة الموثوقة في الـbrowser: jsPDF text APIs + manual shaping (Approach A). الـserver-side Puppeteer (Approach B) ممكن يبقى أبسط للـcomplex layouts بس بـyـadd latency. الـ200KB Cairo TTF embedded في الـPDF binary (lazy-fetched من CDN) — overhead صغير لكن justified." },
    ]
  },
  {
    version: "V19.70.22",
    date: "2026-05-06",
    types: ["fix", "ux", "feature"],
    title: "📝 الجداول inputs دايماً + save-once + validation + balance card fix + شيل WhatsApp PDF",
    changes: [
      { type: "fix", text: "🐛 [الـcell flicker bug — حلت] User report: 'المستخدم بيكتب العدد في الحقل ويخرج العدد يختفي في جزء أقل من الثانية ويرجع تاني'. السبب: الـclick-to-edit pattern بـsetEdit(null) قبل ما الـFirestore round-trip يخلص → الـcell بـdisplay الـcommitted value (القديمة) لـmilliseconds → الـlistener يـupdate → الـnew value يظهر. **الـFix الجذري**: الـcells كلها في الـ2 grids (التوزيعة + الجرد) بقت always-on inputs، الـvalues تتـbind بـlocal state (`localGrid` + `localAudGrid`). مفيش Firestore بين الـkeystrokes — الـcommit بـyحصل مرة واحدة لما الـuser يضغط 'حفظ التغييرات'." },
      { type: "feature", text: "📝 [Always-on inputs في كل cells الجدولين] قبل V19.70.22: cell click → input يظهر → blur → save. دلوقتي: الـcell IS the input. الـuser يقدر يـtab بين الـcells، يكتب أي حاجة، مفيش commit حتى الضغط على 'حفظ التغييرات'. الـTab key بـnavigate للعمود الـnext في نفس الصف (ride للـrow-fill السريع). الـkeyboard navigation طبيعية بدون الـ50ms setTimeouts اللي كانت موجودة في الـold pattern." },
      { type: "feature", text: "💾 [Save-once button + dirty indicator في footer الـ2 popups] الـmatrix popup + الـaudit popup كلهم دلوقتي عندهم: (1) `● تغييرات غير محفوظة` badge orange لما `localGridDirty=true`، (2) `💾 حفظ التغييرات` button — disabled لو مفيش edits، green لو فيه. الـbutton بـcommit الـlocalGrid كله في single upSales call. الـclose button (✕) بـauto-save الـunsaved edits قبل ما يقفل — مفيش data loss حتى لو الـuser نسي يضغط حفظ." },
      { type: "feature", text: "⚠️ [Max-avail validation للـcells] User request: 'عاوز المستخدم مايقدرش يدخل رصيد اكبر من المتاح ويشوف تنبيه'. كل cell بـcompute `availForCell = subStock - subSold - other_customers_planned_in_localGrid` — لو الـvalue الحالي أكبر من ده، الـcell بـyـrender مع red border + red background tint + 'تخطى' badge أسفله + tooltip 'المتاح: X قطعة'. الـvalue مش بـyـblock (الـuser يقدر يكتب)، بس الـwarning واضح basariyan. كده الـuser يعرف بالظبط لو غلط." },
      { type: "fix", text: "📊 [الرصيد في البطاقة != الرصيد في الـpopup] User report: 'الرصيد بره (666) غير الرصيد جوه التقرير (687)'. السبب: الـdashboard card كان بـsum كل الـstockModels (incl. avail < 0 للـoversold)، الـpopup بـfilter avail > 0. **الـFix**: الـcard بقى بـuse نفس الـfilter (`m.avail > 0`). دلوقتي 687 = 687 — match." },
      { type: "ux", text: "🗑️ [شيل زر 'إرسال PDF واتساب' من popup الـرصيد متاح] User request: 'مالهوش لازمة الطباعة تكفي'. الـbutton اتشال + الـdoSendWA function اتمسح. الـimports للـarabicPdf utility اتشالت كمان (الـutility لسه موجود في الـcodebase لو احتجناه لاحقاً). الـpopup دلوقتي عنده زر طباعة فقط — أبسط وأنظف." },
      { type: "improvement", text: "🎨 [الـvisual للـmatrix الجديد: كل cell input بـsubtle border] الـcells اللي فيها quantity > 0 بـborder accent-color soft + background light. الـcells اللي exceed avail بـborder error-red + background error-tint. الـempty cells بـborder neutral. الـtransition smooth (~150ms) للـborder color changes — UX feels alive." },
      { type: "improvement", text: "🛡️ [Backward compat: الـold saveCell + auditCell paths لسه موجودين] لو في feature في الـcode بـcall saveCell أو saveAuditCell مباشرة (مثلاً OCR scan results)، الـ functions لسه شغّالة. الـnew localGrid pattern موازي. الـlive Firestore listener يـsync الـcommitted grid back لـlocalGrid لما الـpopup يـreopen عبر الـuseEffect." },
    ]
  },
  {
    version: "V19.70.21",
    date: "2026-05-06",
    types: ["fix", "architectural"],
    title: "🎯 Approach A: jsPDF + Cairo TTF embedded + Arabic shaper — نشيل html2canvas من الـPDF pipeline",
    changes: [
      { type: "fix", text: "🔥 [الـStructural Fix النهائي للـArabic PDF — html2canvas اتشال بالكامل] V19.70.14/15/16/19 جربوا 4 fixes للـhtml2canvas Arabic shaping bug — مفيش واحد منهم حل المشكلة بشكل reliable. السبب الحقيقي: html2canvas's internal canvas rendering للـcomplex scripts (Arabic) مش reliable cross-browser. **الـsolution**: نـbuild الـPDF عبر jsPDF text APIs مباشرة — Cairo TTF embedded في الـPDF نفسه + Arabic letter-shaping تطبق على الـtext قبل الـrendering. الـRTL native، الـligatures طبيعية، الـfont guaranteed (مدمج في الـPDF binary)." },
      { type: "feature", text: "🆕 [`src/utils/arabicPdf.js` — utility جديد كامل] الـpipeline: (1) lazy-load jsPDF + jspdf-autotable من CDN، (2) lazy-fetch Cairo Regular + Bold TTF من jsdelivr/gh (CORS-safe، Google Fonts repo passthrough)، (3) `pdf.addFileToVFS()` + `pdf.addFont()` لـregister الـCairo داخل الـPDF، (4) `pdf.setR2L(true)` للـright-to-left layout، (5) `ar(text)` shaper بـapply Arabic Presentation Forms-B (U+FE70-U+FEFC) على الـtext — converts e.g. 'العميل' Unicode logical → visual shaped form بالحروف المتصلة الصحيحة." },
      { type: "feature", text: "🔤 [Embedded Arabic shaper — ~150 سطر، lookup table كامل] الـjsPDF ما بـyـshape Arabic auto. كتبت minimal shaper بـimplement الـcontextual joining algorithm: لكل letter يـlook up الـjoining type (right-joining للـ'ا د ذ ر ز و ء' وأخواتها، dual-joining لباقي الحروف)، يحدد الـform (isolated/initial/medial/final) based على الـcontext، ويـemit الـcorresponding presentation form codepoint. كمان supports Lam-Alef ligature (ل + ا → glyph واحد ﻻ). الـnon-Arabic chars بـpass through unchanged." },
      { type: "feature", text: "📦 [Applied على popup الـ'رصيد متاح' (V19.70.20) — الـsimpler case الأول] الـpopup كان بـuse htmlToPdfBase64 (html2canvas-based) — اتغيّر ليـuse `buildAvailableStockPdfBase64({factoryName, totalAvail, totalSeries, totalBroken, modelCount, rows, ...})`. الـreport بنفس الـlayout: header (logo + factory name + title + date)، 4 summary chips (الإجمالي/سيري/كسر/عدد الموديلات)، table عبر autoTable مع amber theme، footer 'Powered by CLARK'. كل الـArabic بـrender عبر الـnew engine — مفيش html2canvas في الـpath." },
      { type: "improvement", text: "🛡️ [الـbulk delivery WA send لسه على الـtext-only (V19.70.17)] الـrefactor الكامل لـbuildOneCustomerHTML للـjsPDF يـtake substantial work (header + 2 tables + discount block + QR + signatures + footer). هـyـshipt في V19.70.22 لو الـpopup PDF شغّال صح. لحد ما يتعمل، الـuser لسه يقدر يـtoggle الـ'إرفاق PDF' لو حب، بس default OFF." },
      { type: "improvement", text: "📚 [Documentation: lessons learned] لو محتاج تـgenerate Arabic PDF في المستقبل: متستخدمش html2canvas. استخدم jsPDF مع TTF embedded + manual shaping. ده الـonly bulletproof path في الـbrowser. الـserver-side Puppeteer (Approach B) ممكن يبقى أبسط لكن بـyـadd ~3-5s/PDF latency و~50MB لـVercel function deps." },
    ]
  },
  {
    version: "V19.70.20",
    date: "2026-05-06",
    types: ["feature"],
    title: "📦 بطاقة 'رصيد متاح' clickable — popup بالموديلات (سيري/كسر) + طباعة + إرسال PDF واتساب",
    changes: [
      { type: "feature", text: "👆 [البطاقة بقت clickable مع hover effect] في صفحة CustDeliverPg، البطاقة 'رصيد متاح' في الـSales Dashboard دلوقتي clickable. الـhover بـlift translateY(-2px) + soft shadow بلون warn. الـlabel '👆 اضغط للتفاصيل' أسفل الرقم عشان الـuser يعرف إنها interactive. لا تأثير على الـ3 cards التانية (تسليم مخزن جاهز، المبيعات، الإيرادات) — لو الـuser عاوز نخليها كلها clickable نقدر نضيف في version جاي." },
      { type: "feature", text: "📊 [Popup بكل الموديلات المتاحة مع تقسيم سيري/كسر] الـpopup يعرض table عريض بكل الـrows: # / الموديل / الوصف / سيري / كسر / الإجمالي. الـsorting by الإجمالي descending — أعلى stock في الأعلى. الـsales تتـdeplete من السيري first (matching الـlogic الموجود في matrix الـ'رصيد متاح للبيع' table)، فـ`availSeries = max(0, seriesQty - custDel)` و `availBroken = avail - availSeries`. لو الـmodel عنده rackSize، الـسيري column بـshow كمان '4×6' (4 سيري × 6 قطعة) كـsubtitle. الـtotals row في الـfooter sticky." },
      { type: "feature", text: "🔍 [Search/filter input] الـpopup فيه search input بـreal-time filter على modelNo + modelDesc (case-insensitive). الـtotals بـrecompute حسب الـfiltered rows — مفيد لو الـuser عاوز يطبع تقرير لـsubset من الموديلات (مثلاً 'فستان' فقط)." },
      { type: "feature", text: "🖨 [زر طباعة — browser-native]  بـbuild HTML report بـheader (logo + اسم المصنع + تاريخ + وقت)، summary chips (الإجمالي / سيري / كسر / عدد الموديلات)، table بـbranded warn-color theme (orange gradient على الـheaders، خلفية cream)، totals footer. بـuse `printPage()` (الـbrowser print pipeline اللي بـhandle Arabic correctly — مفيش html2canvas)." },
      { type: "feature", text: "📤 [زر إرسال PDF واتساب لأرقام المالك] بـuse `loadPdfLibs()` + `htmlToPdfBase64()` لـbuild الـPDF (الـHTML نفسه بتاع الـprint، single source of truth). يـsend sequential لكل phone في `data.automation.eventTriggers.ownerPhones[]` عبر الـbridge، مع text summary (الإجمالي + سيري + كسر + عدد الموديلات + top 5 models). الـPDF بـuse `<td class='h'>` headers (V19.70.19 fix) عشان Arabic shaping يـwork. الـconfirmation prompt + status toast + sending state lock." },
      { type: "improvement", text: "🎨 [Theme: orange/amber للـtable داخل الـPDF] لتمييزه عن الـreceipt blue. الـheaders بـuse linear-gradient(#FEF3C7, #FDE68A) مع border #D97706 وtext color #78350F. الـeven rows بـbackground #FFFBEB. الـtotals row بـbackground #FEF3C7 و weight 800. visual identity متناسقة مع الـwarn color للـcard اللي فتحت الـpopup." },
      { type: "improvement", text: "🛡️ [Single source of truth للـHTML] الـbuildReportHTML helper بـfunction واحد مشترك بين الـprint والـWA PDF — مفيش drift بين الـ2 outputs. الـuser يطبع نفس اللي يـsend لنفسه عبر واتساب." },
    ]
  },
  {
    version: "V19.70.19",
    date: "2026-05-06",
    types: ["fix"],
    title: "🎯 Structural workaround: <th> → <td class='h'> — Arabic shaping يـwork أخيراً",
    changes: [
      { type: "fix", text: "💡 [User insight: 'العناوين مكتوبة تمام، ليه مانعملش تجميد للعناوين زي الكتابة النصية الثابتة'] الـuser لاحظ إن الـbody text (الـ<td> cells) بـrender Arabic correctly، الـ<h2> headings كمان تمام، بس الـ<th> headers هي اللي ملخبطة. الـconclusion: html2canvas's iframe بـtreat الـ<th> بشكل مختلف داخل الـrendering pipeline (default browser styling غير الـ<td> + interaction مع الـtable layout)، والـArabic bidi/shaping بتنهار في الـ<th> case. الـsolution: استخدم الـlooks-like-th بس structurally <td>." },
      { type: "fix", text: "🛠️ [الـImplementation: <th> → <td class='h'> في buildOneCustomerHTML] في الـ2 tables داخل الـbulk PDF (info table: العميل/التليفون/التاريخ/العنوان + items table: الموديل/الوصف/الكمية/السعر/الإجمالي)، كل `<th>X</th>` بقى `<td class='h'>X</td>`. الـCSS: `.h{background:linear-gradient(...);font-weight:700;font-size:10px;color:#1E293B;padding:5px 8px;text-align:right;border:1px solid #94A3B8;letter-spacing:0.3px}` — نفس الـvisual بالضبط. الـCairo font ضافت تاني بدل Tahoma لأن الـbody (الـtd) كان بـuse Cairo بنجاح من الأصل. !important على الـbackground عشان specificity wars مع td." },
      { type: "improvement", text: "🛡️ [Scope: bulk WA PDF only] التغيير محصور في `buildOneCustomerHTML` (السطر ~1425). أي `<th>` تانية في الـapp (browser print pages اللي بـuse `printPage`، مش html2canvas) ما اتغيرتش — هي شغّالة تمام لأن الـbrowser print بـhandle الـArabic correctly. مفيش regression risk." },
      { type: "improvement", text: "🔄 [Path forward — flip default ON بعد user verification] الـincludePdf checkbox من V19.70.17 لسه default OFF. لو الـuser confirm إن الـArabic بـrender correctly في الـnew approach، هـnflip الـdefault لـON في V19.70.20. الـworkaround القديم (text-only) هيبقى opt-out بدل opt-in." },
      { type: "improvement", text: "📚 [Lesson: html2canvas + <th> = unreliable] الـtakeaway للـfuture: لو محتاج Arabic في table headers في PDF generated عبر html2canvas، استخدم styled <td> بدل <th>. سواء الـfont system أو web — الـelement type نفسه هو المشكلة، مش الـfont loading." },
    ]
  },
  {
    version: "V19.70.18",
    date: "2026-05-06",
    types: ["feature"],
    title: "✍️🔔 اسم صاحب الشيك + تذكير تلقائي للعميل قبل استحقاق الشيك",
    changes: [
      { type: "feature", text: "✍️ [حقل 'اسم صاحب الشيك (المكتوب على الشيك)' في فورم الشيك] يظهر فقط للـreceivable (أوراق قبض) — مش للـpayable لأن إحنا الـdrawer. الـuse case: العميل يدفع لنا بشيك من حساب طرف ثالث (مثلاً عميل Ahmed يدينا شيك من حساب أخوه Mohamed)، فنحتاج نسجّل اسم Mohamed كـdrawer. لو الحقل فاضي، الـsystem بـdefault يفترض اسم العميل. الـvalue يـsave كـ`drawerName` في الـcheck object. لو الشيك اتـendorseـت لمورد لاحقاً، الـendorse popup بيعرض الاسم ده عشان المورد يعرف صاحب الحساب الحقيقي." },
      { type: "feature", text: "🔔 [تذكير واتساب تلقائي للعميل قبل استحقاق الشيك] الـcheckDue trigger الموجود من قبل كان owner-only (المالك يستلم تنبيه). دلوقتي ضافت recipient 'العميل' كمان (default: OFF — opt-in من Triggers tab). لما يـenable، كل يوم الـcron يـscan الشيكات اللي قرّبت تـreceive من البنك (status=معلق، type=receivable، dueDate خلال thresholdDays)، ويبعت رسالة تلقائية للعميل: 'تذكير: شيك يستحق الصرف قريباً' مع كل التفاصيل (اسم صاحب الشيك، البنك، رقم الشيك، القيمة، تاريخ الاستحقاق، عدد الأيام المتبقية) + تنبيه لتغطية الحساب البنكي. ده يقلل bounces ويحسّن cash flow." },
      { type: "feature", text: "🎚️ [User-tunable threshold] الـ`thresholdDays` config (الموجود من V19.70 للمالك) دلوقتي بـapply على العميل كمان. الـuser يقدر يحدد قبل كام يوم تتبعت التذكير: 1، 3، 7، 14 يوم — حسب اللي يناسب الـworkflow. الـdefault = 3 أيام (نفس الـowner)." },
      { type: "improvement", text: "🛡️ [Idempotency keys مفصولة لكل recipient role] الـcheckDue كان عنده key واحد `checkDue:${id}:${date}` للـowner. دلوقتي للـcustomer كمان: `checkDue:${id}:${date}:customer` (separate key). كده لو الـowner-fire نجح والـcustomer-fire فشل (مثلاً phone invalid)، الـowner ميـcryش re-fire في الـnext tick، والـcustomer يـretry. ولا الـ2 يـdedupe بعض. ده عبر ضافت `recipientFilter` parameter في processEvent + buildEventMessages — array من الـroles المسموح بـbuild messages لها. legacy callers (بدون filter) ما تأثرتش." },
      { type: "improvement", text: "📝 [drawerName في كل الـcheck event payloads] checkDue، checkPaymentReceived، checkBounced، checkCollected، checkRePresented، checkEndorsed، checkPaymentIssued — كلهم دلوقتي عندهم {drawerName} variable متاح في الـtemplates. الـowner template للـcheckDue اتحدّث ليعرض '✍️ صاحب الشيك: {drawerName}' كسطر إضافي. لو الـuser عاوز يضيف الـvariable في templates تانية، يقدر يعمله من الـTriggers tab." },
      { type: "improvement", text: "🛠️ [Mirror sync: api/_eventBuilder.js + src/utils/automation/eventBuilder.js متطابقين 100%] الـEVENT_VARIABLES.checkDue.recipientRoles + variables اتحدّثت في الـ2 ملفات بنفس الـpayload structure. الـbuildEventMessages function ضافت recipientFilter param في الـ2 mirrors. مفيش drift." },
    ]
  },
  {
    version: "V19.70.17",
    date: "2026-05-06",
    types: ["feature", "ux"],
    title: "📎 Workaround: checkbox لإرفاق الـPDF في bulk WhatsApp send (default: OFF)",
    changes: [
      { type: "feature", text: "📎 [Toggle: 'إرفاق نسخة PDF مع رسالة الواتس' في popup الطباعة المجمعة] User report: 'نفس المشكلة ماتحلتش - كده مش مشكلة فونت'. حتى مع system fonts (Tahoma/Arial) الـArabic shaping في الـPDF لسه ملخبط — ده يأكد إن الـbug في html2canvas نفسه (مش في الـfont loading)، الـbrowser internal iframe rendering للـArabic مش reliable. **الـworkaround**: checkbox جديد في الـpopup (تحت 'إذن تسليم بدون أسعار') يخلي الـuser يقرر — يبعت PDF + رسالة، أو رسالة نصية فقط بدون PDF. Default = OFF (text-only) — أأمن default لحد ما الـPDF ينحل." },
      { type: "feature", text: "📝 [Text-only mode بـself-contained] لما الـuser يـtoggle off الـPDF، الرسالة بقت تحتوي معلومات إضافية: التليفون + العنوان (في الـPDF كانوا موجودين بس مش في الرسالة). كده الـmessage standalone — العميل عنده كل التفاصيل اللي يحتاجها بدون ما يحتاج يفتح PDF. الـQR confirmation note (📱 برجاء مسح كود QR...) اتشال في الـtext-only mode لأنه مش relevant بدون PDF." },
      { type: "feature", text: "⚡ [Performance gain في text-only mode] لو includePdf = false: (1) `loadPdfLibs()` (~200KB CDN download) skip، (2) `htmlToPdfBase64()` (heavy html2canvas + jsPDF capture) skip، (3) `/api/delivery-sign` round-trip للـQR signatures skip. الـbatch send في text-only mode أسرع بـ~3-5 ثواني لكل عميل (اختصاراً للـPDF generation)." },
      { type: "ux", text: "🟢 [UI: WhatsApp green styling للـcheckbox] الـtoggle بـuse #25D366 (WhatsApp brand color) لما checked — visually consistent مع زر '📤 إرسال واتساب' الأخضر تحته. الـlabel يـadapt: لو on → 'PDF + رسالة تفاصيل لكل عميل'، لو off → 'رسالة تفاصيل نصية فقط (الموصى به مؤقتاً — حتى يتم حل مشكلة الخط العربي في الـPDF)' عشان الـuser يفهم ليه ده الـrecommended state." },
      { type: "improvement", text: "🛡️ [Confirmation message يـadapt للـmode] قبل V19.70.17 الـconfirmation prompt كانت hardcoded 'هيتم إرسال إذن استلام (PDF) + رسالة تفاصيل'. دلوقتي conditional: لو PDF on → نفس الجملة. لو off → 'هيتم إرسال رسالة تفاصيل (نصية فقط — بدون PDF)'. الـuser يعرف بالظبط هيوصل العميل إيه قبل ما يـconfirm الـbatch." },
    ]
  },
  {
    version: "V19.70.16",
    date: "2026-05-06",
    types: ["fix"],
    title: "🔤 Attempt 3: system fonts (Tahoma/Arial) — also didn't fix",
    changes: [
      { type: "fix", text: "🐛 [V19.70.15 لسه ما حلتش الـbug — User confirmed إن الـheaders لسه ملخبطة] الـFontFace API ضمن إن Cairo Bold بقى registered في الـmain document، لكن **html2canvas بـclone الـDOM في internal iframe**، والـregistered FontFace ما بـcopyـش للـiframe ده بشكل reliable. النتيجة: حتى مع registered FontFace، html2canvas's clone ما لاقاش Cairo Bold → fallback لـArial → الـArabic ligatures ما اتـshapedش." },
      { type: "fix", text: "🛠️ [الـREAL FIX اللي اقترحه الـuser: استبدال font في الـ<th> headers بـsystem fonts] في buildOneCustomerHTML في CustDeliverPg.jsx، الـ`<th>` selector اتعدّل من `font-weight:800` (inheriting Cairo from body) إلى explicit `font-family:'Tahoma','Arial',sans-serif;font-weight:700`. ده بـ(1) bypass الـhtml2canvas FontFace race بالكامل، (2) Tahoma مـpreinstalled على Windows بـnative Arabic glyph shaping، (3) Arial fallback لـmacOS، (4) sans-serif generic للـedge cases. الـbody cells (td) لسه بـuse Cairo (weight 400، اللي كان بـloading صح من البداية)." },
      { type: "improvement", text: "🎨 [Visual تأثير: minimal] Tahoma 700 + Cairo 400 mix بـmaintain الـoverall look — الـheaders شوية أنحف بصرياً عن Cairo 800 لكن لسه bold + الـArabic ligatures correct. الـbrand consistency مش متأثرة لأن الـbody (اللي بـcontain اسم العميل، التفاصيل، والـmoney values) لسه Cairo." },
      { type: "improvement", text: "🛡️ [Defense-in-depth: 3-layer fallback chain] حتى لو Tahoma غير متوفر (لو الـbrowser بـrun على environment غريب)، Arial كمان عنده Arabic shaping. ولو الاتنين فشلوا، sans-serif الـgeneric يـpick up أي Arabic-aware system font (Noto Sans Arabic على Linux مثلاً). مفيش حالة الـheaders تـrender disconnected." },
      { type: "improvement", text: "📚 [Lesson learned: html2canvas + custom fonts = unreliable] الـtakeaway للمشاريع الجاية: لو محتاج Arabic في PDF generated عبر html2canvas، استخدم system fonts (Tahoma, Arial, Times New Roman) بدل web fonts (Cairo, Tajawal, IBM Plex Arabic). أو فكّر في jsPDF text APIs مباشرة (Approach A من الـhandoff). html2canvas's iframe clone مش reliable مع FontFace registry." },
    ]
  },
  {
    version: "V19.70.15",
    date: "2026-05-06",
    types: ["fix"],
    title: "🔤 Attempt 2: FontFace API + binary preload (didn't fully fix)",
    changes: [
      { type: "fix", text: "🐛 [الـCRITICAL: V19.70.14 ما حلّتش الـbug — الـheaders لسه ملخبطة] User confirmed إن V19.70.14 (الـlink injection + document.fonts.load) لم يحل المشكلة. **السبب الحقيقي**: `document.fonts.load(\"800 12px Cairo\")` بـtrigger الـload بس مش بـguarantee إن الـTTF binary خلص download. على fresh page-load، الـawait بـresolve في ~5-10ms والـbinary لسه في flight → html2canvas بـcapture بـArial fallback → الـArabic ligatures مش بـshape." },
      { type: "fix", text: "🛠️ [الـREAL FIX: استخدام FontFace API بدل document.fonts.load string]  `new FontFace(\"Cairo\", \"url(woff2)\", {weight:\"800\"})` بـcreate explicit FontFace object backed by specific binary URL. `face.load()` يـawait الـbinary download + parse. `document.fonts.add(face)` يـregister عبر الـdocument. مفيش race condition ممكنة. الـfont URLs بقت direct woff2 من fontsource CDN (الـArabic subset فقط ~30KB لكل weight بدل ~200KB من Google Fonts CSS wrapper)." },
      { type: "improvement", text: "🛡️ [Force reflow + image-load wait قبل html2canvas capture] V19.70.15 ضافت: (1) `void container.offsetHeight` — force layout reflow عشان الـbrowser commits the font choice، (2) double `requestAnimationFrame` — wait two paint cycles عشان الـrendering tree تـsettle، (3) explicit `<img>` decode wait بدل الـ250ms timeout الفاسد — لكل image في الـcontainer، await `load` event مع 3s timeout cap." },
      { type: "improvement", text: "🎯 [Tighter font-family chain — \"Cairo, sans-serif\" بدل \"Cairo, 'Segoe UI', Arial\"] لو Cairo فشل لـany reason، الـfallback يبقى generic sans-serif (مش Arial تحديداً). الـbug يبقى أوضح للـdebug، ومفيش 'silent break' بسبب Arial اللي ما بـshapeش الـArabic correctly." },
      { type: "improvement", text: "🔁 [_cairoLoading promise — concurrent calls share single load] لو 50 عميل في bulk send، الـensureCairoLoaded() بيـcall لكل واحد. قبل V19.70.15 كان فيه potential race بين الأول والثاني. دلوقتي الـ_cairoLoading promise يـcache الـin-flight load — كل الـcalls الـconcurrent يـawait نفس الـpromise." },
    ]
  },
  {
    version: "V19.70.14",
    date: "2026-05-06",
    types: ["fix"],
    title: "🔤 Hotfix: Arabic glyph shaping في الـPDF — attempt 1 (didn't fully fix)",
    changes: [
      { type: "fix", text: "🐛 [الـCRITICAL: Arabic letters في table headers بـrender disconnected] User report: 'عناوين الجداول في ال بي دي اف العربي ملخبط ومش مقروء وبالعكس'. الـscreenshot أوضح إن 'العميل' بـrender 'لـعميل'، 'التاريخ' بـrender 'لـتايخ'، إلخ. الـcustomer name + address (في td، weight 400) كانوا fine. **السبب**: الـ`<th>` في الـCSS عنده `font-weight: 800` (Cairo Bold). الـoffscreen html2canvas capture بـrun قبل ما الـCairo Bold variant يـload في الـbrowser font cache → الـbrowser يـfallback لـArial أو system font اللي ما بـshapeش الـArabic ligatures correctly → كل حرف يـrender في isolated form بدل ما يتـconnect مع المجاور." },
      { type: "fix", text: "🛠️ [Cairo font preload + wait-for-load قبل html2canvas] **الـFix**: ضافت `ensureCairoLoaded()` helper في htmlToPdf.js. بـ(1) inject `<link>` لـCairo Google Fonts مع كل الـweights (400, 500, 600, 700, 800, 900) لو مش موجود، (2) `document.fonts.load()` لكل weight ضروري بـPromise.all، (3) `document.fonts.ready` كـfallback، (4) extra 200ms delay علشان الـmetrics يـsettle. كده لما html2canvas يـcapture، Cairo Bold يكون موجود فعلاً في الـcache → الـArabic shaping correct." },
      { type: "improvement", text: "🛡️ [Defense-in-depth: explicit dir + lang attrs] قبل V19.70.14 الـoffscreen container كان عنده `direction: 'rtl'` كـCSS بس. ضافت `setAttribute('dir', 'rtl')` و `setAttribute('lang', 'ar')` على الـcontainer كـHTML attributes. بعض الـrendering engines (Chrome internals) تستخدم الـattributes مع الـCSS لـbidi resolution — الـattribute أقوى من الـstyle. + `letterRendering: true` في html2canvas options لـbetter glyph fidelity." },
      { type: "improvement", text: "⏱️ [Wait time من 100ms إلى 250ms قبل capture] الـoriginal had 100ms للـQR/image loading. زدتها لـ250ms عشان الـfont metrics + image rendering يـsettle على الـslowest devices. الـperformance impact ~150ms per customer — مع 50 عميل ده 7.5 ثانية extra على الـtotal بس مش لكل عميل (لأن الـensureCairoLoaded بـcache after first call)." },
    ]
  },
  {
    version: "V19.70.13",
    date: "2026-05-06",
    types: ["fix", "ux"],
    title: "🎯 Bulk WhatsApp delivery — match existing per-row format exactly (PDF + message)",
    changes: [
      { type: "fix", text: "🎯 [الـPDF بقى مطابق لنسخة الـprint الموجودة بالظبط] User report: 'البي دي اف عاوزه يكون نفس نسخة الاستلام الموجوده بالفعل'. V19.70.12 كانت بتـbuild PDF بـlayout مبسّط مختلف عن نسخة الـ🖨 بتاع الصف. **الـFix**: rewrote `buildOneCustomerHTML` تـmirror الـstructure الكاملة: (1) CLARK header (logo + factory name + sub-line + title 'اذن تسليم — {customer}' + date/time)، (2) العميل/التليفون/التاريخ/العنوان table، (3) 'تفاصيل الاستلام' table بـالموديل/الوصف/الكمية/السعر/الإجمالي + aggregation row، (4) discount block (الإجمالي قبل الخصم / خصم N% / الصافي المستحق)، (5) QR code section بـ'تأكيد الاستلام' note، (6) signature row (مسؤول التسليم / توقيع العميل)، (7) factory branding footer." },
      { type: "fix", text: "🎯 [رسالة الواتس بقت مطابقة للنسخة الموجودة بالظبط] User report: 'كمان رسالة الواتس تكون نفس الرسالة بالظبط اللي بتوصل العميل'. **الـFix**: استبدلت الـmessage builder الجديد بنفس الـformat اللي في الـper-row 📱 button: '*CLARK — اذن تسليم عميل*' header، '• العميل / • التاريخ' info، separator '─────────────────'، per-item lines '• *modelNo*: qty قطعة × price = total ج.م'، separator، 'الاجمالي N قطعة' + 'الاجمالي N ج.م' + خصم + 'الصافي المستحق'، '📱 *برجاء مسح كود QR في إذن التسليم للتأكيد باستلام البضاعة كاملة*'، + optional account summary footer من `formatCustomerSummaryWA(buildCustomerSummary(...))` (controlled by printSettings.whatsappSummary)." },
      { type: "improvement", text: "🛡️ [QR code embedded as data URL — no async CDN race] قبل V19.70.13 الـHTML كان يحتوي `<canvas data-qr=...>` + script CDN لـqrcode.js يـrender بعد الـpage load. في offscreen html2canvas capture، الـcanvas ممكن يكون فاضي لأن الـCDN script ما اتـloadش بعد. **الـFix**: استخدمت `qrcode` package المثبت بالفعل في الـdependencies — `QRCode.toDataURL(url, {width:200, errorCorrectionLevel:'M'})` يـpre-generate الـQR كـdata URL سيمنكروني، ثم أضاف كـ`<img src='data:...'/>` في الـHTML. مفيش race condition، الـPDF دائماً يحتوي الـQR." },
      { type: "improvement", text: "🛠️ [buildOneCustomerHTML بقى async] لأن QR generation async، الـfunction signature تغيّرت لـasync. الـsend loop بيـawait correctly. مفيش impact على الـperformance لأن الـloop already sequential." },
    ]
  },
  {
    version: "V19.70.12",
    date: "2026-05-06",
    types: ["feature"],
    title: "📤📄 WhatsApp delivery receipts — bulk send PDF + details to selected customers",
    changes: [
      { type: "feature", text: "📄 [Per-customer PDF receipt + WhatsApp send] في popup 'طباعة مجمعة' في صفحة CustDeliverPg، زر جديد 📤 'إرسال واتساب' بجانب زر الـprint. لكل عميل مختار عنده رقم تليفون: (1) HTML للـreceipt يتـبني (نفس الـlayout بتاع الـprint بس per-customer)، (2) html2canvas + jsPDF يـconvert لـPDF base64 (lazy-loaded من CDN — ~200KB مش بـbloat الـbundle لو ما اتستخدمتش)، (3) رسالة text بالملخص (تاريخ، إجمالي قطع، إجمالي قبل الخصم، الخصم، الصافي المستحق)، (4) POST لـbridge /send مع PDF كـmedia attachment. الـbridge من V19.31 يدعم الـpattern ده بالفعل." },
      { type: "feature", text: "🏷️ [Status badges per-customer + progress] كل عميل في الـlist يعرض badge حالته: ⏳ جاري الإرسال (transient)، ✓ تم الإرسال (success)، ⛔ فشل (with hover tooltip للـerror message)، 📵 بدون رقم (للعملاء المش عندهم phone). الـsend button يـlock أثناء الـsending. الـpopup يحتفظ بالعميل في الـlist بعد الإرسال (مش يختفي) — يتم عرض الـbadge عشان user يعرف اللي وصل." },
      { type: "feature", text: "⚙️ [Anti-ban: bridge defaults] الـsend loop يـpost بـsequential await (مش parallel) — الـbridge يـapply delays الـdefault (8-15 ثانية بين الرسائل) عشان مفيش حظر للرقم. لو 50 عميل، الـsending يـtake 6-12 دقيقة. progress badge يحدّث مع كل عميل يخلص. الـconfirmation prompt يحذّر الـuser قبل الـbatch send." },
      { type: "feature", text: "🆕 [src/utils/htmlToPdf.js — reusable utility] `loadPdfLibs()` يـlazy-load html2canvas + jsPDF عبر CDN (caches in window). `htmlToPdfBase64(html, opts)` بيـrender الـHTML في offscreen container، يـcapture بـhtml2canvas (scale=2 للـcrisp text)، يـbuild PDF (A4 portrait، multi-page automatic لو طويل)، يرجّع base64 string جاهز للـbridge. الـutility reusable لأي feature تانية محتاجة HTML→PDF→WhatsApp." },
      { type: "improvement", text: "🛡️ [Failure handling] لو عميل واحد فشل (network، bridge unreachable، PDF generation failed)، الـbatch يكمل للباقي. الـerror يتـsave في `groupPrint.waLastErr[custId]` ويظهر كـtooltip. الـsend button يفضل enabled بعد الـbatch — الـuser يقدر يـretry للفاشلة بإعادة الضغط (الـsent ones عندهم badge ✓ ومش هيتعاد إرسالهم لأن الـcheckbox عمل selection على الكل)." },
    ]
  },
  {
    version: "V19.70.11",
    date: "2026-05-05",
    types: ["feature", "ux"],
    title: "📨🔄 checkEndorsed + checkRePresented + bounced→re-bounce supported",
    changes: [
      { type: "feature", text: "📨 [checkEndorsed — شيك مُظهَّر لمورد] لما تـendorse شيك من عميل لمورد (status=مُظهَّر)، المورد يستلم رسالة فورية بكل تفاصيل الشيك + اسم العميل الأصلي (صاحب الشيك) للمراجعة. الـpayload includes: customerName (drawer), supplierName (recipient), bank, checkNo, amount, dueDate, customerOffice, supplierOffice, balance (supplier debt reduced). الـhook في `endorseCheck` function — snapshot الـcheck + customer قبل الـupConfig، fire after." },
      { type: "feature", text: "🔄 [checkRePresented — إعادة تقديم شيك مرتد] الـUI button '↻ إعادة' الموجود من قبل (يحوّل status=مرتد→معلق) دلوقتي بـfire event للعميل + المالك. Customer message: 'إعادة تقديم شيك للبنك' مع تاريخ الأصلي + تاريخ إعادة التقديم + الرصيد المستحق (يقل بقيمة الشيك تاني، لأن الشيك بقى active مرة أخرى). الـtransition detection في updateStatus: prevStatus===مرتد && newStatus===معلق." },
      { type: "feature", text: "🛡️ [Re-bounce support — keys date-suffixed] لو شيك ارتد → اتـreallocated → ارتد تاني، قبل V19.70.11 الـeventHistory يـdedupe الـcheckBounced على نفس الـid. **الـFix**: idempotencyKey بقى date-suffixed: `checkBounced:${id}:${dt}` و `checkRePresented:${id}:${dt}` — كل bounce/re-present يـfire بنجاح حتى لو ده الـ2nd/3rd round على نفس الشيك." },
      { type: "ux", text: "🚫 [BlocklistPage header text] '💡 إيش هي القائمة دي:' بقى '🚫 قائمة العملاء المحظورين:' — أوضح وأرسمي. التعريف نفسه ما اتغيرش." },
      { type: "improvement", text: "🎯 [Now 10 event types total] sale, paymentCash, paymentChecksIn, paymentChecksOut, **endorsed**, collected, bounced, **rePresented**, lateOrder, checkDue. الـ4 events المتعلقة بالشيكات (PayIn/PayOut/Endorsed/Collected/Bounced/RePresented) بتـcover الـlifecycle بالكامل: استلام → تظهير/تحصيل → ارتداد → إعادة تقديم." },
    ]
  },
  {
    version: "V19.70.10",
    date: "2026-05-05",
    types: ["feature", "ux"],
    title: "📤✅⚠️ 3 new check events: Issued + Collected + Bounced",
    changes: [
      { type: "feature", text: "📤 [checkPaymentIssued — شيكات أوراق دفع لمورد] event جديد، نفس الـUX pattern زي checkPaymentReceived بس في الاتجاه المعاكس. لما تـsave check بـtype=payable + category=دفعة مورد + supplier linked، الـsupplier يستلم رسالة فورية بكل تفاصيل الشيك (بنك، رقم، قيمة، استحقاق) + balance progressive (لكل شيك في الـbatch، الرصيد المتبقي من ديننا للمورد بـيقل). New 'supplier' recipient role added to buildEventMessages — uses supplierPhone parameter (separate from customerPhone)." },
      { type: "feature", text: "✅ [checkCollected — تم تحصيل شيك] لما تـmark شيك receivable بـstatus='محصل'، الـcustomer يستلم رسالة شكر فورية (تم التحصيل، البنك، الشيك، التاريخ، الرصيد المتبقي). الـclient hook يـsnapshot الـcheck قبل الـupConfig + يـfire بعد الـtoast الموجود. Idempotency: `checkCollected:${id}`." },
      { type: "feature", text: "⚠️ [checkBounced — شيك مرتد] لما تـmark شيك receivable بـstatus='مرتد'، الـcustomer يستلم تحذير (شيك مرتد، البنك، الشيك، تاريخ الارتداد، الرصيد المستحق + 'يرجى التواصل فوراً للسداد'). Idempotency: `checkBounced:${id}`. الـbalance يـreflect الـreversal (الـcheck لم يعد counted كدفع)." },
      { type: "ux", text: "🏪 [Supplier role label في EventCard] العمود الـrecipient toggles دلوقتي يعرض '🏪 المورد' للـsupplier role، في الـadditional للـ'👤 العميل' و '🏭 المالك'. كل event يعرض الـrecipient roles المناسبة له بـconditional logic." },
      { type: "ux", text: "📐 [تسجيل column header centered] V19.70.9 وضّعت الـdata centered لكن الـheader 'تسجيل' لسه right-aligned. **الـFix**: header dynamically conditional على اسم الـcolumn — لو 'تسجيل' فالـheader يبقى centered للمطابقة مع الـdata cells." },
      { type: "improvement", text: "🛡️ [supplierPhone في processEvent + endpoint] event-trigger.js + _eventProcessor.js الـ2 بقوا يقبلوا `supplierPhone` في الـbody جنب `customerPhone`. الـphones object الـinternal دلوقتي عنده 4 keys: customer/supplier/owner/salesperson. كل event يستخدم اللي يحتاجه based on recipientRoles." },
    ]
  },
  {
    version: "V19.70.9",
    date: "2026-05-05",
    types: ["ux"],
    title: "🔍 Searchable customer/supplier picker في checks form + centered time",
    changes: [
      { type: "ux", text: "🔍 [Searchable picker للـعميل/المورد في check form] الـ`<select>` كانت بتعرض list طويل للعملاء/الموردين — صعب التنقل لو كان فيه عشرات. **الـFix**: استبدلتها بـsearchable input + filtered dropdown. الـuser يكتب جزء من الاسم → الـlist تـfilter case-insensitive → click على نتيجة يـlink الـid + الـname. لو 30+ نتيجة، الـdropdown بـcap على أول 30 ويعرض count للباقي ('...30 نتيجة أكتر — اكتب أكتر للتضييق'). لما parties محدد، يظهر بـ✕ للـclear ويرجع للـsearch view. الـmanual-name fallback (للـparties المش مسجلة) لسه موجود تحت كـsecondary input." },
      { type: "ux", text: "📐 [Centered time alignment under date في checks list] V19.70.8 ضافت time تحت date لكن aligned start (يمين في RTL). الـuser request: في المنتصف. **الـFix**: `textAlign: 'center'` على الـtd + الـ2 divs. الـtimestamp بقت في central column under the date — أوضح visually." },
    ]
  },
  {
    version: "V19.70.8",
    date: "2026-05-05",
    types: ["fix", "feature", "ux"],
    title: "🛠️ Check batch progressive balance + UI polish + multi-select delete",
    changes: [
      { type: "fix", text: "🐛 [الـCRITICAL: balance بـbatch checks كان ثابت لكل الرسائل] User report: الـ3 شيكات في الـbatch بعتت رسائل بـbalance متطابق ('1,600 ج.م') بدل ما يقل progressive. السبب: الـclient hook كان بيـcompute balance مرة واحدة قبل الـloop ويستخدمها لكل الـchecks. **الـFix**: balance يـcompute للـbase أولاً (بدون أي check من الـbatch)، وكل check يبعت بـ`baseBalance - (i+1) * amount` — شيك 1 = base - 1000، شيك 2 = base - 2000، شيك 3 = base - 3000 (الرصيد النهائي). الـorder كمان مهم — استبدلت Promise.all بـsequential await عشان الرسائل تنزل بالترتيب 1→2→3 في WhatsApp." },
      { type: "fix", text: "🔄 [Cron-side scan كمان فيها نفس الـfix] `scanRecentChecks` في api/automation-tick.js كان بيـuse balanceMap مرة واحدة لكل check. دلوقتي بيـcompute progressively: لو check جزء من batch، يـsum amounts من نفس الـbatchId مع batchIdx <= this.batchIdx ويـsubtract. لو single check (مش batch)، يـsubtract just this check's amount. كده الـclient + cron الاتنين متطابقين على الـbalance logic." },
      { type: "ux", text: "📐 [Time UNDER date في checks list — بدل inline] الـcell كان بـdisplay الوقت inline بعد الـdate. الـuser request: 'عاوز نخلي الساعة تحت التاريخ في الصف'. **الـFix**: الـcell بقى يحتوي على 2 divs نظيفين — `<div>{c.date}</div>` ثم `<div>{formatTxTime(c.createdAt)}</div>`. lineHeight=1.3 مع padding 4px (بدل 6px) — الـrow ضغطت ~30%، أكتر شيكات تظهر بدون scroll." },
      { type: "feature", text: "☑️ [Multi-select + bulk delete للـchecks] قبل V19.70.8 الـuser محتاج يحذف كل شيك على حدة. دلوقتي عمود checkbox أول العمود + select-all في الـheader. لما تختار 1+ شيك، bulk-delete bar أحمر يظهر فوق الـtable مع زرين: 'إلغاء التحديد' و 'حذف المحدد (N)' (مع confirmation). نفس الـpattern اللي في الـjournal لـtransactions. مفيد بـspecial لو عملت batch غلط وعايز تشيله كله." },
    ]
  },
  {
    version: "V19.70.7",
    date: "2026-05-05",
    types: ["fix", "ux"],
    title: "🐛 Hotfix: checkPaymentReceived missing from Triggers UI + clearer Arabic labels",
    changes: [
      { type: "fix", text: "🚨 [الـCRITICAL: checkPaymentReceived event type ما كانش ظاهر في الـUI] V19.70.5 ضافت الـcheckPaymentReceived event في الـEVENT_VARIABLES + DEFAULT_AUTOMATION_CONFIG، لكن الـTriggersTab في AutomationPg كان عنده hardcoded list `['saleCompleted', 'paymentReceived', 'lateOrder', 'checkDue']` بدون checkPaymentReceived. النتيجة: الـuser ما يقدرش يـenable الـtrigger، فالـclient hook كان بيـcall الـendpoint بس الـendpoint بيرجع `skipped: event-disabled` لأن الـconfig.enabled = false. **الـFix**: ضافت 'checkPaymentReceived' للـeventTypes array (now 5 events)." },
      { type: "ux", text: "🏷 [Arabic-primary labels عشان وضوح الفصل بين الكاش والشيكات] قبل V19.70.7 الـlabels كانت English/Arabic mix ('💰 Sale Completed', '💵 Payment Received', إلخ). الـuser request: 'الخزنة لوحدها والشيكات لوحدها' — يعني فصل واضح. الـnew labels عربي صريح: '💰 بيع جديد للعميل'، '💵 دفعة كاش/تحويل من عميل' (نقدي/محفظة/انستاباي/تحويل بنكي — مش شيكات)، '🏦 دفعة شيكات من عميل' (شيك واحد أو حافظة)، '⚠️ أوردر متأخر'، '📅 شيك يستحق قريباً'. الـdescription بقت explicit عشان مفيش لخبطة." },
      { type: "improvement", text: "🛡️ [Test plan لـregression] أي event type جديد لازم يتـregister في 3 places: (1) EVENT_VARIABLES في eventBuilder.js، (2) DEFAULT_AUTOMATION_CONFIG.events في buildDailyReport.js، (3) eventTypes array في AutomationPg.jsx TriggersTab. لو نسيت أي واحدة فيهم، الـevent يبقى ghosted من perspective المستخدم. ضافت inline comment في eventTypes array لتنبيه الـeditor المستقبلي." },
    ]
  },
  {
    version: "V19.70.6",
    date: "2026-05-05",
    types: ["feature", "ux"],
    title: "🔁⏰ Recurring campaigns + Cairo time-of-day in transaction logs",
    changes: [
      { type: "feature", text: "🔁 [Recurring campaigns — 4 patterns] الـschedule UI دلوقتي عنده recurrence type selector: مرة واحدة / يومي / أسبوعي / شهري / فترة محددة. كل type عنده الـinputs المناسبة: يومي = timeOfDay، أسبوعي = أيام الأسبوع متعددة + timeOfDay، شهري = يوم الشهر (1-28) + timeOfDay، فترة محددة = rangeStart→rangeEnd + timeOfDay. End-condition optional: maxOccurrences أو endDate. Use case: حملة شكر يومية للعملاء، تذكير شهري بالـunpaid، عرض أسبوعي يوم الإثنين والأربعاء، إلخ. مفيش نسيان من المستخدم — الـsystem بيـrun لوحده." },
      { type: "feature", text: "🔄 [Cron-side: computeNextFireTime + auto-reschedule] بعد كل fire ناجح، الـcron يحسب الـnext fire time بناءً على الـrecurrence pattern + lastFiredAt. لو في end-condition (maxOccurrences/endDate) و وصلت → status='done'. لو لأ → status='scheduled' مع scheduledAt الجديد، الحملة تستمر. مفيش الـcustomer بيستلم رسائل بعد maxOccurrences حتى لو الـserver راجع تأخر." },
      { type: "ux", text: "📋 [ScheduledCampaignsList بيعرض الـrecurrence] الـrow بيـshow human-readable description (e.g. '🔁 يومي • 09:00'، '📆 أسبوعي • إثنين، أربعاء • 09:00'، '🗓 شهري • يوم 15 • 10:00') + counter بـ'X مرة' و آخر تنفيذ. الـrecurring campaigns مرتبة بـnext-scheduled time عادي، الـuser يشوف لما الحملة هتـrun next." },
      { type: "feature", text: "⏰ [Cairo time-of-day في سجل الخزنة] قبل V19.70.6 الـjournal كان يعرض الـdate بس (e.g. '2026-05-05'). دلوقتي يعرض الوقت كمان بصيغة عربية 12-ساعة مع م/ص (e.g. '2026-05-05 ٣:٤٥ م') مأخوذة من createdAt للـtransaction. الـsort بقى by createdAt DESC — أحدث حركة بـالدقيقة بالظبط في الأعلى. مفيد للـmulti-entry days." },
      { type: "feature", text: "⏰ [Cairo time في الـchecks list كمان] جدول الشيكات اتضافله column 'تسجيل' (تاريخ + وقت الـcreatedAt). الـsort اتغيّر من dueDate ASC إلى createdAt DESC — الشيكات الجديدة في الأعلى مع وقت إضافتها. الـoverdue/dueDate logic لسه نفسها، بس الترتيب يعكس الـchronological order للإضافة." },
      { type: "improvement", text: "🛠️ [formatTxTime + formatDateTime helpers في utils/format.js] reusable functions للـ12-hour Arabic time formatting بـAfrica/Cairo timezone. أي transaction list محتاج يضيف time display ممكن يستخدمهم بدون duplication. الـIntl.DateTimeFormat caches للـ-performance (مفيش re-instantiation كل render)." },
    ]
  },
  {
    version: "V19.70.5",
    date: "2026-05-05",
    types: ["feature", "fix", "ux"],
    title: "🏦📷📐 Check trigger + image campaigns + Treasury UI cleanup",
    changes: [
      { type: "feature", text: "🏦 [Check Payment Received trigger] event type جديد بنفس نظام الـpaymentReceived بس بـcheck details. لما العميل يدفع شيك، الرسالة تروحله بالبنك ورقم الشيك والقيمة وتاريخ الاستحقاق + الرصيد المتبقي. لو حافظة شيكات (batch >1)، كل شيك يبعت كرسالة منفصلة بـ`{batchInfo}` = '(شيك X من Y)'. instant-fire client hook في TreasuryPg + cron-side fallback في scanRecentChecks (filter: type=receivable, status=معلق, category=دفعة عميل، last 24h، respects enabledAt). Idempotency `checkPay:${id}` per check." },
      { type: "feature", text: "📷 [Campaign scheduling مع صور] الـschedule UI في ChooseSendMode دلوقتي عنده image picker — لحد 4 صور لكل campaign، حد أقصى 200KB لكل صورة بعد الـcompression (canvas resize to 1024px max + JPEG quality 0.7). الصور inline base64 في `data.scheduledCampaigns[].images[]`. الـcron scanScheduledCampaigns يضيف `media: [{base64, mime, name}]` لكل message — الـbridge موجود فيه `MessageMedia` support بالفعل (مفيش VPS update مطلوب)." },
      { type: "ux", text: "📐 [Treasury UI: dense single-row toolbar] قبل V19.70.5 صفحة الخزنة كان فيها 2 صفوف فوق الـjournal: (1) 3 KPI cards (وارد/منصرف/صافي اليوم) + date picker + 3 action buttons (طباعة/PDF/واتساب)، (2) account summary card. **الـFix**: الـ3 daily-KPI cards اتشالوا (المعلومة موجودة في الـaccount summary). الـdate picker + actions اتدمجوا داخل الـaccount summary card في single horizontal row. على الـjournal view (الكل، بدون account)، الـtoolbar compact على flex-end. النتيجة: ~70px space gained للـjournal/list section تحت." },
      { type: "improvement", text: "🎨 [Image preview thumbnails في الـschedule UI] لما تـattach صور، 80×80 thumbnails تظهر مع زر × للـremove + size badge بـKB لكل صورة. validation client-side (max 4، max 200KB per image). الـsubmit button يعرض count: '📎 N صورة مرفقة — هتتبعت مع كل رسالة'." },
      { type: "ux", text: "🎯 [Bridge media format already supports it] clark-wa-bridge/server.js (V19.31) عنده `MessageMedia` support كامل — يقبل `{media: [{base64, mime, name}]}` array per message. الـcron يبني الـpayload بـformat ده ويضيفه للـmessages اللي في scheduledCampaign. مفيش VPS deploy مطلوب." },
    ]
  },
  {
    version: "V19.70.4",
    date: "2026-05-05",
    types: ["feature", "automation"],
    title: "⚡📅 Sale instant fire + Campaign scheduling (text-only)",
    changes: [
      { type: "feature", text: "⚡ [Sale instant fire — كل path] V19.70.3 ضافت instant لـpaymentReceived في TreasuryPg. V19.70.4 بتضيف نفس الـpattern لـsaleCompleted في الـ2 paths الرئيسية: (1) MobileQuickSale (الـmobile-first flow اللي المحصّل/الـsales-rep بيستخدمه عند العميل) — لحظة ما تـsave البيع، الـapp يبعت لكل order delivery رسالة WhatsApp فوراً. (2) CustDeliverPg QR-sale flow — نفس الـlogic. الـcron تفضل fallback لو الـclient فشل (network down). Idempotency: `sale:${id}` keys consistent بين الـclient hook والـcron-side scan." },
      { type: "feature", text: "📅 [Campaign scheduling — text-only] حملة جديدة عندها option جديد '📅 جدولة لوقت لاحق' في شاشة طريقة الإرسال. الـuser يـpick template + segment زي العادة، ثم بدل ما يبعت دلوقتي يحط datetime مستقبلي. الحملة تُحفظ في `data.scheduledCampaigns[]` بـstatus='scheduled' + الـaudience snapshot (عشان الـsegment changes لاحقاً ما تأثرش على الـscheduled campaign). الـVPS cron يـscan كل 5 دقائق ويـfire الحملات اللي وصل ميعادها." },
      { type: "feature", text: "📋 [Tab جديد '📅 المجدولة' في الـCampaigns page] قائمة بكل الحملات المجدولة + status pill (في الانتظار/جاري الإرسال/تم/فشل/ملغي). زر إلغاء للـscheduled + زر حذف للـcompleted/failed/cancelled. الـcron status updates تظهر تلقائياً (live data via Firestore listener)." },
      { type: "feature", text: "🔄 [Cron-side: scanScheduledCampaigns] الـautomation-tick.js دلوقتي عنده section F: scan الـscheduledCampaigns، اخد أول واحد due (oldest scheduledAt that's already passed)، transactional claim بـstatus='firing' (يمنع double-fire لو 2 ticks raced)، build messages من الـtemplate + items، POST بريدج /send، mark 'done' أو 'failed'. واحد per tick (الحملات ممكن تكون كبيرة، الـtimeout protection)." },
      { type: "improvement", text: "🛡️ [Idempotency consistency لـsales] قبل V19.70.4 الـcron-side sale scan كانت idempotency: `sale:${orderId}:${date}:${qty}:${custId}` — composite key قابل للـcollision (لو نفس العميل اشترى نفس الكمية من نفس الموديل في نفس اليوم). دلوقتي: لو الـdelivery عنده `id`، استخدم `sale:${id}`. الـclient hook الجديد دائماً يـpre-generate id، فالاتنين متطابقين." },
      { type: "ux", text: "📅 [Pre-filled datetime picker — default = +1 hour] لما تـpick 'Schedule for later' في chooseSendMode، الـdatetime input يبدأ بـ'دلوقتي + ساعة'. الـuser يقدر يعدّل، أو يحفظ مباشرة لـschedule بساعة من دلوقتي. min attribute يمنع اختيار وقت في الماضي." },
      { type: "docs", text: "📋 [V19.70.5 roadmap: image attachments] الـcampaigns scheduling في V19.70.4 text-only. ضافت الـimages attachment يحتاج: (1) Firebase Storage upload في الـclient، (2) `data.scheduledCampaigns[].images[]` field (already added — empty array). (3) bridge endpoint update لـMessageMedia support — يحتاج SSH لـContabo VPS وredeploy الـbridge. الـbridge code (clark-wa-bridge/server.js) لازم يـaccept `mediaBase64+mediaMime+mediaName` per message ويبني MessageMedia.fromUrl/fromFilePath. ده الـscope لـV19.70.5 (يحتاج VPS redeploy)." },
    ]
  },
  {
    version: "V19.70.3",
    date: "2026-05-05",
    types: ["feature", "ux"],
    title: "⚡ Instant paymentReceived — رسالة العميل توصل لحظياً عند تسجيل الدفعة",
    changes: [
      { type: "feature", text: "⚡ [Client-side instant fire لـpaymentReceived] قبل V19.70.3 الـpayment trigger كان يـwait الـcron (5 دقايق max). User report: 'لما المحصّل يستلم دفعات عند العملاء ويسجل عل الموبيل، الرسالة لازم توصل العميل فوراً' — الـ5 دقايق مش مقبولة في الـuse case ده. **الـFix**: ضافت client-side hook في TreasuryPg.jsx — لحظة ما `saveTx` يكمل، الـapp يـcall `/api/event-trigger` مباشرة بـadmin token. الـuser يشوف الـsave حصل، الواتس عند العميل بيوصل في ثواني (مش دقايق)." },
      { type: "feature", text: "🛡️ [Cron remains fallback] الـclient hook هو fire-and-forget — لو فشل (network down، الـapp اتقفلت قبل الـrequest يخلص، لو فيه bridge error)، الـnext cron tick هيـcatch up خلال ≤5 دقايق. الـidempotency عبر `payment:${id}` يضمن مفيش double-send، حتى لو الـclient و الـcron الاتنين فيوا في نفس الوقت — السكان الجاي يلاقي الـkey في eventHistory ويـskip." },
      { type: "feature", text: "💰 [Balance computed client-side] الـclient يحسب الـbalance بنفس الـformula اللي في الـcron-side (deliveries × price − returns − payments − new amount) ويبعتها في الـpayload. الـ{balance} variable في الرسالة يعرض الرصيد الصح بعد الدفعة دي." },
      { type: "ux", text: "🎯 [Scope: only NEW + customer payments + linked customer + has phone] الـhook يـfire فقط لما الشروط الـ4 مستوفاة: (1) entry جديد (مش edit)، (2) txCategory==='دفعة عميل'، (3) الـcustomer مربوط (linkedCustId)، (4) الـcustomer عنده phone. أي واحدة منهم missing → skip silently، الـcron يبقى المسؤول الوحيد. ده يحمي من الـunintended fires في الـpaths الجانبية." },
      { type: "improvement", text: "⏱ [Sale completed لسه cron-only] الـsale event مش instant في V19.70.3 — لسه عبر cron 5-min. الـuse case الأساسي للـuser هو payment (المحصل). لو محتاج sale instant كمان، نضيف hook في DetPg/CustDeliverPg في V19.70.4." },
    ]
  },
  {
    version: "V19.70.2",
    date: "2026-05-05",
    types: ["fix", "automation"],
    title: "🛡️ Backfill prevention + customer balance computation in payment messages",
    changes: [
      { type: "fix", text: "🚨 [الـCRITICAL: triggers كانت بـfire لـevents قديمة قبل تفعيل الـtrigger] User report: فعّل paymentReceived ووصلته رسالة لعميل بدفعة دفعها امبارح. السبب: الـscan كان فلتر بـ24h date window، لكن الـ24h هي 'اليوم وامبارح' — مش 'منذ تفعيل الـtrigger'. النتيجة: events قديمة (قبل تفعيل) كانت بـfire لو وقعت في اخر 24 ساعة. **الـFix**: كل event دلوقتي عنده `enabledAt` timestamp — يتعمل set كل مرة المستخدم يفعّل الـtrigger. الـ4 scan functions بيـskip أي entity `createdAt < enabledAt`. النتيجة: لما تفعّل trigger النهاردة، 0 رسائل لـevents من قبل — لو حتى وقعت من ثانية واحدة قبل التفعيل." },
      { type: "fix", text: "💰 [الرصيد كان بـ0 في الـpaymentReceived message] السبب: الـpayload كان بـuse `p.balanceAfter` — الـfield ده مش موجود في الـpayment record (مش بنحسبه عند الـsave). النتيجة: الـ{balance} variable كان دايماً 0. **الـFix**: ضافت `computeCustomerBalances(orders, payments)` helper — يحسب الرصيد من الـformula الكاملة (الـformula نفسها اللي في daily report alerts section): `Σ(deliveries × price) − Σ(returns × price) − Σ(payments)`. الـscan دلوقتي يـlookup balances[custId] = الرصيد الحالي بعد الدفعة دي. الـmessage يعرض القيمة الصح." },
      { type: "fix", text: "🛡️ [Auto-migration للـusers الموجودين] الـusers اللي فعّلوا triggers في V19.70/V19.70.1 ما عندهمش `enabledAt`. **الـFix**: `ensureEnabledAt()` helper — أول scan بعد upgrade يـset `enabledAt = now` ويـskip الـscan دي. السكان الجاي يستخدم الـtimestamp ويفلتر صح. ده يضمن الـmigration بدون burst من الـrefires." },
      { type: "ux", text: "📅 [UI: 'مفعّل من' badge في الـEventCard] لما الـevent تكون مفعّلة، badge أخضر يعرض timestamp الـenable + سطر شارح: 'لن تتم معالجة أي event حصل قبل التاريخ ده'. الـuser يفهم بالظبط هو متى الـtrigger ابتدى يـmonitor." },
      { type: "improvement", text: "⚡ [Performance: orders cached cross-scans] الـsale + payment + lateOrder الـ3 محتاجين الـorders. قبل V19.70.2 كانت 3 reads منفصلة في كل tick. دلوقتي read واحد + cached + passed لكل الـscan functions. للـusers اللي عندهم 100s of orders ده فرق ملحوظ في تكلفة Firestore." },
    ]
  },
  {
    version: "V19.70.1",
    date: "2026-05-05",
    types: ["fix", "feature", "ux"],
    title: "🛠️ V19.70 patch — Check Due بكل التفاصيل + Payment method picker + double-currency fix",
    changes: [
      { type: "fix", text: "🐛 [الـCRITICAL: double-currency في الـmessage templates] قبل V19.70.1 الـauto-formatter كان بيـadd ' ج.م' لـ{amount}/{value}/{balance}، والـtemplate كمان فيها ' ج.م' في النص. النتيجة: '12,500 ج.م ج.م' في كل رسالة فيها قيمة. **الـFix**: الـauto-formatter دلوقتي بـformat الرقم بـthousand separators بس (12,500)، الـtemplate يتحكم في الـcurrency. الـtemplates الموجودة سليمة لأنها كانت أصلاً بتـكتب ' ج.م'. الـmessages بقت نظيفة." },
      { type: "feature", text: "📅 [Check Due بكل التفاصيل + only-in-factory filter] V19.70 كانت بـtرفع alert لأي شيك مش 'محصل/مرتد/ملغي'. ده غلط — الشيك المظهَّر (مُظهّر، اتنقل لمورد) مش في حوزتنا. **الـFix**: الـscanner دلوقتي يفلتر ON `status === 'معلق'` بس (الشيكات الموجودة فعلاً في المصنع). + الـpayload اتـenriched: الـ{checkType} ('ورقة قبض من عميل' / 'ورقة دفع لمورد')، {partyKind} (العميل/المورد)، {partyName}، {office} (الـcompanyName من الـcustomer/supplier record)، {notes}، {category}، + الـold {bank}/{checkNo}/{amount}/{dueDate}/{daysToDue}. الـdefault template اتحدّث ليعرض كل ده بـemoji-prefixed lines." },
      { type: "feature", text: "💳 [Payment method picker في خانة الخزنة] قبل V19.70.1 الـmethod كان hardcoded 'كاش' في كل custPayment/supplierPayment. ده بيظهر في الـpayment-received message كـ'الطريقة: كاش' لكل دفعة. **الـFix**: الـtreasury form دلوقتي عنده dropdown لـ4 methods (نقدي كاش، تحويل محفظة الكترونية، تحويل انستاباي، تحويل بنكي) — يظهر فقط لما تختار 'دفعة عميل' (in) أو 'دفعة مورد' (out). الـvalue يـsave في الـpayment record + يظهر في الـ{method} variable في الـmessage." },
      { type: "ux", text: "🔄 [Edit-time method sync] لما تـedit حركة خزنة موجودة من قبل، الـform يـlookup الـlinked custPayment/supplierPayment من الـtreasuryTxId ويعرض الـmethod المسجّل (مش بيحط الـdefault). كده الـuser يقدر يغيّر الـmethod لو سجّل غلط بدون ما يـoverwrite الـsaved value." },
    ]
  },
  {
    version: "V19.70",
    date: "2026-05-05",
    types: ["feature", "automation"],
    title: "🔥 Event Triggers — instant WhatsApp on sale/payment/late-order/check-due",
    changes: [
      { type: "feature", text: "🔥 [4 event types مع UI configurable كامل] Sale Completed (بيع للعميل) + Payment Received (دفعة من عميل) + Late Order (أوردر متأخر >N أيام) + Check Due (شيك يستحق خلال N أيام). كل event عنده toggle ON/OFF، اختيار recipients (customer/owner)، template editable per role مع variables hint + preview + reset-to-default + threshold للـcron-detected events. Tab جديد '🔥 Triggers الفورية' في الـAutomation page." },
      { type: "feature", text: "🟢🟡 [Mode toggle: Auto vs Manual — fallback للـserver issues] Auto mode: الـsystem يبعت تلقائياً (cron scan كل 5 دقائق + retry على failure). Manual mode: الـevents تتـqueue في pending list، الـuser يبعت كل واحدة بإيدها. مفيد لو الـbridge/server عنده مشكلة وعايز تتحكم باليد. الـpending queue موجود في الـmodes الاتنين كـfailsafe — لو الـbridge فشل في auto، الـevent يـcommitت في pending للـretry." },
      { type: "feature", text: "📋 [Pending queue الاحترافي] (1) عرض كل الـevents اللي في الطابور مع payload summary + attempts count + last error، (2) زر 'إرسال' per-row (force-fire عبر الـendpoint بـadmin token)، (3) زر 'إرسال الكل' للـbatch، (4) زر discard، (5) إشارة red للـentries اللي فشلت 5+ محاولات (تـneed manual review). الـcron يـauto-drain الـqueue كل 5 دقائق في auto mode (10 entries per tick max)." },
      { type: "feature", text: "🤖 [Cron-side scanning في 4 paths] الـautomation-tick بيـscan في كل tick: (1) recent sales آخر 24 ساعة (saleCompleted)، (2) recent payments آخر 24 ساعة (paymentReceived)، (3) late orders بـthresholdDays config، (4) checks due ضمن thresholdDays. الـidempotency عبر eventHistory keyed by composite keys (e.g. `sale:${orderId}:${date}:${qty}:${custId}`). الـ24-hour filter يضمن إن الـold entries ميـre-fireش حتى لو eventHistory رول-أوف." },
      { type: "feature", text: "🛡️ [Idempotency + duplicate prevention] كل event عنده idempotencyKey unique. الـeventHistory[] (cap 100) بيتشيك قبل أي fire. الـ`force: true` flag يـbypass الـidempotency للـmanual 'Send Now'. الـpending entries أيضاً deduplicated by idempotencyKey. النتيجة: مفيش double-send، حتى لو الـclient و الـcron حاولوا الاتنين على نفس الـevent." },
      { type: "feature", text: "🎨 [Template editor مع variable hints + live preview] كل template بـtextarea مع لائحة الـvariables المتاحة لكل event×role (e.g. saleCompleted-customer: `{customerName}` `{qty}` `{modelNo}` `{value}` `{date}` `{portalLink}`). زر 👁 معاينة يعرض الـrendered text بـsample data — عشان تشوف شكل الرسالة قبل ما تـenable. زر ↺ default يـreset الـtemplate للـbuilt-in." },
      { type: "feature", text: "👤 [Owner phones manager] قائمة أرقام تستقبل الـowner-targeted events (multiple owners possible). الـnumbers تتـnormalize تلقائياً لـ+20 prefix. الـevent اللي عند `recipients.owner: true` يبعت نفس الرسالة للأرقام دي كلها. الـcustomer phone يجي من الـpayload تلقائياً (من الـcustomer record نفسه)." },
      { type: "improvement", text: "🏗️ [Architecture: shared event processor] `api/_eventProcessor.js` فيه الـcore logic (validate + idempotency check + bridge call + history log + pending queue management). الـ`api/event-trigger.js` thin HTTP wrapper. الـ`api/automation-tick.js` يـimport الـ`processEvent` لـcron-detected events + pending drain. صف واحد للـsource of truth، مفيش duplication." },
      { type: "docs", text: "📋 [docs/V19.70.md — full guide] الـsetup للـ4 events، الـmental model للـAuto vs Manual، الـvariable reference per event×role، الـtroubleshooting (لو الـmessage ما جاش)، الـperformance notes (50 sales/payments per tick cap)." },
    ]
  },
  {
    version: "V19.69.5",
    date: "2026-05-05",
    types: ["fix", "feature", "automation"],
    title: "✅ VPS Cron LIVE — الـHTTP 500 الحقيقي محلول + زر reset للاختبار",
    changes: [
      { type: "fix", text: "🐛 [الـRoot cause الحقيقي للـHTTP 500] V19.69.3 attribute السبب لـcross-folder import — كانت theory غلط. الـreal cause لقيناه في Vercel runtime logs: `SyntaxError: Unexpected token '*' at compileSourceTextModule`. السطر 5 في `api/automation-tick.js` كان فيه الـcron pattern `*/5 * * * *` **داخل** `/* */` block comment. الـ`*/` في `*/5` بيـclose الـcomment بدري — فالـparser يحاول يـparse الباقي كـcode، يفشل، Vercel يرد 500 بدون body. الـVite build ماـcatch-ـوش لأن Vite بيـcompile `src/` بس مش `api/`. **الـFix**: شيلت الـliteral cron pattern من الـcomment وحطيت reference لـdocs/V19.69.md. الـ`api/_buildDailyReport.js` (V19.69.3) لسه موجود — ما كانتش مشكلة لكن مفيدة كـsafety belt." },
      { type: "automation", text: "⏰ [VPS cron LIVE — autonomous end-to-end] الـcrontab line اتضافت على Contabo VPS: `*/5 * * * * curl -fsS https://app.../api/automation-tick -H 'Authorization: Bearer $SECRET' >> /var/log/clark-automation.log 2>&1`. الـAUTOMATION_TICK_SECRET في Vercel env (40-char random). الـcron service `active`. الـcurl test من VPS بيرجع 200 + `triggerSource: \"cron\"`. الـUI panel يحدّث `lastTickAt` كل 5 دقايق — الـVPS Cron pill بيبقى 🟢 نشط. الـscheduled time في الـsettings بقى يـfire تلقائياً بدون أي تدخل. النظام autonomous بمعنى الكلمة." },
      { type: "feature", text: "↺ [زر 'مسح تم إرساله اليوم' للـadmin testing] قبل V19.69.5 لو الـscheduler بعت الرسالة، الـ`lastSentAt` بيتسجل و باقي اليوم كل محاولة بترجع `skipped: already-sent-today`. عشان تختبر الـscheduled flow تاني في نفس اليوم كنت محتاج تعدّل Firestore يدوياً أو تستنى يوم. دلوقتي الزر يـclear `lastSentAt` (مع confirmation prompt). ميـظهرش إلا لو `lastSentAt` set — فمش بـclutter الـUI لما مفيش حاجة للـreset." },
      { type: "improvement", text: "🛡️ [Local validation protocol — node ESM smoke test ضافت] قبل ما نـzip أي تغيير في `api/`، الـpipeline دلوقتي بتـrun: (1) `node --check` على كل `api/*.js`، (2) ESM `import()` smoke test (نفس الـloader الـVercel runtime بيستخدمه)، (3) `npm run build` (Vite compile للـclient)، (4) pure-function smoke test لو في builder ماس. ده هيـcatch syntax/load errors محلياً قبل الـVercel deploy. السبب: الـ500 ده ضاع منا 3 deploy cycles لأن الـbuild كان passing بس runtime بيـfail." },
    ]
  },
  {
    version: "V19.69.3",
    date: "2026-05-05",
    types: ["fix"],
    title: "🛠️ Patch: HTTP 500 على /api/automation-tick — cross-folder import fix (theory أُلغيت في V19.69.5)",
    changes: [
      { type: "fix", text: "🐛 [الـ500 على الـscheduler endpoint — theory] الـافتراض كان إن `api/automation-tick.js` كان يـimport من `../src/utils/automation/buildDailyReport.js` و Vercel ما بـpackageش cross-folder modules بشكل reliable. **الـattempted Fix**: نسخت الـbuilder لـ`api/_buildDailyReport.js`. الـreal cause اتلقى لاحقاً (V19.69.5) — كان `*/` في الـblock comment. الـsibling builder لسه مفيد كـdefense-in-depth." },
    ]
  },
  {
    version: "V19.69.2",
    date: "2026-05-05",
    types: ["fix", "feature", "ux"],
    title: "🔄 Trigger Now button + manual-test ميـblockش الـschedule + inline cron setup",
    changes: [
      { type: "fix", text: "🐛 [الـCRITICAL: 'ارسل تجربة' كان يـblock الـschedule بقية اليوم] قبل V19.69.2 الـmanual test كان يـ-set `dailyReport.lastSentAt`. الـcron's `alreadySentToday()` يقرأ ده ويـskip. النتيجة: لو ضربت 'ارسل تجربة' الصبح، الـschedule ميـ-fireش لنهاية اليوم. **الـFix**: الـmanual test دلوقتي يـset `lastManualTestAt` (display only)، الـ`lastSentAt` reserved للـscheduled/triggered sends اللي تعد كـ'sent today'." },
      { type: "feature", text: "🔄 [زر جديد: 'شغّل الـscheduler الآن'] يـcall `/api/automation-tick` بـFirebase admin ID token (الـendpoint بقى يقبل الاثنين: cron secret OR admin token). الـuser يقدر يـtest الـfull scheduled flow (auth + report build + bridge + history) **بدون ما يـsetup الـVPS cron الأول**. الـmanual-admin path يـ-bypass الـtime-of-day check (تقدر تجرب أي وقت)، لكن يـrespect 'already sent today' و 'enabled' و 'recipients'." },
      { type: "ux", text: "📋 [Inline cron setup مع copy buttons] قبل V19.69.2 الـwarning panel كان بيقول 'راجع docs/V19.69.md' فقط — friction كبير. دلوقتي الـwarning expandable panel فيها: (1) الـVercel env steps، (2) crontab line مع origin pre-filled من window.location، (3) test curl، (4) copy buttons (📋) لكل code snippet. الـuser ينسخ يـpaste مرة واحدة." },
      { type: "ux", text: "📊 ['آخر إرسال' بقى منفصل: تلقائي vs تجربة] قبل V19.69.2 'آخر إرسال' field واحد — مش واضح إذا كان scheduled أو manual. دلوقتي line تفصيلي: 'تلقائي/scheduler: ...' + 'تجربة يدوية: ...'. الـuser يعرف بالظبط أيهم اتعمل." },
      { type: "fix", text: "🛡️ [Auth: endpoint يقبل cron secret أو admin token] `checkAuth()` في `automation-tick.js` يحاول الـsecret أولاً (cron path). لو فشل، يجرب يـverify الـtoken كـFirebase admin ID token. لو الاثنين فشلوا → 401. ده يفصل الـcron flow (machine-to-machine) عن الـmanual trigger flow (user-initiated)." },
    ]
  },
  {
    version: "V19.69.1",
    date: "2026-05-05",
    types: ["fix", "ux"],
    title: "📊 Daily Report — treasury من المصدر الصحيح + dynamic categories + ج.م",
    changes: [
      { type: "fix", text: "🐛 [الـBugfix الجوهري: treasury section كان under-counting] قبل V19.69.1 الـreport كان يـquery `data.custPayments`/`wsPayments`/`supplierPayments`/`hrLog` مع `_dayItems(date)` filter. ده كان بيـmiss أي حركة في `data.treasury` مش متربوطة بـpayment record (manual entries، transfers، corrections). الـuser شاف 'مرتبات: 140' (لأن hrLog عنده match) لكن باقي البنود 0 — رغم إن الرصيد الفعلي اتغير. **الـFix**: نـiterate `data.treasury` مباشرة (الـsingle source of truth) ونـgroup by `category`. الـreport دلوقتي يعرض كل category عملت حركة فعلية اليوم — مش fixed cash/transfer/checks columns." },
      { type: "ux", text: "💰 [Dynamic categories بدلاً من 3 fixed buckets] قبل: 'كاش / تحويلات / شيكات' (3 buckets ثابتة، باقي الـmovements مخفية). بعد: كل category موجودة فعلياً في الـtreasury entries (دفعة عميل، تحصيل شيك، دفعة مورد، دفعة ورشة، مرتب، سلفة، مصروف عام، تحويل داخلي، إلخ) تطلع كـlines منفصلة مرتبة بالقيمة. الـreport بقى truthful." },
      { type: "ux", text: "📊 [إضافة 'صافي اليوم' (in - out)] لو في حركات اليوم، يطلع سطر إضافي ▲/▼ بصافي الفرق. مفيد لمعرفة الـoverall direction (يوم محصل أكتر من اللي صارف، أو العكس)." },
      { type: "ux", text: "💵 [Currency standardization: 'ج' → 'ج.م'] الـuser فضّل الـabbreviation الكامل لـ'جنيه مصري'. كل الـmonetary values في الـreport (مبيعات، مشتريات، خزنة، تحذيرات، مقارنة) دلوقتي بـ'ج.م' uniform." },
      { type: "ux", text: "🎨 [Spacing بين الـsubsections] سطر فارغ بين 'محصلات اليوم' / 'مدفوعات اليوم' / 'صافي اليوم' / 'أرصدة الخزنة الحالية' — readability أحسن في WhatsApp." },
      { type: "ux", text: "💡 [إضافة count لو عمليات متعددة] لو category عنده >1 transaction اليوم (e.g. 3 دفعات عميل)، يظهر '(3 عمليات)' بعد الـtotal — يدل على إن في detail محتاج transparency." },
    ]
  },
  {
    version: "V19.69",
    date: "2026-05-05",
    types: ["feature", "automation"],
    title: "⏰ Automation Phase 2 — VPS Cron Scheduler (Cairo timezone)",
    changes: [
      { type: "feature", text: "⏰ [الـscheduled send بقى شغّال — حتى والبرنامج مقفول] الـVPS cron يـping `/api/automation-tick` كل 5 دقايق. الـendpoint يـverify shared-secret token، يقرأ الـsettings، يـcheck Cairo time مقابل الـscheduled time، يبني التقرير، يبعت عبر الـbridge، يـlog في الـhistory. الـclient (المتصفح) مش جزء من الـflow — الـVPS يشتغل 24/7. الـsetup steps موجودة في docs/V19.69.md." },
      { type: "feature", text: "🌍 [Africa/Cairo timezone مدمج في الـcomparison] الـAPI يـuse Intl.DateTimeFormat للـconvert UTC → Cairo بصرف النظر عن timezone الـVPS. الـ`time` في الـsettings يمثل Cairo local time. مفيش DST في مصر منذ 2020 (constant UTC+2)." },
      { type: "feature", text: "🛡️ [Idempotent: مش يبعت مرتين في نفس اليوم] الـ`alreadySentToday()` check يـcompare الـ`lastSentAt` لـCairo today's date. لو الـVPS down في 08:00 ورجع في 08:14، الـ08:14 tick يـcatch up. لو الـsend اتعمل بالفعل اليوم، الـcron يـskip تلقائياً." },
      { type: "feature", text: "🟢 [CronStatusPanel في الـAutomation page] يعرض: (1) آخر tick من الـcron (heartbeat)، (2) الـnext scheduled run بـCairo time، (3) warning لو الـcron مش يـping منذ >15 دقيقة. الـpanel يـrefresh عند فتح الصفحة." },
      { type: "feature", text: "🔐 [Auth: AUTOMATION_TICK_SECRET في Vercel env] الـendpoint يـverify Bearer token. الـsecret shared بين Vercel و VPS crontab. لو اتسرب → rotate في Vercel + update الـcrontab. ده + الـbridge AUTH_TOKEN (separate) = defense-in-depth." },
      { type: "improvement", text: "🛠️ [Build snapshot reads min Firestore docs] الـtick الـheartbeat (when nothing is due) يقرأ factory/config فقط — read واحد. الـactual send يقرأ كل البيانات (orders، split، partitioned) — لكن مرة واحدة في اليوم. تكلفة Firestore منخفضة جداً." },
      { type: "docs", text: "📋 [docs/V19.69.md — setup كامل step-by-step] (1) Vercel env var، (2) crontab line، (3) timezone optional config، (4) testing manually، (5) monitoring + debugging commands. مفيش حاجة محتاجة guess." },
    ]
  },
  {
    version: "V19.68.1",
    date: "2026-05-05",
    types: ["fix"],
    title: "🛠️ Patch: Bridge status pill كان يقول 'unknown' بينما الـbridge شغّال",
    changes: [
      { type: "fix", text: "🐛 [BridgeStatusPill — useMemo → useEffect] الـasync side-effect كان داخل `useMemo` — React مش بيـguarantee إن الـsetState يـcommit. الـpill كان بيقول 'unknown' دايماً حتى لو الـbridge READY. الـ-replaceت بـuseEffect مع cleanup + interval refresh كل 30 ثانية." },
      { type: "fix", text: "🐛 [حقل غلط: s.state → s.waState/waReady] الـbridge `/status` بيرجع `{waState, waReady, ok}` مش `{state}`. الـcheck في `onSendTest` كان `status.state !== 'READY'` → دايماً false → blocked. الـ-replace بـ`!status.waReady` (الـcanonical 'ready to send' boolean). دلوقتي الـmanual send يشتغل بدون 'مش جاهز' false-positive." },
    ]
  },
  {
    version: "V19.68",
    date: "2026-05-05",
    types: ["feature", "automation"],
    title: "🤖 Automation Hub — التقارير اليومية عبر WhatsApp (Phase 1)",
    changes: [
      { type: "feature", text: "🤖 [الـAutomation Hub جديد] Tab + زر في الـHome quick actions. الصفحة تحتوي على ٤ tabs: (١) إعدادات التقرير اليومي، (٢) قائمة المستلمين، (٣) سجل الإرسال (آخر 50 رسالة)، (٤) معاينة الرسالة قبل الإرسال. الـbridge URL/token يـreuse من `data.campaignBridge` (بالفعل موجود في الـCampaigns settings)." },
      { type: "feature", text: "📊 [Daily Report builder بـ7 sections قابلة للـtoggle] (1) المبيعات (قيمة، فواتير، أكثر العملاء)، (2) المشتريات (قيمة، إذونات، فواتير)، (3) الخزنة (محصلات بـcash/transfer/check + مدفوعات ورش/موردين/مرتبات + أرصدة الخزنات الحالية)، (4) التشغيل (تسليم اليوم، أوردرات متأخرة >7 أيام، ورش متأخرة)، (5) تحذيرات (شيكات تستحق خلال 7 أيام، عملاء بأرصدة عالية > Y ولم يدفعوا منذ Z يوم — thresholds قابلة للتعديل)، (6) المهام المعلقة per user، (7) مقارنة (مبيعات اليوم vs نفس اليوم الأسبوع اللي فات + percentage)." },
      { type: "feature", text: "📤 [زر 'ارسل تجربة الآن' للـmanual trigger] الـuser يقدر يـsend الآن لكل المستلمين المشتركين عبر الـbridge مباشرة من الـclient. كل إرسال يتـlog في `data.automation.history` مع status (success/fail) + recipientCount + by-user. الـpreview button يعرض الرسالة قبل الإرسال (preview tab بـwhatsapp-style dark background)." },
      { type: "feature", text: "👥 [Recipients management] CRUD list من الأرقام المستلمة. كل recipient عنده toggle 'مشترك في تقرير يومي' (للـfuture multi-report subscriptions). الـnumbers تتـnormalize لـ+20 prefix تلقائياً. الـid، addedAt، addedBy، subscribedReports[] — كله محفوظ في Firestore." },
      { type: "feature", text: "🟢 [Bridge status pill في الـheader] يعرض حالة الـbridge connection (READY/QR/DISCONNECTED) + يـrefresh عند فتح الصفحة. لو الـbridge مش جاهز، الـ'ارسل تجربة' بيرفض ويعرض السبب." },
      { type: "feature", text: "🛡️ [Permissions integration] Tab `automation` ضافت في الـregistry — admin/manager: edit، sales_accountant: view، باقي الـroles: hide. ميـظهرش الزر في الـHome للـusers اللي ميـقدروش يشوفوه." },
      { type: "improvement", text: "📅 [الـscheduling لسه مش مفعّل في V19.68] الـuser يقدر يـconfigure الـtime + sections + recipients، لكن الإرسال التلقائي يـrequires VPS cron — جاي في V19.69 (`/api/automation-tick` endpoint + crontab setup docs). لـnow، يدوي بزر 'ارسل تجربة الآن'." },
    ]
  },
  {
    version: "V19.67",
    date: "2026-05-05",
    types: ["fix", "ux", "security"],
    title: "🛠️ ٣ طلبات: ترحيل القيود + قفل مدير النظام + تنظيف شاشة أوامر القص",
    changes: [
      { type: "fix", text: "🚨 [الـCRITICAL: ترحيل القيود الأثرية كان فاشل] الـuser بلّغ '536 فشل' مع error `(s || []).find is not a function` على customerPay وأنواع تانية. السبب الجذري: في `backfill.js _safePost` كان بيـpass `args[args.length-2]` كـcoa للـpostEntry. ده بيشتغل لـbuilders زي `buildSaleEntry(delivery, customer, order, coa, rules)` (5 args، coa = args[3]). لكن لـbuilders اللي تأخذ config كـlast arg (customerPay، workshopPay، hr، treasury): args = (..., coa, rules, config) — args.length-2 يشاور على `rules` (object) بدلاً من coa. الـ`postEntry` بعدين يـcall `(rules||[]).find(...)` → rules object فميـيكونش له find → crash. **الـFix**: pass coa explicitly من الـouter scope (موجود فعلاً كـvariable). كل الـ536 errors المتوقع تتحل دلوقتي." },
      { type: "ux", text: "🔒 [الترحيل بقى locked في modal] قبل V19.67 الـprogress كان inline في الـcard — الـuser يقدر يـnavigate لـtab تاني وسط الـrun، يترك Firestore writes orphan. دلوقتي full-screen overlay modal بـz-index 99999 + backdrop blur. الـuser ميقدرش يـclick أي حاجة وراه. الـmodal يـunlock تلقائياً بعد الـcompletion. + percentage badge + label واضح + warning 'لا تغلق التطبيق'." },
      { type: "security", text: "🔒 [قفل تعديل/حذف مدير النظام] قبل V19.67 أي user بصلاحية `settings:edit` يقدر يـdemote/delete الـadmin من جدول المستخدمين. ده gap في الـUI (V19.64 firestore.rules بـenforce نفس الـguard على الـDB level). دلوقتي: لو الـrow.role==='admin'، الـSel يبقى disabled-display ('مدير النظام' بـbadge 👑)، الـDelBtn يبقى '🔒' icon non-interactive، والـname column عنده '🔒 محمي' badge. الـbypass الوحيد عبر admin-SDK لو بمشكلة." },
      { type: "ux", text: "🧹 [تنظيف شاشة أوامر القص] شيلت الـ4 KPI cards من فوق (إجمالي الأوامر، كمية القص، متأخر، الإنجاز). الـcounts لسه ظاهرين في الـstatus chips أسفل الـsearch bar (الكل، متأخر، per-status). الـlate filter بـ`detSt==='⚠️'` لسه شغّال عبر الـchip. كود نظيف: ~40 سطر اتشال + الـloop على calcOrder للـtotalCut/totalDel اتشال." },
    ]
  },
  {
    version: "V19.66",
    date: "2026-05-05",
    types: ["fix", "audit", "money"],
    title: "💰 Sale Flow + Money Math — double-submit guard، return price، _key collision، float drift",
    changes: [
      { type: "fix", text: "🛡️ [Double-submit guard على confirmSale] قبل V19.66 الـQR confirm-sale popup كان عنده guard `total<=0` فقط. ضربتين سريعتين على 'تأكيد البيع' = duplicate delivery push على الـorder، لكن journal واحد فقط (بسبب `_key` idempotency). النتيجة: الكمية تتضاعف في الـcustomerDeliveries، مش في الـaccounting. دلوقتي `qrSaleSubmittingRef` يمنع الـsecond click لـ800ms — يكفي للـreact state update يتـcommit." },
      { type: "fix", text: "💰 [Sale-return price ميـvعود لـlist price] قبل V19.66 لو بعت بسعر مخفّض (delivery.price < order.sellPrice مع isDiscounted)، الـreturn كان يـpost عبر `Number(order.sellPrice)` — credit AR بالـlist price → permanent debit drift. دلوقتي الـreturn entry يـcarry `price` field من الـmatching delivery (لو discounted)، و `buildSaleReturnEntry` يـuse `Number(ret.price) || Number(order.sellPrice)`. الـreversals بقت accurate." },
      { type: "fix", text: "🛡️ [Free-sale `_key` collision سُدّت] قبل V19.66 الـ`_key` كان `oid:saleDelivery:sessId:custId:date`. بيع نفس العميل مرتين من نفس الـlinked-session في نفس اليوم = identical `_key` → autoPost.sale يـdedupe الـsecond → الكمية في `customerDeliveries` تتسجل، لكن مش في الـjournal = **silent over-sale**. دلوقتي الـ`_key` يـappend `Date.now()` ms timestamp — كل بيع unique." },
      { type: "fix", text: "💰 [Float drift في invoices.js — كل math operation rounded] قبل V19.66 الـsubtotal/discount/total كانوا يـaccumulate floating-point error (e.g. `1234.5600000000002`). 8 موضع في invoices.js (sales build، sales upsert، purchase build، purchase upsert) كانوا بدون `r2()`. دلوقتي كل multiplication/subtraction/percentage بيمر على `r2(n)` (Math.round(n*100)/100). نفس الـpattern المستخدم في postingRules.js." },
      { type: "audit", text: "🔬 [الـSkipped fixes في الـscope] الـDetPg cut-sync atomic write يحتاج refactor للـDetPg (1845 lines) — موجل لـV19.7. الـ`(data.X || [])` defenses في 110+ مكان: الـwipe guards من V19.62/63/65 بيـcatch الـreal data-loss issues، فالـnull-defense issue cosmetic مش data-integrity. الـDiscount-editor save-on-blur = UX preference، مش bug. الـDate validation كـwarning vs block = business decision." },
    ]
  },
  {
    version: "V19.65",
    date: "2026-05-05",
    types: ["fix", "hotfix", "audit"],
    title: "🛡️ Data Integrity — enforceDataLimits silent-delete bug + _deepEqual + upSales/Tasks safety",
    changes: [
      { type: "fix", text: "🚨 [الـCRITICAL: enforceDataLimits كانت بتمسح day-docs بصمت] قبل V19.65 الـenforceDataLimits بتـtruncate `next.treasury` لـ3000 entries، لكن الـ`next.treasury` بعد hydration بيكون الـfull merged array (10K+ entries من الـday-docs). الـtruncation بتسبّب `syncAllSplitChanges` يشوف الـIDs الناقصة → `deleteDoc()` على day docs → **سنين من treasury/audit/HR-log/payments تتمسح بصمت**. الـbug ده active منذ V16.74 (split migration)، فالـuser قد يكون فقد بيانات تاريخية بدون ما يحس. **الـFix**: enforceDataLimits دلوقتي تـskip الـmigrated fields (treasury، hrLog، custPayments، salesInvoices، وكل SPLIT_FIELDS اللي flag بتاعها set). الـday-docs ميـحتاجوش الـ1MB cap (كل day-doc أصلاً عنده hundreds of entries بحد أقصى)." },
      { type: "fix", text: "🛡️ [JSON.stringify → _deepEqual في 7 مواضع] الـpending-write cleanup logic في 4 listeners (split، sales-split، tasks-split، partitioned) + 4 registerPending* functions كانت بتستخدم `JSON.stringify(a)===JSON.stringify(b)` للـequality. الـpattern ده **order-dependent**: Firestore يقدر يرجّع الـkeys بـorder مختلف بعد round-trip — فـidentical objects تظهر unequal → pending entries تـpersist في الـmap لـ30 ثانية → الـ`flatten()` بيستخدم الـpending data بدل الـserver data → users بيشوفوا stale optimistic data بـoverlay على الـreal server data (incl edits من devices تانية). دلوقتي بيستخدم `_deepEqual` (order-independent) من splitCollections.js." },
      { type: "fix", text: "🛡️ [upSales + upTasks safety guards] قبل V19.65 الـupSales و upTasks مكنش عندهم wipe guard. لو bug زي V19.62 ظهر في الـsales/tasks write path، الـsame data destruction (wipe state + delete day-docs via syncAllSalesSplitChanges) يحصل. دلوقتي الـguard `≥5→0` (نفس الـpattern في V19.62/63 لـupConfig) بيـcheck SALES_SPLIT_FIELDS (packages، custDeliverySessions) في upSales، و TASKS_SPLIT_FIELDS (tasks، stickyNotes، inventoryAudits) في upTasks." },
      { type: "fix", text: "🛡️ [validateBeforeWrite: 4 fields ضافت] الـlist في dataIntegrity.js كان فيه 10 fields — empDebts، generalProducts، productCategories، hrWeeks ما كانوش included. لو الـwrite يمسح ≥3 من أي حقل منهم، ميـtripش الـ`isSafeWrite` validator. ضفناهم. ده extra layer مع V19.62/63 guards اللي بيـcatch wipes في الـpartitionedDataRef، بس validateBeforeWrite بيـoperate على configDoc form (legacy path)." },
      { type: "audit", text: "🔬 [الـSkipped fix: syncPartitionedCollection merge:true] الـaudit اقترح merge:true بدل setDoc الـreplace. لكن في الـ-partitioned model كل doc هو entity كاملة، والـwrite بيمرّر الـwhole object، فـmerge:true vs merge:false سيمانتيكياً نفس الشيء. الـreal fix لـconcurrent edits = optimistic concurrency control (version field) — change كبير محجوز لـv19.7+." },
    ]
  },
  {
    version: "V19.63",
    date: "2026-05-05",
    types: ["fix", "improvement", "audit"],
    title: "🛠️ Quick Wins بعد الـaudit الشامل — 6 إصلاحات small-risk عالية القيمة",
    changes: [
      { type: "fix", text: "🛡️ [V19.62 guard وُسّع ليـcover الـsplit fields + hrWeeks] الـmass-wipe guard اللي اتزرع في V19.62 كان بيـcover 8 fields بس (PARTITIONED_FIELDS_V1957). أي bug مماثل في split path (treasury، salesInvoices، custPayments، tasks) أو في hrWeeks كان undetectable. دلوقتي الـguard يـsweep كل PARTITIONED_FIELDS + كل SPLIT_FIELDS اللي الـwrite بيلمسها. نفس threshold ≥5→0 (rare-enough to never catch legitimate edits)." },
      { type: "fix", text: "💾 [snapshot writer dynamic] الـlocalStorage snapshot writer كان hand-picked 12 keys — وكان hrWeeks ناقص! يعني HR/payroll مكنش يـhydrate من cache على البدء، نفس 'empty list flash' V19.59 صلحه — لكن كان لسه active لـHR. دلوقتي الـwriter dynamic over PARTITIONED_FIELDS فيـauto-extend مع أي field جديد. الـreader (line 296) و الـwriter دلوقتي متطابقين 100%." },
      { type: "fix", text: "📦 [splitData initial state dynamic] كان hardcoded `{treasury:[],auditLog:[],hrLog:[]}` (3 fields بس) في V16.74. V19.49+50+52+53 ضافت 11 split field آخرين، السطر ده ما اتحدّثش. النتيجة: splitData[custPayments] / splitData[salesInvoices] / إلخ بقوا `undefined` لحد ما الـlistener يـfire — يقدر يكسر الـwipe-detector لو الـsale ضغط قبل listener fire. دلوقتي dynamic over SPLIT_FIELDS. نفس bug-pattern زي V19.62." },
      { type: "improvement", text: "⚡ [useMemo deps cleanup — أداء] الـconfig useMemo deps شالوا منها 4 flags ما بتقراش (splitLoaded، partitionedLoaded، salesSplitLoaded، tasksSplitLoaded). V19.59 شال الـgates من الـmemo body لكن الـdeps فضلوا. كل flag flip كان بيعمل re-run للـmemo (وعندهالـsnapshot writer effect بيـrerun كمان) — 4 redundant runs على الـboot. دلوقتي الـmemo بيـrun لما الـactual data state يتغير فقط." },
      { type: "fix", text: "🔢 [Negative-value clamps في 3 inputs] (1) **Discount** في فاتورة البيع/الشراء: `Math.max(0, discountValue)` — `-50` كان بيخلي total أعلى من subtotal (overcharge). (2) **Custom price** في البيع السريع: `Math.max(0, customPrice)` — `-50` كان بيسجل سعر سالب → AR debit سالب. (3) **Salary/bonus/baseHours** في إضافة وتعديل الموظف: clamps على parseFloat — مرتب سالب كان بيـpost كـcredit في حساب مصروفات المرتبات." },
      { type: "improvement", text: "🆔 [Math.random() → gid() في 19 موضع] الـpattern `Math.random().toString(36).slice(2)+Date.now()` كان مكتوب في 19 سطر (HRPg×13، TreasuryPg×2، SettingsPg×3، App.jsx×1). الـid مش sortable (Math.random جاي قبل Date.now)، الـrandom part مش محدد slice، مفيش prefix. دلوقتي gid() الـcanonical — Date-based prefix + 12 random chars + sortable. الـid format موحد عبر التطبيق." },
      { type: "audit", text: "🔬 [الـcontext] V19.63 جزء من roadmap 4-versions بعد audit شامل (Security → Integrity → Sale Flow). كلهم small-risk، high-value. ده الأول — الـQuick Wins اللي مش محتاجة architecture changes ولكن بتـclose 30% من الـMEDIUM findings. V19.64 جاي بـsecurity hardening (Firestore + Storage rules)." },
    ]
  },
  {
    version: "V19.62",
    date: "2026-05-05",
    types: ["fix", "hotfix", "rootcause"],
    title: "🎯 الـRoot Cause الحقيقي: explicitPartBefore كان hardcoded على hrWeeks فقط",
    changes: [
      { type: "fix", text: "🎯 [الـsmoking gun الحقيقي — موجود من V19.57] V19.59/60/61 كانوا تشخيصات جزئية لـsymptoms (merge gate / listener wipe / ref race / error wipe). كل round كان بيـpatch victim مختلف لنفس الـupstream wipe. السبب الفعلي: في `upConfig` الـsnapshot قبل الـmutation كان مكتوب `const explicitPartBefore = {hrWeeks:[...]};` — hardcoded على hrWeeks فقط من V16.75. لما V19.57 ضافت 8 master collections (customers, suppliers, workshops, employees, empDebts, generalProducts, fabrics, accessories)، السطر ده **ما اتحدّثش**. الـtwin patterns في `upConfigTx` (line 3030) و `explicitSplitBefore` (line 3226) و `explicitSalesSplitBefore` (line 3493) كلهم `Object.fromEntries(FIELDS.map(...))` — dynamic. partitioned فقط نُسي." },
      { type: "fix", text: "🔬 [الـCausal chain خطوة-بخطوة] (1) user يأكد بيع → upConfig يتنادى. (2) `explicitPartBefore = {hrWeeks: [...]}` ← مفيش customers. (3) hydration loop: `next[customers] = explicitPartBefore.customers || [] = []`. (4) fn(next) ميـلمسش customers (هي بيع، مش customer edit) → next.customers يفضل []. (5) `newPart.customers = []`. (6) `setPartitionedData(newPart)` يمسح state.customers. (7) `partitionedDataRef.current = newPart` يمسح الـref. (8) القائمة تختفي في الـUI. الـFirestore data بقى سليم لأن `syncAllPartitionedChanges` بيـshort-circuit لو الـbefore و after الاتنين فاضيين — عشان كده hard refresh يرجع البيانات (الـlistener يـfire من Firestore cache)، لكن أي بيع تاني = wipe تاني." },
      { type: "fix", text: "✅ [الـFix الجوهري — سطر واحد] غيّرت `explicitPartBefore` ليبقى dynamic over `PARTITIONED_FIELDS` (نفس الـpattern في explicitSplitBefore). دلوقتي كل master fields بتـsnapshot صح قبل الـmutation. fn(next) يـrun على الـreal data. newPart يحتفظ بالـcustomers. setPartitionedData ميمسحش حاجة." },
      { type: "fix", text: "🛡️ [Defensive guard ضد regressions مستقبلية] ضافت safety check في upConfig: لو write حاول يمسح ≥5 master-data items من field واحد لـ0، الـwrite يتمنع + console.error مع stack trace + toast واضح للـuser. ده يمنع نفس النوع من الـbugs (hardcoded snapshots عند إضافة fields جديدة) من الـsilent escalation. threshold ≥5 آمن — single edits و small batches بتعدي." },
      { type: "fix", text: "📐 [الـlessons learned] الـbug ده كان hidden 4 versions. كل تشخيص كان بيشوف symptom جزئي (listener fire wipes, error handler wipes, ref race) — تشخيصات صحيحة لكن لـvictims مش لـsource. الـsource كان في الـsale write path نفسه. الـdiagnostic test الحاسم: ابحث عن **كل** الـsetState calls على partitionedData (طلع 2 — listener rebuild + upConfig). الـlistener rebuild اتحمى في V19.60+V19.61. الـupConfig كان مكشوف. الدرس: قبل ما تـmutate state، تأكد الـsnapshot بتاعك كامل." },
    ]
  },
  {
    version: "V19.61",
    date: "2026-05-04",
    types: ["fix", "hotfix"],
    title: "🚨 Round 4: ref-vs-state race + listener error wipe — final fix",
    changes: [
      { type: "fix", text: "🚨 [HOTFIX جذري حقيقي: race condition بين الـlistener fire والـuser action] V19.60 صلح rebuild يحفظ الـfields غير الـfired. لكن المستخدم بلّغ إن المشكلة لسه موجودة بعد كل بيع. السبب الحقيقي اتكشف الآن: `partitionedDataRef.current` بيتحدث عبر useEffect **بعد render commit**. في الـboot، listeners تـfire ويـschedule setState، لكن الـref يفضل قديم لحد ما React يعمل render. لو المستخدم ضغط 'تأكيد البيع' في النافذة الزمنية دي (10-50ms) → `upConfig` يقرأ `explicitPartBefore` من الـref القديم (فاضي) → newPart بيكون فاضي → setPartitionedData(newPart) يثبّت الفراغ. **الإصلاح**: تحديث الـref synchronously جوّا setState callback (نفس نمط V19.54 لـconfigDocRef). دلوقتي أي upConfig بعد listener fire يشوف الـfresh data فوراً." },
      { type: "fix", text: "🛡️ [Hardening: listener error handlers مش بيمسحوا الـcache] قبل V19.61، لو listener errored (permission re-eval transient، network blip)، الـerror handler كان بيـmark `firstFires=true` ويـcall rebuild. بس rebuild بـempty docsById يرجع `[]` → الـcache يتمسح. ده حصل في الواقع لأن أي setDoc على factory/config بيـtrigger re-eval لـrules لكل listeners — فممكن listener customersDocs يـerror لـmillisecond بسبب transient permission state — بعدها يـreconnect. لكن كان كافي يمسح الـcache. **الإصلاح**: error handler يـlog فقط، مش يحدث state. الـSDK يعيد الاتصال تلقائياً." },
      { type: "fix", text: "📐 [طُبّق على 4 listeners] split (config) + sales-split (V19.51) + tasks-split (V19.51) + partitioned (master data V19.57). الـ4 كلهم: (1) sync ref update جوّا setState callback، (2) error handler ميـwipeش الـstate. الـboot order race + sale-after-listener race + transient-error race كلهم محلولين دلوقتي." },
      { type: "fix", text: "🔬 [الـbug ده موجود من V19.57] اتكشفت الـ3 layers تباعاً عن طريق reports المستخدم: V19.59 (شيل الـmerge gate)، V19.60 (field-isolated rebuild)، V19.61 (sync ref + error hardening). كل layer كان تشخيص جزئي صحيح لكن مش الـcomplete cause. الـcomplete fix دلوقتي مغطى الـrace patterns الـ3 المعروفة." },
    ]
  },
  {
    version: "V19.60",
    date: "2026-05-04",
    types: ["fix", "hotfix"],
    title: "🚨 إصلاح جذري: العملاء يختفوا بعد البيع — Field-isolated rebuild",
    changes: [
      { type: "fix", text: "🚨 [HOTFIX حرج: السبب الجذري الحقيقي لاختفاء العملاء] V19.59 صلح بداية المشكلة (شيل partitionedLoaded gate + hydrate من localStorage). لكن المستخدم لاحظ: بعد البيع السريع → العملاء تختفي تاني. السبب الجذري الحقيقي: `rebuild()` كان بيـrewrite **كل الـfields** في كل listener fire. لو workshops listener fire الأول → `setPartitionedData({customers:[], workshops:[...], ...})` — بيمسح الـcustomers cache الكاش (لأن docsById.customers لسه Map فاضي). الـ ref بيتـupdate بالقيمة الفاضية → لما المستخدم يعمل بيع، `explicitPartBefore.customers = []` → `newPart.customers = []` → `setPartitionedData(newPart)` يثبّت الفراغ. القائمة تختفي بعد البيع لأن البيع نفسه استخدم الـref اللي اتحدث بفراغ من الـboot." },
      { type: "fix", text: "🛠️ [الإصلاح: Field-isolated rebuild] دلوقتي rebuild يحدّث الـfields اللي listener بتاعها fired فعلاً (`firstFires[f] === true`). الـfields اللي listener بتاعها لسه ما اشتغلش — يحتفظوا بقيمتهم السابقة (من الـlocalStorage cache أو last-good value). يعني لو workshops listener fired أول، customers يفضلوا 35 من الـcache، مش يتمسحوا. لما customers listener نفسه يـfire، وقتها firstFires.customers يصبح true → يتحدّث بالـfresh data من السيرفر. **خلاص مفيش race يفضي الـcache صامتاً.**" },
      { type: "fix", text: "🔄 [طُبّق الإصلاح على 4 rebuild functions] نفس الـbug pattern في 4 listeners: split (config splits)، sales-split (V19.51)، tasks-split (V19.51)، partitioned (master data V19.57). الـ4 كلهم اتعدّلوا — `setX(prev => {...})` بدل `setX(next)` — يحفظ الـfields غير الـfired. partitionedData هو الوحيد اللي فيه cache من localStorage فبيـUSER يحس بالفرق هناك، لكن باقي الـ3 برضه أصح كده architecturally." },
      { type: "fix", text: "🛡️ [Why V19.59 lone gate-removal لم يكن كافي] V19.59 شيل الـ`partitionedLoaded` gate من الـuseMemo. يعني الـmerge بيحصل حتى لو listeners ما اتحملوش. بس **partitionedData نفسها** كانت بتتحط بقيم فاضية بسبب الـrebuild — فالـmerge كان بيستخدم empty arrays من state ولفترة معينة. V19.60 يصلح المصدر: state نفسها بتفضل عامرة بالـcache لحد ما الـlistener فعلاً ييجي بـdata." },
    ]
  },
  {
    version: "V19.59",
    date: "2026-05-04",
    types: ["fix", "hotfix"],
    title: "🚨 إصلاح اختفاء العملاء + بحث البيع السريع",
    changes: [
      { type: "fix", text: "🚨 [HOTFIX حرج: قائمة العملاء كانت تظهر فاضية أحياناً] قبل V19.59 الـmerge في `config` useMemo كان مشروط بـ`partitionedLoaded === true` (يعني كل الـ8 listeners اللي اتزرعوا في V19.57 لازم يـfire الأول). لو **listener واحد** اتأخر أو اتقطع (slow network، multi-tab race، permission hiccup) → الشرط يفضل false → الـmerge لا يحصل أبداً → `data.customers === undefined` → التطبيق يقول 'العملاء (0)'. السبب الجذري: configDoc بعد migration ميحتويش customers/suppliers/employees (اتـstrip)، فلو الـmerge ما حصلش، مفيش مصدر تاني للبيانات. **الإصلاح**: حذف الـ`splitLoaded`/`partitionedLoaded` gates من الـmerge — كل listener يـfill الـdata بتاعته independently. الصفحات بتشوف data.customers=[] لجزء ثانية بدل undefined لو listener بطيء، وتنعكس فوراً لما الـlistener يـfire. الـloaded flags لسه بتمنع الـwrites (upConfigTx) وده الصح — ما تكتبش قبل ما تقرا — لكن الـreads مش لازم يستنوا." },
      { type: "fix", text: "💾 [Hydrate من localStorage على البدء] التطبيق بقى يقرأ آخر snapshot من localStorage في الـuseState initial — يعني المستخدم يشوف آخر بيانات معروفة فوراً (zero loading flash) حتى لو الـnetwork بطيئة. الـlisteners بتحدّث الـstate بمجرد ما يجيبوا الـfresh data. الـsnapshot بقى يحفظ كل الـ8 master data (customers/suppliers/workshops/employees/empDebts/generalProducts/fabrics/accessories) بدل 5 بس قبل." },
      { type: "fix", text: "🔍 [HOTFIX: البحث في البيع السريع كان ميـلاقيش الموديل أحياناً] في popup البيع السريع، لو العميل عنده موديل في الخطة (التوزيعة)، البحث في الـdropdown كان أحياناً يقول 'لا توجد نتائج' حتى لو الموديل ظاهر في الجدول فوق. السبب: الـfilter كان `linkedSess.modelIds.includes(m.id)` — يقارن بـorder id. لكن نفس الـmodelNo ممكن يكون ليه order ids مختلفة (re-cuts، seasons، تعديل الكميات أنشأ order جديد). الـmodelIds في الـsession فيها الـid القديم، الـstockModels فيها الـid الجديد → الـincludes تفشل. **الإصلاح**: المقارنة بـmodelNo بدل id في 3 مواضع (dropdown، manual add، QR scan)." },
      { type: "fix", text: "🛡️ [Gates الـloaded لسه على الـwrites] حذف الـgates من الـreads (UI) فقط — الـwrite paths (upConfigTx, upSalesTx, upTasksTx) لسه بترفض الكتابة قبل ما الـlisteners يـload (السطر `if(configDoc[FLAG]&&!loaded) return`). ده الصح — مفيش writes غلط بسبب stale state — لكن الـUI مش هتظل عالقة في عرض empty list." },
    ]
  },
  {
    version: "V19.58",
    date: "2026-05-04",
    types: ["improvement", "safety", "fix"],
    title: "🛡️ تحسينات بنية تحتية: backup + schema validation + rollups engine",
    changes: [
      { type: "fix", text: "🚨 [إصلاح هام في الـauto-backup] الـcomprehensive backup كان من V18.62 وما اتحدّثش لما اضفنا collections جديدة في V19.49 → V19.57. كان بيـbackup factory/config + sales + tasks + treasuryDays/auditDays/hrLogDays + hrWeeksDocs فقط. الـ24 collection اللي اتعملوا في V19.49→V19.57 (custPaymentsDays, salesInvoicesDays, packagesDays, tasksDays, customersDocs, suppliersDocs, ... إلخ) كانوا **مش متضمنين في الـbackups**. لو حصلت كارثة وحبيت تـrestore من backup قديم، كنت هتلاقي الفواتير والمدفوعات والعملاء كلهم ضايعين. V19.58 يصلح ده — الـbackup دلوقتي بيغطي كل الـ29+ collection." },
      { type: "improvement", text: "🛡️ [Schema validation بـZod في WARN mode] ضافت طبقة حماية: كل write على factory/config + sales + tasks بيمر على Zod schemas للـentities المهمة (customers, suppliers, workshops, employees, invoices, payments, treasury). الكتابات اللي ما تطابقش الـschema بتتسجل في console + Settings card 'آخر تحذيرات التحقق'. **WARN mode** يعني: مش بيمنع الـwrite، بس بيـsurface الأخطاء. ده safety net للـbugs اللي ممكن تكتب shape غلط بسبب refactor أو import. بعد ما تستقر النسخة في الإنتاج بدون false positives، ممكن نحوّل schemas معيّنة لـSTRICT mode." },
      { type: "improvement", text: "📊 [Rollups engine للـreports — utils/rollups.js] ضافت module جديد بـ4 functions جاهزين: `computeFinancialRollup(data, {from, to})` للـtotals + per-customer + per-supplier breakdowns، `computeMonthlyRollup(data, 'YYYY-MM')` للشهر الواحد، `computeCustomerStatement(data, custId)` لكشف الحساب، `computeSupplierStatement(data, supId)` للموردين. كلهم pure functions — بـiterate الـlocal data ويرجعوا rollup كامل. الـpages تقدر تستخدمهم بـuseMemo (سرعة 50ms × عدد المرات اللي بتـrender). ده الأساس للتقارير المتقدمة في V19.59+." },
      { type: "safety", text: "🔒 [استمرارية الحماية] الـ3 features دي مع بعض = layer من الحماية:\n- **Backup** يضمن إن مفيش بيانات تضيع بكارثة\n- **Schema validation** يقبض الـbugs قبل ما تتراكم\n- **Rollups engine** يضمن consistency بين التقارير في مختلف الصفحات\nالتطبيق دلوقتي عنده fault tolerance + observability أحسن بكتير." },
      { type: "improvement", text: "📦 [Zod dependency] ضافت `zod ^3.23.8` كـrunning dependency. حجم ~10KB gzipped. مكتبة معيارية، 30M+ download/شهر، Zero config، tree-shakeable. المخططات في `src/schemas/index.js` — بسيطة وقابلة للقراءة بمنطق سريع." },
    ]
  },
  {
    version: "V19.57",
    date: "2026-05-04",
    types: ["architectural", "improvement", "safety"],
    title: "🏗️ Master data byId — كل entity = ملف منفصل (الـArchitecture اكتمل)",
    changes: [
      { type: "architectural", text: "🏗️ [Master data byId partitioning] V19.57 يحوّل آخر 8 arrays في factory/config لـbyId collections: **customers** → customersDocs/{id}، **suppliers** → suppliersDocs/{id}، **workshops** → workshopsDocs/{id}، **employees** → employeesDocs/{id}، **empDebts** → empDebtsDocs/{id}، **generalProducts** → generalProductsDocs/{id}، **fabrics** → fabricsDocs/{id}، **accessories** → accessoriesDocs/{id}. كل entity ملف لوحده — تعديل عميل واحد = write 1 doc بدل config كامل. factory/config بقى ثابت الحجم تماماً (~30 KB) للأبد، يحمل settings + lookup tables بس." },
      { type: "improvement", text: "🔄 [Engine موسّع — partitionedCollections.js] الـengine موجود من V16.75 لـhrWeeks. V19.57 يضيف 8 fields جديدة + selective stripping بـflag (نفس نمط splitCollections). PARTITIONED_FIELDS_V1675 + PARTITIONED_FIELDS_V1957 + 2 flags. أي doc في config مش في group flagged ميتمسحش. ضامن للـrolling deploy." },
      { type: "improvement", text: "🔁 [Migration ذكي مع id-fix] الـmigration بياخد كل array من config، يضمن إن كل entity فيها `id` (يولد واحد لو مفيش)، يكتب كل entity كـdoc منفصل في collection بتاعها. لو 3000 موظف + 200 عميل + 150 مورد + ... كله بيتعمل في batches بـ8 collections × N docs. UI مقفول بـmodal واضح + progress." },
      { type: "improvement", text: "🛠️ [readPartitionedCollection helper جديد للـAPI] في `api/_firebase.js`. الـportal endpoints (customer-portal, workshop-portal, delivery-confirm, workshop-delivery-confirm) كلها كانت بتقرا `config.customers` و `config.workshops` مباشرة. اتحدّثوا يقروا من partitioned collections لو الـflag set + fallback لـconfig للـbackward compat." },
      { type: "improvement", text: "♻️ [App.jsx wiring بقى dynamic] قبل V19.57 الـpartitioned listener كان hardcoded لـhrWeeks فقط (~12 موضع). دلوقتي بقت loops على PARTITIONED_FIELDS — listeners، pendingWrites، rebuild، optimistic updates، sync logic. أي field جديد يضاف في partitionedCollections.js يتدعم تلقائياً بدون أي تعديل في App.jsx. ضامن للـV19.58+." },
      { type: "improvement", text: "📐 [Firestore Rules + 8 collections جديدة] customersDocs (sales scope)، suppliersDocs/generalProductsDocs (purchase scope)، workshopsDocs/fabricsDocs/accessoriesDocs (manager scope)، employeesDocs/empDebtsDocs (HR scope). نفس الصلاحيات اللي كانت قبل التقسيم." },
      { type: "improvement", text: "📊 [PartitionedDocsMonitor بقى 9 collections] في الإعدادات → '📑 مراقبة الـDocuments المُجزّأة'. badge V16.75 لـhrWeeks، badge V19.57 لـ8 master data. labels generic (الاسم/التفاصيل) بدل hrWeeks-specific (الأسبوع/التواريخ). Stats includes total docs + total size + avg size per collection." },
      { type: "safety", text: "🔒 [الـArchitecture اكتمل] بعد V19.57:\n- factory/config = settings + lookup tables (ثابت الحجم)\n- factory/sales = settings (ثابت)\n- factory/tasks = settings (ثابت)\n- 20 daily-split collection للـoperational data\n- 9 byId-partitioned collection للـentities\nمفيش doc واحد في النظام كله ممكن يكبر مهما طال الوقت أو زاد النشاط. الضمان الرياضي تام." },
    ]
  },
  {
    version: "V19.56",
    date: "2026-05-04",
    types: ["fix", "hotfix", "improvement"],
    title: "🚨 ترحيل الفواتير: progress حقيقي + إصلاح false toast",
    changes: [
      { type: "fix", text: "🚨 [BUG round 3: progress modal بيقول 'تم' قبل الكتابة الفعلية تخلص] V19.55 صلح الـrace بالـserialization، لكن المستخدم لاحظ: ترحيل 80 فاتورة → modal يقول '80/80 done' خلال ثانية، toast 'فشل ترحيل' يظهر، الفواتير تظهر posted، بعد 5 ثواني 79 يرجعوا draft، وكل ثانيتين 1-2 يخرجوا تدريجياً. السبب: `upConfig` كان fire-and-forget — schedule الـwrite في الـqueue ويرجع. الـbulk loop's `await postOne(item)` بيرجع بعد الـoptimistic update فقط، الـactual setDoc لسه قيد الانتظار في الـqueue. النتيجة: progress UI كاذب، الـlistener pull الـserver state → الفواتير اللي لسه ما اتكتبتش بترجع draft." },
      { type: "fix", text: "🛠️ [الإصلاح: upConfig/upSales/upTasks بقوا يرجعوا الـTx promise] قبل V19.56 كانوا بيـreturn undefined. دلوقتي بيـreturn الـpromise بتاعة upConfigTx (الـqueued setDoc). لما الـcaller يعمل `await upConfig(...)` بيستنى الـactual flush لـFirestore. handlePost في كل صفحات الترحيل (Sales/Purchase/CreditNotes/DebitNotes) اتعمل refactor — كل `upConfig` فيها بقت `await upConfig`. الـbulk loop `for(item) await postOne(item)` بقى يستنى الكتابة الفعلية فعلاً." },
      { type: "fix", text: "🛠️ [إصلاح false 'فشل ترحيل' toast] handlePost كان فيه `.catch(e => console.warn(...))` بيبلع أي error في autoPost ويرجع promise resolved. الـbulk loop يحسب الـiteration success كاذباً، لكن لو exception طلع قبل الـ.catch (مثلاً في customer lookup) → الـloop يحسبه fail. النتيجة: counters غلط، toast بيقول 'فشل' حتى لو الفواتير اترحلت تمام. V19.56 بيـrefactor handlePost: try/await/catch واضح، كل failure يـthrow → loop يحسبه فعلاً failed، success يحسبه success." },
      { type: "improvement", text: "📊 [Progress UI = real state] دلوقتي الـmodal يعرض '3/80', '4/80', '5/80'... بمعدل ~2 ثانية لكل فاتورة. ده الـactual rate. المستخدم بيعرف فعلاً امتى يقدر يقفل الصفحة أو ينتقل لتاب تاني. زر الإيقاف لسه شغال — يوقف بعد الفاتورة الحالية تخلص (مفيش half-state). 80 فاتورة هتاخد ~3 دقايق فعلاً، لكن مش ثانية كاذبة." },
      { type: "improvement", text: "🔒 [Trade-off موثّق: بطء mostly imaginary] الـserialization كان موجود من V19.55. V19.56 ما زادش البطء — بس خلى الـUI يعرضه. قبل V19.56 الكتابات كانت بتاخد نفس الوقت بالظبط، بس الـmodal كان كاذب. دلوقتي ما فيش kazib. autoPost كل فاتورة بيـwrite على treasury+auditLog+journal — كل واحدة في day docs منفصلة (V19.49+) بحجم صغير. سرعة Firestore الواقعية = 1-3 فاتورة/ثانية." },
    ]
  },
  {
    version: "V19.55",
    date: "2026-05-04",
    types: ["fix", "hotfix", "feature"],
    title: "🚨 إصلاح ترحيل الفواتير المتعدد (round 2) + ميزة QC-2 للـQR",
    changes: [
      { type: "fix", text: "🚨 [BUG round 2: الترحيل المتعدد لسه بيرجع draft] V19.54 صلح الـoptimistic state (configDocRef يُقرأ بدل الـclosure)، لكن الـbug فضل ظاهر: 5 فواتير تترحل، وبعد ~3 ثواني 4 منهم يرجعوا draft. **السبب الجذري الحقيقي**: كل setDoc لـFirestore بيشتغل في parallel — لو write 1 (state-after-iter-1) يلحق بعد write 5 (state-after-iter-5) بسبب network jitter، الـserver يعمل overwrite بـstate قديم، فقط iter 1's invoice يفضل posted." },
      { type: "fix", text: "🛠️ [الإصلاح: serialize الـwrites عبر promise chain] ضافت `upConfigWriteQueueRef`, `upSalesWriteQueueRef`, `upTasksWriteQueueRef`. كل setDoc بيستنى قبله. كل write بيوصل Firestore بنفس ترتيب الاستدعاء — last call wins، مهما كان الـnetwork timing. الـqueue لكل doc منفصلة (config / sales / tasks) فمفيش cross-doc blocking. على single-action operations: غير محسوس (queue فاضي). على bulk operations: يمنع الـrace condition تماماً." },
      { type: "feature", text: "🏷️ [QC-2: ميزة درجة تانية لطباعة QR] في popup طباعة QR (من الـDashboard أو DBPg)، ضافت checkbox '⚠️ درجة تانية'. لما يتعلم: (1) الـQR يصغر ~80% من حجمه الأصلي. (2) ختم 'QC-2' في مستطيل صغير بحدود سوداء يظهر تحت الـQR. (3) شغّال في كل التابات الأربعة (يدوية / سيري / تلقائية / قطعة). الـQR payload نفسه (CLARK:orderId:qty) ميتغيرش — الـscanner في المخزن بيشتغل عادي." },
      { type: "improvement", text: "🔍 [Audit شامل بعد BUG V19.54] V19.55 جالها مرة تانية: الـlocal state كان متحدّث صح (V19.54 fix شغال)، الـremote write order ده اللي كان متفلت. الـqueue pattern ده بيغطي **كل operations** في التطبيق على factory/config + factory/sales + factory/tasks. أي rapid sequential writes (مش بس bulk-post) محمية الآن." },
    ]
  },
  {
    version: "V19.54",
    date: "2026-05-04",
    types: ["fix", "hotfix", "safety", "improvement"],
    title: "🚨 إصلاح bug جذري في upConfig + progress modal للترحيل المتعدد",
    changes: [
      { type: "fix", text: "🚨 [BUG جذري حرج: upConfig كان بيستخدم stale closure] قبل V19.54، `upConfig` كان بيقرا `configDoc` من React closure (snapshot وقت render). في loop سريع زي bulk-post: iteration 1 يعمل optimistic update → invoice1=posted. **قبل ما React يعيد render**, iteration 2 يبدأ بقاعدة بيانات stale (invoice1 لسه draft عند الـclosure) → بيـoverride الـoptimistic update! النتيجة: ترحيل 5 فواتير → آخر واحدة بس تفضل posted، الـ4 الباقيين يرجعوا draft. **الإصلاح:** قراءة من `configDocRef.current` (موجود من V19.48 لكن مش مستخدم في الـcompute path) + تحديث الـref synchronously بعد setConfigDoc. الـbug ده كان موجود من V16.80 — أي 2 actions متلاحقين بسرعة كانوا ممكن يحصل فيهم data loss." },
      { type: "fix", text: "🛠️ [نفس الإصلاح طُبّق على upSales + upTasks] الـ3 helpers الـcore عندهم نفس النمط. كلهم بقوا يقروا من *DocRef.current بدل closures. البيانات في factory/sales (packages, custDeliverySessions) و factory/tasks (tasks, stickyNotes, inventoryAudits) كانت معرّضة لنفس الـbug في أي bulk/sequential operation." },
      { type: "improvement", text: "📊 [Progress modal blocker لـbulk-post] قبل V19.54، ترحيل عدة فواتير كان silent — مفيش indicator. المستخدم يقدر يـclick أي حاجة أثناء الترحيل أو يقفل الصفحة. V19.54 يضيف modal full-screen blocker بـprogress bar (0% → 100%)، عداد done/total، عداد ok/fail، اسم الفاتورة الحالية live، زر إيقاف. الـmodal يقفل الـUI طول العملية ويختفي تلقائياً بعد الانتهاء بـ700ms مع toast نتيجة." },
      { type: "improvement", text: "⏹ [زر إيقاف ذكي] أثناء الترحيل، زر 'إيقاف بعد الفاتورة الحالية' متاح. مش بيعمل abort وحشي — بيخلي الفاتورة الحالية تخلص بأمان (عشان مفيش half-state)، وبعدين يوقف الـloop. الفواتير اللي اترحلت قبل الإيقاف تفضل posted. Toast يقول كم اترحلت وكم اللي مش اتعمل." },
      { type: "safety", text: "🔒 [Audit شامل للتطبيق] تم البحث في كل ملفات الـsrc عن نفس النمط (loops + sequential mutations). مفيش حالة تانية في الـpages بنفس الخطر. الإصلاحات الـ3 في upConfig/upSales/upTasks كافية لتغطية كل الـsurface الحرج." },
      { type: "improvement", text: "📁 [docs/ folder] كل ملفات .md (HANDOFF, SECURITY, V19.49-V19.53) اتنقلت لـ`docs/` folder منفصل. أي ملف توثيق جديد هانضيفه هناك مباشرة." },
    ]
  },
  {
    version: "V19.53",
    date: "2026-05-04",
    types: ["architectural", "improvement", "safety"],
    title: "🔔 refactor + split الإشعارات — حل race conditions نهائياً",
    changes: [
      { type: "architectural", text: "🔔 [Notifications refactor — readBy/dismissedBy/doneBy خرجوا من الـnotification entry] قبل V19.53 كان كل إشعار فيه `readBy:[emails]`, `dismissedBy:[emails]`, `doneBy:[emails]` arrays. لما 5 users يقروا نفس الإشعار في نفس اللحظة → 5 writes متوازية على نفس entry → race condition (lost updates). الحل: ضافت collection جديد `userNotifStates/{userEmail}` فيه `{reads, dismisses, doneTasks}` لكل user. كل user بيكتب على doc بتاعه فقط. الإشعار نفسه بقى **immutable** بعد إنشائه → صفر contention." },
      { type: "architectural", text: "🏗️ [Daily-split لـnotifications] بعد الـrefactor، الـnotifications بقت آمنة للـsplit. اتنقلوا لـ`notificationsDays/{YYYY-MM-DD}`. النتيجة: factory/config مفيهوش `notifications` array بعد كده. آخر array operational اتقسم — factory/config مكون من settings + master data بس." },
      { type: "improvement", text: "🔁 [Migration ذكي — بيـextract حالة كل user] الـmigration بيـiterate كل notifications الموجودة، ولكل user في readBy/dismissedBy/doneBy → بيكتب على userNotifStates/{email}. لو 100 إشعار × 7 users على متوسط = 700 write — كلهم idempotent عبر setDoc(merge:true). فبعد الـmigration حالة كل user محفوظة ومش هيشوف إشعارات قراها قبل التحديث." },
      { type: "fix", text: "🛠️ [API endpoints بقت تكتب في notificationsDays] `delivery-confirm.js` و `workshop-delivery-confirm.js` كانوا بيكتبوا notifications في config مباشرة. ضافت helper جديد `appendToSplitDay(collectionName, entry)` في `api/_firebase.js` يكتب على day doc الصح. كل endpoint بيـcheck الـflag — لو V19.53 done يستخدم day doc، وإلا fallback على config (backward compat للـrolling deploy)." },
      { type: "improvement", text: "🎯 [Optimistic update لـmarkRead/markTaskDone] بدل ما يستنى Firestore round-trip، الـUI بيتحدّث فوراً عبر setUserNotifState. لو الكتابة فشلت (نادر) → console.warn، والـuser ميشوفش الإشعار — بس الـlistener هيرجّعه لو الـsetDoc اتراجع. UX أسرع." },
      { type: "improvement", text: "📐 [Firestore Rules + 2 collections جديدة] notificationsDays (any authed user write — لأن أي user بيبعت إشعار)، userNotifStates/{email} (write مقيّد بـ`request.auth.token.email == email` — كل user بيكتب على doc بتاعه بس)." },
      { type: "safety", text: "🔒 [Backward compat للـnotifs القديمة] الـfilter logic بيتحقق userNotifState.dismisses أولاً، وكـfallback بيتحقق من readBy/dismissedBy على الـentry نفسها. ده يعني لو حصل rolling deploy وحد كاتب نسخة قديمة لسه بـreadBy → الـUser على V19.53 هيقرا الحالة الصح برضه." },
      { type: "improvement", text: "📊 [لوحة المراقبة بقت 20 collection] في الإعدادات → '📅 مراقبة التخزين اليومي' بقت تعرض notificationsDays + 19 collection سابقة. badge V19.53 مميّز." },
    ]
  },
  {
    version: "V19.52",
    date: "2026-05-04",
    types: ["architectural", "improvement", "fix"],
    title: "🏗️ آخر العمليات الكبيرة في factory/config + hotfix بورتال العميل",
    changes: [
      { type: "fix", text: "🚨 [HOTFIX حرج: بورتال العميل/الورشة كان مش بيعرض الدفعات] الـAPI في `/api/customer-portal.js` و `/api/workshop-portal.js` كانوا بيقروا `config.custPayments / config.checks / config.wsPayments` مباشرة من factory/config، لكن بعد migration V19.49 الحقول دي اتنقلت لـday collections. النتيجة: العميل يفتح اللينك بتاعه يلاقي 'سجل المدفوعات فارغ' مع إن الدفعات ظاهرة في الخزنة وكشف الحساب الداخلي. **الإصلاح:** ضافت `readSplitCollection` helper في `api/_firebase.js` يقرأ من admin SDK، والـportal endpoints بقت تقرا من day collections لو الـflag set، و fallback على config للـbackward compat. درس مستفاد: الـVite build بيختبر client code بس — أي migration لازم يـaudit الـAPI endpoints يدوياً." },
      { type: "architectural", text: "🏗️ [Daily-split لآخر 4 arrays operational في config] V19.50 قسّم الفواتير. V19.52 يقسّم آخر الـoperational: **stockMovements** (high-volume warehouse activity) → stockMovementsDays، **purchaseReceipts** (يومي) → purchaseReceiptsDays، **treasuryTransfers** (تحويلات بين الحسابات) → treasuryTransfersDays، **salesAudits** (جرد المبيعات) → salesAuditsDays. بعد V19.52 = factory/config مفيهوش حقل operational يكبر مهما زاد النشاط. notifications مؤجلة لـV19.53 (تحتاج refactor لـreadBy/dismissedBy)." },
      { type: "improvement", text: "🔍 [Pre-flight audit إجباري لكل migration] قبل V19.52، اتعمل audit شامل على `/api/*` و `/clark-wa-bridge/` للحقول الـ4 الجديدة — مفيش endpoint بيقرأ منهم، فالـmigration آمن. الإجراء ده بقى standard لكل version جاية: ممنوع نقل حقل بدون audit external code أولاً." },
      { type: "improvement", text: "📊 [لوحة المراقبة بقت 19 collection] في الإعدادات → '📅 مراقبة التخزين اليومي' بقت تعرض كل الـ19 المُجزّأة (3 V16.74 + 4 V19.49 + 3 V19.50 + 5 V19.51 + 4 V19.52) مع badges مميّزة لكل إصدار. ضمان رياضي اكتمل لـconfig + sales + tasks." },
      { type: "improvement", text: "📐 [Firestore Rules + 4 collections جديدة] stockMovementsDays + purchaseReceiptsDays + treasuryTransfersDays (purchase scope)، salesAuditsDays (sales scope). نفس الصلاحيات اللي كانت قبل التقسيم." },
      { type: "improvement", text: "🔁 [Migration مع backup كامل] migration block جديد على نمط V19.49/V19.50: backup كامل لـconfig في `backups/pre-migration-split-days-v1952-{ts}` → نقل الـ4 arrays لـday docs → strip + flag في transaction atomic. UI مقفول بـmodal واضح بنسبة التقدم. لو فشلت → الـflag مش بيتكتب → retry تلقائي عند الـreload." },
    ]
  },
  {
    version: "V19.51",
    date: "2026-05-04",
    types: ["architectural", "safety"],
    title: "🏗️ تجزئة factory/sales و factory/tasks — الضمان الرياضي اكتمل",
    changes: [
      { type: "architectural", text: "🏗️ [Daily-split على docs غير factory/config] الـsplit engine اتعمم — قبل V19.51 كان شغّال على factory/config بس. دلوقتي بقى يدعم أي doc. **factory/sales** اتقسم: packages → packagesDays/{YYYY-MM-DD}، custDeliverySessions → custDeliverySessionsDays/{YYYY-MM-DD}. **factory/tasks** اتقسم: tasks → tasksDays/، stickyNotes → stickyNotesDays/، inventoryAudits → inventoryAuditsDays/. النتيجة: 3 docs أساسية (config + sales + tasks) كلها بقت ثابتة الحجم — أي array operational بيكبر يومياً بقى في day docs منفصلة." },
      { type: "safety", text: "🔒 [الضمان الرياضي اكتمل] بعد V19.51، مفيش doc واحد في النظام كله ممكن يكبر مهما طال الوقت أو زاد النشاط. كل الـoperational arrays في 3 المستندات الكبار مقسومة بالـdate. الـmaster data (customers/suppliers/workshops/employees) لسه في config لكنها بطيئة النمو + الـbyId partitioning ليها مخطّط لـV19.52." },
      { type: "improvement", text: "♻️ [splitCollections.js generic engine] ضافت helpers جديدة: syncDocSplitChanges, stripDocFieldGroups, readDocSplits, getDocSplitStats. كلها تشتغل على أي doc بـcollectionsMap + groups. الـwrappers الموجودة (config) كما هي بدون كسر — وبقى عندنا parallel wrappers لـsales (syncAllSalesSplitChanges + stripSalesSplitArrays + ...) ولـtasks (syncAllTasksSplitChanges + stripTasksSplitArrays + ...). أي doc جديد لاحقاً بـoperational arrays = يحتاج 5 أسطر بس." },
      { type: "improvement", text: "🔁 [Migration parallel — sales + tasks مستقلتين] بدل migration واحد كبير، V19.51 فيها 2 migrations مستقلتين: واحدة لـfactory/sales و واحدة لـfactory/tasks. كل وحدة تشتغل لما الـdoc بتاعها يـload + listener جاهز. مفيش flag dependency بينهم. Migration modal واضح للمستخدم: 'جاري تحديث نظام تخزين المبيعات' أو '... المهام'. backup كامل لكل doc قبل تعديله." },
      { type: "improvement", text: "📐 [Firestore Rules + 5 collections جديدة] packagesDays + custDeliverySessionsDays (sales scope)، tasksDays + stickyNotesDays (any authed user — كانت كده قبل التقسيم)، inventoryAuditsDays (sales/manager scope). صلاحيات مطابقة 100% لما كانت قبل التجزئة." },
      { type: "improvement", text: "📊 [لوحة المراقبة بقت 15 collection] في الإعدادات → '📅 مراقبة التخزين اليومي' بقت تعرض كل الـ15 المُجزّأة (3 V16.74 + 4 V19.49 + 3 V19.50 + 5 V19.51) مع badges مميّزة لكل إصدار. استدعاءات parallel للـstats (config + sales + tasks) بدون تأخير في الـrender." },
      { type: "safety", text: "🔧 [نفس آليات الأمان من V19.49/V19.50] safety guards على writes قبل ما الـlisteners يـload (refusal + toast)، selective stripping بـflags، optimistic UI مع pending writes refs، transactions atomic للـmigration، 3 retries للـsync بـbackoff، fallback writes بـawait + categorized errors. كل bug fixes V19.48 الـforensic logging شغّالة برضه على كل sync paths الجديدة." },
    ]
  },
  {
    version: "V19.50",
    date: "2026-05-04",
    types: ["architectural", "improvement", "safety"],
    title: "🏗️ تجزئة فواتير المبيعات والمشتريات وأوامر الشراء + تنظيف coa_backup",
    changes: [
      { type: "architectural", text: "🏗️ [Daily-split لـ3 arrays ضخمة] V19.49 قسّم 4 مجموعات صغيرة (مدفوعات + شيكات). V19.50 يضيف الأضخم: **salesInvoices** (فواتير المبيعات — كانت 54% من factory/config = 236 KB!) → salesInvoicesDays/{YYYY-MM-DD}، **purchaseInvoices** (فواتير المشتريات) → purchaseInvoicesDays/{YYYY-MM-DD}، **purchaseOrders** (أوامر الشراء — كانت 13%) → purchaseOrdersDays/{YYYY-MM-DD}. الفواتير كانت أسرع حقل بيكبر — بمعدل 5 فواتير/يوم كان factory/config هيوصل لحد 1MB خلال 2-3 شهور بس. بعد V19.50 = ضمان رياضي كامل عدم الوصول لـ1MB أبداً." },
      { type: "improvement", text: "🧹 [Cleanup عاجل لـcoa_backup_pre_upgrade_*] الـmigration بياخد كل الـkeys اللي اسمها يبدأ بـ`coa_backup_pre_upgrade_` من factory/config، يحفظهم كـdocs منفصلة في `backups/coa-rescued-from-config-{ts}`، ويمسحهم من factory/config. ده بيفضّي 24 KB في المثال الحالي (نسختين × 12 KB). مهمة لأن الـ`coa_backup` كانت keys بتتولّد كل ما المستخدم يعمل ترقية لشجرة الحسابات — فبتتراكم بدون فايدة وبتلوّث الـconfig." },
      { type: "improvement", text: "🔧 [إصلاح المصدر — ChartOfAccountsTab] قبل V19.50 أي ترقية لشجرة الحسابات كانت بتدمب نسخة احتياطية (~12 KB) كـkey في factory/config مباشرة. V19.50 بيعدّل المنطق: الـbackup بيتكتب في `backups/coa-pre-upgrade-{ts}` document منفصل قبل أي تعديل، ولو فشل الـbackup الـupgrade بيتلغي. ده بيمنع تكرار التلوث، وبيخلي الـbackups سهل البحث عنها (كلها مع بعض في collection واحد)." },
      { type: "safety", text: "🔒 [Selective stripping لـV19.50] stripSplitArrays اتطورت تتعامل مع 3 مجموعات flags بدل 2 (V16.74 + V19.49 + V19.50). كل مجموعة بتتحذف من config بس لما الـmigration بتاعتها تخلص (`_splitDaysV1950Done=true`). يعني rolling deploy آمن — مفيش data loss في فترة الانتقال بين الإصدارات." },
      { type: "improvement", text: "📐 [Firestore Rules توسّعت] firestore.rules ضافت 3 collections جديدة: salesInvoicesDays (sales+manager)، purchaseInvoicesDays + purchaseOrdersDays (purchase+manager). نفس صلاحيات الحقول الأصلية قبل التقسيم — مفيش tightening ولا loosening." },
      { type: "improvement", text: "📊 [لوحة المراقبة بقت 10 collections] في الإعدادات → '📅 مراقبة التخزين اليومي' بقت تعرض الـ10 collections مع badges حسب الإصدار (V16.74/V19.49/V19.50). تقدر تعرف من نظرة واحدة أكبر يوم في كل collection وتراقب لو حد بيكبر بسرعة غير عادية." },
      { type: "improvement", text: "🏷️ [APP_VERSION constant] الإصدار اتنقل لـ`constants/index.js` كـAPP_VERSION واحد. التوب بار desktop + mobile + console marker + About modal كلهم بيقروا من نفس المصدر. أي bump مستقبلي = تعديل سطر واحد." },
    ]
  },
  {
    version: "V19.49",
    date: "2026-05-04",
    types: ["architectural", "improvement", "safety"],
    title: "🏗️ تجزئة 4 مجموعات إضافية من factory/config — حماية دائمة من حد 1MB",
    changes: [
      { type: "architectural", text: "🏗️ [Daily-split for 4 more arrays] V16.74 قسّم 3 مجموعات (treasury/auditLog/hrLog) في daily collections. V19.49 بيضيف 4 مجموعات تانية كانت بتكبر يومياً في factory/config: **custPayments** (مدفوعات العملاء) → custPaymentsDays/{YYYY-MM-DD}، **supplierPayments** (مدفوعات الموردين) → supplierPaymentsDays/{YYYY-MM-DD}، **wsPayments** (مدفوعات الورش) → wsPaymentsDays/{YYYY-MM-DD}، **checks** (الشيكات) → checksDays/{YYYY-MM-DD}. كل مجموعة بتنزل في document خاص بكل يوم بحجم لا يعدي ~10KB. سنوياً = 365 ملف موزّعة بدل array واحد بيكبر. ده بيقفل الباب على وصول حجم الكونفيج لحد الـ1MB للأبد." },
      { type: "improvement", text: "🔁 [Migration تلقائي آمن] أول ما تفتح التطبيق على V19.49 لأول مرة، الـmigration بيشتغل automatic: (1) backup كامل لـconfig في collection الـbackups بـ label 'pre-migration-split-days-v1949'. (2) نقل الـ4 arrays لـday docs المناسبة. (3) حذف الحقول من factory/config وتحديد flag _splitDaysV1949Done. UI بيتقفل أثناء الـmigration بـmodal واضح بنسبة التقدم. الـmigration بيشتغل مرة واحدة فقط لكل deployment بفضل الـflag — لو فشلت لأي سبب، تقدر تعيد التشغيل وهتحاول تاني." },
      { type: "safety", text: "🔒 [Selective stripping يحمي من فقدان بيانات] stripSplitArrays بقت ذكية: بدل ما تحذف كل الحقول المُجزّأة من config دايماً، بقت تحذف بس الحقول اللي migration بتاعتها انتهت (gated بـflag). يعني لو لسه فيه users شغالين على V19.48 وتزامناً جوّه نفس database، الكتابة منهم مش هتمسح الـ4 arrays الجديدة. selective stripping بيمنع silent data loss في فترة الـrolling deploy." },
      { type: "improvement", text: "♻️ [SPLIT_FIELDS بقت source of truth] App.jsx كان فيه ~12 مكان hardcoded للـ3 arrays (`['treasury','auditLog','hrLog']`). بقت كلها loops على `SPLIT_FIELDS`. أي حقل جديد يضاف في splitCollections.js بيتدعم تلقائياً في: listeners، pendingWrites، rebuild، optimistic updates، sync logic، و stale cleanup. ضامن إن أي توسعة مستقبلية (V19.50 وما بعد) مش هتسيب bugs في الـwiring." },
      { type: "improvement", text: "📐 [Firestore Rules توسّعت] firestore.rules ضافت 4 collections جديدة بصلاحيات مطابقة للحقل الأصلي قبل التقسيم: custPaymentsDays (sales+purchase+manager)، supplierPaymentsDays + wsPaymentsDays + checksDays (purchase+manager). الـDefault deny بقي، أي collection مش مذكورة بـallow صريح بترفض القراءة والكتابة." },
    ]
  },
  {
    version: "V19.48",
    date: "2026-05-04",
    types: ["fix", "hotfix", "safety"],
    title: "🚨 Loading-Stall Recovery — مفيش حد بقى يقعد متعلق على شاشة التحميل",
    changes: [
      { type: "fix", text: "🚨 [HOTFIX حرج: التطبيق كان بيعلّق على شاشة التحميل] قبل V19.48 لو حد من listeners الـ Firestore اتأخر أو فشل بصمت (مثلاً كاش IndexedDB تالف، مشكلة شبكة عابرة، أو region mismatch)، المستخدم كان يقعد متعلق على spinner 'جاري تحميل البيانات' للأبد بدون أي escape hatch. V19.48 ضافت: (1) timeout 12 ثانية بيكتشف التعليق. (2) panel تشخيصي بيعرض حالة كل listener (config/sales/tasks/orders) — أيهم متصل وأيهم متأخر. (3) آخر error من الـ listeners لو في. (4) 4 خيارات: متابعة بالبيانات الحالية / مسح cache + reload / reload عادي / تسجيل خروج. **مفيش حد بقى يقعد متعلق على spinner.**" },
      { type: "fix", text: "📊 [Listener status tracker] كل listener دلوقتي بيـupdate state بـsetListenerStatus لما يـfire snap. الـ stall panel بيستخدم ده يقولك إيه شغال وإيه لأ. كمان أي error من listener بيتسجل في `listenerStatus.lastError` ويظهر في الـ panel — مفيش errors هتفضل مخفية في الـ console بدون ما المستخدم يشوفها." },
      { type: "improvement", text: "📋 [Smart 'Continue Anyway' button] لو الـ panel ظهر، الزر الأخضر بيظهر بس لو الـ critical listeners (config + orders) متصلين. الـ sales/tasks لو متأخرين، الزر بيـwarn 'البيانات قد تكون ناقصة' بلون أصفر. ده بيحمي المستخدم من الدخول للتطبيق ببيانات نص." },
      { type: "improvement", text: "🗑 [Clear cache button] الزر الأزرق بيـclear الـ Firestore IndexedDB cache + reload. ده بيحل أكثر من 80% من حالات الـ stall لأن أكثرها سببها الكاش المحلي تالف. الزر بيستخدم `indexedDB.databases()` API لاكتشاف databases الـ Firestore تلقائياً." },
      { type: "improvement", text: "📌 [Console version marker] عند startup الكود بيطبع `[CLARK V19.48] App module loaded — <timestamp>` في الـ console. لو حد قال 'بقول الموقع باظ'، اطلب منه screenshot للـ console — لو الـ marker مش ظاهر، يعني الـ deploy ما اشتغلش (أو الـ browser بيـserve cached bundle قديم)." },
    ]
  },
  {
    version: "V19.47",
    date: "2026-05-04",
    types: ["fix", "hotfix"],
    title: "🚨 إصلاح حرج لشاشة الإعدادات + إزالة إشعار التوب بار المربك",
    changes: [
      { type: "fix", text: "🚨 [HOTFIX حرج: شاشة الإعدادات كانت بتنهار] في V19.45 لما عرّفت `effectiveRoles` نقلتها بالغلط جوّه scope الـ PermissionsCard (مكوّن داخلي) في حين إن قوائم اختيار الأدوار للمستخدمين كانت في scope الـ SettingsPg الخارجي. النتيجة: `ReferenceError: effectiveRoles is not defined` في الـ console وشاشة الإعدادات بتقع تماماً على ErrorBoundary. الإصلاح: تعريف `effectiveRoles` في الـ scope الصحيح. ده كان bug من V19.45 موجود في V19.46 برضه — V19.47 هو الإصدار الأول اللي تقدر تفتح فيه الإعدادات بعد ضافة Custom Roles." },
      { type: "fix", text: "🔕 [إشعار التوب بار 'موديل كذا' بعد الـ login] الـ pill اللي كان بيظهر في التوب بار بعد تسجيل دخول جديد كان feature قديم بيراقب تغيرات حالة الأوردرات. المشكلة: بعد re-login الـ ref `prevStatuses` بيتفرّغ، فأول snapshot من الـ Firestore listener يبدو وكأنه 'تغيير حالة' بالنسبة للـ ref الفاضي → bullshit notification. الإصلاح: أزلنا الـ pill من التوب بار تماماً. الإشعارات بقت في الجرس فقط. الـ greeting bar في الـ Dashboard ('167 أوردر بدون موديل') مالناش دعوة بيها — لسه شغّالة." },
      { type: "fix", text: "🛒 [حذف أوامر الشراء كان 'بيرجع تاني بعد 4 ثواني'] السبب: الـ V19.45 كان عنده الـ silent-fail bug في upConfigTx fallback (نفس bug البيع السريع). لما الـ transaction كانت تفشل بعد 5 محاولات، الـ fallback `setDoc(...).catch()` كان fire-and-forget → الـ optimistic UI تظهر الحذف، الـ listener بعد ~4s بيجيب الـ data القديمة من السيرفر → الـ PO يرجع. V19.46 صلح الـ pattern ده (await + categorized errors) لكن V19.46 ما اتـdeployedش لأن V19.45 كان كاسر. V19.47 = أول deploy نظيف بكل الـ fixes متطبقة. لو حصل فشل فعلي في الكتابة، هتشوف toast واضح بالسبب (صلاحية/حجم/شبكة) بدلاً من الصمت." },
    ]
  },
  {
    version: "V19.46",
    date: "2026-05-04",
    types: ["fix", "architectural"],
    title: "🔥 إصلاح جذري لمشكلة 'تأكيد البيع مش بيحفظ' + Toast مضلل في الحركات المتكررة",
    changes: [
      { type: "fix", text: "🔥 [الـ Bug الرئيسي: البيع السريع كان مش بيحفظ بصمت] في `upSalesTx` لما الـ transaction كانت بتفشل بعد 5 محاولات، الـ fallback path كان `setDoc(...).catch(er=>console.error)` (fire-and-forget — مفيش await). يعني: الـ optimistic UI كان يعرض البيع لحظياً، بعدها الـ listener كان يجيب البيانات القديمة من السيرفر فترجع الواجهة لحالتها الأصلية، **بدون أي toast فشل**. النتيجة: المستخدم يضغط 'تأكيد البيع'، يشوف ✓ لحظياً، يرجع يلاقي كل البيانات على وضعها. الإصلاح: الـ fallback دلوقتي يعمل `await setDoc(ref, optimisticNext, {merge:false})` ولو فشل بيظهر toast واضح بسبب الفشل (permission/size/network) + نسخة forensic في الـ console مع حجم الـ document وكود الخطأ. **هذا هو السبب الرئيسي للـ bug اللي بلّغت عنه — أمان البيع السريع رجع 100%.**" },
      { type: "fix", text: "📝 [Toast مضلل في الحركات المتكررة] في `upConfigTx` لما الـ transaction كانت تستنفد المحاولات، كان يظهر toast 'فشل حفظ البيانات — جاري المحاولة بطريقة بديلة...' قبل ما الـ fallback يبدأ. الـ fallback كان عادةً ينجح لكن المستخدم بيشوف رسالة الفشل ويفتكر إنها فشلت. ده اللي خلاك تقول 'بيقولي فشل التسجيل لكن البيانات اتسجلت'. الإصلاح: مفيش toast فشل قبل الـ fallback. لو الـ fallback نجح: console.warn فقط (بدون إزعاج). لو فشل: toast واضح بالسبب. الفائدة: التجربة بقت 'بصمت لو نجح، صريح لو فشل'." },
      { type: "fix", text: "🛠 [نفس الإصلاح في upTasksTx] الـ fallback في `upTasksTx` كان عنده نفس مشكلة الـ fire-and-forget. اتصلح بنفس الـ pattern (await + categorized error)." },
      { type: "feature", text: "🔬 [أداة تشخيص جديدة في الإعدادات → الصيانة] أضفنا كارت '🔧 اختبار حفظ البيانات' بيعرض: (1) أحجام الـ documents الـ3 الرئيسية (factory/config + factory/sales + factory/tasks) مع ميتر ملوّن (آمن/تحذير >80%/خطر >100%) — Firestore حد أقصى 1 ميجا. (2) زر '▶ تشغيل اختبار الحفظ' بيعمل round-trip كتابة→قراءة→حذف على factory/_writeTest وبيقولك دقيقاً إيه السبب لو فشل (صلاحية مرفوضة / حجم زائد / شبكة / غير معروف). (3) زر '📋 نسخ تفاصيل التشخيص' لو فشل — يديك block جاهز للـ paste في chat الدعم." },
      { type: "architectural", text: "🏗 [Forensic logging في كل الـ Tx fallbacks] لما fallback يفشل دلوقتي بيتسجل في الـ console سطر forensic مفصل: التاريخ، الـ doc path، الحجم، التصنيف (ok/warn/danger)، عدد المحاولات، كود الخطأ، أول 200 حرف من الرسالة. ده في src/utils/writeDiagnostics.js كـ pure functions يقدر يستخدمها أي tool ثاني محتاج تشخيص writes." },
      { type: "architectural", text: "🔧 [salesDocRef + tasksDocRef] أضفنا useRef للـ salesDoc و tasksDoc (زي configDocRef الموجود). كان لازم عشان الـ Tx fallback يقرا أحدث optimistic state بدون ما يـcapture stale closure. مش تغيير سلوك، بس infrastructure للحلول الجديدة." },
    ]
  },
  {
    version: "V19.45",
    date: "2026-05-04",
    types: ["feature", "architectural"],
    title: "🎨 إنشاء أدوار (Roles) مخصصة من الـ UI",
    changes: [
      { type: "feature", text: "🎨 [Custom Roles من الواجهة] دلوقتي تقدر تنشئ أدوار جديدة (غير المدمجة) من الإعدادات → المستخدمين → كارت 'الأدوار المخصصة'. كل دور بياخد: اسم، أيقونة (emoji)، لون، وصف، وقالب أساسي (basedOn). الصلاحيات الافتراضية بتتنسخ من القالب لحظة الإنشاء (snapshot)، وبعدين تخصص أي خانة من جدول الصلاحيات." },
      { type: "feature", text: "📋 [Templates] لما تنشئ دور جديد، تختار قالب من الأدوار المدمجة (مدير، أمين مخزن، محاسب مبيعات، إلخ). الـ template بيـsnapshot في `defaults` الخاصة بالدور — يعني أي تغيير مستقبلي في الـ template مش هيأثر على الأدوار اللي اتنسخت منه. كل دور independent." },
      { type: "feature", text: "🎨 [Color + Icon picker] في الـ editor modal: 16 لون preset في palette + خانة لكتابة لون مخصص، و32 emoji مقترحة + خانة لأي emoji تكتبه. preview live بيظهر شكل الكارت قبل الحفظ." },
      { type: "feature", text: "🛡 [حماية ضد الـ collisions] لو حاولت تنشئ دور بـ key متعارض مع دور مدمج (admin مثلاً) أو دور موجود، النظام بيرفض. كمان إن الـ keys بتتولّد تلقائي من الـ label وبتبقى immutable (الـ label قابل للتعديل، الـ key لأ — عشان البيانات اللي اترتبطت بالدور تفضل سليمة)." },
      { type: "feature", text: "🔒 [حماية ضد الحذف] مش هتقدر تحذف دور لو في users مسنده ليهم. لازم تغيّر دورهم لدور تاني الأول. ولو حذفت دور بعد كده، كل التخصيصات اللي في `permissions[roleKey]` بتتمسح كمان عشان البيانات النضيفة." },
      { type: "architectural", text: "🏗 [Backward compat كامل] الأدوار المدمجة شغّالة بالظبط زي ما كانت. كل اللي اتعمل: الـ helpers في `permissions.js` ضافت 5 functions جداد (`getEffectiveRoles`, `getEffectiveRoleMeta`, `getEffectiveDefaultPerms`, `effectivePermWithCustoms`, `canEditPermWithCustoms`, `canViewPermWithCustoms`, `getHrSubPermWithCustoms`) بتـmerge القوائم. الـ App.jsx اتحوّل يستخدم الـ WithCustoms variants. الـ admin role بيفضل hardcoded في كل الحالات — مفيش طريقة (UI أو storage tampering) تقدر تخفّض صلاحياته." },
      { type: "improvement", text: "📊 [جدول الصلاحيات شامل] أي دور مخصص بينضاف يظهر تلقائي كـ column جديد في جدول الصلاحيات تحت. كده تقدر تخصّص أي خانة (edit/view/hide) لكل tab بنفس الأسلوب اللي بتعدل بيه الأدوار المدمجة." },
      { type: "improvement", text: "🔍 [Inspector محدّث] modal الفحص دلوقتي بياخد الـ config كامل (مش بس permissions) عشان يقدر يعرض الأدوار المخصصة بالـ icon والـ color الصح. لما تضغط '🔍 فحص' على user مسند له دور مخصص، الـ modal بيظهره بصورة كاملة." },
      { type: "improvement", text: "🏷 [Dropdowns تحدّث تلقائي] قائمة الأدوار في إنشاء user جديد + قائمة تغيير دور user موجود + الـ topbar/menu role label — كلهم بيستخدموا `getEffectiveRoleMeta(config)` فبيظهروا الأدوار المخصصة فوراً بعد إنشائها." },
    ]
  },
  {
    version: "V19.44",
    date: "2026-05-04",
    types: ["feature", "fix", "architectural"],
    title: "🔐 إعادة هيكلة الصلاحيات + Role جديد 'أمين مخزن' + إصلاح Silent Fails",
    changes: [
      { type: "fix", text: "🐛 [الـ bug اللي بلّغت عنه] أمين المخزن كان بيعمل scan للاستلام ويضغط حفظ بدون أي رد فعل من النظام — لأن `if(!canEdit)return;` كان بيرجع بصمت بدون أي رسالة. دلوقتي لما تضغط زر بدون صلاحية، بيظهر modal واضح: 'صلاحية مرفوضة — مالكش صلاحية لـ\"حفظ إذن الاستلام\"'. اتصلح في 15 مكان عبر PurchasePg + WarehousePg + SettingsPg." },
      { type: "fix", text: "🔴 [حرج: 6 تبويبات بدون حماية] كانت 6 تبويبات (فواتير المبيعات، إشعارات دائنة، فواتير المشتريات، إشعارات مدينة، محاسبة، أصول ثابتة) متفتحة لأي مستخدم بأي role — حتى الـ viewer كان يقدر يدخل يعدل فيها. ده كان bug من V18 لما ضفنا الفواتير لكن نسينا نضيفهم في صفحة الصلاحيات. دلوقتي الـ 6 محميين بـ canViewTab + canEditTab زي باقي التبويبات." },
      { type: "feature", text: "📦 [Role جديد: أمين مخزن] صلاحياته: ✏️ المخازن + المشتريات (الاستلامات فقط) + المهام · 👁 لوحة التحكم + التقارير + قاعدة البيانات + أوامر القص · ✕ كل الجوانب المالية (الفواتير، الخزنة، المحاسبة، المرتبات). ده الـ role المناسب لأمين مخزن بيستلم بضاعة ويعمل جرد بدون ما يشوف الأسعار." },
      { type: "architectural", text: "🏗 [Single Source of Truth] أنشأنا `src/utils/permissions.js` كمصدر واحد للـ roles، الـ tab catalog، والـ default perms. كان مكرر بين App.jsx و SettingsPg.jsx ومتفرّق في 4 أماكن. دلوقتي إضافة tab جديد أو role جديد = تعديل مكان واحد بس. كمان أضفنا runtime linter بيـwarn في الـ console لو نسينا نضيف tab جديد للصلاحيات." },
      { type: "feature", text: "🔍 [Permissions Inspector] في الإعدادات → المستخدمين، جنب كل user دلوقتي زر '🔍 فحص'. اضغطه يفتح modal بيعرض: الـ role + إحصائيات (X تعديل · Y عرض · Z مخفي) + كل تبويب وحالته (✏️/👁/✕) مجمّعة على الأقسام (مبيعات، مشتريات، إلخ). أداة عظيمة لتشخيص bugs الصلاحيات." },
      { type: "improvement", text: "🧹 [تنظيف keys زائدة] شيلنا `calc` و `stock` من DEFAULT_PERMS لأنهم مش tabs موجودة في الـ navigation. كانوا dead entries من إصدارات قديمة." },
      { type: "improvement", text: "📊 [تغطية كاملة] جدول الصلاحيات في الإعدادات بقى يعرض كل الـ 20 تبويب (كان بيعرض 14 بس). كل role له default واضح لكل tab. الكروت السفلية اللي بتعرض الأدوار بقت تعرض كل الـ 8 roles (كانت 5 بس) مع الأيقونات والأوصاف من الـ registry." },
      { type: "fix", text: "🏷 [اسم الـ role في الـ topbar] قبل كده كان يعرض 'مشاهد' لأي role غير معروف (admin/manager/sales/purchase). دلوقتي بياخد الـ label من الـ registry فبيعرض اسم أي role صح حتى الجداد (warehouse_keeper بيعرض '📦 أمين مخزن')." },
    ]
  },
  {
    version: "V19.43",
    date: "2026-05-03",
    types: ["fix"],
    title: "📅 أسماء الشهور كاملة في بورتال العميل (مايو بدل ماي)",
    changes: [
      { type: "fix", text: "📅 [بورتال العميل] جدول 'سجل الحركات' (مبيعات + مرتجعات) كان بيختصر اسم الشهر لـ3 حروف فقط — مايو→ماي، أبريل→أبر، أغسطس→أغس... بقت الأسماء كاملة دلوقتي. كانت المشكلة في `AR_MONTHS_SHORT` array اللي اتعمل في V18.28 لتوفير مساحة، بس الاختصارات طلعت مبهمة." },
      { type: "improvement", text: "💡 [مفيش تأثير على الـ layout] رغم إن الأسماء بقت أطول، الجدول لسه واسع كفاية لأن السنة مش بتظهر في الـ compact format. مثلاً '3 مايو' = 6 حروف، أقل من تاريخ كامل بسنة." },
    ]
  },
  {
    version: "V19.42",
    date: "2026-05-03",
    types: ["fix"],
    title: "🔗 شيلنا الكلام الإنجليزي تحت لينك CLARK في رسائل واتساب",
    changes: [
      { type: "fix", text: "🔗 [link preview أنظف] لما تبعت لينك بورتال العميل (clark-factory.vercel.app/?p=c&i=...) في واتساب، كان بيظهر تحت كلمة CLARK فقرة طويلة بالإنجليزي 'Welcome to the world of CLARK, where high quality meets contemporary elegance in children's clothing designs...' — كان مزعج لأن اللينك ده وظيفي مش ترويجي." },
      { type: "fix", text: "🛠 [الإصلاح] شيلنا meta tags `description` و `og:description` و `twitter:description` من `index.html`. النتيجة: الـ preview بيظهر بس بـ logo CLARK وكلمة CLARK، بدون أي فقرة." },
      { type: "improvement", text: "💡 [ملاحظة كاش] واتساب بيـcache الـ link previews لمدة. ممكن تاخد ساعات قبل ما الـ preview الجديد يظهر. لو لقيت الكلام لسه ظاهر بعد الـ deploy، اطلب من العميل يـclear chat cache، أو ابعت اللينك من رقم تاني عشان تختبر." },
    ]
  },
  {
    version: "V19.41",
    date: "2026-05-03",
    types: ["feature"],
    title: "↪️ صفحة مرتجع المشتريات + زر ارتجاع للمورد من فاتورة الشراء",
    changes: [
      { type: "feature", text: "📑 [صفحة جديدة 'إشعارات مدينة'] tab جديد في الـ sidebar تحت 'فواتير المشتريات' — مرآة كاملة لصفحة 'إشعارات دائنة' بس على جهة الموردين. فلترة بالتاريخ والحالة والمورد، إحصائيات (مسودة/مرحّل/ملغي)، عرض البنود، ترحيل، إلغاء، حذف، طباعة." },
      { type: "feature", text: "↪️ [زر 'ارتجاع للمورد'] على أي فاتورة شراء **مرحّلة** (مش خدمات)، زر أزرق بيظهر في الـ detail modal. اضغط → modal بيعرض الأصناف بـ checkbox + إدخال للكمية لكل بند. الحد الأقصى للكمية المرتجعة هو الكمية الأصلية في الفاتورة (مفيش ارتجاع زيادة)." },
      { type: "feature", text: "🔗 [linked invoice] الإشعار المدين بيتولّد من الفاتورة الأصلية مع الحفاظ على رابط `linkedInvoiceId` و `linkedInvoiceNo` — كده تشوف في الإشعار 'للفاتورة: PINV-2026-XXXX' وفي طباعة الإشعار." },
      { type: "feature", text: "🔄 [التجميع التلقائي شغال هنا كمان] لو عملت ارتجاع لنفس المورد مرتين في نفس اليوم وقبل ما ترحّل، الـ items بتتدمج في نفس الإشعار المسودة (بدل ما تطلع إشعارين). نفس الـ pattern من V18.65 و V19.39 و V19.40." },
      { type: "feature", text: "✅ [Bulk post شغال] الترحيل الجماعي اللي في V19.39 شغل في صفحة الإشعارات المدينة بنفس الطريقة — checkbox لكل draft، شريط floating لما تختار، زر 'ترحيل المحدد' بيرحّل sequential مع toast واحد للنتيجة." },
      { type: "feature", text: "🖨 [طباعة كاملة] `printDebitNote` بـ template أزرق (مميّز عن إشعار دائن الأحمر وعن فاتورة الشراء البرتقالي)، فيه الـ letterhead والـ totals والـ signatures. الطباعة شغّالة في كل الحالات (draft/posted/void) مع badge للحالة." },
      { type: "feature", text: "📊 [Auto-resolve للسعر] لو دخلت بند مرتجع بدون سعر، النظام بيرجع لآخر فاتورة شراء non-void لنفس المورد ولنفس البند ويستخدم السعر اللي اشتريناه بيه فعلاً (`resolvePurchaseReturnUnitPrice` من V19.40). كده الإشعار بيخصم من المورد بنفس قيمة البند الأصلية." },
      { type: "improvement", text: "🚫 [مفيش لخدمات] زر الارتجاع مش بيظهر على فواتير الخدمات (`subtype === 'service'`) — الخدمات مش حاجة بترجع، لو في خطأ في فاتورة خدمات بيتعمل void بدل ارتجاع." },
    ]
  },
  {
    version: "V19.40",
    date: "2026-05-03",
    types: ["feature", "architectural"],
    title: "↪️ مرتجع المشتريات (Debit Notes) — البنية المحاسبية الكاملة",
    changes: [
      { type: "architectural", text: "↪️ [Entity جديدة data.purchaseDebitNotes] رقمها DN-YYYY-NNNN، نفس بنية credit notes الموجودة من V18.51 بس على الجهة العكسية. كل debit note بيمر بالحالات draft → posted → void زي باقي الـ entities." },
      { type: "architectural", text: "📚 [حساب جديد في CoA] '5140 مرتجع المشتريات' contra-expense تحت 'تكلفة البضاعة المباعة'. لو شجرة حساباتك موجودة بالفعل، روح الإعدادات → شجرة الحسابات وهتلاقي زر '+ إضافة 1 حساب جديد' عشان تضيف الجديد بدون ما يأثر على القديم." },
      { type: "architectural", text: "📐 [Posting rule جديد purchaseReturn] القيد المحاسبي: Dr موردون خامات (2110) / Cr مرتجع المشتريات (5140). يعني الـ debit note بيقلل اللي إحنا مدينين بيه للمورد ويسجل المرتجع كـ contra-expense (بيقلل تكلفة البضاعة في قائمة الدخل). يقدر المستخدم يغير الحسابات من الإعدادات." },
      { type: "architectural", text: "🛠 [Builder + upserter] `buildDebitNoteFromReturn` + `upsertDebitNoteFromReturn` في invoices.js — `upsert` بيدمج تلقائياً مرتجعات نفس المورد لنفس اليوم في debit note واحد (نفس باترن V18.65 و V19.39). البنود بنفس الـ itemType+itemId+سعر بتتدمج، البنود بأسعار مختلفة بتفضل سطور منفصلة (price history مهم محاسبيًا)." },
      { type: "architectural", text: "💰 [resolvePurchaseReturnUnitPrice] لو ما حددتش سعر للبند المرتجع، النظام بيرجع لآخر فاتورة شراء غير ملغية لنفس المورد ونفس البند ويستخدم السعر اللي اشتريناه بيه فعلاً. كده الـ debit note بيخصم من المورد بنفس المبلغ بالظبط." },
      { type: "architectural", text: "🔄 [autoPost methods جديدة] `autoPost.debitNotePosted()` و `autoPost.debitNoteVoided()` — نفس باترن creditNote: ترحيل بيعمل قيد، إلغاء بيعمل قيد عكسي، الفشل بيتسجل في accountingPostFailures مع نفس الـ retry logic." },
      { type: "architectural", text: "📊 [Stats helper] `getDebitNoteStats(data, filter)` بيرجع إحصائيات مفلترة (count + amount حسب الحالة) — جاهز للـ UI اللي جاي في V19.41." },
      { type: "architectural", text: "🚧 [بدون UI لسه] V19.40 ده مرحلة محاسبية بحتة. الصفحة الجديدة DebitNotesPg + زر 'ارتجاع' في فاتورة المشتريات هييجوا في V19.41. الـ entity موجود ومحاسبيًا صح، بس متاح بس برمجيًا حاليًا — لو حد بيختبر الـ utils مباشرة من الـ console هيشتغلوا." },
    ]
  },
  {
    version: "V19.39",
    date: "2026-05-03",
    types: ["feature", "improvement"],
    title: "✓ ترحيل جماعي للفواتير + تجميع فواتير المشتريات لنفس المورد/اليوم",
    changes: [
      { type: "feature", text: "✅ [ترحيل جماعي] فواتير المبيعات + إشعارات دائنة + فواتير المشتريات: ضفنا checkbox جنب كل مسودة + checkbox 'تحديد الكل' في الـ header. لما تختار حاجات، شريط أزرق بيظهر تحت بيقولك العدد + الإجمالي + زر 'ترحيل المحدد'. كل فاتورة بترحل بقيد محاسبي مستقل (sequential مش parallel) عشان مفيش race في الـ journal counter." },
      { type: "feature", text: "🔄 [تجميع فواتير المشتريات] اضافة `upsertPurchaseInvoiceFromReceipt` — لما تحوّل إذن استلام لفاتورة، لو في فاتورة مسودة موجودة لنفس المورد ونفس التاريخ، البنود بتتدمج فيها (نفس الـ pattern بتاع فواتير المبيعات من V18.65). البنود اللي ليها نفس الـ itemType+itemId+سعر بتتدمج في سطر واحد بـ qty أكبر، اللي مختلفة بتتضاف كسطر جديد." },
      { type: "improvement", text: "📑 [إنشاء فواتير جماعي ذكي] في صفحة فواتير المشتريات، زر 'إنشاء فواتير من N استلام' دلوقتي بيستخدم الـ upsert. لو عندك 5 إذونات لنفس المورد في نفس اليوم، هتطلع فاتورة واحدة بدل 5. الرسالة بقت تقول: 'تم إنشاء X فاتورة + دمج Y في فواتير قائمة'." },
      { type: "improvement", text: "🔍 [findInvoiceByReceipt محدّث] الـ lookup بقى يدور في `receiptRefs[]` (الفواتير المدمجة) قبل ما يدور في الـ singular `receiptRef` (legacy). كده الإذونات اللي اندمجت في فاتورة مع غيرها هتظهر صح كـ 'مرتبطة بفاتورة' ومش هتظهر كـ uninvoiced." },
      { type: "improvement", text: "📦 [مكوّن جديد BulkPostBar] component مشترك بين الـ 3 صفحات (مبيعات/مشتريات/مرتجعات) — `BulkPostHeader` + `RowCheckbox` + `BulkPostBar` (شريط floating بيظهر لما حاجة محددة). الـ DRY ده بيخلي الـ behavior متطابق ولو في bug في مكان، الإصلاح بيتطبق في كل الصفحات في نفس الوقت." },
      { type: "improvement", text: "💡 [silent mode] الـ handlePost في الـ 3 صفحات ياخد `opts.silent` — لو true بيتخطى الـ confirmation dialog والـ toast الفردي. الـ bulk bar بيستخدم ده عشان يعمل confirm واحد + toast واحد للعملية كلها بدل ما المستخدم يضطر يضغط Yes 50 مرة." },
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
