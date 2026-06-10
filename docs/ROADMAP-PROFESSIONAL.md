# CLARK — خارطة طريق التحول الاحترافي (Professional Transition Roadmap)

> **الهدف:** الانتقال بـ CLARK من "منتج شغال بيعتمد على الاختبار اليدوي والحظ"
> إلى **نظام مالي محصّن** — كل سطر بيمس فلوس محمي بثلاث طبقات: tests +
> rules validation + reconciliation تلقائي.
>
> **المرجع:** نتايج المراجعة الشاملة بتاريخ 2026-06-10 (٤ محاور: client
> architecture / API security / Firebase rules / code quality).
> التقييم الحالي: أمان B+، معمارية B−، جودة كود D، عمليات D، توثيق A−.
>
> **تاريخ الإنشاء:** 2026-06-10 — الحالة: مقترح بانتظار اعتماد Ahmed.

---

## المبادئ الحاكمة (غير قابلة للتفاوض)

1. **مفيش Big Rewrite.** كل خطوة shippable لوحدها ومتوافقة للخلف. النظام
   في production بفلوس حقيقية — أي خطوة لازم تكون reversible.
2. **Tests قبل أي Refactor.** ممنوع نلمس App.jsx أو TreasuryPg هيكلياً
   قبل ما يكون فيه شبكة tests بتثبت السلوك الحالي.
3. **كل bug سابق = regression test.** حوادث V21.9.14 (تكرار 3800)،
   V21.9.39 (مسح الخزنة الصامت)، V21.9.41 (واتساب مزدوج)، V21.9.45
   (transfer بدون أرجل)، V21.21.22 (رصيد البوابة ≠ الكشف) — كل واحدة
   بتتحول لـ test بيمنع رجوعها للأبد.
4. **الترتيب مقدس:** شبكة أمان ← تحصين المال ← أدوات ← هيكلة. ممنوع نقفز
   لمرحلة قبل ما بوابة خروج المرحلة اللي قبلها تتحقق.
5. **تجميد الميزات الكبيرة أثناء المرحلتين 0 و1.** درس V21.9.67-69:
   التطوير فوق أساس غير محصّن = دوامة regressions. ميزات صغيرة عاجلة
   مسموحة بعد تقييم blast radius.

---

## المرحلة 0 — شبكة الأمان (جلستان–ثلاث جلسات)

> قبل ما نصلّح أي حاجة، لازم يبقى فيه مكان نجرب فيه غير production.

### 0.1 بيئة Staging
- مشروع Firebase تاني مجاني (`clark-factory-staging`) — Firestore + Auth
  + Storage بنفس الـ rules.
- فرع `staging` في GitHub ← Vercel Preview Deployment تلقائي بـ env vars
  بتشاور على مشروع الـ staging.
- سكربت seed: نسخة anonymized من بيانات production (أسماء/تليفونات
  مموهة، أرقام مالية حقيقية عشان الاختبارات تكون واقعية) —
  `api/maintenance/export-anonymized.js` + سكربت import محلي.
- **يحتاج Ahmed:** إنشاء المشروع من Firebase Console + إضافة env vars في
  Vercel. كل الباقي ينفذ من جلسات الكود.

### 0.2 CI Pipeline (GitHub Actions)
- workflow جديد `ci.yml`: على كل push/PR → `npm ci` + `npm run build`
  (+ لاحقاً tests + lint مع تقدم المراحل).
- البناء الفاشل يمنع الـ merge. (الـ workflow الحالي بيعمل deploy لـ rules
  بس — هيتوسع مش هيتشال.)

### 0.3 نسخ احتياطي تلقائي
- تفعيل Scheduled Firestore Exports (يومي) إلى GCS bucket + تفعيل PITR
  (Point-in-Time Recovery) — يحتاج خطة Blaze (التكلفة هامشية لحجم
  CLARK، دولارات قليلة شهرياً).
- الوضع الحالي (backups يدوية قبل الـ migrations فقط) غير كافٍ لنظام مالي.

### 🚪 بوابة الخروج 0
- [ ] deploy على staging شغال ويعرض بيانات seed
- [ ] CI أخضر على main وstaging
- [ ] أول export يومي ناجح موجود في الـ bucket

---

## المرحلة 1 — تحصين المال (٤–٦ جلسات) ⭐ قلب الخطة

> الهدف المعلن: "خالي من الأخطاء المالية". ده بيتحقق بثلاث طبقات دفاع،
> مش بطبقة واحدة.

### 1.1 طبقة الدفاع الأولى — Unit Tests على المنطق المالي (Vitest)
- إضافة `vitest` (devDependency — متوافق مع Vite الموجود، صفر إعداد تقريباً).
- الأولوية للملفات الـ pure (بتتاختبر بدون Firebase خالص):
  | الملف | ما يُختبر |
  |---|---|
  | `src/utils/accounting/posting.js` | `validateLines`: توازن مدين/دائن، رفض سطر واحد، رفض حساب غير موجود |
  | `src/utils/accounting/postingRules.js` | كل builder (بيع/مرتجع/COGS/دفعات/خزنة/HR) بسيناريوهات حقيقية |
  | `src/utils/accounting/statement.js` | كشف العميل/المورد: شيك معلق، مرآة توزيعة (skip)، dedup شيكات المورد |
  | `src/utils/accounting/accountSummary.js` | أرصدة العملاء/الموردين + تخطي المرايا في ٤ المواقع |
  | `src/utils/dashboardKpis.js` | معادلة الربح (V21.21.17) |
  | `src/utils/invoices.js` | حسابات الفاتورة: خصومات، ضرائب، إجماليات |
  | `api/_buildDailyReport.js` | أقسام التقرير اليومي + تخطي المرايا |
- **Regression tests للحوادث السابقة** (إلزامي — البند 3 من المبادئ).
- الهدف الكمي: ~80-120 test، تغطية >90% للملفات أعلاه (مش للمشروع كله).
- تُضاف لـ CI: البناء + الاختبارات لازم يعدوا قبل أي push.

### 1.2 طبقة الدفاع الثانية — Firestore Rules Validation + اختبارها
- **اختبارات rules بالـ emulator** (`@firebase/rules-unit-testing` +
  `firebase emulators:exec`) — تجري محلياً وفي CI **بدون أي خطر على
  production** (ده بيحل مشكلة "مفيش بيئة اختبار للـ rules" اللي سببت
  حادثة V21.9.69).
- بعد ما الاختبارات تثبت السلوك الحالي، نضيف field-level validation
  تدريجياً على المجموعات المالية:
  - `treasuryDays`: `entries is list`، لكل عنصر `amount is number`،
    `type` ضمن enum معروف، `date` بصيغة `YYYY-MM-DD`.
  - `accountingDays`: توازن القيد (مجموع المدين = الدائن) قدر ما تسمح CEL،
    وعلى الأقل أنواع الحقول.
  - `custPaymentsDays` / `supplierPaymentsDays` / `checksDays` /
    `salesInvoicesDays` / `purchaseInvoicesDays`: أنواع الحقول الأساسية.
- إصلاحات الـ rules المرصودة في المراجعة:
  - `custPaymentsDays`: استبدال قائمة الأدوار الـ hardcoded بـ
    `isAnyAccountant()` (اتساق مع dynamic roleScopes).
  - `hrLogDays`: قصر الكتابة على `isHRWriter()` (سد ثغرة تلاعب سجل
    التحقق).
- النشر: staging أولاً → اختبار يدوي ليوم → production. (firestore.rules
  فقط — **ممنوع** أي cross-service helpers في storage.rules، درس V21.9.69.)

### 1.3 طبقة الدفاع الثالثة — Reconciliation تلقائي يومي
- endpoint جديد `api/cron/reconcile-financials.js` (cron يومي 4 صباحاً):
  - يقارن: الخزنة ↔ قيود اليومية ↔ الفواتير ↔ الدفعات ↔ التحويلات
    المؤكدة (الأرجل موجودة؟) ↔ orphans محاسبية.
  - يكتب تقرير في `reconciliationDays/{date}` ويرفع علم في الـ health pill.
  - عند وجود فروقات: إشعار واتساب فوري لـ Ahmed عبر الـ bridge (نفس
    نمط dailyReport + idempotency الموجود).
- ده بيحوّل الإصلاحات اليدوية الحالية (repair endpoints في
  DiagnosticsPanel) من "لو لاحظت اضغط" إلى "النظام بيكتشف ويبلغك" —
  الإصلاح نفسه يفضل يدوي بقرار بشري (صح كده).

### 1.4 سد فجوات الكتابة المالية
- **autoPost fire-and-forget** → `await` + `try/finally` مع تسجيل فشل
  مضمون في `accountingPostFailures` (النمط موثق في §10 لكن مش مطبق هنا).
- **مراجعة الـ ~20 catch block الفاضي على المسارات المالية** (من أصل 124):
  تحويل التسليمة لفاتورة في CustDeliverPg، توست "تم الموافقة" قبل تأكد
  النجاح في TreasuryPg، إلخ. القاعدة الجديدة: ممنوع toast نجاح قبل
  resolve فعلي، وكل فشل مالي يظهر للمستخدم.
- **`api/ai.js`**: إضافة AbortController بـ timeout 8 ثواني (التزام
  بقاعدة §10 الموجودة أصلاً).

### 1.5 إزالة قنابل الـ 1MB الموقوتة
- Migration فوري لـ `tagRegistry` → `tagRegistryDocs` و`contacts` →
  `contactsDocs` (نفس نمط V19.57 الجاهز + checklist §10 كامل: rules +
  hydration + merge + safety gates + endpoint + UI banner).
- `documentsTree` و`generalProducts` و`catalog`: مراقبة بإنذار مبكر —
  إضافة تنبيه في DiagnosticsPanel عند تجاوز أي مصفوفة config حد 70%
  من المساحة الآمنة (بدل الاكتشاف عند الانفجار).

### 🚪 بوابة الخروج 1
- [ ] 80+ unit test خضراء في CI تغطي كل المنطق المالي الـ pure
- [ ] regression test لكل حادثة تاريخية مالية
- [ ] rules validation منشورة ومُختبرة بالـ emulator في CI
- [ ] reconciliation يومي شغال وبيبعت تنبيهات
- [ ] صفر catch فاضي على مسار مالي
- [ ] tagRegistry + contacts متقسمين

---

## المرحلة 2 — النظافة والأدوات (٢–٣ جلسات)

### 2.1 ESLint + Prettier
- flat config بسيط (مش airbnb الكامل — هيغرّقنا في 10,000 تحذير):
  البداية بـ **errors فقط**: `no-empty` (catch blocks)، `no-undef`،
  `no-unused-vars`، `eqeqeq`. التشديد تدريجي.
- يُضاف لـ CI. الكود القديم يتصلح ملف-بملف مع كل مراجعة جزئية (مش دفعة
  واحدة).

### 2.2 تنظيف الـ Dependencies
- إزالة `@babel/core` + `@babel/parser` + `@babel/preset-react` (غير
  مستخدمة في runtime) و`zod` (متستبة وغير مستخدمة — أو نفعّلها فعلياً في
  validation الـ API، قرار وقتها).
- `xlsx@0.18.5` (EOL + CVEs): استبدال بـ `exceljs`، أو التحديث من
  cdn.sheetjs.com (النسخ الجديدة مش بتتنشر على npm). قرار عند التنفيذ.

### 2.3 توحيد مصادر الحقيقة
- `fmt/r2/fmtDate/money` في مكان واحد مشترك بين client وserver (حالياً
  3+ نسخ متباينة — خطر انحراف صامت في التقارير).
- حل ازدواجية `_resolveUnitCost` (postingRules ↔ autoPost — النسختان
  لازم يتوحدوا بكسر الـ circular import، مش بالنسخ).

### 2.4 الـ Changelog خارج الـ Bundle
- `AboutVersionModal` (984 KB minified / 400 KB gzip — أكبر chunk في
  التطبيق): تحويل الـ CHANGELOG لملف `public/changelog.json` يتحمّل
  lazy عند فتح المودال. توفير فوري لكل مستخدم في كل تحميل.

### 2.5 مراقبة الأخطاء (Sentry)
- `@sentry/react` (free tier كافٍ): كل error غير معالج + كل catch مالي
  يتسجل. ده العين اللي هتشوف الأخطاء اللي الـ 124 catch كانوا بيبلعوها.

### 🚪 بوابة الخروج 2
- [ ] lint أخضر في CI (مستوى errors)
- [ ] صفر dependencies غير مستخدمة، بديل xlsx مقرر ومنفذ
- [ ] مصدر واحد للتنسيق المالي client+server
- [ ] الـ bundle الرئيسي خف ~400 KB gzip
- [ ] Sentry بيستقبل أحداث من production

---

## المرحلة 3 — إعادة الهيكلة التدريجية (٦–١٠ جلسات، بالتوازي مع الشغل العادي)

> تبدأ فقط بعد بوابة 1 — الـ tests هي اللي بتخلي الـ refactor آمن.

### 3.1 تفكيك App.jsx (8,337 سطر) إلى طبقات
- `DataProvider` (listeners + merge + write queues + migrations) —
  ينقل كما هو بسلوك مطابق (الاختبارات تثبت).
- `AuthProvider` (user/role/permissions)، `UIProvider` (toasts/modals).
- النتيجة: تعديل في الخزنة ميرندرش صفحة HR والعكس (حالياً كل تغيير
  بيرندر كل الصفحات).

### 3.2 تفكيك صفحات الـ God تدريجياً — صفحة واحدة لكل release
- الترتيب: **TreasuryPg أولاً** (مالي) ← HRPg (117 useState!) ←
  CustDeliverPg ← SettingsPg ← ShopifyIntegrationPg.
- لكل صفحة: استخراج tabs/modals لملفات فرعية (نمط
  `components/accounting/` الناجح الموجود فعلاً).

### 3.3 مكونات وhooks مشتركة
- `useFormState` (يستبدل 30+ useState متكرر لكل فورم)،
  `useListFilter` (فلترة/فرز/بحث موحد)، `<DataTable>` مشترك.
- تقدير الوفر: ~2,000+ سطر duplication.

### 3.4 تأمين `_stableMatch` هيكلياً
- تحويل المقارنة اليدوية (20+ حقل بيتضافوا يدوياً) لمقارنة مبنية على
  **قائمة حقول واحدة معلنة** (constant) — إضافة حقل جديد من غير تحديث
  القائمة تفشل في test مخصص.

### 3.5 أنواع تدريجية (بدون TypeScript الكامل)
- `jsconfig.json` بـ `checkJs: true` على `src/utils/accounting/` فقط +
  JSDoc types للدوال المالية. يمسك أخطاء النوع في أخطر منطقة بتكلفة
  زهيدة. TypeScript الكامل قرار مؤجل (مش ضروري لمشروع solo).

### 🚪 بوابة الخروج 3
- [ ] App.jsx تحت 2,000 سطر، الـ data layer معزول
- [ ] TreasuryPg + HRPg مفككين، مفيش ملف فوق 3,000 سطر في الصفحات المالية
- [ ] تعديل خزنة ميرندرش HR (قياس فعلي بـ React DevTools)
- [ ] checkJs أخضر على مجلد المحاسبة

---

## المرحلة 4 — النضج التشغيلي (مستمرة)

### 4.1 E2E Smoke (Playwright على staging)
- ٥ مسارات ساخنة فقط: دخول → حركة خزنة → موافقة تحويل → تسليمة →
  فاتورة → كشف حساب. تجري على staging قبل كل promote لـ production.

### 4.2 إجراء Release رسمي
- التدفق الجديد: تطوير → CI أخضر (build+tests+lint+rules tests) →
  staging soak (يوم لتغييرات مالية، ساعات لغيرها) → promote لـ main →
  Vercel production.
- **Runbook للرجوع:** rollback في Vercel (deployment سابق بضغطة) +
  إجراء رجوع rules + استعادة من PITR — مكتوب خطوة بخطوة بحيث ينفذه
  أي حد غير Ahmed.

### 4.3 صيانة دورية
- `npm audit` + مراجعة dependencies كل ربع سنة.
- مراجعة diagnostics + أحجام المستندات شهرياً (إنذار 70% المبكر).

---

## الجدول الزمني التقديري

| المرحلة | الجلسات | تراكمي | الأثر |
|---|---|---|---|
| 0 — شبكة الأمان | 2–3 | أسبوع–أسبوعان | نهاية "deploy and hope" |
| 1 — تحصين المال ⭐ | 4–6 | شهر | **الهدف الأساسي: مال محصّن بثلاث طبقات** |
| 2 — النظافة | 2–3 | شهر ونصف | كود أنضف وأخف وأسرع |
| 3 — الهيكلة | 6–10 | 3 شهور | قابلية صيانة طويلة المدى |
| 4 — النضج | مستمر | — | استدامة |

> بعد بوابة المرحلة 1 يمكن استئناف تطوير الميزات بأمان بالتوازي مع
> المراحل 2–3.

## ما يحتاجه Ahmed شخصياً (الباقي كله من جلسات الكود)

1. إنشاء مشروع Firebase staging من الـ Console + env vars في Vercel.
2. تفعيل خطة Blaze (للـ scheduled exports + PITR) — تكلفة هامشية.
3. حساب Sentry (free tier).
4. اعتماد تجميد الميزات الكبيرة أثناء المرحلتين 0–1.

---

*أُعد بتاريخ 2026-06-10 بناءً على المراجعة الشاملة الرباعية للمشروع.*
