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
    version: "V19.29",
    date: "2026-05-02",
    types: ["feature", "improvement"],
    title: "📣 [اشتغال احترافي] الحملات اليدوية: 11 ميزة جديدة + إدارة كاملة للسجل",
    changes: [
      { type: "feature", text: "🧹 [الطلب الأساسي] auto-remove sent items: لما تبعت لعميل، بيختفي من قائمة 'النشط' تلقائياً. القائمة فضاية بعد كل ضغطة. التوجل ON بشكل افتراضي مع checkbox للتحكم." },
      { type: "feature", text: "🔍 search box في القائمة بحث بالاسم أو الرقم — مفيد لما تكون الحملة 100+ عميل." },
      { type: "feature", text: "🎯 filter بالحالة: نشط/الكل/معلّق/مبعوت/متخطّى/فشل. كل فلتر بيظهر العداد الصحيح." },
      { type: "feature", text: "⏭ jump-to-customer: اضغط على أي عميل في القائمة (لو نشط)، يقفز ليه مباشرة بدل ما تستنى لحد ما توصله بالترتيب." },
      { type: "feature", text: "✏️ تعديل الرسالة لكل عميل: تقدر تعدّل نص الرسالة لعميل واحد قبل الإرسال (مثلاً تكتب جملة شخصية). علامة ✏️ بتظهر على العميل لو الرسالة معدّلة." },
      { type: "feature", text: "📝 تخطّى مع ملاحظة: زر منفصل بيفتح dialog يدخّل سبب التخطي ('قال يتصل تاني'، 'مش متاح'، إلخ). الملاحظة بتظهر في القائمة وفي تفاصيل الحملة بعدين." },
      { type: "feature", text: "↩ undo last action: بعد كل إرسال أو تخطّى، زر 'تراجع' بيظهر — لو دوست بالغلط ترجع تعديل لحظتها." },
      { type: "feature", text: "🚫 [نظام جديد] قائمة المحظورين: زر '🚫 محظور' في شاشة الإرسال يحط العميل في `data.campaignBlocklist[]` فوراً، وبيتم استبعاده تلقائياً من **كل الحملات الجديدة** بشكل دائم. صفحة منفصلة (🚫 محظورين في الـheader) لإدارة القائمة — حذف، رفع الحظر، بحث." },
      { type: "feature", text: "🔁 إعادة الفاشل: زر 'إعادة الفاشل (X)' أثناء وبعد الحملة بيرجّع كل الفاشل لحالة pending عشان تحاول تاني." },
      { type: "feature", text: "💾 [قوي جداً] حفظ تلقائي للاستئناف: الحملة بتتحفظ في `data.activeCampaigns[]` كل 3 ث + عند كل إرسال/تخطّى. لو قفلت CLARK أو الـbrowser في النص، بترجع تلاقي banner أزرق فوق صفحة الحملات: '⏯ حملات معلّقة' بـ progress bar وزر '▶ استئناف' — يكمّل من نفس النقطة بكل حالة كل عميل." },
      { type: "feature", text: "⏱ ETA estimate: 'متبقي ~12 دقيقة' بيتحسب لحظياً بناءً على معدل الإرسال الفعلي." },
      { type: "feature", text: "📊 [تفاصيل الحملات السابقة] modal جديد: اضغط على أي حملة في السجل، يفتح modal فيه كل العملاء + حالة كل واحد + الملاحظات + Excel export + 'إعادة الفاشل' و 'إعادة للكل' (يفتح حملة جديدة بنفس الجمهور)." },
      { type: "feature", text: "🗑 حذف الحملات: زر 🗑 على كل صف في سجل الحملات + زر 'امسح الكل'. سجل الحملات بقى عنده Excel export برضه." },
      { type: "improvement", text: "💾 [breaking] الحملات دلوقتي بتحفظ تفاصيل كل العملاء (`items[]` بـ id/name/phone/status/sentAt/skipNote/customMessage) — مش بس ملخص. ده بيخلي شاشة 'تفاصيل الحملة' تعرض كل التفاصيل. حملات قديمة قبل V19.29 هيكون عندها summary بس وده مش هيتعطل." },
      { type: "improvement", text: "🛡 buildAudience دلوقتي بيستثني المحظورين تلقائياً قبل ما تعد العملاء. مفيش طريقة عشوائية ترجعهم — لازم تشيلهم من قائمة المحظورين يدوياً." },
    ]
  },
  {
    version: "V19.28",
    date: "2026-05-02",
    types: ["feature", "architectural"],
    title: "🤖 Bridge Mode للحملات — إرسال تلقائي عبر whatsapp-web.js + الوضع اليدوي محتفظ",
    changes: [
      { type: "feature", text: "🌉 [مكون جديد] `clark-wa-bridge/` — Node.js server محلي بيشغل WhatsApp Web تلقائياً عبر whatsapp-web.js + Puppeteer. مجلد كامل بـ `server.js` (450 سطر) + `package.json` + `README.md` بتعليمات التشغيل. لازم يشتغل على PC/Raspberry Pi/VPS مفتوح بشكل دائم. يربط مرة واحدة بـ QR ويفضل شغال." },
      { type: "feature", text: "📤 [وضعين للإرسال] في صفحة الحملات: الوضع اليدوي (الافتراضي، آمن قانونياً 100%) + الوضع التلقائي الجديد (Bridge). بعد ما تختار قالب وجمهور، الـwizard بيوقّفك على شاشة 'اختر طريقة الإرسال' فيها كارتين — يدوي vs تلقائي مع indicator حالة البريدج (متصل/غير متصل/محتاج QR)." },
      { type: "feature", text: "⚙️ [إعدادات البريدج] صفحة كاملة في الحملات (زر '⚙️ بريدج' في الـheader): URL البريدج، اختبار اتصال، عرض QR code للربط، إعدادات anti-ban (delays، daily cap، batch size، batch breaks)، toggle لـ retry وdetect opt-outs. حساب تقديري للوقت المتوقع للإرسال." },
      { type: "feature", text: "🛡 [ميزات احترافية في البريدج] random delays عشوائية (8-25 ث افتراضي) + simulated typing (2-5 ث) + daily cap server-side + batch breaks (كل 20 رسالة وقفة 4-8 د) + retry تلقائي للفاشل + opt-out detection (لو حد رد STOP/إلغاء يتسجل ويتجنب) + auto-validate للأرقام (بيشيك مسجل في WhatsApp ولا لأ) + تطبيع رقم مصري تلقائي." },
      { type: "feature", text: "📊 [Live progress في BridgeSendScreen] polling كل 2.5 ث على /status و/queue. عرض إحصائيات real-time: ✓ تم، ✉ بيبعت، ⊘ تخطّى، ✕ فشل، ⏳ متبقي. progress bar + قائمة بكل عميل وحالته الحالية + الوقت اللي اتبعت فيه. أزرار pause/resume/stop. لو أقفلت الصفحة الإرسال بيكمل في الخلفية من البريدج." },
      { type: "feature", text: "💾 [persistence] إعدادات البريدج محفوظة في `data.campaignBridge`. الحملة بتتسجل في `data.campaigns[]` بـ `sendMode: 'bridge'` لتمييزها عن الحملات اليدوية. Cap 50 حملة." },
      { type: "architectural", text: "⚠️ تحذير صريح في الواجهة: الإرسال التلقائي مخالف لشروط واتساب، الرقم ممكن يتحظر. UI بيعرض warning أصفر في 3 أماكن: chooseSendMode، settings page، confirmStart. ينصح باستخدام رقم احتياطي." },
      { type: "maintenance", text: "📁 [بنية الملفات] الـbridge في مجلد منفصل `clark-wa-bridge/` على نفس مستوى `src/`. مش بيتركّب مع الـ React build — بيشتغل independent. الاتصال HTTP بسيط (REST endpoints)، CORS مفتوح للـ localhost." },
    ]
  },
  {
    version: "V19.27",
    date: "2026-05-02",
    types: ["fix"],
    title: "🚨 [حرج] إصلاح وضع 'السماح بالسالب' — كان مكسور تماماً",
    changes: [
      { type: "fix", text: "🐛 المشكلة المُبلَّغ عنها: المستخدم اختار وضع 'السماح بالسالب' من إعدادات وضع المخزن (السلوك المتوقع: تسمح بإنشاء أوردر حتى لو الرصيد مش كافي، يطلع تحذير بس مش يمنع). لكن الكود كان لسه بيمنع الأوردر بـ tell() أحمر بدون أي اعتبار للإعداد. الإعداد كان شكلي — `blockOnInsufficientStock=false` كان بيتسجل في الـconfig لكن مفيش حد بيقرأه عند إنشاء الأوردر." },
      { type: "fix", text: "🔍 السبب الجذري: في `App.jsx` `addOrder` (سطر ~2037) و `replaceOrder` (سطر ~2127)، الكود كان بيعمل `checkStockAvailability` ولو في shortages بيـ return فوراً بـ tell error. كان لازم يشيك على `purchaseSettings.blockOnInsufficientStock` قبل ما يقرر يمنع. نفس البق في الـ server-side recheck جوة الـ runTransaction." },
      { type: "fix", text: "✅ الإصلاح: ضفت متغير `_blockShortage = (purchaseSettings.blockOnInsufficientStock !== false)` ولما في shortages: لو `_blockShortage` = true → امنع زي الأول. لو false → showToast أصفر تحذيري ('⚠️ المخزن غير كافي — هيتم الخصم بالسالب') وكمل الأوردر. نفس المنطق على المستويين (local pre-check + server runTransaction)." },
      { type: "fix", text: "📋 السلوك الجديد لكل وضع: 'مغلق' (off) — مفيش خصم تلقائي خالص. 'عرض فقط' (display) — مفيش autoDeduct، مفيش فحص. 'السماح بالسالب' (warning) — يخصم وممكن يطلع سالب + تحذير. 'صارم' (strict، default) — يمنع لو الرصيد مش كافي. كل الأوضاع شغّالة دلوقتي زي ما هي مكتوبة في الإعدادات." },
      { type: "improvement", text: "🛡 ملاحظة: `deductStockForOrder` كان بيتعامل مع negative stock صح من الأصل (بيعمل `r2(stock - delta)` بدون cap على 0)، فالـstock بيطلع سالب طبيعي في الوضع الجديد. الـ alerts والـ banner اللي في WarehousePg بيعرضوا الـnegative stocks في تنبيهات الجرد." },
    ]
  },
  {
    version: "V19.26",
    date: "2026-05-02",
    types: ["fix"],
    title: "🔄 [revert] منطق فلتر الأسبوع للمديونيات — أول خصم في الأسبوع اللي بعد تاريخ المديونية",
    changes: [
      { type: "fix", text: "🔄 رجوع لمنطق V19.22 الأصلي: `if(week.weekStart < d.startDate) skip`. التوضيح من المستخدم: 'تاريخ المديونية يوم الخميس 23-4 وبداية الخصم على الموظف الاسبوع اللي بعده يعني 30-4'. يعني الأسبوع اللي يحتوي تاريخ المديونية (بدايته قبل تاريخ المديونية) لا يُخصم. أول خصم في الأسبوع اللي بدأ في أو بعد تاريخ المديونية." },
      { type: "fix", text: "📋 مثال عملي (المستخدم): مديونية بداية 23-4 (الخميس، آخر يوم في W17). W17 (weekStart 18-4) → 18<23 → SKIP ✓. W18 (weekStart 25-4) → 25<23 false → INCLUDE ✓. النتيجة: قسط واحد بس عند إقفال W18، مش اتنين كما كان يبان قبل التصحيح." },
      { type: "fix", text: "🔧 V19.23 كان بيستخدم `weekEnd < d.startDate` بدل `weekStart` — ده كان بيخلي W17 (weekEnd=23-4) مؤهل في حالة المستخدم بالغلط. تم الرجوع للمنطق الأصلي. الـ recovery scanner (V19.23-24) بيستخدم نفس الفلتر دلوقتي عشان يكون متناسق مع الخصم التلقائي." },
    ]
  },
  {
    version: "V19.25",
    date: "2026-05-02",
    types: ["improvement"],
    title: "📤 رسالة واتساب يومية الخزنة — إجماليات فقط",
    changes: [
      { type: "improvement", text: "📤 إزالة قسم 'تفاصيل الحركات' من رسالة WhatsApp اليومية للخزنة. الرسالة دلوقتي بتحتوي على: رصيد افتتاحي، إجمالي الوارد، إجمالي المنصرف، صافي اليوم، رصيد الإقفال، عدد الحركات، الوارد حسب التصنيف، المنصرف حسب التصنيف. ده بيخلي الرسالة أقصر وأنظف للمتلقي." },
      { type: "improvement", text: "📋 ملاحظة: التقرير المطبوع (HTML) لسه بيحتوي على كل تفاصيل الحركات الفردية — التغيير ده على رسالة WhatsApp بس." },
    ]
  },
  {
    version: "V19.24",
    date: "2026-05-02",
    types: ["fix"],
    title: "🐛 [hotfix] مكتشف الأقساط: إصلاح JSX comment غير مغلق + تخفيف الفلتر",
    changes: [
      { type: "fix", text: "🐛 المكتشف في V19.23 ما ظهرش في الواجهة. سببين: (1) JSX comment block ناقصه `}` في الآخر فالـ render فشل صامت. (2) الفلتر كان متشدد جداً: بيشترط `w.status===\"closed\"` + `d.createdAt<w.closedAt` (مقارنة timestamps دقيقة قابلة للفشل)." },
      { type: "fix", text: "✅ المنطق الجديد أبسط وأقوى: بدل ما نشيك على hrWeeks بشروط متشددة، نسكان `data.hrLog` مباشرة. لو الموظف عنده salary entry لأسبوع معين، يبقى اتدفعله مرتب في الأسبوع ده. لو الأسبوع weekEnd >= debt.startDate، يبقى مؤهل. مفيش checks زيادة." },
      { type: "fix", text: "🛡 Fallback آمن: لو مش لاقي الأسبوع في hrWeeks (بيانات قديمة)، يبني object من الـ hrLog entry نفسها (weekStart/weekEnd/weekNum). كده الـ recovery هيشتغل حتى مع بيانات قبل ما الأسابيع كانت بتتسجل في hrWeeks." },
      { type: "improvement", text: "📋 الـ banner لسه بنفس الشكل: لون أصفر + قائمة الأسابيع + زر 'تسجيل الكل'. اضغطه ضغطة واحدة لسحب كل الأسابيع المفقودة دفعة واحدة." },
    ]
  },
  {
    version: "V19.23",
    date: "2026-05-02",
    types: ["fix", "feature"],
    title: "🚨 [حرج] إصلاح باج فلتر الأسبوع للمديونيات + مكتشف الأقساط المفقودة",
    changes: [
      { type: "fix", text: "🐛 [الباج المُكتشف] في `empDebtInstallment` (سطر 2825 من HRPg)، الفلتر كان: `if(week.weekStart < d.startDate) skip`. ده غلط — معناه إن لو مديونية اتعملت يوم الخميس 23-4 (آخر يوم في W16، بدايته 17-4)، الـ W16 close كان بيتجاهلها لأن weekStart 17-4 < startDate 23-4. ده لا يطابق توقع المستخدم: 'دخلت المديونية ودي اتخصمت في إقفال الأسبوع'." },
      { type: "fix", text: "✅ التصحيح: تم تغيير المقارنة لـ `week.weekEnd < d.startDate`. كده الأسبوع اللي **انتهى** في يوم بداية المديونية أو بعدها مؤهل للخصم. مثال: W16 (weekEnd=23-4) مع debt startDate=23-4 → 23<23 = false → يُحتسب ✓. W15 (weekEnd=16-4) مع نفس المديونية → 16<23 = true → يتجاهل ✓ (صح، الأسبوع ده انتهى قبل المديونية)." },
      { type: "feature", text: "🔍 [HR] مكتشف الأقساط المفقودة على كل مديونية نشطة. لو في أسبوع كان مؤهل للخصم لكن مش متسجّل (بسبب الباج القديم أو لأن المديونية اتعملت بعد إقفال أسبوع)، بيظهر banner أصفر بعدد الأسابيع المفقودة + قائمة بأسابيع W17/W18 إلخ + زر 'تسجيل الـX قسط'. ضغطة واحدة تلحق كل المتأخرات." },
      { type: "improvement", text: "🛡 الكشف بيتأكد قبل الاقتراح: (1) الأسبوع مغلق و(2) لم يُسجّل بالفعل و(3) الموظف عنده hrLog salary entry فيه و(4) المديونية اتعملت قبل ما الأسبوع يُغلق. كده مفيش false positives." },
      { type: "improvement", text: "📋 الأسابيع اللي اتسجلت عبر المكتشف بتتميّز في `recoveredWeekIds[]` للتدقيق. شفافية كاملة." },
    ]
  },
  {
    version: "V19.22",
    date: "2026-05-02",
    types: ["improvement", "feature"],
    title: "🧹 تنظيف التوب بار + سجل دفعات المديونيات",
    changes: [
      { type: "improvement", text: "🧹 إزالة pill 'مزامنة من X د' و pill '👥 الفريق' من التوب بار — كانوا بيشغلوا حيز كبير. حذف كامل لـ `TeamActivityModal.jsx` + الـ import + الـ state + render. الـ tooltip 'آخر مزامنة' لسه موجود على pill الحالة (المتصل/أوفلاين) و في banner وضع القراءة فقط." },
      { type: "feature", text: "📋 [HR] قسم 'سجل الدفعات' جديد على كل كارت مديونية — بيعرض كل قسط اتسجل: تلقائياً (📅 أسبوع W17 + التاريخ) أو يدوياً (✋ + التاريخ + الملاحظة). بيشمل المبلغ المدفوع لكل قسط. لو في دفعة جزئية، بتظهر مع 'ناقص X — تم تمديد الأقساط'. شفافية كاملة لما اتخصم وإمتى." },
      { type: "feature", text: "💡 [HR] tooltip توضيحي لما المديونية لسه ما اتقسطش حاجة: 'الأقساط بتنزل تلقائياً مع كل إقفال أسبوع — بشرط: المديونية موجودة قبل الإقفال + بداية الأسبوع بعد أو يساوي تاريخ بداية المديونية'. بيوضح للمستخدم متى يعمل الخصم التلقائي ومتى يلجأ للزر اليدوي." },
      { type: "fix", text: "🔍 توضيح: الخصم التلقائي للأقساط شغّال من الأصل في `weekly close` (سطر 1581 في HRPg). بيخصم القسط من الموظف وبيحدّث `paidWeekIds` تلقائياً. لو ظاهر 0 في شاشة المديونيات بعد إقفال أسبوع، السبب الأرجح: تاريخ بداية المديونية بعد بداية الأسبوع → الكود عن قصد ما خصمش. الحل: استخدم زر '+قسط مدفوع يدوي' لتسجيل الأسابيع السابقة." },
    ]
  },
  {
    version: "V19.21",
    date: "2026-05-02",
    types: ["improvement"],
    title: "🎨 popup المرحلة: تصميم أبيض نظيف بإطار ملوّن",
    changes: [
      { type: "improvement", text: "🎨 تغيير تصميم popup مرحلة الأوردر (StageProgressModal) لتصميم أبيض كامل (variant B). الخلفية بيضا 100% بدون شفافية، إطار 2px بلون المرحلة الكامل (أصفر للتشغيل، أحمر للطباعة، إلخ)، نصوص بألوان عادية (T.text/T.textSec) للوضوح الأقصى." },
      { type: "improvement", text: "🏷 الـ pill بتاع المرحلة لسه ملوّن (15% alpha + لون داكن للنص + إطار 40% alpha)، والـ% الكبير لسه بلون المرحلة. الهوية البصرية محفوظة بدون ضوضاء على القراءة." },
      { type: "improvement", text: "🔘 زر الإغلاق ✕ دلوقتي بخلفية رمادي محايد بدل ما كان بلون المرحلة — أنظف وأوضح إنه زر إغلاق." },
    ]
  },
  {
    version: "V19.20",
    date: "2026-05-02",
    types: ["fix", "feature"],
    title: "🚨 [حرج] إصلاح بيانات الورش + الخزنة كمصدر وحيد للحقيقة + popup أوضح + قسط يدوي",
    changes: [
      { type: "fix", text: "🐛 [المشكلة المُبلَّغ عنها] ورشة نورهان: الدفعات الفعلية 40,800 ج.م، لكن ملخص الحساب بيعرض 51,600 ج.م. السبب: V18.72 fallback كانت بتجمع `wsPayments` + orphan treasury، وفي حالة ما المستخدم يمسح حركة من الخزنة بدون ما يمسح الـ wsPayments المرتبطة، الـ wsPayment الـ ghost كان لسه بيتحسب." },
      { type: "fix", text: "🚨 [الأخطر] V19.17 auto-sync اللي بنيتها كانت بتنشئ wsPayments تلقائياً من orphan treasury entries — اللي معناه أن المسح كان مستحيل في حالات معينة: تمسح wsPayment، الـ treasury orphan، الـ auto-sync ترجع تنشئ الـ wsPayment تاني. تم إزالتها بالكامل." },
      { type: "feature", text: "✅ wsAccounts دلوقتي بتقرأ من **الخزنة فقط** كمصدر وحيد للحقيقة. الإجماليات هتطابق ما اتحرك فعلاً في فلوس الخزنة. الـ wsPayments أصبحت index ثانوي للعرض. النتيجة الفورية: 51,600 يرجع 40,800 من غير ضغط زر." },
      { type: "feature", text: "🧹 [أداة جديدة] 'تنظيف بيانات الورش': زر ⚠️ في صفحة حسابات الورش بيظهر لما في تضارب. بيعرض كل ghost payments (سجلات بدون قيد خزنة) وكل orphan treasury (قيود بدون سجل). لكل سطر: 'احذف' أو 'اعمل الطرف الناقص'. تنظيف يدوي شفاف 100%." },
      { type: "feature", text: "🔗 جدول دفعات الورش دلوقتي بيوضح: الصفوف الـ ghost بـ 👻 + شطب على المبلغ + خلفية حمرا (مش محتسبة). صفوف الـ orphan treasury بـ ⚠️ + خلفية صفرا (محتسبة). يفرّق بين النوعين بصرياً قبل ما تفتح أداة التنظيف." },
      { type: "improvement", text: "🔒 Bilateral cascade في حذف الخزنة: لو مسحت قيد خزنة مرتبط بـ wsPayment/custPayment/supplierPayment، السجل المقابل بيتمسح كمان (سواء عبر forward link `treasuryTxId` أو reverse link `wsPaymentId`). يمنع تكوّن inconsistencies جديدة." },
      { type: "improvement", text: "🎨 popup مرحلة الأوردر: زيادة opacity للوضوح. الخلفية 12%→22%، الـ header 8%→18%، الـ borders 35%→55%، pills بيضا 70%→85%. أوضح بدون فقدان الطابع الشفاف الهادئ." },
      { type: "feature", text: "💰 [HR] زر '+ قسط مدفوع' على كارت المديونية النشطة في popup المديونيات. بيفتح modal لتسجيل قسط يدوياً مع تاريخ + ملاحظة. مفيد للحالات اللي الخصم اتعمل فيها بـ specialDeduct أو المديونية اتعملت بعد إقفال أسبوع — حالات الـ paidWeekIds مكنش بيتسجل تلقائياً فيها." },
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
