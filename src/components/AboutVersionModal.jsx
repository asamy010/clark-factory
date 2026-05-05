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
