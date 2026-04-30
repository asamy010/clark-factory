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
    version: "V18.81",
    date: "2026-04-30",
    types: ["improvement"],
    title: "🎨 أزرار الصفحة الرئيسية: مربعة + 5% أكبر",
    changes: [
      { type: "improvement", text: "🟦 رجعت `aspectRatio:1` فالأزرار بقت مربعة الشكل بدل المستطيلة. padding 10×6 → 12×8، gap 6 → 8، borderRadius 10 → 11. الأيقونة محفوظة (44×44) والـ6 أعمدة محفوظة." },
    ]
  },
  {
    version: "V18.80",
    date: "2026-04-30",
    types: ["improvement"],
    title: "🎨 ضبط أزرار الصفحة الرئيسية: أيقونة كبيرة + بطاقة مدمجة",
    changes: [
      { type: "improvement", text: "🔄 رجعت الأيقونة لحجمها الطبيعي (icon container 44×44, svg 22×22) عشان تكون واضحة وبارزة. شيلت `aspectRatio:1` (المربع المتساوي) — البطاقة دلوقتي بترسم نفسها على قد محتواها بدون مساحة بيضاء فاضية. padding 10×6، gap 6، font FS-1. النتيجة: بطاقات مدمجة بأيقونات كبيرة، 6 أعمدة في الديسكتوب." },
    ]
  },
  {
    version: "V18.79",
    date: "2026-04-30",
    types: ["improvement"],
    title: "🎨 توحيد شكل بطاقات أوامر القص",
    changes: [
      { type: "improvement", text: "🗑️ حذف الشريط الملون اللي كان فوق كل بطاقة في صفحة 'أوامر القص' (الـ 6px status bar الموجود من V16.39). كل البطاقات بقت بنفس الشكل الموحّد. حالة الأوردر لسه واضحة من الـbadges والمراحل تحت." },
    ]
  },
  {
    version: "V18.78",
    date: "2026-04-30",
    types: ["improvement"],
    title: "🎨 تصغير أزرار الصفحة الرئيسية + حذف العنوان",
    changes: [
      { type: "improvement", text: "🗑️ حذف عنوان 'الوحدات الأساسية' من الصفحة الرئيسية — الأزرار واضحة لوحدها." },
      { type: "improvement", text: "📏 تصغير الأزرار 40% إضافية: padding 14→8، icon container 38→23، svg 18→11، border-radius 10→6، gap 8→5، font FS-1→FS-2. الـbadge '👁 قراءة' اختصر لـ '👁' فقط لتوفير مساحة. الـaspectRatio:1 محفوظ (مربعات)، الـgrid 6 أعمدة محفوظ. النتيجة: شبكة كومباكت جداً مناسبة لشاشات الديسكتوب الكبيرة." },
    ]
  },
  {
    version: "V18.77",
    date: "2026-04-30",
    types: ["fix", "improvement", "maintenance"],
    title: "🔧 إصلاح مجموع popup الإقفال + شبكة الأزرار الرئيسية + تنظيف",
    changes: [
      { type: "fix", text: "🚨 popup 'اعتماد وقفل أسبوع' كان يحسب: مرتبات + سلف الإدارة فقط، بدون دفعات الورش ولا المصاريف الأخرى. النتيجة: المبلغ في الـpopup ما كانش مطابق لبطاقة 'الإجمالي النهائي' في الصف العلوي. الإصلاح: المعادلة بقت تشمل الـ4 بنود + سطرين جدد في popup يعرضوا كل بند بشكل واضح." },
      { type: "improvement", text: "✅ تأكيد ترحيل البيانات: راجعت الكود — كل الـ4 بنود بترّحل للخزنة فعلاً عند الإقفال (`hr_salary` + `hr_weekly_advance` + `hr_weekly_ws_payment` + `hr_other_expense`). مفيش مشاكل في الـlogic، التعديل UI فقط." },
      { type: "maintenance", text: "🗑️ حذف زر 'إضافة دفعة' من شاشة 'تشغيل خارجي' (الزر كان فيه نموذج إضافة دفعات منفصل عن الخزنة). الـworkflow الصحيح: تسجيل الدفعات من شاشة الخزنة مباشرة (مع category='تشغيل خارجي') — ده يضمن انتظام البيانات. النتيجة: 5 أزرار بدل 6 (تسليم ورشة، استلام، حسابات، تسليم مجمع، استلام مجمع)." },
      { type: "improvement", text: "🎨 الصفحة الرئيسية — أزرار الوحدات: الـgrid اتغير من 5 → 6 أزرار في الصف للديسكتوب (mobile/tablet نفسهم). الأزرار بقت مربعة بـ`aspectRatio:1`. الحجم اتقلل ~20%: padding 18→14، icon 48→38، svg 22→18، font حجم -1، gap 10→8. النتيجة: شبكة أكثر اتساقاً وأقل احتلالاً للشاشة." },
    ]
  },
  {
    version: "V18.76",
    date: "2026-04-30",
    types: ["feature", "improvement"],
    title: "💼 بطاقة 'مصاريف أخرى' في الصف العلوي + تأكيد يدوي للمرتبات (Admin)",
    changes: [
      { type: "feature", text: "💼 بطاقة جديدة 'مصاريف أخرى' في الصف العلوي بصفحة الأسبوع — بين 'دفعات الورش' و'الإجمالي النهائي'. تعرض إجمالي المصاريف الأخرى المسجلة + عددها. الـ grid اتحول من 9 → 10 عمود في الديسكتوب (موبايل: نفس 2 عمود ينزل لصف إضافي)." },
      { type: "improvement", text: "✅ صيغة 'الإجمالي النهائي' بقت تشمل المصاريف الأخرى: مرتبات + سلف الإدارة + دفعات ورش + مصاريف أخرى. الـtooltip اتحدث ليعرض البند الجديد." },
      { type: "improvement", text: "🔒 الترحيل للخزنة شغال أصلاً من V15.34 — مفيش تغيير في الـ logic. التعديل UI فقط: المصاريف بقت ظاهرة في الـ summary بدل ما كانت مخفية." },
      { type: "feature", text: "📝 زرار جديد '📝 تأكيد يدوي' في popup السكان للـ admin فقط — بيظهر بجانب 'إغلاق' لو في موظفين متبقيين بدون استلام. الزرار بيعرض عدد الموظفين المتبقين بين قوسين." },
      { type: "feature", text: "🪟 Modal تأكيد يدوي: قائمة بكل الموظفين المتبقين فيها checkboxes (تحديد الكل/إلغاء)، مرتبات الأسبوع الفعلية بجانب كل موظف (مش المرتب الكامل)، حقل 'سبب' إلزامي (3 حروف على الأقل)، حقل 'اكتب تأكيد للمتابعة'. الزرار disabled لحد ما الشروط تتحقق." },
      { type: "feature", text: "🚨 كل تأكيد يدوي بيتسجل في auditLog بـ severity='warning' و action='manual_salary_receipt' مع السبب + اسم الـadmin اللي عمل التأكيد. السجل دائم ومش بيتمسح." },
      { type: "improvement", text: "🏷️ Badges مختلفة: الـreceipt اللي اتعمل بسكان QR بيظهر '✅ استلم' (أزرق)، اللي اتعمل تأكيد يدوي بيظهر '📝 يدوي' (أصفر/برتقالي). الـtooltip بيعرض السبب لو يدوي. التفرقة موجودة في popup المظاريف." },
      { type: "improvement", text: "📊 عداد فرعي في popup السكان: تحت 'استلم: X' بيظهر '📝 يدوي: Y' لو في تأكيدات يدوية في الأسبوع — يخلي الادمن يعرف إيه نسبة الإستلامات اللي عبر سكان فعلي." },
      { type: "fix", text: "🛡️ race-safe: لو موظف اتسكن أثناء فتح المودال، الـ submit بيتأكد إن مفيش receipt قبل ما يضيف يدوي — منع التعارض." },
    ]
  },
  {
    version: "V18.75",
    date: "2026-04-30",
    types: ["maintenance"],
    title: "🗑️ إزالة شاشة 'إصلاح الحركات غير المربوطة'",
    changes: [
      { type: "maintenance", text: "🗑️ شاشة Repair UI اللي ضافت في V18.73 (banner أصفر + modal باختيار الورشة لكل حركة) اتشالت بالكامل من تاب 'حسابات الورش'. القرار: المستخدم يفضل إعادة إدخال الحركات يدوياً بدلاً من الـUI ده — بساطة أكتر." },
      { type: "maintenance", text: "🧹 cleanup: شيلت `repairOpen`، `repairChoices`، `orphanTxs` (useMemo)، و `applyRepair` handler من ExtProdPg.jsx. الـ banner والـ modal اتمسحوا تماماً. مفيش dead code." },
      { type: "improvement", text: "✅ بقي شغّال: الـauto-link أثناء الحفظ في الخزنة + الـToast التحذيري عند فشل الربط (مع نص أبسط بدون إشارة للـRepair UI) + الـMigrations التلقائية (3b, 3c, 3d بـArabic normalization). الحركات الجديدة بتنربط تلقائي والقديمة الواضحة بتتعدّل في الـbackground." },
      { type: "improvement", text: "💡 الحركات اللي الـauto-link ما يقدرش يربطها (مثل المصاريف لموردين بـcategory='تشغيل خارجي' بالغلط) المستخدم يقدر يحذفها من الخزنة ويعيد إدخالها بـcategory الصحيحة (مثلاً 'خدمات' أو 'مشتريات' بـparty=supplier)." },
    ]
  },
  {
    version: "V18.74",
    date: "2026-04-30",
    types: ["fix", "improvement"],
    title: "🔤 إصلاح matching الأسماء العربية + dropdown الورش في Repair UI",
    changes: [
      { type: "fix", text: "🚨 Bug في matchWorkshopFromDesc — المطابقة كانت بـString.includes() حرفياً، فأي اختلاف إملائي بسيط في اسم الورشة (مثلاً 'ورشة' vs 'ورشه'، 'أحمد' vs 'احمد'، 'علي' vs 'على') كان يمنع الـauto-link والـmigration من ربط الحركات. النتيجة: حركات كتيرة في الخزنة لاسم ورشة مشابه (مش متطابق) كانت بتفضل yatima ومش ظاهرة في كشف الحساب." },
      { type: "improvement", text: "✨ Arabic Normalizer جديد: function `normalizeAr()` في `utils/orders.js` تطبّق normalization كامل قبل المقارنة — تشيل التشكيل/التطويل/الكشيدة، وتوحّد كل أشكال الألف (أ إ آ ٱ → ا)، الـة→ه، الـى→ي، الـؤ→و، الـئ→ي، وtrim للـwhitespace. متطبّقة على الاسم في الـDB والـdesc الاتنين قبل الـincludes." },
      { type: "feature", text: "🔄 Migration 3d تلقائي: backfill ثالث بيشتغل مرة واحدة بعد deploy V18.74. يستخدم الـmatcher الجديد المُطبَّع، ويربط الحركات اللي الـ migrations القديمة فاتتها (مع الـArabic normalization). كل الدفعات اللي اسم ورشتها قريب لكن مش حرفي هيتربطوا تلقائياً." },
      { type: "fix", text: "🚨 Bug في Repair UI dropdown: SearchSel كانت ما تعرضش الورش لما المستخدم يضغط عليها (الـ default behavior بتاعها يعرض النتائج بس بعد ما تكتب). أضيف `showAllOnFocus={true}` و `maxResults={50}` فالـdropdown دلوقتي يفتح فوراً ويعرض كل الورش (لحد 50) بمجرد التركيز عليه." },
      { type: "improvement", text: "📱 رقم الإصدار في الموبايل: زرار 'V18.74' بقى يظهر في الـtopbar في عرض الموبايل بعد ما كان مخفي. الضغط عليه بيفتح الـAbout/Changelog modal زي الديسكتوب." },
      { type: "improvement", text: "✅ نتيجة كل التحسينات (V18.72 → V18.74): الـworkflow بتاعك (تشغيل خارجي + اسم في desc بأي إملاء) بيشتغل تلقائياً 100%، حتى لو الإملاء بيختلف عن الـDB. والحالات الفعلاً غامضة بترجع للـRepair UI لاختيار يدوي." },
    ]
  },
  {
    version: "V18.73",
    date: "2026-04-30",
    types: ["fix", "feature"],
    title: "🔧 إصلاح كشف حساب الورش — Repair UI + auto-link محسّن",
    changes: [
      { type: "fix", text: "🚨 Bug في كشف حساب الورشة (متابعة V18.72): حركات الخزنة المسجلة كـ'تشغيل خارجي' بدون اختيار ورشة من party-picker، لو الـauto-link فشل في مطابقة اسم الورشة (مثلاً الاسم في `notes` بس مش في `desc`)، الحركة كانت بتفضل yatima — موجودة في الخزنة لكن مش ظاهرة في كشف حساب الورشة." },
      { type: "feature", text: "🔧 Repair UI تفاعلي جديد: Banner أصفر بيظهر تلقائياً في تاب 'حسابات الورش' لو فيه حركات يتيمة، يفتح Modal فيه جدول بكل الحركات (تاريخ + فئة + بيان + ملاحظات + مبلغ) مع SearchSel لاختيار الورشة لكل حركة. زرار 'ربط الحركات المختارة' بينشئ wsPayments ويربطها بحركات الخزنة. الحركات اللي تفضل بدون اختيار تتجاهل (يعني آمن — مش هيعمل ربط غلط)." },
      { type: "improvement", text: "🎯 Auto-link محسّن في الخزنة: بدل ما كان يدور على اسم الورشة في `desc OR notes` (الواحد بس)، دلوقتي بيدمج الاتنين (`desc + ' ' + notes`) ويبحث في النص الموحد. يمسك الحالات اللي اسم الورشة فيها مكتوب في الـnotes فقط أو مقسوم بين الاتنين." },
      { type: "improvement", text: "⚠️ Toast تحذيري عند الحفظ: لما تحفظ حركة بـcategory='تشغيل خارجي' أو 'مشتريات' بدون ربط بورشة (لا اخترت ولا الـauto-link لقى)، Toast أصفر بيظهر '⚠ حُفظ بدون ربط بورشة — لن يظهر في كشف الحساب' بدل الـToast الصامت بتاع قبل. تنبيه مباشر بدل اكتشاف المشكلة بعدين." },
      { type: "feature", text: "🔄 Migration 3c تلقائي: عند أول تحميل بعد V18.73، migration `ws-treasury-desc-notes-backfill` بتشتغل مرة واحدة وتعدي على كل الحركات اليتيمة، تطابق الـ`desc + notes` المدموجين، وتنشئ wsPayments للمطابقات الواضحة. الحركات الغامضة بتتسجل في الـRepair UI للمراجعة اليدوية." },
      { type: "improvement", text: "📝 _wsRepairLog: كل عملية إصلاح يدوية بتتسجل في `_wsRepairLog` (timestamp + المستخدم + عدد الحركات) لـaudit trail." },
      { type: "improvement", text: "✅ النتيجة: كل دفعات الورش — قديم وجديد — هتظهر في كشف الحساب بشكل صحيح. إما تلقائياً (auto-link/migration) أو يدوياً عبر الـRepair UI لو الحالة غامضة." },
    ]
  },
  {
    version: "V18.72",
    date: "2026-04-30",
    types: ["fix", "feature"],
    title: "🔗 إصلاح ربط دفعات الورش المسجلة من الخزنة",
    changes: [
      { type: "fix", text: "🚨 Bug في كشف حساب الورشة: لما تسجل دفعة ورشة من شاشة 'الخزنة' بـcategory='تشغيل خارجي' وتكتب اسم الورشة في الوصف فقط (بدون اختيار من party picker)، الدفعة كانت بتدخل الخزنة لكن مش بتظهر في كشف حساب الورشة في 'تشغيل خارجي'. السبب: الكشف بيقرا من wsPayments فقط، والدفعة كانت orphan." },
      { type: "feature", text: "✨ Auto-link ذكي عند الحفظ: لما تحفظ حركة خزنة بـcategory='تشغيل خارجي' أو 'مشتريات' من غير ما تختار ورشة من party picker، الكود بيدور تلقائياً على اسم ورشة معروفة في الوصف، ولو لقى match وحيد بيربطها بـwsPayment تلقائي. Toast بسيط '✓ ربط تلقائي بورشة X' بيظهر بعد الحفظ." },
      { type: "feature", text: "🔄 Backfill Migration تلقائي: عند أول boot بعد V18.72، migration `ws-treasury-desc-backfill` بتشتغل مرة واحدة وتعدي على كل حركات الخزنة القديمة بـcategory='تشغيل خارجي' أو 'مشتريات' بدون wsPaymentId. لكل واحدة فيها اسم ورشة معروف بشكل واضح، بتنشئ wsPayment وتربطها — يعني كل الدفعات القديمة هتظهر في كشوف الورش بدون أي تدخل يدوي." },
      { type: "feature", text: "🛡️ Defensive Display في كشف الحساب: في `wsAccounts()` (شاشة 'تشغيل خارجي → كشف حساب الورشة')، الكود بقى يضيف orphan treasury entries (اللي عندها wsName بس مفيهاش wsPaymentId) للـtotalPaid/totalPurchase. ده safety net ضد أي entry تفلت من الـauto-link والـbackfill." },
      { type: "improvement", text: "🎯 Smart matching للأسماء: الـmatching بيدور على الورشة بالاسم الكامل في الوصف. لو لقى ورشتين أسماءهم متداخلة (مثلاً 'محمد' و 'محمد ستارال')، بيختار الاسم الأطول لأنه الأكثر دقة. لو لقى ورشتين منفصلتين تماماً، بيتجنب الـlinking (أمان أكتر من تخمين غلط)." },
      { type: "improvement", text: "✅ النتيجة: الـworkflow اللي اعتدت عليه (تشغيل خارجي + اسم في الوصف) بقى يربط الدفعة تلقائياً بكشف الورشة. مفيش تغيير في الواجهة المستخدم — كل حاجة بتشتغل تلقائياً تحت السطح." },
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
