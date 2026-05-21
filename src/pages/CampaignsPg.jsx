/* ═══════════════════════════════════════════════════════════════════════
   CLARK · CampaignsPg (V19.19, expanded V19.28)
   ───────────────────────────────────────────────────────────────────────
   Bulk messaging engine for sending personalized WhatsApp messages to
   customer segments.

   V19.28: Two send modes now available:
     1. MANUAL (default): Click-through workflow — CLARK prepares queue,
        employee taps "Send next" to open WhatsApp pre-filled with each
        message. Safe, legal, manual.
     2. BRIDGE (new): Auto-send via local Node.js whatsapp-web.js bridge.
        Fast, automated, but violates WhatsApp ToS — use a secondary
        number. See clark-wa-bridge/ for the bridge service.

   Architecture:
   - Modes: list · templateEdit · newCampaign · chooseSendMode · send · sendBridge · bridgeSettings
   - Templates stored at data.campaignTemplates[] (cap 30)
   - Campaign log stored at data.campaigns[] (cap 50, summary only)
   - Bridge config stored at data.campaignBridge {url, enabled, delays, caps}
   - Per-customer items NOT persisted — kept in React state during send
   - Personalization via {placeholder} substitution at send time
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo, useEffect, useRef } from "react";
import { FS } from "../constants/index.js";
import { gid, fmt, r2, openWA } from "../utils/format.js";
import { ask, showToast } from "../utils/popups.js";
import { Btn, Inp, Sel, Card } from "../components/ui.jsx";
import { T, TH, TD } from "../theme.js";
import { analyzeCustomer } from "../utils/customerAnalytics.js";
import { auth } from "../firebase.js"; /* V19.32: for portal URL generation */
/* V21.9.132: tag-based + entity-type-based audience filtering */
import { filterByTags } from "../utils/tags.js";
import { TagFilter } from "../components/TagFilter.jsx";
/* V19.35: Template images live in Firebase Storage now (was: base64 in factory/config doc) */
/* V19.38: Plus generic attachments (PDFs, docs, video, audio, ZIP) */
import {
  uploadTemplateImageFile,
  uploadTemplateImageBlob,
  deleteTemplateImage,
  hasLegacyBase64,
  legacyBase64Size,
  migrateTemplateImages,
  uploadTemplateAttachmentFile,
  deleteTemplateAttachment,
  getFileIcon,
  formatFileSize,
  classifyMime,
  WA_MAX_BY_KIND,
} from "../utils/templateImages.js";

const MAX_TEMPLATES = 30;
const MAX_CAMPAIGNS = 50;
const MAX_AUDIENCE = 200;
const DEFAULT_DELAY_SEC = 3;
const DEFAULT_DAILY_CAP = 50;

/* V19.28: Bridge integration constants */
const DEFAULT_BRIDGE_URL = "http://localhost:3001";
const BRIDGE_POLL_MS = 2500;

/* V19.28: Bridge HTTP client — small wrapper around fetch
   V19.30: Now supports optional auth token (Bearer) */
async function bridgeFetch(url, path, opts = {}, token){
  const base = (url || "").replace(/\/+$/, "");
  if(!base)throw new Error("Bridge URL not set");
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), opts.timeout || 8000);
  try {
    const headers = {};
    if(opts.body) headers["Content-Type"] = "application/json";
    if(token) headers["Authorization"] = "Bearer " + token;
    const r = await fetch(base + path, {
      method: opts.method || "GET",
      headers: Object.keys(headers).length ? headers : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
    });
    clearTimeout(timeout);
    if(r.status === 401) throw new Error("Unauthorized — تأكد من Auth Token");
    if(!r.ok)throw new Error("HTTP "+r.status);
    return await r.json();
  } catch(e) {
    clearTimeout(timeout);
    throw e;
  }
}
const bridge = {
  status:   (url, token)              => bridgeFetch(url, "/status",   {timeout: 4000}, token),
  queue:    (url, token)              => bridgeFetch(url, "/queue", {}, token),
  send:     (url, messages, token)    => bridgeFetch(url, "/send",     {method:"POST", body:{messages}, timeout: 15000}, token),
  pause:    (url, token)              => bridgeFetch(url, "/pause",    {method:"POST"}, token),
  resume:   (url, token)              => bridgeFetch(url, "/resume",   {method:"POST"}, token),
  stop:     (url, token)              => bridgeFetch(url, "/stop",     {method:"POST"}, token),
  clear:    (url, token)              => bridgeFetch(url, "/clear",    {method:"POST"}, token),
  settings: (url, s, token)           => bridgeFetch(url, "/settings", {method:"POST", body:s}, token),
  optouts:  (url, token)              => bridgeFetch(url, "/optouts", {}, token),
  optoutAdd:(url, phone, token)       => bridgeFetch(url, "/optouts/add",    {method:"POST", body:{phone}}, token),
  optoutRm: (url, phone, token)       => bridgeFetch(url, "/optouts/remove", {method:"POST", body:{phone}}, token),
  logout:   (url, token)              => bridgeFetch(url, "/logout",   {method:"POST"}, token),
  /* V19.37: One-click repair — server-side runs destroy → sweep Singleton locks → reinit */
  repair:   (url, token)              => bridgeFetch(url, "/repair",   {method:"POST", timeout: 10000}, token),
  /* V19.31: New endpoints */
  activity: (url, token, limit=50)    => bridgeFetch(url, "/activity?limit="+limit, {}, token),
  qr:       (url, token)              => bridgeFetch(url, "/qr", {}, token),
  test:     (url, phone, message, token) => bridgeFetch(url, "/test-message", {method:"POST", body:{phone,message}}, token),
  resetDaily:(url, token)             => bridgeFetch(url, "/reset-daily", {method:"POST"}, token),
  optoutBulk:(url, phones, token)     => bridgeFetch(url, "/optouts/bulk-add", {method:"POST", body:{phones}}, token),
  stats:    (url, token)              => bridgeFetch(url, "/stats", {}, token),
};

/* Personalization variables — surface in template editor and substitute at send */
const VARIABLES = [
  { token: "{اسم}",        label: "اسم العميل",      example: "أحمد محمد" },
  { token: "{رصيد}",       label: "رصيد العميل (ج.م)", example: "1,250" },
  { token: "{آخر دفعة}",  label: "تاريخ آخر دفعة",  example: "2026-04-15" },
  { token: "{مبلغ آخر دفعة}", label: "مبلغ آخر دفعة", example: "500" },
  { token: "{عدد الأوردرات}", label: "عدد الأوردرات",  example: "12" },
  { token: "{رقم الجوال}", label: "رقم الجوال",      example: "01001234567" },
  /* V19.32: Portal link — auto-generated per customer via /api/customer-portal-sign */
  { token: "{لينك}",       label: "🔗 لينك حساب العميل (Portal)", example: "https://clark.../?p=c&i=...&s=..." },
];

/* V19.33: Starter templates — shown when user has no templates yet.
   Two examples covering both modes: a clean text-only template for manual mode
   and an image-rich template for Bridge mode. */
const STARTER_TEMPLATES = [
  {
    icon: "👆",
    name: "تذكير دفع (يدوي)",
    category: "تذكير دفع",
    description: "للوضع اليدوي — رسالة احترافية بدون صور، مع لينك حساب العميل",
    body: "السلام عليكم {اسم} 🌷\n\nنحب نذكّركم إن متبقي عليكم رصيد قدره {رصيد} ج.م.\n\nتقدروا تشوفوا تفاصيل الحساب من اللينك ده:\n{لينك}\n\nبرجاء التواصل معانا لتحديد ميعاد السداد، وشكراً لتعاملكم 🙏",
  },
  {
    icon: "📷",
    name: "عرض جديد بالصور (Bridge)",
    category: "تسويق",
    description: "للوضع التلقائي (Bridge) — رسالة بصور المنتجات كـ attachment. ارفع الصور بعد الإضافة.",
    body: "أهلاً {اسم} 👋\n\nوصلتنا تشكيلة جديدة من قطع الديكور والأنتيكا 🌟\n\nاتفرّج على الصور وقولنا اللي عجبك — هنحجزهالك فوراً.\n\nشاهد تفاصيل حسابك:\n{لينك}\n\nمستنينك! 🌷",
  },
];

/* V21.9.132: Segments simplified — removed balance_due / recent_delivery /
   inactive per user request. Audience now spans ALL contact types (customer,
   supplier, workshop, employee), with type + tag filters applied separately. */
const SEGMENTS = [
  { key: "all",    label: "كل جهات الاتصال", icon: "👥", needsParam: false },
  { key: "manual", label: "اختيار يدوي",        icon: "✏️", needsParam: false },
];

/* V21.9.132: 4 entity types eligible for campaigns — each maps to its
   own table in factory/config (partitioned per V19.57). Phone is the
   required field — entities without phone are excluded. */
const ENTITY_TYPES = [
  { key: "customer", label: "عميل",  icon: "👥", color: "#3B82F6", table: "customers" },
  { key: "supplier", label: "مورد",  icon: "🏪", color: "#F59E0B", table: "suppliers" },
  { key: "workshop", label: "ورشة", icon: "🔨", color: "#8B5CF6", table: "workshops" },
  { key: "employee", label: "موظف", icon: "👤", color: "#10B981", table: "employees" },
];
const ALL_TYPE_KEYS = ENTITY_TYPES.map(t => t.key);

/* ─── Helpers ─── */
const cleanPhone = (ph) => {
  if(!ph)return "";
  let p = String(ph).replace(/[^0-9]/g,"");
  if(p.startsWith("00"))p = p.slice(2);
  if(p.startsWith("0"))p = "20" + p.slice(1);
  if(p.length === 11 && p.startsWith("1"))p = "20" + p;
  return p;
};

const personalize = (body, ctx) => {
  if(!body)return "";
  return body
    .replace(/\{اسم\}/g, ctx.name || "العميل")
    .replace(/\{رصيد\}/g, fmt(ctx.balance || 0))
    .replace(/\{آخر دفعة\}/g, ctx.lastPaymentDate || "—")
    .replace(/\{مبلغ آخر دفعة\}/g, fmt(ctx.lastPaymentAmount || 0))
    .replace(/\{عدد الأوردرات\}/g, String(ctx.orderCount || 0))
    .replace(/\{رقم الجوال\}/g, ctx.phone || "")
    /* V19.32: Portal link — pre-generated via portalUrlBatch() before send */
    .replace(/\{لينك\}/g, ctx.portalUrl || "");
};

/* V19.32: Generate portal URLs in batch for an audience.
   Calls /api/customer-portal-sign for each customer (admin token required).
   Returns map: {custId: portalUrl}. Failed lookups are skipped (link will be empty).
   Concurrency: 5 at a time to avoid overwhelming the API. */
async function portalUrlBatch(custIds, onProgress){
  const result = {};
  const user = auth.currentUser;
  if(!user) throw new Error("يرجى تسجيل الدخول");
  const adminToken = await user.getIdToken();

  const total = custIds.length;
  let done = 0;
  const concurrency = 5;
  const queue = [...custIds];

  async function worker(){
    while(queue.length > 0){
      const custId = queue.shift();
      try {
        const res = await fetch("/api/customer-portal-sign", {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({custId, adminToken}),
        });
        if(res.ok){
          const json = await res.json();
          if(json.url) result[custId] = json.url;
        }
      } catch {}
      done++;
      if(onProgress) onProgress(done, total);
    }
  }

  await Promise.all(Array.from({length: concurrency}, () => worker()));
  return result;
}

const todayStr = () => new Date().toISOString().slice(0,10);
/* V21.9.132: removed daysAgo() — was only used by the deleted segments
   (balance_due / recent_delivery / inactive). */

/* V21.9.132: Build a unified pool of entities across customers + suppliers +
   workshops + employees. Each pool item is tagged with `_entityType` (the
   table it came from) so downstream code (filter UI, manual list, context
   builder) can distinguish entity types. Excludes archived + phoneless. */
function buildEntityPool(data, allowedTypeKeys){
  const allowed = (allowedTypeKeys && allowedTypeKeys.length > 0) ? allowedTypeKeys : ALL_TYPE_KEYS;
  const pool = [];
  for(const t of ENTITY_TYPES){
    if(!allowed.includes(t.key)) continue;
    const list = Array.isArray(data && data[t.table]) ? data[t.table] : [];
    for(const e of list){
      if(!e || !e.phone) continue;
      if(e.archived === true) continue;  /* customers may have archived flag */
      pool.push({
        ...e,
        _entityType: t.key,
        _entityLabel: t.label,
        _entityIcon: t.icon,
      });
    }
  }
  return pool;
}

/* Build audience array from a segment definition.
   V19.29: Automatically excludes entities in data.campaignBlocklist[]
   V21.9.132: Spans all entity types (was: customers only). Honors
   `params.entityTypes` (default all) + `params.tagFilter` (default empty). */
function buildAudience(data, segment){
  if(!segment || !segment.key) return [];

  const allowedTypes = Array.isArray(segment.params?.entityTypes) && segment.params.entityTypes.length > 0
    ? segment.params.entityTypes
    : ALL_TYPE_KEYS;
  const tagIds  = Array.isArray(segment.params?.tagFilter) ? segment.params.tagFilter : [];
  const tagMode = segment.params?.tagMode === "AND" ? "AND" : "OR";

  /* V19.29 blocklist — keyed by id OR phone (canonical) */
  const blocked = new Set();
  (data.campaignBlocklist||[]).forEach(b => {
    if(b.id) blocked.add(b.id);
    if(b.phone) blocked.add(cleanPhone(b.phone));
  });
  const notBlocked = (e) => !blocked.has(e.id) && !blocked.has(cleanPhone(e.phone));

  let pool = buildEntityPool(data, allowedTypes).filter(notBlocked);

  /* Apply tag filter — works across all entity types since `filterByTags`
     just reads entity.tags */
  if(tagIds.length > 0){
    pool = filterByTags(pool, tagIds, tagMode);
  }

  if(segment.key === "manual"){
    const ids = new Set((segment.params?.ids || []).map(String));
    pool = pool.filter(e => ids.has(String(e.id)));
  }
  /* "all" → no further filter; legacy segment keys (balance_due/recent_delivery/
     inactive) silently fall through to empty until removed from history. */

  return pool.map(e => buildContext(e, data));
}

/* Build the personalization context for an entity.
   V21.9.132: Now polymorphic — full analytics only for customers; other
   entity types get basic context (name, phone, type) with customer-specific
   fields defaulting to 0/empty so personalize() degrades gracefully. */
function buildContext(entity, data){
  const ctx = {
    id: entity.id,
    name: entity.name || "العميل",
    phone: entity.phone || "",
    /* V21.9.132: surface entity type for UI display + analytics */
    entityType: entity._entityType || "customer",
    entityLabel: entity._entityLabel || "عميل",
    /* Customer-specific personalization fields — default values keep
       {رصيد}, {آخر دفعة}, etc. rendering as 0 / "" for non-customers. */
    balance: 0,
    lastPaymentDate: "",
    lastPaymentAmount: 0,
    orderCount: 0,
    lastDeliveryDate: null,
    lastOrderDate: null,
    /* Tags carried through so downstream features (filtering, display) can use them */
    tags: Array.isArray(entity.tags) ? entity.tags.slice() : [],
  };

  if(ctx.entityType === "customer"){
    const analytics = analyzeCustomer(entity.id, data);
    const orders = (data.orders||[]).filter(o => o.custId === entity.id);
    let lastDeliveryDate = null, lastOrderDate = null;
    orders.forEach(o => {
      const oDate = o.poDate || o.createdAt?.slice(0,10);
      if(oDate && (!lastOrderDate || oDate > lastOrderDate)) lastOrderDate = oDate;
      (o.deliveriesToCust||[]).forEach(d => {
        if(d.date && (!lastDeliveryDate || d.date > lastDeliveryDate)) lastDeliveryDate = d.date;
      });
    });
    ctx.balance = analytics?.finance?.balance || 0;
    ctx.lastPaymentDate = analytics?.finance?.lastPaymentDate || "";
    ctx.lastPaymentAmount = analytics?.finance?.lastPaymentAmount || 0;
    ctx.orderCount = analytics?.sales?.orderCount || 0;
    ctx.lastDeliveryDate = lastDeliveryDate;
    ctx.lastOrderDate = lastOrderDate;
  }

  return ctx;
}

/* Count campaigns sent today (for daily cap) */
function countSentToday(data){
  const today = todayStr();
  return (data.campaigns||[])
    .filter(c => (c.completedAt||"").startsWith(today) || (c.createdAt||"").startsWith(today))
    .reduce((sum,c) => sum + (c.sentCount||0), 0);
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════ */
export function CampaignsPg({data, upConfig, isMob, canEdit, user}){
  const [mode, setMode] = useState("list"); /* list · templateEdit · newCampaign · chooseSendMode · send · sendBridge · bridgeSettings · blocklist */
  const [editingTpl, setEditingTpl] = useState(null);
  const [activeCampaign, setActiveCampaign] = useState(null); /* {template, audience, segment} */
  /* V19.28: Bridge settings — read from data.campaignBridge (factory/config) */
  const bridgeCfg = data.campaignBridge || {};
  const bridgeUrl = bridgeCfg.url || DEFAULT_BRIDGE_URL;
  const bridgeToken = bridgeCfg.token || "";
  /* V19.29: Campaign detail modal state */
  const [viewingCampaign, setViewingCampaign] = useState(null);

  const templates = data.campaignTemplates || [];
  const campaigns = data.campaigns || [];

  /* V19.35: Migration state — for templates that still hold base64 images
     (legacy V19.33-V19.34). Surfaces as a banner + "Migrate now" button on
     the Templates list. */
  const [migrating, setMigrating] = useState(false);
  const [migrateProgress, setMigrateProgress] = useState({ done: 0, total: 0 });
  const [migrateError, setMigrateError] = useState("");

  const legacyTemplates = useMemo(
    () => templates.filter(hasLegacyBase64),
    [templates]
  );
  const legacyTotalKB = useMemo(
    () => Math.round(legacyTemplates.reduce((s, t) => s + legacyBase64Size(t), 0) / 1024),
    [legacyTemplates]
  );

  /* Run migration for all legacy templates. Each template's images are
     re-uploaded to Storage one-by-one, then the parent doc is updated to
     replace base64 with {storagePath, url, ...}. We update Firestore once
     per template so each write is small and the doc shrinks progressively
     (critical when factory/config is already at the 1MB ceiling). */
  const runMigration = async () => {
    setMigrateError("");
    setMigrating(true);
    setMigrateProgress({ done: 0, total: legacyTemplates.length });
    let success = 0;
    for(const tpl of legacyTemplates){
      try {
        const newImages = await migrateTemplateImages(tpl);
        upConfig(d => {
          if(!Array.isArray(d.campaignTemplates)) return;
          const idx = d.campaignTemplates.findIndex(x => x.id === tpl.id);
          if(idx >= 0){
            d.campaignTemplates[idx] = {
              ...d.campaignTemplates[idx],
              images: newImages,
              migratedAt: new Date().toISOString(),
            };
          }
        });
        success++;
      } catch(e){
        console.error("[V19.35] migration failed for template", tpl.id, e);
        setMigrateError(`فشل ترحيل قالب "${tpl.name}": ${e?.message || e}`);
      }
      setMigrateProgress({ done: success, total: legacyTemplates.length });
    }
    setMigrating(false);
    if(success > 0){
      showToast(`✓ ترحيل ${success} قالب — مساحة Firestore اتفرغت`);
    }
  };

  /* ─────────────── TEMPLATE EDITOR ─────────────── */
  if(mode === "templateEdit"){
    return <TemplateEditor
      tpl={editingTpl}
      canEdit={canEdit}
      onCancel={() => { setEditingTpl(null); setMode("list"); }}
      onSave={(t) => {
        upConfig(d => {
          if(!Array.isArray(d.campaignTemplates))d.campaignTemplates = [];
          if(t.id){
            const idx = d.campaignTemplates.findIndex(x => x.id === t.id);
            if(idx >= 0)d.campaignTemplates[idx] = {...d.campaignTemplates[idx], ...t, updatedAt: new Date().toISOString()};
          }else{
            if(d.campaignTemplates.length >= MAX_TEMPLATES){
              showToast("⚠️ وصلت الحد الأقصى للقوالب ("+MAX_TEMPLATES+")");
              return;
            }
            d.campaignTemplates.unshift({...t, id: "tpl_"+gid(), createdAt: new Date().toISOString(), createdBy: user?.email||""});
          }
        });
        setEditingTpl(null);
        setMode("list");
        showToast("✓ تم الحفظ");
      }}
    />;
  }

  /* V19.29: ─────────────── BLOCKLIST PAGE ─────────────── */
  if(mode === "blocklist"){
    return <BlocklistPage
      data={data}
      upConfig={upConfig}
      canEdit={canEdit}
      onClose={() => setMode("list")}
    />;
  }

  /* ─────────────── NEW CAMPAIGN WIZARD ─────────────── */
  if(mode === "newCampaign"){
    return <NewCampaignWizard
      data={data}
      templates={templates}
      onCancel={() => setMode("list")}
      onLaunch={(tpl, segment, audience) => {
        setActiveCampaign({template: tpl, segment, audience});
        /* V19.28: instead of jumping straight to manual send, ask user which mode */
        setMode("chooseSendMode");
      }}
    />;
  }

  /* V19.28: ─────────────── CHOOSE SEND MODE ─────────────── */
  if(mode === "chooseSendMode" && activeCampaign){
    return <ChooseSendMode
      campaign={activeCampaign}
      bridgeUrl={bridgeUrl}
      bridgeToken={bridgeToken}
      onCancel={() => { setActiveCampaign(null); setMode("list"); }}
      onPickManual={() => setMode("send")}
      onPickBridge={() => setMode("sendBridge")}
      onOpenBridgeSettings={() => setMode("bridgeSettings")}
      /* V19.70.4: schedule-for-later — save to data.scheduledCampaigns and return to list
         V19.70.5: also receives images[] from the picker UI (max 4, ≤200KB each)
         V19.70.6: also receives recurrence object for repeating campaigns */
      onPickScheduled={(scheduledAt, images = [], recurrence = null) => {
        const sc = {
          id: "sched_" + gid(),
          templateId: activeCampaign.template.id,
          templateName: activeCampaign.template.name,
          templateBody: activeCampaign.template.body || "",
          segmentKey: activeCampaign.segment.key,
          segmentLabel: activeCampaign.segment.label,
          /* Snapshot the audience now so segment changes later don't affect this campaign */
          items: activeCampaign.audience.map(c => ({
            id: c.id, name: c.name, phone: c.phone,
          })),
          scheduledAt,/* first fire ISO; updated on each fire to next occurrence */
          status: "scheduled",/* "scheduled" | "firing" | "done" | "failed" | "cancelled" */
          createdAt: new Date().toISOString(),
          createdBy: user?.email || "",
          sendMode: "bridge",
          /* V19.70.5: images attached inline (each {name, mime, base64, size}). */
          images: Array.isArray(images) ? images.map(img => ({
            name: img.name, mime: img.mime, base64: img.base64,
          })) : [],
          /* V19.70.6: recurrence — null for "once", object for repeating campaigns */
          recurrence,
          occurrenceCount: 0,
          lastFiredAt: null,
          sentCount: 0,
          failedCount: 0,
        };
        upConfig(d => {
          if (!Array.isArray(d.scheduledCampaigns)) d.scheduledCampaigns = [];
          d.scheduledCampaigns.unshift(sc);
          d.scheduledCampaigns = d.scheduledCampaigns.slice(0, 100);/* cap */
        });
        setActiveCampaign(null);
        setMode("scheduledList");
        showToast("✓ تم جدولة الحملة لـ" + new Date(scheduledAt).toLocaleString("ar-EG"));
      }}
    />;
  }

  /* V19.70.4: ─────────────── SCHEDULED CAMPAIGNS LIST ─────────────── */
  if(mode === "scheduledList"){
    return <ScheduledCampaignsList
      data={data}
      upConfig={upConfig}
      onClose={() => setMode("list")}
      canEdit={canEdit}
    />;
  }

  /* V19.28: ─────────────── BRIDGE SETTINGS ─────────────── */
  if(mode === "bridgeSettings"){
    return <BridgeSettings
      bridgeCfg={bridgeCfg}
      canEdit={canEdit}
      onSave={(newCfg) => {
        upConfig(d => { d.campaignBridge = newCfg; });
        showToast("✓ تم حفظ إعدادات البريدج");
        setMode(activeCampaign ? "chooseSendMode" : "list");
      }}
      onClose={() => setMode(activeCampaign ? "chooseSendMode" : "list")}
    />;
  }

  /* V19.28: ─────────────── BRIDGE SEND ─────────────── */
  if(mode === "sendBridge" && activeCampaign){
    return <BridgeSendScreen
      data={data}
      upConfig={upConfig}
      user={user}
      bridgeUrl={bridgeUrl}
      bridgeToken={bridgeToken}
      template={activeCampaign.template}
      segment={activeCampaign.segment}
      audience={activeCampaign.audience}
      onOpenSettings={() => setMode("bridgeSettings")}
      onClose={() => { setActiveCampaign(null); setMode("list"); }}
    />;
  }

  /* ─────────────── SEND (ASSEMBLY-LINE) ─────────────── */
  if(mode === "send" && activeCampaign){
    return <SendScreen
      data={data}
      upConfig={upConfig}
      user={user}
      template={activeCampaign.template}
      segment={activeCampaign.segment}
      audience={activeCampaign.audience}
      onClose={() => { setActiveCampaign(null); setMode("list"); }}
    />;
  }

  /* ─────────────── DEFAULT: LIST VIEW ─────────────── */
  return <div style={{padding:isMob?12:16}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
      <h2 style={{margin:0,fontSize:FS+4,fontWeight:900,color:T.text,display:"flex",alignItems:"center",gap:8}}>
        <span>📣</span><span>الحملات والرسائل الجماعية</span>
      </h2>
      {canEdit && <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        <Btn small onClick={() => setMode("blocklist")} style={{background:T.err+"10",color:T.err,border:"1px solid "+T.err+"30"}} title="قائمة العملاء المحظورين">
          🚫 محظورين {(data.campaignBlocklist||[]).length>0?"("+(data.campaignBlocklist||[]).length+")":""}
        </Btn>
        {/* V19.70.4: scheduled campaigns access */}
        <Btn small onClick={() => setMode("scheduledList")} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}} title="الحملات المجدولة لوقت لاحق">
          📅 المجدولة {(data.scheduledCampaigns||[]).filter(c=>c.status==="scheduled").length>0?"("+(data.scheduledCampaigns||[]).filter(c=>c.status==="scheduled").length+")":""}
        </Btn>
        <Btn small onClick={() => setMode("bridgeSettings")} style={{background:"#10B98112",color:"#10B981",border:"1px solid #10B98130"}} title="إعدادات الإرسال التلقائي">⚙️ بريدج</Btn>
        <Btn primary onClick={() => setMode("newCampaign")} disabled={templates.length===0} title={templates.length===0?"اعمل قالب الأول":"بدء حملة جديدة"}>
          ➕ حملة جديدة
        </Btn>
      </div>}
    </div>

    {/* V19.29: Resume banner for in-progress campaigns */}
    {(data.activeCampaigns||[]).length>0 && <div style={{marginBottom:14,padding:14,borderRadius:12,background:"#3B82F608",border:"2px solid #3B82F640"}}>
      <div style={{fontSize:FS+1,fontWeight:800,marginBottom:8,color:"#3B82F6",display:"flex",alignItems:"center",gap:8}}>
        <span>⏯</span><span>حملات معلّقة (تقدر تكمل)</span>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {(data.activeCampaigns||[]).map(ac => {
          const sent = (ac.items||[]).filter(i=>i.status==="sent").length;
          const total = (ac.items||[]).length;
          const pct = total ? Math.round((sent/total)*100) : 0;
          return <div key={ac.id} style={{display:"flex",alignItems:"center",gap:10,padding:10,borderRadius:8,background:T.cardSolid,border:"1px solid "+T.brd}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700}}>{ac.templateName}</div>
              <div style={{fontSize:FS-3,color:T.textSec}}>{ac.segmentLabel} · بدأت {(ac.startedAt||"").slice(0,16).replace("T"," ")}</div>
              <div style={{height:6,borderRadius:3,background:T.bg,overflow:"hidden",marginTop:4}}>
                <div style={{height:"100%",width:pct+"%",background:T.accent,transition:"width 0.3s"}}/>
              </div>
              <div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>{sent}/{total} ({pct}%)</div>
            </div>
            <div style={{display:"flex",gap:6}}>
              <Btn small primary onClick={() => {
                /* Restore the campaign and resume */
                const tpl = templates.find(t=>t.id===ac.templateId) || {id:ac.templateId,name:ac.templateName,body:ac.templateBody||""};
                setActiveCampaign({
                  template: tpl,
                  segment: {key:ac.segmentKey,label:ac.segmentLabel},
                  audience: ac.items.filter(i=>i.status==="pending"||i.status==="failed").map(i=>({...i,status:"pending"})),
                  resumeId: ac.id,
                  resumeAlreadyDone: ac.items.filter(i=>i.status==="sent"||i.status==="skipped").length,
                });
                setMode(ac.sendMode==="bridge"?"sendBridge":"send");
              }} style={{background:T.accent}}>▶ استئناف</Btn>
              {canEdit && <Btn small onClick={async()=>{
                if(!await ask("احذف الحملة المعلّقة '"+ac.templateName+"'؟"))return;
                upConfig(d=>{ d.activeCampaigns=(d.activeCampaigns||[]).filter(x=>x.id!==ac.id); });
                showToast("✓ اتحذفت");
              }} style={{background:T.err+"15",color:T.err,border:"1px solid "+T.err+"30"}}>🗑</Btn>}
            </div>
          </div>;
        })}
      </div>
    </div>}

    {/* V19.35: Migration banner — appears only if legacy base64 templates exist.
        Tells the user how much Firestore space they'll free, with a one-click migrate. */}
    {legacyTemplates.length > 0 && <div style={{
      marginBottom:12, padding:14, borderRadius:10,
      background:"#F59E0B12", border:"1px solid #F59E0B55",
    }}>
      <div style={{display:"flex",alignItems:"flex-start",gap:10,flexWrap:"wrap"}}>
        <div style={{fontSize:24,lineHeight:1}}>🏗️</div>
        <div style={{flex:1,minWidth:200}}>
          <div style={{fontWeight:800,fontSize:FS,color:"#92400E",marginBottom:4}}>
            ترحيل صور القوالب لـ Firebase Storage
          </div>
          <div style={{fontSize:FS-2,color:T.text,lineHeight:1.7,marginBottom:6}}>
            في {legacyTemplates.length} قالب صورهم متخزنة جوة Firestore (~{legacyTotalKB} KB). ده بيأكل من حد الـ document الـ 1MB. اضغط الزر علشان ننقلهم لـ Storage ونفرّغ المساحة. الصور والقوالب هتفضل شغالة عادي.
          </div>
          {migrating && <div style={{fontSize:FS-2,color:"#92400E",marginBottom:6}}>
            ⏳ جاري الترحيل... {migrateProgress.done}/{migrateProgress.total}
          </div>}
          {migrateError && <div style={{fontSize:FS-3,color:T.err,marginBottom:6}}>
            ⚠️ {migrateError}
          </div>}
          {canEdit && <Btn small primary onClick={runMigration} disabled={migrating} style={{background:"#F59E0B"}}>
            {migrating ? "⏳ جاري الترحيل..." : "🔄 ترحيل دلوقتي"}
          </Btn>}
        </div>
      </div>
    </div>}

    {/* Templates section */}
    <Card title={"📝 قوالب الرسائل ("+templates.length+"/"+MAX_TEMPLATES+")"} accent="#7C3AED">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <div style={{fontSize:FS-2,color:T.textSec}}>قوالب جاهزة للاستخدام في الحملات — تقدر تشخصن النصوص بمتغيرات زي {"{اسم}"} و {"{رصيد}"}</div>
        {canEdit && <Btn small onClick={() => { setEditingTpl(null); setMode("templateEdit"); }} style={{background:"#7C3AED12",color:"#7C3AED",border:"1px solid #7C3AED30"}}>+ قالب جديد</Btn>}
      </div>
      {templates.length === 0 ? <>
        <div style={{textAlign:"center",padding:24,color:T.textMut}}>
          لا توجد قوالب — ابدأ بإضافة قالب جديد للاستخدام في الحملات
        </div>
        {/* V19.33: Suggested starter templates */}
        {canEdit && <div style={{marginTop:12,padding:14,borderRadius:10,background:T.accent+"05",border:"1px dashed "+T.accent+"40"}}>
          <div style={{fontSize:FS,fontWeight:700,color:T.accent,marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
            <span>✨</span><span>قوالب جاهزة للبداية</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {STARTER_TEMPLATES.map((st, i) => <div key={i} style={{padding:12,borderRadius:8,background:T.cardSolid,border:"1px solid "+T.brd}}>
              <div style={{fontWeight:700,fontSize:FS-1,marginBottom:4}}>{st.icon} {st.name}</div>
              <div style={{fontSize:FS-3,color:T.textSec,marginBottom:6,lineHeight:1.5}}>{st.description}</div>
              <div style={{padding:8,borderRadius:6,background:"#DCF8C6",fontSize:FS-3,color:"#000",direction:"rtl",whiteSpace:"pre-wrap",lineHeight:1.6,maxHeight:80,overflow:"hidden",marginBottom:8}}>
                {st.body}
              </div>
              <Btn small primary onClick={() => {
                upConfig(d => {
                  if(!Array.isArray(d.campaignTemplates))d.campaignTemplates = [];
                  d.campaignTemplates.push({
                    id: gid(), name: st.name, category: st.category, body: st.body,
                    imageUrl: "", images: [],
                    createdAt: new Date().toISOString(),
                  });
                });
                showToast("✓ تم إضافة القالب — تقدر تعدّل عليه دلوقتي");
              }} style={{width:"100%"}}>➕ استخدم</Btn>
            </div>)}
          </div>
        </div>}
      </> : <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"repeat(auto-fill,minmax(280px,1fr))",gap:10}}>
        {templates.map(t => <div key={t.id} style={{padding:12,borderRadius:10,border:"1px solid "+T.brd,background:T.cardSolid}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:6}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:800,fontSize:FS,color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{t.name}</div>
              {t.category && <div style={{fontSize:FS-3,color:T.textSec,marginTop:2}}>{t.category}</div>}
            </div>
            {canEdit && <div style={{display:"flex",gap:4}}>
              <Btn small ghost onClick={() => { setEditingTpl(t); setMode("templateEdit"); }} title="تعديل">✏️</Btn>
              <Btn small ghost onClick={async () => {
                if(await ask("حذف القالب '"+t.name+"'؟")){
                  /* V19.35: Clean up Storage objects too — fire-and-forget,
                     deletion errors are non-fatal (we log and move on). */
                  (t.images || []).forEach(img => {
                    if(img?.storagePath){
                      deleteTemplateImage(img.storagePath).catch(err =>
                        console.warn("[V19.35] template image cleanup failed:", err)
                      );
                    }
                  });
                  /* V19.38: same for attachments */
                  (t.attachments || []).forEach(att => {
                    if(att?.storagePath){
                      deleteTemplateAttachment(att.storagePath).catch(err =>
                        console.warn("[V19.38] template attachment cleanup failed:", err)
                      );
                    }
                  });
                  upConfig(d => { d.campaignTemplates = (d.campaignTemplates||[]).filter(x => x.id !== t.id); });
                  showToast("✓ اتحذف");
                }
              }} title="حذف" style={{color:T.err}}>🗑</Btn>
            </div>}
          </div>
          <div style={{fontSize:FS-2,color:T.textSec,whiteSpace:"pre-wrap",lineHeight:1.6,maxHeight:80,overflow:"hidden",position:"relative"}}>
            {t.body}
            {t.body && t.body.length > 150 && <div style={{position:"absolute",bottom:0,left:0,right:0,height:24,background:"linear-gradient(transparent, "+T.cardSolid+")"}}/>}
          </div>
          {t.imageUrl && <div style={{marginTop:6,fontSize:FS-3,color:"#7C3AED"}}>🖼 رابط صورة (يدوي)</div>}
          {(t.images || []).length > 0 && <div style={{marginTop:6,fontSize:FS-3,color:T.accent,fontWeight:700}}>📷 {t.images.length} صورة (Bridge)</div>}
          {/* V19.38: Attachment count badge */}
          {(t.attachments || []).length > 0 && <div style={{marginTop:4,fontSize:FS-3,color:"#3B82F6",fontWeight:700}}>📎 {t.attachments.length} ملف مرفق (Bridge)</div>}
        </div>)}
      </div>}
    </Card>

    {/* Campaign log */}
    <div style={{marginTop:14}}>
      <Card title={"📊 سجل الحملات ("+campaigns.length+")"} accent="#059669">
        {campaigns.length === 0 ? <div style={{textAlign:"center",padding:24,color:T.textMut}}>
          لم يتم إرسال أي حملة بعد
        </div> : <>
          {/* V19.29: Bulk actions + export */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:8}}>
            <div style={{fontSize:FS-2,color:T.textSec}}>اضغط على أي حملة لتفاصيل العملاء + إعادة محاولة الفشل</div>
            <div style={{display:"flex",gap:6}}>
              <Btn small onClick={() => exportCampaignsExcel(campaigns, data)} style={{background:"#10B98112",color:"#10B981",border:"1px solid #10B98130"}}>📊 Excel</Btn>
              {canEdit && <Btn small onClick={async() => {
                if(!await ask("احذف كل سجل الحملات نهائياً؟ ("+campaigns.length+" حملة) — ده لا يمكن التراجع عنه."))return;
                upConfig(d => { d.campaigns = []; });
                showToast("✓ تم مسح السجل");
              }} style={{background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30"}}>🗑 امسح الكل</Btn>}
            </div>
          </div>
          <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr>{["التاريخ","القالب","الجمهور","المرسل","تم","تخطّى","فشل","المعدّل","الوضع",""].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
            <tbody>
              {campaigns.slice().sort((a,b) => (b.createdAt||b.startedAt||"").localeCompare(a.createdAt||a.startedAt||"")).map(c => {
                const total = c.totalCount || c.audienceCount || 0;
                const sent = c.sentCount || c.sent || 0;
                const skipped = c.skippedCount || c.skipped || 0;
                const failed = c.failedCount || c.failed || 0;
                const successPct = total > 0 ? Math.round((sent/total)*100) : 0;
                const mode = c.sendMode === "bridge" ? "🤖" : "👆";
                const modeLabel = c.sendMode === "bridge" ? "تلقائي" : "يدوي";
                return <tr key={c.id} style={{borderBottom:"1px solid "+T.brd,cursor:"pointer"}} onClick={() => setViewingCampaign(c)}>
                  <td style={{...TD,whiteSpace:"nowrap"}}>{(c.createdAt||c.startedAt||"").slice(0,10)}</td>
                  <td style={{...TD,fontWeight:700}}>{c.templateName || "—"}</td>
                  <td style={{...TD,fontSize:FS-2}}>{c.audienceLabel || c.segmentLabel || "—"}</td>
                  <td style={{...TD,fontWeight:700,textAlign:"center"}}>{total}</td>
                  <td style={{...TD,fontWeight:700,color:T.ok,textAlign:"center"}}>{sent}</td>
                  <td style={{...TD,color:T.warn,textAlign:"center"}}>{skipped}</td>
                  <td style={{...TD,color:T.err,textAlign:"center"}}>{failed}</td>
                  <td style={{...TD,fontWeight:800,textAlign:"center",color:successPct>=80?T.ok:successPct>=50?T.warn:T.err}}>{successPct}%</td>
                  <td style={{...TD,textAlign:"center",fontSize:FS-2}} title={modeLabel}>{mode}</td>
                  <td style={{...TD,whiteSpace:"nowrap",textAlign:"center"}}>
                    {canEdit && <span onClick={async(e) => {
                      e.stopPropagation();
                      if(!await ask("احذف الحملة '"+c.templateName+"' ("+(c.createdAt||"").slice(0,10)+")؟"))return;
                      upConfig(d => { d.campaigns = (d.campaigns||[]).filter(x => x.id !== c.id); });
                      showToast("✓ اتحذفت");
                    }} style={{cursor:"pointer",color:T.err,fontSize:FS,padding:"2px 6px"}} title="حذف">🗑</span>}
                  </td>
                </tr>;
              })}
            </tbody>
          </table>
        </div></>}
      </Card>
    </div>

    {/* Daily cap indicator */}
    <div style={{marginTop:14,padding:12,borderRadius:10,background:T.warn+"08",border:"1px solid "+T.warn+"25"}}>
      <div style={{fontSize:FS-1,color:T.warn,fontWeight:700,marginBottom:4}}>🛡 حماية رقم الواتساب</div>
      <div style={{fontSize:FS-2,color:T.textSec,lineHeight:1.7}}>
        تم إرسال {countSentToday(data)} رسالة اليوم من حد {DEFAULT_DAILY_CAP}/يوم.
        الإرسال الكثيف من رقم واتساب عادي ممكن يؤدي لحظر الرقم — التطبيق هيمنعك من تجاوز الحد.
      </div>
    </div>

    {/* V19.29: Campaign detail modal */}
    {viewingCampaign && <CampaignDetailModal
      campaign={viewingCampaign}
      data={data}
      upConfig={upConfig}
      canEdit={canEdit}
      templates={templates}
      onClose={() => setViewingCampaign(null)}
      onResend={(audience, tpl, segment) => {
        setViewingCampaign(null);
        setActiveCampaign({template: tpl, segment, audience});
        setMode("chooseSendMode");
      }}
    />}
  </div>;
}

/* ═══════════════════════════════════════════════════════════════════════
   TEMPLATE EDITOR
   ═══════════════════════════════════════════════════════════════════════ */
function TemplateEditor({tpl, canEdit, onCancel, onSave}){
  const [name, setName] = useState(tpl?.name || "");
  const [category, setCategory] = useState(tpl?.category || "تذكير دفع");
  const [body, setBody] = useState(tpl?.body || "");
  const [imageUrl, setImageUrl] = useState(tpl?.imageUrl || "");
  /* V19.35: Images live in Firebase Storage now. Shape: [{storagePath, url, mime, name, size}].
     Backwards-compat: legacy entries with `base64` are surfaced as-is until the user runs
     migration from the Templates list (or hits Save here, which will fail-safe to keeping them). */
  const [images, setImages] = useState(tpl?.images || []);
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);
  /* V19.38: Generic attachments (non-image files) — separate field/array
     so display logic can render file icons instead of <img> previews. */
  const [attachments, setAttachments] = useState(tpl?.attachments || []);
  const [attachUploadError, setAttachUploadError] = useState("");
  const [attachUploading, setAttachUploading] = useState(false);
  const [attachUploadProgress, setAttachUploadProgress] = useState(0);
  const fileInputRef = useRef(null);
  const attachInputRef = useRef(null);
  const bodyRef = useRef(null);

  /* V19.35: Image upload — compress in-browser then push to Firebase Storage.
     The Firestore record only stores the storagePath + downloadURL (~200 bytes),
     keeping factory/config tiny. */
  const handleImageUpload = async (e) => {
    setUploadError("");
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if(files.length === 0) return;
    if(images.length + files.length > 5){
      setUploadError("الحد الأقصى 5 صور لكل قالب");
      return;
    }
    /* Need a stable templateId for the Storage path even when creating a new template.
       For new templates we use a temporary id; on save the parent will assign the real
       tpl_xxx id but the images stay valid (the path is opaque to Firestore). */
    const tplId = tpl?.id || "tpl_draft_" + Math.random().toString(36).slice(2, 10);
    setUploading(true);
    try {
      const uploaded = [];
      for(const f of files){
        const meta = await uploadTemplateImageFile(tplId, f);
        uploaded.push(meta);
      }
      setImages(prev => [...prev, ...uploaded]);
    } catch(err){
      console.error("[V19.35] template image upload failed:", err);
      setUploadError("فشل رفع الصورة: " + (err?.message || err));
    } finally {
      setUploading(false);
    }
  };

  /* V19.35: removing an image deletes from Storage too. Firestore-side removal
     happens on Save (parent's onSave persists the new images[] array). */
  const removeImage = async (idx) => {
    const target = images[idx];
    setImages(images.filter((_,i) => i!==idx));
    if(target?.storagePath){
      deleteTemplateImage(target.storagePath).catch(err =>
        console.warn("[V19.35] storage delete failed (non-fatal):", err)
      );
    }
  };

  /* V19.38: Attachment upload — non-image files (PDFs, docs, video, audio, ZIPs).
     One file at a time so the progress bar tracks a single upload. The hard cap
     is 3 attachments per template — enough for "PDF + invoice + brochure" style
     campaigns, low enough that the recipient's WhatsApp doesn't get spammed with
     consecutive document messages. */
  const ATTACH_CAP = 3;
  const handleAttachmentUpload = async (e) => {
    setAttachUploadError("");
    const file = e.target.files?.[0];
    e.target.value = "";
    if(!file) return;
    if(attachments.length >= ATTACH_CAP){
      setAttachUploadError(`الحد الأقصى ${ATTACH_CAP} ملفات لكل قالب`);
      return;
    }
    /* If the user accidentally picks an image here, redirect them to the images section.
       Lets us keep the two flows clean (compression + dimensions belong to images). */
    if(classifyMime(file.type) === "image"){
      setAttachUploadError("ده صورة — استخدم زر '📷 رفع صورة' فوق بدلاً من المرفقات");
      return;
    }
    const tplId = tpl?.id || "tpl_draft_" + Math.random().toString(36).slice(2, 10);
    setAttachUploading(true);
    setAttachUploadProgress(0);
    try {
      const meta = await uploadTemplateAttachmentFile(tplId, file, pct => setAttachUploadProgress(pct));
      setAttachments(prev => [...prev, meta]);
    } catch(err){
      console.error("[V19.38] template attachment upload failed:", err);
      setAttachUploadError("فشل رفع الملف: " + (err?.message || err));
    } finally {
      setAttachUploading(false);
      setAttachUploadProgress(0);
    }
  };

  const removeAttachment = async (idx) => {
    const target = attachments[idx];
    setAttachments(attachments.filter((_,i) => i!==idx));
    if(target?.storagePath){
      deleteTemplateAttachment(target.storagePath).catch(err =>
        console.warn("[V19.38] attachment delete failed (non-fatal):", err)
      );
    }
  };

  const insertVar = (token) => {
    if(!bodyRef.current)return;
    const ta = bodyRef.current;
    const start = ta.selectionStart || body.length;
    const end = ta.selectionEnd || body.length;
    const next = body.slice(0,start) + token + body.slice(end);
    setBody(next);
    /* Restore cursor after the inserted token on next tick */
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + token.length, start + token.length);
    }, 0);
  };

  const previewCtx = {
    name: "أحمد محمد", phone: "01001234567", balance: 1250,
    lastPaymentDate: "2026-04-15", lastPaymentAmount: 500, orderCount: 12,
    /* V19.32: Sample portal URL for preview */
    portalUrl: "https://clark.../?p=c&i=cust_xxx&s=abc123",
  };
  const preview = personalize(body, previewCtx);

  const valid = name.trim() && body.trim();

  return <div style={{padding:16,maxWidth:900,margin:"0 auto"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,gap:8}}>
      <h2 style={{margin:0,fontSize:FS+3,fontWeight:900}}>{tpl?"✏️ تعديل قالب":"➕ قالب جديد"}</h2>
      <Btn ghost onClick={onCancel}>← رجوع</Btn>
    </div>

    <Card title="بيانات القالب">
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        <div>
          <div style={{fontSize:FS-2,color:T.textSec,marginBottom:4}}>الاسم</div>
          <Inp value={name} onChange={setName} placeholder="مثال: تذكير دفع شهري" disabled={!canEdit}/>
        </div>
        <div>
          <div style={{fontSize:FS-2,color:T.textSec,marginBottom:4}}>الفئة</div>
          <Sel value={category} onChange={setCategory} disabled={!canEdit}>
            <option>تذكير دفع</option>
            <option>إشعار تسليم</option>
            <option>تسويق</option>
            <option>إعلان عام</option>
            <option>تهنئة</option>
            <option>أخرى</option>
          </Sel>
        </div>
      </div>
      <div style={{marginBottom:10}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
          <div style={{fontSize:FS-2,color:T.textSec}}>نص الرسالة</div>
          <div style={{fontSize:FS-3,color:T.textMut}}>{body.length} حرف</div>
        </div>
        <textarea
          ref={bodyRef}
          value={body}
          onChange={e => setBody(e.target.value)}
          disabled={!canEdit}
          rows={6}
          style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1px solid "+T.brd,fontSize:FS,fontFamily:"inherit",background:T.inputBg,color:T.text,resize:"vertical"}}
          placeholder={"مثال:\nالسلام عليكم {اسم}،\nرصيدك معانا {رصيد} ج.م.\nبرجاء التواصل لتحديد موعد السداد."}
        />
      </div>

      {/* Variables */}
      <div style={{marginBottom:10}}>
        <div style={{fontSize:FS-2,color:T.textSec,marginBottom:6,fontWeight:700}}>المتغيرات (اضغط لإدراج):</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {VARIABLES.map(v => <button key={v.token}
            onClick={() => canEdit && insertVar(v.token)}
            disabled={!canEdit}
            title={"المثال: "+v.example}
            style={{padding:"5px 10px",borderRadius:8,border:"1px solid "+T.accent+"30",background:T.accent+"08",color:T.accent,fontSize:FS-2,cursor:canEdit?"pointer":"not-allowed",fontFamily:"inherit"}}>
            <span style={{fontWeight:700,fontFamily:"monospace"}}>{v.token}</span>
            <span style={{opacity:0.7,marginInlineStart:4}}>· {v.label}</span>
          </button>)}
        </div>
      </div>

      <div>
        <div style={{fontSize:FS-2,color:T.textSec,marginBottom:4}}>رابط صورة (اختياري — للوضع اليدوي)</div>
        <Inp value={imageUrl} onChange={setImageUrl} placeholder="https://..." disabled={!canEdit}/>
        <div style={{fontSize:FS-3,color:T.textMut,marginTop:4,lineHeight:1.6}}>
          الرابط بيتضاف للنص — مفيد في الوضع اليدوي (العميل يضغط الرابط يفتحه).
        </div>
      </div>

      {/* V19.35: Multi-image upload — uploads to Firebase Storage (was: base64 in factory/config) */}
      <div style={{marginTop:12,padding:12,borderRadius:10,background:T.accent+"06",border:"1px solid "+T.accent+"25"}}>
        <div style={{fontSize:FS-1,fontWeight:700,color:T.accent,marginBottom:6,display:"flex",alignItems:"center",gap:6}}>
          <span>📷</span><span>صور مرفقة (Bridge mode فقط)</span>
        </div>
        <div style={{fontSize:FS-3,color:T.textSec,marginBottom:10,lineHeight:1.6}}>
          الصور بتترفع لـ Firebase Storage مباشرة (مش بتاكل من حد الـ Firestore). ضغط تلقائي 1280px جودة 82%. النص بيتحط مع أول صورة كـ caption.
          <br/><b style={{color:T.warn}}>⚠️ في الوضع اليدوي:</b> الصور دي مش بتتبعت — استخدم "رابط صورة" فوق بدلاً منها.
        </div>

        {images.length > 0 && <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(110px, 1fr))",gap:8,marginBottom:10}}>
          {images.map((img, i) => (
            <div key={i} style={{position:"relative",borderRadius:8,overflow:"hidden",border:"1px solid "+T.brd,aspectRatio:"1"}}>
              <img src={img.url || ("data:"+img.mime+";base64,"+img.base64)} alt={img.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
              <div style={{position:"absolute",top:2,right:2,background:"rgba(0,0,0,0.7)",color:"#fff",padding:"2px 6px",borderRadius:4,fontSize:FS-3,fontWeight:700}}>
                {i+1}
              </div>
              {!img.url && img.base64 && <div style={{position:"absolute",top:2,left:32,background:"rgba(245,158,11,0.95)",color:"#000",padding:"2px 6px",borderRadius:4,fontSize:FS-3,fontWeight:700}} title="هتترحل تلقائياً عند الحفظ">قديمة</div>}
              {canEdit && <button onClick={() => removeImage(i)} style={{position:"absolute",top:2,left:2,width:22,height:22,borderRadius:"50%",background:"rgba(220,38,38,0.9)",color:"#fff",border:"none",fontSize:14,fontWeight:900,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}} title="حذف">✕</button>}
              <div style={{position:"absolute",bottom:0,left:0,right:0,background:"linear-gradient(transparent, rgba(0,0,0,0.8))",color:"#fff",fontSize:FS-3,padding:"10px 4px 3px 4px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                {Math.round((img.size||0)/1024)}KB
              </div>
            </div>
          ))}
        </div>}

        {canEdit && <>
          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageUpload} style={{display:"none"}}/>
          <Btn small onClick={() => fileInputRef.current?.click()} disabled={images.length>=5 || uploading} style={{background:T.accent+"15",color:T.accent,border:"1px solid "+T.accent+"40"}}>
            {uploading ? "⏳ جاري الرفع..." : `📷 رفع صورة ${images.length>0 ? `(${images.length}/5)` : ""}`}
          </Btn>
          {uploadError && <div style={{marginTop:6,fontSize:FS-3,color:T.err}}>⚠️ {uploadError}</div>}
        </>}
      </div>

      {/* V19.38: Attachments — non-image files (PDFs, docs, video, audio, ZIP) */}
      <div style={{marginTop:12,padding:12,borderRadius:10,background:"#3B82F606",border:"1px solid #3B82F625"}}>
        <div style={{fontSize:FS-1,fontWeight:700,color:"#3B82F6",marginBottom:6,display:"flex",alignItems:"center",gap:6}}>
          <span>📎</span><span>ملفات مرفقة (Bridge mode فقط)</span>
        </div>
        <div style={{fontSize:FS-3,color:T.textSec,marginBottom:10,lineHeight:1.6}}>
          PDFs, مستندات Word/Excel, فيديو, صوت, ZIP. بيتبعتوا كـ documents في WhatsApp مع زر تحميل واضح.
          <br/>الحدود: <b>صور/فيديو/صوت 16MB</b> · <b>مستندات 100MB</b> · حد أقصى 3 ملفات لكل قالب.
        </div>

        {attachments.length > 0 && <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:10}}>
          {attachments.map((att, i) => (
            <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:8,background:T.cardSolid,border:"1px solid "+T.brd}}>
              <span style={{fontSize:24,flexShrink:0}}>{getFileIcon(att.mime)}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:FS-1,fontWeight:600,color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{att.name}</div>
                <div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>{formatFileSize(att.size)} · {att.kind || classifyMime(att.mime)}</div>
              </div>
              {canEdit && <button onClick={() => removeAttachment(i)} style={{width:28,height:28,borderRadius:"50%",background:T.err+"15",color:T.err,border:"1px solid "+T.err+"30",fontSize:14,fontWeight:900,cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}} title="حذف">✕</button>}
            </div>
          ))}
        </div>}

        {attachUploading && <div style={{marginBottom:8}}>
          <div style={{fontSize:FS-2,color:"#3B82F6",marginBottom:4,display:"flex",justifyContent:"space-between"}}>
            <span>⏳ جاري الرفع...</span>
            <span style={{fontFamily:"monospace",fontWeight:700}}>{attachUploadProgress}%</span>
          </div>
          <div style={{height:6,borderRadius:3,background:T.bg,overflow:"hidden",border:"1px solid "+T.brd}}>
            <div style={{height:"100%",width:attachUploadProgress+"%",background:"#3B82F6",transition:"width 0.2s"}}/>
          </div>
        </div>}

        {canEdit && <>
          <input ref={attachInputRef} type="file" onChange={handleAttachmentUpload} style={{display:"none"}}/>
          <Btn small onClick={() => attachInputRef.current?.click()} disabled={attachments.length>=3 || attachUploading} style={{background:"#3B82F615",color:"#3B82F6",border:"1px solid #3B82F640"}}>
            📎 إضافة ملف {attachments.length>0 && `(${attachments.length}/3)`}
          </Btn>
          {attachUploadError && <div style={{marginTop:6,fontSize:FS-3,color:T.err}}>⚠️ {attachUploadError}</div>}
        </>}
      </div>
    </Card>

    {/* Preview */}
    <Card title="معاينة (بمثال عميل افتراضي)" style={{marginTop:14}}>
      <div style={{padding:12,borderRadius:10,background:"#DCF8C6",color:"#000",fontSize:FS,whiteSpace:"pre-wrap",lineHeight:1.7,fontFamily:"inherit",maxWidth:400}}>
        {preview || <span style={{color:"#666",fontStyle:"italic"}}>اكتب نص الرسالة في الأعلى</span>}
        {imageUrl && preview && <div style={{marginTop:6,fontSize:FS-2,color:"#0E7490"}}>🖼 {imageUrl}</div>}
        {images.length > 0 && <div style={{marginTop:8,padding:8,borderRadius:6,background:"#fff",border:"1px solid #ddd"}}>
          <div style={{fontSize:FS-3,color:"#666",marginBottom:4}}>📷 {images.length} صورة (Bridge فقط)</div>
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            {images.slice(0,5).map((img,i) => (
              <img key={i} src={img.url || ("data:"+img.mime+";base64,"+img.base64)} style={{width:50,height:50,objectFit:"cover",borderRadius:4}}/>
            ))}
          </div>
        </div>}
        {attachments.length > 0 && <div style={{marginTop:8,padding:8,borderRadius:6,background:"#fff",border:"1px solid #ddd"}}>
          <div style={{fontSize:FS-3,color:"#666",marginBottom:4}}>📎 {attachments.length} ملف مرفق (Bridge فقط)</div>
          <div style={{display:"flex",flexDirection:"column",gap:3}}>
            {attachments.map((att,i) => (
              <div key={i} style={{display:"flex",alignItems:"center",gap:6,fontSize:FS-3,color:"#000"}}>
                <span>{getFileIcon(att.mime)}</span>
                <span style={{flex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{att.name}</span>
                <span style={{color:"#666"}}>{formatFileSize(att.size)}</span>
              </div>
            ))}
          </div>
        </div>}
      </div>
      <div style={{marginTop:8,fontSize:FS-3,color:T.textMut}}>المعاينة باسم "أحمد محمد" ورصيد 1,250 ج.م — العميل الفعلي هيشوف بياناته الخاصة.</div>
    </Card>

    {canEdit && <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}>
      <Btn ghost onClick={onCancel}>إلغاء</Btn>
      <Btn primary disabled={!valid} onClick={() => onSave({id: tpl?.id, name: name.trim(), category, body: body.trim(), imageUrl: imageUrl.trim(), images, attachments})}>
        💾 حفظ
      </Btn>
    </div>}
  </div>;
}

/* ═══════════════════════════════════════════════════════════════════════
   NEW CAMPAIGN WIZARD
   ═══════════════════════════════════════════════════════════════════════ */
function NewCampaignWizard({data, templates, onCancel, onLaunch}){
  const [step, setStep] = useState(1); /* 1=template · 2=audience · 3=preview */
  const [tpl, setTpl] = useState(null);
  const [segKey, setSegKey] = useState("all");
  const [manualSelection, setManualSelection] = useState(new Set());
  const [searchQ, setSearchQ] = useState("");
  /* V21.9.132: type + tag filters apply across all 4 entity tables.
     V21.9.133: Default = customer only (was: all 4 types). Per user feedback —
     campaigns are >90% customer marketing; forcing the user to deselect the
     other 3 types on every campaign creation was unergonomic. */
  const [selectedTypes, setSelectedTypes] = useState(() => new Set(["customer"]));
  const [tagFilter, setTagFilter] = useState([]);
  const [tagMode, setTagMode] = useState("OR");

  const segDef = SEGMENTS.find(s => s.key === segKey);

  const toggleType = (key) => {
    setSelectedTypes(prev => {
      const next = new Set(prev);
      if(next.has(key)) next.delete(key); else next.add(key);
      /* Don't allow zero — fall back to "customer" if user tries to clear all */
      if(next.size === 0) next.add("customer");
      return next;
    });
    /* Switching the type filter invalidates the current manual selection
       (some entities may now be out of scope) */
    setManualSelection(new Set());
  };

  const segment = useMemo(() => ({
    key: segKey,
    label: segDef?.label || "",
    params: {
      entityTypes: Array.from(selectedTypes),
      tagFilter: tagFilter.slice(),
      tagMode,
      ...(segKey === "manual" ? { ids: Array.from(manualSelection) } : {}),
    },
  }), [segKey, segDef, selectedTypes, tagFilter, tagMode, manualSelection]);

  const audience = useMemo(() => {
    if(!tpl)return [];
    return buildAudience(data, segment).slice(0, MAX_AUDIENCE);
  }, [data, segment, tpl]);

  /* V21.9.132: Manual list now spans all selected entity types, filtered by
     tag filter + blocklist (same logic as buildAudience minus the manual id
     filter — so the user picks FROM the post-filter pool). */
  const manualPool = useMemo(() => {
    const blocked = new Set();
    (data.campaignBlocklist||[]).forEach(b => {
      if(b.id) blocked.add(b.id);
      if(b.phone) blocked.add(cleanPhone(b.phone));
    });
    let pool = buildEntityPool(data, Array.from(selectedTypes))
      .filter(e => !blocked.has(e.id) && !blocked.has(cleanPhone(e.phone)));
    if(tagFilter.length > 0){
      pool = filterByTags(pool, tagFilter, tagMode);
    }
    const q = searchQ.toLowerCase().trim();
    if(q){
      pool = pool.filter(e => (e.name||"").toLowerCase().includes(q) || (e.phone||"").includes(q));
    }
    return pool;
  }, [data, selectedTypes, tagFilter, tagMode, searchQ]);

  const toggleManual = (id) => {
    setManualSelection(prev => {
      const next = new Set(prev);
      if(next.has(id))next.delete(id); else next.add(id);
      return next;
    });
  };

  return <div style={{padding:16,maxWidth:900,margin:"0 auto"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,gap:8}}>
      <h2 style={{margin:0,fontSize:FS+3,fontWeight:900}}>📣 حملة جديدة</h2>
      <Btn ghost onClick={onCancel}>← إلغاء</Btn>
    </div>

    {/* Stepper */}
    <div style={{display:"flex",gap:8,marginBottom:16}}>
      {[
        {n:1, label:"اختيار القالب"},
        {n:2, label:"اختيار الجمهور"},
        {n:3, label:"معاينة وتأكيد"},
      ].map(s => <div key={s.n} style={{flex:1,padding:"10px 12px",borderRadius:8,
        background: step===s.n ? T.accent+"15" : (step>s.n ? T.ok+"08" : T.bg),
        border: "1px solid "+(step===s.n ? T.accent : (step>s.n ? T.ok+"30" : T.brd)),
        textAlign:"center",fontSize:FS-1,fontWeight:700,
        color: step===s.n ? T.accent : (step>s.n ? T.ok : T.textSec),
      }}>
        {step>s.n ? "✓" : s.n}. {s.label}
      </div>)}
    </div>

    {/* STEP 1 — Template selection */}
    {step === 1 && <Card title="اختر قالب الرسالة">
      {templates.length === 0 ? <div style={{textAlign:"center",padding:24,color:T.textMut}}>
        لا توجد قوالب — ارجع لإضافة قالب أولاً
      </div> : <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:10}}>
        {templates.map(t => <div key={t.id}
          onClick={() => setTpl(t)}
          style={{padding:12,borderRadius:10,
            border:"2px solid "+(tpl?.id === t.id ? T.accent : T.brd),
            background: tpl?.id === t.id ? T.accent+"08" : T.cardSolid,
            cursor:"pointer",transition:"all 0.15s"}}>
          <div style={{fontWeight:800,fontSize:FS,marginBottom:6}}>{t.name}</div>
          <div style={{fontSize:FS-3,color:T.textSec,marginBottom:6}}>{t.category}</div>
          <div style={{fontSize:FS-2,color:T.textSec,whiteSpace:"pre-wrap",lineHeight:1.5,maxHeight:80,overflow:"hidden"}}>{t.body}</div>
        </div>)}
      </div>}
      <div style={{display:"flex",justifyContent:"flex-end",marginTop:14}}>
        <Btn primary disabled={!tpl} onClick={() => setStep(2)}>التالي ←</Btn>
      </div>
    </Card>}

    {/* STEP 2 — Audience selection (V21.9.132: type chips + tag filter + segment) */}
    {step === 2 && <Card title="اختر الجمهور">

      {/* V21.9.132: Entity-type filter — applies to BOTH segments (all + manual) */}
      <div style={{marginBottom:14, padding:12, borderRadius:10, background:T.bg, border:"1px solid "+T.brd}}>
        <div style={{fontSize:FS-2, color:T.textSec, fontWeight:700, marginBottom:8}}>
          🎯 نوع جهة الاتصال (اختر اللي عاوز تخاطبه)
        </div>
        <div style={{display:"flex", flexWrap:"wrap", gap:8}}>
          {ENTITY_TYPES.map(t => {
            const on = selectedTypes.has(t.key);
            return (
              <button
                key={t.key}
                onClick={() => toggleType(t.key)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 18,
                  fontSize: FS-1, fontWeight: 700,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  background: on ? t.color : "transparent",
                  color: on ? "#fff" : t.color,
                  border: "1.5px solid " + t.color + (on ? "" : "55"),
                  display: "inline-flex", alignItems: "center", gap: 6,
                }}
              >
                <span>{t.icon}</span>
                <span>{t.label}</span>
                {on && <span style={{opacity:0.85}}>✓</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* V21.9.132: Tag filter — applies to BOTH segments. Uses universal
          TagFilter component with entityType=null to show every active tag.
          V21.9.133: Adds prominent "Clear" button when at least one tag is
          selected — keeps Ahmed from missing an active filter that's silently
          narrowing his audience (Ahmed reported this confusion). */}
      <div style={{marginBottom:14, padding:12, borderRadius:10,
                   background: tagFilter.length > 0 ? T.warn + "08" : T.bg,
                   border: "1px solid " + (tagFilter.length > 0 ? T.warn + "44" : T.brd)}}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8, flexWrap:"wrap", gap:8}}>
          <div style={{fontSize:FS-2, color: tagFilter.length > 0 ? T.warn : T.textSec, fontWeight:700}}>
            🏷️ فلترة بالتاجز (اختياري) {tagFilter.length > 0 && <span style={{marginInlineStart:6}}>— نشط ({tagFilter.length})</span>}
          </div>
          {tagFilter.length > 0 && (
            <button
              onClick={() => { setTagFilter([]); setManualSelection(new Set()); }}
              style={{
                padding: "4px 10px", borderRadius: 6,
                background: T.warn + "15", color: T.warn,
                border: "1px solid " + T.warn + "44",
                fontSize: FS-2, fontWeight: 700,
                fontFamily: "inherit", cursor: "pointer",
              }}
            >✕ امسح الفلتر</button>
          )}
        </div>
        <TagFilter
          entityType={null}
          registry={data.tagRegistry || []}
          selectedTags={tagFilter}
          mode={tagMode}
          onChange={(ids, mode) => { setTagFilter(ids); setTagMode(mode); setManualSelection(new Set()); }}
          compact
        />
      </div>

      {/* Segment cards */}
      <div style={{display:"grid",gridTemplateColumns:isMobUI()?"1fr":"repeat(auto-fill,minmax(220px,1fr))",gap:10,marginBottom:14}}>
        {SEGMENTS.map(s => <div key={s.key}
          onClick={() => { setSegKey(s.key); setManualSelection(new Set()); }}
          style={{padding:12,borderRadius:10,
            border:"2px solid "+(segKey === s.key ? T.accent : T.brd),
            background: segKey === s.key ? T.accent+"08" : T.cardSolid,
            cursor:"pointer",textAlign:"center"}}>
          <div style={{fontSize:24,marginBottom:4}}>{s.icon}</div>
          <div style={{fontWeight:700,fontSize:FS-1}}>{s.label}</div>
        </div>)}
      </div>

      {/* V21.9.132: Manual selection — pool spans all selected types, filtered
          by tag filter. Each row shows entity type so the user can distinguish
          عميل from مورد etc. */}
      {segKey === "manual" && <div style={{marginBottom:14}}>
        <div style={{display:"flex",gap:8,marginBottom:8,alignItems:"center"}}>
          <Inp value={searchQ} onChange={setSearchQ} placeholder="🔍 ابحث بالاسم أو رقم الجوال..." style={{flex:1}}/>
          <span style={{fontSize:FS-2,color:T.textSec}}>{manualSelection.size} مختار من {manualPool.length}</span>
        </div>
        <div style={{maxHeight:300,overflowY:"auto",border:"1px solid "+T.brd,borderRadius:8}}>
          {manualPool.slice(0, 200).map(e => {
            const typeMeta = ENTITY_TYPES.find(t => t.key === e._entityType);
            return (
              <label key={e._entityType+":"+e.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderBottom:"1px solid "+T.brd,cursor:"pointer",background:manualSelection.has(e.id)?T.accent+"08":"transparent"}}>
                <input type="checkbox" checked={manualSelection.has(e.id)} onChange={() => toggleManual(e.id)}/>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:FS-1, display:"flex", alignItems:"center", gap:6, flexWrap:"wrap"}}>
                    <span>{e.name}</span>
                    {typeMeta && (
                      <span style={{
                        fontSize:FS-3, fontWeight:600,
                        padding:"1px 8px", borderRadius:10,
                        color: typeMeta.color,
                        background: typeMeta.color + "12",
                        border: "1px solid " + typeMeta.color + "33",
                      }}>{typeMeta.icon} {typeMeta.label}</span>
                    )}
                  </div>
                  <div style={{fontSize:FS-3,color:T.textSec}}>{e.phone}</div>
                </div>
              </label>
            );
          })}
          {manualPool.length === 0 && <div style={{padding:24,textAlign:"center",color:T.textMut}}>لا توجد نتائج بـ الـ filters الحالية</div>}
          {manualPool.length > 200 && <div style={{padding:8,textAlign:"center",color:T.textMut,fontSize:FS-3}}>عرض أول 200 من {manualPool.length} — ضيّق البحث للأقل</div>}
        </div>
      </div>}

      <div style={{padding:12,borderRadius:8,background:T.accent+"08",border:"1px solid "+T.accent+"25",fontSize:FS-1,color:T.accent,fontWeight:700}}>
        🎯 الجمهور المحدد: <span style={{fontSize:FS+2}}>{audience.length}</span> جهة
        {audience.length >= MAX_AUDIENCE && <span style={{marginInlineStart:8,fontSize:FS-2,color:T.warn}}>(الحد الأقصى للحملة الواحدة)</span>}
      </div>

      <div style={{display:"flex",justifyContent:"space-between",marginTop:14}}>
        <Btn ghost onClick={() => setStep(1)}>→ السابق</Btn>
        <Btn primary disabled={audience.length === 0} onClick={() => setStep(3)}>التالي ←</Btn>
      </div>
    </Card>}

    {/* STEP 3 — Preview & confirm */}
    {step === 3 && <Card title="معاينة وتأكيد">
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>
        <Stat label="القالب" value={tpl?.name} color={T.accent}/>
        <Stat label="الجمهور" value={segDef?.label} color="#7C3AED"/>
        <Stat label="عدد الجهات" value={audience.length} color={T.ok}/>
      </div>

      <div style={{marginBottom:14}}>
        <div style={{fontSize:FS-1,fontWeight:700,marginBottom:8,color:T.textSec}}>أول 3 رسائل (معاينة):</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {audience.slice(0,3).map(c => <div key={c.id} style={{padding:10,borderRadius:10,background:"#DCF8C6",fontSize:FS-1,whiteSpace:"pre-wrap",lineHeight:1.6,maxWidth:400}}>
            <div style={{fontSize:FS-3,color:"#666",marginBottom:4}}>→ {c.name} ({c.phone})</div>
            {personalize(tpl?.body || "", c)}
            {tpl?.imageUrl && <div style={{marginTop:6,fontSize:FS-2,color:"#0E7490"}}>🖼 {tpl.imageUrl}</div>}
          </div>)}
          {audience.length > 3 && <div style={{fontSize:FS-3,color:T.textMut,textAlign:"center"}}>... و{audience.length - 3} رسالة أخرى</div>}
        </div>
      </div>

      {/* Daily cap warning */}
      {(() => {
        const sentToday = countSentToday(data);
        const remaining = DEFAULT_DAILY_CAP - sentToday;
        if(audience.length > remaining){
          return <div style={{padding:12,borderRadius:8,background:T.err+"10",border:"1px solid "+T.err+"30",fontSize:FS-1,color:T.err,marginBottom:14}}>
            ⛔ الجمهور المحدد ({audience.length}) أكتر من الحد المتبقي اليوم ({remaining} من {DEFAULT_DAILY_CAP}). قسّم الحملة على أكتر من يوم.
          </div>;
        }
        return null;
      })()}

      <div style={{display:"flex",justifyContent:"space-between",marginTop:14}}>
        <Btn ghost onClick={() => setStep(2)}>→ السابق</Btn>
        <Btn primary
          disabled={audience.length === 0 || (countSentToday(data) + audience.length > DEFAULT_DAILY_CAP)}
          onClick={() => onLaunch(tpl, segment, audience)}
          style={{background:"#25D366",borderColor:"#25D366"}}>
          🚀 ابدأ الإرسال ({audience.length} رسالة)
        </Btn>
      </div>
    </Card>}
  </div>;
}

const isMobUI = () => typeof window !== "undefined" && window.innerWidth < 768;

function Stat({label, value, color}){
  return <div style={{padding:10,borderRadius:10,background:color+"08",border:"1px solid "+color+"25",textAlign:"center"}}>
    <div style={{fontSize:FS-2,color:T.textSec,marginBottom:4}}>{label}</div>
    <div style={{fontSize:FS+2,fontWeight:900,color}}>{value}</div>
  </div>;
}

/* ═══════════════════════════════════════════════════════════════════════
   SEND SCREEN — ASSEMBLY-LINE (V19.29 ENHANCED)
   ═══════════════════════════════════════════════════════════════════════
   V19.29 features:
   - Auto-remove sent items (clean queue view, default ON)
   - Search box in customer list
   - Filter by status (all/pending/sent/skipped/failed)
   - Jump to specific customer
   - Undo last action
   - Edit message per-customer before send
   - Skip with note
   - Block customer (adds to data.campaignBlocklist[])
   - Resend failures button
   - ETA estimate
   - Persistent state: campaign saved to data.activeCampaigns[] for resume
   - Per-item details persisted in campaign log (not just summary)
   ═══════════════════════════════════════════════════════════════════════ */
function SendScreen({data, upConfig, user, template, segment, audience, onClose, resumeId, resumeAlreadyDone}){
  const [items, setItems] = useState(() => audience.map((c, i) => ({...c, status: "pending", sentAt: null, sendOrder: i, customMessage: null, skipNote: null})));
  const [currentIdx, setCurrentIdx] = useState(0);
  const [delaySec, setDelaySec] = useState(DEFAULT_DELAY_SEC);
  const [paused, setPaused] = useState(false);
  const [completed, setCompleted] = useState(false);
  /* V19.29: Configuration toggles */
  const [autoRemoveSent, setAutoRemoveSent] = useState(true);
  const [searchQ, setSearchQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("active"); /* active=pending+failed · all · pending · sent · skipped · failed */
  /* V19.29: UX state */
  const [editingMsg, setEditingMsg] = useState(false);
  const [draftMsg, setDraftMsg] = useState("");
  const [skipDialog, setSkipDialog] = useState(false);
  const [skipNote, setSkipNote] = useState("");
  const [lastAction, setLastAction] = useState(null); /* {type:"sent"|"skipped"|"failed", idx, prevStatus} */
  const [sendStartTime] = useState(Date.now());

  /* V19.32: Portal URL pre-fetch — only if template uses {لينك} */
  const needsPortalLinks = (template.body || "").includes("{لينك}");
  const [portalLoading, setPortalLoading] = useState(needsPortalLinks);
  const [portalProgress, setPortalProgress] = useState({done: 0, total: 0});
  const [portalError, setPortalError] = useState("");

  const campaignIdRef = useRef(resumeId || ("camp_" + gid()));
  const startedAtRef = useRef(new Date().toISOString());
  const persistedRef = useRef(false);
  const activeSavedRef = useRef(0); /* throttle saves to data.activeCampaigns */

  const counts = useMemo(() => ({
    sent: items.filter(i => i.status === "sent").length,
    skipped: items.filter(i => i.status === "skipped").length,
    failed: items.filter(i => i.status === "failed").length,
    pending: items.filter(i => i.status === "pending").length,
  }), [items]);

  const totalSentToday = countSentToday(data) + counts.sent + (resumeAlreadyDone || 0);
  const overCap = totalSentToday >= DEFAULT_DAILY_CAP;

  /* V19.29: Find next pending item (after currentIdx) for the "current" view */
  const current = useMemo(() => {
    /* If currentIdx points to a non-pending item, find the next pending */
    if(items[currentIdx]?.status === "pending") return items[currentIdx];
    const next = items.findIndex((it, i) => i >= currentIdx && it.status === "pending");
    return next >= 0 ? items[next] : null;
  }, [items, currentIdx]);

  const currentRealIdx = useMemo(() => items.findIndex(it => it === current), [items, current]);

  /* V19.29: Save in-progress campaign to data for resume */
  const saveActiveCampaign = (overrideItems) => {
    const it = overrideItems || items;
    /* Throttle: save at most every 3 sec or on key events */
    const now = Date.now();
    if(now - activeSavedRef.current < 3000 && !overrideItems) return;
    activeSavedRef.current = now;
    upConfig(d => {
      if(!Array.isArray(d.activeCampaigns)) d.activeCampaigns = [];
      const existing = d.activeCampaigns.findIndex(a => a.id === campaignIdRef.current);
      const record = {
        id: campaignIdRef.current,
        templateId: template.id,
        templateName: template.name,
        templateBody: template.body,
        segmentKey: segment.key,
        segmentLabel: segment.label,
        sendMode: "manual",
        items: it.map(x => ({id: x.id, name: x.name, phone: x.phone, status: x.status, sentAt: x.sentAt, skipNote: x.skipNote, customMessage: x.customMessage, portalUrl: x.portalUrl})),
        startedAt: startedAtRef.current,
        updatedAt: new Date().toISOString(),
        startedBy: user?.email || "",
      };
      if(existing >= 0) d.activeCampaigns[existing] = record;
      else d.activeCampaigns.unshift(record);
      /* Keep max 5 active campaigns */
      if(d.activeCampaigns.length > 5) d.activeCampaigns = d.activeCampaigns.slice(0, 5);
    });
  };

  /* Save initial state on mount */
  useEffect(() => { saveActiveCampaign(); }, []);

  /* V19.32: Pre-fetch portal URLs once at start (only if {لينك} is used).
     Skipped on resume if all items already have portalUrl from the saved active campaign. */
  useEffect(() => {
    if(!needsPortalLinks) return;
    /* Resume case: items might already have portalUrl */
    const missing = items.filter(i => !i.portalUrl).map(i => i.id).filter(Boolean);
    if(missing.length === 0) { setPortalLoading(false); return; }
    let dead = false;
    setPortalProgress({done: 0, total: missing.length});
    portalUrlBatch(missing, (done, total) => {
      if(!dead) setPortalProgress({done, total});
    }).then(urlMap => {
      if(dead) return;
      setItems(prev => prev.map(it => ({...it, portalUrl: it.portalUrl || urlMap[it.id] || ""})));
      const failed = missing.filter(id => !urlMap[id]).length;
      if(failed > 0) {
        setPortalError(`تعذّر توليد ${failed} لينك من ${missing.length}. هتُترك فاضية في الرسالة.`);
      }
      setPortalLoading(false);
    }).catch(err => {
      if(dead) return;
      setPortalError(err.message || "فشل توليد اللينكات");
      setPortalLoading(false);
    });
    return () => { dead = true; };
  }, []);

  /* V19.29: Persist final summary AND remove from activeCampaigns when completed */
  const persistCampaign = (finalCounts, finalItems) => {
    if(persistedRef.current) return;
    persistedRef.current = true;
    upConfig(d => {
      if(!Array.isArray(d.campaigns)) d.campaigns = [];
      const fIt = finalItems || items;
      const record = {
        id: campaignIdRef.current,
        templateId: template.id,
        templateName: template.name,
        templateBody: template.body,
        audienceLabel: segment.label || "—",
        segmentKey: segment.key,
        segmentLabel: segment.label,
        sendMode: "manual",
        totalCount: fIt.length,
        sentCount: finalCounts.sent,
        skippedCount: finalCounts.skipped,
        failedCount: finalCounts.failed,
        /* V19.29: full per-item history for detail view */
        items: fIt.map(x => ({
          id: x.id, name: x.name, phone: x.phone,
          status: x.status, sentAt: x.sentAt,
          skipNote: x.skipNote, customMessage: x.customMessage,
        })),
        createdAt: startedAtRef.current,
        startedAt: startedAtRef.current,
        completedAt: new Date().toISOString(),
        createdBy: user?.email || "",
      };
      d.campaigns.unshift(record);
      if(d.campaigns.length > MAX_CAMPAIGNS) d.campaigns = d.campaigns.slice(0, MAX_CAMPAIGNS);
      /* Remove from active */
      if(Array.isArray(d.activeCampaigns)) {
        d.activeCampaigns = d.activeCampaigns.filter(a => a.id !== campaignIdRef.current);
      }
    });
  };

  /* V19.29: Send with optional custom message */
  const sendCurrent = (customText) => {
    if(!current || current.status !== "pending" || paused || overCap) return;
    const phone = cleanPhone(current.phone);
    if(!phone) {
      markStatus(currentRealIdx, "failed");
      setLastAction({type: "failed", idx: currentRealIdx, prevStatus: "pending"});
      advanceCurrent();
      return;
    }
    let msg = customText || current.customMessage || personalize(template.body, current);
    if(template.imageUrl && !customText && !current.customMessage) msg += "\n" + template.imageUrl;
    const url = "https://wa.me/" + phone + "?text=" + encodeURIComponent(msg);
    openWA(url, "_blank");
    markStatus(currentRealIdx, "sent");
    setLastAction({type: "sent", idx: currentRealIdx, prevStatus: "pending"});
    advanceCurrent();
  };

  const skipCurrent = (note) => {
    if(!current || current.status !== "pending") return;
    setItems(prev => {
      const next = prev.map((it, i) => i === currentRealIdx ? {...it, status: "skipped", skipNote: note || null} : it);
      saveActiveCampaign(next);
      return next;
    });
    setLastAction({type: "skipped", idx: currentRealIdx, prevStatus: "pending", note});
    advanceCurrent();
  };

  const advanceCurrent = () => {
    /* Move to next pending */
    const next = items.findIndex((it, i) => i > currentRealIdx && it.status === "pending");
    setCurrentIdx(next >= 0 ? next : items.length);
  };

  const markStatus = (idx, status) => {
    setItems(prev => {
      const next = prev.map((it, i) => i === idx ? {...it, status, sentAt: status === "sent" ? new Date().toISOString() : it.sentAt} : it);
      saveActiveCampaign(next);
      return next;
    });
  };

  /* V19.29: Undo last action */
  const undoLast = () => {
    if(!lastAction) return;
    setItems(prev => {
      const next = prev.map((it, i) => i === lastAction.idx ? {...it, status: lastAction.prevStatus, sentAt: null, skipNote: null} : it);
      saveActiveCampaign(next);
      return next;
    });
    setCurrentIdx(lastAction.idx);
    setLastAction(null);
    showToast("✓ تم التراجع");
  };

  /* V19.29: Jump to a specific customer */
  const jumpTo = (idx) => {
    if(items[idx]?.status === "pending") {
      setCurrentIdx(idx);
    } else {
      showToast("ℹ العميل ده اتعالج بالفعل");
    }
  };

  /* V19.29: Block customer (add to blocklist + skip) */
  const blockCustomer = async (item) => {
    if(!await ask("احظر "+(item.name||item.phone)+"؟ هيتم تخطيه دلوقتي ولن يظهر في حملات قادمة."))return;
    upConfig(d => {
      if(!Array.isArray(d.campaignBlocklist)) d.campaignBlocklist = [];
      const existing = d.campaignBlocklist.find(b => b.id === item.id || b.phone === item.phone);
      if(!existing) d.campaignBlocklist.push({
        id: item.id, name: item.name, phone: item.phone,
        blockedAt: new Date().toISOString(), blockedBy: user?.email || "",
        reason: "حُظر من شاشة الحملة",
      });
    });
    /* Mark as skipped */
    const idx = items.findIndex(it => it.id === item.id);
    if(idx >= 0) {
      setItems(prev => {
        const next = prev.map((it, i) => i === idx ? {...it, status: "skipped", skipNote: "محظور"} : it);
        saveActiveCampaign(next);
        return next;
      });
      if(idx === currentRealIdx) advanceCurrent();
    }
    showToast("🚫 تم الحظر");
  };

  /* V19.29: Resend failures */
  const resendFailures = () => {
    const failedIdx = items.findIndex(it => it.status === "failed");
    if(failedIdx < 0) { showToast("ℹ مفيش رسائل فاشلة"); return; }
    setItems(prev => {
      const next = prev.map(it => it.status === "failed" ? {...it, status: "pending", sentAt: null} : it);
      saveActiveCampaign(next);
      return next;
    });
    setCurrentIdx(failedIdx);
    setCompleted(false);
    persistedRef.current = false;
    showToast("✓ تم إرجاع الفاشل للطابور");
  };

  /* Detect completion */
  useEffect(() => {
    const allDone = items.every(it => it.status !== "pending");
    if(allDone && !completed && items.length > 0) {
      setCompleted(true);
      persistCampaign(counts, items);
    }
  }, [items, completed, counts]);

  const finishEarly = async () => {
    const remainingPending = items.filter(i => i.status === "pending").length;
    if(remainingPending > 0) {
      if(!await ask("لسه فيه "+remainingPending+" رسالة ما اتبعتش — تأكد من الإنهاء؟"))return;
    }
    const finalItems = items.map(it => it.status === "pending" ? {...it, status: "skipped", skipNote: "إنهاء مبكر"} : it);
    setItems(finalItems);
    const finalCounts = {
      sent: finalItems.filter(i => i.status === "sent").length,
      skipped: finalItems.filter(i => i.status === "skipped").length,
      failed: finalItems.filter(i => i.status === "failed").length,
    };
    setCompleted(true);
    persistCampaign(finalCounts, finalItems);
  };

  /* V19.29: Filtered list for the customer table */
  const filteredItems = useMemo(() => {
    let list = items;
    if(statusFilter === "active") list = list.filter(it => it.status === "pending" || it.status === "failed");
    else if(statusFilter !== "all") list = list.filter(it => it.status === statusFilter);
    /* Auto-remove sent (when toggle is on) — affects "active" filter */
    if(autoRemoveSent && statusFilter === "active") list = list.filter(it => it.status !== "sent" && it.status !== "skipped");
    if(searchQ.trim()) {
      const q = searchQ.trim().toLowerCase();
      list = list.filter(it => (it.name||"").toLowerCase().includes(q) || (it.phone||"").includes(q));
    }
    return list;
  }, [items, statusFilter, searchQ, autoRemoveSent]);

  /* V19.29: ETA calculation */
  const eta = useMemo(() => {
    const done = counts.sent + counts.skipped + counts.failed;
    if(done < 2) return null;
    const elapsedMs = Date.now() - sendStartTime;
    const msPerItem = elapsedMs / done;
    const remainingMs = msPerItem * counts.pending;
    const min = Math.round(remainingMs / 60000);
    if(min < 1) return "أقل من دقيقة";
    if(min < 60) return "~" + min + " دقيقة";
    return "~" + Math.floor(min/60) + " س " + (min%60) + " د";
  }, [counts, sendStartTime]);

  /* V19.32: Loading screen while portal URLs are being fetched */
  if(portalLoading){
    const pct = portalProgress.total ? Math.round((portalProgress.done / portalProgress.total) * 100) : 0;
    return <div style={{padding:16,maxWidth:600,margin:"0 auto"}}>
      <Card>
        <div style={{textAlign:"center",padding:24}}>
          <div style={{fontSize:48,marginBottom:12}}>🔗</div>
          <div style={{fontSize:FS+2,fontWeight:800,marginBottom:8}}>جاري توليد لينكات العملاء...</div>
          <div style={{fontSize:FS-1,color:T.textSec,marginBottom:16}}>القالب فيه {"{لينك}"} — بنولّد لينك آمن لكل عميل قبل ما نبعت.</div>
          <div style={{height:12,borderRadius:6,background:T.bg,overflow:"hidden",marginBottom:8}}>
            <div style={{height:"100%",width:pct+"%",background:"linear-gradient(90deg, "+T.ok+", "+T.accent+")",transition:"width 0.3s"}}/>
          </div>
          <div style={{fontSize:FS-2,color:T.textMut}}>{portalProgress.done} / {portalProgress.total} ({pct}%)</div>
          <Btn ghost onClick={onClose} style={{marginTop:16}}>✕ إلغاء</Btn>
        </div>
      </Card>
    </div>;
  }

  return <div style={{padding:16,maxWidth:900,margin:"0 auto"}}>
    {/* V19.32: Portal links warning */}
    {portalError && <div style={{padding:10,borderRadius:8,background:T.warn+"10",border:"1px solid "+T.warn+"40",marginBottom:12,fontSize:FS-2,color:T.warn,lineHeight:1.6}}>
      ⚠️ {portalError}
    </div>}    {/* Header */}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,gap:8,flexWrap:"wrap"}}>
      <div>
        <h2 style={{margin:0,fontSize:FS+3,fontWeight:900,display:"flex",alignItems:"center",gap:8}}>
          <span>📱</span>
          <span>{completed?"اكتملت":"إرسال يدوي"}: {template.name}</span>
        </h2>
        <div style={{fontSize:FS-2,color:T.textSec,marginTop:4}}>{segment.label} · {items.length} عميل {eta && !completed && " · متبقي "+eta}</div>
      </div>
      <Btn ghost onClick={onClose}>✕ {completed?"إغلاق":"خروج (يحفظ تلقائياً للاستئناف)"}</Btn>
    </div>

    {/* Progress */}
    <Card>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:12}}>
        <Stat label="✓ تم" value={counts.sent} color={T.ok}/>
        <Stat label="⊘ تخطّى" value={counts.skipped} color={T.warn}/>
        <Stat label="✕ فشل" value={counts.failed} color={T.err}/>
        <Stat label="⏳ متبقي" value={counts.pending} color={T.textSec}/>
      </div>
      <div style={{height:8,borderRadius:4,background:T.bg,overflow:"hidden",marginBottom:8}}>
        <div style={{
          height:"100%",
          width:((counts.sent+counts.skipped+counts.failed)/Math.max(1,items.length))*100+"%",
          background:"linear-gradient(90deg, "+T.ok+", "+T.accent+")",
          transition:"width 0.3s",
        }}/>
      </div>
      <div style={{textAlign:"center",fontSize:FS-2,color:T.textSec,fontWeight:700}}>
        {counts.sent+counts.skipped+counts.failed} من {items.length} ({Math.round(((counts.sent+counts.skipped+counts.failed)/Math.max(1,items.length))*100)}%)
      </div>
    </Card>

    {/* Current message preview */}
    {!completed && current && <Card title={"الرسالة الحالية"} accent="#25D366" style={{marginTop:14}}>
      <div style={{display:"flex",gap:12,marginBottom:12,alignItems:"center",padding:10,borderRadius:8,background:T.bg}}>
        <div style={{
          width:44,height:44,borderRadius:"50%",
          background:"#25D36620",color:"#25D366",
          display:"flex",alignItems:"center",justifyContent:"center",
          fontSize:18,fontWeight:900,flexShrink:0,
        }}>{(current.name||"?").charAt(0)}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:800,fontSize:FS}}>{current.name}</div>
          <div style={{fontSize:FS-2,color:T.textSec,direction:"ltr",textAlign:"left"}}>{current.phone}</div>
        </div>
        <Btn small onClick={() => blockCustomer(current)} style={{background:T.err+"15",color:T.err,border:"1px solid "+T.err+"30"}} title="حظر هذا العميل من كل الحملات">🚫</Btn>
      </div>

      {!editingMsg && <div style={{padding:12,borderRadius:10,background:"#DCF8C6",fontSize:FS,whiteSpace:"pre-wrap",lineHeight:1.7,maxWidth:400,position:"relative"}}>
        {current.customMessage || personalize(template.body, current)}
        {!current.customMessage && template.imageUrl && <div style={{marginTop:6,fontSize:FS-2,color:"#0E7490"}}>🖼 {template.imageUrl}</div>}
        {current.customMessage && <div style={{position:"absolute",top:4,left:4,fontSize:FS-3,padding:"2px 8px",borderRadius:10,background:T.warn+"20",color:T.warn,fontWeight:700}}>✏️ معدّلة</div>}
      </div>}

      {editingMsg && <div>
        <textarea
          value={draftMsg}
          onChange={e => setDraftMsg(e.target.value)}
          rows={6}
          style={{width:"100%",padding:10,borderRadius:8,border:"2px solid "+T.accent,fontSize:FS,fontFamily:"inherit",direction:"rtl",resize:"vertical",background:T.cardSolid,color:T.text}}
        />
        <div style={{display:"flex",gap:6,marginTop:8}}>
          <Btn small primary onClick={() => {
            setItems(prev => prev.map((it, i) => i === currentRealIdx ? {...it, customMessage: draftMsg} : it));
            setEditingMsg(false);
            showToast("✓ تم تحديث الرسالة");
          }}>✓ احفظ التعديل</Btn>
          <Btn small onClick={() => {
            setItems(prev => prev.map((it, i) => i === currentRealIdx ? {...it, customMessage: null} : it));
            setEditingMsg(false);
            showToast("✓ تم استرجاع الرسالة الأصلية");
          }} style={{background:T.warn+"15",color:T.warn}}>↩ استرجاع الأصلية</Btn>
          <Btn small ghost onClick={() => setEditingMsg(false)}>إلغاء</Btn>
        </div>
      </div>}

      {!editingMsg && <Btn small onClick={() => {
        setDraftMsg(current.customMessage || personalize(template.body, current));
        setEditingMsg(true);
      }} style={{marginTop:8,background:T.accent+"15",color:T.accent,border:"1px solid "+T.accent+"30"}}>✏️ تعديل الرسالة لهذا العميل</Btn>}

      {overCap && <div style={{marginTop:12,padding:10,borderRadius:8,background:T.err+"10",border:"1px solid "+T.err+"30",color:T.err,fontSize:FS-1,fontWeight:700}}>
        ⛔ وصلت لحد الإرسال اليومي ({DEFAULT_DAILY_CAP} رسالة) — كمل بكرة لحماية رقم الواتساب.
      </div>}

      <div style={{display:"flex",gap:8,marginTop:14,flexWrap:"wrap",alignItems:"center"}}>
        <Btn primary disabled={overCap || paused} onClick={() => sendCurrent()} style={{background:"#25D366",borderColor:"#25D366",fontSize:FS+1}}>
          📤 ابعت لـ {current.name?.slice(0,20)}
        </Btn>
        <Btn onClick={() => setSkipDialog(true)} style={{background:T.warn+"15",color:T.warn,border:"1px solid "+T.warn+"30"}}>⊘ تخطّى مع ملاحظة</Btn>
        <Btn onClick={() => skipCurrent()} style={{background:T.warn+"08",color:T.warn,border:"1px solid "+T.warn+"20"}}>⊘ تخطّى</Btn>
        {lastAction && <Btn onClick={undoLast} style={{background:"#3B82F615",color:"#3B82F6",border:"1px solid #3B82F640"}}>↩ تراجع</Btn>}
        <Btn onClick={() => setPaused(!paused)} style={{background:paused?T.ok+"15":T.warn+"15",color:paused?T.ok:T.warn,border:"1px solid "+T.brd}}>
          {paused?"▶ استئناف":"⏸ إيقاف مؤقت"}
        </Btn>
      </div>

      {/* V19.29: Skip with note dialog */}
      {skipDialog && <div onClick={() => setSkipDialog(false)} style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.55)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(3px)"}}>
        <div onClick={e => e.stopPropagation()} style={{background:T.cardSolid,borderRadius:14,padding:18,width:"100%",maxWidth:400,border:"1px solid "+T.brd}}>
          <div style={{fontSize:FS+1,fontWeight:800,marginBottom:10}}>⊘ تخطّي عميل</div>
          <div style={{fontSize:FS-2,color:T.textSec,marginBottom:8}}>سبب التخطي (للأرشيف):</div>
          <Inp value={skipNote} onChange={setSkipNote} placeholder="مثال: قال يكلمنا الأسبوع الجاي"/>
          <div style={{display:"flex",gap:6,justifyContent:"flex-end",marginTop:14}}>
            <Btn ghost onClick={() => { setSkipDialog(false); setSkipNote(""); }}>إلغاء</Btn>
            <Btn primary onClick={() => { skipCurrent(skipNote); setSkipDialog(false); setSkipNote(""); }}>✓ تخطّى</Btn>
          </div>
        </div>
      </div>}

      <div style={{marginTop:10,fontSize:FS-3,color:T.textMut,lineHeight:1.6}}>
        💡 الزر يفتحلك واتساب برسالة جاهزة. اضغط Send في واتساب، ارجع، اضغط الزر تاني للعميل اللي بعده.
      </div>
    </Card>}

    {completed && <Card style={{marginTop:14}}>
      <div style={{textAlign:"center",padding:24}}>
        <div style={{fontSize:48,marginBottom:8}}>🎉</div>
        <div style={{fontSize:FS+4,fontWeight:900,color:T.ok,marginBottom:8}}>اكتملت الحملة</div>
        <div style={{fontSize:FS,color:T.textSec,marginBottom:16}}>
          تم: {counts.sent} · تخطّى: {counts.skipped} · فشل: {counts.failed}
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
          {counts.failed > 0 && <Btn onClick={resendFailures} style={{background:T.warn+"15",color:T.warn,border:"1px solid "+T.warn+"40"}}>
            🔁 إعادة الفاشل ({counts.failed})
          </Btn>}
          <Btn primary onClick={onClose}>✓ تم</Btn>
        </div>
      </div>
    </Card>}

    {!completed && <div style={{marginTop:14,textAlign:"center",display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
      {counts.failed > 0 && <Btn onClick={resendFailures} style={{background:T.warn+"15",color:T.warn,border:"1px solid "+T.warn+"40"}}>
        🔁 إعادة الفاشل ({counts.failed})
      </Btn>}
      <Btn ghost onClick={finishEarly} style={{color:T.err}}>إنهاء الحملة الآن</Btn>
    </div>}

    {/* V19.29: Customer list with search + filter */}
    <Card title={"قائمة العملاء (" + filteredItems.length + (filteredItems.length !== items.length ? " من " + items.length : "") + ")"} style={{marginTop:14}}>
      {/* Filters row */}
      <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
        <div style={{flex:1,minWidth:160}}>
          <Inp value={searchQ} onChange={setSearchQ} placeholder="🔍 ابحث بالاسم أو الرقم..." style={{width:"100%"}}/>
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{padding:"7px 10px",borderRadius:8,border:"1px solid "+T.brd,fontSize:FS-1,background:T.cardSolid,color:T.text,cursor:"pointer"}}>
          <option value="active">⏳ النشط فقط</option>
          <option value="all">الكل</option>
          <option value="pending">⏳ pending</option>
          <option value="sent">✓ مبعوت</option>
          <option value="skipped">⊘ متخطّى</option>
          <option value="failed">✕ فشل</option>
        </select>
        <label style={{display:"flex",alignItems:"center",gap:5,fontSize:FS-2,color:T.textSec,cursor:"pointer"}} title="إخفاء العملاء اللي اتعالجوا من قائمة 'النشط فقط'">
          <input type="checkbox" checked={autoRemoveSent} onChange={e => setAutoRemoveSent(e.target.checked)} style={{width:14,height:14}}/>
          إخفاء المُعالَج
        </label>
      </div>
      {/* List */}
      <div style={{maxHeight:400,overflowY:"auto",border:"1px solid "+T.brd,borderRadius:8}}>
        {filteredItems.length === 0 && <div style={{padding:20,textAlign:"center",color:T.textMut,fontSize:FS-2}}>
          {searchQ ? "مفيش نتايج" : statusFilter==="active" ? "✓ خلصنا — مفيش عملاء نشطين" : "لا يوجد"}
        </div>}
        {filteredItems.map(it => {
          const realIdx = items.findIndex(x => x.id === it.id);
          const isCurrent = realIdx === currentRealIdx && !completed;
          return <div key={it.id} style={{
            display:"flex",alignItems:"center",gap:10,padding:"8px 12px",
            borderBottom:"1px solid "+T.brd,
            background: isCurrent ? T.accent+"10" : "transparent",
            cursor: it.status === "pending" ? "pointer" : "default",
            opacity: it.status === "pending" ? 1 : 0.65,
          }} onClick={() => it.status === "pending" && jumpTo(realIdx)}>
            <div style={{width:30,fontSize:FS-2,color:T.textMut,fontWeight:700,textAlign:"center"}}>
              {isCurrent ? "▶" : (realIdx+1)}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,fontSize:FS-1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                {it.name} {it.customMessage && <span title="رسالة معدّلة" style={{color:T.warn,fontSize:FS-3}}>✏️</span>}
              </div>
              <div style={{fontSize:FS-3,color:T.textSec,direction:"ltr",textAlign:"left"}}>{it.phone}</div>
              {it.skipNote && <div style={{fontSize:FS-3,color:T.warn,fontStyle:"italic",marginTop:1}}>⊘ {it.skipNote}</div>}
            </div>
            <div style={{fontSize:FS-2,fontWeight:700,whiteSpace:"nowrap",
              color: it.status==="sent"?T.ok:it.status==="skipped"?T.warn:it.status==="failed"?T.err:T.textSec
            }}>
              {it.status==="sent"?"✓ مبعوت":it.status==="skipped"?"⊘ متخطّى":it.status==="failed"?"✕ فشل":"⏳"}
              {it.sentAt && <div style={{fontSize:FS-3,color:T.textMut,fontWeight:400}}>{new Date(it.sentAt).toLocaleTimeString("ar-EG",{hour:"2-digit",minute:"2-digit"})}</div>}
            </div>
          </div>;
        })}
      </div>
      {/* Hint */}
      <div style={{marginTop:8,fontSize:FS-3,color:T.textMut,lineHeight:1.6}}>
        💡 اضغط على أي عميل pending للقفز إليه مباشرة. الحالة بتتحدث تلقائياً مع كل إرسال.
      </div>
    </Card>
  </div>;
}

/* ═══════════════════════════════════════════════════════════════════════
   V19.28: CHOOSE SEND MODE — Manual (WhatsApp Web click) vs Bridge (auto)
   ═══════════════════════════════════════════════════════════════════════ */
/* V19.70.5: image compression for campaign attachments.
   Resizes to max 1024px on the long side, JPEG quality 0.7. Returns the
   data URL ("data:image/jpeg;base64,..."). The caller strips the prefix. */
function _compressForCampaign(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width, h = img.height;
        const max = 1024;
        if (w > max || h > max) {
          if (w > h) { h = Math.round(h * max / w); w = max; }
          else       { w = Math.round(w * max / h); h = max; }
        }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        try { resolve(canvas.toDataURL("image/jpeg", 0.7)); }
        catch (err) { reject(err); }
      };
      img.onerror = () => reject(new Error("invalid image"));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}

function ChooseSendMode({campaign, bridgeUrl, bridgeToken, onCancel, onPickManual, onPickBridge, onOpenBridgeSettings, onPickScheduled}){
  const [bridgeStatus, setBridgeStatus] = useState({state:"checking", error:""});
  /* V19.70.4: schedule-for-later option — inline datetime picker */
  const [scheduling, setScheduling] = useState(false);
  const _defaultSchedTime = (() => {
    const d = new Date(Date.now() + 60*60*1000);/* default = +1 hour */
    return d.toISOString().slice(0,16);/* format for input[type=datetime-local] */
  })();
  const [schedAt, setSchedAt] = useState(_defaultSchedTime);
  /* V19.70.6: recurrence options.
     type: "once" (default) | "daily" | "weekly" | "monthly" | "range"
     - daily:   timeOfDay only (e.g. every day at 09:00)
     - weekly:  daysOfWeek[] (e.g. every Monday + Wednesday at 09:00)
     - monthly: dayOfMonth (1-28) + timeOfDay
     - range:   rangeStart..rangeEnd (daily within range, at timeOfDay)
     Optional end-condition: maxOccurrences OR endDate (whichever first). */
  const [recType, setRecType] = useState("once");
  const [recTimeOfDay, setRecTimeOfDay] = useState("09:00");
  const [recDaysOfWeek, setRecDaysOfWeek] = useState([1]);/* default: Monday */
  const [recDayOfMonth, setRecDayOfMonth] = useState(1);
  const [recRangeStart, setRecRangeStart] = useState(new Date().toISOString().slice(0,10));
  const [recRangeEnd, setRecRangeEnd] = useState((() => {
    const d = new Date(Date.now() + 30*86400000);/* default: today + 30d */
    return d.toISOString().slice(0,10);
  })());
  const [recMaxOccurrences, setRecMaxOccurrences] = useState("");
  const [recEndDate, setRecEndDate] = useState("");
  const _DOW_LABELS = ["أحد","إثنين","ثلاثاء","أربعاء","خميس","جمعة","سبت"];
  /* V19.70.5: image attachments for scheduled campaigns.
     Each image: {name, mime, base64} — ready to feed the bridge `media[]` array.
     Max 4 images, ~200KB each after compression. Total inline ≤ ~800KB per
     scheduled campaign — fits in Firestore 1MB doc limit comfortably. */
  const [schedImages, setSchedImages] = useState([]);/* [{name, mime, base64, size}] */
  const onPickImages = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    if (schedImages.length + files.length > 4) {
      alert("الحد الأقصى 4 صور. شيل بعض الصور قبل ما تضيف."); return;
    }
    const compressed = [];
    for (const f of files) {
      if (!f.type.startsWith("image/")) {
        alert(f.name + ": مش صورة، يتم تجاهله"); continue;
      }
      try {
        const dataUrl = await _compressForCampaign(f);
        const b64 = dataUrl.split(",")[1] || "";
        const sizeKB = Math.round(b64.length * 0.75 / 1024);
        if (sizeKB > 200) {
          alert(f.name + ": " + sizeKB + "KB — كبيرة جداً، اختار صورة أصغر"); continue;
        }
        compressed.push({ name: f.name, mime: "image/jpeg", base64: b64, size: sizeKB });
      } catch (err) { alert(f.name + ": فشل الضغط — " + err.message); }
    }
    if (compressed.length > 0) setSchedImages([...schedImages, ...compressed]);
    e.target.value = "";/* reset input */
  };
  const removeImage = (idx) => setSchedImages(schedImages.filter((_, i) => i !== idx));

  useEffect(() => {
    let dead = false;
    bridge.status(bridgeUrl, bridgeToken)
      .then(s => { if(!dead) setBridgeStatus({state: s.waReady ? "ready" : (s.waState||"unknown"), info: s, error:""}); })
      .catch(e => { if(!dead) setBridgeStatus({state: "offline", error: e.message}); });
    return () => { dead = true; };
  }, [bridgeUrl, bridgeToken]);

  const audCount = campaign.audience.length;
  return <div style={{padding:16,maxWidth:700,margin:"0 auto"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
      <h2 style={{margin:0,fontSize:FS+3,fontWeight:900}}>📤 طريقة الإرسال</h2>
      <Btn ghost onClick={onCancel}>✕ إلغاء</Btn>
    </div>
    <Card>
      <div style={{padding:10,borderRadius:8,background:T.bg,marginBottom:14,fontSize:FS-1}}>
        <div><b>القالب:</b> {campaign.template.name}</div>
        <div><b>الجمهور:</b> {campaign.segment.label} · <b>{audCount}</b> عميل</div>
      </div>

      {/* Manual mode card */}
      <div onClick={onPickManual} style={{cursor:"pointer",padding:14,borderRadius:12,background:T.cardSolid,border:"2px solid "+T.brd,marginBottom:12,transition:"all 0.15s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.accent;e.currentTarget.style.background=T.accent+"08"}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.brd;e.currentTarget.style.background=T.cardSolid}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <div style={{fontSize:FS+1,fontWeight:800,color:T.text,display:"flex",alignItems:"center",gap:6}}>
            <span>👆</span><span>الوضع اليدوي (الافتراضي)</span>
          </div>
          <span style={{padding:"3px 10px",borderRadius:20,fontSize:FS-3,background:T.ok+"18",color:T.ok,fontWeight:700}}>آمن 100%</span>
        </div>
        <div style={{fontSize:FS-2,color:T.textSec,lineHeight:1.7}}>
          كل عميل بيتفتح في WhatsApp Web وأنت تدوس "إرسال". الرسالة بتتشخصن جاهزة، تخطّى وقفل لو محتاج. <b>قانوني تماماً ورقمك آمن.</b>
        </div>
      </div>

      {/* Bridge mode card */}
      <div onClick={() => bridgeStatus.state==="ready"?onPickBridge():null} style={{cursor:bridgeStatus.state==="ready"?"pointer":"default",padding:14,borderRadius:12,background:bridgeStatus.state==="ready"?T.cardSolid:T.bg+"50",border:"2px solid "+(bridgeStatus.state==="ready"?T.brd:T.brd+"50"),opacity:bridgeStatus.state==="ready"?1:0.7,transition:"all 0.15s"}} onMouseEnter={e=>{if(bridgeStatus.state==="ready"){e.currentTarget.style.borderColor="#10B981";e.currentTarget.style.background="#10B98108"}}} onMouseLeave={e=>{if(bridgeStatus.state==="ready"){e.currentTarget.style.borderColor=T.brd;e.currentTarget.style.background=T.cardSolid}}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6,flexWrap:"wrap",gap:6}}>
          <div style={{fontSize:FS+1,fontWeight:800,color:T.text,display:"flex",alignItems:"center",gap:6}}>
            <span>🤖</span><span>وضع التلقائي (Bridge)</span>
          </div>
          {bridgeStatus.state==="ready" && <span style={{padding:"3px 10px",borderRadius:20,fontSize:FS-3,background:"#10B98118",color:"#10B981",fontWeight:700}}>● متصل</span>}
          {bridgeStatus.state==="QR" && <span style={{padding:"3px 10px",borderRadius:20,fontSize:FS-3,background:T.warn+"18",color:T.warn,fontWeight:700}}>محتاج QR scan</span>}
          {bridgeStatus.state==="offline" && <span style={{padding:"3px 10px",borderRadius:20,fontSize:FS-3,background:T.err+"18",color:T.err,fontWeight:700}}>● غير متصل</span>}
          {bridgeStatus.state==="checking" && <span style={{padding:"3px 10px",borderRadius:20,fontSize:FS-3,background:T.bg,color:T.textSec}}>... يفحص</span>}
        </div>
        <div style={{fontSize:FS-2,color:T.textSec,lineHeight:1.7,marginBottom:8}}>
          كل الرسايل بتتبعت أوتوماتيكياً عبر WhatsApp Web Bridge. سرعة عالية، delays عشوائية، daily cap، detect opt-outs. <b style={{color:T.warn}}>⚠️ مخالف لشروط واتساب — استخدم رقم احتياطي.</b>
        </div>
        {bridgeStatus.state==="ready" && bridgeStatus.info && <div style={{fontSize:FS-3,color:T.textMut,padding:8,background:T.bg,borderRadius:6}}>
          متصل كـ <b>{bridgeStatus.info.myName||bridgeStatus.info.myNumber}</b> · رسايل اليوم: <b>{bridgeStatus.info.daily?.sent||0}/{bridgeStatus.info.settings?.dailyCap||80}</b>
        </div>}
        {bridgeStatus.state!=="ready" && <Btn small onClick={(e)=>{e.stopPropagation();onOpenBridgeSettings()}} style={{background:T.warn+"15",color:T.warn,border:"1px solid "+T.warn+"40"}}>⚙️ إعداد البريدج</Btn>}
      </div>

      {bridgeStatus.error && <div style={{marginTop:8,fontSize:FS-3,color:T.err,padding:8,background:T.err+"08",borderRadius:6,direction:"ltr",textAlign:"left"}}>
        Bridge error: {bridgeStatus.error}
      </div>}

      {/* V19.70.4: Schedule-for-later mode card */}
      <div style={{marginTop:12, padding:14, borderRadius:12, background: scheduling ? T.accent+"08" : T.cardSolid, border: "2px solid "+(scheduling?T.accent:T.brd), transition:"all 0.15s"}}>
        <div onClick={() => !scheduling && setScheduling(true)} style={{cursor: scheduling ? "default" : "pointer"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <div style={{fontSize:FS+1,fontWeight:800,color:T.text,display:"flex",alignItems:"center",gap:6}}>
              <span>📅</span><span>جدولة لوقت لاحق</span>
            </div>
            <span style={{padding:"3px 10px",borderRadius:20,fontSize:FS-3,background:T.accent+"18",color:T.accent,fontWeight:700}}>
              {bridgeStatus.state==="ready" ? "Bridge جاهز" : "محتاج Bridge"}
            </span>
          </div>
          <div style={{fontSize:FS-2,color:T.textSec,lineHeight:1.7}}>
            احفظ الحملة لتشتغل تلقائياً في وقت محدد عبر الـBridge. الـVPS cron يـcheck كل 5 دقائق ويبدأ الإرسال عند وصول الميعاد.
            {bridgeStatus.state!=="ready" && <span style={{color:T.warn, fontWeight:700}}> ⚠️ الـBridge لازم يبقى جاهز وقت التشغيل.</span>}
          </div>
        </div>
        {scheduling && (
          <div style={{marginTop:12, padding:12, background:T.bg, borderRadius:8, border:"1px solid "+T.brd}}>
            {/* V19.70.6: recurrence type selector */}
            <label style={{fontSize:FS-2, fontWeight:700, color:T.textSec, display:"block", marginBottom:6}}>
              🔄 نوع التكرار:
            </label>
            <div style={{display:"flex", gap:6, flexWrap:"wrap", marginBottom:10}}>
              {[
                {k:"once",    label:"📅 مرة واحدة"},
                {k:"daily",   label:"🔁 يومي"},
                {k:"weekly",  label:"📆 أسبوعي"},
                {k:"monthly", label:"🗓 شهري"},
                {k:"range",   label:"📊 فترة محددة"},
              ].map(opt => (
                <div key={opt.k} onClick={() => setRecType(opt.k)} style={{
                  padding:"6px 12px", borderRadius:8, cursor:"pointer", fontSize:FS-1, fontWeight:700,
                  background: recType === opt.k ? T.accent+"20" : T.cardSolid,
                  border: "1px solid " + (recType === opt.k ? T.accent : T.brd),
                  color: recType === opt.k ? T.accent : T.textSec,
                }}>{opt.label}</div>
              ))}
            </div>

            {/* Type-specific inputs */}
            {recType === "once" && (
              <>
                <label style={{fontSize:FS-2, fontWeight:700, color:T.textSec, display:"block", marginBottom:6}}>
                  📆 تاريخ ووقت التشغيل (بتوقيت القاهرة):
                </label>
                <input type="datetime-local" value={schedAt} onChange={(e) => setSchedAt(e.target.value)}
                  min={new Date().toISOString().slice(0,16)}
                  style={{width:"100%", padding:"8px 10px", fontSize:FS, border:"1px solid "+T.brd, borderRadius:6, background:T.cardSolid, color:T.text, marginBottom:10}}/>
              </>
            )}
            {recType === "daily" && (
              <div style={{display:"flex", gap:8, alignItems:"center", marginBottom:10}}>
                <label style={{fontSize:FS-2, fontWeight:700, color:T.textSec, minWidth:130}}>
                  ⏰ الوقت اليومي:
                </label>
                <input type="time" value={recTimeOfDay} onChange={(e) => setRecTimeOfDay(e.target.value)}
                  style={{flex:1, padding:"8px 10px", fontSize:FS, border:"1px solid "+T.brd, borderRadius:6, background:T.cardSolid, color:T.text}}/>
              </div>
            )}
            {recType === "weekly" && (
              <>
                <label style={{fontSize:FS-2, fontWeight:700, color:T.textSec, display:"block", marginBottom:6}}>
                  📆 الأيام:
                </label>
                <div style={{display:"flex", gap:4, flexWrap:"wrap", marginBottom:10}}>
                  {_DOW_LABELS.map((label, idx) => {
                    const on = recDaysOfWeek.includes(idx);
                    return (
                      <div key={idx} onClick={() => {
                        if (on) setRecDaysOfWeek(recDaysOfWeek.filter(d => d !== idx));
                        else setRecDaysOfWeek([...recDaysOfWeek, idx].sort());
                      }} style={{
                        padding:"6px 12px", borderRadius:8, cursor:"pointer", fontSize:FS-2, fontWeight:700,
                        background: on ? T.accent+"20" : T.cardSolid,
                        border: "1px solid " + (on ? T.accent : T.brd),
                        color: on ? T.accent : T.textSec,
                      }}>{on ? "☑" : "☐"} {label}</div>
                    );
                  })}
                </div>
                <div style={{display:"flex", gap:8, alignItems:"center", marginBottom:10}}>
                  <label style={{fontSize:FS-2, fontWeight:700, color:T.textSec, minWidth:130}}>⏰ الوقت:</label>
                  <input type="time" value={recTimeOfDay} onChange={(e) => setRecTimeOfDay(e.target.value)}
                    style={{flex:1, padding:"8px 10px", fontSize:FS, border:"1px solid "+T.brd, borderRadius:6, background:T.cardSolid, color:T.text}}/>
                </div>
              </>
            )}
            {recType === "monthly" && (
              <>
                <div style={{display:"flex", gap:8, alignItems:"center", marginBottom:10}}>
                  <label style={{fontSize:FS-2, fontWeight:700, color:T.textSec, minWidth:130}}>📅 يوم الشهر:</label>
                  <input type="number" min={1} max={28} value={recDayOfMonth} onChange={(e) => setRecDayOfMonth(Math.max(1, Math.min(28, Number(e.target.value)||1)))}
                    style={{width:80, padding:"8px 10px", fontSize:FS, border:"1px solid "+T.brd, borderRadius:6, background:T.cardSolid, color:T.text}}/>
                  <span style={{fontSize:FS-3, color:T.textMut}}>(1-28 لتجنب اختلاف الأشهر)</span>
                </div>
                <div style={{display:"flex", gap:8, alignItems:"center", marginBottom:10}}>
                  <label style={{fontSize:FS-2, fontWeight:700, color:T.textSec, minWidth:130}}>⏰ الوقت:</label>
                  <input type="time" value={recTimeOfDay} onChange={(e) => setRecTimeOfDay(e.target.value)}
                    style={{flex:1, padding:"8px 10px", fontSize:FS, border:"1px solid "+T.brd, borderRadius:6, background:T.cardSolid, color:T.text}}/>
                </div>
              </>
            )}
            {recType === "range" && (
              <>
                <div style={{display:"flex", gap:8, alignItems:"center", marginBottom:8}}>
                  <label style={{fontSize:FS-2, fontWeight:700, color:T.textSec, minWidth:130}}>📅 من تاريخ:</label>
                  <input type="date" value={recRangeStart} onChange={(e) => setRecRangeStart(e.target.value)}
                    style={{flex:1, padding:"8px 10px", fontSize:FS, border:"1px solid "+T.brd, borderRadius:6, background:T.cardSolid, color:T.text}}/>
                </div>
                <div style={{display:"flex", gap:8, alignItems:"center", marginBottom:8}}>
                  <label style={{fontSize:FS-2, fontWeight:700, color:T.textSec, minWidth:130}}>📅 إلى تاريخ:</label>
                  <input type="date" value={recRangeEnd} onChange={(e) => setRecRangeEnd(e.target.value)}
                    style={{flex:1, padding:"8px 10px", fontSize:FS, border:"1px solid "+T.brd, borderRadius:6, background:T.cardSolid, color:T.text}}/>
                </div>
                <div style={{display:"flex", gap:8, alignItems:"center", marginBottom:10}}>
                  <label style={{fontSize:FS-2, fontWeight:700, color:T.textSec, minWidth:130}}>⏰ الوقت اليومي:</label>
                  <input type="time" value={recTimeOfDay} onChange={(e) => setRecTimeOfDay(e.target.value)}
                    style={{flex:1, padding:"8px 10px", fontSize:FS, border:"1px solid "+T.brd, borderRadius:6, background:T.cardSolid, color:T.text}}/>
                </div>
                <div style={{fontSize:FS-3, color:T.textMut, marginBottom:10}}>
                  💡 الحملة هتشتغل يومياً من تاريخ البداية لتاريخ النهاية في الوقت المحدد.
                </div>
              </>
            )}

            {/* End-condition (for repeating types) */}
            {recType !== "once" && recType !== "range" && (
              <div style={{padding:8, background:T.cardSolid, border:"1px dashed "+T.brd, borderRadius:6, marginBottom:10}}>
                <div style={{fontSize:FS-3, fontWeight:700, color:T.textSec, marginBottom:6}}>⏹ شرط الإيقاف (اختياري):</div>
                <div style={{display:"flex", gap:8, alignItems:"center", marginBottom:6}}>
                  <span style={{fontSize:FS-3, color:T.textMut, minWidth:80}}>بعد عدد:</span>
                  <input type="number" min={0} value={recMaxOccurrences} onChange={(e) => setRecMaxOccurrences(e.target.value)}
                    placeholder="مثلاً 10 مرات (فاضي = مفيش حد)"
                    style={{flex:1, padding:"4px 8px", fontSize:FS-2, border:"1px solid "+T.brd, borderRadius:4, background:T.bg, color:T.text}}/>
                </div>
                <div style={{display:"flex", gap:8, alignItems:"center"}}>
                  <span style={{fontSize:FS-3, color:T.textMut, minWidth:80}}>أو لتاريخ:</span>
                  <input type="date" value={recEndDate} onChange={(e) => setRecEndDate(e.target.value)}
                    style={{flex:1, padding:"4px 8px", fontSize:FS-2, border:"1px solid "+T.brd, borderRadius:4, background:T.bg, color:T.text}}/>
                </div>
              </div>
            )}

            {/* V19.70.5: image picker */}
            <label style={{fontSize:FS-2, fontWeight:700, color:T.textSec, display:"block", marginBottom:6, marginTop:8}}>
              📷 الصور (اختياري — حد أقصى 4 صور، ≤200KB لكل واحدة):
            </label>
            <input type="file" accept="image/*" multiple onChange={onPickImages}
              style={{width:"100%", padding:"6px 8px", fontSize:FS-1, border:"1px dashed "+T.brd, borderRadius:6, background:T.cardSolid, color:T.text, marginBottom:8}}/>
            {schedImages.length > 0 && (
              <div style={{display:"flex", flexWrap:"wrap", gap:8, marginBottom:10}}>
                {schedImages.map((img, idx) => (
                  <div key={idx} style={{position:"relative", width:80, height:80, borderRadius:6, overflow:"hidden", border:"1px solid "+T.brd}}>
                    <img src={"data:"+img.mime+";base64,"+img.base64} alt={img.name} style={{width:"100%", height:"100%", objectFit:"cover"}}/>
                    <span onClick={() => removeImage(idx)} style={{
                      position:"absolute", top:2, right:2, width:18, height:18, borderRadius:9,
                      background:T.err, color:"#fff", fontSize:11, fontWeight:700,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      cursor:"pointer"
                    }}>×</span>
                    <div style={{position:"absolute", bottom:0, left:0, right:0, background:"rgba(0,0,0,0.6)", color:"#fff", fontSize:9, padding:"1px 4px", textAlign:"center"}}>{img.size}KB</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{fontSize:FS-3, color:T.textMut, marginBottom:10, lineHeight:1.5}}>
              💡 الحملة هتبدأ في الوقت المحدد (±5 دقايق granularity). تقدر تـcancel من tab "📅 المجدولة".
              {schedImages.length > 0 && <span style={{display:"block", marginTop:4}}>📎 {schedImages.length} صورة مرفقة — هتتبعت مع كل رسالة.</span>}
            </div>
            <div style={{display:"flex",gap:8}}>
              <Btn primary onClick={() => {
                /* V19.70.6: build the recurrence object + first scheduledAt based on type */
                let firstAtIso, recurrence = null;
                const cairoTimeMs = (h, m) => h * 60 + m;
                const parseTime = (t) => { const x = String(t||"").match(/^(\d{1,2}):(\d{2})/); return x?[+x[1],+x[2]]:[9,0]; };
                if (recType === "once") {
                  if (!schedAt) { alert("اختار تاريخ"); return; }
                  const ts = Date.parse(schedAt);
                  if (!ts || ts <= Date.now()) { alert("اختار وقت في المستقبل"); return; }
                  firstAtIso = new Date(ts).toISOString();
                } else {
                  const [hh, mm] = parseTime(recTimeOfDay);
                  /* Compute first fire time for recurring patterns */
                  if (recType === "weekly" && recDaysOfWeek.length === 0) {
                    alert("اختار يوم واحد على الأقل"); return;
                  }
                  if (recType === "range") {
                    if (!recRangeStart || !recRangeEnd) { alert("اختار تاريخ بداية ونهاية"); return; }
                    if (recRangeEnd < recRangeStart) { alert("تاريخ النهاية لازم يكون بعد البداية"); return; }
                  }
                  /* For first fire: use TODAY if today's time hasn't passed; else next occurrence.
                     The cron will compute subsequent fires; we just need a reasonable first marker. */
                  const now = new Date();
                  const today = now.toISOString().slice(0,10);
                  let baseDate = today;
                  if (recType === "range" && recRangeStart > today) baseDate = recRangeStart;
                  /* If recType=monthly and today's day-of-month is past dayOfMonth, fire next month */
                  if (recType === "monthly") {
                    const dom = recDayOfMonth;
                    const todayDom = now.getDate();
                    if (todayDom > dom || (todayDom === dom && (now.getHours() * 60 + now.getMinutes()) > cairoTimeMs(hh, mm))) {
                      const next = new Date(now.getFullYear(), now.getMonth() + 1, dom, hh, mm, 0);
                      baseDate = next.toISOString().slice(0,10);
                    } else {
                      const cur = new Date(now.getFullYear(), now.getMonth(), dom, hh, mm, 0);
                      baseDate = cur.toISOString().slice(0,10);
                    }
                  }
                  firstAtIso = new Date(baseDate + "T" + String(hh).padStart(2,"0") + ":" + String(mm).padStart(2,"0") + ":00").toISOString();
                  recurrence = {
                    type: recType,
                    timeOfDay: recTimeOfDay,
                    daysOfWeek: recType === "weekly" ? recDaysOfWeek : [],
                    dayOfMonth: recType === "monthly" ? recDayOfMonth : null,
                    rangeStart: recType === "range" ? recRangeStart : null,
                    rangeEnd: recType === "range" ? recRangeEnd : null,
                    maxOccurrences: recMaxOccurrences ? Math.max(1, Number(recMaxOccurrences)||0) : null,
                    endDate: recEndDate || null,
                  };
                }
                onPickScheduled(firstAtIso, schedImages, recurrence);
              }} style={{background:T.accent, color:"#fff", border:"none", fontWeight:800}}>
                💾 احفظ الجدولة
              </Btn>
              <Btn ghost onClick={() => { setScheduling(false); setSchedImages([]); }}>إلغاء</Btn>
            </div>
          </div>
        )}
      </div>
    </Card>
  </div>;
}

/* ═══════════════════════════════════════════════════════════════════════
   V19.31: BRIDGE SETTINGS — REWRITTEN as tabbed dashboard
   ═══════════════════════════════════════════════════════════════════════
   Tabs:
     1. Dashboard — live status + stats + quick controls + QR (if needed)
     2. Settings  — connection (URL, token), anti-ban config
     3. Stats     — detailed analytics, top recipients, success rate
     4. Activity  — last 100 send attempts log
     5. Tools     — test message, opt-outs management, reset daily, logout
   ═══════════════════════════════════════════════════════════════════════ */
function BridgeSettings({bridgeCfg, canEdit, onSave, onClose}){
  const [tab, setTab] = useState("dashboard");
  /* Settings state — persisted */
  const [url, setUrl] = useState(bridgeCfg.url || DEFAULT_BRIDGE_URL);
  const [token, setToken] = useState(bridgeCfg.token || "");
  const [enabled, setEnabled] = useState(bridgeCfg.enabled !== false);
  const [delayMin, setDelayMin] = useState(bridgeCfg.delayMin || 8);
  const [delayMax, setDelayMax] = useState(bridgeCfg.delayMax || 25);
  const [dailyCap, setDailyCap] = useState(bridgeCfg.dailyCap || 80);
  const [batchSize, setBatchSize] = useState(bridgeCfg.batchSize || 20);
  const [batchBreakMin, setBatchBreakMin] = useState(bridgeCfg.batchBreakMin || 4);
  const [batchBreakMax, setBatchBreakMax] = useState(bridgeCfg.batchBreakMax || 8);
  const [typingMin, setTypingMin] = useState(bridgeCfg.typingMin || 2);
  const [typingMax, setTypingMax] = useState(bridgeCfg.typingMax || 5);
  const [retryFailures, setRetryFailures] = useState(bridgeCfg.retryFailures !== false);
  const [detectOptOuts, setDetectOptOuts] = useState(bridgeCfg.detectOptOuts !== false);

  /* Live data from bridge */
  const [liveStatus, setLiveStatus] = useState(null);
  const [liveStats, setLiveStats] = useState(null);
  const [liveActivity, setLiveActivity] = useState([]);
  const [liveOptOuts, setLiveOptOuts] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [testResult, setTestResult] = useState(null);

  /* Auto-refresh dashboard every 5 sec */
  useEffect(() => {
    if(!url) return;
    let dead = false;
    const fetchAll = async () => {
      setRefreshing(true);
      try {
        const s = await bridge.status(url, token);
        if(!dead) setLiveStatus(s);
      } catch(e) {
        if(!dead) setLiveStatus({error: e.message, waReady: false});
      }
      /* Stats + activity only when token + connected */
      if(token){
        try { const st = await bridge.stats(url, token); if(!dead) setLiveStats(st); } catch {}
        try { const ac = await bridge.activity(url, token, 50); if(!dead) setLiveActivity(ac.activity || []); } catch {}
        try { const oo = await bridge.optouts(url, token); if(!dead) setLiveOptOuts(oo.optOuts || []); } catch {}
      }
      if(!dead) setRefreshing(false);
    };
    fetchAll();
    const iv = setInterval(fetchAll, 5000);
    return () => { dead = true; clearInterval(iv); };
  }, [url, token]);

  /* Test connection (manual button in settings tab) */
  const test = async () => {
    setTestResult(null);
    try {
      const s = await bridge.status(url, token);
      setTestResult({ok: true, status: s});
      if(token){
        try {
          await bridge.settings(url, {
            delayMin: delayMin*1000, delayMax: delayMax*1000,
            dailyCap, batchSize,
            batchBreakMin: batchBreakMin*60*1000, batchBreakMax: batchBreakMax*60*1000,
            typingDelayMin: typingMin*1000, typingDelayMax: typingMax*1000,
            retryFailures, detectOptOuts,
          }, token);
        } catch {}
      }
    } catch(e) {
      setTestResult({ok: false, error: e.message});
    }
  };

  const save = () => {
    onSave({
      enabled, url, token,
      delayMin, delayMax, dailyCap, batchSize,
      batchBreakMin, batchBreakMax,
      typingMin, typingMax,
      retryFailures, detectOptOuts,
    });
  };

  /* Quick action handlers */
  const doPause   = async () => { try { await bridge.pause(url, token); showToast("⏸ تم الإيقاف"); } catch(e){ showToast("✕ "+e.message); } };
  const doResume  = async () => { try { await bridge.resume(url, token); showToast("▶ استؤنف"); } catch(e){ showToast("✕ "+e.message); } };
  const doStop    = async () => { if(!await ask("إيقاف نهائي للطابور؟ هيتم إلغاء الرسائل المعلقة."))return; try { await bridge.stop(url, token); showToast("⏹ تم الإيقاف"); } catch(e){ showToast("✕ "+e.message); } };
  const doClear   = async () => { try { await bridge.clear(url, token); showToast("🧹 تم مسح المكتمل"); } catch(e){ showToast("✕ "+e.message); } };
  const doLogout  = async () => { if(!await ask("قطع الاتصال بالواتساب؟ هتحتاج تمسح QR من جديد."))return; try { await bridge.logout(url, token); showToast("👋 تم قطع الاتصال"); } catch(e){ showToast("✕ "+e.message); } };
  /* V19.37: One-click repair — destroys WA client server-side, sweeps Singleton lock files,
     reinitializes. Saves the user from SSH'ing in for the most common stuck-bridge scenario. */
  const doRepair  = async () => {
    if(!await ask("إصلاح تلقائي للبريدج؟ هيقفل الـ WhatsApp client ويعيد تشغيله. الـ session هتفضل سليمة (مش هتحتاج QR scan جديد). العملية بتاخد ~30 ثانية."))return;
    try {
      const r = await bridge.repair(url, token);
      showToast(`🔧 الإصلاح بدأ — ${r?.locksRemoved||0} lock files اتمسحت. استنى ~30 ث.`);
    } catch(e){
      showToast("✕ فشل الإصلاح: "+e.message);
    }
  };

  return <div style={{padding:16,maxWidth:900,margin:"0 auto"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
      <h2 style={{margin:0,fontSize:FS+3,fontWeight:900,display:"flex",alignItems:"center",gap:8}}>
        <span>⚙️</span><span>إدارة البريدج (الإرسال التلقائي)</span>
      </h2>
      <div style={{display:"flex",gap:6}}>
        {refreshing && <span style={{fontSize:FS-3,color:T.textMut,padding:"4px 8px"}}>🔄 يحدّث...</span>}
        <Btn ghost onClick={onClose}>✕</Btn>
      </div>
    </div>

    {/* Tab bar */}
    <div style={{display:"flex",gap:4,marginBottom:14,borderBottom:"2px solid "+T.brd,overflowX:"auto"}}>
      {[
        ["dashboard", "📊 لوحة المتابعة"],
        ["settings",  "⚙️ الإعدادات"],
        ["stats",     "📈 الإحصائيات"],
        ["activity",  "📋 سجل النشاط"],
        ["tools",     "🛠 أدوات"],
      ].map(([key, label]) => (
        <button key={key} onClick={() => setTab(key)} style={{
          padding:"8px 14px",
          background: tab === key ? T.cardSolid : "transparent",
          border:"none",
          borderBottom: tab === key ? "3px solid "+T.accent : "3px solid transparent",
          color: tab === key ? T.accent : T.textSec,
          fontWeight: tab === key ? 800 : 600,
          fontSize: FS-1,
          cursor: "pointer",
          whiteSpace: "nowrap",
          marginBottom:-2,
        }}>{label}</button>
      ))}
    </div>

    {/* DASHBOARD TAB */}
    {tab === "dashboard" && <DashboardTab
      liveStatus={liveStatus} liveStats={liveStats} liveActivity={liveActivity}
      url={url} token={token}
      onPause={doPause} onResume={doResume} onStop={doStop} onClear={doClear} onLogout={doLogout} onRepair={doRepair}
      canEdit={canEdit}
    />}

    {/* SETTINGS TAB */}
    {tab === "settings" && <SettingsTab
      url={url} setUrl={setUrl}
      token={token} setToken={setToken}
      enabled={enabled} setEnabled={setEnabled}
      delayMin={delayMin} setDelayMin={setDelayMin}
      delayMax={delayMax} setDelayMax={setDelayMax}
      dailyCap={dailyCap} setDailyCap={setDailyCap}
      batchSize={batchSize} setBatchSize={setBatchSize}
      batchBreakMin={batchBreakMin} setBatchBreakMin={setBatchBreakMin}
      batchBreakMax={batchBreakMax} setBatchBreakMax={setBatchBreakMax}
      typingMin={typingMin} setTypingMin={setTypingMin}
      typingMax={typingMax} setTypingMax={setTypingMax}
      retryFailures={retryFailures} setRetryFailures={setRetryFailures}
      detectOptOuts={detectOptOuts} setDetectOptOuts={setDetectOptOuts}
      canEdit={canEdit}
      testResult={testResult}
      onTest={test}
      onSave={save}
    />}

    {/* STATS TAB */}
    {tab === "stats" && <StatsTab liveStats={liveStats} liveStatus={liveStatus}/>}

    {/* ACTIVITY TAB */}
    {tab === "activity" && <ActivityTab activity={liveActivity}/>}

    {/* TOOLS TAB */}
    {tab === "tools" && <ToolsTab
      url={url} token={token}
      liveOptOuts={liveOptOuts}
      canEdit={canEdit}
    />}
  </div>;
}

/* ─────── DASHBOARD TAB ─────── */
function DashboardTab({liveStatus, liveStats, liveActivity, url, token, onPause, onResume, onStop, onClear, onLogout, onRepair, canEdit}){
  if(!liveStatus){
    return <div style={{padding:30,textAlign:"center",color:T.textMut}}>... يحمّل البيانات</div>;
  }
  if(liveStatus.error){
    return <Card>
      <div style={{padding:20,textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:8}}>⚠️</div>
        <div style={{fontSize:FS+2,fontWeight:800,color:T.err,marginBottom:8}}>تعذر الاتصال بالبريدج</div>
        <div style={{fontSize:FS-1,color:T.textSec,direction:"ltr",fontFamily:"monospace",padding:10,background:T.bg,borderRadius:8,display:"inline-block"}}>{liveStatus.error}</div>
        <div style={{marginTop:12,fontSize:FS-2,color:T.textMut,lineHeight:1.7}}>
          راجع الـ URL والـ Token في تبويبة الإعدادات.<br/>
          تأكد إن البريدج شغّال على السيرفر: <code>docker compose ps</code>
        </div>
      </div>
    </Card>;
  }

  const queue = liveStatus.queue || {};
  const daily = liveStatus.daily || {};
  const settings = liveStatus.settings || {};
  const dailyPct = settings.dailyCap ? Math.round((daily.sent || 0) / settings.dailyCap * 100) : 0;
  const isReady = liveStatus.waReady;
  const isPaused = queue.paused;
  const isRunning = queue.running;
  const totalActive = (queue.pending || 0) + (queue.sending || 0);

  return <>
    {/* Connection status card */}
    <Card>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{fontSize:FS-2,color:T.textSec,marginBottom:4}}>حالة الاتصال</div>
          {isReady ? <>
            <div style={{display:"flex",alignItems:"center",gap:8,fontSize:FS+1,fontWeight:900,color:T.ok}}>
              <span style={{width:10,height:10,borderRadius:"50%",background:T.ok,boxShadow:"0 0 8px "+T.ok}}/>
              <span>متصل وجاهز</span>
            </div>
            {liveStatus.myName && <div style={{fontSize:FS-1,color:T.textSec,marginTop:4}}>الرقم: {liveStatus.myName} ({liveStatus.myNumber})</div>}
          </> : <>
            <div style={{display:"flex",alignItems:"center",gap:8,fontSize:FS+1,fontWeight:900,color:T.warn}}>
              <span style={{width:10,height:10,borderRadius:"50%",background:T.warn}}/>
              <span>{liveStatus.waState === "QR" ? "محتاج QR scan" : liveStatus.waState === "REPAIRING" ? "جاري الإصلاح..." : "غير متصل"}</span>
            </div>
            <div style={{fontSize:FS-2,color:T.textSec,marginTop:4}}>الحالة: {liveStatus.waState}</div>
            {/* V19.37: Repair button — appears when stuck in INIT/DISCONNECTED. ~90% of bridge issues
                are Singleton lock files left over from a forced shutdown; this fixes those without SSH. */}
            {canEdit && ["INIT","DISCONNECTED"].includes(liveStatus.waState) && onRepair && (
              <Btn small onClick={onRepair} style={{marginTop:10,background:T.accent+"15",color:T.accent,border:"1px solid "+T.accent+"40",fontWeight:700}}>
                🔧 إصلاح تلقائي
              </Btn>
            )}
            {liveStatus.waState === "REPAIRING" && (
              <div style={{marginTop:8,fontSize:FS-2,color:T.textMut,lineHeight:1.6}}>
                ⏳ بنعمل reset للـ WhatsApp client. بياخد ~30 ثانية. الصفحة هتتحدث تلقائياً.
              </div>
            )}
          </>}
        </div>
        <div style={{textAlign:"left"}}>
          <div style={{fontSize:FS-2,color:T.textSec,marginBottom:4}}>uptime</div>
          <div style={{fontSize:FS,fontWeight:700}}>{formatUptime(liveStatus.uptime || 0)}</div>
        </div>
      </div>
    </Card>

    {/* QR card if needed */}
    {liveStatus.qr && <Card style={{marginTop:14,background:"#FEF3C7"}}>
      <div style={{textAlign:"center",padding:8}}>
        <div style={{fontSize:FS+1,fontWeight:800,color:"#92400E",marginBottom:8}}>📱 امسح الـ QR من واتساب</div>
        <div style={{fontSize:FS-2,color:"#92400E",marginBottom:12}}>الإعدادات → الأجهزة المرتبطة → ربط جهاز</div>
        <img src={liveStatus.qr} alt="QR" style={{maxWidth:280,width:"100%",borderRadius:8,background:"#fff",padding:12}}/>
      </div>
    </Card>}

    {/* Stats grid */}
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(160px, 1fr))",gap:10,marginTop:14}}>
      <BigStat icon="📤" label="مرسلة اليوم" value={daily.sent || 0} sub={"من "+(settings.dailyCap || 80)} color={T.ok}/>
      <BigStat icon="⏳" label="في الطابور" value={queue.pending || 0} sub={isRunning ? "شغال" : isPaused ? "متوقف" : "خامل"} color={T.accent}/>
      <BigStat icon="✓" label="مرسلة (إجمالي)" value={liveStatus.stats?.totalSent || 0} sub="منذ بداية الجلسة" color={T.ok}/>
      <BigStat icon="✕" label="فشل" value={liveStatus.stats?.totalFailed || 0} sub={liveStats?.successRate != null ? "نجاح "+liveStats.successRate+"%" : ""} color={T.err}/>
      <BigStat icon="🚫" label="opt-outs" value={liveStatus.optOutsCount || 0} sub="رفضوا التواصل" color={T.warn}/>
      <BigStat icon="✉" label="بيبعت الآن" value={queue.sending || 0} sub="رسالة فعلياً" color="#3B82F6"/>
    </div>

    {/* Daily progress */}
    <Card style={{marginTop:14}}>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:FS-1,marginBottom:6}}>
        <span style={{fontWeight:700}}>الحد اليومي</span>
        <span style={{color:T.textSec}}>{daily.sent || 0} / {settings.dailyCap || 80} ({dailyPct}%)</span>
      </div>
      <div style={{height:14,borderRadius:7,background:T.bg,overflow:"hidden"}}>
        <div style={{
          height:"100%",
          width: dailyPct + "%",
          background: dailyPct >= 90 ? T.err : dailyPct >= 70 ? T.warn : "linear-gradient(90deg, "+T.ok+", "+T.accent+")",
          transition: "width 0.5s",
        }}/>
      </div>
      {dailyPct >= 90 && <div style={{fontSize:FS-3,color:T.err,marginTop:6}}>⚠️ قاربت على الحد اليومي</div>}
    </Card>

    {/* Quick controls */}
    {canEdit && isReady && <Card title="🎮 تحكم سريع" style={{marginTop:14}}>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {isPaused
          ? <Btn onClick={onResume} style={{background:T.ok+"15",color:T.ok,border:"1px solid "+T.ok+"40",fontWeight:700}}>▶ استئناف الطابور</Btn>
          : totalActive > 0 && <Btn onClick={onPause} style={{background:T.warn+"15",color:T.warn,border:"1px solid "+T.warn+"40",fontWeight:700}}>⏸ إيقاف مؤقت</Btn>
        }
        {totalActive > 0 && <Btn onClick={onStop} style={{background:T.err+"15",color:T.err,border:"1px solid "+T.err+"40",fontWeight:700}}>⏹ إيقاف نهائي</Btn>}
        <Btn onClick={onClear} style={{background:"#3B82F615",color:"#3B82F6",border:"1px solid #3B82F640",fontWeight:700}}>🧹 امسح المكتمل</Btn>
        {onRepair && <Btn onClick={onRepair} style={{background:T.accent+"15",color:T.accent,border:"1px solid "+T.accent+"40",fontWeight:700}} title="بيـreset الـ WhatsApp client من غير ما يفقد الـ session — مفيد لو فيه مشاكل بسيطة">🔧 إصلاح تلقائي</Btn>}
        <Btn onClick={onLogout} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd,fontWeight:700}}>🔌 قطع الاتصال (إعادة QR)</Btn>
      </div>
      {totalActive === 0 && !isPaused && <div style={{marginTop:8,fontSize:FS-2,color:T.textMut}}>الطابور فاضي. تقدر تعمل حملة جديدة.</div>}
    </Card>}

    {/* Recent activity preview */}
    {liveActivity.length > 0 && <Card title="📋 آخر النشاط" style={{marginTop:14}}>
      <div style={{maxHeight:240,overflowY:"auto"}}>
        {liveActivity.slice(0, 10).map((a, i) => (
          <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:i<9?"1px solid "+T.brd:"none",fontSize:FS-2}}>
            <div style={{minWidth:50,fontSize:FS-3,color:T.textMut,direction:"ltr",textAlign:"center"}}>{formatRelTime(a.timestamp)}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                {a.customerName || a.phone}
              </div>
              {a.error && <div style={{fontSize:FS-3,color:T.err}}>{a.error}</div>}
            </div>
            <div style={{fontWeight:700,fontSize:FS-2,color: a.status==="sent"?T.ok:a.status==="failed"?T.err:T.warn}}>
              {a.status==="sent"?"✓":a.status==="failed"?"✕":"⊘"}
            </div>
          </div>
        ))}
      </div>
    </Card>}
  </>;
}

/* ─────── SETTINGS TAB ─────── */
function SettingsTab(props){
  const {url,setUrl,token,setToken,enabled,setEnabled,delayMin,setDelayMin,delayMax,setDelayMax,dailyCap,setDailyCap,batchSize,setBatchSize,batchBreakMin,setBatchBreakMin,batchBreakMax,setBatchBreakMax,typingMin,setTypingMin,typingMax,setTypingMax,retryFailures,setRetryFailures,detectOptOuts,setDetectOptOuts,canEdit,testResult,onTest,onSave} = props;
  return <>
    <div style={{padding:12,borderRadius:10,background:T.warn+"10",border:"1px solid "+T.warn+"40",marginBottom:14,fontSize:FS-2,color:T.text,lineHeight:1.7}}>
      <b style={{color:T.warn}}>⚠️ تحذير قانوني:</b> الإرسال التلقائي مخالف لشروط استخدام WhatsApp.
      الرقم اللي بتربطه ممكن يتحظر. استخدم رقم احتياطي مش رقمك الشخصي.
    </div>

    <Card title="🌉 الاتصال">
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
        <input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)} disabled={!canEdit} style={{width:18,height:18,cursor:"pointer"}}/>
        <div>
          <div style={{fontWeight:700}}>تفعيل وضع البريدج</div>
          <div style={{fontSize:FS-3,color:T.textSec}}>لما يكون مفعّل، هيظهر كاختيار في صفحة الإرسال</div>
        </div>
      </div>
      <div style={{marginBottom:10}}>
        <div style={{fontSize:FS-2,color:T.textSec,marginBottom:4}}>عنوان البريدج (URL)</div>
        <Inp value={url} onChange={setUrl} placeholder="https://clark-rmg.duckdns.org" disabled={!canEdit}/>
      </div>
      <div style={{marginBottom:10}}>
        <div style={{fontSize:FS-2,color:T.textSec,marginBottom:4}}>🔐 Auth Token</div>
        <Inp value={token} onChange={setToken} placeholder="long-random-hex-string" disabled={!canEdit} type="password"/>
        <div style={{fontSize:FS-3,color:T.textMut,marginTop:4,lineHeight:1.6}}>
          الـ token من ملف <code>.env</code> على السيرفر (<code>cat .env</code>). خاليه فاضي بس لو شغال على localhost.
        </div>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <Btn onClick={onTest} disabled={!url} style={{background:T.accent+"15",color:T.accent,border:"1px solid "+T.accent+"40"}}>🔍 اختبار الاتصال</Btn>
        {testResult?.ok && <span style={{color:T.ok,fontWeight:700,fontSize:FS-2}}>
          ✓ متصل · {testResult.status.waReady?"WhatsApp جاهز":"WA: "+testResult.status.waState}
          {testResult.status.myName && " · "+testResult.status.myName}
        </span>}
        {testResult && !testResult.ok && <span style={{color:T.err,fontWeight:700,fontSize:FS-2}}>✕ {testResult.error}</span>}
      </div>
    </Card>

    <Card title="⚙️ إعدادات الإرسال (Anti-Ban)" style={{marginTop:12}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))",gap:10,marginBottom:12}}>
        <SettingInp label="أقل تأخير بين الرسايل (ث)" value={delayMin} onChange={v=>setDelayMin(Math.max(3,parseInt(v)||0))} disabled={!canEdit} hint="3 ثواني الحد الأدنى"/>
        <SettingInp label="أعلى تأخير (ث)" value={delayMax} onChange={v=>setDelayMax(parseInt(v)||0)} disabled={!canEdit} hint="افتراضي 25 ث"/>
        <SettingInp label="الحد اليومي" value={dailyCap} onChange={v=>setDailyCap(Math.min(500,Math.max(1,parseInt(v)||0)))} disabled={!canEdit} hint="مفيش أكتر من ده"/>
        <SettingInp label="حجم الدفعة" value={batchSize} onChange={v=>setBatchSize(parseInt(v)||0)} disabled={!canEdit} hint="استراحة كل X رسالة"/>
        <SettingInp label="استراحة دفعة (دقيقة، أقل)" value={batchBreakMin} onChange={v=>setBatchBreakMin(parseInt(v)||0)} disabled={!canEdit}/>
        <SettingInp label="استراحة دفعة (دقيقة، أعلى)" value={batchBreakMax} onChange={v=>setBatchBreakMax(parseInt(v)||0)} disabled={!canEdit}/>
        <SettingInp label="محاكاة الكتابة (ث، أقل)" value={typingMin} onChange={v=>setTypingMin(Math.max(1,parseInt(v)||0))} disabled={!canEdit} hint="بيظهر typing... قبل الإرسال"/>
        <SettingInp label="محاكاة الكتابة (ث، أعلى)" value={typingMax} onChange={v=>setTypingMax(parseInt(v)||0)} disabled={!canEdit}/>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}>
          <input type="checkbox" checked={retryFailures} onChange={e=>setRetryFailures(e.target.checked)} disabled={!canEdit} style={{width:16,height:16}}/>
          <span style={{fontSize:FS-1}}>إعادة المحاولة لو فشلت رسالة (مرة واحدة)</span>
        </label>
        <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}>
          <input type="checkbox" checked={detectOptOuts} onChange={e=>setDetectOptOuts(e.target.checked)} disabled={!canEdit} style={{width:16,height:16}}/>
          <span style={{fontSize:FS-1}}>اكتشف opt-outs تلقائي (لو حد رد STOP/إلغاء)</span>
        </label>
      </div>
    </Card>

    <Card title="📋 التوقعات" style={{marginTop:12}}>
      <div style={{fontSize:FS-2,color:T.textSec,lineHeight:1.8}}>
        بمعدل <b>{Math.round((delayMin+delayMax)/2)} ث</b> بين الرسايل و دفعات بحجم <b>{batchSize}</b>:
        <br/>• 50 رسالة = ~<b>{Math.round((50*((delayMin+delayMax)/2)+ Math.floor(50/batchSize)*((batchBreakMin+batchBreakMax)/2)*60)/60)} د</b>
        <br/>• 100 رسالة = ~<b>{Math.round((100*((delayMin+delayMax)/2)+ Math.floor(100/batchSize)*((batchBreakMin+batchBreakMax)/2)*60)/60)} د</b>
      </div>
    </Card>

    {canEdit && <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}>
      <Btn primary onClick={onSave}>✓ حفظ الإعدادات</Btn>
    </div>}
  </>;
}

/* ─────── STATS TAB ─────── */
function StatsTab({liveStats, liveStatus}){
  if(!liveStats) return <div style={{padding:30,textAlign:"center",color:T.textMut}}>... يحمّل الإحصائيات</div>;
  const { lifetime, successRate, avgSendMs, activityRecent, topRecipients, sessionUptime } = liveStats;
  return <>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(160px, 1fr))",gap:10,marginBottom:14}}>
      <BigStat icon="📊" label="معدل النجاح" value={successRate+"%"} sub="إجمالي" color={successRate>=90?T.ok:successRate>=70?T.warn:T.err}/>
      <BigStat icon="⏱" label="متوسط الإرسال" value={avgSendMs?Math.round(avgSendMs/1000)+" ث":"—"} sub="لكل رسالة" color={T.accent}/>
      <BigStat icon="📤" label="إجمالي مرسل" value={lifetime?.totalSent || 0} color={T.ok}/>
      <BigStat icon="✕" label="إجمالي فاشل" value={lifetime?.totalFailed || 0} color={T.err}/>
      <BigStat icon="⏰" label="مدة الجلسة" value={formatUptime(sessionUptime)} color={T.textSec}/>
    </div>

    <Card title="📊 توزيع آخر 50 محاولة">
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
        <BigStat icon="✓" label="نجح" value={activityRecent?.sent || 0} color={T.ok}/>
        <BigStat icon="✕" label="فشل" value={activityRecent?.failed || 0} color={T.err}/>
        <BigStat icon="⊘" label="تخطّى" value={activityRecent?.skipped || 0} color={T.warn}/>
      </div>
    </Card>

    {topRecipients?.length > 0 && <Card title="🏆 أكثر العملاء استلاماً" style={{marginTop:14}}>
      <div style={{maxHeight:300,overflowY:"auto"}}>
        {topRecipients.map((r, i) => (
          <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:i<topRecipients.length-1?"1px solid "+T.brd:"none"}}>
            <div style={{width:30,fontSize:FS-1,fontWeight:800,color:T.textMut,textAlign:"center"}}>#{i+1}</div>
            <div style={{flex:1,fontSize:FS-1,fontWeight:700,direction:"ltr",textAlign:"left"}}>{r.phone}</div>
            <div style={{fontSize:FS-1,fontWeight:800,color:T.accent}}>{r.count} رسالة</div>
          </div>
        ))}
      </div>
    </Card>}
  </>;
}

/* ─────── ACTIVITY TAB ─────── */
function ActivityTab({activity}){
  const [filter, setFilter] = useState("all");
  const filtered = useMemo(() => {
    if(filter === "all") return activity;
    return activity.filter(a => a.status === filter);
  }, [activity, filter]);

  return <Card>
    <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
      <span style={{fontSize:FS-1,fontWeight:700}}>فلتر:</span>
      {[
        ["all", "الكل", T.text],
        ["sent", "✓ نجح", T.ok],
        ["failed", "✕ فشل", T.err],
        ["skipped", "⊘ تخطّى", T.warn],
      ].map(([key, label, color]) => (
        <button key={key} onClick={() => setFilter(key)} style={{
          padding:"4px 10px", borderRadius:6,
          background: filter===key ? color+"20" : T.bg,
          color: filter===key ? color : T.textSec,
          border: "1px solid "+(filter===key ? color+"40" : T.brd),
          fontWeight: filter===key ? 700 : 500,
          fontSize: FS-2, cursor: "pointer",
        }}>{label}</button>
      ))}
      <span style={{marginInlineStart:"auto",fontSize:FS-3,color:T.textMut}}>{filtered.length} عنصر</span>
    </div>

    {filtered.length === 0 ? <div style={{padding:30,textAlign:"center",color:T.textMut}}>
      <div style={{fontSize:36,marginBottom:8}}>📭</div>
      مفيش نشاط
    </div> : <div style={{maxHeight:560,overflowY:"auto",border:"1px solid "+T.brd,borderRadius:8}}>
      {filtered.map((a, i) => (
        <div key={i} style={{
          display:"flex",alignItems:"center",gap:10,padding:"10px 12px",
          borderBottom: i<filtered.length-1 ? "1px solid "+T.brd : "none",
          fontSize: FS-2,
        }}>
          <div style={{width:80,fontSize:FS-3,color:T.textMut,direction:"ltr",textAlign:"center"}}>
            {formatRelTime(a.timestamp)}
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
              {a.customerName || "—"}
            </div>
            <div style={{fontSize:FS-3,color:T.textMut,direction:"ltr",textAlign:"left"}}>{a.phone}</div>
            {a.error && <div style={{fontSize:FS-3,color:T.err,marginTop:2}}>{a.error}</div>}
            {a.durationMs && <div style={{fontSize:FS-3,color:T.textMut,marginTop:1}}>⏱ {Math.round(a.durationMs/1000)} ث</div>}
          </div>
          <div style={{fontWeight:800,fontSize:FS-1,whiteSpace:"nowrap",
            color: a.status==="sent"?T.ok:a.status==="failed"?T.err:T.warn
          }}>
            {a.status==="sent"?"✓ نجح":a.status==="failed"?"✕ فشل":"⊘ تخطّى"}
          </div>
        </div>
      ))}
    </div>}
  </Card>;
}

/* ─────── TOOLS TAB ─────── */
function ToolsTab({url, token, liveOptOuts, canEdit}){
  const [testPhone, setTestPhone] = useState("");
  const [testMsg, setTestMsg] = useState("اختبار من CLARK Bridge — لو وصلتك الرسالة دي يبقى البريدج شغال 100% ✓");
  const [testing, setTesting] = useState(false);
  const [testRes, setTestRes] = useState(null);

  const [bulkOptouts, setBulkOptouts] = useState("");

  const sendTest = async () => {
    if(!testPhone || !testMsg) return;
    setTesting(true); setTestRes(null);
    try {
      const r = await bridge.test(url, testPhone, testMsg, token);
      setTestRes({ok: true, info: r});
    } catch(e) {
      setTestRes({ok: false, error: e.message});
    }
    setTesting(false);
  };

  const importBulk = async () => {
    const phones = bulkOptouts.split(/[\n,;\s]+/).map(s => s.trim()).filter(Boolean);
    if(phones.length === 0) { showToast("⚠️ مفيش أرقام"); return; }
    try {
      const r = await bridge.optoutBulk(url, phones, token);
      showToast("✓ أُضيف "+r.added+" رقم لقائمة opt-outs");
      setBulkOptouts("");
    } catch(e) { showToast("✕ "+e.message); }
  };

  const removeOptout = async (phone) => {
    if(!await ask("شيل "+phone+" من قائمة opt-outs؟"))return;
    try { await bridge.optoutRm(url, phone, token); showToast("✓ تم"); }
    catch(e) { showToast("✕ "+e.message); }
  };

  const resetDaily = async () => {
    if(!await ask("صفّر العداد اليومي؟ ده هيخليك تبعت من جديد لكن انتبه للحظر."))return;
    try { const r = await bridge.resetDaily(url, token); showToast("✓ تم تصفير "+r.previousCount+" رسالة"); }
    catch(e) { showToast("✕ "+e.message); }
  };

  return <>
    <Card title="📨 إرسال رسالة اختبار">
      <div style={{fontSize:FS-2,color:T.textSec,marginBottom:10,lineHeight:1.7}}>
        ابعت رسالة لرقمك أنت عشان تتأكد إن البريدج بيرسل صح. الرسالة بتتبعت فوراً (بدون queue).
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <div>
          <div style={{fontSize:FS-2,color:T.textSec,marginBottom:4}}>الرقم (مع كود الدولة، مثال: 201234567890)</div>
          <Inp value={testPhone} onChange={setTestPhone} placeholder="201234567890"/>
        </div>
        <div>
          <div style={{fontSize:FS-2,color:T.textSec,marginBottom:4}}>الرسالة</div>
          <textarea value={testMsg} onChange={e=>setTestMsg(e.target.value)} rows={3} style={{width:"100%",padding:10,borderRadius:8,border:"1px solid "+T.brd,fontSize:FS-1,fontFamily:"inherit",direction:"rtl",resize:"vertical",background:T.cardSolid,color:T.text}}/>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <Btn primary onClick={sendTest} disabled={!canEdit || testing || !testPhone || !testMsg} style={{background:"#25D366",borderColor:"#25D366"}}>
            {testing ? "... يبعت" : "📤 ابعت رسالة الاختبار"}
          </Btn>
          {testRes?.ok && <span style={{color:T.ok,fontWeight:700,fontSize:FS-2}}>✓ مبعوت لـ {testRes.info.sentTo}</span>}
          {testRes && !testRes.ok && <span style={{color:T.err,fontWeight:700,fontSize:FS-2}}>✕ {testRes.error}</span>}
        </div>
      </div>
    </Card>

    <Card title={"🚫 قائمة opt-outs ("+(liveOptOuts?.length||0)+")"} style={{marginTop:14}}>
      <div style={{fontSize:FS-2,color:T.textSec,marginBottom:10,lineHeight:1.7}}>
        أرقام رفضت التواصل (ردوا STOP أو إلغاء، أو أضفتهم يدوياً). هيتم تخطيهم تلقائياً في كل الحملات.
      </div>
      {liveOptOuts?.length > 0 && <div style={{maxHeight:200,overflowY:"auto",border:"1px solid "+T.brd,borderRadius:8,marginBottom:10}}>
        {liveOptOuts.map((p, i) => (
          <div key={p} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",borderBottom:i<liveOptOuts.length-1?"1px solid "+T.brd:"none",fontSize:FS-2}}>
            <span style={{direction:"ltr",fontFamily:"monospace"}}>{p}</span>
            {canEdit && <Btn small onClick={() => removeOptout(p)} style={{background:T.ok+"15",color:T.ok,border:"1px solid "+T.ok+"30"}}>↩ شيل</Btn>}
          </div>
        ))}
      </div>}
      {canEdit && <>
        <div style={{fontSize:FS-2,color:T.textSec,marginBottom:4}}>إضافة جماعية (رقم في كل سطر، أو مفصول بفاصلة)</div>
        <textarea value={bulkOptouts} onChange={e=>setBulkOptouts(e.target.value)} rows={4} placeholder="201234567890&#10;201234567891&#10;201234567892" style={{width:"100%",padding:10,borderRadius:8,border:"1px solid "+T.brd,fontSize:FS-2,fontFamily:"monospace",direction:"ltr",resize:"vertical",background:T.cardSolid,color:T.text,marginBottom:8}}/>
        <Btn onClick={importBulk} disabled={!bulkOptouts.trim()} style={{background:T.warn+"15",color:T.warn,border:"1px solid "+T.warn+"40"}}>➕ إضافة الأرقام</Btn>
      </>}
    </Card>

    {canEdit && <Card title="⚡ أدوات إدارية" style={{marginTop:14}}>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <Btn onClick={resetDaily} style={{background:"#3B82F615",color:"#3B82F6",border:"1px solid #3B82F640"}}>🔄 تصفير العداد اليومي</Btn>
      </div>
      <div style={{marginTop:10,padding:8,borderRadius:6,background:T.warn+"08",fontSize:FS-3,color:T.textSec,lineHeight:1.6}}>
        ⚠️ تصفير العداد اليومي يخليك تبعت أكتر من الحد. استخدمه بحذر — الإرسال الزيادة يزيد خطر حظر الرقم.
      </div>
    </Card>}
  </>;
}

/* ─────── HELPERS ─────── */
function BigStat({icon, label, value, sub, color}){
  return <div style={{
    padding:14,borderRadius:12,
    background:T.cardSolid,border:"1px solid "+T.brd,
    display:"flex",flexDirection:"column",gap:4,
  }}>
    <div style={{display:"flex",alignItems:"center",gap:6,fontSize:FS-2,color:T.textSec}}>
      <span style={{fontSize:FS}}>{icon}</span>
      <span>{label}</span>
    </div>
    <div style={{fontSize:FS+6,fontWeight:900,color:color||T.text,lineHeight:1}}>{value}</div>
    {sub && <div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>{sub}</div>}
  </div>;
}

function formatUptime(ms){
  if(!ms) return "—";
  const sec = Math.floor(ms / 1000);
  if(sec < 60) return sec + " ث";
  const min = Math.floor(sec / 60);
  if(min < 60) return min + " د";
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  if(hr < 24) return hr + " س " + (remMin > 0 ? remMin + " د" : "");
  const day = Math.floor(hr / 24);
  return day + " يوم " + (hr % 24) + " س";
}

function formatRelTime(iso){
  if(!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if(sec < 60) return "الآن";
  const min = Math.floor(sec / 60);
  if(min < 60) return min + " د";
  const hr = Math.floor(min / 60);
  if(hr < 24) return hr + " س";
  return Math.floor(hr / 24) + " يوم";
}

function SettingInp({label, value, onChange, disabled, hint}){
  return <div>
    <div style={{fontSize:FS-3,color:T.textSec,marginBottom:3}}>{label}</div>
    <Inp type="number" value={value} onChange={onChange} disabled={disabled}/>
    {hint && <div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>{hint}</div>}
  </div>;
}

/* ═══════════════════════════════════════════════════════════════════════
   V19.28: BRIDGE SEND SCREEN — Auto-send via local Node bridge
   ═══════════════════════════════════════════════════════════════════════ */
function BridgeSendScreen({data, upConfig, user, bridgeUrl, bridgeToken, template, segment, audience, onOpenSettings, onClose}){
  const [items, setItems] = useState(() => audience.map(c => ({...c, status: "pending", sentAt: null})));
  const [bridgeState, setBridgeState] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [confirmStart, setConfirmStart] = useState(true);
  const [completed, setCompleted] = useState(false);
  const campaignIdRef = useRef("camp_" + gid());
  const startedAtRef = useRef(new Date().toISOString());
  const persistedRef = useRef(false);

  /* V19.33: Per-campaign extra images (beyond template defaults) */
  const [extraImages, setExtraImages] = useState([]);
  const [extraUploadError, setExtraUploadError] = useState("");
  const extraInputRef = useRef(null);

  /* V19.32: Portal URL pre-fetch — only if template uses {لينك} */
  const needsPortalLinks = (template.body || "").includes("{لينك}");
  const [portalLoading, setPortalLoading] = useState(needsPortalLinks);
  const [portalProgress, setPortalProgress] = useState({done: 0, total: 0});
  const [portalError, setPortalError] = useState("");

  useEffect(() => {
    if(!needsPortalLinks) return;
    let dead = false;
    const custIds = items.map(i => i.id).filter(Boolean);
    if(custIds.length === 0) { setPortalLoading(false); return; }
    setPortalProgress({done: 0, total: custIds.length});
    portalUrlBatch(custIds, (done, total) => {
      if(!dead) setPortalProgress({done, total});
    }).then(urlMap => {
      if(dead) return;
      setItems(prev => prev.map(it => ({...it, portalUrl: urlMap[it.id] || ""})));
      const failed = custIds.filter(id => !urlMap[id]).length;
      if(failed > 0) setPortalError(`تعذّر توليد ${failed} لينك من ${custIds.length}.`);
      setPortalLoading(false);
    }).catch(err => {
      if(dead) return;
      setPortalError(err.message || "فشل توليد اللينكات");
      setPortalLoading(false);
    });
    return () => { dead = true; };
  }, []);

  /* V19.33: Combined images = template defaults + extra campaign-specific */
  const allImages = useMemo(() => {
    const tplImgs = Array.isArray(template.images) ? template.images : [];
    return [...tplImgs, ...extraImages].slice(0, 5); /* hard cap 5 */
  }, [template.images, extraImages]);

  /* V19.38: Template attachments (PDFs, docs, etc.) — sent alongside images.
     Attachments don't have an "extras" concept (campaign doesn't add them on the
     fly), they live entirely on the template. */
  const templateAttachments = useMemo(
    () => Array.isArray(template.attachments) ? template.attachments : [],
    [template.attachments]
  );

  /* V19.35: Extra campaign images also go to Firebase Storage. We use a
     synthetic templateId namespaced to the campaign so deletes can be reasoned
     about later if we ever want garbage collection. */
  const handleExtraUpload = async (e) => {
    setExtraUploadError("");
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if(files.length === 0) return;
    const tplCount = (template.images || []).length;
    if(tplCount + extraImages.length + files.length > 5){
      setExtraUploadError("الحد الأقصى 5 صور إجمالاً للحملة (شاملة صور القالب)");
      return;
    }
    const campaignNs = "campaign_" + (campaignIdRef.current || "tmp");
    try {
      const uploaded = [];
      for(const f of files){
        const meta = await uploadTemplateImageFile(campaignNs, f);
        uploaded.push(meta);
      }
      setExtraImages(prev => [...prev, ...uploaded]);
    } catch(err){
      console.error("[V19.35] extra image upload failed:", err);
      setExtraUploadError("فشل رفع الصورة: " + (err?.message || err));
    }
  };
  const removeExtraImage = (idx) => {
    const target = extraImages[idx];
    setExtraImages(extraImages.filter((_,i) => i!==idx));
    if(target?.storagePath){
      deleteTemplateImage(target.storagePath).catch(err =>
        console.warn("[V19.35] storage delete failed (non-fatal):", err)
      );
    }
  };

  /* Build personalized messages */
  /* V19.35: media items ship URL references (pointing at Firebase Storage)
     instead of base64 blobs. The bridge fetches and decodes server-side.
     V19.38: media[] now contains both images AND non-image attachments. The bridge
     dispatches each via MessageMedia; non-image mimes get sendMediaAsDocument:true
     server-side so they render as proper document bubbles in WhatsApp. Order
     matters: images first (caption attaches to the first one), attachments last. */
  const buildMessages = () => items.map(c => {
    const allMedia = [
      ...allImages.map(img => (
        img.url
          ? { url: img.url, mime: img.mime, name: img.name }
          : { base64: img.base64, mime: img.mime, name: img.name }
      )),
      ...templateAttachments.map(att => ({ url: att.url, mime: att.mime, name: att.name })),
    ];
    return {
      id: campaignIdRef.current + "_" + c.id,
      phone: cleanPhone(c.phone),
      customerName: c.name,
      message: personalize(template.body, c),
      media: allMedia.length > 0 ? allMedia : null,
      campaignId: campaignIdRef.current,
    };
  });

  /* Poll bridge status */
  useEffect(() => {
    let dead = false;
    const tick = async () => {
      try {
        const s = await bridge.status(bridgeUrl, bridgeToken);
        if(!dead) setBridgeState(s);
      } catch(e) {
        if(!dead) setBridgeState({error: e.message});
      }
    };
    tick();
    const iv = setInterval(tick, BRIDGE_POLL_MS);
    return () => { dead = true; clearInterval(iv); };
  }, [bridgeUrl]);

  /* Submit batch to bridge */
  const start = async () => {
    setError("");
    try {
      const messages = buildMessages();
      /* V19.35: Diagnostic logging — payloads are tiny now (URLs not base64). */
      const totalImages = messages.reduce((sum, m) => sum + (m.media?.length || 0), 0);
      const payloadSize = JSON.stringify({messages}).length;
      const payloadMB = (payloadSize / (1024 * 1024)).toFixed(3);
      const firstM = messages[0]?.media?.[0];
      const firstShape = firstM ? (firstM.url ? "url" : firstM.base64 ? "base64(legacy)" : "?") : "—";
      console.log("[BRIDGE SEND]", {
        messageCount: messages.length,
        totalImages,
        firstMsgMedia: messages[0]?.media ? `${messages[0].media.length} images` : "none",
        firstShape,
        payloadSizeMB: payloadMB,
        templateImages: (template.images || []).length,
        extraImages: extraImages.length,
        allImagesLen: allImages.length,
      });
      /* Warn if payload is large (only meaningful when legacy base64 entries are still around) */
      if(payloadSize > 12 * 1024 * 1024){
        if(!await ask(`⚠️ حجم البيانات ${payloadMB} MB — أكبر من 12MB. ممكن يفشل الإرسال. تكمّل؟`)) return;
      }
      const res = await bridge.send(bridgeUrl, messages, bridgeToken);
      if(!res.ok) throw new Error(res.error||"Submission failed");
      console.log("[BRIDGE SEND] ✓ Success — added", res.added, "messages to queue");
      setSubmitted(true);
      setConfirmStart(false);
    } catch(e) {
      console.error("[BRIDGE SEND] ✕ Failed:", e);
      setError(e.message);
    }
  };

  const pause  = () => bridge.pause(bridgeUrl, bridgeToken).catch(e=>setError(e.message));
  const resume = () => bridge.resume(bridgeUrl, bridgeToken).catch(e=>setError(e.message));
  const stop   = async () => {
    if(!await ask("إيقاف الإرسال نهائياً؟ كل الرسائل المتبقية هتتلغى."))return;
    bridge.stop(bridgeUrl, bridgeToken).catch(e=>setError(e.message));
  };

  /* Detect completion + persist */
  useEffect(() => {
    if(!submitted || !bridgeState) return;
    const myItemsInBridge = (bridgeState.queue && bridgeState.queue.pending===0 && bridgeState.queue.sending===0);
    if(myItemsInBridge && !persistedRef.current && !completed){
      setCompleted(true);
      persistedRef.current = true;
      /* Read final queue to persist exact stats */
      bridge.queue(bridgeUrl, bridgeToken).then(qd => {
        const myMsgs = (qd.queue||[]).filter(x => x.campaignId === campaignIdRef.current);
        const sent = myMsgs.filter(x=>x.status==="sent").length;
        const failed = myMsgs.filter(x=>x.status==="failed").length;
        const skipped = myMsgs.filter(x=>x.status==="skipped"||x.status==="cancelled").length;
        upConfig(d => {
          if(!Array.isArray(d.campaigns))d.campaigns = [];
          d.campaigns.unshift({
            id: campaignIdRef.current,
            templateId: template.id, templateName: template.name,
            segmentKey: segment.key, segmentLabel: segment.label,
            sendMode: "bridge",
            audienceCount: items.length,
            sent, failed, skipped,
            startedAt: startedAtRef.current,
            completedAt: new Date().toISOString(),
            startedBy: user?.email || "",
          });
          if(d.campaigns.length > 50)d.campaigns = d.campaigns.slice(0, 50);
        });
      }).catch(()=>{});
    }
  }, [bridgeState, submitted, completed]);

  /* If we know the queue contents, derive per-item status */
  const [bridgeQueueMine, setBridgeQueueMine] = useState([]);
  useEffect(() => {
    if(!submitted)return;
    let dead = false;
    const tick = async () => {
      try {
        const qd = await bridge.queue(bridgeUrl, bridgeToken);
        if(dead)return;
        const mine = (qd.queue||[]).filter(x => x.campaignId === campaignIdRef.current);
        setBridgeQueueMine(mine);
      } catch {}
    };
    tick();
    const iv = setInterval(tick, BRIDGE_POLL_MS);
    return () => { dead = true; clearInterval(iv); };
  }, [bridgeUrl, submitted]);

  const counts = useMemo(() => {
    if(!submitted) return {sent:0,failed:0,skipped:0,sending:0,pending:items.length};
    return {
      sent: bridgeQueueMine.filter(x=>x.status==="sent").length,
      failed: bridgeQueueMine.filter(x=>x.status==="failed").length,
      skipped: bridgeQueueMine.filter(x=>x.status==="skipped"||x.status==="cancelled").length,
      sending: bridgeQueueMine.filter(x=>x.status==="sending").length,
      pending: bridgeQueueMine.filter(x=>x.status==="pending").length,
    };
  }, [submitted, bridgeQueueMine, items.length]);

  const totalDone = counts.sent + counts.failed + counts.skipped;
  const pct = items.length ? Math.round((totalDone/items.length)*100) : 0;

  /* V19.32: Portal URL loading screen */
  if(portalLoading){
    const pct = portalProgress.total ? Math.round((portalProgress.done / portalProgress.total) * 100) : 0;
    return <div style={{padding:16,maxWidth:600,margin:"0 auto"}}>
      <Card>
        <div style={{textAlign:"center",padding:24}}>
          <div style={{fontSize:48,marginBottom:12}}>🔗</div>
          <div style={{fontSize:FS+2,fontWeight:800,marginBottom:8}}>جاري توليد لينكات العملاء...</div>
          <div style={{fontSize:FS-1,color:T.textSec,marginBottom:16}}>القالب فيه {"{لينك}"} — بنولّد لينك آمن لكل عميل قبل ما نبعت.</div>
          <div style={{height:12,borderRadius:6,background:T.bg,overflow:"hidden",marginBottom:8}}>
            <div style={{height:"100%",width:pct+"%",background:"linear-gradient(90deg, "+T.ok+", "+T.accent+")",transition:"width 0.3s"}}/>
          </div>
          <div style={{fontSize:FS-2,color:T.textMut}}>{portalProgress.done} / {portalProgress.total} ({pct}%)</div>
          <Btn ghost onClick={onClose} style={{marginTop:16}}>✕ إلغاء</Btn>
        </div>
      </Card>
    </div>;
  }

  /* ── Initial confirmation screen ── */
  if(confirmStart){
    const bridgeReady = bridgeState && bridgeState.waReady;
    return <div style={{padding:16,maxWidth:700,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <h2 style={{margin:0,fontSize:FS+3,fontWeight:900,display:"flex",alignItems:"center",gap:8}}>
          <span>🤖</span><span>إرسال تلقائي عبر البريدج</span>
        </h2>
        <Btn ghost onClick={onClose}>✕</Btn>
      </div>

      <Card>
        <div style={{padding:10,borderRadius:8,background:T.bg,marginBottom:12,fontSize:FS-1}}>
          <div><b>القالب:</b> {template.name}</div>
          <div><b>الجمهور:</b> {segment.label} · <b>{items.length}</b> عميل</div>
          <div><b>عينة من الرسالة:</b></div>
          <div style={{padding:10,background:"#DCF8C6",borderRadius:8,marginTop:6,fontSize:FS-2,color:"#000",direction:"rtl",whiteSpace:"pre-wrap"}}>
            {personalize(template.body, items[0]||{})}
          </div>
        </div>

        {/* V19.33: Images preview + extra upload */}
        <div style={{padding:12,borderRadius:10,background:T.accent+"06",border:"1px solid "+T.accent+"25",marginBottom:12}}>
          <div style={{fontSize:FS-1,fontWeight:700,color:T.accent,marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
            <span>📷</span><span>صور الحملة ({allImages.length}/5)</span>
          </div>
          {allImages.length > 0 && <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(80px, 1fr))",gap:6,marginBottom:8}}>
            {allImages.map((img, i) => {
              const isFromTpl = i < (template.images || []).length;
              const extraIdx = i - (template.images || []).length;
              return <div key={i} style={{position:"relative",borderRadius:6,overflow:"hidden",border:"1px solid "+T.brd,aspectRatio:"1"}}>
                <img src={img.url || ("data:"+img.mime+";base64,"+img.base64)} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                <div style={{position:"absolute",top:1,right:1,background:isFromTpl?"rgba(124,58,237,0.85)":"rgba(16,185,129,0.85)",color:"#fff",padding:"1px 5px",borderRadius:3,fontSize:FS-3,fontWeight:700}}>
                  {isFromTpl?"قالب":"حملة"}
                </div>
                {!isFromTpl && <button onClick={() => removeExtraImage(extraIdx)} style={{position:"absolute",top:1,left:1,width:18,height:18,borderRadius:"50%",background:"rgba(220,38,38,0.9)",color:"#fff",border:"none",fontSize:11,fontWeight:900,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}} title="حذف">✕</button>}
              </div>;
            })}
          </div>}
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <input ref={extraInputRef} type="file" accept="image/*" multiple onChange={handleExtraUpload} style={{display:"none"}}/>
            <Btn small onClick={() => extraInputRef.current?.click()} disabled={allImages.length>=5} style={{background:T.accent+"15",color:T.accent,border:"1px solid "+T.accent+"40"}}>
              📷 إضافة صورة للحملة
            </Btn>
            <span style={{fontSize:FS-3,color:T.textMut}}>
              {(template.images||[]).length>0 ? `${(template.images||[]).length} من القالب` : "مفيش صور في القالب"}
              {extraImages.length>0 && ` · ${extraImages.length} مضافة`}
            </span>
          </div>
          {extraUploadError && <div style={{marginTop:6,fontSize:FS-3,color:T.err}}>⚠️ {extraUploadError}</div>}
          {allImages.length > 1 && <div style={{marginTop:8,fontSize:FS-3,color:T.textMut,lineHeight:1.6}}>
            💡 الصور هتتبعت واحدة ورا التانية. النص هيتحط مع أول صورة كـ caption، الباقي صور بدون نص.
          </div>}
        </div>

        {/* V19.38: Attachments display — read-only on the send screen.
            Attachments live on the template; the campaign send doesn't add new ones. */}
        {templateAttachments.length > 0 && <div style={{padding:12,borderRadius:10,background:"#3B82F606",border:"1px solid #3B82F625",marginBottom:12}}>
          <div style={{fontSize:FS-1,fontWeight:700,color:"#3B82F6",marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
            <span>📎</span><span>ملفات مرفقة ({templateAttachments.length})</span>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {templateAttachments.map((att, i) => (
              <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 10px",borderRadius:6,background:T.cardSolid,border:"1px solid "+T.brd}}>
                <span style={{fontSize:20}}>{getFileIcon(att.mime)}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:FS-2,fontWeight:600,color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{att.name}</div>
                  <div style={{fontSize:FS-3,color:T.textMut}}>{formatFileSize(att.size)}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{marginTop:8,fontSize:FS-3,color:T.textMut,lineHeight:1.6}}>
            💡 الملفات هتتبعت لكل عميل بعد الصور. كل ملف هيتلقى كرسالة منفصلة.
          </div>
        </div>}

        {/* Bridge status */}
        <div style={{padding:12,borderRadius:10,background:bridgeReady?T.ok+"08":T.err+"08",border:"1px solid "+(bridgeReady?T.ok+"40":T.err+"40"),marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",gap:8,fontWeight:800,color:bridgeReady?T.ok:T.err}}>
            {bridgeReady?"✓ البريدج جاهز":"⚠️ البريدج مش جاهز"}
          </div>
          {bridgeState && bridgeReady && <div style={{fontSize:FS-2,color:T.textSec,marginTop:6,lineHeight:1.7}}>
            متصل كـ <b style={{color:T.text}}>{bridgeState.myName||bridgeState.myNumber}</b>
            <br/>رسايل اليوم: <b>{bridgeState.daily?.sent||0} / {bridgeState.settings?.dailyCap||80}</b>
            {bridgeState.queue?.pending>0 && <><br/>في الطابور حالياً: <b>{bridgeState.queue.pending}</b> رسالة من حملات تانية</>}
          </div>}
          {bridgeState && !bridgeReady && <div style={{fontSize:FS-2,color:T.textSec,marginTop:6}}>
            الحالة: {bridgeState.waState||"غير معروفة"} · {bridgeState.error||""}
            <Btn small onClick={onOpenSettings} style={{marginRight:8,background:T.accent+"15",color:T.accent}}>⚙️ افتح الإعدادات</Btn>
          </div>}
        </div>

        {/* Capacity check */}
        {bridgeState?.settings && (bridgeState.daily?.sent||0) + items.length > (bridgeState.settings.dailyCap||80) && <div style={{padding:10,borderRadius:8,background:T.warn+"08",border:"1px solid "+T.warn+"40",marginBottom:12,fontSize:FS-2,color:T.warn,lineHeight:1.7}}>
          ⚠️ <b>تنبيه:</b> الإرسال هيتجاوز الحد اليومي. الرسايل الزيادة هتنتظر لبكرة. لو عاوز ترفع الحد، روح للإعدادات.
        </div>}

        {/* V19.32: Portal links warning */}
        {portalError && <div style={{padding:10,borderRadius:8,background:T.warn+"10",border:"1px solid "+T.warn+"40",marginBottom:12,fontSize:FS-2,color:T.warn,lineHeight:1.6}}>
          ⚠️ {portalError}
        </div>}
        {needsPortalLinks && !portalError && <div style={{padding:10,borderRadius:8,background:T.ok+"08",border:"1px solid "+T.ok+"30",marginBottom:12,fontSize:FS-2,color:T.ok,lineHeight:1.6}}>
          ✓ تم توليد {items.length} لينك Portal بنجاح. كل عميل هيستلم اللينك الخاص بيه.
        </div>}

        {error && <div style={{padding:10,borderRadius:8,background:T.err+"08",border:"1px solid "+T.err+"40",marginBottom:12,fontSize:FS-2,color:T.err}}>
          ✕ {error}
        </div>}

        <div style={{display:"flex",gap:8,justifyContent:"flex-end",flexWrap:"wrap"}}>
          <Btn ghost onClick={onClose}>إلغاء</Btn>
          <Btn onClick={onOpenSettings} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>⚙️ إعدادات</Btn>
          <Btn primary onClick={start} disabled={!bridgeReady} style={{background:bridgeReady?"#10B981":undefined,borderColor:bridgeReady?"#10B981":undefined}}>
            🚀 ابدأ الإرسال التلقائي ({items.length})
          </Btn>
        </div>
      </Card>
    </div>;
  }

  /* ── Live progress screen ── */
  return <div style={{padding:16,maxWidth:900,margin:"0 auto"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,gap:8,flexWrap:"wrap"}}>
      <div>
        <h2 style={{margin:0,fontSize:FS+3,fontWeight:900,display:"flex",alignItems:"center",gap:8}}>
          <span>🤖</span><span>{completed?"اكتملت":"إرسال تلقائي"}: {template.name}</span>
        </h2>
        <div style={{fontSize:FS-2,color:T.textSec,marginTop:4}}>{segment.label} · {items.length} عميل · {bridgeState?.queue?.paused?"⏸ متوقف":"▶ شغّال"}</div>
      </div>
      <Btn ghost onClick={onClose}>{completed?"✕ إغلاق":"خروج (الإرسال هيكمل في الخلفية)"}</Btn>
    </div>

    <Card>
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:12}}>
        <Stat label="✓ تم" value={counts.sent} color={T.ok}/>
        <Stat label="✉ بيبعت" value={counts.sending} color={T.accent}/>
        <Stat label="⊘ تخطّى" value={counts.skipped} color={T.warn}/>
        <Stat label="✕ فشل" value={counts.failed} color={T.err}/>
        <Stat label="⏳ متبقي" value={counts.pending} color={T.textSec}/>
      </div>

      {/* Progress bar */}
      <div style={{height:12,borderRadius:6,background:T.bg,overflow:"hidden",marginBottom:8}}>
        <div style={{height:"100%",width:pct+"%",background:completed?T.ok:T.accent,transition:"width 0.3s"}}/>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:FS-2,color:T.textSec,marginBottom:14}}>
        <span>{totalDone} / {items.length}</span>
        <span>{pct}%</span>
      </div>

      {/* Live action buttons */}
      {!completed && <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        {bridgeState?.queue?.paused
          ? <Btn onClick={resume} style={{background:T.ok+"15",color:T.ok,border:"1px solid "+T.ok+"40"}}>▶ استكمال</Btn>
          : <Btn onClick={pause} style={{background:T.warn+"15",color:T.warn,border:"1px solid "+T.warn+"40"}}>⏸ إيقاف مؤقت</Btn>
        }
        <Btn onClick={stop} style={{background:T.err+"15",color:T.err,border:"1px solid "+T.err+"40"}}>⏹ إيقاف نهائي</Btn>
      </div>}

      {/* Item list (live) */}
      <div style={{maxHeight:380,overflowY:"auto",border:"1px solid "+T.brd,borderRadius:8}}>
        {bridgeQueueMine.length===0 && <div style={{padding:20,textAlign:"center",color:T.textSec,fontSize:FS-2}}>... يتم تحديث الحالة</div>}
        {bridgeQueueMine.map((it,i) => <div key={it.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 10px",borderBottom:i<bridgeQueueMine.length-1?"1px solid "+T.brd:"none",fontSize:FS-2,background:it.status==="sending"?T.accent+"08":undefined}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{it.customerName||it.phone}</div>
            <div style={{fontSize:FS-3,color:T.textMut,direction:"ltr",textAlign:"left"}}>{it.phone}</div>
            {it.error && <div style={{fontSize:FS-3,color:T.err,marginTop:2}}>{it.error}</div>}
          </div>
          <div style={{fontSize:FS-2,fontWeight:700,whiteSpace:"nowrap",
            color: it.status==="sent"?T.ok:it.status==="sending"?T.accent:it.status==="skipped"||it.status==="cancelled"?T.warn:it.status==="failed"?T.err:T.textSec
          }}>
            {it.status==="sent"?"✓ مبعوت":it.status==="sending"?"✉ بيبعت...":it.status==="skipped"?"⊘ تخطّى":it.status==="cancelled"?"⊘ ملغي":it.status==="failed"?"✕ فشل":"⏳"}
            {it.sentAt && <div style={{fontSize:FS-3,color:T.textMut,fontWeight:400}}>{new Date(it.sentAt).toLocaleTimeString("ar-EG",{hour:"2-digit",minute:"2-digit"})}</div>}
          </div>
        </div>)}
      </div>
    </Card>
  </div>;
}

/* ═══════════════════════════════════════════════════════════════════════
   V19.29: BLOCKLIST PAGE — Manage blocked customers
   ═══════════════════════════════════════════════════════════════════════ */
function BlocklistPage({data, upConfig, canEdit, onClose}){
  const blocklist = data.campaignBlocklist || [];
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    if(!search.trim()) return blocklist;
    const q = search.trim().toLowerCase();
    return blocklist.filter(b => (b.name||"").toLowerCase().includes(q) || (b.phone||"").includes(q));
  }, [blocklist, search]);

  const removeBlock = async (b) => {
    if(!await ask("شيل "+b.name+" من قائمة المحظورين؟"))return;
    upConfig(d => { d.campaignBlocklist = (d.campaignBlocklist||[]).filter(x => x.id !== b.id && x.phone !== b.phone); });
    showToast("✓ اتشال");
  };

  const clearAll = async () => {
    if(!await ask("امسح كل قائمة المحظورين ("+blocklist.length+")؟"))return;
    upConfig(d => { d.campaignBlocklist = []; });
    showToast("✓ تم مسح القائمة");
  };

  return <div style={{padding:16,maxWidth:760,margin:"0 auto"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
      <h2 style={{margin:0,fontSize:FS+3,fontWeight:900,display:"flex",alignItems:"center",gap:8}}>
        <span>🚫</span><span>قائمة العملاء المحظورين ({blocklist.length})</span>
      </h2>
      <div style={{display:"flex",gap:6}}>
        {canEdit && blocklist.length > 0 && <Btn small onClick={clearAll} style={{background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30"}}>🗑 امسح الكل</Btn>}
        <Btn ghost onClick={onClose}>✕</Btn>
      </div>
    </div>

    <Card>
      <div style={{padding:10,borderRadius:8,background:T.warn+"08",border:"1px solid "+T.warn+"30",marginBottom:12,fontSize:FS-2,color:T.text,lineHeight:1.7}}>
        <b>🚫 قائمة العملاء المحظورين:</b> العملاء هنا هيتم تخطيهم تلقائياً في كل الحملات الجديدة. تستخدمها للعملاء اللي طلبوا عدم التواصل، أو ما عدوش مهتمين، أو لأي سبب إداري. ممكن تشيل أي حد منها في أي وقت.
      </div>

      {blocklist.length === 0 ? <div style={{padding:30,textAlign:"center",color:T.textMut,fontSize:FS}}>
        <div style={{fontSize:36,marginBottom:8}}>📭</div>
        مفيش حد محظور
      </div> : <>
        <Inp value={search} onChange={setSearch} placeholder="🔍 ابحث..." style={{marginBottom:10}}/>
        <div style={{maxHeight:500,overflowY:"auto",border:"1px solid "+T.brd,borderRadius:8}}>
          {filtered.map((b, i) => <div key={b.id||b.phone||i} style={{
            display:"flex",alignItems:"center",gap:10,padding:"10px 12px",
            borderBottom:i<filtered.length-1?"1px solid "+T.brd:"none",
          }}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700}}>{b.name||"—"}</div>
              <div style={{fontSize:FS-3,color:T.textSec,direction:"ltr",textAlign:"left"}}>{b.phone}</div>
              {b.reason && <div style={{fontSize:FS-3,color:T.textMut,fontStyle:"italic",marginTop:2}}>{b.reason}</div>}
              <div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>
                حُظر في {(b.blockedAt||"").slice(0,10)} {b.blockedBy && "بواسطة "+b.blockedBy}
              </div>
            </div>
            {canEdit && <Btn small onClick={() => removeBlock(b)} style={{background:T.ok+"15",color:T.ok,border:"1px solid "+T.ok+"30"}}>↩ شيل الحظر</Btn>}
          </div>)}
        </div>
      </>}
    </Card>
  </div>;
}

/* ═══════════════════════════════════════════════════════════════════════
   V19.29: CAMPAIGN DETAIL MODAL — View per-customer breakdown of a past campaign
   ═══════════════════════════════════════════════════════════════════════ */
function CampaignDetailModal({campaign, data, upConfig, canEdit, templates, onClose, onResend}){
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const items = campaign.items || [];
  const filteredItems = useMemo(() => {
    let list = items;
    if(statusFilter !== "all") list = list.filter(it => it.status === statusFilter);
    if(search.trim()){
      const q = search.trim().toLowerCase();
      list = list.filter(it => (it.name||"").toLowerCase().includes(q) || (it.phone||"").includes(q));
    }
    return list;
  }, [items, statusFilter, search]);

  const counts = useMemo(() => ({
    sent: items.filter(i => i.status === "sent").length,
    skipped: items.filter(i => i.status === "skipped").length,
    failed: items.filter(i => i.status === "failed").length,
  }), [items]);

  const handleResendFailures = () => {
    const failed = items.filter(i => i.status === "failed");
    if(failed.length === 0) { showToast("ℹ مفيش رسائل فاشلة"); return; }
    const tpl = templates.find(t => t.id === campaign.templateId) || {id: campaign.templateId, name: campaign.templateName, body: campaign.templateBody||""};
    onResend(failed.map(f => ({id: f.id, name: f.name, phone: f.phone})), tpl, {key: campaign.segmentKey||"manual", label:"إعادة فاشل من: "+campaign.templateName});
  };

  const handleResendAll = () => {
    const tpl = templates.find(t => t.id === campaign.templateId) || {id: campaign.templateId, name: campaign.templateName, body: campaign.templateBody||""};
    onResend(items.map(f => ({id: f.id, name: f.name, phone: f.phone})), tpl, {key: campaign.segmentKey||"manual", label:"إعادة كاملة من: "+campaign.templateName});
  };

  const exportItemsExcel = () => {
    const rows = [["الاسم","الرقم","الحالة","وقت الإرسال","ملاحظة"]];
    items.forEach(it => rows.push([
      it.name||"",
      it.phone||"",
      it.status==="sent"?"مبعوت":it.status==="skipped"?"متخطّى":it.status==="failed"?"فشل":"معلّق",
      it.sentAt||"",
      it.skipNote||"",
    ]));
    /* Build CSV */
    const csv = rows.map(r => r.map(c => '"'+String(c).replace(/"/g,'""')+'"').join(",")).join("\n");
    const blob = new Blob(["\uFEFF"+csv], {type:"text/csv;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "campaign_"+(campaign.templateName||"حملة")+"_"+(campaign.createdAt||"").slice(0,10)+".csv";
    a.click();
    URL.revokeObjectURL(url);
    showToast("✓ تم التصدير");
  };

  return <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.55)",zIndex:10000,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:16,backdropFilter:"blur(3px)",overflowY:"auto"}}>
    <div onClick={e => e.stopPropagation()} style={{background:T.cardSolid,borderRadius:14,padding:18,width:"100%",maxWidth:780,border:"1px solid "+T.brd,marginTop:30,marginBottom:30}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14,gap:10}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:FS+2,fontWeight:900}}>{campaign.templateName}</div>
          <div style={{fontSize:FS-2,color:T.textSec,marginTop:3}}>
            {campaign.audienceLabel || campaign.segmentLabel} · {(campaign.createdAt||campaign.startedAt||"").slice(0,16).replace("T"," ")} · {campaign.sendMode==="bridge"?"🤖 تلقائي":"👆 يدوي"}
          </div>
        </div>
        <Btn ghost small onClick={onClose}>✕</Btn>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
        <Stat label="إجمالي" value={items.length} color={T.text}/>
        <Stat label="✓ تم" value={counts.sent} color={T.ok}/>
        <Stat label="⊘ تخطّى" value={counts.skipped} color={T.warn}/>
        <Stat label="✕ فشل" value={counts.failed} color={T.err}/>
      </div>

      {campaign.templateBody && <div style={{marginBottom:14,padding:10,borderRadius:8,background:"#DCF8C6",fontSize:FS-1,color:"#000",direction:"rtl",whiteSpace:"pre-wrap",lineHeight:1.6,maxHeight:120,overflowY:"auto"}}>
        {campaign.templateBody}
      </div>}

      <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
        <Btn small onClick={exportItemsExcel} style={{background:"#10B98112",color:"#10B981",border:"1px solid #10B98130"}}>📊 Excel</Btn>
        {canEdit && counts.failed > 0 && <Btn small onClick={handleResendFailures} style={{background:T.warn+"15",color:T.warn,border:"1px solid "+T.warn+"40"}}>🔁 إعادة الفاشل ({counts.failed})</Btn>}
        {canEdit && <Btn small onClick={handleResendAll} style={{background:"#3B82F615",color:"#3B82F6",border:"1px solid #3B82F640"}}>🔄 إعادة للكل</Btn>}
      </div>

      <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
        <Inp value={search} onChange={setSearch} placeholder="🔍 ابحث..." style={{flex:1,minWidth:160}}/>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{padding:"7px 10px",borderRadius:8,border:"1px solid "+T.brd,fontSize:FS-1,background:T.cardSolid,color:T.text,cursor:"pointer"}}>
          <option value="all">الكل</option>
          <option value="sent">✓ مبعوت</option>
          <option value="skipped">⊘ متخطّى</option>
          <option value="failed">✕ فشل</option>
        </select>
      </div>

      <div style={{maxHeight:380,overflowY:"auto",border:"1px solid "+T.brd,borderRadius:8}}>
        {filteredItems.length === 0 ? <div style={{padding:20,textAlign:"center",color:T.textMut}}>لا يوجد</div> :
          filteredItems.map((it, i) => <div key={it.id||i} style={{
            display:"flex",alignItems:"center",gap:10,padding:"8px 12px",
            borderBottom:i<filteredItems.length-1?"1px solid "+T.brd:"none",
            fontSize:FS-2,
          }}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{it.name||"—"}</div>
              <div style={{fontSize:FS-3,color:T.textSec,direction:"ltr",textAlign:"left"}}>{it.phone}</div>
              {it.skipNote && <div style={{fontSize:FS-3,color:T.warn,fontStyle:"italic",marginTop:1}}>⊘ {it.skipNote}</div>}
              {it.customMessage && <div style={{fontSize:FS-3,color:T.warn,marginTop:1}}>✏️ رسالة معدّلة</div>}
            </div>
            <div style={{fontWeight:700,whiteSpace:"nowrap",
              color: it.status==="sent"?T.ok:it.status==="skipped"?T.warn:it.status==="failed"?T.err:T.textSec
            }}>
              {it.status==="sent"?"✓ مبعوت":it.status==="skipped"?"⊘ متخطّى":it.status==="failed"?"✕ فشل":"⏳"}
              {it.sentAt && <div style={{fontSize:FS-3,color:T.textMut,fontWeight:400}}>{new Date(it.sentAt).toLocaleString("ar-EG",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</div>}
            </div>
          </div>)
        }
      </div>
    </div>
  </div>;
}

/* V19.29: Helper — Export campaigns log to Excel/CSV */
function exportCampaignsExcel(campaigns, data){
  const rows = [["التاريخ","القالب","الجمهور","الوضع","الإجمالي","تم","تخطّى","فشل","المعدّل %","المرسل"]];
  campaigns.slice().sort((a,b) => (b.createdAt||"").localeCompare(a.createdAt||"")).forEach(c => {
    const total = c.totalCount || c.audienceCount || 0;
    const sent = c.sentCount || c.sent || 0;
    const skipped = c.skippedCount || c.skipped || 0;
    const failed = c.failedCount || c.failed || 0;
    const pct = total > 0 ? Math.round((sent/total)*100) : 0;
    rows.push([
      (c.createdAt||c.startedAt||"").slice(0,10),
      c.templateName||"",
      c.audienceLabel||c.segmentLabel||"",
      c.sendMode==="bridge"?"تلقائي":"يدوي",
      total, sent, skipped, failed, pct,
      c.createdBy||c.startedBy||"",
    ]);
  });
  const csv = rows.map(r => r.map(c => '"'+String(c).replace(/"/g,'""')+'"').join(",")).join("\n");
  const blob = new Blob(["\uFEFF"+csv], {type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "campaigns_log_"+new Date().toISOString().slice(0,10)+".csv";
  a.click();
  URL.revokeObjectURL(url);
  showToast("✓ تم التصدير");
}


/* ═══════════════════════════════════════════════════════════════════════
   V19.70.4: SCHEDULED CAMPAIGNS LIST
   ───────────────────────────────────────────────────────────────────────
   Shows all data.scheduledCampaigns[] with status + cancel button.
   Status values:
     - "scheduled" : waiting for scheduledAt to arrive
     - "firing"    : cron is currently sending (transient)
     - "done"      : finished successfully
     - "failed"    : failed (check error field)
     - "cancelled" : user cancelled before fire
   The cron handler in api/automation-tick.js fires due "scheduled" entries.
   ═══════════════════════════════════════════════════════════════════════ */
function ScheduledCampaignsList({data, upConfig, onClose, canEdit}){
  const list = data.scheduledCampaigns || [];
  const cancelOne = async (id) => {
    /* V19.76.8: themed popup instead of native confirm() */
    if (!await ask("إلغاء الحملة","إلغاء الحملة المجدولة؟",{confirmText:"إلغاء الحملة"})) return;
    upConfig(d => {
      if (!Array.isArray(d.scheduledCampaigns)) return;
      const idx = d.scheduledCampaigns.findIndex(c => c.id === id);
      if (idx >= 0) d.scheduledCampaigns[idx].status = "cancelled";
    });
    showToast("✓ تم الإلغاء");
  };
  const deleteOne = async (id) => {
    if (!await ask("حذف الحملة","حذف نهائي للحملة؟",{danger:true,confirmText:"حذف"})) return;
    upConfig(d => {
      if (Array.isArray(d.scheduledCampaigns)) {
        d.scheduledCampaigns = d.scheduledCampaigns.filter(c => c.id !== id);
      }
    });
  };
  return <div style={{padding:16, maxWidth:900, margin:"0 auto"}}>
    <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14}}>
      <h2 style={{margin:0, fontSize:FS+3, fontWeight:900, display:"flex", alignItems:"center", gap:8}}>
        <span>📅</span><span>الحملات المجدولة</span>
      </h2>
      <Btn ghost onClick={onClose}>← رجوع</Btn>
    </div>
    {list.length === 0 ? (
      <Card>
        <div style={{textAlign:"center", padding:30, color:T.textMut}}>
          <div style={{fontSize:48, marginBottom:8, opacity:0.5}}>📅</div>
          <div style={{fontSize:FS, fontWeight:600}}>مفيش حملات مجدولة</div>
          <div style={{fontSize:FS-2, marginTop:6}}>
            لجدولة حملة: ابدأ حملة جديدة من القائمة الرئيسية، اختار "📅 جدولة لوقت لاحق" في شاشة طريقة الإرسال.
          </div>
        </div>
      </Card>
    ) : (
      <Card>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%", borderCollapse:"collapse", minWidth:600}}>
            <thead>
              <tr style={{borderBottom:"2px solid "+T.brd}}>
                {["القالب","الجمهور","الميعاد","الحالة","عدد","إجراء"].map(h =>
                  <th key={h} style={{padding:"8px 10px", fontSize:FS-2, fontWeight:700, color:T.textSec, textAlign:"start"}}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {list.map(c => {
                const dt = c.scheduledAt ? new Date(c.scheduledAt) : null;
                const due = dt && dt.getTime() <= Date.now();
                /* V19.70.6: describe recurrence pattern in human-readable Arabic */
                const _recDesc = (() => {
                  if (!c.recurrence || !c.recurrence.type) return "";
                  const r = c.recurrence;
                  const t = r.timeOfDay || "";
                  const dows = ["أحد","إثنين","ثلاثاء","أربعاء","خميس","جمعة","سبت"];
                  if (r.type === "daily")  return `🔁 يومي • ${t}`;
                  if (r.type === "weekly") return `📆 أسبوعي • ${(r.daysOfWeek||[]).map(d=>dows[d]).join("، ")} • ${t}`;
                  if (r.type === "monthly")return `🗓 شهري • يوم ${r.dayOfMonth} • ${t}`;
                  if (r.type === "range")  return `📊 ${r.rangeStart}→${r.rangeEnd} • ${t}`;
                  return "";
                })();
                const statusColors = {
                  scheduled: due ? T.warn : T.accent,
                  firing: T.warn,
                  done: T.ok,
                  failed: T.err,
                  cancelled: T.textMut,
                };
                const statusLabels = {
                  scheduled: due ? "متأخر — قيد التنفيذ" : "في الانتظار",
                  firing: "جاري الإرسال...",
                  done: "✓ تم",
                  failed: "❌ فشل",
                  cancelled: "أُلغي",
                };
                return <tr key={c.id} style={{borderBottom:"1px solid "+T.brd}}>
                  <td style={{padding:"10px", fontWeight:600, color:T.text}}>
                    {c.templateName}
                    {_recDesc && <div style={{fontSize:FS-3, color:T.accent, fontWeight:600, marginTop:2}}>{_recDesc}</div>}
                  </td>
                  <td style={{padding:"10px", fontSize:FS-2, color:T.textSec}}>{c.segmentLabel} ({c.items?.length || 0})</td>
                  <td style={{padding:"10px", fontSize:FS-2, color:T.textSec}}>
                    {dt ? dt.toLocaleString("ar-EG") : "—"}
                    {c.recurrence && c.occurrenceCount > 0 && (
                      <div style={{fontSize:FS-3, color:T.textMut, marginTop:2}}>
                        🔁 {c.occurrenceCount} مرة • آخر: {c.lastFiredAt ? new Date(c.lastFiredAt).toLocaleDateString("ar-EG") : "—"}
                      </div>
                    )}
                  </td>
                  <td style={{padding:"10px"}}>
                    <span style={{padding:"4px 10px", borderRadius:8, fontSize:FS-3, fontWeight:700,
                      background: (statusColors[c.status]||T.textMut)+"20",
                      color: statusColors[c.status]||T.textMut,
                      border: "1px solid "+(statusColors[c.status]||T.textMut)+"40"}}>
                      {statusLabels[c.status] || c.status}
                    </span>
                  </td>
                  <td style={{padding:"10px", fontSize:FS-2, color:T.textMut}}>
                    {c.status === "done" && `${c.sentCount||0} مرسلة`}
                    {c.status === "failed" && `${c.error || "—"}`}
                    {c.status === "scheduled" && c.recurrence && `${c.occurrenceCount || 0} اتنفّذت`}
                  </td>
                  <td style={{padding:"10px"}}>
                    {canEdit && c.status === "scheduled" && (
                      <Btn small onClick={() => cancelOne(c.id)} style={{background:T.warn+"15", color:T.warn, border:"1px solid "+T.warn+"40", fontSize:FS-3}}>
                        ❌ إلغاء
                      </Btn>
                    )}
                    {canEdit && (c.status === "done" || c.status === "failed" || c.status === "cancelled") && (
                      <Btn small onClick={() => deleteOne(c.id)} style={{background:T.err+"08", color:T.err, border:"1px solid "+T.err+"30", fontSize:FS-3}} title="حذف من السجل">
                        🗑
                      </Btn>
                    )}
                  </td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </Card>
    )}
  </div>;
}
