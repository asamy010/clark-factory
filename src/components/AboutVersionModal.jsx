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
    version: "V18.29",
    date: "2026-04-28",
    types: ["improvement"],
    title: "ملخص بدل الجدول في إذن التسليم لما الأصناف > 8",
    changes: [
      { type: "improvement", text: "🚚 ليبل إذن التسليم (10×15 سم) لما عدد الأصناف يزيد عن 8، الجدول التفصيلي بقى يلغي ويتعرض بطاقة ملخص نظيفة بدلاً منه" },
      { type: "improvement", text: "📊 البطاقة فيها 3 معلومات بخط كبير وواضح: عدد الأصناف + إجمالي الكمية + التاريخ" },
      { type: "improvement", text: "🎯 الفائدة: الخط ميصغرش لدرجة عدم الوضوح بسبب auto-fit. لما الأصناف كثيرة، الملخص بيكفي والتفاصيل في كشف العميل أو سجل الحركات" },
      { type: "improvement", text: "✅ ≤ 8 أصناف: الجدول التفصيلي زي ما هو (مع موديل/وصف/كمية/سعر)" },
      { type: "improvement", text: "✅ > 8 أصناف: بطاقة ملخص بإطار أزرق وألوان واضحة" },
    ]
  },
  {
    version: "V18.28",
    date: "2026-04-28",
    types: ["improvement"],
    title: "ضغط جدولي مبيعات/مرتجعات في رابط العميل ليفتوا على الموبايل",
    changes: [
      { type: "improvement", text: "📱 إزالة الـscroll الأفقي على الموبايل من جدولي 'مبيعات' و'مرتجعات' في تاب 'سجل الحركات'" },
      { type: "improvement", text: "table-layout: fixed مع نسب أعمدة محسوبة (11% / 22% / 17% / 25% / 25%) عشان كل عمود ياخد مساحته بدون تشتت" },
      { type: "improvement", text: "📅 صيغة تاريخ مختصرة: '22 أبر' بدل '22 أبريل 2026' — توفر مساحة كبيرة في عمود التاريخ" },
      { type: "improvement", text: "🏷️ اختصار الـheaders: 'القيمة قبل الخصم' → 'قبل الخصم' و'القيمة بعد الخصم' → 'بعد الخصم' و'الكمية' بدون 'قطعة' في الخلية" },
      { type: "improvement", text: "📐 padding وfont أصغر على الموبايل (≤480px) — 5px padding و10.5px font بدل 7px و11.5px" },
      { type: "improvement", text: "💻 على الديسكتوب: نفس النمط الكامل، الجدول لسه واضح ومقروء" },
    ]
  },
  {
    version: "V18.27",
    date: "2026-04-28",
    types: ["fix", "improvement"],
    title: "تطبيق الخصم على بطاقات المبيعات + حذف عمود النوع من رابط العميل",
    changes: [
      { type: "fix", text: "🚨 بطاقات الإحصاءات في صفحة المبيعات (المبيعات / مرتجعات / رصيد عند العملاء) كانت بتعرض الأرقام قبل الخصم — وكانت بتعطي رصيد عملاء مغلوط" },
      { type: "fix", text: "✅ تطبيق نسبة الخصم لكل عميل على حدة على المبيعات والمرتجعات → الرصيد النهائي يطلع صح" },
      { type: "improvement", text: "📝 تيب صغير 'بعد الخصم' تحت كل من بطاقات: المبيعات، المرتجعات، رصيد عند العملاء" },
      { type: "improvement", text: "🖨 تقرير المبيعات المطبوع: العنوان يوضح أن جميع الأرقام بعد الخصم + إضافة عمود 'الخصم %' لكل عميل + الأعمدة بقت 'بعد الخصم'" },
      { type: "improvement", text: "🗑️ حذف عمود 'النوع' من جدولي مبيعات ومرتجعات في رابط العميل (سجل الحركات) — البادج ميتكررش، اللون ولون الـheader يكفوا للتمييز" },
    ]
  },
  {
    version: "V18.26",
    date: "2026-04-28",
    types: ["feature", "improvement"],
    title: "إعادة هيكلة سجل الحركات في رابط العميل",
    changes: [
      { type: "improvement", text: "📝 إعادة تسمية التاب 'سجل التسليم والمرتجعات' → 'سجل الحركات'" },
      { type: "feature", text: "🛒 جدول 'مبيعات' جديد في الأعلى — صف لكل توزيعة (مدمجة): رقم الفاتورة (#1, #2...) + التاريخ + إجمالي الكمية + القيمة قبل الخصم + القيمة بعد الخصم + بادج 'فاتورة بيع'" },
      { type: "feature", text: "↩️ جدول 'مرتجعات' بنفس النمط الاحترافي — صف لكل جلسة مرتجعات" },
      { type: "feature", text: "صف إجماليات في آخر كل جدول بألوان مميزة (أخضر للمبيعات، أحمر للمرتجعات)" },
      { type: "improvement", text: "📋 قسم 'تفاصيل حسب الموديل' (البطاقات الحالية) انتقل لأسفل الجدولين مع فلتر الموديل" },
      { type: "improvement", text: "👋 رسالة الترحيب في الصفحة الرئيسية بقت ثابتة 'مرحبا، {اسم}' بدل ما تتغير حسب الوقت" },
      { type: "improvement", text: "🗑️ زر 'تسليم مخزن جاهز' من القائمة الرئيسية اتشال — workflow مدمج في صفحة الأوردر" },
    ]
  },
  {
    version: "V18.25",
    date: "2026-04-28",
    types: ["improvement"],
    title: "تثبيت رسالة الترحيب + حذف زر 'تسليم مخزن جاهز'",
    changes: [
      { type: "improvement", text: "👋 رسالة الترحيب في الصفحة الرئيسية بقت ثابتة 'مرحبا، {اسم المستخدم}' بدلاً من تغيرها حسب الوقت (صباح الخير/مساء الخير/إلخ)" },
      { type: "improvement", text: "🗑️ تم حذف زر 'تسليم مخزن جاهز' من القائمة الرئيسية — كان مكرر مع زر '+ تسليم' داخل صفحة كل أوردر" },
      { type: "improvement", text: "📌 الـworkflow الجديد: لتسليم المخزن، افتح الأوردر من 'أوامر القص' واستخدم قسم 'تسليم مخزن جاهز' في صفحة الأوردر — أقوى لأن فيه التحكم في النوع (سيري/كسر) والتعديل" },
      { type: "improvement", text: "تحديث التلميح في صفحة المخازن (تبويبة الجاهز) ليرشد المستخدم للـworkflow الجديد" },
      { type: "improvement", text: "ملف StockPg.jsx محتفظ به والـroute لسه شغال — لو في URL قديم مفظوظ مش هيكسر، بس مفيش زر مرئي" },
    ]
  },
  {
    version: "V18.24",
    date: "2026-04-28",
    types: ["fix"],
    title: "حساب الشيكات في المبيعات: 'دفعة عميل' فقط",
    changes: [
      { type: "fix", text: "🚨 V18.23 كان بيحسب كل الشيكات قبض في 'دفعات شيكات'، بما فيها أنواع غلط زي 'رصيد افتتاحي' (شيكات من موسم قديم) و'تسوية مبالغ' و'تحويل' — كانت بتدخل في حساب المبيعات بدون داعي" },
      { type: "fix", text: "✅ التصحيح: بنحسب فقط الشيكات اللي فئتها 'دفعة عميل' (أو فاضية لأن دي الافتراضية)" },
      { type: "fix", text: "🚫 مستبعد: رصيد افتتاحي، تسوية مبالغ، تحويل بين الحسابات، أخرى — هذي الفئات ميخصش المبيعات" },
      { type: "fix", text: "نفس الفلتر مطبق في 3 أماكن: بطاقة الإحصاءات + كشف الحساب الداخلي + رابط العميل العام (API)" },
    ]
  },
  {
    version: "V18.23",
    date: "2026-04-28",
    types: ["fix"],
    title: "بطاقة 'دفعات شيكات' بقت تشمل الشيكات المعلقة",
    changes: [
      { type: "fix", text: "🚨 المشكلة: لما تسجل شيك من عميل وهو لسه معلق (لم يتم تحصيله)، كان الشيك ميظهرش في بطاقة 'دفعات شيكات' في صفحة المبيعات" },
      { type: "fix", text: "السبب: الحساب كان يجمع فقط custPayments بطريقة 'شيك'، لكن الشيكات الحقيقية مخزنة في data.checks بـ type='receivable' كنظام منفصل" },
      { type: "fix", text: "✅ الحساب الجديد بيشمل: custPayments بطريقة 'شيك' + كل الشيكات قبض من عملاء بأي حالة عدا 'مرتد' أو 'ملغي'" },
      { type: "fix", text: "نفس التصحيح ينطبق على: بطاقة دفعات شيكات في الإحصاءات + كشف العميل التفصيلي + رابط العميل العام (API)" },
      { type: "fix", text: "في رابط العميل الشيكات المعلقة هتظهر في سجل المدفوعات بـ method='شيك' وملاحظات مثل 'شيك #123 — البنك الأهلي (معلق)'" },
      { type: "fix", text: "💡 منطقياً: العميل دفعنا شيك = اعتباراً انه دفع. حتى لو لم يتم تحصيله بعد، رصيده عندنا انخفض بقيمة الشيك. لما يرتد، لازم يعدّل الحالة لـ'مرتد' وتلقائياً الشيك هيتم خصمه" },
    ]
  },
  {
    version: "V18.22",
    date: "2026-04-28",
    types: ["improvement"],
    title: "تحسينات جدول التوزيعة — السيري الحالي + تثبيت عمود العملاء",
    changes: [
      { type: "improvement", text: "📦 الرقم اللي يظهر في رأس عمود الموديل (📦 N) بقى الرصيد السيري الفعلي الحالي (بعد المبيعات والمرتجعات الإجمالية) — مش الإجمالي الخام اللي اتسلم من التشطيب" },
      { type: "improvement", text: "اللي بيوزع التوزيعة بقى يعرف فوراً كم سيري متاح حقاً للتوزيع، بدون رجوع لكارت الصنف" },
      { type: "improvement", text: "📌 عمود العملاء بقى مثبت (sticky) عند الـscroll بالعرض — يفضل ظاهر مهما تتحرك في الجدول" },
      { type: "improvement", text: "نفس التثبيت لكل صفوف الإجماليات: اجمالي توزيع، رصيد توزيع، مباع فعلي، رصيد متاح للبيع، سعر البيع" },
      { type: "improvement", text: "خط فاصل أزرق رمادي على الجانب الأيسر للعمود المثبت لتمييز بصري واضح بين العمود الثابت والمتحرك" },
    ]
  },
  {
    version: "V18.21",
    date: "2026-04-28",
    types: ["feature", "improvement"],
    title: "نظام السيري/الكسر + دمج الموديلات بنفس الرقم في كارت الصنف",
    changes: [
      { type: "feature", text: "📦/🧩 عمود 'النوع' جديد في جدول تسليمات المخزن في صفحة الأوردر — اختر سيري (افتراضي) أو كسر لكل تسليم. قابل للتعديل في أي وقت" },
      { type: "feature", text: "بادج 'سيري: X' و'كسر: Y' في رأس صفحة الأوردر يعرض التقسيم الإجمالي" },
      { type: "improvement", text: "🎯 جدول التوزيعة في صفحة المبيعات بقى يحسب على السيري فقط (الكسر مستبعد من التوزيع):" },
      { type: "improvement", text: "  • رصيد متاح للبيع = seriesQty − net_sold (مش stockQty)" },
      { type: "improvement", text: "  • رصيد توزيع = (seriesQty الحالي + مبيعات التوزيعة) − اجمالي التوزيع" },
      { type: "improvement", text: "  • رأس عمود الموديل يعرض التقسيم: 📦 سيري + 🧩 كسر — عشان اللي بيوزع ميخلطش" },
      { type: "feature", text: "🔗 'كارت صنف' بقى يدمج كل الأوردرات اللي ليها نفس رقم الموديل في كرت واحد — مش هتظهر مرتين" },
      { type: "feature", text: "بادج '⧉ N' بيظهر لما الموديل مدموج من تشغيلات متعددة" },
      { type: "feature", text: "بطاقات الملخص في كارت الصنف بقت 6: 📦 سيري + 🧩 كسر + 📥 وارد + 📤 مبيعات + ↩ مرتجعات + الرصيد الحالي" },
      { type: "feature", text: "سجل الحركات في الكارت يعرض كل الحركات من جميع الأوردرات المدموجة بترتيب زمني مع الرصيد المتحرك" },
      { type: "improvement", text: "📋 helpers جديدة: getConfirmedSeriesStock(o) و getConfirmedBrokenStock(o) في utils/orders.js. السلوك الافتراضي للسجلات القديمة (بدون type) = سيري — توافق خلفي تام" },
    ]
  },
  {
    version: "V18.20",
    date: "2026-04-28",
    types: ["fix"],
    title: "إصلاح حسابات جدول التوزيعة لاستخدام الرصيد الفعلي الحالي",
    changes: [
      { type: "fix", text: "🚨 المشكلة: الجدول كان بيستخدم m.stockQty (الإجمالي اللي اتسلم من التشطيب أصلاً، مثلاً 711) بدل الرصيد الفعلي الحالي بعد كل المبيعات والمرتجعات (مثلاً 17)" },
      { type: "fix", text: "✅ رصيد متاح للبيع = stockQty − (إجمالي مبيعات − إجمالي مرتجعات) = الرصيد الفعلي الحالي. لما كل مبيعات التوزيعة تتأكد، الرقم ده يصل لصفر تلقائياً" },
      { type: "fix", text: "✅ رصيد توزيع = (الرصيد الفعلي الحالي + مبيعات التوزيعة دي) − اجمالي توزيع. الجزء المضاف بيمنع الخصم المزدوج لما الرصيد ينخفض من بيع نفس التوزيعة" },
      { type: "fix", text: "✅ مباع فعلي = مبيعات التوزيعة دي بس − مرتجعاتها (نفس منطق V18.18، شغال صح)" },
      { type: "fix", text: "🎯 النتيجة: لو عندك 17 موديل في المخزن وعملت توزيعة بـ17، 'رصيد التوزيع' يبدأ صفر، 'متاح للبيع' يبدأ 17. لما تأكد البيع، 'متاح للبيع' ينخفض تدريجياً لحد 0 (يعني خلصت)" },
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
