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
    version: "V18.19",
    date: "2026-04-28",
    types: ["feature"],
    title: "تقرير 'كارت صنف' لمخزن الجاهز",
    changes: [
      { type: "feature", text: "📇 زر 'كارت صنف' جديد في قسم '📦 المخزن والجرد' في صفحة المبيعات" },
      { type: "feature", text: "🔍 بوب-أب اختيار الموديل: قائمة بكل الموديلات اللي عليها أي حركة (استلام/بيع/مرتجع) مع فلتر بحث برقم الموديل أو الوصف وعرض الرصيد الحالي لكل موديل" },
      { type: "feature", text: "📊 تفاصيل الموديل: 4 بطاقات ملخص — إجمالي وارد + إجمالي مبيعات + إجمالي مرتجعات + الرصيد الحالي" },
      { type: "feature", text: "📋 سجل كل الحركات بترتيب زمني — التاريخ + النوع (📥 رصيد / 📤 بيع / ↩ مرتجع) + الجهة (للمبيعات والمرتجعات) + الكمية مع إشارة (+/-) + الرصيد المتحرك بعد كل حركة + ملاحظة" },
      { type: "feature", text: "🖨 زر طباعة احترافي يطلع كشف PDF بكل التفاصيل + توقيعات أمين المخزن والمدير" },
    ]
  },
  {
    version: "V18.18",
    date: "2026-04-28",
    types: ["fix", "improvement"],
    title: "جدول التوزيعة — عزل الحسابات لكل توزيعة منفصلة",
    changes: [
      { type: "fix", text: "🚨 إصلاح حساب 'مباع فعلي' — كان بيجمع كل المبيعات التاريخية لكل موديل (من جميع التوزيعات السابقة). دلوقتي بيحسب المبيعات للتوزيعة الحالية بس (filter by sessionId === activeSess.id)" },
      { type: "fix", text: "نفس الإصلاح لـ'رصيد متاح للبيع' — كان متأثر بمبيعات توزيعات تانية. دلوقتي = stockQty - (مباع فعلي للتوزيعة دي بس)" },
      { type: "fix", text: "المرتجعات بقت تتحسب فقط لو المرتجع من التوزيعة دي (filter by sessId/sessionId === activeSess.id)" },
      { type: "improvement", text: "🗑️ حذف صف 'تسليم مخزن جاهز' من جدول التوزيعة — كان مكرر مع m.stockQty المعروض في رصيد توزيع وملوش داعي" },
      { type: "improvement", text: "💡 المنطق الجديد: كل توزيعة معزولة تماماً — مش بتتأثر ولا تأثر بغيرها. اعتبارها 'خطة + متابعة لحظية' للمقارنة بين الخطة والتنفيذ الفعلي" },
    ]
  },
  {
    version: "V18.17",
    date: "2026-04-28",
    types: ["fix"],
    title: "إصلاح crash صفحة 'جرد المخزن من المبيعات'",
    changes: [
      { type: "fix", text: "🚨 إصلاح ReferenceError: _auditScanMode is not defined — كان يكسر الصفحة بأكملها بمجرد فتح 'جرد المبيعات'" },
      { type: "fix", text: "السبب: متغير module-level بيتم استخدامه للـscanner closure، بس متعرفش بـlet/var/const في أي مكان. ESM strict-mode بيرفض الإسناد لمتغيرات غير معرفة" },
      { type: "fix", text: "الحل: إضافة `let _auditScanMode = \"series\"` في رأس CustDeliverPg.jsx على مستوى الـmodule" },
    ]
  },
  {
    version: "V18.16",
    date: "2026-04-28",
    types: ["feature", "improvement"],
    title: "إيقاف العملاء والورش — منع التعامل + إخفاء من القوائم + رسالة في الرابط",
    changes: [
      { type: "feature", text: "🔒 توجل 'إيقاف التعامل' في فورم تعديل العميل (تظهر فقط عند التعديل، مش عند إنشاء عميل جديد)" },
      { type: "feature", text: "🔒 نفس التوجل في فورم تعديل الورشة — مع شرح واضح بالتأثير" },
      { type: "improvement", text: "👥 العملاء الموقوفين بيختفوا من picker كشف الحساب وبيختفوا افتراضياً من قائمة العملاء (👥) — في زر 'إظهار الموقوفين' للأدمن في القائمة الكبيرة" },
      { type: "improvement", text: "🏭 الورش الموقوفة بتختفي من كل dropdowns الأوردرات وتاب الإنتاج الخارجي" },
      { type: "improvement", text: "📋 العميل/الورشة الموقوف بيظهر في القائمة (لما تفتح زر 'إظهار الموقوفين') بـ شريط أحمر شفاف + خط مائل عبر الاسم + بادج '🔒 موقوف'" },
      { type: "improvement", text: "💼 كارد الورشة الموقوفة بيظهر بـ opacity مخفّض + بادج '🔒 موقوفة' أحمر بارز في الكورنر" },
      { type: "feature", text: "🚫 لما العميل/الورشة الموقوف يفتح رابط حسابه، الـ API بيرجع 403 برسالة مخصصة، وصفحة الرابط بتعرض UI مميز:" },
      { type: "feature", text: "🔒 أيقونة كبيرة + 'تم إيقاف التعامل مع [الاسم]' + 'يُرجى التواصل مع المصنع' في panel أحمر فاتح" },
      { type: "improvement", text: "API: customer-portal و workshop-portal بيرجعو {error, archived: true, name} لما الحساب موقوف — الواجهة تستخدم name لرسالة شخصية" },
      { type: "improvement", text: "الكشف الكامل (المبيعات/الحركات/الأرصدة) للعميل الموقوف لسه متاح للأدمن داخل البرنامج للمراجعة — الإيقاف بس بيمنع الظهور في الـ pickers والـ portal" },
    ]
  },
  {
    version: "V18.15",
    date: "2026-04-28",
    types: ["feature", "improvement"],
    title: "نظام اعتماد الدفعات المجمعة + طباعة كشف",
    changes: [
      { type: "feature", text: "📤 الـuser ميقدرش يسجل دفعات مجمعة مباشرة في الخزنة — لازم يبعت طلب اعتماد، الأدمن بيراجع وبيوافق وبعدها بتنزل الخزنة" },
      { type: "feature", text: "🖨 زر 'طباعة' جديد في بوب-أب الدفعات المجمعة — يطبع كشف احترافي بالأسماء والمبالغ والتوقيعات والإجمالي" },
      { type: "feature", text: "🔴 Badge أحمر pulsing فوق زر 💸 دفعات مجمعة للأدمن مع عدد الطلبات المعلقة" },
      { type: "feature", text: "📋 قسم 'طلبات بانتظار اعتمادك' داخل البوب-أب للأدمن — يعرض كل طلب (المُرسِل، التاريخ، عدد الموظفين، الإجمالي)، اضغط على أي طلب يفتح بوب-أب مراجعة كامل بالتفاصيل" },
      { type: "feature", text: "بوب-أب المراجعة فيه: ✅ اعتماد ونقل للخزنة (يسجل HR + treasury دفعة واحدة) | ❌ رفض (مع سبب اختياري)" },
      { type: "improvement", text: "🚫 إزالة مربع 'البيان' (سلفة) من البوب-أب — البيان دايماً 'دفعة مجمعة' بشكل تلقائي" },
      { type: "improvement", text: "🔍 إضافة فلتر بحث باسم الموظف داخل البوب-أب — يخفي الموظفين اللي مش متطابقين مع الكلمة" },
      { type: "improvement", text: "🗃️ Collection جديدة: data.bulkPaymentApprovals — كل طلب فيه: المُرسِل، التاريخ، الموظفين، المبالغ، الإجمالي، الحالة، المراجِع، سبب الرفض، hrLogIds للربط بالخزنة" },
    ]
  },
  {
    version: "V18.14",
    date: "2026-04-28",
    types: ["fix", "improvement"],
    title: "إصلاح ظهور النجوم + إزالة كل التصنيفات اللفظية",
    changes: [
      { type: "fix", text: "🐛 إصلاح ظهور النجوم في بطاقة التقييم بصفحة رابط العميل: النجوم الفارغة كانت مختفية بسبب letter-spacing مع تقنية overlay الـ%-based" },
      { type: "fix", text: "إعادة كتابة مكوّن <Stars> ليرسم كل نجمة منفصلة (full/half/empty) بدلاً من overlay على نص واحد — أكثر دقة وموثوقية" },
      { type: "improvement", text: "🎨 لون النجوم الفارغة من #E5E7EB إلى #CBD5E1 — أوضح على الخلفيات الملوّنة" },
      { type: "improvement", text: "🚫 إزالة بادج التصنيف اللفظي (سيء/متوسط/ممتاز...) من بطاقة التقييم في صفحة الرابط — يتبقى فقط: النجوم + الرقم + النسبة + breakdown" },
    ]
  },
  {
    version: "V18.13",
    date: "2026-04-28",
    types: ["improvement"],
    title: "تحسين بوب-أب قائمة العملاء + زر رابط في كل صف",
    changes: [
      { type: "improvement", text: "📐 بوب-أب '👥 العملاء' بقى يتمدد لعرض المحتوى تلقائياً بدلاً من عرض ثابت 900px — مفيش scroll أفقي" },
      { type: "improvement", text: "حد أقصى 95% من عرض الشاشة، حد أدنى 420px على الديسكتوب — على الموبايل full width زي ما هو" },
      { type: "improvement", text: "📱 إضافة زر 'رابط العميل' في كل صف جنب أزرار سجل المبيعات/تعديل/QR/حذف — كبسة واحدة لتوليد ونسخ رابط الحساب" },
    ]
  },
  {
    version: "V18.12",
    date: "2026-04-28",
    types: ["improvement"],
    title: "اختصار روابط رابط العميل والورشة بنسبة ~50%",
    changes: [
      { type: "improvement", text: "🔗 الرابط القديم (~115 حرف): /?portal=1&c=<id>&sig=<64hex>  →  الرابط الجديد (~58 حرف): /?p=c&i=<id>&s=<16b64>" },
      { type: "improvement", text: "اختصار التوقيع HMAC من 64 حرف hex إلى 16 حرف base64url (96-bit) — لسه آمن جداً للقراءة فقط (2^96 محاولة لكسره)" },
      { type: "improvement", text: "اختصار أسماء البراميترات: portal=1 → p=c | wsportal=1 → p=w | c=/w= → i= | sig= → s=" },
      { type: "improvement", text: "✅ توافق خلفي كامل: الروابط القديمة اللي العملاء/الورش حافظينها لسه شغالة — الـverifier يقبل الصيغتين تلقائياً" },
      { type: "improvement", text: "تأثير عملي: الرابط في رسالة الواتساب أقصر، مينقطعش لسطر جديد، نسبة الخطأ في النسخ أقل، والـpreview أوضح" },
    ]
  },
  {
    version: "V18.11",
    date: "2026-04-28",
    types: ["improvement"],
    title: "تبسيط بادج تقييم العميل — نجوم ورقم فقط",
    changes: [
      { type: "improvement", text: "🎨 إزالة كلمة 'تقييم العميل:' وإزالة التصنيف اللفظي (ممتاز/جيد جداً/متوسط/ضعيف/سيء) من بادج التقييم في:" },
      { type: "improvement", text: "هيدر صفحة رابط العميل + هيدر كشف الحساب الداخلي + قائمة العملاء (البوب-أب)" },
      { type: "improvement", text: "البادج صار يعرض النجوم والرقم فقط (مثلاً ⭐⭐⭐⭐½ 4.5) — أنظف وأكثر تركيزاً" },
      { type: "improvement", text: "البطاقة التفصيلية للتقييم في إحصاءات الرابط محتفظ بها بكامل تفاصيلها (التصنيف + النسبة + breakdown)" },
    ]
  },
  {
    version: "V18.10",
    date: "2026-04-28",
    types: ["maintenance"],
    title: "تفعيل سجل التحديثات — توثيق دائم لكل إصدار",
    changes: [
      { type: "maintenance", text: "📝 من V18.10 وما بعدها، كل إصدار يحصل على إدخال مفصّل في سجل التحديثات (هذه النافذة) — العنوان، التاريخ، التصنيفات، وكل التغييرات بالتفصيل" },
      { type: "maintenance", text: "تم إعادة بناء السجل بالكامل ليشمل V18.0 → V18.10 بدل ما كان متوقفاً عند V17.x" },
      { type: "maintenance", text: "نحافظ على آخر 10 إصدارات فقط — الأقدم يُحذف عند إضافة جديد" },
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
