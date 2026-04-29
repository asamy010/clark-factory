/* ═══════════════════════════════════════════════════════════════
   CLARK - TreasuryPg
   
   Extracted from App.jsx in V15.0 phase 2.
   Dependencies imported explicitly — no code changes inside.
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useMemo } from "react";
import { FS } from "../constants/index.js";
import { gid, fmt, fmt0, r2, _esc, dayName, dayNameFull, openWA } from "../utils/format.js";
import { playBeep } from "../utils/audio.js";
import { addAudit } from "../utils/audit.js";
import { showToast } from "../utils/popups.js";
import { pushUndo } from "../utils/undo.js";
import { openPrintWindow } from "../utils/print.js";
import { printCashReceipt, printCheckReceipt } from "../utils/print-extras.js";
import { getReferences } from "../utils/dataIntegrity.js";
import { Spinner, InlineLoading, Btn, Inp, Sel, Card, useDebounced } from "../components/ui.jsx";
import { autoPost } from "../utils/accounting/autoPost.js";
import { T } from "../theme.js";
import { db } from "../firebase";
import { collection } from "firebase/firestore";

export function TreasuryPg({data,upConfig,isMob,canEdit,user,userRole}){
  const userName=user?.displayName||(user?.email||"").split("@")[0];
  const userEmail=user?.email||"";
  const isAdmin=userRole==="admin";
  /* V15.44: Smart description builder for workshop transactions.
     Avoids duplicate "ورشة" when workshop name already starts with "ورشة" or "ورشه".
     Example: name="ورشه محمد ايمن" → "دفعة ورشه محمد ايمن" (not "دفعة ورشة ورشه محمد ايمن"). */
  const wsDesc=(name,isPurchase)=>{
    const cleaned=(name||"").trim();
    const startsWithWorkshop=/^ورش[هة](\s|$)/.test(cleaned);
    const body=startsWithWorkshop?cleaned:"ورشة "+cleaned;
    return(isPurchase?"مشتريات ":"دفعة ")+body;
  };
  const lockedDays=(data.lockedDays||[]);/* ["2026-04-15", ...] */
  const isDayLocked=(dt)=>lockedDays.includes(dt);
  /* ═══ V14.52: Edit/Delete locks with whitelist ═══
     Default behavior: lock is ON (undefined = ON) — admin always works.
     Allowed editors/deleters can also work. Delete permission implies edit. */
  const ts=data.treasurySettings||{};
  /* undefined/null → default to ON (locked for non-admins after update) */
  const lockEdit=ts.lockEdit===false?false:true;/* default: locked */
  const lockDelete=ts.lockDelete===false?false:true;/* default: locked */
  const allowedEditors=Array.isArray(ts.allowedEditors)?ts.allowedEditors:[];
  const allowedDeleters=Array.isArray(ts.allowedDeleters)?ts.allowedDeleters:[];
  /* Delete grants edit: anyone in allowedDeleters is implicitly in allowedEditors */
  const effectiveAllowedEditors=Array.from(new Set([...allowedEditors,...allowedDeleters]));
  const isAllowedEditor=effectiveAllowedEditors.includes(userEmail);
  const isAllowedDeleter=allowedDeleters.includes(userEmail);
  const canModify=(t)=>{
    if(!canEdit)return false;
    if(isAdmin)return true;/* Admin always allowed */
    if(isDayLocked(t.date))return false;/* Day lock applies to everyone (except admin) */
    if(!lockEdit)return true;/* Lock is off — everyone can edit per role */
    return isAllowedEditor;/* Lock is on — only whitelisted users */
  };
  const canDelete=(t)=>{
    if(!canEdit)return false;
    if(isAdmin)return true;/* Admin always allowed */
    if(isDayLocked(t.date))return false;
    if(!lockDelete)return true;
    return isAllowedDeleter;
  };
  /* Log lock-related events — for admin bypass OR whitelisted user action */
  const logLockBypass=(action,tx)=>{
    const isLockActive=(action==="edit"&&lockEdit)||(action==="delete"&&lockDelete);
    if(!isLockActive)return;/* Lock is off — nothing to log */
    /* Log only when lock is on: admin bypass OR whitelisted user action */
    const isWhitelisted=action==="edit"?isAllowedEditor:isAllowedDeleter;
    if(!isAdmin&&!isWhitelisted)return;/* Unauthorized — will be blocked by canModify/canDelete anyway */
    upConfig(d=>{
      if(!Array.isArray(d.auditLog))d.auditLog=[];
      d.auditLog.unshift({
        id:Math.random().toString(36).slice(2)+Date.now(),
        category:"security",
        action:isAdmin?"lock_bypass":"lock_whitelisted",
        target:action==="edit"?"treasury_edit":"treasury_delete",
        oldValue:"مقفول من الإعدادات",
        newValue:(action==="edit"?"تعديل":"حذف")+" بواسطة "+(isAdmin?"مدير":"مستخدم مصرّح له"),
        notes:"الحركة: "+(tx?.desc||"—")+" | المبلغ: "+(tx?.amount||0)+" | التاريخ: "+(tx?.date||"—")+" | حساب: "+(tx?.account||"—"),
        by:userEmail,
        at:new Date().toISOString()
      });
    });
  };
  /* Confirm popup */
  const[confirmPopup,setConfirmPopup]=useState(null);
  const openConfirm=(cfg)=>setConfirmPopup(cfg);
  /* V14.52: First-visit warning for non-admin users when lock is active and they are NOT whitelisted */
  const[showFirstVisitWarning,setShowFirstVisitWarning]=useState(false);
  useEffect(()=>{
    if(isAdmin)return;/* admins never see warning */
    if(!lockEdit&&!lockDelete)return;/* no lock active */
    const hasAnyAccess=isAllowedEditor||isAllowedDeleter;
    if(hasAnyAccess)return;/* whitelisted — no need to warn */
    /* Show once per session, not each load */
    const key="clark_treasury_lock_warning_"+userEmail+"_"+new Date().toDateString();
    if(sessionStorage.getItem(key))return;
    setShowFirstVisitWarning(true);
    sessionStorage.setItem(key,"1");
  },[isAdmin,lockEdit,lockDelete,isAllowedEditor,isAllowedDeleter,userEmail]);
  /* V17.8: Auto-migrate legacy category "دفع مورد" → "دفعة مورد" (typo fix).
     Runs once when the treasury page loads if any old entry is found.
     Safe to re-run — idempotent (filter ensures we only update entries that need it). */
  useEffect(()=>{
    if(!Array.isArray(data.treasury))return;
    const needsFix=data.treasury.some(t=>t&&t.category==="دفع مورد");
    if(!needsFix)return;
    upConfig(d=>{
      if(Array.isArray(d.treasury)){
        d.treasury.forEach(t=>{if(t&&t.category==="دفع مورد")t.category="دفعة مورد"});
      }
    });
  },[data.treasury,upConfig]);
  /* V18.0: Orphan check reconciliation — if a check has status "محصل" / "مدفوع" / "مُظهّر"
     but the linked treasury entry (or supplier payment for endorsed) was deleted somehow,
     auto-revert the check to "معلق" so the books stay consistent.
     This handles cases where a user deleted the treasury entry directly, or a bulk reset
     left orphans. Safe to re-run — only acts when an orphan is detected. */
  useEffect(()=>{
    if(!Array.isArray(data.checks)||data.checks.length===0)return;
    const treasuryByCheckId=new Set((data.treasury||[]).filter(t=>t&&t.checkId).map(t=>t.checkId));
    const supPayByCheckId=new Set((data.supplierPayments||[]).filter(p=>p&&p.checkId&&p.method==="endorsed_check").map(p=>p.checkId));
    const orphans=data.checks.filter(c=>{
      if(!c)return false;
      /* محصل / مدفوع need a treasury entry with checkId === c.id */
      if((c.status==="محصل"||c.status==="مدفوع")&&!treasuryByCheckId.has(c.id))return true;
      /* مُظهّر needs a supplier payment with checkId === c.id and method=endorsed_check */
      if(c.status==="مُظهّر"&&!supPayByCheckId.has(c.id))return true;
      return false;
    });
    if(orphans.length===0)return;
    upConfig(d=>{
      if(!Array.isArray(d.checks))return;
      const treasuryIds=new Set((d.treasury||[]).filter(t=>t&&t.checkId).map(t=>t.checkId));
      const supPayIds=new Set((d.supplierPayments||[]).filter(p=>p&&p.checkId&&p.method==="endorsed_check").map(p=>p.checkId));
      d.checks.forEach(c=>{
        if(!c)return;
        let isOrphan=false;
        if((c.status==="محصل"||c.status==="مدفوع")&&!treasuryIds.has(c.id))isOrphan=true;
        if(c.status==="مُظهّر"&&!supPayIds.has(c.id))isOrphan=true;
        if(isOrphan){
          c.status="معلق";
          delete c.statusDate;delete c.statusBy;
          delete c.endorsedTo;delete c.endorsedToId;delete c.endorsedAt;
          delete c.bouncedAt;
          c.autoReverted=new Date().toISOString();
          c.autoRevertReason="حركة الخزنة المرتبطة تم حذفها من مكان آخر";
        }
      });
    });
    showToast("⚠️ تم إرجاع "+orphans.length+" شيك لحالة معلق (الحركة المرتبطة كانت محذوفة)");
  },[data.checks,data.treasury,data.supplierPayments,upConfig]);
  /* V18.1: Auto-recovery for orphaned treasury accounts.
     Bug: defaults (MAIN CASH / SUB CASH) were rendered virtually only when
     treasuryAccounts was empty. Once a real account got added (e.g. CIB bank),
     the defaults vanished from tabs while their transactions remained orphaned.
     Fix: scan transactions/transfers/checks for any account name not present
     in treasuryAccounts and auto-restore it (typed as cash). Also persist
     MAIN+SUB CASH the first time treasuryAccounts is empty. */
  useEffect(()=>{
    const raw=(data.treasuryAccounts||[]);
    const existingNames=new Set(raw.map(a=>typeof a==="string"?a:(a&&a.name)).filter(Boolean));
    const referencedNames=new Set();
    (data.treasury||[]).forEach(t=>{if(t&&t.account)referencedNames.add(t.account)});
    (data.treasuryTransfers||[]).forEach(tf=>{if(tf){if(tf.fromAccount)referencedNames.add(tf.fromAccount);if(tf.toAccount)referencedNames.add(tf.toAccount)}});
    const missing=[...referencedNames].filter(n=>n&&!existingNames.has(n));
    const needsDefaults=raw.length===0;
    if(!missing.length&&!needsDefaults)return;
    upConfig(d=>{
      if(!Array.isArray(d.treasuryAccounts))d.treasuryAccounts=[];
      d.treasuryAccounts=d.treasuryAccounts.map(a=>typeof a==="string"?{id:a,name:a,ownerEmail:"",type:"cash"}:a);
      const have=new Set(d.treasuryAccounts.map(a=>a.name));
      if(d.treasuryAccounts.length===0){
        if(!have.has("MAIN CASH")){d.treasuryAccounts.push({id:"MAIN CASH",name:"MAIN CASH",ownerEmail:"",type:"cash"});have.add("MAIN CASH")}
        if(!have.has("SUB CASH")){d.treasuryAccounts.push({id:"SUB CASH",name:"SUB CASH",ownerEmail:"",type:"cash"});have.add("SUB CASH")}
      }
      missing.forEach(n=>{
        if(have.has(n))return;
        const isCash=/CASH|كاش|نقد/i.test(n);
        d.treasuryAccounts.push({id:n,name:n,ownerEmail:"",type:isCash?"cash":"bank",autoRestored:new Date().toISOString()});
        have.add(n);
      });
    });
    if(missing.length)showToast("✓ تم استرجاع "+missing.length+" حساب: "+missing.join("، "));
  },[data.treasuryAccounts,data.treasury,data.treasuryTransfers,upConfig]);
  const txns=(data.treasury||[]);
  /* Accounts are now objects: {id, name, ownerEmail, type} — auto-migrate from old strings */
  const rawAccounts=(data.treasuryAccounts||[]);
  const accountsData=rawAccounts.length>0?rawAccounts.map(a=>typeof a==="string"?{id:a,name:a,ownerEmail:"",type:"cash"}:a):[{id:"MAIN CASH",name:"MAIN CASH",ownerEmail:"",type:"cash"},{id:"SUB CASH",name:"SUB CASH",ownerEmail:"",type:"cash"}];
  const accounts=accountsData.map(a=>a.name);/* backward compat */
  const customers=(data.customers||[]);
  const suppliers=(data.suppliers||[]);
  const workshops=(data.workshops||[]).filter(w=>!((w.type||"").includes("داخلي")));
  const transfers=(data.treasuryTransfers||[]);
  const notifications=(data.notifications||[]);
  const[showForm,setShowForm]=useState(false);
  /* V15.44: Date picker for top-level print/PDF/WhatsApp buttons — defaults to today but user can pick any day */
  const[printDate,setPrintDate]=useState(new Date().toISOString().split("T")[0]);
  const[txType,setTxType]=useState("in");
  const[txAmount,setTxAmount]=useState("");
  const[txDesc,setTxDesc]=useState("");
  const[txNotes,setTxNotes]=useState("");
  const[txCategory,setTxCategory]=useState("");
  const[txAccount,setTxAccount]=useState("SUB CASH");
  const[txSeason,setTxSeason]=useState(data.activeSeason||"");
  const[txDate,setTxDate]=useState(new Date().toISOString().split("T")[0]);
  const[txPartyId,setTxPartyId]=useState("");/* Customer or supplier ID */
  const[txPartyType,setTxPartyType]=useState("");/* "customer" | "supplier" */
  const[editId,setEditId]=useState(null);
  /* Party picker popup */
  const[showPartyPicker,setShowPartyPicker]=useState(null);/* "customer" | "supplier" */
  const[partySearch,setPartySearch]=useState("");const partySearchDeb=useDebounced(partySearch,200);
  /* Filters */
  const[filterType,setFilterType]=useState("الكل");
  const[filterCat,setFilterCat]=useState("الكل");
  const[filterAcc,setFilterAcc]=useState(()=>{const accs=rawAccounts.length>0?rawAccounts:["MAIN CASH","SUB CASH"];const sub=accs.find(a=>{const n=typeof a==="string"?a:a.name||a.id;return n.toUpperCase().includes("SUB")});return sub?(typeof sub==="string"?sub:sub.name||"SUB CASH"):"SUB CASH"});
  const[filterMonth,setFilterMonth]=useState("");
  const[filterDay,setFilterDay]=useState("");
  const[filterSearch,setFilterSearch]=useState("");const filterSearchDeb=useDebounced(filterSearch,250);
  const[limit,setLimit]=useState(50);
  /* View */
  const subAccId=(rawAccounts.length>0?rawAccounts:["MAIN CASH","SUB CASH"]).find(a=>{const n=typeof a==="string"?a:a.name||a.id;return n.toUpperCase().includes("SUB")})||"SUB CASH";
  const subAccKey="acc_"+(typeof subAccId==="string"?subAccId:subAccId.id||subAccId.name||"SUB CASH");
  const[view,setView]=useState(subAccKey);
  /* ── Odoo Sync ── */
  const[odooSyncing,setOdooSyncing]=useState(false);const[odooResult,setOdooResult]=useState(null);
  /* Selective sync popup state */
  const[odooSyncPopup,setOdooSyncPopup]=useState(null);/* null | {step:"filters"|"confirm", fromDate, toDate, selectedCats:{cat:bool}, confirmText} */
  const[odooSyncPreview,setOdooSyncPreview]=useState(null);/* cached preview: {newTxns, skipped, existing, total, byCategory} */
  /* Open the selective sync popup — initializes filters to "this month" and all categories selected */
  const openOdooSyncPopup=()=>{
    const os=data.odooSettings||{};
    if(!os.url||!os.db||!os.user||!os.apiKey||!os.journalName||!os.cashAccountCode){showToast("⚠️ أكمل إعدادات Odoo في الاعدادات أولاً");return}
    const subName=accountsData.find(a=>a.name.toUpperCase().includes("SUB"))?.name||"SUB CASH";
    const subTxns=txns.filter(t=>(t.account||"")===subName);
    if(subTxns.length===0){showToast("⚠️ لا توجد حركات في الخزينة الفرعية");return}
    /* Default: this month range */
    const now=new Date();const y=now.getFullYear();const m=String(now.getMonth()+1).padStart(2,"0");
    const firstDay=y+"-"+m+"-01";const todayStr=now.toISOString().split("T")[0];
    /* Collect all unique categories from SUB CASH txns */
    const cats={};subTxns.forEach(t=>{const c=t.category||"بدون تصنيف";cats[c]=true});
    setOdooSyncPopup({step:"filters",fromDate:firstDay,toDate:todayStr,selectedCats:cats,confirmText:""});
    setOdooSyncPreview(null);
    setOdooResult(null);
  };
  /* Build preview of what will be synced based on current filters */
  const buildOdooPreview=async()=>{
    if(!odooSyncPopup)return;
    const os=data.odooSettings||{};
    const subName=accountsData.find(a=>a.name.toUpperCase().includes("SUB"))?.name||"SUB CASH";
    const subTxns=txns.filter(t=>(t.account||"")===subName);
    /* Apply date filter */
    const{fromDate,toDate,selectedCats}=odooSyncPopup;
    const filtered=subTxns.filter(t=>{
      const d=t.date||"";
      if(fromDate&&d<fromDate)return false;
      if(toDate&&d>toDate)return false;
      const cat=t.category||"بدون تصنيف";
      if(!selectedCats[cat])return false;
      return true;
    });
    if(filtered.length===0){setOdooSyncPreview({total:0,newTxns:[],existing:0,byCategory:{},unmapped:[]});return}
    /* Check Odoo for existing refs */
    try{
      const api=async(body)=>{const r=await fetch("/api/odoo-sync",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({odooUrl:os.url,odooDb:os.db,odooUser:os.user,odooKey:os.apiKey,...body})});return r.json()};
      const refs=filtered.map(t=>"CLARK-"+t.id);
      const refRes=await api({action:"search_refs",payload:{refs}});
      const existingRefs=new Set(refRes.existing||[]);
      const newTxns=filtered.filter(t=>!existingRefs.has("CLARK-"+t.id));
      /* Group by category */
      const byCategory={};newTxns.forEach(t=>{const c=t.category||"بدون تصنيف";if(!byCategory[c])byCategory[c]={count:0,total:0};byCategory[c].count++;byCategory[c].total+=Number(t.amount)||0});
      /* Flag unmapped categories */
      const mapping=os.accountMapping||{};const defaultSet=!!(os.defaultAccountCode||"").trim();
      const unmapped=Object.keys(byCategory).filter(c=>!mapping[c]&&!mapping[c.trim()]&&!defaultSet);
      setOdooSyncPreview({total:filtered.length,newTxns,existing:existingRefs.size,byCategory,unmapped,totalAmount:newTxns.reduce((s,t)=>s+(Number(t.amount)||0),0)});
    }catch(e){showToast("⚠️ خطأ في جلب المعاينة: "+e.message);setOdooSyncPreview(null)}
  };

  const syncToOdoo=async(filteredTxnsArg)=>{
    const os=data.odooSettings||{};
    if(!os.url||!os.db||!os.user||!os.apiKey||!os.journalName||!os.cashAccountCode){showToast("⚠️ أكمل إعدادات Odoo في الاعدادات أولاً");return}
    setOdooSyncing(true);setOdooResult(null);
    try{
      const api=async(body)=>{const r=await fetch("/api/odoo-sync",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({odooUrl:os.url,odooDb:os.db,odooUser:os.user,odooKey:os.apiKey,...body})});return r.json()};
      /* 1. Find journal ID */
      const jRes=await api({action:"find_journal",payload:{journalName:os.journalName}});
      if(jRes.error){setOdooResult({ok:false,msg:"❌ دفتر اليومية: "+jRes.error});setOdooSyncing(false);return}
      const journalId=jRes.journalId;
      /* 2. Find cash account ID */
      const aRes=await api({action:"find_account",payload:{accountCode:os.cashAccountCode}});
      if(aRes.error){setOdooResult({ok:false,msg:"❌ حساب الخزينة: "+aRes.error});setOdooSyncing(false);return}
      const cashAccId=aRes.accountId;
      /* 3. Get transactions — either filtered ones from popup, or all SUB CASH */
      let subTxns;
      if(Array.isArray(filteredTxnsArg)){
        subTxns=filteredTxnsArg;
      }else{
        const subName=accountsData.find(a=>a.name.toUpperCase().includes("SUB"))?.name||"SUB CASH";
        subTxns=txns.filter(t=>(t.account||"")===subName);
      }
      if(subTxns.length===0){setOdooResult({ok:false,msg:"⚠️ لا توجد حركات للتزامن"});setOdooSyncing(false);return}
      /* 4. Check for existing refs (prevent duplicates) */
      const refs=subTxns.map(t=>"CLARK-"+t.id);
      const refRes=await api({action:"search_refs",payload:{refs}});
      const existingRefs=new Set(refRes.existing||[]);
      const newTxns=subTxns.filter(t=>!existingRefs.has("CLARK-"+t.id));
      if(newTxns.length===0){setOdooResult({ok:true,msg:"✅ كل الحركات متزامنة بالفعل ("+subTxns.length+" حركة)"});setOdooSyncing(false);return}
      /* 5. Build account mapping cache */
      const mapping=os.accountMapping||{};
      const accCache={};const accErrors=[];
      for(const cat of Object.keys(mapping)){
        const code=(mapping[cat]||"").trim();
        if(code){
          const r=await api({action:"find_account",payload:{accountCode:code}});
          if(r.accountId){accCache[cat.trim()]=r.accountId;}
          else{accErrors.push(cat+":"+code+"→"+(r.error||"not found"));console.warn("❌ Account NOT found:",cat,"→",code,r)}}
      }
      if(accErrors.length>0)console.warn("⚠️ Account lookup errors:",accErrors);
      /* 6. Build entries */
      const entries=[];let skipped=0;const missingCats=new Set();
      const defaultAccCode=(os.defaultAccountCode||"").trim();
      let defaultAccId=null;
      if(defaultAccCode){const r=await api({action:"find_account",payload:{accountCode:defaultAccCode}});if(r.accountId)defaultAccId=r.accountId}
      for(const t of newTxns){
        const counterAccId=accCache[(t.category||"").trim()]||defaultAccId;
        if(!counterAccId){skipped++;missingCats.add(t.category||"بدون تصنيف");continue}
        const isIn=t.type==="in";
        entries.push({
          ref:"CLARK-"+t.id,
          date:t.date||new Date().toISOString().split("T")[0],
          journalId,
          narration:(t.desc||"")+(t.notes?" — "+t.notes:""),
          lines:[
            {accountId:cashAccId,debit:isIn?Number(t.amount):0,credit:isIn?0:Number(t.amount),name:t.desc||t.category||""},
            {accountId:counterAccId,debit:isIn?0:Number(t.amount),credit:isIn?Number(t.amount):0,name:t.desc||t.category||""}
          ]
        })
      }
      if(entries.length===0){const mappedCats=Object.keys(accCache).join("، ")||"لا يوجد";setOdooResult({ok:false,msg:"⚠️ لا توجد حركات بحسابات مربوطة ("+skipped+" بدون ربط"+(missingCats.size>0?": "+[...missingCats].join("، "):"")+"). الربط الحالي: ["+mappedCats+"]. تأكد من حفظ الربط في الإعدادات."});setOdooSyncing(false);return}
      /* 7. Create in batches of 10 */
      let totalCreated=0;const allErrors=[];
      for(let i=0;i<entries.length;i+=10){
        const batch=entries.slice(i,i+10);
        const r=await api({action:"create_entries",payload:{entries:batch}});
        totalCreated+=(r.created||0);if(r.errors)allErrors.push(...r.errors)}
      setOdooResult({ok:true,msg:"✅ تم تزامن "+totalCreated+" حركة"+(skipped>0?" | "+skipped+" بدون ربط حساب":"")+(allErrors.length>0?" | "+allErrors.length+" خطأ":"")+(existingRefs.size>0?" | "+existingRefs.size+" مكررة تم تجاهلها":"")});
    }catch(e){setOdooResult({ok:false,msg:"❌ خطأ: "+e.message})}
    setOdooSyncing(false)};

  /* Auto-mark transfer notifications as read when viewing transfers tab.
     Also cleanup orphaned notifications pointing to transfers that no longer exist. */
  useEffect(()=>{
    const allNotifs=data.notifications||[];
    const allTransfers=data.treasuryTransfers||[];
    const transferIds=new Set(allTransfers.map(t=>t.id));
    /* Orphaned: linked to a transfer that was deleted */
    const orphaned=allNotifs.filter(n=>(n.type==="treasury_transfer"||n.type==="treasury_transfer_confirmed")&&n.transferId&&!transferIds.has(n.transferId));
    /* Unread transfer notifs for current user when in transfers tab */
    const toMark=view==="transfers"
      ?allNotifs.filter(n=>n.toEmail===userEmail&&!n.read&&(n.type==="treasury_transfer"||n.type==="treasury_transfer_confirmed"))
      :[];
    if(orphaned.length===0&&toMark.length===0)return;
    const orphanIds=new Set(orphaned.map(n=>n.id));
    const markIds=new Set(toMark.map(n=>n.id));
    upConfig(d=>{
      if(orphanIds.size>0)d.notifications=(d.notifications||[]).filter(n=>!orphanIds.has(n.id));
      if(markIds.size>0)(d.notifications||[]).forEach(n=>{if(markIds.has(n.id))n.read=true});
    });
  },[view,data.notifications,data.treasuryTransfers]);
  /* Account management */
  const[newAccName,setNewAccName]=useState("");
  const[newAccOwner,setNewAccOwner]=useState("");
  const[editAccId,setEditAccId]=useState(null);
  /* V18.0: Banks management — list of bank names used in checks */
  const[newBankName,setNewBankName]=useState("");
  const[editBankIdx,setEditBankIdx]=useState(null);
  /* V18.0: Account-picker popups for check collect/pay (asks where money goes/comes from) */
  const[collectAccountPopup,setCollectAccountPopup]=useState(null);/* {checkId, ch} */
  const[payAccountPopup,setPayAccountPopup]=useState(null);/* {checkId, ch} */
  /* Transfer */
  const[showTransfer,setShowTransfer]=useState(false);
  const[tfFrom,setTfFrom]=useState("");const[tfTo,setTfTo]=useState("");
  const[tfAmount,setTfAmount]=useState("");const[tfNote,setTfNote]=useState("");
  const[tfDate,setTfDate]=useState("");/* custom date for transfer (defaults to today when popup opens) */
  /* V16.26: Edit transfer popup — null | {id, fromAccount, toAccount, amount, note, date} */
  const[editTf,setEditTf]=useState(null);
  /* Checks */
  const checks=(data.checks||[]);
  const[showCheckForm,setShowCheckForm]=useState(false);
  /* V16.35: Batch repeat — for adding a series of checks (a حافظة) all at once.
     count = how many checks total, monthsStep = months between successive due dates.
     The first check is the form's data; checks 2..N are auto-generated by
     incrementing dueDate by monthsStep months and bumping checkNo by 1. */
  const[chkBatchEnabled,setChkBatchEnabled]=useState(false);
  const[chkBatchCount,setChkBatchCount]=useState(10);
  const[chkBatchMonthsStep,setChkBatchMonthsStep]=useState(1);
  const[chkType,setChkType]=useState("receivable");
  const[chkAmount,setChkAmount]=useState("");const[chkParty,setChkParty]=useState("");const[chkBank,setChkBank]=useState("");
  const[chkNumber,setChkNumber]=useState("");const[chkDate,setChkDate]=useState("");const[chkDueDate,setChkDueDate]=useState("");
  const[chkNotes,setChkNotes]=useState("");const[chkEditId,setChkEditId]=useState(null);const[chkFilter,setChkFilter]=useState("الكل");
  const[chkCategory,setChkCategory]=useState("");/* category for the check — drives treasury registration */
  const[chkPartyId,setChkPartyId]=useState("");/* linked customer or supplier id */
  /* Endorse */
  const[endorsePopup,setEndorsePopup]=useState(null);const[endorseSearch,setEndorseSearch]=useState("");
  /* V16.33: optional custom endorsement date (defaults to today when popup opens) */
  const[endorseDate,setEndorseDate]=useState("");
  /* Inline edit journal row */
  const[inlineEdit,setInlineEdit]=useState(null);/* tx id */
  const[inlineDraft,setInlineDraft]=useState({});
  /* Bulk selection for journal entries */
  const[selectedTxIds,setSelectedTxIds]=useState(new Set());
  const toggleTxSel=(id)=>{setSelectedTxIds(prev=>{const n=new Set(prev);if(n.has(id))n.delete(id);else n.add(id);return n})};

  /* Danger zone: reset */
  const[showResetPopup,setShowResetPopup]=useState(false);
  const[resetConfirmText,setResetConfirmText]=useState("");
  const executeReset=()=>{
    upConfig(d=>{
      /* Treasury */
      d.treasury=[];
      d.treasuryTransfers=[];
      d.custPayments=[];
      d.supplierPayments=[];
      d.lockedDays=[];
      /* HR: advances + salary records + debts */
      d.hrLog=[];
      d.empDebts=[];
      /* Reset prev balance on all employees */
      if(Array.isArray(d.employees)){d.employees=d.employees.map(e=>({...e,prevBalance:0}))}
      /* Reset totals on weeks (keep attendance + metadata but re-open) */
      if(Array.isArray(d.hrWeeks)){d.hrWeeks=d.hrWeeks.map(w=>({...w,status:"open",totalGross:0,totalNet:0,empCount:0}))}
      /* Clear only treasury-related notifications */
      d.notifications=(d.notifications||[]).filter(n=>n.type!=="treasury_transfer"&&n.type!=="treasury_transfer_confirmed"&&n.type!=="cust_payment");
    });
    setShowResetPopup(false);setResetConfirmText("");showToast("✅ تم المسح الشامل");
  };

  const OUT_CATS=["تكلفة","مشتريات","مرتبات","قطع غيار","صيانة ماكينات","خيط","تشغيل خارجي","نقل","كهرباء","ضيافة","ايجار المصنع","نثريات","اكسسوار","مستلزمات تشغيل","ورق ماركر","خدمات","أصول ثابتة","تكاليف أخرى","دفعة مورد","تحويل داخلي"];
  const IN_CATS=["وارد","إيرادات","دفعة عميل","رأس مال","تحويل","تحويل داخلي"];
  /* V16.61: Categories that have hard-wired behavior elsewhere in the app —
     they trigger party pickers, link to other modules, etc. These MUST be in
     every dropdown regardless of what the user saved in treasurySettings,
     because removing them breaks the linked features (supplier picker, customer
     picker, transfers system, etc.).
     
     Bug this fixes: SettingsPg's DEFAULT_OUT (in TreasurySettingsCard) doesn't
     include "دفعة مورد" or "تحويل داخلي" — so the first time a user opens
     treasury settings and clicks save, those categories get dropped from the
     saved list. The supplier picker stops working ("دفعة مورد" never appears
     in the dropdown), the filter doesn't list custom categories, and inline
     edit has the same issue. The union here makes the dropdowns resilient
     to whatever the user's saved list looks like. */
  const REQUIRED_OUT=["دفعة مورد","تشغيل خارجي","مرتبات","تحويل داخلي"];
  const REQUIRED_IN=["دفعة عميل","تحويل داخلي"];
  const resolvedOutCats=useMemo(()=>{
    const saved=(data.treasurySettings||{}).outCategories;
    const base=Array.isArray(saved)&&saved.length>0?[...saved]:[...OUT_CATS];
    REQUIRED_OUT.forEach(c=>{if(!base.includes(c))base.push(c)});
    return base;
  },[data.treasurySettings?.outCategories]);/* eslint-disable-line */
  const resolvedInCats=useMemo(()=>{
    const saved=(data.treasurySettings||{}).inCategories;
    const base=Array.isArray(saved)&&saved.length>0?[...saved]:[...IN_CATS];
    REQUIRED_IN.forEach(c=>{if(!base.includes(c))base.push(c)});
    return base;
  },[data.treasurySettings?.inCategories]);/* eslint-disable-line */
  /* V16.61: Filter dropdown shows a union of in+out resolved cats — used by the
     filterCat <Sel> and the inline-edit category dropdown so user-added
     categories appear everywhere, not just in the new-tx form. */
  const ALL_CATS=useMemo(()=>{
    const set=new Set([...resolvedInCats,...resolvedOutCats]);
    return Array.from(set);
  },[resolvedInCats,resolvedOutCats]);
  const today=new Date().toISOString().split("T")[0];

  /* ── Per-account balances ── */
  const accBalances=useMemo(()=>{
    const bal={};accounts.forEach(a=>{bal[a]={in:0,out:0}});
    txns.forEach(t=>{const acc=t.account||"MAIN CASH";if(!bal[acc])bal[acc]={in:0,out:0};
      if(t.type==="in")bal[acc].in+=(Number(t.amount)||0);else bal[acc].out+=(Number(t.amount)||0)});
    return bal},[txns,accounts]);
  const totalBalance=Object.values(accBalances).reduce((s,a)=>s+(a.in-a.out),0);

  /* ── Today summary ── */
  const todayTxns=txns.filter(t=>t.date===today);
  const todayIn=todayTxns.filter(t=>t.type==="in").reduce((s,t)=>s+(Number(t.amount)||0),0);
  const todayOut=todayTxns.filter(t=>t.type==="out").reduce((s,t)=>s+(Number(t.amount)||0),0);

  /* ── Filtered & sorted ── */
  let filtered=[...txns].sort((a,b)=>(b.date||"").localeCompare(a.date||"")||(b.createdAt||"").localeCompare(a.createdAt||""));
  if(filterType!=="الكل")filtered=filtered.filter(t=>t.type===(filterType==="وارد"?"in":"out"));
  if(filterCat!=="الكل")filtered=filtered.filter(t=>t.category===filterCat);
  if(filterAcc!=="الكل")filtered=filtered.filter(t=>(t.account||"MAIN CASH")===filterAcc);
  if(filterMonth)filtered=filtered.filter(t=>(t.date||"").startsWith(filterMonth));
  if(filterDay)filtered=filtered.filter(t=>t.date===filterDay);
  /* V15.82: Arabic-aware search.
     - Normalizes diacritics (tashkeel), tatweel, alef variants, ya, and ta-marbuta
     - Matches on party name (employee/customer/supplier/workshop) via ID lookup
     - Matches numeric amount when user types a number
     V15.90: Removed t.by (user who recorded the tx) — it was polluting search results
     because every entry is recorded by the same logged-in user, making the filter useless.
     Search now filters by transaction content (desc/party/category) only. */
  if(filterSearchDeb){
    const normAr=(s)=>(s==null?"":s.toString()).toLowerCase()
      .replace(/[\u064B-\u0652\u0670\u0640]/g,"")  /* tashkeel + tatweel */
      .replace(/[أإآٱ]/g,"ا")                       /* unify alef */
      .replace(/ى/g,"ي")                            /* alef maksura → ya */
      .replace(/ة/g,"ه")                            /* ta marbuta → ha */
      .trim();
    const q=normAr(filterSearchDeb);
    const qNum=filterSearchDeb.replace(/[^\d.]/g,"");/* extract digits for amount match */
    filtered=filtered.filter(t=>{
      /* Look up party name from linked IDs */
      let partyName="";
      if(t.empId){const p=(data.employees||[]).find(e=>e.id===t.empId);if(p)partyName=p.name||"";}
      if(!partyName&&t.custId){const p=customers.find(c=>c.id===t.custId);if(p)partyName=p.name||"";}
      if(!partyName&&t.supplierId){const p=suppliers.find(s=>s.id===t.supplierId);if(p)partyName=p.name||"";}
      if(!partyName&&t.wsName)partyName=t.wsName;
      if(!partyName&&t.empName)partyName=t.empName;
      if(!partyName&&t.custName)partyName=t.custName;
      if(!partyName&&t.supplierName)partyName=t.supplierName;
      return normAr(t.desc).includes(q)
        ||normAr(t.notes).includes(q)
        ||normAr(t.category).includes(q)
        ||normAr(partyName).includes(q)
        ||(qNum!==""&&String(t.amount||"").includes(qNum));
    });
  }

  /* Running balance for filtered view */
  const withBalance=useMemo(()=>{
    const sorted=[...filtered].reverse();let bal=0;
    const result=sorted.map(t=>{if(t.type==="in")bal+=(Number(t.amount)||0);else bal-=(Number(t.amount)||0);return{...t,runBal:bal}});
    return result.reverse()},[filtered]);

  /* ── Category analysis ── */
  const catAnalysis=useMemo(()=>{
    const cats={};txns.forEach(t=>{const c=t.category||"بدون تصنيف";if(!cats[c])cats[c]={in:0,out:0,count:0};
      if(t.type==="in")cats[c].in+=(Number(t.amount)||0);else cats[c].out+=(Number(t.amount)||0);cats[c].count++});
    return Object.entries(cats).sort((a,b)=>(b[1].in+b[1].out)-(a[1].in+a[1].out))},[txns]);

  /* ── CRUD ── */
  const saveTx=()=>{const amt=parseFloat(txAmount);if(!amt||amt<=0){playBeep("error");return}
    /* Block save on locked day unless admin */
    if(isDayLocked(txDate)&&!isAdmin){playBeep("error");showToast("⛔ اليوم "+txDate+" مقفول — للمدير فقط");return}
    /* If party is linked, validate & expand desc */
    let finalDesc=txDesc;
    let linkedCustId=null,linkedSupplierId=null,linkedWsName=null,linkedEmpId=null;
    if(txPartyId&&txPartyType==="customer"){const c=customers.find(x=>x.id===txPartyId);if(c){linkedCustId=c.id;if(!finalDesc.trim())finalDesc="دفعة من "+c.name}}
    if(txPartyId&&txPartyType==="supplier"){const s=suppliers.find(x=>x.id===txPartyId);if(s){linkedSupplierId=s.id;if(!finalDesc.trim())finalDesc="دفع لـ "+s.name}}
    if(txPartyId&&txPartyType==="workshop"){const w=workshops.find(x=>x.id===txPartyId||x.name===txPartyId);if(w){linkedWsName=w.name;if(!finalDesc.trim())finalDesc=wsDesc(w.name,txCategory==="مشتريات")}}
    if(txPartyId&&txPartyType==="employee"){const e=(data.employees||[]).find(x=>x.id===txPartyId);if(e){linkedEmpId=e.id;if(!finalDesc.trim())finalDesc="سلفة "+e.name}}
    /* V18.35: capture freshly-built treasury entry for post-commit auto-posting */
    let _newBaseEntry=null;
    upConfig(d=>{if(!d.treasury)d.treasury=[];
      if(editId){const tx=d.treasury.find(t=>t.id===editId);
        if(tx){
          /* V17.3 FIX: Capture old empId BEFORE overwriting it, so we can sync hrLog */
          const oldEmpId=tx.empId;
          const oldHrLogId=tx.hrLogId;
          const oldSourceType=tx.sourceType;
          tx.type=txType;tx.amount=amt;tx.desc=finalDesc;tx.notes=txNotes;tx.category=txCategory;tx.account=txAccount;tx.season=txSeason;tx.date=txDate;tx.custId=linkedCustId;tx.supplierId=linkedSupplierId;tx.empId=linkedEmpId;tx.updatedBy=userName;tx.updatedAt=new Date().toISOString();
          /* Sync linked wsPayment if exists */
          if(tx.wsPaymentId){const wp=(d.wsPayments||[]).find(p=>p.id===tx.wsPaymentId);if(wp){wp.amount=amt;wp.notes=txNotes;wp.date=txDate;wp.type=txCategory==="مشتريات"?"purchase":"payment"}}
          /* V17.3 FIX: Sync linked hrLog if this was an advance.
             Three cases:
             1. Was advance + still has same employee: update hrLog amount/date/desc
             2. Was advance + employee removed/changed: delete old hrLog, create new if new emp
             3. Was NOT advance + now has employee: create new hrLog (handled below) */
          if(oldHrLogId&&d.hrLog){
            const oldLog=d.hrLog.find(l=>l.id===oldHrLogId);
            if(oldLog){
              if(linkedEmpId===oldEmpId&&txType==="out"){
                /* Same employee — just update */
                const emp=(d.employees||[]).find(x=>x.id===linkedEmpId);
                oldLog.amount=amt;
                oldLog.empName=emp?emp.name:oldLog.empName;
                oldLog.desc=txNotes||finalDesc||oldLog.desc;
                oldLog.date=txDate;
              }else{
                /* Employee changed or removed — delete old hrLog */
                d.hrLog=d.hrLog.filter(l=>l.id!==oldHrLogId);
                /* And clear the now-stale link from tx */
                delete tx.hrLogId;
                if(oldSourceType==="hr_advance")delete tx.sourceType;
              }
            }
          }
          /* V16.68: Sync custPayments / supplierPayments on edit too */
          if(d.custPayments)d.custPayments=d.custPayments.filter(p=>p.treasuryTxId!==editId);
          if(d.supplierPayments)d.supplierPayments=d.supplierPayments.filter(p=>p.treasuryTxId!==editId);
          if(linkedCustId&&txType==="in"){
            if(!d.custPayments)d.custPayments=[];
            const c=customers.find(x=>x.id===linkedCustId);
            d.custPayments.push({id:gid(),custId:linkedCustId,custName:c?c.name:"",amount:amt,date:txDate,note:txNotes||finalDesc,method:"كاش",by:userName,treasuryTxId:editId,createdAt:new Date().toISOString()});
          }
          if(linkedSupplierId&&txType==="out"){
            if(!d.supplierPayments)d.supplierPayments=[];
            const s=suppliers.find(x=>x.id===linkedSupplierId);
            d.supplierPayments.push({id:gid(),supplierId:linkedSupplierId,supplierName:s?s.name:"",amount:amt,date:txDate,note:txNotes||finalDesc,method:"كاش",by:userName,treasuryTxId:editId,createdAt:new Date().toISOString()});
          }
          /* V17.3 FIX: If the edit added an employee link (was no advance, now is one), create hrLog */
          if(linkedEmpId&&txType==="out"&&!tx.hrLogId&&linkedEmpId!==oldEmpId){
            if(!d.hrLog)d.hrLog=[];
            const emp=(d.employees||[]).find(x=>x.id===linkedEmpId);
            const logId=gid();
            d.hrLog.unshift({id:logId,type:"advance",empId:linkedEmpId,empName:emp?emp.name:"",amount:amt,desc:txNotes||finalDesc||"سلفة",weekId:"",date:txDate,by:userName,createdAt:new Date().toISOString()});
            tx.sourceType="hr_advance";tx.hrLogId=logId;
          }
        }}
      else{
        const txId=gid();
        const baseEntry={id:txId,type:txType,amount:amt,desc:finalDesc,notes:txNotes,category:txCategory,account:txAccount,season:txSeason,date:txDate,day:dayName(txDate),custId:linkedCustId,supplierId:linkedSupplierId,empId:linkedEmpId,by:userName,createdAt:new Date().toISOString()};
        /* Auto-link to customer payments if customer selected */
        if(linkedCustId&&txType==="in"){if(!d.custPayments)d.custPayments=[];
          const c=customers.find(x=>x.id===linkedCustId);
          d.custPayments.push({id:gid(),custId:linkedCustId,custName:c?c.name:"",amount:amt,date:txDate,note:txNotes||finalDesc,method:"كاش",by:userName,treasuryTxId:txId,createdAt:new Date().toISOString()})}
        /* Auto-link to supplier payments */
        if(linkedSupplierId&&txType==="out"){if(!d.supplierPayments)d.supplierPayments=[];
          const s=suppliers.find(x=>x.id===linkedSupplierId);
          d.supplierPayments.push({id:gid(),supplierId:linkedSupplierId,supplierName:s?s.name:"",amount:amt,date:txDate,note:txNotes||finalDesc,method:"كاش",by:userName,treasuryTxId:txId,createdAt:new Date().toISOString()})}
        /* Auto-link to employee advance (hrLog) */
        if(linkedEmpId&&txType==="out"){if(!d.hrLog)d.hrLog=[];
          const emp=(d.employees||[]).find(x=>x.id===linkedEmpId);
          const logId=gid();
          d.hrLog.unshift({id:logId,type:"advance",empId:linkedEmpId,empName:emp?emp.name:"",amount:amt,desc:txNotes||finalDesc||"سلفة",weekId:"",date:txDate,by:userName,createdAt:new Date().toISOString()});
          baseEntry.sourceType="hr_advance";baseEntry.hrLogId=logId}
        /* Auto-link to workshop payments */
        if(linkedWsName&&txType==="out"){if(!d.wsPayments)d.wsPayments=[];
          const w=workshops.find(x=>x.name===linkedWsName);const wsPayId=gid();
          d.wsPayments.push({id:wsPayId,wsName:linkedWsName,wsId:w?w.id:null,amount:amt,type:txCategory==="مشتريات"?"purchase":"payment",notes:txNotes,date:txDate,createdBy:userName,treasuryTxId:txId,createdAt:new Date().toISOString()});
          baseEntry.wsPaymentId=wsPayId;baseEntry.wsName=linkedWsName;baseEntry.sourceType="ws_payment"}
        d.treasury.unshift(baseEntry);
        /* V18.35: stash for post-commit auto-posting */
        _newBaseEntry=baseEntry;
      }});
    /* V18.35: auto-post journal entry for the new treasury row.
       We do this AFTER upConfig commits — uses fresh entry object built above.
       Only fires for plain treasury entries (not the linked ones — those
       have specific posting rules handled by their own hooks). */
    if(_newBaseEntry && !_newBaseEntry.sourceType){
      autoPost.treasury(data, _newBaseEntry, userName).catch(()=>{});
    }
    setShowForm(false);setTxAmount("");setTxDesc("");setTxNotes("");setTxCategory("");setTxType("in");setTxPartyId("");setTxPartyType("");setEditId(null);showToast("✓ تم الحفظ")};
  /* Detect treasury entries that were auto-created from an external source
     (salary approval, check collection/payment, advance, transfer, workshop payment).
     These entries should NOT be directly deletable from treasury — go to source. */
  const isExternalTx=(t)=>{
    if(!t)return false;
    if(t.sourceType)return true;/* explicit marker if added later */
    if(t.transferId)return true;/* transfer */
    if(t.checkId)return true;/* check */
    if(t.hrLogId)return true;/* advance/salary linked */
    /* Legacy detection by desc */
    const d=t.desc||"";
    if(/^مرتبات W\d+/.test(d))return true;/* salary approval */
    if(/^دفعة مرتبات W\d+/.test(d))return true;
    if(/^سلفة /.test(d))return true;/* old advances without hrLogId */
    if(/^تحصيل شيك |^صرف شيك /.test(d))return true;
    if(/^تحويل إلى |^تحويل من /.test(d))return true;
    if(/^دفعة ورش[هة] |^مشتريات ورش[هة] /.test(d))return true;
    return false};
  const externalSourceLabel=(t)=>{
    if(t.transferId)return"تحويل بين الخزن";
    if(t.checkId)return"تحصيل/صرف شيك";
    const d=t.desc||"";
    if(/^مرتبات W|^دفعة مرتبات W/.test(d))return"اعتماد أسبوع مرتبات";
    if(/^سلفة /.test(d))return"سلفة موظف";
    if(/^تحصيل شيك |^صرف شيك /.test(d))return"شيك";
    if(/^تحويل /.test(d))return"تحويل";
    if(/^دفعة ورش[هة] |^مشتريات ورش[هة] /.test(d))return"دفعة ورشة";
    return"حركة خارجية"};

  const delTx=(id)=>{
    /* V15.9: Block deletion of HR salary transactions — they're bound to week prevBalance.
       User must use "delete week" in HR page which handles prevBalance restoration.
       V16.65: Now also blocks any externally-linked tx via dataIntegrity.
       The user is shown a clear message naming the source (check / hr advance /
       transfer / receipt) and where to delete from instead. Cascade-delete used
       to silently take down child records — that's data the user couldn't see
       disappearing. Now they have to delete from the source side, which keeps
       both sides consistent. */
    const txCheck=(data.treasury||[]).find(t=>t.id===id);
    if(txCheck&&txCheck.sourceType==="hr_salary"){
      showToast("⛔ لا يمكن حذف مرتب من هنا — احذف الأسبوع من صفحة الموظفين");
      return;
    }
    const refs=getReferences(data,"treasuryTransaction",id);
    if(refs.length>0){
      const msg="هذه الحركة مرتبطة بـ:\n"+refs.map(r=>"• "+r.label).join("\n")+"\n\nاحذفها من المصدر الأصلي بدلاً من هنا.";
      openConfirm({title:"⛔ حركة مرتبطة",message:msg,variant:"danger",onConfirm:()=>{}});
      return;
    }
    /* V16.2: Snapshot for undo — capture arrays that will be modified */
    const _snap={
      treasury:JSON.parse(JSON.stringify(data.treasury||[])),
      custPayments:JSON.parse(JSON.stringify(data.custPayments||[])),
      supplierPayments:JSON.parse(JSON.stringify(data.supplierPayments||[])),
      wsPayments:JSON.parse(JSON.stringify(data.wsPayments||[])),
      hrLog:JSON.parse(JSON.stringify(data.hrLog||[])),
      treasuryTransfers:JSON.parse(JSON.stringify(data.treasuryTransfers||[])),
    };
    const _label="حذف حركة: "+(txCheck?.desc||"غير معروف").slice(0,40)+(txCheck?.amount?" ("+Number(txCheck.amount).toLocaleString()+" ج)":"");
    upConfig(d=>{
    /* Remove linked cust/supplier/ws payments + hrLog advances */
    const tx=(d.treasury||[]).find(t=>t.id===id);
    /* V16.9: If this tx is part of a transfer, delete BOTH legs + the transfer record */
    if(tx&&tx.transferId){
      /* V17.5 FIX: Cascade-clean linked records from BOTH transfer legs (out + in).
         Previously the cleanup below only used `id` (the single tx the user clicked),
         missing any linked records on the OTHER leg. Internal transfers rarely have
         such links, but it's possible if a tx category was misset and later corrected.
         Capture both legs' ids before deleting the treasury entries. */
      const transferLegIds=(d.treasury||[]).filter(t=>t.transferId===tx.transferId).map(t=>t.id);
      d.treasury=(d.treasury||[]).filter(t=>t.transferId!==tx.transferId);
      d.treasuryTransfers=(d.treasuryTransfers||[]).filter(tf=>tf.id!==tx.transferId);
      d.notifications=(d.notifications||[]).filter(n=>n.transferId!==tx.transferId);
      /* Cascade cleanup for both legs */
      if(d.custPayments)d.custPayments=d.custPayments.filter(p=>!transferLegIds.includes(p.treasuryTxId));
      if(d.supplierPayments)d.supplierPayments=d.supplierPayments.filter(p=>!transferLegIds.includes(p.treasuryTxId));
      if(d.wsPayments)d.wsPayments=d.wsPayments.filter(p=>!transferLegIds.includes(p.treasuryTxId));
    }else{
      d.treasury=(d.treasury||[]).filter(t=>t.id!==id);
      if(tx){if(d.custPayments)d.custPayments=d.custPayments.filter(p=>p.treasuryTxId!==id);
        if(d.supplierPayments)d.supplierPayments=d.supplierPayments.filter(p=>p.treasuryTxId!==id);
        if(d.wsPayments)d.wsPayments=d.wsPayments.filter(p=>p.treasuryTxId!==id);
      }
    }
    if(tx){
      /* Remove linked hrLog advance entry */
      if(tx.hrLogId&&d.hrLog)d.hrLog=d.hrLog.filter(l=>l.id!==tx.hrLogId);
      /* V17.1 FIX #11: For legacy advances without hrLogId, delete ONLY the first match
         (not all matches). The previous logic deleted ALL matching advances, which would
         wipe multiple legitimate advances if an employee had two same-amount advances on
         the same day (e.g. 500 EGP for food + 500 EGP for fuel). */
      if(tx.sourceType==="hr_advance"&&tx.empId&&!tx.hrLogId&&d.hrLog){
        const matchIdx=d.hrLog.findIndex(l=>l.type==="advance"&&l.empId===tx.empId&&l.date===tx.date&&Math.abs((Number(l.amount)||0)-(Number(tx.amount)||0))<0.01);
        if(matchIdx>=0){
          d.hrLog=d.hrLog.filter((_,i)=>i!==matchIdx);
        }
      }}});
    /* V16.2: Push undo AFTER the mutation */
    pushUndo({
      label:_label,
      icon:"💰",
      category:"treasury",
      onUndo:async()=>{
        upConfig(d=>{
          d.treasury=_snap.treasury;
          d.custPayments=_snap.custPayments;
          d.supplierPayments=_snap.supplierPayments;
          d.wsPayments=_snap.wsPayments;
          d.hrLog=_snap.hrLog;
          d.treasuryTransfers=_snap.treasuryTransfers;
        });
      }
    });
    showToast(txCheck&&txCheck.transferId?"✓ تم حذف التحويل بالكامل":"✓ تم الحذف")};
  /* Bulk delete multiple transactions — respects day lock + audit log */
  const bulkDeleteTxs=(ids)=>{
    if(!ids||ids.length===0)return;
    /* Global delete lock check (non-admin only) */
    if(lockDelete&&!isAdmin){showToast("🔒 الحذف مقفول من الإعدادات");return}
    /* V15.9: Filter out salary transactions — they must be deleted via week removal */
    const salaryCount=(data.treasury||[]).filter(t=>ids.includes(t.id)&&t.sourceType==="hr_salary").length;
    if(salaryCount>0){
      showToast("⛔ "+salaryCount+" مرتب محمي — احذف الأسبوع من صفحة الموظفين");
      ids=ids.filter(id=>{const t=(data.treasury||[]).find(x=>x.id===id);return !t||t.sourceType!=="hr_salary"});
      if(ids.length===0)return;
    }
    upConfig(d=>{
      const toDelete=(d.treasury||[]).filter(t=>ids.includes(t.id));
      let deletedCount=0,skippedCount=0,totalAmount=0,adminBypassCount=0;
      /* V16.9: Track transferIds to remove (so we delete the transfer record + paired leg only once) */
      const transferIdsToDelete=new Set();
      toDelete.forEach(tx=>{
        /* Skip if day is locked and user is not admin */
        if(isDayLocked(tx.date)&&!isAdmin){skippedCount++;return}
        /* Track admin bypass of delete lock */
        if(isAdmin&&lockDelete)adminBypassCount++;
        /* V16.9: If this tx is part of a transfer, mark transferId for full removal */
        if(tx.transferId){
          transferIdsToDelete.add(tx.transferId);
        }else{
          d.treasury=(d.treasury||[]).filter(t=>t.id!==tx.id);
        }
        if(d.custPayments)d.custPayments=d.custPayments.filter(p=>p.treasuryTxId!==tx.id);
        if(d.supplierPayments)d.supplierPayments=d.supplierPayments.filter(p=>p.treasuryTxId!==tx.id);
        if(d.wsPayments)d.wsPayments=d.wsPayments.filter(p=>p.treasuryTxId!==tx.id);
        if(tx.hrLogId&&d.hrLog)d.hrLog=d.hrLog.filter(l=>l.id!==tx.hrLogId);
        /* V17.3 FIX: Same as single-delete (V17.1 FIX #11) — delete ONLY the first match,
           not all matches. Previous bulk-delete logic deleted ALL matching advances, which
           would wipe multiple legitimate same-amount-same-day advances. */
        if(tx.sourceType==="hr_advance"&&tx.empId&&!tx.hrLogId&&d.hrLog){
          const matchIdx=d.hrLog.findIndex(l=>l.type==="advance"&&l.empId===tx.empId&&l.date===tx.date&&Math.abs((Number(l.amount)||0)-(Number(tx.amount)||0))<0.01);
          if(matchIdx>=0){
            d.hrLog=d.hrLog.filter((_,i)=>i!==matchIdx);
          }
        }
        deletedCount++;totalAmount+=Number(tx.amount)||0;
      });
      /* V16.9: Now batch-remove all transfer records + their paired legs */
      if(transferIdsToDelete.size>0){
        /* V17.5 FIX: Cleanup linked records (custPayments/supplierPayments/wsPayments)
           for the OTHER transfer leg before we delete the treasury entries.
           When the user only selects ONE leg of a transfer for bulk delete, the loop
           above only cleans linked records for that one tx. The OTHER leg's linked
           records would be orphaned. Find all transfer legs (by transferId) and clean
           their linked records too. */
        const allTransferLegIds=(d.treasury||[]).filter(t=>t.transferId&&transferIdsToDelete.has(t.transferId)).map(t=>t.id);
        if(d.custPayments)d.custPayments=d.custPayments.filter(p=>!allTransferLegIds.includes(p.treasuryTxId));
        if(d.supplierPayments)d.supplierPayments=d.supplierPayments.filter(p=>!allTransferLegIds.includes(p.treasuryTxId));
        if(d.wsPayments)d.wsPayments=d.wsPayments.filter(p=>!allTransferLegIds.includes(p.treasuryTxId));
        d.treasury=(d.treasury||[]).filter(t=>!t.transferId||!transferIdsToDelete.has(t.transferId));
        d.treasuryTransfers=(d.treasuryTransfers||[]).filter(tf=>!transferIdsToDelete.has(tf.id));
        if(d.notifications)d.notifications=d.notifications.filter(n=>!n.transferId||!transferIdsToDelete.has(n.transferId));
      }
      /* Audit log: bulk delete */
      if(deletedCount>0&&typeof addAudit==="function"){
        addAudit(d,{category:"settings",action:"bulk_delete_journal",
          target:"اليومية",oldValue:deletedCount+" حركة",
          newValue:"إجمالي: "+fmt0(totalAmount)+" ج.م",
          user:userName,severity:"danger",
          notes:"🗑️ حذف مجمع من سجل اليومية"+(skippedCount>0?" ("+skippedCount+" تم تخطيها لقفل اليوم)":"")+(adminBypassCount>0?" — ⚠️ تجاوز قفل الحذف لـ "+adminBypassCount+" حركة":"")});
      }
      /* Separate audit entry for lock bypass (security category) */
      if(adminBypassCount>0){
        if(!Array.isArray(d.auditLog))d.auditLog=[];
        d.auditLog.unshift({
          id:Math.random().toString(36).slice(2)+Date.now(),
          category:"security",
          action:"lock_bypass",
          target:"treasury_delete",
          oldValue:"مقفول من الإعدادات",
          newValue:"حذف "+adminBypassCount+" حركة بواسطة مدير",
          notes:"إجمالي المبالغ: "+fmt0(totalAmount)+" ج.م",
          by:userEmail,
          at:new Date().toISOString()
        });
      }
      if(skippedCount>0)showToast("⚠️ "+deletedCount+" حذف • "+skippedCount+" متخطي (أيام مقفولة)");
      else showToast("✓ تم حذف "+deletedCount+" حركة");
    });
    setSelectedTxIds(new Set());
  };
  const editTx=(t)=>{setEditId(t.id);setTxType(t.type);setTxAmount(String(t.amount));setTxDesc(t.desc||"");setTxNotes(t.notes||"");setTxCategory(t.category||"");setTxAccount(t.account||"MAIN CASH");setTxSeason(t.season||"");setTxDate(t.date||today);
    setTxPartyId(t.custId||t.supplierId||t.wsName||"");
    setTxPartyType(t.custId?"customer":t.supplierId?"supplier":t.wsName?"workshop":"");
    setShowForm(true)};
  const addAccount=()=>{if(!newAccName.trim())return;
    upConfig(d=>{if(!d.treasuryAccounts)d.treasuryAccounts=[];
      /* Migrate old strings */
      d.treasuryAccounts=d.treasuryAccounts.map(a=>typeof a==="string"?{id:a,name:a,ownerEmail:"",type:"cash"}:a);
      if(editAccId){const i=d.treasuryAccounts.findIndex(a=>a.id===editAccId);
        if(i>=0){d.treasuryAccounts[i].name=newAccName.trim();d.treasuryAccounts[i].ownerEmail=newAccOwner.trim()}}
      else{if(!d.treasuryAccounts.find(a=>a.name===newAccName.trim()))
        d.treasuryAccounts.push({id:newAccName.trim(),name:newAccName.trim(),ownerEmail:newAccOwner.trim(),type:"cash"})}});
    setNewAccName("");setNewAccOwner("");setEditAccId(null);showToast("✓ تمت الإضافة")};
  const editAccount=(a)=>{setEditAccId(a.id);setNewAccName(a.name);setNewAccOwner(a.ownerEmail||"")};
  const delAccount=(id)=>{if(txns.some(t=>t.account===id||(accountsData.find(a=>a.id===id)||{}).name===t.account)){playBeep("error");showToast("⛔ لا يمكن الحذف — يوجد حركات مرتبطة");return}
    upConfig(d=>{if(d.treasuryAccounts)d.treasuryAccounts=d.treasuryAccounts.filter(a=>(typeof a==="string"?a:a.id)!==id)});showToast("✓ تم الحذف")};

  /* V18.0: Banks list management — banks used in checks form (auto-suggested in dropdown) */
  const banksList=Array.isArray(data.banks)?data.banks:[];
  const addBank=()=>{const n=newBankName.trim();if(!n)return;
    upConfig(d=>{if(!Array.isArray(d.banks))d.banks=[];
      if(editBankIdx!=null){d.banks[editBankIdx]=n}
      else if(!d.banks.includes(n))d.banks.push(n)});
    setNewBankName("");setEditBankIdx(null);showToast("✓ تم الحفظ")};
  const editBank=(idx)=>{setEditBankIdx(idx);setNewBankName(banksList[idx]||"")};
  const delBank=(idx)=>{const bankName=banksList[idx];if(!bankName)return;
    /* Block delete if any check uses this bank */
    if((data.checks||[]).some(c=>(c.bank||"")===bankName)){
      playBeep("error");showToast("⛔ لا يمكن الحذف — يوجد شيكات مسجلة على هذا البنك");return}
    upConfig(d=>{if(Array.isArray(d.banks))d.banks=d.banks.filter((_,i)=>i!==idx)});
    showToast("✓ تم الحذف")};

  /* ── Transfer between accounts ──
     V16.13: Non-admin requests go through approval. Admin transfers stay
     auto-confirmed. A pending transfer creates NO treasury entries until
     the admin approves it; rejection deletes the request. */
  const submitTransfer=()=>{const amt=parseFloat(tfAmount);
    if(!tfFrom||!tfTo){showToast("⚠️ اختر الخزنة المصدر والهدف");return}
    if(tfFrom===tfTo){showToast("⛔ لا يمكن التحويل لنفس الخزنة");return}
    if(!amt||amt<=0){showToast("⚠️ أدخل المبلغ");return}
    const toAcc=accountsData.find(a=>a.name===tfTo);
    const tfId=gid();
    const d_=tfDate||new Date().toISOString().split("T")[0];
    const dayN=dayName(d_);
    const isPending=!isAdmin;/* non-admin → needs approval */
    upConfig(d=>{
      if(!d.treasuryTransfers)d.treasuryTransfers=[];
      if(!d.treasury)d.treasury=[];
      if(!d.notifications)d.notifications=[];
      /* Create transfer record */
      d.treasuryTransfers.unshift({
        id:tfId,fromAccount:tfFrom,toAccount:tfTo,amount:amt,note:tfNote||"",
        status:isPending?"pending":"confirmed",
        sentBy:userName,sentByEmail:userEmail,sentAt:new Date().toISOString(),
        date:d_,toOwnerEmail:toAcc?.ownerEmail||""
      });
      if(isPending){
        /* No treasury entries yet — just an admin notification */
        d.notifications.unshift({
          id:gid(),type:"transfer_pending",
          msg:"⏳ طلب تحويل جديد بانتظار موافقتك: "+fmt(amt)+" ج.م من "+tfFrom+" → "+tfTo+" • طلبه: "+userName,
          adminOnly:true,transferId:tfId,read:false,by:userName,createdAt:new Date().toISOString()
        });
      }else{
        /* Admin: immediate double-entry */
        d.treasury.unshift({id:gid(),type:"out",amount:amt,desc:"تحويل إلى "+tfTo+(tfNote?" — "+tfNote:""),notes:"",category:"تحويل داخلي",account:tfFrom,season:d.activeSeason||"",date:d_,day:dayN,transferId:tfId,by:userName,createdAt:new Date().toISOString()});
        d.treasury.unshift({id:gid(),type:"in",amount:amt,desc:"تحويل من "+tfFrom+(tfNote?" — "+tfNote:""),notes:"",category:"تحويل داخلي",account:tfTo,season:d.activeSeason||"",date:d_,day:dayN,transferId:tfId,by:userName,createdAt:new Date().toISOString()});
        if(toAcc?.ownerEmail){d.notifications.unshift({id:gid(),type:"treasury_transfer",msg:"💸 وصلك تحويل "+fmt(amt)+" ج.م من "+tfFrom+(tfNote?" — "+tfNote:""),toEmail:toAcc.ownerEmail,transferId:tfId,read:false,by:userName,createdAt:new Date().toISOString()})}
      }
    });
    setShowTransfer(false);setTfFrom("");setTfTo("");setTfAmount("");setTfNote("");setTfDate("");
    showToast(isPending?"⏳ تم إرسال الطلب — بانتظار موافقة المدير":"✓ تم التحويل — منصرف من "+tfFrom+" ووارد في "+tfTo)};

  /* V16.13: Admin approves a pending transfer → creates the double-entry */
  const approveTransfer=(tfId)=>{if(!isAdmin)return;
    upConfig(d=>{
      const tf=(d.treasuryTransfers||[]).find(t=>t.id===tfId);
      if(!tf||tf.status!=="pending")return;
      const dayN=dayName(tf.date);
      const toAcc=(d.treasuryAccounts||[]).find(a=>(typeof a==="string"?a:a.name)===tf.toAccount);
      tf.status="confirmed";
      tf.approvedBy=userName;tf.approvedByEmail=userEmail;tf.approvedAt=new Date().toISOString();
      if(!d.treasury)d.treasury=[];
      d.treasury.unshift({id:gid(),type:"out",amount:tf.amount,desc:"تحويل إلى "+tf.toAccount+(tf.note?" — "+tf.note:""),notes:"",category:"تحويل داخلي",account:tf.fromAccount,season:d.activeSeason||"",date:tf.date,day:dayN,transferId:tf.id,by:tf.sentBy||userName,createdAt:new Date().toISOString()});
      d.treasury.unshift({id:gid(),type:"in",amount:tf.amount,desc:"تحويل من "+tf.fromAccount+(tf.note?" — "+tf.note:""),notes:"",category:"تحويل داخلي",account:tf.toAccount,season:d.activeSeason||"",date:tf.date,day:dayN,transferId:tf.id,by:tf.sentBy||userName,createdAt:new Date().toISOString()});
      /* Mark pending notif as read; notify requester of approval */
      (d.notifications||[]).forEach(n=>{if(n.transferId===tf.id&&n.type==="transfer_pending")n.read=true});
      if(!d.notifications)d.notifications=[];
      if(tf.sentByEmail){d.notifications.unshift({id:gid(),type:"transfer_approved",msg:"✅ تمت الموافقة على تحويلك "+fmt(tf.amount)+" ج.م من "+tf.fromAccount+" → "+tf.toAccount,toEmail:tf.sentByEmail,transferId:tf.id,read:false,by:userName,createdAt:new Date().toISOString()})}
      if(toAcc&&typeof toAcc==="object"&&toAcc.ownerEmail){d.notifications.unshift({id:gid(),type:"treasury_transfer",msg:"💸 وصلك تحويل "+fmt(tf.amount)+" ج.م من "+tf.fromAccount+(tf.note?" — "+tf.note:""),toEmail:toAcc.ownerEmail,transferId:tf.id,read:false,by:userName,createdAt:new Date().toISOString()})}
    });
    showToast("✅ تم تأكيد التحويل")};

  /* V16.13: Admin rejects a pending transfer → deletes the request */
  const rejectTransfer=(tfId)=>{if(!isAdmin)return;
    upConfig(d=>{
      const tf=(d.treasuryTransfers||[]).find(t=>t.id===tfId);
      if(!tf||tf.status!=="pending")return;
      d.treasuryTransfers=(d.treasuryTransfers||[]).filter(t=>t.id!==tfId);
      (d.notifications||[]).forEach(n=>{if(n.transferId===tfId&&n.type==="transfer_pending")n.read=true});
      if(!d.notifications)d.notifications=[];
      if(tf.sentByEmail){d.notifications.unshift({id:gid(),type:"transfer_rejected",msg:"❌ تم رفض طلب التحويل: "+fmt(tf.amount)+" ج.م من "+tf.fromAccount+" → "+tf.toAccount,toEmail:tf.sentByEmail,transferId:tfId,read:false,by:userName,createdAt:new Date().toISOString()})}
    });
    showToast("✓ تم رفض الطلب")};
  /* V16.26: Edit a confirmed transfer — updates the transfer record AND
     both treasury legs (out from source, in to target) atomically.
     The desc strings are regenerated from current accounts so they stay
     consistent with the new from/to. day is recomputed from new date. */
  const editTransferSave=()=>{
    if(!editTf)return;
    const amt=parseFloat(editTf.amount);
    if(!editTf.fromAccount||!editTf.toAccount){showToast("⚠️ اختر الخزنة المصدر والهدف");return}
    if(editTf.fromAccount===editTf.toAccount){showToast("⛔ لا يمكن التحويل لنفس الخزنة");return}
    if(!amt||amt<=0){showToast("⚠️ أدخل مبلغ صحيح");return}
    if(!editTf.date){showToast("⚠️ أدخل التاريخ");return}
    const dayN=dayName(editTf.date);
    upConfig(d=>{
      const tf=(d.treasuryTransfers||[]).find(t=>t.id===editTf.id);
      if(!tf)return;
      tf.fromAccount=editTf.fromAccount;
      tf.toAccount=editTf.toAccount;
      tf.amount=amt;
      tf.note=editTf.note||"";
      tf.date=editTf.date;
      tf.editedBy=userName;
      tf.editedAt=new Date().toISOString();
      /* Sync both treasury legs */
      (d.treasury||[]).forEach(t=>{
        if(t.transferId!==editTf.id)return;
        t.amount=amt;
        t.date=editTf.date;
        t.day=dayN;
        if(t.type==="out"){
          t.account=editTf.fromAccount;
          t.desc="تحويل إلى "+editTf.toAccount+(editTf.note?" — "+editTf.note:"");
        }else if(t.type==="in"){
          t.account=editTf.toAccount;
          t.desc="تحويل من "+editTf.fromAccount+(editTf.note?" — "+editTf.note:"");
        }
      });
    });
    setEditTf(null);
    showToast("✓ تم تعديل التحويل وحركاته في السجلين");
  };
  /* Delete a transfer — removes both entries */
  const deleteTransfer=(tfId)=>{const tf=transfers.find(t=>t.id===tfId);if(!tf)return;
    upConfig(d=>{
      /* V17.5 FIX: cascade-cleanup linked records (custPayments/supplierPayments/wsPayments)
         on both transfer legs before deleting the treasury entries. */
      const transferLegIds=(d.treasury||[]).filter(t=>t.transferId===tfId).map(t=>t.id);
      if(d.custPayments)d.custPayments=d.custPayments.filter(p=>!transferLegIds.includes(p.treasuryTxId));
      if(d.supplierPayments)d.supplierPayments=d.supplierPayments.filter(p=>!transferLegIds.includes(p.treasuryTxId));
      if(d.wsPayments)d.wsPayments=d.wsPayments.filter(p=>!transferLegIds.includes(p.treasuryTxId));
      d.treasuryTransfers=(d.treasuryTransfers||[]).filter(t=>t.id!==tfId);
      d.treasury=(d.treasury||[]).filter(t=>t.transferId!==tfId);
      d.notifications=(d.notifications||[]).filter(n=>n.transferId!==tfId);
    });
    showToast("✓ تم حذف التحويل وإلغاء حركاته")};
  /* Keep old function names for backwards compat in the UI that calls them */
  const confirmTransfer=(tfId)=>{/* no-op now — transfers are already confirmed */};
  const cancelTransfer=deleteTransfer;

  /* ── V15.44: Shared professional print styles — compact accounting-report look ── */
  const _printStyles=`@page{size:A4;margin:12mm 10mm}
    *{box-sizing:border-box}
    body{font-family:'Cairo',sans-serif;font-size:10px;padding:0;margin:0;line-height:1.45;color:#1E293B}
    .brand-bar{height:3px;background:linear-gradient(90deg,#0EA5E9,#8B5CF6);margin-bottom:10px}
    .hdr{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:8px;border-bottom:1px solid #CBD5E1;margin-bottom:10px}
    .hdr-left .title{font-size:14px;font-weight:800;color:#0F172A;letter-spacing:0.2px}
    .hdr-left .subtitle{font-size:10px;color:#64748B;margin-top:2px;font-weight:600}
    .hdr-right{text-align:left;font-size:9px;color:#64748B;line-height:1.5}
    .hdr-right b{color:#334155;font-weight:700}
    .summary{display:flex;gap:6px;justify-content:space-between;margin:10px 0;flex-wrap:wrap}
    .sbox{flex:1;padding:6px 10px;border-radius:4px;border:1px solid #E2E8F0;background:#F8FAFC;min-width:120px}
    .sbox .lbl{font-size:8.5px;color:#64748B;margin-bottom:1px;font-weight:600}
    .sbox .val{font-size:12px;font-weight:800;letter-spacing:0.2px}
    .sbox.hl{border-color:#0EA5E9;background:#F0F9FF}
    .sbox.hl .val{color:#0369A1}
    .green{color:#059669}.red{color:#DC2626}.blue{color:#0284C7}
    table{width:100%;border-collapse:collapse;margin:8px 0;font-size:9.5px}
    thead{display:table-header-group}
    th{background:#F1F5F9;color:#334155;font-weight:700;padding:5px 6px;text-align:right;border-bottom:1.5px solid #94A3B8;font-size:9.5px;white-space:nowrap}
    td{padding:3px 6px;border-bottom:1px solid #F1F5F9;text-align:right;vertical-align:middle;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.3}
    td.wrap{white-space:normal;overflow:visible;text-overflow:clip}
    tr:hover td{background:#F8FAFC}
    .num{font-family:'Cairo',sans-serif;font-weight:700;font-variant-numeric:tabular-nums}
    .muted{color:#94A3B8;font-size:8.5px}
    .accounts-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;padding-top:8px;border-top:1px dashed #CBD5E1}
    .acc-chip{padding:4px 8px;border-radius:4px;background:#F8FAFC;border:1px solid #E2E8F0;font-size:9px}
    .acc-chip b{display:block;font-weight:800;font-size:11px;color:#0284C7;margin-top:1px}
    .foot{margin-top:14px;padding:6px 0;border-top:1px solid #E2E8F0;display:flex;justify-content:space-between;font-size:8.5px;color:#94A3B8}
    .empty{padding:20px;text-align:center;color:#94A3B8;font-style:italic}
    @media print{body{margin:0}.no-print{display:none}}`;

  /* ── Print daily report (V15.44: professional layout) ── */
  const printDaily=(date,accountName)=>{
    const scopeTxns=accountName?txns.filter(t=>(t.account||"")===accountName):txns;
    const dayTxns=scopeTxns.filter(t=>t.date===date).sort((a,b)=>(a.createdAt||"").localeCompare(b.createdAt||""));
    const dIn=dayTxns.filter(t=>t.type==="in").reduce((s,t)=>s+(Number(t.amount)||0),0);
    const dOut=dayTxns.filter(t=>t.type==="out").reduce((s,t)=>s+(Number(t.amount)||0),0);
    const prevTxns=scopeTxns.filter(t=>t.date<date);const openBal=prevTxns.reduce((s,t)=>t.type==="in"?s+(Number(t.amount)||0):s-(Number(t.amount)||0),0);
    const closeBal=openBal+dIn-dOut;
    const scopeLabel=accountName||"كل الحسابات";
    const dayN=dayNameFull(date);
    const w=openPrintWindow();if(!w){alert("المتصفح بيمنع فتح نافذة الطباعة — فعّل النوافذ المنبثقة");return}
    w.document.write(`<html dir="rtl"><head><meta charset="utf-8"><title>يومية ${scopeLabel} — ${date}</title>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet"/>
    <style>${_printStyles}</style></head><body style="padding:14px">
    <div class="brand-bar"></div>
    <div class="hdr">
      <div class="hdr-left">
        <div class="title">تقرير يومية الصندوق</div>
        <div class="subtitle">${scopeLabel}</div>
      </div>
      <div class="hdr-right">
        <div>التاريخ: <b>${date}</b> — ${dayN}</div>
        <div>عدد الحركات: <b>${dayTxns.length}</b></div>
        <div>الطباعة: <b>${new Date().toLocaleString("ar-EG")}</b></div>
      </div>
    </div>
    <div class="summary">
      <div class="sbox"><div class="lbl">رصيد افتتاحي</div><div class="val num blue">${fmt0(openBal)}</div></div>
      <div class="sbox"><div class="lbl">وارد</div><div class="val num green">${fmt0(dIn)}</div></div>
      <div class="sbox"><div class="lbl">منصرف</div><div class="val num red">${fmt0(dOut)}</div></div>
      <div class="sbox"><div class="lbl">صافي اليوم</div><div class="val num">${fmt0(dIn-dOut)}</div></div>
      <div class="sbox hl"><div class="lbl">رصيد اقفال</div><div class="val num">${fmt0(closeBal)}</div></div>
    </div>
    <table><thead><tr>
      <th style="width:12%">الرصيد</th><th style="width:10%">التاريخ</th>
      <th style="width:10%">وارد</th><th style="width:10%">منصرف</th>
      <th style="width:15%">التصنيف</th><th>البيان</th>
      <th style="width:10%">الحساب</th>
    </tr></thead><tbody>`);
    let runBal=openBal;
    dayTxns.forEach(t=>{if(t.type==="in")runBal+=(Number(t.amount)||0);else runBal-=(Number(t.amount)||0);
      w.document.write(`<tr><td class="num">${fmt0(runBal)}</td><td>${t.date}</td><td class="num green">${t.type==="in"?fmt0(t.amount):""}</td><td class="num red">${t.type==="out"?fmt0(t.amount):""}</td><td>${_esc(t.category||"—")}</td><td>${_esc(t.desc||"—")}</td><td>${_esc(t.account||"")}</td></tr>`)});
    if(dayTxns.length===0)w.document.write(`<tr><td colspan="7" class="empty">لا توجد حركات في هذا اليوم</td></tr>`);
    w.document.write(`</tbody></table>`);
    if(!accountName){
      w.document.write(`<div class="accounts-row">${accounts.map(acc=>{const ab=accBalances[acc]||{in:0,out:0};return`<div class="acc-chip">${acc}<b class="num">${fmt0(ab.in-ab.out)}</b></div>`}).join("")}</div>`);
    }
    w.document.write(`<div class="foot"><span>CLARK Factory Management System</span><span>صفحة 1</span></div>
    </body></html>`);w.document.close();setTimeout(()=>w.print(),300)};

  /* ── V15.44: Print filtered view — prints whatever's currently visible with active filters ── */
  const printFiltered=(txList,filterSummary)=>{
    const sorted=[...txList].sort((a,b)=>(a.date||"").localeCompare(b.date||"")||(a.createdAt||"").localeCompare(b.createdAt||""));
    const tIn=sorted.filter(t=>t.type==="in").reduce((s,t)=>s+(Number(t.amount)||0),0);
    const tOut=sorted.filter(t=>t.type==="out").reduce((s,t)=>s+(Number(t.amount)||0),0);
    const w=openPrintWindow();if(!w){alert("المتصفح بيمنع فتح نافذة الطباعة — فعّل النوافذ المنبثقة");return}
    w.document.write(`<html dir="rtl"><head><meta charset="utf-8"><title>تقرير حركات — ${sorted.length} حركة</title>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet"/>
    <style>${_printStyles}</style></head><body style="padding:14px">
    <div class="brand-bar"></div>
    <div class="hdr">
      <div class="hdr-left">
        <div class="title">تقرير حركات الخزنة</div>
        <div class="subtitle">${filterSummary||"كل الحركات"}</div>
      </div>
      <div class="hdr-right">
        <div>عدد الحركات: <b>${sorted.length}</b></div>
        <div>الطباعة: <b>${new Date().toLocaleString("ar-EG")}</b></div>
      </div>
    </div>
    <div class="summary">
      <div class="sbox"><div class="lbl">عدد الحركات</div><div class="val num">${sorted.length}</div></div>
      <div class="sbox"><div class="lbl">إجمالي الوارد</div><div class="val num green">${fmt0(tIn)}</div></div>
      <div class="sbox"><div class="lbl">إجمالي المنصرف</div><div class="val num red">${fmt0(tOut)}</div></div>
      <div class="sbox hl"><div class="lbl">الصافي</div><div class="val num">${fmt0(tIn-tOut)}</div></div>
    </div>
    <table><thead><tr>
      <th style="width:10%">التاريخ</th>
      <th style="width:11%">وارد</th><th style="width:11%">منصرف</th>
      <th style="width:16%">التصنيف</th><th>البيان</th>
      <th style="width:11%">الحساب</th>
    </tr></thead><tbody>`);
    sorted.forEach(t=>{
      w.document.write(`<tr><td>${t.date}</td><td class="num green">${t.type==="in"?fmt0(t.amount):""}</td><td class="num red">${t.type==="out"?fmt0(t.amount):""}</td><td>${_esc(t.category||"—")}</td><td>${_esc(t.desc||"—")}</td><td>${_esc(t.account||"")}</td></tr>`)});
    if(sorted.length===0)w.document.write(`<tr><td colspan="6" class="empty">لا توجد حركات مطابقة للفلاتر</td></tr>`);
    w.document.write(`</tbody></table>
    <div class="foot"><span>CLARK Factory Management System</span><span>تقرير مخصص — الفلاتر المفعّلة مبينة أعلاه</span></div>
    </body></html>`);w.document.close();setTimeout(()=>w.print(),300)};

  /* ── Build daily report HTML (shared between PDF and WA) ── */
  /* accountName: filter by specific account, or null = all accounts */
  const buildDailyReportHtml=(date,accountName)=>{
    const scopeTxns=accountName?txns.filter(t=>(t.account||"")===accountName):txns;
    const dayTxns=scopeTxns.filter(t=>t.date===date).sort((a,b)=>(a.createdAt||"").localeCompare(b.createdAt||""));
    const dIn=dayTxns.filter(t=>t.type==="in").reduce((s,t)=>s+(Number(t.amount)||0),0);
    const dOut=dayTxns.filter(t=>t.type==="out").reduce((s,t)=>s+(Number(t.amount)||0),0);
    const prevTxns=scopeTxns.filter(t=>t.date<date);
    const openBal=prevTxns.reduce((s,t)=>t.type==="in"?s+(Number(t.amount)||0):s-(Number(t.amount)||0),0);
    const closeBal=openBal+dIn-dOut;
    const scopeLabel=accountName?accountName:"كل الحسابات";
    const dayN=dayNameFull(date);
    let rows="";let runBal=openBal;
    /* V16.8: Tahoma/Arial render Arabic correctly in html2pdf. NO white-space:nowrap on description (causes letter breaks).
       Removed text-overflow:ellipsis — let descriptions wrap naturally instead of being cut mid-letter. */
    const cellBase="padding:3px 6px;border-bottom:1px solid #E2E8F0;text-align:right;vertical-align:middle;font-size:10px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
    const cellNum="padding:3px 6px;border-bottom:1px solid #E2E8F0;text-align:left;vertical-align:middle;font-size:10px;line-height:1.3;font-weight:700;font-variant-numeric:tabular-nums;direction:ltr;white-space:nowrap";
    dayTxns.forEach((t,idx)=>{
      if(t.type==="in")runBal+=(Number(t.amount)||0);else runBal-=(Number(t.amount)||0);
      const rowBg=idx%2===0?"#FFFFFF":"#F1F5F9";
      rows+=`<tr style="background:${rowBg}"><td style="${cellNum}">${fmt0(runBal)}</td><td style="${cellBase};direction:ltr;text-align:center">${t.date}</td><td style="${cellNum};color:#059669">${t.type==="in"?fmt0(t.amount):"—"}</td><td style="${cellNum};color:#DC2626">${t.type==="out"?fmt0(t.amount):"—"}</td><td style="${cellBase}">${_esc(t.category||"—")}</td><td style="${cellBase}">${_esc(t.desc||"—")}</td><td style="${cellBase}">${_esc(t.account||"")}</td></tr>`;
    });
    /* Accounts footer (only when showing all accounts) */
    const accFoot=accountName?"":accounts.map(acc=>{const ab=accBalances[acc]||{in:0,out:0};return`<div style="padding:4px 8px;border-radius:4px;background:#F8FAFC;border:1px solid #E2E8F0;font-size:9px">${acc}<b style="display:block;font-weight:800;font-size:11px;color:#0284C7;margin-top:1px;font-variant-numeric:tabular-nums">${fmt0(ab.in-ab.out)}</b></div>`}).join("");
    const accFootBlock=accFoot?`<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;padding-top:8px;border-top:1px dashed #CBD5E1">${accFoot}</div>`:"";
    /* V16.8: Tahoma/Arial render Arabic correctly in html2pdf. Cairo (web font) breaks letter joining. */
    const html=`<div id="daily-report-content" style="font-family:Tahoma,Arial,sans-serif;padding:14px;direction:rtl;background:#fff;color:#1E293B;line-height:1.5;font-size:10px">
      <div style="height:3px;background:linear-gradient(90deg,#0EA5E9,#8B5CF6);margin-bottom:10px"></div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:8px;border-bottom:1px solid #CBD5E1;margin-bottom:10px">
        <div>
          <div style="font-size:14px;font-weight:800;color:#0F172A">تقرير يومية الصندوق</div>
          <div style="font-size:10px;color:#64748B;margin-top:2px;font-weight:600">${scopeLabel}</div>
        </div>
        <div style="text-align:left;font-size:9.5px;color:#64748B;line-height:1.6">
          <div>التاريخ: <b style="color:#334155;font-weight:700">${date}</b> — ${dayN}</div>
          <div>عدد الحركات: <b style="color:#334155;font-weight:700">${dayTxns.length}</b></div>
          <div>الطباعة: <b style="color:#334155;font-weight:700">${new Date().toLocaleDateString("ar-EG")}</b></div>
        </div>
      </div>
      <div style="display:flex;gap:6px;justify-content:space-between;margin:10px 0;flex-wrap:wrap">
        <div style="flex:1;padding:6px 10px;border-radius:4px;border:1px solid #E2E8F0;background:#F8FAFC;min-width:120px"><div style="font-size:9px;color:#64748B;margin-bottom:2px;font-weight:600">رصيد افتتاحي</div><div style="font-size:12px;font-weight:800;color:#0284C7;font-variant-numeric:tabular-nums">${fmt0(openBal)}</div></div>
        <div style="flex:1;padding:6px 10px;border-radius:4px;border:1px solid #E2E8F0;background:#F8FAFC;min-width:120px"><div style="font-size:9px;color:#64748B;margin-bottom:2px;font-weight:600">وارد</div><div style="font-size:12px;font-weight:800;color:#059669;font-variant-numeric:tabular-nums">${fmt0(dIn)}</div></div>
        <div style="flex:1;padding:6px 10px;border-radius:4px;border:1px solid #E2E8F0;background:#F8FAFC;min-width:120px"><div style="font-size:9px;color:#64748B;margin-bottom:2px;font-weight:600">منصرف</div><div style="font-size:12px;font-weight:800;color:#DC2626;font-variant-numeric:tabular-nums">${fmt0(dOut)}</div></div>
        <div style="flex:1;padding:6px 10px;border-radius:4px;border:1px solid #E2E8F0;background:#F8FAFC;min-width:120px"><div style="font-size:9px;color:#64748B;margin-bottom:2px;font-weight:600">صافي اليوم</div><div style="font-size:12px;font-weight:800;font-variant-numeric:tabular-nums">${fmt0(dIn-dOut)}</div></div>
        <div style="flex:1;padding:6px 10px;border-radius:4px;border:1px solid #0EA5E9;background:#F0F9FF;min-width:120px"><div style="font-size:9px;color:#64748B;margin-bottom:2px;font-weight:600">رصيد اقفال</div><div style="font-size:12px;font-weight:800;color:#0369A1;font-variant-numeric:tabular-nums">${fmt0(closeBal)}</div></div>
      </div>
      <table style="width:100%;border-collapse:collapse;margin:8px 0;font-size:10px;table-layout:fixed">
        <thead><tr>
          <th style="background:#0EA5E9;color:#fff;font-weight:700;padding:5px 6px;text-align:right;font-size:10px;width:12%;white-space:nowrap">الرصيد</th>
          <th style="background:#0EA5E9;color:#fff;font-weight:700;padding:5px 6px;text-align:center;font-size:10px;width:10%;white-space:nowrap">التاريخ</th>
          <th style="background:#0EA5E9;color:#fff;font-weight:700;padding:5px 6px;text-align:right;font-size:10px;width:10%;white-space:nowrap">وارد</th>
          <th style="background:#0EA5E9;color:#fff;font-weight:700;padding:5px 6px;text-align:right;font-size:10px;width:10%;white-space:nowrap">منصرف</th>
          <th style="background:#0EA5E9;color:#fff;font-weight:700;padding:5px 6px;text-align:right;font-size:10px;width:15%;white-space:nowrap">التصنيف</th>
          <th style="background:#0EA5E9;color:#fff;font-weight:700;padding:5px 6px;text-align:right;font-size:10px;white-space:nowrap">البيان</th>
          <th style="background:#0EA5E9;color:#fff;font-weight:700;padding:5px 6px;text-align:right;font-size:10px;width:10%;white-space:nowrap">الحساب</th>
        </tr></thead>
        <tbody>${rows||'<tr><td colspan="7" style="padding:20px;text-align:center;color:#94A3B8;font-style:italic">لا توجد حركات في هذا اليوم</td></tr>'}</tbody>
      </table>
      ${accFootBlock}
      <div style="margin-top:12px;padding:6px 0;border-top:1px solid #E2E8F0;display:flex;justify-content:space-between;font-size:9px;color:#94A3B8">
        <span>CLARK Factory Management System</span>
        <span>${new Date().toLocaleDateString("ar-EG")}</span>
      </div>
    </div>`;
    return{html,dIn,dOut,openBal,closeBal,txnCount:dayTxns.length,scopeLabel};
  };

  /* ── Save daily report as PDF ── */
  const savePdfDaily=async(date,accountName)=>{
    if(typeof window.html2pdf==="undefined"){showToast("⚠️ مكتبة PDF لم تُحمّل بعد — أعد تحميل الصفحة");return}
    const{html}=buildDailyReportHtml(date,accountName);
    /* Create temp container */
    const container=document.createElement("div");
    container.innerHTML=html;
    container.style.position="absolute";container.style.left="-10000px";container.style.top="0";
    container.style.width="210mm";/* A4 width for consistent rendering */
    document.body.appendChild(container);
    showToast("⏳ جاري إنشاء PDF...");
    /* V16.8: Wait for Arabic web fonts to load before rendering — prevents broken letters */
    try{if(document.fonts&&document.fonts.ready)await document.fonts.ready}catch(e){}
    /* Build filename: include account name if specified */
    const accSuffix=accountName?"_"+accountName.replace(/\s+/g,"-"):"";
    const filename="يومية"+accSuffix+"_"+date+".pdf";
    try{
      await window.html2pdf().set({
        margin:[10,10,10,10],
        filename,
        image:{type:"jpeg",quality:0.98},
        /* V16.8: letterRendering disabled — it BREAKS Arabic letter joining (causes split letters in PDF).
           Higher scale (3x) compensates for sharpness loss. */
        html2canvas:{
          scale:3,
          useCORS:true,
          letterRendering:false,
          allowTaint:false,
          backgroundColor:"#ffffff",
          logging:false,
        },
        jsPDF:{unit:"mm",format:"a4",orientation:"portrait",compress:true}
      }).from(container.firstChild).save();
      showToast("✅ تم حفظ الـ PDF");
    }catch(e){showToast("❌ فشل إنشاء PDF: "+e.message)}
    finally{document.body.removeChild(container)}
  };

  /* ── Build WhatsApp text summary message ──
     V16.13: Full text report — no PDF attachment. Lists every transaction
     of the day inline with running balance.
     V16.13.1: Emphasized totals + per-category breakdown (in/out). */
  const buildDailyWaMessage=(date,accountName)=>{
    const{dIn,dOut,openBal,closeBal,txnCount,scopeLabel}=buildDailyReportHtml(date,accountName);
    const net=dIn-dOut;
    const dayN=dayNameFull(date);
    /* Re-derive the same filtered txns (cheap; small list) */
    const scopeTxns=accountName?txns.filter(t=>(t.account||"")===accountName):txns;
    const dayTxns=scopeTxns.filter(t=>t.date===date).sort((a,b)=>(a.createdAt||"").localeCompare(b.createdAt||""));
    /* V16.13.1: Aggregate totals per category, separately for in/out */
    const catIn={},catOut={};
    dayTxns.forEach(t=>{
      const k=t.category||"غير مصنّف";
      const a=Number(t.amount)||0;
      if(t.type==="in")catIn[k]=(catIn[k]||0)+a;
      else catOut[k]=(catOut[k]||0)+a;
    });
    const buildBreakdown=(obj)=>{
      const ks=Object.keys(obj).sort((a,b)=>obj[b]-obj[a]);
      if(ks.length===0)return "  • لا يوجد";
      return ks.map(k=>"  • "+k+": "+fmt0(obj[k])+" ج.م").join("\n");
    };
    /* Build per-transaction lines */
    let runBal=openBal;const lines=[];
    dayTxns.forEach((t,i)=>{
      if(t.type==="in")runBal+=(Number(t.amount)||0);else runBal-=(Number(t.amount)||0);
      const arrow=t.type==="in"?"🟢":"🔴";
      const sign=t.type==="in"?"+":"-";
      const amt=fmt0(t.amount);
      const desc=(t.desc||"—").replace(/\*/g,"").slice(0,80);
      const cat=t.category?" • "+t.category:"";
      const acc=accountName?"":" • "+(t.account||"");
      lines.push((i+1)+". "+arrow+" "+sign+amt+" ج.م"+acc+cat);
      lines.push("    "+desc);
      if(t.notes)lines.push("    📝 "+t.notes.slice(0,60));
      lines.push("    رصيد بعد الحركة: "+fmt0(runBal));
      lines.push("");
    });
    const txBlock=dayTxns.length?lines.join("\n"):"لا توجد حركات في هذا اليوم";
    const out=[
      "📊 *تقرير يومية الخزنة*",
      "🏦 *الحساب:* "+scopeLabel,
      "📅 "+date+" — "+dayN,
      "━━━━━━━━━━━━━━━━",
      "*الإجماليات*",
      "💰 رصيد افتتاحي: "+fmt0(openBal)+" ج.م",
      "🟢 *إجمالي الوارد: "+fmt0(dIn)+" ج.م*",
      "🔴 *إجمالي المنصرف: "+fmt0(dOut)+" ج.م*",
      "💵 *صافي اليوم: "+(net>=0?"+":"")+fmt0(net)+" ج.م*",
      "📊 *رصيد الإقفال: "+fmt0(closeBal)+" ج.م*",
      "📝 عدد الحركات: "+txnCount,
      "━━━━━━━━━━━━━━━━",
      "*🟢 الوارد حسب التصنيف*",
      buildBreakdown(catIn),
      "",
      "*🔴 المنصرف حسب التصنيف*",
      buildBreakdown(catOut),
      "━━━━━━━━━━━━━━━━",
      "*تفاصيل الحركات*",
      "",
      txBlock,
      "━━━━━━━━━━━━━━━━",
      "🏭 CLARK Factory Management"
    ];
    return out.join("\n");
  };

  /* ── State for WhatsApp contact picker popup ── */
  /* Stores {date, account} — account null = all */
  const[waPopupData,setWaPopupData]=useState(null);

  /* ── Share daily report via WhatsApp ──
     V16.13: Text-only — no PDF. Full transaction details in the message body.
     V16.13.1: Fully synchronous (no async) — keeps the call inside the user
     gesture so popup blockers don't kill window.open. */
  const shareDailyWhatsApp=(date,phone,accountName)=>{
    const msg=buildDailyWaMessage(date,accountName);
    const cleanPhone=(phone||"").replace(/[^0-9]/g,"");
    const url="https://wa.me/"+cleanPhone+"?text="+encodeURIComponent(msg);
    openWA(url);
    setWaPopupData(null);
  };

  return<div>
    {/* ═══ V14.52: Whitelist-aware lock banner ═══ */}
    {(lockEdit||lockDelete)&&(()=>{
      /* Determine user status: admin / whitelisted / blocked */
      const canEditNow=isAdmin||(!lockEdit)||isAllowedEditor;
      const canDeleteNow=isAdmin||(!lockDelete)||isAllowedDeleter;
      const isFullyBlocked=!canEditNow&&!canDeleteNow;
      const isPartialAccess=!isAdmin&&(isAllowedEditor||isAllowedDeleter);
      /* Pick visual style based on user's effective access */
      let bgColor,borderColor,iconColor,icon,title,subtitle;
      if(isAdmin){
        bgColor=T.warn+"12";borderColor=T.warn+"40";iconColor=T.warn;icon="👑";
        title="قفل نشط — لديك صلاحية التجاوز كمدير";
        subtitle=(lockEdit&&lockDelete?"التعديل والحذف مقفولين":lockEdit?"التعديل مقفول":"الحذف مقفول")+" — كل تعديل/حذف سيُسجل في سجل الأمان";
      } else if(isPartialAccess){
        bgColor=T.ok+"10";borderColor=T.ok+"30";iconColor=T.ok;icon="🔓";
        title="لديك صلاحية خاصة — مصرّح لك بالتعديل/الحذف";
        const parts=[];
        if(lockEdit&&isAllowedEditor)parts.push("✅ تقدر تعدل");
        if(lockDelete&&isAllowedDeleter)parts.push("✅ تقدر تحذف");
        subtitle=parts.join(" • ")+" — كل عملية ستُسجل في سجل الأمان";
      } else {
        bgColor=T.err+"10";borderColor=T.err+"30";iconColor=T.err;icon="🔒";
        title="وضع قراءة فقط";
        subtitle="القفل مفعّل — لا تملك صلاحية التعديل أو الحذف. تواصل مع المدير لإضافتك للقائمة.";
      }
      return<div style={{padding:"12px 16px",marginBottom:12,borderRadius:12,background:bgColor,border:"1px solid "+borderColor,display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,flex:1,minWidth:0}}>
          <span style={{fontSize:22,flexShrink:0}}>{icon}</span>
          <div style={{minWidth:0}}>
            <div style={{fontSize:FS,fontWeight:800,color:iconColor}}>{title}</div>
            <div style={{fontSize:FS-2,color:T.textSec,marginTop:3,lineHeight:1.5}}>{subtitle}</div>
          </div>
        </div>
        {isAdmin&&<Btn small onClick={()=>{
          upConfig(d=>{
            if(!d.treasurySettings)d.treasurySettings={};
            d.treasurySettings.lockEdit=false;
            d.treasurySettings.lockDelete=false;
          });
          showToast("✅ تم فتح القفل");
        }} style={{background:T.ok+"15",color:T.ok,border:"1px solid "+T.ok+"40",fontWeight:700,whiteSpace:"nowrap"}} title="فتح القفل (للمدير فقط)">🔓 فتح القفل</Btn>}
      </div>;
    })()}

    {/* View Tabs */}
    <div style={{display:"flex",gap:0,marginBottom:16,borderRadius:10,overflow:"hidden",border:"1px solid "+T.brd}}>
      {(()=>{
        /* Dynamic tabs: general journal + one per account + tools */
        const unreadTransferNotifs=notifications.filter(n=>n.toEmail===userEmail&&!n.read&&(n.type==="treasury_transfer"||n.type==="treasury_transfer_confirmed")).length;
        /* V16.13: pending transfers waiting for admin approval */
        const pendingTransferCount=isAdmin?transfers.filter(t=>t.status==="pending").length:0;
        const transferBadge=pendingTransferCount>0?" ⏳"+pendingTransferCount:(unreadTransferNotifs>0?" 🔴"+unreadTransferNotifs:"");
        const baseTabs=[];
        /* Sort accounts: SUB CASH first, then MAIN CASH, then others */
        const sortedAccounts=[...accountsData].sort((a,b)=>{const aS=a.name.toUpperCase().includes("SUB")?0:a.name.toUpperCase().includes("MAIN")?1:2;const bS=b.name.toUpperCase().includes("SUB")?0:b.name.toUpperCase().includes("MAIN")?1:2;return aS-bS});
        sortedAccounts.forEach(a=>{
          const icon=a.name.toUpperCase().includes("MAIN")?"🏦":a.name.toUpperCase().includes("SUB")?"💰":"📘";
          baseTabs.push({k:"acc_"+a.id,l:icon+" "+a.name,accName:a.name})
        });
        baseTabs.push({k:"journal",l:"📒 الكل"});
        baseTabs.push({k:"transfers",l:"🔄 التحويلات"+transferBadge});
        baseTabs.push({k:"checks",l:"📝 الشيكات"});
        baseTabs.push({k:"analysis",l:"📊 التحليل"});
        baseTabs.push({k:"accounts",l:"🏦 الحسابات"});
        return baseTabs.map(v=>
        <div key={v.k} onClick={()=>{setView(v.k);if(v.accName){setFilterAcc(v.accName);setTxAccount(v.accName)}else if(v.k==="journal")setFilterAcc("الكل")}} style={{flex:1,padding:"10px 8px",textAlign:"center",cursor:"pointer",fontWeight:700,fontSize:FS-2,background:view===v.k?T.accent:T.cardSolid,color:view===v.k?"#fff":T.textSec,transition:"all 0.15s",whiteSpace:"nowrap"}}>{v.l}</div>)
      })()}
    </div>

    {/* Today mini summary — per-account when viewing specific account.
        V16.19: Hidden on transfers/checks/analysis/accounts — these tabs have
        their own controls and don't need the daily print/PDF/WA toolbar. */}
    {!["transfers","checks","analysis","accounts"].includes(view)&&(()=>{
      const currentAccName=view.startsWith("acc_")?(accountsData.find(a=>a.id===view.slice(4))||{}).name:null;
      const scopeLabel=currentAccName||"الكل";
      const todayFiltered=todayTxns.filter(t=>!currentAccName||(t.account||"")===currentAccName);
      const tIn=todayFiltered.filter(t=>t.type==="in").reduce((s,t)=>s+(Number(t.amount)||0),0);
      const tOut=todayFiltered.filter(t=>t.type==="out").reduce((s,t)=>s+(Number(t.amount)||0),0);
      return<div style={{display:"flex",gap:12,marginBottom:16,justifyContent:"center",flexWrap:"wrap",alignItems:"center"}}>
        <div style={{padding:"8px 20px",borderRadius:10,background:T.ok+"08",border:"1px solid "+T.ok+"20",textAlign:"center"}}>
          <div style={{fontSize:FS-2,color:T.textSec}}>وارد اليوم {currentAccName?"("+scopeLabel+")":""}</div><div style={{fontSize:FS+2,fontWeight:800,color:T.ok}}>{"↓ "+fmt0(tIn)}</div>
        </div>
        <div style={{padding:"8px 20px",borderRadius:10,background:T.err+"08",border:"1px solid "+T.err+"20",textAlign:"center"}}>
          <div style={{fontSize:FS-2,color:T.textSec}}>منصرف اليوم {currentAccName?"("+scopeLabel+")":""}</div><div style={{fontSize:FS+2,fontWeight:800,color:T.err}}>{"↑ "+fmt0(tOut)}</div>
        </div>
        <div style={{padding:"8px 20px",borderRadius:10,background:"#0D948808",border:"1px solid #0D948820",textAlign:"center"}}>
          <div style={{fontSize:FS-2,color:T.textSec}}>صافي اليوم</div><div style={{fontSize:FS+2,fontWeight:800,color:"#0D9488"}}>{fmt0(tIn-tOut)}</div>
        </div>
        {/* V15.44: Date picker for selecting which day's report to print/export */}
        <div style={{padding:"6px 12px",borderRadius:10,background:T.bg,border:"1px solid "+T.brd,display:"flex",alignItems:"center",gap:6}} title="اختر اليوم للطباعة / PDF / واتساب">
          <span style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>📅 يوم</span>
          <input type="date" value={printDate} onChange={e=>setPrintDate(e.target.value||today)} style={{padding:"4px 6px",borderRadius:6,border:"1px solid "+T.brd,fontSize:FS-1,fontFamily:"inherit",background:T.inputBg,color:T.text}}/>
          {printDate!==today&&<span onClick={()=>setPrintDate(today)} style={{cursor:"pointer",fontSize:FS-2,color:T.accent,fontWeight:700}} title="العودة لليوم">↩</span>}
        </div>
        <div onClick={()=>printDaily(printDate,currentAccName)} style={{padding:"8px 20px",borderRadius:10,background:T.accent+"08",border:"1px solid "+T.accent+"20",textAlign:"center",cursor:"pointer"}} title={"طباعة "+printDate+" — "+scopeLabel}>
          <div style={{fontSize:FS-2,color:T.textSec}}>طباعة {currentAccName?"("+currentAccName+")":""}</div><div style={{fontSize:FS+1,fontWeight:700,color:T.accent}}>🖨️</div>
        </div>
        <div onClick={()=>savePdfDaily(printDate,currentAccName)} style={{padding:"8px 20px",borderRadius:10,background:"#EF444408",border:"1px solid #EF444420",textAlign:"center",cursor:"pointer"}} title={"حفظ PDF "+printDate+" — "+scopeLabel}>
          <div style={{fontSize:FS-2,color:T.textSec}}>PDF {currentAccName?"("+currentAccName+")":""}</div><div style={{fontSize:FS+1,fontWeight:700,color:"#EF4444"}}>📄</div>
        </div>
        <div onClick={()=>setWaPopupData({date:printDate,account:currentAccName})} style={{padding:"8px 20px",borderRadius:10,background:"#25D36608",border:"1px solid #25D36620",textAlign:"center",cursor:"pointer"}} title={"إرسال واتساب "+printDate+" — "+scopeLabel}>
          <div style={{fontSize:FS-2,color:T.textSec}}>واتساب {currentAccName?"("+currentAccName+")":""}</div><div style={{fontSize:FS+1,fontWeight:700,color:"#25D366"}}>📤</div>
        </div>
      </div>})()}

    {/* ══ JOURNAL VIEW ══ */}
    {(view==="journal"||view.startsWith("acc_"))&&<div>
      {view.startsWith("acc_")&&(()=>{
        const accId=view.slice(4);const acc=accountsData.find(a=>a.id===accId);if(!acc)return null;
        const b=accBalances[acc.name]||{in:0,out:0};const bal=b.in-b.out;
        return<Card style={{marginBottom:14,background:"linear-gradient(135deg,"+T.accent+"08,"+T.accent+"03)",border:"1px solid "+T.accent+"20"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
            <div>
              <div style={{fontSize:FS+2,fontWeight:800,color:T.accent}}>{acc.name.toUpperCase().includes("MAIN")?"🏦 ":acc.name.toUpperCase().includes("SUB")?"💰 ":"📘 "}{acc.name}</div>
              {acc.ownerEmail&&<div style={{fontSize:FS-2,color:T.textMut,marginTop:2}}>👤 المسؤول: {acc.ownerEmail}</div>}
            </div>
            <div style={{display:"flex",gap:16}}>
              <div style={{textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textMut}}>وارد</div><div style={{fontSize:FS+1,fontWeight:800,color:T.ok}}>{fmt0(b.in)}</div></div>
              <div style={{textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textMut}}>منصرف</div><div style={{fontSize:FS+1,fontWeight:800,color:T.err}}>{fmt0(b.out)}</div></div>
              <div style={{textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textMut}}>الرصيد</div><div style={{fontSize:FS+4,fontWeight:900,color:bal>=0?"#0D9488":T.err}}>{fmt0(bal)}</div></div>
            </div>
          </div>
        </Card>})()}
      {canEdit&&<div style={{marginBottom:14,display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        <Btn primary onClick={()=>{setEditId(null);setTxType("out");setTxAmount("");setTxDesc("");setTxNotes("");setTxCategory("");setTxAccount(view.startsWith("acc_")?(accountsData.find(a=>a.id===view.slice(4))?.name||"SUB CASH"):"SUB CASH");setTxSeason(data.activeSeason||"");setTxDate(today);setTxPartyId("");setTxPartyType("");setShowForm(!showForm)}}>{showForm?"✕ إغلاق":"+ حركة جديدة"}</Btn>
        {accountsData.length>=2&&<Btn onClick={()=>{setTfDate(new Date().toISOString().split("T")[0]);setShowTransfer(true)}} style={{background:"#8B5CF615",color:"#8B5CF6",border:"1px solid #8B5CF640",fontWeight:700}}>🔄 تحويل بين الخزن</Btn>}
        {/* V18.46: gated by master Odoo toggle */}
        {(data.odooEnabled !== false) && (data.odooSettings||{}).url&&<Btn onClick={openOdooSyncPopup} disabled={odooSyncing} style={{background:"#71486712",color:"#714867",border:"1px solid #71486730",fontWeight:700}}>{odooSyncing?<span style={{display:"inline-flex",alignItems:"center",gap:8}}><Spinner size="small" color="#714867" inline/>جاري التزامن...</span>:"🔗 تزامن Odoo"}</Btn>}
        {(data.odooEnabled !== false) && odooResult&&<span style={{fontSize:FS-1,fontWeight:700,color:odooResult.ok?T.ok:T.err,padding:"4px 10px",borderRadius:6,background:odooResult.ok?T.ok+"08":T.err+"08"}}>{odooResult.msg}</span>}
      </div>}

      {/* ══ ODOO SELECTIVE SYNC POPUP ══ V18.46: gated by master toggle */}
      {(data.odooEnabled !== false) && odooSyncPopup&&(()=>{
        const subName=accountsData.find(a=>a.name.toUpperCase().includes("SUB"))?.name||"SUB CASH";
        const subTxns=txns.filter(t=>(t.account||"")===subName);
        /* Category stats (for checkbox list) */
        const catStats={};subTxns.forEach(t=>{const c=t.category||"بدون تصنيف";const d=t.date||"";
          if(odooSyncPopup.fromDate&&d<odooSyncPopup.fromDate)return;
          if(odooSyncPopup.toDate&&d>odooSyncPopup.toDate)return;
          if(!catStats[c])catStats[c]={count:0,total:0};catStats[c].count++;catStats[c].total+=Number(t.amount)||0});
        const mapping=(data.odooSettings||{}).accountMapping||{};
        const defaultSet=!!((data.odooSettings||{}).defaultAccountCode||"").trim();
        /* Date quick-ranges */
        const now=new Date();const y=now.getFullYear();const m=now.getMonth();const d0=now.getDate();
        const pad=(x)=>String(x).padStart(2,"0");
        const qRanges=[
          {label:"هذا الشهر",from:y+"-"+pad(m+1)+"-01",to:y+"-"+pad(m+1)+"-"+pad(d0)},
          {label:"الشهر السابق",from:(m===0?y-1:y)+"-"+pad(m===0?12:m)+"-01",to:(m===0?y-1:y)+"-"+pad(m===0?12:m)+"-"+pad(new Date(m===0?y-1:y,m===0?12:m,0).getDate())},
          {label:"آخر 7 أيام",from:new Date(Date.now()-6*86400000).toISOString().split("T")[0],to:now.toISOString().split("T")[0]},
          {label:"آخر 30 يوم",from:new Date(Date.now()-29*86400000).toISOString().split("T")[0],to:now.toISOString().split("T")[0]},
          {label:"الكل",from:"",to:""}
        ];
        const closePopup=()=>{setOdooSyncPopup(null);setOdooSyncPreview(null)};
        /* STEP 1: Filters */
        if(odooSyncPopup.step==="filters"){
          const toggleCat=(c)=>setOdooSyncPopup(p=>({...p,selectedCats:{...p.selectedCats,[c]:!p.selectedCats[c]}}));
          const selectAllCats=(val)=>setOdooSyncPopup(p=>{const n={};Object.keys(catStats).forEach(c=>{n[c]=val});return{...p,selectedCats:n}});
          const goPreview=async()=>{await buildOdooPreview();setOdooSyncPopup(p=>({...p,step:"preview"}))};
          const selectedCount=Object.keys(odooSyncPopup.selectedCats).filter(c=>odooSyncPopup.selectedCats[c]&&catStats[c]).length;
          return<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={closePopup}>
            <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:20,width:"100%",maxWidth:720,maxHeight:"92vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.4)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,paddingBottom:12,borderBottom:"1px solid "+T.brd}}>
                <div style={{fontSize:FS+2,fontWeight:800,color:"#714867",display:"flex",alignItems:"center",gap:8}}>
                  <span>🔗</span><span>تزامن Odoo — اختر ما تريد تزامنه</span>
                </div>
                <Btn ghost small onClick={closePopup}>✕</Btn>
              </div>
              {/* Date filter */}
              <div style={{marginBottom:16,padding:12,borderRadius:10,background:"#71486708",border:"1px solid #71486720"}}>
                <div style={{fontSize:FS-1,fontWeight:700,color:"#714867",marginBottom:8}}>📅 الفترة الزمنية</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
                  {qRanges.map(q=><Btn key={q.label} small onClick={()=>setOdooSyncPopup(p=>({...p,fromDate:q.from,toDate:q.to}))} style={{background:(odooSyncPopup.fromDate===q.from&&odooSyncPopup.toDate===q.to)?"#714867":"#71486715",color:(odooSyncPopup.fromDate===q.from&&odooSyncPopup.toDate===q.to)?"#fff":"#714867",border:"1px solid #71486740",fontWeight:700}}>{q.label}</Btn>)}
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                  <div style={{flex:1,minWidth:150}}><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:2}}>من تاريخ</label><Inp type="date" value={odooSyncPopup.fromDate} onChange={v=>setOdooSyncPopup(p=>({...p,fromDate:v}))}/></div>
                  <div style={{flex:1,minWidth:150}}><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:2}}>إلى تاريخ</label><Inp type="date" value={odooSyncPopup.toDate} onChange={v=>setOdooSyncPopup(p=>({...p,toDate:v}))}/></div>
                </div>
              </div>
              {/* Category filter */}
              <div style={{marginBottom:16,padding:12,borderRadius:10,background:T.bg,border:"1px solid "+T.brd}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div style={{fontSize:FS-1,fontWeight:700,color:T.text}}>🏷️ الفئات ({selectedCount}/{Object.keys(catStats).length})</div>
                  <div style={{display:"flex",gap:6}}>
                    <Btn small onClick={()=>selectAllCats(true)} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30"}}>☑ الكل</Btn>
                    <Btn small onClick={()=>selectAllCats(false)} style={{background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30"}}>☐ لا شيء</Btn>
                  </div>
                </div>
                {Object.keys(catStats).length===0?<div style={{textAlign:"center",padding:20,color:T.textMut,fontSize:FS-1}}>لا توجد حركات في هذه الفترة</div>
                :<div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:"35vh",overflowY:"auto"}}>
                  {Object.keys(catStats).sort().map(c=>{const st=catStats[c];const sel=!!odooSyncPopup.selectedCats[c];const mapped=!!mapping[c]||!!mapping[c.trim()]||defaultSet;
                    return<div key={c} onClick={()=>toggleCat(c)} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderRadius:10,cursor:"pointer",background:sel?"#71486708":T.bg,border:"1px solid "+(sel?"#71486730":T.brd),opacity:mapped?1:0.7}}>
                      <span style={{fontSize:18}}>{sel?"☑":"☐"}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                          <span style={{fontSize:FS,fontWeight:700}}>{c}</span>
                          {!mapped&&<span style={{padding:"1px 6px",borderRadius:4,fontSize:FS-3,fontWeight:700,background:T.warn+"15",color:T.warn,border:"1px solid "+T.warn+"30"}}>⚠️ غير مربوطة</span>}
                        </div>
                        <div style={{fontSize:FS-2,color:T.textMut}}>{st.count+" حركة"}</div>
                      </div>
                      <span style={{fontSize:FS-1,color:"#714867",fontWeight:700,whiteSpace:"nowrap"}}>{fmt(st.total)}</span>
                    </div>})}
                </div>}
              </div>
              {/* Actions */}
              <div style={{display:"flex",gap:8,justifyContent:"flex-end",paddingTop:12,borderTop:"1px solid "+T.brd}}>
                <Btn onClick={closePopup} style={{background:T.bg,color:T.textSec,border:"1px solid "+T.brd}}>إلغاء</Btn>
                <Btn primary onClick={goPreview} disabled={selectedCount===0} style={{background:"#714867",color:"#fff"}}>🔍 معاينة →</Btn>
              </div>
            </div>
          </div>;
        }
        /* STEP 2: Preview + confirm */
        if(odooSyncPopup.step==="preview"){
          const pv=odooSyncPreview;
          const canSync=pv&&pv.newTxns&&pv.newTxns.length>0&&odooSyncPopup.confirmText==="تزامن";
          const doSync=async()=>{
            closePopup();
            await syncToOdoo(pv.newTxns);
          };
          return<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={closePopup}>
            <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:20,width:"100%",maxWidth:720,maxHeight:"92vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.4)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,paddingBottom:12,borderBottom:"1px solid "+T.brd}}>
                <div style={{fontSize:FS+2,fontWeight:800,color:"#714867",display:"flex",alignItems:"center",gap:8}}>
                  <span>🔍</span><span>معاينة التزامن</span>
                </div>
                <Btn ghost small onClick={closePopup}>✕</Btn>
              </div>
              {!pv?<InlineLoading message="جاري جلب المعاينة..."/>
              :pv.total===0?<div style={{textAlign:"center",padding:40,color:T.textMut}}>لا توجد حركات مطابقة للفلاتر</div>
              :<>
                {/* Summary */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:14}}>
                  <div style={{padding:12,borderRadius:10,background:T.ok+"08",border:"1px solid "+T.ok+"20",textAlign:"center"}}>
                    <div style={{fontSize:FS-2,color:T.textSec,marginBottom:3}}>جديد هيتزامن</div>
                    <div style={{fontSize:FS+4,fontWeight:800,color:T.ok}}>{pv.newTxns.length}</div>
                  </div>
                  <div style={{padding:12,borderRadius:10,background:"#714867"+"08",border:"1px solid #714867"+"20",textAlign:"center"}}>
                    <div style={{fontSize:FS-2,color:T.textSec,marginBottom:3}}>اجمالي المبلغ</div>
                    <div style={{fontSize:FS+2,fontWeight:800,color:"#714867"}}>{fmt(pv.totalAmount)}</div>
                  </div>
                  {pv.existing>0&&<div style={{padding:12,borderRadius:10,background:T.warn+"08",border:"1px solid "+T.warn+"20",textAlign:"center"}}>
                    <div style={{fontSize:FS-2,color:T.textSec,marginBottom:3}}>متزامن قبل كده</div>
                    <div style={{fontSize:FS+2,fontWeight:800,color:T.warn}}>{pv.existing}</div>
                  </div>}
                  {pv.unmapped&&pv.unmapped.length>0&&<div style={{padding:12,borderRadius:10,background:T.err+"08",border:"1px solid "+T.err+"20",textAlign:"center"}}>
                    <div style={{fontSize:FS-2,color:T.textSec,marginBottom:3}}>بدون ربط</div>
                    <div style={{fontSize:FS+2,fontWeight:800,color:T.err}}>{pv.unmapped.length}</div>
                  </div>}
                </div>
                {/* Unmapped warning */}
                {pv.unmapped&&pv.unmapped.length>0&&<div style={{marginBottom:12,padding:10,borderRadius:8,background:T.err+"08",border:"1px solid "+T.err+"30"}}>
                  <div style={{fontSize:FS-1,fontWeight:700,color:T.err,marginBottom:4}}>⚠️ فئات بدون ربط حساب Odoo (هتُتخطى):</div>
                  <div style={{fontSize:FS-2,color:T.err}}>{pv.unmapped.join("، ")}</div>
                </div>}
                {/* Preview table */}
                {pv.newTxns.length>0&&<div style={{marginBottom:14,border:"1px solid "+T.brd,borderRadius:10,overflow:"hidden"}}>
                  <div style={{padding:10,background:T.bg,fontSize:FS-1,fontWeight:700,color:T.text,borderBottom:"1px solid "+T.brd}}>أول {Math.min(pv.newTxns.length,10)} حركات</div>
                  <div style={{maxHeight:"30vh",overflowY:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:FS-2}}>
                      <thead style={{position:"sticky",top:0,background:T.cardSolid,zIndex:1}}><tr>
                        {["التاريخ","النوع","الفئة","البيان","المبلغ"].map(h=><th key={h} style={{padding:"6px 8px",textAlign:"center",color:T.textSec,borderBottom:"1px solid "+T.brd,fontWeight:700}}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {pv.newTxns.slice(0,10).map((t,i)=><tr key={t.id} style={{borderBottom:"1px solid "+T.brd+"40",background:i%2===1?T.bg:""}}>
                          <td style={{padding:"5px 8px",textAlign:"center",direction:"ltr"}}>{t.date||"—"}</td>
                          <td style={{padding:"5px 8px",textAlign:"center"}}><span style={{padding:"1px 6px",borderRadius:4,fontSize:FS-3,fontWeight:700,background:t.type==="in"?T.ok+"15":T.err+"15",color:t.type==="in"?T.ok:T.err}}>{t.type==="in"?"داخل":"خارج"}</span></td>
                          <td style={{padding:"5px 8px",textAlign:"center"}}>{t.category||"—"}</td>
                          <td style={{padding:"5px 8px",textAlign:"right",maxWidth:250,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.desc||"—"}</td>
                          <td style={{padding:"5px 8px",textAlign:"center",fontWeight:700,color:"#714867"}}>{fmt(t.amount)}</td>
                        </tr>)}
                      </tbody>
                    </table>
                  </div>
                  {pv.newTxns.length>10&&<div style={{padding:8,background:T.bg,fontSize:FS-2,color:T.textMut,textAlign:"center",borderTop:"1px solid "+T.brd}}>+{pv.newTxns.length-10} حركة أخرى</div>}
                </div>}
                {/* Confirmation input */}
                {pv.newTxns.length>0&&<div style={{padding:14,borderRadius:10,background:T.warn+"06",border:"2px dashed "+T.warn+"40",marginBottom:14}}>
                  <div style={{fontSize:FS-1,fontWeight:700,color:T.warn,marginBottom:8}}>⚠️ للتأكيد، اكتب كلمة <b>"تزامن"</b> في الخانة تحت:</div>
                  <input value={odooSyncPopup.confirmText} onChange={e=>setOdooSyncPopup(p=>({...p,confirmText:e.target.value}))} placeholder="اكتب: تزامن" style={{width:"100%",padding:"10px 14px",borderRadius:8,border:"2px solid "+(canSync?T.ok:T.brd),fontSize:FS,fontFamily:"inherit",background:T.inputBg,color:T.text,fontWeight:700,textAlign:"center",boxSizing:"border-box"}}/>
                  {odooSyncPopup.confirmText&&odooSyncPopup.confirmText!=="تزامن"&&<div style={{fontSize:FS-2,color:T.err,marginTop:4,textAlign:"center"}}>يجب أن تكتب كلمة "تزامن" تماماً</div>}
                </div>}
              </>}
              {/* Actions */}
              <div style={{display:"flex",gap:8,justifyContent:"space-between",paddingTop:12,borderTop:"1px solid "+T.brd}}>
                <Btn onClick={()=>setOdooSyncPopup(p=>({...p,step:"filters",confirmText:""}))} style={{background:T.bg,color:T.textSec,border:"1px solid "+T.brd}}>← رجوع للفلاتر</Btn>
                <div style={{display:"flex",gap:8}}>
                  <Btn onClick={closePopup} style={{background:T.bg,color:T.textSec,border:"1px solid "+T.brd}}>إلغاء</Btn>
                  <Btn primary onClick={doSync} disabled={!canSync} style={{background:canSync?T.ok:T.textMut,color:"#fff",opacity:canSync?1:0.5}}>🔗 تأكيد التزامن</Btn>
                </div>
              </div>
            </div>
          </div>;
        }
        return null;
      })()}

      {showForm&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={()=>{setShowForm(false);setEditId(null)}}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:600,maxHeight:"85vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div style={{fontSize:FS+2,fontWeight:800,color:T.accent}}>{editId?"✏️ تعديل حركة":"+ حركة جديدة"}</div>
            <Btn ghost small onClick={()=>{setShowForm(false);setEditId(null)}}>✕</Btn>
          </div>
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:12}}>
          <div style={{gridColumn:isMob?"1":"1 / -1"}}><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>النوع</label><div style={{display:"flex",gap:6,marginTop:4}}>
            <div onClick={()=>setTxType("in")} style={{flex:1,padding:"12px 0",borderRadius:10,textAlign:"center",cursor:"pointer",fontWeight:700,fontSize:FS,background:txType==="in"?T.ok+"15":"transparent",border:"2px solid "+(txType==="in"?T.ok:T.brd),color:txType==="in"?T.ok:T.textSec}}>↓ وارد</div>
            <div onClick={()=>setTxType("out")} style={{flex:1,padding:"12px 0",borderRadius:10,textAlign:"center",cursor:"pointer",fontWeight:700,fontSize:FS,background:txType==="out"?T.err+"15":"transparent",border:"2px solid "+(txType==="out"?T.err:T.brd),color:txType==="out"?T.err:T.textSec}}>↑ منصرف</div>
          </div></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>المبلغ</label><Inp type="number" value={txAmount} onChange={setTxAmount} placeholder="0.00"/></div>
          <div style={{gridColumn:"1 / -1"}}><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>نوع الحركة</label><Sel value={txCategory} onChange={v=>{setTxCategory(v);setTxPartyId("");setTxPartyType("");setPartySearch("");
            if(v==="دفعة عميل")setTxPartyType("customer");
            else if(v==="دفعة مورد")setTxPartyType("supplier");
            else if(v==="تشغيل خارجي")setTxPartyType("workshop");
            else if(v==="مرتبات")setTxPartyType("employee");
          }}><option value="">— اختر —</option>{(txType==="in"?resolvedInCats:resolvedOutCats).map(c=><option key={c} value={c}>{c}</option>)}</Sel>
          {txPartyId&&(txCategory==="دفعة عميل"||txCategory==="دفعة مورد"||txCategory==="تشغيل خارجي"||txCategory==="مرتبات")&&(()=>{const list=txPartyType==="customer"?customers:txPartyType==="supplier"?suppliers:txPartyType==="employee"?(data.employees||[]).filter(e=>!e.inactive):workshops;const p=list.find(x=>x.id===txPartyId||x.name===txPartyId);if(!p)return null;
            const icon=txPartyType==="customer"?"🧑 العميل:":txPartyType==="supplier"?"🏭 المورد:":txPartyType==="employee"?"👷 الموظف:":"🔧 الورشة:";
            return<div style={{padding:"6px 10px",borderRadius:8,background:T.accent+"08",border:"1px solid "+T.accent+"30",display:"flex",alignItems:"center",justifyContent:"space-between",gap:6,marginTop:6}}>
              <div><span style={{fontSize:FS-2,color:T.textMut}}>{icon}</span> <b style={{color:T.accent,fontSize:FS-1}}>{p.name}</b>{p.phone&&<span style={{fontSize:FS-3,color:T.textMut,marginRight:6}}> • {p.phone}</span>}</div>
              <span onClick={()=>{setTxPartyId("");setPartySearch("")}} style={{cursor:"pointer",fontSize:FS-2,color:T.err,padding:"2px 8px",borderRadius:6,background:T.err+"08",border:"1px solid "+T.err+"20"}}>✕ تغيير</span>
            </div>})()}
          {/* Inline party list */}
          {!txPartyId&&(txCategory==="دفعة عميل"||txCategory==="دفعة مورد"||txCategory==="تشغيل خارجي"||txCategory==="مرتبات")&&(()=>{
            const list=txPartyType==="customer"?customers:txPartyType==="supplier"?suppliers:txPartyType==="employee"?(data.employees||[]).filter(e=>!e.inactive):workshops;
            const title=txPartyType==="customer"?"اختر عميل":txPartyType==="supplier"?"اختر مورد":txPartyType==="employee"?"اختر موظف":"اختر ورشة";
            const q=partySearchDeb.toLowerCase();
            const filtered=list.filter(p=>!q||(p.name||"").toLowerCase().includes(q)||(p.phone||"").includes(q));
            return<div style={{border:"1px solid "+T.accent+"30",borderRadius:10,padding:10,background:T.bg,marginTop:6}}>
              <div style={{fontSize:FS-1,fontWeight:700,color:T.accent,marginBottom:6}}>{title}</div>
              <input value={partySearch} onChange={e=>setPartySearch(e.target.value)} placeholder="🔍 بحث..." style={{width:"100%",padding:"6px 10px",borderRadius:8,border:"1px solid "+T.brd,fontSize:FS-1,fontFamily:"inherit",background:T.inputBg,color:T.text,marginBottom:6,boxSizing:"border-box"}}/>
              <div style={{maxHeight:150,overflowY:"auto",display:"flex",flexDirection:"column",gap:3}}>
                {filtered.length>0?filtered.map(p=>{const keyId=p.id||p.name;
                  return<div key={keyId} onClick={()=>{
                    setTxPartyId(keyId);setPartySearch("");
                    if(!txDesc.trim()){
                      if(txPartyType==="customer")setTxDesc("دفعة من "+p.name);
                      else if(txPartyType==="supplier")setTxDesc("دفع لـ "+p.name);
                      else if(txPartyType==="employee")setTxDesc("سلفة "+p.name);
                      else setTxDesc(wsDesc(p.name,txCategory==="مشتريات"))}
                  }} style={{padding:"7px 10px",borderRadius:8,border:"1px solid "+T.brd,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",background:T.cardSolid,transition:"all 0.1s"}} onMouseEnter={e=>e.currentTarget.style.background=T.accent+"08"} onMouseLeave={e=>e.currentTarget.style.background=T.cardSolid}>
                    <span style={{fontWeight:600,fontSize:FS-1}}>{p.name}</span>
                    {p.phone&&<span style={{fontSize:FS-3,color:T.textMut,direction:"ltr"}}>{p.phone}</span>}
                  </div>}):<div style={{textAlign:"center",padding:10,color:T.textMut,fontSize:FS-2}}>لا توجد نتائج</div>}
              </div>
            </div>})()}</div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>حساب جاري</label><Sel value={txAccount} onChange={setTxAccount}>{accounts.map(a=><option key={a} value={a}>{a}</option>)}</Sel></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>بيان</label><Inp value={txDesc} onChange={setTxDesc} placeholder="وصف الحركة"/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>ملاحظات</label><Inp value={txNotes} onChange={setTxNotes} placeholder="ملاحظات إضافية"/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>التاريخ</label><Inp type="date" value={txDate} onChange={setTxDate}/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>الموسم</label><Inp value={txSeason} onChange={setTxSeason} placeholder={data.activeSeason||"W26"}/></div>
        </div>
        <div style={{marginTop:16,display:"flex",gap:8,justifyContent:"flex-end"}}><Btn ghost onClick={()=>{setShowForm(false);setEditId(null)}}>إلغاء</Btn><Btn primary onClick={saveTx}>{editId?"💾 حفظ التعديل":"💾 حفظ"}</Btn></div>
        </div>
      </div>}

      {/* Filters */}

      <Card title={"📒 سجل اليومية ("+filtered.length+" حركة)"}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12,alignItems:"flex-end"}}>
          <div><div style={{fontSize:FS-3,color:T.textSec,fontWeight:600,marginBottom:2}}>النوع</div><Sel value={filterType} onChange={setFilterType} style={{width:80}}><option>الكل</option><option>وارد</option><option>منصرف</option></Sel></div>
          <div><div style={{fontSize:FS-3,color:T.textSec,fontWeight:600,marginBottom:2}}>التصنيف</div><Sel value={filterCat} onChange={setFilterCat} style={{width:120}}><option>الكل</option>{ALL_CATS.map(c=><option key={c}>{c}</option>)}</Sel></div>
          <div><div style={{fontSize:FS-3,color:T.textSec,fontWeight:600,marginBottom:2}}>الحساب</div><Sel value={filterAcc} onChange={setFilterAcc} style={{width:110}}><option>الكل</option>{accounts.map(a=><option key={a}>{a}</option>)}</Sel></div>
          <div><div style={{fontSize:FS-3,color:T.textSec,fontWeight:600,marginBottom:2}}>الشهر</div><Inp type="month" value={filterMonth} onChange={v=>{setFilterMonth(v);setFilterDay("")}} style={{width:130}}/></div>
          <div><div style={{fontSize:FS-3,color:T.textSec,fontWeight:600,marginBottom:2}}>اليوم</div><Inp type="date" value={filterDay} onChange={v=>{setFilterDay(v);setFilterMonth("")}} style={{width:130}}/></div>
          {(filterMonth||filterDay)&&<Btn small ghost onClick={()=>{setFilterMonth("");setFilterDay("")}} style={{marginBottom:2}}>✕</Btn>}
          <div style={{flex:isMob?1:"0 0 auto"}}><div style={{fontSize:FS-3,color:T.textSec,fontWeight:600,marginBottom:2}}>بحث</div><Inp value={filterSearch} onChange={setFilterSearch} placeholder="🔍 بيان / ملاحظات..." style={{width:isMob?"100%":160}}/></div>
          {filterSearch&&<Btn small ghost onClick={()=>setFilterSearch("")} style={{marginBottom:2}}>✕</Btn>}
          {/* V15.44: Print-filtered button — always visible, prints whatever is currently shown */}
          <span onClick={()=>{
            /* Build filter summary for the report header */
            const parts=[];
            if(filterType&&filterType!=="الكل")parts.push("النوع: "+filterType);
            if(filterCat&&filterCat!=="الكل")parts.push("التصنيف: "+filterCat);
            if(filterAcc&&filterAcc!=="الكل")parts.push("الحساب: "+filterAcc);
            if(filterDay)parts.push("اليوم: "+filterDay);
            else if(filterMonth)parts.push("الشهر: "+filterMonth);
            if(filterSearch.trim())parts.push("بحث: "+filterSearch.trim());
            const summary=parts.length>0?parts.join(" • "):"كل الحركات";
            /* Special case: single day with no other filters → use richer daily report (has opening/closing balance) */
            if(filterDay&&parts.length===1){printDaily(filterDay,filterAcc&&filterAcc!=="الكل"?filterAcc:null);return}
            printFiltered(filtered,summary);
          }} style={{cursor:"pointer",padding:"6px 12px",borderRadius:8,background:T.accent+"10",color:T.accent,fontWeight:700,fontSize:FS-1,marginBottom:2,border:"1px solid "+T.accent+"30"}} title="طباعة الحركات المعروضة دلوقتي بالفلاتر المفعّلة">🖨 طباعة المعروض</span>

          {/* V16.20: compact filtered totals — inline with filters, only shown when any filter is active */}
          {(()=>{
            const filterActive=filterType!=="الكل"||filterCat!=="الكل"||filterAcc!=="الكل"||filterMonth||filterDay||filterSearchDeb;
            if(!filterActive)return null;
            const fIn=filtered.filter(t=>t.type==="in").reduce((s,t)=>s+(Number(t.amount)||0),0);
            const fOut=filtered.filter(t=>t.type==="out").reduce((s,t)=>s+(Number(t.amount)||0),0);
            return<>
              <div style={{padding:"6px 12px",borderRadius:8,background:"#10B98112",border:"1px solid #10B98140",fontWeight:700,fontSize:FS-1,marginBottom:2,display:"flex",alignItems:"center",gap:6,whiteSpace:"nowrap"}}>
                <span style={{color:"#047857"}}>↓ وارد</span>
                <span style={{color:"#047857",fontWeight:800,fontVariantNumeric:"tabular-nums"}}>{fmt0(fIn)}</span>
              </div>
              <div style={{padding:"6px 12px",borderRadius:8,background:"#EF444412",border:"1px solid #EF444440",fontWeight:700,fontSize:FS-1,marginBottom:2,display:"flex",alignItems:"center",gap:6,whiteSpace:"nowrap"}}>
                <span style={{color:"#B91C1C"}}>↑ منصرف</span>
                <span style={{color:"#B91C1C",fontWeight:800,fontVariantNumeric:"tabular-nums"}}>{fmt0(fOut)}</span>
              </div>
            </>;
          })()}
        </div>
        {withBalance.length>0?<div style={{overflowX:"auto"}}>
          {/* Bulk actions bar — appears when selections exist */}
          {selectedTxIds.size>0&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",marginBottom:10,borderRadius:10,background:T.err+"10",border:"1px solid "+T.err+"40"}}>
            <div style={{fontSize:FS-1,fontWeight:700,color:T.err}}>
              ☑️ محدد: <b>{selectedTxIds.size}</b> حركة
            </div>
            <div style={{display:"flex",gap:6}}>
              <Btn small ghost onClick={()=>setSelectedTxIds(new Set())} style={{fontSize:FS-2}}>✕ إلغاء التحديد</Btn>
              {canEdit&&<Btn small onClick={()=>{
                const selTxs=withBalance.filter(t=>selectedTxIds.has(t.id));
                const totalAmt=selTxs.reduce((s,t)=>s+(Number(t.amount)||0),0);
                const lockedCount=selTxs.filter(t=>isDayLocked(t.date)).length;
                const externalCount=selTxs.filter(t=>isExternalTx(t)).length;
                openConfirm({
                  title:"حذف "+selTxs.length+" حركة",
                  message:"سيتم حذف "+selTxs.length+" حركة بإجمالي مبلغ "+fmt0(totalAmt)+" ج.م نهائياً.\n\n"+
                    (externalCount>0?"⚠️ "+externalCount+" حركة مرتبطة بمصادر خارجية (الحذف هنا لن يؤثر على المصدر).\n":"")+
                    (lockedCount>0&&!isAdmin?"🔒 "+lockedCount+" حركة في أيام مقفولة (سيتم تخطيها).\n":"")+
                    (lockedCount>0&&isAdmin?"🔒 "+lockedCount+" حركة في أيام مقفولة (وصول المدير).\n":"")+
                    "\nهل أنت متأكد؟",
                  variant:"danger",confirmText:"حذف الكل",
                  onConfirm:()=>bulkDeleteTxs([...selectedTxIds])
                });
              }} style={{background:T.err,color:"#fff",border:"none",fontWeight:700}}>🗑️ حذف المحدد ({selectedTxIds.size})</Btn>}
            </div>
          </div>}
          <table style={{width:"100%",borderCollapse:"collapse",tableLayout:"auto"}}><thead><tr>
          {canEdit&&<th style={{padding:"7px 8px",textAlign:"center",fontSize:FS-2,color:T.textSec,borderBottom:"2px solid "+T.brd,fontWeight:700,width:30}}>
            <input type="checkbox"
              checked={withBalance.slice(0,limit).length>0&&withBalance.slice(0,limit).every(t=>selectedTxIds.has(t.id))}
              onChange={()=>{
                const visibleIds=withBalance.slice(0,limit).map(t=>t.id);
                const allSelected=visibleIds.every(id=>selectedTxIds.has(id));
                if(allSelected){setSelectedTxIds(prev=>{const n=new Set(prev);visibleIds.forEach(id=>n.delete(id));return n})}
                else{setSelectedTxIds(prev=>{const n=new Set(prev);visibleIds.forEach(id=>n.add(id));return n})}
              }}
              title="تحديد/إلغاء الكل"
              style={{cursor:"pointer",width:16,height:16}}/>
          </th>}
          {/* V16.40: dropped ملاحظات, swapped order to: نوع الحركة then بيان (desc takes remaining width)
              V16.47: added "بواسطة" column showing who recorded the entry */}
          {["الرصيد","تاريخ","اليوم","وارد","منصرف","نوع الحركة","بيان","حساب جاري","موسم","بواسطة",""].map(h=><th key={h} style={{padding:"7px 8px",textAlign:"right",fontSize:FS-2,color:T.textSec,borderBottom:"2px solid "+T.brd,fontWeight:700,whiteSpace:"nowrap"}}>{h}</th>)}
        </tr></thead><tbody>
          {withBalance.slice(0,limit).map(t=>{const locked=isDayLocked(t.date);const isEd=inlineEdit===t.id;const d_=inlineDraft;
            const inpS={padding:"3px 6px",borderRadius:6,border:"1px solid "+T.accent+"40",fontSize:FS-2,fontFamily:"inherit",background:T.inputBg,color:T.text};
            const startEdit=()=>{setInlineEdit(t.id);setInlineDraft({type:t.type,amount:String(t.amount||""),desc:t.desc||"",notes:t.notes||"",category:t.category||"",date:t.date||"",account:t.account||""})};
            const saveInline=()=>{upConfig(cfg=>{const tx=(cfg.treasury||[]).find(x=>x.id===t.id);if(tx){
              const newAmt=parseFloat(d_.amount)||tx.amount;
              const newDate=d_.date||tx.date;
              const newNotes=d_.notes;
              tx.type=d_.type||tx.type;tx.amount=newAmt;tx.desc=d_.desc;tx.notes=newNotes;tx.category=d_.category;tx.date=newDate;tx.account=d_.account||tx.account;tx.day=dayName(newDate);tx.updatedBy=userName;tx.updatedAt=new Date().toISOString();
              /* V17.3 FIX: Sync linked records when amount/date changes via inline edit.
                 Previously inline edit only updated treasury, leaving custPayments,
                 supplierPayments, wsPayments, and hrLog out of sync. This caused
                 employee advance records to show stale amounts and customer/supplier
                 statements to be wrong after inline-editing a treasury entry. */
              if(tx.wsPaymentId&&cfg.wsPayments){
                const wp=cfg.wsPayments.find(p=>p.id===tx.wsPaymentId);
                if(wp){wp.amount=newAmt;wp.date=newDate;wp.notes=newNotes}
              }
              if(cfg.custPayments){
                const cp=cfg.custPayments.find(p=>p.treasuryTxId===tx.id);
                if(cp){cp.amount=newAmt;cp.date=newDate;cp.note=newNotes||tx.desc}
              }
              if(cfg.supplierPayments){
                const sp=cfg.supplierPayments.find(p=>p.treasuryTxId===tx.id);
                if(sp){sp.amount=newAmt;sp.date=newDate;sp.note=newNotes||tx.desc}
              }
              if(tx.hrLogId&&cfg.hrLog){
                const hl=cfg.hrLog.find(l=>l.id===tx.hrLogId);
                if(hl){hl.amount=newAmt;hl.date=newDate;hl.desc=newNotes||tx.desc||hl.desc}
              }
            }});setInlineEdit(null);setInlineDraft({});showToast("✓ تم التعديل")};
            const cancelInline=()=>{setInlineEdit(null);setInlineDraft({})};
            const isChecked=selectedTxIds.has(t.id);
            return<tr key={t.id} style={{borderBottom:"1px solid "+T.brd,opacity:locked?0.8:1,background:isChecked?T.err+"06":isEd?T.accent+"06":locked?T.bg:""}}>
            {canEdit&&<td style={{padding:"6px 8px",textAlign:"center"}}>
              <input type="checkbox" checked={isChecked} onChange={()=>toggleTxSel(t.id)} style={{cursor:"pointer",width:16,height:16}} title="تحديد للحذف المجمع"/>
            </td>}
            <td style={{padding:"6px 8px",fontSize:FS-1,fontWeight:800,color:t.runBal>=0?"#0D9488":T.err,whiteSpace:"nowrap"}}>{fmt0(t.runBal)}</td>
            <td style={{padding:"6px 8px",fontSize:FS-1,whiteSpace:"nowrap"}}>{isEd?<input type="date" value={d_.date} onChange={e=>setInlineDraft(p=>({...p,date:e.target.value}))} style={{...inpS,width:120}}/>:<>{t.date}{locked?" 🔒":""}</>}</td>
            <td style={{padding:"6px 8px",fontSize:FS-2,color:T.textMut,whiteSpace:"nowrap"}}>{t.day||""}</td>
            <td style={{padding:"6px 8px",fontSize:FS,fontWeight:700,color:T.ok,whiteSpace:"nowrap"}}>{isEd?(d_.type==="in"?<input type="number" value={d_.amount} onChange={e=>setInlineDraft(p=>({...p,amount:e.target.value}))} style={{...inpS,width:80,color:T.ok,fontWeight:700}}/>:<span onClick={()=>setInlineDraft(p=>({...p,type:"in"}))} style={{cursor:"pointer",color:T.textMut,fontSize:FS-2}}>↓</span>):(t.type==="in"?fmt0(t.amount):"")}</td>
            <td style={{padding:"6px 8px",fontSize:FS,fontWeight:700,color:T.err,whiteSpace:"nowrap"}}>{isEd?(d_.type==="out"?<input type="number" value={d_.amount} onChange={e=>setInlineDraft(p=>({...p,amount:e.target.value}))} style={{...inpS,width:80,color:T.err,fontWeight:700}}/>:<span onClick={()=>setInlineDraft(p=>({...p,type:"out"}))} style={{cursor:"pointer",color:T.textMut,fontSize:FS-2}}>↑</span>):(t.type==="out"?fmt0(t.amount):"")}</td>
            {/* V16.40: نوع الحركة (category) moved BEFORE بيان (desc); ملاحظات removed entirely. */}
            <td style={{padding:"6px 8px",whiteSpace:"nowrap"}}>{isEd?<select value={d_.category} onChange={e=>setInlineDraft(p=>({...p,category:e.target.value}))} style={{...inpS,width:100}}><option value="">—</option>{(d_.type==="in"?resolvedInCats:resolvedOutCats).map(c=><option key={c}>{c}</option>)}</select>:<span style={{padding:"2px 6px",borderRadius:5,fontSize:FS-2,fontWeight:600,background:t.type==="in"?T.ok+"12":T.err+"12",color:t.type==="in"?T.ok:T.err,whiteSpace:"nowrap"}}>{t.category||"—"}</span>}</td>
            {/* بيان — flex column, takes all remaining horizontal space; full text shown on hover via title */}
            <td style={{padding:"6px 8px",fontSize:FS-1,width:"100%"}}>{isEd?<input value={d_.desc} onChange={e=>setInlineDraft(p=>({...p,desc:e.target.value}))} style={{...inpS,width:"100%"}}/>:<span title={t.desc||""} style={{display:"block",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.desc||"—"}{t.notes?<span style={{color:T.textMut,fontWeight:500,marginInlineStart:6}}>· {t.notes}</span>:""}</span>}</td>
            <td style={{padding:"6px 8px",fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>{isEd?<select value={d_.account} onChange={e=>setInlineDraft(p=>({...p,account:e.target.value}))} style={{...inpS,width:90}}>{accounts.map(a=><option key={a}>{a}</option>)}</select>:t.account||""}</td>
            <td style={{padding:"6px 8px",fontSize:FS-2,color:T.textMut,whiteSpace:"nowrap"}}>{t.season||""}</td>
            {/* V16.47: who recorded this entry (and edited if changed) */}
            <td style={{padding:"6px 8px",fontSize:FS-3,color:T.textSec,whiteSpace:"nowrap"}}>
              {(()=>{
                const by=t.by||"—";
                const edited=t.updatedBy&&t.updatedBy!==t.by;
                return<span title={edited?"أنشأ: "+by+" • عدّل: "+t.updatedBy:"أنشأ: "+by} style={{display:"inline-flex",alignItems:"center",gap:4}}>
                  <span style={{padding:"2px 7px",borderRadius:5,background:T.bg,border:"1px solid "+T.brd,fontWeight:700,color:T.text}}>{by}</span>
                  {edited&&<span style={{fontSize:FS-4,color:T.warn,fontWeight:800}} title={"عدّله: "+t.updatedBy}>✏️</span>}
                </span>;
              })()}
            </td>
            <td style={{padding:"6px 8px"}}>{canEdit&&(()=>{
              if(isEd)return<div style={{display:"flex",gap:3}}><span onClick={()=>{if(isAdmin&&lockEdit)logLockBypass("edit",t);saveInline()}} style={{cursor:"pointer",padding:"2px 6px",borderRadius:4,fontSize:10,background:T.ok+"12",color:T.ok,fontWeight:700}}>💾</span><span onClick={cancelInline} style={{cursor:"pointer",padding:"2px 6px",borderRadius:4,fontSize:10,background:T.err+"12",color:T.err,fontWeight:700}}>✕</span></div>;
              const allowEdit=canModify(t);const allowDel=canDelete(t);const external=isExternalTx(t);
              if(locked&&!isAdmin)return<span style={{fontSize:11,color:T.textMut}} title="اليوم مقفول — للمدير فقط">🔒</span>;
              /* Non-admin: if BOTH edit and delete are locked, show a single lock icon instead of buttons */
              if(!isAdmin&&!allowEdit&&!allowDel)return<span style={{fontSize:11,color:T.textMut}} title="التعديل والحذف مقفولين من الإعدادات">🔒</span>;
              return<div style={{display:"flex",gap:3,alignItems:"center"}}>
                {locked&&isAdmin&&<span style={{fontSize:10,color:T.warn}} title="اليوم مقفول — وصول المدير">🔒</span>}
                {isAdmin&&(lockEdit||lockDelete)&&<span style={{fontSize:10,color:T.warn}} title={"قفل من الإعدادات — وصول المدير"+(lockEdit?" (تعديل)":"")+(lockDelete?" (حذف)":"")}>⚠️</span>}
                {external&&<span style={{fontSize:10,color:"#8B5CF6"}} title={"حركة من "+externalSourceLabel(t)}>🔗</span>}
                {/* V16.60: Print formal cash receipt for this entry. Resolves the
                    party (customer/supplier) from tx.custId/supplierId so the receipt
                    includes their phone/address when known.
                    V16.62: Use `data` not `config` — this component receives `data`
                    as the merged config object; `config` was undefined and threw
                    ReferenceError at runtime when the button was clicked. */}
                <span onClick={()=>{
                  const partyInfo=t.custId?customers.find(c=>c.id===t.custId)
                    :t.supplierId?suppliers.find(s=>s.id===t.supplierId)
                    :null;
                  printCashReceipt(t,partyInfo,{factoryName:data.factoryName,logo:data.logo,address:data.address,phone:data.phone});
                }} style={{cursor:"pointer",fontSize:11}} title={t.type==="in"?"طباعة إيصال استلام":"طباعة إيصال صرف"}>🧾</span>
                {allowEdit&&<span onClick={()=>startEdit()} style={{cursor:"pointer",fontSize:11}} title={isAdmin&&lockEdit?"تعديل (تجاوز قفل)":"تعديل"}>✏️</span>}
                {allowDel&&<span onClick={()=>openConfirm({title:"حذف حركة",message:(external?"⚠️ حركة مرتبطة بـ "+externalSourceLabel(t)+" — الحذف هنا لن يؤثر على المصدر.\n\n":"")+(isAdmin&&lockDelete?"⚠️ الحذف مقفول من الإعدادات — سيتم تسجيل تجاوزك في سجل الأمان.\n\n":"")+"سيتم حذف الحركة نهائياً.\n"+(t.desc||"")+"\nالمبلغ: "+fmt(t.amount)+" ج.م",variant:"danger",onConfirm:()=>{if(isAdmin&&lockDelete)logLockBypass("delete",t);delTx(t.id)}})} style={{cursor:"pointer",fontSize:11,color:T.err}} title={isAdmin&&lockDelete?"حذف (تجاوز قفل)":"حذف"}>✕</span>}
              </div>})()}</td>
          </tr>})}
        </tbody></table></div>:<div style={{textAlign:"center",padding:30,color:T.textMut}}>لا توجد حركات</div>}
        {withBalance.length>limit&&<div style={{textAlign:"center",marginTop:10}}><Btn small onClick={()=>setLimit(p=>p+50)}>عرض المزيد</Btn></div>}
      </Card>
    </div>}

    {/* ══ TRANSFERS VIEW ══ */}
    {view==="transfers"&&<div>
      {canEdit&&accountsData.length>=2&&<div style={{marginBottom:14}}><Btn onClick={()=>{setTfDate(new Date().toISOString().split("T")[0]);setShowTransfer(true)}} style={{background:"#8B5CF615",color:"#8B5CF6",border:"1px solid #8B5CF640",fontWeight:700}}>+ تحويل جديد</Btn></div>}
      {transfers.length===0?<Card><div style={{textAlign:"center",padding:40,color:T.textMut}}>لا يوجد تحويلات بعد — اضغط "+ تحويل جديد"</div></Card>
      :<Card title={"🔄 سجل التحويلات ("+transfers.length+")"}>
        {(()=>{
          /* V16.13: pending first, then confirmed — both sorted newest-first within group */
          const pending=transfers.filter(t=>t.status==="pending");
          const confirmed=transfers.filter(t=>t.status!=="pending");
          const ordered=[...pending,...confirmed];
          return<div style={{display:"flex",flexDirection:"column",gap:10}}>
          {pending.length>0&&isAdmin&&<div style={{padding:"8px 12px",borderRadius:8,background:"#F59E0B15",border:"1px solid #F59E0B40",fontSize:FS-1,color:"#92400E",fontWeight:700}}>⏳ {pending.length} طلب{pending.length>1?"ات":""} تحويل بانتظار موافقتك</div>}
          {ordered.map(tf=>{
            const isPending=tf.status==="pending";
            const borderColor=isPending?"#F59E0B":"#8B5CF630";
            const bgColor=isPending?"#FEF3C7":"#8B5CF606";
            return<div key={tf.id} style={{padding:14,borderRadius:12,border:"2px solid "+borderColor,background:bgColor}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                    {isPending&&<span style={{fontSize:FS-2,fontWeight:800,color:"#92400E",padding:"2px 8px",borderRadius:6,background:"#F59E0B25",border:"1px solid #F59E0B"}}>⏳ بانتظار الموافقة</span>}
                    <span style={{fontSize:FS,fontWeight:800,color:T.err}}>{tf.fromAccount}</span>
                    <span style={{fontSize:18,color:"#8B5CF6"}}>→</span>
                    <span style={{fontSize:FS,fontWeight:800,color:T.ok}}>{tf.toAccount}</span>
                  </div>
                  {tf.note&&<div style={{fontSize:FS-2,color:T.textMut,marginBottom:4}}>💬 {tf.note}</div>}
                  <div style={{fontSize:FS-3,color:T.textMut}}>{"📅 "+tf.date+" • طلبه: "+tf.sentBy}{tf.approvedBy?" • وافق: "+tf.approvedBy:""}</div>
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
                  <span style={{fontSize:FS+4,fontWeight:800,color:isPending?"#92400E":"#8B5CF6"}}>{fmt(tf.amount)}</span>
                  {isPending&&isAdmin&&<div style={{display:"flex",gap:6}}>
                    <span onClick={()=>openConfirm({title:"تأكيد التحويل",message:"سيتم تسجيل منصرف من "+tf.fromAccount+" ووارد على "+tf.toAccount+"\nالمبلغ: "+fmt(tf.amount)+" ج.م",variant:"success",onConfirm:()=>approveTransfer(tf.id)})} style={{cursor:"pointer",fontSize:11,color:"#fff",padding:"4px 10px",borderRadius:6,background:T.ok,fontWeight:700}}>✓ تأكيد</span>
                    <span onClick={()=>openConfirm({title:"رفض الطلب",message:"سيتم حذف طلب التحويل نهائياً.\nمن "+tf.fromAccount+" إلى "+tf.toAccount+"\nالمبلغ: "+fmt(tf.amount)+" ج.م",variant:"danger",onConfirm:()=>rejectTransfer(tf.id)})} style={{cursor:"pointer",fontSize:11,color:"#fff",padding:"4px 10px",borderRadius:6,background:T.err,fontWeight:700}}>✗ رفض</span>
                  </div>}
                  {!isPending&&canEdit&&<div style={{display:"flex",gap:6}}>
                    <span onClick={()=>setEditTf({id:tf.id,fromAccount:tf.fromAccount,toAccount:tf.toAccount,amount:String(tf.amount),note:tf.note||"",date:tf.date})} style={{cursor:"pointer",fontSize:11,color:"#8B5CF6",padding:"2px 8px",borderRadius:6,border:"1px solid #8B5CF640",background:"#8B5CF608"}}>✏️ تعديل</span>
                    <span onClick={()=>openConfirm({title:"حذف التحويل",message:"سيتم حذف التحويل وحركاته في السجلين معاً.\nمن "+tf.fromAccount+" إلى "+tf.toAccount+"\nالمبلغ: "+fmt(tf.amount)+" ج.م",variant:"danger",onConfirm:()=>deleteTransfer(tf.id)})} style={{cursor:"pointer",fontSize:11,color:T.err,padding:"2px 8px",borderRadius:6,border:"1px solid "+T.err+"30",background:T.err+"08"}}>🗑️ حذف</span>
                  </div>}
                </div>
              </div>
            </div>})}
        </div>;})()}
      </Card>}
    </div>}

    {/* ══ CHECKS VIEW — الشيكات ══ */}
    {view==="checks"&&<div>
      {(()=>{
        const receivable=checks.filter(c=>c.type==="receivable");
        const payable=checks.filter(c=>c.type==="payable");
        /* V16.34: Wallet balance = sum of checks still IN the wallet (status معلق only).
           A check leaves the wallet when collected/paid/endorsed/bounced/cancelled. */
        const totalRcv=receivable.filter(c=>c.status==="معلق").reduce((s,c)=>s+(Number(c.amount)||0),0);
        const totalPay=payable.filter(c=>c.status==="معلق").reduce((s,c)=>s+(Number(c.amount)||0),0);
        const saveCheck=()=>{const amt=parseFloat(chkAmount);if(!amt||!chkParty.trim()){playBeep("error");return}
          /* V16.35: Helper to add N months to YYYY-MM-DD safely (handles month-end clamping) */
          const addMonths=(dateStr,n)=>{
            if(!dateStr)return"";
            const [y,m,d]=dateStr.split("-").map(Number);
            const target=new Date(y,m-1+n,d);
            /* Clamp to last day of target month if d overflowed (e.g. Jan 31 + 1 month = Feb 28/29) */
            if(target.getMonth()!==(m-1+n+1200)%12){target.setDate(0)}
            const yy=target.getFullYear();const mm=String(target.getMonth()+1).padStart(2,"0");const dd=String(target.getDate()).padStart(2,"0");
            return yy+"-"+mm+"-"+dd;
          };
          /* Helper: bump a numeric check number by n. Non-numeric checkNo just gets a -N suffix. */
          const bumpCheckNo=(no,n)=>{
            if(!no)return"";
            const trimmed=String(no).trim();
            const numMatch=trimmed.match(/^(\D*)(\d+)(\D*)$/);
            if(numMatch){
              const prefix=numMatch[1]||"";const digits=numMatch[2];const suffix=numMatch[3]||"";
              const next=String(Number(digits)+n).padStart(digits.length,"0");
              return prefix+next+suffix;
            }
            return trimmed+"-"+(n+1);
          };
          upConfig(d=>{if(!d.checks)d.checks=[];
            if(chkEditId){const ch=d.checks.find(c=>c.id===chkEditId);if(ch){ch.type=chkType;ch.amount=amt;ch.party=chkParty;ch.partyId=chkPartyId||null;ch.bank=chkBank;ch.checkNo=chkNumber;ch.date=chkDate;ch.dueDate=chkDueDate;ch.notes=chkNotes;ch.category=chkCategory||"";ch.updatedBy=userName}}
            else{
              /* V16.35: Batch mode — generate N checks. Otherwise just one. */
              const count=chkBatchEnabled?Math.max(1,Math.min(60,Number(chkBatchCount)||1)):1;
              const step=Math.max(0,Number(chkBatchMonthsStep)||0);
              /* Generate a shared batch id so the user can identify them later if needed */
              const batchId=count>1?gid():null;
              for(let i=0;i<count;i++){
                d.checks.push({
                  id:gid(),type:chkType,amount:amt,party:chkParty.trim(),partyId:chkPartyId||null,
                  bank:chkBank,
                  checkNo:bumpCheckNo(chkNumber,i),
                  date:chkDate||today,
                  dueDate:chkDueDate?addMonths(chkDueDate,i*step):"",
                  notes:chkNotes,category:chkCategory||"",status:"معلق",
                  batchId,batchIdx:batchId?i+1:null,batchTotal:batchId?count:null,
                  by:userName,createdAt:new Date().toISOString()
                });
              }
            }
          });
          setShowCheckForm(false);setChkAmount("");setChkParty("");setChkPartyId("");setChkBank("");setChkNumber("");setChkDate("");setChkDueDate("");setChkNotes("");setChkCategory("");setChkEditId(null);
          setChkBatchEnabled(false);
          showToast(chkBatchEnabled&&!chkEditId?("✓ تم حفظ "+(Math.max(1,Number(chkBatchCount)||1))+" شيك"):"✓ تم الحفظ");
        };
        const editCheck=(c)=>{setChkEditId(c.id);setChkType(c.type);setChkAmount(String(c.amount));setChkParty(c.party||"");setChkPartyId(c.partyId||"");setChkBank(c.bank||"");setChkNumber(c.checkNo||"");setChkDate(c.date||"");setChkDueDate(c.dueDate||"");setChkNotes(c.notes||"");setChkCategory(c.category||"");setShowCheckForm(true)};
        /* V16.34: Update check status with proper treasury + customer/supplier side effects.
           Statuses for receivable: معلق → محصل | مُظهّر | مرتد | ملغي
           Statuses for payable:    معلق → مدفوع | ملغي
           - محصل: cash inflow to treasury (+rcv account)
           - مدفوع: cash outflow from treasury (-pay account)
           - مرتد: customer's payment is reversed (they owe us again the amount).
                   NOT a treasury entry — the original receivable just falls off
                   the wallet. We add a "check_bounce" customer entry so the
                   customer statement reflects the reversal.
           - ملغي / مرتجع: just status flip, no treasury, no customer entry */
        const updateStatus=(id,status,statusDate,chosenAccount)=>{
          const dt=statusDate||today;
          upConfig(d=>{
            const ch=(d.checks||[]).find(c=>c.id===id);
            if(!ch)return;
            /* Always remove any previously-linked treasury entries for this check
               before applying the new status (idempotent re-toggle). */
            if(d.treasury)d.treasury=d.treasury.filter(t=>t.checkId!==id);
            ch.status=status;ch.statusDate=dt;ch.statusBy=userName;
            /* V18.0: Record which account the user chose (so we can show it on the check) */
            if(chosenAccount)ch.depositAccount=chosenAccount;
            if(!d.treasury)d.treasury=[];
            const chkCat=ch.category||(ch.type==="receivable"?"دفعة عميل":"دفعة مورد");
            /* Build a rich desc that surfaces check details where it matters */
            const det=(ch.checkNo?" #"+ch.checkNo:"")+(ch.bank?" — "+ch.bank:"")+(ch.dueDate?" — استحقاق "+ch.dueDate:"");
            /* V18.0: If the user picked a specific account at collect/pay time, use it.
               Otherwise fall back to the bank name (legacy behavior) or MAIN CASH. */
            const targetAccount=chosenAccount||ch.bank||"MAIN CASH";
            if(status==="محصل"){
              d.treasury.unshift({
                id:gid(),type:"in",amount:Number(ch.amount)||0,
                desc:"تحصيل شيك من "+(ch.party||"")+det,
                category:chkCat,account:targetAccount,season:d.activeSeason||"",
                date:dt,day:dayName(dt),
                custId:ch.type==="receivable"?ch.partyId||null:null,
                supplierId:ch.type==="payable"?ch.partyId||null:null,
                sourceType:"check_collect",checkId:ch.id,
                by:userName,createdAt:new Date().toISOString()
              });
            }
            if(status==="مدفوع"){
              d.treasury.unshift({
                id:gid(),type:"out",amount:Number(ch.amount)||0,
                desc:"صرف شيك لـ "+(ch.party||"")+det,
                category:chkCat,account:targetAccount,season:d.activeSeason||"",
                date:dt,day:dayName(dt),
                custId:ch.type==="receivable"?ch.partyId||null:null,
                supplierId:ch.type==="payable"?ch.partyId||null:null,
                sourceType:"check_pay",checkId:ch.id,
                by:userName,createdAt:new Date().toISOString()
              });
            }
            /* V16.34: Bounce — only meaningful for receivable. The original
               check is invalidated, the customer balance is reset (they still
               owe us). We mark the check; we don't fabricate a fake treasury
               entry. The customer statement gets rebuilt based on the check's
               status the next time it's queried. */
            if(status==="مرتد"){
              ch.bouncedAt=dt;
              /* Optional: log a notification so admin/account owner sees it */
              if(!d.notifications)d.notifications=[];
              d.notifications.unshift({
                id:gid(),type:"check_bounced",
                msg:"❌ شيك مرتد من "+(ch.party||"")+" — "+fmt(Number(ch.amount)||0)+" ج.م"+det,
                adminOnly:true,checkId:ch.id,read:false,
                by:userName,createdAt:new Date().toISOString()
              });
            }
          });
          showToast(status==="مرتد"?"❌ تم تسجيل الشيك كمرتد":status==="محصل"?"✅ تم التحصيل":status==="مدفوع"?"✅ تم الدفع":"✓ تم التحديث");
        };
        const delCheck=(id)=>{
          /* V16.65: Block direct deletion of non-pending checks — those have
             treasury/customer/supplier side effects that need unwinding via
             status-revert (e.g. unmark "محصل" → returns to "معلق" + removes
             the treasury entry). The cascade-on-delete used to do this implicitly,
             but it left orphaned wsPayment/custPayment trails in some cases.
             Forcing the user to revert first makes the data flow visible. */
          const refs=getReferences(data,"check",id);
          if(refs.length>0){
            const msg="هذا الشيك مرتبط بحركات مالية:\n"+refs.map(r=>"• "+r.label).join("\n")+"\n\nأرجع الحالة لـ \"معلق\" أولاً (من الزر ↩ إلغاء أو ↻ إعادة) ثم احذف.";
            openConfirm({title:"⛔ لا يمكن حذف الشيك",message:msg,variant:"danger",onConfirm:()=>{}});
            return;
          }
          upConfig(d=>{
          /* V15.9: Also remove linked treasury entries (if check was collected/paid) */
          const ch=(d.checks||[]).find(c=>c.id===id);
          d.checks=(d.checks||[]).filter(c=>c.id!==id);
          if(ch&&d.treasury){
            d.treasury=d.treasury.filter(t=>t.checkId!==id);
          }
          /* V16.33: Also remove endorsed-check supplier payments linked to this check */
          if(ch)d.supplierPayments=(d.supplierPayments||[]).filter(p=>p.checkId!==id||p.method!=="endorsed_check");
        });showToast("✓ تم حذف الشيك")};
        const filteredChecks=chkFilter==="الكل"?checks:checks.filter(c=>chkFilter==="أوراق قبض"?c.type==="receivable":c.type==="payable");
        const STATUS_COLORS={معلق:"#F59E0B",محصل:"#10B981",مدفوع:"#10B981","مُظهّر":"#8B5CF6",مرتجع:"#EF4444","مرتد":"#DC2626",ملغي:"#94A3B8"};
        /* V16.33: Endorse a customer check to a supplier.
           Conceptually: the check (receivable) changes ownership from us to the
           supplier — no cash flow happens. So we DO NOT create a treasury entry
           (the prior version did, mis-classifying it as outflow).
           What we do:
             - Mark check status="مُظهّر" with endorsedTo + date
             - Add supplierPayment (method:"endorsed_check") so supplier balance
               drops by the check amount
             - The check stays in d.checks[] for audit; it just no longer counts
               as a receivable. */
        const endorseCheck=(checkId,supplierId,endorseDate)=>{
          const sup=suppliers.find(s=>s.id===supplierId);if(!sup)return;
          const dt=endorseDate||today;
          upConfig(d=>{
            const ch=(d.checks||[]).find(c=>c.id===checkId);if(!ch)return;
            if(ch.status!=="معلق"){return}/* safety: only pending checks can be endorsed */
            ch.status="مُظهّر";
            ch.statusDate=dt;ch.statusBy=userName;
            ch.endorsedTo=sup.name;ch.endorsedToId=sup.id;ch.endorsedAt=dt;
            /* Register as a supplier payment — non-cash, marked as endorsed-check method */
            if(!d.supplierPayments)d.supplierPayments=[];
            d.supplierPayments.push({
              id:gid(),supplierId:sup.id,supplierName:sup.name,
              amount:Number(ch.amount)||0,
              method:"endorsed_check",/* used by supplier-statement filters */
              date:dt,
              notes:"تظهير شيك"+(ch.party?" مستلم من "+ch.party:"")+(ch.checkNo?" #"+ch.checkNo:"")+(ch.bank?" — "+ch.bank:""),
              checkId:ch.id,
              by:userName,createdAt:new Date().toISOString()
            });
          });
          setEndorsePopup(null);setEndorseSearch("");
          showToast("✅ تم تظهير الشيك لـ "+sup.name);
        };
        /* V16.33: Revert an endorsement — only if no further action was taken */
        const revertEndorse=async(checkId)=>{
          if(!await ask("إلغاء التظهير","سيتم إعادة الشيك لحالة معلق وحذف دفعة المورد المرتبطة به.",{danger:true}))return;
          upConfig(d=>{
            const ch=(d.checks||[]).find(c=>c.id===checkId);if(!ch||ch.status!=="مُظهّر")return;
            ch.status="معلق";delete ch.endorsedTo;delete ch.endorsedToId;delete ch.endorsedAt;
            ch.statusDate=today;ch.statusBy=userName;
            d.supplierPayments=(d.supplierPayments||[]).filter(p=>p.checkId!==checkId||p.method!=="endorsed_check");
          });
          showToast("↩️ تم إلغاء التظهير");
        };
        return<div>
          {/* V16.34: Wallet-style dashboard — main balances + activity breakdown */}
          <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:12,marginBottom:14}}>
            {/* Receivable wallet — like a bank account, but for customer checks */}
            <div style={{padding:18,borderRadius:14,background:"linear-gradient(135deg,"+T.ok+"12,"+T.ok+"04)",border:"2px solid "+T.ok+"30"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <div style={{fontSize:FS,color:T.textSec,fontWeight:700}}>📥 محفظة شيكات القبض</div>
                <span style={{fontSize:FS-2,padding:"2px 8px",borderRadius:10,background:T.ok+"20",color:T.ok,fontWeight:700}}>{receivable.filter(c=>c.status==="معلق").length} شيك</span>
              </div>
              <div style={{fontSize:28,fontWeight:900,color:T.ok,fontVariantNumeric:"tabular-nums"}}>{fmt0(totalRcv)}<span style={{fontSize:FS,color:T.textMut,fontWeight:600,marginRight:6}}>ج.م</span></div>
              <div style={{fontSize:FS-3,color:T.textMut,marginTop:4}}>الرصيد المعلق (لم يُحصَّل بعد)</div>
            </div>
            {/* Payable wallet */}
            <div style={{padding:18,borderRadius:14,background:"linear-gradient(135deg,"+T.err+"12,"+T.err+"04)",border:"2px solid "+T.err+"30"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <div style={{fontSize:FS,color:T.textSec,fontWeight:700}}>📤 محفظة شيكات الدفع</div>
                <span style={{fontSize:FS-2,padding:"2px 8px",borderRadius:10,background:T.err+"20",color:T.err,fontWeight:700}}>{payable.filter(c=>c.status==="معلق").length} شيك</span>
              </div>
              <div style={{fontSize:28,fontWeight:900,color:T.err,fontVariantNumeric:"tabular-nums"}}>{fmt0(totalPay)}<span style={{fontSize:FS,color:T.textMut,fontWeight:600,marginRight:6}}>ج.م</span></div>
              <div style={{fontSize:FS-3,color:T.textMut,marginTop:4}}>الرصيد المعلق (لم يُدفع بعد)</div>
            </div>
          </div>
          {/* Activity strip — collected, paid, endorsed, bounced */}
          <div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"repeat(4,1fr)",gap:8,marginBottom:14}}>
            {(()=>{
              const collected=receivable.filter(c=>c.status==="محصل").reduce((s,c)=>s+(Number(c.amount)||0),0);
              const paid=payable.filter(c=>c.status==="مدفوع").reduce((s,c)=>s+(Number(c.amount)||0),0);
              const endorsed=receivable.filter(c=>c.status==="مُظهّر").reduce((s,c)=>s+(Number(c.amount)||0),0);
              const bounced=receivable.filter(c=>c.status==="مرتد").reduce((s,c)=>s+(Number(c.amount)||0),0);
              const cards=[
                {label:"تم التحصيل",value:collected,color:T.ok,icon:"✅"},
                {label:"تم الدفع",value:paid,color:T.ok,icon:"✅"},
                {label:"تم تظهيره",value:endorsed,color:"#8B5CF6",icon:"📤"},
                {label:"شيكات مرتدة",value:bounced,color:"#DC2626",icon:"❌"}
              ];
              return cards.map(c=><div key={c.label} style={{padding:"10px 12px",borderRadius:10,background:c.color+"08",border:"1px solid "+c.color+"20",textAlign:"center"}}>
                <div style={{fontSize:FS-3,color:T.textMut,marginBottom:2}}>{c.icon} {c.label}</div>
                <div style={{fontSize:FS+2,fontWeight:800,color:c.color,fontVariantNumeric:"tabular-nums"}}>{fmt0(c.value)}</div>
              </div>);
            })()}
          </div>
          {/* Add button + filter */}
          <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
            {canEdit&&<Btn primary onClick={()=>{setChkEditId(null);setChkType("receivable");setChkAmount("");setChkParty("");setChkBank("");setChkNumber("");setChkDate(today);setChkDueDate("");setChkNotes("");setShowCheckForm(!showCheckForm)}}>{showCheckForm?"✕ إغلاق":"+ شيك جديد"}</Btn>}
            <Sel value={chkFilter} onChange={setChkFilter} style={{width:130}}><option>الكل</option><option>أوراق قبض</option><option>أوراق دفع</option></Sel>
          </div>
          {/* Form */}
          {showCheckForm&&(()=>{
            const checkCats=(data.treasurySettings||{}).checkCategories||["رصيد افتتاحي","دفعة عميل","دفعة مورد","تسوية مبالغ","تحويل بين الحسابات","أخرى"];
            const partyList=chkType==="receivable"?customers:suppliers;
            const selectedParty=chkPartyId?partyList.find(p=>p.id===chkPartyId):null;
            return<Card title={chkEditId?"✏️ تعديل شيك":"+ شيك جديد"} style={{marginBottom:16}}>
            <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"repeat(4,1fr)",gap:10}}>
              <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>النوع</label><div style={{display:"flex",gap:6,marginTop:4}}>
                <div onClick={()=>{setChkType("receivable");setChkPartyId("");setChkParty("")}} style={{flex:1,padding:"8px 0",borderRadius:8,textAlign:"center",cursor:"pointer",fontWeight:700,fontSize:FS-1,background:chkType==="receivable"?T.ok+"15":"transparent",border:"2px solid "+(chkType==="receivable"?T.ok:T.brd),color:chkType==="receivable"?T.ok:T.textSec}}>أوراق قبض</div>
                <div onClick={()=>{setChkType("payable");setChkPartyId("");setChkParty("")}} style={{flex:1,padding:"8px 0",borderRadius:8,textAlign:"center",cursor:"pointer",fontWeight:700,fontSize:FS-1,background:chkType==="payable"?T.err+"15":"transparent",border:"2px solid "+(chkType==="payable"?T.err:T.brd),color:chkType==="payable"?T.err:T.textSec}}>أوراق دفع</div>
              </div></div>
              <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>فئة الشيك</label><Sel value={chkCategory} onChange={setChkCategory}>
                <option value="">— اختر الفئة —</option>
                {checkCats.map(c=><option key={c} value={c}>{c}</option>)}
              </Sel></div>
              <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>المبلغ</label><Inp type="number" value={chkAmount} onChange={setChkAmount} placeholder="0"/></div>
              <div>
                <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>{chkType==="receivable"?"العميل":"المورد"}</label>
                <Sel value={chkPartyId} onChange={v=>{setChkPartyId(v);const p=partyList.find(x=>x.id===v);if(p)setChkParty(p.name)}}>
                  <option value="">— اختر من القائمة —</option>
                  {partyList.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                </Sel>
                {!chkPartyId&&<Inp value={chkParty} onChange={setChkParty} placeholder="أو اكتب الاسم يدوياً..." style={{marginTop:4}}/>}
                {selectedParty&&<div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>{selectedParty.phone?"📞 "+selectedParty.phone:""}</div>}
              </div>
              <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>البنك</label>
                {banksList.length>0?<>
                  <Sel value={banksList.includes(chkBank)?chkBank:"_other"} onChange={v=>{if(v==="_other")setChkBank("");else setChkBank(v)}}>
                    <option value="">— اختر البنك —</option>
                    {banksList.map(b=><option key={b} value={b}>{b}</option>)}
                    <option value="_other">✏️ بنك آخر (يدوياً)</option>
                  </Sel>
                  {!banksList.includes(chkBank)&&chkBank!==""&&<Inp value={chkBank} onChange={setChkBank} placeholder="اسم البنك" style={{marginTop:4}}/>}
                  {chkBank===""&&<div style={{fontSize:FS-3,color:T.textMut,marginTop:3}}>💡 أضف البنوك من تاب 🏦 الحسابات → قائمة البنوك</div>}
                </>:<>
                  <Inp value={chkBank} onChange={setChkBank} placeholder="اسم البنك"/>
                  <div style={{fontSize:FS-3,color:T.textMut,marginTop:3}}>💡 سجل البنوك من تاب 🏦 الحسابات → قائمة البنوك ليتم اقتراحها تلقائياً</div>
                </>}
              </div>
              <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>رقم الشيك</label><Inp value={chkNumber} onChange={setChkNumber} placeholder="رقم"/></div>
              <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>تاريخ التحرير</label><Inp type="date" value={chkDate} onChange={setChkDate}/></div>
              <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>تاريخ الاستحقاق</label><Inp type="date" value={chkDueDate} onChange={setChkDueDate}/></div>
              <div style={{gridColumn:isMob?"1":"1/-1"}}><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>ملاحظات</label><Inp value={chkNotes} onChange={setChkNotes} placeholder="ملاحظات"/></div>
            </div>
            {/* V16.35: Batch repeat — only for new checks (not when editing) */}
            {!chkEditId&&<div style={{marginTop:14,padding:12,borderRadius:10,background:"#0EA5E908",border:"1px solid #0EA5E920"}}>
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",userSelect:"none"}}>
                <input type="checkbox" checked={chkBatchEnabled} onChange={e=>setChkBatchEnabled(e.target.checked)} style={{width:16,height:16,cursor:"pointer"}}/>
                <span style={{fontSize:FS,fontWeight:700,color:"#0284C7"}}>📋 حافظة شيكات (تكرار)</span>
              </label>
              {chkBatchEnabled&&<div style={{marginTop:10}}>
                <div style={{padding:"6px 10px",borderRadius:6,background:"#fff8",fontSize:FS-2,color:T.textSec,marginBottom:10,lineHeight:1.6}}>
                  💡 سيتم إنشاء عدد من الشيكات بنفس المبلغ والجهة والبنك. <b>تاريخ الاستحقاق</b> هيتزود بالعدد المحدد من الشهور لكل شيك. <b>رقم الشيك</b> هيتزود بـ١ تلقائياً (مثلاً 1001، 1002، 1003).
                </div>
                <div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"1fr 1fr 2fr",gap:10,alignItems:"end"}}>
                  <div>
                    <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>عدد الشيكات</label>
                    <Inp type="number" value={chkBatchCount} onChange={v=>setChkBatchCount(Math.max(1,Math.min(60,Number(v)||1)))} placeholder="10"/>
                  </div>
                  <div>
                    <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>الفرق (شهور)</label>
                    <Inp type="number" value={chkBatchMonthsStep} onChange={v=>setChkBatchMonthsStep(Math.max(0,Number(v)||0))} placeholder="1"/>
                  </div>
                  {chkDueDate&&<div style={{padding:"8px 10px",borderRadius:6,background:T.cardSolid,border:"1px solid "+T.brd,fontSize:FS-2,color:T.textSec,lineHeight:1.5}}>
                    {(()=>{
                      const cnt=Math.max(1,Math.min(60,Number(chkBatchCount)||1));
                      const step=Math.max(0,Number(chkBatchMonthsStep)||0);
                      const [y,m,d]=chkDueDate.split("-").map(Number);
                      const tgt=new Date(y,m-1+(cnt-1)*step,d);
                      if(tgt.getMonth()!==(m-1+(cnt-1)*step+1200)%12){tgt.setDate(0)}
                      const lastDate=tgt.getFullYear()+"-"+String(tgt.getMonth()+1).padStart(2,"0")+"-"+String(tgt.getDate()).padStart(2,"0");
                      const total=r2((Number(chkAmount)||0)*cnt);
                      return<><b>إجمالي:</b> {fmt(total)} ج.م<br/><b>آخر استحقاق:</b> {lastDate}</>;
                    })()}
                  </div>}
                </div>
              </div>}
            </div>}
            <div style={{marginTop:10}}><Btn primary onClick={saveCheck}>{chkEditId?"💾 حفظ التعديل":(chkBatchEnabled?"💾 حفظ "+Math.max(1,Math.min(60,Number(chkBatchCount)||1))+" شيك":"💾 حفظ")}</Btn></div>
          </Card>})()}
          {/* Checks table */}
          <Card title={"📝 سجل الشيكات ("+filteredChecks.length+")"}>
            {filteredChecks.length>0?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>
              {["النوع","المبلغ","الجهة","البنك","رقم الشيك","تاريخ الاستحقاق","الحالة",""].map(h=><th key={h} style={{padding:"7px 8px",textAlign:"right",fontSize:FS-2,color:T.textSec,borderBottom:"2px solid "+T.brd,fontWeight:700,whiteSpace:"nowrap"}}>{h}</th>)}
            </tr></thead><tbody>
              {filteredChecks.sort((a,b)=>(a.dueDate||"").localeCompare(b.dueDate||"")).map(c=>{const overdue=c.dueDate&&c.dueDate<today&&c.status==="معلق";
                return<tr key={c.id} style={{borderBottom:"1px solid "+T.brd,background:overdue?T.err+"04":""}}>
                <td style={{padding:"6px 8px"}}><span style={{padding:"2px 8px",borderRadius:6,fontSize:FS-2,fontWeight:700,background:c.type==="receivable"?T.ok+"12":T.err+"12",color:c.type==="receivable"?T.ok:T.err}}>{c.type==="receivable"?"قبض":"دفع"}</span></td>
                <td style={{padding:"6px 8px",fontSize:FS,fontWeight:800,color:c.type==="receivable"?T.ok:T.err}}>{fmt0(c.amount)}</td>
                <td style={{padding:"6px 8px",fontSize:FS-1,fontWeight:600}}>{c.party}{c.status==="مُظهّر"&&c.endorsedTo&&<div style={{fontSize:FS-3,color:"#8B5CF6",fontWeight:700,marginTop:2}}>{"📤 مُظهّر لـ "+c.endorsedTo}</div>}</td>
                <td style={{padding:"6px 8px",fontSize:FS-2,color:T.textSec}}>{c.bank||"—"}</td>
                <td style={{padding:"6px 8px",fontSize:FS-2,color:T.textMut}}>{c.checkNo||"—"}{c.batchId&&c.batchTotal>1&&<span style={{marginRight:6,padding:"1px 6px",borderRadius:8,background:"#0EA5E915",color:"#0284C7",fontSize:9,fontWeight:700}} title={"شيك "+c.batchIdx+" من حافظة من "+c.batchTotal+" شيكات"}>{c.batchIdx}/{c.batchTotal}</span>}</td>
                <td style={{padding:"6px 8px",fontSize:FS-1,fontWeight:overdue?700:400,color:overdue?T.err:T.text}}>{c.dueDate||"—"}{overdue?" ⚠️":""}</td>
                <td style={{padding:"6px 8px"}}><span style={{padding:"2px 8px",borderRadius:6,fontSize:FS-2,fontWeight:700,background:(STATUS_COLORS[c.status]||T.textMut)+"15",color:STATUS_COLORS[c.status]||T.textMut}}>{c.status}</span></td>
                <td style={{padding:"6px 8px"}}>
                {/* V16.62: Print check receipt voucher (إذن استلام/تسليم شيك).
                    Always available regardless of status — useful both at the
                    moment of handover (status=معلق) and as an archival reprint
                    later. Resolves the party from check.partyId so the receipt
                    includes phone/address when a customer/supplier record exists. */}
                <span onClick={()=>{
                  const partyInfo=c.partyId
                    ?(c.type==="receivable"?customers.find(x=>x.id===c.partyId):suppliers.find(x=>x.id===c.partyId))
                    :null;
                  printCheckReceipt(c,partyInfo,{factoryName:data.factoryName,logo:data.logo,address:data.address,phone:data.phone});
                }} style={{cursor:"pointer",fontSize:11,marginInlineEnd:6}} title={c.type==="receivable"?"طباعة إذن استلام شيك":"طباعة إذن تسليم شيك"}>🧾</span>
                {canEdit&&c.status==="معلق"&&<div style={{display:"inline-flex",gap:3,flexWrap:"wrap"}}>
                  {/* V18.0: Collect/pay opens account picker popup (asks where money goes/comes from) */}
                  <span onClick={()=>{
                    if(c.type==="receivable"){
                      setCollectAccountPopup({checkId:c.id,ch:c});
                    }else{
                      setPayAccountPopup({checkId:c.id,ch:c});
                    }
                  }} style={{cursor:"pointer",padding:"2px 6px",borderRadius:4,fontSize:10,background:T.ok+"12",color:T.ok,fontWeight:700}}>{c.type==="receivable"?"✅ تحصيل":"✅ دفع"}</span>
                  {c.type==="receivable"&&<span onClick={()=>openConfirm({title:"تظهير الشيك",message:"سيتم نقل ملكية الشيك للمورد المختار. لن يتم تسجيل أي حركة خزنة.\nالعميل: "+c.party+"\nالمبلغ: "+fmt(c.amount)+" ج.م",confirmText:"اختر المورد",onConfirm:()=>{setEndorsePopup(c.id);setEndorseSearch("");setEndorseDate(today)}})} style={{cursor:"pointer",padding:"2px 6px",borderRadius:4,fontSize:10,background:"#8B5CF612",color:"#8B5CF6",fontWeight:700}}>📤 تظهير</span>}
                  {/* V16.34: مرتد for receivables (bounced from bank — customer still owes us);
                       مرتجع stays for payable cancellations */}
                  {c.type==="receivable"
                    ?<span onClick={()=>openConfirm({title:"شيك مرتد",message:"سيتم تسجيل الشيك كمرتد ورجوع المبلغ على العميل.\nالعميل: "+c.party+"\nالمبلغ: "+fmt(c.amount)+" ج.م",variant:"danger",confirmText:"تأكيد الارتداد",onConfirm:()=>updateStatus(c.id,"مرتد")})} style={{cursor:"pointer",padding:"2px 6px",borderRadius:4,fontSize:10,background:"#DC262612",color:"#DC2626",fontWeight:700}} title="شيك مرتد من البنك">❌ مرتد</span>
                    :<span onClick={()=>openConfirm({title:"إلغاء الشيك",message:"سيتم إلغاء الشيك (مرتجع للمورد).\nالمورد: "+c.party+"\nالمبلغ: "+fmt(c.amount)+" ج.م",variant:"warn",confirmText:"تأكيد الإلغاء",onConfirm:()=>updateStatus(c.id,"مرتجع")})} style={{cursor:"pointer",padding:"2px 6px",borderRadius:4,fontSize:10,background:T.warn+"12",color:T.warn,fontWeight:700}}>↩ مرتجع</span>}
                  <span onClick={()=>editCheck(c)} style={{cursor:"pointer",fontSize:11}}>✏️</span>
                  <span onClick={()=>openConfirm({title:"حذف الشيك",message:"سيتم حذف الشيك:\n"+c.party+" — "+fmt(c.amount)+" ج.م",variant:"danger",onConfirm:()=>delCheck(c.id)})} style={{cursor:"pointer",fontSize:11,color:T.err}}>✕</span>
                </div>}
                {/* V16.34: Bounced checks — show retry button (re-mark as pending) */}
                {canEdit&&c.status==="مرتد"&&<div style={{display:"flex",gap:3,flexWrap:"wrap",alignItems:"center"}}>
                  <span style={{fontSize:10,color:"#DC2626",fontWeight:700,padding:"2px 6px",borderRadius:4,background:"#DC262608"}}>❌ مرتد {c.bouncedAt?"("+c.bouncedAt+")":""}</span>
                  <span onClick={()=>openConfirm({title:"إعادة تقديم الشيك",message:"إرجاع الشيك لحالة معلق (قبل ارتداده مرة تانية أو لو هاتقدمه للبنك تاني).",onConfirm:()=>updateStatus(c.id,"معلق")})} style={{cursor:"pointer",padding:"2px 6px",borderRadius:4,fontSize:10,background:T.accent+"12",color:T.accent,fontWeight:700}} title="إعادة الشيك للمحفظة">↻ إعادة</span>
                  <span onClick={()=>openConfirm({title:"حذف الشيك",message:"سيتم حذف الشيك المرتد نهائياً:\n"+c.party+" — "+fmt(c.amount)+" ج.م",variant:"danger",onConfirm:()=>delCheck(c.id)})} style={{cursor:"pointer",fontSize:11,color:T.err}}>✕</span>
                </div>}
                {/* V16.33: Endorsed checks show endorsement target + revert option */}
                {canEdit&&c.status==="مُظهّر"&&<div style={{display:"flex",gap:3,flexWrap:"wrap",alignItems:"center"}}>
                  {c.endorsedTo&&<span style={{fontSize:10,color:"#8B5CF6",fontWeight:700,padding:"2px 6px",borderRadius:4,background:"#8B5CF608"}}>↪ {c.endorsedTo}</span>}
                  <span onClick={()=>revertEndorse(c.id)} style={{cursor:"pointer",padding:"2px 6px",borderRadius:4,fontSize:10,background:T.warn+"12",color:T.warn,fontWeight:700}} title="إلغاء التظهير">↩ إلغاء</span>
                  <span onClick={()=>openConfirm({title:"حذف الشيك",message:"سيتم حذف الشيك ودفعة المورد المرتبطة به:\n"+c.party+" → "+(c.endorsedTo||"")+"\n"+fmt(c.amount)+" ج.م",variant:"danger",onConfirm:()=>delCheck(c.id)})} style={{cursor:"pointer",fontSize:11,color:T.err}}>✕</span>
                </div>}</td>
              </tr>})}
            </tbody></table></div>:<div style={{textAlign:"center",padding:30,color:T.textMut}}>لا توجد شيكات</div>}
          </Card>
          {/* V18.0: Collect account picker — opens after user clicks "✅ تحصيل" on a receivable check */}
          {collectAccountPopup&&(()=>{const ch=collectAccountPopup.ch;
            return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setCollectAccountPopup(null)}>
              <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:480,maxHeight:"85vh",overflowY:"auto",border:"2px solid "+T.ok+"40",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                  <div style={{fontSize:FS+1,fontWeight:800,color:T.ok}}>✅ تحصيل شيك</div>
                  <Btn ghost small onClick={()=>setCollectAccountPopup(null)}>✕</Btn>
                </div>
                <div style={{padding:12,borderRadius:10,background:T.ok+"08",border:"1px solid "+T.ok+"25",marginBottom:14}}>
                  <div style={{fontSize:FS-1,color:T.textSec}}>شيك من: <b style={{color:T.text}}>{ch.party}</b></div>
                  <div style={{fontSize:FS+2,fontWeight:800,color:T.ok,marginTop:4}}>{fmt0(ch.amount)} ج.م</div>
                  {ch.checkNo&&<div style={{fontSize:FS-2,color:T.textMut,marginTop:2}}>{"رقم: #"+ch.checkNo+(ch.bank?" — "+ch.bank:"")+(ch.dueDate?" | استحقاق: "+ch.dueDate:"")}</div>}
                </div>
                <div style={{fontSize:FS,fontWeight:700,color:T.text,marginBottom:8}}>اختر الخزنة/البنك المُودَع فيه:</div>
                {accountsData.length>0&&<div style={{marginBottom:12}}>
                  <div style={{fontSize:FS-2,fontWeight:700,color:T.textMut,marginBottom:6}}>💰 الخزائن</div>
                  <div style={{display:"flex",flexDirection:"column",gap:4}}>
                    {accountsData.map(a=><div key={a.id} onClick={()=>{
                      const accName=a.name;const checkId=collectAccountPopup.checkId;
                      setCollectAccountPopup(null);
                      openConfirm({title:"تأكيد التحصيل",message:"سيتم تحصيل "+fmt(ch.amount)+" ج.م وإيداعها في: "+accName+"\nالشيك: "+ch.party+(ch.checkNo?" #"+ch.checkNo:""),variant:"primary",confirmText:"✅ تأكيد التحصيل",onConfirm:()=>updateStatus(checkId,"محصل",null,accName)});
                    }} style={{padding:"10px 14px",borderRadius:10,border:"1px solid "+T.brd,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",transition:"all 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background=T.ok+"08"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                      <div style={{fontSize:FS,fontWeight:700,color:T.text}}>💰 {a.name}</div>
                      <span style={{fontSize:FS-2,color:T.textMut}}>›</span>
                    </div>)}
                  </div>
                </div>}
                {banksList.length>0&&<div style={{marginBottom:12}}>
                  <div style={{fontSize:FS-2,fontWeight:700,color:T.textMut,marginBottom:6}}>🏦 البنوك</div>
                  <div style={{display:"flex",flexDirection:"column",gap:4}}>
                    {banksList.map(b=><div key={b} onClick={()=>{
                      const checkId=collectAccountPopup.checkId;
                      setCollectAccountPopup(null);
                      openConfirm({title:"تأكيد التحصيل",message:"سيتم تحصيل "+fmt(ch.amount)+" ج.م وإيداعها في: 🏦 "+b+"\nالشيك: "+ch.party+(ch.checkNo?" #"+ch.checkNo:""),variant:"primary",confirmText:"✅ تأكيد التحصيل",onConfirm:()=>updateStatus(checkId,"محصل",null,b)});
                    }} style={{padding:"10px 14px",borderRadius:10,border:"1px solid "+T.brd,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",transition:"all 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background=T.ok+"08"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                      <div style={{fontSize:FS,fontWeight:700,color:T.text}}>🏦 {b}</div>
                      <span style={{fontSize:FS-2,color:T.textMut}}>›</span>
                    </div>)}
                  </div>
                </div>}
                {accountsData.length===0&&banksList.length===0&&<div style={{padding:14,borderRadius:10,background:T.warn+"10",color:T.warn,fontSize:FS-1,textAlign:"center"}}>⚠️ لا توجد خزائن أو بنوك مسجلة</div>}
              </div>
            </div>;
          })()}
          {/* V18.0: Pay account picker — opens after user clicks "✅ دفع" on a payable check */}
          {payAccountPopup&&(()=>{const ch=payAccountPopup.ch;
            return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setPayAccountPopup(null)}>
              <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:480,maxHeight:"85vh",overflowY:"auto",border:"2px solid "+T.err+"40",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                  <div style={{fontSize:FS+1,fontWeight:800,color:T.err}}>✅ صرف شيك</div>
                  <Btn ghost small onClick={()=>setPayAccountPopup(null)}>✕</Btn>
                </div>
                <div style={{padding:12,borderRadius:10,background:T.err+"08",border:"1px solid "+T.err+"25",marginBottom:14}}>
                  <div style={{fontSize:FS-1,color:T.textSec}}>شيك لـ: <b style={{color:T.text}}>{ch.party}</b></div>
                  <div style={{fontSize:FS+2,fontWeight:800,color:T.err,marginTop:4}}>{fmt0(ch.amount)} ج.م</div>
                  {ch.checkNo&&<div style={{fontSize:FS-2,color:T.textMut,marginTop:2}}>{"رقم: #"+ch.checkNo+(ch.bank?" — "+ch.bank:"")+(ch.dueDate?" | استحقاق: "+ch.dueDate:"")}</div>}
                </div>
                <div style={{fontSize:FS,fontWeight:700,color:T.text,marginBottom:8}}>اختر الخزنة/البنك المسحوب منه:</div>
                {accountsData.length>0&&<div style={{marginBottom:12}}>
                  <div style={{fontSize:FS-2,fontWeight:700,color:T.textMut,marginBottom:6}}>💰 الخزائن</div>
                  <div style={{display:"flex",flexDirection:"column",gap:4}}>
                    {accountsData.map(a=><div key={a.id} onClick={()=>{
                      const accName=a.name;const checkId=payAccountPopup.checkId;
                      setPayAccountPopup(null);
                      openConfirm({title:"تأكيد الصرف",message:"سيتم صرف "+fmt(ch.amount)+" ج.م من: "+accName+"\nالشيك: "+ch.party+(ch.checkNo?" #"+ch.checkNo:""),variant:"warn",confirmText:"✅ تأكيد الصرف",onConfirm:()=>updateStatus(checkId,"مدفوع",null,accName)});
                    }} style={{padding:"10px 14px",borderRadius:10,border:"1px solid "+T.brd,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",transition:"all 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background=T.err+"08"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                      <div style={{fontSize:FS,fontWeight:700,color:T.text}}>💰 {a.name}</div>
                      <span style={{fontSize:FS-2,color:T.textMut}}>›</span>
                    </div>)}
                  </div>
                </div>}
                {banksList.length>0&&<div style={{marginBottom:12}}>
                  <div style={{fontSize:FS-2,fontWeight:700,color:T.textMut,marginBottom:6}}>🏦 البنوك</div>
                  <div style={{display:"flex",flexDirection:"column",gap:4}}>
                    {banksList.map(b=><div key={b} onClick={()=>{
                      const checkId=payAccountPopup.checkId;
                      setPayAccountPopup(null);
                      openConfirm({title:"تأكيد الصرف",message:"سيتم صرف "+fmt(ch.amount)+" ج.م من: 🏦 "+b+"\nالشيك: "+ch.party+(ch.checkNo?" #"+ch.checkNo:""),variant:"warn",confirmText:"✅ تأكيد الصرف",onConfirm:()=>updateStatus(checkId,"مدفوع",null,b)});
                    }} style={{padding:"10px 14px",borderRadius:10,border:"1px solid "+T.brd,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",transition:"all 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background=T.err+"08"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                      <div style={{fontSize:FS,fontWeight:700,color:T.text}}>🏦 {b}</div>
                      <span style={{fontSize:FS-2,color:T.textMut}}>›</span>
                    </div>)}
                  </div>
                </div>}
                {accountsData.length===0&&banksList.length===0&&<div style={{padding:14,borderRadius:10,background:T.warn+"10",color:T.warn,fontSize:FS-1,textAlign:"center"}}>⚠️ لا توجد خزائن أو بنوك مسجلة</div>}
              </div>
            </div>;
          })()}
          {/* ── Endorse popup — select supplier ── */}
          {endorsePopup&&(()=>{const ch=checks.find(c=>c.id===endorsePopup);if(!ch)return null;
            const q=endorseSearch.toLowerCase();
            const filteredSup=suppliers.filter(s=>!q||s.name.toLowerCase().includes(q));
            return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setEndorsePopup(null)}>
              <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:450,maxHeight:"80vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div style={{fontSize:FS+1,fontWeight:800,color:"#8B5CF6"}}>📤 تظهير شيك</div>
                  <Btn ghost small onClick={()=>setEndorsePopup(null)}>✕</Btn>
                </div>
                <div style={{padding:12,borderRadius:10,background:"#8B5CF608",border:"1px solid #8B5CF620",marginBottom:14}}>
                  <div style={{fontSize:FS-1,color:T.textSec}}>شيك من: <b style={{color:T.text}}>{ch.party}</b></div>
                  <div style={{fontSize:FS+2,fontWeight:800,color:"#8B5CF6",marginTop:4}}>{fmt0(ch.amount)} ج.م</div>
                  {ch.checkNo&&<div style={{fontSize:FS-2,color:T.textMut,marginTop:2}}>{"رقم: #"+ch.checkNo+(ch.dueDate?" | استحقاق: "+ch.dueDate:"")}</div>}
                </div>
                {/* V16.33: Optional endorsement date — defaults to today, editable */}
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>📅 تاريخ التظهير</label>
                  <Inp type="date" value={endorseDate} onChange={setEndorseDate}/>
                </div>
                <div style={{padding:"6px 10px",borderRadius:6,background:T.warn+"08",border:"1px solid "+T.warn+"20",fontSize:FS-2,color:T.textSec,marginBottom:10,lineHeight:1.5}}>
                  💡 التظهير مش حركة خزنة — الشيك بيغيّر صاحبه فقط. هيُسجَّل كدفعة للمورد بطريقة "شيك مظهّر".
                </div>
                <div style={{fontSize:FS,fontWeight:700,color:T.text,marginBottom:8}}>اختر المورد:</div>
                <input value={endorseSearch} onChange={e=>setEndorseSearch(e.target.value)} placeholder="🔍 بحث عن مورد..." style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid "+T.brd,fontSize:FS,fontFamily:"inherit",background:T.inputBg,color:T.text,marginBottom:10,boxSizing:"border-box"}}/>
                {filteredSup.length>0?<div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {filteredSup.map(s=><div key={s.id} onClick={()=>endorseCheck(endorsePopup,s.id,endorseDate)} style={{padding:"10px 14px",borderRadius:10,border:"1px solid "+T.brd,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",transition:"all 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background="#8B5CF608"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                    <div><div style={{fontSize:FS,fontWeight:700}}>{s.name}</div>{s.phone&&<div style={{fontSize:FS-2,color:T.textMut}}>{s.phone}</div>}</div>
                    <span style={{fontSize:FS-1,color:"#8B5CF6",fontWeight:700}}>📤 تظهير</span>
                  </div>)}
                </div>:<div style={{textAlign:"center",padding:20,color:T.textMut}}>{suppliers.length===0?"لا يوجد موردين — أضف موردين من قاعدة البيانات":"لا توجد نتائج"}</div>}
              </div>
            </div>})()}

          {/* V18.0: Collect Account Picker — asks user where to deposit the collected money */}
          {collectAccountPopup&&(()=>{const ch=collectAccountPopup.ch;
            return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={()=>setCollectAccountPopup(null)}>
              <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:500,maxHeight:"85vh",overflowY:"auto",border:"2px solid "+T.ok,boxShadow:"0 25px 80px rgba(0,0,0,0.4)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,paddingBottom:12,borderBottom:"1px solid "+T.brd}}>
                  <div style={{fontSize:FS+2,fontWeight:800,color:T.ok}}>✅ تحصيل الشيك — اختر الحساب</div>
                  <Btn ghost small onClick={()=>setCollectAccountPopup(null)}>✕</Btn>
                </div>
                <div style={{padding:"10px 14px",background:T.ok+"08",borderRadius:10,marginBottom:14,fontSize:FS-1,lineHeight:1.7}}>
                  <div><b>العميل:</b> {ch.party}</div>
                  <div><b>المبلغ:</b> <span style={{color:T.ok,fontWeight:800,fontSize:FS+2}}>{fmt(ch.amount)} ج.م</span></div>
                  {ch.bank&&<div style={{fontSize:FS-2,color:T.textMut,marginTop:4}}>📋 شيك على {ch.bank} {ch.checkNo?"#"+ch.checkNo:""}</div>}
                </div>
                <div style={{fontSize:FS-1,fontWeight:700,color:T.textSec,marginBottom:8}}>أين سيتم إيداع المبلغ؟</div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {accountsData.map(acc=><div key={acc.id} onClick={()=>{
                    const accountName=acc.name;setCollectAccountPopup(null);
                    openConfirm({title:"تأكيد التحصيل",message:"سيتم تحصيل الشيك وإضافة المبلغ لحساب: "+accountName+"\n\nالمبلغ: "+fmt(ch.amount)+" ج.م\nالعميل: "+ch.party,variant:"success",confirmText:"✅ تأكيد التحصيل",onConfirm:()=>updateStatus(ch.id,"محصل",null,accountName)});
                  }} style={{padding:"12px 16px",borderRadius:10,border:"1px solid "+T.brd,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",transition:"all 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background=T.ok+"08"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <span style={{fontSize:22}}>{acc.name.toUpperCase().includes("SUB")?"🏪":acc.name.toUpperCase().includes("MAIN")?"💰":"🏦"}</span>
                      <div>
                        <div style={{fontSize:FS,fontWeight:700}}>{acc.name}</div>
                        {acc.ownerEmail&&<div style={{fontSize:FS-3,color:T.textMut}}>{acc.ownerEmail}</div>}
                      </div>
                    </div>
                    <span style={{fontSize:FS-1,color:T.ok,fontWeight:700}}>← إيداع هنا</span>
                  </div>)}
                </div>
                {accountsData.length===0&&<div style={{textAlign:"center",padding:20,color:T.textMut}}>لا توجد حسابات — أضف حسابات من تاب 🏦 الحسابات</div>}
              </div>
            </div>;
          })()}

          {/* V18.0: Pay Account Picker — asks user from which account to pay */}
          {payAccountPopup&&(()=>{const ch=payAccountPopup.ch;
            return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={()=>setPayAccountPopup(null)}>
              <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:500,maxHeight:"85vh",overflowY:"auto",border:"2px solid "+T.ok,boxShadow:"0 25px 80px rgba(0,0,0,0.4)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,paddingBottom:12,borderBottom:"1px solid "+T.brd}}>
                  <div style={{fontSize:FS+2,fontWeight:800,color:T.err}}>✅ صرف الشيك — اختر الحساب</div>
                  <Btn ghost small onClick={()=>setPayAccountPopup(null)}>✕</Btn>
                </div>
                <div style={{padding:"10px 14px",background:T.err+"08",borderRadius:10,marginBottom:14,fontSize:FS-1,lineHeight:1.7}}>
                  <div><b>المورد:</b> {ch.party}</div>
                  <div><b>المبلغ:</b> <span style={{color:T.err,fontWeight:800,fontSize:FS+2}}>{fmt(ch.amount)} ج.م</span></div>
                  {ch.bank&&<div style={{fontSize:FS-2,color:T.textMut,marginTop:4}}>📋 شيك على {ch.bank} {ch.checkNo?"#"+ch.checkNo:""}</div>}
                </div>
                <div style={{fontSize:FS-1,fontWeight:700,color:T.textSec,marginBottom:8}}>من أي حساب سيتم خصم المبلغ؟</div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {accountsData.map(acc=>{const b=accBalances[acc.name]||{in:0,out:0};const bal=b.in-b.out;
                    return<div key={acc.id} onClick={()=>{
                      const accountName=acc.name;setPayAccountPopup(null);
                      openConfirm({title:"تأكيد الدفع",message:"سيتم صرف الشيك من حساب: "+accountName+"\n\nالمبلغ: "+fmt(ch.amount)+" ج.م\nالمورد: "+ch.party+"\nالرصيد الحالي للحساب: "+fmt0(bal)+" ج.م",variant:"warn",confirmText:"✅ تأكيد الدفع",onConfirm:()=>updateStatus(ch.id,"مدفوع",null,accountName)});
                    }} style={{padding:"12px 16px",borderRadius:10,border:"1px solid "+T.brd,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",transition:"all 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background=T.err+"08"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <span style={{fontSize:22}}>{acc.name.toUpperCase().includes("SUB")?"🏪":acc.name.toUpperCase().includes("MAIN")?"💰":"🏦"}</span>
                        <div>
                          <div style={{fontSize:FS,fontWeight:700}}>{acc.name}</div>
                          <div style={{fontSize:FS-3,color:bal>=0?T.ok:T.err,fontWeight:600}}>الرصيد: {fmt0(bal)} ج.م</div>
                        </div>
                      </div>
                      <span style={{fontSize:FS-1,color:T.err,fontWeight:700}}>← خصم من هنا</span>
                    </div>;
                  })}
                </div>
                {accountsData.length===0&&<div style={{textAlign:"center",padding:20,color:T.textMut}}>لا توجد حسابات — أضف حسابات من تاب 🏦 الحسابات</div>}
              </div>
            </div>;
          })()}
        </div>})()}
    </div>}

    {/* ══ ANALYSIS VIEW ══ */}
    {view==="analysis"&&<div>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:16}}>
        {/* OUT Analysis */}
        <Card title="📊 تحليل المنصرف بالنوع">
          {(()=>{const outCats=catAnalysis.filter(([,v])=>v.out>0).sort((a,b)=>b[1].out-a[1].out);const totalOut=outCats.reduce((s,[,v])=>s+v.out,0);
            return outCats.length>0?<div style={{display:"flex",flexDirection:"column",gap:6}}>
              {outCats.map(([cat,v])=>{const pct=totalOut?Math.round(v.out/totalOut*100):0;
                return<div key={cat}><div style={{display:"flex",justifyContent:"space-between",fontSize:FS-1,marginBottom:2}}>
                  <span style={{fontWeight:600}}>{cat}</span><span style={{fontWeight:700,color:T.err}}>{fmt0(v.out)+" ("+pct+"%)"}</span>
                </div><div style={{height:6,borderRadius:3,background:T.bg}}><div style={{height:"100%",borderRadius:3,background:T.err,width:pct+"%"}}/></div></div>})}
              <div style={{marginTop:8,padding:8,borderRadius:8,background:T.err+"06",textAlign:"center",fontWeight:800,color:T.err}}>{"اجمالي: "+fmt0(totalOut)+" ج.م"}</div>
            </div>:<div style={{textAlign:"center",padding:20,color:T.textMut}}>لا توجد بيانات</div>})()}
        </Card>
        {/* IN Analysis */}
        <Card title="📊 تحليل الوارد بالنوع">
          {(()=>{const inCats=catAnalysis.filter(([,v])=>v.in>0).sort((a,b)=>b[1].in-a[1].in);const totalIn=inCats.reduce((s,[,v])=>s+v.in,0);
            return inCats.length>0?<div style={{display:"flex",flexDirection:"column",gap:6}}>
              {inCats.map(([cat,v])=>{const pct=totalIn?Math.round(v.in/totalIn*100):0;
                return<div key={cat}><div style={{display:"flex",justifyContent:"space-between",fontSize:FS-1,marginBottom:2}}>
                  <span style={{fontWeight:600}}>{cat}</span><span style={{fontWeight:700,color:T.ok}}>{fmt0(v.in)+" ("+pct+"%)"}</span>
                </div><div style={{height:6,borderRadius:3,background:T.bg}}><div style={{height:"100%",borderRadius:3,background:T.ok,width:pct+"%"}}/></div></div>})}
              <div style={{marginTop:8,padding:8,borderRadius:8,background:T.ok+"06",textAlign:"center",fontWeight:800,color:T.ok}}>{"اجمالي: "+fmt0(totalIn)+" ج.م"}</div>
            </div>:<div style={{textAlign:"center",padding:20,color:T.textMut}}>لا توجد بيانات</div>})()}
        </Card>
      </div>
      {/* Monthly breakdown */}
      <Card title="📅 تحليل شهري" style={{marginTop:16}}>
        {(()=>{const months={};txns.forEach(t=>{const m=(t.date||"").slice(0,7);if(!m)return;if(!months[m])months[m]={in:0,out:0};
          if(t.type==="in")months[m].in+=(Number(t.amount)||0);else months[m].out+=(Number(t.amount)||0)});
          const sorted=Object.entries(months).sort((a,b)=>b[0].localeCompare(a[0]));
          return sorted.length>0?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>
            {["الشهر","وارد","منصرف","صافي"].map(h=><th key={h} style={{padding:"8px 10px",textAlign:"right",fontSize:FS-1,color:T.textSec,borderBottom:"2px solid "+T.brd,fontWeight:700}}>{h}</th>)}
          </tr></thead><tbody>
            {sorted.map(([m,v])=><tr key={m} style={{borderBottom:"1px solid "+T.brd}}>
              <td style={{padding:"8px 10px",fontWeight:700,fontSize:FS}}>{m}</td>
              <td style={{padding:"8px 10px",fontWeight:700,color:T.ok}}>{fmt0(v.in)}</td>
              <td style={{padding:"8px 10px",fontWeight:700,color:T.err}}>{fmt0(v.out)}</td>
              <td style={{padding:"8px 10px",fontWeight:800,color:(v.in-v.out)>=0?T.ok:T.err}}>{fmt0(v.in-v.out)}</td>
            </tr>)}
          </tbody></table></div>:<div style={{textAlign:"center",padding:20,color:T.textMut}}>لا توجد بيانات</div>})()}
      </Card>
    </div>}

    {/* ══ ACCOUNTS VIEW ══ */}
    {view==="accounts"&&<div>
      <Card title="🏦 إدارة الحسابات">
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"repeat(2,1fr)",gap:12,marginBottom:16}}>
          {accountsData.map(acc=>{const b=accBalances[acc.name]||{in:0,out:0};const bal=b.in-b.out;
            return<div key={acc.id} style={{padding:16,borderRadius:14,background:T.cardSolid,border:"1px solid "+T.brd,boxShadow:T.shadow}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <div>
                  <div style={{fontSize:FS,fontWeight:800,color:T.text}}>{acc.name}</div>
                  {acc.ownerEmail&&<div style={{fontSize:FS-2,color:T.textMut,marginTop:2}}>👤 {acc.ownerEmail}</div>}
                </div>
                {canEdit&&<div style={{display:"flex",gap:4}}>
                  <span onClick={()=>{setView("journal");setFilterAcc(acc.name)}} style={{cursor:"pointer",padding:"3px 8px",borderRadius:6,fontSize:FS-2,background:T.accent+"10",color:T.accent,border:"1px solid "+T.accent+"30"}} title="عرض السجل">📒</span>
                  <span onClick={()=>editAccount(acc)} style={{cursor:"pointer",padding:"3px 6px",borderRadius:6,fontSize:11,background:T.bg,color:T.textSec,border:"1px solid "+T.brd}}>✏️</span>
                  <span onClick={()=>{if(txns.some(t=>t.account===acc.name)){playBeep("error");showToast("⛔ لا يمكن الحذف — يوجد حركات مرتبطة");return}openConfirm({title:"حذف الحساب",message:"سيتم حذف الحساب: "+acc.name,variant:"danger",onConfirm:()=>delAccount(acc.id)})}} style={{cursor:"pointer",padding:"3px 6px",borderRadius:6,fontSize:11,background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30"}}>🗑️</span>
                </div>}
              </div>
              <div style={{display:"flex",gap:16,marginTop:4}}>
                <div><div style={{fontSize:FS-2,color:T.textMut}}>وارد</div><div style={{fontSize:FS,fontWeight:700,color:T.ok}}>{fmt0(b.in)}</div></div>
                <div><div style={{fontSize:FS-2,color:T.textMut}}>منصرف</div><div style={{fontSize:FS,fontWeight:700,color:T.err}}>{fmt0(b.out)}</div></div>
                <div><div style={{fontSize:FS-2,color:T.textMut}}>الرصيد</div><div style={{fontSize:FS+2,fontWeight:800,color:bal>=0?"#0D9488":T.err}}>{fmt0(bal)}</div></div>
              </div>
            </div>})}
        </div>
        {canEdit&&<div style={{padding:12,borderRadius:12,background:T.bg,border:"1px dashed "+T.brd}}>
          <div style={{fontSize:FS-1,fontWeight:700,color:T.textSec,marginBottom:8}}>{editAccId?"✏️ تعديل حساب":"+ إضافة حساب جديد"}</div>
          <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr auto",gap:8,alignItems:"flex-end"}}>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>اسم الحساب</label><Inp value={newAccName} onChange={setNewAccName} placeholder="مثال: CIB WALLET"/></div>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>إيميل المسؤول (اختياري)</label><Inp value={newAccOwner} onChange={setNewAccOwner} placeholder="user@example.com"/></div>
            <div style={{display:"flex",gap:4}}>
              <Btn primary onClick={addAccount} disabled={!newAccName.trim()}>{editAccId?"💾 حفظ":"+ إضافة"}</Btn>
              {editAccId&&<Btn ghost onClick={()=>{setEditAccId(null);setNewAccName("");setNewAccOwner("")}}>✕</Btn>}
            </div>
          </div>
        </div>}
      </Card>

      {/* V18.0: Banks list — used in checks form bank dropdown */}
      <Card title="🏦 قائمة البنوك" style={{marginTop:16}}>
        <div style={{fontSize:FS-2,color:T.textMut,marginBottom:12,padding:"8px 12px",background:T.accent+"08",borderRadius:8,border:"1px solid "+T.accent+"20"}}>
          ℹ️ البنوك المُسجَّلة هنا تظهر كـقائمة منسدلة في حقل "البنك" عند تسجيل أو تعديل أي شيك (في تاب 📝 الشيكات).
        </div>
        {banksList.length>0?<div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
          {banksList.map((b,i)=>{
            const checkCount=(data.checks||[]).filter(c=>(c.bank||"")===b).length;
            return<div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",borderRadius:8,background:T.cardSolid,border:"1px solid "+T.brd}}>
              <div style={{display:"flex",alignItems:"center",gap:10,flex:1}}>
                <span style={{fontSize:18}}>🏦</span>
                <div>
                  <div style={{fontSize:FS,fontWeight:700}}>{b}</div>
                  {checkCount>0&&<div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>{checkCount+" شيك مرتبط"}</div>}
                </div>
              </div>
              {canEdit&&<div style={{display:"flex",gap:4}}>
                <span onClick={()=>editBank(i)} style={{cursor:"pointer",padding:"3px 6px",borderRadius:6,fontSize:11,background:T.bg,color:T.textSec,border:"1px solid "+T.brd}}>✏️</span>
                <span onClick={()=>{
                  if(checkCount>0){playBeep("error");showToast("⛔ لا يمكن الحذف — يوجد "+checkCount+" شيك مرتبط");return}
                  openConfirm({title:"حذف البنك",message:"سيتم حذف البنك: "+b,variant:"danger",onConfirm:()=>delBank(i)});
                }} style={{cursor:"pointer",padding:"3px 6px",borderRadius:6,fontSize:11,background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30"}}>🗑️</span>
              </div>}
            </div>;
          })}
        </div>:<div style={{textAlign:"center",padding:20,color:T.textMut,fontSize:FS-1}}>لا توجد بنوك مسجلة بعد</div>}
        {canEdit&&<div style={{padding:12,borderRadius:12,background:T.bg,border:"1px dashed "+T.brd}}>
          <div style={{fontSize:FS-1,fontWeight:700,color:T.textSec,marginBottom:8}}>{editBankIdx!=null?"✏️ تعديل البنك":"+ إضافة بنك جديد"}</div>
          <div style={{display:"flex",gap:8,alignItems:"flex-end",flexWrap:"wrap"}}>
            <div style={{flex:1,minWidth:200}}><Inp value={newBankName} onChange={setNewBankName} placeholder="مثال: CIB / NBE / QNB"/></div>
            <Btn primary onClick={addBank} disabled={!newBankName.trim()}>{editBankIdx!=null?"💾 حفظ":"+ إضافة"}</Btn>
            {editBankIdx!=null&&<Btn ghost onClick={()=>{setEditBankIdx(null);setNewBankName("")}}>✕</Btn>}
          </div>
        </div>}
      </Card>

      {/* ═══ DANGER ZONE — admin only ═══ */}
      {isAdmin&&<Card style={{marginTop:20,border:"2px solid "+T.err+"40",background:T.err+"04"}}>
        <div style={{padding:"4px 0"}}>
          <div style={{fontSize:FS+1,fontWeight:800,color:T.err,marginBottom:8}}>⚠️ منطقة الخطر</div>
          <div style={{fontSize:FS-1,color:T.textSec,marginBottom:14,lineHeight:1.7}}>
            مسح كل حركات الخزنة والسلف والمرتبات بشكل نهائي. يفيد في البدء من نقطة الصفر أو مع بداية موسم جديد.
            <br/>
            <b style={{color:T.err}}>تنبيه:</b> هذا الإجراء لا يمكن التراجع عنه.
          </div>
          <Btn onClick={()=>{setResetConfirmText("");setShowResetPopup(true)}} style={{background:T.err,color:"#fff",border:"none",fontWeight:700,padding:"10px 20px"}}>🗑️ مسح كل حركات الخزنة + سلف ومرتبات HR</Btn>
        </div>
      </Card>}
    </div>}

    {/* ══ RESET CONFIRMATION POPUP ══ */}
    {showResetPopup&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:10002,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(6px)"}} onClick={()=>{setShowResetPopup(false);setResetConfirmText("")}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:28,width:"100%",maxWidth:520,border:"3px solid "+T.err,boxShadow:"0 25px 80px rgba(239,68,68,0.3)"}}>
        <div style={{fontSize:56,textAlign:"center",marginBottom:10}}>⚠️</div>
        <div style={{fontSize:FS+4,fontWeight:900,color:T.err,textAlign:"center",marginBottom:14}}>مسح شامل — لا رجعة فيه</div>
        <div style={{fontSize:FS-1,color:T.textSec,marginBottom:14,lineHeight:1.8,padding:"12px 14px",background:T.err+"08",borderRadius:10,border:"1px solid "+T.err+"20"}}>
          <b style={{color:T.err}}>سيتم حذف:</b><br/>
          • كل حركات اليومية ({txns.length} حركة)<br/>
          • كل التحويلات ({transfers.length} تحويل)<br/>
          • كل دفعات العملاء والموردين<br/>
          • كل السلف والمرتبات من HR<br/>
          • كل المديونيات<br/>
          • الأرصدة المرحّلة للموظفين<br/>
          • الأيام المقفولة<br/>
          <br/>
          <b style={{color:T.ok}}>سيظل محفوظاً:</b> الشيكات • الموظفين • الأسابيع (سيتم فتحها) • بيانات الطلبات والعملاء
        </div>
        <div style={{marginBottom:16}}>
          <label style={{fontSize:FS-1,color:T.textSec,fontWeight:700,display:"block",marginBottom:6}}>اكتب كلمة <b style={{color:T.err,fontSize:FS+1}}>حذف</b> للتأكيد:</label>
          <Inp value={resetConfirmText} onChange={setResetConfirmText} placeholder="حذف" style={{fontSize:FS+1,textAlign:"center",fontWeight:700,border:"2px solid "+T.err+"40"}}/>
        </div>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <Btn ghost onClick={()=>{setShowResetPopup(false);setResetConfirmText("")}}>إلغاء</Btn>
          <Btn onClick={executeReset} disabled={resetConfirmText.trim()!=="حذف"} style={{background:resetConfirmText.trim()==="حذف"?T.err:T.textMut+"50",color:"#fff",border:"none",fontWeight:800,padding:"10px 22px",cursor:resetConfirmText.trim()==="حذف"?"pointer":"not-allowed"}}>🗑️ نفّذ المسح الشامل</Btn>
        </div>
      </div>
    </div>}

    {/* ══ PARTY PICKER POPUP (customer/supplier/workshop/employee) ══ */}
    {showPartyPicker&&(()=>{
      const list=showPartyPicker==="customer"?customers:showPartyPicker==="supplier"?suppliers:showPartyPicker==="employee"?(data.employees||[]).filter(e=>!e.inactive):workshops;
      const title=showPartyPicker==="customer"?"🧑 اختيار عميل":showPartyPicker==="supplier"?"🏭 اختيار مورد":showPartyPicker==="employee"?"👷 اختيار موظف":"🔧 اختيار ورشة";
      const emptyMsg=showPartyPicker==="customer"?"لا يوجد عملاء":showPartyPicker==="supplier"?"لا يوجد موردين":showPartyPicker==="employee"?"لا يوجد موظفين":"لا توجد ورش";
      const filtered=list.filter(p=>!partySearchDeb.trim()||(p.name||"").toLowerCase().includes(partySearchDeb.toLowerCase())||(p.phone||"").includes(partySearchDeb));
      /* For workshops: compute balance */
      const wsBalance=(wsName)=>{let due=0;(data.orders||[]).forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===wsName).forEach(wd=>{(wd.receives||[]).forEach(r=>{due+=r2((Number(r.qty)||0)*(Number(r.price)||0))})})});const payments=(data.wsPayments||[]).filter(p=>p.wsName===wsName);const paid=payments.filter(p=>p.type==="payment").reduce((s,p)=>s+(Number(p.amount)||0),0);const purchase=payments.filter(p=>p.type==="purchase").reduce((s,p)=>s+(Number(p.amount)||0),0);return due+purchase-paid};
      return<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={()=>{setShowPartyPicker(null);if(!txPartyId){setTxCategory("")}}}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:20,width:"100%",maxWidth:540,maxHeight:"80vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.4)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:FS+1,fontWeight:800,color:T.accent}}>{title}</div>
            <Btn ghost small onClick={()=>{setShowPartyPicker(null);if(!txPartyId){setTxCategory("")}}}>✕</Btn>
          </div>
          <Inp value={partySearch} onChange={setPartySearch} placeholder="🔍 بحث بالاسم أو التليفون..." style={{marginBottom:10}}/>
          {filtered.length===0?<div style={{textAlign:"center",padding:30,color:T.textMut}}>{list.length===0?emptyMsg:"لا توجد نتائج"}</div>
          :<div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:"50vh",overflowY:"auto"}}>
            {filtered.map(p=>{
              const bal=showPartyPicker==="workshop"?wsBalance(p.name):p.balance;
              const keyId=p.id||p.name;
              return<div key={keyId} onClick={()=>{
                setTxPartyId(keyId);setTxPartyType(showPartyPicker);setShowPartyPicker(null);
                if(!txDesc.trim()){
                  if(showPartyPicker==="customer")setTxDesc("دفعة من "+p.name);
                  else if(showPartyPicker==="supplier")setTxDesc("دفع لـ "+p.name);
                  else if(showPartyPicker==="employee")setTxDesc("سلفة "+p.name);
                  else setTxDesc(wsDesc(p.name,txCategory==="مشتريات"))
                }
              }} style={{padding:"10px 12px",borderRadius:10,cursor:"pointer",background:txPartyId===keyId?T.accent+"10":T.bg,border:"1px solid "+(txPartyId===keyId?T.accent+"40":T.brd),display:"flex",justifyContent:"space-between",alignItems:"center",transition:"all 0.15s"}}>
                <div>
                  <div style={{fontSize:FS,fontWeight:700,color:T.text}}>{p.name}</div>
                  {p.phone&&<div style={{fontSize:FS-2,color:T.textMut,direction:"ltr",textAlign:"right"}}>{p.phone}</div>}
                </div>
                {bal!=null&&bal!==0&&<span style={{fontSize:FS-1,fontWeight:700,color:bal>=0?T.err:T.ok}} title={showPartyPicker==="workshop"?"الرصيد المستحق للورشة":"الرصيد"}>{fmt0(bal)}</span>}
              </div>})}
          </div>}
        </div>
      </div>})()}

    {/* ══ TRANSFER FORM POPUP ══ */}
    {showTransfer&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={()=>setShowTransfer(false)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:480,border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.4)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:FS+2,fontWeight:800,color:"#8B5CF6"}}>🔄 تحويل بين الخزن</div>
          <Btn ghost small onClick={()=>setShowTransfer(false)}>✕</Btn>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div>
            <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>📅 تاريخ التحويل</label>
            <Inp type="date" value={tfDate} onChange={setTfDate}/>
            <div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>افتراضياً اليوم — غيّره لو التحويل تم في تاريخ سابق</div>
          </div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>من خزنة</label>
            <Sel value={tfFrom} onChange={setTfFrom}><option value="">— اختر —</option>{accountsData.map(a=><option key={a.id} value={a.name}>{a.name}{a.ownerEmail?" ("+a.ownerEmail.split("@")[0]+")":""}</option>)}</Sel></div>
          <div style={{display:"flex",justifyContent:"center",margin:"4px 0"}}><span style={{fontSize:22,color:"#8B5CF6"}}>↓</span></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>إلى خزنة</label>
            <Sel value={tfTo} onChange={setTfTo}><option value="">— اختر —</option>{accountsData.filter(a=>a.name!==tfFrom).map(a=><option key={a.id} value={a.name}>{a.name}{a.ownerEmail?" ("+a.ownerEmail.split("@")[0]+")":""}</option>)}</Sel></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>المبلغ (ج.م)</label>
            <Inp type="number" value={tfAmount} onChange={setTfAmount} placeholder="0"/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>ملاحظات (اختياري)</label>
            <Inp value={tfNote} onChange={setTfNote} placeholder="سبب التحويل..."/></div>
          {tfTo&&(()=>{const to=accountsData.find(a=>a.name===tfTo);return to?.ownerEmail?<div style={{padding:8,borderRadius:8,background:T.accent+"06",border:"1px solid "+T.accent+"20",fontSize:FS-2,color:T.accent}}>📩 سيتم إرسال إشعار إلى <b>{to.ownerEmail}</b> لتأكيد الاستلام</div>:<div style={{padding:8,borderRadius:8,background:T.warn+"06",border:"1px solid "+T.warn+"20",fontSize:FS-2,color:T.warn}}>⚠️ الخزنة الهدف ليس لها مسؤول — لن يتم إرسال إشعار</div>})()}
        </div>
        <div style={{display:"flex",gap:8,marginTop:14,justifyContent:"flex-end"}}>
          <Btn ghost onClick={()=>setShowTransfer(false)}>إلغاء</Btn>
          <Btn onClick={submitTransfer} style={{background:"#8B5CF6",color:"#fff",border:"none",fontWeight:700}}>🔄 إرسال التحويل</Btn>
        </div>
      </div>
    </div>}

    {/* V16.26: Edit confirmed transfer — same fields as create, syncs both treasury legs on save */}
    {editTf&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={()=>setEditTf(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:480,border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.4)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:FS+2,fontWeight:800,color:"#8B5CF6"}}>✏️ تعديل تحويل</div>
          <Btn ghost small onClick={()=>setEditTf(null)}>✕</Btn>
        </div>
        <div style={{padding:"8px 12px",borderRadius:8,background:"#F59E0B10",border:"1px solid #F59E0B30",fontSize:FS-2,color:"#92400E",marginBottom:12,lineHeight:1.6}}>
          ⚠️ التعديل بيحدّث التحويل والحركتين في الخزنتين معاً تلقائياً
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div>
            <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>📅 تاريخ التحويل</label>
            <Inp type="date" value={editTf.date} onChange={v=>setEditTf({...editTf,date:v})}/>
          </div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>من خزنة</label>
            <Sel value={editTf.fromAccount} onChange={v=>setEditTf({...editTf,fromAccount:v})}><option value="">— اختر —</option>{accountsData.map(a=><option key={a.id} value={a.name}>{a.name}{a.ownerEmail?" ("+a.ownerEmail.split("@")[0]+")":""}</option>)}</Sel></div>
          <div style={{display:"flex",justifyContent:"center",margin:"4px 0"}}><span style={{fontSize:22,color:"#8B5CF6"}}>↓</span></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>إلى خزنة</label>
            <Sel value={editTf.toAccount} onChange={v=>setEditTf({...editTf,toAccount:v})}><option value="">— اختر —</option>{accountsData.filter(a=>a.name!==editTf.fromAccount).map(a=><option key={a.id} value={a.name}>{a.name}{a.ownerEmail?" ("+a.ownerEmail.split("@")[0]+")":""}</option>)}</Sel></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>المبلغ (ج.م)</label>
            <Inp type="number" value={editTf.amount} onChange={v=>setEditTf({...editTf,amount:v})} placeholder="0"/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>ملاحظات (اختياري)</label>
            <Inp value={editTf.note} onChange={v=>setEditTf({...editTf,note:v})} placeholder="سبب التحويل..."/></div>
        </div>
        <div style={{display:"flex",gap:8,marginTop:14,justifyContent:"flex-end"}}>
          <Btn ghost onClick={()=>setEditTf(null)}>إلغاء</Btn>
          <Btn onClick={editTransferSave} style={{background:"#8B5CF6",color:"#fff",border:"none",fontWeight:700}}>💾 حفظ التعديل</Btn>
        </div>
      </div>
    </div>}

    {/* ═══ V14.52: First-visit warning popup for non-whitelisted users ═══ */}
    {showFirstVisitWarning&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",zIndex:10002,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={()=>setShowFirstVisitWarning(false)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:28,width:"100%",maxWidth:460,border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.45)",textAlign:"center"}}>
        <div style={{fontSize:54,marginBottom:14}}>🔒</div>
        <div style={{fontSize:FS+4,fontWeight:900,color:T.err,marginBottom:10}}>وضع قراءة فقط</div>
        <div style={{fontSize:FS+1,color:T.text,marginBottom:14,lineHeight:1.7}}>
          تم تفعيل قفل تعديل وحذف الحركات في هذا الحساب.
        </div>
        <div style={{padding:"12px 16px",background:T.bg,borderRadius:12,border:"1px solid "+T.brd,marginBottom:18,textAlign:"right"}}>
          <div style={{fontSize:FS-1,color:T.textSec,lineHeight:1.9}}>
            <div style={{display:"flex",gap:8,alignItems:"flex-start",marginBottom:6}}>
              <span style={{fontSize:16,flexShrink:0}}>✅</span>
              <span><b style={{color:T.text}}>تقدر:</b> عرض الحركات • إضافة حركات جديدة</span>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"flex-start"}}>
              <span style={{fontSize:16,flexShrink:0}}>❌</span>
              <span><b style={{color:T.text}}>مش تقدر:</b> تعديل حركات قديمة • حذف حركات</span>
            </div>
          </div>
        </div>
        <div style={{fontSize:FS-1,color:T.textMut,marginBottom:18,lineHeight:1.6}}>
          لو محتاج صلاحية تعديل أو حذف، تواصل مع المدير ليضيفك لقائمة المصرّح لهم.
        </div>
        <Btn primary onClick={()=>setShowFirstVisitWarning(false)} style={{padding:"10px 32px",fontSize:FS+1,fontWeight:700}}>فهمت</Btn>
      </div>
    </div>}

    {/* ══ GENERIC CONFIRM POPUP ══ */}
    {confirmPopup&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:10001,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={()=>setConfirmPopup(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:440,border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.4)",textAlign:"center"}}>
        <div style={{fontSize:44,marginBottom:10}}>{confirmPopup.variant==="danger"?"⚠️":confirmPopup.variant==="warn"?"⚠️":"❓"}</div>
        <div style={{fontSize:FS+3,fontWeight:800,color:confirmPopup.variant==="danger"?T.err:confirmPopup.variant==="warn"?T.warn:T.text,marginBottom:8}}>{confirmPopup.title||"تأكيد"}</div>
        <div style={{fontSize:FS,color:T.textSec,marginBottom:18,lineHeight:1.6,whiteSpace:"pre-line"}}>{confirmPopup.message||""}</div>
        <div style={{display:"flex",gap:10,justifyContent:"center"}}>
          <Btn ghost onClick={()=>setConfirmPopup(null)}>إلغاء</Btn>
          <Btn onClick={()=>{if(confirmPopup.onConfirm)confirmPopup.onConfirm();setConfirmPopup(null)}} style={{background:confirmPopup.variant==="danger"?T.err:confirmPopup.variant==="warn"?T.warn:T.accent,color:"#fff",border:"none",fontWeight:800,padding:"10px 24px"}}>{confirmPopup.variant==="danger"?"🗑️ حذف":"✅ تأكيد"}</Btn>
        </div>
      </div>
    </div>}

    {/* ══ WHATSAPP CONTACT PICKER POPUP ══ */}
    {waPopupData&&(()=>{
      const contacts=(data.waContacts||[]).filter(c=>(c.reports||[]).includes("treasuryDaily")||(c.reports||[]).length===0);
      const popupDate=waPopupData.date;const popupAcc=waPopupData.account;
      const scopeLabel=popupAcc||"كل الحسابات";
      return<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:10001,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={()=>setWaPopupData(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:20,width:"100%",maxWidth:500,maxHeight:"85vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.4)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,paddingBottom:10,borderBottom:"2px solid "+T.brd}}>
            <div style={{fontSize:FS+3,fontWeight:800,color:"#25D366"}}>📤 إرسال تقرير يومية الخزنة</div>
            <span onClick={()=>setWaPopupData(null)} style={{cursor:"pointer",fontSize:22,color:T.textMut,padding:"0 6px"}}>✕</span>
          </div>
          <div style={{fontSize:FS-1,color:T.textSec,marginBottom:12,padding:"10px 12px",borderRadius:10,background:T.accent+"08",border:"1px solid "+T.accent+"20"}}>
            🏦 <b>الحساب:</b> {scopeLabel}<br/>
            📅 <b>تاريخ التقرير:</b> {popupDate}<br/>
            ℹ️ سيتم حفظ PDF تلقائياً ثم فتح واتساب برسالة جاهزة. ارفع الـ PDF في المحادثة.
          </div>
          {contacts.length>0?<div style={{marginBottom:12}}>
            <div style={{fontSize:FS-1,fontWeight:700,color:T.textSec,marginBottom:8}}>اختر جهة من دفتر العناوين:</div>
            <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:260,overflowY:"auto"}}>
              {contacts.map(c=><div key={c.id} onClick={()=>shareDailyWhatsApp(popupDate,c.phone,popupAcc)} style={{cursor:"pointer",padding:"10px 14px",borderRadius:10,background:T.bg,border:"1px solid "+T.brd,display:"flex",justifyContent:"space-between",alignItems:"center",transition:"all 0.15s"}} onMouseEnter={e=>{e.currentTarget.style.background="#25D36608";e.currentTarget.style.borderColor="#25D36640"}} onMouseLeave={e=>{e.currentTarget.style.background=T.bg;e.currentTarget.style.borderColor=T.brd}}>
                <div>
                  <div style={{fontSize:FS,fontWeight:700,color:T.text}}>{c.name}</div>
                  {c.role&&<div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>{c.role}</div>}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:FS-2,color:T.textSec,direction:"ltr"}}>{c.phone}</span>
                  <span style={{fontSize:18,color:"#25D366"}}>📲</span>
                </div>
              </div>)}
            </div>
          </div>:<div style={{padding:"16px 12px",borderRadius:10,background:T.warn+"10",border:"1px solid "+T.warn+"30",textAlign:"center",marginBottom:12}}>
            <div style={{fontSize:FS,color:T.warn,fontWeight:700,marginBottom:4}}>⚠️ دفتر العناوين فارغ</div>
            <div style={{fontSize:FS-2,color:T.textSec}}>أضف جهات من الإعدادات ← جهات تواصل التقارير</div>
          </div>}
          <div style={{marginTop:10,paddingTop:14,borderTop:"1px solid "+T.brd}}>
            <div style={{fontSize:FS-1,fontWeight:700,color:T.textSec,marginBottom:6}}>أو ادخل رقم يدوياً:</div>
            <div style={{display:"flex",gap:6}}>
              <input id="wa-manual-phone" type="tel" placeholder="مثال: 01012345678" style={{flex:1,padding:"10px 12px",borderRadius:8,border:"1px solid "+T.brd,fontSize:FS,direction:"ltr",textAlign:"right",fontFamily:"inherit",background:T.inputBg,color:T.text}}/>
              <Btn onClick={()=>{const el=document.getElementById("wa-manual-phone");const ph=(el?.value||"").trim();if(!ph){showToast("⚠️ ادخل رقم الواتساب");return}shareDailyWhatsApp(popupDate,ph,popupAcc)}} style={{background:"#25D366",color:"#fff",border:"none",fontWeight:700,padding:"10px 16px"}}>📤 إرسال</Btn>
            </div>
          </div>
          <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid "+T.brd}}>
            <Btn ghost onClick={()=>shareDailyWhatsApp(popupDate,"",popupAcc)} style={{width:"100%",fontSize:FS-1}} title="يفتح واتساب بدون رقم محدد">📱 فتح واتساب بدون رقم (اختر من جهات واتساب)</Btn>
          </div>
        </div>
      </div>})()}
  </div>
}


/* ═══════════════════════════════════════════════════════════════
   HR PAGE — الموظفين والمرتبات الأسبوعية V2
   مسحوبات أسبوعية + ماتركس دفعات + حساب صافي + سجل
   ═══════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════
   HR PAGE V3 — نظام الأسابيع الكامل
   فتح أسبوع → لصق بصمة → حساب مرتبات → اعتماد → قفل
   ═══════════════════════════════════════════════════════════════ */
