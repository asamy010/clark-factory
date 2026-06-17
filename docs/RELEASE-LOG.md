# CLARK — RELEASE LOG (سجل الإصدارات التفصيلي)

> **هذا ملف رولينج — يُحدَّث في كل إصدار جديد.** كل نسخة CLARK يتسجّل فيها
> هنا «إيه اللي اتعمل بالتفصيل + الملفات + القرارات». الهدف: أي session جديد
> يفتح الملف ده يفهم تاريخ التطوير من غير ما يقرأ كل الـ git log.
>
> **القاعدة (جزء من البروتوكول §1):** بعد كل تعديل، بعد ما تـ bump النسخة
> وتكتب في `public/changelog.json`، **حدّث الملف ده كمان** بإدخال للنسخة
> الجديدة (الأحدث في الأعلى) + راجِع قسم «🔜 اللي لسه (TODO)».

الأحدث في الأعلى. التواريخ هجري ميلادي مختلطة حسب اليوم.

---

## 🧭 ملخّص السيشن (2026-06-16/17) — V21.27.0 → V21.27.23

**الفكرة الكبيرة:** إعادة هيكلة **الموديل = وصفة** و**الأوردر = الكمية الفعلية**،
مع ربطهم ببعض، + ترقيات كبيرة في **استوديو الـ AI** (محرّر صور شبه Canva،
استخراج برومبتس، مكتبة أقسام)، + إصلاحات أداء/اتصال.

**القرار المعماري المحوري:**
- **الموديل** بيعرّف الوصفة بس: استهلاك القطعة، ألوان (أسماء)، مقاسات، قطع،
  إكسسوار بكمية للقطعة، نسب هالك، تفاصيل تشغيل، صورة/صور ألوان.
- **الأوردر** بيمسك الكميات الفعلية (الراقات لكل لون → كمية القص) + الـ PO
  والحالة والتسليمات. **التكلفة لسه على الراقات في الأوردر** (مفيش تغيير
  في `calcOrder` للقماش).
- **المبيعات معتمدة على كمية الأوردر** زي القديم بالظبط — مفيش ملف مبيعات اتلمس.

---

## V21.27.37 — مؤشّر واتساب صادق + مراقب المجدول 🚨
- **السياق (تشخيص حادثة):** التقارير/التريجرات/الحملات بتعتمد على **VPS
  crontab خارجي** بيضرب `/api/automation-tick` كل 5 دقايق (مش Vercel cron —
  مش في `vercel.json`). لو الـ VPS cron وقف، كله بيقف بصمت، ومؤشّر واتساب
  يفضل أخضر لإنه بيقيس جلسة واتساب (`waReady`) بس — مش حياة المجدول.
- **المؤشّر الصادق:** `BridgeStatusIndicator` بقى ياخد `lastTickAt` (من
  `cfg.automation`) — لو ready بس آخر نبضة >15 دقيقة → 🟡 «متصل — المجدول
  متوقف» + تفاصيل في التول-تيب. تمريره من home bar في `App.jsx`.
- **مراقب المجدول:** `api/cron/scheduler-watchdog.js` (جديد) — Vercel cron كل
  30 دقيقة (بنية مستقلة عن الـ VPS فبيكتشف موته فعلاً). لو lastTickAt >20
  دقيقة → تنبيه واتساب واحد لمستلمي الأتمتة (idempotency عبر
  `automation.watchdogAlertedAt`، cooldown 6 ساعات) عبر `bridgeSend`. لما
  المجدول يرجع، العلم بيتصفّى. cron مضاف في `vercel.json`.
- ⚠️ **الإصلاح الفعلي تشغيلي** (على الـ owner): راجِع الـ VPS crontab +
  `AUTOMATION_TICK_SECRET` + الـ bridge host. الكود هنا بيكشف ويبلّغ بس.
- ملفات: `src/components/BridgeStatusIndicator.jsx` · `src/App.jsx` ·
  `api/cron/scheduler-watchdog.js` · `vercel.json`.

## V21.27.36 — استخراج البرومبت من الصور: fix خطأ التحليل المتقطّع 🪄
- **root cause:** `describe-image.js` بيستخدم gemini-2.5-flash اللي «التفكير»
  فيه enabled افتراضياً — أحياناً بياكل ميزانية التوكنز فيرجّع `parts` فاضية
  (`finishReason=MAX_TOKENS`) → raw فاضي → «تعذّر قراءة نتيجة التحليل».
- **الحل:** `thinkingConfig:{thinkingBudget:0}` + `maxOutputTokens:1024` +
  إعادة محاولة واحدة لو الرد فاضي (مش بسبب حجب أمان) + تشخيص `finishReason`/
  `blockReason` في رسالة الخطأ.
- ملف: `api/ai-image/describe-image.js`. (ملاحظة: `analyze-prompt.js` ليه نفس
  النمط — مرشّح لنفس التحصين لو ظهرت نفس المشكلة فيه.)

## V21.27.35 — استوديو الصور: رجوع أسماء الأزرار كاملة (fix) 🔤
- الـ grid (cols=ceil(n/2)) في V21.27.31 كان بيضيّق الأزرار فالأسماء تتقصّ
  لـ «...». رجعنا لـ `flex-wrap` بعرض طبيعي (`bStyle` بدون width:100%/ellipsis)
  فالأسماء بتظهر كاملة. anchor التحميل رجع `inline-block`.
- ملف: `src/pages/AIStudioPg.jsx`.

## V21.27.34 — قائمة العملاء: عرض كامل + إلغاء الاسكرول الأفقي (fix) 📋
- **العرض:** حاوية صفحة العملاء كانت `maxWidth:1500` → بقت `"100%"` (عرض
  الشاشة كامل).
- **الاسكرول الأفقي:** `react-window` v2 `<List>` بيستخدم `overflow:"auto"`
  فكان بيطلّع شريط تمرير أفقي حتى لو المحتوى بعرض الحاوية. الحل: تمرير
  `style={{overflowX: isMob?"auto":"hidden"}}` للـ VirtualList → على الكمبيوتر
  مفيش اسكرول أفقي، على الموبايل اتساب (عشان الأزرار تفضل في المتناول).
- ملف: `src/pages/CustDeliverPg.jsx`.

## V21.27.33 — المحرّر: تحديد/تحريك متعدد + نسخ/لصق بين الصور 🎯
- **تحديد متعدد:** `selIds` (Set) + وضع `multiSel` (زر «🔲 تحديد متعدد»
  للموبايل) أو Shift/Ctrl/⌘+كليك. `startMove` بيحسب التحديد الجديد + بيلتقط
  مواضع كل المحددين (`starts`)، و`onMove` بيحرّكهم كلهم بنفس الدلتا من
  مواضعهم الأصلية. مقابض التكبير/التدوير بتظهر للعنصر المفرد بس.
- **نسخ/لصق بين الصور:** `_editorClipboard` على مستوى الموديول (بيفضل بين
  فتحات المحرّر في الجلسة). `copySelected` بيستنسخ المحددين (deep clone بدون
  id)، `pasteClipboard` بيضيفهم بـ id جديد + نفس المواصفات (الموضع محصور
  داخل حدود الصورة الحالية).
- UI: أزرار تحديد متعدد/نسخ/لصق في التولبار + banner عدد المحددين + زر نسخ
  وحذف-المحدد في الـ inspector.
- ملف: `src/components/ImageEditorModal.jsx`.

## V21.27.32 — المحرّر: شيل الاسطمبة + افتراضيات نص جديدة ✏️
- **شيل الاسطمبة بالكامل:** اتشال `addStamp` + `stampLines` + زر التولبار +
  فرع الرسم في `buildBlob` + فرع DOM + بلوك الـ inspector + preload الخط.
  البديل = نص عادي بخط Anton.
- **افتراضيات النص الجديدة (`addText`):** الخط `'Anton'`، اللون `#000000`،
  `bold:false`، `shadow:false` (بدل الأبيض/بولد/ظل).
- ملف: `src/components/ImageEditorModal.jsx`.

## V21.27.31 — استوديو الصور: أزرار صفّين + شيل الوصف + fix الحذف 🎛️
- **أزرار صفّين:** `resultActions` بقت `display:grid` بأعمدة = `ceil(n/2)` بدل
  `flex-wrap` المتعرّج — كل زر `width:100%` بيملأ خليته → متساويين ومرتّبين.
- **شيل الوصف:** اتشال `{res.desc && <div>...}` من `ResultCard` (تحت الصورة).
  الوصف لسه متخزّن وبيظهر في الزووم/التخزين.
- **fix كامن:** `deleteResult` كان بيستدعي `setPinnedIds` (مش معرّف بعد
  refactor قديم) → `ReferenceError` بيكسر الحذف. اتشال السطر اليتيم.
- ملف: `src/pages/AIStudioPg.jsx`.

## V21.27.30 — المحرّر: تصدير حاد (supersampling) 🖼️
- **البكسلة (root cause):** `buildBlob` كان بيعمل canvas بأبعاد `dims` (دقة
  الصورة الطبيعية) — لو الصورة واطية الدقة، النص/الأرقام بيطلعوا مبكسلين.
  الحل: supersampling — canvas بدقة `ES = min(2.5, 4096/maxSide)` + `ctx.scale(ES,ES)`
  والرسم كله بإحداثيات dims المنطقية → النص يتحوّل لـ fs×ES بكسل حقيقي (حواف حادة).
  imageSmoothingQuality="high". مفيد لكل الطبقات (نص/صور).
- ملف: `src/components/ImageEditorModal.jsx`.

## V21.27.29 — قائمة العملاء بتمتد لآخر الشاشة (fix) 📋
- المشكلة: في V21.27.28 الـ VirtualList كان بارتفاع ثابت `min(rows*54,640)` →
  القائمة بتبان مقطوعة في نص الصفحة مع فراغ كبير تحتها.
- الحل: `VirtualList` بقى ليه وضع `fill` (لما `height` مش متمرّر) — بيقيس
  `getBoundingClientRect().top` ويملأ `innerHeight - top - bottomGap`، مع
  cap على ارتفاع المحتوى الفعلي (مفيش فراغ تحت القوائم القصيرة) وحد أدنى 220px.
  بيتحدّث على `resize` وتغيّر عدد العناصر.
- `CustDeliverPg`: شيل الـ `height={min(...,640)}` → بقى fill تلقائي + overscan 10.
- ملفات: `src/components/VirtualList.jsx` · `src/pages/CustDeliverPg.jsx`.

## V21.27.28 — قائمة العملاء الضخمة: عرض مُحسّن (virtualization) ⚡
- `src/components/VirtualList.jsx` (جديد، مشترك): wrapper رفيع فوق
  `react-window` v2 (`<List>` + `rowComponent` + `rowProps`) — بيرندر الصفوف
  الظاهرة على الشاشة بس (+ overscan) بدل كل الصفوف.
- **قائمة العملاء** (`CustDeliverPg.jsx`): فرع virtualized شرطي **لما العدد
  > 120** — يعرض الكل (مفيش «عرض المزيد») ويرندر visible rows بس. الهيدر
  والصفوف بيشاركوا نفس أنماط الأعمدة عشان المحاذاة تتطابق. ارتفاع الصف 54px،
  منطقة تمرير حتى 640px.
- **محسوب للمخاطرة (§0.1 + §15):** القوائم الصغيرة (< 120 = الحالة الشائعة)
  تفضل بالجدول الأصلي **بدون أي تغيير** — الـ blast radius محصور في حالة
  الـ 1500 عميل بس، وقابل للعكس تمامًا (شيل الفرع الشرطي). الجداول التانية
  (الأوردرات/الخزنة) **ماتلمستش** — virtualization للجداول مخاطرة عالية بدون
  بيئة تجربة، اتأجّلت بقرار Ahmed.
- ⚠️ **محتاج تأكيد production:** التمرير + التعديل + الحذف + الفلترة في قائمة
  عملاء كبيرة (> 120). لو فيه أي خلل بصري، الـ rollback = شيل فرع `if(fc.length>120)`.
- ملفات: `src/components/VirtualList.jsx` · `src/pages/CustDeliverPg.jsx` ·
  `package.json` (react-window).

## V21.27.27 — تحديث Firestore persistence (متعدد التابات + أسرع) ⚡
- النقل من `enableIndexedDbPersistence(db)` المهجور (single-tab فقط — كان
  بيرمي `failed-precondition` لو المستخدم فاتح أكتر من تاب → التاب التاني
  من غير offline cache) للـ API الحديث في `initializeFirestore`:
  `localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })`.
- **الفايدة:** كل التابات بتشارك نفس الـ IndexedDB cache · cold-start أسرع
  (القراءات من الـ cache قبل الشبكة) · fallback تلقائي لـ in-memory في
  المتصفحات اللي مابتدعمش IndexedDB (مفيش throw).
- ⚠️ **بيلمس تهيئة Firestore — محتاج تأكيد سريع على production** (افتح
  التطبيق + تابين، اتأكد إن الداتا بتحمّل والـ offline شغّال). لو حصل أي
  سلوك غريب، الـ rollback = رجوع `enableIndexedDbPersistence`.
- ملف: `src/firebase.js`.

## V21.27.26 — أداة تحليل حجم الـ bundle (dev-only) 📊
- `rollup-plugin-visualizer` (devDependency) — أداة قياس بتطلّع treemap
  تفاعلي (`dist/stats.html`) بأحجام gzip/brotli لكل chunk. تشغيل:
  `npm run build:analyze` (= `ANALYZE=1 vite build`).
- **OFF افتراضياً:** الاستيراد ديناميكي + شرطي على `process.env.ANALYZE`،
  فالـ build العادي مش محتاج الحزمة ولا بيتأثر. لو الحزمة مش متثبّتة والـ
  ANALYZE مفعّل → warning بدل crash.
- الفايدة: نشوف إيه اللي بيكبّر الـ chunks فعلاً (أكبرهم دلوقتي:
  index 936KB، vendor-firebase 651KB، vendor-recharts 541KB، xlsx 429KB)
  بدل التخمين — أساس لأي اختصار لاحق.
- ملفات: `vite.config.js` · `package.json` (script + devDep).

## V21.27.25 — مراقبة الأخطاء عن بُعد (Remote error logging) 🩺
- **السبب:** CLARK بيـ deploy على production مباشرة بدون بيئة تجربة
  (البروتوكول §1). الـ `ErrorBoundary` كان بيـ console.error محلياً بس →
  أي crash عند مستخدم كان بيختفي تماماً عن المطوّر. دلوقتي بقى مرئي.
- `src/utils/errorLog.js` (جديد): logger خفيف best-effort بيكتب الأخطاء في
  `errorLogsDays/{YYYY-MM-DD}` (per-day doc، نفس نمط daily-split §2).
  بيلتقط ٣ مصادر: شجرة React (ErrorBoundary.componentDidCatch)، `window.onerror`،
  و`unhandledrejection`. كل entry: ts/version/kind/msg/stack/ctx/url/ua/by.
- **محسوب للأداء:** best-effort (مايرميش exception أبداً)، dedup للأخطاء
  المتكررة خلال دقيقة (يمنع طوفان الكتابات في render loop)، حد أقصى ٢٥ كتابة
  في الجلسة (حماية حصة Firestore). صفر تأثير في الحالة العادية.
- `firestore.rules`: match clause لـ `errorLogsDays` (قراءة manager+، كتابة
  أي مستخدم مسجّل + `validDayDoc`). ⚠️ **لازم deploy للـ rules قبل/مع الـ
  client** (§10) — لو الـ rules مش متظبّطة، الكتابة بتفشل بصمت (degraded مش
  breaking).
- ملفات: `src/utils/errorLog.js` · `src/components/ErrorBoundary.jsx` ·
  `src/main.jsx` · `firestore.rules`.

## V21.27.23 — المحرر: جودة الاسطمبة + تكبيرها + فتح بأبعاد الصورة (fix)
- جودة الاسطمبة: شيل وزن 700 (Anton وزن واحد → faux-bold غامق/مبكسل) → 400
  في الـ DOM والـ canvas. `buildBlob` بيعمل `document.fonts.load` للخطوط
  المستخدمة فعلياً قبل الرسم.
- resize للاسطمبة بقى زي النص (يغيّر `size` مش `w`).
- المحرّر بيفتح بأبعاد الصورة: مساحة العرض `width=dispW` (شيل padding/flex)،
  المودال `width:fit-content` (مفيش أسود عالجوانب).
- ملف: `src/components/ImageEditorModal.jsx`.

## V21.27.22 — إصلاح CORS + اسطمبة الكود/الموديل/المقاسات
- **CORS:** `api/img-proxy.js` (جديد) — بروكسي صور (هوستات Google/Firebase فقط،
  anti-SSRF) بيرجّع الصورة بـ `Access-Control-Allow-Origin`. المحرّر بيمرّر
  الصور البعيدة عبره **وقت التصدير** → canvas مايتلوّتش → الحفظ شغّال.
- **اسطمبة:** طبقة `stamp` = كائن واحد (٣ سطور): CODE + رقم الموديل (أسود) +
  المقاسات (أحمر) بخط **Anton**. مملوءة من `prefill` (modelNo + sizeLabel).
  inspector لتعديل الحقول/الألوان/الخط/الحجم. زر «🏷️ اسطمبة».
- ملفات: `api/img-proxy.js` · `ImageEditorModal.jsx` · `AIStudioPg.jsx`.

## V21.27.21 — محرّر صور كامل (شبه Canva)
- `src/components/ImageEditorModal.jsx` (جديد): محرّر client على canvas —
  طبقات نص (خط/حجم/لون/B/I/محاذاة/ظل/حد/شفافية، ~18 خط عبر Google Fonts) +
  طبقات صورة/لوجو. تحريك (سحب) + تكبير (مقبض ركن) + تدوير (مقبض فوق) عبر
  pointer events. ترتيب/تكرار/حذف. تصدير PNG بدقة الأصل (تحميل + onSave).
- زر «🎨 محرّر» في `resultActions`. الزر القديم «✏️ تعديل» (AI) → «✏️ تعديل AI».

## V21.27.20 — مكتبة البرومبتس: أقسام جديدة مخصّصة
- `aiPromptLibrary.js`: `loadPromptLibrary(extraGroups)` + `libGroupDocId`
  collision-safe للأقسام العربية (هاش قصير ثابت؛ المدمجة بنفس المعرّف).
- زر «🗂️ قسم جديد» (askInput) → `cfg.aiStudioPresets.promptGroups`. الأقسام
  المخصّصة بتظهر (حتى فاضية) في كل اختيارات القسم.

## V21.27.18 — توحيد البرومبتس
- اتشال قسم «📸 برومبتس جاهزة» المنفصل. «🪄 استخراج من صور» اتنقل لمكتبة
  البرومبتس، والمستخرَج بينزل في المكتبة مع **اختيار القسم** + إعادة تسمية.

## V21.27.17 — استخراج البرومبتس: كمبيوتر/مساحة التخزين
- `PromptExtractModal` بقى يستخدم `ImagePickButton` (كمبيوتر + تخزين).
- `describe-image.js` بيقبل `imageUrl` (بيجيب الصورة من السيرفر).

## V21.27.13 — استخراج برومبتس من صور الوقفات
- `api/ai-image/describe-image.js` (جديد): Gemini Flash vision — صورة →
  برومبت + اسم. `aiImageClient.describeImage`. `PromptExtractModal.jsx` (رفع
  متعدد → preview → حفظ). زر «🪄 استخراج من صور» في الاستوديو.

## V21.27.19 — تفاصيل الموديل + لايت بوكس + باليت ألوان + خامات صف واحد
- `ModelDetailModal.jsx` (جديد): كليك على الموديل → بوب اب تابات (قماش/ألوان ·
  إكسسوار · تفاصيل · **الأوامر المرتبطة** = orders filter modelId) + تعديل/إغلاق.
- `ImageLightbox.jsx` (جديد): صورة بالجودة الكاملة. متوصّل: كارت الموديل +
  التفاصيل + الأوامر. DetPg: زوم الأوردر بقى `contain` (من غير قص).
- `COLORS_DB`: توسعة لـ ~64 لون. `ColorPicker`: بوب اب وسط الشاشة + بحث + لون
  مخصّص (hex). ModelForm تاب القماش: كل الخامات على صف أفقي واحد.

## V21.27.16 — تعديل الموديل ينعكس على الأوامر + ألوان الكارت + خامات مضغوطة
- `propagateModelToOrders(modelId, model)` في App.jsx: تعديل الموديل بيحدّث
  **الحقول المقفولة بس** في الأوامر المرتبطة (خامات/استهلاك/قطع-راق/مقاسات/قطع/
  تفاصيل + color_source/color_images). **مابيلمسش** ألوان الأوردر/كمياته/
  إكسسوار/هالك/تعليمات/PO/حالة/تسليمات (عشان مانمسحش تعديلات الأوردر).
- كروت الموديل بتعرض ألوان خامة المصدر بس. تاب القماش: ألوان inline مضغوطة
  بدل الجدول الكبير.

## V21.27.15 / .14 — سحب الموديلات: انتقائي + فلتر
- `importModelsFromOrders({only})` — سحب انتقائي. ModelsPg: شيپس قابلة للاختيار
  + «تحديد الكل/إلغاء» + فلتر برقم الموديل + «🚀 سحب المحدد».
- ربط الاستوديو بقى يستخدم `ImageLinkModal` المشترك (V21.27.14).

## V21.27.11 — سحب الموديلات من الأوامر
- `buildModelFromOrder(order)` (orders.js) = عكس `buildOrderFromModel`. +5 اختبارات.
- `importModelsFromOrders({link})` في App.jsx (idempotent + writeBatch). زر
  «📥 سحب من الأوامر» في ModelsPg + Dry-run preview. **بيربط الأوامر بـ modelId**.

## V21.27.12 — حذف أمر التشغيل بقى سريع (fix)
- `delOrder` كان بيعمل transaction تقرأ/تكتب factory/config + factory/sales
  (~1MB) كل مرة. دلوقتي مسار سريع: لو الأمر مالوش خصم مخزون ولا مراجع →
  `deleteDoc` واحدة.

## V21.27.10 — الربط بلون: ألوان خامة الماتريكس بس (fix)
- `orderColorsOf` (ImageLinkModal) بيرجّع ألوان خامة المصدر (color_source_fabric)
  بس مش كل الخامات.

## V21.27.9 — ربط الصورة: لون للموديل + «رئيسية» أول اختيار
- `ImageLinkModal` تبويب الموديل بقى خطوتين (موديل → رئيسية + ألوان).

## V21.27.8 — البريدج: أزرار التعافي تظهر وهو عالق (fix)
- أزرار «🔧 إصلاح تلقائي»/«🔌 قطع الاتصال» كانت محبوسة (canEdit && isReady) +
  الزر الإنلاين لـ INIT/DISCONNECTED بس. دلوقتي بتظهر لأي حالة عالقة (مش
  REPAIRING) — `CampaignsPg.jsx`.

## V21.27.7 — مساحة التخزين: أدوات صف واحد + ربط الصورة
- `ImageLinkModal.jsx` (جديد، مشترك). DocumentsPg: أدوات الملف صف واحد + زر 🔗.
  تمرير models/replaceModel/updOrder من App.

## V21.27.6 — الورش: رقم الموديل وتحته رقم أمر التشغيل
- بوب اب «التشغيل والورش» + أذون الورش المطبوعة. حركة التسليم بتخزّن poNumber.

## V21.27.5 — ربط الأوردر بالموديل (الأساسي)
- `buildOrderFromModel`: نقل `pcsPerLayer` للخامة + قطع/راق افتراضي لكل لون
  (كان بيضيع → «--»).
- **OrdForm** (fromModel = `!modelMode && !!form.modelId`): قفل الخامة
  (عرض)، إخفاء +/✕/إضافة خامة، استهلاك/راق + قطع/راق للعرض، قفل المقاسات
  والقطع. الألوان (راقات + إضافة) تفضل قابلة للتعديل.
- `genPO`: نمط «#<رقم الموديل>-NNN» تسلسلي لكل موديل + تعبئة تلقائية.
- ModelForm: حصرية القطع للخامات.

## V21.27.0 → V21.27.4 — إعادة هيكلة الموديل (٥ مراحل)
1. **V21.27.0** تاب القماش: استهلاك القطعة المحسوب + ألوان بس (FCTable `simple`).
2. **V21.27.1** تاب لون/مقاس: ماتريكس + صور بدون كميات (`ColorSizeMatrixTab` specMode).
3. **V21.27.2** إكسسوار: كمية للقطعة + سعر وحدة (`qtyPerPiece`) — calcOrder/CalcPg/DetPg.
4. **V21.27.3** نسبتا هالك (قماش/إكسسوار) كبنود تكلفة مستقلة — calcOrder + DetPg.
5. **V21.27.4** تاب «تفاصيل التشغيل» منسّق (RichTextEditor + sanitizeHtml) يطبع مع الأمر.

---

## 🔜 اللي لسه (TODO / للمتابعة)

- **مراقبة الأخطاء (V21.27.25):** ⚠️ **لازم deploy لـ `firestore.rules`** عشان
  الكتابة في `errorLogsDays` تشتغل (من غيره permission-denied بصمت). بعد
  الـ deploy: لوحة عرض للأخطاء في `DiagnosticsPanel` (TODO) عشان manager+
  يشوفها من غير Firestore console.
- **اقتراحات اختار Ahmed يبدأ بيها (V21.27.25 session):** ١) مراقبة الأخطاء ✅
  ٢) virtualization للقوائم الضخمة (react-window) — لسه. ٣) تحليل حجم الـ
  bundle (rollup-plugin-visualizer) — لسه. ٤) تحديث Firestore persistence لـ
  `persistentLocalCache` متعدد التابات — لسه (محتاج تأكيد production).

- **CORS التصدير:** اتعمل `/api/img-proxy` (V21.27.22). لو لسه فيه فشل تصدير،
  البديل: ضبط CORS على الـ Storage bucket مباشرة، أو compositor سيرفر كامل.
  **محتاج تأكيد إنه شغّال على production.**
- **محرّر الصور — أفكار إضافية:** أشكال (مستطيل/دائرة/خط)، فلاتر/سطوع/تباين،
  قوالب جاهزة (templates)، **اسطمبات محفوظة** (تصمّم اسطمبة وتستخدمها على أي
  صورة)، دوران افتراضي ٩٠° للاسطمبة، snap/خطوط محاذاة، undo/redo.
- **الخطوط أحادية الوزن** (Anton/Bebas...): طلب bold بيعمل faux-bold. ممكن
  نمنع زر B لما الخط أحادي الوزن.
- **propagateModelToOrders:** بيحدّث الحقول المقفولة بس. لو المستخدم عايز
  الإكسسوار/الهالك كمان يتحدّثوا من الموديل دايماً → قرار + تنفيذ (بس ساعتها
  الأوردر مايعدّلهمش).
- **سحب الموديلات:** بيشتغل على الموسم النشط بس. نسخة لكل المواسم لو لزم.
- **أقسام المكتبة المخصّصة:** ممكن نضيف حذف/إعادة تسمية للقسم المخصّص.
- **اختبار يدوي على production** (مفيش بيئة تجربة): الأقفال في الأوردر، نسب
  الهالك في التكلفة/الربح، سحب الموديلات + الربط، المحرّر/الاسطمبة، البريدج.

---

## 📌 ملفات/مفاهيم مهمة اتضافت السيشن ده
- `src/components/ImageLinkModal.jsx` — ربط صورة بموديل/أمر/لون (مشترك).
- `src/components/ImageEditorModal.jsx` — محرّر الصور (Canva-like + اسطمبة).
- `src/components/ImageLightbox.jsx` — عرض صورة بالجودة الكاملة.
- `src/components/ModelDetailModal.jsx` — بوب اب تفاصيل الموديل + الأوامر.
- `src/components/PromptExtractModal.jsx` — استخراج برومبتس من صور.
- `src/components/RichTextEditor.jsx` + `src/utils/sanitizeHtml.js` — تفاصيل التشغيل.
- `api/img-proxy.js` — بروكسي CORS للصور.
- `api/ai-image/describe-image.js` — Gemini vision (صورة→برومبت).
- `orders.js`: `buildModelFromOrder` (عكس buildOrderFromModel) + حقول الهالك في calcOrder.
- App.jsx: `importModelsFromOrders` + `propagateModelToOrders` + مسار حذف سريع.
