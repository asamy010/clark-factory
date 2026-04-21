/* ═══════════════════════════════════════════════════════════════
   CLARK - SettingsPg.jsx
   
   Extracted from App.jsx in V15.1 phase 3.
   Contains: PoMigConfirm, TreasurySettingsCard, HrSettingsCard, PrintSettingsCard, SalesSettingsCard, WaContactsCard, SettingsPg, BackupRestoreCard
   ═══════════════════════════════════════════════════════════════ */

import { useEffect, useState } from "react";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile } from "firebase/auth";
import { collection, deleteDoc, doc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { Btn, Card, DelBtn, Inp, Sel, Spinner } from "../components/ui.jsx";
import { TABS } from "../components/LoginScreen.jsx";
import { FKEYS, FS } from "../constants/index.js";
import { CLARK_LOGO } from "../constants/logo.js";
import { auth, db, getSecondaryAuth } from "../firebase";
import { T, TD, TH } from "../theme.js";
import { gid } from "../utils/format.js";
import { compressImage } from "../utils/image.js";
import { calcOrder, getConfirmedStock, recomputeStatus, wsTypeInfo } from "../utils/orders.js";
import { ask, askForm, showToast, tell } from "../utils/popups.js";
import { StockPg } from "./StockPg.jsx";

export function PoMigConfirm({onConfirm,onCancel,T,FS}){
  const[text,setText]=useState("");
  const isValid=text.trim()==="تحويل";
  return<div>
    <input value={text} onChange={e=>setText(e.target.value)} placeholder="اكتب: تحويل" style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"2px solid "+(isValid?T.ok:T.brd),fontSize:FS,fontFamily:"inherit",background:T.cardSolid,color:T.text,boxSizing:"border-box",outline:"none",marginBottom:10,textAlign:"center",fontWeight:700}}/>
    <div style={{display:"flex",gap:8}}>
      <button onClick={isValid?onConfirm:null} disabled={!isValid} style={{flex:1,padding:"8px 14px",borderRadius:8,border:"none",background:isValid?T.err:"#ccc",color:"#fff",cursor:isValid?"pointer":"not-allowed",fontSize:FS,fontFamily:"inherit",fontWeight:800}}>🔥 تنفيذ التحويل</button>
      <button onClick={onCancel} style={{padding:"8px 14px",borderRadius:8,border:"1px solid "+T.brd,background:T.cardSolid,color:T.text,cursor:"pointer",fontSize:FS,fontFamily:"inherit",fontWeight:600}}>إلغاء</button>
    </div>
  </div>;
}



export function TreasurySettingsCard({config,upConfig,T,FS,isMob,showToast,Inp,Btn,Sel,Card,setDirty,userRole}){
  const isAdmin=userRole==="admin";
  const DEFAULT_OUT=["تكلفة","مشتريات","مرتبات","قطع غيار","صيانة ماكينات","خيط","تشغيل خارجي","نقل","كهرباء","ايجار المصنع","نثريات","اكسسوار","مستلزمات تشغيل","ورق ماركر","خدمات","أصول ثابتة","تكاليف أخرى"];
  const DEFAULT_IN=["وارد","إيرادات","دفعة عميل","رأس مال","تحويل"];
  const DEFAULT_CHECK=["رصيد افتتاحي","دفعة عميل","دفع مورد","تسوية مبالغ","تحويل بين الحسابات","أخرى"];
  const savedTS=config.treasurySettings||{};
  /* V14.52: List of all non-admin users (candidates for whitelist) */
  const allUsers=(config.usersList||[]).filter(u=>u.role!=="admin");
  /* Build the "saved snapshot" used for comparison */
  const buildSnapshot=(ts)=>({
    openingBalance:Number(ts.openingBalance)||0,
    autoSeason:ts.autoSeason!==false,
    outCategories:ts.outCategories||DEFAULT_OUT,
    inCategories:ts.inCategories||DEFAULT_IN,
    checkCategories:ts.checkCategories||DEFAULT_CHECK,
    /* V14.52: default-on for locks (undefined → true), whitelists default to empty */
    lockEdit:ts.lockEdit===false?false:true,
    lockDelete:ts.lockDelete===false?false:true,
    allowedEditors:Array.isArray(ts.allowedEditors)?[...ts.allowedEditors]:[],
    allowedDeleters:Array.isArray(ts.allowedDeleters)?[...ts.allowedDeleters]:[]
  });
  const[draft,setDraft]=useState(()=>buildSnapshot(savedTS));
  const[newOutCat,setNewOutCat]=useState("");
  const[newInCat,setNewInCat]=useState("");
  const[newCheckCat,setNewCheckCat]=useState("");
  /* Sync from config when NOT dirty */
  const savedSnap=buildSnapshot(savedTS);
  useEffect(()=>{
    const currentDirty=JSON.stringify(draft)!==JSON.stringify(savedSnap);
    if(!currentDirty)setDraft(buildSnapshot(savedTS));
  },[JSON.stringify(savedSnap)]);/* eslint-disable-line */
  const isDirty=JSON.stringify(draft)!==JSON.stringify(savedSnap);
  useEffect(()=>{setDirty(isDirty)},[isDirty]);/* eslint-disable-line */

  const handleSave=()=>{
    upConfig(d=>{
      if(!d.treasurySettings)d.treasurySettings={};
      d.treasurySettings.openingBalance=draft.openingBalance;
      d.treasurySettings.autoSeason=draft.autoSeason;
      d.treasurySettings.outCategories=[...draft.outCategories];
      d.treasurySettings.inCategories=[...draft.inCategories];
      d.treasurySettings.checkCategories=[...draft.checkCategories];
      /* Only admin can save lock changes */
      if(isAdmin){
        const oldLockEdit=savedTS.lockEdit===false?false:true;
        const oldLockDelete=savedTS.lockDelete===false?false:true;
        const oldEditors=Array.isArray(savedTS.allowedEditors)?savedTS.allowedEditors:[];
        const oldDeleters=Array.isArray(savedTS.allowedDeleters)?savedTS.allowedDeleters:[];
        const lockEditChanged=draft.lockEdit!==oldLockEdit;
        const lockDeleteChanged=draft.lockDelete!==oldLockDelete;
        const editorsChanged=JSON.stringify([...oldEditors].sort())!==JSON.stringify([...draft.allowedEditors].sort());
        const deletersChanged=JSON.stringify([...oldDeleters].sort())!==JSON.stringify([...draft.allowedDeleters].sort());
        d.treasurySettings.lockEdit=draft.lockEdit;
        d.treasurySettings.lockDelete=draft.lockDelete;
        d.treasurySettings.allowedEditors=[...draft.allowedEditors];
        d.treasurySettings.allowedDeleters=[...draft.allowedDeleters];
        /* Log lock changes to audit */
        if(lockEditChanged||lockDeleteChanged){
          if(!Array.isArray(d.auditLog))d.auditLog=[];
          d.auditLog.unshift({
            id:Math.random().toString(36).slice(2)+Date.now(),
            category:"security",
            action:"lock_setting_changed",
            target:"treasury_lock",
            oldValue:"تعديل:"+(oldLockEdit?"مقفول":"مفتوح")+" | حذف:"+(oldLockDelete?"مقفول":"مفتوح"),
            newValue:"تعديل:"+(draft.lockEdit?"مقفول":"مفتوح")+" | حذف:"+(draft.lockDelete?"مقفول":"مفتوح"),
            at:new Date().toISOString()
          });
        }
        /* V14.52: Log whitelist changes */
        if(editorsChanged||deletersChanged){
          if(!Array.isArray(d.auditLog))d.auditLog=[];
          d.auditLog.unshift({
            id:Math.random().toString(36).slice(2)+Date.now(),
            category:"security",
            action:"whitelist_changed",
            target:"treasury_whitelist",
            oldValue:"تعديل:["+oldEditors.join(",")+"] | حذف:["+oldDeleters.join(",")+"]",
            newValue:"تعديل:["+draft.allowedEditors.join(",")+"] | حذف:["+draft.allowedDeleters.join(",")+"]",
            at:new Date().toISOString()
          });
        }
      }
    });
    showToast("✅ تم حفظ إعدادات الخزنة");
  };
  const handleDiscard=()=>{
    if(!confirm("سيتم إلغاء كل التعديلات غير المحفوظة. هل تريد المتابعة؟"))return;
    setDraft(buildSnapshot(savedTS));
    setNewOutCat("");setNewInCat("");setNewCheckCat("");
    showToast("↩️ تم إلغاء التعديلات");
  };
  const updateDraft=(fn)=>setDraft(prev=>{const next={...prev};fn(next);return next});
  const removeOut=(c)=>updateDraft(d=>{d.outCategories=d.outCategories.filter(x=>x!==c)});
  const removeIn=(c)=>updateDraft(d=>{d.inCategories=d.inCategories.filter(x=>x!==c)});
  const removeCheck=(c)=>updateDraft(d=>{d.checkCategories=d.checkCategories.filter(x=>x!==c)});
  const addOut=()=>{const v=newOutCat.trim();if(!v)return;if(draft.outCategories.includes(v)){showToast("⚠️ البند موجود بالفعل");return}updateDraft(d=>{d.outCategories=[...d.outCategories,v]});setNewOutCat("")};
  const addIn=()=>{const v=newInCat.trim();if(!v)return;if(draft.inCategories.includes(v)){showToast("⚠️ البند موجود بالفعل");return}updateDraft(d=>{d.inCategories=[...d.inCategories,v]});setNewInCat("")};
  const addCheck=()=>{const v=newCheckCat.trim();if(!v)return;if(draft.checkCategories.includes(v)){showToast("⚠️ البند موجود بالفعل");return}updateDraft(d=>{d.checkCategories=[...d.checkCategories,v]});setNewCheckCat("")};

  return<Card title={"🏦 إعدادات الخزنة"+(isDirty?" ✨":"")} style={{marginBottom:16,...(isDirty?{border:"2px solid "+T.warn+"60",boxShadow:"0 0 0 3px "+T.warn+"15"}:{})}}>
    <div>
      {isDirty&&<div style={{fontSize:FS-2,color:T.warn,marginBottom:12,padding:"8px 12px",background:T.warn+"10",borderRadius:8,border:"1px solid "+T.warn+"30",fontWeight:700,display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:16}}>✨</span>
        <span>لديك تعديلات غير محفوظة — اضغط "حفظ" للتأكيد أو "إلغاء" للرجوع</span>
      </div>}
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:12}}>
        <div><label style={{fontSize:FS-1,fontWeight:700,color:T.textSec,marginBottom:6,display:"block"}}>رصيد أول المدة</label>
          <Inp type="number" value={draft.openingBalance||""} onChange={v=>updateDraft(d=>{d.openingBalance=Number(v)||0})} placeholder="0"/></div>
        <div><label style={{fontSize:FS-1,fontWeight:700,color:T.textSec,marginBottom:6,display:"block"}}>ربط الموسم تلقائياً</label>
          <Sel value={draft.autoSeason?"auto":"manual"} onChange={v=>updateDraft(d=>{d.autoSeason=v==="auto"})}>
            <option value="auto">تلقائي (الموسم الحالي)</option><option value="manual">يدوي</option></Sel></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:12,marginTop:12}}>
        <div><div style={{fontSize:FS-1,fontWeight:700,color:T.err,marginBottom:6}}>بنود المنصرف ({draft.outCategories.length})</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:6}}>{draft.outCategories.map(c=><span key={c} style={{padding:"3px 8px",borderRadius:6,fontSize:FS-2,background:T.err+"08",color:T.err,display:"flex",alignItems:"center",gap:4}}>
            {c}<span onClick={()=>removeOut(c)} style={{cursor:"pointer",fontSize:10}}>✕</span>
          </span>)}</div>
          <div style={{display:"flex",gap:4}}><Inp value={newOutCat} onChange={setNewOutCat} placeholder="بند جديد..." style={{flex:1}}/><Btn small onClick={addOut}>+</Btn></div>
        </div>
        <div><div style={{fontSize:FS-1,fontWeight:700,color:T.ok,marginBottom:6}}>بنود الوارد ({draft.inCategories.length})</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:6}}>{draft.inCategories.map(c=><span key={c} style={{padding:"3px 8px",borderRadius:6,fontSize:FS-2,background:T.ok+"08",color:T.ok,display:"flex",alignItems:"center",gap:4}}>
            {c}<span onClick={()=>removeIn(c)} style={{cursor:"pointer",fontSize:10}}>✕</span>
          </span>)}</div>
          <div style={{display:"flex",gap:4}}><Inp value={newInCat} onChange={setNewInCat} placeholder="بند جديد..." style={{flex:1}}/><Btn small onClick={addIn}>+</Btn></div>
        </div>
      </div>
      <div style={{marginTop:12,padding:12,borderRadius:10,background:"#8B5CF608",border:"1px solid #8B5CF620"}}>
        <div style={{fontSize:FS-1,fontWeight:700,color:"#8B5CF6",marginBottom:6}}>📝 بنود الشيكات ({draft.checkCategories.length})</div>
        <div style={{fontSize:FS-3,color:T.textMut,marginBottom:8,lineHeight:1.6}}>تُستخدم في فورم الشيكات فقط (أوراق قبض/دفع). مثلاً "رصيد افتتاحي" لفتح موسم جديد.</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:6}}>{draft.checkCategories.map(c=><span key={c} style={{padding:"3px 8px",borderRadius:6,fontSize:FS-2,background:"#8B5CF612",color:"#8B5CF6",display:"flex",alignItems:"center",gap:4}}>
          {c}<span onClick={()=>removeCheck(c)} style={{cursor:"pointer",fontSize:10}}>✕</span>
        </span>)}</div>
        <div style={{display:"flex",gap:4}}><Inp value={newCheckCat} onChange={setNewCheckCat} placeholder="بند جديد (مثلاً: رصيد افتتاحي)..." style={{flex:1}}/><Btn small onClick={addCheck}>+</Btn></div>
      </div>

      {/* ═══ V14.52: Lock Edit/Delete + Whitelist — admin only ═══ */}
      {isAdmin&&<div style={{marginTop:12,padding:14,borderRadius:12,background:"linear-gradient(135deg,"+T.err+"06,"+T.err+"02)",border:"2px solid "+T.err+"30"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
          <span style={{fontSize:20}}>🔒</span>
          <div style={{fontSize:FS+1,fontWeight:800,color:T.err}}>قفل تعديل وحذف الحركات</div>
        </div>
        <div style={{fontSize:FS-2,color:T.textSec,marginBottom:14,lineHeight:1.6}}>
          لما القفل يبقى مفعّل، بس المدير والمستخدمين المصرح لهم يقدروا يعدلوا/يحذفوا. كل عملية بتتسجل في سجل الأمان.
        </div>

        {/* Lock toggles */}
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:10,marginBottom:14}}>
          {/* Lock Edit */}
          <div style={{padding:"12px 14px",borderRadius:10,background:draft.lockEdit?T.err+"12":T.ok+"08",border:"1px solid "+(draft.lockEdit?T.err+"40":T.ok+"30"),cursor:"pointer",transition:"all 0.15s"}} onClick={()=>setDraft(p=>({...p,lockEdit:!p.lockEdit}))}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <div style={{fontSize:FS,fontWeight:700,color:T.text,display:"flex",alignItems:"center",gap:6}}>
                <span>✏️</span><span>قفل التعديل</span>
              </div>
              <div style={{fontSize:FS-1,fontWeight:800,padding:"3px 10px",borderRadius:6,background:draft.lockEdit?T.err:T.ok,color:"#fff"}}>
                {draft.lockEdit?"🔴 مفعّل":"🟢 مفتوح"}
              </div>
            </div>
            <div style={{fontSize:FS-3,color:T.textMut,marginTop:4,lineHeight:1.5}}>
              {draft.lockEdit?"المدير + المصرّح لهم فقط":"الكل يقدر يعدّل حسب صلاحياته"}
            </div>
          </div>
          {/* Lock Delete */}
          <div style={{padding:"12px 14px",borderRadius:10,background:draft.lockDelete?T.err+"12":T.ok+"08",border:"1px solid "+(draft.lockDelete?T.err+"40":T.ok+"30"),cursor:"pointer",transition:"all 0.15s"}} onClick={()=>setDraft(p=>({...p,lockDelete:!p.lockDelete}))}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <div style={{fontSize:FS,fontWeight:700,color:T.text,display:"flex",alignItems:"center",gap:6}}>
                <span>🗑️</span><span>قفل الحذف</span>
              </div>
              <div style={{fontSize:FS-1,fontWeight:800,padding:"3px 10px",borderRadius:6,background:draft.lockDelete?T.err:T.ok,color:"#fff"}}>
                {draft.lockDelete?"🔴 مفعّل":"🟢 مفتوح"}
              </div>
            </div>
            <div style={{fontSize:FS-3,color:T.textMut,marginTop:4,lineHeight:1.5}}>
              {draft.lockDelete?"المدير + المصرّح لهم فقط":"الكل يقدر يحذف حسب صلاحياته"}
            </div>
          </div>
        </div>

        {/* ═══ Whitelists — show only when at least one lock is active ═══ */}
        {(draft.lockEdit||draft.lockDelete)&&<div style={{padding:14,borderRadius:10,background:T.cardSolid,border:"1px solid "+T.brd}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
            <span style={{fontSize:16}}>👥</span>
            <div style={{fontSize:FS,fontWeight:800,color:T.text}}>قائمة المستخدمين المصرّح لهم</div>
          </div>
          <div style={{fontSize:FS-2,color:T.textMut,marginBottom:12,lineHeight:1.6}}>
            اختار المستخدمين اللي تثق فيهم ليقدروا يتجاوزوا القفل. 
            <b style={{color:T.text}}> ملحوظة:</b> كل واحد في قائمة "الحذف" بيقدر يعدّل تلقائياً (الحذف يشمل التعديل).
          </div>

          {allUsers.length===0?<div style={{padding:"20px 14px",textAlign:"center",background:T.bg,borderRadius:8,color:T.textMut,fontSize:FS-1}}>
            <div style={{fontSize:30,opacity:0.4,marginBottom:6}}>👤</div>
            <div>لا يوجد مستخدمين إضافيين — أضف مستخدمين من قسم "إدارة المستخدمين" أولاً</div>
          </div>:<div style={{display:"grid",gridTemplateColumns:isMob?"1fr":draft.lockEdit&&draft.lockDelete?"1fr 1fr":"1fr",gap:10}}>
            {/* Allowed Editors */}
            {draft.lockEdit&&<div style={{padding:12,borderRadius:10,background:T.accent+"04",border:"1px solid "+T.accent+"20"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                <div style={{fontSize:FS-1,fontWeight:800,color:T.accent,display:"flex",alignItems:"center",gap:6}}>
                  <span>✏️</span><span>مصرّح لهم التعديل</span>
                </div>
                <div style={{fontSize:FS-3,padding:"2px 8px",borderRadius:6,background:T.accent+"15",color:T.accent,fontWeight:700}}>
                  {draft.allowedEditors.length+draft.allowedDeleters.filter(e=>!draft.allowedEditors.includes(e)).length}
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:240,overflowY:"auto"}}>
                {allUsers.map(u=>{
                  const inEditors=draft.allowedEditors.includes(u.email);
                  const inDeleters=draft.allowedDeleters.includes(u.email);
                  const hasAccess=inEditors||inDeleters;/* delete implies edit */
                  const isLocked=inDeleters&&!inEditors;/* can't uncheck here — must uncheck from deleters */
                  return<div key={u.email} onClick={()=>{
                    if(isLocked)return;/* delete implies edit, can't remove */
                    setDraft(p=>({...p,allowedEditors:inEditors?p.allowedEditors.filter(e=>e!==u.email):[...p.allowedEditors,u.email]}));
                  }} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:8,cursor:isLocked?"not-allowed":"pointer",background:hasAccess?T.accent+"10":T.bg,border:"1px solid "+(hasAccess?T.accent+"30":T.brd),opacity:isLocked?0.7:1,transition:"all 0.15s"}}>
                    <div style={{width:18,height:18,borderRadius:5,border:"2px solid "+(hasAccess?T.accent:T.textMut),background:hasAccess?T.accent:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      {hasAccess&&<svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:FS-1,fontWeight:700,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.name||u.email.split("@")[0]}</div>
                      <div style={{fontSize:FS-3,color:T.textMut,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {u.email}
                        {isLocked&&<span style={{marginRight:6,color:T.warn,fontWeight:700}}>• تلقائي من قائمة الحذف</span>}
                      </div>
                    </div>
                  </div>;
                })}
              </div>
            </div>}

            {/* Allowed Deleters */}
            {draft.lockDelete&&<div style={{padding:12,borderRadius:10,background:T.err+"04",border:"1px solid "+T.err+"20"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                <div style={{fontSize:FS-1,fontWeight:800,color:T.err,display:"flex",alignItems:"center",gap:6}}>
                  <span>🗑️</span><span>مصرّح لهم الحذف</span>
                </div>
                <div style={{fontSize:FS-3,padding:"2px 8px",borderRadius:6,background:T.err+"15",color:T.err,fontWeight:700}}>
                  {draft.allowedDeleters.length}
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:240,overflowY:"auto"}}>
                {allUsers.map(u=>{
                  const inDeleters=draft.allowedDeleters.includes(u.email);
                  return<div key={u.email} onClick={()=>{
                    setDraft(p=>({...p,allowedDeleters:inDeleters?p.allowedDeleters.filter(e=>e!==u.email):[...p.allowedDeleters,u.email]}));
                  }} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:8,cursor:"pointer",background:inDeleters?T.err+"10":T.bg,border:"1px solid "+(inDeleters?T.err+"30":T.brd),transition:"all 0.15s"}}>
                    <div style={{width:18,height:18,borderRadius:5,border:"2px solid "+(inDeleters?T.err:T.textMut),background:inDeleters?T.err:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      {inDeleters&&<svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:FS-1,fontWeight:700,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.name||u.email.split("@")[0]}</div>
                      <div style={{fontSize:FS-3,color:T.textMut,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.email}</div>
                    </div>
                  </div>;
                })}
              </div>
            </div>}
          </div>}

          {/* Summary */}
          {allUsers.length>0&&(draft.allowedEditors.length>0||draft.allowedDeleters.length>0)&&<div style={{marginTop:10,padding:"8px 12px",borderRadius:8,background:T.ok+"08",border:"1px solid "+T.ok+"20",fontSize:FS-2,color:T.ok,lineHeight:1.5}}>
            ✅ <b>الخلاصة:</b>
            {draft.lockEdit&&<span> تعديل = مدير + {Array.from(new Set([...draft.allowedEditors,...draft.allowedDeleters])).length} مستخدم</span>}
            {draft.lockDelete&&<span> • حذف = مدير + {draft.allowedDeleters.length} مستخدم</span>}
          </div>}
        </div>}

        <div style={{marginTop:10,padding:"8px 12px",borderRadius:8,background:T.warn+"08",border:"1px solid "+T.warn+"20",fontSize:FS-3,color:T.warn,lineHeight:1.5}}>
          ⚠️ <b>ملاحظة أمان:</b> كل تعديل أو حذف (سواء بواسطة مدير أو مصرّح له) سيُسجَّل في سجل الأمان (audit log) مع البيان والمبلغ والتاريخ.
        </div>
      </div>}

      {/* Save / Discard buttons */}
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16,paddingTop:12,borderTop:"1px solid "+T.brd}}>
        <Btn ghost onClick={handleDiscard} disabled={!isDirty} style={!isDirty?{opacity:0.4}:{}}>↩️ إلغاء التعديلات</Btn>
        <Btn primary onClick={handleSave} disabled={!isDirty} style={!isDirty?{opacity:0.4}:{background:T.ok,color:"#fff",border:"none",fontWeight:800,padding:"10px 24px"}}>💾 حفظ</Btn>
      </div>
    </div>
  </Card>;
}



export function HrSettingsCard({config,upConfig,T,FS,isMob,showToast,Inp,Btn,Sel,Card,setDirty}){
  const savedHR=config.hrSettings||{};
  const buildSnapshot=(hrs)=>({
    workDays:Number(hrs.workDays)||6,
    hoursPerDay:Number(hrs.hoursPerDay)||9,
    defaultBaseHours:hrs.defaultBaseHours!==undefined&&hrs.defaultBaseHours!==""?Number(hrs.defaultBaseHours):((Number(hrs.workDays)||6)*(Number(hrs.hoursPerDay)||9)),
    overtimeMultiplier:hrs.overtimeMultiplier!==undefined&&hrs.overtimeMultiplier!==""?Number(hrs.overtimeMultiplier):1.5,
    absencePenalty:hrs.absencePenalty||"1",
    weekStartDay:hrs.weekStartDay||"sat",
    payDay:hrs.payDay||"thu"
  });
  const[draft,setDraft]=useState(()=>buildSnapshot(savedHR));
  const savedSnap=buildSnapshot(savedHR);
  useEffect(()=>{
    const currentDirty=JSON.stringify(draft)!==JSON.stringify(savedSnap);
    if(!currentDirty)setDraft(buildSnapshot(savedHR));
  },[JSON.stringify(savedSnap)]);/* eslint-disable-line */
  const isDirty=JSON.stringify(draft)!==JSON.stringify(savedSnap);
  useEffect(()=>{setDirty(isDirty)},[isDirty]);/* eslint-disable-line */

  const handleSave=()=>{
    upConfig(d=>{
      if(!d.hrSettings)d.hrSettings={};
      d.hrSettings.workDays=draft.workDays;
      d.hrSettings.hoursPerDay=draft.hoursPerDay;
      d.hrSettings.defaultBaseHours=draft.defaultBaseHours;
      d.hrSettings.overtimeMultiplier=draft.overtimeMultiplier;
      d.hrSettings.absencePenalty=draft.absencePenalty;
      d.hrSettings.weekStartDay=draft.weekStartDay;
      d.hrSettings.payDay=draft.payDay;
    });
    showToast("✅ تم حفظ إعدادات الموظفين");
  };
  const handleDiscard=()=>{
    if(!confirm("سيتم إلغاء كل التعديلات غير المحفوظة. هل تريد المتابعة؟"))return;
    setDraft(buildSnapshot(savedHR));
    showToast("↩️ تم إلغاء التعديلات");
  };
  const updateDraft=(fn)=>setDraft(prev=>{const next={...prev};fn(next);return next});
  const standardHours=draft.workDays*draft.hoursPerDay;

  return<Card title={"👷 إعدادات الموظفين"+(isDirty?" ✨":"")} style={{marginBottom:16,...(isDirty?{border:"2px solid "+T.warn+"60",boxShadow:"0 0 0 3px "+T.warn+"15"}:{})}}>
    <div>
      {isDirty&&<div style={{fontSize:FS-2,color:T.warn,marginBottom:12,padding:"8px 12px",background:T.warn+"10",borderRadius:8,border:"1px solid "+T.warn+"30",fontWeight:700,display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:16}}>✨</span>
        <span>لديك تعديلات غير محفوظة — اضغط "حفظ" للتأكيد أو "إلغاء" للرجوع</span>
      </div>}
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"repeat(3,1fr)",gap:10}}>
        <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>أيام العمل الأسبوعية</label>
          <Inp type="number" value={draft.workDays||""} onChange={v=>updateDraft(d=>{d.workDays=Number(v)||6})} placeholder="6"/></div>
        <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>ساعات العمل اليومية</label>
          <Inp type="number" step="0.5" value={draft.hoursPerDay||""} onChange={v=>updateDraft(d=>{d.hoursPerDay=Number(v)||9})} placeholder="9"/></div>
        <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>إجمالي ساعات الأسبوع (تلقائي)</label>
          <div style={{padding:"8px 12px",borderRadius:8,background:T.accent+"12",color:T.accent,fontWeight:800,fontSize:FS+2,border:"1px solid "+T.accent+"30",textAlign:"center"}}>{standardHours} ساعة</div>
          <div style={{fontSize:FS-3,color:T.textMut,marginTop:4,textAlign:"center"}}>سعر الساعة = المرتب ÷ {standardHours}</div></div>
        <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>ساعات أساسي افتراضية (أسبوعي)</label>
          <Inp type="number" value={draft.defaultBaseHours||""} onChange={v=>updateDraft(d=>{d.defaultBaseHours=Number(v)||0})} placeholder="48"/></div>
        <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>معامل الإضافي</label>
          <Inp type="number" step="0.1" value={draft.overtimeMultiplier||""} onChange={v=>updateDraft(d=>{d.overtimeMultiplier=Number(v)||1.5})} placeholder="1.5"/></div>
        <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>خصم الغياب (بدون إذن)</label>
          <Sel value={draft.absencePenalty} onChange={v=>updateDraft(d=>{d.absencePenalty=v})}>
            <option value="1">يوم واحد</option><option value="2">يومين</option><option value="1.5">يوم ونص</option></Sel></div>
        <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>يوم بداية الأسبوع</label>
          <Sel value={draft.weekStartDay} onChange={v=>updateDraft(d=>{d.weekStartDay=v})}>
            <option value="sat">السبت</option><option value="sun">الأحد</option><option value="mon">الاثنين</option></Sel></div>
        <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>يوم صرف المرتبات</label>
          <Sel value={draft.payDay} onChange={v=>updateDraft(d=>{d.payDay=v})}>
            <option value="thu">الخميس</option><option value="fri">الجمعة</option><option value="wed">الأربعاء</option></Sel></div>
      </div>
      {/* Save / Discard buttons */}
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16,paddingTop:12,borderTop:"1px solid "+T.brd}}>
        <Btn ghost onClick={handleDiscard} disabled={!isDirty} style={!isDirty?{opacity:0.4}:{}}>↩️ إلغاء التعديلات</Btn>
        <Btn primary onClick={handleSave} disabled={!isDirty} style={!isDirty?{opacity:0.4}:{background:T.ok,color:"#fff",border:"none",fontWeight:800,padding:"10px 24px"}}>💾 حفظ</Btn>
      </div>
    </div>
  </Card>;
}



export function PrintSettingsCard({config,upConfig,T,FS,isMob,showToast,Inp,Btn,Sel,Card,setDirty,CLARK_LOGO}){
  const DEFAULT_PS={labelWidth:40,labelHeight:50,orientation:"portrait",margins:2,qrLevel:"M",qrMargin:1,qrColor:"#000000",showBorder:false,fields:{brand:{show:false,size:14},modelNo:{show:true,size:12},desc:{show:false,size:10},qr:{show:true,size:80},series:{show:true,size:12},sizeLabel:{show:true,size:10},price:{show:false,size:10}},salaryPageSize:"A5-landscape",dailyReportSize:"A4"};
  const savedPS=config.printSettings||DEFAULT_PS;
  const buildSnapshot=(ps)=>({
    labelWidth:Number(ps.labelWidth)||40,
    labelHeight:Number(ps.labelHeight)||50,
    margins:Number(ps.margins)||2,
    qrLevel:ps.qrLevel||"M",
    qrColor:ps.qrColor||"#000000",
    qrMargin:ps.qrMargin!==undefined?Number(ps.qrMargin):1,
    showBorder:!!ps.showBorder,
    fields:JSON.parse(JSON.stringify(ps.fields||DEFAULT_PS.fields)),
    salaryPageSize:ps.salaryPageSize||"A5-landscape",
    dailyReportSize:ps.dailyReportSize||"A4"
  });
  const[draft,setDraft]=useState(()=>buildSnapshot(savedPS));
  const savedSnap=buildSnapshot(savedPS);
  useEffect(()=>{
    const currentDirty=JSON.stringify(draft)!==JSON.stringify(savedSnap);
    if(!currentDirty)setDraft(buildSnapshot(savedPS));
  },[JSON.stringify(savedSnap)]);/* eslint-disable-line */
  const isDirty=JSON.stringify(draft)!==JSON.stringify(savedSnap);
  useEffect(()=>{setDirty(isDirty)},[isDirty]);/* eslint-disable-line */

  const handleSave=()=>{
    upConfig(d=>{
      if(!d.printSettings)d.printSettings={};
      d.printSettings.labelWidth=draft.labelWidth;
      d.printSettings.labelHeight=draft.labelHeight;
      d.printSettings.margins=draft.margins;
      d.printSettings.qrLevel=draft.qrLevel;
      d.printSettings.qrColor=draft.qrColor;
      d.printSettings.qrMargin=draft.qrMargin;
      d.printSettings.showBorder=draft.showBorder;
      d.printSettings.fields=JSON.parse(JSON.stringify(draft.fields));
      d.printSettings.salaryPageSize=draft.salaryPageSize;
      d.printSettings.dailyReportSize=draft.dailyReportSize;
    });
    showToast("✅ تم حفظ إعدادات الطباعة");
  };
  const handleDiscard=()=>{
    if(!confirm("سيتم إلغاء كل التعديلات غير المحفوظة. هل تريد المتابعة؟"))return;
    setDraft(buildSnapshot(savedPS));
    showToast("↩️ تم إلغاء التعديلات");
  };
  const updateDraft=(fn)=>setDraft(prev=>{const next=JSON.parse(JSON.stringify(prev));fn(next);return next});
  const toggleField=(key)=>updateDraft(d=>{if(!d.fields[key])d.fields[key]={show:false,size:12};d.fields[key].show=!d.fields[key].show});
  const updateFieldSize=(key,size)=>updateDraft(d=>{if(!d.fields[key])d.fields[key]={show:true,size:12};d.fields[key].size=Number(size)});

  const fields=[{key:"brand",label:"اسم الشركة (CLARK)"},{key:"modelNo",label:"رقم الموديل"},{key:"desc",label:"الوصف"},{key:"qr",label:"كود QR"},{key:"series",label:"عدد القطع (سيري)"},{key:"sizeLabel",label:"المقاس"},{key:"price",label:"السعر"}];

  /* Print test — uses the DRAFT values (so user can preview before saving) */
  const printTest=()=>{
    const ps=draft;
    const w=ps.labelWidth||40;const h=ps.labelHeight||50;const m=ps.margins||2;const qrMM=Math.min(w-m*2,h-m*2)-8;
    const pw_=window.open("","_blank");let html="<html dir='rtl'><head><title>طباعة تجريبية</title><script src='https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js'></"+"script><style>@page{size:"+w+"mm "+h+"mm;margin:"+m+"mm}*{margin:0;padding:0}body{margin:0;padding:0;font-family:'Cairo',Arial,sans-serif}.lbl{width:"+(w-m*2)+"mm;height:"+(h-m*2)+"mm;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center"+(ps.showBorder?";border:1px dashed #999":"")+"}</style></head><body><div class='lbl'>";
    if(ps.fields?.brand?.show)html+="<div style='font-weight:900;font-size:"+((ps.fields?.brand?.size||14)/2.5)+"mm;letter-spacing:2px;line-height:1'>CLARK</div>";
    if(ps.fields?.modelNo?.show!==false)html+="<div style='font-weight:800;font-size:"+((ps.fields?.modelNo?.size||12)/2.5)+"mm;line-height:1.1'>3262114</div>";
    if(ps.fields?.desc?.show)html+="<div style='font-size:"+((ps.fields?.desc?.size||10)/2.5)+"mm;color:#444;line-height:1'>توينز اولادي قطعتين</div>";
    if(ps.fields?.sizeLabel?.show)html+="<div style='font-weight:700;font-size:"+((ps.fields?.sizeLabel?.size||10)/2.5)+"mm;line-height:1'>مقاس: 8</div>";
    if(ps.fields?.qr?.show!==false)html+="<div style='flex:1;display:flex;align-items:center;justify-content:center'><canvas id='qr' style='width:"+qrMM+"mm;height:"+qrMM+"mm'></canvas></div>";
    if(ps.fields?.series?.show)html+="<div style='font-weight:700;font-size:"+((ps.fields?.series?.size||12)/2.5)+"mm;line-height:1'>سيري: 4</div>";
    if(ps.fields?.price?.show)html+="<div style='font-size:"+((ps.fields?.price?.size||10)/2.5)+"mm;line-height:1'>95 ج.م</div>";
    html+="</div><script>if(document.getElementById('qr'))QRCode.toCanvas(document.getElementById('qr'),'CLARK:test:4',{width:400,margin:"+(ps.qrMargin??1)+",errorCorrectionLevel:'"+(ps.qrLevel||"M")+"',color:{dark:'"+(ps.qrColor||"#000000")+"',light:'#ffffff'}},()=>{});setTimeout(()=>window.print(),800)</"+"script></body></html>";
    pw_.document.write(html);pw_.document.close();
  };

  return<Card title={"🖨 إعدادات طباعة QR"+(isDirty?" ✨":"")} style={{marginBottom:16,...(isDirty?{border:"2px solid "+T.warn+"60",boxShadow:"0 0 0 3px "+T.warn+"15"}:{})}}>
    <div>
      {isDirty&&<div style={{fontSize:FS-2,color:T.warn,marginBottom:12,padding:"8px 12px",background:T.warn+"10",borderRadius:8,border:"1px solid "+T.warn+"30",fontWeight:700,display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:16}}>✨</span>
        <span>لديك تعديلات غير محفوظة — اضغط "حفظ" للتأكيد أو "إلغاء" للرجوع</span>
      </div>}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:6,marginBottom:8}}>
        <div><label style={{fontSize:FS-3,color:T.textSec}}>العرض مم</label><Inp type="number" value={draft.labelWidth||40} onChange={v=>updateDraft(d=>{d.labelWidth=Number(v)||40})}/></div>
        <div><label style={{fontSize:FS-3,color:T.textSec}}>الارتفاع مم</label><Inp type="number" value={draft.labelHeight||50} onChange={v=>updateDraft(d=>{d.labelHeight=Number(v)||50})}/></div>
        <div><label style={{fontSize:FS-3,color:T.textSec}}>هوامش مم</label><Inp type="number" value={draft.margins||2} onChange={v=>updateDraft(d=>{d.margins=Number(v)||2})}/></div>
        <div><label style={{fontSize:FS-3,color:T.textSec}}>تصحيح</label><Sel value={draft.qrLevel||"M"} onChange={v=>updateDraft(d=>{d.qrLevel=v})}><option value="L">L</option><option value="M">M</option><option value="Q">Q</option><option value="H">H</option></Sel></div>
      </div>
      <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:8,flexWrap:"wrap"}}>
        <Sel value={draft.qrColor||"#000000"} onChange={v=>updateDraft(d=>{d.qrColor=v})} style={{width:100,fontSize:FS-2}}><option value="#000000">⬛ أسود</option><option value="#1B2A4A">🟦 كحلي</option><option value="#1a1a1a">◼ رمادي</option></Sel>
        <Sel value={draft.qrMargin??1} onChange={v=>updateDraft(d=>{d.qrMargin=Number(v)})} style={{width:80,fontSize:FS-2}}><option value="0">هامش 0</option><option value="1">هامش 1</option><option value="2">هامش 2</option></Sel>
        <span onClick={()=>updateDraft(d=>{d.showBorder=!d.showBorder})} style={{cursor:"pointer",fontSize:FS-1,color:draft.showBorder?T.accent:T.textMut,padding:"4px 8px",borderRadius:6,border:"1px solid "+(draft.showBorder?T.accent+"40":T.brd)}}>{draft.showBorder?"☑":"☐"} إطار</span>
      </div>
      <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>
        {fields.map(f=>{const fv=draft.fields?.[f.key]||{show:false,size:12};const isOn=f.key==="modelNo"||f.key==="qr"?fv.show!==false:fv.show;
          return<div key={f.key} style={{display:"flex",flexDirection:"column",gap:2,padding:"6px 8px",borderRadius:8,background:isOn?T.accent+"06":"transparent",border:"1px solid "+(isOn?T.accent+"25":T.brd),minWidth:100}}>
            <div onClick={()=>toggleField(f.key)} style={{cursor:"pointer",fontSize:FS-2,fontWeight:600,color:isOn?T.accent:T.textMut}}>{isOn?"☑":"☐"} {f.label}</div>
            {isOn&&f.key!=="qr"&&<div style={{display:"flex",alignItems:"center",gap:4}}>
              <span style={{fontSize:FS-3,color:T.textMut}}>حجم</span>
              <input type="range" min="6" max="28" value={fv.size||12} onChange={e=>updateFieldSize(f.key,e.target.value)} style={{width:60,accentColor:T.accent}}/>
              <span style={{fontSize:FS-3,fontWeight:700,color:T.accent,minWidth:20}}>{fv.size||12}</span>
            </div>}
            {isOn&&f.key==="qr"&&<div style={{display:"flex",alignItems:"center",gap:4}}>
              <span style={{fontSize:FS-3,color:T.textMut}}>حجم</span>
              <input type="range" min="40" max="150" step="5" value={fv.size||80} onChange={e=>updateFieldSize("qr",e.target.value)} style={{width:60,accentColor:T.accent}}/>
              <span style={{fontSize:FS-3,fontWeight:700,color:T.accent,minWidth:20}}>{fv.size||80}%</span>
            </div>}
          </div>})}
      </div>
      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
        <Btn small onClick={printTest} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}} title="اختبار بالقيم الحالية (قبل الحفظ)">🖨 طباعة تجريبية</Btn>
        {isDirty&&<span style={{fontSize:FS-3,color:T.warn,fontStyle:"italic"}}>💡 الاختبار يستخدم التعديلات غير المحفوظة</span>}
      </div>
      {/* Print sizes for reports */}
      <div style={{marginTop:12,padding:10,borderRadius:10,background:T.bg,border:"1px solid "+T.brd}}>
        <div style={{fontSize:FS-1,fontWeight:700,color:T.textSec,marginBottom:6}}>📄 إعدادات طباعة التقارير</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div><label style={{fontSize:FS-3,color:T.textMut}}>كشف المرتب</label><Sel value={draft.salaryPageSize||"A5-landscape"} onChange={v=>updateDraft(d=>{d.salaryPageSize=v})}><option value="A5-landscape">A5 أفقي</option><option value="A5-portrait">A5 عمودي</option><option value="A4-portrait">A4 عمودي</option></Sel></div>
          <div><label style={{fontSize:FS-3,color:T.textMut}}>تقرير اليومية</label><Sel value={draft.dailyReportSize||"A4"} onChange={v=>updateDraft(d=>{d.dailyReportSize=v})}><option value="A4">A4</option><option value="A5">A5</option></Sel></div>
        </div>
      </div>
      {/* Save / Discard buttons */}
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16,paddingTop:12,borderTop:"1px solid "+T.brd}}>
        <Btn ghost onClick={handleDiscard} disabled={!isDirty} style={!isDirty?{opacity:0.4}:{}}>↩️ إلغاء التعديلات</Btn>
        <Btn primary onClick={handleSave} disabled={!isDirty} style={!isDirty?{opacity:0.4}:{background:T.ok,color:"#fff",border:"none",fontWeight:800,padding:"10px 24px"}}>💾 حفظ</Btn>
      </div>
    </div>
  </Card>;
}



export function SalesSettingsCard({config,upConfig,T,FS,isMob,showToast,Inp,Btn,Sel,Card,setDirty}){
  const savedSS=config.salesSettings||{};
  const buildSnapshot=(ss)=>({
    defaultCreditLimit:Number(ss.defaultCreditLimit)||0,
    creditAlert:ss.creditAlert!==false,
    allowNoPrice:ss.allowNoPrice!==false,
    defaultPayMethod:ss.defaultPayMethod||"كاش"
  });
  const[draft,setDraft]=useState(()=>buildSnapshot(savedSS));
  const savedSnap=buildSnapshot(savedSS);
  useEffect(()=>{
    const currentDirty=JSON.stringify(draft)!==JSON.stringify(savedSnap);
    if(!currentDirty)setDraft(buildSnapshot(savedSS));
  },[JSON.stringify(savedSnap)]);/* eslint-disable-line */
  const isDirty=JSON.stringify(draft)!==JSON.stringify(savedSnap);
  useEffect(()=>{setDirty(isDirty)},[isDirty]);/* eslint-disable-line */

  const handleSave=()=>{
    upConfig(d=>{
      if(!d.salesSettings)d.salesSettings={};
      d.salesSettings.defaultCreditLimit=draft.defaultCreditLimit;
      d.salesSettings.creditAlert=draft.creditAlert;
      d.salesSettings.allowNoPrice=draft.allowNoPrice;
      d.salesSettings.defaultPayMethod=draft.defaultPayMethod;
    });
    showToast("✅ تم حفظ إعدادات المبيعات");
  };
  const handleDiscard=()=>{
    if(!confirm("سيتم إلغاء كل التعديلات غير المحفوظة. هل تريد المتابعة؟"))return;
    setDraft(buildSnapshot(savedSS));
    showToast("↩️ تم إلغاء التعديلات");
  };
  const updateDraft=(fn)=>setDraft(prev=>{const next={...prev};fn(next);return next});

  return<Card title={"💰 إعدادات المبيعات"+(isDirty?" ✨":"")} style={{marginBottom:16,...(isDirty?{border:"2px solid "+T.warn+"60",boxShadow:"0 0 0 3px "+T.warn+"15"}:{})}}>
    <div>
      {isDirty&&<div style={{fontSize:FS-2,color:T.warn,marginBottom:12,padding:"8px 12px",background:T.warn+"10",borderRadius:8,border:"1px solid "+T.warn+"30",fontWeight:700,display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:16}}>✨</span>
        <span>لديك تعديلات غير محفوظة — اضغط "حفظ" للتأكيد أو "إلغاء" للرجوع</span>
      </div>}
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:10}}>
        <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>حد الائتمان الافتراضي (ج.م)</label>
          <Inp type="number" value={draft.defaultCreditLimit||""} onChange={v=>updateDraft(d=>{d.defaultCreditLimit=Number(v)||0})} placeholder="0 = بدون حد"/></div>
        <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>تنبيه تجاوز الحد</label>
          <Sel value={draft.creditAlert?"on":"off"} onChange={v=>updateDraft(d=>{d.creditAlert=v==="on"})}>
            <option value="on">مفعّل</option><option value="off">معطّل</option></Sel></div>
        <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>السماح بالبيع بدون سعر</label>
          <Sel value={draft.allowNoPrice?"yes":"no"} onChange={v=>updateDraft(d=>{d.allowNoPrice=v==="yes"})}>
            <option value="yes">مسموح</option><option value="no">ممنوع (يجب تحديد سعر البيع)</option></Sel></div>
        <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>طريقة الدفع الافتراضية</label>
          <Sel value={draft.defaultPayMethod} onChange={v=>updateDraft(d=>{d.defaultPayMethod=v})}>
            <option>كاش</option><option>تحويل بنكي</option><option>محفظة</option><option>شيك</option><option>آجل</option></Sel></div>
      </div>
      {/* Save / Discard buttons */}
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16,paddingTop:12,borderTop:"1px solid "+T.brd}}>
        <Btn ghost onClick={handleDiscard} disabled={!isDirty} style={!isDirty?{opacity:0.4}:{}}>↩️ إلغاء التعديلات</Btn>
        <Btn primary onClick={handleSave} disabled={!isDirty} style={!isDirty?{opacity:0.4}:{background:T.ok,color:"#fff",border:"none",fontWeight:800,padding:"10px 24px"}}>💾 حفظ</Btn>
      </div>
    </div>
  </Card>;
}



export function WaContactsCard({config,upConfig,T,FS,isMob,showToast,Inp,Btn,Card,setDirty}){
  const REPORT_TYPES=[
    {k:"treasuryDaily",l:"📊 يومية الخزنة"},
    {k:"customerStatement",l:"👤 كشف حساب عميل"},
    {k:"workshopReport",l:"🏭 تقرير ورشة"},
    {k:"hrWeekly",l:"👷 تقرير المرتبات الأسبوعية"},
    {k:"general",l:"📋 تقارير عامة"}
  ];
  /* Draft state — starts as clone of saved contacts */
  const savedContacts=config.waContacts||[];
  const[draftContacts,setDraftContacts]=useState(()=>JSON.parse(JSON.stringify(savedContacts)));
  /* New contact form — always local (never live-saved) */
  const[newName,setNewName]=useState("");
  const[newPhone,setNewPhone]=useState("");
  const[newRole,setNewRole]=useState("");
  const[newReports,setNewReports]=useState([]);

  /* Sync draft when saved config changes from outside (e.g. another user) */
  useEffect(()=>{
    /* Only sync if NOT dirty to avoid overwriting user's work */
    const currentDirty=JSON.stringify(draftContacts)!==JSON.stringify(savedContacts);
    if(!currentDirty){
      setDraftContacts(JSON.parse(JSON.stringify(savedContacts)));
    }
  },[JSON.stringify(savedContacts)]);/* eslint-disable-line */

  /* Compare draft vs saved to determine dirty state */
  const isDirty=JSON.stringify(draftContacts)!==JSON.stringify(savedContacts);
  /* Report dirty state to parent */
  useEffect(()=>{setDirty(isDirty)},[isDirty]);/* eslint-disable-line */

  /* Save: commit draft to config */
  const handleSave=()=>{
    upConfig(d=>{d.waContacts=JSON.parse(JSON.stringify(draftContacts))});
    showToast("✅ تم حفظ جهات التواصل");
  };
  /* Discard: reset draft to saved */
  const handleDiscard=()=>{
    if(!confirm("سيتم إلغاء كل التعديلات غير المحفوظة. هل تريد المتابعة؟"))return;
    setDraftContacts(JSON.parse(JSON.stringify(savedContacts)));
    showToast("↩️ تم إلغاء التعديلات");
  };

  /* Add new contact to draft (not saved yet) */
  const handleAdd=()=>{
    const name=newName.trim();
    const phone=newPhone.trim();
    if(!name||!phone){showToast("⚠️ ادخل الاسم والرقم");return}
    const cleanPhone=phone.replace(/[^0-9]/g,"");
    if(cleanPhone.length<10){showToast("⚠️ رقم غير صالح");return}
    if(draftContacts.some(c=>c.phone===cleanPhone)){showToast("⚠️ هذا الرقم مضاف بالفعل");return}
    setDraftContacts(prev=>[...prev,{
      id:Math.random().toString(36).slice(2)+Date.now(),
      name,phone:cleanPhone,role:newRole.trim(),
      reports:newReports,
      createdAt:new Date().toISOString()
    }]);
    /* Clear form */
    setNewName("");setNewPhone("");setNewRole("");setNewReports([]);
    showToast("✨ تمت الإضافة للمسودة — اضغط حفظ لتأكيد");
  };
  /* Delete from draft (not saved yet) */
  const handleDelete=(idx,name)=>{
    if(!confirm("حذف جهة «"+name+"» من المسودة؟"))return;
    setDraftContacts(prev=>prev.filter((_,i)=>i!==idx));
    showToast("✨ تم الحذف من المسودة — اضغط حفظ لتأكيد");
  };
  /* Toggle report type for an existing draft contact */
  const handleToggleReport=(idx,reportKey)=>{
    setDraftContacts(prev=>prev.map((c,i)=>{
      if(i!==idx)return c;
      const cur=c.reports||[];
      const newReports=cur.includes(reportKey)?cur.filter(x=>x!==reportKey):[...cur,reportKey];
      return{...c,reports:newReports};
    }));
  };
  /* Toggle report type for the new contact form */
  const handleToggleNewReport=(reportKey)=>{
    setNewReports(prev=>prev.includes(reportKey)?prev.filter(x=>x!==reportKey):[...prev,reportKey]);
  };

  return<Card title={"📱 جهات تواصل التقارير (واتساب)"+(isDirty?" ✨":"")} style={{marginBottom:16,...(isDirty?{border:"2px solid "+T.warn+"60",boxShadow:"0 0 0 3px "+T.warn+"15"}:{})}}>
    <div>
      {isDirty&&<div style={{fontSize:FS-2,color:T.warn,marginBottom:12,padding:"8px 12px",background:T.warn+"10",borderRadius:8,border:"1px solid "+T.warn+"30",fontWeight:700,display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:16}}>✨</span>
        <span>لديك تعديلات غير محفوظة — اضغط "حفظ" للتأكيد أو "إلغاء" للرجوع</span>
      </div>}
      <div style={{fontSize:FS-2,color:T.textSec,marginBottom:12,padding:"8px 12px",background:T.accent+"08",borderRadius:8,border:"1px solid "+T.accent+"20",lineHeight:1.6}}>
        💡 أضف أرقام الواتساب اللي بتبعتلها التقارير (المدير، المحاسب، الشركاء... إلخ).<br/>
        ✔️ اختر أنواع التقارير اللي الجهة دي تستقبلها — أو سيب فاضي لتظهر في كل التقارير.
      </div>

      {/* Add new contact form */}
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"2fr 2fr 2fr",gap:8,marginBottom:10,padding:12,borderRadius:10,background:T.bg,border:"1px solid "+T.brd}}>
        <div><label style={{fontSize:FS-3,color:T.textMut,fontWeight:600}}>الاسم *</label>
          <Inp value={newName} onChange={setNewName} placeholder="مثال: أحمد المدير"/></div>
        <div><label style={{fontSize:FS-3,color:T.textMut,fontWeight:600}}>رقم الواتساب *</label>
          <Inp value={newPhone} onChange={setNewPhone} placeholder="01012345678"/></div>
        <div><label style={{fontSize:FS-3,color:T.textMut,fontWeight:600}}>الصفة / الدور (اختياري)</label>
          <Inp value={newRole} onChange={setNewRole} placeholder="مدير / محاسب / شريك..."/></div>
      </div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8,alignItems:"center"}}>
        <span style={{fontSize:FS-2,color:T.textSec,fontWeight:700,marginLeft:4}}>📋 التقارير:</span>
        {REPORT_TYPES.map(rt=>{
          const sel=newReports.includes(rt.k);
          return<span key={rt.k} onClick={()=>handleToggleNewReport(rt.k)} style={{cursor:"pointer",padding:"4px 10px",borderRadius:6,fontSize:FS-2,fontWeight:700,background:sel?T.accent:T.bg,color:sel?"#fff":T.textSec,border:"1px solid "+(sel?T.accent:T.brd)}}>{rt.l}</span>
        })}
      </div>
      <div style={{display:"flex",gap:6,justifyContent:"flex-end",marginBottom:16}}>
        <Btn primary onClick={handleAdd}>+ إضافة جهة</Btn>
      </div>

      {/* Contacts list from DRAFT */}
      {draftContacts.length>0?<div style={{display:"flex",flexDirection:"column",gap:8}}>
        {draftContacts.map((c,i)=><div key={c.id||i} style={{padding:"10px 14px",borderRadius:10,background:T.cardSolid,border:"1px solid "+T.brd}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,marginBottom:6}}>
            <div>
              <div style={{fontSize:FS,fontWeight:800,color:T.text}}>{c.name}</div>
              <div style={{display:"flex",gap:10,alignItems:"center",marginTop:2}}>
                <span style={{fontSize:FS-2,color:T.textSec,direction:"ltr"}}>{c.phone}</span>
                {c.role&&<span style={{fontSize:FS-3,color:T.textMut}}>• {c.role}</span>}
              </div>
            </div>
            <div style={{display:"flex",gap:4}}>
              <Btn small onClick={()=>{window.open("https://wa.me/"+c.phone,"_blank")}} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}} title="اختبار فتح واتساب">📱</Btn>
              <Btn small danger onClick={()=>handleDelete(i,c.name)}>🗑️</Btn>
            </div>
          </div>
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            {REPORT_TYPES.map(rt=>{
              const sel=(c.reports||[]).includes(rt.k);
              return<span key={rt.k} onClick={()=>handleToggleReport(i,rt.k)} style={{cursor:"pointer",padding:"3px 8px",borderRadius:5,fontSize:FS-3,fontWeight:600,background:sel?T.accent+"15":T.bg,color:sel?T.accent:T.textMut,border:"1px solid "+(sel?T.accent+"40":T.brd)}}>{rt.l}</span>
            })}
            {(!c.reports||c.reports.length===0)&&<span style={{fontSize:FS-3,color:T.warn,fontStyle:"italic",padding:"3px 8px"}}>⚠️ لم تُحدد تقارير — ستظهر في جميع التقارير</span>}
          </div>
        </div>)}
      </div>:<div style={{textAlign:"center",padding:30,color:T.textMut,background:T.bg,borderRadius:10,border:"1px dashed "+T.brd}}>
        <div style={{fontSize:32,marginBottom:6}}>📱</div>
        <div style={{fontSize:FS-1}}>لم تُضف جهات بعد — استخدم النموذج أعلاه لإضافة أول جهة</div>
      </div>}

      {/* Save / Discard buttons */}
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16,paddingTop:12,borderTop:"1px solid "+T.brd}}>
        <Btn ghost onClick={handleDiscard} disabled={!isDirty} style={!isDirty?{opacity:0.4}:{}}>↩️ إلغاء التعديلات</Btn>
        <Btn primary onClick={handleSave} disabled={!isDirty} style={!isDirty?{opacity:0.4}:{background:T.ok,color:"#fff",border:"none",fontWeight:800,padding:"10px 24px"}}>💾 حفظ</Btn>
      </div>
    </div>
  </Card>;
}



export function SettingsPg({config,upConfig,upSales,upTasks,isMob,user,userRole,theme,setTheme,season,orders,syncWsIds,replaceOrder,updOrder,configDoc,salesDoc,tasksDoc}){
  const[newSeason,setNewSeason]=useState("");
  const[newUserEmail,setNewUserEmail]=useState("");const[newUserRole,setNewUserRole]=useState("viewer");
  const[newUserName,setNewUserName]=useState("");const[newUserPass,setNewUserPass]=useState("");const[newUserPass2,setNewUserPass2]=useState("");
  const[createErr,setCreateErr]=useState("");const[createOk,setCreateOk]=useState("");const[creating,setCreating]=useState(false);
  const[clearConfirm,setClearConfirm]=useState(false);
  const[atSelUser,setAtSelUser]=useState("");const[atEditIdx,setAtEditIdx]=useState(null);const[nfEditUser,setNfEditUser]=useState("");
  const[linkMap,setLinkMap]=useState({});
  const[compressing,setCompressing]=useState(false);

  /* ═══════════════════════════════════════════════════════════════
     UNSAVED CHANGES TRACKING FRAMEWORK
     — Each Card with draft state registers itself here as "dirty"
     — When dirty, browser warns before closing tab
     — Used by: WhatsApp Contacts Card (others to follow)
     ═══════════════════════════════════════════════════════════════ */
  const[dirtyCards,setDirtyCards]=useState({});/* {cardKey: true/false} */
  const hasUnsavedChanges=Object.values(dirtyCards).some(v=>v===true);
  /* Warn before closing tab if any card has unsaved changes */
  useEffect(()=>{
    const handler=(e)=>{
      if(hasUnsavedChanges){
        e.preventDefault();
        e.returnValue="عندك تعديلات غير محفوظة. هل تريد المغادرة؟";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload",handler);
    return()=>window.removeEventListener("beforeunload",handler);
  },[hasUnsavedChanges]);

  /* Odoo account mapping — local state to avoid live-save issues */
  const[localMap,setLocalMap]=useState(()=>({...(config.odooSettings?.accountMapping||{})}));
  const[mapSaved,setMapSaved]=useState(false);
  /* Odoo mapping test state — per-category result: {status:'ok'|'bad'|'empty', msg?} */
  const[mapTestResults,setMapTestResults]=useState({});
  const[mapTesting,setMapTesting]=useState(false);
  /* Keep localMap in sync when config loads/changes (e.g. on page reload) */
  useEffect(()=>{const m=config.odooSettings?.accountMapping;if(m&&Object.keys(m).length>0){setLocalMap(prev=>{const merged={...prev};Object.entries(m).forEach(([k,v])=>{if(!merged[k])merged[k]=v});return merged})}},[config.odooSettings?.accountMapping]);
  /* Admin password gate */
  const[pendingAction,setPendingAction]=useState(null);const[adminPass,setAdminPass]=useState("");const[passErr,setPassErr]=useState("");const[passLoading,setPassLoading]=useState(false);
  const requirePass=(action)=>{setPendingAction(()=>action);setAdminPass("");setPassErr("")};
  const confirmPass=async()=>{if(!adminPass){setPassErr("ادخل كلمة المرور");return}setPassLoading(true);setPassErr("");
    try{await signInWithEmailAndPassword(auth,user.email,adminPass);if(pendingAction)pendingAction();setPendingAction(null);setAdminPass("")}
    catch(e){setPassErr("كلمة المرور غير صحيحة")}finally{setPassLoading(false)}};
  const handleLogo=async e=>{const f=e.target.files[0];if(!f)return;const compressed=await compressImage(f,200,0.6);requirePass(()=>upConfig(d=>{d.logo=compressed}))};
  const addSeason=()=>{if(!newSeason.trim())return;requirePass(()=>{upConfig(d=>{if(!d.seasons)d.seasons=[];if(!d.seasons.includes(newSeason.trim()))d.seasons.push(newSeason.trim());d.activeSeason=newSeason.trim()});setNewSeason("")})};
  const deleteSeason=(s)=>{requirePass(async()=>{try{const snap=await getDocs(collection(db,"seasons",s,"orders"));await Promise.all(snap.docs.map(d=>deleteDoc(doc(db,"seasons",s,"orders",d.id))))}catch(e){}upConfig(d=>{d.seasons=(d.seasons||[]).filter(x=>x!==s);if(d.activeSeason===s)d.activeSeason=d.seasons[0]||""})})};
  const clearAllOrders=()=>{requirePass(async()=>{try{const snap=await getDocs(collection(db,"seasons",season,"orders"));await Promise.all(snap.docs.map(d=>deleteDoc(doc(db,"seasons",season,"orders",d.id))))}catch(e){}setClearConfirm(false)})};

  /* ═══ PO Migration V14.48 — Renumber all orders with new sequential format ═══ */
  const[poMigState,setPoMigState]=useState(null);/* null | "confirm1" | "confirm2" | "running" | "done" */
  const[poMigResult,setPoMigResult]=useState(null);/* {total, updated, errors} */
  const runPoMigration=async()=>{
    setPoMigState("running");
    setPoMigResult(null);
    const prefix=config.poPrefix||"PO-";
    const digits=Number(config.poDigits)||3;
    try{
      /* 1. Collect ALL orders from ALL seasons */
      const allSeasons=config.seasons||[];
      const allOrders=[];
      for(const s of allSeasons){
        try{
          const snap=await getDocs(collection(db,"seasons",s,"orders"));
          snap.docs.forEach(d=>{
            const o={_docId:d.id,_season:s,...d.data()};
            if(o.id)allOrders.push(o);
          });
        }catch(e){console.error("Failed to load season "+s+":",e)}
      }
      /* 2. Sort by createdAt (oldest first) */
      allOrders.sort((a,b)=>{
        const ta=a.createdAt||a.date||"";
        const tb=b.createdAt||b.date||"";
        return ta.localeCompare(tb);
      });
      /* 3. Update each order with new PO number */
      let updated=0,errors=0;
      for(let i=0;i<allOrders.length;i++){
        const o=allOrders[i];
        const newPo=prefix+String(i+1).padStart(digits,"0");
        if(o.poNumber===newPo){continue}/* Skip if already correct */
        try{
          await updateDoc(doc(db,"seasons",o._season,"orders",o._docId),{poNumber:newPo});
          updated++;
        }catch(e){
          console.error("Failed to update order "+o.id+":",e);
          errors++;
        }
      }
      setPoMigResult({total:allOrders.length,updated,errors});
      setPoMigState("done");
    }catch(e){
      console.error("PO migration failed:",e);
      setPoMigResult({total:0,updated:0,errors:1,fatal:e.message||String(e)});
      setPoMigState("done");
    }
  };

  const createUser=async()=>{
    setCreateErr("");setCreateOk("");
    if(!newUserName.trim()||!newUserEmail.trim()||!newUserPass){setCreateErr("اكمل جميع البيانات");return}
    if(newUserPass.length<6){setCreateErr("كلمة المرور 6 حروف على الأقل");return}
    if(newUserPass!==newUserPass2){setCreateErr("كلمة المرور غير متطابقة");return}
    setCreating(true);
    try{
      const secAuth=getSecondaryAuth();
      const cred=await createUserWithEmailAndPassword(secAuth,newUserEmail.trim(),newUserPass);
      await updateProfile(cred.user,{displayName:newUserName.trim()});
      await signOut(secAuth);
      upConfig(d=>{if(!d.usersList)d.usersList=[];const ex=d.usersList.find(u=>u.email===newUserEmail.trim());if(ex){ex.role=newUserRole;ex.name=newUserName.trim()}else{d.usersList.push({email:newUserEmail.trim(),role:newUserRole,name:newUserName.trim()})}});
      setCreateOk("تم انشاء الحساب بنجاح: "+newUserEmail.trim());
      setNewUserName("");setNewUserEmail("");setNewUserPass("");setNewUserPass2("");setNewUserRole("viewer");
    }catch(e){
      setCreateErr(e.code==="auth/email-already-in-use"?"الايميل مستخدم بالفعل":"خطأ: "+e.message)
    }
    setCreating(false);
  };

  return<div>
    {/* Admin Password Modal */}
    {pendingAction&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",direction:"rtl"}} onClick={()=>{setPendingAction(null);setAdminPass("");setPassErr("")}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:24,width:isMob?300:360,boxShadow:"0 20px 60px rgba(0,0,0,0.3)",border:"1px solid "+T.brd}}>
        <div style={{fontSize:FS+2,fontWeight:800,color:T.text,marginBottom:4,textAlign:"center"}}>🔐 تأكيد الهوية</div>
        <div style={{fontSize:FS-1,color:T.textSec,textAlign:"center",marginBottom:16}}>ادخل كلمة مرور المدير للمتابعة</div>
        <Inp type="password" value={adminPass} onChange={setAdminPass} placeholder="كلمة المرور"/>
        {passErr&&<div style={{color:T.err,fontSize:FS-1,fontWeight:600,marginTop:6,textAlign:"center"}}>{passErr}</div>}
        <div style={{display:"flex",gap:8,marginTop:14,justifyContent:"center"}}>
          <Btn primary onClick={confirmPass} disabled={passLoading}>{passLoading?<span style={{display:"inline-flex",alignItems:"center",gap:8}}><Spinner size="small" color="#fff" inline/>جاري التحقق...</span>:"تأكيد"}</Btn>
          <Btn ghost onClick={()=>{setPendingAction(null);setAdminPass("");setPassErr("")}}>الغاء</Btn>
        </div>
      </div>
    </div>}
    <Card title="ادارة المواسم" style={{marginBottom:12}}>
      <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}><Inp value={newSeason} onChange={setNewSeason} placeholder="اسم الموسم (مثال: SS27)" style={{width:220}}/><Btn primary onClick={addSeason}>+ موسم جديد</Btn></div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {(config.seasons||[]).map(s=><div key={s} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderRadius:12,border:s===config.activeSeason?"2px solid "+T.accent:"1px solid "+T.brd,background:s===config.activeSeason?T.accentBg:T.cardSolid,flexWrap:"wrap",gap:8}}>
          <div onClick={()=>requirePass(()=>upConfig(d=>{d.activeSeason=s}))} style={{cursor:"pointer",display:"flex",alignItems:"center",gap:10}}><span style={{fontWeight:700,fontSize:FS+2,color:s===config.activeSeason?T.accent:T.text}}>{s}</span>{s===config.activeSeason&&<span style={{fontSize:FS-3,color:T.ok,background:T.ok+"15",padding:"2px 10px",borderRadius:12}}>نشط</span>}</div>
          <div style={{display:"flex",gap:8}}>{s!==config.activeSeason&&<Btn small onClick={()=>requirePass(()=>upConfig(d=>{d.activeSeason=s}))} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}}>تفعيل</Btn>}<Btn danger small onClick={()=>deleteSeason(s)}>حذف</Btn></div>
        </div>)}
      </div>
    </Card>
    {/* ═══ PO NUMBER SETTINGS — V14.48 ═══ */}
    <Card title="📋 إعدادات أمر التشغيل (PO)" style={{marginBottom:12}}>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:12,marginBottom:14}}>
        <div>
          <label style={{fontSize:FS-1,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>البادئة (Prefix)</label>
          <Inp value={config.poPrefix||"PO-"} onChange={v=>upConfig(d=>{d.poPrefix=v})} placeholder="PO-" sx={{fontFamily:"monospace",fontWeight:700,letterSpacing:1}}/>
          <div style={{fontSize:FS-3,color:T.textMut,marginTop:4}}>مثال: PO- أو ORD- أو PROD-</div>
        </div>
        <div>
          <label style={{fontSize:FS-1,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>عدد الأرقام</label>
          <Inp type="number" value={config.poDigits||3} onChange={v=>{const n=Math.max(2,Math.min(6,Number(v)||3));upConfig(d=>{d.poDigits=n})}} sx={{fontFamily:"monospace",fontWeight:700,textAlign:"center"}}/>
          <div style={{fontSize:FS-3,color:T.textMut,marginTop:4}}>من 2 إلى 6 أرقام (مثال: 3 = PO-001)</div>
        </div>
      </div>
      {/* Live preview */}
      <div style={{padding:"10px 14px",borderRadius:10,background:T.accent+"08",border:"1px solid "+T.accent+"20",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <span style={{fontSize:FS-1,color:T.textSec,fontWeight:600}}>معاينة الرقم الجديد:</span>
        <span style={{fontSize:FS+3,fontWeight:800,color:T.accent,fontFamily:"monospace",letterSpacing:2}}>
          {(config.poPrefix||"PO-")+String(1).padStart(Number(config.poDigits)||3,"0")}
        </span>
      </div>

      {/* Migration section */}
      <div style={{padding:14,borderRadius:10,background:T.err+"06",border:"1px solid "+T.err+"30"}}>
        <div style={{fontSize:FS,fontWeight:800,color:T.err,marginBottom:6,display:"flex",alignItems:"center",gap:6}}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <span>تحويل الأرقام القديمة (عملية خطيرة)</span>
        </div>
        <div style={{fontSize:FS-1,color:T.textSec,lineHeight:1.6,marginBottom:10}}>
          هذه العملية ستعيد ترقيم <b>جميع</b> الأوامر في <b>جميع المواسم</b> بالصيغة الجديدة حسب تاريخ الإنشاء.
          <br/>الأرقام القديمة ستُحذف نهائياً ولن يمكن استرجاعها.
        </div>

        {poMigState===null&&<Btn danger onClick={()=>setPoMigState("confirm1")}>
          🔄 بدء تحويل الأرقام
        </Btn>}

        {poMigState==="confirm1"&&<div style={{padding:12,background:T.err+"10",borderRadius:8,border:"1px dashed "+T.err+"50"}}>
          <div style={{fontSize:FS,fontWeight:700,color:T.err,marginBottom:8}}>⚠️ تأكيد أول</div>
          <div style={{fontSize:FS-1,color:T.text,marginBottom:10}}>
            هل أنت متأكد أنك تريد إعادة ترقيم جميع الأوامر القديمة؟ هذه العملية <b>لا يمكن التراجع عنها</b>.
          </div>
          <div style={{display:"flex",gap:8}}>
            <Btn danger small onClick={()=>setPoMigState("confirm2")}>نعم، متأكد</Btn>
            <Btn ghost small onClick={()=>setPoMigState(null)}>إلغاء</Btn>
          </div>
        </div>}

        {poMigState==="confirm2"&&<div style={{padding:12,background:T.err+"15",borderRadius:8,border:"2px solid "+T.err+"60"}}>
          <div style={{fontSize:FS,fontWeight:800,color:T.err,marginBottom:8}}>🚨 تأكيد نهائي</div>
          <div style={{fontSize:FS-1,color:T.text,marginBottom:10}}>
            آخر فرصة للإلغاء. اكتب كلمة <b>"تحويل"</b> للمتابعة:
          </div>
          <PoMigConfirm onConfirm={()=>requirePass(runPoMigration)} onCancel={()=>setPoMigState(null)} T={T} FS={FS}/>
        </div>}

        {poMigState==="running"&&<div style={{padding:16,textAlign:"center",background:T.bg,borderRadius:8}}>
          <div style={{fontSize:FS,fontWeight:700,color:T.accent,marginBottom:6}}>🔄 جاري التحويل...</div>
          <div style={{fontSize:FS-1,color:T.textSec}}>لا تغلق النافذة حتى اكتمال العملية</div>
        </div>}

        {poMigState==="done"&&poMigResult&&<div style={{padding:14,borderRadius:8,background:poMigResult.errors>0?T.warn+"10":T.ok+"10",border:"1px solid "+(poMigResult.errors>0?T.warn:T.ok)+"40"}}>
          <div style={{fontSize:FS,fontWeight:800,color:poMigResult.errors>0?T.warn:T.ok,marginBottom:8}}>
            {poMigResult.fatal?"❌ فشل التحويل":poMigResult.errors>0?"⚠️ اكتمل مع أخطاء":"✅ اكتمل التحويل بنجاح"}
          </div>
          <div style={{fontSize:FS-1,color:T.text,lineHeight:1.6}}>
            <div>• إجمالي الأوامر: <b>{poMigResult.total}</b></div>
            <div>• تم تحديثها: <b style={{color:T.ok}}>{poMigResult.updated}</b></div>
            {poMigResult.errors>0&&<div>• أخطاء: <b style={{color:T.err}}>{poMigResult.errors}</b></div>}
            {poMigResult.fatal&&<div style={{marginTop:6,color:T.err}}>الخطأ: {poMigResult.fatal}</div>}
          </div>
          <Btn small onClick={()=>{setPoMigState(null);setPoMigResult(null)}} style={{marginTop:10}}>إغلاق</Btn>
        </div>}
      </div>
    </Card>

    <Card title="مسح بيانات الأوردرات" style={{marginBottom:12}}>
      <div style={{fontSize:FS,color:T.textSec,marginBottom:10}}>{"الموسم الحالي: "+season+" - عدد الأوردرات: "+(orders||[]).length}</div>
      {!clearConfirm?<Btn danger onClick={()=>setClearConfirm(true)}>مسح جميع الأوردرات للموسم الحالي</Btn>:
      <div style={{padding:16,background:T.err+"08",borderRadius:12,border:"1px solid "+T.err+"30"}}>
        <div style={{fontSize:FS,fontWeight:700,color:T.err,marginBottom:10}}>{"⚠️ سيتم حذف "+(orders||[]).length+" أوردر نهائياً مع جميع التسليمات - هل أنت متأكد؟"}</div>
        <div style={{display:"flex",gap:8}}><Btn danger onClick={clearAllOrders}>تأكيد المسح</Btn><Btn ghost onClick={()=>setClearConfirm(false)}>الغاء</Btn></div>
      </div>}
    </Card>
    <Card title="لوجو المصنع" style={{marginBottom:12}}>
      <div style={{display:"flex",alignItems:"center",gap:20,flexWrap:"wrap"}}>
        <div style={{width:80,height:80,borderRadius:12,border:"2px dashed "+T.brd,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",background:T.inputBg||T.cardSolid,cursor:"pointer",position:"relative"}}>{config.logo?<img src={config.logo} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<span style={{fontSize:FS-1,color:T.textMut}}>لوجو</span>}<input type="file" accept="image/*" onChange={handleLogo} style={{position:"absolute",inset:0,opacity:0,cursor:"pointer"}}/></div>
        <div><div style={{fontSize:FS,color:T.text,fontWeight:600,marginBottom:4}}>اضغط لرفع اللوجو</div>{config.logo&&<Btn danger small onClick={()=>requirePass(()=>upConfig(d=>{d.logo=""}))} style={{marginTop:4}}>حذف اللوجو</Btn>}</div>
      </div>
    </Card>
    <Card title="ادارة المستخدمين" style={{marginBottom:16}}>
      {/* Create new user */}
      <div style={{padding:20,background:T.accentBg,borderRadius:14,marginBottom:20,border:"1px solid "+T.accent+"20"}}>
        <div style={{fontSize:FS+1,fontWeight:700,color:T.accent,marginBottom:14}}>انشاء حساب جديد</div>
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:10,marginBottom:10}}>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap",fontWeight:600}}>اسم المستخدم *</label><Inp value={newUserName} onChange={setNewUserName} placeholder="الاسم الكامل"/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap",fontWeight:600}}>البريد الالكتروني *</label><Inp value={newUserEmail} onChange={setNewUserEmail} placeholder="example@email.com" type="email"/></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr 1fr",gap:10,marginBottom:10}}>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap",fontWeight:600}}>كلمة المرور *</label><Inp value={newUserPass} onChange={setNewUserPass} type="password" placeholder="6 حروف على الأقل"/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap",fontWeight:600}}>تأكيد كلمة المرور *</label><Inp value={newUserPass2} onChange={setNewUserPass2} type="password" placeholder="أعد كتابة كلمة المرور"/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap",fontWeight:600}}>الصلاحية</label><Sel value={newUserRole} onChange={setNewUserRole}><option value="admin">مدير النظام</option><option value="manager">مدير انتاج</option><option value="sales_accountant">محاسب مبيعات</option><option value="purchase_accountant">محاسب مشتريات</option><option value="viewer">مشاهد فقط</option></Sel></div>
        </div>
        {createErr&&<div style={{color:T.err,fontSize:FS,marginBottom:10,fontWeight:600}}>{"⚠️ "+createErr}</div>}
        {createOk&&<div style={{color:T.ok,fontSize:FS,marginBottom:10,fontWeight:600}}>{"✓ "+createOk}</div>}
        <Btn primary onClick={createUser} disabled={creating}>{creating?<span style={{display:"inline-flex",alignItems:"center",gap:8}}><Spinner size="small" color="#fff" inline/>جاري الانشاء...</span>:"انشاء الحساب"}</Btn>
      </div>
      {/* Existing users */}
      <div style={{fontSize:FS,fontWeight:700,color:T.text,marginBottom:10}}>المستخدمين الحاليين</div>
      {(config.usersList||[]).length>0&&<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:500}}><thead><tr>{["الاسم","البريد","الصلاحية",""].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
        {(config.usersList||[]).map((u,i)=><tr key={i}><td style={{...TD,fontWeight:600}}>{u.name||"-"}</td><td style={TD}>{u.email}</td><td style={TD}><Sel value={u.role} onChange={v=>requirePass(()=>upConfig(d=>{const x=(d.usersList||[]).find(z=>z.email===u.email);if(x)x.role=v}))}><option value="admin">مدير النظام</option><option value="manager">مدير انتاج</option><option value="sales_accountant">محاسب مبيعات</option><option value="purchase_accountant">محاسب مشتريات</option><option value="viewer">مشاهد فقط</option></Sel></td><td style={TD}>{(()=>{const hasTasks=(Array.isArray(config.tasks)?config.tasks:[]).some(t=>t.toEmail===u.email&&!t.done);return<DelBtn onConfirm={()=>requirePass(()=>upConfig(d=>{d.usersList=(d.usersList||[]).filter(x=>x.email!==u.email)}))} blocked={hasTasks?"لديه مهام مفتوحة":null}/>})()}</td></tr>)}
      </tbody></table></div>}
      {(config.usersList||[]).length===0&&<div style={{textAlign:"center",padding:20,color:T.textSec}}>لم يتم اضافة مستخدمين</div>}
      <div style={{marginTop:16,display:"grid",gridTemplateColumns:isMob?"1fr":"repeat(3,1fr)",gap:12}}>
        {[["مدير النظام",T.accent,"كل الصلاحيات + اعدادات"],["مدير انتاج",T.ok,"اضافة وتعديل"],["محاسب مبيعات","#8B5CF6","تسليم عملاء + تقارير"],["محاسب مشتريات","#F59E0B","تشغيل + حسابات ورش"],["مشاهد",T.warn,"عرض فقط"]].map(([n,c,d])=><div key={n} style={{padding:14,borderRadius:12,background:c+"08",border:"1px solid "+c+"25"}}><div style={{fontSize:FS,fontWeight:700,color:c,marginBottom:4}}>{n}</div><div style={{fontSize:FS-2,color:T.textSec}}>{d}</div></div>)}
      </div>
    </Card>
    {/* Send Notifications */}
    {/* Permissions Management */}
    <Card title="🔐 صلاحيات المستخدمين" style={{marginBottom:16}}>
      {(()=>{
        const perms=config.permissions||{};
        const roles=["admin","manager","sales_accountant","purchase_accountant","viewer"];
        const roleLabels={admin:"أدمن",manager:"مدير",sales_accountant:"مبيعات",purchase_accountant:"مشتريات",viewer:"مشاهد"};
        const tabs=TABS;
        const levels=["edit","view","hide"];
        const levelLabels={edit:"✏️ تعديل",view:"👁 عرض",hide:"❌ مخفي"};
        const levelColors={edit:T.ok,view:T.warn,hide:T.err};
        const setPerm=(role,tabKey,level)=>upConfig(d=>{if(!d.permissions)d.permissions={};if(!d.permissions[role])d.permissions[role]={};d.permissions[role][tabKey]=level});
        return<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:500}}>
          <thead><tr><th style={TH}>الشاشة</th>{roles.map(r=><th key={r} style={{...TH,textAlign:"center"}}>{roleLabels[r]}</th>)}</tr></thead>
          <tbody>{tabs.map(t=><tr key={t.key}>
            <td style={{...TD,fontWeight:600}}><span style={{marginLeft:6}}>{t.icon}</span>{t.label}</td>
            {roles.map(r=>{const defPerms={admin:{dashboard:"edit",details:"edit",external:"edit",stock:"edit",reports:"edit",calc:"edit",tasks:"edit",db:"edit",settings:"edit",custDeliver:"edit",treasury:"edit",hr:"edit"},manager:{dashboard:"edit",details:"edit",external:"edit",stock:"edit",reports:"edit",calc:"edit",tasks:"edit",db:"edit",settings:"hide",custDeliver:"edit",treasury:"view",hr:"view"},sales_accountant:{dashboard:"view",details:"view",external:"hide",stock:"view",reports:"edit",calc:"hide",tasks:"edit",db:"hide",settings:"hide",custDeliver:"edit",treasury:"hide",hr:"hide"},purchase_accountant:{dashboard:"view",details:"view",external:"edit",stock:"edit",reports:"edit",calc:"edit",tasks:"edit",db:"edit",settings:"hide",custDeliver:"hide",treasury:"edit",hr:"hide"},viewer:{dashboard:"view",details:"view",external:"hide",stock:"hide",reports:"view",calc:"view",tasks:"edit",db:"hide",settings:"hide",custDeliver:"hide",treasury:"hide",hr:"hide"}};const cur=(perms[r]||{})[t.key]||(defPerms[r]||{})[t.key]||"view";
              return<td key={r} style={{...TD,textAlign:"center",padding:"4px 6px"}}>
                {r==="admin"&&t.key==="settings"?<span style={{fontSize:FS-2,color:T.ok,fontWeight:600}}>✏️ دائماً</span>:
                <select value={cur} onChange={e=>setPerm(r,t.key,e.target.value)} style={{padding:"4px 8px",borderRadius:6,border:"1px solid "+T.brd,fontSize:FS-2,fontFamily:"inherit",background:T.inputBg||T.cardSolid,color:levelColors[cur],fontWeight:700,cursor:"pointer"}}>
                  {levels.map(l=><option key={l} value={l}>{levelLabels[l]}</option>)}
                </select>}
              </td>})}
          </tr>)}</tbody>
        </table></div>
      })()}
    </Card>
    {/* Print Settings — draft pattern */}
    <PrintSettingsCard config={config} upConfig={upConfig} T={T} FS={FS} isMob={isMob} showToast={showToast} Inp={Inp} Btn={Btn} Sel={Sel} Card={Card} setDirty={(d)=>setDirtyCards(p=>({...p,printSettings:d}))}/>
    {/* Treasury Settings — draft pattern */}
    <TreasurySettingsCard config={config} upConfig={upConfig} T={T} FS={FS} isMob={isMob} showToast={showToast} Inp={Inp} Btn={Btn} Sel={Sel} Card={Card} setDirty={(d)=>setDirtyCards(p=>({...p,treasurySettings:d}))} userRole={userRole}/>

    {/* Odoo Sync Settings */}
    <Card title="🔗 ربط Odoo — تزامن الخزنة" style={{marginBottom:16}}>
      {(()=>{const os=config.odooSettings||{};
        const saveOS=(fn)=>upConfig(d=>{if(!d.odooSettings)d.odooSettings={};fn(d.odooSettings)});
        const[testResult,setTestResult]=useState(null);const[testing,setTesting]=useState(false);
        const testConnection=async()=>{setTesting(true);setTestResult(null);
          try{const r=await fetch("/api/odoo-sync",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"authenticate",odooUrl:os.url||"",odooDb:os.db||"",odooUser:os.user||"",odooKey:os.apiKey||""})});
            const d=await r.json();if(r.ok&&d.uid){setTestResult({ok:true,msg:"✅ تم الاتصال بنجاح (UID: "+d.uid+")"})}else{setTestResult({ok:false,msg:"❌ فشل: "+(d.error||"خطأ غير معروف")})}}
          catch(e){setTestResult({ok:false,msg:"❌ خطأ: "+e.message})}setTesting(false)};
        /* Category → Odoo account mapping */
        const ts=config.treasurySettings||{};
        const outCats=ts.outCategories||["تكلفة","مشتريات","مرتبات","قطع غيار","صيانة ماكينات","خيط","تشغيل خارجي","نقل","كهرباء","ايجار المصنع","نثريات","اكسسوار","مستلزمات تشغيل","ورق ماركر","خدمات","أصول ثابتة","تكاليف أخرى"];
        const inCats=ts.inCategories||["وارد","إيرادات","دفعة عميل","رأس مال","تحويل"];
        const allCats=[...outCats,...inCats];
        const mapping=os.accountMapping||{};
        return<div>
          <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"repeat(2,1fr)",gap:10,marginBottom:12}}>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>Odoo URL</label>
              <Inp value={os.url||""} onChange={v=>saveOS(s=>{s.url=v})} placeholder="https://yourcompany.odoo.com"/></div>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>Database</label>
              <Inp value={os.db||""} onChange={v=>saveOS(s=>{s.db=v})} placeholder="database name"/></div>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>Email</label>
              <Inp value={os.user||""} onChange={v=>saveOS(s=>{s.user=v})} placeholder="user@example.com"/></div>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>API Key</label>
              <Inp value={os.apiKey||""} onChange={v=>saveOS(s=>{s.apiKey=v})} placeholder="API Key" type="password"/></div>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>دفتر اليومية</label>
              <Inp value={os.journalName||""} onChange={v=>saveOS(s=>{s.journalName=v})} placeholder="الخزينة الفرعية"/></div>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>حساب الخزينة الفرعية</label>
              <Inp value={os.cashAccountCode||""} onChange={v=>saveOS(s=>{s.cashAccountCode=v})} placeholder="105001"/></div>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>حساب افتراضي (للتصنيفات الغير مربوطة)</label>
              <Inp value={os.defaultAccountCode||""} onChange={v=>saveOS(s=>{s.defaultAccountCode=v})} placeholder="اختياري — كود حساب"/></div>
          </div>
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            <Btn onClick={testConnection} disabled={testing||!os.url||!os.db||!os.user||!os.apiKey} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}}>{testing?<span style={{display:"inline-flex",alignItems:"center",gap:8}}><Spinner size="small" color={T.accent} inline/>جاري الاختبار...</span>:"🔌 اختبار الاتصال"}</Btn>
            {testResult&&<span style={{fontSize:FS-1,fontWeight:700,color:testResult.ok?T.ok:T.err,padding:"6px 12px",borderRadius:8,background:testResult.ok?T.ok+"08":T.err+"08"}}>{testResult.msg}</span>}
          </div>
          <div style={{marginTop:12,borderTop:"1px solid "+T.brd,paddingTop:12}}>
            <div style={{fontSize:FS,fontWeight:700,color:T.text,marginBottom:8}}>📋 ربط التصنيفات بحسابات Odoo</div>
            <div style={{fontSize:FS-2,color:T.textMut,marginBottom:8}}>اكتب كود الحساب في Odoo لكل تصنيف، اضغط حفظ، ثم اضغط "اختبار الربط" للتأكد من وجود كل الحسابات في Odoo قبل التزامن.</div>
            {(()=>{
              const saveMap=()=>{upConfig(d=>{if(!d.odooSettings)d.odooSettings={};d.odooSettings.accountMapping={...localMap}});setMapSaved(true);showToast("✅ تم حفظ ربط الحسابات");setTimeout(()=>setMapSaved(false),2000)};
              /* Test mapping: call find_account for each non-empty code and record result */
              const testMapping=async()=>{
                if(!os.url||!os.db||!os.user||!os.apiKey){showToast("⚠️ أكمل إعدادات Odoo أولاً");return}
                setMapTesting(true);setMapTestResults({});
                const results={};
                const entries=Object.entries(localMap).filter(([k,v])=>v&&v.trim());
                if(entries.length===0){showToast("⚠️ لا توجد أكواد حسابات للاختبار");setMapTesting(false);return}
                /* Also test the default account + cash account if set */
                const extraTests=[];
                if(os.cashAccountCode&&os.cashAccountCode.trim())extraTests.push(["__cash__",os.cashAccountCode.trim()]);
                if(os.defaultAccountCode&&os.defaultAccountCode.trim())extraTests.push(["__default__",os.defaultAccountCode.trim()]);
                const allTests=[...entries,...extraTests];
                for(const[cat,code]of allTests){
                  try{
                    const r=await fetch("/api/odoo-sync",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"find_account",odooUrl:os.url,odooDb:os.db,odooUser:os.user,odooKey:os.apiKey,payload:{accountCode:code.trim()}})});
                    const d=await r.json();
                    if(r.ok&&d.accountId){results[cat]={status:"ok",msg:"ID: "+d.accountId}}
                    else{results[cat]={status:"bad",msg:d.error||"غير موجود"}}
                  }catch(e){results[cat]={status:"bad",msg:e.message}}
                  setMapTestResults({...results});/* Update UI progressively */
                }
                setMapTesting(false);
                const okCount=Object.values(results).filter(r=>r.status==="ok").length;
                const badCount=Object.values(results).filter(r=>r.status==="bad").length;
                if(badCount===0)showToast("✅ كل الحسابات موجودة في Odoo ("+okCount+")");
                else showToast("⚠️ "+okCount+" ناجح، "+badCount+" فشل — راجع النتائج")
              };
              return<div>
                <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:6}}>
                  {allCats.map(cat=>{const res=mapTestResults[cat];return<div key={cat} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 0"}}>
                    <span style={{fontSize:FS-2,fontWeight:600,color:outCats.includes(cat)?T.err:T.ok,minWidth:130,textAlign:"right"}}>{outCats.includes(cat)?"📤":"📥"} {cat}</span>
                    <input value={localMap[cat]||""} onChange={e=>setLocalMap(p=>({...p,[cat]:e.target.value}))} placeholder="كود الحساب" style={{flex:1,padding:"4px 8px",borderRadius:6,border:"1px solid "+(res?.status==="ok"?T.ok:res?.status==="bad"?T.err:T.brd),fontSize:FS-2,fontFamily:"inherit",background:T.inputBg,color:T.text,maxWidth:120,direction:"ltr",textAlign:"center"}}/>
                    {res&&<span style={{fontSize:FS-3,fontWeight:700,color:res.status==="ok"?T.ok:T.err,minWidth:20}} title={res.msg}>{res.status==="ok"?"✅":"❌"}</span>}
                  </div>})}
                </div>
                {/* Extra tests for cash + default accounts */}
                {(mapTestResults.__cash__||mapTestResults.__default__)&&<div style={{marginTop:8,padding:8,background:T.bg,borderRadius:6,fontSize:FS-2}}>
                  {mapTestResults.__cash__&&<div style={{color:mapTestResults.__cash__.status==="ok"?T.ok:T.err,fontWeight:600}}>{mapTestResults.__cash__.status==="ok"?"✅":"❌"} حساب الخزينة ({os.cashAccountCode}): {mapTestResults.__cash__.msg}</div>}
                  {mapTestResults.__default__&&<div style={{color:mapTestResults.__default__.status==="ok"?T.ok:T.err,fontWeight:600}}>{mapTestResults.__default__.status==="ok"?"✅":"❌"} الحساب الافتراضي ({os.defaultAccountCode}): {mapTestResults.__default__.msg}</div>}
                </div>}
                <div style={{marginTop:10,display:"flex",gap:8,flexWrap:"wrap"}}>
                  <Btn primary onClick={saveMap}>{mapSaved?"✅ تم الحفظ":"💾 حفظ ربط الحسابات"}</Btn>
                  <Btn onClick={testMapping} disabled={mapTesting||!os.url||!os.apiKey} style={{background:"#8B5CF612",color:"#8B5CF6",border:"1px solid #8B5CF630",fontWeight:700}}>{mapTesting?<span style={{display:"inline-flex",alignItems:"center",gap:8}}><Spinner size="small" color="#8B5CF6" inline/>جاري اختبار الحسابات...</span>:"🧪 اختبار ربط الحسابات"}</Btn>
                </div>
              </div>})()}
          </div>
        </div>})()}
    </Card>

    {/* WhatsApp Report Contacts Settings — with draft pattern + save button */}
    <WaContactsCard config={config} upConfig={upConfig} T={T} FS={FS} isMob={isMob} showToast={showToast} Inp={Inp} Btn={Btn} Card={Card} setDirty={(d)=>setDirtyCards(p=>({...p,waContacts:d}))}/>

    {/* HR Settings — draft pattern */}
    <HrSettingsCard config={config} upConfig={upConfig} T={T} FS={FS} isMob={isMob} showToast={showToast} Inp={Inp} Btn={Btn} Sel={Sel} Card={Card} setDirty={(d)=>setDirtyCards(p=>({...p,hrSettings:d}))}/>

    {/* Security Flags Settings */}
    <Card title="🛡️ إعدادات التنبيهات الأمنية" style={{marginBottom:16}}>
      {(()=>{const sec=config.securitySettings||{};
        const saveSec=(fn)=>upConfig(d=>{if(!d.securitySettings)d.securitySettings={};fn(d.securitySettings)});
        const FlagRow=({icon,label,desc,children,enabled,onToggle})=><div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:10,background:enabled!==false?T.cardSolid:T.bg,border:"1px solid "+(enabled!==false?T.brd:T.textMut+"20"),marginBottom:8,opacity:enabled!==false?1:0.6}}>
          <div style={{fontSize:24,flexShrink:0}}>{icon}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:FS,fontWeight:700,color:T.text}}>{label}</div>
            <div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>{desc}</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
            {children}
            <label style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer"}}><input type="checkbox" checked={enabled!==false} onChange={ev=>onToggle(ev.target.checked)} style={{width:18,height:18,cursor:"pointer"}}/></label>
          </div>
        </div>;
        return<div>
          <div style={{fontSize:FS-2,color:T.textSec,marginBottom:12,padding:"10px 14px",background:T.accent+"06",borderRadius:8,border:"1px solid "+T.accent+"20",lineHeight:1.7}}>
            ℹ️ فعّل/عطّل كل تنبيه حسب حاجتك. لو التنبيه مفعّل، يظهر في صفحة الأسبوع المفتوح + Dashboard الأمن.
          </div>
          <FlagRow icon="⏰" label="ساعات يومية مرتفعة" desc="تنبيه لو موظف بصم أكتر من الحد ده في يوم واحد" enabled={sec.flagExcessiveHours!==false} onToggle={v=>saveSec(s=>{s.flagExcessiveHours=v})}>
            <Inp type="number" step="0.5" value={sec.maxDailyHours||""} onChange={v=>saveSec(s=>{s.maxDailyHours=Number(v)||14})} placeholder="14" style={{width:70,textAlign:"center"}}/>
            <span style={{fontSize:FS-3,color:T.textMut}}>ساعة</span>
          </FlagRow>
          <FlagRow icon="🔄" label="ساعات متطابقة كل الأيام" desc="ساعات متطابقة بالظبط كل يوم (مشبوه: buddy punching)" enabled={sec.flagIdenticalHours!==false} onToggle={v=>saveSec(s=>{s.flagIdenticalHours=v})}/>
          <FlagRow icon="👥" label="تطابق جماعي في يوم واحد" desc="أكثر من الحد ده من الموظفين بنفس الساعات في نفس اليوم" enabled={sec.flagSameHoursMultiple!==false} onToggle={v=>saveSec(s=>{s.flagSameHoursMultiple=v})}>
            <Inp type="number" value={sec.minEmpsForSameHours||""} onChange={v=>saveSec(s=>{s.minEmpsForSameHours=Number(v)||3})} placeholder="3" style={{width:60,textAlign:"center"}}/>
            <span style={{fontSize:FS-3,color:T.textMut}}>موظف+</span>
          </FlagRow>
          <FlagRow icon="📈" label="ارتفاع فجائي في الساعات" desc="ساعات الموظف ارتفعت بنسبة أكبر من الحد مقارنة بالمتوسط" enabled={sec.flagSuddenSpike!==false} onToggle={v=>saveSec(s=>{s.flagSuddenSpike=v})}>
            <Inp type="number" value={sec.spikePercent||""} onChange={v=>saveSec(s=>{s.spikePercent=Number(v)||50})} placeholder="50" style={{width:60,textAlign:"center"}}/>
            <span style={{fontSize:FS-3,color:T.textMut}}>%+</span>
          </FlagRow>
          <FlagRow icon="🔑" label="تغيير كود بصمة حديث" desc="موظف تغير كود بصمته مؤخراً (30 يوم) وبياخد ساعات" enabled={sec.flagCodeChange!==false} onToggle={v=>saveSec(s=>{s.flagCodeChange=v})}/>
          <FlagRow icon="✏️" label="نسبة التعديل اليدوي العالية" desc="نسبة التعديلات اليدوية في الأسبوع أكبر من الحد" enabled={sec.flagManualEditHigh!==false} onToggle={v=>saveSec(s=>{s.flagManualEditHigh=v})}>
            <Inp type="number" value={sec.manualEditRatio||""} onChange={v=>saveSec(s=>{s.manualEditRatio=Number(v)||30})} placeholder="30" style={{width:60,textAlign:"center"}}/>
            <span style={{fontSize:FS-3,color:T.textMut}}>%+</span>
          </FlagRow>
          <FlagRow icon="💸" label="سلفة شاذة" desc="سلفة الموظف أكبر من الحد × متوسطه التاريخي" enabled={sec.flagAdvanceAnomaly!==false} onToggle={v=>saveSec(s=>{s.flagAdvanceAnomaly=v})}>
            <Inp type="number" step="0.5" value={sec.advanceMultiplier||""} onChange={v=>saveSec(s=>{s.advanceMultiplier=Number(v)||3})} placeholder="3" style={{width:60,textAlign:"center"}}/>
            <span style={{fontSize:FS-3,color:T.textMut}}>× متوسط</span>
          </FlagRow>
          <FlagRow icon="🌙" label="ساعات إضافي أسبوعية مرتفعة" desc="إجمالي الإضافي الأسبوعي للموظف فوق الحد" enabled={sec.flagHighOvertime!==false} onToggle={v=>saveSec(s=>{s.flagHighOvertime=v})}>
            <Inp type="number" value={sec.maxWeeklyOvertime||""} onChange={v=>saveSec(s=>{s.maxWeeklyOvertime=Number(v)||30})} placeholder="30" style={{width:60,textAlign:"center"}}/>
            <span style={{fontSize:FS-3,color:T.textMut}}>ساعة</span>
          </FlagRow>
          <FlagRow icon="⚡" label="ساعات تساوي الأساسي بالظبط" desc="ساعات كل يوم = عدد الساعات الأساسي (مشبوه: إدخال يدوي)" enabled={sec.flagExactBaseHours===true} onToggle={v=>saveSec(s=>{s.flagExactBaseHours=v})}/>
          <FlagRow icon="📅" label="أيام عمل قليلة جداً" desc="الموظف بصم أقل من الحد ده من الأيام" enabled={sec.flagFewWorkDays!==false} onToggle={v=>saveSec(s=>{s.flagFewWorkDays=v})}>
            <Inp type="number" value={sec.minWorkDays||""} onChange={v=>saveSec(s=>{s.minWorkDays=Number(v)||3})} placeholder="3" style={{width:60,textAlign:"center"}}/>
            <span style={{fontSize:FS-3,color:T.textMut}}>يوم</span>
          </FlagRow>
          <FlagRow icon="🔁" label="تكرار تعديل نفس الموظف" desc="نفس الموظف تم تعديل ساعاته يدوياً أكتر من الحد" enabled={sec.flagRepeatEdits!==false} onToggle={v=>saveSec(s=>{s.flagRepeatEdits=v})}>
            <Inp type="number" value={sec.maxEditsPerEmp||""} onChange={v=>saveSec(s=>{s.maxEditsPerEmp=Number(v)||3})} placeholder="3" style={{width:60,textAlign:"center"}}/>
            <span style={{fontSize:FS-3,color:T.textMut}}>تعديل</span>
          </FlagRow>
          <FlagRow icon="💰" label="سلفة + ساعات زيادة" desc="سلفة + ارتفاع ساعات في نفس الأسبوع (مشبوه: محاباة)" enabled={sec.flagAdvancePlusSpike!==false} onToggle={v=>saveSec(s=>{s.flagAdvancePlusSpike=v})}/>
          <FlagRow icon="🚫" label="غياب جماعي مفاجئ" desc="نسبة الموظفين اللي ما بصموش في يوم واحد زادت عن الحد" enabled={sec.flagMassAbsence!==false} onToggle={v=>saveSec(s=>{s.flagMassAbsence=v})}>
            <Inp type="number" value={sec.massAbsencePercent||""} onChange={v=>saveSec(s=>{s.massAbsencePercent=Number(v)||30})} placeholder="30" style={{width:60,textAlign:"center"}}/>
            <span style={{fontSize:FS-3,color:T.textMut}}>%+</span>
          </FlagRow>
        </div>;
      })()}
    </Card>

    {/* Sales Settings */}
    {/* Sales Settings — draft pattern */}
    <SalesSettingsCard config={config} upConfig={upConfig} T={T} FS={FS} isMob={isMob} showToast={showToast} Inp={Inp} Btn={Btn} Sel={Sel} Card={Card} setDirty={(d)=>setDirtyCards(p=>({...p,salesSettings:d}))}/>

    {/* Data Maintenance */}
    <Card title="🔧 صيانة البيانات" style={{marginBottom:16}}>
      {(()=>{
        const wsList=config.workshops||[];const wsNames=new Set(wsList.map(w=>w.name));
        const gtList=config.garmentTypes||[];const gtNames=new Set(gtList.map(g=>g.name));
        const stList=(config.statusCards||[]);const stNames=new Set(stList.map(s=>s.name));
        /* Orphaned workshops */
        const orphanWs=new Map();
        orders.forEach(o=>{(o.workshopDeliveries||[]).forEach(wd=>{if(!wd.wsId&&!wsNames.has(wd.wsName)&&wd.wsName)orphanWs.set(wd.wsName,(orphanWs.get(wd.wsName)||0)+1)})});
        (config.wsPayments||[]).forEach(p=>{if(!p.wsId&&!wsNames.has(p.wsName)&&p.wsName)orphanWs.set(p.wsName,(orphanWs.get(p.wsName)||0)+1)});
        /* Orphaned garment types */
        const orphanGt=new Map();
        orders.forEach(o=>{(o.orderPieces||[]).forEach(p=>{if(!gtNames.has(p)&&p)orphanGt.set(p,(orphanGt.get(p)||0)+1)});(o.workshopDeliveries||[]).forEach(wd=>{if(wd.garmentType&&!gtNames.has(wd.garmentType))orphanGt.set(wd.garmentType,(orphanGt.get(wd.garmentType)||0)+1)})});
        /* Orphaned statuses */
        const orphanSt=new Map();
        orders.forEach(o=>{if(o.status&&!stNames.has(o.status))orphanSt.set(o.status,(orphanSt.get(o.status)||0)+1)});
        const totalOrphans=orphanWs.size+orphanGt.size+orphanSt.size;
        /* Dolink */
        const doLink=async()=>{
          const entries=Object.entries(linkMap).filter(([,v])=>v);if(entries.length===0)return;
          const wsMap={};entries.filter(([k])=>orphanWs.has(k)).forEach(([k,v])=>{wsMap[k]=v});
          if(Object.keys(wsMap).length)await syncWsIds(wsMap);
          /* Garment & status renames directly */
          for(const[oldName,newName] of entries){
            if(orphanGt.has(oldName)&&newName){for(const o of orders){let ch=false;const u=JSON.parse(JSON.stringify(o));(u.workshopDeliveries||[]).forEach(wd=>{if(wd.garmentType===oldName){wd.garmentType=newName;ch=true}});u.orderPieces=(u.orderPieces||[]).map(p=>p===oldName?(ch=true,newName):p);FKEYS.forEach(k=>{if(u["fabricPieces"+k])u["fabricPieces"+k]=u["fabricPieces"+k].map(p=>p===oldName?(ch=true,newName):p)});if(ch)await replaceOrder(o.id,u)}}
            if(orphanSt.has(oldName)&&newName){for(const o of orders){if(o.status===oldName){const u={...o};u.status=newName;await replaceOrder(o.id,u)}}}
          }
          setLinkMap({});showToast("✓ تم الربط والتحديث");
        };
        /* Data integrity */
        const issues=[];
        orders.forEach(o=>{const t=calcOrder(o);
          if(!o.modelNo)issues.push({ord:o.id,msg:"بدون رقم موديل",sev:"err"});
          if(!o.fabricA&&!o.fabricB)issues.push({ord:o.id,no:o.modelNo,msg:"بدون خامة",sev:"warn"});
          if(t.cutQty===0)issues.push({ord:o.id,no:o.modelNo,msg:"كمية القص = 0",sev:"warn"});
          if(!o.sizeSetId&&!o.sizeLabel)issues.push({ord:o.id,no:o.modelNo,msg:"بدون مقاس",sev:"warn"});
          /* Orphan deliveries — sessionId not found */
          (o.customerDeliveries||[]).forEach(d=>{if(d.sessionId&&!(config.custDeliverySessions||[]).some(s=>s.id===d.sessionId))issues.push({ord:o.id,no:o.modelNo,msg:"تسليم عميل يتيم (جلسة محذوفة)",sev:"err"})});
          /* Orphan returns — sessId not found */
          /* customerReturns are independent — no session linking */;
        });
        /* Orphan session grid entries */
        const orderIds=new Set(orders.map(o=>o.id));const custIds=new Set((config.customers||[]).map(c=>c.id));
        let orphanGridCount=0;
        (config.custDeliverySessions||[]).forEach(s=>{Object.keys(s.grid||{}).forEach(k=>{const[oid,cid]=k.split("_");if(!orderIds.has(oid)||!custIds.has(cid))orphanGridCount++})});
        (config.salesAudits||[]).forEach(a=>{Object.keys(a.grid||{}).forEach(k=>{const[oid,cid]=k.split("_");if(!orderIds.has(oid)||!custIds.has(cid))orphanGridCount++})});
        if(orphanGridCount>0)issues.push({msg:orphanGridCount+" بيانات يتيمة في جلسات/جرد (أوردر أو عميل محذوف)",sev:"err"});
        const cleanOrphans=()=>{
          /* Clean orphan deliveries & returns from orders */
          const sessIds=new Set((config.custDeliverySessions||[]).map(s=>s.id));
          orders.forEach(o=>{const hasBadDel=(o.customerDeliveries||[]).some(d=>d.sessionId&&!sessIds.has(d.sessionId));const hasBadRet=false;
            if(hasBadDel||hasBadRet)updOrder(o.id,u=>{u.customerDeliveries=(u.customerDeliveries||[]).filter(d=>!d.sessionId||sessIds.has(d.sessionId));/* returns have no sessId */})});
          /* Clean orphan grid entries in sessions & audits */
          upSales(d=>{(d.custDeliverySessions||[]).forEach(s=>{if(!s.grid)return;Object.keys(s.grid).forEach(k=>{const[oid,cid]=k.split("_");if(!orderIds.has(oid)||!custIds.has(cid))delete s.grid[k]})});
            (d.salesAudits||[]).forEach(a=>{if(!a.grid)return;Object.keys(a.grid).forEach(k=>{const[oid,cid]=k.split("_");if(!orderIds.has(oid)||!custIds.has(cid))delete a.grid[k]})})});
          showToast("✓ تم تنظيف البيانات اليتيمة")};
        /* Notifications cleanup */
        const notifs=config.notifications||[];const now=new Date();
        const oldNotifs=notifs.filter(n=>{const d=new Date(n.createdAt);return(now-d)/(1000*60*60*24)>30});
        const excessNotifs=notifs.length>50?notifs.length-50:0;
        const cleanNotifs=()=>upConfig(d=>{const cutoff=new Date();cutoff.setDate(cutoff.getDate()-30);d.notifications=(d.notifications||[]).filter(n=>new Date(n.createdAt)>=cutoff).slice(-50);showToast("✓ تم تنظيف الاشعارات")});
        /* Storage stats */
        const configSize=JSON.stringify(config).length;const ordersSize=JSON.stringify(orders).length;
        const totalSize=configSize+ordersSize;
        const imgSize=orders.reduce((s,o)=>{let sz=(o.image||"").length;(o.attachments||[]).forEach(a=>sz+=(a.data||"").length);return s+sz},0);
        const wsImgSize=(config.workshops||[]).reduce((s,w)=>s+(w.ownerPhoto||"").length+(w.idCard||"").length,0);
        /* Backup */
        const doBackup=()=>{const backup={config:configDoc,sales:salesDoc,tasks:tasksDoc,orders:orders.map(o=>{const c={...o};delete c._docId;return c}),exportDate:new Date().toISOString(),season};const blob=new Blob([JSON.stringify(backup,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="CLARK_backup_"+season+"_"+new Date().toISOString().split("T")[0]+".json";a.click();URL.revokeObjectURL(url);showToast("✓ تم تنزيل النسخة الاحتياطية")};
        /* Compress images */
        const compressOldImages=async()=>{setCompressing(true);let cnt=0;
          for(const o of orders){if(!o.image||o.image.length<50000)continue;
            try{const img=new Image();await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src=o.image});
              const canvas=document.createElement("canvas");const max=150;const ratio=Math.min(max/img.width,max/img.height,1);canvas.width=img.width*ratio;canvas.height=img.height*ratio;canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
              const compressed=canvas.toDataURL("image/jpeg",0.4);
              if(compressed.length<o.image.length){await replaceOrder(o.id,{...o,image:compressed});cnt++}
            }catch(e){}
          }
          setCompressing(false);showToast("✓ تم ضغط صور "+cnt+" أوردر")};

        return<div style={{display:"flex",flexDirection:"column",gap:16}}>
          {/* 1. Orphan linking */}
          <div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
              <Btn onClick={()=>syncWsIds()} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}}>🔄 مزامنة</Btn>
              <span style={{fontSize:FS-2,color:T.textSec}}>مزامنة أسماء الورش في كل الحركات</span>
            </div>
            {totalOrphans>0?<div style={{marginTop:10,padding:14,borderRadius:12,background:T.err+"06",border:"1px solid "+T.err+"20"}}>
              <div style={{fontSize:FS,fontWeight:700,color:T.err,marginBottom:8}}>{"⚠️ أسماء غير مرتبطة ("+totalOrphans+")"}</div>
              {[...orphanWs.entries()].map(([name,count])=><div key={"ws-"+name} style={{display:"flex",gap:8,alignItems:"center",marginBottom:6,padding:"6px 10px",background:T.cardSolid,borderRadius:8,border:"1px solid "+T.brd,fontSize:FS-1}}>
                <span style={{color:T.err,fontWeight:700}}>🏭 {name}</span><span style={{fontSize:FS-3,color:T.textMut}}>{"("+count+")"}</span><span style={{color:T.textSec}}>→</span>
                <Sel value={linkMap[name]||""} onChange={v=>setLinkMap(p=>({...p,[name]:v}))}><option value="">--</option>{wsList.map(w=><option key={w.id} value={w.id}>{wsTypeInfo(w.type).icon+" "+wsTypeInfo(w.type).key+" — "+w.name}</option>)}</Sel>
              </div>)}
              {[...orphanGt.entries()].map(([name,count])=><div key={"gt-"+name} style={{display:"flex",gap:8,alignItems:"center",marginBottom:6,padding:"6px 10px",background:T.cardSolid,borderRadius:8,border:"1px solid "+T.brd,fontSize:FS-1}}>
                <span style={{color:T.warn,fontWeight:700}}>👕 {name}</span><span style={{fontSize:FS-3,color:T.textMut}}>{"("+count+")"}</span><span style={{color:T.textSec}}>→</span>
                <Sel value={linkMap[name]||""} onChange={v=>setLinkMap(p=>({...p,[name]:v}))}><option value="">--</option>{gtList.map(g=><option key={g.id} value={g.name}>{g.name}</option>)}</Sel>
              </div>)}
              {[...orphanSt.entries()].map(([name,count])=><div key={"st-"+name} style={{display:"flex",gap:8,alignItems:"center",marginBottom:6,padding:"6px 10px",background:T.cardSolid,borderRadius:8,border:"1px solid "+T.brd,fontSize:FS-1}}>
                <span style={{color:T.accent,fontWeight:700}}>📌 {name}</span><span style={{fontSize:FS-3,color:T.textMut}}>{"("+count+")"}</span><span style={{color:T.textSec}}>→</span>
                <Sel value={linkMap[name]||""} onChange={v=>setLinkMap(p=>({...p,[name]:v}))}><option value="">--</option>{stList.map(s=><option key={s.id} value={s.name}>{s.name}</option>)}</Sel>
              </div>)}
              <Btn primary onClick={doLink} disabled={!Object.values(linkMap).some(v=>v)} style={{marginTop:8}}>✓ ربط وتحديث</Btn>
            </div>:<div style={{marginTop:6,fontSize:FS-1,color:T.ok,fontWeight:600}}>✓ كل الأسماء مرتبطة</div>}
          </div>

          {/* 2. Notifications cleanup */}
          {(oldNotifs.length>0||excessNotifs>0)&&<div style={{padding:12,borderRadius:10,background:T.warn+"08",border:"1px solid "+T.warn+"20"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:FS-1,color:T.warn,fontWeight:600}}>{"🔔 "+notifs.length+" اشعار"+(oldNotifs.length>0?" — "+oldNotifs.length+" أقدم من 30 يوم":"")+(excessNotifs>0?" — "+excessNotifs+" زيادة عن 50":"")}</span>
              <Btn small onClick={cleanNotifs} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}}>🧹 تنظيف</Btn>
            </div>
          </div>}

          {/* 3. Data integrity */}
          {issues.length>0&&<div style={{padding:12,borderRadius:10,background:T.err+"06",border:"1px solid "+T.err+"15"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{fontSize:FS,fontWeight:700,color:T.err}}>{"🔍 مشاكل في البيانات ("+issues.length+")"}</div>
              {issues.some(i=>i.msg.includes("يتيم"))&&<Btn small onClick={cleanOrphans} style={{background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30"}}>🧹 تنظيف اليتيمة</Btn>}
            </div>
            {issues.slice(0,10).map((iss,i)=><div key={i} style={{fontSize:FS-2,padding:"4px 0",color:iss.sev==="err"?T.err:T.warn}}>{"• "+(iss.no||"—")+" — "+iss.msg}</div>)}
            {issues.length>10&&<div style={{fontSize:FS-3,color:T.textMut}}>{"و "+(issues.length-10)+" مشكلة أخرى..."}</div>}
          </div>}
          {issues.length===0&&<div style={{fontSize:FS-1,color:T.ok,fontWeight:600}}>✓ لا توجد مشاكل في البيانات</div>}

          {/* 4+5. Backup & Restore */}
          <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
            <Btn onClick={doBackup} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30"}}>💾 نسخة احتياطية</Btn>
            <label style={{cursor:"pointer",padding:"6px 16px",borderRadius:8,background:"#8B5CF612",color:"#8B5CF6",border:"1px solid #8B5CF630",fontSize:FS-1,fontWeight:600}}>
              📂 استعادة
              <input type="file" accept=".json" style={{display:"none"}} onChange={async e=>{const file=e.target.files[0];if(!file)return;if(!await ask("استعادة النسخة الاحتياطية","سيتم استبدال جميع البيانات الحالية بالنسخة الاحتياطية.\n\nمتأكد؟",{danger:true,confirmText:"استعادة"}))return;try{const text=await file.text();const backup=JSON.parse(text);if(!backup.config||!backup.orders){await tell("ملف غير صالح","الملف لا يحتوي على بيانات صحيحة",{type:"error"});return}upConfig(d=>{Object.assign(d,backup.config)});showToast("✓ تم استعادة الاعدادات — الأوردرات تحتاج استعادة يدوية من Firebase")}catch(er){await tell("خطأ","تعذر قراءة الملف",{type:"error"})}}}/>
            </label>
            <span style={{fontSize:FS-3,color:T.textMut}}>JSON بكل بيانات الموسم</span>
          </div>

          {/* 6. Compress images */}
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <Btn onClick={compressOldImages} disabled={compressing} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}}>{compressing?<span style={{display:"inline-flex",alignItems:"center",gap:8}}><Spinner size="small" color={T.accent} inline/>جاري الضغط...</span>:"🗜️ ضغط الصور"}</Btn>
            <span style={{fontSize:FS-3,color:T.textMut}}>يعيد ضغط صور الأوردرات الكبيرة (أكبر من 50KB)</span>
          </div>

          {/* 7. Storage stats */}
          <div style={{padding:14,borderRadius:12,background:T.bg,border:"1px solid "+T.brd}}>
            <div style={{fontSize:FS,fontWeight:700,color:T.text,marginBottom:10}}>📊 احصائيات التخزين</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
              <div style={{textAlign:"center",padding:8,borderRadius:8,background:T.cardSolid}}>
                <div style={{fontSize:FS-2,color:T.textSec}}>اجمالي</div>
                <div style={{fontSize:FS+2,fontWeight:800,color:T.accent}}>{(totalSize/1024/1024).toFixed(2)+" MB"}</div>
              </div>
              <div style={{textAlign:"center",padding:8,borderRadius:8,background:T.cardSolid}}>
                <div style={{fontSize:FS-2,color:T.textSec}}>الأوردرات</div>
                <div style={{fontSize:FS+2,fontWeight:800,color:"#8B5CF6"}}>{(ordersSize/1024/1024).toFixed(2)+" MB"}</div>
              </div>
              <div style={{textAlign:"center",padding:8,borderRadius:8,background:T.cardSolid}}>
                <div style={{fontSize:FS-2,color:T.textSec}}>الصور</div>
                <div style={{fontSize:FS+2,fontWeight:800,color:T.warn}}>{((imgSize+wsImgSize)/1024/1024).toFixed(2)+" MB"}</div>
              </div>
            </div>
            <div style={{marginTop:8}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:FS-2,color:T.textSec,marginBottom:3}}><span>استهلاك التخزين</span><span>{(totalSize/1024/1024).toFixed(2)+" / 1.0 MB (حد المستند)"}</span></div>
              <div style={{height:8,borderRadius:4,background:"#E2E8F0",overflow:"hidden"}}><div style={{height:"100%",width:Math.min(100,totalSize/1024/1024*100)+"%",borderRadius:4,background:totalSize>800000?T.err:totalSize>500000?T.warn:T.ok}}/></div>
            </div>
          </div>
        </div>})()}
    </Card>
    {/* ── Data Maintenance ── */}
    <Card title="🔧 صيانة البيانات" style={{marginTop:16}}>
      {(()=>{const sessIds=new Set((config.custDeliverySessions||[]).map(s=>s.id));
        let orphanCount=0;const orphanDetails=[];
        orders.forEach(o=>{
          const orphans=(o.customerDeliveries||[]).filter(d=>!d.sessionId||!sessIds.has(d.sessionId));
          if(orphans.length>0){orphanCount+=orphans.length;orphanDetails.push({model:o.modelNo,count:orphans.length})}
        });
        const orphanReturns=orders.reduce((s,o)=>{const rets=(o.customerReturns||[]).filter(r=>{if(!r.custId)return true;const custExists=(config.customers||[]).some(c=>c.id===r.custId);return!custExists});return s+rets.length},0);
        const emptyDels=orders.filter(o=>(o.customerDeliveries||[]).some(d=>!d.qty||d.qty<=0)).length;
        const totalIssues=orphanCount+orphanReturns+emptyDels;
        const cleanOrphans=()=>{
          let cleaned=0;
          orders.forEach(o=>{
            const orphans=(o.customerDeliveries||[]).filter(d=>!d.sessionId||!sessIds.has(d.sessionId));
            const emptyQ=(o.customerDeliveries||[]).filter(d=>!d.qty||d.qty<=0);
            const orphanRets=(o.customerReturns||[]).filter(r=>!r.custId||!(config.customers||[]).some(c=>c.id===r.custId));
            if(orphans.length>0||emptyQ.length>0||orphanRets.length>0){
              updOrder(o.id,ord=>{
                if(orphans.length>0||emptyQ.length>0){ord.customerDeliveries=(ord.customerDeliveries||[]).filter(d=>d.sessionId&&sessIds.has(d.sessionId)&&d.qty>0)}
                if(orphanRets.length>0){ord.customerReturns=(ord.customerReturns||[]).filter(r=>r.custId&&(config.customers||[]).some(c=>c.id===r.custId))}
              });cleaned+=orphans.length+emptyQ.length+orphanRets.length}
          });
          showToast("✓ تم تنظيف "+cleaned+" سجل يتيم")};
        return<div>
          {/* Recover deleted customers */}
          {(()=>{const existingCustIds=new Set((config.customers||[]).map(c=>c.id));const lostCusts={};
            orders.forEach(o=>{(o.customerDeliveries||[]).forEach(d=>{if(d.custId&&!existingCustIds.has(d.custId)&&d.custName){if(!lostCusts[d.custId])lostCusts[d.custId]={id:d.custId,name:d.custName,qty:0};lostCusts[d.custId].qty+=(Number(d.qty)||0)}});
              (o.customerReturns||[]).forEach(r=>{if(r.custId&&!existingCustIds.has(r.custId)&&r.custName){if(!lostCusts[r.custId])lostCusts[r.custId]={id:r.custId,name:r.custName,qty:0}}})});
            (config.custDeliverySessions||[]).forEach(s=>{(s.custIds||[]).forEach(cid=>{if(!existingCustIds.has(cid)&&!lostCusts[cid]){lostCusts[cid]={id:cid,name:"عميل محذوف ("+cid.substring(0,6)+")",qty:0}}})});
            const lostList=Object.values(lostCusts);
            if(lostList.length===0)return null;
            return<div style={{padding:12,borderRadius:10,background:"#EF444408",border:"1px solid #EF444420",marginBottom:12}}>
              <div style={{fontWeight:800,color:"#EF4444",marginBottom:8}}>{"🔴 "+lostList.length+" عميل محذوف لديه حركات بيع!"}</div>
              {lostList.map(c=><div key={c.id} style={{fontSize:FS-1,padding:"4px 0",color:T.text}}>{"• "+c.name+(c.qty>0?" — "+c.qty+" قطعة مباعة":"")}</div>)}
              <Btn onClick={()=>{upConfig(d=>{if(!d.customers)d.customers=[];lostList.forEach(c=>{if(!d.customers.find(x=>x.id===c.id)){d.customers.push({id:c.id,name:c.name,phone:"",address:"",type:"مكتب",recoveredAt:new Date().toISOString()})}})});showToast("✅ تم استعادة "+lostList.length+" عميل")}} style={{marginTop:8,background:"#EF4444",color:"#fff",border:"none",fontWeight:700}}>{"🔄 استعادة "+lostList.length+" عميل"}</Btn>
            </div>})()}
          {/* Recover deleted users */}
          {(()=>{const foundNames=new Set();
            orders.forEach(o=>{(o.deliveries||[]).forEach(d=>{if(d.createdBy)foundNames.add(d.createdBy);if(d.confirmedBy)foundNames.add(d.confirmedBy)});
              (o.workshopDeliveries||[]).forEach(wd=>{if(wd.createdBy)foundNames.add(wd.createdBy)});
              (o.customerDeliveries||[]).forEach(d=>{if(d.by)foundNames.add(d.by)})});
            (config.custDeliverySessions||[]).forEach(s=>{if(s.createdBy&&s.createdBy!=="RECOVERY")foundNames.add(s.createdBy);if(s.actualSaleBy)foundNames.add(s.actualSaleBy)});
            const knownNames=new Set((config.usersList||[]).map(u=>u.name));
            const missingNames=[...foundNames].filter(n=>n&&!knownNames.has(n)&&n!=="RECOVERY"&&n!=="admin");
            const addUser=async()=>{const result=await askForm("إضافة مستخدم",[{key:"name",label:"اسم المستخدم",required:true},{key:"email",label:"البريد الإلكتروني",required:true,validate:v=>v.includes("@")?null:"ايميل غير صحيح"},{key:"role",label:"الصلاحية (admin/editor/viewer)",defaultValue:"editor",required:true}]);if(!result)return;
              upConfig(d=>{if(!d.usersList)d.usersList=[];if(!d.usersList.find(u=>u.email===result.email)){d.usersList.push({email:result.email,name:result.name,role:result.role||"editor",recoveredAt:new Date().toISOString()})}});showToast("✅ تم اضافة "+result.name)};
            return<div style={{padding:12,borderRadius:10,background:"#F59E0B08",border:"1px solid #F59E0B20",marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{fontWeight:800,color:"#F59E0B"}}>{"👤 المستخدمين ("+((config.usersList||[]).length)+")"}</div>
                <Btn small onClick={addUser} style={{background:"#F59E0B",color:"#fff",border:"none",fontWeight:700}}>+ اضافة مستخدم</Btn>
              </div>
              {(config.usersList||[]).map(u=><div key={u.email} style={{fontSize:FS-1,color:T.ok,padding:"2px 0"}}>{"✅ "+u.name+" ("+u.email+") — "+u.role}</div>)}
              {(config.usersList||[]).length===0&&<div style={{fontSize:FS-1,color:T.err,padding:"4px 0"}}>⚠️ لا يوجد مستخدمين مسجلين!</div>}
              {missingNames.length>0&&<div style={{marginTop:8}}>
                <div style={{fontWeight:700,color:"#EF4444",marginBottom:8}}>{"⚠️ "+missingNames.length+" مستخدم في الحركات مش في القائمة:"}</div>
                {missingNames.map(n=><div key={n} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid "+T.brd}}>
                  <span style={{fontSize:FS-1,color:"#EF4444",fontWeight:700,flex:1}}>{"• "+n}</span>
                  <Btn small onClick={async()=>{const result=await askForm("استعادة "+n,[{key:"email",label:"البريد الإلكتروني",required:true,validate:v=>v.includes("@")?null:"ايميل غير صحيح"},{key:"role",label:"الصلاحية (admin/editor/viewer)",defaultValue:"editor",required:true}]);if(!result)return;
                    upConfig(d=>{if(!d.usersList)d.usersList=[];if(!d.usersList.find(u=>u.email===result.email)){d.usersList.push({email:result.email,name:n,role:result.role||"editor",recoveredAt:new Date().toISOString()})}});
                    showToast("✅ تم استعادة "+n)}} style={{background:"#EF4444",color:"#fff",border:"none",fontWeight:700,whiteSpace:"nowrap"}}>🔄 استعادة</Btn>
                </div>)}
              </div>}
            </div>})()}
          <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:12}}>
            <div style={{padding:10,borderRadius:8,background:totalIssues>0?T.warn+"08":T.ok+"08",border:"1px solid "+(totalIssues>0?T.warn:T.ok)+"15",textAlign:"center",flex:1,minWidth:120}}>
              <div style={{fontSize:FS-2,color:T.textSec}}>بيانات يتيمة</div>
              <div style={{fontSize:18,fontWeight:800,color:totalIssues>0?T.warn:T.ok}}>{totalIssues}</div>
            </div>
            <div style={{padding:10,borderRadius:8,background:T.bg,border:"1px solid "+T.brd,textAlign:"center",flex:1,minWidth:120}}>
              <div style={{fontSize:FS-2,color:T.textSec}}>تسليمات يتيمة</div>
              <div style={{fontSize:18,fontWeight:800,color:orphanCount>0?T.err:T.ok}}>{orphanCount}</div>
            </div>
            <div style={{padding:10,borderRadius:8,background:T.bg,border:"1px solid "+T.brd,textAlign:"center",flex:1,minWidth:120}}>
              <div style={{fontSize:FS-2,color:T.textSec}}>مرتجعات يتيمة</div>
              <div style={{fontSize:18,fontWeight:800,color:orphanReturns>0?T.err:T.ok}}>{orphanReturns}</div>
            </div>
          </div>
          {orphanDetails.length>0&&<div style={{marginBottom:12,fontSize:FS-2,color:T.textMut}}>
            {orphanDetails.map(d=><span key={d.model} style={{display:"inline-block",padding:"2px 8px",margin:2,borderRadius:6,background:T.warn+"10",color:T.warn,fontWeight:600}}>{"موديل "+d.model+": "+d.count+" يتيم"}</span>)}
          </div>}
          {/* deliveredQty sync check */}
          {(()=>{const mismatch=orders.filter(o=>{const confirmed=getConfirmedStock(o);return(o.deliveredQty||0)!==confirmed});
            const pendingCount=orders.reduce((s,o)=>s+(o.deliveries||[]).filter(d=>d.status==="pending").length,0);
            const pendingQty=orders.reduce((s,o)=>s+(o.deliveries||[]).filter(d=>d.status==="pending").reduce((ss,d)=>ss+(Number(d.qty)||0),0),0);
            return<div>
              <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:12}}>
                <div style={{padding:10,borderRadius:8,background:pendingCount>0?"#F59E0B08":T.bg,border:"1px solid "+(pendingCount>0?"#F59E0B15":T.brd),textAlign:"center",flex:1,minWidth:120}}>
                  <div style={{fontSize:FS-2,color:T.textSec}}>تسليمات معلّقة</div>
                  <div style={{fontSize:18,fontWeight:800,color:pendingCount>0?"#F59E0B":T.ok}}>{pendingCount}</div>
                  {pendingQty>0&&<div style={{fontSize:FS-3,color:"#F59E0B"}}>{pendingQty+" قطعة"}</div>}
                </div>
                <div style={{padding:10,borderRadius:8,background:mismatch.length>0?T.err+"08":T.ok+"08",border:"1px solid "+(mismatch.length>0?T.err:T.ok)+"15",textAlign:"center",flex:1,minWidth:120}}>
                  <div style={{fontSize:FS-2,color:T.textSec}}>رصيد غير متطابق</div>
                  <div style={{fontSize:18,fontWeight:800,color:mismatch.length>0?T.err:T.ok}}>{mismatch.length}</div>
                </div>
              </div>
              {mismatch.length>0&&<div style={{marginBottom:8}}>
                <div style={{fontSize:FS-2,color:T.textMut,marginBottom:4}}>موديلات deliveredQty مش متطابقة مع confirmed:</div>
                {mismatch.slice(0,5).map(o=><div key={o.id} style={{fontSize:FS-2,color:T.err,fontWeight:600}}>{"⚠️ "+o.modelNo+": deliveredQty="+(o.deliveredQty||0)+" / confirmed="+getConfirmedStock(o)}</div>)}
                <Btn small onClick={()=>{let fixed=0;mismatch.forEach(o=>{updOrder(o.id,ord=>{ord.deliveredQty=getConfirmedStock(ord);ord.status=recomputeStatus(ord)});fixed++});showToast("✅ تم مزامنة "+fixed+" موديل")}} style={{marginTop:6,background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30"}}>{"🔧 مزامنة الأرصدة ("+mismatch.length+")"}</Btn>
              </div>}
            </div>})()}
          {totalIssues>0?<Btn onClick={cleanOrphans} style={{background:T.warn,color:"#fff",border:"none",fontWeight:700}}>🧹 تنظيف البيانات اليتيمة ({totalIssues})</Btn>
          :<div style={{fontSize:FS-1,color:T.ok,fontWeight:600}}>✅ البيانات نظيفة — لا توجد سجلات يتيمة</div>}
        </div>})()}
    </Card>
    {/* ── Auto Bot Tasks Settings (multi-user) ── */}
    {/* ── Notification Control ── */}
    <Card title="🔔 التحكم في الاشعارات" style={{marginTop:16}}>
      {(()=>{const users=config.usersList||[];const prefs=config.notifPrefs||{};
        const NTYPES=[{key:"botAlerts",label:"تنبيهات البوت الذكية",icon:"🤖"},{key:"tasks",label:"المهام",icon:"📌"},{key:"movements",label:"حركات التشغيل",icon:"🔄"},{key:"statusChanges",label:"تغيير حالة الأوردر",icon:"📋"},{key:"stockDelivery",label:"تسليم مخزن جاهز",icon:"📦"},{key:"custDelivery",label:"تسليم عملاء",icon:"🚚"}];
        const updatePref=(email,key,val)=>{upConfig(d=>{if(!d.notifPrefs)d.notifPrefs={};if(!d.notifPrefs[email])d.notifPrefs[email]={};d.notifPrefs[email][key]=val})};
        return<div>
          <div style={{fontSize:FS-1,color:T.textMut,marginBottom:10}}>تحكم في نوع الإشعارات اللي يستلمها كل مستخدم</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {users.map(u=>{const up=prefs[u.email]||{};const isOpen=nfEditUser===u.email;
              const enabledCount=NTYPES.filter(t=>up[t.key]!==false).length;
              return<div key={u.email} style={{borderRadius:10,border:"1px solid "+(isOpen?T.accent:T.brd),overflow:"hidden"}}>
                <div onClick={()=>setNfEditUser(isOpen?"":u.email)} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",cursor:"pointer",background:isOpen?T.accent+"06":T.bg}}>
                  <span style={{fontSize:14}}>👤</span>
                  <span style={{flex:1,fontWeight:700,fontSize:FS-1}}>{u.name||u.email}</span>
                  <span style={{fontSize:FS-3,color:T.textMut}}>{enabledCount+"/"+NTYPES.length+" مفعّل"}</span>
                  <span style={{color:T.textMut,fontSize:10}}>{isOpen?"▲":"▼"}</span>
                </div>
                {isOpen&&<div style={{padding:"8px 12px",borderTop:"1px solid "+T.brd,display:"flex",flexDirection:"column",gap:6}}>
                  {NTYPES.map(t=>{const enabled=up[t.key]!==false;
                    return<label key={t.key} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 8px",borderRadius:6,background:enabled?T.ok+"06":T.bg,border:"1px solid "+(enabled?T.ok+"15":T.brd),cursor:"pointer"}}>
                      <input type="checkbox" checked={enabled} onChange={e=>updatePref(u.email,t.key,e.target.checked)} style={{width:16,height:16}}/>
                      <span style={{fontSize:14}}>{t.icon}</span>
                      <span style={{fontSize:FS-2,fontWeight:600,color:enabled?T.text:T.textMut}}>{t.label}</span>
                    </label>})}
                </div>}
              </div>})}
          </div>
        </div>})()}
    </Card>
    <Card title="🤖 المهام التلقائية" style={{marginTop:16}}>
      {(()=>{const at=config.autoTasks||{enabled:false,users:[]};const atUsers=at.users||[];const allUsers=config.usersList||[];
        const RULES=[{key:"noDeliver",label:"موديل مقصوص ولم يُسلَّم لورشة",icon:"✂️",dd:5},{key:"availPiece",label:"قطعة متاحة ولم تُسلَّم",icon:"👔",dd:5},{key:"slowWorkshop",label:"ورشة متأخرة في الاستلام",icon:"🐢",dd:14},{key:"stockNoSale",label:"مخزن جاهز لم يُسلَّم لعملاء",icon:"📦",dd:7}];
        const defaultRules=()=>{const r={};RULES.forEach(ru=>{r[ru.key]={enabled:true,days:ru.dd}});return r};
        const toggleEnabled=()=>{upConfig(d=>{if(!d.autoTasks)d.autoTasks={enabled:false,users:[]};d.autoTasks.enabled=!d.autoTasks.enabled})};
        const addUser=()=>{if(!atSelUser)return;const u=allUsers.find(x=>x.email===atSelUser);if(atUsers.some(x=>x.email===atSelUser)){showToast("⚠️ المستخدم مضاف بالفعل");return}
          upConfig(d=>{if(!d.autoTasks)d.autoTasks={enabled:true,users:[]};if(!d.autoTasks.users)d.autoTasks.users=[];d.autoTasks.users.push({email:atSelUser,name:u?.name||atSelUser.split("@")[0],rules:defaultRules()})});setAtSelUser("");showToast("✓ تم الإضافة")};
        const removeUser=(email)=>{upConfig(d=>{d.autoTasks.users=(d.autoTasks.users||[]).filter(x=>x.email!==email)});if(atEditIdx!==null)setAtEditIdx(null)};
        const updateRule=(idx,ruleKey,field,val)=>{upConfig(d=>{const u=d.autoTasks.users[idx];if(!u)return;if(!u.rules)u.rules=defaultRules();if(!u.rules[ruleKey])u.rules[ruleKey]={enabled:true,days:5};u.rules[ruleKey][field]=val})};
        return<div>
          <div style={{padding:10,background:T.warn+"10",border:"1px solid "+T.warn+"30",borderRadius:8,marginBottom:12,fontSize:FS-1,color:T.warn}}>
            ⚠️ البوت موقوف بشكل افتراضي لتجنب ضوضاء التنبيهات. لإعادة تفعيله، فعّل الخيارين التاليين معاً.
          </div>
          <div style={{marginBottom:14}}>
            <Btn small onClick={async()=>{
              const ok=await ask("حذف مهام البوت","سيتم حذف كل المهام التي أنشأها البوت تلقائياً. هل أنت متأكد؟",{type:"danger",confirmText:"حذف"});
              if(!ok)return;
              let count=0;
              upTasks(d=>{if(Array.isArray(d.tasks)){const before=d.tasks.length;d.tasks=d.tasks.filter(t=>t.fromUid!=="bot");count=before-d.tasks.length}});
              setTimeout(()=>showToast("🗑️ تم حذف "+count+" مهمة بوت"),400);
            }} style={{background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30"}}>🗑️ حذف كل مهام البوت الموجودة</Btn>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,flexWrap:"wrap"}}>
            <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer"}}>
              <input type="checkbox" checked={!!at.enabled} onChange={toggleEnabled} style={{width:20,height:20}}/>
              <span style={{fontSize:FS,fontWeight:700,color:at.enabled?T.ok:T.textMut}}>{at.enabled?"مفعّلة":"معطّلة"}</span>
            </label>
            <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer"}}>
              <input type="checkbox" checked={!!at.allowBot} onChange={()=>upConfig(d=>{if(!d.autoTasks)d.autoTasks={enabled:false,users:[]};d.autoTasks.allowBot=!d.autoTasks.allowBot})} style={{width:20,height:20}}/>
              <span style={{fontSize:FS,fontWeight:700,color:at.allowBot?T.ok:T.textMut}}>{at.allowBot?"السماح بإنشاء مهام بوت":"البوت موقوف"}</span>
            </label>
            <span style={{fontSize:FS-2,color:T.textMut}}>{"("+atUsers.length+" مستخدم)"}</span>
          </div>
          {at.enabled&&<div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
              <div style={{flex:1}}><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>اضافة مستخدم</label>
                <Sel value={atSelUser} onChange={setAtSelUser}><option value="">-- اختر --</option>
                  {allUsers.filter(u=>!atUsers.some(a=>a.email===u.email)).map(u=><option key={u.email} value={u.email}>{u.name||u.email}</option>)}
                </Sel></div>
              <Btn primary onClick={addUser} disabled={!atSelUser}>+ اضافة</Btn>
            </div>
            {atUsers.map((au,idx)=>{const isOpen=atEditIdx===idx;const rules=au.rules||{};
              return<div key={au.email} style={{borderRadius:12,border:"1px solid "+(isOpen?T.accent:T.brd),overflow:"hidden"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",background:isOpen?T.accent+"06":T.bg,cursor:"pointer"}} onClick={()=>setAtEditIdx(isOpen?null:idx)}>
                  <span style={{fontSize:16}}>👤</span>
                  <span style={{flex:1,fontWeight:700,fontSize:FS}}>{au.name||au.email}</span>
                  <span style={{fontSize:FS-2,color:T.textMut}}>{Object.values(rules).filter(r=>r.enabled).length+" قاعدة فعّالة"}</span>
                  <span style={{color:T.textMut,fontSize:12}}>{isOpen?"▲":"▼"}</span>
                </div>
                {isOpen&&<div style={{padding:"10px 14px",display:"flex",flexDirection:"column",gap:8,borderTop:"1px solid "+T.brd}}>
                  {RULES.map(rule=>{const r=rules[rule.key]||{enabled:true,days:rule.dd};
                    return<div key={rule.key} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderRadius:8,background:r.enabled?T.ok+"06":T.bg,border:"1px solid "+(r.enabled?T.ok+"15":T.brd),flexWrap:"wrap"}}>
                      <input type="checkbox" checked={r.enabled!==false} onChange={e=>updateRule(idx,rule.key,"enabled",e.target.checked)} style={{width:16,height:16}}/>
                      <span style={{fontSize:14}}>{rule.icon}</span>
                      <span style={{flex:1,fontSize:FS-2,fontWeight:600,color:r.enabled?T.text:T.textMut,minWidth:100}}>{rule.label}</span>
                      <span style={{fontSize:FS-3,color:T.textSec}}>بعد</span>
                      <input type="number" value={r.days||rule.dd} onChange={e=>updateRule(idx,rule.key,"days",Number(e.target.value)||rule.dd)} style={{width:45,textAlign:"center",padding:"3px",borderRadius:5,border:"1px solid "+T.brd,fontSize:FS-2,fontWeight:700,fontFamily:"inherit",background:T.bg,color:T.text}}/>
                      <span style={{fontSize:FS-3,color:T.textSec}}>يوم</span>
                    </div>})}
                  <div style={{display:"flex",justifyContent:"flex-end"}}><Btn small onClick={()=>removeUser(au.email)} style={{background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30",fontSize:FS-2}}>🗑️ حذف المستخدم</Btn></div>
                </div>}
              </div>})}
            <div style={{padding:10,borderRadius:8,background:T.accent+"06",border:"1px solid "+T.accent+"15",fontSize:FS-2,color:T.textSec}}>💡 كل مستخدم يستلم المهام حسب القواعد المحددة له. المهام لا تتكرر طالما مفتوحة.</div>
          </div>}
        </div>})()}
    </Card>

    {/* ═══ BACKUP & RESTORE ═══ */}
    {/* ═══ ODOO LINKS ═══ */}
    <Card title="🔗 Odoo — إدارة الاختصارات" style={{marginTop:16}}>
      {(()=>{
        const defaultOdooLinks=[
          {id:"accounting",icon:"📊",label:"المحاسبة",url:"https://clarkdb.odoo.com/odoo/accounting",color:"#8B5CF6"},
          {id:"sales",icon:"🛒",label:"المبيعات",url:"https://clarkdb.odoo.com/odoo/sales",color:"#10B981"},
          {id:"purchase",icon:"🏷️",label:"المشتريات",url:"https://clarkdb.odoo.com/odoo/purchase",color:"#EF4444"},
          {id:"inventory",icon:"📦",label:"المخزن",url:"https://clarkdb.odoo.com/odoo/inventory",color:"#F59E0B"},
          {id:"invoices",icon:"🧾",label:"فواتير بيع",url:"https://clarkdb.odoo.com/odoo/accounting/customer-invoices",color:"#0EA5E9"},
        ];
        const links=config.odooLinks||defaultOdooLinks;
        const[oIcon,setOIcon]=useState("🔗");const[oLabel,setOLabel]=useState("");const[oUrl,setOUrl]=useState("");const[oColor,setOColor]=useState("#8B5CF6");const[oEditId,setOEditId]=useState(null);
        const saveLink=()=>{if(!oLabel.trim()||!oUrl.trim())return;
          upConfig(d=>{if(!d.odooLinks)d.odooLinks=[...defaultOdooLinks];
          if(oEditId){const l=d.odooLinks.find(x=>x.id===oEditId);if(l){l.icon=oIcon;l.label=oLabel.trim();l.url=oUrl.trim();l.color=oColor}}
          else{d.odooLinks.push({id:gid(),icon:oIcon,label:oLabel.trim(),url:oUrl.trim(),color:oColor})}});
          setOIcon("🔗");setOLabel("");setOUrl("");setOColor("#8B5CF6");setOEditId(null);showToast("✓ تم الحفظ")};
        const delLink=(id)=>{upConfig(d=>{if(!d.odooLinks)d.odooLinks=[...defaultOdooLinks];d.odooLinks=(d.odooLinks||[]).filter(x=>x.id!==id)});showToast("✓ تم الحذف")};
        const editLink=(l)=>{setOEditId(l.id);setOIcon(l.icon||"🔗");setOLabel(l.label);setOUrl(l.url);setOColor(l.color||"#8B5CF6")};
        return<div>
          {links.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:14}}>
            {links.map(l=><div key={l.id} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:8,background:T.bg,border:"1px solid "+T.brd}}>
              <span style={{fontSize:16}}>{l.icon}</span>
              <span style={{fontSize:FS-1,fontWeight:700,color:l.color}}>{l.label}</span>
              <span onClick={()=>editLink(l)} style={{cursor:"pointer",fontSize:10}}>✏️</span>
              <span onClick={()=>delLink(l.id)} style={{cursor:"pointer",fontSize:10,color:T.err}}>✕</span>
            </div>)}
          </div>}
          <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"60px 1fr 2fr 80px auto",gap:8,alignItems:"flex-end"}}>
            <div><label style={{fontSize:FS-3,color:T.textSec}}>أيقونة</label><Inp value={oIcon} onChange={setOIcon} style={{textAlign:"center",fontSize:18}}/></div>
            <div><label style={{fontSize:FS-3,color:T.textSec}}>الاسم</label><Inp value={oLabel} onChange={setOLabel} placeholder="المحاسبة"/></div>
            <div><label style={{fontSize:FS-3,color:T.textSec}}>الرابط</label><Inp value={oUrl} onChange={setOUrl} placeholder="https://clarkdb.odoo.com/odoo/accounting" style={{direction:"ltr"}}/></div>
            <div><label style={{fontSize:FS-3,color:T.textSec}}>اللون</label><input type="color" value={oColor} onChange={ev=>setOColor(ev.target.value)} style={{width:"100%",height:36,borderRadius:6,border:"1px solid "+T.brd,cursor:"pointer"}}/></div>
            <div style={{display:"flex",gap:4}}>
              <Btn primary onClick={saveLink} disabled={!oLabel.trim()||!oUrl.trim()}>{oEditId?"💾":"+"}</Btn>
              {oEditId&&<Btn ghost onClick={()=>{setOEditId(null);setOIcon("🔗");setOLabel("");setOUrl("");setOColor("#8B5CF6")}}>✕</Btn>}
            </div>
          </div>
        </div>})()}
    </Card>

    <BackupRestoreCard config={config} salesDoc={salesDoc} tasksDoc={tasksDoc} orders={orders} isMob={isMob}/>
  </div>
}

/* ═══════════════════════════════════════════════════════════════
   BACKUP & RESTORE CARD — نسخ احتياطي واستعادة
   ═══════════════════════════════════════════════════════════════ */


export function BackupRestoreCard({config,salesDoc,tasksDoc,orders,isMob}){
  const[backupList,setBackupList]=useState([]);
  const[loading,setLoading]=useState(false);
  const[confirmRestore,setConfirmRestore]=useState(null);
  const[busy,setBusy]=useState(false);

  const loadBackups=async()=>{
    setLoading(true);
    try{
      const snap=await getDocs(collection(db,"backups"));
      const list=[];snap.forEach(d=>{const data=d.data();list.push({id:d.id,...data})});
      list.sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""));
      setBackupList(list);
    }catch(e){console.error("loadBackups:",e);showToast("⚠️ تعذر تحميل النسخ")}
    setLoading(false);
  };

  useEffect(()=>{loadBackups()},[]);

  const createBackup=async(label)=>{
    setBusy(true);
    try{
      const backupId=new Date().toISOString().replace(/[:.]/g,"-");
      const data={
        label:label||"يدوية",
        createdAt:new Date().toISOString(),
        config:config||{},
        sales:salesDoc||{},
        tasks:tasksDoc||{},
        orders:orders||[],
        counts:{
          treasury:(config?.treasury||[]).length,
          employees:(config?.employees||[]).length,
          customers:(config?.customers||[]).length,
          orders:(orders||[]).length
        }
      };
      await setDoc(doc(db,"backups",backupId),data);
      showToast("✅ تم حفظ النسخة الاحتياطية");
      loadBackups();
    }catch(e){console.error("createBackup:",e);showToast("⚠️ فشل حفظ النسخة")}
    setBusy(false);
  };

  const deleteBackup=async(id)=>{
    try{await deleteDoc(doc(db,"backups",id));showToast("✓ تم الحذف");loadBackups()}
    catch(e){console.error("deleteBackup:",e);showToast("⚠️ فشل الحذف")}
  };

  const restoreBackup=async(b)=>{
    setBusy(true);
    try{
      if(b.config)await setDoc(doc(db,"factory","config"),b.config);
      if(b.sales)await setDoc(doc(db,"factory","sales"),b.sales);
      if(b.tasks)await setDoc(doc(db,"factory","tasks"),b.tasks);
      /* Orders restoration is complex — we only restore config/sales/tasks */
      showToast("✅ تم الاستعادة — اغلق وافتح التطبيق");
      setConfirmRestore(null);
    }catch(e){console.error("restoreBackup:",e);showToast("⚠️ فشل الاستعادة")}
    setBusy(false);
  };

  const downloadJSON=(b)=>{
    const data=JSON.stringify(b,null,2);
    const blob=new Blob([data],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download="clark-backup-"+b.id+".json";a.click();
    URL.revokeObjectURL(url);
  };

  return<Card title="💾 النسخ الاحتياطي والاستعادة" style={{marginTop:16}}>
    <div style={{padding:12,borderRadius:10,background:T.accent+"06",border:"1px solid "+T.accent+"20",marginBottom:14,fontSize:FS-1,color:T.textSec,lineHeight:1.7}}>
      النسخ الاحتياطي يحفظ كل بياناتك (الخزنة، HR، العملاء، الورش، الطلبات) في Firestore.
      <br/>💡 <b>نصيحة:</b> خد نسخة احتياطية قبل أي تحديث كبير أو تغيير جذري.
    </div>
    <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
      <Btn primary onClick={()=>createBackup("يدوية")} disabled={busy}>💾 نسخة احتياطية الآن</Btn>
      <Btn onClick={loadBackups} disabled={loading} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>{loading?<span style={{display:"inline-flex",alignItems:"center",gap:8}}><Spinner size="small" color={T.text} inline/>جاري التحميل...</span>:"🔄 تحديث القائمة"}</Btn>
    </div>
    {backupList.length===0?<div style={{padding:30,textAlign:"center",color:T.textMut,background:T.bg,borderRadius:10}}>لا توجد نسخ احتياطية — اضغط "💾 نسخة احتياطية الآن" لأخذ نسخة</div>
    :<div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:400,overflowY:"auto"}}>
      {backupList.map(b=>{
        const d=new Date(b.createdAt||0);
        const c=b.counts||{};
        return<div key={b.id} style={{padding:12,borderRadius:10,background:T.bg,border:"1px solid "+T.brd,display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:200}}>
            <div style={{fontSize:FS,fontWeight:700,color:T.text}}>📦 {b.label||"نسخة"}</div>
            <div style={{fontSize:FS-2,color:T.textMut,marginTop:2}}>{d.toLocaleString("ar-EG",{dateStyle:"medium",timeStyle:"short"})}</div>
            <div style={{fontSize:FS-3,color:T.textSec,marginTop:4,display:"flex",gap:10,flexWrap:"wrap"}}>
              <span>💰 {c.treasury||0} حركة</span>
              <span>👷 {c.employees||0} موظف</span>
              <span>🧑 {c.customers||0} عميل</span>
              <span>📋 {c.orders||0} طلب</span>
            </div>
          </div>
          <div style={{display:"flex",gap:4}}>
            <Btn small onClick={()=>downloadJSON(b)} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30"}} title="تحميل JSON">⬇</Btn>
            <Btn small onClick={()=>setConfirmRestore(b)} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}} title="استعادة">🔄</Btn>
            <Btn small onClick={async()=>{if(await ask("حذف النسخة","حذف النسخة الاحتياطية؟",{danger:true}))deleteBackup(b.id)}} style={{background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30"}} title="حذف">🗑</Btn>
          </div>
        </div>})}
    </div>}

    {confirmRestore&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:10002,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={()=>setConfirmRestore(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,maxWidth:500,width:"100%",border:"2px solid "+T.warn,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{fontSize:48,textAlign:"center",marginBottom:8}}>⚠️</div>
        <div style={{fontSize:FS+2,fontWeight:800,color:T.warn,textAlign:"center",marginBottom:10}}>تأكيد الاستعادة</div>
        <div style={{fontSize:FS-1,color:T.textSec,marginBottom:14,lineHeight:1.7,padding:12,background:T.warn+"08",borderRadius:10}}>
          سيتم استبدال كل البيانات الحالية بهذه النسخة الاحتياطية:
          <br/><br/>
          📅 <b>{new Date(confirmRestore.createdAt).toLocaleString("ar-EG")}</b><br/>
          📦 {confirmRestore.label}<br/>
          💰 {confirmRestore.counts?.treasury||0} حركة خزنة<br/>
          👷 {confirmRestore.counts?.employees||0} موظف<br/>
          <br/>
          <b style={{color:T.err}}>البيانات الحالية ستضيع نهائياً.</b>
          <br/><br/>
          💡 نصيحة: خد نسخة احتياطية الآن قبل الاستعادة.
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <Btn ghost onClick={()=>setConfirmRestore(null)}>إلغاء</Btn>
          <Btn onClick={()=>restoreBackup(confirmRestore)} disabled={busy} style={{background:T.warn,color:"#fff",border:"none",fontWeight:700}}>{busy?<span style={{display:"inline-flex",alignItems:"center",gap:8}}><Spinner size="small" color="#fff" inline/>جاري الاستعادة...</span>:"🔄 تأكيد الاستعادة"}</Btn>
        </div>
      </div>
    </div>}
  </Card>;
}

/* ═══════════════════════════════════════════════════════════════
   TREASURY PAGE — الخزنة
   ═══════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════
   WAREHOUSE PAGE — مركز المخازن
   Unified warehouse management for all stock types:
   - Fabrics (خامات)
   - Accessories (إكسسوار)
   - Finished goods (جاهز) — shortcut to existing StockPg
   - General products (منتجات عامة) — new
   ═══════════════════════════════════════════════════════════════ */
