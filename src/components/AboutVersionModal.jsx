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
  {
    version: "V18.53",
    date: "2026-04-29",
    types: ["feature"],
    title: "تثبيت التاريخ — لإدخال الحركات القديمة بدون تعب",
    changes: [
      { type: "feature", text: "📌 زر '📌 تثبيت' جنب التاريخ في حركة جديدة — لما التاريخ مش اليوم، يظهر الزر تلقائياً" },
      { type: "feature", text: "📅 لما التاريخ مثبّت، كل حركة جديدة بتفتح بنفس التاريخ تلقائياً — مفيد لإدخال 30 حركة قديمة بتاريخ 2026-03-15 مثلاً" },
      { type: "feature", text: "🟣 Banner داخل الفورم بلون بنفسجي بيوضّح إن التاريخ مثبّت + زر 'إلغاء' في أي وقت" },
      { type: "feature", text: "💡 المؤشر '📅 مثبّت ✕' بيظهر جنب الـlabel — اضغط في أي وقت عشان تلغي التثبيت" },
      { type: "improvement", text: "🤝 يعمل بالتوازي مع وضع التكرار (Sticky Mode للـcategory): تقدر تثبّت التاريخ + الـcategory في نفس الوقت لإدخال دفعات تاريخية متشابهة" },
      { type: "improvement", text: "🧠 الـlogic ذكي: التثبيت بيظهر بس لما التاريخ مش اليوم (لأن لو اليوم، مفيش فايدة من التثبيت)" },
      { type: "improvement", text: "✏️ التعديل (editTx) لا يتأثر بالتثبيت — التاريخ بيتم تحميله من السجل المُعدَّل" },
    ]
  },
  {
    version: "V18.52",
    date: "2026-04-29",
    types: ["feature", "improvement"],
    title: "تحسين UX حركات الخزنة: بحث بالكتابة + وضع التكرار للحركات المتشابهة",
    changes: [
      { type: "feature", text: "🔍 'نوع الحركة' في حركة جديدة بقت SearchSel — اكتب 'مر' عشان توصل لمرتبات بدلاً من تنزيل الـdropdown 20 فئة وتدور" },
      { type: "feature", text: "⌨️ Keyboard navigation في الـSearchSel: ↓↑ للتنقل بين النتائج، Enter للاختيار، Esc للإلغاء" },
      { type: "feature", text: "📌 وضع التكرار (Sticky Mode): زر '🔁 تكرار' جنب الفئة — اختار كم حركة جاية بنفس الفئة (مثلاً 5 مرتبات)، احفظ، الفورم بيفضل مفتوح بـcategory محفوظة + counter متبقي" },
      { type: "feature", text: "🎯 Banner داخل الفورم بيعرض عدد الحركات المتبقية + زر إيقاف التكرار في أي وقت — مناسب لإدخال دفعات يومية متكررة (مرتبات، تكلفة، صيانة)" },
      { type: "feature", text: "💡 الـToast بعد كل حفظ في وضع التكرار: '✓ حُفظ — متبقي 4 حركات' — confirmation فوري للسرعة" },
      { type: "improvement", text: "🚀 الـSearchSel بقى يعرض كل النتائج في الـfocus حتى لو الـquery فارغ (showAllOnFocus prop) + max-height 280px مع scroll للقوائم الطويلة" },
      { type: "improvement", text: "⚡ التكرار مش بيؤثر على التعديل: تعديل حركة موجودة (editTx) بيتم بشكل عادي بدون تأثير على الـsticky counter" },
      { type: "improvement", text: "🔁 لو فيه sticky نشط وضغطت 'إغلاق' ثم '+ حركة جديدة' تاني، الـcategory بترجع من الـsticky تلقائياً (مش بتتفقد)" },
    ]
  },
  {
    version: "V18.51",
    date: "2026-04-29",
    types: ["feature"],
    title: "Phase 3 — إشعارات دائنة + طباعة احترافية + ترحيل تلقائي",
    changes: [
      { type: "feature", text: "↩️ تبويب جديد 'إشعارات دائنة' — entity منفصل لمرتجعات المبيعات، نفس workflow الفاتورة (Draft → Posted → Void) مع ربط بالفاتورة الأصلية" },
      { type: "feature", text: "🔢 ترقيم تلقائي للإشعارات: CN-2026-0001 — counter منفصل لكل سنة" },
      { type: "feature", text: "🧾 ترحيل الإشعار الدائن بينشئ قيد عكسي للبيع: Dr مرتجع المبيعات / Cr عملاء + Dr مخزون منتج تام / Cr COGS (إرجاع التكلفة)" },
      { type: "feature", text: "🤖 إنشاء تلقائي للإشعار: لما 'الترحيل من الفاتورة' مفعّل، كل مرتجع عميل بينشئ إشعار دائن مسودة تلقائياً" },
      { type: "feature", text: "🖨️ طباعة احترافية للفواتير والإشعارات: letterhead بالـfactory info + status badge + بيانات الطرف + جدول البنود + totals box + 3 توقيعات + footer" },
      { type: "feature", text: "📥 الطباعة تتم لـ3 أنواع من نموذج موحد: فاتورة مبيعات (أخضر) + فاتورة مشتريات (أصفر) + إشعار دائن (أحمر) — كلهم بنفس layout احترافي" },
      { type: "feature", text: "⚡ Toggle جديد 'ترحيل تلقائي عند إنشاء الفاتورة (skip draft)' — لو مفعّل، الفاتورة تترحل فوراً مع التسليم بدون مرحلة المراجعة" },
      { type: "feature", text: "📚 زر 'إنشاء إشعارات من X مرتجع' في صفحة الإشعارات — تحويل جماعي للمرتجعات القديمة" },
      { type: "improvement", text: "🎯 المرتجعات بقت توازي البيعات في كل حاجة: نفس البنية، نفس الـworkflow، نفس الـauto-post، نفس مستوى الاحترافية" },
      { type: "improvement", text: "🛡️ Backward compat: الـtoggles default معطّلة — أي مستخدم على V18.50 ميلاحظش تغيير في السلوك لحد ما يفعّل" },
    ]
  },
  {
    version: "V18.50",
    date: "2026-04-29",
    types: ["feature", "architectural"],
    title: "Phase 2 — الترحيل المحاسبي من الفاتورة بدلاً من التسليم",
    changes: [
      { type: "architectural", text: "🏗️ تحول معماري كبير: الفاتورة بقت هي مصدر القيد المحاسبي بدلاً من التسليم/الاستلام المباشر — مطابق للممارسة المحاسبية الاحترافية" },
      { type: "feature", text: "⚙️ toggle جديد في 'الإعدادات → إعدادات الفواتير' للتحكم في الوضع: قيد مباشر (legacy) أو قيد من الفاتورة (Phase 2)" },
      { type: "feature", text: "✨ عند تفعيل الوضع الجديد: كل تسليم بينشئ فاتورة مسودة تلقائياً، والقيد ما يتعملش لحد ما المستخدم يـ'ترحّل' الفاتورة" },
      { type: "feature", text: "📤 'ترحيل الفاتورة' بقى ينشئ القيد الكامل: قيد الإيرادات (AR + Revenue + Discount) + قيد COGS (تكلفة البضاعة المباعة)" },
      { type: "feature", text: "📥 ترحيل فاتورة المشتريات: Dr مخزون / Cr موردين — مع ربط الـjournal entry مع الفاتورة عبر postedJournalRef" },
      { type: "feature", text: "❌ 'إلغاء الفاتورة' بينشئ قيد عكسي تلقائياً يصفر القيد الأصلي — audit trail كامل" },
      { type: "feature", text: "🔗 4 builders جدد في postingRules: buildSalesInvoicePostedEntry, buildSalesInvoiceCogsEntry, buildPurchaseInvoicePostedEntry, buildInvoiceVoidEntry" },
      { type: "feature", text: "🚀 3 methods جدد في autoPost: salesInvoicePosted, purchaseInvoicePosted, invoiceVoided — كلهم يحفظوا postedJournalRef على الفاتورة بعد النجاح" },
      { type: "improvement", text: "🛡️ Backward compat 100%: الـtoggle الافتراضي معطّل — أي مستخدم سبق وفعّل V18.35-V18.49 ميلاحظش تغيير في السلوك" },
      { type: "improvement", text: "💡 المرتجعات (returns) لسه بتـauto-post من التسليم — هتنتقل للفاتورة في V18.51 (credit notes)" },
    ]
  },
  {
    version: "V18.49",
    date: "2026-04-29",
    types: ["feature"],
    title: "نظام فواتير المبيعات والمشتريات — Phase 1",
    changes: [
      { type: "feature", text: "📤 تبويب جديد 'فواتير المبيعات' — قائمة بكل الفواتير + فلتر بالحالة (مسودة/مرحّل/ملغية) + فلتر بالعميل والتاريخ + بحث" },
      { type: "feature", text: "📥 تبويب جديد 'فواتير المشتريات' — نفس الإمكانيات للموردين" },
      { type: "feature", text: "🔢 ترقيم تلقائي للفواتير: INV-2026-0001 للمبيعات، PINV-2026-0001 للمشتريات (counter لكل سنة)" },
      { type: "feature", text: "📊 4 stats cards في كل صفحة: الإجمالي + المسودة + المرحّل + الملغية مع المبالغ" },
      { type: "feature", text: "🔄 Status workflow احترافي: Draft → Posted → Void مع timestamps + اسم المُنفّذ + سبب الإلغاء" },
      { type: "feature", text: "➕ زر 'إنشاء فواتير من X تسليم/استلام' — تحويل جماعي لكل التسليمات/الاستلامات اللي ما لهاش فواتير لمسودات في ضغطة زر" },
      { type: "feature", text: "🔗 زر 'تحويل لفاتورة' داخل عرض إذن الاستلام + badge 'مرتبطة بفاتورة' لو متربط" },
      { type: "feature", text: "📋 modal تفاصيل فاتورة كامل: header + items table + totals + status timeline + actions (طباعة، ترحيل، إلغاء، حذف مسودة)" },
      { type: "improvement", text: "💡 العلاقة 1:1 بين التسليم/الاستلام والفاتورة — كل تسليم له فاتورة منفصلة (بسيط ومرن)" },
      { type: "improvement", text: "🛡️ Phase 1 = read-only layer: المحاسبة (auto-post) لسه شغالة من التسليم زي V18.48 — مفيش مخاطر على القيود الموجودة. الـrefactor المحاسبي للفاتورة في V18.50" },
    ]
  },
  {
    version: "V18.48",
    date: "2026-04-29",
    types: ["feature"],
    title: "حذف بالقوة للأصناف العالقة (قماش، إكسسوار، منتجات عامة، أصناف مخزن)",
    changes: [
      { type: "feature", text: "⚠️ زر 'حذف بالقوة' بيظهر تلقائياً لما يحاول المستخدم يحذف صنف ومش قادر بسبب حركات مرتبطة" },
      { type: "feature", text: "🧹 الحذف بالقوة بينظّف: العنصر نفسه (يتحفظ في سلة المحذوفات) + كل حركات المخزن المرتبطة + بنود إذونات الاستلام" },
      { type: "feature", text: "📋 الـpopup بيعرض ملخص واضح قبل التأكيد: عدد الحركات اللي هتُحذف، الرصيد الحالي، الإيصالات المتأثرة" },
      { type: "feature", text: "🛡️ Hard-block للسلامة: لو العنصر مُستخدم في أوردر فعلاً، الحذف بالقوة بيرفض حتى مع الإصرار — عشان ميكسرش حسابات الأوردرات" },
      { type: "feature", text: "📑 إذونات الاستلام لا تُحذف بالكامل (audit trail) — يُحذف فقط البند المتعلق بالعنصر، ولو الإيصال بقى فاضي يتعلّم flag _orphaned للمراجعة" },
      { type: "improvement", text: "🎯 ينطبق على 4 أنواع: قماش، إكسسوار، منتجات عامة، أصناف مخزن — في 3 أماكن (صفحة المخزن لكل نوع + صفحة المشتريات الموحدة)" },
      { type: "improvement", text: "💡 تحذير واضح بالـpopup: 'لو فيه قيود محاسبية مرتبطة، راجع الترحيلات يدوياً' — لأن النظام مش بيعكس قيود تلقائياً" },
    ]
  },
  {
    version: "V18.47",
    date: "2026-04-29",
    types: ["improvement"],
    title: "تسريع جذري لميزان المراجعة (29× أسرع للقراءة)",
    changes: [
      { type: "improvement", text: "🚀 ميزان المراجعة بقى يحمّل في ~500ms بدلاً من 5 ثواني — تحسين معماري في طريقة قراءة قيود الفترة" },
      { type: "improvement", text: "📡 من 29 طلب شبكة إلى طلب واحد: استبدال parallel reads بـFirestore range query على documentId() — يرجع كل أيام الفترة في طلب واحد" },
      { type: "improvement", text: "🎯 الأيام الفاضية لا تُطلب أصلاً (قبل: 29 طلب 30 منهم 404 = noise + بطء)" },
      { type: "improvement", text: "📊 ينطبق على: ميزان المراجعة، القوائم المالية (دخل/مركز/تدفقات)، كشف حساب طرف، أستاذ الحساب، الـpreload في صفحة المحاسبة" },
      { type: "improvement", text: "🛡️ Fallback آمن: لو الـrange query فشلت لأي سبب، النظام يرجع للطريقة القديمة تلقائياً (resilience)" },
      { type: "improvement", text: "💰 توفير في الـcost: Firestore بيحاسب على عدد الـreads — تخفيض 30:1 = توفير حقيقي للحسابات الكبيرة" },
    ]
  },
  {
    version: "V18.46",
    date: "2026-04-29",
    types: ["feature"],
    title: "تحكم في إظهار/إخفاء أدوات Odoo",
    changes: [
      { type: "feature", text: "🔘 toggle جديد في 'الإعدادات → ربط Odoo' للتحكم في إظهار كل أدوات Odoo في النظام" },
      { type: "feature", text: "👁️ لما يتفعّل: تظهر إعدادات Odoo + روابط Odoo في الـtopbar (ديسكتوب وموبايل) + زر 'تزامن Odoo' في صفحة الخزنة" },
      { type: "feature", text: "🚫 لما يتعطّل: كل أدوات Odoo تختفي من الواجهة — الـsetup card، روابط Odoo، زر التزامن، نافذة التزامن" },
      { type: "improvement", text: "💾 الإعدادات المحفوظة (URL, API keys, mappings, links) لا تتأثر بالـtoggle — تفعّل تاني تلاقي كل حاجة زي ما هي" },
      { type: "improvement", text: "🛡️ Backward compat: الافتراضي 'مُفعَّل' (true) عشان أي مستخدم سبق وفعّل ميلاحظش اختفاء أي حاجة بعد التحديث" },
      { type: "improvement", text: "🎯 الـtoggle موضوع في أعلى كارد إعدادات Odoo — حتى لو الأداة معطلة، يظهر الـtoggle لإعادة التفعيل بدون البحث في مكان تاني" },
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
