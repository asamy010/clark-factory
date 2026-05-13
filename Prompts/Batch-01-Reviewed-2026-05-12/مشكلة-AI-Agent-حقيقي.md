# 🤖 Prompt احترافي — AI Agent: من Configuration Surface إلى Agent حقيقي شغّال

> **النسخة الحالية:** CLARK V21.9.31
> **نوع المهمة:** Backend implementation (Phase D) + Bridge upgrade + Intelligence layer
> **خطورة الموقف:** ⚠️ الـ Agent **مش بيشتغل خالص دلوقتي** — مش bug، الـ backend ما اتعملش لسه. الـ UI الموجود في CLARK = configuration surface فقط.

---

## 🔍 الفهم الصحيح للمشكلة (مهم تقرأه قبل البرومبت)

من فحص الكود، الحقائق:

**اللي شغّال:**
- ✅ AIAgentPg.jsx (3980 سطر) — صفحة CLARK لتحرير `config.aiAgent` (personality, FAQs, tools, schedule, testMode, tierDiscounts, escalation)
- ✅ `INIT_CONFIG.aiAgent` schema كامل في constants/index.js (السطور 95-205)
- ✅ WhatsApp Bridge (`clark-wa-bridge/server.js`, 809 سطر) على Contabo VPS — بيرسل رسائل (outgoing)
- ✅ `/api/ai.js` endpoint موجود — proxy لـ Anthropic مع auth + rate limit
- ✅ aiAgent* collections مُعرّفة في firestore.rules (conversations, escalations, suggestions, analytics)

**اللي مش شغّال (الأسباب الجذرية):**
- ❌ **الـ Agent Backend غير موجود** — comment في AIAgentPg.jsx صريح: "Not built yet — backend = Phase D"
- ❌ **WhatsApp Bridge مفيهوش incoming handler** — `grep` على `incoming|on_message|webhook` في server.js = صفر نتائج. الـ bridge بيرسل بس، مش بيستقبل
- ❌ **Sandbox tab بيعمل substring matching فقط** (السطر 2191): `lower.includes(p) || p.includes(lower)` — مش semantic، مش ذكي
- ❌ **مفيش customer lookup by phone** — العميل لما يكلم، الـ bridge بيتجاهل، فمش بيحصل customer recognition أصلاً
- ❌ **الـ Tools مش بتتنفذ** — get_customer_info, get_customer_balance, generate_statement_pdf, search_products، إلخ كلها مجرد flags في config، مفيش execution logic
- ❌ **Sandbox response الـ default:** "ده الـ sandbox المحلي — مفيش FAQ مطابق... لما الـ backend الفعلي يطلع (Phase D) هيـuse Claude Haiku" — اعتراف صريح من الكود إن الـ backend مش موجود

**معنى ده:** لما العميل يكلم رقم الواتساب، **مفيش حاجة بتحصل أبداً**. الـ bridge شايف الرسالة (whatsapp-web.js بيستقبلها داخلياً) بس مفيش handler يـ process. الـ AI Agent في CLARK مجرد لوحة تحكم لـ backend ما اتبنيش.

---

## 📋 السياق الذي يجب أن يدخل قبل البرومبت

الـ AI لازم يفتح ويقرأ:

**الـ Configuration Surface (موجود):**
- `src/pages/AIAgentPg.jsx` (3980 سطر) — كل التابات: dashboard / personality / catalog / faqs / tools / schedule / logs / suggestions / sandbox / funnel / profiles
- `src/constants/index.js` (السطور 95-205) — `INIT_CONFIG.aiAgent` schema كامل

**الـ WhatsApp Bridge (موجود — outgoing فقط):**
- `clark-wa-bridge/server.js` (809 سطر)
- `clark-wa-bridge/Dockerfile` + `docker-compose.yml` + `Caddyfile`
- Bridge متوضع على Contabo VPS Germany — `clark-rmg.duckdns.org`
- AUTH_TOKEN, Anti-ban settings، Queue، Daily cap، Opt-outs (الكل موجود)

**الـ AI Proxy (موجود — للـ AI Helper الداخلي في CLARK):**
- `api/ai.js` — Firebase auth + rate limit + Anthropic forward

**Customer/Order Data (للـ Tools execution):**
- `data.customers` + `customersDocs/{id}` (per-doc since V19.57)
- `data.salesInvoices` + `salesInvoicesDays/{YYYY-MM-DD}`
- `data.custPayments` + `custPaymentsDays/{YYYY-MM-DD}`
- `data.orders` في `seasons/{season}/orders/{docId}`
- `src/utils/accounting/statement.js` (لو الـ Statement of Account prompt اتنفذ)

**Customer Portal (موجود — للـ generate_portal_link tool):**
- `api/customer-portal-sign.js` (HMAC-signed)
- `api/customer-portal.js`
- `src/components/CustomerPortalPage.jsx`

**Permissions + Rules:**
- `firestore.rules` (السطور لـ aiAgent* collections — V21.9.19)
- `src/utils/permissions.js` (`aiAgent` tab — موجود)

**Architectural rules:**
- `CLAUDE.md §1` (Build/Test/Commit/Push/Zip)
- `CLAUDE.md §2` (Document Splitting — لو conversations هتكبر)

---

## 🎯 البرومبت (انسخ من هنا للأسفل)

````
أنت Principal AI Engineer + WhatsApp Automation Architect + LLM Application
Developer مستوى Anthropic/Google DeepMind/OpenAI. عندك خبرة عميقة في:
  - Anthropic Claude API + Tool Use (function calling) + Streaming
  - WhatsApp Web API (whatsapp-web.js) — incoming + outgoing
  - Conversational AI design — multi-turn context, intent classification,
    confidence scoring, graceful escalation
  - Egyptian Arabic colloquial NLP — لهجة عامية مصرية في prompt engineering
  - Production-grade conversation logging + analytics
  - Tool execution sandboxes + agent action authorization

النظام: CLARK — ERP لمصنع ملابس مصري للأطفال (React 18 + Firebase
Firestore + Vercel + Contabo VPS لـ WhatsApp Bridge). Bridge شغّال
وبيرسل رسائل من Campaign Engine، لكن **مش بيستقبل**. الـ AI Agent
UI في CLARK = configuration surface فقط — الـ backend غير موجود.

═══════════════════════════════════════════════════════════════════
🚨 المشكلة (الفهم الجذري — لازم تستوعبها قبل أي حل)
═══════════════════════════════════════════════════════════════════

من فحص الكود (موثّق في الـ commit history + الـ inline comments):

  المشهد:
    العميل بيبعت رسالة على رقم واتساب المصنع (CLARK 201100201057،
    متصل على الـ Bridge في Contabo VPS).
    
  اللي بيحصل دلوقتي:
    1. whatsapp-web.js داخل الـ Bridge بيشوف الرسالة (event 'message')
    2. لكن **مفيش handler مسجل على الـ event ده** في server.js
       (تأكد بـ grep على "incoming|message_create|message_received" في
        clark-wa-bridge/server.js — صفر نتائج)
    3. الرسالة تتجاهل تماماً — مفيش log، مفيش webhook، مفيش رد
    4. العميل يقعد ينتظر — يفترض إن الـ agent مش شغال
    5. لو الـ admin شاف الرسالة في الموبايل وحول لـ human منفصل،
       ده escalation manual — مش مر بـ CLARK خالص

  الـ UI في CLARK (AIAgentPg.jsx) شغّال 100%:
    - FAQs محرّرة + saved في config.aiAgent.faqs
    - Personality مضبوطة
    - Schedule موجود
    - Tools كلها toggle = true
    - Sandbox tab بيـ test FAQ matching local (substring) — مش بيستدعي Anthropic
    
    ⚠️ لكن كل ده مجرد configuration. مفيش process بيقرأها ويـ act عليها.

  الاحتياج النهائي (ما يطلبه Ahmed):
    
    [1] الـ Agent يستقبل رسائل الواتساب فعلياً
    [2] يـ recognize العميل من رقمه (lookup في customersDocs)
    [3] يفهم سياق السؤال (semantic، مش substring match)
    [4] يجاوب بـ Egyptian Arabic colloquial (لهجة عامية مصرية)
    [5] الـ tools تشتغل فعلياً (get_customer_balance, generate_statement_pdf،
        search_products، escalate_to_human، إلخ)
    [6] الـ admin يتحكم فيه live من CLARK:
        - يشوف المحادثات في real-time
        - يتدخل (manual takeover)
        - يضيف FAQs أو يصلح الردود
        - يـ pause/resume الـ agent
        - يشوف confidence + analytics
    [7] الـ admin يطلب من Claude يقترح features احترافية إضافية
        (Ahmed قال: "ممكن انا كمان معرفهاش")

═══════════════════════════════════════════════════════════════════
📂 الملفات اللي لازم تقرأها قبل ما تقترح أي حل
═══════════════════════════════════════════════════════════════════

CONFIGURATION (موجود — مرجعك للـ runtime):
  • src/pages/AIAgentPg.jsx (3980 سطر)
    - 11 tabs: dashboard / personality / catalog / faqs / tools /
      schedule / logs / suggestions / sandbox / funnel / profiles
    - SandboxTab (السطر 2159) — الـ mock matcher الحالي
  • src/constants/index.js (السطور 95-205) — INIT_CONFIG.aiAgent
    schema كامل (هو الـ contract بين CLARK UI و الـ backend الجديد)

WHATSAPP BRIDGE (موجود — outgoing فقط):
  • clark-wa-bridge/server.js (809 سطر)
    - whatsapp-web.js Client setup
    - Outgoing queue + anti-ban + opt-outs
    - Auth token middleware
    - ⚠️ مفيش client.on('message', ...) handler — ده الجاني الأول
  • clark-wa-bridge/Dockerfile + docker-compose.yml + Caddyfile
  • clark-wa-bridge/SETUP-VPS.md — تعليمات الـ deploy

AI PROXY (موجود — للأ helper الداخلي):
  • api/ai.js — Firebase auth + rate limit (30/5min) + body cap (50KB)
    + Anthropic forward. ⚠️ ده للأ Helper المتكلم مع المدير في CLARK
    UI، مش للأ Agent اللي يكلم العملاء. الجديد لازم يكون endpoint
    منفصل بـ auth وسياسات مختلفة.

CUSTOMER + ORDER DATA (للـ Tools execution):
  • src/utils/orders.js — Customer + party lookup helpers
  • Customer data location: customersDocs/{id} (per-doc since V19.57)
    Schema: {id, name, phone, type, address, discount, ...}
  • Orders: seasons/{activeSeason}/orders/{docId}
  • Invoices: data.salesInvoices + salesInvoicesDays/{YYYY-MM-DD}
  • Payments: data.custPayments + custPaymentsDays/{YYYY-MM-DD}
  • Statement utility (لو موجود من الـ Statement prompt):
    src/utils/accounting/statement.js → buildAccountStatement()

CUSTOMER PORTAL (موجود — للـ generate_portal_link tool):
  • api/customer-portal-sign.js — HMAC-signed URL generator
  • api/customer-portal.js — read endpoint
  • src/components/CustomerPortalPage.jsx
  • ده الـ tool اللي العميل لما يطلب "كشف حساب" الـ agent يولّد له
    portal link شخصي signed

PERMISSIONS + RULES:
  • firestore.rules (Block V21.9.19 ADDITIONS):
      match /aiAgentConversations/{id}    { ... }
      match /aiAgentEscalations/{id}      { ... }
      match /aiAgentSalesNotifications/{id} { ... }
      match /aiAgentSuggestions/{id}      { ... }
      match /aiAgentAnalytics/{id}        { ... }
    كلها read/write = isManagerPlus. ⚠️ الـ backend هيستخدم admin SDK
    فمش هيخضع للـ rules.

CONTEXT:
  • CLAUDE.md (engineering protocol)
  • docs/V19.71.0.md → V19.77.2.md — كل phase A + B notes للـ AI Agent
  • WORK_LOG.md (V19.71 → V19.80) — تاريخ الـ AI Agent

═══════════════════════════════════════════════════════════════════
🧠 ما أريدك تعمله — Plan-First, Then Execute
═══════════════════════════════════════════════════════════════════

⚠️ ده أكبر فيتشر في الـ batch الحالي. ممكن يكون 15-20 slice.
   مفيش حل بالـ "كتب كله مرة واحدة". الـ slicing here is non-negotiable.

PHASE 0 — Discovery + Diagnosis
  • اقرأ الملفات المذكورة فوق كاملة
  • أكد فهمك بـ صراحة:
      - الـ Bridge شغّال outgoing فقط
      - الـ AI Agent UI = configuration surface only
      - الـ aiAgent* collections فاضية لأن مفيش backend بيكتب فيها
      - الـ tools مفيهاش execution logic
  • اطبع جدول "Existing vs Missing":
      Capability         | Status  | Gap
      ───────────────────┼─────────┼──────────────────────
      Outgoing WhatsApp  | ✅      | None
      Incoming WhatsApp  | ❌      | Bridge needs on('message')
      Customer lookup    | ❌      | No phone→customer fn
      FAQ matching       | ⚠️ weak | Substring only, no semantic
      Tool execution     | ❌      | No backend runtime
      Conversation log   | ❌      | aiAgentConversations empty
      Live UI control    | ⚠️ part | No takeover, no live view
      Egyptian dialect   | ⚠️      | Prompt OK but model never called
      
  • اطبع 5-8 clarifying questions ذكية. الأسئلة المحتملة:
      Q1: نشر الـ Agent Backend على:
          (a) Vercel serverless functions (نفس CLARK، أسهل في الـ deploy)
          (b) نفس Contabo VPS مع الـ Bridge (latency أقل بس عقدة جديدة)
          (c) VPS منفصل (over-engineering للحجم الحالي)
          → أنصح بـ (a) — webhook architecture: Bridge يـ POST لـ Vercel
            عند incoming، Vercel يـ process ويرد للـ Bridge بـ outgoing.

      Q2: Anthropic model choice:
          (a) claude-haiku-4-5 — أرخص، أسرع، كفاية لـ FAQ + tool use
          (b) claude-sonnet-4-6 — أذكى، أبطأ، أغلى
          (c) Hybrid: Haiku للـ classification + Sonnet للـ generation
          → أنصح بـ (c) Hybrid — توفير كبير في التكلفة

      Q3: Conversation context window:
          - كم رسالة سابقة نحطها في context كل turn؟ (10? 20?)
          - بعد إد إيه نـ summarize old turns؟
          - storage: full conversation in aiAgentConversations/{id}
            مع pagination/split لو طال

      Q4: Cost control budget:
          - Daily budget cap (USD)?
          - Per-customer daily message cap?
          - Auto-disable Agent لو الـ budget اتجاوز؟

      Q5: Customer recognition policy:
          - Phone normalization: "+201234567890" vs "01234567890" vs
            "201234567890@c.us"
          - لو phone مش في customersDocs: agent يـ ask للاسم أم يـ escalate؟
          - LID (WhatsApp legacy ID) handling: لو waid مش phone-shaped
            (مثلاً xxx@lid) — الـ notify_admin_phone_request tool موجود
            في config — يـ trigger ازاي؟

      Q6: Egyptian dialect calibration:
          - مستوى الإيموجي (moderate الموجود — ابقى عليه؟)
          - "حضرتك" + "أ/" قبل الاسم — already في system prompt — أكد؟
          - Slang words allowed (يا باشا، يا فندم، تمام، أيوة)?
          - Voice notes — agent يستقبل؟ (whatsapp-web.js يدعم بـ transcription
            via Whisper — لازم separate service)
          - Images — العميل يبعت صورة موديل وعاوز سعر؟ Agent يـ describe
            عبر Claude vision أو يـ escalate؟

      Q7: Manual takeover semantics:
          - "Pause" = agent يوقف عن العميل ده specifically أم globally؟
          - لما الـ admin يـ takeover ويرد بنفسه، الرسالة تـ log في
            aiAgentConversations؟
          - الـ takeover يـ expire بعد إيه (مثلاً 24h بدون رسالة من
            admin → agent يستأنف)?

      Q8: Time-of-day handling:
          - الـ schedule في config (offHoursBehavior: answer_anyway|
            say_we_reply|escalate_all) — confirm كل خيار له behavior
            مختلف في الـ backend؟
          - Friday off — confirm مفيش رد خالص أم رد آلي بـ off-hours msg؟

  انتظر إجابات Ahmed قبل الـ Architecture plan.

PHASE 1 — Architecture Plan
  • ارسم Component Diagram:
    
    ┌─────────────┐                  ┌──────────────────┐
    │  Customer   │ ───WhatsApp────▶│ Contabo VPS:     │
    │  Phone      │                  │ - WA Bridge      │
    └─────────────┘                  │   (incoming hook)│
                                     │ - Caddy HTTPS    │
                                     └────┬─────────────┘
                                          │ POST /incoming
                                          ▼
                                     ┌──────────────────┐
                                     │ Vercel:          │
                                     │ /api/ai-agent/   │
                                     │   incoming.js    │◀──── reads ────┐
                                     │ /api/ai-agent/   │                │
                                     │   process-turn.js│                │
                                     │ /api/ai-agent/   │                ▼
                                     │   tools/*.js     │       ┌────────────────┐
                                     └────┬─────────────┘       │ Firestore:     │
                                          │                     │ - factory/config│
                                          │                     │   .aiAgent      │
                                          ▼                     │ - customersDocs │
                                     ┌──────────────────┐       │ - salesInvoices*│
                                     │ Anthropic API    │       │ - aiAgent*     │
                                     │ - claude-haiku   │       │   (conversations│
                                     │   (classify)     │       │    , logs, etc.)│
                                     │ - claude-sonnet  │       └────────┬────────┘
                                     │   (generate)     │                ▲
                                     └────┬─────────────┘                │
                                          │ tool_use loop                │
                                          └──── tools execute ───────────┘
                                          │
                                          ▼
                                     reply text + tools_used + confidence
                                          │
                                          ▼
                                     POST back to Bridge /send
                                          │
                                          ▼
                                     Bridge → WhatsApp → Customer

  • Sequence Diagram لـ سيناريو نموذجي:
    "عميل يبعت 'عاوز كشف حسابي'":
    
    1. WA → Bridge.on('message', msg)
    2. Bridge → POST /api/ai-agent/incoming { wid, body, ts }
    3. /incoming: Read aiAgent config. Schedule check. Test-mode check.
       Customer lookup by normalized phone → Found "Ahmed Co (ID xyz)"
    4. /incoming: Append to aiAgentConversations/{wid} (or create)
    5. /incoming: Call /process-turn with context
    6. /process-turn: Build system prompt + recent messages + customer
       profile + available tools
    7. Anthropic: claude-haiku classifies intent → "request_statement"
    8. Anthropic: claude-sonnet generates plan:
       - Use tool: generate_statement_pdf({customerId: xyz})
       - Use tool: get_customer_balance({customerId: xyz})
    9. Tool executor: generate_statement_pdf →
       - Call buildAccountStatement(data, {partyId: xyz, partyType: customer})
       - Call exportStatementToXlsx() OR generate HTML PDF
       - Upload to Firebase Storage
       - Call /api/customer-portal-sign with TTL 24h
       - Return: { portalUrl, balance, lastInvoiceDate }
    10. Anthropic continues: "أهلاً أ/أحمد، رصيدك دلوقتي X ج.م.
        كشف حسابك جاهز هنا: [link]. أي خدمة تانية؟"
    11. /process-turn: Save to aiAgentConversations + update analytics
    12. /process-turn: Response to Bridge { reply, mediaUrl?, escalate? }
    13. Bridge: enqueue reply with anti-ban delay → send

  • اطبع جدول كامل بـ كل ملف جديد + غرضه + الـ exports:
    
    API Endpoints (Vercel functions):
      /api/ai-agent/incoming.js          — webhook receiver from Bridge
      /api/ai-agent/process-turn.js      — main orchestrator + Anthropic call
      /api/ai-agent/takeover.js          — admin manual takeover endpoint
      /api/ai-agent/resume.js            — admin resume endpoint
      /api/ai-agent/admin-reply.js       — admin sends reply via agent's number
      /api/ai-agent/tools/_executor.js   — shared tool execution wrapper
      /api/ai-agent/tools/customer-info.js
      /api/ai-agent/tools/customer-balance.js
      /api/ai-agent/tools/customer-orders.js
      /api/ai-agent/tools/order-details.js
      /api/ai-agent/tools/search-products.js
      /api/ai-agent/tools/faq-answer.js          — semantic FAQ retrieval
      /api/ai-agent/tools/portal-link.js
      /api/ai-agent/tools/statement-pdf.js
      /api/ai-agent/tools/escalate.js
      /api/ai-agent/tools/notify-sales.js
      /api/ai-agent/tools/send-otp.js
      /api/ai-agent/tools/verify-otp.js
      /api/ai-agent/tools/notify-admin-phone-request.js
      /api/ai-agent/cron/dormancy.js     — daily cron: detect dormant customers
      /api/ai-agent/cron/budget-check.js — cost guardrail
    
    Bridge changes (clark-wa-bridge/server.js):
      + client.on('message', handleIncoming)
      + POST handler for /admin-send (when admin uses takeover)
      + WEBHOOK_URL env var (Vercel endpoint)
      + WEBHOOK_TOKEN env var
      + Inbound retry queue (if Vercel unreachable, retry)
    
    CLARK side (new):
      src/pages/AIAgentPg.jsx — extensions:
        - LiveConversationsTab (replace mock dashboard with real listener)
        - LiveSandboxTab (call /process-turn with isSandbox=true flag)
        - TakeoverControls in conversation detail
        - "Suggest features" button → calls Claude meta-prompt
      
      src/utils/aiAgent/
        ├── normalizePhone.js     — WA wid → canonical phone
        ├── customerMatcher.js    — phone → customer
        ├── conversationStore.js  — read/write aiAgentConversations
        └── liveListener.js       — onSnapshot for live conversations UI

  • اطبع الـ Tool Definitions بصيغة Anthropic Tool Use:
    لكل tool: name, description, input_schema (JSON Schema), behavior_notes
    
  • اطبع الـ System Prompt الكامل (Egyptian Arabic):
    استند للموجود في config.aiAgent.personality.systemPrompt
    + ضيف:
      - تعليمات الـ tool use الصارمة (لا تخترع، استخدم tools)
      - تعليمات الـ context (customer profile injection)
      - تعليمات الـ escalation triggers
      - أمثلة (few-shot) لـ 3-5 سيناريوهات نموذجية بالعامية المصرية

  • اطبع الـ Firestore Schema:
    aiAgentConversations/{wid_or_phone}:
      {
        wid, phone, customerId, customerName,
        startedAt, lastMessageAt,
        status: "active" | "paused_by_admin" | "escalated" | "closed",
        messages: [{
          role: "user" | "assistant" | "system" | "tool",
          content, ts, tools_used?, confidence?, model?,
          admin_takeover?: boolean,
        }],
        analytics: {turns, escalations, faqHits, toolCalls, totalCostUSD},
      }
    
    aiAgentEscalations/{id}:
      { conversationId, reason, urgency, createdAt, resolvedAt? }
    
    aiAgentSuggestions/{id}:
      { type, description, suggestedBy: "agent" | "admin",
        status: "pending" | "approved" | "rejected", at }

  • اطبع الـ Cost Budget Plan:
    - Estimated tokens per turn (input + output)
    - Cost per turn at Haiku vs Sonnet pricing
    - Daily caps + alerts

  • اطبع الـ Security + Privacy:
    - Bridge ↔ Vercel auth: HMAC signed payloads
    - Anthropic API key: env var only, no client exposure
    - Customer data in prompts: redact when not needed
    - Storage of conversations: 90-day retention default

  • اطبع الـ Risk Register:
    R1: WhatsApp ban (Bridge approach inherent risk)
    R2: Anthropic outage → degraded mode (FAQ-only fallback)
    R3: Customer impersonation (phone spoof) → OTP for sensitive ops
    R4: Cost blow-up (loop bug) → daily budget kill-switch
    R5: Prompt injection from customer messages → system prompt protection
    R6: Race conditions in conversation log → use Firestore transactions
    R7: Egyptian dialect tone-drift over many turns → temperature 0.3-0.5

  • اطبع الـ Slice plan الكامل (15-20 slices مفصلة)

  انتظر "نفذ" من Ahmed قبل أي كود.

PHASE 2 — Incremental Implementation (15-20 slices)

  Slice 1 — Bridge incoming handler (foundation)
    - Add client.on('message') in server.js
    - Add WEBHOOK_URL config
    - Add HMAC signing
    - Add inbound retry queue
    - Test: send WhatsApp to Bridge, verify webhook received
    - Version: bridge v2.0
    - Commit: "Bridge V2.0: Incoming message webhook"

  Slice 2 — Vercel /incoming endpoint (skeleton)
    - Receive Bridge webhook
    - HMAC verify
    - Save raw message to aiAgentConversations
    - Return 200 OK (no AI yet — just logging)
    - LiveConversationsTab in CLARK shows incoming messages real-time
    - Test: scenario sends msg, verify it appears in CLARK
    - V21.11.0: Phase 14a — Agent ingestion pipeline

  Slice 3 — Customer recognition + context builder
    - src/utils/aiAgent/normalizePhone.js
    - src/utils/aiAgent/customerMatcher.js
    - On incoming, lookup customer
    - Store customerId + profile in conversation doc
    - LiveConversationsTab shows customer name + tier next to phone
    - V21.11.1: Phase 14b — Customer recognition

  Slice 4 — System prompt + first Anthropic call (no tools)
    - /api/ai-agent/process-turn.js
    - Build system prompt + context
    - Single Anthropic call (no tools yet)
    - Reply enqueued to Bridge via /admin-send
    - This is the "MVP — agent says hi"
    - V21.11.2: Phase 14c — First reply

  Slice 5 — Tool framework + FAQ semantic matcher
    - /api/ai-agent/tools/_executor.js (shared infrastructure)
    - /api/ai-agent/tools/faq-answer.js (semantic via Claude classify)
    - Tool use loop in process-turn
    - Test: agent answers FAQ correctly
    - V21.11.3: Phase 14d — FAQ semantic matching

  Slice 6 — Customer data tools
    - customer-info, customer-balance, customer-orders, order-details
    - Each reads from Firestore admin SDK
    - V21.11.4: Phase 14e — Customer data tools

  Slice 7 — Statement + Portal tools
    - statement-pdf (uses buildAccountStatement from prior prompt)
    - portal-link (uses customer-portal-sign)
    - HTML/PDF generation + Firebase Storage upload
    - V21.11.5: Phase 14f — Statement + Portal tools

  Slice 8 — Search products tool
    - search-products with image URLs + pricing per tier
    - V21.11.6: Phase 14g — Product search

  Slice 9 — Escalation + Sales notification tools
    - escalate-to-human + notify-sales-team
    - Triggers writing to aiAgentEscalations + aiAgentSalesNotifications
    - WhatsApp notification to admin
    - V21.11.7: Phase 14h — Escalation

  Slice 10 — OTP tools + sensitive operation gates
    - send-otp + verify-otp
    - For phone-based authentication of LID-only senders
    - V21.11.8: Phase 14i — OTP

  Slice 11 — Schedule + Test mode enforcement
    - process-turn checks schedule.mode + testMode.whitelist
    - off-hours behavior implementation
    - V21.11.9: Phase 14j — Schedule + test mode

  Slice 12 — Live takeover UI in CLARK
    - LiveConversationsTab: "🎮 تدخل" button
    - Pauses agent for this wid
    - Admin types in CLARK → /api/ai-agent/admin-reply → Bridge → customer
    - "Resume" button releases back to agent
    - V21.11.10: Phase 14k — Manual takeover

  Slice 13 — Analytics + Dashboard
    - aiAgentAnalytics daily aggregation cron
    - Dashboard tab pulls real data (replaces mock)
    - Metrics: messages today, FAQ hit rate, avg confidence,
      escalation rate, top intents, cost today
    - V21.11.11: Phase 14l — Analytics dashboard

  Slice 14 — Cost budget guardrail
    - cron/budget-check
    - Auto-disable agent if daily budget exceeded
    - Admin alert
    - V21.11.12: Phase 14m — Cost guardrail

  Slice 15 — Live sandbox (real backend testing)
    - SandboxTab calls process-turn with isSandbox=true
    - Same logic, but doesn't send to Bridge — returns reply in UI
    - V21.11.13: Phase 14n — Real sandbox

  Slice 16 — Conversation feedback + FAQ training
    - Admin rates conversations 👍/👎
    - 👎 conversations show in suggestions tab
    - "Suggest as new FAQ" button → creates FAQ proposal
    - V21.11.14: Phase 14o — Feedback loop

  Slice 17 — Phone request flow (for LID senders)
    - notify-admin-phone-request tool
    - Admin gets WhatsApp prompt "ربط LID xxx بـ phone؟"
    - Admin replies → mapping saved
    - V21.11.15: Phase 14p — LID resolution

  Slice 18 — Dormancy + funnel updates
    - Dormancy cron detects 30+ day silence
    - Funnel auto-transitions per stageTransitionAutoApprove
    - V21.11.16: Phase 14q — Lifecycle automation

  Slice 19 — Voice notes (optional, complex)
    - Bridge passes media URL
    - Whisper transcription (OpenAI or self-hosted)
    - Treated as text input
    - V21.11.17: Phase 14r — Voice support (optional)

  Slice 20 — "Suggest improvements" meta-feature
    - Button in AIAgentPg → "💡 اقتراحات تطوير"
    - Calls Anthropic with full agent config + last 100 conversations
    - Returns list of suggested features the admin hadn't thought of
    - Examples it might suggest:
      • Proactive outreach (agent re-engages dormant customers)
      • Personalized product recommendations based on order history
      • Predictive churn alerts
      • Multi-language support (Arabic + English mix)
      • Voice replies (agent speaks back)
      • Image-based catalog browsing
      • A/B testing of FAQ phrasings
      • Sentiment analysis per conversation
      • Auto-FAQ generation from frequent unresolved questions
      • Sales conversion funnel A/B
    - V21.11.18: Phase 14s — Self-improvement suggestions

  Slice 21 — Documentation + handoff
    - Full ai-agent setup guide in docs/
    - Bridge V2 setup notes
    - Vercel env vars list
    - Cost monitoring playbook

PHASE 3 — Production rollout
  - Soft launch via testMode.whitelist (5-10 trusted customers)
  - Monitor 1 week
  - Gradual rollout (50% → 100%)
  - Daily review of escalations
  - FAQ training based on real conversations

═══════════════════════════════════════════════════════════════════
🎨 الـ Egyptian Dialect Calibration (CRITICAL)
═══════════════════════════════════════════════════════════════════

الـ system prompt في config.aiAgent.personality.systemPrompt كويس بس
محتاج تحسينات. ضيف الحاجات دي:

A. Lexicon المصري المسموح:
   "أهلاً بحضرتك" / "أهلاً وسهلاً" / "صباح الفل" / "مساء النور"
   "تمام" / "أيوة" / "ماشي" / "حاضر" / "تحت أمرك"
   "حضرتك" بدل "أنت" / "ممكن" / "في خدمتك"
   "كده" / "بس" / "خلاص" / "أهو"

B. Lexicon ممنوع (لو الأسلوب formal أو bilingual):
   "إن شاء الله" بكثرة (مرة واحدة كافية في رسالة)
   مفردات صعبة / فصحى (نتشرف، يسعدنا)
   "Mr." / "Mrs." (استخدم "أ/" قبل الاسم)
   ترجمة حرفية من إنجليزي

C. Few-shot examples (ضيفهم في الـ system prompt):
   
   Example 1 — عميل معروف يسأل عن رصيد:
   user: عاوز اعرف انا عليا كام
   assistant: أهلاً أ/[name]، رصيدك دلوقتي 12,450 ج.م.
              عاوز كشف حساب تفصيلي؟
   tools: get_customer_balance
   
   Example 2 — عميل جديد:
   user: السلام عليكم، عاوز اعرف اسعاركم
   assistant: وعليكم السلام ورحمة الله. أهلاً بحضرتك في كلارك.
              عندنا تشكيلة واسعة من ملابس الأطفال. ممكن تقولي
              النوع اللي بتدور عليه؟ (طقم، بيجاما، فستان...)
   
   Example 3 — شكوى:
   user: انتو بعتولي حاجة وحشة جداً مش راضي
   assistant: أنا آسف جداً إن حضرتك مش مبسوط أ/[name].
              هـ أحول حضرتك على المسؤول دلوقتي يتابع شخصياً.
              ممكن تقولي رقم الطلب علشان نراجعه؟
   tools: escalate_to_human
   
   Example 4 — سؤال FAQ:
   user: الشحن بياخد كام يوم
   assistant: الشحن بياخد من 2 لـ 4 أيام عمل داخل القاهرة والإسكندرية،
              و 3 لـ 5 أيام للمحافظات. أي خدمة تانية؟
   tools: get_faq_answer

D. Temperature setting:
   - Classification (intent detection): 0.1
   - Tool selection: 0.2
   - Response generation: 0.4 (احتفاظ بالطابع البشري)
   - Never above 0.6 (يبقى غير predictable)

E. Forbidden patterns (config.aiAgent.personality.forbidden موجود — وسعه):
   - "آسف، ما أقدرش" (يستبدل بـ "تحت أمرك بس..." + alternative)
   - أسئلة rhetorical للعميل ("ايه رأيك؟")
   - استخدام >3 emojis في رسالة واحدة
   - وعود زمنية محددة ("هتوصلك بكرة" — استخدم "خلال X يوم تقريباً")
   - تقدير أسعار من غير tool call
   - الموافقة على خصم > tierDiscount بدون escalation

═══════════════════════════════════════════════════════════════════
🚧 الـ Constraints المطلقة
═══════════════════════════════════════════════════════════════════

❌ DO NOT modify الـ AIAgentPg.jsx tabs الموجودة — مجرد extensions
❌ DO NOT change INIT_CONFIG.aiAgent schema — هو الـ contract
❌ DO NOT touch الـ Campaign Engine في الـ Bridge (V19.28+) — independent
❌ DO NOT use the existing /api/ai.js for the agent — أنشئ namespace منفصل
   /api/ai-agent/* عشان الـ auth + rate limit + system prompt مختلفة
❌ DO NOT call Anthropic from CLARK frontend — كل الـ AI calls server-side
❌ DO NOT log full prompts in production (PII risk) — log meta only
❌ DO NOT skip HMAC على Bridge ↔ Vercel webhook — security critical
❌ DO NOT auto-execute tools that mutate Firestore — agent is READ-ONLY
   (كل aiAgent tools ضمن config.aiAgent.tools = read-only or generate)
❌ DO NOT skip the soft-launch via testMode — هو الـ safety net
❌ DO NOT exceed daily cost budget — kill switch must be enforced
❌ DO NOT respond outside the schedule unless explicitly configured

✅ Use Anthropic SDK with proper error handling + retries
✅ Stream responses where applicable (for UX)
✅ Log every Anthropic call with token counts + cost in aiAgentAnalytics
✅ Test each slice in isolation before merging
✅ Update CHANGELOG + WORK_LOG.md + AboutVersionModal.jsx per slice
✅ Follow CLAUDE.md §1 (Build/Test/Commit/Push/Zip protocol)

═══════════════════════════════════════════════════════════════════
🎯 الـ Output الأول (لـ Phase 0 + Phase 1)
═══════════════════════════════════════════════════════════════════

في الـ response الأول، اطبع بالترتيب:
1. ✅ تأكيد قراءة الملفات (list)
2. ✅ "Existing vs Missing" table
3. ✅ Clarifying questions (5-8)
4. ✅ Architecture proposal:
   - Component diagram
   - Sequence diagram (1-2 سيناريو)
   - File structure (new files list)
   - Tool definitions (Anthropic format)
   - Enhanced system prompt (Egyptian dialect)
   - Firestore schema
   - Cost budget estimate
   - Risk register
5. ✅ Slice plan (15-20 slices مع version numbers + complexity rating)
6. ✅ "أنتظر إجاباتك على الـ clarifying questions + 'نفذ' لـ Slice 1"

اشتغل بصبر وعمق. ده feature بـ surface area كبير جداً وتأثير على
الـ business model للمصنع (عملاء بيتكلموا مع agent ذكي = brand impression).
صاحب المصنع (Ahmed Samy) متاح للأسئلة على iPad/Working Copy.

ابدأ بـ PHASE 0 الآن.
````

---

## 💡 ملاحظات لـ Ahmed قبل ما تستخدم الـ برومبت

**ده أكبر فيتشر في الـ 5 برومبتات — لكن أهم واحد لو عاوز الـ Agent يشتغل فعلاً.**

**كيف تستخدمه على مراحل:**

1. **افتح شات Claude Code جديد** (الـ Sonnet أو Opus — Opus أفضل للـ planning، Sonnet كافي للـ slice execution)
2. **ارفع الـ زيب** + الـ برومبت ده
3. الـ AI هيرد بـ Phase 0 (Existing vs Missing) + 5-8 أسئلة + Phase 1 (Architecture)
4. **جاوب على الأسئلة بصراحة** — الأسئلة الحاسمة:
   - الـ budget اليومي بـ USD (هـ يحدد الـ model + cost guardrails)
   - Vercel ولا VPS للـ backend (أنصح Vercel)
   - Haiku ولا Sonnet ولا hybrid
5. لما تـ approve الـ architecture: "نفذ Slice 1" — وزيد slice ب slice

**النقاط الحرجة اللي ممكن يسألك الـ AI عنها:**

- **WhatsApp ban risk:** الـ Bridge بـ whatsapp-web.js مخالف لـ ToS. مع الـ incoming + outgoing الـ risk بيتضاعف. لازم تكون عارف ده وموافق. الحل الـ enterprise = WhatsApp Business API (Cloud API من Meta) — أمن لكن أغلى ومحتاج تسجيل business.
- **Anthropic API key:** هتحتاج توفر `ANTHROPIC_API_KEY` في Vercel env vars منفصل عن الـ key الموجود (لو موجود) للـ AI Helper.
- **Cost estimate:** افتراضياً 100 محادثة/يوم × ~10 turns × ~2000 tokens (in+out) × Haiku pricing = ~$2-5/يوم. Sonnet عشرة أضعاف. ابدأ بـ Haiku.
- **Soft launch:** الـ `testMode.whitelist` الموجود في config مهم جداً — استخدمه قبل ما تـ rollout كامل. أضف 5 عملاء موثوقين أولاً، اقعد معاهم أسبوع، عدّل، ثم open.

**نقطة "Suggest improvements" (Slice 20):**
ده بالظبط اللي طلبته في رسالتك — "اطلب من كلود يضيف اوبشانز وفيتشرز احترافية جديدة في الايجينت ممكن انا كمان معرفهاش". الـ Slice ده فيه meta-prompt يستهلك الـ config الحالي + آخر 100 محادثة ويطلع للـ admin اقتراحات بناءً على الـ actual patterns في الـ business بتاعك (مش guesses عامة).

---

## 📊 الـ 5 برومبتات الكاملة

| # | الملف | المشكلة/الفيتشر | Priority | Complexity |
|---|---|---|---|---|
| 1 | `مشكلة-الصلاحيات.md` | Rollback firestore.rules + autofix tool | 🔴 P0 | M |
| 2 | `مشكلة-اختفاء-بيانات-شوبيفاي.md` | Race condition partitioned listener | 🔴 P0 | L |
| 3 | `مشكلة-حلقة-المبيعات-والمشتريات.md` | Quote→Order→Invoice→Payment | 🟡 P2 | XL |
| 4 | `مشكلة-كشف-حساب-تراكمي.md` | Statement of Account view | 🟢 P3 | M |
| 5 | `مشكلة-AI-Agent-حقيقي.md` | Phase D backend + Bridge upgrade + Intelligence | 🟡 P2 | **XXL** |

**Recommended order:**
1. **الأسبوع 1:** Prompt 1 (الصلاحيات) — حرج، المستخدمين معطلين
2. **الأسبوع 2:** Prompt 2 (Shopify data) — حرج، data loss مستمر
3. **بعد كده:** اختر بين 3 و 5 حسب الأولوية:
   - لو عاوز نمو في المبيعات الجملة → 3 (Pipeline)
   - لو عاوز خدمة عملاء أوتوماتيكية → 5 (Agent) — لكن **متوقع 4-6 أسابيع شغل**
4. **في الآخر:** 4 (Statement) — أسهل، أصغر، add-only
