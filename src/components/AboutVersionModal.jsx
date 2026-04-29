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
  {
    version: "V18.61",
    date: "2026-04-29",
    types: ["fix", "architectural"],
    title: "🛡️ حماية حرجة من فقد البيانات + تثبيت صلاحيات الأدمن",
    changes: [
      { type: "fix", text: "🔒 صلاحيات الـ admin اتثبتت في الكود — مفيش طريقة تشيلها أو تعدّلها من داخل التطبيق. ده يمنع سيناريو 'الأدمن فقد دخوله للنظام' اللي حصل قبل كده. الـ getTabPerm() بيتجاهل أي custom permissions في factory/config.permissions.admin ويستعمل الـ defaults الكاملة دايماً." },
      { type: "fix", text: "✏️ الـ admin بقى عنده edit على كل التابز بدون استثناء (بما فيها audit اللي كان view)" },
      { type: "improvement", text: "📋 صفحة Permissions: عمود الـ admin بقى مقفول visually — كل الخلايا بتعرض '✏️ دائماً' بدل الـ select. رسالة توضيحية في أعلى الجدول بتشرح ليه." },
      { type: "improvement", text: "🛡️ حماية مضاعفة: حتى لو حد لعب في الـ DOM أو DevTools لتعديل admin permissions، الـ setter بيرفض. وحتى لو الـ database اتلوّث بقيم قديمة لـ permissions.admin، الـ savePerms() بيمسحها أوتوماتيك قبل الحفظ." },
      { type: "fix", text: "🚨 إصلاح bug خطير: الـ app كان لو ملقاش factory/config بيكتب القيم الافتراضية تلقائياً (INIT_CONFIG) فوقها — ده كان السبب المرجّح لمسح اليوزرز والإعدادات. دلوقتي بيرفض ويعرض رسالة خطأ صريحة بدل ما يدمّر البيانات." },
      { type: "fix", text: "🛑 منع كتابة البيانات قبل ما الـ config يحمّل من السيرفر — كان فيه race condition بيخلي الـ writes تحصل على INIT_CONFIG كقاعدة وتمسح البيانات الحقيقية" },
      { type: "fix", text: "📡 إضافة error handlers لكل الـ Firestore listeners (config, sales, tasks, orders) — قبل كده كانت الأخطاء تتجاهل في صمت" },
      { type: "feature", text: "🔒 صفحة خطأ مخصصة لو الـ config مش موجود — بتعرض تفاصيل الخطأ والوقت والمستخدم، وبتمنع أي عملية كتابة لحد ما المشكلة تتحل" },
      { type: "feature", text: "🛡️ Sanity check قبل كل write: لو العملية هتمسح كل اليوزرز / العملاء / الورش / الموظفين دفعة واحدة — التطبيق يرفض ويبلّغ بدل ما يكتب" },
      { type: "improvement", text: "🔄 زرار الاستعادة بقى أأمن بكتير: typed confirmation (لازم تكتب 'استعادة') + auto-backup أوتوماتيك للحالة الحالية قبل الاستعادة + restoreLog audit doc + تحذير صريح بإيه اللي مش هيرجع" },
      { type: "feature", text: "🆕 الاستعادة الانتقائية (Selective Restore): أداة جديدة في الإعدادات بترجّع البيانات المحذوفة (عملاء، ورش، مستخدمين، إلخ) من نسخة قديمة بدون ما تلمس البيانات الحالية. بتقارن النسخة بالحالي وبتعرض إيه الناقص، وتقدر تختار حقول معينة فقط للاسترجاع. كل عنصر يترجع بيتعلّم بـrestoredAt + restoredFrom" },
      { type: "improvement", text: "📦 الـ backups بقت تحفظ counts أكتر (workshops, users, usersList) عشان تكون فيه شفافية أكبر وقت الاستعادة" },
      { type: "maintenance", text: "📂 utils/dataIntegrity.js: إضافة validateBeforeWrite() و isSafeWrite() — كاشف الكتابات الخطيرة" },
    ]
  },
  {
    version: "V18.59",
    date: "2026-04-29",
    types: ["improvement"],
    title: "Custom Popups في باقي التطبيق (إعدادات، خزنة، تسليم، مخزن، مشتريات)",
    changes: [
      { type: "improvement", text: "🎨 9 ملفات إضافية محوّلة من نوافذ المتصفح (alert/confirm) إلى custom popups بـArabic + RTL + Cairo font" },
      { type: "improvement", text: "⚙️ صفحة الإعدادات: 15 nation alert/confirm محوّل — كل تأكيدات إلغاء التعديلات + حذف اللوجو + حذف الجهات + حذف الرسائل" },
      { type: "improvement", text: "💰 صفحة الخزنة: 7 dialogs محوّلة — حذف الجدولة المتكررة + تنفيذ المستحقات + التحقق من بيانات الجدولة + أخطاء الطباعة" },
      { type: "improvement", text: "🚚 صفحة تسليم العملاء: 7 dialogs محوّلة — تحذير الـOCR للأرقام منخفضة الثقة + 5 أخطاء طباعة" },
      { type: "improvement", text: "🏠 App.jsx (الواجهة الرئيسية): 5 dialogs محوّلة — تحذيرات تسليم الورشة + فشل الحفظ + أخطاء الطباعة" },
      { type: "improvement", text: "📦 صفحات المخزن والمشتريات: 6 أخطاء طباعة محوّلة لـpopups موحدة" },
      { type: "improvement", text: "📱 الواجهة المحمولة (MobileWarehouseShell): تأكيد الخروج بدون حفظ بقى popup أنيق بدلاً من window.confirm" },
      { type: "improvement", text: "🔗 صفحات تأكيد التسليم العامة (ConfirmPage + WorkshopConfirmPage): أخطاء الإرسال بقت popups موحدة" },
      { type: "improvement", text: "✅ النتيجة: تجربة موحّدة في كل التطبيق — مفيش نوافذ متصفح قبيحة في أي مكان (بقي فقط ~10 alerts في utils/print لأخطاء نادرة)" },
    ]
  },
  {
    version: "V18.58",
    date: "2026-04-29",
    types: ["feature"],
    title: "الخصم الحر في الفواتير + إذن تسليم بدون أسعار",
    changes: [
      { type: "feature", text: "💰 خصم حر داخل فواتير المبيعات والمشتريات — قابل للتعديل في حالة المسودة فقط، يـoverride خصم العميل التلقائي" },
      { type: "feature", text: "🔢 خياران للخصم: نسبة (%) أو مبلغ ثابت (ج.م) — يحسب الخصم النهائي تلقائياً ويحدّث الإجمالي مباشرة" },
      { type: "feature", text: "💾 الحفظ تلقائي بعد 300ms من التعديل (debounce) — لا يحتاج زر حفظ منفصل، الخصم محفوظ مع الفاتورة" },
      { type: "feature", text: "🛡️ القيد الذكي: الخصم لا يتجاوز إجمالي الفاتورة (clamping) — يمنع الأخطاء المحاسبية" },
      { type: "feature", text: "📦 إذن تسليم بدون أسعار للمخزن والسائق — Toggle جديد في popup الطباعة المجمعة (☑ إذن تسليم بدون أسعار)" },
      { type: "feature", text: "🚚 الـnoPrices mode بيخفي: عمود السعر، عمود الإجمالي، صف صافي العميل، الـtotals الكلية المالية — يبقى الموديل + الكمية + التوقيع فقط" },
      { type: "feature", text: "📑 العنوان يتغير تلقائياً: 'إذن تسليم مخزن' بدلاً من 'إذن تسليم' لو الـnoPrices مفعّل — للتمييز الواضح" },
      { type: "improvement", text: "🖨️ الطباعة (printInvoice.js) محدّثة لدعم الخصم الجديد: تعرض النسبة لو discountType=pct أو لا تعرضها لو amount" },
      { type: "improvement", text: "🔒 الفاتورة المُرحّلة (posted) تعرض الخصم read-only — مفيش تعديل بعد الترحيل لحماية القيد المحاسبي" },
    ]
  },
  {
    version: "V18.57",
    date: "2026-04-29",
    types: ["improvement"],
    title: "Custom Popups في صفحة المحاسبة (استبدال نوافذ المتصفح القبيحة)",
    changes: [
      { type: "improvement", text: "🎨 كل نوافذ confirm/alert في صفحة المحاسبة بقت popups احترافية بـCairo font + RTL + ألوان CLARK المتناسقة بدلاً من نوافذ المتصفح القبيحة" },
      { type: "improvement", text: "📔 JournalTab: نافذة 'إلغاء القيد' ونوافذ الأخطاء (الصورة في تذكرة الإصلاح) بقوا custom popups" },
      { type: "improvement", text: "✏️ JournalEntryModal: نوافذ التحقق من القيد (التاريخ، التوازن، فترة مقفلة) بقوا أنظف وأوضح" },
      { type: "improvement", text: "💱 CurrenciesCard + FxRatesCard: حذف العملات وأسعار الصرف بقوا بـpopup أنيق مع زر 'حذف' بلون أحمر مميز" },
      { type: "improvement", text: "⚠️ FailuresCard: 'إعادة المحاولة الجماعية'، 'تجاهل الخطأ'، 'تنظيف السجل' كلهم popups واضحة" },
      { type: "improvement", text: "⚙️ AccountingSettingsTab: 'استعادة الافتراضي'، 'ترحيل القيود الأثرية'، التحقق من الشجرة كلهم popups" },
      { type: "improvement", text: "🏦 OpeningBalancesModal + ClosedPeriodsCard + TreasuryAccountsMapCard: كل النوافذ موحدة الآن" },
      { type: "improvement", text: "🚦 Pattern معتمد للمشروع: ask() للتأكيدات + tell() للأخطاء + showToast() للنجاح — قابل للتعميم على باقي الصفحات في الإصدارات الجاية" },
    ]
  },
  {
    version: "V18.56",
    date: "2026-04-29",
    types: ["feature"],
    title: "الحركات المتكررة (Recurring Treasury)",
    changes: [
      { type: "feature", text: "🔁 تبويب جديد '🔁 المتكررة' في صفحة الخزنة — لجدولة الحركات الدورية: إيجار، مرتبات ثابتة، اشتراكات، صيانة دورية" },
      { type: "feature", text: "📅 3 أنماط تكرار: يومياً / أسبوعياً (يوم محدد) / شهرياً (يوم محدد 1-28) — يغطي أكثر السيناريوهات الشائعة" },
      { type: "feature", text: "⏰ كشف ذكي للمستحقات: النظام بيحسب تلقائياً كل الحركات اللي كان لازم تتعمل من آخر تنفيذ لحد اليوم — banner أصفر بيعرض العدد + تفاصيل كل واحدة" },
      { type: "feature", text: "▶ زر 'تنفيذ المستحقات الآن' — بضغطة واحدة بيُنشئ كل الحركات المعلقة (مثلاً: 3 شهور إيجار لو نسيت تنفّذها) + يفتح القيد المحاسبي تلقائياً عبر autoPost.treasury" },
      { type: "feature", text: "📋 جدول إدارة الجدولة: الاسم/النوع/المبلغ/التكرار/التالي/آخر تنفيذ/الحالة + أزرار تفعيل/إيقاف/تعديل/حذف" },
      { type: "feature", text: "✏️ Modal إنشاء/تعديل: الاسم + النوع (وارد/منصرف) + المبلغ + الفئة (SearchSel) + الحساب + البيان + نمط التكرار + تواريخ البدء/الانتهاء" },
      { type: "feature", text: "🛑 Range محدود اختيارياً: تقدر تحط 'تاريخ انتهاء' للجدولة (مثلاً عقد إيجار سنة كاملة) أو تتركه مفتوح" },
      { type: "feature", text: "⏸ تعطيل بدون حذف: زر إيقاف يخلي الجدولة موجودة بس مش تنفّذ — مفيد للجدولة المؤقتة (إجازة موظف، انقطاع خدمة)" },
      { type: "improvement", text: "🤖 الحركة المُنشأة من الجدولة بتاخد كل الـmetadata: recurringRuleId + recurringRuleName للـaudit trail" },
      { type: "improvement", text: "💡 لما تضغط 'تنفيذ المستحقات'، النظام يحدّث lastGeneratedDate لأحدث تاريخ — بحيث المرة الجاية يبدأ من اليوم اللي بعده" },
    ]
  },
  {
    version: "V18.55",
    date: "2026-04-29",
    types: ["feature", "fix"],
    title: "تقارير الأرباح: موديل + عميل + أوردر",
    changes: [
      { type: "feature", text: "👥 تقرير جديد 'أرباح العملاء' — تجميع كل عميل مع إيراد/تكلفة/ربح/هامش% + ترتيب بالربح + 🥇🥈🥉 لأعلى 3" },
      { type: "feature", text: "📊 تقرير جديد 'أرباح الأوردر' — كل أوردر بـsold qty + sell price + cost/piece + revenue/cost/profit + هامش %" },
      { type: "feature", text: "⚠️ تنبيه فوري في 'أرباح الأوردر' لو في أوردر سعر بيعه أقل من تكلفته (loss-making) — صف بخلفية حمراء + footer بعدد الأوردرات الخاسرة" },
      { type: "feature", text: "🎯 ترتيب ذكي في 'أرباح الأوردر': الأكثر ربحاً / أعلى هامش % / الأكثر خسارة — للتحليل من زوايا مختلفة" },
      { type: "feature", text: "📅 فلتر تاريخ + بحث في كل التقارير الجديدة — تشوف الأرباح في فترة محددة (الشهر، الموسم، إلخ)" },
      { type: "feature", text: "💎 'أرباح الموديل' محدّث: إضافة breakdown للتكلفة (قماش/إكسسوار/ورشة) + filter بالتاريخ + إصلاح bug في الحساب" },
      { type: "fix", text: "🐛 إصلاح bug في تقرير 'أرباح الموديل': كان بيستخدم `c.totalCost` المش موجود في calcOrder — دلوقتي بيستخدم `c.costPer` الصحيح" },
      { type: "improvement", text: "📌 الـIcon 📌 جنب التكلفة بيدل إن ده تكلفة يدوية (manual costPrice) بدلاً من المحسوبة من الأوردر" },
      { type: "improvement", text: "🔄 الـtotals row في كل تقرير: إجمالي إيراد + إجمالي تكلفة + إجمالي ربح + هامش متوسط — للنظرة السريعة" },
    ]
  },
  {
    version: "V18.54",
    date: "2026-04-29",
    types: ["feature"],
    title: "تقادم الديون (Aging) + إنفاذ إقفال الفترة",
    changes: [
      { type: "feature", text: "⏳ تبويب جديد 'تقادم الديون' في صفحة المحاسبة — يعرض ذمم العملاء (مدينة) أو الموردين والورش (دائنة) في 5 فترات: جاري / 0-30 / 31-60 / 61-90 / 90+ يوم" },
      { type: "feature", text: "📊 6 stats cards في الأعلى: قيمة كل bucket + الإجمالي، بألوان متدرجة (أحمر للـ90+ كمؤشر تعثر)" },
      { type: "feature", text: "🎯 جدول مفصل لكل طرف: خانة لكل bucket + الإجمالي + ترتيب تنازلي بالقيمة الأكبر — تشوف فوراً مين أكتر مدينين ومتعثرين" },
      { type: "feature", text: "🖨️ طباعة احترافية للتقرير: header + جدول كامل + إجمالي footer — مناسب للإرسال للمدير أو التحصيل" },
      { type: "feature", text: "📅 'كما في تاريخ' قابل للتغيير — تشوف الـaging في أي تاريخ سابق (مفيد للمراجعة الدورية)" },
      { type: "feature", text: "🧮 الـFIFO matching: الدفعات بتطفي على أقدم القيود أولاً — كده الـbuckets تعكس عمر الدين الفعلي مش متوسط" },
      { type: "feature", text: "🔒 إنفاذ إقفال الفترة: لما تـ'تقفل' فترة محاسبية، أي قيد جديد بتاريخ في الفترة ده يتم رفضه تلقائياً (manual + auto-post)" },
      { type: "feature", text: "⛔ التحذير في Journal Entry Modal: لو اخترت تاريخ مقفل، رسالة حمراء فورية تحت date picker تشرح السبب" },
      { type: "feature", text: "📝 الـauto-post المحجوز بسبب period lock بيُسجل في 'لوحة أخطاء الترحيل' (V18.38) عشان تـclear الإقفال وتـretry بعدين" },
      { type: "improvement", text: "🛡️ Helper موحّد periodLock.js: isDateLocked + getLockReason + canBypassLock — جاهز للـintegration في أي entry point جديد" },
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
