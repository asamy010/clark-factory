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
    version: "V19.70.17",
    date: "2026-05-06",
    types: ["feature", "ux"],
    title: "📎 Workaround: checkbox لإرفاق الـPDF في bulk WhatsApp send (default: OFF)",
    changes: [
      { type: "feature", text: "📎 [Toggle: 'إرفاق نسخة PDF مع رسالة الواتس' في popup الطباعة المجمعة] User report: 'نفس المشكلة ماتحلتش - كده مش مشكلة فونت'. حتى مع system fonts (Tahoma/Arial) الـArabic shaping في الـPDF لسه ملخبط — ده يأكد إن الـbug في html2canvas نفسه (مش في الـfont loading)، الـbrowser internal iframe rendering للـArabic مش reliable. **الـworkaround**: checkbox جديد في الـpopup (تحت 'إذن تسليم بدون أسعار') يخلي الـuser يقرر — يبعت PDF + رسالة، أو رسالة نصية فقط بدون PDF. Default = OFF (text-only) — أأمن default لحد ما الـPDF ينحل." },
      { type: "feature", text: "📝 [Text-only mode بـself-contained] لما الـuser يـtoggle off الـPDF، الرسالة بقت تحتوي معلومات إضافية: التليفون + العنوان (في الـPDF كانوا موجودين بس مش في الرسالة). كده الـmessage standalone — العميل عنده كل التفاصيل اللي يحتاجها بدون ما يحتاج يفتح PDF. الـQR confirmation note (📱 برجاء مسح كود QR...) اتشال في الـtext-only mode لأنه مش relevant بدون PDF." },
      { type: "feature", text: "⚡ [Performance gain في text-only mode] لو includePdf = false: (1) `loadPdfLibs()` (~200KB CDN download) skip، (2) `htmlToPdfBase64()` (heavy html2canvas + jsPDF capture) skip، (3) `/api/delivery-sign` round-trip للـQR signatures skip. الـbatch send في text-only mode أسرع بـ~3-5 ثواني لكل عميل (اختصاراً للـPDF generation)." },
      { type: "ux", text: "🟢 [UI: WhatsApp green styling للـcheckbox] الـtoggle بـuse #25D366 (WhatsApp brand color) لما checked — visually consistent مع زر '📤 إرسال واتساب' الأخضر تحته. الـlabel يـadapt: لو on → 'PDF + رسالة تفاصيل لكل عميل'، لو off → 'رسالة تفاصيل نصية فقط (الموصى به مؤقتاً — حتى يتم حل مشكلة الخط العربي في الـPDF)' عشان الـuser يفهم ليه ده الـrecommended state." },
      { type: "improvement", text: "🛡️ [Confirmation message يـadapt للـmode] قبل V19.70.17 الـconfirmation prompt كانت hardcoded 'هيتم إرسال إذن استلام (PDF) + رسالة تفاصيل'. دلوقتي conditional: لو PDF on → نفس الجملة. لو off → 'هيتم إرسال رسالة تفاصيل (نصية فقط — بدون PDF)'. الـuser يعرف بالظبط هيوصل العميل إيه قبل ما يـconfirm الـbatch." },
    ]
  },
  {
    version: "V19.70.16",
    date: "2026-05-06",
    types: ["fix"],
    title: "🔤 Attempt 3: system fonts (Tahoma/Arial) — also didn't fix",
    changes: [
      { type: "fix", text: "🐛 [V19.70.15 لسه ما حلتش الـbug — User confirmed إن الـheaders لسه ملخبطة] الـFontFace API ضمن إن Cairo Bold بقى registered في الـmain document، لكن **html2canvas بـclone الـDOM في internal iframe**، والـregistered FontFace ما بـcopyـش للـiframe ده بشكل reliable. النتيجة: حتى مع registered FontFace، html2canvas's clone ما لاقاش Cairo Bold → fallback لـArial → الـArabic ligatures ما اتـshapedش." },
      { type: "fix", text: "🛠️ [الـREAL FIX اللي اقترحه الـuser: استبدال font في الـ<th> headers بـsystem fonts] في buildOneCustomerHTML في CustDeliverPg.jsx، الـ`<th>` selector اتعدّل من `font-weight:800` (inheriting Cairo from body) إلى explicit `font-family:'Tahoma','Arial',sans-serif;font-weight:700`. ده بـ(1) bypass الـhtml2canvas FontFace race بالكامل، (2) Tahoma مـpreinstalled على Windows بـnative Arabic glyph shaping، (3) Arial fallback لـmacOS، (4) sans-serif generic للـedge cases. الـbody cells (td) لسه بـuse Cairo (weight 400، اللي كان بـloading صح من البداية)." },
      { type: "improvement", text: "🎨 [Visual تأثير: minimal] Tahoma 700 + Cairo 400 mix بـmaintain الـoverall look — الـheaders شوية أنحف بصرياً عن Cairo 800 لكن لسه bold + الـArabic ligatures correct. الـbrand consistency مش متأثرة لأن الـbody (اللي بـcontain اسم العميل، التفاصيل، والـmoney values) لسه Cairo." },
      { type: "improvement", text: "🛡️ [Defense-in-depth: 3-layer fallback chain] حتى لو Tahoma غير متوفر (لو الـbrowser بـrun على environment غريب)، Arial كمان عنده Arabic shaping. ولو الاتنين فشلوا، sans-serif الـgeneric يـpick up أي Arabic-aware system font (Noto Sans Arabic على Linux مثلاً). مفيش حالة الـheaders تـrender disconnected." },
      { type: "improvement", text: "📚 [Lesson learned: html2canvas + custom fonts = unreliable] الـtakeaway للمشاريع الجاية: لو محتاج Arabic في PDF generated عبر html2canvas، استخدم system fonts (Tahoma, Arial, Times New Roman) بدل web fonts (Cairo, Tajawal, IBM Plex Arabic). أو فكّر في jsPDF text APIs مباشرة (Approach A من الـhandoff). html2canvas's iframe clone مش reliable مع FontFace registry." },
    ]
  },
  {
    version: "V19.70.15",
    date: "2026-05-06",
    types: ["fix"],
    title: "🔤 Attempt 2: FontFace API + binary preload (didn't fully fix)",
    changes: [
      { type: "fix", text: "🐛 [الـCRITICAL: V19.70.14 ما حلّتش الـbug — الـheaders لسه ملخبطة] User confirmed إن V19.70.14 (الـlink injection + document.fonts.load) لم يحل المشكلة. **السبب الحقيقي**: `document.fonts.load(\"800 12px Cairo\")` بـtrigger الـload بس مش بـguarantee إن الـTTF binary خلص download. على fresh page-load، الـawait بـresolve في ~5-10ms والـbinary لسه في flight → html2canvas بـcapture بـArial fallback → الـArabic ligatures مش بـshape." },
      { type: "fix", text: "🛠️ [الـREAL FIX: استخدام FontFace API بدل document.fonts.load string]  `new FontFace(\"Cairo\", \"url(woff2)\", {weight:\"800\"})` بـcreate explicit FontFace object backed by specific binary URL. `face.load()` يـawait الـbinary download + parse. `document.fonts.add(face)` يـregister عبر الـdocument. مفيش race condition ممكنة. الـfont URLs بقت direct woff2 من fontsource CDN (الـArabic subset فقط ~30KB لكل weight بدل ~200KB من Google Fonts CSS wrapper)." },
      { type: "improvement", text: "🛡️ [Force reflow + image-load wait قبل html2canvas capture] V19.70.15 ضافت: (1) `void container.offsetHeight` — force layout reflow عشان الـbrowser commits the font choice، (2) double `requestAnimationFrame` — wait two paint cycles عشان الـrendering tree تـsettle، (3) explicit `<img>` decode wait بدل الـ250ms timeout الفاسد — لكل image في الـcontainer، await `load` event مع 3s timeout cap." },
      { type: "improvement", text: "🎯 [Tighter font-family chain — \"Cairo, sans-serif\" بدل \"Cairo, 'Segoe UI', Arial\"] لو Cairo فشل لـany reason، الـfallback يبقى generic sans-serif (مش Arial تحديداً). الـbug يبقى أوضح للـdebug، ومفيش 'silent break' بسبب Arial اللي ما بـshapeش الـArabic correctly." },
      { type: "improvement", text: "🔁 [_cairoLoading promise — concurrent calls share single load] لو 50 عميل في bulk send، الـensureCairoLoaded() بيـcall لكل واحد. قبل V19.70.15 كان فيه potential race بين الأول والثاني. دلوقتي الـ_cairoLoading promise يـcache الـin-flight load — كل الـcalls الـconcurrent يـawait نفس الـpromise." },
    ]
  },
  {
    version: "V19.70.14",
    date: "2026-05-06",
    types: ["fix"],
    title: "🔤 Hotfix: Arabic glyph shaping في الـPDF — attempt 1 (didn't fully fix)",
    changes: [
      { type: "fix", text: "🐛 [الـCRITICAL: Arabic letters في table headers بـrender disconnected] User report: 'عناوين الجداول في ال بي دي اف العربي ملخبط ومش مقروء وبالعكس'. الـscreenshot أوضح إن 'العميل' بـrender 'لـعميل'، 'التاريخ' بـrender 'لـتايخ'، إلخ. الـcustomer name + address (في td، weight 400) كانوا fine. **السبب**: الـ`<th>` في الـCSS عنده `font-weight: 800` (Cairo Bold). الـoffscreen html2canvas capture بـrun قبل ما الـCairo Bold variant يـload في الـbrowser font cache → الـbrowser يـfallback لـArial أو system font اللي ما بـshapeش الـArabic ligatures correctly → كل حرف يـrender في isolated form بدل ما يتـconnect مع المجاور." },
      { type: "fix", text: "🛠️ [Cairo font preload + wait-for-load قبل html2canvas] **الـFix**: ضافت `ensureCairoLoaded()` helper في htmlToPdf.js. بـ(1) inject `<link>` لـCairo Google Fonts مع كل الـweights (400, 500, 600, 700, 800, 900) لو مش موجود، (2) `document.fonts.load()` لكل weight ضروري بـPromise.all، (3) `document.fonts.ready` كـfallback، (4) extra 200ms delay علشان الـmetrics يـsettle. كده لما html2canvas يـcapture، Cairo Bold يكون موجود فعلاً في الـcache → الـArabic shaping correct." },
      { type: "improvement", text: "🛡️ [Defense-in-depth: explicit dir + lang attrs] قبل V19.70.14 الـoffscreen container كان عنده `direction: 'rtl'` كـCSS بس. ضافت `setAttribute('dir', 'rtl')` و `setAttribute('lang', 'ar')` على الـcontainer كـHTML attributes. بعض الـrendering engines (Chrome internals) تستخدم الـattributes مع الـCSS لـbidi resolution — الـattribute أقوى من الـstyle. + `letterRendering: true` في html2canvas options لـbetter glyph fidelity." },
      { type: "improvement", text: "⏱️ [Wait time من 100ms إلى 250ms قبل capture] الـoriginal had 100ms للـQR/image loading. زدتها لـ250ms عشان الـfont metrics + image rendering يـsettle على الـslowest devices. الـperformance impact ~150ms per customer — مع 50 عميل ده 7.5 ثانية extra على الـtotal بس مش لكل عميل (لأن الـensureCairoLoaded بـcache after first call)." },
    ]
  },
  {
    version: "V19.70.13",
    date: "2026-05-06",
    types: ["fix", "ux"],
    title: "🎯 Bulk WhatsApp delivery — match existing per-row format exactly (PDF + message)",
    changes: [
      { type: "fix", text: "🎯 [الـPDF بقى مطابق لنسخة الـprint الموجودة بالظبط] User report: 'البي دي اف عاوزه يكون نفس نسخة الاستلام الموجوده بالفعل'. V19.70.12 كانت بتـbuild PDF بـlayout مبسّط مختلف عن نسخة الـ🖨 بتاع الصف. **الـFix**: rewrote `buildOneCustomerHTML` تـmirror الـstructure الكاملة: (1) CLARK header (logo + factory name + sub-line + title 'اذن تسليم — {customer}' + date/time)، (2) العميل/التليفون/التاريخ/العنوان table، (3) 'تفاصيل الاستلام' table بـالموديل/الوصف/الكمية/السعر/الإجمالي + aggregation row، (4) discount block (الإجمالي قبل الخصم / خصم N% / الصافي المستحق)، (5) QR code section بـ'تأكيد الاستلام' note، (6) signature row (مسؤول التسليم / توقيع العميل)، (7) factory branding footer." },
      { type: "fix", text: "🎯 [رسالة الواتس بقت مطابقة للنسخة الموجودة بالظبط] User report: 'كمان رسالة الواتس تكون نفس الرسالة بالظبط اللي بتوصل العميل'. **الـFix**: استبدلت الـmessage builder الجديد بنفس الـformat اللي في الـper-row 📱 button: '*CLARK — اذن تسليم عميل*' header، '• العميل / • التاريخ' info، separator '─────────────────'، per-item lines '• *modelNo*: qty قطعة × price = total ج.م'، separator، 'الاجمالي N قطعة' + 'الاجمالي N ج.م' + خصم + 'الصافي المستحق'، '📱 *برجاء مسح كود QR في إذن التسليم للتأكيد باستلام البضاعة كاملة*'، + optional account summary footer من `formatCustomerSummaryWA(buildCustomerSummary(...))` (controlled by printSettings.whatsappSummary)." },
      { type: "improvement", text: "🛡️ [QR code embedded as data URL — no async CDN race] قبل V19.70.13 الـHTML كان يحتوي `<canvas data-qr=...>` + script CDN لـqrcode.js يـrender بعد الـpage load. في offscreen html2canvas capture، الـcanvas ممكن يكون فاضي لأن الـCDN script ما اتـloadش بعد. **الـFix**: استخدمت `qrcode` package المثبت بالفعل في الـdependencies — `QRCode.toDataURL(url, {width:200, errorCorrectionLevel:'M'})` يـpre-generate الـQR كـdata URL سيمنكروني، ثم أضاف كـ`<img src='data:...'/>` في الـHTML. مفيش race condition، الـPDF دائماً يحتوي الـQR." },
      { type: "improvement", text: "🛠️ [buildOneCustomerHTML بقى async] لأن QR generation async، الـfunction signature تغيّرت لـasync. الـsend loop بيـawait correctly. مفيش impact على الـperformance لأن الـloop already sequential." },
    ]
  },
  {
    version: "V19.70.12",
    date: "2026-05-06",
    types: ["feature"],
    title: "📤📄 WhatsApp delivery receipts — bulk send PDF + details to selected customers",
    changes: [
      { type: "feature", text: "📄 [Per-customer PDF receipt + WhatsApp send] في popup 'طباعة مجمعة' في صفحة CustDeliverPg، زر جديد 📤 'إرسال واتساب' بجانب زر الـprint. لكل عميل مختار عنده رقم تليفون: (1) HTML للـreceipt يتـبني (نفس الـlayout بتاع الـprint بس per-customer)، (2) html2canvas + jsPDF يـconvert لـPDF base64 (lazy-loaded من CDN — ~200KB مش بـbloat الـbundle لو ما اتستخدمتش)، (3) رسالة text بالملخص (تاريخ، إجمالي قطع، إجمالي قبل الخصم، الخصم، الصافي المستحق)، (4) POST لـbridge /send مع PDF كـmedia attachment. الـbridge من V19.31 يدعم الـpattern ده بالفعل." },
      { type: "feature", text: "🏷️ [Status badges per-customer + progress] كل عميل في الـlist يعرض badge حالته: ⏳ جاري الإرسال (transient)، ✓ تم الإرسال (success)، ⛔ فشل (with hover tooltip للـerror message)، 📵 بدون رقم (للعملاء المش عندهم phone). الـsend button يـlock أثناء الـsending. الـpopup يحتفظ بالعميل في الـlist بعد الإرسال (مش يختفي) — يتم عرض الـbadge عشان user يعرف اللي وصل." },
      { type: "feature", text: "⚙️ [Anti-ban: bridge defaults] الـsend loop يـpost بـsequential await (مش parallel) — الـbridge يـapply delays الـdefault (8-15 ثانية بين الرسائل) عشان مفيش حظر للرقم. لو 50 عميل، الـsending يـtake 6-12 دقيقة. progress badge يحدّث مع كل عميل يخلص. الـconfirmation prompt يحذّر الـuser قبل الـbatch send." },
      { type: "feature", text: "🆕 [src/utils/htmlToPdf.js — reusable utility] `loadPdfLibs()` يـlazy-load html2canvas + jsPDF عبر CDN (caches in window). `htmlToPdfBase64(html, opts)` بيـrender الـHTML في offscreen container، يـcapture بـhtml2canvas (scale=2 للـcrisp text)، يـbuild PDF (A4 portrait، multi-page automatic لو طويل)، يرجّع base64 string جاهز للـbridge. الـutility reusable لأي feature تانية محتاجة HTML→PDF→WhatsApp." },
      { type: "improvement", text: "🛡️ [Failure handling] لو عميل واحد فشل (network، bridge unreachable، PDF generation failed)، الـbatch يكمل للباقي. الـerror يتـsave في `groupPrint.waLastErr[custId]` ويظهر كـtooltip. الـsend button يفضل enabled بعد الـbatch — الـuser يقدر يـretry للفاشلة بإعادة الضغط (الـsent ones عندهم badge ✓ ومش هيتعاد إرسالهم لأن الـcheckbox عمل selection على الكل)." },
    ]
  },
  {
    version: "V19.70.11",
    date: "2026-05-05",
    types: ["feature", "ux"],
    title: "📨🔄 checkEndorsed + checkRePresented + bounced→re-bounce supported",
    changes: [
      { type: "feature", text: "📨 [checkEndorsed — شيك مُظهَّر لمورد] لما تـendorse شيك من عميل لمورد (status=مُظهَّر)، المورد يستلم رسالة فورية بكل تفاصيل الشيك + اسم العميل الأصلي (صاحب الشيك) للمراجعة. الـpayload includes: customerName (drawer), supplierName (recipient), bank, checkNo, amount, dueDate, customerOffice, supplierOffice, balance (supplier debt reduced). الـhook في `endorseCheck` function — snapshot الـcheck + customer قبل الـupConfig، fire after." },
      { type: "feature", text: "🔄 [checkRePresented — إعادة تقديم شيك مرتد] الـUI button '↻ إعادة' الموجود من قبل (يحوّل status=مرتد→معلق) دلوقتي بـfire event للعميل + المالك. Customer message: 'إعادة تقديم شيك للبنك' مع تاريخ الأصلي + تاريخ إعادة التقديم + الرصيد المستحق (يقل بقيمة الشيك تاني، لأن الشيك بقى active مرة أخرى). الـtransition detection في updateStatus: prevStatus===مرتد && newStatus===معلق." },
      { type: "feature", text: "🛡️ [Re-bounce support — keys date-suffixed] لو شيك ارتد → اتـreallocated → ارتد تاني، قبل V19.70.11 الـeventHistory يـdedupe الـcheckBounced على نفس الـid. **الـFix**: idempotencyKey بقى date-suffixed: `checkBounced:${id}:${dt}` و `checkRePresented:${id}:${dt}` — كل bounce/re-present يـfire بنجاح حتى لو ده الـ2nd/3rd round على نفس الشيك." },
      { type: "ux", text: "🚫 [BlocklistPage header text] '💡 إيش هي القائمة دي:' بقى '🚫 قائمة العملاء المحظورين:' — أوضح وأرسمي. التعريف نفسه ما اتغيرش." },
      { type: "improvement", text: "🎯 [Now 10 event types total] sale, paymentCash, paymentChecksIn, paymentChecksOut, **endorsed**, collected, bounced, **rePresented**, lateOrder, checkDue. الـ4 events المتعلقة بالشيكات (PayIn/PayOut/Endorsed/Collected/Bounced/RePresented) بتـcover الـlifecycle بالكامل: استلام → تظهير/تحصيل → ارتداد → إعادة تقديم." },
    ]
  },
  {
    version: "V19.70.10",
    date: "2026-05-05",
    types: ["feature", "ux"],
    title: "📤✅⚠️ 3 new check events: Issued + Collected + Bounced",
    changes: [
      { type: "feature", text: "📤 [checkPaymentIssued — شيكات أوراق دفع لمورد] event جديد، نفس الـUX pattern زي checkPaymentReceived بس في الاتجاه المعاكس. لما تـsave check بـtype=payable + category=دفعة مورد + supplier linked، الـsupplier يستلم رسالة فورية بكل تفاصيل الشيك (بنك، رقم، قيمة، استحقاق) + balance progressive (لكل شيك في الـbatch، الرصيد المتبقي من ديننا للمورد بـيقل). New 'supplier' recipient role added to buildEventMessages — uses supplierPhone parameter (separate from customerPhone)." },
      { type: "feature", text: "✅ [checkCollected — تم تحصيل شيك] لما تـmark شيك receivable بـstatus='محصل'، الـcustomer يستلم رسالة شكر فورية (تم التحصيل، البنك، الشيك، التاريخ، الرصيد المتبقي). الـclient hook يـsnapshot الـcheck قبل الـupConfig + يـfire بعد الـtoast الموجود. Idempotency: `checkCollected:${id}`." },
      { type: "feature", text: "⚠️ [checkBounced — شيك مرتد] لما تـmark شيك receivable بـstatus='مرتد'، الـcustomer يستلم تحذير (شيك مرتد، البنك، الشيك، تاريخ الارتداد، الرصيد المستحق + 'يرجى التواصل فوراً للسداد'). Idempotency: `checkBounced:${id}`. الـbalance يـreflect الـreversal (الـcheck لم يعد counted كدفع)." },
      { type: "ux", text: "🏪 [Supplier role label في EventCard] العمود الـrecipient toggles دلوقتي يعرض '🏪 المورد' للـsupplier role، في الـadditional للـ'👤 العميل' و '🏭 المالك'. كل event يعرض الـrecipient roles المناسبة له بـconditional logic." },
      { type: "ux", text: "📐 [تسجيل column header centered] V19.70.9 وضّعت الـdata centered لكن الـheader 'تسجيل' لسه right-aligned. **الـFix**: header dynamically conditional على اسم الـcolumn — لو 'تسجيل' فالـheader يبقى centered للمطابقة مع الـdata cells." },
      { type: "improvement", text: "🛡️ [supplierPhone في processEvent + endpoint] event-trigger.js + _eventProcessor.js الـ2 بقوا يقبلوا `supplierPhone` في الـbody جنب `customerPhone`. الـphones object الـinternal دلوقتي عنده 4 keys: customer/supplier/owner/salesperson. كل event يستخدم اللي يحتاجه based on recipientRoles." },
    ]
  },
  {
    version: "V19.70.9",
    date: "2026-05-05",
    types: ["ux"],
    title: "🔍 Searchable customer/supplier picker في checks form + centered time",
    changes: [
      { type: "ux", text: "🔍 [Searchable picker للـعميل/المورد في check form] الـ`<select>` كانت بتعرض list طويل للعملاء/الموردين — صعب التنقل لو كان فيه عشرات. **الـFix**: استبدلتها بـsearchable input + filtered dropdown. الـuser يكتب جزء من الاسم → الـlist تـfilter case-insensitive → click على نتيجة يـlink الـid + الـname. لو 30+ نتيجة، الـdropdown بـcap على أول 30 ويعرض count للباقي ('...30 نتيجة أكتر — اكتب أكتر للتضييق'). لما parties محدد، يظهر بـ✕ للـclear ويرجع للـsearch view. الـmanual-name fallback (للـparties المش مسجلة) لسه موجود تحت كـsecondary input." },
      { type: "ux", text: "📐 [Centered time alignment under date في checks list] V19.70.8 ضافت time تحت date لكن aligned start (يمين في RTL). الـuser request: في المنتصف. **الـFix**: `textAlign: 'center'` على الـtd + الـ2 divs. الـtimestamp بقت في central column under the date — أوضح visually." },
    ]
  },
  {
    version: "V19.70.8",
    date: "2026-05-05",
    types: ["fix", "feature", "ux"],
    title: "🛠️ Check batch progressive balance + UI polish + multi-select delete",
    changes: [
      { type: "fix", text: "🐛 [الـCRITICAL: balance بـbatch checks كان ثابت لكل الرسائل] User report: الـ3 شيكات في الـbatch بعتت رسائل بـbalance متطابق ('1,600 ج.م') بدل ما يقل progressive. السبب: الـclient hook كان بيـcompute balance مرة واحدة قبل الـloop ويستخدمها لكل الـchecks. **الـFix**: balance يـcompute للـbase أولاً (بدون أي check من الـbatch)، وكل check يبعت بـ`baseBalance - (i+1) * amount` — شيك 1 = base - 1000، شيك 2 = base - 2000، شيك 3 = base - 3000 (الرصيد النهائي). الـorder كمان مهم — استبدلت Promise.all بـsequential await عشان الرسائل تنزل بالترتيب 1→2→3 في WhatsApp." },
      { type: "fix", text: "🔄 [Cron-side scan كمان فيها نفس الـfix] `scanRecentChecks` في api/automation-tick.js كان بيـuse balanceMap مرة واحدة لكل check. دلوقتي بيـcompute progressively: لو check جزء من batch، يـsum amounts من نفس الـbatchId مع batchIdx <= this.batchIdx ويـsubtract. لو single check (مش batch)، يـsubtract just this check's amount. كده الـclient + cron الاتنين متطابقين على الـbalance logic." },
      { type: "ux", text: "📐 [Time UNDER date في checks list — بدل inline] الـcell كان بـdisplay الوقت inline بعد الـdate. الـuser request: 'عاوز نخلي الساعة تحت التاريخ في الصف'. **الـFix**: الـcell بقى يحتوي على 2 divs نظيفين — `<div>{c.date}</div>` ثم `<div>{formatTxTime(c.createdAt)}</div>`. lineHeight=1.3 مع padding 4px (بدل 6px) — الـrow ضغطت ~30%، أكتر شيكات تظهر بدون scroll." },
      { type: "feature", text: "☑️ [Multi-select + bulk delete للـchecks] قبل V19.70.8 الـuser محتاج يحذف كل شيك على حدة. دلوقتي عمود checkbox أول العمود + select-all في الـheader. لما تختار 1+ شيك، bulk-delete bar أحمر يظهر فوق الـtable مع زرين: 'إلغاء التحديد' و 'حذف المحدد (N)' (مع confirmation). نفس الـpattern اللي في الـjournal لـtransactions. مفيد بـspecial لو عملت batch غلط وعايز تشيله كله." },
    ]
  },
  {
    version: "V19.70.7",
    date: "2026-05-05",
    types: ["fix", "ux"],
    title: "🐛 Hotfix: checkPaymentReceived missing from Triggers UI + clearer Arabic labels",
    changes: [
      { type: "fix", text: "🚨 [الـCRITICAL: checkPaymentReceived event type ما كانش ظاهر في الـUI] V19.70.5 ضافت الـcheckPaymentReceived event في الـEVENT_VARIABLES + DEFAULT_AUTOMATION_CONFIG، لكن الـTriggersTab في AutomationPg كان عنده hardcoded list `['saleCompleted', 'paymentReceived', 'lateOrder', 'checkDue']` بدون checkPaymentReceived. النتيجة: الـuser ما يقدرش يـenable الـtrigger، فالـclient hook كان بيـcall الـendpoint بس الـendpoint بيرجع `skipped: event-disabled` لأن الـconfig.enabled = false. **الـFix**: ضافت 'checkPaymentReceived' للـeventTypes array (now 5 events)." },
      { type: "ux", text: "🏷 [Arabic-primary labels عشان وضوح الفصل بين الكاش والشيكات] قبل V19.70.7 الـlabels كانت English/Arabic mix ('💰 Sale Completed', '💵 Payment Received', إلخ). الـuser request: 'الخزنة لوحدها والشيكات لوحدها' — يعني فصل واضح. الـnew labels عربي صريح: '💰 بيع جديد للعميل'، '💵 دفعة كاش/تحويل من عميل' (نقدي/محفظة/انستاباي/تحويل بنكي — مش شيكات)، '🏦 دفعة شيكات من عميل' (شيك واحد أو حافظة)، '⚠️ أوردر متأخر'، '📅 شيك يستحق قريباً'. الـdescription بقت explicit عشان مفيش لخبطة." },
      { type: "improvement", text: "🛡️ [Test plan لـregression] أي event type جديد لازم يتـregister في 3 places: (1) EVENT_VARIABLES في eventBuilder.js، (2) DEFAULT_AUTOMATION_CONFIG.events في buildDailyReport.js، (3) eventTypes array في AutomationPg.jsx TriggersTab. لو نسيت أي واحدة فيهم، الـevent يبقى ghosted من perspective المستخدم. ضافت inline comment في eventTypes array لتنبيه الـeditor المستقبلي." },
    ]
  },
  {
    version: "V19.70.6",
    date: "2026-05-05",
    types: ["feature", "ux"],
    title: "🔁⏰ Recurring campaigns + Cairo time-of-day in transaction logs",
    changes: [
      { type: "feature", text: "🔁 [Recurring campaigns — 4 patterns] الـschedule UI دلوقتي عنده recurrence type selector: مرة واحدة / يومي / أسبوعي / شهري / فترة محددة. كل type عنده الـinputs المناسبة: يومي = timeOfDay، أسبوعي = أيام الأسبوع متعددة + timeOfDay، شهري = يوم الشهر (1-28) + timeOfDay، فترة محددة = rangeStart→rangeEnd + timeOfDay. End-condition optional: maxOccurrences أو endDate. Use case: حملة شكر يومية للعملاء، تذكير شهري بالـunpaid، عرض أسبوعي يوم الإثنين والأربعاء، إلخ. مفيش نسيان من المستخدم — الـsystem بيـrun لوحده." },
      { type: "feature", text: "🔄 [Cron-side: computeNextFireTime + auto-reschedule] بعد كل fire ناجح، الـcron يحسب الـnext fire time بناءً على الـrecurrence pattern + lastFiredAt. لو في end-condition (maxOccurrences/endDate) و وصلت → status='done'. لو لأ → status='scheduled' مع scheduledAt الجديد، الحملة تستمر. مفيش الـcustomer بيستلم رسائل بعد maxOccurrences حتى لو الـserver راجع تأخر." },
      { type: "ux", text: "📋 [ScheduledCampaignsList بيعرض الـrecurrence] الـrow بيـshow human-readable description (e.g. '🔁 يومي • 09:00'، '📆 أسبوعي • إثنين، أربعاء • 09:00'، '🗓 شهري • يوم 15 • 10:00') + counter بـ'X مرة' و آخر تنفيذ. الـrecurring campaigns مرتبة بـnext-scheduled time عادي، الـuser يشوف لما الحملة هتـrun next." },
      { type: "feature", text: "⏰ [Cairo time-of-day في سجل الخزنة] قبل V19.70.6 الـjournal كان يعرض الـdate بس (e.g. '2026-05-05'). دلوقتي يعرض الوقت كمان بصيغة عربية 12-ساعة مع م/ص (e.g. '2026-05-05 ٣:٤٥ م') مأخوذة من createdAt للـtransaction. الـsort بقى by createdAt DESC — أحدث حركة بـالدقيقة بالظبط في الأعلى. مفيد للـmulti-entry days." },
      { type: "feature", text: "⏰ [Cairo time في الـchecks list كمان] جدول الشيكات اتضافله column 'تسجيل' (تاريخ + وقت الـcreatedAt). الـsort اتغيّر من dueDate ASC إلى createdAt DESC — الشيكات الجديدة في الأعلى مع وقت إضافتها. الـoverdue/dueDate logic لسه نفسها، بس الترتيب يعكس الـchronological order للإضافة." },
      { type: "improvement", text: "🛠️ [formatTxTime + formatDateTime helpers في utils/format.js] reusable functions للـ12-hour Arabic time formatting بـAfrica/Cairo timezone. أي transaction list محتاج يضيف time display ممكن يستخدمهم بدون duplication. الـIntl.DateTimeFormat caches للـ-performance (مفيش re-instantiation كل render)." },
    ]
  },
  {
    version: "V19.70.5",
    date: "2026-05-05",
    types: ["feature", "fix", "ux"],
    title: "🏦📷📐 Check trigger + image campaigns + Treasury UI cleanup",
    changes: [
      { type: "feature", text: "🏦 [Check Payment Received trigger] event type جديد بنفس نظام الـpaymentReceived بس بـcheck details. لما العميل يدفع شيك، الرسالة تروحله بالبنك ورقم الشيك والقيمة وتاريخ الاستحقاق + الرصيد المتبقي. لو حافظة شيكات (batch >1)، كل شيك يبعت كرسالة منفصلة بـ`{batchInfo}` = '(شيك X من Y)'. instant-fire client hook في TreasuryPg + cron-side fallback في scanRecentChecks (filter: type=receivable, status=معلق, category=دفعة عميل، last 24h، respects enabledAt). Idempotency `checkPay:${id}` per check." },
      { type: "feature", text: "📷 [Campaign scheduling مع صور] الـschedule UI في ChooseSendMode دلوقتي عنده image picker — لحد 4 صور لكل campaign، حد أقصى 200KB لكل صورة بعد الـcompression (canvas resize to 1024px max + JPEG quality 0.7). الصور inline base64 في `data.scheduledCampaigns[].images[]`. الـcron scanScheduledCampaigns يضيف `media: [{base64, mime, name}]` لكل message — الـbridge موجود فيه `MessageMedia` support بالفعل (مفيش VPS update مطلوب)." },
      { type: "ux", text: "📐 [Treasury UI: dense single-row toolbar] قبل V19.70.5 صفحة الخزنة كان فيها 2 صفوف فوق الـjournal: (1) 3 KPI cards (وارد/منصرف/صافي اليوم) + date picker + 3 action buttons (طباعة/PDF/واتساب)، (2) account summary card. **الـFix**: الـ3 daily-KPI cards اتشالوا (المعلومة موجودة في الـaccount summary). الـdate picker + actions اتدمجوا داخل الـaccount summary card في single horizontal row. على الـjournal view (الكل، بدون account)، الـtoolbar compact على flex-end. النتيجة: ~70px space gained للـjournal/list section تحت." },
      { type: "improvement", text: "🎨 [Image preview thumbnails في الـschedule UI] لما تـattach صور، 80×80 thumbnails تظهر مع زر × للـremove + size badge بـKB لكل صورة. validation client-side (max 4، max 200KB per image). الـsubmit button يعرض count: '📎 N صورة مرفقة — هتتبعت مع كل رسالة'." },
      { type: "ux", text: "🎯 [Bridge media format already supports it] clark-wa-bridge/server.js (V19.31) عنده `MessageMedia` support كامل — يقبل `{media: [{base64, mime, name}]}` array per message. الـcron يبني الـpayload بـformat ده ويضيفه للـmessages اللي في scheduledCampaign. مفيش VPS deploy مطلوب." },
    ]
  },
  {
    version: "V19.70.4",
    date: "2026-05-05",
    types: ["feature", "automation"],
    title: "⚡📅 Sale instant fire + Campaign scheduling (text-only)",
    changes: [
      { type: "feature", text: "⚡ [Sale instant fire — كل path] V19.70.3 ضافت instant لـpaymentReceived في TreasuryPg. V19.70.4 بتضيف نفس الـpattern لـsaleCompleted في الـ2 paths الرئيسية: (1) MobileQuickSale (الـmobile-first flow اللي المحصّل/الـsales-rep بيستخدمه عند العميل) — لحظة ما تـsave البيع، الـapp يبعت لكل order delivery رسالة WhatsApp فوراً. (2) CustDeliverPg QR-sale flow — نفس الـlogic. الـcron تفضل fallback لو الـclient فشل (network down). Idempotency: `sale:${id}` keys consistent بين الـclient hook والـcron-side scan." },
      { type: "feature", text: "📅 [Campaign scheduling — text-only] حملة جديدة عندها option جديد '📅 جدولة لوقت لاحق' في شاشة طريقة الإرسال. الـuser يـpick template + segment زي العادة، ثم بدل ما يبعت دلوقتي يحط datetime مستقبلي. الحملة تُحفظ في `data.scheduledCampaigns[]` بـstatus='scheduled' + الـaudience snapshot (عشان الـsegment changes لاحقاً ما تأثرش على الـscheduled campaign). الـVPS cron يـscan كل 5 دقائق ويـfire الحملات اللي وصل ميعادها." },
      { type: "feature", text: "📋 [Tab جديد '📅 المجدولة' في الـCampaigns page] قائمة بكل الحملات المجدولة + status pill (في الانتظار/جاري الإرسال/تم/فشل/ملغي). زر إلغاء للـscheduled + زر حذف للـcompleted/failed/cancelled. الـcron status updates تظهر تلقائياً (live data via Firestore listener)." },
      { type: "feature", text: "🔄 [Cron-side: scanScheduledCampaigns] الـautomation-tick.js دلوقتي عنده section F: scan الـscheduledCampaigns، اخد أول واحد due (oldest scheduledAt that's already passed)، transactional claim بـstatus='firing' (يمنع double-fire لو 2 ticks raced)، build messages من الـtemplate + items، POST بريدج /send، mark 'done' أو 'failed'. واحد per tick (الحملات ممكن تكون كبيرة، الـtimeout protection)." },
      { type: "improvement", text: "🛡️ [Idempotency consistency لـsales] قبل V19.70.4 الـcron-side sale scan كانت idempotency: `sale:${orderId}:${date}:${qty}:${custId}` — composite key قابل للـcollision (لو نفس العميل اشترى نفس الكمية من نفس الموديل في نفس اليوم). دلوقتي: لو الـdelivery عنده `id`، استخدم `sale:${id}`. الـclient hook الجديد دائماً يـpre-generate id، فالاتنين متطابقين." },
      { type: "ux", text: "📅 [Pre-filled datetime picker — default = +1 hour] لما تـpick 'Schedule for later' في chooseSendMode، الـdatetime input يبدأ بـ'دلوقتي + ساعة'. الـuser يقدر يعدّل، أو يحفظ مباشرة لـschedule بساعة من دلوقتي. min attribute يمنع اختيار وقت في الماضي." },
      { type: "docs", text: "📋 [V19.70.5 roadmap: image attachments] الـcampaigns scheduling في V19.70.4 text-only. ضافت الـimages attachment يحتاج: (1) Firebase Storage upload في الـclient، (2) `data.scheduledCampaigns[].images[]` field (already added — empty array). (3) bridge endpoint update لـMessageMedia support — يحتاج SSH لـContabo VPS وredeploy الـbridge. الـbridge code (clark-wa-bridge/server.js) لازم يـaccept `mediaBase64+mediaMime+mediaName` per message ويبني MessageMedia.fromUrl/fromFilePath. ده الـscope لـV19.70.5 (يحتاج VPS redeploy)." },
    ]
  },
  {
    version: "V19.70.3",
    date: "2026-05-05",
    types: ["feature", "ux"],
    title: "⚡ Instant paymentReceived — رسالة العميل توصل لحظياً عند تسجيل الدفعة",
    changes: [
      { type: "feature", text: "⚡ [Client-side instant fire لـpaymentReceived] قبل V19.70.3 الـpayment trigger كان يـwait الـcron (5 دقايق max). User report: 'لما المحصّل يستلم دفعات عند العملاء ويسجل عل الموبيل، الرسالة لازم توصل العميل فوراً' — الـ5 دقايق مش مقبولة في الـuse case ده. **الـFix**: ضافت client-side hook في TreasuryPg.jsx — لحظة ما `saveTx` يكمل، الـapp يـcall `/api/event-trigger` مباشرة بـadmin token. الـuser يشوف الـsave حصل، الواتس عند العميل بيوصل في ثواني (مش دقايق)." },
      { type: "feature", text: "🛡️ [Cron remains fallback] الـclient hook هو fire-and-forget — لو فشل (network down، الـapp اتقفلت قبل الـrequest يخلص، لو فيه bridge error)، الـnext cron tick هيـcatch up خلال ≤5 دقايق. الـidempotency عبر `payment:${id}` يضمن مفيش double-send، حتى لو الـclient و الـcron الاتنين فيوا في نفس الوقت — السكان الجاي يلاقي الـkey في eventHistory ويـskip." },
      { type: "feature", text: "💰 [Balance computed client-side] الـclient يحسب الـbalance بنفس الـformula اللي في الـcron-side (deliveries × price − returns − payments − new amount) ويبعتها في الـpayload. الـ{balance} variable في الرسالة يعرض الرصيد الصح بعد الدفعة دي." },
      { type: "ux", text: "🎯 [Scope: only NEW + customer payments + linked customer + has phone] الـhook يـfire فقط لما الشروط الـ4 مستوفاة: (1) entry جديد (مش edit)، (2) txCategory==='دفعة عميل'، (3) الـcustomer مربوط (linkedCustId)، (4) الـcustomer عنده phone. أي واحدة منهم missing → skip silently، الـcron يبقى المسؤول الوحيد. ده يحمي من الـunintended fires في الـpaths الجانبية." },
      { type: "improvement", text: "⏱ [Sale completed لسه cron-only] الـsale event مش instant في V19.70.3 — لسه عبر cron 5-min. الـuse case الأساسي للـuser هو payment (المحصل). لو محتاج sale instant كمان، نضيف hook في DetPg/CustDeliverPg في V19.70.4." },
    ]
  },
  {
    version: "V19.70.2",
    date: "2026-05-05",
    types: ["fix", "automation"],
    title: "🛡️ Backfill prevention + customer balance computation in payment messages",
    changes: [
      { type: "fix", text: "🚨 [الـCRITICAL: triggers كانت بـfire لـevents قديمة قبل تفعيل الـtrigger] User report: فعّل paymentReceived ووصلته رسالة لعميل بدفعة دفعها امبارح. السبب: الـscan كان فلتر بـ24h date window، لكن الـ24h هي 'اليوم وامبارح' — مش 'منذ تفعيل الـtrigger'. النتيجة: events قديمة (قبل تفعيل) كانت بـfire لو وقعت في اخر 24 ساعة. **الـFix**: كل event دلوقتي عنده `enabledAt` timestamp — يتعمل set كل مرة المستخدم يفعّل الـtrigger. الـ4 scan functions بيـskip أي entity `createdAt < enabledAt`. النتيجة: لما تفعّل trigger النهاردة، 0 رسائل لـevents من قبل — لو حتى وقعت من ثانية واحدة قبل التفعيل." },
      { type: "fix", text: "💰 [الرصيد كان بـ0 في الـpaymentReceived message] السبب: الـpayload كان بـuse `p.balanceAfter` — الـfield ده مش موجود في الـpayment record (مش بنحسبه عند الـsave). النتيجة: الـ{balance} variable كان دايماً 0. **الـFix**: ضافت `computeCustomerBalances(orders, payments)` helper — يحسب الرصيد من الـformula الكاملة (الـformula نفسها اللي في daily report alerts section): `Σ(deliveries × price) − Σ(returns × price) − Σ(payments)`. الـscan دلوقتي يـlookup balances[custId] = الرصيد الحالي بعد الدفعة دي. الـmessage يعرض القيمة الصح." },
      { type: "fix", text: "🛡️ [Auto-migration للـusers الموجودين] الـusers اللي فعّلوا triggers في V19.70/V19.70.1 ما عندهمش `enabledAt`. **الـFix**: `ensureEnabledAt()` helper — أول scan بعد upgrade يـset `enabledAt = now` ويـskip الـscan دي. السكان الجاي يستخدم الـtimestamp ويفلتر صح. ده يضمن الـmigration بدون burst من الـrefires." },
      { type: "ux", text: "📅 [UI: 'مفعّل من' badge في الـEventCard] لما الـevent تكون مفعّلة، badge أخضر يعرض timestamp الـenable + سطر شارح: 'لن تتم معالجة أي event حصل قبل التاريخ ده'. الـuser يفهم بالظبط هو متى الـtrigger ابتدى يـmonitor." },
      { type: "improvement", text: "⚡ [Performance: orders cached cross-scans] الـsale + payment + lateOrder الـ3 محتاجين الـorders. قبل V19.70.2 كانت 3 reads منفصلة في كل tick. دلوقتي read واحد + cached + passed لكل الـscan functions. للـusers اللي عندهم 100s of orders ده فرق ملحوظ في تكلفة Firestore." },
    ]
  },
  {
    version: "V19.70.1",
    date: "2026-05-05",
    types: ["fix", "feature", "ux"],
    title: "🛠️ V19.70 patch — Check Due بكل التفاصيل + Payment method picker + double-currency fix",
    changes: [
      { type: "fix", text: "🐛 [الـCRITICAL: double-currency في الـmessage templates] قبل V19.70.1 الـauto-formatter كان بيـadd ' ج.م' لـ{amount}/{value}/{balance}، والـtemplate كمان فيها ' ج.م' في النص. النتيجة: '12,500 ج.م ج.م' في كل رسالة فيها قيمة. **الـFix**: الـauto-formatter دلوقتي بـformat الرقم بـthousand separators بس (12,500)، الـtemplate يتحكم في الـcurrency. الـtemplates الموجودة سليمة لأنها كانت أصلاً بتـكتب ' ج.م'. الـmessages بقت نظيفة." },
      { type: "feature", text: "📅 [Check Due بكل التفاصيل + only-in-factory filter] V19.70 كانت بـtرفع alert لأي شيك مش 'محصل/مرتد/ملغي'. ده غلط — الشيك المظهَّر (مُظهّر، اتنقل لمورد) مش في حوزتنا. **الـFix**: الـscanner دلوقتي يفلتر ON `status === 'معلق'` بس (الشيكات الموجودة فعلاً في المصنع). + الـpayload اتـenriched: الـ{checkType} ('ورقة قبض من عميل' / 'ورقة دفع لمورد')، {partyKind} (العميل/المورد)، {partyName}، {office} (الـcompanyName من الـcustomer/supplier record)، {notes}، {category}، + الـold {bank}/{checkNo}/{amount}/{dueDate}/{daysToDue}. الـdefault template اتحدّث ليعرض كل ده بـemoji-prefixed lines." },
      { type: "feature", text: "💳 [Payment method picker في خانة الخزنة] قبل V19.70.1 الـmethod كان hardcoded 'كاش' في كل custPayment/supplierPayment. ده بيظهر في الـpayment-received message كـ'الطريقة: كاش' لكل دفعة. **الـFix**: الـtreasury form دلوقتي عنده dropdown لـ4 methods (نقدي كاش، تحويل محفظة الكترونية، تحويل انستاباي، تحويل بنكي) — يظهر فقط لما تختار 'دفعة عميل' (in) أو 'دفعة مورد' (out). الـvalue يـsave في الـpayment record + يظهر في الـ{method} variable في الـmessage." },
      { type: "ux", text: "🔄 [Edit-time method sync] لما تـedit حركة خزنة موجودة من قبل، الـform يـlookup الـlinked custPayment/supplierPayment من الـtreasuryTxId ويعرض الـmethod المسجّل (مش بيحط الـdefault). كده الـuser يقدر يغيّر الـmethod لو سجّل غلط بدون ما يـoverwrite الـsaved value." },
    ]
  },
  {
    version: "V19.70",
    date: "2026-05-05",
    types: ["feature", "automation"],
    title: "🔥 Event Triggers — instant WhatsApp on sale/payment/late-order/check-due",
    changes: [
      { type: "feature", text: "🔥 [4 event types مع UI configurable كامل] Sale Completed (بيع للعميل) + Payment Received (دفعة من عميل) + Late Order (أوردر متأخر >N أيام) + Check Due (شيك يستحق خلال N أيام). كل event عنده toggle ON/OFF، اختيار recipients (customer/owner)، template editable per role مع variables hint + preview + reset-to-default + threshold للـcron-detected events. Tab جديد '🔥 Triggers الفورية' في الـAutomation page." },
      { type: "feature", text: "🟢🟡 [Mode toggle: Auto vs Manual — fallback للـserver issues] Auto mode: الـsystem يبعت تلقائياً (cron scan كل 5 دقائق + retry على failure). Manual mode: الـevents تتـqueue في pending list، الـuser يبعت كل واحدة بإيدها. مفيد لو الـbridge/server عنده مشكلة وعايز تتحكم باليد. الـpending queue موجود في الـmodes الاتنين كـfailsafe — لو الـbridge فشل في auto، الـevent يـcommitت في pending للـretry." },
      { type: "feature", text: "📋 [Pending queue الاحترافي] (1) عرض كل الـevents اللي في الطابور مع payload summary + attempts count + last error، (2) زر 'إرسال' per-row (force-fire عبر الـendpoint بـadmin token)، (3) زر 'إرسال الكل' للـbatch، (4) زر discard، (5) إشارة red للـentries اللي فشلت 5+ محاولات (تـneed manual review). الـcron يـauto-drain الـqueue كل 5 دقائق في auto mode (10 entries per tick max)." },
      { type: "feature", text: "🤖 [Cron-side scanning في 4 paths] الـautomation-tick بيـscan في كل tick: (1) recent sales آخر 24 ساعة (saleCompleted)، (2) recent payments آخر 24 ساعة (paymentReceived)، (3) late orders بـthresholdDays config، (4) checks due ضمن thresholdDays. الـidempotency عبر eventHistory keyed by composite keys (e.g. `sale:${orderId}:${date}:${qty}:${custId}`). الـ24-hour filter يضمن إن الـold entries ميـre-fireش حتى لو eventHistory رول-أوف." },
      { type: "feature", text: "🛡️ [Idempotency + duplicate prevention] كل event عنده idempotencyKey unique. الـeventHistory[] (cap 100) بيتشيك قبل أي fire. الـ`force: true` flag يـbypass الـidempotency للـmanual 'Send Now'. الـpending entries أيضاً deduplicated by idempotencyKey. النتيجة: مفيش double-send، حتى لو الـclient و الـcron حاولوا الاتنين على نفس الـevent." },
      { type: "feature", text: "🎨 [Template editor مع variable hints + live preview] كل template بـtextarea مع لائحة الـvariables المتاحة لكل event×role (e.g. saleCompleted-customer: `{customerName}` `{qty}` `{modelNo}` `{value}` `{date}` `{portalLink}`). زر 👁 معاينة يعرض الـrendered text بـsample data — عشان تشوف شكل الرسالة قبل ما تـenable. زر ↺ default يـreset الـtemplate للـbuilt-in." },
      { type: "feature", text: "👤 [Owner phones manager] قائمة أرقام تستقبل الـowner-targeted events (multiple owners possible). الـnumbers تتـnormalize تلقائياً لـ+20 prefix. الـevent اللي عند `recipients.owner: true` يبعت نفس الرسالة للأرقام دي كلها. الـcustomer phone يجي من الـpayload تلقائياً (من الـcustomer record نفسه)." },
      { type: "improvement", text: "🏗️ [Architecture: shared event processor] `api/_eventProcessor.js` فيه الـcore logic (validate + idempotency check + bridge call + history log + pending queue management). الـ`api/event-trigger.js` thin HTTP wrapper. الـ`api/automation-tick.js` يـimport الـ`processEvent` لـcron-detected events + pending drain. صف واحد للـsource of truth، مفيش duplication." },
      { type: "docs", text: "📋 [docs/V19.70.md — full guide] الـsetup للـ4 events، الـmental model للـAuto vs Manual، الـvariable reference per event×role، الـtroubleshooting (لو الـmessage ما جاش)، الـperformance notes (50 sales/payments per tick cap)." },
    ]
  },
  {
    version: "V19.69.5",
    date: "2026-05-05",
    types: ["fix", "feature", "automation"],
    title: "✅ VPS Cron LIVE — الـHTTP 500 الحقيقي محلول + زر reset للاختبار",
    changes: [
      { type: "fix", text: "🐛 [الـRoot cause الحقيقي للـHTTP 500] V19.69.3 attribute السبب لـcross-folder import — كانت theory غلط. الـreal cause لقيناه في Vercel runtime logs: `SyntaxError: Unexpected token '*' at compileSourceTextModule`. السطر 5 في `api/automation-tick.js` كان فيه الـcron pattern `*/5 * * * *` **داخل** `/* */` block comment. الـ`*/` في `*/5` بيـclose الـcomment بدري — فالـparser يحاول يـparse الباقي كـcode، يفشل، Vercel يرد 500 بدون body. الـVite build ماـcatch-ـوش لأن Vite بيـcompile `src/` بس مش `api/`. **الـFix**: شيلت الـliteral cron pattern من الـcomment وحطيت reference لـdocs/V19.69.md. الـ`api/_buildDailyReport.js` (V19.69.3) لسه موجود — ما كانتش مشكلة لكن مفيدة كـsafety belt." },
      { type: "automation", text: "⏰ [VPS cron LIVE — autonomous end-to-end] الـcrontab line اتضافت على Contabo VPS: `*/5 * * * * curl -fsS https://app.../api/automation-tick -H 'Authorization: Bearer $SECRET' >> /var/log/clark-automation.log 2>&1`. الـAUTOMATION_TICK_SECRET في Vercel env (40-char random). الـcron service `active`. الـcurl test من VPS بيرجع 200 + `triggerSource: \"cron\"`. الـUI panel يحدّث `lastTickAt` كل 5 دقايق — الـVPS Cron pill بيبقى 🟢 نشط. الـscheduled time في الـsettings بقى يـfire تلقائياً بدون أي تدخل. النظام autonomous بمعنى الكلمة." },
      { type: "feature", text: "↺ [زر 'مسح تم إرساله اليوم' للـadmin testing] قبل V19.69.5 لو الـscheduler بعت الرسالة، الـ`lastSentAt` بيتسجل و باقي اليوم كل محاولة بترجع `skipped: already-sent-today`. عشان تختبر الـscheduled flow تاني في نفس اليوم كنت محتاج تعدّل Firestore يدوياً أو تستنى يوم. دلوقتي الزر يـclear `lastSentAt` (مع confirmation prompt). ميـظهرش إلا لو `lastSentAt` set — فمش بـclutter الـUI لما مفيش حاجة للـreset." },
      { type: "improvement", text: "🛡️ [Local validation protocol — node ESM smoke test ضافت] قبل ما نـzip أي تغيير في `api/`، الـpipeline دلوقتي بتـrun: (1) `node --check` على كل `api/*.js`، (2) ESM `import()` smoke test (نفس الـloader الـVercel runtime بيستخدمه)، (3) `npm run build` (Vite compile للـclient)، (4) pure-function smoke test لو في builder ماس. ده هيـcatch syntax/load errors محلياً قبل الـVercel deploy. السبب: الـ500 ده ضاع منا 3 deploy cycles لأن الـbuild كان passing بس runtime بيـfail." },
    ]
  },
  {
    version: "V19.69.3",
    date: "2026-05-05",
    types: ["fix"],
    title: "🛠️ Patch: HTTP 500 على /api/automation-tick — cross-folder import fix (theory أُلغيت في V19.69.5)",
    changes: [
      { type: "fix", text: "🐛 [الـ500 على الـscheduler endpoint — theory] الـافتراض كان إن `api/automation-tick.js` كان يـimport من `../src/utils/automation/buildDailyReport.js` و Vercel ما بـpackageش cross-folder modules بشكل reliable. **الـattempted Fix**: نسخت الـbuilder لـ`api/_buildDailyReport.js`. الـreal cause اتلقى لاحقاً (V19.69.5) — كان `*/` في الـblock comment. الـsibling builder لسه مفيد كـdefense-in-depth." },
    ]
  },
  {
    version: "V19.69.2",
    date: "2026-05-05",
    types: ["fix", "feature", "ux"],
    title: "🔄 Trigger Now button + manual-test ميـblockش الـschedule + inline cron setup",
    changes: [
      { type: "fix", text: "🐛 [الـCRITICAL: 'ارسل تجربة' كان يـblock الـschedule بقية اليوم] قبل V19.69.2 الـmanual test كان يـ-set `dailyReport.lastSentAt`. الـcron's `alreadySentToday()` يقرأ ده ويـskip. النتيجة: لو ضربت 'ارسل تجربة' الصبح، الـschedule ميـ-fireش لنهاية اليوم. **الـFix**: الـmanual test دلوقتي يـset `lastManualTestAt` (display only)، الـ`lastSentAt` reserved للـscheduled/triggered sends اللي تعد كـ'sent today'." },
      { type: "feature", text: "🔄 [زر جديد: 'شغّل الـscheduler الآن'] يـcall `/api/automation-tick` بـFirebase admin ID token (الـendpoint بقى يقبل الاثنين: cron secret OR admin token). الـuser يقدر يـtest الـfull scheduled flow (auth + report build + bridge + history) **بدون ما يـsetup الـVPS cron الأول**. الـmanual-admin path يـ-bypass الـtime-of-day check (تقدر تجرب أي وقت)، لكن يـrespect 'already sent today' و 'enabled' و 'recipients'." },
      { type: "ux", text: "📋 [Inline cron setup مع copy buttons] قبل V19.69.2 الـwarning panel كان بيقول 'راجع docs/V19.69.md' فقط — friction كبير. دلوقتي الـwarning expandable panel فيها: (1) الـVercel env steps، (2) crontab line مع origin pre-filled من window.location، (3) test curl، (4) copy buttons (📋) لكل code snippet. الـuser ينسخ يـpaste مرة واحدة." },
      { type: "ux", text: "📊 ['آخر إرسال' بقى منفصل: تلقائي vs تجربة] قبل V19.69.2 'آخر إرسال' field واحد — مش واضح إذا كان scheduled أو manual. دلوقتي line تفصيلي: 'تلقائي/scheduler: ...' + 'تجربة يدوية: ...'. الـuser يعرف بالظبط أيهم اتعمل." },
      { type: "fix", text: "🛡️ [Auth: endpoint يقبل cron secret أو admin token] `checkAuth()` في `automation-tick.js` يحاول الـsecret أولاً (cron path). لو فشل، يجرب يـverify الـtoken كـFirebase admin ID token. لو الاثنين فشلوا → 401. ده يفصل الـcron flow (machine-to-machine) عن الـmanual trigger flow (user-initiated)." },
    ]
  },
  {
    version: "V19.69.1",
    date: "2026-05-05",
    types: ["fix", "ux"],
    title: "📊 Daily Report — treasury من المصدر الصحيح + dynamic categories + ج.م",
    changes: [
      { type: "fix", text: "🐛 [الـBugfix الجوهري: treasury section كان under-counting] قبل V19.69.1 الـreport كان يـquery `data.custPayments`/`wsPayments`/`supplierPayments`/`hrLog` مع `_dayItems(date)` filter. ده كان بيـmiss أي حركة في `data.treasury` مش متربوطة بـpayment record (manual entries، transfers، corrections). الـuser شاف 'مرتبات: 140' (لأن hrLog عنده match) لكن باقي البنود 0 — رغم إن الرصيد الفعلي اتغير. **الـFix**: نـiterate `data.treasury` مباشرة (الـsingle source of truth) ونـgroup by `category`. الـreport دلوقتي يعرض كل category عملت حركة فعلية اليوم — مش fixed cash/transfer/checks columns." },
      { type: "ux", text: "💰 [Dynamic categories بدلاً من 3 fixed buckets] قبل: 'كاش / تحويلات / شيكات' (3 buckets ثابتة، باقي الـmovements مخفية). بعد: كل category موجودة فعلياً في الـtreasury entries (دفعة عميل، تحصيل شيك، دفعة مورد، دفعة ورشة، مرتب، سلفة، مصروف عام، تحويل داخلي، إلخ) تطلع كـlines منفصلة مرتبة بالقيمة. الـreport بقى truthful." },
      { type: "ux", text: "📊 [إضافة 'صافي اليوم' (in - out)] لو في حركات اليوم، يطلع سطر إضافي ▲/▼ بصافي الفرق. مفيد لمعرفة الـoverall direction (يوم محصل أكتر من اللي صارف، أو العكس)." },
      { type: "ux", text: "💵 [Currency standardization: 'ج' → 'ج.م'] الـuser فضّل الـabbreviation الكامل لـ'جنيه مصري'. كل الـmonetary values في الـreport (مبيعات، مشتريات، خزنة، تحذيرات، مقارنة) دلوقتي بـ'ج.م' uniform." },
      { type: "ux", text: "🎨 [Spacing بين الـsubsections] سطر فارغ بين 'محصلات اليوم' / 'مدفوعات اليوم' / 'صافي اليوم' / 'أرصدة الخزنة الحالية' — readability أحسن في WhatsApp." },
      { type: "ux", text: "💡 [إضافة count لو عمليات متعددة] لو category عنده >1 transaction اليوم (e.g. 3 دفعات عميل)، يظهر '(3 عمليات)' بعد الـtotal — يدل على إن في detail محتاج transparency." },
    ]
  },
  {
    version: "V19.69",
    date: "2026-05-05",
    types: ["feature", "automation"],
    title: "⏰ Automation Phase 2 — VPS Cron Scheduler (Cairo timezone)",
    changes: [
      { type: "feature", text: "⏰ [الـscheduled send بقى شغّال — حتى والبرنامج مقفول] الـVPS cron يـping `/api/automation-tick` كل 5 دقايق. الـendpoint يـverify shared-secret token، يقرأ الـsettings، يـcheck Cairo time مقابل الـscheduled time، يبني التقرير، يبعت عبر الـbridge، يـlog في الـhistory. الـclient (المتصفح) مش جزء من الـflow — الـVPS يشتغل 24/7. الـsetup steps موجودة في docs/V19.69.md." },
      { type: "feature", text: "🌍 [Africa/Cairo timezone مدمج في الـcomparison] الـAPI يـuse Intl.DateTimeFormat للـconvert UTC → Cairo بصرف النظر عن timezone الـVPS. الـ`time` في الـsettings يمثل Cairo local time. مفيش DST في مصر منذ 2020 (constant UTC+2)." },
      { type: "feature", text: "🛡️ [Idempotent: مش يبعت مرتين في نفس اليوم] الـ`alreadySentToday()` check يـcompare الـ`lastSentAt` لـCairo today's date. لو الـVPS down في 08:00 ورجع في 08:14، الـ08:14 tick يـcatch up. لو الـsend اتعمل بالفعل اليوم، الـcron يـskip تلقائياً." },
      { type: "feature", text: "🟢 [CronStatusPanel في الـAutomation page] يعرض: (1) آخر tick من الـcron (heartbeat)، (2) الـnext scheduled run بـCairo time، (3) warning لو الـcron مش يـping منذ >15 دقيقة. الـpanel يـrefresh عند فتح الصفحة." },
      { type: "feature", text: "🔐 [Auth: AUTOMATION_TICK_SECRET في Vercel env] الـendpoint يـverify Bearer token. الـsecret shared بين Vercel و VPS crontab. لو اتسرب → rotate في Vercel + update الـcrontab. ده + الـbridge AUTH_TOKEN (separate) = defense-in-depth." },
      { type: "improvement", text: "🛠️ [Build snapshot reads min Firestore docs] الـtick الـheartbeat (when nothing is due) يقرأ factory/config فقط — read واحد. الـactual send يقرأ كل البيانات (orders، split، partitioned) — لكن مرة واحدة في اليوم. تكلفة Firestore منخفضة جداً." },
      { type: "docs", text: "📋 [docs/V19.69.md — setup كامل step-by-step] (1) Vercel env var، (2) crontab line، (3) timezone optional config، (4) testing manually، (5) monitoring + debugging commands. مفيش حاجة محتاجة guess." },
    ]
  },
  {
    version: "V19.68.1",
    date: "2026-05-05",
    types: ["fix"],
    title: "🛠️ Patch: Bridge status pill كان يقول 'unknown' بينما الـbridge شغّال",
    changes: [
      { type: "fix", text: "🐛 [BridgeStatusPill — useMemo → useEffect] الـasync side-effect كان داخل `useMemo` — React مش بيـguarantee إن الـsetState يـcommit. الـpill كان بيقول 'unknown' دايماً حتى لو الـbridge READY. الـ-replaceت بـuseEffect مع cleanup + interval refresh كل 30 ثانية." },
      { type: "fix", text: "🐛 [حقل غلط: s.state → s.waState/waReady] الـbridge `/status` بيرجع `{waState, waReady, ok}` مش `{state}`. الـcheck في `onSendTest` كان `status.state !== 'READY'` → دايماً false → blocked. الـ-replace بـ`!status.waReady` (الـcanonical 'ready to send' boolean). دلوقتي الـmanual send يشتغل بدون 'مش جاهز' false-positive." },
    ]
  },
  {
    version: "V19.68",
    date: "2026-05-05",
    types: ["feature", "automation"],
    title: "🤖 Automation Hub — التقارير اليومية عبر WhatsApp (Phase 1)",
    changes: [
      { type: "feature", text: "🤖 [الـAutomation Hub جديد] Tab + زر في الـHome quick actions. الصفحة تحتوي على ٤ tabs: (١) إعدادات التقرير اليومي، (٢) قائمة المستلمين، (٣) سجل الإرسال (آخر 50 رسالة)، (٤) معاينة الرسالة قبل الإرسال. الـbridge URL/token يـreuse من `data.campaignBridge` (بالفعل موجود في الـCampaigns settings)." },
      { type: "feature", text: "📊 [Daily Report builder بـ7 sections قابلة للـtoggle] (1) المبيعات (قيمة، فواتير، أكثر العملاء)، (2) المشتريات (قيمة، إذونات، فواتير)، (3) الخزنة (محصلات بـcash/transfer/check + مدفوعات ورش/موردين/مرتبات + أرصدة الخزنات الحالية)، (4) التشغيل (تسليم اليوم، أوردرات متأخرة >7 أيام، ورش متأخرة)، (5) تحذيرات (شيكات تستحق خلال 7 أيام، عملاء بأرصدة عالية > Y ولم يدفعوا منذ Z يوم — thresholds قابلة للتعديل)، (6) المهام المعلقة per user، (7) مقارنة (مبيعات اليوم vs نفس اليوم الأسبوع اللي فات + percentage)." },
      { type: "feature", text: "📤 [زر 'ارسل تجربة الآن' للـmanual trigger] الـuser يقدر يـsend الآن لكل المستلمين المشتركين عبر الـbridge مباشرة من الـclient. كل إرسال يتـlog في `data.automation.history` مع status (success/fail) + recipientCount + by-user. الـpreview button يعرض الرسالة قبل الإرسال (preview tab بـwhatsapp-style dark background)." },
      { type: "feature", text: "👥 [Recipients management] CRUD list من الأرقام المستلمة. كل recipient عنده toggle 'مشترك في تقرير يومي' (للـfuture multi-report subscriptions). الـnumbers تتـnormalize لـ+20 prefix تلقائياً. الـid، addedAt، addedBy، subscribedReports[] — كله محفوظ في Firestore." },
      { type: "feature", text: "🟢 [Bridge status pill في الـheader] يعرض حالة الـbridge connection (READY/QR/DISCONNECTED) + يـrefresh عند فتح الصفحة. لو الـbridge مش جاهز، الـ'ارسل تجربة' بيرفض ويعرض السبب." },
      { type: "feature", text: "🛡️ [Permissions integration] Tab `automation` ضافت في الـregistry — admin/manager: edit، sales_accountant: view، باقي الـroles: hide. ميـظهرش الزر في الـHome للـusers اللي ميـقدروش يشوفوه." },
      { type: "improvement", text: "📅 [الـscheduling لسه مش مفعّل في V19.68] الـuser يقدر يـconfigure الـtime + sections + recipients، لكن الإرسال التلقائي يـrequires VPS cron — جاي في V19.69 (`/api/automation-tick` endpoint + crontab setup docs). لـnow، يدوي بزر 'ارسل تجربة الآن'." },
    ]
  },
  {
    version: "V19.67",
    date: "2026-05-05",
    types: ["fix", "ux", "security"],
    title: "🛠️ ٣ طلبات: ترحيل القيود + قفل مدير النظام + تنظيف شاشة أوامر القص",
    changes: [
      { type: "fix", text: "🚨 [الـCRITICAL: ترحيل القيود الأثرية كان فاشل] الـuser بلّغ '536 فشل' مع error `(s || []).find is not a function` على customerPay وأنواع تانية. السبب الجذري: في `backfill.js _safePost` كان بيـpass `args[args.length-2]` كـcoa للـpostEntry. ده بيشتغل لـbuilders زي `buildSaleEntry(delivery, customer, order, coa, rules)` (5 args، coa = args[3]). لكن لـbuilders اللي تأخذ config كـlast arg (customerPay، workshopPay، hr، treasury): args = (..., coa, rules, config) — args.length-2 يشاور على `rules` (object) بدلاً من coa. الـ`postEntry` بعدين يـcall `(rules||[]).find(...)` → rules object فميـيكونش له find → crash. **الـFix**: pass coa explicitly من الـouter scope (موجود فعلاً كـvariable). كل الـ536 errors المتوقع تتحل دلوقتي." },
      { type: "ux", text: "🔒 [الترحيل بقى locked في modal] قبل V19.67 الـprogress كان inline في الـcard — الـuser يقدر يـnavigate لـtab تاني وسط الـrun، يترك Firestore writes orphan. دلوقتي full-screen overlay modal بـz-index 99999 + backdrop blur. الـuser ميقدرش يـclick أي حاجة وراه. الـmodal يـunlock تلقائياً بعد الـcompletion. + percentage badge + label واضح + warning 'لا تغلق التطبيق'." },
      { type: "security", text: "🔒 [قفل تعديل/حذف مدير النظام] قبل V19.67 أي user بصلاحية `settings:edit` يقدر يـdemote/delete الـadmin من جدول المستخدمين. ده gap في الـUI (V19.64 firestore.rules بـenforce نفس الـguard على الـDB level). دلوقتي: لو الـrow.role==='admin'، الـSel يبقى disabled-display ('مدير النظام' بـbadge 👑)، الـDelBtn يبقى '🔒' icon non-interactive، والـname column عنده '🔒 محمي' badge. الـbypass الوحيد عبر admin-SDK لو بمشكلة." },
      { type: "ux", text: "🧹 [تنظيف شاشة أوامر القص] شيلت الـ4 KPI cards من فوق (إجمالي الأوامر، كمية القص، متأخر، الإنجاز). الـcounts لسه ظاهرين في الـstatus chips أسفل الـsearch bar (الكل، متأخر، per-status). الـlate filter بـ`detSt==='⚠️'` لسه شغّال عبر الـchip. كود نظيف: ~40 سطر اتشال + الـloop على calcOrder للـtotalCut/totalDel اتشال." },
    ]
  },
  {
    version: "V19.66",
    date: "2026-05-05",
    types: ["fix", "audit", "money"],
    title: "💰 Sale Flow + Money Math — double-submit guard، return price، _key collision، float drift",
    changes: [
      { type: "fix", text: "🛡️ [Double-submit guard على confirmSale] قبل V19.66 الـQR confirm-sale popup كان عنده guard `total<=0` فقط. ضربتين سريعتين على 'تأكيد البيع' = duplicate delivery push على الـorder، لكن journal واحد فقط (بسبب `_key` idempotency). النتيجة: الكمية تتضاعف في الـcustomerDeliveries، مش في الـaccounting. دلوقتي `qrSaleSubmittingRef` يمنع الـsecond click لـ800ms — يكفي للـreact state update يتـcommit." },
      { type: "fix", text: "💰 [Sale-return price ميـvعود لـlist price] قبل V19.66 لو بعت بسعر مخفّض (delivery.price < order.sellPrice مع isDiscounted)، الـreturn كان يـpost عبر `Number(order.sellPrice)` — credit AR بالـlist price → permanent debit drift. دلوقتي الـreturn entry يـcarry `price` field من الـmatching delivery (لو discounted)، و `buildSaleReturnEntry` يـuse `Number(ret.price) || Number(order.sellPrice)`. الـreversals بقت accurate." },
      { type: "fix", text: "🛡️ [Free-sale `_key` collision سُدّت] قبل V19.66 الـ`_key` كان `oid:saleDelivery:sessId:custId:date`. بيع نفس العميل مرتين من نفس الـlinked-session في نفس اليوم = identical `_key` → autoPost.sale يـdedupe الـsecond → الكمية في `customerDeliveries` تتسجل، لكن مش في الـjournal = **silent over-sale**. دلوقتي الـ`_key` يـappend `Date.now()` ms timestamp — كل بيع unique." },
      { type: "fix", text: "💰 [Float drift في invoices.js — كل math operation rounded] قبل V19.66 الـsubtotal/discount/total كانوا يـaccumulate floating-point error (e.g. `1234.5600000000002`). 8 موضع في invoices.js (sales build، sales upsert، purchase build، purchase upsert) كانوا بدون `r2()`. دلوقتي كل multiplication/subtraction/percentage بيمر على `r2(n)` (Math.round(n*100)/100). نفس الـpattern المستخدم في postingRules.js." },
      { type: "audit", text: "🔬 [الـSkipped fixes في الـscope] الـDetPg cut-sync atomic write يحتاج refactor للـDetPg (1845 lines) — موجل لـV19.7. الـ`(data.X || [])` defenses في 110+ مكان: الـwipe guards من V19.62/63/65 بيـcatch الـreal data-loss issues، فالـnull-defense issue cosmetic مش data-integrity. الـDiscount-editor save-on-blur = UX preference، مش bug. الـDate validation كـwarning vs block = business decision." },
    ]
  },
  {
    version: "V19.65",
    date: "2026-05-05",
    types: ["fix", "hotfix", "audit"],
    title: "🛡️ Data Integrity — enforceDataLimits silent-delete bug + _deepEqual + upSales/Tasks safety",
    changes: [
      { type: "fix", text: "🚨 [الـCRITICAL: enforceDataLimits كانت بتمسح day-docs بصمت] قبل V19.65 الـenforceDataLimits بتـtruncate `next.treasury` لـ3000 entries، لكن الـ`next.treasury` بعد hydration بيكون الـfull merged array (10K+ entries من الـday-docs). الـtruncation بتسبّب `syncAllSplitChanges` يشوف الـIDs الناقصة → `deleteDoc()` على day docs → **سنين من treasury/audit/HR-log/payments تتمسح بصمت**. الـbug ده active منذ V16.74 (split migration)، فالـuser قد يكون فقد بيانات تاريخية بدون ما يحس. **الـFix**: enforceDataLimits دلوقتي تـskip الـmigrated fields (treasury، hrLog، custPayments، salesInvoices، وكل SPLIT_FIELDS اللي flag بتاعها set). الـday-docs ميـحتاجوش الـ1MB cap (كل day-doc أصلاً عنده hundreds of entries بحد أقصى)." },
      { type: "fix", text: "🛡️ [JSON.stringify → _deepEqual في 7 مواضع] الـpending-write cleanup logic في 4 listeners (split، sales-split، tasks-split، partitioned) + 4 registerPending* functions كانت بتستخدم `JSON.stringify(a)===JSON.stringify(b)` للـequality. الـpattern ده **order-dependent**: Firestore يقدر يرجّع الـkeys بـorder مختلف بعد round-trip — فـidentical objects تظهر unequal → pending entries تـpersist في الـmap لـ30 ثانية → الـ`flatten()` بيستخدم الـpending data بدل الـserver data → users بيشوفوا stale optimistic data بـoverlay على الـreal server data (incl edits من devices تانية). دلوقتي بيستخدم `_deepEqual` (order-independent) من splitCollections.js." },
      { type: "fix", text: "🛡️ [upSales + upTasks safety guards] قبل V19.65 الـupSales و upTasks مكنش عندهم wipe guard. لو bug زي V19.62 ظهر في الـsales/tasks write path، الـsame data destruction (wipe state + delete day-docs via syncAllSalesSplitChanges) يحصل. دلوقتي الـguard `≥5→0` (نفس الـpattern في V19.62/63 لـupConfig) بيـcheck SALES_SPLIT_FIELDS (packages، custDeliverySessions) في upSales، و TASKS_SPLIT_FIELDS (tasks، stickyNotes، inventoryAudits) في upTasks." },
      { type: "fix", text: "🛡️ [validateBeforeWrite: 4 fields ضافت] الـlist في dataIntegrity.js كان فيه 10 fields — empDebts، generalProducts، productCategories، hrWeeks ما كانوش included. لو الـwrite يمسح ≥3 من أي حقل منهم، ميـtripش الـ`isSafeWrite` validator. ضفناهم. ده extra layer مع V19.62/63 guards اللي بيـcatch wipes في الـpartitionedDataRef، بس validateBeforeWrite بيـoperate على configDoc form (legacy path)." },
      { type: "audit", text: "🔬 [الـSkipped fix: syncPartitionedCollection merge:true] الـaudit اقترح merge:true بدل setDoc الـreplace. لكن في الـ-partitioned model كل doc هو entity كاملة، والـwrite بيمرّر الـwhole object، فـmerge:true vs merge:false سيمانتيكياً نفس الشيء. الـreal fix لـconcurrent edits = optimistic concurrency control (version field) — change كبير محجوز لـv19.7+." },
    ]
  },
  {
    version: "V19.63",
    date: "2026-05-05",
    types: ["fix", "improvement", "audit"],
    title: "🛠️ Quick Wins بعد الـaudit الشامل — 6 إصلاحات small-risk عالية القيمة",
    changes: [
      { type: "fix", text: "🛡️ [V19.62 guard وُسّع ليـcover الـsplit fields + hrWeeks] الـmass-wipe guard اللي اتزرع في V19.62 كان بيـcover 8 fields بس (PARTITIONED_FIELDS_V1957). أي bug مماثل في split path (treasury، salesInvoices، custPayments، tasks) أو في hrWeeks كان undetectable. دلوقتي الـguard يـsweep كل PARTITIONED_FIELDS + كل SPLIT_FIELDS اللي الـwrite بيلمسها. نفس threshold ≥5→0 (rare-enough to never catch legitimate edits)." },
      { type: "fix", text: "💾 [snapshot writer dynamic] الـlocalStorage snapshot writer كان hand-picked 12 keys — وكان hrWeeks ناقص! يعني HR/payroll مكنش يـhydrate من cache على البدء، نفس 'empty list flash' V19.59 صلحه — لكن كان لسه active لـHR. دلوقتي الـwriter dynamic over PARTITIONED_FIELDS فيـauto-extend مع أي field جديد. الـreader (line 296) و الـwriter دلوقتي متطابقين 100%." },
      { type: "fix", text: "📦 [splitData initial state dynamic] كان hardcoded `{treasury:[],auditLog:[],hrLog:[]}` (3 fields بس) في V16.74. V19.49+50+52+53 ضافت 11 split field آخرين، السطر ده ما اتحدّثش. النتيجة: splitData[custPayments] / splitData[salesInvoices] / إلخ بقوا `undefined` لحد ما الـlistener يـfire — يقدر يكسر الـwipe-detector لو الـsale ضغط قبل listener fire. دلوقتي dynamic over SPLIT_FIELDS. نفس bug-pattern زي V19.62." },
      { type: "improvement", text: "⚡ [useMemo deps cleanup — أداء] الـconfig useMemo deps شالوا منها 4 flags ما بتقراش (splitLoaded، partitionedLoaded، salesSplitLoaded، tasksSplitLoaded). V19.59 شال الـgates من الـmemo body لكن الـdeps فضلوا. كل flag flip كان بيعمل re-run للـmemo (وعندهالـsnapshot writer effect بيـrerun كمان) — 4 redundant runs على الـboot. دلوقتي الـmemo بيـrun لما الـactual data state يتغير فقط." },
      { type: "fix", text: "🔢 [Negative-value clamps في 3 inputs] (1) **Discount** في فاتورة البيع/الشراء: `Math.max(0, discountValue)` — `-50` كان بيخلي total أعلى من subtotal (overcharge). (2) **Custom price** في البيع السريع: `Math.max(0, customPrice)` — `-50` كان بيسجل سعر سالب → AR debit سالب. (3) **Salary/bonus/baseHours** في إضافة وتعديل الموظف: clamps على parseFloat — مرتب سالب كان بيـpost كـcredit في حساب مصروفات المرتبات." },
      { type: "improvement", text: "🆔 [Math.random() → gid() في 19 موضع] الـpattern `Math.random().toString(36).slice(2)+Date.now()` كان مكتوب في 19 سطر (HRPg×13، TreasuryPg×2، SettingsPg×3، App.jsx×1). الـid مش sortable (Math.random جاي قبل Date.now)، الـrandom part مش محدد slice، مفيش prefix. دلوقتي gid() الـcanonical — Date-based prefix + 12 random chars + sortable. الـid format موحد عبر التطبيق." },
      { type: "audit", text: "🔬 [الـcontext] V19.63 جزء من roadmap 4-versions بعد audit شامل (Security → Integrity → Sale Flow). كلهم small-risk، high-value. ده الأول — الـQuick Wins اللي مش محتاجة architecture changes ولكن بتـclose 30% من الـMEDIUM findings. V19.64 جاي بـsecurity hardening (Firestore + Storage rules)." },
    ]
  },
  {
    version: "V19.62",
    date: "2026-05-05",
    types: ["fix", "hotfix", "rootcause"],
    title: "🎯 الـRoot Cause الحقيقي: explicitPartBefore كان hardcoded على hrWeeks فقط",
    changes: [
      { type: "fix", text: "🎯 [الـsmoking gun الحقيقي — موجود من V19.57] V19.59/60/61 كانوا تشخيصات جزئية لـsymptoms (merge gate / listener wipe / ref race / error wipe). كل round كان بيـpatch victim مختلف لنفس الـupstream wipe. السبب الفعلي: في `upConfig` الـsnapshot قبل الـmutation كان مكتوب `const explicitPartBefore = {hrWeeks:[...]};` — hardcoded على hrWeeks فقط من V16.75. لما V19.57 ضافت 8 master collections (customers, suppliers, workshops, employees, empDebts, generalProducts, fabrics, accessories)، السطر ده **ما اتحدّثش**. الـtwin patterns في `upConfigTx` (line 3030) و `explicitSplitBefore` (line 3226) و `explicitSalesSplitBefore` (line 3493) كلهم `Object.fromEntries(FIELDS.map(...))` — dynamic. partitioned فقط نُسي." },
      { type: "fix", text: "🔬 [الـCausal chain خطوة-بخطوة] (1) user يأكد بيع → upConfig يتنادى. (2) `explicitPartBefore = {hrWeeks: [...]}` ← مفيش customers. (3) hydration loop: `next[customers] = explicitPartBefore.customers || [] = []`. (4) fn(next) ميـلمسش customers (هي بيع، مش customer edit) → next.customers يفضل []. (5) `newPart.customers = []`. (6) `setPartitionedData(newPart)` يمسح state.customers. (7) `partitionedDataRef.current = newPart` يمسح الـref. (8) القائمة تختفي في الـUI. الـFirestore data بقى سليم لأن `syncAllPartitionedChanges` بيـshort-circuit لو الـbefore و after الاتنين فاضيين — عشان كده hard refresh يرجع البيانات (الـlistener يـfire من Firestore cache)، لكن أي بيع تاني = wipe تاني." },
      { type: "fix", text: "✅ [الـFix الجوهري — سطر واحد] غيّرت `explicitPartBefore` ليبقى dynamic over `PARTITIONED_FIELDS` (نفس الـpattern في explicitSplitBefore). دلوقتي كل master fields بتـsnapshot صح قبل الـmutation. fn(next) يـrun على الـreal data. newPart يحتفظ بالـcustomers. setPartitionedData ميمسحش حاجة." },
      { type: "fix", text: "🛡️ [Defensive guard ضد regressions مستقبلية] ضافت safety check في upConfig: لو write حاول يمسح ≥5 master-data items من field واحد لـ0، الـwrite يتمنع + console.error مع stack trace + toast واضح للـuser. ده يمنع نفس النوع من الـbugs (hardcoded snapshots عند إضافة fields جديدة) من الـsilent escalation. threshold ≥5 آمن — single edits و small batches بتعدي." },
      { type: "fix", text: "📐 [الـlessons learned] الـbug ده كان hidden 4 versions. كل تشخيص كان بيشوف symptom جزئي (listener fire wipes, error handler wipes, ref race) — تشخيصات صحيحة لكن لـvictims مش لـsource. الـsource كان في الـsale write path نفسه. الـdiagnostic test الحاسم: ابحث عن **كل** الـsetState calls على partitionedData (طلع 2 — listener rebuild + upConfig). الـlistener rebuild اتحمى في V19.60+V19.61. الـupConfig كان مكشوف. الدرس: قبل ما تـmutate state، تأكد الـsnapshot بتاعك كامل." },
    ]
  },
  {
    version: "V19.61",
    date: "2026-05-04",
    types: ["fix", "hotfix"],
    title: "🚨 Round 4: ref-vs-state race + listener error wipe — final fix",
    changes: [
      { type: "fix", text: "🚨 [HOTFIX جذري حقيقي: race condition بين الـlistener fire والـuser action] V19.60 صلح rebuild يحفظ الـfields غير الـfired. لكن المستخدم بلّغ إن المشكلة لسه موجودة بعد كل بيع. السبب الحقيقي اتكشف الآن: `partitionedDataRef.current` بيتحدث عبر useEffect **بعد render commit**. في الـboot، listeners تـfire ويـschedule setState، لكن الـref يفضل قديم لحد ما React يعمل render. لو المستخدم ضغط 'تأكيد البيع' في النافذة الزمنية دي (10-50ms) → `upConfig` يقرأ `explicitPartBefore` من الـref القديم (فاضي) → newPart بيكون فاضي → setPartitionedData(newPart) يثبّت الفراغ. **الإصلاح**: تحديث الـref synchronously جوّا setState callback (نفس نمط V19.54 لـconfigDocRef). دلوقتي أي upConfig بعد listener fire يشوف الـfresh data فوراً." },
      { type: "fix", text: "🛡️ [Hardening: listener error handlers مش بيمسحوا الـcache] قبل V19.61، لو listener errored (permission re-eval transient، network blip)، الـerror handler كان بيـmark `firstFires=true` ويـcall rebuild. بس rebuild بـempty docsById يرجع `[]` → الـcache يتمسح. ده حصل في الواقع لأن أي setDoc على factory/config بيـtrigger re-eval لـrules لكل listeners — فممكن listener customersDocs يـerror لـmillisecond بسبب transient permission state — بعدها يـreconnect. لكن كان كافي يمسح الـcache. **الإصلاح**: error handler يـlog فقط، مش يحدث state. الـSDK يعيد الاتصال تلقائياً." },
      { type: "fix", text: "📐 [طُبّق على 4 listeners] split (config) + sales-split (V19.51) + tasks-split (V19.51) + partitioned (master data V19.57). الـ4 كلهم: (1) sync ref update جوّا setState callback، (2) error handler ميـwipeش الـstate. الـboot order race + sale-after-listener race + transient-error race كلهم محلولين دلوقتي." },
      { type: "fix", text: "🔬 [الـbug ده موجود من V19.57] اتكشفت الـ3 layers تباعاً عن طريق reports المستخدم: V19.59 (شيل الـmerge gate)، V19.60 (field-isolated rebuild)، V19.61 (sync ref + error hardening). كل layer كان تشخيص جزئي صحيح لكن مش الـcomplete cause. الـcomplete fix دلوقتي مغطى الـrace patterns الـ3 المعروفة." },
    ]
  },
  {
    version: "V19.60",
    date: "2026-05-04",
    types: ["fix", "hotfix"],
    title: "🚨 إصلاح جذري: العملاء يختفوا بعد البيع — Field-isolated rebuild",
    changes: [
      { type: "fix", text: "🚨 [HOTFIX حرج: السبب الجذري الحقيقي لاختفاء العملاء] V19.59 صلح بداية المشكلة (شيل partitionedLoaded gate + hydrate من localStorage). لكن المستخدم لاحظ: بعد البيع السريع → العملاء تختفي تاني. السبب الجذري الحقيقي: `rebuild()` كان بيـrewrite **كل الـfields** في كل listener fire. لو workshops listener fire الأول → `setPartitionedData({customers:[], workshops:[...], ...})` — بيمسح الـcustomers cache الكاش (لأن docsById.customers لسه Map فاضي). الـ ref بيتـupdate بالقيمة الفاضية → لما المستخدم يعمل بيع، `explicitPartBefore.customers = []` → `newPart.customers = []` → `setPartitionedData(newPart)` يثبّت الفراغ. القائمة تختفي بعد البيع لأن البيع نفسه استخدم الـref اللي اتحدث بفراغ من الـboot." },
      { type: "fix", text: "🛠️ [الإصلاح: Field-isolated rebuild] دلوقتي rebuild يحدّث الـfields اللي listener بتاعها fired فعلاً (`firstFires[f] === true`). الـfields اللي listener بتاعها لسه ما اشتغلش — يحتفظوا بقيمتهم السابقة (من الـlocalStorage cache أو last-good value). يعني لو workshops listener fired أول، customers يفضلوا 35 من الـcache، مش يتمسحوا. لما customers listener نفسه يـfire، وقتها firstFires.customers يصبح true → يتحدّث بالـfresh data من السيرفر. **خلاص مفيش race يفضي الـcache صامتاً.**" },
      { type: "fix", text: "🔄 [طُبّق الإصلاح على 4 rebuild functions] نفس الـbug pattern في 4 listeners: split (config splits)، sales-split (V19.51)، tasks-split (V19.51)، partitioned (master data V19.57). الـ4 كلهم اتعدّلوا — `setX(prev => {...})` بدل `setX(next)` — يحفظ الـfields غير الـfired. partitionedData هو الوحيد اللي فيه cache من localStorage فبيـUSER يحس بالفرق هناك، لكن باقي الـ3 برضه أصح كده architecturally." },
      { type: "fix", text: "🛡️ [Why V19.59 lone gate-removal لم يكن كافي] V19.59 شيل الـ`partitionedLoaded` gate من الـuseMemo. يعني الـmerge بيحصل حتى لو listeners ما اتحملوش. بس **partitionedData نفسها** كانت بتتحط بقيم فاضية بسبب الـrebuild — فالـmerge كان بيستخدم empty arrays من state ولفترة معينة. V19.60 يصلح المصدر: state نفسها بتفضل عامرة بالـcache لحد ما الـlistener فعلاً ييجي بـdata." },
    ]
  },
  {
    version: "V19.59",
    date: "2026-05-04",
    types: ["fix", "hotfix"],
    title: "🚨 إصلاح اختفاء العملاء + بحث البيع السريع",
    changes: [
      { type: "fix", text: "🚨 [HOTFIX حرج: قائمة العملاء كانت تظهر فاضية أحياناً] قبل V19.59 الـmerge في `config` useMemo كان مشروط بـ`partitionedLoaded === true` (يعني كل الـ8 listeners اللي اتزرعوا في V19.57 لازم يـfire الأول). لو **listener واحد** اتأخر أو اتقطع (slow network، multi-tab race، permission hiccup) → الشرط يفضل false → الـmerge لا يحصل أبداً → `data.customers === undefined` → التطبيق يقول 'العملاء (0)'. السبب الجذري: configDoc بعد migration ميحتويش customers/suppliers/employees (اتـstrip)، فلو الـmerge ما حصلش، مفيش مصدر تاني للبيانات. **الإصلاح**: حذف الـ`splitLoaded`/`partitionedLoaded` gates من الـmerge — كل listener يـfill الـdata بتاعته independently. الصفحات بتشوف data.customers=[] لجزء ثانية بدل undefined لو listener بطيء، وتنعكس فوراً لما الـlistener يـfire. الـloaded flags لسه بتمنع الـwrites (upConfigTx) وده الصح — ما تكتبش قبل ما تقرا — لكن الـreads مش لازم يستنوا." },
      { type: "fix", text: "💾 [Hydrate من localStorage على البدء] التطبيق بقى يقرأ آخر snapshot من localStorage في الـuseState initial — يعني المستخدم يشوف آخر بيانات معروفة فوراً (zero loading flash) حتى لو الـnetwork بطيئة. الـlisteners بتحدّث الـstate بمجرد ما يجيبوا الـfresh data. الـsnapshot بقى يحفظ كل الـ8 master data (customers/suppliers/workshops/employees/empDebts/generalProducts/fabrics/accessories) بدل 5 بس قبل." },
      { type: "fix", text: "🔍 [HOTFIX: البحث في البيع السريع كان ميـلاقيش الموديل أحياناً] في popup البيع السريع، لو العميل عنده موديل في الخطة (التوزيعة)، البحث في الـdropdown كان أحياناً يقول 'لا توجد نتائج' حتى لو الموديل ظاهر في الجدول فوق. السبب: الـfilter كان `linkedSess.modelIds.includes(m.id)` — يقارن بـorder id. لكن نفس الـmodelNo ممكن يكون ليه order ids مختلفة (re-cuts، seasons، تعديل الكميات أنشأ order جديد). الـmodelIds في الـsession فيها الـid القديم، الـstockModels فيها الـid الجديد → الـincludes تفشل. **الإصلاح**: المقارنة بـmodelNo بدل id في 3 مواضع (dropdown، manual add، QR scan)." },
      { type: "fix", text: "🛡️ [Gates الـloaded لسه على الـwrites] حذف الـgates من الـreads (UI) فقط — الـwrite paths (upConfigTx, upSalesTx, upTasksTx) لسه بترفض الكتابة قبل ما الـlisteners يـload (السطر `if(configDoc[FLAG]&&!loaded) return`). ده الصح — مفيش writes غلط بسبب stale state — لكن الـUI مش هتظل عالقة في عرض empty list." },
    ]
  },
  {
    version: "V19.58",
    date: "2026-05-04",
    types: ["improvement", "safety", "fix"],
    title: "🛡️ تحسينات بنية تحتية: backup + schema validation + rollups engine",
    changes: [
      { type: "fix", text: "🚨 [إصلاح هام في الـauto-backup] الـcomprehensive backup كان من V18.62 وما اتحدّثش لما اضفنا collections جديدة في V19.49 → V19.57. كان بيـbackup factory/config + sales + tasks + treasuryDays/auditDays/hrLogDays + hrWeeksDocs فقط. الـ24 collection اللي اتعملوا في V19.49→V19.57 (custPaymentsDays, salesInvoicesDays, packagesDays, tasksDays, customersDocs, suppliersDocs, ... إلخ) كانوا **مش متضمنين في الـbackups**. لو حصلت كارثة وحبيت تـrestore من backup قديم، كنت هتلاقي الفواتير والمدفوعات والعملاء كلهم ضايعين. V19.58 يصلح ده — الـbackup دلوقتي بيغطي كل الـ29+ collection." },
      { type: "improvement", text: "🛡️ [Schema validation بـZod في WARN mode] ضافت طبقة حماية: كل write على factory/config + sales + tasks بيمر على Zod schemas للـentities المهمة (customers, suppliers, workshops, employees, invoices, payments, treasury). الكتابات اللي ما تطابقش الـschema بتتسجل في console + Settings card 'آخر تحذيرات التحقق'. **WARN mode** يعني: مش بيمنع الـwrite، بس بيـsurface الأخطاء. ده safety net للـbugs اللي ممكن تكتب shape غلط بسبب refactor أو import. بعد ما تستقر النسخة في الإنتاج بدون false positives، ممكن نحوّل schemas معيّنة لـSTRICT mode." },
      { type: "improvement", text: "📊 [Rollups engine للـreports — utils/rollups.js] ضافت module جديد بـ4 functions جاهزين: `computeFinancialRollup(data, {from, to})` للـtotals + per-customer + per-supplier breakdowns، `computeMonthlyRollup(data, 'YYYY-MM')` للشهر الواحد، `computeCustomerStatement(data, custId)` لكشف الحساب، `computeSupplierStatement(data, supId)` للموردين. كلهم pure functions — بـiterate الـlocal data ويرجعوا rollup كامل. الـpages تقدر تستخدمهم بـuseMemo (سرعة 50ms × عدد المرات اللي بتـrender). ده الأساس للتقارير المتقدمة في V19.59+." },
      { type: "safety", text: "🔒 [استمرارية الحماية] الـ3 features دي مع بعض = layer من الحماية:\n- **Backup** يضمن إن مفيش بيانات تضيع بكارثة\n- **Schema validation** يقبض الـbugs قبل ما تتراكم\n- **Rollups engine** يضمن consistency بين التقارير في مختلف الصفحات\nالتطبيق دلوقتي عنده fault tolerance + observability أحسن بكتير." },
      { type: "improvement", text: "📦 [Zod dependency] ضافت `zod ^3.23.8` كـrunning dependency. حجم ~10KB gzipped. مكتبة معيارية، 30M+ download/شهر، Zero config، tree-shakeable. المخططات في `src/schemas/index.js` — بسيطة وقابلة للقراءة بمنطق سريع." },
    ]
  },
  {
    version: "V19.57",
    date: "2026-05-04",
    types: ["architectural", "improvement", "safety"],
    title: "🏗️ Master data byId — كل entity = ملف منفصل (الـArchitecture اكتمل)",
    changes: [
      { type: "architectural", text: "🏗️ [Master data byId partitioning] V19.57 يحوّل آخر 8 arrays في factory/config لـbyId collections: **customers** → customersDocs/{id}، **suppliers** → suppliersDocs/{id}، **workshops** → workshopsDocs/{id}، **employees** → employeesDocs/{id}، **empDebts** → empDebtsDocs/{id}، **generalProducts** → generalProductsDocs/{id}، **fabrics** → fabricsDocs/{id}، **accessories** → accessoriesDocs/{id}. كل entity ملف لوحده — تعديل عميل واحد = write 1 doc بدل config كامل. factory/config بقى ثابت الحجم تماماً (~30 KB) للأبد، يحمل settings + lookup tables بس." },
      { type: "improvement", text: "🔄 [Engine موسّع — partitionedCollections.js] الـengine موجود من V16.75 لـhrWeeks. V19.57 يضيف 8 fields جديدة + selective stripping بـflag (نفس نمط splitCollections). PARTITIONED_FIELDS_V1675 + PARTITIONED_FIELDS_V1957 + 2 flags. أي doc في config مش في group flagged ميتمسحش. ضامن للـrolling deploy." },
      { type: "improvement", text: "🔁 [Migration ذكي مع id-fix] الـmigration بياخد كل array من config، يضمن إن كل entity فيها `id` (يولد واحد لو مفيش)، يكتب كل entity كـdoc منفصل في collection بتاعها. لو 3000 موظف + 200 عميل + 150 مورد + ... كله بيتعمل في batches بـ8 collections × N docs. UI مقفول بـmodal واضح + progress." },
      { type: "improvement", text: "🛠️ [readPartitionedCollection helper جديد للـAPI] في `api/_firebase.js`. الـportal endpoints (customer-portal, workshop-portal, delivery-confirm, workshop-delivery-confirm) كلها كانت بتقرا `config.customers` و `config.workshops` مباشرة. اتحدّثوا يقروا من partitioned collections لو الـflag set + fallback لـconfig للـbackward compat." },
      { type: "improvement", text: "♻️ [App.jsx wiring بقى dynamic] قبل V19.57 الـpartitioned listener كان hardcoded لـhrWeeks فقط (~12 موضع). دلوقتي بقت loops على PARTITIONED_FIELDS — listeners، pendingWrites، rebuild، optimistic updates، sync logic. أي field جديد يضاف في partitionedCollections.js يتدعم تلقائياً بدون أي تعديل في App.jsx. ضامن للـV19.58+." },
      { type: "improvement", text: "📐 [Firestore Rules + 8 collections جديدة] customersDocs (sales scope)، suppliersDocs/generalProductsDocs (purchase scope)، workshopsDocs/fabricsDocs/accessoriesDocs (manager scope)، employeesDocs/empDebtsDocs (HR scope). نفس الصلاحيات اللي كانت قبل التقسيم." },
      { type: "improvement", text: "📊 [PartitionedDocsMonitor بقى 9 collections] في الإعدادات → '📑 مراقبة الـDocuments المُجزّأة'. badge V16.75 لـhrWeeks، badge V19.57 لـ8 master data. labels generic (الاسم/التفاصيل) بدل hrWeeks-specific (الأسبوع/التواريخ). Stats includes total docs + total size + avg size per collection." },
      { type: "safety", text: "🔒 [الـArchitecture اكتمل] بعد V19.57:\n- factory/config = settings + lookup tables (ثابت الحجم)\n- factory/sales = settings (ثابت)\n- factory/tasks = settings (ثابت)\n- 20 daily-split collection للـoperational data\n- 9 byId-partitioned collection للـentities\nمفيش doc واحد في النظام كله ممكن يكبر مهما طال الوقت أو زاد النشاط. الضمان الرياضي تام." },
    ]
  },
  {
    version: "V19.56",
    date: "2026-05-04",
    types: ["fix", "hotfix", "improvement"],
    title: "🚨 ترحيل الفواتير: progress حقيقي + إصلاح false toast",
    changes: [
      { type: "fix", text: "🚨 [BUG round 3: progress modal بيقول 'تم' قبل الكتابة الفعلية تخلص] V19.55 صلح الـrace بالـserialization، لكن المستخدم لاحظ: ترحيل 80 فاتورة → modal يقول '80/80 done' خلال ثانية، toast 'فشل ترحيل' يظهر، الفواتير تظهر posted، بعد 5 ثواني 79 يرجعوا draft، وكل ثانيتين 1-2 يخرجوا تدريجياً. السبب: `upConfig` كان fire-and-forget — schedule الـwrite في الـqueue ويرجع. الـbulk loop's `await postOne(item)` بيرجع بعد الـoptimistic update فقط، الـactual setDoc لسه قيد الانتظار في الـqueue. النتيجة: progress UI كاذب، الـlistener pull الـserver state → الفواتير اللي لسه ما اتكتبتش بترجع draft." },
      { type: "fix", text: "🛠️ [الإصلاح: upConfig/upSales/upTasks بقوا يرجعوا الـTx promise] قبل V19.56 كانوا بيـreturn undefined. دلوقتي بيـreturn الـpromise بتاعة upConfigTx (الـqueued setDoc). لما الـcaller يعمل `await upConfig(...)` بيستنى الـactual flush لـFirestore. handlePost في كل صفحات الترحيل (Sales/Purchase/CreditNotes/DebitNotes) اتعمل refactor — كل `upConfig` فيها بقت `await upConfig`. الـbulk loop `for(item) await postOne(item)` بقى يستنى الكتابة الفعلية فعلاً." },
      { type: "fix", text: "🛠️ [إصلاح false 'فشل ترحيل' toast] handlePost كان فيه `.catch(e => console.warn(...))` بيبلع أي error في autoPost ويرجع promise resolved. الـbulk loop يحسب الـiteration success كاذباً، لكن لو exception طلع قبل الـ.catch (مثلاً في customer lookup) → الـloop يحسبه fail. النتيجة: counters غلط، toast بيقول 'فشل' حتى لو الفواتير اترحلت تمام. V19.56 بيـrefactor handlePost: try/await/catch واضح، كل failure يـthrow → loop يحسبه فعلاً failed، success يحسبه success." },
      { type: "improvement", text: "📊 [Progress UI = real state] دلوقتي الـmodal يعرض '3/80', '4/80', '5/80'... بمعدل ~2 ثانية لكل فاتورة. ده الـactual rate. المستخدم بيعرف فعلاً امتى يقدر يقفل الصفحة أو ينتقل لتاب تاني. زر الإيقاف لسه شغال — يوقف بعد الفاتورة الحالية تخلص (مفيش half-state). 80 فاتورة هتاخد ~3 دقايق فعلاً، لكن مش ثانية كاذبة." },
      { type: "improvement", text: "🔒 [Trade-off موثّق: بطء mostly imaginary] الـserialization كان موجود من V19.55. V19.56 ما زادش البطء — بس خلى الـUI يعرضه. قبل V19.56 الكتابات كانت بتاخد نفس الوقت بالظبط، بس الـmodal كان كاذب. دلوقتي ما فيش kazib. autoPost كل فاتورة بيـwrite على treasury+auditLog+journal — كل واحدة في day docs منفصلة (V19.49+) بحجم صغير. سرعة Firestore الواقعية = 1-3 فاتورة/ثانية." },
    ]
  },
  {
    version: "V19.55",
    date: "2026-05-04",
    types: ["fix", "hotfix", "feature"],
    title: "🚨 إصلاح ترحيل الفواتير المتعدد (round 2) + ميزة QC-2 للـQR",
    changes: [
      { type: "fix", text: "🚨 [BUG round 2: الترحيل المتعدد لسه بيرجع draft] V19.54 صلح الـoptimistic state (configDocRef يُقرأ بدل الـclosure)، لكن الـbug فضل ظاهر: 5 فواتير تترحل، وبعد ~3 ثواني 4 منهم يرجعوا draft. **السبب الجذري الحقيقي**: كل setDoc لـFirestore بيشتغل في parallel — لو write 1 (state-after-iter-1) يلحق بعد write 5 (state-after-iter-5) بسبب network jitter، الـserver يعمل overwrite بـstate قديم، فقط iter 1's invoice يفضل posted." },
      { type: "fix", text: "🛠️ [الإصلاح: serialize الـwrites عبر promise chain] ضافت `upConfigWriteQueueRef`, `upSalesWriteQueueRef`, `upTasksWriteQueueRef`. كل setDoc بيستنى قبله. كل write بيوصل Firestore بنفس ترتيب الاستدعاء — last call wins، مهما كان الـnetwork timing. الـqueue لكل doc منفصلة (config / sales / tasks) فمفيش cross-doc blocking. على single-action operations: غير محسوس (queue فاضي). على bulk operations: يمنع الـrace condition تماماً." },
      { type: "feature", text: "🏷️ [QC-2: ميزة درجة تانية لطباعة QR] في popup طباعة QR (من الـDashboard أو DBPg)، ضافت checkbox '⚠️ درجة تانية'. لما يتعلم: (1) الـQR يصغر ~80% من حجمه الأصلي. (2) ختم 'QC-2' في مستطيل صغير بحدود سوداء يظهر تحت الـQR. (3) شغّال في كل التابات الأربعة (يدوية / سيري / تلقائية / قطعة). الـQR payload نفسه (CLARK:orderId:qty) ميتغيرش — الـscanner في المخزن بيشتغل عادي." },
      { type: "improvement", text: "🔍 [Audit شامل بعد BUG V19.54] V19.55 جالها مرة تانية: الـlocal state كان متحدّث صح (V19.54 fix شغال)، الـremote write order ده اللي كان متفلت. الـqueue pattern ده بيغطي **كل operations** في التطبيق على factory/config + factory/sales + factory/tasks. أي rapid sequential writes (مش بس bulk-post) محمية الآن." },
    ]
  },
  {
    version: "V19.54",
    date: "2026-05-04",
    types: ["fix", "hotfix", "safety", "improvement"],
    title: "🚨 إصلاح bug جذري في upConfig + progress modal للترحيل المتعدد",
    changes: [
      { type: "fix", text: "🚨 [BUG جذري حرج: upConfig كان بيستخدم stale closure] قبل V19.54، `upConfig` كان بيقرا `configDoc` من React closure (snapshot وقت render). في loop سريع زي bulk-post: iteration 1 يعمل optimistic update → invoice1=posted. **قبل ما React يعيد render**, iteration 2 يبدأ بقاعدة بيانات stale (invoice1 لسه draft عند الـclosure) → بيـoverride الـoptimistic update! النتيجة: ترحيل 5 فواتير → آخر واحدة بس تفضل posted، الـ4 الباقيين يرجعوا draft. **الإصلاح:** قراءة من `configDocRef.current` (موجود من V19.48 لكن مش مستخدم في الـcompute path) + تحديث الـref synchronously بعد setConfigDoc. الـbug ده كان موجود من V16.80 — أي 2 actions متلاحقين بسرعة كانوا ممكن يحصل فيهم data loss." },
      { type: "fix", text: "🛠️ [نفس الإصلاح طُبّق على upSales + upTasks] الـ3 helpers الـcore عندهم نفس النمط. كلهم بقوا يقروا من *DocRef.current بدل closures. البيانات في factory/sales (packages, custDeliverySessions) و factory/tasks (tasks, stickyNotes, inventoryAudits) كانت معرّضة لنفس الـbug في أي bulk/sequential operation." },
      { type: "improvement", text: "📊 [Progress modal blocker لـbulk-post] قبل V19.54، ترحيل عدة فواتير كان silent — مفيش indicator. المستخدم يقدر يـclick أي حاجة أثناء الترحيل أو يقفل الصفحة. V19.54 يضيف modal full-screen blocker بـprogress bar (0% → 100%)، عداد done/total، عداد ok/fail، اسم الفاتورة الحالية live، زر إيقاف. الـmodal يقفل الـUI طول العملية ويختفي تلقائياً بعد الانتهاء بـ700ms مع toast نتيجة." },
      { type: "improvement", text: "⏹ [زر إيقاف ذكي] أثناء الترحيل، زر 'إيقاف بعد الفاتورة الحالية' متاح. مش بيعمل abort وحشي — بيخلي الفاتورة الحالية تخلص بأمان (عشان مفيش half-state)، وبعدين يوقف الـloop. الفواتير اللي اترحلت قبل الإيقاف تفضل posted. Toast يقول كم اترحلت وكم اللي مش اتعمل." },
      { type: "safety", text: "🔒 [Audit شامل للتطبيق] تم البحث في كل ملفات الـsrc عن نفس النمط (loops + sequential mutations). مفيش حالة تانية في الـpages بنفس الخطر. الإصلاحات الـ3 في upConfig/upSales/upTasks كافية لتغطية كل الـsurface الحرج." },
      { type: "improvement", text: "📁 [docs/ folder] كل ملفات .md (HANDOFF, SECURITY, V19.49-V19.53) اتنقلت لـ`docs/` folder منفصل. أي ملف توثيق جديد هانضيفه هناك مباشرة." },
    ]
  },
  {
    version: "V19.53",
    date: "2026-05-04",
    types: ["architectural", "improvement", "safety"],
    title: "🔔 refactor + split الإشعارات — حل race conditions نهائياً",
    changes: [
      { type: "architectural", text: "🔔 [Notifications refactor — readBy/dismissedBy/doneBy خرجوا من الـnotification entry] قبل V19.53 كان كل إشعار فيه `readBy:[emails]`, `dismissedBy:[emails]`, `doneBy:[emails]` arrays. لما 5 users يقروا نفس الإشعار في نفس اللحظة → 5 writes متوازية على نفس entry → race condition (lost updates). الحل: ضافت collection جديد `userNotifStates/{userEmail}` فيه `{reads, dismisses, doneTasks}` لكل user. كل user بيكتب على doc بتاعه فقط. الإشعار نفسه بقى **immutable** بعد إنشائه → صفر contention." },
      { type: "architectural", text: "🏗️ [Daily-split لـnotifications] بعد الـrefactor، الـnotifications بقت آمنة للـsplit. اتنقلوا لـ`notificationsDays/{YYYY-MM-DD}`. النتيجة: factory/config مفيهوش `notifications` array بعد كده. آخر array operational اتقسم — factory/config مكون من settings + master data بس." },
      { type: "improvement", text: "🔁 [Migration ذكي — بيـextract حالة كل user] الـmigration بيـiterate كل notifications الموجودة، ولكل user في readBy/dismissedBy/doneBy → بيكتب على userNotifStates/{email}. لو 100 إشعار × 7 users على متوسط = 700 write — كلهم idempotent عبر setDoc(merge:true). فبعد الـmigration حالة كل user محفوظة ومش هيشوف إشعارات قراها قبل التحديث." },
      { type: "fix", text: "🛠️ [API endpoints بقت تكتب في notificationsDays] `delivery-confirm.js` و `workshop-delivery-confirm.js` كانوا بيكتبوا notifications في config مباشرة. ضافت helper جديد `appendToSplitDay(collectionName, entry)` في `api/_firebase.js` يكتب على day doc الصح. كل endpoint بيـcheck الـflag — لو V19.53 done يستخدم day doc، وإلا fallback على config (backward compat للـrolling deploy)." },
      { type: "improvement", text: "🎯 [Optimistic update لـmarkRead/markTaskDone] بدل ما يستنى Firestore round-trip، الـUI بيتحدّث فوراً عبر setUserNotifState. لو الكتابة فشلت (نادر) → console.warn، والـuser ميشوفش الإشعار — بس الـlistener هيرجّعه لو الـsetDoc اتراجع. UX أسرع." },
      { type: "improvement", text: "📐 [Firestore Rules + 2 collections جديدة] notificationsDays (any authed user write — لأن أي user بيبعت إشعار)، userNotifStates/{email} (write مقيّد بـ`request.auth.token.email == email` — كل user بيكتب على doc بتاعه بس)." },
      { type: "safety", text: "🔒 [Backward compat للـnotifs القديمة] الـfilter logic بيتحقق userNotifState.dismisses أولاً، وكـfallback بيتحقق من readBy/dismissedBy على الـentry نفسها. ده يعني لو حصل rolling deploy وحد كاتب نسخة قديمة لسه بـreadBy → الـUser على V19.53 هيقرا الحالة الصح برضه." },
      { type: "improvement", text: "📊 [لوحة المراقبة بقت 20 collection] في الإعدادات → '📅 مراقبة التخزين اليومي' بقت تعرض notificationsDays + 19 collection سابقة. badge V19.53 مميّز." },
    ]
  },
  {
    version: "V19.52",
    date: "2026-05-04",
    types: ["architectural", "improvement", "fix"],
    title: "🏗️ آخر العمليات الكبيرة في factory/config + hotfix بورتال العميل",
    changes: [
      { type: "fix", text: "🚨 [HOTFIX حرج: بورتال العميل/الورشة كان مش بيعرض الدفعات] الـAPI في `/api/customer-portal.js` و `/api/workshop-portal.js` كانوا بيقروا `config.custPayments / config.checks / config.wsPayments` مباشرة من factory/config، لكن بعد migration V19.49 الحقول دي اتنقلت لـday collections. النتيجة: العميل يفتح اللينك بتاعه يلاقي 'سجل المدفوعات فارغ' مع إن الدفعات ظاهرة في الخزنة وكشف الحساب الداخلي. **الإصلاح:** ضافت `readSplitCollection` helper في `api/_firebase.js` يقرأ من admin SDK، والـportal endpoints بقت تقرا من day collections لو الـflag set، و fallback على config للـbackward compat. درس مستفاد: الـVite build بيختبر client code بس — أي migration لازم يـaudit الـAPI endpoints يدوياً." },
      { type: "architectural", text: "🏗️ [Daily-split لآخر 4 arrays operational في config] V19.50 قسّم الفواتير. V19.52 يقسّم آخر الـoperational: **stockMovements** (high-volume warehouse activity) → stockMovementsDays، **purchaseReceipts** (يومي) → purchaseReceiptsDays، **treasuryTransfers** (تحويلات بين الحسابات) → treasuryTransfersDays، **salesAudits** (جرد المبيعات) → salesAuditsDays. بعد V19.52 = factory/config مفيهوش حقل operational يكبر مهما زاد النشاط. notifications مؤجلة لـV19.53 (تحتاج refactor لـreadBy/dismissedBy)." },
      { type: "improvement", text: "🔍 [Pre-flight audit إجباري لكل migration] قبل V19.52، اتعمل audit شامل على `/api/*` و `/clark-wa-bridge/` للحقول الـ4 الجديدة — مفيش endpoint بيقرأ منهم، فالـmigration آمن. الإجراء ده بقى standard لكل version جاية: ممنوع نقل حقل بدون audit external code أولاً." },
      { type: "improvement", text: "📊 [لوحة المراقبة بقت 19 collection] في الإعدادات → '📅 مراقبة التخزين اليومي' بقت تعرض كل الـ19 المُجزّأة (3 V16.74 + 4 V19.49 + 3 V19.50 + 5 V19.51 + 4 V19.52) مع badges مميّزة لكل إصدار. ضمان رياضي اكتمل لـconfig + sales + tasks." },
      { type: "improvement", text: "📐 [Firestore Rules + 4 collections جديدة] stockMovementsDays + purchaseReceiptsDays + treasuryTransfersDays (purchase scope)، salesAuditsDays (sales scope). نفس الصلاحيات اللي كانت قبل التقسيم." },
      { type: "improvement", text: "🔁 [Migration مع backup كامل] migration block جديد على نمط V19.49/V19.50: backup كامل لـconfig في `backups/pre-migration-split-days-v1952-{ts}` → نقل الـ4 arrays لـday docs → strip + flag في transaction atomic. UI مقفول بـmodal واضح بنسبة التقدم. لو فشلت → الـflag مش بيتكتب → retry تلقائي عند الـreload." },
    ]
  },
  {
    version: "V19.51",
    date: "2026-05-04",
    types: ["architectural", "safety"],
    title: "🏗️ تجزئة factory/sales و factory/tasks — الضمان الرياضي اكتمل",
    changes: [
      { type: "architectural", text: "🏗️ [Daily-split على docs غير factory/config] الـsplit engine اتعمم — قبل V19.51 كان شغّال على factory/config بس. دلوقتي بقى يدعم أي doc. **factory/sales** اتقسم: packages → packagesDays/{YYYY-MM-DD}، custDeliverySessions → custDeliverySessionsDays/{YYYY-MM-DD}. **factory/tasks** اتقسم: tasks → tasksDays/، stickyNotes → stickyNotesDays/، inventoryAudits → inventoryAuditsDays/. النتيجة: 3 docs أساسية (config + sales + tasks) كلها بقت ثابتة الحجم — أي array operational بيكبر يومياً بقى في day docs منفصلة." },
      { type: "safety", text: "🔒 [الضمان الرياضي اكتمل] بعد V19.51، مفيش doc واحد في النظام كله ممكن يكبر مهما طال الوقت أو زاد النشاط. كل الـoperational arrays في 3 المستندات الكبار مقسومة بالـdate. الـmaster data (customers/suppliers/workshops/employees) لسه في config لكنها بطيئة النمو + الـbyId partitioning ليها مخطّط لـV19.52." },
      { type: "improvement", text: "♻️ [splitCollections.js generic engine] ضافت helpers جديدة: syncDocSplitChanges, stripDocFieldGroups, readDocSplits, getDocSplitStats. كلها تشتغل على أي doc بـcollectionsMap + groups. الـwrappers الموجودة (config) كما هي بدون كسر — وبقى عندنا parallel wrappers لـsales (syncAllSalesSplitChanges + stripSalesSplitArrays + ...) ولـtasks (syncAllTasksSplitChanges + stripTasksSplitArrays + ...). أي doc جديد لاحقاً بـoperational arrays = يحتاج 5 أسطر بس." },
      { type: "improvement", text: "🔁 [Migration parallel — sales + tasks مستقلتين] بدل migration واحد كبير، V19.51 فيها 2 migrations مستقلتين: واحدة لـfactory/sales و واحدة لـfactory/tasks. كل وحدة تشتغل لما الـdoc بتاعها يـload + listener جاهز. مفيش flag dependency بينهم. Migration modal واضح للمستخدم: 'جاري تحديث نظام تخزين المبيعات' أو '... المهام'. backup كامل لكل doc قبل تعديله." },
      { type: "improvement", text: "📐 [Firestore Rules + 5 collections جديدة] packagesDays + custDeliverySessionsDays (sales scope)، tasksDays + stickyNotesDays (any authed user — كانت كده قبل التقسيم)، inventoryAuditsDays (sales/manager scope). صلاحيات مطابقة 100% لما كانت قبل التجزئة." },
      { type: "improvement", text: "📊 [لوحة المراقبة بقت 15 collection] في الإعدادات → '📅 مراقبة التخزين اليومي' بقت تعرض كل الـ15 المُجزّأة (3 V16.74 + 4 V19.49 + 3 V19.50 + 5 V19.51) مع badges مميّزة لكل إصدار. استدعاءات parallel للـstats (config + sales + tasks) بدون تأخير في الـrender." },
      { type: "safety", text: "🔧 [نفس آليات الأمان من V19.49/V19.50] safety guards على writes قبل ما الـlisteners يـload (refusal + toast)، selective stripping بـflags، optimistic UI مع pending writes refs، transactions atomic للـmigration، 3 retries للـsync بـbackoff، fallback writes بـawait + categorized errors. كل bug fixes V19.48 الـforensic logging شغّالة برضه على كل sync paths الجديدة." },
    ]
  },
  {
    version: "V19.50",
    date: "2026-05-04",
    types: ["architectural", "improvement", "safety"],
    title: "🏗️ تجزئة فواتير المبيعات والمشتريات وأوامر الشراء + تنظيف coa_backup",
    changes: [
      { type: "architectural", text: "🏗️ [Daily-split لـ3 arrays ضخمة] V19.49 قسّم 4 مجموعات صغيرة (مدفوعات + شيكات). V19.50 يضيف الأضخم: **salesInvoices** (فواتير المبيعات — كانت 54% من factory/config = 236 KB!) → salesInvoicesDays/{YYYY-MM-DD}، **purchaseInvoices** (فواتير المشتريات) → purchaseInvoicesDays/{YYYY-MM-DD}، **purchaseOrders** (أوامر الشراء — كانت 13%) → purchaseOrdersDays/{YYYY-MM-DD}. الفواتير كانت أسرع حقل بيكبر — بمعدل 5 فواتير/يوم كان factory/config هيوصل لحد 1MB خلال 2-3 شهور بس. بعد V19.50 = ضمان رياضي كامل عدم الوصول لـ1MB أبداً." },
      { type: "improvement", text: "🧹 [Cleanup عاجل لـcoa_backup_pre_upgrade_*] الـmigration بياخد كل الـkeys اللي اسمها يبدأ بـ`coa_backup_pre_upgrade_` من factory/config، يحفظهم كـdocs منفصلة في `backups/coa-rescued-from-config-{ts}`، ويمسحهم من factory/config. ده بيفضّي 24 KB في المثال الحالي (نسختين × 12 KB). مهمة لأن الـ`coa_backup` كانت keys بتتولّد كل ما المستخدم يعمل ترقية لشجرة الحسابات — فبتتراكم بدون فايدة وبتلوّث الـconfig." },
      { type: "improvement", text: "🔧 [إصلاح المصدر — ChartOfAccountsTab] قبل V19.50 أي ترقية لشجرة الحسابات كانت بتدمب نسخة احتياطية (~12 KB) كـkey في factory/config مباشرة. V19.50 بيعدّل المنطق: الـbackup بيتكتب في `backups/coa-pre-upgrade-{ts}` document منفصل قبل أي تعديل، ولو فشل الـbackup الـupgrade بيتلغي. ده بيمنع تكرار التلوث، وبيخلي الـbackups سهل البحث عنها (كلها مع بعض في collection واحد)." },
      { type: "safety", text: "🔒 [Selective stripping لـV19.50] stripSplitArrays اتطورت تتعامل مع 3 مجموعات flags بدل 2 (V16.74 + V19.49 + V19.50). كل مجموعة بتتحذف من config بس لما الـmigration بتاعتها تخلص (`_splitDaysV1950Done=true`). يعني rolling deploy آمن — مفيش data loss في فترة الانتقال بين الإصدارات." },
      { type: "improvement", text: "📐 [Firestore Rules توسّعت] firestore.rules ضافت 3 collections جديدة: salesInvoicesDays (sales+manager)، purchaseInvoicesDays + purchaseOrdersDays (purchase+manager). نفس صلاحيات الحقول الأصلية قبل التقسيم — مفيش tightening ولا loosening." },
      { type: "improvement", text: "📊 [لوحة المراقبة بقت 10 collections] في الإعدادات → '📅 مراقبة التخزين اليومي' بقت تعرض الـ10 collections مع badges حسب الإصدار (V16.74/V19.49/V19.50). تقدر تعرف من نظرة واحدة أكبر يوم في كل collection وتراقب لو حد بيكبر بسرعة غير عادية." },
      { type: "improvement", text: "🏷️ [APP_VERSION constant] الإصدار اتنقل لـ`constants/index.js` كـAPP_VERSION واحد. التوب بار desktop + mobile + console marker + About modal كلهم بيقروا من نفس المصدر. أي bump مستقبلي = تعديل سطر واحد." },
    ]
  },
  {
    version: "V19.49",
    date: "2026-05-04",
    types: ["architectural", "improvement", "safety"],
    title: "🏗️ تجزئة 4 مجموعات إضافية من factory/config — حماية دائمة من حد 1MB",
    changes: [
      { type: "architectural", text: "🏗️ [Daily-split for 4 more arrays] V16.74 قسّم 3 مجموعات (treasury/auditLog/hrLog) في daily collections. V19.49 بيضيف 4 مجموعات تانية كانت بتكبر يومياً في factory/config: **custPayments** (مدفوعات العملاء) → custPaymentsDays/{YYYY-MM-DD}، **supplierPayments** (مدفوعات الموردين) → supplierPaymentsDays/{YYYY-MM-DD}، **wsPayments** (مدفوعات الورش) → wsPaymentsDays/{YYYY-MM-DD}، **checks** (الشيكات) → checksDays/{YYYY-MM-DD}. كل مجموعة بتنزل في document خاص بكل يوم بحجم لا يعدي ~10KB. سنوياً = 365 ملف موزّعة بدل array واحد بيكبر. ده بيقفل الباب على وصول حجم الكونفيج لحد الـ1MB للأبد." },
      { type: "improvement", text: "🔁 [Migration تلقائي آمن] أول ما تفتح التطبيق على V19.49 لأول مرة، الـmigration بيشتغل automatic: (1) backup كامل لـconfig في collection الـbackups بـ label 'pre-migration-split-days-v1949'. (2) نقل الـ4 arrays لـday docs المناسبة. (3) حذف الحقول من factory/config وتحديد flag _splitDaysV1949Done. UI بيتقفل أثناء الـmigration بـmodal واضح بنسبة التقدم. الـmigration بيشتغل مرة واحدة فقط لكل deployment بفضل الـflag — لو فشلت لأي سبب، تقدر تعيد التشغيل وهتحاول تاني." },
      { type: "safety", text: "🔒 [Selective stripping يحمي من فقدان بيانات] stripSplitArrays بقت ذكية: بدل ما تحذف كل الحقول المُجزّأة من config دايماً، بقت تحذف بس الحقول اللي migration بتاعتها انتهت (gated بـflag). يعني لو لسه فيه users شغالين على V19.48 وتزامناً جوّه نفس database، الكتابة منهم مش هتمسح الـ4 arrays الجديدة. selective stripping بيمنع silent data loss في فترة الـrolling deploy." },
      { type: "improvement", text: "♻️ [SPLIT_FIELDS بقت source of truth] App.jsx كان فيه ~12 مكان hardcoded للـ3 arrays (`['treasury','auditLog','hrLog']`). بقت كلها loops على `SPLIT_FIELDS`. أي حقل جديد يضاف في splitCollections.js بيتدعم تلقائياً في: listeners، pendingWrites، rebuild، optimistic updates، sync logic، و stale cleanup. ضامن إن أي توسعة مستقبلية (V19.50 وما بعد) مش هتسيب bugs في الـwiring." },
      { type: "improvement", text: "📐 [Firestore Rules توسّعت] firestore.rules ضافت 4 collections جديدة بصلاحيات مطابقة للحقل الأصلي قبل التقسيم: custPaymentsDays (sales+purchase+manager)، supplierPaymentsDays + wsPaymentsDays + checksDays (purchase+manager). الـDefault deny بقي، أي collection مش مذكورة بـallow صريح بترفض القراءة والكتابة." },
    ]
  },
  {
    version: "V19.48",
    date: "2026-05-04",
    types: ["fix", "hotfix", "safety"],
    title: "🚨 Loading-Stall Recovery — مفيش حد بقى يقعد متعلق على شاشة التحميل",
    changes: [
      { type: "fix", text: "🚨 [HOTFIX حرج: التطبيق كان بيعلّق على شاشة التحميل] قبل V19.48 لو حد من listeners الـ Firestore اتأخر أو فشل بصمت (مثلاً كاش IndexedDB تالف، مشكلة شبكة عابرة، أو region mismatch)، المستخدم كان يقعد متعلق على spinner 'جاري تحميل البيانات' للأبد بدون أي escape hatch. V19.48 ضافت: (1) timeout 12 ثانية بيكتشف التعليق. (2) panel تشخيصي بيعرض حالة كل listener (config/sales/tasks/orders) — أيهم متصل وأيهم متأخر. (3) آخر error من الـ listeners لو في. (4) 4 خيارات: متابعة بالبيانات الحالية / مسح cache + reload / reload عادي / تسجيل خروج. **مفيش حد بقى يقعد متعلق على spinner.**" },
      { type: "fix", text: "📊 [Listener status tracker] كل listener دلوقتي بيـupdate state بـsetListenerStatus لما يـfire snap. الـ stall panel بيستخدم ده يقولك إيه شغال وإيه لأ. كمان أي error من listener بيتسجل في `listenerStatus.lastError` ويظهر في الـ panel — مفيش errors هتفضل مخفية في الـ console بدون ما المستخدم يشوفها." },
      { type: "improvement", text: "📋 [Smart 'Continue Anyway' button] لو الـ panel ظهر، الزر الأخضر بيظهر بس لو الـ critical listeners (config + orders) متصلين. الـ sales/tasks لو متأخرين، الزر بيـwarn 'البيانات قد تكون ناقصة' بلون أصفر. ده بيحمي المستخدم من الدخول للتطبيق ببيانات نص." },
      { type: "improvement", text: "🗑 [Clear cache button] الزر الأزرق بيـclear الـ Firestore IndexedDB cache + reload. ده بيحل أكثر من 80% من حالات الـ stall لأن أكثرها سببها الكاش المحلي تالف. الزر بيستخدم `indexedDB.databases()` API لاكتشاف databases الـ Firestore تلقائياً." },
      { type: "improvement", text: "📌 [Console version marker] عند startup الكود بيطبع `[CLARK V19.48] App module loaded — <timestamp>` في الـ console. لو حد قال 'بقول الموقع باظ'، اطلب منه screenshot للـ console — لو الـ marker مش ظاهر، يعني الـ deploy ما اشتغلش (أو الـ browser بيـserve cached bundle قديم)." },
    ]
  },
  {
    version: "V19.47",
    date: "2026-05-04",
    types: ["fix", "hotfix"],
    title: "🚨 إصلاح حرج لشاشة الإعدادات + إزالة إشعار التوب بار المربك",
    changes: [
      { type: "fix", text: "🚨 [HOTFIX حرج: شاشة الإعدادات كانت بتنهار] في V19.45 لما عرّفت `effectiveRoles` نقلتها بالغلط جوّه scope الـ PermissionsCard (مكوّن داخلي) في حين إن قوائم اختيار الأدوار للمستخدمين كانت في scope الـ SettingsPg الخارجي. النتيجة: `ReferenceError: effectiveRoles is not defined` في الـ console وشاشة الإعدادات بتقع تماماً على ErrorBoundary. الإصلاح: تعريف `effectiveRoles` في الـ scope الصحيح. ده كان bug من V19.45 موجود في V19.46 برضه — V19.47 هو الإصدار الأول اللي تقدر تفتح فيه الإعدادات بعد ضافة Custom Roles." },
      { type: "fix", text: "🔕 [إشعار التوب بار 'موديل كذا' بعد الـ login] الـ pill اللي كان بيظهر في التوب بار بعد تسجيل دخول جديد كان feature قديم بيراقب تغيرات حالة الأوردرات. المشكلة: بعد re-login الـ ref `prevStatuses` بيتفرّغ، فأول snapshot من الـ Firestore listener يبدو وكأنه 'تغيير حالة' بالنسبة للـ ref الفاضي → bullshit notification. الإصلاح: أزلنا الـ pill من التوب بار تماماً. الإشعارات بقت في الجرس فقط. الـ greeting bar في الـ Dashboard ('167 أوردر بدون موديل') مالناش دعوة بيها — لسه شغّالة." },
      { type: "fix", text: "🛒 [حذف أوامر الشراء كان 'بيرجع تاني بعد 4 ثواني'] السبب: الـ V19.45 كان عنده الـ silent-fail bug في upConfigTx fallback (نفس bug البيع السريع). لما الـ transaction كانت تفشل بعد 5 محاولات، الـ fallback `setDoc(...).catch()` كان fire-and-forget → الـ optimistic UI تظهر الحذف، الـ listener بعد ~4s بيجيب الـ data القديمة من السيرفر → الـ PO يرجع. V19.46 صلح الـ pattern ده (await + categorized errors) لكن V19.46 ما اتـdeployedش لأن V19.45 كان كاسر. V19.47 = أول deploy نظيف بكل الـ fixes متطبقة. لو حصل فشل فعلي في الكتابة، هتشوف toast واضح بالسبب (صلاحية/حجم/شبكة) بدلاً من الصمت." },
    ]
  },
  {
    version: "V19.46",
    date: "2026-05-04",
    types: ["fix", "architectural"],
    title: "🔥 إصلاح جذري لمشكلة 'تأكيد البيع مش بيحفظ' + Toast مضلل في الحركات المتكررة",
    changes: [
      { type: "fix", text: "🔥 [الـ Bug الرئيسي: البيع السريع كان مش بيحفظ بصمت] في `upSalesTx` لما الـ transaction كانت بتفشل بعد 5 محاولات، الـ fallback path كان `setDoc(...).catch(er=>console.error)` (fire-and-forget — مفيش await). يعني: الـ optimistic UI كان يعرض البيع لحظياً، بعدها الـ listener كان يجيب البيانات القديمة من السيرفر فترجع الواجهة لحالتها الأصلية، **بدون أي toast فشل**. النتيجة: المستخدم يضغط 'تأكيد البيع'، يشوف ✓ لحظياً، يرجع يلاقي كل البيانات على وضعها. الإصلاح: الـ fallback دلوقتي يعمل `await setDoc(ref, optimisticNext, {merge:false})` ولو فشل بيظهر toast واضح بسبب الفشل (permission/size/network) + نسخة forensic في الـ console مع حجم الـ document وكود الخطأ. **هذا هو السبب الرئيسي للـ bug اللي بلّغت عنه — أمان البيع السريع رجع 100%.**" },
      { type: "fix", text: "📝 [Toast مضلل في الحركات المتكررة] في `upConfigTx` لما الـ transaction كانت تستنفد المحاولات، كان يظهر toast 'فشل حفظ البيانات — جاري المحاولة بطريقة بديلة...' قبل ما الـ fallback يبدأ. الـ fallback كان عادةً ينجح لكن المستخدم بيشوف رسالة الفشل ويفتكر إنها فشلت. ده اللي خلاك تقول 'بيقولي فشل التسجيل لكن البيانات اتسجلت'. الإصلاح: مفيش toast فشل قبل الـ fallback. لو الـ fallback نجح: console.warn فقط (بدون إزعاج). لو فشل: toast واضح بالسبب. الفائدة: التجربة بقت 'بصمت لو نجح، صريح لو فشل'." },
      { type: "fix", text: "🛠 [نفس الإصلاح في upTasksTx] الـ fallback في `upTasksTx` كان عنده نفس مشكلة الـ fire-and-forget. اتصلح بنفس الـ pattern (await + categorized error)." },
      { type: "feature", text: "🔬 [أداة تشخيص جديدة في الإعدادات → الصيانة] أضفنا كارت '🔧 اختبار حفظ البيانات' بيعرض: (1) أحجام الـ documents الـ3 الرئيسية (factory/config + factory/sales + factory/tasks) مع ميتر ملوّن (آمن/تحذير >80%/خطر >100%) — Firestore حد أقصى 1 ميجا. (2) زر '▶ تشغيل اختبار الحفظ' بيعمل round-trip كتابة→قراءة→حذف على factory/_writeTest وبيقولك دقيقاً إيه السبب لو فشل (صلاحية مرفوضة / حجم زائد / شبكة / غير معروف). (3) زر '📋 نسخ تفاصيل التشخيص' لو فشل — يديك block جاهز للـ paste في chat الدعم." },
      { type: "architectural", text: "🏗 [Forensic logging في كل الـ Tx fallbacks] لما fallback يفشل دلوقتي بيتسجل في الـ console سطر forensic مفصل: التاريخ، الـ doc path، الحجم، التصنيف (ok/warn/danger)، عدد المحاولات، كود الخطأ، أول 200 حرف من الرسالة. ده في src/utils/writeDiagnostics.js كـ pure functions يقدر يستخدمها أي tool ثاني محتاج تشخيص writes." },
      { type: "architectural", text: "🔧 [salesDocRef + tasksDocRef] أضفنا useRef للـ salesDoc و tasksDoc (زي configDocRef الموجود). كان لازم عشان الـ Tx fallback يقرا أحدث optimistic state بدون ما يـcapture stale closure. مش تغيير سلوك، بس infrastructure للحلول الجديدة." },
    ]
  },
  {
    version: "V19.45",
    date: "2026-05-04",
    types: ["feature", "architectural"],
    title: "🎨 إنشاء أدوار (Roles) مخصصة من الـ UI",
    changes: [
      { type: "feature", text: "🎨 [Custom Roles من الواجهة] دلوقتي تقدر تنشئ أدوار جديدة (غير المدمجة) من الإعدادات → المستخدمين → كارت 'الأدوار المخصصة'. كل دور بياخد: اسم، أيقونة (emoji)، لون، وصف، وقالب أساسي (basedOn). الصلاحيات الافتراضية بتتنسخ من القالب لحظة الإنشاء (snapshot)، وبعدين تخصص أي خانة من جدول الصلاحيات." },
      { type: "feature", text: "📋 [Templates] لما تنشئ دور جديد، تختار قالب من الأدوار المدمجة (مدير، أمين مخزن، محاسب مبيعات، إلخ). الـ template بيـsnapshot في `defaults` الخاصة بالدور — يعني أي تغيير مستقبلي في الـ template مش هيأثر على الأدوار اللي اتنسخت منه. كل دور independent." },
      { type: "feature", text: "🎨 [Color + Icon picker] في الـ editor modal: 16 لون preset في palette + خانة لكتابة لون مخصص، و32 emoji مقترحة + خانة لأي emoji تكتبه. preview live بيظهر شكل الكارت قبل الحفظ." },
      { type: "feature", text: "🛡 [حماية ضد الـ collisions] لو حاولت تنشئ دور بـ key متعارض مع دور مدمج (admin مثلاً) أو دور موجود، النظام بيرفض. كمان إن الـ keys بتتولّد تلقائي من الـ label وبتبقى immutable (الـ label قابل للتعديل، الـ key لأ — عشان البيانات اللي اترتبطت بالدور تفضل سليمة)." },
      { type: "feature", text: "🔒 [حماية ضد الحذف] مش هتقدر تحذف دور لو في users مسنده ليهم. لازم تغيّر دورهم لدور تاني الأول. ولو حذفت دور بعد كده، كل التخصيصات اللي في `permissions[roleKey]` بتتمسح كمان عشان البيانات النضيفة." },
      { type: "architectural", text: "🏗 [Backward compat كامل] الأدوار المدمجة شغّالة بالظبط زي ما كانت. كل اللي اتعمل: الـ helpers في `permissions.js` ضافت 5 functions جداد (`getEffectiveRoles`, `getEffectiveRoleMeta`, `getEffectiveDefaultPerms`, `effectivePermWithCustoms`, `canEditPermWithCustoms`, `canViewPermWithCustoms`, `getHrSubPermWithCustoms`) بتـmerge القوائم. الـ App.jsx اتحوّل يستخدم الـ WithCustoms variants. الـ admin role بيفضل hardcoded في كل الحالات — مفيش طريقة (UI أو storage tampering) تقدر تخفّض صلاحياته." },
      { type: "improvement", text: "📊 [جدول الصلاحيات شامل] أي دور مخصص بينضاف يظهر تلقائي كـ column جديد في جدول الصلاحيات تحت. كده تقدر تخصّص أي خانة (edit/view/hide) لكل tab بنفس الأسلوب اللي بتعدل بيه الأدوار المدمجة." },
      { type: "improvement", text: "🔍 [Inspector محدّث] modal الفحص دلوقتي بياخد الـ config كامل (مش بس permissions) عشان يقدر يعرض الأدوار المخصصة بالـ icon والـ color الصح. لما تضغط '🔍 فحص' على user مسند له دور مخصص، الـ modal بيظهره بصورة كاملة." },
      { type: "improvement", text: "🏷 [Dropdowns تحدّث تلقائي] قائمة الأدوار في إنشاء user جديد + قائمة تغيير دور user موجود + الـ topbar/menu role label — كلهم بيستخدموا `getEffectiveRoleMeta(config)` فبيظهروا الأدوار المخصصة فوراً بعد إنشائها." },
    ]
  },
  {
    version: "V19.44",
    date: "2026-05-04",
    types: ["feature", "fix", "architectural"],
    title: "🔐 إعادة هيكلة الصلاحيات + Role جديد 'أمين مخزن' + إصلاح Silent Fails",
    changes: [
      { type: "fix", text: "🐛 [الـ bug اللي بلّغت عنه] أمين المخزن كان بيعمل scan للاستلام ويضغط حفظ بدون أي رد فعل من النظام — لأن `if(!canEdit)return;` كان بيرجع بصمت بدون أي رسالة. دلوقتي لما تضغط زر بدون صلاحية، بيظهر modal واضح: 'صلاحية مرفوضة — مالكش صلاحية لـ\"حفظ إذن الاستلام\"'. اتصلح في 15 مكان عبر PurchasePg + WarehousePg + SettingsPg." },
      { type: "fix", text: "🔴 [حرج: 6 تبويبات بدون حماية] كانت 6 تبويبات (فواتير المبيعات، إشعارات دائنة، فواتير المشتريات، إشعارات مدينة، محاسبة، أصول ثابتة) متفتحة لأي مستخدم بأي role — حتى الـ viewer كان يقدر يدخل يعدل فيها. ده كان bug من V18 لما ضفنا الفواتير لكن نسينا نضيفهم في صفحة الصلاحيات. دلوقتي الـ 6 محميين بـ canViewTab + canEditTab زي باقي التبويبات." },
      { type: "feature", text: "📦 [Role جديد: أمين مخزن] صلاحياته: ✏️ المخازن + المشتريات (الاستلامات فقط) + المهام · 👁 لوحة التحكم + التقارير + قاعدة البيانات + أوامر القص · ✕ كل الجوانب المالية (الفواتير، الخزنة، المحاسبة، المرتبات). ده الـ role المناسب لأمين مخزن بيستلم بضاعة ويعمل جرد بدون ما يشوف الأسعار." },
      { type: "architectural", text: "🏗 [Single Source of Truth] أنشأنا `src/utils/permissions.js` كمصدر واحد للـ roles، الـ tab catalog، والـ default perms. كان مكرر بين App.jsx و SettingsPg.jsx ومتفرّق في 4 أماكن. دلوقتي إضافة tab جديد أو role جديد = تعديل مكان واحد بس. كمان أضفنا runtime linter بيـwarn في الـ console لو نسينا نضيف tab جديد للصلاحيات." },
      { type: "feature", text: "🔍 [Permissions Inspector] في الإعدادات → المستخدمين، جنب كل user دلوقتي زر '🔍 فحص'. اضغطه يفتح modal بيعرض: الـ role + إحصائيات (X تعديل · Y عرض · Z مخفي) + كل تبويب وحالته (✏️/👁/✕) مجمّعة على الأقسام (مبيعات، مشتريات، إلخ). أداة عظيمة لتشخيص bugs الصلاحيات." },
      { type: "improvement", text: "🧹 [تنظيف keys زائدة] شيلنا `calc` و `stock` من DEFAULT_PERMS لأنهم مش tabs موجودة في الـ navigation. كانوا dead entries من إصدارات قديمة." },
      { type: "improvement", text: "📊 [تغطية كاملة] جدول الصلاحيات في الإعدادات بقى يعرض كل الـ 20 تبويب (كان بيعرض 14 بس). كل role له default واضح لكل tab. الكروت السفلية اللي بتعرض الأدوار بقت تعرض كل الـ 8 roles (كانت 5 بس) مع الأيقونات والأوصاف من الـ registry." },
      { type: "fix", text: "🏷 [اسم الـ role في الـ topbar] قبل كده كان يعرض 'مشاهد' لأي role غير معروف (admin/manager/sales/purchase). دلوقتي بياخد الـ label من الـ registry فبيعرض اسم أي role صح حتى الجداد (warehouse_keeper بيعرض '📦 أمين مخزن')." },
    ]
  },
  {
    version: "V19.43",
    date: "2026-05-03",
    types: ["fix"],
    title: "📅 أسماء الشهور كاملة في بورتال العميل (مايو بدل ماي)",
    changes: [
      { type: "fix", text: "📅 [بورتال العميل] جدول 'سجل الحركات' (مبيعات + مرتجعات) كان بيختصر اسم الشهر لـ3 حروف فقط — مايو→ماي، أبريل→أبر، أغسطس→أغس... بقت الأسماء كاملة دلوقتي. كانت المشكلة في `AR_MONTHS_SHORT` array اللي اتعمل في V18.28 لتوفير مساحة، بس الاختصارات طلعت مبهمة." },
      { type: "improvement", text: "💡 [مفيش تأثير على الـ layout] رغم إن الأسماء بقت أطول، الجدول لسه واسع كفاية لأن السنة مش بتظهر في الـ compact format. مثلاً '3 مايو' = 6 حروف، أقل من تاريخ كامل بسنة." },
    ]
  },
  {
    version: "V19.42",
    date: "2026-05-03",
    types: ["fix"],
    title: "🔗 شيلنا الكلام الإنجليزي تحت لينك CLARK في رسائل واتساب",
    changes: [
      { type: "fix", text: "🔗 [link preview أنظف] لما تبعت لينك بورتال العميل (clark-factory.vercel.app/?p=c&i=...) في واتساب، كان بيظهر تحت كلمة CLARK فقرة طويلة بالإنجليزي 'Welcome to the world of CLARK, where high quality meets contemporary elegance in children's clothing designs...' — كان مزعج لأن اللينك ده وظيفي مش ترويجي." },
      { type: "fix", text: "🛠 [الإصلاح] شيلنا meta tags `description` و `og:description` و `twitter:description` من `index.html`. النتيجة: الـ preview بيظهر بس بـ logo CLARK وكلمة CLARK، بدون أي فقرة." },
      { type: "improvement", text: "💡 [ملاحظة كاش] واتساب بيـcache الـ link previews لمدة. ممكن تاخد ساعات قبل ما الـ preview الجديد يظهر. لو لقيت الكلام لسه ظاهر بعد الـ deploy، اطلب من العميل يـclear chat cache، أو ابعت اللينك من رقم تاني عشان تختبر." },
    ]
  },
  {
    version: "V19.41",
    date: "2026-05-03",
    types: ["feature"],
    title: "↪️ صفحة مرتجع المشتريات + زر ارتجاع للمورد من فاتورة الشراء",
    changes: [
      { type: "feature", text: "📑 [صفحة جديدة 'إشعارات مدينة'] tab جديد في الـ sidebar تحت 'فواتير المشتريات' — مرآة كاملة لصفحة 'إشعارات دائنة' بس على جهة الموردين. فلترة بالتاريخ والحالة والمورد، إحصائيات (مسودة/مرحّل/ملغي)، عرض البنود، ترحيل، إلغاء، حذف، طباعة." },
      { type: "feature", text: "↪️ [زر 'ارتجاع للمورد'] على أي فاتورة شراء **مرحّلة** (مش خدمات)، زر أزرق بيظهر في الـ detail modal. اضغط → modal بيعرض الأصناف بـ checkbox + إدخال للكمية لكل بند. الحد الأقصى للكمية المرتجعة هو الكمية الأصلية في الفاتورة (مفيش ارتجاع زيادة)." },
      { type: "feature", text: "🔗 [linked invoice] الإشعار المدين بيتولّد من الفاتورة الأصلية مع الحفاظ على رابط `linkedInvoiceId` و `linkedInvoiceNo` — كده تشوف في الإشعار 'للفاتورة: PINV-2026-XXXX' وفي طباعة الإشعار." },
      { type: "feature", text: "🔄 [التجميع التلقائي شغال هنا كمان] لو عملت ارتجاع لنفس المورد مرتين في نفس اليوم وقبل ما ترحّل، الـ items بتتدمج في نفس الإشعار المسودة (بدل ما تطلع إشعارين). نفس الـ pattern من V18.65 و V19.39 و V19.40." },
      { type: "feature", text: "✅ [Bulk post شغال] الترحيل الجماعي اللي في V19.39 شغل في صفحة الإشعارات المدينة بنفس الطريقة — checkbox لكل draft، شريط floating لما تختار، زر 'ترحيل المحدد' بيرحّل sequential مع toast واحد للنتيجة." },
      { type: "feature", text: "🖨 [طباعة كاملة] `printDebitNote` بـ template أزرق (مميّز عن إشعار دائن الأحمر وعن فاتورة الشراء البرتقالي)، فيه الـ letterhead والـ totals والـ signatures. الطباعة شغّالة في كل الحالات (draft/posted/void) مع badge للحالة." },
      { type: "feature", text: "📊 [Auto-resolve للسعر] لو دخلت بند مرتجع بدون سعر، النظام بيرجع لآخر فاتورة شراء non-void لنفس المورد ولنفس البند ويستخدم السعر اللي اشتريناه بيه فعلاً (`resolvePurchaseReturnUnitPrice` من V19.40). كده الإشعار بيخصم من المورد بنفس قيمة البند الأصلية." },
      { type: "improvement", text: "🚫 [مفيش لخدمات] زر الارتجاع مش بيظهر على فواتير الخدمات (`subtype === 'service'`) — الخدمات مش حاجة بترجع، لو في خطأ في فاتورة خدمات بيتعمل void بدل ارتجاع." },
    ]
  },
  {
    version: "V19.40",
    date: "2026-05-03",
    types: ["feature", "architectural"],
    title: "↪️ مرتجع المشتريات (Debit Notes) — البنية المحاسبية الكاملة",
    changes: [
      { type: "architectural", text: "↪️ [Entity جديدة data.purchaseDebitNotes] رقمها DN-YYYY-NNNN، نفس بنية credit notes الموجودة من V18.51 بس على الجهة العكسية. كل debit note بيمر بالحالات draft → posted → void زي باقي الـ entities." },
      { type: "architectural", text: "📚 [حساب جديد في CoA] '5140 مرتجع المشتريات' contra-expense تحت 'تكلفة البضاعة المباعة'. لو شجرة حساباتك موجودة بالفعل، روح الإعدادات → شجرة الحسابات وهتلاقي زر '+ إضافة 1 حساب جديد' عشان تضيف الجديد بدون ما يأثر على القديم." },
      { type: "architectural", text: "📐 [Posting rule جديد purchaseReturn] القيد المحاسبي: Dr موردون خامات (2110) / Cr مرتجع المشتريات (5140). يعني الـ debit note بيقلل اللي إحنا مدينين بيه للمورد ويسجل المرتجع كـ contra-expense (بيقلل تكلفة البضاعة في قائمة الدخل). يقدر المستخدم يغير الحسابات من الإعدادات." },
      { type: "architectural", text: "🛠 [Builder + upserter] `buildDebitNoteFromReturn` + `upsertDebitNoteFromReturn` في invoices.js — `upsert` بيدمج تلقائياً مرتجعات نفس المورد لنفس اليوم في debit note واحد (نفس باترن V18.65 و V19.39). البنود بنفس الـ itemType+itemId+سعر بتتدمج، البنود بأسعار مختلفة بتفضل سطور منفصلة (price history مهم محاسبيًا)." },
      { type: "architectural", text: "💰 [resolvePurchaseReturnUnitPrice] لو ما حددتش سعر للبند المرتجع، النظام بيرجع لآخر فاتورة شراء غير ملغية لنفس المورد ونفس البند ويستخدم السعر اللي اشتريناه بيه فعلاً. كده الـ debit note بيخصم من المورد بنفس المبلغ بالظبط." },
      { type: "architectural", text: "🔄 [autoPost methods جديدة] `autoPost.debitNotePosted()` و `autoPost.debitNoteVoided()` — نفس باترن creditNote: ترحيل بيعمل قيد، إلغاء بيعمل قيد عكسي، الفشل بيتسجل في accountingPostFailures مع نفس الـ retry logic." },
      { type: "architectural", text: "📊 [Stats helper] `getDebitNoteStats(data, filter)` بيرجع إحصائيات مفلترة (count + amount حسب الحالة) — جاهز للـ UI اللي جاي في V19.41." },
      { type: "architectural", text: "🚧 [بدون UI لسه] V19.40 ده مرحلة محاسبية بحتة. الصفحة الجديدة DebitNotesPg + زر 'ارتجاع' في فاتورة المشتريات هييجوا في V19.41. الـ entity موجود ومحاسبيًا صح، بس متاح بس برمجيًا حاليًا — لو حد بيختبر الـ utils مباشرة من الـ console هيشتغلوا." },
    ]
  },
  {
    version: "V19.39",
    date: "2026-05-03",
    types: ["feature", "improvement"],
    title: "✓ ترحيل جماعي للفواتير + تجميع فواتير المشتريات لنفس المورد/اليوم",
    changes: [
      { type: "feature", text: "✅ [ترحيل جماعي] فواتير المبيعات + إشعارات دائنة + فواتير المشتريات: ضفنا checkbox جنب كل مسودة + checkbox 'تحديد الكل' في الـ header. لما تختار حاجات، شريط أزرق بيظهر تحت بيقولك العدد + الإجمالي + زر 'ترحيل المحدد'. كل فاتورة بترحل بقيد محاسبي مستقل (sequential مش parallel) عشان مفيش race في الـ journal counter." },
      { type: "feature", text: "🔄 [تجميع فواتير المشتريات] اضافة `upsertPurchaseInvoiceFromReceipt` — لما تحوّل إذن استلام لفاتورة، لو في فاتورة مسودة موجودة لنفس المورد ونفس التاريخ، البنود بتتدمج فيها (نفس الـ pattern بتاع فواتير المبيعات من V18.65). البنود اللي ليها نفس الـ itemType+itemId+سعر بتتدمج في سطر واحد بـ qty أكبر، اللي مختلفة بتتضاف كسطر جديد." },
      { type: "improvement", text: "📑 [إنشاء فواتير جماعي ذكي] في صفحة فواتير المشتريات، زر 'إنشاء فواتير من N استلام' دلوقتي بيستخدم الـ upsert. لو عندك 5 إذونات لنفس المورد في نفس اليوم، هتطلع فاتورة واحدة بدل 5. الرسالة بقت تقول: 'تم إنشاء X فاتورة + دمج Y في فواتير قائمة'." },
      { type: "improvement", text: "🔍 [findInvoiceByReceipt محدّث] الـ lookup بقى يدور في `receiptRefs[]` (الفواتير المدمجة) قبل ما يدور في الـ singular `receiptRef` (legacy). كده الإذونات اللي اندمجت في فاتورة مع غيرها هتظهر صح كـ 'مرتبطة بفاتورة' ومش هتظهر كـ uninvoiced." },
      { type: "improvement", text: "📦 [مكوّن جديد BulkPostBar] component مشترك بين الـ 3 صفحات (مبيعات/مشتريات/مرتجعات) — `BulkPostHeader` + `RowCheckbox` + `BulkPostBar` (شريط floating بيظهر لما حاجة محددة). الـ DRY ده بيخلي الـ behavior متطابق ولو في bug في مكان، الإصلاح بيتطبق في كل الصفحات في نفس الوقت." },
      { type: "improvement", text: "💡 [silent mode] الـ handlePost في الـ 3 صفحات ياخد `opts.silent` — لو true بيتخطى الـ confirmation dialog والـ toast الفردي. الـ bulk bar بيستخدم ده عشان يعمل confirm واحد + toast واحد للعملية كلها بدل ما المستخدم يضطر يضغط Yes 50 مرة." },
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
