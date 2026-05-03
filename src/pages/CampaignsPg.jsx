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
};

/* Personalization variables — surface in template editor and substitute at send */
const VARIABLES = [
  { token: "{اسم}",        label: "اسم العميل",      example: "أحمد محمد" },
  { token: "{رصيد}",       label: "رصيد العميل (ج.م)", example: "1,250" },
  { token: "{آخر دفعة}",  label: "تاريخ آخر دفعة",  example: "2026-04-15" },
  { token: "{مبلغ آخر دفعة}", label: "مبلغ آخر دفعة", example: "500" },
  { token: "{عدد الأوردرات}", label: "عدد الأوردرات",  example: "12" },
  { token: "{رقم الجوال}", label: "رقم الجوال",      example: "01001234567" },
];

/* Smart segments — predefined audience filters */
const SEGMENTS = [
  { key: "all",             label: "كل العملاء",                              icon: "👥", needsParam: false },
  { key: "balance_due",     label: "عملاء عليهم متأخرات",                  icon: "💰", needsParam: true,  paramLabel: "الحد الأدنى للرصيد (ج.م)", paramDefault: 1000 },
  { key: "recent_delivery", label: "عملاء استلموا أوردر مؤخراً",          icon: "📦", needsParam: true,  paramLabel: "خلال آخر كم يوم؟",          paramDefault: 30 },
  { key: "inactive",        label: "عملاء لم يشتروا منذ مدة",             icon: "💤", needsParam: true,  paramLabel: "غير نشطين منذ كم يوم؟",     paramDefault: 90 },
  { key: "manual",          label: "اختيار يدوي",                              icon: "✏️", needsParam: false },
];

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
    .replace(/\{رقم الجوال\}/g, ctx.phone || "");
};

const todayStr = () => new Date().toISOString().slice(0,10);
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0,10);
};

/* Build audience array from a segment definition.
   V19.29: Automatically excludes customers in data.campaignBlocklist[] */
function buildAudience(data, segment){
  const customers = (data.customers||[]).filter(c => c.phone);
  /* V19.29: Apply blocklist */
  const blocked = new Set();
  (data.campaignBlocklist||[]).forEach(b => {
    if(b.id) blocked.add(b.id);
    if(b.phone) blocked.add(cleanPhone(b.phone));
  });
  const filterBlocked = (c) => !blocked.has(c.id) && !blocked.has(cleanPhone(c.phone));
  if(!segment || !segment.key)return [];

  if(segment.key === "all"){
    return customers.filter(filterBlocked).map(c => buildContext(c, data));
  }
  if(segment.key === "manual"){
    /* For manual, segment.params.ids is the explicit list */
    const ids = new Set(segment.params?.ids || []);
    return customers.filter(c => ids.has(c.id)).filter(filterBlocked).map(c => buildContext(c, data));
  }
  if(segment.key === "balance_due"){
    const minBal = Number(segment.params?.minBalance) || 0;
    return customers
      .filter(filterBlocked)
      .map(c => buildContext(c, data))
      .filter(c => (c.balance || 0) >= minBal);
  }
  if(segment.key === "recent_delivery"){
    const days = Number(segment.params?.days) || 30;
    const cutoff = daysAgo(days);
    return customers
      .filter(filterBlocked)
      .map(c => buildContext(c, data))
      .filter(c => c.lastDeliveryDate && c.lastDeliveryDate >= cutoff);
  }
  if(segment.key === "inactive"){
    const days = Number(segment.params?.days) || 90;
    const cutoff = daysAgo(days);
    return customers
      .filter(filterBlocked)
      .map(c => buildContext(c, data))
      .filter(c => !c.lastOrderDate || c.lastOrderDate < cutoff);
  }
  return [];
}

/* Build the personalization context for a customer */
function buildContext(cust, data){
  const analytics = analyzeCustomer(cust.id, data);
  const orders = (data.orders||[]).filter(o => o.custId === cust.id);
  let lastDeliveryDate = null, lastOrderDate = null;
  orders.forEach(o => {
    const oDate = o.poDate || o.createdAt?.slice(0,10);
    if(oDate && (!lastOrderDate || oDate > lastOrderDate))lastOrderDate = oDate;
    (o.deliveriesToCust||[]).forEach(d => {
      if(d.date && (!lastDeliveryDate || d.date > lastDeliveryDate))lastDeliveryDate = d.date;
    });
  });
  return {
    id: cust.id,
    name: cust.name || "العميل",
    phone: cust.phone || "",
    balance: analytics?.finance?.balance || 0,
    lastPaymentDate: analytics?.finance?.lastPaymentDate || "",
    lastPaymentAmount: analytics?.finance?.lastPaymentAmount || 0,
    orderCount: analytics?.sales?.orderCount || 0,
    lastDeliveryDate,
    lastOrderDate,
  };
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

    {/* Templates section */}
    <Card title={"📝 قوالب الرسائل ("+templates.length+"/"+MAX_TEMPLATES+")"} accent="#7C3AED">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <div style={{fontSize:FS-2,color:T.textSec}}>قوالب جاهزة للاستخدام في الحملات — تقدر تشخصن النصوص بمتغيرات زي {"{اسم}"} و {"{رصيد}"}</div>
        {canEdit && <Btn small onClick={() => { setEditingTpl(null); setMode("templateEdit"); }} style={{background:"#7C3AED12",color:"#7C3AED",border:"1px solid #7C3AED30"}}>+ قالب جديد</Btn>}
      </div>
      {templates.length === 0 ? <div style={{textAlign:"center",padding:24,color:T.textMut}}>
        لا توجد قوالب — ابدأ بإضافة قالب جديد للاستخدام في الحملات
      </div> : <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"repeat(auto-fill,minmax(280px,1fr))",gap:10}}>
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
          {t.imageUrl && <div style={{marginTop:6,fontSize:FS-3,color:"#7C3AED"}}>🖼 صورة مرفقة</div>}
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
  const bodyRef = useRef(null);

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
        <div style={{fontSize:FS-2,color:T.textSec,marginBottom:4}}>رابط صورة (اختياري — هيتضاف للنص)</div>
        <Inp value={imageUrl} onChange={setImageUrl} placeholder="https://..." disabled={!canEdit}/>
        <div style={{fontSize:FS-3,color:T.textMut,marginTop:4,lineHeight:1.6}}>
          ⚠️ واتساب لا يدعم إرفاق ملفات تلقائياً عبر الرابط. لو حطيت رابط صورة، هيتضاف للنص كرابط — العميل يضغط عليه يفتحه. لإرفاق صور حقيقية، الموظف لازم يرفعها يدوياً بعد ما واتساب يفتح.
        </div>
      </div>
    </Card>

    {/* Preview */}
    <Card title="معاينة (بمثال عميل افتراضي)" style={{marginTop:14}}>
      <div style={{padding:12,borderRadius:10,background:"#DCF8C6",color:"#000",fontSize:FS,whiteSpace:"pre-wrap",lineHeight:1.7,fontFamily:"inherit",maxWidth:400}}>
        {preview || <span style={{color:"#666",fontStyle:"italic"}}>اكتب نص الرسالة في الأعلى</span>}
        {imageUrl && preview && <div style={{marginTop:6,fontSize:FS-2,color:"#0E7490"}}>🖼 {imageUrl}</div>}
      </div>
      <div style={{marginTop:8,fontSize:FS-3,color:T.textMut}}>المعاينة باسم "أحمد محمد" ورصيد 1,250 ج.م — العميل الفعلي هيشوف بياناته الخاصة.</div>
    </Card>

    {canEdit && <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}>
      <Btn ghost onClick={onCancel}>إلغاء</Btn>
      <Btn primary disabled={!valid} onClick={() => onSave({id: tpl?.id, name: name.trim(), category, body: body.trim(), imageUrl: imageUrl.trim()})}>
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
  const [segParam, setSegParam] = useState(0);
  const [manualSelection, setManualSelection] = useState(new Set());
  const [searchQ, setSearchQ] = useState("");

  const segDef = SEGMENTS.find(s => s.key === segKey);
  useEffect(() => {
    if(segDef?.needsParam && !segParam)setSegParam(segDef.paramDefault || 30);
  }, [segKey, segDef]);

  const segment = useMemo(() => ({
    key: segKey,
    label: segDef?.label || "",
    params: segKey === "manual"
      ? { ids: Array.from(manualSelection) }
      : segDef?.needsParam
        ? (segKey === "balance_due" ? { minBalance: Number(segParam) } : { days: Number(segParam) })
        : {}
  }), [segKey, segDef, segParam, manualSelection]);

  const audience = useMemo(() => {
    if(!tpl)return [];
    return buildAudience(data, segment).slice(0, MAX_AUDIENCE);
  }, [data, segment, tpl]);

  const filteredCustomersForManual = useMemo(() => {
    const q = searchQ.toLowerCase().trim();
    return (data.customers||[])
      .filter(c => c.phone)
      .filter(c => !q || (c.name||"").toLowerCase().includes(q) || (c.phone||"").includes(q));
  }, [data.customers, searchQ]);

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

    {/* STEP 2 — Audience selection */}
    {step === 2 && <Card title="اختر الجمهور">
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

      {segDef?.needsParam && <div style={{marginBottom:14,padding:12,borderRadius:8,background:T.bg,border:"1px solid "+T.brd}}>
        <div style={{fontSize:FS-2,color:T.textSec,marginBottom:6}}>{segDef.paramLabel}</div>
        <Inp type="number" value={segParam} onChange={setSegParam} style={{width:160}}/>
      </div>}

      {segKey === "manual" && <div style={{marginBottom:14}}>
        <div style={{display:"flex",gap:8,marginBottom:8,alignItems:"center"}}>
          <Inp value={searchQ} onChange={setSearchQ} placeholder="🔍 ابحث بالاسم أو رقم الجوال..." style={{flex:1}}/>
          <span style={{fontSize:FS-2,color:T.textSec}}>{manualSelection.size} مختار</span>
        </div>
        <div style={{maxHeight:300,overflowY:"auto",border:"1px solid "+T.brd,borderRadius:8}}>
          {filteredCustomersForManual.slice(0, 200).map(c => <label key={c.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderBottom:"1px solid "+T.brd,cursor:"pointer",background:manualSelection.has(c.id)?T.accent+"08":"transparent"}}>
            <input type="checkbox" checked={manualSelection.has(c.id)} onChange={() => toggleManual(c.id)}/>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:FS-1}}>{c.name}</div>
              <div style={{fontSize:FS-3,color:T.textSec}}>{c.phone}</div>
            </div>
          </label>)}
          {filteredCustomersForManual.length === 0 && <div style={{padding:24,textAlign:"center",color:T.textMut}}>لا توجد نتائج</div>}
        </div>
      </div>}

      <div style={{padding:12,borderRadius:8,background:T.accent+"08",border:"1px solid "+T.accent+"25",fontSize:FS-1,color:T.accent,fontWeight:700}}>
        🎯 الجمهور المحدد: <span style={{fontSize:FS+2}}>{audience.length}</span> عميل
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
        <Stat label="عدد العملاء" value={audience.length} color={T.ok}/>
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
        items: it.map(x => ({id: x.id, name: x.name, phone: x.phone, status: x.status, sentAt: x.sentAt, skipNote: x.skipNote, customMessage: x.customMessage})),
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

  return <div style={{padding:16,maxWidth:900,margin:"0 auto"}}>
    {/* Header */}
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
function ChooseSendMode({campaign, bridgeUrl, bridgeToken, onCancel, onPickManual, onPickBridge, onOpenBridgeSettings}){
  const [bridgeStatus, setBridgeStatus] = useState({state:"checking", error:""});

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
    </Card>
  </div>;
}

/* ═══════════════════════════════════════════════════════════════════════
   V19.28: BRIDGE SETTINGS PAGE
   ═══════════════════════════════════════════════════════════════════════ */
function BridgeSettings({bridgeCfg, canEdit, onSave, onClose}){
  const [url, setUrl] = useState(bridgeCfg.url || DEFAULT_BRIDGE_URL);
  const [token, setToken] = useState(bridgeCfg.token || ""); /* V19.30 */
  const [enabled, setEnabled] = useState(bridgeCfg.enabled !== false);
  const [delayMin, setDelayMin] = useState(bridgeCfg.delayMin || 8);
  const [delayMax, setDelayMax] = useState(bridgeCfg.delayMax || 25);
  const [dailyCap, setDailyCap] = useState(bridgeCfg.dailyCap || 80);
  const [batchSize, setBatchSize] = useState(bridgeCfg.batchSize || 20);
  const [batchBreakMin, setBatchBreakMin] = useState(bridgeCfg.batchBreakMin || 4);
  const [batchBreakMax, setBatchBreakMax] = useState(bridgeCfg.batchBreakMax || 8);
  const [retryFailures, setRetryFailures] = useState(bridgeCfg.retryFailures !== false);
  const [detectOptOuts, setDetectOptOuts] = useState(bridgeCfg.detectOptOuts !== false);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const test = async () => {
    setTesting(true); setTestResult(null);
    try {
      const s = await bridge.status(url, token);
      setTestResult({ok: true, status: s});
      /* Push current settings to bridge */
      try {
        await bridge.settings(url, {
          delayMin: delayMin*1000, delayMax: delayMax*1000,
          dailyCap, batchSize,
          batchBreakMin: batchBreakMin*60*1000, batchBreakMax: batchBreakMax*60*1000,
          retryFailures, detectOptOuts,
        }, token);
      } catch {}
    } catch(e) {
      setTestResult({ok: false, error: e.message});
    }
    setTesting(false);
  };

  const save = () => {
    onSave({
      enabled, url, token,
      delayMin, delayMax, dailyCap, batchSize,
      batchBreakMin, batchBreakMax,
      retryFailures, detectOptOuts,
    });
  };

  return <div style={{padding:16,maxWidth:760,margin:"0 auto"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
      <h2 style={{margin:0,fontSize:FS+3,fontWeight:900,display:"flex",alignItems:"center",gap:8}}>
        <span>⚙️</span><span>إعدادات البريدج (الإرسال التلقائي)</span>
      </h2>
      <Btn ghost onClick={onClose}>✕</Btn>
    </div>

    <div style={{padding:12,borderRadius:10,background:T.warn+"10",border:"1px solid "+T.warn+"40",marginBottom:14,fontSize:FS-2,color:T.text,lineHeight:1.7}}>
      <b style={{color:T.warn}}>⚠️ تحذير قانوني:</b> الإرسال التلقائي مخالف لشروط استخدام WhatsApp.
      الرقم اللي بتربطه ممكن يتحظر. استخدم رقم احتياطي مش رقمك الشخصي. ابدأ بكميات صغيرة (10-20 رسالة) وراقب النتيجة قبل ما تكبّر.
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
        <div style={{fontSize:FS-3,color:T.textMut,marginTop:4}}>
          لو البريدج شغال على نفس الجهاز: <code>http://localhost:3001</code>.
          لو على VPS بـ HTTPS: <code>https://your-domain.duckdns.org</code> (الموصى به).
          لو على شبكة محلية: <code>http://192.168.x.x:3001</code>.
        </div>
      </div>
      {/* V19.30: Auth Token field */}
      <div style={{marginBottom:10}}>
        <div style={{fontSize:FS-2,color:T.textSec,marginBottom:4}}>🔐 Auth Token</div>
        <Inp value={token} onChange={setToken} placeholder="long-random-hex-string" disabled={!canEdit} type="password"/>
        <div style={{fontSize:FS-3,color:T.textMut,marginTop:4,lineHeight:1.6}}>
          الـ token اللي ولّده سكريبت <code>setup-vps.sh</code> على السيرفر. بيقفل البريدج بحيث مش أي حد يقدر يستخدمه. تقدر تلاقيه في ملف <code>.env</code> على السيرفر بأمر <code>cat .env</code>. خاليه فاضي بس لو شغال على localhost.
        </div>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <Btn onClick={test} disabled={testing||!url} style={{background:T.accent+"15",color:T.accent,border:"1px solid "+T.accent+"40"}}>
          {testing?"... يفحص":"🔍 اختبار الاتصال"}
        </Btn>
        {testResult?.ok && <span style={{color:T.ok,fontWeight:700,fontSize:FS-2}}>
          ✓ متصل · {testResult.status.waReady?"WhatsApp جاهز":"حالة WA: "+testResult.status.waState}
          {testResult.status.myName && " · "+testResult.status.myName}
        </span>}
        {testResult && !testResult.ok && <span style={{color:T.err,fontWeight:700,fontSize:FS-2}}>✕ فشل: {testResult.error}</span>}
      </div>
      {testResult?.ok && testResult.status.qr && <div style={{marginTop:12,padding:12,background:"#fff",borderRadius:8,textAlign:"center"}}>
        <div style={{fontSize:FS-2,color:"#000",fontWeight:700,marginBottom:8}}>امسح ده من واتساب → الإعدادات → الأجهزة المرتبطة</div>
        <img src={testResult.status.qr} alt="QR" style={{maxWidth:240,width:"100%"}}/>
      </div>}
    </Card>

    <Card title="⚙️ إعدادات الإرسال (Anti-Ban)" style={{marginTop:12}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
        <SettingInp label="أقل تأخير بين الرسايل (ثانية)" value={delayMin} onChange={v=>setDelayMin(Math.max(3,parseInt(v)||0))} disabled={!canEdit} hint="3 ثواني الحد الأدنى"/>
        <SettingInp label="أعلى تأخير (ثانية)" value={delayMax} onChange={v=>setDelayMax(parseInt(v)||0)} disabled={!canEdit} hint="افتراضي 25 ثانية"/>
        <SettingInp label="الحد اليومي" value={dailyCap} onChange={v=>setDailyCap(Math.min(500,Math.max(1,parseInt(v)||0)))} disabled={!canEdit} hint="مفيش أكثر من ده في اليوم"/>
        <SettingInp label="حجم الدفعة" value={batchSize} onChange={v=>setBatchSize(parseInt(v)||0)} disabled={!canEdit} hint="استراحة كل X رسالة"/>
        <SettingInp label="استراحة دفعة (دقيقة، أقل)" value={batchBreakMin} onChange={v=>setBatchBreakMin(parseInt(v)||0)} disabled={!canEdit}/>
        <SettingInp label="استراحة دفعة (دقيقة، أعلى)" value={batchBreakMax} onChange={v=>setBatchBreakMax(parseInt(v)||0)} disabled={!canEdit}/>
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

    <Card title="📋 ملخص التوقعات" style={{marginTop:12}}>
      <div style={{fontSize:FS-2,color:T.textSec,lineHeight:1.8}}>
        بمعدل <b>{Math.round((delayMin+delayMax)/2)} ث</b> بين الرسايل و دفعات بحجم <b>{batchSize}</b> مع استراحة <b>{Math.round((batchBreakMin+batchBreakMax)/2)} د</b>:
        <br/>• 50 رسالة هتاخد تقريباً <b>{Math.round((50*((delayMin+delayMax)/2)+ Math.floor(50/batchSize)*((batchBreakMin+batchBreakMax)/2)*60)/60)} دقيقة</b>
        <br/>• 100 رسالة هتاخد تقريباً <b>{Math.round((100*((delayMin+delayMax)/2)+ Math.floor(100/batchSize)*((batchBreakMin+batchBreakMax)/2)*60)/60)} دقيقة</b>
        <br/>• الحد اليومي <b>{dailyCap}</b> رسالة
      </div>
    </Card>

    {canEdit && <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}>
      <Btn ghost onClick={onClose}>إلغاء</Btn>
      <Btn primary onClick={save}>✓ حفظ الإعدادات</Btn>
    </div>}
  </div>;
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
  const [items] = useState(() => audience.map(c => ({...c, status: "pending", sentAt: null})));
  const [bridgeState, setBridgeState] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [confirmStart, setConfirmStart] = useState(true);
  const [completed, setCompleted] = useState(false);
  const campaignIdRef = useRef("camp_" + gid());
  const startedAtRef = useRef(new Date().toISOString());
  const persistedRef = useRef(false);

  /* Build personalized messages */
  const buildMessages = () => items.map(c => ({
    id: campaignIdRef.current + "_" + c.id,
    phone: cleanPhone(c.phone),
    customerName: c.name,
    message: personalize(template.body, c),
    campaignId: campaignIdRef.current,
  }));

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
      const res = await bridge.send(bridgeUrl, messages, bridgeToken);
      if(!res.ok) throw new Error(res.error||"Submission failed");
      setSubmitted(true);
      setConfirmStart(false);
    } catch(e) {
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
        <b>💡 إيش هي القائمة دي:</b> العملاء هنا هيتم تخطيهم تلقائياً في كل الحملات الجديدة. تستخدمها للعملاء اللي طلبوا عدم التواصل، أو ما عدوش مهتمين، أو لأي سبب إداري. ممكن تشيل أي حد منها في أي وقت.
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
