/* ═══════════════════════════════════════════════════════════════
   CLARK - TreasuryPg
   
   Extracted from App.jsx in V15.0 phase 2.
   Dependencies imported explicitly — no code changes inside.
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useMemo, useRef } from "react";
import { FS } from "../constants/index.js";
import { gid, fmt, fmt0, r2, _esc, dayName, dayNameFull, openWA, formatTxTime } from "../utils/format.js";
import { compressImage } from "../utils/image.js";/* V21.9.203: wallet thumbnail */
import { playBeep } from "../utils/audio.js";
import { addAudit } from "../utils/audit.js";
import { showToast, ask, tell } from "../utils/popups.js";
import { pushUndo } from "../utils/undo.js";
import { openPrintWindow, printPage } from "../utils/print.js";
import { printCashReceipt, printCheckReceipt } from "../utils/print-extras.js";
import { htmlToPdfBase64 } from "../utils/htmlToPdf.js";
import { getReferences } from "../utils/dataIntegrity.js";
import { Spinner, InlineLoading, Btn, Inp, Sel, SearchSel, Card, useDebounced } from "../components/ui.jsx";
import { ReviewRequestBanner } from "../components/ReviewRequestBanner.jsx";
import { autoPost } from "../utils/accounting/autoPost.js";
import { calculatePending, buildTxFromRule, getNextDueDate, describeRecurrence } from "../utils/recurring.js";
import { matchWorkshopFromDesc, matchPartyFromDesc } from "../utils/orders.js";
/* V21.9.188: cross-page action handoff (Dashboard "+ جديد" buttons). */
import { consumePendingAction } from "../utils/pendingAction.js";
/* V21.9.127: Universal Attachments — wire to treasury entry form + check form. */
import { AttachmentList } from "../components/attachments/AttachmentList.jsx";
import { computeWorkshopBalance } from "../utils/accountSummary.js";
import { nowISO, cairoDateStr } from "../utils/serverTime.js";
import { T } from "../theme.js";
import { db } from "../firebase";
import { collection, getDocs, doc, setDoc, deleteDoc } from "firebase/firestore";

/* V21.9.248 — per-month wallet "external/personal amount" (admin-only).
   Sometimes personal (non-factory) money flows through a wallet — it's NOT
   recorded as a factory transaction, but it DID consume the real provider
   limits, so the factory's "remaining" headroom looks higher than reality.
   So an admin can record an external/personal amount per limit FOR THE CURRENT
   MONTH ONLY: w.monthExtra = {"YYYY-MM": {extDay, extMonth, extBalance, note,
   by, at}}. These amounts ADD to the wallet's USAGE (so the remaining headroom
   drops accordingly and the "تجاوز الحد" warnings stay accurate), are shown
   SEPARATELY as "خارجي غير مسجّل", and create NO transaction (zero money/leg
   impact — just an accurate soft-warning threshold). Auto-resets next month
   (no key for the new month). Replaced the V21.9.246 cap-override approach. */
function curMonthKeyCairo(){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit"}).formatToParts(new Date());
  let y="",m="";for(const p of parts){if(p.type==="year")y=p.value;if(p.type==="month")m=p.value;}
  return y+"-"+m;
}
/* Cap threshold passthrough → the wallet's default field. (Thin helper kept so
   the saveTx/transfer/card cap-check call sites stay byte-for-byte untouched —
   the override moved from the CAP to the USAGE side per Ahmed's clarification.) */
function walletEffCap(w,field){ return w?w[field]:undefined; }
/* External personal amount on a usage dimension this month (extDay/extMonth/
   extBalance), or 0 if none. */
function walletMonthExtra(w,field){
  const o=w&&w.monthExtra&&w.monthExtra[curMonthKeyCairo()];
  return (o&&Number(o[field]))||0;
}
function walletHasMonthExtra(w){
  const o=w&&w.monthExtra&&w.monthExtra[curMonthKeyCairo()];
  return !!o&&((Number(o.extDay)||0)>0||(Number(o.extMonth)||0)>0||(Number(o.extBalance)||0)>0);
}

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
        id:gid(),
        category:"security",
        action:isAdmin?"lock_bypass":"lock_whitelisted",
        target:action==="edit"?"treasury_edit":"treasury_delete",
        oldValue:"مقفول من الإعدادات",
        newValue:(action==="edit"?"تعديل":"حذف")+" بواسطة "+(isAdmin?"مدير":"مستخدم مصرّح له"),
        notes:"الحركة: "+(tx?.desc||"—")+" | المبلغ: "+(tx?.amount||0)+" | التاريخ: "+(tx?.date||"—")+" | حساب: "+(tx?.account||"—"),
        by:userEmail,
        at:nowISO()
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
  /* V18.91: Listen for notification deep-links — switch view + scroll to transfer */
  useEffect(()=>{
    const handler=(e)=>{
      const d=e?.detail;
      if(!d||d.type!=="treasury")return;
      if(d.view)setView(d.view);
      /* If subType is transfer_pending, scroll to it after the view switches */
      if(d.subType==="transfer_pending"&&d.entryId){
        setTimeout(()=>{
          const el=document.getElementById("transfer-row-"+d.entryId);
          if(el){el.scrollIntoView({behavior:"smooth",block:"center"});el.style.transition="background 0.5s";el.style.background="#FBBF2440";setTimeout(()=>{el.style.background=""},2500)}
        },300);
      }
    };
    window.addEventListener("notif-deeplink",handler);
    return()=>window.removeEventListener("notif-deeplink",handler);
  },[]);

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
          c.autoReverted=nowISO();
          c.autoRevertReason="حركة الخزنة المرتبطة تم حذفها من مكان آخر";
        }
      });
    });
    showToast("⚠️ تم إرجاع "+orphans.length+" شيك لحالة معلق (الحركة المرتبطة كانت محذوفة)");
  },[data.checks,data.treasury,data.supplierPayments,upConfig]);
  /* V19.3 FIX: One-time cleanup of duplicate treasury entries in Firestore.
     Bug history: V16.80 introduced split day docs (treasuryDays/{YYYY-MM-DD}).
     If a date-edit operation had the new-day write succeed but the old-day
     remove fail (no retry — fixed in V19.3 too), the entry persisted in BOTH
     day docs with the same id. The flatten() dedup (V19.3) hides duplicates
     in the UI, but Firestore is still polluted. This migration scans all day
     docs once per session, finds entries appearing in multiple days, keeps the
     newest version (by updatedAt → createdAt → date), and removes the older
     copies from their respective day docs.
     Idempotent: safe to re-run. Runs in background; doesn't block the UI. */
  const dupCleanupRef=useRef(false);
  useEffect(()=>{
    if(dupCleanupRef.current)return;
    if(!data.treasury||!Array.isArray(data.treasury))return;
    if(!data._splitDaysV1674Done)return;/* migration only relevant for split mode */
    dupCleanupRef.current=true;/* lock — runs once per page mount */
    (async()=>{
      try{
        const snap=await getDocs(collection(db,"treasuryDays"));
        /* Build: id → [{dayKey, entry, idx}] */
        const idToOccurrences=new Map();
        snap.forEach(docSnap=>{
          const dayKey=docSnap.id;
          const dd=docSnap.data();
          const entries=Array.isArray(dd?.entries)?dd.entries:[];
          entries.forEach((e,idx)=>{
            if(!e||!e.id)return;
            const id=String(e.id);
            if(!idToOccurrences.has(id))idToOccurrences.set(id,[]);
            idToOccurrences.get(id).push({dayKey,entry:e,idx});
          });
        });
        /* Find duplicates (id appears in 2+ different day docs) */
        const dups=[];
        for(const[id,occs]of idToOccurrences){
          const distinctDays=new Set(occs.map(o=>o.dayKey));
          if(distinctDays.size>=2)dups.push({id,occs});
        }
        if(dups.length===0){
          console.log("[V19.3 cleanup] لا يوجد حركات مكررة — قاعدة البيانات نظيفة ✓");
          return;
        }
        console.warn("[V19.3 cleanup] لقيت "+dups.length+" حركة مكررة في Firestore — هتتنظف...");
        /* For each dup: pick the WINNER (newest by updatedAt → createdAt → date),
           remove all OTHER occurrences from their day docs.
           Group removals by dayKey for efficient batched writes. */
        const removalsByDay=new Map();/* dayKey → Set<id> */
        const winnerSummary=[];
        for(const{id,occs}of dups){
          /* Score each occurrence: prefer updatedAt, fallback createdAt, fallback date */
          const scored=occs.map(o=>{
            const e=o.entry;
            const ts=e.updatedAt||e.createdAt||e.date||"";
            return{...o,score:ts};
          });
          scored.sort((a,b)=>(b.score||"").localeCompare(a.score||""));
          const winner=scored[0];
          const losers=scored.slice(1);
          winnerSummary.push({id,kept:winner.dayKey,removed:losers.map(l=>l.dayKey)});
          for(const loser of losers){
            if(!removalsByDay.has(loser.dayKey))removalsByDay.set(loser.dayKey,new Set());
            removalsByDay.get(loser.dayKey).add(id);
          }
        }
        /* Apply removals to each affected day doc.
           Re-read fresh in case anything changed since initial scan. */
        for(const[dayKey,idsToRemove]of removalsByDay){
          try{
            const dayRef=doc(db,"treasuryDays",dayKey);
            const dayDocs=snap.docs.filter(ds=>ds.id===dayKey);
            const dayDoc=dayDocs[0];
            if(!dayDoc)continue;
            const dd=dayDoc.data();
            const oldEntries=Array.isArray(dd?.entries)?dd.entries:[];
            /* Remove ONLY the loser-id entries from THIS day. The winner stays
               where it is (might or might not be in this day — irrelevant here). */
            const newEntries=oldEntries.filter(e=>!(e&&e.id&&idsToRemove.has(String(e.id))));
            if(newEntries.length===0){
              await deleteDoc(dayRef);
            }else{
              await setDoc(dayRef,{
                entries:newEntries,
                count:newEntries.length,
                updatedAt:nowISO(),
                _v193DupCleanup:nowISO(),
              });
            }
          }catch(e){
            console.error("[V19.3 cleanup] فشل تنظيف يوم "+dayKey+":",e);
          }
        }
        console.log("[V19.3 cleanup] تم تنظيف "+dups.length+" حركة مكررة. التفاصيل:",winnerSummary);
        showToast("✓ تم تنظيف "+dups.length+" حركة خزنة مكررة من قاعدة البيانات");
      }catch(e){
        console.error("[V19.3 cleanup] فشل المسح:",e);
      }
    })();
  },[data._splitDaysV1674Done,data.treasury]);

  /* V19.9 FIX: Recovery for orphan party-payment treasury entries.
     Bug history: from V18.35 (auto-link launched) to V19.8, treasury entries
     with category="دفعة عميل" / "دفعة مورد" / "مرتبات" only generated their
     companion records (custPayments / supplierPayments / hrLog) when the user
     EXPLICITLY picked the party from the inline picker (i.e., txPartyId was
     set). If the user typed the party name into بيان manually, or somehow
     saved with txPartyId="", the treasury entry stuck around uncategorized
     in the customer/supplier/employee subsystems — invisible in:
     - كشف العميل (customer statement)
     - "دفعات كاش" total card on the customer dashboard
     - Any supplier/employee balance views.
     
     V19.9 added forward auto-link in saveTx (matchPartyFromDesc). This effect
     does the BACKWARD pass: scans existing treasury entries, finds orphans
     (category "دفعة عميل"/"دفعة مورد" with no matching record by treasuryTxId
     in custPayments/supplierPayments AND no custId/supplierId on the entry),
     auto-matches by name, and creates the missing payment records.
     Idempotent: safe to re-run. Skips if no changes are needed. */
  const partyRecoveryRef=useRef(false);
  /* V21.9.14: in-flight guard for transfer approve/reject. Stores tfIds that
     are currently being processed so a fast double-click (or a click before
     the optimistic update has propagated through the listener loop) doesn't
     fire approveTransfer twice and produce duplicate treasury legs.
     Belt-and-suspenders alongside the _stableMatch fix in App.jsx. */
  const inflightTransferRef=useRef(new Set());
  useEffect(()=>{
    if(partyRecoveryRef.current)return;
    if(!data.treasury||!Array.isArray(data.treasury))return;
    /* V19.9.1 FIX: Use data.customers / data.suppliers DIRECTLY here. The
       previous version referenced the local `customers` and `suppliers` consts
       which are declared LATER in the component (line ~414), causing a
       Temporal Dead Zone error in the minified bundle ("Cannot access 'ie'
       before initialization"). The TDZ trips at component init because the
       useEffect body and its dependency array both close over the not-yet-
       initialized const bindings. Reading from `data.*` sidesteps the issue. */
    const _custs=Array.isArray(data.customers)?data.customers:[];
    const _sups=Array.isArray(data.suppliers)?data.suppliers:[];
    /* Wait for at least one of customers/suppliers to be loaded */
    if(_custs.length===0&&_sups.length===0)return;
    partyRecoveryRef.current=true;/* lock — runs once per page mount */
    
    const _custPayTxIds=new Set((data.custPayments||[]).map(p=>p.treasuryTxId).filter(Boolean));
    const _supPayTxIds=new Set((data.supplierPayments||[]).map(p=>p.treasuryTxId).filter(Boolean));
    /* V19.11: tombstones — treasury IDs that were intentionally deleted via
       delCustPay or delSupplierPay. Recovery must NEVER re-link these, even
       if the treasury entry somehow persists (Firestore sync race, partial
       delete, etc.). Without this guard, a deleted payment could "ghost back"
       into the customer's statement after the user explicitly removed it. */
    const _tombstones=new Set([
      ...(data._deletedCustPayTreasuryIds||[]),
      ...(data._deletedSupplierPayTreasuryIds||[]),
    ]);
    
    const _orphansToFix=[];
    (data.treasury||[]).forEach(tx=>{
      if(!tx||!tx.id)return;
      /* Skip entries with sourceType — those come from external sources
         (HR advance, ws_payment, etc.) and have their own linking. */
      if(tx.sourceType)return;
      /* V19.11: skip tombstoned IDs — these are pending-cleanup ghosts */
      if(_tombstones.has(tx.id))return;
      const haystack=((tx.desc||"")+" "+(tx.notes||"")).trim();
      if(!haystack)return;
      
      if(tx.type==="in"&&tx.category==="دفعة عميل"&&!tx.custId&&!_custPayTxIds.has(tx.id)){
        const m=matchPartyFromDesc(haystack,_custs,{minNameLength:3});
        if(m)_orphansToFix.push({kind:"customer",tx,party:m});
      } else if(tx.type==="out"&&tx.category==="دفعة مورد"&&!tx.supplierId&&!_supPayTxIds.has(tx.id)){
        const m=matchPartyFromDesc(haystack,_sups,{minNameLength:3});
        if(m)_orphansToFix.push({kind:"supplier",tx,party:m});
      }
    });
    
    if(_orphansToFix.length===0){
      console.log("[V19.9 recovery] لا يوجد دفعات يتيمة — جميع الحركات مربوطة ✓");
      return;
    }
    
    console.warn("[V19.9 recovery] تم العثور على "+_orphansToFix.length+" دفعة يتيمة، جاري الربط:",
      _orphansToFix.map(o=>({txId:o.tx.id,date:o.tx.date,amt:o.tx.amount,party:o.party.name,kind:o.kind})));
    
    upConfig(d=>{
      if(!d.custPayments)d.custPayments=[];
      if(!d.supplierPayments)d.supplierPayments=[];
      const now=nowISO();
      _orphansToFix.forEach(({kind,tx,party})=>{
        if(kind==="customer"){
          d.custPayments.push({
            id:gid(),
            custId:party.id,
            custName:party.name,
            amount:Number(tx.amount)||0,
            date:tx.date,
            note:tx.notes||tx.desc||"",
            method:"كاش",
            by:tx.by||"V19.9-recovery",
            treasuryTxId:tx.id,
            createdAt:now,
            _v199Recovered:now,
          });
          /* Also stamp the treasury entry's custId for consistency */
          const matchTx=d.treasury?.find(t=>t.id===tx.id);
          if(matchTx)matchTx.custId=party.id;
        } else if(kind==="supplier"){
          d.supplierPayments.push({
            id:gid(),
            supplierId:party.id,
            supplierName:party.name,
            amount:Number(tx.amount)||0,
            date:tx.date,
            note:tx.notes||tx.desc||"",
            method:"كاش",
            by:tx.by||"V19.9-recovery",
            treasuryTxId:tx.id,
            createdAt:now,
            _v199Recovered:now,
          });
          const matchTx=d.treasury?.find(t=>t.id===tx.id);
          if(matchTx)matchTx.supplierId=party.id;
        }
      });
    });
    showToast("✓ تم استرجاع "+_orphansToFix.length+" دفعة يتيمة وربطها بالعملاء/الموردين");
  },[data.treasury,data.custPayments,data.supplierPayments,data.customers,data.suppliers,upConfig]);

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
        d.treasuryAccounts.push({id:n,name:n,ownerEmail:"",type:isCash?"cash":"bank",autoRestored:nowISO()});
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
  /* V19.4 FIX: Guard against double-click on save button. The save flow used to
     have NO visual feedback (button stayed enabled, no spinner) — and since
     upConfig() is sync-call-but-async-write, a fast double-click would invoke
     saveTx twice with the same form state, creating 2 identical entries.
     This is a critical financial-data integrity bug. The guard:
       1. Skip the call entirely if savingTx is already true
       2. Set savingTx=true before the upConfig
       3. Reset savingTx=false after a short delay so button re-enables for the
          NEXT entry (in sticky mode) or for re-opens. */
  const[savingTx,setSavingTx]=useState(false);
  /* V18.52: Sticky category mode for batch entries.
     null = off; { category, type, count, total } = active.
     When set, after save the form auto-reopens with category+type pre-filled
     and count is decremented. Stops when count reaches 0 or user disables. */
  const[stickyMode,setStickyMode]=useState(null);
  /* V18.53: Sticky date — independent of stickyMode. When non-null, the form's
     date field is preserved across opens and saves. Useful for back-entry of
     historical transactions. */
  const[stickyDate,setStickyDate]=useState(null);
  /* V18.56: Recurring transactions state */
  const[showRecurringModal,setShowRecurringModal]=useState(false);
  const[editRecurringId,setEditRecurringId]=useState(null);
  const[recForm,setRecForm]=useState({name:"",type:"out",amount:"",category:"",account:"MAIN CASH",description:"",notes:"",pattern:"monthly",dayOfMonth:1,dayOfWeek:0,startDate:cairoDateStr(),endDate:"",active:true});
  /* V15.44: Date picker for top-level print/PDF/WhatsApp buttons — defaults to today but user can pick any day */
  const[printDate,setPrintDate]=useState(cairoDateStr());
  const[txType,setTxType]=useState("in");
  const[txAmount,setTxAmount]=useState("");
  const[txDesc,setTxDesc]=useState("");
  const[txNotes,setTxNotes]=useState("");
  const[txCategory,setTxCategory]=useState("");
  const[txAccount,setTxAccount]=useState("SUB CASH");
  const[txSeason,setTxSeason]=useState(data.activeSeason||"");
  const[txDate,setTxDate]=useState(cairoDateStr());
  const[txPartyId,setTxPartyId]=useState("");/* Customer or supplier ID */
  const[txPartyType,setTxPartyType]=useState("");/* "customer" | "supplier" */
  /* V19.70.1: payment method dropdown for cust/supplier payments.
     Stored in custPayments[].method / supplierPayments[].method, displayed
     in the V19.70 paymentReceived event message via the {method} variable. */
  const[txMethod,setTxMethod]=useState("نقدي كاش");
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
  /* V19.18: date-range filter — when either filterFrom or filterTo is set,
     it overrides filterMonth/filterDay and shows entries in the inclusive range. */
  const[filterFrom,setFilterFrom]=useState("");
  const[filterTo,setFilterTo]=useState("");
  const[filterSearch,setFilterSearch]=useState("");const filterSearchDeb=useDebounced(filterSearch,250);
  const[limit,setLimit]=useState(50);
  /* V21.21.2: «تقارير» tab — تقرير الخزنة الشامل (فترة + نوع + فئة + بحث، إجماليات
     ديناميكية، طباعة/PDF/واتساب، لكل خزنة أو جميع الخزن). */
  const[rpAcc,setRpAcc]=useState("__all__");/* "__all__" = جميع الخزن، أو اسم حساب */
  const[rpFrom,setRpFrom]=useState("");const[rpTo,setRpTo]=useState("");
  const[rpType,setRpType]=useState("all");/* all | in | out */
  const[rpCat,setRpCat]=useState("__all__");
  const[rpSearch,setRpSearch]=useState("");const rpSearchDeb=useDebounced(rpSearch,250);
  const[rpWaPhone,setRpWaPhone]=useState("");const[rpSending,setRpSending]=useState(false);
  /* View */
  const subAccId=(rawAccounts.length>0?rawAccounts:["MAIN CASH","SUB CASH"]).find(a=>{const n=typeof a==="string"?a:a.name||a.id;return n.toUpperCase().includes("SUB")})||"SUB CASH";
  const subAccKey="acc_"+(typeof subAccId==="string"?subAccId:subAccId.id||subAccId.name||"SUB CASH");
  /* V21.9.145: read deep-link target from sessionStorage on first mount so a
     notification click that wants `view="transfers"` lands directly on that
     view — no flash of the default sub-account view. The existing
     `notif-deeplink` event still runs (handles scrolling to the row), but the
     view-switch happens BEFORE the first render. */
  const[view,setView]=useState(()=>{
    try {
      const raw = sessionStorage.getItem("treasury-deep-link");
      if(raw){
        const dl = JSON.parse(raw);
        if(dl && dl.ts && (Date.now() - dl.ts) < 5000 && typeof dl.view === "string"){
          sessionStorage.removeItem("treasury-deep-link");
          return dl.view;
        }
      }
    } catch(_) {}
    return subAccKey;
  });
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
      /* V21.9.114: r2() wrap on preview total — Odoo expects clean decimals and
         the preview popup displays this value to the admin for reconciliation. */
      setOdooSyncPreview({total:filtered.length,newTxns,existing:existingRefs.size,byCategory,unmapped,totalAmount:r2(newTxns.reduce((s,t)=>s+(Number(t.amount)||0),0))});
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
          date:t.date||cairoDateStr(),
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
  /* V21.9.203 (e-wallets Phase 1): wallet-account form fields. A wallet is just
     a treasuryAccount with type:"wallet" + metadata (number, icon/image, caps).
     Caps default to 200,000 EGP (balance cap + monthly-withdrawal cap). The caps
     are STORED + DISPLAYED here; enforcement (warn + override) lands in Phase 3. */
  const[newAccType,setNewAccType]=useState("cash");/* cash | bank | wallet */
  const[newAccNumber,setNewAccNumber]=useState("");
  const[newAccIcon,setNewAccIcon]=useState("📱");
  const[newAccImage,setNewAccImage]=useState("");
  const[newAccBalanceCap,setNewAccBalanceCap]=useState("200000");
  const[newAccMonthlyCap,setNewAccMonthlyCap]=useState("200000");
  const[newAccDailyCap,setNewAccDailyCap]=useState("60000");/* V21.9.223: حد السحب اليومي لكل محفظة */
  const[walletImgBusy,setWalletImgBusy]=useState(false);
  /* V21.9.246: per-month wallet cap override popup (admin-only) */
  const[monthLimitW,setMonthLimitW]=useState(null);
  const[mlDaily,setMlDaily]=useState("");
  const[mlMonthly,setMlMonthly]=useState("");
  const[mlBalance,setMlBalance]=useState("");
  /* V21.9.204 (e-wallets Phase 2): per-wallet commission tiers (شرائح).
     Each tier = {from, to, fee} — a FIXED fee for amounts in [from..to]
     (Vodafone-Cash style). Leave `to` empty for the open-ended top tier. */
  const[newAccTiers,setNewAccTiers]=useState([]);
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
  /* V19.70.18: drawer name = الاسم المكتوب على الشيك. Different from `party`/`partyId`
     because a customer can pay us with a 3rd-party check (e.g. customer X gives us a
     check drawn on Y's bank account). Surfaced when endorsing to a supplier so they
     know who actually owes the bank — and used in the customer due-reminder message
     so the customer can identify which specific check we're talking about. */
  const[chkDrawerName,setChkDrawerName]=useState("");
  /* V19.70.9: search query for the customer/supplier picker — replaces the long
     dropdown with a filterable list. Keeps the existing chkParty/chkPartyId
     semantics (id = linked, free-text fallback when not linked). */
  const[chkPartySearch,setChkPartySearch]=useState("");
  const[chkPartyOpen,setChkPartyOpen]=useState(false);
  /* ── V21.9.188: cross-page action consumption ──
     When the Accounting Dashboard's "+ جديد" button routes here, it leaves
     a pendingAction in sessionStorage. We consume it once on mount and
     auto-open the matching form. Mutually exclusive actions:
       - "newTx"    → open the transaction form (showForm=true)
       - "newCheck" → switch to checks view + open the check form,
                      optionally pre-setting chkType from action.checkType */
  useEffect(() => {
    const act = consumePendingAction("treasury");
    if (!act) return;
    if (act.action === "newTx") {
      setShowForm(true);
    } else if (act.action === "newCheck") {
      if (act.checkType === "receivable" || act.checkType === "payable") {
        setChkType(act.checkType);
      } else {
        setChkType("receivable");
      }
      setChkEditId(null);
      setView("checks");
      setShowCheckForm(true);
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);
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
  /* V19.70.8: multi-select for checks list */
  const[selectedChkIds,setSelectedChkIds]=useState(new Set());
  const toggleChkSel=(id)=>{setSelectedChkIds(prev=>{const n=new Set(prev);if(n.has(id))n.delete(id);else n.add(id);return n})};
  const clearChkSel=()=>setSelectedChkIds(new Set());
  const bulkDeleteChecks=(ids)=>{
    if(!ids||ids.length===0)return;
    upConfig(d=>{
      if(!Array.isArray(d.checks))return;
      d.checks=d.checks.filter(c=>!ids.includes(c.id));
    });
    clearChkSel();
    showToast("✓ تم حذف "+ids.length+" شيك");
  };

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
  const today=cairoDateStr();

  /* ── Per-account balances ── */
  const accBalances=useMemo(()=>{
    const bal={};accounts.forEach(a=>{bal[a]={in:0,out:0}});
    txns.forEach(t=>{const acc=t.account||"MAIN CASH";if(!bal[acc])bal[acc]={in:0,out:0};
      if(t.type==="in")bal[acc].in+=(Number(t.amount)||0);else bal[acc].out+=(Number(t.amount)||0)});
    return bal},[txns,accounts]);
  /* V21.9.203 (e-wallets): total WITHDRAWALS (out entries) in the current
     calendar month, per account name. Resets automatically on the 1st (the key
     is YYYY-MM). Used to monitor each wallet's monthly-withdrawal cap. */
  const walletMonthOut=useMemo(()=>{
    const mo=(today||"").slice(0,7);const m={};
    txns.forEach(t=>{if(t.type==="out"&&(t.date||"").slice(0,7)===mo){const acc=t.account||"";m[acc]=(m[acc]||0)+(Number(t.amount)||0)}});
    return m},[txns,today]);
  /* V21.9.223 (e-wallets): إجمالي صرف «اليوم» (date===today) لكل حساب — للحد اليومي. */
  const walletDayOut=useMemo(()=>{
    const m={};
    txns.forEach(t=>{if(t.type==="out"&&(t.date||"")===today){const acc=t.account||"";m[acc]=(m[acc]||0)+(Number(t.amount)||0)}});
    return m},[txns,today]);
  /* V21.9.114: round final summations so any accumulated float drift (e.g. from
     `0.1 + 0.2 = 0.30000000000000004` after 1000+ txns) doesn't leak into
     comparisons or expose visible decimals on themes that bypass fmt(). */
  const totalBalance=r2(Object.values(accBalances).reduce((s,a)=>s+(a.in-a.out),0));

  /* ── Today summary ── */
  const todayTxns=txns.filter(t=>t.date===today);
  const todayIn=r2(todayTxns.filter(t=>t.type==="in").reduce((s,t)=>s+(Number(t.amount)||0),0));
  const todayOut=r2(todayTxns.filter(t=>t.type==="out").reduce((s,t)=>s+(Number(t.amount)||0),0));

  /* ── Filtered & sorted ── */
  let filtered=[...txns].sort((a,b)=>(b.date||"").localeCompare(a.date||"")||(b.createdAt||"").localeCompare(a.createdAt||""));
  if(filterType!=="الكل")filtered=filtered.filter(t=>t.type===(filterType==="وارد"?"in":"out"));
  if(filterCat!=="الكل")filtered=filtered.filter(t=>t.category===filterCat);
  if(filterAcc!=="الكل")filtered=filtered.filter(t=>(t.account||"MAIN CASH")===filterAcc);
  if(filterMonth)filtered=filtered.filter(t=>(t.date||"").startsWith(filterMonth));
  if(filterDay)filtered=filtered.filter(t=>t.date===filterDay);
  /* V19.18: date-range filter — applied on top of (or independently from) month/day. */
  if(filterFrom)filtered=filtered.filter(t=>(t.date||"")>=filterFrom);
  if(filterTo)filtered=filtered.filter(t=>(t.date||"")<=filterTo);
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
  const saveTx=()=>{
    /* V19.4 FIX: Double-click protection — bail out if a save is already in flight */
    if(savingTx)return;
    /* V19.7 FIX: Validation failures used to play just a beep with NO visible message,
       making users think "I pressed save but nothing happened — is the form broken?"
       Especially in sticky mode, where they'd then report "fields didn't clear after save"
       (when in reality save was silently rejected). Adding a toast on each rejection. */
    const amt=parseFloat(txAmount);if(!amt||amt<=0){playBeep("error");showToast("⛔ المبلغ مطلوب — اكتب قيمة أكبر من صفر");return}
    /* Block save on locked day unless admin */
    if(isDayLocked(txDate)&&!isAdmin){playBeep("error");showToast("⛔ اليوم "+txDate+" مقفول — للمدير فقط");return}
    /* V19.4: Lock the button now that we've passed all early-return validations */
    setSavingTx(true);
    /* Schedule unlock so the next entry (sticky mode) or re-open works.
       700ms is long enough to defeat double-clicks/double-taps but short enough
       that the user can save a series of entries comfortably. */
    setTimeout(()=>setSavingTx(false),700);
    /* If party is linked, validate & expand desc */
    let finalDesc=txDesc;
    let linkedCustId=null,linkedSupplierId=null,linkedWsName=null,linkedEmpId=null;
    if(txPartyId&&txPartyType==="customer"){const c=customers.find(x=>x.id===txPartyId);if(c){linkedCustId=c.id;if(!finalDesc.trim())finalDesc="دفعة من "+c.name}}
    if(txPartyId&&txPartyType==="supplier"){const s=suppliers.find(x=>x.id===txPartyId);if(s){linkedSupplierId=s.id;if(!finalDesc.trim())finalDesc="دفع لـ "+s.name}}
    if(txPartyId&&txPartyType==="workshop"){const w=workshops.find(x=>x.id===txPartyId||x.name===txPartyId);if(w){linkedWsName=w.name;if(!finalDesc.trim())finalDesc=wsDesc(w.name,txCategory==="مشتريات")}}
    if(txPartyId&&txPartyType==="employee"){const e=(data.employees||[]).find(x=>x.id===txPartyId);if(e){linkedEmpId=e.id;if(!finalDesc.trim())finalDesc="سلفة "+e.name}}
    /* V18.73: Auto-link to workshop by combined desc+notes match if no party
       was picked. Previously the matcher only saw `desc OR notes` (via ||),
       missing entries where the workshop name was in notes only or split
       across both fields. Now we concatenate. The ambiguity guard inside
       matchWorkshopFromDesc still prevents wrong links. */
    let _autoLinkedWs=null;
    let _autoLinkAttempted=false;
    /* V21.9.68: narrow the auto-workshop-link to "تشغيل خارجي" only.
       Pre-V21.9.68 this also fired for "مشتريات" — but "مشتريات" is overloaded:
       it can mean workshop-side purchases (raw materials for the workshop) OR
       generic supplier purchases (office supplies, fabric from a wholesaler, etc.).
       Forcing a workshop warning on every مشتريات produced a misleading
       "حُفظ بدون ربط بورشة" toast even when the user clearly wanted a
       generic purchase. Now we ONLY auto-link مشتريات IF the user wrote a
       workshop name in the desc (best-effort, no warning if no match). */
    if(!linkedWsName&&txType==="out"&&txCategory==="تشغيل خارجي"){
      _autoLinkAttempted=true;
      const _haystack=((finalDesc||"")+" "+(txNotes||"")).trim();
      _autoLinkedWs=matchWorkshopFromDesc(_haystack,workshops);
      if(_autoLinkedWs)linkedWsName=_autoLinkedWs.name;
    }
    /* V21.9.83 (Treasury audit Bug #2): مشتريات auto-link REMOVED.
       Pre-V21.9.83 a treasury entry categorized "مشتريات" would silently
       auto-link to a workshop if its name appeared anywhere in the desc.
       This created spurious wsPayments entries when:
       • A user typed a supplier's name that coincidentally matches a
         workshop name (e.g. "ورشة الشامواه" matching "مشتريات شامواه").
       • Generic purchases (office supplies, etc.) got linked because of
         partial-substring matches.
       Result: wsPayments grew with type="purchase" entries that don't
       represent actual workshop obligations → balance inflated; treasury/
       wsPayments reconciliation broke.
       Now: مشتريات entries are NEVER auto-linked to a workshop. If the
       user wants to record a workshop purchase, they must explicitly
       select the workshop via the party picker (which sets txPartyId). */
    /* V19.9 FIX: Mirror workshop auto-link for CUSTOMERS/SUPPLIERS/EMPLOYEES.
       Root cause of "دفعات كاش" card not matching treasury totals:
       
       Treasury entries categorized "دفعة عميل" / "دفعة مورد" / "مرتبات" only
       generate corresponding records in d.custPayments / d.supplierPayments /
       d.hrLog when `linkedCustId` / `linkedSupplierId` / `linkedEmpId` is set
       (see lines ~808-820). Those vars are populated ONLY when txPartyId was
       set at save time — i.e., when the user explicitly picked from the inline
       picker. If the user typed the party name into بيان manually (or the
       picker selection was lost between renders), txPartyId is empty → the
       entry saves with category="دفعة عميل" but custId=null → it appears in
       the treasury journal but is invisible to:
       - Customer statement (كشف الحركات)
       - "دفعات كاش" total card on the customer dashboard (reads custPayments)
       
       Workshop entries got an auto-link from desc back in V18.73; customers
       didn't, until now. This block tries to identify the missing party from
       the desc/notes haystack via matchPartyFromDesc (substring match with
       Arabic normalization + ambiguity guard). If matched, we fill in the
       linked* var so the standard custPayments/supplierPayments/hrLog code
       below picks it up.
       
       Important: We use minNameLength=3 to avoid matching very short customer
       names (like "أ", "م") that would be substrings of almost any text. */
    let _autoLinkedParty=null;
    if(!editId&&!linkedCustId&&!linkedSupplierId&&!linkedEmpId&&!linkedWsName){
      const _haystack=((finalDesc||"")+" "+(txNotes||"")).trim();
      if(txType==="in"&&txCategory==="دفعة عميل"&&customers.length>0){
        const m=matchPartyFromDesc(_haystack,customers,{minNameLength:3});
        if(m){linkedCustId=m.id;_autoLinkedParty={kind:"customer",name:m.name}}
      } else if(txType==="out"&&txCategory==="دفعة مورد"&&suppliers.length>0){
        const m=matchPartyFromDesc(_haystack,suppliers,{minNameLength:3});
        if(m){linkedSupplierId=m.id;_autoLinkedParty={kind:"supplier",name:m.name}}
      } else if(txType==="out"&&txCategory==="مرتبات"&&Array.isArray(data.employees)){
        const _emps=(data.employees||[]).filter(e=>!e.inactive);
        const m=matchPartyFromDesc(_haystack,_emps,{minNameLength:3});
        if(m){linkedEmpId=m.id;_autoLinkedParty={kind:"employee",name:m.name}}
      } else if(txType==="out"&&txCategory==="مشتريات"&&suppliers.length>0){
        /* V21.9.68: try supplier auto-link for مشتريات when no workshop matched.
           Without this, a "مشتريات" + supplier name in desc would save without
           any party link → invisible in supplier statement. Now we get a free
           supplier link from the desc, same way as "دفعة مورد". */
        const m=matchPartyFromDesc(_haystack,suppliers,{minNameLength:3});
        if(m){linkedSupplierId=m.id;_autoLinkedParty={kind:"supplier",name:m.name}}
      }
    }
    /* V18.35: capture freshly-built treasury entry for post-commit auto-posting */
    let _newBaseEntry=null;
    let _newFeeEntry=null;/* V21.9.204: wallet commission entry, auto-posted after upConfig */
    /* V19.3 FIX: For EDITS of plain (non-sourceType) treasury entries, capture the
       OLD entry BEFORE mutation so we can reverse the original journal entry, then
       re-post a fresh one based on the new values. Without this, editing the amount/
       date/category of a treasury entry left a STALE journal entry — a serious
       accounting bug because reports would show the old numbers. */
    let _oldEntryForReverse=null;
    let _editedEntryForRepost=null;
    /* V21.9.213 (e-wallets): on EDIT, re-sync the wallet-commission child
       (remove-then-recreate). Capture the OLD fee child's {sourceId,date} here so
       its journal entry is reversed after upConfig (mirrors the parent's
       reverse+repost). The NEW fee entry reuses _newFeeEntry's existing autoPost. */
    let _walletFeeOldForReverse=null;
    if(editId){
      const _origTx=(data.treasury||[]).find(t=>t.id===editId);
      if(_origTx&&!_origTx.sourceType){
        /* Plain treasury entry — eligible for reverse + re-post */
        _oldEntryForReverse={
          sourceId:_origTx.id,
          date:_origTx.date,
        };
      }
    }
    /* V19.70.3: pre-generate the new custPayment ID so we can fire an instant
       paymentReceived event after upConfig commits. Without this, the gid() is
       inline inside the mutator and we have no way to reference the resulting
       payment for the idempotencyKey. Only relevant for new entries (not edits)
       in the customer-payment path. */
    const _instantPay_needed = (linkedCustId && txType==="in" && txCategory==="دفعة عميل" && !editId);
    const _instantPay_id = _instantPay_needed ? gid() : null;
    const _instantPay_customer = _instantPay_needed ? customers.find(x=>x.id===linkedCustId) : null;
    /* V19.76.5: same pattern for supplier-side cash payments. Skip شيكات (those fire
       via checkPaymentIssued instead — handled on the saveCheck path). */
    const _isCheckMethod = String(txMethod||"").indexOf("شيك") >= 0;
    const _instantSupplierPay_needed = (linkedSupplierId && txType==="out" && txCategory==="دفعة مورد" && !editId && !_isCheckMethod);
    const _instantSupplierPay_id = _instantSupplierPay_needed ? gid() : null;
    const _instantSupplierPay_supplier = _instantSupplierPay_needed ? suppliers.find(x=>x.id===linkedSupplierId) : null;
    /* V21.9.70: OPTIMISTIC UI — close the form / apply sticky reset BEFORE the
       upConfig call. Pre-V21.9.68 the form-close ran at the END of saveTx, which
       (since V21.9.67's await) meant a 2-5s wait before the popup disappeared.
       V21.9.70: keep the pre-close optimistic UI, but REVERT the await (see
       protocol note below). The autoPost calls below run fire-and-forget like
       pre-V21.9.67. */
    const _isStickyContinue = stickyMode && stickyMode.count > 1 && !editId;
    if(!_isStickyContinue){
      setShowForm(false);
      setTxAmount("");setTxDesc("");setTxNotes("");setTxCategory("");
      setTxType("in");setTxPartyId("");setTxPartyType("");setTxMethod("نقدي كاش");
      setEditId(null);
    }
    /* V21.9.70 PROTOCOL-DRIVEN REVERT — restore pre-V21.9.67 sync behavior.
       V21.9.67 added `await upConfig(...)` to prevent autoPost firing before
       the Firestore commit. The intent was correct (avoid orphan accountingDays
       entries on commit failure), but the await introduced:
       • Toast delay of 2-5s (user-visible regression)
       • Possible data-resurrection on rapid save+delete (user-reported in V21.9.69)
       • Form-stuck UX even with V21.9.68 optimistic-UI patch
       Trade-off accepted in V21.9.70: revert to fire-and-forget autoPost.
       Orphans are still preventable via:
       1. The audit-orphan-accounting endpoint (V21.9.67 cleanup tool)
       2. The accountingPostFailures health pill (V21.9.67 visibility)
       3. The runTransaction in syncSplitCollection (kept — the BIGGEST data-
          integrity fix) reduces upConfig failures to nearly zero. */
    upConfig(d=>{if(!d.treasury)d.treasury=[];
      if(editId){const tx=d.treasury.find(t=>t.id===editId);
        if(tx){
          /* V17.3 FIX: Capture old empId BEFORE overwriting it, so we can sync hrLog */
          const oldEmpId=tx.empId;
          const oldHrLogId=tx.hrLogId;
          const oldSourceType=tx.sourceType;
          tx.type=txType;tx.amount=amt;tx.desc=finalDesc;tx.notes=txNotes;tx.category=txCategory;tx.account=txAccount;tx.season=txSeason;tx.date=txDate;tx.custId=linkedCustId;tx.supplierId=linkedSupplierId;tx.empId=linkedEmpId;tx.updatedBy=userName;tx.updatedAt=nowISO();
          /* V19.3: capture the freshly-mutated tx for journal re-post (only if it was eligible) */
          if(_oldEntryForReverse&&!tx.sourceType){
            _editedEntryForRepost={...tx};
          }
          /* V21.9.213 (e-wallets): keep the wallet-commission child (walletFeeFor
             ===editId) in sync with the edited entry. Remove-then-recreate handles
             every transition: amount change (new fee), wallet→cash / out→in (fee
             dropped), cash→wallet-out (fee added), tier/percent change. The
             `!tx.walletFeeFor` guard prevents generating a commission ON a
             commission row (if the user edits the fee entry itself). Runs for ANY
             wallet withdrawal regardless of the parent's sourceType — commission is
             created the same way in the new-entry branch. */
          if(!tx.walletFeeFor){
            const _oldFeeChild=(d.treasury||[]).find(t=>t.walletFeeFor===editId)||null;
            if(_oldFeeChild){
              _walletFeeOldForReverse={sourceId:_oldFeeChild.id,date:_oldFeeChild.date};
              d.treasury=d.treasury.filter(t=>t.walletFeeFor!==editId);
            }
            const _wEdit=(d.treasuryAccounts||[]).find(a=>a&&typeof a==="object"&&a.name===txAccount&&a.type==="wallet");
            if(txType==="out"&&_wEdit){
              const _feeEdit=computeWalletFee(_wEdit,amt);
              if(_feeEdit>0){
                _newFeeEntry={id:gid(),type:"out",amount:_feeEdit,desc:"عمولة محفظة — "+txAccount,notes:"عمولة على سحب "+fmt0(amt)+" ج.م",category:"عمولة محفظة",account:txAccount,season:txSeason,date:txDate,day:dayName(txDate),by:userName,createdAt:nowISO(),walletFeeFor:editId};
                d.treasury.unshift(_newFeeEntry);
              }
            }
          }
          /* V21.9.83 (Treasury audit Bug #3 + #6): sync linked wsPayment.
             - Bug #6: if the wsPayment was deleted between save and edit,
               clear the dangling wsPaymentId on the treasury entry so the
               balance calc doesn't lose track of the payment.
             - Bug #3: only flip wp.type if the category genuinely changed
               TO/FROM "مشتريات". Pre-V21.9.83 we silently flipped on every
               edit, which could contaminate the wsPayment when the category
               toggled back and forth. */
          if(tx.wsPaymentId){
            const wp=(d.wsPayments||[]).find(p=>p.id===tx.wsPaymentId);
            if(wp){
              wp.amount=amt;wp.notes=txNotes;wp.date=txDate;
              const newType=txCategory==="مشتريات"?"purchase":"payment";
              if(wp.type!==newType){
                console.warn("[V21.9.83 wsPayment type changed]",{id:wp.id,from:wp.type,to:newType,treasuryId:tx.id});
                wp.type=newType;
              }
            }else{
              /* Orphan: the wsPayment was deleted externally. Clear the
                 dangling reference so balance calc + future edits don't
                 silently misbehave. */
              console.warn("[V21.9.83 wsPayment orphan cleared]",{treasuryId:tx.id,danglingId:tx.wsPaymentId});
              delete tx.wsPaymentId;
            }
          }
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
            d.custPayments.push({id:gid(),custId:linkedCustId,custName:c?c.name:"",amount:amt,date:txDate,note:txNotes||finalDesc,method:txMethod||"نقدي كاش",by:userName,treasuryTxId:editId,createdAt:nowISO()});
          }
          if(linkedSupplierId&&txType==="out"){
            if(!d.supplierPayments)d.supplierPayments=[];
            const s=suppliers.find(x=>x.id===linkedSupplierId);
            d.supplierPayments.push({id:gid(),supplierId:linkedSupplierId,supplierName:s?s.name:"",amount:amt,date:txDate,note:txNotes||finalDesc,method:txMethod||"نقدي كاش",by:userName,treasuryTxId:editId,createdAt:nowISO()});
          }
          /* V17.3 FIX: If the edit added an employee link (was no advance, now is one), create hrLog */
          if(linkedEmpId&&txType==="out"&&!tx.hrLogId&&linkedEmpId!==oldEmpId){
            if(!d.hrLog)d.hrLog=[];
            const emp=(d.employees||[]).find(x=>x.id===linkedEmpId);
            const logId=gid();
            d.hrLog.unshift({id:logId,type:"advance",empId:linkedEmpId,empName:emp?emp.name:"",amount:amt,desc:txNotes||finalDesc||"سلفة",weekId:"",date:txDate,by:userName,createdAt:nowISO()});
            tx.sourceType="hr_advance";tx.hrLogId=logId;
          }
        }}
      else{
        const txId=gid();
        const baseEntry={id:txId,type:txType,amount:amt,desc:finalDesc,notes:txNotes,category:txCategory,account:txAccount,season:txSeason,date:txDate,day:dayName(txDate),custId:linkedCustId,supplierId:linkedSupplierId,empId:linkedEmpId,by:userName,createdAt:nowISO()};
        /* Auto-link to customer payments if customer selected */
        if(linkedCustId&&txType==="in"){if(!d.custPayments)d.custPayments=[];
          const c=customers.find(x=>x.id===linkedCustId);
          d.custPayments.push({id:_instantPay_id||gid(),custId:linkedCustId,custName:c?c.name:"",amount:amt,date:txDate,note:txNotes||finalDesc,method:txMethod||"نقدي كاش",by:userName,treasuryTxId:txId,createdAt:nowISO()})}
        /* Auto-link to supplier payments. V19.76.5: use pre-generated _instantSupplierPay_id
           when applicable so the idempotencyKey on the instant fire matches the cron's id. */
        if(linkedSupplierId&&txType==="out"){if(!d.supplierPayments)d.supplierPayments=[];
          const s=suppliers.find(x=>x.id===linkedSupplierId);
          d.supplierPayments.push({id:_instantSupplierPay_id||gid(),supplierId:linkedSupplierId,supplierName:s?s.name:"",amount:amt,date:txDate,note:txNotes||finalDesc,method:txMethod||"نقدي كاش",by:userName,treasuryTxId:txId,createdAt:nowISO()})}
        /* Auto-link to employee advance (hrLog) */
        if(linkedEmpId&&txType==="out"){if(!d.hrLog)d.hrLog=[];
          const emp=(d.employees||[]).find(x=>x.id===linkedEmpId);
          const logId=gid();
          d.hrLog.unshift({id:logId,type:"advance",empId:linkedEmpId,empName:emp?emp.name:"",amount:amt,desc:txNotes||finalDesc||"سلفة",weekId:"",date:txDate,by:userName,createdAt:nowISO()});
          baseEntry.sourceType="hr_advance";baseEntry.hrLogId=logId}
        /* Auto-link to workshop payments */
        if(linkedWsName&&txType==="out"){if(!d.wsPayments)d.wsPayments=[];
          const w=workshops.find(x=>x.name===linkedWsName);const wsPayId=gid();
          d.wsPayments.push({id:wsPayId,wsName:linkedWsName,wsId:w?w.id:null,amount:amt,type:txCategory==="مشتريات"?"purchase":"payment",notes:txNotes,date:txDate,createdBy:userName,treasuryTxId:txId,createdAt:nowISO()});
          baseEntry.wsPaymentId=wsPayId;baseEntry.wsName=linkedWsName;baseEntry.sourceType="ws_payment"}
        d.treasury.unshift(baseEntry);
        /* V18.35: stash for post-commit auto-posting */
        _newBaseEntry=baseEntry;
        /* V21.9.204 (e-wallets Phase 2): tiered commission auto-deducted on a
           WITHDRAWAL (out) from a wallet. GUARDED to wallet+out — cash/bank
           flows never enter this branch, so they are completely unaffected.
           The fee is a separate "out" entry on the SAME wallet (category
           "عمولة محفظة"), linked to the parent via walletFeeFor, and auto-posted
           to accounting below like any plain treasury out. NEW entries only
           (editing an existing wallet-out does not recompute the commission). */
        if(txType==="out"){
          const _w=(d.treasuryAccounts||[]).find(a=>a&&typeof a==="object"&&a.name===txAccount&&a.type==="wallet");
          const _fee=_w?computeWalletFee(_w,amt):0;
          if(_fee>0){
            _newFeeEntry={id:gid(),type:"out",amount:_fee,desc:"عمولة محفظة — "+txAccount,notes:"عمولة على سحب "+fmt0(amt)+" ج.م",category:"عمولة محفظة",account:txAccount,season:txSeason,date:txDate,day:dayName(txDate),by:userName,createdAt:nowISO(),walletFeeFor:txId};
            d.treasury.unshift(_newFeeEntry);
          }
        }
      }});
    /* V21.9.70 REVERT: pre-V21.9.67 fire-and-forget autoPost — no error gate.
       Errors land in accountingPostFailures (V21.9.67 health pill surfaces them). */
    /* V18.35: auto-post journal entry for the new treasury row.
       We do this AFTER upConfig commits — uses fresh entry object built above.
       Only fires for plain treasury entries (not the linked ones — those
       have specific posting rules handled by their own hooks).

       V19.8 CRITICAL FIX: Wrapped in try/catch and Promise.resolve to handle
       the case where autoPost.treasury() returns a plain object (when
       autoPostEnabled is false in accountingSettings). Calling .catch on a
       plain object throws TypeError which would EXIT saveTx EARLY, skipping
       the sticky reset block below — leaving the counter stuck and form
       fields un-cleared even though the entry saved successfully. */
    if(_newBaseEntry && !_newBaseEntry.sourceType){
      try{
        const _r=autoPost.treasury(data, _newBaseEntry, userName);
        if(_r && typeof _r.then==="function") _r.catch(()=>{});
      }catch(e){console.warn("[V19.8] autoPost.treasury sync threw:",e?.message||e);}
    }
    /* V21.9.204: auto-post the wallet commission entry too (plain treasury out). */
    if(_newFeeEntry){
      try{
        const _rf=autoPost.treasury(data, _newFeeEntry, userName);
        if(_rf && typeof _rf.then==="function") _rf.catch(()=>{});
      }catch(e){console.warn("[V21.9.204] wallet-fee autoPost threw:",e?.message||e);}
    }
    /* V19.70.3: INSTANT paymentReceived event trigger (client-side hook).
       Fires the WhatsApp notification the moment the payment is saved, instead
       of waiting up to 5 minutes for the next cron tick. The cron remains a
       fallback — if this client-side fire fails (network down, app closed
       before request completes), the cron will pick up the payment via the
       normal scan within ≤5 min. Idempotency via `payment:${id}` ensures no
       duplicate notification regardless of which path fires first.

       Only fires for: NEW (not edit) + customer payment + linked customer.
       Skips entirely if the user has no phone, the trigger isn't enabled,
       or the customer is unknown. The endpoint itself enforces config
       (enabled/recipients/templates), so this is just a "wake up the cron
       early" path. */
    if(_instantPay_needed && _instantPay_id && _instantPay_customer?.phone){
      /* V19.76.2: customer balance AFTER this payment, applying customer discount.
         V19.76.4: ALSO subtract receivable, non-bounced/cancelled, "دفعة عميل"
         checks. Without this, a customer who paid 300 in checks + new 100 cash
         on a 1440-after-discount balance would see "1340" instead of "1040".
         Matches the كشف الحساب formula exactly (cash + receivableChecks both subtracted). */
      let _gross = 0;
      for(const o of (data.orders||[])){
        for(const d of (o.customerDeliveries||[])){
          if(d.custId===linkedCustId){
            _gross += (Number(d.qty)||0) * (Number(d.price)||Number(o.sellPrice)||0);
          }
        }
        for(const r of (o.customerReturns||[])){
          if(r.custId===linkedCustId){
            _gross -= (Number(r.qty)||0) * (Number(r.price)||Number(o.sellPrice)||0);
          }
        }
      }
      const _discPct = Number(_instantPay_customer.discount)||0;
      const _discAmt = Math.round(_gross * _discPct / 100);
      let _bal = _gross - _discAmt;
      for(const p of (data.custPayments||[])){
        if(p.custId===linkedCustId) _bal -= Number(p.amount)||0;
      }
      /* V19.76.4: subtract pending receivable cashpay checks (مرتد/ملغي excluded) */
      for(const ck of (data.checks||[])){
        if(ck.partyId !== linkedCustId) continue;
        if(ck.type !== "receivable") continue;
        if(ck.status === "مرتد" || ck.status === "ملغي") continue;
        if((ck.category || "دفعة عميل") !== "دفعة عميل") continue;
        _bal -= Number(ck.amount)||0;
      }
      _bal -= amt;/* the new payment we just recorded */

      /* Fire-and-forget — don't await, don't block save UX */
      (async ()=>{
        try{
          if(!user || typeof user.getIdToken !== "function") return;
          const _idToken = await user.getIdToken();
          await fetch("/api/event-trigger", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + _idToken },
            body: JSON.stringify({
              eventType: "paymentReceived",
              payload: {
                customerName: _instantPay_customer.name || "—",
                amount: amt,
                method: txMethod || "نقدي كاش",
                balance: Math.round(_bal),
                date: txDate,
                portalLink: "",
              },
              customerPhone: _instantPay_customer.phone,
              idempotencyKey: "payment:" + _instantPay_id,
            }),
          });
        }catch(e){
          /* Silent — cron will retry on next tick (within 5 min) */
          console.warn("[V19.70.3] instant paymentReceived fire failed (cron will retry):", e?.message||e);
        }
      })();
    }
    /* V19.76.5: INSTANT supplierPaymentSent fire — mirror of the customer-side hook above.
       Fires when a treasury "out" with category="دفعة مورد" + non-check method is saved.
       Supplier balance is approximated as -Σ(supplierPayments for this supplier) — same
       semantic the existing checkPaymentIssued uses. Idempotency key matches the cron's. */
    if(_instantSupplierPay_needed && _instantSupplierPay_id && _instantSupplierPay_supplier?.phone){
      let _supBal = 0;
      for(const p of (data.supplierPayments||[])){
        if(p.supplierId===linkedSupplierId) _supBal -= Number(p.amount)||0;
      }
      _supBal -= amt;/* the new payment we just recorded */
      const _supOffice = _instantSupplierPay_supplier.companyName
        || _instantSupplierPay_supplier.company
        || _instantSupplierPay_supplier.office
        || _instantSupplierPay_supplier.businessName
        || "";
      (async ()=>{
        try{
          if(!user || typeof user.getIdToken !== "function") return;
          const _idToken = await user.getIdToken();
          await fetch("/api/event-trigger", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + _idToken },
            body: JSON.stringify({
              eventType: "supplierPaymentSent",
              payload: {
                supplierName: _instantSupplierPay_supplier.name || "—",
                amount: amt,
                method: txMethod || "نقدي كاش",
                balance: Math.round(_supBal),
                date: txDate,
                office: _supOffice,
              },
              supplierPhone: _instantSupplierPay_supplier.phone,
              idempotencyKey: "supplierPay:" + _instantSupplierPay_id,
            }),
          });
        }catch(e){
          console.warn("[V19.76.5] instant supplierPaymentSent fire failed (cron will retry):", e?.message||e);
        }
      })();
    }
    /* V19.3 FIX: For EDITS of plain treasury entries, reverse the original
       journal entry then post a fresh one. Sequenced to avoid race conditions:
       reverse first (uses ORIGINAL date), then post (uses NEW date). Both fire
       in the background; failures are recorded in accountingPostFailures. */
    if(_oldEntryForReverse && _editedEntryForRepost){
      (async()=>{
        try{
          await autoPost.reverse(data,"treasury",_oldEntryForReverse.sourceId,_oldEntryForReverse.date,"تعديل حركة خزنة",userName);
        }catch(e){console.warn("[V19.3] failed to reverse old journal entry:",e?.message||e);}
        try{
          await autoPost.treasury(data,_editedEntryForRepost,userName);
        }catch(e){console.warn("[V19.3] failed to re-post journal entry:",e?.message||e);}
      })();
    }
    /* V21.9.213 (e-wallets): reverse the OLD wallet-commission JE on edit. The new
       fee entry (if any) is posted by the _newFeeEntry autoPost above; they target
       different source ids so ordering is irrelevant. Fire-and-forget; reverse()
       no-ops if there's no matching JE — same pattern as the delete reversals. */
    if(_walletFeeOldForReverse){
      autoPost.reverse(data,"treasury",_walletFeeOldForReverse.sourceId,_walletFeeOldForReverse.date,"تعديل عمولة محفظة",userName).catch(()=>{});
    }
    /* V18.52: Sticky mode — keep form open for next entry with same category */
    if(stickyMode && stickyMode.count > 1 && !editId){
      /* Decrement counter, keep form open with category + type preserved */
      const newCount = stickyMode.count - 1;
      setStickyMode({...stickyMode, count: newCount});
      /* V19.6 FIX: Reset ALL non-pinned fields after save (amount/desc/notes/party
         AND account AND season). The previous logic kept account+season, which felt
         inconsistent with "وضع التكرار" — pinned fields are explicit (sticky type/
         category + sticky date). Everything else should reset to a fresh state.
         Using the same default logic as the form-open block (line 1719). */
      setTxAmount("");setTxDesc("");setTxNotes("");setTxPartyId("");setTxPartyType("");
      setTxAccount(view.startsWith("acc_")?(accountsData.find(a=>a.id===view.slice(4))?.name||"SUB CASH"):"SUB CASH");
      setTxSeason(data.activeSeason||"");
      /* Re-apply party type derived from sticky category */
      if(stickyMode.category==="دفعة عميل")setTxPartyType("customer");
      else if(stickyMode.category==="دفعة مورد")setTxPartyType("supplier");
      else if(stickyMode.category==="تشغيل خارجي")setTxPartyType("workshop");
      else if(stickyMode.category==="مرتبات")setTxPartyType("employee");
      /* V19.9: warn in sticky mode if the entry just saved had no party link.
         These warnings stack on top of the count update so the user notices
         immediately and can decide to edit/delete that specific entry. */
      let _stickyWarn="";
      if(txType==="in"&&txCategory==="دفعة عميل"&&!linkedCustId){_stickyWarn="⚠ بدون ربط بعميل — ";}
      else if(txType==="out"&&txCategory==="دفعة مورد"&&!linkedSupplierId){_stickyWarn="⚠ بدون ربط بمورد — ";}
      else if(txType==="out"&&txCategory==="مرتبات"&&!linkedEmpId){_stickyWarn="⚠ بدون ربط بموظف — ";}
      else if(_autoLinkedParty){_stickyWarn="✓ ربط تلقائي بـ"+_autoLinkedParty.name+" — ";}
      showToast((_stickyWarn||"✓ حُفظ — ")+"متبقي "+newCount+" حركة");
      return;
    }
    /* If sticky finished, clear the mode */
    if(stickyMode && stickyMode.count <= 1){
      setStickyMode(null);
      showToast("✓ تم الحفظ — انتهى وضع التكرار");
    } else if(_autoLinkedWs){
      /* V18.72: silent auto-link toast */
      showToast("✓ ربط تلقائي بورشة "+_autoLinkedWs.name);
    } else if(_autoLinkedParty){
      /* V19.9: silent auto-link toast for customer/supplier/employee */
      const _kindAr=_autoLinkedParty.kind==="customer"?"عميل":_autoLinkedParty.kind==="supplier"?"مورد":"موظف";
      showToast("✓ ربط تلقائي بـ"+_kindAr+" "+_autoLinkedParty.name);
    } else if(_autoLinkAttempted&&!linkedWsName){
      /* V18.73: workshop-category entry was saved unlinked. */
      showToast("⚠ حُفظ بدون ربط بورشة — لن يظهر في كشف الحساب");
    } else if(txType==="in"&&txCategory==="دفعة عميل"&&!linkedCustId){
      /* V19.9: customer-payment entry saved without a customer link.
         Warn loudly because the entry won't appear in customer statements
         or the "دفعات كاش" total — a major source of recent confusion. */
      showToast("⚠ حُفظ بدون ربط بعميل — لن يظهر في كشف العميل أو دفعات كاش");
    } else if(txType==="out"&&txCategory==="دفعة مورد"&&!linkedSupplierId){
      showToast("⚠ حُفظ بدون ربط بمورد — لن يظهر في كشف المورد");
    } else if(txType==="out"&&txCategory==="مرتبات"&&!linkedEmpId){
      showToast("⚠ حُفظ بدون ربط بموظف — راجع الحركة");
    } else {
      showToast("✓ تم الحفظ");
    }
    /* V21.9.68: form-close moved to PRE-await block (see "OPTIMISTIC UI"
       above). Pre-V21.9.68 this line ran AFTER the 2-5s upConfig await,
       which made the popup stay open until the Firestore write completed. */
    };
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
       V16.65: Used to also block any externally-linked tx via dataIntegrity.getReferences,
       BUT that block showed an empty-onConfirm popup that confused users (looked like
       delete was happening but wasn't).
       V18.69 FIX: Removed the getReferences early-return. The row-level popup (in render)
       already warns the user "⚠️ حركة مرتبطة بـ X — الحذف هنا لن يؤثر على المصدر".
       The cascade logic below correctly handles ALL linked records:
         • hr_advance  → deletes treasury + linked hrLog entry
         • transfer    → deletes both legs + transfer record
         • cust/supplier/ws payments → deletes linked payment records
         • check       → only deletes treasury entry (the check itself stays for audit)
         • purchase_receipt → only deletes treasury entry (receipt stays)
       Only hr_salary remains hard-blocked because deletion would corrupt prevBalance
       and the week's accounting reconciliation. */
    const txCheck=(data.treasury||[]).find(t=>t.id===id);
    if(txCheck&&txCheck.sourceType==="hr_salary"){
      showToast("⛔ لا يمكن حذف مرتب من هنا — احذف الأسبوع من صفحة الموظفين");
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
    /* V21.10.6: snapshot treasury ids before delete (tombstone root-fix) */
    const _beforeTreasuryIds=new Set((d.treasury||[]).map(t=>String(t&&t.id)));
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
      /* V21.9.211 (e-wallets): cascade-delete the wallet-commission child
         ("عمولة محفظة", linked via walletFeeFor===id). Pre-V21.9.211 deleting a
         wallet withdrawal ORPHANED its commission entry in the ledger + accounting
         → overstated the wallet's outflow and the commission expense. The parent
         withdrawal is a plain wallet "out" (no transferId) so it lands here in the
         non-transfer branch; its fee child is removed alongside it. */
      d.treasury=(d.treasury||[]).filter(t=>t.id!==id&&t.walletFeeFor!==id);
      if(tx){
        /* V19.20: Bilateral cascade — catch records linked via EITHER direction.
           Forward: wsPayment.treasuryTxId === tx.id (existing).
           Reverse: tx.wsPaymentId === wsPayment.id (new — handles legacy/edge cases
           where only one side of the link was set). Same for cust/supplier.
           V19.76.4: also legacy-fallback by (custId/supplierId + amount + date) so
           pre-V15.9 payments without treasuryTxId are still cascaded. User report:
           "الدفعة النقدي اللي متسجلة بـ100 جنيه انا حذفتها خالص ولسه موجودة في كشف الحساب".
           Without the fallback, payments saved before treasuryTxId existed (or after
           a sync race that broke the link) survive the cascade and re-appear in the
           customer's kashf as orphans. The fallback uses an exact (custId, amount, date)
           triple — false-positive risk minimized vs date-only matching. */
        if(d.custPayments){
          d.custPayments=d.custPayments.filter(p=>p.treasuryTxId!==id&&(!tx.custPaymentId||p.id!==tx.custPaymentId));
          if(tx.custId && (tx.sourceType==="cust_payment" || tx.category==="دفعة عميل")){
            d.custPayments=d.custPayments.filter(p=>!(
              p.treasuryTxId===undefined &&
              p.custId===tx.custId &&
              Math.abs((Number(p.amount)||0)-(Number(tx.amount)||0))<0.01 &&
              p.date===tx.date
            ));
          }
        }
        if(d.supplierPayments){
          d.supplierPayments=d.supplierPayments.filter(p=>p.treasuryTxId!==id&&(!tx.supplierPaymentId||p.id!==tx.supplierPaymentId));
          if(tx.supplierId && (tx.sourceType==="supplier_payment" || tx.category==="دفعة مورد")){
            d.supplierPayments=d.supplierPayments.filter(p=>!(
              p.treasuryTxId===undefined &&
              p.supplierId===tx.supplierId &&
              Math.abs((Number(p.amount)||0)-(Number(tx.amount)||0))<0.01 &&
              p.date===tx.date
            ));
          }
        }
        if(d.wsPayments)d.wsPayments=d.wsPayments.filter(p=>p.treasuryTxId!==id&&(!tx.wsPaymentId||p.id!==tx.wsPaymentId));
      }
    }
    /* V19.13: tombstone — same rationale as the bulk-delete tombstones below.
       Without this, deleting a customer-payment treasury entry from this page
       would still leave the door open for V19.9 recovery / V18.64 fallback
       to recreate the cust/supplier payment from any lingering treasury row,
       which was exactly the user-reported "حذفت ولسه ظاهرة" symptom. */
    if(tx&&(tx.custId||tx.sourceType==="cust_payment"||tx.category==="دفعة عميل")){
      if(!Array.isArray(d._deletedCustPayTreasuryIds))d._deletedCustPayTreasuryIds=[];
      d._deletedCustPayTreasuryIds.push(tx.id);
      d._deletedCustPayTreasuryIds=[...new Set(d._deletedCustPayTreasuryIds)];if(d._deletedCustPayTreasuryIds.length>1000)d._deletedCustPayTreasuryIds=d._deletedCustPayTreasuryIds.slice(-1000);/* V21.9.251: dedup + cap رفعته 200→1000 — الـ FIFO القديم كان ممكن يطرد tombstone لسه محتاجينه فتتبعت حركة محذوفة عمداً */
    }
    if(tx&&(tx.supplierId||tx.sourceType==="supplier_payment"||tx.category==="دفعة مورد")){
      if(!Array.isArray(d._deletedSupplierPayTreasuryIds))d._deletedSupplierPayTreasuryIds=[];
      d._deletedSupplierPayTreasuryIds.push(tx.id);
      d._deletedSupplierPayTreasuryIds=[...new Set(d._deletedSupplierPayTreasuryIds)];if(d._deletedSupplierPayTreasuryIds.length>1000)d._deletedSupplierPayTreasuryIds=d._deletedSupplierPayTreasuryIds.slice(-1000);/* V21.9.251: dedup + cap رفعته 200→1000 */
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
      }
      /* V21.10.6 ROOT-FIX: tombstone every treasury id removed (same as bulkDeleteTxs) */
      const _afterTreasuryIds=new Set((d.treasury||[]).map(t=>String(t&&t.id)));
      const _removedTreasuryIds=[..._beforeTreasuryIds].filter(x=>!_afterTreasuryIds.has(x));
      if(_removedTreasuryIds.length>0){
        if(!Array.isArray(d._deletedTreasuryIds))d._deletedTreasuryIds=[];
        d._deletedTreasuryIds.push(..._removedTreasuryIds);
        d._deletedTreasuryIds=[...new Set(d._deletedTreasuryIds)];
        if(d._deletedTreasuryIds.length>3000)d._deletedTreasuryIds=d._deletedTreasuryIds.slice(-3000);
        try{console.warn("[V21.10.6 treasury-tombstone] deleted id tombstoned:",_removedTreasuryIds);}catch(_){}
      }
    }});
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
    /* V19.80.19 ACCOUNTING-CONSISTENCY FIX: reverse the journal entries for
       this treasury row + any linked records we just cascaded. Pre-V19.80.19
       delete left orphan journal entries: the treasury row vanished from the
       UI but its JE stayed in `accountingDays`, so Trial Balance, Balance
       Sheet, and Party Ledger overstated cash and AR/AP relative to actual
       data. Edit path (line 1180) does this correctly already; delete was
       missing it.

       Strategy: fire all plausible reversals. autoPost.reverse no-ops if
       no matching JE is found, so over-firing is safe; under-firing leaves
       stale entries. Each call resolves on its own — don't await (UI already
       returned the success toast). */
    if(txCheck && txCheck.date){
      /* Treasury sourceType — for manual entries that journaled via buildTreasuryEntry */
      autoPost.reverse(data,"treasury",txCheck.sourceId||txCheck.id,txCheck.date,"حذف حركة خزنة",userName).catch(()=>{});
      /* HR-linked: salary/advance/weekly_advance journaled via buildHrEntry.
         V21.9.40 FIX: pre-V21.9.40 this fired reverse("hr") — but buildHrEntry
         posts with sourceType=ruleKey ("hrSalary" | "hrAdvance" | "hrBonus"), so
         the reverse was a silent no-op. Now fire all three (idempotent: only the
         matching one finds an entry). */
      if(txCheck.hrLogId){
        autoPost.reverse(data,"hrSalary",txCheck.hrLogId,txCheck.date,"حذف حركة خزنة (HR — مرتب)",userName).catch(()=>{});
        autoPost.reverse(data,"hrAdvance",txCheck.hrLogId,txCheck.date,"حذف حركة خزنة (HR — سلفة)",userName).catch(()=>{});
        autoPost.reverse(data,"hrBonus",txCheck.hrLogId,txCheck.date,"حذف حركة خزنة (HR — مكافأة)",userName).catch(()=>{});
      }
      /* Customer payment journaled via buildCustomerPaymentEntry (sourceType="customerPay") */
      const _custPayLink=(data.custPayments||[]).find(p=>p.treasuryTxId===txCheck.id);
      if(_custPayLink||txCheck.custPaymentId){
        autoPost.reverse(data,"customerPay",txCheck.custPaymentId||_custPayLink?.id,txCheck.date,"حذف حركة خزنة (دفعة عميل)",userName).catch(()=>{});
      }
      /* Workshop payment journaled via buildWorkshopPaymentEntry (sourceType="workshopPay") */
      const _wsPayLink=(data.wsPayments||[]).find(p=>p.treasuryTxId===txCheck.id);
      if(_wsPayLink||txCheck.wsPaymentId){
        autoPost.reverse(data,"workshopPay",txCheck.wsPaymentId||_wsPayLink?.id,txCheck.date,"حذف حركة خزنة (دفعة ورشة)",userName).catch(()=>{});
      }
      /* Transfer legs — autoPost path for transfers writes via treasury sourceType
         (each leg is a treasury entry posted by buildTreasuryEntry); the reversal
         above already covers it. */
      /* V21.9.211: reverse the wallet-commission child's JE too — it was a plain
         treasury "out" auto-posted via buildTreasuryEntry. Found in pre-mutation
         `data` by walletFeeFor===this entry's id. reverse() no-ops if no JE. */
      (data.treasury||[]).forEach(fc=>{
        if(fc&&fc.walletFeeFor===txCheck.id&&fc.date){
          autoPost.reverse(data,"treasury",fc.sourceId||fc.id,fc.date,"حذف عمولة محفظة (تابعة لحركة)",userName).catch(()=>{});
        }
      });
    }
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
      /* V21.10.6: snapshot treasury ids BEFORE delete — used to tombstone every
         id actually removed (parent + wallet-fee children + transfer legs). */
      const _beforeTreasuryIds=new Set((d.treasury||[]).map(t=>String(t&&t.id)));
      const toDelete=(d.treasury||[]).filter(t=>ids.includes(t.id));
      let deletedCount=0,skippedCount=0,totalAmount=0,adminBypassCount=0;
      /* V16.9: Track transferIds to remove (so we delete the transfer record + paired leg only once) */
      const transferIdsToDelete=new Set();
      /* V19.13: tombstones — track treasury IDs being deleted so V19.9 recovery,
         V18.64 fallback in customer statements, and the supplier statement
         orphan-fallback (V19.12) can never re-create these payments. CRITICAL:
         the user's recurring complaint of "حذفت الحركة لسه ظاهرة في كشف الحساب"
         was caused by missing tombstoning here — bulk-delete cleaned treasury +
         custPayments but didn't mark the IDs as deleted, so any orphan-recovery
         cycle (auto in TreasuryPg, or via the manual sync button) could resurrect
         the cust/supplier payment from the still-present treasury entry's metadata. */
      const _custTombstones=[];
      const _supTombstones=[];
      toDelete.forEach(tx=>{
        /* Skip if day is locked and user is not admin */
        if(isDayLocked(tx.date)&&!isAdmin){skippedCount++;return}
        /* Track admin bypass of delete lock */
        if(isAdmin&&lockDelete)adminBypassCount++;
        /* V19.13: capture tombstone for cust/supplier-linked entries.
           Treasury entries with custId/supplierId, OR with sourceType="cust_payment"/
           "supplier_payment" must tombstone — these are the ones recoverable by
           V19.9. Even if cleanup below removes the linked custPayment, the
           treasury entry itself may persist briefly during sync, and recovery
           would re-link it. */
        if(tx.custId||tx.sourceType==="cust_payment"||tx.category==="دفعة عميل"){
          _custTombstones.push(tx.id);
        }
        if(tx.supplierId||tx.sourceType==="supplier_payment"||tx.category==="دفعة مورد"){
          _supTombstones.push(tx.id);
        }
        /* V16.9: If this tx is part of a transfer, mark transferId for full removal */
        if(tx.transferId){
          transferIdsToDelete.add(tx.transferId);
        }else{
          /* V21.9.211: also drop the wallet-commission child (walletFeeFor===tx.id)
             so a bulk-deleted wallet withdrawal doesn't orphan its "عمولة محفظة". */
          d.treasury=(d.treasury||[]).filter(t=>t.id!==tx.id&&t.walletFeeFor!==tx.id);
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
      /* V19.13: persist tombstones (max 200 per type, FIFO) */
      if(_custTombstones.length>0){
        if(!Array.isArray(d._deletedCustPayTreasuryIds))d._deletedCustPayTreasuryIds=[];
        d._deletedCustPayTreasuryIds.push(..._custTombstones);
        d._deletedCustPayTreasuryIds=[...new Set(d._deletedCustPayTreasuryIds)];if(d._deletedCustPayTreasuryIds.length>1000)d._deletedCustPayTreasuryIds=d._deletedCustPayTreasuryIds.slice(-1000);/* V21.9.251: dedup + cap رفعته 200→1000 — الـ FIFO القديم كان ممكن يطرد tombstone لسه محتاجينه فتتبعت حركة محذوفة عمداً */
      }
      if(_supTombstones.length>0){
        if(!Array.isArray(d._deletedSupplierPayTreasuryIds))d._deletedSupplierPayTreasuryIds=[];
        d._deletedSupplierPayTreasuryIds.push(..._supTombstones);
        d._deletedSupplierPayTreasuryIds=[...new Set(d._deletedSupplierPayTreasuryIds)];if(d._deletedSupplierPayTreasuryIds.length>1000)d._deletedSupplierPayTreasuryIds=d._deletedSupplierPayTreasuryIds.slice(-1000);/* V21.9.251: dedup + cap رفعته 200→1000 */
      }
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
      /* V21.10.6 ROOT-FIX (treasury delete resurrection): persisted tombstone.
         Capture EVERY treasury id removed in this op so even if the day-doc
         delete-write loses a server race, the merge/listener layer hides it
         forever (tombstone lives in factory/config → survives refresh) and the
         cleanup pass purges it physically from treasuryDays. */
      const _afterTreasuryIds=new Set((d.treasury||[]).map(t=>String(t&&t.id)));
      const _removedTreasuryIds=[..._beforeTreasuryIds].filter(id=>!_afterTreasuryIds.has(id));
      if(_removedTreasuryIds.length>0){
        if(!Array.isArray(d._deletedTreasuryIds))d._deletedTreasuryIds=[];
        d._deletedTreasuryIds.push(..._removedTreasuryIds);
        d._deletedTreasuryIds=[...new Set(d._deletedTreasuryIds)];
        if(d._deletedTreasuryIds.length>3000)d._deletedTreasuryIds=d._deletedTreasuryIds.slice(-3000);
        try{console.warn("[V21.10.6 treasury-tombstone] bulk-deleted ids tombstoned:",_removedTreasuryIds);}catch(_){}
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
          id:gid(),
          category:"security",
          action:"lock_bypass",
          target:"treasury_delete",
          oldValue:"مقفول من الإعدادات",
          newValue:"حذف "+adminBypassCount+" حركة بواسطة مدير",
          notes:"إجمالي المبالغ: "+fmt0(totalAmount)+" ج.م",
          by:userEmail,
          at:nowISO()
        });
      }
      if(skippedCount>0)showToast("⚠️ "+deletedCount+" حذف • "+skippedCount+" متخطي (أيام مقفولة)");
      else showToast("✓ تم حذف "+deletedCount+" حركة");
    });
    /* V19.80.19: same accounting-consistency reversals as single-delete (line 1389+).
       Iterate the txs we know we're deleting (snapshot via `data` since upConfig is
       async; the txs may already be removed from local state by the time this runs).
       autoPost.reverse no-ops if no matching journal entry exists. */
    const _toReverse=(data.treasury||[]).filter(t=>ids.includes(t.id));
    _toReverse.forEach(tx=>{
      if(!tx||!tx.date)return;
      autoPost.reverse(data,"treasury",tx.sourceId||tx.id,tx.date,"حذف مجمع من اليومية",userName).catch(()=>{});
      if(tx.hrLogId){
        /* V21.9.40 FIX: see delTx — pre-V21.9.40 the "hr" sourceType never matched. */
        autoPost.reverse(data,"hrSalary",tx.hrLogId,tx.date,"حذف مجمع (HR — مرتب)",userName).catch(()=>{});
        autoPost.reverse(data,"hrAdvance",tx.hrLogId,tx.date,"حذف مجمع (HR — سلفة)",userName).catch(()=>{});
        autoPost.reverse(data,"hrBonus",tx.hrLogId,tx.date,"حذف مجمع (HR — مكافأة)",userName).catch(()=>{});
      }
      const _cp=(data.custPayments||[]).find(p=>p.treasuryTxId===tx.id);
      if(_cp||tx.custPaymentId){
        autoPost.reverse(data,"customerPay",tx.custPaymentId||_cp?.id,tx.date,"حذف مجمع (دفعة عميل)",userName).catch(()=>{});
      }
      const _wp=(data.wsPayments||[]).find(p=>p.treasuryTxId===tx.id);
      if(_wp||tx.wsPaymentId){
        autoPost.reverse(data,"workshopPay",tx.wsPaymentId||_wp?.id,tx.date,"حذف مجمع (دفعة ورشة)",userName).catch(()=>{});
      }
      /* V21.9.211: reverse the wallet-commission children of this deleted entry
         (idempotent — if the child is also in the selection it just no-ops). */
      (data.treasury||[]).forEach(fc=>{
        if(fc&&fc.walletFeeFor===tx.id&&fc.date){
          autoPost.reverse(data,"treasury",fc.sourceId||fc.id,fc.date,"حذف مجمع (عمولة محفظة)",userName).catch(()=>{});
        }
      });
    });
    setSelectedTxIds(new Set());
  };
  const editTx=(t)=>{setEditId(t.id);setTxType(t.type);setTxAmount(String(t.amount));setTxDesc(t.desc||"");setTxNotes(t.notes||"");setTxCategory(t.category||"");setTxAccount(t.account||"MAIN CASH");setTxSeason(t.season||"");setTxDate(t.date||today);
    setTxPartyId(t.custId||t.supplierId||t.wsName||"");
    setTxPartyType(t.custId?"customer":t.supplierId?"supplier":t.wsName?"workshop":"");
    /* V19.70.1: load saved payment method from the linked custPayment/supplierPayment.
       If not found, fallback to default. */
    const linkedPay = (t.custId
      ? (data.custPayments||[]).find(p=>p.treasuryTxId===t.id)
      : t.supplierId
        ? (data.supplierPayments||[]).find(p=>p.treasuryTxId===t.id)
        : null);
    setTxMethod(linkedPay?.method || "نقدي كاش");
    setShowForm(true)};
  /* V21.9.205 (e-wallets Phase 3): enforce wallet caps BEFORE saving — warn +
     manager override. Runs as a PRE-FLIGHT wrapper around saveTx (the save
     button calls this instead of saveTx directly), so the critical saveTx
     function itself stays completely untouched. Two caps, both guarded to
     wallet accounts + NEW entries only (editing an existing entry skips it):
       • balance cap → blocks a RECEIVE that would push the balance above the cap
       • monthly cap → blocks a WITHDRAW once this month's withdrawals + the new
                       amount exceed the monthly cap (resets on the 1st)
     A manager/admin gets a confirm to override; anyone else is blocked. */
  const saveTxWithLimits=async()=>{
    if(savingTx)return;
    if(!editId){
      const _w=accountsData.find(a=>a&&typeof a==="object"&&a.type==="wallet"&&a.name===txAccount);
      if(_w){
        const _amt=parseFloat(txAmount)||0;
        const _isMgr=isAdmin||userRole==="manager";
        let _block=null;
        if(_amt>0&&txType==="in"){
          const _cap=Number(walletEffCap(_w,"balanceCap"))||0;
          if(_cap>0){
            const _b=accBalances[_w.name]||{in:0,out:0};const _cur=_b.in-_b.out+walletMonthExtra(_w,"extBalance");/* V21.9.248: + الرصيد الخارجي/الشخصي للشهر */
            if(_cur+_amt>_cap)_block="رصيد المحفظة بعد الاستلام ("+fmt0(_cur+_amt)+" ج.م) هيتعدّى حد الرصيد ("+fmt0(_cap)+" ج.م).";
          }
        }else if(_amt>0&&txType==="out"){
          /* V21.9.223: الحد اليومي الأول (الأقرب للتجاوز)، وبعده الشهري لو اليومي عدّى */
          const _dcap=Number(walletEffCap(_w,"dailyWithdrawCap") ?? 60000)||0;/* V21.9.223: المحافظ القديمة بلا حقل → افتراضي 60 ألف؛ صفر صريح = بلا حد (V21.9.246: + override الشهر) */
          if(_dcap>0){
            const _do=(walletDayOut[_w.name]||0)+walletMonthExtra(_w,"extDay");/* V21.9.248: + السحب الخارجي/الشخصي */
            if(_do+_amt>_dcap)_block="سحب اليوم بعد العملية ("+fmt0(_do+_amt)+" ج.م) هيتعدّى الحد اليومي ("+fmt0(_dcap)+" ج.م). يتجدد بكرة.";
          }
          if(!_block){
            const _mcap=Number(walletEffCap(_w,"monthlyWithdrawCap"))||0;
            if(_mcap>0){
              const _mo=(walletMonthOut[_w.name]||0)+walletMonthExtra(_w,"extMonth");/* V21.9.248: + السحب الشهري الخارجي/الشخصي */
              if(_mo+_amt>_mcap)_block="سحب الشهر بعد العملية ("+fmt0(_mo+_amt)+" ج.م) هيتعدّى الحد الشهري ("+fmt0(_mcap)+" ج.م). يتجدد يوم 1.";
            }
          }
        }
        if(_block){
          if(!_isMgr){playBeep("error");showToast("⛔ "+_block+" — محتاج موافقة مدير");return;}
          const _ok=await ask("⚠️ تجاوز حد المحفظة",_block+"\n\nمتابعة بصلاحية المدير؟",{danger:true});
          if(!_ok)return;
        }
      }
    } else {
      /* V21.9.212 (e-wallets): apply the SAME caps on EDIT. The edited row is
         still in `txns` with its OLD values, so we recompute the wallet's
         projected total EXCLUDING this row (by id) and add the NEW form values —
         robust to account/type/date/amount changes. We warn ONLY when the edit
         actually INCREASES the capped total beyond its pre-edit value, so a
         notes-only edit on a wallet that's already over cap isn't gated. Guarded
         to wallet accounts (cash/bank edits skip). The new-entry path above is
         left UNTOUCHED. Commission is not recomputed here (Stage 2) — the old fee
         child keeps its value and is naturally included in the txns scan. */
      const _w=accountsData.find(a=>a&&typeof a==="object"&&a.type==="wallet"&&a.name===txAccount);
      if(_w){
        const _amt=parseFloat(txAmount)||0;
        const _isMgr=isAdmin||userRole==="manager";
        const _orig=(txns||[]).find(t=>t.id===editId)||null;
        let _block=null;
        if(_amt>0&&txType==="in"){
          const _cap=Number(walletEffCap(_w,"balanceCap"))||0;
          if(_cap>0){
            let _in=0,_out=0;
            (txns||[]).forEach(t=>{if(t.id===editId)return;if((t.account||"")!==_w.name)return;if(t.type==="in")_in+=Number(t.amount)||0;else _out+=Number(t.amount)||0;});
            const _base=_in-_out+walletMonthExtra(_w,"extBalance");/* V21.9.248: + الرصيد الخارجي/الشخصي */
            const _post=_base+_amt;
            const _preEff=(_orig&&(_orig.account||"")===_w.name)?((_orig.type==="in"?1:-1)*(Number(_orig.amount)||0)):0;
            const _pre=_base+_preEff;
            if(_post>_cap&&_post>_pre)_block="رصيد المحفظة بعد التعديل ("+fmt0(_post)+" ج.م) هيتعدّى حد الرصيد ("+fmt0(_cap)+" ج.م).";
          }
        }else if(_amt>0&&txType==="out"){
          /* V21.9.223: الحد اليومي على التعديل (نفس منطق exclude-self + حارس الزيادة) */
          const _dcap=Number(walletEffCap(_w,"dailyWithdrawCap") ?? 60000)||0;/* V21.9.223: المحافظ القديمة بلا حقل → افتراضي 60 ألف؛ صفر صريح = بلا حد (V21.9.246: + override الشهر) */
          if(_dcap>0){
            let _doExcl=walletMonthExtra(_w,"extDay");/* V21.9.248: + السحب الخارجي/الشخصي */
            (txns||[]).forEach(t=>{if(t.id===editId)return;if(t.type==="out"&&(t.account||"")===_w.name&&(t.date||"")===today)_doExcl+=Number(t.amount)||0;});
            const _newC=((txDate||"")===today)?_amt:0;
            const _oldC=(_orig&&_orig.type==="out"&&(_orig.account||"")===_w.name&&(_orig.date||"")===today)?(Number(_orig.amount)||0):0;
            const _post=_doExcl+_newC;const _pre=_doExcl+_oldC;
            if(_post>_dcap&&_post>_pre)_block="سحب اليوم بعد التعديل ("+fmt0(_post)+" ج.م) هيتعدّى الحد اليومي ("+fmt0(_dcap)+" ج.م). يتجدد بكرة.";
          }
          if(!_block){
            const _mcap=Number(walletEffCap(_w,"monthlyWithdrawCap"))||0;
            if(_mcap>0){
              const _mo7=(today||"").slice(0,7);
              let _moExcl=walletMonthExtra(_w,"extMonth");/* V21.9.248: + السحب الشهري الخارجي/الشخصي */
              (txns||[]).forEach(t=>{if(t.id===editId)return;if(t.type==="out"&&(t.account||"")===_w.name&&(t.date||"").slice(0,7)===_mo7)_moExcl+=Number(t.amount)||0;});
              const _newContrib=((txDate||"").slice(0,7)===_mo7)?_amt:0;
              const _oldContrib=(_orig&&_orig.type==="out"&&(_orig.account||"")===_w.name&&(_orig.date||"").slice(0,7)===_mo7)?(Number(_orig.amount)||0):0;
              const _post=_moExcl+_newContrib;
              const _pre=_moExcl+_oldContrib;
              if(_post>_mcap&&_post>_pre)_block="سحب الشهر بعد التعديل ("+fmt0(_post)+" ج.م) هيتعدّى الحد الشهري ("+fmt0(_mcap)+" ج.م). يتجدد يوم 1.";
            }
          }
        }
        if(_block){
          if(!_isMgr){playBeep("error");showToast("⛔ "+_block+" — محتاج موافقة مدير");return;}
          const _ok=await ask("⚠️ تجاوز حد المحفظة",_block+"\n\nمتابعة بصلاحية المدير؟",{danger:true});
          if(!_ok)return;
        }
      }
    }
    saveTx();
  };
  /* V21.9.203 (e-wallets): reset the account form back to defaults. */
  const resetAccForm=()=>{setNewAccName("");setNewAccOwner("");setEditAccId(null);setNewAccType("cash");setNewAccNumber("");setNewAccIcon("📱");setNewAccImage("");setNewAccBalanceCap("200000");setNewAccMonthlyCap("200000");setNewAccDailyCap("60000");setNewAccTiers([])};
  /* V21.9.203: `typeArg` is an EXPLICIT type string ("wallet" | "cash" | "bank").
     The wallet form passes "wallet"; the legacy accounts form calls addAccount
     directly (so typeArg is the click event — ignored, not a string). When
     editing with no explicit type, the existing account's type is PRESERVED
     (so editing a bank/cash account via the legacy form never retypes it).
     Reading the type from a param (not newAccType state) avoids the setState
     async race when a button does setNewAccType(...) right before calling this. */
  const buildWalletFields=()=>({
    type:"wallet",
    walletNumber:newAccNumber.trim(),
    icon:newAccIcon||"📱",
    image:newAccImage||"",
    balanceCap:Math.max(0,Number(newAccBalanceCap)||0),
    monthlyWithdrawCap:Math.max(0,Number(newAccMonthlyCap)||0),
    dailyWithdrawCap:Math.max(0,Number(newAccDailyCap)||0),/* V21.9.223 */
    /* V21.9.206: each tier carries a PERCENTAGE (pct). Normalise + keep
       meaningful tiers only. (Legacy fixed-amount `fee` tiers still compute via
       computeWalletFee's fallback, but new/edited tiers are percentage-based.) */
    tiers:(newAccTiers||[]).map(t=>({
      from:Math.max(0,Number(t.from)||0),
      to:(t.to===""||t.to==null)?null:Math.max(0,Number(t.to)||0),
      pct:Math.max(0,Number(t.pct)||0),
      /* V21.9.215: optional per-tier commission floor/ceiling (0 = unbounded). */
      min:Math.max(0,Number(t.min)||0),
      max:Math.max(0,Number(t.max)||0),
    })).filter(t=>t.pct>0||t.to!=null||t.from>0),
  });
  /* V21.9.206 (e-wallets): commission for `amount` from a wallet's tiers — the
     first bracket where from ≤ amount ≤ to (to=null = open-ended). The bracket's
     `pct` is a PERCENTAGE of the amount (rounded to 2 decimals). Legacy fixed
     `fee` tiers still honoured (fall back to the fixed amount). 0 if none match. */
  const computeWalletFee=(w,amount)=>{
    if(!w||!Array.isArray(w.tiers)||!w.tiers.length)return 0;
    const a=Number(amount)||0;if(a<=0)return 0;
    for(const t of w.tiers){
      if(!t)continue;
      const from=Number(t.from)||0;
      const to=(t.to===""||t.to==null)?Infinity:(Number(t.to)||0);
      if(a>=from&&a<=to){
        if(t.pct!=null&&t.pct!==""){
          /* V21.9.215 (e-wallets): percentage of the amount, then clamp to the
             tier's OPTIONAL min/max commission. 0 (or absent) = no bound, so old
             tiers without min/max behave EXACTLY as before. */
          let fee=a*(Number(t.pct)||0)/100;
          const mn=Math.max(0,Number(t.min)||0);
          const mx=Math.max(0,Number(t.max)||0);
          if(mn>0&&fee<mn)fee=mn;
          if(mx>0&&fee>mx)fee=mx;
          return r2(fee);
        }
        return Math.max(0,Number(t.fee)||0);/* legacy fixed-amount tier */
      }
    }
    return 0;
  };
  /* V21.9.207 (e-wallets): one shared wallet-card renderer (image/icon, name,
     number, balance, balance-cap bar, monthly-withdrawal bar). Used by the
     "محافظ" tab AND each wallet's own account tab — so balance + limits are
     visible right there without switching back to the wallets tab. */
  const walletCard=(w)=>{
    const b=accBalances[w.name]||{in:0,out:0};const bal=b.in-b.out;
    /* V21.9.248: مبالغ خارجية/شخصية للشهر (مش حركات) — بتنضاف للاستهلاك عشان
       الباقي المتاح يبقى صح، وبتتعرض منفصلة كـ«خارجي غير مسجّل». */
    const _extBal=walletMonthExtra(w,"extBalance");const _extDay=walletMonthExtra(w,"extDay");const _extMonth=walletMonthExtra(w,"extMonth");
    const cap=Number(walletEffCap(w,"balanceCap"))||0;const mcap=Number(walletEffCap(w,"monthlyWithdrawCap"))||0;
    const mOut=(walletMonthOut[w.name]||0)+_extMonth;
    const dcap=Number(walletEffCap(w,"dailyWithdrawCap") ?? 60000)||0;const dOut=(walletDayOut[w.name]||0)+_extDay;/* V21.9.223: قديم بلا حقل → 60 ألف */
    const balEff=bal+_extBal;
    const _hasExtra=walletHasMonthExtra(w);
    const balPct=cap>0?Math.min(100,Math.round(balEff/cap*100)):0;
    const wPct=mcap>0?Math.min(100,Math.round(mOut/mcap*100)):0;
    const dPct=dcap>0?Math.min(100,Math.round(dOut/dcap*100)):0;
    const balColor=balPct>=100?T.err:balPct>=80?T.warn:T.ok;
    const wColor=wPct>=100?T.err:wPct>=80?T.warn:T.accent;
    const dColor=dPct>=100?T.err:dPct>=80?T.warn:T.accent;
    return<div key={w.id} style={{padding:14,borderRadius:14,background:T.cardSolid,border:"1px solid "+T.brd,boxShadow:T.shadow}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
        <div style={{width:44,height:44,borderRadius:10,overflow:"hidden",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0,border:"1px solid "+T.brd}}>
          {w.image?<img src={w.image} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:(w.icon||"📱")}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:FS,fontWeight:800,color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{w.name}</div>
          {_hasExtra&&<div style={{fontSize:FS-3,color:T.warn,fontWeight:700,marginTop:1}}>💵 مبالغ خارجية مسجّلة للشهر ده</div>}
          {w.walletNumber&&<div style={{fontSize:FS-2,color:T.textMut,direction:"ltr",textAlign:"right"}}>📞 {w.walletNumber}</div>}
        </div>
        {canEdit&&<div style={{display:"flex",gap:4,flexShrink:0}}>
          <span onClick={()=>{setView("journal");setFilterAcc(w.name)}} style={{cursor:"pointer",padding:"3px 7px",borderRadius:6,fontSize:FS-2,background:T.accent+"10",color:T.accent,border:"1px solid "+T.accent+"30"}} title="كل السجل">📒</span>
          <span onClick={()=>editAccount(w)} style={{cursor:"pointer",padding:"3px 6px",borderRadius:6,fontSize:11,background:T.bg,color:T.textSec,border:"1px solid "+T.brd}} title="تعديل المحفظة">✏️</span>
          {isAdmin&&<span onClick={()=>openMonthLimit(w)} style={{cursor:"pointer",padding:"3px 6px",borderRadius:6,fontSize:11,background:_hasExtra?T.warn+"18":T.bg,color:_hasExtra?T.warn:T.textSec,border:"1px solid "+(_hasExtra?T.warn+"40":T.brd)}} title="مبالغ خارجية/شخصية للشهر (أدمن فقط)">💵</span>}
          {/* V21.9.219: delete wallet — allowed ONLY when it has no transactions
              (same guard as delAccount + the accounts view). Blocks with a clear
              message otherwise. If we're inside this wallet's sub-tab, jump back to
              «الرئيسية» first so the view doesn't dangle on a removed account. */}
          <span onClick={()=>{if(txns.some(t=>t.account===w.name||t.account===w.id)){playBeep("error");showToast("⛔ لا يمكن حذف المحفظة — يوجد حركات مسجّلة عليها");return}openConfirm({title:"حذف المحفظة",message:"هتتحذف محفظة «"+w.name+"» نهائياً — مفيش عليها أي حركات. متأكد؟",variant:"danger",onConfirm:()=>{if(view==="acc_"+w.id)setView("wallets");delAccount(w.id)}})}} style={{cursor:"pointer",padding:"3px 6px",borderRadius:6,fontSize:11,background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30"}} title="حذف المحفظة (متاح فقط لو مفيش حركات عليها)">🗑️</span>
        </div>}
      </div>
      <div style={{fontSize:FS-2,color:T.textMut}}>الرصيد الحالي</div>
      <div style={{fontSize:FS+4,fontWeight:900,color:bal>=0?"#0D9488":T.err,lineHeight:1.1}}>{fmt0(bal)} <span style={{fontSize:FS-2,fontWeight:600,color:T.textMut}}>ج.م</span></div>
      {cap>0&&<div style={{marginTop:8}}>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:FS-3,color:T.textMut,marginBottom:3}}><span>حد الرصيد{_extBal>0?<span style={{color:T.warn}}> · +{fmt0(_extBal)} خارجي</span>:null}</span><span>{fmt0(balEff)} / {fmt0(cap)}</span></div>
        <div style={{height:6,borderRadius:99,background:T.bg,overflow:"hidden"}}><div style={{height:"100%",width:balPct+"%",background:balColor,borderRadius:99,transition:"width 0.2s"}}/></div>
      </div>}
      {dcap>0&&<div style={{marginTop:8}}>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:FS-3,color:T.textMut,marginBottom:3}}><span>سحب اليوم{_extDay>0?<span style={{color:T.warn}}> · +{fmt0(_extDay)} خارجي</span>:null}</span><span>{fmt0(dOut)} / {fmt0(dcap)}</span></div>
        <div style={{height:6,borderRadius:99,background:T.bg,overflow:"hidden"}}><div style={{height:"100%",width:dPct+"%",background:dColor,borderRadius:99,transition:"width 0.2s"}}/></div>
        {dPct>=100&&<div style={{fontSize:FS-3,color:T.err,fontWeight:700,marginTop:3}}>⚠️ وصلت الحد اليومي — يتجدد بكرة</div>}
      </div>}
      {mcap>0&&<div style={{marginTop:8}}>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:FS-3,color:T.textMut,marginBottom:3}}><span>سحب الشهر{_extMonth>0?<span style={{color:T.warn}}> · +{fmt0(_extMonth)} خارجي</span>:null}</span><span>{fmt0(mOut)} / {fmt0(mcap)}</span></div>
        <div style={{height:6,borderRadius:99,background:T.bg,overflow:"hidden"}}><div style={{height:"100%",width:wPct+"%",background:wColor,borderRadius:99,transition:"width 0.2s"}}/></div>
        {wPct>=100&&<div style={{fontSize:FS-3,color:T.err,fontWeight:700,marginTop:3}}>⚠️ وصلت حد السحب الشهري — يتجدد يوم 1</div>}
      </div>}
    </div>;
  };
  const addAccount=(typeArg)=>{if(!newAccName.trim())return;
    const explicit=(typeof typeArg==="string"&&typeArg)?typeArg:null;
    upConfig(d=>{if(!d.treasuryAccounts)d.treasuryAccounts=[];
      /* Migrate old strings */
      d.treasuryAccounts=d.treasuryAccounts.map(a=>typeof a==="string"?{id:a,name:a,ownerEmail:"",type:"cash"}:a);
      if(editAccId){const i=d.treasuryAccounts.findIndex(a=>a.id===editAccId);
        if(i>=0){const prev=d.treasuryAccounts[i];const t=explicit||prev.type||"cash";
          const tf=t==="wallet"?buildWalletFields():{type:t};
          d.treasuryAccounts[i]={...prev,name:newAccName.trim(),ownerEmail:newAccOwner.trim(),...tf}}}
      else{if(!d.treasuryAccounts.find(a=>a.name===newAccName.trim())){const t=explicit||"cash";
        const tf=t==="wallet"?buildWalletFields():{type:t};
        d.treasuryAccounts.push({id:newAccName.trim(),name:newAccName.trim(),ownerEmail:newAccOwner.trim(),...tf})}}});
    resetAccForm();showToast("✓ تمت الإضافة")};
  /* V21.9.248 — per-month wallet EXTERNAL/personal amounts (admin-only). These
     are amounts that flowed through the wallet but aren't factory transactions;
     they ADD to the usage so the remaining headroom is accurate. Pre-fills with
     the CURRENT external amounts; saving writes monthExtra[thisMonth]; clearing
     removes them. Soft-warning side only — zero money/leg impact. */
  const openMonthLimit=(w)=>{
    setMonthLimitW(w);
    setMlDaily(String(walletMonthExtra(w,"extDay")||""));
    setMlMonthly(String(walletMonthExtra(w,"extMonth")||""));
    setMlBalance(String(walletMonthExtra(w,"extBalance")||""));
  };
  const saveMonthLimit=()=>{
    if(!monthLimitW||!isAdmin)return;
    const mk=curMonthKeyCairo();const wid=monthLimitW.id;
    upConfig(d=>{
      if(!Array.isArray(d.treasuryAccounts))return;
      const i=d.treasuryAccounts.findIndex(a=>a&&a.id===wid);
      if(i<0)return;
      if(!d.treasuryAccounts[i].monthExtra)d.treasuryAccounts[i].monthExtra={};
      d.treasuryAccounts[i].monthExtra[mk]={
        extDay:Math.max(0,Number(mlDaily)||0),
        extMonth:Math.max(0,Number(mlMonthly)||0),
        extBalance:Math.max(0,Number(mlBalance)||0),
        by:userName,at:new Date().toISOString(),
      };
    });
    showToast("✅ اتسجّلت المبالغ الخارجية للشهر");setMonthLimitW(null);
  };
  const clearMonthLimit=()=>{
    if(!monthLimitW||!isAdmin)return;
    const mk=curMonthKeyCairo();const wid=monthLimitW.id;
    upConfig(d=>{
      if(!Array.isArray(d.treasuryAccounts))return;
      const i=d.treasuryAccounts.findIndex(a=>a&&a.id===wid);
      if(i<0||!d.treasuryAccounts[i].monthExtra)return;
      delete d.treasuryAccounts[i].monthExtra[mk];
    });
    showToast("↩️ اتمسحت المبالغ الخارجية للشهر");setMonthLimitW(null);
  };
  const editAccount=(a)=>{setEditAccId(a.id);setNewAccName(a.name);setNewAccOwner(a.ownerEmail||"");
    /* V21.9.203: hydrate wallet fields when editing a wallet account. */
    setNewAccType(a.type||"cash");setNewAccNumber(a.walletNumber||"");setNewAccIcon(a.icon||"📱");setNewAccImage(a.image||"");
    setNewAccBalanceCap(String(a.balanceCap!=null?a.balanceCap:200000));setNewAccMonthlyCap(String(a.monthlyWithdrawCap!=null?a.monthlyWithdrawCap:200000));setNewAccDailyCap(String(a.dailyWithdrawCap!=null?a.dailyWithdrawCap:60000));
    setNewAccTiers(Array.isArray(a.tiers)?a.tiers.map(t=>({from:t.from==null?"":String(t.from),to:t.to==null?"":String(t.to),pct:t.pct==null?"":String(t.pct),min:t.min==null?"":String(t.min),max:t.max==null?"":String(t.max)})):[])};
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
    const d_=tfDate||cairoDateStr();
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
        sentBy:userName,sentByEmail:userEmail,sentAt:nowISO(),
        date:d_,toOwnerEmail:toAcc?.ownerEmail||""
      });
      if(isPending){
        /* No treasury entries yet — just an admin notification.
           V18.91: Push a notification compatible with the greeting-bar (V18.87+),
           so all admins see it as a clickable chip with deep-link to transfers view.
           Old `transfer_pending` kept for legacy bell badge counters. */
        d.notifications.unshift({
          id:gid(),type:"transfer_pending",
          msg:"⏳ طلب تحويل جديد بانتظار موافقتك: "+fmt(amt)+" ج.م من "+tfFrom+" → "+tfTo+" • طلبه: "+userName,
          adminOnly:true,transferId:tfId,read:false,by:userName,createdAt:nowISO()
        });
        /* V18.91: Also push a greeting-bar chip notification visible to all admin users.
           toEmail:"all" + custom marker `forAdminsOnly`, filtered in App.jsx. */
        d.notifications.unshift({
          id:gid()+"_gb",
          toEmail:"all",
          toName:"الإدارة",
          msg:"⏳ طلب تحويل: "+fmt(amt)+" ج.م — "+tfFrom+" → "+tfTo,
          type:"مهمة عاجلة",
          fromName:userName,fromEmail:userEmail,
          createdAt:nowISO().split("T")[0],
          createdAtTs:nowISO(),
          expiresAt:null,/* stays until approved/rejected */
          endedAt:null,endedBy:null,/* V19.53: readBy/dismissedBy moved to userNotifStates */
          forAdminsOnly:true,/* V18.91: only admins see this chip */
          transferId:tfId,
          link:{type:"treasury",id:tfId,subType:"transfer_pending",label:"موافقة على التحويل"},
        });
      }else{
        /* Admin: immediate double-entry */
        const _outLeg={id:gid(),type:"out",amount:amt,desc:"تحويل إلى "+tfTo+(tfNote?" — "+tfNote:""),notes:"",category:"تحويل داخلي",account:tfFrom,season:d.activeSeason||"",date:d_,day:dayN,transferId:tfId,by:userName,createdAt:nowISO()};
        const _inLeg={id:gid(),type:"in",amount:amt,desc:"تحويل من "+tfFrom+(tfNote?" — "+tfNote:""),notes:"",category:"تحويل داخلي",account:tfTo,season:d.activeSeason||"",date:d_,day:dayN,transferId:tfId,by:userName,createdAt:nowISO()};
        d.treasury.unshift(_outLeg);
        d.treasury.unshift(_inLeg);
        /* V21.9.14: stash legs on the function for post-upConfig autoPost */
        submitTransfer._lastLegs={out:_outLeg,in:_inLeg};
        if(toAcc?.ownerEmail){d.notifications.unshift({id:gid(),type:"treasury_transfer",msg:"💸 وصلك تحويل "+fmt(amt)+" ج.م من "+tfFrom+(tfNote?" — "+tfNote:""),toEmail:toAcc.ownerEmail,transferId:tfId,read:false,by:userName,createdAt:nowISO()})}
      }
    });
    /* V21.9.14: post the new legs to the journal (admin auto-confirm path).
       Same defensive try/catch pattern as approveTransfer + saveTx. */
    if(!isPending && submitTransfer._lastLegs){
      const {out:_outLeg,in:_inLeg}=submitTransfer._lastLegs;
      submitTransfer._lastLegs=null;
      try{
        const _r1=autoPost.treasury(data,_outLeg,userName);
        if(_r1&&typeof _r1.then==="function") _r1.catch(()=>{});
      }catch(e){console.warn("[V21.9.14] autoPost.treasury (out leg) threw:",e?.message||e);}
      try{
        const _r2=autoPost.treasury(data,_inLeg,userName);
        if(_r2&&typeof _r2.then==="function") _r2.catch(()=>{});
      }catch(e){console.warn("[V21.9.14] autoPost.treasury (in leg) threw:",e?.message||e);}
    }
    setShowTransfer(false);setTfFrom("");setTfTo("");setTfAmount("");setTfNote("");setTfDate("");
    showToast(isPending?"⏳ تم إرسال الطلب — بانتظار موافقة المدير":"✓ تم التحويل — منصرف من "+tfFrom+" ووارد في "+tfTo)};

  /* V21.9.214 (e-wallets): shared wallet-cap evaluator for an internal transfer.
     Returns an Arabic warning string if the transfer would breach a wallet cap,
     else null. Two INDEPENDENT checks (either/both accounts may be wallets):
       • SOURCE wallet → monthly-withdrawal cap (the out leg is a withdrawal).
       • DEST wallet   → balance cap (the in leg raises its balance).
     walletMonthOut already counts existing transfer-out legs, so adding `amt`
     is consistent with how the wallet card displays it. Pure read — no mutation.
     Per Ahmed's decision transfers carry NO commission, so only caps here. */
  const transferCapBlock=(fromName,toName,amt)=>{
    const _a=Number(amt)||0;if(_a<=0)return null;
    const msgs=[];
    const src=accountsData.find(a=>a&&typeof a==="object"&&a.type==="wallet"&&a.name===fromName);
    if(src){
      /* V21.9.223: حد السحب اليومي على المصدر */
      const dcap=Number(walletEffCap(src,"dailyWithdrawCap") ?? 60000)||0;
      if(dcap>0){
        const dOut=(walletDayOut[src.name]||0)+walletMonthExtra(src,"extDay");/* V21.9.248 */
        if(dOut+_a>dcap)msgs.push("• سحب اليوم من «"+fromName+"» بعد التحويل ("+fmt0(dOut+_a)+" ج.م) هيتعدّى الحد اليومي ("+fmt0(dcap)+" ج.م)");
      }
      const mcap=Number(walletEffCap(src,"monthlyWithdrawCap"))||0;
      if(mcap>0){
        const mo=(walletMonthOut[src.name]||0)+walletMonthExtra(src,"extMonth");/* V21.9.248 */
        if(mo+_a>mcap)msgs.push("• سحب الشهر من «"+fromName+"» بعد التحويل ("+fmt0(mo+_a)+" ج.م) هيتعدّى الحد الشهري ("+fmt0(mcap)+" ج.م)");
      }
    }
    const dst=accountsData.find(a=>a&&typeof a==="object"&&a.type==="wallet"&&a.name===toName);
    if(dst){
      const cap=Number(dst.balanceCap)||0;
      if(cap>0){
        const b=accBalances[dst.name]||{in:0,out:0};const cur=b.in-b.out+walletMonthExtra(dst,"extBalance");/* V21.9.248 */
        if(cur+_a>cap)msgs.push("• رصيد «"+toName+"» بعد التحويل ("+fmt0(cur+_a)+" ج.م) هيتعدّى حد الرصيد ("+fmt0(cap)+" ج.م)");
      }
    }
    return msgs.length?msgs.join("\n"):null;
  };
  /* V21.9.214: pre-flight wrapper around submitTransfer (the button calls THIS).
     submitTransfer stays UNTOUCHED. Only the admin-immediate path creates legs on
     submit, so we gate just that: if a cap would be breached, the admin overrides
     via confirm. Non-admin submits create a PENDING request (no legs) → no gate
     here; the cap is enforced when the admin approves (approveTransfer wrapper).
     Invalid input is delegated to submitTransfer's own validation. */
  const submitTransferWithLimits=async()=>{
    const _amt=parseFloat(tfAmount)||0;
    if(isAdmin&&tfFrom&&tfTo&&tfFrom!==tfTo&&_amt>0){
      const _block=transferCapBlock(tfFrom,tfTo,_amt);
      if(_block){
        const _ok=await ask("⚠️ تجاوز حد المحفظة",_block+"\n\nمتابعة بصلاحية المدير؟",{danger:true});
        if(!_ok)return;
      }
    }
    submitTransfer();
  };

  /* V16.13: Admin approves a pending transfer → creates the double-entry.
     V21.9.14: in-flight guard prevents the same approve from firing twice.
     The previous version's idempotency gate (`if(tf.status!=="pending")return`)
     was insufficient because:
     • a stale optimistic state could let the second click see status="pending"
     • the optimistic-state-cleanup bug in App.jsx (_stableMatch missing
       status check) caused the UI to revert to "pending" so user re-clicked
     The guard set ensures only one in-flight approval per tfId — the second
     click is a no-op until the first completes (success or error). */
  const approveTransfer=(tfId)=>{
    if(!isAdmin)return;
    if(inflightTransferRef.current.has(tfId)){
      showToast("⏳ التأكيد جاري — استنى ثانية");
      return;
    }
    inflightTransferRef.current.add(tfId);
    let didMutate=false;
    /* V21.9.14: capture the new legs so we can post them to the journal
       AFTER upConfig commits. autoPost MUST run outside the upConfig fn
       because (a) it's async, (b) it writes to a different collection
       (accountingDays), (c) calling it inside the fn would re-fire on
       every retry of the upConfig transaction.

       V21.9.70 REVERT: removed the V21.9.67 await + V21.9.69 result-promise
       pattern. upConfig is called sync; the mutator runs synchronously so
       didMutate/_outLeg/_inLeg are set immediately. Toast shows instantly.
       autoPost runs fire-and-forget. Trade-off: if upConfig's Firestore write
       fails, accountingDays might have orphan entries — but those are caught
       by audit-orphan-accounting endpoint + accountingPostFailures health pill. */
    let _outLeg=null;
    let _inLeg=null;
    upConfig(d=>{
      const tf=(d.treasuryTransfers||[]).find(t=>t.id===tfId);
      if(!tf||tf.status!=="pending")return;
      didMutate=true;
      const dayN=dayName(tf.date);
      const toAcc=(d.treasuryAccounts||[]).find(a=>(typeof a==="string"?a:a.name)===tf.toAccount);
      tf.status="confirmed";
      tf.approvedBy=userName;tf.approvedByEmail=userEmail;tf.approvedAt=nowISO();
      if(!d.treasury)d.treasury=[];
      /* V21.9.14: idempotency check at the LEDGER level — if for any reason
         (network retry, stale local state) two legs with this transferId+type
         already exist, don't add a third. Defense in depth on top of the
         in-flight guard. */
      const existingLegs=(d.treasury||[]).filter(t=>t.transferId===tf.id);
      const hasOut=existingLegs.some(t=>t.type==="out");
      const hasIn=existingLegs.some(t=>t.type==="in");
      /* V21.9.249 ROOT CAUSE FIX — deterministic leg ids.
         BUG: legs used `id:gid()` (random). The local idempotency check above
         (hasOut/hasIn by transferId) only sees THIS device's local snapshot, and
         the split-collection transactional merge in syncSplitCollection dedups by
         entry `id` ONLY (not by transferId). So when the SAME transfer is confirmed
         twice — from two admin devices at once, or the same device after the 2s
         in-flight guard expires while the Firestore listener round-trip is still
         pending — each confirm minted DIFFERENT gids for the same logical leg →
         the per-day transaction could not collapse them → duplicate out/in legs
         (account balance inflated, V21.9.14 dup-ledger class).
         FIX: derive the id from the transfer id + side. Two confirms now produce
         the SAME id, so the merge replaces in-place instead of appending. This is
         backward-compatible: existing legs (random gids) are untouched; the
         transferId-based check, edit, and delete paths are unaffected; and
         autoPost.treasury (sourceId = leg.id) becomes idempotent on re-confirm too. */
      if(!hasOut){
        _outLeg={id:"tf-"+tf.id+"-out",type:"out",amount:tf.amount,desc:"تحويل إلى "+tf.toAccount+(tf.note?" — "+tf.note:""),notes:"",category:"تحويل داخلي",account:tf.fromAccount,season:d.activeSeason||"",date:tf.date,day:dayN,transferId:tf.id,by:tf.sentBy||userName,createdAt:nowISO()};
        d.treasury.unshift(_outLeg);
      }
      if(!hasIn){
        _inLeg={id:"tf-"+tf.id+"-in",type:"in",amount:tf.amount,desc:"تحويل من "+tf.fromAccount+(tf.note?" — "+tf.note:""),notes:"",category:"تحويل داخلي",account:tf.toAccount,season:d.activeSeason||"",date:tf.date,day:dayN,transferId:tf.id,by:tf.sentBy||userName,createdAt:nowISO()};
        d.treasury.unshift(_inLeg);
      }
      /* Mark pending notif as read; notify requester of approval */
      (d.notifications||[]).forEach(n=>{if(n.transferId===tf.id&&n.type==="transfer_pending")n.read=true});
      /* V18.91: End the greeting-bar chip — `forAdminsOnly` notif is hidden via endedAt */
      (d.notifications||[]).forEach(n=>{if(n.transferId===tf.id&&n.forAdminsOnly){n.endedAt=nowISO();n.endedBy=userEmail}});
      if(!d.notifications)d.notifications=[];
      if(tf.sentByEmail){d.notifications.unshift({id:gid(),type:"transfer_approved",msg:"✅ تمت الموافقة على تحويلك "+fmt(tf.amount)+" ج.م من "+tf.fromAccount+" → "+tf.toAccount,toEmail:tf.sentByEmail,transferId:tf.id,read:false,by:userName,createdAt:nowISO()})}
      if(toAcc&&typeof toAcc==="object"&&toAcc.ownerEmail){d.notifications.unshift({id:gid(),type:"treasury_transfer",msg:"💸 وصلك تحويل "+fmt(tf.amount)+" ج.م من "+tf.fromAccount+(tf.note?" — "+tf.note:""),toEmail:toAcc.ownerEmail,transferId:tf.id,read:false,by:userName,createdAt:nowISO()})}
    });
    /* V21.9.70: instant toast (mutator ran sync inside upConfig). */
    if(didMutate){
      showToast("✅ تم تأكيد التحويل");
    }else{
      showToast("ℹ️ التحويل ده اتأكد من قبل — تحديث الشاشة");
    }
    /* V21.9.14 → V21.9.70: fire-and-forget autoPost for both legs. */
    if(_outLeg){
      try{
        const _r1=autoPost.treasury(data,_outLeg,userName);
        if(_r1&&typeof _r1.then==="function") _r1.catch(()=>{});
      }catch(e){console.warn("[V21.9.14] autoPost.treasury (out leg) threw:",e?.message||e);}
    }
    if(_inLeg){
      try{
        const _r2=autoPost.treasury(data,_inLeg,userName);
        if(_r2&&typeof _r2.then==="function") _r2.catch(()=>{});
      }catch(e){console.warn("[V21.9.14] autoPost.treasury (in leg) threw:",e?.message||e);}
    }
    /* Release the guard after a generous delay so the listener round-trip
       has time to commit before another click is allowed. */
    setTimeout(()=>{inflightTransferRef.current.delete(tfId)},2000);
  };
  /* V21.9.214: pre-flight wrapper around approveTransfer (the ✓ تأكيد confirm
     calls THIS). approveTransfer stays UNTOUCHED. At approve time the legs post
     NOW, so caps are evaluated against CURRENT balances. If a cap is breached the
     admin gets a confirm to override; otherwise it delegates straight through.
     The in-flight guard inside approveTransfer still protects leg creation. */
  const approveTransferWithLimits=async(tfId)=>{
    const tf=transfers.find(t=>t.id===tfId);
    if(tf){
      const _block=transferCapBlock(tf.fromAccount,tf.toAccount,Number(tf.amount)||0);
      if(_block){
        const _ok=await ask("⚠️ تجاوز حد المحفظة",_block+"\n\nمتابعة بصلاحية المدير؟",{danger:true});
        if(!_ok)return;
      }
    }
    approveTransfer(tfId);
  };

  /* V16.13: Admin rejects a pending transfer → deletes the request.
     V21.9.14: same in-flight guard pattern as approve. */
  const rejectTransfer=(tfId)=>{
    if(!isAdmin)return;
    if(inflightTransferRef.current.has(tfId)){
      showToast("⏳ الرفض جاري — استنى ثانية");
      return;
    }
    inflightTransferRef.current.add(tfId);
    let didMutate=false;
    upConfig(d=>{
      const tf=(d.treasuryTransfers||[]).find(t=>t.id===tfId);
      if(!tf||tf.status!=="pending")return;
      didMutate=true;
      d.treasuryTransfers=(d.treasuryTransfers||[]).filter(t=>t.id!==tfId);
      (d.notifications||[]).forEach(n=>{if(n.transferId===tfId&&n.type==="transfer_pending")n.read=true});
      /* V18.91: End the greeting-bar chip — `forAdminsOnly` notif is hidden */
      (d.notifications||[]).forEach(n=>{if(n.transferId===tfId&&n.forAdminsOnly){n.endedAt=nowISO();n.endedBy=userEmail}});
      if(!d.notifications)d.notifications=[];
      if(tf.sentByEmail){d.notifications.unshift({id:gid(),type:"transfer_rejected",msg:"❌ تم رفض طلب التحويل: "+fmt(tf.amount)+" ج.م من "+tf.fromAccount+" → "+tf.toAccount,toEmail:tf.sentByEmail,transferId:tfId,read:false,by:userName,createdAt:nowISO()})}
    });
    setTimeout(()=>{inflightTransferRef.current.delete(tfId)},2000);
    if(didMutate){
      showToast("✓ تم رفض الطلب");
    }
  };
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
      tf.editedAt=nowISO();
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
    const w=openPrintWindow();if(!w){tell("المتصفح يمنع الطباعة","فعّل النوافذ المنبثقة وحاول مرة أخرى",{danger:true});return}
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
    const w=openPrintWindow();if(!w){tell("المتصفح يمنع الطباعة","فعّل النوافذ المنبثقة وحاول مرة أخرى",{danger:true});return}
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
    /* V19.25: Per-transaction details removed from the WhatsApp message at user
       request — message is now totals + per-category breakdowns only. The print
       view (HTML report) still has the full per-transaction details. */
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
      "🏭 CLARK Factory Management"
    ];
    return out.join("\n");
  };

  /* ── State for WhatsApp contact picker popup ── */
  /* Stores {date, account} — account null = all */
  const[waPopupData,setWaPopupData]=useState(null);
  /* V21.9.221 (e-wallets): «أنهي محفظة تستقبل المبلغ ده بأمان؟» — capacity checker.
     null = مقفول؛ {amount:string} = مفتوح. عرض فقط (مبني على حد الرصيد). */
  const[capCheck,setCapCheck]=useState(null);

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

    {/* View Tabs — V18.92: horizontal scroll on mobile to prevent tabs being cut off */}
    <div style={{display:"flex",gap:0,marginBottom:16,borderRadius:10,overflow:isMob?"auto":"hidden",border:"1px solid "+T.brd,WebkitOverflowScrolling:"touch"}}>
      {(()=>{
        /* Dynamic tabs: general journal + one per account + tools */
        const unreadTransferNotifs=notifications.filter(n=>n.toEmail===userEmail&&!n.read&&(n.type==="treasury_transfer"||n.type==="treasury_transfer_confirmed")).length;
        /* V16.13: pending transfers waiting for admin approval */
        const pendingTransferCount=isAdmin?transfers.filter(t=>t.status==="pending").length:0;
        const transferBadge=pendingTransferCount>0?" ⏳"+pendingTransferCount:(unreadTransferNotifs>0?" 🔴"+unreadTransferNotifs:"");
        const baseTabs=[];
        /* Sort accounts: SUB CASH first, then MAIN CASH, then others */
        const sortedAccounts=[...accountsData].sort((a,b)=>{const aS=a.name.toUpperCase().includes("SUB")?0:a.name.toUpperCase().includes("MAIN")?1:2;const bS=b.name.toUpperCase().includes("SUB")?0:b.name.toUpperCase().includes("MAIN")?1:2;return aS-bS});
        /* V21.9.218: wallets NO LONGER get a top-level acc_ tab — they live as
           sub-tabs under the single «محافظ إلكترونية» tab (pushed right after the
           cash/bank account tabs, أي بعد بنك مصر). بيحافظ على الشريط الرئيسي نضيف
           مع زيادة عدد المحافظ. */
        sortedAccounts.filter(a=>a.type!=="wallet").forEach(a=>{
          const icon=a.name.toUpperCase().includes("MAIN")?"🏦":a.name.toUpperCase().includes("SUB")?"💰":"📘";
          baseTabs.push({k:"acc_"+a.id,l:icon+" "+a.name,accName:a.name})
        });
        baseTabs.push({k:"wallets",l:"📱 محافظ إلكترونية"});/* V21.9.203 → V21.9.218: نُقل هنا (بعد البنوك)؛ المحافظ بقت sub-tabs جوّاه */
        baseTabs.push({k:"journal",l:"📒 الكل"});
        baseTabs.push({k:"transfers",l:"🔄 التحويلات"+transferBadge});
        baseTabs.push({k:"checks",l:"📝 الشيكات"});
        baseTabs.push({k:"recurring",l:"🔁 المتكررة"});
        baseTabs.push({k:"reports",l:"📈 تقارير"});
        baseTabs.push({k:"analysis",l:"📊 التحليل"});
        baseTabs.push({k:"accounts",l:"🏦 الحسابات"});
        /* V21.9.218: «محافظ إلكترونية» يفضل مميّز وأنا جوّه أي محفظة (acc_ view لحساب نوعه wallet). */
        const _isWalletAccView=view.startsWith("acc_")&&(accountsData.find(a=>a.id===view.slice(4))?.type==="wallet");
        return baseTabs.map(v=>{
        const _active=view===v.k||(v.k==="wallets"&&_isWalletAccView);
        return <div key={v.k} onClick={()=>{setView(v.k);if(v.accName){setFilterAcc(v.accName);setTxAccount(v.accName)}else if(v.k==="journal")setFilterAcc("الكل")}} style={{flex:isMob?"0 0 auto":1,padding:isMob?"10px 14px":"10px 8px",textAlign:"center",cursor:"pointer",fontWeight:700,fontSize:FS-2,background:_active?T.accent:T.cardSolid,color:_active?"#fff":T.textSec,transition:"all 0.15s",whiteSpace:"nowrap"}}>{v.l}</div>;})
      })()}
    </div>

    {/* V21.9.218: wallet sub-tabs — تظهر بس وأنا في قسم المحافظ. أول تاب = الرئيسية
        (قايمة المحافظ + فورم الإضافة، view="wallets")، وبعده تاب لكل محفظة
        (view="acc_<id>"، بيعيد استخدام rendering الحساب الموجود — صفر تكرار). */}
    {(view==="wallets"||(view.startsWith("acc_")&&accountsData.find(a=>a.id===view.slice(4))?.type==="wallet"))&&(()=>{
      const _wls=accountsData.filter(a=>a.type==="wallet");
      const _subTabs=[{k:"wallets",l:"🏠 الرئيسية"},..._wls.map(w=>({k:"acc_"+w.id,l:(w.icon||"📱")+" "+w.name,accName:w.name}))];
      return<div style={{display:"flex",gap:0,marginBottom:16,borderRadius:10,overflow:isMob?"auto":"hidden",border:"1px solid "+T.accent+"55",background:T.accent+"0D",WebkitOverflowScrolling:"touch"}}>
        {_subTabs.map(s=><div key={s.k} onClick={()=>{setView(s.k);if(s.accName){setFilterAcc(s.accName);setTxAccount(s.accName)}}} style={{flex:isMob?"0 0 auto":1,padding:isMob?"9px 14px":"9px 8px",textAlign:"center",cursor:"pointer",fontWeight:700,fontSize:FS-2,background:view===s.k?T.accent:"transparent",color:view===s.k?"#fff":T.textSec,transition:"all 0.15s",whiteSpace:"nowrap"}}>{s.l}</div>)}
      </div>;
    })()}

    {/* Today mini summary — per-account when viewing specific account.
        V16.19: Hidden on transfers/checks/analysis/accounts — these tabs have
        their own controls and don't need the daily print/PDF/WA toolbar.
        V18.98: Also hidden on recurring (scheduled entries don't relate to today's totals).
        V21.9.217: Also hidden on wallets — the محافظ list (cards + add form) has its own
        per-card controls; the daily date/print/PDF/WA toolbar doesn't apply to it. */}
    {/* V19.70.5: removed the 3 daily-KPI cards (وارد/منصرف/صافي اليوم) — they
        consumed a full row but the same info is in the account summary card below
        for acc views, and on journal view the user picks the date to see daily
        totals via printDaily anyway. The action toolbar (date + print + PDF + WA)
        is collapsed to an inline icon row, and merged into the account summary
        card when view is `acc_`. */}
    {!["transfers","checks","analysis","accounts","recurring","wallets","reports"].includes(view) && !view.startsWith("acc_") && (()=>{
      /* Journal-view-only toolbar (date + actions). For acc_xxx views the toolbar
         lives inside the account summary card to save vertical space. */
      const currentAccName=null;const scopeLabel="الكل";
      return<div style={{display:"flex",gap:8,marginBottom:14,justifyContent:"flex-end",alignItems:"center",flexWrap:"wrap"}}>
        <div style={{padding:"4px 10px",borderRadius:8,background:T.bg,border:"1px solid "+T.brd,display:"flex",alignItems:"center",gap:6}} title="اختر اليوم">
          <span style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>📅</span>
          <input type="date" value={printDate} onChange={e=>setPrintDate(e.target.value||today)} style={{padding:"3px 6px",borderRadius:6,border:"1px solid "+T.brd,fontSize:FS-1,fontFamily:"inherit",background:T.inputBg,color:T.text}}/>
          {printDate!==today&&<span onClick={()=>setPrintDate(today)} style={{cursor:"pointer",fontSize:FS-2,color:T.accent,fontWeight:700}} title="العودة لليوم">↩</span>}
        </div>
        <div onClick={()=>printDaily(printDate,currentAccName)} style={{padding:"6px 12px",borderRadius:8,background:T.accent+"10",border:"1px solid "+T.accent+"30",cursor:"pointer",fontSize:FS,fontWeight:700,color:T.accent}} title={"طباعة "+printDate+" — "+scopeLabel}>🖨️ طباعة</div>
        <div onClick={()=>savePdfDaily(printDate,currentAccName)} style={{padding:"6px 12px",borderRadius:8,background:"#EF444410",border:"1px solid #EF444430",cursor:"pointer",fontSize:FS,fontWeight:700,color:"#EF4444"}} title={"حفظ PDF "+printDate}>📄 PDF</div>
        <div onClick={()=>setWaPopupData({date:printDate,account:currentAccName})} style={{padding:"6px 12px",borderRadius:8,background:"#25D36610",border:"1px solid #25D36630",cursor:"pointer",fontSize:FS,fontWeight:700,color:"#25D366"}} title={"إرسال واتساب "+printDate}>📤 واتساب</div>
      </div>;
    })()}

    {/* ══ JOURNAL VIEW ══ */}
    {(view==="journal"||view.startsWith("acc_"))&&<div>
      {view.startsWith("acc_")&&(()=>{
        const accId=view.slice(4);const acc=accountsData.find(a=>a.id===accId);if(!acc)return null;
        const b=accBalances[acc.name]||{in:0,out:0};const bal=b.in-b.out;
        const currentAccName=acc.name;
        const _w=acc.type==="wallet"?acc:null;
        /* V21.9.210: shared stats + reports toolbar, reused by both the wallet
           2-column layout and the plain cash/bank header. */
        const statsRow=<div style={{display:"flex",gap:18,alignItems:"flex-end",flexWrap:"wrap"}}>
          <div style={{textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textMut,marginBottom:2}}>وارد</div><div style={{fontSize:FS+2,fontWeight:800,color:T.ok,lineHeight:1.1,fontVariantNumeric:"tabular-nums"}}>{fmt0(b.in)}</div></div>
          <div style={{textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textMut,marginBottom:2}}>منصرف</div><div style={{fontSize:FS+2,fontWeight:800,color:T.err,lineHeight:1.1,fontVariantNumeric:"tabular-nums"}}>{fmt0(b.out)}</div></div>
          <div style={{textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textMut,marginBottom:2}}>الرصيد</div><div style={{fontSize:FS+2,fontWeight:900,color:bal>=0?"#0D9488":T.err,lineHeight:1.1,fontVariantNumeric:"tabular-nums"}}>{fmt0(bal)}</div></div>
        </div>;
        const toolbar=<div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
          <div style={{padding:"4px 10px",borderRadius:8,background:T.cardSolid,border:"1px solid "+T.brd,display:"flex",alignItems:"center",gap:6}} title="اختر اليوم">
            <span style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>📅</span>
            <input type="date" value={printDate} onChange={e=>setPrintDate(e.target.value||today)} style={{padding:"3px 6px",borderRadius:6,border:"1px solid "+T.brd,fontSize:FS-1,fontFamily:"inherit",background:T.inputBg,color:T.text}}/>
            {printDate!==today&&<span onClick={()=>setPrintDate(today)} style={{cursor:"pointer",fontSize:FS-2,color:T.accent,fontWeight:700}} title="العودة لليوم">↩</span>}
          </div>
          <div onClick={()=>printDaily(printDate,currentAccName)} style={{padding:"6px 10px",borderRadius:8,background:T.accent+"15",border:"1px solid "+T.accent+"30",cursor:"pointer",fontSize:FS-1,fontWeight:700,color:T.accent}} title={"طباعة "+printDate+" — "+currentAccName}>🖨️ طباعة</div>
          <div onClick={()=>savePdfDaily(printDate,currentAccName)} style={{padding:"6px 10px",borderRadius:8,background:"#EF444415",border:"1px solid #EF444430",cursor:"pointer",fontSize:FS-1,fontWeight:700,color:"#EF4444"}} title={"حفظ PDF "+printDate+" — "+currentAccName}>📄 PDF</div>
          <div onClick={()=>setWaPopupData({date:printDate,account:currentAccName})} style={{padding:"6px 10px",borderRadius:8,background:"#25D36615",border:"1px solid #25D36630",cursor:"pointer",fontSize:FS-1,fontWeight:700,color:"#25D366"}} title={"إرسال واتساب "+printDate+" — "+currentAccName}>📤 واتساب</div>
        </div>;
        /* V21.9.210: WALLET tab → the wallet card takes the first quarter (with
           its cap bars stacked vertically, same as the محافظ tab) and the
           stats + reports sit beside it. Cash/bank keep the single-row header. */
        if(_w){
          return<div style={{display:"flex",gap:14,alignItems:"stretch",flexWrap:"wrap",marginBottom:14}}>
            <div style={{flex:isMob?"1 1 100%":"0 0 26%",minWidth:isMob?"auto":230,maxWidth:isMob?"none":340}}>{walletCard(_w)}</div>
            <div style={{flex:1,minWidth:260,borderRadius:14,background:"linear-gradient(135deg,"+T.accent+"08,"+T.accent+"03)",border:"1px solid "+T.accent+"20",padding:16,display:"flex",flexDirection:"column",justifyContent:"center",gap:18}}>
              {statsRow}
              {toolbar}
            </div>
          </div>;
        }
        return<Card style={{marginBottom:14,background:"linear-gradient(135deg,"+T.accent+"08,"+T.accent+"03)",border:"1px solid "+T.accent+"20"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
            <div>
              <div style={{fontSize:FS+2,fontWeight:800,color:T.accent}}>{acc.name.toUpperCase().includes("MAIN")?"🏦 ":acc.name.toUpperCase().includes("SUB")?"💰 ":"📘 "}{acc.name}</div>
              {acc.ownerEmail&&<div style={{fontSize:FS-2,color:T.textMut,marginTop:2}}>👤 المسؤول: {acc.ownerEmail}</div>}
            </div>
            {statsRow}
            {toolbar}
          </div>
        </Card>})()}
      {canEdit&&<div style={{marginBottom:14,display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        <Btn primary onClick={()=>{
          setEditId(null);
          /* V18.52: Honor sticky mode when re-opening — preserve category + type */
          if(stickyMode && !showForm){
            setTxType(stickyMode.type);
            setTxCategory(stickyMode.category);
            /* Restore party type derived from category */
            if(stickyMode.category==="دفعة عميل")setTxPartyType("customer");
            else if(stickyMode.category==="دفعة مورد")setTxPartyType("supplier");
            else if(stickyMode.category==="تشغيل خارجي")setTxPartyType("workshop");
            else if(stickyMode.category==="مرتبات")setTxPartyType("employee");
            else setTxPartyType("");
          } else {
            setTxType("out");
            setTxCategory("");
            setTxPartyType("");
          }
          setTxAmount("");setTxDesc("");setTxNotes("");setTxAccount(view.startsWith("acc_")?(accountsData.find(a=>a.id===view.slice(4))?.name||"SUB CASH"):"SUB CASH");setTxSeason(data.activeSeason||"");setTxDate(stickyDate||today);setTxPartyId("");setShowForm(!showForm)
        }}>{showForm?"✕ إغلاق":"+ حركة جديدة"}</Btn>
        {accountsData.length>=2&&<Btn onClick={()=>{setTfDate(cairoDateStr());setShowTransfer(true)}} style={{background:"#8B5CF615",color:"#8B5CF6",border:"1px solid #8B5CF640",fontWeight:700}}>🔄 تحويل بين الخزن</Btn>}
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
          return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={closePopup}>
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
          return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={closePopup}>
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

      {showForm&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={()=>{setShowForm(false);setEditId(null)}}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:600,maxHeight:"85vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div style={{fontSize:FS+2,fontWeight:800,color:T.accent}}>{editId?"✏️ تعديل حركة":"+ حركة جديدة"}</div>
            <Btn ghost small onClick={()=>{setShowForm(false);setEditId(null)}}>✕</Btn>
          </div>
          {/* V18.52: Sticky mode banner */}
          {stickyMode && !editId && <div style={{padding:"10px 14px",borderRadius:10,background:T.accent+"08",border:"2px solid "+T.accent+"40",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
            <div style={{fontSize:FS-1,fontWeight:700,color:T.accent}}>
              📌 وضع التكرار: متبقي <b style={{fontSize:FS+2}}>{stickyMode.count}</b> حركة من فئة <b>"{stickyMode.category}"</b> ({stickyMode.type==="in"?"وارد":"منصرف"})
            </div>
            <span onClick={()=>{setStickyMode(null);showToast("✓ تم إيقاف التكرار")}} style={{cursor:"pointer",fontSize:FS-2,color:T.warn,padding:"4px 10px",borderRadius:6,background:T.warn+"15",border:"1px solid "+T.warn+"40",fontWeight:700}}>⏸ إيقاف</span>
          </div>}
          {/* V18.53: Sticky date banner */}
          {stickyDate && !editId && <div style={{padding:"8px 14px",borderRadius:10,background:"#8B5CF608",border:"2px solid #8B5CF640",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
            <div style={{fontSize:FS-1,fontWeight:700,color:"#8B5CF6"}}>
              📅 التاريخ مثبّت على <b style={{fontFamily:"monospace",fontSize:FS}}>{stickyDate}</b> — كل الحركات الجاية هتاخد نفس التاريخ
            </div>
            <span onClick={()=>{setStickyDate(null);showToast("✓ تم إلغاء تثبيت التاريخ")}} style={{cursor:"pointer",fontSize:FS-2,color:T.warn,padding:"4px 10px",borderRadius:6,background:T.warn+"15",border:"1px solid "+T.warn+"40",fontWeight:700}}>إلغاء</span>
          </div>}
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:12}}>
          <div style={{gridColumn:isMob?"1":"1 / -1"}}><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>النوع</label><div style={{display:"flex",gap:6,marginTop:4}}>
            <div onClick={()=>setTxType("in")} style={{flex:1,padding:"12px 0",borderRadius:10,textAlign:"center",cursor:"pointer",fontWeight:700,fontSize:FS,background:txType==="in"?T.ok+"15":"transparent",border:"2px solid "+(txType==="in"?T.ok:T.brd),color:txType==="in"?T.ok:T.textSec}}>↓ وارد</div>
            <div onClick={()=>setTxType("out")} style={{flex:1,padding:"12px 0",borderRadius:10,textAlign:"center",cursor:"pointer",fontWeight:700,fontSize:FS,background:txType==="out"?T.err+"15":"transparent",border:"2px solid "+(txType==="out"?T.err:T.brd),color:txType==="out"?T.err:T.textSec}}>↑ منصرف</div>
          </div></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>المبلغ</label><Inp type="number" value={txAmount} onChange={setTxAmount} placeholder="0.00"/></div>
          {/* V21.9.204: wallet commission preview — only on a withdrawal (out) from a
              wallet whose tiers yield a fee. Transparent heads-up before saving; the
              actual deduction happens in saveTx as a separate "عمولة محفظة" entry. */}
          {(()=>{const _w=accountsData.find(a=>a&&a.type==="wallet"&&a.name===txAccount);if(!_w||txType!=="out")return null;/* V21.9.213: editing the commission row itself never regenerates a commission (saveTx guard) — hide the preview there */if(editId){const _o=(txns||[]).find(t=>t.id===editId);if(_o&&_o.walletFeeFor)return null;}const _fee=computeWalletFee(_w,parseFloat(txAmount));if(!(_fee>0))return null;return<div style={{gridColumn:"1 / -1",fontSize:FS-2,color:T.warn,fontWeight:700,padding:"7px 10px",borderRadius:8,background:T.warn+"10",border:"1px solid "+T.warn+"30"}}>🏷️ عمولة المحفظة: <b>{fmt0(_fee)} ج.م</b> — {editId?"هتتحدّث تلقائياً عند حفظ التعديل":"هتتخصم تلقائياً كحركة منفصلة عند الحفظ"}</div>;})()}
          <div style={{gridColumn:"1 / -1"}}><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <span>نوع الحركة</span>
            {/* V18.52: Sticky mode toggle — repeats this category for N entries */}
            {!stickyMode && txCategory && <span onClick={async()=>{
              const inputStr=prompt("كم حركة جاية تريد تكرار فئة \""+txCategory+"\" فيها؟",  "5");
              const n=parseInt(inputStr,10);
              if(!isNaN(n)&&n>1){
                setStickyMode({category:txCategory, type:txType, count:n, total:n});
                showToast("📌 تم تفعيل التكرار: "+n+" حركة جاية بفئة "+txCategory);
              }
            }} style={{cursor:"pointer",fontSize:FS-3,color:T.accent,padding:"2px 8px",borderRadius:6,background:T.accent+"08",border:"1px solid "+T.accent+"30",fontWeight:700}} title="تفعيل وضع التكرار للحركات الجاية بنفس الفئة">🔁 تكرار</span>}
            {stickyMode && <span onClick={()=>{
              setStickyMode(null);
              showToast("✓ تم إيقاف التكرار");
            }} style={{cursor:"pointer",fontSize:FS-3,color:T.warn,padding:"2px 8px",borderRadius:6,background:T.warn+"15",border:"1px solid "+T.warn+"40",fontWeight:700}} title="إيقاف وضع التكرار">⏸ إيقاف ({stickyMode.count})</span>}
          </label>
          <SearchSel
            value={txCategory}
            onChange={v=>{setTxCategory(v);setTxPartyId("");setTxPartyType("");setPartySearch("");
              if(v==="دفعة عميل")setTxPartyType("customer");
              else if(v==="دفعة مورد")setTxPartyType("supplier");
              else if(v==="تشغيل خارجي")setTxPartyType("workshop");
              else if(v==="مرتبات")setTxPartyType("employee");
              /* V21.9.220: «دفعة عميل» من محفظة إلكترونية → اضبط طريقة الدفع تلقائياً
                 على «تحويل محفظة الكترونية» عشان رسالة الواتساب للعميل تطلع صح.
                 بيتطبّق على اختيار الفئة ده فقط؛ المستخدم يقدر يغيّرها بعدين. */
              if(v==="دفعة عميل"&&accountsData.find(a=>a&&typeof a==="object"&&a.name===txAccount&&a.type==="wallet"))setTxMethod("تحويل محفظة الكترونية");
            }}
            options={(txType==="in"?resolvedInCats:resolvedOutCats).map(c=>({value:c,label:c}))}
            maxResults={30}
            showAllOnFocus={true}
            placeholder="اكتب أو اختر..."/>
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
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>حساب جاري</label><Sel value={txAccount} onChange={v=>{setTxAccount(v);/* V21.9.220: لو حوّلت الحساب لمحفظة والفئة «دفعة عميل» → اضبط طريقة الدفع تلقائياً على تحويل محفظة (نفس منطق onChange الفئة، يغطّي الترتيب العكسي) */if(txCategory==="دفعة عميل"&&accountsData.find(a=>a&&typeof a==="object"&&a.name===v&&a.type==="wallet"))setTxMethod("تحويل محفظة الكترونية")}}>{accounts.map(a=><option key={a} value={a}>{a}</option>)}</Sel></div>
          {/* V19.70.1: payment method dropdown — visible only for cust/supplier payments.
              Saved into custPayments[].method / supplierPayments[].method, displayed
              in event-trigger messages via the {method} variable. */}
          {((txType==="in"&&txCategory==="دفعة عميل")||(txType==="out"&&txCategory==="دفعة مورد"))&&
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>طريقة الدفع</label>
            <Sel value={txMethod} onChange={setTxMethod}>
              <option value="نقدي كاش">💵 نقدي كاش</option>
              <option value="تحويل محفظة الكترونية">📱 تحويل محفظة الكترونية</option>
              <option value="تحويل انستاباي">🔄 تحويل انستاباي</option>
              <option value="تحويل بنكي">🏦 تحويل بنكي</option>
            </Sel>
          </div>}
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>بيان</label><Inp value={txDesc} onChange={setTxDesc} placeholder="وصف الحركة"/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>ملاحظات</label><Inp value={txNotes} onChange={setTxNotes} placeholder="ملاحظات إضافية"/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <span>التاريخ</span>
            {/* V18.53: Sticky date toggle for back-entry of historical transactions */}
            {!stickyDate && txDate && txDate!==today && <span onClick={()=>{
              setStickyDate(txDate);
              showToast("📅 تم تثبيت التاريخ على "+txDate);
            }} style={{cursor:"pointer",fontSize:FS-3,color:T.accent,padding:"2px 8px",borderRadius:6,background:T.accent+"08",border:"1px solid "+T.accent+"30",fontWeight:700}} title="تثبيت التاريخ للحركات الجاية">📌 تثبيت</span>}
            {stickyDate && <span onClick={()=>{
              setStickyDate(null);
              showToast("✓ تم إلغاء تثبيت التاريخ");
            }} style={{cursor:"pointer",fontSize:FS-3,color:T.warn,padding:"2px 8px",borderRadius:6,background:T.warn+"15",border:"1px solid "+T.warn+"40",fontWeight:700}} title="إلغاء تثبيت التاريخ">📅 مثبّت ✕</span>}
          </label><Inp type="date" value={txDate} onChange={setTxDate}/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>الموسم</label><Inp value={txSeason} onChange={setTxSeason} placeholder={data.activeSeason||"W26"}/></div>
        </div>
        {/* V21.9.127: Attachments — only on existing tx (editId). */}
        {editId && (
          <div style={{marginTop: 14}}>
            <AttachmentList
              entityType="treasury"
              entityId={editId}
              user={user}
              canEdit={canEdit}
              label="مرفقات (إيصال، صورة، PDF)"
              compact
            />
          </div>
        )}
        <div style={{marginTop:16,display:"flex",gap:8,justifyContent:"flex-end"}}><Btn ghost onClick={()=>{if(savingTx)return;setShowForm(false);setEditId(null)}}>إلغاء</Btn><Btn primary disabled={savingTx} onClick={saveTxWithLimits} style={savingTx?{opacity:0.55,cursor:"wait",pointerEvents:"none"}:undefined}>{savingTx?"⏳ جاري الحفظ...":(editId?"💾 حفظ التعديل":"💾 حفظ")}</Btn></div>
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
          {/* V19.18: من تاريخ — إلى تاريخ. لو تم تحديدهم، بيشتغلوا فوق الفلاتر التانية. */}
          <div style={{display:"flex",gap:6,paddingInlineStart:8,marginInlineStart:4,borderInlineStart:"1px dashed "+T.brd}}>
            <div><div style={{fontSize:FS-3,color:T.accent,fontWeight:700,marginBottom:2}}>من تاريخ</div><Inp type="date" value={filterFrom} onChange={setFilterFrom} style={{width:130,borderColor:filterFrom?T.accent:undefined}}/></div>
            <div><div style={{fontSize:FS-3,color:T.accent,fontWeight:700,marginBottom:2}}>إلى تاريخ</div><Inp type="date" value={filterTo} onChange={setFilterTo} style={{width:130,borderColor:filterTo?T.accent:undefined}}/></div>
            {(filterFrom||filterTo)&&<Btn small ghost onClick={()=>{setFilterFrom("");setFilterTo("")}} style={{marginBottom:2}} title="مسح المدى">✕</Btn>}
          </div>
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
            if(filterFrom||filterTo)parts.push("المدى: "+(filterFrom||"البداية")+" ← "+(filterTo||"اليوم"));
            if(filterSearch.trim())parts.push("بحث: "+filterSearch.trim());
            const summary=parts.length>0?parts.join(" • "):"كل الحركات";
            /* Special case: single day with no other filters → use richer daily report (has opening/closing balance) */
            if(filterDay&&parts.length===1){printDaily(filterDay,filterAcc&&filterAcc!=="الكل"?filterAcc:null);return}
            printFiltered(filtered,summary);
          }} style={{cursor:"pointer",padding:"6px 12px",borderRadius:8,background:T.accent+"10",color:T.accent,fontWeight:700,fontSize:FS-1,marginBottom:2,border:"1px solid "+T.accent+"30"}} title="طباعة الحركات المعروضة دلوقتي بالفلاتر المفعّلة">🖨 طباعة المعروض</span>

          {/* V16.20: compact filtered totals — inline with filters, only shown when any filter is active */}
          {(()=>{
            const filterActive=filterType!=="الكل"||filterCat!=="الكل"||filterAcc!=="الكل"||filterMonth||filterDay||filterFrom||filterTo||filterSearchDeb;
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
          {/* V19.13: hint banner — make the checkbox-based deletion flow obvious.
              The per-row × delete icon was removed; users initially looked for it
              and didn't realize bulk-delete was the only path. This banner shows
              ONLY when nothing is selected, then disappears once selection starts. */}
          {canEdit&&selectedTxIds.size===0&&<div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",marginBottom:10,borderRadius:8,background:T.accent+"08",border:"1px dashed "+T.accent+"30",fontSize:FS-2,color:T.textSec}}>
            <span style={{fontSize:14}}>💡</span>
            <span>للحذف: اختر الحركات بالمربع الجانبي ☑️ ثم اضغط <b style={{color:T.err}}>"حذف المحدد"</b>. الحذف من هنا بيشيل الحركة من الخزنة + كشف العميل/المورد + المحاسبة معاً.</span>
          </div>}
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
          {["الرصيد","تاريخ","اليوم","وارد","منصرف","نوع الحركة","بيان","دفتر اليومية","موسم","بواسطة",""].map(h=><th key={h} style={{padding:"7px 8px",textAlign:"right",fontSize:FS-2,color:T.textSec,borderBottom:"2px solid "+T.brd,fontWeight:700,whiteSpace:"nowrap"}}>{h}</th>)}
        </tr></thead><tbody>
          {withBalance.slice(0,limit).map((t,_ri)=>{const locked=isDayLocked(t.date);const isEd=inlineEdit===t.id;const d_=inlineDraft;
            const inpS={padding:"3px 6px",borderRadius:6,border:"1px solid "+T.accent+"40",fontSize:FS-2,fontFamily:"inherit",background:T.inputBg,color:T.text};
            const startEdit=()=>{setInlineEdit(t.id);setInlineDraft({type:t.type,amount:String(t.amount||""),desc:t.desc||"",notes:t.notes||"",category:t.category||"",date:t.date||"",account:t.account||""})};
            const saveInline=()=>{upConfig(cfg=>{const tx=(cfg.treasury||[]).find(x=>x.id===t.id);if(tx){
              const newAmt=parseFloat(d_.amount)||tx.amount;
              const newDate=d_.date||tx.date;
              const newNotes=d_.notes;
              tx.type=d_.type||tx.type;tx.amount=newAmt;tx.desc=d_.desc;tx.notes=newNotes;tx.category=d_.category;tx.date=newDate;tx.account=d_.account||tx.account;tx.day=dayName(newDate);tx.updatedBy=userName;tx.updatedAt=nowISO();
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
            return<tr key={t.id} style={{borderBottom:"1px solid "+T.brd,opacity:locked?0.8:1,background:isChecked?T.err+"06":isEd?T.accent+"06":locked?T.bg:(_ri%2?T.textMut+"12":"")}}>
            {canEdit&&<td style={{padding:"6px 8px",textAlign:"center"}}>
              <input type="checkbox" checked={isChecked} onChange={()=>toggleTxSel(t.id)} style={{cursor:"pointer",width:16,height:16}} title="تحديد للحذف المجمع"/>
            </td>}
            <td style={{padding:"6px 8px",fontSize:FS-1,fontWeight:800,color:t.runBal>=0?"#0D9488":T.err,whiteSpace:"nowrap"}}>{fmt0(t.runBal)}</td>
            <td style={{padding:"6px 8px",fontSize:FS-1,whiteSpace:"nowrap"}}>{isEd?<input type="date" value={d_.date} onChange={e=>setInlineDraft(p=>({...p,date:e.target.value}))} style={{...inpS,width:120}}/>:<>{t.date}{t.createdAt&&<span style={{marginRight:4,fontSize:FS-3,color:T.textMut,fontWeight:600,direction:"ltr",display:"inline-block"}}>{formatTxTime(t.createdAt)}</span>}{locked?" 🔒":""}</>}</td>
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
                {/* V19.13: ✕ delete icon REMOVED — users requested checkbox-based deletion only.
                    The per-row × button was easy to mis-tap on mobile, and the bulk-delete button
                    above the table now handles single + multiple deletions consistently with
                    proper tombstoning to prevent ghost re-appearance. */}
              </div>})()}</td>
          </tr>})}
        </tbody></table></div>:<div style={{textAlign:"center",padding:30,color:T.textMut}}>لا توجد حركات</div>}
        {withBalance.length>limit&&<div style={{textAlign:"center",marginTop:10}}><Btn small onClick={()=>setLimit(p=>p+50)}>عرض المزيد</Btn></div>}
      </Card>
    </div>}

    {/* ══ TRANSFERS VIEW ══
        V21.9.17: per user request, this view is now READ-ONLY for confirmed
        transfers.
        • Removed "+ تحويل جديد" button — transfers are created from inside
          the main treasury movements (the form there has a "تحويل" option).
        • Removed per-row "تعديل" / "حذف" buttons on confirmed transfers —
          edits/deletes flow through the main treasury entries (each transfer
          has two linked treasury rows; editing either side keeps the books
          balanced).
        • Kept the approve / reject buttons for PENDING transfers since
          that's a workflow action, not an edit.
        • Tighter row layout (padding 8px instead of 14px, smaller fonts,
          single-line per row when possible) for a more professional density. */}
    {view==="transfers"&&<div>
      {transfers.length===0?<Card><div style={{textAlign:"center",padding:40,color:T.textMut,fontSize:FS-1,lineHeight:1.7}}>لا يوجد تحويلات بعد<br/><span style={{fontSize:FS-3,color:T.textMut}}>التحويلات بـ تتعمل من حركات الخزنة (اختار نوع 'تحويل')</span></div></Card>
      :<Card title={"🔄 سجل التحويلات ("+transfers.length+") — للقراءة فقط"} extra={<span style={{fontSize:FS-3,color:T.textMut,fontWeight:600}}>للتعديل: من حركات الخزنة</span>}>
        {(()=>{
          /* V16.13: pending first, then confirmed — both sorted newest-first within group */
          const pending=transfers.filter(t=>t.status==="pending");
          const confirmed=transfers.filter(t=>t.status!=="pending");
          const ordered=[...pending,...confirmed];
          return<div style={{display:"flex",flexDirection:"column",gap:6}}>
          {pending.length>0&&isAdmin&&<div style={{padding:"6px 10px",borderRadius:6,background:"#F59E0B15",border:"1px solid #F59E0B40",fontSize:FS-2,color:"#92400E",fontWeight:700,marginBottom:2}}>⏳ {pending.length} طلب{pending.length>1?"ات":""} تحويل بانتظار موافقتك</div>}
          {ordered.map(tf=>{
            const isPending=tf.status==="pending";
            const borderColor=isPending?"#F59E0B":T.brd;
            const bgColor=isPending?"#FEF3C7":T.cardSolid;
            return<div key={tf.id} id={"transfer-row-"+tf.id} style={{padding:"8px 12px",borderRadius:8,border:"1px solid "+borderColor,background:bgColor,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
              {/* Amount — leftmost in RTL (visually prominent) */}
              <span style={{fontSize:FS+1,fontWeight:800,color:isPending?"#92400E":"#8B5CF6",minWidth:80,fontVariantNumeric:"tabular-nums"}}>{fmt(tf.amount)}</span>
              {/* From → To */}
              <div style={{display:"flex",alignItems:"center",gap:6,minWidth:0,flex:1}}>
                {isPending&&<span style={{fontSize:FS-3,fontWeight:800,color:"#92400E",padding:"1px 6px",borderRadius:4,background:"#F59E0B25",border:"1px solid #F59E0B"}}>⏳</span>}
                <span style={{fontSize:FS-1,fontWeight:700,color:T.err,whiteSpace:"nowrap"}}>{tf.fromAccount}</span>
                <span style={{fontSize:14,color:"#8B5CF6"}}>→</span>
                <span style={{fontSize:FS-1,fontWeight:700,color:T.ok,whiteSpace:"nowrap"}}>{tf.toAccount}</span>
                {tf.note&&<span style={{fontSize:FS-3,color:T.textMut,marginInlineStart:6,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>• {tf.note}</span>}
              </div>
              {/* Meta — date + actor */}
              <div style={{fontSize:FS-3,color:T.textMut,whiteSpace:"nowrap",fontVariantNumeric:"tabular-nums"}}>
                {tf.date}{tf.sentBy?" · "+tf.sentBy:""}{tf.approvedBy?" · ✓ "+tf.approvedBy:""}
              </div>
              {/* Pending actions only (approve/reject) — confirmed transfers are read-only here */}
              {isPending&&isAdmin&&<div style={{display:"flex",gap:4}}>
                <span onClick={()=>openConfirm({title:"تأكيد التحويل",message:"سيتم تسجيل منصرف من "+tf.fromAccount+" ووارد على "+tf.toAccount+"\nالمبلغ: "+fmt(tf.amount)+" ج.م",variant:"success",onConfirm:()=>approveTransferWithLimits(tf.id)})} style={{cursor:"pointer",fontSize:FS-3,color:"#fff",padding:"3px 8px",borderRadius:5,background:T.ok,fontWeight:700,whiteSpace:"nowrap"}}>✓ تأكيد</span>
                <span onClick={()=>openConfirm({title:"رفض الطلب",message:"سيتم حذف طلب التحويل نهائياً.\nمن "+tf.fromAccount+" إلى "+tf.toAccount+"\nالمبلغ: "+fmt(tf.amount)+" ج.م",variant:"danger",onConfirm:()=>rejectTransfer(tf.id)})} style={{cursor:"pointer",fontSize:FS-3,color:"#fff",padding:"3px 8px",borderRadius:5,background:T.err,fontWeight:700,whiteSpace:"nowrap"}}>✗ رفض</span>
              </div>}
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
          /* V19.70.5: pre-generate all check IDs for instant trigger fire after upConfig.
             Only triggers for: NEW (not edit) + receivable + category=دفعة عميل + linked customer.
             Each check fires as a SEPARATE message with batchInfo "(شيك X من Y)" when batched. */
          const _instantCheck_eligible = !chkEditId && chkType === "receivable" && (chkCategory||"دفعة عميل") === "دفعة عميل" && chkPartyId;
          const _instantCheck_count = _instantCheck_eligible
            ? (chkBatchEnabled ? Math.max(1, Math.min(60, Number(chkBatchCount)||1)) : 1) : 0;
          const _instantCheck_ids = _instantCheck_eligible
            ? Array.from({length: _instantCheck_count}, () => gid()) : [];
          const _instantCheck_customer = _instantCheck_eligible
            ? customers.find(x => x.id === chkPartyId) : null;
          /* V19.70.10: same pre-gen for payable check (checkPaymentIssued event) */
          const _instantIssuedCheck_eligible = !chkEditId && chkType === "payable" && (chkCategory||"دفعة مورد") === "دفعة مورد" && chkPartyId;
          const _instantIssuedCheck_count = _instantIssuedCheck_eligible
            ? (chkBatchEnabled ? Math.max(1, Math.min(60, Number(chkBatchCount)||1)) : 1) : 0;
          const _instantIssuedCheck_ids = _instantIssuedCheck_eligible
            ? Array.from({length: _instantIssuedCheck_count}, () => gid()) : [];
          const _instantIssuedCheck_supplier = _instantIssuedCheck_eligible
            ? suppliers.find(x => x.id === chkPartyId) : null;
          upConfig(d=>{if(!d.checks)d.checks=[];
            if(chkEditId){const ch=d.checks.find(c=>c.id===chkEditId);if(ch){ch.type=chkType;ch.amount=amt;ch.party=chkParty;ch.partyId=chkPartyId||null;ch.bank=chkBank;ch.checkNo=chkNumber;ch.date=chkDate;ch.dueDate=chkDueDate;ch.notes=chkNotes;ch.category=chkCategory||"";
              /* V19.70.18: persist drawerName (receivable only — payable doesn't have a separate drawer) */
              if(chkType==="receivable") ch.drawerName=String(chkDrawerName||"").trim()||null;
              ch.updatedBy=userName}}
            else{
              /* V16.35: Batch mode — generate N checks. Otherwise just one. */
              const count=chkBatchEnabled?Math.max(1,Math.min(60,Number(chkBatchCount)||1)):1;
              const step=Math.max(0,Number(chkBatchMonthsStep)||0);
              /* Generate a shared batch id so the user can identify them later if needed */
              const batchId=count>1?gid():null;
              for(let i=0;i<count;i++){
                d.checks.push({
                  /* V19.70.5/.10: use pre-gen IDs if instant trigger eligible (receivable OR payable)
                     so client + cron match on idempotencyKey `checkPay:${id}`. */
                  id: (_instantCheck_eligible && _instantCheck_ids[i])
                    || (_instantIssuedCheck_eligible && _instantIssuedCheck_ids[i])
                    || gid(),
                  type:chkType,amount:amt,party:chkParty.trim(),partyId:chkPartyId||null,
                  bank:chkBank,
                  checkNo:bumpCheckNo(chkNumber,i),
                  date:chkDate||today,
                  dueDate:chkDueDate?addMonths(chkDueDate,i*step):"",
                  notes:chkNotes,category:chkCategory||"",status:"معلق",
                  /* V19.70.18: drawerName for receivable checks (the name on the check
                     itself, distinct from the party we received it from). Defaults to
                     the party name if user left it blank. Null for payable (we ARE the drawer). */
                  drawerName: chkType==="receivable" ? (String(chkDrawerName||"").trim() || chkParty.trim() || null) : null,
                  batchId,batchIdx:batchId?i+1:null,batchTotal:batchId?count:null,
                  by:userName,createdAt:nowISO()
                });
              }
            }
          });
          /* V19.70.5: instant checkPaymentReceived fire (one message per check)
             V19.70.8 FIX: progressive balance for batch checks — each check's
             message shows the customer's balance AFTER that check is applied,
             so a batch of 3 × 1000 reduces the balance by 1000, 2000, 3000
             cumulatively (not the same balance for all 3). User report:
             "الشيك الاول بعدها الرصيد هايقل، والشيك التاني يقل بقيمة الشيك،
             والشيك الاخير يقل الرصيد بقيمة الشيك ويكون ده الرصيد النهائي للعميل" */
          if (_instantCheck_eligible && _instantCheck_customer?.phone && user && typeof user.getIdToken === "function") {
            const totalChecks = _instantCheck_count;
            const office = _instantCheck_customer.companyName || _instantCheck_customer.company || _instantCheck_customer.office || _instantCheck_customer.businessName || "";
            /* V19.76.2: BASE balance after applying customer discount, then subtracting cash payments.
               V19.76.4: also subtract PRIOR receivable cashpay checks (existing pending checks
               that are NOT being saved in the current batch). The new batch's checks are NOT yet in
               data.checks (closure is pre-mutation), so all data.checks for this customer count as
               prior. Without this, a customer with existing 5 pending checks who saves 3 more would
               see the new batch messages report a balance higher by 5×check_amt than reality.
               Each new check's message will further subtract progressively:
                 balance for check_i = baseAfterPriorChecks - (i+1) * newCheckAmt. */
            let _gross = 0;
            for (const o of (data.orders||[])) {
              for (const d of (o.customerDeliveries||[])) {
                if (d.custId === chkPartyId) _gross += (Number(d.qty)||0) * (Number(d.price)||Number(o.sellPrice)||0);
              }
              for (const r of (o.customerReturns||[])) {
                if (r.custId === chkPartyId) _gross -= (Number(r.qty)||0) * (Number(r.price)||Number(o.sellPrice)||0);
              }
            }
            const _discPct = Number(_instantCheck_customer.discount)||0;
            const _discAmt = Math.round(_gross * _discPct / 100);
            let _baseBal = _gross - _discAmt;
            for (const p of (data.custPayments||[])) {
              if (p.custId === chkPartyId) _baseBal -= Number(p.amount)||0;
            }
            for (const ck of (data.checks||[])) {
              if (ck.partyId !== chkPartyId) continue;
              if (ck.type !== "receivable") continue;
              if (ck.status === "مرتد" || ck.status === "ملغي") continue;
              if ((ck.category || "دفعة عميل") !== "دفعة عميل") continue;
              _baseBal -= Number(ck.amount)||0;
            }
            const baseBalanceRounded = Math.round(_baseBal);
            (async () => {
              try {
                const idToken = await user.getIdToken();
                /* Sequential await (NOT Promise.all) — keeps order so messages
                   land at WhatsApp in 1→2→3 order matching the balance progression. */
                for (let i = 0; i < _instantCheck_ids.length; i++) {
                  const cid = _instantCheck_ids[i];
                  const checkNo = bumpCheckNo(chkNumber, i);
                  const dueDate = chkDueDate ? addMonths(chkDueDate, i * (Math.max(0, Number(chkBatchMonthsStep)||0))) : "";
                  const batchInfo = totalChecks > 1 ? `(شيك ${i+1} من ${totalChecks})` : "";
                  /* Progressive balance: subtract (i+1) check amounts from base */
                  const balanceForThisCheck = baseBalanceRounded - (i+1) * amt;
                  await fetch("/api/event-trigger", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + idToken },
                    body: JSON.stringify({
                      eventType: "checkPaymentReceived",
                      payload: {
                        customerName: _instantCheck_customer.name || "—",
                        amount: amt,
                        bank: chkBank || "—",
                        checkNo: checkNo || "—",
                        dueDate: dueDate || "—",
                        batchInfo,
                        office,
                        balance: balanceForThisCheck,
                        date: chkDate || today,
                      },
                      customerPhone: _instantCheck_customer.phone,
                      idempotencyKey: "checkPay:" + cid,
                    }),
                  }).catch(() => {/* silent per-check failure — cron fallback */});
                }
              } catch (e) {
                console.warn("[V19.70.8] instant checkPaymentReceived fire failed (cron will retry):", e?.message||e);
              }
            })();
          }
          /* V19.70.10: instant checkPaymentIssued fire — same pattern as receivable, but
             party=supplier and balance reflects what we owe them (debt to supplier).
             For suppliers, "balance" = sum of supplier invoices/POs - sum of supplier payments.
             We don't have that ledger easily. For MVP, balance = current sum of unpaid supplier
             obligations from data.supplierPayments and pending POs — but to keep it simple,
             we use 0 as a placeholder and let the user override the template. */
          if (_instantIssuedCheck_eligible && _instantIssuedCheck_supplier?.phone && user && typeof user.getIdToken === "function") {
            const totalChecks = _instantIssuedCheck_count;
            const office = _instantIssuedCheck_supplier.companyName || _instantIssuedCheck_supplier.company || _instantIssuedCheck_supplier.office || _instantIssuedCheck_supplier.businessName || "";
            /* Compute supplier base balance: positive = we owe them. Approximation:
               sum of unpaid supplier invoices / POs - sum of supplierPayments. The
               app may not have invoice tracking per supplier, so we conservatively
               use 0 if no easy computation. The user template can omit {balance}. */
            let _baseBal = 0;
            for (const p of (data.supplierPayments||[])) {
              if (p.supplierId === chkPartyId) _baseBal -= Number(p.amount)||0;
            }
            /* Note: We don't add supplier invoices here because the data model varies.
               If you need accurate balance, customize template to omit {balance}. */
            const baseBalanceRounded = Math.round(_baseBal);
            (async () => {
              try {
                const idToken = await user.getIdToken();
                /* Sequential await to keep order matching balance progression */
                for (let i = 0; i < _instantIssuedCheck_ids.length; i++) {
                  const cid = _instantIssuedCheck_ids[i];
                  const checkNo = bumpCheckNo(chkNumber, i);
                  const dueDate = chkDueDate ? addMonths(chkDueDate, i * (Math.max(0, Number(chkBatchMonthsStep)||0))) : "";
                  const batchInfo = totalChecks > 1 ? `(شيك ${i+1} من ${totalChecks})` : "";
                  /* Progressive: each check reduces our debt by amt */
                  const balanceForThisCheck = baseBalanceRounded - (i+1) * amt;
                  await fetch("/api/event-trigger", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + idToken },
                    body: JSON.stringify({
                      eventType: "checkPaymentIssued",
                      payload: {
                        supplierName: _instantIssuedCheck_supplier.name || "—",
                        amount: amt,
                        bank: chkBank || "—",
                        checkNo: checkNo || "—",
                        dueDate: dueDate || "—",
                        batchInfo,
                        office,
                        balance: balanceForThisCheck,
                        date: chkDate || today,
                      },
                      supplierPhone: _instantIssuedCheck_supplier.phone,
                      idempotencyKey: "checkPay:" + cid,
                    }),
                  }).catch(() => {/* silent per-check failure — cron fallback */});
                }
              } catch (e) {
                console.warn("[V19.70.10] instant checkPaymentIssued fire failed (cron will retry):", e?.message||e);
              }
            })();
          }
          setShowCheckForm(false);setChkAmount("");setChkParty("");setChkPartyId("");setChkBank("");setChkNumber("");setChkDate("");setChkDueDate("");setChkNotes("");setChkCategory("");setChkEditId(null);setChkPartySearch("");setChkPartyOpen(false);
          setChkDrawerName("");/* V19.70.18 */
          setChkBatchEnabled(false);
          showToast(chkBatchEnabled&&!chkEditId?("✓ تم حفظ "+(Math.max(1,Number(chkBatchCount)||1))+" شيك"):"✓ تم الحفظ");
        };
        const editCheck=(c)=>{setChkEditId(c.id);setChkType(c.type);setChkAmount(String(c.amount));setChkParty(c.party||"");setChkPartyId(c.partyId||"");setChkBank(c.bank||"");setChkNumber(c.checkNo||"");setChkDate(c.date||"");setChkDueDate(c.dueDate||"");setChkNotes(c.notes||"");setChkCategory(c.category||"");setChkDrawerName(c.drawerName||"");setChkPartySearch("");setChkPartyOpen(false);setShowCheckForm(true)};
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
          /* V19.70.10: snapshot the check BEFORE the upConfig mutation so we can
             fire checkCollected / checkBounced events with full details. */
          const _statusSnapshot = (data.checks||[]).find(c=>c.id===id);
          /* V21.9.53: capture treasury legs for accounting post/reverse.
             ROOT CAUSE: pre-V21.9.53 updateStatus created/removed treasury
             entries WITHOUT calling autoPost — so Trial Balance Cash account
             drifted away from actual cash entries. Now we capture:
             • _oldLegsToReverse: any existing leg being removed (line 3108
               filter) — these need autoPost.reverse since their JE persists
             • _newLegToPost: the new in/out leg created (لو حالة محصل/مدفوع) */
          const _oldLegsToReverse = ((data.treasury)||[]).filter(t => t.checkId === id);
          let _newLegToPost = null;
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
              /* V21.9.53: capture the new leg for post-commit autoPost */
              _newLegToPost = {
                id:gid(),type:"in",amount:Number(ch.amount)||0,
                desc:"تحصيل شيك من "+(ch.party||"")+det,
                category:chkCat,account:targetAccount,season:d.activeSeason||"",
                date:dt,day:dayName(dt),
                custId:ch.type==="receivable"?ch.partyId||null:null,
                supplierId:ch.type==="payable"?ch.partyId||null:null,
                sourceType:"check_collect",checkId:ch.id,
                by:userName,createdAt:nowISO()
              };
              d.treasury.unshift(_newLegToPost);
            }
            if(status==="مدفوع"){
              /* V21.9.53: capture the new leg for post-commit autoPost */
              _newLegToPost = {
                id:gid(),type:"out",amount:Number(ch.amount)||0,
                desc:"صرف شيك لـ "+(ch.party||"")+det,
                category:chkCat,account:targetAccount,season:d.activeSeason||"",
                date:dt,day:dayName(dt),
                custId:ch.type==="receivable"?ch.partyId||null:null,
                supplierId:ch.type==="payable"?ch.partyId||null:null,
                sourceType:"check_pay",checkId:ch.id,
                by:userName,createdAt:nowISO()
              };
              d.treasury.unshift(_newLegToPost);
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
                by:userName,createdAt:nowISO()
              });
            }
          });
          /* V21.9.53: post-commit accounting integration.
             Reverse any old legs that were filtered out (idempotent re-toggle
             of check status) — autoPost.reverse looks up by sourceType+sourceId,
             returns reversed:false silently if no JE exists, so safe to over-fire.
             Then post the new leg if one was created (محصل / مدفوع).
             ⚠️ ROOT CAUSE: pre-V21.9.53 these calls were missing entirely →
             Trial Balance Cash account drifted away from actual cash flow
             every time a check was collected/paid/reverted. */
          _oldLegsToReverse.forEach(_oldLeg => {
            try{
              const _r = autoPost.reverse(data, _oldLeg.sourceType || "treasury", _oldLeg.id, _oldLeg.date, "تغيير حالة شيك", userName);
              if(_r && typeof _r.then==="function") _r.catch(()=>{});
            }catch(e){console.warn("[V21.9.53] autoPost.reverse (check leg) threw:",e?.message||e);}
          });
          if(_newLegToPost){
            try{
              const _r = autoPost.treasury(data, _newLegToPost, userName);
              if(_r && typeof _r.then==="function") _r.catch(()=>{});
            }catch(e){console.warn("[V21.9.53] autoPost.treasury (check leg) threw:",e?.message||e);}
          }
          showToast(status==="مرتد"?"❌ تم تسجيل الشيك كمرتد":status==="محصل"?"✅ تم التحصيل":status==="مدفوع"?"✅ تم الدفع":"✓ تم التحديث");
          /* V19.70.10/.11: instant status-change events for receivable checks.
             Detects:
               - status === "محصل"  → checkCollected
               - status === "مرتد"  → checkBounced
               - prev "مرتد" → new "معلق" → checkRePresented (re-submitted to bank)
             Only for receivable; payable status changes don't fire customer events. */
          const _prevStatus = _statusSnapshot?.status;
          const _isRePresent = _prevStatus === "مرتد" && status === "معلق";
          const _shouldFire = _statusSnapshot && _statusSnapshot.type === "receivable"
            && (status === "محصل" || status === "مرتد" || _isRePresent);
          if (_shouldFire) {
            const customer = customers.find(x => x.id === _statusSnapshot.partyId);
            if (customer?.phone && user && typeof user.getIdToken === "function") {
              const office = customer.companyName || customer.company || customer.office || customer.businessName || "";
              const computeBal = () => {
                /* V19.76.2: apply customer discount to base before subtracting payments.
                   V19.76.4: subtract OTHER pending receivable cashpay checks (not the one
                   being changed — handled separately based on new status), so the balance
                   matches كشف الحساب exactly when the customer has multiple checks. */
                let _gross = 0;
                for (const o of (data.orders||[])) {
                  for (const d of (o.customerDeliveries||[])) {
                    if (d.custId === _statusSnapshot.partyId) _gross += (Number(d.qty)||0) * (Number(d.price)||Number(o.sellPrice)||0);
                  }
                  for (const r of (o.customerReturns||[])) {
                    if (r.custId === _statusSnapshot.partyId) _gross -= (Number(r.qty)||0) * (Number(r.price)||Number(o.sellPrice)||0);
                  }
                }
                const _discPct = Number(customer.discount)||0;
                const _discAmt = Math.round(_gross * _discPct / 100);
                let _bal = _gross - _discAmt;
                for (const p of (data.custPayments||[])) {
                  if (p.custId === _statusSnapshot.partyId) _bal -= Number(p.amount)||0;
                }
                /* V19.76.4: subtract OTHER pending receivable cashpay checks (excluding
                   the one whose status we're changing — its contribution depends on the
                   new status and is added below). */
                for (const ck of (data.checks||[])) {
                  if (ck.id === _statusSnapshot.id) continue;
                  if (ck.partyId !== _statusSnapshot.partyId) continue;
                  if (ck.type !== "receivable") continue;
                  if (ck.status === "مرتد" || ck.status === "ملغي") continue;
                  if ((ck.category || "دفعة عميل") !== "دفعة عميل") continue;
                  _bal -= Number(ck.amount)||0;
                }
                /* This check's contribution based on the NEW status:
                   - محصل: counts as paid (collected check still reduces customer's debt)
                   - معلق via re-present: counts again
                   - مرتد: doesn't count (customer still owes) — no subtraction */
                if (status === "محصل" || _isRePresent) {
                  _bal -= Number(_statusSnapshot.amount)||0;
                }
                return Math.round(_bal);
              };
              let eventType, idempotencyKey, dateField;
              if (_isRePresent) {
                eventType = "checkRePresented";
                /* Each re-presentation gets a unique key (date-suffixed) so user can re-present
                   the same check multiple times (after subsequent bounces) and each fires fresh. */
                idempotencyKey = "checkRePresented:" + _statusSnapshot.id + ":" + dt;
                dateField = "rePresentedDate";
              } else if (status === "محصل") {
                eventType = "checkCollected";
                idempotencyKey = "checkCollected:" + _statusSnapshot.id;
                dateField = "collectedDate";
              } else {
                eventType = "checkBounced";
                /* V19.70.11: bouncedAt-suffixed key — supports re-bounce after re-present */
                idempotencyKey = "checkBounced:" + _statusSnapshot.id + ":" + dt;
                dateField = "bouncedDate";
              }
              (async () => {
                try {
                  const idToken = await user.getIdToken();
                  const payload = {
                    customerName: customer.name || _statusSnapshot.party || "—",
                    amount: Number(_statusSnapshot.amount) || 0,
                    bank: _statusSnapshot.bank || "—",
                    checkNo: _statusSnapshot.checkNo || _statusSnapshot.id,
                    originalDate: _statusSnapshot.date || "—",
                    office,
                    balance: computeBal(),
                  };
                  payload[dateField] = dt;
                  await fetch("/api/event-trigger", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + idToken },
                    body: JSON.stringify({
                      eventType, payload,
                      customerPhone: customer.phone,
                      idempotencyKey,
                    }),
                  });
                } catch (e) {
                  console.warn("[V19.70.11] instant " + eventType + " fire failed:", e?.message||e);
                }
              })();
            }
          }
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
          /* V21.9.53: capture treasury legs being deleted so we can reverse the JE after upConfig commits */
          const _checkLegsToReverse = ((data.treasury)||[]).filter(t => t.checkId === id);
          upConfig(d=>{
          /* V15.9: Also remove linked treasury entries (if check was collected/paid) */
          const ch=(d.checks||[]).find(c=>c.id===id);
          d.checks=(d.checks||[]).filter(c=>c.id!==id);
          if(ch&&d.treasury){
            d.treasury=d.treasury.filter(t=>t.checkId!==id);
          }
          /* V16.33: Also remove endorsed-check supplier payments linked to this check */
          if(ch)d.supplierPayments=(d.supplierPayments||[]).filter(p=>p.checkId!==id||p.method!=="endorsed_check");
        });
        /* V21.9.53: reverse the JE for any check legs deleted above.
           ROOT CAUSE: pre-V21.9.53 delCheck removed treasury rows but didn't
           call autoPost.reverse → orphan JEs accumulate in accountingDays
           → Trial Balance Cash account drifts. Idempotent — no-op if no JE. */
        _checkLegsToReverse.forEach(_oldLeg => {
          try{
            const _r = autoPost.reverse(data, _oldLeg.sourceType || "treasury", _oldLeg.id, _oldLeg.date, "حذف شيك", userName);
            if(_r && typeof _r.then==="function") _r.catch(()=>{});
          }catch(e){console.warn("[V21.9.53] autoPost.reverse (delCheck leg) threw:",e?.message||e);}
        });
        showToast("✓ تم حذف الشيك")};
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
          /* V19.70.11: snapshot the check + customer BEFORE upConfig for the
             checkEndorsed event hook (which fires after upConfig commits). */
          const _endorseSnapshot = (data.checks||[]).find(c=>c.id===checkId);
          const _endorseCustomer = _endorseSnapshot ? customers.find(x=>x.id===_endorseSnapshot.partyId) : null;
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
              by:userName,createdAt:nowISO()
            });
          });
          setEndorsePopup(null);setEndorseSearch("");
          showToast("✅ تم تظهير الشيك لـ "+sup.name);
          /* V19.70.11: instant checkEndorsed fire — supplier gets notification.
             Includes original customer name for traceability. */
          if (_endorseSnapshot && sup?.phone && user && typeof user.getIdToken === "function") {
            const customerOffice = _endorseCustomer
              ? (_endorseCustomer.companyName || _endorseCustomer.company || _endorseCustomer.office || _endorseCustomer.businessName || "")
              : "";
            const supplierOffice = sup.companyName || sup.company || sup.office || sup.businessName || "";
            /* Supplier balance approximation: sum of supplier payments (inverted = what we owe).
               After this endorsement, our debt to them is reduced by check amount. */
            let _bal = 0;
            for (const p of (data.supplierPayments||[])) {
              if (p.supplierId === sup.id) _bal -= Number(p.amount)||0;
            }
            _bal -= Number(_endorseSnapshot.amount)||0;
            const balanceRounded = Math.round(_bal);
            (async () => {
              try {
                const idToken = await user.getIdToken();
                await fetch("/api/event-trigger", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "Authorization": "Bearer " + idToken },
                  body: JSON.stringify({
                    eventType: "checkEndorsed",
                    payload: {
                      customerName: _endorseCustomer?.name || _endorseSnapshot.party || "—",
                      supplierName: sup.name || "—",
                      amount: Number(_endorseSnapshot.amount) || 0,
                      bank: _endorseSnapshot.bank || "—",
                      checkNo: _endorseSnapshot.checkNo || _endorseSnapshot.id,
                      dueDate: _endorseSnapshot.dueDate || "—",
                      customerOffice,
                      office: supplierOffice,
                      balance: balanceRounded,
                    },
                    supplierPhone: sup.phone,
                    idempotencyKey: "checkEndorsed:" + _endorseSnapshot.id,
                  }),
                });
              } catch (e) {
                console.warn("[V19.70.11] instant checkEndorsed fire failed:", e?.message||e);
              }
            })();
          }
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
            {canEdit&&<Btn primary onClick={()=>{setChkEditId(null);setChkType("receivable");setChkAmount("");setChkParty("");setChkBank("");setChkNumber("");setChkDate(today);setChkDueDate("");setChkNotes("");setChkDrawerName("");setShowCheckForm(!showCheckForm)}}>{showCheckForm?"✕ إغلاق":"+ شيك جديد"}</Btn>}
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
              <div style={{position:"relative"}}>
                <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>{chkType==="receivable"?"العميل":"المورد"}</label>
                {/* V19.70.9: searchable picker — replaces long dropdown with filter input + filtered list */}
                {chkPartyId ? (
                  /* Selected state — show name + clear button */
                  <div style={{display:"flex",alignItems:"center",gap:6,padding:"8px 10px",border:"1px solid "+T.brd,borderRadius:8,background:T.accent+"10"}}>
                    <span style={{flex:1,fontSize:FS-1,fontWeight:700,color:T.text}}>{chkParty || "—"}</span>
                    <span onClick={()=>{setChkPartyId("");setChkParty("");setChkPartySearch("");setChkPartyOpen(true);}}
                      style={{cursor:"pointer",color:T.err,fontSize:FS-2,fontWeight:700,padding:"2px 8px",borderRadius:4}}
                      title="إلغاء الاختيار">✕</span>
                  </div>
                ) : (
                  <>
                    <Inp value={chkPartySearch} onChange={(v)=>{setChkPartySearch(v);setChkPartyOpen(true);}}
                      onFocus={()=>setChkPartyOpen(true)}
                      placeholder={"ابحث في "+(chkType==="receivable"?"العملاء":"الموردين")+" بالاسم..."}/>
                    {chkPartyOpen && (()=>{
                      const q = String(chkPartySearch||"").trim().toLowerCase();
                      const filtered = q
                        ? partyList.filter(p => String(p.name||"").toLowerCase().includes(q))
                        : partyList;
                      return (
                        <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:50,
                          marginTop:4,maxHeight:240,overflowY:"auto",
                          border:"1px solid "+T.brd,borderRadius:8,background:T.cardSolid,
                          boxShadow:"0 4px 12px rgba(0,0,0,0.08)"}}>
                          {filtered.length === 0 ? (
                            <div style={{padding:"10px 12px",fontSize:FS-2,color:T.textMut,textAlign:"center"}}>
                              {q ? "مفيش نتائج لـ\""+chkPartySearch+"\" — اكتب الاسم يدوياً تحت" : "مفيش "+(chkType==="receivable"?"عملاء":"موردين")+" مسجلين"}
                            </div>
                          ) : (
                            filtered.slice(0, 30).map(p => (
                              <div key={p.id} onClick={()=>{
                                setChkPartyId(p.id);setChkParty(p.name||"");
                                setChkPartySearch("");setChkPartyOpen(false);
                              }} style={{padding:"7px 10px",cursor:"pointer",borderBottom:"1px solid "+T.brd,
                                display:"flex",justifyContent:"space-between",alignItems:"center"}}
                                onMouseEnter={e=>e.currentTarget.style.background=T.accent+"08"}
                                onMouseLeave={e=>e.currentTarget.style.background=T.cardSolid}>
                                <span style={{fontWeight:600,fontSize:FS-1,color:T.text}}>{p.name}</span>
                                {p.phone && <span style={{fontSize:FS-3,color:T.textMut,direction:"ltr"}}>{p.phone}</span>}
                              </div>
                            ))
                          )}
                          {filtered.length > 30 && (
                            <div style={{padding:"6px 12px",fontSize:FS-3,color:T.textMut,textAlign:"center",borderTop:"1px solid "+T.brd}}>
                              +{filtered.length - 30} نتيجة أكتر — اكتب أكتر للتضييق
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    <Inp value={chkParty} onChange={setChkParty} placeholder="أو اكتب الاسم يدوياً (بدون ربط بسجل)" style={{marginTop:6}}/>
                  </>
                )}
                {selectedParty&&<div style={{fontSize:FS-3,color:T.textMut,marginTop:4}}>{selectedParty.phone?"📞 "+selectedParty.phone:""}</div>}
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
              {/* V19.70.18: drawerName — only for receivable. The customer paying us
                  with a 3rd party check needs to register the actual drawer's name (the
                  one written on the check). When endorsed to a supplier, the supplier
                  sees this as the original drawer — same person whose bank account will
                  be debited at presentation. */}
              {chkType==="receivable" && <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>اسم صاحب الشيك (المكتوب على الشيك)</label>
                <Inp value={chkDrawerName} onChange={setChkDrawerName} placeholder={chkParty?("افتراضياً: "+chkParty):"اسم صاحب الحساب"}/>
                <div style={{fontSize:FS-3,color:T.textMut,marginTop:3}}>💡 لو فاضي → يفترض اسم العميل ({chkParty||"—"})</div>
              </div>}
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
            {/* V21.9.127: Attachments — only on existing check (chkEditId). Cheque scan الأصلي مهم للـ audit. */}
            {chkEditId && (
              <div style={{marginTop: 12}}>
                <AttachmentList
                  entityType="checks"
                  entityId={chkEditId}
                  user={user}
                  canEdit={canEdit}
                  label="صور الشيك"
                  compact
                />
              </div>
            )}
            <div style={{marginTop:10}}><Btn primary onClick={saveCheck}>{chkEditId?"💾 حفظ التعديل":(chkBatchEnabled?"💾 حفظ "+Math.max(1,Math.min(60,Number(chkBatchCount)||1))+" شيك":"💾 حفظ")}</Btn></div>
          </Card>})()}
          {/* Checks table */}
          <Card title={"📝 سجل الشيكات ("+filteredChecks.length+")"}>
            {/* V19.70.8: bulk-delete bar (visible when 1+ checks selected) */}
            {selectedChkIds.size>0&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",marginBottom:10,borderRadius:10,background:T.err+"10",border:"1px solid "+T.err+"40"}}>
              <div style={{fontSize:FS-1,color:T.text,fontWeight:700}}>
                ☑️ محدد: <b>{selectedChkIds.size}</b> شيك
              </div>
              <div style={{display:"flex",gap:8}}>
                <Btn small onClick={clearChkSel} style={{fontSize:FS-2}}>إلغاء التحديد</Btn>
                <Btn small primary onClick={async()=>{
                  /* V19.76.8: replaced window.confirm with the app's custom ask() popup
                     so the dialog matches the rest of the UI (RTL, themed, no browser chrome). */
                  if(await ask("حذف الشيكات المحددة","هتمسح "+selectedChkIds.size+" شيك. متأكد؟",{danger:true,confirmText:"🗑 حذف"}))bulkDeleteChecks([...selectedChkIds]);
                }} style={{background:T.err,color:"#fff",border:"none",fontWeight:700}}>
                  🗑️ حذف المحدد ({selectedChkIds.size})
                </Btn>
              </div>
            </div>}
            {filteredChecks.length>0?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>
              {/* V19.70.8: select-all checkbox column header */}
              {canEdit&&<th style={{padding:"7px 8px",textAlign:"center",fontSize:FS-2,color:T.textSec,borderBottom:"2px solid "+T.brd,fontWeight:700,whiteSpace:"nowrap",width:30}}>
                <input type="checkbox"
                  checked={filteredChecks.length>0&&filteredChecks.every(c=>selectedChkIds.has(c.id))}
                  onChange={()=>{
                    const ids=filteredChecks.map(c=>c.id);
                    const allOn=ids.every(id=>selectedChkIds.has(id));
                    setSelectedChkIds(prev=>{
                      const n=new Set(prev);
                      if(allOn)ids.forEach(id=>n.delete(id));
                      else ids.forEach(id=>n.add(id));
                      return n;
                    });
                  }}
                  style={{cursor:"pointer",width:16,height:16}}
                  title="تحديد الكل"/>
              </th>}
              {/* V19.70.10: تسجيل column header centered to match the centered data cells */}
              {["النوع","المبلغ","الجهة","البنك","رقم الشيك","تاريخ الاستحقاق","تسجيل","الحالة",""].map(h=><th key={h} style={{padding:"7px 8px",textAlign:h==="تسجيل"?"center":"right",fontSize:FS-2,color:T.textSec,borderBottom:"2px solid "+T.brd,fontWeight:700,whiteSpace:"nowrap"}}>{h}</th>)}
            </tr></thead><tbody>
              {/* V19.70.6: sort by createdAt DESC (newest entry at top, down to the minute).
                 Tiebreaker: dueDate ASC for entries without createdAt (legacy). */}
              {filteredChecks.sort((a,b)=>{
                const ac=a.createdAt||"", bc=b.createdAt||"";
                if (ac && bc) return bc.localeCompare(ac);
                if (ac) return -1;
                if (bc) return 1;
                return (a.dueDate||"").localeCompare(b.dueDate||"");
              }).map(c=>{const overdue=c.dueDate&&c.dueDate<today&&c.status==="معلق";const isChkSel=selectedChkIds.has(c.id);
                return<tr key={c.id} style={{borderBottom:"1px solid "+T.brd,background:isChkSel?T.err+"06":overdue?T.err+"04":""}}>
                {canEdit&&<td style={{padding:"4px 8px",textAlign:"center"}}>
                  <input type="checkbox" checked={isChkSel} onChange={()=>toggleChkSel(c.id)} style={{cursor:"pointer",width:16,height:16}}/>
                </td>}
                {/* V19.70.8: tighter row padding (4px instead of 6px) */}
                <td style={{padding:"4px 8px"}}><span style={{padding:"2px 8px",borderRadius:6,fontSize:FS-2,fontWeight:700,background:c.type==="receivable"?T.ok+"12":T.err+"12",color:c.type==="receivable"?T.ok:T.err}}>{c.type==="receivable"?"قبض":"دفع"}</span></td>
                <td style={{padding:"4px 8px",fontSize:FS,fontWeight:800,color:c.type==="receivable"?T.ok:T.err}}>{fmt0(c.amount)}</td>
                <td style={{padding:"4px 8px",fontSize:FS-1,fontWeight:600}}>{c.party}{c.status==="مُظهّر"&&c.endorsedTo&&<div style={{fontSize:FS-3,color:"#8B5CF6",fontWeight:700,marginTop:2}}>{"📤 مُظهّر لـ "+c.endorsedTo}</div>}</td>
                <td style={{padding:"4px 8px",fontSize:FS-2,color:T.textSec}}>{c.bank||"—"}</td>
                <td style={{padding:"4px 8px",fontSize:FS-2,color:T.textMut}}>{c.checkNo||"—"}{c.batchId&&c.batchTotal>1&&<span style={{marginRight:6,padding:"1px 6px",borderRadius:8,background:"#0EA5E915",color:"#0284C7",fontSize:9,fontWeight:700}} title={"شيك "+c.batchIdx+" من حافظة من "+c.batchTotal+" شيكات"}>{c.batchIdx}/{c.batchTotal}</span>}</td>
                <td style={{padding:"4px 8px",fontSize:FS-1,fontWeight:overdue?700:400,color:overdue?T.err:T.text}}>{c.dueDate||"—"}{overdue?" ⚠️":""}</td>
                {/* V19.70.8: time UNDER date (block display, line-height tight)
                    V19.70.9: centered alignment for both date and time */}
                <td style={{padding:"4px 8px",fontSize:FS-3,color:T.textMut,whiteSpace:"nowrap",lineHeight:1.3,textAlign:"center"}}>
                  <div style={{textAlign:"center"}}>{c.date||"—"}</div>
                  {c.createdAt&&<div style={{direction:"ltr",fontSize:FS-3,color:T.textMut,textAlign:"center"}}>{formatTxTime(c.createdAt)}</div>}
                </td>
                <td style={{padding:"4px 8px"}}><span style={{padding:"2px 8px",borderRadius:6,fontSize:FS-2,fontWeight:700,background:(STATUS_COLORS[c.status]||T.textMut)+"15",color:STATUS_COLORS[c.status]||T.textMut}}>{c.status}</span></td>
                <td style={{padding:"4px 8px"}}>
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
                  {/* V19.70.18: surface the drawer name so the user knows whose bank
                      account will be debited at presentation. Especially important
                      for 3rd-party checks (where the drawer differs from the party
                      we received it from). */}
                  {ch.drawerName && ch.drawerName !== ch.party && (
                    <div style={{fontSize:FS-2,color:T.textSec,marginTop:3}}>
                      ✍️ صاحب الشيك (المكتوب عليه): <b style={{color:T.text}}>{ch.drawerName}</b>
                    </div>
                  )}
                  <div style={{fontSize:FS+2,fontWeight:800,color:"#8B5CF6",marginTop:4}}>{fmt0(ch.amount)} ج.م</div>
                  {ch.checkNo&&<div style={{fontSize:FS-2,color:T.textMut,marginTop:2}}>{"رقم: #"+ch.checkNo+(ch.dueDate?" | استحقاق: "+ch.dueDate:"")}</div>}
                  {ch.bank&&<div style={{fontSize:FS-2,color:T.textMut,marginTop:2}}>🏦 {ch.bank}</div>}
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

    {/* ══ V18.56: RECURRING TRANSACTIONS VIEW ══ */}
    {view==="recurring"&&(()=>{
      const recurringList = data.recurringTreasury || [];
      const pending = calculatePending(recurringList, today);
      const totalPending = pending.reduce((s,p)=>s+p.dueDates.length, 0);
      const allCategories = [...resolvedInCats, ...resolvedOutCats].filter((v,i,a)=>a.indexOf(v)===i);

      const openCreate = () => {
        setEditRecurringId(null);
        setRecForm({name:"",type:"out",amount:"",category:"",account:"MAIN CASH",description:"",notes:"",pattern:"monthly",dayOfMonth:1,dayOfWeek:0,startDate:today,endDate:"",active:true});
        setShowRecurringModal(true);
      };
      const openEdit = (r) => {
        setEditRecurringId(r.id);
        setRecForm({
          name:r.name||"", type:r.type||"out", amount:String(r.amount||""),
          category:r.category||"", account:r.account||"MAIN CASH",
          description:r.description||"", notes:r.notes||"",
          pattern:r.pattern||"monthly", dayOfMonth:r.dayOfMonth||1, dayOfWeek:r.dayOfWeek||0,
          startDate:r.startDate||today, endDate:r.endDate||"", active:r.active!==false,
        });
        setShowRecurringModal(true);
      };
      const toggleActive = (r) => {
        upConfig(d=>{
          if(!Array.isArray(d.recurringTreasury))return;
          const idx = d.recurringTreasury.findIndex(x=>x.id===r.id);
          if(idx<0)return;
          const wasActive = d.recurringTreasury[idx].active;
          d.recurringTreasury[idx].active = !wasActive;
          /* V21.9.89 (Recurring Treasury audit Bug #1): on re-enable, stamp
             lastResumedAt so calculatePending knows not to backfill missed
             dates while the rule was disabled. Pre-V21.9.89 a rule disabled
             for 14 days then re-enabled would generate 14 unwanted
             transactions on the next runPending tick. The V21.9.58 feature
             was designed but the UI never set the field. */
          if(!wasActive){
            d.recurringTreasury[idx].lastResumedAt = new Date().toISOString();
          }
        });
        showToast(r.active?"⏸ تم إيقاف الجدولة":"▶ تم تفعيل الجدولة");
      };
      const deleteRule = async (r) => {
        if(!await ask("حذف الجدولة","حذف الجدولة \""+r.name+"\"؟\n\nالحركات المُنشأة من قبلها لن تتأثر.",{danger:true,confirmText:"حذف"}))return;
        upConfig(d=>{
          if(!Array.isArray(d.recurringTreasury))return;
          d.recurringTreasury = d.recurringTreasury.filter(x=>x.id!==r.id);
        });
        showToast("✓ تم الحذف");
      };
      const runPending = async () => {
        if(totalPending===0){showToast("لا توجد حركات معلقة");return;}
        /* V21.9.58 (Automation Audit A4): cross-device race lock.
           Pre-V21.9.58 if two devices clicked "تنفيذ" at the same moment,
           both would generate the same dueDates → duplicate treasury txs +
           lastGeneratedDate stamped twice. The local inflight flag prevents
           same-tab double-click; the localStorage lock (3-min TTL) handles
           cross-tab/cross-device races by anchoring on lastGeneratedDate
           per rule.

           Note: a truly bulletproof fix would be a server-side endpoint with
           runTransaction(read lastGeneratedDate → only generate beyond it).
           This client-side lock is a 95% mitigation for the common case
           (admin accidentally clicking from 2 devices/tabs). */
        if(typeof window !== "undefined"){
          const _lockKey = "_clark_recurringRun_lock";
          const _lockedAt = window.localStorage?.getItem(_lockKey);
          if(_lockedAt){
            const _age = Date.now() - parseInt(_lockedAt, 10);
            if(_age >= 0 && _age < 3 * 60 * 1000){
              showToast("⏳ تنفيذ آخر جاري من جهاز/تاب آخر — استنى دقيقة وحاول تاني");
              return;
            }
          }
          window.localStorage?.setItem(_lockKey, String(Date.now()));
        }
        if(!await ask("تنفيذ المستحقات","هل تريد إنشاء "+totalPending+" حركة معلقة؟",{confirmText:"تنفيذ"})){
          if(typeof window !== "undefined") window.localStorage?.removeItem("_clark_recurringRun_lock");
          return;
        }
        let createdCount = 0;
        const txsForAutoPost = [];
        upConfig(d=>{
          if(!Array.isArray(d.treasury)) d.treasury = [];
          if(!Array.isArray(d.recurringTreasury)) d.recurringTreasury = [];
          pending.forEach(({rule, dueDates})=>{
            dueDates.forEach(due=>{
              const tx = buildTxFromRule(rule, due, userName);
              d.treasury.unshift(tx);
              txsForAutoPost.push(tx);
              createdCount++;
            });
            /* Update lastGeneratedDate to the latest due date */
            const idx = d.recurringTreasury.findIndex(r=>r.id===rule.id);
            if(idx>=0){
              const latest = dueDates[dueDates.length-1];
              d.recurringTreasury[idx].lastGeneratedDate = latest;
              if(!Array.isArray(d.recurringTreasury[idx].generatedTxIds))
                d.recurringTreasury[idx].generatedTxIds = [];
              dueDates.forEach((_,i)=>{
                d.recurringTreasury[idx].generatedTxIds.push(txsForAutoPost[txsForAutoPost.length-dueDates.length+i].id);
              });
            }
          });
        });
        /* V19.8: Same defensive wrapping as in saveTx — autoPost.treasury can
           return a plain object (not Promise) if accountingSettings.autoPostEnabled
           is false. .catch on plain object would throw TypeError. */
        txsForAutoPost.forEach(tx=>{
          try{
            const _r=autoPost.treasury(data, tx, userName);
            if(_r && typeof _r.then==="function") _r.catch(e=>console.warn("[recurring autoPost]", e));
          }catch(e){console.warn("[recurring autoPost] sync threw:", e?.message||e);}
        });
        /* V21.9.58 (A4): release the cross-device lock after completion */
        if(typeof window !== "undefined") window.localStorage?.removeItem("_clark_recurringRun_lock");
        playBeep("done");
        showToast("✓ تم إنشاء "+createdCount+" حركة من الجدولة");
      };

      return <div>
        <Card title="🔁 الحركات المتكررة (الجدولة الذكية)">
          <div style={{padding:12, borderBottom:"1px solid "+T.brd, background:T.bg}}>
            <div style={{fontSize:FS-2, color:T.textSec, lineHeight:1.6}}>
              💡 جدولة الحركات الدورية اللي بتتكرر يومياً/أسبوعياً/شهرياً (إيجار، مرتبات، اشتراكات).
              النظام بيكتشف الحركات المعلقة ويعرضها هنا — اضغط "تنفيذ المستحقات" لإنشاء كل الحركات بضغطة واحدة.
            </div>
          </div>
          {/* Pending banner */}
          {totalPending>0 && <div style={{padding:14, background:T.warn+"08", borderBottom:"1px solid "+T.warn+"30", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8}}>
            <div>
              <div style={{fontSize:FS, fontWeight:800, color:T.warn}}>⏰ {totalPending} حركة معلقة جاهزة للتنفيذ</div>
              <div style={{fontSize:FS-2, color:T.textSec, marginTop:4}}>من {pending.length} جدولة نشطة</div>
            </div>
            {canEdit && <Btn primary onClick={runPending} style={{background:T.warn, color:"#fff", border:"none", fontWeight:800}}>▶ تنفيذ المستحقات الآن</Btn>}
          </div>}

          {/* Pending detail */}
          {totalPending>0 && <div style={{padding:12, borderBottom:"1px solid "+T.brd}}>
            <div style={{fontSize:FS-1, fontWeight:700, color:T.textSec, marginBottom:8}}>تفاصيل المستحقات:</div>
            <div style={{display:"flex", flexDirection:"column", gap:6}}>
              {pending.map(({rule, dueDates})=>
                <div key={rule.id} style={{padding:"8px 12px", background:T.bg, borderRadius:8, fontSize:FS-1, display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, flexWrap:"wrap"}}>
                  <div>
                    <span style={{fontWeight:700, color:T.text}}>{rule.name}</span>
                    <span style={{color:T.textMut, marginInlineStart:8}}>({rule.type==="in"?"وارد":"منصرف"} {fmt0(rule.amount)})</span>
                  </div>
                  <div style={{fontSize:FS-2, color:T.warn, fontWeight:600}}>
                    {dueDates.length} مستحق: {dueDates.slice(0,3).join("، ")}{dueDates.length>3?"...":""}
                  </div>
                </div>
              )}
            </div>
          </div>}

          {/* Header + add button */}
          <div style={{padding:12, display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8}}>
            <div style={{fontSize:FS, fontWeight:700, color:T.text}}>الجدولة المُعرَّفة ({recurringList.length})</div>
            {canEdit && <Btn primary onClick={openCreate}>+ جدولة جديدة</Btn>}
          </div>

          {/* Rules list */}
          {recurringList.length === 0
            ? <div style={{padding:30, textAlign:"center", color:T.textMut, fontSize:FS-1}}>
                💡 ما عندكش جدولة لسه. اضغط "جدولة جديدة" لإضافة أول حركة دورية.
              </div>
            : <div style={{padding:"0 12px 12px"}}>
                <table style={{width:"100%", borderCollapse:"collapse", fontSize:FS-1}}>
                  <thead>
                    <tr style={{background:T.bg, borderBottom:"2px solid "+T.brd}}>
                      <th style={{padding:"8px 10px", textAlign:"right", color:T.textSec, fontWeight:700, fontSize:FS-2}}>الاسم</th>
                      <th style={{padding:"8px 10px", textAlign:"center", color:T.textSec, fontWeight:700, fontSize:FS-2}}>النوع</th>
                      <th style={{padding:"8px 10px", textAlign:"center", color:T.textSec, fontWeight:700, fontSize:FS-2}}>المبلغ</th>
                      <th style={{padding:"8px 10px", textAlign:"center", color:T.textSec, fontWeight:700, fontSize:FS-2}}>التكرار</th>
                      <th style={{padding:"8px 10px", textAlign:"center", color:T.textSec, fontWeight:700, fontSize:FS-2}}>التالي</th>
                      <th style={{padding:"8px 10px", textAlign:"center", color:T.textSec, fontWeight:700, fontSize:FS-2}}>آخر تنفيذ</th>
                      <th style={{padding:"8px 10px", textAlign:"center", color:T.textSec, fontWeight:700, fontSize:FS-2}}>الحالة</th>
                      <th style={{padding:"8px 10px", textAlign:"center", color:T.textSec, fontWeight:700, fontSize:FS-2}}>—</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recurringList.map(r=>{
                      const next = getNextDueDate(r, today);
                      return <tr key={r.id} style={{borderBottom:"1px solid "+T.brd, opacity:r.active===false?0.5:1}}>
                        <td style={{padding:"8px 10px"}}>
                          <div style={{fontWeight:700, color:T.text}}>{r.name}</div>
                          {r.category && <div style={{fontSize:FS-3, color:T.textMut}}>{r.category}</div>}
                        </td>
                        <td style={{padding:"8px 10px", textAlign:"center"}}>
                          <span style={{padding:"3px 8px", borderRadius:6, fontSize:FS-2, fontWeight:700, background:r.type==="in"?T.ok+"15":T.err+"15", color:r.type==="in"?T.ok:T.err}}>
                            {r.type==="in"?"↓ وارد":"↑ منصرف"}
                          </span>
                        </td>
                        <td style={{padding:"8px 10px", textAlign:"center", direction:"ltr", fontWeight:700}}>{fmt0(r.amount)}</td>
                        <td style={{padding:"8px 10px", textAlign:"center", fontSize:FS-2, color:T.textSec}}>{describeRecurrence(r)}</td>
                        <td style={{padding:"8px 10px", textAlign:"center", fontFamily:"monospace", fontSize:FS-2, color:next?T.accent:T.textMut}}>{next||"—"}</td>
                        <td style={{padding:"8px 10px", textAlign:"center", fontFamily:"monospace", fontSize:FS-2, color:T.textMut}}>{r.lastGeneratedDate||"لم يُنفّذ"}</td>
                        <td style={{padding:"8px 10px", textAlign:"center"}}>
                          <span style={{padding:"3px 8px", borderRadius:6, fontSize:FS-2, fontWeight:700, background:r.active===false?T.textMut+"15":T.ok+"15", color:r.active===false?T.textMut:T.ok}}>
                            {r.active===false?"موقوف":"نشط"}
                          </span>
                        </td>
                        <td style={{padding:"8px 10px", textAlign:"center"}}>
                          {canEdit && <div style={{display:"flex", gap:4, justifyContent:"center"}}>
                            <span onClick={()=>toggleActive(r)} style={{cursor:"pointer", padding:"3px 8px", borderRadius:6, fontSize:FS-2, background:T.bg, color:T.textSec, border:"1px solid "+T.brd}} title={r.active===false?"تفعيل":"إيقاف"}>{r.active===false?"▶":"⏸"}</span>
                            <span onClick={()=>openEdit(r)} style={{cursor:"pointer", padding:"3px 8px", borderRadius:6, fontSize:FS-2, background:T.bg, color:T.textSec, border:"1px solid "+T.brd}}>✏️</span>
                            <span onClick={()=>deleteRule(r)} style={{cursor:"pointer", padding:"3px 8px", borderRadius:6, fontSize:FS-2, background:T.err+"12", color:T.err, border:"1px solid "+T.err+"30"}}>🗑️</span>
                          </div>}
                        </td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>}
        </Card>
      </div>;
    })()}

    {/* ══ V18.56: Recurring Rule Modal ══ */}
    {showRecurringModal && <div style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:99999, display:"flex", alignItems:"center", justifyContent:"center", padding:16, backdropFilter:"blur(4px)"}} onClick={()=>{setShowRecurringModal(false);setEditRecurringId(null)}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid, borderRadius:20, padding:24, width:"100%", maxWidth:600, maxHeight:"90vh", overflowY:"auto", border:"1px solid "+T.brd, boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16}}>
          <div style={{fontSize:FS+2, fontWeight:800, color:T.accent}}>{editRecurringId?"✏️ تعديل جدولة":"🔁 جدولة جديدة"}</div>
          <Btn ghost small onClick={()=>{setShowRecurringModal(false);setEditRecurringId(null)}}>✕</Btn>
        </div>
        <div style={{display:"grid", gridTemplateColumns:isMob?"1fr":"1fr 1fr", gap:12}}>
          <div style={{gridColumn:isMob?"1":"1 / -1"}}>
            <label style={{fontSize:FS-2, color:T.textSec, fontWeight:600, display:"block", marginBottom:4}}>اسم الجدولة *</label>
            <Inp value={recForm.name} onChange={v=>setRecForm({...recForm, name:v})} placeholder="مثال: إيجار المصنع، مرتب أحمد..."/>
          </div>
          <div style={{gridColumn:isMob?"1":"1 / -1"}}>
            <label style={{fontSize:FS-2, color:T.textSec, fontWeight:600}}>النوع</label>
            <div style={{display:"flex", gap:6, marginTop:4}}>
              <div onClick={()=>setRecForm({...recForm, type:"in"})} style={{flex:1, padding:"10px", borderRadius:10, textAlign:"center", cursor:"pointer", fontWeight:700, background:recForm.type==="in"?T.ok+"15":"transparent", border:"2px solid "+(recForm.type==="in"?T.ok:T.brd), color:recForm.type==="in"?T.ok:T.textSec}}>↓ وارد</div>
              <div onClick={()=>setRecForm({...recForm, type:"out"})} style={{flex:1, padding:"10px", borderRadius:10, textAlign:"center", cursor:"pointer", fontWeight:700, background:recForm.type==="out"?T.err+"15":"transparent", border:"2px solid "+(recForm.type==="out"?T.err:T.brd), color:recForm.type==="out"?T.err:T.textSec}}>↑ منصرف</div>
            </div>
          </div>
          <div>
            <label style={{fontSize:FS-2, color:T.textSec, fontWeight:600, display:"block", marginBottom:4}}>المبلغ *</label>
            <Inp type="number" value={recForm.amount} onChange={v=>setRecForm({...recForm, amount:v})} placeholder="0.00"/>
          </div>
          <div>
            <label style={{fontSize:FS-2, color:T.textSec, fontWeight:600, display:"block", marginBottom:4}}>الحساب</label>
            <Sel value={recForm.account} onChange={v=>setRecForm({...recForm, account:v})}>
              {accounts.map(a=><option key={a} value={a}>{a}</option>)}
            </Sel>
          </div>
          <div style={{gridColumn:isMob?"1":"1 / -1"}}>
            <label style={{fontSize:FS-2, color:T.textSec, fontWeight:600, display:"block", marginBottom:4}}>الفئة</label>
            <SearchSel
              value={recForm.category}
              onChange={v=>setRecForm({...recForm, category:v})}
              options={(recForm.type==="in"?resolvedInCats:resolvedOutCats).map(c=>({value:c, label:c}))}
              maxResults={30} showAllOnFocus={true} placeholder="اكتب أو اختر..."/>
          </div>
          <div style={{gridColumn:isMob?"1":"1 / -1"}}>
            <label style={{fontSize:FS-2, color:T.textSec, fontWeight:600, display:"block", marginBottom:4}}>البيان</label>
            <Inp value={recForm.description} onChange={v=>setRecForm({...recForm, description:v})} placeholder="وصف الحركة (اختياري)"/>
          </div>
          {/* Pattern selector */}
          <div style={{gridColumn:isMob?"1":"1 / -1"}}>
            <label style={{fontSize:FS-2, color:T.textSec, fontWeight:600}}>نمط التكرار</label>
            <div style={{display:"flex", gap:6, marginTop:4}}>
              {[{k:"daily",l:"يومياً"},{k:"weekly",l:"أسبوعياً"},{k:"monthly",l:"شهرياً"}].map(p=>
                <div key={p.k} onClick={()=>setRecForm({...recForm, pattern:p.k})} style={{flex:1, padding:"8px", borderRadius:8, textAlign:"center", cursor:"pointer", fontWeight:700, fontSize:FS-1, background:recForm.pattern===p.k?T.accent+"15":"transparent", border:"2px solid "+(recForm.pattern===p.k?T.accent:T.brd), color:recForm.pattern===p.k?T.accent:T.textSec}}>{p.l}</div>
              )}
            </div>
          </div>
          {recForm.pattern==="weekly" && <div style={{gridColumn:isMob?"1":"1 / -1"}}>
            <label style={{fontSize:FS-2, color:T.textSec, fontWeight:600, display:"block", marginBottom:4}}>يوم الأسبوع</label>
            <Sel value={recForm.dayOfWeek} onChange={v=>setRecForm({...recForm, dayOfWeek:Number(v)})}>
              <option value={0}>الأحد</option>
              <option value={1}>الإثنين</option>
              <option value={2}>الثلاثاء</option>
              <option value={3}>الأربعاء</option>
              <option value={4}>الخميس</option>
              <option value={5}>الجمعة</option>
              <option value={6}>السبت</option>
            </Sel>
          </div>}
          {recForm.pattern==="monthly" && <div style={{gridColumn:isMob?"1":"1 / -1"}}>
            <label style={{fontSize:FS-2, color:T.textSec, fontWeight:600, display:"block", marginBottom:4}}>يوم من الشهر (1-31)</label>
            {/* V21.9.89 (Recurring Treasury audit Bug #3): UI clamp bumped
                28 → 31 to match recurring.js:67-84 logic (V21.9.58 supported
                up to 31 with auto-shift to lastDayOfMonth on Feb/short
                months). Pre-V21.9.89 the UI silently capped to 28, confusing
                admins trying to schedule for end-of-month. */}
            <Inp type="number" value={recForm.dayOfMonth} onChange={v=>{const n=Math.min(Math.max(Number(v)||1,1),31);setRecForm({...recForm, dayOfMonth:n})}}/>
          </div>}
          <div>
            <label style={{fontSize:FS-2, color:T.textSec, fontWeight:600, display:"block", marginBottom:4}}>تاريخ البدء *</label>
            <Inp type="date" value={recForm.startDate} onChange={v=>setRecForm({...recForm, startDate:v})}/>
          </div>
          <div>
            <label style={{fontSize:FS-2, color:T.textSec, fontWeight:600, display:"block", marginBottom:4}}>تاريخ الانتهاء (اختياري)</label>
            <Inp type="date" value={recForm.endDate} onChange={v=>setRecForm({...recForm, endDate:v})}/>
          </div>
        </div>
        <div style={{marginTop:16, display:"flex", gap:8, justifyContent:"flex-end"}}>
          <Btn ghost onClick={()=>{setShowRecurringModal(false);setEditRecurringId(null)}}>إلغاء</Btn>
          <Btn primary onClick={()=>{
            if(!recForm.name.trim()){tell("بيانات ناقصة","اسم الجدولة مطلوب",{danger:true});return;}
            /* V21.9.89 (Recurring Treasury audit Bug #2): reject negative
               amounts. Pre-V21.9.89 a rule could be saved with amount=-1000
               type="out" → generated TXs flipped sign on balance → silent
               confusion. */
            if(!Number(recForm.amount) || Number(recForm.amount) <= 0){
              tell("بيانات ناقصة","المبلغ يجب أن يكون أكبر من صفر",{danger:true});
              return;
            }
            if(!recForm.startDate){tell("بيانات ناقصة","تاريخ البدء مطلوب",{danger:true});return;}
            const ruleData = {
              name:recForm.name.trim(), type:recForm.type, amount:Number(recForm.amount),
              category:recForm.category, account:recForm.account,
              description:recForm.description, notes:recForm.notes,
              pattern:recForm.pattern,
              dayOfMonth:recForm.pattern==="monthly"?Number(recForm.dayOfMonth):undefined,
              dayOfWeek: recForm.pattern==="weekly"?Number(recForm.dayOfWeek):undefined,
              startDate:recForm.startDate, endDate:recForm.endDate||null,
              active:recForm.active,
            };
            upConfig(d=>{
              if(!Array.isArray(d.recurringTreasury)) d.recurringTreasury = [];
              if(editRecurringId){
                const idx = d.recurringTreasury.findIndex(r=>r.id===editRecurringId);
                if(idx>=0) d.recurringTreasury[idx] = {...d.recurringTreasury[idx], ...ruleData};
              } else {
                d.recurringTreasury.push({
                  id:gid(), ...ruleData,
                  generatedTxIds:[],
                  createdAt:nowISO(),
                  createdBy:userName,
                });
              }
            });
            showToast(editRecurringId?"✓ تم التعديل":"✓ تم إنشاء الجدولة");
            setShowRecurringModal(false);
            setEditRecurringId(null);
          }}>{editRecurringId?"💾 حفظ التعديل":"💾 حفظ الجدولة"}</Btn>
        </div>
      </div>
    </div>}

    {/* ══ ANALYSIS VIEW ══ */}
    {/* V21.21.2: تاب «تقارير» — التقرير الأول: تقرير الخزنة الشامل (هيتضاف تقارير تانية لاحقاً) */}
    {view==="reports"&&(()=>{
      const scopeAcc=(t)=> rpAcc==="__all__" ? true : (String(t.account||"").trim()===rpAcc);
      const dOf=(t)=>String(t.date||t.createdAt||"").slice(0,10);
      const catOf=(t)=>(String(t.category||"").trim())||(t.type==="in"?"إيراد عام":t.type==="out"?"مصروف عام":"غير مصنف");
      const allCats=Array.from(new Set(txns.filter(scopeAcc).map(catOf))).sort();
      /* رصيد افتتاحي قبل بداية الفترة (لنفس النطاق) = صافي كل الحركات السابقة */
      const opening=rpFrom?r2(txns.filter(t=>scopeAcc(t)&&dOf(t)<rpFrom).reduce((s,t)=>s+(t.type==="in"?1:t.type==="out"?-1:0)*(Number(t.amount)||0),0)):0;
      let rows=txns.filter(t=>{
        if(!t||!scopeAcc(t))return false;
        const d=dOf(t); if(rpFrom&&d<rpFrom)return false; if(rpTo&&d>rpTo)return false;
        if(rpType!=="all"&&t.type!==rpType)return false;
        if(rpCat!=="__all__"&&catOf(t)!==rpCat)return false;
        if(rpSearchDeb){const q=rpSearchDeb.toLowerCase();const hay=((t.desc||"")+" "+(t.notes||"")+" "+(t.category||"")+" "+(t.account||"")).toLowerCase();if(!hay.includes(q))return false;}
        return true;
      });
      rows.sort((a,b)=>String(dOf(a)+(a.createdAt||"")).localeCompare(String(dOf(b)+(b.createdAt||""))));
      const totalIn=r2(rows.filter(t=>t.type==="in").reduce((s,t)=>s+(Number(t.amount)||0),0));
      const totalOut=r2(rows.filter(t=>t.type==="out").reduce((s,t)=>s+(Number(t.amount)||0),0));
      const net=r2(totalIn-totalOut); const closing=r2(opening+net);
      const scopeLabel=rpAcc==="__all__"?"جميع الخزن":rpAcc;
      const periodLabel=(rpFrom||"البداية")+" ← "+(rpTo||"النهاية");
      const typeLabel=rpType==="in"?"وارد فقط":rpType==="out"?"منصرف فقط":"الكل";
      let run=opening;
      const rowData=rows.map(t=>{const amt=Number(t.amount)||0; if(t.type==="in")run=r2(run+amt); else if(t.type==="out")run=r2(run-amt); return{t,run};});
      const buildHTML=()=>{
        let h='<h2 style="text-align:center">📈 تقرير الخزنة الشامل</h2>';
        h+='<table style="width:100%;border-collapse:collapse;margin-bottom:10px;font-size:13px"><tbody>';
        h+='<tr><td style="padding:4px;border:1px solid #ddd;font-weight:700;background:#f7f7f7">الخزنة</td><td style="padding:4px;border:1px solid #ddd">'+_esc(scopeLabel)+'</td><td style="padding:4px;border:1px solid #ddd;font-weight:700;background:#f7f7f7">الفترة</td><td style="padding:4px;border:1px solid #ddd">'+_esc(periodLabel)+'</td></tr>';
        h+='<tr><td style="padding:4px;border:1px solid #ddd;font-weight:700;background:#f7f7f7">نوع الحركة</td><td style="padding:4px;border:1px solid #ddd">'+typeLabel+'</td><td style="padding:4px;border:1px solid #ddd;font-weight:700;background:#f7f7f7">الفئة</td><td style="padding:4px;border:1px solid #ddd">'+(rpCat==="__all__"?"الكل":_esc(rpCat))+'</td></tr></tbody></table>';
        h+='<table style="width:100%;border-collapse:collapse;margin-bottom:12px;font-size:13px"><tbody>';
        h+='<tr><td style="padding:6px;border:1px solid #ddd">الرصيد الافتتاحي</td><td style="padding:6px;border:1px solid #ddd;text-align:left">'+fmt(opening)+'</td></tr>';
        h+='<tr><td style="padding:6px;border:1px solid #ddd;color:#16a34a">إجمالي الوارد</td><td style="padding:6px;border:1px solid #ddd;text-align:left;color:#16a34a">'+fmt(totalIn)+'</td></tr>';
        h+='<tr><td style="padding:6px;border:1px solid #ddd;color:#dc2626">إجمالي المنصرف</td><td style="padding:6px;border:1px solid #ddd;text-align:left;color:#dc2626">'+fmt(totalOut)+'</td></tr>';
        h+='<tr><td style="padding:6px;border:1px solid #ddd;font-weight:700">صافي الفترة</td><td style="padding:6px;border:1px solid #ddd;text-align:left;font-weight:700">'+fmt(net)+'</td></tr>';
        h+='<tr><td style="padding:6px;border:1px solid #ddd;font-weight:800;background:#f0f9ff">الرصيد الختامي</td><td style="padding:6px;border:1px solid #ddd;text-align:left;font-weight:800;background:#f0f9ff">'+fmt(closing)+'</td></tr>';
        h+='<tr><td style="padding:6px;border:1px solid #ddd">عدد الحركات</td><td style="padding:6px;border:1px solid #ddd;text-align:left">'+rows.length+'</td></tr></tbody></table>';
        h+='<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:#1e293b;color:#fff"><th style="padding:5px;border:1px solid #ddd">#</th><th style="padding:5px;border:1px solid #ddd">التاريخ</th><th style="padding:5px;border:1px solid #ddd">البيان</th><th style="padding:5px;border:1px solid #ddd">الفئة</th>'+(rpAcc==="__all__"?'<th style="padding:5px;border:1px solid #ddd">الخزنة</th>':'')+'<th style="padding:5px;border:1px solid #ddd">وارد</th><th style="padding:5px;border:1px solid #ddd">منصرف</th><th style="padding:5px;border:1px solid #ddd">الرصيد</th></tr></thead><tbody>';
        rowData.forEach((rd,i)=>{const t=rd.t; h+='<tr><td style="padding:4px;border:1px solid #eee;text-align:center">'+(i+1)+'</td><td style="padding:4px;border:1px solid #eee">'+_esc(dOf(t))+'</td><td style="padding:4px;border:1px solid #eee">'+_esc(t.desc||"—")+'</td><td style="padding:4px;border:1px solid #eee">'+_esc((t.category||"").trim()||"—")+'</td>'+(rpAcc==="__all__"?'<td style="padding:4px;border:1px solid #eee">'+_esc((t.account||"").trim()||"—")+'</td>':'')+'<td style="padding:4px;border:1px solid #eee;text-align:left;color:#16a34a">'+(t.type==="in"?fmt(Number(t.amount)||0):"")+'</td><td style="padding:4px;border:1px solid #eee;text-align:left;color:#dc2626">'+(t.type==="out"?fmt(Number(t.amount)||0):"")+'</td><td style="padding:4px;border:1px solid #eee;text-align:left">'+fmt(rd.run)+'</td></tr>';});
        h+='</tbody></table>';
        return h;
      };
      const doPrint=()=>{if(rows.length===0){showToast("⚠️ لا توجد حركات في النطاق المختار");return;} printPage("تقرير الخزنة — "+scopeLabel,buildHTML(),{factoryName:data.factoryName,logo:data.logo});};
      const doWhatsApp=async()=>{
        if(rows.length===0){showToast("⚠️ لا توجد حركات للإرسال");return;}
        const digits=String(rpWaPhone||"").replace(/[^0-9]/g,"");
        const summaryTxt="📈 تقرير الخزنة — "+scopeLabel+"\nالفترة: "+periodLabel+"\nنوع: "+typeLabel+(rpCat==="__all__"?"":" · فئة: "+rpCat)+"\n────────\nالرصيد الافتتاحي: "+fmt(opening)+"\nالوارد: "+fmt(totalIn)+"\nالمنصرف: "+fmt(totalOut)+"\nالصافي: "+fmt(net)+"\nالرصيد الختامي: "+fmt(closing)+"\nعدد الحركات: "+rows.length;
        const bridge=data.campaignBridge||{};
        if(!bridge.url||!digits){ if(!digits){showToast("⚠️ اكتب رقم واتساب أو اضبط الـ Bridge في الإعدادات");return;} openWA("https://wa.me/"+digits+"?text="+encodeURIComponent(summaryTxt)); return; }
        setRpSending(true);
        try{
          let media=null;
          try{const b64=await htmlToPdfBase64(buildHTML(),{fontFamily:"Cairo, sans-serif"}); if(b64)media=[{base64:b64,mime:"application/pdf",name:"treasury-report.pdf"}];}catch(e){console.warn("[treasury report] pdf failed",e);}
          const headers={"Content-Type":"application/json"}; if(bridge.token)headers["Authorization"]="Bearer "+bridge.token;
          const ctrl=new AbortController(); const to=setTimeout(()=>ctrl.abort(),20000);
          const resp=await fetch(bridge.url.replace(/\/$/,"")+"/send",{method:"POST",headers,body:JSON.stringify({messages:[{phone:digits,message:summaryTxt,media}]}),signal:ctrl.signal});
          clearTimeout(to);
          const j=await resp.json().catch(()=>({}));
          if(resp.ok&&j&&j.ok!==false)showToast("✅ اتبعت عبر واتساب"+(media?" (PDF + نص)":" (نص فقط)"));
          else showToast("⛔ فشل الإرسال عبر الـ Bridge");
        }catch(e){showToast("⛔ خطأ الإرسال: "+(e.message||e));}
        setRpSending(false);
      };
      return<div>
        <Card title="📈 تقرير الخزنة الشامل">
          <div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"repeat(4,1fr)",gap:8,marginBottom:12}}>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>الخزنة</label><Sel value={rpAcc} onChange={setRpAcc}><option value="__all__">🏦 جميع الخزن</option>{accountsData.map(a=><option key={a.id} value={a.name}>{a.name}</option>)}</Sel></div>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>من تاريخ</label><Inp type="date" value={rpFrom} onChange={setRpFrom}/></div>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>إلى تاريخ</label><Inp type="date" value={rpTo} onChange={setRpTo}/></div>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>نوع الحركة</label><Sel value={rpType} onChange={setRpType}><option value="all">الكل</option><option value="in">وارد فقط</option><option value="out">منصرف فقط</option></Sel></div>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>الفئة</label><Sel value={rpCat} onChange={setRpCat}><option value="__all__">كل الفئات</option>{allCats.map(c=><option key={c} value={c}>{c}</option>)}</Sel></div>
            <div style={{gridColumn:isMob?"1 / -1":"span 3"}}><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>بحث (بيان/ملاحظات/فئة)</label><Inp value={rpSearch} onChange={setRpSearch} placeholder="ابحث..."/></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"repeat(5,1fr)",gap:8,marginBottom:12}}>
            {[{l:"الرصيد الافتتاحي",v:opening,c:T.textSec},{l:"الوارد",v:totalIn,c:"#16a34a"},{l:"المنصرف",v:totalOut,c:"#dc2626"},{l:"الصافي",v:net,c:net>=0?"#16a34a":"#dc2626"},{l:"الرصيد الختامي",v:closing,c:T.accent}].map((k,i)=>
              <div key={i} style={{padding:"10px",borderRadius:10,background:T.bg,border:"1px solid "+T.brd,textAlign:"center"}}><div style={{fontSize:FS-3,color:T.textSec,fontWeight:600}}>{k.l}</div><div style={{fontSize:FS+1,fontWeight:800,color:k.c}}>{fmt(k.v)}</div></div>)}
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:12}}>
            <Btn onClick={doPrint} style={{background:T.accent,color:"#fff"}}>🖨 طباعة / PDF</Btn>
            <Inp value={rpWaPhone} onChange={setRpWaPhone} placeholder="رقم واتساب (اختياري)" style={{maxWidth:170}}/>
            <Btn onClick={doWhatsApp} disabled={rpSending} style={{background:"#25D366",color:"#fff"}}>{rpSending?"⏳ جاري الإرسال...":"📲 واتساب (PDF)"}</Btn>
            <span style={{fontSize:FS-2,color:T.textMut}}>{rows.length} حركة</span>
          </div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:FS-2}}>
              <thead><tr style={{background:T.bg}}>
                <th style={{padding:"6px",borderBottom:"2px solid "+T.brd,textAlign:"right"}}>#</th>
                <th style={{padding:"6px",borderBottom:"2px solid "+T.brd,textAlign:"right"}}>التاريخ</th>
                <th style={{padding:"6px",borderBottom:"2px solid "+T.brd,textAlign:"right"}}>البيان</th>
                <th style={{padding:"6px",borderBottom:"2px solid "+T.brd,textAlign:"right"}}>الفئة</th>
                {rpAcc==="__all__"&&<th style={{padding:"6px",borderBottom:"2px solid "+T.brd,textAlign:"right"}}>الخزنة</th>}
                <th style={{padding:"6px",borderBottom:"2px solid "+T.brd,textAlign:"left"}}>وارد</th>
                <th style={{padding:"6px",borderBottom:"2px solid "+T.brd,textAlign:"left"}}>منصرف</th>
                <th style={{padding:"6px",borderBottom:"2px solid "+T.brd,textAlign:"left"}}>الرصيد</th></tr></thead>
              <tbody>
                {rowData.length===0?<tr><td colSpan={rpAcc==="__all__"?8:7} style={{padding:20,textAlign:"center",color:T.textMut}}>لا توجد حركات في النطاق المختار</td></tr>:
                rowData.slice(0,500).map((rd,i)=>{const t=rd.t;return<tr key={t.id||i} style={{borderBottom:"1px solid "+T.brd}}>
                  <td style={{padding:"6px",color:T.textMut}}>{i+1}</td>
                  <td style={{padding:"6px",whiteSpace:"nowrap"}}>{dOf(t)}</td>
                  <td style={{padding:"6px"}}>{t.desc||"—"}</td>
                  <td style={{padding:"6px",color:T.textSec}}>{(t.category||"").trim()||"—"}</td>
                  {rpAcc==="__all__"&&<td style={{padding:"6px",color:T.textSec}}>{(t.account||"").trim()||"—"}</td>}
                  <td style={{padding:"6px",textAlign:"left",color:"#16a34a",fontWeight:600}}>{t.type==="in"?fmt(Number(t.amount)||0):""}</td>
                  <td style={{padding:"6px",textAlign:"left",color:"#dc2626",fontWeight:600}}>{t.type==="out"?fmt(Number(t.amount)||0):""}</td>
                  <td style={{padding:"6px",textAlign:"left",fontWeight:700}}>{fmt(rd.run)}</td></tr>;})}
              </tbody>
            </table>
            {rowData.length>500&&<div style={{padding:8,textAlign:"center",color:T.textMut,fontSize:FS-2}}>أول 500 حركة معروضة — الطباعة/PDF بتشمل الكل ({rowData.length})</div>}
          </div>
        </Card>
      </div>;
    })()}

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
    {/* ── V21.9.203 — E-WALLETS view (Phase 1: wallets as separate cashboxes,
         monitoring, add/edit). Receive/spend/transfer reuse the normal treasury
         flow (a wallet IS an account, so it appears in every account dropdown).
         Commission (Phase 2) + cap enforcement (Phase 3) come next. ── */}
    {view==="wallets"&&<div>
      {(()=>{
        const wallets=accountsData.filter(a=>a.type==="wallet");
        const onPickImg=async(file)=>{
          if(!file)return;setWalletImgBusy(true);
          try{const d=await compressImage(file,180,0.6);setNewAccImage(d)}catch(_){showToast("⛔ تعذّر تجهيز الصورة")}
          setWalletImgBusy(false);
        };
        return<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
            <div style={{fontSize:FS+2,fontWeight:800,color:T.text}}>📱 المحافظ الإلكترونية</div>
            <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
              {/* V21.9.221: capacity checker — أنهي محفظة تستقبل مبلغ معيّن بأمان (من غير ما رصيدها يعدّي حد الرصيد) */}
              {wallets.length>0&&<span onClick={()=>setCapCheck({amount:""})} style={{cursor:"pointer",fontSize:FS-1,fontWeight:700,color:"#fff",background:T.accent,padding:"7px 14px",borderRadius:9,whiteSpace:"nowrap",boxShadow:T.shadow}}>🛡️ فحص استقبال مبلغ</span>}
              <div style={{fontSize:FS-2,color:T.textMut}}>{wallets.length} محفظة · خزائن منفصلة</div>
            </div>
          </div>
          {/* V21.9.221: capacity-check popup — pure read. Lists wallets that can receive
              the typed amount without exceeding their balance cap (ready first), with
              the available headroom per wallet. No-cap wallets accept any amount. */}
          {/* V21.9.248 — per-month wallet EXTERNAL/personal amounts (admin-only) */}
          {monthLimitW&&(()=>{
            const w=monthLimitW;
            const _b=accBalances[w.name]||{in:0,out:0};const _bal=_b.in-_b.out;
            const _fDay=walletDayOut[w.name]||0;const _fMonth=walletMonthOut[w.name]||0;
            const _capBal=Number(w.balanceCap)||0;const _capDay=Number(w.dailyWithdrawCap??60000)||0;const _capMonth=Number(w.monthlyWithdrawCap)||0;
            const _extRow=(label,factory,cap,val,setVal)=>{
              const _v=Number(val)||0;
              return <div style={{marginBottom:12,padding:"10px 12px",borderRadius:10,background:T.bg,border:"1px solid "+T.brd}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:FS-2,marginBottom:6}}>
                  <span style={{fontWeight:700,color:T.text}}>{label}</span>
                  <span style={{color:T.textMut}}>المسجّل: {fmt0(factory)}{cap>0?" / "+fmt0(cap):" (بلا حد)"}</span>
                </div>
                <Inp type="number" value={val} onChange={setVal} placeholder="مبلغ خارجي/شخصي (0)"/>
                {_v>0&&cap>0&&<div style={{fontSize:FS-3,color:T.warn,fontWeight:700,marginTop:5}}>بعد الخارجي: مستهلك {fmt0(factory+_v)} / {fmt0(cap)} → باقي {fmt0(Math.max(0,cap-factory-_v))}</div>}
              </div>;
            };
            return <div onClick={()=>setMonthLimitW(null)} className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
              <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:18,padding:22,width:"100%",maxWidth:460,maxHeight:"88vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <div style={{fontSize:FS+2,fontWeight:800,color:T.warn}}>💵 مبالغ خارجية — {w.name}</div>
                  <Btn ghost small onClick={()=>setMonthLimitW(null)}>✕</Btn>
                </div>
                <div style={{fontSize:FS-2,color:T.textMut,lineHeight:1.6,marginBottom:14}}>
                  سجّل مبالغ <strong>شخصية/خارجية</strong> دخلت المحفظة فعلياً بس <strong>مش حركات مصنع</strong> — بتتحسب استهلاك من الحد عشان الباقي المتاح يبقى صح (مش وهمي)، وبتظهر منفصلة كـ«خارجي». مالهاش <strong>أي تأثير على الفلوس أو الحركات أو القيود</strong>. (للشهر {curMonthKeyCairo()} بس، وبتتمسح أول الشهر الجاي — أدمن فقط)
                </div>
                {_extRow("سحب اليوم", _fDay, _capDay, mlDaily, setMlDaily)}
                {_extRow("سحب الشهر", _fMonth, _capMonth, mlMonthly, setMlMonthly)}
                {_extRow("الرصيد", _bal, _capBal, mlBalance, setMlBalance)}
                <div style={{display:"flex",gap:8,marginTop:6,flexWrap:"wrap"}}>
                  <Btn primary onClick={saveMonthLimit}>💾 حفظ لشهر {curMonthKeyCairo()}</Btn>
                  {walletHasMonthExtra(monthLimitW)&&<Btn danger onClick={clearMonthLimit}>🗑️ مسح الخارجي</Btn>}
                  <Btn ghost onClick={()=>setMonthLimitW(null)}>إلغاء</Btn>
                </div>
              </div>
            </div>;
          })()}
          {capCheck&&(()=>{
            const amt=parseFloat(capCheck.amount)||0;
            const rows=wallets.map(w=>{
              const b=accBalances[w.name]||{in:0,out:0};const bal=b.in-b.out+walletMonthExtra(w,"extBalance");/* V21.9.248: + الرصيد الخارجي */
              const cap=Number(walletEffCap(w,"balanceCap"))||0;const hasCap=cap>0;
              const avail=hasCap?Math.max(0,cap-bal):Infinity;
              const fits=!hasCap||(bal+amt<=cap);
              const over=hasCap?Math.max(0,(bal+amt)-cap):0;
              return{w,bal,cap,hasCap,avail,fits,over};
            }).sort((a,b)=>{
              if(amt>0&&a.fits!==b.fits)return a.fits?-1:1;
              const av=a.avail===Infinity?Number.MAX_SAFE_INTEGER:a.avail;
              const bv=b.avail===Infinity?Number.MAX_SAFE_INTEGER:b.avail;
              return bv-av;
            });
            const readyN=rows.filter(r=>r.fits).length;
            return<div onClick={()=>setCapCheck(null)} className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:10001,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}}>
              <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:18,width:"100%",maxWidth:520,maxHeight:"85vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={{fontSize:FS+2,fontWeight:800,color:T.text}}>🛡️ فحص استقبال مبلغ</div>
                  <span onClick={()=>setCapCheck(null)} style={{cursor:"pointer",fontSize:22,color:T.textMut,padding:"0 6px"}}>✕</span>
                </div>
                <div style={{fontSize:FS-2,color:T.textMut,marginBottom:8,lineHeight:1.6}}>اكتب المبلغ اللي هتستقبله، والبرنامج هيقولك أنهي محافظ تقدر تستقبله من غير ما رصيدها يعدّي حد الرصيد.</div>
                <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>المبلغ (ج.م)</label>
                <Inp type="number" value={capCheck.amount} onChange={v=>{const n=parseFloat(v);setCapCheck({amount:(n>60000?"60000":v)})}} placeholder="مثال: 50000"/>
                <div style={{fontSize:FS-3,color:T.textMut,marginTop:4}}>🚦 أقصى مبلغ 60,000 ج.م — الحد اليومي لتحويلات المحفظة.</div>
                {amt>0&&<div style={{margin:"10px 0",fontSize:FS-1,fontWeight:700,color:readyN>0?T.ok:T.err}}>{readyN>0?("✅ "+readyN+" محفظة تقدر تستقبل "+fmt0(amt)+" ج.م"):("⛔ مفيش محفظة تقدر تستقبل "+fmt0(amt)+" ج.م من غير ما تعدّي الحد")}</div>}
                <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:10}}>
                  {rows.map(r=>{
                    const showOk=amt>0&&r.fits;const showBad=amt>0&&!r.fits;
                    const brd=showOk?T.ok:showBad?T.err:T.brd;
                    return<div key={r.w.id} style={{padding:"10px 12px",borderRadius:10,border:"1px solid "+brd+(amt>0?"":"55"),background:(amt>0?(r.fits?T.ok:T.err)+"0D":T.bg+"60")}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                        <div style={{fontSize:FS,fontWeight:800,color:T.text,display:"flex",alignItems:"center",gap:6,minWidth:0}}><span>{r.w.icon||"📱"}</span><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.w.name}</span></div>
                        {amt>0&&<span style={{fontSize:FS-1,fontWeight:800,color:r.fits?T.ok:T.err,whiteSpace:"nowrap"}}>{r.fits?"✅ تقدر":"⛔ هتعدّي"}</span>}
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:FS-2,color:T.textMut,marginTop:5,gap:8,flexWrap:"wrap"}}>
                        <span>الرصيد الحالي: <b style={{color:T.text}}>{fmt0(r.bal)}</b></span>
                        <span>{r.hasCap?<>المتاح للاستقبال: <b style={{color:r.avail>0?"#0D9488":T.err}}>{fmt0(r.avail)}</b></>:<b style={{color:"#0D9488"}}>بدون حد رصيد — تستقبل أي مبلغ</b>}</span>
                      </div>
                      {showBad&&r.hasCap&&<div style={{fontSize:FS-3,color:T.err,marginTop:4,fontWeight:600}}>هيعدّي حد الرصيد ({fmt0(r.cap)}) بـ {fmt0(r.over)} ج.م</div>}
                      {/* V21.9.222: رقم المحفظة + نسخ سريع — عشان تبعته بسرعة للي هيحوّل */}
                      {r.w.walletNumber&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginTop:6,paddingTop:6,borderTop:"1px solid "+T.brd}}>
                        <span style={{fontSize:FS-2,color:T.textSec,direction:"ltr",fontWeight:700}}>📞 {r.w.walletNumber}</span>
                        <span onClick={()=>{try{navigator.clipboard.writeText(String(r.w.walletNumber));showToast("✓ تم نسخ الرقم")}catch(e){showToast("⚠️ تعذّر النسخ")}}} style={{cursor:"pointer",fontSize:FS-2,fontWeight:700,color:T.accent,background:T.accent+"12",border:"1px solid "+T.accent+"30",padding:"4px 10px",borderRadius:7,whiteSpace:"nowrap"}}>📋 نسخ الرقم</span>
                      </div>}
                    </div>;
                  })}
                  {rows.length===0&&<div style={{textAlign:"center",padding:18,color:T.textMut}}>مفيش محافظ مضافة.</div>}
                </div>
              </div>
            </div>;
          })()}
          <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"repeat(auto-fill,minmax(290px,1fr))",gap:12,marginBottom:16}}>
            {wallets.map(w=>walletCard(w))}
            {wallets.length===0&&<div style={{gridColumn:"1 / -1",textAlign:"center",padding:24,color:T.textMut,fontSize:FS-1}}>لا توجد محافظ بعد — أضف محفظة من النموذج تحت 👇</div>}
          </div>
          {canEdit&&<div style={{padding:14,borderRadius:14,background:T.bg+"60",border:"1px solid "+T.brd}}>
            <div style={{fontSize:FS-1,fontWeight:700,color:T.textSec,marginBottom:10}}>{editAccId?"✏️ تعديل محفظة":"➕ إضافة محفظة جديدة"}</div>
            <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:10}}>
              <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>اسم المحفظة</label><Inp value={newAccName} onChange={setNewAccName} placeholder="مثال: فودافون كاش - أحمد"/></div>
              <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>الرقم</label><Inp value={newAccNumber} onChange={setNewAccNumber} placeholder="01xxxxxxxxx"/></div>
              <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>حد الرصيد (ج.م)</label><Inp value={newAccBalanceCap} onChange={setNewAccBalanceCap} placeholder="200000"/></div>
              <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>حد السحب الشهري (ج.م)</label><Inp value={newAccMonthlyCap} onChange={setNewAccMonthlyCap} placeholder="200000"/></div>
              <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>حد السحب اليومي (ج.م)</label><Inp value={newAccDailyCap} onChange={setNewAccDailyCap} placeholder="60000"/></div>
              <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>رمز (إيموجي)</label><Inp value={newAccIcon} onChange={setNewAccIcon} placeholder="📱"/></div>
              <div>
                <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>صورة (اختياري)</label>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <label style={{cursor:"pointer",padding:"7px 12px",borderRadius:8,background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30",fontSize:FS-2,fontWeight:700,whiteSpace:"nowrap"}}>
                    {walletImgBusy?"⏳ ...":"📷 اختر"}
                    <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>onPickImg(e.target.files&&e.target.files[0])}/>
                  </label>
                  {newAccImage&&<img src={newAccImage} alt="" style={{width:32,height:32,borderRadius:6,objectFit:"cover",border:"1px solid "+T.brd}}/>}
                  {newAccImage&&<span onClick={()=>setNewAccImage("")} style={{cursor:"pointer",color:T.err,fontSize:FS-2}} title="إزالة الصورة">✕</span>}
                </div>
              </div>
            </div>
            {/* V21.9.204/206/215: commission tiers editor — percentage per amount bracket + optional per-tier min/max commission clamp. */}
            <div style={{marginTop:12,padding:10,borderRadius:10,background:T.cardSolid,border:"1px dashed "+T.brd}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <label style={{fontSize:FS-2,color:T.textSec,fontWeight:700}}>🏷️ شرائح العمولة (اختياري)</label>
                <span onClick={()=>setNewAccTiers([...(newAccTiers||[]),{from:"",to:"",pct:"",min:"",max:""}])} style={{cursor:"pointer",fontSize:FS-2,color:T.accent,fontWeight:700,padding:"2px 10px",borderRadius:6,background:T.accent+"10",border:"1px solid "+T.accent+"30"}}>+ شريحة</span>
              </div>
              {(newAccTiers||[]).length===0&&<div style={{fontSize:FS-3,color:T.textMut,lineHeight:1.6}}>مفيش عمولة. النسبة % من المبلغ لكل شريحة. مثال: من 0 لـ 500 → 1% · من 500 لـ 1000 → 0.75% · من 1000 لـ (فاضي=مفتوح) → 0.5%. تقدر كمان تحدّد <b>أقل/أقصى عمولة</b> لكل شريحة (اختياري — فاضي = بدون حد). بتتخصم تلقائياً عند السحب من المحفظة.</div>}
              {(newAccTiers||[]).map((t,i)=><div key={i} style={{marginBottom:8,padding:8,borderRadius:8,background:T.bg,border:"1px solid "+T.brd}}>
                <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:6}}>
                  <div style={{flex:1,minWidth:0}}><Inp type="number" value={t.from} onChange={v=>setNewAccTiers((newAccTiers||[]).map((x,j)=>j===i?{...x,from:v}:x))} placeholder="من"/></div>
                  <div style={{flex:1,minWidth:0}}><Inp type="number" value={t.to} onChange={v=>setNewAccTiers((newAccTiers||[]).map((x,j)=>j===i?{...x,to:v}:x))} placeholder="إلى (فاضي=مفتوح)"/></div>
                  <div style={{flex:1,minWidth:0}}><Inp type="number" value={t.pct} onChange={v=>setNewAccTiers((newAccTiers||[]).map((x,j)=>j===i?{...x,pct:v}:x))} placeholder="نسبة %"/></div>
                  <span onClick={()=>setNewAccTiers((newAccTiers||[]).filter((_,j)=>j!==i))} style={{cursor:"pointer",color:T.err,fontSize:FS,padding:"0 4px",flexShrink:0}} title="حذف الشريحة">🗑️</span>
                </div>
                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                  <div style={{flex:1,minWidth:0}}><Inp type="number" value={t.min} onChange={v=>setNewAccTiers((newAccTiers||[]).map((x,j)=>j===i?{...x,min:v}:x))} placeholder="أقل عمولة (اختياري)"/></div>
                  <div style={{flex:1,minWidth:0}}><Inp type="number" value={t.max} onChange={v=>setNewAccTiers((newAccTiers||[]).map((x,j)=>j===i?{...x,max:v}:x))} placeholder="أقصى عمولة (اختياري)"/></div>
                </div>
              </div>)}
            </div>
            <div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}>
              <Btn primary onClick={()=>addAccount("wallet")} disabled={!newAccName.trim()}>{editAccId?"💾 حفظ":"➕ إضافة محفظة"}</Btn>
              {editAccId&&<Btn ghost onClick={resetAccForm}>إلغاء</Btn>}
            </div>
            <div style={{fontSize:FS-3,color:T.textMut,marginTop:8,lineHeight:1.6}}>💡 المحفظة بتشتغل كخزنة منفصلة — تقدر تستلم/تصرف/تحوّل منها من التبويبات العادية. العمولة بتتخصم تلقائياً عند السحب، والحدود (الرصيد + السحب الشهري) بتتطبّق على الإضافة والتعديل والتحويل.</div>
          </div>}
        </>;
      })()}
    </div>}
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
              {/* V21.9.209: consistent stat sizing (all FS+1 + tabular-nums). */}
              <div style={{display:"flex",gap:16,marginTop:4,alignItems:"flex-end"}}>
                <div><div style={{fontSize:FS-2,color:T.textMut,marginBottom:2}}>وارد</div><div style={{fontSize:FS+1,fontWeight:700,color:T.ok,lineHeight:1.1,fontVariantNumeric:"tabular-nums"}}>{fmt0(b.in)}</div></div>
                <div><div style={{fontSize:FS-2,color:T.textMut,marginBottom:2}}>منصرف</div><div style={{fontSize:FS+1,fontWeight:700,color:T.err,lineHeight:1.1,fontVariantNumeric:"tabular-nums"}}>{fmt0(b.out)}</div></div>
                <div><div style={{fontSize:FS-2,color:T.textMut,marginBottom:2}}>الرصيد</div><div style={{fontSize:FS+1,fontWeight:800,color:bal>=0?"#0D9488":T.err,lineHeight:1.1,fontVariantNumeric:"tabular-nums"}}>{fmt0(bal)}</div></div>
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
    {showResetPopup&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:10002,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(6px)"}} onClick={()=>{setShowResetPopup(false);setResetConfirmText("")}}>
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
      /* V21.9.83 (Treasury audit Bug #1 + #4): delegate to central helper.
         Pre-V21.9.83 included settlement entries in due → inflated balance. */
      const wsBalance=(wsName)=>computeWorkshopBalance(wsName,data).balance;
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={()=>{setShowPartyPicker(null);if(!txPartyId){setTxCategory("")}}}>
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
    {showTransfer&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={()=>setShowTransfer(false)}>
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
          <Btn onClick={submitTransferWithLimits} style={{background:"#8B5CF6",color:"#fff",border:"none",fontWeight:700}}>🔄 إرسال التحويل</Btn>
        </div>
      </div>
    </div>}

    {/* V16.26: Edit confirmed transfer — same fields as create, syncs both treasury legs on save */}
    {editTf&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={()=>setEditTf(null)}>
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
    {showFirstVisitWarning&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",zIndex:10002,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={()=>setShowFirstVisitWarning(false)}>
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
    {confirmPopup&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:10001,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={()=>setConfirmPopup(null)}>
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
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:10001,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={()=>setWaPopupData(null)}>
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
