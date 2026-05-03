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
    version: "V19.36",
    date: "2026-05-03",
    types: ["feature", "improvement"],
    title: "🖼 صور الموديلات بقت 5× أوضح + بتترفع لـ Storage مباشرة",
    changes: [
      { type: "improvement", text: "🖼 [جودة أعلى] صور الموديلات الجديدة بتترفع 1280px @ 85% quality، بدل 250px @ 40% اللي كانت قبل كده. الصورة بتظهر حادة على واتساب وبتكبر الـ 5× تقريباً (250px→1280px). الأوردرات القديمة لسه على الجودة القديمة لأن الأصل ضاع وقت الضغط — لو موديل مهم، احذف الصورة وارفعها من الأصل." },
      { type: "improvement", text: "📦 [order docs أصغر] الصور دلوقتي بتتخزن في Firebase Storage، الـ Firestore بيخزن URL ~200 بايت بدل base64 ~5-8KB. كل order doc بقى ~1-2KB (كان ~8KB). فايدة كبيرة لو فيه ٢٠٠+ أوردر." },
      { type: "feature", text: "🔄 [Migration banner] في تاب الصيانة، Card بيظهر تلقائياً لو في أوردرات صورهم لسه base64 inline. بيقولك بكام موديل + إجمالي الـ KB، وزر '🔄 ترحيل دلوقتي'. الترحيل بيرفع الصور الموجودة كما هي لـ Storage (مش بيحسن جودتها — بيوفر مساحة بس)." },
      { type: "improvement", text: "🧹 [Storage cleanup] لما بتمسح صورة موديل أو بتحذف الأوردر بالكامل، الـ Storage object بيتمسح تلقائياً (fire-and-forget). كده مفيش orphans." },
      { type: "feature", text: "🔬 [أداة التحليل بقت dropdown] الـ Card '🔬 تحليل مكوّنات factory/config' في تاب الصيانة بقى collapsible — قافل default، بيعرض إجمالي الـ doc بس في سطر واحد. اضغط للتفاصيل. الإصلاح بناء على feedback المستخدم (الـ Card كانت طويلة وبتاكل مساحة)." },
      { type: "fix", text: "🔧 [storage.rules] قسمنا allow write لـ allow create/update (مع size check) و allow delete (بدون size check). قبل كده الـ delete كان بيرجع unauthorized لأن request.resource بتكون null في الـ delete، فالـ size check بيفشل." },
    ]
  },
  {
    version: "V19.35",
    date: "2026-05-03",
    types: ["architectural", "fix"],
    title: "🏗️ صور القوالب اتنقلت لـ Firebase Storage — وقف نزيف الـ factory/config",
    changes: [
      { type: "architectural", text: "🏗️ [مشكلة معمارية حرجة] الـ Firestore document factory/config وصل 100% (1323/1024 KB) لأن V19.33-V19.34 كانوا بيخزّنوا صور القوالب base64 جوة الـ document. أي صورة 200-700KB كانت بتاكل من حد الـ 1MB، فالـ writes بتاعت العملاء/الموردين/الموظفين كانت معرضة لـ silent failures. النوع ده من الأخطاء بيكون خطير: مفيش رسالة خطأ واضحة، البيانات ممكن تتلخبط." },
      { type: "fix", text: "✅ [الحل] الصور دلوقتي بتترفع لـ Firebase Storage (الـ infrastructure كانت موجودة بالفعل من V15.90 — بنستخدم نفس الـ pattern بتاع الـ orders attachments). الـ Firestore بيخزن بس URL ~200 بايت بدل base64 ~700KB. تخفيض ~3500× في حجم الـ document لكل صورة." },
      { type: "feature", text: "🔄 [Migration UI] في صفحة القوالب، Banner بيظهر تلقائياً لو في قوالب فيها صور base64 قديمة. بيقولك بكام KB في Firestore هتتفرّغ + زر '🔄 ترحيل دلوقتي'. الترحيل بيرفع كل صورة لـ Storage ويستبدل الـ base64 بـ {storagePath, url} في document write أصغر. كل قالب بيتحدّث بشكل مستقل، فلو فشل قالب واحد، الباقي بيكمّل." },
      { type: "improvement", text: "🌉 [Bridge: URL fetching + cache] السيرفر اتحدّث ياخد {url, mime, name} بدل {base64, mime, name}. بيعمل fetch من Firebase Storage مرة واحدة لكل صورة لكل حملة (1 ساعة TTL، LRU cache بحد 50 entry). يعني حملة لـ 50 عميل بنفس الصورة = fetch واحد بس مش 50. backwards-compatible مع legacy base64 entries." },
      { type: "improvement", text: "🧹 [Storage cleanup] لما بتمسح قالب أو تشيل صورة من قالب، الـ Storage object بيتمسح تلقائياً (fire-and-forget — أخطاء الحذف non-fatal). كده مفيش orphans بتتراكم في Storage." },
      { type: "fix", text: "🐛 [قياس غلط في الإعدادات] القسم '📊 احصائيات التخزين (لكل مستند)' في تاب الصيانة كان بيعرض 1325 KB لـ factory/config بينما الحقيقة 652 KB. السبب: كان بيقيس `JSON.stringify(config).length` (UTF-16 code units) للـ object الـ merged (config + sales + tasks + treasury + auditLog + hrLog + hrWeeks). دي كلها مش جوة factory/config أصلاً — اتقسموا لـ collections منفصلة من V16.74-V16.75. تم حذف القسم الغلط بالكامل." },
      { type: "feature", text: "🔬 [أداة جديدة: تحليل مكوّنات factory/config] في تاب الصيانة، Card بيعرض كل top-level field في الـ document الخام بحجمه الحقيقي بالـ UTF-8 bytes (نفس اللي Firestore بيشوفه). مرتب من الأكبر للأصغر، مع color coding (أخضر/أصفر/برتقالي/أحمر) و📷 base64 tag للـ fields اللي فيها صور inline. ده الأساس اللي هنبني عليه قرارات الـ subcollection splitting المستقبلية." },
    ]
  },
  {
    version: "V19.34",
    date: "2026-05-03",
    types: ["fix"],
    title: "🐛 إصلاح: الصور كانت بتفشل في الإرسال — auto-compression + diagnostic logs",
    changes: [
      { type: "fix", text: "🐛 [bug رئيسي] الصور 3MB+ كانت بتفشل تتحفظ في Firebase (silent — بسبب حد 1MB لكل document في Firestore). الـ template.images كان بيتحفظ فاضي، فلما الحملة تشتغل، مفيش صور تتبعت." },
      { type: "feature", text: "🗜 [auto-compression] أي صورة بترفعها بتتضغط تلقائياً client-side: max 1280px width/height، JPEG quality 82%. الصور 3-5MB بتنزل لـ 200-400KB. كده الـ template.images بيتحفظ بنجاح في Firebase والصور بتتبعت في الحملة." },
      { type: "improvement", text: "📊 [diagnostic logs] قبل ما يبدأ الإرسال للبريدج، الكونسول بيطبع: عدد الرسائل، عدد الصور، حجم أول صورة base64، حجم الـ payload الإجمالي. لو في حد أكتر من 12MB، بيظهر تأكيد قبل الإرسال." },
      { type: "improvement", text: "✅ [حد آمن] كل صورة بعد الضغط لازم تكون أقل من 700KB base64 (مع safety margin). لو أكبر، رسالة خطأ واضحة. الإجمالي للقالب الواحد لازم أقل من 3MB base64." },
    ]
  },
  {
    version: "V19.33",
    date: "2026-05-03",
    types: ["feature"],
    title: "📷 صور حقيقية في حملات Bridge + قوالب جاهزة للمستخدم الجديد",
    changes: [
      { type: "feature", text: "📷 [Bridge images] رفع صور حقيقية من القالب — تتبعت كـ attachment فعلي مع الرسالة في وضع Bridge. حد أقصى 5 صور · 5MB إجمالاً. multi-select من file picker، preview بـ thumbnails، زر ✕ لمسح كل صورة، badge بحجم الملف. النص بيتحط مع أول صورة كـ caption، الباقي صور بدون نص. فاصل عشوائي 1-2 ث بين الصور (anti-spam)." },
      { type: "feature", text: "📷 [Campaign extra images] في BridgeSendScreen قبل الإرسال، تقدر تضيف صور إضافية للحملة دي بس (مش مرتبطة بالقالب). الـ UI بيوضح أنهي صورة من القالب (badge بنفسجي) وأنهي مضافة للحملة (badge أخضر). الإجمالي يفضل 5 صور كحد أقصى." },
      { type: "feature", text: "✨ [قوالب جاهزة للمستخدم الجديد] لما القوالب فاضية، CLARK بيعرض اقتراحين: (1) 'تذكير دفع (يدوي)' — قالب نص نظيف للوضع اليدوي، يستخدم {اسم} و{رصيد} و{لينك}. (2) 'عرض جديد بالصور (Bridge)' — قالب بنص دعائي + توجيه لرفع صور للـ Bridge. زر ➕ استخدم بيضيف القالب فوراً ويسمحلك تعدّل عليه." },
      { type: "feature", text: "🌉 [Bridge server] دعم media[] array في endpoint /send + processQueue. backwards compatible مع legacy mediaBase64 single-image. الـ MessageMedia loop بيبعت كل صورة لوحدها مع caption للأولى فقط، sleep(rand(1000,2000)) بين الصور." },
      { type: "improvement", text: "🎨 [قائمة القوالب] badge أخضر '📷 N صورة (Bridge)' بيظهر على القوالب اللي فيها صور مرفوعة، علشان المستخدم يميّز بسرعة بين قوالب نصية وقوالب بصور. الـ badge القديم '🖼 رابط صورة (يدوي)' لسه ظاهر للقوالب اللي فيها imageUrl." },
      { type: "improvement", text: "💡 [وضوح الـ UI] في Template Editor، حقل 'رابط صورة' و قسم 'صور مرفقة (Bridge)' منفصلين بصرياً وكل واحد فيه شرح الفرق. تحذير صريح: 'في الوضع اليدوي: الصور دي مش بتتبعت — استخدم رابط صورة فوق'." },
    ]
  },
  {
    version: "V19.32",
    date: "2026-05-03",
    types: ["feature"],
    title: "🔗 لينك Portal لكل عميل في الحملات (placeholder \u007Bلينك\u007D)",
    changes: [
      { type: "feature", text: "🔗 [placeholder جديد] {لينك} في قوالب الحملات — بيتحوّل لـ portal URL خاص بكل عميل (read-only لحسابه: رصيد + طلبات + مدفوعات). الـ URL مولّد عبر `/api/customer-portal-sign` مع HMAC signature آمن — مش ممكن يتلاعب فيه أو يتنبأ به." },
      { type: "feature", text: "⚡ [pre-fetch تلقائي] لما القالب فيه {لينك}، CLARK بيولّد لينكات كل العملاء قبل ما الحملة تبدأ. شاشة loading بـ progress bar (5 requests متوازية) + fallback لو فشل توليد بعض اللينكات (بيتُترك فاضي في الرسالة دي بس)." },
      { type: "feature", text: "💾 [Resume support] الـ portal URLs محفوظة مع الحملة في `data.activeCampaigns[]`. لو قفلت CLARK في النص، رجعت تستأنف، الـ URLs مش بتتولّد تاني — بتستخدم المحفوظة. لو في عملاء جداد ما عندهمش URL، بنولّد للمفقودين بس." },
      { type: "improvement", text: "✏️ [Template Editor] preview بيستخدم sample URL وهمي عشان تشوف شكل الرسالة قبل ما تحفظ. الـ {لينك} ظاهر في قائمة المتغيرات مع بقية الـ tokens." },
      { type: "improvement", text: "🌉 [Both modes] اللينكات شغالة في الوضع اليدوي (wa.me) والـ Bridge (auto). شاشة الـ confirmation في Bridge mode بتعرض رسالة نجاح خضرا: '✓ تم توليد X لينك Portal بنجاح'." },
    ]
  },
  {
    version: "V19.31",
    date: "2026-05-03",
    types: ["feature", "improvement"],
    title: "📊 Dashboard كامل للبريدج داخل CLARK + 5 تابات احترافية",
    changes: [
      { type: "feature", text: "📊 [Dashboard tab] صفحة لوحة متابعة كاملة داخل CLARK بدل ما تفتح صفحة البريدج من بره. حالة الاتصال (متصل/QR/منقطع) + اسم الرقم المتصل + uptime + 6 stat cards كبيرة (مرسلة اليوم، في الطابور، إجمالي مرسل، فشل، opt-outs، بيبعت الآن) + progress bar للحد اليومي + auto-refresh كل 5 ثواني + آخر 10 نشاطات معاينة." },
      { type: "feature", text: "⚙️ [Settings tab] كل الإعدادات في تابة منفصلة: URL + Auth Token + delays (مع Typing simulation الجديدة) + daily cap + batch size + batch breaks + retry + opt-out detection. زر اختبار اتصال + ملخص توقعات الوقت." },
      { type: "feature", text: "📈 [Stats tab] إحصائيات تفصيلية: معدل النجاح %، متوسط الإرسال بالثانية، إجمالي مرسل، إجمالي فاشل، مدة الجلسة، توزيع آخر 50 محاولة (نجح/فشل/تخطّى)، أكثر 10 عملاء استلاماً مرتبين." },
      { type: "feature", text: "📋 [Activity tab] سجل آخر 100 محاولة إرسال من البريدج (بيتحدّث live). فلتر بالحالة (الكل/نجح/فشل/تخطّى)، اسم العميل + الرقم + الوقت النسبي ('الآن'، '5 د', '2 س') + سبب الفشل + مدة الإرسال." },
      { type: "feature", text: "🛠 [Tools tab] أدوات قوية: (1) إرسال رسالة اختبار لرقم محدد (تتبعت فوراً بدون queue) — مفيد للتأكد إن البريدج شغال (2) إدارة قائمة opt-outs — عرض كل الأرقام، إضافة جماعية بـ paste من Excel، حذف فردي (3) تصفير العداد اليومي مع تحذير." },
      { type: "feature", text: "📱 [QR في CLARK] لو الواتساب اتقطع، الـ QR هيظهر مباشرة في Dashboard tab داخل CLARK — مش لازم تفتح URL البريدج من بره. خلفية صفرا واضحة + تعليمات بالعربي." },
      { type: "feature", text: "🎮 [أزرار تحكم سريعة] في الـ Dashboard: ⏸ إيقاف مؤقت، ▶ استئناف، ⏹ إيقاف نهائي، 🧹 مسح المكتمل، 🔌 قطع الاتصال (re-scan QR). الأزرار بتظهر/تختفي حسب الحالة (مثلاً: 'إيقاف مؤقت' بيظهر بس لو في رسائل بتتبعت)." },
      { type: "feature", text: "🔧 [Bridge endpoints جديدة] على السيرفر: GET /activity (سجل النشاط), GET /qr (للعرض داخل CLARK), POST /test-message (إرسال فوري), POST /reset-daily, POST /optouts/bulk-add, GET /stats (analytics مفصلة). كل النشاطات بتتسجل تلقائياً في log في الذاكرة (max 100 entry) مع timestamp + duration + customer name." },
      { type: "improvement", text: "💡 [UX] الـ Dashboard بيعمل auto-refresh كل 5 ثواني — مفيش حاجة تضغط refresh. الإحصائيات في الأعلى دايماً محدّثة. لو حصل error في الاتصال، رسالة واضحة بـ guidance تقولك ايه التحقق من URL/Token + التذكير بـ 'docker compose ps'." },
      { type: "improvement", text: "🎨 [تصميم] tabs بنية tabbed clean + active state واضح بـ underline ملوّن. كل تابة شاشة كاملة عشان مفيش scroll لانهائي. BigStat cards فيها icon + label + value كبير + sub-label للسياق." },
    ]
  },
  {
    version: "V19.30",
    date: "2026-05-03",
    types: ["feature", "architectural"],
    title: "🌐 Bridge على VPS — Docker + HTTPS تلقائي + Auth Token",
    changes: [
      { type: "feature", text: "🐳 [جديد] `Dockerfile` للبريدج — Node 20 + Chromium pre-installed. صورة جاهزة تشغّل في أي مكان. حجم 350MB تقريباً." },
      { type: "feature", text: "🔧 [جديد] `docker-compose.yml` — يشغّل خدمتين: bridge (داخلي) + Caddy (reverse proxy). Volumes للسيشن والشهادات. auto-restart لو في crash. CORS مفتوح للـ CLARK." },
      { type: "feature", text: "🔒 [جديد] `Caddyfile` — reverse proxy بـ HTTPS تلقائي. Caddy بيطلب شهادات Let's Encrypt تلقائياً للـ domain اللي تختاره ويجدّدها كل شهرين بدون تدخل. HSTS + security headers مفعّلة." },
      { type: "feature", text: "🚀 [جديد] `setup-vps.sh` — سكريبت آلي يعمل كل حاجة بأمر واحد على VPS فاضي (Ubuntu 22/24): تحديث النظام، تركيب Docker + Compose، ضبط UFW firewall (ports 22/80/443)، توليد Auth Token عشوائي 64-حرف، بناء وتشغيل البريدج." },
      { type: "feature", text: "🔐 [أمان] `AUTH_TOKEN` في server.js — middleware جديد بيتشيك Authorization: Bearer header على كل endpoint (ماعدا / و /status). أي طلب بدون token صحيح بيرجع 401. السكريبت بيولّد token عشوائي ويحطه في .env. CLARK لازم تبعت الـ token عشان البريدج يقبل الطلبات." },
      { type: "feature", text: "🎨 [CLARK UI] خانة 'Auth Token' جديدة في صفحة إعدادات البريدج — بـ type=password عشان متظهرش. الـ token بيتحفظ في `data.campaignBridge.token`. كل bridge calls (status, send, queue, pause, resume, stop, settings, etc.) بتمرر الـ token تلقائياً. لو 401 من السيرفر، رسالة واضحة 'Unauthorized — تأكد من Auth Token'." },
      { type: "feature", text: "📚 [دليل عربي كامل] `SETUP-VPS.md` — خطوة بخطوة لتشغيل البريدج على VPS من الصفر: رفع الملفات، تشغيل setup-vps.sh، انتظار شهادة HTTPS، scan QR، ربط CLARK. + قسم troubleshooting + أوامر مفيدة + backup السيشن." },
      { type: "improvement", text: "🛡 [أمان VPS] firewall بيقفل كل الـ ports غير 22 (SSH), 80 (HTTP لـ Let's Encrypt), 443 (HTTPS). البريدج (3001) ما بيتعرضش لبره — بس Caddy بيوصل له داخلياً. مفيش direct access للـ bridge من الخارج." },
      { type: "improvement", text: "🔄 [Persistent volumes] السيشن (`.wwebjs_auth`) و الـ state (`.bridge-state.json`) محفوظين في Docker volumes. لو البريدج اتوقف أو الكونتينر اتعاد بناؤه، الـ session مش هتضيع — مش هتحتاج تـ scan QR تاني." },
    ]
  },
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
