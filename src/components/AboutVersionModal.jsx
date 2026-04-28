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
  {
    version: "V17.0",
    date: "2026-04-28",
    types: ["architectural", "fix"],
    title: "إصلاحات معمارية كبيرة (data integrity)",
    changes: [
      { type: "fix", text: "إصلاح race condition في الـlistener — entries جديدة كانت تختفي مؤقتاً (flicker) لما الـserver يرد متأخر" },
      { type: "architectural", text: "نظام pending writes tracking — كل optimistic update يتسجّل ويتحمّى من الـoverride" },
      { type: "fix", text: "عكس ترتيب الـfallback path: sync الـday docs أولاً، ثم write config — يمنع data loss في حالة network failure" },
      { type: "improvement", text: "تقوية gid() — 12 random char بدل 4 (4.7 quintillion combinations لكل ms)" },
      { type: "improvement", text: "Pending writes تتنظف تلقائياً بعد 30 ثانية (لو الـserver أكدها أو ضاعت)" },
    ]
  },
  {
    version: "V16.80",
    date: "2026-04-28",
    types: ["fix"],
    title: "إصلاحات صغيرة في split sync",
    changes: [
      { type: "fix", text: "تعديل تاريخ entry لا يسبب duplicate — الـentry تتنقل من اليوم القديم لليوم الجديد بشكل صحيح" },
      { type: "fix", text: "Entry بدون date تترفض بدل ما تتحط في يوم today بصمت — يمنع silent data corruption" },
      { type: "fix", text: "Side effects خارج setState callback — يمنع double-execution في React Strict Mode" },
      { type: "improvement", text: "تحذيرات في الـconsole لـentries بدون id (كانت skipped بصمت)" },
    ]
  },
  {
    version: "V16.79",
    date: "2026-04-27",
    types: ["feature"],
    title: "صفحة About Version",
    changes: [
      { type: "feature", text: "زر About في TopBar يعرض سجل التغييرات لكل الإصدارات" },
      { type: "feature", text: "كل إصدار يعرض تصنيف، تاريخ، وقائمة تفصيلية بكل تغيير" },
      { type: "feature", text: "الإصدار الحالي يظهر مميز بلون مختلف" },
    ]
  },
  {
    version: "V16.78",
    date: "2026-04-27",
    types: ["feature", "improvement"],
    title: "Tooltips احترافية للإعدادات",
    changes: [
      { type: "feature", text: "component HelpTip — أيقونة (ⓘ) بجانب الـoptions تظهر شرح مفصل عند hover/tap" },
      { type: "feature", text: "component CardSubtitle — وصف موجز ملوّن تحت كل عنوان كارت في الإعدادات" },
      { type: "feature", text: "component FieldHelp — نص شرح صغير أسفل الـinputs" },
      { type: "improvement", text: "19 كارت في الإعدادات عنده دلوقتي subtitle يشرح وظيفته" },
      { type: "improvement", text: "13 option معقد عنده tooltip تفصيلي" },
    ]
  },
  {
    version: "V16.77",
    date: "2026-04-27",
    types: ["feature", "improvement"],
    title: "تنظيم القماش/الإكسسوار + أوضاع المخزن",
    changes: [
      { type: "improvement", text: "تاب الأقمشة والإكسسوارات اتشال من قواعد البيانات" },
      { type: "feature", text: "إدارة الأقمشة والإكسسوارات بقت من المخزن مباشرة (إضافة/تعديل/حذف)" },
      { type: "feature", text: "كارت 'وضع المخزن' في الإعدادات بـ4 أوضاع: مغلق / عرض فقط / السماح بالسالب / صارم" },
      { type: "improvement", text: "كل وضع له شرح واضح وconfirmation قبل التفعيل" },
    ]
  },
  {
    version: "V16.76",
    date: "2026-04-27",
    types: ["fix"],
    title: "إصلاحات حرجة في split/partitioned",
    changes: [
      { type: "fix", text: "إصلاح bug خطير: الحذف كان يرجع بعد refresh لأن splitDataRef كان يتحدث قبل ما upConfigTx يقرا الـsnapshot الأصلي" },
      { type: "fix", text: "تمرير explicitSplitBefore و explicitPartBefore من upConfig لـupConfigTx لضمان dif صحيح" },
      { type: "fix", text: "ترتيب حركات الخزنة مرتبة حسب اليوم (الأحدث فوق) بدل insertion order للـMap" },
      { type: "improvement", text: "syncSplitCollection بقت تقرأ الـserver day doc أولاً ثم تطبّق delta — مفيش data loss حتى لو local state غير كامل" },
      { type: "improvement", text: "syncPartitionedCollection بقت ما تحذفش لو oldArr فاضي (race protection)" },
      { type: "fix", text: "Safety check في upConfig يمنع الكتابة قبل تحميل splitData/partitionedData" },
    ]
  },
  {
    version: "V16.75",
    date: "2026-04-27",
    types: ["architectural", "feature"],
    title: "تقسيم أسابيع المرتبات + Storage Notices",
    changes: [
      { type: "architectural", text: "تقسيم hrWeeks إلى collection منفصلة hrWeeksDocs — كل أسبوع document مستقل" },
      { type: "architectural", text: "هذا يسمح بنمو سنوي بدون حدود الـ1MB لكل document" },
      { type: "feature", text: "نظام Storage Notices — رسائل نظام التخزين تظهر في الإعدادات بدل toasts للموظفين" },
      { type: "feature", text: "كارت في الإعدادات يعرض كل أسبوع وحالته وحجمه" },
      { type: "fix", text: "إصلاح مشكلة الطباعة المكررة (نافذة طباعة كانت تفتح مرتين)" },
      { type: "improvement", text: "نقل الإحصائيات من الشاشات (Treasury, HR, Audit) للإعدادات فقط" },
    ]
  },
  {
    version: "V16.74",
    date: "2026-04-27",
    types: ["architectural"],
    title: "تقسيم Treasury + AuditLog + HRLog",
    changes: [
      { type: "architectural", text: "تقسيم بيانات الخزنة إلى collection يومية treasuryDays/{YYYY-MM-DD}" },
      { type: "architectural", text: "تقسيم سجل الأحداث إلى auditDays/{YYYY-MM-DD}" },
      { type: "architectural", text: "تقسيم سجل HR إلى hrLogDays/{YYYY-MM-DD}" },
      { type: "architectural", text: "factory/config صغر بنسبة 56% (من ~450 KB إلى ~199 KB)" },
      { type: "feature", text: "Migration script أوتوماتيكية مع backup كامل قبل التحويل" },
      { type: "feature", text: "كارت 'مراقبة التخزين اليومي' في الإعدادات يعرض حجم كل document يومي" },
      { type: "improvement", text: "كل document يومي 5-10 KB، يسمح بسنوات من النمو بدون مشاكل" },
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
