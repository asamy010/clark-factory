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
  {
    version: "V18.91",
    date: "2026-05-01",
    types: ["feature"],
    title: "📌 توسعة 'طلب مراجعة' + إشعار التحويلات بين الخزن",
    changes: [
      { type: "feature", text: "💸 تحويلات الخزن: لما مستخدم غير admin يطلب تحويل، يطلع إشعار تلقائي للأدمن في الـgreeting bar (chip أحمر 'مهمة عاجلة') مع زر 'فتح'. الضغط بيوصل لصفحة الخزنة → تاب 'التحويلات' → بيتحرك للسطر بتاع الطلب مع تأثير highlight أصفر لمدة 2.5 ثانية. عند الموافقة أو الرفض، الـchip بيختفي تلقائياً عند جميع الأدمن (endedAt)." },
      { type: "feature", text: "🛡️ Schema جديد: notification.forAdminsOnly = true → الـchip يظهر للأدمن فقط (مفلتر في App.jsx). يستخدم في تحويلات الخزن وأي حاجة محتاجة موافقة admin مستقبلاً." },
      { type: "feature", text: "👷 المرتبات: زر '📌 مراجعة' جديد على كل بطاقة أسبوع. يفتح modal طلب المراجعة مع الـlink للأسبوع. الضغط على الإشعار عند المستلم → يفتح الأسبوع تلقائياً (setView('weeks') + setOpenWeekId)." },
      { type: "feature", text: "🏭 الورش: عمود جديد '📌' في جدول حسابات الورش (تشغيل خارجي → حسابات الورش). الضغط بيفتح modal طلب المراجعة لهذه الورشة. الإشعار عند المستلم بيفتح صفحة الورش وبيـfilter على اسم الورشة المعنية." },
      { type: "improvement", text: "🔄 routing موسّع في handleNotifLinkClick: 5 أنواع مدعومة الآن — invoice (sales/purchase) + order + treasury (transfer_pending) + workshop + hrWeek. كل واحد له payload مخصص للـdeep-link." },
      { type: "improvement", text: "✅ النظام كامل دلوقتي: المستخدم يقدر يطلب مراجعة من 6 أماكن: فواتير المبيعات + فواتير المشتريات + الأوردرات + الخزنة (تحويلات تلقائية) + الورش + المرتبات. كل طلب → notification مع link → الضغط → ينقل للوجهة بالظبط." },
    ]
  },
  {
    version: "V18.90",
    date: "2026-05-01",
    types: ["feature"],
    title: "📌 نظام طلب مراجعة (Mention/Deep-link) — المرحلة 1",
    changes: [
      { type: "feature", text: "📌 زر '📌 طلب مراجعة' جديد في 3 أماكن: فواتير المبيعات + فواتير المشتريات + صفحة الأوردر. الضغط بيفتح modal لاختيار المستخدم المستلم + كتابة رسالة + اختيار النوع (طلب/مهمة/عاجل) + مدة العرض. عند الإرسال: يبعت notification للمستلم بـlink للوجهة." },
      { type: "feature", text: "🔗 الـnotification في الـgreeting bar (V18.87) بقت تعرض badge جديد '🔗 فتح [الوجهة]' لو الـnotification فيها link. الضغط على الـchip → routing تلقائي للصفحة + فتح الفاتورة/الأوردر مباشرة." },
      { type: "feature", text: "⚙️ Schema موسّع: notification.link = {type, id, subType?, label}. الأنواع المدعومة في V18.90: invoice (sales/purchase) + order. الأنواع treasury/workshop/hrWeek محجوزة لـV18.91." },
      { type: "feature", text: "👮 الـadmin يقدر يحول طلب لأي حد. كل المستخدمين يقدروا يحوّلوا لأي حد آخر — بدون قيود (الصلاحيات بتحدد لو المستلم يقدر يفتح الوجهة بعد الـrouting)." },
      { type: "improvement", text: "🎨 Hover effect على الـchip اللي فيه link (scale 1.03)، cursor: pointer، tooltip يقول 'اضغط للذهاب لـX'. الـchips بدون link مش clickable (cursor: default)." },
      { type: "improvement", text: "📲 يستخدم نفس الـinfrastructure للإشعارات من V18.87 (expiresAt + endedAt + readBy + dismissedBy + duration). مفيش data structures جديدة، بس field واحد إضافي." },
      { type: "improvement", text: "🔒 الـrouting بيستخدم window.dispatchEvent('notif-deeplink') مع setTimeout 150ms عشان يستنى الـtab يـmount قبل ما يفتح الـmodal." },
    ]
  },
  {
    version: "V18.89",
    date: "2026-05-01",
    types: ["feature"],
    title: "📲 تفاصيل القطع في رسالة WhatsApp للأوردر",
    changes: [
      { type: "feature", text: "📌 إضافة قسم 'تفاصيل القطع' في رسالة WhatsApp اللي بتطلع من زر 'تفاصيل + تايم لاين' في صفحة الأوردر. لكل قطعة (قميص، شورت، إلخ) بيظهر: كمية القص + كمية التشغيل (المسلَّم للورش) + كمية المتاح للتسليم على الأرض. مفيد جداً لمتابعة كل قطعة على حدة بدل الإجمالي." },
      { type: "feature", text: "🎨 الأيقونة بتتعرَّف تلقائياً (👕 قميص، 🩳 شورت، 🧥 جاكيت، 👖 بنطلون، إلخ). الـformat: '👕 قميص: قص 624 - تشغيل 0 - متاح للتسليم 0'." },
      { type: "improvement", text: "✅ القسم بيظهر فقط للموديلات اللي فيها أكتر من قطعة (orderPieces.length > 1) — للموديلات بقطعة واحدة أو القديمة بدون orderPieces بيتجاهل عشان مفيش قيمة مضافة." },
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
