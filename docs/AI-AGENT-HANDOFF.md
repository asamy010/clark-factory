# 🤖 CLARK AI Agent — Build Handoff (افتح بيه شات جديد)

> **اقرأ الملف ده بالكامل + `CLAUDE.md` (root) قبل ما تكمّل.**
> الهدف من الـ session الجاية: **تكملة الأيجنت بالكامل — خصوصاً الـ UI** (المحادثات الحيّة، التدخل اليدوي، التحليلات) + باقي الأدوات والحوكمة.

**آخر تحديث:** 2026-06-03 · **آخر متدفوع:** V21.9.234 · **متعمل محلياً (لسه محتاج push):** V21.9.235→241.
**اللي اتعمل:** UI تدخّل يدوي (235) + تحليلات حقيقية + تصحيح التكلفة (236) + تصعيدات (237) · Backend governance: تطبيق الجدول (238) + سقف التكلفة (239) + أداة search_products (240) + تحكّم المحرّك من الـ UI (241).
**⚠️ بعد الـ push:** deploy `firestore.rules` (قاعدة `aiAgentTakeovers` الجديدة من V235) عشان شارات التدخّل تظهر لحظياً — الأزرار شغّالة من غيره.
**Build:** مفيش build/test env محلي — **Vercel هو الـ verifier**. راجع الأقواس يدوياً (python: قارن عدد `{}()[]` مع `git show HEAD:<file>`).
**Push:** Claude بيعمل commit + zip؛ **أحمد بيعمل `git push`** (الـ shell بتاع Claude مش بيقدر).

---

## ١) أين وصلنا — الأيجنت الحالي (٨ خطوات + ٣ إصلاحات، V225→V234)

الأيجنت **اتبنى من الصفر** (الملف القديم `Prompts/مشكلة-AI-Agent-حقيقي.md` كان بيقول الباك-إند مش موجود — وكان صح). دلوقتي الـ **backend شغّال على Vercel** (مجلد `api/ai-agent/`) والجسر بقى يوجّه الوارد.

| النسخة | الخطوة | القدرة |
|---|---|---|
| V21.9.225 | ١ | استقبال رسائل العملاء (الجسر → webhook موقّع → Vercel → تسجيل) |
| V21.9.226 | ٢-٣ | التعرّف على العميل من رقمه (اسم/نوع) |
| V21.9.227 | ٤ | أول رد بـ Claude (Sonnet) — محمي بـ testMode |
| V21.9.228 | ٥ | إثراء المعرفة (FAQs + كتالوج + أسلوب) في سياق مخزّن (prompt caching) |
| V21.9.229 | ٦ | محرّك أدوات (tool-use loop) + ذاكرة المحادثة + أداة التصعيد |
| V21.9.230 | ٧ | أداة `generate_portal_link` (كشف/رصيد آمن عبر رابط البوابة) |
| V21.9.231 | ٨ | رد آلي للي بره قائمة التجربة (canned، soft launch) |
| V21.9.232 | fix | تثبيت اللهجة المصرية (مش خليجي/فصحى) |
| V21.9.233 | fix | إصلاح الإجابة من الـ FAQs (حقن الـ phrasings + تعليمة أقوى) |
| V21.9.234 | fix | إصلاح استيراد الكتالوج: ألوان (c.color مش c.name، A→H) + سعر البيع + صورة |
| V21.9.235 | UI A1 | **التدخّل اليدوي** — تدخّل/استئناف + رد يدوي للعميل (aiAgentTakeovers + endpoints + gate) |
| V21.9.236 | UI A3 | **لوحة تحليلات حقيقية** — تُحسب من aiAgentConversations + إصلاح حساب التكلفة (سعر Sonnet الصح) |
| V21.9.237 | UI A2 | **إظهار التصعيدات** — فلتر/شارة/تفاصيل + resolve (aiAgentEscalations) + إصلاح id في useAgentCollection |
| V21.9.238 | B6 | **تطبيق الجدول** — `_schedule.js` isWithinSchedule (Cairo + overnight + holidays) + offHoursBehavior في الـ gate |
| V21.9.239 | B5 | **سقف التكلفة اليومي** — `_budget.js` (aiAgentBudget/{اليوم}، admin SDK) + فحص في الـ gate + كارت في DashboardTab |
| V21.9.240 | B7 | **search_products** — بحث في الكتالوج (آمن، config.catalog). بيانات العميل عبر generate_portal_link |
| V21.9.241 | — | **تحكّم المحرّك من الـ UI** — agent.runtime (model/temp/maxTokens/iters/history) بـ clamping في _processTurn + كارت في ToolsTab |

**يعني الأيجنت دلوقتي (للأرقام في testMode):** بيستقبل، يعرف العميل، يرد عامية مصرية حسب الشخصية، يعرف الـ FAQs + الكتالوج + الأسعار، يفتكر المحادثة، يستخدم أدوات، يحوّل لموظف بشري، يبعت رابط كشف الحساب، ويرد رد آلي للي بره القائمة.

---

## ٢) المعمارية + الملفات

```
العميل ──رسالة──▶ جسر الواتساب (Contabo, clark-wa-bridge v1.2.0)
                    │  waClient.on("message") → forwardIncomingToWebhook()  (HMAC موقّع، أفراد فقط)
                    ▼  POST {wid, from, body, ts}  +  header x-clark-sig
              Vercel: api/ai-agent/incoming.js   (المُستقبِل + المنسّق)
                    │  HMAC verify + replay 5min + تطبيع الرقم
                    │  recognize customer (_customerLookup.js، كاش 5 دقايق)
                    │  read config.aiAgent + campaignBridge + catalog
                    │  GATE: enabled && schedule≠off && (testMode? whitelist) && phone
                    │     └─ بره القائمة → رد canned (outsideMessage) أو سكوت
                    ▼  eligible:
              _processTurn.js  (العقل)
                    │  system = [knowledge(cached: persona+dialect+FAQs+catalog+style), customer-ctx]
                    │  messages = history(آخر 6 turns) + user
                    │  tool-use loop (≤5 iters): Claude → tool_use → executeTool → tool_result → repeat
                    ▼
              Anthropic Messages API (claude-sonnet-4-20250514، ANTHROPIC_API_KEY)
                    │  reply
                    ▼  sendViaBridge() → الجسر /send → العميل
              + log turn في aiAgentConversations (admin SDK)
                    ▼
              لوحة التحكم (src/pages/AIAgentPg.jsx) → تبويب «سجلات» (LogsTab) بيعرضها حيّة
```

### ملفات الباك-إند (`api/ai-agent/`)
- **`incoming.js`** — المُستقبِل + المنسّق (gate → reply → send → log). نقطة الدخول الوحيدة.
- **`_processTurn.js`** — العقل: `processTurn({agent,catalog,factoryName,customer,userMessage,history,toolCtx})` → `{reply,usage,model,toolsUsed,iterations}`. فيه `buildKnowledge()` (البلوك المخزّن) + tool-use loop.
- **`_tools.js`** — `REGISTRY` (name→{schema,run}) + `getToolSchemas(agent)` + `executeTool(name,input,ctx)`. أدوات مُنفَّذة: `escalate_to_human`, `generate_portal_link`. (الباقي مُعرَّف في config.aiAgent.tools لكن لسه مش مُنفَّذ.)
- **`_customerLookup.js`** — `findCustomerByPhone(phone)` (يقرا customersDocs مرة كل 5 دقايق بكاش module-scope).
- **`_bridge.js`** — `sendViaBridge(url,token,phone,message,customerName)` (مفصول عن نظام الحملات).

### الجسر (`clark-wa-bridge/server.js` v1.2.0 — أحمد ينشره على VPS)
- `forwardIncomingToWebhook(msg)` + موصول في `waClient.on("message")` قبل بوابة opt-out. no-op لو WEBHOOK_URL/SECRET مش متظبطين.

### الفرونت (`src/pages/AIAgentPg.jsx` ~4000 سطر، ١١ تبويب)
- **configuration surface** + listeners حيّة (read-only). التبويبات: dashboard / personality / catalog / faqs / tools / schedule / logs / suggestions / sandbox / funnel / profiles.
- **LogsTab** (~سطر 1648): listener حي على `aiAgentConversations` (orderBy `at` desc). بيعرض كل doc = turn، ويجمّعهم بالـ `wid` كـ threads.
- **CatalogImportModal** (~سطر 3826): استيراد موديلات من الأوردرات (اتصلح في V234).

---

## ٣) أشكال البيانات (Firestore)

**`aiAgentConversations/{auto}`** — doc لكل **turn** (مش thread). ده الشكل اللي LogsTab بيقراه:
```js
{ wid, phone, isLid, at:ISO, userMessage, assistantReply, customerName, customerId,
  customerType, skipped:bool, skippedReason, canned:bool, sent:bool, ingestOnly:bool,
  model, usage:{input_tokens,output_tokens,cache_creation_input_tokens,cache_read_input_tokens},
  toolsUsed:[], durationMs, iterations, error, msgType, source:"whatsapp-bridge", createdAt }
```
**`aiAgentEscalations/{auto}`**: `{ id, wid, phone, customerName, customerId, reason, urgency, status:"open", at, createdAt }`

**`config.aiAgent`** (المصدر — الأيجنت بيقراه): `{ enabled:bool, schedule:{mode:"specific|24x7|off", timezone}, personality:{systemPrompt, answerLength, emojiUse, forbidden[], greetings[], closings[]}, faqs:[{id,title,answer,phrasings[],category}], tools:{<name>:{enabled}}, testMode:{enabled, whitelist:[{id,wid,label}], outsideBehavior:"canned|silent", outsideMessage}, escalation:{supportPhone, salesTeamPhone, template}, tierDiscounts }`
**`config.catalog`**: `[{id,code,name,nameEn,category,season,sizes[],colors[],fabrics[],priceWholesale,minOrderQty,inStock,image,...}]`
**`config.campaignBridge`**: `{url, token}` (الجسر — يُستخدم للإرسال).

---

## ٤) التشغيل والاختبار (الـ soft launch)

> الأمان: **enabled=false افتراضياً + testMode whitelist** → مفيش رد لأي حد غير الأرقام التجريبية. غير المؤهّل = $0 (مفيش نداء Claude).

1. **Vercel env:** `ANTHROPIC_API_KEY` (موجود من api/ai.js) + `WEBHOOK_SECRET` (مفتاح عشوائي طويل) + (اختياري `WHATSAPP_BRIDGE_URL`/`WHATSAPP_BRIDGE_TOKEN` لو مش في config، و`PUBLIC_BASE_URL`، و`AI_AGENT_MODEL`).
2. **الجسر (VPS):** انشر v1.2.0 + في `.env`: `WEBHOOK_URL=https://clark-factory.vercel.app/api/ai-agent/incoming` + `WEBHOOK_SECRET=` (نفس قيمة Vercel) + restart.
3. **`git push`** (Vercel ينشر الباك-إند).
4. **في صفحة الأيجنت:** فعّل (enabled) + في testMode ضيف الأرقام التجريبية في الـ whitelist (صيغة `201XXX@c.us`).
5. **جرّب:** ابعت من رقم تجريبي → رد ذكي + يظهر في «سجلات».

---

## ٥) الباقي — الـ Roadmap (للتكملة، خصوصاً الـ UI)

> رتّبتهم بالأولوية + التعقيد. اللي عليه ⭐ هو اللي أحمد عايزه: **UI الأيجنت كامل.**

### 🖥️ A — الـ UI (أولوية أحمد) ⭐

> **✅ حالة (V21.9.235→241):** A1 تدخّل يدوي · A2 تصعيدات/فلاتر · A3 تحليلات حقيقية · B5 سقف التكلفة · B6 تطبيق الجدول · B7 search_products · تحكّم المحرّك من الـ UI — **كلها اتعملت**. التحكّم الكامل من الـ UI بقى متاح: تشغيل/إيقاف، مواعيد (مُطبَّقة)، whitelist، سقف تكلفة، أدوات، شخصية/FAQs، إعدادات المحرّك، تدخّل يدوي حيّ.
>
> **الباقي (اختياري/متقدّم):**
> - **A4** اقتراحات FAQ (👍/👎) — مؤجّل: الباك-إند لسه مابيـ emit نوع `faq_suggestion` (الـ SuggestionsTab بيتعامل تمام مع `lid_phone_mapping`).
> - **B7+** أدوات بيانات العميل/الطلبات — **بقصد** بتتقدّم عبر `generate_portal_link` (أأمن من قراءة seasons/orders بدون بيئة اختبار).
> - **B8** ربط LID بالرقم (notify_admin_phone_request tool) · **B9** صوت/صور · **B10** memory index.
> - **🐞 دقّة:** ToolsTab بيـ mark كذا أداة `deployed:true` مع إنها مش مُنفَّذة فعلاً في `_tools.js` (المُنفَّذ بس: escalate_to_human · generate_portal_link · search_products). محتاج تصحيح الـ flags لـ «قريباً» عشان الـ UI يبقى صادق.

1. **التدخل اليدوي (Manual Takeover)** — ✅ اتعمل في V21.9.235:
   - في LogsTab/المحادثة: زر «🎮 تدخّل» يوقف الأيجنت لـ wid معيّن + زر «استئناف».
   - آلية الإيقاف: doc/flag (مثلاً `aiAgentPaused/{wid}` أو حقل في conversation) — `incoming.js` يفحصه في الـ GATE ويتخطّى الرد لو الـ wid متوقّف.
   - endpoint جديد `api/ai-agent/admin-reply.js`: المدير يكتب رد في CLARK → يتبعت للعميل عبر `sendViaBridge` + يتسجّل turn بـ `admin_takeover:true`.
   - (الـ takeover ممكن expire بعد 24h بدون نشاط → الأيجنت يستأنف.)
2. **عرض المحادثات الحيّة المحسّن** — LogsTab شغّال أساسياً؛ ضيف: فلتر «نشط/متوقّف/مُصعّد»، عرض الـ thread بشكل أوضح، زر فتح محادثة كاملة.
3. **لوحة التحليلات الحقيقية (Dashboard)** — دلوقتي بتقرا `aiAgentAnalytics` (فاضي). محتاج:
   - تجميع يومي (cron أو حساب client-side من aiAgentConversations): رسائل اليوم، نسبة FAQ، متوسط الثقة، نسبة التصعيد، أكثر النوايا، **التكلفة** (من `usage` — السعر في LogsTab `ConversationThreadCard` كمرجع: in×$3 + out×$15 + cache).
4. **تبويب الاقتراحات/التغذية الراجعة** — `aiAgentSuggestions` listener موجود؛ اربط الأزرار (👍/👎، «اقترح كـ FAQ»).

### ⚙️ B — أدوات + حوكمة الباك-إند
5. **سقف التكلفة الآلي (مهم لـ Sonnet)** — counter يومي في Firestore (مثلاً `aiAgentBudget/{YYYY-MM-DD}`)، يتفحص في `incoming.js` قبل نداء Claude، auto-disable لو تعدّى السقف (config). الأدوات بتسجّل `usage` فعلاً فالتكلفة محسوبة.
6. **تطبيق الجدول الكامل** — دلوقتي بس `mode==="off"`. ضيف نوافذ ساعات/أيام (timezone Africa/Cairo) + `offHoursBehavior`.
7. **أدوات بيانات إضافية** في `_tools.js` (نفس النمط — أضف للـ REGISTRY):
   - `get_customer_orders` / `get_order_status` (يقرا seasons/{season}/orders — الربط بالعميل عبر `customerDeliveries[].custId`).
   - `search_products` (للكتالوجات الكبيرة — دلوقتي أول 40 منتج في السياق).
   - `notify_sales_team`, `send_otp`/`verify_otp` (config موجود).
   - ⚠️ **أي أداة بتقرا رصيد/فلوس:** الأأمن إنها تدّي **رابط البوابة** (زي `generate_portal_link`) بدل ما تقول رقم — تجنّب إعادة حساب المحاسبة سيرفر-سايد.
8. **ربط LID بالرقم** (`notify_admin_phone_request`) — للراسلين بـ @lid بدون رقم.
9. **الصوت/الصور** — whatsapp media → transcription/vision (متقدم).
10. **تحسين الذاكرة** — دلوقتي equality query + sort بالميموري (مفيش index). لو المحادثات كترت، composite index (wid+at) أو per-wid thread doc.

---

## ٦) ملاحظات تنفيذية مهمة (عشان تكمّل صح)

- **إضافة أداة جديدة:** أضف `{schema, async run(input, ctx)}` في `REGISTRY` بـ `_tools.js`. `ctx = {db, wid, phone, customer:{id,name,type}, agent, bridge:{url,token}}`. الـ schema بصيغة Anthropic tool-use. `getToolSchemas` بيفلتر بـ `config.aiAgent.tools[name].enabled !== false`.
- **الأدوات read-only على بيانات الشغل** — الكتابة بس على `aiAgent*` collections (زي التصعيد).
- **prompt caching:** البلوك الكبير الثابت (knowledge) متبعت بـ `cache_control:{type:"ephemeral"}`. أي تغيير في محتواه بيعيد بناء الكاش (طبيعي).
- **النموذج:** `claude-sonnet-4-20250514` (نفس api/ai.js) — overridable بـ env `AI_AGENT_MODEL`. **لو هتلمس نداء Anthropic، استخدم skill `claude-api`** (caching/tool-use best practices).
- **الجسر بيرسل بـ `{phone, message}`** (مش `to`/`text`). الإرسال عبر `sendViaBridge`.
- **اسم لون الموديل = `c.color`** (مش `c.name` ولا `c.n`) — CLAUDE.md §4. (ده كان bug استيراد الكتالوج.)
- **الـ webhook بيرجّع 200 دايماً** (عشان الجسر مايعملش retry-storm)؛ الأخطاء تتسجّل على الـ turn.
- **مفيش تعديل firestore.rules مطلوب للباك-إند** (admin SDK بيكتب)؛ الفرونت بيقرا aiAgent* بقواعد isManagerPlus الموجودة.

---

## ٧) سياق باقي الـ session (مش أيجنت — عشان الصورة كاملة)

- **المحافظ الإلكترونية اكتملت (V211→V224):** إصلاح العمولة اليتيمة عند الحذف، الحدود والعمولة على التعديل، الحدود على التحويلات (بدون عمولة — قرار أحمد)، min/max للعمولة، تاب واحد بشرائط فرعية، حذف محفظة فاضية، طريقة الدفع التلقائية، حد سحب يومي لكل محفظة (V223)، zebra في سجل الحركات (V224).
- **🐞 bug مؤجَّل (مهم):** **المحفظة المحذوفة بترجع** أحياناً — `treasuryAccounts` مصفوفة مشتركة في `factory/config` (نمط §10 — resurrection من stale-write مالتي-ديفايس). الحل الجذري = **تقسيمها لـ `treasuryAccountsDocs`** (per-id partition زي customers/recurringTreasury). **خطر** (يلمس كل الخزينة + محتاج firestore.rules + migration + بيئة اختبار — والعملية دي كسرت production في V21.9.44). أحمد قرر **تأجيله** → يُعمل على **Vercel preview branch** مع rules-first. الحل المؤقت: امسح المحفظة تاني (بتثبت).
- handoffs أقدم: `V21.9.198-210` + `V21.9.211-215` (الأخير عدّله أحمد لـ V216).

---

## ٨) البروتوكول (مختصر — التفاصيل في CLAUDE.md)
- بعد أي تغيير: bump النسخة في ٣ أماكن (`package.json` + `src/constants/index.js` + `AboutVersionModal.jsx` changelog) → commit (stage ملفات محددة، مش `git add .`) → **أحمد يـ push** → zip في Dynamics/ root (اسم الـ folder الداخلي = النسخة).
- §0.1 Push Back: اعترض على أي تغيير يلمس treasury/accounting/rules/auth بدون verification.
- الأيجنت customer-facing → خلّي testMode هو شبكة الأمان أثناء أي تطوير.

---

**TL;DR للشات الجاية:** الأيجنت backend شغّال (٨ خطوات، V234، متدفوع). كمّل **الـ UI**: (١) التدخل اليدوي، (٢) لوحة التحليلات الحقيقية، (٣) سقف التكلفة، ثم باقي الأدوات. النمط واضح في `api/ai-agent/_tools.js`. اقرأ CLAUDE.md. أحمد بيـ push + بيختبر عبر testMode.
