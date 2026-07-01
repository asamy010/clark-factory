# CLARK — فحص شامل للتطبيق (Data-Flow & حفظ البيانات)

**التاريخ:** 2026-07-01 · **النسخة المفحوصة:** V21.27.213 · **الفرع:** `claude/clark-app-audit-4nqj9k`

**Baseline:** build ✓ · 531/531 اختبار ✓ · emulator 3/3 ✓ · النسخة متطابقة في 4 أماكن ✓.

الفحص اتعمل على 5 محاور بالتوازي (طبقة الحفظ المركزية · الخزنة/المحاسبة ·
المبيعات/المشتريات/المخزون · rules+API · نمو مصفوفات config)، وكل نتيجة حرجة
اتأكدت بقراءة الكود الفعلي (مش تخمين).

---

## 🔴 CRITICAL (3)

### C1 — خصم/فحص المخزون في إنشاء الأوردر بيشتغل على config مقصوص → no-op صامت
**`src/App.jsx:5673,5696,5844,5892` + `src/utils/orders.js:364-516`**

`addOrder`/`replaceOrder` بيعملوا `checkStockAvailability(o,cfg)` و
`deductStockForOrder(nextCfg,o)` جوه `runTransaction` حيث `cfg = snap.data()`
= **factory/config الخام من السيرفر**. بعد migrations V19.52/V19.57، `fabrics`/
`accessories` (partitioned) و`stockMovements` (split) **مش موجودين في الدوك ده**.
النتيجة (مع تفعيل الخصم التلقائي عند القص):
- إعادة فحص النقص على السيرفر (TOCTOU) **بتعدّي دايمًا** (`[].find → undefined`).
- الخصم/الاسترجاع **مش بيعدّل أي مخزون فعلي** ولا بيسجّل حركة `cut`.
- لكن `order._stockDeducted` بيتختم (orders.js:515) → الأوردر **بيدّعي** إنه خصم
  مخزون → التقارير والتقييمات و`delOrder` refund بيشتغلوا على معلومة وهمية.
- `orders.js:436` بيرجّع `stockMovements:[]` لـ factory/config عبر
  `tx.set(configRef,nextCfg)` — بيتجاوز `stripSplitArrays`.

**Root cause:** الترانزاكشنات دي اتكتبت قبل الـ split واتنستوا وقت الترحيل. لازم
الخصم يترحّل لطبقة `upConfig` المائيّة (applyStockDelta) أو يقرأ `fabricsDocs`/
`accessoriesDocs` صراحةً. **قرار مطلوب:** هل ميزة الخصم عند القص مفروض شغّالة أصلًا؟

### C2 — إلغاء مرتجع التوزيعة بيدوّر على الأوردرات في `d.orders` (فاضية جوه upConfig)
**`src/utils/sales/salesOrders.js:946` (cancelReturnMutator kind="dist") · call `src/pages/CustDeliverPg.jsx:1061`**

الأوردرات في `seasons/{seasonId}/orders` مش في config (§3/§14.1). داخل `upConfig`
الـ draft مبنيّ من config + الحقول المائيّة بس — **مفيهوش أوردرات الموسم**.
`generateSalesOrdersFromSessionMutator` اتصلّح لنفس المشكلة في V21.21.13 بتمرير
`ctx.orders`، لكن `cancelReturnMutator` (V21.27.101) بيقرأ `(d.orders||[]).find`
من غير ctx.

**سيناريو:** المستخدم يضغط «↩️ إلغاء» على مرتجع توزيعة → `d.orders` فاضية →
`{ok:false,error:"المرتجع غير موجود"}` → toast «⛔ المرتجع غير موجود». **الميزة
ميتة**. والأسوأ: لو نسخة legacy من `cfg.orders` باقية → بيلاقي نسخة قديمة،
يعدّلها ويكتبها في config (bloat §10)، يبلّغ نجاح، يعكس الإشعار الدائن والـ GL
بينما المرتجع الحقيقي في الموسم فاضل → **desync دائم**.
*(الاختبار `returnFromDirectSO.test.js:311` بيبني `d={orders:[...]}` فبيخفي المشكلة.)*

### C3 — نفس الـ bug في حذف/إلغاء إشعار دائن مرتبط بمرتجع توزيعة
**`src/utils/sales/salesOrders.js:1002` (removeOperationalReturnForCreditNote) · `src/pages/CreditNotesPg.jsx:209,219`**

نفس علّة C2: حلقة على `(d.orders||[])` بتعمل no-op → الدوك المحاسبي يتعكس/يتحذف
بينما `order.customerReturns` يفضل موجود → الرصيد التشغيلي والمخزون لسه بيخصموا
المرتجع والمحاسبة لأ. نفس الـ desync اللي V21.27.101 اتكتبت أصلًا عشان تصلّحه —
لسه حي لمرتجعات التوزيعة.

---

## 🟠 HIGH (7)

### H1 — توكنات Shopify/Bosta/WhatsApp في `factory/config` مقروءة لأي مستخدم (حتى viewer)
**`firestore.rules:138` (`allow read: if isAnyUser()`) + `shopify/connect.js:129` · `bosta/configure.js:70` · `whatsapp-bridge-proxy.js:54`**

`factory/config` مقروء لأي مستخدم مسجّل والكلاينت بيشترك في الدوك كامل. جواه توكن
Shopify Admin الحي (`shpat_`)، مفتاح Bosta، وتوكن WhatsApp bridge (fallback).
**استغلال:** أي `viewer` يعمل `getDoc(doc(db,'factory','config'))` من الـ SDK
ويسحب التوكنات → اختراق كامل للمتجر وبيانات العملاء، مستقل عن UI اللي بيخفيهم.
**الحل:** نقل التوكنات لـ Vercel env بس (الـ bridge proxy أصلًا بيدعم env-first)
وشيل الـ fallback، أو دوك أسرار admin-only منفصل.

### H2 — إلغاء مرتجع صنف جاهز (generalProduct) مش بيرجّع يخصم المخزون
**`src/utils/sales/salesOrders.js:929,981`** — الشرط `if(ret.itemSourceType === "inventoryItem" ...)` فقط.

V21.27.160 خلّى مرتجعات `generalProduct+isFinishedGood` ترجّع مخزون حقيقي، بس
مسارَي الإلغاء اتنستوا. بيع صنف جاهز → مرتجع (مخزون +q) → إلغاء المرتجع → الإشعار
يتحذف و`so.returns` يتشال **لكن المخزون يفضل +q ومفيش حركة out** → **تضخّم مخزون
صامت** دائم (لا الـ ledger ولا المخزّن اتعدّلوا).

### H3 — شيك مورد مدفوع بيتحسب مرتين في `buildSupplierSummary` (الملخّص ≠ كشف الحساب)
**`src/utils/accountSummary.js:256`** بيستبعد `check_bounce` بس — **مش** `check_pay`
(بينما `statement.js:276` بيستبعد `check_collect/check_pay` صح).

شيك دفع 10,000 من فورم الخزنة (مش مرتبط بـ supplierPayment) واتعلّم «مدفوع» →
`buildSupplierSummary` يعدّه 10,000 في `totalPaid` (رِجل check_pay) **و** 10,000
في `payChecks` (data.checks) → رصيد المورد في القائمة/Contacts/KPI `payable`
ينزل 20,000 بينما كشف الحساب صح ينزل 10,000. *(إصلاح سطر واحد + regression test.)*

### H4 — اختلاف نموذج الخصم: كشف الحساب (10% افتراضي + خصم التوزيعة/التسليم) ≠ ملخّص العميل (0% ثابت)
**`src/utils/accountSummary.js:106`** بيستخدم `Number(customer.discount)||0` (افتراضي 0،
بيتجاهل `discPct` للتسليم وخصم الجلسة) بينما `statement.js:115-129` سلسلة
`session→delivery→customer→10%`.

عميل بدون خصم مسجّل، 100,000 تسليمات بدون `discPct` مختوم: كشف الحساب يعرض 90,000
مدين، `buildCustomerSummary.balance` (قائمة العملاء + ملخص واتساب + Contacts +
KPI) يعرض 100,000 → **فرق 10,000 ظاهر** بين الكشف والملخص لنفس العميل. ده أكبر
مصدر drift صامت في الأرصدة.

### H5 — كارت «مبيعات فعلية» في الداشبورد ≠ تفاصيله + الربح بيتجاهل أوامر البيع المباشرة
**`src/utils/dashboardKpis.js:30-46,89-118` + `accountSummary.js:21-64`**

الكارت = `computeSalesOverviewTotals` (تسليمات بس، بدون SOs مباشرة)، لكن صفوف
البوب-اب = `buildCustomerSummary` اللي `sales` بتاعه **بيشمل** `salesOrdersNet`
→ سطر الملخّص ≠ مجموع الصفوف تحته لما يبقى فيه SO مباشر (نفس فئة «كارت ≠ تفاصيل»
اللي V21.21.32 صلّحتها لكارت الرصيد). وأخطر: `tradingProfit = salesNet − buyNet
+ inventoryTotal` — تقييم المخزون **بيخصم** كميات SO المباشرة المحجوزة، فالـ SO
المباشر بيقلّل `inventoryTotal` من غير ما يرفع `salesNet` → **الربح ناقص بتكلفة
بضاعة كل SO مباشر**. `SalesHubPg.jsx:144` أصلًا معترفة بده وبتصلّح كارتها محليًا،
والداشبورد فاضل متضارب.

### H6 — لا يوجد write-gate لـ `factory/sales`/`factory/tasks` → `setDoc(merge:false)` من base فاضي يمسح الدوك + علم الترحيل
**`src/App.jsx:5140,5236,5309,5401`** — الـ gate بيعتمد على `salesDoc[FLAG] && !loaded`،
لكن لو الـ listener لسه ما ضربش `salesDoc={}` فالشرط vacuously false والـ gate يعدّي
→ `setDoc(factory/sales, tinyObj, {merge:false})` يمسح `_salesSplitDaysV1951Done`
وكل حاجة. الـ day-docs تفضل بس العلم راح → الميرج يبطّل يقراها → **كل جلسات
التسليم/الحزم تختفي من الـ UI**. نوافذ التشغيل: (أ) cold-start قبل وصول snapshot،
(ب) «متابعة على مسؤوليتي» (`forcedBypass`) بيمنع upConfig بس — upSales/upTasks
لسه مسموحين بـ base فاضي. حماية V18.60/V21.9.16 اتعملت لـ config بس.

### H7 — resilience الـ V21.9.46 (hang) ناقصة على listeners الـ sales/tasks split
**`src/App.jsx:4164,4239`** — خطأ terminal (مثلًا permission-denied بعد تغيير rules)
على `packagesDays`/`custDeliverySessionsDays`/`tasksDays`/`stickyNotesDays`/
`inventoryAuditsDays` يخلّي `firstFires[field]=false` للأبد → `salesSplitLoaded`
ما يقلبش → **كل upSales/upTasks يترفض بـ «البرنامج لسه بيحمّل»** بدون تعافي ولا
تشخيص (الـ handlers دي مش بتكتب `window.__clarkListenerErrors` فالبانر ما يظهرش).
نفس hang الـ V21.9.46 — اتصلّح لـ config-split/partitioned واتنسي هنا.

---

## 🟡 MEDIUM (اختير أهمها)

- **M1 — `deleteReceipt` بيتجاهل مرتجعات المشتريات** (`PurchasePg.jsx:1115`): مفيش
  guard على `r._returns` → الـ ledger يروح سالب والإشعار المدين يفضل معلّق.
  استلام 100 → مرتجع 30 → حذف الاستلام: ledger = +100−30 = **−30**، والمورد لسه
  مدين ببضاعة استلامها اتحذف. لازم يتمنع (زي الشيكات/الفاتورة) أو cascade كامل.
- **M2 — تفريغ فاتورة مبيعات بيعطّل أمر البيع** (`invoices.js:452` void مش بيفك
  الربط؛ `salesOrders.js:473` re-invoice guard مفهوش فلتر `status!=="void"`):
  عرض→SO→فاتورة→void → SO يفضل `invoiced` وبيشاور على فاتورة مفرّغة → لا re-invoice
  («مفوتر بالفعل») ولا cancel («الغِ الفاتورة أولاً» وهي مفرّغة أصلًا) → **طريق
  مسدود** على المسار الأساسي.
- **M3 — التقرير اليومي على السيرفر fork قديم** (`api/_buildDailyReport.js:59` مقابل
  `src/utils/automation/buildDailyReport.js:74`): نسخة السيرفر (cron→واتساب) ناقصة
  طرح مرتجعات SO المباشرة (V21.27.97) → التقرير المُرسَل بيعرض مبيعات أعلى من
  تقرير الـ app لنفس اليوم. نسختين مزامَنة يدويًا — يتوحّدوا في موديول واحد.
- **M4 — تكرار توليد الخزنة الدورية عبر أجهزة** (`TreasuryPg.jsx:5132`,
  `recurring.js:175`): `id: "rec_"+Date.now()+random` غير حتمي فالميرج ما يقدرش
  يدمج التكرارات، والقفل `localStorage` لكل متصفح بس. جهازين ينفّذوا المستحقات
  خلال ثواني → إدخالين خزنة متطابقين. الحل الحتمي `rec-<ruleId>-<dueDate>` (زي
  V21.9.249/250).
- **M5 — كتابات مالية عبر عدة docs غير ذرّية بدون rollback** (`App.jsx:4615`,
  `splitCollections.js:562`): `approveWeek` بيوزّع على ~8 collections؛ لو كتابة
  `empDebts` فشلت بينما `hrWeeksDocs`/`employees` نجحت → الأسبوع مقفول والقسط
  مخصوم من المرتب بس `paidWeekIds` ما سجّلش → **القسط يتخصم تاني الأسبوع الجاي**.
- **M6 — إلغاء مرتجع/حذف إشعار مدين للمشتريات بدون sync تشغيلي**
  (`DebitNotesPg.jsx:148,158`): مرآة عكسية لـ C3 على جانب المشتريات.
- **M7 — restore لباك-أب قديم بيمسح collections اتعملت بعده** (`SettingsPg.jsx:5420`
  + `massWipeGuard.js:29`): علم أحدث من الباك-أب مفقود → الحقل ما يتمّيّهش → الـ
  guard يتخطّاه (مش في afterObj) → `syncAllSplitChanges` يمسح كل day-docs بتاعته.
  نفس فئة V21.9.33/39. الحل: رفض sync-delete لأي حقل علمه off.
- **M8 — إعادة تبديل حالة الشيك بتمسح أرجل الدفع الجزئي الحقيقية**
  (`TreasuryPg.jsx:4226`): `updateStatus` بيشيل كل الأرجل بـ `checkId===id` قبل
  تطبيق الحالة الجديدة → شيك «محصّل جزئي» يتقلب «مرتد» → رِجل الكاش الجزئية الحقيقية
  (تاريخها مختلف) تختفي → رصيد الخزنة أقل من الدرج الفعلي.

---

## 🔵 نمو مصفوفات factory/config (خطر الـ 1MB + last-write-wins)

6 انتهاكات حقيقية لقاعدة §2 (مصفوفات بتكبر لسه في config غير مُرحّلة):

| # | الحقل | مكتوب في | المحرّك | الخطر | الحماية الحالية |
|---|-------|---------|---------|-------|----------------|
| 1 | **campaigns** | `CampaignsPg.jsx:1582` | كل حملة تخزّن `items[]` = سجل كل مستلم (اسم/تليفون/حالة) | **1MB**: إرسال 1,500 مستلم ≈ 150-250KB/سجل | cap 50 سجل (عدد مش بايت) |
| 2 | **catalog** | `AIAgentPg.jsx:3703,3825` | كل منتج + thumbnail base64 | **1MB** (base64 في config) | بانر ≥50 بس |
| 3 | **recycleBin** | `dataIntegrity.js:563` + HRPg/CustDeliver/DBPg | كل حذف يخزّن الكيان كامل (idCard/photo base64) | **1MB**: 100×20-50KB | cap 100 (عدد) |
| 4 | **bulkPaymentApprovals** | `HRPg.jsx:969` | كل طلب دفع جماعي + `items[]` لكل موظف | 1MB + LWW مالي | **لا يوجد cap** |
| 5 | **inventoryItems** | `categories.js:147` | كل SKU مخزن (نفس فئة generalProducts اللي اتـ partition في V19.57) | LWW على المخزون + 1MB | لا يوجد |
| 6 | **stockCounts** | `MobileStockCount.jsx:140` | كل جلسة جرد + `items[]` | 1MB (يكبر بعدد الموديلات) | cap 50 |

**تسرّبات بطيئة (بدون cap):** accountingPostFailures, campaignBlocklist,
aiAgent.faqs. **LWW-only (نفس فئة recurringTreasury قبل V21.9.44):** reminderRules,
coa, treasuryAccounts.

**فجوة مراقبة:** `sizeBudget.js` و`dataLimits.js` بيغطّوا الحقول المُرحّلة بس —
الـ6 انتهاكات دي **غير مرئية** لأي طبقة تحذير قبل ما تتبلّظ فعلًا.

---

## 🟢 اتّأكد إنه سليم (لا نتائج)

- guards تسلسل الحذف §14.2 (quote/SO/invoice + RFQ/PO/receipt) — كلها في الـ
  mutators فالمسار الفردي والجماعي بيشاركوها.
- تخطّي المرايا (§14.1) في الـ4 أماكن + buildDailyReport.
- registries الـ split/partitioned مكتملة (24+14) — مفيش حقل hydrated-not-stripped.
- INFLIGHT_LOCK_MS=360s > cron (§10) + try/finally + AbortController في الـ bridge.
- كل portal endpoints موقّعة HMAC (غير قابلة للتزوير) + verifyAdminToken على المُطفِّرات.
- diagnostics.js بيعدّ `Object.keys(cfg)` ديناميكي (مش hardcoded).
- الحوادث السابقة: recurringTreasury/transfers/loading-hang (config)/documentsTree
  files — كلها متصلّحة على مسار config (الثغرات المتبقية في مسارات sales/tasks — H6/H7).

---

## الأولويات المقترحة (رأيي كمهندس — للمناقشة قبل التنفيذ §0.1)

**كلها بتلمس data-flow → §0.2 يفرض اختبار سحابي بعد كل واحدة قبل الدفع.**

1. **H1** (تسريب التوكنات) — أخطر أمنيًا، إصلاح مستقل نظيف (نقل لـ env).
2. **C2+C3** (bug إلغاء مرتجع التوزيعة) — نفس شكل إصلاح V21.21.13 (تمرير ctx.orders
   + `updOrder`). ميزة ميتة + خطر desync.
3. **H3+H4** (drift الأرصدة) — H3 سطر واحد، H4 توحيد helper الخصم. أعلى drift صامت.
4. **C1** (خصم المخزون على config مقصوص) — محتاج قرار: الميزة مفروض شغّالة؟
5. **H6+H7** (gates + resilience لـ sales/tasks) — نسخ حماية config الموجودة.
6. مصفوفات config (campaigns/catalog/recycleBin أولًا) — ترحيل تدريجي.

**اقتراحي:** نبدأ بـ **H1 → H3 → C2/C3** (الأوضح والأقل blast-radius نسبيًا)،
كل واحدة نسخة منفصلة + اختبار سحابي، وأرجعلك قبل C1 (محتاج قرار على الميزة نفسها).
