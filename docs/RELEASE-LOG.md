# CLARK — RELEASE LOG (سجل الإصدارات التفصيلي)

> **هذا ملف رولينج — يُحدَّث في كل إصدار جديد.** كل نسخة CLARK يتسجّل فيها
> هنا «إيه اللي اتعمل بالتفصيل + الملفات + القرارات». الهدف: أي session جديد
> يفتح الملف ده يفهم تاريخ التطوير من غير ما يقرأ كل الـ git log.
>
> **القاعدة (جزء من البروتوكول §1):** بعد كل تعديل، بعد ما تـ bump النسخة
> وتكتب في `public/changelog.json`، **حدّث الملف ده كمان** بإدخال للنسخة
> الجديدة (الأحدث في الأعلى) + راجِع قسم «🔜 اللي لسه (TODO)».

الأحدث في الأعلى. التواريخ هجري ميلادي مختلطة حسب اليوم.

---

## V21.27.104 (2026-06-24) — 🧾 تاب «تقارير محاسبية» + تقرير تقييم المخزون

طلب Ahmed: تقرير محاسبي دقيق لتقييم المخزون بالكامل + المستحقات، داخل تاب
جديد «تقارير محاسبية» (حاوية تكبر بتقارير تانية)، قابل لتصدير Excel + طباعة.

### البنود المطلوبة (كلها منفّذة)
1. إجمالي تقييم المخزون بالكامل (بالتكلفة).
2. قيمة مخزن الجاهز — بالتكلفة **وبسعر المبيعات** (+ الربح المتوقع).
3. قيمة مخزن القماش المتاح (متوسط التكلفة المرجّح).
4. قيمة مخزن الإكسسوار المتاح.
5. إجمالي المستحق على المصنع للموردين.
6. إجمالي المستحق للمصنع من العملاء.
(+ بند «مخازن أخرى» لو وُجدت أصناف بمخازن مخصّصة، + صافي مركز رأس المال العامل.)

### المعمارية (مصدر حقيقة واحد — تطابق لوحة التحكم)
- **`src/utils/dashboardKpis.js`:** أُضيف سعر بيع الجاهز للحساب — `finishedSell`
  (= Σ المتاح × `o.sellPrice`) + `unitSell`/`sellValue` لكل عنصر في
  `finishedDetail`. (سعر البيع مخزّن على الأمر مباشرة، مش محسوب.)
- **`src/utils/accounting/inventoryValuation.js` (جديد):** دالة نقية
  `buildInventoryValuationReport(data)` بتعيد استخدام `computeDashboardKpis`
  (نفس أرقام اللوحة) + بتجمّع المستحقات: الموردين والعملاء بأرصدة موجبة فقط
  (payable/receivable)، مع فصل الأرصدة الدائنة. مختبرة (7 اختبارات).
- **`src/components/accounting/AccountingReportsTab.jsx` (جديد):** تاب الحاوية
  (شبكة أزرار، `REPORT_DEFS`) + view تقرير تقييم المخزون (بطاقات KPI + جداول
  تفصيلية + Excel + طباعة). نمط views-vs-popups §15 (التقرير view مش popup).
- **`src/pages/AccountingPg.jsx`:** تاب `acctReports` بعنوان «تقارير محاسبية»
  بين «القوائم المالية» و«الإعدادات».
- **التصدير:** `exportExcel(rows,name)` (aoa → .xlsx) · **الطباعة:**
  `printPage(title,html,configInfo)` (رأس المصنع + PRINT_CSS + PDF).

### SW
بمب `SW_VERSION='v21.27.104'` (البروتوكول الجديد من V21.27.103 — بمب مع كل إصدار).

### الملفات
`src/utils/dashboardKpis.js` · `src/utils/accounting/inventoryValuation.js` (جديد) ·
`src/components/accounting/AccountingReportsTab.jsx` (جديد) · `src/pages/AccountingPg.jsx` ·
`public/sw.js` · `src/utils/accounting/__tests__/inventoryValuation.test.js` (جديد، 7).
build ✓ · 408 tests ✓.

### 🔜 اللي لسه (تقارير محاسبية مستقبلية لنفس التاب)
تقرير أرباح تفصيلي · تقرير أعمار الديون · تقرير حركة الخزنة الشامل — تتضاف
كـ entries في `REPORT_DEFS` بنفس النمط.

---

## V21.27.103 (2026-06-23) — 🔁 تحديث الكاش التلقائي + مرتجع كل الأنواع + شيل زر المحفظة من الهوم

ملاحظتين من Ahmed + اكتشاف سبب جذري للنسخ القديمة.

### (1) 🔑 السبب الجذري لظهور نسخ قديمة على الموبايل — `public/sw.js`
**Root cause:** `SW_VERSION` كان متجمّد عند `v21.9.168` (التعليق بيقول «يتبمب كل
إصدار» لكنه ما اتبمبش لشهور). الـ Service Worker بيتحدّث بس لو **بايتات `sw.js`
اتغيّرت**؛ طول ما SW_VERSION ثابت، `reg.update()` مايلاقيش SW جديد → الـ
`activate` (اللي بيمسح الكاش القديم) ما بيعيد التشغيل → النسخة القديمة تفضل.
**الإصلاح:** `SW_VERSION = 'v21.27.103'` → المتصفح يكتشف SW جديد، skipWaiting،
activate يمسح كل الكاشات القديمة، controllerchange → reload تلقائي للنسخة الجديدة.
**⚠️ من دلوقتي: بمب `SW_VERSION` في `public/sw.js` مع كل إصدار** (أُضيف للبروتوكول).

### (2) مرتجع «أمر البيع المباشر» يشمل كل أنواع البنود — `salesOrders.js` + `CustDeliverPg.jsx`
بلاغ Ahmed: موديل مُباع بأمر بيع مباشر لعميل مختار مش بيظهر في قايمة المرتجع.
الفحص أثبت إن منطق الموديل + صنف المخزون سليم (اختبار `computeDirectSoReturnables`
بيأكّد ظهور الموديل لعميل مختار) — فالأعراض على الأغلب كانت كاش (نقطة 1). ومع كده
سُدّت ثغرة حقيقية: المنتج العام (`generalProduct`) والخدمة (`service`) كانوا
**مُتجاهَلين** تمامًا في المرتجع.
- **`computeDirectSoReturnables(salesOrders)`** (pure + exported + مختبرة): اتنقل
  من inline `directSoRet` في CustDeliverPg. بتبوّب الموديلات في `models`، وأي بند
  تاني له `sourceId` (صنف مخزون/منتج عام/خدمة) في `invItems` مع `itemType`. تستبعد
  المرايا/الملغية/الـ ad-hoc (بدون customerId).
- **`returnFromDirectSalesOrderMutator`:** `_retable` بقى يشمل
  order/inventoryItem/generalProduct/service؛ `itemSourceType` بيتختم بالنوع
  الفعلي (بدل order/inventoryItem بس). استرجاع المخزون لـ inventoryItem فقط؛
  الباقي إشعار دائن فقط.
- **CustDeliverPg:** `directSoRet` = `useMemo(computeDirectSoReturnables)`؛ صفوف
  المرتجع label يتغيّر حسب النوع (🧵 صنف مخزون / 🏷️ منتج عام / 🛠️ خدمة).

### (3) شيل زر «📱 محافظ إلكترونية» من الهوم — `App.jsx`
موجود أصلاً في الخزنة (تاب المحافظ) — اتشال من شريط الهوم العلوي (طلب Ahmed).

### الملفات
`public/sw.js` · `src/utils/sales/salesOrders.js` (+`computeDirectSoReturnables`) ·
`src/pages/CustDeliverPg.jsx` · `src/App.jsx` ·
`src/utils/sales/__tests__/returnFromDirectSO.test.js` (+4 = 26). build ✓ · 401 tests ✓.

---

## V21.27.102 (2026-06-23) — 📦 أرشفة الفواتير الملغية (مبيعات ومشتريات)

طلب Ahmed: زر يأرشف الفواتير الملغية فتختفي من السجل بس تفضل موجودة، وزر
يفتح المؤرشفة لما يحتاجها — للمبيعات والمشتريات.

### التصميم
- **flag `archived`** على الفاتورة (+`archivedAt`/`archivedBy`) — للملغية (void) فقط.
- **`setInvoiceArchivedMutator(d, type, ids, archived, userName)`** (pure,
  `invoices.js`): يأرشف/يرجّع الملغية المحددة (أو الكل لو ids=null)؛ بيتجاهل
  المرحّل/المسودة؛ idempotent.
- **`getInvoiceStats`**: بيستثني المؤرشفة من العدّ (إلا لو `includeArchived`) +
  بيرجّع `archivedCount` — عشان كرت «ملغية» يطابق القائمة النشطة.

### الـ UI (SalesInvoicesPg + PurchaseInvoicesPg — المودال مشترك)
- زر هيدر **«📂 المؤرشفة (N)»** ⇄ **«→ رجوع للسجل النشط»** (toggle `showArchived`).
- زر **«📦 أرشفة الملغية (N)»** فوق القائمة (السجل النشط) — يأرشف ملغيات النطاق الحالي.
- وضع الأرشيف: شريط بنفسجي + **يتجاهل فلتر التاريخ** (يعرض كل المؤرشفة)؛ كل صف
  له زر **«↩️ استرجاع»**.
- داخل تفاصيل الفاتورة الملغية: زر **«📦 أرشفة»** / **«↩️ استرجاع من الأرشيف»**.
- الفلتر: `showArchived` → الملغية المؤرشفة فقط؛ غير كده → يستبعد المؤرشفة.

### الملفات
`src/utils/invoices.js` (+`setInvoiceArchivedMutator` + استثناء المؤرشفة) ·
`src/pages/SalesInvoicesPg.jsx` (+`InvoiceDetailModal` المشترك onArchive) ·
`src/pages/PurchaseInvoicesPg.jsx` ·
`src/utils/__tests__/invoices.test.js` (+5 اختبارات = 28). build ✓ · 397 tests ✓.

---

## V21.27.101 (2026-06-22) — 🔄 إصلاح جذري لدورة المبيعات (4 ملاحظات Ahmed)

مراجعة Ahmed لدورة المبيعات كاملة → 4 إصلاحات جذرية. فحص بـ subagents
(الفاتورة/الخصم + المرتجعات/الإلغاء) لتحديد الـ root cause قبل التنفيذ.

### (١) الخصم التلقائي قبل ترحيل الفاتورة — `SalesInvoicesPg.jsx`
**Root cause:** محرّر الخصم (V18.58) كان بيبدأ بـ `discountValue = invoice.discountPct || 0`.
فاتورة «أمر البيع المباشر» بتحمل الخصم كـ**مبلغ** (`discount`) مع `discountPct=0`
(الخصم per-line في الأمر) → الحقل يبدأ فاضي/صفر، لازم يتكتب يدوي، **وأسوأ**:
الـ debounced auto-save كان بيشتغل on-mount ويصفّر الخصم بمجرد فتح الفاتورة.
**الإصلاح:** التهيئة بقت تعكس الخصم الفعلي (pct لو فيه نسبة، وإلا amount لو فيه
مبلغ خصم) + حارس `didMountDisc` يتخطّى أول run (مجرد الفتح مايكتبش).

### (٢) الخصم في بوب اب الفاتورة بكشف الحساب المحاسبي — `AccountStatementView.jsx`
البوب اب (`drill.detail.kind!=="session"`) كان بيعرض البنود والإجمالي بس.
أُضيف ملخّص خصم من `drill.raw` (الإجمالي قبل الخصم · الخصم% · المستحق).

### (٣) توحيد المرتجع على كل المصادر (قرار Ahmed: «كل المسارات تدعم المباشر»)
**Root cause:** ٤ نقاط دخول للمرتجع، واحدة بس («مرتجع حر») كانت تعرض
أصناف أمر البيع المباشر؛ الباقي توزيعة-only. (و`returnPopup`/`doReturn`
اتأكّد إنه dead code — مفيش مكان بيفتحه ببيانات.)
- **سجل المرتجعات** (`CustDeliverPg`): بقى يضمّ `so.returns` (أمر مباشر) جنب
  `customerReturns` (توزيعة) ببادج 🧾، في السجل + بوب اب العميل.
- **المرتجع السريع (QR):** لو الموديل اتباع مباشر (مفيش تسليم توزيعة للعميل)
  → يوجّه لـ `returnFromDirectSalesOrderMutator` بدل `customerReturns`.
- **مرتجع حر:** كان بالفعل يدعم المباشر (V21.27.99).

### (٤) إلغاء مرتجع موحّد + ربط ثنائي (قرار Ahmed: «زر واحد يرجّع كل حاجة»)
**Root cause:** الإلغاء كان من مكانين بلا ربط — حذف `customerReturns`/`so.returns`
(تشغيلي) ≠ void الإشعار الدائن (محاسبي). فإلغاء واحد مايكملش التاني → الكشفين
يختلفوا (شكوى Ahmed: اتلغى محاسبي بس، فضل تشغيلي).
- **`cancelReturnMutator(d, ref, userName)`** (pure, `salesOrders.js`): يشيل
  المستند التشغيلي + يرجّع المخزون (re-deduct لصنف المخزون + استرجاع
  `stockDeductions`) + يحذف الإشعار المسودة / يعلّم المرحّل void (والـ GL
  reversal بيتم بره عبر `autoPost.creditNoteVoided` / `autoPost.reverse`
  لمرتجع توزيعة مرحّل مباشرة). **أمان §0.1:** الإشعار المدموج (>1 returnRefs)
  مايتلغّيش تلقائيًا (تنبيه + يتدار من شاشة الإشعارات).
- **`removeOperationalReturnForCreditNote(d, cnId)`** (pure): الربط العكسي —
  void/حذف الإشعار من شاشته بيشيل المرتجع التشغيلي المرتبط (`so.returns`
  بالـ `creditNoteId`، أو `customerReturns` بالـ `returnRefs`) ويرجّع المخزون.
- **`cancelReturn` handler** (`CustDeliverPg`): زر «↩️ إلغاء» في بوب اب سجل
  المرتجعات → يتأكّد، ينفّذ الـ mutator، يعكس الـ GL.
- **`CreditNotesPg` handleVoid/handleDelete:** يستدعوا `removeOperationalReturnForCreditNote`.
- **id ثابت** اتضاف لمرتجعات التوزيعة (`customerReturns`) في كل مسارات الإنشاء
  للإلغاء الدقيق (fallback: `_key` ثم index للقديم).

### الملفات
`src/pages/SalesInvoicesPg.jsx` · `src/components/AccountStatementView.jsx` ·
`src/utils/sales/salesOrders.js` (+`cancelReturnMutator`/`removeOperationalReturnForCreditNote`) ·
`src/pages/CustDeliverPg.jsx` · `src/pages/CreditNotesPg.jsx` ·
`src/utils/sales/__tests__/returnFromDirectSO.test.js` (+8 اختبارات = 22).
**build ✓ · 392 tests ✓.** Blast radius: منطق الإلغاء pure+tests؛ الـ GL
reversal بيعيد استخدام مسارات autoPost المثبتة؛ الإشعار المدموج محميّ.

---

## V21.27.100 (2026-06-22) — 🎨 تحسين تنسيق القماش/الخامات + بوب اب الألوان

طلبات Ahmed على شاشة الموديل (تاب القماش والخامات):

1. **توسيع بطاقة الخامة** (`ModelForm.jsx`): `flex-basis` من `320px` لـ `420px`
   (والموبايل 86%→88%) عشان صف الاستهلاك (استهلاك/راق · قطع/راق · بادج استهلاك
   القطعة) يبان في سطر واحد من غير wrap.
2. **بوب اب الألوان** (`ui.jsx` — `ColorPicker`، مشترك في كل الشاشات):
   - **Root cause للزحزحة لليسار:** كان `position:fixed; top:50%;
     insetInlineStart:50%; transform:translate(-50%,-50%)`. خلط `insetInlineStart`
     (منطقي، RTL-aware → بيتحوّل `right`) مع `translate` (فيزيائي، مش RTL-aware)
     بيطلّع البوب اب مزاح لليسار بدل المنتصف. **الإصلاح:** overlay فلكس
     (`display:flex; align-items/justify-content:center`) — توسيط متين في RTL وLTR.
   - **شكل مربع:** `width:min(460px,94vw)` + `maxHeight:min(520px,88vh)` +
     عمود فلكس (الهيدر/البحث/الفوتر ثابتين، الشبكة بس بتسكرول).
   - **مربعات أصغر (≈ نص الحجم):** الشبكة `minmax(60px→34px)`، gap 8→6،
     `borderRadius` 10→7، اسم اللون `FS-4→FS-5`.
3. **مسح زر «+ اضافة الكل»** من تاب الاكسسوار (`ModelForm.jsx`) — كان بيضيف كل
   أصناف المخزن دفعة واحدة (غير صحيح)؛ الإضافة بالبحث/الاختيار اليدوي بس.

**الملفات:** `src/components/ui.jsx` · `src/pages/ModelForm.jsx`. build ✓ ·
tests متأثّرتش (UI بحت). Blast radius: `ColorPicker` مشترك — التغيير عرض/توسيط
فقط (الـ API `onSelect`/`value`/`colorHex` زي ما هو).

---

## V21.27.99 (2026-06-22) — 🧵 مرتجع الخامات/الإكسسوار + فاليديشن حذف البيع المتفوتر

استكمال مراجعة دورة المبيعات (قرارات Ahmed): (١) توسعة المرتجع ليشمل أصناف
المخزون «زي أودو»، (٢) فاليديشن فقط لحذف البيع من «سجل البيع» (يمنع/يحذّر لو
متفوتر/مرحّل؛ ولو آمن، يشيل السطر ويرجّع المخزون).

### السياق المعماري (اللي اتأكّد بالفحص)
بنود أمر البيع المباشر نوعين بيخصموا المخزون بطريقتين مختلفتين:
- **موديل (`sourceType:"order"`):** محجوز **مشتق** عبر `computeSoReserved`
  (البنود − `so.returns`). التسليم الفعلي عبر شاشة التسليم — مفيش خصم رقمي
  عند البيع (V21.10.7).
- **صنف مخزون (`sourceType:"inventoryItem"`):** خصم **فعلي** عند تأكيد الأمر
  عبر `applyStockDelta(-qty)` + قيد في `so.stockDeductions[]` + حركة out.

محاسبيًا: بيع صنف المخزون مابيعملش قيد COGS journal (لأن `buildSalesInvoiceCogsEntry`
بيحتاج `order` للتكلفة)، فالمرتجع متّسق: يرجّع المخزون فعليًا + إشعار دائن يعكس
الإيراد، بدون COGS journal. **مش محتاج لمس postingRules.**

### (١) توسعة المرتجع لأصناف المخزون
- **`salesOrders.js` — `returnFromDirectSalesOrderMutator`:** اتعمّم ليقبل بنود
  `order` **و** `inventoryItem`. لمرتجع صنف المخزون:
  - `applyStockDelta(+take)` بتكلفة الخصم الأصلية (`ded.unitCost`) + حركة
    `in` (`sourceType:"sales_order_return"`) — **بس لو** البيع خصم فعلًا
    (`so.stockDeducted` + قيد في `stockDeductions`).
  - **يقلّل `ded.qty`** المقابل (حماية من double-restore لو الأمر اتلغى بعدين)
    + يعيد ضبط `so.stockDeducted`.
  - `so.returns` entry اتعلّم بـ **`itemSourceType`** (`order`/`inventoryItem`)
    + `categoryId/itemName/unit/unitCost/stockMovementId` للأصناف.
  - الموديلات زي ما هي (مرتجع مشتق عبر `computeSoReserved`).
- **حُرّاس الـ derived (يتخطّوا مرتجعات `inventoryItem`):** `computeSoReserved`
  (stockCatalog) + `dashboardKpis.soReserved` — عشان مرتجع الصنف الفعلي
  مايتحسبش تاني في المحجوز المشتق للموديلات. (الغياب = موديل قديم، يُطرح
  للتوافق الرجعي.)
- **`CustDeliverPg.jsx`:**
  - `directSoRet` بقى يجمّع `models` **و** `invItems` (sold/returned لكل صنف).
  - شاشة المرتجع: صفوف `soInvRows` ببادج «🧵 صنف مخزون»؛ الحفظ بيمرّر صفوف
    الموديل + الصنف للـ mutator (بيتعرّف على النوع تلقائيًا).
  - بيكر العميل بيشمل عميل اشترى أصناف مخزون بس (`getCustSoInvTotal`).
  - تقرير القطع/سجل القطع للموديلات بس (حارس `itemSourceType`) — مرتجع الصنف
    بيبان في الإشعار الدائن + تفاصيل الأمر + كشف الحساب (قيمة).

### (٢) فاليديشن حذف/تعديل البيع من «سجل البيع»
- **`CustDeliverPg.jsx` — `saleInvoicedMap` (useMemo, O(SOs+invoices)):** يربط
  (جلسة|عميل) بفواتيرها (مرآة `sourceSessionId+salesInvoiceId`، أو
  `deliveryRefs`). `saleMoveBlocked(m)` يرجّع سبب المنع:
  - **مرحّل** → «بيع مرحّل بفاتورة … — الغِ الترحيل الأول».
  - **مسودة** → «بيع متفوتر (مسودة …) — احذف الفاتورة الأول».
- `delMove`/`saveEdit` بيرفضوا الحركة المتفوترة (toast)؛ الـ UI بيعرض **🔒**
  بدل أزرار ✏️/🗑 (نظير 🔗 للـ read-only). الحذف الآمن زي ما هو (المخزون
  والرصيد مشتقّين → بيرجعوا تلقائيًا).

### الملفات
- `src/utils/sales/salesOrders.js` — توسعة `returnFromDirectSalesOrderMutator`.
- `src/utils/stockCatalog.js` · `src/utils/dashboardKpis.js` — حُرّاس derived.
- `src/pages/CustDeliverPg.jsx` — `directSoRet`+invItems · `saleInvoicedMap` ·
  فاليديشن الحذف/التعديل · شاشة المرتجع (صفوف الأصناف + البيكر).
- `src/utils/sales/__tests__/returnFromDirectSO.test.js` — +4 اختبارات (14 إجمالاً).

**Blast radius:** المنطق pure + tests (384 ✓)؛ المرايا/الموديلات مسارها متغيّرش؛
postingRules متغيّرش؛ build ✓.

---

## V21.27.98 (2026-06-21) — 📋 سجل البيع يعرض مبيعات «أمر البيع المباشر» كمان

بلاغ Ahmed: «سجل البيع بيظهر المبيعات اللي من التوزيعة فقط — دورة المبيعات
اللي بتتم من خلال أمر البيع مش بتظهر في سجل البيع.»

**Root cause:** بنّاء `moves` في بوب اب «سجل البيع» (`custSalesLog`) +
`printSalesReport` كانوا بيقروا من `customerDeliveries`/`customerReturns` بس
(مبيعات التوزيعة). أوامر البيع المباشرة (`data.salesOrders`، بنود
`sourceType:"order"`) + مرتجعاتها (`so.returns`) مكانتش متضمّنة.

**الإصلاح (CustDeliverPg):**
- `custSalesLog`: أضيف للموفز مبيعات الأمر المباشر (بند لكل موديل) + مرتجعاته
  (`so.returns`)، متفلترة بالعميل، `source:"so"` + `readonly:true`. بادج
  «🧾 {رقم الأمر}» + رقم الإشعار للمرتجع. الأعمدة/الإجماليات/الفلاتر/الطباعة
  بتشملها. مفتاح الصف بقى يتضمّن `source` (منع تصادم React keys).
- الحركات دي **read-only** في السجل (🔗) — مستندات منفصلة، التعديل/الحذف من
  «أوامر البيع» / المرتجع (`saveEdit`/`delMove` بيتجاهلوا `readonly`).
- `printSalesReport` (تقرير المبيعات المطبوع): نفس الإضافة — أوامر البيع +
  مرتجعاتها تدخل `custMap`/`modelMap`/الإجماليات بفلاتر المدى/العميل/الموديل.

**Blast radius:** عرض/تقارير فقط (مفيش تغيير بيانات/محاسبة). build ✓ ·
380 tests ✓ · lint نظيف.

ملفات: `src/pages/CustDeliverPg.jsx` · `package.json` · `src/constants/index.js`
· `public/changelog.json` · `docs/RELEASE-LOG.md`.

---

## V21.27.97 (2026-06-21) — 🧾 تصحيح مرتجع أمر البيع: المستند يفضل كامل + إشعار دائن منفصل

اعتراض Ahmed (صحيح ١٠٠٪) على V21.27.96: «المرتجع يقلّل أمر البيع؟ يعني يعدّل
مباشر في أمر البيع؟ ده غلط محاسبيًا ومستنديًا. أمر البيع لازم يفضل كامل،
والمرتجع كامل — كل حركة تكون كاملة.»

**Root cause (في V21.27.96):** `returnFromDirectSalesOrderMutator` كان بيعدّل
`so.items` (يقلّل الكمية) ويلغي الأمر لو فضي — كسر مبدأ المستند الثابت (§14.2).

**التصحيح (مبدأ متماثل مع التوزيعة: البيع يفضل + مرتجع منفصل + الصافي = الاتنين):**
- **أمر البيع immutable** — `so.items` مابتتلمسش أبدًا (يفضل كامل).
- **المرتجع = مستند منفصل:** `so.returns[]` على الأمر + **إشعار دائن مسودة**
  (`buildCreditNoteFromSalesOrderReturn` — جديد، بسعر/خصم بند الأمر الفعلي،
  `returnRef.orderId` للـ COGS + `fromSalesOrderId`).
- **المخزون** يرجع عبر `computeSoReserved` (= البنود − `so.returns`) من غير لمس
  البنود. **الرصيد** عبر `accountSummary`/`statement` (بيطرحوا قيمة المرتجع).
- بيشتغل **قبل وبعد** الفاتورة. المتفوتر المرحّل مسموح (الإشعار بيعكسه). إشعار
  من أمر **غير متفوتر** مايترحّلش (حارس في `creditNotePostBlocker`) عشان مايعملش
  قيد عكسي لبيع ماترحّلش.

**المواضع المشتقّة اللي اتظبطت (عشان مايحصلش اختلال/حساب مزدوج):**
- `stockCatalog.computeSoReserved` (المخزون) — يطرح `so.returns`.
- `dashboardKpis` + `InventoryValuationReport` (تقييم المخزون) — يطرحوا `so.returns`.
- `accountSummary.salesOrdersNet` (رصيد العميل) — `so.total − قيمة المرتجع`
  (مش متكرر مع `returnsNet`/الإشعارات لأنهم من مصادر تانية).
- `statement.js` التشغيلي — الأمر مدين كامل + صفوف مرتجع دائنة منفصلة.
- `buildDailyReport` — مرتجعات اليوم تقلّل مبيعاته.
- `SalesOrderDetailModal` — قسم «المرتجعات» منفصل + الصافي.

**Helpers:** `salesOrderReturnedValue` / `salesOrderNetTotal`. **10 unit tests**
(immutable items, so.returns، إشعار دائن، reserved، FIFO، over-return block،
posted-link، non-invoiced-not-postable، خصم البند، mirror/other ignore).

**ملاحظة:** V21.27.97 بيحلّ محل منطق V21.27.96. لو كنت استخدمت مرتجع V96 فعليًا
(عدّل أمر بيع)، بلّغني أكتب repair — غالبًا لسه متستخدمش (كان نقاش).

**Blast radius:** مالي/مشتق متعدد — كله pure + متغطّي بـ tests؛ مفيش
migrations/rules. build ✓ · 380 tests ✓ · lint نظيف.

ملفات: `src/utils/invoices.js` · `src/utils/sales/salesOrders.js` ·
`src/utils/stockCatalog.js` · `src/utils/dashboardKpis.js` ·
`src/utils/accountSummary.js` · `src/utils/accounting/statement.js` ·
`src/utils/automation/buildDailyReport.js` ·
`src/components/reports/InventoryValuationReport.jsx` ·
`src/components/sales/SalesOrderDetailModal.jsx` · `src/pages/CustDeliverPg.jsx` ·
`src/utils/sales/__tests__/returnFromDirectSO.test.js` · `package.json` ·
`src/constants/index.js` · `public/changelog.json` · `docs/RELEASE-LOG.md`.

---

## V21.27.96 (2026-06-21) — ↩️ مرتجع من «أمر بيع مباشر» (يقلّل الأمر ويرجّع المخزون صح)

بلاغ Ahmed (مشكلة ٢): «المفروض أقدر أرجع أي بيع من توزيعة أو أمر بيع. حاولت
أعمل إشعار دائن على العميل بعد أمر بيع + فاتورة — مفيش موديلات ظاهرة.»

**Root cause:** بيكر «المرتجع الحر» بيقرأ من `customerDeliveries` بس
(`getCustTotal` + `_retPerOrder`) → عملاء «أمر البيع المباشر» مابيظهروش.
والأخطر: مبيعات الأمر المباشر بتتحسب عبر **`reserved`** (`computeSoReserved` =
مجموع `item.qty` للبنود `sourceType:"order"`)، مش `customerDeliveries`. فلو
رجّعنا بإضافة `customerReturn` (زي التوزيعة) → المخزون يتعدّ **مرتين** (الأمر
لسه حاجز الكمية + الـ return يزوّد الـ avail).

**القرار (Ahmed عبر AskUserQuestion):** المرتجع لأمر مباشر **يقلّل الأمر نفسه**؛
ولو الأمر متفوتر ومرحّل (posted) → **يتمنع** ويوجّه لإلغاء الفاتورة الأول.

**الإصلاح:**
- `src/utils/sales/salesOrders.js`: `returnFromDirectSalesOrderMutator(d,
  {customerId, returns:[{sourceId,qty}]}, user)` (جديد، pure):
  * بيقلّل بنود `sourceType:"order"` للموديل عبر أوامر العميل (FIFO الأقدم أولاً)،
    يعيد حساب الإجماليات بـ `recalcQuotationTotals` (الخصومات per-line محفوظة).
  * بيزامن الفاتورة المسودة 1:1، أو يشيلها لو الأمر بقى فاضي (يتلغى الأمر).
  * أي كمية في أمر **posted** → بترجع في `blocked[]` (ممنوعة)؛ مفيش إشعار دائن
    لأن مفيش revenue مرحّل أصلاً. **9 unit tests** (FIFO، posted-block، draft-sync،
    full-return-cancel، multi-line، mirror/other-cust ignore).
- `src/pages/CustDeliverPg.jsx`:
  * `directSoRet` useMemo: موديلات الأمر المباشر القابلة للمرتجع لكل عميل
    (nonPosted vs posted) من `data.salesOrders`/`salesInvoices`.
  * بيكر المرتجع: العملاء أصحاب البيع المباشر بيظهروا (بادج 🧾) + الإجمالي مدموج.
  * شاشة المرتجع: صفوف SO مع `custModels` (بادج «🧾 أمر مباشر» + 🔒 للمتفوتر)؛
    الحفظ بيوزّع — التوزيعة → `customerReturns`، الأمر المباشر →
    `returnFromDirectSalesOrderMutator` عبر `upConfig`؛ تنبيه لو في كمية متفوترة.

**Blast radius:** المنطق المالي pure + متغطّي بـ tests؛ المرحّل محميّ (يتعكس
بإلغاء فاتورته). التوزيعة مسارها القديم متغيّرش. مفيش migrations/rules.

ملفات: `src/utils/sales/salesOrders.js` ·
`src/utils/sales/__tests__/returnFromDirectSO.test.js` (جديد) ·
`src/pages/CustDeliverPg.jsx` · `package.json` · `src/constants/index.js` ·
`public/changelog.json` · `docs/RELEASE-LOG.md`.

---

## V21.27.95 (2026-06-21) — 🧾 حذف بيع التوزيعة من مكان واحد (cascade) — يرجّع المخزن وحساب العميل

بلاغ Ahmed (مشكلة ١ من مراجعة دورة المبيعات): بعد توزيعة + بيع سريع، حذف
الفاتورة + أمر البيع مابيرجّعش كل حاجة — حساب العميل والمخزن يفضلوا متأثرين،
ولازم تمسح أمر البيع **و** البيع السريع يدويًا عشان المخزن يرجع.

**Root cause:** البيع من توزيعة/بيع سريع بيكتب `customerDeliveries` (مصدر
الحقيقة للرصيد/حساب العميل) + أمر بيع **مرآة** (مقفول، `stockDeducted:false`).
`deleteSalesOrderMutator` كان **مايمنعش** المرآة و**مايلمسش** `customerDeliveries`
→ بيشيل ورقة المرآة بس والبيع الفعلي يفضل. وحذف الجلسة (`delSession`) كان
**يمنع** لو فيه بيع.

**القرار (Ahmed عبر AskUserQuestion):** امنع حذف المرآة من «أوامر البيع»،
والحذف يتم من «سجل التسليمات» (التوزيعة = مصدر الحقيقة §14.1) ويمسح كل حاجة.

**الإصلاح:**
- `src/utils/sales/salesOrders.js`:
  * `deleteSalesOrderMutator` + `cancelSalesOrderMutator`: بيرفضوا أي أمر له
    `sourceDistributionId/isDistributionMirror` برسالة توجّه للتوزيعة.
  * `planSessionSaleDeletion(sessionId, ctx)` (جديد، pure): بيخطّط الـ cascade —
    `affectedOrderIds`/`deliveryCount` (customerDeliveries بالـ sessionId) +
    `mirrorSOIds` (sourceSessionId) + `draftInvoiceIds` (مرتبطة بالمرآة أو
    deliveryRefs كلها لنفس الجلسة). لو فيه فاتورة **مرحّلة** مرتبطة → يرفض
    (`blockedReason:"posted_invoice"`). الفواتير المسودة المدموجة مع توزيعات
    تانية بتتساب. **9 unit tests**.
- `src/pages/CustDeliverPg.jsx`: `delSession` بقى async cascade — يطبّق الخطة:
  `updOrder` يشيل التسليمات + `upConfig` يشيل المرآة والفواتير المسودة +
  `upSales` يشيل الجلسة. تأكيد مفصّل (بيوري هيتحذف إيه)؛ لو فيه فاتورة مرحّلة
  بيوجّه لإلغائها الأول. زر الحذف في «سجل التسليمات» مابقاش متمنوع لو فيه بيع.
- `src/pages/sales/SalesOrdersPg.jsx`: بادج المرآة بقى «🔗 من توزيعة #X» + tooltip
  بيقول احذف من «سجل التسليمات».

**Blast radius:** حذف فقط (cascade) — الفواتير المرحّلة محميّة (لازم تتلغي
بقيدها العكسي الأول). الإضافة pure + متغطّية بـ tests. مفيش migrations/rules.
ملاحظة: حذف بيع فردي من «سجل البيع» (`delMove`) لسه بيشيل التسليمة بس (مسار
منفصل) — الإصلاح ده للحذف الكامل من التوزيعة.

ملفات: `src/utils/sales/salesOrders.js` ·
`src/utils/sales/__tests__/distributionSaleDeletion.test.js` (جديد) ·
`src/pages/CustDeliverPg.jsx` · `src/pages/sales/SalesOrdersPg.jsx` ·
`package.json` · `src/constants/index.js` · `public/changelog.json` ·
`docs/RELEASE-LOG.md`.

---

## V21.27.94 (2026-06-21) — 🧮 توحيد أرصدة المخزن (الجاهز + الخامات) — صح ومتّسق

طلب Ahmed: «راجع جزء المبيعات بالكامل + الـ data flow + ترتيب الإدخال +
الأرصدة للمخزن بتظهر صح؟ (المستلم − الخارج: مبيعات ومشتريات)».

**نتيجة المراجعة (audit):** المبيعات + الـ data flow + السلسلة المستندية (عرض
سعر → أمر بيع → فاتورة) سليمة ومتسقة. «المتاح» متعرّف مرة واحدة في
`computeOrderAvail` ومستخدم صح في هَب المبيعات/كارت صنف/لوحة التحكم/البورتال.
لكن اتلقى **تباينين في «المخزن والجرد» (WarehousePg)**:

**Finding #1 (خطير) — رصيد الجاهز غلط:**
- `WarehousePg.jsx:90` + جدول «موديلات لها رصيد جاهز»: كان `bal = cutQty −
  getConfirmedStock − reserved` = «مقصوص − مستلم» = شغل تحت التشغيل. والعمود
  كان مكتوب عليه «المسلم للعميل» وبيعرض `getConfirmedStock` (= `o.deliveries`
  = المستلم من الورشة، مش `customerDeliveries`). مثال: مقصوص 100/مستلم 100/مباع
  30 → الصح = 70 متاح، لكن WarehousePg = 100−100 = 0 (بيخفي الموديل!).
- **الإصلاح:** الاتنين (`wStats.finished` + الجدول) بيستخدموا
  `computeOrderAvail(o, soReservedByOrder)` → الرصيد المتاح = المستلم في المخزن
  − صافي المباع − المحجوز. أعمدة الجدول: المقصوص · المستلم في المخزن · المباع
  للعميل · محجوز · الرصيد المتاح. متّسق مع باقي التطبيق.

**Finding #2 (متوسط) — رصيد الخامات بمصدرين:**
- «المشتريات ← المخزن» بيستخدم صافي حركات الـ ledger (`stockNetMap`، V21.27.77)،
  بينما «المخزن والجرد» كان بيستخدم `item.stock` المخزّن (ممكن يدرِف) → نفس
  الصنف ممكن يبان برصيدين مختلفين.
- **الإصلاح:** WarehousePg بقى يستخدم نفس الـ ledger-net في كل الأماكن: بطاقات
  `wStats` (خامة/إكسسوار/عام) · جداول `filteredFab/Acc/Prod` · تصدير CSV ·
  طباعة الجرد.

**Refactor (DRY):** المنطق اتنقل لـ `src/utils/stockLedger.js` (جديد) —
`computeStockNetMap(stockMovements)` + `netStockOf(netMap, item)` — helper مشترك
يستخدمه `PurchasePg` و `WarehousePg` (مصدر حقيقة واحد بدل نسختين). `PurchasePg`
اتحوّل للـ helper، و`getConfirmedStock` اتشال من imports `WarehousePg` (مابقاش
مستخدم).

**Blast radius:** عرض/قراءة فقط — مفيش mutations/migrations/rules ولا تغيير في
تخزين. الأرصدة المعروضة بقت موحّدة وصحيحة عبر كل الشاشات.

ملفات: `src/utils/stockLedger.js` (جديد) · `src/pages/WarehousePg.jsx` ·
`src/pages/PurchasePg.jsx` · `package.json` · `src/constants/index.js` ·
`public/changelog.json` · `docs/RELEASE-LOG.md`.

---

## V21.27.93 (2026-06-21) — 🧹 حذف «فاتورة خدمات» · المشتريات قماش/إكسسوار بس · تسمية تقارير الشراء

٣ طلبات من Ahmed (بالصور):
1. فواتير المبيعات: احذف زر «فاتورة خدمات».
2. المشتريات ← المخزن: «آخر حركات المخزن» ماتعرضش حركات الجاهز — قماش/إكسسوار
   وكل اللي ليه علاقة بالشراء بس.
3. تقارير المشتريات: «أعلى الخامات/الإكسسوار استهلاكاً» → «شراءً».

**الإصلاحات:**
- **`src/pages/SalesInvoicesPg.jsx` — حذف «فاتورة خدمات»:** اتشال الزر + الموديل
  `ServiceInvoiceModal` render + الـ state `showServiceModal` + الـ import —
  حذف كامل من غير كود ميت. (الموديل نفسه `ServiceInvoiceModal.jsx` متساب —
  لسه مستخدم في `PurchaseInvoicesPg.jsx`؛ الطلب كان على المبيعات بس.)
- **`src/pages/PurchasePg.jsx` — «📊 آخر حركات المخزن» (سطر ~1438):** الفلتر بقى
  `stockMovements.filter(m=>m.itemType!=="order")` قبل الـ sort → الجاهز
  (`itemType:"order"` — حجز/تسليم أوامر البيع) مستبعد. متّسق مع `stockNetMap`
  (V21.27.77) اللي بيستبعد الجاهز بالفعل.
- **`src/pages/PurchasePg.jsx` — تقارير الشراء (سطر ~1725/1737):** العنوانين
  بقوا «أعلى الخامات شراءً» / «أعلى الإكسسوار شراءً». **تسمية بس** — الداتا
  (`purchaseReports.topFabrics/topAccessories`) متحسوبة من `purchaseReceipts`
  (الكمية/القيمة المشتراة) مش من حركات الاستهلاك، فالعنوان القديم كان مضلِّل.

**Blast radius:** UI/labels + فلتر عرض — مفيش mutations/migrations/rules ولا
تغيير في تخزين أو حسابات. البناء + التيستات اتأكدوا.

ملفات: `src/pages/SalesInvoicesPg.jsx` · `src/pages/PurchasePg.jsx` ·
`package.json` · `src/constants/index.js` · `public/changelog.json` ·
`docs/RELEASE-LOG.md`.

---

## V21.27.92 (2026-06-21) — 📊 كارت الصنف (الأحدث فوق + أوامر البيع) · سجل حركات الجاهز في المبيعات

٣ طلبات من Ahmed (بالصور) على «كارت صنف» وقسم «المخزن والجرد» في هَب المبيعات:
1. سجل الحركات في كارت صنف: الأحدث فوق والأقدم تحت.
2. كارت صنف مش بيظهر الكميات اللي اتعملت أمر بيع مباشر — لازم تظهر (وتُخصم).
3. تحت «المخزن والجرد» في المبيعات: سجل احترافي متكامل لحركات مخزن الجاهز بس،
   فلتر بالكود والاسم، الأحدث فوق.

**Root cause (كارت صنف — `src/pages/CustDeliverPg.jsx` ~5685):**
- بناء `movements` كان `sort` تصاعدي بالتاريخ والعرض بنفس الترتيب → الأقدم فوق.
- الحركات كانت بتتبني من `deliveries`/`customerDeliveries`/`customerReturns`
  بس — أوامر البيع المباشرة (اللي بتسجّل `stockMovement` itemType:"order"
  وبتتحسب محجوز في `computeSoReserved`) **مش داخلة** الكارت لا في السجل ولا
  في الرصيد. (نفس بلاغ V21.27.88 لكن الإصلاح ساعتها راح لـ WarehousePg مش
  للبوب اب ده.)

**الإصلاح:**
- **الأحدث فوق:** الرصيد التراكمي لسه بيتحسب زمنيًا (أقدم→أحدث) عشان الأرقام
  تفضل سليمة، وبعدين `movDisplay = movements.slice().reverse()` للعرض
  والطباعة. عنوان السجل بقى «… — الأحدث أولاً».
- **أوامر البيع المباشرة:** loop على `data.salesOrders` بنفس فلتر
  `computeSoReserved` بالظبط (مش `cancelled`، مش `sourceDistributionId`، بند
  `sourceType==="order"` بيشير لموديل الكارت) → حركة «🔒 حجز» بـ `sign:-1`.
  مجموع الحجوزات = `m.totalReserved` فالرصيد التراكمي يطابق «المتاح» في باقي
  الشاشات. `modelMap.totalReserved` أُضيف و`currentBal = وارد − (مبيعات −
  مرتجعات) − محجوز`. بطاقة «🔒 محجوز» في الملخّص (٧ بطاقات) + عمود في الطباعة.

**سجل حركات الجاهز — مكوّن مشترك جديد `src/components/FinishedStockLog.jsx`:**
- يقرأ `stockMovements` (`itemType:"order"`)، يثري بوصف الموديل من `orders`
  (map مبني مرة واحدة — §15)، فلتر بالكود/الاسم/الوصف/المرجع، **الأحدث فوق**
  (`createdAt` ثم `date`)، إجماليات دخول/خروج، pagination 50 + «عرض المزيد»،
  وطباعة احترافية.
- **هَب المبيعات (`CustDeliverPg`):** زر جديد «📊 سجل حركات الجاهز» في GROUP 3
  («المخزن والجرد») بيفتح بوب اب ملء الشاشة فيه المكوّن. state: `showFinLog`.
- **`WarehousePg` (V21.27.89):** الـ block المكرر (inline) اتشال واتبدّل بالمكوّن
  المشترك — نسخة واحدة متطابقة (DRY)؛ تبويب الجاهز كمان كسب البحث بالوصف +
  الطباعة. state `finSearch/finLimit` اتشال (بقى داخلي).

**Blast radius:** قراءة فقط — مفيش mutations ولا تغيير في تخزين/migrations/rules.
«الرصيد» في كارت صنف بقى = «المتاح» (وارد − مبيعات + مرتجعات − محجوز) متسقًا مع
بقية التطبيق. ملاحظة: أمر البيع المباشر بيفضل «محجوز» طول ما هو مش ملغي — نفس
سلوك `computeSoReserved` الحالي؛ لو حابب المحجوز يقِل لما يتسلّم/يتفوتر فده تغيير
أوسع منفصل.

ملفات: `src/components/FinishedStockLog.jsx` (جديد) · `src/pages/CustDeliverPg.jsx` ·
`src/pages/WarehousePg.jsx` · `package.json` · `src/constants/index.js` ·
`public/changelog.json` · `docs/RELEASE-LOG.md`.

---

## V21.27.91 (2026-06-21) — 📖 ملف بداية الـ session (بروتوكولات العمل + التفويضات)

طلب Ahmed (قبل فتح session جديد): «اعمل MD فايل فيه بروتوكولات العمل + إنه
يكوميت ويبوش تلقائي + يعمل زيب لكل إصدار ويبعتهولي».

**التنفيذ — `docs/NEW-SESSION-START.md` (جديد):** ملف bootstrap «اقرأ ده أول
حاجة» لأي session جديد، فيه:
- ترتيب القراءة (CLAUDE.md → RELEASE-LOG.md → الملف ده).
- نظرة على المشروع + الفروع (`claude/release-log-review-j3ye96` + `main`).
- **التفويضات الدائمة:** دفع تلقائي على main بدون استئذان · زيب لكل نسخة وإرسال ·
  الاعتراض على الغلط (§0.1).
- **الـ AUTO-WORKFLOW الكامل:** build → bump (3 أماكن) → RELEASE-LOG → commit
  (ملفات محددة) → push (تطوير + main) → zip وإرسال، مع footer الكوميت المطلوب
  وأوامر git الفعلية.
- مزامنة git + الأنماط المعمارية المختصرة + الحالة الحالية (V21.27.90) +
  المتابعات المفتوحة.

ملاحظة: في `docs/` ملفات handoff قديمة (`HANDOFF.md` / `AI-AGENT-HANDOFF.md`)
لكن `NEW-SESSION-START.md` هو المختصر التشغيلي المحدّث للـ session الجديد.

ملفات: `docs/NEW-SESSION-START.md` · `package.json` · `constants/index.js` ·
`changelog.json`. (تغيير توثيقي — البناء غير متأثّر؛ اتبنى للتأكيد.)

---

## V21.27.90 (2026-06-21) — 🧾 البيع السريع: أمر بيع تلقائي بدل فاتورة مرحلة مباشرة

بلاغ Ahmed (باجز خطير في دورة البيع): «سجل التوزيعة بعد البيع من البيع السريع
المفروض يتسجّل كأمر بيع عادي ويترحّل فاتورة من أمر البيع لما أضغط ترحيل فاتورة —
لكنه بيتحوّل فاتورة بيع مرحلة مباشرة من سجل التوزيع».

**Root cause** (`CustDeliverPg.jsx` — تدفّق «بيع سريع» qrSale mode=sale، ~4588):
البيع السريع بيسجّل التسليم (`customerDeliveries`)، وبعدين للمحاسبة بيبص على
`invoiceSettings`: لو `autoPostFromInvoice===true && autoPostOnCreate===true`
بيعمل فاتورة عبر `upsertSalesInvoiceFromDelivery` **ويحطّها `status:"posted"`
فورًا** + يطلق journal الإيراد/COGS. ده بيخلّي «فاتورة بيع مرحلة» تظهر مباشرة من
التوزيعة. وأمر البيع (المرآة) بيتعمل منفصل عبر زر «تأكيد البيع» بـ
`salesInvoiceId:""` (مش مربوط بالفاتورة المرحّلة) → لو المستخدم ضغط «ترحيل فاتورة»
على أمر البيع بعدين، `createInvoiceFromSalesOrderMutator` بيعمل فاتورة **تانية**
= ازدواج.

**القرار (Ahmed عبر AskUserQuestion — Option A):** البيع السريع = «تسليم + أمر
بيع تلقائي» بس، من غير أي فاتورة/ترحيل. الإيراد + COGS بيتسجلوا وقت «ترحيل
فاتورة» من أمر البيع.

**الإصلاح — `src/pages/CustDeliverPg.jsx` (فرع `isSale`):**
- اتشال بلوك المحاسبة بالكامل (`autoPostFromInvoice` branch:
  `autoPost.sale`/`saleCogs` في الوضع القديم، و`upsertSalesInvoiceFromDelivery`
  + post + `salesInvoicePosted` في وضع الفاتورة). البيع السريع مابقاش يلمس
  المحاسبة/الفواتير.
- بناء بنود التسليم اتنقل خارج `updOrder` (نفس القيم من order الـ component)
  واتلقطت في `_qsNewDeliveries` عشان نبني snapshot.
- بعد تسجيل التسليمات: توليد «أمر البيع» (المرآة) فورًا عبر
  `generateSalesOrdersFromSessionMutator` بـ snapshot أوامر فيه التسليم الجديد
  (الـ component orders لسه ماتحدّثش في نفس الـ tick). idempotent — إعادة البيع
  أو «تأكيد البيع» بيزامن نفس الأمر (المفتاح `sourceDistributionId =
  sessionId:custId`) من غير تكرار.
- التسليم (`customerDeliveries`) يفضل مصدر الرصيد/المخزون — مفيش حساب مزدوج
  (كود V21.21.0 بيتخطّى أي SO له `sourceDistributionId`).

**ملاحظة blast radius:** الإيراد/COGS مابقاش يتسجّل لحظة البيع السريع — بيتسجّل
وقت ترحيل الفاتورة من أمر البيع. الفواتير القديمة المرحّلة قبل النسخة دي مش
هتتغيّر بأثر رجعي. مرتجع البيع السريع (return) لسه زي ما هو (المستخدم سأل عن
البيع فقط). مفيش local test — اختبار يدوي مطلوب على أول بيع سريع.

ملفات: `CustDeliverPg.jsx` · `package.json` · `constants/index.js` ·
`changelog.json`. بناء ✓ (`✓ built in 12.75s`).

---

## V21.27.89 (2026-06-21) — 👕 سجل حركات الجاهز في «المخزن والجرد» + شيله من المشتريات

طلب Ahmed: سجل حركات كامل تحت «المخزن والجرد والتقارير» لمخزن الجاهز فقط، يعرض كل
الحركات على الصنف، بفلتر بحث بالاسم والكود؛ + احذف قسم الجاهز من المشتريات
(تبقى قماش وإكسسوار بس).

**التنفيذ:**
- `src/pages/WarehousePg.jsx`: في تبويب الجاهز (`subTab==="finished"`)، تحت جدول
  الأرصدة، أضيف Card «📊 سجل حركات مخزن الجاهز»: يفلتر `stockMovements` على
  `itemType==="order"`، بحث `finSearch` (debounced) على الاسم/الملاحظات،
  pagination `finLimit` 50 + «عرض المزيد». state جديدة: `finSearch`/`finLimit`.
- `src/pages/PurchasePg.jsx`: اتشال زر تاب «👕 الجاهز» (`setStockTypeTab
  ("__finished")`) وبلوك محتواه بالكامل (`stockTypeTab==="__finished"`).
  بلوك «آخر حركات المخزن» اتشال منه شرط `stockTypeTab!=="__finished"` (بقى
  `stockEnabled&&...`). جدول الأصناف لسه متبقّي عليه شرط `!=="__finished"`
  (دايمًا true دلوقتي — مفيش تغيير سلوك).

ملفات: `WarehousePg.jsx` · `PurchasePg.jsx` · `package.json` ·
`constants/index.js` · `changelog.json`. بناء ✓ (`✓ built in 12.63s`).

---

## V21.27.88 (2026-06-21) — 🧮 كارت الصنف (الجاهز) بيخصم أوامر البيع من الرصيد

بلاغ Ahmed: «تقرير كارت الصنف مش بيجيب الحركات اللي تمت في أوامر البيع مباشر —
بيتجاهلها ومش بيخصمها من الرصيد».

**Root cause:** أوامر البيع بتسجّل «حجز موديل» كـ `stockMovement` بـ
`itemType:"order"` + `sourceType:"sales_order"` (حركة رقابية؛ التسليم الفعلي عبر
شاشة التسليم) — **من غير ما تنقص `o.deliveries`**. وتقرير «الجاهز» في
WarehousePg بيحسب الرصيد = `cutQty − getConfirmedStock(o.deliveries)` فقط، فأوامر
البيع **مش داخلة الحساب** → الرصيد الجاهز مبالغ فيه.

**الإصلاح — `src/pages/WarehousePg.jsx`:**
- import `computeSoReserved` من `stockCatalog.js` + `soReservedByOrder` (useMemo
  على `data.salesOrders`). نفس مصدر الحقيقة في شاشة التسليم/أوامر البيع، وبيستبعد
  مرايا التوزيعات (`sourceDistributionId`) اللي بتخصم بالفعل → مفيش حساب مزدوج.
- `wStats.finished`: الرصيد = `cutQty − del − reserved` (كان `cutQty − del`).
- جدول «موديلات لها رصيد جاهز»: عمود جديد «محجوز بأوامر البيع» (بنفسجي لو > 0)،
  والرصيد الجاهز بقى `cutQty − del − reserved`. الفرز اتعمل بعد حساب bal.

ملفات: `WarehousePg.jsx` · `package.json` · `constants/index.js` ·
`changelog.json`. بناء ✓ (`✓ built in 12.92s`).

---

## V21.27.87 (2026-06-21) — 📦 الرصيد المتاح جنب الصنف (inline) + في أوامر البيع

طلب Ahmed: لما يختار صنف في المرتجع الحر / أمر الشراء، شارة الرصيد بتطلع كسطر
تحت المستطيل → بصريًا وحش والمستطيل بيبان طايح لفوق. عاوز الرصيد جنب الكود.
+ في أوامر البيع عاوز الرصيد المتاح يظهر بمجرد اختيار الصنف.

**التنفيذ:**
- `src/components/sales/DocLineEditor.jsx`: `stockBadge` بقى **inline span** (بادج
  مدمج) جنب خانة المنتج بدل `div` بسطر تحتها. الصف بقى سطر واحد متّسق رأسيًا.
  ديسكتوب: خانة المنتج بقت flex (picker:flex1 + badge nowrap). موبايل: البادج
  بين الـ picker وزر الحذف. اللون أخضر (متاح) / أحمر (صفر) + tooltip بالمسمّى.
- `src/components/sales/QuotationFormModal.jsx`: أضيف `stockInfo` + مرّر لـ
  DocLineEditor (بيخدم العروض وأوامر البيع — mode="order"). المصادر:
  * أوردر جاهز → `computeOrderAvail(o, soReserved)` «المتاح للبيع» (المخزون −
    المُسلَّم/المرتجع − المحجوز بأوامر البيع؛ مرايا التوزيعات مستبعدة في
    computeSoReserved).
  * صنف مخزون / منتج عام → `.stock` المباشر «المتاح بالمخزن».
- المرتجع الحر للمورد (`FreeSupplierReturnModal`) وأمر الشراء/RFQ بياخدوا نفس
  التحسين تلقائيًا (نفس DocLineEditor، نفس props stockInfo الموجودة).

ملفات: `DocLineEditor.jsx` · `QuotationFormModal.jsx` · `package.json` ·
`constants/index.js` · `changelog.json`. بناء ✓ (`✓ built in 19.39s`).

---

## V21.27.86 (2026-06-21) — 🧵 تحقّق توافر الخامة في تسجيل أوردر القص

طلب Ahmed: في تسجيل الأوردر للقص، لما المستخدم يختار خامة:
1. لو رصيدها صفر → تظهر بالأحمر برسالة «الصنف غير متاح بالمخزن».
2. لو رصيدها > صفر → مع إدخال الراقات والكمية يُحسب الاستهلاك؛ لو أكبر من
   المخزن تظهر رسالة توضّح الفرق، **وتمنع التسجيل** وتحذّر المستخدم.

**التنفيذ — `src/pages/OrdForm.jsx`:**
- **بادج توافر المخزن** أسفل صف بيانات كل خامة مختارة (بين صف الاستهلاك/القطع
  وجدول الألوان FCTable):
  - `fb.stock<=0` → أحمر «⛔ الصنف غير متاح بالمخزن (الرصيد صفر)».
  - `needed>avail` → أحمر «⚠️ المطلوب X أكبر من المتاح Y — الفرق Z» (بالوحدة).
    حيث `needed = (الاستهلاك/راق) × إجمالي الراقات` (مجموع `c.layers` عبر الألوان)
    — نفس صيغة `calcStockNeeded` (الاستهلاك per-layer مش per-piece).
  - غير كده → باهت «📦 المتاح بالمخزن: X · المطلوب Y».
- **حظر الحفظ** في `save()`: نستدعي `checkStockAvailability(form,data)` (نفس
  الدالة اللي بيستخدمها بلوك App.jsx — منعًا للازدواج). لو `!ok` نعرض رسالة
  خطأ تفصيلية بكل خامة ناقصة (المطلوب/المتاح/الفرق) و`return`.
  الدالة بترجّع `ok:true` لو المخزن متعطّل → القيد آمن في كل الحالات.
- البادج بيظهر فقط لو `purchaseSettings.stockEnabled`. وضع الموديل
  (`modelMode`) مستثنى من الحظر (الحفظ بيرجع قبل بلوك القص).

**Imports:** أضيف `fmt` من `format.js` و`checkStockAvailability` من `orders.js`،
و`useMemo` من react (للاستخدام المستقبلي/الاتساق). كلاسات CSS:
`.ord-fab-stock-badge` + `.ofsb-err` + `.ofsb-ok`.

ملفات: `OrdForm.jsx` · `package.json` · `constants/index.js` · `changelog.json`.
بناء ✓ (`✓ built in 20.48s`).

---

## V21.27.85 (2026-06-21) — 🩹 إصلاحات: «--» · بوب اب تأكيد المرتجع · تكرار «فاتورة»

بلاغات Ahmed (بالصور):
1. حركة الخروج/المرتجع في سجل المخزن بتظهر بعلامتين «--50 كيلو».
2. بوب اب «تأكيد المرتجع» في المرتجع الحر بيظهر **تحت** المودال مش فوقه.
3. تكرار كلمة «فاتورة» في مرجع المرتجع بالسجل.

**الإصلاحات:**
- `src/pages/PurchasePg.jsx` (سجل آخر حركات المخزن، سطر ~1509): الكمية كانت
  `fmt(m.qty)` و`m.qty` مخزّنة سالبة للخروج + علامة «-» → «--50». بقت
  `fmt(Math.abs(Number(m.qty)||0))`. (تاب الجاهز كان متظبط بالفعل V69.)
- `src/components/purchase/FreeSupplierReturnModal.jsx`: `zIndex` اتنزّل من
  **100002** لـ **99998** — كان أعلى من بوب اب التأكيد (`ask` host z=100000 في
  `popups.js`) فالتأكيد كان بيختفي تحته. دلوقتي التأكيد فوق المودال.
- `src/components/PurchaseReturnPickerModal.jsx`: مرجع حركة المرتجع كان
  `"مرتجع مشتريات — فاتورة "+invoiceNo`، ورقم الفاتورة المخصّص (docNumbering
  V21.20.0) بيبدأ بـ«فاتورة شراء» → «فاتورة فاتورة شراء…». اتشال البادئة
  («مرتجع مشتريات — "+invoiceNo» + «مرتجع من "+invoiceNo» للإشعار).

ملفات: `PurchasePg.jsx` · `FreeSupplierReturnModal.jsx` · `PurchaseReturnPickerModal.jsx`.
بناء ✓ (`✓ built in 13.47s`).

**ملاحظة:** الحركات القديمة (اللي اتسجّلت قبل الإصلاح) مرجعها هيفضل فيه التكرار؛
الجديد بس هو اللي هيبقى نظيف.

---

## V21.27.84 (2026-06-21) — 🖨️ طباعة الاستلام والمرتجع: مع/بدون أسعار

طلب Ahmed: «في طباعة الاستلام للمشتريات لما أضغط طباعة تفتح بوب اب صغير اختار
إظهار/إخفاء الأسعار. النسخة المخفية فيها الأسعار تعرض كميات فقط (بدون عمود سعر/
خصم/إجمالي) — إجمالي كميات بس. ونفس الموضوع للمرتجع من المشتريات».

**التنفيذ:**
- مكوّن جديد `src/components/PrintPriceChoiceModal.jsx` — بوب اب اختيار صغير:
  «💰 مع الأسعار» / «📦 بدون الأسعار»، `onPick(showPrices)`.
- `src/pages/PurchasePg.jsx` (`printReceipt`): بارام `showPrices` — لو false:
  جدول البنود يبقى الصنف/الكمية/الوحدة فقط + سطر «إجمالي الكميات»، وقسم «تفاصيل
  الدفع» يختفي. زر الطباعة في معاينة الاستلام بقى يفتح البوب اب (`printRcpt`).
- `src/utils/printInvoice.js` (`printDebitNote`): بارام `showPrices` — لو false:
  أعمدة سعر الوحدة/الإجمالي تختفي وصندوق الإجماليات يتحوّل لـ «إجمالي الكميات
  المرتجعة».
- `src/pages/DebitNotesPg.jsx` (`DebitNoteDetailModal`): زر الطباعة يفتح البوب اب.

ملفات: `PrintPriceChoiceModal.jsx` (جديد) · `PurchasePg.jsx` · `printInvoice.js`
· `DebitNotesPg.jsx`. بناء ✓ (`✓ built in 13.69s`).

---

## V21.27.83 (2026-06-21) — ↪️ المرتجع الحر للمورد بند-بند (قائمة محصورة)

طلب Ahmed: «المرتجع الحر بيعرض كل أصناف المورد جاهزة — مش ده اللي عايزه. عايز
أنزّل بند-بند زي الطبيعي، ولما أختار الصنف في القائمة يظهر بس الأصناف اللي
اشتريتها من المورد ده».

**التنفيذ:** أُعيد بناء `src/components/purchase/FreeSupplierReturnModal.jsx`
ليستخدم `DocLineEditor` (نفس محرّر بنود أمر الشراء):
- `recvMap` (useMemo): يجمّع أصناف المورد المستلَمة (مستلم/مرتجع سابق/متبقّي/
  متوسط سعر).
- `productOptions`: بس الأصناف اللي `remaining > 0` (قائمة المنتجات في المحرّر).
- `resolveProduct`: يحلّ الاختيار لـ {sourceType,sourceId,modelNo,unit,unitPrice}.
- `stockInfo` → «المتبقي للإرجاع» تحت كل بند (label مخصّص — أُضيف دعمه في
  `DocLineEditor.stockBadge`).
- عند التأكيد: تجميع البنود حسب الصنف + **قصّ الكمية على المتبقّي** + (نفس
  V81/V82) عكس المخزون + إشعار مدين + توزيع FIFO على `receipt._returns`.
- `DebitNotesPg`: مرّر `isMob` للمودال.

ملفات: `FreeSupplierReturnModal.jsx` · `DocLineEditor.jsx` · `DebitNotesPg.jsx`.
بناء ✓ (`✓ built in 20.19s`).

---

## V21.27.82 (2026-06-21) — 🔧 المرتجع من الفاتورة يخصم المخزن + مرجع المرتجع clickable

بلاغ Ahmed (بالصورة): عمل مرتجع للصنف TEST، لكن الرصيد ماتخصمش وحركة المرتجع
ماظهرتش في السجل بالأحمر. + في كشف حساب المورد عايز مرجع المرتجع clickable زي
المشتريات.

**السبب الجذري (Issue 1):** الإشعار المدين DN-2026-0002 كان مربوط بفاتورة شراء
→ اتعمل من زر «ارتجاع للمورد» على الفاتورة (`PurchaseReturnPickerModal`).
`handleConfirm` كان بينادي `upsertDebitNoteFromReturn` **بس** — من غير
`applyStockDelta` ولا حركة مخزن (عكس `saveReceiptReturn` والمرتجع الحر).

**الإصلاح:**
- `src/components/PurchaseReturnPickerModal.jsx`: داخل `upConfig` ضفت — لو المخزن
  مفعّل: `applyStockDelta` سالب لكل بند + clamp + حركة `purchase_return`
  (خروج، حمراء في السجل، sourceId=الفاتورة) + توزيع الكمية على استلامات المورد
  (FIFO) في `receipt._returns` للحفاظ على اتساق `returnedByLine`. imports:
  `applyStockDelta`, `getCategoryById`, `gid`.
- `src/utils/accounting/statement.js`: صفوف الإشعار المدين (`type:"debit_note"`)
  في الوضعين بقت تحمل `detail:{kind:"invoice",items:dn.items}` →
  `AccountStatementView` بيعرض المرجع كرابط clickable يفتح بنود المرتجع (drill)
  زي الاستلامات/الفواتير.

ملفات: `PurchaseReturnPickerModal.jsx` · `statement.js`. بناء ✓ (`✓ built in 12.63s`).

**⚠️ ملاحظة بيانات:** الإصلاح للمرتجعات **الجديدة**. المرتجع القديم DN-2026-0002
اتعمل من غير حركة مخزن — لتصحيح رصيد TEST: الغِ/احذف DN-2026-0002 وأعد عمل
المرتجع (هيتسجّل الخصم صح)، أو سوِّ الرصيد يدويًا.

---

## V21.27.81 (2026-06-21) — ↪️ مرتجع مورد حر (في الإشعارات المدينة)

طلب Ahmed: «في الإشعارات المدينة والمرتجعات للموردين عاوز أضيف مرتجع حر. زر
إضافة مرتجع يفتح بوب اب نفس نظام/بنود مرتجع المبيعات، ولما أختار المورد يعرض بس
الأصناف اللي تم استلامها من المورد ده مش كل الأصناف».

**التنفيذ:**
- مكوّن جديد `src/components/purchase/FreeSupplierReturnModal.jsx` — مستقل
  (props: `data, upConfig, user, onClose, onCreated`):
  - يجمّع أصناف المورد المستلَمة عبر **كل** استلاماته (`data.purchaseReceipts`)
    مع: إجمالي المستلم − المرتجع سابقًا (من `receipt._returns`) = المتبقي،
    ومتوسط سعر مرجّح.
  - جدول بنود (الصنف/المستلم/مرتجع سابق/المتبقي/كمية المرتجع/السعر/القيمة)،
    كل كمية مقيّدة بالمتبقي + أزرار «مرتجع الكل/تصفير» + سبب.
  - عند التأكيد (mirror لـ `saveReceiptReturn`): عكس المخزون
    (`applyStockDelta` سالب + حركة `purchase_return`) لو المخزن مفعّل +
    `upsertDebitNoteFromReturn` (إشعار مدين) + **توزيع الكمية المرتجعة على
    استلامات المورد FIFO** وتسجيلها في `receipt._returns` (`_free:true`) —
    عشان `returnedByLine` يفضل متّسق بين المرتجع الحر والمرتجع من الاستلام.
- `src/pages/DebitNotesPg.jsx`: زر «➕ إضافة مرتجع» في الهيدر + state
  `showAddReturn` + رندر المودال.

ملفات: `FreeSupplierReturnModal.jsx` (جديد) · `DebitNotesPg.jsx`.
بناء ✓ (`✓ built in 13.09s`).

**✅ اكتملت دفعة Ahmed الثلاثية:** الكمية المتاحة تحت الصنف (V79) · الطباعة
بالأسود (V80) · المرتجع الحر للمورد (V81).

---

## V21.27.80 (2026-06-21) — 🖨️ المطبوعات والتقارير بالأسود الغامق

طلب Ahmed: التقارير والمطبوعات في المبيعات والمشتريات تكون باللون الأسود
الغامق فقط.

**القرار:** `PRINT_CSS` مشترك عبر كل الطباعات (`print.js`/`printInvoice.js`/
`PurchasePg`/`reportPrint`...). بدل مطاردة كل بانٍ على حدة، عدّلت `PRINT_CSS`
نفسه (في `src/constants/index.js`) — تغيير styling فقط، منخفض المخاطر وقابل
للعكس. طُبِّق عامًّا للتناسق (مش بس المبيعات/المشتريات).

**التنفيذ:** كل ألوان النص → `#000`، الحدود → `#000`، رأس الجدول خلفية رمادي
فاتح `#E5E7EB` نص أسود، صفوف زوجية `#F3F4F6`. الـ `.info/.ok/.err/.warn` بقت
أسود. + override أخير:
`#report-content *,body>*:not(.pbar) *,.hdr *,table *,.sig *,.foot *{color:#000!important}`
يجبر أي لون inline في بُناة الطباعة (printPo header `color:#0284C7` إلخ) على
الأسود — بحيث الطباعة والـ PDF أسود بالكامل. استثنى `.pbar` (شريط أدوات
المعاينة على الشاشة) عشان يفضل بألوانه. الخلفيات فاتحة والشعار (صورة) زي ما هو.

ملف واحد: `constants/index.js` (`PRINT_CSS`). بناء ✓ (`✓ built in 12.88s`).

**ملاحظة:** التغيير عامّ فطال كمان طباعات HR/المحاسبة (أصبحت أسود). لو Ahmed
عايز تقارير معيّنة (مثلاً أعمار الديون بالألوان) تفضل ملوّنة → نستثنيها بنسخة
`PRINT_CSS` ملوّنة خاصة بيها.

---

## V21.27.79 (2026-06-21) — 📦 الكمية المتاحة بالمخزن تحت الصنف في أمر الشراء

طلب Ahmed: في أمر الشراء لما أختار صنف، يظهر بلون باهت تحته الكمية المتاحة في
المخزن من الصنف ده.

**التنفيذ:**
- `src/components/sales/DocLineEditor.jsx`: prop `stockInfo(it)→{qty,unit}|null`.
  لو متاح → شارة باهتة تحت خانة المنتج (ديسكتوب وموبايل): «📦 المتاح بالمخزن: X»
  (أخضر >0، أحمر =0). متوافق — مفيش تأثير على المستندات اللي مابتمرّرش stockInfo.
- `src/pages/PurchasePg.jsx`: `poLineStockInfo(it)` يحسب الصافي من `stockNetMap`
  (V21.27.77) بالـ `it.sourceId`، وfallback لرصيد الصنف المخزّن لو مفيش حركات؛
  ويُمرَّر للـ DocLineEditor في فورم أمر الشراء.

ملفات: `DocLineEditor.jsx` · `PurchasePg.jsx`. بناء ✓ (`✓ built in 13.59s`).

**🔜 باقي دفعة Ahmed:** الطباعة/التقارير بالأسود فقط · المرتجع الحر للمورد
(زر «إضافة مرتجع» في الإشعارات المدينة، نظام بنود زي مرتجع المبيعات، يعرض أصناف
المورد المستلَمة فقط).

---

## V21.27.78 (2026-06-20) — 📎 إضافة المرفقات: بوب اب «اختر المصدر»

طلب Ahmed: في أمر الشراء لما أضغط إضافة مرفق بيفتح الكمبيوتر فقط — عايزه يفتح
بوب اب واختار كمبيوتر أو مساحة التخزين. (بالصورة: بوب اب «اختر المصدر» —
من الكمبيوتر / من مساحة التخزين.)

**القرار:** «مساحة التخزين» = الملفات المرفوعة بالفعل في مكتبة المستندات
(`data.documentsTree`)، مش جوجل درايف. المكوّنات موجودة بالفعل
(`ImagePickButton` + `DocumentImagePicker` — مستخدمة في صور الموديلات/الاستوديو).
الشغل = توصيلها بنظام المرفقات.

**التنفيذ:**
- `src/utils/universalAttachments.js`: دالة `linkAttachmentFromUrl(entityType,
  entityId, fileRec, user)` — تعمل سجل attachment يشير لـ `downloadURL` موجود
  بدون رفع جديد. `storagePath=""` + `linkedFromLibrary:true` → soft-delete
  مايحذفش ملف المكتبة.
- `src/components/attachments/AttachmentUploader.jsx`: prop `data` جديد. لو
  متاح → الزر بقى `ImagePickButton` (بوب اب اختر المصدر: كمبيوتر→`handleFiles`
  رفع، مساحة التخزين→`handlePickedFromStorage` ربط). `imagesOnly={false}`
  (صور+PDF). غير متاح → السلوك القديم (ملف مباشر) — متوافق رجعياً.
- `src/components/attachments/AttachmentList.jsx`: prop `data` ويمرّره للـ uploader.
- مرّرنا `data={data}` لكل `AttachmentList` في دورة الشراء (أمر/استلام/فاتورة/مورد)
  في `PurchasePg.jsx` و`SalesInvoicesPg.jsx`.

ملفات: `universalAttachments.js` · `AttachmentUploader.jsx` · `AttachmentList.jsx`
· `PurchasePg.jsx` · `SalesInvoicesPg.jsx`. بناء ✓ (`✓ built in 22.64s`).

---

## V21.27.77 (2026-06-20) — ⚖️ رصيد المخزن = صافي الحركات الفعلي تلقائياً

بلاغ Ahmed (بالصورة): الصنف TEST عنده استلامين (REC-001 +100، REC-002 +200 =
300) بس الرصيد بيعرض 200 — لأن `item.stock` المخزّن لسه 200 (REC-001 ماطبّقش
قبل إصلاح V21.27.68، وزر «مطابقة الأرصدة» ماتضغطش). طلبه: «الرصيد يكون اجمالي
حركات الاستلام ناقص الصرف والمرتجع = الصافي الفعلي» — تلقائياً.

**التنفيذ (`src/pages/PurchasePg.jsx` — تاب المخزن):**
- `stockNetMap` (useMemo, single-pass): يمر على `data.stockMovements` مرة واحدة،
  مفهرس بـ `String(itemId)`، يحسب الصافي زمنياً — `in`/`opening` موجب، `out`
  (صرف/مرتجع) سالب، `adjust` يضبط القيمة المطلقة. يستثني حركات الجاهز
  (`itemType:"order"`).
- `netStockOf(it)` = `stockNetMap` لو الصنف له حركات، وإلا `item.stock` (رصيد
  مباشر/قديم بدون حركة — مايتصفّرش).
- `filteredStock` (جدول المخزن) + `stockStats` (بطاقات القيمة/النافذ/الناقص)
  بقوا يستخدموا `netStockOf` بدل `item.stock` → الرصيد دايماً الصافي الفعلي.

النتيجة: TEST يظهر 300 تلقائياً. زر «مطابقة الأرصدة» باقي لمزامنة `item.stock`
المخزّن (اللي بتستخدمه صفحات تانية زي تقييم لوحة التحكم).

ملف واحد: `PurchasePg.jsx`. بناء ✓ (`✓ built in 12.35s`).

---

## V21.27.76 (2026-06-20) — 🔝 مودال المراجعة فوق البوب اب + عرض السعر بالجنيه فقط

طلب Ahmed:
- في أمر الشراء والاستلام لما أعمل طلب مراجعة بيفتح **تحت** البوب اب مش فوقه.
- في عرض السعر العملة جنيه مصري فقط — امسح الباقي.

**التنفيذ:**
- `src/components/ReviewRequestModal.jsx`: `zIndex` اترفع من 9500 لـ **100005**.
  بوب ابات المستندات (أمر شراء/استلام/فاتورة) z-index بين 99998 و100001، فالمراجعة
  كانت تحتها. دلوقتي فوق الكل. (إصلاح عام — يفيد كل أماكن المراجعة: فواتير/HR/أوامر.)
- `src/utils/purchase/rfq.js`: `PURCHASE_CURRENCIES = ["EGP"]` (كانت 7 عملات).
  مستخدم في `RfqFormModal` فقط، فالقائمة بقت الجنيه بس وخانة سعر الصرف بتختفي.

ملفات: `ReviewRequestModal.jsx` · `rfq.js`. بناء ✓ (`✓ built in 19.55s`).

**🔜 جاي:** رصيد المخزن = صافي حركات (استلام − صرف − مرتجع) يظهر تلقائياً.

---

## V21.27.75 (2026-06-20) — 📐 تضييق عرض قائمة العملاء

طلب Ahmed: «في قائمة العملاء صغّر حجم الصفحة بالعرض شوية يكون شكلها أفضل وتكون
الأعمدة متقاربة».

**التنفيذ (`src/pages/CustDeliverPg.jsx`):** الحاوية الداخلية لـ view العملاء
(سطر ~3683) كانت `maxWidth:"100%"` فبتتمدد على عرض الشاشة كله (الأعمدة متباعدة
على الشاشات العريضة). اتغيّرت لـ `maxWidth:1200` مع `margin:0 auto` (متوسّطة) —
الأعمدة بقت متقاربة وشكلها أفضل. على الموبايل مفيش تأثير (الـ cap أعلى من عرض
الشاشة).

تغيير سطر واحد. بناء ✓ (`✓ built in 12.71s`).

---

## V21.27.74 (2026-06-20) — 📌 زر «طلب مراجعة» لأمر الشراء والاستلام

طلب Ahmed: «ضيف زر طلب مراجعة لإشعار مستخدم يراجع أمر الشراء أو الاستلام أو
الفاتورة». (الفاتورة كان عندها الزر؛ ضفناه للأمر والاستلام.)

**التنفيذ (إعادة استخدام `ReviewRequestModal` الموجود):**
- `src/pages/PurchasePg.jsx`: import `ReviewRequestModal` + state `showReview` +
  زر «📌 طلب مراجعة» في فوتر معاينة الأمر (`link.type="po"`) ومعاينة الاستلام
  (`link.type="receipt"`) + رندر المودال.
- `src/App.jsx` (`handleNotifLinkClick`): إضافة توجيه `po`/`receipt` — يفتح تاب
  `purchase` ثم `openPurchaseDoc(type,id)` (يستخدم آلية `clark-open-purchase-doc`
  الموجودة). قبل كده كان راوتر الإشعارات بيقول «نوع الوجهة غير مدعوم» للنوعين.

ملفات: `PurchasePg.jsx` · `App.jsx`. بناء ✓ (`✓ built in 13.63s`).

**✅ اكتملت دفعة Ahmed على دورة المشتريات** (V21.27.71→74): مرفقات معاينة الأمر،
منع الاستلام/الإلغاء المكرر، حالة «مفوتر»، مرفقات الفاتورة/الاستلام على الجنب،
وطلب المراجعة.

---

## V21.27.73 (2026-06-20) — 📎 مرفقات فاتورة الشراء على الجنب + مرفقات الاستلام المزدوجة

طلب Ahmed:
- في فاتورة الشراء تظهر المرفقات على الجنب زي أمر الشراء — مش تحت.
- في الاستلام: مرفقات أمر الشراء على الجنب + المستخدم يضيف مرفقات تانية للاستلام.

**التنفيذ:**
- `src/pages/SalesInvoicesPg.jsx` (`InvoiceDetailModal`): إعادة هيكلة لعمودين
  (`flex row`/`column` موبايل، `maxWidth` 1280). المحتوى في عمود يسار scrollable،
  والمرفقات اتنقلت من وسط المحتوى لعمود جانبي يمين (340px). يخص البيع والشراء.
- `src/pages/PurchasePg.jsx`:
  - معاينة الاستلام (`viewReceipt`): عمودين، لوحة جانبية فيها **لوحتين** —
    `purchaseOrders/{_poId}` (مشتركة، عرض) + `purchaseReceipts/{id}` (خاصة
    بالاستلام، إضافة).
  - فورم الاستلام: نفس اللوحتين (مرفقات الاستلام الخاصة تتضاف بعد الحفظ — تعرض
    تلميح «احفظ أولاً» قبلها).

ملفات: `SalesInvoicesPg.jsx` · `PurchasePg.jsx`. بناء ✓ (`✓ built in 13.28s`).

**🔜 باقي الدفعة:** زر «طلب مراجعة» على أمر الشراء والاستلام (نسخة جاية).

---

## V21.27.72 (2026-06-20) — 🧾 منع إلغاء أمر مُستلَم + حالة «مفوتر» للاستلام

طلب Ahmed (ضمن دفعة على دورة المشتريات):
- ماينفعش إلغاء أمر اتعمل عليه استلام → زر «إلغاء الأمر» باهت وغير فعّال.
- حذف جملة «لا يمكن الاستلام مرة أخرى» (مالهاش داعي).
- الاستلام المفوتر يظهر «مفوتر» في الحالة جنب حالة الدفع.

**التنفيذ (`src/pages/PurchasePg.jsx`):**
- معاينة الأمر (`viewPo`): لو `poLinkedReceipts(viewPo).length>0` → زر الإلغاء
  باهت (`opacity:0.45`, `cursor:not-allowed`) + `onClick` يعرض toast يوجّه لعمل
  مرتجع. غير كده يفضل فعّال زي ما هو.
- حذف الـ span «تم استلام كل الكمية — لا يمكن التحويل…» من بانر الحالة.
- بادج «🧾 مفوتر» (`findInvoiceByReceipt`) جنب حالة الدفع في: قائمة الاستلامات
  (خانة الحالة) + معاينة الاستلام (`viewReceipt` تفاصيل الدفع).

ملف واحد: `PurchasePg.jsx`. بناء ✓ (`✓ built in 20.70s`).

**🔜 باقي الدفعة (نسخ جاية):** مرفقات الاستلام الجانبية (أمر الشراء + مرفقات
خاصة بالاستلام) · مرفقات فاتورة الشراء على الجنب (مش تحت) · زر «طلب مراجعة»
على أمر الشراء والاستلام.

---

## V21.27.71 (2026-06-20) — 📋 معاينة أمر الشراء: مرفقات + حالة الاستلام + منع الاستلام المكرر

طلب Ahmed (4 نقاط على أمر الشراء — قالها «أمر بيع» بس السياق أمر شراء):
1. المرفقات تظهر في الجنب وقت **فتح/معاينة** الأمر (مش التعديل بس).
2. الأمر اللي اتحوّل لاستلام كامل **مايظهرش زر «تحويل لاستلام»** (منع استلام مكرر).
3. حالة الاستلام مكتوبة فوق الأمر: مستلم كامل / جزئي / لم يتم.
4. بعد الاستلام الكامل الزر يختفي — مع التأكيد على المنع.

**التنفيذ:**
- `src/utils/purchase/purchaseOrders.js`: تحديث `PO_STATUS_META` labels لصياغة
  صريحة — `open`→«لم يتم الاستلام»، `partial`→«مستلم جزئياً»،
  `completed`→«مستلم بالكامل». بينعكس في كل أماكن عرض الحالة.
- `src/pages/PurchasePg.jsx`:
  - معاينة الأمر (`viewPo`) بقت **عمودين** (form | لوحة مرفقات 360px) responsive،
    `AttachmentList entityType="purchaseOrders" entityId={viewPo.id}`.
  - بانر حالة الاستلام بارز فوق المعاينة (أيقونة + label + رسالة منع عند الاكتمال).
  - إخفاء زر «تحويل لاستلام» عند `completed`/`cancelled` في **3 أماكن**: صف
    القائمة (1662)، معاينة `viewPo`، بوب اب `previewPo`. (منتقي الاستلام في
    فورم الاستلام كان مفلتر أصلاً.)
  - **حارس داخلي** في `convertPoToReceipt`: يرفض ويعرض toast لو الأمر مكتمل/ملغي
    (defense-in-depth — حتى لو أي مسار ناداها).

ملفات: `purchaseOrders.js` · `PurchasePg.jsx`. بناء ✓ (`✓ built in 17.18s`).

---

## V21.27.70 (2026-06-20) — 🔄 زر «مطابقة الأرصدة مع الحركات» (تصحيح الاستلامات القديمة)

بلاغ Ahmed بعد نشر V21.27.69: «رصيد المخزن صفر لسه» (الصنف TEST). متوقّع —
إصلاح V21.27.68 بيخص الاستلامات الجديدة؛ الاستلام القديم (REC-2026-001) اتعمل
بالكود المعطوب فالرصيد ماترفعش، ومفيش طريقة في تاب المخزن لتعديل الرصيد يدوياً
(محرّر الصنف مافيهوش حقل stock).

**الحل (§10 — repair on-demand بمعاينة):** زر «🔄 مطابقة الأرصدة» في شريط
فلاتر تاب المخزن. بيعيد حساب رصيد كل صنف = مجموع حركاته:
- `computeItemStockFromMoves(itemId)`: يرتّب حركات الصنف زمنياً ويحسب —
  `in`/`opening` موجب، `out` سالب، `adjust` يضبط القيمة المطلقة. يستثني حركات
  الجاهز (`itemType:"order"`).
- `syncStockFromMovements()`: يمسح fabrics + accessories + inventoryItems،
  يجمع الفروق (computed ≠ current)، يعرض **معاينة** (أول 15 صنف: current ←
  computed) + عدد، ويطبّق بعد التأكيد فقط. لو مفيش فروق → رسالة «الأرصدة
  مطابقة» بدون تغيير.

بيصلّح TEST (0 ← 100) وأي صنف متأثر بنفس الـ bug في كبسة واحدة، بأمان وشفافية.

ملف واحد: `PurchasePg.jsx`. بناء ✓ (`✓ built in 31.37s`).

**ملاحظة:** الزر بيطابق الرصيد مع الحركات؛ أي صنف رصيده اتسجّل يدوياً من غير
حركة (نادر) هيرجع لمجموع حركاته — عشان كده فيه معاينة قبل التطبيق.

---

## V21.27.69 (2026-06-20) — 👕 تاب «الجاهز» في المخزن + عرض حركات الموديلات

طلب Ahmed: «عاوز تاب الجاهز برضه يظهر في الاخر ونشوف الحركات اللي تمت على
الجاهز زي ما هو ظاهر في السجل».

**فهم البيانات:** حركات الجاهز موجودة بالفعل في `data.stockMovements` بـ
`itemType:"order"` (حركات رقابية: حجز/تسليم/إلغاء موديلات أوامر البيع — تتولّد
في `src/utils/sales/salesOrders.js`). كانت بتظهر مخلوطة مع حركات الخامات في
السجل العام.

**التنفيذ (`src/pages/PurchasePg.jsx` — تاب المخزن):**
- تاب «👕 الجاهز» في آخر صف التابات (بعد فئات `itemCategories`؛ زر «+ صنف»
  بيختفي تلقائياً لأن `getCategoryById(data,"__finished")` = null). state
  `stockTypeTab==="__finished"`.
- على التاب: جدول الأصناف العادي + كارت الحركات السفلي **يختفيان**، ويظهر عرض
  مخصّص بيفلتر `stockMovements` على `itemType==="order"`، بحث بالموديل،
  وPagInation (50 + «عرض المزيد») بنفس `movLimit`.

ملف واحد: `PurchasePg.jsx`. بناء ✓ (`✓ built in 14.55s`).

**ملاحظة:** العرض ده حركات رقابية (مش رصيد جاهز فعلي = مقصوص − مُسلَّم؛ ده
بيتحسب في شاشة التسليم/WarehousePg عبر calcOrder/getConfirmedStock). لو Ahmed
عايز عمود «الرصيد الجاهز» المحسوب هنا كمان، يتضاف في نسخة لاحقة.

---

## V21.27.68 (2026-06-20) — 🐛 إصلاح حرج: الاستلام مايزوّدش رصيد المخزن + سجل الحركات

طلب/بلاغ Ahmed: «لما عملت استلام المفروض الكمية تظهر في المخزن، فتحت المخزن
على الصنف لقيت الرصيد صفر. عاوز الكمية المستلمة تضاف للرصيد. وكمان الصنف اللي
عملت عليه فلتر هو بس اللي يظهر سجل حركاته تحت. وعاوز السجل يعرض ٥٠ حركة وزر
عرض المزيد».

**🔴 السبب الجذري (Root Cause) — تكامل بيانات:**
الخامات/الإكسسوار المُنشأة من محرّر الأصناف («+ خامة جديدة») بتاخد id **رقمي**
(`Date.now()+Math.floor(rand)` — `PurchasePg.jsx` سطر ~1851/1860)، بينما بنود
الاستلام بتحمل الـ id كـ **نص**. الدالة `applyStockDelta` (`categories.js`) كانت
بتقارن `x.id===itemId` بمقارنة **صارمة** → رقم `===` نص = false → الصنف مش
بيتلاقى → الحركة تتسجّل في `stockMovements` لكن `item.stock` **مايتحدّثش**.
الدليل القاطع من الصورة: «آخر استلام» اتحدّث (سطر 867-869 بيستخدم
`String(x.id)===String(it.itemId)` فضفاضة — نجح) لكن «الرصيد» فضل صفر (المقارنة
الصارمة فشلت). كل مقارنات الـ id في كود المخزون String()-based ماعدا
`applyStockDelta` — كان الاستثناء الوحيد.

**الإصلاح:**
- `src/utils/categories.js`: `applyStockDelta` يستخدم `String(x.id)===String(itemId)`
  في الفروع الثلاثة (fabric/accessory/inventoryItems). تعليق ROOT-CAUSE موثّق.
- `src/pages/PurchasePg.jsx` (`saveReceipt`): التقاط القيمة المرجعة من
  `applyStockDelta` + `console.warn` لو فشل (رصد الفشل الصامت مستقبلاً).

**ملاحظة هجرة:** الإصلاح بيخصّ الاستلامات **الجديدة**. الأصناف اللي اتأثرت
قبل كده (زي TEST) محتاجة تسوية رصيد يدوية (زر ⇅ في المخزن) أو إعادة استلام.

**تحسينات سجل «آخر حركات المخزن» (نفس الشاشة — تاب المخزن في `PurchasePg`):**
- فلترة بالصنف: لو في بحث على الأصناف، السجل يعرض حركات الأصناف المُفلترة فقط
  (مطابقة بالـ id String). من غير بحث = الكل.
- Pagination: 50 حركة + زر «عرض المزيد» (+50) + عدّاد «عرض X من Y». state
  جديد `movLimit`.

ملفات: `categories.js` · `PurchasePg.jsx`. بناء ✓ (`✓ built in 19.95s`).

**🔜 الباقي من بلاغ Ahmed:** تاب «الجاهز» في آخر تابات المخزن + عرض حركات
الجاهز (موديلات أوامر البيع — موجودة في `stockMovements` بالفعل). نسخة جاية
بعد فحص شكل حركات الجاهز (itemType/sourceType).

---

## V21.27.67 (2026-06-20) — 📎 مرفقات دورة المشتريات (أمر · استلام · فاتورة) مشتركة

طلب Ahmed: «في أمر الشراء عاوز أدرج ملف أو صورة من الكمبيوتر... لو صورة تظهر
في الجنب بنفس ارتفاع البوب اب ولو PDF يظهر ولما أضغط يفتح في الصفحة كلها. بعد
التأكيد ينزل بلينك المرفقات بنفس الطريقة في الأمر. مرفقات الفاتورة تكون نفس
لينك مرفقات الأمر».

**القرار المعماري — إعادة استخدام لا بناء من الصفر:** CLARK عنده نظام مرفقات
ناضج بالكامل (`universalAttachments.js` + `AttachmentList` + `AttachmentViewer`)
مستخدم في المورّدين/الفواتير/الموظفين. المسار `attachments/**` متغطّى بقاعدة
`storage.rules` موجودة → **صفر تعديل على القواعد** (تماشياً مع §1: لا بيئة
اختبار، تجنّب أي تغيير rules عالي المخاطر). الشغل = توصيل + نموذج مشاركة.

**نموذج المشاركة (طلب Ahmed «نفس لينك مرفقات الأمر»):** كل دورة الشراء بتشارك
مخزن مرفقات واحد مفتاحه `entityId = أمر الشراء`:
- أمر الشراء → `entityType="purchaseOrders" entityId={po.id}`.
- الاستلام المرتبط بأمر → نفس `purchaseOrders/{poId}` (يعرض ملفات الأمر). الاستلام
  اليدوي (بدون أمر) → `purchaseReceipts/{rcpt.id}`.
- فاتورة الشراء المرتبطة → تُحَلّ لأمر الشراء من أول استلام مرتبط له `_poId`،
  وتعرض `purchaseOrders/{poId}`. غير المرتبطة تحتفظ بـ `purchaseInvoices/{id}`.

**التنفيذ:**
- `src/utils/universalAttachments.js`: إضافة `"purchaseOrders"` + `"purchaseReceipts"`
  لـ `ATTACHMENT_ENTITY_TYPES`.
- `src/pages/PurchasePg.jsx`: فورم الأمر + فورم الاستلام اتحوّلوا لتخطيط عمودين
  (`flex row` ديسكتوب / `column` موبايل، `maxWidth` 1260): العمود الأساسي =
  الفورم، العمود الجانبي (360px بكامل الارتفاع) = `AttachmentList`. الجسم
  الداخلي بيفضل يـ scroll مستقل.
- `src/pages/SalesInvoicesPg.jsx` (`InvoiceDetailModal` المشترك): resolver
  `_srcPoId` يربط الفاتورة بأمر الشراء؛ لوحة المرفقات توجّه على الأمر لما يُحَلّ.

**العرض/الفتح:** `AttachmentViewer` (الموجود) بيفتح الصور بملء الشاشة بتكبير/
تحريك والـ PDF في عارض كامل — يحقّق «يفتح في الصفحة كلها». الرفع من الكمبيوتر/
الكاميرا + ضغط الصور تلقائي (من `AttachmentUploader`).

ملفات: `universalAttachments.js` · `PurchasePg.jsx` · `SalesInvoicesPg.jsx`.
بناء ✓ (`✓ built in 14.10s`).

**ملاحظة UX:** الأمر الجديد (قبل أول حفظ) اللوحة بتعرض تلميح «احفظ أولاً» —
المرفقات تتضاف بعد الحفظ أو من شاشة التعديل (تجنّبنا توليد id مبكّر حفاظاً على
دلالة isEdit). الاستلام المرتبط بأمر بيشتغل فوراً لأنه بيستخدم id الأمر.

---

## V21.27.66 (2026-06-20) — 🛠️ إصلاح استلام أمر الشراء (اسم الصنف + الكمية المطلوبة)

طلب Ahmed (ضمن طلب أكبر لتطوير دورة المشتريات): «في الاستلام لما اخترت المورد
ونزّلت الاستلام للمعاينة ظهر الصنف فاضي مفيش كتابة... كمان الكمية المطلوبة في
أمر الشراء مش ظاهرة، المفروض تظهر الكمية كلها وأنا أقول استلمت كام والمتبقي
يتحسب الفرق».

**السبب الجذري (Root Cause):**
- **«الصنف فاضي»:** خانة الصنف في جدول الاستلام كانت بتعرض `SearchSel`
  بقيمة `itemId` فقط. لو الصنف نصّ حر أو `itemId` مش موجود في قائمة الفئة →
  القائمة تعرض «اختر...» فاضية رغم إن `itemName` محفوظ في السطر.
- **«المطلوب = —»:** `savePo` كان بيعيد بناء بنود أمر الشراء في object
  **من غير حقل `id`** (رغم إن `editorToPo` بيولّده). فالبنود المحفوظة مالهاش
  id ثابت → `convertPoToReceipt` بياخد `_poLineId = it.id = undefined` →
  الجدول بيعرض «—» لأنه كان بيعتمد على `it._poLineId`. (ده كمان كان بيكسر
  تتبّع الاستلام الجزئي للأوامر متعددة البنود لأن `poLineProgress` بيفهرس
  بـ id السطر.)

**التنفيذ (`src/pages/PurchasePg.jsx`):**
- `savePo`: حافظ على `id:it.id||gid()` لكل بند عند الحفظ → id ثابت يصلّح
  الربط والتتبّع. الأوامر القديمة تتصلّح أول ما تتعدّل وتتحفظ.
- جدول الاستلام: أعمدة «المطلوب/مستلم سابقاً/المتبقي» وتحذير «تجاوز المتبقي»
  بقت تعتمد على `it._fromPo` بدل `it._poLineId` → تظهر للأوامر القديمة
  والجديدة (لأن `convertPoToReceipt` بيضبط `_fromPo` و`_orderedQty` دايماً).
- خانة «الصنف»: الصفوف الجاية من أمر شراء (`it._fromPo`) تعرض `itemName`
  (+الكود) كنص للقراءة بدل المنسدلة — الصنف محدد سلفاً عند الاستلام. السطور
  اليدوية تفضل منسدلة `SearchSel` زي ما هي.

ملف واحد: `PurchasePg.jsx`. بناء ✓ (`✓ built in 21.93s`).

**🔜 الباقي من طلب Ahmed (المرفقات — نسخة جاية):** ربط نظام المرفقات الموجود
(`AttachmentList`/`AttachmentViewer`) بأمر الشراء + الاستلام + الفاتورة، بنموذج
**مرفقات مشتركة** (الاستلام والفاتورة يعرضوا نفس ملفات الأمر عبر نفس
`entityType="purchaseOrders"` + `entityId`). مفيش تعديل على `storage.rules`
(المسار `attachments/**` متغطّى). محتاج إضافة `"purchaseOrders"` (و
`"purchaseReceipts"` للاستلام اليدوي) لـ `ATTACHMENT_ENTITY_TYPES`.

---

## V21.27.65 (2026-06-18) — 🔔 رسائل الخطأ بوب اب ثابت بزر «إغلاق»

طلب Ahmed: «رسائل الخطأ في الإشعار الأخضر بتظهر ثواني وتختفي — عايزها بوب اب
صغير أسفل الشاشة مايختفيش غير لما أضغط زر إغلاق، ولرسائل الخطأ فقط مش أكتر».

**التنفيذ (`src/utils/popups.js`):**
- `showToast` بقت تكتشف رسالة الخطأ من الرمز اللي في أولها
  (`⛔ ⚠ ❌ ✕ ✗ 🛑`) وتوجّهها لـ `_showErrorPopup` بدل التوست الأخضر العابر.
- البوب اب: أحمر فاتح (`#FEF2F2` + حدود `#EF4444`)، أسفل الشاشة، بزر «إغلاق»
  أحمر — **مايختفيش إلا بالضغط** (مفيش `setTimeout` auto-dismiss).
- الأخطاء المتعددة تتراكم في عمود (`__clark_err_stack`) كل واحد بزر إغلاق.
- رسائل النجاح (`✓ ✅ ✨`) والمعلومات (`ℹ ⏳ ↩`) تفضل توست عابر زي ما هي —
  مفيش تغيير عليها.
- مسح كامل للكود كشف الرموز فعلياً: ⛔×412، ⚠×382، ❌×11، ✕×10.

ملف واحد: `popups.js`. بناء ✓ + 352 test ✓. مفيش تعديل على الـ 1300+ نداء
`showToast` — التوجيه مركزي في الدالة.

---

## V21.27.64 (2026-06-18) — 🔗 ترحيل الفاتورة + الإشعار الدائن معاً (خطوة واحدة)

السبب الجذري **اتأكّد 100%** من الـ screenshot التاني — الرسالة الجديدة ظهرت
حرفياً: «الفاتورة المرتبطة (INV-2026-0317) مش مرحّلة (حالتها: draft) — لازم
ترحّل الفاتورة الأصلية الأول». يعني مفيش 1 ميجا خالص؛ السبب guard V21.9.92
(منع الائتمان المزدوج). Ahmed اختار: **زرار «رحّل الفاتورة + الإشعار معاً»**.

**التنفيذ:**
- `CreditNotesPg`: helper جديد `postLinkedSalesInvoice(inv)` بيكرّر مسار
  `SalesInvoicesPg.handlePost` بالظبط (mutator → `autoPost.salesInvoicePosted`
  → `postedJournalRef` مع COGS refs) — الفاتورة بتترحّل بقيودها الكاملة، مش
  مجرد قلب حالة.
- `handlePost`: لو الـ blocker هو «الفاتورة المرتبطة مسودة» (والإشعار نفسه
  مسودة) → **فردي:** `ask()` تأكيد «رحّل الاتنين»؛ **جماعي (silent):** cascade
  تلقائي. الحماية V21.9.92 محفوظة (الفاتورة بتترحّل فعلاً الأول → التسلسل صح).
- **idempotent:** الـ mutator بيقرأ `d` الطازج — إشعارين على نفس الفاتورة في
  ترحيل جماعي: الأول يرحّلها، التاني يلاقيها «مرحّلة» (`already-posted`)
  فيكمّل بدل ما يرمي خطأ.
- توست النجاح بقى يوضّح «تم ترحيل الفاتورة INV-... + الإشعار الدائن».

ملفات: `CreditNotesPg.jsx`. بناء ✓ + 352 test ✓ (الإشعارات المدينة بلا فاتورة
مرتبطة فمش محتاجة cascade).

---

## V21.27.63 (2026-06-18) — 🔎 ترحيل الإشعارات: تشخيص السبب الدقيق

بعد ما Ahmed بعت screenshot لشاشة الإشعارات الدائنة (12 مسودة على تواريخ
متفرّقة، وكل واحدة مربوطة بفاتورة INV-...)، اتأكّد إن **نظرية الـ1 ميجا ضعيفة**
(مستند يوم الإشعار فيه إشعار/اتنين بس). تتبّع الكود الفعلي كشف السبب الأرجح:

**السبب الجذري:** `postCreditNoteMutator` (invoices.js:892) فيه guard **V21.9.92**
بيرجّع `false` لو الإشعار مربوط بفاتورة (`linkedInvoiceId`) لسه **مش مرحّلة**
(حماية من الائتمان المزدوج على الإيراد). الـ UI القديم كان بيتجاهل الـ`false`
ويقول «✓ تم الترحيل» → الإشعار يفضل مسودة. السكرين شوت بيأكّد الربط بفواتير
(INV-2026-0317 على CN-0031، INV-2026-0255 على CN-0030). لو دي مسودات → الترحيل
بيُحجب بصمت.

**الإصلاح (Tier 1 — تشخيص دقيق، آمن من غير migration):**
- دالتين جديدتين read-only `creditNotePostBlocker(d,id)` + `debitNotePostBlocker(d,id)`
  بترجّعا نص السبب بالظبط أو `null`. بتعكسا شروط الـ mutator من غير ما تعدّلا الحالة.
- `CreditNotesPg`/`DebitNotesPg.handlePost`: بيفحصوا الـ blocker قبل الترحيل →
  رسالة دقيقة («الفاتورة المرتبطة (INV-...) مش مرحّلة — رحّلها الأول» / «مش مسودة»
  / «لسه بتحمّل» / «حد 1 ميجا»).
- `BulkPostBar`: بيجمّع أسباب الفشل ويعرض «الأكثر تكراراً» في التوست بدل «راجع
  الـ console» (component مشترك → بيفيد الفواتير كمان).
- 6 اختبارات جديدة (إجمالي 23 في invoices.test.js).

**الخطوة الجاية:** Ahmed يجرّب ويشوف الرسالة — لو فعلاً «الفاتورة المرتبطة مش
مرحّلة» الحل إنه يرحّل الفواتير الأصلية الأول (أو نقرر نسمح بالترحيل بدونها لو
ده سلوك مرغوب).

ملفات: `invoices.js` · `CreditNotesPg.jsx` · `DebitNotesPg.jsx` · `BulkPostBar.jsx`
· `invoices.test.js`. بناء ✓ + 346 test ✓.

---

## V21.27.62 (2026-06-18) — 🩹 ترحيل الإشعارات: إيقاف النجاح الكاذب + كشف سبب الفشل

بلاغ Ahmed: «المرتجعات والإشعارات الدائنة برحّلها مش بتترحل — اخترت كتير، اترحل
منهم عدد والباقي لأ، ودلوقتي مفيش بيترحل. بسبب 1 ميجا ولا لأن الإشعارات يومي
بتاريخ الإشعار نفسه؟»

**التشخيص (السببين مع بعض):**
1. الإشعارات بتتخزّن يومي **بتاريخ الإشعار نفسه** في `salesCreditNotesDays/{date}`
   (`splitCollections.js:199` بيستخدم `entry.date` — مش تاريخ الترحيل).
2. أي تعديل بيعيد كتابة **مستند اليوم كله** في معاملة ذرّية (`:445`). لما إشعارات
   اليوم تعدّي **1 ميجا** (حد Firestore) → الكتابة بترمي (`:457`) → حالة «مرحّل»
   مش بتتسجّل. وعشان كل تعديل بيلمس المستند كله، أول ما اليوم يمتلئ كل إشعاراته
   تبقى مش قابلة للترحيل.
3. **bug مخفي:** `handlePost` كان بيتجاهل نتيجة `upConfig` (`{ok:false}`) ونتيجة
   `postCreditNoteMutator` (`false`) → بيقول «✓ تم الترحيل» على طول حتى مع فشل
   الحفظ → ترحيل وهمي + احتمال قيد محاسبي يتيم.

**الإصلاح (Tier 1 — الصدق، آمن من غير migration؛ اختيار Ahmed «الصدق الأول»):**
- `CreditNotesPg.handlePost` + `DebitNotesPg.handlePost`: بيمسكوا نتيجة الـ mutator
  + `upConfig`. لو الكتابة فشلت → `throw` برسالة واضحة (بتميّز سبب 1 ميجا وبتحوّل
  للتشخيص) بدل النجاح الكاذب. الترحيل الجماعي بقى يعدّ الفشل صح، و autoPost ما
  بيتنفّذش لو الحفظ فشل (مفيش قيد يتيم). `upConfig` بيرجّع `{ok,phase}` (متأكد).

**بعد كده (Tier 2 — الجذري):** لما Ahmed يجرّب ويشوف الرسالة الحقيقية (1 ميجا /
تاريخ غير صالح / فاتورة مرتبطة مش مرحّلة) نعمل الإصلاح الموجّه — توزيع/تصغير
مستند اليوم المكتظ لو فعلاً 1 ميجا.

ملفات: `CreditNotesPg.jsx` · `DebitNotesPg.jsx`. بناء ✓ + 346 test ✓.

---

## V21.27.61 (2026-06-18) — 🪄 سكانر مستندات للمرفقات (قصّ + تصحيح منظور + تحسين)

الجزء الثالث من طلب Ahmed: «أسحب صورة المرفق وأسكنها وأعدّلها وأخليها واضحة —
وأقصّ الزوايد زي كاميرا سكانر بشكل احترافي».

**`src/utils/imageScan.js` (جديد — pure، قابل للاختبار):**
- `solveHomography(dst,src)` — حل 8×8 (Gaussian + pivoting) للإسقاط الإسقاطي.
- `dewarp(srcCanvas, quad, w, h)` — تصحيح منظور (inverse mapping + bilinear).
- `otsuThreshold` + `applyDocFilter` — تلقائي (auto-levels) / رمادي / أبيض-أسود
  (Otsu) + سطوع/تباين. `suggestOutputSize` لأبعاد الخرج من أطوال الأضلاع.

**`src/components/attachments/DocScannerModal.jsx` (جديد):** سكانر بخطوتين —
(1) قصّ بأربع زوايا تتسحب على حواف الورقة فوق الصورة، تدوير 90°، الكل؛
(2) معاينة النتيجة المستوية + أزرار الفلاتر + سلايدر سطوع/تباين (معاينة فورية
على الـ dewarp المخزّن) → «حفظ كمرفق». الصورة بتتحمّل عبر `/api/img-proxy`
عشان canvas مايتلوّثش (CORS).

**التوصيل:** `AttachmentViewer` فيه زر «🪄 مسح/تحسين» لأي صورة (لما `onScan`
ممرّر + canEdit). `AttachmentList` بيفتح السكانر ويحفظ الناتج كـ **مرفق جديد**
عبر `uploadAttachment` (الأصل بيفضل) ويـ prepend للقائمة.

ملفات: `imageScan.js` + `DocScannerModal.jsx` (جديدان) · `AttachmentList.jsx` ·
`AttachmentViewer.jsx` + 5 اختبارات `imageScan.test.js`. بناء ✓ + 346 test ✓.

---

## V21.27.60 (2026-06-18) — 🧾 فاتورة: خط Cairo + مرفقات بعد الترحيل + تكبير الصورة

طلب Ahmed (على شاشة الفاتورة): (1) خط رقم الفاتورة يبقى زي خط التطبيق (Cairo)
بدل monospace. (2) أقدر أضيف مرفقات قبل الترحيل وبعده، والصورة تبان واضحة وتتفتح
بوب اب وتكبر. [الجزء الثالث — السكانر/المعالجة — جاي في V21.27.61.]

**`src/pages/SalesInvoicesPg.jsx`:**
- رقم الفاتورة في الهيدر: شيلنا `fontFamily:"monospace"` → بيورث Cairo.
- `AttachmentList canEdit`: من `isDraft` → `!!upConfig && invoice.status !== "void"`
  — يعني الرفع/الحذف متاح قبل وبعد الترحيل (ممنوع على الملغاة بس). المرفقات في
  collection مستقل عن مستند الفاتورة فمفيش أثر مالي.

**`src/components/attachments/AttachmentViewer.jsx`:** تكبير/تصغير الصورة:
- أزرار 🔍+ / 🔍− + نسبة الزوم (ضغطها = رجوع 100%)، عجلة الماوس، دبل-كليك،
  واختصارات `+`/`−`. سحب (pan) لما تكون مكبّرة. يتصفّر عند تغيير الصورة.

ملفات: `SalesInvoicesPg.jsx` · `AttachmentViewer.jsx`. بناء ✓ + 341 test ✓.
(نظام المرفقات نفسه — رفع/thumbnails/عارض fullscreen — كان موجود من V21.9.123.)

---

## V21.27.59 (2026-06-18) — 📊 كشف الحساب: عنوان «تفصيلي» + سطر-لون-وسطر (zebra)

طلب Ahmed: (1) لما أطبع كشف في الوضع التفصيلي يكتب «كشف حساب تفصيلي» بدل «كشف
حساب» — أدق للفرق بين التفصيلي والعادي (مبيعات/مشتريات). (2) سطر-لون-وسطر:
سطر أبيض كامل وسطر رمادي فاتح كامل؛ وفي التفصيلي كل بند (الفاتورة بتفاصيلها)
ياخد نفس اللون عشان يبان إنه سطر واحد. وفي الطباعة يظهر اللون-ولون.

**`src/components/AccountStatementView.jsx` (مشترك للعميل والمورد):**
- **العنوان:** `docTitle = (detailed ? "كشف حساب تفصيلي" : "كشف حساب") + " — " +
  party.name` — يُستخدم في `<h2>` المطبوعة وفي `printPage(title)`.
- **zebra (طباعة):** `result.rows.forEach((r,i) => ...)` → لون بالتناوب
  `i%2===0 ? #ffffff : #f1f5f9`؛ سطر الحركة وسطر تفاصيلها (colspan) ياخدوا نفس
  اللون (كان `#f8fafc` ثابت).
- **zebra (شاشة):** كل صف `background: i%2===0 ? T.cardSolid : T.bg`؛ صف
  التفاصيل المنسدل ياخد نفس `zebra` (كان `T.bg` ثابت).

ملف: `AccountStatementView.jsx`. بناء ✓ + 341 test ✓.

---

## V21.27.58 (2026-06-18) — 📷 صورة بالطول (3:4) لجهات الاتصال

طلب Ahmed: «عاوز أقدر أضيف صورة بالطول 3:4 لجهات الاتصال وتظهر في القائمة، وكمان
للخامات/قماش/اكسسوار/خدمات وتظهر في القوائم، والعملاء والموردين وكل كارت».

**اللي كان موجود بالفعل:** الأقمشة + الاكسسوار + الخدمات (generalProducts) في
`WarehousePg.jsx` بتدعم الصور من V21.21.95 (صورة في الفورم عبر `renderImagePicker`
+ مصغّرة في القائمة، مرفوعة على Storage). فمحتاجش شغل.

**الجديد — جهات الاتصال (والعملاء/الموردين/الورش/الموظفين عبر السجل الموحّد):**

`src/utils/contacts.js`:
- `buildMergedContacts`: كل صف بياخد `image` (من `contact.image`، والكيانات
  المستقلة من `entity.image` أو `ownerPhoto` للورشة).
- `createContact`: بياخد `form.image` ويختمه على السجل + العميل/المورد/الموظف/
  الورشة (الورشة `ownerPhoto` كمان).
- `updateContact`: بياخد `updates.image`، يحدّثه على السجل ويـ propagate للكيانات
  المرتبطة **فقط لو اتبعت صراحةً** (`imageProvided`) عشان ما يمسحش صور الكيانات.
  + إصلاح وقائي: `newTags` بقى آمن لو الجهة من غير `tags`.

`src/pages/ContactsPg.jsx`:
- مكوّن `PortraitPicker` (يعيد استخدام `ImagePickButton` + `uploadImageToStorage`
  مجلد `contacts`) — صورة 3:4 مع مصغّرة + زر إزالة.
- فورم «جهة جديدة» + كارت التفاصيل (وضع التعديل) فيهم المنتقي.
- صورة مصغّرة (30×40) في خلية الاسم بالقائمة + صورة (66×88) في هيدر الكارت.

التخزين: Firebase Storage تحت `images/contacts/**` — قواعد `storage.rules`
الحالية بتسمح بالرفع لأي مستخدم مصرّح (مفيش تعديل قواعد، مفيش cross-service helper).

ملفات: `contacts.js` · `ContactsPg.jsx` + 6 اختبارات (`contactsImage.test.js`).
بناء ✓ + 341 test ✓.

(ملاحظة: «كل كارت» — العملاء/الموردين بياخدوا الصورة عبر السجل الموحّد. كروت
محددة تانية زي كارت العميل في التسليمات أو المورد في المشتريات ممكن تتوصّل لاحقًا
لو Ahmed حدّدها.)

---

## V21.27.57 (2026-06-18) — 🧵 استهلاك الراق والقطعة في شريط الخامة الملوّن

طلب Ahmed: في الأوردر/الموديل، عاوز «استهلاك الراق» و«استهلاك القطعة الواحدة»
يظهروا في شريط الخامة الملوّن (مش بس في جدول التكلفة تحت).

**`src/components/ui.jsx` — `FCTable`:** أضفت props اختيارية
`consPerLayer` / `consPerPiece` / `unit`. لو `consPerLayer>0` بيظهر بادجين في
هيدر الشريط الملوّن («استهلاك/راق: X متر» + «استهلاك/قطعة: Y متر») جنب بادچات
«سيري/راقات/قطع» الموجودة. الهيدر بقى `flexWrap` عشان يستوعب البادچات الزيادة.
متوافق رجوعيًا — الاستخدامات اللي مش بتمرّر الـ props (OrdForm edit) ما تتأثرش.

**`src/pages/DetPg.jsx` (تاب «القماش والخامات»):** بمرّر للـ FCTable
`consPerLayer={gcons(order,k)}` و`consPerPiece={r2(cons/pcsPerLayer)}` (نفس
معادلة جدول «تكلفة الخامات» بالظبط — `ppl = colors[0].pcsPerLayer`) +
`unit={fabU}`. فالشريط والجدول بيتطابقوا.

(الموديل في `ModelDetailModal.jsx` كان بيعرض الاستهلاك بالفعل في كارت الخامة.)
ملفات: `ui.jsx` · `DetPg.jsx`. بناء ✓ + 335 test ✓.

---

## V21.27.56 (2026-06-18) — 🔗 لينك القيد اليومية من كل حركة في كشف الحساب

طلب Ahmed: «من أي حركة في كشف الحساب التشغيلي أو المحاسبي يكون فيه لينك للقيد
اليومية للحركة». (المقدمة — ترقيم القيود — اتعملت في V21.27.55.)

**`src/utils/accounting/statement.js` — `journalLocatorForRow(row, partyType)`
(دالة pure جديدة):** بترجّع `{ sourceType, sourceId, date }` للحركة اللي ليها
قيد يومي 1:1 (بنفس الـ sourceType/sourceId اللي بيرحّل بيهم `autoPost` في
postingRules.js)، أو `null` للحركات المجمّعة:
- `sales_invoice→salesInvoice` · `purchase_invoice→purchaseInvoice` ·
  `credit_note→creditNote` · `debit_note→debitNote` · `discount→salesDiscount`
- `payment(عميل)→customerPay` · `check(عميل receivable)→customerCheck` ·
  `treasury→treasury` · `payment(مورد)→treasury` بـ `treasuryTxId`
- المسودات + `delivery/return/receipt` التشغيلية المجمّعة → `null` (الترحيل
  على مستوى الفاتورة V18.50 أو per-delivery بمفاتيح مركّبة — مفيش قيد منفرد؛
  متفق مع Ahmed).

**`src/components/AccountStatementView.jsx`:** كل صف ليه locator بيعرض لينك
صغير «📔 القيد ↗» تحت المرجع. الضغط → `openJournalEntry(loc)` يبعت
`goto-tab=accounting` + `clark-open-journal-entry` بالـ locator (نفس آلية لينك
الفاتورة/دفتر الأستاذ).

**`src/pages/AccountingPg.jsx`:** الـ deep-link listener اتوسّع: لو الحدث جه بـ
`{sourceType, sourceId}` بدل `entryId`، بيحلّ الـ `entryId` الفعلي async من
day-docs عبر `findEntryBySource` (القيود مش محمّلة في `data`)، مع fallback يمسح
`±3` أيام. لو مفيش قيد → toast «لا يوجد قيد مرحّل لهذه الحركة بعد». `useToast.show`
اتعمله `useCallback` عشان الـ effect ما يعيدش التسجيل كل render.

ملفات: `statement.js` · `AccountStatementView.jsx` · `AccountingPg.jsx` +
9 اختبارات locator جديدة. بناء ✓ + 335 test ✓.

---

## V21.27.55 (2026-06-18) — 🔢 ترقيم قيود اليومية: رقم فريد لكل حركة

طلب Ahmed (كمقدمة لربط حركات كشف الحساب بالقيد اليومية): «نظّم قيود اليومية —
كل حركة بقيد منفصل برقم بيحكمه اليوم والسنة ورقم القيد، مش كل اليومية قيد واحد».
قرارات Ahmed (AskUserQuestion): الصيغة `JE-سنة-شهريوم-تسلسل`؛ القيود **الجديدة
فقط** (مفيش migration للقديم).

**السبب الجذري:** القيود كانت أصلاً **per-movement** (كل حركة قيد مستقل عبر
`postEntry` بـ sourceType+sourceId) — لكن `buildRefNo` كان بيولّد `JE-YYYY-NNNN`
والتسلسل `NNNN` **بيتصفّر كل يوم** (بيعدّ قيود اليوم الواحد بس). فالنتيجة:
يومين مختلفين بيطلّعوا نفس الرقم `JE-2026-0001` → الرقم **مش فريد** على مستوى
الدفتر كله.

**`src/utils/accounting/posting.js` — `buildRefNo(date, dayEntries)`:**
- الصيغة الجديدة `JE-${year}-${mmdd}-${seq}` (مثال `JE-2026-0618-001`)، seq
  بـ `padStart(3,"0")`. مقطع `MMDD` بيميّز الأيام اللي بتشترك في نفس التسلسل
  اليومي → الرقم بقى فريد عبر السنة كلها.
- مستدعى في إنشاء القيد الجديد (سطر ~141) وفي قيد الإلغاء `+"-VOID"` (~187).
- **القيود القديمة:** أرقامها محفوظة كما هي (مفيش إعادة ترقيم) — التغيير على
  الجديد فقط، متوافق مع أي reconciliation cache قديم.

**`src/utils/accounting/__tests__/posting.test.js`:** حدّثنا 4 توقّعات للصيغة
الجديدة (`JE-2026-0610-001`, `JE-2025-0101-042`, `JE-2026-0610-002`).

تمهيد لـ V21.27.56 (ربط كل حركة في كشف الحساب التشغيلي/المحاسبي بقيدها اليومي).
بناء ✓ + 326 test ✓.

---

## V21.27.54 (2026-06-17) — ⚡ تاب الموظفين: تسريع الفتح

بلاغ Ahmed: تاب الموظفين بطيء في الفتح (زي ما كان العملاء).

**`src/pages/HRPg.jsx` (view==="employees"):**
- السبب: كان بيرندر **كل** صفوف الموظفين + بيستدعي `empActiveDebts(e.id)`
  (filter+reduce) **لكل موظف داخل حلقة الرندر** → O(موظفين×مديونيات) (§15
  anti-pattern: حساب غالي per-row).
- الإصلاح: `empDebtsMap` (useMemo، single-pass على `debts` → `{empId:{count,
  totalRemaining}}`) + **pagination** (`empLimit` يبدأ 60 + «عرض المزيد»، يتصفّر
  مع البحث). الرندر بقى `filteredEmps.slice(0,empLimit)` + lookup O(1) للمديونيات.

(نفس نهج تحسين العملاء/الموردين — pagination + precompute بدل virtualization
لجدول التعديل-inline المعقّد.) بناء ✓ + 326 test ✓.

---

## V21.27.53 (2026-06-17) — 🩹 إصلاح سجل التحديثات (JSON تالف + بطء)

بلاغ Ahmed: سجل التحديثات مش بيظهر («The string did not match the expected
pattern») + بطيء جداً في الفتح.

**سببان:**
1. **JSON تالف:** `public/changelog.json` كان فيه 10 حدود ناقص فيها `{` (من
   إضافات prepend سابقة استهلكت الـ `{` بدون ما تعيده) → `JSON.parse` بيفشل →
   رسالة الخطأ. اتصلّحت كل الحدود بسكربت (regex على `},\n  "version"`).
2. **بطء:** الملف وصل **1.5 ميجا / 658 إصدار**، وبيتحمّل ويتـparse بالكامل في
   `AboutVersionModal` رغم إنه بيعرض `.slice(0,10)` بس. قصّيناه لأحدث **80 إصدار
   (85 KB)** — التاريخ الكامل محفوظ في `docs/RELEASE-LOG.md` + git history.

**درس للبروتوكول:** إضافات `changelog.json` لازم تحافظ على صحة الـ JSON (الأفضل
عبر سكربت `unshift` بدل تعديل نصّي على `[\n {`)، والملف يتقصّ دورياً (المودال
بيعرض 10 بس). نُفّذ هنا.

ملف: `public/changelog.json`. JSON صالح ✓ + بناء ✓ + 326 test ✓.

---

## V21.27.52 (2026-06-17) — ✏️ كشف الحساب: تعديل حركات الخصم + تحميل الحساب

طلب Ahmed: في كشف العميل المحاسبي، حركات «الخصم الخاص» و«تحميل الحساب» تكون
قابلة للضغط → بوب اب تعديل التفاصيل + حفظ. قرار Ahmed: «تعديل التفاصيل بس —
احتفظ بالقيد ويتم التعديل على القيد نفسه».

**النمط (آمن):** `postEntry` (posting.js) **idempotent** — بيلاقي القيد بـ
(sourceType, sourceId) ويحدّث سطوره بنفس الـ refNo. فإعادة الترحيل بعد تعديل
المبلغ = تعديل القيد نفسه (مفيش قيد جديد).

**`src/utils/sales/discounts.js`:** `editCustomerDiscount` — يحدّث الـ
salesCreditNote (مبلغ/سبب/تاريخ) ويعيد `autoPost.discountPosted` (in-place). لو
التاريخ اتغيّر بس: يعكس القديم في يومه ثم يرحّل في اليوم الجديد.

**`src/utils/contacts.js`:** `editPartyTransfer` — يعدّل المقدار/التاريخ/الملاحظة
في رِجلَي التحويل (نفس transferId) مع الحفاظ على إشارة كل رِجل. مفيش قيد محاسبي
للتحويل فالأرصدة مشتقّة وبتتظبط.

**`src/components/AccountStatementView.jsx`:** صفوف الخصم/التحويل بقت قابلة للضغط
(✏️) → بوب اب تعديل (مبلغ/تاريخ/سبب-ملاحظة) + حفظ. متاح لما `upConfig` موجود.

⚠️ مسار محاسبي/مالي — يحتاج تأكيد production. (تعديل التحويل مابيعيدش التحقق ضد
الرصيد المتاح للطرف المصدر — تحسين لاحق محتمل.)

ملفات: `discounts.js` · `contacts.js` · `AccountStatementView.jsx`.
بناء ✓ + 326 test ✓.

---

## V21.27.51 (2026-06-17) — ↔️ هَب المبيعات: نقل تاب «طلبات بورتال»

طلب Ahmed: نقل تاب «طلبات بورتال» بعد تاب «تحميل حساب».

**`src/pages/SalesHubPg.jsx`:** في مصفوفة `tabs` نقلت `portalRequests` من بعد
`orders` لـ بعد `transfer`. ترتيب فقط (الـ render keyed بالـ id فمش متأثر).
بناء ✓ + 326 test ✓.

---

## V21.27.50 (2026-06-17) — 📑 بورتال العميل: تاب «طلباتي» (حالة الطلبات)

طلب Ahmed: تاب في بورتال العميل يعرض حالة الطلبات (موافَق/منفّذ/محوّل لأمر بيع/
مرفوض + السبب).

**`api/customer-portal.js`:** بيحمّل `orderRequestsDays` (daily-split) ويرجّع
`orderRequests` مفلترة على `custId` بحقول آمنة (status, items, totalQty/Value,
note, rejectReason, salesOrderId, date) — أحدث ١٠٠ طلب.

**`src/components/CustomerPortalPage.jsx`:** تاب جديد «📑 طلباتي» (+ في tabLabels
وقائمة التابات). بيعرض كل طلب ككارت: شارة حالة ملوّنة + الموديلات/الألوان/الكميات
+ الإجمالي + الملاحظة. خريطة الحالات: pending→«قيد المراجعة» · confirmed→«تمت
الموافقة» · confirmed+salesOrderId→«تم التحويل لأمر بيع» · rejected→«مرفوض» +
صندوق سبب الرفض.

ملفات: `api/customer-portal.js` · `src/components/CustomerPortalPage.jsx`.
node ✓ + build ✓ + 326 test ✓.

---

## V21.27.49 (2026-06-17) — 🎛️ لوحة التحكم: تنظيم في ٣ تابات (طلب Ahmed)

طلب Ahmed: تنظيم لوحة التحكم في تابات احترافية + شيل المعلومات غير المهمة.

**`src/pages/DashPg.jsx`:** الصفحة كانت ~١٧ قسم في تمرير واحد. اتقسّمت:
- **هيدر ثابت فوق:** زر البورتال + الترحيب + ٤ مؤشرات + الأزرار السريعة (اتنقل
  الهيرو من النص لفوق) + شريط ٣ تابات.
- **📊 نظرة عامة:** `DashboardKpis` + ملخص اليوم + نظرة الإنتاج + التنبيهات
  (مخزون/عالق) + لوحة المتأخرات + تقرير الفاقد.
- **🏭 الإنتاج والورش:** التحليلات البصرية + الخريطة الأسبوعية + مؤشر السرعة +
  ضغط الورش + أيام بدون حركة + معدل الإنجاز + أعلى ٣ ورش + مقارنة الورش.
- **💰 المالية والربحية:** حسابات الورش + ربحية الموديلات.
- **اتشال:** قسم «معلومات النظام» (حجم قاعدة البيانات) — تقني، موجود في التشخيص.

التنفيذ: `dashTab` state + حقن الهيرو فوق + حارس تاب (`dashTab==="x"&&`) لكل قسم
في مكانه (الإخفاء بيدير الترتيب تلقائيًا). بناء ✓ + 326 test ✓.

---

## V21.27.48 (2026-06-17) — 🛡️ كشف البورتال = كشف المبيعات (إصلاح مالي · مراجعة Ahmed)

بلاغ Ahmed: كشف حساب العميل في رابط البورتال **مختلف** عن الكشف المحاسبي في
المبيعات (الصح) — خطر.

**الفحص الدقيق:** الاتنين بيستخدموا نفس الدالة `buildAccountStatement` (الوضع
التشغيلي)، فالاختلاف كان في **البيانات الممرَّرة** مش المنطق:
- `api/customer-portal.js` كان **مش بيحمّل** `custDeliverySessions` ولا
  `salesCreditNotes` إطلاقاً.
- النتيجة (مكانين بيدرِفوا):
  1. `pickDiscPct` بتاع البورتال (للكروت + displayBalance) كان: discPct → 
     customer.discount → 10 — **من غير** خصم التوزيعة `custDisc[custId]` اللي
     `statement.js _sessDisc` بيقدّمه (V21.26.16). تسليمة بخصم متّفق 40% كانت
     بتطلع 10% في البورتال.
  2. `stmtData` (اللي بيغذّي الرصيد canonical `stmt.totals.closing`) كان ناقص
     `custDeliverySessions` (نفس مشكلة الخصم) + `salesCreditNotes` (خصومات
     إضافية بتقلّل الرصيد) → رصيد أعلى من المبيعات.

**الإصلاح (`api/customer-portal.js`):**
1. تحميل `custDeliverySessions` (split `custDeliverySessionsDays` أو `factory/sales`).
2. تحميل `salesCreditNotes` (split `salesCreditNotesDays` أو config) في الـ Promise.all.
3. `pickDiscPct` بقى يطابق `statement.js` بالظبط: خصم التوزيعة → discPct →
   customer.discount → 10.
4. `stmtData` بقى يشمل `custDeliverySessions` + `salesCreditNotes`.

**النتيجة:** الكشفين بيستخدموا نفس الدالة بنفس البيانات → متطابقين **بالبناء**.
الـ `displayBalance` (الكروت) كمان بقى يطابق `balance` (الكشف) → reconcile سليم.

ملف واحد: `api/customer-portal.js`. node --check ✓ + build ✓ + 326 test ✓.

---

## V21.27.47 (2026-06-17) — 🏷️ الفاتورة: بادج الحالة مايتراكبش مع شريط «مدفوع»

بلاغ Ahmed: شريط «مدفوع» القطري راكب فوق بادج «مرحّل».

السبب: شريط الدفع القطري (V21.27.40) في ركن الشمال العلوي، وبادج الحالة
(`meta.label`) كان آخر child في رأس المودال بـ `space-between` → في الـ RTL بيروح
لركن الشمال = نفس مكان الشريط.

الإصلاح (`src/pages/SalesInvoicesPg.jsx` · `InvoiceDetailModal`): نقلت بادج الحالة
جوّه بلوك العنوان جنب رقم الفاتورة (ناحية اليمين) بدل ركن الشمال. ملف واحد، تغيير
بصري بحت. بناء ✓ + 326 test ✓.

---

## V21.27.46 (2026-06-17) — 🧹 استوديو: مراجعة وتوحيد منطق التحقن (مراجعة Ahmed)

طلب Ahmed: مراجعة قسم البرومبتس الجاهزة + قوة التحكّم في الخصائص الإضافية،
واستكشاف أي تضارب بين البرومبت والتحقن، بحيث يكون متكامل وموثوق.

**الفحص الكامل:**
- ✅ مفيش تكرار حقن: `callOnce` بيستخدم `promptOverride` مباشرة (مش بيضيف
  `techSuffix` فوقه) → العدسة/النمط/الواقعية بتظهر مرة واحدة.
- ✅ التعامل مع `{{AGE}}` + الجروبات الكبار (FOR HIM/HER) سليم.
- ⚠️ **التضارب الجذري:** الإضاءة (`soft`) + العدسة (`dslr85`) + النمط (`pro`)
  كانوا بيتحقنوا بقيمتهم الافتراضية على **كل** برومبت جاهز مع تعليمة «override
  conflicting» → بيطغوا على الإضاءة/العدسة/النمط المكتوبين جوّه البرومبت
  (خصوصًا بعد إضافة وضع «full background» في الاستخراج). بينما الإطار/الزاوية/
  النظرة/الألوان/البشرة كانوا صح («تلقائي = مايتحقنش»).
- ⚠️ التعبير `smile` بيتحقن دايمًا (قاعدة Ahmed القديمة) — اتساب كافتراضي مع
  إضافة opt-out «تلقائي».

**الإصلاح:**
- `aiStudioPresets.js`: أضفت «تلقائي» (prompt فاضي) لـ `LIGHTINGS` + `CAM_STYLES`
  + `EXPRESSIONS`. + حماية سطر التعبير في `buildStudioPrompt` (مايطلعش
  "The model has ." لما تلقائي).
- `AIStudioPg.jsx`: غيّرت الافتراضيات: `lightingId` soft→**auto** · `camStyle`
  pro→**auto** · `cameraId` dslr85→**none**. (التعبير ساب `smile` احترامًا لقاعدتك،
  والإطار auto من V21.27.45.) + حدّثت وصف كارت الكاميرا.

**النتيجة:** البرومبت الجاهز افتراضيًا = العمر + الابتسامة + الجزمة + الواقعية بس؛
كل الباقي أمين على البرومبت لحد ما المستخدم يختار. الوضع اليدوي بيعتمد على «تعزيز
الواقعية» (شغّال افتراضي: إضاءة طبيعية + عمق ميدان واقعي + احتراف) بدل فرض قيم.

ملفات: `src/utils/aiStudioPresets.js` · `src/pages/AIStudioPg.jsx`.
بناء ✓ + 326 test ✓.

---

## V21.27.45 (2026-06-17) — 🖼️ استوديو: الإطار افتراضي «تلقائي»

طلب Ahmed: لما يختار برومبت جاهز، عايز الإطار افتراضي «تلقائي» عشان مايغيّرش
البرومبت لو مش عايز يعدّل الإطار.

**`src/pages/AIStudioPg.jsx`:** غيّرت default الـ `framingId` state من `"full"`
لـ `"auto"`. كده الإطار مايتحقنش إلا لو المستخدم اختار قيمة (نفس مبدأ V21.27.42).
سطر واحد. بناء ✓ + 326 test ✓.

---

## V21.27.44 (2026-06-17) — 🪄 استخراج البرومبت من صورة: تحكّم في سحب الخلفية

طلب Ahmed: عند سحب برومبت من صورة، تحكّم في تفاصيل السحب — خيار يسحب الوقفة/
الكاميرا/حركة الجسم/الجزمة ويتجاهل الخلفية (خلفية بيضاء استوديو)، وخيار يسحب
كل التفاصيل مع لون وتفاصيل الخلفية.

**`api/ai-image/describe-image.js`:** التعليمة بقت تتبني بـ `buildInstruction(bgMode)`:
- `studio` (افتراضي): core (وقفة/جسم/كاميرا/إطار/تعبير/جزمة) + «تجاهل الخلفية
  الأصلية تماماً → خلفية بيضاء استوديو ناعمة احترافية». (+ بيتجاهل خامة/براند
  القطعة الأساسية عشان البرومبت يفضل reusable للتلبيس.)
- `full`: نفس الـ core + «اوصف الخلفية بالكامل بألوانها وتفاصيلها وإضاءة المشهد».
- بيقرأ `body.bgMode` (studio|full).

**`src/components/PromptExtractModal.jsx`:** state `bgMode` (افتراضي studio) +
كرتين اختيار قبل التحليل، وبيتبعت لـ `describeImage` في مساري الكمبيوتر والتخزين.
**`describeImage`** بيمرّر الـ args كلها فمافيش تغيير في الـ wrapper.

ملفات: `api/ai-image/describe-image.js` · `src/components/PromptExtractModal.jsx`.
بناء ✓ + 326 test ✓.

---

## V21.27.43 (2026-06-17) — 🎞️ استوديو: تعزيز الواقعية يتحقن في البرومبت الجاهز

طلب Ahmed: تفعيل «تعزيز الواقعية» في البرومبت الجاهز — مهم جدًا.

**`src/pages/AIStudioPg.jsx`:**
- `runSavedPrompt`: لو `realismOn` بيضيف `buildRealismSuffix(realismLevel, true)`
  في آخر `promptWithNotes` (البرومبتس الجاهزة كلها مشاهد أشخاص → isPerson=true).
- كارت «تعزيز الواقعية» اتشال منه الـ dim (`inertCard(optInert)`) → بقى فعّال في
  الوضع الجاهز. حدّثت نص التلميح (شيلت الواقعية من المستثنى).

ملف واحد: `src/pages/AIStudioPg.jsx`. بناء ✓ + 326 test ✓.

---

## V21.27.42 (2026-06-17) — 🎛️ استوديو: تحكّمات احترافية إضافية للبرومبت الجاهز

طلب Ahmed: أفكار احترافية تزوّد التحكّم في الصورة قبل التوليد (زاوية الكاميرا
وغيرها). اختار: زاوية الكاميرا + اتجاه النظر + درجة الألوان + (عدسة/إضاءة/تعبير).

**المبدأ المعماري المحوري:** كل تحكّم قابل للحقن في البرومبت الجاهز له خيار
**«تلقائي» (prompt فاضي = مايتحقنش)** كافتراضي — عشان مايخرّبش برومبت مكتوب
بعناية. الحقن يحصل بس لما المستخدم يختار قيمة فعلية (override للوصف المخالف).

**`src/utils/aiStudioPresets.js`:**
- 3 مصفوفات جديدة: `CAMERA_ANGLES` (مستوى العين/فوق/تحت/top-down/جانبي/٣٤/خلف) ·
  `GAZES` (كاميرا/بعيد/نظرة خلفية/تحت) · `COLOR_GRADES` (دافئ/بارد/محايد/فيلم/
  high-key/low-key/أبيض-أسود/باستيل/زاهي). كلها أول خيار «تلقائي».
- أضفت «تلقائي» لـ `FRAMINGS`.
- `buildStudioPrompt` (اليدوي) بيحقن زاوية/نظرة/درجة-ألوان (لو مش تلقائي).

**`src/pages/AIStudioPg.jsx`:**
- state جديد: `camAngleId/gazeId/colorGradeId` = "auto"، مضافين لـ `opts` +
  حفظ/تحميل القوالب والجلسات.
- حقن البرومبت الجاهز (`runSavedPrompt` attrLines) اتوسّع: زاوية الكاميرا +
  اتجاه النظر + العدسة (cameraPromptOf) + النمط (stylePromptOf) + الإضاءة +
  التعبير + درجة الألوان — كلها كـ override attributes.
- صفوف chips جديدة + التعبير/الإضاءة/كارت الكاميرا بقوا فعّالين في الوضع الجاهز
  (كانوا باهتين). حدّثت نص التلميح.

ملفات: `src/utils/aiStudioPresets.js` · `src/pages/AIStudioPg.jsx`.
بناء ✓ + 326 test ✓.

---

## V21.27.41 (2026-06-17) — 🎬 استوديو: تحكّم في اللقطة للبرومبت الجاهز + توثيق قاعدة الزيب

طلب Ahmed: «لما بشتغل بؤوميت (برومبت) جاهز بتحكّم في عمر الطفل — عايز أتحكّم في
اللقطة قريبة/بعيدة/متوسطة، نص الطفل أو أكتر أو الطفل كله. ده ضروري.»

**السبب الجذري:** «الإطار» (framing) كان متطبّق في البناء اليدوي (`buildStudioPrompt`)
بس — في وضع البرومبت الجاهز (`readyMode`) كان الشيب **متخفي** (`isModelShot` بس)
و**مش بيتحقن** في البرومبت (العمر + لون البشرة بس كانوا بيتحقنوا).

**الإصلاح (`src/pages/AIStudioPg.jsx` + `src/utils/aiStudioPresets.js`):**
1. حقن «الإطار» المختار في البرومبت الجاهز كـ attribute (override لأي إطار جوّه
   البرومبت) — نفس آلية العمر/البشرة (V21.26.20).
2. شيب «الإطار» بقى يظهر ويتفعّل في `readyMode` كمان (`isModelShot || readyMode`).
3. خيارات `FRAMINGS` اتوسّعت من ٣ لـ ٥: **قريبة (وش/كتف)** · نصفي · ٣/٤ · جسم
   كامل · **بعيدة (واسعة)** — تغطّي قريبة/متوسطة/بعيدة + نسبة الجسم الظاهرة.
4. حدّثت نص التلميح + الكومنت ليشملوا الإطار كإعداد مؤثّر على البرومبت الجاهز.

**+ توثيق البروتوكول (CLAUDE.md §AUTO-WORKFLOW):** أضفت تأكيد Ahmed (2026-06-17)
إن **كل نسخة أو تعديل لازم يطلع معاه zip ويتبعت** — بلا استثناءات.

ملفات: `src/pages/AIStudioPg.jsx` · `src/utils/aiStudioPresets.js` · `CLAUDE.md`.
بناء ✓ + 326 test ✓.

---

## V21.27.40 (2026-06-17) — ↩️🧾🔄 ٣ مطالب: لينكات المرتجع · شريط الدفع · رسالة التحويل

طلبات Ahmed (٣ مميزات مستقلة):

**1) بوب اب «إضافة مرتجع» (`src/pages/CreditNotesPg.jsx` · `AddReturnModal`):**
- رقم الفاتورة بقى **لينك** يفتح بوب اب قراءة-فقط بتفاصيل الفاتورة (بنود/إجمالي/
  مدفوع/متبقي). أضفت `invoice` (الكائن كامل) لصف `returnable`.
- لينك **أمر البيع** (لو موجود) — بدوّر على SO لنفس العميل+الأوردر (بنود SO
  بتربط عبر `sourceId`/`orderId`)، ويفتح نفس البوب اب.
- جنب كل تاريخ تسليم: **«· من N يوم» بالأحمر** (الأيام من التسليم للنهاردة).
- البوب اب `docView` نُفّذ inline (مفيش side-effects) فوق المودال بـ zIndex أعلى.

**2) شريط حالة الدفع (`src/pages/SalesInvoicesPg.jsx` · `InvoiceDetailModal`
المشترك مبيعات+مشتريات):**
- شريط قطري Odoo-style في الزاوية الشمال العلوية: 🟢 `#10B981` «مدفوع كلياً»
  (paid ≥ total)، 🩶 `#6B7280` «مدفوعة جزئياً» (0 < paid < total). مفيش شريط
  لو غير مدفوع/ملغى. الـ box بقى `position:relative` + `overflowX:hidden`
  عشان الشريط يتقصّ نضيف على الزاوية.

**3) رسالة «تحميل حساب» (`api/automation-tick.js` + `api/_eventProcessor.js`):**
- ROOT CAUSE: `scanRecentPayments` كان بيطلّق `paymentReceived` لكل custPayment
  حديث — بما فيهم سجلات التحويل (method=«تحميل حساب»، transferSide from/to) →
  الطرف المنقول منه وصله «تم استلام دفعة» (غلط).
- الحل: فرع مخصّص للتحويلات بيبعت رسالة «🔄 تم نقل حسابك برصيد X لحساب فلان
  برصيد Y» (from) و«🔄 تحويل لحسابك» (to)، عبر **`eventCfgOverride`** الجديد في
  `processEvent` (override للـ templates/recipients مع احترام `enabled` الأصلي).
  بيعيد استخدام بوابة `paymentReceived` المفعّلة — **من غير نوع حدث جديد ولا
  تعديل UI**، فيشتغل على الكونفيج الحالي. ⚠️ التسليم الفعلي لما البريدج/الكرون
  يرجعوا (V21.27.39).
- مفيش instant-fire في `AccountTransferPg` → مسار الكرون بس، فالإصلاح
  server-side كافٍ.

بناء ✓ + 326 test ✓.

---

## V21.27.39 (2026-06-17) — 🩺 الأتمتة: إرسال التجربة بقى صادق

**المشكلة (بلاغ Ahmed):** «التريجرز والأوتوميشن مش شغّالة خالص. جربت إرسال تقرير
يومي تجربة — مش بيبعت وبيظهر إن الرسالة اتبعتت.»

**السبب الجذري:** زرار «ارسل تجربة» (`onSendTest`) كان بيعتبر الرسالة «اتبعتت»
لحظة ما البريدج `POST /send` يرجّع HTTP 200 — وده معناه **اتحطّت في الطابور
بس**، مش اتسلّمت على واتساب. البريدج بيرجّع `{ok, added, queueTotal}` (مفيش
`queued`/`accepted`)، فالكود كان بيقع على `messages.length` ويطبع «✓ تم
الإرسال». فلو الطابور موقّف (`queuePaused`) أو معالجه واقف (`queueRunning=false`)
أو الجلسة منتهية أو الحد اليومي اتعدى → الرسائل تتكدّس والشاشة تكدب بنجاح كاذب.
ده anti-pattern §0 (علاج العَرَض / نجاح كاذب على الطابور مش التسليم).

**الإصلاح (`src/pages/AutomationPg.jsx`):**
1. **فحص ما قبل الإرسال شامل** — مش `waReady` بس؛ كمان `queuePaused` +
   `queueRunning` + الحد اليومي (`daily.sent`/`settings.dailyCap`). أي مانع
   بيظهر بوب اب واضح بالسبب قبل الإرسال.
2. **تحقق التسليم بعد الإرسال** — يراقب `/status` ~20 ثانية ويتأكد إن الطابور
   بيفرّغ فعلاً (`daily.sent` بيزيد أو `queue.pending` بيقل تحت `queueTotal`
   بعد الإرسال). بيفرّغ → «هتوصل خلال دقايق (~10ث/رسالة)». واقف → تحذير صريح
   (Resume / restart / امسح QR) + عدد الطابور. سجل التاريخ `success` بقى =
   حركة الطابور الحقيقية، مش مجرّد enqueue (+ حقول `delivered`/`queueDraining`).
3. **مؤشّر صفحة الأتمتة** بقى يمرّر `lastTickAt` لـ `BridgeStatusIndicator` →
   بيطلّع «🟡 متصل — المجدول متوقف» لو الـ VPS cron واقف، بدل أخضر مضلِّل.

**ملف معدّل واحد:** `src/pages/AutomationPg.jsx` (import `tell` + `onSendTest`
+ `BridgeStatusPill` + موقع العرض). بناء ✓ + 326 test ✓.

**ملاحظة مهمة لـ Ahmed:** ده بيخلّي المشكلة **تبان** مش بيخلّي الرسائل تتسلّم لو
البريدج نفسه واقف. الإصلاح الفعلي للتسليم على الـ VPS: (أ) `queuePaused`→Resume،
(ب) `queueRunning=false`→restart البريدج، (ج) `waState` مش READY→امسح QR،
(د) المجدول واقف من يناير → صلّح الـ VPS cron على `/api/automation-tick`
(+ `AUTOMATION_TICK_SECRET`).

---

## 🧭 ملخّص السيشن (2026-06-16/17) — V21.27.0 → V21.27.23

**الفكرة الكبيرة:** إعادة هيكلة **الموديل = وصفة** و**الأوردر = الكمية الفعلية**،
مع ربطهم ببعض، + ترقيات كبيرة في **استوديو الـ AI** (محرّر صور شبه Canva،
استخراج برومبتس، مكتبة أقسام)، + إصلاحات أداء/اتصال.

**القرار المعماري المحوري:**
- **الموديل** بيعرّف الوصفة بس: استهلاك القطعة، ألوان (أسماء)، مقاسات، قطع،
  إكسسوار بكمية للقطعة، نسب هالك، تفاصيل تشغيل، صورة/صور ألوان.
- **الأوردر** بيمسك الكميات الفعلية (الراقات لكل لون → كمية القص) + الـ PO
  والحالة والتسليمات. **التكلفة لسه على الراقات في الأوردر** (مفيش تغيير
  في `calcOrder` للقماش).
- **المبيعات معتمدة على كمية الأوردر** زي القديم بالظبط — مفيش ملف مبيعات اتلمس.

---

## V21.27.38 — قائمة الموردين: عرض مُحسّن (virtualization) ⚡
- نفس نمط العملاء (V21.27.28): فرع virtualized شرطي في `PurchasePg.jsx`
  (سطر ~1960) لما `list.length>120` — div-grid header + `VirtualList`، مع
  إبقاء الجدول الأصلي للقوائم الأصغر. `overflowX:hidden` على الكمبيوتر.
  الأعمدة: checkbox(لو supSelMode)/المورد+تاجز/تليفون/فواتير/مشتريات/مدفوع/
  رصيد/آخر نشاط/أزرار (دفعة/تعديل/حذف) — كلها بنفس الـ handlers.
- ملف: `src/pages/PurchasePg.jsx`.

## V21.27.37 — مؤشّر واتساب صادق + مراقب المجدول 🚨
- **السياق (تشخيص حادثة):** التقارير/التريجرات/الحملات بتعتمد على **VPS
  crontab خارجي** بيضرب `/api/automation-tick` كل 5 دقايق (مش Vercel cron —
  مش في `vercel.json`). لو الـ VPS cron وقف، كله بيقف بصمت، ومؤشّر واتساب
  يفضل أخضر لإنه بيقيس جلسة واتساب (`waReady`) بس — مش حياة المجدول.
- **المؤشّر الصادق:** `BridgeStatusIndicator` بقى ياخد `lastTickAt` (من
  `cfg.automation`) — لو ready بس آخر نبضة >15 دقيقة → 🟡 «متصل — المجدول
  متوقف» + تفاصيل في التول-تيب. تمريره من home bar في `App.jsx`.
- **مراقب المجدول:** `api/cron/scheduler-watchdog.js` (جديد) — Vercel cron كل
  30 دقيقة (بنية مستقلة عن الـ VPS فبيكتشف موته فعلاً). لو lastTickAt >20
  دقيقة → تنبيه واتساب واحد لمستلمي الأتمتة (idempotency عبر
  `automation.watchdogAlertedAt`، cooldown 6 ساعات) عبر `bridgeSend`. لما
  المجدول يرجع، العلم بيتصفّى. cron مضاف في `vercel.json`.
- ⚠️ **الإصلاح الفعلي تشغيلي** (على الـ owner): راجِع الـ VPS crontab +
  `AUTOMATION_TICK_SECRET` + الـ bridge host. الكود هنا بيكشف ويبلّغ بس.
- ملفات: `src/components/BridgeStatusIndicator.jsx` · `src/App.jsx` ·
  `api/cron/scheduler-watchdog.js` · `vercel.json`.

## V21.27.36 — استخراج البرومبت من الصور: fix خطأ التحليل المتقطّع 🪄
- **root cause:** `describe-image.js` بيستخدم gemini-2.5-flash اللي «التفكير»
  فيه enabled افتراضياً — أحياناً بياكل ميزانية التوكنز فيرجّع `parts` فاضية
  (`finishReason=MAX_TOKENS`) → raw فاضي → «تعذّر قراءة نتيجة التحليل».
- **الحل:** `thinkingConfig:{thinkingBudget:0}` + `maxOutputTokens:1024` +
  إعادة محاولة واحدة لو الرد فاضي (مش بسبب حجب أمان) + تشخيص `finishReason`/
  `blockReason` في رسالة الخطأ.
- ملف: `api/ai-image/describe-image.js`. (ملاحظة: `analyze-prompt.js` ليه نفس
  النمط — مرشّح لنفس التحصين لو ظهرت نفس المشكلة فيه.)

## V21.27.35 — استوديو الصور: رجوع أسماء الأزرار كاملة (fix) 🔤
- الـ grid (cols=ceil(n/2)) في V21.27.31 كان بيضيّق الأزرار فالأسماء تتقصّ
  لـ «...». رجعنا لـ `flex-wrap` بعرض طبيعي (`bStyle` بدون width:100%/ellipsis)
  فالأسماء بتظهر كاملة. anchor التحميل رجع `inline-block`.
- ملف: `src/pages/AIStudioPg.jsx`.

## V21.27.34 — قائمة العملاء: عرض كامل + إلغاء الاسكرول الأفقي (fix) 📋
- **العرض:** حاوية صفحة العملاء كانت `maxWidth:1500` → بقت `"100%"` (عرض
  الشاشة كامل).
- **الاسكرول الأفقي:** `react-window` v2 `<List>` بيستخدم `overflow:"auto"`
  فكان بيطلّع شريط تمرير أفقي حتى لو المحتوى بعرض الحاوية. الحل: تمرير
  `style={{overflowX: isMob?"auto":"hidden"}}` للـ VirtualList → على الكمبيوتر
  مفيش اسكرول أفقي، على الموبايل اتساب (عشان الأزرار تفضل في المتناول).
- ملف: `src/pages/CustDeliverPg.jsx`.

## V21.27.33 — المحرّر: تحديد/تحريك متعدد + نسخ/لصق بين الصور 🎯
- **تحديد متعدد:** `selIds` (Set) + وضع `multiSel` (زر «🔲 تحديد متعدد»
  للموبايل) أو Shift/Ctrl/⌘+كليك. `startMove` بيحسب التحديد الجديد + بيلتقط
  مواضع كل المحددين (`starts`)، و`onMove` بيحرّكهم كلهم بنفس الدلتا من
  مواضعهم الأصلية. مقابض التكبير/التدوير بتظهر للعنصر المفرد بس.
- **نسخ/لصق بين الصور:** `_editorClipboard` على مستوى الموديول (بيفضل بين
  فتحات المحرّر في الجلسة). `copySelected` بيستنسخ المحددين (deep clone بدون
  id)، `pasteClipboard` بيضيفهم بـ id جديد + نفس المواصفات (الموضع محصور
  داخل حدود الصورة الحالية).
- UI: أزرار تحديد متعدد/نسخ/لصق في التولبار + banner عدد المحددين + زر نسخ
  وحذف-المحدد في الـ inspector.
- ملف: `src/components/ImageEditorModal.jsx`.

## V21.27.32 — المحرّر: شيل الاسطمبة + افتراضيات نص جديدة ✏️
- **شيل الاسطمبة بالكامل:** اتشال `addStamp` + `stampLines` + زر التولبار +
  فرع الرسم في `buildBlob` + فرع DOM + بلوك الـ inspector + preload الخط.
  البديل = نص عادي بخط Anton.
- **افتراضيات النص الجديدة (`addText`):** الخط `'Anton'`، اللون `#000000`،
  `bold:false`، `shadow:false` (بدل الأبيض/بولد/ظل).
- ملف: `src/components/ImageEditorModal.jsx`.

## V21.27.31 — استوديو الصور: أزرار صفّين + شيل الوصف + fix الحذف 🎛️
- **أزرار صفّين:** `resultActions` بقت `display:grid` بأعمدة = `ceil(n/2)` بدل
  `flex-wrap` المتعرّج — كل زر `width:100%` بيملأ خليته → متساويين ومرتّبين.
- **شيل الوصف:** اتشال `{res.desc && <div>...}` من `ResultCard` (تحت الصورة).
  الوصف لسه متخزّن وبيظهر في الزووم/التخزين.
- **fix كامن:** `deleteResult` كان بيستدعي `setPinnedIds` (مش معرّف بعد
  refactor قديم) → `ReferenceError` بيكسر الحذف. اتشال السطر اليتيم.
- ملف: `src/pages/AIStudioPg.jsx`.

## V21.27.30 — المحرّر: تصدير حاد (supersampling) 🖼️
- **البكسلة (root cause):** `buildBlob` كان بيعمل canvas بأبعاد `dims` (دقة
  الصورة الطبيعية) — لو الصورة واطية الدقة، النص/الأرقام بيطلعوا مبكسلين.
  الحل: supersampling — canvas بدقة `ES = min(2.5, 4096/maxSide)` + `ctx.scale(ES,ES)`
  والرسم كله بإحداثيات dims المنطقية → النص يتحوّل لـ fs×ES بكسل حقيقي (حواف حادة).
  imageSmoothingQuality="high". مفيد لكل الطبقات (نص/صور).
- ملف: `src/components/ImageEditorModal.jsx`.

## V21.27.29 — قائمة العملاء بتمتد لآخر الشاشة (fix) 📋
- المشكلة: في V21.27.28 الـ VirtualList كان بارتفاع ثابت `min(rows*54,640)` →
  القائمة بتبان مقطوعة في نص الصفحة مع فراغ كبير تحتها.
- الحل: `VirtualList` بقى ليه وضع `fill` (لما `height` مش متمرّر) — بيقيس
  `getBoundingClientRect().top` ويملأ `innerHeight - top - bottomGap`، مع
  cap على ارتفاع المحتوى الفعلي (مفيش فراغ تحت القوائم القصيرة) وحد أدنى 220px.
  بيتحدّث على `resize` وتغيّر عدد العناصر.
- `CustDeliverPg`: شيل الـ `height={min(...,640)}` → بقى fill تلقائي + overscan 10.
- ملفات: `src/components/VirtualList.jsx` · `src/pages/CustDeliverPg.jsx`.

## V21.27.28 — قائمة العملاء الضخمة: عرض مُحسّن (virtualization) ⚡
- `src/components/VirtualList.jsx` (جديد، مشترك): wrapper رفيع فوق
  `react-window` v2 (`<List>` + `rowComponent` + `rowProps`) — بيرندر الصفوف
  الظاهرة على الشاشة بس (+ overscan) بدل كل الصفوف.
- **قائمة العملاء** (`CustDeliverPg.jsx`): فرع virtualized شرطي **لما العدد
  > 120** — يعرض الكل (مفيش «عرض المزيد») ويرندر visible rows بس. الهيدر
  والصفوف بيشاركوا نفس أنماط الأعمدة عشان المحاذاة تتطابق. ارتفاع الصف 54px،
  منطقة تمرير حتى 640px.
- **محسوب للمخاطرة (§0.1 + §15):** القوائم الصغيرة (< 120 = الحالة الشائعة)
  تفضل بالجدول الأصلي **بدون أي تغيير** — الـ blast radius محصور في حالة
  الـ 1500 عميل بس، وقابل للعكس تمامًا (شيل الفرع الشرطي). الجداول التانية
  (الأوردرات/الخزنة) **ماتلمستش** — virtualization للجداول مخاطرة عالية بدون
  بيئة تجربة، اتأجّلت بقرار Ahmed.
- ⚠️ **محتاج تأكيد production:** التمرير + التعديل + الحذف + الفلترة في قائمة
  عملاء كبيرة (> 120). لو فيه أي خلل بصري، الـ rollback = شيل فرع `if(fc.length>120)`.
- ملفات: `src/components/VirtualList.jsx` · `src/pages/CustDeliverPg.jsx` ·
  `package.json` (react-window).

## V21.27.27 — تحديث Firestore persistence (متعدد التابات + أسرع) ⚡
- النقل من `enableIndexedDbPersistence(db)` المهجور (single-tab فقط — كان
  بيرمي `failed-precondition` لو المستخدم فاتح أكتر من تاب → التاب التاني
  من غير offline cache) للـ API الحديث في `initializeFirestore`:
  `localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })`.
- **الفايدة:** كل التابات بتشارك نفس الـ IndexedDB cache · cold-start أسرع
  (القراءات من الـ cache قبل الشبكة) · fallback تلقائي لـ in-memory في
  المتصفحات اللي مابتدعمش IndexedDB (مفيش throw).
- ⚠️ **بيلمس تهيئة Firestore — محتاج تأكيد سريع على production** (افتح
  التطبيق + تابين، اتأكد إن الداتا بتحمّل والـ offline شغّال). لو حصل أي
  سلوك غريب، الـ rollback = رجوع `enableIndexedDbPersistence`.
- ملف: `src/firebase.js`.

## V21.27.26 — أداة تحليل حجم الـ bundle (dev-only) 📊
- `rollup-plugin-visualizer` (devDependency) — أداة قياس بتطلّع treemap
  تفاعلي (`dist/stats.html`) بأحجام gzip/brotli لكل chunk. تشغيل:
  `npm run build:analyze` (= `ANALYZE=1 vite build`).
- **OFF افتراضياً:** الاستيراد ديناميكي + شرطي على `process.env.ANALYZE`،
  فالـ build العادي مش محتاج الحزمة ولا بيتأثر. لو الحزمة مش متثبّتة والـ
  ANALYZE مفعّل → warning بدل crash.
- الفايدة: نشوف إيه اللي بيكبّر الـ chunks فعلاً (أكبرهم دلوقتي:
  index 936KB، vendor-firebase 651KB، vendor-recharts 541KB، xlsx 429KB)
  بدل التخمين — أساس لأي اختصار لاحق.
- ملفات: `vite.config.js` · `package.json` (script + devDep).

## V21.27.25 — مراقبة الأخطاء عن بُعد (Remote error logging) 🩺
- **السبب:** CLARK بيـ deploy على production مباشرة بدون بيئة تجربة
  (البروتوكول §1). الـ `ErrorBoundary` كان بيـ console.error محلياً بس →
  أي crash عند مستخدم كان بيختفي تماماً عن المطوّر. دلوقتي بقى مرئي.
- `src/utils/errorLog.js` (جديد): logger خفيف best-effort بيكتب الأخطاء في
  `errorLogsDays/{YYYY-MM-DD}` (per-day doc، نفس نمط daily-split §2).
  بيلتقط ٣ مصادر: شجرة React (ErrorBoundary.componentDidCatch)، `window.onerror`،
  و`unhandledrejection`. كل entry: ts/version/kind/msg/stack/ctx/url/ua/by.
- **محسوب للأداء:** best-effort (مايرميش exception أبداً)، dedup للأخطاء
  المتكررة خلال دقيقة (يمنع طوفان الكتابات في render loop)، حد أقصى ٢٥ كتابة
  في الجلسة (حماية حصة Firestore). صفر تأثير في الحالة العادية.
- `firestore.rules`: match clause لـ `errorLogsDays` (قراءة manager+، كتابة
  أي مستخدم مسجّل + `validDayDoc`). ⚠️ **لازم deploy للـ rules قبل/مع الـ
  client** (§10) — لو الـ rules مش متظبّطة، الكتابة بتفشل بصمت (degraded مش
  breaking).
- ملفات: `src/utils/errorLog.js` · `src/components/ErrorBoundary.jsx` ·
  `src/main.jsx` · `firestore.rules`.

## V21.27.23 — المحرر: جودة الاسطمبة + تكبيرها + فتح بأبعاد الصورة (fix)
- جودة الاسطمبة: شيل وزن 700 (Anton وزن واحد → faux-bold غامق/مبكسل) → 400
  في الـ DOM والـ canvas. `buildBlob` بيعمل `document.fonts.load` للخطوط
  المستخدمة فعلياً قبل الرسم.
- resize للاسطمبة بقى زي النص (يغيّر `size` مش `w`).
- المحرّر بيفتح بأبعاد الصورة: مساحة العرض `width=dispW` (شيل padding/flex)،
  المودال `width:fit-content` (مفيش أسود عالجوانب).
- ملف: `src/components/ImageEditorModal.jsx`.

## V21.27.22 — إصلاح CORS + اسطمبة الكود/الموديل/المقاسات
- **CORS:** `api/img-proxy.js` (جديد) — بروكسي صور (هوستات Google/Firebase فقط،
  anti-SSRF) بيرجّع الصورة بـ `Access-Control-Allow-Origin`. المحرّر بيمرّر
  الصور البعيدة عبره **وقت التصدير** → canvas مايتلوّتش → الحفظ شغّال.
- **اسطمبة:** طبقة `stamp` = كائن واحد (٣ سطور): CODE + رقم الموديل (أسود) +
  المقاسات (أحمر) بخط **Anton**. مملوءة من `prefill` (modelNo + sizeLabel).
  inspector لتعديل الحقول/الألوان/الخط/الحجم. زر «🏷️ اسطمبة».
- ملفات: `api/img-proxy.js` · `ImageEditorModal.jsx` · `AIStudioPg.jsx`.

## V21.27.21 — محرّر صور كامل (شبه Canva)
- `src/components/ImageEditorModal.jsx` (جديد): محرّر client على canvas —
  طبقات نص (خط/حجم/لون/B/I/محاذاة/ظل/حد/شفافية، ~18 خط عبر Google Fonts) +
  طبقات صورة/لوجو. تحريك (سحب) + تكبير (مقبض ركن) + تدوير (مقبض فوق) عبر
  pointer events. ترتيب/تكرار/حذف. تصدير PNG بدقة الأصل (تحميل + onSave).
- زر «🎨 محرّر» في `resultActions`. الزر القديم «✏️ تعديل» (AI) → «✏️ تعديل AI».

## V21.27.20 — مكتبة البرومبتس: أقسام جديدة مخصّصة
- `aiPromptLibrary.js`: `loadPromptLibrary(extraGroups)` + `libGroupDocId`
  collision-safe للأقسام العربية (هاش قصير ثابت؛ المدمجة بنفس المعرّف).
- زر «🗂️ قسم جديد» (askInput) → `cfg.aiStudioPresets.promptGroups`. الأقسام
  المخصّصة بتظهر (حتى فاضية) في كل اختيارات القسم.

## V21.27.18 — توحيد البرومبتس
- اتشال قسم «📸 برومبتس جاهزة» المنفصل. «🪄 استخراج من صور» اتنقل لمكتبة
  البرومبتس، والمستخرَج بينزل في المكتبة مع **اختيار القسم** + إعادة تسمية.

## V21.27.17 — استخراج البرومبتس: كمبيوتر/مساحة التخزين
- `PromptExtractModal` بقى يستخدم `ImagePickButton` (كمبيوتر + تخزين).
- `describe-image.js` بيقبل `imageUrl` (بيجيب الصورة من السيرفر).

## V21.27.13 — استخراج برومبتس من صور الوقفات
- `api/ai-image/describe-image.js` (جديد): Gemini Flash vision — صورة →
  برومبت + اسم. `aiImageClient.describeImage`. `PromptExtractModal.jsx` (رفع
  متعدد → preview → حفظ). زر «🪄 استخراج من صور» في الاستوديو.

## V21.27.19 — تفاصيل الموديل + لايت بوكس + باليت ألوان + خامات صف واحد
- `ModelDetailModal.jsx` (جديد): كليك على الموديل → بوب اب تابات (قماش/ألوان ·
  إكسسوار · تفاصيل · **الأوامر المرتبطة** = orders filter modelId) + تعديل/إغلاق.
- `ImageLightbox.jsx` (جديد): صورة بالجودة الكاملة. متوصّل: كارت الموديل +
  التفاصيل + الأوامر. DetPg: زوم الأوردر بقى `contain` (من غير قص).
- `COLORS_DB`: توسعة لـ ~64 لون. `ColorPicker`: بوب اب وسط الشاشة + بحث + لون
  مخصّص (hex). ModelForm تاب القماش: كل الخامات على صف أفقي واحد.

## V21.27.16 — تعديل الموديل ينعكس على الأوامر + ألوان الكارت + خامات مضغوطة
- `propagateModelToOrders(modelId, model)` في App.jsx: تعديل الموديل بيحدّث
  **الحقول المقفولة بس** في الأوامر المرتبطة (خامات/استهلاك/قطع-راق/مقاسات/قطع/
  تفاصيل + color_source/color_images). **مابيلمسش** ألوان الأوردر/كمياته/
  إكسسوار/هالك/تعليمات/PO/حالة/تسليمات (عشان مانمسحش تعديلات الأوردر).
- كروت الموديل بتعرض ألوان خامة المصدر بس. تاب القماش: ألوان inline مضغوطة
  بدل الجدول الكبير.

## V21.27.15 / .14 — سحب الموديلات: انتقائي + فلتر
- `importModelsFromOrders({only})` — سحب انتقائي. ModelsPg: شيپس قابلة للاختيار
  + «تحديد الكل/إلغاء» + فلتر برقم الموديل + «🚀 سحب المحدد».
- ربط الاستوديو بقى يستخدم `ImageLinkModal` المشترك (V21.27.14).

## V21.27.11 — سحب الموديلات من الأوامر
- `buildModelFromOrder(order)` (orders.js) = عكس `buildOrderFromModel`. +5 اختبارات.
- `importModelsFromOrders({link})` في App.jsx (idempotent + writeBatch). زر
  «📥 سحب من الأوامر» في ModelsPg + Dry-run preview. **بيربط الأوامر بـ modelId**.

## V21.27.12 — حذف أمر التشغيل بقى سريع (fix)
- `delOrder` كان بيعمل transaction تقرأ/تكتب factory/config + factory/sales
  (~1MB) كل مرة. دلوقتي مسار سريع: لو الأمر مالوش خصم مخزون ولا مراجع →
  `deleteDoc` واحدة.

## V21.27.10 — الربط بلون: ألوان خامة الماتريكس بس (fix)
- `orderColorsOf` (ImageLinkModal) بيرجّع ألوان خامة المصدر (color_source_fabric)
  بس مش كل الخامات.

## V21.27.9 — ربط الصورة: لون للموديل + «رئيسية» أول اختيار
- `ImageLinkModal` تبويب الموديل بقى خطوتين (موديل → رئيسية + ألوان).

## V21.27.8 — البريدج: أزرار التعافي تظهر وهو عالق (fix)
- أزرار «🔧 إصلاح تلقائي»/«🔌 قطع الاتصال» كانت محبوسة (canEdit && isReady) +
  الزر الإنلاين لـ INIT/DISCONNECTED بس. دلوقتي بتظهر لأي حالة عالقة (مش
  REPAIRING) — `CampaignsPg.jsx`.

## V21.27.7 — مساحة التخزين: أدوات صف واحد + ربط الصورة
- `ImageLinkModal.jsx` (جديد، مشترك). DocumentsPg: أدوات الملف صف واحد + زر 🔗.
  تمرير models/replaceModel/updOrder من App.

## V21.27.6 — الورش: رقم الموديل وتحته رقم أمر التشغيل
- بوب اب «التشغيل والورش» + أذون الورش المطبوعة. حركة التسليم بتخزّن poNumber.

## V21.27.5 — ربط الأوردر بالموديل (الأساسي)
- `buildOrderFromModel`: نقل `pcsPerLayer` للخامة + قطع/راق افتراضي لكل لون
  (كان بيضيع → «--»).
- **OrdForm** (fromModel = `!modelMode && !!form.modelId`): قفل الخامة
  (عرض)، إخفاء +/✕/إضافة خامة، استهلاك/راق + قطع/راق للعرض، قفل المقاسات
  والقطع. الألوان (راقات + إضافة) تفضل قابلة للتعديل.
- `genPO`: نمط «#<رقم الموديل>-NNN» تسلسلي لكل موديل + تعبئة تلقائية.
- ModelForm: حصرية القطع للخامات.

## V21.27.0 → V21.27.4 — إعادة هيكلة الموديل (٥ مراحل)
1. **V21.27.0** تاب القماش: استهلاك القطعة المحسوب + ألوان بس (FCTable `simple`).
2. **V21.27.1** تاب لون/مقاس: ماتريكس + صور بدون كميات (`ColorSizeMatrixTab` specMode).
3. **V21.27.2** إكسسوار: كمية للقطعة + سعر وحدة (`qtyPerPiece`) — calcOrder/CalcPg/DetPg.
4. **V21.27.3** نسبتا هالك (قماش/إكسسوار) كبنود تكلفة مستقلة — calcOrder + DetPg.
5. **V21.27.4** تاب «تفاصيل التشغيل» منسّق (RichTextEditor + sanitizeHtml) يطبع مع الأمر.

---

## 🔜 اللي لسه (TODO / للمتابعة)

- **مراقبة الأخطاء (V21.27.25):** ⚠️ **لازم deploy لـ `firestore.rules`** عشان
  الكتابة في `errorLogsDays` تشتغل (من غيره permission-denied بصمت). بعد
  الـ deploy: لوحة عرض للأخطاء في `DiagnosticsPanel` (TODO) عشان manager+
  يشوفها من غير Firestore console.
- **اقتراحات اختار Ahmed يبدأ بيها (V21.27.25 session):** ١) مراقبة الأخطاء ✅
  ٢) virtualization للقوائم الضخمة (react-window) — لسه. ٣) تحليل حجم الـ
  bundle (rollup-plugin-visualizer) — لسه. ٤) تحديث Firestore persistence لـ
  `persistentLocalCache` متعدد التابات — لسه (محتاج تأكيد production).

- **CORS التصدير:** اتعمل `/api/img-proxy` (V21.27.22). لو لسه فيه فشل تصدير،
  البديل: ضبط CORS على الـ Storage bucket مباشرة، أو compositor سيرفر كامل.
  **محتاج تأكيد إنه شغّال على production.**
- **محرّر الصور — أفكار إضافية:** أشكال (مستطيل/دائرة/خط)، فلاتر/سطوع/تباين،
  قوالب جاهزة (templates)، **اسطمبات محفوظة** (تصمّم اسطمبة وتستخدمها على أي
  صورة)، دوران افتراضي ٩٠° للاسطمبة، snap/خطوط محاذاة، undo/redo.
- **الخطوط أحادية الوزن** (Anton/Bebas...): طلب bold بيعمل faux-bold. ممكن
  نمنع زر B لما الخط أحادي الوزن.
- **propagateModelToOrders:** بيحدّث الحقول المقفولة بس. لو المستخدم عايز
  الإكسسوار/الهالك كمان يتحدّثوا من الموديل دايماً → قرار + تنفيذ (بس ساعتها
  الأوردر مايعدّلهمش).
- **سحب الموديلات:** بيشتغل على الموسم النشط بس. نسخة لكل المواسم لو لزم.
- **أقسام المكتبة المخصّصة:** ممكن نضيف حذف/إعادة تسمية للقسم المخصّص.
- **اختبار يدوي على production** (مفيش بيئة تجربة): الأقفال في الأوردر، نسب
  الهالك في التكلفة/الربح، سحب الموديلات + الربط، المحرّر/الاسطمبة، البريدج.

---

## 📌 ملفات/مفاهيم مهمة اتضافت السيشن ده
- `src/components/ImageLinkModal.jsx` — ربط صورة بموديل/أمر/لون (مشترك).
- `src/components/ImageEditorModal.jsx` — محرّر الصور (Canva-like + اسطمبة).
- `src/components/ImageLightbox.jsx` — عرض صورة بالجودة الكاملة.
- `src/components/ModelDetailModal.jsx` — بوب اب تفاصيل الموديل + الأوامر.
- `src/components/PromptExtractModal.jsx` — استخراج برومبتس من صور.
- `src/components/RichTextEditor.jsx` + `src/utils/sanitizeHtml.js` — تفاصيل التشغيل.
- `api/img-proxy.js` — بروكسي CORS للصور.
- `api/ai-image/describe-image.js` — Gemini vision (صورة→برومبت).
- `orders.js`: `buildModelFromOrder` (عكس buildOrderFromModel) + حقول الهالك في calcOrder.
- App.jsx: `importModelsFromOrders` + `propagateModelToOrders` + مسار حذف سريع.
