# CLARK — Work Log & Phase History

> **توثيق كامل لكل المراحل اللي اتعملت — version-by-version.**
> آخر تحديث: V21.9.10 (2026-05-10)
> Repo: `https://github.com/asamy010/clark-factory.git`

---

## 📜 Engineering Persona

> **أنت Principal Engineer — مستوى Google/OpenAI/Microsoft.**
> اكتشاف الـ root cause، ليس الأعراض. كل bug fix معلّق بـ ROOT CAUSE comment
> ومسجّل في CLAUDE.md §10 (Anti-patterns) لمنع التكرار.

التفاصيل الكاملة في [`CLAUDE.md §0`](./CLAUDE.md).

---

## 🔄 Build → Test → Commit → Push → Zip Protocol

كل تحديث جديد **لازم** يمر بـ:

1. ✅ **Build** — `npm run build` — يجب أن ينجح
2. ✅ **Test** — smoke check (no errors, schema valid)
3. ✅ **Version bump** — في 3 أماكن (package.json + constants + AboutVersionModal)
4. ✅ **Commit** — copy files → stage specific paths → commit with V-tagged message
5. ✅ **Push** — `git push origin main` → Vercel auto-deploy
6. ✅ **Zip** — `clark-v<x.y.z>.zip` على Desktop

التفاصيل في [`CLAUDE.md §1`](./CLAUDE.md).

---

## 📅 Phase History

### V19.91 — Phase 0 — Shopify Integration Foundation
- إنشاء بنية Shopify Integration الكاملة
- OAuth 2.0 flow (بسبب deprecation الـ legacy custom apps في Jan 2026)
- Token formats: `shpat_` (legacy custom app), `atkn_` (Dev Dashboard automation)
- 12 sub-tabs design: Dashboard, Connection, Products, Orders, Customers, etc.
- Two-Stage COD workflow architecture

### V19.92 — OAuth 2.0 Flow Complete
- Discovery: `atkn_` tokens don't work for Admin REST API → only OAuth gives `shpat_`
- HMAC state signing for OAuth (using DELIVERY_CONFIRM_SECRET)
- Callback endpoint exchanges code → token
- Required scopes: `read_orders, read_all_orders, read_products, write_products, read_inventory, write_inventory, read_locations, read_fulfillments, read_customers`

### V19.93 → V19.99 — Phases 1-7
- Phase 1: Order sync + mark delivered/refused
- Phase 2: Stock reservations (auto-create on new orders)
- Phase 3: Process returns + draft credit notes
- Phase 4: Inventory push to Shopify (computed available)
- Phase 5-6: Webhooks + recovery
- Phase 7: Bulk update products + filters

### V20.0 → V20.3 — Phases 8-11+
- Phase 8: Create CLARK inventoryItems from Shopify products
- Phase 9: Bosta integration (states, webhook, tracking)
- Phase 10: Push CLARK orders → Shopify products (variants matrix)
- Phase 10b: Abandoned carts + WhatsApp recovery
- Phase 10c: Discount codes manager
- Phase 10d: Auto-create Bosta shipments
- Phase 10e: Customer segments
- Phase 10f: Judge.me Reviews integration
- Phase 10g: Bi-directional customer tags sync
- Phase 10h: Print Bosta AWB
- Phase 10i: Multi-provider shipping registry (Bosta, Aramex, Mylerz, Manual)
- Phase 11: Customer aggregation + tier system + WhatsApp tracking

---

## 🚀 V21.x — Major Architectural Phases

### V21.9.0 — Phase 11: Bug Fixes + Historical Sync + Diagnostics

**Bugs fixed:**
- 🐛 Variant matrix empty in ShopifyPushModal
  - **Root cause**: extraction was reading `order.fabricA.colors` but CLARK
    schema stores in `order.colorsA` with `c.color` (not `c.n`)
  - **Fix**: read from correct field in both frontend + backend

- 🐛 WhatsApp button "did nothing"
  - **Root cause**: `window.open()` after `await ask()` loses user gesture
    → popup blocker silently drops it
  - **Fix**: pre-open blank tab synchronously, navigate after awaits

**Features added:**
- ✅ Purchase indicator badge on customers (`✓ اشترى ×N`)
- 📚 `POST /api/shopify/sync-historical-orders` — full backfill with Link-header pagination
- 📚 `POST /api/bosta/sync-historical` — pull all Bosta deliveries + verification
- 🩺 `GET /api/diagnostics` — file size + connection health monitor
- 📊 Storage monitoring panel + diagnostics tool in Settings
- ✂️ Document splitting architecture (`shopifyOrdersArchive`, `bostaDeliveriesArchive`)

### V21.9.1 — Phase 11g: Archive Viewer + Full Workflow

- 📚 `POST /api/shopify/list-archived-orders` — month picker
- 👥 Customer aggregation now scans `shopifyOrdersArchive` (not just live)
- 📚 One-click "مزامنة شاملة" button (historical + customer aggregation)

### V21.9.2 — Phase 11h: Split shopifyProducts + shopifyCustomers

**Critical architectural change:**
- factory/config doc was at 66% of 1MB cap (673KB)
- shopifyProducts (277KB) + shopifyCustomers (261KB) = 80% of doc
- **Migration**: per-id collections (`shopifyProductsDocs/{shopify_id}`, `shopifyCustomersDocs/{customer_id}`)
- All endpoints became dual-mode (legacy array vs per-doc)
- `POST /api/maintenance/split-shopify-collections` migration endpoint
- DiagnosticsCard banner appears when doc ≥ 50% with one-click "✂️ ابدأ التقسيم"

### V21.9.3 — Phase 11i: Push Modal Fixes + Diagnostics Relocation

- 🐛 Sizes not appearing in Push Modal
  - **Root cause**: code reading `order.sizes` (doesn't exist in CLARK)
  - CLARK uses `order.sizeSetId` → `data.sizeSets[i].label` (parsed by `-` or `/`)
  - **Fix**: client uses `getSizesFromSet(order, data)`, backend accepts `sizeSets`
- 🐛 Push fails "الموديل مش موجود"
  - **Root cause**: orders live in `seasons/{activeSeason}/orders/{docId}` subcollection, NOT `factory/config.orders`
  - **Fix**: query the subcollection, fallback to scan all seasons, store `_docPath`
- 🛠️ DiagnosticsPanel extracted to shared component, moved to general Settings → Maintenance
- 📜 CLAUDE.md created — engineering protocol document
- 📅 `POST /api/maintenance/split-shopify-orders-daily` — migration tool (not yet wired)

### V21.9.4 — Phase 11j: Universal Sync Progress Overlay

**Architectural feature**: every sync/pull operation now has progress UI.

- `api/_progressTracker.js` — `withProgress(req, res, init, handler)` server wrapper
- Creates `syncJobs/{jobId}` Firestore doc, throttled updates (1/sec)
- `src/components/SyncProgressOverlay.jsx` — full-screen overlay (singleton)
- `src/utils/syncProgress.js` — `runWithProgress({label, type, fn})` client wrapper
- Wired endpoints: sync-orders-now, sync-products-now, sync-customers,
  sync-historical-orders, bosta/sync-historical
- UI buttons updated to use `runWithProgress`
- No-crash guarantee — never throws, returns `{ok, error}`

### V21.9.5 — Phase 11k: Crash Fix + Daily Splits + Push Modal Enhancements

- 🚨 **CRITICAL CRASH FIX**: React Error #310
  - **Root cause**: `useEffect` was AFTER `if(!job) return null;` in SyncProgressOverlay
  - Hooks count changed when `job` toggled null↔value → React Error #310
  - **Fix**: moved effect BEFORE early return, used `isDoneForDismiss` derived var
- 📅 Daily split for credit/debit notes (V21.9.5):
  - `salesCreditNotes` → `salesCreditNotesDays/{YYYY-MM-DD}`
  - `purchaseDebitNotes` → `purchaseDebitNotesDays/{YYYY-MM-DD}`
- 🛍️ Push Modal enhancements:
  - 📌 Title field (overrides auto-generated)
  - 🏷 Model number prominent display
  - 🎨 Per-color image upload (variant_ids linked to Shopify)
  - 🖼 Order's main image auto-seeded
  - 🗑 Delete button on every image
  - ⚠️ onError indicator on `<img>` tags
- 🐛 Image upload bug: `compressImage` returned Blob without `.name` → wrap in `new Blob()` with explicit `contentType`

### V21.9.6 — Phase 11l: WhatsApp Contact Tracking

> User feedback: "العملاء اللي اشترو عاوز تعليمه لما ابعتله رسالة واتس اب يظهر ن تم ارسال عدد رسايل كذا عشام مابعتلوش تاني"

The `contact_count` + `last_contacted_at` data was already collected from V20.2 — but **never displayed** in the UI. Fixed visibility:

- 📱 Badge on customer rows: "📱 تم إرسال N" (green 1-2, red 3+ "توقّف!")
- 🔢 Counter overlay on WhatsApp button (📱 with dot showing count)
- ⚠️ Confirmation popup before re-messaging (shows last_contacted relative time)
- 🎯 Smart skip in Bulk WhatsApp (split into "fresh" vs "already-contacted")
- 🔍 Filter: "إخفاء اللي اتبعت لهم رسالة قبل كده"
- 📊 Stats cards (📤 contacted / 📵 untouched / ✉️ avg messages)

### V21.9.7 — Phase 11m: Returns Management + Bosta CRP

- ↩️ New tab "↩️ المرتجعات" in ShopifyIntegrationPg
- 🔔 Pulsing red notification badge on tab (count of pending_review)
- 7 metric cards: total / pending_review / approved / in_pickup / received / refunded / rejected
- Per-status actions: approve/reject/mark_received/mark_refunded/cancel
- 🚚 Bosta CRP integration: type code 25 (Customer Return Pickup)
  - Bosta picks up package from customer → returns to merchant
  - tracking_number + delivery_id stored on the return request
  - Auto-advances to "in_pickup"
- 3 new endpoints:
  - `POST /api/shopify/return-request-create`
  - `POST /api/shopify/return-requests-list`
  - `POST /api/shopify/return-request-update`
- 🆕 CreateReturnRequestModal: order picker + reason + items + refund calc
- 📅 Daily split V21.9.7: `shopifyReturnRequests` → `shopifyReturnRequestsDays`

### V21.9.8 — Phase 11n: WhatsApp Composer + Automated Campaigns

**1. Professional WhatsApp Composer** (`src/components/WhatsAppComposer.jsx`):
- 880px modal with 10-row textarea
- 5 quick-templates (welcome, order follow-up, abandoned cart, VIP, review)
- 5 variable buttons: `{name}` `{phone}` `{order}` `{total}` `{discount}`
- 24 emoji quick-insert
- Image upload (Firebase Storage → URL inserted as link preview)
- Live preview pane (WhatsApp chat bubble style)
- Char counter (4096 limit)

**2. Automated Campaigns** (new tab "📬 الحملات"):
- 6 audience segments (purchased / not_purchased / abandoned_cart / shopify_only / vip / at_risk)
- Schedule: now / once / recurring (placeholder)
- Smart dedup window (skip already-contacted within N days)
- Run flow: server prepares wa.me URLs → client opens tabs in batches
- 4 endpoints:
  - `POST /api/shopify/campaign-create`
  - `POST /api/shopify/campaigns-list`
  - `POST /api/shopify/campaign-update`
  - `POST /api/shopify/campaign-prepare-run`
- Daily split V21.9.8:
  - `whatsappCampaigns` → `whatsappCampaignsDays`
  - `whatsappCampaignRuns` → `whatsappCampaignRunsDays`

### V21.9.9 — Phase 11o: Critical Shopify Audit (Principal Engineer pass)

> User reported multiple symptoms: "signal aborted", products synced but
> not visible, Bosta orders not appearing, popup auto-dismiss too fast.

**Comprehensive root-cause audit identified 5 critical bugs:**

#### 🚨 BUG 1: API_TIMEOUT_MS=20s too short

- **Symptom**: "signal is aborted without reason" on every long sync
- **Root cause**: `shopifyClient.js` had `const API_TIMEOUT_MS = 20000` global. Historical syncs need 60-300s due to Shopify rate limit (2 req/sec × 100s of pages). Client AbortController fires at 20s while server keeps running.
- **Fix**: per-endpoint timeout map:
  - Default: 30s
  - sync-products / sync-customers: 3 min
  - push-inventory / push-customer-tags: 5 min
  - sync-historical-* / split-collections: 10 min
- AbortError now surfaces meaningful Arabic message

#### 🚨 BUG 2: Partitioned listener silently dropped docs without `id`

- **Symptom**: "سحبت المنتجات وما ظهرتش" — products invisible after sync
- **Root cause**: V21.9.2 migration wrote `shopifyProductsDocs/{shopify_id}` but the docs themselves had no top-level `.id` field. Listener filter at line 3286 was `else if(docData && docData.id)` → ALL migrated products silently dropped.
- **Fix (3 layers)**:
  1. Listener fallback: `id = docData.id || change.doc.id` — rescues already-migrated users
  2. `writeManyShopifyProducts/Customers` enforce `id = safeId` on every doc
  3. Migration writes `id` field explicitly

#### 🐛 BUG 3: Auto-dismiss too fast

- **Symptom**: "البوب اب اختفى ومظهرش حاجة"
- **Root cause**: `setTimeout(dismiss, 1500)` — too fast to read result preview
- **Fix**: removed auto-dismiss, added explicit "✓ تمام، إغلاق" green button

#### 🐛 BUG 4: Multi-job overlay race

- **Symptom**: Job B's overlay killed by Job A's done effect
- **Root cause**: module-level `_activeJob` shared, no tracking which job is active
- **Fix**: sequence numbers — `dismissSyncProgress(seq)` only dismisses if active job has matching seq

#### 🚨 BUG 5: Historical sync didn't populate live data

- **Symptom**: "بوسطة مظهرش اي طلبات في القايمة"
- **Root cause**: `sync-historical-orders` wrote ONLY to `shopifyOrdersArchive`, leaving `shopifyPendingOrders` empty
- **Fix**: after archive write, take most-recent 200 orders and merge into live array (preserving local mutations like status, invoice_id, bosta tracking)
- Same fix for `bosta/sync-historical`: matches by tracking_number, updates `.bosta` on live orders

**UX improvements:**
- 🌐 "السلال المهجورة" → "Abandoned Cart" (English brand consistency)
- New progress step "تحديث قائمة الطلبات الـ live..."
- Bosta result includes `live_orders_updated` count

### V21.9.10 — Phase 11p: Documentation Pass

- 📜 CLAUDE.md updated with Principal Engineer persona (§0)
- 📜 Build/Test/Commit/Push/Zip protocol expanded with explicit shell commands
- 📜 WORK_LOG.md created — comprehensive phase history
- 📜 README.md created — project overview

### V21.9.11–V21.9.40 — Phases 12 + 13 + 14a/b (gap fill summary)

> **Note**: full per-version entries live in `AboutVersionModal.jsx`. Highlights:

- **V21.9.11–V21.9.20**: Bug-fix passes after V21.9.9 audit landed (Bosta link
  preservation, sync-products race, partition listener `id` fallback)
- **V21.9.21–V21.9.24**: Treasury dedupe (race in pre-V21.9.14 transfer save),
  audit-state endpoint, fix-flags safety net, permissions surface
- **V21.9.25–V21.9.30**: Dynamic role scopes, Phase 13 bridge + bot integration
- **V21.9.31–V21.9.38**: WhatsApp Bridge (Cisco-grade reliability work), CLARK
  assistant bot, `upConfig` wipe bug for partitioned collections (V21.9.33)
- **V21.9.39 — Phase 14a**: ROOT CAUSE for treasury entries + credit notes +
  Shopify returns getting silently wiped on every save. Cause: V21.9.4's
  hydration block stopped at SPLIT_FIELDS_V1953; the new V2195/V2197/V2198/V2199
  fields were never hydrated → `syncAllSplitChanges` saw `newArr=[]` and
  deleted every entry from the day docs.
- **V21.9.40 — Phase 14b**: HR module had no `autoPost.*` calls (since V18.35).
  Every salary/advance/workshop-payment was hitting treasury + hrLog but
  NEVER posting to the journal. 5 functions in `HRPg.jsx` updated to fire
  `autoPost.hr / workshopPay / treasury` after upConfig commit. Whitelist
  for `hr_other_expense` sourceType in `postingRules.buildTreasuryEntry`.

### V21.9.41 — Phase 14c: Bug 2 — Double WhatsApp on Customer Payment

> User report: "لما بنسجل دفعة وارد من عميل بيبعت للعميل رسالتين واتس اب
> عبر البريدج" — same customer phone, same content, twice.

**ROOT CAUSE** — race between client instant-fire and cron tick in the atomic
claim:

```
T=0       TreasuryPg → POST /api/event-trigger (fire-and-forget)
T=0.1s    claimEvent → eventHistory: { inFlight:true, success:false }
T=0.5s    bridgeSend → bridge delivers message ✅ (msg 1)
T=8-10s   ⚠️ Vercel function killed BEFORE recordResult runs
          → eventHistory STILL inFlight:true (never finalized)
T=60s     INFLIGHT_LOCK_MS expires (pre-V21.9.41 = 60_000)
T=300s    cron tick → scanRecentPayments → claimEvent sees stale lock
          (age 300s ≥ 60s) → RECLAIM → bridgeSend → msg 2 🚨
```

**Fix** — 4 layers in `api/_eventProcessor.js`:

1. **AbortController + 8s timeout** on `bridgeSend` (the critical fix).
   Below Vercel's 10s hobby limit → bridgeSend either completes or aborts
   cleanly → the success-side `recordResult` ALWAYS runs.
2. **`INFLIGHT_LOCK_MS`: 60s → 5min (300_000)** — strictly longer than
   cron interval. Even with edge-case skips, cron can't reclaim within
   the window.
3. **`CONTENT_DEDUPE_MS`: 30s → 15min (900_000)** — content-based safety
   net for any residual race where `idempotencyKey` differs but the
   recipient + payload match.
4. **Finally-guarded `recordResult`** in `processEvent` — last-ditch
   failure write if the success path throws for any other reason.

### V21.9.42 — Phase 14d: Bug 1 — Legacy Orders Migration ("الملف ١ ميجا")

> User report: "محاسب الخزنة بيسجل حركات وارد للخزنة اشتغل شوية تسجيل
> وبعد كده رفض يسجل تاني وبيظهر رسالة تم ملئ البيانات الملف ١ ميجا"

**ROOT CAUSE** — pre-V18.60 installs have `factory/config.orders[]` as a
flat legacy array containing every order + every nested
`customerDeliveries`/`customerReturns`/etc. From V18.60 onward, orders
live in `seasons/{seasonId}/orders/{docId}` subcollection — BUT the legacy
array was never stripped on old installs. Every `upConfig` rewrites the
whole doc with the legacy orders → factory/config bloats to ~900 KB →
writes fail with "حجم البيانات تجاوز الحد".

The treasury writes themselves are fine (they go to `treasuryDays/`) —
but every save also rewrites the orders array, which is what tips the
doc over the 1 MB cap.

**Fix** — 4 layers:

1. **Migration endpoint** `api/maintenance/migrate-legacy-orders.js`
   (~280 lines):
   - Idempotent via flag `_legacyOrdersMigratedV2110`
   - Dry-run mode with sample-50 stats
   - Backup → `backups/pre-legacy-orders-migration-{ts}`
   - Per-batch best-effort (50/batch) with failure tracking
   - Conflict-avoidance: don't overwrite subcollection if its `updatedAt`
     is newer than legacy
   - Flag set ONLY if zero failures

2. **Diagnostics overhaul** `api/diagnostics.js`:
   - Replaced 16 hardcoded array keys → `Object.keys(cfg).filter(isArray)`
   - Legacy tagging via `KNOWN_LABELS` (30+ fields)
   - Special call-out for `orders` even at low byte count

3. **Safety net** `src/utils/dataLimits.js`:
   - `console.warn` if `cfg.orders` populated after migration flag set
     (catches legacy code paths writing back)
   - Warn-once-per-session if >50 entries pre-migration

4. **UI banner** `DiagnosticsPanel.jsx`:
   - Highest-priority red banner when migration available
   - Client wrapper `migrateLegacyOrders` in `shopifyClient.js`
     with 5-minute timeout

### V21.9.45 — Phase 14g: Bug 4 — Confirmed Transfer Missing Legs

> User report: "محاسب الخزنة ارسل ليا طلب تحويل من الرئيسية للفرعية.
> عملت موافقة على الطلب ولكن ماظهرش في السجلات لاي خزنة"

**ROOT CAUSE** — `approveTransfer` in `TreasuryPg.jsx` does an atomic
upConfig that:
1. Sets `tf.status = "confirmed"` (lands in `treasuryTransfersDays/{date}`
   via V19.52 split)
2. Pushes 2 treasury legs (out + in) into `d.treasury` (lands in
   `treasuryDays/{tf.date}` via V16.74 split)

The commit flow:
- `setDoc(factory/config)` for the stripped doc ✅
- `syncAllSplitChanges` for the day docs ⚠️

If `syncAllSplitChanges` silently fails for the treasury day doc
(network blip, listener race, Firestore transient deny), the result is:
- ✅ `tf.status = "confirmed"` (committed)
- ❌ 2 legs missing in `treasuryDays/{tf.date}`

The user sees the transfer with status "confirmed" in the transfers
tab, but ZERO entries in any account log.

**Gap in self-healing**: `App.jsx:857-881` has the `transfers-repair`
migration that DOES scan + recreate missing legs, but it's gated by
`!data._splitDaysV1952Done`. Once V19.52 ran, the auto-repair NEVER
fires — even for newly-broken transfers.

**Fix** — on-demand repair endpoint that works regardless of flag state:

1. **`api/maintenance/repair-confirmed-transfers.js`** (NEW, ~270 lines)
   - Loads transfers from both split (`treasuryTransfersDays/*`) and
     legacy (`cfg.treasuryTransfers`) — handles all install ages
   - Loads treasury entries from both split and legacy
   - Indexes treasury legs by `transferId` for O(N) scan
   - For each `tf.status === "confirmed"`:
     - If `out` leg missing + `fromAccount` set → queue construction
     - If `in` leg missing + `toAccount` set → queue construction
   - Writes per-day with **MERGE not overwrite** — reads existing entries,
     prepends new legs, writes back via `{ merge: true }`
   - Per-leg audit trail: `repairedAt`, `repairedBy`, `repairReason`
   - Dry-run mode returns scan stats + sample (10 entries)

2. **UI banner in `DiagnosticsPanel.jsx`** — always-visible "🔧 فحص +
   إصلاح" button. Click → automatic dry-run → confirmation popup with
   stats + sample → real run → result toast + diagnostics refresh.

3. **Client wrapper `repairConfirmedTransfers`** in `shopifyClient.js`
   with 3-minute timeout for installs with thousands of transfers.

**Anti-pattern entry (CLAUDE.md §10)**: any one-shot migration that
implements self-healing logic MUST be paired with an on-demand repair
endpoint. The pre-state flag guards prevent the auto-repair from
re-running, which is correct for idempotency — but leaves no recovery
path when the failure scenario recurs post-migration.

### V21.9.44 — Phase 14f: Bug 3 — Cross-device Stale-Write Loss of Recurring Rules

> User report: "امبارح سجلت في الدفعات المتكررة في الخزنة بندين جداد من
> الموبيل وظهروا تمام لكن لما جيت اشتغلت ع الكمبيوتر لقيت البندين دول مش
> موجودين اختفو من قايمة التكرار ولكن موجودين بسجل الخزنة"

**ROOT CAUSE** — `recurringTreasury` lived as a plain `cfg.recurringTreasury[]`
array. It was never registered in `SPLIT_FIELDS` or `PARTITIONED_FIELDS`, so
the cross-device stale-write race documented in `App.jsx:3711-3714` was free
to wipe it:

```
T=0   📱 Mobile: cfg.recurringTreasury = [A..I] (9 rules)
T=1   📱 Mobile: save rule J → upConfig → Firestore: [A..I, J] ✅
        + treasury tx → treasuryDays/2026-05-15 (SPLIT — protected)
T=2   📱 Mobile: save rule K → Firestore: [A..I, J, K] ✅
T=10  💻 PC opens app, onSnapshot listener still catching up.
        configDocRef.current = STALE [A..I]
T=11  💻 PC user does ANY save → upConfig clones stale base →
        setDoc(factory/config, stripped, {merge:false}) →
        Firestore.recurringTreasury reverted to [A..I] 🚨
        BUT: treasuryDays/2026-05-15 still has the generated txs
```

This is exactly why the user saw the treasury entries in the log but not
in the recurring rules list.

**Fix** — promote to a per-id partitioned collection (same pattern as
V19.57 customers/suppliers and V21.9.2 shopifyProducts):

1. **`src/utils/partitionedCollections.js`**: register `recurringTreasury →
   recurringTreasuryDocs`, new `PARTITIONED_FIELDS_V21944` + flag
2. **`src/App.jsx`**: 3 surgical edits:
   - Merge: `if(configDoc[PARTITIONED_FLAG_V21944]) merge from partitionedData`
   - Hydration in upConfig (CRITICAL — without this, every save would
     wipe all rules; same shape as V21.9.33 fix for V2192)
   - Safety gate: refuse upConfig until partitionedData loaded
3. **`api/maintenance/migrate-recurring-treasury.js`** (NEW, ~230 lines):
   dry-run + backup + per-id write + idempotent + conflict-avoidance
4. **`src/components/DiagnosticsPanel.jsx`**: warning banner + button
5. **`src/utils/shopify/shopifyClient.js`**: `migrateRecurringTreasury`
   wrapper with 2-minute timeout

Post-migration, each rule is its own Firestore document — stale-write
from another device targets only `factory/config`, leaving the rules
untouched. Same protection model as customers/products.

**Anti-pattern entry (CLAUDE.md §10)**: any growing array that's saved
from multiple devices MUST be either daily-split or per-id partitioned
from day 1. Plain `cfg.<field>[]` is acceptable ONLY for single-device
settings.

### V21.9.43 — Phase 14e: Documentation Pass

- 📜 CLAUDE.md §10 expanded with 4 new anti-pattern categories:
  - Server-side automation (`AbortController`, `INFLIGHT_LOCK_MS`,
    finally-guarded result write)
  - Diagnostics blind-spots (always enumerate, never hardcode)
  - Migration safety (3-layer pattern)
  - Legacy `cfg.orders[]` write ban
- 📜 WORK_LOG.md gap-filled for V21.9.11 → V21.9.40 + new entries
  for V21.9.41/.42/.43
- 📜 README.md version badge bumped to V21.9.43

---

## 🏗 Architectural Decisions (the "why")

### Document Splitting Strategy

**Problem**: Firestore has a hard 1 MB limit per document. Arrays grow unbounded.

**Solution**: Two split strategies depending on data shape.

#### Daily splits (transactional/dated entries)
- `treasury` → `treasuryDays/{YYYY-MM-DD}`
- `auditLog`, `hrLog`, `custPayments`, `supplierPayments`, etc.
- Each day-doc has shape `{ date, entries: [...], count }`
- Cap per doc: ~600 entries × 1KB = 600KB (well under 1MB)

#### Per-id splits (entity collections)
- `customers` → `customersDocs/{id}`
- `shopifyProducts` → `shopifyProductsDocs/{id}`
- One doc per entity, doc id = entity id
- No cap per doc (each entity = its own doc)

**When in doubt**: any array that grows over time → register split from day 1.
The migration cost is high; preventing growth is cheap.

### Active Season Pattern

CLARK orders live in `seasons/{seasonId}/orders/{docId}` subcollection,
NOT in `factory/config.orders`. Active season is `cfg.activeSeason || "WS26"`.

When a server endpoint needs an order:
1. Try `seasons/{activeSeason}/orders.where("id", "==", orderId)` first
2. Fallback: scan all seasons via `db.collection("seasons").listDocuments()`
3. Always store `_docPath` on the loaded order for write-back

### Fabric + Color Storage (CLARK convention)

```js
order.fabricA   = "<fabric ID>"               // string id reference
order.colorsA   = [{ color, colorHex, layers, pcsPerLayer, qty }]
order.consA     = "<consumption>"
order.cutDateA  = "YYYY-MM-DD"
```

Color name = `c.color` (NOT `c.n`, NOT `c.name`).
Up to 8 fabrics: keys A-H (`FKEYS`).

### Sizes Resolution

CLARK orders DO NOT store `order.sizes` — they store `order.sizeSetId`
referencing `data.sizeSets[i]`.

```js
import { getSizesFromSet } from "../utils/format.js";
const { sizes } = getSizesFromSet(order, data);
```

Server-side: pass `cfg.sizeSets` to any builder (e.g. `buildVariantMatrix`).

### Phone Normalization

Egyptian phones canonical: 12-digit starting with `20` (no `+`, no spaces).

```js
import { normalizePhoneCanonical } from "api/shopify/_customers.js";
// "+201234567890" → "201234567890"
// "01234567890"   → "201234567890"
```

For wa.me URLs: strip everything except digits.

### WhatsApp Popup-Blocker Safety

`window.open()` after `await ask(...)` loses user gesture context.
Always pre-open synchronously:

```js
const win = window.open("about:blank", "_blank");  // sync, preserves gesture
if (customer.do_not_contact) {
  const yes = await ask(...);
  if (!yes) { if (win) win.close(); return; }
}
const url = "https://wa.me/" + digits + "?text=" + encodeURIComponent(text);
if (win && !win.closed) win.location.href = url;
else window.location.href = url;  // fallback if popup blocked
```

### Progress Tracking Convention

Every sync/pull endpoint MUST use:
- Server: `withProgress(req, res, init, handler)` from `api/_progressTracker.js`
- Client: `runWithProgress({ label, type, fn })` from `src/utils/syncProgress.js`

Pattern:
```js
// SERVER
return withProgress(req, res, {
  jobId: body.jobId,
  type: "shopify-sync-foo",
  label: "سحب البيانات...",
  by: auth.email,
}, async (update) => {
  await update({ message: "..." });
  // ...
  await update({ progress: 50, total: 100 });
  return { /* result */ };
});

// CLIENT
const r = await runWithProgress({
  label: "سحب البيانات",
  type: "shopify-sync-foo",
  fn: (jobId) => shopifyClientCall({ ...args, jobId }, user),
});
```

---

## 🚫 Anti-Patterns (NEVER repeat)

| Pattern | Why bad | Correct |
|---------|---------|---------|
| `window.open()` after `await` | Popup blocker drops it | Pre-open blank tab synchronously |
| `cfg.orders` | Empty (legacy) | `seasons/{season}/orders/` |
| `order.fabricA.colors` | Wrong field | `order.colorsA` with `.color` name |
| `order.sizes` | Doesn't exist | `getSizesFromSet(order, data)` |
| Adding array without split | Crashes at 1MB | Register in SPLIT_COLLECTIONS day 1 |
| `git add .` | Stages secrets/junk | Stage specific files |
| `--no-verify` | Skips hooks | Fix the underlying issue |
| Force-push to main | Destroys history | Make new commit |
| Auto-dismiss success UI | User can't read result | Manual close button |
| Module-level state without versioning | Race conditions | Sequence numbers |
| Listener requiring optional field | Silently drops data | Fallback to doc.id |
| Global API timeout | Long ops fail | Per-endpoint map |
| Treating symptom not cause | Bug returns | Root cause + comment + anti-pattern entry |

---

## 📂 File Structure (key paths)

```
clark-v19_90_0/
├── api/                                  # Vercel serverless functions
│   ├── _firebase.js                       # Admin SDK init + auth
│   ├── _progressTracker.js                # withProgress wrapper
│   ├── diagnostics.js                     # GET /api/diagnostics
│   ├── shopify/
│   │   ├── _shopifyAdmin.js               # Shopify API client
│   │   ├── _productPush.js                # Variant matrix builder
│   │   ├── _customers.js                  # Aggregator + tier compute
│   │   ├── _campaigns.js                  # WhatsApp campaigns helper
│   │   ├── _returnRequests.js             # Returns helper
│   │   ├── _partitioned.js                # shopifyProducts/Customers dual-mode
│   │   ├── _reservations.js               # Stock reservations
│   │   ├── _invoices.js                   # Phase 3 invoice helpers
│   │   ├── connect.js / disconnect.js / status.js
│   │   ├── oauth-init.js / oauth-callback.js
│   │   ├── sync-orders-now.js
│   │   ├── sync-products-now.js
│   │   ├── sync-customers.js
│   │   ├── sync-historical-orders.js
│   │   ├── sync-abandoned-carts.js
│   │   ├── push-inventory-now.js
│   │   ├── push-customer-tags.js
│   │   ├── push-product-from-clark.js
│   │   ├── mark-delivered.js / mark-refused.js
│   │   ├── process-return.js
│   │   ├── update-customer.js / update-product-settings.js
│   │   ├── bulk-update-products.js
│   │   ├── create-clark-item.js
│   │   ├── discount-codes.js
│   │   ├── list-archived-orders.js
│   │   ├── return-request-create.js / list / update.js
│   │   └── campaign-create.js / list / update / prepare-run.js
│   ├── bosta/
│   │   ├── _constants.js                  # State codes 10-60
│   │   ├── configure.js
│   │   ├── webhook.js                     # Public, secret-token auth
│   │   ├── track.js
│   │   ├── create-shipment.js / print-awb.js
│   │   └── sync-historical.js
│   ├── shipping/                          # Multi-provider registry
│   │   └── _providers.js / configure.js
│   ├── judgeme/                           # Reviews integration
│   ├── maintenance/                       # Migration tools
│   │   ├── split-shopify-collections.js
│   │   └── split-shopify-orders-daily.js
│   └── cron/
│       ├── shopify-poll-orders.js         # */5 * * * *
│       ├── shopify-push-inventory.js      # */30 * * * *
│       └── shopify-cleanup-reservations.js # 0 3 * * *
├── src/
│   ├── App.jsx                            # Root + listeners + migrations
│   ├── components/
│   │   ├── SyncProgressOverlay.jsx        # Singleton progress UI
│   │   ├── DiagnosticsPanel.jsx           # Health monitor (in Settings)
│   │   ├── WhatsAppComposer.jsx           # Pro WhatsApp message editor
│   │   ├── ShopifyPushModal.jsx           # Push CLARK order → Shopify
│   │   └── ui.jsx                         # Btn, Card, Inp, Sel, etc.
│   ├── pages/
│   │   ├── ShopifyIntegrationPg.jsx       # Main Shopify page (~5500 lines, 13 tabs)
│   │   ├── DetPg.jsx                      # Order detail (Push button)
│   │   ├── OrdForm.jsx                    # New order form
│   │   ├── CustDeliverPg.jsx
│   │   ├── DBPg.jsx                       # Master data
│   │   └── SettingsPg.jsx                 # General settings (Diagnostics here)
│   ├── utils/
│   │   ├── splitCollections.js            # Daily split registry
│   │   ├── partitionedCollections.js      # Per-id split registry
│   │   ├── dataLimits.js                  # enforceDataLimits + skip migrated fields
│   │   ├── syncProgress.js                # runWithProgress wrapper
│   │   ├── format.js                      # getSizesFromSet, fmt, etc.
│   │   ├── orders.js                      # Order CRUD utilities
│   │   ├── invoices.js                    # Invoice + credit note utilities
│   │   └── shopify/
│   │       ├── shopifyClient.js           # All /api/shopify/* wrappers
│   │       ├── customerTiers.js           # Tier metadata
│   │       └── stockReservations.js
│   ├── constants/
│   │   └── index.js                       # APP_VERSION + FKEYS + FCOL + INIT_CONFIG
│   └── firebase.js                        # Client SDK init
├── package.json                           # version source 1
├── vercel.json                            # cron jobs config
├── firestore.rules                        # security rules
├── CLAUDE.md                              # Engineering protocol (this file's sibling)
├── WORK_LOG.md                            # This file
└── README.md                              # Project overview
```

---

## 🌟 Key Endpoints Reference

### Shopify
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/shopify/connect` | Test + save creds |
| POST | `/api/shopify/oauth-init` | Begin OAuth flow |
| POST | `/api/shopify/sync-orders-now` | Pull recent orders (live) |
| POST | `/api/shopify/sync-historical-orders` | Full backfill (archive) |
| POST | `/api/shopify/sync-products-now` | Pull all products |
| POST | `/api/shopify/sync-customers` | Aggregate from orders + Shopify |
| POST | `/api/shopify/push-inventory-now` | Push CLARK stock → Shopify |
| POST | `/api/shopify/push-product-from-clark` | Variant matrix push |
| POST | `/api/shopify/return-request-*` | Returns CRUD |
| POST | `/api/shopify/campaign-*` | WhatsApp campaigns CRUD |
| POST | `/api/shopify/mark-delivered` | Manual delivery confirm |

### Bosta
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/bosta/configure` | Save API key |
| POST | `/api/bosta/track` | Manual refresh delivery state |
| POST | `/api/bosta/create-shipment` | Auto-create from CLARK order |
| POST | `/api/bosta/print-awb` | PDF AWB |
| POST | `/api/bosta/sync-historical` | Pull all + verification check |
| POST | `/api/bosta/webhook` | Public, signed by ?token= |

### Maintenance
| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/api/diagnostics` | Health + storage report |
| POST | `/api/maintenance/split-shopify-collections` | Migrate products + customers |
| POST | `/api/maintenance/split-shopify-orders-daily` | (TODO) Daily split orders |

### Cron (Vercel)
| Schedule | Path | Purpose |
|----------|------|---------|
| `*/5 * * * *` | `/api/cron/shopify-poll-orders` | Pull recent (every 5 min) |
| `*/30 * * * *` | `/api/cron/shopify-push-inventory` | Push stock (every 30 min) |
| `0 3 * * *` | `/api/cron/shopify-cleanup-reservations` | Cleanup orphans (daily 3 AM) |

---

## 🧪 Verification Commands

After every deploy, run these to verify health:

```bash
# 1. Check the version is live
curl -s https://clark-factory.vercel.app/ | grep -o 'V21\.[0-9]\+\.[0-9]\+'

# 2. Check the deployed Vercel URL
gh repo view asamy010/clark-factory --json defaultBranchRef -q '.defaultBranchRef.name'

# 3. Latest commit on main
gh api repos/asamy010/clark-factory/commits/main -q '.commit.message'

# 4. Build size
ls -lh "C:/Users/Ahmed Samy/Desktop/clark-v19_90_0/dist/assets/index-*.js" | head -3
```

---

## 📈 Stats (V21.9.10)

- **Total commits**: 30+ on `main`
- **Total endpoints**: 50+ API routes
- **Total UI components**: 40+ React components
- **Total lines**: ~30,000 lines of code
- **Schema migrations**: 8 split-collection migrations + 2 partitioned migrations
- **Cron jobs**: 3 scheduled
- **Dependencies**: 13 production, 2 dev

---

## 📞 Support

- **GitHub**: https://github.com/asamy010/clark-factory
- **Vercel**: https://clark-factory.vercel.app
- **Owner**: Ahmed Samy (CLARK Factory)

---

*Last updated: V21.9.10 (2026-05-10) — Generated by Principal Engineer audit*
