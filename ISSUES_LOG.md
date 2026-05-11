# CLARK — سجل المشاكل والحلول والبروتوكولات

> **آخر تحديث:** V21.9.19 — 2026-05-11
>
> ده الملف الرسمي اللي بـ يـ track كل الـ bugs اللي ظهرت في الـ system،
> الحلول اللي اتطبقت، الـ root causes، والبروتوكولات اللي لازم تتطبق
> عشان مايتـ repeat-وش تاني.

---

## جدول المحتويات

1. [Critical bugs — اتحلت](#1-critical-bugs--اتحلت)
2. [High-priority bugs — اتحلت](#2-high-priority-bugs--اتحلت)
3. [Medium-priority bugs — اتحلت](#3-medium-priority-bugs--اتحلت)
4. [Features أُضيفت](#4-features-أُضيفت)
5. [Pending issues — لسه ما اتحلتش](#5-pending-issues--لسه-ما-اتحلتش)
6. [Manual deployment steps (مطلوبة مرة واحدة بعد كل release)](#6-manual-deployment-steps)
7. [بروتوكولات التعامل](#7-بروتوكولات-التعامل)
8. [Anti-patterns — لا تكرر](#8-anti-patterns--لا-تكرر)

---

## 1. Critical bugs — اتحلت

كل bug هنا كان بـ يـ cause data loss، financial errors، أو silent corruption.

### 🚨 C1. عملاء + منتجات Shopify بـ يختفوا بعد كل refresh

**Version fixed:** V21.9.19
**Symptom:** الـ user يـ sync customers + products يشوفهم → refresh → يلاقيهم اختفوا → يـ re-sync كل مرة
**Root cause:** الـ `firestore.rules` ما عندهاش match clauses لـ `shopifyCustomersDocs`, `shopifyProductsDocs`, `shopifyOrdersDays`، إلخ. الـ catch-all `if false` بـ يمنع الـ client listeners من الـ subscription. الـ server (admin SDK) بـ يـ bypass الـ rules فالـ writes بـ تنجح لكن الـ reads على الـ client denied.
**Fix:** أضفنا match clauses لكل الـ collections الناقصة + توثيق خطوة الـ manual deploy.
**Files:** `firestore.rules`

---

### 🚨 C2. الـ Treasury — تأكيد التحويل بـ يـ revert + entries بـ تتكرر

**Version fixed:** V21.9.14
**Symptom:** الـ admin يضغط 'تأكيد' على تحويل، يـ disappear popup، يرجع pending بعد refresh، يضغط تأكيد تاني → دفعة 3,800 ج.م ظهرت مرتين.
**Root cause:** `_stableMatch` في App.jsx (line 2944) كانت بـ تـ compare treasury-row fields (type/category/account/desc) — كلها undefined على transfer records. فلما الـ status flip من pending→confirmed، الـ function بـ تقول 'matched' وتـ delete الـ optimistic state قبل ما الـ server write يخلص.
**Fix (3 طبقات حماية):**
1. ضفت `status`, `fromAccount`, `toAccount`, `approvedBy`, `approvedAt` للـ `_stableMatch`
2. In-flight guard بـ ref على approve/reject buttons
3. Ledger-level idempotency check قبل ما نـ unshift أي leg
**Files:** `src/App.jsx`, `src/pages/TreasuryPg.jsx`

---

### 🚨 C3. Process Return بـ ينتج credit notes بـ صفر جنيه

**Version fixed:** V21.9.11
**Symptom:** الـ user يـ click 'Process Return' على طلب delivered → credit note يتعمل لكن total = 0 → revenue/return reconciliation breakage.
**Root cause:** الـ endpoint `process-return.js` كان بـ يقرا `cfg.salesInvoices` و `cfg.salesCreditNotes` مباشرة. بعد V19.50 + V21.9.5 migrations الـ arrays دي اتـ stripped من factory/config — البيانات في `salesInvoicesDays`/`salesCreditNotesDays`. الـ legacy read returned [] → linkedInvoice = null → items=[] → total=0. والـ CN الجديد كان يتكتب في cfg.salesCreditNotes اللي بـ يتشال على next client load → CN يضيع.
**Fix:** pre-read من split collections (`readSplitCollection`), idempotency check يشتغل صح, الـ CN الجديد يتكتب في day doc بـ نفس transaction.
**Files:** `api/shopify/process-return.js`

---

### 🚨 C4. Mark Delivered بـ ينتج فواتير duplicate

**Version fixed:** V21.9.11
**Symptom:** كل ضغطة Mark Delivered كانت تـ build invoice جديدة لنفس الطلب. الـ idempotency check ما يلاقيش حاجة (cfg.salesInvoices فاضي بعد migration) فيـ build new دايماً.
**Root cause:** نفس المشكلة المعمارية في C3 — الـ endpoint يقرا cfg.salesInvoices اللي بقى empty بعد V19.50 migration.
**Fix:** نفس approach — pre-read invoices من salesInvoicesDays، الفاتورة الجديدة تتكتب في day doc atomically.
**Files:** `api/shopify/mark-delivered.js`

---

### 🚨 C5. update-customer.js bumpContact race condition

**Version fixed:** V21.9.11
**Symptom:** لو 2 admins ضغطوا 'Bulk WhatsApp' في نفس الوقت على نفس العميل، الـ contact_count بـ يـ race: A تقرا 5، B تقرا 5، الاتنين يكتبوا 6 (المفروض 7).
**Root cause:** الـ per-doc branch كان بـ يعمل read → spread merge → set بدون transaction. الـ spread `...docSnap.data()` كمان كان يـ clobber الـ partitioner-derived fields (tier).
**Fix:** استخدام Firestore atomic `FieldValue.increment(1)` (race-free) + استبدال spread بـ `set(patch, {merge:true})`.
**Files:** `api/shopify/update-customer.js`

---

### 🚨 C6. _progressTracker.js — pendingTimer overwrites final status

**Version fixed:** V21.9.11
**Symptom:** الـ progress overlay بـ يفضل عند 50% بدل ما يتـ flip لـ "Done" بعد success.
**Root cause:** الـ pendingTimer (setTimeout للـ throttled writes) ما كانش بـ يـ check الـ cancelled flag. complete() اتنادى → بعدها الـ timer fire → كتب stale data over الـ done state.
**Fix:** timer callback بقى يـ check cancelled، complete() بقت تـ flip cancelled قبل flushPending، pendingUpdate يتمسح في complete(). كمان لو 3 silent write failures، تـ console.warn.
**Files:** `api/_progressTracker.js`

---

### 🚨 C7. صور Shopify Push بـ تطلع "فشل تحميل"

**Version fixed:** V21.9.12
**Symptom:** كل صورة بـ تترفع للـ Shopify Push تظهر بـ "فشل تحميل" في الـ preview، وفي Shopify مفيش صورة.
**Root cause:** `compressImage()` في utils/image.js بـ ترجّع dataURL string (canvas.toDataURL). الكود كان بـ يعمل `new Blob([dataURLString])` اللي بـ يخزّن الـ string نفسها كـ Blob — الـ Firebase بـ يقبل الـ upload (Content-Type forced لـ image/jpeg) لكن الـ stored bytes نص مش JPEG. الـ `<img>` بـ يفشل في rendering.
**Fix:** ضفت `dataUrlToBlob()` helper بـ يستخدم `fetch(dataUrl).blob()` لتحويل صح. ShopifyPushModal + WhatsAppComposer دلوقتي بـ يستخدموا الـ helper + force content-type 'image/jpeg' + رفض الـ empty Blobs.
**Files:** `src/utils/image.js`, `src/components/ShopifyPushModal.jsx`, `src/components/WhatsAppComposer.jsx`

---

### 🚨 C8. Storage rules denying shopify-products + whatsapp-campaigns paths

**Version fixed:** V21.9.12
**Symptom:** الـ image uploads للـ Shopify push بـ تفشل بـ "User does not have permission" حتى للأدمن.
**Root cause:** الـ `storage.rules` كان فيها match clauses لـ paths القديمة (orders, invoices, etc.) بس. الـ `shopify-products/**` و `whatsapp-campaigns/**` ما كانوش متغطّيين فبـ يقعوا في الـ catch-all deny.
**Fix:** أضفنا match clauses للـ paths دي. **مطلوب manual deploy** عبر Firebase Console.
**Files:** `storage.rules`

---

## 2. High-priority bugs — اتحلت

### 🔴 H1. sync-historical-orders.js — audit trail clobber

**Version fixed:** V21.9.11
**Symptom:** local CLARK fields (delivered_by, refused_by, invoice_no, return_credit_note_no، إلخ) بـ تـ overwrite بـ undefined بعد كل historical sync.
**Root cause:** الـ merge كان بـ يـ spread Shopify's فريش order كـ base ويـ overwrite بس fields من allowlist محدودة. أي field خارج allowlist بـ يتـ overwrite.
**Fix:** عكس الـ pattern — prev كـ base + overlay لـ Shopify-owned fields فقط (line items, totals, customer info, fulfillment).
**Files:** `api/shopify/sync-historical-orders.js`

---

### 🔴 H2. sync-customers metadata lies on partial failure

**Version fixed:** V21.9.11
**Symptom:** lo الـ per-doc loop crashed/timed out في النص: metadata يقول 'sync count = 1500' لكن في الواقع 700 doc بس اتكتبت.
**Fix:** داخل الـ tx بنكتب `last_customers_sync_started_at` بس. الـ authoritative timestamp + counts بـ يتكتبوا بعد per-doc writes تنجح.
**Files:** `api/shopify/sync-customers.js`

---

### 🔴 H3. bulk-update-products silent delete failures

**Version fixed:** V21.9.11
**Symptom:** الـ delete loop كان بـ يـ swallow errors بـ `.catch(() => {})`. الـ blacklist (committed في tx) ممكن يكون فيه IDs لمنتجات لسه موجودة.
**Fix:** track per-id failures + return `deleteFailures: ids[]` في response.
**Files:** `api/shopify/bulk-update-products.js`

---

### 🔴 H4. Bosta undefined crash in historical sync

**Version fixed:** V21.9.13
**Symptom:** "Cannot use 'undefined' as a Firestore value (found in field 'shopifyPendingOrders.0.bosta')" بـ يـ crash الـ مزامنة شاملة.
**Root cause:** الـ merge كان بـ يعمل `merged.bosta = prev.bosta || o.bosta;` — لو الاتنين undefined → النتيجة undefined → Firestore strict mode رفض.
**Fix (طبقتين):**
1. defense in depth: ضفت `firestore().settings({ ignoreUndefinedProperties: true })` في `_firebase.js` على Admin SDK init
2. specific fix: `if(bosta) merged.bosta = bosta;` (conditional assignment)
**Files:** `api/_firebase.js`, `api/shopify/sync-historical-orders.js`

---

### 🔴 H5. Read-only safety on config stall

**Version fixed:** V21.9.16
**Symptom:** الـ "متابعة على مسؤوليتي" button في الـ loading-stall popup كان بـ يـ bypass الـ safety guard، وأي save بعدها كان بـ يكتب INIT_CONFIG (الـ defaults الفاضية) على factory/config → wipe كل الـ customers/suppliers/workshops.
**Fix:** ضفت `forcedBypass` flag — الـ upConfig بقى يرفض writes في الـ state ده. الـ user يقدر يـ view الـ cached data بأمان. الـ flag يتـ clear تلقائياً لما الـ real listener يـ fire.
**Files:** `src/App.jsx`

---

### 🔴 H6. shopifyPendingOrders — factory/config bloat

**Version fixed:** V21.9.18
**Symptom:** factory/config وصل 41% من الـ 1 MB limit. الـ array `shopifyPendingOrders` كان 284 KB = 67% من الـ doc.
**Fix:** auto-migration بـ تـ split الـ array لـ `shopifyOrdersDays/{YYYY-MM-DD}` per-day docs. helper جديد `_pendingOrders.js`. update for main endpoints (mark-delivered, mark-refused, sync-orders-now, sync-customers, diagnostics).
**Files:** `src/utils/splitCollections.js`, `src/App.jsx`, `api/shopify/_pendingOrders.js`, مع 5 endpoints update

---

### 🔴 H7. WhatsApp image attachment regression on mobile

**Version fixed:** V21.9.15
**Symptom:** كانت تعمل share مع الصورة من الموبيل، بقت من غير صورة.
**Root cause:** `navigator.share` مع files بـ يـ require transient user activation. الكود كان بـ يعمل `await fetch(image)` قبل `navigator.share()` — أول await consumed الـ activation → Chrome رفض الـ share بصمت → fallback openWA() بدون صورة.
**Fix:** prefetch الصورة في useEffect لما الـ WA popup يفتح. لما الـ user يضغط option، الـ Blob جاهز → navigator.share synchronous بدون await قبلها.
**Files:** `src/pages/DetPg.jsx`

---

### 🔴 H8. Push button event propagation bug

**Version fixed:** V21.9.15
**Symptom:** ضغطت Push على بطاقة الـ order → ما اتفتحش. ضغطت البطاقة → الـ Push popup فجأة فتح "جواها".
**Root cause:** الـ `pushModalOrder` state اتـ set صح، لكن الـ `<ShopifyPushModal>` renderer كان متحط في الـ detail-view branch بس. الـ list-view branch ما كانش فيه renderer → الـ state اتـ set لكن مفيش modal بـ يـ render.
**Fix:** ضفت الـ modal renderer في الـ list-view branch (نفس الـ pattern اللي اتعمل قبل مع `StageProgressModal` في V19.16).
**Files:** `src/pages/DetPg.jsx`

---

## 3. Medium-priority bugs — اتحلت

### 🟡 M1. ReturnsTab approve-on-cancel

**Version fixed:** V21.9.11
**Symptom:** `if(yes === null || yes === undefined) return;` — `false` (الـ user ضغط "لا") كانت بـ تـ fall through وتـ approve الـ return بـ Bosta.
**Fix:** `if(!yes) return;` — أي falsy value (false / null / undefined) تـ cancel.

---

### 🟡 M2. Bulk WhatsApp popup blocker

**Version fixed:** V21.9.11
**Root cause:** `await ask(...)` ثم `window.open()` في loop — الـ browsers بـ تـ consume الـ user gesture مع أول await → 99% من الـ tabs blocked.
**Fix:** modal جديد بـ يـ render audience list مع زر "إرسال" لكل صف — كل ضغطة fresh gesture.

---

### 🟡 M3. Template literal misuse

**Version fixed:** V21.9.11
**Issue:** `'اتبعت ${customer.contact_count} رسالة'.replace('${customer.contact_count}', customer.contact_count)` — Pattern غريب (string + replace بدل template literal).
**Fix:** template literal: `` `اتبعت ${customer.contact_count} رسالة...` ``.

---

### 🟡 M4. discount-codes percentage validation

**Version fixed:** V21.9.11
**Issue:** ما كانش فيه server-side check إن percentage value ≤ 100.
**Fix:** ضفت `if(type === "percentage" && value > 100) return 400`. كمان شيلنا duplicated ternary `type === 'percentage' ? -Math.abs : -Math.abs` (الـ branches متطابقة).

---

### 🟡 M5. HTTP error codes inconsistency

**Version fixed:** V21.9.11
**Issue:** `connect.js` كان بـ يرجّع 400 لـ Shopify failures (المفروض 502 حسب CLAUDE.md §9).
**Fix:** distinguish بين auth (401), upstream (502), client (400), server (500).

---

### 🟡 M6. update-customer notFound silent skip

**Version fixed:** V21.9.11
**Issue:** الـ per-doc branch كان بـ يـ continue silently على missing customer، يـ return {ok:true, updated:0}، UI تعرض "✅ تم".
**Fix:** add `notFound: ids[]` في response.

---

## 4. Features أُضيفت

### ✨ F1. Per-color price field في Push modal

**Version:** V21.9.12
**Description:** لكل لون input سعر مخصص. فاضي = استخدم سعر البيع الافتراضي. > 0 = override.

### ✨ F2. Push button على بطاقة الـ order

**Version:** V21.9.13
**Description:**
- زر Push على كل order card مع Shopify SVG icon
- "Pushed" + ✓ badge لو متزامن
- Bidirectional sync — لو المنتج اتـ delete من Shopify، الـ modal بـ يكتشف ويـ unmark.

### ✨ F3. WhatsApp Composer + Bulk send

**Version:** V21.9.8
**Description:** modal احترافي للـ WhatsApp messages: emoji picker, image upload لـ Firebase Storage, variable substitution {name}, {phone}, إلخ.

### ✨ F4. Read-only forcedBypass mode

**Version:** V21.9.16
**Description:** لما الـ user يضغط "متابعة على مسؤوليتي" والـ config مش loaded، الـ app يدخل في read-only mode تلقائياً. الـ writes كلها بـ تتـ block. الـ flag يتـ clear لما الـ listener يـ fire.

### ✨ F5. Transfers tab read-only

**Version:** V21.9.17
**Description:** تاب التحويلات في الخزنة بقى للقراءة فقط. الإنشاء/التعديل/الحذف بقى من تاب "حركات الخزنة". Compact rows.

### ✨ F6. Daily split for shopifyPendingOrders

**Version:** V21.9.18
**Description:** factory/config ينزل من 419 KB لـ ~135 KB. الـ orders بقى في `shopifyOrdersDays/{YYYY-MM-DD}` — مفيش 1 MB ceiling.

### ✨ F7. Blocking migration popup

**Version:** V21.9.19
**Description:** الـ migrations دلوقتي بـ تـ show blocking popup لا يقدر يـ close بـ click outside. مفيش auto-dismiss على success — الـ user لازم يضغط "تم".

---

## 5. Pending issues — لسه ما اتحلتش

### ⏳ P1. الـ endpoints المتبقية لـ shopifyPendingOrders split (V21.9.18 follow-up)

الـ endpoints دي لسه بـ تقرأ `cfg.shopifyPendingOrders` مباشرة:
- `api/shopify/process-return.js` — admin-rare action
- `api/shopify/sync-historical-orders.js` — partial update done
- `api/shopify/return-request-create.js`
- `api/bosta/create-shipment.js`
- `api/bosta/print-awb.js`
- `api/bosta/sync-historical.js`
- `api/bosta/track.js`
- `api/bosta/webhook.js`
- `api/cron/shopify-poll-orders.js`
- `api/cron/shopify-cleanup-reservations.js`

**Risk:** post-V21.9.18 migration، لو الـ user يـ trigger أي من الـ endpoints دي، هتـ get empty array → فشل silent.
**Workaround مؤقت:** الـ user يـ avoid الـ flows دي حتى الـ follow-up.
**Fix plan:** wrap كل endpoint بـ `readAllPendingOrders` + `upsertManyPendingOrders` من `_pendingOrders.js` helper.

---

### ⏳ P2. الـ pre-V21.9.18 endpoint stragglers في الـ AccountingPg

في `src/pages/AccountingPg.jsx` ممكن لسه فيه references لـ `data.shopifyPendingOrders` تحتاج verification بعد migration.

---

### ⏳ P3. الـ rules deployment automation

كل update لـ `firestore.rules` أو `storage.rules` بـ يحتاج manual deploy عبر Firebase Console. Vercel ما بـ يـ deploy-هم تلقائياً.

**Workaround مؤقت:** documentation في الـ changelog + هذا الملف.
**Fix plan:** ضبط GitHub Actions workflow بـ Firebase service account.

---

### ⏳ P4. ServiceWorker قد يـ cache الـ JS القديم

بعد كل deploy، الـ user أحياناً يشوف الـ old version بسبب SW cache. الـ workaround الحالي: hard-refresh (Ctrl+Shift+R).

**Fix plan:** versioned cache strategy في `public/sw.js`.

---

### ⏳ P5. بعض الـ partitioned collections قد تـ stall على slow networks

`shopifyCustomersDocs` بـ يـ contain 1000+ docs. على slow networks، الـ initial subscribe بـ يـ take 5-15 seconds. خلال الوقت ده الـ UI بـ يـ show empty state.

**Fix plan:** loading spinner specific للـ Shopify tabs بدل ما يظهر "0 customers".

---

### ⏳ P6. duplicate entries من V21.9.14 ما اتنظفتش

الـ users اللي ضربتهم مشكلة الـ treasury duplicate قبل V21.9.14 لسه عندهم duplicate entries في الـ ledger. الـ fix بـ يمنع duplicates جديدة بس.

**Fix plan:** maintenance endpoint بـ يـ scan الـ treasury + dedup الـ entries اللي عندها نفس `transferId` و `type`.

---

## 6. Manual deployment steps

بعد كل release، فيه خطوات يدوية لازم تتعمل **مرة واحدة فقط** على Firebase Console:

### 6.1. Firestore Rules

1. افتح https://console.firebase.google.com
2. اختار project `clark-factory` (أو حسب الـ name عندك)
3. **Build → Firestore Database → Rules tab**
4. افتح `firestore.rules` من الـ repo (root)
5. الصق **كل المحتوى** في الـ Console editor (replace existing)
6. اضغط **Publish**

⚠️ **مطلوب بعد:** V21.9.19 (أضاف match clauses لكل الـ collections الناقصة)

### 6.2. Storage Rules

1. نفس الـ Console
2. **Build → Storage → Rules tab**
3. الصق محتوى `storage.rules` → Publish

⚠️ **مطلوب بعد:** V21.9.12 (أضاف paths لـ `shopify-products/**`, `whatsapp-campaigns/**`)

### 6.3. Migrations الـ auto-run

دي بـ تشتغل تلقائياً أول ما الـ user يفتح الـ app بعد upgrade:
- **V21.9.5** — credit/debit notes daily split
- **V21.9.7** — Shopify return requests daily split
- **V21.9.8** — WhatsApp campaigns daily split
- **V21.9.18** — shopifyPendingOrders daily split (مع blocking popup)

⚠️ لازم الـ Firestore rules تكون deployed قبل الـ migrations — وإلا الـ writes هـ تـ deny silently.

---

## 7. بروتوكولات التعامل

### 7.1. Build → Test → Commit → Push → Zip

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

# 6. Push
git push origin main  # Vercel auto-deploys

# 7. Zip على Desktop
powershell -Command "... Compress-Archive ..."
```

### 7.2. ROOT CAUSE comment على كل bug fix

كل bug fix لازم يكون مصحوب بـ comment يشرح:

```js
/* V21.9.X ROOT-CAUSE FIX:
   Pre-V21.9.X the code did X. The bug was that Y happened because Z.
   Fix: now we do W which prevents Z by ...
*/
```

ده ضامن إن:
- الـ next engineer ما يـ revert الـ fix بالغلط
- الـ pattern يتـ document
- الـ root cause مش الـ symptom هو اللي اتـ fixed

### 7.3. Split collections للـ growing arrays

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
6. **أضف match clause في `firestore.rules` للـ new collection**
7. Update server endpoints يستخدموا helper بدل cfg.array

### 7.4. Partitioned collections للـ master data

أي array من objects كبيرة بـ stable `.id` (customers, suppliers, products, etc) لازم يكون partitioned per-id.

**Pattern:**
```
factory/config.<arrayName>          ← REMOVE (post-migration)
<arrayName>Docs/{id}                ← one doc per entity
```

نفس الـ steps لكن في `partitionedCollections.js`.

### 7.5. Server endpoints — best practices

من CLAUDE.md §9:
- Auth: `await verifyAdminToken(req.headers.authorization)`
- CORS: `setCors(res, req)` first, 204 على OPTIONS
- Body parse: handle string + object
- Errors: `{ ok:false, error:"<arabic>" }` بـ proper HTTP status
- Success: `{ ok:true, ...payload }`

### 7.6. User-gesture-required APIs

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

أو الـ patern اللي طبقناه في V21.9.15 لـ navigator.share: prefetch الـ data في useEffect لما الـ popup يفتح، الـ click handler يكون synchronous.

### 7.7. Critical writes — multi-layer protection

للـ financial data (treasury, invoices, ledgers):
1. **Idempotency at action level** — function يـ return early لو الـ state موجود
2. **In-flight guard** — useRef مع Set من ids بـ تشتغل عليها
3. **Ledger-level dedup** — check قبل الـ unshift إن الـ entry مش موجود

شوف V21.9.14 treasury fix كـ مثال.

### 7.8. Migration popup — blocking على success state

اللي اتطبق في V21.9.19:
- مفيش onClick على الـ backdrop → ما يقدرش يـ close بـ click outside
- مفيش auto-dismiss على success → الـ user لازم يضغط "تم"
- الـ success/error states بـ يـ show explicit dismiss button

ده الـ pattern للـ critical migrations الـ user لازم يـ acknowledge.

---

## 8. Anti-patterns — لا تكرر

من CLAUDE.md §10 + الـ lessons learned:

- ❌ `window.open(url)` بعد `await` (popup blocker drops)
- ❌ `navigator.share({files})` بعد `await` (user activation gone)
- ❌ قراءة `cfg.salesInvoices` / `cfg.shopifyPendingOrders` / أي field split (الـ array stripped post-migration)
- ❌ كتابة `cfg.salesInvoices` (الـ stripping بـ يضيع الـ data)
- ❌ قراءة `cfg.orders` (الـ orders في `seasons/{season}/orders/`)
- ❌ قراءة `order.fabricA.colors` (الـ colors في `order.colorsA`)
- ❌ قراءة `order.sizes` (الـ sizes من `order.sizeSetId` → `data.sizeSets`)
- ❌ إضافة array جديد لـ `factory/config` بدون registration في `SPLIT_COLLECTIONS` أو `PARTITIONED_COLLECTIONS`
- ❌ إضافة collection جديدة بدون match clause في `firestore.rules`
- ❌ `git add .` أو `git add -A` (دايماً stage specific files)
- ❌ `--no-verify` لـ skip hooks
- ❌ Force-push على main
- ❌ Commit الـ secrets (shpat_, shpss_, atkn_ tokens, .env files)
- ❌ `_stableMatch` بدون status check للـ records اللي بـ تـ change state (V21.9.14 lesson)
- ❌ silent error swallowing بـ `.catch(() => {})` على bulk operations (V21.9.11 lesson)
- ❌ `merged.field = prev.field || o.field` لو الاتنين undefined ممكنين (V21.9.13 lesson — Firestore strict mode)
- ❌ `tryAnyway()` بدون forcedBypass guard لما config مش loaded (V21.9.16 lesson)
- ❌ Modal renderer في branch واحد فقط (V19.16 + V21.9.15 lesson)
- ❌ auto-dismiss على critical migration popup (V21.9.19 lesson)

---

## 9. Engineering quality bar

من CLAUDE.md §0:

كل سطر كود يجب أن يكون:
- **Defensive** — يتعامل مع edge cases
- **Documented** — تعليقات تشرح "لماذا" مش "كيف"
- **Tested** — على الأقل smoke-tested قبل deploy
- **Reversible** — مع backups + idempotent migrations حيث أمكن

تعامل دائماً كأنك **Principal Engineer** بمستوى **Google, OpenAI, Microsoft**. كل bug fix يجب أن يكون مصحوب بـ:
- **ROOT CAUSE comment** يشرح الـ bug
- **Regression prevention** (defense in depth)
- **Anti-pattern note** في الملف ده + CLAUDE.md §10 لو ضروري

---

## 10. Last updated

- **V21.9.19** — Firestore rules + blocking migration popup (المشاكل الـ data disappearing root cause)
- **V21.9.18** — shopifyPendingOrders daily split (factory/config bloat fix)
- **V21.9.17** — Transfers tab read-only + compact rows
- **V21.9.16** — Read-only safety on config stall + storage error UX
- **V21.9.15** — Push button works + WhatsApp image attaches
- **V21.9.14** — Treasury critical fix (duplicate transfers + revert-after-approve)
- **V21.9.13** — Push button on cards + bidirectional sync
- **V21.9.12** — Shopify Push image upload + per-color price
- **V21.9.11** — Shopify Audit Phase 11q (critical fixes)

---

**ملاحظة للـ next engineer:**
لو لقيت مشكلة جديدة، اتبع الـ pattern:
1. Investigate root cause (ليه حصلت، مش بس إيه الـ symptom)
2. Fix مع ROOT CAUSE comment
3. Add to this log
4. Update CLAUDE.md §10 لو الـ anti-pattern جديد
5. Build → Test → Commit → Push → Zip
