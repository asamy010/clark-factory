/* ═══════════════════════════════════════════════════════════════
   CLARK - SettingsPg.jsx
   
   Extracted from App.jsx in V15.1 phase 3.
   Contains: PoMigConfirm, TreasurySettingsCard, HrSettingsCard, PrintSettingsCard, SalesSettingsCard, WaContactsCard, SettingsPg, BackupRestoreCard
   ═══════════════════════════════════════════════════════════════ */

import React, { useEffect, useState, useRef, useMemo } from "react";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile } from "firebase/auth";
import { collection, deleteDoc, doc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { createComprehensiveBackup, readComprehensiveBackup, deleteComprehensiveBackup, estimateComprehensiveBackupSize } from "../utils/comprehensiveBackup.js";
import { Btn, Card, DelBtn, Inp, Sel, Spinner } from "../components/ui.jsx";
import { TABS } from "../components/LoginScreen.jsx";
import { FKEYS, FS } from "../constants/index.js";
import { CLARK_LOGO, CLARK_LOGO_PRINT } from "../constants/logo.js";
import { auth, db, getSecondaryAuth } from "../firebase";
import { T, TD, TH } from "../theme.js";
import { gid, openWA } from "../utils/format.js";
import { compressImage } from "../utils/image.js";
import { calcOrder, getConfirmedStock, recomputeStatus, wsTypeInfo } from "../utils/orders.js";
import { formatCustomerSummaryWA, formatWorkshopSummaryWA } from "../utils/accountSummary.js";
import { ask, askForm, showToast, tell } from "../utils/popups.js";
import { openPrintWindow } from "../utils/print.js";
import { getDeviceInfo, getDeviceId, getDeviceNickname, setDeviceNickname, getCachedIpInfo } from "../utils/device.js";
import { analyzeBudgets, getDocTotals, getBudgetSummary, getTopFeatures, fmt as fmtSize } from "../utils/sizeBudget.js";
import { PrintTemplatesEditor } from "../components/PrintTemplatesEditor.jsx";
import { CollectionHealthBar } from "../components/CollectionHealthBar.jsx";
import { HelpTip, CardSubtitle, FieldHelp } from "../components/HelpTip.jsx";
import { StockPg } from "./StockPg.jsx";

export function PoMigConfirm({onConfirm,onCancel,T,FS}){
  const[text,setText]=useState("");
  const isValid=text.trim()==="تحويل";
  return<div>
      <CardSubtitle icon="💡">⚠️ احذر: حذف نهائي لكل بيانات الأوردرات في الموسم الحالي. يستخدم بس لو عاوز تبدأ موسم جديد من الصفر. لا يمكن التراجع — اعمل نسخة احتياطية أولاً.</CardSubtitle>
    <input value={text} onChange={e=>setText(e.target.value)} placeholder="اكتب: تحويل" style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"2px solid "+(isValid?T.ok:T.brd),fontSize:FS,fontFamily:"inherit",background:T.cardSolid,color:T.text,boxSizing:"border-box",outline:"none",marginBottom:10,textAlign:"center",fontWeight:700}}/>
    <div style={{display:"flex",gap:8}}>
      <button onClick={isValid?onConfirm:null} disabled={!isValid} style={{flex:1,padding:"8px 14px",borderRadius:8,border:"none",background:isValid?T.err:"#ccc",color:"#fff",cursor:isValid?"pointer":"not-allowed",fontSize:FS,fontFamily:"inherit",fontWeight:800}}>🔥 تنفيذ التحويل</button>
      <button onClick={onCancel} style={{padding:"8px 14px",borderRadius:8,border:"1px solid "+T.brd,background:T.cardSolid,color:T.text,cursor:"pointer",fontSize:FS,fontFamily:"inherit",fontWeight:600}}>إلغاء</button>
    </div>
  </div>;
}



export function TreasurySettingsCard({config,upConfig,T,FS,isMob,showToast,Inp,Btn,Sel,Card,setDirty,userRole}){
  const isAdmin=userRole==="admin";
  /* V16.61: DEFAULT_OUT/DEFAULT_IN must include the wired categories
     ("دفعة مورد", "تحويل داخلي", "دفعة عميل") that trigger pickers in TreasuryPg.
     Previously these were missing from DEFAULT_OUT, so the first time a user
     saved their treasury settings the saved list would drop "دفعة مورد" and
     the supplier-picker flow broke. Keeping the wired ones in defaults is
     belt-and-braces alongside the union logic in TreasuryPg's resolvedOutCats. */
  const DEFAULT_OUT=["تكلفة","مشتريات","مرتبات","قطع غيار","صيانة ماكينات","خيط","تشغيل خارجي","نقل","كهرباء","ايجار المصنع","نثريات","اكسسوار","مستلزمات تشغيل","ورق ماركر","خدمات","أصول ثابتة","تكاليف أخرى","دفعة مورد","تحويل داخلي"];
  const DEFAULT_IN=["وارد","إيرادات","دفعة عميل","رأس مال","تحويل","تحويل داخلي"];
  const DEFAULT_CHECK=["رصيد افتتاحي","دفعة عميل","دفعة مورد","تسوية مبالغ","تحويل بين الحسابات","أخرى"];
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
  const savedSnap=useMemo(()=>buildSnapshot(savedTS),[JSON.stringify(savedTS)]);
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
  const handleDiscard=async ()=>{
    if(!await ask("إلغاء التعديلات", "سيتم إلغاء كل التعديلات غير المحفوظة. هل تريد المتابعة؟", {danger:true,confirmText:"إلغاء التعديلات"}))return;
    setDraft(buildSnapshot(savedTS));
    setNewOutCat("");setNewInCat("");setNewCheckCat("");
    showToast("↩️ تم إلغاء التعديلات");
  };
  const updateDraft=(fn)=>setDraft(prev=>{const next={...prev};fn(next);return next});
  /* V16.64: add/remove of category lists now persists to config IMMEDIATELY
     (not buffered in draft). Reason: users add categories one at a time and
     don't think "I need to save this" — they expect the add to stick. With
     the old draft-only approach, leaving the screen lost the additions and
     they'd come back to find their list reset. Opening balance + autoSeason
     + lock settings stay as draft because those genuinely benefit from a
     "review before save" workflow. */
  const persistCats=(fn)=>upConfig(d=>{
    if(!d.treasurySettings)d.treasurySettings={};
    fn(d.treasurySettings);
  });
  const removeOut=(c)=>{
    const newList=draft.outCategories.filter(x=>x!==c);
    updateDraft(d=>{d.outCategories=newList});
    persistCats(ts=>{ts.outCategories=newList});
  };
  const removeIn=(c)=>{
    const newList=draft.inCategories.filter(x=>x!==c);
    updateDraft(d=>{d.inCategories=newList});
    persistCats(ts=>{ts.inCategories=newList});
  };
  const removeCheck=(c)=>{
    const newList=draft.checkCategories.filter(x=>x!==c);
    updateDraft(d=>{d.checkCategories=newList});
    persistCats(ts=>{ts.checkCategories=newList});
  };
  const addOut=()=>{const v=newOutCat.trim();if(!v)return;if(draft.outCategories.includes(v)){showToast("⚠️ البند موجود بالفعل");return}
    const newList=[...draft.outCategories,v];
    updateDraft(d=>{d.outCategories=newList});
    persistCats(ts=>{ts.outCategories=newList});
    setNewOutCat("");showToast("✓ تم الإضافة")};
  const addIn=()=>{const v=newInCat.trim();if(!v)return;if(draft.inCategories.includes(v)){showToast("⚠️ البند موجود بالفعل");return}
    const newList=[...draft.inCategories,v];
    updateDraft(d=>{d.inCategories=newList});
    persistCats(ts=>{ts.inCategories=newList});
    setNewInCat("");showToast("✓ تم الإضافة")};
  const addCheck=()=>{const v=newCheckCat.trim();if(!v)return;if(draft.checkCategories.includes(v)){showToast("⚠️ البند موجود بالفعل");return}
    const newList=[...draft.checkCategories,v];
    updateDraft(d=>{d.checkCategories=newList});
    persistCats(ts=>{ts.checkCategories=newList});
    setNewCheckCat("");showToast("✓ تم الإضافة")};

  return<Card title={"🏦 إعدادات الخزنة"+(isDirty?" ✨":"")} style={{marginBottom:16,...(isDirty?{border:"2px solid "+T.warn+"60",boxShadow:"0 0 0 3px "+T.warn+"15"}:{})}}>
    <CardSubtitle icon="💡">
      إعدادات تتحكم في سلوك الخزنة المالية: رصيد البداية، بنود المنصرف والوارد، وربط الموسم.
      أي تعديل هنا يأثر على شاشة الخزنة فقط — التقارير المالية تستخدم هذه الإعدادات.
    </CardSubtitle>
    <div>
      {isDirty&&<div style={{fontSize:FS-2,color:T.warn,marginBottom:12,padding:"8px 12px",background:T.warn+"10",borderRadius:8,border:"1px solid "+T.warn+"30",fontWeight:700,display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:16}}>✨</span>
        <span>لديك تعديلات غير محفوظة — اضغط "حفظ" للتأكيد أو "إلغاء" للرجوع</span>
      </div>}
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:12}}>
        <div><label style={{fontSize:FS-1,fontWeight:700,color:T.textSec,marginBottom:6,display:"block"}}>
          رصيد أول المدة
          <HelpTip>الرصيد الابتدائي للخزنة وقت تفعيل البرنامج. كل الحركات اللي بتدخلها بعد ده بتضاف/تخصم من هذا الرقم.</HelpTip>
        </label>
          <Inp type="number" value={draft.openingBalance||""} onChange={v=>updateDraft(d=>{d.openingBalance=Number(v)||0})} placeholder="0"/></div>
        <div><label style={{fontSize:FS-1,fontWeight:700,color:T.textSec,marginBottom:6,display:"block"}}>
          ربط الموسم تلقائياً
          <HelpTip>
            <b>تلقائي:</b> كل حركة جديدة تتربط بالموسم الحالي اللي مفتوح في البرنامج.<br/>
            <b>يدوي:</b> المستخدم يختار الموسم بنفسه عند تسجيل كل حركة. مفيد لو بتسجل حركات متأخرة لمواسم سابقة.
          </HelpTip>
        </label>
          <Sel value={draft.autoSeason?"auto":"manual"} onChange={v=>updateDraft(d=>{d.autoSeason=v==="auto"})}>
            <option value="auto">تلقائي (الموسم الحالي)</option><option value="manual">يدوي</option></Sel></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:12,marginTop:12}}>
        <div><div style={{fontSize:FS-1,fontWeight:700,color:T.err,marginBottom:6}}>
          بنود المنصرف ({draft.outCategories.length})
          <HelpTip>هذه البنود تظهر في قائمة "نوع الحركة" عند تسجيل منصرف في الخزنة. البنود المعلّمة بـ🔒 مرتبطة بأنظمة أخرى (دفعات موردين، تحويلات، إلخ) ولا يمكن حذفها.</HelpTip>
        </div>
          {/* V16.61: WIRED categories cannot be deleted — they have hard-coded
              behavior in TreasuryPg (party pickers, transfers wiring). Show a
              lock icon instead of ✕ for these so the user understands why. */}
          <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:6}}>{draft.outCategories.map(c=>{
            const wired=["دفعة مورد","تشغيل خارجي","مرتبات","تحويل داخلي"].includes(c);
            return<span key={c} style={{padding:"3px 8px",borderRadius:6,fontSize:FS-2,background:T.err+"08",color:T.err,display:"flex",alignItems:"center",gap:4}} title={wired?"بند مرتبط بنظام آخر — يفتح قائمة اختيار تلقائياً":""}>
              {c}{wired?<span style={{fontSize:9,opacity:0.6}}>🔒</span>:<span onClick={()=>removeOut(c)} style={{cursor:"pointer",fontSize:10}}>✕</span>}
            </span>;
          })}</div>
          <div style={{display:"flex",gap:4}}><Inp value={newOutCat} onChange={setNewOutCat} placeholder="بند جديد..." style={{flex:1}}/><Btn small onClick={addOut}>+</Btn></div>
        </div>
        <div><div style={{fontSize:FS-1,fontWeight:700,color:T.ok,marginBottom:6}}>
          بنود الوارد ({draft.inCategories.length})
          <HelpTip>هذه البنود تظهر في قائمة "نوع الحركة" عند تسجيل وارد في الخزنة. البنود المعلّمة بـ🔒 مرتبطة بأنظمة أخرى (دفعات عملاء، تحويلات داخلية).</HelpTip>
        </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:6}}>{draft.inCategories.map(c=>{
            const wired=["دفعة عميل","تحويل داخلي"].includes(c);
            return<span key={c} style={{padding:"3px 8px",borderRadius:6,fontSize:FS-2,background:T.ok+"08",color:T.ok,display:"flex",alignItems:"center",gap:4}} title={wired?"بند مرتبط بنظام آخر — يفتح قائمة اختيار تلقائياً":""}>
              {c}{wired?<span style={{fontSize:9,opacity:0.6}}>🔒</span>:<span onClick={()=>removeIn(c)} style={{cursor:"pointer",fontSize:10}}>✕</span>}
            </span>;
          })}</div>
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
                <HelpTip>لما القفل مفعّل: المحاسبين العاديين ما يقدروش يعدّلوا حركات الخزنة. تقدر تستثني مستخدمين معينين من القائمة البيضاء أسفل. كل تعديل بيتسجل في سجل الأمان.</HelpTip>
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
                <HelpTip>لما القفل مفعّل: محدش يقدر يحذف حركة من الخزنة إلا المدير أو المستخدمين في القائمة البيضاء. ينصح بتفعيله بعد قفل الحسابات الشهرية لمنع التعديل المتأخر.</HelpTip>
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
  const savedSnap=useMemo(()=>buildSnapshot(savedHR),[JSON.stringify(savedHR)]);
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
  const handleDiscard=async ()=>{
    if(!await ask("إلغاء التعديلات", "سيتم إلغاء كل التعديلات غير المحفوظة. هل تريد المتابعة؟", {danger:true,confirmText:"إلغاء التعديلات"}))return;
    setDraft(buildSnapshot(savedHR));
    showToast("↩️ تم إلغاء التعديلات");
  };
  const updateDraft=(fn)=>setDraft(prev=>{const next={...prev};fn(next);return next});
  const standardHours=draft.workDays*draft.hoursPerDay;

  return<Card title={"👷 إعدادات الموظفين"+(isDirty?" ✨":"")} style={{marginBottom:16,...(isDirty?{border:"2px solid "+T.warn+"60",boxShadow:"0 0 0 3px "+T.warn+"15"}:{})}}>
    <CardSubtitle icon="💡">
      الإعدادات الأساسية لحسابات المرتبات وساعات العمل والإضافي.
      أي تغيير هنا يؤثر على الأسابيع الجديدة فقط — الأسابيع المقفولة لا تتأثر.
    </CardSubtitle>
    <div>
      {isDirty&&<div style={{fontSize:FS-2,color:T.warn,marginBottom:12,padding:"8px 12px",background:T.warn+"10",borderRadius:8,border:"1px solid "+T.warn+"30",fontWeight:700,display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:16}}>✨</span>
        <span>لديك تعديلات غير محفوظة — اضغط "حفظ" للتأكيد أو "إلغاء" للرجوع</span>
      </div>}
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"repeat(3,1fr)",gap:10}}>
        <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>
          أيام العمل الأسبوعية
          <HelpTip>عدد أيام العمل في الأسبوع (عادة 6 أيام، الجمعة عطلة). يستخدم في حساب سعر الساعة.</HelpTip>
        </label>
          <Inp type="number" value={draft.workDays||""} onChange={v=>updateDraft(d=>{d.workDays=Number(v)||6})} placeholder="6"/></div>
        <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>
          ساعات العمل اليومية
          <HelpTip>عدد ساعات العمل الأساسية في اليوم (بدون إضافي). 9 ساعات هو الشائع في المصانع.</HelpTip>
        </label>
          <Inp type="number" step="0.5" value={draft.hoursPerDay||""} onChange={v=>updateDraft(d=>{d.hoursPerDay=Number(v)||9})} placeholder="9"/></div>
        <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>إجمالي ساعات الأسبوع (تلقائي)</label>
          <div style={{padding:"8px 12px",borderRadius:8,background:T.accent+"12",color:T.accent,fontWeight:800,fontSize:FS+2,border:"1px solid "+T.accent+"30",textAlign:"center"}}>{standardHours} ساعة</div>
          <div style={{fontSize:FS-3,color:T.textMut,marginTop:4,textAlign:"center"}}>سعر الساعة = المرتب ÷ {standardHours}</div></div>
        <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>
          ساعات أساسي افتراضية (أسبوعي)
          <HelpTip>الساعات اللي بتعتبر "أساسية" قبل احتساب الإضافي. لو الموظف اشتغل أكثر من ده في الأسبوع، الساعات الزائدة تتحسب إضافي.</HelpTip>
        </label>
          <Inp type="number" value={draft.defaultBaseHours||""} onChange={v=>updateDraft(d=>{d.defaultBaseHours=Number(v)||0})} placeholder="48"/></div>
        <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>
          معامل الإضافي
          <HelpTip>الرقم اللي بنضرب فيه سعر الساعة لحساب أجر الساعة الإضافية. 1.5 يعني "ساعة ونص" — الشائع في القانون المصري.</HelpTip>
        </label>
          <Inp type="number" step="0.1" value={draft.overtimeMultiplier||""} onChange={v=>updateDraft(d=>{d.overtimeMultiplier=Number(v)||1.5})} placeholder="1.5"/></div>
        <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>
          خصم الغياب (بدون إذن)
          <HelpTip>الخصم اللي بيتطبق لو الموظف غاب يوم بدون إذن. <b>يوم واحد:</b> خصم يوم بس. <b>يوم ونص:</b> خصم اليوم + نص يوم إضافي عقوبة. <b>يومين:</b> خصم اليوم + يوم إضافي.</HelpTip>
        </label>
          <Sel value={draft.absencePenalty} onChange={v=>updateDraft(d=>{d.absencePenalty=v})}>
            <option value="1">يوم واحد</option><option value="2">يومين</option><option value="1.5">يوم ونص</option></Sel></div>
        <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>
          يوم بداية الأسبوع
          <HelpTip>اليوم اللي بيبدأ فيه أسبوع المرتبات. في مصر السبت هو الشائع.</HelpTip>
        </label>
          <Sel value={draft.weekStartDay} onChange={v=>updateDraft(d=>{d.weekStartDay=v})}>
            <option value="sat">السبت</option><option value="sun">الأحد</option><option value="mon">الاثنين</option></Sel></div>
        <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>
          يوم صرف المرتبات
          <HelpTip>اليوم اللي بيتم فيه دفع المرتبات أسبوعياً. عادة الخميس أو الجمعة.</HelpTip>
        </label>
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



/* V16.36: Map of supported fonts → Google Fonts URLs for print and preview.
   Cairo is our default app font; the others are popular Arabic-friendly choices.
   When the user picks a font, both the live preview and the print stream load
   the corresponding stylesheet. */
const GOOGLE_FONT_URLS={
  Cairo:    "https://fonts.googleapis.com/css2?family=Cairo:wght@600;700;800;900&display=swap",
  Tajawal:  "https://fonts.googleapis.com/css2?family=Tajawal:wght@500;700;800;900&display=swap",
  Almarai:  "https://fonts.googleapis.com/css2?family=Almarai:wght@700;800&display=swap",
  "Noto Sans Arabic":"https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@600;700;800;900&display=swap",
  "IBM Plex Sans Arabic":"https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@500;600;700&display=swap",
  Amiri:    "https://fonts.googleapis.com/css2?family=Amiri:wght@700&display=swap",
  Lalezar:  "https://fonts.googleapis.com/css2?family=Lalezar&display=swap"
};
const FONT_OPTIONS=Object.keys(GOOGLE_FONT_URLS);

/* V16.5: Inline live preview for label settings — uses QRCode lib dynamically loaded.
   Renders at scale (10x for visibility) with same pixel relations as the actual print. */
function LabelLivePreview({draft,T,FS}){
  const canvasRef=useRef(null);
  const[qrReady,setQrReady]=useState(false);
  /* Load QRCode library once */
  useEffect(()=>{
    if(typeof window==="undefined")return;
    if(window.QRCode){setQrReady(true);return}
    const existing=document.querySelector("script[data-qr-lib]");
    if(existing){
      existing.addEventListener("load",()=>setQrReady(true));
      return;
    }
    const s=document.createElement("script");
    s.src="https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js";
    s.setAttribute("data-qr-lib","1");
    s.onload=()=>setQrReady(true);
    s.onerror=()=>console.error("Failed to load QR lib");
    document.head.appendChild(s);
  },[]);
  /* Render QR whenever draft changes */
  useEffect(()=>{
    if(!qrReady||!canvasRef.current||!window.QRCode)return;
    const qrSize=draft.fields?.qr?.show!==false?(draft.fields?.qr?.size||80):0;
    if(qrSize===0)return;
    try{
      window.QRCode.toCanvas(canvasRef.current,"CLARK:test:4",{
        width:Math.min(200,qrSize*2),
        margin:draft.qrMargin??1,
        errorCorrectionLevel:draft.qrLevel||"M",
        color:{dark:draft.qrColor||"#000000",light:"#ffffff"}
      },()=>{});
    }catch(e){}
  },[qrReady,JSON.stringify(draft)]);

  /* Scale: 3x for visibility on screen (actual print is at real mm) */
  const SCALE=3;
  const w=(draft.labelWidth||40)*SCALE;
  const h=(draft.labelHeight||50)*SCALE;
  const m=(draft.margins||2)*SCALE;
  const qrShow=draft.fields?.qr?.show!==false;
  const qrSizePx=qrShow?Math.min(w-m*2,h-m*2)*((draft.fields?.qr?.size||80)/100):0;

  /* Font size helper: px size / 2.5 = mm in print; we display at SCALE pixels */
  const fontPx=(sz)=>Math.round((sz||12)/2.5*SCALE);

  return<div style={{marginTop:14,padding:12,borderRadius:10,background:T.bg,border:"1px solid "+T.brd}}>
    <div style={{fontSize:FS-1,fontWeight:700,color:T.textSec,marginBottom:10,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
      <span>👁 معاينة مباشرة</span>
      <span style={{fontSize:FS-3,color:T.textMut,fontWeight:500}}>{draft.labelWidth||40}×{draft.labelHeight||50} مم</span>
    </div>
    <div style={{display:"flex",justifyContent:"center",padding:20,background:"#f8fafc",borderRadius:8,minHeight:h+40}}>
      <div style={{
        width:w,height:h,
        background:"#fff",
        border:draft.showBorder?"1px dashed #999":"1px solid #e2e8f0",
        boxShadow:"0 2px 12px rgba(0,0,0,0.08)",
        padding:m,
        boxSizing:"border-box",
        display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
        textAlign:"center",fontFamily:"'"+(draft.fontFamily||"Cairo")+"',Arial,sans-serif",
        gap:2,
        direction:"rtl",
      }}>
        {/* V16.36: Logo at top — overrides brand text when enabled. brightness(0) forces pure black */}
        {draft.showLogo&&<img src={CLARK_LOGO_PRINT} alt="CLARK" style={{width:"75%",maxWidth:w*0.8,height:"auto",filter:"brightness(0) saturate(100%)",marginBottom:2,objectFit:"contain"}}/>}
        {draft.fields?.brand?.show&&!draft.showLogo&&<div style={{fontWeight:900,fontSize:fontPx(draft.fields.brand.size||14),letterSpacing:2,lineHeight:1,color:"#111"}}>CLARK</div>}
        {draft.fields?.modelNo?.show!==false&&<div style={{fontWeight:800,fontSize:fontPx(draft.fields?.modelNo?.size||12),lineHeight:1.1,color:"#111"}}>3262114</div>}
        {draft.fields?.desc?.show&&<div style={{fontSize:fontPx(draft.fields.desc.size||10),color:"#444",lineHeight:1}}>توينز اولادي قطعتين</div>}
        {draft.fields?.sizeLabel?.show&&<div style={{fontWeight:700,fontSize:fontPx(draft.fields.sizeLabel.size||10),lineHeight:1,color:"#111"}}>مقاس: 8</div>}
        {qrShow&&<canvas ref={canvasRef} style={{width:qrSizePx,height:qrSizePx,maxWidth:"100%"}}/>}
        {draft.fields?.series?.show&&<div style={{fontWeight:700,fontSize:fontPx(draft.fields.series.size||12),lineHeight:1,color:"#111"}}>سيري: 4</div>}
        {draft.fields?.price?.show&&<div style={{fontSize:fontPx(draft.fields.price.size||10),lineHeight:1,color:"#111"}}>95 ج.م</div>}
      </div>
    </div>
    <div style={{fontSize:FS-3,color:T.textMut,textAlign:"center",marginTop:6}}>المعاينة تعكس التعديلات الحالية — 3x حجم الطباعة الفعلي</div>
  </div>;
}

export function PrintSettingsCard({config,upConfig,T,FS,isMob,showToast,Inp,Btn,Sel,Card,setDirty}){
  /* V16.36: Added fontFamily + showLogo for QR label customization */
  const DEFAULT_PS={labelWidth:40,labelHeight:50,orientation:"portrait",margins:2,qrLevel:"M",qrMargin:1,qrColor:"#000000",showBorder:false,fontFamily:"Cairo",showLogo:false,fields:{brand:{show:false,size:14},modelNo:{show:true,size:12},desc:{show:false,size:10},qr:{show:true,size:80},series:{show:true,size:12},sizeLabel:{show:true,size:10},price:{show:false,size:10}},salaryPageSize:"A5-landscape",dailyReportSize:"A4"};
  const savedPS=config.printSettings||DEFAULT_PS;
  const buildSnapshot=(ps)=>({
    labelWidth:Number(ps.labelWidth)||40,
    labelHeight:Number(ps.labelHeight)||50,
    margins:Number(ps.margins)||2,
    qrLevel:ps.qrLevel||"M",
    qrColor:ps.qrColor||"#000000",
    qrMargin:ps.qrMargin!==undefined?Number(ps.qrMargin):1,
    showBorder:!!ps.showBorder,
    /* V16.36: */
    fontFamily:ps.fontFamily||"Cairo",
    showLogo:!!ps.showLogo,
    fields:JSON.parse(JSON.stringify(ps.fields||DEFAULT_PS.fields)),
    salaryPageSize:ps.salaryPageSize||"A5-landscape",
    dailyReportSize:ps.dailyReportSize||"A4"
  });
  const[draft,setDraft]=useState(()=>buildSnapshot(savedPS));
  const savedSnap=useMemo(()=>buildSnapshot(savedPS),[JSON.stringify(savedPS)]);
  useEffect(()=>{
    const currentDirty=JSON.stringify(draft)!==JSON.stringify(savedSnap);
    if(!currentDirty)setDraft(buildSnapshot(savedPS));
  },[JSON.stringify(savedSnap)]);/* eslint-disable-line */
  const isDirty=JSON.stringify(draft)!==JSON.stringify(savedSnap);
  useEffect(()=>{setDirty(isDirty)},[isDirty]);/* eslint-disable-line */

  /* V16.36: Pre-load all label font options so the dropdown previews them
     in their actual fonts, and the live preview always has the chosen one available. */
  useEffect(()=>{
    FONT_OPTIONS.forEach(f=>{
      const tagId="font-loader-"+f.replace(/\s+/g,"-");
      if(document.getElementById(tagId))return;
      const link=document.createElement("link");
      link.id=tagId;link.rel="stylesheet";link.href=GOOGLE_FONT_URLS[f];
      document.head.appendChild(link);
    });
  },[]);

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
      /* V16.36: */
      d.printSettings.fontFamily=draft.fontFamily;
      d.printSettings.showLogo=draft.showLogo;
      d.printSettings.fields=JSON.parse(JSON.stringify(draft.fields));
      d.printSettings.salaryPageSize=draft.salaryPageSize;
      d.printSettings.dailyReportSize=draft.dailyReportSize;
    });
    showToast("✅ تم حفظ إعدادات الطباعة");
  };
  const handleDiscard=async ()=>{
    if(!await ask("إلغاء التعديلات", "سيتم إلغاء كل التعديلات غير المحفوظة. هل تريد المتابعة؟", {danger:true,confirmText:"إلغاء التعديلات"}))return;
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
    /* V16.36: chosen font family + Google Fonts mapping */
    const fontFam=ps.fontFamily||"Cairo";
    const fontUrl=GOOGLE_FONT_URLS[fontFam]||GOOGLE_FONT_URLS.Cairo;
    const pw_=openPrintWindow();if(!pw_){tell("المتصفح يمنع الطباعة", "فعّل النوافذ المنبثقة في المتصفح وحاول مرة أخرى", {danger:true});return}let html="<html dir='rtl'><head><title>طباعة تجريبية</title><script src='https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js'></"+"script><link href='"+fontUrl+"' rel='stylesheet'/><style>@page{size:"+w+"mm "+h+"mm;margin:"+m+"mm}*{margin:0;padding:0}body{margin:0;padding:0;font-family:'"+fontFam+"',Arial,sans-serif}.lbl{width:"+(w-m*2)+"mm;height:"+(h-m*2)+"mm;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center"+(ps.showBorder?";border:1px dashed #999":"")+"}.logo{width:80%;max-width:30mm;margin-bottom:1mm}</style></head><body><div class='lbl'>";
    /* V16.36: Logo at top — overrides brand text when enabled.
       The brightness/saturate filter forces pure black on the gray logo
       so it prints crisp on thermal paper. */
    if(ps.showLogo)html+="<img src='"+CLARK_LOGO_PRINT+"' class='logo' alt='CLARK' style='filter:brightness(0) saturate(100%);width:80%;max-width:30mm;margin-bottom:1mm;height:auto;display:block;margin-left:auto;margin-right:auto'/>";
    if(ps.fields?.brand?.show&&!ps.showLogo)html+="<div style='font-weight:900;font-size:"+((ps.fields?.brand?.size||14)/2.5)+"mm;letter-spacing:2px;line-height:1'>CLARK</div>";
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
    <CardSubtitle icon="💡">إعدادات شكل وحجم QR codes اللي بتتطبع على الليبلات والباركود. تحدد ارتفاع الليبل، شعار المصنع، الـlogo داخل QR، وتفاصيل العرض.</CardSubtitle>
      {isDirty&&<div style={{fontSize:FS-2,color:T.warn,marginBottom:12,padding:"8px 12px",background:T.warn+"10",borderRadius:8,border:"1px solid "+T.warn+"30",fontWeight:700,display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:16}}>✨</span>
        <span>لديك تعديلات غير محفوظة — اضغط "حفظ" للتأكيد أو "إلغاء" للرجوع</span>
      </div>}
      {/* V16.72: Inputs and live preview side-by-side on desktop (was stacked
         vertically before — wasted half the screen). Mobile keeps the original
         stacked layout because the preview needs its own room on narrow screens. */}
      <div style={{display:"flex",flexDirection:isMob?"column":"row",gap:12,alignItems:"flex-start"}}>
        <div style={{flex:1,minWidth:0}}>
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
      {/* V16.36: Font family + Logo toggle */}
      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10,flexWrap:"wrap",padding:"8px 10px",borderRadius:8,background:T.accent+"06",border:"1px solid "+T.accent+"20"}}>
        <span style={{fontSize:FS-2,fontWeight:700,color:T.textSec}}>🔤 الخط:</span>
        <Sel value={draft.fontFamily||"Cairo"} onChange={v=>updateDraft(d=>{d.fontFamily=v})} style={{width:170,fontSize:FS-2,fontFamily:"'"+(draft.fontFamily||"Cairo")+"',Arial,sans-serif"}}>
          {FONT_OPTIONS.map(f=><option key={f} value={f} style={{fontFamily:"'"+f+"',Arial,sans-serif"}}>{f}</option>)}
        </Sel>
        <span style={{width:1,height:24,background:T.brd}}/>
        <span onClick={()=>updateDraft(d=>{d.showLogo=!d.showLogo})} style={{cursor:"pointer",fontSize:FS-1,color:draft.showLogo?T.accent:T.textMut,padding:"4px 10px",borderRadius:6,border:"1px solid "+(draft.showLogo?T.accent+"40":T.brd),fontWeight:700,display:"inline-flex",alignItems:"center",gap:6}}>
          {draft.showLogo?"☑":"☐"} 🏷️ لوجو CLARK (أعلى الليبل)
        </span>
        {draft.showLogo&&<span style={{fontSize:FS-3,color:T.textMut}}>(يستبدل نص "اسم الشركة")</span>}
      </div>
      <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>
        {fields.map(f=>{const fv=draft.fields?.[f.key]||{show:false,size:12};const isOn=f.key==="modelNo"||f.key==="qr"?fv.show!==false:fv.show;
          return<div key={f.key} style={{display:"flex",flexDirection:"column",gap:2,padding:"6px 8px",borderRadius:8,background:isOn?T.accent+"06":"transparent",border:"1px solid "+(isOn?T.accent+"25":T.brd),minWidth:140}}>
            <div onClick={()=>toggleField(f.key)} style={{cursor:"pointer",fontSize:FS-2,fontWeight:600,color:isOn?T.accent:T.textMut}}>{isOn?"☑":"☐"} {f.label}</div>
            {isOn&&f.key!=="qr"&&<div style={{display:"flex",alignItems:"center",gap:6,marginTop:4}}>
              <span style={{fontSize:FS-3,color:T.textMut,minWidth:35}}>الحجم:</span>
              <input type="number" min="6" max="28" step="1" value={fv.size||12} onChange={e=>{const v=Number(e.target.value);if(isNaN(v))return;updateFieldSize(f.key,Math.max(6,Math.min(28,v)))}} style={{width:60,padding:"3px 6px",borderRadius:6,border:"1px solid "+T.brd,fontSize:FS-2,fontFamily:"inherit",background:T.inputBg,color:T.text,textAlign:"center"}}/>
              <span style={{fontSize:FS-4,color:T.textMut}}>px</span>
            </div>}
            {isOn&&f.key==="qr"&&<div style={{display:"flex",alignItems:"center",gap:6,marginTop:4}}>
              <span style={{fontSize:FS-3,color:T.textMut,minWidth:35}}>الحجم:</span>
              <input type="number" min="40" max="150" step="5" value={fv.size||80} onChange={e=>{const v=Number(e.target.value);if(isNaN(v))return;updateFieldSize("qr",Math.max(40,Math.min(150,v)))}} style={{width:60,padding:"3px 6px",borderRadius:6,border:"1px solid "+T.brd,fontSize:FS-2,fontFamily:"inherit",background:T.inputBg,color:T.text,textAlign:"center"}}/>
              <span style={{fontSize:FS-4,color:T.textMut}}>%</span>
            </div>}
          </div>})}
      </div>
      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
        <Btn small onClick={printTest} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}} title="اختبار بالقيم الحالية (قبل الحفظ)">🖨 طباعة تجريبية</Btn>
        {isDirty&&<span style={{fontSize:FS-3,color:T.warn,fontStyle:"italic"}}>💡 الاختبار يستخدم التعديلات غير المحفوظة</span>}
      </div>
        </div>{/* V16.72: end of inputs column */}
        {/* V16.72: live preview column — sticks to the right on desktop, sized
           by the actual label width so it never balloons. */}
        <div style={{flex:isMob?"none":"0 0 auto",alignSelf:"stretch"}}>
      {/* V16.5: Live preview card — shows current draft in real-time */}
      <LabelLivePreview draft={draft} T={T} FS={FS}/>
        </div>
      </div>{/* V16.72: end of side-by-side container */}
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



/* V16.50: Settings card for the LARGE 10×15cm labels (workshop delivery receipt
   and customer package label). These labels were hardcoded before — now each one
   has its own font, logo toggle, and per-field show/hide.
   The `kind` prop selects the schema slot:
     - "workshopLabel" → renders settings for renderLabelPages()
     - "customerLabel" → renders settings for printPkgLabel()
   Field list differs by kind. */
const WS_LABEL_FIELDS=[
  {k:"modelDesc",l:"📝 وصف الموديل"},
  {k:"sizeLabel",l:"📐 المقاسات"},
  {k:"cutQty",   l:"✂️ كمية القص"},
  {k:"qrConfirm",l:"📱 QR لتأكيد الاستلام (الورشة تمسحه من الموبايل)"}
];
const CUST_LABEL_FIELDS=[
  {k:"note",      l:"📝 ملاحظات الكرتونة"},
  {k:"movements", l:"📋 سجل حركات الكرتونة"},
  {k:"createdBy", l:"👤 اسم منشئ الكرتونة"},
  {k:"qr",        l:"📱 QR للكرتونة"}
];
/* V16.57: Sales delivery thermal label (10×15) printed from the distribution
   popup per customer row. Shows customer info + items + totals + confirmation QR. */
const SALES_DELIVERY_FIELDS=[
  {k:"phone",     l:"📞 تليفون العميل"},
  {k:"address",   l:"📍 عنوان العميل"},
  {k:"prices",    l:"💰 الأسعار والإجماليات"},
  {k:"itemsDesc", l:"📝 وصف الموديلات"},
  {k:"qr",        l:"📱 QR لتأكيد التسليم (العميل يمسحه)"}
];

/* V16.52: Inline preview for the 10×15 large labels (workshop + customer).
   Uses CSS to scale a 100×150mm representation down to ~200×300px on screen.
   Renders the same visual elements as renderLabelPages / printPkgLabel so the
   user can see the effect of font/logo/field toggles without printing. */
function LargeLabelLivePreview({draft,kind,T,FS}){
  const isWs=kind==="workshopLabel";
  const qrCanvasRef=useRef(null);
  const[qrReady,setQrReady]=useState(false);
  /* Load QR lib for the preview QR code */
  useEffect(()=>{
    if(typeof window==="undefined")return;
    if(window.QRCode){setQrReady(true);return}
    const existing=document.querySelector("script[data-qr-lib]");
    if(existing){existing.addEventListener("load",()=>setQrReady(true));return}
    const s=document.createElement("script");
    s.src="https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js";
    s.setAttribute("data-qr-lib","1");
    s.onload=()=>setQrReady(true);
    document.head.appendChild(s);
  },[]);
  /* Repaint QR whenever any visible setting changes */
  useEffect(()=>{
    if(!qrReady||!qrCanvasRef.current||!window.QRCode)return;
    try{
      /* V16.57: 3 distinct sample URLs per kind so the preview QR reflects
         what each label actually encodes when printed. */
      const sample=kind==="workshopLabel"?"https://app.clark/?act=wsdel&ord=demo"
        :kind==="salesDeliveryLabel"?"https://app.clark/?dc=1&s=demo&c=demo"
        :"CLARK:PKG:demo";
      window.QRCode.toCanvas(qrCanvasRef.current,sample,{width:80,margin:1,errorCorrectionLevel:"M"},()=>{});
    }catch(e){}
  },[qrReady,JSON.stringify(draft),kind]);

  /* Sample data — reflects the same fields renderLabelPages/printPkgLabel use */
  const fontFam=draft.fontFamily||"Cairo";
  const showLogo=!!draft.showLogo;
  const f=draft.fields||{};
  /* Scale 2x: 10cm × 15cm → 200px × 300px (fits a side-by-side column). */
  const SCALE=2;const W=100*SCALE;const H=150*SCALE;const PAD=4*SCALE;

  return<div style={{padding:10,borderRadius:10,background:T.bg,border:"1px solid "+T.brd,height:"100%",display:"flex",flexDirection:"column"}}>
    <div style={{fontSize:FS-1,fontWeight:700,color:T.textSec,marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <span>👁 معاينة مباشرة</span>
      <span style={{fontSize:FS-3,color:T.textMut,fontWeight:500}}>10×15 سم</span>
    </div>
    <div style={{flex:1,display:"flex",justifyContent:"center",alignItems:"flex-start",padding:"12px 0",background:"#f8fafc",borderRadius:8,overflow:"auto"}}>
      <div style={{
        width:W,minHeight:H,background:"#fff",
        boxShadow:"0 2px 12px rgba(0,0,0,0.10)",
        padding:PAD,boxSizing:"border-box",
        display:"flex",flexDirection:"column",
        fontFamily:"'"+fontFam+"',Arial,sans-serif",
        color:"#000",direction:"rtl",fontSize:9
      }}>
        {/* === Workshop label preview === */}
        {kind==="workshopLabel"&&<>
          {/* Brand row */}
          <div style={{textAlign:"center",paddingBottom:3,borderBottom:"2px solid #000",marginBottom:4}}>
            {showLogo
              ?<img src={CLARK_LOGO_PRINT} alt="CLARK" style={{height:16,maxWidth:"60%",filter:"brightness(0) saturate(100%)",objectFit:"contain"}}/>
              :<div style={{fontWeight:800,fontSize:11,letterSpacing:2}}>CLARK Factory</div>}
          </div>
          {/* Title chip */}
          <div style={{textAlign:"center",fontSize:11,fontWeight:800,border:"2px solid #000",display:"block",width:"fit-content",padding:"2px 14px",borderRadius:4,margin:"0 auto 4px"}}>↗ تسليم ورشة</div>
          {/* Big piece+qty */}
          <div style={{textAlign:"center",padding:4,border:"2px solid #000",borderRadius:5,marginBottom:4}}>
            <div style={{fontSize:13,fontWeight:800}}>تيشيرت</div>
            <div style={{fontSize:18,fontWeight:800}}>200 قطعة</div>
          </div>
          {/* Data table — only enabled fields */}
          <table style={{width:"100%",borderCollapse:"collapse",marginBottom:4,fontSize:9}}>
            <tbody>
              <tr><td style={{padding:"2px 6px",fontWeight:800,border:"1px solid #000",width:"35%"}}>الموديل</td><td style={{padding:"2px 6px",fontWeight:700,border:"1px solid #000"}}>3261105</td></tr>
              {f.modelDesc?.show!==false&&<tr><td style={{padding:"2px 6px",fontWeight:800,border:"1px solid #000"}}>الوصف</td><td style={{padding:"2px 6px",fontWeight:700,border:"1px solid #000"}}>سوت اولادي 3 قطع</td></tr>}
              {f.sizeLabel?.show!==false&&<tr><td style={{padding:"2px 6px",fontWeight:800,border:"1px solid #000"}}>المقاسات</td><td style={{padding:"2px 6px",fontWeight:700,border:"1px solid #000"}}>2-3-4-5</td></tr>}
              <tr><td style={{padding:"2px 6px",fontWeight:800,border:"1px solid #000"}}>الورشة</td><td style={{padding:"2px 6px",fontWeight:700,border:"1px solid #000"}}>زياد شرقية</td></tr>
              {f.cutQty?.show!==false&&<tr><td style={{padding:"2px 6px",fontWeight:800,border:"1px solid #000"}}>القص</td><td style={{padding:"2px 6px",fontWeight:700,border:"1px solid #000"}}>480</td></tr>}
            </tbody>
          </table>
          {/* Movement row */}
          <div style={{border:"2px solid #000",borderRadius:4,marginBottom:4}}>
            <div style={{display:"flex",justifyContent:"space-between",padding:"3px 6px",fontSize:9,fontWeight:800}}>
              <span>↗ تسليم</span><span>200</span><span>2026-04-26</span>
            </div>
          </div>
          {/* QR + spacer */}
          <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",marginTop:"auto",paddingTop:6,gap:6}}>
            {f.qrConfirm?.show!==false?<div style={{textAlign:"center",padding:2,border:"2px solid #000",borderRadius:4}}>
              <canvas ref={qrCanvasRef} style={{width:44,height:44,display:"block"}}/>
              <div style={{fontSize:6,fontWeight:700,marginTop:1}}>📱 امسح للتأكيد</div>
            </div>:<div/>}
            <div style={{flex:1}}/>
          </div>
          <div style={{textAlign:"center",fontSize:7,color:"#555",paddingTop:2,borderTop:"1px dashed #000",marginTop:4}}>3261105 | تيشيرت | زياد شرقية</div>
        </>}
        {/* === Customer/warehouse-package label preview === */}
        {kind==="customerLabel"&&<>
          <div style={{textAlign:"center",fontWeight:900,letterSpacing:3,padding:"3px 0",borderBottom:"2px solid #000",fontSize:11}}>
            {showLogo
              ?<img src={CLARK_LOGO_PRINT} alt="CLARK" style={{height:18,maxWidth:"55%",filter:"brightness(0) saturate(100%)",objectFit:"contain"}}/>
              :<span>CLARK</span>}
          </div>
          {/* Top: QR + package info */}
          <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 0",borderBottom:"1px solid #999"}}>
            {f.qr?.show!==false&&<canvas ref={qrCanvasRef} style={{width:50,height:50,flexShrink:0}}/>}
            <div style={{flex:1,textAlign:"center"}}>
              <div style={{fontSize:14,fontWeight:900,color:"#0EA5E9"}}>📦 PKG-001</div>
              <div style={{fontSize:8,color:"#555"}}>2026-04-26{f.note?.show!==false?" — للعميل أحمد":""}</div>
              <div style={{fontSize:8,fontWeight:700,display:"inline-block",padding:"1px 5px",borderRadius:3,background:"#10B98115",color:"#10B981"}}>مفتوحة ✅</div>
            </div>
          </div>
          {/* Items section */}
          <div style={{fontSize:7,fontWeight:800,color:"#475569",margin:"4px 0 2px",paddingBottom:1,borderBottom:"1px solid #E2E8F0"}}>محتويات الكرتونة</div>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr style={{background:"#E2E8F0"}}>
              <th style={{padding:"2px 4px",fontWeight:800,fontSize:7,border:"1px solid #94A3B8",textAlign:"right"}}>الموديل</th>
              <th style={{padding:"2px 4px",fontWeight:800,fontSize:7,border:"1px solid #94A3B8"}}>الوصف</th>
              <th style={{padding:"2px 4px",fontWeight:800,fontSize:7,border:"1px solid #94A3B8"}}>سيري</th>
              <th style={{padding:"2px 4px",fontWeight:800,fontSize:7,border:"1px solid #94A3B8"}}>الكمية</th>
            </tr></thead>
            <tbody>
              <tr><td style={{padding:"2px 4px",fontSize:8,fontWeight:800,border:"1px solid #CBD5E1"}}>3261105</td><td style={{padding:"2px 4px",fontSize:7,color:"#444",border:"1px solid #CBD5E1"}}>سوت اولادي</td><td style={{padding:"2px 4px",fontSize:8,textAlign:"center",border:"1px solid #CBD5E1"}}>10</td><td style={{padding:"2px 4px",fontSize:9,fontWeight:800,color:"#0EA5E9",textAlign:"center",border:"1px solid #CBD5E1"}}>40</td></tr>
              <tr><td style={{padding:"2px 4px",fontSize:8,fontWeight:800,border:"1px solid #CBD5E1"}}>3261110</td><td style={{padding:"2px 4px",fontSize:7,color:"#444",border:"1px solid #CBD5E1"}}>تيشيرت</td><td style={{padding:"2px 4px",fontSize:8,textAlign:"center",border:"1px solid #CBD5E1"}}>5</td><td style={{padding:"2px 4px",fontSize:9,fontWeight:800,color:"#0EA5E9",textAlign:"center",border:"1px solid #CBD5E1"}}>20</td></tr>
              <tr style={{background:"#EFF6FF"}}><td colSpan={2} style={{padding:"2px 4px",fontSize:8,fontWeight:800,border:"1px solid #CBD5E1"}}>الاجمالي</td><td style={{padding:"2px 4px",fontSize:8,fontWeight:800,textAlign:"center",border:"1px solid #CBD5E1"}}>15</td><td style={{padding:"2px 4px",fontSize:10,fontWeight:800,color:"#0EA5E9",textAlign:"center",border:"1px solid #CBD5E1"}}>60</td></tr>
            </tbody>
          </table>
          {/* Movements section (optional) */}
          {f.movements?.show!==false&&<>
            <div style={{fontSize:7,fontWeight:800,color:"#475569",margin:"4px 0 2px",paddingBottom:1,borderBottom:"1px solid #E2E8F0"}}>سجل الحركات</div>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr style={{background:"#E2E8F0"}}><th style={{padding:"1px 4px",fontWeight:800,fontSize:6,border:"1px solid #94A3B8"}}>التاريخ</th><th style={{padding:"1px 4px",fontWeight:800,fontSize:6,border:"1px solid #94A3B8"}}>النوع</th><th style={{padding:"1px 4px",fontWeight:800,fontSize:6,border:"1px solid #94A3B8"}}>التفاصيل</th></tr></thead>
              <tbody>
                <tr><td style={{padding:"1px 4px",fontSize:6,border:"1px solid #E2E8F0"}}>2026-04-26</td><td style={{padding:"1px 4px",fontSize:6,color:"#10B981",fontWeight:800,border:"1px solid #E2E8F0"}}>📥 إضافة</td><td style={{padding:"1px 4px",fontSize:6,border:"1px solid #E2E8F0"}}>3261105 — 40</td></tr>
              </tbody>
            </table>
          </>}
          {/* Footer */}
          <div style={{marginTop:"auto",paddingTop:3,borderTop:"1px solid #000",display:"flex",justifyContent:"space-between",fontSize:6,color:"#888",fontWeight:600}}>
            <span>{f.createdBy?.show!==false?"التعبئة: أحمد":""}</span>
            <span>CLARK Factory Management</span>
          </div>
        </>}
        {/* === Sales delivery label preview (V16.57) === */}
        {kind==="salesDeliveryLabel"&&<>
          {/* Brand row */}
          <div style={{textAlign:"center",paddingBottom:3,borderBottom:"2px solid #000",marginBottom:4}}>
            {showLogo
              ?<img src={CLARK_LOGO_PRINT} alt="CLARK" style={{height:16,maxWidth:"60%",filter:"brightness(0) saturate(100%)",objectFit:"contain"}}/>
              :<div style={{fontWeight:800,fontSize:11,letterSpacing:2}}>CLARK Factory</div>}
          </div>
          {/* Title chip */}
          <div style={{textAlign:"center",fontSize:11,fontWeight:800,border:"2px solid #000",display:"block",width:"fit-content",padding:"2px 14px",borderRadius:4,margin:"0 auto 4px"}}>🚚 إذن تسليم</div>
          {/* Customer name */}
          <div style={{textAlign:"center",padding:4,border:"2px solid #000",borderRadius:5,marginBottom:4}}>
            <div style={{fontSize:9,fontWeight:700,color:"#555"}}>العميل</div>
            <div style={{fontSize:14,fontWeight:800}}>أحمد محمد</div>
          </div>
          {/* Customer info table — only enabled fields */}
          <table style={{width:"100%",borderCollapse:"collapse",marginBottom:4,fontSize:9}}>
            <tbody>
              <tr><td style={{padding:"2px 6px",fontWeight:800,border:"1px solid #000",width:"35%"}}>التاريخ</td><td style={{padding:"2px 6px",fontWeight:700,border:"1px solid #000"}}>2026-04-26</td></tr>
              {f.phone?.show!==false&&<tr><td style={{padding:"2px 6px",fontWeight:800,border:"1px solid #000"}}>التليفون</td><td style={{padding:"2px 6px",fontWeight:700,border:"1px solid #000"}}>01001234567</td></tr>}
              {f.address?.show!==false&&<tr><td style={{padding:"2px 6px",fontWeight:800,border:"1px solid #000"}}>العنوان</td><td style={{padding:"2px 6px",fontWeight:700,border:"1px solid #000",fontSize:8}}>15 شارع الجمهورية، القاهرة</td></tr>}
            </tbody>
          </table>
          {/* Items table */}
          <div style={{fontSize:7,fontWeight:800,color:"#475569",margin:"3px 0 2px"}}>الأصناف</div>
          <table style={{width:"100%",borderCollapse:"collapse",marginBottom:4}}>
            <thead><tr style={{background:"#E2E8F0"}}>
              <th style={{padding:"2px 4px",fontWeight:800,fontSize:7,border:"1px solid #94A3B8",textAlign:"right"}}>الموديل</th>
              {f.itemsDesc?.show!==false&&<th style={{padding:"2px 4px",fontWeight:800,fontSize:7,border:"1px solid #94A3B8"}}>الوصف</th>}
              <th style={{padding:"2px 4px",fontWeight:800,fontSize:7,border:"1px solid #94A3B8"}}>الكمية</th>
              {f.prices?.show!==false&&<><th style={{padding:"2px 4px",fontWeight:800,fontSize:7,border:"1px solid #94A3B8"}}>السعر</th><th style={{padding:"2px 4px",fontWeight:800,fontSize:7,border:"1px solid #94A3B8"}}>الإجمالي</th></>}
            </tr></thead>
            <tbody>
              <tr>
                <td style={{padding:"2px 4px",fontSize:8,fontWeight:800,border:"1px solid #CBD5E1"}}>3261105</td>
                {f.itemsDesc?.show!==false&&<td style={{padding:"2px 4px",fontSize:7,color:"#444",border:"1px solid #CBD5E1"}}>سوت اولادي</td>}
                <td style={{padding:"2px 4px",fontSize:9,fontWeight:800,color:"#0EA5E9",textAlign:"center",border:"1px solid #CBD5E1"}}>40</td>
                {f.prices?.show!==false&&<><td style={{padding:"2px 4px",fontSize:8,textAlign:"center",border:"1px solid #CBD5E1"}}>120</td><td style={{padding:"2px 4px",fontSize:8,fontWeight:800,textAlign:"center",border:"1px solid #CBD5E1"}}>4800</td></>}
              </tr>
              <tr>
                <td style={{padding:"2px 4px",fontSize:8,fontWeight:800,border:"1px solid #CBD5E1"}}>3261110</td>
                {f.itemsDesc?.show!==false&&<td style={{padding:"2px 4px",fontSize:7,color:"#444",border:"1px solid #CBD5E1"}}>تيشيرت</td>}
                <td style={{padding:"2px 4px",fontSize:9,fontWeight:800,color:"#0EA5E9",textAlign:"center",border:"1px solid #CBD5E1"}}>20</td>
                {f.prices?.show!==false&&<><td style={{padding:"2px 4px",fontSize:8,textAlign:"center",border:"1px solid #CBD5E1"}}>80</td><td style={{padding:"2px 4px",fontSize:8,fontWeight:800,textAlign:"center",border:"1px solid #CBD5E1"}}>1600</td></>}
              </tr>
            </tbody>
          </table>
          {/* Totals — only when prices enabled */}
          {f.prices?.show!==false&&<div style={{border:"2px solid #000",borderRadius:4,padding:"3px 6px",marginBottom:4,fontSize:9}}>
            <div style={{display:"flex",justifyContent:"space-between",fontWeight:700}}><span>الإجمالي</span><span>6400 ج.م</span></div>
            <div style={{display:"flex",justifyContent:"space-between",color:"#EF4444",fontWeight:700}}><span>خصم 5%</span><span>- 320 ج.م</span></div>
            <div style={{display:"flex",justifyContent:"space-between",borderTop:"1px solid #000",paddingTop:2,marginTop:2,fontWeight:900,fontSize:11,color:"#059669"}}><span>الصافي</span><span>6080 ج.م</span></div>
          </div>}
          {/* QR — only when enabled */}
          <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",marginTop:"auto",paddingTop:6,gap:6}}>
            {f.qr?.show!==false?<div style={{textAlign:"center",padding:2,border:"2px solid #000",borderRadius:4}}>
              <canvas ref={qrCanvasRef} style={{width:44,height:44,display:"block"}}/>
              <div style={{fontSize:6,fontWeight:700,marginTop:1}}>📱 امسح للتأكيد</div>
            </div>:<div/>}
            <div style={{flex:1}}/>
          </div>
          <div style={{textAlign:"center",fontSize:7,color:"#555",paddingTop:2,borderTop:"1px dashed #000",marginTop:4}}>أحمد محمد | 60 قطعة | 2026-04-26</div>
        </>}
      </div>
    </div>
    <div style={{fontSize:FS-3,color:T.textMut,textAlign:"center",marginTop:6,lineHeight:1.5}}>
      المعاينة تعكس التعديلات الحالية — 2x حجم الطباعة الفعلي
    </div>
  </div>;
}

export function LargeLabelSettingsCard({kind,config,upConfig,T,FS,isMob,showToast,Btn,Sel,Card,setDirty}){
  /* V16.57: 3 kinds supported — workshopLabel, customerLabel (warehouse package),
     and salesDeliveryLabel (sales delivery thermal label) */
  const KIND_INFO={
    workshopLabel:    {title:"🏭 إعدادات ليبل تسليم الورش (10×15)",       fields:WS_LABEL_FIELDS,
                       desc:"إعدادات ليبل التسليم للورش (الذي يطبع من بطاقة تسليم الورشة، حجم 10×15 سم)."},
    customerLabel:    {title:"📦 إعدادات ليبل كراتين مخزن الجاهز (10×15)", fields:CUST_LABEL_FIELDS,
                       desc:"إعدادات ليبل كراتين مخزن الجاهز (الذي يطبع مع كل كرتونة جاهزة في المخزن، حجم 10×15 سم)."},
    salesDeliveryLabel:{title:"🚚 إعدادات ليبل تسليم العملاء (10×15)",     fields:SALES_DELIVERY_FIELDS,
                       desc:"إعدادات ليبل تسليم العملاء (الذي يطبع من شاشة المبيعات في بوب أب التوزيعة لكل عميل، حجم 10×15 سم)."}
  };
  const info=KIND_INFO[kind]||KIND_INFO.workshopLabel;
  const title=info.title;
  const fieldList=info.fields;
  /* V18.31: salesDeliveryLabel additionally has itemsMode (auto|table|summary) */
  const isSalesDeliv=kind==="salesDeliveryLabel";
  const defaults={
    fontFamily:"Cairo",
    showLogo:false,
    fields:Object.fromEntries(fieldList.map(f=>[f.k,{show:true}])),
    ...(isSalesDeliv?{itemsMode:"auto"}:{})
  };
  const slot=(config.printSettings||{})[kind]||defaults;
  const savedJson=useMemo(()=>JSON.stringify({
    fontFamily:slot.fontFamily||"Cairo",
    showLogo:!!slot.showLogo,
    fields:Object.fromEntries(fieldList.map(f=>[f.k,{show:slot.fields?.[f.k]?.show!==false}])),
    ...(isSalesDeliv?{itemsMode:slot.itemsMode||"auto"}:{})
  }),[JSON.stringify(slot)]);
  const[draft,setDraft]=useState(()=>JSON.parse(savedJson));
  useEffect(()=>{const d=JSON.parse(savedJson);if(JSON.stringify(d)!==JSON.stringify(draft))setDraft(d)},[savedJson]);/* eslint-disable-line */
  const draftJson=JSON.stringify(draft);
  const isDirty=draftJson!==savedJson;
  useEffect(()=>{setDirty(isDirty)},[isDirty]);/* eslint-disable-line */
  const update=(fn)=>setDraft(p=>{const n=JSON.parse(JSON.stringify(p));fn(n);return n});
  const handleSave=()=>{upConfig(d=>{if(!d.printSettings)d.printSettings={};d.printSettings[kind]=JSON.parse(draftJson)});showToast("✅ تم حفظ إعدادات الليبل")};
  const handleDiscard=async ()=>{if(!await ask("إلغاء التعديلات", "هل تريد إلغاء التعديلات؟", {danger:true,confirmText:"إلغاء"}))return;setDraft(JSON.parse(savedJson))};
  const toggleField=(k)=>update(d=>{if(!d.fields[k])d.fields[k]={show:false};d.fields[k].show=!d.fields[k].show});

  return<Card title={title+(isDirty?" ✨":"")} style={{marginBottom:16,...(isDirty?{border:"2px solid "+T.warn+"60",boxShadow:"0 0 0 3px "+T.warn+"15"}:{})}}>
    {isDirty&&<div style={{fontSize:FS-2,color:T.warn,marginBottom:12,padding:"8px 12px",background:T.warn+"10",borderRadius:8,border:"1px solid "+T.warn+"30",fontWeight:700,display:"flex",alignItems:"center",gap:8}}>
      <span style={{fontSize:16}}>✨</span><span>لديك تعديلات غير محفوظة — اضغط "حفظ" للتأكيد أو "إلغاء" للرجوع</span>
    </div>}
    <div style={{fontSize:FS-2,color:T.textMut,marginBottom:14,lineHeight:1.7}}>
      {info.desc}
    </div>
    {/* V16.52: Settings (right) + live preview (left) on the same row.
        On mobile, stacks vertically; on desktop, shares the row 60/40. */}
    <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 280px",gap:16,marginBottom:16,alignItems:"stretch"}}>
      {/* Settings column */}
      <div>
        {/* Font + Logo */}
        <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:14,flexWrap:"wrap",padding:"10px 12px",borderRadius:10,background:T.accent+"06",border:"1px solid "+T.accent+"20"}}>
          <span style={{fontSize:FS-2,fontWeight:700,color:T.textSec}}>🔤 الخط:</span>
          <Sel value={draft.fontFamily||"Cairo"} onChange={v=>update(d=>{d.fontFamily=v})} style={{width:170,fontSize:FS-2,fontFamily:"'"+(draft.fontFamily||"Cairo")+"',Arial,sans-serif"}}>
            {FONT_OPTIONS.map(f=><option key={f} value={f} style={{fontFamily:"'"+f+"',Arial,sans-serif"}}>{f}</option>)}
          </Sel>
          <span style={{width:1,height:24,background:T.brd}}/>
          <span onClick={()=>update(d=>{d.showLogo=!d.showLogo})} style={{cursor:"pointer",fontSize:FS-1,color:draft.showLogo?T.accent:T.textMut,padding:"4px 10px",borderRadius:6,border:"1px solid "+(draft.showLogo?T.accent+"40":T.brd),fontWeight:700,display:"inline-flex",alignItems:"center",gap:6}}>
            {draft.showLogo?"☑":"☐"} 🏷️ لوجو CLARK
          </span>
        </div>
        {/* Per-field toggles */}
        <div style={{fontSize:FS-2,fontWeight:700,color:T.textSec,marginBottom:8}}>الحقول التي تظهر على الليبل:</div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {fieldList.map(f=>{const isOn=draft.fields[f.k]?.show!==false;
            return<div key={f.k} onClick={()=>toggleField(f.k)} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderRadius:8,background:isOn?T.accent+"08":T.bg,border:"1px solid "+(isOn?T.accent+"30":T.brd),cursor:"pointer"}}>
              <span style={{fontSize:18,color:isOn?T.accent:T.textMut,fontWeight:800}}>{isOn?"☑":"☐"}</span>
              <span style={{fontSize:FS-1,color:isOn?T.text:T.textSec,fontWeight:isOn?700:500}}>{f.l}</span>
            </div>;
          })}
        </div>
        {/* V18.31: itemsMode selector — only on salesDeliveryLabel. Controls how the items section renders. */}
        {isSalesDeliv&&<div style={{marginTop:14,paddingTop:14,borderTop:"1px solid "+T.brd}}>
          <div style={{fontSize:FS-2,fontWeight:700,color:T.textSec,marginBottom:8}}>📋 عرض الأصناف على الليبل:</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {[
              {v:"auto",   l:"تلقائي — جدول للأصناف ≤ 8، ملخص للأصناف > 8",    sub:"(الافتراضي)"},
              {v:"table",  l:"جدول الموديلات بالكميات دائماً",                  sub:"(تفاصيل كاملة)"},
              {v:"summary",l:"ملخص دائماً — عدد الأصناف + إجمالي الكمية + التاريخ", sub:"(مختصر)"}
            ].map(opt=>{const isSel=(draft.itemsMode||"auto")===opt.v;
              return<div key={opt.v} onClick={()=>update(d=>{d.itemsMode=opt.v})} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 12px",borderRadius:8,background:isSel?T.accent+"10":T.bg,border:"1px solid "+(isSel?T.accent+"40":T.brd),cursor:"pointer"}}>
                <span style={{fontSize:16,color:isSel?T.accent:T.textMut,fontWeight:800,marginTop:1}}>{isSel?"🔘":"⚪"}</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:FS-1,color:isSel?T.text:T.textSec,fontWeight:isSel?700:500}}>{opt.l}</div>
                  <div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>{opt.sub}</div>
                </div>
              </div>;
            })}
          </div>
        </div>}
      </div>
      {/* Preview column */}
      <LargeLabelLivePreview draft={draft} kind={kind} T={T} FS={FS}/>
    </div>
    <div style={{display:"flex",gap:8,justifyContent:"flex-end",paddingTop:12,borderTop:"1px solid "+T.brd}}>
      <Btn ghost onClick={handleDiscard} disabled={!isDirty} style={!isDirty?{opacity:0.4}:{}}>↩️ إلغاء</Btn>
      <Btn primary onClick={handleSave} disabled={!isDirty} style={!isDirty?{opacity:0.4}:{background:T.ok,color:"#fff",border:"none",fontWeight:800,padding:"10px 24px"}}>💾 حفظ</Btn>
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
  const savedSnap=useMemo(()=>buildSnapshot(savedSS),[JSON.stringify(savedSS)]);
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
  const handleDiscard=async ()=>{
    if(!await ask("إلغاء التعديلات", "سيتم إلغاء كل التعديلات غير المحفوظة. هل تريد المتابعة؟", {danger:true,confirmText:"إلغاء التعديلات"}))return;
    setDraft(buildSnapshot(savedSS));
    showToast("↩️ تم إلغاء التعديلات");
  };
  const updateDraft=(fn)=>setDraft(prev=>{const next={...prev};fn(next);return next});

  return<Card title={"💰 إعدادات المبيعات"+(isDirty?" ✨":"")} style={{marginBottom:16,...(isDirty?{border:"2px solid "+T.warn+"60",boxShadow:"0 0 0 3px "+T.warn+"15"}:{})}}>
    <div>
    <CardSubtitle icon="💡">إعدادات تتعلق بمنطق المبيعات والعملاء — هامش الربح الافتراضي، شروط الخصم، رقم بداية الفواتير. تأثيرها يظهر في صفحة المبيعات والفواتير.</CardSubtitle>
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



/* V16.6: SecurityFlagRow — module-level to avoid nested component issues */
function SecurityFlagRow({T,FS,icon,label,desc,children,enabled,onToggle}){
  return<div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:10,background:enabled!==false?T.cardSolid:T.bg,border:"1px solid "+(enabled!==false?T.brd:T.textMut+"20"),marginBottom:8,opacity:enabled!==false?1:0.6}}>
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
}

/* V16.6: SecurityAlertsCard — draft + save pattern for all security flags */
function SecurityAlertsCard({config,upConfig,T,FS,showToast,Inp,Btn,Card,setDirty}){
  const savedJson=useMemo(()=>JSON.stringify(config.securitySettings||{}),[config.securitySettings]);
  const[draft,setDraft]=useState(()=>JSON.parse(savedJson));
  const draftJson=JSON.stringify(draft);
  const isDirty=draftJson!==savedJson;
  useEffect(()=>{if(!isDirty)setDraft(JSON.parse(savedJson))},[savedJson]);/* eslint-disable-line */
  useEffect(()=>{setDirty(isDirty)},[isDirty]);/* eslint-disable-line */
  const upd=(fn)=>setDraft(p=>{const n={...p};fn(n);return n});
  const handleSave=()=>{upConfig(d=>{d.securitySettings=JSON.parse(draftJson)});showToast("✅ تم حفظ التنبيهات الأمنية")};
  const handleDiscard=()=>{ask("إلغاء التعديلات", "هل تريد إلغاء التعديلات؟", {danger:true,confirmText:"إلغاء"}).then(ok=>{if(ok)setDraft(JSON.parse(savedJson))})};
  const s=draft;

  return<Card title={"🛡️ إعدادات التنبيهات الأمنية"+(isDirty?" ✨":"")} style={{marginBottom:16,...(isDirty?{border:"2px solid "+T.warn+"60",boxShadow:"0 0 0 3px "+T.warn+"15"}:{})}}>
    {isDirty?<div style={{fontSize:FS-2,color:T.warn,marginBottom:12,padding:"8px 12px",background:T.warn+"10",borderRadius:8,border:"1px solid "+T.warn+"30",fontWeight:700}}>
    <CardSubtitle icon="💡">تحدد متى يتم تسجيل تنبيهات أمنية في سجل التدقيق (الحذف، التعديل المتأخر، تخطّي القفل، إلخ). كل العمليات الأمنية تتسجل بالتفصيل تلقائياً.</CardSubtitle>
      ✨ تعديلات غير محفوظة — اضغط حفظ للتأكيد
    </div>:null}
    <div style={{fontSize:FS-2,color:T.textSec,marginBottom:12,padding:"10px 14px",background:T.accent+"06",borderRadius:8,border:"1px solid "+T.accent+"20",lineHeight:1.7}}>
      ℹ️ فعّل/عطّل كل تنبيه حسب حاجتك. لو التنبيه مفعّل، يظهر في صفحة الأسبوع المفتوح + Dashboard الأمن.
    </div>
    <SecurityFlagRow T={T} FS={FS} icon="⏰" label="ساعات يومية مرتفعة" desc="تنبيه لو موظف بصم أكتر من الحد ده في يوم واحد" enabled={s.flagExcessiveHours!==false} onToggle={v=>upd(x=>{x.flagExcessiveHours=v})}>
      <Inp type="number" step="0.5" value={s.maxDailyHours||""} onChange={v=>upd(x=>{x.maxDailyHours=Number(v)||14})} placeholder="14" style={{width:70,textAlign:"center"}}/>
      <span style={{fontSize:FS-3,color:T.textMut}}>ساعة</span>
    </SecurityFlagRow>
    <SecurityFlagRow T={T} FS={FS} icon="🔄" label="ساعات متطابقة كل الأيام" desc="ساعات متطابقة بالظبط كل يوم (مشبوه: buddy punching)" enabled={s.flagIdenticalHours!==false} onToggle={v=>upd(x=>{x.flagIdenticalHours=v})}/>
    <SecurityFlagRow T={T} FS={FS} icon="👥" label="تطابق جماعي في يوم واحد" desc="أكثر من الحد ده من الموظفين بنفس الساعات في نفس اليوم" enabled={s.flagSameHoursMultiple!==false} onToggle={v=>upd(x=>{x.flagSameHoursMultiple=v})}>
      <Inp type="number" value={s.minEmpsForSameHours||""} onChange={v=>upd(x=>{x.minEmpsForSameHours=Number(v)||3})} placeholder="3" style={{width:60,textAlign:"center"}}/>
      <span style={{fontSize:FS-3,color:T.textMut}}>موظف+</span>
    </SecurityFlagRow>
    <SecurityFlagRow T={T} FS={FS} icon="📈" label="ارتفاع فجائي في الساعات" desc="ساعات الموظف ارتفعت بنسبة أكبر من الحد مقارنة بالمتوسط" enabled={s.flagSuddenSpike!==false} onToggle={v=>upd(x=>{x.flagSuddenSpike=v})}>
      <Inp type="number" value={s.spikePercent||""} onChange={v=>upd(x=>{x.spikePercent=Number(v)||50})} placeholder="50" style={{width:60,textAlign:"center"}}/>
      <span style={{fontSize:FS-3,color:T.textMut}}>%+</span>
    </SecurityFlagRow>
    <SecurityFlagRow T={T} FS={FS} icon="🔑" label="تغيير كود بصمة حديث" desc="موظف تغير كود بصمته مؤخراً (30 يوم) وبياخد ساعات" enabled={s.flagCodeChange!==false} onToggle={v=>upd(x=>{x.flagCodeChange=v})}/>
    <SecurityFlagRow T={T} FS={FS} icon="✏️" label="نسبة التعديل اليدوي العالية" desc="نسبة التعديلات اليدوية في الأسبوع أكبر من الحد" enabled={s.flagManualEditHigh!==false} onToggle={v=>upd(x=>{x.flagManualEditHigh=v})}>
      <Inp type="number" value={s.manualEditRatio||""} onChange={v=>upd(x=>{x.manualEditRatio=Number(v)||30})} placeholder="30" style={{width:60,textAlign:"center"}}/>
      <span style={{fontSize:FS-3,color:T.textMut}}>%+</span>
    </SecurityFlagRow>
    <SecurityFlagRow T={T} FS={FS} icon="💸" label="سلفة شاذة" desc="سلفة الموظف أكبر من الحد × متوسطه التاريخي" enabled={s.flagAdvanceAnomaly!==false} onToggle={v=>upd(x=>{x.flagAdvanceAnomaly=v})}>
      <Inp type="number" step="0.5" value={s.advanceMultiplier||""} onChange={v=>upd(x=>{x.advanceMultiplier=Number(v)||3})} placeholder="3" style={{width:60,textAlign:"center"}}/>
      <span style={{fontSize:FS-3,color:T.textMut}}>× متوسط</span>
    </SecurityFlagRow>
    <SecurityFlagRow T={T} FS={FS} icon="🌙" label="ساعات إضافي أسبوعية مرتفعة" desc="إجمالي الإضافي الأسبوعي للموظف فوق الحد" enabled={s.flagHighOvertime!==false} onToggle={v=>upd(x=>{x.flagHighOvertime=v})}>
      <Inp type="number" value={s.maxWeeklyOvertime||""} onChange={v=>upd(x=>{x.maxWeeklyOvertime=Number(v)||30})} placeholder="30" style={{width:60,textAlign:"center"}}/>
      <span style={{fontSize:FS-3,color:T.textMut}}>ساعة</span>
    </SecurityFlagRow>
    <SecurityFlagRow T={T} FS={FS} icon="⚡" label="ساعات تساوي الأساسي بالظبط" desc="ساعات كل يوم = عدد الساعات الأساسي (مشبوه: إدخال يدوي)" enabled={s.flagExactBaseHours===true} onToggle={v=>upd(x=>{x.flagExactBaseHours=v})}/>
    <SecurityFlagRow T={T} FS={FS} icon="📅" label="أيام عمل قليلة جداً" desc="الموظف بصم أقل من الحد ده من الأيام" enabled={s.flagFewWorkDays!==false} onToggle={v=>upd(x=>{x.flagFewWorkDays=v})}>
      <Inp type="number" value={s.minWorkDays||""} onChange={v=>upd(x=>{x.minWorkDays=Number(v)||3})} placeholder="3" style={{width:60,textAlign:"center"}}/>
      <span style={{fontSize:FS-3,color:T.textMut}}>يوم</span>
    </SecurityFlagRow>
    <SecurityFlagRow T={T} FS={FS} icon="🔁" label="تكرار تعديل نفس الموظف" desc="نفس الموظف تم تعديل ساعاته يدوياً أكتر من الحد" enabled={s.flagRepeatEdits!==false} onToggle={v=>upd(x=>{x.flagRepeatEdits=v})}>
      <Inp type="number" value={s.maxEditsPerEmp||""} onChange={v=>upd(x=>{x.maxEditsPerEmp=Number(v)||3})} placeholder="3" style={{width:60,textAlign:"center"}}/>
      <span style={{fontSize:FS-3,color:T.textMut}}>تعديل</span>
    </SecurityFlagRow>
    <SecurityFlagRow T={T} FS={FS} icon="💰" label="سلفة + ساعات زيادة" desc="سلفة + ارتفاع ساعات في نفس الأسبوع (مشبوه: محاباة)" enabled={s.flagAdvancePlusSpike!==false} onToggle={v=>upd(x=>{x.flagAdvancePlusSpike=v})}/>
    <SecurityFlagRow T={T} FS={FS} icon="🚫" label="غياب جماعي مفاجئ" desc="نسبة الموظفين اللي ما بصموش في يوم واحد زادت عن الحد" enabled={s.flagMassAbsence!==false} onToggle={v=>upd(x=>{x.flagMassAbsence=v})}>
      <Inp type="number" value={s.massAbsencePercent||""} onChange={v=>upd(x=>{x.massAbsencePercent=Number(v)||30})} placeholder="30" style={{width:60,textAlign:"center"}}/>
      <span style={{fontSize:FS-3,color:T.textMut}}>%+</span>
    </SecurityFlagRow>
    <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14,paddingTop:10,borderTop:"1px solid "+T.brd}}>
      <Btn ghost onClick={handleDiscard} disabled={!isDirty} style={!isDirty?{opacity:0.4}:{}}>↩️ إلغاء</Btn>
      <Btn primary onClick={handleSave} disabled={!isDirty} style={!isDirty?{opacity:0.4}:{background:T.ok,color:"#fff",border:"none",fontWeight:800,padding:"10px 24px"}}>💾 حفظ</Btn>
    </div>
  </Card>;
}

/* V18.34: WhatsApp message preview — renders summary text in a WhatsApp-style
   green bubble with *bold* highlighted, RTL-aware. Used inside WhatsappSummaryCard. */
function WhatsappLivePreview({draft, T, FS, isMob}){
  /* Sample data that exercises every line so each toggle's effect is visible */
  const sampleCust = {
    salesGross: 250000, discPct: 10, discAmt: 25000, salesNet: 225000,
    payCash: 50000, payCheck: 30000, payOther: 0,
    returnsGross: 22000, returnsNet: 19800,
    balance: 225000 - 19800 - 50000 - 30000,/* = 125,200 */
  };
  const sampleWs = {
    totalDelivered: 850, totalReceived: 720, pendingPieces: 130,
    due: 36000, totalPurchase: 5000, totalPaid: 25000,
    balance: 36000 + 5000 - 25000,/* = 16,000 */
  };
  const custText = formatCustomerSummaryWA(sampleCust, draft);
  const wsText   = formatWorkshopSummaryWA(sampleWs, draft);

  /* Render a WA-formatted block (*bold*, • bullets) into styled JSX */
  const renderWaText = (text) => {
    if (!text) return null;
    /* Strip the leading separator the formatter adds (we'll provide our own) */
    const clean = text.replace(/^\n\n━+\n/, "").replace(/^💼\s*\*ملخص الحساب\*\n/, "");
    const lines = clean.split("\n").filter(l => l.length > 0);
    return lines.map((ln, i) => {
      /* Replace *bold* segments with <strong> */
      const parts = ln.split(/(\*[^*]+\*)/g);
      return <div key={i} style={{lineHeight: 1.65, marginBottom: 1}}>
        {parts.map((p, j) => {
          if (p.startsWith("*") && p.endsWith("*")) {
            return <strong key={j} style={{fontWeight: 700, color: "#000"}}>{p.slice(1, -1)}</strong>;
          }
          return <span key={j}>{p}</span>;
        })}
      </div>;
    });
  };

  /* WhatsApp bubble visual style (light green, rounded corners, tail-less for simplicity) */
  const bubbleStyle = {
    background: "#D9FDD3",/* WA outgoing message green */
    borderRadius: "10px 10px 10px 2px",
    padding: "8px 10px 6px",
    fontSize: 11.5,
    color: "#0F1A0F",
    fontFamily: "'Segoe UI', 'Cairo', sans-serif",
    boxShadow: "0 1px 0.5px rgba(0,0,0,0.13)",
    direction: "rtl",
    whiteSpace: "normal",
    wordBreak: "break-word",
  };
  const headerStyle = {fontSize: FS-2, fontWeight: 800, color: T.textSec, marginBottom: 6, display: "flex", alignItems: "center", gap: 6};
  const sectionLabelStyle = {fontSize: 11, fontWeight: 800, color: "#075E54", marginBottom: 4, paddingBottom: 3, borderBottom: "1px dashed #075E5430"};

  return <div style={{
    /* WhatsApp chat background style */
    background: "#E5DDD5",
    backgroundImage: "radial-gradient(circle at 50% 50%, #ddd6cc 1px, transparent 1px)",
    backgroundSize: "20px 20px",
    borderRadius: 12,
    padding: 14,
    border: "1px solid "+T.brd,
    minHeight: 220,
    height: "fit-content",
    position: isMob ? "static" : "sticky",
    top: 8,
  }}>
    <div style={headerStyle}><span>📱</span><span>معاينة الملخص في رسالة الواتساب</span></div>

    {/* Customer bubble */}
    <div style={{marginBottom: 10}}>
      <div style={{fontSize: 10, fontWeight: 700, color: T.textMut, marginBottom: 4, textAlign: "center"}}>👥 ملخص حساب العميل</div>
      {custText ? <div style={bubbleStyle}>
        <div style={sectionLabelStyle}>💼 ملخص الحساب</div>
        {renderWaText(custText)}
        <div style={{fontSize: 9, color: "#667781", textAlign: "left", marginTop: 4}}>11:27 PM ✓✓</div>
      </div> : <div style={{...bubbleStyle, color: "#667781", fontStyle: "italic", textAlign: "center", padding: "12px 10px"}}>(الملخص معطّل — لن يظهر في الرسائل)</div>}
    </div>

    {/* Workshop bubble */}
    <div>
      <div style={{fontSize: 10, fontWeight: 700, color: T.textMut, marginBottom: 4, textAlign: "center"}}>🏭 ملخص حساب الورشة</div>
      {wsText ? <div style={bubbleStyle}>
        <div style={sectionLabelStyle}>💼 ملخص الحساب</div>
        {renderWaText(wsText)}
        <div style={{fontSize: 9, color: "#667781", textAlign: "left", marginTop: 4}}>11:27 PM ✓✓</div>
      </div> : <div style={{...bubbleStyle, color: "#667781", fontStyle: "italic", textAlign: "center", padding: "12px 10px"}}>(الملخص معطّل — لن يظهر في الرسائل)</div>}
    </div>

    <div style={{fontSize: FS-3, color: T.textMut, marginTop: 10, lineHeight: 1.5, textAlign: "center"}}>
      💡 الأرقام في المعاينة افتراضية — الرسائل الحقيقية بتعرض أرقام كل عميل/ورشة
    </div>
  </div>;
}

/* V18.33: WhatsappSummaryCard — controls which lines appear in the
   "ملخص الحساب" footer added to every customer/workshop WA message.
   Stored in data.printSettings.whatsappSummary with shape:
   { customer: { enabled:bool, fields:{...} }, workshop: { ... } } */
export function WhatsappSummaryCard({config,upConfig,T,FS,isMob,showToast,Btn,Card,setDirty}){
  const CUST_LINES = [
    {k:"salesGross",  l:"💰 اجمالي المبيعات (قبل الخصم)"},
    {k:"discount",    l:"🏷️ اجمالي الخصم"},
    {k:"salesNet",    l:"✅ اجمالي بعد الخصم"},
    {k:"returnsNet",  l:"↩️ المرتجع بعد الخصم"},
    {k:"payments",    l:"💵 دفعات (كاش)"},
    {k:"checks",      l:"📝 شيكات"},
    {k:"balance",     l:"📊 الرصيد المستحق (المستحق على/لـ)"},
  ];
  const WS_LINES = [
    {k:"totalDelivered", l:"📤 اجمالي تسليم للورشة (قطع)"},
    {k:"totalReceived",  l:"📥 اجمالي استلام من الورشة (قطع)"},
    {k:"pendingPieces",  l:"⏳ رصيد قطع عند الورشة"},
    {k:"due",            l:"💰 اجمالي مستحق للورشة"},
    {k:"totalPurchase",  l:"🛒 مشتريات"},
    {k:"totalPaid",      l:"💵 مدفوعات"},
    {k:"balance",        l:"📊 الرصيد"},
  ];
  const buildDefaults = () => ({
    customer: {
      enabled: true,
      fields: Object.fromEntries(CUST_LINES.map(l => [l.k, {show: true}]))
    },
    workshop: {
      enabled: true,
      fields: Object.fromEntries(WS_LINES.map(l => [l.k, {show: true}]))
    }
  });
  const slot = (config.printSettings || {}).whatsappSummary || buildDefaults();
  const savedJson = useMemo(() => JSON.stringify({
    customer: {
      enabled: slot.customer?.enabled !== false,
      fields: Object.fromEntries(CUST_LINES.map(l => [l.k, {show: slot.customer?.fields?.[l.k]?.show !== false}]))
    },
    workshop: {
      enabled: slot.workshop?.enabled !== false,
      fields: Object.fromEntries(WS_LINES.map(l => [l.k, {show: slot.workshop?.fields?.[l.k]?.show !== false}]))
    }
  }), [JSON.stringify(slot)]);
  const [draft, setDraft] = useState(() => JSON.parse(savedJson));
  useEffect(() => {const d = JSON.parse(savedJson); if (JSON.stringify(d) !== JSON.stringify(draft)) setDraft(d)}, [savedJson]);/* eslint-disable-line */
  const draftJson = JSON.stringify(draft);
  const isDirty = draftJson !== savedJson;
  useEffect(() => {setDirty(isDirty)}, [isDirty]);/* eslint-disable-line */
  const update = (fn) => setDraft(p => {const n = JSON.parse(JSON.stringify(p)); fn(n); return n});
  const handleSave = async () => {
    upConfig(d => {if (!d.printSettings) d.printSettings = {}; d.printSettings.whatsappSummary = JSON.parse(draftJson)});
    showToast("✅ تم حفظ إعدادات ملخص الواتساب");
  };
  const handleDiscard = async () => {if (!await ask("إلغاء التعديلات", "هل تريد إلغاء التعديلات؟", {danger:true,confirmText:"إلغاء"})) return; setDraft(JSON.parse(savedJson))};

  /* Toggle helpers */
  const toggleEnabled = (kind) => update(d => {d[kind].enabled = !d[kind].enabled});
  const toggleField = (kind, k) => update(d => {if (!d[kind].fields[k]) d[kind].fields[k] = {show: false}; d[kind].fields[k].show = !d[kind].fields[k].show});

  /* Section UI builder */
  const renderSection = (kind, title, icon, lines) => {
    const sec = draft[kind];
    const isOn = sec.enabled !== false;
    return <div style={{padding:14,borderRadius:10,background:T.bg,border:"1px solid "+T.brd,marginBottom:12}}>
      <div onClick={() => toggleEnabled(kind)} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",marginBottom:isOn?12:0,paddingBottom:isOn?12:0,borderBottom:isOn?"1px solid "+T.brd:"none"}}>
        <span style={{fontSize:22,color:isOn?T.ok:T.textMut,fontWeight:800}}>{isOn?"☑":"☐"}</span>
        <span style={{fontSize:FS,fontWeight:800,color:isOn?T.text:T.textSec}}>{icon} {title}</span>
        <span style={{marginInlineStart:"auto",fontSize:FS-3,color:T.textMut,fontWeight:600}}>{isOn?"مُفعّل":"معطّل"}</span>
      </div>
      {isOn && <>
        <div style={{fontSize:FS-2,color:T.textMut,marginBottom:8}}>اختر السطور اللي تظهر في الملخص:</div>
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:6}}>
          {lines.map(line => {
            const fOn = sec.fields[line.k]?.show !== false;
            return <div key={line.k} onClick={() => toggleField(kind, line.k)} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:7,background:fOn?T.accent+"08":T.cardSolid,border:"1px solid "+(fOn?T.accent+"30":T.brd),cursor:"pointer"}}>
              <span style={{fontSize:16,color:fOn?T.accent:T.textMut,fontWeight:800}}>{fOn?"☑":"☐"}</span>
              <span style={{fontSize:FS-1,color:fOn?T.text:T.textSec,fontWeight:fOn?700:500}}>{line.l}</span>
            </div>;
          })}
        </div>
      </>}
    </div>;
  };

  return <Card title={"📱 ملخص الحساب في رسائل الواتساب"+(isDirty?" ✨":"")} style={{marginBottom:16,...(isDirty?{border:"2px solid "+T.warn+"60",boxShadow:"0 0 0 3px "+T.warn+"15"}:{})}}>
    {isDirty && <div style={{fontSize:FS-2,color:T.warn,marginBottom:12,padding:"8px 12px",background:T.warn+"10",borderRadius:8,border:"1px solid "+T.warn+"30",fontWeight:700,display:"flex",alignItems:"center",gap:8}}>
      <span style={{fontSize:16}}>✨</span><span>لديك تعديلات غير محفوظة — اضغط "حفظ"</span>
    </div>}
    <div style={{fontSize:FS-2,color:T.textMut,marginBottom:14,lineHeight:1.7}}>
      💡 يتم إضافة "ملخص الحساب" تلقائيًا في آخر كل رسالة واتساب بتسليم/استلام لعميل أو ورشة — يظهر فيه إجمالي الحساب والمستحقات ليكون مرجعًا سريعًا للطرف الآخر. اختر هنا أي السطور تظهر — والمعاينة جانبًا تتحدث فورًا.
    </div>
    {/* V18.34: 2-column grid — settings on the right (RTL), live preview on the left.
        On mobile, stacks vertically (settings first, preview after). */}
    <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 320px",gap:16,marginBottom:16,alignItems:"start"}}>
      {/* Settings column */}
      <div>
        {renderSection("customer", "ملخص حساب العميل", "👥", CUST_LINES)}
        {renderSection("workshop", "ملخص حساب الورشة", "🏭", WS_LINES)}
      </div>
      {/* Live preview column */}
      <WhatsappLivePreview draft={draft} T={T} FS={FS} isMob={isMob}/>
    </div>
    <div style={{display:"flex",gap:8,justifyContent:"flex-end",paddingTop:12,borderTop:"1px solid "+T.brd}}>
      <Btn ghost onClick={handleDiscard} disabled={!isDirty} style={!isDirty?{opacity:0.4}:{}}>↩️ إلغاء</Btn>
      <Btn primary onClick={handleSave} disabled={!isDirty} style={!isDirty?{opacity:0.4}:{background:T.ok,color:"#fff",border:"none",fontWeight:800,padding:"10px 24px"}}>💾 حفظ</Btn>
    </div>
  </Card>;
}

/* V16.6: PoSettingsCard — draft + save for PO prefix/digits, plus migration inside */
function PoSettingsCard({config,upConfig,T,FS,isMob,showToast,Inp,Btn,Card,poMigState,setPoMigState,poMigResult,setPoMigResult,requirePass,runPoMigration,setDirty}){
  const savedJson=useMemo(()=>JSON.stringify({poPrefix:config.poPrefix||"PO-",poDigits:Number(config.poDigits)||3}),[config.poPrefix,config.poDigits]);
  const[draft,setDraft]=useState(()=>JSON.parse(savedJson));
  const draftJson=JSON.stringify(draft);
  const isDirty=draftJson!==savedJson;
  useEffect(()=>{if(!isDirty)setDraft(JSON.parse(savedJson))},[savedJson]);/* eslint-disable-line */
  useEffect(()=>{setDirty(isDirty)},[isDirty]);/* eslint-disable-line */
  const handleSave=()=>{upConfig(d=>{d.poPrefix=draft.poPrefix;d.poDigits=draft.poDigits});showToast("✅ تم حفظ إعدادات PO")};
  const handleDiscard=()=>{ask("إلغاء التعديلات", "هل تريد إلغاء التعديلات؟", {danger:true,confirmText:"إلغاء"}).then(ok=>{if(ok)setDraft(JSON.parse(savedJson))})};

  return<Card title={"📋 إعدادات أمر التشغيل (PO)"+(isDirty?" ✨":"")} style={{marginBottom:12,...(isDirty?{border:"2px solid "+T.warn+"60",boxShadow:"0 0 0 3px "+T.warn+"15"}:{})}}>
    {isDirty?<div style={{fontSize:FS-2,color:T.warn,marginBottom:12,padding:"8px 12px",background:T.warn+"10",borderRadius:8,border:"1px solid "+T.warn+"30",fontWeight:700}}>
    <CardSubtitle icon="💡">إعدادات شكل وتفاصيل أمر التشغيل (PO) اللي بيطبع للورش — البيانات اللي تظهر، الترتيب، الشعار، والـheader.</CardSubtitle>
      ✨ تعديلات غير محفوظة — اضغط حفظ للتأكيد
    </div>:null}
    <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:12,marginBottom:14}}>
      <div>
        <label style={{fontSize:FS-1,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>البادئة (Prefix)</label>
        <Inp value={draft.poPrefix} onChange={v=>setDraft(p=>({...p,poPrefix:v}))} placeholder="PO-"/>
        <div style={{fontSize:FS-3,color:T.textMut,marginTop:4}}>مثال: PO- أو ORD- أو PROD-</div>
      </div>
      <div>
        <label style={{fontSize:FS-1,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>عدد الأرقام</label>
        <Inp type="number" value={draft.poDigits} onChange={v=>{const n=Math.max(2,Math.min(6,Number(v)||3));setDraft(p=>({...p,poDigits:n}))}}/>
        <div style={{fontSize:FS-3,color:T.textMut,marginTop:4}}>من 2 إلى 6 أرقام</div>
      </div>
    </div>
    <div style={{padding:"10px 14px",borderRadius:10,background:T.accent+"08",border:"1px solid "+T.accent+"20",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
      <span style={{fontSize:FS-1,color:T.textSec,fontWeight:600}}>معاينة الرقم الجديد:</span>
      <span style={{fontSize:FS+3,fontWeight:800,color:T.accent,fontFamily:"monospace",letterSpacing:2}}>
        {draft.poPrefix+String(1).padStart(draft.poDigits,"0")}
      </span>
    </div>
    <div style={{display:"flex",gap:8,justifyContent:"flex-end",paddingTop:10,borderTop:"1px solid "+T.brd,marginBottom:14}}>
      <Btn ghost onClick={handleDiscard} disabled={!isDirty} style={!isDirty?{opacity:0.4}:{}}>↩️ إلغاء</Btn>
      <Btn primary onClick={handleSave} disabled={!isDirty} style={!isDirty?{opacity:0.4}:{background:T.ok,color:"#fff",border:"none",fontWeight:800,padding:"10px 24px"}}>💾 حفظ</Btn>
    </div>
    <div style={{padding:14,borderRadius:10,background:T.err+"06",border:"1px solid "+T.err+"30"}}>
      <div style={{fontSize:FS,fontWeight:800,color:T.err,marginBottom:6}}>⚠️ تحويل الأرقام القديمة (عملية خطيرة)</div>
      <div style={{fontSize:FS-1,color:T.textSec,lineHeight:1.6,marginBottom:10}}>
        هذه العملية ستعيد ترقيم <b>جميع</b> الأوامر في <b>جميع المواسم</b> بالصيغة المحفوظة.
        <br/>الأرقام القديمة ستُحذف نهائياً ولن يمكن استرجاعها.
      </div>
      {isDirty?<div style={{padding:8,background:T.warn+"10",border:"1px solid "+T.warn+"30",borderRadius:6,marginBottom:10,fontSize:FS-2,color:T.warn,fontWeight:700}}>⚠️ احفظ التعديلات أولاً قبل التحويل</div>:null}
      {poMigState===null?<Btn danger onClick={()=>setPoMigState("confirm1")} disabled={isDirty} style={isDirty?{opacity:0.5}:{}}>🔄 بدء تحويل الأرقام</Btn>:null}
      {poMigState==="confirm1"?<div style={{padding:12,background:T.err+"10",borderRadius:8,border:"1px dashed "+T.err+"50"}}>
        <div style={{fontSize:FS,fontWeight:700,color:T.err,marginBottom:8}}>⚠️ تأكيد أول</div>
        <div style={{fontSize:FS-1,color:T.text,marginBottom:10}}>هل أنت متأكد أنك تريد إعادة ترقيم جميع الأوامر القديمة؟ هذه العملية <b>لا يمكن التراجع عنها</b>.</div>
        <div style={{display:"flex",gap:8}}>
          <Btn danger small onClick={()=>setPoMigState("confirm2")}>نعم، متأكد</Btn>
          <Btn ghost small onClick={()=>setPoMigState(null)}>إلغاء</Btn>
        </div>
      </div>:null}
      {poMigState==="confirm2"?<div style={{padding:12,background:T.err+"15",borderRadius:8,border:"2px solid "+T.err+"60"}}>
        <div style={{fontSize:FS,fontWeight:800,color:T.err,marginBottom:8}}>🚨 تأكيد نهائي</div>
        <div style={{fontSize:FS-1,color:T.text,marginBottom:10}}>آخر فرصة للإلغاء. اكتب كلمة <b>"تحويل"</b> للمتابعة:</div>
        <PoMigConfirm onConfirm={()=>requirePass(runPoMigration)} onCancel={()=>setPoMigState(null)} T={T} FS={FS}/>
      </div>:null}
      {poMigState==="running"?<div style={{padding:16,textAlign:"center",background:T.bg,borderRadius:8}}>
        <div style={{fontSize:FS,fontWeight:700,color:T.accent,marginBottom:6}}>🔄 جاري التحويل...</div>
        <div style={{fontSize:FS-1,color:T.textSec}}>لا تغلق النافذة حتى اكتمال العملية</div>
      </div>:null}
      {poMigState==="done"&&poMigResult?<div style={{padding:14,borderRadius:8,background:poMigResult.errors>0?T.warn+"10":T.ok+"10",border:"1px solid "+(poMigResult.errors>0?T.warn:T.ok)+"40"}}>
        <div style={{fontSize:FS,fontWeight:800,color:poMigResult.errors>0?T.warn:T.ok,marginBottom:8}}>
          {poMigResult.fatal?"❌ فشل التحويل":poMigResult.errors>0?"⚠️ اكتمل مع أخطاء":"✅ اكتمل التحويل بنجاح"}
        </div>
        <div style={{fontSize:FS-1,color:T.text,lineHeight:1.6}}>
          <div>• إجمالي الأوامر: <b>{poMigResult.total}</b></div>
          <div>• تم تحديثها: <b style={{color:T.ok}}>{poMigResult.updated}</b></div>
          {poMigResult.errors>0?<div>• أخطاء: <b style={{color:T.err}}>{poMigResult.errors}</b></div>:null}
          {poMigResult.fatal?<div style={{marginTop:6,color:T.err}}>الخطأ: {poMigResult.fatal}</div>:null}
        </div>
        <Btn small onClick={()=>{setPoMigState(null);setPoMigResult(null)}} style={{marginTop:10}}>إغلاق</Btn>
      </div>:null}
    </div>
  </Card>;
}

/* V16.6: SeasonsCard — draft + save pattern */
function SeasonsCard({config,upConfig,T,FS,showToast,Inp,Btn,Card,requirePass,setDirty}){
  const savedJson=useMemo(()=>JSON.stringify({seasons:config.seasons||[],activeSeason:config.activeSeason||""}),[config.seasons,config.activeSeason]);
  const[draft,setDraft]=useState(()=>JSON.parse(savedJson));
  const[newName,setNewName]=useState("");
  const[pendingDeletes,setPendingDeletes]=useState([]);
  const draftJson=JSON.stringify(draft);
  const isDirty=draftJson!==savedJson||pendingDeletes.length>0;
  useEffect(()=>{if(!isDirty)setDraft(JSON.parse(savedJson))},[savedJson]);/* eslint-disable-line */
  useEffect(()=>{setDirty(isDirty)},[isDirty]);/* eslint-disable-line */

  const addSeasonDraft=()=>{
    const n=newName.trim();
    if(!n){showToast("⚠️ ادخل اسم الموسم");return}
    if(draft.seasons.includes(n)){showToast("⚠️ موسم بنفس الاسم موجود");return}
    setDraft(p=>({...p,seasons:[...p.seasons,n]}));
    setNewName("");
    showToast("✨ أُضيف للمسودة — اضغط حفظ");
  };
  const toggleDelete=(s)=>{
    if(pendingDeletes.includes(s)){setPendingDeletes(p=>p.filter(x=>x!==s))}
    else{
      if(s===draft.activeSeason){showToast("⚠️ لا يمكن حذف الموسم النشط");return}
      setPendingDeletes(p=>[...p,s]);
    }
  };
  const activate=(s)=>{
    if(pendingDeletes.includes(s))return;
    setDraft(p=>({...p,activeSeason:s}));
  };
  const handleSave=()=>{
    requirePass(async()=>{
      /* V16.6 fix: Delete Firestore orders for each pending-delete season FIRST,
         matching the behavior of the old deleteSeason function */
      if(pendingDeletes.length>0){
        for(const s of pendingDeletes){
          try{
            const snap=await getDocs(collection(db,"seasons",s,"orders"));
            await Promise.all(snap.docs.map(d=>deleteDoc(doc(db,"seasons",s,"orders",d.id))));
          }catch(e){console.error("Failed to delete season orders:",s,e)}
        }
      }
      upConfig(d=>{
        d.seasons=draft.seasons.filter(s=>!pendingDeletes.includes(s));
        d.activeSeason=draft.activeSeason||(d.seasons[0]||"");
      });
      setPendingDeletes([]);
      showToast("✅ تم حفظ إعدادات المواسم");
    });
  };
  const handleDiscard=async ()=>{
    if(!await ask("إلغاء كل التعديلات", "هل تريد إلغاء كل التعديلات؟", {danger:true,confirmText:"إلغاء الكل"}))return;
    setDraft(JSON.parse(savedJson));
    setPendingDeletes([]);
    setNewName("");
  };

  return<Card title={"📅 ادارة المواسم"+(isDirty?" ✨":"")} style={{marginBottom:12,...(isDirty?{border:"2px solid "+T.warn+"60",boxShadow:"0 0 0 3px "+T.warn+"15"}:{})}}>
    {isDirty?<div style={{fontSize:FS-2,color:T.warn,marginBottom:12,padding:"8px 12px",background:T.warn+"10",borderRadius:8,border:"1px solid "+T.warn+"30",fontWeight:700}}>
    <CardSubtitle icon="💡">إدارة المواسم في البرنامج. الموسم وحدة تنظيمية تجمع الأوردرات والحركات في فترة زمنية محددة (مثلاً: صيف 2026). كل موسم بياناته منفصلة.</CardSubtitle>
      ✨ تعديلات غير محفوظة — اضغط حفظ للتأكيد
    </div>:null}
    <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
      <Inp value={newName} onChange={setNewName} placeholder="اسم الموسم (مثال: SS27)" style={{width:220}}/>
      <Btn primary onClick={addSeasonDraft}>+ موسم جديد</Btn>
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {draft.seasons.map(s=>{
        const isActive=s===draft.activeSeason;
        const isPending=pendingDeletes.includes(s);
        return<div key={s} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderRadius:12,border:isActive?"2px solid "+T.accent:"1px solid "+T.brd,background:isPending?T.err+"08":isActive?T.accentBg:T.cardSolid,flexWrap:"wrap",gap:8,opacity:isPending?0.5:1,textDecoration:isPending?"line-through":"none"}}>
          <div onClick={()=>!isPending&&activate(s)} style={{cursor:isPending?"default":"pointer",display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontWeight:700,fontSize:FS+2,color:isActive?T.accent:T.text}}>{s}</span>
            {isActive?<span style={{fontSize:FS-3,color:T.ok,background:T.ok+"15",padding:"2px 10px",borderRadius:12}}>نشط</span>:null}
            {isPending?<span style={{fontSize:FS-3,color:T.err,background:T.err+"15",padding:"2px 10px",borderRadius:12}}>سيُحذف</span>:null}
          </div>
          <div style={{display:"flex",gap:8}}>
            {!isActive&&!isPending?<Btn small onClick={()=>activate(s)} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}}>تفعيل</Btn>:null}
            <Btn small onClick={()=>toggleDelete(s)} style={isPending?{background:T.bg,color:T.textSec,border:"1px solid "+T.brd}:{background:T.err+"10",color:T.err,border:"1px solid "+T.err+"30"}}>{isPending?"↩️ تراجع":"🗑 حذف"}</Btn>
          </div>
        </div>;
      })}
    </div>
    <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16,paddingTop:12,borderTop:"1px solid "+T.brd}}>
      <Btn ghost onClick={handleDiscard} disabled={!isDirty} style={!isDirty?{opacity:0.4}:{}}>↩️ إلغاء</Btn>
      <Btn primary onClick={handleSave} disabled={!isDirty} style={!isDirty?{opacity:0.4}:{background:T.ok,color:"#fff",border:"none",fontWeight:800,padding:"10px 24px"}}>💾 حفظ</Btn>
    </div>
  </Card>;
}

/* V16.5: LogoCard — draft + save pattern. Logo upload no longer saves instantly. */
function LogoCard({config,upConfig,T,FS,showToast,Btn,Card,requirePass,compressImage,setDirty}){
  const savedLogo=config.logo||"";
  const[draftLogo,setDraftLogo]=useState(savedLogo);
  const isDirty=draftLogo!==savedLogo;
  useEffect(()=>{setDirty(isDirty)},[isDirty]);/* eslint-disable-line */
  /* Sync when parent changes (unless user is editing) */
  useEffect(()=>{if(!isDirty)setDraftLogo(savedLogo)},[savedLogo]);/* eslint-disable-line */
  const handleFile=async e=>{
    const f=e.target.files[0];
    if(!f)return;
    try{
      const compressed=await compressImage(f,200,0.6);
      setDraftLogo(compressed);
      showToast("✨ تم تحميل اللوجو — اضغط حفظ للتأكيد");
    }catch(err){showToast("⛔ فشل معالجة الصورة")}
    finally{e.target.value=""}
  };
  const handleRemove=async ()=>{
    if(!await ask("حذف اللوجو", "هل تريد حذف اللوجو؟", {danger:true,confirmText:"حذف"}))return;
    setDraftLogo("");
  };
  const handleSave=()=>{
    requirePass(()=>{
      upConfig(d=>{d.logo=draftLogo});
      showToast("✅ تم حفظ اللوجو");
    });
  };
  const handleDiscard=async ()=>{
    if(!await ask("إلغاء التعديلات", "إلغاء التعديلات على اللوجو؟", {danger:true,confirmText:"إلغاء"}))return;
    setDraftLogo(savedLogo);
  };
  return<Card title={"لوجو المصنع"+(isDirty?" ✨":"")} style={{marginBottom:12,...(isDirty?{border:"2px solid "+T.warn+"60",boxShadow:"0 0 0 3px "+T.warn+"15"}:{})}}>
    {isDirty&&<div style={{fontSize:FS-2,color:T.warn,marginBottom:12,padding:"8px 12px",background:T.warn+"10",borderRadius:8,border:"1px solid "+T.warn+"30",fontWeight:700}}>
    <CardSubtitle icon="💡">شعار المصنع اللي بيظهر في كل التقارير، الفواتير، والمطبوعات. ارفع صورة بصيغة PNG أو JPG.</CardSubtitle>
      ✨ تعديلات غير محفوظة — اضغط حفظ للتأكيد
    </div>}
    <div style={{display:"flex",alignItems:"center",gap:20,flexWrap:"wrap"}}>
      <div style={{width:80,height:80,borderRadius:12,border:"2px dashed "+T.brd,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",background:T.inputBg||T.cardSolid,cursor:"pointer",position:"relative"}}>
        {draftLogo?<img src={draftLogo} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<span style={{fontSize:FS-1,color:T.textMut}}>لوجو</span>}
        <input type="file" accept="image/*" onChange={handleFile} style={{position:"absolute",inset:0,opacity:0,cursor:"pointer"}}/>
      </div>
      <div style={{flex:1,minWidth:200}}>
        <div style={{fontSize:FS,color:T.text,fontWeight:600,marginBottom:4}}>اضغط على الصورة لرفع اللوجو</div>
        <div style={{fontSize:FS-3,color:T.textMut,marginBottom:6}}>الحد الأقصى للعرض: 200px</div>
        {draftLogo&&<Btn danger small onClick={handleRemove} style={{marginTop:4}}>🗑 حذف اللوجو</Btn>}
      </div>
    </div>
    {/* Save buttons */}
    <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14,paddingTop:10,borderTop:"1px solid "+T.brd}}>
      <Btn ghost onClick={handleDiscard} disabled={!isDirty} style={!isDirty?{opacity:0.4}:{}}>↩️ إلغاء</Btn>
      <Btn primary onClick={handleSave} disabled={!isDirty} style={!isDirty?{opacity:0.4}:{background:T.ok,color:"#fff",border:"none",fontWeight:800,padding:"10px 24px"}}>💾 حفظ</Btn>
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
  /* V16.5: Stable snapshot of saved contacts via useMemo — prevents phantom dirty
     caused by new array reference on every parent re-render
     V16.41: Use canonical comparison — normalize each contact to a fixed shape
     with all expected fields present, in a fixed order. This eliminates phantom
     dirty caused by:
       (a) different key insertion order between Firestore-loaded objects and
           freshly-built drafts,
       (b) missing optional fields (e.g. `reports` undefined vs []),
       (c) extra metadata keys that may be added downstream (e.g. _docId). */
  const canonicalize=(arr)=>JSON.stringify((arr||[]).map(c=>({
    id:c.id||"",
    name:c.name||"",
    phone:String(c.phone||"").replace(/[^0-9]/g,""),
    role:c.role||"",
    reports:Array.isArray(c.reports)?[...c.reports].sort():[],
    createdAt:c.createdAt||""
  })));
  const savedContactsJson=useMemo(()=>canonicalize(config.waContacts),[config.waContacts]);
  const savedContacts=useMemo(()=>JSON.parse(savedContactsJson),[savedContactsJson]);

  const[draftContacts,setDraftContacts]=useState(()=>JSON.parse(savedContactsJson));
  /* New contact form — always local (never affects dirty state) */
  const[newName,setNewName]=useState("");
  const[newPhone,setNewPhone]=useState("");
  const[newRole,setNewRole]=useState("");
  const[newReports,setNewReports]=useState([]);

  /* Draft JSON for comparison — same canonicalization to ensure apples-to-apples */
  const draftJson=canonicalize(draftContacts);
  const isDirty=draftJson!==savedContactsJson;

  /* Sync draft when saved config changes from outside AND user hasn't touched draft */
  useEffect(()=>{
    if(!isDirty){
      setDraftContacts(JSON.parse(savedContactsJson));
    }
  },[savedContactsJson]);/* eslint-disable-line */

  /* Report dirty state to parent — only when it actually changes */
  useEffect(()=>{setDirty(isDirty)},[isDirty]);/* eslint-disable-line */

  /* Save: commit draft to config */
  const handleSave=()=>{
    upConfig(d=>{d.waContacts=JSON.parse(JSON.stringify(draftContacts))});
    showToast("✅ تم حفظ جهات التواصل");
  };
  /* Discard: reset draft to saved */
  const handleDiscard=async ()=>{
    if(!await ask("إلغاء التعديلات", "سيتم إلغاء كل التعديلات غير المحفوظة. هل تريد المتابعة؟", {danger:true,confirmText:"إلغاء التعديلات"}))return;
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
  const handleDelete=async (idx,name)=>{
    if(!await ask("حذف جهة", "حذف جهة «"+name+"» من المسودة؟", {danger:true,confirmText:"حذف"}))return;
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
    <CardSubtitle icon="💡">أرقام الواتساب اللي بترسلهم التقارير اليومية والأسبوعية أوتوماتيكياً. أضف الرقم بصيغة دولية (مثلاً: 201xxxxxxxxx).</CardSubtitle>
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
              <Btn small onClick={()=>{openWA("https://wa.me/"+c.phone,"_blank")}} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}} title="اختبار فتح واتساب">📱</Btn>
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



/* V16.78: STOCK MODE PICKER — اختيار سلوك المخزن مع الأوردرات */
function StockModeCard({configDoc,upConfig,canEdit}){
  const ps=configDoc?.purchaseSettings||{};
  const stockEnabled=!!ps.stockEnabled;
  
  /* تحديد الـmode الحالي بناءً على الـsettings */
  let currentMode="off";
  if(stockEnabled){
    if(ps.autoDeductOnCut===false){
      currentMode="display";/* المخزن مفعّل لكن مش بيخصم */
    }else if(ps.blockOnInsufficientStock===false){
      currentMode="warning";/* بيخصم بالسالب */
    }else{
      currentMode="strict";/* الافتراضي: يرفض السالب */
    }
  }
  
  const setMode=async(newMode)=>{
    if(!canEdit)return;
    let confirmMsg="";
    if(newMode==="off"){
      confirmMsg="سيتم إيقاف خصم الأوردرات من المخزن.\n\nالأوردرات الجديدة لن تخصم خامات من المخزن، ويمكنك تعديل الأرصدة يدوياً.\n\nمتأكد؟";
    }else if(newMode==="display"){
      confirmMsg="سيتم تفعيل المخزن للعرض فقط (مفيش خصم تلقائي).\n\nالاستلامات هتضاف للمخزن، لكن الأوردرات لن تخصم تلقائياً. تقدر تخصم يدوياً.\n\nمتأكد؟";
    }else if(newMode==="warning"){
      confirmMsg="سيتم السماح بالسحب بالسالب.\n\nالأوردرات هتخصم من المخزن حتى لو الرصيد مش كافي. هيظهر تحذير لكن مش هيمنع.\n\n⚠️ ده ممكن يخفي مشاكل حقيقية في الجرد.\n\nمتأكد؟";
    }else if(newMode==="strict"){
      confirmMsg="سيتم تفعيل الوضع الصارم (الافتراضي).\n\nالأوردرات اللي مش هيكفيها رصيد هتترفض حتى تضيف الكميات للمخزن.\n\nمتأكد؟";
    }
    const ok=await ask("تغيير وضع المخزن",confirmMsg,{confirmText:"تأكيد"});
    if(!ok)return;
    
    upConfig(d=>{
      if(!d.purchaseSettings)d.purchaseSettings={};
      const today=new Date().toISOString().split("T")[0];
      if(newMode==="off"){
        d.purchaseSettings.stockEnabled=false;
      }else if(newMode==="display"){
        d.purchaseSettings.stockEnabled=true;
        d.purchaseSettings.autoDeductOnCut=false;
        if(!d.purchaseSettings.stockActivationDate)d.purchaseSettings.stockActivationDate=today;
      }else if(newMode==="warning"){
        d.purchaseSettings.stockEnabled=true;
        d.purchaseSettings.autoDeductOnCut=true;
        d.purchaseSettings.blockOnInsufficientStock=false;
        if(!d.purchaseSettings.stockActivationDate)d.purchaseSettings.stockActivationDate=today;
      }else if(newMode==="strict"){
        d.purchaseSettings.stockEnabled=true;
        d.purchaseSettings.autoDeductOnCut=true;
        d.purchaseSettings.blockOnInsufficientStock=true;
        if(!d.purchaseSettings.stockActivationDate)d.purchaseSettings.stockActivationDate=today;
      }
    });
    showToast("✓ تم تغيير وضع المخزن");
  };
  
  const modes=[
    {key:"off",      icon:"🚫",label:"مغلق",       desc:"المخزن مش مفعل. الأوردرات لا تخصم. التحكم اليدوي بالكميات بس.",color:T.textMut},
    {key:"display",  icon:"👁️",label:"عرض فقط",     desc:"المخزن مفعّل لكن مفيش خصم تلقائي من الأوردرات. الاستلامات تضاف. التعديل يدوي.",color:"#0EA5E9"},
    {key:"warning",  icon:"⚠️", label:"السماح بالسالب",desc:"الأوردرات تخصم حتى لو الرصيد مش كافي. تحذير بس بدون منع. ممكن يخفي مشاكل.",color:T.warn},
    {key:"strict",   icon:"🔒",label:"صارم (الافتراضي)",desc:"الأوردرات اللي مش هيكفيها رصيد ترفض. الجرد سليم دائماً.",color:T.ok},
  ];
  
  return<Card title="🏭 وضع المخزن" style={{marginBottom:14}}>
    <CardSubtitle icon="💡">
      هذا الإعداد يحدد كيف يتعامل البرنامج مع المخزن أوتوماتيكياً.
      عند تأكيد أي أوردر للقص، البرنامج يخصم القماش والإكسسوارات من المخزن — الـmode بيحدد سلوك ده.
      <br/><b>ملاحظة:</b> الأوردرات القديمة (قبل تفعيل المخزن) لا تتأثر.
    </CardSubtitle>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
      {modes.map(m=>{
        const isActive=currentMode===m.key;
        return<div key={m.key}
          onClick={canEdit?()=>setMode(m.key):undefined}
          style={{
            padding:14,borderRadius:10,
            background:isActive?m.color+"12":T.cardSolid,
            border:"2px solid "+(isActive?m.color:T.brd),
            cursor:canEdit?"pointer":"default",
            opacity:!canEdit?0.7:1,
            transition:"all 0.2s",
          }}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
            <span style={{fontSize:FS+4}}>{m.icon}</span>
            <span style={{fontWeight:800,fontSize:FS,color:isActive?m.color:T.text}}>{m.label}</span>
            {isActive&&<span style={{marginInlineStart:"auto",padding:"2px 8px",borderRadius:6,background:m.color,color:"#fff",fontSize:FS-3,fontWeight:700}}>الحالي</span>}
          </div>
          <div style={{fontSize:FS-2,color:T.textSec,lineHeight:1.5}}>{m.desc}</div>
        </div>;
      })}
    </div>
    {!canEdit&&<div style={{marginTop:10,padding:8,background:T.warn+"08",borderRadius:8,fontSize:FS-3,color:T.textMut}}>
      ℹ️ تغيير وضع المخزن متاح فقط للمدير أو المحاسب
    </div>}
    {ps.stockActivationDate&&<div style={{marginTop:10,fontSize:FS-3,color:T.textMut}}>
      📅 تاريخ تفعيل المخزن: {ps.stockActivationDate}
    </div>}
  </Card>;
}


/* V16.75: STORAGE NOTICES PANEL — يعرض رسائل التخزين (نجاح/تحذير/خطأ) من أي مصدر */
function StorageNoticesPanel(){
  const[notices,setNotices]=useState([]);
  const[refreshKey,setRefreshKey]=useState(0);
  const[showSeen,setShowSeen]=useState(false);
  
  React.useEffect(()=>{
    let mounted=true;
    let unsub=null;
    import("../utils/storageNotices.js").then(mod=>{
      if(!mounted)return;
      const refresh=async ()=>{
        if(!mounted)return;
        setNotices(mod.getStorageNotices());
      };
      refresh();
      unsub=mod.subscribeToNotices(refresh);
    });
    return()=>{mounted=false;if(unsub)unsub()};
  },[refreshKey]);
  
  const handleMarkAllSeen=async()=>{
    const mod=await import("../utils/storageNotices.js");
    mod.markAllNoticesSeen();
  };
  const handleClearSeen=async()=>{
    const mod=await import("../utils/storageNotices.js");
    mod.clearSeenNotices();
  };
  const handleClearAll=async()=>{
    if(!await ask("حذف الكل", "حذف كل الرسائل؟", {danger:true,confirmText:"حذف الكل"}))return;
    const mod=await import("../utils/storageNotices.js");
    mod.clearStorageNotices();
  };
  const handleRemove=async(id)=>{
    const mod=await import("../utils/storageNotices.js");
    mod.removeStorageNotice(id);
  };
  const handleMarkSeen=async(id)=>{
    const mod=await import("../utils/storageNotices.js");
    mod.markNoticeSeen(id);
  };
  
  const visibleNotices=showSeen?notices:notices.filter(n=>!n.seen);
  const unseenCount=notices.filter(n=>!n.seen).length;
  
  if(notices.length===0)return null;/* لا تعرض الـcard لو فاضي */
  
  const levelMeta={
    success:{bg:"#10B98108",border:"#10B98140",color:"#059669",icon:"✓"},
    info:   {bg:"#3B82F608",border:"#3B82F640",color:"#2563EB",icon:"ℹ"},
    warning:{bg:"#F59E0B08",border:"#F59E0B40",color:"#D97706",icon:"⚠"},
    error:  {bg:"#EF444408",border:"#EF444440",color:"#DC2626",icon:"⛔"},
  };
  
  return<Card title={"📬 رسائل نظام التخزين"+(unseenCount>0?" ("+unseenCount+" جديد)":"")} style={{marginBottom:14}}>
    <div style={{fontSize:FS-2,color:T.textSec,marginBottom:10,lineHeight:1.6}}>
      رسائل عن تطبيق التحديثات وعمليات الـsync. هذه الرسائل تظهر هنا فقط (لا تظهر في صفحات الموظفين) لتجنب إزعاجهم.
    </div>
    
    <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginBottom:10,flexWrap:"wrap"}}>
      <Btn ghost small onClick={()=>setShowSeen(!showSeen)} style={{fontSize:FS-2}}>
        {showSeen?"إخفاء المقروءة":"عرض المقروءة"}
      </Btn>
      {unseenCount>0&&<Btn ghost small onClick={handleMarkAllSeen} style={{fontSize:FS-2}}>تعليم الكل كمقروء</Btn>}
      <Btn ghost small onClick={handleClearSeen} style={{fontSize:FS-2}}>حذف المقروءة</Btn>
      <Btn ghost small onClick={handleClearAll} style={{fontSize:FS-2,color:T.danger}}>حذف الكل</Btn>
      <Btn ghost small onClick={()=>setRefreshKey(k=>k+1)} style={{fontSize:FS-2}}>🔄</Btn>
    </div>
    
    {visibleNotices.length===0?
      <div style={{padding:20,textAlign:"center",color:T.textMut,fontSize:FS-2}}>
        {showSeen?"لا توجد رسائل":"لا توجد رسائل جديدة"}
      </div>:
      <div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:500,overflowY:"auto"}}>
        {visibleNotices.map(n=>{
          const m=levelMeta[n.level]||levelMeta.info;
          return<div key={n.id} style={{
            padding:10,borderRadius:8,
            background:m.bg,
            border:"1px solid "+m.border,
            opacity:n.seen?0.65:1,
            position:"relative",
          }}>
            <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
              <span style={{fontSize:18,color:m.color,flexShrink:0,lineHeight:1}}>{m.icon}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:700,color:m.color,fontSize:FS,marginBottom:2}}>{n.title}</div>
                {n.details&&<div style={{fontSize:FS-2,color:T.textSec,lineHeight:1.6,marginTop:4,wordBreak:"break-word"}}>{n.details}</div>}
                <div style={{fontSize:FS-3,color:T.textMut,marginTop:6}}>
                  {(()=>{try{const d=new Date(n.at);return d.toLocaleString("ar-EG")}catch(e){return n.at}})()}
                  {n.seen&&<span style={{marginInlineStart:8,opacity:0.6}}>(مقروء)</span>}
                </div>
              </div>
              <div style={{display:"flex",gap:4,flexShrink:0}}>
                {!n.seen&&<button onClick={()=>handleMarkSeen(n.id)} title="تعليم كمقروء"
                  style={{padding:"2px 6px",borderRadius:4,border:"1px solid "+T.brd,background:"transparent",color:T.textSec,fontSize:FS-3,cursor:"pointer"}}>✓</button>}
                <button onClick={()=>handleRemove(n.id)} title="حذف"
                  style={{padding:"2px 6px",borderRadius:4,border:"1px solid "+T.brd,background:"transparent",color:T.danger,fontSize:FS-3,cursor:"pointer"}}>×</button>
              </div>
            </div>
          </div>;
        })}
      </div>
    }
  </Card>;
}


/* V16.75: PARTITIONED DOCS MONITOR — يعرض حجم كل document في hrWeeksDocs */
function PartitionedDocsMonitor(){
  const[stats,setStats]=useState(null);
  const[loading,setLoading]=useState(true);
  const[expanded,setExpanded]=useState({hrWeeks:false});
  const[refreshKey,setRefreshKey]=useState(0);
  
  React.useEffect(()=>{
    let cancelled=false;
    setLoading(true);
    import("../utils/partitionedCollections.js").then(mod=>{
      mod.getAllPartitionedStats().then(data=>{
        if(cancelled)return;
        setStats(data);
        setLoading(false);
      });
    });
    return()=>{cancelled=true};
  },[refreshKey]);
  
  const fmt=(b)=>{if(!b)return"0 B";if(b<1024)return b+" B";if(b<1024*1024)return(b/1024).toFixed(1)+" KB";return(b/(1024*1024)).toFixed(2)+" MB"};
  
  const collectionMeta={
    hrWeeks:{label:"📅 أسابيع المرتبات (hrWeeksDocs)",color:"#8B5CF6"},
  };
  
  return<Card title="📑 مراقبة الـDocuments المُجزّأة (V16.75)" style={{marginBottom:14}}>
    <div style={{fontSize:FS-2,color:T.textSec,marginBottom:10,lineHeight:1.6}}>
      أسابيع المرتبات (hrWeeks) متخزنة كـdocuments منفصلة، كل أسبوع document مستقل.
      هذا يسمح بتراكم سنوات من البيانات بدون قيود الحجم.
    </div>
    
    <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
      <Btn ghost small onClick={()=>setRefreshKey(k=>k+1)} style={{fontSize:FS-2}}>🔄 تحديث</Btn>
    </div>
    
    {loading?<div style={{padding:20,textAlign:"center",color:T.textMut}}>جاري التحميل…</div>:
     !stats?<div style={{padding:20,textAlign:"center",color:T.danger}}>تعذر قراءة البيانات</div>:
    
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {Object.entries(collectionMeta).map(([key,meta])=>{
        const s=stats[key];
        if(!s)return null;
        const isExp=expanded[key];
        return<div key={key} style={{border:"1px solid "+T.brd,borderRadius:10,overflow:"hidden"}}>
          <div style={{padding:12,background:meta.color+"08",borderBottom:isExp?"1px solid "+T.brd:"none",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",cursor:"pointer"}}
               onClick={()=>setExpanded(e=>({...e,[key]:!e[key]}))}>
            <div style={{fontWeight:700,fontSize:FS,flex:1,minWidth:160,color:meta.color}}>{meta.label}</div>
            <div style={{fontSize:FS-1,color:T.textSec,display:"flex",gap:14,flexWrap:"wrap"}}>
              <span><b style={{color:T.text}}>{s.itemCount}</b> document</span>
              <span><b style={{color:T.text}}>{fmt(s.totalSize)}</b></span>
              <span style={{color:T.textMut}}>متوسط/document: {fmt(s.avgSize)}</span>
            </div>
            <span style={{fontSize:14,color:T.textMut}}>{isExp?"▾":"▸"}</span>
          </div>
          
          {isExp&&<div style={{padding:0}}>
            {s.itemCount===0?
              <div style={{padding:20,textAlign:"center",color:T.textMut,fontSize:FS-2}}>لا يوجد بيانات</div>:
              <div style={{maxHeight:340,overflowY:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:FS-2}}>
                  <thead style={{position:"sticky",top:0,background:T.bg}}>
                    <tr style={{borderBottom:"1px solid "+T.brd}}>
                      <th style={{padding:"6px 10px",textAlign:"start",color:T.textMut,fontWeight:600}}>الأسبوع</th>
                      <th style={{padding:"6px 10px",textAlign:"start",color:T.textMut,fontWeight:600}}>التواريخ</th>
                      <th style={{padding:"6px 10px",textAlign:"start",color:T.textMut,fontWeight:600}}>الحالة</th>
                      <th style={{padding:"6px 10px",textAlign:"start",color:T.textMut,fontWeight:600}}>الحجم</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.items.map(it=>{
                      const danger=it.size>800_000;
                      const statusColors={"closed":"#10B981","open":"#3B82F6","draft":"#F59E0B"};
                      const sc=statusColors[it.status]||T.textMut;
                      return<tr key={it.id} style={{borderBottom:"1px solid "+T.brd+"40"}}>
                        <td style={{padding:"6px 10px",fontWeight:600}}>{it.label}</td>
                        <td style={{padding:"6px 10px",color:T.textMut,fontFamily:"monospace",fontSize:FS-3}}>{it.subLabel||"—"}</td>
                        <td style={{padding:"6px 10px"}}>
                          {it.status?<span style={{padding:"2px 8px",borderRadius:4,background:sc+"15",color:sc,fontSize:FS-3}}>{it.status}</span>:"—"}
                        </td>
                        <td style={{padding:"6px 10px",color:danger?T.danger:T.text,fontWeight:danger?700:400}}>{fmt(it.size)}{danger?" ⚠️":""}</td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
            }
          </div>}
        </div>;
      })}
    </div>}
    
    <div style={{marginTop:12,padding:"8px 12px",background:T.accent+"06",borderRadius:8,fontSize:FS-3,color:T.textMut,lineHeight:1.6}}>
      💡 كل document = أسبوع مرتبات كامل (~67 KB في المتوسط). لو document تخطى 800 KB يظهر بلون أحمر — وقتها نقسم تفاصيل الأسبوع لأكثر من document (مستحيل عملياً).
    </div>
  </Card>;
}


/* V16.74: SPLIT DAYS MONITOR — يعرض حجم كل document يومي للـ3 split collections */
function SplitDaysMonitor(){
  const[stats,setStats]=useState(null);
  const[loading,setLoading]=useState(true);
  const[expanded,setExpanded]=useState({treasury:false,auditLog:false,hrLog:false});
  const[refreshKey,setRefreshKey]=useState(0);
  
  React.useEffect(()=>{
    let cancelled=false;
    setLoading(true);
    import("../utils/splitCollections.js").then(mod=>{
      mod.getAllSplitStats().then(data=>{
        if(cancelled)return;
        setStats(data);
        setLoading(false);
      });
    });
    return()=>{cancelled=true};
  },[refreshKey]);
  
  const fmt=(b)=>{if(!b)return"0 B";if(b<1024)return b+" B";if(b<1024*1024)return(b/1024).toFixed(1)+" KB";return(b/(1024*1024)).toFixed(2)+" MB"};
  
  const collectionMeta={
    treasury:{label:"💰 الخزنة (treasuryDays)",color:T.accent},
    auditLog:{label:"📝 سجل الأحداث (auditDays)",color:"#F59E0B"},
    hrLog:   {label:"📋 سجل HR (hrLogDays)",color:"#10B981"},
  };
  
  return<Card title="📅 مراقبة التخزين اليومي (V16.74)" style={{marginBottom:14}}>
    <div style={{fontSize:FS-2,color:T.textSec,marginBottom:10,lineHeight:1.6}}>
      الخزنة وسجل الأحداث وسجل HR متخزنين في documents يومية منفصلة بدل ملف واحد كبير.
      كل document فيه حركات يوم واحد فقط. هذا يخلي البرنامج يستوعب نمو سنوي بدون مشاكل في الحجم.
    </div>
    
    <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
      <Btn ghost small onClick={()=>setRefreshKey(k=>k+1)} style={{fontSize:FS-2}}>🔄 تحديث</Btn>
    </div>
    
    {loading?<div style={{padding:20,textAlign:"center",color:T.textMut}}>جاري التحميل…</div>:
     !stats?<div style={{padding:20,textAlign:"center",color:T.danger}}>تعذر قراءة البيانات</div>:
    
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {Object.entries(collectionMeta).map(([key,meta])=>{
        const s=stats[key];
        if(!s)return null;
        const isExp=expanded[key];
        const top10=s.days.slice(0,10);
        return<div key={key} style={{border:"1px solid "+T.brd,borderRadius:10,overflow:"hidden"}}>
          {/* header */}
          <div style={{padding:12,background:meta.color+"08",borderBottom:isExp?"1px solid "+T.brd:"none",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",cursor:"pointer"}}
               onClick={()=>setExpanded(e=>({...e,[key]:!e[key]}))}>
            <div style={{fontWeight:700,fontSize:FS,flex:1,minWidth:160,color:meta.color}}>{meta.label}</div>
            <div style={{fontSize:FS-1,color:T.textSec,display:"flex",gap:14,flexWrap:"wrap"}}>
              <span><b style={{color:T.text}}>{s.dayCount}</b> يوم</span>
              <span><b style={{color:T.text}}>{s.totalCount.toLocaleString("ar-EG")}</b> سجل</span>
              <span><b style={{color:T.text}}>{fmt(s.totalSize)}</b></span>
              <span style={{color:T.textMut}}>متوسط/يوم: {fmt(s.avgDaySize)}</span>
            </div>
            <span style={{fontSize:14,color:T.textMut}}>{isExp?"▾":"▸"}</span>
          </div>
          
          {/* expanded: list of days */}
          {isExp&&<div style={{padding:0}}>
            {s.dayCount===0?
              <div style={{padding:20,textAlign:"center",color:T.textMut,fontSize:FS-2}}>لا يوجد بيانات بعد</div>:
              <div style={{maxHeight:340,overflowY:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:FS-2}}>
                  <thead style={{position:"sticky",top:0,background:T.bg}}>
                    <tr style={{borderBottom:"1px solid "+T.brd}}>
                      <th style={{padding:"6px 10px",textAlign:"start",color:T.textMut,fontWeight:600}}>اليوم</th>
                      <th style={{padding:"6px 10px",textAlign:"start",color:T.textMut,fontWeight:600}}>عدد الحركات</th>
                      <th style={{padding:"6px 10px",textAlign:"start",color:T.textMut,fontWeight:600}}>الحجم</th>
                      <th style={{padding:"6px 10px",textAlign:"start",color:T.textMut,fontWeight:600}}>المتوسط/حركة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.days.map(d=>{
                      const avg=d.count>0?Math.round(d.size/d.count):0;
                      const danger=d.size>800_000;/* قريب من حد 1MB */
                      return<tr key={d.date} style={{borderBottom:"1px solid "+T.brd+"40"}}>
                        <td style={{padding:"6px 10px",fontFamily:"monospace",color:danger?T.danger:T.text}}>{d.date}</td>
                        <td style={{padding:"6px 10px"}}>{d.count}</td>
                        <td style={{padding:"6px 10px",color:danger?T.danger:T.text,fontWeight:danger?700:400}}>{fmt(d.size)}{danger?" ⚠️":""}</td>
                        <td style={{padding:"6px 10px",color:T.textMut}}>{fmt(avg)}</td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
            }
          </div>}
        </div>;
      })}
    </div>}
    
    <div style={{marginTop:12,padding:"8px 12px",background:T.accent+"06",borderRadius:8,fontSize:FS-3,color:T.textMut,lineHeight:1.6}}>
      💡 الميزة: كل يوم في document منفصل (≤ 5KB عادة) بدل ملف واحد كبير. لو يوم تخطى 800KB يظهر بلون أحمر — وقتها لازم نقسم الـcollection ده على فترات أصغر (نص يوم، ساعة، إلخ).
    </div>
  </Card>;
}


/* V16.0: SIZE BUDGET DASHBOARD — tracks feature sizes with per-feature limits + recommendations.
   Helps plan data splitting and archival before hitting Firestore's 1MB doc limit. */
function SizeBudgetDashboard({configDoc,salesDoc,tasksDoc}){
  const[expanded,setExpanded]=useState(false);
  const reports=React.useMemo(()=>analyzeBudgets(configDoc,salesDoc,tasksDoc),[configDoc,salesDoc,tasksDoc]);
  const totals=React.useMemo(()=>getDocTotals(configDoc,salesDoc,tasksDoc),[configDoc,salesDoc,tasksDoc]);
  const summary=React.useMemo(()=>getBudgetSummary(reports),[reports]);
  const topFeatures=React.useMemo(()=>getTopFeatures(reports,5),[reports]);

  /* Progress bar component (inline) */
  const Bar=({pct,color,height})=>
    <div style={{height:height||8,borderRadius:4,background:T.bg,overflow:"hidden",border:"1px solid "+T.brd}}>
      <div style={{height:"100%",width:Math.min(100,pct)+"%",borderRadius:4,background:color,transition:"width 0.4s"}}/>
    </div>;

  /* Overall status banner */
  const banner=summary.overall==="critical"?{bg:"#EF444408",border:"#EF444440",color:"#DC2626",icon:"🔴",msg:"توجد بيانات وصلت للحد الحرج — مطلوب تدخل فوري"}:
    summary.overall==="high"?{bg:"#F9731608",border:"#F9731640",color:"#EA580C",icon:"🟠",msg:"توجد بيانات مرتفعة الحجم — يُنصح بالأرشفة قريباً"}:
    summary.overall==="warn"?{bg:"#F59E0B08",border:"#F59E0B40",color:"#D97706",icon:"🟡",msg:"توجد بيانات تجاوزت 50% من الحدّ"}:
    {bg:"#10B98108",border:"#10B98140",color:"#059669",icon:"🟢",msg:"كل البيانات في نطاق آمن"};

  return<Card title="📊 لوحة مراقبة حجم البيانات" style={{marginBottom:14}}>
    <div style={{fontSize:FS-2,color:T.textSec,marginBottom:10,lineHeight:1.6}}>
      راقب حجم كل ميزة في التطبيق ضد حدّها المخصص. يساعدك هذا على التخطيط للأرشفة قبل الوصول لحد Firestore (1 MB لكل مستند).
    </div>

    {/* Overall banner */}
    <div style={{padding:12,borderRadius:10,background:banner.bg,border:"1px solid "+banner.border,marginBottom:14,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
      <span style={{fontSize:24}}>{banner.icon}</span>
      <div style={{flex:1,minWidth:200}}>
        <div style={{fontWeight:800,color:banner.color,fontSize:FS+1}}>{banner.msg}</div>
        <div style={{fontSize:FS-2,color:T.textSec,marginTop:4}}>
          {summary.ok} ممتاز • {summary.warn} تحذير • {summary.high} مرتفع • {summary.critical} حرج
        </div>
      </div>
    </div>

    {/* Per-document overview (3 docs) */}
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(200px, 1fr))",gap:10,marginBottom:14}}>
      {[
        {name:"📄 config",data:totals.config,desc:"الموظفين + العملاء + الخزنة..."},
        {name:"📦 sales",data:totals.sales,desc:"جلسات تسليم العملاء"},
        {name:"📌 tasks",data:totals.tasks,desc:"المهام والملاحظات"},
      ].map(doc=>
        <div key={doc.name} style={{padding:12,borderRadius:10,background:T.bg,border:"1px solid "+T.brd}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <span style={{fontWeight:700,color:T.text,fontSize:FS-1}}>{doc.name}</span>
            <span style={{fontSize:FS-3,color:doc.data.status.color,fontWeight:700}}>{doc.data.status.icon} {doc.data.pct}%</span>
          </div>
          <div style={{fontSize:FS-2,color:T.textSec,marginBottom:6,fontFamily:"monospace",direction:"ltr",textAlign:"right"}}>
            {doc.data.fmt} / 1 MB
          </div>
          <Bar pct={doc.data.pct} color={doc.data.status.color} height={6}/>
          <div style={{fontSize:FS-3,color:T.textMut,marginTop:4}}>{doc.desc}</div>
        </div>
      )}
    </div>

    {/* Top 5 largest features — always shown */}
    <div style={{marginBottom:expanded?14:0}}>
      <div style={{fontSize:FS-1,fontWeight:700,color:T.text,marginBottom:8}}>🔝 أكبر 5 ميزات حجماً:</div>
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {topFeatures.map(f=>
          <div key={f.key} style={{padding:10,borderRadius:8,background:T.bg,border:"1px solid "+T.brd}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6,marginBottom:6}}>
              <span style={{fontWeight:700,color:T.text,fontSize:FS-1}}>{f.label}</span>
              <div style={{display:"flex",alignItems:"center",gap:8,fontSize:FS-2}}>
                <span style={{fontFamily:"monospace",color:T.textSec,direction:"ltr"}}>{f.sizeFmt} / {f.budgetFmt}</span>
                <span style={{color:f.status.color,fontWeight:700}}>{f.status.icon} {f.pct}%</span>
              </div>
            </div>
            <Bar pct={f.pct} color={f.status.color}/>
            <div style={{fontSize:FS-3,color:T.textMut,marginTop:4}}>
              {f.count} عنصر • متوسط: {f.avgPerItemFmt}
            </div>
          </div>
        )}
      </div>
    </div>

    {/* Toggle expansion for full list */}
    <div style={{textAlign:"center",marginTop:12}}>
      <Btn small onClick={()=>setExpanded(!expanded)} style={{background:T.accent+"10",color:T.accent,border:"1px solid "+T.accent+"30"}}>
        {expanded?"▲ إخفاء التفاصيل":"▼ عرض كل الميزات ("+reports.length+")"}
      </Btn>
    </div>

    {/* Full list when expanded */}
    {expanded&&<div style={{marginTop:14}}>
      <div style={{fontSize:FS-1,fontWeight:700,color:T.text,marginBottom:8}}>📋 كل الميزات مرتبة حسب النسبة:</div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:FS-2}}>
          <thead>
            <tr style={{borderBottom:"2px solid "+T.brd}}>
              <th style={{...TH,textAlign:"right"}}>الميزة</th>
              <th style={TH}>العدد</th>
              <th style={TH}>الحجم الحالي</th>
              <th style={TH}>الحد</th>
              <th style={TH}>الاستخدام</th>
              <th style={TH}>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((f,i)=>
              <tr key={f.key} style={{borderBottom:"1px solid "+T.brd,background:i%2===1?T.bg:"transparent"}}>
                <td style={{...TD,fontWeight:700,color:T.text,textAlign:"right"}}>{f.label}</td>
                <td style={{...TD,textAlign:"center",color:T.textSec}}>{f.count.toLocaleString()}</td>
                <td style={{...TD,textAlign:"center",fontFamily:"monospace",color:f.status.color,fontWeight:700,direction:"ltr"}}>{f.sizeFmt}</td>
                <td style={{...TD,textAlign:"center",fontFamily:"monospace",color:T.textMut,direction:"ltr"}}>{f.budgetFmt}</td>
                <td style={{...TD,minWidth:120}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontSize:FS-3,fontWeight:700,color:f.status.color,minWidth:35,textAlign:"right"}}>{f.pct}%</span>
                    <div style={{flex:1}}><Bar pct={f.pct} color={f.status.color} height={6}/></div>
                  </div>
                </td>
                <td style={{...TD,textAlign:"center"}}>
                  <span style={{fontSize:FS-3,padding:"2px 8px",borderRadius:6,background:f.status.color+"15",color:f.status.color,fontWeight:700,whiteSpace:"nowrap"}}>
                    {f.status.icon} {f.status.label}
                  </span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Recommendations for high-usage features */}
      {reports.filter(r=>r.pct>=70).length>0&&<div style={{marginTop:14}}>
        <div style={{fontSize:FS-1,fontWeight:700,color:T.warn,marginBottom:8}}>💡 توصيات:</div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {reports.filter(r=>r.pct>=70).map(f=>
            <div key={f.key} style={{padding:10,borderRadius:8,background:f.status.color+"08",border:"1px solid "+f.status.color+"25",fontSize:FS-2}}>
              <div style={{fontWeight:700,color:f.status.color,marginBottom:4}}>{f.status.icon} {f.label} — {f.pct}%</div>
              <div style={{color:T.textSec,lineHeight:1.6}}>{f.advice}</div>
            </div>
          )}
        </div>
      </div>}
    </div>}

    {/* Info footer */}
    <div style={{marginTop:14,padding:"8px 12px",background:T.accent+"06",borderRadius:8,fontSize:FS-3,color:T.textMut,lineHeight:1.6}}>
      💡 حد Firestore: 1 MB لكل مستند منفصل. التنبيهات تبدأ عند 70%. عند 85% يُنصح بالأرشفة للحفاظ على الأداء.
    </div>
  </Card>;
}

/* V15.92: Device info + IP info card — lets user view their device fingerprint
   and optionally assign a friendly nickname (stored in localStorage). */
function DeviceInfoCard(){
  const[dev]=useState(()=>getDeviceInfo());
  const[ipInfo,setIpInfo]=useState(()=>getCachedIpInfo());
  const[nickname,setNickname]=useState(()=>getDeviceNickname());
  const[editing,setEditing]=useState(false);
  const[nickInput,setNickInput]=useState(nickname);
  /* Refresh IP info if not yet cached */
  useEffect(()=>{
    if(!ipInfo){
      import("../utils/device.js").then(m=>m.getIpInfo()).then(info=>setIpInfo(info)).catch(()=>{});
    }
  },[]);
  const saveNick=()=>{setDeviceNickname(nickInput||"");setNickname(nickInput||"");setEditing(false);showToast("✓ تم حفظ اسم الجهاز")};
  return<Card title="🖥️ بيانات هذا الجهاز" style={{marginBottom:14}}>
    <div style={{fontSize:FS-2,color:T.textSec,marginBottom:10,lineHeight:1.6}}>
      يُسجَّل معرف الجهاز وعنوان IP تلقائياً في سجل الأحداث لكل عملية حساسة.
      هذه البيانات تساعد على كشف محاولات الاحتيال (دخول مستخدم باسم مستخدم آخر).
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr",gap:8,padding:12,background:T.bg,borderRadius:10,border:"1px solid "+T.brd,fontSize:FS-1}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
        <span style={{color:T.textSec}}>معرف الجهاز:</span>
        <span style={{fontFamily:"monospace",fontWeight:700,color:T.accent,direction:"ltr"}}>{dev.deviceId}</span>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
        <span style={{color:T.textSec}}>اسم الجهاز:</span>
        {editing?<div style={{display:"flex",gap:4}}>
          <Inp value={nickInput} onChange={setNickInput} placeholder="مثلاً: لابتوب أحمد" style={{fontSize:FS-2,padding:"4px 8px"}} autoFocus/>
          <Btn small primary onClick={saveNick}>✓</Btn>
          <Btn small onClick={()=>{setEditing(false);setNickInput(nickname)}}>✕</Btn>
        </div>:<div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontWeight:700,color:T.text}}>{nickname||"(بدون اسم)"}</span>
          <Btn small onClick={()=>{setNickInput(nickname);setEditing(true)}} style={{padding:"2px 8px",fontSize:FS-3}}>✏️</Btn>
        </div>}
      </div>
      <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
        <span style={{color:T.textSec}}>النظام / المتصفح:</span>
        <span style={{fontWeight:600,color:T.text}}>{dev.browserInfo}</span>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
        <span style={{color:T.textSec}}>دقة الشاشة:</span>
        <span style={{fontFamily:"monospace",color:T.text,direction:"ltr"}}>{dev.screenRes}</span>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
        <span style={{color:T.textSec}}>المنطقة الزمنية:</span>
        <span style={{color:T.text,direction:"ltr"}}>{dev.timezone||"—"}</span>
      </div>
      {ipInfo&&ipInfo.ip?<>
        <div style={{borderTop:"1px dashed "+T.brd,marginTop:4,paddingTop:8}}>
          <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
            <span style={{color:T.textSec}}>عنوان IP:</span>
            <span style={{fontFamily:"monospace",fontWeight:700,color:T.accent,direction:"ltr"}}>{ipInfo.ip}</span>
          </div>
          {ipInfo.city&&<div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8,marginTop:6}}>
            <span style={{color:T.textSec}}>📍 الموقع:</span>
            <span style={{color:T.text}}>{ipInfo.city}, {ipInfo.country}</span>
          </div>}
          {ipInfo.org&&<div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8,marginTop:6}}>
            <span style={{color:T.textSec}}>مزود الإنترنت:</span>
            <span style={{color:T.text,fontSize:FS-2}}>{ipInfo.org}</span>
          </div>}
        </div>
      </>:<div style={{marginTop:4,fontSize:FS-2,color:T.textMut}}>⌛ جاري تحميل بيانات الشبكة...</div>}
    </div>
  </Card>;
}

/* V16.56: PermissionsCard — extracted from an inline IIFE that called React
   hooks (useState/useEffect) directly inside JSX. When the parent SettingsPg
   started rendering its content conditionally per-tab (V16.52), the IIFE was
   sometimes invoked and sometimes not, causing the parent's hook count to
   differ between renders → React error #310. Moving the hooks into a proper
   component scoped at module top-level keeps each render consistent. */
function PermissionsCard({config,upConfig,T,FS,TABS,Btn,showToast}){
  /* V15.66: Draft pattern — changes buffered locally, saved on explicit "حفظ" button */
  const livePerms=config.permissions||{};
  const[draftPerms,setDraftPerms]=useState(()=>JSON.parse(JSON.stringify(livePerms)));
  const[permsDirty,setPermsDirty]=useState(false);
  /* Re-sync draft from live whenever the upstream changes AND there are no unsaved changes */
  useEffect(()=>{if(!permsDirty)setDraftPerms(JSON.parse(JSON.stringify(livePerms)))},[livePerms,permsDirty]);
  /* V15.28: Added payroll_accountant and payroll_verifier roles for separation of duties */
  const roles=["admin","manager","sales_accountant","purchase_accountant","payroll_accountant","payroll_verifier","viewer"];
  const roleLabels={admin:"أدمن",manager:"مدير",sales_accountant:"مبيعات",purchase_accountant:"مشتريات",payroll_accountant:"محاسب مرتبات",payroll_verifier:"مُؤكِّد استلام",viewer:"مشاهد"};
  const tabs=TABS;
  const levels=["edit","view","hide"];
  const levelLabels={edit:"✏️ تعديل",view:"👁 عرض",hide:"❌ مخفي"};
  const levelColors={edit:T.ok,view:T.warn,hide:T.err};
  /* V15.66: Draft setters — mutate local state only.
     V18.61: Hard-block admin writes — even if a UI bug or DevTools tampering
     tries to set permissions[admin].*, refuse silently. The runtime
     getTabPerm() already ignores these values for admin, but this prevents
     polluting factory/config with stale custom admin permissions. */
  const setPerm=(role,tabKey,level)=>{
    if(role==="admin"){
      console.warn("[V18.61] Refused setPerm for admin role — admin permissions are hardcoded");
      return;
    }
    setDraftPerms(p=>{const n=JSON.parse(JSON.stringify(p));if(!n[role])n[role]={};n[role][tabKey]=level;return n});
    setPermsDirty(true);
  };
  const setHrSubPerm=(role,subKey,level)=>{
    if(role==="admin"){
      console.warn("[V18.61] Refused setHrSubPerm for admin role — admin permissions are hardcoded");
      return;
    }
    setDraftPerms(p=>{
      const n=JSON.parse(JSON.stringify(p));
      if(!n[role])n[role]={};
      let hrPerm=n[role].hr;
      if(typeof hrPerm==="string")hrPerm={weeks:hrPerm,verify:hrPerm,employees:hrPerm,security:hrPerm};
      if(!hrPerm||typeof hrPerm!=="object")hrPerm={};
      hrPerm[subKey]=level;
      n[role].hr=hrPerm;
      return n;
    });
    setPermsDirty(true);
  };
  /* V18.61: Strip any admin entry from draft before saving — defensive cleanup
     that ensures we never persist custom admin permissions back to factory/config.
     If the database somehow has them (legacy / tampering), this also cleans them up. */
  const savePerms=()=>{
    upConfig(d=>{
      const cleaned=JSON.parse(JSON.stringify(draftPerms));
      if(cleaned.admin)delete cleaned.admin;/* admin is hardcoded, never persisted */
      d.permissions=cleaned;
    });
    setPermsDirty(false);
    showToast("✓ تم حفظ الصلاحيات");
  };
  const resetPerms=()=>{
    setDraftPerms(JSON.parse(JSON.stringify(livePerms)));
    setPermsDirty(false);
  };
  /* V15.28: Default permissions for all roles (incl. new ones) */
  const defPerms={
    admin:{dashboard:"edit",details:"edit",external:"edit",stock:"edit",reports:"edit",calc:"edit",tasks:"edit",db:"edit",settings:"edit",custDeliver:"edit",treasury:"edit",hr:{weeks:"edit",verify:"edit",employees:"edit",security:"edit"}},
    manager:{dashboard:"edit",details:"edit",external:"edit",stock:"edit",reports:"edit",calc:"edit",tasks:"edit",db:"edit",settings:"hide",custDeliver:"edit",treasury:"view",hr:{weeks:"view",verify:"view",employees:"view",security:"view"}},
    sales_accountant:{dashboard:"view",details:"view",external:"hide",stock:"view",reports:"edit",calc:"hide",tasks:"edit",db:"hide",settings:"hide",custDeliver:"edit",treasury:"hide",hr:{weeks:"hide",verify:"hide",employees:"hide",security:"hide"}},
    purchase_accountant:{dashboard:"view",details:"view",external:"edit",stock:"edit",reports:"edit",calc:"edit",tasks:"edit",db:"edit",settings:"hide",custDeliver:"hide",treasury:"edit",hr:{weeks:"hide",verify:"hide",employees:"hide",security:"hide"}},
    payroll_accountant:{dashboard:"view",details:"view",external:"hide",stock:"hide",reports:"view",calc:"hide",tasks:"edit",db:"hide",settings:"hide",custDeliver:"hide",treasury:"view",hr:{weeks:"edit",verify:"hide",employees:"edit",security:"view"}},
    payroll_verifier:{dashboard:"view",details:"view",external:"hide",stock:"hide",reports:"view",calc:"hide",tasks:"edit",db:"hide",settings:"hide",custDeliver:"hide",treasury:"view",hr:{weeks:"view",verify:"edit",employees:"view",security:"view"}},
    viewer:{dashboard:"view",details:"view",external:"hide",stock:"hide",reports:"view",calc:"view",tasks:"edit",db:"hide",settings:"hide",custDeliver:"hide",treasury:"hide",hr:{weeks:"hide",verify:"hide",employees:"hide",security:"hide"}}
  };
  /* Helpers to read current HR sub-permission with backward compat — reads from DRAFT */
  const getHrCur=(r,subKey)=>{
    const rp=draftPerms[r]||{};
    let hrPerm=rp.hr;
    if(hrPerm===undefined||hrPerm===null)hrPerm=defPerms[r]?.hr;
    if(typeof hrPerm==="string")return hrPerm;/* backward compat */
    if(hrPerm&&typeof hrPerm==="object")return hrPerm[subKey]||defPerms[r]?.hr?.[subKey]||"hide";
    return"hide";
  };
  /* HR sub-rows with labels */
  const hrSubRows=[
    {key:"weeks",label:"━ جدول المرتبات والأسابيع",icon:"📅"},
    {key:"verify",label:"━ تأكيد استلام (QR)",icon:"🔐"},
    {key:"employees",label:"━ إدارة الموظفين",icon:"👷"},
    {key:"security",label:"━ الأمن والرقابة",icon:"🛡️"}
  ];
  /* V18.61: Admin column is hardcoded — cell renders "✏️ دائماً" instead of a select.
     Matches the runtime behavior of getTabPerm() which short-circuits for admin. */
  const AdminLockedCell=()=><span style={{fontSize:FS-2,color:T.ok,fontWeight:700,padding:"4px 8px",background:T.ok+"12",borderRadius:6,border:"1px solid "+T.ok+"30",display:"inline-block"}}>✏️ دائماً</span>;
  return<div style={{overflowX:"auto"}}>
    <div style={{fontSize:FS-2,color:T.textMut,marginBottom:10,padding:"8px 12px",background:T.accent+"08",borderRadius:8,lineHeight:1.7}}>
      💡 <b>محاسب مرتبات</b>: يحسب المرتبات بس مش بيقدر يؤكد الاستلام.<br/>
      💡 <b>مُؤكِّد استلام</b>: يسكن QR بس، ومش بيقدر يعدل أي مبلغ.<br/>
      🛡️ <b>فصل الصلاحيات</b>: المحاسب اللي عدّل المرتب ممنوع يؤكد استلامه (إلا الأدمن).
    </div>
    {/* V18.61: Notice that admin permissions are locked */}
    <div style={{fontSize:FS-2,color:T.ok,marginBottom:10,padding:"10px 14px",background:T.ok+"08",border:"1px solid "+T.ok+"40",borderRadius:8,lineHeight:1.7,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
      <span style={{fontSize:FS+4}}>🔒</span>
      <span>
        <b>صلاحيات الـ admin مثبّتة في الكود</b> — مش قابلة للتعديل من هنا.
        ده عشان نحمي النظام: لو حد عدّلها بالغلط أو بسبب bug، الـ admin هيفقد دخوله ويقفل النظام.
        لتغييرها، لازم release كود جديد.
      </span>
    </div>
    <table style={{width:"100%",borderCollapse:"collapse",minWidth:700}}>
      <thead><tr><th style={TH}>الشاشة</th>{roles.map(r=><th key={r} style={{...TH,textAlign:"center",fontSize:FS-2,...(r==="admin"?{background:T.ok+"08",color:T.ok}:{})}}>{r==="admin"?"🔒 ":""}{roleLabels[r]}</th>)}</tr></thead>
      <tbody>{tabs.map(t=>{
        /* If this tab is "hr", render the parent row + 4 sub-rows */
        if(t.key==="hr"){
          return<React.Fragment key="hr-group">
            <tr style={{background:T.accent+"08"}}>
              <td style={{...TD,fontWeight:800,color:T.accent}}>
                <span style={{marginLeft:6}}>{t.icon}</span>{t.label}
                <span style={{fontSize:FS-3,color:T.textMut,fontWeight:600,marginInlineStart:6}}>(4 أقسام)</span>
              </td>
              {roles.map(r=><td key={r} style={{...TD,textAlign:"center",color:T.textMut,fontSize:FS-3,fontStyle:"italic"}}>↓ أقسام فرعية</td>)}
            </tr>
            {hrSubRows.map(sub=><tr key={"hr-"+sub.key}>
              <td style={{...TD,paddingInlineStart:24,fontSize:FS-2,color:T.textSec}}>
                <span style={{marginLeft:6}}>{sub.icon}</span>{sub.label}
              </td>
              {roles.map(r=>{
                /* V18.61: Admin column is locked — always shows the hardcoded value */
                if(r==="admin"){
                  return<td key={r} style={{...TD,textAlign:"center",padding:"4px 6px",background:T.ok+"05"}}>
                    <AdminLockedCell/>
                  </td>;
                }
                const cur=getHrCur(r,sub.key);
                return<td key={r} style={{...TD,textAlign:"center",padding:"4px 6px"}}>
                  <select value={cur} onChange={e=>setHrSubPerm(r,sub.key,e.target.value)} style={{padding:"4px 8px",borderRadius:6,border:"1px solid "+T.brd,fontSize:FS-2,fontFamily:"inherit",background:T.inputBg||T.cardSolid,color:levelColors[cur],fontWeight:700,cursor:"pointer"}}>
                    {levels.map(l=><option key={l} value={l}>{levelLabels[l]}</option>)}
                  </select>
                </td>;
              })}
            </tr>)}
          </React.Fragment>;
        }
        /* Non-HR tab — regular rendering, reads from draft */
        return<tr key={t.key}>
          <td style={{...TD,fontWeight:600}}><span style={{marginLeft:6}}>{t.icon}</span>{t.label}</td>
          {roles.map(r=>{
            /* V18.61: Admin column is locked — always shows the hardcoded value */
            if(r==="admin"){
              return<td key={r} style={{...TD,textAlign:"center",padding:"4px 6px",background:T.ok+"05"}}>
                <AdminLockedCell/>
              </td>;
            }
            const cur=(draftPerms[r]||{})[t.key]||(defPerms[r]||{})[t.key]||"view";
            return<td key={r} style={{...TD,textAlign:"center",padding:"4px 6px"}}>
              <select value={cur} onChange={e=>setPerm(r,t.key,e.target.value)} style={{padding:"4px 8px",borderRadius:6,border:"1px solid "+T.brd,fontSize:FS-2,fontFamily:"inherit",background:T.inputBg||T.cardSolid,color:levelColors[cur],fontWeight:700,cursor:"pointer"}}>
                {levels.map(l=><option key={l} value={l}>{levelLabels[l]}</option>)}
              </select>
            </td>;
          })}
        </tr>;
      })}</tbody>
    </table>
    {/* V15.66: Save/Cancel buttons — only visible when there are unsaved changes */}
    <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:14,paddingTop:14,borderTop:"1px solid "+T.brd}}>
      {permsDirty&&<span style={{padding:"6px 12px",borderRadius:8,background:T.warn+"12",color:T.warn,fontSize:FS-2,fontWeight:700,display:"flex",alignItems:"center",gap:6}}>
        <span style={{width:8,height:8,borderRadius:"50%",background:T.warn,display:"inline-block"}}></span>
        فيه تعديلات مش متحفظة
      </span>}
      <Btn ghost onClick={resetPerms} disabled={!permsDirty}>↩️ تراجع</Btn>
      <Btn primary onClick={savePerms} disabled={!permsDirty} style={{fontWeight:800}}>💾 حفظ الصلاحيات</Btn>
    </div>
  </div>;
}

export function SettingsPg({config,upConfig,upSales,upTasks,isMob,user,userRole,theme,setTheme,season,orders,syncWsIds,replaceOrder,updOrder,configDoc,salesDoc,tasksDoc}){
  /* V16.6: newSeason state removed — now inside SeasonsCard */
  const[newUserEmail,setNewUserEmail]=useState("");const[newUserRole,setNewUserRole]=useState("viewer");
  const[newUserName,setNewUserName]=useState("");const[newUserPass,setNewUserPass]=useState("");const[newUserPass2,setNewUserPass2]=useState("");
  const[createErr,setCreateErr]=useState("");const[createOk,setCreateOk]=useState("");const[creating,setCreating]=useState(false);
  const[clearConfirm,setClearConfirm]=useState(false);
  const[atSelUser,setAtSelUser]=useState("");const[atEditIdx,setAtEditIdx]=useState(null);const[nfEditUser,setNfEditUser]=useState("");
  const[linkMap,setLinkMap]=useState({});
  const[compressing,setCompressing]=useState(false);
  /* V16.52: Active tab — restored from localStorage so the user lands on the
     same section after navigating away. */
  const[activeTab,setActiveTab]=useState(()=>{
    try{return localStorage.getItem("clark_settings_tab")||"general"}catch(_){return"general"}
  });
  useEffect(()=>{try{localStorage.setItem("clark_settings_tab",activeTab)}catch(_){}}, [activeTab]);

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
  /* V16.59: Odoo connection-test state — hoisted out of an IIFE inside the
     business tab's JSX. The IIFE called useState/useEffect; when V16.52 made
     the business tab content conditional (`activeTab==="business" && <>...</>`),
     those hooks went from "always called" to "called only when tab active",
     causing React error #310 (hook count differs between renders). Same root
     cause as V16.56's PermissionsCard fix — the simplest correct fix is to
     move the hooks to module-stable top-level scope. */
  const[testResult,setTestResult]=useState(null);
  const[testing,setTesting]=useState(false);
  /* V16.59: Odoo shortcut-link form state — also hoisted out of an IIFE in JSX,
     for the same reason as testResult/testing above. Lives at the top level so
     the hook count is identical between renders, regardless of which tab is
     active. */
  const[oIcon,setOIcon]=useState("🔗");
  const[oLabel,setOLabel]=useState("");
  const[oUrl,setOUrl]=useState("");
  const[oColor,setOColor]=useState("#8B5CF6");
  const[oEditId,setOEditId]=useState(null);
  /* Keep localMap in sync when config loads/changes (e.g. on page reload) */
  useEffect(()=>{const m=config.odooSettings?.accountMapping;if(m&&Object.keys(m).length>0){setLocalMap(prev=>{const merged={...prev};Object.entries(m).forEach(([k,v])=>{if(!merged[k])merged[k]=v});return merged})}},[config.odooSettings?.accountMapping]);
  /* Admin password gate */
  const[pendingAction,setPendingAction]=useState(null);const[adminPass,setAdminPass]=useState("");const[passErr,setPassErr]=useState("");const[passLoading,setPassLoading]=useState(false);
  const requirePass=(action)=>{setPendingAction(()=>action);setAdminPass("");setPassErr("")};
  const confirmPass=async()=>{if(!adminPass){setPassErr("ادخل كلمة المرور");return}setPassLoading(true);setPassErr("");
    try{await signInWithEmailAndPassword(auth,user.email,adminPass);if(pendingAction)pendingAction();setPendingAction(null);setAdminPass("")}
    catch(e){setPassErr("كلمة المرور غير صحيحة")}finally{setPassLoading(false)}};
  /* V16.6: Logo + addSeason/deleteSeason now inside LogoCard/SeasonsCard components */
  /* V18.62: clearAllOrders is now safer:
     1. Takes auto-pre-restore comprehensive backup BEFORE deleting
     2. Logs the operation to restoreLog
     3. Surfaces errors instead of silently swallowing them
     4. Shows progress to the user */
  const clearAllOrders=()=>{requirePass(async()=>{
    try{
      showToast("⏳ بعمل نسخة احتياطية شاملة قبل المسح...");
      const preBackup=await createComprehensiveBackup({
        label:"تلقائي قبل مسح كل أوردرات الموسم "+season,
        user:{email:user?.email,uid:user?.uid},
        autoGenerated:false,
        onProgress:()=>{},
      });
      try{
        await setDoc(doc(db,"restoreLog",preBackup.backupId),{
          ts:new Date().toISOString(),
          by:user?.email||user?.uid||"unknown",
          action:"clear_all_orders",
          season:season,
          preRestoreBackupId:preBackup.backupId,
        });
      }catch(logErr){console.warn("[V18.62] restoreLog failed:",logErr)}
      showToast("⏳ جاري مسح أوردرات الموسم "+season+"...");
      const snap=await getDocs(collection(db,"seasons",season,"orders"));
      const total=snap.docs.length;
      let deleted=0;const errors=[];
      for(const d of snap.docs){
        try{await deleteDoc(doc(db,"seasons",season,"orders",d.id));deleted++}
        catch(e){errors.push({id:d.id,err:String(e?.message||e)})}
      }
      if(errors.length>0){
        console.error("[V18.62] clearAllOrders had errors:",errors);
        showToast("⚠️ تم مسح "+deleted+"/"+total+" — "+errors.length+" فشلت. النسخة في "+preBackup.backupId);
      }else{
        showToast("✅ تم مسح "+deleted+" أوردر. نسخة احتياطية: "+preBackup.backupId);
      }
    }catch(e){
      console.error("[V18.62] clearAllOrders failed:",e);
      showToast("⚠️ فشل المسح: "+(e?.message||String(e)).slice(0,100));
    }
    setClearConfirm(false);
  })};

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
    {/* V16.52: Tab navigation — groups settings by purpose for easier discovery.
        Active tab persists in localStorage. The dirty-changes tracking still
        works across tabs, so users won't lose unsaved edits when switching. */}
    {(()=>{
      const TABS=[
        {key:"general",     icon:"🏢",label:"عام"},
        {key:"users",       icon:"🔐",label:"المستخدمين"},
        {key:"printing",    icon:"🖨",label:"الطباعة"},
        {key:"business",    icon:"💰",label:"المالية والمبيعات"},
        {key:"hr",          icon:"👥",label:"الموظفين"},
        {key:"comms",       icon:"📢",label:"التواصل والإشعارات"},
        {key:"maintenance", icon:"🔧",label:"الصيانة والنسخ"}
      ];
      /* Compute dirty count per tab — shows ✨ next to tabs with unsaved edits.
         We don't have per-tab cards mapping, so we just show ✨ on the global level. */
      return<div style={{position:"sticky",top:0,zIndex:20,background:T.cardSolid,borderBottom:"2px solid "+T.brd,marginBottom:14,paddingBottom:0,display:"flex",overflowX:"auto",scrollbarWidth:"thin",WebkitOverflowScrolling:"touch"}}>
        {TABS.map(t=>{const isActive=activeTab===t.key;
          return<div key={t.key} onClick={()=>setActiveTab(t.key)} style={{
            flexShrink:0,padding:isMob?"10px 12px":"12px 18px",
            cursor:"pointer",fontSize:FS-1,fontWeight:isActive?900:600,
            color:isActive?T.accent:T.textSec,
            borderBottom:"3px solid "+(isActive?T.accent:"transparent"),
            marginBottom:-2,
            transition:"all 0.15s",whiteSpace:"nowrap",
            display:"inline-flex",alignItems:"center",gap:6
          }} onMouseEnter={e=>{if(!isActive)e.currentTarget.style.color=T.text}}
             onMouseLeave={e=>{if(!isActive)e.currentTarget.style.color=T.textSec}}>
            <span style={{fontSize:isMob?14:16}}>{t.icon}</span>
            <span>{t.label}</span>
          </div>;
        })}
      </div>;
    })()}
    {activeTab==="general" && <>
    {/* V16.75: Storage notices — رسائل التخزين بدلاً من toasts للمستخدمين */}
    <StorageNoticesPanel/>
    {/* V16.78: Stock mode picker — يحدد سلوك المخزن مع الأوردرات */}
    <StockModeCard configDoc={configDoc} upConfig={upConfig} canEdit={userRole==="admin"||userRole==="accountant"}/>
    {/* V16.75: Quick health overview — الـbars اللي اتشالت من الشاشات (Treasury, HR, Audit) */}
    <Card title="📊 نظرة سريعة على حالة التخزين" style={{marginBottom:14}}>
      <div style={{fontSize:FS-2,color:T.textSec,marginBottom:10,lineHeight:1.6}}>
        ملخص حالة كل collection. الخطر مش في الإجمالي، بل في أكبر document منفرد (حد Firestore = 1MB لكل document).
      </div>
      <CollectionHealthBar collection="treasuryDays" label="حجم بيانات الخزنة"      icon="💰" mode="split"/>
      <CollectionHealthBar collection="hrWeeksDocs"  label="حجم أسابيع المرتبات"   icon="📅" mode="partitioned"/>
      <CollectionHealthBar collection="hrLogDays"    label="حجم سجل HR"             icon="📋" mode="split"/>
      <CollectionHealthBar collection="auditDays"    label="حجم سجل الأحداث"        icon="📝" mode="split"/>
    </Card>
    {/* V16.75: Partitioned docs monitor — يعرض حجم كل document في hrWeeksDocs */}
    <PartitionedDocsMonitor/>
    {/* V16.74: Split days monitor — يعرض حجم كل document يومي للخزنة وسجل HR والأحداث */}
    <SplitDaysMonitor/>
    {/* V16.0: Size Budget Dashboard — tracks feature sizes against limits */}
    <SizeBudgetDashboard configDoc={configDoc} salesDoc={salesDoc} tasksDoc={tasksDoc}/>
    {/* V15.92: Device info card — shows deviceId, IP, location, and lets user name their device */}
    <DeviceInfoCard/>
    </>}
    {activeTab==="printing" && <>
    {/* V16.4: Print templates editor — customize all print templates with HTML/CSS */}
    <PrintTemplatesEditor config={config} upConfig={upConfig} canEdit={userRole==="admin"||userRole==="accountant"}/>
    </>}
    {activeTab==="general" && <>
    <SeasonsCard config={config} upConfig={upConfig} T={T} FS={FS} showToast={showToast} Inp={Inp} Btn={Btn} Card={Card} requirePass={requirePass} setDirty={(d)=>setDirtyCards(p=>({...p,seasons:d}))}/>
    <PoSettingsCard config={config} upConfig={upConfig} T={T} FS={FS} isMob={isMob} showToast={showToast} Inp={Inp} Btn={Btn} Card={Card} poMigState={poMigState} setPoMigState={setPoMigState} poMigResult={poMigResult} setPoMigResult={setPoMigResult} requirePass={requirePass} runPoMigration={runPoMigration} setDirty={(d)=>setDirtyCards(p=>({...p,poSettings:d}))}/>

    <Card title="مسح بيانات الأوردرات" style={{marginBottom:12}}>
      <div style={{fontSize:FS,color:T.textSec,marginBottom:10}}>{"الموسم الحالي: "+season+" - عدد الأوردرات: "+(orders||[]).length}</div>
      {!clearConfirm?<Btn danger onClick={()=>setClearConfirm(true)}>مسح جميع الأوردرات للموسم الحالي</Btn>:
      <div style={{padding:16,background:T.err+"08",borderRadius:12,border:"1px solid "+T.err+"30"}}>
        <div style={{fontSize:FS,fontWeight:700,color:T.err,marginBottom:10}}>{"⚠️ سيتم حذف "+(orders||[]).length+" أوردر نهائياً مع جميع التسليمات - هل أنت متأكد؟"}</div>
        <div style={{display:"flex",gap:8}}><Btn danger onClick={clearAllOrders}>تأكيد المسح</Btn><Btn ghost onClick={()=>setClearConfirm(false)}>الغاء</Btn></div>
      </div>}
    </Card>
    {/* V16.5: Logo card with draft + save pattern */}
    <LogoCard config={config} upConfig={upConfig} T={T} FS={FS} showToast={showToast} Btn={Btn} Card={Card} requirePass={requirePass} compressImage={compressImage} setDirty={(d)=>setDirtyCards(p=>({...p,logo:d}))}/>
    </>}
    {activeTab==="users" && <>
    <Card title="ادارة المستخدمين" style={{marginBottom:16}}>
      <CardSubtitle icon="💡">إنشاء وإدارة حسابات المستخدمين اللي يقدروا يدخلوا للبرنامج. كل مستخدم له بريد إلكتروني وكلمة مرور وصلاحيات محددة.</CardSubtitle>
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
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap",fontWeight:600}}>الصلاحية</label><Sel value={newUserRole} onChange={setNewUserRole}><option value="admin">مدير النظام</option><option value="manager">مدير انتاج</option><option value="sales_accountant">محاسب مبيعات</option><option value="purchase_accountant">محاسب مشتريات</option><option value="payroll_accountant">محاسب مرتبات</option><option value="payroll_verifier">مُؤكِّد استلام مرتبات</option><option value="viewer">مشاهد فقط</option></Sel></div>
        </div>
        {createErr&&<div style={{color:T.err,fontSize:FS,marginBottom:10,fontWeight:600}}>{"⚠️ "+createErr}</div>}
        {createOk&&<div style={{color:T.ok,fontSize:FS,marginBottom:10,fontWeight:600}}>{"✓ "+createOk}</div>}
        <Btn primary onClick={createUser} disabled={creating}>{creating?<span style={{display:"inline-flex",alignItems:"center",gap:8}}><Spinner size="small" color="#fff" inline/>جاري الانشاء...</span>:"انشاء الحساب"}</Btn>
      </div>
      {/* Existing users */}
      <div style={{fontSize:FS,fontWeight:700,color:T.text,marginBottom:10}}>المستخدمين الحاليين</div>
      {(config.usersList||[]).length>0&&<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:500}}><thead><tr>{["الاسم","البريد","الصلاحية",""].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
        {(config.usersList||[]).map((u,i)=><tr key={i}><td style={{...TD,fontWeight:600}}>{u.name||"-"}</td><td style={TD}>{u.email}</td><td style={TD}><Sel value={u.role} onChange={v=>requirePass(()=>upConfig(d=>{const x=(d.usersList||[]).find(z=>z.email===u.email);if(x)x.role=v}))}><option value="admin">مدير النظام</option><option value="manager">مدير انتاج</option><option value="sales_accountant">محاسب مبيعات</option><option value="purchase_accountant">محاسب مشتريات</option><option value="payroll_accountant">محاسب مرتبات</option><option value="payroll_verifier">مُؤكِّد استلام مرتبات</option><option value="viewer">مشاهد فقط</option></Sel></td><td style={TD}>{(()=>{const hasTasks=(Array.isArray(config.tasks)?config.tasks:[]).some(t=>t.toEmail===u.email&&!t.done);return<DelBtn onConfirm={()=>requirePass(()=>upConfig(d=>{d.usersList=(d.usersList||[]).filter(x=>x.email!==u.email)}))} blocked={hasTasks?"لديه مهام مفتوحة":null}/>})()}</td></tr>)}
      </tbody></table></div>}
      {(config.usersList||[]).length===0&&<div style={{textAlign:"center",padding:20,color:T.textSec}}>لم يتم اضافة مستخدمين</div>}
      <div style={{marginTop:16,display:"grid",gridTemplateColumns:isMob?"1fr":"repeat(3,1fr)",gap:12}}>
        {[["مدير النظام",T.accent,"كل الصلاحيات + اعدادات"],["مدير انتاج",T.ok,"اضافة وتعديل"],["محاسب مبيعات","#8B5CF6","تسليم عملاء + تقارير"],["محاسب مشتريات","#F59E0B","تشغيل + حسابات ورش"],["مشاهد",T.warn,"عرض فقط"]].map(([n,c,d])=><div key={n} style={{padding:14,borderRadius:12,background:c+"08",border:"1px solid "+c+"25"}}><div style={{fontSize:FS,fontWeight:700,color:c,marginBottom:4}}>{n}</div><div style={{fontSize:FS-2,color:T.textSec}}>{d}</div></div>)}
      </div>
    </Card>
    {/* Send Notifications */}
    {/* Permissions Management */}
    <Card title="🔐 صلاحيات المستخدمين" style={{marginBottom:16}}>
      <CardSubtitle icon="💡">تحديد ما يقدر كل مستخدم يعمله في البرنامج. مثلاً: محاسب يقدر يشوف الخزنة لكن مش يقدر يحذف، مدير عنده صلاحية كاملة.</CardSubtitle>
      <PermissionsCard config={config} upConfig={upConfig} T={T} FS={FS} TABS={TABS} Btn={Btn} showToast={showToast}/>
    </Card>
    </>}
    {activeTab==="printing" && <>
    {/* Print Settings — draft pattern */}
    <PrintSettingsCard config={config} upConfig={upConfig} T={T} FS={FS} isMob={isMob} showToast={showToast} Inp={Inp} Btn={Btn} Sel={Sel} Card={Card} setDirty={(d)=>setDirtyCards(p=>({...p,printSettings:d}))}/>
    {/* V16.50: Separate settings for the 10×15 large labels (workshop + customer) */}
    <LargeLabelSettingsCard kind="workshopLabel" config={config} upConfig={upConfig} T={T} FS={FS} isMob={isMob} showToast={showToast} Btn={Btn} Sel={Sel} Card={Card} setDirty={(d)=>setDirtyCards(p=>({...p,workshopLabel:d}))}/>
    <LargeLabelSettingsCard kind="customerLabel" config={config} upConfig={upConfig} T={T} FS={FS} isMob={isMob} showToast={showToast} Btn={Btn} Sel={Sel} Card={Card} setDirty={(d)=>setDirtyCards(p=>({...p,customerLabel:d}))}/>
    {/* V16.57: Sales delivery label — printed from sales screen distribution popup per customer */}
    <LargeLabelSettingsCard kind="salesDeliveryLabel" config={config} upConfig={upConfig} T={T} FS={FS} isMob={isMob} showToast={showToast} Btn={Btn} Sel={Sel} Card={Card} setDirty={(d)=>setDirtyCards(p=>({...p,salesDeliveryLabel:d}))}/>
    </>}
    {activeTab==="business" && <>
    {/* Treasury Settings — draft pattern */}
    <TreasurySettingsCard config={config} upConfig={upConfig} T={T} FS={FS} isMob={isMob} showToast={showToast} Inp={Inp} Btn={Btn} Sel={Sel} Card={Card} setDirty={(d)=>setDirtyCards(p=>({...p,treasurySettings:d}))} userRole={userRole}/>

    {/* V18.46: Odoo Sync Settings (gated by master toggle) */}
    <Card title="🔗 ربط Odoo — تزامن الخزنة" style={{marginBottom:16}}>
      <CardSubtitle icon="💡">ربط مع نظام Odoo الخارجي للمحاسبة. لو متفعّل، الحركات في الخزنة تتزامن أوتوماتيكياً مع Odoo. مفيد لو الشركة عندها نظام محاسبي خارجي.</CardSubtitle>
      {/* V18.46: master toggle — controls visibility of Odoo features across the app */}
      {(()=>{const odooEnabled = config.odooEnabled !== false;
        const toggleOdoo = () => upConfig(d => { d.odooEnabled = !odooEnabled; });
        return <div onClick={toggleOdoo} style={{display:"flex", alignItems:"center", gap:12, padding:"12px 14px", borderRadius:10, background: odooEnabled ? T.ok+"08" : T.bg, border:"1px solid "+(odooEnabled?T.ok+"40":T.brd), cursor:"pointer", marginBottom: odooEnabled ? 16 : 0}}>
          <span style={{fontSize:24, color: odooEnabled?T.ok:T.textMut, fontWeight:800}}>{odooEnabled?"☑":"☐"}</span>
          <div style={{flex:1}}>
            <div style={{fontSize:FS, fontWeight:800, color:T.text}}>تفعيل أدوات Odoo</div>
            <div style={{fontSize:FS-2, color:T.textSec, marginTop:2, lineHeight:1.5}}>
              لما تكون مُفعَّلة: تظهر إعدادات Odoo + روابط Odoo في الـtopbar + زر "تزامن Odoo" في صفحة الخزنة.
              لما تكون معطّلة: كل أدوات Odoo تختفي من الواجهة (الإعدادات المحفوظة لا تتأثر — تفعّل تاني تلاقيها زي ما هي).
            </div>
          </div>
          <span style={{fontSize:FS, fontWeight:800, color:odooEnabled?T.ok:T.textMut, padding:"4px 12px", background:(odooEnabled?T.ok:T.textMut)+"15", borderRadius:6}}>{odooEnabled?"مُفعّل":"معطّل"}</span>
        </div>;
      })()}
      {(config.odooEnabled !== false) && (()=>{const os=config.odooSettings||{};
        const saveOS=(fn)=>upConfig(d=>{if(!d.odooSettings)d.odooSettings={};fn(d.odooSettings)});
        /* V16.59: testResult/testing useState hoisted to top-level — see comment there */
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
    </>}

    {activeTab==="comms" && <>
    {/* WhatsApp Report Contacts Settings — with draft pattern + save button */}
    <WaContactsCard config={config} upConfig={upConfig} T={T} FS={FS} isMob={isMob} showToast={showToast} Inp={Inp} Btn={Btn} Card={Card} setDirty={(d)=>setDirtyCards(p=>({...p,waContacts:d}))}/>
    </>}

    {activeTab==="hr" && <>
    {/* HR Settings — draft pattern */}
    <HrSettingsCard config={config} upConfig={upConfig} T={T} FS={FS} isMob={isMob} showToast={showToast} Inp={Inp} Btn={Btn} Sel={Sel} Card={Card} setDirty={(d)=>setDirtyCards(p=>({...p,hrSettings:d}))}/>

    {/* Security Flags Settings */}
    <SecurityAlertsCard config={config} upConfig={upConfig} T={T} FS={FS} showToast={showToast} Inp={Inp} Btn={Btn} Card={Card} setDirty={(d)=>setDirtyCards(p=>({...p,securityAlerts:d}))}/>
    </>}

    {/* Sales Settings */}
    {activeTab==="business" && <>
    {/* Sales Settings — draft pattern */}
    <SalesSettingsCard config={config} upConfig={upConfig} T={T} FS={FS} isMob={isMob} showToast={showToast} Inp={Inp} Btn={Btn} Sel={Sel} Card={Card} setDirty={(d)=>setDirtyCards(p=>({...p,salesSettings:d}))}/>
    {/* V18.33: WhatsApp summary controls */}
    <WhatsappSummaryCard config={config} upConfig={upConfig} T={T} FS={FS} isMob={isMob} showToast={showToast} Btn={Btn} Card={Card} setDirty={(d)=>setDirtyCards(p=>({...p,whatsappSummary:d}))}/>

    {/* V18.50: Invoice settings — controls invoice-driven accounting flow */}
    <Card title="📄 إعدادات الفواتير" style={{marginBottom:16}}>
      <CardSubtitle icon="💡">تتحكم في طريقة عمل نظام الفواتير. الوضع الافتراضي (قديم) ينشئ القيود المحاسبية مباشرة من التسليم. الوضع الجديد (موصى به) يجعل الفاتورة هي مصدر القيد المحاسبي.</CardSubtitle>
      {(()=>{
        const inv = config.invoiceSettings || {};
        const autoPostFromInvoice = inv.autoPostFromInvoice === true;
        const autoPostOnCreate    = inv.autoPostOnCreate === true;
        const setFlag = (key, val) => upConfig(d => {
          if(!d.invoiceSettings) d.invoiceSettings = {};
          d.invoiceSettings[key] = val;
        });
        return <div>
          <div onClick={() => setFlag("autoPostFromInvoice", !autoPostFromInvoice)} style={{
            display:"flex", alignItems:"flex-start", gap:12,
            padding:"14px 16px", borderRadius:10, cursor:"pointer",
            background: autoPostFromInvoice ? T.ok+"08" : T.bg,
            border: "2px solid " + (autoPostFromInvoice ? T.ok+"40" : T.brd),
            marginBottom: 10,
          }}>
            <span style={{fontSize:24, color: autoPostFromInvoice?T.ok:T.textMut, fontWeight:800}}>{autoPostFromInvoice?"☑":"☐"}</span>
            <div style={{flex:1}}>
              <div style={{fontSize:FS+1, fontWeight:800, color:T.text, marginBottom:4}}>الترحيل المحاسبي من الفاتورة (Phase 2)</div>
              <div style={{fontSize:FS-2, color:T.textSec, lineHeight:1.6}}>
                <b>عند التفعيل:</b> كل تسليم/استلام/مرتجع بينشئ فاتورة <b>مسودة</b> أو إشعار دائن مسودة تلقائياً. القيد المحاسبي ما يتعملش لحد ما تـ"ترحّل" الفاتورة من تبويب الفواتير. ده الوضع الاحترافي.
                <br/>
                <b>عند التعطيل (الافتراضي):</b> القيد المحاسبي بيتم فوراً مع التسليم زي اللي اتعرفت عليه في V18.35-V18.49. الفواتير بتفضل اختيارية يدوياً.
                <br/>
                <span style={{color:T.warn, fontWeight:700}}>⚠️ تحذير: لو فعّلت ده وعندك بيانات قديمة، التسليمات اللي اتعملت قبل التفعيل اتعملت قيود مباشرة. التسليمات الجديدة بس هتمشي عبر الفاتورة.</span>
              </div>
            </div>
            <span style={{fontSize:FS, fontWeight:800, color:autoPostFromInvoice?T.ok:T.textMut, padding:"6px 14px", background:(autoPostFromInvoice?T.ok:T.textMut)+"15", borderRadius:6}}>{autoPostFromInvoice?"مُفعّل":"معطّل"}</span>
          </div>

          {/* V18.51: Auto-post on create — skip the draft step */}
          {autoPostFromInvoice && <div onClick={() => setFlag("autoPostOnCreate", !autoPostOnCreate)} style={{
            display:"flex", alignItems:"flex-start", gap:12,
            padding:"14px 16px", borderRadius:10, cursor:"pointer",
            background: autoPostOnCreate ? T.accent+"08" : T.bg,
            border: "2px solid " + (autoPostOnCreate ? T.accent+"40" : T.brd),
          }}>
            <span style={{fontSize:24, color: autoPostOnCreate?T.accent:T.textMut, fontWeight:800}}>{autoPostOnCreate?"☑":"☐"}</span>
            <div style={{flex:1}}>
              <div style={{fontSize:FS+1, fontWeight:800, color:T.text, marginBottom:4}}>ترحيل تلقائي عند إنشاء الفاتورة (skip draft)</div>
              <div style={{fontSize:FS-2, color:T.textSec, lineHeight:1.6}}>
                <b>عند التفعيل:</b> الفاتورة بتترحّل تلقائياً مع إنشائها — ينشئ القيد المحاسبي فوراً. مفيدة لو ما عندكش مرحلة مراجعة محاسبية.
                <br/>
                <b>عند التعطيل (الافتراضي):</b> الفاتورة تتعمل كـ"مسودة" وتفضل تنتظر مراجعة قبل الترحيل. ده الأكثر احترافية.
                <br/>
                <span style={{color:T.textMut, fontSize:FS-3, fontStyle:"italic"}}>💡 الإعداد ده متاح فقط لما "الترحيل من الفاتورة" مفعّل فوق.</span>
              </div>
            </div>
            <span style={{fontSize:FS, fontWeight:800, color:autoPostOnCreate?T.accent:T.textMut, padding:"6px 14px", background:(autoPostOnCreate?T.accent:T.textMut)+"15", borderRadius:6}}>{autoPostOnCreate?"مُفعّل":"معطّل"}</span>
          </div>}
        </div>;
      })()}
    </Card>
    </>}

    {activeTab==="maintenance" && <>
    {/* Data Maintenance */}
    <Card title="🔧 صيانة البيانات" style={{marginBottom:16}}>
      <CardSubtitle icon="💡">أدوات لاكتشاف وإصلاح المشاكل في البيانات (تكرار، مراجع مكسورة، عدم تطابق الأرصدة). استخدمها لو لاحظت أرقام غريبة في التقارير.</CardSubtitle>
      {(()=>{
        const wsList=config.workshops||[];const wsNames=new Set(wsList.map(w=>w.name));
        const gtList=config.garmentTypes||[];const gtNames=new Set(gtList.map(g=>g.name));
        const stList=(config.statusCards||[]);const stNames=new Set(stList.map(s=>s.name));
        /* V16.42: Normalize names before comparison to avoid phantom orphans
           caused by stray whitespace, NBSP, or invisible Unicode chars. The
           helper is applied to BOTH sides (config names + names found in data),
           so equivalence is judged by the visible text only. */
        const _norm=(s)=>String(s||"").replace(/\u00A0/g," ").replace(/\s+/g," ").trim();
        const wsNamesNorm=new Set(wsList.map(w=>_norm(w.name)));
        const gtNamesNorm=new Set(gtList.map(g=>_norm(g.name)));
        const stNamesNorm=new Set(stList.map(s=>_norm(s.name)));
        /* Orphaned workshops */
        const orphanWs=new Map();
        orders.forEach(o=>{(o.workshopDeliveries||[]).forEach(wd=>{if(!wd.wsId&&!wsNamesNorm.has(_norm(wd.wsName))&&wd.wsName)orphanWs.set(wd.wsName,(orphanWs.get(wd.wsName)||0)+1)})});
        (config.wsPayments||[]).forEach(p=>{if(!p.wsId&&!wsNamesNorm.has(_norm(p.wsName))&&p.wsName)orphanWs.set(p.wsName,(orphanWs.get(p.wsName)||0)+1)});
        /* Orphaned garment types */
        const orphanGt=new Map();
        orders.forEach(o=>{(o.orderPieces||[]).forEach(p=>{if(!gtNamesNorm.has(_norm(p))&&p)orphanGt.set(p,(orphanGt.get(p)||0)+1)});(o.workshopDeliveries||[]).forEach(wd=>{if(wd.garmentType&&!gtNamesNorm.has(_norm(wd.garmentType)))orphanGt.set(wd.garmentType,(orphanGt.get(wd.garmentType)||0)+1)})});
        /* Orphaned statuses */
        const orphanSt=new Map();
        orders.forEach(o=>{if(o.status&&!stNamesNorm.has(_norm(o.status)))orphanSt.set(o.status,(orphanSt.get(o.status)||0)+1)});
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

        /* V16.42: auto-fix orphans whose normalized form already matches a real
           name (whitespace, NBSP). The data has e.g. "تشطيب وتعبئة " (trailing space)
           but the saved garmentType is "تشطيب وتعبئة" — we just canonicalize the
           data to the saved value so the orphan disappears entirely. */
        const autoFixable=[];
        const findCanonical=(name,namesNorm,list)=>{
          const norm=_norm(name);
          if(name===norm)return null;/* already canonical */
          if(!namesNorm.has(norm))return null;/* not a whitespace-only mismatch */
          /* Find the original casing/spelling from the list */
          const found=list.find(x=>_norm((x.name||""))===norm);
          return found?(found.name||""):null;
        };
        [...orphanWs.keys()].forEach(name=>{const c=findCanonical(name,wsNamesNorm,wsList);if(c)autoFixable.push({type:"ws",from:name,to:c})});
        [...orphanGt.keys()].forEach(name=>{const c=findCanonical(name,gtNamesNorm,gtList);if(c)autoFixable.push({type:"gt",from:name,to:c})});
        [...orphanSt.keys()].forEach(name=>{const c=findCanonical(name,stNamesNorm,stList);if(c)autoFixable.push({type:"st",from:name,to:c})});
        const doAutoFix=async()=>{
          if(autoFixable.length===0)return;
          let cnt=0;
          for(const fix of autoFixable){
            for(const o of orders){
              const u=JSON.parse(JSON.stringify(o));let ch=false;
              if(fix.type==="ws"){(u.workshopDeliveries||[]).forEach(wd=>{if(wd.wsName===fix.from){wd.wsName=fix.to;ch=true}})}
              else if(fix.type==="gt"){(u.workshopDeliveries||[]).forEach(wd=>{if(wd.garmentType===fix.from){wd.garmentType=fix.to;ch=true}});u.orderPieces=(u.orderPieces||[]).map(p=>p===fix.from?(ch=true,fix.to):p);FKEYS.forEach(k=>{if(u["fabricPieces"+k])u["fabricPieces"+k]=u["fabricPieces"+k].map(p=>p===fix.from?(ch=true,fix.to):p)})}
              else if(fix.type==="st"){if(u.status===fix.from){u.status=fix.to;ch=true}}
              if(ch){await replaceOrder(o.id,u);cnt++}
            }
            if(fix.type==="ws"){upConfig(d=>{(d.wsPayments||[]).forEach(p=>{if(p.wsName===fix.from)p.wsName=fix.to})})}
          }
          showToast("✓ تم تصحيح "+autoFixable.length+" اسم في "+cnt+" سجل");
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
        /* V15.80: Storage stats — accurate per-document breakdown.
           Firestore's 1MB limit applies to EACH document independently, not the sum.
           Orders live in `seasons/{season}/orders/{docId}` — each is its own doc. */
        const configSize=JSON.stringify(config).length;
        const salesSize=salesDoc?JSON.stringify(salesDoc).length:0;
        const tasksSize=tasksDoc?JSON.stringify(tasksDoc).length:0;
        const ordersSize=JSON.stringify(orders).length;/* sum of ALL order docs (not a single doc) */
        const totalSize=configSize+ordersSize+salesSize+tasksSize;
        const imgSize=orders.reduce((s,o)=>{let sz=(o.image||"").length;(o.attachments||[]).forEach(a=>sz+=(a.data||"").length);return s+sz},0);
        const wsImgSize=(config.workshops||[]).reduce((s,w)=>s+(w.ownerPhoto||"").length+(w.idCard||"").length,0);
        /* V15.80: Find largest single order doc (to catch individual docs approaching 1MB) */
        const orderSizes=orders.map(o=>({modelNo:o.modelNo||"—",size:JSON.stringify(o).length}));
        orderSizes.sort((a,b)=>b.size-a.size);
        const largestOrder=orderSizes[0]||{modelNo:"—",size:0};
        const top5Orders=orderSizes.slice(0,5);
        const avgOrderSize=orders.length>0?Math.round(ordersSize/orders.length):0;
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
              <div style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap"}}>
                <Btn primary onClick={doLink} disabled={!Object.values(linkMap).some(v=>v)}>✓ ربط وتحديث</Btn>
                {/* V16.42: One-click fix for whitespace/invisible-char orphans */}
                {autoFixable.length>0&&<Btn onClick={doAutoFix} style={{background:"#0EA5E912",color:"#0EA5E9",border:"1px solid #0EA5E930",fontWeight:700}} title="تصحيح الأسماء التي تختلف عن الاسم الصحيح بمسافة فقط">✨ تصحيح تلقائي ({autoFixable.length})</Btn>}
              </div>
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

          {/* 7. Storage stats — V15.80 accurate per-document breakdown */}
          {(()=>{
            const MB=1024*1024;
            const pctOfMB=(bytes)=>Math.min(100,(bytes/MB)*100);
            const colorFor=(bytes)=>bytes>900000?T.err:bytes>700000?T.warn:T.ok;
            const Bar=({bytes,label,info})=>{
              const pct=pctOfMB(bytes);const c=colorFor(bytes);
              return<div style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",fontSize:FS-2,marginBottom:3}}>
                  <span style={{color:T.text,fontWeight:600}}>{label}</span>
                  <span style={{color:c,fontWeight:700,fontFamily:"monospace"}}>{(bytes/1024).toFixed(0)+" KB / 1024 KB ("+pct.toFixed(0)+"%)"}</span>
                </div>
                <div style={{height:8,borderRadius:4,background:"#E2E8F0",overflow:"hidden"}}>
                  <div style={{height:"100%",width:pct+"%",borderRadius:4,background:c,transition:"width 0.3s"}}/>
                </div>
                {info&&<div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>{info}</div>}
              </div>
            };
            return<div style={{padding:14,borderRadius:12,background:T.bg,border:"1px solid "+T.brd}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div style={{fontSize:FS,fontWeight:700,color:T.text}}>📊 احصائيات التخزين (لكل مستند)</div>
                <div style={{fontSize:FS-3,color:T.textMut,fontWeight:500}}>الحد: 1 MB لكل مستند منفصل</div>
              </div>
              {/* Per-doc bars */}
              <Bar bytes={configSize} label="📄 مستند الإعدادات (factory/config)" info={"عملاء + موردين + ورش + موظفين + إعدادات — صور الورش: "+(wsImgSize/1024).toFixed(0)+" KB"}/>
              {salesSize>0&&<Bar bytes={salesSize} label="💰 مستند المبيعات (factory/sales)" info="جلسات تسليم العملاء + الباكدجات"/>}
              {tasksSize>0&&<Bar bytes={tasksSize} label="📌 مستند المهام (factory/tasks)" info="المهام + الملاحظات + جرد المخزن"/>}
              {/* Orders summary */}
              <div style={{padding:10,borderRadius:8,background:T.cardSolid,border:"1px solid "+T.brd,marginTop:12}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:6}}>
                  <span style={{fontSize:FS-1,fontWeight:700,color:T.text}}>📦 مستندات الأوردرات</span>
                  <span style={{fontSize:FS-2,color:T.textMut,fontWeight:500}}>{orders.length+" أوردر — كل واحد مستند منفصل"}</span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,fontSize:FS-2}}>
                  <div><span style={{color:T.textMut}}>إجمالي: </span><b>{(ordersSize/1024).toFixed(0)+" KB"}</b></div>
                  <div><span style={{color:T.textMut}}>متوسط/أوردر: </span><b>{(avgOrderSize/1024).toFixed(1)+" KB"}</b></div>
                  <div><span style={{color:T.textMut}}>صور داخل الأوردرات: </span><b>{(imgSize/1024).toFixed(0)+" KB"}</b></div>
                </div>
                {largestOrder.size>500000&&<div style={{marginTop:8,padding:8,borderRadius:6,background:T.warn+"10",border:"1px solid "+T.warn+"30",fontSize:FS-2,color:T.warn,fontWeight:600}}>
                  ⚠️ أكبر أوردر: {largestOrder.modelNo} — {(largestOrder.size/1024).toFixed(0)+" KB"} (اقترب من حد الـ 1MB)
                </div>}
                {top5Orders.length>0&&top5Orders[0].size>100000&&<details style={{marginTop:8,fontSize:FS-2}}>
                  <summary style={{cursor:"pointer",color:T.textSec,fontWeight:600}}>🔍 أكبر 5 أوردرات حجمًا</summary>
                  <div style={{marginTop:6,display:"flex",flexDirection:"column",gap:3}}>
                    {top5Orders.map((o,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",padding:"3px 8px",borderRadius:4,background:T.bg}}>
                      <span style={{fontWeight:600,color:T.text}}>{(i+1)+". "+o.modelNo}</span>
                      <span style={{fontFamily:"monospace",color:o.size>500000?T.err:o.size>200000?T.warn:T.textSec,fontWeight:700}}>{(o.size/1024).toFixed(0)+" KB"}</span>
                    </div>)}
                  </div>
                </details>}
              </div>
              {/* Info strip */}
              <div style={{marginTop:12,padding:10,borderRadius:8,background:T.accent+"08",border:"1px solid "+T.accent+"20",fontSize:FS-2,color:T.textSec,lineHeight:1.7}}>
                💡 <b>حد الـ 1MB بيطبّق على كل مستند لوحده، مش على المجموع.</b> كل أوردر في مستند منفصل، فلو عندك 200 أوردر بمتوسط 5KB، ده مش قريب من أي حد. <b>اللي يهم فعلاً:</b> مستند config (فيه الورش + موظفين) — لو اقترب من 900 KB لازم نضغط الصور.
              </div>
            </div>;
          })()}
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
    </>}
    {/* ── Auto Bot Tasks Settings (multi-user) ── */}
    {activeTab==="comms" && <>
    {/* ── Notification Control ── */}
    <Card title="🔔 التحكم في الاشعارات" style={{marginTop:16}}>
      <CardSubtitle icon="💡">تخصيص أنواع الإشعارات اللي تظهر للمستخدمين (تنبيهات الأوردرات، الجرد، التقارير). فعّل اللي تحتاجه فقط لتجنب الإزعاج.</CardSubtitle>
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
      <CardSubtitle icon="💡">مهام تشتغل أوتوماتيكياً في خلفية البرنامج (تقارير يومية، تنبيهات، نسخ احتياطية). كل مهمة يمكن تفعيلها/إيقافها بشكل مستقل.</CardSubtitle>
      {(()=>{const at=config.autoTasks||{enabled:false,users:[]};const atUsers=at.users||[];const allUsers=config.usersList||[];
        const RULES=[{key:"noDeliver",label:"موديل مقصوص ولم يُسلَّم لورشة",icon:"✂️",dd:5},{key:"availPiece",label:"قطعة متاحة ولم تُسلَّم",icon:"👔",dd:5},{key:"slowWorkshop",label:"ورشة متأخرة في الاستلام",icon:"🐢",dd:14},{key:"stockNoSale",label:"مخزن جاهز لم يُسلَّم لعملاء",icon:"📦",dd:7}];
        const defaultRules=()=>{const r={};RULES.forEach(ru=>{r[ru.key]={enabled:true,days:ru.dd}});return r};
        const toggleEnabled=()=>{upConfig(d=>{if(!d.autoTasks)d.autoTasks={enabled:false,users:[]};d.autoTasks.enabled=!d.autoTasks.enabled})};
        const addUser=()=>{if(!atSelUser)return;const u=allUsers.find(x=>x.email===atSelUser);if(atUsers.some(x=>x.email===atSelUser)){showToast("⚠️ المستخدم مضاف بالفعل");return}
          upConfig(d=>{if(!d.autoTasks)d.autoTasks={enabled:true,users:[]};if(!d.autoTasks.users)d.autoTasks.users=[];d.autoTasks.users.push({email:atSelUser,name:u?.name||atSelUser.split("@")[0],rules:defaultRules()})});setAtSelUser("");showToast("✓ تم الإضافة")};
        const removeUser=(email)=>{upConfig(d=>{d.autoTasks.users=(d.autoTasks.users||[]).filter(x=>x.email!==email)});if(atEditIdx!==null)setAtEditIdx(null)};
        const updateRule=async (idx,ruleKey,field,val)=>{upConfig(d=>{const u=d.autoTasks.users[idx];if(!u)return;if(!u.rules)u.rules=defaultRules();if(!u.rules[ruleKey])u.rules[ruleKey]={enabled:true,days:5};u.rules[ruleKey][field]=val})};
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
    </>}

    {/* ═══ BACKUP & RESTORE ═══ */}
    {activeTab==="business" && <>
    {/* ═══ ODOO LINKS ═══ */}
    {/* V18.46: gated by master Odoo toggle */}
    {(config.odooEnabled !== false) && <Card title="🔗 Odoo — إدارة الاختصارات" style={{marginTop:16}}>
      <CardSubtitle icon="💡">ربط منتجات/حسابات في البرنامج بمقابلها في Odoo. مطلوب لو فعّلت تزامن الخزنة مع Odoo فوق.</CardSubtitle>
      {(()=>{
        const defaultOdooLinks=[
          {id:"accounting",icon:"📊",label:"المحاسبة",url:"https://clarkdb.odoo.com/odoo/accounting",color:"#8B5CF6"},
          {id:"sales",icon:"🛒",label:"المبيعات",url:"https://clarkdb.odoo.com/odoo/sales",color:"#10B981"},
          {id:"purchase",icon:"🏷️",label:"المشتريات",url:"https://clarkdb.odoo.com/odoo/purchase",color:"#EF4444"},
          {id:"inventory",icon:"📦",label:"المخزن",url:"https://clarkdb.odoo.com/odoo/inventory",color:"#F59E0B"},
          {id:"invoices",icon:"🧾",label:"فواتير بيع",url:"https://clarkdb.odoo.com/odoo/accounting/customer-invoices",color:"#0EA5E9"},
        ];
        const links=config.odooLinks||defaultOdooLinks;
        /* V16.59: oIcon/oLabel/oUrl/oColor/oEditId useState hoisted to top-level */
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
    </Card>}
    </>}

    {activeTab==="maintenance" && <>
    <BackupRestoreCard config={config} salesDoc={salesDoc} tasksDoc={tasksDoc} orders={orders} isMob={isMob} user={user} upConfig={upConfig}/>
    <SelectiveRestoreCard configDoc={configDoc} upConfig={upConfig} user={user} isMob={isMob}/>
    </>}
  </div>
}

/* ═══════════════════════════════════════════════════════════════
   V18.62: BACKUP & RESTORE CARD — Comprehensive backups only
   ═══════════════════════════════════════════════════════════════
   
   Pre-V18.62, this card created "lite" backups that only included
   factory/config + sales + tasks + current-season orders. Since the
   V16.74 split-collections migration, that meant treasury, audit log,
   HR log, HR weeks, and orders from non-current seasons were silently
   missing from every backup.
   
   V18.62 replaces this with comprehensive backups (via
   utils/comprehensiveBackup.js) that capture EVERY collection. The
   backup is stored as multiple part-documents under backups/{id}/parts
   to bypass Firestore's 1MB-per-doc limit.
   ═══════════════════════════════════════════════════════════════ */

export function BackupRestoreCard({config,salesDoc,tasksDoc,orders,isMob,user,upConfig}){
  const[backupList,setBackupList]=useState([]);
  const[loading,setLoading]=useState(false);
  const[confirmRestore,setConfirmRestore]=useState(null);
  const[busy,setBusy]=useState(false);
  const[backupProgress,setBackupProgress]=useState(null);/* {message, status} */
  const[sizeEstimate,setSizeEstimate]=useState(null);
  const[restoreTyped,setRestoreTyped]=useState("");

  const loadBackups=async()=>{
    setLoading(true);
    try{
      const snap=await getDocs(collection(db,"backups"));
      const list=[];
      snap.forEach(d=>{const data=d.data();list.push({id:d.id,...data})});
      list.sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""));
      setBackupList(list);
    }catch(e){console.error("loadBackups:",e);showToast("⚠️ تعذر تحميل النسخ")}
    setLoading(false);
  };

  useEffect(()=>{loadBackups()},[]);
  useEffect(()=>{setRestoreTyped("")},[confirmRestore]);

  /* V18.62: Comprehensive backup — captures EVERY collection.
     The progress callback streams status to the user since this can take
     several seconds for factories with lots of data. */
  const createBackup=async(label)=>{
    setBusy(true);
    setBackupProgress({message:"بدء النسخة الشاملة…",status:"running"});
    try{
      const result=await createComprehensiveBackup({
        label:label||"شاملة يدوية",
        user:{email:user?.email,uid:user?.uid},
        autoGenerated:false,
        onProgress:(msg)=>setBackupProgress({message:msg,status:"running"}),
      });
      const totalCount=Object.keys(result.summary?.counts||{}).length;
      setBackupProgress({
        message:"✅ تم! "+totalCount+" قسم متضمن",
        status:"success",
      });
      showToast("✅ تم حفظ النسخة الاحتياطية الشاملة");
      loadBackups();
      /* Clear progress after 4 seconds */
      setTimeout(()=>setBackupProgress(null),4000);
      return result.backupId;
    }catch(e){
      console.error("[V18.62] createComprehensiveBackup:",e);
      setBackupProgress({
        message:"⚠️ فشل: "+(e?.message||String(e)).slice(0,80),
        status:"error",
      });
      showToast("⚠️ فشل حفظ النسخة الشاملة");
      throw e;
    }finally{
      setBusy(false);
    }
  };

  /* V18.62: Estimate the comprehensive backup size before creating it.
     Useful warning for very large factories. */
  const checkSize=async()=>{
    setBackupProgress({message:"جاري حساب الحجم…",status:"running"});
    try{
      const est=await estimateComprehensiveBackupSize();
      setSizeEstimate(est);
      setBackupProgress(null);
    }catch(e){
      setBackupProgress({message:"⚠️ تعذر الحساب",status:"error"});
      setTimeout(()=>setBackupProgress(null),3000);
    }
  };

  /* V18.62: Delete handles both old (single-doc) and new (multi-part) formats. */
  const deleteBackup=async(b)=>{
    try{
      if(b.isComprehensive){
        await deleteComprehensiveBackup(b.id);
      }else{
        /* Legacy single-doc backup */
        await deleteDoc(doc(db,"backups",b.id));
      }
      showToast("✓ تم الحذف");
      loadBackups();
    }catch(e){
      console.error("deleteBackup:",e);
      showToast("⚠️ فشل الحذف");
    }
  };

  /* V18.62: Restore now handles BOTH formats:
     - Comprehensive (preferred): writes back factory/config + sales + tasks
       AND restores split collections, partitioned collections, and per-season
       orders. This is the only safe restore.
     - Legacy single-doc: same behavior as before (config/sales/tasks only).
       The dialog warns the user that orders/treasury/audit will NOT change.
     
     Auto-pre-restore backup is taken before any write. */
  const restoreBackup=async(b)=>{
    setBusy(true);
    setBackupProgress({message:"⏳ بعمل نسخة احتياطية للحالة الحالية أولاً…",status:"running"});
    let preBackupId=null;
    try{
      /* Step 1: Auto-pre-restore comprehensive backup */
      try{
        const preResult=await createComprehensiveBackup({
          label:"تلقائي قبل استعادة",
          user:{email:user?.email,uid:user?.uid},
          autoGenerated:false,
          onProgress:(msg)=>setBackupProgress({message:"نسخة قبل الاستعادة: "+msg,status:"running"}),
        });
        preBackupId=preResult.backupId;
      }catch(preErr){
        console.error("[V18.62] Pre-restore backup FAILED:",preErr);
        setBackupProgress({message:"⛔ فشل عمل نسخة قبل الاستعادة — توقفت",status:"error"});
        showToast("⛔ توقفت الاستعادة لحماية بياناتك");
        setBusy(false);
        return;
      }

      /* Step 2: Log the restore */
      try{
        await setDoc(doc(db,"restoreLog",preBackupId),{
          ts:new Date().toISOString(),
          by:user?.email||user?.uid||"unknown",
          action:"restore_backup",
          restoredFromId:b.id,
          restoredFromLabel:b.label||"",
          restoredFromCreatedAt:b.createdAt||"",
          restoredFromIsComprehensive:!!b.isComprehensive,
          preRestoreBackupId:preBackupId,
        });
      }catch(logErr){console.warn("[V18.62] restoreLog write failed:",logErr)}

      /* Step 3: The actual restore */
      if(b.isComprehensive){
        /* Comprehensive restore */
        setBackupProgress({message:"جاري قراءة النسخة الشاملة…",status:"running"});
        const data=await readComprehensiveBackup(b.id);
        if(!data){throw new Error("Could not read comprehensive backup")}
        /* Restore factory docs */
        if(data.factoryConfig){
          setBackupProgress({message:"كتابة factory/config…",status:"running"});
          await setDoc(doc(db,"factory","config"),data.factoryConfig);
        }
        if(data.factorySales){
          setBackupProgress({message:"كتابة factory/sales…",status:"running"});
          await setDoc(doc(db,"factory","sales"),data.factorySales);
        }
        if(data.factoryTasks){
          setBackupProgress({message:"كتابة factory/tasks…",status:"running"});
          await setDoc(doc(db,"factory","tasks"),data.factoryTasks);
        }
        /* Restore split collections — write each day doc back */
        for(const[collName,docs] of Object.entries(data.splitCollections||{})){
          if(!Array.isArray(docs)||docs.length===0)continue;
          setBackupProgress({message:"استعادة "+collName+" ("+docs.length+" يوم)…",status:"running"});
          for(const d of docs){
            const{_id,...rest}=d;
            if(!_id)continue;
            try{await setDoc(doc(db,collName,_id),rest)}
            catch(e){console.warn("Failed to restore "+collName+"/"+_id,e)}
          }
        }
        /* Restore partitioned collections */
        for(const[collName,docs] of Object.entries(data.partitionedCollections||{})){
          if(!Array.isArray(docs)||docs.length===0)continue;
          setBackupProgress({message:"استعادة "+collName+" ("+docs.length+" doc)…",status:"running"});
          for(const d of docs){
            const{_id,...rest}=d;
            if(!_id)continue;
            try{await setDoc(doc(db,collName,_id),rest)}
            catch(e){console.warn("Failed to restore "+collName+"/"+_id,e)}
          }
        }
        /* Restore orders for each season */
        for(const[seasonName,docs] of Object.entries(data.ordersBySeason||{})){
          if(!Array.isArray(docs)||docs.length===0)continue;
          setBackupProgress({message:"استعادة أوردرات "+seasonName+" ("+docs.length+")…",status:"running"});
          for(const d of docs){
            const{_id,...rest}=d;
            if(!_id)continue;
            try{await setDoc(doc(db,"seasons",seasonName,"orders",_id),rest)}
            catch(e){console.warn("Failed to restore order "+seasonName+"/"+_id,e)}
          }
        }
      }else{
        /* Legacy: only restore the 3 main docs */
        if(b.config)await setDoc(doc(db,"factory","config"),b.config);
        if(b.sales)await setDoc(doc(db,"factory","sales"),b.sales);
        if(b.tasks)await setDoc(doc(db,"factory","tasks"),b.tasks);
      }
      setBackupProgress({message:"✅ تم — اقفل وافتح التطبيق",status:"success"});
      showToast("✅ تم — اقفل وافتح التطبيق");
      setConfirmRestore(null);
      setTimeout(()=>setBackupProgress(null),5000);
    }catch(e){
      console.error("restoreBackup:",e);
      setBackupProgress({message:"⚠️ فشل: "+(e?.message||String(e)).slice(0,80),status:"error"});
      showToast("⚠️ فشل الاستعادة"+(preBackupId?" — نسختك في "+preBackupId:""));
    }
    setBusy(false);
  };

  return<Card title="💾 النسخ الاحتياطي والاستعادة" style={{marginTop:16}}>
    <CardSubtitle icon="💡">
      نسخ احتياطية شاملة لكل بيانات النظام: الإعدادات، الخزنة، سجل المراجعة، HR، الأوردرات لكل المواسم، إلخ.
      <b style={{color:T.ok,display:"block",marginTop:6}}>V18.62: النسخة الواحدة بقت تحفظ كل حاجة — مفيش بيانات بتضيع من النسخة.</b>
    </CardSubtitle>

    {/* Progress / status banner */}
    {backupProgress&&<div style={{padding:12,marginBottom:12,borderRadius:10,
      background:backupProgress.status==="error"?T.err+"10":backupProgress.status==="success"?T.ok+"10":T.accent+"08",
      border:"1px solid "+(backupProgress.status==="error"?T.err+"40":backupProgress.status==="success"?T.ok+"40":T.accent+"30"),
      fontSize:FS-1,
      color:backupProgress.status==="error"?T.err:backupProgress.status==="success"?T.ok:T.accent,
      fontWeight:700,
      display:"flex",alignItems:"center",gap:8
    }}>
      {backupProgress.status==="running"&&<Spinner size="small" color={T.accent} inline/>}
      <span>{backupProgress.message}</span>
    </div>}

    {/* Size estimate panel */}
    {sizeEstimate&&<div style={{padding:12,marginBottom:12,borderRadius:10,background:T.bg,border:"1px solid "+T.brd,fontSize:FS-2}}>
      <div style={{fontWeight:700,color:T.text,marginBottom:6}}>📊 الحجم المتوقع للنسخة:</div>
      <div style={{fontSize:FS+2,fontWeight:800,color:T.accent,marginBottom:6}}>{(sizeEstimate.totalBytes/1024/1024).toFixed(2)} MB</div>
      <div style={{display:"flex",flexDirection:"column",gap:3,fontSize:FS-3,color:T.textSec}}>
        {Object.entries(sizeEstimate.breakdown||{}).map(([k,v])=>
          <div key={k} style={{display:"flex",justifyContent:"space-between"}}>
            <span>{k}</span><span style={{fontFamily:"monospace"}}>{(v/1024).toFixed(1)} KB</span>
          </div>
        )}
      </div>
      <Btn small ghost onClick={()=>setSizeEstimate(null)} style={{marginTop:8}}>إخفاء</Btn>
    </div>}

    {/* Action buttons */}
    <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
      <Btn primary onClick={()=>createBackup("شاملة يدوية")} disabled={busy}>💾 نسخة احتياطية شاملة الآن</Btn>
      <Btn onClick={checkSize} disabled={busy} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>📊 معاينة الحجم</Btn>
      <Btn onClick={loadBackups} disabled={loading} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>{loading?<span style={{display:"inline-flex",alignItems:"center",gap:8}}><Spinner size="small" color={T.text} inline/>تحميل…</span>:"🔄 تحديث"}</Btn>
    </div>

    {/* Backup list */}
    {backupList.length===0?<div style={{padding:30,textAlign:"center",color:T.textMut,background:T.bg,borderRadius:10}}>لا توجد نسخ احتياطية</div>
    :<div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:400,overflowY:"auto"}}>
      {backupList.map(b=>{
        const d=new Date(b.createdAt||0);
        const c=b.counts||{};
        const isComp=!!b.isComprehensive;
        const isAuto=!!b.autoGenerated;
        const isPreMig=String(b.id||"").startsWith("pre-migration");
        const isAutoPreRestore=String(b.id||"").startsWith("auto-pre-");
        return<div key={b.id} style={{padding:12,borderRadius:10,background:T.bg,border:"1px solid "+(isComp?T.ok+"40":T.brd),display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:200}}>
            <div style={{fontSize:FS,fontWeight:700,color:T.text,display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
              📦 {b.label||"نسخة"}
              {isComp&&<span style={{fontSize:FS-3,padding:"2px 8px",borderRadius:6,background:T.ok+"20",color:T.ok,fontWeight:700}}>شاملة ✓</span>}
              {!isComp&&!isPreMig&&<span style={{fontSize:FS-3,padding:"2px 8px",borderRadius:6,background:T.warn+"20",color:T.warn,fontWeight:700}}>قديمة (ناقصة)</span>}
              {isPreMig&&<span style={{fontSize:FS-3,padding:"2px 8px",borderRadius:6,background:T.accent+"20",color:T.accent,fontWeight:600}}>قبل migration</span>}
              {isAutoPreRestore&&<span style={{fontSize:FS-3,padding:"2px 8px",borderRadius:6,background:T.warn+"15",color:T.warn,fontWeight:600}}>قبل استعادة</span>}
              {isAuto&&<span style={{fontSize:FS-3,padding:"2px 8px",borderRadius:6,background:T.accent+"15",color:T.accent,fontWeight:600}}>تلقائية</span>}
            </div>
            <div style={{fontSize:FS-2,color:T.textMut,marginTop:2}}>{d.toLocaleString("ar-EG",{dateStyle:"medium",timeStyle:"short"})}</div>
            <div style={{fontSize:FS-3,color:T.textSec,marginTop:4,display:"flex",gap:10,flexWrap:"wrap"}}>
              <span>💰 {c.treasuryDays||c.treasury||0}{c.treasuryDays?" يوم":" حركة"}</span>
              <span>👷 {c.employees||0}</span>
              <span>🧑 {c.customers||0}</span>
              <span>🏭 {c.workshops||0}</span>
              <span>📋 {c.ordersTotal||c.orders||0}</span>
              <span>👤 {(c.users||0)+(c.usersList||0)}</span>
            </div>
          </div>
          <div style={{display:"flex",gap:4}}>
            <Btn small onClick={()=>setConfirmRestore(b)} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}} title="استعادة">🔄</Btn>
            <Btn small onClick={async()=>{if(await ask("حذف النسخة","حذف النسخة الاحتياطية؟"+(isComp?" (هتحذف كل الـ parts بتاعتها)":""),{danger:true}))deleteBackup(b)}} style={{background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30"}} title="حذف">🗑</Btn>
          </div>
        </div>;
      })}
    </div>}

    {/* Restore confirmation dialog */}
    {confirmRestore&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:10002,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={()=>setConfirmRestore(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,maxWidth:560,width:"100%",border:"2px solid "+T.err,boxShadow:"0 20px 60px rgba(0,0,0,0.3)",maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{fontSize:48,textAlign:"center",marginBottom:8}}>🚨</div>
        <div style={{fontSize:FS+2,fontWeight:800,color:T.err,textAlign:"center",marginBottom:14}}>تأكيد عملية خطيرة: استعادة نسخة احتياطية</div>
        {confirmRestore.isComprehensive?<>
          <div style={{fontSize:FS-1,color:T.text,marginBottom:14,lineHeight:1.7,padding:12,background:T.ok+"08",borderRadius:10,border:"1px solid "+T.ok+"40"}}>
            <b style={{color:T.ok}}>✓ نسخة شاملة — هترجع كل البيانات:</b><br/>
            • factory/config + sales + tasks<br/>
            • حركات الخزنة + سجل المراجعة + HR<br/>
            • الأوردرات لكل المواسم<br/>
            • أسابيع المرتبات
          </div>
        </>:<>
          <div style={{fontSize:FS-1,color:T.textSec,marginBottom:10,lineHeight:1.7,padding:12,background:T.warn+"08",borderRadius:10,border:"1px solid "+T.warn+"30"}}>
            <b>هتُستبدل البيانات دي:</b><br/>
            • الإعدادات (factory/config)<br/>
            • factory/sales + factory/tasks
          </div>
          <div style={{fontSize:FS-1,color:T.textSec,marginBottom:14,lineHeight:1.7,padding:12,background:T.err+"08",borderRadius:10,border:"1px solid "+T.err+"40"}}>
            <b style={{color:T.err}}>⚠️ نسخة قديمة (مش شاملة) — مش هتستبدل:</b><br/>
            • حركات الخزنة (treasuryDays)<br/>
            • سجل المراجعة (auditDays)<br/>
            • الأوردرات (seasons)<br/>
            • إلخ.
          </div>
        </>}
        <div style={{fontSize:FS-1,color:T.text,marginBottom:14,lineHeight:1.7,padding:12,background:T.bg,borderRadius:10}}>
          📅 <b>{new Date(confirmRestore.createdAt).toLocaleString("ar-EG")}</b><br/>
          📦 {confirmRestore.label}
        </div>
        <div style={{fontSize:FS-2,color:T.ok,marginBottom:14,padding:10,background:T.ok+"10",borderRadius:8,border:"1px solid "+T.ok+"30"}}>
          ✓ <b>أمان إضافي:</b> هتتاخد نسخة احتياطية شاملة أوتوماتيك للحالة الحالية قبل الاستعادة.
        </div>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:FS-1,fontWeight:700,color:T.err,marginBottom:6}}>
            للتأكيد، اكتب كلمة <span style={{fontFamily:"monospace",background:T.err+"15",padding:"2px 8px",borderRadius:4}}>استعادة</span> بالظبط:
          </div>
          <Inp value={restoreTyped} onChange={setRestoreTyped} placeholder="اكتب: استعادة" style={{width:"100%",fontSize:FS,padding:"10px 14px",border:"2px solid "+(restoreTyped==="استعادة"?T.ok:T.err+"60")}}/>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",flexWrap:"wrap"}}>
          <Btn ghost onClick={()=>setConfirmRestore(null)} disabled={busy}>إلغاء</Btn>
          <Btn onClick={()=>restoreBackup(confirmRestore)} disabled={busy||restoreTyped!=="استعادة"} style={{background:restoreTyped==="استعادة"?T.err:T.bg,color:restoreTyped==="استعادة"?"#fff":T.textMut,border:restoreTyped==="استعادة"?"none":"1px solid "+T.brd,fontWeight:800,opacity:(busy||restoreTyped!=="استعادة")?0.6:1}}>{busy?<span style={{display:"inline-flex",alignItems:"center",gap:8}}><Spinner size="small" color="#fff" inline/>جاري الاستعادة…</span>:"🔄 تأكيد الاستعادة"}</Btn>
        </div>
      </div>
    </div>}
  </Card>;
}

/* ═══════════════════════════════════════════════════════════════
   V18.60: SELECTIVE RESTORE CARD — استعادة انتقائية
   ═══════════════════════════════════════════════════════════════
   
   Different from the regular Restore: this is ADDITIVE-ONLY.
   
   The user picks a backup, then we compute a diff between backup.config
   and the CURRENT factory/config. For each restorable field (customers,
   workshops, users, etc.), we show what's "missing" — i.e. what existed
   in the backup but not currently. The user can selectively check which
   fields to restore, then we ADD the missing items via upConfig.
   
   Crucially:
   - Existing data is NEVER overwritten — only missing items are added
   - Each restored item gets `restoredAt` and `restoredFrom` markers
   - An auto-backup is taken before the merge (just in case)
   - The action is logged to restoreLog
   
   Why this is safer than the regular Restore:
   - Regular Restore replaces the WHOLE config with the backup → can wipe
     things added since the backup was taken
   - Selective Restore only ADDS missing items → can't lose recent data
   ═══════════════════════════════════════════════════════════════ */

function SelectiveRestoreCard({configDoc, upConfig, user, isMob}){
  const[backups,setBackups]=useState([]);
  const[loading,setLoading]=useState(false);
  const[selectedBackup,setSelectedBackup]=useState(null);
  const[diffData,setDiffData]=useState(null);
  const[selectedFields,setSelectedFields]=useState(()=>new Set());
  const[expandedField,setExpandedField]=useState(null);
  const[confirmText,setConfirmText]=useState("");
  const[busy,setBusy]=useState(false);

  /* The fields we know how to merge. Each has an idKey (uniqueness key)
     and a nameKey (for human-readable preview). */
  const RESTORABLE_FIELDS=[
    {key:"users",      label:"🔐 صلاحيات (users object)", type:"object"},
    {key:"usersList",  label:"👤 قائمة المستخدمين",      type:"array",idKey:"email", nameKey:"name"},
    {key:"customers",  label:"🧑 عملاء",                  type:"array",idKey:"id",    nameKey:"name"},
    {key:"workshops",  label:"🏭 ورش",                    type:"array",idKey:"id",    nameKey:"name"},
    {key:"employees",  label:"👷 موظفين",                  type:"array",idKey:"id",    nameKey:"name"},
    {key:"suppliers",  label:"🚚 موردين",                  type:"array",idKey:"id",    nameKey:"name"},
    {key:"fabrics",    label:"🧵 خامات",                   type:"array",idKey:"id",    nameKey:"name"},
    {key:"accessories",label:"🎀 اكسسوارات",              type:"array",idKey:"id",    nameKey:"name"},
    {key:"garmentTypes",label:"👕 أنواع ملابس",            type:"array",idKey:"id",    nameKey:"name"},
    {key:"sizeSets",   label:"📏 مقاسات",                 type:"array",idKey:"id",    nameKey:"label"},
    {key:"statusCards",label:"📋 حالات الأوردر",          type:"array",idKey:"key",   nameKey:"name"},
    {key:"treasuryAccounts",label:"💰 حسابات خزنة",       type:"array",idKey:"id",    nameKey:"name"},
  ];

  const loadBackups=async()=>{
    setLoading(true);
    try{
      const snap=await getDocs(collection(db,"backups"));
      const list=[];
      snap.forEach(d=>{const data=d.data();list.push({id:d.id,...data})});
      list.sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""));
      setBackups(list);
    }catch(e){console.error("loadBackups:",e);showToast("⚠️ تعذر تحميل النسخ")}
    setLoading(false);
  };

  useEffect(()=>{loadBackups()},[]);

  /* Compute diff between backup.config and current configDoc.
     Returns per-field info on what's missing in current vs what's in backup. */
  const computeDiff=(backup)=>{
    if(!backup?.config)return null;
    const bConfig=backup.config;
    const cConfig=configDoc||{};
    const fields=[];

    for(const field of RESTORABLE_FIELDS){
      if(field.type==="object"){
        const bObj=bConfig[field.key]||{};
        const cObj=cConfig[field.key]||{};
        const bKeys=Object.keys(bObj);
        const cKeys=new Set(Object.keys(cObj));
        const missingKeys=bKeys.filter(k=>!cKeys.has(k));
        fields.push({
          ...field,
          currentCount:Object.keys(cObj).length,
          backupCount:bKeys.length,
          missingCount:missingKeys.length,
          missingItems:missingKeys.map(k=>({_key:k,_value:bObj[k]}))
        });
      }else{
        const bArr=Array.isArray(bConfig[field.key])?bConfig[field.key]:[];
        const cArr=Array.isArray(cConfig[field.key])?cConfig[field.key]:[];
        const cIds=new Set(cArr.map(x=>String(x?.[field.idKey]??"")));
        const missingItems=bArr.filter(x=>x&&x[field.idKey]!=null&&!cIds.has(String(x[field.idKey])));
        fields.push({
          ...field,
          currentCount:cArr.length,
          backupCount:bArr.length,
          missingCount:missingItems.length,
          missingItems
        });
      }
    }

    return{fields};
  };

  const handleSelectBackup=async(b)=>{
    /* V18.62: Handle both backup formats:
       - Legacy single-doc: config is in b.config directly
       - Comprehensive: config is in backups/{id}/parts/factoryConfig.data */
    let backupForDiff=b;
    if(b.isComprehensive&&!b.config){
      try{
        const compData=await readComprehensiveBackup(b.id);
        if(compData?.factoryConfig){
          backupForDiff={...b,config:compData.factoryConfig};
        }else{
          showToast("⚠️ تعذر قراءة النسخة الشاملة");
          return;
        }
      }catch(e){
        console.error("[V18.62] Failed to read comprehensive backup:",e);
        showToast("⚠️ خطأ في قراءة النسخة");
        return;
      }
    }
    setSelectedBackup(backupForDiff);
    const diff=computeDiff(backupForDiff);
    setDiffData(diff);
    /* Pre-select fields that have missing items */
    const initSelected=new Set();
    diff?.fields?.forEach(f=>{if(f.missingCount>0)initSelected.add(f.key)});
    setSelectedFields(initSelected);
    setExpandedField(null);
    setConfirmText("");
  };

  const toggleField=(key)=>{
    setSelectedFields(prev=>{
      const next=new Set(prev);
      if(next.has(key))next.delete(key);else next.add(key);
      return next;
    });
  };

  const performRestore=async()=>{
    if(!selectedBackup||!diffData){showToast("⚠️ اختر نسخة أولاً");return}
    if(confirmText!=="ادمج"){showToast("⚠️ اكتب 'ادمج' للتأكيد");return}
    const fieldsToRestore=diffData.fields.filter(f=>selectedFields.has(f.key)&&f.missingCount>0);
    if(fieldsToRestore.length===0){showToast("⚠️ مفيش حقول مختارة فيها عناصر مفقودة");return}

    setBusy(true);
    let preBackupId=null;
    try{
      /* Step 1: Auto-backup current configDoc before merge */
      const ts=new Date().toISOString().replace(/[:.]/g,"-");
      preBackupId="auto-pre-selective-"+ts;
      try{
        await setDoc(doc(db,"backups",preBackupId),{
          label:"تلقائي قبل دمج انتقائي",
          autoGenerated:true,
          createdAt:new Date().toISOString(),
          createdBy:user?.email||user?.uid||"unknown",
          config:configDoc||{},
          counts:{
            customers:(configDoc?.customers||[]).length,
            workshops:(configDoc?.workshops||[]).length,
            employees:(configDoc?.employees||[]).length,
            usersList:(configDoc?.usersList||[]).length,
            users:Object.keys(configDoc?.users||{}).length,
          }
        });
      }catch(preErr){
        console.error("[V18.60 selective] pre-backup failed:",preErr);
        showToast("⛔ فشل عمل نسخة احتياطية قبل الدمج — توقفت العملية");
        setBusy(false);
        return;
      }

      /* Step 2: Log the action to restoreLog (separate doc, audit-safe) */
      try{
        await setDoc(doc(db,"restoreLog",preBackupId),{
          ts:new Date().toISOString(),
          by:user?.email||user?.uid||"unknown",
          action:"selective_restore",
          sourceBackupId:selectedBackup.id,
          sourceBackupLabel:selectedBackup.label||"",
          sourceBackupCreatedAt:selectedBackup.createdAt||"",
          preRestoreBackupId:preBackupId,
          fieldsRestored:fieldsToRestore.map(f=>({
            key:f.key,
            count:f.missingCount,
          })),
        });
      }catch(logErr){
        console.warn("[V18.60 selective] restoreLog write failed (non-fatal):",logErr);
      }

      /* Step 3: Apply the merge via upConfig (which has all V18.60 safety guards).
         We only ADD missing items — never overwrite existing ones. */
      const restoredAt=new Date().toISOString();
      upConfig(d=>{
        for(const field of fieldsToRestore){
          if(field.type==="object"){
            if(!d[field.key])d[field.key]={};
            for(const item of field.missingItems){
              /* Only add if still missing — defensive against race with another write */
              if(!(item._key in d[field.key])){
                d[field.key][item._key]=item._value;
              }
            }
          }else{
            if(!Array.isArray(d[field.key]))d[field.key]=[];
            const existingIds=new Set(d[field.key].map(x=>String(x?.[field.idKey]??"")));
            for(const item of field.missingItems){
              const id=String(item?.[field.idKey]??"");
              if(!existingIds.has(id)){
                d[field.key].push({
                  ...item,
                  restoredAt,
                  restoredFrom:selectedBackup.id,
                });
                existingIds.add(id);
              }
            }
          }
        }
      });

      const totalRestored=fieldsToRestore.reduce((sum,f)=>sum+f.missingCount,0);
      showToast(`✅ تم دمج ${totalRestored} عنصر من ${fieldsToRestore.length} حقل. النسخة القديمة في ${preBackupId}`);
      /* Reset state */
      setSelectedBackup(null);
      setDiffData(null);
      setSelectedFields(new Set());
      setConfirmText("");
    }catch(e){
      console.error("[V18.60 selective restore]",e);
      showToast("⚠️ فشل الدمج: "+(e?.message||String(e)).slice(0,100));
    }
    setBusy(false);
  };

  const totalMissingSelected=diffData?.fields
    ?.filter(f=>selectedFields.has(f.key))
    .reduce((sum,f)=>sum+f.missingCount,0)||0;

  return<Card title="🔄 الاستعادة الانتقائية (آمنة — إضافة فقط)" style={{marginTop:16,border:"2px solid "+T.ok+"50"}}>
    <CardSubtitle icon="💡">أداة لاسترجاع البيانات المحذوفة (عملاء، ورش، مستخدمين، إلخ) من نسخة احتياطية قديمة <b>بدون</b> ما تلمس البيانات الحالية. الأداة بتدمج بس العناصر الناقصة، وما بتمسحش حاجة موجودة.</CardSubtitle>

    {/* Step 1: Pick a backup */}
    {!selectedBackup&&<>
      <div style={{padding:12,background:T.ok+"08",border:"1px solid "+T.ok+"30",borderRadius:10,marginBottom:14,fontSize:FS-1,color:T.text,lineHeight:1.7}}>
        <b style={{color:T.ok}}>كيف تشتغل الأداة دي:</b><br/>
        ١) تختار نسخة احتياطية قبل ما البيانات تختفي (مثلاً قبل الساعة 4 اليوم)<br/>
        ٢) الأداة تقارن النسخة بالبيانات الحالية وتعرضلك إيه الناقص<br/>
        ٣) تختار إيه اللي ترجعه (عملاء، ورش، مستخدمين...)<br/>
        ٤) الأداة تضيف الناقص بس — البيانات الحالية تفضل زي ما هي<br/>
        ٥) قبل أي تعديل، بناخد نسخة احتياطية أوتوماتيك للحالة الحالية
      </div>
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        <Btn onClick={loadBackups} disabled={loading} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>{loading?<span style={{display:"inline-flex",alignItems:"center",gap:8}}><Spinner size="small" color={T.text} inline/>جاري التحميل...</span>:"🔄 تحديث القائمة"}</Btn>
        <span style={{fontSize:FS-2,color:T.textMut,alignSelf:"center"}}>{backups.length} نسخة متاحة</span>
      </div>
      {backups.length===0&&!loading?<div style={{padding:30,textAlign:"center",color:T.textMut,background:T.bg,borderRadius:10}}>لا توجد نسخ احتياطية متاحة</div>
      :<div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:400,overflowY:"auto"}}>
        {backups.map(b=>{
          const d=new Date(b.createdAt||0);
          const c=b.counts||{};
          const isPreMig=String(b.id||"").startsWith("pre-migration");
          const isAutoPre=String(b.id||"").startsWith("auto-pre");
          return<div key={b.id} onClick={()=>handleSelectBackup(b)} style={{padding:12,borderRadius:10,background:T.bg,border:"1px solid "+T.brd,cursor:"pointer",transition:"all 0.15s"}} onMouseOver={e=>{e.currentTarget.style.background=T.accent+"08";e.currentTarget.style.borderColor=T.accent+"60"}} onMouseOut={e=>{e.currentTarget.style.background=T.bg;e.currentTarget.style.borderColor=T.brd}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:200}}>
                <div style={{fontSize:FS,fontWeight:700,color:T.text,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                  📦 {b.label||"نسخة"}
                  {isPreMig?<span style={{fontSize:FS-3,padding:"2px 8px",borderRadius:6,background:T.warn+"20",color:T.warn,fontWeight:600}}>قبل migration</span>:null}
                  {isAutoPre?<span style={{fontSize:FS-3,padding:"2px 8px",borderRadius:6,background:T.accent+"20",color:T.accent,fontWeight:600}}>تلقائي</span>:null}
                </div>
                <div style={{fontSize:FS-2,color:T.textMut,marginTop:2}}>{d.toLocaleString("ar-EG",{dateStyle:"medium",timeStyle:"short"})}</div>
                <div style={{fontSize:FS-3,color:T.textSec,marginTop:4,display:"flex",gap:10,flexWrap:"wrap"}}>
                  <span>🧑 {c.customers||0}</span>
                  <span>🏭 {c.workshops||0}</span>
                  <span>👷 {c.employees||0}</span>
                  <span>👤 {(c.usersList||0)+(c.users||0)}</span>
                </div>
              </div>
              <div style={{fontSize:FS-1,color:T.accent,fontWeight:700}}>اختيار ←</div>
            </div>
          </div>;
        })}
      </div>}
    </>}

    {/* Step 2: Show diff and let user pick fields */}
    {selectedBackup&&diffData&&<>
      <div style={{padding:12,background:T.accent+"08",border:"1px solid "+T.accent+"40",borderRadius:10,marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <div>
            <div style={{fontSize:FS,fontWeight:800,color:T.accent}}>📦 {selectedBackup.label||"نسخة"}</div>
            <div style={{fontSize:FS-2,color:T.textSec,marginTop:2}}>{new Date(selectedBackup.createdAt).toLocaleString("ar-EG")}</div>
          </div>
          <Btn ghost onClick={()=>{setSelectedBackup(null);setDiffData(null);setSelectedFields(new Set());setConfirmText("")}} style={{fontSize:FS-2}}>← اختيار نسخة تانية</Btn>
        </div>
      </div>

      <div style={{fontSize:FS-1,color:T.textSec,marginBottom:10,fontWeight:700}}>
        اختر الحقول اللي عاوز تضيف منها العناصر الناقصة:
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:14}}>
        {diffData.fields.map(f=>{
          const isSelected=selectedFields.has(f.key);
          const hasMissing=f.missingCount>0;
          const isExpanded=expandedField===f.key;
          return<div key={f.key} style={{borderRadius:10,border:"1px solid "+(isSelected&&hasMissing?T.accent+"60":T.brd),background:isSelected&&hasMissing?T.accent+"05":T.bg,opacity:hasMissing?1:0.5,overflow:"hidden"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",cursor:hasMissing?"pointer":"default"}} onClick={()=>hasMissing&&toggleField(f.key)}>
              <input type="checkbox" checked={isSelected&&hasMissing} disabled={!hasMissing} onChange={()=>{}} style={{width:18,height:18,cursor:hasMissing?"pointer":"default",accentColor:T.accent}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:FS,fontWeight:700,color:T.text}}>{f.label}</div>
                <div style={{fontSize:FS-2,color:T.textSec,marginTop:2}}>
                  حالياً: <b>{f.currentCount}</b> • في النسخة: <b>{f.backupCount}</b>
                  {hasMissing?<> • ناقص: <b style={{color:T.ok}}>+{f.missingCount}</b></>:<> • <span style={{color:T.textMut}}>مفيش ناقص</span></>}
                </div>
              </div>
              {hasMissing&&f.missingCount>0&&<button onClick={e=>{e.stopPropagation();setExpandedField(isExpanded?null:f.key)}} style={{padding:"4px 10px",fontSize:FS-3,background:T.bg,color:T.textSec,border:"1px solid "+T.brd,borderRadius:6,cursor:"pointer",fontFamily:"inherit"}}>{isExpanded?"إخفاء":"عرض"}</button>}
            </div>
            {isExpanded&&hasMissing&&<div style={{padding:"8px 14px 12px",borderTop:"1px solid "+T.brd,background:T.bg,maxHeight:200,overflowY:"auto"}}>
              <div style={{fontSize:FS-2,color:T.textMut,marginBottom:6}}>أمثلة على العناصر اللي هتترجع:</div>
              {f.missingItems.slice(0,30).map((item,i)=>{
                let display="";
                if(f.type==="object"){
                  display=item._key+" → "+(typeof item._value==="string"?item._value:(item._value?.role||JSON.stringify(item._value).slice(0,50)));
                }else{
                  display=(item[f.nameKey]||item[f.idKey]||"-")+(f.idKey!=="id"?"":" (id: "+item.id+")");
                }
                return<div key={i} style={{fontSize:FS-2,padding:"3px 0",color:T.text,borderBottom:i<f.missingItems.length-1?"1px dashed "+T.brd:"none"}}>• {display}</div>;
              })}
              {f.missingItems.length>30&&<div style={{fontSize:FS-3,color:T.textMut,marginTop:6,fontStyle:"italic"}}>... و {f.missingItems.length-30} عنصر إضافي</div>}
            </div>}
          </div>;
        })}
      </div>

      {totalMissingSelected===0?<div style={{padding:14,background:T.warn+"10",border:"1px solid "+T.warn+"40",borderRadius:10,color:T.warn,fontSize:FS-1,textAlign:"center"}}>اختر حقل واحد على الأقل فيه عناصر ناقصة</div>
      :<>
        <div style={{padding:12,background:T.ok+"08",border:"1px solid "+T.ok+"30",borderRadius:10,marginBottom:14,fontSize:FS-1,color:T.text,lineHeight:1.7}}>
          <b style={{color:T.ok}}>ملخص العملية:</b><br/>
          هتتم إضافة <b>{totalMissingSelected}</b> عنصر للبيانات الحالية.<br/>
          البيانات الحالية مش هتتلمس — بس الناقص اللي هيتضاف.<br/>
          هتتاخد نسخة احتياطية أوتوماتيك للحالة الحالية قبل الدمج.
        </div>

        <div style={{marginBottom:14}}>
          <div style={{fontSize:FS-1,fontWeight:700,color:T.accent,marginBottom:6}}>
            للتأكيد، اكتب كلمة <span style={{fontFamily:"monospace",background:T.accent+"15",padding:"2px 8px",borderRadius:4}}>ادمج</span> بالظبط:
          </div>
          <Inp value={confirmText} onChange={setConfirmText} placeholder="اكتب: ادمج" style={{width:"100%",fontSize:FS,padding:"10px 14px",border:"2px solid "+(confirmText==="ادمج"?T.ok:T.brd)}}/>
        </div>

        <div style={{display:"flex",gap:8,justifyContent:"flex-end",flexWrap:"wrap"}}>
          <Btn ghost onClick={()=>{setSelectedBackup(null);setDiffData(null);setSelectedFields(new Set());setConfirmText("")}} disabled={busy}>إلغاء</Btn>
          <Btn onClick={performRestore} disabled={busy||confirmText!=="ادمج"||totalMissingSelected===0} style={{background:confirmText==="ادمج"&&totalMissingSelected>0?T.ok:T.bg,color:confirmText==="ادمج"&&totalMissingSelected>0?"#fff":T.textMut,border:confirmText==="ادمج"&&totalMissingSelected>0?"none":"1px solid "+T.brd,fontWeight:800,opacity:(busy||confirmText!=="ادمج"||totalMissingSelected===0)?0.6:1}}>{busy?<span style={{display:"inline-flex",alignItems:"center",gap:8}}><Spinner size="small" color="#fff" inline/>جاري الدمج...</span>:"✅ تنفيذ الدمج"}</Btn>
        </div>
      </>}
    </>}
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
