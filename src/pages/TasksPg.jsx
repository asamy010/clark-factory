/* ═══════════════════════════════════════════════════════════════
   CLARK - TasksPg.jsx
   
   Extracted from App.jsx in V15.1 phase 3.
   Contains: TasksPg
   ═══════════════════════════════════════════════════════════════ */

import { useState } from "react";
import { Btn, Card, Inp, Sel } from "../components/ui.jsx";
import { FS } from "../constants/index.js";
import { T } from "../theme.js";
import { showToast } from "../utils/popups.js";

export function TasksPg({data,upConfig,upTasks,isMob,user,userRole}){
  const[taskText,setTaskText]=useState("");const[taskTo,setTaskTo]=useState("");
  const uid=user?.uid||"default";const userEmail=user?.email||"";
  const allTasks=Array.isArray(data.tasks)?data.tasks:[];
  const myTasks=allTasks.filter(t=>t.toEmail===userEmail||t.toUid===uid);
  const sentTasks=allTasks.filter(t=>t.fromEmail===userEmail||t.fromUid===uid);
  const users=(data.usersList||[]);
  /* Ensure current user always in list */
  const allowedTargets=users.find(u=>u.email===userEmail)?users:[{email:userEmail,name:user?.displayName||userEmail.split("@")[0],role:userRole},...users];
  const addTask=()=>{if(!taskText.trim()||!taskTo)return;const target=allowedTargets.find(u=>u.email===taskTo);
    upTasks(d=>{if(!Array.isArray(d.tasks))d.tasks=[];d.tasks.unshift({id:Date.now(),text:taskText.trim(),done:false,date:new Date().toISOString().split("T")[0],fromUid:uid,fromEmail:userEmail,fromName:user?.displayName||userEmail.split("@")[0],toEmail:taskTo,toName:target?.name||taskTo.split("@")[0]})});
    setTaskText("");showToast("✓ تم ارسال المهمة")};
  const toggleTask=(tid)=>{upTasks(d=>{const arr=Array.isArray(d.tasks)?d.tasks:[];const t=arr.find(x=>String(x.id)===String(tid));if(t){t.done=!t.done;t.doneAt=t.done?new Date().toISOString():null}})};
  const delTask=(tid)=>{upTasks(d=>{d.tasks=Array.isArray(d.tasks)?d.tasks.filter(x=>String(x.id)!==String(tid)):[]})};
  return<div>
    <Card title="📌 ارسال مهمة جديدة" style={{marginBottom:16}}>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 2fr auto",gap:8,alignItems:"end"}}>
        <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>ارسال الى</label><Sel value={taskTo} onChange={setTaskTo}><option value="">-- اختر مستخدم --</option>{allowedTargets.map(u=><option key={u.email} value={u.email}>{(u.name||u.email.split("@")[0])+(u.email===userEmail?" (أنا)":"")+" — "+(u.role==="admin"?"مدير النظام":u.role==="manager"?"مدير انتاج":u.role==="sales_accountant"?"محاسب مبيعات":u.role==="purchase_accountant"?"محاسب مشتريات":"مشاهد")}</option>)}</Sel></div>
        <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>المهمة</label><Inp value={taskText} onChange={setTaskText} placeholder="اكتب المهمة..." onKeyDown={e=>{if(e.key==="Enter")addTask()}}/></div>
        <Btn primary onClick={addTask} disabled={!taskText.trim()||!taskTo}>📤 ارسال</Btn>
      </div>
    </Card>
    <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:16}}>
      <Card title={"📥 مهامي ("+myTasks.filter(t=>!t.done).length+")"}>
        {myTasks.length>0?<div style={{display:"flex",flexDirection:"column",gap:6}}>{myTasks.map((t,ti)=><div key={String(t.id)+ti} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",borderRadius:10,background:t.done?T.ok+"06":T.bg,border:"1px solid "+(t.done?T.ok+"20":T.brd)}}>
          <span onClick={()=>{upTasks(d=>{const arr=Array.isArray(d.tasks)?d.tasks:[];const tk=arr.find(x=>String(x.id)===String(t.id)&&x.text===t.text);if(tk){tk.done=!tk.done;tk.doneAt=tk.done?new Date().toISOString():null}})}} style={{cursor:"pointer",fontSize:20}}>{t.done?"✅":"⬜"}</span>
          <div style={{flex:1}}>
            <div style={{fontSize:FS,fontWeight:600,textDecoration:t.done?"line-through":"none",color:t.done?T.textMut:T.text}}>{t.text}</div>
            <div style={{fontSize:FS-2,color:T.textSec}}>{"من: "+(t.fromName||"—")+" | "+t.date}</div>
          </div>
          {t.done&&<span style={{fontSize:FS-3,padding:"2px 6px",borderRadius:4,background:T.ok+"12",color:T.ok,fontWeight:600}}>تم ✓</span>}
          <span onClick={()=>{upTasks(d=>{const arr=Array.isArray(d.tasks)?d.tasks:[];const idx=arr.findIndex(x=>String(x.id)===String(t.id)&&x.text===t.text);if(idx>=0)arr.splice(idx,1)})}} style={{cursor:"pointer",fontSize:14,color:T.err,flexShrink:0}}>✕</span>
        </div>)}</div>:<div style={{textAlign:"center",padding:30,color:T.textMut}}>لا توجد مهام</div>}
      </Card>
      <Card title={"📤 المهام المرسلة ("+sentTasks.length+")"}>
        {sentTasks.length>0?<div style={{display:"flex",flexDirection:"column",gap:6}}>{sentTasks.map(t=><div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",borderRadius:10,background:t.done?T.ok+"06":T.warn+"04",border:"1px solid "+(t.done?T.ok+"20":T.warn+"20")}}>
          <span style={{fontSize:20}}>{t.done?"✅":"⏳"}</span>
          <div style={{flex:1}}>
            <div style={{fontSize:FS,fontWeight:600,color:T.text}}>{t.text}</div>
            <div style={{fontSize:FS-2,color:T.textSec}}>{"الى: "+(t.toName||"—")+" | "+t.date}</div>
          </div>
          {t.done&&<span style={{fontSize:FS-3,padding:"2px 6px",borderRadius:4,background:T.ok+"12",color:T.ok,fontWeight:600}}>{"تم ✓ "+((t.doneAt||"").split("T")[0]||"")}</span>}
          <span onClick={()=>delTask(t.id)} style={{cursor:"pointer",fontSize:14,color:T.err}}>✕</span>
        </div>)}</div>:<div style={{textAlign:"center",padding:30,color:T.textMut}}>لم ترسل مهام</div>}
      </Card>
    </div>
  </div>
}

/* ══ ORDER AGE REPORT ══ */
