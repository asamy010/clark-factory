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
    version: "V19.26",
    date: "2026-05-02",
    types: ["fix"],
    title: "🔄 [revert] منطق فلتر الأسبوع للمديونيات — أول خصم في الأسبوع اللي بعد تاريخ المديونية",
    changes: [
      { type: "fix", text: "🔄 رجوع لمنطق V19.22 الأصلي: `if(week.weekStart < d.startDate) skip`. التوضيح من المستخدم: 'تاريخ المديونية يوم الخميس 23-4 وبداية الخصم على الموظف الاسبوع اللي بعده يعني 30-4'. يعني الأسبوع اللي يحتوي تاريخ المديونية (بدايته قبل تاريخ المديونية) لا يُخصم. أول خصم في الأسبوع اللي بدأ في أو بعد تاريخ المديونية." },
      { type: "fix", text: "📋 مثال عملي (المستخدم): مديونية بداية 23-4 (الخميس، آخر يوم في W17). W17 (weekStart 18-4) → 18<23 → SKIP ✓. W18 (weekStart 25-4) → 25<23 false → INCLUDE ✓. النتيجة: قسط واحد بس عند إقفال W18، مش اتنين كما كان يبان قبل التصحيح." },
      { type: "fix", text: "🔧 V19.23 كان بيستخدم `weekEnd < d.startDate` بدل `weekStart` — ده كان بيخلي W17 (weekEnd=23-4) مؤهل في حالة المستخدم بالغلط. تم الرجوع للمنطق الأصلي. الـ recovery scanner (V19.23-24) بيستخدم نفس الفلتر دلوقتي عشان يكون متناسق مع الخصم التلقائي." },
    ]
  },
  {
    version: "V19.25",
    date: "2026-05-02",
    types: ["improvement"],
    title: "📤 رسالة واتساب يومية الخزنة — إجماليات فقط",
    changes: [
      { type: "improvement", text: "📤 إزالة قسم 'تفاصيل الحركات' من رسالة WhatsApp اليومية للخزنة. الرسالة دلوقتي بتحتوي على: رصيد افتتاحي، إجمالي الوارد، إجمالي المنصرف، صافي اليوم، رصيد الإقفال، عدد الحركات، الوارد حسب التصنيف، المنصرف حسب التصنيف. ده بيخلي الرسالة أقصر وأنظف للمتلقي." },
      { type: "improvement", text: "📋 ملاحظة: التقرير المطبوع (HTML) لسه بيحتوي على كل تفاصيل الحركات الفردية — التغيير ده على رسالة WhatsApp بس." },
    ]
  },
  {
    version: "V19.24",
    date: "2026-05-02",
    types: ["fix"],
    title: "🐛 [hotfix] مكتشف الأقساط: إصلاح JSX comment غير مغلق + تخفيف الفلتر",
    changes: [
      { type: "fix", text: "🐛 المكتشف في V19.23 ما ظهرش في الواجهة. سببين: (1) JSX comment block ناقصه `}` في الآخر فالـ render فشل صامت. (2) الفلتر كان متشدد جداً: بيشترط `w.status===\"closed\"` + `d.createdAt<w.closedAt` (مقارنة timestamps دقيقة قابلة للفشل)." },
      { type: "fix", text: "✅ المنطق الجديد أبسط وأقوى: بدل ما نشيك على hrWeeks بشروط متشددة، نسكان `data.hrLog` مباشرة. لو الموظف عنده salary entry لأسبوع معين، يبقى اتدفعله مرتب في الأسبوع ده. لو الأسبوع weekEnd >= debt.startDate، يبقى مؤهل. مفيش checks زيادة." },
      { type: "fix", text: "🛡 Fallback آمن: لو مش لاقي الأسبوع في hrWeeks (بيانات قديمة)، يبني object من الـ hrLog entry نفسها (weekStart/weekEnd/weekNum). كده الـ recovery هيشتغل حتى مع بيانات قبل ما الأسابيع كانت بتتسجل في hrWeeks." },
      { type: "improvement", text: "📋 الـ banner لسه بنفس الشكل: لون أصفر + قائمة الأسابيع + زر 'تسجيل الكل'. اضغطه ضغطة واحدة لسحب كل الأسابيع المفقودة دفعة واحدة." },
    ]
  },
  {
    version: "V19.23",
    date: "2026-05-02",
    types: ["fix", "feature"],
    title: "🚨 [حرج] إصلاح باج فلتر الأسبوع للمديونيات + مكتشف الأقساط المفقودة",
    changes: [
      { type: "fix", text: "🐛 [الباج المُكتشف] في `empDebtInstallment` (سطر 2825 من HRPg)، الفلتر كان: `if(week.weekStart < d.startDate) skip`. ده غلط — معناه إن لو مديونية اتعملت يوم الخميس 23-4 (آخر يوم في W16، بدايته 17-4)، الـ W16 close كان بيتجاهلها لأن weekStart 17-4 < startDate 23-4. ده لا يطابق توقع المستخدم: 'دخلت المديونية ودي اتخصمت في إقفال الأسبوع'." },
      { type: "fix", text: "✅ التصحيح: تم تغيير المقارنة لـ `week.weekEnd < d.startDate`. كده الأسبوع اللي **انتهى** في يوم بداية المديونية أو بعدها مؤهل للخصم. مثال: W16 (weekEnd=23-4) مع debt startDate=23-4 → 23<23 = false → يُحتسب ✓. W15 (weekEnd=16-4) مع نفس المديونية → 16<23 = true → يتجاهل ✓ (صح، الأسبوع ده انتهى قبل المديونية)." },
      { type: "feature", text: "🔍 [HR] مكتشف الأقساط المفقودة على كل مديونية نشطة. لو في أسبوع كان مؤهل للخصم لكن مش متسجّل (بسبب الباج القديم أو لأن المديونية اتعملت بعد إقفال أسبوع)، بيظهر banner أصفر بعدد الأسابيع المفقودة + قائمة بأسابيع W17/W18 إلخ + زر 'تسجيل الـX قسط'. ضغطة واحدة تلحق كل المتأخرات." },
      { type: "improvement", text: "🛡 الكشف بيتأكد قبل الاقتراح: (1) الأسبوع مغلق و(2) لم يُسجّل بالفعل و(3) الموظف عنده hrLog salary entry فيه و(4) المديونية اتعملت قبل ما الأسبوع يُغلق. كده مفيش false positives." },
      { type: "improvement", text: "📋 الأسابيع اللي اتسجلت عبر المكتشف بتتميّز في `recoveredWeekIds[]` للتدقيق. شفافية كاملة." },
    ]
  },
  {
    version: "V19.22",
    date: "2026-05-02",
    types: ["improvement", "feature"],
    title: "🧹 تنظيف التوب بار + سجل دفعات المديونيات",
    changes: [
      { type: "improvement", text: "🧹 إزالة pill 'مزامنة من X د' و pill '👥 الفريق' من التوب بار — كانوا بيشغلوا حيز كبير. حذف كامل لـ `TeamActivityModal.jsx` + الـ import + الـ state + render. الـ tooltip 'آخر مزامنة' لسه موجود على pill الحالة (المتصل/أوفلاين) و في banner وضع القراءة فقط." },
      { type: "feature", text: "📋 [HR] قسم 'سجل الدفعات' جديد على كل كارت مديونية — بيعرض كل قسط اتسجل: تلقائياً (📅 أسبوع W17 + التاريخ) أو يدوياً (✋ + التاريخ + الملاحظة). بيشمل المبلغ المدفوع لكل قسط. لو في دفعة جزئية، بتظهر مع 'ناقص X — تم تمديد الأقساط'. شفافية كاملة لما اتخصم وإمتى." },
      { type: "feature", text: "💡 [HR] tooltip توضيحي لما المديونية لسه ما اتقسطش حاجة: 'الأقساط بتنزل تلقائياً مع كل إقفال أسبوع — بشرط: المديونية موجودة قبل الإقفال + بداية الأسبوع بعد أو يساوي تاريخ بداية المديونية'. بيوضح للمستخدم متى يعمل الخصم التلقائي ومتى يلجأ للزر اليدوي." },
      { type: "fix", text: "🔍 توضيح: الخصم التلقائي للأقساط شغّال من الأصل في `weekly close` (سطر 1581 في HRPg). بيخصم القسط من الموظف وبيحدّث `paidWeekIds` تلقائياً. لو ظاهر 0 في شاشة المديونيات بعد إقفال أسبوع، السبب الأرجح: تاريخ بداية المديونية بعد بداية الأسبوع → الكود عن قصد ما خصمش. الحل: استخدم زر '+قسط مدفوع يدوي' لتسجيل الأسابيع السابقة." },
    ]
  },
  {
    version: "V19.21",
    date: "2026-05-02",
    types: ["improvement"],
    title: "🎨 popup المرحلة: تصميم أبيض نظيف بإطار ملوّن",
    changes: [
      { type: "improvement", text: "🎨 تغيير تصميم popup مرحلة الأوردر (StageProgressModal) لتصميم أبيض كامل (variant B). الخلفية بيضا 100% بدون شفافية، إطار 2px بلون المرحلة الكامل (أصفر للتشغيل، أحمر للطباعة، إلخ)، نصوص بألوان عادية (T.text/T.textSec) للوضوح الأقصى." },
      { type: "improvement", text: "🏷 الـ pill بتاع المرحلة لسه ملوّن (15% alpha + لون داكن للنص + إطار 40% alpha)، والـ% الكبير لسه بلون المرحلة. الهوية البصرية محفوظة بدون ضوضاء على القراءة." },
      { type: "improvement", text: "🔘 زر الإغلاق ✕ دلوقتي بخلفية رمادي محايد بدل ما كان بلون المرحلة — أنظف وأوضح إنه زر إغلاق." },
    ]
  },
  {
    version: "V19.20",
    date: "2026-05-02",
    types: ["fix", "feature"],
    title: "🚨 [حرج] إصلاح بيانات الورش + الخزنة كمصدر وحيد للحقيقة + popup أوضح + قسط يدوي",
    changes: [
      { type: "fix", text: "🐛 [المشكلة المُبلَّغ عنها] ورشة نورهان: الدفعات الفعلية 40,800 ج.م، لكن ملخص الحساب بيعرض 51,600 ج.م. السبب: V18.72 fallback كانت بتجمع `wsPayments` + orphan treasury، وفي حالة ما المستخدم يمسح حركة من الخزنة بدون ما يمسح الـ wsPayments المرتبطة، الـ wsPayment الـ ghost كان لسه بيتحسب." },
      { type: "fix", text: "🚨 [الأخطر] V19.17 auto-sync اللي بنيتها كانت بتنشئ wsPayments تلقائياً من orphan treasury entries — اللي معناه أن المسح كان مستحيل في حالات معينة: تمسح wsPayment، الـ treasury orphan، الـ auto-sync ترجع تنشئ الـ wsPayment تاني. تم إزالتها بالكامل." },
      { type: "feature", text: "✅ wsAccounts دلوقتي بتقرأ من **الخزنة فقط** كمصدر وحيد للحقيقة. الإجماليات هتطابق ما اتحرك فعلاً في فلوس الخزنة. الـ wsPayments أصبحت index ثانوي للعرض. النتيجة الفورية: 51,600 يرجع 40,800 من غير ضغط زر." },
      { type: "feature", text: "🧹 [أداة جديدة] 'تنظيف بيانات الورش': زر ⚠️ في صفحة حسابات الورش بيظهر لما في تضارب. بيعرض كل ghost payments (سجلات بدون قيد خزنة) وكل orphan treasury (قيود بدون سجل). لكل سطر: 'احذف' أو 'اعمل الطرف الناقص'. تنظيف يدوي شفاف 100%." },
      { type: "feature", text: "🔗 جدول دفعات الورش دلوقتي بيوضح: الصفوف الـ ghost بـ 👻 + شطب على المبلغ + خلفية حمرا (مش محتسبة). صفوف الـ orphan treasury بـ ⚠️ + خلفية صفرا (محتسبة). يفرّق بين النوعين بصرياً قبل ما تفتح أداة التنظيف." },
      { type: "improvement", text: "🔒 Bilateral cascade في حذف الخزنة: لو مسحت قيد خزنة مرتبط بـ wsPayment/custPayment/supplierPayment، السجل المقابل بيتمسح كمان (سواء عبر forward link `treasuryTxId` أو reverse link `wsPaymentId`). يمنع تكوّن inconsistencies جديدة." },
      { type: "improvement", text: "🎨 popup مرحلة الأوردر: زيادة opacity للوضوح. الخلفية 12%→22%، الـ header 8%→18%، الـ borders 35%→55%، pills بيضا 70%→85%. أوضح بدون فقدان الطابع الشفاف الهادئ." },
      { type: "feature", text: "💰 [HR] زر '+ قسط مدفوع' على كارت المديونية النشطة في popup المديونيات. بيفتح modal لتسجيل قسط يدوياً مع تاريخ + ملاحظة. مفيد للحالات اللي الخصم اتعمل فيها بـ specialDeduct أو المديونية اتعملت بعد إقفال أسبوع — حالات الـ paidWeekIds مكنش بيتسجل تلقائياً فيها." },
    ]
  },
  {
    version: "V19.19",
    date: "2026-05-02",
    types: ["feature"],
    title: "📣 [جديد] أداة الحملات والرسائل الجماعية للعملاء",
    changes: [
      { type: "feature", text: "✨ صفحة جديدة: \"الحملات والرسائل\" في الشريط الجانبي (📣). بتسمح بإرسال رسائل واتساب لمجموعات عملاء بقوالب مشخصنة، عبر workflow click-through (الموظف يدوس Send في كل رسالة بعد ما واتساب يفتحها)." },
      { type: "feature", text: "📝 نظام قوالب الرسائل: تقدر تحفظ قوالب جاهزة (تذكير دفع، إشعار تسليم، تسويق، إلخ) — كل قالب فيه نص قابل للتشخيص بمتغيرات: {اسم}، {رصيد}، {آخر دفعة}، {مبلغ آخر دفعة}، {عدد الأوردرات}، {رقم الجوال}. حد أقصى 30 قالب." },
      { type: "feature", text: "👥 شرائح ذكية للجمهور: كل العملاء، عملاء عليهم متأخرات (بحد أدنى)، عملاء استلموا أوردر مؤخراً (X يوم)، عملاء غير نشطين منذ X يوم، اختيار يدوي من قائمة بحث. الفلاتر بتحسب لحظياً من بيانات customerAnalytics الموجودة." },
      { type: "feature", text: "🚀 شاشة Assembly-line للإرسال: عداد \"5 من 50\"، شريط تقدم، زر \"ابعت لـ {اسم}\" يفتح واتساب برسالة جاهزة، زر تخطّى/إيقاف مؤقت، تأخير قابل للتعديل (3-30 ث)، قائمة كل العملاء بحالة كل واحد (مبعوت/متخطّى/فشل/متبقي)." },
      { type: "feature", text: "🛡 حماية رقم الواتساب: حد أقصى 50 رسالة/يوم افتراضياً (مجموع كل الحملات في اليوم). الإرسال الكثيف من رقم عادي بيؤدي لحظر الرقم من واتساب — التطبيق بيمنع تجاوز الحد." },
      { type: "feature", text: "📊 سجل الحملات: كل حملة محفوظة بملخص (التاريخ، القالب، الجمهور، عدد العملاء، تم/تخطّى/فشل، نسبة النجاح). آخر 50 حملة محفوظة في `data.campaigns`. التفاصيل التفصيلية لكل عميل (status per row) مش متخزنة في الـstorage عشان حجم الـconfig — الكامبين الواحد ~300 بايت بس." },
      { type: "feature", text: "⚠️ ملاحظة عن الصور: واتساب لا يدعم إرفاق ملفات تلقائياً عبر wa.me URL. لو حطيت رابط صورة في القالب، هيتضاف للنص كرابط (العميل يضغط يفتحه). للإرفاق الحقيقي، الموظف يرفع الصورة يدوياً بعد ما واتساب يفتح الشات. الـ V19.20+ هتضيف Web Share API لرفع الصور تلقائياً على iPad." },
      { type: "improvement", text: "🔐 صلاحيات: الأدمن والمدير ومحاسب المبيعات لهم صلاحية edit. باقي الأدوار hidden افتراضياً. الصلاحية اسمها `campaigns` في DEFAULT_PERMS." },
    ]
  },
  {
    version: "V19.18",
    date: "2026-05-02",
    types: ["improvement", "feature"],
    title: "🎨 popup المرحلة بألوان هادية + فلتر تاريخ في الخزنة + يوم بداية مرتبات قابل للتعديل",
    changes: [
      { type: "improvement", text: "🎨 إعادة تصميم popup تفاصيل المرحلة (StageProgressModal): توسيط عمودي بدل ما كان مرتفع فوق الشاشة، وألوان شفافة هادية بدل التدرج الفاقع. الـheader دلوقتي بخلفية شفافة بلون المرحلة (~7% alpha) والنصوص بلون المرحلة الغامق — أنظف وأقل إجهاد للعين. أضفت scroll داخلي للـbody عشان الـmodal مايخرجش عن الشاشة لو الأوردر فيه قطع كتيرة." },
      { type: "feature", text: "📅 فلتر «من تاريخ — إلى تاريخ» في صفحة الخزنة: حقلين جداد بجنب فلتر الشهر، بيشتغلوا فوق الفلاتر التانية. زر ✕ صغير لمسح المدى. الفلتر متضمَّن في طباعة المعروض وفي إجماليات السطر السفلي." },
      { type: "feature", text: "🗓 يوم بداية دورة المرتبات (HRPg → سجل شهري): حقل number جديد بجنب اختيار الشهر — لو حطيت 5، الشهر بيتحسب من 5 الشهر لـ 4 الشهر اللي بعده (الموظفين بيقبضوا يوم 5، فالحساب يطابق فلوس الشهر الفعلية). الافتراضي 1 = الشهر التقويمي العادي. القيمة محفوظة في `data.salaryCycleStartDay` (مرة واحدة، بتنطبق على كل الشهور). محدودة بـ 28 عشان فبراير مايبوظش." },
      { type: "improvement", text: "📊 السجل الشهري دلوقتي بيعرض الفترة الفعلية: «(2026-05-05 → 2026-06-04 · 31 يوم)» لما يوم البداية مش 1، أو «(31 يوم)» للحالة العادية. حساب السلف والخصومات بيستخدم الفترة دي، فالأرقام بتطابق ما الموظفين قبضوه فعلاً." },
    ]
  },
  {
    version: "V19.17",
    date: "2026-05-02",
    types: ["fix", "feature"],
    title: "🚨 [حرج] دفعات الورش المرحّلة من الأسبوع كانت غايبة من كشف الحساب",
    changes: [
      { type: "fix", text: "🐛 المشكلة المُبلَّغ عنها: 'سجلت دفعات للورش يوم 30-4 في إقفال الأسبوع، الدفعات في سجل الخزنة الفرعية ✓ بس مش ظاهرة في حسابات الورش'. لما الدفعة بتترحّل من weekly close بتظهر في treasury لكن ساعات بتفضل من غير `wsPayments` مطابق (orphan) — السبب: rollback أسبوع متبوع بـ reclose، أو بيانات قبل V15.27 لما الـlinkage مكنش متعمل." },
      { type: "fix", text: "🔍 السبب الجذري: 3 أماكن بتقرأ دفعات الورش — رصيد الورشة بيستخدم `wsAccounts()` اللي فيها V18.72 fallback (شغّال صح)، لكن كشف حساب الورشة (`ExtProdPg.jsx ~سطر 1158`) وجدول الدفعات (~سطر 1086) بيقروا من `data.wsPayments` فقط بدون orphan-fallback. نفس البق اللي اتصلح للعملاء في V18.64 وللموردين في V19.12 — الورش ما خدتش الإصلاح." },
      { type: "fix", text: "✅ الطبقة 1: orphan fallback في كشف حساب الورشة. أي treasury entry بـ `wsName` مطابق + `category=تشغيل خارجي/مشتريات` ومش متربط بـ `wsPayments` بيتعرض في الكشف بـ ⚠️ marker. الـbalance لسه صح من V18.72. الجمع متطابق مع رصيد الورشة الظاهر في الكارت." },
      { type: "fix", text: "✅ الطبقة 2: نفس الـfallback في جدول الدفعات الصغير اللي بيظهر تحت فورم تسجيل الدفعة. صفوف الـorphans بتتعرض بخلفية صفراء + ⚠️ + بدون أزرار تعديل/حذف (read-only) — لتجنب أخطاء على سجل مش موجود في wsPayments." },
      { type: "feature", text: "🔄 الطبقة 3: auto-sync silent على فتح صفحة حسابات الورش. `useEffect` + `useRef` lock بيشتغل مرة واحدة لكل dataset signature. بيمشي على treasury، يلاقي الأيتام، وينشئ سجلات `wsPayments` المفقودة بـ `treasuryTxId` صحيح + `autoSyncedAt` timestamp + back-link `wsPaymentId` على الـtreasury entry. النتيجة: المرة الأولى تفتح حسابات الورش بعد التحديث، الـ⚠️ markers هتختفي تلقائياً." },
      { type: "improvement", text: "🛡 المنطق المستخدم في الكشف 1+2 وفي auto-sync 3: نفس الفلتر بالظبط (set من `treasuryTxId` و set من `wsPayments.id`) — مفيش double-counting سواء قبل أو بعد المزامنة." },
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
