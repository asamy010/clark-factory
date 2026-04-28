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
    version: "V18.0",
    date: "2026-04-28",
    types: ["feature", "fix", "improvement"],
    title: "نظام البنوك + popups تأكيد للشيكات + ربط الشيكات بالحركات",
    changes: [
      { type: "feature", text: "🆕 قائمة بنوك في تاب الحسابات بالخزنة — أضف بنوكك (الأهلي، CIB، QNB، إلخ) وتظهر تلقائياً في قائمة البنك عند إضافة شيك جديد" },
      { type: "feature", text: "إمكانية تعديل وحذف البنوك. منع حذف بنك مستخدم في شيكات (يطلع رسالة بعدد الشيكات المرتبطة)" },
      { type: "improvement", text: "حقل البنك في فورم الشيك بقا dropdown يعرض البنوك المسجلة + خيار 'أخرى' للكتابة اليدوية لو الـbank مش في القائمة" },
      { type: "feature", text: "🆕 popup تأكيد عند تحصيل شيك القبض — يسأل: على أي حساب تودع المبلغ؟ يعرض كل الخزائن (رئيسية/فرعية/أي حساب مسجل) + كل البنوك المسجلة" },
      { type: "feature", text: "🆕 popup تأكيد عند صرف شيك الدفع — يسأل: من أي حساب يخصم المبلغ؟ نفس الخيارات" },
      { type: "improvement", text: "بعد اختيار الحساب، يطلع popup تأكيد ثاني يعرض الملخص قبل التنفيذ النهائي (مبلغ + جهة + الحساب)" },
      { type: "improvement", text: "popup تأكيد لكل تغيير حالة شيك: تحصيل / دفع / مرتد / مرتجع / تظهير / حذف — مفيش تغيير حالة بدون تأكيد" },
      { type: "improvement", text: "الحساب المختار يتسجل في الشيك (depositAccount) عشان نقدر نعرضه بعدين" },
      { type: "fix", text: "🚨 إصلاح bug خطير: لو الـuser حذف حركة الخزنة المرتبطة بشيك من مكان آخر (مثلاً تجاوز قفل، reset قديم، إلخ)، الشيك كان يفضل status='محصل/مدفوع/مُظهّر' مع إنه مفيش حركة فعلية" },
      { type: "fix", text: "Reconciliation تلقائي: لما تفتح صفحة الخزنة، النظام بيفحص كل الشيكات. لو لقى شيك بحالة محصل/مدفوع بدون حركة خزنة، يرجعه تلقائياً لـ'معلق' ويوضّح السبب (autoRevertReason)" },
      { type: "fix", text: "نفس الـreconciliation للشيكات المُظهّرة: لو دفعة المورد المرتبطة محذوفة، الشيك يرجع لمعلق" },
      { type: "improvement", text: "تأكيد منع حذف الشيك لو مرتبط بحركة خزنة (موجود من V16.65) — الـuser لازم يرجع الحالة لمعلق أولاً" },
      { type: "improvement", text: "تأكيد منع حذف حركة الخزنة المرتبطة بشيك (موجود من V16.65) — الـuser لازم يحذف الشيك من تابه" },
    ]
  },
  {
    version: "V17.9",
    date: "2026-04-28",
    types: ["feature", "improvement"],
    title: "Tabs لصفحة المبيعات + رابط عام للورشة",
    changes: [
      { type: "feature", text: "🆕 صفحة المبيعات بقت بـTabs بدل ما الأقسام تكون متراصة فوق بعض — Tabs ظاهرة: 📦 سجل التسليمات، ↩️ سجل المرتجعات، 📋 جرد المبيعات، ⚠️ موديلات راكدة" },
      { type: "feature", text: "كل تاب يعرض العداد بتاعه بجانب اسمه (مثلاً 'سجل المرتجعات (3 عميل، 196 قطعة)')" },
      { type: "feature", text: "تاب 'موديلات راكدة' يختفي تلقائياً لو مفيش موديلات راكدة" },
      { type: "improvement", text: "تاب الموديلات الراكدة بقا يعرض القائمة كاملة بدل أحدث 5 — مع زر طباعة" },
      { type: "improvement", text: "Mobile-friendly: الـtabs تتفاف على شاشتين في الموبايل بدل ما تكسر التصميم" },
      { type: "feature", text: "🆕 رابط عام للورشة (مثل رابط العميل) — بدون تسجيل دخول، يعرض حساب الورشة كامل بـHMAC signature" },
      { type: "feature", text: "صفحة الورشة تعرض: المستحق، المدفوع، الرصيد، عدد القطع تحت التشغيل، حد الدفع الأسبوعي بناءً على نسبة الاتفاق (payPercent)" },
      { type: "feature", text: "4 تابات في صفحة الورشة: 📊 الملخص، 📤 تسليم للورشة، 📥 استلام من الورشة (مع الأسعار والقيمة)، 💰 المدفوعات" },
      { type: "feature", text: "زر '📱 رابط حساب الورشة' في كارت كل ورشة خارجية في 'قاعدة البيانات → الورش' — توليد + نسخ + إرسال واتساب" },
      { type: "feature", text: "API endpoints جديدة: POST /api/workshop-portal-sign + GET /api/workshop-portal" },
      { type: "improvement", text: "Mobile-first design لصفحة الورشة بنفس روح صفحة العميل، باللون الذهبي 🏭" },
    ]
  },
  {
    version: "V17.8",
    date: "2026-04-28",
    types: ["fix", "improvement"],
    title: "إصلاح crash تاب الورش + تصحيح 'دفعة مورد'",
    changes: [
      { type: "fix", text: "🚨 إصلاح crash خطير: تاب الورش في 'قاعدة البيانات' كان يكسر الصفحة كاملة بـ'data is not defined'. السبب: مكون WsManager كان يستخدم prop اسمه data بدون ما يتم تمريره من DBPg" },
      { type: "fix", text: "تم إضافة data كـprop في destructuring الـWsManager وتمريره من DBPg" },
      { type: "improvement", text: "تصحيح خطأ إملائي: 'دفع مورد' → 'دفعة مورد' في كل صفحات الخزنة والمشتريات والإعدادات والمرتبات" },
      { type: "improvement", text: "Migration تلقائي: لما يتم فتح صفحة الخزنة، أي حركات قديمة كانت category='دفع مورد' بتتحول تلقائياً لـ'دفعة مورد' — مفيش حاجة محتاجة تعمل يدوي" },
      { type: "improvement", text: "تأكيد سلوك المرتجعات (للتأكد): المرتجعات بترجع للرصيد بصيغة avail = stock - (sold - returned) — يعني العميل لما يرجع، الموديل يبقى متاح للبيع تاني" },
      { type: "improvement", text: "تأكيد إن كل حركة (بيع أو مرتجع) بتتسجل في customerDeliveries / customerReturns مع: التاريخ، العميل، الكمية، الملاحظة، الـsessionId، الـcreatedBy" },
    ]
  },
  {
    version: "V17.7",
    date: "2026-04-28",
    types: ["feature", "improvement"],
    title: "سجل المرتجعات حسب العميل + تحديث اسم المصنع",
    changes: [
      { type: "feature", text: "🆕 سجل المرتجعات بقا مجمّع حسب العميل بدل ما يعرض كل حركة في صف منفصل — الواجهة بقت قائمة بأسماء العملاء مع إجمالي الكمية وتاريخ آخر مرتجع" },
      { type: "feature", text: "اضغط على أي عميل في السجل → يفتح popup فيه السجل الكامل لمرتجعاته (التاريخ، الموديل، الكمية، الملاحظات، بواسطة) مع إمكانية الطباعة / PDF" },
      { type: "feature", text: "زر طباعة السجل الكامل يطبع تقرير شامل: ملخص بكل العملاء + تفاصيل مرتجعات كل عميل" },
      { type: "feature", text: "بحث في السجل باسم العميل" },
      { type: "improvement", text: "ترتيب العملاء حسب إجمالي الكمية (الأكبر أولاً) — يساعد في تحديد العملاء المرتجعين الأكثر" },
      { type: "improvement", text: "أيقونة 👤 وعدد العمليات وتاريخ آخر مرتجع لكل عميل لمراجعة سريعة" },
      { type: "improvement", text: "تحديث اسم التطبيق في الـlink preview للـCLARK Kids Wear (واتساب، تليجرام، فيسبوك، إلخ)" },
      { type: "improvement", text: "إضافة Open Graph + Twitter meta tags لمظهر أفضل عند مشاركة الروابط" },
      { type: "improvement", text: "تحديث manifest.json — الاسم لما يضيف التطبيق للهاتف بقا CLARK Kids Wear" },
    ]
  },
  {
    version: "V17.6",
    date: "2026-04-28",
    types: ["fix"],
    title: "إصلاح المرتجع السريع — موديلات اشتراها العميل ما كانتش تظهر",
    changes: [
      { type: "fix", text: "🚨 في المرتجع السريع: dropdown الموديلات كان يـfilter بـ'المخزون المتاح > 0' حتى للمرتجعات. ده كان يحجب الموديلات اللي بيعت كلها للعميل (avail=0) من القائمة، وبيمنع تسجيل المرتجع منها" },
      { type: "fix", text: "دلوقتي في return mode، الـdropdown يعرض الموديلات اللي العميل اشتراها فعلاً (delivered - returned > 0) عبر كل الـorders" },
      { type: "fix", text: "الموديلات اللي ارتجع منها العميل بالكامل (cd === ret) ما تظهرش — لا يوجد ما يرجعه" },
      { type: "fix", text: "موديلات اشتراها عميل آخر ما تظهرش لهذا العميل" },
      { type: "improvement", text: "Placeholder dropdown في return mode بقا 'موديلات اشتراها العميل...' بدل 'اختر موديل...' للوضوح" },
      { type: "improvement", text: "زر 'بيع كسر 🧩' بقا يختفي في return mode (مش منطقي)" },
    ]
  },
  {
    version: "V17.5",
    date: "2026-04-28",
    types: ["fix"],
    title: "إصلاحات نهائية: Transfer cascade + Auto-id",
    changes: [
      { type: "fix", text: "Transfer delete (single + bulk + deleteTransfer) دلوقتي يـcascade-cleanup للـcustPayments / supplierPayments / wsPayments المرتبطة بـ**كلا** الـlegs" },
      { type: "fix", text: "Bulk delete مع selection جزئي لـtransfer دلوقتي ينظف الـlinked records على الـleg الثانية اللي ما اتختارتش" },
      { type: "fix", text: "Entry بدون id ما تتـskip بصمت — تتولّد لها id deterministic بناءً على الـcontent (آمن من duplicates)" },
      { type: "improvement", text: "إزالة الـdead warning code للـentries بدون id" },
    ]
  },
  {
    version: "V17.4",
    date: "2026-04-28",
    types: ["fix"],
    title: "إصلاح UI flicker في تأكيد التحويل + إزالة زر حذف خطر",
    changes: [
      { type: "fix", text: "🚨 إصلاح bug: لما تضغط 'تأكيد التحويل'، التحويل كان يتم → يرجع زي قبل ثانية → يتم تاني. السبب: الـconfig listener كان يـoverride الـoptimistic state بـcached snap قبل ما الـserver يأكد" },
      { type: "fix", text: "Listener دلوقتي يتجاهل الـsnaps اللي عندها hasPendingWrites=true لو عندنا config محمّل بالفعل (الـpending IS local state)" },
      { type: "fix", text: "إضافة configDocRef للوصول للقيمة الحالية من داخل listener closure (بدل الـstale closure value)" },
      { type: "fix", text: "إزالة زر الحذف 🗑️ من popup تأكيد استلام مخزن الجاهز — كان يسبب حذف صدفة لتسليمات معلّقة" },
      { type: "improvement", text: "تنظيف: حذف الـtip النصي اللي كان يشير للزر، وحذف الـ'إجراء' column" },
    ]
  },
  {
    version: "V17.3",
    date: "2026-04-28",
    types: ["fix"],
    title: "إصلاحات إضافية في الخزنة (audit مركّز)",
    changes: [
      { type: "fix", text: "🚨 Bulk delete السلف: كان يحذف كل السلف المتطابقة في hrLog (نفس bug #11 لكن في bulk delete)" },
      { type: "fix", text: "Inline edit في اليومية: بقا يـsync الـcustPayments / supplierPayments / wsPayments / hrLog (كان يحدّث الـtreasury فقط)" },
      { type: "fix", text: "Edit popup للسلفة: لو غيّرت الموظف، الـhrLog القديم يتحذف ويتنشئ واحد جديد. لو شلت الموظف، الـhrLog يتحذف والـlink يتنظف" },
      { type: "fix", text: "Edit popup: لو الـtx ما كنش سلفة وأضفت موظف، يتنشأ hrLog جديد تلقائياً" },
      { type: "fix", text: "Edit popup: tx.empId الآن يتحدث بشكل صحيح (كان مش بيتحدث في القديم)" },
    ]
  },
  {
    version: "V17.2",
    date: "2026-04-28",
    types: ["fix", "architectural"],
    title: "إصلاح حرج: الحركات بتنزل مرتين (duplicate)",
    changes: [
      { type: "fix", text: "🚨 إصلاح bug خطير: تسجيل سلفة كان يسبب duplicate في الخزنة" },
      { type: "architectural", text: "السبب: Firestore transaction كان يـreruns الـuser fn على كل retry، وكل run يولّد ids جديدة (gid()). الـoptimistic UI كان بـid_1، الـserver بـid_2 → الـpending writes ما كنش يمسحوا الـserver entry → الـ2 يظهروا في UI" },
      { type: "fix", text: "fn ينفذ مرة واحدة فقط في upConfig، الـnext الجاهز يتمرر لـupConfigTx بدل ما يـreruns على كل retry" },
      { type: "improvement", text: "استبدال runTransaction بـsetDoc — الـbehaviour نفسه (آخر write يفوز)، لكن مفيش fn re-execution" },
      { type: "fix", text: "الإصلاح يحل ده لكل أنواع الحركات: السلف، التحويلات، دفعات العملاء، دفعات الموردين" },
    ]
  },
  {
    version: "V17.1",
    date: "2026-04-28",
    types: ["fix", "improvement"],
    title: "إصلاحات شاملة (آخر 4 مشاكل من الـaudit)",
    changes: [
      { type: "fix", text: "Fuzzy match لحذف السلف بقا يحذف واحدة فقط (كان يحذف كل السلف المتطابقة في نفس اليوم)" },
      { type: "improvement", text: "Deep equality check بدل JSON.stringify — يمنع 5-10× writes غير ضرورية للأسابيع المعقدة" },
      { type: "feature", text: "Migration loading screen — يمنع المستخدم من إضافة بيانات أثناء الـmigration ويظهر progress" },
      { type: "fix", text: "Migration race fix — مفيش data loss لو user يفتح البرنامج أثناء التحديث" },
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
