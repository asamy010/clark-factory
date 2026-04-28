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
  {
    version: "V18.9",
    date: "2026-04-28",
    types: ["fix"],
    title: "إصلاح بناء Vercel — تسمية ملف utils/rating",
    changes: [
      { type: "fix", text: "🚨 إصلاح فشل البيلد على Vercel: ملف rating.js كان يحتوي على JSX (مكوّن <Stars>)، لكن إعدادات Vite الافتراضية لا تحوّل JSX إلا داخل ملفات .jsx — إعادة تسمية إلى rating.jsx وتحديث جميع الـimports" },
    ]
  },
  {
    version: "V18.8",
    date: "2026-04-28",
    types: ["improvement"],
    title: "إعادة بطاقة 'إجمالي الخصم' في رابط العميل",
    changes: [
      { type: "improvement", text: "🏷️ بطاقة 'إجمالي الخصم' رجعت في صفحة رابط العميل (تظهر فقط لو نسبة الخصم > 0). سطر الخصم في ملخص الحساب لا يزال محذوفاً" },
    ]
  },
  {
    version: "V18.7",
    date: "2026-04-28",
    types: ["feature"],
    title: "نظام تقييم العملاء بـ 5 نجوم (نص نجمة)",
    changes: [
      { type: "feature", text: "⭐ نظام تقييم تلقائي للعميل بناءً على نسبة البيع: (تسليم − مرتجع) ÷ تسليم × 100%" },
      { type: "feature", text: "5 شرائح: ممتاز ≥95% (أخضر) / جيد جداً 85-94% (تركواز) / متوسط 70-84% (أزرق) / ضعيف 50-69% (برتقالي) / سيء <50% (أحمر)" },
      { type: "feature", text: "نجوم بدقة نص نجمة (4.5 ⭐) باستخدام تقنية overlay — مكوّن <Stars> reusable" },
      { type: "feature", text: "التقييم يظهر في 4 أماكن: هيدر رابط العميل + بطاقة تفصيلية في إحصاءات الرابط + هيدر كشف الحساب الداخلي + قائمة العملاء (البوب-أب)" },
      { type: "feature", text: "حالة 'لم يتم التقييم بعد' للعميل بدون تسليم" },
      { type: "feature", text: "ملف utils/rating.jsx جديد فيه getCustRating() + مكوّن <Stars>" },
    ]
  },
  {
    version: "V18.6",
    date: "2026-04-28",
    types: ["improvement"],
    title: "تنظيم رابط العميل والورشة + بادج الموسم",
    changes: [
      { type: "improvement", text: "🗓️ بادج 'موسم XX' في هيدر رابطي العميل والورشة — يظهر على الجنب بـ blur + إطار شفاف" },
      { type: "improvement", text: "API بقت ترجع activeSeason للـ portals" },
      { type: "improvement", text: "حذف بطاقة 'إجمالي الخصم' وسطر الخصم من ملخص رابط العميل (سيرجعا لاحقاً في V18.8)" },
      { type: "improvement", text: "حذف تاب 'الموديلات' من رابط العميل — السجل الموحد كافي" },
      { type: "improvement", text: "هيدر رابط الورشة أصغر (10px padding) لتوفير مساحة قراءة" },
      { type: "improvement", text: "كارد الموديل في الورشة: تاريخ الكورنر شال، التاريخ بقى inline جنب التسليم/الاستلام، الكارد أكبر (min-height 130, صورة 100×100)، رقم الموديل بخط 16 فوق الوصف بوضوح" },
    ]
  },
  {
    version: "V18.5",
    date: "2026-04-28",
    types: ["improvement"],
    title: "دمج تاب التسليم/المرتجعات في رابط العميل + إزالة واتساب",
    changes: [
      { type: "improvement", text: "🔄 تاب موحد جديد 'سجل التسليم والمرتجعات' بدل تابين منفصلين — يعرض كل الحركات بترتيب زمني (الأحدث فوق)" },
      { type: "improvement", text: "كل صف بيميز نوع الحركة بـ بادج (📥 تسليم/↩️ مرتجع) + شريط ملوّن على الجانب + صورة مصغرة" },
      { type: "improvement", text: "🚫 إزالة زر 'مشاركة واتساب' من رابطي العميل والورشة — اكتفاء بـ PDF فقط" },
    ]
  },
  {
    version: "V18.4",
    date: "2026-04-28",
    types: ["fix", "improvement", "feature"],
    title: "تصحيح 'إجمالي فواتير المبيعات' + فلتر بالموديل + دمج الورشة",
    changes: [
      { type: "fix", text: "🚨 إصلاح bug في كشف العميل (داخلي + رابط): بطاقة 'إجمالي فواتير المبيعات' كانت تعرض الصافي بعد المرتجعات، صار تعرض الإجمالي الخام للتسليمات (delivered × price)" },
      { type: "improvement", text: "بعد الخصم في البطاقة = الإجمالي الخام × (1 − نسبة الخصم) — يطابق ما يتوقعه العميل" },
      { type: "improvement", text: "تغيير 'صافي القطع' إلى 'صافي الكمية المباعة' في كل الأماكن" },
      { type: "improvement", text: "تصحيح labels الرصيد: 'مستحق علي' → 'مستحق للمصنع'، 'مستحق لي' → 'مستحق للعميل'" },
      { type: "feature", text: "🔍 فلتر بحث برقم الموديل في رابط العميل (تابات الموديلات/التسليمات/المرتجعات) ورابط الورشة — مع زر مسح" },
      { type: "improvement", text: "🔄 رابط الورشة: دمج تاب التسليم والاستلام في تاب موحد 'سجل التسليم والاستلام' — كل موديل في كارد واحد مع: ملخص (تسليم/استلام/رصيد) + معادلة لكل دفعة استلام بتاريخها + المجموع" },
      { type: "improvement", text: "نوع القطعة (قميص/تيشيرت/شورت) يظهر بنص واضح" },
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
