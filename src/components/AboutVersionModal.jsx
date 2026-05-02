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
  {
    version: "V19.16",
    date: "2026-05-02",
    types: ["architectural", "feature", "fix"],
    title: "🏗️ Online-only mode + شريط قراءة فقط + لوحة نشاط الفريق + إصلاح بادج المرحلة",
    changes: [
      { type: "architectural", text: "🚨 قرار معماري كبير: ألغينا فكرة العمل أوفلاين خالص. الدافع: race conditions على `factory/config` لما 2 موظفين يعدّلوا في نفس الوقت (آخر كتابة بتمسح اللي قبلها). بدل ما نبني tombstones وrecovery effects للأبد، أبسط حل = نمنع الكتابة لما الجهاز أوفلاين. القراءة شغالة دايماً من الـcache." },
      { type: "feature", text: "⛔ كل الـwrite functions (upConfig، upSales، upTasks) دلوقتي بيرفضوا التعديل لما `isOnlineRef.current === false` ويعرضوا toast: «أنت أوفلاين دلوقتي — التعديل مش متاح لحد ما النت يرجع». استخدمت `isOnlineRef` (بدل isOnline state) عشان مايضطرش الـuseCallback يعيد البناء كل مرة الاتصال يتقطع." },
      { type: "feature", text: "📜 شريط قراءة فقط: لما تكون أوفلاين، شريط أصفر-كرامل بيظهر تحت التوب بار: «وضع قراءة فقط · مفيش تعديل لحد ما الإنترنت يرجع». لو في توقيت مزامنة سابق، بيظهر على اليسار: «آخر مزامنة من X دقيقة»." },
      { type: "improvement", text: "🟢 تحديث الـpill في التوب بار: «● متصل» تبقى أخضر، أوفلاين تبقى «⊘ أوفلاين · قراءة فقط» بلون كرامل (مش أحمر — لإن البرنامج لسه شغال للـبراوزر، مش معطل)." },
      { type: "feature", text: "⏱ pill «مزامنة من X»: timestamp آخر كتابة ناجحة على السيرفر (محفوظ في localStorage). بيتحدث كل 30 ثانية. مفيد لتعرف إن البيانات في الجهاز فعلاً متطابقة مع السيرفر." },
      { type: "feature", text: "👥 لوحة «نشاط الفريق» (للمدير فقط): زر جديد في التوب بار يفتح modal بيعرض كل الموظفين وآخر نشاط لكل واحد. الحدود: 🟢 آخر 5 د، 🟡 آخر ساعة، 🔴 من ساعة فأكثر. الحساب من `data.auditLog` المباشرة — مفيش كتابات إضافية على Firestore (ما اخترناش heartbeat لأنه كان هيكلف 17K write/يوم لـ 6 موظفين). نقطة حمرا على الزر لو في موظف ساكت من ساعة." },
      { type: "feature", text: "✅ markSynced(): الـtimestamp بيتحدث في 3 مواضع: (1) بعد setDoc الناجح في upConfigTx، (2) بعد runTransaction الناجح في upSalesTx، (3) ونفس الكلام في upTasksTx. لو الـwrite فشلت، الـtimestamp مايتحدثش = المستخدم يشوف إن المزامنة قديمة." },
      { type: "maintenance", text: "🆕 ملف جديد: `src/components/TeamActivityModal.jsx`. Export `default TeamActivityModal` + helper `computeTeamActivity(data, currentUserName)`. الـhelper مستخدم في App.jsx لتحديد ظهور النقطة الحمرا على زر الفريق." },
      { type: "fix", text: "🐛 المشكلة المُبلَّغ عنها (bug قديم من V19.0): الضغط على بادج المرحلة في كارت الأوردر مايفتحش popup تفاصيل المرحلة. الضغط تاني على الكارت كان بيفتح الـpopup فوق + تفاصيل الأوردر ورا في نفس الوقت." },
      { type: "fix", text: "🔍 السبب الجذري: `<StageProgressModal>` كان متركّب في DetPg.jsx ~سطر 1691، اللي بيكون جوة branch «أوردر مفتوح». لما تكون في صفحة قايمة الأوردرات (`!order`)، الـcomponent بيرجع early في سطر 87 — فالـmodal مش mounted في الـDOM أصلاً. الضغط على البادج كان بيـset state من غير ما يرسم حاجة، وأول ما تضغط الكارت ويتغير `sel` الـbranch بيتبدّل وفجأة الـmodal بيتركّب على state موجود فعلاً (= بيتعرض)." },
      { type: "fix", text: "✅ الحل: ضفت `{stageProgressOrder&&<StageProgressModal …/>}` في branch قايمة الأوردرات كمان (DetPg.jsx ~سطر 502). دلوقتي الـmodal mounted في الـ2 paths." },
    ]
  },
  {
    version: "V19.14",
    date: "2026-05-02",
    types: ["fix", "improvement"],
    title: "🔄 مزامنة تلقائية لكشف العميل/المورد + تنظيف بصري للبطاقة",
    changes: [
      { type: "fix", text: "🐛 المشكلة (1) المُبلَّغ عنها: 'ليه الدفعة في كشف المورد ظاهرة كـ ⚠️ غير مزامنة؟' — حتى لما الدفعة دي ظاهرة في كشف الحساب بشكل عادي. السبب: الـtreasury entry فيها supplierId/custId، لكن صف مطابق في supplierPayments/custPayments مش متعمل (الحركة سُجلت قبل V19.9 auto-link، أو فيه gap في الـcascade). الـV19.12 fallback شغّال صح ظاهرياً، بس بيبيّنها كـ orphan." },
      { type: "fix", text: "✅ الحل: useEffect جديد في PurchasePg + CustDeliverPg بيتشغل لما المستخدم يفتح كشف مورد/عميل. لو فيه orphan treasury entries بـ supplierId/custId مطابق ومش في supplierPayments/custPayments، النظام تلقائياً ينشئ السجلات المفقودة (silent، بدون تأكيد). الـtombstones بتُحترم — الدفعات المحذوفة مش بتترجع. بـuseRef lock عشان مايتشغلش أكتر من مرة لنفس الطرف في نفس الـsession." },
      { type: "fix", text: "📋 السلوك الجديد: فتح كشف المورد لأول مرة → الـorphans تتربط silent. الـlabel '⚠️ غير مزامنة' هيختفي بعد لحظة. لو لسه فيه orphans (مثلاً supplierId غلط أو معدوم)، الـfallback بيظل بيعرضهم — لكن دي حالة استثنائية، مش الحالة الطبيعية." },
      { type: "improvement", text: "🎨 المشكلة (2): البطاقة الكبيرة في كشف المورد كانت تعرض '5,000 (له)' أو '3,000 (عليه)'. المستخدم طلب إزالة 'له'. الحل: شيلت الـsuffixes 'له' و'عليه' من بطاقة الرصيد (المختصرة). الـcolor coding (أحمر = عليه، أزرق = له، أخضر = مسدد) + علامة + للـnegative balance + النص المختصر هي وحدها كافية لتوضيح الاتجاه. الـcards الجانبية في صفحة المورديين (V14.49) محتفظة بالـ(له)/(عليه) لأن الألوان لوحدها مش بتكون واضحة في الجدول." },
    ]
  },
  {
    version: "V19.13",
    date: "2026-05-02",
    types: ["fix", "feature"],
    title: "🚨 [حرج] إصلاح كارثي: حذف حركة الخزنة لازم يشيلها من كشف العميل/المورد",
    changes: [
      { type: "fix", text: "🐛 المشكلة (المُبلَّغ عنها كـكارثة): 'حذفت دفعة من سجل الخزنة لكن لسه ظاهرة في كشف العميل والمحاسبة'. السبب الجذري: `delTx` و `bulkDeleteTxs` كانوا بيشيلوا الحركة لكن مش بيضيفوا tombstone، فالـrecovery effects كانت بترجع الـcustPayment من أي trace في treasury." },
      { type: "fix", text: "✅ Tombstones في delTx + bulkDeleteTxs: أي حذف لحركة عميل/مورد بيضيف الـID للـ_deletedCustPayTreasuryIds / _deletedSupplierPayTreasuryIds فوراً." },
      { type: "feature", text: "🗑 إزالة ✕ من صف الخزنة + Hint banner: الحذف دلوقتي بس عبر checkbox + 'حذف المحدد'. أوضح وأمن." },
      { type: "feature", text: "🧹 زر 'تنظيف الدفعات الميتة' في PaymentsTab: للبيانات القديمة قبل V19.13. بيكتشف cust/supplierPayments بدون treasury entry موجود ويعرضهم في preview قبل الحذف." },
    ]
  },
  {
    version: "V19.12",
    date: "2026-05-02",
    types: ["feature", "fix"],
    title: "🗑 حذف الدفعات من سجل المحاسبة + مزامنة دفعات الموردين مع كشف المورد",
    changes: [
      { type: "feature", text: "🗑 زر '🗑 حذف' في كل صف من PaymentsTab — بيمسح الدفعة + الخزنة + يعمل reverse للـjournal + tombstone." },
      { type: "fix", text: "📊 دفعات الموردين دلوقتي بتظهر في كشف المورد عن طريق orphan-treasury fallback (مثل V18.64 للعملاء)." },
      { type: "feature", text: "🔄 زر 'مزامنة الدفعات اليتيمة' بيشغل V19.9 recovery على demand بدون انتظار فتح صفحة الخزنة." },
      { type: "fix", text: "🛡 الـtombstones دلوقتي محترمة في 4 أماكن: V19.9 recovery، V18.64 fallback، PaymentsTab، supplier statement." },
    ]
  },
  {
    version: "V19.11",
    date: "2026-05-02",
    types: ["fix", "feature"],
    title: "🏦 اختيار الخزنة في تسجيل دفعة العميل + tombstones ضد الـghost",
    changes: [
      { type: "feature", text: "🏦 أضفت select 'الخزنة' في فورم تسجيل الدفعة من كشف حساب العميل. بدل ما كانت بتروح SUB CASH افتراضياً (وغير قابل للتغيير)، دلوقتي القائمة بتعرض كل حسابات الخزنة المتاحة. الافتراضي MAIN CASH." },
      { type: "fix", text: "👻 (Tombstone pattern): الحركات المحذوفة كانت ممكن ترجع تظهر بسبب V19.9 recovery أو V18.64 fallback. الإصلاح: لما تحذف دفعة، الـtreasury ID بيتسجل في `_deletedCustPayTreasuryIds` (max 200). الـrecovery + الـfallback دلوقتي بيتجاهلوا الـIDs دي نهائياً." },
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
