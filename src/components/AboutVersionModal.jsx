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
  {
    version: "V18.45",
    date: "2026-04-29",
    types: ["maintenance"],
    title: "إزالة 'حاسبة التكاليف' من الواجهة الرئيسية",
    changes: [
      { type: "maintenance", text: "🗑 حذف زر 'حاسبة التكاليف' من الشاشة الرئيسية وكل الكود المرتبط بيه — كان غير مُستخدم بشكل فعّال" },
      { type: "maintenance", text: "📁 حذف ملف الصفحة CalcPg.jsx بالكامل + الـlazy import + الـrouting في App.jsx + الـtab entry في LoginScreen" },
      { type: "improvement", text: "💡 ملاحظة: حسابات التكلفة في باقي النظام (P&L، تقارير، COGS) لم تتأثر — هي تستخدم calcOrder() utility المنفصلة وما زالت تشتغل عادي" },
      { type: "improvement", text: "⚡ بعد التحديث، الشاشة الرئيسية بقت أنظف بـ tab واحد أقل" },
    ]
  },
  {
    version: "V18.44",
    date: "2026-04-29",
    types: ["feature"],
    title: "ربط الخزائن والبنوك بشجرة الحسابات — رصيد كل خزنة على حدة",
    changes: [
      { type: "feature", text: "🏦 كارد جديد في الإعدادات: 'ربط الخزائن والبنوك بشجرة الحسابات' — لربط كل خزنة/بنك في النظام بحساب فرعي خاص بيه في الشجرة" },
      { type: "feature", text: "🚀 إنشاء تلقائي ذكي: زر 'معاينة الخطة' يعرض الحسابات اللي هتُنشأ (1111 لـMAIN CASH، 1112 لـSUB CASH، 1121 لـCIB BANK، إلخ) قبل التأكيد" },
      { type: "feature", text: "✏️ ربط يدوي: لكل خزنة dropdown لاختيار الحساب الفرعي المناسب — تقدر تربط أكتر من خزنة بنفس الحساب أو تترك بعضها بدون ربط" },
      { type: "feature", text: "📊 رصيد كل خزنة في ميزان المراجعة بقى منفصل: MAIN CASH (1111) + SUB CASH (1112) بدلاً من رصيد كلي تحت 1110" },
      { type: "feature", text: "🌳 الحسابات المُنشأة تلقائياً تكون كـsiblings تحت 1100 (مش children تحت 1110) — يحافظ على 1110/1120 كـfallback للعمليات القديمة" },
      { type: "feature", text: "⚠️ كشف ربطات مهجورة (orphans): لو حذفت خزنة أو حساب، الكارد بيظهر تحذير + زر تنظيف" },
      { type: "improvement", text: "💰 الـAuto-post بقى ذكي: كل عملية كاش/بنك (دفعة عميل، دفعة ورشة، راتب، تحصيل شيك، حركة خزينة عامة) بترحل لحساب الخزنة الصحيح بناءً على tx.account" },
      { type: "improvement", text: "🔄 الـBackfill بقى يربط القيود الأثرية بالحسابات الصحيحة عبر الـmapping — مفيش حاجة تحتاج migration يدوي" },
      { type: "improvement", text: "🛡️ Backward compat: الخزائن غير المربوطة تستخدم 1110/1120 كـfallback — مفيش failures حتى لو ما عملتش mapping" },
      { type: "improvement", text: "💡 الـcustomer payment record بقى يحفظ account field على الـpayment نفسه (مش بس على الـtreasury tx) — توفير lookup في الـauto-post" },
    ]
  },
  {
    version: "V18.43",
    date: "2026-04-29",
    types: ["fix", "improvement"],
    title: "إصلاح: قائمة اختيار الحسابات بقت تظهر في كل الأماكن",
    changes: [
      { type: "fix", text: "🚨 إصلاح: قائمة اختيار الحسابات (في القيد اليدوي + إعدادات الترحيل + الأرصدة الافتتاحية + قيد الإقفال) كانت بتطلع تحت الشاشة في معظم الأحيان لأن الـmodal بيقص الـoverflow" },
      { type: "improvement", text: "🪟 React Portal: القائمة بقت تطلع على الـbody مباشرة، خارج كل الـmodals والـcontainers — ما تتأثرش بأي overflow:hidden" },
      { type: "improvement", text: "📐 Smart positioning: لو مفيش مساحة كافية تحت زرار الاختيار، القائمة بتقلب وتطلع فوق تلقائياً" },
      { type: "improvement", text: "📏 Adaptive height: لو المساحة المتاحة أقل من 340px، القائمة بتقلّص ارتفاعها تلقائياً (بحد أدنى 180px) عشان تظهر كاملة" },
      { type: "improvement", text: "🔄 Reposition on scroll: لما تـscroll أو تغير حجم النافذة، القائمة بتعيد حساب موقعها وتفضل ملتصقة بالـtrigger" },
      { type: "improvement", text: "🎯 ينطبق على كل الأماكن اللي بتستخدم AccountSelector: قيد يومية جديد، إعدادات قواعد الترحيل، الأرصدة الافتتاحية، قيد إقفال الفترة" },
    ]
  },
  {
    version: "V18.42",
    date: "2026-04-29",
    types: ["fix", "improvement"],
    title: "إصلاح حرج: صفحة المحاسبة + تحسين ليبل التسليم الملخص",
    changes: [
      { type: "fix", text: "🚨 إصلاح حرج: صفحة المحاسبة كانت بترمي 'حدث خطأ غير متوقع' عند فتحها — السبب كان `export default` بدلاً من named export، والـlazyNamed بيدور على named فقط فبيرجع undefined → React error #306" },
      { type: "fix", text: "✅ تغيير AccountingPg إلى named export ليتوافق مع باقي الصفحات في النظام — كل تبويبات المحاسبة بقت تشتغل (شجرة الحسابات، اليومية، ميزان المراجعة، القوائم المالية، كشف الحساب، الإعدادات)" },
      { type: "improvement", text: "🚚 ليبل تسليم العملاء (وضع الملخص لـ>8 أصناف): استبدال 'التاريخ' بـ'عدد الشحنات' — التاريخ موجود في الهيدر فوق، أما عدد الشحنات معلومة مفيدة عند التسليم" },
      { type: "improvement", text: "📈 تكبير صف 'عدد الشحنات' في الملخص: خلفية صفراء + خط 16pt للقيمة + إطار مميز فوقه — يظهر بوضوح للسائق والعميل" },
      { type: "improvement", text: "💬 صياغة عربية ذكية: 'شحنة' للمفرد و'شحنات' للجمع تلقائياً" },
    ]
  },
  {
    version: "V18.41",
    date: "2026-04-29",
    types: ["feature"],
    title: "تعدد العملات (Multi-Currency) — IFRS / IAS 21",
    changes: [
      { type: "feature", text: "💱 نظام عملات متكامل: العملة الأساسية (EGP) ثابتة + قائمة عملات أجنبية قابلة للإضافة (USD, EUR, SAR, AED, GBP)" },
      { type: "feature", text: "📊 جدول أسعار صرف بالتاريخ — لكل عملة سجل من الأسعار، النظام يستخدم أحدث سعر متاح ≤ تاريخ العملية" },
      { type: "feature", text: "📔 قيد يومية بعملات متعددة: لكل سطر اختر العملة + المبلغ بالعملة الأجنبية + سعر الصرف، النظام يحسب القيمة بـEGP تلقائياً" },
      { type: "feature", text: "🏛️ Functional Currency = EGP — كل القوائم المالية (الدخل، المركز، التدفقات، ميزان المراجعة) تُعرض بـEGP وفقاً للمعيار IAS 21" },
      { type: "feature", text: "💰 حسابات FX جديدة في الشجرة الافتراضية: '4910 فرق صرف عملة (مكاسب)' + '5910 فرق صرف عملة (خسائر)'" },
      { type: "feature", text: "🌍 كارد 'العملات المُعتمدة' في الإعدادات — إضافة/حذف عملات + زر 'إضافة العملات الافتراضية'" },
      { type: "feature", text: "📅 كارد 'أسعار صرف العملات' — إضافة سعر صرف لكل (عملة, تاريخ) + تعديل + حذف" },
      { type: "feature", text: "🔍 عرض السطور بالعملة الأجنبية في دفتر اليومية: badge 💱 USD 1000 × 50.5 تحت كل سطر بعملة غير EGP" },
      { type: "improvement", text: "🛡️ Validation شامل: كود ISO صحيح (3 حروف)، عملة أساسية واحدة فقط، منع تكرار الأكواد" },
      { type: "improvement", text: "🔄 توافق خلفي تام: لو مفيش عملات أجنبية مُعرّفة، النظام يشتغل بـEGP فقط زي قبل الكدا — تعدد العملات opt-in" },
      { type: "improvement", text: "💾 حفظ الـfcAmount + fcCurrency + fxRate على كل سطر — Audit trail كامل لمصدر القيمة بالـEGP" },
    ]
  },
  {
    version: "V18.40",
    date: "2026-04-29",
    types: ["feature"],
    title: "تكلفة البضاعة المباعة (COGS) — قائمة الدخل بقت دقيقة 100%",
    changes: [
      { type: "feature", text: "💰 ربط المخزون بالمحاسبة: كل بيعة بقت تنتج قيدين متلازمين — قيد الإيرادات + قيد تكلفة البضاعة المباعة (Dr COGS / Cr مخزون منتج تام)" },
      { type: "feature", text: "📊 قائمة الدخل بقت تعرض الربح الفعلي: الإيرادات − تكلفة البضاعة المباعة = مجمل الربح، بدلاً من إجمالي الإيرادات بدون cost" },
      { type: "feature", text: "🎯 3 خيارات لمصدر التكلفة: تلقائي (الأولوية لـ costPrice) / يدوي (costPrice فقط) / محسوب (calcOrder().costPer من القماش + الإكسسوار + الورشة)" },
      { type: "feature", text: "↩️ المرتجعات بترجّع التكلفة تلقائياً: Dr مخزون منتج تام / Cr COGS — ميزانية متوازنة" },
      { type: "feature", text: "📦 حساب جديد '5130 تكلفة البضاعة المباعة (مبيعات)' في الشجرة الافتراضية — منفصل عن '5110 تكلفة الخامات' و'5120 أجور تشغيل خارجي' للمرونة" },
      { type: "feature", text: "🚀 الـbackfill بقى يولّد قيود COGS للبيعات والمرتجعات السابقة — اضغط 'ترحيل القيود الأثرية' بعد التفعيل لتطبيق على التاريخ" },
      { type: "feature", text: "⚙️ كارد جديد في الإعدادات: 'تكلفة البضاعة المباعة' — toggle + اختيار مصدر التكلفة + إرشادات" },
      { type: "improvement", text: "🛡️ skip ذكي: الأوردرات اللي مفيش لها تكلفة (لا costPrice ولا قيمة محسوبة) بتطّى بدون قيد COGS — مفيش failures" },
      { type: "improvement", text: "✅ idempotent: sourceId منفصل لقيد COGS (':cogs' suffix) — تكرار التشغيل بيعمل update بدلاً من duplicate" },
      { type: "improvement", text: "📝 السعر اللحظي: تعديل costPrice بعد البيع ميأثرش على القيود المرحّلة بالفعل — لازم تعمل reverse + re-post للتحديث" },
    ]
  },
  {
    version: "V18.39",
    date: "2026-04-29",
    types: ["feature"],
    title: "كشف حساب طرف موحد من القيود المحاسبية",
    changes: [
      { type: "feature", text: "👥 تبويب جديد 'كشف حساب طرف' داخل المحاسبة — كشف حساب موحد لأي عميل/ورشة/موظف من القيود مباشرة" },
      { type: "feature", text: "📋 الكشف يعرض كل الحركات بترتيب تاريخي مع رصيد تراكمي محسوب طبيعياً (assets vs liabilities) + بيان مرجع كل قيد + الحساب المتأثر" },
      { type: "feature", text: "🔍 بحث ذكي بالاسم لاختيار الطرف + 3 أنواع: عميل (👤) / ورشة (🏭) / موظف (💼)" },
      { type: "feature", text: "📅 فلتر فترة + خيار 'كل الحركات' لعرض الكشف الكامل من بداية النظام" },
      { type: "feature", text: "📊 4 بطاقات إحصائية في الأعلى: إجمالي مدين، إجمالي دائن، الرصيد (مدين له/دائن له)، عدد الحركات" },
      { type: "feature", text: "🖨 طباعة احترافية لكشف الحساب بـletterhead المصنع + توقيعات + تصدير PDF — مناسب للإرسال للعميل" },
      { type: "improvement", text: "💡 الكشف من القيود = single source of truth — يعكس أي تعديل يدوي في القيود بشكل دقيق (بدلاً من بناء الكشف من custPayments + customerDeliveries مباشرة)" },
      { type: "improvement", text: "🎯 منطق ذكي: للعملاء (asset-side) الرصيد الموجب = مدين له، للورش/الموردين (liability-side) الرصيد الموجب = دائن له" },
    ]
  },
  {
    version: "V18.38",
    date: "2026-04-29",
    types: ["feature"],
    title: "لوحة أخطاء الترحيل المحاسبي + إعادة المحاولة الذكية",
    changes: [
      { type: "feature", text: "⚠️ لوحة 'أخطاء الترحيل المحاسبي' في الإعدادات — أي عملية بتفشل في الترحيل التلقائي بتتسجل تلقائياً مع التفاصيل الكاملة" },
      { type: "feature", text: "🔁 زر 'إعادة المحاولة' لكل خطأ بعد إصلاح السبب (مثلاً ضبط القاعدة الناقصة) + زر 'إعادة محاولة الكل' بـprogress bar" },
      { type: "feature", text: "🏷️ تصنيف ذكي للأخطاء: شجرة فارغة، حساب مفقود، حساب غير فرعي، قيد غير متوازن، خطأ اتصال — لكل تصنيف تلميح بكيفية الإصلاح" },
      { type: "feature", text: "🔔 بادج تحذيري في رأس صفحة المحاسبة بيظهر عدد الأخطاء غير المحلولة + click للذهاب للإعدادات مباشرة" },
      { type: "feature", text: "💼 زر 'تجاهل' لكل خطأ — لو العملية الأصلية اتمسحت أو مش هتتسجل محاسبياً" },
      { type: "improvement", text: "🎯 idempotent: نفس الخطأ بيتسجل مرة واحدة بـcounter للمحاولات — مفيش duplicates في القائمة" },
      { type: "improvement", text: "🧹 cap تلقائي على القائمة (أحدث 200 خطأ) لمنع تضخم البيانات + زر 'تنظيف الأخطاء المحلولة' للأرشيف" },
      { type: "improvement", text: "📊 الترحيل التلقائي بقى أكثر شفافية — مفيش failures صامتة في الـconsole، كل خطأ يطلع للمستخدم" },
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
