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
    version: "V18.71",
    date: "2026-04-30",
    types: ["fix"],
    title: "🐛 إصلاح ظهور الورش مكررة + تحذير من الإضافة المتكررة",
    changes: [
      { type: "fix", text: "🚨 Bug خطير في حسابات الورش: لما الورشة بتتسجل مرتين في القائمة (يدوي أو من restore قديم)، الكشف بيظهرها سطرين بنفس الاسم وكل صف بيـلم نفس المدفوعات والاستلامات — النتيجة المبلغ يبدو ضعف الفعلي. ده كان بيظهر في كل شاشة فيها ورش (تشغيل خارجي، قاعدة البيانات، التقارير، لوحة التحكم)." },
      { type: "feature", text: "🧹 زرار جديد '🧹 دمج الورش المكررة' في تاب 'قاعدة البيانات → الورش' — Banner أصفر بيظهر تلقائياً لما يكون فيه ورش بنفس الاسم (مع normalize للـwhitespace والـcase). الـbanner بيعرض الأسماء المتكررة وعدد النسخ الزائدة." },
      { type: "feature", text: "⚙️ Auto-merge ذكي: الدمج بياخد الورشة بأقدم id كأصل، وبيـ(1) ينقل كل wsPayments للـwsId الأقدم، (2) يحدّث treasury entries المرتبطة، (3) يحدّث notifications، (4) يستدعي renameInOrders لتحديث workshopDeliveries في كل الأوردرات (subcollections)." },
      { type: "feature", text: "🛡️ Backup تلقائي قبل الدمج: نسخة من قائمة الورش الحالية بتتحفظ في `_wsMergeBackup.pre_merge_{timestamp}` — لو حصلت مشكلة، الـadmin يقدر يرجعها يدوياً من Firebase Console. آخر 5 backups بتتحفظ بس عشان متضخمش الـconfig." },
      { type: "feature", text: "📝 AuditLog لكل عملية دمج: كل ورشة متدمجة بتتسجل entry في auditLog بـcategory='workshops' و action='merge'، مع id+name الـoldValue والـnewValue لتتبع كامل." },
      { type: "improvement", text: "⚠️ تحذير عند الإضافة: لما تضيف ورشة جديدة بنفس اسم ورشة موجودة (case-insensitive + trim)، Popup بيسألك إن كنت متأكد قبل ما يضيف. ده بيمنع المشكلة من تكرار حدوثها." },
      { type: "improvement", text: "💡 ملاحظة: حركات الخزنة اللي اتسجلت بـcategory='تشغيل خارجي' بدون اختيار الورشة من party-picker (يعني اسم الورشة مكتوب في desc بس) لسه مش بتظهر في كشف حساب الورشة — ده bug منفصل هيتحل في إصدار جاي." },
    ]
  },
  {
    version: "V18.70",
    date: "2026-04-30",
    types: ["feature", "architectural"],
    title: "🔒 Security Phase 1: Firestore Rules + Storage Rules + Admin Bootstrap",
    changes: [
      { type: "feature", text: "🛡️ إضافة `firestore.rules` كامل بصلاحيات على مستوى الدور (admin/manager/sales_accountant/purchase_accountant/payroll_accountant/payroll_verifier/viewer). كل collection محمية: factory, accountingDays, treasuryDays, auditDays, hrLogDays, hrWeeksDocs, seasons/orders, fixedAssets, backups, migrationLog. الـ default = deny." },
      { type: "feature", text: "🗄️ إضافة `storage.rules` — Firebase Storage بقت محمية بـauth check + حد أقصى 25MB لأي upload. مفيش public access — كل ملف يتطلب تسجيل دخول." },
      { type: "feature", text: "📦 إضافة `firebase.json` — config للـdeployment عبر firebase CLI: `firebase deploy --only firestore:rules,storage:rules`." },
      { type: "feature", text: "🔑 Bootstrap Admin Escape Hatch: `BOOTSTRAP_ADMIN_UID` env var جديد في Vercel + UID hardcoded في `firestore.rules`. لو القايمة قفلت على نفسها (مفيش admin شغال) — الحساب ده بيقدر يدخل بصلاحيات admin بغض النظر عن state الـconfig." },
      { type: "feature", text: "📘 إضافة `SECURITY.md` — دليل خطوة بخطوة لتطبيق إصلاحات الأمان: deploy الـrules، تقييد الـAPI key في Google Cloud Console (HTTP referrers + API restrictions)، إعداد Vercel env vars، اختبار الـrules في Playground." },
      { type: "improvement", text: "🔐 تحديث `api/_firebase.js → verifyAdminToken`: لو الـUID الـmatching مع `BOOTSTRAP_ADMIN_UID` env var، بيتمنح صلاحيات admin مباشرة بدون قراية الـconfig — حماية ضد config corruption." },
      { type: "architectural", text: "⚠️ التغيير ده حرج جداً: قبل V18.70 الـDB كانت **مفتوحة بالكامل** — أي حد عنده الـAPI key (متاح في الـclient) يقدر يقرا/يكتب أي حاجة. بعد الـdeploy، فقط المسجلين دخول بأدوار صحيحة يقدروا يعملوا writes. **لازم تتبع SECURITY.md حرفياً قبل الـdeploy** عشان متقفلش النظام على نفسك." },
    ]
  },
  {
    version: "V18.69",
    date: "2026-04-30",
    types: ["fix"],
    title: "🐛 إصلاح حذف حركات الخزنة المرتبطة بسلف موظفين",
    changes: [
      { type: "fix", text: "🚨 Bug خطير في حذف حركات الخزنة: لما المستخدم يضغط زر '✕' على حركة مرتبطة بسلفة موظف (أو شيك أو دفعة عميل/مورد/ورشة)، الـpopup كان بيظهر بزر 'حذف' لكن الحذف **مش بيحصل أبداً** (الـonConfirm كان فاضي)." },
      { type: "fix", text: "✅ الإصلاح: شيلت الـearly-return اللي كانت بتظهر الـpopup الفاضي. الـpopup الموجود في الـrow بالفعل بيحذر المستخدم بـ'⚠️ حركة مرتبطة بـ X — الحذف هنا لن يؤثر على المصدر' — كافي ومش محتاج popup ثاني فاضي." },
      { type: "fix", text: "🔁 Cascade delete صح للسلف: لما تحذف سلفة موظف من الخزنة، النظام بيحذف معاها الـhrLog entry المرتبط تلقائياً (الكود ده موجود من V17.1 لكن مكنش بيوصلله بسبب الـearly-return)." },
      { type: "improvement", text: "📊 Consistency بين الـsingle-delete والـbulk-delete: الـbulk-delete (checkbox + حذف) كان شغال صح من قبل، لكن الـsingle-delete (X) كان مكسور — دلوقتي الاتنين بيتعاملوا بنفس المنطق." },
      { type: "improvement", text: "🛡️ المرتبات (hr_salary) يفضل ممنوع حذفها من الخزنة (محمي بـearly-return منفصل) — لأن حذفها بيفسد الـprevBalance وحساب الأسبوع. لازم تتحذف من شاشة 'الموظفين → حذف الأسبوع'." },
      { type: "improvement", text: "↩️ الـUndo button يشتغل صح بعد الحذف — السنابشوت بياخد كل الـarrays المرتبطة (treasury + custPayments + supplierPayments + wsPayments + hrLog + treasuryTransfers)." },
    ]
  },
  {
    version: "V18.68",
    date: "2026-04-30",
    types: ["feature", "improvement"],
    title: "⬆️ ترقية ذكية لشجرة الحسابات",
    changes: [
      { type: "feature", text: "🆕 زرار جديد '⬆️ ترقية للحسابات الجديدة' في تاب شجرة الحسابات — بيظهر تلقائياً فقط لما يكون فيه حسابات افتراضية ناقصة (يخفي نفسه لو الشجرة كاملة). الزرار بيعرض عدد الحسابات المتاحة للإضافة في badge جنبه (مثلاً: +8)." },
      { type: "feature", text: "📋 Confirmation dialog مفصّل قبل الترقية: يعرض كل الحسابات اللي هتتضاف بالكود والاسم (أول 12 حساب + عداد للباقي)، علشان تكون عارف بالظبط ايه اللي هيحصل قبل ما تأكد." },
      { type: "feature", text: "🛡️ Backup تلقائي قبل الترقية: قبل أي إضافة، النظام بيحفظ نسخة كاملة من الشجرة الحالية في `coa_backup_pre_upgrade_{timestamp}` — لو حصلت أي مشكلة، نقدر نرجعها بسهولة." },
      { type: "feature", text: "✨ تمييز بصري للحسابات الجديدة: بعد الترقية، الحسابات اللي اتضافت بتظهر بـbadge أصفر '✨ جديد' وbackground مميز لمدة 30 ثانية — علشان تعرف فوراً وين الحسابات الجديدة في الشجرة." },
      { type: "improvement", text: "🔒 آمان كامل: الترقية مش بتمس أي حساب موجود (لا الـid، ولا الكود، ولا الاسم، ولا الـsystem flag، ولا parents). بتضيف بس الناقص. مفيش أي خطر على البيانات أو الإعدادات اللي عملتها." },
      { type: "improvement", text: "💡 Detection ذكي: لو حاولت تضغط الزرار وكل الحسابات الافتراضية موجودة فعلاً، رسالة لطيفة: 'شجرتك محدّثة' — مفيش تنفيذ غير ضروري." },
    ]
  },
  {
    version: "V18.67",
    date: "2026-04-30",
    types: ["feature"],
    title: "🏭 الأصول الثابتة + الإهلاك التلقائي",
    changes: [
      { type: "feature", text: "🏭 صفحة جديدة 'الأصول الثابتة' في القائمة الرئيسية — إدارة كاملة لكل الأصول الثابتة في المصنع (ماكينات، أثاث، عربيات، كمبيوترات، تحسينات على المأجور). 3 تابات: سجل الأصول، الإهلاك الشهري، التقارير." },
      { type: "feature", text: "📦 Collection جديد منفصل `fixedAssets/{assetId}` — كل أصل في document مستقل، يدعم سنوات إهلاك بدون تضخم config. بيانات الأصل: الاسم، الفئة، تاريخ الاقتناء، التكلفة، قيمة الخردة، العمر الإنتاجي، الحسابات المرتبطة." },
      { type: "feature", text: "⚡ إهلاك شهري بطريقة القسط الثابت: (التكلفة − الخردة) ÷ العمر بالشهور = إهلاك شهري. زرار 'تشغيل إهلاك الشهر' يعرض معاينة لكل الأصول قبل الترحيل، ثم بإنشاء قيد لكل أصل (Dr مصروف الإهلاك / Cr مجمع الإهلاك)." },
      { type: "feature", text: "🔁 Catch-up تلقائي: لو نسيت تشغيل الإهلاك شهرين أو ثلاثة، التشغيل التالي بيلحقهم تلقائياً. كل قيد له sourceId فريد (assetId_YYYY-MM) — مينفعش يتسجل مرتين." },
      { type: "feature", text: "🗑️ تصرف في الأصل (Disposal): modal يحسب القيمة الدفترية + متحصلات البيع، ويحدد تلقائياً ربح/خسارة/تخلص. القيد الكامل: Dr خزنة + Dr مجمع الإهلاك + Dr/Cr ربح أو خسارة / Cr الأصل بالتكلفة الأصلية. الأصل بيتعلّم 'تم التصرف فيه' وميتمش إهلاكه بعد كده." },
      { type: "feature", text: "📅 نمطين لبداية الإهلاك: (1) 'يبدأ من الشهر التالي' — الافتراضي والأكثر شيوعاً في مصر، (2) 'يبدأ من نفس الشهر' للأصول اللي بدأ تشغيلها فعلاً من يوم الاقتناء." },
      { type: "feature", text: "📊 7 حسابات جديدة في شجرة الحسابات الافتراضية: 1430 كمبيوترات، 1440 وسائل نقل، 1450 تحسينات على المأجور، 1490 (−) مجمع الإهلاك، 4920 ربح بيع أصول ثابتة، 5400 الإهلاكات (parent)، 5410 مصروف الإهلاك، 5420 خسارة بيع/تخلص من أصول ثابتة." },
      { type: "feature", text: "🔒 تكامل مع Period Lock: محاولة ترحيل إهلاك أو تصرف في فترة مُقفلة (من V18.66) ترفض تلقائياً مع رسالة واضحة." },
      { type: "improvement", text: "📋 سجل الأصول: جدول كامل بفلاتر (الحالة/الفئة/البحث) + 4 بطاقات إحصاء (إجمالي، التكلفة، الإهلاك، القيمة الدفترية). كل أصل بـ badge ملون لحالته (نشط/مُهلك بالكامل/تم التصرف). إجراءات سريعة: تعديل، تصرف، حذف (لو لم يُهلك بعد)." },
    ]
  },
  {
    version: "V18.66",
    date: "2026-04-30",
    types: ["feature"],
    title: "🔒 معالج إقفال السنة المالية (Year-End Closing Wizard)",
    changes: [
      { type: "feature", text: "🧙‍♂️ Wizard من 5 خطوات يستبدل الـmodal القديم: (1) اختيار الفترة (2) فحوصات قبل الإقفال (3) معاينة قائمة الدخل (4) تأكيد نهائي (5) تقرير + تحقق من الترحيل. كل خطوة فيها navigation وvalidation منفصل." },
      { type: "feature", text: "🛡️ 8 فحوصات قبل الإقفال (Preflight Checks): 3 Blockers (لازم تتحل) — ميزان مراجعة متوازن، لا أخطاء ترحيل غير محلولة، حساب الأرباح المحتجزة جاهز. و5 تحذيرات (تنبيهية) — فواتير Draft، إشعارات Draft، فواتير مشتريات Draft، نسخة احتياطية حديثة (>7 أيام)، أيام مستقبلية في الفترة." },
      { type: "feature", text: "📅 إعدادات السنة المالية الجديدة: كارد جديد في الإعدادات لتحديد بداية السنة (شهر + يوم) — يدعم السنة الميلادية (1 يناير، الافتراضي) والسنة المالية المخصصة (مثلاً 1 يوليو). الـwizard يقترح فترات الإقفال تلقائياً (السنة السابقة، الحالية)." },
      { type: "feature", text: "✅ Rollover Verification بعد الإقفال: التحقق التلقائي إن (1) كل حسابات الإيرادات والمصروفات أصبحت بأرصدة صفرية في الفترة المُقفلة، (2) قيد الإقفال موجود في يوم النهاية، (3) حركة الأرباح المحتجزة = صافي الربح المتوقع تماماً. أي فرق يظهر تحذير." },
      { type: "feature", text: "🎨 UI محسن: Stepper بصري يوضح التقدم، Hero card لصافي الربح/الخسارة، badges ملونة لكل severity في الفحوصات (block/warn/ok)، fix hints لكل blocker وwarning، اقتراحات سريعة لفترات الإقفال." },
      { type: "improvement", text: "🛠️ Step 4 (التأكيد) فيه ملخص شامل قبل التنفيذ: تواريخ + RE account + إيرادات + مصروفات + صافي الربح + قائمة بكل ما سيحدث. Step 5 (التقرير) فيه نتائج التنفيذ + خطوات تالية." },
      { type: "improvement", text: "🔁 Period Auto-Lock: بعد الإقفال، periodLock بياخد الفترة من closedPeriods أوتوماتيك (موجود من V18.54) — أي قيد جديد بتاريخ في الفترة المُقفلة بيُرفض. عكس الإقفال يفتح الفترة تاني." },
      { type: "fix", text: "🐛 إصلاح بسيط: الإصدار القديم كان بيتيح للمستخدم يضغط 'إقفال' ميزان غير متوازن — الـwizard دلوقتي بيمنع ده كـ Blocker." },
    ]
  },
  {
    version: "V18.65",
    date: "2026-04-29",
    types: ["fix", "improvement"],
    title: "📑 تجميع تلقائي: فاتورة وإشعار دائن واحد لكل عميل في اليوم",
    changes: [
      { type: "fix", text: "🚨 Bug خطير في الإشعارات الدائنة: السعر كان بيُحسب من order.sellPrice بدل ما ياخد سعر البيع الفعلي من الفاتورة. لو عملت بيع طوارئ بسعر مخصص (مثلاً 50ج بدل 100ج)، الإشعار الدائن للمرتجع كان بيطلع بـ100ج وفرق الـ50ج كان بيظهر كأنه ربح وهمي في الحسابات. الإصلاح: السعر دلوقتي بياخد من نفس فاتورة اليوم لنفس الـ orderId — مطابقة كاملة للسعر بين الفاتورة والإشعار." },
      { type: "improvement", text: "📦 تجميع البيع السريع: كل بيع سريع لنفس العميل في نفس اليوم بيتجمع في فاتورة Draft واحدة. لو نفس الموديل بنفس السعر → بتزيد الكمية في نفس البند. لو موديل مختلف أو سعر مختلف (بيع طوارئ) → بند منفصل في نفس الفاتورة. الترقيم بيُحجز مرة واحدة فقط." },
      { type: "improvement", text: "↩️ تجميع المرتجع السريع: نفس المنطق للإشعارات الدائنة. كل المرتجعات لنفس العميل في نفس اليوم بتتجمع في إشعار دائن Draft واحد. ده يحل مشكلة الـ16 إشعار اللي اتسجلت لمرتجع واحد." },
      { type: "improvement", text: "🔗 Audit trail محفوظ: deliveryRefs[] و returnRefs[] بقت arrays بدل reference واحد، بحيث كل توصيلة/مرتجع تتجمع تحتفظ بمرجعها الأصلي للتدقيق. الـ findInvoiceByDelivery و findCreditNoteByReturn اتحدثوا للبحث في الـarrays مع الحفاظ على backward compat للسجلات القديمة." },
      { type: "improvement", text: "♻️ Recompute آمن: مع كل عملية تجميع، الـ subtotal و discount و total يعاد حسابهم من البنود (مفيش تراكم أخطاء عشرية). الخصم بياخد customer.discount الحالي." },
      { type: "fix", text: "⚠️ autoPostOnCreate آمن مع التجميع: لما الإعداد ده مفعّل، الترحيل التلقائي للقيد بيشتغل فقط على الفواتير الجديدة (مش المدموجة). الفواتير اللي اتدمج فيها توصيل جديد بتفضل Draft للمراجعة اليدوية." },
    ]
  },
  {
    version: "V18.64",
    date: "2026-04-29",
    types: ["fix"],
    title: "🔧 إصلاح: دفعات العملاء النقدية مش ظاهرة في كشف الحساب",
    changes: [
      { type: "fix", text: "🚨 Bug إصلاح: دفعات نقدية مسجلة في الخزنة بـ custId مش بتظهر في بطاقة 'إجمالي المدفوع' في كشف حساب العميل. السبب: desync تاريخي بين config.treasury و config.custPayments — حركات بدون treasuryTxId reference." },
      { type: "fix", text: "🔄 الحل في الـ display: Card 4 (إجمالي المدفوع) و Card 5 (الرصيد) دلوقتي بيحسبوا الدفعات الـ orphan في الخزنة تلقائياً — حتى لو مش موجودة في custPayments. الأرقام بتظهر صح فوراً بدون أي تعديل على البيانات." },
      { type: "feature", text: "⚠️ Banner تحذيري في كشف الحساب: لو في دفعات orphan في الخزنة لعميل، بيظهر banner أصفر بيقول 'X دفعة مش متزامنة' + المبلغ + زرار '🔧 مزامنة' (للـ admin) بيضيفها في custPayments بشكل دائم." },
      { type: "feature", text: "🔍 PaymentsTab في المحاسبة: دلوقتي بيلاقي الـ orphan treasury entries (عملاء + موردين) ويعرضهم بـ badge أصفر 'غير مزامنة' — مع شريط جانبي ملون يميزهم في الجدول." },
      { type: "improvement", text: "🛡️ زرار المزامنة آمن: بياخد العنصر من الخزنة (مش بيلمسها)، يضيف entry جديد في custPayments بـ treasuryTxId reference، ويحط marker reconciledFromTreasury+reconciledAt للـ audit trail." },
      { type: "improvement", text: "🔐 Race-safe: الـ reconcile function بيتأكد جوة upConfig callback إن الـ entry مش متضافة بالفعل (لو جهاز تاني سبقنا) قبل ما يضيفها." },
    ]
  },
  {
    version: "V18.63",
    date: "2026-04-29",
    types: ["feature", "improvement"],
    title: "🧾 تحديثات شاشة المبيعات + تاب دفعات في المحاسبة",
    changes: [
      { type: "improvement", text: "✏️ شاشة المبيعات: إعادة تسمية 'بيان سعر' → 'عرض سعر' (مصطلح أوضح وأقرب للاستخدام الفعلي)" },
      { type: "improvement", text: "📋 بوب اب التوزيعات (لزرار 'عرض سعر'): يعرض آخر 10 توزيعات فقط بشكل افتراضي + زرار 'عرض المزيد' في الأسفل لو في توزيعات أكتر" },
      { type: "feature", text: "🚚 زرار جديد 'إذن تسليم' في شاشة المبيعات بجانب 'عرض سعر' — نفس الـ flow (اختر توزيعة → اختر عميل → طباعة) لكن بيطبع الكميات فقط بدون أي أسعار. مفيد لما تحتاج تطبع إذن تسليم سريع للسائق بدون كشف الأسعار" },
      { type: "improvement", text: "🔍 بوب اب اختيار العميل في 'إذن تسليم' فيه فلتر بحث بالاسم/التليفون — يساعد لو التوزيعة فيها عملاء كتير" },
      { type: "feature", text: "📊 كشف حساب العميل: تابات جديدة تحت البطاقات — 'ملخص' و'سجل حركات'" },
      { type: "feature", text: "📈 تاب 'ملخص': يعرض الموديلات والكميات المباعة والمرتجع + الرصيد الحالي المستحق للمصنع/العميل، مع فلتر بحث بالموديل" },
      { type: "feature", text: "📋 تاب 'سجل حركات': جدولين منفصلين — جدول المبيعات (بالتاريخ + الكمية + القيمة قبل الخصم + بعد الخصم) وتحته جدول المرتجعات بنفس النظام" },
      { type: "improvement", text: "🗑️ تم نقل 'سجل الدفعات' من بوب كشف الحساب إلى تاب 'دفعات' الجديد في المحاسبة (لإن الدفعات بطبيعتها معلومة محاسبية مش معلومة بيع)" },
      { type: "improvement", text: "🏷️ المحاسبة: إعادة تسمية 'كشف حساب طرف' → 'كشف حساب جاري' (المصطلح الأصح محاسبياً)" },
      { type: "feature", text: "💰 تاب 'دفعات' جديد في المحاسبة — سجل موحّد لكل الدفعات في النظام: نقدي + شيكات، عملاء + موردين، مع 4 بطاقات إحصاء (وارد، صادر، صافي، شيكات معلقة)" },
      { type: "feature", text: "🔎 فلاتر تاب الدفعات: الاتجاه (وارد/صادر) + القناة (نقدي/شيك) + الحالة (محصل/معلق) + نطاق تاريخ + بحث نصي بالطرف/البنك/رقم الشيك/الملاحظات" },
      { type: "improvement", text: "🎨 جدول الدفعات الموحد: badges ملونة لكل اتجاه/قناة/حالة، عرض رقم الشيك والبنك، ملاحظات، اسم المستخدم اللي سجّل" },
      { type: "fix", text: "🚨 إصلاح Hotfix: TDZ error في شاشة المبيعات كان بيمنع فتحها — useEffect حق reset التابات كان قبل declaration الـ custStatement state. اتنقل لمكانه الصحيح بعد التعريف." },
    ]
  },
  {
    version: "V18.62",
    date: "2026-04-29",
    types: ["fix", "feature", "architectural"],
    title: "💾 Comprehensive Backup — نسخ احتياطية شاملة لكل البيانات",
    changes: [
      { type: "fix", text: "🚨 إصلاح bug خطير في النسخ الاحتياطية: من V16.74 (تقسيم الـ collections)، الـ backups كانت مش بتشمل treasury, audit log, hr log, hr weeks, ولا الأوردرات من غير الموسم الحالي. يعني كل النسخ اللي اتاخدت من حوالي سنة كانت ناقصة بشكل خطير. دلوقتي اتصلح." },
      { type: "feature", text: "🆕 utils/comprehensiveBackup.js: نسخ شاملة بتحفظ كل البيانات من كل المصادر — factory/config + sales + tasks + treasuryDays + auditDays + hrLogDays + hrWeeksDocs + الأوردرات لكل المواسم. مفيش بيانات بتضيع." },
      { type: "feature", text: "📦 الـ backup الجديد بيتخزن في multi-part format: backups/{id}/parts/* — كل part في document منفصل عشان يتعدى Firestore 1MB limit. الـ chunked أوتوماتيك للبيانات الكبيرة." },
      { type: "feature", text: "📊 معاينة الحجم: زرار جديد '📊 معاينة الحجم' يعرضلك حجم النسخة المتوقعة وتفصيل لكل قسم قبل ما تعملها" },
      { type: "feature", text: "📈 progress feedback: لما تعمل backup أو restore، شريط حالة بيقولك إيه اللي بيحصل (قراءة كذا، كتابة كذا)" },
      { type: "fix", text: "🔄 Restore الكامل بقى يستعيد فعلاً كل حاجة: factory docs + treasuryDays + auditDays + hrLogDays + hrWeeksDocs + أوردرات كل المواسم. مش 3 docs بس زي الأول." },
      { type: "fix", text: "🤖 الـ daily auto-backup بقى شامل برضه — حجمه أكبر (5-50 MB حسب البيانات) لكن أصبح فعلاً بيحميك" },
      { type: "fix", text: "🛑 clearAllOrders: بقى يعمل comprehensive backup أوتوماتيك قبل المسح، يسجل في restoreLog، ويعرض الأخطاء بدل ما يبتلعها في صمت" },
      { type: "fix", text: "🛡️ upSales و upTasks بقوا فيهم نفس safety guards زي upConfig (configLoaded + configError checks) — يرفضوا الكتابة قبل ما البيانات تحمّل" },
      { type: "improvement", text: "🏷️ في صفحة الـ backups: badges واضحة لكل نسخة — 'شاملة ✓' للنسخ الجديدة، 'قديمة (ناقصة)' للنسخ ما قبل V18.62، 'تلقائية'، 'قبل migration'، 'قبل استعادة'" },
      { type: "improvement", text: "🗑️ deleteComprehensiveBackup: لما تحذف نسخة شاملة، بيتم حذف الـ metadata وكل الـ parts المرتبطة بيها أوتوماتيك" },
      { type: "improvement", text: "📅 Multi-device coordination: الـ daily auto-backup بيشيك لو في نسخة شاملة اتعملت اليوم من جهاز تاني — ما يكررش" },
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
