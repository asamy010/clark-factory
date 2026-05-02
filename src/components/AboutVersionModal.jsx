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
    version: "V19.9",
    date: "2026-05-02",
    types: ["fix"],
    title: "🚨 [حرج] إصلاح ربط دفعات العملاء/الموردين + recovery للحركات اليتيمة",
    changes: [
      { type: "fix", text: "🐛 المشكلة: 'دفعات كاش' في كارت العملاء بتعرض رقم أقل بكتير من إجمالي الـ'دفعة عميل' الموجود في سجل الخزنة، وكشف العميل مش بيعرض الدفعات. مثال: سجل الخزنة فيه 291,400 'دفعة عميل'، الكارت بيعرض 120,000 بس. السبب: حركات الخزنة بصنف 'دفعة عميل' بتولّد سجل في `custPayments` فقط لو المستخدم اختار العميل من القائمة المنسدلة (txPartyId مظبوط). لو كتب اسم العميل في حقل البيان فقط، الحركة بتتسجل بدون ربط حقيقي → كشف العميل مش بيشوفها، الكارت مش بيحسبها." },
      { type: "fix", text: "✅ Forward fix (auto-link جديد للعميل/المورد/الموظف): في `saveTx` بعد بلوك ورش الـauto-link (V18.73)، أضفت بلوك مماثل: لو txPartyId فاضي + الصنف 'دفعة عميل' (أو 'دفعة مورد' أو 'مرتبات')، النظام يحاول يربط تلقائياً عن طريق مطابقة اسم العميل/المورد/الموظف في حقل البيان أو الملاحظات. helper جديد `matchPartyFromDesc` في `utils/orders.js` (نفس فكرة `matchWorkshopFromDesc` بس generic لأي party، مع `minNameLength=3` لمنع matches خاطئة على أسماء قصيرة)." },
      { type: "fix", text: "✅ Backward fix (recovery migration): في TreasuryPg، useEffect جديد بيتشغل مرة واحدة كل session (مع useRef lock)، بيمسح كل حركات الخزنة بصنف 'دفعة عميل'/'دفعة مورد' ومش مربوطة (custId/supplierId فاضي + مفيش matching record بـtreasuryTxId في custPayments/supplierPayments). لكل واحدة، يحاول يربطها عن طريق matchPartyFromDesc + ينشئ القيد المفقود في custPayments/supplierPayments + يستامب custId/supplierId على الحركة الأصلية. آمن للتكرار (idempotent)." },
      { type: "fix", text: "✅ Visible warnings: لو حفظت 'دفعة عميل' (أو 'دفعة مورد' أو 'مرتبات') بدون ربط، يظهر toast أصفر واضح: '⚠ حُفظ بدون ربط بعميل — لن يظهر في كشف العميل أو دفعات كاش'. في وضع التكرار، التحذير بيظهر مع عدّاد المتبقي. ولو حصل ربط تلقائي، toast أخضر: '✓ ربط تلقائي بعميل [اسم]'." },
      { type: "fix", text: "📊 المتوقع لما تفتح التطبيق على V19.9: تشوف toast '✓ تم استرجاع X دفعة يتيمة' لو فيه حركات يتيمة، وكارت 'دفعات كاش' هترجع تظهر الرقم الصحيح. الحركات اليتيمة اللي اسم العميل فيها مكتوب بالعربي بشكل واضح هتترجع تلقائياً. اللي اسم العميل غير واضح فيها هتفضل تتطلب تعديل يدوي." },
    ]
  },
  {
    version: "V19.8",
    date: "2026-05-02",
    types: ["fix"],
    title: "🚨 [حرج] إصلاح TypeError كان بيمنع تفريغ النموذج وعداد التكرار في الخزنة",
    changes: [
      { type: "fix", text: "🐛 المشكلة الحقيقية اللي كانت معطلة sticky reset (مش validation): بعد الحفظ، استدعاء `autoPost.treasury(...).catch(()=>{})` كان بيرمي TypeError صامت. السبب: `autoPost.treasury` بترجع **Promise** لو الـauto-posting شغال، **بس object عادي** `{ok:false, skipped:'disabled'}` لو المستخدم معطّله من إعدادات المحاسبة. الـobject مفهوش `.catch()`، فبيرمي 'TypeError: Cannot read properties of undefined' وبيوقف saveTx قبل ما يوصل لـ sticky reset." },
      { type: "fix", text: "🔍 النتائج المرئية اللي كان شايفها المستخدم: الحركة بتتسجل ✓ (لإن upConfig خلص)، بس الفورم مبيتفرغش، عداد التكرار مبينزلش، حقول البيان والعميل والمبلغ بيفضلوا بقيمتهم — كل ده لإن الكود توقف قبل sticky reset." },
      { type: "fix", text: "✅ الإصلاح الجذري في `utils/accounting/autoPost.js`: كل الـ17 method (sale, treasury, hr, customerPay, إلخ) دلوقتي بترجع **Promise.resolve(...)** في حالات الـskipped (autoPost disabled، COGS disabled، no cost، no original ref). كده `.catch()` بقت آمنة في كل المكتبة، مش بس الخزنة." },
      { type: "fix", text: "✅ Defensive wrappers في `TreasuryPg.jsx` (saveTx + recurring): استدعاء autoPost.treasury دلوقتي مغلف بـtry/catch وفحص `typeof _r.then === 'function'` قبل أي `.catch()`. كده حتى لو حد ضاف method جديد للـautoPost ونسي يرجع Promise، saveTx مش هيتعطل." },
      { type: "fix", text: "📋 ملاحظة عامة: الـbug ده كان موجود من V18.35 (الإصدار اللي ضاف autoPost) في كل صفحة بتستدعي autoPost — HR + المبيعات + المشتريات + العملاء + الورش + الفواتير. الإصلاح في autoPost.js بيحمي كل الصفحات دي تلقائياً." },
    ]
  },
  {
    version: "V19.7",
    date: "2026-05-02",
    types: ["fix"],
    title: "🔔 رسالة واضحة عند رفض حفظ حركة الخزنة",
    changes: [
      { type: "fix", text: "🐛 رفض المبلغ صفر كان بصوت بيب فقط بدون أي رسالة مرئية، فالمستخدم كان يفتكر إن الحفظ نجح والمشكلة في التفريغ. أضفت toast واضح: '⛔ المبلغ مطلوب — اكتب قيمة أكبر من صفر'." },
      { type: "fix", text: "ملاحظة: بعد ما اتأكدنا في V19.8 إن السبب الحقيقي لمشكلة 'الحقول مش بتتفرغ' كان TypeError في autoPost (مش validation)، الإصلاح ده بيفضل مفيد كـUX — رسالة واضحة لما المبلغ صفر بدل البيب الصامت." },
    ]
  },
  {
    version: "V19.6",
    date: "2026-05-02",
    types: ["fix"],
    title: "🧹 وضع التكرار: تفريغ كل الحقول غير المثبتة بعد الحفظ",
    changes: [
      { type: "fix", text: "🐛 في sticky mode، حقل 'حساب جاري' و'الموسم' كانوا بيفضلوا بقيمتهم. أضفت setTxAccount + setTxSeason للـreset block. النتيجة: المتبقي المثبت بس هو نوع الحركة + التاريخ المثبت — أي حاجة تانية بترجع للافتراضي بعد كل حفظ." },
    ]
  },
  {
    version: "V19.5",
    date: "2026-05-02",
    types: ["improvement"],
    title: "📐 تصغير حجم كروت الصفحة الرئيسية (ديسكتوب) مع الحفاظ على الأيقونات",
    changes: [
      { type: "improvement", text: "🎯 المطلوب من المستخدم: تصغير الزر الأبيض للنص في الصفحة الرئيسية مع الحفاظ على حجم الأيقونة الداخلية، المسافات بين الكروت (طولياً وعرضياً)، والشكل المربع." },
      { type: "improvement", text: "🔧 التغيير: في App.jsx grid template للـtabs على الديسكتوب اتغير من `repeat(6, 1fr)` لـ `repeat(6, minmax(0, 130px))` (وعلى التابلت من `repeat(4, 1fr)` لـ `repeat(4, minmax(0, 130px))`). أضفت `justifyContent: 'center'` على الـgrid container عشان يتمركز بدل ما يلتصق على جنب." },
      { type: "improvement", text: "✅ المحفوظ كما هو: gap = 24px (المسافات بين الكروت)، aspectRatio: 1 (الشكل المربع)، padding داخلي '10px 8px'، أيقونة 44×44 وSVG 22×22، حجم نص الـlabel (FS-1). الموبايل والتابلت grids التانية مش متأثرين." },
      { type: "improvement", text: "📊 النتيجة: الكروت كانت بتاخد ~160-180px على شاشة عريضة (1fr بيوسعها)، دلوقتي محدودة على 130px فبتبان أكثر تماسكاً والمساحة البيضاء حواليها أقل، مع نفس حجم الأيقونة والكتابة." },
    ]
  },
  {
    version: "V19.4",
    date: "2026-05-02",
    types: ["fix"],
    title: "🛡️ منع تكرار حركات الخزنة عند الضغط المزدوج على زر الحفظ",
    changes: [
      { type: "fix", text: "🐛 المشكلة: في صفحة الخزنة، زر '💾 حفظ' حركة جديدة مكنش بيدّي feedback بصري لما يتضغط — لا spinner ولا loading ولا تغيير شكل. خصوصاً في وضع التكرار (sticky mode بـ30 حركة) النموذج بيفضل مفتوح بعد الحفظ مع reset للحقول، فالمستخدم مش حاسس إن الحركة اتسجلت → بيضغط الزر مرة تانية → بتتسجل حركة مكررة بنفس البيانات." },
      { type: "fix", text: "✅ الحل: state جديد `savingTx` بيقفل الزر للحظة. الـguard في بداية saveTx() بيتحقق من `savingTx` ويرجع فوراً لو فيه حفظ شغال. بعد الـvalidations، الـstate بيتعمل true ويـreset بعد 700ms (وقت كافي للـupConfig يكتب + النموذج يـreset، ومع ذلك مش متأخر يضايق المستخدم في سلسلة حركات)." },
      { type: "fix", text: "🎨 تحسين بصري: لما الزر مقفول بيظهر 'جاري الحفظ...' ⏳ بدل '💾 حفظ'، مع opacity:0.55 و pointerEvents:none. زر 'إلغاء' كمان بيتحقق من `savingTx` عشان مايقفلش النموذج وسط عملية حفظ. ده fix critical لإن تكرار حركة مالية = خطأ في الأرصدة." },
    ]
  },
  {
    version: "V19.3",
    date: "2026-05-02",
    types: ["fix", "improvement"],
    title: "🔥 إصلاح تكرار حركات الخزنة + تحديث القيد المحاسبي عند التعديل",
    changes: [
      { type: "fix", text: "🐛 المشكلة: لما المستخدم يعدّل تاريخ حركة خزنة، الحركة كانت بتتكرر — حركتين بنفس الـID وبنفس التاريخ الجديد. الأخطر: حذف واحدة منهم بيحذف الاتنين فعلياً (لأن الفلتر بيستهدف الـID). السبب الجذري: في الـsplit collections (treasuryDays/{YYYY-MM-DD}) لما التاريخ يتغير، الحركة بتتنقل من document قديم لـjديد. لو write القديم فشل ومفيش retry، الحركة بتفضل في الاتنين — والـflatten() في App.jsx مكنش بيدمّج عند الـID." },
      { type: "fix", text: "✅ Fix #1 (App.jsx flatten): أضفت dedup بـserverIds.has(id) قبل الـpush. الحركة المكررة في يومين الآن بتظهر مرة واحدة في الـUI (الأحدث، لأن sortedDays = DESC)." },
      { type: "fix", text: "✅ Fix #2 (TreasuryPg cleanup migration): useEffect بيتفعل مرة واحدة عند تحميل صفحة الخزنة، بيمسح كل documents في treasuryDays، بيكشف الحركات الموجودة في يومين أو أكثر، بيختار النسخة الأحدث (updatedAt → createdAt → date)، وبيحذف النسخ القديمة من الـday docs بتاعتهم. آمن وidempotent. توست تأكيد في الآخر." },
      { type: "fix", text: "✅ Fix #3 (saveTx edit reverse + re-post): قبل V19.3، تعديل مبلغ/تاريخ/تصنيف حركة كان بيخلي الـjournal entry القديم في دفتر اليومية بأرقامه القديمة — مشكلة محاسبية خطيرة في التقارير. الإصلاح: قبل التعديل بنcapture (sourceId, oldDate)، بعد التعديل بنعمل autoPost.reverse() للقيد القديم ثم autoPost.treasury() للقيم الجديدة." },
      { type: "fix", text: "✅ Fix #4 (App.jsx upConfigTx retry): syncAllSplitChanges + syncAllPartitionedChanges كانا بيـ-fail-silent من أول محاولة فقط. أضفت retry × 3 مع backoff (150ms × 2^attempt). بيمنع الـinconsistency اللي كان بيخلي حركة في يومين أصلاً." },
      { type: "fix", text: "✅ Fix #5 (UndoToast): رفعت z-index من 9998 → 10005 (فوق confirmPopup z-10001). أضفت console.log diagnostic عند استقبال undo جديد، عشان لو لسه فيه مشكلة في الظهور تبقى مرئية في الـDevTools." },
      { type: "improvement", text: "🔍 Diagnostic logging: لما الـflatten يلاقي ID مكرر في يومين، بيطبع warning في console (مرة واحدة لكل ID خلال الـsession). كده تقدر تأكد إن الـcleanup migration نجح." },
    ]
  },
  {
    version: "V19.2",
    date: "2026-05-02",
    types: ["fix", "improvement"],
    title: "🔧 إصلاح Auto-backup + توضيح حسابات الورش",
    changes: [
      { type: "fix", text: "🐛 Hotfix Auto-backup: في `utils/comprehensiveBackup.js` الـmetadata كانت بتتحفظ بـfield `errors: undefined` لما مفيش errors. Firestore بيرفض القيمة دي ويعمل error: 'Unsupported field value: undefined (found in field errors)'. الإصلاح: لو errors[] فاضية، الـfield مايتحطش أصلاً في الـmetadata object قبل ما نـsetDoc." },
      { type: "fix", text: "🐛 المشكلة: في تقرير 'حساب الورشة' الجدول كان بيعرض 'متوسط السعر' محسوب من التسليمات (مثلاً 17.93)، بينما 'القيمة' محسوبة من الاستلامات بأسعارها الفردية (مثلاً 140,700.5). ده كان بيخلي المستخدم يحسب 6,193 × 17.93 ويلاقي 111,040 — مش متطابق مع 140,700 المعروض." },
      { type: "improvement", text: "✅ الحل: شيلت عمود 'متوسط السعر' نهائياً من جدول 'القطع حسب النوع' في reports.jsx. خليت 'القيمة' بس وسميتها 'القيمة المستحقة' للوضوح. الـvalue المعروض = مجموع (qty × price) لكل استلام منفرد — ده المستحق الفعلي محاسبياً." },
      { type: "improvement", text: "📅 Timeline الحركات: أضفت عمود 'القيمة' لكل سطر = الكمية × السعر. الاستلامات بتعرض القيمة بلون أخضر، التسليمات تعرض '—' (لأنها مش مستحق فعلي بعد). صف إجمالي جديد في الآخر: 'إجمالي الاستلامات (المستحق)' بيجمع الكمية + القيمة للاستلامات فقط." },
      { type: "improvement", text: "📤 Excel + Print: نفس التغييرات مطبقة على التصدير وطباعة التقرير." },
      { type: "improvement", text: "📱 بورتال الورشة: ملاحظة توضيحية في تاب 'الملخص': 'كل عملية استلام لها سعرها الفردي · إجمالي حساب التشغيل = مجموع (الكمية × سعرها) لكل استلام'." },
      { type: "fix", text: "✅ تم تأكيد المنطق الحسابي في باقي النظام (ExtProdPg + DashPg + workshop-portal API): wsAccounts() بيحسب due = Σ (r.qty × r.price) لكل استلام منفرد ✅. الأرصدة كلها كانت دقيقة من الأساس — المشكلة كانت في عرض التقرير فقط." },
    ]
  },
  {
    version: "V19.0",
    date: "2026-05-02",
    types: ["feature", "improvement"],
    title: "🎯 بادج المرحلة التفاعلي + صورة افتراضية للموديلات",
    changes: [
      { type: "feature", text: "🎯 البادج بتاع المرحلة الحالية في كروت الأوردرات + صفحة تفاصيل الأوردر بقى **interactive**: ضيفنا سهم ▾ صغير + cursor:pointer + hover effect (scale 1.05 + shadow). الضغط بيفتح modal جديد بتفاصيل المرحلة لكل قطعة." },
      { type: "feature", text: "📊 Modal تفاصيل المرحلة: لكل قطعة (قميص/شورت/تيشيرت/إلخ) progress bar + النسبة + الكمية الحالية / الكمية الكلية. القطع المكتملة (100%) بلون أخضر، الأضعف بلون أحمر، الباقي برتقالي. الترتيب: الأضعف فوق (يبيّن الـbottleneck فوراً)." },
      { type: "feature", text: "🧮 المنطق per-piece: في 'تم القص' = 100% لكل قطعة. في 'في التشغيل' = Σ wd.qty للقطعة. في 'الطباعة'/'التطريز'/'تشطيب خارجي' = filter حسب نوع الورشة. في 'تشطيب وتعبئة' = Σ receives.qty (الرجوع من الورش). الـDenominator دائماً getPieceCutQty للقطعة." },
      { type: "feature", text: "✅ في 'تم التسليم لمخزن الجاهز' و 'في مخزن الجاهز جزئي': مفيش breakdown — رسالة بسيطة 'تم تسليم X طقم من Y'. للأوردر الملغي: رسالة 'الأوردر ملغي'." },
      { type: "feature", text: "⚠️ Footer في الـpopup: لو فيه قطعة أضعف من 100% → 'أضعف قطعة: X — ناقص N قطعة'. لو الكل 100% → '✅ كل القطع وصلت لـ100%'. هيدر الـpopup له gradient بنفس لون المرحلة + النسبة الكلية كبيرة (FS+8)." },
      { type: "feature", text: "🖼 Component جديد DefaultModelImg.jsx: لما الموديل مش عنده صورة، بدل ما يظهر الـicon القديم (📷)، بنعرض placeholder أنيق بنسبة 3:4 طولي فيه: أيقونة قطعة الملابس المناسبة (👕/👔/🩳/إلخ من اسم الموديل أو الـorderPieces) + رقم الموديل + 'بدون صورة'. خلفية gradient ناعمة + border متقطع." },
      { type: "improvement", text: "📐 الصور كلها في DetPg دلوقتي بنسبة 3:4 ثابتة: في table row، في mobile card، في صفحة التفاصيل (mobile + desktop). متناسق في كل الواجهات." },
      { type: "improvement", text: "🎨 Component جديد StageProgressModal.jsx: قابل لإعادة الاستخدام، Helper جديد getStageProgress() في utils/orders.js يحسب الـbreakdown باللوجيك المتقدم." },
    ]
  },
  {
    version: "V18.99",
    date: "2026-05-01",
    types: ["fix"],
    title: "🔧 إضافة التكاليف الإضافية للبطاقات العلوية وكروت قائمة الأوردرات",
    changes: [
      { type: "fix", text: "🚨 المشكلة: التكاليف الإضافية (هالك / تشغيل من القص للتعبئة / إلخ) كانت بتظهر صحيحة في جدول 'ملخص تكلفة الموديل' فقط، لكن مش بتنضاف لقيمة 'تكلفة القطعة' في البطاقة العلوية لصفحة الأوردر، ولا في كروت قائمة الأوردرات (سواء جدول الديسكتوب أو كروت الموبايل)." },
      { type: "fix", text: "✅ البطاقة العلوية لصفحة الأوردر: لو فيه تكاليف إضافية، الـlabel بيتغير لـ'تكلفة القطعة الفعلية' ولونها أصفر (#F59E0B)، والـsub label يوضح 'شامل تكاليف إضافية +X ج.م'. لو مفيش، بيفضل الـlabel الأصلي." },
      { type: "fix", text: "✅ كروت قائمة الأوردرات (الديسكتوب + الموبايل): قيمة 'التكلفة' دلوقتي شاملة التكاليف الإضافية + تكلفة التسوية (لو موجودة). تظهر بلون أصفر (#F59E0B) مع علامة (*) بدلاً من البنفسجي عشان تكون مميزة بصرياً، والـtooltip بيقول 'شامل تكاليف إضافية / تسوية'." },
      { type: "fix", text: "🔢 الحساب: لكل تكلفة إضافية: لو نوعها 'على القطعة' → بتنضاف للتكلفة لكل قطعة كما هي. لو نوعها 'إجمالي' → بيتم قسمتها على كمية القص. كلاهما يدعم backward compat (التكاليف القديمة بدون نوع تتعامل كـ'إجمالي')." },
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
