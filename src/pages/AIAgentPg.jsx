/* ═══════════════════════════════════════════════════════════════════════
   CLARK · AIAgentPg.jsx (V19.72.0 — Phase A + Phase B)
   ───────────────────────────────────────────────────────────────────────
   AI Agent control center + training school. Single page in CLARK app.

   Architecture (per spec V2.1):
     • The agent BACKEND is a separate Node.js project on Contabo VPS
       (clark-ai-agent), reading config from Firestore aiAgent* collections.
       Not built yet — backend = Phase D.
     • This page is the CONFIGURATION SURFACE. Admin edits personality,
       FAQs, schedule, tools here. The values live in `config.aiAgent` and
       get pushed to Firestore via the standard upConfig flow.
     • When the backend ships, it reads the same config from Firestore
       — no API needed between CLARK and the agent.

   Phase A (V19.71.0):  Personality + FAQs + Schedule
   Phase B (V19.72.0):  Dashboard + Conversation Logs + Sandbox + Tools-config
   Phase C (future):    Customer Funnel + Customer Profiles
   Phase D (future):    Agent backend (separate VPS project)

   READ-ONLY by design (per spec):
     The agent must never write to CLARK collections (customers, orders,
     etc.). It writes only to `aiAgent*` collections. This page enforces
     nothing at runtime — that constraint lives in the agent backend's
     Firestore wrapper. CLARK config is an instruction sheet, not a
     security boundary.

   Phase B notes:
     • Dashboard reads from `data.aiAgentAnalytics` (empty until backend
       ships) and shows realistic empty state + sample chart shape.
     • Logs reads from `data.aiAgentConversations` (same — empty state).
     • Sandbox runs LOCALLY: it matches incoming messages against the
       FAQs (phrasings) and renders a deterministic mock response.
       It does NOT call Anthropic. It's a UX preview + a way to test
       the FAQ phrasings before backend goes live.
     • Tools tab edits `config.aiAgent.tools` + tier discounts +
       escalation routing — all are config that the backend will read.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo, useRef, useEffect } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Btn, LoadingBtn, Card, Inp, Sel } from "../components/ui.jsx";
import { T } from "../theme.js";
import { FS, INIT_CONFIG } from "../constants/index.js";
import { gid } from "../utils/format.js";
import { showToast, ask } from "../utils/popups.js";
import { compressImg43 } from "../utils/image.js";
import { db } from "../firebase";
import { collection, onSnapshot, query, where, orderBy, limit, doc, deleteDoc, setDoc } from "firebase/firestore";
import { aiAgentSetTakeover, aiAgentAdminReply } from "../utils/aiAgentClient.js";

const DEFAULT_AGENT = INIT_CONFIG.aiAgent;

const DAY_LABELS = [
  { key: "sat", label: "السبت" },
  { key: "sun", label: "الأحد" },
  { key: "mon", label: "الإثنين" },
  { key: "tue", label: "الثلاثاء" },
  { key: "wed", label: "الأربعاء" },
  { key: "thu", label: "الخميس" },
  { key: "fri", label: "الجمعة" },
];

/* V19.77 (Phase 2): live Firestore listener for agent collections.
   Returns a docs array of {id, ...data}. Optional `q` lets you pass a
   pre-built query (with where/orderBy/limit). The hook unsubscribes on
   unmount and on dep change so stale listeners don't pile up.

   Usage:
     const conversations = useAgentCollection("aiAgentConversations",
       q => query(q, orderBy("at", "desc"), limit(50))
     );
*/
function useAgentCollection(name, queryBuilder) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!name) return;
    setLoading(true);
    const ref = collection(db, name);
    const q = queryBuilder ? queryBuilder(ref) : ref;
    const unsub = onSnapshot(q, (snap) => {
      const out = [];
      snap.forEach(d => out.push({ id: d.id, ...d.data() }));
      setDocs(out);
      setLoading(false);
    }, (err) => {
      setError(err);
      setLoading(false);
    });
    return () => unsub();
  /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [name]);
  return { docs, loading, error };
}

/* V19.76: 10 tabs. Catalog = single source of truth for products,
   read by the agent's search_products tool.
   V19.77.2: 11th tab "اقتراحات الـ AI" surfaces aiAgentSuggestions —
   things the agent flagged for the admin to review (LID-to-phone
   mappings via notify_admin_phone_request, FAQ proposals later, etc.). */
const TABS = [
  { key: "dashboard",   label: "لوحة التحكم",        icon: "📊" },
  { key: "personality", label: "الشخصية",            icon: "🎭" },
  { key: "catalog",     label: "الكتالوج",           icon: "📦" },
  { key: "faqs",        label: "الأسئلة المتكررة",   icon: "📚" },
  { key: "tools",       label: "الأدوات",            icon: "🛠" },
  { key: "schedule",    label: "الجدول الزمني",      icon: "⏰" },
  { key: "logs",        label: "سجل المحادثات",      icon: "💬" },
  { key: "suggestions", label: "اقتراحات الـ AI",    icon: "🔔" },
  { key: "sandbox",     label: "اختبار",             icon: "🧪" },
  { key: "funnel",      label: "مراحل العميل",       icon: "🎯" },
  { key: "profiles",    label: "ملفات العملاء",      icon: "👥" },
];

/* Stage definitions (per spec section 6) */
const STAGES = [
  { key: "Stranger",  label: "غريب",          icon: "👋", color: "#94A3B8" },
  { key: "Awareness", label: "تعرّف",         icon: "🤝", color: "#0EA5E9" },
  { key: "Interest",  label: "اهتمام",        icon: "🔍", color: "#06B6D4" },
  { key: "Decision",  label: "قرار شراء",     icon: "🎯", color: "#F59E0B" },
  { key: "Customer",  label: "عميل نشط",      icon: "💼", color: "#10B981" },
  { key: "Repeat",    label: "عميل متكرر",    icon: "🏆", color: "#8B5CF6" },
  { key: "Dormant",   label: "خامل",          icon: "😴", color: "#64748B" },
];

const TIERS = [
  { key: "Bronze",   label: "Bronze",   icon: "🥉", color: "#A16207" },
  { key: "Silver",   label: "Silver",   icon: "🥈", color: "#64748B" },
  { key: "Gold",     label: "Gold",     icon: "🥇", color: "#F59E0B" },
  { key: "Platinum", label: "Platinum", icon: "💎", color: "#8B5CF6" },
];

/* Deep clone helper. Used by the draft+save pattern to ensure isolation
   from server data so local edits don't accidentally mutate the source. */
const deepClone = (x) => JSON.parse(JSON.stringify(x));

/* V21.9.235 — mirror of the server's takeover-active check
   (api/ai-agent/_takeover.js) so the UI agrees with the gate: a takeover is
   "active" (agent muted) only while flagged active AND inside the idle
   auto-resume window (agent.takeover.autoResumeHours, default 24h). */
const takeoverActive = (to, agent) => {
  if (!to || to.active !== true) return false;
  const h = Number(agent?.takeover?.autoResumeHours);
  const hours = Number.isFinite(h) && h > 0 ? h : 24;
  const last = Date.parse(to.lastAdminReplyAt || to.takenOverAt || to.updatedAt || "");
  if (!last) return true;
  return (Date.now() - last) <= hours * 60 * 60 * 1000;
};

/* ────────────────────────────────────────────────────────────
   MAIN PAGE — V19.74.0: draft + Save Changes pattern
   ────────────────────────────────────────────────────────────
   All editable controls mutate a local `draft` state, NOT Firestore.
   The user clicks "💾 حفظ التغييرات" to push the draft up via upConfig.
   "↩️ تراجع" discards the draft and re-syncs from data.
   This avoids:
     • Per-keystroke Firestore writes (cost + race conditions)
     • Visual flicker when listeners snap back
     • Conflicts when 2 admins edit simultaneously
   ──────────────────────────────────────────────────────────── */
export function AIAgentPg({ data, upConfig, isMob, canEdit, user }){
  const [tab, setTab] = useState("personality");

  /* Source of truth from server (defensive: defaults if not migrated yet) */
  const serverAgent = data?.aiAgent || DEFAULT_AGENT;

  /* Local editable draft. Re-syncs from server when (a) first mount, or (b)
     server changes externally AND we have no unsaved local changes. */
  const [draft, setDraft] = useState(() => deepClone(serverAgent));
  const [dirty, setDirty] = useState(false);

  /* V19.77.2: top-level subscription to count pending suggestions.
     Used for the badge on the "اقتراحات الـ AI" tab. Cheap — only counts. */
  const { docs: allSuggestions } = useAgentCollection("aiAgentSuggestions");
  const pendingSuggestionsCount = useMemo(
    () => allSuggestions.filter(s => (s.status || "pending") === "pending").length,
    [allSuggestions]
  );

  /* If the server-side aiAgent changes (another admin saved, listener fired),
     update our draft IFF we don't have unsaved local changes. */
  const serverJson = JSON.stringify(serverAgent);
  useEffect(() => {
    if (!dirty) setDraft(deepClone(serverAgent));
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [serverJson]);

  /* The current "agent" view used by all sub-tabs reads the draft. */
  const agent = draft;

  /* All edits go through this — pure local state, no Firestore call. */
  const updateAgent = (mutator) => {
    if (!canEdit) { showToast("ليس لديك صلاحية التعديل"); return; }
    setDraft(prev => {
      const next = deepClone(prev);
      mutator(next);
      return next;
    });
    setDirty(true);
  };

  const saveChanges = () => {
    if (!dirty) return;
    upConfig(d => {
      d.aiAgent = deepClone(draft);
    });
    setDirty(false);
    showToast("✓ تم حفظ كل التغييرات");
  };

  const discardChanges = async () => {
    if (!dirty) return;
    const ok = await ask("التراجع عن كل التغييرات غير المحفوظة؟");
    if (!ok) return;
    setDraft(deepClone(serverAgent));
    setDirty(false);
    showToast("↩️ تم التراجع");
  };

  /* Power toggle is also part of the draft — admin must Save to apply. */
  const togglePower = () => {
    updateAgent(a => { a.enabled = !a.enabled; });
  };

  return (
    <div style={{padding: isMob ? "8px 4px" : "12px 8px", direction:"rtl", fontFamily:"inherit"}}>
      {/* ═══ HEADER ═══ */}
      <div style={{
        display:"flex", justifyContent:"space-between", alignItems:"center",
        gap:12, marginBottom:18, flexWrap:"wrap",
        background:`linear-gradient(135deg, #8B5CF608, #A78BFA08)`,
        border:`1px solid ${T.brd}`, borderRadius:16,
        padding: isMob ? "12px 14px" : "16px 20px",
      }}>
        <div style={{display:"flex", alignItems:"center", gap:14, flexWrap:"wrap"}}>
          <div style={{
            width: isMob?44:54, height: isMob?44:54, borderRadius:14,
            background:"linear-gradient(135deg,#8B5CF6,#7C3AED)",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize: isMob?22:28, color:"#fff",
            boxShadow:"0 4px 16px rgba(139,92,246,0.35)",
          }}>🤖</div>
          <div>
            <div style={{fontSize: isMob?FS+3:FS+6, fontWeight:800, color:T.text, lineHeight:1.2}}>
              AI Agent
              <span style={{fontSize:FS-1, fontWeight:600, color:T.textSec, marginInlineStart:10}}>
                مركز التحكم والتدريب
              </span>
            </div>
            <div style={{fontSize:FS-1, color:T.textMut, marginTop:4}}>
              مساعد كلارك الذكي على واتساب
            </div>
          </div>
        </div>
        <div style={{display:"flex", alignItems:"center", gap:10, flexWrap:"wrap"}}>
          <span style={{
            display:"inline-flex", alignItems:"center", gap:6,
            padding:"6px 12px", borderRadius:20,
            background: agent.enabled ? "#10B98115" : "#94A3B815",
            border: `1px solid ${agent.enabled ? "#10B98140" : "#94A3B840"}`,
            color: agent.enabled ? "#059669" : "#64748B",
            fontSize:FS-1, fontWeight:700,
          }}>
            <span style={{
              width:8, height:8, borderRadius:"50%",
              background: agent.enabled ? "#10B981" : "#94A3B8",
              animation: agent.enabled ? "agentPulse 2s ease-in-out infinite" : "none",
            }}/>
            {agent.enabled ? "شغّال" : "موقوف"}
          </span>
          <Btn primary={!agent.enabled} danger={agent.enabled} onClick={togglePower} small={isMob}>
            {agent.enabled ? "🛑 إيقاف" : "▶️ تشغيل"}
          </Btn>
        </div>
      </div>

      {/* V19.75: Test mode banner — visible whenever testMode.enabled is true.
                  Yellow stripe + count of whitelisted numbers + "manage" link. */}
      {agent.testMode?.enabled && (
        <div style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          gap:10, marginBottom:14, padding:"10px 14px",
          background:"linear-gradient(135deg, #FEF3C7, #FDE68A)",
          border:"2px solid #F59E0B",
          borderRadius:12,
          flexWrap:"wrap",
        }}>
          <div style={{display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", minWidth:0}}>
            <span style={{fontSize:FS+4}}>🧪</span>
            <div>
              <div style={{fontSize:FS, fontWeight:800, color:"#92400E"}}>
                وضع التجربة شغّال — الـ Agent بـ يرد على {(agent.testMode.whitelist || []).length} رقم فقط
              </div>
              <div style={{fontSize:FS-2, color:"#78350F", marginTop:2}}>
                باقي الأرقام {agent.testMode.outsideBehavior === "silent" ? "مفيش رد (silent)" : "بـ تستلم رسالة \"تحت الاختبار\""}
              </div>
            </div>
          </div>
          <Btn small onClick={()=>setTab("schedule")}>📋 إدارة القائمة</Btn>
        </div>
      )}

      {/* ═══ V19.74: Save / Discard sticky bar — only visible when dirty.
                    All inline edits across ALL tabs collect into the draft,
                    then a single click here commits everything. ═══ */}
      {dirty && (
        <div style={{
          position:"sticky", top:0, zIndex:50,
          display:"flex", alignItems:"center", justifyContent:"space-between",
          gap:10, marginBottom:14, padding:"10px 14px",
          background:"linear-gradient(135deg, #F59E0B12, #FBBF2412)",
          border:"2px solid #F59E0B",
          borderRadius:12,
          flexWrap:"wrap",
          boxShadow:"0 4px 16px rgba(245,158,11,0.2)",
        }}>
          <div style={{display:"flex", alignItems:"center", gap:10, flexWrap:"wrap"}}>
            <span style={{fontSize:FS+2}}>⚠️</span>
            <div>
              <div style={{fontSize:FS, fontWeight:800, color:"#92400E"}}>
                هناك تغييرات غير محفوظة
              </div>
              <div style={{fontSize:FS-2, color:"#78350F", marginTop:2}}>
                التعديلات بـ تتـحفظ محلياً فقط. اضغط "حفظ التغييرات" عشان تتحدث في النظام.
              </div>
            </div>
          </div>
          <div style={{display:"flex", gap:8}}>
            <Btn ghost small={isMob} onClick={discardChanges}>↩️ تراجع</Btn>
            <Btn primary onClick={saveChanges}>💾 حفظ التغييرات</Btn>
          </div>
        </div>
      )}

      {/* ═══ TAB NAV ═══ */}
      <style>{`
        @keyframes agentPulse{0%,100%{opacity:1}50%{opacity:0.5}}
        .agent-tab{cursor:pointer;padding:10px 14px;border-radius:10px;display:inline-flex;align-items:center;gap:6px;font-weight:700;font-size:${FS-1}px;transition:all 0.15s;white-space:nowrap;border:1px solid transparent}
        .agent-tab.active{background:${T.cardSolid};color:#7C3AED;border-color:${T.brd};box-shadow:0 1px 4px rgba(0,0,0,0.05)}
        .agent-tab:not(.active){color:${T.textSec};background:transparent}
        .agent-tab:not(.active):hover{color:${T.text};background:${T.bg}}
        .agent-tab .phase-pill{font-size:${FS-3}px;padding:2px 6px;border-radius:6px;font-weight:600}
        .agent-tab .phase-A{background:#10B98118;color:#059669}
        .agent-tab .phase-B{background:#F59E0B18;color:#D97706}
        .agent-tab .phase-C{background:#94A3B818;color:#64748B}
      `}</style>
      <div style={{
        display:"flex", gap:6, marginBottom:16, padding:6, borderRadius:14,
        background:T.bg, border:`1px solid ${T.brd}`,
        overflowX:"auto", flexWrap: isMob?"nowrap":"wrap",
      }}>
        {TABS.map(t => (
          <div
            key={t.key}
            className={"agent-tab" + (tab===t.key ? " active" : "")}
            onClick={()=>setTab(t.key)}
          >
            <span style={{fontSize:FS+2}}>{t.icon}</span>
            <span>{t.label}</span>
            {t.phase && (
              <span className={"phase-pill phase-"+t.phase}>Phase {t.phase}</span>
            )}
            {/* V19.77.2: pending-suggestions badge on the relevant tab */}
            {t.key === "suggestions" && pendingSuggestionsCount > 0 && (
              <span style={{
                marginInlineStart:6,
                padding:"1px 7px",
                borderRadius:9,
                fontSize:FS-3,
                fontWeight:800,
                background:"#EF4444",
                color:"#fff",
                lineHeight:1.4,
              }}>
                {pendingSuggestionsCount}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* ═══ TAB CONTENT ═══ */}
      <div>
        {tab==="dashboard"   && <DashboardTab agent={agent} data={data} isMob={isMob}/>}
        {tab==="personality" && <PersonalityTab agent={agent} updateAgent={updateAgent} canEdit={canEdit} isMob={isMob}/>}
        {tab==="catalog"     && <CatalogTab data={data} upConfig={upConfig} canEdit={canEdit} isMob={isMob}/>}
        {tab==="faqs"        && <FaqsTab agent={agent} updateAgent={updateAgent} canEdit={canEdit} isMob={isMob}/>}
        {tab==="tools"       && <ToolsTab agent={agent} updateAgent={updateAgent} canEdit={canEdit} isMob={isMob}/>}
        {tab==="schedule"    && <ScheduleTab agent={agent} updateAgent={updateAgent} canEdit={canEdit} isMob={isMob}/>}
        {tab==="logs"        && <LogsTab agent={agent} data={data} isMob={isMob} user={user} canEdit={canEdit}/>}
        {tab==="suggestions" && <SuggestionsTab agent={agent} data={data} upConfig={upConfig} canEdit={canEdit} isMob={isMob}/>}
        {tab==="sandbox"     && <SandboxTab agent={agent} data={data} isMob={isMob}/>}
        {tab==="funnel"      && <FunnelTab agent={agent} data={data} updateAgent={updateAgent} canEdit={canEdit} isMob={isMob}/>}
        {tab==="profiles"    && <ProfilesTab agent={agent} data={data} updateAgent={updateAgent} upConfig={upConfig} canEdit={canEdit} isMob={isMob}/>}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   PERSONALITY TAB — full editor for tone/voice/system prompt
   ════════════════════════════════════════════════════════════ */
function PersonalityTab({ agent, updateAgent, canEdit, isMob }){
  const p = agent.personality || DEFAULT_AGENT.personality;
  const [newGreeting, setNewGreeting] = useState("");
  const [newClosing, setNewClosing] = useState("");
  const [newForbidden, setNewForbidden] = useState("");

  const set = (key, val) => updateAgent(a => {
    if (!a.personality) a.personality = JSON.parse(JSON.stringify(DEFAULT_AGENT.personality));
    a.personality[key] = val;
  });

  const addToList = (key, value, setter) => {
    const v = (value||"").trim(); if (!v) return;
    updateAgent(a => {
      if (!a.personality) a.personality = JSON.parse(JSON.stringify(DEFAULT_AGENT.personality));
      if (!Array.isArray(a.personality[key])) a.personality[key] = [];
      a.personality[key].push(v);
    });
    setter("");
  };

  const removeFromList = (key, idx) => updateAgent(a => {
    if (!a.personality?.[key]) return;
    a.personality[key].splice(idx, 1);
  });

  const resetSystemPrompt = async () => {
    const ok = await ask("استرجاع الـ System Prompt الافتراضي؟ (هيتم استبدال النص الحالي)");
    if (!ok) return;
    set("systemPrompt", DEFAULT_AGENT.personality.systemPrompt);
    showToast("✓ تم استرجاع الـ prompt الافتراضي");
  };

  const fieldStyle = { fontSize:FS-1, fontWeight:700, color:T.textSec, marginBottom:6, display:"block" };
  const cardStyle = { background:T.cardSolid, border:`1px solid ${T.brd}`, borderRadius:14, padding: isMob?14:18, marginBottom:14 };
  const tagStyle = { display:"inline-flex", alignItems:"center", gap:6, padding:"5px 10px", borderRadius:8, background:T.bg, border:`1px solid ${T.brd}`, fontSize:FS-1, fontWeight:600 };

  return (
    <div>
      {/* Identity */}
      <div style={cardStyle}>
        <h3 style={{margin:"0 0 14px",fontSize:FS+2,fontWeight:800,color:T.text}}>🎭 الهوية الأساسية</h3>
        <div style={{display:"grid", gridTemplateColumns: isMob?"1fr":"1fr 1fr 1fr", gap:12}}>
          <div>
            <label style={fieldStyle}>اسم الـ Agent</label>
            <Inp value={p.name} onChange={v=>set("name", v)} placeholder="كلارك"/>
          </div>
          <div>
            <label style={fieldStyle}>اللغة / اللهجة</label>
            <Sel value={p.language} onChange={v=>set("language", v)}>
              <option value="egyptian_polite">عامية مصرية مهذبة</option>
              <option value="msa">فصحى</option>
              <option value="bilingual">عربي + إنجليزي</option>
            </Sel>
          </div>
          <div>
            <label style={fieldStyle}>الأسلوب</label>
            <Sel value={p.style} onChange={v=>set("style", v)}>
              <option value="formal">رسمي</option>
              <option value="professional_friendly">مهني-ودود</option>
              <option value="casual">عادي</option>
            </Sel>
          </div>
          <div>
            <label style={fieldStyle}>طول الإجابة</label>
            <Sel value={p.answerLength} onChange={v=>set("answerLength", v)}>
              <option value="short">قصير (1-2 جملة)</option>
              <option value="medium">متوسط (2-4 جمل)</option>
              <option value="long">طويل (تفصيلي)</option>
            </Sel>
          </div>
          <div>
            <label style={fieldStyle}>استخدام الـ Emojis</label>
            <Sel value={p.emojiUse} onChange={v=>set("emojiUse", v)}>
              <option value="none">بدون</option>
              <option value="minimal">قليل</option>
              <option value="moderate">معتدل</option>
              <option value="rich">كثيف</option>
            </Sel>
          </div>
        </div>
      </div>

      {/* Phrases */}
      <div style={cardStyle}>
        <h3 style={{margin:"0 0 14px",fontSize:FS+2,fontWeight:800,color:T.text}}>📝 العبارات المفضّلة</h3>
        <div style={{display:"grid", gridTemplateColumns: isMob?"1fr":"1fr 1fr", gap:18}}>
          <div>
            <label style={fieldStyle}>عبارات التحية</label>
            <div style={{display:"flex", flexWrap:"wrap", gap:6, marginBottom:8, minHeight:32}}>
              {(p.greetings||[]).map((g,i)=>(
                <span key={i} style={tagStyle}>
                  {g}
                  {canEdit && <span onClick={()=>removeFromList("greetings",i)} style={{cursor:"pointer",color:T.err,marginInlineStart:4,fontWeight:800}}>✕</span>}
                </span>
              ))}
              {(p.greetings||[]).length===0 && <span style={{fontSize:FS-1,color:T.textMut}}>(لا يوجد — هيـفـبيـلوف الـ default)</span>}
            </div>
            <div style={{display:"flex",gap:6}}>
              <Inp value={newGreeting} onChange={setNewGreeting} placeholder="أهلاً بحضرتك"/>
              <Btn primary small onClick={()=>addToList("greetings", newGreeting, setNewGreeting)}>+ إضافة</Btn>
            </div>
          </div>
          <div>
            <label style={fieldStyle}>عبارات الختام</label>
            <div style={{display:"flex", flexWrap:"wrap", gap:6, marginBottom:8, minHeight:32}}>
              {(p.closings||[]).map((c,i)=>(
                <span key={i} style={tagStyle}>
                  {c}
                  {canEdit && <span onClick={()=>removeFromList("closings",i)} style={{cursor:"pointer",color:T.err,marginInlineStart:4,fontWeight:800}}>✕</span>}
                </span>
              ))}
              {(p.closings||[]).length===0 && <span style={{fontSize:FS-1,color:T.textMut}}>(لا يوجد)</span>}
            </div>
            <div style={{display:"flex",gap:6}}>
              <Inp value={newClosing} onChange={setNewClosing} placeholder="في خدمتك دايماً"/>
              <Btn primary small onClick={()=>addToList("closings", newClosing, setNewClosing)}>+ إضافة</Btn>
            </div>
          </div>
        </div>
      </div>

      {/* Forbidden */}
      <div style={cardStyle}>
        <h3 style={{margin:"0 0 14px",fontSize:FS+2,fontWeight:800,color:T.text}}>🚫 ممنوعات</h3>
        <div style={{display:"flex", flexWrap:"wrap", gap:6, marginBottom:8, minHeight:32}}>
          {(p.forbidden||[]).map((f,i)=>(
            <span key={i} style={{...tagStyle, background:"#FEE2E2", color:"#991B1B", border:"1px solid #FCA5A5"}}>
              {f}
              {canEdit && <span onClick={()=>removeFromList("forbidden",i)} style={{cursor:"pointer",color:"#991B1B",marginInlineStart:4,fontWeight:800}}>✕</span>}
            </span>
          ))}
          {(p.forbidden||[]).length===0 && <span style={{fontSize:FS-1,color:T.textMut}}>(لا يوجد قيود مضافة)</span>}
        </div>
        <div style={{display:"flex",gap:6}}>
          <Inp value={newForbidden} onChange={setNewForbidden} placeholder="مثال: وعد بسعر بدون tool"/>
          <Btn danger small onClick={()=>addToList("forbidden", newForbidden, setNewForbidden)}>+ إضافة قيد</Btn>
        </div>
      </div>

      {/* System Prompt */}
      <div style={cardStyle}>
        <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10, flexWrap:"wrap", gap:8}}>
          <h3 style={{margin:0,fontSize:FS+2,fontWeight:800,color:T.text}}>📖 System Prompt (متقدم)</h3>
          <Btn ghost small onClick={resetSystemPrompt}>🔄 استرجاع الافتراضي</Btn>
        </div>
        <div style={{fontSize:FS-2, color:T.textMut, marginBottom:8, lineHeight:1.5}}>
          النص اللي بيـشاف الـ Agent في كل محادثة. دي أهم أداة تدريب — كل تعديل هنا = تعديل فوري في كل الردود.
        </div>
        <textarea
          value={p.systemPrompt||""}
          onChange={e=>set("systemPrompt", e.target.value)}
          readOnly={!canEdit}
          rows={isMob?12:18}
          style={{
            width:"100%", padding:12, borderRadius:10,
            border:`1px solid ${T.brd}`, background:T.cardSolid, color:T.text,
            fontFamily:"'Fira Code', 'Cairo', monospace", fontSize:FS, lineHeight:1.6,
            resize:"vertical", boxSizing:"border-box", outline:"none", direction:"rtl",
          }}
        />
        <div style={{fontSize:FS-2,color:T.textMut,marginTop:6,textAlign:"left"}}>
          {(p.systemPrompt||"").length} حرف · {Math.ceil((p.systemPrompt||"").length/4)} tokens تقريبي
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   FAQs TAB — CRUD with categories + phrasings + variables
   ════════════════════════════════════════════════════════════ */
function FaqsTab({ agent, updateAgent, canEdit, isMob }){
  const faqs = agent.faqs || [];
  const cats = agent.faqCategories || DEFAULT_AGENT.faqCategories;
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [editing, setEditing] = useState(null);/* faq object | "new" | null */

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return faqs.filter(f => {
      if (filterCat && f.category !== filterCat) return false;
      if (!q) return true;
      const hay = (f.title+" "+f.answer+" "+(f.phrasings||[]).join(" ")).toLowerCase();
      return hay.includes(q);
    });
  }, [faqs, search, filterCat]);

  const grouped = useMemo(() => {
    const out = {};
    for (const f of filtered) {
      const c = f.category || "أخرى";
      if (!out[c]) out[c] = [];
      out[c].push(f);
    }
    return out;
  }, [filtered]);

  const saveFaq = (faq) => {
    updateAgent(a => {
      if (!Array.isArray(a.faqs)) a.faqs = [];
      const idx = a.faqs.findIndex(f => f.id === faq.id);
      if (idx >= 0) a.faqs[idx] = faq;
      else a.faqs.unshift({ ...faq, createdAt: new Date().toISOString(), useCount: 0 });
    });
    setEditing(null);
    showToast("✓ تم التحديث (اضغط حفظ التغييرات)");
  };

  const delFaq = async (id) => {
    const ok = await ask("حذف هذا السؤال؟");
    if (!ok) return;
    updateAgent(a => { a.faqs = (a.faqs||[]).filter(f => f.id !== id); });
    showToast("🗑 تم الإزالة (اضغط حفظ التغييرات)");
  };

  const cardStyle = { background:T.cardSolid, border:`1px solid ${T.brd}`, borderRadius:14, padding: isMob?12:16, marginBottom:14 };

  return (
    <div>
      {/* Toolbar */}
      <div style={{...cardStyle, display:"flex", flexWrap:"wrap", gap:10, alignItems:"center", justifyContent:"space-between"}}>
        <div style={{display:"flex", gap:10, flex:"1 1 auto", flexWrap:"wrap", minWidth:0}}>
          <div style={{flex:"1 1 240px", minWidth:200}}>
            <Inp value={search} onChange={setSearch} placeholder="🔍 بحث في الأسئلة..."/>
          </div>
          <div style={{flex:"0 0 180px", minWidth:140}}>
            <Sel value={filterCat} onChange={setFilterCat}>
              <option value="">📁 كل الفئات</option>
              {cats.map(c => <option key={c} value={c}>{c}</option>)}
            </Sel>
          </div>
        </div>
        {canEdit && (
          <div style={{display:"flex",gap:6}}>
            <Btn primary onClick={()=>setEditing("new")}>+ سؤال جديد</Btn>
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{display:"flex", gap:10, marginBottom:14, flexWrap:"wrap"}}>
        <StatPill label="إجمالي الأسئلة" value={faqs.length} color="#0EA5E9"/>
        <StatPill label="الفئات" value={cats.length} color="#8B5CF6"/>
        <StatPill label="ظاهر بالفلتر" value={filtered.length} color="#10B981"/>
      </div>

      {/* Grouped list */}
      {filtered.length === 0 ? (
        <div style={{...cardStyle, textAlign:"center", padding:"40px 20px"}}>
          <div style={{fontSize:48,marginBottom:12}}>📚</div>
          <div style={{fontSize:FS+2, fontWeight:700, color:T.text, marginBottom:6}}>
            {faqs.length === 0 ? "لا يوجد أسئلة بعد" : "لا توجد نتائج"}
          </div>
          <div style={{fontSize:FS-1, color:T.textMut, marginBottom:18}}>
            {faqs.length === 0
              ? "ابدأ بإضافة الأسئلة المتكررة من العملاء — الـ Agent هيستخدمها تلقائياً."
              : "غيّر شروط البحث أو الفلتر."}
          </div>
          {canEdit && faqs.length === 0 && (
            <Btn primary onClick={()=>setEditing("new")}>+ إضافة أول سؤال</Btn>
          )}
        </div>
      ) : (
        Object.entries(grouped).map(([cat, list]) => (
          <div key={cat} style={cardStyle}>
            <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:12, paddingBottom:8, borderBottom:`1px solid ${T.brd}`}}>
              <span style={{fontSize:FS+2, fontWeight:800, color:T.text}}>📁 {cat}</span>
              <span style={{fontSize:FS-1, color:T.textMut}}>({list.length})</span>
            </div>
            <div style={{display:"grid", gap:8}}>
              {list.map(f => (
                <div key={f.id} style={{
                  padding:12, borderRadius:10, background:T.bg, border:`1px solid ${T.brd}`,
                  display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10,
                }}>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontSize:FS, fontWeight:800, color:T.text, marginBottom:4}}>📌 {f.title}</div>
                    <div style={{fontSize:FS-1, color:T.textSec, marginBottom:6, lineHeight:1.5,
                      display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden"}}>
                      {f.answer}
                    </div>
                    {(f.phrasings||[]).length > 0 && (
                      <div style={{fontSize:FS-2, color:T.textMut}}>
                        💬 صياغات: {f.phrasings.slice(0,3).join(" · ")}{f.phrasings.length>3?` (+${f.phrasings.length-3})`:""}
                      </div>
                    )}
                  </div>
                  {canEdit && (
                    <div style={{display:"flex", gap:6, flexShrink:0}}>
                      <Btn ghost small onClick={()=>setEditing(f)}>✏️</Btn>
                      <Btn danger small onClick={()=>delFaq(f.id)}>🗑</Btn>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {/* Editor Modal */}
      {editing && (
        <FaqEditor
          faq={editing === "new" ? null : editing}
          categories={cats}
          onSave={saveFaq}
          onClose={()=>setEditing(null)}
          isMob={isMob}
        />
      )}
    </div>
  );
}

function StatPill({ label, value, color }){
  return (
    <div style={{
      flex:"1 1 140px", minWidth:120,
      padding:"10px 14px", borderRadius:12,
      background: color+"10", border: `1px solid ${color}30`,
    }}>
      <div style={{fontSize:FS-2, color:T.textSec, fontWeight:600}}>{label}</div>
      <div style={{fontSize:FS+8, fontWeight:800, color, lineHeight:1.1}}>{value}</div>
    </div>
  );
}

function FaqEditor({ faq, categories, onSave, onClose, isMob }){
  const [title, setTitle] = useState(faq?.title || "");
  const [category, setCategory] = useState(faq?.category || categories[0] || "أخرى");
  const [answer, setAnswer] = useState(faq?.answer || "");
  const [phrasings, setPhrasings] = useState(faq?.phrasings || []);
  const [newPhrase, setNewPhrase] = useState("");

  const handleSave = () => {
    if (!title.trim() || !answer.trim()) {
      showToast("⚠️ العنوان والإجابة مطلوبين");
      return;
    }
    onSave({
      id: faq?.id || gid(),
      title: title.trim(),
      category,
      answer: answer.trim(),
      phrasings: phrasings.filter(p => p.trim()),
      useCount: faq?.useCount || 0,
      createdAt: faq?.createdAt || new Date().toISOString(),
    });
  };

  const fieldStyle = { fontSize:FS-1, fontWeight:700, color:T.textSec, marginBottom:6, display:"block" };

  return (
    <div onClick={onClose} style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,0.5)",
      zIndex:99998, display:"flex", alignItems:"center", justifyContent:"center", padding:16,
    }}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:T.cardSolid, borderRadius:16, padding: isMob?16:24,
        width:"100%", maxWidth:640, maxHeight:"90vh", overflow:"auto",
        boxShadow:"0 20px 60px rgba(0,0,0,0.3)", direction:"rtl",
      }}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18}}>
          <h2 style={{margin:0, fontSize:FS+4, fontWeight:800, color:T.text}}>
            {faq ? "✏️ تعديل سؤال" : "+ سؤال متكرر جديد"}
          </h2>
          <Btn ghost small onClick={onClose}>✕</Btn>
        </div>

        <div style={{marginBottom:14}}>
          <label style={fieldStyle}>📛 العنوان</label>
          <Inp value={title} onChange={setTitle} placeholder="مثال: مدة التوصيل"/>
        </div>

        <div style={{marginBottom:14}}>
          <label style={fieldStyle}>📁 الفئة</label>
          <Sel value={category} onChange={setCategory}>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </Sel>
        </div>

        <div style={{marginBottom:14}}>
          <label style={fieldStyle}>💬 الصياغات (الـ Agent يتعرف عليها)</label>
          <div style={{display:"flex", flexWrap:"wrap", gap:6, marginBottom:8, minHeight:32}}>
            {phrasings.map((ph, i) => (
              <span key={i} style={{
                display:"inline-flex", alignItems:"center", gap:6,
                padding:"5px 10px", borderRadius:8, background:T.bg, border:`1px solid ${T.brd}`,
                fontSize:FS-1, fontWeight:600,
              }}>
                {ph}
                <span onClick={()=>setPhrasings(phrasings.filter((_,j)=>j!==i))}
                  style={{cursor:"pointer",color:T.err,marginInlineStart:4,fontWeight:800}}>✕</span>
              </span>
            ))}
            {phrasings.length === 0 && (
              <span style={{fontSize:FS-1, color:T.textMut}}>(اضف صياغات بديلة عشان الـ Agent يفهم نفس السؤال بطرق مختلفة)</span>
            )}
          </div>
          <div style={{display:"flex", gap:6}}>
            <Inp value={newPhrase} onChange={setNewPhrase} placeholder="مثال: الشحن بياخد كم"/>
            <Btn primary small onClick={()=>{ const v=newPhrase.trim(); if(v){ setPhrasings([...phrasings, v]); setNewPhrase(""); }}}>+</Btn>
          </div>
        </div>

        <div style={{marginBottom:14}}>
          <label style={fieldStyle}>📝 الإجابة</label>
          <textarea
            value={answer}
            onChange={e=>setAnswer(e.target.value)}
            rows={6}
            placeholder="الرد اللي الـ Agent هيستخدمه. ممكن تستخدم متغيرات زي {customer_name}، {today}."
            style={{
              width:"100%", padding:10, borderRadius:8,
              border:`1px solid ${T.brd}`, background:T.cardSolid, color:T.text,
              fontFamily:"inherit", fontSize:FS, lineHeight:1.5,
              resize:"vertical", boxSizing:"border-box", outline:"none", direction:"rtl",
            }}
          />
          <div style={{fontSize:FS-2, color:T.textMut, marginTop:4}}>
            متغيرات متاحة: <code style={{background:T.bg,padding:"2px 6px",borderRadius:4}}>{"{customer_name}"}</code>{" "}
            <code style={{background:T.bg,padding:"2px 6px",borderRadius:4}}>{"{today}"}</code>{" "}
            <code style={{background:T.bg,padding:"2px 6px",borderRadius:4}}>{"{tier}"}</code>
          </div>
        </div>

        <div style={{display:"flex", gap:10, justifyContent:"flex-end", paddingTop:10, borderTop:`1px solid ${T.brd}`}}>
          <Btn ghost onClick={onClose}>إلغاء</Btn>
          <Btn primary onClick={handleSave}>💾 حفظ</Btn>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   SCHEDULE TAB — operating hours + holidays + off-hours
   ════════════════════════════════════════════════════════════ */
function ScheduleTab({ agent, updateAgent, canEdit, isMob }){
  const sch = agent.schedule || DEFAULT_AGENT.schedule;
  const tm  = agent.testMode || DEFAULT_AGENT.testMode;
  const [newHoliday, setNewHoliday] = useState({ name:"", from:"", to:"" });
  const [newWlPhone, setNewWlPhone] = useState("");
  const [newWlLabel, setNewWlLabel] = useState("");

  const setSch = (key, val) => updateAgent(a => {
    if (!a.schedule) a.schedule = JSON.parse(JSON.stringify(DEFAULT_AGENT.schedule));
    a.schedule[key] = val;
  });

  /* V19.75: Test mode setters */
  const setTm = (key, val) => updateAgent(a => {
    if (!a.testMode) a.testMode = JSON.parse(JSON.stringify(DEFAULT_AGENT.testMode));
    a.testMode[key] = val;
  });

  const addWhitelistEntry = () => {
    const raw = (newWlPhone || "").trim();
    if (!raw) { showToast("⚠️ ادخل رقم"); return; }
    /* If user wrote a bare phone, format as 201XXXXXXXXX@c.us. If they
       included @ already (e.g. an LID), keep verbatim. */
    let wid;
    if (raw.includes("@")) {
      wid = raw;
    } else {
      let digits = raw.replace(/\D/g, "");
      if (digits.startsWith("00")) digits = digits.slice(2);
      if (digits.startsWith("0") && digits.length === 11) digits = "20" + digits.slice(1);
      if (digits.length === 10 && digits.startsWith("1")) digits = "20" + digits;
      wid = digits + "@c.us";
    }
    updateAgent(a => {
      if (!a.testMode) a.testMode = JSON.parse(JSON.stringify(DEFAULT_AGENT.testMode));
      if (!Array.isArray(a.testMode.whitelist)) a.testMode.whitelist = [];
      /* Avoid duplicates by user-part match */
      const userPart = wid.split("@")[0];
      const dup = a.testMode.whitelist.find(e => (e.wid || "").split("@")[0] === userPart);
      if (dup) { return; }
      a.testMode.whitelist.push({
        id: gid(), wid,
        label: (newWlLabel || "").trim() || null,
        addedAt: new Date().toISOString(),
      });
    });
    setNewWlPhone("");
    setNewWlLabel("");
  };

  const removeWhitelistEntry = (id) => updateAgent(a => {
    if (!a.testMode?.whitelist) return;
    a.testMode.whitelist = a.testMode.whitelist.filter(e => e.id !== id);
  });

  const setDay = (dayKey, key, val) => updateAgent(a => {
    if (!a.schedule) a.schedule = JSON.parse(JSON.stringify(DEFAULT_AGENT.schedule));
    if (!a.schedule.days) a.schedule.days = JSON.parse(JSON.stringify(DEFAULT_AGENT.schedule.days));
    if (!a.schedule.days[dayKey]) a.schedule.days[dayKey] = { enabled:false, from:"20:00", to:"10:00" };
    a.schedule.days[dayKey][key] = val;
  });

  const setAlert = (key, val) => updateAgent(a => {
    if (!a.schedule) a.schedule = JSON.parse(JSON.stringify(DEFAULT_AGENT.schedule));
    if (!a.schedule.adminAlerts) a.schedule.adminAlerts = { ...DEFAULT_AGENT.schedule.adminAlerts };
    a.schedule.adminAlerts[key] = val;
  });

  const addHoliday = () => {
    const { name, from, to } = newHoliday;
    if (!name.trim() || !from) { showToast("⚠️ الاسم والتاريخ من مطلوبين"); return; }
    updateAgent(a => {
      if (!a.schedule) a.schedule = JSON.parse(JSON.stringify(DEFAULT_AGENT.schedule));
      if (!Array.isArray(a.schedule.holidays)) a.schedule.holidays = [];
      a.schedule.holidays.push({ id: gid(), name: name.trim(), from, to: to || from });
    });
    setNewHoliday({ name:"", from:"", to:"" });
  };

  const delHoliday = (id) => updateAgent(a => {
    if (!a.schedule?.holidays) return;
    a.schedule.holidays = a.schedule.holidays.filter(h => h.id !== id);
  });

  const cardStyle = { background:T.cardSolid, border:`1px solid ${T.brd}`, borderRadius:14, padding: isMob?14:18, marginBottom:14 };
  const fieldStyle = { fontSize:FS-1, fontWeight:700, color:T.textSec, marginBottom:6, display:"block" };

  return (
    <div>
      {/* V19.75 — Test Mode (whitelist gate) */}
      <div style={{
        ...cardStyle,
        background: tm.enabled ? "linear-gradient(135deg, #FEF3C7, #FDE68A40)" : T.cardSolid,
        border: tm.enabled ? "2px solid #F59E0B" : `1px solid ${T.brd}`,
      }}>
        <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, flexWrap:"wrap", marginBottom:14}}>
          <h3 style={{margin:0, fontSize:FS+2, fontWeight:800, color: tm.enabled ? "#92400E" : T.text}}>
            🧪 وضع التجربة (Whitelist)
          </h3>
          <label style={{display:"flex", alignItems:"center", gap:8, cursor: canEdit?"pointer":"default"}}>
            <input type="checkbox" checked={!!tm.enabled}
              onChange={e => canEdit && setTm("enabled", e.target.checked)}
              style={{width:20,height:20}}/>
            <span style={{fontSize:FS, fontWeight:700, color: tm.enabled ? "#92400E" : T.text}}>
              {tm.enabled ? "شغّال — الأرقام المحددة فقط" : "موقوف — كل الأرقام"}
            </span>
          </label>
        </div>

        <div style={{fontSize:FS-1, color: tm.enabled ? "#78350F" : T.textMut, lineHeight:1.6, marginBottom:14}}>
          لما تشغّل الوضع ده، الـ Agent بـ يرد فقط على الأرقام في القائمة. الباقي يا بـ يستلموا رسالة "تحت الاختبار" يا silent (مفيش رد). مفيش charge على Anthropic لأي رقم خارج الـ whitelist.
        </div>

        {/* Whitelist editor */}
        <div style={{marginBottom:14}}>
          <label style={fieldStyle}>📞 الأرقام المسموحة ({(tm.whitelist || []).length})</label>
          {(tm.whitelist || []).length > 0 && (
            <div style={{display:"grid", gap:6, marginBottom:10}}>
              {tm.whitelist.map(e => (
                <div key={e.id} style={{
                  display:"flex", justifyContent:"space-between", alignItems:"center",
                  padding:"8px 12px", borderRadius:8,
                  background: tm.enabled ? "#fff" : T.bg,
                  border: `1px solid ${tm.enabled ? "#FCD34D" : T.brd}`,
                }}>
                  <div style={{display:"flex", flexDirection:"column", gap:2}}>
                    <span style={{fontSize:FS, fontWeight:700, color:T.text, fontFamily:"'Fira Code', monospace"}}>
                      {e.wid}
                    </span>
                    {e.label && <span style={{fontSize:FS-2, color:T.textMut}}>· {e.label}</span>}
                  </div>
                  {canEdit && <Btn danger small onClick={()=>removeWhitelistEntry(e.id)}>🗑</Btn>}
                </div>
              ))}
            </div>
          )}
          {canEdit && (
            <div style={{display:"grid", gridTemplateColumns: isMob?"1fr":"2fr 2fr auto", gap:8, alignItems:"end"}}>
              <div>
                <label style={{fontSize:FS-2, color:T.textSec, fontWeight:600, marginBottom:4, display:"block"}}>الرقم (مصري أو WA-ID كامل)</label>
                <Inp value={newWlPhone} onChange={setNewWlPhone} placeholder="مثال: 01100201057 أو 46480236...@lid"/>
              </div>
              <div>
                <label style={{fontSize:FS-2, color:T.textSec, fontWeight:600, marginBottom:4, display:"block"}}>الاسم (اختياري)</label>
                <Inp value={newWlLabel} onChange={setNewWlLabel} placeholder="مثال: أحمد المالك"/>
              </div>
              <Btn primary onClick={addWhitelistEntry}>+ إضافة</Btn>
            </div>
          )}
          <div style={{fontSize:FS-2, color:T.textMut, marginTop:8, lineHeight:1.5}}>
            💡 لو حضرتك بـ تـtest، أول حاجة ضيف رقمك. لو شفت في الـ logs WA-ID بـ <code style={{background:T.bg,padding:"1px 5px",borderRadius:3}}>@lid</code>، انسخ كاملاً + الصق هنا (الـ WhatsApp Business بـ يستخدم الـ format ده للخصوصية).
          </div>
        </div>

        {/* V19.77 (Phase 2): Recent Senders panel — captures non-whitelisted WIDs
            so the admin can promote them to the whitelist with one click. The
            agent writes to aiAgentRecentSenders every time test mode rejects. */}
        <RecentSendersPanel
          tm={tm}
          updateAgent={updateAgent}
          canEdit={canEdit}
          isMob={isMob}
          fieldStyle={fieldStyle}
        />

        {/* Outside-whitelist behavior */}
        <div style={{display:"grid", gridTemplateColumns: isMob?"1fr":"1fr 2fr", gap:12}}>
          <div>
            <label style={fieldStyle}>سلوك الأرقام خارج القائمة</label>
            <Sel value={tm.outsideBehavior || "canned"} onChange={v=>canEdit && setTm("outsideBehavior", v)}>
              <option value="canned">يبعت رسالة "تحت الاختبار"</option>
              <option value="silent">مفيش رد (silent)</option>
            </Sel>
          </div>
          <div>
            <label style={fieldStyle}>الرسالة (لما السلوك = "يبعت رسالة")</label>
            <textarea
              value={tm.outsideMessage || ""}
              onChange={e=>canEdit && setTm("outsideMessage", e.target.value)}
              readOnly={!canEdit}
              rows={2}
              style={{
                width:"100%", padding:10, borderRadius:8,
                border:`1px solid ${T.brd}`, background:T.cardSolid, color:T.text,
                fontFamily:"inherit", fontSize:FS, lineHeight:1.5,
                resize:"vertical", boxSizing:"border-box", outline:"none", direction:"rtl",
              }}
            />
          </div>
        </div>
      </div>

      {/* Mode */}
      <div style={cardStyle}>
        <h3 style={{margin:"0 0 14px",fontSize:FS+2,fontWeight:800,color:T.text}}>⏰ نمط التشغيل</h3>
        <div style={{display:"flex", gap:10, flexWrap:"wrap"}}>
          {[
            { val:"specific", label:"ساعات محددة يومياً", icon:"🕐", desc:"الـ Agent بيرد بس في الساعات اللي تحتها"},
            { val:"24x7",     label:"24/7 طول الوقت",    icon:"🌐", desc:"الـ Agent دايماً متاح"},
            { val:"off",      label:"موقوف",              icon:"🛑", desc:"الـ Agent مش بيرد"},
          ].map(opt => (
            <div
              key={opt.val}
              onClick={()=>canEdit && setSch("mode", opt.val)}
              style={{
                flex:"1 1 180px", minWidth:160,
                padding:14, borderRadius:12, cursor: canEdit?"pointer":"default",
                border: `2px solid ${sch.mode===opt.val ? "#8B5CF6" : T.brd}`,
                background: sch.mode===opt.val ? "#8B5CF610" : T.bg,
                transition:"all 0.15s",
              }}
            >
              <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:6}}>
                <span style={{fontSize:FS+6}}>{opt.icon}</span>
                <span style={{fontSize:FS, fontWeight:800, color: sch.mode===opt.val?"#7C3AED":T.text}}>
                  {opt.label}
                </span>
              </div>
              <div style={{fontSize:FS-2, color:T.textMut, lineHeight:1.4}}>{opt.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Per-day hours (only when mode==="specific") */}
      {sch.mode === "specific" && (
        <div style={cardStyle}>
          <h3 style={{margin:"0 0 14px",fontSize:FS+2,fontWeight:800,color:T.text}}>📅 الأيام والساعات</h3>
          <div style={{fontSize:FS-2, color:T.textMut, marginBottom:14, lineHeight:1.5}}>
            ملاحظة: لو الـ "إلى" أصغر من "من"، يعني الفترة بتمتد للصباح التالي (مثلاً 20:00 → 10:00).
          </div>
          <div style={{display:"grid", gap:8}}>
            {DAY_LABELS.map(d => {
              const day = sch.days?.[d.key] || { enabled:false, from:"20:00", to:"10:00" };
              return (
                <div key={d.key} style={{
                  display:"flex", alignItems:"center", gap:12, padding:10, borderRadius:10,
                  background: day.enabled ? "#10B98108" : T.bg,
                  border: `1px solid ${day.enabled ? "#10B98130" : T.brd}`,
                  flexWrap:"wrap",
                }}>
                  <label style={{display:"flex",alignItems:"center",gap:8, minWidth:120, cursor: canEdit?"pointer":"default"}}>
                    <input type="checkbox" checked={!!day.enabled}
                      onChange={e=>canEdit && setDay(d.key, "enabled", e.target.checked)}
                      style={{width:18,height:18,cursor: canEdit?"pointer":"default"}}/>
                    <span style={{fontSize:FS, fontWeight:700, color:T.text}}>{d.label}</span>
                  </label>
                  <div style={{display:"flex",alignItems:"center",gap:8,opacity: day.enabled?1:0.4}}>
                    <span style={{fontSize:FS-1, color:T.textSec}}>من</span>
                    <input type="time" value={day.from} disabled={!day.enabled||!canEdit}
                      onChange={e=>setDay(d.key,"from",e.target.value)}
                      style={{padding:"6px 10px",borderRadius:8,border:`1px solid ${T.brd}`,background:T.cardSolid,color:T.text,fontSize:FS,fontFamily:"inherit"}}/>
                    <span style={{fontSize:FS-1, color:T.textSec}}>إلى</span>
                    <input type="time" value={day.to} disabled={!day.enabled||!canEdit}
                      onChange={e=>setDay(d.key,"to",e.target.value)}
                      style={{padding:"6px 10px",borderRadius:8,border:`1px solid ${T.brd}`,background:T.cardSolid,color:T.text,fontSize:FS,fontFamily:"inherit"}}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Holidays */}
      <div style={cardStyle}>
        <h3 style={{margin:"0 0 14px",fontSize:FS+2,fontWeight:800,color:T.text}}>🚫 الإجازات</h3>
        <div style={{fontSize:FS-2, color:T.textMut, marginBottom:14}}>
          أيام الـ Agent ميـردش فيها (أعياد، إجازات رسمية).
        </div>
        {(sch.holidays||[]).length > 0 && (
          <div style={{display:"grid", gap:6, marginBottom:14}}>
            {sch.holidays.map(h => (
              <div key={h.id} style={{
                display:"flex", alignItems:"center", gap:10,
                padding:"8px 12px", borderRadius:8,
                background:"#FEF3C7", border:"1px solid #FCD34D",
              }}>
                <span style={{fontSize:FS+1, fontWeight:700, color:"#92400E", flex:1}}>🎉 {h.name}</span>
                <span style={{fontSize:FS-1, color:"#78350F"}}>{h.from}{h.to && h.to !== h.from ? " → "+h.to : ""}</span>
                {canEdit && <Btn danger small onClick={()=>delHoliday(h.id)}>🗑</Btn>}
              </div>
            ))}
          </div>
        )}
        {canEdit && (
          <div style={{display:"grid", gridTemplateColumns: isMob?"1fr":"2fr 1fr 1fr auto", gap:8, alignItems:"end"}}>
            <div>
              <label style={fieldStyle}>اسم الإجازة</label>
              <Inp value={newHoliday.name} onChange={v=>setNewHoliday({...newHoliday, name:v})} placeholder="عيد الفطر"/>
            </div>
            <div>
              <label style={fieldStyle}>من</label>
              <input type="date" value={newHoliday.from} onChange={e=>setNewHoliday({...newHoliday, from:e.target.value})}
                style={{width:"100%",padding:"5px 8px",borderRadius:6,border:`1px solid ${T.brd}`,background:T.cardSolid,color:T.text,fontSize:FS,fontFamily:"inherit",boxSizing:"border-box"}}/>
            </div>
            <div>
              <label style={fieldStyle}>إلى (اختياري)</label>
              <input type="date" value={newHoliday.to} onChange={e=>setNewHoliday({...newHoliday, to:e.target.value})}
                style={{width:"100%",padding:"5px 8px",borderRadius:6,border:`1px solid ${T.brd}`,background:T.cardSolid,color:T.text,fontSize:FS,fontFamily:"inherit",boxSizing:"border-box"}}/>
            </div>
            <Btn primary onClick={addHoliday}>+ إضافة</Btn>
          </div>
        )}
      </div>

      {/* Off-hours behavior */}
      <div style={cardStyle}>
        <h3 style={{margin:"0 0 14px",fontSize:FS+2,fontWeight:800,color:T.text}}>💬 رسالة + سلوك خارج ساعات العمل</h3>
        <div style={{marginBottom:14}}>
          <label style={fieldStyle}>سلوك خارج الساعات</label>
          <Sel value={sch.offHoursBehavior} onChange={v=>setSch("offHoursBehavior", v)}>
            <option value="answer_anyway">الـ Agent يرد ويحاول يساعد</option>
            <option value="say_we_reply">يبعت رسالة إن الفريق هيرد بكرة</option>
            <option value="escalate_all">يحوّل كل شيء لبشري</option>
          </Sel>
        </div>
        <div>
          <label style={fieldStyle}>الرسالة المعروضة (لما السلوك = "يبعت رسالة...")</label>
          <textarea
            value={sch.offHoursMessage||""}
            onChange={e=>setSch("offHoursMessage", e.target.value)}
            readOnly={!canEdit}
            rows={3}
            style={{
              width:"100%", padding:10, borderRadius:8,
              border:`1px solid ${T.brd}`, background:T.cardSolid, color:T.text,
              fontFamily:"inherit", fontSize:FS, lineHeight:1.5,
              resize:"vertical", boxSizing:"border-box", outline:"none", direction:"rtl",
            }}
          />
        </div>
      </div>

      {/* Admin alerts */}
      <div style={cardStyle}>
        <h3 style={{margin:"0 0 14px",fontSize:FS+2,fontWeight:800,color:T.text}}>🔔 تنبيهات للأدمن (في أي وقت، حتى خارج الساعات)</h3>
        <div style={{display:"grid", gap:10}}>
          <label style={{display:"flex",alignItems:"center",gap:10, cursor: canEdit?"pointer":"default", padding:8, borderRadius:8, background:T.bg}}>
            <input type="checkbox" checked={!!sch.adminAlerts?.qualityComplaints}
              onChange={e=>canEdit && setAlert("qualityComplaints", e.target.checked)}
              style={{width:18,height:18}}/>
            <span style={{fontSize:FS, fontWeight:600, color:T.text}}>شكاوى جودة</span>
          </label>
          <div style={{display:"flex",alignItems:"center",gap:10, padding:8, borderRadius:8, background:T.bg, flexWrap:"wrap"}}>
            <span style={{fontSize:FS, fontWeight:600, color:T.text}}>طلبات أكبر من</span>
            <div style={{width:140}}>
              <Inp type="number" value={sch.adminAlerts?.ordersAboveValue || 0}
                onChange={v=>setAlert("ordersAboveValue", parseInt(v)||0)}/>
            </div>
            <span style={{fontSize:FS, fontWeight:600, color:T.text}}>ج</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10, padding:8, borderRadius:8, background:T.bg, flexWrap:"wrap"}}>
            <span style={{fontSize:FS, fontWeight:600, color:T.text}}>عميل Platinum منتظر أكتر من</span>
            <div style={{width:100}}>
              <Inp type="number" value={sch.adminAlerts?.platinumWaitMinutes || 0}
                onChange={v=>setAlert("platinumWaitMinutes", parseInt(v)||0)}/>
            </div>
            <span style={{fontSize:FS, fontWeight:600, color:T.text}}>دقيقة</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   RECENT SENDERS PANEL (V19.77, Phase 2)
   ─────────────────────────────────────────────────────────────
   Live subscription to aiAgentRecentSenders — entries written by
   the agent whenever a non-whitelisted WID messages during test
   mode. Each row shows the WID + count + recent message + a
   one-click "+ ضيف للـ whitelist" button so the admin doesn't
   have to grep agent logs to discover an opaque LID.
   ════════════════════════════════════════════════════════════ */
function RecentSendersPanel({ tm, updateAgent, canEdit, isMob, fieldStyle }){
  const { docs: senders, loading } = useAgentCollection("aiAgentRecentSenders",
    ref => query(ref, orderBy("lastSeenAt", "desc"), limit(20))
  );

  /* Filter out senders already in the whitelist */
  const whitelistUserParts = useMemo(() => {
    const s = new Set();
    (tm.whitelist || []).forEach(e => {
      const wid = e.wid || "";
      const userPart = wid.split("@")[0].replace(/\D/g, "");
      if (userPart) s.add(userPart);
    });
    return s;
  }, [tm.whitelist]);

  const visibleSenders = senders.filter(s => !whitelistUserParts.has(s.userPart));

  const promoteToWhitelist = (sender, label) => {
    updateAgent(a => {
      if (!a.testMode) a.testMode = JSON.parse(JSON.stringify(DEFAULT_AGENT.testMode));
      if (!Array.isArray(a.testMode.whitelist)) a.testMode.whitelist = [];
      const userPart = (sender.wid || "").split("@")[0];
      const dup = a.testMode.whitelist.find(e => (e.wid || "").split("@")[0] === userPart);
      if (dup) return;
      a.testMode.whitelist.push({
        id: gid(),
        wid: sender.wid,
        label: (label || "").trim() || null,
        addedAt: new Date().toISOString(),
        addedFromRecentSender: true,
      });
    });
  };

  const dismissSender = async (sender) => {
    if (!await ask("إخفاء", "تخفي السيندر ده من القائمة؟ مش هيـattempt يتمسح من الـ collection — بس هيختفي من الـ panel ده طالما مش هيبعت تاني.", { confirmText: "إخفاء" })) return;
    try {
      await deleteDoc(doc(db, "aiAgentRecentSenders", sender.id));
      showToast("✓ تم الإخفاء");
    } catch (err) {
      showToast("⛔ فشل الحذف: " + (err.message || err));
    }
  };

  if (!tm.enabled) return null;/* only relevant during test mode */

  return (
    <div style={{
      marginTop: 14,
      padding: 12,
      borderRadius: 10,
      background: "#FFFFFF",
      border: "1px solid #FCD34D",
    }}>
      <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, flexWrap:"wrap", marginBottom:10}}>
        <label style={{...fieldStyle, marginBottom:0, fontSize:FS-1, color:"#92400E"}}>
          📬 آخر اللي بعتوا ومش في الـ whitelist ({visibleSenders.length})
        </label>
        {loading && <span style={{fontSize:FS-3, color:T.textMut}}>⏳ بيحمّل...</span>}
      </div>

      {visibleSenders.length === 0 && !loading && (
        <div style={{fontSize:FS-2, color:"#78350F", padding:"8px 4px", lineHeight:1.6}}>
          {senders.length === 0
            ? "لسه مفيش أحد بعت ورفض. لما رقم خارج الـ whitelist يبعت، هيظهر هنا تلقائياً."
            : "كل اللي بعتوا موجودين في الـ whitelist بالفعل ✓"}
        </div>
      )}

      {visibleSenders.length > 0 && (
        <div style={{display:"grid", gap:6}}>
          {visibleSenders.map(s => (
            <RecentSenderRow
              key={s.id}
              sender={s}
              canEdit={canEdit}
              isMob={isMob}
              onPromote={(label) => promoteToWhitelist(s, label)}
              onDismiss={() => dismissSender(s)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RecentSenderRow({ sender, canEdit, isMob, onPromote, onDismiss }){
  const [label, setLabel] = useState("");
  const [expanded, setExpanded] = useState(false);
  const lastSeen = sender.lastSeenAt ? new Date(sender.lastSeenAt) : null;
  const ago = lastSeen ? timeAgo(lastSeen) : "—";
  return (
    <div style={{
      padding: 10,
      borderRadius: 8,
      background: "#FFFBEB",
      border: "1px solid #FDE68A",
      display: "flex",
      flexDirection: "column",
      gap: 6,
    }}>
      <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, flexWrap:"wrap"}}>
        <div style={{flex:1, minWidth:200}}>
          <div style={{fontSize:FS-1, fontWeight:700, color:"#78350F", fontFamily:"'Fira Code', monospace", wordBreak:"break-all"}}>
            {sender.isLid && <span title="WhatsApp privacy LID — رقم مجهول" style={{marginInlineEnd:6}}>🔒</span>}
            {sender.wid}
          </div>
          <div style={{fontSize:FS-3, color:T.textMut, marginTop:2}}>
            {sender.count} رسالة · آخرها {ago}
          </div>
        </div>
        {canEdit && (
          <div style={{display:"flex", gap:6, flexShrink:0}}>
            <Btn small onClick={()=>setExpanded(!expanded)} style={{background:"#10B98115", color:"#059669", border:"1px solid #10B98140", fontWeight:700}}>
              + للـ whitelist
            </Btn>
            <Btn ghost small onClick={onDismiss} title="إخفاء">🗑</Btn>
          </div>
        )}
      </div>

      {sender.recentMessage && (
        <div style={{
          fontSize:FS-2, color:T.textSec, lineHeight:1.5,
          padding:"4px 8px", background:T.bg, borderRadius:6,
          fontStyle:"italic",
          display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden"
        }}>
          "{sender.recentMessage}"
        </div>
      )}

      {expanded && canEdit && (
        <div style={{display:"flex", gap:6, marginTop:4, flexWrap:"wrap"}}>
          <div style={{flex:"1 1 200px", minWidth:0}}>
            <Inp value={label} onChange={setLabel} placeholder="اسم اختياري (مثال: عميل جديد)..."/>
          </div>
          <Btn primary onClick={() => { onPromote(label); }} style={{flexShrink:0}}>✓ ضيف</Btn>
          <Btn ghost onClick={()=>{setExpanded(false); setLabel("")}} style={{flexShrink:0}}>إلغاء</Btn>
        </div>
      )}
    </div>
  );
}

/* Minimal "5 minutes ago" / "yesterday" / etc. helper for the panel */
function timeAgo(date) {
  const sec = (Date.now() - date.getTime()) / 1000;
  if (sec < 60) return "الآن";
  if (sec < 3600) return Math.floor(sec/60) + "د";
  if (sec < 86400) return Math.floor(sec/3600) + "س";
  return Math.floor(sec/86400) + "يوم";
}

/* ════════════════════════════════════════════════════════════
   PLACEHOLDER TAB — for tabs not yet implemented
   ════════════════════════════════════════════════════════════ */
function PlaceholderTab({ title, icon, phase, desc }){
  const phaseInfo = {
    A: { label:"Phase A — Foundation", color:"#10B981", bg:"#D1FAE5" },
    B: { label:"Phase B — Operations", color:"#D97706", bg:"#FEF3C7" },
    C: { label:"Phase C — Lifecycle",  color:"#64748B", bg:"#F1F5F9" },
  }[phase] || { label:"قريباً", color:"#64748B", bg:"#F1F5F9" };

  return (
    <div style={{
      background:T.cardSolid, border:`1px solid ${T.brd}`, borderRadius:14,
      padding:"60px 24px", textAlign:"center",
    }}>
      <div style={{fontSize:72, marginBottom:18, opacity:0.6}}>{icon}</div>
      <h2 style={{margin:"0 0 8px", fontSize:FS+8, fontWeight:800, color:T.text}}>{title}</h2>
      <span style={{
        display:"inline-block", padding:"6px 14px", borderRadius:20,
        background: phaseInfo.bg, color: phaseInfo.color,
        fontSize:FS-1, fontWeight:700, marginBottom:18,
      }}>
        🚧 {phaseInfo.label}
      </span>
      <div style={{
        maxWidth:560, margin:"0 auto",
        fontSize:FS, color:T.textSec, lineHeight:1.7,
      }}>
        {desc}
      </div>
      <div style={{
        marginTop:24, padding:"12px 20px", borderRadius:10,
        background:"#0EA5E908", border:"1px solid #0EA5E930",
        display:"inline-block",
        fontSize:FS-1, color:"#0369A1", fontWeight:600,
      }}>
        💡 Phase A + B شغّالين دلوقتي. اللي مع badge أصفر/رمادي = Phase C الجاي.
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   DASHBOARD TAB
   V19.72 (placeholder) → V19.77 (live, Phase 2):
   Reads aiAgentAnalytics live via Firestore listener. Each doc id is
   a YYYY-MM-DD Cairo dayKey written by the agent's hourly cron.

   New schema (clark-ai-agent v1.0.1):
     turnsTotal, turnsSuccessful, turnsCanned, turnsSkipped, turnsFailed
     uniqueSenders, avgDurationMs
     toolUsage{}, stages{}
     tokens{ input, output, cacheRead, cacheWrite }
     estimatedCostUsd
   ════════════════════════════════════════════════════════════ */
function DashboardTab({ agent, data, isMob }){
  const [range, setRange] = useState("today");/* today | 7d | 30d */

  /* Live subscription — only mounted while this tab is rendered */
  const { docs: analyticsDocs, loading } = useAgentCollection("aiAgentAnalytics");

  /* Index by dayKey for O(1) lookup */
  const analytics = useMemo(() => {
    const m = {};
    for (const d of analyticsDocs) m[d.dayKey || d.id] = d;
    return m;
  }, [analyticsDocs]);

  /* Build last-N-days array of keys (oldest first) using Cairo timezone */
  const cairoToday = useMemo(() => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date());
    const m = {}; for (const p of parts) m[p.type] = p.value;
    return `${m.year}-${m.month}-${m.day}`;
  }, [analyticsDocs]);

  const days = useMemo(() => {
    const n = range === "today" ? 1 : range === "7d" ? 7 : 30;
    const out = [];
    const [yy, mm, dd] = cairoToday.split("-").map(Number);
    const todayDate = new Date(Date.UTC(yy, mm-1, dd));
    for (let i = n-1; i >= 0; i--) {
      const d = new Date(todayDate); d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0,10);
      const label = `${d.getUTCDate()}/${d.getUTCMonth()+1}`;
      out.push({ key, label, ...(analytics[key] || {}) });
    }
    return out;
  }, [range, analytics, cairoToday]);

  const totals = useMemo(() => days.reduce((acc, d) => ({
    turnsTotal:       acc.turnsTotal       + (d.turnsTotal       || 0),
    turnsSuccessful:  acc.turnsSuccessful  + (d.turnsSuccessful  || 0),
    turnsCanned:      acc.turnsCanned      + (d.turnsCanned      || 0),
    turnsSkipped:     acc.turnsSkipped     + (d.turnsSkipped     || 0),
    turnsFailed:      acc.turnsFailed      + (d.turnsFailed      || 0),
    uniqueSenders:    acc.uniqueSenders    + (d.uniqueSenders    || 0),
    cost:             acc.cost             + (d.estimatedCostUsd || 0),
    inputTokens:      acc.inputTokens      + (d.tokens?.input    || 0),
    outputTokens:     acc.outputTokens     + (d.tokens?.output   || 0),
    cacheReadTokens:  acc.cacheReadTokens  + (d.tokens?.cacheRead  || 0),
    cacheWriteTokens: acc.cacheWriteTokens + (d.tokens?.cacheWrite || 0),
    avgResp:          (d.avgDurationMs || 0),/* last day's avg */
  }), {
    turnsTotal:0, turnsSuccessful:0, turnsCanned:0, turnsSkipped:0, turnsFailed:0,
    uniqueSenders:0, cost:0, inputTokens:0, outputTokens:0, cacheReadTokens:0,
    cacheWriteTokens:0, avgResp:0,
  }), [days]);

  /* Tool usage aggregated across all days in range */
  const toolTotals = useMemo(() => {
    const t = {};
    for (const d of days) {
      const u = d.toolUsage || {};
      for (const [k, v] of Object.entries(u)) t[k] = (t[k] || 0) + v;
    }
    return Object.entries(t).sort((a,b) => b[1]-a[1]).slice(0, 5);
  }, [days]);

  const chartData = days.map(d => ({
    name: d.label,
    محادثات: d.turnsTotal     || 0,
    "test mode": d.turnsSkipped || 0,
  }));

  const hasAnyData = totals.turnsTotal > 0;

  const cardStyle = { background:T.cardSolid, border:`1px solid ${T.brd}`, borderRadius:14, padding: isMob?14:18, marginBottom:14 };

  return (
    <div>
      {/* Range selector */}
      <div style={{...cardStyle, display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10}}>
        <div style={{display:"flex", alignItems:"center", gap:10}}>
          <span style={{fontSize:FS+1, fontWeight:800, color:T.text}}>📊 لوحة التحكم</span>
          <span style={{fontSize:FS-1, color:T.textMut}}>·</span>
          <span style={{
            display:"inline-flex", alignItems:"center", gap:6,
            padding:"3px 10px", borderRadius:10,
            background: agent.enabled ? "#10B98115" : "#94A3B815",
            color: agent.enabled ? "#059669" : "#64748B",
            fontSize:FS-2, fontWeight:700,
          }}>{agent.enabled ? "🟢 شغّال" : "⏸️ موقوف"}</span>
        </div>
        <div style={{display:"flex", gap:6}}>
          {[
            { val:"today", label:"اليوم" },
            { val:"7d",    label:"٧ أيام" },
            { val:"30d",   label:"٣٠ يوم" },
          ].map(r => (
            <Btn key={r.val} primary={range===r.val} small onClick={()=>setRange(r.val)}>{r.label}</Btn>
          ))}
        </div>
      </div>

      {/* Empty-state banner */}
      {!hasAnyData && !loading && (
        <div style={{
          padding:"14px 18px", marginBottom:14, borderRadius:12,
          background:"#FEF3C7", border:"1px solid #FCD34D",
          display:"flex", alignItems:"center", gap:12, flexWrap:"wrap",
        }}>
          <span style={{fontSize:28}}>⏳</span>
          <div style={{flex:1, minWidth:200}}>
            <div style={{fontSize:FS, fontWeight:800, color:"#92400E"}}>مفيش محادثات لسه في الفترة دي</div>
            <div style={{fontSize:FS-1, color:"#78350F", marginTop:2, lineHeight:1.5}}>
              الـ Agent بـ يـ aggregate كل ساعة في `aiAgentAnalytics/{`{دvتاريخ}`}`. لو الـ Agent شغّال بس لسه مفيش رسائل، الكروت هتبقى 0.
            </div>
          </div>
        </div>
      )}
      {loading && (
        <div style={{padding:"10px 14px", marginBottom:14, borderRadius:10, background:T.brd+"20", fontSize:FS-1, color:T.textMut}}>
          ⏳ بيحمّل البيانات من Firestore...
        </div>
      )}

      {/* KPI grid */}
      <div style={{display:"grid", gridTemplateColumns: isMob?"1fr 1fr":"repeat(4, 1fr)", gap:10, marginBottom:14}}>
        <KpiCard icon="💬" label="محادثات" value={totals.turnsTotal} color="#0EA5E9"/>
        <KpiCard icon="✅" label="ناجحة"   value={totals.turnsSuccessful} color="#10B981"/>
        <KpiCard icon="👥" label="عملاء" value={totals.uniqueSenders} color="#F59E0B"/>
        <KpiCard icon="💰" label="تكلفة (USD)" value={"$"+totals.cost.toFixed(3)} color="#8B5CF6"/>
      </div>
      <div style={{display:"grid", gridTemplateColumns: isMob?"1fr 1fr":"repeat(4, 1fr)", gap:10, marginBottom:14}}>
        <KpiCard icon="🤖" label="رد آلي (off-hours)" value={totals.turnsCanned} color="#06B6D4"/>
        <KpiCard icon="⏭" label="مش في الـ whitelist" value={totals.turnsSkipped} color="#94A3B8"/>
        <KpiCard icon="❌" label="فشل" value={totals.turnsFailed} color="#EF4444"/>
        <KpiCard icon="⚡" label="متوسط الزمن" value={totals.avgResp ? `${(totals.avgResp/1000).toFixed(1)} ث` : "—"} color="#059669"/>
      </div>

      {/* Chart */}
      <div style={cardStyle}>
        <h3 style={{margin:"0 0 14px",fontSize:FS+1,fontWeight:800,color:T.text}}>📈 المحادثات على مدار الفترة</h3>
        <div style={{width:"100%", height: isMob?180:240}}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.brd}/>
              <XAxis dataKey="name" tick={{ fill: T.textSec, fontSize: FS-2 }}/>
              <YAxis allowDecimals={false} tick={{ fill: T.textSec, fontSize: FS-2 }}/>
              <Tooltip contentStyle={{ background: T.cardSolid, border: `1px solid ${T.brd}`, borderRadius: 8, fontSize: FS-1 }}/>
              <Bar dataKey="محادثات" fill="#8B5CF6" radius={[4,4,0,0]}/>
              <Bar dataKey="test mode" fill="#94A3B8" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Token + tool usage panel */}
      <div style={{display:"grid", gridTemplateColumns: isMob?"1fr":"1fr 1fr", gap:14}}>
        <div style={cardStyle}>
          <h3 style={{margin:"0 0 14px",fontSize:FS+1,fontWeight:800,color:T.text}}>🪙 استخدام الـ tokens</h3>
          <CostRow label="Input"        value={totals.inputTokens}      color="#0EA5E9" suffix=" tk" precision={0}/>
          <CostRow label="Output"       value={totals.outputTokens}     color="#10B981" suffix=" tk" precision={0}/>
          <CostRow label="Cache write"  value={totals.cacheWriteTokens} color="#F59E0B" suffix=" tk" precision={0}/>
          <CostRow label="Cache read (مدّخّر)" value={totals.cacheReadTokens}  color="#8B5CF6" suffix=" tk" precision={0}/>
          <div style={{marginTop:10, paddingTop:10, borderTop:`2px solid ${T.brd}`, display:"flex", justifyContent:"space-between", fontSize:FS, fontWeight:800}}>
            <span>الإجمالي بـ USD</span>
            <span>${totals.cost.toFixed(4)}</span>
          </div>
        </div>
        <div style={cardStyle}>
          <h3 style={{margin:"0 0 14px",fontSize:FS+1,fontWeight:800,color:T.text}}>🛠 الأدوات الأكثر استخداماً</h3>
          {toolTotals.length === 0 ? (
            <div style={{fontSize:FS-1, color:T.textMut, padding:"8px 0"}}>لا يوجد استخدام للأدوات في الفترة المحددة.</div>
          ) : toolTotals.map(([name, count]) => (
            <KpiRow key={name} label={name} value={count}/>
          ))}
          <div style={{marginTop:10, paddingTop:10, borderTop:`2px solid ${T.brd}`, fontSize:FS-2, color:T.textMut, lineHeight:1.6}}>
            💡 الأدوات الـ 5 المتاحة: get_faq_answer · search_products · get_product_details · get_company_info · escalate_to_human
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, color }){
  return (
    <div style={{
      padding:"12px 14px", borderRadius:12,
      background:`${color}10`, border:`1px solid ${color}30`,
    }}>
      <div style={{display:"flex", alignItems:"center", gap:6, marginBottom:4}}>
        <span style={{fontSize:FS+2}}>{icon}</span>
        <span style={{fontSize:FS-2, fontWeight:600, color:T.textSec}}>{label}</span>
      </div>
      <div style={{fontSize:FS+10, fontWeight:800, color, lineHeight:1.1}}>{value}</div>
    </div>
  );
}

function CostRow({ label, value, color, suffix = "", precision = 3 }){
  /* V19.77: support non-USD rows (token counts) via suffix + precision overrides. */
  const formatted = precision === 0
    ? Number(value || 0).toLocaleString("en-US")
    : Number(value || 0).toFixed(precision);
  const display = suffix ? formatted + suffix : "$" + formatted;
  return (
    <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", padding:"6px 0", fontSize:FS-1}}>
      <span style={{display:"flex", alignItems:"center", gap:8, color:T.textSec}}>
        <span style={{width:10,height:10,borderRadius:"50%",background:color,display:"inline-block"}}/>
        {label}
      </span>
      <span style={{fontWeight:700, color:T.text, fontVariantNumeric:"tabular-nums"}}>{display}</span>
    </div>
  );
}

function KpiRow({ label, value }){
  return (
    <div style={{display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:`1px solid ${T.brd}`, fontSize:FS-1}}>
      <span style={{color:T.textSec}}>{label}</span>
      <span style={{fontWeight:700, color:T.text}}>{value}</span>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   CONVERSATION LOGS TAB
   V19.72 (placeholder) → V19.77 (live, Phase 2):
   Live subscription to aiAgentConversations. Each Firestore doc =
   one turn (NOT a thread of N messages). Cards group consecutive
   turns by wid so the view reads like a thread.
   ════════════════════════════════════════════════════════════ */
function LogsTab({ agent, data, isMob, user, canEdit }){
  /* Pull last 200 turns ordered by `at` desc. The orderBy needs
     a single-field index (auto-created by Firestore on first query). */
  const { docs: turns, loading, error } = useAgentCollection("aiAgentConversations",
    ref => query(ref, orderBy("at", "desc"), limit(200))
  );

  /* V21.9.235: live manual-takeover state (one doc per wid). Read-only; if the
     aiAgentTakeovers rules clause isn't deployed yet the listener errors →
     empty map (controls still work via the admin-SDK endpoints). */
  const { docs: takeoverDocs, error: takeoverError } = useAgentCollection("aiAgentTakeovers",
    ref => query(ref, where("active", "==", true))
  );
  const takeoverByWid = useMemo(() => {
    const m = {};
    for (const d of takeoverDocs) if (d.wid) m[d.wid] = d;
    return m;
  }, [takeoverDocs]);
  const activeTakeoverCount = useMemo(
    () => Object.values(takeoverByWid).filter(to => takeoverActive(to, agent)).length,
    [takeoverByWid, agent]
  );

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  /* Group consecutive turns by wid for display as threads */
  const threads = useMemo(() => {
    /* turns are newest-first; group by wid */
    const byWid = {};
    for (const t of turns) {
      const k = t.wid || "(unknown)";
      if (!byWid[k]) byWid[k] = { wid: k, turns: [], lastAt: t.at };
      byWid[k].turns.push(t);
    }
    /* turns inside each thread should be oldest→newest for display */
    for (const k of Object.keys(byWid)) byWid[k].turns.reverse();
    /* Sort threads by latest activity (newest first) */
    return Object.values(byWid).sort((a,b) => String(b.lastAt).localeCompare(String(a.lastAt)));
  }, [turns]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return threads.filter(th => {
      const last = th.turns[th.turns.length-1] || {};
      const isSkipped = th.turns.some(t => t.skipped || t.canned);
      const isError = th.turns.some(t => t.error);
      const isTakeover = takeoverActive(takeoverByWid[th.wid], agent);
      if (statusFilter === "ok"       && (isSkipped || isError)) return false;
      if (statusFilter === "skipped"  && !isSkipped) return false;
      if (statusFilter === "error"    && !isError) return false;
      if (statusFilter === "takeover" && !isTakeover) return false;
      if (!q) return true;
      const hay = [
        th.wid, last.customerName, last.phone,
        ...th.turns.flatMap(t => [t.userMessage, t.assistantReply]),
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [threads, search, statusFilter, takeoverByWid, agent]);

  const cardStyle = { background:T.cardSolid, border:`1px solid ${T.brd}`, borderRadius:14, padding: isMob?14:18, marginBottom:14 };

  return (
    <div>
      <div style={{...cardStyle, display:"flex", flexWrap:"wrap", gap:10, alignItems:"center"}}>
        <div style={{flex:"1 1 240px", minWidth:200}}>
          <Inp value={search} onChange={setSearch} placeholder="🔍 بحث: WID/اسم/رقم/كلمة..."/>
        </div>
        <div style={{flex:"0 0 180px", minWidth:140}}>
          <Sel value={statusFilter} onChange={setStatusFilter}>
            <option value="">كل الحالات</option>
            <option value="takeover">🎮 تحت السيطرة اليدوية</option>
            <option value="ok">رد طبيعي</option>
            <option value="skipped">رد آلي/متخطّى</option>
            <option value="error">فشل</option>
          </Sel>
        </div>
      </div>

      <div style={{display:"flex", gap:10, marginBottom:14, flexWrap:"wrap"}}>
        <StatPill label="إجمالي turns" value={turns.length} color="#0EA5E9"/>
        <StatPill label="threads" value={threads.length} color="#10B981"/>
        <StatPill label="ظاهر" value={filtered.length} color="#8B5CF6"/>
        <StatPill label="🎮 تدخّل يدوي" value={activeTakeoverCount} color="#F59E0B"/>
        <StatPill label="فشل" value={turns.filter(t=>t.error).length} color="#EF4444"/>
      </div>

      {takeoverError && (
        <div style={{padding:"8px 12px", marginBottom:14, borderRadius:10, background:"#FEF3C7", color:"#92400E", fontSize:FS-2, lineHeight:1.6}}>
          ⚠️ مش قادر أقرا حالة «التدخّل اليدوي» لحظياً — محتاج تـ deploy قاعدة <code>aiAgentTakeovers</code> في firestore.rules. أزرار التدخّل/الرد لسه شغّالة (بتعدّي على السيرفر).
        </div>
      )}
      {loading && (
        <div style={{padding:"10px 14px", marginBottom:14, borderRadius:10, background:T.brd+"20", fontSize:FS-1, color:T.textMut}}>
          ⏳ بيحمّل الـ conversations من Firestore...
        </div>
      )}

      {error && (
        <div style={{padding:"10px 14px", marginBottom:14, borderRadius:10, background:"#FEE2E2", color:"#991B1B", fontSize:FS-1, lineHeight:1.6}}>
          ⚠️ خطأ في تحميل الـ conversations: {error.message || String(error)}<br/>
          <span style={{fontSize:FS-3, color:"#7F1D1D"}}>
            ممكن يحتاج Firestore يـ create index — افتح Firebase Console → Firestore → Indexes ودوّس على الـ link اللي في الـ console error.
          </span>
        </div>
      )}

      {!loading && filtered.length === 0 ? (
        <div style={{...cardStyle, textAlign:"center", padding:"50px 24px"}}>
          <div style={{fontSize:56, marginBottom:14, opacity:0.5}}>💬</div>
          <div style={{fontSize:FS+3, fontWeight:800, color:T.text, marginBottom:6}}>
            {turns.length === 0 ? "مفيش محادثات لسه" : "مفيش نتائج بالفلتر"}
          </div>
          <div style={{fontSize:FS-1, color:T.textMut, marginBottom:14, maxWidth:480, margin:"0 auto 14px", lineHeight:1.6}}>
            {turns.length === 0
              ? "أول رسالة من عميل هتظهر هنا فوراً. الـ agent بـ يكتب كل turn في `aiAgentConversations` Firestore collection."
              : "غيّر شروط البحث أو الفلتر."}
          </div>
        </div>
      ) : (
        <div style={{display:"grid", gap:10}}>
          {filtered.slice(0, 50).map(th => (
            <ConversationThreadCard key={th.wid} thread={th} takeover={takeoverByWid[th.wid]} agent={agent} user={user} canEdit={canEdit}/>
          ))}
          {filtered.length > 50 && (
            <div style={{textAlign:"center", padding:14, color:T.textMut, fontSize:FS-1}}>
              ظاهر أول 50 محادثة من أصل {filtered.length}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ConversationThreadCard({ thread, takeover, agent, user, canEdit }){
  const [open, setOpen] = useState(false);
  const t = thread;
  const last = t.turns[t.turns.length-1] || {};
  const isLid = String(t.wid).includes("@lid");
  const phone = last.phone || (isLid ? "" : String(t.wid).split("@")[0]);
  const totalDuration = t.turns.reduce((s, x) => s + (x.durationMs || 0), 0);
  const allTools = t.turns.flatMap(x => x.toolsUsed || []);
  const cost = t.turns.reduce((s, x) => {
    const u = x.usage || {};
    return s + (Number(u.input_tokens)||0)*1.0/1e6
             + (Number(u.output_tokens)||0)*5.0/1e6
             + (Number(u.cache_creation_input_tokens)||0)*1.25/1e6
             + (Number(u.cache_read_input_tokens)||0)*0.10/1e6;
  }, 0);

  /* V21.9.235 — manual takeover controls. localTo is an optimistic override so
     the acting admin sees the new state instantly even when the live listener
     isn't permitted yet (aiAgentTakeovers rules not deployed). */
  const [busy, setBusy] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [localTo, setLocalTo] = useState(undefined);
  const effTo = localTo !== undefined ? localTo : takeover;
  const isActiveTakeover = takeoverActive(effTo, agent);
  const canControl = canEdit && !isLid && !!phone;
  const autoHours = (() => { const h = Number(agent?.takeover?.autoResumeHours); return Number.isFinite(h) && h > 0 ? h : 24; })();

  const doTakeover = async (active) => {
    if (busy || !user) return;
    setBusy(true);
    try {
      const r = await aiAgentSetTakeover({ wid: t.wid, active, phone, customerName: last.customerName || "", customerId: last.customerId || "" }, user);
      if (r?.ok) { setLocalTo(r.takeover || { active }); showToast(active ? "🎮 اتحكمت في المحادثة — الأيجنت موقوف" : "▶️ رجّعنا الأيجنت للمحادثة"); }
      else showToast("⛔ " + (r?.error || "فشل تغيير حالة التدخّل"));
    } catch (e) { showToast("⛔ " + (e?.message || "فشل تغيير حالة التدخّل")); }
    finally { setBusy(false); }
  };

  const doReply = async () => {
    const msg = replyText.trim();
    if (!msg || busy || !user) return;
    setBusy(true);
    try {
      const r = await aiAgentAdminReply({ wid: t.wid, phone, message: msg, customerName: last.customerName || "", customerId: last.customerId || "" }, user);
      if (r?.ok) { setReplyText(""); setLocalTo({ ...(effTo || {}), active: true, lastAdminReplyAt: r.at || new Date().toISOString() }); showToast("📤 اتبعت الرسالة للعميل"); }
      else showToast("⛔ " + (r?.error || "فشل إرسال الرسالة"));
    } catch (e) { showToast("⛔ " + (e?.message || "فشل إرسال الرسالة")); }
    finally { setBusy(false); }
  };

  const status = last.error ? "error" : (last.canned || last.skipped) ? "skipped" : "ok";
  const statusBadge = status === "error" ? { label: "❌ فشل", bg: "#FEE2E2", color: "#991B1B" }
                    : status === "skipped" ? { label: last.canned ? "🤖 رد آلي" : "⏭ متخطّى", bg: "#E5E7EB", color: "#374151" }
                    : { label: "✅ تم", bg: "#D1FAE5", color: "#065F46" };
  return (
    <div style={{background:T.cardSolid, border:`1px solid ${isActiveTakeover ? "#F59E0B" : T.brd}`, borderRadius:12, padding:12}}>
      <div onClick={()=>setOpen(!open)} style={{cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10, flexWrap:"wrap"}}>
        <div style={{flex:1, minWidth:200}}>
          <div style={{fontSize:FS, fontWeight:800, color:T.text}}>
            👤 {last.customerName || (isLid ? "🔒 LID مجهول" : String(t.wid).split("@")[0])}
            {last.stage && <span style={{fontSize:FS-2, color:T.textMut, fontWeight:600, marginInlineStart:8}}>· {last.stage}</span>}
            {isLid && !last.customerName && <span style={{fontSize:FS-3, fontFamily:"monospace", color:T.textMut, fontWeight:600, marginInlineStart:8}}>· {t.wid}</span>}
          </div>
          <div style={{fontSize:FS-1, color:T.textSec, marginTop:4, lineHeight:1.5,
            display:"-webkit-box", WebkitLineClamp:1, WebkitBoxOrient:"vertical", overflow:"hidden"}}>
            {last.userMessage || last.assistantReply || "(فاضي)"}
          </div>
        </div>
        <div style={{display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4, flexShrink:0}}>
          {isActiveTakeover && (
            <span style={{fontSize:FS-3, padding:"2px 8px", borderRadius:8, fontWeight:800, background:"#FEF3C7", color:"#92400E", border:"1px solid #F59E0B"}}>🎮 تدخّل يدوي</span>
          )}
          <span style={{
            fontSize:FS-3, padding:"2px 8px", borderRadius:8, fontWeight:700,
            background: statusBadge.bg, color: statusBadge.color,
          }}>{statusBadge.label}</span>
          <span style={{fontSize:FS-3, color:T.textMut}}>
            {t.turns.length} turn · {(totalDuration/1000).toFixed(1)} ث · ${cost.toFixed(4)}
          </span>
        </div>
      </div>
      {open && (
        <div style={{marginTop:10, paddingTop:10, borderTop:`1px solid ${T.brd}`}}>
          {/* ── V21.9.235 Manual takeover control bar ── */}
          <div style={{marginBottom:12, padding:"10px 12px", borderRadius:10,
            background: isActiveTakeover ? "#FEF3C720" : T.bg,
            border:`1px solid ${isActiveTakeover ? "#F59E0B55" : T.brd}`}}>
            {!canControl ? (
              <div style={{fontSize:FS-2, color:T.textMut, lineHeight:1.6}}>
                {(isLid || !phone)
                  ? "🔒 العميل ده LID من غير رقم — التدخّل اليدوي مش متاح (الأيجنت أصلاً مش بيرد عليه)."
                  : "👁️ عرض فقط — مفيش صلاحية للتدخّل اليدوي."}
              </div>
            ) : !isActiveTakeover ? (
              <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, flexWrap:"wrap"}}>
                <div style={{fontSize:FS-2, color:T.textSec, lineHeight:1.5, flex:1, minWidth:180}}>
                  🎮 <strong>التدخّل اليدوي:</strong> هيوقف رد الأيجنت على العميل ده وتقدر ترد بنفسك. (بيرجع تلقائياً بعد {autoHours} ساعة من غير نشاط)
                </div>
                <LoadingBtn small primary loading={busy} loadingText="..." onClick={()=>doTakeover(true)}>🎮 تدخّل</LoadingBtn>
              </div>
            ) : (
              <div>
                <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, flexWrap:"wrap", marginBottom:8}}>
                  <div style={{fontSize:FS-2, color:"#92400E", fontWeight:700, lineHeight:1.5}}>
                    🎮 أنت متحكم في المحادثة دي — الأيجنت موقوف.
                    {effTo?.takenOverBy && <span style={{fontWeight:500, color:"#78350F"}}> (بدأ: {effTo.takenOverBy})</span>}
                  </div>
                  <LoadingBtn small danger loading={busy} loadingText="..." onClick={()=>doTakeover(false)}>▶️ استئناف الأيجنت</LoadingBtn>
                </div>
                <div style={{display:"flex", gap:8, alignItems:"flex-end", flexWrap:"wrap"}}>
                  <textarea
                    value={replyText}
                    onChange={(e)=>setReplyText(e.target.value)}
                    placeholder="اكتب ردك للعميل هنا..."
                    rows={2}
                    style={{flex:"1 1 240px", minWidth:200, resize:"vertical", padding:"8px 10px",
                      borderRadius:8, border:`1px solid ${T.brd}`, background:T.cardSolid, color:T.text,
                      fontSize:FS-1, fontFamily:"inherit", direction:"rtl"}}
                  />
                  <LoadingBtn small primary loading={busy} loadingText="..." disabled={!replyText.trim()} onClick={doReply}>📤 رد للعميل</LoadingBtn>
                </div>
                <div style={{fontSize:FS-3, color:T.textMut, marginTop:6, lineHeight:1.5}}>
                  بيتبعت عبر واتساب للعميل فوراً ويتسجّل في المحادثة كـ «رد يدوي».
                </div>
              </div>
            )}
          </div>
          {/* ── Turns ── */}
          <div style={{maxHeight:400, overflow:"auto"}}>
          {t.turns.map((tn, i) => (
            <div key={tn.id || i} style={{marginBottom:14, paddingBottom:10, borderBottom: i<t.turns.length-1 ? `1px dashed ${T.brd}` : "none"}}>
              {tn.userMessage && (
                <div style={{padding:"6px 10px", marginBottom:6, borderRadius:8, background:T.bg, fontSize:FS-1, color:T.text}}>
                  <strong style={{color:T.textSec, fontSize:FS-2}}>👤 العميل</strong>
                  <div style={{marginTop:2, whiteSpace:"pre-wrap"}}>{tn.userMessage}</div>
                </div>
              )}
              {tn.assistantReply && (
                tn.admin_takeover ? (
                  <div style={{padding:"6px 10px", marginBottom:6, borderRadius:8, background:"#10B98112", fontSize:FS-1, color:T.text}}>
                    <strong style={{color:"#059669", fontSize:FS-2}}>👨‍💼 رد يدوي{tn.adminBy ? " · " + tn.adminBy : ""}</strong>
                    <div style={{marginTop:2, whiteSpace:"pre-wrap"}}>{tn.assistantReply}</div>
                  </div>
                ) : (
                  <div style={{padding:"6px 10px", marginBottom:6, borderRadius:8, background:"#8B5CF608", fontSize:FS-1, color:T.text}}>
                    <strong style={{color:"#7C3AED", fontSize:FS-2}}>🤖 Agent</strong>
                    <div style={{marginTop:2, whiteSpace:"pre-wrap"}}>{tn.assistantReply}</div>
                  </div>
                )
              )}
              <div style={{fontSize:FS-3, color:T.textMut, marginTop:4, display:"flex", flexWrap:"wrap", gap:8}}>
                {tn.at && <span>{new Date(tn.at).toLocaleString("ar-EG")}</span>}
                {(tn.toolsUsed||[]).length > 0 && <span>🛠 {tn.toolsUsed.join(", ")}</span>}
                {tn.iterations > 1 && <span>🔄 {tn.iterations} iter</span>}
                {tn.error && <span style={{color:"#EF4444"}}>❌ {tn.error}</span>}
                {tn.skippedReason && <span>⏭ {tn.skippedReason}</span>}
              </div>
            </div>
          ))}
          {allTools.length > 0 && (
            <div style={{marginTop:8, fontSize:FS-2, color:T.textSec}}>
              <strong>الأدوات في الـ thread:</strong> {Array.from(new Set(allTools)).join(" · ")}
            </div>
          )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   SUGGESTIONS TAB (V19.77.2 — Phase 3)
   ─────────────────────────────────────────────────────────────
   Live subscription to aiAgentSuggestions — proposals the agent
   wrote for the admin to review/decide. Currently the only kind
   the agent emits is "lid_phone_mapping" (via the V19.77.1
   notify_admin_phone_request tool). Designed open so future kinds
   (FAQ proposals, customer observations, etc.) drop in cleanly.

   Decisions: linked / ignored / blocked. Each decision writes
   back to the same doc + (for linked) updates the customer record
   to add the LID to additional_phones[]. The agent's read-only
   wrapper doesn't apply here — this UI is the CLARK admin app, not
   the agent.
   ════════════════════════════════════════════════════════════ */
function SuggestionsTab({ agent, data, upConfig, canEdit, isMob }){
  const { docs: suggestions, loading, error } = useAgentCollection("aiAgentSuggestions",
    ref => query(ref, orderBy("sent_at", "desc"), limit(100))
  );

  const [statusFilter, setStatusFilter] = useState("pending");
  const [kindFilter, setKindFilter] = useState("all");

  const filtered = useMemo(() => {
    return suggestions.filter(s => {
      if (statusFilter !== "all" && (s.status || "pending") !== statusFilter) return false;
      if (kindFilter !== "all" && s.kind !== kindFilter) return false;
      return true;
    });
  }, [suggestions, statusFilter, kindFilter]);

  const counts = useMemo(() => {
    const out = { pending: 0, linked: 0, ignored: 0, blocked: 0, total: suggestions.length };
    for (const s of suggestions) {
      const st = s.status || "pending";
      if (out[st] !== undefined) out[st]++;
    }
    return out;
  }, [suggestions]);

  const cardStyle = { background:T.cardSolid, border:`1px solid ${T.brd}`, borderRadius:14, padding: isMob?14:18, marginBottom:14 };

  return (
    <div>
      {/* Header + filters */}
      <div style={{...cardStyle, display:"flex", flexWrap:"wrap", gap:10, alignItems:"center"}}>
        <div style={{flex:"1 1 200px"}}>
          <h3 style={{margin:0, fontSize:FS+1, fontWeight:800, color:T.text}}>🔔 اقتراحات الـ AI</h3>
          <div style={{fontSize:FS-2, color:T.textMut, marginTop:4, lineHeight:1.5}}>
            الـ Agent بـ يـ flag حاجات للأدمن يقرر فيها (ربط LID، اقتراحات FAQ، إلخ). راجع بانتظام.
          </div>
        </div>
        <div style={{display:"flex", gap:6, flexWrap:"wrap"}}>
          {[
            { val:"pending", label:`⏳ تحت المراجعة (${counts.pending})` },
            { val:"linked",  label:`✓ مربوط (${counts.linked})` },
            { val:"ignored", label:`✗ تجاهل (${counts.ignored})` },
            { val:"blocked", label:`🚫 محظور (${counts.blocked})` },
            { val:"all",     label:`الكل (${counts.total})` },
          ].map(opt => (
            <Btn key={opt.val} small primary={statusFilter===opt.val} onClick={()=>setStatusFilter(opt.val)}>
              {opt.label}
            </Btn>
          ))}
        </div>
      </div>

      {/* Kind filter (only relevant if there are multiple kinds) */}
      {(() => {
        const kinds = Array.from(new Set(suggestions.map(s => s.kind).filter(Boolean)));
        if (kinds.length <= 1) return null;
        return (
          <div style={{...cardStyle, display:"flex", flexWrap:"wrap", gap:6, alignItems:"center"}}>
            <span style={{fontSize:FS-1, fontWeight:700, color:T.textSec, marginInlineEnd:8}}>النوع:</span>
            <Btn small primary={kindFilter==="all"} onClick={()=>setKindFilter("all")}>الكل</Btn>
            {kinds.map(k => (
              <Btn key={k} small primary={kindFilter===k} onClick={()=>setKindFilter(k)}>
                {labelForKind(k)}
              </Btn>
            ))}
          </div>
        );
      })()}

      {loading && (
        <div style={{padding:"10px 14px", marginBottom:14, borderRadius:10, background:T.brd+"20", fontSize:FS-1, color:T.textMut}}>
          ⏳ بيحمّل من Firestore...
        </div>
      )}

      {error && (
        <div style={{padding:"10px 14px", marginBottom:14, borderRadius:10, background:"#FEE2E2", color:"#991B1B", fontSize:FS-1}}>
          ⚠️ {error.message || String(error)}
        </div>
      )}

      {!loading && filtered.length === 0 ? (
        <div style={{...cardStyle, textAlign:"center", padding:"50px 24px"}}>
          <div style={{fontSize:56, marginBottom:14, opacity:0.5}}>🔔</div>
          <div style={{fontSize:FS+3, fontWeight:800, color:T.text, marginBottom:6}}>
            {suggestions.length === 0 ? "مفيش اقتراحات لسه" : "مفيش نتائج بالفلتر"}
          </div>
          <div style={{fontSize:FS-1, color:T.textMut, maxWidth:480, margin:"0 auto", lineHeight:1.6}}>
            {suggestions.length === 0
              ? "لما الـ Agent يحتاج قرار من الأدمن (مثلاً: عميل مجهول الـ LID وعاوز يربطه باسم)، الاقتراح هيظهر هنا لمراجعتك."
              : "غيّر الفلتر فوق عشان تشوف اقتراحات تانية."}
          </div>
        </div>
      ) : (
        <div style={{display:"grid", gap:10}}>
          {filtered.map(s => (
            <SuggestionCard
              key={s.id}
              suggestion={s}
              data={data}
              upConfig={upConfig}
              canEdit={canEdit}
              isMob={isMob}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function labelForKind(kind) {
  if (kind === "lid_phone_mapping") return "🔗 ربط رقم/LID";
  if (kind === "faq_suggestion")    return "📚 اقتراح FAQ";
  if (kind === "customer_observation") return "🔍 ملاحظة عميل";
  if (kind === "stage_transition") return "📊 تغيير مرحلة";
  return kind;
}

function SuggestionCard({ suggestion, data, upConfig, canEdit, isMob }){
  const [expandLink, setExpandLink] = useState(false);
  const [pickedCustomerId, setPickedCustomerId] = useState("");
  const [search, setSearch] = useState("");
  const s = suggestion;
  const status = s.status || "pending";
  const isPending = status === "pending";

  const sentAt = s.sent_at ? new Date(s.sent_at) : null;
  const ago = sentAt ? sentAt.toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" }) : "—";

  const customers = data?.customers || [];
  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? customers.filter(c =>
          (c.name || "").toLowerCase().includes(q)
          || (c.phone || "").toLowerCase().includes(q))
      : customers;
    return list.slice(0, 30);
  }, [customers, search]);

  /* Apply linked decision: write to customers + mark suggestion */
  const applyLink = async () => {
    if (!pickedCustomerId) {
      showToast("⚠️ اختار عميل");
      return;
    }
    if (!await ask(
      "ربط الـ LID/الرقم",
      `هتربط '${s.wid}' بحساب العميل المختار. الـ LID هـ يضاف لـ additional_phones — كل الرسائل من اللحظة دي هتـ match.`,
      { confirmText: "ربط" }
    )) return;

    /* Update customer.additional_phones in CLARK */
    upConfig(d => {
      if (!Array.isArray(d.customers)) d.customers = [];
      const cust = d.customers.find(c => c.id === pickedCustomerId);
      if (!cust) return;
      if (!Array.isArray(cust.additional_phones)) cust.additional_phones = [];
      /* Prefer storing as object so we know it came from a suggestion */
      cust.additional_phones.push({
        number: s.wid,
        added_via: "ai_suggestion",
        added_at: new Date().toISOString(),
        suggestion_id: s.id,
      });
    });

    /* Mark the suggestion decided — direct Firestore write (no upConfig path
       because aiAgentSuggestions isn't merged into data). */
    try {
      await setDoc(doc(db, "aiAgentSuggestions", s.id), {
        status: "linked",
        decision: "linked",
        linked_customer_id: pickedCustomerId,
        reviewed_at: new Date().toISOString(),
      }, { merge: true });
      showToast("✓ تم الربط");
    } catch (err) {
      showToast("⛔ فشل الكتابة: " + (err.message || err));
    }
    setExpandLink(false);
    setPickedCustomerId("");
  };

  const setDecision = async (decision) => {
    const msg = decision === "ignored" ? "تتجاهل الاقتراح ده؟" : "تحظر الـ WID ده؟ لن يـ pop up مرة تانية.";
    if (!await ask("تأكيد", msg)) return;
    try {
      await setDoc(doc(db, "aiAgentSuggestions", s.id), {
        status: decision,
        decision,
        reviewed_at: new Date().toISOString(),
      }, { merge: true });
      showToast("✓ تم");
    } catch (err) {
      showToast("⛔ " + (err.message || err));
    }
  };

  const statusBadge = status === "linked"  ? { label: "✓ مربوط", bg: "#D1FAE5", color: "#065F46" }
                    : status === "ignored" ? { label: "✗ تجاهل", bg: "#E5E7EB", color: "#374151" }
                    : status === "blocked" ? { label: "🚫 محظور", bg: "#FEE2E2", color: "#991B1B" }
                    : { label: "⏳ قيد المراجعة", bg: "#FEF3C7", color: "#92400E" };

  return (
    <div style={{background:T.cardSolid, border:`1px solid ${T.brd}`, borderRadius:12, padding:14}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10, flexWrap:"wrap", marginBottom:10}}>
        <div style={{flex:1, minWidth:240}}>
          <div style={{display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:6}}>
            <span style={{fontSize:FS-2, padding:"2px 8px", borderRadius:8, fontWeight:700, background:"#E0E7FF", color:"#3730A3"}}>
              {labelForKind(s.kind)}
            </span>
            <span style={{fontSize:FS-2, padding:"2px 8px", borderRadius:8, fontWeight:700, background: statusBadge.bg, color: statusBadge.color}}>
              {statusBadge.label}
            </span>
            <span style={{fontSize:FS-3, color:T.textMut}}>· {ago}</span>
          </div>
          {s.kind === "lid_phone_mapping" ? (
            <div>
              <div style={{fontSize:FS-1, fontWeight:700, color:T.text, fontFamily:"'Fira Code',monospace", wordBreak:"break-all", marginBottom:4}}>
                {s.is_lid && <span title="WhatsApp privacy LID" style={{marginInlineEnd:6}}>🔒</span>}
                {s.wid}
              </div>
              {s.claimed_name  && <div style={{fontSize:FS-1, color:T.textSec}}>👤 الاسم المدّعى: <strong>{s.claimed_name}</strong></div>}
              {s.claimed_phone && <div style={{fontSize:FS-1, color:T.textSec}}>📞 الرقم المدّعى: <strong>{s.claimed_phone}</strong></div>}
              {s.reason && <div style={{fontSize:FS-2, color:T.textMut, marginTop:4, fontStyle:"italic"}}>"{s.reason}"</div>}
            </div>
          ) : (
            <pre style={{fontSize:FS-2, color:T.textSec, lineHeight:1.5, whiteSpace:"pre-wrap", wordBreak:"break-word"}}>
              {JSON.stringify(s, null, 2)}
            </pre>
          )}
        </div>

        {isPending && canEdit && (
          <div style={{display:"flex", flexDirection:"column", gap:6, flexShrink:0}}>
            {s.kind === "lid_phone_mapping" && (
              <Btn small onClick={()=>setExpandLink(!expandLink)} style={{background:"#10B98115", color:"#059669", border:"1px solid #10B98140", fontWeight:700}}>
                ✓ ربط بعميل
              </Btn>
            )}
            <Btn small ghost onClick={()=>setDecision("ignored")} title="إخفاء بدون أي action">✗ تجاهل</Btn>
            <Btn small onClick={()=>setDecision("blocked")} style={{background:"#FEE2E2", color:"#991B1B", border:"1px solid #FCA5A5", fontWeight:700}}>🚫 حظر</Btn>
          </div>
        )}
      </div>

      {expandLink && isPending && canEdit && s.kind === "lid_phone_mapping" && (
        <div style={{marginTop:10, paddingTop:10, borderTop:`1px dashed ${T.brd}`}}>
          <div style={{fontSize:FS-1, fontWeight:700, color:T.text, marginBottom:6}}>
            اختار العميل اللي هتربط الـ LID بحسابه:
          </div>
          <div style={{display:"flex", gap:6, marginBottom:8, flexWrap:"wrap", alignItems:"center"}}>
            <div style={{flex:"1 1 200px", minWidth:160}}>
              <Inp value={search} onChange={setSearch} placeholder="🔍 بحث: اسم/تليفون..."/>
            </div>
            {pickedCustomerId && (
              <Btn primary onClick={applyLink}>✓ تأكيد الربط</Btn>
            )}
          </div>
          <div style={{maxHeight:240, overflowY:"auto", border:`1px solid ${T.brd}`, borderRadius:8, padding:6, background:T.bg}}>
            {filteredCustomers.length === 0 ? (
              <div style={{fontSize:FS-2, color:T.textMut, padding:"10px 8px", textAlign:"center"}}>مفيش نتائج</div>
            ) : filteredCustomers.map(c => (
              <label key={c.id} style={{
                display:"flex", alignItems:"center", gap:8,
                padding:"6px 10px", borderRadius:6, cursor:"pointer",
                background: pickedCustomerId === c.id ? "#10B98115" : "transparent",
                border: `1px solid ${pickedCustomerId === c.id ? "#10B98140" : "transparent"}`,
                marginBottom:2,
              }}>
                <input type="radio" name={"link-target-"+s.id}
                  checked={pickedCustomerId === c.id}
                  onChange={()=>setPickedCustomerId(c.id)}
                  style={{width:16,height:16}}/>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontSize:FS-1, fontWeight:700, color:T.text}}>{c.name || "(بدون اسم)"}</div>
                  <div style={{fontSize:FS-3, color:T.textMut, fontFamily:"'Fira Code',monospace"}}>{c.phone || "—"}</div>
                </div>
              </label>
            ))}
            {customers.length > 30 && search.trim() === "" && (
              <div style={{fontSize:FS-3, color:T.textMut, padding:"8px", textAlign:"center"}}>
                ظاهر أول 30 — اكتب فلتر للبحث في الباقي ({customers.length} عميل)
              </div>
            )}
          </div>
        </div>
      )}

      {!isPending && s.linked_customer_id && (
        <div style={{marginTop:8, fontSize:FS-2, color:T.textMut, padding:"6px 10px", background:T.bg, borderRadius:6}}>
          مربوط بعميل: <code style={{fontFamily:"'Fira Code',monospace"}}>{s.linked_customer_id}</code>
          {s.reviewed_at && <span> · بتاريخ {new Date(s.reviewed_at).toLocaleString("ar-EG", {dateStyle:"short", timeStyle:"short"})}</span>}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   SANDBOX TAB (V19.72)
   Local simulation: matches user input against config.aiAgent.faqs
   phrasings + answer template, applies personality. NO Anthropic
   call — this is a UX preview to test FAQs before backend ships.
   ════════════════════════════════════════════════════════════ */
function SandboxTab({ agent, data, isMob }){
  const customers = data?.customers || [];
  const [persona, setPersona] = useState("known");/* known | stranger */
  const [pickedCustomerId, setPickedCustomerId] = useState(customers[0]?.id || "");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [trace, setTrace] = useState([]);
  const scrollRef = useRef(null);

  const pickedCustomer = customers.find(c => c.id === pickedCustomerId);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  /* Local mock — match input to FAQs.phrasings (substring match), else canned response */
  const mockAgentReply = (userText) => {
    const t0 = performance.now();
    const traceSteps = [];

    /* Step 1: auth/persona */
    traceSteps.push({ step:"Authentication", detail: persona === "known" && pickedCustomer ? `Tier 1 — ${pickedCustomer.name}` : "Tier 0 — Stranger" });

    /* Step 2: stage */
    traceSteps.push({ step:"Stage classification", detail: persona === "known" ? "Customer (mock)" : "Stranger" });

    /* Step 3: FAQ lookup */
    const faqs = agent.faqs || [];
    const lower = userText.toLowerCase();
    let matchedFaq = null;
    for (const f of faqs) {
      const allPhrases = [f.title, ...(f.phrasings||[])].filter(Boolean).map(p=>p.toLowerCase());
      if (allPhrases.some(p => lower.includes(p) || p.includes(lower))) {
        matchedFaq = f; break;
      }
    }
    traceSteps.push({ step:"FAQ lookup", detail: matchedFaq ? `Match: "${matchedFaq.title}"` : "No FAQ match" });

    /* Step 4: response build */
    let reply;
    if (matchedFaq) {
      let txt = matchedFaq.answer || "";
      if (persona === "known" && pickedCustomer) {
        txt = txt.replace(/\{customer_name\}/g, pickedCustomer.name || "حضرتك");
        txt = txt.replace(/\{tier\}/g, "Gold");/* mock */
      } else {
        txt = txt.replace(/\{customer_name\}/g, "حضرتك").replace(/\{tier\}/g, "—");
      }
      txt = txt.replace(/\{today\}/g, new Date().toLocaleDateString("ar-EG"));
      reply = txt;
    } else {
      const greeting = (agent.personality?.greetings?.[0]) || "أهلاً بحضرتك";
      const closing  = (agent.personality?.closings?.[0])  || "في خدمتك";
      if (persona === "known" && pickedCustomer) {
        reply = `${greeting} أ/${pickedCustomer.name}.\n\nده الـ sandbox المحلي — مفيش FAQ مطابق للسؤال ده. لما الـ backend الفعلي يطلع (Phase D) هيـuse Claude Haiku يـformulate رد ذكي.\n\n${closing}.`;
      } else {
        reply = `${greeting} 🌟\n\nده الـ sandbox المحلي. مفيش FAQ بـيـlookup الكلام ده. الـ backend الفعلي (Phase D) هيـcall Claude للرد على أي سؤال.\n\n${closing}.`;
      }
    }

    /* Step 5: latency */
    const latency = (performance.now() - t0).toFixed(1);
    traceSteps.push({ step:"Response built", detail:`${reply.length} char · ${latency}ms (local sim, no API)` });

    return { reply, trace: traceSteps };
  };

  const send = () => {
    const txt = input.trim(); if (!txt) return;
    setMessages(m => [...m, { from:"user", text: txt, ts: Date.now() }]);
    setInput("");
    setTimeout(() => {
      const { reply, trace: t } = mockAgentReply(txt);
      setMessages(m => [...m, { from:"agent", text: reply, ts: Date.now() }]);
      setTrace(t);
    }, 250);
  };

  const sendScenario = (scenarioText) => {
    setInput(scenarioText);
    setTimeout(() => {
      setInput("");
      setMessages(m => [...m, { from:"user", text: scenarioText, ts: Date.now() }]);
      setTimeout(() => {
        const { reply, trace: t } = mockAgentReply(scenarioText);
        setMessages(m => [...m, { from:"agent", text: reply, ts: Date.now() }]);
        setTrace(t);
      }, 250);
    }, 50);
  };

  const reset = () => { setMessages([]); setTrace([]); setInput(""); };

  const cardStyle = { background:T.cardSolid, border:`1px solid ${T.brd}`, borderRadius:14, padding: isMob?12:16, marginBottom:14 };

  return (
    <div>
      {/* Notice */}
      <div style={{
        padding:"10px 14px", marginBottom:14, borderRadius:10,
        background:"#FEF3C7", border:"1px solid #FCD34D",
        fontSize:FS-1, color:"#78350F", lineHeight:1.5,
      }}>
        ⚠️ <strong>محاكاة محلية — مفيش رسائل واتساب فعلية.</strong> الـ sandbox بـ يـmatch السؤال ضد الـ FAQs المضافة فقط (ما بـ يـcall Claude). هدفه: تختبر صياغات الـ FAQs قبل ما الـ backend الحقيقي يبني.
      </div>

      {/* Setup */}
      <div style={cardStyle}>
        <div style={{display:"grid", gridTemplateColumns: isMob?"1fr":"1fr 1fr 1fr auto", gap:10, alignItems:"end"}}>
          <div>
            <label style={{fontSize:FS-1, fontWeight:700, color:T.textSec, marginBottom:6, display:"block"}}>تظاهر إنك:</label>
            <Sel value={persona} onChange={setPersona}>
              <option value="known">عميل مسجّل</option>
              <option value="stranger">رقم جديد (مجهول)</option>
            </Sel>
          </div>
          {persona === "known" && (
            <div>
              <label style={{fontSize:FS-1, fontWeight:700, color:T.textSec, marginBottom:6, display:"block"}}>اختر العميل:</label>
              <Sel value={pickedCustomerId} onChange={setPickedCustomerId}>
                {customers.length === 0 && <option value="">(لا يوجد عملاء)</option>}
                {customers.slice(0,100).map(c => <option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ""}</option>)}
              </Sel>
            </div>
          )}
          <div style={{gridColumn: isMob?"1":(persona==="known"?"3":"2 / span 2")}}>
            <label style={{fontSize:FS-1, fontWeight:700, color:T.textSec, marginBottom:6, display:"block"}}>الـ FAQs المتاحة:</label>
            <div style={{padding:"6px 10px", background:T.bg, borderRadius:8, fontSize:FS-1, fontWeight:700, color:T.text}}>
              {(agent.faqs||[]).length} سؤال
            </div>
          </div>
          <Btn ghost onClick={reset}>🔄 مسح</Btn>
        </div>
      </div>

      {/* Chat */}
      <div style={{...cardStyle, padding:0}}>
        <div ref={scrollRef} style={{
          height: isMob?260:380, overflowY:"auto", padding:14,
          background:T.bg, borderTopLeftRadius:14, borderTopRightRadius:14,
        }}>
          {messages.length === 0 ? (
            <div style={{textAlign:"center", padding:"40px 20px", color:T.textMut}}>
              <div style={{fontSize:48, marginBottom:10}}>🧪</div>
              <div style={{fontSize:FS, fontWeight:700, marginBottom:14}}>اكتب رسالة لتجربة الـ Agent</div>
              <div style={{fontSize:FS-1, marginBottom:18}}>أو اختر سيناريو جاهز:</div>
              <div style={{display:"flex", gap:6, flexWrap:"wrap", justifyContent:"center", maxWidth:560, margin:"0 auto"}}>
                {[
                  "كم سعر موديل WINTER PRO؟",
                  "حسابي عامل إيه؟",
                  "محتاج 200 قطعة",
                  "الشحن بياخد كم يوم؟",
                  "عاوز أتكلم مع شخص",
                  "ما هي طرق الدفع؟",
                ].map(s => (
                  <Btn key={s} ghost small onClick={()=>sendScenario(s)}>{s}</Btn>
                ))}
              </div>
            </div>
          ) : messages.map((m, i) => (
            <div key={i} style={{
              display:"flex",
              justifyContent: m.from === "user" ? "flex-end" : "flex-start",
              marginBottom:10,
            }}>
              <div style={{
                maxWidth:"75%", padding:"8px 12px", borderRadius:14,
                background: m.from === "user" ? T.accent : T.cardSolid,
                color:      m.from === "user" ? "#fff"   : T.text,
                border:     m.from === "user" ? "none"   : `1px solid ${T.brd}`,
                fontSize:FS-1, lineHeight:1.5, whiteSpace:"pre-wrap",
              }}>
                {m.text}
              </div>
            </div>
          ))}
        </div>
        <div style={{display:"flex", gap:8, padding:10, borderTop:`1px solid ${T.brd}`}}>
          <input
            value={input}
            onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>e.key==="Enter" && send()}
            placeholder="اكتب رسالة..."
            style={{
              flex:1, padding:"8px 12px", borderRadius:10,
              border:`1px solid ${T.brd}`, background:T.cardSolid, color:T.text,
              fontSize:FS, fontFamily:"inherit", direction:"rtl", outline:"none",
            }}
          />
          <Btn primary onClick={send}>إرسال ▶</Btn>
        </div>
      </div>

      {/* Trace */}
      {trace.length > 0 && (
        <div style={cardStyle}>
          <h3 style={{margin:"0 0 10px",fontSize:FS+1,fontWeight:800,color:T.text}}>🔍 Trace (آخر رد)</h3>
          {trace.map((s, i) => (
            <div key={i} style={{
              display:"flex", justifyContent:"space-between", alignItems:"center",
              padding:"6px 0", borderBottom: i<trace.length-1 ? `1px solid ${T.brd}` : "none",
              fontSize:FS-1,
            }}>
              <span style={{display:"flex", alignItems:"center", gap:8}}>
                <span style={{width:22, height:22, borderRadius:"50%", background:T.accent+"15", color:T.accent, display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:FS-2, fontWeight:800}}>
                  {i+1}
                </span>
                <span style={{fontWeight:700, color:T.text}}>{s.step}</span>
              </span>
              <span style={{color:T.textSec, fontSize:FS-2}}>{s.detail}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   TOOLS TAB (V19.72) — read/notify/generate tool registry
   + tier discounts + escalation routing
   ════════════════════════════════════════════════════════════ */
function ToolsTab({ agent, updateAgent, canEdit, isMob }){
  const tools = agent.tools || INIT_CONFIG.aiAgent.tools;
  const tiers = agent.tierDiscounts || INIT_CONFIG.aiAgent.tierDiscounts;
  const esc   = agent.escalation || INIT_CONFIG.aiAgent.escalation;

  const setTool = (toolKey, field, val) => updateAgent(a => {
    if (!a.tools) a.tools = JSON.parse(JSON.stringify(INIT_CONFIG.aiAgent.tools));
    if (!a.tools[toolKey]) a.tools[toolKey] = {};
    a.tools[toolKey][field] = val;
  });

  const setTier = (key, val) => updateAgent(a => {
    if (!a.tierDiscounts) a.tierDiscounts = { ...INIT_CONFIG.aiAgent.tierDiscounts };
    a.tierDiscounts[key] = parseFloat(val) || 0;
  });

  const setEsc = (key, val) => updateAgent(a => {
    if (!a.escalation) a.escalation = JSON.parse(JSON.stringify(INIT_CONFIG.aiAgent.escalation));
    a.escalation[key] = val;
  });

  const setTrigger = (key, val) => updateAgent(a => {
    if (!a.escalation) a.escalation = JSON.parse(JSON.stringify(INIT_CONFIG.aiAgent.escalation));
    if (!a.escalation.autoTriggers) a.escalation.autoTriggers = { ...INIT_CONFIG.aiAgent.escalation.autoTriggers };
    a.escalation.autoTriggers[key] = val;
  });

  const cardStyle = { background:T.cardSolid, border:`1px solid ${T.brd}`, borderRadius:14, padding: isMob?14:18, marginBottom:14 };

  /* V19.77.1: deployed === backend tool actually wired in clark-ai-agent.
     Items without `deployed: true` are placeholders for upcoming tools — they
     show a "قريباً" badge so the admin can see what's planned. */
  const toolGroups = [
    {
      title: "📖 READ-ONLY (يقرأ فقط من Firestore)",
      color: "#0EA5E9",
      items: [
        { key:"get_customer_info",     label:"معلومات العميل",          desc:"اسم، عنوان، tier، الخصم — للسائل نفسه أو بحث محدود", deployed: true },
        { key:"search_products",       label:"بحث في المنتجات",         desc:"الموديلات، الأسعار، المخزون", deployed: true, extras:[
          { field:"includePricing", label:"يعرض الأسعار", type:"bool" },
          { field:"includeStock",   label:"يعرض المخزون", type:"bool" },
          { field:"includeImages",  label:"يعرض الصور",   type:"bool" },
          { field:"maxResults",     label:"حد أقصى للنتائج", type:"number", suffix:"موديل" },
        ]},
        { key:"get_product_details",   label:"تفاصيل موديل",            desc:"كل بيانات موديل بـ كوده (catalog lookup)", deployed: true },
        { key:"get_customer_balance",  label:"رصيد العميل",             desc:"نفس formula كشف الحساب — للسائل فقط (PII)", deployed: true },
        { key:"get_customer_orders",   label:"طلبات العميل",            desc:"آخر 30 طلب نشاطاً + حالات — للسائل فقط", deployed: true },
        { key:"get_order_status",      label:"حالة طلب",                desc:"تفاصيل order_id أو modelNo (السائل فقط)", deployed: true },
        { key:"get_faq_answer",        label:"الأسئلة المتكررة",        desc:"يـmatch السؤال مع الـ FAQs", deployed: true },
        { key:"get_company_info",      label:"معلومات المصنع",          desc:"المواسم، الأقمشة، المقاسات، الورش", deployed: true },
      ],
    },
    {
      title: "📄 GENERATE (يولّد روابط موقّعة)",
      color: "#8B5CF6",
      items: [
        { key:"generate_portal_link",   label:"لينك الـ portal",         desc:"رابط HMAC-signed صالح 90 يوم — السائل فقط", deployed: true },
        { key:"generate_statement_pdf", label:"كشف حساب PDF",            desc:"بيـ delegate لـ portal link مع focus=statement", deployed: true },
      ],
    },
    {
      title: "🔔 NOTIFY (يبعت رسالة، ما يـكتبش في DB)",
      color: "#F59E0B",
      items: [
        { key:"notify_sales_team",          label:"إشعار فريق المبيعات",     desc:"⭐ بدلاً من create order. الفريق بـ يدخل الطلب يدوياً", deployed: true, extras:[
          { field:"maxValueBeforeManual", label:"الحد الأقصى قبل المراجعة اليدوية", type:"number", suffix:"ج" },
        ]},
        { key:"notify_admin_phone_request", label:"طلب ربط رقم/LID",         desc:"يبعت للأدمن LID + اسم مدّعى — يـ surface في aiAgentSuggestions", deployed: true },
        { key:"escalate_to_human",          label:"تحويل لبشري",            desc:"بـ context كامل + آخر 5 رسائل", deployed: true },
        { key:"send_otp",                   label:"إرسال OTP",               desc:"6-digit code في Redis، 5 دقايق default، 3 محاولات أقصى", deployed: true, extras:[
          { field:"ttlMin",      label:"مدة الصلاحية",    type:"number", suffix:"دقيقة" },
        ]},
        { key:"verify_otp",                 label:"التحقق من OTP",           desc:"بـ يـ verify الكود — one-time use، يـ delete بعد النجاح", deployed: true },
      ],
    },
  ];

  return (
    <div>
      <div style={{
        padding:"10px 14px", marginBottom:14, borderRadius:10,
        background:"#0EA5E908", border:"1px solid #0EA5E930",
        fontSize:FS-1, color:"#0369A1", lineHeight:1.5,
      }}>
        💡 <strong>كل الأدوات READ-ONLY أو NOTIFY-ONLY.</strong> الـ Agent ما يقدرش يكتب في CLARK collections (customers, orders, ...). الكتابة مسموحة بس على `aiAgent*` collections (logs الـ agent المعزولة). ده security boundary بـ يتعمل enforce في الـ backend's Firestore wrapper.
      </div>

      {/* Tool groups */}
      {toolGroups.map(group => (
        <div key={group.title} style={cardStyle}>
          <h3 style={{margin:"0 0 14px", fontSize:FS+1, fontWeight:800, color:group.color}}>{group.title}</h3>
          <div style={{display:"grid", gap:10}}>
            {group.items.map(item => {
              const t = tools[item.key] || {};
              return (
                <div key={item.key} style={{
                  padding:12, borderRadius:10,
                  background: t.enabled ? `${group.color}06` : T.bg,
                  border: `1px solid ${t.enabled ? group.color+"30" : T.brd}`,
                }}>
                  <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, flexWrap:"wrap"}}>
                    <label style={{display:"flex", alignItems:"center", gap:10, cursor: canEdit?"pointer":"default", flex:1, minWidth:240}}>
                      <input type="checkbox" checked={!!t.enabled}
                        onChange={e=>canEdit && setTool(item.key, "enabled", e.target.checked)}
                        style={{width:18,height:18}}/>
                      <div>
                        <div style={{fontSize:FS, fontWeight:800, color:T.text, display:"flex", alignItems:"center", gap:8, flexWrap:"wrap"}}>
                          <code style={{fontSize:FS-1, padding:"1px 6px", borderRadius:5, background:T.bg, border:`1px solid ${T.brd}`, fontFamily:"'Fira Code',monospace"}}>
                            {item.key}
                          </code>
                          <span>{item.label}</span>
                          {/* V19.77.1: deployment status badge */}
                          <span style={{
                            fontSize:FS-3, padding:"2px 8px", borderRadius:8, fontWeight:700,
                            background: item.deployed ? "#D1FAE5" : "#E0E7FF",
                            color: item.deployed ? "#065F46" : "#3730A3",
                          }}>
                            {item.deployed ? "✓ مفعّل" : "🚧 قريباً"}
                          </span>
                        </div>
                        <div style={{fontSize:FS-2, color:T.textMut, marginTop:2}}>{item.desc}</div>
                      </div>
                    </label>
                  </div>
                  {item.extras && t.enabled && (
                    <div style={{marginTop:10, paddingTop:10, borderTop:`1px dashed ${T.brd}`, display:"grid", gridTemplateColumns: isMob?"1fr":"repeat(2, 1fr)", gap:8}}>
                      {item.extras.map(ex => (
                        <div key={ex.field} style={{display:"flex", alignItems:"center", gap:8}}>
                          {ex.type === "bool" ? (
                            <label style={{display:"flex", alignItems:"center", gap:6, cursor: canEdit?"pointer":"default", fontSize:FS-1, color:T.textSec}}>
                              <input type="checkbox" checked={!!t[ex.field]}
                                onChange={e=>canEdit && setTool(item.key, ex.field, e.target.checked)}
                                style={{width:16,height:16}}/>
                              {ex.label}
                            </label>
                          ) : (
                            <>
                              <span style={{fontSize:FS-1, color:T.textSec, flex:"1 1 auto"}}>{ex.label}</span>
                              <div style={{width:80}}>
                                <Inp type="number" value={t[ex.field] ?? 0} onChange={v=>canEdit && setTool(item.key, ex.field, parseFloat(v)||0)}/>
                              </div>
                              {ex.suffix && <span style={{fontSize:FS-2, color:T.textMut}}>{ex.suffix}</span>}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Tier discounts */}
      <div style={cardStyle}>
        <h3 style={{margin:"0 0 14px", fontSize:FS+1, fontWeight:800, color:T.text}}>🏆 خصومات الـ Tiers</h3>
        <div style={{fontSize:FS-2, color:T.textMut, marginBottom:14}}>
          الـ Agent يستخدم النسب دي تلقائياً عند بناء عرض السعر. الـ Tier بـ يتـcalculate من `customers.total_purchases_last_12_months`.
        </div>
        <div style={{display:"grid", gridTemplateColumns: isMob?"1fr 1fr":"repeat(4, 1fr)", gap:10}}>
          {[
            { key:"Bronze",   label:"🥉 Bronze",   desc:"<50K ج" },
            { key:"Silver",   label:"🥈 Silver",   desc:"50-200K" },
            { key:"Gold",     label:"🥇 Gold",     desc:"200-500K" },
            { key:"Platinum", label:"💎 Platinum", desc:">500K" },
          ].map(t => (
            <div key={t.key} style={{padding:12, borderRadius:10, background:T.bg, border:`1px solid ${T.brd}`}}>
              <div style={{fontSize:FS, fontWeight:800, color:T.text}}>{t.label}</div>
              <div style={{fontSize:FS-2, color:T.textMut, marginBottom:8}}>{t.desc}</div>
              <div style={{display:"flex", alignItems:"center", gap:6}}>
                <div style={{flex:1}}>
                  <Inp type="number" value={tiers[t.key] ?? 0} onChange={v=>canEdit && setTier(t.key, v)}/>
                </div>
                <span style={{fontSize:FS, fontWeight:800, color:T.textSec}}>%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Escalation routing */}
      <div style={cardStyle}>
        <h3 style={{margin:"0 0 14px", fontSize:FS+1, fontWeight:800, color:T.text}}>🆘 إعدادات التحويل لبشري</h3>
        <div style={{display:"grid", gridTemplateColumns: isMob?"1fr":"1fr 1fr", gap:12, marginBottom:14}}>
          <div>
            <label style={{fontSize:FS-1, fontWeight:700, color:T.textSec, marginBottom:6, display:"block"}}>📞 رقم الدعم البشري</label>
            <Inp value={esc.supportPhone||""} onChange={v=>canEdit && setEsc("supportPhone", v)} placeholder="مثال: 201100201057"/>
          </div>
          <div>
            <label style={{fontSize:FS-1, fontWeight:700, color:T.textSec, marginBottom:6, display:"block"}}>📞 رقم/جروب فريق المبيعات</label>
            <Inp value={esc.salesTeamPhone||""} onChange={v=>canEdit && setEsc("salesTeamPhone", v)} placeholder="مثال: 201XXXXXXXXX"/>
          </div>
        </div>
        <div style={{marginBottom:14}}>
          <label style={{fontSize:FS-1, fontWeight:700, color:T.textSec, marginBottom:6, display:"block"}}>📝 قالب رسالة التحويل</label>
          <textarea
            value={esc.template||""}
            onChange={e=>canEdit && setEsc("template", e.target.value)}
            readOnly={!canEdit}
            rows={5}
            style={{
              width:"100%", padding:10, borderRadius:8,
              border:`1px solid ${T.brd}`, background:T.cardSolid, color:T.text,
              fontFamily:"inherit", fontSize:FS, lineHeight:1.5,
              resize:"vertical", boxSizing:"border-box", outline:"none", direction:"rtl",
            }}
          />
          <div style={{fontSize:FS-2, color:T.textMut, marginTop:4}}>
            متغيرات: <code style={{background:T.bg,padding:"2px 6px",borderRadius:4}}>{"{customerName}"}</code>{" "}
            <code style={{background:T.bg,padding:"2px 6px",borderRadius:4}}>{"{phone}"}</code>{" "}
            <code style={{background:T.bg,padding:"2px 6px",borderRadius:4}}>{"{tier}"}</code>{" "}
            <code style={{background:T.bg,padding:"2px 6px",borderRadius:4}}>{"{stage}"}</code>{" "}
            <code style={{background:T.bg,padding:"2px 6px",borderRadius:4}}>{"{reason}"}</code>
          </div>
        </div>
        <div>
          <label style={{fontSize:FS-1, fontWeight:700, color:T.textSec, marginBottom:8, display:"block"}}>⚡ تحويل تلقائي عند:</label>
          <div style={{display:"grid", gridTemplateColumns: isMob?"1fr":"1fr 1fr", gap:8}}>
            {[
              { key:"qualityComplaint",  label:"🛡 شكوى جودة" },
              { key:"orderAbove100k",    label:"💰 طلب أكبر من 100K ج" },
              { key:"angryCustomer",     label:"😡 عميل عصبي (sentiment)" },
              { key:"outOfScope",        label:"🚫 خارج النطاق" },
              { key:"platinumCustomer",  label:"💎 عميل Platinum (دايماً)" },
            ].map(tr => (
              <label key={tr.key} style={{
                display:"flex", alignItems:"center", gap:8, padding:"8px 12px", borderRadius:8,
                background: esc.autoTriggers?.[tr.key] ? "#10B98108" : T.bg,
                border: `1px solid ${esc.autoTriggers?.[tr.key] ? "#10B98130" : T.brd}`,
                cursor: canEdit?"pointer":"default",
              }}>
                <input type="checkbox" checked={!!esc.autoTriggers?.[tr.key]}
                  onChange={e=>canEdit && setTrigger(tr.key, e.target.checked)}
                  style={{width:18,height:18}}/>
                <span style={{fontSize:FS, fontWeight:600, color:T.text}}>{tr.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   FUNNEL TAB (V19.73 — Phase C)
   Customer lifecycle pipeline visualization. Reads `data.customers`
   directly to compute stage + tier distribution. Pending stage
   transitions come from `data.aiAgentSuggestions` (empty until
   Phase D backend ships — clear empty state).
   ════════════════════════════════════════════════════════════ */
function FunnelTab({ agent, data, updateAgent, canEdit, isMob }){
  const customers = data?.customers || [];
  const suggestions = data?.aiAgentSuggestions || [];
  const tierThresholds = agent.tierThresholds || INIT_CONFIG.aiAgent.tierThresholds;
  const autoApprove = agent.stageTransitionAutoApprove || INIT_CONFIG.aiAgent.stageTransitionAutoApprove;

  const stageDist = useMemo(() => {
    const dist = Object.fromEntries(STAGES.map(s => [s.key, 0]));
    let unset = 0;
    for (const c of customers) {
      const s = c.stage;
      if (s && dist[s] !== undefined) dist[s]++;
      else unset++;
    }
    return { ...dist, _unset: unset };
  }, [customers]);

  const tierDist = useMemo(() => {
    const dist = Object.fromEntries(TIERS.map(t => [t.key, 0]));
    let unset = 0;
    for (const c of customers) {
      const t = c.tier;
      if (t && dist[t] !== undefined) dist[t]++;
      else unset++;
    }
    return { ...dist, _unset: unset };
  }, [customers]);

  const movements = useMemo(() => {
    const sevenAgo = Date.now() - 7*24*3600*1000;
    const m = {};
    for (const c of customers) {
      const ts = c.stage_changed_at ? new Date(c.stage_changed_at).getTime() : null;
      if (!ts || ts < sevenAgo) continue;
      const hist = c.stage_history;
      if (!Array.isArray(hist) || hist.length < 2) continue;
      const last = hist[hist.length-1];
      const prev = hist[hist.length-2];
      if (!last?.to || !prev?.to) continue;
      const k = `${prev.to}→${last.to}`;
      m[k] = (m[k]||0) + 1;
    }
    return Object.entries(m).sort((a,b) => b[1]-a[1]);
  }, [customers]);

  const approachingTierUp = useMemo(() => {
    const out = [];
    const sortedTiers = TIERS.slice().sort((a,b) => (tierThresholds[a.key]||0) - (tierThresholds[b.key]||0));
    for (const c of customers) {
      const annual = c.ai_profile?.total_purchases_last_12_months || 0;
      if (!annual) continue;
      const currentTier = c.tier;
      const idx = sortedTiers.findIndex(t => t.key === currentTier);
      if (idx === -1 || idx === sortedTiers.length-1) continue;
      const nextTier = sortedTiers[idx+1];
      const threshold = tierThresholds[nextTier.key] || 0;
      if (annual >= threshold * 0.9 && annual < threshold) {
        out.push({ ...c, _annual: annual, _nextTier: nextTier, _threshold: threshold, _toGo: threshold - annual });
      }
    }
    return out.sort((a,b) => a._toGo - b._toGo).slice(0, 10);
  }, [customers, tierThresholds]);

  const pendingTransitions = useMemo(() =>
    suggestions.filter(s => s.type === "stage_transition" && s.status === "pending").slice(0, 20),
  [suggestions]);

  const setAutoApprove = (key, val) => updateAgent(a => {
    if (!a.stageTransitionAutoApprove) a.stageTransitionAutoApprove = { ...INIT_CONFIG.aiAgent.stageTransitionAutoApprove };
    a.stageTransitionAutoApprove[key] = val;
  });

  const total = customers.length;
  const totalKnown = total - stageDist._unset;
  const cardStyle = { background:T.cardSolid, border:`1px solid ${T.brd}`, borderRadius:14, padding: isMob?14:18, marginBottom:14 };

  return (
    <div>
      <div style={{...cardStyle, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10}}>
        <div>
          <h3 style={{margin:0, fontSize:FS+2, fontWeight:800, color:T.text}}>🎯 Customer Lifecycle Funnel</h3>
          <div style={{fontSize:FS-2, color:T.textMut, marginTop:4}}>
            إجمالي عملاء النظام: <strong>{total}</strong>
            {stageDist._unset > 0 && <span style={{color:T.warn, marginInlineStart:8}}>· {stageDist._unset} لم يتم تصنيفهم بعد</span>}
          </div>
        </div>
        {stageDist._unset > 0 && (
          <span style={{fontSize:FS-2, color:T.textSec, padding:"6px 12px", borderRadius:8, background:"#FEF3C7", border:"1px solid #FCD34D"}}>
            ⚠️ Phase D backend هيـclassify العملاء تلقائياً
          </span>
        )}
      </div>

      <div style={cardStyle}>
        <h3 style={{margin:"0 0 14px", fontSize:FS+1, fontWeight:800, color:T.text}}>📊 توزيع المراحل</h3>
        {totalKnown === 0 ? (
          <EmptyHint icon="📊" msg="لسه مفيش عملاء مصنّفين بـ stage. الـ backend Phase D هيـبدأ يـclassify."/>
        ) : (
          <div style={{display:"grid", gap:8}}>
            {STAGES.map(s => {
              const count = stageDist[s.key];
              const pct = totalKnown ? (count/totalKnown)*100 : 0;
              return <FunnelBar key={s.key} stage={s} count={count} pct={pct}/>;
            })}
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <h3 style={{margin:"0 0 14px", fontSize:FS+1, fontWeight:800, color:T.text}}>📈 الحركة آخر 7 أيام</h3>
        {movements.length === 0 ? (
          <EmptyHint icon="📈" msg="مفيش انتقالات بين stages آخر أسبوع. (الـ backend هيـrecord الانتقالات لما يبدأ.)"/>
        ) : (
          <div style={{display:"grid", gap:6}}>
            {movements.map(([k, n]) => (
              <div key={k} style={{display:"flex", justifyContent:"space-between", padding:"8px 12px", borderRadius:8, background:T.bg, border:`1px solid ${T.brd}`}}>
                <span style={{fontSize:FS, fontWeight:600, color:T.text}}>{k}</span>
                <span style={{fontSize:FS, fontWeight:800, color:T.accent}}>{n} عميل</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <h3 style={{margin:"0 0 14px", fontSize:FS+1, fontWeight:800, color:T.text}}>
          🔔 تحويلات المراحل المعلّقة <span style={{fontSize:FS-1, fontWeight:600, color:T.textMut}}>({pendingTransitions.length})</span>
        </h3>
        {pendingTransitions.length === 0 ? (
          <EmptyHint icon="🔔" msg="مفيش suggestions معلّقة. لما الـ Agent backend (Phase D) يلاحظ انتقال محتمل، هيـكتب suggestion هنا للمراجعة."/>
        ) : (
          <div style={{display:"grid", gap:6}}>
            {pendingTransitions.map(s => (
              <div key={s.id} style={{padding:10, borderRadius:8, background:T.bg, border:`1px solid ${T.brd}`}}>
                <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:6}}>
                  <span style={{fontSize:FS, fontWeight:700, color:T.text}}>
                    {s.customer_name || s.customer_id}: {s.current_value} → {s.suggested_value}
                  </span>
                  <div style={{display:"flex", gap:4}}>
                    <Btn primary small>✅</Btn>
                    <Btn danger small>❌</Btn>
                  </div>
                </div>
                {s.evidence && <div style={{fontSize:FS-2, color:T.textMut, marginTop:4}}>الدليل: {s.evidence}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <h3 style={{margin:"0 0 14px", fontSize:FS+1, fontWeight:800, color:T.text}}>⚙️ الموافقة التلقائية على الانتقالات</h3>
        <div style={{fontSize:FS-2, color:T.textMut, marginBottom:14, lineHeight:1.5}}>
          الانتقالات الـ low-risk ممكن تتـapprove تلقائياً. الانتقالات الحساسة (Decision → Customer = طلب فعلي مؤكد) محتاجة مراجعة بشرية.
        </div>
        <div style={{display:"grid", gridTemplateColumns: isMob?"1fr":"1fr 1fr", gap:8}}>
          {[
            { key:"strangerToAwareness", label:"غريب → تعرّف",         risk:"low" },
            { key:"awarenessToInterest", label:"تعرّف → اهتمام",       risk:"low" },
            { key:"interestToDecision",  label:"اهتمام → قرار شراء",   risk:"high" },
            { key:"decisionToCustomer",  label:"قرار شراء → عميل",     risk:"high" },
            { key:"customerToRepeat",    label:"عميل → عميل متكرر",    risk:"low" },
            { key:"customerToDormant",   label:"عميل → خامل",          risk:"low" },
          ].map(t => (
            <label key={t.key} style={{
              display:"flex", alignItems:"center", gap:8, padding:"8px 12px", borderRadius:8,
              background: autoApprove[t.key] ? "#10B98108" : T.bg,
              border: `1px solid ${autoApprove[t.key] ? "#10B98130" : T.brd}`,
              cursor: canEdit?"pointer":"default",
            }}>
              <input type="checkbox" checked={!!autoApprove[t.key]}
                onChange={e=>canEdit && setAutoApprove(t.key, e.target.checked)}
                style={{width:18,height:18}}/>
              <span style={{fontSize:FS, fontWeight:600, color:T.text, flex:1}}>{t.label}</span>
              {t.risk === "high" && <span style={{fontSize:FS-3, padding:"1px 6px", borderRadius:5, background:"#FEE2E2", color:"#991B1B", fontWeight:700}}>عالي المخاطر</span>}
            </label>
          ))}
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={{margin:"0 0 14px", fontSize:FS+1, fontWeight:800, color:T.text}}>💎 توزيع الـ Tiers</h3>
        <div style={{display:"grid", gridTemplateColumns: isMob?"1fr 1fr":"repeat(4, 1fr)", gap:10}}>
          {TIERS.map(t => (
            <div key={t.key} style={{
              padding:14, borderRadius:12, background:`${t.color}10`, border:`1px solid ${t.color}30`, textAlign:"center",
            }}>
              <div style={{fontSize:FS+8, marginBottom:4}}>{t.icon}</div>
              <div style={{fontSize:FS, fontWeight:800, color:t.color}}>{t.label}</div>
              <div style={{fontSize:FS+10, fontWeight:800, color:T.text, marginTop:4, lineHeight:1.1}}>{tierDist[t.key]}</div>
              <div style={{fontSize:FS-3, color:T.textMut, marginTop:4}}>
                {tierThresholds[t.key]>=1000 ? `${(tierThresholds[t.key]/1000).toFixed(0)}K+ ج` : `${tierThresholds[t.key]} ج+`}
              </div>
            </div>
          ))}
        </div>
        {tierDist._unset > 0 && (
          <div style={{marginTop:10, padding:"8px 12px", borderRadius:8, background:T.bg, border:`1px dashed ${T.brd}`, fontSize:FS-1, color:T.textSec, textAlign:"center"}}>
            {tierDist._unset} عميل بدون tier محدد
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <h3 style={{margin:"0 0 14px", fontSize:FS+1, fontWeight:800, color:T.text}}>
          ⬆️ عملاء قريبين من ترقية الـ Tier <span style={{fontSize:FS-1, fontWeight:600, color:T.textMut}}>({approachingTierUp.length})</span>
        </h3>
        {approachingTierUp.length === 0 ? (
          <EmptyHint icon="⬆️" msg="مفيش عملاء قريبين من ترقية. (الـ Agent بـ يـحسب من ai_profile.total_purchases_last_12_months — Phase D هيـlinkـه بالـ orders فعلياً.)"/>
        ) : (
          <div style={{display:"grid", gap:6}}>
            {approachingTierUp.map(c => (
              <div key={c.id} style={{display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, padding:"8px 12px", borderRadius:8, background:T.bg, border:`1px solid ${T.brd}`, flexWrap:"wrap"}}>
                <div style={{flex:1, minWidth:200}}>
                  <span style={{fontSize:FS, fontWeight:700, color:T.text}}>{c.name}</span>
                  <span style={{fontSize:FS-2, color:T.textMut, marginInlineStart:8}}>· {c.tier} حالياً</span>
                </div>
                <div style={{textAlign:"left"}}>
                  <div style={{fontSize:FS, fontWeight:800, color:T.text}}>{c._annual.toLocaleString("ar-EG")} / {c._threshold.toLocaleString("ar-EG")} ج</div>
                  <div style={{fontSize:FS-2, color:c._nextTier.color, fontWeight:700}}>
                    باقي {c._toGo.toLocaleString("ar-EG")} ج → {c._nextTier.icon} {c._nextTier.label}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FunnelBar({ stage, count, pct }){
  return (
    <div style={{display:"flex", alignItems:"center", gap:10}}>
      <div style={{minWidth:100, fontSize:FS, fontWeight:700, color:T.text, display:"flex", alignItems:"center", gap:6}}>
        <span style={{fontSize:FS+2}}>{stage.icon}</span>
        <span>{stage.label}</span>
      </div>
      <div style={{flex:1, height:24, background:T.bg, borderRadius:6, position:"relative", overflow:"hidden"}}>
        <div style={{
          height:"100%", width:`${Math.max(pct, 0.5)}%`,
          background:`linear-gradient(90deg, ${stage.color}, ${stage.color}CC)`,
          borderRadius:6, transition:"width 0.3s",
        }}/>
      </div>
      <div style={{minWidth:90, textAlign:"left", fontSize:FS-1, fontWeight:700, color:T.text, fontVariantNumeric:"tabular-nums"}}>
        {count} <span style={{color:T.textMut, fontWeight:600}}>({pct.toFixed(0)}%)</span>
      </div>
    </div>
  );
}

function EmptyHint({ icon, msg }){
  return (
    <div style={{
      padding:"24px 16px", textAlign:"center",
      background:T.bg, borderRadius:10, border:`1px dashed ${T.brd}`,
    }}>
      <div style={{fontSize:36, marginBottom:8, opacity:0.5}}>{icon}</div>
      <div style={{fontSize:FS-1, color:T.textSec, lineHeight:1.6, maxWidth:480, margin:"0 auto"}}>{msg}</div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   PROFILES TAB (V19.73 — Phase C)
   List of customers with their AI profile + click for full details.
   Allows admin to manage admin_notes + observations + flags directly
   on the customer record (writes to `data.customers` via upConfig).
   ════════════════════════════════════════════════════════════ */
function ProfilesTab({ agent, data, updateAgent, upConfig, canEdit, isMob }){
  const customers = data?.customers || [];
  const [search, setSearch] = useState("");
  const [filterStage, setFilterStage] = useState("");
  const [filterTier, setFilterTier] = useState("");
  const [pickedId, setPickedId] = useState(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter(c => {
      if (filterStage && c.stage !== filterStage) return false;
      if (filterTier  && c.tier  !== filterTier)  return false;
      if (!q) return true;
      const hay = [c.name, c.phone, c.address, c.notes, ...((c.additional_phones||[]).map(p=>p.number||p))].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [customers, search, filterStage, filterTier]);

  const picked = customers.find(c => c.id === pickedId);

  const cardStyle = { background:T.cardSolid, border:`1px solid ${T.brd}`, borderRadius:14, padding: isMob?14:18, marginBottom:14 };

  return (
    <div>
      <div style={{...cardStyle, display:"grid", gridTemplateColumns: isMob?"1fr":"2fr 1fr 1fr", gap:10}}>
        <Inp value={search} onChange={setSearch} placeholder="🔍 بحث: اسم، تليفون، عنوان..."/>
        <Sel value={filterStage} onChange={setFilterStage}>
          <option value="">📊 كل المراحل</option>
          {STAGES.map(s => <option key={s.key} value={s.key}>{s.icon} {s.label}</option>)}
        </Sel>
        <Sel value={filterTier} onChange={setFilterTier}>
          <option value="">💎 كل الـ Tiers</option>
          {TIERS.map(t => <option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
        </Sel>
      </div>

      <div style={{display:"flex", gap:10, marginBottom:14, flexWrap:"wrap"}}>
        <StatPill label="إجمالي العملاء" value={customers.length} color="#0EA5E9"/>
        <StatPill label="ظاهر بالفلتر" value={filtered.length} color="#10B981"/>
        <StatPill label="بدون stage" value={customers.filter(c=>!c.stage).length} color="#94A3B8"/>
      </div>

      {filtered.length === 0 ? (
        <div style={{...cardStyle, textAlign:"center", padding:"50px 24px"}}>
          <div style={{fontSize:56, marginBottom:14, opacity:0.5}}>👥</div>
          <div style={{fontSize:FS+3, fontWeight:800, color:T.text, marginBottom:6}}>
            {customers.length === 0 ? "مفيش عملاء في النظام" : "مفيش نتائج بالفلتر"}
          </div>
          <div style={{fontSize:FS-1, color:T.textMut, maxWidth:460, margin:"0 auto", lineHeight:1.6}}>
            {customers.length === 0
              ? "لما تضيف عملاء في tab قاعدة البيانات، هيظهروا هنا تلقائياً مع الـ AI profile بتاعهم."
              : "غيّر الفلاتر أو نظّف البحث."}
          </div>
        </div>
      ) : (
        <div style={{display:"grid", gap:8}}>
          {filtered.slice(0, 100).map(c => (
            <CustomerProfileCard key={c.id} customer={c} onPick={()=>setPickedId(c.id)}/>
          ))}
          {filtered.length > 100 && (
            <div style={{textAlign:"center", padding:14, color:T.textMut, fontSize:FS-1}}>
              ظاهر أول 100 عميل من أصل {filtered.length}
            </div>
          )}
        </div>
      )}

      {picked && (
        <CustomerFullProfileModal
          customer={picked}
          upConfig={upConfig}
          canEdit={canEdit}
          onClose={()=>setPickedId(null)}
          isMob={isMob}
        />
      )}
    </div>
  );
}

function CustomerProfileCard({ customer, onPick }){
  const c = customer;
  const stage = STAGES.find(s => s.key === c.stage);
  const tier  = TIERS.find(t => t.key === c.tier);
  return (
    <div onClick={onPick} style={{
      padding:12, background:T.cardSolid, border:`1px solid ${T.brd}`, borderRadius:12, cursor:"pointer",
      display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, flexWrap:"wrap",
      transition:"all 0.15s",
    }}
    onMouseEnter={e => e.currentTarget.style.borderColor = T.accent}
    onMouseLeave={e => e.currentTarget.style.borderColor = T.brd}
    >
      <div style={{flex:1, minWidth:200}}>
        <div style={{display:"flex", alignItems:"center", gap:8, flexWrap:"wrap"}}>
          <span style={{fontSize:FS+1, fontWeight:800, color:T.text}}>👤 {c.name}</span>
          {tier && <span style={{fontSize:FS-2, padding:"2px 8px", borderRadius:8, background:tier.color+"15", color:tier.color, fontWeight:700}}>{tier.icon} {tier.label}</span>}
          {stage && <span style={{fontSize:FS-2, padding:"2px 8px", borderRadius:8, background:stage.color+"15", color:stage.color, fontWeight:700}}>{stage.icon} {stage.label}</span>}
        </div>
        <div style={{fontSize:FS-1, color:T.textSec, marginTop:4}}>
          📞 {c.phone || "—"}
          {c.additional_phones?.length > 0 && <span style={{color:T.textMut}}> (+{c.additional_phones.length} رقم)</span>}
          {c.address && <span style={{color:T.textMut}}> · 📍 {c.address}</span>}
        </div>
      </div>
      <div style={{display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4, flexShrink:0}}>
        <span style={{fontSize:FS-1, color:T.accent, fontWeight:700}}>عرض الملف ←</span>
      </div>
    </div>
  );
}

function CustomerFullProfileModal({ customer, upConfig, canEdit, onClose, isMob }){
  /* V19.74: per-modal draft. All edits mutate the draft only.
     "💾 حفظ التغييرات" pushes the draft up to customers[idx] in one upConfig call.
     Closing with unsaved changes prompts to confirm. */
  const [draft, setDraft] = useState(() => deepClone(customer));
  const [dirty, setDirty] = useState(false);

  /* If the source customer changes externally and we have no local edits,
     refresh the draft. (Same logic as the page-level draft.) */
  const customerJson = JSON.stringify(customer);
  useEffect(() => {
    if (!dirty) setDraft(deepClone(customer));
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [customerJson]);

  const c = draft;
  const stage = STAGES.find(s => s.key === c.stage);
  const tier  = TIERS.find(t => t.key === c.tier);
  const aiProfile = c.ai_profile || {};
  const flags = aiProfile.flags || {};
  const observations = aiProfile.observations || [];
  const adminNotes = aiProfile.notes_from_admin || [];
  const stageHistory = c.stage_history || [];
  const additionalPhones = c.additional_phones || [];

  const [newNote, setNewNote] = useState("");
  const [newObsText, setNewObsText] = useState("");

  const updateCustomer = (mutator) => {
    if (!canEdit) { showToast("ليس لديك صلاحية التعديل"); return; }
    setDraft(prev => {
      const next = deepClone(prev);
      if (!next.ai_profile) next.ai_profile = {};
      mutator(next);
      return next;
    });
    setDirty(true);
  };

  const saveChanges = () => {
    if (!dirty) return;
    upConfig(d => {
      if (!Array.isArray(d.customers)) return;
      const idx = d.customers.findIndex(x => x.id === customer.id);
      if (idx < 0) return;
      d.customers[idx] = deepClone(draft);
    });
    setDirty(false);
    showToast("✓ تم حفظ كل التغييرات");
  };

  const discardChanges = async () => {
    if (!dirty) return;
    const ok = await ask("التراجع عن كل التغييرات غير المحفوظة؟");
    if (!ok) return;
    setDraft(deepClone(customer));
    setDirty(false);
  };

  const handleClose = async () => {
    if (dirty) {
      const ok = await ask("في تغييرات غير محفوظة. تأكيد الإغلاق؟ (هتضيع)");
      if (!ok) return;
    }
    onClose();
  };

  const setFlag = (key, val) => updateCustomer(cur => {
    if (!cur.ai_profile.flags) cur.ai_profile.flags = {};
    cur.ai_profile.flags[key] = val;
  });

  const addNote = () => {
    const txt = newNote.trim(); if (!txt) return;
    updateCustomer(cur => {
      if (!Array.isArray(cur.ai_profile.notes_from_admin)) cur.ai_profile.notes_from_admin = [];
      cur.ai_profile.notes_from_admin.push({
        id: gid(), note: txt, added_at: new Date().toISOString(),
      });
    });
    setNewNote("");
  };

  const removeNote = (id) => updateCustomer(cur => {
    cur.ai_profile.notes_from_admin = (cur.ai_profile.notes_from_admin||[]).filter(n => n.id !== id);
  });

  const addObservation = () => {
    const txt = newObsText.trim(); if (!txt) return;
    updateCustomer(cur => {
      if (!Array.isArray(cur.ai_profile.observations)) cur.ai_profile.observations = [];
      cur.ai_profile.observations.push({
        id: gid(), observation: txt,
        suggested_at: new Date().toISOString(),
        suggested_by: "admin_manual",
        status: "approved",
      });
    });
    setNewObsText("");
  };

  const approveObs = (obsId) => updateCustomer(cur => {
    const obs = (cur.ai_profile.observations||[]).find(o => o.id === obsId);
    if (obs) {
      obs.status = "approved";
      obs.reviewed_at = new Date().toISOString();
    }
  });

  const rejectObs = (obsId) => updateCustomer(cur => {
    cur.ai_profile.observations = (cur.ai_profile.observations||[]).filter(o => o.id !== obsId);
  });

  const sectionStyle = { paddingBottom:14, marginBottom:14, borderBottom:`1px solid ${T.brd}` };

  return (
    <div onClick={handleClose} style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,0.5)",
      zIndex:99998, display:"flex", alignItems:"flex-start", justifyContent:"center",
      padding:isMob?8:24, overflow:"auto",
    }}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:T.cardSolid, borderRadius:16, padding: isMob?14:24,
        width:"100%", maxWidth:740, marginTop: isMob?8:24, marginBottom: isMob?8:24,
        boxShadow:"0 20px 60px rgba(0,0,0,0.3)", direction:"rtl",
      }}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:18, gap:10, flexWrap:"wrap"}}>
          <div style={{flex:1, minWidth:200}}>
            <div style={{fontSize:FS+6, fontWeight:800, color:T.text, lineHeight:1.2}}>👤 {c.name}</div>
            <div style={{display:"flex", alignItems:"center", gap:8, marginTop:6, flexWrap:"wrap"}}>
              {tier && <span style={{fontSize:FS-1, padding:"3px 10px", borderRadius:8, background:tier.color+"15", color:tier.color, fontWeight:700}}>{tier.icon} {tier.label}</span>}
              {stage && <span style={{fontSize:FS-1, padding:"3px 10px", borderRadius:8, background:stage.color+"15", color:stage.color, fontWeight:700}}>{stage.icon} {stage.label}</span>}
              {!stage && <span style={{fontSize:FS-2, color:T.textMut}}>(stage غير محدد)</span>}
            </div>
          </div>
          <Btn ghost small onClick={handleClose}>✕</Btn>
        </div>

        {/* V19.74: dirty banner inside the modal — local to this customer's draft */}
        {dirty && (
          <div style={{
            display:"flex", alignItems:"center", justifyContent:"space-between",
            gap:10, marginBottom:16, padding:"8px 12px",
            background:"#FEF3C7", border:"1.5px solid #F59E0B", borderRadius:10,
            flexWrap:"wrap",
          }}>
            <span style={{fontSize:FS-1, color:"#92400E", fontWeight:700}}>
              ⚠️ تغييرات غير محفوظة على ملف العميل
            </span>
            <div style={{display:"flex", gap:6}}>
              <Btn ghost small onClick={discardChanges}>↩️ تراجع</Btn>
              <Btn primary small onClick={saveChanges}>💾 حفظ</Btn>
            </div>
          </div>
        )}

        <div style={sectionStyle}>
          <h4 style={{margin:"0 0 8px", fontSize:FS, fontWeight:800, color:T.text}}>📞 أرقام التواصل</h4>
          <div style={{padding:"8px 12px", background:T.bg, borderRadius:8, fontSize:FS-1}}>
            <div><strong>الأساسي:</strong> {c.phone || "—"} {c.normalized_phone && <span style={{color:T.textMut, fontSize:FS-2}}>· normalized: {c.normalized_phone}</span>}</div>
            {additionalPhones.length > 0 && additionalPhones.map((p, i) => (
              <div key={i} style={{marginTop:4}}>
                <strong>إضافي:</strong> {typeof p === "string" ? p : (p.number || "—")}
                {p.label && <span style={{color:T.textMut, marginInlineStart:8}}>· {p.label}</span>}
                {p.verified_at && <span style={{color:T.ok, marginInlineStart:8}}>✅ verified</span>}
              </div>
            ))}
            {additionalPhones.length === 0 && <div style={{fontSize:FS-2, color:T.textMut, marginTop:4}}>لا يوجد أرقام إضافية</div>}
          </div>
        </div>

        <div style={sectionStyle}>
          <h4 style={{margin:"0 0 8px", fontSize:FS, fontWeight:800, color:T.text}}>🎯 AI Profile</h4>
          <div style={{display:"grid", gridTemplateColumns: isMob?"1fr":"1fr 1fr", gap:10, fontSize:FS-1}}>
            <ProfileField label="الفئات المفضّلة" value={(aiProfile.preferred_categories||[]).join("، ") || "—"}/>
            <ProfileField label="المواسم المفضّلة" value={(aiProfile.preferred_seasons||[]).join("، ") || "—"}/>
            <ProfileField label="الموديلات المفضّلة" value={(aiProfile.preferred_models||[]).join("، ") || "—"}/>
            <ProfileField label="متوسط قيمة الطلب" value={aiProfile.avg_order_value ? `${aiProfile.avg_order_value.toLocaleString("ar-EG")} ج` : "—"}/>
            <ProfileField label="مشتريات آخر 12 شهر" value={aiProfile.total_purchases_last_12_months ? `${aiProfile.total_purchases_last_12_months.toLocaleString("ar-EG")} ج` : "—"}/>
            <ProfileField label="نمط الدفع" value={aiProfile.payment_pattern || "—"}/>
            <ProfileField label="أسلوب التواصل" value={aiProfile.communication_style || "—"}/>
            <ProfileField label="أحسن وقت للرد" value={aiProfile.preferred_response_time || "—"}/>
          </div>
          {!aiProfile.preferred_categories && (
            <div style={{marginTop:8, fontSize:FS-2, color:T.textMut, fontStyle:"italic"}}>
              💡 الـ AI Profile لسه فاضي. الـ Agent backend (Phase D) هيـpopulate الحقول من تاريخ العميل.
            </div>
          )}
        </div>

        <div style={sectionStyle}>
          <h4 style={{margin:"0 0 8px", fontSize:FS, fontWeight:800, color:T.text}}>📝 ملاحظات الإدارة</h4>
          {adminNotes.length === 0 ? (
            <div style={{fontSize:FS-1, color:T.textMut, fontStyle:"italic", marginBottom:8}}>لا يوجد ملاحظات بعد.</div>
          ) : (
            <div style={{display:"grid", gap:6, marginBottom:8}}>
              {adminNotes.map(n => (
                <div key={n.id} style={{padding:"8px 12px", background:"#FEF3C7", borderRadius:8, border:"1px solid #FCD34D", display:"flex", justifyContent:"space-between", gap:8, alignItems:"flex-start"}}>
                  <div style={{flex:1, fontSize:FS-1, color:"#78350F"}}>
                    {n.note}
                    {n.added_at && <div style={{fontSize:FS-3, color:"#92400E", marginTop:2}}>· {new Date(n.added_at).toLocaleDateString("ar-EG")}</div>}
                  </div>
                  {canEdit && <span onClick={()=>removeNote(n.id)} style={{cursor:"pointer", color:"#991B1B", fontWeight:800, fontSize:FS-1}}>✕</span>}
                </div>
              ))}
            </div>
          )}
          {canEdit && (
            <div style={{display:"flex", gap:6}}>
              <Inp value={newNote} onChange={setNewNote} placeholder="مثال: بيفضّل الشيكات على الكاش"/>
              <Btn primary small onClick={addNote}>+ إضافة</Btn>
            </div>
          )}
        </div>

        <div style={sectionStyle}>
          <h4 style={{margin:"0 0 8px", fontSize:FS, fontWeight:800, color:T.text}}>💡 ملاحظات ذكية (Observations)</h4>
          {observations.length === 0 ? (
            <div style={{fontSize:FS-1, color:T.textMut, fontStyle:"italic", marginBottom:8}}>
              مفيش observations. الـ Agent backend (Phase D) هيـsuggest observations من المحادثات للموافقة.
            </div>
          ) : (
            <div style={{display:"grid", gap:6, marginBottom:8}}>
              {observations.map(o => (
                <div key={o.id} style={{
                  padding:"8px 12px", borderRadius:8,
                  background: o.status === "pending" ? "#DBEAFE" : "#D1FAE5",
                  border: `1px solid ${o.status === "pending" ? "#93C5FD" : "#6EE7B7"}`,
                  display:"flex", justifyContent:"space-between", gap:8, alignItems:"flex-start", flexWrap:"wrap",
                }}>
                  <div style={{flex:1, minWidth:200, fontSize:FS-1, color: o.status === "pending" ? "#1E40AF" : "#065F46"}}>
                    {o.observation}
                    {o.evidence && <div style={{fontSize:FS-3, marginTop:2, color:T.textMut}}>الدليل: {o.evidence}</div>}
                    <div style={{fontSize:FS-3, marginTop:2, color:T.textMut}}>
                      {o.status === "pending" ? "🕒 قيد المراجعة" : "✅ معتمدة"}
                      {o.suggested_by && <span> · من: {o.suggested_by === "admin_manual" ? "أدمن" : "AI"}</span>}
                    </div>
                  </div>
                  {canEdit && o.status === "pending" && (
                    <div style={{display:"flex", gap:4}}>
                      <Btn primary small onClick={()=>approveObs(o.id)}>✅</Btn>
                      <Btn danger small onClick={()=>rejectObs(o.id)}>❌</Btn>
                    </div>
                  )}
                  {canEdit && o.status !== "pending" && (
                    <Btn danger small onClick={()=>rejectObs(o.id)}>🗑</Btn>
                  )}
                </div>
              ))}
            </div>
          )}
          {canEdit && (
            <div style={{display:"flex", gap:6}}>
              <Inp value={newObsText} onChange={setNewObsText} placeholder="أضف ملاحظة يدوياً (هتظهر للـ Agent)"/>
              <Btn primary small onClick={addObservation}>+ إضافة</Btn>
            </div>
          )}
        </div>

        <div style={sectionStyle}>
          <h4 style={{margin:"0 0 8px", fontSize:FS, fontWeight:800, color:T.text}}>🚩 الـ Flags</h4>
          <div style={{display:"grid", gridTemplateColumns: isMob?"1fr":"1fr 1fr", gap:8}}>
            {[
              { key:"vip",               label:"⭐ VIP" },
              { key:"careful_handling",  label:"🔒 معاملة بعناية" },
              { key:"do_not_call",       label:"📵 ممنوع الاتصال" },
              { key:"special_pricing",   label:"💰 أسعار خاصة" },
            ].map(f => (
              <label key={f.key} style={{
                display:"flex", alignItems:"center", gap:8, padding:"8px 12px", borderRadius:8,
                background: flags[f.key] ? "#8B5CF608" : T.bg,
                border: `1px solid ${flags[f.key] ? "#8B5CF640" : T.brd}`,
                cursor: canEdit?"pointer":"default",
              }}>
                <input type="checkbox" checked={!!flags[f.key]}
                  onChange={e=>canEdit && setFlag(f.key, e.target.checked)}
                  style={{width:18,height:18}}/>
                <span style={{fontSize:FS, fontWeight:600, color:T.text}}>{f.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div style={{paddingBottom:14}}>
          <h4 style={{margin:"0 0 8px", fontSize:FS, fontWeight:800, color:T.text}}>📅 تاريخ المراحل</h4>
          {stageHistory.length === 0 ? (
            <div style={{fontSize:FS-1, color:T.textMut, fontStyle:"italic"}}>مفيش تاريخ مسجّل.</div>
          ) : (
            <div style={{display:"grid", gap:4}}>
              {stageHistory.map((h, i) => (
                <div key={i} style={{padding:"6px 10px", borderRadius:6, background:T.bg, fontSize:FS-1, display:"flex", justifyContent:"space-between"}}>
                  <span style={{color:T.text}}>
                    {h.from ? `${h.from} → ` : ""}{h.to}
                    {h.changed_by && <span style={{color:T.textMut, fontSize:FS-2, marginInlineStart:8}}>· بواسطة {h.changed_by}</span>}
                  </span>
                  <span style={{color:T.textMut, fontSize:FS-2}}>
                    {h.changed_at ? new Date(h.changed_at).toLocaleDateString("ar-EG") : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{display:"flex", justifyContent:"space-between", paddingTop:10, borderTop:`1px solid ${T.brd}`, gap:8, flexWrap:"wrap"}}>
          <Btn ghost onClick={handleClose}>إغلاق</Btn>
          {dirty && <Btn primary onClick={saveChanges}>💾 حفظ التغييرات</Btn>}
        </div>
      </div>
    </div>
  );
}

function ProfileField({ label, value }){
  return (
    <div>
      <div style={{fontSize:FS-2, color:T.textSec, fontWeight:600}}>{label}</div>
      <div style={{fontSize:FS-1, color:T.text, fontWeight:600, marginTop:2}}>{value}</div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   CATALOG TAB (V19.76) — product master data for the AI agent
   ─────────────────────────────────────────────────────────────
   Stores entries in `config.catalog[]`. Each entry: code, name,
   image (compressed base64 thumbnail), category, season, sizes,
   colors, fabrics, price, etc. The agent's search_products tool
   reads this as the SINGLE SOURCE OF TRUTH so it stops inventing.

   Includes "Import from orders" — scans recent orders and offers
   to add their unique models with one click.
   ════════════════════════════════════════════════════════════ */
function CatalogTab({ data, upConfig, canEdit, isMob }){
  const catalog = Array.isArray(data?.catalog) ? data.catalog : [];
  const categories = data?.catalogCategories || ["ولادي", "بناتي", "بيبي", "junior", "أخرى"];
  const seasons = Array.isArray(data?.seasons) ? data.seasons : [];
  const fabrics = Array.isArray(data?.fabrics) ? data.fabrics : [];

  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterSeason, setFilterSeason] = useState("");
  const [editing, setEditing] = useState(null);/* product object | "new" | null */
  const [importing, setImporting] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.filter(p => {
      if (filterCategory && p.category !== filterCategory) return false;
      if (filterSeason && p.season !== filterSeason) return false;
      if (!q) return true;
      const hay = [p.code, p.name, p.nameEn, p.description, ...(p.tags||[])].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [catalog, search, filterCategory, filterSeason]);

  const saveProduct = (product) => {
    if (!canEdit) { showToast("ليس لديك صلاحية"); return; }
    upConfig(d => {
      if (!Array.isArray(d.catalog)) d.catalog = [];
      const idx = d.catalog.findIndex(p => p.id === product.id);
      const now = new Date().toISOString();
      if (idx >= 0) {
        d.catalog[idx] = { ...d.catalog[idx], ...product, updatedAt: now };
      } else {
        d.catalog.unshift({ ...product, createdAt: now, updatedAt: now });
      }
    });
    setEditing(null);
    showToast("✓ تم حفظ الموديل");
  };

  const delProduct = async (id) => {
    if (!canEdit) return;
    const ok = await ask("حذف الموديل ده من الكتالوج؟");
    if (!ok) return;
    upConfig(d => { d.catalog = (d.catalog||[]).filter(p => p.id !== id); });
    showToast("🗑 تم الحذف");
  };

  const cardStyle = { background:T.cardSolid, border:`1px solid ${T.brd}`, borderRadius:14, padding: isMob?12:16, marginBottom:14 };

  /* Stats */
  const stats = {
    total: catalog.length,
    byCategory: categories.map(c => ({ c, n: catalog.filter(p => p.category === c).length })).filter(x => x.n > 0),
    bySeason:   seasons.map(s => ({ s, n: catalog.filter(p => p.season === s).length })).filter(x => x.n > 0),
    inStock: catalog.filter(p => p.inStock).length,
  };

  return (
    <div>
      {/* Banner explaining the role of the catalog */}
      <div style={{
        padding:"10px 14px", marginBottom:14, borderRadius:10,
        background:"#0EA5E908", border:"1px solid #0EA5E930",
        fontSize:FS-1, color:"#0369A1", lineHeight:1.6,
      }}>
        💡 الكتالوج ده <strong>المصدر الوحيد للموديلات</strong> اللي الـ AI Agent بـ يقرأ منه. لو موديل مش هنا، الـ agent مش هيعرفه ولن يخترعه (قاعدة anti-hallucination). كل ما تـadd موديلات، الـ agent بقى أدق.
      </div>

      {/* Toolbar */}
      <div style={{...cardStyle, display:"grid", gridTemplateColumns: isMob?"1fr":"2fr 1fr 1fr auto", gap:10, alignItems:"center"}}>
        <Inp value={search} onChange={setSearch} placeholder="🔍 كود، اسم، وصف، tag..."/>
        <Sel value={filterCategory} onChange={setFilterCategory}>
          <option value="">📁 كل الفئات</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </Sel>
        <Sel value={filterSeason} onChange={setFilterSeason}>
          <option value="">🌦 كل المواسم</option>
          {seasons.map(s => <option key={s} value={s}>{s}</option>)}
        </Sel>
        {canEdit && (
          <div style={{display:"flex", gap:6}}>
            <Btn onClick={()=>setImporting(true)}>📥 استيراد</Btn>
            <Btn primary onClick={()=>setEditing("new")}>+ موديل</Btn>
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{display:"flex", gap:10, marginBottom:14, flexWrap:"wrap"}}>
        <StatPill label="إجمالي الموديلات" value={stats.total} color="#0EA5E9"/>
        <StatPill label="ظاهر بالفلتر" value={filtered.length} color="#10B981"/>
        <StatPill label="متاح" value={stats.inStock} color="#059669"/>
        {catalog.length >= 50 && (
          <div style={{flex:"1 1 200px", padding:"8px 12px", borderRadius:8, background:"#FEF3C7", border:"1px solid #FCD34D", fontSize:FS-2, color:"#78350F"}}>
            ⚠️ أكتر من 50 موديل — لو الأداء بـ يبطؤ، فكر تـsplit الكتالوج لـ subcollection (Phase 2 work).
          </div>
        )}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div style={{...cardStyle, textAlign:"center", padding:"50px 24px"}}>
          <div style={{fontSize:56, marginBottom:14, opacity:0.5}}>📦</div>
          <div style={{fontSize:FS+3, fontWeight:800, color:T.text, marginBottom:6}}>
            {catalog.length === 0 ? "الكتالوج فاضي" : "مفيش نتائج"}
          </div>
          <div style={{fontSize:FS-1, color:T.textMut, marginBottom:18, maxWidth:480, margin:"0 auto 18px"}}>
            {catalog.length === 0
              ? "ضيف أول موديل يدوياً، أو استورد من الأوامر الموجودة."
              : "غيّر شروط البحث/الفلتر."}
          </div>
          {canEdit && catalog.length === 0 && (
            <div style={{display:"flex", gap:8, justifyContent:"center"}}>
              <Btn onClick={()=>setImporting(true)}>📥 استيراد من الأوامر</Btn>
              <Btn primary onClick={()=>setEditing("new")}>+ إضافة يدوياً</Btn>
            </div>
          )}
        </div>
      ) : (
        <div style={{display:"grid", gridTemplateColumns: isMob?"1fr":"repeat(auto-fill, minmax(280px, 1fr))", gap:12}}>
          {filtered.map(p => (
            <CatalogCard key={p.id} product={p} canEdit={canEdit}
              onEdit={()=>setEditing(p)} onDelete={()=>delProduct(p.id)}/>
          ))}
        </div>
      )}

      {/* Editor */}
      {editing && (
        <CatalogEditor
          product={editing === "new" ? null : editing}
          categories={categories}
          seasons={seasons}
          fabrics={fabrics}
          onSave={saveProduct}
          onClose={()=>setEditing(null)}
          isMob={isMob}
        />
      )}

      {/* Import from orders */}
      {importing && (
        <CatalogImportModal
          data={data}
          existingCodes={new Set(catalog.map(p => String(p.code).trim()))}
          onImport={(items) => {
            upConfig(d => {
              if (!Array.isArray(d.catalog)) d.catalog = [];
              const now = new Date().toISOString();
              for (const it of items) d.catalog.unshift({ ...it, id: gid(), createdAt: now, updatedAt: now });
            });
            showToast(`✓ تم استيراد ${items.length} موديل`);
            setImporting(false);
          }}
          onClose={()=>setImporting(false)}
          isMob={isMob}
        />
      )}
    </div>
  );
}

function CatalogCard({ product, canEdit, onEdit, onDelete }){
  const p = product;
  return (
    <div style={{
      background:T.cardSolid, border:`1px solid ${T.brd}`, borderRadius:12,
      overflow:"hidden", display:"flex", flexDirection:"column",
      transition:"all 0.15s",
    }}
    onMouseEnter={e=>e.currentTarget.style.borderColor=T.accent}
    onMouseLeave={e=>e.currentTarget.style.borderColor=T.brd}
    >
      {/* Image */}
      <div style={{
        aspectRatio:"4/3", background:T.bg,
        display:"flex", alignItems:"center", justifyContent:"center",
        position:"relative", overflow:"hidden",
      }}>
        {p.image ? (
          <img src={p.image} alt={p.name} style={{width:"100%", height:"100%", objectFit:"cover"}}/>
        ) : (
          <div style={{fontSize:48, opacity:0.3}}>📦</div>
        )}
        {!p.inStock && (
          <div style={{
            position:"absolute", top:8, right:8,
            padding:"3px 8px", borderRadius:6,
            background:"#FEE2E2", color:"#991B1B",
            fontSize:11, fontWeight:700,
          }}>غير متاح</div>
        )}
      </div>
      {/* Body */}
      <div style={{padding:12, flex:1, display:"flex", flexDirection:"column"}}>
        <div style={{display:"flex", alignItems:"baseline", gap:8, marginBottom:4, flexWrap:"wrap"}}>
          <span style={{fontSize:FS-2, fontFamily:"'Fira Code', monospace", color:T.textMut, fontWeight:700}}>
            {p.code}
          </span>
          {p.season && <span style={{fontSize:FS-3, padding:"1px 6px", borderRadius:5, background:T.bg, color:T.textSec}}>{p.season}</span>}
          {p.category && <span style={{fontSize:FS-3, padding:"1px 6px", borderRadius:5, background:"#EDE9FE", color:"#7C3AED"}}>{p.category}</span>}
        </div>
        <div style={{fontSize:FS+1, fontWeight:800, color:T.text, marginBottom:6}}>
          {p.name}
        </div>
        {p.description && (
          <div style={{fontSize:FS-1, color:T.textSec, lineHeight:1.5, marginBottom:8,
            display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden"}}>
            {p.description}
          </div>
        )}
        <div style={{fontSize:FS-2, color:T.textMut, marginBottom:6, display:"flex", flexWrap:"wrap", gap:4}}>
          {(p.sizes||[]).length > 0 && <span>📏 {p.sizes.slice(0,4).join("/")}{p.sizes.length>4?"…":""}</span>}
          {(p.colors||[]).length > 0 && <span>🎨 {p.colors.length} لون</span>}
        </div>
        {p.priceWholesale ? (
          <div style={{fontSize:FS, fontWeight:800, color:T.accent, marginTop:"auto"}}>
            {Number(p.priceWholesale).toLocaleString("ar-EG")} ج
            {p.minOrderQty ? <span style={{fontSize:FS-2, color:T.textMut, marginInlineStart:6, fontWeight:600}}>· الحد الأدنى {p.minOrderQty}</span> : null}
          </div>
        ) : (
          <div style={{fontSize:FS-2, color:T.textMut, marginTop:"auto", fontStyle:"italic"}}>السعر يحدد بالاتفاق</div>
        )}
        {canEdit && (
          <div style={{display:"flex", gap:6, marginTop:10, paddingTop:10, borderTop:`1px solid ${T.brd}`}}>
            <Btn ghost small onClick={onEdit} style={{flex:1}}>✏️ تعديل</Btn>
            <Btn danger small onClick={onDelete}>🗑</Btn>
          </div>
        )}
      </div>
    </div>
  );
}

function CatalogEditor({ product, categories, seasons, fabrics, onSave, onClose, isMob }){
  const [code, setCode] = useState(product?.code || "");
  const [name, setName] = useState(product?.name || "");
  const [nameEn, setNameEn] = useState(product?.nameEn || "");
  const [description, setDescription] = useState(product?.description || "");
  const [category, setCategory] = useState(product?.category || categories[0] || "ولادي");
  const [season, setSeason] = useState(product?.season || seasons[0] || "");
  const [sizes, setSizes] = useState(product?.sizes || []);
  const [colors, setColors] = useState(product?.colors || []);
  const [productFabrics, setProductFabrics] = useState(product?.fabrics || []);
  const [priceWholesale, setPriceWholesale] = useState(product?.priceWholesale || "");
  const [minOrderQty, setMinOrderQty] = useState(product?.minOrderQty || "");
  const [inStock, setInStock] = useState(product?.inStock !== false);
  const [notes, setNotes] = useState(product?.notes || "");
  const [tags, setTags] = useState(product?.tags || []);
  const [image, setImage] = useState(product?.image || null);
  const [newSize, setNewSize] = useState("");
  const [newColor, setNewColor] = useState("");
  const [newTag, setNewTag] = useState("");
  const [imageBusy, setImageBusy] = useState(false);

  const handleImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageBusy(true);
    try {
      /* compressImg43 returns 4:3 aspect base64 — perfect for catalog cards */
      const compressed = await compressImg43(file, { maxWidth: 600, quality: 0.78 });
      setImage(compressed);
    } catch (err) {
      showToast("⚠️ فشل ضغط الصورة: " + err.message);
    } finally {
      setImageBusy(false);
    }
  };

  const handleSave = () => {
    if (!code.trim() || !name.trim()) {
      showToast("⚠️ الكود واسم الموديل مطلوبين");
      return;
    }
    onSave({
      id: product?.id || gid(),
      code: code.trim(),
      name: name.trim(),
      nameEn: nameEn.trim() || null,
      description: description.trim() || null,
      category,
      season: season || null,
      sizes: sizes.filter(Boolean),
      colors: colors.filter(Boolean),
      fabrics: productFabrics.filter(Boolean),
      priceWholesale: priceWholesale ? Number(priceWholesale) : null,
      minOrderQty: minOrderQty ? Number(minOrderQty) : null,
      inStock: !!inStock,
      notes: notes.trim() || null,
      tags: tags.filter(Boolean),
      image: image || null,
    });
  };

  const fld = { fontSize:FS-1, fontWeight:700, color:T.textSec, marginBottom:4, display:"block" };
  const tagStyle = { display:"inline-flex", alignItems:"center", gap:5, padding:"3px 9px", borderRadius:6, background:T.bg, border:`1px solid ${T.brd}`, fontSize:FS-1 };

  return (
    <div onClick={onClose} style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,0.5)",
      zIndex:99998, display:"flex", alignItems:"flex-start", justifyContent:"center",
      padding:isMob?8:24, overflow:"auto",
    }}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:T.cardSolid, borderRadius:16, padding: isMob?14:24,
        width:"100%", maxWidth:780, marginTop: isMob?8:24, marginBottom: isMob?8:24,
        boxShadow:"0 20px 60px rgba(0,0,0,0.3)", direction:"rtl",
      }}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18}}>
          <h2 style={{margin:0, fontSize:FS+4, fontWeight:800, color:T.text}}>
            {product ? "✏️ تعديل موديل" : "+ موديل جديد"}
          </h2>
          <Btn ghost small onClick={onClose}>✕</Btn>
        </div>

        {/* Section: Basic */}
        <h4 style={{margin:"4px 0 10px", fontSize:FS, color:T.textSec, fontWeight:700}}>المعلومات الأساسية</h4>
        <div style={{display:"grid", gridTemplateColumns: isMob?"1fr":"1fr 2fr", gap:10, marginBottom:14}}>
          <div>
            <label style={fld}>كود الموديل *</label>
            <Inp value={code} onChange={setCode} placeholder="3262111"/>
          </div>
          <div>
            <label style={fld}>اسم الموديل *</label>
            <Inp value={name} onChange={setName} placeholder="WINTER PRO"/>
          </div>
          <div>
            <label style={fld}>الاسم بالإنجليزي (اختياري)</label>
            <Inp value={nameEn} onChange={setNameEn} placeholder="Winter Pro"/>
          </div>
          <div>
            <label style={fld}>الفئة</label>
            <Sel value={category} onChange={setCategory}>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </Sel>
          </div>
          <div>
            <label style={fld}>الموسم</label>
            <Sel value={season} onChange={setSeason}>
              <option value="">-- اختر --</option>
              {seasons.map(s => <option key={s} value={s}>{s}</option>)}
            </Sel>
          </div>
          <label style={{display:"flex",alignItems:"center",gap:8,marginTop:isMob?0:18,fontSize:FS,fontWeight:600,color:T.text,cursor:"pointer"}}>
            <input type="checkbox" checked={!!inStock} onChange={e=>setInStock(e.target.checked)} style={{width:18,height:18}}/>
            متاح حالياً
          </label>
        </div>

        <div style={{marginBottom:14}}>
          <label style={fld}>الوصف</label>
          <textarea value={description} onChange={e=>setDescription(e.target.value)} rows={2}
            placeholder="مثلاً: جاكت ولادي شتوي بكاب، خامة صوف 80%"
            style={{width:"100%",padding:10,borderRadius:8,border:`1px solid ${T.brd}`,background:T.cardSolid,color:T.text,fontFamily:"inherit",fontSize:FS,direction:"rtl",boxSizing:"border-box"}}/>
        </div>

        {/* Section: Image */}
        <h4 style={{margin:"4px 0 10px", fontSize:FS, color:T.textSec, fontWeight:700}}>الصورة</h4>
        <div style={{display:"grid", gridTemplateColumns: isMob?"1fr":"160px 1fr", gap:10, marginBottom:14, alignItems:"start"}}>
          <div style={{aspectRatio:"4/3",background:T.bg,borderRadius:10,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",border:`1px dashed ${T.brd}`}}>
            {image ? (
              <img src={image} alt="preview" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
            ) : (
              <span style={{fontSize:36,opacity:0.4}}>📷</span>
            )}
          </div>
          <div>
            <input type="file" accept="image/*" onChange={handleImage} disabled={imageBusy}
              style={{fontSize:FS-1,padding:8,border:`1px solid ${T.brd}`,borderRadius:8,background:T.cardSolid,color:T.text,width:"100%",boxSizing:"border-box"}}/>
            <div style={{fontSize:FS-2, color:T.textMut, marginTop:6, lineHeight:1.5}}>
              الصورة بـ تتـcompress تلقائياً لـ 4:3 ثم 600px (~30KB). الـ agent بـ يستخدمها مع الرد لو العميل سأل عن الموديل ده.
              {imageBusy && <span style={{color:T.warn, marginInlineStart:6}}>⏳ بـ يـcompress...</span>}
              {image && (
                <span style={{display:"block", marginTop:4}}>
                  <Btn ghost small onClick={()=>setImage(null)}>🗑 إزالة الصورة</Btn>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Section: Specs */}
        <h4 style={{margin:"4px 0 10px", fontSize:FS, color:T.textSec, fontWeight:700}}>المواصفات</h4>
        <div style={{display:"grid", gridTemplateColumns: isMob?"1fr":"1fr 1fr", gap:14, marginBottom:14}}>
          <div>
            <label style={fld}>المقاسات</label>
            <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:6,minHeight:28}}>
              {sizes.map((s,i)=>(
                <span key={i} style={tagStyle}>{s}<span onClick={()=>setSizes(sizes.filter((_,j)=>j!==i))} style={{cursor:"pointer",color:T.err,fontWeight:800}}>✕</span></span>
              ))}
            </div>
            <div style={{display:"flex",gap:6}}>
              <Inp value={newSize} onChange={setNewSize} placeholder="مثال: 8"/>
              <Btn primary small onClick={()=>{const v=newSize.trim();if(v){setSizes([...sizes,v]);setNewSize("");}}}>+</Btn>
            </div>
          </div>
          <div>
            <label style={fld}>الألوان</label>
            <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:6,minHeight:28}}>
              {colors.map((c,i)=>(
                <span key={i} style={tagStyle}>{c}<span onClick={()=>setColors(colors.filter((_,j)=>j!==i))} style={{cursor:"pointer",color:T.err,fontWeight:800}}>✕</span></span>
              ))}
            </div>
            <div style={{display:"flex",gap:6}}>
              <Inp value={newColor} onChange={setNewColor} placeholder="مثال: أزرق"/>
              <Btn primary small onClick={()=>{const v=newColor.trim();if(v){setColors([...colors,v]);setNewColor("");}}}>+</Btn>
            </div>
          </div>
        </div>

        <div style={{marginBottom:14}}>
          <label style={fld}>الأقمشة المستخدمة</label>
          <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:6}}>
            {fabrics.map(f => {
              const checked = productFabrics.includes(f.name);
              return (
                <label key={f.id} style={{
                  ...tagStyle,
                  background: checked ? "#10B98115" : T.bg,
                  borderColor: checked ? "#10B98140" : T.brd,
                  cursor:"pointer", color: checked ? "#059669" : T.text,
                }}>
                  <input type="checkbox" checked={checked} onChange={e=>{
                    if (e.target.checked) setProductFabrics([...productFabrics, f.name]);
                    else setProductFabrics(productFabrics.filter(x => x !== f.name));
                  }} style={{margin:0}}/>
                  {f.name}
                </label>
              );
            })}
            {fabrics.length === 0 && <span style={{fontSize:FS-2,color:T.textMut,fontStyle:"italic"}}>(لا يوجد أقمشة في الإعدادات. أضفها من tab الإعدادات أولاً.)</span>}
          </div>
        </div>

        {/* Section: Pricing */}
        <h4 style={{margin:"4px 0 10px", fontSize:FS, color:T.textSec, fontWeight:700}}>السعر والكميات</h4>
        <div style={{display:"grid", gridTemplateColumns: isMob?"1fr":"1fr 1fr", gap:10, marginBottom:14}}>
          <div>
            <label style={fld}>سعر الجملة (ج)</label>
            <Inp type="number" value={priceWholesale} onChange={setPriceWholesale} placeholder="320"/>
          </div>
          <div>
            <label style={fld}>الحد الأدنى للطلب (قطعة)</label>
            <Inp type="number" value={minOrderQty} onChange={setMinOrderQty} placeholder="50"/>
          </div>
        </div>

        {/* Tags + notes */}
        <div style={{marginBottom:14}}>
          <label style={fld}>Tags (للبحث)</label>
          <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:6}}>
            {tags.map((t,i)=>(
              <span key={i} style={tagStyle}>{t}<span onClick={()=>setTags(tags.filter((_,j)=>j!==i))} style={{cursor:"pointer",color:T.err,fontWeight:800}}>✕</span></span>
            ))}
          </div>
          <div style={{display:"flex",gap:6}}>
            <Inp value={newTag} onChange={setNewTag} placeholder="مثال: شتوي، صوف، كاب"/>
            <Btn primary small onClick={()=>{const v=newTag.trim();if(v){setTags([...tags,v]);setNewTag("");}}}>+</Btn>
          </div>
        </div>

        <div style={{marginBottom:14}}>
          <label style={fld}>ملاحظات (داخلية)</label>
          <Inp value={notes} onChange={setNotes} placeholder="مثال: خامة صوف 80%، إنتاج كميات أسبوع"/>
        </div>

        <div style={{display:"flex",gap:10,justifyContent:"flex-end",paddingTop:10,borderTop:`1px solid ${T.brd}`}}>
          <Btn ghost onClick={onClose}>إلغاء</Btn>
          <Btn primary onClick={handleSave}>💾 حفظ الموديل</Btn>
        </div>
      </div>
    </div>
  );
}

function CatalogImportModal({ data, existingCodes, onImport, onClose, isMob }){
  /* Discover unique models from data.orders (the orders array merged from
     seasons/{s}/orders/ subcollection by App.jsx). Each order has a/b/c/d/e
     model groups. Surface unique {code, name, season} not yet in catalog. */
  const orders = data?.orders || [];
  const activeSeason = data?.activeSeason || null;

  /* V19.76 fix: orders in CLARK have ONE model each at the top level —
     `o.modelNo` (the code) + `o.modelDesc` (the name/description). The
     A/B/C/D/E suffixes (fabricA, colorsA, etc.) are for FABRICS, not
     separate models per order. */
  const discovered = useMemo(() => {
    const map = new Map();
    for (const o of orders) {
      const code = String(o.modelNo || "").trim();
      const name = String(o.modelDesc || o.modelNo || "").trim();
      if (!code || !name) continue;
      if (existingCodes.has(code)) continue;
      if (!map.has(code)) {
        map.set(code, {
          code,
          name,
          season: o.season || activeSeason || null,
          seenInOrders: 0,
          sizes: new Set(),
          colors: new Set(),
          sellPrice: null,/* V21.9.234: سعر البيع للعميل */
          image: "",
        });
      }
      const entry = map.get(code);
      entry.seenInOrders++;
      /* V21.9.234: سعر البيع للعميل (آخر سعر غير صفري) + صورة الموديل */
      if (Number(o.sellPrice) > 0) entry.sellPrice = Number(o.sellPrice);
      if (!entry.image && o.image) entry.image = o.image;
      /* Sizes — orders have a sizeLabel like "6-8-10-12" — split into individual sizes */
      if (o.sizeLabel) {
        const parts = String(o.sizeLabel).split(/[-/،,]+/).map(s => s.trim()).filter(Boolean);
        for (const p of parts) entry.sizes.add(p);
      }
      /* Colors — V21.9.234 FIX: اقرأ من كل خانات الخامات A→H والاسم الصح `c.color`
         (كان `c.name` = undefined دايماً فالألوان مكانتش بتتسورد خالص — CLAUDE.md §4). */
      for (const k of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
        const colorsArr = o["colors" + k];
        if (Array.isArray(colorsArr)) {
          for (const c of colorsArr) {
            const cn = (typeof c === "string" ? c : (c?.color || "")).trim();
            if (cn) entry.colors.add(cn);
          }
        }
      }
    }
    return Array.from(map.values())
      .map(e => ({
        ...e,
        sizes: Array.from(e.sizes),
        colors: Array.from(e.colors),
      }))
      .sort((a, b) => b.seenInOrders - a.seenInOrders);
  }, [orders, existingCodes, activeSeason]);

  const [selected, setSelected] = useState(new Set());

  const toggle = (code) => {
    const next = new Set(selected);
    if (next.has(code)) next.delete(code); else next.add(code);
    setSelected(next);
  };
  const selectAll = () => setSelected(new Set(discovered.map(d => d.code)));
  const selectNone = () => setSelected(new Set());

  const doImport = () => {
    const items = discovered
      .filter(d => selected.has(d.code))
      .map(d => ({
        code: d.code,
        name: d.name,
        category: "ولادي",/* default — admin edits later */
        season: d.season || null,
        sizes: d.sizes,
        colors: d.colors,/* V19.76 fix — was missing */
        fabrics: [],
        priceWholesale: d.sellPrice || null,/* V21.9.234: سعر البيع للعميل (من الأوردر) */
        image: d.image || "",/* V21.9.234: صورة الموديل من الأوردر */
        minOrderQty: null,
        inStock: true,
        tags: [],
      }));
    if (items.length === 0) { showToast("⚠️ ما اخترتش حاجة"); return; }
    onImport(items);
  };

  return (
    <div onClick={onClose} style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,0.5)",
      zIndex:99998, display:"flex", alignItems:"flex-start", justifyContent:"center",
      padding:isMob?8:24, overflow:"auto",
    }}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:T.cardSolid, borderRadius:16, padding: isMob?14:24,
        width:"100%", maxWidth:720, marginTop: isMob?8:24, marginBottom: isMob?8:24,
        boxShadow:"0 20px 60px rgba(0,0,0,0.3)", direction:"rtl",
      }}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18}}>
          <h2 style={{margin:0, fontSize:FS+4, fontWeight:800, color:T.text}}>
            📥 استيراد من الأوامر
          </h2>
          <Btn ghost small onClick={onClose}>✕</Btn>
        </div>
        <div style={{fontSize:FS-1, color:T.textSec, marginBottom:14, lineHeight:1.6}}>
          الـ system بحث في الأوامر السابقة ولاقى <strong>{discovered.length}</strong> موديل مش موجود في الكتالوج. اختار اللي عاوزه + اضغط استيراد. تقدر تـedit التفاصيل (صور، أسعار، ألوان) بعد الإضافة.
        </div>

        {discovered.length === 0 ? (
          <div style={{textAlign:"center", padding:"40px 20px", color:T.textMut}}>
            <div style={{fontSize:48, marginBottom:10, opacity:0.5}}>🎉</div>
            <div style={{fontSize:FS}}>كل الموديلات في الأوامر موجودة بالفعل في الكتالوج.</div>
          </div>
        ) : (
          <>
            <div style={{display:"flex", gap:10, marginBottom:10, flexWrap:"wrap"}}>
              <Btn ghost small onClick={selectAll}>اختار الكل ({discovered.length})</Btn>
              <Btn ghost small onClick={selectNone}>الغ التحديد</Btn>
              <span style={{fontSize:FS-1, color:T.textSec, marginInlineStart:"auto", alignSelf:"center"}}>
                مختار: {selected.size}
              </span>
            </div>
            <div style={{maxHeight:380, overflowY:"auto", border:`1px solid ${T.brd}`, borderRadius:10, padding:8}}>
              {discovered.map(d => (
                <label key={d.code} style={{
                  display:"flex", alignItems:"center", gap:10,
                  padding:"8px 12px", borderRadius:8,
                  background: selected.has(d.code) ? "#10B98108" : "transparent",
                  border:`1px solid ${selected.has(d.code) ? "#10B98130" : "transparent"}`,
                  marginBottom:4, cursor:"pointer",
                }}>
                  <input type="checkbox" checked={selected.has(d.code)} onChange={()=>toggle(d.code)} style={{width:18,height:18}}/>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontSize:FS, fontWeight:800, color:T.text}}>
                      <code style={{fontSize:FS-1, color:T.textMut, marginInlineEnd:8}}>{d.code}</code>
                      {d.name}
                    </div>
                    <div style={{fontSize:FS-2, color:T.textMut, marginTop:2}}>
                      {d.season ? `موسم ${d.season} · ` : ""}
                      ظهر في {d.seenInOrders} أمر
                      {d.sizes.length > 0 && ` · مقاسات: ${d.sizes.join("/")}`}
                      {d.colors.length > 0 && ` · ألوان: ${d.colors.join("، ")}`}
                      {d.sellPrice ? ` · 💰 سعر البيع: ${d.sellPrice} ج` : ""}
                    </div>
                  </div>
                </label>
              ))}
            </div>
            <div style={{display:"flex", gap:10, justifyContent:"flex-end", marginTop:14, paddingTop:10, borderTop:`1px solid ${T.brd}`}}>
              <Btn ghost onClick={onClose}>إلغاء</Btn>
              <Btn primary onClick={doImport} disabled={selected.size === 0}>📥 استيراد {selected.size}</Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
