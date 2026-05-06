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
import { Btn, Card, Inp, Sel } from "../components/ui.jsx";
import { T } from "../theme.js";
import { FS, INIT_CONFIG } from "../constants/index.js";
import { gid } from "../utils/format.js";
import { showToast, ask } from "../utils/popups.js";

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

/* V19.72: Tabs without `phase` are shipped (Phase A or B). Tabs with `phase`
   show a small badge so the user knows what's coming. */
const TABS = [
  { key: "dashboard",   label: "لوحة التحكم",        icon: "📊" },
  { key: "personality", label: "الشخصية",            icon: "🎭" },
  { key: "faqs",        label: "الأسئلة المتكررة",   icon: "📚" },
  { key: "tools",       label: "الأدوات",            icon: "🛠" },
  { key: "schedule",    label: "الجدول الزمني",      icon: "⏰" },
  { key: "logs",        label: "سجل المحادثات",      icon: "💬" },
  { key: "sandbox",     label: "اختبار",             icon: "🧪" },
  { key: "funnel",      label: "مراحل العميل",       icon: "🎯", phase: "C" },
  { key: "profiles",    label: "ملفات العملاء",      icon: "👥", phase: "C" },
];

/* ────────────────────────────────────────────────────────────
   MAIN PAGE
   ──────────────────────────────────────────────────────────── */
export function AIAgentPg({ data, upConfig, isMob, canEdit, user }){
  const [tab, setTab] = useState("personality");

  /* Defensive read — config might not have aiAgent yet (older deployments). */
  const agent = data?.aiAgent || DEFAULT_AGENT;

  const updateAgent = (mutator) => {
    if (!canEdit) { showToast("ليس لديك صلاحية التعديل"); return; }
    upConfig(d => {
      if (!d.aiAgent) d.aiAgent = JSON.parse(JSON.stringify(DEFAULT_AGENT));
      mutator(d.aiAgent);
    });
  };

  const togglePower = () => {
    updateAgent(a => { a.enabled = !a.enabled; });
    showToast(agent.enabled ? "🛑 تم إيقاف الـ Agent" : "✅ تم تشغيل الـ Agent");
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
              مساعد كلارك الذكي على واتساب — Phase A scaffold (V19.71.0)
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
          </div>
        ))}
      </div>

      {/* ═══ TAB CONTENT ═══ */}
      <div>
        {tab==="dashboard"   && <DashboardTab agent={agent} data={data} isMob={isMob}/>}
        {tab==="personality" && <PersonalityTab agent={agent} updateAgent={updateAgent} canEdit={canEdit} isMob={isMob}/>}
        {tab==="faqs"        && <FaqsTab agent={agent} updateAgent={updateAgent} canEdit={canEdit} isMob={isMob}/>}
        {tab==="tools"       && <ToolsTab agent={agent} updateAgent={updateAgent} canEdit={canEdit} isMob={isMob}/>}
        {tab==="schedule"    && <ScheduleTab agent={agent} updateAgent={updateAgent} canEdit={canEdit} isMob={isMob}/>}
        {tab==="logs"        && <LogsTab agent={agent} data={data} isMob={isMob}/>}
        {tab==="sandbox"     && <SandboxTab agent={agent} data={data} isMob={isMob}/>}
        {tab==="funnel"      && <PlaceholderTab title="مراحل العميل" icon="🎯" phase="C" desc="Customer lifecycle pipeline: Stranger → Awareness → Interest → Decision → Customer → Repeat → Dormant."/>}
        {tab==="profiles"    && <PlaceholderTab title="ملفات العملاء" icon="👥" phase="C" desc="AI Profile لكل عميل: تفضيلات، tier، stage history، observations pending review."/>}
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
    showToast("✓ تم الحفظ");
  };

  const delFaq = async (id) => {
    const ok = await ask("حذف هذا السؤال؟");
    if (!ok) return;
    updateAgent(a => { a.faqs = (a.faqs||[]).filter(f => f.id !== id); });
    showToast("🗑 تم الحذف");
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
  const [newHoliday, setNewHoliday] = useState({ name:"", from:"", to:"" });

  const setSch = (key, val) => updateAgent(a => {
    if (!a.schedule) a.schedule = JSON.parse(JSON.stringify(DEFAULT_AGENT.schedule));
    a.schedule[key] = val;
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
    showToast("✓ تمت الإضافة");
  };

  const delHoliday = (id) => updateAgent(a => {
    if (!a.schedule?.holidays) return;
    a.schedule.holidays = a.schedule.holidays.filter(h => h.id !== id);
  });

  const cardStyle = { background:T.cardSolid, border:`1px solid ${T.brd}`, borderRadius:14, padding: isMob?14:18, marginBottom:14 };
  const fieldStyle = { fontSize:FS-1, fontWeight:700, color:T.textSec, marginBottom:6, display:"block" };

  return (
    <div>
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
   DASHBOARD TAB (V19.72) — KPIs + chart + cost
   The agent backend writes daily aggregates to
   data.aiAgentAnalytics[YYYY-MM-DD]. Until it ships, those are
   empty — render zeros + clear empty-state hint.
   ════════════════════════════════════════════════════════════ */
function DashboardTab({ agent, data, isMob }){
  const [range, setRange] = useState("today");/* today | 7d | 30d */
  const analytics = data?.aiAgentAnalytics || {};

  /* Build last-N-days array of keys (oldest first) */
  const days = useMemo(() => {
    const n = range === "today" ? 1 : range === "7d" ? 7 : 30;
    const out = [];
    const today = new Date(); today.setHours(0,0,0,0);
    for (let i = n-1; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0,10);
      const label = d.toLocaleDateString("ar-EG", { month: "numeric", day: "numeric" });
      out.push({ key, label, ...(analytics[key] || {}) });
    }
    return out;
  }, [range, analytics]);

  const totals = useMemo(() => days.reduce((acc, d) => ({
    conversations:    acc.conversations    + (d.conversations_count    || 0),
    messages:         acc.messages         + (d.messages_count         || 0),
    voice:            acc.voice            + (d.voice_messages_count   || 0),
    images:           acc.images           + (d.image_messages_count   || 0),
    escalations:      acc.escalations      + (d.escalations_count      || 0),
    salesNotifs:      acc.salesNotifs      + (d.sales_notifications_sent || 0),
    salesConv:        acc.salesConv        + (d.sales_conversions      || 0),
    uniqueCustomers:  acc.uniqueCustomers  + (d.unique_customers       || 0),
    cost:             acc.cost             + (d.cost_usd_anthropic||0) + (d.cost_usd_whisper||0) + (d.cost_usd_vision||0),
    avgResp:          (d.avg_response_time_ms || 0),/* last day's avg */
    csat:             (d.avg_satisfaction || 0),
  }), { conversations:0, messages:0, voice:0, images:0, escalations:0, salesNotifs:0, salesConv:0, uniqueCustomers:0, cost:0, avgResp:0, csat:0 }), [days]);

  const chartData = days.map(d => ({
    name: d.label,
    محادثات: d.conversations_count || 0,
    تحويلات: d.escalations_count   || 0,
  }));

  const hasAnyData = totals.conversations + totals.escalations + totals.cost > 0;

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
      {!hasAnyData && (
        <div style={{
          padding:"14px 18px", marginBottom:14, borderRadius:12,
          background:"#FEF3C7", border:"1px solid #FCD34D",
          display:"flex", alignItems:"center", gap:12, flexWrap:"wrap",
        }}>
          <span style={{fontSize:28}}>⏳</span>
          <div style={{flex:1, minWidth:200}}>
            <div style={{fontSize:FS, fontWeight:800, color:"#92400E"}}>الـ Agent لسه مش بيـولّد بيانات</div>
            <div style={{fontSize:FS-1, color:"#78350F", marginTop:2, lineHeight:1.5}}>
              الـ backend (Phase D) لما يبني هيـكتب الإحصائيات في `aiAgentAnalytics/`. حالياً الكروت بـ0 — ده طبيعي.
            </div>
          </div>
        </div>
      )}

      {/* KPI grid */}
      <div style={{display:"grid", gridTemplateColumns: isMob?"1fr 1fr":"repeat(4, 1fr)", gap:10, marginBottom:14}}>
        <KpiCard icon="💬" label="محادثات" value={totals.conversations} color="#0EA5E9"/>
        <KpiCard icon="📨" label="رسائل"  value={totals.messages}      color="#10B981"/>
        <KpiCard icon="🆘" label="تحويلات لبشري" value={totals.escalations} color="#EF4444"/>
        <KpiCard icon="💰" label="تكلفة (USD)" value={totals.cost.toFixed(2)} color="#8B5CF6"/>
      </div>
      <div style={{display:"grid", gridTemplateColumns: isMob?"1fr 1fr":"repeat(4, 1fr)", gap:10, marginBottom:14}}>
        <KpiCard icon="🔔" label="إشعارات مبيعات" value={totals.salesNotifs} color="#F59E0B"/>
        <KpiCard icon="✅" label="طلبات أُكدت"   value={totals.salesConv}   color="#059669"/>
        <KpiCard icon="🎤" label="رسائل صوتية"   value={totals.voice}       color="#06B6D4"/>
        <KpiCard icon="📷" label="صور"           value={totals.images}      color="#EC4899"/>
      </div>

      {/* Chart */}
      <div style={cardStyle}>
        <h3 style={{margin:"0 0 14px",fontSize:FS+1,fontWeight:800,color:T.text}}>📈 المحادثات والتحويلات</h3>
        <div style={{width:"100%", height: isMob?180:240}}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.brd}/>
              <XAxis dataKey="name" tick={{ fill: T.textSec, fontSize: FS-2 }}/>
              <YAxis allowDecimals={false} tick={{ fill: T.textSec, fontSize: FS-2 }}/>
              <Tooltip contentStyle={{ background: T.cardSolid, border: `1px solid ${T.brd}`, borderRadius: 8, fontSize: FS-1 }}/>
              <Bar dataKey="محادثات" fill="#8B5CF6" radius={[4,4,0,0]}/>
              <Bar dataKey="تحويلات" fill="#EF4444" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Cost breakdown + secondary KPIs */}
      <div style={{display:"grid", gridTemplateColumns: isMob?"1fr":"1fr 1fr", gap:14}}>
        <div style={cardStyle}>
          <h3 style={{margin:"0 0 14px",fontSize:FS+1,fontWeight:800,color:T.text}}>💰 توزيع التكلفة</h3>
          <CostRow label="Anthropic (Claude)" value={days.reduce((s,d)=>s+(d.cost_usd_anthropic||0),0)} color="#8B5CF6"/>
          <CostRow label="OpenAI (Whisper)"   value={days.reduce((s,d)=>s+(d.cost_usd_whisper||0),0)}   color="#10B981"/>
          <CostRow label="Claude Vision"      value={days.reduce((s,d)=>s+(d.cost_usd_vision||0),0)}    color="#EC4899"/>
          <div style={{marginTop:10, paddingTop:10, borderTop:`2px solid ${T.brd}`, display:"flex", justifyContent:"space-between", fontSize:FS, fontWeight:800}}>
            <span>الإجمالي</span>
            <span>${totals.cost.toFixed(3)}</span>
          </div>
        </div>
        <div style={cardStyle}>
          <h3 style={{margin:"0 0 14px",fontSize:FS+1,fontWeight:800,color:T.text}}>⚡ مؤشرات سريعة</h3>
          <KpiRow label="عملاء مختلفين"       value={totals.uniqueCustomers}/>
          <KpiRow label="متوسط زمن الرد"       value={totals.avgResp ? `${(totals.avgResp/1000).toFixed(2)} ث` : "—"}/>
          <KpiRow label="رضا العميل"           value={totals.csat ? `${totals.csat.toFixed(1)} / 5` : "—"}/>
          <KpiRow label="معدل التحويل"         value={totals.conversations ? `${((totals.escalations/totals.conversations)*100).toFixed(0)}%` : "—"}/>
          <KpiRow label="معدل تأكيد الطلبات"   value={totals.salesNotifs ? `${((totals.salesConv/totals.salesNotifs)*100).toFixed(0)}%` : "—"}/>
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

function CostRow({ label, value, color }){
  return (
    <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", padding:"6px 0", fontSize:FS-1}}>
      <span style={{display:"flex", alignItems:"center", gap:8, color:T.textSec}}>
        <span style={{width:10,height:10,borderRadius:"50%",background:color,display:"inline-block"}}/>
        {label}
      </span>
      <span style={{fontWeight:700, color:T.text, fontVariantNumeric:"tabular-nums"}}>${value.toFixed(3)}</span>
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
   CONVERSATION LOGS TAB (V19.72)
   Reads from data.aiAgentConversations (empty until backend ships).
   Shows filter bar + empty state with mock card structure preview.
   ════════════════════════════════════════════════════════════ */
function LogsTab({ agent, data, isMob }){
  const conversations = data?.aiAgentConversations || [];
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations.filter(c => {
      if (statusFilter === "escalated" && !c.escalated) return false;
      if (statusFilter === "resolved"  &&  c.escalated) return false;
      if (!q) return true;
      const hay = [c.customer_name, c.phone, c.last_message, ...(c.messages||[]).map(m=>m.text)].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [conversations, search, statusFilter]);

  const cardStyle = { background:T.cardSolid, border:`1px solid ${T.brd}`, borderRadius:14, padding: isMob?14:18, marginBottom:14 };

  return (
    <div>
      <div style={{...cardStyle, display:"flex", flexWrap:"wrap", gap:10, alignItems:"center"}}>
        <div style={{flex:"1 1 240px", minWidth:200}}>
          <Inp value={search} onChange={setSearch} placeholder="🔍 بحث: اسم/تليفون/كلمة..."/>
        </div>
        <div style={{flex:"0 0 180px", minWidth:140}}>
          <Sel value={statusFilter} onChange={setStatusFilter}>
            <option value="">كل الحالات</option>
            <option value="resolved">تم الحل (الـ Agent)</option>
            <option value="escalated">حُوّل لبشري</option>
          </Sel>
        </div>
      </div>

      <div style={{display:"flex", gap:10, marginBottom:14, flexWrap:"wrap"}}>
        <StatPill label="إجمالي" value={conversations.length} color="#0EA5E9"/>
        <StatPill label="ظاهر" value={filtered.length} color="#10B981"/>
        <StatPill label="حُوّل" value={conversations.filter(c=>c.escalated).length} color="#EF4444"/>
      </div>

      {filtered.length === 0 ? (
        <div style={{...cardStyle, textAlign:"center", padding:"50px 24px"}}>
          <div style={{fontSize:56, marginBottom:14, opacity:0.5}}>💬</div>
          <div style={{fontSize:FS+3, fontWeight:800, color:T.text, marginBottom:6}}>
            {conversations.length === 0 ? "مفيش محادثات لسه" : "مفيش نتائج بالفلتر"}
          </div>
          <div style={{fontSize:FS-1, color:T.textMut, marginBottom:14, maxWidth:480, margin:"0 auto 14px", lineHeight:1.6}}>
            {conversations.length === 0
              ? "لما الـ Agent backend يبني (Phase D) ويبدأ يـrespond على واتساب، كل محادثة هتـكتب في `aiAgentConversations` وتظهر هنا. هتقدر تـreview، تـsearch، وتـtrain من الـ logs."
              : "غيّر شروط البحث أو الفلتر."}
          </div>
          {conversations.length === 0 && (
            <div style={{
              maxWidth:480, margin:"20px auto 0", padding:"12px 16px",
              background:T.bg, borderRadius:10, border:`1px dashed ${T.brd}`,
              fontSize:FS-2, color:T.textSec, textAlign:"right", lineHeight:1.7,
            }}>
              <strong style={{color:T.text}}>📋 شكل كل محادثة لما تـسجَّل:</strong><br/>
              • اسم العميل + رقم تليفون + tier + stage<br/>
              • الـ messages (timestamps + من + النص)<br/>
              • الـ tools اللي اتـcalled<br/>
              • التكلفة بالـ tokens<br/>
              • هل اتـحوّلت لبشري؟ الـ reason؟<br/>
              • تقييم العميل (CSAT)
            </div>
          )}
        </div>
      ) : (
        <div style={{display:"grid", gap:10}}>
          {filtered.slice(0, 50).map(c => (
            <ConversationCard key={c.id || c.conversation_id} conv={c}/>
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

function ConversationCard({ conv }){
  const [open, setOpen] = useState(false);
  const c = conv;
  return (
    <div style={{background:T.cardSolid, border:`1px solid ${T.brd}`, borderRadius:12, padding:12}}>
      <div onClick={()=>setOpen(!open)} style={{cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10, flexWrap:"wrap"}}>
        <div style={{flex:1, minWidth:200}}>
          <div style={{fontSize:FS, fontWeight:800, color:T.text}}>
            👤 {c.customer_name || c.phone || "(مجهول)"}
            {c.tier_at_start && <span style={{fontSize:FS-2, color:T.textMut, fontWeight:600, marginInlineStart:8}}>· {c.tier_at_start}</span>}
          </div>
          <div style={{fontSize:FS-1, color:T.textSec, marginTop:4, lineHeight:1.5,
            display:"-webkit-box", WebkitLineClamp:1, WebkitBoxOrient:"vertical", overflow:"hidden"}}>
            {c.last_message || (c.messages?.[c.messages.length-1]?.text) || "(فاضي)"}
          </div>
        </div>
        <div style={{display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4, flexShrink:0}}>
          <span style={{
            fontSize:FS-3, padding:"2px 8px", borderRadius:8, fontWeight:700,
            background: c.escalated ? "#FEE2E2" : "#D1FAE5",
            color: c.escalated ? "#991B1B" : "#065F46",
          }}>{c.escalated ? "🆘 حُوّل" : "✅ تم"}</span>
          <span style={{fontSize:FS-3, color:T.textMut}}>
            {(c.messages?.length || 0)} رسالة
          </span>
        </div>
      </div>
      {open && (c.messages||[]).length > 0 && (
        <div style={{marginTop:10, paddingTop:10, borderTop:`1px solid ${T.brd}`, maxHeight:300, overflow:"auto"}}>
          {c.messages.map((m, i) => (
            <div key={i} style={{
              padding:"6px 10px", marginBottom:4, borderRadius:8,
              background: m.from === "agent" ? "#8B5CF608" : T.bg,
              fontSize:FS-1, color:T.text,
            }}>
              <strong style={{color: m.from === "agent" ? "#7C3AED" : T.textSec, fontSize:FS-2}}>
                {m.from === "agent" ? "🤖 Agent" : "👤 العميل"}
              </strong>
              <div style={{marginTop:2}}>{m.text}</div>
            </div>
          ))}
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

  const toolGroups = [
    {
      title: "📖 READ-ONLY (يقرأ فقط من Firestore)",
      color: "#0EA5E9",
      items: [
        { key:"get_customer_info",     label:"معلومات العميل",          desc:"اسم، عنوان، tier، تاريخ" },
        { key:"search_products",       label:"بحث في المنتجات",         desc:"الموديلات، الأسعار، المخزون", extras:[
          { field:"includePricing", label:"يعرض الأسعار", type:"bool" },
          { field:"includeStock",   label:"يعرض المخزون", type:"bool" },
          { field:"includeImages",  label:"يعرض الصور",   type:"bool" },
          { field:"maxResults",     label:"حد أقصى للنتائج", type:"number", suffix:"موديل" },
        ]},
        { key:"get_customer_balance",  label:"رصيد العميل",             desc:"الرصيد + آخر دفعة + الشيكات" },
        { key:"get_customer_orders",   label:"طلبات العميل",            desc:"آخر N طلبات + حالاتها" },
        { key:"get_order_details",     label:"تفاصيل طلب",              desc:"بنود، سعر، حالة، تتبع" },
        { key:"get_faq_answer",        label:"الأسئلة المتكررة",        desc:"يـmatch السؤال مع الـ FAQs" },
      ],
    },
    {
      title: "📄 GENERATE (يولّد PDF/links من بيانات موجودة)",
      color: "#8B5CF6",
      items: [
        { key:"generate_portal_link",   label:"لينك الـ portal",         desc:"يولّد URL مؤقت للـ customer portal", extras:[
          { field:"ttlHours", label:"مدة الصلاحية", type:"number", suffix:"ساعة" },
        ]},
        { key:"generate_statement_pdf", label:"كشف حساب PDF",            desc:"PDF كشف الحساب من بيانات Firestore", extras:[
          { field:"businessHoursOnly", label:"يعمل خلال ساعات العمل فقط", type:"bool" },
        ]},
      ],
    },
    {
      title: "🔔 NOTIFY (يبعت رسالة، ما يـكتبش في DB)",
      color: "#F59E0B",
      items: [
        { key:"notify_sales_team",          label:"إشعار فريق المبيعات",     desc:"⭐ بدلاً من create order. الفريق بـ يدخل الطلب يدوياً", extras:[
          { field:"maxValueBeforeManual", label:"الحد الأقصى قبل المراجعة اليدوية", type:"number", suffix:"ج" },
        ]},
        { key:"notify_admin_phone_request", label:"طلب إضافة رقم جديد",      desc:"بعد OTP verify، أدمن CLARK يضيف الرقم يدوياً", extras:[
          { field:"requiresOtp", label:"يحتاج OTP أولاً", type:"bool" },
        ]},
        { key:"escalate_to_human",          label:"تحويل لبشري",            desc:"بـ context كامل + آخر 5 رسائل" },
        { key:"send_otp",                   label:"إرسال OTP",               desc:"الكود في Redis، مش Firestore", extras:[
          { field:"ttlMin",      label:"مدة الصلاحية",    type:"number", suffix:"دقيقة" },
          { field:"maxAttempts", label:"حد المحاولات",     type:"number", suffix:"محاولة" },
        ]},
        { key:"verify_otp",                 label:"التحقق من OTP",           desc:"بـ يقرأ من Redis (read-only)" },
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
                        <div style={{fontSize:FS, fontWeight:800, color:T.text}}>
                          <code style={{fontSize:FS-1, padding:"1px 6px", borderRadius:5, background:T.bg, border:`1px solid ${T.brd}`, marginInlineEnd:8, fontFamily:"'Fira Code',monospace"}}>
                            {item.key}
                          </code>
                          {item.label}
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
