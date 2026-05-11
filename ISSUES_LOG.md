# CLARK — سجل المشاكل والحلول والبروتوكولات

> **آخر تحديث:** V21.9.19 — 2026-05-11
>
> ⚠️ **تحذير مهم:** الـ items في `§3. Pending` تحت لسه **ما اتـ verify-ـتش
> end-to-end على production**. فيه code-level fixes attempted (كل واحد له
> commit + version)، لكن المستخدم بلّغ إنها لسه ظاهرة. ممكن السبب:
>
> 1. الـ `firestore.rules` + `storage.rules` ما اتـ deploy-ـوش على Firebase
>    Console (manual step بعد كل release — Vercel ما بـ يـ deploy-هم).
> 2. الـ Service Worker بـ يـ cache الـ JS القديم (يحتاج hard-refresh
>    Ctrl+Shift+R).
> 3. الـ fixes نفسها محتاجة rework لأن الـ root cause الحقيقي مختلف عن
>    التشخيص الأول.
>
> الـ status الحالي: **all items below are PENDING verification**. لو
> الـ issue اتـ verify-ـت كـ resolved مع الـ user → نقلها لـ §5.

---

## جدول المحتويات

1. [ملخص الحالة](#1-ملخص-الحالة)
2. [Manual deployment — STEP 0 لازم قبل أي fix verification](#2-manual-deployment--step-0-لازم-قبل-أي-fix-verification)
3. [Pending — Critical bugs (code-fix attempted، لسه ما اتـ verify-ـتش)](#3-pending--critical-bugs-code-fix-attempted-لسه-ما-اتـ-verify-ـتش)
4. [Pending — High-priority bugs (code-fix attempted)](#4-pending--high-priority-bugs-code-fix-attempted)
5. [Pending — Medium-priority bugs (code-fix attempted)](#5-pending--medium-priority-bugs-code-fix-attempted)
6. [Pending — لسه ما اتـ touch-ـش (acknowledged TODO)](#6-pending--لسه-ما-اتـ-touch-ـش-acknowledged-todo)
7. [Confirmed resolved (features visible + UX changes)](#7-confirmed-resolved-features-visible--ux-changes)
8. [بروتوكولات التعامل](#8-بروتوكولات-التعامل)
9. [Anti-patterns — لا تكرر](#9-anti-patterns--لا-تكرر)
10. [Engineering quality bar](#10-engineering-quality-bar)
11. [Version history](#11-version-history)

---

## 1. ملخص الحالة

| Category | Count | Status |
|----------|-------|--------|
| Critical bugs (code-fix attempted) | 8 | ⚠️ Pending verification |
| High-priority bugs (code-fix attempted) | 8 | ⚠️ Pending verification |
| Medium-priority bugs (code-fix attempted) | 6 | ⚠️ Pending verification |
| Acknowledged TODO (لسه ما اتـ touch) | 6 | ⏳ Pending implementation |
| Features visible في UI | 7 | ✅ Confirmed (visible) |

**Net status:** المعظم لسه pending. الـ user بلّغ إن الحجات دي لسه ظاهرة بعد الـ release deploys. السبب الأرجح: deployment steps ناقصة (firestore.rules / storage.rules).

---

## 2. Manual deployment — STEP 0 لازم قبل أي fix verification

⚠️ **معظم الـ fixes في الـ list تحت بـ تعتمد على deployment يدوي للـ rules.**
**لو الخطوات دي ما اتعملتش، الـ fixes هتفضل invisible.**

### 2.1. Firestore Rules — مطلوب بعد V21.9.19

**ليه:** V21.9.19 ضاف match clauses لـ collections كانت denied من الـ client (shopifyCustomersDocs, shopifyOrdersDays، إلخ). الـ Vercel ما بـ يـ deploy-هاش — لازم publish يدوي.

**الخطوات:**
1. افتح https://console.firebase.google.com
2. اختار project `clark-factory` (أو حسب الـ name عندك)
3. **Build → Firestore Database → Rules tab**
4. افتح `firestore.rules` من الـ repo (root)
5. الصق **كل المحتوى** في الـ Console editor (replace existing)
6. اضغط **Publish**
7. تأكد الـ banner الأخضر "Rules published successfully"

### 2.2. Storage Rules — مطلوب بعد V21.9.12

**ليه:** V21.9.12 ضاف paths لـ `shopify-products/**` و `whatsapp-campaigns/**`. بدون publish، الـ image uploads هـ تـ deny بـ "storage/unauthorized".

**الخطوات:**
1. نفس الـ Firebase Console
2. **Build → Storage → Rules tab**
3. الصق محتوى `storage.rules` → Publish

### 2.3. Hard refresh (Ctrl+Shift+R)

الـ Service Worker بـ يـ cache الـ JS. بعد كل deploy، do hard-refresh في كل جلسة (وعلى كل device) عشان تـ pull الـ new code.

### 2.4. Verify الـ flags

بعد الـ deploys + hard refresh، الـ migrations auto-run. للتأكد:
- افتح الـ Firebase Console → Firestore → factory/config
- تأكد إن الـ flags دي = `true`:
  - `_partitionedV2192Done` (V21.9.2 — Shopify products/customers per-doc)
  - `_splitDaysV2195Done` (V21.9.5 — credit/debit notes daily)
  - `_splitDaysV2197Done` (V21.9.7 — return requests daily)
  - `_splitDaysV2198Done` (V21.9.8 — WhatsApp campaigns daily)
  - `_splitDaysV2199Done` (V21.9.18 — shopifyPendingOrders daily)

لو أي flag = `false` أو missing، الـ migration ما اشتغلتش — الـ user يفتح الـ app + ينتظر الـ blocking popup.

---

## 3. Pending — Critical bugs (code-fix attempted، لسه ما اتـ verify-ـتش)

كل bug هنا تـ ROOT CAUSE analysis + code commit، لكن المستخدم بلّغ إنها لسه ظاهرة.

### ⚠️ C1. Firestore rules ناقصة → عملاء/منتجات بـ يختفوا بعد refresh

**Code-fix version:** V21.9.19
**Status:** ❌ Reported still failing
**Symptom:** الـ user يـ sync customers + products يشوفهم → refresh → يلاقيهم اختفوا → يـ re-sync كل مرة.
**Diagnosed root cause:** الـ `firestore.rules` ما عندهاش match clauses لـ collections زي `shopifyCustomersDocs`, `shopifyProductsDocs`, `shopifyOrdersDays`. الـ catch-all `if false` بـ يمنع الـ client listeners.
**Attempted fix:** أضفنا match clauses في `firestore.rules` لكل collection ناقصة (commit `2221bc3`).
**Why may still be unresolved:**
- ⛔ **الـ firestore.rules ما اتـ deploy-ـتش على Firebase Console** (manual step — see §2.1).
- لو الـ rules ما اتـ publish-ـتش، الـ catch-all لسه بـ يـ deny → نفس الـ symptom.
**Next steps:**
1. تأكد deploy الـ rules حسب §2.1.
2. لو لسه فاشل بعد deploy، investigate الـ listener subscription في DevTools (Network tab → check لـ Firestore "permission-denied" errors).

---

### ⚠️ C2. Treasury — تأكيد التحويل بـ يـ revert + entries بـ تتكرر

**Code-fix version:** V21.9.14
**Status:** ❌ Reported still failing (per user feedback)
**Symptom:** الـ admin يضغط 'تأكيد'، الـ popup يختفي، يرجع pending بعد refresh. الضغطة الثانية → دفعة تتكرر.
**Diagnosed root cause:** `_stableMatch` في App.jsx ما كانش بـ يـ compare الـ `status` field على transfer records → الـ pendingMap بـ يتـ clear قبل الـ server write يخلص → الـ UI يـ revert.
**Attempted fix (3 طبقات):**
1. ضفت `status`, `fromAccount`, `toAccount`, `approvedBy`, `approvedAt` لـ `_stableMatch`.
2. In-flight guard على approve/reject buttons (`inflightTransferRef`).
3. Ledger-level idempotency check قبل ما نـ unshift أي leg.
**Why may still be unresolved:**
- ممكن Service Worker بـ يـ serve الـ JS القديم — hard-refresh مطلوبة.
- ممكن فيه edge case تاني ما اتـ trace-ـش (مثلاً الـ split sync بـ يفشل بعد retry، الـ optimistic state بـ يتـ revert من مصدر تاني).
- الـ duplicates الموجودة بالفعل قبل V21.9.14 لسه في الـ ledger (الـ fix بـ يمنع جديدة بس).
**Next steps:**
1. Hard refresh الـ app.
2. Test approve transfer مرة واحدة فقط، انتظر 3 ثواني، refresh، تأكد إن الـ status فضل "confirmed".
3. لو ظهر duplicate، اعمل screenshot من الـ DevTools Network + console.

---

### ⚠️ C3. Process Return بـ ينتج credit notes بـ صفر جنيه

**Code-fix version:** V21.9.11
**Status:** ❌ Pending verification — لم يـ test-ـه الـ user بعد الـ fix
**Symptom:** الـ user يـ click 'Process Return' على طلب delivered → credit note يتعمل لكن `total = 0`.
**Diagnosed root cause:** الـ `process-return.js` كان بـ يقرا `cfg.salesInvoices` و `cfg.salesCreditNotes` مباشرة. بعد V19.50 + V21.9.5 migrations الـ arrays دي مـ stripped → linkedInvoice = null → CN بـ items=[] → total=0.
**Attempted fix:** pre-read من split collections عبر `readSplitCollection`, idempotency check يشتغل صح, الـ CN يتكتب في day doc بـ نفس transaction.
**Why may still be unresolved:**
- Vercel deployment ممكن يكون لسه ما رفعش الـ latest serverless function code.
- الـ user ما اتـ trigger-ـش process-return بعد الـ fix.
**Next steps:**
1. تأكد إن آخر deploy على Vercel = V21.9.11 أو أحدث.
2. Test على طلب delivered → check إن الـ CN total = invoice total (مش 0).

---

### ⚠️ C4. Mark Delivered بـ ينتج فواتير duplicate

**Code-fix version:** V21.9.11
**Status:** ❌ Pending verification
**Symptom:** كل ضغطة Mark Delivered كانت تـ build invoice جديدة لنفس الطلب.
**Diagnosed root cause:** نفس C3 — الـ endpoint يقرا cfg.salesInvoices الفاضي بعد migration.
**Attempted fix:** pre-read invoices من salesInvoicesDays، الفاتورة الجديدة تتكتب في day doc atomically.
**Why may still be unresolved:**
- Vercel deployment.
- الـ user ما اتـ trigger-ـش Mark Delivered بعد الـ fix.
- الـ duplicate invoices الموجودة بالفعل لسه في الـ ledger.
**Next steps:**
1. تأكد deploy على Vercel.
2. Test على طلب جديد → click Mark Delivered → verify إن مفيش duplicate.
3. Cleanup للـ duplicates الموجودة (manual via Sales Invoices tab).

---

### ⚠️ C5. update-customer.js bumpContact race condition

**Code-fix version:** V21.9.11
**Status:** ❌ Pending verification (hard to reproduce — requires concurrent users)
**Symptom:** لو 2 admins ضغطوا 'Bulk WhatsApp' في نفس الوقت على نفس العميل، الـ contact_count بـ يـ race.
**Diagnosed root cause:** per-doc branch كان بـ يعمل read → spread → set بدون transaction.
**Attempted fix:** استخدام Firestore atomic `FieldValue.increment(1)` + `set(patch, {merge:true})`.
**Why may still be unresolved:**
- Hard to verify without concurrent test users.
- Vercel deployment status.
**Next steps:**
1. Verify الـ Vercel deploy.
2. Race condition test: 2 admins click bulk-WhatsApp simultaneously → verify final contact_count = 2 (not 1).

---

### ⚠️ C6. _progressTracker.js — pendingTimer overwrites final status

**Code-fix version:** V21.9.11
**Status:** ❌ Pending verification
**Symptom:** الـ progress overlay بـ يفضل عند 50% بدل ما يـ flip لـ "Done" بعد success.
**Diagnosed root cause:** الـ pendingTimer ما كانش بـ يـ check الـ cancelled flag.
**Attempted fix:** timer callback بقى يـ check cancelled، complete() بقت تـ flip cancelled قبل flushPending.
**Why may still be unresolved:**
- Vercel deployment.
- Hard to reproduce — only manifests on slow network with throttled writes.
**Next steps:**
1. Verify Vercel deploy.
2. Throttle network in DevTools (Slow 3G) + trigger a long sync → verify overlay completes 100%.

---

### ⚠️ C7. صور Shopify Push بـ تطلع "فشل تحميل"

**Code-fix version:** V21.9.12
**Status:** ❌ Reported still failing (depends on storage.rules deploy)
**Symptom:** كل صورة بـ تترفع للـ Shopify Push تظهر بـ "فشل تحميل" في الـ preview.
**Diagnosed root cause:** `compressImage()` بـ يـ return dataURL string. الكود كان بـ يعمل `new Blob([dataURLString])` اللي بـ يخزّن text بدل JPEG bytes. PLUS الـ storage.rules ما كانش فيها match clauses لـ `shopify-products/**`.
**Attempted fix:**
1. ضفت `dataUrlToBlob()` helper بـ يستخدم `fetch(dataUrl).blob()`.
2. أضفنا match clauses في `storage.rules`.
**Why may still be unresolved:**
- ⛔ **الـ storage.rules ما اتـ deploy-ـتش** (manual step — see §2.2).
- لو الـ rules ما اتـ publish-ـتش، الـ uploads هتفضل denied → الصورة فاضية → "فشل تحميل".
**Next steps:**
1. Deploy storage.rules حسب §2.2.
2. Test image upload في Push modal → verify الصورة تظهر بدل "فشل تحميل".

---

### ⚠️ C8. Storage rules ناقصة لـ shopify-products / whatsapp-campaigns paths

**Code-fix version:** V21.9.12
**Status:** ❌ Manual deploy ما اتعملش (see §2.2)
**Why still pending:** الـ rules في الـ repo updated لكن Firebase Console ما عندوش الـ new rules.
**Next steps:** §2.2 خطوة بخطوة.

---

## 4. Pending — High-priority bugs (code-fix attempted)

### ⚠️ H1. sync-historical-orders.js — audit trail clobber

**Code-fix version:** V21.9.11
**Status:** ❌ Pending verification
**Symptom:** local CLARK fields (delivered_by, invoice_no، إلخ) بـ تـ overwrite بـ undefined بعد historical sync.
**Attempted fix:** عكسنا الـ merge — prev كـ base + overlay لـ Shopify-owned fields فقط.
**Next steps:** Test على store عنده delivered orders → trigger historical sync → verify إن الـ delivered_by لسه موجود.

---

### ⚠️ H2. sync-customers metadata lies on partial failure

**Code-fix version:** V21.9.11
**Status:** ❌ Pending verification
**Symptom:** lo per-doc loop crashed، metadata يقول "1500 customer" لكن في الواقع 700.
**Attempted fix:** metadata write بعد per-doc writes تنجح.
**Next steps:** Hard to verify without forcing a partial failure. Defensive code — keep + verify on logs.

---

### ⚠️ H3. bulk-update-products silent delete failures

**Code-fix version:** V21.9.11
**Status:** ❌ Pending verification
**Attempted fix:** Track per-id failures + return `deleteFailures: ids[]`.
**Next steps:** Test bulk delete على store → verify الـ UI تعرض الـ failed IDs لو فيه.

---

### ⚠️ H4. Bosta undefined crash in historical sync

**Code-fix version:** V21.9.13
**Status:** ❌ Pending verification
**Symptom:** "Cannot use undefined as Firestore value" بـ يـ crash المزامنة شاملة.
**Attempted fix:**
1. `firestore().settings({ ignoreUndefinedProperties: true })` على Admin SDK init.
2. `if(bosta) merged.bosta = bosta;` (conditional assignment).
**Why may still be unresolved:** الزر اتـ delete في V21.9.13 (per user request). الـ trigger مش متاح ابتداءً.
**Next steps:** N/A — الـ button deleted، الـ fix preserved كـ defensive في الـ historical sync path.

---

### ⚠️ H5. Read-only safety on config stall

**Code-fix version:** V21.9.16
**Status:** ❌ Pending verification (hard to trigger)
**Attempted fix:** `forcedBypass` flag — upConfig يرفض writes في الـ state ده.
**Next steps:** Hard to reproduce — requires Firestore stall. Defensive code — verify on next stall incident.

---

### ⚠️ H6. shopifyPendingOrders — factory/config bloat

**Code-fix version:** V21.9.18
**Status:** ❌ **Migration ما اشتغلتش** (user-confirmed via diagnostics — shopifyOrdersDays = 0 docs)
**Symptom:** factory/config وصل 41% من 1 MB. الـ array `shopifyPendingOrders` = 283 KB.
**Attempted fix:** auto-migration على app load، blocking popup، split daily.
**Why still unresolved:**
- الـ migration ممكن بـ تفشل لأن الـ firestore.rules ما عندهاش match clause لـ `shopifyOrdersDays` (V21.9.19 ضافها لكن الـ rules ما اتـ deploy-ـتش).
- الـ user بلّغ إن الـ split ما اتعملش حتى بعد V21.9.18.
**Next steps:**
1. Deploy firestore.rules (§2.1) — يـ allow الـ shopifyOrdersDays writes.
2. Hard refresh الـ app.
3. الـ blocking popup المفروض يظهر مع 200 طلب.
4. لو ما ظهرش، open DevTools → console → check لـ [V21.9.19] logs أو errors.

---

### ⚠️ H7. WhatsApp image attachment regression on mobile

**Code-fix version:** V21.9.15
**Status:** ❌ Pending verification (mobile only)
**Symptom:** الـ image مش بـ تـ attach في WhatsApp share من الموبيل.
**Attempted fix:** prefetch الـ image Blob في useEffect لما الـ WA popup يفتح.
**Next steps:** Test على mobile (Chrome Android / Safari iOS) → click WhatsApp button → verify الـ image موجودة في الـ share sheet.

---

### ⚠️ H8. Push button event propagation bug

**Code-fix version:** V21.9.15
**Status:** ❌ Pending verification
**Symptom:** ضغطت Push على بطاقة → ما اتفتحش. ضغطت البطاقة → الـ Push popup فجأة فتح "جواها".
**Attempted fix:** ضفت modal renderer في الـ list-view branch.
**Next steps:** Test على orders list → click Push button on a card → verify الـ Push popup يفتح مباشرة بدون navigation.

---

## 5. Pending — Medium-priority bugs (code-fix attempted)

### ⚠️ M1. ReturnsTab approve-on-cancel

**Code-fix version:** V21.9.11
**Status:** ❌ Pending verification
**Attempted fix:** `if(!yes) return;` (any falsy = cancel).
**Next steps:** Test approve flow → click "لا" → verify mafeesh approval happened.

---

### ⚠️ M2. Bulk WhatsApp popup blocker

**Code-fix version:** V21.9.11
**Status:** ❌ Pending verification
**Attempted fix:** modal جديد بـ يـ render audience list بـ per-row "إرسال".
**Next steps:** Test bulk send → verify modal يظهر بدل bulk window.open.

---

### ⚠️ M3. Template literal misuse

**Code-fix version:** V21.9.11
**Status:** ❌ Pending verification (cosmetic — no functional impact)
**Attempted fix:** template literal proper.

---

### ⚠️ M4. discount-codes percentage validation

**Code-fix version:** V21.9.11
**Status:** ❌ Pending verification
**Attempted fix:** server-side check `if(value > 100) return 400`.
**Next steps:** Try create discount code بـ value > 100 → verify يـ get 400 error بدل Shopify upstream error.

---

### ⚠️ M5. HTTP error codes inconsistency

**Code-fix version:** V21.9.11
**Status:** ❌ Pending verification (observability only)
**Attempted fix:** distinguish 401/502/500/400.
**Next steps:** Check Vercel logs → verify الـ error codes صحيحة.

---

### ⚠️ M6. update-customer notFound silent skip

**Code-fix version:** V21.9.11
**Status:** ❌ Pending verification
**Attempted fix:** add `notFound: ids[]` في response.
**Next steps:** Test customer update بـ invalid ID → verify الـ response يـ include notFound.

---

## 6. Pending — لسه ما اتـ touch-ـش (acknowledged TODO)

### ⏳ P1. الـ endpoints المتبقية لـ shopifyPendingOrders split

**Status:** Acknowledged في V21.9.18 commit. Code-fix لـ 5 endpoints بس (mark-delivered, mark-refused, sync-orders-now, sync-customers, diagnostics).

**الـ endpoints اللي لسه بـ تقرأ legacy `cfg.shopifyPendingOrders`:**
- `api/shopify/process-return.js` — admin-rare
- `api/shopify/sync-historical-orders.js` — partial update only
- `api/shopify/return-request-create.js`
- `api/bosta/create-shipment.js`
- `api/bosta/print-awb.js`
- `api/bosta/sync-historical.js`
- `api/bosta/track.js`
- `api/bosta/webhook.js`
- `api/cron/shopify-poll-orders.js`
- `api/cron/shopify-cleanup-reservations.js`

**Risk:** post-migration، لو الـ user يـ trigger أي من الـ endpoints دي، هتـ get empty array → فشل صامت.
**Fix plan:** wrap كل endpoint بـ `readAllPendingOrders` + `upsertManyPendingOrders` من `_pendingOrders.js`.

---

### ⏳ P2. AccountingPg legacy refs

في `src/pages/AccountingPg.jsx` ممكن لسه فيه references لـ `data.shopifyPendingOrders` تحتاج verification بعد migration.

---

### ⏳ P3. Rules deployment automation

كل update لـ `firestore.rules` أو `storage.rules` بـ يحتاج manual deploy. Vercel ما بـ يـ deploy-هم.

**Fix plan:** GitHub Actions workflow بـ Firebase service account.

---

### ⏳ P4. ServiceWorker بـ يـ cache JS قديم

بعد كل deploy، الـ user يشوف الـ old version بسبب SW cache. workaround: hard-refresh (Ctrl+Shift+R).

**Fix plan:** versioned cache strategy في `public/sw.js`.

---

### ⏳ P5. Partitioned collections قد تـ stall على slow networks

`shopifyCustomersDocs` بـ يحتوي 1000+ docs. الـ initial subscribe بـ يـ take 5-15 seconds.

**Fix plan:** loading spinner specific للـ Shopify tabs.

---

### ⏳ P6. Duplicate entries من V21.9.14 ما اتنظفتش

الـ users اللي ضربتهم مشكلة الـ treasury duplicate قبل V21.9.14 لسه عندهم duplicates في الـ ledger.

**Fix plan:** maintenance endpoint بـ يـ scan الـ treasury + dedup عبر `transferId + type`.

---

## 7. Confirmed resolved (features visible + UX changes)

دي features visible في الـ UI — easier to confirm.

### ✅ F1. Per-color price field في Push modal (V21.9.12)

Each color عنده input سعر مخصص. **Visual:** افتح Push modal → في الـ Per-color section، تحت كل لون input للسعر.

### ✅ F2. Push button على بطاقة الـ order (V21.9.13)

زر Push على كل order card مع Shopify SVG icon. **Visual:** افتح Order Details → كل بطاقة عندها زر Push.

### ✅ F3. WhatsApp Composer + Bulk send modal (V21.9.8)

Modal احترافي للـ WhatsApp messages. **Visual:** افتح Shopify Customers → bulk action → Compose message.

### ✅ F4. Read-only forcedBypass mode (V21.9.16)

**Visual:** لو الـ config ما حملش، popup بـ "Continue read-only".

### ✅ F5. Transfers tab read-only (V21.9.17)

**Visual:** افتح Treasury → Transfers tab → مفيش "+ تحويل جديد" + مفيش edit/delete per row.

### ✅ F6. Daily split UI infrastructure (V21.9.18)

**Visual:** الـ helper موجود + الـ migration popup مع blocking flag. لكن الـ migration نفسها لسه ما اشتغلتش (see H6).

### ✅ F7. Blocking migration popup (V21.9.19)

**Visual:** عند الـ migration، popup ما يقدرش يـ close بـ click outside + لازم زر "تم".

---

## 8. بروتوكولات التعامل

### 8.1. Build → Test → Commit → Push → Zip → Deploy Rules

من CLAUDE.md §1 — بعد كل meaningful change:

```bash
# 1. Build
cd "C:\Users\Ahmed Samy\Desktop\clark-v21.9.10"
npm run build  # ✓ built in Xs, zero errors

# 2. Bump version في 3 أماكن
# - package.json
# - src/constants/index.js (APP_VERSION)
# - src/components/AboutVersionModal.jsx (CHANGELOG entry)

# 3. Copy modified files للـ git repo
REPO=/c/Users/Ahmed\ Samy/Documents/GitHub/clark-factory
SRC=/c/Users/Ahmed\ Samy/Desktop/clark-v21.9.10
cp "$SRC/path/to/file" "$REPO/path/to/file"

# 4. Stage ONLY changed files (NEVER git add .)
cd "$REPO" && git add file1 file2 ...

# 5. Commit مع V-tagged message + ROOT CAUSE explanation
git commit -m "V21.X.Y: Phase NN — short title

ROOT CAUSE: ...
FIX: ...
"

# 6. Push (Vercel auto-deploys)
git push origin main

# 7. Zip على Desktop
powershell -Command "... Compress-Archive ..."

# ⚠️ 8. STEP MANUAL: لو الـ change فيه rules:
# - Firestore: Firebase Console → Firestore → Rules → paste → Publish
# - Storage: Firebase Console → Storage → Rules → paste → Publish

# ⚠️ 9. STEP MANUAL: hard-refresh الـ app (Ctrl+Shift+R)
```

### 8.2. ROOT CAUSE comment على كل bug fix

```js
/* V21.9.X ROOT-CAUSE FIX:
   Pre-V21.9.X the code did X. The bug was that Y happened because Z.
   Fix: now we do W which prevents Z by ...
*/
```

### 8.3. Split collections للـ growing arrays

أي array بـ يكبر مع الوقت (entries dated) لازم يتـ split daily.

**Pattern:**
```
factory/config.<arrayName>          ← REMOVE (post-migration)
<arrayName>Days/{YYYY-MM-DD}        ← per-day docs
```

**Steps لإضافة split جديد:**
1. أضف الـ field لـ `SPLIT_COLLECTIONS` في `src/utils/splitCollections.js`
2. أضف `SPLIT_FIELDS_VXX` array + `SPLIT_FLAG_VXX` constant
3. أضف الـ flag للـ `stripSplitArrays`
4. أضف migration useEffect في App.jsx
5. أضف merge gating في data useMemo
6. **⚠️ CRITICAL: أضف match clause في `firestore.rules` للـ new collection**
7. Update server endpoints يستخدموا helper بدل cfg.array

### 8.4. Partitioned collections للـ master data

أي array من objects كبيرة بـ stable `.id` لازم يكون partitioned per-id.

**Pattern:**
```
factory/config.<arrayName>          ← REMOVE (post-migration)
<arrayName>Docs/{id}                ← one doc per entity
```

نفس الـ steps لكن في `partitionedCollections.js`. **+ match clause في rules**.

### 8.5. Server endpoints — best practices

من CLAUDE.md §9:
- Auth: `await verifyAdminToken(req.headers.authorization)`
- CORS: `setCors(res, req)` first, 204 على OPTIONS
- Body parse: handle string + object
- Errors: `{ ok:false, error:"<arabic>" }` بـ proper HTTP status
- Success: `{ ok:true, ...payload }`

### 8.6. User-gesture-required APIs

`window.open()`, `navigator.share()`, إلخ بـ يحتاجوا transient user activation. أي `await` قبلهم بـ يـ consume الـ activation.

**Pattern:**
```js
// ❌ غلط:
const handler = async () => {
  const yes = await ask(...);  // user activation consumed
  window.open(url);            // blocked
};

// ✅ صح:
const handler = async () => {
  const win = window.open("about:blank", "_blank");  // BEFORE any await
  const yes = await ask(...);
  if (yes && win) win.location.href = url;
  else if (win) win.close();
};
```

أو prefetch الـ data في useEffect لما الـ popup يفتح، الـ click handler يكون synchronous.

### 8.7. Critical writes — multi-layer protection

للـ financial data:
1. **Idempotency at action level** — function يـ return early لو الـ state موجود
2. **In-flight guard** — useRef مع Set
3. **Ledger-level dedup** — check قبل الـ unshift

### 8.8. Migration popup — blocking على success state

من V21.9.19:
- مفيش onClick على الـ backdrop
- مفيش auto-dismiss على success
- explicit dismiss button للـ success/error states

---

## 9. Anti-patterns — لا تكرر

من CLAUDE.md §10 + lessons learned:

- ❌ `window.open(url)` بعد `await` (popup blocker drops)
- ❌ `navigator.share({files})` بعد `await` (user activation gone)
- ❌ قراءة `cfg.salesInvoices` / `cfg.shopifyPendingOrders` / أي field split (stripped post-migration)
- ❌ كتابة `cfg.salesInvoices` (الـ stripping بـ يضيع الـ data)
- ❌ قراءة `cfg.orders` (الـ orders في `seasons/{season}/orders/`)
- ❌ قراءة `order.fabricA.colors` (الـ colors في `order.colorsA`)
- ❌ قراءة `order.sizes` (الـ sizes من `order.sizeSetId`)
- ❌ إضافة array جديد لـ `factory/config` بدون split/partition registration
- ❌ **إضافة collection جديدة بدون match clause في `firestore.rules`** (V21.9.19 lesson)
- ❌ **deployment يفترض الـ rules بـ يتـ deploy تلقائياً** — Vercel ما بـ يـ deploy-هم
- ❌ `git add .` أو `git add -A`
- ❌ `--no-verify` لـ skip hooks
- ❌ Force-push على main
- ❌ Commit secrets
- ❌ `_stableMatch` بدون status check للـ records (V21.9.14 lesson)
- ❌ Silent error swallowing بـ `.catch(() => {})` على bulk operations
- ❌ `merged.field = prev.field || o.field` لو الاتنين undefined ممكنين
- ❌ `tryAnyway()` بدون forcedBypass guard
- ❌ Modal renderer في branch واحد فقط
- ❌ Auto-dismiss على critical migration popup
- ❌ **Mark issue كـ resolved بدون end-to-end verification** (NEW lesson)

---

## 10. Engineering quality bar

من CLAUDE.md §0:

كل سطر كود يجب أن يكون:
- **Defensive** — يتعامل مع edge cases
- **Documented** — تعليقات تشرح "لماذا"
- **Tested** — على الأقل smoke-tested
- **Reversible** — مع backups + idempotent migrations

تعامل كأنك **Principal Engineer** بمستوى **Google, OpenAI, Microsoft**.

كل bug fix يجب أن يكون مصحوب بـ:
- **ROOT CAUSE comment**
- **Regression prevention** (defense in depth)
- **Anti-pattern note** في هذا الملف
- **⚠️ End-to-end verification** (NEW — لا تـ mark كـ resolved بدون verification)

---

## 11. Version history

كل version اتطبق على الـ codebase. الـ status هنا = الـ code committed. الـ user verification منفصل (see §3-§5).

| Version | Phase | Topic | Commit | Code status |
|---------|-------|-------|--------|-------------|
| V21.9.19 | 13a | Firestore rules + blocking popup | 2221bc3 | Code ready, **rules need manual deploy** |
| V21.9.18 | 13 | shopifyPendingOrders daily split | a79715f | Code ready, **migration needs rules deploy first** |
| V21.9.17 | 12c | Transfers tab read-only | 991388f | ✅ UI visible |
| V21.9.16 | 12b | Read-only safety on config stall | 598bca3 | Code ready, hard to verify |
| V21.9.15 | 12a | Push button + WhatsApp image | 0b741e6 | Pending mobile verification |
| V21.9.14 | 12 | Treasury duplicate fix | 115f8b0 | Reported still failing |
| V21.9.13 | 11s | Push button + bidirectional sync | a7bc248 | ✅ UI visible (Push button) |
| V21.9.12 | 11r | Shopify Push image + per-color price | 3f6c843 | Code ready, **storage rules need deploy** |
| V21.9.11 | 11q | Shopify Audit (critical fixes) | 722ad65 | Pending verification (multiple) |

---

## 12. للـ next engineer

لو لقيت مشكلة جديدة:

1. **Investigate root cause** (ليه حصلت، مش بس إيه الـ symptom)
2. **Fix مع ROOT CAUSE comment**
3. **Add to this log** في الـ section المناسب (Pending verification OR Confirmed)
4. **Update CLAUDE.md §10** لو الـ anti-pattern جديد
5. **Build → Test → Commit → Push → Zip**
6. **⚠️ Deploy rules manually لو الـ change فيها rules**
7. **⚠️ Get user verification قبل ما تـ mark resolved**

**Reality check:** الـ list في §3-§5 طويلة لأن الـ verification لازم تـ happen end-to-end على production مع الـ user. كل issue هنا له commit + version، لكن الـ "fix in code" ≠ "issue resolved for user". الـ gap بـ يكون:
- Rules deployment (Firestore + Storage)
- Hard refresh (SW cache)
- Vercel deployment status
- Edge cases not covered by initial diagnosis
