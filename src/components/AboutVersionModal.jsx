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
    version: "V19.13",
    date: "2026-05-02",
    types: ["fix", "feature"],
    title: "🚨 [حرج] إصلاح كارثي: حذف حركة الخزنة لازم يشيلها من كشف العميل/المورد",
    changes: [
      { type: "fix", text: "🐛 المشكلة (المُبلَّغ عنها كـكارثة): المستخدم سجل دفعة من كشف العميل (50,100 ج.م) وحذف منها 100 ج.م من سجل الخزنة. الـ100 اتشالت من الخزنة، **لكن فضلت ظاهرة في كشف العميل + سجل دفعات المحاسبة** — يعني أنا حذفت في الخزنة وكشف العميل بيقول إن العميل لسه دافع الـ100 دي. السبب الجذري: `delTx` و `bulkDeleteTxs` في TreasuryPg كانا بيـشيلوا الحركة من treasury + custPayments، لكن **مش بيضيفوا tombstone**. لو الـV19.9 recovery أو V18.64 fallback اشتغلوا بعد كده، كانوا بيلاقوا الـtreasury entry لسه موجود مؤقتاً (sync race) ويعيدوا إنشاء custPayment — أو الـcustPayment الميتة كانت لسه ظاهرة بسبب stale render." },
      { type: "fix", text: "✅ Fix #1 (delTx tombstones): أي حذف فردي لحركة عميل/مورد في الخزنة بيضيف الـID للـtombstone فوراً قبل ما الـcleanup يحصل. حتى لو فشل الـcustPayments cleanup أو حصل race، الـrecovery مش هتقدر ترجعها." },
      { type: "fix", text: "✅ Fix #2 (bulkDeleteTxs tombstones): نفس الحماية لكل العمليات في الـbulk-delete (مع capture لكل الـIDs قبل الـsplice). كل الحذف اللي يحصل من سجل الخزنة دلوقتي بيعمل tombstone مظبوط." },
      { type: "feature", text: "🗑 Fix #3 (إزالة ✕ من صف الخزنة + Hint banner): شيلت الأيقونة الصغيرة ✕ اللي كانت سهل الضغط عليها بالغلط. الحذف دلوقتي بس عبر الـcheckbox (☑️) → زر 'حذف المحدد'. أضفت hint banner واضح فوق الجدول لما يكون مفيش حركة محددة عشان المستخدم يعرف الـflow الجديد." },
      { type: "feature", text: "🧹 Fix #4 (تنظيف الدفعات الميتة - للبيانات القديمة): زر جديد في PaymentsTab بيكتشف custPayments/supplierPayments اللي مفيش لها treasury entry موجود (يعني الحركة اتحذفت قبل V19.13 ولم تتنظف بشكل صحيح). بيعرض preview بكل الدفعات الميتة قبل الحذف، وبيضيف tombstones عند التنظيف. ده الحل العملي للـghost payments الموجودة دلوقتي عند المستخدم." },
      { type: "fix", text: "📋 خطوة عملية للمستخدم: بعد ما ترفع V19.13، روح **المحاسبة → دفعات → 🧹 تنظيف الدفعات الميتة** عشان تشيل أي ghost payments من قبل V19.13. الـconfirmation modal بيعرضلك كل دفعة هتتحذف بالاسم والمبلغ والتاريخ قبل ما يحصل أي تغيير." },
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
  {
    version: "V19.10",
    date: "2026-05-02",
    types: ["fix"],
    title: "🚨 [hotfix] إصلاح خطأ 'Cannot access ie before initialization' في صفحة الخزنة",
    changes: [
      { type: "fix", text: "🐛 المشكلة: بعد رفع V19.9، صفحة الخزنة كانت بتفتح على شاشة خطأ 'حدث خطأ غير متوقع — Cannot access ie before initialization'. السبب: الـ recovery useEffect الجديد (سطر 294) كان بيستخدم المتغيرات `customers` و `suppliers` اللي متعرفين في سطر 422-423 (يعني بعدين). في الـ minified bundle، ده بيسبب JavaScript Temporal Dead Zone error — `const` لا يمكن الوصول له قبل تعريفه في نفس الـscope." },
      { type: "fix", text: "✅ الإصلاح: استبدلت `customers` و `suppliers` داخل الـ useEffect بـ `data.customers` و `data.suppliers` مباشرة (data prop متاح فوراً، مفيش TDZ). الـdependency array اتحدّث هو كمان. الـbug ده كان مخفي في الـdev environment (no minification) ومظهر فقط في الـproduction build على Vercel." },
      { type: "fix", text: "📋 ملاحظة: V19.9 كانت فيها 3 إصلاحات حرجة لربط دفعات العملاء/الموردين (auto-link + recovery migration + warning toasts). V19.10 hotfix بس بيصلح الـTDZ error بدون أي تغيير في المنطق — كل ميزات V19.9 شغالة كما هي بمجرد ما الصفحة تفتح." },
    ]
  },
  {
    version: "V19.9",
    date: "2026-05-02",
    types: ["fix"],
    title: "🚨 [حرج] إصلاح ربط دفعات العملاء/الموردين + recovery للحركات اليتيمة",
    changes: [
      { type: "fix", text: "🐛 المشكلة: 'دفعات كاش' في كارت العملاء بتعرض رقم أقل بكتير من إجمالي 'دفعة عميل' في سجل الخزنة. السبب: حركات الخزنة بتولّد سجل في `custPayments` فقط لو المستخدم اختار العميل من القائمة المنسدلة. لو كتب اسم العميل في البيان فقط، الحركة بتتسجل بدون ربط → كشف العميل مش بيشوفها، الكارت مش بيحسبها." },
      { type: "fix", text: "✅ Forward fix (auto-link): helper جديد `matchPartyFromDesc` في `utils/orders.js`. في `saveTx`، لو txPartyId فاضي + الصنف 'دفعة عميل'/'دفعة مورد'/'مرتبات'، النظام يحاول يربط تلقائياً من البيان." },
      { type: "fix", text: "✅ Backward fix (recovery migration): useEffect جديد يمسح حركات الخزنة اليتيمة، يربطها بـ matchPartyFromDesc، وينشئ القيود المفقودة في custPayments/supplierPayments. آمن للتكرار." },
      { type: "fix", text: "✅ Visible warnings: لو حفظت 'دفعة عميل' بدون ربط، toast أصفر '⚠ حُفظ بدون ربط بعميل'. لو حصل ربط تلقائي: '✓ ربط تلقائي بعميل [اسم]'." },
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
