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
  {
    version: "V19.38",
    date: "2026-05-03",
    types: ["feature"],
    title: "📎 إرفاق ملفات في الحملات (PDFs, مستندات, فيديو, صوت)",
    changes: [
      { type: "feature", text: "📎 [قسم جديد في الـ Template Editor] تحت قسم الصور، قسم 'ملفات مرفقة (Bridge mode فقط)' بيقبل أي نوع ملف غير الصور: PDFs, Word/Excel, فيديو, صوت, ZIP. الملفات بترفع لـ Firebase Storage مع شريط تقدم (لأن ملف 50MB ممكن ياخد وقت)." },
      { type: "feature", text: "🌉 [Bridge: sendMediaAsDocument] السيرفر اتعدّل: لو الـ mime type مش صورة (image/*)، الـ flag `sendMediaAsDocument: true` بيتبعت لـ whatsapp-web.js. النتيجة: PDFs و docs بيظهروا للعميل كـ document bubbles مع اسم الملف وحجمه وزر تحميل واضح، بدل thumbnail متقطع." },
      { type: "improvement", text: "📊 [حدود WhatsApp مفعّلة client-side] الحدود اللي WhatsApp بيفرضها (16MB صور/فيديو/صوت، 100MB مستندات) بتتحقق قبل الرفع — رسالة خطأ واضحة بدل ما الإرسال يفشل عند العميل. الحد الأقصى 3 ملفات لكل قالب لمنع spam." },
      { type: "improvement", text: "🎨 [Icons حسب نوع الملف] في الـ editor والـ send screen: 📄 PDF, 📊 Excel/CSV, 📝 Word, 📑 PowerPoint, 🗜 ZIP, 🎬 فيديو, 🎵 صوت, 📎 غير ذلك. الـ filename + الحجم بيتعرضوا جنب الـ icon." },
      { type: "improvement", text: "🧹 [Storage cleanup شامل] لما بتمسح قالب أو بتشيل ملف من قالب، الـ Storage object بيتمسح تلقائياً. زي اللي بنعمله للصور من V19.35 — مفيش orphans في Storage." },
      { type: "improvement", text: "🏷 [Badge في قائمة القوالب] القالب اللي فيه ملفات بيظهر badge جنب الـ '📷 N صورة' بيقول '📎 N ملف مرفق'. عشان تعرف بسرعة محتوى كل قالب." },
      { type: "fix", text: "📐 [storage.rules: 25MB → 100MB] الـ rules اتحدّثت عشان تسمح برفع مستندات حتى 100MB (حد WhatsApp للـ documents). الصور لسه ~250KB بعد الضغط فمفيش تأثير عليها." },
    ]
  },
  {
    version: "V19.37",
    date: "2026-05-03",
    types: ["feature", "fix"],
    title: "🔧 زر إصلاح تلقائي للبريدج + تنظيف ذاتي عند البدء",
    changes: [
      { type: "feature", text: "🔧 [زر إصلاح تلقائي] في تاب الـ Bridge Dashboard، زر '🔧 إصلاح تلقائي' بيظهر تلقائياً لو حالة البريدج غير متصل أو INIT/DISCONNECTED. الزر بيـreset الـ WhatsApp client من غير ما تحتاج SSH ولا تفتح PowerShell. الـ session بتفضل سليمة (مفيش re-scan QR). العملية بتاخد ~30 ثانية والـ UI بيتحدّث تلقائياً." },
      { type: "fix", text: "🛡️ [auto-cleanup عند البدء] الـ bridge دلوقتي بيمسح Singleton lock files تلقائياً قبل ما Chromium يقوم. ده بيمنع الحالة اللي حصلت قبل كده (الـ bridge عالق في INIT بسبب lock files قديمة من container سابق اتقفل بالقوة). بقت self-heal — لو حصل forced shutdown، الـ container هيقوم تاني عادي." },
      { type: "feature", text: "🌉 [Bridge endpoint جديد POST /repair] السيرفر بياخد request ويعمل: destroy للـ WA client (مع timeout 5 ث) → sweep للـ Singleton lock files → re-init. بيرجع للـ client immediately ويكمّل re-init في الخلفية. CLARK بيـpoll /status كل 2.5 ث فبيشوف READY بعد ~30 ث." },
      { type: "improvement", text: "🗑️ [حذف بند ملفات مرفقة من الفورم] قسم 'ملفات مرفقة (حد أقصى 500KB/ملف)' في فورم الأوردر اتشال — الـ V15.90 attachments system في تفاصيل الأوردر هو الموثوق (Storage-based)، ومش محتاجين الـ inline base64 system القديم تاني." },
      { type: "improvement", text: "🎨 [حالة REPAIRING في الـ UI] لما يكون الإصلاح شغال، الـ Dashboard بيعرض indicator: 'جاري الإصلاح...' مع شرح إن العملية بتاخد ~30 ث والصفحة هتتحدث تلقائياً." },
    ]
  },
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
