/* ═══════════════════════════════════════════════════════════════════════
   CLARK · AIAgentPg.jsx (V19.71.0 — Phase A: Foundation)
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

   Phase A scope (this version):
     • 9-tab shell with header + master power toggle + status pill
     • 3 fully functional tabs:
         - 🎭 Personality   (edit name/tone/style/system prompt)
         - 📚 FAQs          (CRUD + categories + phrasings + variables)
         - ⏰ Schedule       (per-day hours + holidays + off-hours behavior)
     • 6 placeholder tabs (clear "Coming in Phase B/C" message):
         - 📊 Dashboard / 🛠 Tools / 💬 Conversation Logs / 🧪 Sandbox /
           🎯 Customer Funnel / 👥 Customer Profiles

   READ-ONLY by design (per spec):
     The agent must never write to CLARK collections (customers, orders,
     etc.). It writes only to `aiAgent*` collections. This page enforces
     nothing at runtime — that constraint lives in the agent backend's
     Firestore wrapper. CLARK config is an instruction sheet, not a
     security boundary.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
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

const TABS = [
  { key: "dashboard", label: "لوحة التحكم", icon: "📊", phase: "B" },
  { key: "personality", label: "الشخصية", icon: "🎭", phase: "A" },
  { key: "faqs", label: "الأسئلة المتكررة", icon: "📚", phase: "A" },
  { key: "tools", label: "الأدوات", icon: "🛠", phase: "B" },
  { key: "schedule", label: "الجدول الزمني", icon: "⏰", phase: "A" },
  { key: "logs", label: "سجل المحادثات", icon: "💬", phase: "B" },
  { key: "sandbox", label: "اختبار", icon: "🧪", phase: "B" },
  { key: "funnel", label: "مراحل العميل", icon: "🎯", phase: "C" },
  { key: "profiles", label: "ملفات العملاء", icon: "👥", phase: "C" },
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
            {t.phase !== "A" && (
              <span className={"phase-pill phase-"+t.phase}>Phase {t.phase}</span>
            )}
          </div>
        ))}
      </div>

      {/* ═══ TAB CONTENT ═══ */}
      <div>
        {tab==="dashboard"   && <PlaceholderTab title="لوحة التحكم" icon="📊" phase="B" desc="إحصائيات حية، KPIs، تكلفة الـ APIs، الموضوعات الأكثر، live counters."/>}
        {tab==="personality" && <PersonalityTab agent={agent} updateAgent={updateAgent} canEdit={canEdit} isMob={isMob}/>}
        {tab==="faqs"        && <FaqsTab agent={agent} updateAgent={updateAgent} canEdit={canEdit} isMob={isMob}/>}
        {tab==="tools"       && <PlaceholderTab title="الأدوات (READ-ONLY)" icon="🛠" phase="B" desc="تفعيل/تعطيل tools الـ agent: search_products، get_customer_balance، notify_sales_team، escalate_to_human، إلخ."/>}
        {tab==="schedule"    && <ScheduleTab agent={agent} updateAgent={updateAgent} canEdit={canEdit} isMob={isMob}/>}
        {tab==="logs"        && <PlaceholderTab title="سجل المحادثات" icon="💬" phase="B" desc="عرض كل محادثات الـ Agent مع العملاء، فلترة بالـ stage/tier، تصدير، تدريب من الأخطاء."/>}
        {tab==="sandbox"     && <PlaceholderTab title="اختبار الـ Agent" icon="🧪" phase="B" desc="مكان آمن لتجربة الـ Agent بدون إرسال رسائل واتساب فعلية. يعرض الـ trace الداخلي."/>}
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
        💡 Phase A الحالي بـيـركز على الأساسيات: الشخصية + الأسئلة المتكررة + الجدول الزمني — اللي بتـحتاجها قبل ما الـ backend يطلع.
      </div>
    </div>
  );
}
