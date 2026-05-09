/* ═══════════════════════════════════════════════════════════════
   CLARK - Constants
   ثوابت التطبيق - مفصولة عن App.jsx في V15.0

   All pure (non-reactive, non-theme-dependent) constants live here.
   Theme constants (TH, TD, TDB, TDL, T) remain in App.jsx because
   they depend on the mutable T object which updates on theme change.
   ═══════════════════════════════════════════════════════════════ */

/* V19.50: Single source of truth for the app version. Used in topbar pills
   (desktop + mobile), the console marker on module load, and the About modal.
   Bump this constant once and the version label is consistent everywhere. */
export const APP_VERSION = "V19.84.1";

/* V19.80.3: extended fabric slots A→H (was A→E) so users can add more fabrics
   sequentially via the new "+ إضافة خامة" button in OrdForm. Existing orders
   without F/G/H simply read undefined for those slots — no schema migration. */
export const FKEYS = ["A","B","C","D","E","F","G","H"];

export const FCOL = ["#0EA5E9","#10B981","#F59E0B","#8B5CF6","#EF4444","#06B6D4","#84CC16","#EC4899"];

export const WS_TYPES=[
  {key:"خياطة خارجي",icon:"🏭",color:"#8B5CF6",internal:false},
  {key:"خياطة داخلي",icon:"🏠",color:"#0EA5E9",internal:true},
  {key:"تطريز",icon:"🪡",color:"#F59E0B",internal:false},
  {key:"طباعة",icon:"🖨",color:"#EF4444",internal:false},
  {key:"تشطيب وتعبئة خارجي",icon:"👔",color:"#10B981",internal:false},
  {key:"مخصص",icon:"⚙️",color:"#64748B",internal:false},
];

export const COLORS_DB = [
  {n:"ابيض",h:"#FFFFFF"},{n:"اسود",h:"#1a1a1a"},{n:"كحلي",h:"#1B2A4A"},{n:"رمادي",h:"#8B8B8B"},{n:"بيج",h:"#D4C5A9"},{n:"كريمي",h:"#FFF8DC"},
  {n:"احمر",h:"#C62828"},{n:"نبيتي",h:"#6A1B29"},{n:"برتقالي",h:"#E65100"},{n:"اصفر",h:"#F9A825"},{n:"زيتي",h:"#556B2F"},{n:"اخضر",h:"#2E7D32"},
  {n:"لبني",h:"#81D4FA"},{n:"سماوي",h:"#00ACC1"},{n:"ازرق",h:"#1565C0"},{n:"بنفسجي",h:"#6A1B9A"},{n:"موف",h:"#9C27B0"},{n:"روز",h:"#E91E63"},
  {n:"فوشيا",h:"#D81B60"},{n:"بني",h:"#5D4037"},{n:"كاكي",h:"#8D6E63"},{n:"منت",h:"#80CBC4"},{n:"مشمشي",h:"#FFAB91"},{n:"سلمون",h:"#EF9A9A"},
];

/* ── Theme System ── */
export const THEMES = {
  light:{name:"فاتح",bg:"#EFF6FF",card:"rgba(255,255,255,0.9)",cardSolid:"#FFF",glass:"rgba(255,255,255,0.6)",brd:"rgba(148,163,184,0.2)",brdStrong:"rgba(148,163,184,0.4)",text:"#1E293B",textSec:"#64748B",textMut:"#94A3B8",accent:"#0EA5E9",accentBg:"#E0F2FE",ok:"#10B981",err:"#EF4444",warn:"#F59E0B",purple:"#8B5CF6",shadow:"0 2px 12px rgba(0,0,0,0.04)",sidebarBg:"#FFF",inputBg:"#FFF",bodyBg:"#EFF6FF"},
  dark:{name:"داكن",bg:"#0C0C0E",card:"rgba(22,22,26,0.95)",cardSolid:"#16161A",glass:"rgba(22,22,26,0.85)",brd:"rgba(255,255,255,0.07)",brdStrong:"rgba(255,255,255,0.12)",text:"#ECECEC",textSec:"#8B8B8B",textMut:"#555555",accent:"#3B82F6",accentBg:"rgba(59,130,246,0.1)",ok:"#10B981",err:"#EF4444",warn:"#F59E0B",purple:"#A78BFA",shadow:"0 2px 16px rgba(0,0,0,0.4)",sidebarBg:"#111113",inputBg:"#1E1E22",bodyBg:"#0C0C0E"},
  pink:{name:"بينك شيك",bg:"#FFF0F5",card:"rgba(255,255,255,0.95)",cardSolid:"#FFF5F8",glass:"rgba(255,240,245,0.7)",brd:"rgba(236,72,153,0.15)",brdStrong:"rgba(236,72,153,0.3)",text:"#4A1942",textSec:"#9D4E8C",textMut:"#C084A8",accent:"#DB2777",accentBg:"#FCE7F3",ok:"#059669",err:"#E11D48",warn:"#D97706",purple:"#A855F7",shadow:"0 2px 12px rgba(236,72,153,0.08)",sidebarBg:"#FFF5F8",inputBg:"#FFF",bodyBg:"#FFF0F5"},
  odoo:{name:"أودو",bg:"#EFEDF0",card:"rgba(255,255,255,0.95)",cardSolid:"#FFFFFF",glass:"rgba(255,255,255,0.7)",brd:"rgba(113,75,103,0.12)",brdStrong:"rgba(113,75,103,0.25)",text:"#2C2C33",textSec:"#6B7280",textMut:"#9CA3AF",accent:"#714B67",accentBg:"#F3EDF2",ok:"#21B799",err:"#D94F70",warn:"#E4A93F",purple:"#714B67",shadow:"0 2px 10px rgba(113,75,103,0.06)",sidebarBg:"#FFFFFF",inputBg:"#FFFFFF",bodyBg:"#EFEDF0",navBg:"#714B67",navText:"#FFFFFF"}
};

export const DEFAULT_STATUSES = [
  {id:1,name:"تم القص",color:"#0EA5E9"},{id:2,name:"في التشغيل",color:"#F59E0B"},
  {id:3,name:"ملغي",color:"#EF4444"},{id:4,name:"في الغسيل",color:"#EC4899"},
  {id:5,name:"تشطيب وتعبئة",color:"#10B981"},{id:6,name:"تم التسليم لمخزن الجاهز",color:"#059669"},
  {id:7,name:"في مخزن الجاهز جزئي",color:"#D97706"},{id:8,name:"تشغيل خارجي",color:"#8B5CF6"},
  {id:9,name:"في الطباعة",color:"#EF4444"},{id:10,name:"في التطريز",color:"#F59E0B"},
  {id:11,name:"تشطيب وتعبئة خارجي",color:"#14B8A6"},
];

export const INIT_CONFIG = {
  fabrics:[{id:1,name:"قماش شعييرات مازيراتي",unit:"كيلو",price:170},{id:2,name:"قماش درببي مسحب ابيض",unit:"كيلو",price:170},{id:3,name:"قماش بسكوته تيشرت",unit:"كيلو",price:160},{id:4,name:"قماش كارس",unit:"متر",price:0},{id:5,name:"جبردين خفيف",unit:"متر",price:0}],
  accessories:[{id:1,name:"تشغيل من القص للتعبئة",unit:"قطعة",price:100},{id:2,name:"طباعة",unit:"قطعة",price:0},{id:3,name:"تطريز",unit:"قطعة",price:0},{id:4,name:"بادجات",unit:"قطعة",price:5},{id:5,name:"كباسين",unit:"قطعة",price:5},{id:6,name:"أستيك",unit:"قطعة",price:5},{id:7,name:"سوستة",unit:"قطعة",price:0},{id:8,name:"دوبار",unit:"قطعة",price:10},{id:9,name:"شماعة",unit:"قطعة",price:8},{id:10,name:"كفر",unit:"قطعة",price:3},{id:11,name:"كرتونة",unit:"قطعة",price:3},{id:12,name:"تكاليف أخرى",unit:"قطعة",price:10},{id:13,name:"تسويق",unit:"قطعة",price:10}],
  sizeSets:[{id:1,label:"6-9M - 9-12M - 12-18M"},{id:2,label:"2-3-4-5"},{id:3,label:"6-8-10-12"},{id:4,label:"M-L-XL-2XL"},{id:5,label:"L-XL-2XL-3XL"},{id:6,label:"FREE SIZE"},{id:7,label:"4-6-8-10-12"},{id:8,label:"S/L/M/XL"}],
  statusCards: DEFAULT_STATUSES,
  garmentTypes:[{id:1,name:"قميص"},{id:2,name:"شورت"},{id:3,name:"تيشيرت"},{id:4,name:"بنطلون"},{id:5,name:"شنطة"},{id:6,name:"جاكت"}],
  workshops:[{id:1,name:"CLARK",owner:"",phone:"",address:"",idCard:"",ownerPhoto:"",rating:8,type:"خياطة داخلي"},{id:2,name:"ورشة محمود",owner:"محمود",phone:"",address:"",idCard:"",ownerPhoto:"",rating:7,type:"خياطة خارجي"},{id:3,name:"المصنع",owner:"",phone:"",address:"",idCard:"",ownerPhoto:"",rating:9,type:"خياطة داخلي"}],
  seasons:["WS26"], activeSeason:"WS26", logo:"", users:{}, usersList:[],
  /* Collections — initialized empty to prevent accidental overwrite from losing them */
  wsPayments:[], notifications:[],
  customers:[], suppliers:[],
  treasury:[], treasuryAccounts:[], treasuryTransfers:[],
  custPayments:[], supplierPayments:[], checks:[], lockedDays:[],
  employees:[], hrLog:[], hrWeeks:[], empDebts:[], auditLog:[],
  /* Purchase module — Session 1 */
  stockMovements:[], purchaseReceipts:[], purchaseOrders:[],
  purchaseSettings:{
    stockEnabled:false,
    stockActivationDate:"",
    blockOnInsufficientStock:true,
    autoDeductOnCut:true,
    receiptPrefix:"REC-",
    poPrefix:"PO-",
    poDigits:3
  },
  /* Warehouse module — general products (Session A) */
  generalProducts:[],/* {id,name,category,unit,stock,minStock,avgCost,price,notes,lastMovementDate} */
  productCategories:["مستلزمات تشغيل","قطع غيار","خدمات","ورق وكرتون","مواد تنظيف","أخرى"],
  /* V19.76 — Product catalog (kids garments). The single source of truth
     for what CLARK manufactures. The AI Agent reads this to answer
     customer questions about models, sizes, colors, prices. Stored
     inline in factory/config so it loads with the rest of master data;
     images are base64-compressed thumbnails (kept small to stay under
     Firestore's 1 MB doc limit — admin gets a warning at 50+ items). */
  catalog: [],/* {id, code, name, nameEn, image, description, category,
                  season, sizes[], colors[], fabrics[], priceWholesale,
                  minOrderQty, inStock, notes, tags[], createdAt, updatedAt} */
  catalogCategories: ["ولادي", "بناتي", "بيبي", "junior", "أخرى"],
  /* V19.71: AI Agent control center config (Phase A — UI scaffold).
     The agent backend lives on a separate VPS Node.js project (clark-ai-agent).
     CLARK app is the configuration surface — this object is what the agent
     reads from Firestore at runtime (read-only on agent side, edit on CLARK
     admin side). Schema kept flat-ish so Firestore writes stay cheap. */
  aiAgent: {
    enabled: false,
    /* Schedule — when the agent answers customers */
    schedule: {
      mode: "specific",/* "specific" | "24x7" | "off" */
      timezone: "Africa/Cairo",
      days: {
        sat: { enabled: true,  from: "20:00", to: "10:00" },
        sun: { enabled: true,  from: "20:00", to: "10:00" },
        mon: { enabled: true,  from: "20:00", to: "10:00" },
        tue: { enabled: true,  from: "20:00", to: "10:00" },
        wed: { enabled: true,  from: "20:00", to: "10:00" },
        thu: { enabled: true,  from: "20:00", to: "10:00" },
        fri: { enabled: false, from: "20:00", to: "10:00" },
      },
      holidays: [],/* {id, name, from(YYYY-MM-DD), to} */
      offHoursMessage: "أهلاً بحضرتك. الفريق متاح من ٩ ص لـ ٥ م. هنرد بكرة بإذن الله.",
      offHoursBehavior: "answer_anyway",/* answer_anyway | say_we_reply | escalate_all */
      adminAlerts: {
        qualityComplaints: true,
        ordersAboveValue: 50000,
        platinumWaitMinutes: 10,
      },
    },
    /* Personality — tone + style + brand voice */
    personality: {
      name: "كلارك",
      language: "egyptian_polite",/* egyptian_polite | msa | bilingual */
      style: "professional_friendly",/* formal | professional_friendly | casual */
      answerLength: "medium",/* short | medium | long */
      emojiUse: "moderate",/* none | minimal | moderate | rich */
      greetings: ["أهلاً بحضرتك", "أهلاً وسهلاً"],
      closings: ["في خدمتك دايماً", "أي وقت محتاج"],
      forbidden: ["emojis كثيرة (>3)", "وعد بتسليم بدون تحقق", "خصومات استثنائية بدون موافقة"],
      systemPrompt: "أنت \"كلارك\"، المساعد الذكي الرسمي لمصنع كلارك للملابس الأطفال.\nأنت موظف مبيعات افتراضي محترف، تتعامل مع عملاء جملة فقط.\n\n⚠️ القاعدة الذهبية: READ-ONLY — لا تكتب، لا تعدّل، لا تحذف أي بيانات.\n\nشخصيتك:\n- مهني وودود — عامية مصرية مهذبة\n- مختصر — 2-4 جمل عادةً\n- صادق — لو ما تعرفش، حوّل لمسؤول\n- محترم — استخدم \"حضرتك\" و \"أ/\" قبل الاسم\n\nالقواعد:\n1. لا تخترع أرقام — أي سعر/رصيد/طلب لازم من tool\n2. لا تلتزم بـ commitments — تواريخ تسليم، خصومات، شروط دفع\n3. حماية بيانات العملاء — ما تعرضش بيانات عميل لرقم غير مالكه\n4. خارج النطاق — السياسة، الدين، المنافسين، شؤون شخصية\n5. التحويل لبشري — شكوى جودة، عميل غاضب، طلب >100K، تعديل فاتورة قائمة",
    },
    /* FAQs — agent uses these to answer common questions */
    faqs: [],/* {id, title, category, phrasings[], answer, variables[], useCount, createdAt} */
    faqCategories: ["الشحن", "الدفع", "الإرجاع", "المنتجات", "الخصومات", "الشركة", "أخرى"],
    /* Tools — phase A scaffold, real config in phase B */
    tools: {
      get_customer_info: { enabled: true },
      search_products:   { enabled: true, includePricing: true, includeStock: true, includeImages: true, maxResults: 5 },
      get_customer_balance: { enabled: true },
      get_customer_orders:  { enabled: true },
      get_order_details:    { enabled: true },
      get_faq_answer:       { enabled: true },
      generate_portal_link: { enabled: true, ttlHours: 24 },
      generate_statement_pdf: { enabled: true, businessHoursOnly: true },
      notify_sales_team: { enabled: true, maxValueBeforeManual: 100000 },
      notify_admin_phone_request: { enabled: true, requiresOtp: true },
      escalate_to_human: { enabled: true },
      send_otp: { enabled: true, ttlMin: 5, maxAttempts: 3 },
      verify_otp: { enabled: true },
    },
    /* V19.75 — Test mode (whitelist gate). Critical for soft launch:
       admin enables a small list of friendly customers; everyone else
       gets the configured "system under maintenance" canned reply (or
       silence). The agent backend's availability gate enforces this
       BEFORE running any LLM call, so non-whitelisted senders cost $0. */
    testMode: {
      enabled: false,
      whitelist: [],/* {id, wid, label, addedAt}. wid format: "201XXX@c.us" or raw "XXX@lid" */
      outsideBehavior: "canned",/* canned | silent */
      outsideMessage: "أهلاً بحضرتك. النظام تحت اختبار محدود حالياً، الفريق هيرد عليك بكرة بإذن الله.",
    },
    /* Tier discounts (default per spec) */
    tierDiscounts: { Bronze: 0, Silver: 3, Gold: 5, Platinum: 8 },
    /* V19.73 — Tier thresholds (annual purchases, EGP) — used by funnel viz
       to compute "approaching tier-up" + by backend to assign tiers. */
    tierThresholds: { Bronze: 0, Silver: 50000, Gold: 200000, Platinum: 500000 },
    /* V19.73 — Stage-transition auto-approval config. Per spec, the agent
       SUGGESTS transitions; admin APPROVES. For low-risk transitions admin
       can opt to auto-approve. Decision→Customer is intentionally manual
       since it represents a real commitment (a confirmed order). */
    stageTransitionAutoApprove: {
      strangerToAwareness: true,
      awarenessToInterest: true,
      interestToDecision:  false,
      decisionToCustomer:  false,
      customerToRepeat:    true,
      customerToDormant:   true,
    },
    /* Escalation routing */
    escalation: {
      supportPhone: "",/* primary human-support WhatsApp number */
      salesTeamPhone: "",/* sales team group/number */
      template: "🆘 تحويل عاجل\n👤 {customerName} | 📞 {phone}\n🏆 Tier: {tier} | 📊 Stage: {stage}\n💬 السبب: {reason}\n",
      autoTriggers: {
        qualityComplaint: true,
        orderAbove100k: true,
        angryCustomer: true,
        outOfScope: true,
        platinumCustomer: true,
      },
    },
    /* Agent-only collections meta — for phase B logs UI */
    collections: {
      conversations: "aiAgentConversations",
      escalations: "aiAgentEscalations",
      salesNotifications: "aiAgentSalesNotifications",
      suggestions: "aiAgentSuggestions",
      analytics: "aiAgentAnalytics",
    },
  },
  permissions:{
    admin:{dashboard:"edit",details:"edit",external:"edit",stock:"edit",reports:"edit",calc:"edit",tasks:"edit",db:"edit",settings:"edit",custDeliver:"edit",treasury:"edit",hr:"edit",purchase:"edit",warehouse:"edit"},
    manager:{dashboard:"edit",details:"edit",external:"edit",stock:"edit",reports:"edit",calc:"edit",tasks:"edit",db:"edit",settings:"hide",custDeliver:"edit",treasury:"view",hr:"view",purchase:"edit",warehouse:"edit"},
    sales_accountant:{dashboard:"view",details:"view",external:"hide",stock:"view",reports:"edit",calc:"hide",tasks:"edit",db:"hide",settings:"hide",custDeliver:"edit",treasury:"hide",hr:"hide",purchase:"hide",warehouse:"view"},
    purchase_accountant:{dashboard:"view",details:"view",external:"edit",stock:"edit",reports:"edit",calc:"edit",tasks:"edit",db:"edit",settings:"hide",custDeliver:"hide",treasury:"edit",hr:"hide",purchase:"edit",warehouse:"edit"},
    viewer:{dashboard:"view",details:"view",external:"hide",stock:"hide",reports:"view",calc:"view",tasks:"edit",db:"hide",settings:"hide",custDeliver:"hide",treasury:"hide",hr:"hide",purchase:"view",warehouse:"view"}
  },
};

export const GARMENT_ICONS=["👕","👔","👗","👖","🩳","🧥","👚","🦺","👜","🎒","💼","🧢","🧦","🩲","🩱","👙","🧤","🧣","👘","🥼","🩴","👞","👟","👠","👡","👢","🥾","⛑️"];

export const QUALITY_MAP={"ممتاز":10,"جيد جداً":8,"جيد":6,"مقبول":4,"سئ":2};

export const FS=13;

export const PRINT_CSS="*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Cairo',Arial,sans-serif;padding:24px 28px;font-size:12px;direction:rtl;color:#1E293B;line-height:1.5}.hdr{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #0284C7;padding-bottom:12px;margin-bottom:20px}.hdr img{height:26px}.hdr-info{text-align:left;font-size:11px;color:#475569;font-weight:700}h2{font-size:15px;color:#0284C7;margin:14px 0 8px;padding-bottom:4px;border-bottom:2px solid #E2E8F0}h3{font-size:13px;color:#334155;margin:10px 0 6px}table{width:100%;border-collapse:collapse;margin:8px 0 14px;border:1px solid #94A3B8}th{background:linear-gradient(180deg,#E2E8F0,#CBD5E1);font-weight:800;font-size:10px;color:#1E293B;padding:5px 8px;text-align:right;border:1px solid #94A3B8;letter-spacing:0.3px}td{padding:4px 8px;text-align:right;border:1px solid #CBD5E1;font-size:11px}tr:nth-child(even){background:#F8FAFC}tr:hover{background:#EFF6FF}.info{font-weight:700;color:#0284C7}.ok{color:#10B981;font-weight:700}.err{color:#EF4444;font-weight:700}.warn{color:#F59E0B;font-weight:700}.sig{margin-top:40px;display:flex;justify-content:space-around;gap:20px}.sig-box{text-align:center;min-width:150px;border-top:2px solid #1E293B;padding-top:10px;font-weight:700;font-size:12px}.badge{display:inline-block;padding:2px 10px;border-radius:6px;font-size:10px;font-weight:700;margin:2px}.foot{margin-top:30px;padding-top:10px;border-top:1px solid #CBD5E1;text-align:center;font-size:9px;color:#94A3B8;font-weight:600}@media print{body{padding:12px}table{page-break-inside:auto}tr{page-break-inside:avoid}@page{margin:12mm;@bottom-center{content:counter(page)' / 'counter(pages)}}}";
