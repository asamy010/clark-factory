/* ═══════════════════════════════════════════════════════════════
   CLARK — ModelsPg.jsx (V21.22.0 — المرحلة ٢ من نظام التصنيع)

   «الموديلات» = وصفات قابلة لإعادة الاستخدام (زي Product/BoM في Odoo).
   الموديل بيتخزّن في collection مستقل `models` (top-level، عام مش لكل
   موسم). الفورم = OrdForm في modelMode (نفس فورم الأوردر ناقص PO/الحالة/
   الكميات). أمر التشغيل بيتولّد من الموديل في المرحلة ٣ (snapshot).
   ═══════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { Btn } from "../components/ui.jsx";
import { ModelForm } from "./ModelForm.jsx";
import { AIStudioPg } from "./AIStudioPg.jsx";
import { mkOrder } from "../utils/orders.js";
import { T } from "../theme.js";
import { FS, FKEYS } from "../constants/index.js";
import { ask, tell } from "../utils/popups.js";
import { gIcon } from "../utils/format.js";

/* كل ألوان الموديل (palette) عبر كل الأقمشة A→H — أسماء فريدة + hex. */
function modelColors(m){
  const seen = new Set();
  const out = [];
  FKEYS.forEach(k => {
    (m["colors" + k] || []).forEach(c => {
      const name = (typeof c === "string" ? c : (c && c.color) || "").trim();
      if(!name || seen.has(name)) return;
      seen.add(name);
      out.push({ name, hex: (c && c.colorHex) || "#cbd5e1" });
    });
  });
  return out;
}

export function ModelsPg({ data, models, addModel, replaceModel, delModel, isMob, canEdit, statusCards, upConfig, user }){
  const [editing, setEditing] = useState(null); /* null | "new" | modelObj */
  const [studio, setStudio] = useState(null); /* null | modelObj — استوديو الـ AI */
  const [q, setQ] = useState("");

  /* ⚠️ كل الـ hooks قبل أي early return (Rules of Hooks) */
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const arr = Array.isArray(models) ? models : [];
    if(!s) return arr;
    return arr.filter(m => ((m.modelNo || "") + " " + (m.modelDesc || "")).toLowerCase().includes(s));
  }, [models, q]);

  /* استوديو الموديلات (AI) — view ملء الشاشة */
  if(studio){
    return <AIStudioPg model={studio} data={data} upConfig={upConfig} user={user}
      isMob={isMob} replaceModel={replaceModel} onClose={() => setStudio(null)}/>;
  }

  /* فورم موديل جديد */
  if(editing === "new"){
    return <ModelForm data={data} initial={mkOrder()}
      onSave={m => { addModel(m); setEditing(null); }}
      onCancel={() => setEditing(null)} isMob={isMob} upConfig={upConfig} user={user}/>;
  }
  /* تعديل موديل */
  if(editing && editing.id){
    return <ModelForm data={data} initial={editing}
      onSave={m => { replaceModel(editing.id, m); setEditing(null); }}
      onCancel={() => setEditing(null)} isMob={isMob} upConfig={upConfig} user={user}/>;
  }

  const onDelete = async (m) => {
    /* V21.22.2 — منع حذف موديل مرتبط بأوامر تشغيل (سلامة المرجع — زي باقي
       كيانات CLARK). الأوامر بتاخد snapshot فبتفضل سليمة، بس مايصحّش نسيب
       الـ modelId معلّق على موديل محذوف. */
    const linked = (Array.isArray(data.orders) ? data.orders : []).filter(o => o && String(o.modelId) === String(m.id));
    if(linked.length > 0){
      const sample = linked.slice(0, 4).map(o => o.poNumber || o.modelNo || o.id).filter(Boolean).join("، ");
      await tell("لا يمكن حذف الموديل",
        "الموديل \"" + (m.modelNo || "") + "\" مرتبط بـ " + linked.length + " أمر تشغيل" +
        (sample ? " (" + sample + (linked.length > 4 ? "…" : "") + ")" : "") +
        ".\n\nاحذف أوامر التشغيل دي الأول، أو سيب الموديل زي ما هو.",
        { type: "warning" });
      return;
    }
    if(!await ask("حذف الموديل", "حذف الموديل \"" + (m.modelNo || "") + "\"؟", { danger: true, confirmText: "حذف" })) return;
    delModel(m.id);
  };

  return <div>
    {/* Header */}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,marginBottom:14}}>
      <div>
        <div style={{fontSize:FS+4,fontWeight:800,color:T.text}}>🧩 الموديلات</div>
        <div style={{fontSize:FS-1,color:T.textSec,marginTop:2}}>وصفات قابلة لإعادة الاستخدام — اعمل الموديل مرة وشغّله كتير من غير تكرار</div>
      </div>
      {canEdit && <Btn primary onClick={() => setEditing("new")}>➕ موديل جديد</Btn>}
    </div>

    {/* Search */}
    {models.length > 0 && <div style={{marginBottom:12,maxWidth:360}}>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 ابحث برقم/وصف الموديل..."
        style={{width:"100%",padding:"9px 12px",borderRadius:8,border:"1px solid "+T.brd,fontSize:FS-1,fontFamily:"inherit",background:T.cardSolid,color:T.text,boxSizing:"border-box"}}/>
    </div>}

    {/* Empty state */}
    {models.length === 0 ? (
      <div style={{textAlign:"center",padding:"56px 20px",color:T.textSec}}>
        <div style={{fontSize:48,marginBottom:12}}>🧩</div>
        <div style={{fontSize:FS+2,fontWeight:800,color:T.text,marginBottom:6}}>مفيش موديلات لسه</div>
        <div style={{fontSize:FS-1,maxWidth:460,margin:"0 auto 16px",lineHeight:1.7}}>أضف موديل بألوانه وأقمشته ومقاساته مرة واحدة — وبعدين تقدر تعمل منه أوامر تشغيل كتير من غير ما تعيد إدخال البيانات.</div>
        {canEdit && <Btn primary onClick={() => setEditing("new")}>➕ أضف أول موديل</Btn>}
      </div>
    ) : list.length === 0 ? (
      <div style={{textAlign:"center",padding:30,color:T.textMut}}>مفيش نتائج مطابقة</div>
    ) : (
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"repeat(auto-fill,minmax(232px,1fr))",gap:12}}>
        {list.map(m => {
          const cols = modelColors(m);
          const pieces = m.orderPieces || [];
          const fabCount = FKEYS.filter(k => m["fabric" + k]).length;
          return <div key={m.id} className="clark-card" style={{background:T.cardSolid,border:"1px solid "+T.brd,borderRadius:22,boxShadow:T.shadow,overflow:"hidden",display:"flex",flexDirection:"column"}}>
            <div style={{display:"flex",flexDirection:"row-reverse",gap:13,padding:16,alignItems:"flex-start"}}>
              {m.image ? <img src={m.image} alt="" style={{width:80,height:100,objectFit:"cover",borderRadius:18,border:"1px solid "+T.brd,flexShrink:0}}/>
                : <div style={{width:80,height:100,borderRadius:18,background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:30,flexShrink:0}}>🧩</div>}
              <div style={{minWidth:0,flex:1}}>
                <div style={{fontSize:FS+3,fontWeight:900,color:T.text,lineHeight:1.1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.modelNo || "—"}</div>
                <div style={{fontSize:FS-1,color:T.textSec,marginTop:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.modelDesc || ""}</div>
                {m.sizeLabel && <div style={{display:"inline-block",marginTop:8,padding:"4px 12px",borderRadius:999,fontSize:FS-3,fontWeight:800,background:T.accent+"14",color:T.accent}}>{m.sizeLabel}</div>}
              </div>
            </div>
            {/* colors palette */}
            {cols.length > 0 && <div style={{display:"flex",flexWrap:"wrap",gap:5,padding:"0 16px 10px"}}>
              {cols.slice(0,10).map((c,i) => <span key={i} title={c.name} style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 7px",borderRadius:999,fontSize:FS-3,fontWeight:600,background:T.bg,border:"1px solid "+T.brd}}>
                <span style={{width:11,height:11,borderRadius:"50%",background:c.hex,border:"1px solid rgba(0,0,0,0.15)"}}/>{c.name}
              </span>)}
              {cols.length > 10 && <span style={{fontSize:FS-3,color:T.textMut,alignSelf:"center"}}>+{cols.length-10}</span>}
            </div>}
            {/* pieces + fabrics */}
            <div style={{display:"flex",flexWrap:"wrap",gap:5,padding:"0 16px 10px",fontSize:FS-3,color:T.textSec}}>
              {pieces.slice(0,5).map(p => <span key={p}>{gIcon(p, data.garmentTypes)} {p}</span>)}
              {fabCount > 0 && <span style={{marginInlineStart:"auto",color:T.textMut}}>🧵 {fabCount} خامة</span>}
            </div>
            {/* actions */}
            {canEdit && <div style={{display:"flex",gap:6,padding:14,borderTop:"1px solid "+T.brd,marginTop:"auto"}}>
              <Btn small onClick={() => setEditing(m)} style={{flex:1,background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}}>✏️ تعديل</Btn>
              <Btn small onClick={() => setStudio(m)} title="استوديو الـ AI — تلبيس الموديل" style={{background:"#8B5CF612",color:"#8B5CF6",border:"1px solid #8B5CF630"}}>🪄</Btn>
              <Btn small onClick={() => onDelete(m)} style={{background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30"}}>🗑</Btn>
            </div>}
          </div>;
        })}
      </div>
    )}
  </div>;
}

export default ModelsPg;
