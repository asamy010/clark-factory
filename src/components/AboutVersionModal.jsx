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
  {
    version: "V18.98",
    date: "2026-05-01",
    types: ["feature", "improvement"],
    title: "💰 التكاليف الإضافية: نوع التكلفة (إجمالي / على القطعة) + إخفاء بطاقات اليوم في الحركات المتكررة",
    changes: [
      { type: "feature", text: "🔢 تصنيف جديد لكل تكلفة إضافية: 'مبلغ إجمالي' (📦) أو 'على القطعة' (🔢). الـtoggle بطاقتين بصرية في الـmodal، الافتراضي: 'مبلغ إجمالي' (للحفاظ على البيانات القديمة)." },
      { type: "feature", text: "📦 'مبلغ إجمالي': المبلغ المُدخَل = إجمالي التكلفة، يُقسم تلقائياً على كمية القص للحصول على تكلفة القطعة. مناسب لـ: نقل، إصلاح ماكينة، مصاريف عامة." },
      { type: "feature", text: "🔢 'على القطعة': المبلغ المُدخَل = سعر القطعة الواحدة، يُضرب في كمية القص للحصول على الإجمالي. مناسب لـ: تشغيل من القص للتعبئة، عمولة، كوي." },
      { type: "improvement", text: "🏷️ Badge مميز في كل صف من جدول التكاليف الإضافية: '📦 إجمالي' (بنفسجي) أو '🔢 على القطعة' (أخضر). يظهر بجانب اسم التصنيف عشان المستخدم يفرق بصرياً بين النوعين." },
      { type: "improvement", text: "📊 جدول 'ملخص تكلفة الموديل' دلوقتي يعرض الـ2 قيمتين بشكل صحيح في صف التكلفة الإضافية: عمود 'التكلفة الكلية' + عمود 'تكلفة القطعة'. الحساب صح بغض النظر عن نوع التكلفة المُدخَلة." },
      { type: "improvement", text: "🔄 Backward compatibility: التكاليف القديمة بدون `costType` يتم اعتبارها 'مبلغ إجمالي' تلقائياً (نفس السلوك القديم) — الأرقام مش هتتغير عند فتح الأوردرات القديمة." },
      { type: "improvement", text: "💡 المعاينة الفورية في الـmodal: لما تُدخل المبلغ، تظهر فوراً 'التكلفة الكلية' و 'تكلفة القطعة' محسوبة قبل ما تحفظ — تساعدك تتأكد من الأرقام قبل الإضافة. label الحقل يتغير ديناميكياً ('سعر القطعة' أو 'المبلغ الإجمالي') حسب النوع المختار." },
      { type: "improvement", text: "🗑 إخفاء بطاقات اليوم (وارد / منصرف / صافي / يوم + طباعة + PDF + واتساب) في تاب 'الحركات المتكررة' في الخزنة — مالهاش معنى في تاب الحركات الدورية المجدولة." },
    ]
  },
  {
    version: "V18.96",
    date: "2026-05-01",
    types: ["fix"],
    title: "🔧 منع wrap الـchips لما النصوص تطول",
    changes: [
      { type: "fix", text: "🚨 المشكلة: لما النصوص في الـchips طويلة + فيه زر '+N إشعار آخر'، الإجمالي بيكون أعرض من المساحة المتاحة، فالسطر بيتلف لتحت → الـgreeting bar يكبر ارتفاعه ويكسر الـlayout." },
      { type: "fix", text: "✅ الإصلاح: الـchips دلوقتي بيـshrink (تتقلص في العرض) بدل ما يـwrap. كل chip له min-width معقول (140px ديسكتوب، 110px موبايل) ومايقدرش يصغر أكتر من كده. النص جوه الـchip بيـtruncate أولاً بـellipsis (...) لما المساحة تقل." },
      { type: "fix", text: "🔒 الـouter greeting bar اتغير من `flexWrap:wrap` → `flexWrap:nowrap` لمنع الـwrap على مستوى الـbar نفسه. الـtext في 'مرحبا، X' و التاريخ كمان بقوا `whiteSpace:nowrap`." },
      { type: "fix", text: "🎯 الأولويات في الـshrink: النص نفسه يـtruncate أولاً (flex:1, minWidth:30) → بعدين الـ'— من X' يختفي على الموبايل (display:none لو isMob) → 'إنهاء' و '+N' بيفضلوا في حجمهم الكامل دائماً (flexShrink:0). الـtitle (tooltip) فيه النص الكامل + المرسل لو حد عاوز يقراه كامل." },
    ]
  },
  {
    version: "V18.95",
    date: "2026-05-01",
    types: ["improvement"],
    title: "📅 نقل بطاقة الموسم للتوب بار",
    changes: [
      { type: "improvement", text: "📅 بطاقة 'الموسم: S26' اتنقلت من الـgreeting bar إلى التوب بار العلوي (يمين الجرس مباشرة). كان شكلها بيلف لتحت لما الإشعارات تكون كتيرة، والـgreeting bar بيكبر ارتفاعه ويكسر الـlayout. دلوقتي الـgreeting bar صف واحد ثابت دائماً." },
      { type: "improvement", text: "🎨 شكل البادج الجديد: لون أخضر داخل التوب بار البنفسجي للتباين الواضح، أيقونة تقويم 12px، نص بـfontWeight 800. على الموبايل بيظهر مختصر '📅 S26' بدل 'الموسم: S26' عشان يـfit في الـtopbar الضيق." },
      { type: "improvement", text: "📱 الترتيب الجديد في التوب بار من اليمين لشمال: المستخدم → الجرس → 📅 الموسم → v18.95 → البحث → CLARK → الصفحة الرئيسية." },
    ]
  },
  {
    version: "V18.94",
    date: "2026-05-01",
    types: ["feature", "improvement"],
    title: "📥 تطوير شامل للإشعارات + إنهاء الطلب من صفحة الوجهة",
    changes: [
      { type: "improvement", text: "🔍 تكبير الـchip في الـgreeting bar: النص من FS-1 → FS+1 (أكبر بـ2 درجة)، الأيقونة من FS → FS+3، الـpadding من 5/10 → 8/14. النتيجة: الإشعارات بقت أوضح وأبرز." },
      { type: "feature", text: "📐 ارتفاع الـgreeting bar ثابت دائماً: بدلاً من أن يكبر مع كل إشعار جديد ويكسر الـlayout، البار دلوقتي يعرض أول 2 chips فقط (أو 1 على الموبايل) + زر '+N إشعارات أخرى'. الـlayout متناسق بغض النظر عن عدد الإشعارات." },
      { type: "feature", text: "📥 Popup الإشعارات الكاملة: الضغط على زر '+N إشعارات' يفتح modal شامل فيه كل الإشعارات النشطة كـcards مفصلة. كل إشعار له: الأيقونة + النص الكامل + المرسل + الوقت المتبقي + النوع + كل الـactions (فتح + إنهاء + إخفاء). max-height 82vh مع scroll." },
      { type: "feature", text: "⏹ Banner 'إنهاء طلب المراجعة' داخل صفحة الوجهة (نقطة د من المتطلبات): لما تكون أنت اللي بعت طلب مراجعة على فاتورة/أوردر/ورشة/أسبوع وفتحت الصفحة دي، بيظهر banner أصفر فوق التفاصيل بنص الرسالة + 'منذ ساعة و23 دقيقة' + زر '⏹ إنهاء طلب المراجعة'. الضغط ينهي الطلب عند الكل (المستلم + الأدمن)." },
      { type: "improvement", text: "🎨 Banner شغال في 4 أماكن: فواتير المبيعات + فواتير المشتريات + الأوردرات (DetPg) + الورش (per-workshop في accounts view) + المرتبات (داخل الأسبوع المفتوح). الـlogic: يظهر فقط لو fromEmail===me + link.id===currentEntity + !endedAt + !expired." },
      { type: "improvement", text: "🆕 component جديد ReviewRequestBanner.jsx — معاد استخدامه في كل الصفحات. يفلتر الـnotifications تلقائياً ويعرض الـbanner لو فيه match. مع formatting احترافي للزمن (الآن، منذ 5 دقيقة، منذ ساعة و23 دقيقة، منذ يوم و3 ساعات)." },
    ]
  },
  {
    version: "V18.93",
    date: "2026-05-01",
    types: ["fix"],
    title: "🚨 Hotfix: React error #310 عند بداية فتح التطبيق",
    changes: [
      { type: "fix", text: "🚨 Bug حرج كان بيمنع التطبيق من الفتح خالص. السبب: الـuseState و useEffect المضافة في V18.87 (notification ticker) كانوا موضوعين بعد الـearly returns الخاصة بـauthLoading + dataLoading. لما الـauth بيخلص → عدد الـhooks بيتغير من render لتاني → React بيـcrash بـerror #310 ('Rendered more hooks than during the previous render')." },
      { type: "fix", text: "✅ الإصلاح: نقل `useState(_notifTick)` + `useEffect(ticker)` إلى أعلى الـcomponent — قبل أي early return — عشان عدد الـhooks يبقى ثابت في كل render. الـticker دلوقتي بيشتغل دايماً (بدون شرط على subBarNotifs.length) لأن setState برخيص ولا يكلف شيء." },
      { type: "fix", text: "🔍 ده bug rules-of-hooks كلاسيكي. القاعدة: كل الـhooks (useState, useEffect, useRef, useMemo, useCallback) لازم تتنفذ بنفس الترتيب وبنفس العدد في كل render. الـearly returns بتعمل branches غير متجانسة تـviolate القاعدة دي." },
    ]
  },
  {
    version: "V18.92",
    date: "2026-05-01",
    types: ["fix", "improvement"],
    title: "🔧 4 إصلاحات Mobile UX (الخزنة + الأوردر + المرتبات)",
    changes: [
      { type: "fix", text: "💰 الخزنة: تابات الحسابات (MAIN CASH / SUB CASH / CIB / بنك...) كانت بـ`flex:1` فبتـSquish وتقطّع على الموبايل. الإصلاح: على الموبايل بقت قابلة للـscroll أفقي مع `flex:0 0 auto` لكل تاب + `overflowX:auto` على الـwrapper + `WebkitOverflowScrolling:touch` للسلاسة. الديسكتوب محفوظ بشكله." },
      { type: "fix", text: "📋 الأوردر: التايم لاين (4 مراحل: القص → في التشغيل → تشطيب → مخزن) كان متمدد خارج الشاشة من اليمين على الموبايل. الإصلاح: `minWidth: phases.length * 110px` على Timeline component + `WebkitOverflowScrolling:touch` على الـwrapper. دلوقتي الـtimeline قابل للـscroll أفقي بسلاسة." },
      { type: "improvement", text: "🎨 الأوردر: جدول تكاليف الإكسسوار (شماعة/كباسين/كفر) كان مزحوم ومتداخل. الإصلاح: عرض ثابت لكل عمود (50%/22%/28%)، padding أكبر (10-12px)، أحجام نصوص متفاوتة للوضوح، صف الإجمالي بـborder-top مميز، عمود السعر اتسمى 'سعر القطعة' بدل 'السعر' للوضوح، الأرقام بـwhite-space:nowrap عشان مايتقطعش." },
      { type: "improvement", text: "👷 المرتبات: شبكة التابات الـ6 على الموبايل اتعملت redesign كامل (الخيار أ من الـ3 mockups المقترحة). كل تاب دلوقتي بطاقة مربعة (78px) فيها: أيقونة 22px على الفوق، تحتها label مختصر، والـbadge منفصل في الـtop-left كـpill صغير دائري. الـactive tab بـbackground أزرق + أيقونة+نص أبيض + badge أبيض ب text أزرق. شكل احترافي زي تطبيقات iOS." },
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
