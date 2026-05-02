/* ═══════════════════════════════════════════════════════════════════════
   CLARK · CampaignsPg (V19.19)
   ───────────────────────────────────────────────────────────────────────
   Bulk messaging engine for sending personalized WhatsApp messages to
   customer segments. Click-through workflow: CLARK prepares the queue,
   employee taps "Send next" to open WhatsApp pre-filled with each message.

   Architecture:
   - 4 modes: list (templates + log) · templateEdit · newCampaign · send
   - Templates stored at data.campaignTemplates[] (cap 30)
   - Campaign log stored at data.campaigns[] (cap 50, summary only)
   - Per-customer items NOT persisted — kept in React state during send
   - Personalization via {placeholder} substitution at send time

   Design constraints:
   - wa.me URL: text only — no native attachment. Image URL appended to
     message text as plain link. User can long-press the chat in WhatsApp
     and attach images manually after the chat opens (V19.20+ may add
     Web Share API for true file attachment).
   - Daily send cap (default 50) protects the WhatsApp account from
     spam-detection bans.
   - Configurable delay between sends (3s default) — gives time for the
     employee to actually tap Send in WhatsApp before next tab opens.
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

/* Build audience array from a segment definition */
function buildAudience(data, segment){
  const customers = (data.customers||[]).filter(c => c.phone);
  if(!segment || !segment.key)return [];

  if(segment.key === "all"){
    return customers.map(c => buildContext(c, data));
  }
  if(segment.key === "manual"){
    /* For manual, segment.params.ids is the explicit list */
    const ids = new Set(segment.params?.ids || []);
    return customers.filter(c => ids.has(c.id)).map(c => buildContext(c, data));
  }
  if(segment.key === "balance_due"){
    const minBal = Number(segment.params?.minBalance) || 0;
    return customers
      .map(c => buildContext(c, data))
      .filter(c => (c.balance || 0) >= minBal);
  }
  if(segment.key === "recent_delivery"){
    const days = Number(segment.params?.days) || 30;
    const cutoff = daysAgo(days);
    return customers
      .map(c => buildContext(c, data))
      .filter(c => c.lastDeliveryDate && c.lastDeliveryDate >= cutoff);
  }
  if(segment.key === "inactive"){
    const days = Number(segment.params?.days) || 90;
    const cutoff = daysAgo(days);
    return customers
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
  const [mode, setMode] = useState("list"); /* list · templateEdit · newCampaign · send */
  const [editingTpl, setEditingTpl] = useState(null);
  const [activeCampaign, setActiveCampaign] = useState(null); /* {template, audience, segment} */

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

  /* ─────────────── NEW CAMPAIGN WIZARD ─────────────── */
  if(mode === "newCampaign"){
    return <NewCampaignWizard
      data={data}
      templates={templates}
      onCancel={() => setMode("list")}
      onLaunch={(tpl, segment, audience) => {
        setActiveCampaign({template: tpl, segment, audience});
        setMode("send");
      }}
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
      {canEdit && <Btn primary onClick={() => setMode("newCampaign")} disabled={templates.length===0} title={templates.length===0?"اعمل قالب الأول":"بدء حملة جديدة"}>
        ➕ حملة جديدة
      </Btn>}
    </div>

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
        </div> : <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr>{["التاريخ","القالب","الجمهور","المرسل","تم","تخطّى","فشل","المعدّل"].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
            <tbody>
              {campaigns.slice().sort((a,b) => (b.createdAt||"").localeCompare(a.createdAt||"")).map(c => {
                const total = c.totalCount || 0;
                const successPct = total > 0 ? Math.round(((c.sentCount||0)/total)*100) : 0;
                return <tr key={c.id} style={{borderBottom:"1px solid "+T.brd}}>
                  <td style={{...TD,whiteSpace:"nowrap"}}>{(c.createdAt||"").slice(0,10)}</td>
                  <td style={{...TD,fontWeight:700}}>{c.templateName || "—"}</td>
                  <td style={{...TD,fontSize:FS-2}}>{c.audienceLabel || "—"}</td>
                  <td style={{...TD,fontWeight:700,textAlign:"center"}}>{c.totalCount || 0}</td>
                  <td style={{...TD,fontWeight:700,color:T.ok,textAlign:"center"}}>{c.sentCount || 0}</td>
                  <td style={{...TD,color:T.warn,textAlign:"center"}}>{c.skippedCount || 0}</td>
                  <td style={{...TD,color:T.err,textAlign:"center"}}>{c.failedCount || 0}</td>
                  <td style={{...TD,fontWeight:800,textAlign:"center",color:successPct>=80?T.ok:successPct>=50?T.warn:T.err}}>{successPct}%</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>}
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
   SEND SCREEN — ASSEMBLY-LINE
   ═══════════════════════════════════════════════════════════════════════ */
function SendScreen({data, upConfig, user, template, segment, audience, onClose}){
  const [items, setItems] = useState(() => audience.map(c => ({...c, status: "pending", sentAt: null})));
  const [currentIdx, setCurrentIdx] = useState(0);
  const [delaySec, setDelaySec] = useState(DEFAULT_DELAY_SEC);
  const [paused, setPaused] = useState(false);
  const [completed, setCompleted] = useState(false);
  const campaignIdRef = useRef("camp_" + gid());
  const startedAtRef = useRef(new Date().toISOString());
  const persistedRef = useRef(false);

  const counts = useMemo(() => ({
    sent: items.filter(i => i.status === "sent").length,
    skipped: items.filter(i => i.status === "skipped").length,
    failed: items.filter(i => i.status === "failed").length,
    pending: items.filter(i => i.status === "pending").length,
  }), [items]);

  const totalSentToday = countSentToday(data) + counts.sent;
  const overCap = totalSentToday >= DEFAULT_DAILY_CAP;

  const current = items[currentIdx];
  const remaining = items.length - currentIdx - (counts.sent + counts.skipped + counts.failed);

  /* Persist final summary when completed */
  const persistCampaign = (finalCounts) => {
    if(persistedRef.current)return;
    persistedRef.current = true;
    upConfig(d => {
      if(!Array.isArray(d.campaigns))d.campaigns = [];
      const record = {
        id: campaignIdRef.current,
        templateId: template.id,
        templateName: template.name,
        audienceLabel: segment.label || "—",
        totalCount: items.length,
        sentCount: finalCounts.sent,
        skippedCount: finalCounts.skipped,
        failedCount: finalCounts.failed,
        createdAt: startedAtRef.current,
        completedAt: new Date().toISOString(),
        createdBy: user?.email || "",
      };
      d.campaigns.unshift(record);
      /* Cap log size */
      if(d.campaigns.length > MAX_CAMPAIGNS)d.campaigns = d.campaigns.slice(0, MAX_CAMPAIGNS);
    });
  };

  const sendCurrent = () => {
    if(!current || current.status !== "pending" || paused || overCap)return;
    const phone = cleanPhone(current.phone);
    if(!phone){
      markStatus(currentIdx, "failed");
      setCurrentIdx(prev => prev + 1);
      return;
    }
    let msg = personalize(template.body, current);
    if(template.imageUrl)msg += "\n" + template.imageUrl;
    const url = "https://wa.me/" + phone + "?text=" + encodeURIComponent(msg);
    openWA(url, "_blank");
    markStatus(currentIdx, "sent");
    setCurrentIdx(prev => prev + 1);
  };

  const skipCurrent = () => {
    if(!current || current.status !== "pending")return;
    markStatus(currentIdx, "skipped");
    setCurrentIdx(prev => prev + 1);
  };

  const markStatus = (idx, status) => {
    setItems(prev => prev.map((it,i) => i === idx ? {...it, status, sentAt: status === "sent" ? new Date().toISOString() : it.sentAt} : it));
  };

  /* Detect completion */
  useEffect(() => {
    if(currentIdx >= items.length && !completed){
      setCompleted(true);
      persistCampaign(counts);
    }
  }, [currentIdx, items.length, completed, counts]);

  const finishEarly = async () => {
    const remainingPending = items.filter(i => i.status === "pending").length;
    if(remainingPending > 0){
      if(!await ask("لسه فيه "+remainingPending+" رسالة ما اتبعتش — تأكد من الإنهاء؟"))return;
    }
    /* Mark remaining as skipped and persist */
    const finalItems = items.map(it => it.status === "pending" ? {...it, status: "skipped"} : it);
    setItems(finalItems);
    const finalCounts = {
      sent: finalItems.filter(i => i.status === "sent").length,
      skipped: finalItems.filter(i => i.status === "skipped").length,
      failed: finalItems.filter(i => i.status === "failed").length,
    };
    setCompleted(true);
    persistCampaign(finalCounts);
  };

  return <div style={{padding:16,maxWidth:900,margin:"0 auto"}}>
    {/* Header */}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,gap:8,flexWrap:"wrap"}}>
      <div>
        <h2 style={{margin:0,fontSize:FS+3,fontWeight:900,display:"flex",alignItems:"center",gap:8}}>
          <span>📱</span>
          <span>{completed?"اكتملت":"إرسال"}: {template.name}</span>
        </h2>
        <div style={{fontSize:FS-2,color:T.textSec,marginTop:4}}>{segment.label} · {items.length} عميل</div>
      </div>
      <Btn ghost onClick={onClose}>✕ إغلاق</Btn>
    </div>

    {/* Progress */}
    <Card>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:12}}>
        <Stat label="✓ تم" value={counts.sent} color={T.ok}/>
        <Stat label="⊘ تخطّى" value={counts.skipped} color={T.warn}/>
        <Stat label="✕ فشل" value={counts.failed} color={T.err}/>
        <Stat label="⏳ متبقي" value={items.length - currentIdx} color={T.textSec}/>
      </div>
      <div style={{height:8,borderRadius:4,background:T.bg,overflow:"hidden",marginBottom:8}}>
        <div style={{
          height:"100%",
          width:(currentIdx/Math.max(1,items.length))*100+"%",
          background:"linear-gradient(90deg, "+T.ok+", "+T.accent+")",
          transition:"width 0.3s",
        }}/>
      </div>
      <div style={{textAlign:"center",fontSize:FS-2,color:T.textSec,fontWeight:700}}>
        {currentIdx} من {items.length} ({Math.round((currentIdx/Math.max(1,items.length))*100)}%)
      </div>
    </Card>

    {/* Current message preview */}
    {!completed && current && <Card title={"الرسالة الحالية: "+(currentIdx+1)+" من "+items.length} accent="#25D366" style={{marginTop:14}}>
      <div style={{display:"flex",gap:12,marginBottom:12,alignItems:"center",padding:10,borderRadius:8,background:T.bg}}>
        <div style={{
          width:44,height:44,borderRadius:"50%",
          background:"#25D36620",color:"#25D366",
          display:"flex",alignItems:"center",justifyContent:"center",
          fontSize:18,fontWeight:900,flexShrink:0,
        }}>{(current.name||"?").charAt(0)}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:800,fontSize:FS}}>{current.name}</div>
          <div style={{fontSize:FS-2,color:T.textSec}}>{current.phone}</div>
        </div>
      </div>

      <div style={{padding:12,borderRadius:10,background:"#DCF8C6",fontSize:FS,whiteSpace:"pre-wrap",lineHeight:1.7,maxWidth:400}}>
        {personalize(template.body, current)}
        {template.imageUrl && <div style={{marginTop:6,fontSize:FS-2,color:"#0E7490"}}>🖼 {template.imageUrl}</div>}
      </div>

      {overCap && <div style={{marginTop:12,padding:10,borderRadius:8,background:T.err+"10",border:"1px solid "+T.err+"30",color:T.err,fontSize:FS-1,fontWeight:700}}>
        ⛔ وصلت لحد الإرسال اليومي ({DEFAULT_DAILY_CAP} رسالة) — كمل بكرة لحماية رقم الواتساب.
      </div>}

      <div style={{display:"flex",gap:8,marginTop:14,flexWrap:"wrap",alignItems:"center"}}>
        <Btn primary disabled={overCap || paused} onClick={sendCurrent} style={{background:"#25D366",borderColor:"#25D366",fontSize:FS+1}}>
          📤 ابعت لـ {current.name?.slice(0,20)}
        </Btn>
        <Btn onClick={skipCurrent} style={{background:T.warn+"15",color:T.warn,border:"1px solid "+T.warn+"30"}}>⊘ تخطّى</Btn>
        <Btn onClick={() => setPaused(!paused)} style={{background:paused?T.ok+"15":T.warn+"15",color:paused?T.ok:T.warn,border:"1px solid "+T.brd}}>
          {paused?"▶ استئناف":"⏸ إيقاف مؤقت"}
        </Btn>
        <div style={{display:"flex",alignItems:"center",gap:6,marginInlineStart:"auto"}}>
          <span style={{fontSize:FS-2,color:T.textSec}}>تأخير:</span>
          <Inp type="number" value={delaySec} onChange={v => setDelaySec(Math.max(0,Math.min(30,Number(v)||0)))} style={{width:60}}/>
          <span style={{fontSize:FS-2,color:T.textSec}}>ث</span>
        </div>
      </div>

      <div style={{marginTop:10,fontSize:FS-3,color:T.textMut,lineHeight:1.6}}>
        💡 الزر فوق يفتحلك واتساب برسالة جاهزة. اضغط Send في واتساب، ارجع للتطبيق، اضغط الزر تاني للعميل اللي بعده.
      </div>
    </Card>}

    {completed && <Card style={{marginTop:14}}>
      <div style={{textAlign:"center",padding:24}}>
        <div style={{fontSize:48,marginBottom:8}}>🎉</div>
        <div style={{fontSize:FS+4,fontWeight:900,color:T.ok,marginBottom:8}}>اكتملت الحملة</div>
        <div style={{fontSize:FS,color:T.textSec,marginBottom:16}}>
          تم: {counts.sent} · تخطّى: {counts.skipped} · فشل: {counts.failed}
        </div>
        <Btn primary onClick={onClose}>✓ تم</Btn>
      </div>
    </Card>}

    {!completed && <div style={{marginTop:14,textAlign:"center"}}>
      <Btn ghost onClick={finishEarly} style={{color:T.err}}>إنهاء الحملة الآن</Btn>
    </div>}

    {/* Customer list overview */}
    <Card title="قائمة كل العملاء" style={{marginTop:14}}>
      <div style={{maxHeight:300,overflowY:"auto"}}>
        {items.map((it,i) => <div key={it.id} style={{
          display:"flex",alignItems:"center",gap:10,padding:"8px 12px",
          borderBottom:"1px solid "+T.brd,
          background:i===currentIdx&&!completed?T.accent+"08":"transparent",
          opacity:it.status==="pending"?1:0.7,
        }}>
          <div style={{width:24,fontSize:FS-2,color:T.textMut,fontWeight:700}}>{i+1}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:700,fontSize:FS-1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{it.name}</div>
            <div style={{fontSize:FS-3,color:T.textSec}}>{it.phone}</div>
          </div>
          <div style={{fontSize:FS-2,fontWeight:700,
            color: it.status==="sent"?T.ok:it.status==="skipped"?T.warn:it.status==="failed"?T.err:T.textSec
          }}>
            {it.status==="sent"?"✓ مبعوت":it.status==="skipped"?"⊘ متخطّى":it.status==="failed"?"✕ فشل":"⏳"}
          </div>
        </div>)}
      </div>
    </Card>
  </div>;
}
