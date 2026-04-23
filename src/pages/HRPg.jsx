/* ═══════════════════════════════════════════════════════════════
   CLARK - HRPg
   
   Extracted from App.jsx in V15.0 phase 2.
   Dependencies imported explicitly — no code changes inside.
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useMemo, useRef } from "react";
import { FS, PRINT_CSS } from "../constants/index.js";
import { gid, fmt, fmt0, r2, fmtDate, hrsToHM, parseHrs } from "../utils/format.js";
import { playBeep } from "../utils/audio.js";
import { loadJsQR, scanQR, loadXLSX } from "../utils/qr.js";
import { addAudit } from "../utils/audit.js";
import { ask, showToast } from "../utils/popups.js";
import { printPage, printEmpQrCards, printSalaryEnvelopes, openPrintWindow } from "../utils/print.js";
/* V15.25: Receipt queue — persistent storage for salary confirmation scans */
import { addReceipt, removeReceipt, getPendingForWeek, getReadyForRetry, markAsFailed, getPendingCount, forceRetryAll } from "../utils/receiptQueue.js";
import { Btn, Inp, Sel, Card, QRImg, QRScanner, SearchSel, useDebounced } from "../components/ui.jsx";
import { T, TH, TD, TDB } from "../theme.js";
import { db } from "../firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { Legend } from "recharts";

export function HRPg({data,upConfig,isMob,canEdit,user,userRole,getHrSubPerm,setSavingOverlay}){
  /* V15.28: Sub-tab permissions (Separation of Duties).
     - canEditWeeks: can edit the salary table, add advances, close weeks
     - canEditVerify: can scan QR codes and confirm salary receipt
     - canEditEmployees: can add/edit employees
     - Admin is NOT exempt from cross-tab permission — separation is enforced by role.
     - However, admin IS exempt from the same-user "edit + verify" block (user's choice). */
  const _hrSub=(k)=>getHrSubPerm?getHrSubPerm(k):(canEdit?"edit":"view");
  const canEditWeeks=_hrSub("weeks")==="edit";
  const canViewWeeks=_hrSub("weeks")!=="hide";
  const canEditVerify=_hrSub("verify")==="edit";
  const canViewVerify=_hrSub("verify")!=="hide";
  const canEditEmployees=_hrSub("employees")==="edit";
  const canViewEmployees=_hrSub("employees")!=="hide";
  const canViewSecurity=_hrSub("security")!=="hide";
  /* V15.28: "isAdmin" controls the edit+verify bypass for same-user rule */
  const isAdmin=userRole==="admin";
  const userName=user?.displayName||(user?.email||"").split("@")[0];
  const employees=(data.employees||[]);
  const hrWeeks=(data.hrWeeks||[]);
  const hrLog=(data.hrLog||[]);
  const auditLog=(data.auditLog||[]);
  const activeEmps=employees.filter(e=>!e.inactive);
  const today=new Date().toISOString().split("T")[0];
  const hrs=data.hrSettings||{};
  const OT_MULT=hrs.overtimeMultiplier||1.5;
  
  /* Compute security flags for the given week (or all recent weeks if null) */
  const computeSecurityFlags=(week)=>{
    const flags=[];
    if(!week)return flags;
    const sec=data.securitySettings||{};
    /* Filter: exclude dismissed flag types for this week */
    const dismissedFor=(week.dismissedFlags||[]);
    const att=week.attendance||{};
    const wSelected=(week.selectedEmps&&Array.isArray(week.selectedEmps))?week.selectedEmps:[];
    const shownInWeek=activeEmps.filter(e=>wSelected.includes(e.id));
    const dates=[];const s=new Date(week.weekStart);const e=new Date(week.weekEnd);
    for(let d=new Date(s);d<=e;d.setDate(d.getDate()+1))dates.push(d.toISOString().split("T")[0]);
    const numDays=dates.length;
    const hoursPerDay=(week.hoursPerDay!=null?Number(week.hoursPerDay):Number(hrs.hoursPerDay))||9;
    
    /* FLAG 1: Excessive daily hours */
    if(sec.flagExcessiveHours!==false){
      const maxDaily=Number(sec.maxDailyHours)||14;
      shownInWeek.forEach(emp=>{
        dates.forEach(dt=>{const h=att[emp.id+"_"+dt]?att[emp.id+"_"+dt].hours:0;
          if(h>maxDaily)flags.push({severity:"danger",icon:"⏰",emp:emp.name,code:emp.code,
            msg:emp.name+" بصم "+hrsToHM(h)+" ساعة في يوم "+dt+" (فوق الحد "+maxDaily+")",
            type:"excessive_hours"});
        });
      });
    }
    
    /* FLAG 2: Identical hours every day */
    if(sec.flagIdenticalHours!==false){
      shownInWeek.forEach(emp=>{
        const hrsList=dates.map(dt=>att[emp.id+"_"+dt]?att[emp.id+"_"+dt].hours:0).filter(h=>h>0);
        if(hrsList.length>=4){
          const allSame=hrsList.every(h=>Math.abs(h-hrsList[0])<0.01);
          if(allSame&&hrsList[0]>0)flags.push({severity:"warning",icon:"🔄",emp:emp.name,code:emp.code,
            msg:emp.name+" ساعاته نفسها بالظبط ("+hrsToHM(hrsList[0])+") كل الأيام — مشبوه",
            type:"identical_hours"});
        }
      });
    }
    
    /* FLAG 3: Same exact hours for multiple employees */
    if(sec.flagSameHoursMultiple!==false){
      const minEmps=Number(sec.minEmpsForSameHours)||3;
      dates.forEach(dt=>{
        const empHours={};
        shownInWeek.forEach(emp=>{const h=att[emp.id+"_"+dt]?att[emp.id+"_"+dt].hours:0;if(h>0){
          const key=h.toFixed(2);if(!empHours[key])empHours[key]=[];empHours[key].push(emp);
        }});
        Object.entries(empHours).forEach(([hKey,emps])=>{
          if(emps.length>=minEmps){
            flags.push({severity:"warning",icon:"👥",emp:emps.map(e=>e.name).join(", "),
              msg:emps.length+" موظفين بنفس الساعات ("+hrsToHM(Number(hKey))+") يوم "+dt,
              type:"same_hours_multiple"});
          }
        });
      });
    }
    
    /* FLAG 4: Sudden spike */
    if(sec.flagSuddenSpike!==false){
      const spikePercent=(Number(sec.spikePercent)||50)/100;
      const prevWeeks=hrWeeks.filter(w=>w.status==="closed"&&w.weekEnd<week.weekStart).slice(0,2);
      if(prevWeeks.length>=1){
        shownInWeek.forEach(emp=>{
          let currentTotal=0;dates.forEach(dt=>{const h=att[emp.id+"_"+dt]?att[emp.id+"_"+dt].hours:0;if(h>0)currentTotal+=h});
          let prevTotal=0,prevCount=0;
          prevWeeks.forEach(pw=>{const pAtt=pw.attendance||{};let pT=0;
            const pDates=[];const ps=new Date(pw.weekStart);const pe=new Date(pw.weekEnd);
            for(let d=new Date(ps);d<=pe;d.setDate(d.getDate()+1))pDates.push(d.toISOString().split("T")[0]);
            pDates.forEach(dt=>{const h=pAtt[emp.id+"_"+dt]?pAtt[emp.id+"_"+dt].hours:0;if(h>0)pT+=h});
            if(pT>0){prevTotal+=pT;prevCount++}
          });
          if(prevCount>0&&currentTotal>0){
            const avg=prevTotal/prevCount;
            if(currentTotal>avg*(1+spikePercent)&&currentTotal-avg>10){
              flags.push({severity:"warning",icon:"📈",emp:emp.name,code:emp.code,
                msg:emp.name+" ساعاته ارتفعت فجأة: "+hrsToHM(currentTotal)+" (متوسط: "+hrsToHM(r2(avg))+")",
                type:"sudden_spike"});
            }
          }
        });
      }
    }
    
    /* FLAG 5: Recent code change */
    if(sec.flagCodeChange!==false){
      const recentCodeChanges=auditLog.filter(a=>a.category==="employee"&&a.action==="code_change"&&
        new Date(a.ts).getTime()>Date.now()-30*86400000);
      recentCodeChanges.forEach(ac=>{
        const emp=activeEmps.find(em=>em.name===ac.target);
        if(emp){
          let currentTotal=0;dates.forEach(dt=>{const h=att[emp.id+"_"+dt]?att[emp.id+"_"+dt].hours:0;if(h>0)currentTotal+=h});
          if(currentTotal>0)flags.push({severity:"danger",icon:"🔑",emp:emp.name,code:emp.code,
            msg:emp.name+" تم تغيير كوده مؤخراً ("+ac.oldValue+" → "+ac.newValue+") — تحقق من الساعات",
            type:"code_change_active"});
        }
      });
    }
    
    /* FLAG 6: High manual edit ratio */
    if(sec.flagManualEditHigh!==false){
      const threshold=(Number(sec.manualEditRatio)||30)/100;
      const auditManual=auditLog.filter(a=>a.category==="attendance"&&a.action==="manual_edit"&&
        a.target&&a.target.includes("W"+week.weekNum));
      const auditPaste=auditLog.filter(a=>a.category==="attendance"&&a.action==="paste_biometric"&&
        a.target&&a.target.includes("W"+week.weekNum));
      if(auditManual.length>0&&auditPaste.length>0){
        const ratio=auditManual.length/(auditManual.length+auditPaste.length);
        if(ratio>threshold)flags.push({severity:"warning",icon:"✏️",
          msg:"نسبة التعديل اليدوي: "+Math.round(ratio*100)+"% ("+auditManual.length+" تعديل) — فوق الحد "+(threshold*100)+"%",
          type:"manual_edit_high"});
      }
    }
    
    /* FLAG 7: Advance anomaly */
    if(sec.flagAdvanceAnomaly!==false){
      const multiplier=Number(sec.advanceMultiplier)||3;
      const wAdvs=week.weeklyAdvances||[];
      wAdvs.forEach(a=>{
        const empAdvances=hrLog.filter(l=>l.type==="weekly_advance"&&l.empId===a.empId);
        if(empAdvances.length>=3){
          const avg=empAdvances.reduce((s,l)=>s+(Number(l.amount)||0),0)/empAdvances.length;
          if(a.amount>avg*multiplier&&a.amount-avg>500){
            flags.push({severity:"warning",icon:"💸",emp:a.empName,
              msg:a.empName+" سلفة "+fmt0(a.amount)+" ج ("+multiplier+"× من متوسطه "+fmt0(r2(avg))+" ج)",
              type:"advance_anomaly"});
          }
        }
      });
    }
    
    /* FLAG 8 (NEW): High weekly overtime */
    if(sec.flagHighOvertime!==false){
      const maxOT=Number(sec.maxWeeklyOvertime)||30;
      shownInWeek.forEach(emp=>{
        const c=calcSalary(emp.id,week);
        if(c&&c.overtimeHours>maxOT){
          flags.push({severity:"warning",icon:"🌙",emp:emp.name,code:emp.code,
            msg:emp.name+" إضافي "+hrsToHM(c.overtimeHours)+" — فوق الحد "+maxOT+" ساعة",
            type:"high_overtime"});
        }
      });
    }
    
    /* FLAG 9 (NEW): Exact base hours (suspect manual entry) */
    if(sec.flagExactBaseHours===true){
      shownInWeek.forEach(emp=>{
        let exactDays=0,workDays=0;
        dates.forEach(dt=>{const h=att[emp.id+"_"+dt]?att[emp.id+"_"+dt].hours:0;
          if(h>0){workDays++;if(Math.abs(h-hoursPerDay)<0.01)exactDays++}});
        if(workDays>=4&&exactDays===workDays){
          flags.push({severity:"warning",icon:"⚡",emp:emp.name,code:emp.code,
            msg:emp.name+" ساعاته تساوي "+hoursPerDay+" ساعة بالظبط كل يوم ("+workDays+" أيام) — مشبوه",
            type:"exact_base_hours"});
        }
      });
    }
    
    /* FLAG 10 (NEW): Very few work days */
    if(sec.flagFewWorkDays!==false){
      const minDays=Number(sec.minWorkDays)||3;
      shownInWeek.forEach(emp=>{
        let workDays=0;
        dates.forEach(dt=>{const h=att[emp.id+"_"+dt]?att[emp.id+"_"+dt].hours:0;if(h>0)workDays++});
        if(workDays>0&&workDays<minDays){
          flags.push({severity:"warning",icon:"📅",emp:emp.name,code:emp.code,
            msg:emp.name+" بصم "+workDays+" يوم فقط (أقل من "+minDays+") — تحقق من الأهلية للمرتب",
            type:"few_work_days"});
        }
      });
    }
    
    /* FLAG 11 (NEW): Repeat edits on same employee */
    if(sec.flagRepeatEdits!==false){
      const maxEdits=Number(sec.maxEditsPerEmp)||3;
      const editsByEmp={};
      auditLog.filter(a=>a.category==="attendance"&&a.action==="manual_edit"&&
        a.target&&a.target.includes("W"+week.weekNum)).forEach(a=>{
        /* Extract employee name from target (format: "Name — W##") */
        const m=(a.target||"").split("—")[0].trim();
        if(!editsByEmp[m])editsByEmp[m]=0;
        editsByEmp[m]++;
      });
      Object.entries(editsByEmp).forEach(([name,count])=>{
        if(count>=maxEdits){
          flags.push({severity:"warning",icon:"🔁",emp:name,
            msg:name+" تم تعديل ساعاته "+count+" مرة يدوياً — مشبوه",
            type:"repeat_edits"});
        }
      });
    }
    
    /* FLAG 12 (NEW): Advance + hours spike combo */
    if(sec.flagAdvancePlusSpike!==false){
      const wAdvs=week.weeklyAdvances||[];
      const empsWithAdv=new Set(wAdvs.map(a=>a.empId));
      const prevWeeks=hrWeeks.filter(w=>w.status==="closed"&&w.weekEnd<week.weekStart).slice(0,2);
      if(prevWeeks.length>=1){
        empsWithAdv.forEach(empId=>{
          const emp=activeEmps.find(e=>e.id===empId);if(!emp)return;
          let currentTotal=0;dates.forEach(dt=>{const h=att[empId+"_"+dt]?att[empId+"_"+dt].hours:0;if(h>0)currentTotal+=h});
          let prevTotal=0,prevCount=0;
          prevWeeks.forEach(pw=>{const pAtt=pw.attendance||{};let pT=0;
            const pDates=[];const ps=new Date(pw.weekStart);const pe=new Date(pw.weekEnd);
            for(let d=new Date(ps);d<=pe;d.setDate(d.getDate()+1))pDates.push(d.toISOString().split("T")[0]);
            pDates.forEach(dt=>{const h=pAtt[empId+"_"+dt]?pAtt[empId+"_"+dt].hours:0;if(h>0)pT+=h});
            if(pT>0){prevTotal+=pT;prevCount++}
          });
          if(prevCount>0&&currentTotal>0){
            const avg=prevTotal/prevCount;
            if(currentTotal>avg*1.3&&currentTotal-avg>8){
              const advAmt=wAdvs.filter(a=>a.empId===empId).reduce((s,a)=>s+(Number(a.amount)||0),0);
              flags.push({severity:"danger",icon:"💰",emp:emp.name,code:emp.code,
                msg:emp.name+" أخد سلفة "+fmt0(advAmt)+" ج + ساعاته زادت ("+hrsToHM(r2(avg))+" → "+hrsToHM(currentTotal)+") — مشبوه",
                type:"advance_plus_spike"});
            }
          }
        });
      }
    }
    
    /* FLAG 13 (NEW): Mass absence on a day */
    if(sec.flagMassAbsence!==false){
      const threshold=(Number(sec.massAbsencePercent)||30)/100;
      if(shownInWeek.length>=5){/* Only meaningful if we have enough staff */
        dates.forEach(dt=>{
          /* Skip Fridays (usually off-day) */
          if(new Date(dt).getDay()===5)return;
          let absent=0;shownInWeek.forEach(emp=>{
            const h=att[emp.id+"_"+dt]?att[emp.id+"_"+dt].hours:0;
            if(h===0)absent++;
          });
          const ratio=absent/shownInWeek.length;
          if(ratio>=threshold&&absent>=3){
            flags.push({severity:"warning",icon:"🚫",
              msg:"غياب جماعي يوم "+dt+": "+absent+" من "+shownInWeek.length+" موظف غابوا ("+Math.round(ratio*100)+"%)",
              type:"mass_absence"});
          }
        });
      }
    }
    
    /* Filter out dismissed flags */
    return flags.filter(f=>!dismissedFor.includes(f.type+"|"+(f.emp||"")+"|"+(f.msg||"")));
  };
  
  /* Dismiss all flags or specific flag for the currently-open week (works from both salary page and security tab) */
  const _getActiveOpenWeek=()=>openWeek||hrWeeks.find(w=>w.status!=="closed");
  const dismissFlag=(flagKey)=>{
    const w=_getActiveOpenWeek();if(!w)return;
    upConfig(d=>{
      const wi=(d.hrWeeks||[]).findIndex(x=>x.id===w.id);if(wi<0)return;
      if(!d.hrWeeks[wi].dismissedFlags)d.hrWeeks[wi].dismissedFlags=[];
      if(!d.hrWeeks[wi].dismissedFlags.includes(flagKey))d.hrWeeks[wi].dismissedFlags.push(flagKey);
    });
    showToast("✓ تم إخفاء التنبيه");
  };
  const dismissAllFlags=()=>{
    const w=_getActiveOpenWeek();if(!w)return;
    const flags=computeSecurityFlags(w);
    if(flags.length===0)return;
    openConfirm({
      title:"تجاهل كل التنبيهات",
      message:"سيتم إخفاء "+flags.length+" تنبيه لهذا الأسبوع. لن تظهر مرة تانية حتى لو حصلت تغييرات جديدة.",
      variant:"warn",confirmText:"تجاهل الكل",
      onConfirm:()=>{
        upConfig(d=>{
          const wi=(d.hrWeeks||[]).findIndex(x=>x.id===w.id);if(wi<0)return;
          if(!d.hrWeeks[wi].dismissedFlags)d.hrWeeks[wi].dismissedFlags=[];
          flags.forEach(f=>{
            const key=f.type+"|"+(f.emp||"")+"|"+(f.msg||"");
            if(!d.hrWeeks[wi].dismissedFlags.includes(key))d.hrWeeks[wi].dismissedFlags.push(key);
          });
        });
        showToast("✓ تم تجاهل "+flags.length+" تنبيه");
      }
    });
  };
  const restoreDismissedFlags=()=>{
    const w=_getActiveOpenWeek();if(!w)return;
    upConfig(d=>{
      const wi=(d.hrWeeks||[]).findIndex(x=>x.id===w.id);if(wi<0)return;
      d.hrWeeks[wi].dismissedFlags=[];
    });
    showToast("✓ تم استعادة التنبيهات المخفية");
  };

  const[view,setView]=useState("weeks");
  const[openWeekId,setOpenWeekId]=useState(null);
  /* Employee form */
  const[showEmpForm,setShowEmpForm]=useState(false);
  const[empName,setEmpName]=useState("");const[empJob,setEmpJob]=useState("");const[empCode,setEmpCode]=useState("");
  const[empWeeklySalary,setEmpWeeklySalary]=useState("");const[empBaseHours,setEmpBaseHours]=useState("");
  const[empPhone,setEmpPhone]=useState("");const[empDate,setEmpDate]=useState(today);const[empEditId,setEmpEditId]=useState(null);
  const[empWeeklyBonus,setEmpWeeklyBonus]=useState("");
  const[empNoBiometric,setEmpNoBiometric]=useState(false);
  const[empSalaryType,setEmpSalaryType]=useState("weekly");/* weekly | monthly */
  const[empNationalId,setEmpNationalId]=useState("");/* V15.17: 14-digit national ID */
  /* Inline row edit for employee table */
  const[inlineEditId,setInlineEditId]=useState(null);
  const[inlineDraft,setInlineDraft]=useState({});
  /* Employee search filter */
  const[empSearch,setEmpSearch]=useState("");
  /* Edit employee popup — holds full employee data for editing */
  const[editPopup,setEditPopup]=useState(null);/* {id, name, code, job, weeklySalary, weeklyBonus, baseHours, phone, noBiometric, salaryType, hireDate} */
  /* Bulk import popup */
  const[showBulkImport,setShowBulkImport]=useState(false);
  const[bulkImportText,setBulkImportText]=useState("");
  const[bulkImportParsed,setBulkImportParsed]=useState(null);
  /* New week */
  const[showNewWeek,setShowNewWeek]=useState(false);
  const[nwStart,setNwStart]=useState("");const[nwEnd,setNwEnd]=useState("");const[nwBaseHours,setNwBaseHours]=useState(hrs.defaultBaseHours||48);
  /* Paste */
  const[pasteText,setPasteText]=useState("");const[pasteResult,setPasteResult]=useState(null);
  /* Matrix popup */
  const[showMatrix,setShowMatrix]=useState(false);const[matrixEmps,setMatrixEmps]=useState([]);const[matrixDate,setMatrixDate]=useState(today);const[matrixDesc,setMatrixDesc]=useState("سلفة");
  /* Salary overrides per employee in active week */
  const[salBonus,setSalBonus]=useState({});const[salSpecialDeduct,setSalSpecialDeduct]=useState({});const[salThursdayPay,setSalThursdayPay]=useState({});const[salPrevBalanceOverride,setSalPrevBalanceOverride]=useState({});const[salManualInstallDeduct,setSalManualInstallDeduct]=useState({});const[salInstallOverride,setSalInstallOverride]=useState({});
  /* V14.56: Quick entry popup for bulk data entry — {type, selected:{empId:true}, values:{empId:number}, search} */
  const[quickEntryPopup,setQuickEntryPopup]=useState(null);
  const[focusedEmpId,setFocusedEmpId]=useState(null);
  const[salSearch,setSalSearch]=useState("");const salSearchDeb=useDebounced(salSearch,200);
  const[attSearch,setAttSearch]=useState("");const attSearchDeb=useDebounced(attSearch,200);
  const[salJobFilter,setSalJobFilter]=useState("");
  const[salShowOnly,setSalShowOnly]=useState("");/* ""|"hasDeduct"|"hasBonus"|"hasInstall"|"hasBalance" */
  /* Quick advance popup from salary table — {empId, empName, amount, date, note} */
  const[quickAdvance,setQuickAdvance]=useState(null);
  const[salBaseHoursOverride,setSalBaseHoursOverride]=useState({});/* empId -> custom base hours for this week */
  const[logLimit,setLogLimit]=useState(50);
  const[openLog,setOpenLog]=useState(null);
  /* Local draft for selectedEmps. Source of truth is hrWeeks[i].selectedEmps in Firestore.
     This state holds any unsaved changes while the emp picker popup is open.
     When popup closes (by any means), we flush this draft to Firestore. */
  const[selectedEmps,setSelectedEmps]=useState({});/* weekId -> [empIds] — LOCAL DRAFT */
  /* Read selected employees for a week: local draft if exists, otherwise from Firestore */
  const getSelectedEmps=(weekId)=>{
    if(!weekId)return[];
    if(selectedEmps[weekId]!==undefined)return selectedEmps[weekId];
    const w=hrWeeks.find(x=>x.id===weekId);
    return(w&&Array.isArray(w.selectedEmps))?w.selectedEmps:[];
  };
  /* Flush pending local draft for a given week to Firestore (one write) */
  const flushSelectedEmps=(weekId)=>{
    if(!weekId)return;
    if(selectedEmps[weekId]===undefined)return;/* nothing to flush */
    const draft=selectedEmps[weekId];
    upConfig(d=>{
      if(!Array.isArray(d.hrWeeks))return;
      const i=d.hrWeeks.findIndex(w=>w.id===weekId);
      if(i<0)return;
      d.hrWeeks[i].selectedEmps=[...draft];
    });
    /* Clear the local draft after save — subsequent reads will come from Firestore */
    setSelectedEmps(p=>{const n={...p};delete n[weekId];return n});
  };
  const[editingRow,setEditingRow]=useState(null);/* empId currently being edited */
  const[rowDraft,setRowDraft]=useState({});/* temp hours while editing */
  const[salDeductReason,setSalDeductReason]=useState({});/* empId -> reason string */
  const[showEmpPicker,setShowEmpPicker]=useState(false);
  const[empPickerTab,setEmpPickerTab]=useState("weekly");/* "weekly" | "monthly" */
  /* V15.17: tentative selection for emp picker — changes don't commit until user clicks "تم" */
  const[empPickerTentative,setEmpPickerTentative]=useState(null);/* null = not open | [empIds] = current tentative */
  const[empPickerFilter,setEmpPickerFilter]=useState("");/* V15.17: search in emp picker */
  /* V15.18: Excel import states */
  const[showExcelImport,setShowExcelImport]=useState(false);
  const[excelImportStage,setExcelImportStage]=useState("upload");/* upload | preview | importing | done */
  const[excelImportData,setExcelImportData]=useState(null);/* parsed data from Excel */
  const[excelImportNewEmps,setExcelImportNewEmps]=useState({});/* code -> true (add as new employee) */
  const[excelImportError,setExcelImportError]=useState("");
  /* V15.24: Import mode — "normal" (writes to treasury/hrLog) or "analysis" (display only) */
  const[excelImportMode,setExcelImportMode]=useState("normal");
  const[showBulkPrint,setShowBulkPrint]=useState(false);
  const[bulkPrintSel,setBulkPrintSel]=useState({});/* empId -> true */
  /* Generic text popup: {title, value, onSave, placeholder, multiline} */
  const[textPopup,setTextPopup]=useState(null);const[textValue,setTextValue]=useState("");
  /* Confirm popup: {title, message, onConfirm, variant} */
  const[confirmPopup,setConfirmPopup]=useState(null);
  /* Debts management */
  const debts=(data.empDebts||[]);
  const[showDebtForm,setShowDebtForm]=useState(null);/* {empId, debtId?} */
  const[debtTitle,setDebtTitle]=useState("");const[debtTotal,setDebtTotal]=useState("");
  const[debtInstallments,setDebtInstallments]=useState("");const[debtPerWeek,setDebtPerWeek]=useState("");
  const[debtStart,setDebtStart]=useState("");const[debtNotes,setDebtNotes]=useState("");
  const[showEmpDebts,setShowEmpDebts]=useState(null);/* empId to view */
  const[unlockedWeeks,setUnlockedWeeks]=useState({});/* weekId -> true if user explicitly unlocked */
  const[previewWeekId,setPreviewWeekId]=useState(null);/* for side panel advances view */
  const[summaryWeekId,setSummaryWeekId]=useState(null);/* for weekly summary tab */
  const[selMonth,setSelMonth]=useState(()=>new Date().toISOString().slice(0,7));/* for monthly summary */
  const[empStatement,setEmpStatement]=useState(null);/* empId for statement popup */
  /* V14.57: QR receipt scanning — per-week per-employee receipt tracking */
  const[showEmpQrScanner,setShowEmpQrScanner]=useState(null);/* {weekId} for opening scanner */
  /* V15.48: Salary envelope print popup — per-week, select employees to print */
  const[envelopePopup,setEnvelopePopup]=useState(null);/* {weekId, selected:Set<empId>, filter:"all"|"unprinted"|"uncollected", search} */
  const[showEmpCardPrint,setShowEmpCardPrint]=useState(null);/* empId OR "all" for bulk */
  const[fraudListPopup,setFraudListPopup]=useState(null);/* {weekId, emps:[]} */
  /* V14.60: QR view popup (for employee who forgot card) + Fraud warning popup */
  const[empQrView,setEmpQrView]=useState(null);/* empId — show QR on screen */
  const[fraudWarning,setFraudWarning]=useState(null);/* {empName, previousAt, previousBy, attemptAt, attemptBy} */
  /* V14.61: Verify tab — dedicated screen for second accountant */
  const[verifySelectedWeekId,setVerifySelectedWeekId]=useState(null);
  const[verifyScanning,setVerifyScanning]=useState(false);
  const[verifyLastScan,setVerifyLastScan]=useState(null);/* {emp, amount, at, canUndo:true} */
  const[verifyQuickReport,setVerifyQuickReport]=useState(false);
  /* V14.63: Verify mode toggle + employee review popup */
  const[verifyMode,setVerifyMode]=useState(()=>{
    try{return localStorage.getItem("clark_verifyMode")||"detailed"}catch(e){return"detailed"}
  });/* "detailed" | "fast" */
  const[verifyReview,setVerifyReview]=useState(null);/* {emp, salary, week} — for detailed mode popup */
  /* V15.26: Amounts review checkpoint — user must confirm amounts match before scanning starts.
     Stored per-week so checkpoint is required once per week, not on every camera toggle. */
  const[verifyAmountsReviewed,setVerifyAmountsReviewed]=useState({});/* {weekId: true} */
  /* V15.25: Receipt queue UI state — reflects status of pending receipts */
  const[receiptQueueStats,setReceiptQueueStats]=useState({pending:0,failed:0,isSyncing:false});
  /* V15.25: Force re-render when queue changes (tick counter) */
  const[queueTick,setQueueTick]=useState(0);
  /* V15.25: Helper — merge Firestore receipts with pending (localStorage) receipts.
     Queue receipts take precedence (more recent). Use this EVERYWHERE instead of
     reading `week.receipts` directly, so the UI shows scans instantly. */
  const mergedReceipts=(week)=>{
    if(!week||!week.id)return{};
    const fsReceipts=week.receipts||{};
    const pending=getPendingForWeek(week.id);
    if(Object.keys(pending).length===0)return fsReceipts;
    /* Strip queue metadata from pending entries so downstream code doesn't see them */
    const cleanPending={};
    Object.keys(pending).forEach(empId=>{
      const{_queuedAt,_retries,_nextAttempt,_lastFailedAt,...clean}=pending[empId];
      cleanPending[empId]=clean;
    });
    return{...fsReceipts,...cleanPending};
  };
  /* Unused variable to tie rendering to queueTick — React will re-render when tick increments */
  // eslint-disable-next-line no-unused-vars
  const _rerenderTrigger=queueTick;
  const[stmtFrom,setStmtFrom]=useState("");const[stmtTo,setStmtTo]=useState("");
  /* Close date popup */
  const[showCloseDate,setShowCloseDate]=useState(false);
  const[closeDateValue,setCloseDateValue]=useState("");
  /* Weekly advances for salaried/admin staff — stored inline in week */
  const[showAdvForm,setShowAdvForm]=useState(false);/* true = add new */
  const[advEmpId,setAdvEmpId]=useState("");
  const[advAmount,setAdvAmount]=useState("");
  const[advDate,setAdvDate]=useState("");
  const[advNote,setAdvNote]=useState("");
  const[advSearch,setAdvSearch]=useState("");
  /* V15.27: Weekly workshop payments — planned, registered in treasury on week close */
  const[showWsPayForm,setShowWsPayForm]=useState(false);
  /* V15.72: Bulk workshop payments popup — all workshops in one table */
  const[showWsBulkPopup,setShowWsBulkPopup]=useState(false);
  const[wsBulkAmounts,setWsBulkAmounts]=useState({});/* wsName -> amount */
  const[wsBulkNote,setWsBulkNote]=useState("");
  const[wsPayWs,setWsPayWs]=useState("");
  const[wsPayAmount,setWsPayAmount]=useState("");
  const[wsPayType,setWsPayType]=useState("payment");/* payment | purchase */
  const[wsPayDate,setWsPayDate]=useState("");
  const[wsPayNote,setWsPayNote]=useState("");
  /* V15.34: Weekly other expenses — planned, registered in treasury on week close (like ws payments) */
  const[showOtherExpForm,setShowOtherExpForm]=useState(false);
  const[otherExpDate,setOtherExpDate]=useState("");
  const[otherExpCategory,setOtherExpCategory]=useState("");
  const[otherExpCategoryCustom,setOtherExpCategoryCustom]=useState("");
  const[otherExpAmount,setOtherExpAmount]=useState("");
  const[otherExpDesc,setOtherExpDesc]=useState("");
  const[otherExpAccount,setOtherExpAccount]=useState("MAIN CASH");

  const openWeek=hrWeeks.find(w=>w.id===openWeekId);
  
  /* ── Draft inputs: auto-load when week opens ── */
  const[draftLoadedForWeek,setDraftLoadedForWeek]=useState(null);
  useEffect(()=>{
    if(!openWeek||openWeek.status==="closed")return;
    if(draftLoadedForWeek===openWeek.id)return;/* already loaded for this week */
    const d=openWeek.draftInputs||{};
    setSalBonus(d.bonus||{});
    setSalSpecialDeduct(d.specialDeduct||{});
    setSalManualInstallDeduct(d.manualInstallDeduct||{});
    setSalInstallOverride(d.installOverride||{});
    setSalThursdayPay(d.thursdayPay||{});
    setSalPrevBalanceOverride(d.prevBalanceOverride||{});
    setSalDeductReason(d.deductReason||{});
    setSalBaseHoursOverride(d.baseHoursOverride||{});
    setDraftLoadedForWeek(openWeek.id);
  },[openWeek?.id,openWeek?.status]);

  /* ═══════════════════════════════════════════════════════════════
     V15.25: Receipt Queue Worker
     
     Runs every 500ms while the component is mounted. Picks up any
     receipts that are "ready for retry" (nextAttempt <= now), sends
     them to Firestore via upConfig, and updates the queue based on
     success/failure.
     
     Uses a ref to prevent concurrent worker runs — if a previous
     flush is still in progress, the next tick is skipped.
  ═══════════════════════════════════════════════════════════════ */
  const workerBusyRef=useRef(false);
  useEffect(()=>{
    /* Update stats on mount and when tick changes */
    const updateStats=()=>{
      const all=getReadyForRetry();const allPending=getPendingCount();
      const failed=all.filter(r=>(r.data._retries||0)>=3).length;
      setReceiptQueueStats({pending:allPending,failed,isSyncing:workerBusyRef.current});
    };
    updateStats();

    const interval=setInterval(async()=>{
      if(workerBusyRef.current)return;/* previous flush still running */
      const ready=getReadyForRetry();
      if(ready.length===0){updateStats();return}
      workerBusyRef.current=true;
      setReceiptQueueStats(s=>({...s,isSyncing:true}));
      try{
        /* Group by weekId so a single upConfig can flush multiple receipts at once */
        const byWeek={};
        ready.forEach(r=>{if(!byWeek[r.weekId])byWeek[r.weekId]=[];byWeek[r.weekId].push(r)});
        for(const weekId of Object.keys(byWeek)){
          const batch=byWeek[weekId];
          /* Attempt to write this batch to Firestore */
          try{
            upConfig(d=>{
              if(!Array.isArray(d.hrWeeks))return;
              const wi=d.hrWeeks.findIndex(w=>w.id===weekId);
              if(wi<0)return;
              if(!d.hrWeeks[wi].receipts)d.hrWeeks[wi].receipts={};
              if(!Array.isArray(d.auditLog))d.auditLog=[];
              batch.forEach(r=>{
                /* If the receipt already exists in Firestore (e.g. from another tab), skip */
                if(d.hrWeeks[wi].receipts[r.empId])return;
                /* Strip queue metadata before committing */
                const{_queuedAt,_retries,_nextAttempt,_lastFailedAt,...cleanData}=r.data;
                d.hrWeeks[wi].receipts[r.empId]=cleanData;
                /* Log the audit entry for this receipt */
                d.auditLog.unshift({
                  id:Math.random().toString(36).slice(2)+Date.now()+r.empId,
                  category:"week",action:"salary_receipt_verified",
                  target:"W"+(d.hrWeeks[wi].weekNum||"?")+" — "+(cleanData.empName||r.empId),
                  newValue:"✅ تأكيد استلام مرتب (من queue)",
                  notes:"المحاسب: "+(cleanData.by||"—")+" | وضع: "+(cleanData.mode||"fast")+(_retries>0?" | بعد "+_retries+" محاولة":""),
                  at:cleanData.at||new Date().toISOString(),severity:"info"
                });
              });
            });
            /* Optimistically remove from queue — upConfig is fire-and-forget but
               has its own retry/fallback path. If the network is truly down, the
               fallback setDoc will eventually succeed. */
            batch.forEach(r=>removeReceipt(r.weekId,r.empId));
          }catch(e){
            console.error("[receiptQueue] batch flush failed:",e);
            batch.forEach(r=>{
              const res=markAsFailed(r.weekId,r.empId);
              if(res.permanentlyFailed){
                showToast("⚠️ تأكيد "+(r.data.empName||r.empId)+" فشل بعد 10 محاولات");
              }
            });
          }
        }
      }finally{
        workerBusyRef.current=false;
        updateStats();
        setQueueTick(t=>t+1);
      }
    },500);
    return()=>clearInterval(interval);
  /* eslint-disable-next-line react-hooks/exhaustive-deps */
  },[]);
  
  /* ── Save draft inputs to Firebase (without closing week) ── */
  const[lastSavedAt,setLastSavedAt]=useState(null);
  const saveDraftInputs=async()=>{
    if(!openWeek||openWeek.status==="closed")return;
    /* V15.28: Track who last edited thursdayPay for each employee (for separation-of-duties enforcement).
       Compare current salThursdayPay with saved draft — mark changed employees with current user. */
    const prevDraft=openWeek.draftInputs||{};
    const prevThursday=prevDraft.thursdayPay||{};
    const prevEditedBy=prevDraft.thursdayPayLastEditedBy||{};
    const newEditedBy={...prevEditedBy};
    Object.keys(salThursdayPay).forEach(empId=>{
      const newVal=String(salThursdayPay[empId]??"");
      const oldVal=String(prevThursday[empId]??"");
      if(newVal!==oldVal&&newVal!==""){
        newEditedBy[empId]=userName||"";
      }
    });
    const draftInputs={
      bonus:salBonus,
      specialDeduct:salSpecialDeduct,
      manualInstallDeduct:salManualInstallDeduct,
      installOverride:salInstallOverride,
      thursdayPay:salThursdayPay,
      thursdayPayLastEditedBy:newEditedBy,/* V15.28 */
      prevBalanceOverride:salPrevBalanceOverride,
      deductReason:salDeductReason,
      baseHoursOverride:salBaseHoursOverride,
      lastSaved:new Date().toISOString(),
      savedBy:userName||""
    };
    upConfig(d=>{
      if(!d.hrWeeks)d.hrWeeks=[];
      const w=d.hrWeeks.find(x=>x.id===openWeek.id);
      if(w)w.draftInputs=draftInputs;
    });
    setLastSavedAt(new Date());
    showToast("✅ تم حفظ التعديلات — يمكنك العودة للتعديل لاحقاً");
  };
  
  /* Track "unsaved changes" marker: if any input differs from last saved */
  const hasUnsavedChanges=useMemo(()=>{
    if(!openWeek||openWeek.status==="closed")return false;
    const d=openWeek.draftInputs||{};
    const eq=(a,b)=>{const ak=Object.keys(a||{});const bk=Object.keys(b||{});if(ak.length!==bk.length)return false;for(const k of ak){if(String((a[k]??""))!==String((b[k]??"")))return false}return true};
    return!eq(salBonus,d.bonus||{})||!eq(salSpecialDeduct,d.specialDeduct||{})||!eq(salManualInstallDeduct,d.manualInstallDeduct||{})||!eq(salInstallOverride,d.installOverride||{})||!eq(salThursdayPay,d.thursdayPay||{})||!eq(salPrevBalanceOverride,d.prevBalanceOverride||{})||!eq(salDeductReason,d.deductReason||{})||!eq(salBaseHoursOverride,d.baseHoursOverride||{});
  },[salBonus,salSpecialDeduct,salManualInstallDeduct,salInstallOverride,salThursdayPay,salPrevBalanceOverride,salDeductReason,salBaseHoursOverride,openWeek?.draftInputs,openWeek?.status]);

  /* ── Employee CRUD ── */
  const resetEmpForm=()=>{setEmpName("");setEmpJob("");setEmpCode("");setEmpWeeklySalary("");setEmpBaseHours("");setEmpPhone("");setEmpDate(today);setEmpWeeklyBonus("");setEmpNoBiometric(false);setEmpSalaryType("weekly");setEmpNationalId("");setEmpEditId(null)};
  const saveEmp=()=>{if(!empName.trim())return;
    /* V15.17: National ID validation — must be exactly 14 digits if provided */
    const natIdClean=(empNationalId||"").replace(/\D/g,"");
    if(natIdClean&&natIdClean.length!==14){
      showToast("⚠️ الرقم القومي يجب أن يكون 14 رقم بالظبط");
      return;
    }
    /* V15.17: Phone auto-prefix +2 if not already prefixed */
    const normalizePhone=(p)=>{const s=(p||"").trim();if(!s)return"";if(s.startsWith("+"))return s;const d=s.replace(/\D/g,"");return d?"+2"+d:""};
    const phoneClean=normalizePhone(empPhone);
    upConfig(d=>{if(!d.employees)d.employees=[];
      if(empEditId){const e=d.employees.find(x=>x.id===empEditId);if(e){
        /* Audit — track code changes (fingerprint) + salary changes (high risk) */
        const oldCode=e.code||"";const newCode=empCode||"";
        const oldSalary=Number(e.weeklySalary)||0;const newSalary=parseFloat(empWeeklySalary)||0;
        if(oldCode!==newCode){
          addAudit(d,{category:"employee",action:"code_change",
            target:e.name,oldValue:oldCode||"(فارغ)",newValue:newCode||"(فارغ)",
            user:userName,severity:"danger",notes:"⚠️ تغيير كود بصمة الموظف"});
        }
        if(oldSalary!==newSalary){
          addAudit(d,{category:"employee",action:"salary_change",
            target:e.name,oldValue:fmt0(oldSalary)+" ج",newValue:fmt0(newSalary)+" ج",
            user:userName,severity:"warning",notes:"تغيير المرتب الأسبوعي"});
        }
        e.name=empName.trim();e.job=empJob;e.code=empCode;e.weeklySalary=newSalary;e.baseHours=parseFloat(empBaseHours)||0;e.phone=phoneClean;e.hireDate=empDate;e.weeklyBonus=parseFloat(empWeeklyBonus)||0;e.noBiometric=empNoBiometric;e.salaryType=empSalaryType;e.nationalId=natIdClean;
      }}
      else{
        const newEmp={id:gid(),name:empName.trim(),job:empJob,code:empCode,weeklySalary:parseFloat(empWeeklySalary)||0,baseHours:parseFloat(empBaseHours)||0,phone:phoneClean,hireDate:empDate,weeklyBonus:parseFloat(empWeeklyBonus)||0,noBiometric:empNoBiometric,salaryType:empSalaryType,nationalId:natIdClean,prevBalance:0};
        d.employees.push(newEmp);
        addAudit(d,{category:"employee",action:"add",
          target:newEmp.name,newValue:"كود: "+(newEmp.code||"-")+" • مرتب: "+fmt0(newEmp.weeklySalary),
          user:userName,severity:"info",notes:"إضافة موظف جديد"});
      }
    });
    setShowEmpForm(false);resetEmpForm();showToast("✓ تم الحفظ")};
  const editEmp=(e)=>{setEmpEditId(e.id);setEmpName(e.name);setEmpJob(e.job||"");setEmpCode(e.code||"");setEmpWeeklySalary(String(e.weeklySalary||""));setEmpBaseHours(String(e.baseHours||""));setEmpPhone(e.phone||"");setEmpDate(e.hireDate||today);setEmpWeeklyBonus(String(e.weeklyBonus||""));setEmpNoBiometric(!!e.noBiometric);setEmpSalaryType(e.salaryType||"weekly");setEmpNationalId(e.nationalId||"");setShowEmpForm(true)};
  const startInlineEdit=(e)=>{setInlineEditId(e.id);setInlineDraft({name:e.name||"",code:e.code||"",job:e.job||"",weeklySalary:String(e.weeklySalary||""),weeklyBonus:String(e.weeklyBonus||""),baseHours:String(e.baseHours||""),phone:e.phone||"",noBiometric:!!e.noBiometric})};
  const saveInlineEdit=()=>{if(!inlineEditId)return;const d=inlineDraft;
    upConfig(cfg=>{const e=(cfg.employees||[]).find(x=>x.id===inlineEditId);if(e){
      /* Audit code/salary changes */
      const oldCode=e.code||"";const newCode=d.code||"";
      const oldSalary=Number(e.weeklySalary)||0;const newSalary=parseFloat(d.weeklySalary)||0;
      if(oldCode!==newCode){
        addAudit(cfg,{category:"employee",action:"code_change",
          target:e.name,oldValue:oldCode||"(فارغ)",newValue:newCode||"(فارغ)",
          user:userName,severity:"danger",notes:"⚠️ تغيير كود بصمة"});
      }
      if(oldSalary!==newSalary){
        addAudit(cfg,{category:"employee",action:"salary_change",
          target:e.name,oldValue:fmt0(oldSalary)+" ج",newValue:fmt0(newSalary)+" ج",
          user:userName,severity:"warning",notes:"تغيير المرتب"});
      }
      e.name=(d.name||"").trim()||e.name;e.code=d.code||"";e.job=d.job||"";
      e.weeklySalary=newSalary;e.weeklyBonus=parseFloat(d.weeklyBonus)||0;
      e.baseHours=parseFloat(d.baseHours)||0;e.phone=d.phone||"";e.noBiometric=!!d.noBiometric}});
    setInlineEditId(null);setInlineDraft({});showToast("✓ تم التعديل")};
  const cancelInlineEdit=()=>{setInlineEditId(null);setInlineDraft({})};
  /* Save quick advance from salary table popup — writes to treasury + hrLog atomically */
  const saveQuickAdvance=async()=>{
    if(!quickAdvance)return;
    const amt=parseFloat(quickAdvance.amount);
    if(!amt||amt<=0){showToast("⚠️ ادخل مبلغ صحيح");playBeep("error");return}
    if(!quickAdvance.account){showToast("⚠️ اختر الخزنة");playBeep("error");return}
    const dt=quickAdvance.date||today;
    /* Validate date is within the current week boundaries (warning only, not blocking) */
    if(openWeek&&(dt<openWeek.weekStart||dt>openWeek.weekEnd)){
      /* Date is outside week — still allow but warn */
      if(!await ask("تاريخ خارج الأسبوع","التاريخ خارج نطاق الأسبوع الحالي ("+openWeek.weekStart+" → "+openWeek.weekEnd+").\n\nهل تريد المتابعة؟",{confirmText:"متابعة"}))return;
    }
    const emp=employees.find(e=>e.id===quickAdvance.empId);
    if(!emp){showToast("⚠️ الموظف غير موجود");return}
    const day=["أحد","اثنين","ثلاثاء","أربعاء","خميس","جمعة","سبت"][new Date(dt).getDay()];
    const treasuryTxId=gid();const logId=gid();
    const desc="سلفة "+emp.name+(quickAdvance.note?" — "+quickAdvance.note:"");
    upConfig(d=>{
      /* 1. Treasury entry (out) */
      if(!d.treasury)d.treasury=[];
      d.treasury.unshift({
        id:treasuryTxId,type:"out",amount:amt,desc,notes:quickAdvance.note||"",
        category:"مرتبات",account:quickAdvance.account||"MAIN CASH",season:d.activeSeason||"",
        date:dt,day,empId:emp.id,empName:emp.name,
        sourceType:"hr_advance",hrLogId:logId,
        by:userName,createdAt:new Date().toISOString()
      });
      /* 2. HR log entry (advance) */
      if(!d.hrLog)d.hrLog=[];
      d.hrLog.unshift({
        id:logId,empId:emp.id,empName:emp.name,type:"advance",
        amount:amt,date:dt,desc,
        treasuryTxId,by:userName,createdAt:new Date().toISOString()
      });
    });
    setQuickAdvance(null);
    showToast("✅ تم تسجيل سلفة "+fmt0(amt)+" ج.م لـ "+emp.name);
  };
  /* Save full employee edit from popup */
  const saveEditPopup=()=>{if(!editPopup||!editPopup.id)return;
    const d=editPopup;
    if(!d.name||!d.name.trim()){showToast("⚠️ الاسم مطلوب");return}
    upConfig(cfg=>{const e=(cfg.employees||[]).find(x=>x.id===d.id);if(e){
      e.name=d.name.trim();
      e.code=(d.code||"").trim();
      e.job=d.job||"";
      e.weeklySalary=parseFloat(d.weeklySalary)||0;
      e.weeklyBonus=parseFloat(d.weeklyBonus)||0;
      e.baseHours=parseFloat(d.baseHours)||0;
      e.phone=d.phone||"";
      e.noBiometric=!!d.noBiometric;
      e.salaryType=d.salaryType||"weekly";
      if(d.hireDate)e.hireDate=d.hireDate;
    }});
    setEditPopup(null);showToast("✓ تم التعديل")
  };
  const openEditPopup=(e)=>setEditPopup({id:e.id,name:e.name||"",code:e.code||"",job:e.job||"",weeklySalary:String(e.weeklySalary||""),weeklyBonus:String(e.weeklyBonus||""),baseHours:String(e.baseHours||""),phone:e.phone||"",noBiometric:!!e.noBiometric,salaryType:e.salaryType||"weekly",hireDate:e.hireDate||today});
  const toggleEmpActive=(id)=>{upConfig(d=>{const e=(d.employees||[]).find(x=>x.id===id);if(e)e.inactive=!e.inactive})};

  /* ── Week CRUD ── */
  const getWeekNum=(dateStr)=>{if(!dateStr)return"";const d=new Date(dateStr);const start=new Date(d.getFullYear(),0,1);return Math.ceil(((d-start)/86400000+start.getDay()+1)/7)};

  const createWeek=()=>{if(!nwStart||!nwEnd)return;
    /* Check for duplicate week with same dates */
    const dup=hrWeeks.find(w=>w.weekStart===nwStart&&w.weekEnd===nwEnd);
    if(dup){playBeep("error");showToast("⚠️ الأسبوع "+nwStart+" → "+nwEnd+" مفتوح بالفعل (W"+dup.weekNum+")");return}
    upConfig(d=>{if(!d.hrWeeks)d.hrWeeks=[];
      d.hrWeeks.unshift({id:gid(),weekNum:getWeekNum(nwStart),weekStart:nwStart,weekEnd:nwEnd,baseHours:Number(nwBaseHours)||48,attendance:{},status:"open",createdBy:userName,createdAt:new Date().toISOString()})});
    setShowNewWeek(false);showToast("✓ تم فتح الأسبوع")};

  /* ── Parse pasted fingerprint data ── */
  const parsePaste=()=>{if(!pasteText.trim()||!openWeek)return;
    const lines=pasteText.trim().split("\n").filter(l=>l.trim());
    const parsed=[];const errors=[];
    lines.forEach((line,i)=>{
      const parts=line.split("\t").map(s=>s.trim());
      if(parts.length<3){/* try comma or multiple spaces */
        const p2=line.split(/[,;]|\s{2,}/).map(s=>s.trim()).filter(Boolean);
        if(p2.length>=3){parts.length=0;parts.push(...p2)}
      }
      if(parts.length<3){if(i>0)errors.push("سطر "+(i+1)+": بيانات ناقصة");return}
      let[code,dateStr,timeStr]=parts;
      /* Clean code */
      code=code.replace(/[^0-9]/g,"");if(!code){errors.push("سطر "+(i+1)+": كود غير صالح");return}
      /* Parse date — supports DD.MM.YYYY, DD/MM/YYYY, YYYY-MM-DD */
      if(!dateStr||dateStr.toLowerCase()==="date")return;/* header row */
      let normalizedDate="";
      if(/^\d{4}-\d{2}-\d{2}$/.test(dateStr)){normalizedDate=dateStr}
      else if(/^\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4}$/.test(dateStr)){
        const parts_=dateStr.split(/[.\/-]/);const dd=parts_[0].padStart(2,"0");const mm=parts_[1].padStart(2,"0");const yyyy=parts_[2];
        normalizedDate=yyyy+"-"+mm+"-"+dd}
      else if(/^\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2}$/.test(dateStr)){
        const parts_=dateStr.split(/[.\/-]/);const dd=parts_[0].padStart(2,"0");const mm=parts_[1].padStart(2,"0");const yy=parts_[2];const yyyy="20"+yy;
        normalizedDate=yyyy+"-"+mm+"-"+dd}
      else{errors.push("سطر "+(i+1)+": تاريخ غير معروف ("+dateStr+")");return}
      /* Parse time — could be HH:MM (e.g. 13:57) or decimal hours (e.g. 8.5) */
      const hours=parseHrs(timeStr);
      if(hours<=0)return;
      /* Find employee by code */
      const emp=employees.find(e=>String(e.code)===String(code));
      parsed.push({code,date:normalizedDate,hours:r2(hours),empId:emp?emp.id:null,empName:emp?emp.name:"❓ كود "+code,matched:!!emp})
    });
    /* Group by employee+date */
    const grouped={};parsed.forEach(p=>{const k=p.code+"_"+p.date;if(!grouped[k])grouped[k]={...p};else grouped[k].hours=r2(grouped[k].hours+p.hours)});
    setPasteResult({records:Object.values(grouped),errors,total:Object.values(grouped).length,matched:Object.values(grouped).filter(r=>r.matched).length,unmatched:Object.values(grouped).filter(r=>!r.matched).length})};

  const applyPaste=()=>{if(!pasteResult||!openWeek)return;
    upConfig(d=>{const wi=(d.hrWeeks||[]).findIndex(w=>w.id===openWeekId);if(wi<0)return;
      if(!d.hrWeeks[wi].attendance)d.hrWeeks[wi].attendance={};
      pasteResult.records.filter(r=>r.matched).forEach(r=>{
        const key=r.empId+"_"+r.date;d.hrWeeks[wi].attendance[key]={empId:r.empId,date:r.date,hours:r.hours}});
      /* Audit — paste operation with summary */
      addAudit(d,{
        category:"attendance",action:"paste_biometric",
        target:"W"+d.hrWeeks[wi].weekNum,
        newValue:pasteResult.matched+" سجل مُطابق / "+pasteResult.total+" إجمالي",
        user:userName,severity:"info",
        notes:"لصق بيانات البصمة"+(pasteResult.unmatched>0?" ⚠️ "+pasteResult.unmatched+" غير مطابق":"")
      });
      /* Auto-fill noBiometric employees with full daily hours for each day in the week */
      const wk=d.hrWeeks[wi];const bh=wk.baseHours||48;
      const start=new Date(wk.weekStart);const end=new Date(wk.weekEnd);
      const numDays=Math.round((end-start)/86400000)+1;
      const dailyHours=r2(bh/numDays);
      (d.employees||[]).filter(e=>e.noBiometric&&!e.inactive).forEach(e=>{
        for(let dd=new Date(start);dd<=end;dd.setDate(dd.getDate()+1)){
          const ds=dd.toISOString().split("T")[0];const key=e.id+"_"+ds;
          if(!wk.attendance[key])wk.attendance[key]={empId:e.id,date:ds,hours:dailyHours}}})});
    setPasteText("");setPasteResult(null);showToast("✓ تم استيراد "+pasteResult.matched+" سجل بصمة"+(employees.filter(e=>e.noBiometric&&!e.inactive).length>0?" + موظفين بدون بصمة":""))};

  /* ── Manual attendance edit ── */
  const setWeekHours=(empId,date,hours)=>{
    upConfig(d=>{const wi=(d.hrWeeks||[]).findIndex(w=>w.id===openWeekId);if(wi<0)return;
      if(!d.hrWeeks[wi].attendance)d.hrWeeks[wi].attendance={};
      const key=empId+"_"+date;
      d.hrWeeks[wi].attendance[key]={empId,date,hours:parseFloat(hours)||0}})};

  /* ── Week base hours edit ── */
  const setWeekBaseHours=(hours)=>{upConfig(d=>{const wi=(d.hrWeeks||[]).findIndex(w=>w.id===openWeekId);if(wi<0)return;d.hrWeeks[wi].baseHours=Number(hours)||48})};

  /* ── Advances (single + matrix) ── */
  const addAdvance=(empId,amount,desc)=>{if(!amount)return;const emp=employees.find(e=>e.id===empId);if(!emp)return;
    upConfig(d=>{if(!d.hrLog)d.hrLog=[];
      const logId=gid();
      d.hrLog.unshift({id:logId,type:"advance",empId,empName:emp.name,amount:Number(amount),desc:desc||"سلفة",weekId:openWeekId||"",date:today,by:userName,createdAt:new Date().toISOString()});
      d.treasury.unshift({id:gid(),type:"out",amount:Number(amount),desc:"سلفة "+emp.name+(desc?" — "+desc:""),category:"مرتبات",account:"SUB CASH",season:d.activeSeason||"",date:today,day:["أحد","اثنين","ثلاثاء","أربعاء","خميس","جمعة","سبت"][new Date().getDay()],sourceType:"hr_advance",hrLogId:logId,empId,by:userName,createdAt:new Date().toISOString()})});
    showToast("✓ سلفة "+emp.name)};
  const submitMatrix=()=>{const items=matrixEmps.filter(m=>m.amount>0);if(items.length===0)return;
    upConfig(d=>{if(!d.hrLog)d.hrLog=[];if(!d.treasury)d.treasury=[];
      items.forEach(m=>{const emp=employees.find(e=>e.id===m.empId);if(!emp)return;
        const logId=gid();
        d.hrLog.unshift({id:logId,type:"advance",empId:m.empId,empName:emp.name,amount:m.amount,desc:matrixDesc||"سلفة",weekId:openWeekId||"",date:matrixDate,by:userName,createdAt:new Date().toISOString()});
        d.treasury.unshift({id:gid(),type:"out",amount:m.amount,desc:"سلفة "+emp.name+(matrixDesc?" — "+matrixDesc:""),category:"مرتبات",account:"SUB CASH",season:d.activeSeason||"",date:matrixDate,day:["أحد","اثنين","ثلاثاء","أربعاء","خميس","جمعة","سبت"][new Date(matrixDate).getDay()],sourceType:"hr_advance",hrLogId:logId,empId:m.empId,by:userName,createdAt:new Date().toISOString()})})});
    showToast("✓ "+items.length+" دفعة");setShowMatrix(false);setMatrixEmps([])};

  /* ── Salary Calc for a week ── */
  const calcSalary=(empId,week)=>{if(!week)return null;
    const emp=employees.find(e=>e.id===empId);if(!emp)return null;
    const weeklySalary=emp.weeklySalary||0;
    /* V15.26 FIX: Choose draft source based on whether this is the currently-open week.
       BEFORE THIS FIX: calcSalary always read from React state (salBonus, salThursdayPay, etc.)
       When called from OUTSIDE the open-week screen (e.g. verify tab), React state was empty
       → all overrides were ignored → wrong amounts shown on scan.
       AFTER FIX: If `week` IS the currently-open week, use React state (live edits).
                  Otherwise, read from `week.draftInputs` stored in Firestore. */
    const _isLive=openWeek&&week.id===openWeek.id&&draftLoadedForWeek===week.id;
    const _src=_isLive?{
      baseHoursOverride:salBaseHoursOverride,
      prevBalanceOverride:salPrevBalanceOverride,
      bonus:salBonus,
      specialDeduct:salSpecialDeduct,
      manualInstallDeduct:salManualInstallDeduct,
      installOverride:salInstallOverride,
      thursdayPay:salThursdayPay,
    }:{
      baseHoursOverride:(week.draftInputs||{}).baseHoursOverride||{},
      prevBalanceOverride:(week.draftInputs||{}).prevBalanceOverride||{},
      bonus:(week.draftInputs||{}).bonus||{},
      specialDeduct:(week.draftInputs||{}).specialDeduct||{},
      manualInstallDeduct:(week.draftInputs||{}).manualInstallDeduct||{},
      installOverride:(week.draftInputs||{}).installOverride||{},
      thursdayPay:(week.draftInputs||{}).thursdayPay||{},
    };
    /* Per-employee base hours override, then week default */
    const overrideH=_src.baseHoursOverride[empId];
    const baseHours=(overrideH!==undefined&&overrideH!=="")?Number(overrideH)||0:(week.baseHours||48);
    /* Hour rate is calculated from STANDARD work week (days × hours/day).
       Priority: week-level override → HR settings → defaults (6×9).
       This allows per-week adjustments (e.g., Ramadan, holidays) without changing global settings. */
    const stdDays=Number(week.workDays)||Number(hrs.workDays)||6;
    const stdHoursPerDay=(week.hoursPerDay!=null?Number(week.hoursPerDay):Number(hrs.hoursPerDay))||9;
    const standardWeekHours=stdDays*stdHoursPerDay;
    const perHour=standardWeekHours>0?r2(weeklySalary/standardWeekHours):0;
    /* Get attendance from week */
    const att=week.attendance||{};
    const days=[];let totalHours=0;let workDays=0;
    const start=new Date(week.weekStart);const end=new Date(week.weekEnd);
    for(let d=new Date(start);d<=end;d.setDate(d.getDate()+1)){
      const ds=d.toISOString().split("T")[0];const key=empId+"_"+ds;
      const h=att[key]?att[key].hours:0;days.push({date:ds,hours:h});
      if(h>0){totalHours+=h;workDays++}}
    const basicHours=Math.min(totalHours,baseHours);const overtimeHours=Math.max(0,totalHours-baseHours);
    const basicPay=r2(basicHours*perHour);const overtimePay=r2(overtimeHours*perHour*OT_MULT);const grossPay=r2(basicPay+overtimePay);
    /* Prev balance: use manual override (from _src, respects openWeek vs other weeks) */
    const manualPrevBal=_src.prevBalanceOverride[empId];
    const prevBalance=(manualPrevBal!==undefined&&manualPrevBal!=="")?(Number(manualPrevBal)||0):(Number(emp.prevBalance)||0);
    const prevBalanceIsManual=(manualPrevBal!==undefined&&manualPrevBal!=="")&&(Number(manualPrevBal)!==Number(emp.prevBalance||0));
    /* Advances for this week:
       - Strategy: union of everything in date range, dedupe by hrLogId
       - hrLog advance entries (primary source)
       - treasury entries marked as hr_advance (captures cases where hrLog wasn't written)
       - treasury entries in category "مرتبات" with empId set (legacy) */
    const inWeek=(dt)=>dt&&dt>=week.weekStart&&dt<=week.weekEnd;
    const logAdvances=hrLog.filter(l=>l.type==="advance"&&l.empId===empId&&(l.weekId===week.id||inWeek(l.date)));
    const seenLogIds=new Set(logAdvances.map(l=>l.id));
    const treasuryAdvances=(data.treasury||[]).filter(t=>
      t.empId===empId&&
      t.type==="out"&&
      inWeek(t.date)&&
      !seenLogIds.has(t.hrLogId)&&
      (t.sourceType==="hr_advance"||t.category==="مرتبات"));
    const weekAdvances=logAdvances.reduce((s,l)=>s+(Number(l.amount)||0),0)+treasuryAdvances.reduce((s,t)=>s+(Number(t.amount)||0),0);
    /* Bonus: use manual override (from _src, respects openWeek vs other weeks) */
    const manualBonus=_src.bonus[empId];
    const bonus=(manualBonus!==undefined&&manualBonus!=="")?(Number(manualBonus)||0):(Number(emp.weeklyBonus)||0);
    const specialDeduct=Number(_src.specialDeduct[empId])||0;
    /* Debt installment due this week (smart capped: can't exceed what's available after other deductions) */
    const debtInfo=empDebtInstallment(empId,week);
    /* Manual direct deduction — used when employee has NO active debts but needs a one-time deduction */
    const manualInstallDeduct=(debtInfo.total===0)?(Number(_src.manualInstallDeduct[empId])||0):0;
    /* Install override — user may pay partial (or 0 = skip) */
    const installOverrideRaw=_src.installOverride[empId];
    const hasInstallOverride=(installOverrideRaw!==undefined&&installOverrideRaw!=="");
    const installOverrideValue=hasInstallOverride?(Number(installOverrideRaw)||0):null;
    /* V15.20 FIX: netBalance does NOT include prevBalance.
       prevBalance stays separate and is only shown as informational in the popup.
       Per user's clarification (W16 Ahmed Karim example):
       - Basic 800 + Overtime 136 + Bonus 200 - Advances 70 = netBalance 1,066
       - Accountant pays thursdayPay = 1,000 (no change)
       - remainingBalance = netBalance - thursdayPay = 66 (carries to next week as prevBalance)
       - prevBalance (65 from previous week) is shown separately but NOT added to this week's payment.
       
       This matches the Excel "صافي" column which = grossPay - deductions + bonus (no prevBalance). */
    const availableAfterBasics=r2(grossPay-weekAdvances-specialDeduct+bonus);
    /* Cap installment at available amount (if negative, skip) */
    let debtInstall;
    if(debtInfo.total>0){
      /* Has debt installment: apply override if set, else use full perWeek */
      const requested=hasInstallOverride?installOverrideValue:debtInfo.total;
      debtInstall=availableAfterBasics>0?Math.min(requested,availableAfterBasics):0;
    }else{
      /* No debt: use manual direct deduction */
      debtInstall=manualInstallDeduct;
    }
    /* Carried = original perWeek total - what was actually paid (positive means deferred to next weeks) */
    const debtCarried=r2(Math.max(0,debtInfo.total-debtInstall));
    const isPartialInstall=debtInfo.total>0&&debtInstall<debtInfo.total&&debtInstall>0;
    const isSkippedInstall=debtInfo.total>0&&debtInstall===0&&hasInstallOverride;
    const netBalance=r2(availableAfterBasics-debtInstall);
    /* V15.21 FINAL FIX: The correct model for محمود ربيع W16 example:
       - netBalance = 4,002 (this week's earnings after deductions, WITHOUT prevBalance)
       - prevBalance = 30 (carried from W15, still owed)
       - totalDue (what employee SHOULD receive) = netBalance + prevBalance = 4,032
       - thursdayPay = 4,000 (what accountant actually pays — cash constraint)
       - remainingBalance (carries to W17) = totalDue - thursdayPay = 32
       
       So: netBalance is PURE this week. prevBalance is SEPARATE CARRY. 
       totalDue = their SUM (the amount employee is actually owed right now).
       remainingBalance = whatever of totalDue wasn't paid. */
    const totalDue=r2(netBalance+prevBalance);
    /* Thursday cash payment — default to totalDue (what employee is owed total) */
    const thursdayPay=_src.thursdayPay[empId]!==undefined&&_src.thursdayPay[empId]!==""?Number(_src.thursdayPay[empId])||0:totalDue;
    /* remainingBalance = totalDue - thursdayPay (what carries to next week as new prevBalance) */
    const remainingBalance=r2(totalDue-thursdayPay);
    return{weeklySalary,baseHours,perHour,workDays,totalHours,basicHours,overtimeHours,basicPay,overtimePay,grossPay,prevBalance,prevBalanceIsManual,weekAdvances,bonus,specialDeduct,debtInstall,debtCarried,debtItems:debtInfo.items,debtInfoTotal:debtInfo.total,manualInstallDeduct,isPartialInstall,isSkippedInstall,netBalance,totalDue,thursdayPay,remainingBalance,days}};

  /* ═══ V14.55: Read salary row from closedRecords snapshot if week is closed ═══
     This ensures closed weeks display their ORIGINAL values at close time,
     regardless of any subsequent changes to advances, deductions, prevBalance, etc. */
  const getEmpSalary=(empId,week)=>{
    if(!week)return null;
    /* For closed weeks with snapshot: use saved record */
    if(week.status==="closed"&&Array.isArray(week.closedRecords)){
      const saved=week.closedRecords.find(r=>r.empId===empId);
      if(saved){
        /* Return saved record with `days` calculated from attendance (for display only) */
        const att=week.attendance||{};
        const days=[];
        const start=new Date(week.weekStart);const end=new Date(week.weekEnd);
        for(let d=new Date(start);d<=end;d.setDate(d.getDate()+1)){
          const ds=d.toISOString().split("T")[0];const key=empId+"_"+ds;
          const h=att[key]?att[key].hours:0;days.push({date:ds,hours:h});
        }
        return{...saved,days};
      }
    }
    /* For open weeks OR closed without snapshot: fall back to live calc */
    return calcSalary(empId,week);
  };

  /* ── Weekly Advances (for monthly/admin staff) ── */
  const weeklyAdvances=openWeek?(openWeek.weeklyAdvances||[]):[];
  const totalWeeklyAdvances=weeklyAdvances.reduce((s,a)=>s+(Number(a.amount)||0),0);
  const resetAdvForm=()=>{setAdvEmpId("");setAdvAmount("");setAdvDate(openWeek?.weekStart||today);setAdvNote("");setAdvSearch("")};
  const saveWeeklyAdvance=()=>{
    if(!openWeek||!advEmpId||!advAmount)return;
    const emp=employees.find(e=>e.id===advEmpId);if(!emp)return;
    const amt=Number(advAmount)||0;if(amt<=0)return;
    /* Warning for unusually large advance (> 50% of weekly salary) */
    const weeklySalary=Number(emp.weeklySalary)||0;
    if(weeklySalary>0&&amt>weeklySalary*0.5){
      openConfirm({
        title:"⚠️ مبلغ السلفة كبير",
        message:"السلفة ("+fmt0(amt)+" ج) أكبر من 50% من مرتب "+emp.name+" الأسبوعي ("+fmt0(weeklySalary)+" ج).\n\nهل أنت متأكد من المبلغ؟",
        variant:"warn",confirmText:"نعم، متأكد",
        onConfirm:()=>_doSaveWeeklyAdvance(emp,amt)
      });
      return;
    }
    _doSaveWeeklyAdvance(emp,amt);
  };
  const _doSaveWeeklyAdvance=(emp,amt)=>{
    const advId=gid();
    const useDateSave=advDate||today;
    upConfig(d=>{
      const wi=(d.hrWeeks||[]).findIndex(w=>w.id===openWeek.id);if(wi<0)return;
      if(!d.hrWeeks[wi].weeklyAdvances)d.hrWeeks[wi].weeklyAdvances=[];
      /* Planned advance — NOT recorded in treasury until week is closed.
         This is just a plan/draft that will be executed on week closure. */
      d.hrWeeks[wi].weeklyAdvances.push({
        id:advId,empId:emp.id,empName:emp.name,empJob:emp.job||"",
        amount:amt,date:useDateSave,note:advNote||"",
        createdBy:userName||"",createdAt:new Date().toISOString(),
        planned:true/* Flag: will be registered in treasury on week close */
      });
      /* Audit log */
      addAudit(d,{
        category:"advance",action:"add_weekly",
        target:emp.name+" — W"+d.hrWeeks[wi].weekNum,
        newValue:fmt0(amt)+" ج"+(advNote?" ("+advNote+")":""),
        user:userName,severity:amt>1000?"warning":"info",
        notes:"سلفة أسبوعية (خطة — ستُسجَّل في الخزنة عند الإقفال)"
      });
    });
    setShowAdvForm(false);resetAdvForm();showToast("✓ تم إضافة السلفة للخطة");
  };
  const deleteWeeklyAdvance=(advId)=>{
    if(!openWeek)return;
    const adv=(openWeek.weeklyAdvances||[]).find(a=>a.id===advId);
    /* Some legacy advances may still have treasuryTxId (registered in old system) */
    const linkedTx=adv&&adv.treasuryTxId?(data.treasury||[]).find(t=>t.id===adv.treasuryTxId):null;
    openConfirm({
      title:"حذف السلفة",
      message:adv?"هل أنت متأكد من حذف سلفة "+adv.empName+" ("+fmt0(adv.amount)+" ج)؟"+(linkedTx?"\n\n⚠️ هذه السلفة مسجلة في الخزنة (نظام قديم) — سيتم حذف الحركة المالية المرتبطة.":""):"هل أنت متأكد من حذف هذه السلفة؟",
      variant:"warn",confirmText:"حذف",
      onConfirm:()=>{upConfig(d=>{
        const wi=(d.hrWeeks||[]).findIndex(w=>w.id===openWeek.id);if(wi<0)return;
        if(!d.hrWeeks[wi].weeklyAdvances)return;
        d.hrWeeks[wi].weeklyAdvances=d.hrWeeks[wi].weeklyAdvances.filter(a=>a.id!==advId);
        /* Legacy cleanup: if this advance was registered in treasury (old system), reverse it */
        if(adv){
          if(adv.treasuryTxId&&d.treasury)d.treasury=d.treasury.filter(t=>t.id!==adv.treasuryTxId);
          if(d.hrLog)d.hrLog=d.hrLog.filter(l=>l.weeklyAdvanceId!==advId);
          addAudit(d,{
            category:"advance",action:"delete_weekly",
            target:adv.empName+" — W"+d.hrWeeks[wi].weekNum,
            oldValue:fmt0(adv.amount)+" ج"+(adv.note?" ("+adv.note+")":""),
            user:userName,severity:"danger",
            notes:"حذف سلفة أسبوعية من الخطة"
          });
        }
      });showToast("✓ تم الحذف")}
    });
  };

  /* ═════════════════════════════════════════════════════════════════
     V15.27: Weekly Workshop Payments
     
     Planned payments to external workshops, registered in treasury
     ONLY on week close (same pattern as weeklyAdvances).
     Stored in openWeek.weeklyWsPayments[].
  ═════════════════════════════════════════════════════════════════ */
  const weeklyWsPayments=openWeek?(openWeek.weeklyWsPayments||[]):[];
  const totalWeeklyWsPayments=weeklyWsPayments.reduce((s,p)=>s+(Number(p.amount)||0),0);
  const workshopsList=(data.workshops||[]);
  /* wsIsInternal inlined — mirrors the helper in ExtProdPg */
  const _wsIsExternal=(wsName)=>{const w=workshopsList.find(x=>x.name===wsName);if(!w)return true;const t=w.type||"";return t!=="internal"&&t!==""};
  /* Calculate workshop TOTAL balance up to now (across all time) */
  const wsTotalBalance=(wsName)=>{
    if(!wsName)return{due:0,paid:0,balance:0};
    let due=0;
    (data.orders||[]).forEach(o=>{
      (o.workshopDeliveries||[]).filter(wd=>wd.wsName===wsName).forEach(wd=>{
        (wd.receives||[]).forEach(r=>{due+=r2((Number(r.qty)||0)*(Number(r.price)||0))})
      })
    });
    const payments=(data.wsPayments||[]).filter(p=>p.wsName===wsName);
    const paid=payments.filter(p=>p.type==="payment").reduce((s,p)=>s+(Number(p.amount)||0),0);
    const purchase=payments.filter(p=>p.type==="purchase").reduce((s,p)=>s+(Number(p.amount)||0),0);
    return{due:r2(due),paid:r2(paid),purchase:r2(purchase),balance:r2(due+purchase-paid)};
  };
  /* V15.62: Workshop weekly available — based on the payment percentage limit.
     Returns the maximum amount allowed to pay this week within the agreed percentage,
     minus what's already been paid. This tells the user "how much can I pay now?"
     
     Formula:
       limit = (due + purchase) × payPercent / 100
       available = limit - paid
   */
  const wsWeekDue=(wsName,week)=>{
    if(!wsName)return 0;
    const wsObj=(data.workshops||[]).find(w=>w.name===wsName);
    const pct=(wsObj&&Number(wsObj.payPercent))||60;
    let due=0;
    (data.orders||[]).forEach(o=>{
      (o.workshopDeliveries||[]).filter(wd=>wd.wsName===wsName).forEach(wd=>{
        (wd.receives||[]).forEach(r=>{
          due+=r2((Number(r.qty)||0)*(Number(r.price)||0));
        });
      });
    });
    const payments=(data.wsPayments||[]).filter(p=>p.wsName===wsName);
    const paid=payments.filter(p=>p.type==="payment").reduce((s,p)=>s+(Number(p.amount)||0),0);
    const purchase=payments.filter(p=>p.type==="purchase").reduce((s,p)=>s+(Number(p.amount)||0),0);
    const limit=r2((due+purchase)*pct/100);
    return r2(Math.max(0,limit-paid));
  };
  const resetWsPayForm=()=>{setWsPayWs("");setWsPayAmount("");setWsPayType("payment");setWsPayDate(openWeek?.weekStart||today);setWsPayNote("")};
  const saveWeeklyWsPayment=()=>{
    if(!openWeek||!wsPayWs||!wsPayAmount)return;
    const amt=Number(wsPayAmount)||0;if(amt<=0){showToast("⚠️ المبلغ لازم يكون أكبر من صفر");return}
    const wsObj=workshopsList.find(w=>w.name===wsPayWs);
    if(!wsObj){showToast("⚠️ الورشة غير موجودة");return}
    const bal=wsTotalBalance(wsPayWs);
    /* Warning if amount exceeds current balance (only for "payment" type) */
    if(wsPayType==="payment"&&bal.balance>=0&&amt>bal.balance){
      openConfirm({
        title:"⚠️ المبلغ أكبر من رصيد الورشة",
        message:"الدفعة ("+fmt0(amt)+" ج) أكبر من رصيد الورشة الحالي ("+fmt0(bal.balance)+" ج).\n\nهل أنت متأكد من المبلغ؟",
        variant:"warn",confirmText:"نعم، متأكد",
        onConfirm:()=>_doSaveWeeklyWsPayment(wsObj,amt)
      });
      return;
    }
    _doSaveWeeklyWsPayment(wsObj,amt);
  };
  const _doSaveWeeklyWsPayment=(wsObj,amt)=>{
    const payId=gid();
    const useDateSave=wsPayDate||openWeek.weekStart||today;
    upConfig(d=>{
      const wi=(d.hrWeeks||[]).findIndex(w=>w.id===openWeek.id);if(wi<0)return;
      if(!d.hrWeeks[wi].weeklyWsPayments)d.hrWeeks[wi].weeklyWsPayments=[];
      /* Planned ws payment — NOT in treasury until week close */
      d.hrWeeks[wi].weeklyWsPayments.push({
        id:payId,wsName:wsObj.name,wsId:wsObj.id||null,
        amount:amt,type:wsPayType,date:useDateSave,note:wsPayNote||"",
        createdBy:userName||"",createdAt:new Date().toISOString(),
        planned:true/* Flag: will be registered in treasury on week close */
      });
      addAudit(d,{
        category:"ws_payment",action:"add_weekly",
        target:wsObj.name+" — W"+d.hrWeeks[wi].weekNum,
        newValue:fmt0(amt)+" ج "+(wsPayType==="payment"?"(دفعة)":"(مشتريات)")+(wsPayNote?" — "+wsPayNote:""),
        user:userName,severity:amt>5000?"warning":"info",
        notes:"دفعة ورشة أسبوعية (خطة — ستُسجَّل في الخزنة عند الإقفال)"
      });
    });
    setShowWsPayForm(false);resetWsPayForm();showToast("✓ تم إضافة الدفعة للخطة");
  };
  const deleteWeeklyWsPayment=(payId)=>{
    if(!openWeek)return;
    const pay=(openWeek.weeklyWsPayments||[]).find(p=>p.id===payId);
    if(!pay)return;
    openConfirm({
      title:"حذف دفعة الورشة",
      message:"هل تريد حذف دفعة "+pay.wsName+" ("+fmt0(pay.amount)+" ج) من الخطة؟",
      variant:"warn",confirmText:"حذف",
      onConfirm:()=>{upConfig(d=>{
        const wi=(d.hrWeeks||[]).findIndex(w=>w.id===openWeek.id);if(wi<0)return;
        if(!d.hrWeeks[wi].weeklyWsPayments)return;
        d.hrWeeks[wi].weeklyWsPayments=d.hrWeeks[wi].weeklyWsPayments.filter(p=>p.id!==payId);
        addAudit(d,{
          category:"ws_payment",action:"delete_weekly",
          target:pay.wsName+" — W"+d.hrWeeks[wi].weekNum,
          oldValue:fmt0(pay.amount)+" ج",
          user:userName,severity:"danger",
          notes:"حذف دفعة ورشة أسبوعية من الخطة"
        });
      });showToast("✓ تم الحذف")}
    });
  };

  /* V15.72: Bulk save all workshop payments at once from the popup.
     V15.74: Changed behavior from APPEND to REPLACE for planned payments —
     prevents duplication when editing the popup. Purchases (type==="purchase")
     and already-registered payments (treasuryTxId exists) are preserved. */
  const saveBulkWsPayments=()=>{
    if(!openWeek)return;
    const useDateSave=openWeek.weekStart||today;
    const toSave=[];
    Object.entries(wsBulkAmounts).forEach(([wsName,val])=>{
      const amt=Number(val)||0;if(amt<=0)return;
      const wsObj=workshopsList.find(w=>w.name===wsName);
      if(!wsObj)return;
      toSave.push({wsObj,amt});
    });
    upConfig(d=>{
      const wi=(d.hrWeeks||[]).findIndex(w=>w.id===openWeek.id);if(wi<0)return;
      const existing=d.hrWeeks[wi].weeklyWsPayments||[];
      /* V15.74: Keep purchases + already-registered payments, replace planned payments only */
      const kept=existing.filter(p=>p.type!=="payment"||p.treasuryTxId);
      const prevPlanned=existing.filter(p=>p.type==="payment"&&!p.treasuryTxId);
      const prevCount=prevPlanned.length;
      const prevTotal=prevPlanned.reduce((s,p)=>s+(Number(p.amount)||0),0);
      /* Build new planned payments */
      const newPayments=toSave.map(({wsObj,amt})=>({
        id:gid(),wsName:wsObj.name,wsId:wsObj.id||null,
        amount:amt,type:"payment",date:useDateSave,note:wsBulkNote||"",
        createdBy:userName||"",createdAt:new Date().toISOString(),
        planned:true
      }));
      const newTotal=toSave.reduce((s,{amt})=>s+amt,0);
      d.hrWeeks[wi].weeklyWsPayments=[...kept,...newPayments];
      /* Audit — only log if something actually changed */
      const changed=prevCount!==toSave.length||Math.abs(prevTotal-newTotal)>0.5;
      if(changed||toSave.length>0){
        addAudit(d,{
          category:"ws_payment",action:prevCount>0?"update_bulk":"add_bulk",
          target:"W"+d.hrWeeks[wi].weekNum,
          oldValue:prevCount>0?prevCount+" ورشة — إجمالي "+fmt0(prevTotal)+" ج":"لا يوجد",
          newValue:toSave.length+" ورشة — إجمالي "+fmt0(newTotal)+" ج"+(wsBulkNote?" — "+wsBulkNote:""),
          user:userName,severity:newTotal>20000?"warning":"info",
          notes:prevCount>0?"تحديث دفعات ورش جماعية (استبدال الخطة)":"إضافة دفعات ورش جماعية (خطة)"
        });
      }
    });
    setShowWsBulkPopup(false);
    setWsBulkAmounts({});setWsBulkNote("");
    showToast(toSave.length>0?"✓ تم حفظ "+toSave.length+" دفعة":"✓ تم مسح كل الدفعات المخططة");
  };

  /* V15.34: Weekly other expenses — planned, registered in treasury on week close */
  const weeklyOtherExpenses=openWeek?(openWeek.weeklyOtherExpenses||[]):[];
  const totalWeeklyOtherExpenses=weeklyOtherExpenses.reduce((s,e)=>s+(Number(e.amount)||0),0);
  const resetOtherExpForm=()=>{setOtherExpDate(openWeek?.weekStart||today);setOtherExpCategory("");setOtherExpCategoryCustom("");setOtherExpAmount("");setOtherExpDesc("");setOtherExpAccount("MAIN CASH")};
  const saveWeeklyOtherExp=()=>{
    if(!openWeek)return;
    const amt=Number(otherExpAmount)||0;
    if(amt<=0){showToast("⚠️ المبلغ لازم يكون أكبر من صفر");return}
    const finalCat=(otherExpCategory==="__custom__"?otherExpCategoryCustom.trim():otherExpCategory).trim();
    if(!finalCat){showToast("⚠️ التصنيف مطلوب");return}
    const useDateSave=otherExpDate||openWeek.weekStart||today;
    const expId=gid();
    upConfig(d=>{
      const wi=(d.hrWeeks||[]).findIndex(w=>w.id===openWeek.id);if(wi<0)return;
      if(!d.hrWeeks[wi].weeklyOtherExpenses)d.hrWeeks[wi].weeklyOtherExpenses=[];
      d.hrWeeks[wi].weeklyOtherExpenses.push({
        id:expId,date:useDateSave,category:finalCat,amount:amt,
        desc:otherExpDesc||"",account:otherExpAccount||"MAIN CASH",
        createdBy:userName||"",createdAt:new Date().toISOString(),
        planned:true/* Flag: will be registered in treasury on week close */
      });
      addAudit(d,{
        category:"other_expense",action:"add_weekly",
        target:finalCat+" — W"+d.hrWeeks[wi].weekNum,
        newValue:fmt0(amt)+" ج"+(otherExpDesc?" — "+otherExpDesc:""),
        user:userName,severity:amt>5000?"warning":"info",
        notes:"مصروف أسبوعي (خطة — سيُسجَّل في الخزنة عند الإقفال)"
      });
    });
    setShowOtherExpForm(false);resetOtherExpForm();showToast("✓ تم إضافة المصروف للخطة");
  };
  const deleteWeeklyOtherExp=(expId)=>{
    if(!openWeek)return;
    const exp=(openWeek.weeklyOtherExpenses||[]).find(e=>e.id===expId);
    if(!exp)return;
    openConfirm({
      title:"حذف المصروف",
      message:"هل تريد حذف مصروف "+exp.category+" ("+fmt0(exp.amount)+" ج) من الخطة؟",
      variant:"warn",confirmText:"حذف",
      onConfirm:()=>{upConfig(d=>{
        const wi=(d.hrWeeks||[]).findIndex(w=>w.id===openWeek.id);if(wi<0)return;
        if(!d.hrWeeks[wi].weeklyOtherExpenses)return;
        d.hrWeeks[wi].weeklyOtherExpenses=d.hrWeeks[wi].weeklyOtherExpenses.filter(e=>e.id!==expId);
        addAudit(d,{
          category:"other_expense",action:"delete_weekly",
          target:exp.category+" — W"+d.hrWeeks[wi].weekNum,
          oldValue:fmt0(exp.amount)+" ج",
          user:userName,severity:"danger",
          notes:"حذف مصروف أسبوعي من الخطة"
        });
      });showToast("✓ تم الحذف")}
    });
  };

  /* ── Approve & Close Week ── */
  /* V14.66: Pre-approval receipt check popup */
  const[preApprovalBlocker,setPreApprovalBlocker]=useState(null);/* {week, notSigned:[], customCloseDate} */
  const[overrideConfirmText,setOverrideConfirmText]=useState("");
  /* V14.66: Wrapper — checks all employees signed before approval. If not, shows blocker popup. */
  const tryApproveWeek=(customCloseDate)=>{
    if(!openWeek||openWeek.status==="closed")return;
    const weekSelected=getSelectedEmps(openWeek.id);
    const wkEmps=activeEmps.filter(e=>weekSelected.includes(e.id));
    /* V15.25: Use merged receipts so pending scans count as signed */
    const receipts=mergedReceipts(openWeek);
    const notSigned=wkEmps.filter(e=>!receipts[e.id]);
    if(notSigned.length===0){
      /* All signed — proceed */
      approveWeek(customCloseDate);
      return;
    }
    /* Some haven't signed — block and show popup */
    setOverrideConfirmText("");
    setPreApprovalBlocker({week:openWeek,notSigned,customCloseDate:customCloseDate||""});
  };
  const approveWeek=(customCloseDate,overrideReason)=>{if(!openWeek||openWeek.status==="closed")return;
    /* V15.27: Check for potential duplicate ws payments — same workshop + date range
       already has a DIRECT payment in treasury + a PLANNED payment in this week.
       Block approval until user confirms (safer default). */
    const _wsPays=(openWeek.weeklyWsPayments||[]).filter(p=>!p.treasuryTxId);
    if(_wsPays.length>0){
      const _duplicates=[];
      _wsPays.forEach(p=>{
        /* Look for existing treasury entries for the same workshop within the week range */
        const existing=(data.treasury||[]).filter(t=>
          t.type==="out"&&
          t.wsName===p.wsName&&
          t.sourceType&&(t.sourceType==="ws_payment"||t.sourceType==="hr_weekly_ws_payment")&&
          t.weekId!==openWeek.id&&/* not already from this week's earlier close attempt */
          t.date>=openWeek.weekStart&&t.date<=openWeek.weekEnd
        );
        if(existing.length>0){
          _duplicates.push({planned:p,existing:existing.map(t=>({amount:t.amount,date:t.date,desc:t.desc}))});
        }
      });
      if(_duplicates.length>0&&!overrideReason){
        /* Show blocker popup */
        let msg="⚠️ تحذير: يوجد احتمال تكرار دفعات ورش\n\n";
        _duplicates.forEach(d=>{
          msg+="🏭 "+d.planned.wsName+"\n";
          msg+="  • دفعة مخططة: "+fmt0(d.planned.amount)+" ج (جديدة)\n";
          d.existing.forEach(e=>{
            msg+="  • مسجلة مسبقاً: "+fmt0(e.amount)+" ج — "+e.date+"\n";
          });
          msg+="\n";
        });
        msg+="هل تريد المتابعة وتسجيل الدفعات المخططة؟ (سيكون هناك تكرار في الخزنة)";
        openConfirm({
          title:"⚠️ تكرار محتمل في دفعات الورش",
          message:msg,
          variant:"danger",confirmText:"نعم، سجّل رغم التكرار",
          onConfirm:()=>approveWeek(customCloseDate,"user_confirmed_ws_payment_duplicates")
        });
        return;
      }
    }
    const actualCloseDate=new Date().toISOString().split("T")[0];/* The REAL date, not editable */
    const actualCloseTs=new Date().toISOString();
    const useDate=(customCloseDate&&customCloseDate.trim())?customCloseDate.trim():actualCloseDate;
    const weekSelected=getSelectedEmps(openWeek.id);
    const shownEmps=activeEmps.filter(e=>weekSelected.includes(e.id));
    const records=shownEmps.map(e=>{const c=calcSalary(e.id,openWeek);if(!c)return null;return{empId:e.id,empName:e.name,empCode:e.code||"",...c}}).filter(Boolean);
    if(records.length===0)return;
    const totalNet=records.reduce((s,r)=>s+r.netBalance,0);
    const totalGross=records.reduce((s,r)=>s+r.grossPay,0);
    const totalThursdayPay=records.reduce((s,r)=>s+r.thursdayPay,0);
    const totalRemaining=records.reduce((s,r)=>s+r.remainingBalance,0);
    /* ═══════════════════════════════════════════════════════════════════
       🛡️ PRE-APPROVAL SNAPSHOT
       
       Save a complete snapshot of the state BEFORE the week is closed.
       This allows the user to restore the week to its pre-closure state
       during the SAME DAY (safety cutoff — after that, too much may have
       changed downstream to safely restore).
       
       Snapshot contains everything we'd need to reverse:
       • weekData        — full openWeek object (attendance, baseHours, etc)
       • empBalances     — each affected employee's prevBalance before update
       • debtsState      — each affected debt's paidWeekIds before update
       • records         — computed salary records (for audit)
       ═══════════════════════════════════════════════════════════════════ */
    const snapshotId="pre-approval-"+openWeek.id+"-"+Date.now();
    const empBalancesBefore={};records.forEach(r=>{empBalancesBefore[r.empId]=r.prevBalance||0});
    const debtIds=new Set();records.forEach(r=>{(r.debtItems||[]).forEach(di=>{if(di&&di.id)debtIds.add(di.id)})});
    const debtsStateBefore={};debts.forEach(d=>{if(debtIds.has(d.id))debtsStateBefore[d.id]={paidWeekIds:[...(d.paidWeekIds||[])],status:d.status||"active"}});
    const snapshot={
      id:snapshotId,type:"pre-approval",weekId:openWeek.id,weekNum:openWeek.weekNum,
      weekStart:openWeek.weekStart,weekEnd:openWeek.weekEnd,
      savedAt:new Date().toISOString(),savedAtDate:today,savedBy:userName||user?.email||"",
      weekData:JSON.parse(JSON.stringify(openWeek)),
      empBalancesBefore,debtsStateBefore,
      records:JSON.parse(JSON.stringify(records)),
      totals:{totalNet:r2(totalNet),totalGross:r2(totalGross),totalThursdayPay:r2(totalThursdayPay),totalRemaining:r2(totalRemaining)}
    };
    /* Save snapshot to Firestore (non-blocking — proceed with approval even if snapshot fails) */
    setDoc(doc(db,"backups",snapshotId),snapshot).then(()=>{
      }).catch(e=>{
      console.error("⚠️ Snapshot save failed (approval will continue):",e);
    });
    /* Show overlay */
    if(setSavingOverlay)setSavingOverlay({message:"جاري حفظ نسخة احتياطية...",progress:5});
    setTimeout(()=>{
    if(setSavingOverlay)setSavingOverlay({message:"جاري تسجيل مرتبات "+records.length+" موظف...",progress:20});
    setTimeout(()=>{
    if(setSavingOverlay)setSavingOverlay({message:"جاري حساب المرتبات والخصومات...",progress:40});
    setTimeout(()=>{
    if(setSavingOverlay)setSavingOverlay({message:"جاري تسجيل الحركات في الخزنة...",progress:60});
    setTimeout(()=>{
    upConfig(d=>{if(!d.hrLog)d.hrLog=[];if(!d.treasury)d.treasury=[];if(!d.empDebts)d.empDebts=[];
      /* V15.24: Analysis-only week — SKIP all hrLog/treasury writes + prevBalance updates.
         Snapshot (closedRecords) is still saved inside the week itself for display. */
      const isAnalysisWeek=!!openWeek.isAnalysisOnly;
      if(isAnalysisWeek){
        /* Skip all hrLog/treasury/prevBalance updates. Jump to week-closure snapshot below. */
      }else{
      /* Log each salary */
      records.forEach(r=>{d.hrLog.unshift({id:gid(),type:"salary",empId:r.empId,empName:r.empName,amount:r.netBalance,grossPay:r.grossPay,weeklySalary:r.weeklySalary,prevBalance:r.prevBalance,prevBalanceManualOverride:!!r.prevBalanceIsManual,overtimePay:r.overtimePay||0,weekAdvances:r.weekAdvances,bonus:r.bonus,specialDeduct:r.specialDeduct,deductReason:salDeductReason[r.empId]||"",debtInstall:r.debtInstall,debtItems:r.debtItems,thursdayPay:r.thursdayPay,remainingBalance:r.remainingBalance,weekId:openWeek.id,weekStart:openWeek.weekStart,weekEnd:openWeek.weekEnd,date:today,by:userName,createdAt:new Date().toISOString(),snapshotId})});
      /* Record debt installments — supports full/partial/skip
         - Full payment: debtInstall === debtInfoTotal → mark week as paid (paidWeekIds)
         - Partial: debtInstall > 0 AND < debtInfoTotal → split pro-rata between debts, 
                    add to paidWeekIds + track in partialPayments
         - Skip (0): don't touch the debt — week NOT counted, carries to future weeks */
      records.forEach(r=>{
        if(!r.debtItems||r.debtItems.length===0)return;
        if(r.debtInstall<=0)return;/* skipped — nothing to record */
        /* Calculate total perWeek across all this employee's debts */
        const totalPerWeek=r.debtItems.reduce((s,di)=>s+(Number(di.perWeek)||0),0);
        if(totalPerWeek<=0)return;
        /* Distribute debtInstall proportionally across debts */
        r.debtItems.forEach(di=>{
          const debt=d.empDebts.find(x=>x.id===di.id);if(!debt)return;
          const ratio=(Number(di.perWeek)||0)/totalPerWeek;
          const portionForThisDebt=r2(r.debtInstall*ratio);
          if(portionForThisDebt<=0)return;
          if(!debt.paidWeekIds)debt.paidWeekIds=[];
          if(!debt.partialPayments)debt.partialPayments={};/* weekId → amount paid (if partial) */
          if(debt.paidWeekIds.includes(openWeek.id))return;/* already recorded */
          debt.paidWeekIds.push(openWeek.id);
          /* If this was a partial payment, store the shortage */
          const expectedForThisWeek=Number(di.perWeek)||0;
          if(portionForThisDebt<expectedForThisWeek){
            debt.partialPayments[openWeek.id]={
              paid:portionForThisDebt,
              expected:expectedForThisWeek,
              shortage:r2(expectedForThisWeek-portionForThisDebt)
            };
            /* Extend installments: add extra weeks to cover the shortage */
            const extraInstallments=Math.ceil(r2(expectedForThisWeek-portionForThisDebt)/(Number(debt.perWeek)||1));
            debt.installments=(debt.installments||0)+extraInstallments;
          }
          /* Check if fully paid: sum all actual payments vs debt.total */
          const totalPaid=r2(debt.paidWeekIds.reduce((s,wid)=>{
            const pp=(debt.partialPayments||{})[wid];
            return s+(pp?Number(pp.paid)||0:(Number(debt.perWeek)||0));
          },0));
          if(totalPaid>=(Number(debt.total)||0)-0.5){debt.status="paid";debt.paidAt=today}
        });
      });
      /* Update balances — remaining balance carries to next week */
      records.forEach(r=>{const e=(d.employees||[]).find(x=>x.id===r.empId);if(e)e.prevBalance=r.remainingBalance});
      /* Treasury — individual entry per employee (thursday pay). Uses useDate (editable close date). */
      const dayName=["أحد","اثنين","ثلاثاء","أربعاء","خميس","جمعة","سبت"][new Date(useDate).getDay()];
      records.forEach(r=>{if(r.thursdayPay>0)d.treasury.unshift({id:gid(),type:"out",amount:r2(r.thursdayPay),desc:"مرتب "+r.empName+" W"+openWeek.weekNum,category:"مرتبات",account:"SUB CASH",season:d.activeSeason||"",date:useDate,day:dayName,sourceType:"hr_salary",weekId:openWeek.id,empId:r.empId,by:userName,createdAt:new Date().toISOString(),snapshotId,actualCloseDate,backdated:useDate!==actualCloseDate})});
      /* Weekly advances (planned) — register in treasury + hrLog NOW at week closure.
         Legacy advances that were already registered (treasuryTxId exists) are just tagged with snapshotId. */
      const wAdvs=(openWeek.weeklyAdvances||[]);
      wAdvs.forEach(a=>{
        if(a.treasuryTxId&&d.treasury){
          /* Legacy advance — already in treasury, just tag for rollback support */
          const tx=d.treasury.find(t=>t.id===a.treasuryTxId);
          if(tx)tx.snapshotId=snapshotId;
        }else{
          /* New planned advance — register in treasury on close */
          const advTxId=gid();
          const advDayName=["أحد","اثنين","ثلاثاء","أربعاء","خميس","جمعة","سبت"][new Date(a.date||useDate).getDay()];
          d.treasury.unshift({
            id:advTxId,type:"out",amount:r2(Number(a.amount)||0),
            desc:"سلفة "+a.empName+" W"+openWeek.weekNum+(a.note?" — "+a.note:""),
            category:"مرتبات",account:"SUB CASH",season:d.activeSeason||"",
            date:a.date||useDate,day:advDayName,
            sourceType:"hr_weekly_advance",weekId:openWeek.id,empId:a.empId,
            weeklyAdvanceId:a.id,
            by:userName,createdAt:new Date().toISOString(),snapshotId,actualCloseDate,backdated:useDate!==actualCloseDate
          });
          d.hrLog.unshift({
            id:gid(),type:"weekly_advance",empId:a.empId,empName:a.empName,empJob:a.empJob||"",
            amount:Number(a.amount)||0,note:a.note||"",
            weekId:openWeek.id,weekStart:openWeek.weekStart,weekEnd:openWeek.weekEnd,
            date:a.date||useDate,by:userName,createdAt:new Date().toISOString(),
            weeklyAdvanceId:a.id,treasuryTxId:advTxId,snapshotId
          });
          /* Link back: store txId on the advance itself so delete after close can reverse */
          const wiUpd=(d.hrWeeks||[]).findIndex(w=>w.id===openWeek.id);
          if(wiUpd>=0){const advUpd=(d.hrWeeks[wiUpd].weeklyAdvances||[]).find(x=>x.id===a.id);
            if(advUpd){advUpd.treasuryTxId=advTxId;advUpd.planned=false}}
        }
      });
      /* V15.27: Weekly Workshop Payments — register planned ws payments in treasury + data.wsPayments */
      const wWsPays=(openWeek.weeklyWsPayments||[]);
      wWsPays.forEach(p=>{
        if(p.treasuryTxId&&d.treasury){
          /* Already registered earlier — tag with snapshotId for rollback */
          const tx=d.treasury.find(t=>t.id===p.treasuryTxId);
          if(tx)tx.snapshotId=snapshotId;
        }else{
          const wsPayId=gid();const wsTxId=gid();
          const wsDayName=["أحد","اثنين","ثلاثاء","أربعاء","خميس","جمعة","سبت"][new Date(p.date||useDate).getDay()];
          if(!Array.isArray(d.wsPayments))d.wsPayments=[];
          /* Register in data.wsPayments (this is how ExtProdPg reads them) */
          d.wsPayments.push({
            id:wsPayId,wsName:p.wsName,wsId:p.wsId||null,
            amount:Number(p.amount)||0,type:p.type||"payment",
            notes:p.note||"",date:p.date||useDate,
            createdBy:userName||"",treasuryTxId:wsTxId,
            sourceWeekId:openWeek.id,/* V15.27: link back to week for cascade delete */
          });
          /* Register in treasury */
          d.treasury.unshift({
            id:wsTxId,type:"out",amount:r2(Number(p.amount)||0),
            desc:(p.type==="payment"?"دفعة ورشة ":"مشتريات ورشة ")+p.wsName+" W"+openWeek.weekNum+(p.note?" — "+p.note:""),
            category:p.type==="payment"?"تشغيل خارجي":"مشتريات",
            account:"SUB CASH",season:d.activeSeason||"",
            date:p.date||useDate,day:wsDayName,
            sourceType:"hr_weekly_ws_payment",weekId:openWeek.id,
            wsName:p.wsName,wsPaymentId:wsPayId,
            by:userName,createdAt:new Date().toISOString(),snapshotId,actualCloseDate,backdated:useDate!==actualCloseDate
          });
          /* Link back: mark as registered on the planned entry */
          const wiUpd=(d.hrWeeks||[]).findIndex(w=>w.id===openWeek.id);
          if(wiUpd>=0){const pUpd=(d.hrWeeks[wiUpd].weeklyWsPayments||[]).find(x=>x.id===p.id);
            if(pUpd){pUpd.treasuryTxId=wsTxId;pUpd.wsPaymentId=wsPayId;pUpd.planned=false}}
        }
      });
      /* V15.34: Weekly Other Expenses — register planned expenses in treasury (NOT in wsPayments) */
      const wOtherExps=(openWeek.weeklyOtherExpenses||[]);
      wOtherExps.forEach(ex=>{
        if(ex.treasuryTxId&&d.treasury){
          /* Already registered earlier — tag with snapshotId for rollback */
          const tx=d.treasury.find(t=>t.id===ex.treasuryTxId);
          if(tx)tx.snapshotId=snapshotId;
        }else{
          const exTxId=gid();
          const exDayName=["أحد","اثنين","ثلاثاء","أربعاء","خميس","جمعة","سبت"][new Date(ex.date||useDate).getDay()];
          /* Register in treasury as a regular expense (NOT in wsPayments) */
          d.treasury.unshift({
            id:exTxId,type:"out",amount:r2(Number(ex.amount)||0),
            desc:"مصروف — "+ex.category+" W"+openWeek.weekNum+(ex.desc?" — "+ex.desc:""),
            category:ex.category||"مصاريف أخرى",
            account:ex.account||"MAIN CASH",season:d.activeSeason||"",
            date:ex.date||useDate,day:exDayName,
            sourceType:"hr_other_expense",weekId:openWeek.id,
            by:userName,createdAt:new Date().toISOString(),snapshotId,actualCloseDate,backdated:useDate!==actualCloseDate
          });
          /* Link back: mark as registered on the planned entry */
          const wiUpd=(d.hrWeeks||[]).findIndex(w=>w.id===openWeek.id);
          if(wiUpd>=0){const exUpd=(d.hrWeeks[wiUpd].weeklyOtherExpenses||[]).find(x=>x.id===ex.id);
            if(exUpd){exUpd.treasuryTxId=exTxId;exUpd.planned=false}}
        }
      });
      }/* V15.24: end of non-analysis block — analysis week skips all treasury/hrLog/prevBalance updates */
      /* Close week — store BOTH user-selected date (closedAt) AND actual close date (actualClosedAt, immutable) */
      const wi=(d.hrWeeks||[]).findIndex(w=>w.id===openWeek.id);if(wi>=0){
        d.hrWeeks[wi].status="closed";
        d.hrWeeks[wi].closedAt=useDate;/* User-selected close date (can be backdated) */
        d.hrWeeks[wi].actualClosedAt=actualCloseDate;/* REAL close date — immutable, for audit */
        d.hrWeeks[wi].actualClosedTs=actualCloseTs;/* Timestamp with time */
        d.hrWeeks[wi].closedBy=userName;
        /* V14.66: Track if closed with override (some employees didn't sign) */
        if(overrideReason){
          d.hrWeeks[wi].closedWithOverride=true;
          d.hrWeeks[wi].overrideReason=overrideReason;
          /* Audit entry — danger severity */
          if(!Array.isArray(d.auditLog))d.auditLog=[];
          d.auditLog.unshift({
            id:Math.random().toString(36).slice(2)+Date.now(),
            category:"week",
            action:"approval_without_verification",
            target:"W"+openWeek.weekNum+" ("+openWeek.weekStart+" → "+openWeek.weekEnd+")",
            newValue:"🚨 إقفال بدون توقيعات مكتملة",
            notes:"تم الإقفال رغم وجود موظفين لم يوقعوا — المبرر: "+overrideReason+" — بواسطة: "+(userName||"—"),
            at:new Date().toISOString(),severity:"danger"
          });
        }
        d.hrWeeks[wi].totalGross=r2(totalGross);
        d.hrWeeks[wi].totalNet=r2(totalNet);
        d.hrWeeks[wi].totalThursdayPay=r2(totalThursdayPay);
        d.hrWeeks[wi].totalRemaining=r2(totalRemaining);
        d.hrWeeks[wi].totalWeeklyAdvances=r2(wAdvs.reduce((s,a)=>s+(Number(a.amount)||0),0));
        d.hrWeeks[wi].empCount=records.length;
        d.hrWeeks[wi].snapshotId=snapshotId;
        d.hrWeeks[wi].snapshotDate=actualCloseDate;
        /* ═══ V14.53: SAVE ALL 8 CARDS snapshot — to prevent future edits from changing closed week display ═══ */
        const _baseSal=records.reduce((s,r)=>{const e=(d.employees||[]).find(x=>x.id===r.empId);return s+((e?.weeklySalary)||0)},0);
        const _basicEntitled=records.reduce((s,r)=>s+(r.basicPay||0),0);
        const _overtimePay=records.reduce((s,r)=>s+(r.overtimePay||0),0);
        const _grossPay=records.reduce((s,r)=>s+(r.grossPay||0),0);
        const _advances=records.reduce((s,r)=>s+(r.weekAdvances||0),0);
        const _deductions=records.reduce((s,r)=>s+(r.debtInstall||0),0);
        const _specialDeductions=records.reduce((s,r)=>s+(r.specialDeduct||0),0);
        const _totalWeeklyAdv=r2(wAdvs.reduce((s,a)=>s+(Number(a.amount)||0),0));
        const _thursdayPaySum=records.reduce((s,r)=>s+(r.thursdayPay||0),0);
        /* V15.27: snapshot ws payments totals */
        const _wWsPays=(d.hrWeeks[wi].weeklyWsPayments||[]);
        const _totalWsPay=r2(_wWsPays.reduce((s,p)=>s+(Number(p.amount)||0),0));
        d.hrWeeks[wi].totalWeeklyWsPayments=_totalWsPay;
        /* V15.34: snapshot other expenses totals */
        const _wOtherExps=(d.hrWeeks[wi].weeklyOtherExpenses||[]);
        const _totalOtherExps=r2(_wOtherExps.reduce((s,e)=>s+(Number(e.amount)||0),0));
        d.hrWeeks[wi].totalWeeklyOtherExpenses=_totalOtherExps;
        d.hrWeeks[wi].closedStats={
          baseSal:r2(_baseSal),
          basicEntitled:r2(_basicEntitled),
          overtimePay:r2(_overtimePay),
          grossPay:r2(_grossPay),
          advances:r2(_advances),
          deductions:r2(_deductions),
          specialDeductions:r2(_specialDeductions),
          totalWeeklyAdvances:_totalWeeklyAdv,
          totalWeeklyWsPayments:_totalWsPay,/* V15.27 */
          weeklyWsPaymentsCount:_wWsPays.length,/* V15.27 */
          totalWeeklyOtherExpenses:_totalOtherExps,/* V15.34 */
          weeklyOtherExpensesCount:_wOtherExps.length,/* V15.34 */
          thursdayPay:r2(_thursdayPaySum),
          finalTotal:r2(_thursdayPaySum+_totalWeeklyAdv+_totalWsPay+_totalOtherExps),/* V15.34: include other expenses */
          empCount:records.length,
          weeklyAdvancesCount:wAdvs.length,
          savedAt:actualCloseTs
        };
        /* ═══ V14.55: SAVE closedRecords — full salary table snapshot per employee ═══
           This prevents any future edits (advances, deductions, etc.) from changing
           the displayed values in a closed week's salary table. */
        d.hrWeeks[wi].closedRecords=records.map(r=>({
          empId:r.empId,
          empName:r.empName,
          empCode:r.empCode||"",
          weeklySalary:r.weeklySalary||0,
          baseHours:r.baseHours||0,
          perHour:r.perHour||0,
          totalHours:r.totalHours||0,
          basicHours:r.basicHours||0,
          overtimeHours:r.overtimeHours||0,
          basicPay:r2(r.basicPay||0),
          overtimePay:r2(r.overtimePay||0),
          grossPay:r2(r.grossPay||0),
          prevBalance:r2(r.prevBalance||0),
          prevBalanceIsManual:!!r.prevBalanceIsManual,
          weekAdvances:r2(r.weekAdvances||0),
          bonus:r2(r.bonus||0),
          specialDeduct:r2(r.specialDeduct||0),
          deductReason:salDeductReason[r.empId]||"",
          debtInstall:r2(r.debtInstall||0),
          debtCarried:r2(r.debtCarried||0),
          debtInfoTotal:r2(r.debtInfoTotal||0),
          manualInstallDeduct:r.manualInstallDeduct,
          isPartialInstall:!!r.isPartialInstall,
          isSkippedInstall:!!r.isSkippedInstall,
          netBalance:r2(r.netBalance||0),
          thursdayPay:r2(r.thursdayPay||0),
          remainingBalance:r2(r.remainingBalance||0),
          /* Keep debt items snapshot for display */
          debtItems:Array.isArray(r.debtItems)?r.debtItems.map(d=>({...d})):[]
        }));
        /* Audit — week closure — always logs the REAL actual date */
        const backdated=useDate!==actualCloseDate;
        const isAnalysisClose=!!d.hrWeeks[wi].isAnalysisOnly;
        addAudit(d,{category:"week",action:isAnalysisClose?"close_analysis":"close",
          target:"W"+d.hrWeeks[wi].weekNum+" ("+d.hrWeeks[wi].weekStart+" → "+d.hrWeeks[wi].weekEnd+")"+(isAnalysisClose?" [تحليلي]":""),
          newValue:records.length+" موظف • مستحق: "+fmt0(totalGross)+" • مدفوع: "+fmt0(totalThursdayPay)+(backdated?" ⚠️ مُرحَّل لتاريخ "+useDate:"")+(isAnalysisClose?" (تحليلي — لم يؤثر على الخزنة)":""),
          user:userName,severity:backdated?"warning":"info",
          notes:backdated?"⚠️ إقفال بتاريخ مختلف عن التاريخ الحقيقي ("+actualCloseDate+")":"إقفال أسبوع"});
      }});
    showToast("✓ تم اعتماد وقفل الأسبوع W"+openWeek.weekNum);setSalBonus({});setSalSpecialDeduct({});setSalThursdayPay({});setSalBaseHoursOverride({});setSalPrevBalanceOverride({});setSalManualInstallDeduct({});setSalInstallOverride({});setOpenWeekId(null);
    if(setSavingOverlay){setSavingOverlay({message:"✅ تم بنجاح!",progress:100});setTimeout(()=>setSavingOverlay(null),1200)}
    },200)},400)},300)},200)};

  /* ═══════════════════════════════════════════════════════════════════
     V14.53 MIGRATION: Compute closedStats for legacy closed weeks
     
     For weeks that were closed BEFORE V14.53 (no closedStats field),
     compute snapshot ONCE based on current data. This freezes the values
     so subsequent edits don't affect the display.
     
     Strategy: use simplified calc (without local state overrides like
     salBonus/salThursdayPay). For legacy closed weeks, those overrides
     were cleared at close time anyway.
     ═══════════════════════════════════════════════════════════════════ */
  useEffect(()=>{
    if(!canEdit)return;
    const legacyWeeks=hrWeeks.filter(w=>w.status==="closed"&&!w.closedStats);
    if(legacyWeeks.length===0)return;
    /* Compute synchronously and update */
    upConfig(d=>{
      (d.hrWeeks||[]).forEach((w,wi)=>{
        if(w.status!=="closed"||w.closedStats)return;/* skip already-migrated */
        const weekSelected=(w.selectedEmps&&Array.isArray(w.selectedEmps))?w.selectedEmps:[];
        const shownEmps=(d.employees||[]).filter(e=>!e.inactive&&weekSelected.includes(e.id));
        /* Simplified salary calc for legacy closed weeks — no state overrides */
        const stdDays=Number(w.workDays)||Number((d.hrSettings||{}).workDays)||6;
        const stdHoursPerDay=(w.hoursPerDay!=null?Number(w.hoursPerDay):Number((d.hrSettings||{}).hoursPerDay))||9;
        const stdWeekHours=stdDays*stdHoursPerDay;
        const baseHrs=w.baseHours||48;
        const otMult=(d.hrSettings||{}).overtimeMultiplier||1.5;
        const att=w.attendance||{};
        let baseSal=0,basicEntitled=0,overtimePay=0,grossPay=0;
        let advances=0,deductions=0,specialDeductions=0,thursdayPay=0;
        shownEmps.forEach(e=>{
          const ws=e.weeklySalary||0;
          baseSal+=ws;
          const perHr=stdWeekHours>0?ws/stdWeekHours:0;
          /* Sum hours from attendance */
          let totalHours=0;
          const start=new Date(w.weekStart);const end=new Date(w.weekEnd);
          for(let dt=new Date(start);dt<=end;dt.setDate(dt.getDate()+1)){
            const ds=dt.toISOString().split("T")[0];const key=e.id+"_"+ds;
            if(att[key])totalHours+=(att[key].hours||0);
          }
          const basicHrs=Math.min(totalHours,baseHrs);
          const overHrs=Math.max(0,totalHours-baseHrs);
          const bp=basicHrs*perHr,op=overHrs*perHr*otMult;
          basicEntitled+=bp;overtimePay+=op;grossPay+=(bp+op);
          /* Advances — sum from hrLog (only "advance" type with this weekId) */
          const empAdv=(d.hrLog||[]).filter(l=>l.type==="advance"&&l.empId===e.id&&l.weekId===w.id).reduce((s,l)=>s+(Number(l.amount)||0),0);
          advances+=empAdv;
          /* Debt installments — sum per week from empDebts */
          const empDebts=(d.empDebts||[]).filter(x=>x.empId===e.id&&x.status!=="paid");
          const wid=w.id;
          let debtInstall=0;
          empDebts.forEach(debt=>{
            const pp=(debt.partialPayments||{})[wid];
            if(pp)debtInstall+=Number(pp.paid)||0;
            else debtInstall+=Number(debt.perWeek)||0;
          });
          deductions+=debtInstall;
          /* thursdayPay ≈ grossPay - advances - debtInstall (simplified) */
          const net=(bp+op)-empAdv-debtInstall;
          thursdayPay+=Math.max(0,net);
        });
        const totalWeeklyAdv=(w.weeklyAdvances||[]).reduce((s,a)=>s+(Number(a.amount)||0),0);
        d.hrWeeks[wi].closedStats={
          baseSal:r2(baseSal),
          basicEntitled:r2(basicEntitled),
          overtimePay:r2(overtimePay),
          grossPay:r2(grossPay),
          advances:r2(advances),
          deductions:r2(deductions),
          specialDeductions:r2(specialDeductions),
          totalWeeklyAdvances:r2(totalWeeklyAdv),
          thursdayPay:r2(thursdayPay),
          finalTotal:r2(thursdayPay+totalWeeklyAdv),
          empCount:shownEmps.length,
          weeklyAdvancesCount:(w.weeklyAdvances||[]).length,
          savedAt:new Date().toISOString(),
          migrated:true/* flag: computed by migration, not actual close */
        };
      });
    });
  },[hrWeeks.length,canEdit]);/* eslint-disable-line */

  /* V14.55: Clean delete popup for weeks */
  const[cleanDeletePopup,setCleanDeletePopup]=useState(null);

  /* Restore week to pre-approval state (same-day only). Reverses all effects of approveWeek. */
  const[restorePopup,setRestorePopup]=useState(null);/* {snapshotId, week, confirmText} */
  const restoreWeekFromSnapshot=async()=>{
    if(!restorePopup||!restorePopup.week||!restorePopup.snapshotId)return;
    const weekId=restorePopup.week.id;
    const snapId=restorePopup.snapshotId;
    if(setSavingOverlay)setSavingOverlay({message:"جاري جلب النسخة الاحتياطية...",progress:20});
    try{
      /* 1. Fetch snapshot from Firestore */
      const snapSnap=await getDoc(doc(db,"backups",snapId));
      if(!snapSnap.exists()){
        if(setSavingOverlay)setSavingOverlay(null);
        showToast("⚠️ النسخة الاحتياطية غير موجودة");setRestorePopup(null);return;
      }
      const snap=snapSnap.data();
      /* Safety: same-day check (redundant with UI but defence in depth) */
      if(snap.savedAtDate!==today){
        if(setSavingOverlay)setSavingOverlay(null);
        showToast("⚠️ لا يمكن الاستعادة — النسخة من يوم مختلف");setRestorePopup(null);return;
      }
      if(setSavingOverlay)setSavingOverlay({message:"جاري عكس الحركات المالية...",progress:50});
      /* 2. Reverse all changes */
      upConfig(d=>{
        /* a) Remove hrLog entries linked to this snapshot */
        if(Array.isArray(d.hrLog))d.hrLog=d.hrLog.filter(l=>l.snapshotId!==snapId);
        /* b) Remove treasury entries linked to this snapshot */
        if(Array.isArray(d.treasury))d.treasury=d.treasury.filter(t=>t.snapshotId!==snapId);
        /* c) Restore employee balances from snapshot */
        const balances=snap.empBalancesBefore||{};
        (d.employees||[]).forEach(e=>{if(e.id in balances)e.prevBalance=balances[e.id]});
        /* d) Restore debt states (paidWeekIds + status) */
        const debtStates=snap.debtsStateBefore||{};
        (d.empDebts||[]).forEach(debt=>{if(debt.id in debtStates){
          debt.paidWeekIds=[...(debtStates[debt.id].paidWeekIds||[])];
          debt.status=debtStates[debt.id].status||"active";
          if(debt.status==="active")delete debt.paidAt;
        }});
        /* e) Reopen the week */
        const wi=(d.hrWeeks||[]).findIndex(w=>w.id===weekId);
        if(wi>=0){
          d.hrWeeks[wi].status="open";
          delete d.hrWeeks[wi].closedAt;delete d.hrWeeks[wi].closedBy;
          delete d.hrWeeks[wi].totalGross;delete d.hrWeeks[wi].totalNet;
          delete d.hrWeeks[wi].totalThursdayPay;delete d.hrWeeks[wi].totalRemaining;
          delete d.hrWeeks[wi].empCount;delete d.hrWeeks[wi].snapshotId;delete d.hrWeeks[wi].snapshotDate;
        }
      });
      /* 3. Log the restoration for audit */
      try{
        await setDoc(doc(db,"migrationLog","restore-week-"+weekId+"-"+Date.now()),{
          type:"week-restore",status:"success",
          weekId,weekNum:restorePopup.week.weekNum,snapshotId:snapId,
          by:userName||user?.email||"",at:new Date().toISOString(),
          details:"Restored week W"+restorePopup.week.weekNum+" from snapshot"
        });
      }catch(e){console.warn("Restore log failed:",e)}
      if(setSavingOverlay){setSavingOverlay({message:"✅ تمت الاستعادة بنجاح!",progress:100});setTimeout(()=>setSavingOverlay(null),1200)}
      showToast("✅ تم استعادة الأسبوع W"+restorePopup.week.weekNum+" للحالة قبل الإقفال");
      setRestorePopup(null);
    }catch(e){
      console.error("Restore error:",e);
      if(setSavingOverlay)setSavingOverlay(null);
      showToast("❌ خطأ في الاستعادة: "+e.message);
    }
  };

  /* ── Print Slip ── */
  /* Build slip HTML for one employee (without html/head wrapper) */
  const buildSlipHTML=(empId)=>{if(!openWeek)return"";const c=calcSalary(empId,openWeek);const emp=employees.find(e=>e.id===empId);if(!c||!emp)return"";
    const logo=(data.logo||"").trim();const reason=salDeductReason[empId]||"";
    const dayNames=["أحد","اثنين","ثلاثاء","أربعاء","خميس","جمعة","سبت"];
    /* ── Performance: compare with previous week ── */
    const sortedW=[...hrWeeks].sort((a,b)=>(b.weekStart||"").localeCompare(a.weekStart||""));
    const curIdx=sortedW.findIndex(w=>w.id===openWeek.id);
    const prevW=curIdx>=0&&curIdx<sortedW.length-1?sortedW[curIdx+1]:null;
    let perfHTML="";
    if(prevW){
      const pAtt=prevW.attendance||{};let pH=0,pDays=0;
      const ps=new Date(prevW.weekStart);const pe=new Date(prevW.weekEnd);
      for(let d=new Date(ps);d<=pe;d.setDate(d.getDate()+1)){const k=empId+"_"+d.toISOString().split("T")[0];const v=pAtt[k]?pAtt[k].hours:0;pH+=v;if(v>0)pDays++}
      pH=r2(pH);
      if(pH>0){
        const diffH=r2(c.totalHours-pH);const pct=pH>0?Math.round((diffH/pH)*100):0;
        const isUp=diffH>0;const isEq=diffH===0;
        const arrow=isUp?"▲":isEq?"■":"▼";
        const color=isUp?"#10b981":isEq?"#64748b":"#ef4444";
        const bgColor=isUp?"#f0fdf4":isEq?"#f8fafc":"#fef2f2";
        const borderColor=isUp?"#bbf7d0":isEq?"#e2e8f0":"#fecaca";
        const label=isUp?"تحسن في الأداء":isEq?"أداء مستقر":"تراجع في الأداء";
        perfHTML=`<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:10px;background:${bgColor};border:2px solid ${borderColor};margin:10px 0">
          <div style="font-size:28px;color:${color};font-weight:900;line-height:1">${arrow}</div>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:800;color:${color}">${label}</div>
            <div style="font-size:10px;color:#64748b;margin-top:2px">
              الأسبوع الحالي: <b>${r2(c.totalHours)} ساعة</b> (${c.workDays} يوم) &nbsp;|&nbsp;
              الأسبوع السابق W${prevW.weekNum}: <b>${pH} ساعة</b> (${pDays} يوم)
            </div>
          </div>
          <div style="text-align:center;min-width:60px">
            <div style="font-size:22px;font-weight:900;color:${color}">${isUp?"+":""}${pct}%</div>
            <div style="font-size:8px;color:#94a3b8;font-weight:600">فرق الأداء</div>
          </div>
        </div>`}
    }
    return `<div class="slip-page">
    <div class="hdr">
      ${logo?'<img src="'+logo+'"/>':'<div style="font-size:20px;font-weight:900;color:#0ea5e9">CLARK</div>'}
      <div class="tbox"><h1>كشف مرتب أسبوعي</h1><div class="wk">W${openWeek.weekNum}</div></div>
    </div>
    <div class="info">
      <div class="emp-row">
        <span class="emp-name">${emp.name}</span>
        ${emp.code||emp.job?'<span class="emp-meta">'+(emp.code?'كود: '+emp.code:'')+(emp.code&&emp.job?' • ':'')+(emp.job||'')+'</span>':''}
      </div>
      <div><b>التليفون:</b> ${emp.phone||"—"}</div><div><b>ساعات أساسي:</b> ${c.baseHours}</div>
      <div><b>الأسبوع:</b> ${openWeek.weekStart} → ${openWeek.weekEnd}</div><div><b>سعر الساعة:</b> ${r2(c.perHour)} ج.م</div>
      <div><b>المرتب الأسبوعي:</b> ${fmt0(c.weeklySalary)} ج.م</div><div></div>
    </div>
    <h3 style="color:#0ea5e9;margin:10px 0 4px;font-size:12px">📋 الحضور اليومي</h3>
    <table class="att-tbl"><thead><tr>${c.days.map(d=>"<th>"+dayNames[new Date(d.date).getDay()]+"<br/>"+d.date.slice(5)+"</th>").join("")}<th style="background:#0284c7;color:#fff">اجمالي</th></tr></thead>
    <tbody><tr>${c.days.map(d=>"<td"+(d.hours>0?' class="has"':"")+">"+(d.hours>0?d.hours+"h":"—")+"</td>").join("")}<td style="background:#0ea5e9;color:#fff;font-weight:800">${r2(c.totalHours)}h</td></tr></tbody></table>
    ${perfHTML}
    <h3 style="color:#0ea5e9;margin:10px 0 4px;font-size:12px">💰 تفاصيل المرتب</h3>
    <table class="calc-tbl">
    <tr><td class="lbl">الراتب الأساسي في الأسبوع</td><td>${fmt0(c.weeklySalary)} ج.م</td></tr>
    <tr><td class="lbl">ساعات عمل أساسي / إضافي</td><td>${r2(c.basicHours)} / ${r2(c.overtimeHours)} (×${OT_MULT})</td></tr>
    <tr><td class="lbl">الراتب المستحق بدون إضافي</td><td>${fmt0(c.basicPay)} ج.م</td></tr>
    <tr><td class="lbl">إضافي (+)</td><td class="add">${fmt0(c.overtimePay)} ج.م</td></tr>
    <tr style="background:#f0f9ff"><td class="lbl"><b>اجمالي الراتب المستحق</b></td><td style="font-weight:800;color:#0ea5e9;font-size:13px">${fmt0(c.grossPay)} ج.م</td></tr>
    <tr><td class="lbl">مسحوبات الأسبوع (−)</td><td class="sub">${fmt0(c.weekAdvances)} ج.م</td></tr>
    <tr><td class="lbl">خصم جزاءات (−)${reason?" <span style='font-size:10px;color:#78350f'>["+reason+"]</span>":""}</td><td class="sub">${fmt0(c.specialDeduct)} ج.م</td></tr>
    ${c.debtInstall>0?'<tr><td class="lbl">خصم قسط مديونية (−)<br/><span style="font-size:9px;color:#78350f">'+(c.debtItems||[]).map(di=>di.title+" ("+(di.paid+1)+"/"+di.installments+")").join(" • ")+'</span></td><td class="sub">'+fmt0(c.debtInstall)+' ج.م</td></tr>':""}
    <tr><td class="lbl">حافز التزام (+)</td><td class="add">${fmt0(c.bonus)} ج.م</td></tr>
    <tr style="background:#f0fdf4"><td class="lbl"><b>صافي الأسبوع</b></td><td style="font-weight:800;color:#0ea5e9;font-size:13px">${fmt0(c.netBalance)} ج.م</td></tr>
    ${c.prevBalance!==0?'<tr style="background:#eff6ff"><td class="lbl" style="color:#1e40af">🔄 رصيد مرحل من الأسبوع السابق (+)</td><td class="add" style="color:#1e40af">'+fmt0(c.prevBalance)+' ج.م</td></tr>':""}
    ${c.prevBalance!==0?'<tr style="background:#dbeafe"><td class="lbl"><b>إجمالي المستحق</b></td><td style="font-weight:800;color:#1e40af;font-size:13px">'+fmt0(c.totalDue)+' ج.م</td></tr>':""}
    <tr><td class="lbl">دفعة من الحساب (−)</td><td class="sub">${fmt0(c.thursdayPay)} ج.م</td></tr>
    <tr><td class="total">الرصيد المتبقي (يُرحّل للأسبوع القادم)</td><td class="total">${fmt0(c.remainingBalance)} ج.م</td></tr>
    </table>
    ${reason?'<div class="reason"><b>📝 سبب الخصم:</b> '+reason+'</div>':""}
    <div class="note">
    <b>تعليمات:</b><br>
    • برجاء عد النقدية ومطابقتها بصافي الراتب اعلاه والرجوع للمحاسب المختص فوراً حالة عدم التوافق.<br>
    • للمراجعة مع المحاسب المختص بعد استلام الراتب بيومين على الاقل.<br>
    • تقييم الراتب يتم بناءا على نسبة الحضور والالتزام بالدوام ومواعيد العمل الرسمية.<br>
    • يتم تقليل الراتب المتفق عليه بدون الرجوع للعامل في حالة عدم الالتزام بالمتفق عليه من الانتاج والجودة.<br>
    • يتم خصم يوم الغياب بدون اذن بيومين وأيضاً التأخير يوم السبت عن الحد الطبيعي الساعة 12 ظهراً.
    </div>
    <div class="sig"><div><div class="line">المحاسب</div></div><div><div class="line">المستلم: ${emp.name}</div></div></div>
    </div>`};

  const SLIP_STYLES=`<style>
    @page{size:A5 portrait;margin:10mm}
    *{box-sizing:border-box}
    /* V15.77: Fonts enlarged across the slip for better readability */
    body{font-family:'Cairo',Arial,sans-serif;font-size:13px;padding:0;margin:0;color:#1a1a1a}
    .slip-page{page-break-after:always;padding:0;margin:0}
    .slip-page:last-child{page-break-after:auto}
    .hdr{display:flex;justify-content:space-between;align-items:center;padding-bottom:10px;border-bottom:2px solid #0ea5e9;margin-bottom:12px}
    .hdr img{max-height:50px;max-width:140px}
    .hdr .tbox{text-align:left;color:#0ea5e9}
    .hdr h1{font-size:18px;font-weight:800;margin:0 0 2px}
    .hdr .wk{font-size:24px;font-weight:900;color:#0ea5e9}
    /* V15.79: Compact inline employee name strip — spans both cols of info grid, doesn't add page height */
    .emp-row{grid-column:1 / -1;display:flex;justify-content:space-between;align-items:baseline;gap:10px;background:linear-gradient(135deg,#0ea5e9,#0284c7);color:#fff;padding:6px 12px;border-radius:6px;margin:-2px -2px 4px -2px;flex-wrap:wrap}
    .emp-name{font-size:16px;font-weight:900;letter-spacing:0.2px;line-height:1.2}
    .emp-meta{font-size:11px;font-weight:600;opacity:0.92;white-space:nowrap}
    .info{display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;padding:10px;background:#f0f9ff;border-radius:8px;margin-bottom:10px;font-size:12px}
    .info b{color:#0ea5e9}
    table{width:100%;border-collapse:collapse;margin:8px 0}
    td,th{border:1px solid #cbd5e1;padding:6px 8px;text-align:right;font-size:12px}
    th{background:#0ea5e9;color:#fff;font-weight:700;text-align:center}
    .att-tbl th,.att-tbl td{text-align:center;padding:4px 2px;font-size:11px}
    .att-tbl th{background:#e0f2fe;color:#0284c7}
    .att-tbl td{background:#f8fafc}
    .att-tbl td.has{background:#dcfce7;color:#15803d;font-weight:700}
    .calc-tbl td{padding:7px 10px;font-size:12px}
    .calc-tbl .lbl{background:#f1f5f9;font-weight:700;width:55%}
    .calc-tbl .add{color:#10b981;font-weight:700}
    .calc-tbl .sub{color:#ef4444;font-weight:700}
    .calc-tbl .total{background:#0ea5e9;color:#fff;font-size:15px;font-weight:800}
    .reason{background:#fef3c7;border-right:3px solid #f59e0b;padding:6px 10px;margin:6px 0;font-size:11px;border-radius:4px}
    /* V15.77: Instructions note — font bumped 9→11 (22% larger) + line-height for readability */
    .note{background:#f8fafc;border:1px dashed #cbd5e1;padding:10px 12px;margin-top:12px;font-size:11px;color:#334155;line-height:1.8;border-radius:6px}
    .note b{color:#0ea5e9;font-size:12px}
    .sig{display:flex;justify-content:space-between;margin-top:20px;padding:0 10px}
    .sig div{text-align:center;font-size:11px;color:#64748b}
    .sig .line{border-top:1px solid #94a3b8;padding-top:4px;min-width:100px}
    @media print{body{margin:0}}
    </style>`;

  /* V15.23: Use centralized openPrintWindow from utils/print.js (handles popup-block + iframe fallback) */
  const _openPrintWin=openPrintWindow;

  /* V15.75: Weekly financial summary — rewritten to use printPage helper.
     Previously it used openPrintWindow() directly which in popup-blocked browsers
     fell back to a hidden 1x1 iframe (invisible). printPage() builds a proper
     styled report and handles print/PDF buttons uniformly. */
  const printWeeklyFinancialSummary=(w)=>{
    if(!w){showToast("⚠️ لا يوجد أسبوع محدد");return}
    try{
      const wSelected=(w.selectedEmps&&Array.isArray(w.selectedEmps))?w.selectedEmps:[];
      const wShown=activeEmps.filter(e=>wSelected.includes(e.id));
      let records=[];
      if(w.status==="closed"&&Array.isArray(w.closedRecords)){
        records=w.closedRecords;
      }else{
        records=wShown.map(e=>{const c=calcSalary(e.id,w);return c?{empId:e.id,empName:e.name,empCode:e.code||"",...c}:null}).filter(Boolean);
      }
      const totalEmps=records.length;
      const totalSalaries=records.reduce((s,r)=>s+(Number(r.thursdayPay)||0),0);
      const totalGross=records.reduce((s,r)=>s+(Number(r.grossPay)||0),0);
      const totalPrevBalance=records.reduce((s,r)=>s+(Number(r.prevBalance)||0),0);
      const totalAdvancesDeducted=records.reduce((s,r)=>s+(Number(r.weekAdvances)||0),0);
      const totalBonus=records.reduce((s,r)=>s+(Number(r.bonus)||0),0);
      const totalSpecialDeduct=records.reduce((s,r)=>s+(Number(r.specialDeduct)||0),0);
      const totalInstallments=records.reduce((s,r)=>s+(Number(r.debtInstall)||0),0);
      const totalRemaining=records.reduce((s,r)=>s+(Number(r.remainingBalance)||0),0);
      const monthlyAdvs=(w.weeklyAdvances||[]);
      const totalMonthlyAdvs=monthlyAdvs.reduce((s,a)=>s+(Number(a.amount)||0),0);
      const wsPayments=(w.weeklyWsPayments||[]);
      const totalWsPayments=wsPayments.reduce((s,p)=>s+(Number(p.amount)||0),0);
      const wsByName={};
      wsPayments.forEach(p=>{
        const k=p.wsName||"غير محدد";
        if(!wsByName[k])wsByName[k]={name:k,payment:0,purchase:0};
        if(p.type==="purchase")wsByName[k].purchase+=Number(p.amount)||0;
        else wsByName[k].payment+=Number(p.amount)||0;
      });
      const wsRows=Object.values(wsByName);
      const otherExps=(w.weeklyOtherExpenses||[]);
      const totalOtherExps=otherExps.reduce((s,e)=>s+(Number(e.amount)||0),0);
      const expsByCat={};
      otherExps.forEach(e=>{
        const k=e.category||"أخرى";
        expsByCat[k]=(expsByCat[k]||0)+(Number(e.amount)||0);
      });
      const expsRows=Object.entries(expsByCat).map(([name,amount])=>({name,amount}));
      const grandTotal=totalSalaries+totalMonthlyAdvs+totalWsPayments+totalOtherExps;
      let body="";
      body+="<style>";
      body+=".wk-info{display:flex;justify-content:space-between;align-items:center;background:#F1F5F9;border-radius:10px;padding:12px 18px;margin-bottom:16px;border:1px solid #CBD5E1}";
      body+=".wk-info .w-num{font-size:24px;font-weight:900;color:#0EA5E9}";
      body+=".wk-info .w-dates{text-align:center}";
      body+=".wk-info .w-dates b{display:block;font-size:14px;color:#1E293B;margin-bottom:2px}";
      body+=".wk-info .w-dates span{color:#64748B;font-size:11px}";
      body+=".wk-info .w-meta{text-align:left;font-size:11px;color:#64748B}";
      body+=".sec{margin-bottom:16px;border:1px solid #E2E8F0;border-radius:10px;overflow:hidden}";
      body+=".sec-hdr{color:#fff;padding:10px 16px;display:flex;justify-content:space-between;align-items:center;font-weight:800}";
      body+=".sec-hdr .stitle{font-size:14px}";
      body+=".sec-hdr .stot{font-size:15px;font-weight:900;background:rgba(255,255,255,0.2);padding:4px 12px;border-radius:6px}";
      body+=".sec-body{padding:12px 16px;background:#fff}";
      body+=".sec-body table{width:100%;border-collapse:collapse}";
      body+=".sec-body th,.sec-body td{padding:7px 10px;text-align:right;font-size:12px;border-bottom:1px solid #F1F5F9}";
      body+=".sec-body th{background:#F8FAFC;font-weight:700;color:#475569}";
      body+=".sec-body td.num{text-align:center;font-weight:700}";
      body+=".sec-body tr.tot{background:#F8FAFC;font-weight:800}";
      body+=".sec-body tr.tot td{padding:9px 10px;color:#1E293B}";
      body+=".empty{text-align:center;color:#94A3B8;padding:14px;font-style:italic;font-size:12px}";
      body+=".sec-salaries .sec-hdr{background:linear-gradient(90deg,#0EA5E9,#0284C7)}";
      body+=".sec-advs .sec-hdr{background:linear-gradient(90deg,#F59E0B,#D97706)}";
      body+=".sec-ws .sec-hdr{background:linear-gradient(90deg,#8B5CF6,#7C3AED)}";
      body+=".sec-exps .sec-hdr{background:linear-gradient(90deg,#10B981,#059669)}";
      body+=".grand{margin-top:20px;background:linear-gradient(135deg,#DC2626,#991B1B);color:#fff;border-radius:12px;padding:18px 24px;display:flex;justify-content:space-between;align-items:center;box-shadow:0 6px 16px rgba(220,38,38,0.25)}";
      body+=".grand .gtitle{font-size:15px;font-weight:700;opacity:0.95}";
      body+=".grand .gval{font-size:30px;font-weight:900;letter-spacing:0.5px}";
      body+=".grand .gval small{font-size:15px;opacity:0.85;font-weight:700}";
      body+=".breakdown{margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;padding:12px 16px;background:#F1F5F9;border-radius:8px;font-size:11px}";
      body+=".breakdown .bd-item{background:#fff;padding:5px 12px;border-radius:6px;border:1px solid #E2E8F0}";
      body+=".breakdown .bd-item b{color:#0EA5E9}";
      body+=".sigs{margin-top:24px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px}";
      body+=".sig-box{text-align:center;padding-top:36px;border-top:2px solid #1E293B}";
      body+=".sig-box .role{font-size:12px;font-weight:800;color:#1E293B;margin-bottom:4px}";
      body+=".sig-box .name{font-size:11px;color:#64748B}";
      body+="</style>";
      body+="<div class='wk-info'>";
      body+="<div class='w-num'>W"+w.weekNum+"</div>";
      body+="<div class='w-dates'><b>"+w.weekStart+" → "+w.weekEnd+"</b>";
      body+="<span>"+totalEmps+" عامل • "+(w.status==="closed"?"✅ أسبوع مقفول":"🔓 أسبوع مفتوح")+"</span></div>";
      body+="<div class='w-meta'><b>أعده: "+(userName||"—")+"</b></div>";
      body+="</div>";
      body+="<div class='sec sec-salaries'>";
      body+="<div class='sec-hdr'><div class='stitle'>💰 إجمالي المرتبات المستحقة</div><div class='stot'>"+fmt0(totalSalaries)+" ج</div></div>";
      body+="<div class='sec-body'><table><tbody>";
      body+="<tr><td>إجمالي الأجر الأساسي للعمال</td><td class='num'>"+fmt0(totalGross)+" ج</td></tr>";
      if(totalPrevBalance!==0)body+="<tr><td>+ رصيد مرحّل من أسابيع سابقة</td><td class='num'>"+fmt0(totalPrevBalance)+" ج</td></tr>";
      if(totalBonus>0)body+="<tr><td>+ حوافز</td><td class='num' style='color:#10B981'>+"+fmt0(totalBonus)+" ج</td></tr>";
      if(totalAdvancesDeducted>0)body+="<tr><td>− سلف مخصومة هذا الأسبوع</td><td class='num' style='color:#EF4444'>−"+fmt0(totalAdvancesDeducted)+" ج</td></tr>";
      if(totalSpecialDeduct>0)body+="<tr><td>− خصومات خاصة</td><td class='num' style='color:#EF4444'>−"+fmt0(totalSpecialDeduct)+" ج</td></tr>";
      if(totalInstallments>0)body+="<tr><td>− أقساط مديونيات</td><td class='num' style='color:#EF4444'>−"+fmt0(totalInstallments)+" ج</td></tr>";
      if(totalRemaining!==0)body+="<tr><td>− سيُرحّل للأسبوع القادم</td><td class='num' style='color:#F59E0B'>"+fmt0(totalRemaining)+" ج</td></tr>";
      body+="<tr class='tot'><td>= الصافي المطلوب للصرف (دفعة الخميس)</td><td class='num' style='color:#0EA5E9;font-size:14px'>"+fmt0(totalSalaries)+" ج</td></tr>";
      body+="</tbody></table></div></div>";
      body+="<div class='sec sec-advs'>";
      body+="<div class='sec-hdr'><div class='stitle'>📋 السلف الشهرية والإدارية</div><div class='stot'>"+fmt0(totalMonthlyAdvs)+" ج</div></div>";
      body+="<div class='sec-body'>";
      if(monthlyAdvs.length===0){body+="<div class='empty'>لا توجد سلف مسجلة</div>"}
      else{
        body+="<table><thead><tr><th>#</th><th>الموظف</th><th style='text-align:center'>المبلغ</th><th>ملاحظة</th></tr></thead><tbody>";
        monthlyAdvs.forEach((a,i)=>{
          body+="<tr><td class='num'>"+(i+1)+"</td><td>"+(a.empName||"—")+"</td><td class='num'>"+fmt0(Number(a.amount)||0)+" ج</td><td style='color:#64748B'>"+(a.note||"—")+"</td></tr>";
        });
        body+="<tr class='tot'><td colspan='2'>الإجمالي ("+monthlyAdvs.length+")</td><td class='num' style='color:#F59E0B;font-size:14px'>"+fmt0(totalMonthlyAdvs)+" ج</td><td></td></tr>";
        body+="</tbody></table>";
      }
      body+="</div></div>";
      body+="<div class='sec sec-ws'>";
      body+="<div class='sec-hdr'><div class='stitle'>🏭 دفعات الورش والمشتريات</div><div class='stot'>"+fmt0(totalWsPayments)+" ج</div></div>";
      body+="<div class='sec-body'>";
      if(wsRows.length===0){body+="<div class='empty'>لا توجد دفعات ورش مسجلة</div>"}
      else{
        body+="<table><thead><tr><th>#</th><th>الورشة</th><th style='text-align:center'>دفعة</th><th style='text-align:center'>مشتريات</th><th style='text-align:center'>الإجمالي</th></tr></thead><tbody>";
        wsRows.forEach((r,i)=>{
          body+="<tr><td class='num'>"+(i+1)+"</td><td>"+r.name+"</td>";
          body+="<td class='num'>"+(r.payment>0?fmt0(r.payment)+" ج":"—")+"</td>";
          body+="<td class='num'>"+(r.purchase>0?fmt0(r.purchase)+" ج":"—")+"</td>";
          body+="<td class='num'>"+fmt0(r.payment+r.purchase)+" ج</td></tr>";
        });
        const tPay=wsRows.reduce((s,r)=>s+r.payment,0);
        const tPur=wsRows.reduce((s,r)=>s+r.purchase,0);
        body+="<tr class='tot'><td colspan='2'>الإجمالي ("+wsRows.length+" ورشة)</td>";
        body+="<td class='num'>"+fmt0(tPay)+" ج</td><td class='num'>"+fmt0(tPur)+" ج</td>";
        body+="<td class='num' style='color:#8B5CF6;font-size:14px'>"+fmt0(totalWsPayments)+" ج</td></tr>";
        body+="</tbody></table>";
      }
      body+="</div></div>";
      body+="<div class='sec sec-exps'>";
      body+="<div class='sec-hdr'><div class='stitle'>📝 المصاريف الأخرى</div><div class='stot'>"+fmt0(totalOtherExps)+" ج</div></div>";
      body+="<div class='sec-body'>";
      if(expsRows.length===0){body+="<div class='empty'>لا توجد مصاريف مسجلة</div>"}
      else{
        body+="<table><thead><tr><th>#</th><th>الفئة</th><th style='text-align:center'>المبلغ</th></tr></thead><tbody>";
        expsRows.forEach((r,i)=>{
          body+="<tr><td class='num'>"+(i+1)+"</td><td>"+r.name+"</td><td class='num'>"+fmt0(r.amount)+" ج</td></tr>";
        });
        body+="<tr class='tot'><td colspan='2'>الإجمالي ("+expsRows.length+" بند)</td><td class='num' style='color:#10B981;font-size:14px'>"+fmt0(totalOtherExps)+" ج</td></tr>";
        body+="</tbody></table>";
      }
      body+="</div></div>";
      body+="<div class='grand'>";
      body+="<div class='gtitle'>💵 إجمالي المبلغ المطلوب صرفه اليوم</div>";
      body+="<div class='gval'>"+fmt0(grandTotal)+" <small>جنيه مصري</small></div>";
      body+="</div>";
      body+="<div class='breakdown'>";
      body+="<div class='bd-item'>💰 مرتبات: <b>"+fmt0(totalSalaries)+" ج</b> ("+(grandTotal?Math.round(totalSalaries/grandTotal*100):0)+"%)</div>";
      body+="<div class='bd-item'>📋 سلف: <b>"+fmt0(totalMonthlyAdvs)+" ج</b> ("+(grandTotal?Math.round(totalMonthlyAdvs/grandTotal*100):0)+"%)</div>";
      body+="<div class='bd-item'>🏭 ورش: <b>"+fmt0(totalWsPayments)+" ج</b> ("+(grandTotal?Math.round(totalWsPayments/grandTotal*100):0)+"%)</div>";
      body+="<div class='bd-item'>📝 مصاريف: <b>"+fmt0(totalOtherExps)+" ج</b> ("+(grandTotal?Math.round(totalOtherExps/grandTotal*100):0)+"%)</div>";
      body+="</div>";
      body+="<div class='sigs'>";
      body+="<div class='sig-box'><div class='role'>أعده: المحاسب</div><div class='name'>"+(userName||"—")+"</div></div>";
      body+="<div class='sig-box'><div class='role'>اعتمده: المدير المالي</div><div class='name'>التوقيع + التاريخ</div></div>";
      body+="<div class='sig-box'><div class='role'>استلمه: المحاسب</div><div class='name'>التوقيع + التاريخ</div></div>";
      body+="</div>";
      const configInfo={factoryName:data.factoryName||"CLARK Factory",logo:data.logo||"",address:data.address||"",phone:data.phone||""};
      printPage("تقرير أسبوعي مالي — W"+w.weekNum,body,configInfo);
    }catch(err){
      console.error("Print weekly financial summary error:",err);
      showToast("⚠️ خطأ في التقرير: "+(err?.message||"غير معروف"));
    }
  };

  const printSlip=(empId)=>{if(!openWeek)return;const html=buildSlipHTML(empId);if(!html)return;
    const emp=employees.find(e=>e.id===empId);
    const w=_openPrintWin();
    if(!w){
      showToast("⚠️ المتصفح بيمنع فتح نافذة الطباعة — فعّل النوافذ المنبثقة (pop-ups) من إعدادات المتصفح");
      return;
    }
    w.document.write(`<html dir="rtl"><head><meta charset="utf-8"><title>كشف مرتب — ${emp?.name||""}</title>${SLIP_STYLES}</head><body>${html}</body></html>`);
    w.document.close();setTimeout(()=>w.print(),300)};

  /* Send salary slip via WhatsApp */
  const whatsAppSlip=(empId)=>{
    if(!openWeek)return;
    const emp=employees.find(e=>e.id===empId);if(!emp)return;
    const c=calcSalary(empId,openWeek);if(!c)return;
    /* Clean phone number: remove spaces, +, -, and parens; prepend 20 if Egyptian and missing */
    let phone=(emp.phone||"").toString().replace(/[\s\-\(\)\+]/g,"");
    if(!phone){showToast("⚠️ لا يوجد رقم تليفون لهذا الموظف");return}
    if(phone.startsWith("0"))phone="20"+phone.slice(1);/* Egyptian: 01xxx → 201xxx */
    else if(!phone.startsWith("20")&&phone.length===10)phone="20"+phone;
    /* V15.80: Validate length — Egyptian numbers should be 12 digits (20 + 10) */
    if(phone.length<10||phone.length>15){showToast("⚠️ رقم التليفون غير صحيح: "+emp.phone);return}
    /* Build message */
    const weekLabel="W"+openWeek.weekNum+" ("+openWeek.weekStart+" → "+openWeek.weekEnd+")";
    const lines=[];
    lines.push("*💰 كشف مرتب*");
    lines.push("━━━━━━━━━━━━━━");
    lines.push("👤 *"+emp.name+"*");
    if(emp.job)lines.push("💼 "+emp.job);
    lines.push("📅 "+weekLabel);
    lines.push("━━━━━━━━━━━━━━");
    lines.push("*تفاصيل الحساب:*");
    lines.push("• الأساسي: "+fmt0(c.weeklySalary)+" ج");
    lines.push("• ساعات الأسبوع: "+hrsToHM(c.totalHours));
    if(c.overtimeHours>0){
      lines.push("• وقت إضافي: "+hrsToHM(c.overtimeHours)+" = "+fmt0(c.overtimePay)+" ج");
    }
    lines.push("• إجمالي المستحق: *"+fmt0(c.grossPay)+" ج*");
    lines.push("");
    if(c.bonus>0)lines.push("• حافز (+): "+fmt0(c.bonus)+" ج");
    if(c.weekAdvances>0)lines.push("• مسحوبات/سلف (−): "+fmt0(c.weekAdvances)+" ج");
    if(c.specialDeduct>0){
      let dLine="• خصم (−): "+fmt0(c.specialDeduct)+" ج";
      const reason=salDeductReason[emp.id];
      if(reason)dLine+=" — "+reason;
      lines.push(dLine);
    }
    if(c.debtInstall>0){
      let iLine="• قسط (−): "+fmt0(c.debtInstall)+" ج";
      if(c.isPartialInstall)iLine+=" (جزئي — "+fmt0(c.debtInfoTotal-c.debtInstall)+" أُجِّل)";
      lines.push(iLine);
    }
    if(c.isSkippedInstall)lines.push("• القسط: ⏭️ تم تخطيه هذا الأسبوع");
    lines.push("━━━━━━━━━━━━━━");
    lines.push("💵 صافي الأسبوع: "+fmt0(c.netBalance)+" ج");
    if(c.prevBalance!==0){
      lines.push("🔄 رصيد مرحّل من الأسبوع السابق: "+(c.prevBalance>0?"+":"")+fmt0(c.prevBalance)+" ج");
      lines.push("💰 *المطلوب دفعه: "+fmt0(c.totalDue)+" ج*");
    }else{
      lines.push("💰 *المطلوب دفعه: "+fmt0(c.totalDue)+" ج*");
    }
    lines.push("💸 منصرف اليوم: *"+fmt0(c.thursdayPay)+" ج*");
    if(c.remainingBalance!==0){
      lines.push("⏭️ رصيد مرحّل للأسبوع القادم: "+fmt0(c.remainingBalance)+" ج");
    }
    lines.push("━━━━━━━━━━━━━━");
    lines.push("");
    lines.push("_CLARK Factory — "+today+"_");
    const msg=lines.join("\n");
    const url="https://wa.me/"+phone+"?text="+encodeURIComponent(msg);
    /* V15.80: Use <a> click instead of window.open to bypass popup blockers.
       window.open() silently fails on many browsers (esp. Chrome) when URL is long.
       Anchor-click is treated as direct user navigation → always allowed. */
    try{
      const a=document.createElement("a");
      a.href=url;a.target="_blank";a.rel="noopener noreferrer";
      document.body.appendChild(a);a.click();document.body.removeChild(a);
    }catch(e){
      console.error("WhatsApp open error:",e);
      /* Fallback: copy message to clipboard + open WhatsApp with phone only */
      const shortUrl="https://wa.me/"+phone;
      if(navigator.clipboard&&navigator.clipboard.writeText){
        navigator.clipboard.writeText(msg).then(()=>{
          const a2=document.createElement("a");a2.href=shortUrl;a2.target="_blank";a2.rel="noopener noreferrer";
          document.body.appendChild(a2);a2.click();document.body.removeChild(a2);
          showToast("✓ الرسالة اتنسخت — الصقها في محادثة الواتساب");
        }).catch(()=>showToast("⚠️ تعذّر فتح الواتساب — افتح الرقم "+phone+" يدويًا"));
      }else{
        showToast("⚠️ تعذّر فتح الواتساب — تأكد من السماح بالنوافذ المنبثقة");
      }
    }
  };

  const bulkPrintSlips=()=>{if(!openWeek)return;
    const selectedIds=Object.keys(bulkPrintSel).filter(id=>bulkPrintSel[id]);
    if(selectedIds.length===0){showToast("⚠️ اختر موظف على الأقل");return}
    const htmls=selectedIds.map(id=>buildSlipHTML(id)).filter(Boolean).join("\n");
    if(!htmls){showToast("⛔ لا توجد بيانات");return}
    const w=_openPrintWin();if(!w)return;
    w.document.write(`<html dir="rtl"><head><meta charset="utf-8"><title>كشوفات مرتبات W${openWeek.weekNum}</title>${SLIP_STYLES}</head><body>${htmls}</body></html>`);
    w.document.close();setTimeout(()=>w.print(),400);
    setShowBulkPrint(false);showToast("🖨 جاري طباعة "+selectedIds.length+" كشف")};

  const delLog=(lid)=>{upConfig(d=>{d.hrLog=(d.hrLog||[]).filter(l=>l.id!==lid)});showToast("✓ حذف")};

  /* ── V15.18: Excel Import for HR Weekly Data ── */
  /* Parses date value from openpyxl (might be Date obj, serial number, or string) */
  const _parseXlsxDate=(v)=>{
    if(!v)return null;
    if(v instanceof Date){const y=v.getFullYear();const m=String(v.getMonth()+1).padStart(2,"0");const d=String(v.getDate()).padStart(2,"0");return y+"-"+m+"-"+d}
    if(typeof v==="number"){/* Excel serial date */
      const d=new Date((v-25569)*86400*1000);
      const y=d.getFullYear();const m=String(d.getMonth()+1).padStart(2,"0");const dd=String(d.getDate()).padStart(2,"0");
      return y+"-"+m+"-"+dd;
    }
    const s=String(v).trim();
    /* ISO format: YYYY-MM-DD */
    if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.substring(0,10);
    /* DD-MM-YYYY or DD/MM/YYYY (4-digit year) */
    let m=s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if(m)return m[3]+"-"+String(m[2]).padStart(2,"0")+"-"+String(m[1]).padStart(2,"0");
    /* M/D/YY or MM/DD/YY format (US, 2-digit year) — assume 20YY */
    m=s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2})$/);
    if(m){
      const yy=parseInt(m[3]);const yr=(yy<50?2000+yy:1900+yy);
      return yr+"-"+String(m[1]).padStart(2,"0")+"-"+String(m[2]).padStart(2,"0");
    }
    return null;
  };
  /* Parses time string "HH:MM:SS" or "HH:MM" into decimal hours */
  const _parseXlsxTime=(v)=>{
    if(v===null||v===undefined||v==="")return 0;
    if(typeof v==="number"){/* Excel time as fraction of day */
      return v*24;
    }
    const s=String(v).trim();
    if(!s||s==="0:00:00"||s==="0:00")return 0;
    const parts=s.split(":");
    const h=parseInt(parts[0])||0;
    const m=parseInt(parts[1])||0;
    return h+m/60;
  };
  /* Parse number — handle null/undefined/NaN/thousand-separators gracefully */
  const _parseXlsxNum=(v)=>{
    if(v===null||v===undefined||v==="")return 0;
    if(typeof v==="number")return isNaN(v)?0:v;
    /* String: strip thousand separators (commas) */
    const s=String(v).replace(/,/g,"").trim();
    if(!s)return 0;
    const n=Number(s);
    return isNaN(n)?0:n;
  };
  /* Main parser — takes ArrayBuffer, returns structured data or throws on error.
     V15.18: Uses HEADER-BASED column detection (not fixed indices) because SheetJS and
     pandas produce different shapes based on leading blank columns. */
  const parseHRExcel=async(fileArrayBuffer)=>{
    const XLSX=await loadXLSX();
    if(!XLSX)throw new Error("مكتبة قراءة Excel غير متوفرة");
    const wb=XLSX.read(fileArrayBuffer,{type:"array",cellDates:true});
    /* Find required sheets */
    const dbSheet=wb.Sheets["DB"];
    const fSheet=wb.Sheets["F"];
    const s0Sheet=wb.Sheets["0"];
    const s1Sheet=wb.Sheets["1"];
    if(!dbSheet)throw new Error("شيت DB غير موجود في الملف");
    if(!fSheet)throw new Error("شيت F (البصمة) غير موجود في الملف");
    /* Helper: find column index by header text (case-insensitive, trimmed) */
    const findCol=(headerRow,nameVariations)=>{
      if(!headerRow)return-1;
      for(let c=0;c<headerRow.length;c++){
        const h=(headerRow[c]||"").toString().trim();
        if(!h)continue;
        for(const n of nameVariations){
          if(h===n||h.includes(n))return c;
        }
      }
      return-1;
    };
    /* ─── Parse DB sheet ─── header row contains "اسم العامل" + "كود العامل" etc. */
    const dbRows=XLSX.utils.sheet_to_json(dbSheet,{header:1,raw:false,defval:null});
    /* Find header row: the one containing "اسم العامل" */
    let dbHeaderIdx=-1;
    for(let r=0;r<Math.min(10,dbRows.length);r++){
      if(dbRows[r]&&dbRows[r].some(c=>c&&String(c).trim().includes("اسم العامل"))){dbHeaderIdx=r;break}
    }
    if(dbHeaderIdx<0)throw new Error("لم يتم العثور على رأس الجدول في شيت DB");
    const dbHeader=dbRows[dbHeaderIdx];
    const colName=findCol(dbHeader,["اسم العامل","الاسم"]);
    const colCode=findCol(dbHeader,["كود العامل","الكود"]);
    const colSalary=findCol(dbHeader,["مرتب أساسي","المرتب"]);
    const colAdv=findCol(dbHeader,["سلف","السلف"]);
    const colSpec=findCol(dbHeader,["خصم خاص","خصم"]);
    const colBonus=findCol(dbHeader,["حافز التزام","حافز"]);
    const colPay=findCol(dbHeader,["دفعة الخميس","دفعة"]);
    const colBaseH=findCol(dbHeader,["ساعات أساسي","ساعات"]);
    const colBal=findCol(dbHeader,["رصيد حالي","رصيد"]);
    if(colName<0||colCode<0)throw new Error("لم يتم العثور على أعمدة الاسم/الكود في شيت DB");
    const empList=[];
    for(let i=dbHeaderIdx+1;i<dbRows.length;i++){
      const row=dbRows[i];
      if(!row)continue;
      const name=row[colName]?String(row[colName]).trim():"";
      const code=row[colCode]?String(row[colCode]).trim():"";
      if(!name||!code)continue;
      empList.push({
        code,name,
        weeklySalary:colSalary>=0?_parseXlsxNum(row[colSalary]):0,
        baseHoursDaily:colBaseH>=0?_parseXlsxNum(row[colBaseH]):9,
        advances:colAdv>=0?_parseXlsxNum(row[colAdv]):0,
        specialDeduct:colSpec>=0?_parseXlsxNum(row[colSpec]):0,
        bonus:colBonus>=0?_parseXlsxNum(row[colBonus]):0,
        thursdayPay:colPay>=0?_parseXlsxNum(row[colPay]):0,
        remainingBalance:colBal>=0?_parseXlsxNum(row[colBal]):0,
      });
    }
    /* ─── Parse F (attendance) sheet ─── headers: AC-No., Date, Total in time */
    const fRows=XLSX.utils.sheet_to_json(fSheet,{header:1,raw:false,defval:null});
    let fHeaderIdx=-1;
    for(let r=0;r<Math.min(5,fRows.length);r++){
      if(fRows[r]&&fRows[r].some(c=>c&&String(c).trim().match(/AC-?No/i))){fHeaderIdx=r;break}
    }
    if(fHeaderIdx<0)throw new Error("لم يتم العثور على رأس الجدول في شيت F");
    const fHeader=fRows[fHeaderIdx];
    const colFCode=findCol(fHeader,["AC-No.","AC-No","AC No","كود"]);
    const colFDate=findCol(fHeader,["Date","التاريخ"]);
    const colFHours=findCol(fHeader,["Total in time","Total","ساعات","الوقت"]);
    if(colFCode<0||colFDate<0||colFHours<0)throw new Error("أعمدة البصمة (AC-No, Date, Total in time) غير موجودة في شيت F");
    const attendance=[];
    for(let i=fHeaderIdx+1;i<fRows.length;i++){
      const row=fRows[i];
      if(!row)continue;
      const code=row[colFCode]?String(row[colFCode]).trim():"";
      const date=_parseXlsxDate(row[colFDate]);
      const hours=_parseXlsxTime(row[colFHours]);
      if(!code||!date)continue;
      attendance.push({code,date,hours});
    }
    /* ─── Extract week metadata from sheet 0 or 1, OR derive from attendance dates ─── */
    let weekNumFromFile=null;let weekStart=null;let weekEnd=null;
    /* Try sheet 0: look for the row with a number between 1 and 99 in a numeric context */
    if(s0Sheet){
      const s0=XLSX.utils.sheet_to_json(s0Sheet,{header:1,raw:false,defval:null});
      /* The metadata row is typically before the header row. Look for a row containing dates and a small number. */
      for(let r=0;r<Math.min(8,s0.length);r++){
        const row=s0[r];
        if(!row)continue;
        /* Look for a cell with a small integer (1-99) — likely the week number */
        for(let c=0;c<row.length;c++){
          const v=row[c];
          if(v==null)continue;
          const n=_parseXlsxNum(v);
          if(n>0&&n<=99&&Number.isInteger(n)&&String(v).length<=3){
            weekNumFromFile=n;
            break;
          }
        }
        /* Look for dates in same row */
        for(let c=0;c<row.length;c++){
          const d=_parseXlsxDate(row[c]);
          if(d){
            if(!weekStart||d<weekStart)weekStart=d;
            if(!weekEnd||d>weekEnd)weekEnd=d;
          }
        }
        if(weekNumFromFile)break;
      }
    }
    /* Fallback: derive week range from attendance dates */
    if(!weekStart||!weekEnd){
      const allDates=attendance.map(a=>a.date).filter(Boolean).sort();
      if(allDates.length>0){
        weekStart=allDates[0];
        weekEnd=allDates[allDates.length-1];
      }
    }
    return{weekNumFromFile,weekStart,weekEnd,employees:empList,attendance};
  };
  /* Match employees from Excel with employees in DB */
  const matchExcelEmployees=(excelEmps)=>{
    const matched=[];const unmatched=[];
    excelEmps.forEach(xe=>{
      /* Primary match: by fingerprint code */
      let found=activeEmps.find(e=>String(e.code||"").trim()===String(xe.code).trim());
      /* Fallback: by name (exact match) */
      if(!found){found=activeEmps.find(e=>String(e.name||"").trim()===String(xe.name).trim())}
      if(found){matched.push({excel:xe,emp:found})}
      else{unmatched.push(xe)}
    });
    return{matched,unmatched};
  };
  /* Execute import: create week, attendance, advances, draftInputs; optionally add new employees */
  const executeExcelImport=async(parsed,newEmpsToAdd,overwriteExisting,importMode="normal")=>{
    /* V15.24: Calculate week number from DATE, not sequential. Prevents imported weeks
       (e.g. 15/4) from getting higher numbers than existing newer weeks (e.g. 22/4). */
    const nextWeekNum=getWeekNum(parsed.weekStart);
    /* V15.24: Flag for analysis-only mode (no treasury/hrLog side effects) */
    const isAnalysisOnly=importMode==="analysis";
    /* Check for date overlap — same weekStart means "same week imported" */
    const existingWeek=hrWeeks.find(w=>w.weekStart===parsed.weekStart);
    if(existingWeek&&!overwriteExisting){
      return{needsConfirm:true,existingWeek};
    }
    const weekId=existingWeek?existingWeek.id:gid();
    /* Match employees */
    const{matched,unmatched}=matchExcelEmployees(parsed.employees);
    /* Build attendance map */
    const attendanceMap={};
    parsed.attendance.forEach(a=>{
      const emp=activeEmps.find(e=>String(e.code||"").trim()===String(a.code).trim());
      if(emp){attendanceMap[emp.id+"_"+a.date]={hours:r2(a.hours)}}
    });
    /* Build draftInputs */
    const salSpecialDeduct={};const salBonus={};const salThursdayPay={};
    matched.forEach(m=>{
      if(m.excel.specialDeduct>0)salSpecialDeduct[m.emp.id]=String(m.excel.specialDeduct);
      if(m.excel.bonus>0)salBonus[m.emp.id]=String(m.excel.bonus);
      if(m.excel.thursdayPay>0)salThursdayPay[m.emp.id]=String(m.excel.thursdayPay);
    });
    /* Build selectedEmps — include all matched + new added */
    const selectedEmps=matched.map(m=>m.emp.id);
    /* Build advances hrLog entries + treasury entries (only for matched emps with advance>0) */
    const newLogEntries=[];const newTreasuryEntries=[];
    matched.forEach(m=>{
      if(m.excel.advances>0){
        const logId=gid();
        newLogEntries.push({
          id:logId,type:"advance",empId:m.emp.id,empName:m.emp.name,
          amount:m.excel.advances,desc:"سلفة أسبوع W"+nextWeekNum+" (مستورد من Excel)",
          weekId,date:parsed.weekStart,by:userName,createdAt:new Date().toISOString(),
          importSource:"excel-"+(parsed.weekNumFromFile||"xlsx"),
        });
        newTreasuryEntries.push({
          id:gid(),type:"out",amount:m.excel.advances,
          desc:"سلفة "+m.emp.name+" — W"+nextWeekNum+" (مستورد)",
          category:"مرتبات",account:"SUB CASH",season:data.activeSeason||"",
          date:parsed.weekStart,day:new Date(parsed.weekStart).toLocaleDateString("ar-EG",{weekday:"long"}),
          sourceType:"hr_advance",hrLogId:logId,weekId,empId:m.emp.id,
          by:userName,createdAt:new Date().toISOString(),
          importSource:"excel-"+(parsed.weekNumFromFile||"xlsx"),
        });
      }
    });
    /* NEW: determine what new employees to add, and add their advances too */
    const newEmpIds={};/* code -> newly created id */
    const newEmpsData=[];
    unmatched.forEach(xe=>{
      if(newEmpsToAdd[xe.code]){
        const newId=gid();
        newEmpIds[xe.code]=newId;
        /* baseHours: assume 9 hours/day * 6 days = 54 per week */
        const baseHours=xe.baseHoursDaily>0?(xe.baseHoursDaily*6):54;
        newEmpsData.push({
          id:newId,name:xe.name,code:xe.code,job:"",
          weeklySalary:xe.weeklySalary,baseHours,
          phone:"",hireDate:parsed.weekStart,weeklyBonus:0,
          noBiometric:false,salaryType:"weekly",nationalId:"",prevBalance:0,
          createdFrom:"excel-import-v15-18",
        });
        selectedEmps.push(newId);
        /* Also add their attendance, advances, draft inputs */
        parsed.attendance.filter(a=>String(a.code).trim()===String(xe.code).trim()).forEach(a=>{
          attendanceMap[newId+"_"+a.date]={hours:r2(a.hours)};
        });
        if(xe.specialDeduct>0)salSpecialDeduct[newId]=String(xe.specialDeduct);
        if(xe.bonus>0)salBonus[newId]=String(xe.bonus);
        if(xe.thursdayPay>0)salThursdayPay[newId]=String(xe.thursdayPay);
        if(xe.advances>0){
          const logId=gid();
          newLogEntries.push({
            id:logId,type:"advance",empId:newId,empName:xe.name,
            amount:xe.advances,desc:"سلفة أسبوع W"+nextWeekNum+" (مستورد من Excel)",
            weekId,date:parsed.weekStart,by:userName,createdAt:new Date().toISOString(),
            importSource:"excel-"+(parsed.weekNumFromFile||"xlsx"),
          });
          newTreasuryEntries.push({
            id:gid(),type:"out",amount:xe.advances,
            desc:"سلفة "+xe.name+" — W"+nextWeekNum+" (مستورد)",
            category:"مرتبات",account:"SUB CASH",season:data.activeSeason||"",
            date:parsed.weekStart,day:new Date(parsed.weekStart).toLocaleDateString("ar-EG",{weekday:"long"}),
            sourceType:"hr_advance",hrLogId:logId,weekId,empId:newId,
            by:userName,createdAt:new Date().toISOString(),
            importSource:"excel-"+(parsed.weekNumFromFile||"xlsx"),
          });
        }
      }
    });
    /* Calculate baseHours for the week — 9 hours * 6 days = 54 is common */
    const weekBaseHours=54;/* TODO: could be derived from xe.baseHoursDaily */
    /* Execute upConfig */
    upConfig(d=>{
      if(!Array.isArray(d.hrWeeks))d.hrWeeks=[];
      if(!Array.isArray(d.employees))d.employees=[];
      if(!Array.isArray(d.hrLog))d.hrLog=[];
      if(!Array.isArray(d.treasury))d.treasury=[];
      /* Add new employees */
      newEmpsData.forEach(ne=>{d.employees.push(ne)});
      /* Find or create the week */
      const wIdx=d.hrWeeks.findIndex(w=>w.id===weekId);
      const weekData={
        id:weekId,weekNum:nextWeekNum,
        weekStart:parsed.weekStart,weekEnd:parsed.weekEnd,
        baseHours:weekBaseHours,
        status:"open",
        attendance:attendanceMap,
        selectedEmps,
        draftInputs:{
          salSpecialDeduct,salBonus,salThursdayPay,
          salPrevBalanceOverride:{},salManualInstallDeduct:{},
          salInstallOverride:{},salDeductReason:{},salBaseHoursOverride:{},
          lastSaved:new Date().toISOString(),
        },
        createdFrom:isAnalysisOnly?"excel-analysis-v15-24":"excel-import-v15-18",
        excelWeekNum:parsed.weekNumFromFile,
        /* V15.24: Analysis-only flag — prevents this week from writing to treasury/hrLog on close */
        isAnalysisOnly:isAnalysisOnly||false,
        /* V15.24: In analysis mode, advances are stored INSIDE the week (for display) — not in hrLog/treasury */
        ...(isAnalysisOnly?{analysisAdvances:newLogEntries.map(l=>({...l,weekId}))}:{}),
      };
      if(wIdx>=0){
        /* Overwrite: preserve id and close status only */
        d.hrWeeks[wIdx]={...d.hrWeeks[wIdx],...weekData};
        /* Clear existing advances for this week to avoid duplicates */
        d.hrLog=(d.hrLog||[]).filter(l=>!(l.weekId===weekId&&l.importSource&&l.importSource.startsWith("excel-")));
        d.treasury=(d.treasury||[]).filter(t=>!(t.weekId===weekId&&t.importSource&&t.importSource.startsWith("excel-")));
      }else{
        d.hrWeeks.push(weekData);
      }
      /* V15.24: Only write to hrLog/treasury in NORMAL import mode — analysis mode keeps data inside week only */
      if(!isAnalysisOnly){
        newLogEntries.forEach(l=>d.hrLog.unshift(l));
        newTreasuryEntries.forEach(t=>d.treasury.unshift(t));
      }
      /* Audit */
      addAudit(d,{category:"hr",action:isAnalysisOnly?"excel_import_analysis":"excel_import",
        target:"W"+nextWeekNum+(parsed.weekNumFromFile?" (Excel W"+parsed.weekNumFromFile+")":"")+(isAnalysisOnly?" [تحليلي]":""),
        newValue:matched.length+" موظف مطابق • "+newEmpsData.length+" موظف جديد • "+newLogEntries.length+" سلفة"+(isAnalysisOnly?" (تحليلي — لم تدخل الخزنة)":""),
        user:userName,severity:"info",notes:isAnalysisOnly?"استيراد تحليلي من Excel — لم يؤثر على الخزنة أو السلف":"استيراد بيانات أسبوع من Excel"});
    });
    return{success:true,matched:matched.length,newEmps:newEmpsData.length,
      advances:newLogEntries.length,weekNum:nextWeekNum,weekStart:parsed.weekStart,isAnalysisOnly};
  };

  /* ── Popup helpers ── */
  const openTextPopup=(cfg)=>{setTextValue(cfg.value||"");setTextPopup(cfg)};
  const openConfirm=(cfg)=>setConfirmPopup(cfg);

  /* ── Debts (installments) ── */
  const empActiveDebts=(empId)=>debts.filter(d=>d.empId===empId&&d.status==="active");
  const empAllDebts=(empId)=>debts.filter(d=>d.empId===empId).sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""));
  /* Installment due this week for an employee */
  const empDebtInstallment=(empId,week)=>{
    if(!week)return{total:0,items:[]};
    const active=empActiveDebts(empId);
    const items=[];let total=0;
    active.forEach(d=>{
      const paid=(d.paidWeekIds||[]).length;
      const remaining=d.installments-paid;
      if(remaining<=0)return;
      /* Check if this week already paid */
      if((d.paidWeekIds||[]).includes(week.id))return;
      /* Check start date — don't count installments before debt started */
      if(d.startDate&&week.weekStart<d.startDate)return;
      items.push({id:d.id,title:d.title,perWeek:d.perWeek,installments:d.installments,paid,remaining});
      total+=d.perWeek||0});
    return{total:r2(total),items}};

  const resetDebtForm=()=>{setDebtTitle("");setDebtTotal("");setDebtInstallments("");setDebtPerWeek("");setDebtStart(today);setDebtNotes("")};
  const saveDebt=(empId,editId)=>{
    const total=parseFloat(debtTotal);const inst=parseInt(debtInstallments);const perWeek=parseFloat(debtPerWeek);
    if(!debtTitle.trim()||!total||!inst||!perWeek){showToast("⚠️ أكمل البيانات");return}
    const emp=employees.find(e=>e.id===empId);if(!emp)return;
    upConfig(d=>{if(!d.empDebts)d.empDebts=[];
      if(editId){const i=d.empDebts.findIndex(x=>x.id===editId);if(i>=0){
        d.empDebts[i]={...d.empDebts[i],title:debtTitle.trim(),total,installments:inst,perWeek,startDate:debtStart,notes:debtNotes}}}
      else{d.empDebts.push({id:gid(),empId,empName:emp.name,title:debtTitle.trim(),total,installments:inst,perWeek,startDate:debtStart,notes:debtNotes,status:"active",paidWeekIds:[],createdBy:userName,createdAt:new Date().toISOString()})}});
    setShowDebtForm(null);resetDebtForm();showToast("✓ تم الحفظ")};
  const cancelDebt=(debtId)=>{openConfirm({title:"إلغاء المديونية",message:"سيتم تعليم هذه المديونية كملغاة. هل أنت متأكد؟",variant:"warn",onConfirm:()=>{
    upConfig(d=>{const i=(d.empDebts||[]).findIndex(x=>x.id===debtId);if(i>=0){d.empDebts[i].status="cancelled";d.empDebts[i].cancelledAt=today;d.empDebts[i].cancelledBy=userName}});showToast("✓ تم الإلغاء")}})};
  const delDebt=(debtId)=>{openConfirm({title:"حذف المديونية",message:"سيتم حذف هذه المديونية نهائياً. لن يمكن استرجاعها.",variant:"danger",onConfirm:()=>{
    upConfig(d=>{d.empDebts=(d.empDebts||[]).filter(x=>x.id!==debtId)});showToast("✓ تم الحذف")}})};

  /* ── Current week boundaries (Sat→Thu) ── */
  const _cwToday=new Date();const _cwDow=_cwToday.getDay();
  const _cwToSat=_cwDow===6?0:(_cwDow+1);
  const _cwSat=new Date(_cwToday);_cwSat.setDate(_cwToday.getDate()-_cwToSat);
  const _cwThu=new Date(_cwSat);_cwThu.setDate(_cwSat.getDate()+5);
  const cwStart=_cwSat.toISOString().split("T")[0];
  const cwEnd=_cwThu.toISOString().split("T")[0];
  const inCW=(dt)=>dt&&dt>=cwStart&&dt<=cwEnd;

  /* Current week advances per employee */
  const cwAdvances={};
  hrLog.filter(l=>l.type==="advance"&&inCW(l.date)).forEach(l=>{cwAdvances[l.empId]=(cwAdvances[l.empId]||0)+(Number(l.amount)||0)});
  /* Also check treasury for hr_advance entries not in hrLog */
  const cwLogIds=new Set(hrLog.filter(l=>l.type==="advance"&&inCW(l.date)).map(l=>l.id));
  (data.treasury||[]).filter(t=>t.type==="out"&&inCW(t.date)&&t.sourceType==="hr_advance"&&!cwLogIds.has(t.hrLogId)).forEach(t=>{cwAdvances[t.empId]=(cwAdvances[t.empId]||0)+(Number(t.amount)||0)});
  const cwTotalAdv=Object.values(cwAdvances).reduce((s,v)=>s+v,0);
  const cwTotalSalary=activeEmps.reduce((s,e)=>s+(e.weeklySalary||0),0);

  return<div>
    <div style={{display:"flex",gap:0,marginBottom:16,borderRadius:10,overflow:"hidden",border:"1px solid "+T.brd}}>
      {[
        {k:"weeks",l:"📅 الأسابيع",c:hrWeeks.length,show:canViewWeeks},
        {k:"weeklySummary",l:"📊 سجل أسبوعي",show:canViewWeeks},
        {k:"monthlySummary",l:"📅 سجل شهري",show:canViewWeeks},
        {k:"employees",l:"👷 الموظفين",c:activeEmps.length,show:canViewEmployees},
        {k:"verify",l:"🔐 تأكيد الاستلام",show:canViewVerify},
        {k:"security",l:"🛡️ الأمن والرقابة",c:auditLog.length,show:canViewSecurity}
      ].filter(v=>v.show).map(v=>
        <div key={v.k} onClick={()=>{setView(v.k);setOpenWeekId(null)}} style={{flex:1,padding:"10px 0",textAlign:"center",cursor:"pointer",fontWeight:700,fontSize:FS-1,background:view===v.k?T.accent:T.cardSolid,color:view===v.k?"#fff":T.textSec,transition:"all 0.15s"}}>{v.l}{v.c!=null?" ("+v.c+")":""}</div>)}
    </div>

    {/* ══ FIXED EMPLOYEE REGISTER — moved to weeklySummary tab ══ */}

    {/* ══ WEEKS LIST ══ */}
    {view==="weeks"&&!openWeekId&&<div>
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        {canEdit&&<Btn primary onClick={()=>{
          /* Auto-calc current week sat→thu */
          const tdy=new Date();const dow=tdy.getDay();/* 0=Sun 1=Mon...6=Sat */
          const toSat=dow===6?0:(dow+1);/* back to last Saturday */
          const sat=new Date(tdy);sat.setDate(tdy.getDate()-toSat);
          const thu=new Date(sat);thu.setDate(sat.getDate()+5);
          setNwStart(sat.toISOString().split("T")[0]);
          setNwEnd(thu.toISOString().split("T")[0]);
          setNwBaseHours(hrs.defaultBaseHours||48);
          setShowNewWeek(!showNewWeek)
        }}>{showNewWeek?"✕":"+ أسبوع جديد"}</Btn>}
        {canEdit&&<Btn onClick={()=>{setMatrixEmps(activeEmps.map(e=>({empId:e.id,name:e.name,amount:0})));setMatrixDate(today);setMatrixDesc("سلفة");setShowMatrix(true)}} style={{background:"#F59E0B12",color:"#F59E0B",border:"1px solid #F59E0B30"}}>💸 دفعات مجمعة</Btn>}
        {/* V15.24: Excel import buttons available at overview level — no need to open a week first */}
        {canEdit&&<Btn onClick={()=>{setExcelImportMode("normal");setShowExcelImport(true)}} style={{background:"#10B98112",color:"#10B981",border:"1px solid #10B98130",fontWeight:700}} title="استيراد أسبوع كامل من Excel — يسجل السلف في الخزنة عادي">📥 استيراد Excel</Btn>}
        {canEdit&&<Btn onClick={()=>{setExcelImportMode("analysis");setShowExcelImport(true)}} style={{background:"#3B82F612",color:"#3B82F6",border:"1px solid #3B82F630",fontWeight:700}} title="استيراد أسبوع للتحليل والعرض فقط — لن يؤثر على الخزنة أو السلف">📊 استيراد تحليلي</Btn>}
      </div>
      {showNewWeek&&<Card title="+ فتح أسبوع جديد" style={{marginBottom:16}}>
        <div style={{display:"flex",gap:6,marginBottom:10}}>
          <span onClick={()=>{const tdy=new Date();const dow=tdy.getDay();const toSat=dow===6?0:(dow+1);const sat=new Date(tdy);sat.setDate(tdy.getDate()-toSat);const thu=new Date(sat);thu.setDate(sat.getDate()+5);setNwStart(sat.toISOString().split("T")[0]);setNwEnd(thu.toISOString().split("T")[0]);setNwBaseHours(hrs.defaultBaseHours||48)}} style={{cursor:"pointer",padding:"6px 14px",borderRadius:8,fontSize:FS-1,fontWeight:700,background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}}>سبت → خميس (6 أيام)</span>
          <span onClick={()=>{const tdy=new Date();const dow=tdy.getDay();const toSat=dow===6?0:(dow+1);const sat=new Date(tdy);sat.setDate(tdy.getDate()-toSat);const fri=new Date(sat);fri.setDate(sat.getDate()+6);setNwStart(sat.toISOString().split("T")[0]);setNwEnd(fri.toISOString().split("T")[0]);setNwBaseHours(Math.round((hrs.defaultBaseHours||48)*7/6))}} style={{cursor:"pointer",padding:"6px 14px",borderRadius:8,fontSize:FS-1,fontWeight:700,background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}}>سبت → جمعة (7 أيام)</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"repeat(3,1fr)",gap:10}}>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>بداية الأسبوع</label><Inp type="date" value={nwStart} onChange={setNwStart}/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>نهاية الأسبوع</label><Inp type="date" value={nwEnd} onChange={setNwEnd}/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>ساعات أساسي هذا الأسبوع</label><Inp type="number" value={nwBaseHours} onChange={setNwBaseHours} placeholder="48"/></div>
        </div>
        <div style={{marginTop:10}}><Btn primary onClick={createWeek}>📅 فتح الأسبوع</Btn></div>
      </Card>}
      {/* Split view: Weeks list (left) + Advances panel (right) */}
      <div style={{display:isMob?"block":"flex",gap:16,alignItems:"flex-start"}}>
        {/* ── LEFT: Weeks list ── */}
        <div style={{flex:isMob?"auto":"1 1 55%",minWidth:0}}>
      {hrWeeks.length>0?<div style={{display:"flex",flexDirection:"column",gap:10}}>
        {/* V15.24: Sort weeks by date DESC (newest first) regardless of insertion order */}
        {[...hrWeeks].sort((a,b)=>(b.weekStart||"").localeCompare(a.weekStart||"")).map(w=>{const isSelected=previewWeekId===w.id;
          /* Compute live stats for open week (if not closed, recalculate from current data) */
          let wGross=w.totalGross||0,wThursday=w.totalThursdayPay||0,wRemaining=w.totalRemaining||0,wEmpCount=w.empCount||0,wWeeklyAdv=w.totalWeeklyAdvances||0;
          /* Sum of prev balances — use the SAME value that calcSalary uses (respects manual overrides + excludes employees not in this week) */
          let wPrevBalances=0;
          /* V15.70: Net amount owed to employees after ALL deductions + carryover = Σ totalDue */
          let wNetOwed=0;
          if(w.status!=="closed"){
            /* Live calculation for open weeks */
            const wSelected=(w.selectedEmps&&Array.isArray(w.selectedEmps))?w.selectedEmps:[];
            const wShown=activeEmps.filter(e=>wSelected.includes(e.id));
            wEmpCount=wShown.length;
            let liveG=0,liveT=0,liveR=0,livePB=0,liveNet=0;
            wShown.forEach(e=>{
              const c=calcSalary(e.id,w);
              if(c){
                liveG+=c.grossPay||0;
                liveT+=c.thursdayPay||0;
                liveR+=c.remainingBalance||0;
                /* Use prevBalance from calcSalary — same value shown in salary table row */
                livePB+=Number(c.prevBalance)||0;
                /* totalDue = netBalance + prevBalance = final amount owed after all deductions */
                liveNet+=Number(c.totalDue)||0;
              }
            });
            wGross=liveG;wThursday=liveT;wRemaining=liveR;wPrevBalances=livePB;wNetOwed=liveNet;
            wWeeklyAdv=(w.weeklyAdvances||[]).reduce((s,a)=>s+(Number(a.amount)||0),0);
          }else{
            /* V15.70: For closed weeks, read from closedRecords snapshot */
            const records=Array.isArray(w.closedRecords)?w.closedRecords:[];
            wPrevBalances=records.reduce((s,r)=>s+(Number(r.prevBalance)||0),0);
            wNetOwed=records.reduce((s,r)=>s+(Number(r.totalDue)||0),0);
          }
          const isClosedW=w.status==="closed";
          /* Carried balances — show BOTH: prev (from previous weeks) and next (to be rolled to next week) */
          const wPrev=wPrevBalances;/* مرحّل سابق — من أسابيع قديمة */
          const wNext=wRemaining;/* مرحّل للأسبوع القادم — متبقي بعد مدفوعات هذا الأسبوع */
          return<div key={w.id} style={{padding:isMob?10:14,borderRadius:16,background:isSelected?T.accent+"06":T.cardSolid,border:"2px solid "+(isSelected?T.accent:isClosedW?T.ok+"30":T.accent+"30"),boxShadow:T.shadow,transition:"all 0.15s",cursor:"pointer"}} onClick={()=>setPreviewWeekId(isSelected?null:w.id)}>
          {/* Header row */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <div style={{display:"flex",alignItems:"center",gap:isMob?10:16,flex:1}}>
              <span style={{fontSize:isMob?20:28,fontWeight:900,color:isClosedW?T.ok:T.accent,lineHeight:1}}>{"W"+w.weekNum}</span>
              <div>
                <div style={{fontSize:FS+1,fontWeight:800,color:T.text}}>{w.weekStart+" → "+w.weekEnd}</div>
                <div style={{fontSize:FS-2,color:T.textMut,marginTop:2}}>{"ساعات أساسي: "+w.baseHours+(isClosedW?" • أُقفل: "+w.closedAt:"")}</div>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:isMob?6:10,flexWrap:"wrap"}}>
              <span style={{padding:"6px 14px",borderRadius:10,fontSize:FS-1,fontWeight:800,background:isClosedW?T.ok+"15":T.warn+"15",color:isClosedW?T.ok:T.warn,border:"1px solid "+(isClosedW?T.ok+"30":T.warn+"30")}}>{isClosedW?"✅ مقفول":"🔓 مفتوح"}</span>
              {/* V15.24: Analysis-only badge — makes it immediately obvious this week is display-only */}
              {w.isAnalysisOnly&&<span style={{padding:"6px 12px",borderRadius:10,fontSize:FS-1,fontWeight:800,background:"#3B82F615",color:"#3B82F6",border:"1px solid #3B82F640"}} title="هذا الأسبوع مستورد للتحليل فقط — لا يؤثر على الخزنة أو السلف">📊 تحليلي</span>}
              <span onClick={e=>{e.stopPropagation();setOpenWeekId(w.id)}} style={{cursor:"pointer",padding:"6px 18px",borderRadius:10,background:T.accent,color:"#fff",fontSize:FS-1,fontWeight:800,border:"none"}}>فتح</span>
              {/* V15.71: Weekly financial summary for CFO */}
              <span onClick={e=>{e.stopPropagation();printWeeklyFinancialSummary(w)}} style={{cursor:"pointer",padding:"6px 12px",borderRadius:10,background:"#DC262612",color:"#DC2626",fontSize:FS-1,fontWeight:700,border:"1px solid #DC262630",display:"inline-flex",alignItems:"center",gap:4}} title="طباعة تقرير أسبوعي مالي للمدير المالي">🖨️ تقرير مالي</span>
              {canEdit&&(!isClosedW||unlockedWeeks[w.id])&&<span onClick={e=>{e.stopPropagation();
                /* V14.55: Compute full impact analysis for clean-delete option */
                const wSelectedDel=(w.selectedEmps&&Array.isArray(w.selectedEmps))?w.selectedEmps:[];
                const linkedTreasurySalaries=(data.treasury||[]).filter(t=>t.sourceType==="hr_salary"&&t.weekId===w.id);
                const linkedTreasuryAdvances=(data.treasury||[]).filter(t=>(t.sourceType==="hr_weekly_advance"||t.sourceType==="hr_advance")&&t.weekId===w.id);
                const linkedHrAdvances=(data.hrLog||[]).filter(l=>l.type==="advance"&&l.weekId===w.id);
                const linkedHrWeeklyAdv=(data.hrLog||[]).filter(l=>l.type==="weekly_advance"&&l.weekId===w.id);
                const linkedHrSalary=(data.hrLog||[]).filter(l=>l.type==="salary"&&l.weekId===w.id);
                const debtsWithPayment=(data.empDebts||[]).filter(debt=>(debt.partialPayments||{})[w.id]);
                const totalSalaries=linkedTreasurySalaries.reduce((s,t)=>s+(Number(t.amount)||0),0);
                const totalAdvances=linkedTreasuryAdvances.reduce((s,t)=>s+(Number(t.amount)||0),0);
                const hasTreasuryLinks=linkedTreasurySalaries.length>0||linkedTreasuryAdvances.length>0;
                setCleanDeletePopup({
                  week:w,
                  hasTreasuryLinks,
                  linkedTreasurySalaries,
                  linkedTreasuryAdvances,
                  linkedHrAdvances,
                  linkedHrWeeklyAdv,
                  linkedHrSalary,
                  debtsWithPayment,
                  totalSalaries,
                  totalAdvances,
                  empCount:wSelectedDel.length,
                  attendanceCount:Object.keys(w.attendance||{}).length,
                  confirmStep:0,
                  confirmText:""
                });
              }} style={{cursor:"pointer",padding:"6px 12px",borderRadius:10,background:T.err+"12",color:T.err,fontSize:FS-1,fontWeight:700,border:"1px solid "+T.err+"30"}} title="حذف الأسبوع">🗑️</span>}
            </div>
          </div>
          {/* Compact stats row — inline summary */}
          <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:isMob?8:14,paddingTop:isMob?8:10,marginTop:isMob?8:10,borderTop:"1px solid "+T.brd,fontSize:FS-1}}>
            <span style={{display:"inline-flex",alignItems:"center",gap:4}} title="عدد العمال">
              <span style={{color:T.textSec}}>👷</span>
              <span style={{fontWeight:800,color:T.accent}}>{wEmpCount||"—"}</span>
              <span style={{color:T.textMut,fontSize:FS-2}}>عامل</span>
            </span>
            <span style={{color:T.brd}}>•</span>
            <span style={{display:"inline-flex",alignItems:"center",gap:4}} title="إجمالي المستحق للأسبوع">
              <span style={{color:T.textSec}}>💰</span>
              <span style={{color:T.textMut,fontSize:FS-2}}>مستحق</span>
              <span style={{fontWeight:800,color:"#06B6D4"}}>{wGross?fmt0(wGross):"—"}</span>
            </span>
            <span style={{color:T.brd}}>•</span>
            {/* V15.70: Net owed = totalDue = net after ALL deductions + previous carryover */}
            <span style={{display:"inline-flex",alignItems:"center",gap:4}} title={"الصافي بعد كل الخصومات والترحيلات: "+fmt0(wNetOwed)+"\n(المبلغ اللي المفروض يصرف للعمال بالفعل)"}>
              <span style={{color:T.textSec}}>💵</span>
              <span style={{color:T.textMut,fontSize:FS-2}}>صافي</span>
              <span style={{fontWeight:800,color:"#10B981"}}>{wNetOwed?fmt0(wNetOwed):"—"}</span>
            </span>
            <span style={{color:T.brd}}>•</span>
            <span style={{display:"inline-flex",alignItems:"center",gap:4}} title={"مرحّل من أسابيع سابقة: "+fmt0(wPrev)+"\n(موجب = عليهم فلوس، سالب = ليهم فلوس)"}>
              <span style={{color:T.textSec}}>🔄</span>
              <span style={{color:T.textMut,fontSize:FS-2}}>سابق</span>
              <span style={{fontWeight:800,color:wPrev>0?T.warn:wPrev<0?T.ok:T.textMut}}>{wPrev?fmt0(wPrev):"—"}</span>
            </span>
            <span style={{color:T.brd}}>•</span>
            <span style={{display:"inline-flex",alignItems:"center",gap:4}} title={"المتوقع ترحيله للأسبوع القادم بعد الإقفال: "+fmt0(wNext)+"\n(موجب = عليهم فلوس، سالب = ليهم فلوس)"}>
              <span style={{color:T.textSec}}>⏭️</span>
              <span style={{color:T.textMut,fontSize:FS-2}}>قادم</span>
              <span style={{fontWeight:800,color:wNext>0?T.warn:wNext<0?T.ok:T.textMut}}>{wNext?fmt0(wNext):"—"}</span>
            </span>
          </div>
          {/* V14.62: Receipt verification status row — V14.66: Show for both closed AND open weeks */}
          {(isClosedW||Object.keys(w.receipts||{}).length>0||Object.keys(getPendingForWeek(w.id)).length>0)&&(()=>{
            const wkSelected=(w.selectedEmps&&Array.isArray(w.selectedEmps))?w.selectedEmps:[];
            const wkEmps=activeEmps.filter(e=>wkSelected.includes(e.id));
            /* V15.25: Use merged receipts (Firestore + queue) */
            const receipts=mergedReceipts(w);
            const issues=w.receiptIssues||{};
            const received=wkEmps.filter(e=>receipts[e.id]);
            const withIssues=wkEmps.filter(e=>issues[e.id]);
            const notReceived=wkEmps.length-received.length;
            const totalDue=wkEmps.reduce((s,e)=>{const c=getEmpSalary(e.id,w);return s+(c?c.thursdayPay:0)},0);
            const totalConfirmed=received.reduce((s,e)=>{const c=getEmpSalary(e.id,w);return s+(c?c.thursdayPay:0)},0);
            const pctDone=wkEmps.length>0?Math.round((received.length/wkEmps.length)*100):0;
            const isFullMatch=wkEmps.length>0&&received.length===wkEmps.length&&withIssues.length===0;
            const isNone=received.length===0&&withIssues.length===0;
            const hasIssues=withIssues.length>0;
            /* Status: match / issues / partial / none */
            const statusColor=hasIssues?T.err:isFullMatch?T.ok:isNone?T.textMut:T.warn;
            const statusBg=hasIssues?T.err+"08":isFullMatch?T.ok+"08":isNone?T.textMut+"08":T.warn+"08";
            const statusBorder=hasIssues?T.err+"40":isFullMatch?T.ok+"35":isNone?T.textMut+"20":T.warn+"35";
            const statusIcon=hasIssues?"🚨":isFullMatch?"✅":isNone?"⏳":"⚠️";
            const statusLabel=hasIssues?"يوجد مشاكل ("+withIssues.length+")":isFullMatch?"تم التطابق الكامل":isNone?"لم يبدأ التأكيد":"تأكيد جزئي";
            return<div style={{marginTop:10,padding:"10px 12px",borderRadius:10,background:statusBg,border:"1.5px solid "+statusBorder,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
              <span style={{fontSize:isMob?18:22}}>{statusIcon}</span>
              <div style={{flex:1,minWidth:150}}>
                <div style={{fontSize:FS-1,fontWeight:800,color:statusColor,lineHeight:1.2}}>{statusLabel}</div>
                <div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>
                  {received.length}/{wkEmps.length} موظف • {pctDone}%{hasIssues?" • مشاكل: "+withIssues.length:""}
                </div>
              </div>
              {/* Progress bar */}
              <div style={{flex:2,minWidth:100,height:8,background:T.brd,borderRadius:4,overflow:"hidden",position:"relative"}}>
                <div style={{position:"absolute",top:0,insetInlineEnd:0,height:"100%",width:pctDone+"%",background:statusColor,transition:"width 0.3s"}}></div>
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center",fontSize:FS-2}}>
                <span style={{color:T.textMut}}>💰</span>
                <span style={{fontWeight:800,color:statusColor,fontFamily:"monospace"}}>{fmt0(totalConfirmed)}</span>
                <span style={{color:T.textMut}}>/</span>
                <span style={{fontWeight:700,color:T.textSec,fontFamily:"monospace"}}>{fmt0(totalDue)}</span>
              </div>
              {(notReceived>0||hasIssues)&&<>
                {/* V14.63: Direct scan button — jumps to verify tab. V15.26: Respects amounts-review checkpoint.
                   V15.28: Only shown if user has verify edit permission (separation of duties) */}
                {canEditVerify&&<span onClick={e=>{e.stopPropagation();setView("verify");setVerifySelectedWeekId(w.id);
                  /* Only auto-open camera if amounts already reviewed for this week */
                  setTimeout(()=>{if(verifyAmountsReviewed[w.id])setVerifyScanning(true)},200)
                }} style={{cursor:"pointer",padding:"5px 12px",borderRadius:6,background:T.ok,color:"#fff",border:"none",fontSize:FS-2,fontWeight:800,display:"inline-flex",alignItems:"center",gap:4}} title="فتح الكاميرا والسكان مباشرة">📷 سكان</span>}
                {canViewVerify&&<span onClick={e=>{e.stopPropagation();setView("verify");setVerifySelectedWeekId(w.id)}} style={{cursor:"pointer",padding:"5px 10px",borderRadius:6,background:statusColor+"15",color:statusColor,border:"1px solid "+statusColor+"30",fontSize:FS-2,fontWeight:800}} title="انتقل لشاشة التأكيد">→ تأكيد</span>}
              </>}
            </div>;
          })()}
        </div>})}
      </div>:<div style={{textAlign:"center",padding:40,color:T.textMut}}>لم يتم فتح أسابيع بعد — اضغط "+ أسبوع جديد"</div>}
        </div>
        {/* ── RIGHT: Advances panel for selected week or current week ── */}
        {!isMob&&(()=>{const pw=hrWeeks.find(w=>w.id===previewWeekId);
          /* Use selected week dates, or fallback to current week dates */
          const pStart=pw?pw.weekStart:cwStart;
          const pEnd=pw?pw.weekEnd:cwEnd;
          const pLabel=pw?"W"+pw.weekNum+" ("+pStart+" → "+pEnd+")":"الأسبوع الحالي ("+cwStart+" → "+cwEnd+")";
          const inWk=(dt)=>dt&&dt>=pStart&&dt<=pEnd;
          const wAdvances=hrLog.filter(l=>l.type==="advance"&&((pw&&l.weekId===pw.id)||inWk(l.date)));
          const seenIds=new Set(wAdvances.map(a=>a.id));
          const wTreasury=(data.treasury||[]).filter(t=>t.type==="out"&&t.sourceType==="hr_advance"&&inWk(t.date)&&!seenIds.has(t.hrLogId));
          const allAdv=[...wAdvances.map(a=>({...a,src:"hrLog"})),...wTreasury.map(t=>({empId:t.empId,empName:(employees.find(e=>e.id===t.empId)||{}).name||"",amount:t.amount,date:t.date,desc:t.desc||"سلفة",by:t.by||"",src:"treasury"}))];
          const totalAdv=allAdv.reduce((s,a)=>s+(Number(a.amount)||0),0);
          /* Group by employee */
          const byEmp={};allAdv.forEach(a=>{if(!byEmp[a.empId])byEmp[a.empId]={name:a.empName,total:0,items:[]};byEmp[a.empId].total+=Number(a.amount)||0;byEmp[a.empId].items.push(a)});
          return<div style={{flex:"0 0 40%",minWidth:0}}>
            <Card title={"💸 سلف "+pLabel} accent={T.accent} style={{position:"sticky",top:80}}>
              {allAdv.length>0?<div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,padding:"8px 12px",borderRadius:8,background:T.err+"08",border:"1px solid "+T.err+"20"}}>
                  <span style={{fontSize:FS,fontWeight:700,color:T.text}}>إجمالي السلف</span>
                  <span style={{fontSize:FS+2,fontWeight:800,color:T.err}}>{fmt0(r2(totalAdv))+" ج.م"}</span>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {Object.entries(byEmp).map(([empId,d])=><div key={empId} style={{padding:"8px 12px",borderRadius:10,border:"1px solid "+T.brd,background:T.bg}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                      <span style={{fontSize:FS,fontWeight:700}}>{d.name}</span>
                      <span style={{fontSize:FS,fontWeight:800,color:T.err}}>{fmt0(r2(d.total))}</span>
                    </div>
                    {d.items.map((it,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:FS-2,color:T.textSec,padding:"2px 0"}}>
                      <span>{it.date+" — "+(it.desc||"سلفة")}</span>
                      <span style={{fontWeight:600,color:T.err}}>{fmt0(it.amount)}</span>
                    </div>)}
                  </div>)}
                </div>
              </div>:<div style={{textAlign:"center",padding:20,color:T.textMut}}>لا توجد سلف في هذا الأسبوع</div>}
            </Card>
          </div>})()}
      </div>
      {/* Mobile: show advances below when week selected */}
      {isMob&&(()=>{const pw=hrWeeks.find(w=>w.id===previewWeekId);
        const pStart=pw?pw.weekStart:cwStart;const pEnd=pw?pw.weekEnd:cwEnd;
        const pLabel=pw?"W"+pw.weekNum:cwStart+" → "+cwEnd;
        const inWk=(dt)=>dt&&dt>=pStart&&dt<=pEnd;
        const wAdv=hrLog.filter(l=>l.type==="advance"&&((pw&&l.weekId===pw.id)||inWk(l.date)));
        const totalAdv=wAdv.reduce((s,a)=>s+(Number(a.amount)||0),0);
        return<Card title={"💸 سلف "+pLabel} style={{marginTop:12}}>
          {wAdv.length>0?<div>
            <div style={{fontSize:FS,fontWeight:800,color:T.err,marginBottom:8}}>{"إجمالي: "+fmt0(r2(totalAdv))+" ج.م"}</div>
            {wAdv.map((a,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid "+T.brd,fontSize:FS-1}}>
              <span style={{fontWeight:600}}>{a.empName}</span>
              <span style={{color:T.err,fontWeight:700}}>{fmt0(a.amount)+" — "+a.date}</span>
            </div>)}
          </div>:<div style={{textAlign:"center",padding:16,color:T.textMut}}>لا توجد سلف</div>}
        </Card>})()}
    </div>}

    {/* ══ OPEN WEEK DETAIL ══ */}
    {view==="weeks"&&openWeek&&(()=>{
      const isClosed=openWeek.status==="closed";
      const isLocked=isClosed&&!unlockedWeeks[openWeek.id];
      const att=openWeek.attendance||{};
      /* Build date range */
      const dates=[];const s=new Date(openWeek.weekStart);const e=new Date(openWeek.weekEnd);
      for(let d=new Date(s);d<=e;d.setDate(d.getDate()+1))dates.push(d.toISOString().split("T")[0]);
      const dayNames=["أحد","اثنين","ثلاثاء","أربعاء","خميس","جمعة","سبت"];
      return<div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <Btn ghost onClick={()=>setOpenWeekId(null)}>← رجوع</Btn>
            <span style={{fontSize:20,fontWeight:800,color:isClosed?T.ok:T.accent}}>{"W"+openWeek.weekNum}</span>
            <span style={{fontSize:FS,color:T.textSec}}>{openWeek.weekStart+" → "+openWeek.weekEnd}</span>
            <span style={{padding:"3px 10px",borderRadius:6,fontSize:FS-2,fontWeight:700,background:isClosed&&!unlockedWeeks[openWeek.id]?T.ok+"12":unlockedWeeks[openWeek.id]?T.warn+"12":T.warn+"12",color:isClosed&&!unlockedWeeks[openWeek.id]?T.ok:T.warn}}>{isClosed&&!unlockedWeeks[openWeek.id]?"✅ مقفول":unlockedWeeks[openWeek.id]?"🔓 تعديل":"🔓 مفتوح"}</span>
            {/* V15.24: Analysis-only badge inside open week header */}
            {openWeek.isAnalysisOnly&&<span style={{padding:"3px 10px",borderRadius:6,fontSize:FS-2,fontWeight:800,background:"#3B82F615",color:"#3B82F6",border:"1px solid #3B82F640"}}>📊 تحليلي</span>}
            {canEdit&&isClosed&&!unlockedWeeks[openWeek.id]&&<Btn small onClick={()=>openConfirm({title:"تفعيل تعديل الأسبوع",message:"هذا الأسبوع مقفول بالفعل. تفعيل التعديل يسمح لك بتعديل البيانات، لكن الحركات المالية (خزنة / سجل) لن تتحدث تلقائياً. لإعادة الاعتماد والتأثير على الخزنة، اضغط على اعتماد من جديد.",variant:"warn",onConfirm:()=>setUnlockedWeeks(p=>({...p,[openWeek.id]:true}))})} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30",fontWeight:700,fontSize:FS-2}}>🔓 تفعيل التعديل</Btn>}
            {canEdit&&unlockedWeeks[openWeek.id]&&<Btn small onClick={()=>setUnlockedWeeks(p=>{const n={...p};delete n[openWeek.id];return n})} style={{background:T.bg,color:T.textSec,border:"1px solid "+T.brd,fontSize:FS-2}}>🔒 إيقاف التعديل</Btn>}
            {/* Restore button — only shown if week was closed TODAY and has a snapshot */}
            {canEdit&&isClosed&&openWeek.snapshotId&&openWeek.snapshotDate===today&&<Btn small onClick={()=>setRestorePopup({snapshotId:openWeek.snapshotId,week:openWeek,confirmText:""})} style={{background:"#8B5CF612",color:"#8B5CF6",border:"1px solid #8B5CF640",fontWeight:700,fontSize:FS-2}} title="استعادة الأسبوع للحالة قبل الإقفال (متاح في نفس اليوم فقط)">⏪ استعادة قبل الإقفال</Btn>}
          </div>
          {!isLocked&&<div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:FS-2,color:T.textSec}}>ساعات أساسي:</span>
              <input type="number" value={openWeek.baseHours||48} onChange={ev=>setWeekBaseHours(ev.target.value)} style={{width:60,padding:"4px 6px",borderRadius:6,border:"1px solid "+T.brd,fontSize:FS,fontFamily:"inherit",textAlign:"center",background:T.inputBg,color:T.text,fontWeight:700}}/>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6}} title="ساعات اليوم لهذا الأسبوع (استثناء). لو فارغ بيستخدم الإعدادات العامة.">
              <span style={{fontSize:FS-2,color:T.textSec}}>ساعات يومي:</span>
              <input type="number" step="0.5" value={openWeek.hoursPerDay!=null?openWeek.hoursPerDay:""} onChange={ev=>{
                const v=ev.target.value;
                upConfig(d=>{const wi=(d.hrWeeks||[]).findIndex(w=>w.id===openWeekId);if(wi<0)return;
                  if(v===""||v==null)delete d.hrWeeks[wi].hoursPerDay;
                  else d.hrWeeks[wi].hoursPerDay=Number(v)||0});
              }} placeholder={String(Number(hrs.hoursPerDay)||9)} style={{width:60,padding:"4px 6px",borderRadius:6,border:"1px solid "+(openWeek.hoursPerDay!=null?T.warn+"50":T.brd),fontSize:FS,fontFamily:"inherit",textAlign:"center",background:openWeek.hoursPerDay!=null?T.warn+"08":T.inputBg,color:openWeek.hoursPerDay!=null?T.warn:T.text,fontWeight:700}}/>
              {openWeek.hoursPerDay!=null&&<span onClick={()=>upConfig(d=>{const wi=(d.hrWeeks||[]).findIndex(w=>w.id===openWeekId);if(wi<0)return;delete d.hrWeeks[wi].hoursPerDay})} title="استخدم الافتراضي من الإعدادات" style={{cursor:"pointer",fontSize:FS-2,color:T.textMut,padding:"2px 6px"}}>↺</span>}
            </div>
          </div>}
        </div>

        {/* V15.24: Analysis-only warning banner — prominent visual indicator */}
        {openWeek.isAnalysisOnly&&<div style={{padding:"12px 16px",marginBottom:14,borderRadius:12,background:"#3B82F610",border:"1.5px solid #3B82F640",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <span style={{fontSize:24}}>📊</span>
          <div style={{flex:1,minWidth:200}}>
            <div style={{fontSize:FS,fontWeight:800,color:"#3B82F6",marginBottom:2}}>أسبوع تحليلي — للعرض والتقارير فقط</div>
            <div style={{fontSize:FS-2,color:T.textSec,lineHeight:1.6}}>
              ✗ السلف والمرتبات لن تدخل الخزنة عند الإقفال
              {" • "}
              ✗ لن يؤثر على رصيد الموظفين
              {" • "}
              ✓ قابل للتعديل والإقفال والحذف
            </div>
          </div>
        </div>}

        {/* ── Week Summary Cards (8 cards above paste) ── */}
        {(()=>{
          const weekSelected=getSelectedEmps(openWeek.id);
          const shownEmps=activeEmps.filter(e=>weekSelected.includes(e.id));
          /* V14.53: Use saved closedStats for closed weeks (prevents changes from affecting display) */
          const isWeekClosed=openWeek.status==="closed";
          const savedStats=openWeek.closedStats;
          let baseSal,basicEntitled,overtimePay,grossPay,advances,deductions,specialDeductions,thursdayPay;
          let displayEmpCount,displayAdvCount;
          if(isWeekClosed&&savedStats){
            /* Use saved values from when the week was closed */
            baseSal=savedStats.baseSal||0;
            basicEntitled=savedStats.basicEntitled||0;
            overtimePay=savedStats.overtimePay||0;
            grossPay=savedStats.grossPay||0;
            advances=savedStats.advances||0;
            deductions=savedStats.deductions||0;
            specialDeductions=savedStats.specialDeductions||0;
            thursdayPay=savedStats.thursdayPay||0;
            displayEmpCount=savedStats.empCount||shownEmps.length;
            displayAdvCount=savedStats.weeklyAdvancesCount||weeklyAdvances.length;
          } else {
            /* Live calculation for open weeks OR closed weeks without snapshot (legacy) */
            baseSal=0;advances=0;deductions=0;specialDeductions=0;thursdayPay=0;
            basicEntitled=0;overtimePay=0;grossPay=0;
            shownEmps.forEach(e=>{
              const c=calcSalary(e.id,openWeek);
              if(!c)return;
              baseSal+=(e.weeklySalary||0);
              advances+=c.weekAdvances||0;
              deductions+=c.debtInstall||0;
              specialDeductions+=c.specialDeduct||0;
              thursdayPay+=c.thursdayPay||0;
              basicEntitled+=c.basicPay||0;
              overtimePay+=c.overtimePay||0;
              grossPay+=c.grossPay||0;
            });
            displayEmpCount=shownEmps.length;
            displayAdvCount=weeklyAdvances.length;
          }
          return<div style={{display:"grid",gridTemplateColumns:isMob?"repeat(2,1fr)":"repeat(9,1fr)",gap:8,marginBottom:14}}>
            {isWeekClosed&&savedStats&&<div style={{gridColumn:"1/-1",padding:"6px 10px",borderRadius:6,background:T.ok+"06",border:"1px solid "+T.ok+"20",fontSize:FS-3,color:T.ok,fontWeight:600,marginBottom:-2}}>🔒 أسبوع مقفول — القيم المعروضة ثابتة من وقت الإقفال ولا تتأثر بأي تعديل لاحق</div>}
            {/* 1. إجمالي المرتب الأساسي */}
            <div style={{padding:"10px 8px",borderRadius:10,background:T.accent+"08",border:"1px solid "+T.accent+"20",textAlign:"center"}}>
              <div style={{fontSize:FS-3,color:T.textSec,marginBottom:2,fontWeight:600}}>💵 المرتب الأساسي</div>
              <div style={{fontSize:FS+4,fontWeight:800,color:T.accent,lineHeight:1.1}}>{fmt0(baseSal)}</div>
              <div style={{fontSize:FS-4,color:T.textMut,marginTop:2}}>{displayEmpCount+" موظف"}</div>
            </div>
            {/* 2. المستحق بدون إضافي */}
            <div style={{padding:"10px 8px",borderRadius:10,background:"#0284C708",border:"1px solid #0284C720",textAlign:"center"}}>
              <div style={{fontSize:FS-3,color:T.textSec,marginBottom:2,fontWeight:600}}>📊 بدون إضافي</div>
              <div style={{fontSize:FS+4,fontWeight:800,color:"#0284C7",lineHeight:1.1}}>{fmt0(basicEntitled)}</div>
              <div style={{fontSize:FS-4,color:T.textMut,marginTop:2}}>ساعات أساسية</div>
            </div>
            {/* 3. الإضافي */}
            <div style={{padding:"10px 8px",borderRadius:10,background:"#8B5CF608",border:"1px solid #8B5CF620",textAlign:"center"}}>
              <div style={{fontSize:FS-3,color:T.textSec,marginBottom:2,fontWeight:600}}>⏰ إجمالي الإضافي</div>
              <div style={{fontSize:FS+4,fontWeight:800,color:"#8B5CF6",lineHeight:1.1}}>{fmt0(overtimePay)}</div>
              <div style={{fontSize:FS-4,color:T.textMut,marginTop:2}}>×{OT_MULT}</div>
            </div>
            {/* 4. إجمالي المستحق */}
            <div style={{padding:"10px 8px",borderRadius:10,background:"#06B6D408",border:"1px solid #06B6D420",textAlign:"center"}}>
              <div style={{fontSize:FS-3,color:T.textSec,marginBottom:2,fontWeight:600}}>💰 إجمالي المستحق</div>
              <div style={{fontSize:FS+4,fontWeight:800,color:"#06B6D4",lineHeight:1.1}}>{fmt0(grossPay)}</div>
              <div style={{fontSize:FS-4,color:T.textMut,marginTop:2}}>أساسي+إضافي</div>
            </div>
            {/* 5. السلف والمسحوبات */}
            <div style={{padding:"10px 8px",borderRadius:10,background:T.err+"08",border:"1px solid "+T.err+"20",textAlign:"center"}}>
              <div style={{fontSize:FS-3,color:T.textSec,marginBottom:2,fontWeight:600}}>💸 السلف الأسبوعية</div>
              <div style={{fontSize:FS+4,fontWeight:800,color:T.err,lineHeight:1.1}}>{fmt0(advances)}</div>
              <div style={{fontSize:FS-4,color:T.textMut,marginTop:2}}>من الموظفين</div>
            </div>
            {/* 6. الخصم والخصم الخاص */}
            <div style={{padding:"10px 8px",borderRadius:10,background:"#F9731608",border:"1px solid #F9731620",textAlign:"center"}}>
              <div style={{fontSize:FS-3,color:T.textSec,marginBottom:2,fontWeight:600}}>📉 الخصم والخاص</div>
              <div style={{fontSize:FS+4,fontWeight:800,color:"#F97316",lineHeight:1.1}}>{fmt0(deductions+specialDeductions)}</div>
              <div style={{fontSize:FS-4,color:T.textMut,marginTop:2}}>{"ق:"+fmt0(deductions)+" • خ:"+fmt0(specialDeductions)}</div>
            </div>
            {/* 7. سلف الإدارة والشهريين */}
            <div style={{padding:"10px 8px",borderRadius:10,background:"#EC489908",border:"1px solid #EC489920",textAlign:"center"}}>
              <div style={{fontSize:FS-3,color:T.textSec,marginBottom:2,fontWeight:600}}>🏢 سلف إدارة/شهريين</div>
              <div style={{fontSize:FS+4,fontWeight:800,color:"#EC4899",lineHeight:1.1}}>{fmt0(isWeekClosed&&savedStats?savedStats.totalWeeklyAdvances:totalWeeklyAdvances)}</div>
              <div style={{fontSize:FS-4,color:T.textMut,marginTop:2}}>{displayAdvCount+" سلفة"}</div>
            </div>
            {/* V15.27: 8. دفعات الورش (مخططة — تخرج عند الإقفال) */}
            <div style={{padding:"10px 8px",borderRadius:10,background:"#8B5CF608",border:"1px solid #8B5CF620",textAlign:"center"}} title="دفعات الورش المخططة لهذا الأسبوع — ستُسجَّل في الخزنة عند الإقفال">
              <div style={{fontSize:FS-3,color:T.textSec,marginBottom:2,fontWeight:600}}>💸 دفعات الورش</div>
              <div style={{fontSize:FS+4,fontWeight:800,color:"#8B5CF6",lineHeight:1.1}}>{fmt0(isWeekClosed&&savedStats?(savedStats.totalWeeklyWsPayments||0):totalWeeklyWsPayments)}</div>
              <div style={{fontSize:FS-4,color:T.textMut,marginTop:2}}>{(isWeekClosed&&savedStats?(savedStats.weeklyWsPaymentsCount||0):weeklyWsPayments.length)+" دفعة"}</div>
            </div>
            {/* 9. الإجمالي النهائي — V15.27: includes ws payments too */}
            {(()=>{const effTotalWeekAdv=isWeekClosed&&savedStats?savedStats.totalWeeklyAdvances:totalWeeklyAdvances;
              const effWsPay=isWeekClosed&&savedStats?(savedStats.totalWeeklyWsPayments||0):totalWeeklyWsPayments;
              const finalTotal=isWeekClosed&&savedStats?(savedStats.finalTotal||(savedStats.thursdayPay+savedStats.totalWeeklyAdvances+(savedStats.totalWeeklyWsPayments||0))):(thursdayPay+totalWeeklyAdvances+effWsPay);
              return<div style={{padding:"10px 8px",borderRadius:10,background:T.ok+"12",border:"2px solid "+T.ok+"40",textAlign:"center"}} title={"الإجمالي الذي سيُدفع/يخرج من الخزنة يوم الإقفال:\n• مرتبات: "+fmt0(thursdayPay)+" ج\n• سلف إدارة (خطة): "+fmt0(effTotalWeekAdv)+" ج\n• دفعات ورش (خطة): "+fmt0(effWsPay)+" ج\n\nالسلف الأسبوعية للموظفين العاديين ("+fmt0(advances)+" ج) خرجت من الخزنة خلال الأسبوع بالفعل."}>
                <div style={{fontSize:FS-3,color:T.textSec,marginBottom:2,fontWeight:700}}>✅ الإجمالي النهائي</div>
                <div style={{fontSize:FS+5,fontWeight:900,color:T.ok,lineHeight:1.1}}>{fmt0(finalTotal)}</div>
                <div style={{fontSize:FS-4,color:T.textMut,marginTop:2}}>يخرج يوم الإقفال</div>
              </div>;
            })()}
          </div>})()}

        {/* Security flags moved to dedicated Security tab — to keep salary page clean */}

        {/* Paste fingerprint data */}
        {!isLocked&&<Card title="📋 لصق بيانات البصمة" style={{marginBottom:14}}>
          <div style={{fontSize:FS-2,color:T.textMut,marginBottom:6}}>انسخ من برنامج البصمة (كود، تاريخ، ساعات) والصقه هنا:</div>
          <textarea value={pasteText} onChange={ev=>setPasteText(ev.target.value)} placeholder={"AC-No.\tDate\tTotal in time\n1486\t2026-04-12\t8:30\n1474\t2026-04-12\t7:45"} rows={5} style={{width:"100%",padding:10,borderRadius:10,border:"1px solid "+T.brd,fontSize:FS-1,fontFamily:"monospace",background:T.inputBg,color:T.text,resize:"vertical",boxSizing:"border-box",direction:"ltr",textAlign:"left"}}/>
          <div style={{display:"flex",gap:8,marginTop:8}}>
            <Btn primary onClick={parsePaste} disabled={!pasteText.trim()}>📊 تحليل البيانات</Btn>
            {pasteText&&<Btn ghost onClick={()=>{setPasteText("");setPasteResult(null)}}>مسح</Btn>}
          </div>
          {pasteResult&&(()=>{
            /* V14.57: Enhanced paste report */
            const weekSelected=getSelectedEmps(openWeek.id);
            const shownEmps=activeEmps.filter(e=>weekSelected.includes(e.id));
            /* Group matched records by empId */
            const byEmp={};
            pasteResult.records.filter(r=>r.matched).forEach(r=>{
              if(!byEmp[r.empId])byEmp[r.empId]={empId:r.empId,empName:r.empName,code:r.code,days:0,totalHours:0};
              byEmp[r.empId].days++;
              byEmp[r.empId].totalHours+=(r.hours||0);
            });
            const matchedEmps=Object.values(byEmp).sort((a,b)=>(b.totalHours||0)-(a.totalHours||0));
            /* Group unmatched records by code */
            const byCode={};
            pasteResult.records.filter(r=>!r.matched).forEach(r=>{
              if(!byCode[r.code])byCode[r.code]={code:r.code,days:0,totalHours:0};
              byCode[r.code].days++;
              byCode[r.code].totalHours+=(r.hours||0);
            });
            const unmatchedCodes=Object.values(byCode);
            /* Find absent: employees in week selection but no matched records */
            const matchedEmpIds=new Set(matchedEmps.map(m=>m.empId));
            const absentEmps=shownEmps.filter(e=>!matchedEmpIds.has(e.id));
            return<div style={{marginTop:10,padding:14,borderRadius:12,background:T.bg,border:"1px solid "+T.brd}}>
              {/* Stats cards */}
              <div style={{display:"grid",gridTemplateColumns:isMob?"repeat(2,1fr)":"repeat(4,1fr)",gap:8,marginBottom:14}}>
                <div style={{padding:"10px 12px",borderRadius:10,background:T.accent+"08",border:"1px solid "+T.accent+"20",textAlign:"center"}}>
                  <div style={{fontSize:FS-3,color:T.textMut,fontWeight:600,marginBottom:2}}>📊 إجمالي السجلات</div>
                  <div style={{fontSize:FS+4,fontWeight:900,color:T.accent}}>{pasteResult.total}</div>
                </div>
                <div style={{padding:"10px 12px",borderRadius:10,background:T.ok+"08",border:"1px solid "+T.ok+"20",textAlign:"center"}}>
                  <div style={{fontSize:FS-3,color:T.textMut,fontWeight:600,marginBottom:2}}>✅ مطابق</div>
                  <div style={{fontSize:FS+4,fontWeight:900,color:T.ok}}>{matchedEmps.length}</div>
                  <div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>موظف</div>
                </div>
                <div style={{padding:"10px 12px",borderRadius:10,background:(pasteResult.unmatched>0?T.err:T.textMut)+"08",border:"1px solid "+(pasteResult.unmatched>0?T.err:T.textMut)+"20",textAlign:"center"}}>
                  <div style={{fontSize:FS-3,color:T.textMut,fontWeight:600,marginBottom:2}}>⚠️ غير مطابق</div>
                  <div style={{fontSize:FS+4,fontWeight:900,color:pasteResult.unmatched>0?T.err:T.textMut}}>{unmatchedCodes.length}</div>
                  <div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>كود</div>
                </div>
                <div style={{padding:"10px 12px",borderRadius:10,background:(absentEmps.length>0?T.warn:T.textMut)+"08",border:"1px solid "+(absentEmps.length>0?T.warn:T.textMut)+"20",textAlign:"center"}}>
                  <div style={{fontSize:FS-3,color:T.textMut,fontWeight:600,marginBottom:2}}>🟡 غائب</div>
                  <div style={{fontSize:FS+4,fontWeight:900,color:absentEmps.length>0?T.warn:T.textMut}}>{absentEmps.length}</div>
                  <div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>موظف</div>
                </div>
              </div>

              {/* Errors */}
              {pasteResult.errors.length>0&&<div style={{padding:10,borderRadius:8,background:T.err+"08",border:"1px solid "+T.err+"25",marginBottom:10,fontSize:FS-2,color:T.err,fontWeight:600}}>
                <div style={{marginBottom:4}}>⛔ أخطاء في التحليل:</div>
                {pasteResult.errors.join(" | ")}
              </div>}

              {/* Unmatched codes — CRITICAL fraud warning */}
              {unmatchedCodes.length>0&&<div style={{padding:12,borderRadius:10,background:T.err+"06",border:"2px solid "+T.err+"35",marginBottom:10}}>
                <div style={{fontSize:FS-1,fontWeight:800,color:T.err,marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
                  <span>🚨</span><span>أكواد غير مربوطة بأي موظف — تحذير احتيال محتمل</span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"repeat(2,1fr)",gap:6}}>
                  {unmatchedCodes.map(u=><div key={u.code} style={{padding:"8px 10px",borderRadius:6,background:T.cardSolid,border:"1px solid "+T.err+"25"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                      <span style={{fontSize:FS,fontWeight:800,color:T.err,fontFamily:"monospace"}}>كود: {u.code}</span>
                      <span style={{fontSize:FS-3,color:T.textMut}}>•</span>
                      <span style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>{u.days} سجل</span>
                      <span style={{fontSize:FS-3,color:T.textMut}}>•</span>
                      <span style={{fontSize:FS-2,color:T.textSec,fontWeight:700}}>{hrsToHM(u.totalHours)} ساعة</span>
                    </div>
                  </div>)}
                </div>
              </div>}

              {/* Absent employees */}
              {absentEmps.length>0&&<div style={{padding:12,borderRadius:10,background:T.warn+"06",border:"1px solid "+T.warn+"30",marginBottom:10}}>
                <div style={{fontSize:FS-1,fontWeight:800,color:T.warn,marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
                  <span>🟡</span><span>موظفين في الأسبوع لكن لم تظهر بصمتهم ({absentEmps.length})</span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"repeat(3,1fr)",gap:6}}>
                  {absentEmps.map(e=><div key={e.id} style={{padding:"6px 10px",borderRadius:6,background:T.cardSolid,border:"1px solid "+T.warn+"25",fontSize:FS-2}}>
                    <span style={{fontWeight:700,color:T.text}}>{e.name}</span>
                    {e.code?<span style={{color:T.textMut,marginInlineStart:4,fontSize:FS-3}}>#{e.code}</span>:""}
                  </div>)}
                </div>
              </div>}

              {/* Matched employees (collapsed by default, expandable) */}
              {matchedEmps.length>0&&<details style={{padding:10,borderRadius:10,background:T.ok+"04",border:"1px solid "+T.ok+"20",marginBottom:10}}>
                <summary style={{cursor:"pointer",fontSize:FS-1,fontWeight:800,color:T.ok,display:"flex",alignItems:"center",gap:6}}>
                  <span>🟢</span><span>الموظفين المطابقين ({matchedEmps.length}) — اضغط للتفاصيل</span>
                </summary>
                <div style={{marginTop:10,display:"grid",gridTemplateColumns:isMob?"1fr":"repeat(2,1fr)",gap:6}}>
                  {matchedEmps.map(m=><div key={m.empId} style={{padding:"6px 10px",borderRadius:6,background:T.cardSolid,border:"1px solid "+T.ok+"20",display:"flex",justifyContent:"space-between",alignItems:"center",gap:6,fontSize:FS-2}}>
                    <span><span style={{fontWeight:700,color:T.text}}>{m.empName}</span><span style={{color:T.textMut,marginInlineStart:4,fontSize:FS-3}}>#{m.code}</span></span>
                    <span style={{color:T.textSec,fontWeight:600,fontSize:FS-3}}>{m.days} يوم • {hrsToHM(m.totalHours)}</span>
                  </div>)}
                </div>
              </details>}

              <Btn primary onClick={applyPaste}>{"✅ استيراد "+pasteResult.matched+" سجل مطابق"}</Btn>
            </div>;
          })()}
        </Card>}

        {/* Attendance grid with selectable employees + edit-per-row */}
        {(()=>{
          const weekSelected=getSelectedEmps(openWeek.id);
          const shownEmps=activeEmps.filter(e=>weekSelected.includes(e.id));
          const saveRow=(empId)=>{const draft=rowDraft[empId]||{};
            const emp=employees.find(e=>e.id===empId);
            upConfig(d=>{const wi=(d.hrWeeks||[]).findIndex(w=>w.id===openWeekId);if(wi<0)return;
              if(!d.hrWeeks[wi].attendance)d.hrWeeks[wi].attendance={};
              const changes=[];
              dates.forEach(dt=>{const key=empId+"_"+dt;const val=draft[dt];
                const oldH=d.hrWeeks[wi].attendance[key]?d.hrWeeks[wi].attendance[key].hours:0;
                if(val!==undefined&&val!==""){
                  const newH=parseHrs(val);
                  d.hrWeeks[wi].attendance[key]={empId,date:dt,hours:newH};
                  if(Math.abs(oldH-newH)>0.01)changes.push(dt+": "+hrsToHM(oldH)+" → "+hrsToHM(newH));
                }
                else if(val===""){
                  if(oldH>0)changes.push(dt+": "+hrsToHM(oldH)+" → حذف");
                  delete d.hrWeeks[wi].attendance[key];
                }
              });
              /* Audit log: manual attendance edit */
              if(changes.length>0){
                addAudit(d,{
                  category:"attendance",action:"manual_edit",
                  target:(emp?emp.name:"موظف #"+empId)+" — W"+d.hrWeeks[wi].weekNum,
                  newValue:changes.join(" | "),
                  user:userName,severity:"warning",
                  notes:"تعديل يدوي لساعات الحضور"
                });
              }
            });
            setEditingRow(null);setRowDraft(p=>{const n={...p};delete n[empId];return n});showToast("✓ تم الحفظ")};
          const startEdit=(empId)=>{const existing={};dates.forEach(dt=>{const key=empId+"_"+dt;if(att[key]&&att[key].hours>0)existing[dt]=hrsToHM(att[key].hours)});
            setRowDraft(p=>({...p,[empId]:existing}));setEditingRow(empId)};
          const cancelEdit=(empId)=>{setEditingRow(null);setRowDraft(p=>{const n={...p};delete n[empId];return n})};
          /* Remove employee from this week: unselect + clear their attendance hours for this week */
          const removeFromWeek=(emp)=>{
            const hasHours=dates.some(dt=>att[emp.id+"_"+dt]&&att[emp.id+"_"+dt].hours>0);
            const msg=hasHours
              ?"سيتم إزالة "+emp.name+" من هذا الأسبوع وحذف ساعات الحضور المسجلة له.\n\n(الموظف نفسه لن يُحذف — فقط من هذا الأسبوع)\n\nمتابعة؟"
              :"سيتم إزالة "+emp.name+" من هذا الأسبوع.\n\nمتابعة؟";
            openConfirm({
              title:"إزالة "+emp.name+" من الأسبوع",
              message:msg,
              variant:"warn",
              confirmText:"إزالة",
              onConfirm:()=>{
                /* Update selected emps in state + Firestore */
                const current=getSelectedEmps(openWeek.id);
                const updated=current.filter(id=>id!==emp.id);
                setSelectedEmps(p=>({...p,[openWeek.id]:updated}));
                /* Clear attendance + selectedEmps + all override inputs for this employee */
                upConfig(d=>{
                  const wi=(d.hrWeeks||[]).findIndex(w=>w.id===openWeek.id);
                  if(wi<0)return;
                  d.hrWeeks[wi].selectedEmps=updated;
                  if(d.hrWeeks[wi].attendance){
                    dates.forEach(dt=>{delete d.hrWeeks[wi].attendance[emp.id+"_"+dt]});
                  }
                  /* Also clean up any draft inputs for this employee */
                  if(d.hrWeeks[wi].draftInputs){
                    const di=d.hrWeeks[wi].draftInputs;
                    ["bonus","specialDeduct","manualInstallDeduct","installOverride","thursdayPay","prevBalanceOverride","deductReason","baseHoursOverride"].forEach(k=>{
                      if(di[k]&&di[k][emp.id]!==undefined){const copy={...di[k]};delete copy[emp.id];di[k]=copy}
                    });
                  }
                });
                /* Also clear local state for this employee */
                const clearKey=(setter)=>setter(p=>{const n={...p};delete n[emp.id];return n});
                clearKey(setSalBonus);clearKey(setSalSpecialDeduct);clearKey(setSalManualInstallDeduct);
                clearKey(setSalInstallOverride);clearKey(setSalThursdayPay);clearKey(setSalPrevBalanceOverride);
                clearKey(setSalDeductReason);clearKey(setSalBaseHoursOverride);
                showToast("✓ تم إزالة "+emp.name+" من الأسبوع");
              }
            });
          };
          return<Card title={"📋 جدول الحضور — "+shownEmps.length+"/"+activeEmps.length+" موظف × "+dates.length+" أيام"} style={{marginBottom:14}}>
            {/* Top filter: search by name or fingerprint code — affects BOTH attendance table above AND salary table below */}
            <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10,flexWrap:"wrap"}}>
              {canEdit&&!isLocked&&<><div style={{flex:1,minWidth:200}}>
                <Inp value={attSearch} onChange={setAttSearch} placeholder="🔍 بحث بالاسم أو كود البصمة — يفلتر الجدولين..."/>
              </div>
              {attSearch&&<Btn small ghost onClick={()=>setAttSearch("")} style={{padding:"4px 10px",fontSize:FS-2}}>✕</Btn>}
              <Btn small onClick={()=>setShowEmpPicker(true)} style={{background:T.accent+"10",color:T.accent,border:"1px solid "+T.accent+"30"}}>👥 اختيار الموظفين ({weekSelected.length})</Btn></>}
              <div style={{marginInlineStart:"auto"}}>
                <Btn small onClick={()=>{
                  /* Print attendance table as displayed */
                  const topQ=attSearchDeb.trim().toLowerCase();
                  const printEmps=topQ?shownEmps.filter(e=>((e.name||"").toLowerCase().includes(topQ)||(e.code||"").toLowerCase().includes(topQ))):shownEmps;
                  /* Build rows */
                  const rows=printEmps.map((emp,ri)=>{let total=0;
                    const cells=dates.map(d=>{const h=att[emp.id+"_"+d]?att[emp.id+"_"+d].hours:0;if(h>0)total+=h;return"<td class='center' style='"+(h>0?"color:#10B981;font-weight:700":"color:#CBD5E1")+"'>"+(h>0?hrsToHM(h):"—")+"</td>"}).join("");
                    const noBio=!!emp.noBiometric;
                    return"<tr"+(noBio?" style='background:#FEF2F2'":"")+">"+
                      "<td class='center' style='color:#64748B'>"+(ri+1)+"</td>"+
                      "<td style='font-weight:700'"+(noBio?" style='color:#EF4444'":"")+">"+(noBio?"📝 ":"")+emp.name+(emp.code?" <span style=\"color:#94A3B8;font-size:9px;font-weight:400\">#"+emp.code+"</span>":"")+"</td>"+
                      cells+
                      "<td class='center' style='color:#0284C7;font-weight:800;font-size:12px'>"+(total>0?hrsToHM(total):"—")+"</td>"+
                    "</tr>";
                  }).join("");
                  /* Day totals */
                  const dayTotals=dates.map(d=>{let s=0;printEmps.forEach(e=>{const h=att[e.id+"_"+d]?att[e.id+"_"+d].hours:0;if(h>0)s+=h});return s});
                  const grandTotal=dayTotals.reduce((a,b)=>a+b,0);
                  const totalsCells=dayTotals.map(s=>"<td class='center' style='font-weight:800;color:"+(s>0?"#0284C7":"#CBD5E1")+"'>"+(s>0?hrsToHM(s):"—")+"</td>").join("");
                  const totalsRow="<tr style='background:#F0F9FF;border-top:2px solid #0284C7;font-weight:800'><td class='center' colspan='2'>اجمالي اليوم</td>"+totalsCells+"<td class='center' style='color:#0284C7;font-size:13px'>"+(grandTotal>0?hrsToHM(grandTotal):"—")+"</td></tr>";
                  /* Header columns */
                  const dayNames=["أحد","اثنين","ثلاثاء","أربعاء","خميس","جمعة","سبت"];
                  const dayCols=dates.map(d=>"<th class='center'><div style='font-weight:800'>"+dayNames[new Date(d).getDay()]+"</div><div style='font-size:9px;color:#94A3B8;font-weight:400;direction:ltr'>"+d.slice(5)+"</div></th>").join("");
                  const filterLine=topQ?"<div style='background:#FEF3C7;padding:6px 10px;border-radius:6px;margin-bottom:10px;font-size:10px;color:#92400E'><b>الفلتر:</b> \""+topQ+"\"</div>":"";
                  const title="جدول الحضور — W"+openWeek.weekNum;
                  const html="<html dir='rtl'><head><meta charset='UTF-8'><title>"+title+"</title><style>"+PRINT_CSS+".center{text-align:center}table{font-size:10px}th{padding:6px 3px;font-size:10px}td{padding:4px 3px;font-size:10px}@page{size:A4 landscape;margin:8mm}</style></head><body>"+
                    "<div class='hdr'><div style='font-size:18px;font-weight:800;color:#0284C7'>📋 "+title+"</div><div class='hdr-info'><div>الفترة: "+openWeek.weekStart+" → "+openWeek.weekEnd+"</div><div>ساعات أساسي: "+(openWeek.baseHours||48)+"</div><div>تاريخ الطباعة: "+today+"</div></div></div>"+
                    filterLine+
                    "<table><thead><tr><th style='width:30px'>#</th><th>الموظف</th>"+dayCols+"<th>اجمالي</th></tr></thead><tbody>"+
                    (rows||"<tr><td colspan='"+(dates.length+3)+"' class='center' style='padding:20px;color:#94A3B8'>لا توجد نتائج</td></tr>")+
                    totalsRow+
                    "</tbody></table>"+
                    "<div class='foot'>CLARK Factory Management — "+title+" — "+today+"</div>"+
                    "<script>setTimeout(function(){window.print()},500)</"+"script></body></html>";
                  const w=_openPrintWin();if(!w)return;
                  w.document.write(html);w.document.close();
                }} style={{background:"#0284C712",color:"#0284C7",border:"1px solid #0284C730",fontWeight:700}}>🖨 طباعة الحضور</Btn>
              </div>
            </div>
            {(()=>{
              /* Apply top-level filter (affects both attendance + salary tables below via shared filter) */
              const topQ=attSearchDeb.trim().toLowerCase();
              const attFilteredEmps=topQ?shownEmps.filter(e=>{
                const name=(e.name||"").toLowerCase();
                const code=(e.code||"").toLowerCase();
                return name.includes(topQ)||code.includes(topQ);
              }):shownEmps;
              return<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>
              <th style={{padding:"5px 10px",textAlign:"right",fontSize:FS-2,color:T.textSec,borderBottom:"2px solid "+T.brd,fontWeight:700,position:"sticky",right:0,background:T.cardSolid,zIndex:1,minWidth:130}}>الموظف</th>
              {dates.map(d=><th key={d} style={{padding:"4px 4px",textAlign:"center",fontSize:FS-3,color:T.textSec,borderBottom:"2px solid "+T.brd,fontWeight:600,minWidth:70}}>
                <div style={{fontWeight:700,fontSize:FS-2}}>{dayNames[new Date(d).getDay()]}</div>
                <div style={{fontSize:FS-3,color:T.textMut,direction:"ltr"}}>{d.slice(2).replace(/-/g,"-")}</div>
              </th>)}
              <th style={{padding:"5px 6px",textAlign:"center",fontSize:FS-2,color:T.accent,borderBottom:"2px solid "+T.brd,fontWeight:800,minWidth:70}}>اجمالي</th>
              {canEdit&&!isLocked&&<th style={{padding:"5px 6px",textAlign:"center",fontSize:FS-2,color:T.textSec,borderBottom:"2px solid "+T.brd,fontWeight:700,minWidth:90}}></th>}
            </tr></thead><tbody>
              {attFilteredEmps.length===0?<tr><td colSpan={dates.length+2+(canEdit&&!isLocked?1:0)} style={{padding:30,textAlign:"center",color:T.textMut,fontSize:FS-1}}>
                لا توجد نتائج لـ "{attSearchDeb}"
              </td></tr>:attFilteredEmps.map((emp,ri)=>{let total=0;const isEditing=editingRow===emp.id;const draft=rowDraft[emp.id]||{};const zebra=ri%2===1?T.bg:T.cardSolid;
                dates.forEach(d=>{const val=isEditing?parseHrs(draft[d]||0):(att[emp.id+"_"+d]?att[emp.id+"_"+d].hours:0);if(val>0)total+=val});
                /* Red highlight: employee marked as noBiometric (attends but can't punch fingerprint) */
                const noBio=!!emp.noBiometric;
                const rowBg=isEditing?T.accent+"04":(noBio?"#EF444408":zebra);
                const rowStickyBg=isEditing?T.accent+"04":(noBio?"#EF444410":zebra);
                return<tr key={emp.id} style={{borderBottom:"1px solid "+(noBio?"#EF444420":T.brd),background:rowBg}}>
                  <td style={{padding:"2px 10px",fontSize:FS,fontWeight:700,position:"sticky",right:0,background:rowStickyBg,zIndex:1,color:noBio?"#EF4444":T.text}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      {noBio&&<span style={{padding:"1px 5px",borderRadius:4,background:"#EF444418",color:"#EF4444",fontSize:10,fontWeight:800,lineHeight:1.2}} title="بدون بصمة (إدخال يدوي)">📝</span>}
                      <span>{emp.name}</span>
                    </div>
                    <div style={{fontSize:FS-3,color:noBio?"#EF4444CC":T.textMut,direction:"ltr",textAlign:"right"}}>{emp.code?"#"+emp.code:""}</div>
                  </td>
                  {dates.map(d=>{const key=emp.id+"_"+d;const h=att[key]?att[key].hours:0;const dval=isEditing?(draft[d]!==undefined?draft[d]:(h>0?hrsToHM(h):"")):h;
                    return<td key={d} style={{padding:"1px 3px",textAlign:"center"}}>
                      {isEditing?<input type="text" value={dval} onChange={ev=>setRowDraft(p=>({...p,[emp.id]:{...(p[emp.id]||{}),[d]:ev.target.value}}))} placeholder="—" title="8:30 أو 8.5" style={{width:60,padding:"3px 4px",borderRadius:8,border:"1px solid "+T.accent+"50",fontSize:FS,fontFamily:"inherit",textAlign:"center",background:T.inputBg,color:T.text,fontWeight:700,boxSizing:"border-box"}}/>
                      :<span style={{display:"inline-block",minWidth:50,padding:"1px 6px",fontSize:FS,fontWeight:h>0?700:400,color:h>0?(noBio?"#EF4444":T.ok):T.textMut,background:h>0?(noBio?"#EF444410":T.ok+"08"):"transparent",borderRadius:6,direction:"ltr"}} title={h>0?"("+r2(h)+" ساعة عشرية)":""}>{h>0?hrsToHM(h):"—"}</span>}
                    </td>})}
                  <td style={{padding:"2px 6px",textAlign:"center",fontSize:FS+1,fontWeight:800,color:total>0?(noBio?"#EF4444":T.accent):T.textMut,direction:"ltr"}} title={total>0?"("+r2(total)+" ساعة عشرية)":""}>{total>0?hrsToHM(total):"—"}</td>
                  {canEdit&&!isLocked&&<td style={{padding:"2px 6px",textAlign:"center"}}>
                    {isEditing?<div style={{display:"flex",gap:4,justifyContent:"center"}}>
                      <span onClick={()=>saveRow(emp.id)} style={{cursor:"pointer",padding:"2px 8px",borderRadius:6,fontSize:FS-1,fontWeight:700,background:T.ok+"15",color:T.ok,border:"1px solid "+T.ok+"30"}}>💾 حفظ</span>
                      <span onClick={()=>cancelEdit(emp.id)} style={{cursor:"pointer",padding:"2px 8px",borderRadius:6,fontSize:FS-1,fontWeight:700,background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30"}}>✕</span>
                    </div>:<div style={{display:"flex",gap:4,justifyContent:"center",alignItems:"center"}}>
                      <span onClick={()=>startEdit(emp.id)} style={{cursor:"pointer",padding:"2px 10px",borderRadius:6,fontSize:FS-1,fontWeight:700,background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}}>✏️ تعديل</span>
                      <span onClick={()=>removeFromWeek(emp)} title={"إزالة "+emp.name+" من هذا الأسبوع"} style={{cursor:"pointer",padding:"2px 8px",borderRadius:6,fontSize:FS-1,fontWeight:700,background:T.err+"10",color:T.err,border:"1px solid "+T.err+"25"}}>🗑</span>
                    </div>}
                  </td>}
                </tr>})}
              {/* Totals row — calculated from filtered employees */}
              {(()=>{const totals={};let grand=0;dates.forEach(d=>{let s=0;attFilteredEmps.forEach(e=>{const v=editingRow===e.id?parseHrs((rowDraft[e.id]||{})[d]||0):(att[e.id+"_"+d]?att[e.id+"_"+d].hours:0);if(v>0)s+=v});totals[d]=s;grand+=s});
                return<tr style={{background:T.accent+"06",fontWeight:800,borderTop:"2px solid "+T.accent+"30"}}>
                  <td style={{padding:"6px 10px",fontSize:FS,fontWeight:800,position:"sticky",right:0,background:T.accent+"06",zIndex:1}}>{attSearchDeb?"اجمالي (ظاهر)":"اجمالي اليوم"}</td>
                  {dates.map(d=><td key={d} style={{padding:"4px 3px",textAlign:"center",fontSize:FS,fontWeight:700,color:totals[d]>0?T.accent:T.textMut,direction:"ltr"}} title={totals[d]>0?"("+r2(totals[d])+" ساعة عشرية)":""}>{totals[d]>0?hrsToHM(totals[d]):"—"}</td>)}
                  <td style={{padding:"4px 6px",textAlign:"center",fontSize:FS+2,fontWeight:800,color:T.accent,direction:"ltr"}} title={grand>0?"("+r2(grand)+" ساعة عشرية)":""}>{grand>0?hrsToHM(grand):"—"}</td>
                  {canEdit&&!isLocked&&<td></td>}
                </tr>})()}
            </tbody></table></div>;
            })()}
          </Card>})()}

        {/* Salary calculation — aligned, centered, with deduct reason */}
        {(()=>{
          const weekSelected=getSelectedEmps(openWeek.id);
          const shownEmps=activeEmps.filter(e=>weekSelected.includes(e.id));
          const cols=[
            {label:"#",align:"center",w:30},
            {label:"الاسم",align:"right",w:"auto"},
            {label:"مرتب",align:"center"},
            {label:"أساسي",align:"center"},
            {label:"ساعات",align:"center"},
            {label:"إضافي",align:"center"},
            {label:"إضافي مستحق",align:"center"},
            {label:"مستحق",align:"center"},
            {label:"رصيد سابق",align:"center"},
            {label:"مسحوبات",align:"center"},
            {label:"خصم",align:"center"},
            {label:"خصم خاص (قسط)",align:"center"},
            {label:"حافز",align:"center"},
            {label:"صافي",align:"center"},
            {label:"دفعة من الحساب",align:"center"},
            {label:"الرصيد (يُرحّل)",align:"center"},
            ...(openWeek.status==="closed"?[{label:"✓ استلم",align:"center",w:60}]:[]),
            {label:"",align:"center",w:40}
          ];
          let tG=0,tN=0,tTD=0,tA=0,tD=0,tB=0,tH=0,tO=0,tOP=0,tTP=0,tRB=0,tDI=0,tPB=0;
          shownEmps.forEach(e=>{const c=getEmpSalary(e.id,openWeek);if(c){tG+=c.grossPay;tN+=c.netBalance;tTD+=c.totalDue;tA+=c.weekAdvances;tD+=c.specialDeduct;tB+=c.bonus;tH+=c.totalHours;tO+=c.overtimeHours;tOP+=c.overtimePay;tTP+=c.thursdayPay;tRB+=c.remainingBalance;tDI+=c.debtInstall||0;tPB+=c.prevBalance||0}});
          /* Apply filters */
          const sQ=salSearchDeb.trim().toLowerCase();
          const topQ=attSearchDeb.trim().toLowerCase();
          const filteredShown=shownEmps.filter(e=>{
            /* Top-level search (shared with attendance table) — filters by name or code */
            if(topQ){const name=(e.name||"").toLowerCase();const code=(e.code||"").toLowerCase();if(!name.includes(topQ)&&!code.includes(topQ))return false}
            if(sQ){const name=(e.name||"").toLowerCase();const code=(e.code||"").toLowerCase();const job=(e.job||"").toLowerCase();if(!name.includes(sQ)&&!code.includes(sQ)&&!job.includes(sQ))return false}
            if(salJobFilter&&(e.job||"")!==salJobFilter)return false;
            if(salShowOnly){const cc=getEmpSalary(e.id,openWeek);if(!cc)return false;
              if(salShowOnly==="hasDeduct"&&!(cc.specialDeduct>0))return false;
              if(salShowOnly==="hasBonus"&&!(cc.bonus>0))return false;
              if(salShowOnly==="hasInstall"&&!(cc.debtInstall>0))return false;
              if(salShowOnly==="hasBalance"&&!(cc.prevBalance!==0||cc.remainingBalance!==0))return false;
              if(salShowOnly==="hasAdvances"&&!(cc.weekAdvances>0))return false;
            }
            return true;
          });
          const uniqueJobs=Array.from(new Set(shownEmps.map(e=>e.job).filter(Boolean))).sort();
          return<Card title={"💰 حساب المرتبات — W"+openWeek.weekNum+" ("+shownEmps.length+" موظف"+(filteredShown.length!==shownEmps.length?" — ظاهر "+filteredShown.length:"")+")"}>
            {/* V15.69: PrevBalance carryover diagnostic — shows when previous closed week had
                remainingBalance but current emp.prevBalance doesn't match. Caused by
                approveWeek not completing balance update (e.g. analysis-only week,
                transaction failure, or pre-V15.21 close). */}
            {openWeek.status!=="closed"&&canEdit&&(()=>{
              /* Find the most recent closed week BEFORE this one */
              const prevClosed=hrWeeks.filter(w=>w.status==="closed"&&w.weekEnd<openWeek.weekStart&&!w.isAnalysisOnly).sort((a,b)=>(b.weekEnd||"").localeCompare(a.weekEnd||""))[0];
              if(!prevClosed||!Array.isArray(prevClosed.closedRecords))return null;
              /* For each shown employee, check if their remainingBalance in prevClosed != emp.prevBalance */
              const mismatches=[];
              shownEmps.forEach(e=>{
                const rec=prevClosed.closedRecords.find(r=>r.empId===e.id);
                if(!rec)return;
                const expected=Number(rec.remainingBalance)||0;
                const actual=Number(e.prevBalance)||0;
                if(Math.abs(expected-actual)>0.5){
                  mismatches.push({emp:e,expected,actual,diff:r2(expected-actual)});
                }
              });
              if(mismatches.length===0)return null;
              const total=mismatches.reduce((s,m)=>s+m.expected,0);
              const fixCarryover=()=>{
                openConfirm({
                  title:"🔄 إصلاح الرصيد المرحّل",
                  message:"هذا الإجراء سيقوم بتحديث \"الرصيد المرحّل\" لـ "+mismatches.length+" موظف بالقيم الصحيحة من W"+prevClosed.weekNum+".\n\nالقيم اللي هتتحدث:\n"+mismatches.slice(0,10).map(m=>"• "+m.emp.name+": "+fmt0(m.actual)+" → "+fmt0(m.expected)+" (فرق "+(m.diff>0?"+":"")+fmt0(m.diff)+")").join("\n")+(mismatches.length>10?"\n... و "+(mismatches.length-10)+" موظف آخر":"")+"\n\nالإجمالي اللي هيظهر في رصيد سابق: "+fmt0(total)+" ج\n\nهل تريد المتابعة؟",
                  variant:"warn",confirmText:"نعم، أصلح القيم",
                  onConfirm:()=>{
                    upConfig(d=>{
                      const mm=new Map(mismatches.map(m=>[m.emp.id,m.expected]));
                      (d.employees||[]).forEach(e=>{if(mm.has(e.id))e.prevBalance=mm.get(e.id)});
                      /* Audit log */
                      addAudit(d,{
                        category:"payroll",action:"fix_prev_balance_carryover",
                        target:"W"+openWeek.weekNum,
                        oldValue:mismatches.map(m=>m.emp.name+"="+fmt0(m.actual)).join("، "),
                        newValue:mismatches.map(m=>m.emp.name+"="+fmt0(m.expected)).join("، "),
                        user:userName,severity:"warn",
                        notes:"إصلاح ترحيل الرصيد من W"+prevClosed.weekNum+" — "+mismatches.length+" موظف — إجمالي "+fmt0(total)+" ج"
                      });
                    });
                    showToast("✓ تم تحديث الرصيد المرحّل لـ "+mismatches.length+" موظف");
                  }
                });
              };
              return <div style={{padding:"12px 14px",borderRadius:12,background:"#FEF3C7",border:"1px solid #F59E0B50",marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                <div style={{flex:"1 1 400px"}}>
                  <div style={{fontSize:FS,fontWeight:800,color:"#92400E",marginBottom:4}}>⚠️ تنبيه: الرصيد المرحّل من W{prevClosed.weekNum} غير مطابق</div>
                  <div style={{fontSize:FS-2,color:"#78350F",lineHeight:1.6}}>
                    فيه <b>{mismatches.length}</b> موظف المفروض عندهم رصيد مرحّل من الأسبوع السابق (إجمالي <b>{fmt0(total)} ج</b>) بس القيم الحالية مش مطابقة.
                    <br/>ده بيحصل لو الأسبوع اتقفل بس تحديث الرصيد مكملش بسبب خطأ مؤقت.
                  </div>
                </div>
                <Btn onClick={fixCarryover} style={{background:"#F59E0B",color:"#fff",border:"none",fontWeight:800,whiteSpace:"nowrap"}}>🔄 إصلاح الرصيد</Btn>
              </div>;
            })()}
            {/* V14.57: Receipt summary cards — only for closed weeks */}
            {openWeek.status==="closed"&&(()=>{
              /* V15.25: Use merged receipts */
              const receipts=mergedReceipts(openWeek);
              const received=shownEmps.filter(e=>receipts[e.id]);
              const notReceived=shownEmps.filter(e=>!receipts[e.id]);
              return<div style={{display:"grid",gridTemplateColumns:isMob?"repeat(3,1fr)":"repeat(3,1fr)",gap:10,marginBottom:12}}>
                <div style={{padding:"10px 14px",borderRadius:12,background:T.cardSolid,border:"1px solid "+T.brd,display:"flex",alignItems:"center",gap:12,boxShadow:T.shadow}}>
                  <div style={{width:40,height:40,borderRadius:10,background:T.accent+"12",display:"flex",alignItems:"center",justifyContent:"center",color:T.accent,flexShrink:0,fontSize:20}}>👥</div>
                  <div><div style={{fontSize:FS-2,color:T.textMut,fontWeight:600}}>الإجمالي</div><div style={{fontSize:FS+6,fontWeight:900,color:T.text,lineHeight:1}}>{shownEmps.length}</div></div>
                </div>
                <div style={{padding:"10px 14px",borderRadius:12,background:T.cardSolid,border:"1px solid "+T.ok+"30",display:"flex",alignItems:"center",gap:12,boxShadow:T.shadow}}>
                  <div style={{width:40,height:40,borderRadius:10,background:T.ok+"15",display:"flex",alignItems:"center",justifyContent:"center",color:T.ok,flexShrink:0,fontSize:20}}>✅</div>
                  <div><div style={{fontSize:FS-2,color:T.textMut,fontWeight:600}}>استلموا</div><div style={{fontSize:FS+6,fontWeight:900,color:T.ok,lineHeight:1}}>{received.length}</div></div>
                </div>
                <div onClick={notReceived.length>0?()=>setFraudListPopup({week:openWeek,emps:notReceived}):undefined} style={{padding:"10px 14px",borderRadius:12,background:T.cardSolid,border:"1px solid "+(notReceived.length>0?T.err+"40":T.brd),display:"flex",alignItems:"center",gap:12,boxShadow:T.shadow,cursor:notReceived.length>0?"pointer":"default",transition:"all 0.15s"}}>
                  <div style={{width:40,height:40,borderRadius:10,background:(notReceived.length>0?T.err:T.textMut)+"15",display:"flex",alignItems:"center",justifyContent:"center",color:notReceived.length>0?T.err:T.textMut,flexShrink:0,fontSize:20}}>⚠️</div>
                  <div><div style={{fontSize:FS-2,color:T.textMut,fontWeight:600}}>لم يستلموا{notReceived.length>0?" (اضغط للتفاصيل)":""}</div><div style={{fontSize:FS+6,fontWeight:900,color:notReceived.length>0?T.err:T.textMut,lineHeight:1}}>{notReceived.length}</div></div>
                </div>
              </div>;
            })()}
            {/* Filters toolbar */}
            <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:10,padding:10,background:T.bg,borderRadius:10,border:"1px solid "+T.brd}}>
              <div style={{flex:1,minWidth:180}}>
                <Inp value={salSearch} onChange={setSalSearch} placeholder="🔍 بحث بالاسم، الكود، الوظيفة..."/>
              </div>
              {uniqueJobs.length>1&&<div style={{minWidth:130}}>
                <Sel value={salJobFilter} onChange={setSalJobFilter}>
                  <option value="">كل الوظائف</option>
                  {uniqueJobs.map(j=><option key={j} value={j}>{j}</option>)}
                </Sel>
              </div>}
              <div style={{minWidth:140}}>
                <Sel value={salShowOnly} onChange={setSalShowOnly}>
                  <option value="">عرض: الكل</option>
                  <option value="hasBonus">لهم حافز</option>
                  <option value="hasAdvances">لهم مسحوبات</option>
                  <option value="hasDeduct">لهم خصم</option>
                  <option value="hasInstall">لهم قسط</option>
                  <option value="hasBalance">لهم رصيد</option>
                </Sel>
              </div>
              {(salSearch||salJobFilter||salShowOnly)&&<Btn small ghost onClick={()=>{setSalSearch("");setSalJobFilter("");setSalShowOnly("")}} style={{padding:"4px 10px",fontSize:FS-2}}>✕ مسح الفلاتر</Btn>}
              <div style={{flex:"0 0 auto",marginInlineStart:"auto",display:"flex",gap:6}}>
                {/* V14.57: Scan QR to register salary receipt — only for closed weeks */}
                {openWeek.status==="closed"&&canEdit&&<Btn small onClick={()=>setShowEmpQrScanner({weekId:openWeek.id})} style={{background:"#10B98112",color:"#10B981",border:"1px solid #10B98130",fontWeight:700}} title="مسح QR الموظف لتسجيل استلام المرتب">📱 تسجيل استلام</Btn>}
                {/* V15.48: Print salary envelopes (DL 220×110mm, direct envelope feed) */}
                {canEdit&&<Btn small onClick={()=>{const wkEmpIds=new Set(shownEmps.map(e=>e.id));setEnvelopePopup({weekId:openWeek.id,selected:new Set(wkEmpIds),filter:"all",search:""})}} style={{background:"#F59E0B12",color:"#F59E0B",border:"1px solid #F59E0B30",fontWeight:700}} title="طباعة مظاريف المرتبات على ظرف DL (220×110mm)">📮 مظاريف</Btn>}
                {/* V15.8: Quick entry button — bulk edit with 5 tabs, data persists across tabs */}
                {!isLocked&&canEdit&&<Btn small onClick={()=>{
                  /* V15.8: Initialize all 5 tabs with existing values. User can switch between tabs
                     and data entered is kept per-tab until they press 'Save All' */
                  const initTabData={
                    prevBalance:{selected:{},values:{}},
                    specialDeduct:{selected:{},values:{}},
                    installDeduct:{selected:{},values:{}},
                    bonus:{selected:{},values:{}},
                    thursdayPay:{selected:{},values:{}}
                  };
                  shownEmps.forEach(e=>{
                    [["prevBalance",salPrevBalanceOverride],["specialDeduct",salSpecialDeduct],["installDeduct",salManualInstallDeduct],["bonus",salBonus],["thursdayPay",salThursdayPay]].forEach(([k,src])=>{
                      const v=src[e.id];
                      if(v!==undefined&&v!==""&&Number(v)!==0){initTabData[k].selected[e.id]=true;initTabData[k].values[e.id]=String(v)}
                    });
                  });
                  setQuickEntryPopup({type:"prevBalance",tabData:initTabData,search:""});
                }} style={{background:"#8B5CF612",color:"#8B5CF6",border:"1px solid #8B5CF630",fontWeight:700}} title="إدخال سريع — دفعة واحدة لعدة موظفين بكل الحقول">⚡ إدخال سريع</Btn>}
                {!isLocked&&canEdit&&<Btn small onClick={()=>{setExcelImportMode("normal");setShowExcelImport(true)}} style={{background:"#10B98112",color:"#10B981",border:"1px solid #10B98130",fontWeight:700}} title="استيراد بيانات أسبوع كامل من Excel">📥 استيراد Excel</Btn>}
                <Btn small onClick={()=>{
                  /* Print the current filtered table as a single-page overview */
                  const rows=filteredShown.map((emp,i)=>{const c=getEmpSalary(emp.id,openWeek);if(!c)return"";
                    return"<tr>"+
                      "<td class='center'>"+(i+1)+"</td>"+
                      "<td>"+(emp.name||"")+(emp.code?" <span style='color:#94A3B8;font-size:10px'>#"+emp.code+"</span>":"")+"</td>"+
                      "<td class='center'>"+(emp.job||"—")+"</td>"+
                      "<td class='center'>"+fmt0(c.weeklySalary)+"</td>"+
                      "<td class='center' style='direction:ltr'>"+(c.totalHours>0?hrsToHM(c.totalHours):"—")+"</td>"+
                      "<td class='center' style='direction:ltr;color:#8B5CF6'>"+(c.overtimeHours>0?hrsToHM(c.overtimeHours):"—")+"</td>"+
                      "<td class='center ok'>"+fmt0(c.grossPay)+"</td>"+
                      "<td class='center'>"+(c.prevBalance!==0?(c.prevBalance>0?"+":"")+fmt0(c.prevBalance):"—")+"</td>"+
                      "<td class='center err'>"+(c.weekAdvances>0?fmt0(c.weekAdvances):"—")+"</td>"+
                      "<td class='center err'>"+(c.specialDeduct>0?fmt0(c.specialDeduct):"—")+"</td>"+
                      "<td class='center' style='color:#F97316'>"+(c.debtInstall>0?fmt0(c.debtInstall)+(c.isPartialInstall?" ⚠":""):c.isSkippedInstall?"⏭":"—")+"</td>"+
                      "<td class='center ok'>"+(c.bonus>0?fmt0(c.bonus):"—")+"</td>"+
                      "<td class='center info'><b>"+fmt0(c.totalDue)+"</b>"+(c.prevBalance!==0?"<div style='font-size:8px;color:#64748B;font-weight:500;margin-top:1px'>"+fmt0(c.netBalance)+" "+(c.prevBalance>0?"+":"−")+" "+fmt0(Math.abs(c.prevBalance))+"</div>":"")+"</td>"+
                      "<td class='center ok'><b>"+fmt0(c.thursdayPay)+"</b></td>"+
                      "<td class='center warn'>"+(c.remainingBalance!==0?fmt0(c.remainingBalance):"—")+"</td>"+
                    "</tr>";
                  }).join("");
                  /* Totals from filtered list */
                  let fG=0,fA=0,fD=0,fB=0,fTP=0,fRB=0,fDI=0;
                  filteredShown.forEach(e=>{const cc=getEmpSalary(e.id,openWeek);if(cc){fG+=cc.grossPay;fA+=cc.weekAdvances;fD+=cc.specialDeduct;fB+=cc.bonus;fTP+=cc.thursdayPay;fRB+=cc.remainingBalance;fDI+=cc.debtInstall||0}});
                  const totalsRow="<tr style='background:#E0F2FE;font-weight:800;border-top:2px solid #0284C7'>"+
                    "<td class='center' colspan='3'>الإجمالي — "+filteredShown.length+" موظف</td>"+
                    "<td class='center'>"+fmt0(filteredShown.reduce((s,e)=>s+(e.weeklySalary||0),0))+"</td>"+
                    "<td></td><td></td>"+
                    "<td class='center ok'>"+fmt0(fG)+"</td>"+
                    "<td></td>"+
                    "<td class='center err'>"+fmt0(fA)+"</td>"+
                    "<td class='center err'>"+fmt0(fD)+"</td>"+
                    "<td class='center' style='color:#F97316'>"+fmt0(fDI)+"</td>"+
                    "<td class='center ok'>"+fmt0(fB)+"</td>"+
                    "<td class='center info'>"+fmt0(filteredShown.reduce((s,e)=>{const cc=getEmpSalary(e.id,openWeek);return s+(cc?cc.totalDue:0)},0))+"</td>"+
                    "<td class='center ok'>"+fmt0(fTP)+"</td>"+
                    "<td class='center warn'>"+fmt0(fRB)+"</td>"+
                  "</tr>";
                  /* Filter summary */
                  const filterParts=[];
                  if(salSearchDeb)filterParts.push("بحث: \""+salSearchDeb+"\"");
                  if(salJobFilter)filterParts.push("وظيفة: "+salJobFilter);
                  if(salShowOnly){const labels={hasBonus:"لهم حافز",hasAdvances:"لهم مسحوبات",hasDeduct:"لهم خصم",hasInstall:"لهم قسط",hasBalance:"لهم رصيد"};filterParts.push("عرض: "+(labels[salShowOnly]||salShowOnly))}
                  const filterLine=filterParts.length>0?"<div style='background:#FEF3C7;padding:8px 12px;border-radius:6px;margin-bottom:12px;font-size:11px;color:#92400E'><b>الفلاتر المطبقة:</b> "+filterParts.join(" • ")+"</div>":"";
                  const title="جدول المرتبات — W"+openWeek.weekNum;
                  const html="<html dir='rtl'><head><meta charset='UTF-8'><title>"+title+"</title><style>"+PRINT_CSS+".center{text-align:center}table{font-size:10px}th{padding:6px 4px;font-size:10px}td{padding:4px 4px;font-size:10px}@page{size:A4 landscape;margin:8mm}</style></head><body>"+
                    "<div class='hdr'><div style='font-size:18px;font-weight:800;color:#0284C7'>💰 "+title+"</div><div class='hdr-info'><div>الفترة: "+openWeek.weekStart+" → "+openWeek.weekEnd+"</div><div>تاريخ الطباعة: "+today+"</div></div></div>"+
                    filterLine+
                    "<table><thead><tr><th>#</th><th>الاسم</th><th>الوظيفة</th><th>مرتب</th><th>ساعات</th><th>إضافي</th><th>مستحق</th><th>رصيد سابق</th><th>سلف</th><th>خصم</th><th>قسط</th><th>حافز</th><th>صافي</th><th>يُصرَف</th><th>رصيد مرحل</th></tr></thead><tbody>"+
                    (rows||"<tr><td colspan='15' class='center' style='padding:20px;color:#94A3B8'>لا توجد نتائج</td></tr>")+
                    totalsRow+
                    "</tbody></table>"+
                    "<div class='sig' style='margin-top:30px'><div class='sig-box'>المحاسب</div><div class='sig-box'>المدير</div></div>"+
                    "<div class='foot'>CLARK Factory Management — جدول مرتبات "+title+" — "+today+"</div>"+
                    "<script>setTimeout(function(){window.print()},500)</"+"script></body></html>";
                  const w=_openPrintWin();if(!w)return;
                  w.document.write(html);w.document.close();
                }} style={{background:"#8B5CF612",color:"#8B5CF6",border:"1px solid #8B5CF630",fontWeight:700}}>🖨 طباعة الجدول</Btn>
                <Btn small onClick={()=>{
                  /* Signature sheet — formal document for employees to sign upon receiving salary */
                  const rows=filteredShown.map((emp,i)=>{const c=getEmpSalary(emp.id,openWeek);if(!c)return"";
                    /* Combined deductions = special deduct + installment */
                    const totalDeduct=(c.specialDeduct||0)+(c.debtInstall||0);
                    return"<tr>"+
                      "<td class='center' style='font-weight:700'>"+(i+1)+"</td>"+
                      "<td style='font-weight:700;font-size:12px'>"+(emp.name||"")+(emp.code?"<br/><span style='color:#94A3B8;font-size:10px;font-weight:400'>#"+emp.code+"</span>":"")+"</td>"+
                      "<td class='center' style='font-weight:700'>"+fmt0(c.grossPay)+"</td>"+
                      "<td class='center' style='color:#EF4444'>"+(c.weekAdvances>0?fmt0(c.weekAdvances):"—")+"</td>"+
                      "<td class='center' style='color:#EF4444'>"+(totalDeduct>0?fmt0(totalDeduct):"—")+"</td>"+
                      "<td class='center' style='color:#10B981;font-weight:800;font-size:13px'>"+fmt0(c.thursdayPay)+"</td>"+
                      "<td class='center' style='color:"+(c.remainingBalance>0?"#F59E0B":c.remainingBalance<0?"#EF4444":"#64748B")+";font-weight:"+(c.remainingBalance!==0?800:400)+"'>"+(c.remainingBalance!==0?fmt0(c.remainingBalance):"0")+"</td>"+
                      "<td style='min-height:40px;border-bottom:1px solid #CBD5E1'></td>"+
                    "</tr>";
                  }).join("");
                  /* Totals */
                  let tG=0,tA=0,tDeduct=0,tPay=0,tBal=0;
                  filteredShown.forEach(e=>{const cc=getEmpSalary(e.id,openWeek);if(cc){tG+=cc.grossPay;tA+=cc.weekAdvances;tDeduct+=(cc.specialDeduct||0)+(cc.debtInstall||0);tPay+=cc.thursdayPay;tBal+=cc.remainingBalance}});
                  const totalsRow="<tr style='background:#F1F5F9;font-weight:800;border-top:3px double #0284C7'>"+
                    "<td class='center' colspan='2' style='font-size:13px'>الإجمالي — "+filteredShown.length+" موظف</td>"+
                    "<td class='center' style='font-size:13px'>"+fmt0(tG)+"</td>"+
                    "<td class='center' style='color:#EF4444'>"+fmt0(tA)+"</td>"+
                    "<td class='center' style='color:#EF4444'>"+fmt0(tDeduct)+"</td>"+
                    "<td class='center' style='color:#10B981;font-size:14px'>"+fmt0(tPay)+"</td>"+
                    "<td class='center' style='color:"+(tBal>0?"#F59E0B":"#64748B")+"'>"+fmt0(tBal)+"</td>"+
                    "<td></td>"+
                  "</tr>";
                  /* Filter info */
                  const filterParts=[];
                  if(salSearchDeb)filterParts.push("بحث: \""+salSearchDeb+"\"");
                  if(attSearchDeb)filterParts.push("بحث علوي: \""+attSearchDeb+"\"");
                  if(salJobFilter)filterParts.push("وظيفة: "+salJobFilter);
                  if(salShowOnly){const labels={hasBonus:"لهم حافز",hasAdvances:"لهم مسحوبات",hasDeduct:"لهم خصم",hasInstall:"لهم قسط",hasBalance:"لهم رصيد"};filterParts.push("عرض: "+(labels[salShowOnly]||salShowOnly))}
                  const filterLine=filterParts.length>0?"<div style='background:#FEF3C7;padding:6px 10px;border-radius:6px;margin-bottom:10px;font-size:10px;color:#92400E'><b>الفلاتر:</b> "+filterParts.join(" • ")+"</div>":"";
                  const title="كشف توقيع استلام المرتبات — W"+openWeek.weekNum;
                  const html="<html dir='rtl'><head><meta charset='UTF-8'><title>"+title+"</title>"+
                    "<style>"+
                    "*{margin:0;padding:0;box-sizing:border-box}"+
                    "body{font-family:'Cairo',Arial,sans-serif;padding:18px 22px;font-size:11px;direction:rtl;color:#1E293B;line-height:1.5}"+
                    ".hdr-sig{text-align:center;border-bottom:3px solid #0284C7;padding-bottom:12px;margin-bottom:14px}"+
                    ".hdr-sig h1{font-size:20px;color:#0284C7;margin-bottom:4px;font-weight:800}"+
                    ".hdr-sig .sub{font-size:13px;color:#334155;font-weight:700}"+
                    ".hdr-sig .meta{display:flex;justify-content:space-around;margin-top:12px;font-size:11px}"+
                    ".hdr-sig .meta-item{background:#F0F9FF;padding:6px 14px;border-radius:8px;border:1px solid #E0F2FE}"+
                    ".hdr-sig .meta-item b{color:#0284C7}"+
                    "table{width:100%;border-collapse:collapse;margin:10px 0;border:1.5px solid #64748B}"+
                    "th{background:linear-gradient(180deg,#E2E8F0,#CBD5E1);font-weight:800;font-size:11px;color:#1E293B;padding:8px 6px;text-align:center;border:1px solid #94A3B8}"+
                    "td{padding:8px 6px;text-align:right;border:1px solid #CBD5E1;font-size:11px;vertical-align:middle}"+
                    ".center{text-align:center}"+
                    "tr:nth-child(even){background:#F8FAFC}"+
                    ".sig-col{min-width:130px;width:130px}"+
                    ".notice{background:#FEF3C7;padding:8px 12px;border-radius:6px;border-right:4px solid #F59E0B;margin:12px 0;font-size:10px;color:#78350F}"+
                    ".sig-boxes{margin-top:30px;display:flex;justify-content:space-around;gap:40px}"+
                    ".sig-box{flex:1;text-align:center;padding-top:14px;border-top:2px solid #1E293B;font-weight:700;font-size:12px}"+
                    ".sig-box .role{font-size:10px;color:#64748B;margin-top:3px;font-weight:400}"+
                    ".foot{margin-top:25px;padding-top:8px;border-top:1px solid #CBD5E1;text-align:center;font-size:9px;color:#94A3B8;font-weight:600}"+
                    "@page{size:A4 portrait;margin:10mm}"+
                    "@media print{body{padding:10px}tr{page-break-inside:avoid}}"+
                    "</style></head><body>"+
                    "<div class='hdr-sig'>"+
                      "<h1>✍️ كشف توقيع استلام المرتبات</h1>"+
                      "<div class='sub'>CLARK Factory — "+(data.factoryName||"مصنع كلارك")+"</div>"+
                      "<div class='meta'>"+
                        "<div class='meta-item'>الأسبوع: <b>W"+openWeek.weekNum+"</b></div>"+
                        "<div class='meta-item'>الفترة: <b>"+openWeek.weekStart+" → "+openWeek.weekEnd+"</b></div>"+
                        "<div class='meta-item'>تاريخ الصرف: <b>"+today+"</b></div>"+
                      "</div>"+
                    "</div>"+
                    filterLine+
                    "<table>"+
                      "<thead><tr>"+
                        "<th style='width:30px'>#</th>"+
                        "<th style='min-width:130px'>اسم الموظف</th>"+
                        "<th>المستحق</th>"+
                        "<th>سلف</th>"+
                        "<th>خصم</th>"+
                        "<th style='background:linear-gradient(180deg,#D1FAE5,#A7F3D0)'>المدفوع</th>"+
                        "<th>الرصيد</th>"+
                        "<th class='sig-col'>التوقيع</th>"+
                      "</tr></thead>"+
                      "<tbody>"+
                        (rows||"<tr><td colspan='8' class='center' style='padding:30px;color:#94A3B8'>لا توجد موظفين</td></tr>")+
                        totalsRow+
                      "</tbody>"+
                    "</table>"+
                    /* Weekly advances section (for monthly/admin staff) */
                    (weeklyAdvances.length>0?
                      "<h2 style='font-size:14px;color:#10B981;margin:16px 0 8px;border-bottom:2px solid #A7F3D0;padding-bottom:4px'>💵 سلف الأسبوع (الشهريين والإدارة)</h2>"+
                      "<table style='margin-bottom:14px'>"+
                        "<thead><tr>"+
                          "<th style='width:30px'>#</th>"+
                          "<th>الموظف</th>"+
                          "<th>الوظيفة</th>"+
                          "<th>التاريخ</th>"+
                          "<th style='background:linear-gradient(180deg,#D1FAE5,#A7F3D0)'>المبلغ المستلم</th>"+
                          "<th>ملاحظة</th>"+
                          "<th class='sig-col'>التوقيع</th>"+
                        "</tr></thead>"+
                        "<tbody>"+
                          weeklyAdvances.map((a,i)=>"<tr>"+
                            "<td class='center' style='font-weight:700'>"+(i+1)+"</td>"+
                            "<td style='font-weight:700'>"+(a.empName||"")+"</td>"+
                            "<td>"+(a.empJob||"—")+"</td>"+
                            "<td class='center' style='direction:ltr;font-size:10px'>"+a.date+"</td>"+
                            "<td class='center' style='color:#10B981;font-weight:800;font-size:13px'>"+fmt0(a.amount)+"</td>"+
                            "<td style='font-size:10px'>"+(a.note||"—")+"</td>"+
                            "<td style='min-height:40px;border-bottom:1px solid #CBD5E1'></td>"+
                          "</tr>").join("")+
                          "<tr style='background:#F0FDF4;font-weight:800;border-top:2px solid #10B981'>"+
                            "<td class='center' colspan='4' style='font-size:12px'>إجمالي السلف الأسبوعية — "+weeklyAdvances.length+" سلفة</td>"+
                            "<td class='center' style='color:#10B981;font-size:14px'>"+fmt0(totalWeeklyAdvances)+"</td>"+
                            "<td colspan='2'></td>"+
                          "</tr>"+
                        "</tbody>"+
                      "</table>"
                    :"")+
                    "<div class='notice'>"+
                      "<b>⚠️ تنبيه:</b> بالتوقيع أمام اسمي أعلاه، أُقرّ باستلام المبلغ المذكور تحت خانة \"المدفوع\" بالكامل ودون أي خصم أو نقصان، وأنه لا يوجد لي أي مطالبات أخرى متعلقة بهذا الأسبوع."+
                    "</div>"+
                    "<div class='sig-boxes'>"+
                      "<div class='sig-box'>المحاسب<div class='role'>التوقيع والختم</div></div>"+
                      "<div class='sig-box'>المدير المسؤول<div class='role'>التوقيع والختم</div></div>"+
                    "</div>"+
                    "<div class='foot'>CLARK Factory Management — كشف توقيع W"+openWeek.weekNum+" — تم الإصدار "+today+"</div>"+
                    "<script>setTimeout(function(){window.print()},500)</"+"script>"+
                    "</body></html>";
                  const w=_openPrintWin();if(!w)return;
                  w.document.write(html);w.document.close();
                }} style={{background:"#059669"+"12",color:"#059669",border:"1px solid #05966930",fontWeight:700}}>✍️ كشف توقيع</Btn>
                <Btn small onClick={()=>{const sel={};shownEmps.forEach(e=>{sel[e.id]=true});setBulkPrintSel(sel);setShowBulkPrint(true)}} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30",fontWeight:700}}>🖨 طباعة مجمعة</Btn>
              </div>
            </div>
            <div style={{overflowX:"auto",overflowY:"auto",maxHeight:"calc(100vh - 260px)",border:"1px solid "+T.brd,borderRadius:10}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead style={{position:"sticky",top:0,zIndex:10}}><tr>
              {cols.map((c,i)=><th key={i} style={{padding:"10px 6px",textAlign:"center",fontSize:FS-2,color:T.textSec,borderBottom:"2px solid "+T.brd,fontWeight:700,whiteSpace:"nowrap",width:c.w||"auto",background:T.cardSolid,boxShadow:"0 2px 4px rgba(0,0,0,0.05)"}}>{c.label}</th>)}
            </tr></thead><tbody>
              {filteredShown.length===0?<tr><td colSpan={cols.length} style={{padding:30,textAlign:"center",color:T.textMut,fontSize:FS-1}}>
                {shownEmps.length===0?"لا يوجد موظفين":"لا توجد نتائج للفلاتر الحالية"}
              </td></tr>:filteredShown.map((emp,i)=>{const c=getEmpSalary(emp.id,openWeek);if(!c)return null;const zebra=i%2===1?T.bg:T.cardSolid;const isFocused=focusedEmpId===emp.id;
                return<tr key={emp.id} onFocus={()=>setFocusedEmpId(emp.id)} onBlur={(e)=>{if(!e.currentTarget.contains(e.relatedTarget))setFocusedEmpId(null)}} style={{borderBottom:"1px solid "+T.brd,background:isFocused?T.accent+"12":zebra,boxShadow:isFocused?"inset 4px 0 0 "+T.accent:"none",transition:"background 0.15s, box-shadow 0.15s"}}>
                  <td style={{padding:"3px 6px",fontSize:FS-2,color:isFocused?T.accent:T.textMut,textAlign:"center",fontWeight:isFocused?800:400}}>{i+1}</td>
                  <td style={{padding:"3px 10px",fontSize:isFocused?FS+2:FS-1,fontWeight:isFocused?800:700,textAlign:"right",color:isFocused?T.accent:T.text,transition:"font-size 0.15s, color 0.15s"}}>{emp.name}</td>
                  <td style={{padding:"3px 6px",fontSize:FS-2,color:T.accent,textAlign:"center",fontWeight:700}}>{fmt0(c.weeklySalary)}</td>
                  <td style={{padding:"3px 6px",textAlign:"center"}}>{!isLocked?<input type="number" value={salBaseHoursOverride[emp.id]!==undefined?salBaseHoursOverride[emp.id]:""} onChange={ev=>setSalBaseHoursOverride(p=>({...p,[emp.id]:ev.target.value}))} placeholder={String(openWeek.baseHours||48)} style={{width:50,padding:"3px",borderRadius:6,border:"1px solid "+T.accent+"40",fontSize:FS-2,fontFamily:"inherit",textAlign:"center",background:T.inputBg,color:salBaseHoursOverride[emp.id]?T.warn:T.text,fontWeight:salBaseHoursOverride[emp.id]?700:400}}/>:<span style={{fontSize:FS-2,color:c.baseHours!==(openWeek.baseHours||48)?T.warn:T.textMut,fontWeight:c.baseHours!==(openWeek.baseHours||48)?700:400}}>{c.baseHours}</span>}</td>
                  <td style={{padding:"3px 6px",fontSize:FS-2,textAlign:"center",direction:"ltr"}} title={"("+r2(c.totalHours)+" ساعة عشرية)"}>{c.totalHours>0?hrsToHM(c.totalHours):"—"}</td>
                  <td style={{padding:"3px 6px",fontSize:FS-2,color:c.overtimeHours>0?"#8B5CF6":T.textMut,textAlign:"center",fontWeight:c.overtimeHours>0?700:400,direction:"ltr"}} title={c.overtimeHours>0?"("+r2(c.overtimeHours)+" ساعة عشرية)":""}>{c.overtimeHours>0?hrsToHM(c.overtimeHours):"—"}</td>
                  <td style={{padding:"3px 6px",fontSize:FS-2,color:c.overtimePay>0?"#8B5CF6":T.textMut,textAlign:"center",fontWeight:c.overtimePay>0?700:400}} title={c.overtimePay>0?"قيمة الوقت الإضافي ("+OT_MULT+"×)":""}>{c.overtimePay>0?fmt0(c.overtimePay):"—"}</td>
                  <td style={{padding:"3px 6px",fontSize:FS-1,fontWeight:700,color:T.ok,textAlign:"center"}}>{fmt0(c.grossPay)}</td>
                  <td style={{padding:"3px 6px",textAlign:"center"}}>{!isLocked?<input type="number" value={salPrevBalanceOverride[emp.id]!==undefined?salPrevBalanceOverride[emp.id]:""} onChange={ev=>setSalPrevBalanceOverride(p=>({...p,[emp.id]:ev.target.value}))} placeholder={String(emp.prevBalance||0)} title={"الافتراضي: "+(emp.prevBalance||0)+" (من الأسبوع السابق)"} style={{width:70,padding:"3px",borderRadius:6,border:"1px solid "+(c.prevBalanceIsManual?T.warn+"60":T.brd),fontSize:FS-2,fontFamily:"inherit",textAlign:"center",background:T.inputBg,color:c.prevBalanceIsManual?T.warn:(c.prevBalance>=0?T.ok:T.err),fontWeight:c.prevBalanceIsManual?700:400}}/>:<span style={{fontSize:FS-2,color:c.prevBalanceIsManual?T.warn:(c.prevBalance>=0?T.ok:T.err),fontWeight:c.prevBalanceIsManual?700:400}}>{fmt0(c.prevBalance)}</span>}</td>
                  <td style={{padding:"3px 6px",fontSize:FS-1,fontWeight:700,color:c.weekAdvances>0?T.err:T.textMut,textAlign:"center"}}>
                    <div style={{display:"flex",gap:4,justifyContent:"center",alignItems:"center"}}>
                      <span>{c.weekAdvances>0?fmt0(c.weekAdvances):"—"}</span>
                      {!isLocked&&canEdit&&<span onClick={()=>setQuickAdvance({empId:emp.id,empName:emp.name,amount:"",date:today,note:"",account:(()=>{const acc=(data.treasuryAccounts||[]).find(a=>{const n=typeof a==="string"?a:(a.name||a.id||"");return n.toUpperCase().includes("SUB")});return acc?(typeof acc==="string"?acc:(acc.name||acc.id)):"SUB CASH"})()})} title="تسجيل سلفة سريعة" style={{cursor:"pointer",fontSize:11,padding:"2px 5px",borderRadius:4,background:T.ok+"15",color:T.ok,border:"1px solid "+T.ok+"30"}}>+</span>}
                    </div>
                  </td>
                  <td style={{padding:"3px 6px",textAlign:"center"}}>{!isLocked?<div style={{display:"flex",gap:3,justifyContent:"center",alignItems:"center"}}>
                    <input type="number" value={salSpecialDeduct[emp.id]||""} onChange={ev=>setSalSpecialDeduct(p=>({...p,[emp.id]:ev.target.value}))} placeholder="0" style={{width:60,padding:"3px",borderRadius:6,border:"1px solid "+T.brd,fontSize:FS-2,fontFamily:"inherit",textAlign:"center",background:T.inputBg,color:T.text}}/>
                    <span onClick={()=>openTextPopup({title:"سبب الخصم",subtitle:emp.name,value:salDeductReason[emp.id]||"",placeholder:"اكتب سبب الخصم...",multiline:true,onSave:v=>setSalDeductReason(p=>({...p,[emp.id]:v}))})} style={{cursor:"pointer",fontSize:11,padding:"2px 5px",borderRadius:4,background:salDeductReason[emp.id]?T.warn+"15":T.bg,color:salDeductReason[emp.id]?T.warn:T.textMut,border:"1px solid "+(salDeductReason[emp.id]?T.warn+"30":T.brd)}} title={salDeductReason[emp.id]||"إضافة سبب"}>📝</span>
                  </div>:<span style={{fontSize:FS-2,color:T.err}}>{c.specialDeduct||""}</span>}</td>
                  <td style={{padding:"3px 6px",textAlign:"center"}}>
                    {c.debtInfoTotal>0?(!isLocked?<div style={{display:"flex",gap:3,justifyContent:"center",alignItems:"center"}}>
                      <input type="number" value={salInstallOverride[emp.id]!==undefined?salInstallOverride[emp.id]:""} onChange={ev=>setSalInstallOverride(p=>({...p,[emp.id]:ev.target.value}))} placeholder={String(c.debtInfoTotal)} title={"القسط الأسبوعي: "+fmt0(c.debtInfoTotal)+" ج.م\nاكتب رقم أقل لدفع جزئي\n0 = تخطي (يتأجل للأسبوع القادم)"} style={{width:65,padding:"3px",borderRadius:6,border:"1px solid "+(c.isSkippedInstall?T.err+"60":c.isPartialInstall?T.warn+"60":"#F9731660"),fontSize:FS-1,fontFamily:"inherit",textAlign:"center",background:T.inputBg,color:c.isSkippedInstall?T.err:c.isPartialInstall?T.warn:"#F97316",fontWeight:800}}/>
                      <span onClick={()=>setSalInstallOverride(p=>({...p,[emp.id]:"0"}))} style={{cursor:"pointer",fontSize:11,padding:"2px 5px",borderRadius:4,background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30"}} title="تخطي القسط (يتأجل للأسبوع القادم)">⏭</span>
                      <span onClick={()=>setShowEmpDebts(emp.id)} style={{cursor:"pointer",fontSize:11,padding:"2px 5px",borderRadius:4,background:"#F9731615",color:"#F97316",border:"1px solid #F9731630"}} title="عرض الأقساط">📝</span>
                    </div>:<div style={{display:"flex",gap:3,justifyContent:"center",alignItems:"center"}}>
                      <span style={{fontSize:FS-1,fontWeight:700,color:c.isSkippedInstall?T.err:c.isPartialInstall?T.warn:"#F97316",background:(c.isSkippedInstall?T.err:c.isPartialInstall?T.warn:"#F97316")+"10",padding:"3px 8px",borderRadius:6,border:"1px solid "+(c.isSkippedInstall?T.err:c.isPartialInstall?T.warn:"#F97316")+"30"}}>{fmt0(c.debtInstall)}</span>
                      {c.isPartialInstall&&<span title={"دفع جزئي — المتبقي "+fmt0(c.debtInfoTotal-c.debtInstall)+" أُجِّل"} style={{fontSize:10,color:T.warn}}>⚠️</span>}
                      {c.isSkippedInstall&&<span title="تم تخطي هذا القسط" style={{fontSize:10,color:T.err}}>⏭</span>}
                    </div>):(()=>{
                      /* V15.75: Show manual input if no debts are DUE this week
                         (even if debts exist but haven't started yet / already paid) */
                      const hasAnyActive=empActiveDebts(emp.id).length>0;
                      const hasNoDueThisWeek=c.debtInfoTotal===0;
                      if(hasAnyActive&&!hasNoDueThisWeek){
                        return<span style={{fontSize:FS-2,color:T.textMut}} title="يوجد أقساط لهذا الموظف غير مستحقة في هذا الأسبوع">—</span>;
                      }
                      return!isLocked?<div style={{display:"flex",gap:3,justifyContent:"center",alignItems:"center"}}>
                      <input type="number" value={salManualInstallDeduct[emp.id]||""} onChange={ev=>setSalManualInstallDeduct(p=>({...p,[emp.id]:ev.target.value}))} placeholder="0" title={hasAnyActive?"خصم مباشر الأسبوع ده (الأقساط لم تبدأ بعد)":"خصم مباشر (مش قسط)"} style={{width:60,padding:"3px",borderRadius:6,border:"1px solid "+(salManualInstallDeduct[emp.id]?"#F9731660":T.brd),fontSize:FS-2,fontFamily:"inherit",textAlign:"center",background:T.inputBg,color:salManualInstallDeduct[emp.id]?"#F97316":T.text,fontWeight:salManualInstallDeduct[emp.id]?700:400}}/>
                      <span onClick={()=>{setShowDebtForm({empId:emp.id});resetDebtForm();setDebtStart(today)}} style={{cursor:"pointer",fontSize:11,padding:"2px 5px",borderRadius:4,background:T.bg,color:T.textMut,border:"1px dashed "+T.brd}} title="إضافة قسط/مديونية">+</span>
                    </div>:<span style={{fontSize:FS-2,color:T.err}}>{c.manualInstallDeduct||""}</span>;
                    })()}
                  </td>
                  <td style={{padding:"3px 6px",textAlign:"center"}}>{!isLocked?<input type="number" value={salBonus[emp.id]!==undefined?salBonus[emp.id]:""} onChange={ev=>setSalBonus(p=>({...p,[emp.id]:ev.target.value}))} placeholder={emp.weeklyBonus>0?String(emp.weeklyBonus):"0"} title={emp.weeklyBonus>0?"الافتراضي: "+emp.weeklyBonus+" (تلقائي)":""} style={{width:60,padding:"3px",borderRadius:6,border:"1px solid "+T.brd,fontSize:FS-2,fontFamily:"inherit",textAlign:"center",background:T.inputBg,color:T.text}}/>:<span style={{fontSize:FS-2,color:T.ok}}>{c.bonus||""}</span>}</td>
                  <td style={{padding:"3px 6px",fontSize:FS,fontWeight:800,color:c.totalDue>=0?T.accent:T.err,textAlign:"center"}} title={c.prevBalance!==0?("صافي الأسبوع: "+fmt0(c.netBalance)+" + رصيد سابق: "+(c.prevBalance>0?"+":"")+fmt0(c.prevBalance)+" = إجمالي المستحق: "+fmt0(c.totalDue)):"صافي المستحق = "+fmt0(c.netBalance)}>
                    {fmt0(c.totalDue)}
                    {c.prevBalance!==0&&<div style={{fontSize:FS-3,color:T.textMut,fontWeight:500,marginTop:2,lineHeight:1.2,whiteSpace:"nowrap"}}>{fmt0(c.netBalance)+" "+(c.prevBalance>0?"+":"−")+" "+fmt0(Math.abs(c.prevBalance))}</div>}
                  </td>
                  <td style={{padding:"3px 6px",textAlign:"center"}}>{!isLocked?<input type="number" value={salThursdayPay[emp.id]!==undefined?salThursdayPay[emp.id]:""} onChange={ev=>setSalThursdayPay(p=>({...p,[emp.id]:ev.target.value}))} placeholder={String(Math.round(c.totalDue))} title={"الافتراضي: "+fmt0(c.totalDue)+" (= صافي "+fmt0(c.netBalance)+(c.prevBalance!==0?" "+(c.prevBalance>0?"+":"−")+" رصيد "+fmt0(Math.abs(c.prevBalance)):"")+")"} style={{width:70,padding:"3px",borderRadius:6,border:"1px solid "+T.ok+"40",fontSize:FS-2,fontFamily:"inherit",textAlign:"center",background:T.inputBg,color:T.ok,fontWeight:700}}/>:<span style={{fontSize:FS-1,fontWeight:700,color:T.ok}}>{fmt0(c.thursdayPay)}</span>}</td>
                  <td style={{padding:"3px 6px",fontSize:FS-1,fontWeight:800,color:c.remainingBalance>0?T.warn:c.remainingBalance<0?T.err:T.textMut,textAlign:"center",background:c.remainingBalance!==0?T.warn+"06":""}}>{fmt0(c.remainingBalance)}</td>
                  {/* V14.57: Receipt column — only shown for closed weeks */}
                  {openWeek.status==="closed"&&(()=>{
                    const rec=((openWeek.receipts||{})[emp.id]);
                    return<td style={{padding:"3px 6px",textAlign:"center"}} title={rec?"استلم بواسطة "+(rec.by||"—")+" في "+(rec.at?new Date(rec.at).toLocaleString("ar-EG"):"—"):"لم يستلم بعد"}>
                      {rec?<span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:28,height:28,borderRadius:8,background:T.ok+"15",color:T.ok,fontSize:16,fontWeight:900}}>✓</span>
                        :<span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:28,height:28,borderRadius:8,background:T.err+"10",color:T.err,fontSize:16,fontWeight:900}}>✕</span>}
                    </td>;
                  })()}
                  <td style={{padding:"3px 6px",textAlign:"center"}}>
                    <div style={{display:"flex",gap:6,justifyContent:"center",alignItems:"center"}}>
                      <span onClick={()=>printSlip(emp.id)} style={{cursor:"pointer",fontSize:14}} title="طباعة كشف المرتب">🖨</span>
                      <span onClick={()=>whatsAppSlip(emp.id)} style={{cursor:"pointer",fontSize:14}} title={emp.phone?"إرسال للواتساب: "+emp.phone:"لا يوجد رقم تليفون"}>💬</span>
                    </div>
                  </td>
                </tr>})}
              </tbody>
              {/* Grand totals — non-sticky, scrolls with table for perfect alignment */}
              <tfoot><tr style={{background:T.accent+"15",fontWeight:800,borderTop:"3px double "+T.accent+"60"}}>
                <td colSpan={2} style={{padding:"10px",textAlign:"right",fontSize:FS-1,fontWeight:800,background:T.accent+"15"}}>الاجمالي</td>
                <td style={{padding:"8px 6px",textAlign:"center",fontSize:FS-2,color:T.accent,background:T.accent+"15"}}>{fmt0(shownEmps.reduce((s,e)=>s+(e.weeklySalary||0),0))}</td>
                <td style={{padding:"8px 6px",textAlign:"center",fontSize:FS-2,color:T.textMut,background:T.accent+"15"}}>{openWeek.baseHours||48}</td>
                <td style={{padding:"8px 6px",textAlign:"center",fontSize:FS-2,direction:"ltr",background:T.accent+"15"}}>{hrsToHM(tH)}</td>
                <td style={{padding:"8px 6px",textAlign:"center",fontSize:FS-2,color:"#8B5CF6",direction:"ltr",background:T.accent+"15"}}>{hrsToHM(tO)}</td>
                <td style={{padding:"8px 6px",textAlign:"center",fontSize:FS-2,color:"#8B5CF6",fontWeight:800,background:T.accent+"15"}}>{fmt0(tOP)}</td>
                <td style={{padding:"8px 6px",textAlign:"center",fontSize:FS-1,color:T.ok,fontWeight:800,background:T.accent+"15"}}>{fmt0(tG)}</td>
                <td style={{padding:"8px 6px",textAlign:"center",fontSize:FS-1,color:tPB>0?T.warn:tPB<0?T.err:T.textMut,fontWeight:800,background:T.accent+"15"}}>{tPB!==0?fmt0(tPB):"—"}</td>
                <td style={{padding:"8px 6px",textAlign:"center",fontSize:FS-1,color:T.err,fontWeight:800,background:T.accent+"15"}}>{fmt0(tA)}</td>
                <td style={{padding:"8px 6px",textAlign:"center",fontSize:FS-1,color:T.err,fontWeight:800,background:T.accent+"15"}}>{fmt0(tD)}</td>
                <td style={{padding:"8px 6px",textAlign:"center",fontSize:FS-1,color:"#F97316",fontWeight:800,background:T.accent+"15"}}>{fmt0(tDI)}</td>
                <td style={{padding:"8px 6px",textAlign:"center",fontSize:FS-1,color:T.ok,fontWeight:800,background:T.accent+"15"}}>{fmt0(tB)}</td>
                <td style={{padding:"8px 6px",textAlign:"center",fontSize:FS+1,color:T.accent,fontWeight:800,background:T.accent+"15"}} title={tPB!==0?("إجمالي صافي الأسبوع: "+fmt0(tN)+" + إجمالي الرصيد السابق: "+(tPB>0?"+":"")+fmt0(tPB)+" = إجمالي المستحق: "+fmt0(tTD)):"إجمالي صافي المستحق"}>
                  {fmt0(tTD)}
                  {tPB!==0&&<div style={{fontSize:FS-3,color:T.textMut,fontWeight:600,marginTop:2,lineHeight:1.2,whiteSpace:"nowrap"}}>{fmt0(tN)+" "+(tPB>0?"+":"−")+" "+fmt0(Math.abs(tPB))}</div>}
                </td>
                <td style={{padding:"8px 6px",textAlign:"center",fontSize:FS,color:T.ok,fontWeight:800,background:T.accent+"15"}}>{fmt0(tTP)}</td>
                <td style={{padding:"8px 6px",textAlign:"center",fontSize:FS,color:T.warn,fontWeight:800,background:T.accent+"15"}}>{fmt0(tRB)}</td>
                <td style={{background:T.accent+"15"}}></td>
              </tr></tfoot>
            </table></div>
            {canEdit&&!isClosed&&<div style={{marginTop:14,display:"flex",gap:10,justifyContent:"center",alignItems:"center",flexWrap:"wrap"}}>
              <Btn onClick={saveDraftInputs} style={{fontSize:FS,padding:"10px 20px",background:hasUnsavedChanges?T.warn:T.ok+"15",color:hasUnsavedChanges?"#fff":T.ok,border:hasUnsavedChanges?"1px solid "+T.warn:"1px solid "+T.ok+"40",fontWeight:700}}>{hasUnsavedChanges?"💾 حفظ التعديلات":"✓ محفوظ"}</Btn>
              {openWeek.draftInputs?.lastSaved&&<span style={{fontSize:FS-2,color:T.textMut}} title={"آخر حفظ: "+new Date(openWeek.draftInputs.lastSaved).toLocaleString("ar-EG")}>{"آخر حفظ: "+(()=>{const d=new Date(openWeek.draftInputs.lastSaved);const now=new Date();const diffMs=now-d;const mins=Math.floor(diffMs/60000);if(mins<1)return"الآن";if(mins<60)return"منذ "+mins+" دقيقة";const hrs=Math.floor(mins/60);if(hrs<24)return"منذ "+hrs+" ساعة";return d.toLocaleDateString("ar-EG")})()}</span>}
              <Btn primary onClick={()=>{setCloseDateValue(today);setShowCloseDate(true)}} style={{fontSize:FS+1,padding:"12px 30px"}}>💰 اعتماد وقفل الأسبوع W{openWeek.weekNum}</Btn>
            </div>}
            {isClosed&&<div style={{marginTop:10,textAlign:"center",padding:12,borderRadius:10,background:T.ok+"08",color:T.ok,fontWeight:700}}>
              {"✅ هذا الأسبوع مقفول — تم الاعتماد "+openWeek.closedAt+" بواسطة "+openWeek.closedBy}
              {openWeek.actualClosedAt&&openWeek.actualClosedAt!==openWeek.closedAt&&<div style={{fontSize:FS-2,color:T.warn,marginTop:6,fontWeight:700,padding:"4px 10px",background:T.warn+"10",borderRadius:6,display:"inline-block"}} title="التاريخ الحقيقي للإقفال — غير قابل للتعديل">
                ⚠️ تاريخ الإقفال الفعلي: {openWeek.actualClosedAt}{openWeek.actualClosedTs?" "+new Date(openWeek.actualClosedTs).toLocaleTimeString("ar-EG",{hour:"2-digit",minute:"2-digit"}):""}
              </div>}
            </div>}
          </Card>})()}

        {/* V15.34: Weekly Advances — moved here (after salary table, before ws payments) for better flow */}
        <Card title={"💵 سلف الأسبوع (للشهريين والإدارة) — "+weeklyAdvances.length+" سلفة — الإجمالي "+fmt0(totalWeeklyAdvances)+" ج"} style={{marginBottom:14}} extra={canEdit&&!isLocked?<Btn small onClick={()=>{resetAdvForm();setShowAdvForm(true)}} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30",fontWeight:700}}>+ إضافة سلفة</Btn>:null}>
          {weeklyAdvances.length===0?<div style={{padding:20,textAlign:"center",color:T.textMut,fontSize:FS-1}}>
            <div style={{fontSize:28,marginBottom:6}}>💵</div>
            <div>لا توجد سلف مسجلة في هذا الأسبوع</div>
            {canEdit&&!isLocked&&<div style={{fontSize:FS-2,marginTop:4}}>اضغط "+ إضافة سلفة" لتسجيل سلفة لموظف شهري أو إداري</div>}
          </div>:<div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:FS-1}}>
              <thead><tr>
                <th style={{...TH,width:30}}>#</th>
                <th style={TH}>الموظف</th>
                <th style={TH}>الوظيفة</th>
                <th style={{...TH,textAlign:"center"}}>المبلغ</th>
                <th style={{...TH,textAlign:"center"}}>التاريخ</th>
                <th style={TH}>ملاحظة</th>
                {canEdit&&!isLocked&&<th style={{...TH,width:40}}></th>}
              </tr></thead>
              <tbody>
                {weeklyAdvances.map((a,i)=><tr key={a.id} style={{borderBottom:"1px solid "+T.brd,background:i%2===1?T.bg:"transparent"}}>
                  <td style={{...TD,textAlign:"center",color:T.textMut}}>{i+1}</td>
                  <td style={{...TD,fontWeight:700}}>{a.empName}</td>
                  <td style={{...TD,color:T.textSec}}>{a.empJob||"—"}</td>
                  <td style={{...TD,textAlign:"center",fontWeight:800,color:T.err}}>{fmt0(a.amount)}</td>
                  <td style={{...TD,textAlign:"center",color:T.textMut,fontSize:FS-2,direction:"ltr"}}>{a.date}</td>
                  <td style={{...TD,color:T.textSec,fontSize:FS-2}}>{a.note||"—"}</td>
                  {canEdit&&!isLocked&&<td style={{...TD,textAlign:"center"}}>
                    <span onClick={()=>deleteWeeklyAdvance(a.id)} style={{cursor:"pointer",padding:"2px 8px",borderRadius:6,fontSize:FS-1,background:T.err+"10",color:T.err,border:"1px solid "+T.err+"25"}} title="حذف">🗑</span>
                  </td>}
                </tr>)}
                <tr style={{background:T.err+"08",fontWeight:800,borderTop:"2px solid "+T.err+"30"}}>
                  <td colSpan={3} style={{...TD,textAlign:"right",fontWeight:800}}>الإجمالي</td>
                  <td style={{...TD,textAlign:"center",color:T.err,fontSize:FS+1}}>{fmt0(totalWeeklyAdvances)}</td>
                  <td colSpan={canEdit&&!isLocked?3:2}></td>
                </tr>
              </tbody>
            </table>
          </div>}
        </Card>

        {/* V15.27: Workshop Payments Card — between salary table and attendance chart */}
        {!isLocked&&(()=>{
          const selectedWs=wsPayWs?workshopsList.find(w=>w.name===wsPayWs):null;
          const selectedBal=selectedWs?wsTotalBalance(wsPayWs):null;
          const selectedWeekDue=selectedWs?wsWeekDue(wsPayWs,openWeek):0;
          return<Card title={"💸 دفعات الورش — W"+openWeek.weekNum+(weeklyWsPayments.length>0?" ("+weeklyWsPayments.length+")":"")} style={{marginBottom:14}}>
            {/* Header with add button + total */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,marginBottom:12}}>
              <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                <div style={{fontSize:FS-2,color:T.textSec}}>إجمالي مخطط:</div>
                <div style={{fontSize:FS+2,fontWeight:800,color:T.warn}}>{fmt0(totalWeeklyWsPayments)} ج</div>
              </div>
              {/* V15.72: Single button opens bulk popup for all workshops at once */}
              {canEdit&&<Btn small onClick={()=>{
                /* Prefill amounts from existing week payments */
                const existing={};
                (openWeek.weeklyWsPayments||[]).filter(p=>p.type==="payment").forEach(p=>{
                  existing[p.wsName]=(existing[p.wsName]||0)+(Number(p.amount)||0);
                });
                setWsBulkAmounts(existing);setWsBulkNote("");
                setShowWsBulkPopup(true);
              }} style={{background:"#8B5CF612",color:"#8B5CF6",border:"1px solid #8B5CF630",fontWeight:700}}>
                💸 تسجيل الدفعات
              </Btn>}
            </div>

            {/* Add form — V15.72: hidden, replaced by bulk popup */}
            {false&&showWsPayForm&&canEdit&&<div style={{padding:"14px",background:"#8B5CF608",border:"1px solid #8B5CF630",borderRadius:12,marginBottom:12}}>
              <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:10,marginBottom:10}}>
                {/* Workshop selector */}
                <div>
                  <div style={{fontSize:FS-2,color:T.textSec,marginBottom:4,fontWeight:700}}>الورشة</div>
                  <SearchSel value={wsPayWs} onChange={setWsPayWs} options={workshopsList.filter(w=>_wsIsExternal(w.name||w)).map(w=>({value:w.name||w,label:(w.name||w)+(w.owner?" — "+w.owner:"")}))} placeholder="ابحث عن ورشة..."/>
                </div>
                {/* Type */}
                <div>
                  <div style={{fontSize:FS-2,color:T.textSec,marginBottom:4,fontWeight:700}}>نوع العملية</div>
                  <Sel value={wsPayType} onChange={setWsPayType}>
                    <option value="payment">💰 دفعة</option>
                    <option value="purchase">🛒 مشتريات</option>
                  </Sel>
                </div>
              </div>

              {/* Balance info when workshop is selected */}
              {selectedWs&&(()=>{const pct=Number(selectedWs.payPercent)||60;const limit=r2(((selectedBal.due||0)+(selectedBal.purchase||0))*pct/100);
                const allPaid=selectedWeekDue<=0;
                return<div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"1fr 1fr 1fr",gap:8,marginBottom:12,padding:"10px 12px",background:T.cardSolid,border:"1px solid "+T.brd,borderRadius:10}}>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:FS-3,color:T.textMut,fontWeight:600,marginBottom:2}}>📊 الرصيد الإجمالي</div>
                  <div style={{fontSize:FS,fontWeight:800,color:selectedBal.balance>0?T.err:T.ok}}>{fmt0(selectedBal.balance)} ج</div>
                </div>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:FS-3,color:T.textMut,fontWeight:600,marginBottom:2}}>💰 {"حد "+pct+"%"}</div>
                  {allPaid?<div style={{fontSize:FS-1,fontWeight:800,color:T.ok}}>✓ تم الدفع</div>
                    :<div style={{fontSize:FS,fontWeight:800,color:"#8B5CF6"}}>{fmt0(selectedWeekDue)} ج</div>}
                  <div style={{fontSize:FS-4,color:T.textMut,marginTop:2}}>{"من "+fmt0(limit)}</div>
                </div>
                <div style={{textAlign:"center",gridColumn:isMob?"1/-1":"auto"}}>
                  <div style={{fontSize:FS-3,color:T.textMut,fontWeight:600,marginBottom:2}}>💸 إجمالي المدفوع</div>
                  <div style={{fontSize:FS,fontWeight:800,color:T.textSec}}>{fmt0(selectedBal.paid)} ج</div>
                </div>
              </div>})()}

              <div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"1fr 1fr 2fr",gap:10,marginBottom:12}}>
                <div>
                  <div style={{fontSize:FS-2,color:T.textSec,marginBottom:4,fontWeight:700}}>المبلغ</div>
                  <Inp type="number" value={wsPayAmount} onChange={e=>setWsPayAmount(e.target.value)} placeholder="0" style={{textAlign:"center",fontWeight:800}}/>
                </div>
                <div>
                  <div style={{fontSize:FS-2,color:T.textSec,marginBottom:4,fontWeight:700}}>التاريخ</div>
                  <Inp type="date" value={wsPayDate} onChange={e=>setWsPayDate(e.target.value)} min={openWeek.weekStart} max={openWeek.weekEnd}/>
                </div>
                <div>
                  <div style={{fontSize:FS-2,color:T.textSec,marginBottom:4,fontWeight:700}}>ملاحظة (اختياري)</div>
                  <Inp type="text" value={wsPayNote} onChange={e=>setWsPayNote(e.target.value)} placeholder="مثل: دفعة منتصف الأسبوع"/>
                </div>
              </div>

              <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                <Btn onClick={()=>{setShowWsPayForm(false);resetWsPayForm()}} style={{background:T.bg,color:T.textSec,border:"1px solid "+T.brd}}>إلغاء</Btn>
                <Btn onClick={saveWeeklyWsPayment} disabled={!wsPayWs||!wsPayAmount||Number(wsPayAmount)<=0} style={{background:"#8B5CF6",color:"#fff",border:"none",fontWeight:800}}>✓ إضافة للخطة</Btn>
              </div>
            </div>}

            {/* List of planned payments */}
            {weeklyWsPayments.length===0?<div style={{padding:"20px",textAlign:"center",color:T.textMut,fontSize:FS-1,background:T.bg,borderRadius:10,border:"1px dashed "+T.brd}}>
              لا توجد دفعات ورش مخططة لهذا الأسبوع
            </div>:<div style={{border:"1px solid "+T.brd,borderRadius:10,overflow:"hidden"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr style={{background:T.bg}}>
                  <th style={{padding:"8px",textAlign:"right",fontSize:FS-2,color:T.textSec,fontWeight:800,borderBottom:"2px solid "+T.brd}}>الورشة</th>
                  <th style={{padding:"8px",textAlign:"center",fontSize:FS-2,color:T.textSec,fontWeight:800,borderBottom:"2px solid "+T.brd}}>النوع</th>
                  <th style={{padding:"8px",textAlign:"center",fontSize:FS-2,color:T.textSec,fontWeight:800,borderBottom:"2px solid "+T.brd}}>المبلغ</th>
                  <th style={{padding:"8px",textAlign:"center",fontSize:FS-2,color:T.textSec,fontWeight:800,borderBottom:"2px solid "+T.brd}}>التاريخ</th>
                  <th style={{padding:"8px",textAlign:"right",fontSize:FS-2,color:T.textSec,fontWeight:800,borderBottom:"2px solid "+T.brd}}>ملاحظة</th>
                  {canEdit&&<th style={{padding:"8px",textAlign:"center",fontSize:FS-2,color:T.textSec,fontWeight:800,borderBottom:"2px solid "+T.brd}}></th>}
                </tr></thead>
                <tbody>{weeklyWsPayments.map((p,i)=>
                  <tr key={p.id} style={{borderBottom:"1px solid "+T.brd,background:i%2===0?"transparent":T.bg+"40"}}>
                    <td style={{padding:"8px",fontWeight:700,color:T.text,textAlign:"right"}}>{p.wsName}</td>
                    <td style={{padding:"8px",textAlign:"center",fontSize:FS-1}}>
                      {p.type==="payment"?<span style={{color:"#8B5CF6",fontWeight:700}}>💰 دفعة</span>:<span style={{color:T.warn,fontWeight:700}}>🛒 مشتريات</span>}
                    </td>
                    <td style={{padding:"8px",textAlign:"center",fontWeight:800,color:T.warn,fontSize:FS}}>{fmt0(p.amount)}</td>
                    <td style={{padding:"8px",textAlign:"center",fontSize:FS-2,color:T.textMut,fontFamily:"monospace"}}>{p.date}</td>
                    <td style={{padding:"8px",fontSize:FS-2,color:T.textSec,textAlign:"right"}}>{p.note||"—"}</td>
                    {canEdit&&<td style={{padding:"8px",textAlign:"center"}}>
                      <Btn small onClick={()=>deleteWeeklyWsPayment(p.id)} style={{background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30",padding:"3px 8px"}}>🗑️</Btn>
                    </td>}
                  </tr>
                )}
                {/* Total row */}
                <tr style={{background:T.warn+"12",fontWeight:800}}>
                  <td colSpan={2} style={{padding:"10px",textAlign:"right",color:T.warn,fontSize:FS}}>الإجمالي</td>
                  <td style={{padding:"10px",textAlign:"center",color:T.warn,fontSize:FS+1,fontWeight:800}}>{fmt0(totalWeeklyWsPayments)} ج</td>
                  <td colSpan={canEdit?3:2}></td>
                </tr>
                </tbody>
              </table>
            </div>}

            <div style={{marginTop:10,padding:"8px 12px",background:T.accent+"08",borderRadius:8,fontSize:FS-2,color:T.textSec,lineHeight:1.6}}>
              💡 هذه دفعات <b>مخططة</b> — ستُسجَّل في الخزنة تلقائياً عند إقفال الأسبوع، مثل سلف الموظفين.
            </div>
          </Card>;
        })()}

        {/* V15.34: Weekly Other Expenses Card — works like ws payments, registers in treasury on close */}
        {!isLocked&&(()=>{
          const _ts=(data&&data.treasurySettings)||{};
          const _defaultOutCats=["تكلفة","مشتريات","مرتبات","قطع غيار","صيانة ماكينات","خيط","تشغيل خارجي","نقل","كهرباء","ضيافة","ايجار المصنع","نثريات","اكسسوار","مستلزمات تشغيل","ورق ماركر","خدمات","أصول ثابتة","تكاليف أخرى","دفع مورد","تحويل داخلي"];
          const _outCats=_ts.outCategories||_defaultOutCats;
          return<Card title={"💼 مصاريف أخرى — W"+openWeek.weekNum+(weeklyOtherExpenses.length>0?" ("+weeklyOtherExpenses.length+")":"")} style={{marginBottom:14}}>
            {/* Header with add button + total */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,marginBottom:12}}>
              <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                <div style={{fontSize:FS-2,color:T.textSec}}>إجمالي مخطط:</div>
                <div style={{fontSize:FS+2,fontWeight:800,color:"#DC2626"}}>{fmt0(totalWeeklyOtherExpenses)} ج</div>
              </div>
              {canEdit&&<Btn small onClick={()=>{if(showOtherExpForm){setShowOtherExpForm(false);resetOtherExpForm()}else{resetOtherExpForm();setOtherExpDate(openWeek.weekStart||today);setShowOtherExpForm(true)}}} style={{background:showOtherExpForm?T.err+"15":"#DC262612",color:showOtherExpForm?T.err:"#DC2626",border:"1px solid "+(showOtherExpForm?T.err+"30":"#DC262630"),fontWeight:700}}>
                {showOtherExpForm?"✕ إلغاء":"➕ إضافة مصروف"}
              </Btn>}
            </div>

            {/* Add form */}
            {showOtherExpForm&&canEdit&&<div style={{padding:"14px",background:"#DC262608",border:"1px solid #DC262630",borderRadius:12,marginBottom:12}}>
              <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:10,marginBottom:10}}>
                {/* Date */}
                <div>
                  <div style={{fontSize:FS-2,color:T.textSec,marginBottom:4,fontWeight:700}}>التاريخ</div>
                  <Inp type="date" value={otherExpDate} onChange={setOtherExpDate}/>
                </div>
                {/* Category */}
                <div>
                  <div style={{fontSize:FS-2,color:T.textSec,marginBottom:4,fontWeight:700}}>التصنيف</div>
                  <Sel value={otherExpCategory} onChange={v=>{setOtherExpCategory(v);if(v!=="__custom__")setOtherExpCategoryCustom("")}}>
                    <option value="">— اختر تصنيف —</option>
                    {_outCats.map(c=><option key={c} value={c}>{c}</option>)}
                    <option value="__custom__">✏️ تصنيف مخصص...</option>
                  </Sel>
                </div>
              </div>
              {otherExpCategory==="__custom__"&&<div style={{marginBottom:10}}>
                <div style={{fontSize:FS-2,color:T.textSec,marginBottom:4,fontWeight:700}}>تصنيف مخصص</div>
                <Inp value={otherExpCategoryCustom} onChange={setOtherExpCategoryCustom} placeholder="اكتب التصنيف..."/>
              </div>}
              <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:10,marginBottom:10}}>
                {/* Amount */}
                <div>
                  <div style={{fontSize:FS-2,color:T.textSec,marginBottom:4,fontWeight:700}}>المبلغ (ج)</div>
                  <Inp type="number" value={otherExpAmount} onChange={setOtherExpAmount} placeholder="0"/>
                </div>
                {/* Account */}
                <div>
                  <div style={{fontSize:FS-2,color:T.textSec,marginBottom:4,fontWeight:700}}>الحساب</div>
                  <Sel value={otherExpAccount} onChange={setOtherExpAccount}>
                    <option value="MAIN CASH">MAIN CASH</option>
                    <option value="SUB CASH">SUB CASH</option>
                  </Sel>
                </div>
              </div>
              <div style={{marginBottom:10}}>
                <div style={{fontSize:FS-2,color:T.textSec,marginBottom:4,fontWeight:700}}>الوصف / الملاحظة (اختياري)</div>
                <Inp value={otherExpDesc} onChange={setOtherExpDesc} placeholder="مثال: دفعة لمورد الأكسسوار أحمد..."/>
              </div>
              <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                <Btn onClick={()=>{setShowOtherExpForm(false);resetOtherExpForm()}} style={{background:T.bg,color:T.textSec,border:"1px solid "+T.brd}}>إلغاء</Btn>
                <Btn onClick={saveWeeklyOtherExp} style={{background:"#DC2626",color:"#fff",border:"none",fontWeight:700}}>💾 حفظ المصروف</Btn>
              </div>
            </div>}

            {/* List of planned expenses */}
            {weeklyOtherExpenses.length===0?<div style={{padding:20,textAlign:"center",color:T.textMut,fontSize:FS-1}}>
              <div style={{fontSize:28,marginBottom:6}}>💼</div>
              <div>لا توجد مصاريف مسجلة في هذا الأسبوع</div>
              {canEdit&&<div style={{fontSize:FS-2,marginTop:4}}>اضغط "➕ إضافة مصروف" لتسجيل مصروف أو دفعة مورد</div>}
            </div>:<div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:FS-1}}>
                <thead><tr>
                  <th style={{...TH,width:30}}>#</th>
                  <th style={TH}>التصنيف</th>
                  <th style={TH}>الوصف</th>
                  <th style={{...TH,textAlign:"center"}}>المبلغ</th>
                  <th style={{...TH,textAlign:"center"}}>الحساب</th>
                  <th style={{...TH,textAlign:"center"}}>التاريخ</th>
                  {canEdit&&<th style={{...TH,width:40}}></th>}
                </tr></thead>
                <tbody>
                  {weeklyOtherExpenses.map((ex,i)=><tr key={ex.id} style={{borderBottom:"1px solid "+T.brd,background:i%2===1?T.bg:"transparent"}}>
                    <td style={{...TD,textAlign:"center",color:T.textMut}}>{i+1}</td>
                    <td style={{...TD,fontWeight:700,color:"#DC2626"}}>{ex.category}</td>
                    <td style={{...TD,color:T.textSec,fontSize:FS-2}}>{ex.desc||"—"}</td>
                    <td style={{...TD,textAlign:"center",fontWeight:800,color:T.err}}>{fmt0(ex.amount)}</td>
                    <td style={{...TD,textAlign:"center",color:T.textSec,fontSize:FS-2,fontFamily:"monospace"}}>{ex.account||"MAIN CASH"}</td>
                    <td style={{...TD,textAlign:"center",color:T.textMut,fontSize:FS-2,direction:"ltr"}}>{ex.date}</td>
                    {canEdit&&<td style={{...TD,textAlign:"center"}}>
                      <span onClick={()=>deleteWeeklyOtherExp(ex.id)} style={{cursor:"pointer",padding:"2px 8px",borderRadius:6,fontSize:FS-1,background:T.err+"10",color:T.err,border:"1px solid "+T.err+"25"}} title="حذف">🗑</span>
                    </td>}
                  </tr>)}
                  <tr style={{background:T.err+"08",fontWeight:800,borderTop:"2px solid "+T.err+"30"}}>
                    <td colSpan={3} style={{...TD,textAlign:"right",fontWeight:800}}>الإجمالي</td>
                    <td style={{...TD,textAlign:"center",color:T.err,fontSize:FS+1}}>{fmt0(totalWeeklyOtherExpenses)}</td>
                    <td colSpan={canEdit?3:2}></td>
                  </tr>
                </tbody>
              </table>
            </div>}

            <div style={{marginTop:10,padding:"8px 12px",background:T.accent+"08",borderRadius:8,fontSize:FS-2,color:T.textSec,lineHeight:1.6}}>
              💡 هذه المصاريف <b>مخططة</b> — لن تظهر في حركات الخزنة إلا بعد إقفال وترحيل الأسبوع.
            </div>
          </Card>;
        })()}

        {/* ── Attendance Comparison Chart: Current vs Previous Week (moved to bottom) ── */}
        {(()=>{
          const weekSelected=getSelectedEmps(openWeek.id);
          const shownEmps=activeEmps.filter(e=>weekSelected.includes(e.id));
          const att_=openWeek.attendance||{};
          /* Current week totals */
          const curData=shownEmps.map(e=>{let h=0;const s=new Date(openWeek.weekStart);const en=new Date(openWeek.weekEnd);let wd=0;
            for(let d=new Date(s);d<=en;d.setDate(d.getDate()+1)){const k=e.id+"_"+d.toISOString().split("T")[0];const v=att_[k]?att_[k].hours:0;h+=v;if(v>0)wd++}
            return{empId:e.id,name:e.name,hours:r2(h),days:wd}});
          const hasData=curData.some(d=>d.hours>0);
          if(!hasData)return null;
          /* Find previous week */
          const sortedWeeks=[...hrWeeks].sort((a,b)=>(b.weekStart||"").localeCompare(a.weekStart||""));
          const curIdx=sortedWeeks.findIndex(w=>w.id===openWeek.id);
          const prevWeek=curIdx>=0&&curIdx<sortedWeeks.length-1?sortedWeeks[curIdx+1]:null;
          const prevAtt=prevWeek?prevWeek.attendance||{}:{};
          const prevData={};
          if(prevWeek){shownEmps.forEach(e=>{let h=0;let wd=0;const ps=new Date(prevWeek.weekStart);const pe=new Date(prevWeek.weekEnd);
            for(let d=new Date(ps);d<=pe;d.setDate(d.getDate()+1)){const k=e.id+"_"+d.toISOString().split("T")[0];const v=prevAtt[k]?prevAtt[k].hours:0;h+=v;if(v>0)wd++}
            prevData[e.id]={hours:r2(h),days:wd}})}
          const maxH=Math.max(...curData.map(d=>d.hours),...Object.values(prevData).map(d=>d.hours),1);
          return<Card title={"📊 مقارنة الحضور — W"+openWeek.weekNum+(prevWeek?" vs W"+prevWeek.weekNum:"")} style={{marginBottom:14}}>
            <div style={{overflowX:"auto"}}>
              <div style={{display:"flex",alignItems:"flex-end",gap:isMob?6:10,minHeight:200,padding:"10px 0"}}>
                {curData.map(d=>{const pv=prevData[d.empId];const barH=maxH>0?(d.hours/maxH)*160:0;const pvH=pv&&maxH>0?(pv.hours/maxH)*160:0;
                  const diff=pv?r2(d.hours-pv.hours):0;
                  return<div key={d.empId} style={{display:"flex",flexDirection:"column",alignItems:"center",flex:1,minWidth:isMob?50:65}}>
                    {/* Diff label */}
                    {pv&&<div style={{fontSize:FS-3,fontWeight:700,marginBottom:4,color:diff>0?T.ok:diff<0?T.err:T.textMut}}>{diff>0?"+"+hrsToHM(diff):diff<0?"-"+hrsToHM(-diff):"="}</div>}
                    {/* Bars container */}
                    <div style={{display:"flex",gap:3,alignItems:"flex-end",height:170}}>
                      {/* Previous week bar */}
                      {pv&&<div style={{width:isMob?14:20,height:Math.max(pvH,4),borderRadius:"6px 6px 0 0",background:T.textMut+"40",transition:"height 0.6s ease",position:"relative"}} title={"W"+(prevWeek?.weekNum||"?")+" — "+hrsToHM(pv.hours)+" / "+pv.days+" يوم"}>
                        <div style={{position:"absolute",top:-18,left:"50%",transform:"translateX(-50%)",fontSize:FS-3,color:T.textMut,fontWeight:600,whiteSpace:"nowrap",direction:"ltr"}}>{hrsToHM(pv.hours)}</div>
                      </div>}
                      {/* Current week bar */}
                      <div style={{width:isMob?14:20,height:Math.max(barH,4),borderRadius:"6px 6px 0 0",background:d.hours>=openWeek.baseHours?"linear-gradient(180deg,"+T.ok+","+T.ok+"99)":"linear-gradient(180deg,"+T.accent+","+T.accent+"99)",transition:"height 0.6s ease",position:"relative"}}>
                        <div style={{position:"absolute",top:-18,left:"50%",transform:"translateX(-50%)",fontSize:FS-3,color:T.accent,fontWeight:700,whiteSpace:"nowrap",direction:"ltr"}}>{hrsToHM(d.hours)}</div>
                      </div>
                    </div>
                    {/* Name + days */}
                    <div style={{marginTop:6,textAlign:"center"}}>
                      <div style={{fontSize:FS-3,fontWeight:700,color:T.text,maxWidth:60,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name.split(" ")[0]}</div>
                      <div style={{fontSize:FS-3,color:T.textMut}}>{d.days+" يوم"}</div>
                    </div>
                  </div>})}
              </div>
              {/* Legend */}
              <div style={{display:"flex",gap:16,justifyContent:"center",marginTop:8,fontSize:FS-2,color:T.textSec}}>
                <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:12,height:12,borderRadius:3,background:T.accent}}/> {"الأسبوع الحالي W"+openWeek.weekNum}</div>
                {prevWeek&&<div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:12,height:12,borderRadius:3,background:T.textMut+"40"}}/> {"الأسبوع السابق W"+prevWeek.weekNum}</div>}
              </div>
            </div>
          </Card>})()}
      </div>})()}

    {/* ══ GENERIC TEXT POPUP (reusable for notes/reasons) ══ */}
    {textPopup&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={()=>setTextPopup(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:500,border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.4)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
          <div>
            <div style={{fontSize:FS+2,fontWeight:800,color:T.accent}}>{textPopup.title||"ملاحظات"}</div>
            {textPopup.subtitle&&<div style={{fontSize:FS-1,color:T.textMut,marginTop:2}}>{textPopup.subtitle}</div>}
          </div>
          <Btn ghost small onClick={()=>setTextPopup(null)}>✕</Btn>
        </div>
        {textPopup.multiline?<textarea value={textValue} onChange={e=>setTextValue(e.target.value)} placeholder={textPopup.placeholder||""} autoFocus rows={5} style={{width:"100%",padding:12,borderRadius:10,border:"1px solid "+T.brd,fontSize:FS,fontFamily:"inherit",background:T.inputBg,color:T.text,resize:"vertical",boxSizing:"border-box"}}/>
        :<input type="text" value={textValue} onChange={e=>setTextValue(e.target.value)} placeholder={textPopup.placeholder||""} autoFocus style={{width:"100%",padding:12,borderRadius:10,border:"1px solid "+T.brd,fontSize:FS,fontFamily:"inherit",background:T.inputBg,color:T.text,boxSizing:"border-box"}}/>}
        <div style={{display:"flex",gap:8,marginTop:14,justifyContent:"flex-end"}}>
          <Btn ghost onClick={()=>setTextPopup(null)}>إلغاء</Btn>
          <Btn primary onClick={()=>{if(textPopup.onSave)textPopup.onSave(textValue);setTextPopup(null)}}>💾 حفظ</Btn>
        </div>
      </div>
    </div>}

    {/* ══ GENERIC CONFIRM POPUP ══ */}
    {confirmPopup&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={()=>setConfirmPopup(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:440,border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.4)",textAlign:"center"}}>
        <div style={{fontSize:44,marginBottom:10}}>{confirmPopup.variant==="danger"?"⚠️":confirmPopup.variant==="warn"?"⚠️":"❓"}</div>
        <div style={{fontSize:FS+3,fontWeight:800,color:confirmPopup.variant==="danger"?T.err:confirmPopup.variant==="warn"?T.warn:T.text,marginBottom:8}}>{confirmPopup.title||"تأكيد"}</div>
        <div style={{fontSize:FS,color:T.textSec,marginBottom:18,lineHeight:1.6,whiteSpace:"pre-line"}}>{confirmPopup.message||""}</div>
        <div style={{display:"flex",gap:10,justifyContent:"center"}}>
          {!confirmPopup.hideCancel&&<Btn ghost onClick={()=>setConfirmPopup(null)}>إلغاء</Btn>}
          <Btn onClick={()=>{if(confirmPopup.onConfirm)confirmPopup.onConfirm();setConfirmPopup(null)}} style={{background:confirmPopup.variant==="danger"?T.err:confirmPopup.variant==="warn"?T.warn:T.accent,color:"#fff",border:"none",fontWeight:800,padding:"10px 24px"}}>{confirmPopup.confirmText||(confirmPopup.variant==="danger"?"🗑️ حذف":"✅ تأكيد")}</Btn>
        </div>
      </div>
    </div>}

    {/* ══ DEBT FORM POPUP (add/edit installment debt) ══ */}
    {showDebtForm&&(()=>{const emp=employees.find(e=>e.id===showDebtForm.empId);if(!emp)return null;
      const total=parseFloat(debtTotal);const inst=parseInt(debtInstallments);
      /* Auto-calc per-week if user changed total or installments */
      const autoPerWeek=(total&&inst&&inst>0)?r2(total/inst):0;
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={()=>{setShowDebtForm(null);resetDebtForm()}}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:520,border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.4)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div>
              <div style={{fontSize:FS+2,fontWeight:800,color:"#F97316"}}>🧾 {showDebtForm.debtId?"تعديل":"إضافة"} مديونية</div>
              <div style={{fontSize:FS-1,color:T.textMut,marginTop:2}}>الموظف: <b>{emp.name}</b></div>
            </div>
            <Btn ghost small onClick={()=>{setShowDebtForm(null);resetDebtForm()}}>✕</Btn>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div style={{gridColumn:"1 / span 2"}}><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>البيان / المنتج</label><Inp value={debtTitle} onChange={setDebtTitle} placeholder="مثال: شراء قماش، ماكينة..."/></div>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>المبلغ الإجمالي (ج.م)</label><Inp type="number" value={debtTotal} onChange={v=>{setDebtTotal(v);if(inst>0)setDebtPerWeek(String(r2(parseFloat(v)/inst)))}} placeholder="0"/></div>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>عدد الأقساط</label><Inp type="number" value={debtInstallments} onChange={v=>{setDebtInstallments(v);const i=parseInt(v);if(i>0&&total)setDebtPerWeek(String(r2(total/i)))}} placeholder="5"/></div>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>قيمة القسط الأسبوعي (ج.م)</label><Inp type="number" value={debtPerWeek} onChange={setDebtPerWeek} placeholder={String(autoPerWeek||"0")}/></div>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>تاريخ البداية</label><Inp type="date" value={debtStart} onChange={setDebtStart}/></div>
            <div style={{gridColumn:"1 / span 2"}}><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>ملاحظات</label><Inp value={debtNotes} onChange={setDebtNotes} placeholder="..."/></div>
          </div>
          {autoPerWeek>0&&parseFloat(debtPerWeek)!==autoPerWeek&&<div style={{marginTop:10,padding:8,borderRadius:8,background:T.warn+"08",border:"1px solid "+T.warn+"20",fontSize:FS-2,color:T.warn}}>💡 القسط المقترح: {fmt0(autoPerWeek)} ج.م ({inst} قسط × {fmt0(autoPerWeek)})</div>}
          <div style={{display:"flex",gap:8,marginTop:14,justifyContent:"flex-end"}}>
            <Btn ghost onClick={()=>{setShowDebtForm(null);resetDebtForm()}}>إلغاء</Btn>
            <Btn primary onClick={()=>saveDebt(showDebtForm.empId,showDebtForm.debtId)} style={{background:"#F97316",color:"#fff",border:"none"}}>💾 حفظ المديونية</Btn>
          </div>
        </div>
      </div>})()}

    {/* ══ EMP DEBTS VIEWER POPUP ══ */}
    {showEmpDebts&&(()=>{const emp=employees.find(e=>e.id===showEmpDebts);if(!emp)return null;
      const allD=empAllDebts(showEmpDebts);
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={()=>setShowEmpDebts(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:640,maxHeight:"85vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.4)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div>
              <div style={{fontSize:FS+2,fontWeight:800,color:"#F97316"}}>🧾 مديونيات الموظف</div>
              <div style={{fontSize:FS-1,color:T.textMut,marginTop:2}}>{emp.name}{emp.code?" #"+emp.code:""}</div>
            </div>
            <div style={{display:"flex",gap:6}}>
              {canEdit&&<Btn small onClick={()=>{setShowEmpDebts(null);setShowDebtForm({empId:showEmpDebts});resetDebtForm();setDebtStart(today)}} style={{background:"#F9731612",color:"#F97316",border:"1px solid #F9731630",fontWeight:700}}>+ جديدة</Btn>}
              <Btn ghost small onClick={()=>setShowEmpDebts(null)}>✕</Btn>
            </div>
          </div>
          {allD.length===0?<div style={{textAlign:"center",padding:30,color:T.textMut}}>لا يوجد مديونيات</div>
          :<div style={{display:"flex",flexDirection:"column",gap:10}}>
            {allD.map(d=>{const paid=(d.paidWeekIds||[]).length;const remaining=d.installments-paid;const paidAmt=paid*d.perWeek;const remainAmt=d.total-paidAmt;const pct=d.installments>0?Math.round(paid/d.installments*100):0;
              const statusColor=d.status==="paid"?T.ok:d.status==="cancelled"?T.textMut:"#F97316";
              return<div key={d.id} style={{padding:14,borderRadius:12,border:"2px solid "+statusColor+"30",background:statusColor+"06"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8,gap:8}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:FS+1,fontWeight:800,color:T.text}}>{d.title}</div>
                    {d.notes&&<div style={{fontSize:FS-2,color:T.textMut,marginTop:2}}>{d.notes}</div>}
                    <div style={{fontSize:FS-2,color:T.textMut,marginTop:4}}>{"بداية: "+d.startDate+(d.paidAt?" | مدفوع بالكامل: "+d.paidAt:d.cancelledAt?" | ملغي: "+d.cancelledAt:"")}</div>
                  </div>
                  <span style={{padding:"3px 10px",borderRadius:8,fontSize:FS-2,fontWeight:700,background:statusColor+"15",color:statusColor,whiteSpace:"nowrap"}}>{d.status==="paid"?"✅ مدفوع":d.status==="cancelled"?"❌ ملغي":"🔓 نشط"}</span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:10}}>
                  <div style={{padding:"6px 8px",borderRadius:8,background:T.bg,textAlign:"center"}}>
                    <div style={{fontSize:FS-3,color:T.textMut}}>الإجمالي</div>
                    <div style={{fontSize:FS,fontWeight:800,color:T.text}}>{fmt0(d.total)}</div>
                  </div>
                  <div style={{padding:"6px 8px",borderRadius:8,background:T.bg,textAlign:"center"}}>
                    <div style={{fontSize:FS-3,color:T.textMut}}>القسط</div>
                    <div style={{fontSize:FS,fontWeight:800,color:"#F97316"}}>{fmt0(d.perWeek)}</div>
                  </div>
                  <div style={{padding:"6px 8px",borderRadius:8,background:T.ok+"08",textAlign:"center"}}>
                    <div style={{fontSize:FS-3,color:T.textMut}}>مدفوع</div>
                    <div style={{fontSize:FS,fontWeight:800,color:T.ok}}>{fmt0(paidAmt)}</div>
                  </div>
                  <div style={{padding:"6px 8px",borderRadius:8,background:T.err+"08",textAlign:"center"}}>
                    <div style={{fontSize:FS-3,color:T.textMut}}>متبقي</div>
                    <div style={{fontSize:FS,fontWeight:800,color:T.err}}>{fmt0(remainAmt)}</div>
                  </div>
                </div>
                {/* Progress bar */}
                <div style={{marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:FS-2,marginBottom:4}}>
                    <span style={{color:T.textSec}}>{paid+" / "+d.installments+" قسط"}</span>
                    <span style={{color:statusColor,fontWeight:700}}>{pct+"%"}</span>
                  </div>
                  <div style={{height:8,borderRadius:4,background:T.bg,overflow:"hidden"}}><div style={{height:"100%",width:pct+"%",background:statusColor,transition:"width 0.3s"}}/></div>
                </div>
                {canEdit&&d.status==="active"&&<div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
                  <Btn small onClick={()=>{setDebtTitle(d.title);setDebtTotal(String(d.total));setDebtInstallments(String(d.installments));setDebtPerWeek(String(d.perWeek));setDebtStart(d.startDate||today);setDebtNotes(d.notes||"");setShowEmpDebts(null);setShowDebtForm({empId:showEmpDebts,debtId:d.id})}} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd,fontSize:FS-2}}>✏️ تعديل</Btn>
                  <Btn small onClick={()=>cancelDebt(d.id)} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30",fontSize:FS-2}}>إلغاء</Btn>
                  <Btn small onClick={()=>delDebt(d.id)} style={{background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30",fontSize:FS-2}}>🗑️ حذف</Btn>
                </div>}
              </div>})}
          </div>}
        </div>
      </div>})()}

    {/* ══ EDIT EMPLOYEE POPUP — تعديل كل تفاصيل الموظف ══ */}
    {editPopup&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={()=>setEditPopup(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:20,width:"100%",maxWidth:720,maxHeight:"92vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.4)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,paddingBottom:12,borderBottom:"1px solid "+T.brd}}>
          <div style={{fontSize:FS+2,fontWeight:800,color:"#8B5CF6",display:"flex",alignItems:"center",gap:8}}>
            <span>✏️</span>
            <span>تعديل بيانات الموظف</span>
          </div>
          <Btn ghost small onClick={()=>setEditPopup(null)}>✕</Btn>
        </div>
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"repeat(2,1fr)",gap:12}}>
          <div>
            <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,marginBottom:4,display:"block"}}>الاسم</label>
            <Inp value={editPopup.name} onChange={v=>setEditPopup(p=>({...p,name:v}))}/>
          </div>
          <div>
            <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,marginBottom:4,display:"block"}}>كود البصمة</label>
            <Inp value={editPopup.code} onChange={v=>setEditPopup(p=>({...p,code:v}))} placeholder="رقم من جهاز البصمة"/>
          </div>
          <div>
            <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,marginBottom:4,display:"block"}}>الوظيفة</label>
            <Inp value={editPopup.job} onChange={v=>setEditPopup(p=>({...p,job:v}))}/>
          </div>
          <div>
            <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,marginBottom:4,display:"block"}}>نظام المرتب</label>
            <Sel value={editPopup.salaryType} onChange={v=>setEditPopup(p=>({...p,salaryType:v}))}>
              <option value="weekly">أسبوعي</option>
              <option value="monthly">شهري</option>
            </Sel>
          </div>
          <div>
            <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,marginBottom:4,display:"block"}}>{editPopup.salaryType==="monthly"?"مرتب شهري":"مرتب أسبوعي"}</label>
            <Inp type="number" value={editPopup.weeklySalary} onChange={v=>setEditPopup(p=>({...p,weeklySalary:v}))}/>
          </div>
          <div>
            <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,marginBottom:4,display:"block"}}>حافز أسبوعي ثابت</label>
            <Inp type="number" value={editPopup.weeklyBonus} onChange={v=>setEditPopup(p=>({...p,weeklyBonus:v}))} placeholder="0"/>
          </div>
          <div>
            <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,marginBottom:4,display:"block"}}>ساعات أساسي</label>
            <Inp type="number" value={editPopup.baseHours} onChange={v=>setEditPopup(p=>({...p,baseHours:v}))} placeholder={String(hrs.defaultBaseHours||48)}/>
          </div>
          <div>
            <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,marginBottom:4,display:"block"}}>تليفون</label>
            <Inp value={editPopup.phone} onChange={v=>setEditPopup(p=>({...p,phone:v}))}/>
          </div>
          <div>
            <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,marginBottom:4,display:"block"}}>تاريخ التعيين</label>
            <Inp type="date" value={editPopup.hireDate} onChange={v=>setEditPopup(p=>({...p,hireDate:v}))}/>
          </div>
          <div style={{display:"flex",alignItems:"flex-end"}}>
            <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:FS-1,fontWeight:700,color:editPopup.noBiometric?"#8B5CF6":T.textSec,padding:"8px 14px",borderRadius:8,background:editPopup.noBiometric?"#8B5CF612":T.bg,border:"1px solid "+(editPopup.noBiometric?"#8B5CF640":T.brd),width:"100%",justifyContent:"center"}}>
              <input type="checkbox" checked={!!editPopup.noBiometric} onChange={e=>setEditPopup(p=>({...p,noBiometric:e.target.checked}))} style={{accentColor:"#8B5CF6",width:16,height:16}}/>
              بدون بصمة (إدارة)
            </label>
          </div>
        </div>
        <div style={{display:"flex",gap:8,marginTop:18,justifyContent:"flex-end",paddingTop:14,borderTop:"1px solid "+T.brd}}>
          <Btn onClick={()=>setEditPopup(null)} style={{background:T.bg,color:T.textSec,border:"1px solid "+T.brd}}>إلغاء</Btn>
          <Btn primary onClick={saveEditPopup}>💾 حفظ التعديلات</Btn>
        </div>
      </div>
    </div>}

    {/* ══ BULK IMPORT POPUP — إدخال جماعي للموظفين ══ */}
    {showBulkImport&&(()=>{
      const parseBulk=()=>{
        const lines=bulkImportText.split(/\r?\n/).map(l=>l.replace(/\s+$/,"")).filter(l=>l.trim().length>0);
        const existingCodes=new Set(employees.map(e=>String(e.code||"").trim()).filter(Boolean));
        /* Detect header row — common column names */
        const headerKeywords=["اسم","name","كود","code","بصمة","مرتب","salary","راتب","وظيفة","job","تليفون","phone","هاتف","ساعات","hours","حافز","bonus"];
        let headerSkipped=false;
        if(lines.length>0){
          const firstLower=lines[0].toLowerCase();
          const hitCount=headerKeywords.filter(k=>firstLower.includes(k.toLowerCase())).length;
          if(hitCount>=2){/* Likely a header row */
            lines.shift();headerSkipped=true;
          }
        }
        const rows=lines.map((line,i)=>{
          /* Split by Tab ONLY. Commas are NOT used as delimiters because numbers
             with thousands-separators (e.g., "4,500" or "2,500") would get split
             into two columns, shifting every column to the right. Tab is the
             default delimiter when pasting from Excel or Google Sheets. */
          const parts=line.split(/\t/).map(s=>s.trim());
          /* Only filter fully-empty RIGHTMOST cells, keep middle empty cells as "" */
          while(parts.length>0&&parts[parts.length-1]==="")parts.pop();
          if(parts.length<2)return{line:i+1,raw:line,status:"error",err:"ناقص بيانات — يلزم على الأقل اسم + كود (افصل الأعمدة بـ Tab)"};
          /* Helper: clean thousands separators from numbers like "4,500" → "4500" or "١,٢٣٤" → "1234" */
          const cleanNum=(s)=>{if(!s)return"";return String(s).replace(/[,،\s]/g,"").replace(/[٠١٢٣٤٥٦٧٨٩]/g,d=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))};
          const name=parts[0]||"";
          const code=parts[1]||"";
          const salaryRaw=parts[2]||"";
          const job=parts[3]||"";
          const phone=parts[4]||"";
          const baseHoursRaw=parts[5]||"";
          const bonusRaw=parts[6]||"";
          const salaryClean=cleanNum(salaryRaw);
          const salaryNum=parseFloat(salaryClean)||0;
          const baseHoursClean=cleanNum(baseHoursRaw);
          const bonusClean=cleanNum(bonusRaw);
          if(!name||!name.trim()){return{line:i+1,raw:line,status:"error",err:"الاسم ناقص"}}
          /* Validate salary looks numeric if provided (after cleaning separators) */
          if(salaryRaw&&salaryClean&&isNaN(parseFloat(salaryClean))){return{line:i+1,raw:line,name,code,status:"error",err:"المرتب (عمود 3) غير رقمي: \""+salaryRaw+"\""}}
          if(!code||!code.trim()){return{line:i+1,raw:line,name,code:"",salary:salaryNum,job,phone,baseHours:parseFloat(baseHoursClean)||(hrs.defaultBaseHours||48),bonus:parseFloat(bonusClean)||0,status:"warn",err:"⚠️ كود البصمة فاضي — سيتم إضافة الموظف بدون كود"}}
          if(existingCodes.has(String(code).trim())){return{line:i+1,raw:line,name,code,salary:salaryNum,job,phone,baseHours:parseFloat(baseHoursClean)||(hrs.defaultBaseHours||48),bonus:parseFloat(bonusClean)||0,status:"exists",err:"كود موجود"}}
          return{line:i+1,raw:line,name,code,salary:salaryNum,job,phone,baseHours:parseFloat(baseHoursClean)||(hrs.defaultBaseHours||48),bonus:parseFloat(bonusClean)||0,status:"new"};
        });
        /* Attach header-skipped flag as a hidden row 0 so UI can show notice */
        if(headerSkipped)rows._headerSkipped=true;
        setBulkImportParsed(rows);
      };
      const saveBulk=()=>{
        if(!bulkImportParsed)return;
        const toAdd=bulkImportParsed.filter(r=>r.status==="new"||r.status==="warn");
        if(toAdd.length===0){showToast("⚠️ لا يوجد موظفين جدد للإضافة");return}
        upConfig(d=>{if(!d.employees)d.employees=[];
          toAdd.forEach(r=>{
            d.employees.push({id:gid(),name:r.name,code:r.code||"",job:r.job||"",phone:r.phone||"",weeklySalary:r.salary||0,baseHours:r.baseHours||(hrs.defaultBaseHours||48),weeklyBonus:r.bonus||0,hireDate:today,prevBalance:0,salaryType:"weekly"})
          })
        });
        showToast("✅ تم إضافة "+toAdd.length+" موظف");
        setShowBulkImport(false);setBulkImportText("");setBulkImportParsed(null);
      };
      const newCount=bulkImportParsed?bulkImportParsed.filter(r=>r.status==="new").length:0;
      const warnCount=bulkImportParsed?bulkImportParsed.filter(r=>r.status==="warn").length:0;
      const existsCount=bulkImportParsed?bulkImportParsed.filter(r=>r.status==="exists").length:0;
      const errCount=bulkImportParsed?bulkImportParsed.filter(r=>r.status==="error").length:0;
      return<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={()=>setShowBulkImport(false)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:20,width:"100%",maxWidth:900,maxHeight:"92vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.4)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:FS+1,fontWeight:800,color:"#8B5CF6"}}>📋 إدخال جماعي للموظفين</div>
            <Btn ghost small onClick={()=>setShowBulkImport(false)}>✕</Btn>
          </div>
          <div style={{padding:10,borderRadius:10,background:"#8B5CF608",border:"1px solid #8B5CF620",fontSize:FS-2,color:T.textSec,marginBottom:10,lineHeight:1.7}}>
            الصق البيانات من Excel أو Google Sheets. كل سطر = موظف واحد.<br/>
            <b>الأعمدة بالترتيب:</b> الاسم | كود البصمة | المرتب الأسبوعي | <span style={{opacity:0.7}}>[الوظيفة] | [التليفون] | [ساعات] | [حافز]</span><br/>
            <b>الفاصل:</b> Tab فقط (من Excel). الأرقام بفواصل الآلاف زي <b style={{color:T.accent}}>2,500</b> تُحفظ تلقائياً كـ 2500.<br/>
            <b style={{color:"#F59E0B"}}>ملاحظة:</b> لو الصف الأول فيه عناوين (اسم، كود، ...) سيتم تجاهله تلقائياً.
          </div>
          <textarea value={bulkImportText} onChange={e=>setBulkImportText(e.target.value)} placeholder={"محمود حدوتة	1234	4500	خياط	01012345678\nيوسف عبدالله	5678	3200\nأحمد علي	9012	2800	مساعد"} style={{width:"100%",minHeight:160,padding:12,borderRadius:10,border:"1px solid "+T.brd,fontSize:FS-1,fontFamily:"monospace",background:T.inputBg,color:T.text,direction:"ltr",textAlign:"right"}}/>
          <div style={{display:"flex",gap:8,marginTop:10}}>
            <Btn onClick={parseBulk} disabled={!bulkImportText.trim()} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30",fontWeight:700}}>🔍 معاينة</Btn>
            {bulkImportParsed&&(newCount+warnCount)>0&&<Btn primary onClick={saveBulk}>✅ إضافة {newCount+warnCount} موظف</Btn>}
          </div>
          {bulkImportParsed&&bulkImportParsed._headerSkipped&&<div style={{marginTop:10,padding:8,borderRadius:8,background:"#F59E0B10",border:"1px solid #F59E0B30",fontSize:FS-2,color:"#92400E",fontWeight:600}}>ℹ️ تم تخطي الصف الأول لأنه يحتوي على عناوين أعمدة</div>}
          {bulkImportParsed&&<div style={{marginTop:14}}>
            <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
              <span style={{padding:"4px 10px",borderRadius:8,background:T.ok+"12",color:T.ok,fontSize:FS-2,fontWeight:700}}>🟢 جديد: {newCount}</span>
              {warnCount>0&&<span style={{padding:"4px 10px",borderRadius:8,background:"#F59E0B12",color:"#F59E0B",fontSize:FS-2,fontWeight:700}}>🟠 جديد بدون كود: {warnCount}</span>}
              <span style={{padding:"4px 10px",borderRadius:8,background:T.warn+"12",color:T.warn,fontSize:FS-2,fontWeight:700}}>🟡 موجود: {existsCount}</span>
              <span style={{padding:"4px 10px",borderRadius:8,background:T.err+"12",color:T.err,fontSize:FS-2,fontWeight:700}}>🔴 خطأ: {errCount}</span>
            </div>
            <div style={{maxHeight:"45vh",overflowY:"auto",border:"1px solid "+T.brd,borderRadius:10}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}><thead style={{position:"sticky",top:0,background:T.bg,zIndex:1}}><tr>
                {["#","الحالة","الاسم","الكود","المرتب","الوظيفة","التليفون","ساعات","حافز"].map(h=><th key={h} style={{padding:"8px 6px",textAlign:"center",fontSize:FS-2,color:T.textSec,borderBottom:"2px solid "+T.brd,fontWeight:700}}>{h}</th>)}
              </tr></thead><tbody>
                {bulkImportParsed.map((r,i)=>{
                  const color=r.status==="new"?T.ok:r.status==="warn"?"#F59E0B":r.status==="exists"?T.warn:T.err;
                  const icon=r.status==="new"?"🟢":r.status==="warn"?"🟠":r.status==="exists"?"🟡":"🔴";
                  const statusLabel=r.status==="new"?"جديد":r.status==="warn"?"جديد⚠️":r.status==="exists"?"موجود":"خطأ";
                  return<tr key={i} style={{borderBottom:"1px solid "+T.brd+"40",background:i%2===1?T.bg:""}}>
                    <td style={{padding:"5px 6px",textAlign:"center",fontSize:FS-2,color:T.textMut}}>{r.line}</td>
                    <td style={{padding:"5px 6px",textAlign:"center"}}><span title={r.err||""} style={{padding:"2px 8px",borderRadius:5,fontSize:FS-3,fontWeight:700,background:color+"15",color}}>{icon} {statusLabel}</span></td>
                    <td style={{padding:"5px 8px",fontSize:FS-1,fontWeight:600}}>{r.name||<span style={{color:T.err}}>—</span>}</td>
                    <td style={{padding:"5px 6px",textAlign:"center",fontSize:FS-2,fontFamily:"monospace"}}>{r.code||<span style={{color:r.status==="warn"?"#F59E0B":T.textMut}}>—</span>}</td>
                    <td style={{padding:"5px 6px",textAlign:"center",fontSize:FS-1,fontWeight:700,color:T.accent}}>{r.salary?fmt0(r.salary):"—"}</td>
                    <td style={{padding:"5px 6px",fontSize:FS-2}}>{r.job||""}</td>
                    <td style={{padding:"5px 6px",fontSize:FS-3,color:T.textMut,direction:"ltr"}}>{r.phone||""}</td>
                    <td style={{padding:"5px 6px",textAlign:"center",fontSize:FS-2}}>{r.baseHours||""}</td>
                    <td style={{padding:"5px 6px",textAlign:"center",fontSize:FS-2,color:T.ok}}>{r.bonus>0?fmt0(r.bonus):""}</td>
                  </tr>})}
              </tbody></table>
            </div>
          </div>}
        </div>
      </div>})()}

    {/* ══ BULK PRINT POPUP ══ */}
    {showBulkPrint&&openWeek&&(()=>{const weekSelected=getSelectedEmps(openWeek.id);const inWeek=activeEmps.filter(e=>weekSelected.includes(e.id));
      const selCount=Object.values(bulkPrintSel).filter(Boolean).length;
      return<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={()=>setShowBulkPrint(false)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:20,width:"100%",maxWidth:500,maxHeight:"85vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.4)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:FS+1,fontWeight:800,color:T.accent}}>🖨 طباعة مجمعة للكشوفات</div>
            <Btn ghost small onClick={()=>setShowBulkPrint(false)}>✕</Btn>
          </div>
          <div style={{fontSize:FS-2,color:T.textMut,marginBottom:8}}>اختر الموظفين (كل كشف في صفحة منفصلة):</div>
          <div style={{display:"flex",gap:6,marginBottom:10}}>
            <Btn small onClick={()=>{const s={};inWeek.forEach(e=>{s[e.id]=true});setBulkPrintSel(s)}} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30"}}>☑ الكل</Btn>
            <Btn small onClick={()=>setBulkPrintSel({})} style={{background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30"}}>☐ لا شيء</Btn>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:"50vh",overflowY:"auto"}}>
            {inWeek.map(e=>{const sel=bulkPrintSel[e.id];const c=getEmpSalary(e.id,openWeek);
              return<div key={e.id} onClick={()=>setBulkPrintSel(p=>({...p,[e.id]:!p[e.id]}))} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderRadius:10,cursor:"pointer",background:sel?T.accent+"08":T.bg,border:"1px solid "+(sel?T.accent+"30":T.brd)}}>
                <span style={{fontSize:18}}>{sel?"☑":"☐"}</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:FS,fontWeight:700}}>{e.name}</div>
                  <div style={{fontSize:FS-2,color:T.textMut}}>{(e.code?"#"+e.code:"")+(e.job?" — "+e.job:"")}</div>
                </div>
                {c&&<span style={{fontSize:FS-1,color:T.accent,fontWeight:700}} title={c.prevBalance!==0?("صافي: "+fmt0(c.netBalance)+" "+(c.prevBalance>0?"+":"−")+" رصيد: "+fmt0(Math.abs(c.prevBalance))+" = "+fmt0(c.totalDue)):""}>{fmt0(c.totalDue)}</span>}
              </div>})}
          </div>
          <div style={{marginTop:10,padding:10,borderRadius:8,background:T.accent+"06",textAlign:"center",fontSize:FS-1,fontWeight:700,color:T.accent}}>{selCount+" كشف سيتم طباعته"}</div>
          <div style={{marginTop:10,display:"flex",gap:8,justifyContent:"flex-end"}}>
            <Btn ghost onClick={()=>setShowBulkPrint(false)}>إلغاء</Btn>
            <Btn primary onClick={bulkPrintSlips} disabled={selCount===0}>🖨 طباعة {selCount>0?"("+selCount+")":""}</Btn>
          </div>
        </div>
      </div>})()}

    {/* ══ EMPLOYEE STATEMENT POPUP ══ */}
    {empStatement&&(()=>{const emp=employees.find(e=>e.id===empStatement);if(!emp)return null;
      const inRange=(d)=>{if(stmtFrom&&d<stmtFrom)return false;if(stmtTo&&d>stmtTo)return false;return true};
      /* Gather all movements */
      const movements=[];
      /* Advances */
      hrLog.filter(l=>l.empId===emp.id&&l.type==="advance"&&inRange(l.date||"")).forEach(l=>{
        movements.push({date:l.date,type:"advance",desc:(l.desc||"سلفة"),debit:Number(l.amount)||0,credit:0,by:l.by||""})});
      /* Salary approvals */
      hrLog.filter(l=>l.empId===emp.id&&l.type==="salary"&&inRange(l.date||"")).forEach(l=>{
        movements.push({date:l.date,type:"salary",desc:"اعتماد مرتب W"+(l.weekStart||"")+" → "+(l.weekEnd||""),grossPay:l.grossPay||0,weekAdvances:l.weekAdvances||0,specialDeduct:l.specialDeduct||0,bonus:l.bonus||0,debtInstall:l.debtInstall||0,thursdayPay:l.thursdayPay||0,remainingBalance:l.remainingBalance,credit:l.grossPay||0,debit:l.thursdayPay||0,by:l.by||""})});
      movements.sort((a,b)=>(a.date||"").localeCompare(b.date||""));
      /* Running balance */
      let bal=0;const rows=movements.map(m=>{bal+=(m.credit||0)-(m.debit||0);return{...m,bal:r2(bal)}});
      const currentBal=emp.prevBalance||0;
      const totalAdv=rows.filter(r=>r.type==="advance").reduce((s,r)=>s+r.debit,0);
      const totalGross=rows.filter(r=>r.type==="salary").reduce((s,r)=>s+(r.grossPay||0),0);
      const totalPaid=rows.filter(r=>r.type==="salary").reduce((s,r)=>s+(r.thursdayPay||0),0);
      const salaryCount=rows.filter(r=>r.type==="salary").length;
      const printStmt=()=>{const w=_openPrintWin();if(!w)return;
        const logo=(data.logo||"").trim();
        let html=`<html dir="rtl"><head><meta charset="utf-8"><title>كشف حساب — ${emp.name}</title>
        <style>@page{size:A4;margin:10mm}body{font-family:'Cairo',Arial,sans-serif;font-size:11px;margin:0;padding:0;color:#1a1a1a}
        .hdr{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:2px solid #0ea5e9;margin-bottom:10px}
        .hdr img{max-height:45px}.hdr h1{font-size:15px;margin:0;color:#0ea5e9}
        .info{display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;padding:10px;background:#f0f9ff;border-radius:8px;margin-bottom:10px;font-size:11px}
        .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px}
        .stat{padding:8px;border-radius:8px;text-align:center;border:1px solid #e2e8f0}
        .stat .lbl{font-size:9px;color:#64748b}.stat .val{font-size:13px;font-weight:800;margin-top:2px}
        .st-sal{background:#f0f9ff}.st-sal .val{color:#0ea5e9}
        .st-adv{background:#fef2f2}.st-adv .val{color:#ef4444}
        .st-paid{background:#f0fdf4}.st-paid .val{color:#10b981}
        .st-bal{background:#faf5ff}.st-bal .val{color:#8b5cf6}
        table{width:100%;border-collapse:collapse;font-size:10px}
        th,td{border:1px solid #cbd5e1;padding:5px 7px;text-align:right}
        th{background:#0ea5e9;color:#fff;text-align:center}
        tr:nth-child(even){background:#f8fafc}
        .num{text-align:center}.pos{color:#10b981;font-weight:700}.neg{color:#ef4444;font-weight:700}
        .type-sal{background:#dbeafe;color:#1e40af;padding:2px 6px;border-radius:4px;font-weight:700;font-size:9px}
        .type-adv{background:#fee2e2;color:#b91c1c;padding:2px 6px;border-radius:4px;font-weight:700;font-size:9px}
        @media print{body{margin:0}}</style></head><body>
        <div class="hdr">${logo?'<img src="'+logo+'"/>':'<div style="font-size:20px;font-weight:900;color:#0ea5e9">CLARK</div>'}
          <div style="text-align:left"><h1>كشف حساب موظف</h1><div style="font-size:10px;color:#64748b">${fmtDate(new Date().toISOString().split("T")[0])}</div></div></div>
        <div class="info">
          <div><b>الاسم:</b> ${emp.name}</div><div><b>الكود:</b> ${emp.code||"—"}</div>
          <div><b>الوظيفة:</b> ${emp.job||"—"}</div><div><b>المرتب الأسبوعي:</b> ${fmt0(emp.weeklySalary||0)} ج.م</div>
          <div><b>التليفون:</b> ${emp.phone||"—"}</div><div><b>الفترة:</b> ${stmtFrom?fmtDate(stmtFrom):"البداية"} → ${stmtTo?fmtDate(stmtTo):"حتى الآن"}</div>
        </div>
        <div class="stats">
          <div class="stat st-sal"><div class="lbl">اجمالي المستحقات</div><div class="val">${fmt0(totalGross)}</div></div>
          <div class="stat st-adv"><div class="lbl">اجمالي السلف</div><div class="val">${fmt0(totalAdv)}</div></div>
          <div class="stat st-paid"><div class="lbl">اجمالي المدفوع</div><div class="val">${fmt0(totalPaid)}</div></div>
          <div class="stat st-bal"><div class="lbl">الرصيد الحالي</div><div class="val">${fmt0(currentBal)}</div></div>
        </div>
        <table><thead><tr><th>التاريخ</th><th>النوع</th><th>البيان</th><th>مدين (عليه)</th><th>دائن (له)</th><th>الرصيد</th></tr></thead><tbody>`;
        rows.forEach(r=>{html+=`<tr><td class="num">${fmtDate(r.date||"")}</td>
          <td class="num"><span class="${r.type==="salary"?"type-sal":"type-adv"}">${r.type==="salary"?"مرتب":"سلفة"}</span></td>
          <td>${r.desc||""}</td>
          <td class="num neg">${r.debit>0?fmt0(r.debit):"—"}</td>
          <td class="num pos">${r.credit>0?fmt0(r.credit):"—"}</td>
          <td class="num" style="font-weight:800;color:${r.bal>=0?"#10b981":"#ef4444"}">${fmt0(r.bal)}</td></tr>`});
        html+=`</tbody></table>
        <div style="margin-top:12px;padding:10px;background:#f0f9ff;border-radius:8px;text-align:center;font-size:12px;font-weight:700;color:#0ea5e9">
          الرصيد النهائي المستحق للموظف: ${fmt0(currentBal)} ج.م
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:30px;padding:0 40px;font-size:10px">
          <div style="text-align:center;border-top:1px solid #94a3b8;padding-top:4px;min-width:120px">المحاسب</div>
          <div style="text-align:center;border-top:1px solid #94a3b8;padding-top:4px;min-width:120px">${emp.name}</div>
        </div></body></html>`;
        w.document.write(html);w.document.close();setTimeout(()=>w.print(),300)};
      return<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={()=>setEmpStatement(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:20,width:"100%",maxWidth:800,maxHeight:"90vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.4)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div>
              <div style={{fontSize:FS+2,fontWeight:800,color:T.accent}}>📄 كشف حساب — {emp.name}</div>
              <div style={{fontSize:FS-1,color:T.textMut,marginTop:2}}>{(emp.code?"#"+emp.code+" • ":"")+emp.job||""}</div>
            </div>
            <div style={{display:"flex",gap:6}}>
              <Btn small onClick={printStmt} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30",fontWeight:700}}>🖨 طباعة</Btn>
              <Btn ghost small onClick={()=>setEmpStatement(null)}>✕</Btn>
            </div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"flex-end",marginBottom:12,flexWrap:"wrap"}}>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>من تاريخ</label><Inp type="date" value={stmtFrom} onChange={setStmtFrom}/></div>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>إلى تاريخ</label><Inp type="date" value={stmtTo} onChange={setStmtTo}/></div>
            {(stmtFrom||stmtTo)&&<Btn small ghost onClick={()=>{setStmtFrom("");setStmtTo("")}}>مسح</Btn>}
          </div>
          {/* Summary cards */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:12}}>
            <div style={{padding:10,borderRadius:10,background:T.accent+"08",border:"1px solid "+T.accent+"20",textAlign:"center"}}>
              <div style={{fontSize:FS-2,color:T.textMut}}>اجمالي المستحقات</div>
              <div style={{fontSize:FS+1,fontWeight:800,color:T.accent}}>{fmt0(totalGross)}</div>
              <div style={{fontSize:FS-3,color:T.textMut}}>{salaryCount+" مرتب"}</div>
            </div>
            <div style={{padding:10,borderRadius:10,background:T.err+"08",border:"1px solid "+T.err+"20",textAlign:"center"}}>
              <div style={{fontSize:FS-2,color:T.textMut}}>اجمالي السلف</div>
              <div style={{fontSize:FS+1,fontWeight:800,color:T.err}}>{fmt0(totalAdv)}</div>
            </div>
            <div style={{padding:10,borderRadius:10,background:T.ok+"08",border:"1px solid "+T.ok+"20",textAlign:"center"}}>
              <div style={{fontSize:FS-2,color:T.textMut}}>اجمالي المدفوع</div>
              <div style={{fontSize:FS+1,fontWeight:800,color:T.ok}}>{fmt0(totalPaid)}</div>
            </div>
            <div style={{padding:10,borderRadius:10,background:"#8B5CF608",border:"1px solid #8B5CF620",textAlign:"center"}}>
              <div style={{fontSize:FS-2,color:T.textMut}}>الرصيد الحالي</div>
              <div style={{fontSize:FS+1,fontWeight:800,color:"#8B5CF6"}}>{fmt0(currentBal)}</div>
            </div>
          </div>
          {rows.length===0?<div style={{textAlign:"center",padding:30,color:T.textMut}}>لا توجد حركات في الفترة المحددة</div>
          :<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>
            {["التاريخ","النوع","البيان","مدين (عليه)","دائن (له)","الرصيد"].map(h=><th key={h} style={{padding:"6px 8px",textAlign:"center",fontSize:FS-2,color:T.textSec,borderBottom:"2px solid "+T.brd,fontWeight:700}}>{h}</th>)}
          </tr></thead><tbody>
            {rows.map((r,i)=><tr key={i} style={{borderBottom:"1px solid "+T.brd,background:i%2===1?T.bg:""}}>
              <td style={{padding:"6px 8px",fontSize:FS-2,textAlign:"center"}}>{fmtDate(r.date)}</td>
              <td style={{padding:"6px 8px",textAlign:"center"}}><span style={{padding:"2px 8px",borderRadius:6,fontSize:FS-3,fontWeight:700,background:r.type==="salary"?T.accent+"12":T.err+"12",color:r.type==="salary"?T.accent:T.err}}>{r.type==="salary"?"مرتب":"سلفة"}</span></td>
              <td style={{padding:"6px 8px",fontSize:FS-2}}>{r.desc}</td>
              <td style={{padding:"6px 8px",fontSize:FS-1,textAlign:"center",color:T.err,fontWeight:700}}>{r.debit>0?fmt0(r.debit):"—"}</td>
              <td style={{padding:"6px 8px",fontSize:FS-1,textAlign:"center",color:T.ok,fontWeight:700}}>{r.credit>0?fmt0(r.credit):"—"}</td>
              <td style={{padding:"6px 8px",fontSize:FS,textAlign:"center",fontWeight:800,color:r.bal>=0?T.ok:T.err}}>{fmt0(r.bal)}</td>
            </tr>)}
          </tbody></table></div>}
        </div>
      </div>})()}

    {/* ══ V14.57: QR RECEIPT SCANNER POPUP ══ */}
    {showEmpQrScanner&&(()=>{
      const w=hrWeeks.find(x=>x.id===showEmpQrScanner.weekId);
      if(!w)return null;
      /* V15.25: Use merged receipts */
      const receipts=mergedReceipts(w);
      const wkSelected=(w.selectedEmps&&Array.isArray(w.selectedEmps))?w.selectedEmps:[];
      const wkEmps=activeEmps.filter(e=>wkSelected.includes(e.id));
      const received=wkEmps.filter(e=>receipts[e.id]);
      const notReceived=wkEmps.filter(e=>!receipts[e.id]);
      const handleScan=(text)=>{
        /* Expected format: CLARK:EMP:<empId> */
        const m=/^CLARK:EMP:(.+)$/.exec(text);
        if(!m){playBeep("error");showToast("❌ QR غير صحيح — يجب أن يكون كارت موظف");return}
        const empId=m[1];
        const emp=employees.find(e=>e.id===empId);
        if(!emp){playBeep("error");showToast("❌ الموظف غير موجود");return}
        if(!wkSelected.includes(empId)){playBeep("error");showToast("⚠️ "+emp.name+" غير مدرج في هذا الأسبوع");return}
        /* V14.60: DUPLICATE SCAN — FRAUD ALERT */
        if(receipts[empId]){
          playBeep("error");
          const prev=receipts[empId];
          setFraudWarning({
            empName:emp.name,
            empCode:emp.code||"",
            previousAt:prev.at,
            previousBy:prev.by||"—",
            attemptAt:new Date().toISOString(),
            attemptBy:userName||"—",
            weekId:w.id,
            weekNum:w.weekNum
          });
          /* Log the attempt in audit as a FRAUD warning */
          upConfig(d=>{
            if(!Array.isArray(d.auditLog))d.auditLog=[];
            d.auditLog.unshift({
              id:Math.random().toString(36).slice(2)+Date.now(),
              category:"week",action:"duplicate_scan_attempt",
              target:"W"+w.weekNum+" — "+emp.name,
              newValue:"🚨 محاولة سكان مكررة",
              notes:"الاستلام الأصلي: "+new Date(prev.at).toLocaleString("ar-EG")+" بواسطة "+(prev.by||"—")+" | محاولة جديدة بواسطة "+(userName||"—"),
              at:new Date().toISOString(),severity:"warning"
            });
          });
          return;
        }
        /* Register the receipt */
        upConfig(d=>{
          const wi=(d.hrWeeks||[]).findIndex(x=>x.id===w.id);if(wi<0)return;
          if(!d.hrWeeks[wi].receipts)d.hrWeeks[wi].receipts={};
          d.hrWeeks[wi].receipts[empId]={at:new Date().toISOString(),by:userName||""};
          /* Audit */
          if(!Array.isArray(d.auditLog))d.auditLog=[];
          d.auditLog.unshift({
            id:Math.random().toString(36).slice(2)+Date.now(),
            category:"week",action:"salary_receipt",
            target:"W"+w.weekNum+" — "+emp.name,
            newValue:"استلم المرتب",
            notes:"QR سكان بواسطة "+(userName||"—"),
            at:new Date().toISOString(),severity:"info"
          });
        });
        playBeep("done");
        showToast("✅ تم تسجيل استلام "+emp.name);
      };
      return<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:10002,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowEmpQrScanner(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:20,width:"100%",maxWidth:560,maxHeight:"92vh",display:"flex",flexDirection:"column",border:"2px solid "+T.ok,boxShadow:"0 25px 70px rgba(0,0,0,0.45)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,paddingBottom:10,borderBottom:"2px solid "+T.ok+"25"}}>
            <div style={{fontSize:FS+3,fontWeight:900,color:T.ok,display:"flex",alignItems:"center",gap:8}}>
              <span>📱</span><span>تسجيل استلام — W{w.weekNum}</span>
            </div>
            <span onClick={()=>setShowEmpQrScanner(null)} style={{cursor:"pointer",fontSize:22,color:T.textMut,padding:4}}>✕</span>
          </div>
          {/* Progress */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14}}>
            <div style={{padding:"8px 10px",borderRadius:10,background:T.accent+"08",border:"1px solid "+T.accent+"20",textAlign:"center"}}>
              <div style={{fontSize:FS-3,color:T.textMut,fontWeight:600}}>الكل</div>
              <div style={{fontSize:FS+4,fontWeight:900,color:T.accent}}>{wkEmps.length}</div>
            </div>
            <div style={{padding:"8px 10px",borderRadius:10,background:T.ok+"08",border:"1px solid "+T.ok+"30",textAlign:"center"}}>
              <div style={{fontSize:FS-3,color:T.textMut,fontWeight:600}}>✅ استلم</div>
              <div style={{fontSize:FS+4,fontWeight:900,color:T.ok}}>{received.length}</div>
            </div>
            <div style={{padding:"8px 10px",borderRadius:10,background:T.err+"08",border:"1px solid "+T.err+"30",textAlign:"center"}}>
              <div style={{fontSize:FS-3,color:T.textMut,fontWeight:600}}>⏳ متبقي</div>
              <div style={{fontSize:FS+4,fontWeight:900,color:T.err}}>{notReceived.length}</div>
            </div>
          </div>
          {/* Scanner */}
          <div style={{borderRadius:12,overflow:"hidden",border:"2px solid "+T.ok+"40",marginBottom:12}}>
            <QRScanner onScan={handleScan} onClose={()=>{}}/>
          </div>
          <div style={{fontSize:FS-2,color:T.textMut,textAlign:"center",padding:"8px 0"}}>
            💡 وجّه الكاميرا على كارت QR الموظف
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end",paddingTop:10,borderTop:"1px solid "+T.brd}}>
            <Btn ghost onClick={()=>setShowEmpQrScanner(null)}>إغلاق</Btn>
          </div>
        </div>
      </div>;
    })()}

    {/* ══ V14.57: FRAUD LIST POPUP — employees who did NOT receive salary ══ */}
    {fraudListPopup&&(()=>{
      const w=fraudListPopup.week;
      const emps=fraudListPopup.emps||[];
      return<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:10002,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setFraudListPopup(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:20,width:"100%",maxWidth:600,maxHeight:"92vh",display:"flex",flexDirection:"column",border:"2px solid "+T.err,boxShadow:"0 25px 70px rgba(0,0,0,0.45)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,paddingBottom:10,borderBottom:"2px solid "+T.err+"25"}}>
            <div style={{fontSize:FS+2,fontWeight:900,color:T.err,display:"flex",alignItems:"center",gap:8}}>
              <span>⚠️</span><span>لم يستلموا المرتب — W{w.weekNum}</span>
            </div>
            <span onClick={()=>setFraudListPopup(null)} style={{cursor:"pointer",fontSize:22,color:T.textMut,padding:4}}>✕</span>
          </div>
          <div style={{padding:10,borderRadius:8,background:T.err+"06",border:"1px solid "+T.err+"25",marginBottom:12,fontSize:FS-1,color:T.text,lineHeight:1.6}}>
            {emps.length} موظف لم يُسجّل استلامهم للمرتب بالـ QR — قد يكون احتيال أو لسه ما استلموش.
          </div>
          <div style={{flex:1,overflowY:"auto",background:T.bg,borderRadius:10,border:"1px solid "+T.brd,padding:4}}>
            {emps.map((e,i)=>{
              const c=getEmpSalary(e.id,w);
              return<div key={e.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",borderBottom:"1px solid "+T.brd,background:i%2===0?"transparent":T.cardSolid}}>
                <div>
                  <div style={{fontSize:FS,fontWeight:700,color:T.text}}>{e.name}</div>
                  <div style={{fontSize:FS-3,color:T.textMut}}>{(e.code?"#"+e.code:"")}{e.job?" • "+e.job:""}</div>
                </div>
                <div style={{fontSize:FS,fontWeight:800,color:T.err,fontFamily:"monospace"}}>{c?fmt0(c.thursdayPay)+" ج":"—"}</div>
              </div>;
            })}
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:12,borderTop:"1px solid "+T.brd,marginTop:10}}>
            <span style={{fontSize:FS-1,color:T.textSec}}>الإجمالي: <b style={{color:T.err,fontSize:FS+1}}>{fmt0(emps.reduce((s,e)=>{const c=getEmpSalary(e.id,w);return s+(c?c.thursdayPay:0)},0))}</b> ج.م</span>
            <Btn ghost onClick={()=>setFraudListPopup(null)}>إغلاق</Btn>
          </div>
        </div>
      </div>;
    })()}

    {/* ══ V14.60: EMPLOYEE QR VIEW POPUP — for when employee forgot their card ══ */}
    {empQrView&&(()=>{
      const emp=employees.find(e=>e.id===empQrView);
      if(!emp)return null;
      const qrText="CLARK:EMP:"+emp.id;
      return<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:10003,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(6px)"}} onClick={()=>setEmpQrView(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:24,padding:isMob?20:32,width:"100%",maxWidth:480,boxShadow:"0 25px 70px rgba(0,0,0,0.5)",display:"flex",flexDirection:"column",alignItems:"center",gap:16}}>
          {/* Header */}
          <div style={{width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",paddingBottom:12,borderBottom:"2px solid #0EA5E925"}}>
            <div style={{fontSize:FS+2,fontWeight:900,color:"#0EA5E9",display:"flex",alignItems:"center",gap:8}}>
              <span>👁</span><span>عرض QR</span>
            </div>
            <span onClick={()=>setEmpQrView(null)} style={{cursor:"pointer",fontSize:26,color:"#64748B",padding:4,lineHeight:1}}>✕</span>
          </div>

          {/* Brand header like the physical card */}
          <div style={{fontSize:16,fontWeight:900,letterSpacing:4,color:"#000",borderBottom:"2px solid #000",paddingBottom:8,width:"100%",textAlign:"center"}}>CLARK</div>

          {/* Big QR */}
          <div style={{padding:16,background:"#fff",border:"3px solid #000",borderRadius:12}}>
            <QRImg text={qrText} size={isMob?220:280}/>
          </div>

          {/* Name and code */}
          <div style={{textAlign:"center",width:"100%"}}>
            <div style={{fontSize:FS+6,fontWeight:900,color:"#000",marginBottom:6,lineHeight:1.2}}>{emp.name}</div>
            <div style={{fontSize:FS+2,fontWeight:800,color:"#0EA5E9",fontFamily:"monospace",borderTop:"1px dashed #000",paddingTop:8,marginTop:8}}>{emp.code?"#"+emp.code:"—"}</div>
            {emp.job&&<div style={{fontSize:FS-1,color:"#64748B",marginTop:4}}>{emp.job}</div>}
          </div>

          {/* Instructions */}
          <div style={{padding:10,borderRadius:10,background:"#F0F9FF",border:"1px solid #0EA5E925",fontSize:FS-2,color:"#334155",textAlign:"center",lineHeight:1.6,width:"100%"}}>
            💡 <b>وجّه الكاميرا على الـ QR أعلاه</b> لتسجيل الاستلام.<br/>
            المحاسب يستخدم هذا العرض لو الموظف نسي كارته.
          </div>

          {/* Actions */}
          <div style={{display:"flex",gap:8,width:"100%",justifyContent:"center"}}>
            <Btn onClick={()=>{printEmpQrCards([emp]);setEmpQrView(null)}} style={{background:"#8B5CF612",color:"#8B5CF6",border:"1px solid #8B5CF630",fontWeight:700}}>🎫 طباعة كارت بديل</Btn>
            <Btn ghost onClick={()=>setEmpQrView(null)} style={{background:"#F1F5F9",color:"#475569"}}>إغلاق</Btn>
          </div>
        </div>
      </div>;
    })()}

    {/* ══ V15.48: SALARY ENVELOPE PRINT POPUP ══ */}
    {envelopePopup&&(()=>{
      const w=(data.hrWeeks||[]).find(x=>x.id===envelopePopup.weekId);if(!w)return null;
      /* V15.48 FIX: use getSelectedEmps helper (matches existing pattern). Field is w.selectedEmps (IDs array), not w.employees. */
      const wkSelIds=getSelectedEmps(envelopePopup.weekId);
      const wkEmps=activeEmps.filter(e=>wkSelIds.includes(e.id));
      const printed=w.envelopesPrinted||{};
      const receipts=w.receipts||{};
      /* Apply filter */
      const q=(envelopePopup.search||"").trim().toLowerCase();
      const filtered=wkEmps.filter(e=>{
        if(envelopePopup.filter==="unprinted"&&printed[e.id])return false;
        if(envelopePopup.filter==="uncollected"&&receipts[e.id])return false;
        if(q&&!(e.name||"").toLowerCase().includes(q)&&!(e.code||"").toLowerCase().includes(q))return false;
        return true;
      });
      const selectedEmps=wkEmps.filter(e=>envelopePopup.selected.has(e.id));
      const toggleAll=(on)=>{setEnvelopePopup(p=>{const s=new Set(p.selected);filtered.forEach(e=>{if(on)s.add(e.id);else s.delete(e.id)});return{...p,selected:s}})};
      const toggleOne=(id)=>{setEnvelopePopup(p=>{const s=new Set(p.selected);if(s.has(id))s.delete(id);else s.add(id);return{...p,selected:s}})};
      const doPrint=()=>{
        if(selectedEmps.length===0){showToast("⚠️ اختار موظف واحد على الأقل");return}
        /* Print */
        printSalaryEnvelopes(selectedEmps,{weekNum:w.weekNum,startDate:w.startDate},{logo:data.logo,factoryName:data.factoryName});
        /* Mark as printed */
        upConfig(d=>{
          const wi=(d.hrWeeks||[]).findIndex(x=>x.id===w.id);if(wi<0)return;
          if(!d.hrWeeks[wi].envelopesPrinted)d.hrWeeks[wi].envelopesPrinted={};
          const now=new Date().toISOString();
          selectedEmps.forEach(e=>{d.hrWeeks[wi].envelopesPrinted[e.id]={at:now,by:userName||""}});
        });
        showToast("✓ تم إرسال "+selectedEmps.length+" ظرف للطباعة");
        setEnvelopePopup(null);
      };
      const allFilteredSelected=filtered.length>0&&filtered.every(e=>envelopePopup.selected.has(e.id));
      return<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:10002,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setEnvelopePopup(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:20,width:"100%",maxWidth:680,maxHeight:"92vh",display:"flex",flexDirection:"column",border:"2px solid #F59E0B",boxShadow:"0 25px 70px rgba(0,0,0,0.45)"}}>
          {/* Header */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,paddingBottom:10,borderBottom:"2px solid #F59E0B25"}}>
            <div>
              <div style={{fontSize:FS+3,fontWeight:900,color:"#F59E0B",display:"flex",alignItems:"center",gap:8}}>
                <span>📮</span><span>مظاريف المرتبات — W{w.weekNum}</span>
              </div>
              <div style={{fontSize:FS-2,color:T.textMut,marginTop:2}}>ظرف DL (220×110mm) — طباعة مباشرة على الظرف</div>
            </div>
            <span onClick={()=>setEnvelopePopup(null)} style={{cursor:"pointer",fontSize:22,color:T.textMut,padding:4}}>✕</span>
          </div>
          {/* Stats */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:12}}>
            <div style={{padding:"6px 10px",borderRadius:8,background:T.bg,border:"1px solid "+T.brd,textAlign:"center"}}>
              <div style={{fontSize:FS-3,color:T.textMut,fontWeight:600}}>كل الأسبوع</div>
              <div style={{fontSize:FS+2,fontWeight:900,color:T.text}}>{wkEmps.length}</div>
            </div>
            <div style={{padding:"6px 10px",borderRadius:8,background:"#F59E0B08",border:"1px solid #F59E0B30",textAlign:"center"}}>
              <div style={{fontSize:FS-3,color:T.textMut,fontWeight:600}}>مختار</div>
              <div style={{fontSize:FS+2,fontWeight:900,color:"#F59E0B"}}>{envelopePopup.selected.size}</div>
            </div>
            <div style={{padding:"6px 10px",borderRadius:8,background:T.ok+"08",border:"1px solid "+T.ok+"30",textAlign:"center"}}>
              <div style={{fontSize:FS-3,color:T.textMut,fontWeight:600}}>طُبعت</div>
              <div style={{fontSize:FS+2,fontWeight:900,color:T.ok}}>{Object.keys(printed).length}</div>
            </div>
            <div style={{padding:"6px 10px",borderRadius:8,background:T.accent+"08",border:"1px solid "+T.accent+"30",textAlign:"center"}}>
              <div style={{fontSize:FS-3,color:T.textMut,fontWeight:600}}>استلموا</div>
              <div style={{fontSize:FS+2,fontWeight:900,color:T.accent}}>{Object.keys(receipts).length}</div>
            </div>
          </div>
          {/* Filters */}
          <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
            <Sel value={envelopePopup.filter} onChange={v=>setEnvelopePopup(p=>({...p,filter:v}))} style={{flex:"0 0 auto",minWidth:160}}>
              <option value="all">كل موظفي الأسبوع</option>
              <option value="unprinted">لم يُطبع لهم ظرف</option>
              <option value="uncollected">لم يستلموا المرتب</option>
            </Sel>
            <input value={envelopePopup.search} onChange={e=>setEnvelopePopup(p=>({...p,search:e.target.value}))} placeholder="🔍 بحث بالاسم أو الكود..." style={{flex:1,minWidth:140,padding:"6px 10px",borderRadius:8,border:"1px solid "+T.brd,fontSize:FS-1,fontFamily:"inherit",background:T.inputBg,color:T.text}}/>
            <Btn small ghost onClick={()=>toggleAll(!allFilteredSelected)} style={{whiteSpace:"nowrap"}}>{allFilteredSelected?"✕ إلغاء الكل":"☑ تحديد الكل"}</Btn>
          </div>
          {/* Employee list */}
          <div style={{flex:1,overflowY:"auto",border:"1px solid "+T.brd,borderRadius:10,marginBottom:12}}>
            {filtered.length===0?<div style={{padding:30,textAlign:"center",color:T.textMut}}>لا توجد نتائج</div>:
              filtered.map(e=>{const sel=envelopePopup.selected.has(e.id);const wasP=!!printed[e.id];const wasR=!!receipts[e.id];
                return<div key={e.id} onClick={()=>toggleOne(e.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderBottom:"1px solid "+T.brd,cursor:"pointer",background:sel?"#F59E0B08":"transparent",transition:"background 0.1s"}}>
                  <div style={{width:20,height:20,borderRadius:5,border:"2px solid "+(sel?"#F59E0B":T.brd),background:sel?"#F59E0B":"transparent",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:12,fontWeight:900,flexShrink:0}}>{sel?"✓":""}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:FS,fontWeight:700,color:T.text,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                      <span>{e.name}</span>
                      {e.code&&<span style={{fontSize:FS-3,color:T.accent,fontFamily:"monospace",fontWeight:700}}>#{e.code}</span>}
                      {wasP&&<span style={{fontSize:FS-3,padding:"1px 6px",borderRadius:6,background:T.ok+"15",color:T.ok,fontWeight:700}} title={"طُبع: "+new Date(printed[e.id].at).toLocaleString("ar-EG")+(printed[e.id].by?" • "+printed[e.id].by:"")}>📮 طُبع</span>}
                      {wasR&&<span style={{fontSize:FS-3,padding:"1px 6px",borderRadius:6,background:T.accent+"15",color:T.accent,fontWeight:700}} title={"استلم: "+new Date(receipts[e.id].at).toLocaleString("ar-EG")}>✅ استلم</span>}
                    </div>
                    {e.job&&<div style={{fontSize:FS-3,color:T.textMut,marginTop:1}}>{e.job}</div>}
                  </div>
                </div>;
              })}
          </div>
          {/* Actions */}
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <Btn ghost onClick={()=>setEnvelopePopup(null)}>إلغاء</Btn>
            <Btn onClick={doPrint} disabled={envelopePopup.selected.size===0} style={{background:envelopePopup.selected.size>0?"#F59E0B":T.brd,color:"#fff",border:"none",fontWeight:800,padding:"8px 20px",opacity:envelopePopup.selected.size>0?1:0.5}}>📮 طباعة {envelopePopup.selected.size} ظرف</Btn>
          </div>
        </div>
      </div>;
    })()}

    {/* ══ V14.60: FRAUD WARNING POPUP — duplicate scan attempt ══ */}
    {fraudWarning&&(()=>{
      const fw=fraudWarning;
      const prevDate=new Date(fw.previousAt).toLocaleString("ar-EG");
      const attemptDate=new Date(fw.attemptAt).toLocaleString("ar-EG");
      const diffMs=new Date(fw.attemptAt)-new Date(fw.previousAt);
      const diffHr=Math.floor(diffMs/(1000*60*60));
      const diffMin=Math.floor((diffMs%(1000*60*60))/(1000*60));
      const diffTxt=diffHr>0?diffHr+" ساعة و "+diffMin+" دقيقة":diffMin+" دقيقة";
      return<div style={{position:"fixed",inset:0,background:"rgba(220,38,38,0.7)",zIndex:10004,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={()=>setFraudWarning(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:520,border:"4px solid "+T.err,boxShadow:"0 25px 70px rgba(220,38,38,0.4)",animation:"fraudShake 0.4s"}}>
          {/* Big warning header */}
          <div style={{textAlign:"center",marginBottom:18}}>
            <div style={{fontSize:56,lineHeight:1,marginBottom:8}}>🚨</div>
            <div style={{fontSize:FS+5,fontWeight:900,color:T.err,lineHeight:1.2}}>محاولة احتيال محتملة!</div>
            <div style={{fontSize:FS,color:T.textSec,marginTop:6,fontWeight:600}}>تم مسح هذا الكارت من قبل</div>
          </div>

          {/* Employee info */}
          <div style={{padding:14,borderRadius:12,background:T.err+"08",border:"2px solid "+T.err+"30",marginBottom:12}}>
            <div style={{fontSize:FS-2,color:T.textMut,fontWeight:600,marginBottom:4}}>الموظف:</div>
            <div style={{fontSize:FS+3,fontWeight:900,color:T.text}}>{fw.empName}</div>
            {fw.empCode&&<div style={{fontSize:FS,fontWeight:700,color:T.accent,fontFamily:"monospace",marginTop:2}}>#{fw.empCode}</div>}
          </div>

          {/* Previous receipt info */}
          <div style={{padding:12,borderRadius:10,background:T.ok+"06",border:"1px solid "+T.ok+"25",marginBottom:10}}>
            <div style={{fontSize:FS-2,color:T.ok,fontWeight:800,marginBottom:6,display:"flex",alignItems:"center",gap:6}}>
              <span>✅</span><span>الاستلام الأصلي:</span>
            </div>
            <div style={{fontSize:FS-1,color:T.text,lineHeight:1.8}}>
              <div>📅 <b>{prevDate}</b></div>
              <div>👤 بواسطة: <b>{fw.previousBy}</b></div>
            </div>
          </div>

          {/* Current attempt info */}
          <div style={{padding:12,borderRadius:10,background:T.err+"06",border:"1px solid "+T.err+"25",marginBottom:10}}>
            <div style={{fontSize:FS-2,color:T.err,fontWeight:800,marginBottom:6,display:"flex",alignItems:"center",gap:6}}>
              <span>⚠️</span><span>المحاولة الحالية:</span>
            </div>
            <div style={{fontSize:FS-1,color:T.text,lineHeight:1.8}}>
              <div>📅 <b>{attemptDate}</b></div>
              <div>👤 بواسطة: <b>{fw.attemptBy}</b></div>
              <div>⏱ الفرق الزمني: <b style={{color:T.err}}>{diffTxt}</b></div>
            </div>
          </div>

          {/* Warning note */}
          <div style={{padding:12,borderRadius:10,background:T.warn+"08",border:"1px solid "+T.warn+"30",marginBottom:14,fontSize:FS-1,color:T.text,lineHeight:1.6}}>
            💡 <b>ملاحظة:</b> تم تسجيل هذه المحاولة في سجل التدقيق (Audit Log) للمراجعة لاحقاً.
            <br/>
            <b>لم يتم تسجيل الاستلام مرة أخرى</b> — الموظف استلم بالفعل.
          </div>

          {/* Close button */}
          <div style={{textAlign:"center"}}>
            <Btn onClick={()=>setFraudWarning(null)} style={{background:T.err,color:"#fff",border:"none",fontWeight:800,padding:"12px 40px",fontSize:FS+1}}>✕ فهمت، أغلق</Btn>
          </div>
        </div>
        <style>{`@keyframes fraudShake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-5px)}80%{transform:translateX(5px)}}`}</style>
      </div>;
    })()}

    {/* ══ EMPLOYEE PICKER POPUP ══ */}
    {showEmpPicker&&openWeek&&(()=>{
      /* V15.17: initialize tentative from current state on first render of popup */
      if(empPickerTentative===null){
        const current=getSelectedEmps(openWeek.id);
        setEmpPickerTentative([...current]);
        return null;/* will re-render next frame with tentative set */
      }
      const current=empPickerTentative;
      /* Toggle only updates local tentative — does NOT commit */
      const toggle=(id)=>{
        setEmpPickerTentative(cur=>{
          const has=cur.includes(id);
          return has?cur.filter(x=>x!==id):[...cur,id];
        });
      };
      /* Compute attendance status for each employee in this week */
      const weekAtt=openWeek.attendance||{};
      const getEmpStatus=(emp)=>{
        const st=(emp.salaryType||"weekly");
        const hasCode=!!(emp.code&&String(emp.code).trim());
        const isNoBio=!!emp.noBiometric;
        if(isNoBio)return{type:"admin",label:"إدارة",color:"#8B5CF6"};
        if(st==="monthly")return{type:"monthly",label:"شهري",color:"#3B82F6"};
        /* Weekly with biometric — check attendance records */
        if(!hasCode)return{type:"no-code",label:"بدون كود",color:"#94A3B8"};
        let totalHours=0;let daysPresent=0;
        Object.keys(weekAtt).forEach(k=>{if(k.startsWith(emp.id+"_")){const h=Number(weekAtt[k].hours)||0;if(h>0){totalHours+=h;daysPresent++}}});
        if(totalHours>0)return{type:"present",label:"✅ حاضر",color:T.ok,totalHours:r2(totalHours),daysPresent};
        return{type:"absent",label:"❌ غائب",color:T.err};
      };
      /* Split employees by salary type. "admin" (noBiometric) goes into weekly unless explicitly monthly. */
      const weeklyEmps=activeEmps.filter(e=>(e.salaryType||"weekly")!=="monthly");
      const monthlyEmps=activeEmps.filter(e=>(e.salaryType||"weekly")==="monthly");
      const tabEmps=empPickerTab==="monthly"?monthlyEmps:weeklyEmps;
      /* V15.17: Apply search filter */
      const fq=(empPickerFilter||"").trim().toLowerCase();
      const filteredTabEmps=fq?tabEmps.filter(e=>{
        const name=(e.name||"").toLowerCase();
        const code=(e.code||"").toLowerCase();
        const fp=(e.fingerprintCode||e.code||"").toLowerCase();
        const job=(e.job||"").toLowerCase();
        return name.includes(fq)||code.includes(fq)||fp.includes(fq)||job.includes(fq);
      }):tabEmps;
      /* Counters per tab */
      const weeklyPresent=weeklyEmps.filter(e=>getEmpStatus(e).type==="present").length;
      const weeklyAbsent=weeklyEmps.filter(e=>getEmpStatus(e).type==="absent").length;
      const weeklySelCount=weeklyEmps.filter(e=>current.includes(e.id)).length;
      const monthlySelCount=monthlyEmps.filter(e=>current.includes(e.id)).length;
      /* Auto-select actions — per tab — all operate on tentative only */
      const selectTabPresent=()=>{
        if(empPickerTab==="weekly"){
          const addIds=weeklyEmps.filter(e=>{const s=getEmpStatus(e);return s.type==="present"||s.type==="admin"}).map(e=>e.id);
          setEmpPickerTentative(cur=>{
            const keepNonWeekly=cur.filter(id=>!weeklyEmps.some(e=>e.id===id));
            return[...keepNonWeekly,...addIds];
          });
        }else{
          setEmpPickerTentative(cur=>{
            const keepNonMonthly=cur.filter(id=>!monthlyEmps.some(e=>e.id===id));
            return[...keepNonMonthly,...monthlyEmps.map(e=>e.id)];
          });
        }
      };
      const selectTabAll=()=>{
        setEmpPickerTentative(cur=>{
          const others=cur.filter(id=>!tabEmps.some(e=>e.id===id));
          return[...others,...tabEmps.map(e=>e.id)];
        });
      };
      const selectTabNone=()=>{
        setEmpPickerTentative(cur=>cur.filter(id=>!tabEmps.some(e=>e.id===id)));
      };
      /* Commit: save tentative → selectedEmps → Firestore */
      const commitAndClose=()=>{
        const draft=[...empPickerTentative];
        /* Save to local draft state */
        setSelectedEmps(p=>({...p,[openWeek.id]:draft}));
        /* Also flush to Firestore immediately */
        upConfig(d=>{
          if(!Array.isArray(d.hrWeeks))return;
          const i=d.hrWeeks.findIndex(w=>w.id===openWeek.id);
          if(i<0)return;
          d.hrWeeks[i].selectedEmps=[...draft];
        });
        /* Clear local draft after flush — subsequent reads come from Firestore */
        setTimeout(()=>{
          setSelectedEmps(p=>{const n={...p};delete n[openWeek.id];return n});
        },100);
        setEmpPickerTentative(null);
        setEmpPickerFilter("");
        setShowEmpPicker(false);
      };
      /* Cancel: discard tentative */
      const cancelAndClose=()=>{
        setEmpPickerTentative(null);
        setEmpPickerFilter("");
        setShowEmpPicker(false);
      };
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={cancelAndClose}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:20,width:"100%",maxWidth:580,maxHeight:"88vh",overflowY:"auto",border:"1px solid "+T.brd}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:FS+1,fontWeight:800,color:T.accent}}>👥 اختر موظفي هذا الأسبوع</div>
            <Btn ghost small onClick={cancelAndClose}>✕</Btn>
          </div>
          {/* Tabs */}
          <div style={{display:"flex",gap:0,marginBottom:12,borderBottom:"2px solid "+T.brd}}>
            <div onClick={()=>setEmpPickerTab("weekly")} style={{cursor:"pointer",padding:"10px 16px",fontSize:FS,fontWeight:800,color:empPickerTab==="weekly"?T.accent:T.textSec,borderBottom:empPickerTab==="weekly"?"3px solid "+T.accent:"3px solid transparent",marginBottom:"-2px",display:"flex",alignItems:"center",gap:6}}>
              <span>👷</span><span>أسبوعي ({weeklySelCount}/{weeklyEmps.length})</span>
            </div>
            <div onClick={()=>setEmpPickerTab("monthly")} style={{cursor:"pointer",padding:"10px 16px",fontSize:FS,fontWeight:800,color:empPickerTab==="monthly"?"#3B82F6":T.textSec,borderBottom:empPickerTab==="monthly"?"3px solid #3B82F6":"3px solid transparent",marginBottom:"-2px",display:"flex",alignItems:"center",gap:6}}>
              <span>📅</span><span>شهري ({monthlySelCount}/{monthlyEmps.length})</span>
            </div>
          </div>
          {/* V15.17: Search filter */}
          <div style={{marginBottom:10,position:"relative"}}>
            <span style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",fontSize:FS-1,color:T.textMut,pointerEvents:"none"}}>🔍</span>
            <input type="text" value={empPickerFilter} onChange={e=>setEmpPickerFilter(e.target.value)} placeholder="ابحث بالاسم، الكود، كود البصمة، الوظيفة..." style={{width:"100%",padding:"8px 34px 8px 12px",borderRadius:10,border:"1px solid "+T.brd,fontSize:FS-1,fontFamily:"inherit",background:T.inputBg,color:T.text,boxSizing:"border-box"}}/>
            {empPickerFilter&&<span onClick={()=>setEmpPickerFilter("")} style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",cursor:"pointer",color:T.textMut,fontSize:FS-1,fontWeight:700}}>✕</span>}
          </div>
          {/* Summary badges — only for weekly tab */}
          {empPickerTab==="weekly"&&<div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
            <span style={{padding:"4px 10px",borderRadius:8,background:T.ok+"12",color:T.ok,fontSize:FS-2,fontWeight:700}}>✅ حاضر: {weeklyPresent}</span>
            <span style={{padding:"4px 10px",borderRadius:8,background:T.err+"12",color:T.err,fontSize:FS-2,fontWeight:700}}>❌ غائب: {weeklyAbsent}</span>
          </div>}
          {/* Quick-select buttons — V15.17: renamed */}
          <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
            {empPickerTab==="weekly"?<Btn small onClick={selectTabPresent} style={{background:T.ok+"15",color:T.ok,border:"1px solid "+T.ok+"40",fontWeight:700}} title="يختار الحاضرين + الإدارة في التاب الأسبوعي">⚡ اختر الحاضرين ({weeklyPresent})</Btn>
            :<Btn small onClick={selectTabPresent} style={{background:"#3B82F615",color:"#3B82F6",border:"1px solid #3B82F640",fontWeight:700}} title="اختر كل الموظفين الشهريين">⚡ اختر كل الشهريين ({monthlyEmps.length})</Btn>}
            <Btn small onClick={selectTabAll} style={{background:T.accent+"10",color:T.accent,border:"1px solid "+T.accent+"30"}}>☑ اختيار الكل</Btn>
            <Btn small onClick={selectTabNone} style={{background:T.err+"10",color:T.err,border:"1px solid "+T.err+"30"}}>☐ إلغاء الكل</Btn>
          </div>
          {filteredTabEmps.length===0?<div style={{textAlign:"center",padding:30,color:T.textMut,fontSize:FS-1}}>
            {fq?"لا توجد نتائج مطابقة للبحث":(empPickerTab==="monthly"?"لا يوجد موظفين شهريين":"لا يوجد موظفين أسبوعيين")}
          </div>
          :<div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:"42vh",overflowY:"auto"}}>
            {filteredTabEmps.map(e=>{const sel=current.includes(e.id);const st=getEmpStatus(e);
              return<div key={e.id} onClick={()=>toggle(e.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderRadius:10,cursor:"pointer",background:sel?T.accent+"08":T.bg,border:"1px solid "+(sel?T.accent+"30":T.brd),transition:"all 0.15s"}}>
                <span style={{fontSize:18}}>{sel?"☑":"☐"}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    <span style={{fontSize:FS,fontWeight:700}}>{e.name}</span>
                    <span style={{padding:"1px 8px",borderRadius:5,fontSize:FS-3,fontWeight:700,background:st.color+"15",color:st.color,border:"1px solid "+st.color+"30",whiteSpace:"nowrap"}}>{st.label}</span>
                  </div>
                  <div style={{fontSize:FS-2,color:T.textMut}}>{(e.code?"#"+e.code:"")+(e.job?" — "+e.job:"")}{st.type==="present"&&st.totalHours?" • "+st.daysPresent+" يوم • "+hrsToHM(st.totalHours):""}</div>
                </div>
                <span style={{fontSize:FS-1,color:T.accent,fontWeight:700,whiteSpace:"nowrap"}}>{fmt0(e.weeklySalary||0)}</span>
              </div>})}
          </div>}
          <div style={{marginTop:10,padding:8,borderRadius:8,background:T.accent+"06",textAlign:"center",fontSize:FS-1,fontWeight:700,color:T.accent}}>{current.length+" من "+activeEmps.length+" موظف"}{fq&&" • يعرض "+filteredTabEmps.length+" نتيجة"}</div>
          <div style={{marginTop:10,display:"flex",gap:8,justifyContent:"center"}}>
            <Btn ghost onClick={cancelAndClose} style={{fontWeight:700}}>إلغاء</Btn>
            <Btn primary onClick={commitAndClose}>✅ تم</Btn>
          </div>
        </div>
      </div>})()}

    {/* ══ V15.18: EXCEL IMPORT POPUP ══ */}
    {showExcelImport&&(()=>{
      const close=()=>{setShowExcelImport(false);setExcelImportStage("upload");setExcelImportData(null);setExcelImportNewEmps({});setExcelImportError("")};
      const handleFile=async(file)=>{
        setExcelImportError("");
        if(!file){return}
        try{
          const ab=await file.arrayBuffer();
          const parsed=await parseHRExcel(ab);
          if(!parsed.weekStart||!parsed.weekEnd){
            setExcelImportError("لم نتمكن من قراءة تواريخ الأسبوع من الملف. تأكد من شيت '0'.");
            return;
          }
          if(parsed.employees.length===0){
            setExcelImportError("لم نجد أي موظف في شيت DB.");
            return;
          }
          setExcelImportData(parsed);
          setExcelImportStage("preview");
        }catch(err){
          setExcelImportError("خطأ في قراءة الملف: "+(err.message||String(err)));
        }
      };
      const doImport=async(overwrite)=>{
        if(!excelImportData)return;
        setExcelImportStage("importing");
        try{
          /* V15.24: Pass the selected import mode (normal or analysis) */
          const res=await executeExcelImport(excelImportData,excelImportNewEmps,overwrite,excelImportMode);
          if(res.needsConfirm){
            const existingWeek=res.existingWeek;
            const ok=await ask({
              title:"الأسبوع موجود بالفعل",
              message:"يوجد أسبوع بنفس التاريخ (W"+existingWeek.weekNum+" — "+existingWeek.weekStart+" إلى "+existingWeek.weekEnd+").\n\nهل تريد الكتابة فوقه؟ سيتم مسح البيانات الحالية واستبدالها بالبيانات من الملف.",
              okText:"نعم، اكتب فوقه",cancelText:"إلغاء",type:"warning"
            });
            if(ok){
              const res2=await executeExcelImport(excelImportData,excelImportNewEmps,true,excelImportMode);
              if(res2.success){
                showToast((res2.isAnalysisOnly?"📊 ":"✓ ")+"تم استيراد W"+res2.weekNum+" — "+res2.matched+" موظف"+(res2.isAnalysisOnly?" (تحليلي)":""));
                close();
                return;
              }
            }
            setExcelImportStage("preview");
            return;
          }
          if(res.success){
            showToast((res.isAnalysisOnly?"📊 ":"✓ ")+"تم استيراد W"+res.weekNum+" — "+res.matched+" موظف + "+res.newEmps+" جديد"+(res.isAnalysisOnly?" (تحليلي)":""));
            close();
          }
        }catch(err){
          setExcelImportError("خطأ في الاستيراد: "+(err.message||String(err)));
          setExcelImportStage("preview");
        }
      };
      const matching=excelImportData?matchExcelEmployees(excelImportData.employees):{matched:[],unmatched:[]};
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={close}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:20,width:"100%",maxWidth:680,maxHeight:"92vh",overflowY:"auto",border:"1px solid "+T.brd}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:FS+2,fontWeight:800,color:excelImportMode==="analysis"?"#3B82F6":"#10B981"}}>{excelImportMode==="analysis"?"📊 استيراد تحليلي — أسبوع للعرض فقط":"📥 استيراد بيانات أسبوع من Excel"}</div>
            <Btn ghost small onClick={close}>✕</Btn>
          </div>
          {/* V15.24: Analysis mode banner — explicit warning about non-effect on treasury */}
          {excelImportMode==="analysis"&&<div style={{padding:"10px 14px",marginBottom:12,borderRadius:10,background:"#3B82F612",color:"#3B82F6",border:"1px solid #3B82F640",fontSize:FS-1,fontWeight:700,lineHeight:1.7}}>
            📊 <b>وضع التحليل:</b> هذا الأسبوع سيتم حفظه للعرض والتقارير فقط.
            <div style={{fontSize:FS-2,fontWeight:500,marginTop:4,opacity:0.85}}>
              ✗ السلف لن تدخل الخزنة • ✗ لن يؤثر على رصيد الموظفين • ✓ الموظفين الجدد سيُضافون للنظام • ✓ قابل للتعديل والإقفال
            </div>
          </div>}
          {excelImportError&&<div style={{padding:"10px 14px",marginBottom:12,borderRadius:10,background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30",fontSize:FS-1,fontWeight:700}}>⚠️ {excelImportError}</div>}
          
          {excelImportStage==="upload"&&<div>
            <div style={{padding:"16px",borderRadius:12,background:T.accent+"06",border:"1px solid "+T.accent+"20",marginBottom:14,fontSize:FS-1,color:T.textSec,lineHeight:1.8}}>
              <div style={{fontWeight:800,color:T.accent,marginBottom:6}}>📋 تنسيق الملف المطلوب:</div>
              <div>• شيت <b>DB</b>: بيانات الموظفين (الكود، الاسم، المرتب، السلف، الخصومات، الحوافز، دفعة الخميس)</div>
              <div>• شيت <b>F</b>: سجل البصمة (AC-No، Date، Total in time)</div>
              <div>• شيت <b>0</b>: ملخص الأسبوع (للتواريخ ورقم الأسبوع)</div>
              <div style={{marginTop:8,fontSize:FS-2,color:T.textMut}}>💡 شيت A وشيت 1 اختياريان</div>
            </div>
            <label style={{display:"block",padding:"30px 20px",borderRadius:14,background:T.bg,border:"2px dashed "+T.accent+"60",textAlign:"center",cursor:"pointer",transition:"all 0.2s"}} onMouseEnter={e=>e.currentTarget.style.background=T.accent+"08"} onMouseLeave={e=>e.currentTarget.style.background=T.bg}>
              <div style={{fontSize:48,marginBottom:10}}>📂</div>
              <div style={{fontSize:FS+1,fontWeight:800,color:T.accent,marginBottom:4}}>اختر ملف Excel</div>
              <div style={{fontSize:FS-2,color:T.textMut}}>.xlsx فقط</div>
              <input type="file" accept=".xlsx,.xls" onChange={e=>{const f=e.target.files?.[0];if(f)handleFile(f)}} style={{display:"none"}}/>
            </label>
          </div>}

          {excelImportStage==="preview"&&excelImportData&&<div>
            {/* Week info */}
            <div style={{padding:"12px 14px",borderRadius:10,background:T.accent+"08",border:"1px solid "+T.accent+"30",marginBottom:12}}>
              <div style={{fontSize:FS,fontWeight:800,color:T.accent,marginBottom:4}}>📅 معلومات الأسبوع</div>
              <div style={{fontSize:FS-1,color:T.textSec}}>
                {excelImportData.weekNumFromFile&&<span>رقم الأسبوع في الإكسيل: <b>W{excelImportData.weekNumFromFile}</b> • </span>}
                التاريخ: <b>{excelImportData.weekStart}</b> → <b>{excelImportData.weekEnd}</b>
              </div>
              <div style={{fontSize:FS-2,color:T.textMut,marginTop:4}}>سيتم إنشاء الأسبوع برقم تلقائي (التالي بعد الأسابيع الموجودة)</div>
            </div>

            {/* Stats */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(3, 1fr)",gap:10,marginBottom:12}}>
              <div style={{padding:"10px",borderRadius:10,background:T.ok+"12",border:"1px solid "+T.ok+"30",textAlign:"center"}}>
                <div style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>✅ مطابق</div>
                <div style={{fontSize:FS+6,fontWeight:900,color:T.ok}}>{matching.matched.length}</div>
              </div>
              <div style={{padding:"10px",borderRadius:10,background:T.warn+"12",border:"1px solid "+T.warn+"30",textAlign:"center"}}>
                <div style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>⚠️ غير مطابق</div>
                <div style={{fontSize:FS+6,fontWeight:900,color:T.warn}}>{matching.unmatched.length}</div>
              </div>
              <div style={{padding:"10px",borderRadius:10,background:T.accent+"12",border:"1px solid "+T.accent+"30",textAlign:"center"}}>
                <div style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>📍 سجلات بصمة</div>
                <div style={{fontSize:FS+6,fontWeight:900,color:T.accent}}>{excelImportData.attendance.length}</div>
              </div>
            </div>

            {/* Unmatched employees with checkbox */}
            {matching.unmatched.length>0&&<div style={{padding:"10px 12px",borderRadius:10,background:T.warn+"06",border:"1px solid "+T.warn+"25",marginBottom:12}}>
              <div style={{fontSize:FS-1,fontWeight:800,color:T.warn,marginBottom:6}}>⚠️ موظفين غير مطابقين ({matching.unmatched.length})</div>
              <div style={{fontSize:FS-2,color:T.textSec,marginBottom:8}}>اختر الموظفين الذين تريد إضافتهم كموظفين جدد. الباقي سيتم تجاهله.</div>
              <div style={{display:"flex",gap:6,marginBottom:8}}>
                <Btn small onClick={()=>{const all={};matching.unmatched.forEach(u=>{all[u.code]=true});setExcelImportNewEmps(all)}} style={{background:T.ok+"15",color:T.ok,border:"1px solid "+T.ok+"30"}}>☑ إضافة الكل</Btn>
                <Btn small onClick={()=>setExcelImportNewEmps({})} style={{background:T.err+"10",color:T.err,border:"1px solid "+T.err+"30"}}>☐ تجاهل الكل</Btn>
              </div>
              <div style={{maxHeight:180,overflowY:"auto",display:"flex",flexDirection:"column",gap:4}}>
                {matching.unmatched.map(u=><div key={u.code} onClick={()=>setExcelImportNewEmps(p=>({...p,[u.code]:!p[u.code]}))} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderRadius:8,cursor:"pointer",background:excelImportNewEmps[u.code]?T.ok+"10":T.bg,border:"1px solid "+(excelImportNewEmps[u.code]?T.ok+"40":T.brd)}}>
                  <span style={{fontSize:16}}>{excelImportNewEmps[u.code]?"☑":"☐"}</span>
                  <div style={{flex:1,fontSize:FS-1}}>
                    <b>{u.name}</b> <span style={{color:T.textMut,fontSize:FS-2}}>#{u.code} • مرتب: {fmt0(u.weeklySalary)} ج</span>
                  </div>
                </div>)}
              </div>
            </div>}

            {/* Summary of what will be imported */}
            <div style={{padding:"10px 12px",borderRadius:10,background:T.bg,border:"1px solid "+T.brd,marginBottom:14,fontSize:FS-1,lineHeight:1.8}}>
              <div style={{fontWeight:800,color:T.text,marginBottom:4}}>📦 ما سيتم استيراده:</div>
              <div>• <b>{matching.matched.length+Object.keys(excelImportNewEmps).filter(c=>excelImportNewEmps[c]).length}</b> موظف (مطابق + جديد)</div>
              <div>• <b>{excelImportData.attendance.length}</b> سجل بصمة</div>
              <div>• السلف والخصومات والحوافز ودفعات الخميس</div>
              <div>• السلف ستُسجل في الخزنة بتاريخ بداية الأسبوع ({excelImportData.weekStart})</div>
              <div style={{marginTop:6,color:T.textMut,fontSize:FS-2}}>الأسبوع سيُنشأ بحالة "مفتوح" للمراجعة قبل الإقفال</div>
            </div>

            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <Btn ghost onClick={close}>إلغاء</Btn>
              <Btn primary onClick={()=>doImport(false)} style={{background:"#10B981",color:"#fff",fontWeight:800}}>✅ استيراد</Btn>
            </div>
          </div>}

          {excelImportStage==="importing"&&<div style={{padding:40,textAlign:"center"}}>
            <div style={{fontSize:48,marginBottom:14}}>⏳</div>
            <div style={{fontSize:FS+1,fontWeight:800,color:T.accent}}>جاري الاستيراد...</div>
          </div>}
        </div>
      </div>;
    })()}

    {/* ══ V15.8: QUICK ENTRY POPUP — bulk data entry for 5 salary fields with persistent tabs ══ */}
    {quickEntryPopup&&openWeek&&(()=>{
      const qe=quickEntryPopup;
      /* Quick entry works only on employees in this week */
      const weekSelected=getSelectedEmps(openWeek.id);
      const shownEmps=activeEmps.filter(e=>weekSelected.includes(e.id));
      /* V15.8: 5 tabs — prevBalance, specialDeduct, installDeduct, bonus, thursdayPay */
      const TYPES=[
        {key:"prevBalance",label:"رصيد سابق",icon:"🔄",color:T.warn,desc:"الرصيد المرحّل من أسابيع سابقة"},
        {key:"specialDeduct",label:"خصم",icon:"📉",color:"#F97316",desc:"خصم من الصافي"},
        {key:"installDeduct",label:"خصم خاص/قسط",icon:"💸",color:T.err,desc:"قسط مديونية (يدوي)"},
        {key:"bonus",label:"حافز",icon:"🎁",color:T.ok,desc:"مكافأة للموظف"},
        {key:"thursdayPay",label:"دفعة من الحساب",icon:"💰",color:"#10B981",desc:"المبلغ الفعلي اللي المحاسب دفعه"}
      ];
      const currentType=TYPES.find(t=>t.key===qe.type)||TYPES[0];
      /* V15.8: current tab data comes from tabData */
      const tabData=qe.tabData||{prevBalance:{selected:{},values:{}},specialDeduct:{selected:{},values:{}},installDeduct:{selected:{},values:{}},bonus:{selected:{},values:{}},thursdayPay:{selected:{},values:{}}};
      const currentTabData=tabData[qe.type]||{selected:{},values:{}};
      /* Get original stored value for an employee based on type */
      const getCurrentVal=(empId)=>{
        if(qe.type==="prevBalance")return salPrevBalanceOverride[empId];
        if(qe.type==="specialDeduct")return salSpecialDeduct[empId];
        if(qe.type==="installDeduct")return salManualInstallDeduct[empId];
        if(qe.type==="bonus")return salBonus[empId];
        if(qe.type==="thursdayPay")return salThursdayPay[empId];
        return undefined;
      };
      /* V15.8: Switch tab WITHOUT losing data (data stored per-tab in tabData) */
      const changeType=(newType)=>{
        setQuickEntryPopup(p=>({...p,type:newType}));
      };
      /* Filter employees by search */
      const q=(qe.search||"").trim().toLowerCase();
      const filtered=q?shownEmps.filter(e=>{
        const name=(e.name||"").toLowerCase();const code=(e.code||"").toLowerCase();const job=(e.job||"").toLowerCase();
        return name.includes(q)||code.includes(q)||job.includes(q);
      }):shownEmps;
      /* Counts and totals for CURRENT tab */
      const selIds=Object.keys(currentTabData.selected).filter(id=>currentTabData.selected[id]);
      const selCount=selIds.length;
      const totalVal=selIds.reduce((s,id)=>s+(Number(currentTabData.values[id])||0),0);
      /* V15.8: total counts across all 5 tabs for status bar */
      const totalAcrossAllTabs=TYPES.reduce((s,t)=>s+Object.keys(tabData[t.key]?.selected||{}).filter(id=>tabData[t.key].selected[id]).length,0);
      /* Select/deselect all (filtered) — ONLY for current tab */
      const toggleAll=()=>{
        const allSelected=filtered.every(e=>currentTabData.selected[e.id]);
        const newSel={...currentTabData.selected};
        filtered.forEach(e=>{if(allSelected)delete newSel[e.id];else newSel[e.id]=true});
        setQuickEntryPopup(p=>({...p,tabData:{...p.tabData,[qe.type]:{...currentTabData,selected:newSel}}}));
      };
      /* Copy to all filtered+selected in current tab */
      const copyToAll=(val)=>{
        const newVals={...currentTabData.values};
        filtered.forEach(e=>{if(currentTabData.selected[e.id])newVals[e.id]=String(val)});
        setQuickEntryPopup(p=>({...p,tabData:{...p.tabData,[qe.type]:{...currentTabData,values:newVals}}}));
      };
      /* V15.8: Save all tabs to state + close popup */
      const doSaveAll=()=>{
        if(totalAcrossAllTabs===0){showToast("⚠️ لا توجد بيانات للحفظ");return}
        /* Map tab key → setter */
        const setters={
          prevBalance:setSalPrevBalanceOverride,
          specialDeduct:setSalSpecialDeduct,
          installDeduct:setSalManualInstallDeduct,
          bonus:setSalBonus,
          thursdayPay:setSalThursdayPay
        };
        let totalSaved=0;
        TYPES.forEach(t=>{
          const td=tabData[t.key]||{selected:{},values:{}};
          const ids=Object.keys(td.selected).filter(id=>td.selected[id]);
          if(ids.length===0)return;
          setters[t.key](prev=>{
            const n={...prev};
            ids.forEach(id=>{
              const v=td.values[id];
              if(v===undefined||v===""||Number(v)===0)delete n[id];
              else n[id]=Number(v);
            });
            return n;
          });
          totalSaved+=ids.length;
        });
        setQuickEntryPopup(null);
        showToast("✅ تم حفظ "+totalSaved+" سجل في الجدول");
      };
      /* Legacy single-tab save (not used in new UI but kept for compat) */
      const doSave=doSaveAll;
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:10001,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={()=>setQuickEntryPopup(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:20,width:"100%",maxWidth:640,maxHeight:"92vh",display:"flex",flexDirection:"column",border:"2px solid #8B5CF6",boxShadow:"0 25px 70px rgba(0,0,0,0.45)"}}>
          {/* Header */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,paddingBottom:12,borderBottom:"2px solid #8B5CF620"}}>
            <div style={{fontSize:FS+3,fontWeight:900,color:"#8B5CF6",display:"flex",alignItems:"center",gap:8}}>
              <span>⚡</span><span>إدخال سريع — W{openWeek.weekNum}</span>
            </div>
            <span onClick={()=>setQuickEntryPopup(null)} style={{cursor:"pointer",fontSize:22,color:T.textMut,padding:4}}>✕</span>
          </div>

          {/* Type selector */}
          <div style={{marginBottom:12}}>
            <div style={{fontSize:FS-2,color:T.textSec,marginBottom:6,fontWeight:700}}>نوع البيان:</div>
            <div style={{display:"grid",gridTemplateColumns:isMob?"repeat(2,1fr)":"repeat(4,1fr)",gap:6}}>
              {TYPES.map(t=><div key={t.key} onClick={()=>changeType(t.key)} style={{padding:"10px 8px",borderRadius:10,border:"2px solid "+(qe.type===t.key?t.color:T.brd),background:qe.type===t.key?t.color+"12":T.bg,cursor:"pointer",transition:"all 0.15s",textAlign:"center"}}>
                <div style={{fontSize:18,marginBottom:2}}>{t.icon}</div>
                <div style={{fontSize:FS-1,fontWeight:800,color:qe.type===t.key?t.color:T.text}}>{t.label}</div>
              </div>)}
            </div>
            <div style={{fontSize:FS-3,color:T.textMut,marginTop:6,padding:"4px 8px"}}>💡 {currentType.desc}</div>
          </div>

          {/* Search + Controls */}
          <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8,flexWrap:"wrap"}}>
            <div style={{flex:1,minWidth:180}}>
              <Inp value={qe.search} onChange={v=>setQuickEntryPopup(p=>({...p,search:v}))} placeholder="🔍 ابحث بالاسم، الكود، الوظيفة..."/>
            </div>
            {/* V14.65: Paste from Excel button */}
            <Btn small onClick={()=>setQuickEntryPopup(p=>({...p,showPaste:!p.showPaste,pasteText:""}))} style={{background:qe.showPaste?"#10B981":"#10B98112",color:qe.showPaste?"#fff":"#10B981",border:"1px solid #10B98130",fontWeight:700,whiteSpace:"nowrap"}} title="نسخ كود + مبلغ من Excel">
              📋 لصق من Excel
            </Btn>
            <Btn small onClick={toggleAll} style={{background:T.bg,color:T.textSec,border:"1px solid "+T.brd,fontWeight:700,whiteSpace:"nowrap"}}>
              {filtered.every(e=>currentTabData.selected[e.id])&&filtered.length>0?"☑ إلغاء الكل":"☐ اختر الكل"}
            </Btn>
            {selCount>0&&<span style={{padding:"5px 10px",borderRadius:8,background:currentType.color+"15",color:currentType.color,fontWeight:800,fontSize:FS-2,whiteSpace:"nowrap"}}>
              المحدد: {selCount}
            </span>}
          </div>

          {/* V14.65: Paste from Excel panel */}
          {qe.showPaste&&(()=>{
            const applyPaste=()=>{
              const text=(qe.pasteText||"").trim();
              if(!text){showToast("⚠️ الصق البيانات أولاً");return}
              const lines=text.split(/\r?\n/).filter(l=>l.trim());
              const matched=[];
              const unmatched=[];
              lines.forEach((line,i)=>{
                /* V15.8 FIX: split only on tab or 2+ spaces (NOT commas — they may be thousand separators like "1,576") */
                const parts=line.split(/\t|\s{2,}/).map(p=>p.trim()).filter(Boolean);
                if(parts.length<2){
                  unmatched.push({line:i+1,raw:line,reason:"سطر غير مفهوم"});
                  return;
                }
                const tryCode=parts[0];
                const tryAmount=parts[parts.length-1];
                const emp=shownEmps.find(e=>(e.code||"").toString().trim()===tryCode.toString().trim());
                if(!emp){
                  const alt=shownEmps.find(e=>(e.code||"").toString().trim()===tryAmount.toString().trim());
                  if(alt){
                    /* Strip thousand separators (comma) before parsing */
                    const amt=Number(tryCode.replace(/,/g,"").replace(/[^\d.-]/g,""));
                    if(!isNaN(amt))matched.push({emp:alt,amount:amt});
                    else unmatched.push({line:i+1,raw:line,reason:"مبلغ غير صحيح"});
                  }else{
                    unmatched.push({line:i+1,raw:line,reason:"كود غير موجود: "+tryCode});
                  }
                  return;
                }
                /* Strip thousand separators (comma) before parsing */
                const amt=Number(tryAmount.replace(/,/g,"").replace(/[^\d.-]/g,""));
                if(isNaN(amt)){unmatched.push({line:i+1,raw:line,reason:"مبلغ غير صحيح"});return}
                matched.push({emp,amount:amt});
              });
              if(matched.length===0){showToast("⚠️ لم يتم التعرف على أي سطر صحيح");return}
              /* V15.8: write paste results to current tab */
              setQuickEntryPopup(p=>{
                const td=p.tabData[qe.type]||{selected:{},values:{}};
                const newSel={...td.selected};const newVals={...td.values};
                matched.forEach(m=>{newSel[m.emp.id]=true;newVals[m.emp.id]=String(m.amount)});
                return{...p,tabData:{...p.tabData,[qe.type]:{...td,selected:newSel,values:newVals}},showPaste:false,pasteText:""};
              });
              showToast("✅ تم لصق "+matched.length+" سطر"+(unmatched.length>0?" ("+unmatched.length+" غير متطابق)":""));
            };
            return<div style={{marginBottom:10,padding:12,borderRadius:10,background:"#10B98108",border:"2px dashed #10B98140"}}>
              <div style={{fontSize:FS-1,fontWeight:800,color:"#10B981",marginBottom:6,display:"flex",alignItems:"center",gap:6}}>
                <span>📋</span><span>لصق من Excel — كود + مبلغ</span>
              </div>
              <div style={{fontSize:FS-2,color:T.textSec,lineHeight:1.7,marginBottom:8}}>
                انسخ عمودين من Excel: <b>الكود</b> ثم <b>المبلغ</b>. كل سطر موظف واحد.
              </div>
              <textarea value={qe.pasteText||""} onChange={ev=>setQuickEntryPopup(p=>({...p,pasteText:ev.target.value}))} placeholder={"1466\t200\n1477\t150\n1493\t300\n..."} rows={4} style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid "+T.brd,fontSize:FS,fontFamily:"monospace",background:T.inputBg,color:T.text,resize:"vertical",direction:"ltr",textAlign:"left",boxSizing:"border-box"}}/>
              <div style={{display:"flex",gap:8,marginTop:8,justifyContent:"flex-end"}}>
                <Btn small ghost onClick={()=>setQuickEntryPopup(p=>({...p,showPaste:false,pasteText:""}))}>إلغاء</Btn>
                <Btn small onClick={applyPaste} style={{background:"#10B981",color:"#fff",border:"none",fontWeight:800}}>✅ تطبيق اللصق</Btn>
              </div>
            </div>;
          })()}

          {/* Employees list */}
          <div style={{flex:1,overflowY:"auto",background:T.bg,borderRadius:10,border:"1px solid "+T.brd,padding:4,minHeight:200}}>
            {filtered.length===0?<div style={{padding:40,textAlign:"center",color:T.textMut,fontSize:FS-1}}>لا توجد نتائج</div>:
              filtered.map(e=>{
                const isSel=!!currentTabData.selected[e.id];
                const existingVal=getCurrentVal(e.id);
                const hasExisting=existingVal!==undefined&&existingVal!==""&&Number(existingVal)!==0;
                /* V15.8: toggle helpers that write to tabData[qe.type] */
                const toggleSel=()=>setQuickEntryPopup(p=>{
                  const td=p.tabData[qe.type]||{selected:{},values:{}};
                  const newSel={...td.selected};if(newSel[e.id])delete newSel[e.id];else newSel[e.id]=true;
                  return{...p,tabData:{...p.tabData,[qe.type]:{...td,selected:newSel}}};
                });
                const setVal=(v)=>setQuickEntryPopup(p=>{
                  const td=p.tabData[qe.type]||{selected:{},values:{}};
                  const newVals={...td.values,[e.id]:v};
                  const newSel={...td.selected};
                  if(v!==""&&Number(v)!==0)newSel[e.id]=true;
                  return{...p,tabData:{...p.tabData,[qe.type]:{...td,selected:newSel,values:newVals}}};
                });
                return<div key={e.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:8,background:isSel?currentType.color+"06":"transparent",borderBottom:"1px solid "+T.brd,transition:"background 0.12s"}}>
                  {/* Checkbox */}
                  <div onClick={toggleSel} style={{cursor:"pointer",width:22,height:22,borderRadius:6,border:"2px solid "+(isSel?currentType.color:T.brd),background:isSel?currentType.color:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:14,color:"#fff",fontWeight:900}}>
                    {isSel?"✓":""}
                  </div>
                  {/* Name + code */}
                  <div style={{flex:1,minWidth:0}} onClick={toggleSel}>
                    <div style={{fontSize:FS-1,fontWeight:700,color:T.text,cursor:"pointer"}}>
                      {e.name}
                      {e.code?<span style={{color:T.textMut,fontSize:FS-3,marginInlineStart:6}}>#{e.code}</span>:""}
                      {hasExisting&&!isSel?<span style={{marginInlineStart:6,padding:"1px 6px",borderRadius:4,background:currentType.color+"15",color:currentType.color,fontSize:FS-3,fontWeight:700}}>موجود: {fmt0(existingVal)}</span>:null}
                    </div>
                    {e.job?<div style={{fontSize:FS-3,color:T.textMut}}>{e.job}</div>:null}
                  </div>
                  {/* Input */}
                  <div style={{flexShrink:0,display:"flex",gap:4,alignItems:"center"}}>
                    <input type="number" inputMode="decimal" value={currentTabData.values[e.id]||""} onChange={ev=>setVal(ev.target.value)} placeholder="0" style={{width:90,padding:"7px 10px",borderRadius:8,border:"1px solid "+(isSel?currentType.color+"50":T.brd),fontSize:FS-1,fontFamily:"inherit",background:T.inputBg,color:T.text,textAlign:"center",fontWeight:700,boxSizing:"border-box",direction:"ltr"}}/>
                    <span style={{fontSize:FS-3,color:T.textMut,minWidth:24}}>ج.م</span>
                    {/* Copy to all button (only for first row) */}
                    {filtered.indexOf(e)===0&&currentTabData.values[e.id]&&selCount>1&&<button onClick={()=>copyToAll(currentTabData.values[e.id])} title="نسخ لكل المحدد" style={{padding:"4px 8px",borderRadius:6,border:"1px solid "+T.accent+"40",background:T.accent+"12",color:T.accent,fontSize:FS-3,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                      📋
                    </button>}
                  </div>
                </div>;
              })}
          </div>

          {/* Summary + Actions */}
          <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid "+T.brd}}>
            {selCount>0&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,padding:"8px 12px",borderRadius:8,background:currentType.color+"08",border:"1px solid "+currentType.color+"25"}}>
              <span style={{fontSize:FS-1,color:T.textSec,fontWeight:600}}>
                في هذا التاب: <b style={{color:currentType.color,fontSize:FS+1}}>{fmt0(r2(totalVal))}</b> ج.م لـ <b style={{color:currentType.color}}>{selCount}</b> موظف
              </span>
              <span style={{fontSize:FS-3,color:T.textMut}}>متوسط: {selCount>0?fmt0(r2(totalVal/selCount)):0} ج.م</span>
            </div>}
            {/* V15.8: Summary of ALL tabs (so user knows what will be saved) */}
            {totalAcrossAllTabs>0&&<div style={{marginBottom:10,padding:"8px 12px",borderRadius:8,background:T.accent+"06",border:"1px dashed "+T.accent+"40",fontSize:FS-2,color:T.textSec}}>
              <div style={{fontWeight:700,color:T.text,marginBottom:4}}>📊 ملخص كل التابات:</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                {TYPES.map(t=>{
                  const td=tabData[t.key]||{selected:{},values:{}};
                  const n=Object.keys(td.selected).filter(id=>td.selected[id]).length;
                  if(n===0)return null;
                  return<span key={t.key} style={{padding:"3px 8px",borderRadius:6,background:t.color+"18",color:t.color,fontWeight:700}}>{t.icon} {t.label}: {n}</span>;
                })}
              </div>
            </div>}
            <div style={{display:"flex",gap:8,justifyContent:"flex-end",flexWrap:"wrap"}}>
              <Btn ghost onClick={()=>setQuickEntryPopup(null)}>إلغاء</Btn>
              <Btn onClick={doSaveAll} disabled={totalAcrossAllTabs===0} style={{background:totalAcrossAllTabs>0?"#8B5CF6":"#8B5CF640",color:"#fff",border:"none",fontWeight:800,padding:"10px 24px",cursor:totalAcrossAllTabs>0?"pointer":"not-allowed"}}>
                💾 حفظ كل البيانات في الجدول ({totalAcrossAllTabs})
              </Btn>
            </div>
          </div>
        </div>
      </div>;
    })()}

    {/* ══ V14.66: PRE-APPROVAL BLOCKER — prevents closing week when employees haven't signed ══ */}
    {preApprovalBlocker&&(()=>{
      const pb=preApprovalBlocker;
      const w=pb.week;
      const notSigned=pb.notSigned||[];
      const totalUnsigned=notSigned.reduce((s,e)=>{const c=calcSalary(e.id,w);return s+(c?c.thursdayPay:0)},0);
      const requiredText="تأكيد الإقفال";
      const canOverride=overrideConfirmText.trim()===requiredText;
      const close=()=>{setPreApprovalBlocker(null);setOverrideConfirmText("")};
      const copyList=()=>{
        const text=notSigned.map(e=>{const c=calcSalary(e.id,w);return e.name+(e.code?" (#"+e.code+")":"")+" — "+fmt0(c?c.thursdayPay:0)+" ج"}).join("\n");
        try{navigator.clipboard.writeText(text);showToast("✅ تم نسخ القائمة")}catch(e){showToast("⚠️ تعذر النسخ")}
      };
      const doOverride=()=>{
        if(!canOverride){showToast("⚠️ اكتب كلمة التأكيد بالضبط");return}
        close();
        /* Pass override reason to approveWeek */
        approveWeek(pb.customCloseDate,"تخطي التحقق من التوقيعات — "+notSigned.length+" موظف بدون توقيع");
      };
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(220,38,38,0.15)",zIndex:10003,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={close}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:22,width:"100%",maxWidth:580,maxHeight:"92vh",overflowY:"auto",border:"3px solid "+T.err,boxShadow:"0 25px 70px rgba(220,38,38,0.35)"}}>
          {/* Header */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,paddingBottom:10,borderBottom:"2px solid "+T.err+"30"}}>
            <div style={{fontSize:FS+3,fontWeight:900,color:T.err,display:"flex",alignItems:"center",gap:8}}>
              <span>🚫</span><span>لا يمكن الإقفال</span>
            </div>
            <span onClick={close} style={{cursor:"pointer",fontSize:22,color:T.textMut,padding:4}}>✕</span>
          </div>

          {/* Warning message */}
          <div style={{padding:14,borderRadius:12,background:T.err+"08",border:"2px solid "+T.err+"25",marginBottom:14,display:"flex",gap:12}}>
            <span style={{fontSize:28,flexShrink:0}}>⚠️</span>
            <div style={{fontSize:FS,color:T.text,lineHeight:1.7}}>
              <b style={{color:T.err}}>يوجد {notSigned.length} موظف لم يوقّعوا</b> على استلام المرتب.<br/>
              <span style={{fontSize:FS-1,color:T.textSec}}>المحاسب الثاني لم يسجّل توقيعهم الإلكتروني بالـ QR بعد.</span>
            </div>
          </div>

          {/* List */}
          <div style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <span style={{fontSize:FS-1,fontWeight:700,color:T.textSec}}>الموظفين بدون توقيع:</span>
              <Btn small onClick={copyList} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30",fontSize:FS-2,padding:"3px 10px",fontWeight:700}}>📋 نسخ القائمة</Btn>
            </div>
            <div style={{maxHeight:200,overflowY:"auto",background:T.bg,borderRadius:10,border:"1px solid "+T.brd}}>
              {notSigned.map((e,i)=>{const c=calcSalary(e.id,w);
                return<div key={e.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",borderBottom:i===notSigned.length-1?"none":"1px solid "+T.brd,background:i%2===0?"transparent":T.cardSolid}}>
                  <div>
                    <div style={{fontSize:FS-1,fontWeight:700,color:T.text}}>{e.name}</div>
                    <div style={{fontSize:FS-3,color:T.textMut}}>{e.code?"#"+e.code:""}{e.job?" • "+e.job:""}</div>
                  </div>
                  <div style={{fontSize:FS,fontWeight:800,color:T.err,fontFamily:"monospace"}}>{fmt0(c?c.thursdayPay:0)} ج</div>
                </div>;
              })}
            </div>
            <div style={{display:"flex",justifyContent:"flex-end",padding:"6px 12px 0",fontSize:FS-1,color:T.textSec}}>
              الإجمالي: <b style={{color:T.err,fontFamily:"monospace",marginInlineStart:6}}>{fmt0(totalUnsigned)} ج</b>
            </div>
          </div>

          {/* Recommendation */}
          <div style={{padding:10,borderRadius:10,background:T.ok+"06",border:"1px solid "+T.ok+"25",marginBottom:14,fontSize:FS-1,color:T.text,lineHeight:1.6}}>
            💡 <b>التوصية:</b> اطلب من المحاسب الثاني يسجّل توقيع هؤلاء الموظفين بالـ QR قبل الإقفال.<br/>
            <span style={{fontSize:FS-2,color:T.textMut}}>يمكنه فتح تاب "🔐 تأكيد الاستلام" والسكان الآن.</span>
          </div>

          {/* Override section — hidden until user expands */}
          <details style={{marginBottom:14}}>
            <summary style={{cursor:"pointer",padding:10,borderRadius:10,background:T.warn+"08",border:"1px dashed "+T.warn+"40",fontSize:FS-1,fontWeight:700,color:T.warn}}>
              ⚠️ تجاوز وإقفال (للطوارئ فقط) — اضغط للعرض
            </summary>
            <div style={{padding:12,borderRadius:10,background:T.err+"04",border:"2px dashed "+T.err+"40",marginTop:8}}>
              <div style={{fontSize:FS-1,color:T.text,lineHeight:1.7,marginBottom:10}}>
                <b style={{color:T.err}}>تحذير:</b> الإقفال بدون توقيع كامل <b>عملية خطرة</b> وستُسجّل في Audit Log بوضوح.<br/>
                <span style={{fontSize:FS-2,color:T.textMut}}>قد تُؤدي لنزاع مع الموظفين أو اتهامات باختلاس.</span>
              </div>
              <div style={{fontSize:FS-1,color:T.text,marginBottom:6}}>
                للتأكيد، اكتب: <code style={{fontFamily:"monospace",background:T.bg,padding:"2px 8px",borderRadius:4,fontWeight:800,color:T.err}}>{requiredText}</code>
              </div>
              <input type="text" value={overrideConfirmText} onChange={e=>setOverrideConfirmText(e.target.value)} placeholder="اكتب كلمة التأكيد..." style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"2px solid "+(canOverride?T.ok:T.err+"40"),fontSize:FS,fontFamily:"inherit",background:T.inputBg,color:T.text,textAlign:"center",fontWeight:700,boxSizing:"border-box"}}/>
              <Btn onClick={doOverride} disabled={!canOverride} style={{background:canOverride?T.err:T.err+"40",color:"#fff",border:"none",fontWeight:900,padding:"12px 20px",fontSize:FS+1,width:"100%",marginTop:10,cursor:canOverride?"pointer":"not-allowed"}}>
                🚨 تخطي والإقفال على مسؤوليتي
              </Btn>
            </div>
          </details>

          {/* Actions */}
          <div style={{display:"flex",gap:8,justifyContent:"flex-end",paddingTop:12,borderTop:"1px solid "+T.brd}}>
            <Btn onClick={close} style={{background:T.accent,color:"#fff",border:"none",fontWeight:800,padding:"10px 24px",fontSize:FS+1}}>✓ فهمت، إلغاء الإقفال</Btn>
          </div>
        </div>
      </div>;
    })()}

    {/* ══ V15.72: BULK WORKSHOP PAYMENTS POPUP — all workshops in one screen ══ */}
    {showWsBulkPopup&&openWeek&&(()=>{
      /* Get all external workshops with their data */
      const wsData=workshopsList.filter(w=>_wsIsExternal(w.name||w)).map(w=>{
        const bal=wsTotalBalance(w.name);
        const weekDue=wsWeekDue(w.name,openWeek);
        const pct=Number(w.payPercent)||60;
        const limit=r2(((bal.due||0)+(bal.purchase||0))*pct/100);
        return{
          name:w.name,owner:w.owner||"",
          balance:bal.balance,paid:bal.paid,due:bal.due,purchase:bal.purchase||0,
          pct,limit,weekDue,
          amount:Number(wsBulkAmounts[w.name])||0,
        };
      });
      /* Filter to only show workshops with a positive balance (owed money) by default,
         but let user see all if they want */
      const withBalance=wsData.filter(w=>w.balance>0);
      const withoutBalance=wsData.filter(w=>w.balance<=0);
      const bulkTotal=Object.values(wsBulkAmounts).reduce((s,v)=>s+(Number(v)||0),0);
      const bulkCount=Object.values(wsBulkAmounts).filter(v=>Number(v)>0).length;
      /* V15.74: Count existing planned payments for comparison */
      const prevPlanned=(openWeek.weeklyWsPayments||[]).filter(p=>p.type==="payment"&&!p.treasuryTxId);
      const prevCount=prevPlanned.length;
      const prevTotal=prevPlanned.reduce((s,p)=>s+(Number(p.amount)||0),0);
      const hasChanges=bulkCount!==prevCount||Math.abs(bulkTotal-prevTotal)>0.5;
      /* Helper: apply percentage limit to all workshops with balance */
      const applyAllLimits=()=>{
        const newAmounts={...wsBulkAmounts};
        withBalance.forEach(w=>{
          if(w.weekDue>0)newAmounts[w.name]=String(w.weekDue);
        });
        setWsBulkAmounts(newAmounts);
      };
      /* Helper: clear all amounts */
      const clearAll=()=>setWsBulkAmounts({});
      /* Helper: update single amount */
      const updateAmount=(wsName,val)=>{
        setWsBulkAmounts(p=>{const n={...p};if(!val||Number(val)<=0)delete n[wsName];else n[wsName]=val;return n});
      };
      return <div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowWsBulkPopup(false)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,width:"100%",maxWidth:isMob?"100%":900,maxHeight:"92vh",display:"flex",flexDirection:"column",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          {/* Header */}
          <div style={{padding:"16px 22px",borderBottom:"1px solid "+T.brd,background:"linear-gradient(135deg,#8B5CF608,#7C3AED08)",borderRadius:"20px 20px 0 0",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
            <div>
              <div style={{fontSize:FS+2,fontWeight:900,color:"#8B5CF6",marginBottom:2}}>💸 تسجيل دفعات الورش — W{openWeek.weekNum}</div>
              <div style={{fontSize:FS-2,color:T.textMut}}>اكتب المبالغ اللي هتنزل لكل ورشة. الإجمالي هيظهر تحت.</div>
            </div>
            <Btn ghost small onClick={()=>setShowWsBulkPopup(false)}>✕</Btn>
          </div>

          {/* Quick actions toolbar */}
          <div style={{padding:"10px 22px",borderBottom:"1px solid "+T.brd,background:T.bg,display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
            <div style={{fontSize:FS-2,color:T.textSec,fontWeight:700,marginInlineEnd:"auto"}}>
              {withBalance.length} ورشة عليها فلوس • {withoutBalance.length} مدفوع لها بالكامل
            </div>
            <Btn small onClick={applyAllLimits} style={{background:"#10B98112",color:"#10B981",border:"1px solid #10B98130",fontWeight:700,fontSize:FS-2}}>⚡ استخدم حد النسبة للكل</Btn>
            <Btn small onClick={clearAll} style={{background:T.bg,color:T.textSec,border:"1px solid "+T.brd,fontSize:FS-2}}>🗑️ مسح الكل</Btn>
          </div>

          {/* Body — scrollable table */}
          <div style={{flex:1,overflowY:"auto",padding:"12px 22px"}}>
            {/* Workshops WITH balance — priority list */}
            {withBalance.length>0?<div>
              <div style={{fontSize:FS-1,fontWeight:800,color:T.err,marginBottom:8,padding:"6px 10px",background:T.err+"08",borderRadius:8,display:"inline-block"}}>
                ⚠️ ورش عليها فلوس ({withBalance.length})
              </div>
              <div style={{overflowX:"auto",borderRadius:10,border:"1px solid "+T.brd}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:FS-1}}>
                  <thead>
                    <tr style={{background:T.bg}}>
                      <th style={{padding:"10px 8px",textAlign:"right",fontWeight:800,color:T.textSec,borderBottom:"2px solid "+T.brd,minWidth:140}}>الورشة</th>
                      <th style={{padding:"10px 8px",textAlign:"center",fontWeight:800,color:T.textSec,borderBottom:"2px solid "+T.brd}}>الرصيد</th>
                      <th style={{padding:"10px 8px",textAlign:"center",fontWeight:800,color:T.textSec,borderBottom:"2px solid "+T.brd}}>المدفوع</th>
                      <th style={{padding:"10px 8px",textAlign:"center",fontWeight:800,color:T.textSec,borderBottom:"2px solid "+T.brd}}>حد النسبة</th>
                      <th style={{padding:"10px 8px",textAlign:"center",fontWeight:800,color:"#8B5CF6",borderBottom:"2px solid "+T.brd,minWidth:130}}>💰 المبلغ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {withBalance.map((w,i)=>{
                      const amt=Number(wsBulkAmounts[w.name])||0;
                      const overLimit=w.weekDue>0&&amt>w.weekDue;
                      return <tr key={w.name} style={{background:i%2===0?"transparent":T.bg+"50",borderBottom:"1px solid "+T.brd}}>
                        <td style={{padding:"8px"}}>
                          <div style={{fontWeight:700,color:T.text}}>{w.name}</div>
                          {w.owner&&<div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>{w.owner}</div>}
                        </td>
                        <td style={{padding:"8px",textAlign:"center",fontWeight:800,color:T.err}}>{fmt0(w.balance)}</td>
                        <td style={{padding:"8px",textAlign:"center",color:T.textSec}}>{fmt0(w.paid)}</td>
                        <td style={{padding:"8px",textAlign:"center"}}>
                          {w.weekDue>0?<div>
                            <div style={{fontWeight:800,color:"#8B5CF6"}}>{fmt0(w.weekDue)}</div>
                            <div style={{fontSize:FS-3,color:T.textMut}}>{w.pct}%</div>
                          </div>:<span style={{color:T.ok,fontWeight:700,fontSize:FS-2}}>✓ تم</span>}
                        </td>
                        <td style={{padding:"8px",textAlign:"center"}}>
                          <input
                            type="number" inputMode="decimal"
                            value={wsBulkAmounts[w.name]||""}
                            onChange={e=>updateAmount(w.name,e.target.value)}
                            placeholder="0"
                            style={{
                              width:110,padding:"8px 10px",borderRadius:8,
                              border:"2px solid "+(overLimit?T.warn:amt>0?"#8B5CF6":T.brd),
                              background:amt>0?"#8B5CF608":T.inputBg,
                              textAlign:"center",fontWeight:800,fontSize:FS,
                              color:overLimit?T.warn:amt>0?"#8B5CF6":T.text,
                              fontFamily:"inherit",outline:"none",
                            }}
                          />
                          {overLimit&&<div style={{fontSize:FS-4,color:T.warn,marginTop:2,fontWeight:700}}>⚠️ فوق الحد</div>}
                        </td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
            </div>:<div style={{padding:"30px",textAlign:"center",color:T.textMut,background:T.bg,borderRadius:10}}>
              <div style={{fontSize:30,marginBottom:8}}>✅</div>
              <div style={{fontSize:FS}}>كل الورش مدفوع لها بالكامل</div>
            </div>}

            {/* Workshops WITHOUT balance (collapsed, optional) */}
            {withoutBalance.length>0&&<details style={{marginTop:14}}>
              <summary style={{cursor:"pointer",padding:"8px 12px",background:T.bg,borderRadius:8,fontSize:FS-2,color:T.textSec,fontWeight:700}}>
                ↓ عرض الورش اللي مفيش عليها فلوس ({withoutBalance.length})
              </summary>
              <div style={{marginTop:10,overflowX:"auto",borderRadius:10,border:"1px solid "+T.brd}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:FS-1}}>
                  <thead><tr style={{background:T.bg}}>
                    <th style={{padding:"8px",textAlign:"right",fontWeight:800,color:T.textSec}}>الورشة</th>
                    <th style={{padding:"8px",textAlign:"center",fontWeight:800,color:T.textSec}}>الرصيد</th>
                    <th style={{padding:"8px",textAlign:"center",fontWeight:800,color:"#8B5CF6",minWidth:130}}>💰 المبلغ (اختياري)</th>
                  </tr></thead>
                  <tbody>
                    {withoutBalance.map((w,i)=><tr key={w.name} style={{background:i%2===0?"transparent":T.bg+"50"}}>
                      <td style={{padding:"8px",color:T.textSec}}>{w.name}</td>
                      <td style={{padding:"8px",textAlign:"center",color:T.ok,fontWeight:700}}>✓ {fmt0(w.balance)}</td>
                      <td style={{padding:"8px",textAlign:"center"}}>
                        <input type="number" inputMode="decimal" value={wsBulkAmounts[w.name]||""} onChange={e=>updateAmount(w.name,e.target.value)} placeholder="0"
                          style={{width:110,padding:"6px 10px",borderRadius:8,border:"1px solid "+T.brd,background:T.inputBg,textAlign:"center",fontWeight:700,fontSize:FS-1,fontFamily:"inherit",outline:"none"}}/>
                      </td>
                    </tr>)}
                  </tbody>
                </table>
              </div>
            </details>}

            {/* Optional note */}
            <div style={{marginTop:14}}>
              <label style={{fontSize:FS-2,color:T.textSec,fontWeight:700,display:"block",marginBottom:4}}>📝 ملاحظة (اختيارية — هتتطبق على كل الدفعات)</label>
              <Inp type="text" value={wsBulkNote} onChange={e=>setWsBulkNote(e.target.value)} placeholder="مثل: دفعة الأسبوع 17"/>
            </div>
          </div>

          {/* Footer — summary + actions */}
          <div style={{padding:"14px 22px",borderTop:"1px solid "+T.brd,background:T.bg,borderRadius:"0 0 20px 20px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
              <div style={{display:"flex",gap:14,alignItems:"center",flexWrap:"wrap"}}>
                <div>
                  <div style={{fontSize:FS-3,color:T.textMut,fontWeight:700}}>عدد الدفعات</div>
                  <div style={{fontSize:FS+2,fontWeight:900,color:"#8B5CF6"}}>{bulkCount}</div>
                </div>
                <div style={{width:1,height:34,background:T.brd}}/>
                <div>
                  <div style={{fontSize:FS-3,color:T.textMut,fontWeight:700}}>الإجمالي</div>
                  <div style={{fontSize:FS+4,fontWeight:900,color:bulkTotal>0?"#10B981":T.textMut}}>{fmt0(bulkTotal)} ج</div>
                </div>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                {hasChanges&&<span style={{fontSize:FS-3,color:T.warn,fontWeight:700,padding:"4px 8px",borderRadius:6,background:T.warn+"12"}}>● فيه تعديلات</span>}
                <Btn onClick={()=>setShowWsBulkPopup(false)} style={{background:T.bg,color:T.textSec,border:"1px solid "+T.brd}}>إلغاء</Btn>
                <Btn onClick={saveBulkWsPayments} disabled={!hasChanges} style={{background:hasChanges?"#8B5CF6":T.bg,color:hasChanges?"#fff":T.textMut,border:"none",fontWeight:800,fontSize:FS}}>
                  {bulkCount===0&&prevCount>0?"🗑️ مسح كل الدفعات":"✓ حفظ الدفعات ("+bulkCount+")"}
                </Btn>
              </div>
            </div>
          </div>
        </div>
      </div>;
    })()}

    {/* ══ V14.55: CLEAN DELETE WEEK POPUP ══ */}
    {cleanDeletePopup&&(()=>{const cd=cleanDeletePopup;const w=cd.week;
      const executeCleanDelete=()=>{
        upConfig(d=>{
          const wi=(d.hrWeeks||[]).findIndex(x=>x.id===w.id);
          if(wi<0)return;
          /* 1. Capture prevBalance restoration data from snapshot if available */
          const snapshot=(d.hrWeeks||[])[wi];
          /* 2. Delete treasury entries linked to this week (salaries + advances) */
          d.treasury=(d.treasury||[]).filter(t=>!(t.weekId===w.id&&(t.sourceType==="hr_salary"||t.sourceType==="hr_weekly_advance"||t.sourceType==="hr_advance")));
          /* 3. Delete hrLog entries linked to this week */
          d.hrLog=(d.hrLog||[]).filter(l=>!(l.weekId===w.id&&(l.type==="salary"||l.type==="advance"||l.type==="weekly_advance")));
          /* 4. Clear debt partial payments for this week */
          (d.empDebts||[]).forEach(debt=>{
            if(debt.partialPayments&&debt.partialPayments[w.id]){
              delete debt.partialPayments[w.id];
              /* Reset status to active if it was marked paid due to this week */
              if(debt.status==="paid")debt.status="active";
            }
          });
          /* 5. Restore prevBalance for each affected employee */
          const empIds=(snapshot.selectedEmps||[]);
          /* V14.65: ENHANCED FIX — find the last closed week BEFORE the deleted one.
             If found, use its remainingBalance as the new prevBalance (the TRUE value).
             This fixes the bug where prevBalance remained inflated after deleting a closed week. */
          const allClosedWeeks=(d.hrWeeks||[]).filter(x=>x.status==="closed"&&x.id!==w.id).sort((a,b)=>{
            /* Sort by weekEnd DESC (most recent closed first) */
            return (b.weekEnd||"").localeCompare(a.weekEnd||"");
          });
          /* Find the most recent closed week that ended BEFORE the deleted week started */
          const prevClosedWeek=allClosedWeeks.find(x=>(x.weekEnd||"")<(snapshot.weekStart||""));
          empIds.forEach(eid=>{
            const emp=(d.employees||[]).find(x=>x.id===eid);
            if(!emp)return;
            /* Priority 1: Use prevClosedWeek's remainingBalance (most accurate) */
            if(prevClosedWeek&&Array.isArray(prevClosedWeek.closedRecords)){
              const prevRec=prevClosedWeek.closedRecords.find(r=>r.empId===eid);
              if(prevRec){
                emp.prevBalance=Number(prevRec.remainingBalance)||0;
                return;
              }
            }
            /* Priority 2: Use deleted week's closedRecords.prevBalance (the value BEFORE it was closed) */
            if(Array.isArray(snapshot.closedRecords)){
              const rec=snapshot.closedRecords.find(r=>r.empId===eid);
              if(rec){emp.prevBalance=Number(rec.prevBalance)||0;return}
            }
            /* Priority 3: No data available — reset to 0 as safe fallback */
            emp.prevBalance=0;
          });
          /* 6. Audit log — full impact */
          if(!Array.isArray(d.auditLog))d.auditLog=[];
          d.auditLog.unshift({
            id:Math.random().toString(36).slice(2)+Date.now(),
            category:"week",
            action:"clean_delete",
            target:"W"+w.weekNum+" ("+w.weekStart+" → "+w.weekEnd+")",
            newValue:"حذف كامل: "+cd.empCount+" موظف • "+cd.linkedTreasurySalaries.length+" مرتب ("+fmt0(cd.totalSalaries)+" ج) • "+cd.linkedTreasuryAdvances.length+" سلفة ("+fmt0(cd.totalAdvances)+" ج)",
            notes:"استعادة prevBalance لـ "+empIds.length+" موظف + تنظيف "+cd.debtsWithPayment.length+" قسط",
            at:new Date().toISOString(),
            severity:"warning"
          });
          /* 7. Finally, delete the week itself */
          d.hrWeeks=(d.hrWeeks||[]).filter(x=>x.id!==w.id);
        });
        if(previewWeekId===w.id)setPreviewWeekId(null);
        setCleanDeletePopup(null);
        showToast("✅ تم الحذف والتنظيف الكامل لأسبوع W"+w.weekNum);
      };
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",zIndex:10002,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={()=>setCleanDeletePopup(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:22,width:"100%",maxWidth:640,maxHeight:"92vh",overflowY:"auto",border:"2px solid "+T.err,boxShadow:"0 25px 70px rgba(0,0,0,0.5)"}}>
          {/* Header */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,paddingBottom:12,borderBottom:"2px solid "+T.err+"30"}}>
            <div style={{fontSize:FS+3,fontWeight:900,color:T.err,display:"flex",alignItems:"center",gap:8}}>
              <span>🧹</span><span>حذف وتنظيف كامل — W{w.weekNum}</span>
            </div>
            <span onClick={()=>setCleanDeletePopup(null)} style={{cursor:"pointer",fontSize:20,color:T.textMut}}>✕</span>
          </div>

          {/* Step 0: Impact preview */}
          {cd.confirmStep===0&&<div>
            <div style={{padding:12,borderRadius:10,background:T.warn+"08",border:"1px solid "+T.warn+"30",marginBottom:14,display:"flex",gap:10}}>
              <span style={{fontSize:22,flexShrink:0}}>⚠️</span>
              <div style={{fontSize:FS-1,color:T.text,lineHeight:1.7}}>
                <b style={{color:T.warn}}>تحذير مهم:</b> هذه العملية <b>لا يمكن التراجع عنها</b>. 
                سيتم حذف الأسبوع بالكامل <b>مع كل الحركات المالية المرتبطة به</b> في الخزنة والسجلات.
              </div>
            </div>

            <div style={{fontSize:FS+1,fontWeight:800,color:T.text,marginBottom:10,paddingBottom:8,borderBottom:"1px solid "+T.brd}}>
              📋 ملخص ما سيتم حذفه:
            </div>

            {/* Grid of impact stats */}
            <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:10,marginBottom:14}}>
              {/* Week data */}
              <div style={{padding:12,borderRadius:10,background:T.bg,border:"1px solid "+T.brd}}>
                <div style={{fontSize:FS-2,color:T.textMut,fontWeight:600,marginBottom:6}}>📅 بيانات الأسبوع</div>
                <div style={{fontSize:FS-1,lineHeight:1.9}}>
                  <div>• الموظفين في الأسبوع: <b style={{color:T.accent}}>{cd.empCount}</b></div>
                  <div>• سجلات البصمة/الحضور: <b style={{color:T.accent}}>{cd.attendanceCount}</b></div>
                  <div>• سجلات المرتبات (hrLog): <b style={{color:T.accent}}>{cd.linkedHrSalary.length}</b></div>
                </div>
              </div>

              {/* Treasury movements */}
              <div style={{padding:12,borderRadius:10,background:T.err+"06",border:"1px solid "+T.err+"20"}}>
                <div style={{fontSize:FS-2,color:T.textMut,fontWeight:600,marginBottom:6}}>💰 حركات الخزنة</div>
                <div style={{fontSize:FS-1,lineHeight:1.9}}>
                  <div>• مرتبات موظفين: <b style={{color:T.err}}>{cd.linkedTreasurySalaries.length}</b> حركة</div>
                  <div style={{paddingInlineStart:10,fontSize:FS-2,color:T.textMut}}>بإجمالي {fmt0(cd.totalSalaries)} ج.م</div>
                  <div>• سلف أسبوعية: <b style={{color:T.err}}>{cd.linkedTreasuryAdvances.length}</b> حركة</div>
                  <div style={{paddingInlineStart:10,fontSize:FS-2,color:T.textMut}}>بإجمالي {fmt0(cd.totalAdvances)} ج.م</div>
                </div>
              </div>

              {/* HR advances */}
              <div style={{padding:12,borderRadius:10,background:"#8B5CF608",border:"1px solid #8B5CF620"}}>
                <div style={{fontSize:FS-2,color:T.textMut,fontWeight:600,marginBottom:6}}>📝 سجلات الإدارة (hrLog)</div>
                <div style={{fontSize:FS-1,lineHeight:1.9}}>
                  <div>• سلف موظفين عاديين: <b style={{color:"#8B5CF6"}}>{cd.linkedHrAdvances.length}</b></div>
                  <div>• سلف إدارة/شهريين: <b style={{color:"#8B5CF6"}}>{cd.linkedHrWeeklyAdv.length}</b></div>
                </div>
              </div>

              {/* Debts */}
              <div style={{padding:12,borderRadius:10,background:T.warn+"08",border:"1px solid "+T.warn+"20"}}>
                <div style={{fontSize:FS-2,color:T.textMut,fontWeight:600,marginBottom:6}}>📉 أقساط المديونيات</div>
                <div style={{fontSize:FS-1,lineHeight:1.9}}>
                  <div>• مديونيات فيها قسط لهذا الأسبوع: <b style={{color:T.warn}}>{cd.debtsWithPayment.length}</b></div>
                  <div style={{fontSize:FS-2,color:T.textMut,marginTop:3}}>سيتم تصفير قسط هذا الأسبوع فقط</div>
                </div>
              </div>
            </div>

            {/* Restoration info */}
            <div style={{padding:12,borderRadius:10,background:T.ok+"06",border:"1px solid "+T.ok+"20",marginBottom:14}}>
              <div style={{fontSize:FS,fontWeight:800,color:T.ok,marginBottom:6}}>✅ سيتم استرجاع:</div>
              <div style={{fontSize:FS-1,lineHeight:1.8,color:T.text}}>
                • رصيد سابق (prevBalance) لـ <b>{cd.empCount}</b> موظف
                {!Array.isArray(w.closedRecords)&&<div style={{fontSize:FS-2,color:T.warn,marginTop:4}}>⚠️ الأسبوع بدون snapshot — الرصيد السابق للموظفين لن يُسترجع تلقائياً</div>}
              </div>
            </div>

            {/* Confirm checkbox */}
            <div style={{padding:14,borderRadius:10,background:T.err+"08",border:"2px dashed "+T.err+"40",marginBottom:14}}>
              <div style={{fontSize:FS-1,color:T.text,marginBottom:10,lineHeight:1.7}}>
                <b style={{color:T.err}}>للمتابعة:</b> اكتب <b style={{fontFamily:"monospace",background:T.bg,padding:"2px 8px",borderRadius:4}}>حذف W{w.weekNum}</b> في الخانة أدناه
              </div>
              <input type="text" value={cd.confirmText} onChange={e=>setCleanDeletePopup(p=>({...p,confirmText:e.target.value}))} placeholder={"حذف W"+w.weekNum} style={{width:"100%",padding:"10px 14px",borderRadius:8,border:"2px solid "+(cd.confirmText==="حذف W"+w.weekNum?T.ok:T.brd),fontSize:FS,fontFamily:"inherit",background:T.inputBg,color:T.text,boxSizing:"border-box",transition:"border 0.15s"}}/>
            </div>

            {/* Actions */}
            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <Btn ghost onClick={()=>setCleanDeletePopup(null)}>إلغاء</Btn>
              <Btn onClick={executeCleanDelete} disabled={cd.confirmText!=="حذف W"+w.weekNum} style={{background:cd.confirmText==="حذف W"+w.weekNum?T.err:T.err+"40",color:"#fff",border:"none",fontWeight:800,padding:"10px 22px",cursor:cd.confirmText==="حذف W"+w.weekNum?"pointer":"not-allowed"}}>
                🧹 حذف وتنظيف كامل
              </Btn>
            </div>
          </div>}
        </div>
      </div>;
    })()}

    {/* ══ RESTORE WEEK POPUP — استعادة الأسبوع للحالة قبل الإقفال ══ */}
    {restorePopup&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:10001,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={()=>setRestorePopup(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:22,width:"100%",maxWidth:560,maxHeight:"92vh",overflowY:"auto",border:"2px solid #8B5CF6",boxShadow:"0 25px 70px rgba(0,0,0,0.5)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,paddingBottom:12,borderBottom:"2px solid #8B5CF620"}}>
          <div style={{fontSize:FS+2,fontWeight:800,color:"#8B5CF6",display:"flex",alignItems:"center",gap:8}}>
            <span>⏪</span><span>استعادة الأسبوع W{restorePopup.week.weekNum}</span>
          </div>
          <Btn ghost small onClick={()=>setRestorePopup(null)}>✕</Btn>
        </div>
        <div style={{padding:12,borderRadius:10,background:T.warn+"08",border:"1px solid "+T.warn+"40",marginBottom:14,lineHeight:1.8,fontSize:FS-1}}>
          <div style={{fontWeight:800,color:T.warn,marginBottom:8,fontSize:FS}}>⚠️ تحذير — هذه عملية غير قابلة للتراجع</div>
          <div style={{color:T.text}}>استعادة الأسبوع ستؤدي إلى:</div>
          <ul style={{margin:"6px 0",paddingRight:20,color:T.textSec}}>
            <li>عكس كل حركات الخزنة الخاصة بالأسبوع</li>
            <li>حذف كل سجلات المرتبات من سجل الموظفين</li>
            <li>إرجاع أرصدة الموظفين للحالة قبل الإقفال</li>
            <li>إعادة فتح الأسبوع للتعديل</li>
          </ul>
        </div>
        <div style={{padding:10,borderRadius:10,background:T.bg,border:"1px solid "+T.brd,marginBottom:14,fontSize:FS-1}}>
          <div style={{color:T.textSec,marginBottom:4}}>ℹ️ معلومات النسخة الاحتياطية:</div>
          <div style={{color:T.text,fontWeight:600}}>• الأسبوع: W{restorePopup.week.weekNum} ({restorePopup.week.weekStart} → {restorePopup.week.weekEnd})</div>
          <div style={{color:T.text,fontWeight:600}}>• تم الإقفال: {restorePopup.week.closedAt} بواسطة {restorePopup.week.closedBy||"—"}</div>
          <div style={{color:T.ok,fontWeight:700,marginTop:4}}>✅ النسخة متاحة للاستعادة (نفس اليوم)</div>
        </div>
        <div style={{padding:14,borderRadius:10,background:T.err+"06",border:"2px dashed "+T.err+"40",marginBottom:14}}>
          <div style={{fontSize:FS-1,fontWeight:700,color:T.err,marginBottom:8}}>للتأكيد، اكتب كلمة <b>"استعادة"</b> في الخانة:</div>
          <input value={restorePopup.confirmText} onChange={e=>setRestorePopup(p=>({...p,confirmText:e.target.value}))} placeholder="اكتب: استعادة" style={{width:"100%",padding:"10px 14px",borderRadius:8,border:"2px solid "+(restorePopup.confirmText==="استعادة"?T.ok:T.brd),fontSize:FS,fontFamily:"inherit",background:T.inputBg,color:T.text,fontWeight:700,textAlign:"center",boxSizing:"border-box"}}/>
          {restorePopup.confirmText&&restorePopup.confirmText!=="استعادة"&&<div style={{fontSize:FS-2,color:T.err,marginTop:4,textAlign:"center"}}>يجب أن تكتب كلمة "استعادة" تماماً</div>}
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <Btn onClick={()=>setRestorePopup(null)} style={{background:T.bg,color:T.textSec,border:"1px solid "+T.brd}}>إلغاء</Btn>
          <Btn primary onClick={restoreWeekFromSnapshot} disabled={restorePopup.confirmText!=="استعادة"} style={{background:restorePopup.confirmText==="استعادة"?"#8B5CF6":T.textMut,color:"#fff",opacity:restorePopup.confirmText==="استعادة"?1:0.5}}>⏪ تأكيد الاستعادة</Btn>
        </div>
      </div>
    </div>}

    {/* ══ QUICK ADVANCE POPUP — سلفة سريعة من جدول المرتبات ══ */}
    {quickAdvance&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={()=>setQuickAdvance(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:20,width:"100%",maxWidth:440,border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.4)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,paddingBottom:12,borderBottom:"1px solid "+T.brd}}>
          <div style={{fontSize:FS+1,fontWeight:800,color:T.err,display:"flex",alignItems:"center",gap:8}}>
            <span>💸</span><span>سلفة سريعة</span>
          </div>
          <Btn ghost small onClick={()=>setQuickAdvance(null)}>✕</Btn>
        </div>
        <div style={{padding:10,borderRadius:10,background:T.err+"06",border:"1px solid "+T.err+"20",marginBottom:12}}>
          <div style={{fontSize:FS-2,color:T.textMut,marginBottom:2}}>الموظف</div>
          <div style={{fontSize:FS+1,fontWeight:800,color:T.text}}>{quickAdvance.empName}</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          <div>
            <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>المبلغ *</label>
            <Inp type="number" value={quickAdvance.amount} onChange={v=>setQuickAdvance(p=>({...p,amount:v}))} placeholder="0"/>
          </div>
          <div>
            <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>التاريخ</label>
            <Inp type="date" value={quickAdvance.date} onChange={v=>setQuickAdvance(p=>({...p,date:v}))}/>
          </div>
        </div>
        <div style={{marginBottom:10}}>
          <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>💵 الخزنة (الصرف منها) *</label>
          <Sel value={quickAdvance.account||""} onChange={v=>setQuickAdvance(p=>({...p,account:v}))}>
            <option value="">— اختر الخزنة —</option>
            {((data.treasuryAccounts||[]).length>0?data.treasuryAccounts:[{id:"MAIN CASH",name:"MAIN CASH"},{id:"SUB CASH",name:"SUB CASH"}]).map(a=>{const n=typeof a==="string"?a:(a.name||a.id);return<option key={n} value={n}>{n}</option>})}
          </Sel>
        </div>
        <div style={{marginBottom:12}}>
          <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>ملاحظة (اختياري)</label>
          <Inp value={quickAdvance.note} onChange={v=>setQuickAdvance(p=>({...p,note:v}))} placeholder="مثلاً: مقدم مرتب، أو سبب السلفة..."/>
        </div>
        <div style={{padding:10,borderRadius:8,background:T.warn+"06",border:"1px solid "+T.warn+"20",fontSize:FS-2,color:T.textSec,marginBottom:12,lineHeight:1.6}}>
          ℹ️ هيتم تسجيل السلفة في:<br/>
          • الخزنة ({quickAdvance.account||"اختر خزنة"}) — حركة خروج بفئة مرتبات<br/>
          • سجل الموظف (سلفة)<br/>
          • هتظهر تلقائياً في عمود "دفعة من الحساب" في جدول المرتبات
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <Btn onClick={()=>setQuickAdvance(null)} style={{background:T.bg,color:T.textSec,border:"1px solid "+T.brd}}>إلغاء</Btn>
          <Btn primary onClick={saveQuickAdvance} style={{background:T.err,color:"#fff"}}>💰 تسجيل السلفة</Btn>
        </div>
      </div>
    </div>}

    {/* ══ WEEKLY ADVANCE POPUP — سلفة أسبوعية للشهريين والإدارة ══ */}
    {showAdvForm&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={()=>setShowAdvForm(false)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:20,width:"100%",maxWidth:440,border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.4)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,paddingBottom:12,borderBottom:"1px solid "+T.brd}}>
          <div style={{fontSize:FS+1,fontWeight:800,color:T.ok,display:"flex",alignItems:"center",gap:8}}>
            <span>💵</span><span>سلفة أسبوعية</span>
          </div>
          <Btn ghost small onClick={()=>setShowAdvForm(false)}>✕</Btn>
        </div>
        <div style={{marginBottom:10}}>
          <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>الموظف *</label>
          {(()=>{
            const sortedEmps=activeEmps.slice().sort((a,b)=>(a.name||"").localeCompare(b.name||""));
            const q=(advNote&&false)||"";/* placeholder */
            const searchQ=advEmpId?"":(window._advSearch||"");
            const selected=sortedEmps.find(e=>e.id===advEmpId);
            if(selected){
              return<div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",borderRadius:10,background:T.ok+"10",border:"1px solid "+T.ok+"40"}}>
                <span style={{flex:1,fontWeight:700,fontSize:FS,color:T.text}}>✓ {selected.name}{selected.job?" — "+selected.job:""}</span>
                <span onClick={()=>{setAdvEmpId("");window._advSearch=""}} style={{cursor:"pointer",padding:"4px 10px",borderRadius:6,fontSize:FS-2,background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30",fontWeight:700}}>✕ تغيير</span>
              </div>;
            }
            return<div>
              <Inp value={advSearch||""} onChange={v=>setAdvSearch(v)} placeholder="🔍 ابحث بالاسم أو الوظيفة..." autoFocus/>
              {(()=>{
                const qLower=(advSearch||"").trim().toLowerCase();
                const filtered=qLower?sortedEmps.filter(e=>(e.name||"").toLowerCase().includes(qLower)||(e.job||"").toLowerCase().includes(qLower)||(e.code||"").toString().includes(qLower)):sortedEmps;
                return<div style={{marginTop:6,maxHeight:200,overflowY:"auto",border:"1px solid "+T.brd,borderRadius:8,background:T.bg}}>
                  {filtered.length===0?<div style={{padding:14,textAlign:"center",color:T.textMut,fontSize:FS-1}}>لا توجد نتائج</div>:filtered.map(e=>
                    <div key={e.id} onClick={()=>{setAdvEmpId(e.id);setAdvSearch("")}} style={{padding:"8px 12px",cursor:"pointer",borderBottom:"1px solid "+T.brd,display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:FS-1,transition:"background 0.15s"}} onMouseEnter={ev=>ev.currentTarget.style.background=T.accent+"10"} onMouseLeave={ev=>ev.currentTarget.style.background="transparent"}>
                      <span style={{fontWeight:700,color:T.text}}>{e.name}</span>
                      {e.job&&<span style={{fontSize:FS-3,color:T.textMut,background:T.cardSolid,padding:"2px 8px",borderRadius:4}}>{e.job}</span>}
                    </div>
                  )}
                </div>;
              })()}
            </div>;
          })()}
        </div>
        <div style={{display:"flex",gap:10,marginBottom:10}}>
          <div style={{flex:1}}>
            <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>المبلغ *</label>
            <Inp type="number" value={advAmount} onChange={setAdvAmount} placeholder="0"/>
          </div>
          <div style={{flex:1}}>
            <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>التاريخ</label>
            <Inp type="date" value={advDate||openWeek?.weekStart||today} onChange={setAdvDate}/>
          </div>
        </div>
        <div style={{marginBottom:14}}>
          <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>ملاحظة</label>
          <Inp value={advNote} onChange={setAdvNote} placeholder="سلفة أسبوعية، طوارئ، إلخ..."/>
        </div>
        <div style={{padding:10,background:T.accent+"08",borderRadius:8,marginBottom:14,fontSize:FS-2,color:T.textSec,lineHeight:1.6}}>
          💡 هذه السلفة ستُسجَّل في الخزنة وسجل الموظف عند إقفال الأسبوع.
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <Btn onClick={()=>setShowAdvForm(false)} style={{background:T.bg,color:T.textSec,border:"1px solid "+T.brd}}>إلغاء</Btn>
          <Btn primary onClick={saveWeeklyAdvance} disabled={!advEmpId||!advAmount} style={{background:advEmpId&&advAmount?T.ok:T.bg,color:advEmpId&&advAmount?"#fff":T.textMut,border:"none"}}>💾 حفظ السلفة</Btn>
        </div>
      </div>
    </div>}

    {/* ══ CLOSE DATE POPUP — اعتماد وقفل الأسبوع مع اختيار التاريخ ══ */}
    {showCloseDate&&openWeek&&(()=>{
      const weekSelectedCD=getSelectedEmps(openWeek.id);
      const shownEmpsCD=activeEmps.filter(e=>weekSelectedCD.includes(e.id));
      let tG_=0,tA_=0,tTP_=0,tRB_=0,tDI_=0;
      shownEmpsCD.forEach(e=>{const cc=getEmpSalary(e.id,openWeek);if(cc){tG_+=cc.grossPay;tA_+=cc.weekAdvances;tTP_+=cc.thursdayPay;tRB_+=cc.remainingBalance;tDI_+=cc.debtInstall||0}});
      const totalCashOut=r2(tTP_+totalWeeklyAdvances);/* مرتبات الخميس + سلف الإدارة المخططة (تُنفَّذ الآن) */
      const isBackdated=closeDateValue&&closeDateValue!==today;
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:10001,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(6px)"}} onClick={()=>setShowCloseDate(false)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:22,width:"100%",maxWidth:500,maxHeight:"90vh",overflowY:"auto",border:"2px solid "+T.accent,boxShadow:"0 25px 80px rgba(0,0,0,0.4)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,paddingBottom:12,borderBottom:"1px solid "+T.brd}}>
            <div style={{fontSize:FS+2,fontWeight:800,color:T.accent,display:"flex",alignItems:"center",gap:8}}>
              <span>💰</span><span>اعتماد وقفل أسبوع W{openWeek.weekNum}</span>
            </div>
            <Btn ghost small onClick={()=>setShowCloseDate(false)}>✕</Btn>
          </div>

          {/* Summary */}
          <div style={{padding:12,background:T.bg,borderRadius:10,marginBottom:14,fontSize:FS-1,lineHeight:1.8}}>
            <div style={{fontWeight:700,marginBottom:6,color:T.accent}}>📋 ملخص الأسبوع:</div>
            <div>الفترة: <b>{openWeek.weekStart} → {openWeek.weekEnd}</b></div>
            <div>عدد الموظفين: <b>{shownEmpsCD.length}</b></div>
            <div>💰 اجمالي المستحق: <b style={{color:T.ok}}>{fmt0(tG_)} ج</b></div>
            <div>💸 اجمالي المسحوبات الأسبوعية: <b style={{color:T.err}}>{fmt0(tA_)} ج</b> <span style={{fontSize:FS-3,color:T.textMut}}>(خرجت من الخزنة بالفعل)</span></div>
            {tDI_>0&&<div>🧾 اجمالي أقساط: <b>{fmt0(tDI_)} ج</b></div>}
            <div style={{borderTop:"2px solid "+T.brd,marginTop:10,paddingTop:10}}>
              <div style={{fontWeight:700,marginBottom:4,color:T.accent}}>💸 سيخرج من الخزنة الآن:</div>
              <div>💵 مرتبات الإقفال: <b style={{color:T.ok}}>{fmt0(tTP_)} ج</b></div>
              {totalWeeklyAdvances>0&&<div>🏢 سلف الإدارة/الشهريين: <b style={{color:"#EC4899"}}>{fmt0(totalWeeklyAdvances)} ج</b> <span style={{fontSize:FS-3,color:T.textMut}}>(خطة — ستُنفَّذ الآن)</span></div>}
            </div>
            <div style={{borderTop:"2px solid "+T.accent+"40",marginTop:8,paddingTop:8}}>
              🏦 إجمالي سيخرج من الخزنة: <b style={{color:T.accent,fontSize:FS+2}}>{fmt0(totalCashOut)} ج</b>
            </div>
            {tRB_!==0&&<div>🔄 يُرحّل للأسبوع القادم: <b style={{color:T.warn}}>{fmt0(tRB_)} ج</b></div>}
          </div>

          {/* Close date selector */}
          <div style={{marginBottom:14}}>
            <label style={{fontSize:FS-1,color:T.textSec,fontWeight:700,display:"block",marginBottom:6}}>📅 تاريخ إقفال الأسبوع (يظهر في الحركات المالية):</label>
            <Inp type="date" value={closeDateValue} onChange={setCloseDateValue} max={today}/>
            <div style={{fontSize:FS-3,color:T.textMut,marginTop:4,lineHeight:1.5}}>
              ℹ️ يمكن ترحيل التاريخ لأسبوع سابق إذا احتجت تسجيل الإقفال بأثر رجعي.<br/>
              التاريخ الحقيقي ({today}) سيُسجل بشكل ثابت في سجل التدقيق.
            </div>
          </div>

          {/* Backdated warning */}
          {isBackdated&&<div style={{padding:12,background:T.warn+"10",border:"2px solid "+T.warn+"40",borderRadius:10,marginBottom:14,fontSize:FS-1,lineHeight:1.7,color:T.warn}}>
            <div style={{fontWeight:800,marginBottom:4}}>⚠️ إقفال بتاريخ سابق:</div>
            <div style={{color:T.text}}>الحركات المالية ستُسجل بتاريخ <b style={{color:T.warn}}>{closeDateValue}</b></div>
            <div style={{color:T.text}}>التاريخ الحقيقي <b>{today}</b> سيُحفظ في الأسبوع وسجل التدقيق</div>
            <div style={{color:T.textSec,fontSize:FS-2,marginTop:6}}>سيظهر علامة "⚠️ تاريخ الإقفال الفعلي" في صفحة الأسبوع.</div>
          </div>}

          {/* Actions */}
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <Btn onClick={()=>setShowCloseDate(false)} style={{background:T.bg,color:T.textSec,border:"1px solid "+T.brd}}>إلغاء</Btn>
            <Btn primary onClick={()=>{setShowCloseDate(false);tryApproveWeek(closeDateValue)}} style={{fontSize:FS,padding:"10px 24px"}}>💰 اعتماد الإقفال</Btn>
          </div>
        </div>
      </div>;
    })()}

    {/* ══ MATRIX POPUP ══ */}
    {showMatrix&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowMatrix(false)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:20,width:"100%",maxWidth:500,maxHeight:"85vh",overflowY:"auto",border:"1px solid "+T.brd}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <span style={{fontSize:FS+1,fontWeight:800,color:"#F59E0B"}}>💸 دفعات مجمعة</span><Btn ghost small onClick={()=>setShowMatrix(false)}>✕</Btn>
        </div>
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          <div style={{flex:1}}><Inp value={matrixDesc} onChange={setMatrixDesc} placeholder="البيان"/></div>
          <div><Inp type="date" value={matrixDate} onChange={setMatrixDate}/></div>
        </div>
        {activeEmps.filter(e=>!matrixEmps.some(m=>m.empId===e.id)).length>0&&<Sel value="" onChange={v=>{if(v)setMatrixEmps(p=>[...p,{empId:v,name:(employees.find(e=>e.id===v)||{}).name,amount:0}])}} style={{width:"100%",marginBottom:8}}>
          <option value="">+ إضافة موظف</option>{activeEmps.filter(e=>!matrixEmps.some(m=>m.empId===e.id)).map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</Sel>}
        <div style={{display:"flex",flexDirection:"column",gap:6}}>{matrixEmps.map((m,i)=><div key={m.empId} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:10,background:T.bg,border:"1px solid "+T.brd}}>
          <span style={{flex:1,fontSize:FS,fontWeight:700}}>{m.name}</span>
          <input type="number" value={m.amount||""} onChange={e=>{const v=Number(e.target.value)||0;setMatrixEmps(p=>p.map((x,j)=>j===i?{...x,amount:v}:x))}} placeholder="المبلغ" style={{width:90,padding:"6px 8px",borderRadius:8,border:"1px solid "+T.brd,fontSize:FS,fontFamily:"inherit",textAlign:"center",background:T.inputBg,color:T.text}}/>
          <span onClick={()=>setMatrixEmps(p=>p.filter((_,j)=>j!==i))} style={{cursor:"pointer",color:T.err}}>✕</span>
        </div>)}</div>
        {matrixEmps.filter(m=>m.amount>0).length>0&&<div style={{marginTop:10,padding:8,borderRadius:8,background:T.err+"06",textAlign:"center",fontWeight:800,color:T.err}}>{"اجمالي: "+fmt0(matrixEmps.reduce((s,m)=>s+m.amount,0))+" — "+matrixEmps.filter(m=>m.amount>0).length+" موظف"}</div>}
        <div style={{marginTop:10,textAlign:"center"}}><Btn primary onClick={submitMatrix}>💰 تسجيل</Btn></div>
      </div>
    </div>}

    {/* ══ EMPLOYEES ══ */}
    {/* ══ WEEKLY SUMMARY ══ */}
    {view==="weeklySummary"&&(()=>{
      const weeklyEmps=activeEmps.filter(e=>(e.salaryType||"weekly")==="weekly");
      const wCwAdvances={};weeklyEmps.forEach(e=>{wCwAdvances[e.id]=hrLog.filter(l=>l.type==="advance"&&l.empId===e.id&&l.date>=cwStart&&l.date<=cwEnd).reduce((s,l)=>s+(Number(l.amount)||0),0)});
      const wCwTotalAdv=Object.values(wCwAdvances).reduce((s,v)=>s+v,0);
      const wCwTotalSalary=weeklyEmps.reduce((s,e)=>s+(e.weeklySalary||0),0);
      /* ══ EMPLOYEE REGISTER — CURRENT WEEK (weekly only) ══ */
      const registerCard=<Card title={"📋 سجل الموظفين الأسبوعيين — الأسبوع الحالي"} extra={<span style={{fontSize:FS-1,color:T.navText||"#fff",fontWeight:700,direction:"ltr"}}>{cwStart+" → "+cwEnd}</span>} accent={T.accent} style={{marginBottom:16}}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:FS-1}}>
            <thead><tr style={{background:T.bg}}>
              <th style={{padding:"8px 10px",textAlign:"right",borderBottom:"2px solid "+T.brd,fontWeight:800,color:T.textSec,fontSize:FS-2}}>الاسم</th>
              <th style={{padding:"8px 10px",textAlign:"center",borderBottom:"2px solid "+T.brd,fontWeight:800,color:T.textSec,fontSize:FS-2}}>الكود</th>
              <th style={{padding:"8px 10px",textAlign:"center",borderBottom:"2px solid "+T.brd,fontWeight:800,color:T.textSec,fontSize:FS-2}}>المرتب الأساسي</th>
              <th style={{padding:"8px 10px",textAlign:"center",borderBottom:"2px solid "+T.brd,fontWeight:800,color:T.textSec,fontSize:FS-2}}>سلف الأسبوع</th>
              <th style={{padding:"8px 10px",textAlign:"center",borderBottom:"2px solid "+T.brd,fontWeight:800,color:T.textSec,fontSize:FS-2}}>الصافي</th>
            </tr></thead>
            <tbody>
              {weeklyEmps.map(e=>{const adv=wCwAdvances[e.id]||0;const net=(e.weeklySalary||0)-adv;
                return<tr key={e.id} style={{borderBottom:"1px solid "+T.brd}}>
                  <td style={{padding:"7px 10px",fontWeight:700,color:T.text}}>{e.name}</td>
                  <td style={{padding:"7px 10px",textAlign:"center",color:T.textSec,fontWeight:600}}>{e.code||"—"}</td>
                  <td style={{padding:"7px 10px",textAlign:"center",fontWeight:700,color:T.accent}}>{fmt0(e.weeklySalary||0)}</td>
                  <td style={{padding:"7px 10px",textAlign:"center",fontWeight:700,color:adv>0?T.err:T.textMut}}>{adv>0?fmt0(adv):"—"}</td>
                  <td style={{padding:"7px 10px",textAlign:"center",fontWeight:800,color:net<0?T.err:T.ok}}>{fmt0(net)}</td>
                </tr>})}
              {weeklyEmps.length===0&&<tr><td colSpan={5} style={{padding:16,textAlign:"center",color:T.textMut}}>لا يوجد موظفين أسبوعيين نشطين</td></tr>}
            </tbody>
            {weeklyEmps.length>0&&<tfoot><tr style={{background:T.accentBg,borderTop:"2px solid "+T.accent+"40"}}>
              <td style={{padding:"8px 10px",fontWeight:800,color:T.text}} colSpan={2}>{"الإجمالي ("+weeklyEmps.length+" موظف)"}</td>
              <td style={{padding:"8px 10px",textAlign:"center",fontWeight:800,color:T.accent}}>{fmt0(wCwTotalSalary)}</td>
              <td style={{padding:"8px 10px",textAlign:"center",fontWeight:800,color:wCwTotalAdv>0?T.err:T.textMut}}>{wCwTotalAdv>0?fmt0(wCwTotalAdv):"—"}</td>
              <td style={{padding:"8px 10px",textAlign:"center",fontWeight:800,color:(wCwTotalSalary-wCwTotalAdv)<0?T.err:T.ok}}>{fmt0(wCwTotalSalary-wCwTotalAdv)}</td>
            </tr></tfoot>}
          </table>
        </div>
      </Card>;

      const selectedWeek=summaryWeekId?hrWeeks.find(w=>w.id===summaryWeekId):hrWeeks[0];
      if(!selectedWeek)return<div>{registerCard}<div style={{textAlign:"center",padding:40,color:T.textMut}}>لا توجد أسابيع بعد — افتح أسبوع من تاب "📅 الأسابيع"</div></div>;
      const wStart=selectedWeek.weekStart;const wEnd=selectedWeek.weekEnd;
      /* Calculate per-employee advance total for this week (from hrLog advances by weekId OR by date) */
      const rows=weeklyEmps.map(e=>{
        const logAdvances=hrLog.filter(l=>l.type==="advance"&&l.empId===e.id&&(l.weekId===selectedWeek.id||(l.date>=wStart&&l.date<=wEnd)));
        const logIds=new Set(logAdvances.map(l=>l.id));
        const treasuryAdvances=(data.treasury||[]).filter(t=>t.sourceType==="hr_advance"&&t.empId===e.id&&t.date>=wStart&&t.date<=wEnd&&!logIds.has(t.hrLogId));
        const weekAdvances=logAdvances.reduce((s,l)=>s+(Number(l.amount)||0),0)+treasuryAdvances.reduce((s,t)=>s+(Number(t.amount)||0),0);
        return{id:e.id,name:e.name,code:e.code||"",salary:e.weeklySalary||0,advances:weekAdvances}});
      const totalSalary=rows.reduce((s,r)=>s+r.salary,0);
      const totalAdvances=rows.reduce((s,r)=>s+r.advances,0);
      return<div>
        {registerCard}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:FS,fontWeight:700,color:T.textSec}}>اختر الأسبوع:</span>
            <Sel value={selectedWeek.id} onChange={setSummaryWeekId} style={{minWidth:240}}>
              {hrWeeks.map(w=><option key={w.id} value={w.id}>{"W"+w.weekNum+" — "+w.weekStart+" → "+w.weekEnd+(w.status==="closed"?" ✅":" 🔓")}</option>)}
            </Sel>
          </div>
          <Btn small onClick={()=>{
            const w=_openPrintWin();if(!w)return;
            const logo=(data.logo||"").trim();
            let html=`<html dir="rtl"><head><meta charset="utf-8"><title>سجل أسبوعي W${selectedWeek.weekNum}</title>
            <style>@page{size:A4;margin:10mm}body{font-family:'Cairo',Arial,sans-serif;font-size:11px;margin:0;padding:0}
            .hdr{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:2px solid #0ea5e9;margin-bottom:12px}
            .hdr img{max-height:45px}.hdr h1{font-size:15px;margin:0;color:#0ea5e9}
            table{width:100%;border-collapse:collapse;font-size:11px}
            th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:right}
            th{background:#0ea5e9;color:#fff;text-align:center}
            tr:nth-child(even){background:#f8fafc}
            .num{text-align:center;font-weight:700}
            tfoot tr{background:#0ea5e9;color:#fff;font-weight:800}
            @media print{body{margin:0}}</style></head><body>
            <div class="hdr">${logo?'<img src="'+logo+'"/>':'<div style="font-size:20px;font-weight:900;color:#0ea5e9">CLARK</div>'}
              <div style="text-align:left"><h1>سجل أسبوعي W${selectedWeek.weekNum}</h1><div style="font-size:10px;color:#64748b">${selectedWeek.weekStart} → ${selectedWeek.weekEnd}</div></div></div>
            <table><thead><tr><th>#</th><th>الموظف</th><th>الكود</th><th>المرتب الأساسي</th><th>سلف هذا الأسبوع</th></tr></thead><tbody>`;
            rows.forEach((r,i)=>{html+=`<tr><td class="num">${i+1}</td><td>${r.name}</td><td class="num">${r.code||"—"}</td><td class="num" style="color:#0ea5e9">${fmt0(r.salary)}</td><td class="num" style="color:${r.advances>0?"#ef4444":"#94a3b8"}">${r.advances>0?fmt0(r.advances):"—"}</td></tr>`});
            html+=`</tbody><tfoot><tr><td colspan="3" style="text-align:center">الإجمالي</td><td class="num">${fmt0(totalSalary)}</td><td class="num">${fmt0(totalAdvances)}</td></tr></tfoot></table></body></html>`;
            w.document.write(html);w.document.close();setTimeout(()=>w.print(),300)
          }} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30",fontWeight:700}}>🖨 طباعة</Btn>
        </div>
        <Card title={"📊 W"+selectedWeek.weekNum+" — "+selectedWeek.weekStart+" → "+selectedWeek.weekEnd+" ("+(selectedWeek.status==="closed"?"✅ مقفول":"🔓 مفتوح")+")"}>
          <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>
            {["#","الموظف","الكود","المرتب الأساسي","سلف هذا الأسبوع"].map(h=><th key={h} style={{padding:"10px 8px",textAlign:"center",fontSize:FS-1,color:T.textSec,borderBottom:"2px solid "+T.brd,fontWeight:700}}>{h}</th>)}
          </tr></thead><tbody>
            {rows.map((r,i)=><tr key={r.id} style={{borderBottom:"1px solid "+T.brd,background:i%2===1?T.bg:T.cardSolid}}>
              <td style={{padding:"8px",textAlign:"center",fontSize:FS-2,color:T.textMut}}>{i+1}</td>
              <td style={{padding:"8px 12px",fontSize:FS,fontWeight:700,textAlign:"right"}}>{r.name}</td>
              <td style={{padding:"8px",textAlign:"center",fontSize:FS-1,color:T.accent,fontWeight:700}}>{r.code||"—"}</td>
              <td style={{padding:"8px",textAlign:"center",fontSize:FS,fontWeight:800,color:T.accent}}>{fmt0(r.salary)}</td>
              <td style={{padding:"8px",textAlign:"center",fontSize:FS,fontWeight:800,color:r.advances>0?T.err:T.textMut}}>{r.advances>0?fmt0(r.advances):"—"}</td>
            </tr>)}
            <tr style={{background:T.accent+"08",fontWeight:800,borderTop:"2px solid "+T.accent+"30"}}>
              <td colSpan={3} style={{padding:"10px",textAlign:"right",fontSize:FS,fontWeight:800}}>الإجمالي</td>
              <td style={{padding:"10px",textAlign:"center",fontSize:FS+1,fontWeight:800,color:T.accent}}>{fmt0(r2(totalSalary))}</td>
              <td style={{padding:"10px",textAlign:"center",fontSize:FS+1,fontWeight:800,color:T.err}}>{fmt0(r2(totalAdvances))}</td>
            </tr>
          </tbody></table></div>
        </Card>
      </div>})()}

    {/* ══ MONTHLY SUMMARY ══ */}
    {view==="monthlySummary"&&(()=>{
      const monthlyEmps=activeEmps.filter(e=>(e.salaryType||"weekly")==="monthly");
      const mStart=selMonth+"-01";
      const mEndDate=new Date(Number(selMonth.slice(0,4)),Number(selMonth.slice(5,7)),0);
      const mEnd=selMonth+"-"+String(mEndDate.getDate()).padStart(2,"0");
      const mDays=mEndDate.getDate();

      const rows=monthlyEmps.map(e=>{
        const advs=hrLog.filter(l=>l.type==="advance"&&l.empId===e.id&&l.date>=mStart&&l.date<=mEnd);
        const advTotal=advs.reduce((s,l)=>s+(Number(l.amount)||0),0);
        const tAdv=(data.treasury||[]).filter(t=>t.sourceType==="hr_advance"&&t.empId===e.id&&t.date>=mStart&&t.date<=mEnd&&!advs.some(a=>a.id===t.hrLogId));
        const tAdvTotal=tAdv.reduce((s,t)=>s+(Number(t.amount)||0),0);
        const totalAdv=advTotal+tAdvTotal;
        return{id:e.id,name:e.name,code:e.code||"",salary:e.weeklySalary||0,advances:totalAdv,net:r2((e.weeklySalary||0)-totalAdv),advDetails:[...advs,...tAdv.map(t=>({date:t.date,amount:t.amount,desc:t.desc||"سلفة"}))]}});
      const totalSalary=rows.reduce((s,r)=>s+r.salary,0);
      const totalAdvances=rows.reduce((s,r)=>s+r.advances,0);

      const printMonthly=()=>{let h="<h2 style='text-align:center'>📅 سجل المرتبات الشهري — "+selMonth+"</h2><div style='text-align:center;margin-bottom:12px;color:#666'>من "+mStart+" إلى "+mEnd+" ("+mDays+" يوم)</div>";
        h+="<table><thead><tr><th>#</th><th>الاسم</th><th>الكود</th><th>المرتب</th><th>السلف</th><th>الصافي</th></tr></thead><tbody>";
        rows.forEach((r,i)=>{h+="<tr><td style='text-align:center'>"+(i+1)+"</td><td style='font-weight:700'>"+r.name+"</td><td style='text-align:center'>"+r.code+"</td><td style='text-align:center;font-weight:700'>"+fmt0(r.salary)+"</td><td style='text-align:center;color:#EF4444'>"+fmt0(r.advances)+"</td><td style='text-align:center;font-weight:800;color:"+(r.net>=0?"#10B981":"#EF4444")+"'>"+fmt0(r.net)+"</td></tr>"});
        h+="<tr style='background:#EFF6FF;font-weight:800'><td colspan='3'>الإجمالي ("+rows.length+" موظف)</td><td style='text-align:center'>"+fmt0(totalSalary)+"</td><td style='text-align:center;color:#EF4444'>"+fmt0(totalAdvances)+"</td><td style='text-align:center;font-size:14px;color:"+(totalSalary-totalAdvances>=0?"#10B981":"#EF4444")+"'>"+fmt0(r2(totalSalary-totalAdvances))+"</td></tr></tbody></table>";
        h+="<div class='sig'><div class='sig-box'>المحاسب</div><div class='sig-box'>المدير</div></div>";printPage("سجل شهري — "+selMonth,h)};

      return<div>
        {/* Month selector */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:FS,fontWeight:700,color:T.textSec}}>الشهر:</span>
            <input type="month" value={selMonth} onChange={e=>setSelMonth(e.target.value)} style={{padding:"6px 12px",borderRadius:8,border:"1px solid "+T.brd,fontSize:FS,fontFamily:"inherit",background:T.inputBg,color:T.text}}/>
            <span style={{fontSize:FS-2,color:T.textMut}}>{"("+mDays+" يوم)"}</span>
          </div>
          <Btn small onClick={printMonthly} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}}>🖨 طباعة</Btn>
        </div>
        {monthlyEmps.length===0?<div style={{textAlign:"center",padding:40,color:T.textMut}}>لا يوجد موظفين بنظام شهري — غيّر نوع المرتب من كارت الموظف</div>
        :<Card title={"📅 سجل الموظفين الشهريين — "+selMonth} accent="#059669">
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
            <div style={{padding:8,borderRadius:10,background:T.accent+"08",textAlign:"center"}}><div style={{fontSize:FS-3,color:T.textSec}}>إجمالي المرتبات</div><div style={{fontSize:FS+2,fontWeight:800,color:T.accent}}>{fmt0(totalSalary)}</div></div>
            <div style={{padding:8,borderRadius:10,background:T.err+"08",textAlign:"center"}}><div style={{fontSize:FS-3,color:T.textSec}}>إجمالي السلف</div><div style={{fontSize:FS+2,fontWeight:800,color:T.err}}>{fmt0(totalAdvances)}</div></div>
            <div style={{padding:8,borderRadius:10,background:T.ok+"08",textAlign:"center"}}><div style={{fontSize:FS-3,color:T.textSec}}>صافي المستحق</div><div style={{fontSize:FS+2,fontWeight:800,color:T.ok}}>{fmt0(r2(totalSalary-totalAdvances))}</div></div>
          </div>
          <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>
            {["#","الاسم","الكود","المرتب الشهري","السلف","الصافي"].map(h=><th key={h} style={TH}>{h}</th>)}
          </tr></thead><tbody>
            {rows.map((r,i)=><tr key={r.id} style={{borderBottom:"1px solid "+T.brd}}>
              <td style={{...TD,textAlign:"center"}}>{i+1}</td>
              <td style={{...TD,fontWeight:700}}>{r.name}</td>
              <td style={{...TD,textAlign:"center",color:T.textSec}}>{r.code||"—"}</td>
              <td style={{...TDB,color:T.accent}}>{fmt0(r.salary)}</td>
              <td style={{...TDB,color:r.advances>0?T.err:T.textMut}}>{r.advances>0?fmt0(r.advances):"—"}</td>
              <td style={{...TDB,color:r.net>=0?T.ok:T.err,fontWeight:800}}>{fmt0(r.net)}</td>
            </tr>)}
            <tr style={{background:T.accent+"06"}}><td colSpan={3} style={{...TD,fontWeight:800}}>{"الإجمالي ("+rows.length+" موظف)"}</td>
              <td style={{...TDB,fontWeight:800}}>{fmt0(totalSalary)}</td>
              <td style={{...TDB,color:T.err,fontWeight:800}}>{fmt0(totalAdvances)}</td>
              <td style={{...TDB,color:T.ok,fontWeight:900,fontSize:FS+2}}>{fmt0(r2(totalSalary-totalAdvances))}</td>
            </tr>
          </tbody></table></div>
        </Card>}
      </div>})()}

    {/* ══ EMPLOYEES ══ */}
    {view==="employees"&&<div>
      {canEdit&&<div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        <Btn primary onClick={()=>{resetEmpForm();setShowEmpForm(!showEmpForm)}}>{showEmpForm?"✕":"+ موظف جديد"}</Btn>
        <Btn onClick={()=>{setBulkImportText("");setBulkImportParsed(null);setShowBulkImport(true)}} style={{background:"#8B5CF612",color:"#8B5CF6",border:"1px solid #8B5CF640",fontWeight:700}}>📋 إدخال جماعي</Btn>
      </div>}
      {showEmpForm&&<Card title={empEditId?"✏️ تعديل":"+ موظف جديد"} style={{marginBottom:16}}>
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"repeat(4,1fr)",gap:10}}>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>الاسم</label><Inp value={empName} onChange={setEmpName}/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>كود البصمة</label><Inp value={empCode} onChange={setEmpCode} placeholder="رقم من جهاز البصمة"/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>الوظيفة</label><Inp value={empJob} onChange={setEmpJob}/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>نظام المرتب</label><Sel value={empSalaryType} onChange={setEmpSalaryType}><option value="weekly">أسبوعي</option><option value="monthly">شهري</option></Sel></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>{empSalaryType==="monthly"?"مرتب شهري":"مرتب أسبوعي"}</label><Inp type="number" value={empWeeklySalary} onChange={setEmpWeeklySalary}/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>حافز أسبوعي ثابت</label><Inp type="number" value={empWeeklyBonus} onChange={setEmpWeeklyBonus} placeholder="0"/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>ساعات أساسي (افتراضي)</label><Inp type="number" value={empBaseHours} onChange={setEmpBaseHours} placeholder={String(hrs.defaultBaseHours||48)}/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>تليفون</label><Inp value={empPhone} onChange={setEmpPhone} placeholder="+201xxxxxxxxx" style={{direction:"ltr",textAlign:"left",fontFamily:"monospace"}}/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>الرقم القومي (14 رقم) {empNationalId&&empNationalId.replace(/\D/g,"").length!==14&&<span style={{color:T.err,fontSize:FS-3}}>— {empNationalId.replace(/\D/g,"").length}/14</span>}</label><Inp value={empNationalId} onChange={v=>setEmpNationalId(v.replace(/\D/g,"").slice(0,14))} placeholder="14 رقم" maxLength={14} style={{direction:"ltr",textAlign:"left",fontFamily:"monospace"}}/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>تاريخ التعيين</label><Inp type="date" value={empDate} onChange={setEmpDate}/></div>
          <div style={{display:"flex",alignItems:"flex-end",gap:8}}>
            <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:FS-1,fontWeight:600,color:empNoBiometric?T.accent:T.textSec,padding:"6px 12px",borderRadius:8,background:empNoBiometric?T.accent+"12":T.bg,border:"1px solid "+(empNoBiometric?T.accent+"40":T.brd)}}>
              <input type="checkbox" checked={empNoBiometric} onChange={e=>setEmpNoBiometric(e.target.checked)} style={{accentColor:T.accent}}/>
              بدون بصمة
            </label>
          </div>
          <div style={{display:"flex",alignItems:"flex-end"}}><Btn primary onClick={saveEmp} style={{width:"100%"}}>💾</Btn></div>
        </div>
      </Card>}
      {(()=>{
        /* Filter employees by search query across multiple fields */
        const q=(empSearch||"").trim().toLowerCase();
        const filteredEmps=q?employees.filter(e=>{
          const fields=[
            e.name||"",
            e.code||"",
            e.job||"",
            e.phone||"",
            (e.salaryType||"weekly")==="monthly"?"شهري":"أسبوعي",
            e.noBiometric?"بدون بصمة إدارة":"بصمة",
            e.inactive?"متوقف":"نشط"
          ].join(" ").toLowerCase();
          return fields.includes(q);
        }):employees;
      return<Card title={"👷 الموظفين ("+(q?filteredEmps.length+"/"+employees.length:employees.length)+")"}>
        <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"center"}}>
          <div style={{flex:1,position:"relative"}}>
            <span style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",fontSize:14,color:T.textMut,pointerEvents:"none"}}>🔍</span>
            <input value={empSearch} onChange={e=>setEmpSearch(e.target.value)} placeholder="ابحث بالاسم، الكود، الوظيفة، التليفون، نوع المرتب..." style={{width:"100%",padding:"8px 34px 8px 12px",borderRadius:8,border:"1px solid "+T.brd,fontSize:FS-1,fontFamily:"inherit",background:T.inputBg,color:T.text,boxSizing:"border-box"}}/>
          </div>
          {empSearch&&<Btn small onClick={()=>setEmpSearch("")} style={{background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30",whiteSpace:"nowrap"}}>✕ مسح</Btn>}
          {/* V14.57: Bulk print QR cards */}
          {canEdit&&activeEmps.length>0&&<Btn small onClick={()=>printEmpQrCards(activeEmps)} style={{background:"#8B5CF612",color:"#8B5CF6",border:"1px solid #8B5CF630",whiteSpace:"nowrap",fontWeight:700}} title={"طباعة كروت QR لكل الموظفين النشطين ("+activeEmps.length+")"}>🎫 كروت QR</Btn>}
        </div>
        {filteredEmps.length>0?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>
          {["#","الاسم","الكود","الوظيفة","مرتب","حافز","ساعات","تليفون","رصيد","مديونيات","حالة",""].map(h=><th key={h} style={{padding:"7px 6px",textAlign:"center",fontSize:FS-2,color:T.textSec,borderBottom:"2px solid "+T.brd,fontWeight:700,whiteSpace:"nowrap"}}>{h}</th>)}
        </tr></thead><tbody>
          {filteredEmps.map((e,i)=>{const activeD=empActiveDebts(e.id);const totalRemaining=activeD.reduce((s,d)=>{const paid=(d.paidWeekIds||[]).length;return s+(d.total-paid*d.perWeek)},0);
            const isEditing=inlineEditId===e.id;const d_=inlineDraft;
            const inpStyle={width:"100%",padding:"3px 6px",borderRadius:6,border:"1px solid "+T.accent+"40",fontSize:FS-2,fontFamily:"inherit",textAlign:"center",background:T.inputBg,color:T.text};
            return<tr key={e.id} style={{borderBottom:"1px solid "+T.brd,opacity:e.inactive?0.4:1,background:isEditing?T.accent+"06":""}}>
              <td style={{padding:"5px 6px",fontSize:FS-2,color:T.textMut,textAlign:"center"}}>{i+1}</td>
              <td style={{padding:"5px 6px",fontSize:FS,fontWeight:700,minWidth:120,textAlign:"right"}}>
                {isEditing?<input value={d_.name} onChange={ev=>setInlineDraft(p=>({...p,name:ev.target.value}))} style={{...inpStyle,textAlign:"right",fontWeight:700,fontSize:FS}}/>:<>{e.name}{e.noBiometric&&<span style={{fontSize:FS-3,marginRight:4,padding:"1px 5px",borderRadius:4,background:"#8B5CF612",color:"#8B5CF6",fontWeight:600}}>إدارة</span>}</>}</td>
              <td style={{padding:"5px 6px",fontSize:FS-1,color:T.accent,fontWeight:700,minWidth:70,textAlign:"center"}}>
                {isEditing?<input value={d_.code} onChange={ev=>setInlineDraft(p=>({...p,code:ev.target.value}))} style={{...inpStyle,width:70}}/>:e.code||"—"}</td>
              <td style={{padding:"5px 6px",fontSize:FS-2,color:T.textSec,minWidth:80,textAlign:"center"}}>
                {isEditing?<input value={d_.job} onChange={ev=>setInlineDraft(p=>({...p,job:ev.target.value}))} style={{...inpStyle,width:80}}/>:e.job||"—"}</td>
              <td style={{padding:"5px 6px",fontSize:FS-1,fontWeight:700,color:T.accent,minWidth:70,textAlign:"center"}}>
                {isEditing?<input type="number" value={d_.weeklySalary} onChange={ev=>setInlineDraft(p=>({...p,weeklySalary:ev.target.value}))} style={{...inpStyle,width:70}}/>:fmt0(e.weeklySalary||0)}</td>
              <td style={{padding:"5px 6px",fontSize:FS-2,color:T.ok,minWidth:60,textAlign:"center"}}>
                {isEditing?<input type="number" value={d_.weeklyBonus} onChange={ev=>setInlineDraft(p=>({...p,weeklyBonus:ev.target.value}))} style={{...inpStyle,width:60}} placeholder="0"/>:(e.weeklyBonus>0?fmt0(e.weeklyBonus):"—")}</td>
              <td style={{padding:"5px 6px",fontSize:FS-2,color:T.textMut,minWidth:50,textAlign:"center"}}>
                {isEditing?<input type="number" value={d_.baseHours} onChange={ev=>setInlineDraft(p=>({...p,baseHours:ev.target.value}))} style={{...inpStyle,width:50}}/>:(e.baseHours||hrs.defaultBaseHours||48)}</td>
              <td style={{padding:"5px 6px",fontSize:FS-3,color:T.textMut,direction:"ltr",minWidth:90,textAlign:"center"}}>
                {isEditing?<input value={d_.phone} onChange={ev=>setInlineDraft(p=>({...p,phone:ev.target.value}))} style={{...inpStyle,width:90,direction:"ltr"}}/>:e.phone||"—"}</td>
              <td style={{padding:"5px 6px",fontSize:FS-1,fontWeight:800,color:(e.prevBalance||0)>=0?T.ok:T.err,textAlign:"center"}}>{fmt0(e.prevBalance||0)}</td>
              <td style={{padding:"5px 6px",textAlign:"center"}}>
                {activeD.length>0?<span onClick={()=>setShowEmpDebts(e.id)} style={{cursor:"pointer",padding:"3px 10px",borderRadius:6,fontSize:FS-2,fontWeight:700,background:"#F9731612",color:"#F97316",border:"1px solid #F9731630",display:"inline-flex",alignItems:"center",gap:4}} title="عرض المديونيات">🧾 {activeD.length} | {fmt0(totalRemaining)}</span>
                :<span onClick={()=>{if(canEdit){setShowDebtForm({empId:e.id});resetDebtForm();setDebtStart(today)}}} style={{cursor:canEdit?"pointer":"default",padding:"2px 8px",borderRadius:6,fontSize:FS-2,color:T.textMut,border:"1px dashed "+T.brd}}>—</span>}
              </td>
              <td style={{padding:"5px 6px"}}><span style={{padding:"2px 6px",borderRadius:5,fontSize:FS-3,fontWeight:700,background:e.inactive?T.err+"12":T.ok+"12",color:e.inactive?T.err:T.ok}}>{e.inactive?"متوقف":"نشط"}</span></td>
              <td style={{padding:"5px 6px"}}>{canEdit&&<div style={{display:"flex",gap:3,alignItems:"center",flexWrap:"nowrap"}}>
                {isEditing?<>
                  <span onClick={saveInlineEdit} style={{cursor:"pointer",padding:"3px 8px",borderRadius:6,fontSize:FS-2,fontWeight:700,background:T.ok+"15",color:T.ok,border:"1px solid "+T.ok+"30"}}>💾</span>
                  <span onClick={cancelInlineEdit} style={{cursor:"pointer",padding:"3px 6px",borderRadius:6,fontSize:FS-2,fontWeight:700,background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30"}}>✕</span>
                </>:<>
                  <span onClick={()=>{setEmpStatement(e.id);setStmtFrom("");setStmtTo("")}} style={{cursor:"pointer",fontSize:13,padding:"3px 8px",borderRadius:6,background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30",fontWeight:700}} title="كشف حساب تفصيلي">📄</span>
                  <span onClick={()=>printEmpQrCards([e])} style={{cursor:"pointer",fontSize:13,padding:"3px 8px",borderRadius:6,background:"#8B5CF612",color:"#8B5CF6",border:"1px solid #8B5CF630",fontWeight:700}} title="طباعة كارت QR">🎫</span>
                  <span onClick={()=>setEmpQrView(e.id)} style={{cursor:"pointer",fontSize:13,padding:"3px 8px",borderRadius:6,background:"#0EA5E912",color:"#0EA5E9",border:"1px solid #0EA5E930",fontWeight:700}} title="عرض QR على الشاشة (لو الموظف نسي كارته)">👁</span>
                  <span onClick={()=>openEditPopup(e)} style={{cursor:"pointer",fontSize:13,padding:"3px 8px",borderRadius:6,background:"#8B5CF612",color:"#8B5CF6",border:"1px solid #8B5CF630",fontWeight:700}} title="تعديل كل التفاصيل">✏️</span>
                  <span onClick={()=>{setShowDebtForm({empId:e.id});resetDebtForm();setDebtStart(today)}} style={{cursor:"pointer",fontSize:11}} title="+ مديونية">🧾</span>
                  <span onClick={()=>toggleEmpActive(e.id)} style={{cursor:"pointer",fontSize:11}}>{e.inactive?"▶️":"⏸"}</span>
                  <span onClick={()=>{
                    const inLog=hrLog.filter(l=>l.empId===e.id).length;
                    const inDebts=debts.filter(dx=>dx.empId===e.id).length;
                    let inAttendance=0;
                    hrWeeks.forEach(w=>{Object.keys(w.attendance||{}).forEach(k=>{if(k.startsWith(e.id+"_"))inAttendance++})});
                    if(inLog>0||inDebts>0||inAttendance>0){
                      openConfirm({title:"⛔ لا يمكن الحذف",message:"الموظف "+e.name+" مرتبط بـ:\n• "+[inLog>0?inLog+" حركة في السجل":"",inDebts>0?inDebts+" مديونية":"",inAttendance>0?inAttendance+" سجل حضور":""].filter(Boolean).join("\n• ")+"\n\nيمكنك إيقافه بدلاً من ذلك باستخدام زر ⏸",variant:"danger",onConfirm:()=>{}});return}
                    openConfirm({title:"حذف الموظف",message:"سيتم حذف "+e.name+" نهائياً.",variant:"danger",onConfirm:()=>{upConfig(d=>{if(!d.recycleBin)d.recycleBin=[];const emp=(d.employees||[]).find(x=>x.id===e.id);if(emp)d.recycleBin.unshift({...emp,_type:"موظف",_collection:"employees",_deletedAt:new Date().toISOString()});if(d.recycleBin.length>100)d.recycleBin=d.recycleBin.slice(0,100);d.employees=(d.employees||[]).filter(x=>x.id!==e.id)});showToast("✓ تم حذف الموظف — يمكن الاستعادة من سلة المحذوفات")}})
                  }} style={{cursor:"pointer",fontSize:11,color:T.err}} title="حذف">🗑️</span>
                </>}
              </div>}</td>
            </tr>})}
        </tbody></table></div>:<div style={{textAlign:"center",padding:30,color:T.textMut}}>{q?"لا يوجد نتائج للبحث عن \""+empSearch+"\"":"أضف موظفين"}</div>}
      </Card>})()}
    </div>}

    {/* ══ V14.61: VERIFY TAB — Dedicated screen for second accountant ══ */}
    {view==="verify"&&(()=>{
      /* V14.66: Include BOTH open and closed weeks — open weeks allow receipt scanning during the day */
      const allWeeks=[...hrWeeks].sort((a,b)=>{
        /* Open weeks first (for default selection), then by weekNum desc */
        if(a.status!=="closed"&&b.status==="closed")return -1;
        if(a.status==="closed"&&b.status!=="closed")return 1;
        return (b.weekNum||0)-(a.weekNum||0);
      });
      const closedWeeks=allWeeks.filter(w=>w.status==="closed");
      const openWeeks=allWeeks.filter(w=>w.status!=="closed");
      if(allWeeks.length===0){
        return<Card title="🔐 تأكيد الاستلام">
          <div style={{padding:40,textAlign:"center",color:T.textMut}}>
            <div style={{fontSize:48,marginBottom:10}}>🔒</div>
            <div style={{fontSize:FS+1,fontWeight:700,marginBottom:6}}>لا توجد أسابيع بعد</div>
            <div style={{fontSize:FS-1}}>يجب فتح أسبوع أولاً</div>
          </div>
        </Card>;
      }
      /* Default: active open week (for scanning during work day), fallback to most recent closed */
      const activeWeekId=verifySelectedWeekId||(openWeeks[0]?openWeeks[0].id:closedWeeks[0]?.id);
      const week=allWeeks.find(w=>w.id===activeWeekId)||allWeeks[0];
      /* V15.25: Use merged receipts (Firestore + pending queue) for instant UI feedback */
      const receipts=mergedReceipts(week);
      const wkSelected=(week.selectedEmps&&Array.isArray(week.selectedEmps))?week.selectedEmps:[];
      const wkEmps=activeEmps.filter(e=>wkSelected.includes(e.id));
      const received=wkEmps.filter(e=>receipts[e.id]);
      const notReceived=wkEmps.filter(e=>!receipts[e.id]);
      /* Total paid (from saved records if week closed) */
      const totalPaid=received.reduce((s,e)=>{const c=getEmpSalary(e.id,week);return s+(c?c.thursdayPay:0)},0);
      const totalDue=wkEmps.reduce((s,e)=>{const c=getEmpSalary(e.id,week);return s+(c?c.thursdayPay:0)},0);
      /* Close camera helper */
      const closeVerifyCam=()=>{try{const v=document.getElementById("verify-scan-video");if(v&&v.srcObject){v.srcObject.getTracks().forEach(t=>t.stop());v.srcObject=null}}catch(e){}setVerifyScanning(false)};
      /* Scan handler — instant register */
      const handleVerifyScan=(text)=>{
        /* V15.28: Permission check — refuse silently with audit if user lacks verify:edit */
        if(!canEditVerify){
          playBeep("error");
          showToast("⛔ ليس لديك صلاحية تأكيد استلام المرتبات");
          upConfig(d=>{
            if(!Array.isArray(d.auditLog))d.auditLog=[];
            d.auditLog.unshift({
              id:Math.random().toString(36).slice(2)+Date.now(),
              category:"security",action:"unauthorized_verify_attempt",
              target:"W"+week.weekNum,
              newValue:"🚨 محاولة سكان بدون صلاحية",
              notes:"المستخدم: "+(userName||"—")+" | الدور: "+(userRole||"—"),
              at:new Date().toISOString(),severity:"danger"
            });
          });
          return;
        }
        const m=/^CLARK:EMP:(.+)$/.exec(text);
        if(!m){playBeep("error");showToast("❌ QR غير صحيح");return}
        const empId=m[1];
        const emp=employees.find(e=>e.id===empId);
        if(!emp){playBeep("error");showToast("❌ الموظف غير موجود");return}
        if(!wkSelected.includes(empId)){playBeep("error");showToast("⚠️ "+emp.name+" ليس في هذا الأسبوع");return}
        /* V15.28: Separation of Duties — block same user from editing salary AND verifying.
           Admin is EXEMPT from this rule (user's choice). */
        if(!isAdmin){
          const editedBy=(week.draftInputs||{}).thursdayPayLastEditedBy||{};
          const lastEditor=editedBy[empId];
          if(lastEditor&&lastEditor===userName){
            playBeep("error");
            upConfig(d=>{
              if(!Array.isArray(d.auditLog))d.auditLog=[];
              d.auditLog.unshift({
                id:Math.random().toString(36).slice(2)+Date.now(),
                category:"security",action:"sod_violation_blocked",
                target:"W"+week.weekNum+" — "+emp.name,
                newValue:"🛡️ منع تلقائي — نفس المستخدم عدّل وأراد تأكيد",
                notes:"المستخدم: "+(userName||"—")+" | فصل الصلاحيات فعّال",
                at:new Date().toISOString(),severity:"danger"
              });
            });
            openConfirm({
              title:"⛔ مخالفة فصل الصلاحيات",
              message:"لا يمكنك تأكيد استلام "+emp.name+"\n\nأنت عدَّلت مبلغ المرتب لهذا الموظف.\nيجب أن يؤكد الاستلام محاسب آخر (مبدأ الرقابة المزدوجة).",
              variant:"danger",confirmText:"فهمت",hideCancel:true,onConfirm:()=>{}
            });
            return;
          }
        }
        if(receipts[empId]){
          /* DUPLICATE — show fraud warning */
          playBeep("error");
          const prev=receipts[empId];
          setFraudWarning({
            empName:emp.name,
            empCode:emp.code||"",
            previousAt:prev.at,
            previousBy:prev.by||"—",
            attemptAt:new Date().toISOString(),
            attemptBy:userName||"—",
            weekId:week.id,
            weekNum:week.weekNum
          });
          upConfig(d=>{
            if(!Array.isArray(d.auditLog))d.auditLog=[];
            d.auditLog.unshift({
              id:Math.random().toString(36).slice(2)+Date.now(),
              category:"week",action:"duplicate_scan_attempt",
              target:"W"+week.weekNum+" — "+emp.name,
              newValue:"🚨 محاولة سكان مكررة (تاب تأكيد)",
              notes:"الأصل: "+new Date(prev.at).toLocaleString("ar-EG")+" بواسطة "+(prev.by||"—")+" | محاولة: "+(userName||"—"),
              at:new Date().toISOString(),severity:"warning"
            });
          });
          return;
        }
        /* V14.63: Check mode — if detailed, show review popup; if fast, register instantly */
        const empSalary=getEmpSalary(empId,week);
        if(verifyMode==="detailed"){
          /* Stop camera, show review popup */
          playBeep("ok");
          closeVerifyCam();
          setVerifyReview({emp,salary:empSalary,week});
          return;
        }
        /* FAST MODE — register instantly via receipt queue (V15.25) */
        const amount=empSalary?empSalary.thursdayPay:0;
        const nowIso=new Date().toISOString();
        /* V15.25: Write to localStorage queue FIRST — instant, cannot fail, cannot conflict.
           The background worker (every 500ms) will pick this up and push to Firestore safely. */
        const queued=addReceipt(week.id,empId,{
          at:nowIso,by:userName||"",verifiedAt:nowIso,verifiedBy:userName||"",mode:"fast",
          empName:emp.name,empCode:emp.code||"",amount
        });
        if(!queued){
          /* localStorage unavailable — fall back to direct write (legacy behavior) */
          console.warn("[verify] localStorage queue unavailable, falling back to direct write");
          upConfig(d=>{
            const wi=(d.hrWeeks||[]).findIndex(x=>x.id===week.id);if(wi<0)return;
            if(!d.hrWeeks[wi].receipts)d.hrWeeks[wi].receipts={};
            d.hrWeeks[wi].receipts[empId]={at:nowIso,by:userName||"",verifiedAt:nowIso,verifiedBy:userName||"",mode:"fast"};
            if(!Array.isArray(d.auditLog))d.auditLog=[];
            d.auditLog.unshift({
              id:Math.random().toString(36).slice(2)+Date.now(),
              category:"week",action:"salary_receipt_verified",
              target:"W"+week.weekNum+" — "+emp.name,
              newValue:"✅ تأكيد استلام مرتب — "+fmt0(amount)+" ج (سريع)",
              notes:"المحاسب الثاني (التأكيد): "+(userName||"—")+" | وضع: سريع",
              at:nowIso,severity:"info"
            });
          });
        }
        /* Trigger a UI refresh so the scan appears immediately in the pending list */
        setQueueTick(t=>t+1);
        playBeep("done");
        setVerifyLastScan({emp,amount,at:nowIso,canUndo:true});
        /* Auto-clear undo after 10 seconds */
        setTimeout(()=>setVerifyLastScan(prev=>prev&&prev.emp.id===emp.id?null:prev),10000);
      };
      /* Undo last scan */
      const undoLastScan=()=>{
        if(!verifyLastScan||!verifyLastScan.emp)return;
        const empId=verifyLastScan.emp.id;
        /* V15.25: Remove from queue FIRST — handles case where receipt hasn't synced yet */
        removeReceipt(week.id,empId);
        upConfig(d=>{
          const wi=(d.hrWeeks||[]).findIndex(x=>x.id===week.id);if(wi<0)return;
          if(d.hrWeeks[wi].receipts&&d.hrWeeks[wi].receipts[empId]){
            delete d.hrWeeks[wi].receipts[empId];
          }
          if(!Array.isArray(d.auditLog))d.auditLog=[];
          d.auditLog.unshift({
            id:Math.random().toString(36).slice(2)+Date.now(),
            category:"week",action:"salary_receipt_undo",
            target:"W"+week.weekNum+" — "+verifyLastScan.emp.name,
            newValue:"↩ تراجع عن تسجيل استلام",
            notes:"تراجع بواسطة: "+(userName||"—"),
            at:new Date().toISOString(),severity:"warning"
          });
        });
        showToast("↩ تم التراجع عن "+verifyLastScan.emp.name);
        setVerifyLastScan(null);
      };
      /* Build detail text for WhatsApp */
      const buildWaText=()=>{
        const lines=[
          "*🔐 CLARK — تقرير تأكيد استلام المرتبات*",
          "━━━━━━━━━━━━━━━━",
          "📅 الأسبوع: *W"+week.weekNum+"* ("+week.weekStart+" → "+week.weekEnd+")",
          "👤 المحاسب المؤكِّد: *"+(userName||"—")+"*",
          "🕐 تاريخ التقرير: "+new Date().toLocaleString("ar-EG"),
          "",
          "*📊 الإحصائيات:*",
          "• إجمالي الموظفين: *"+wkEmps.length+"*",
          "• ✅ تأكّد الاستلام: *"+received.length+"*",
          "• ❌ لم يتأكد بعد: *"+notReceived.length+"*",
          "",
          "*💰 المبالغ:*",
          "• إجمالي المستحق: *"+fmt0(r2(totalDue))+"* ج.م",
          "• ✅ تم تأكيده: *"+fmt0(r2(totalPaid))+"* ج.م",
          "• ⚠️ غير مؤكد: *"+fmt0(r2(totalDue-totalPaid))+"* ج.م"
        ];
        if(notReceived.length>0){
          lines.push("");
          lines.push("*⚠️ الموظفين الذين لم يتأكدوا:*");
          notReceived.slice(0,15).forEach(e=>{
            const c=getEmpSalary(e.id,week);
            lines.push("• "+e.name+(e.code?" (#"+e.code+")":"")+" — "+fmt0(c?c.thursdayPay:0)+" ج");
          });
          if(notReceived.length>15)lines.push("... و "+(notReceived.length-15)+" آخرين");
        }
        lines.push("");
        lines.push("🏭 CLARK Factory Management");
        return lines.join("\n");
      };
      /* Print full report as PDF */
      const printVerifyReport=()=>{
        let receivedRows="";
        received.forEach(e=>{
          const c=getEmpSalary(e.id,week);
          const r=receipts[e.id];
          const dt=r?new Date(r.at).toLocaleString("ar-EG"):"—";
          receivedRows+="<tr><td style='border:1px solid #ccc;padding:6px;font-weight:800;color:#0284C7'>"+e.name+"</td><td style='border:1px solid #ccc;padding:6px;font-family:monospace;text-align:center'>"+(e.code||"—")+"</td><td style='border:1px solid #ccc;padding:6px;font-size:10px;color:#555'>"+(e.job||"—")+"</td><td style='border:1px solid #ccc;padding:6px;text-align:center;font-weight:800;color:#10B981'>"+fmt0(c?c.thursdayPay:0)+" ج</td><td style='border:1px solid #ccc;padding:6px;font-size:10px;color:#555;text-align:center'>"+dt+"</td></tr>";
        });
        let notRows="";
        notReceived.forEach(e=>{
          const c=getEmpSalary(e.id,week);
          notRows+="<tr><td style='border:1px solid #ccc;padding:6px;font-weight:800;color:#0284C7'>"+e.name+"</td><td style='border:1px solid #ccc;padding:6px;font-family:monospace;text-align:center'>"+(e.code||"—")+"</td><td style='border:1px solid #ccc;padding:6px;font-size:10px;color:#555'>"+(e.job||"—")+"</td><td style='border:1px solid #ccc;padding:6px;text-align:center;font-weight:800;color:#EF4444'>"+fmt0(c?c.thursdayPay:0)+" ج</td></tr>";
        });
        const html="<html dir='rtl'><head><meta charset='utf-8'><title>تقرير تأكيد استلام — W"+week.weekNum+"</title><link href='https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;800&display=swap' rel='stylesheet'/><style>@page{size:A4;margin:12mm}body{font-family:'Cairo',sans-serif;color:#1E293B;font-size:11px;line-height:1.6}.hdr{text-align:center;border-bottom:3px solid #10B981;padding-bottom:10px;margin-bottom:14px}.hdr h1{color:#10B981;font-size:20px;margin-bottom:4px}.meta{display:flex;justify-content:space-between;margin-bottom:12px;font-size:11px;color:#475569}.summary{display:flex;gap:10px;margin-bottom:14px;justify-content:center;flex-wrap:wrap}.card{padding:10px 16px;border-radius:10px;border:1px solid #ddd;text-align:center;min-width:130px}.card .lbl{font-size:10px;color:#666;margin-bottom:3px}.card .val{font-size:18px;font-weight:800}table{width:100%;border-collapse:collapse;margin:10px 0}th{padding:8px;font-weight:800;text-align:right;border:1px solid #ccc}.ok th{background:#F0FDF4;color:#059669;border-color:#10B98140}.err th{background:#FEF2F2;color:#DC2626;border-color:#EF444440}h2{font-size:14px;margin:16px 0 6px}.sig{margin-top:40px;display:flex;justify-content:space-around;gap:20px}.sig-box{text-align:center;min-width:150px;border-top:2px solid #1E293B;padding-top:8px;font-weight:700;font-size:11px}.foot{margin-top:20px;padding-top:8px;border-top:1px solid #ccc;display:flex;justify-content:space-between;font-size:10px;color:#94A3B8}.pbar{position:sticky;top:0;background:#fff;padding:8px;border-bottom:2px solid #ccc;display:flex;justify-content:center;gap:10px;z-index:99}.pbar button{padding:6px 16px;border-radius:6px;border:1px solid #000;cursor:pointer;font-family:'Cairo';font-size:12px;font-weight:700;background:#fff}.pbar .pr{background:#10B981;color:#fff;border-color:#10B981}@media print{.pbar{display:none}}</style></head><body><div class='pbar'><button onclick='window.close()'>↩ رجوع</button><button class='pr' onclick='window.print()'>🖨 طباعة / حفظ PDF</button></div><div class='hdr'><h1>🔐 تقرير تأكيد استلام المرتبات</h1><div style='font-size:14px;color:#0EA5E9;font-weight:700'>W"+week.weekNum+" — ("+week.weekStart+" → "+week.weekEnd+")</div></div><div class='meta'><span>👤 المحاسب المؤكِّد: <b>"+(userName||"—")+"</b></span><span>📅 "+new Date().toLocaleString("ar-EG")+"</span></div><div class='summary'><div class='card'><div class='lbl'>إجمالي الموظفين</div><div class='val' style='color:#0EA5E9'>"+wkEmps.length+"</div></div><div class='card'><div class='lbl'>✅ تأكّد الاستلام</div><div class='val' style='color:#10B981'>"+received.length+"</div></div><div class='card'><div class='lbl'>❌ لم يتأكد</div><div class='val' style='color:#EF4444'>"+notReceived.length+"</div></div><div class='card'><div class='lbl'>💰 تم تأكيده</div><div class='val' style='color:#10B981;font-size:14px'>"+fmt0(totalPaid)+" ج</div></div><div class='card'><div class='lbl'>⚠️ غير مؤكد</div><div class='val' style='color:#EF4444;font-size:14px'>"+fmt0(totalDue-totalPaid)+" ج</div></div></div>"+(received.length>0?"<h2 style='color:#10B981'>✅ الموظفين الذين تأكّد استلامهم ("+received.length+")</h2><table class='ok'><thead><tr><th>الاسم</th><th style='text-align:center'>الكود</th><th>الوظيفة</th><th style='text-align:center'>المبلغ</th><th style='text-align:center'>وقت التأكيد</th></tr></thead><tbody>"+receivedRows+"</tbody></table>":"")+(notReceived.length>0?"<h2 style='color:#EF4444'>⚠️ الموظفين الذين لم يتأكدوا ("+notReceived.length+")</h2><table class='err'><thead><tr><th>الاسم</th><th style='text-align:center'>الكود</th><th>الوظيفة</th><th style='text-align:center'>المبلغ المستحق</th></tr></thead><tbody>"+notRows+"</tbody></table>":"")+"<div class='sig'><div class='sig-box'>المحاسب المؤكِّد<br/><small style='color:#64748B'>"+(userName||"—")+"</small></div><div class='sig-box'>المحاسب الأول</div><div class='sig-box'>المدير</div></div><div class='foot'><span>CLARK Factory Management</span><span>"+new Date().toLocaleString("ar-EG")+"</span></div></body></html>";
        const pw=_openPrintWin();if(!pw)return;pw.document.write(html);pw.document.close();setTimeout(()=>pw.print(),500);
      };
      const doWhatsapp=()=>{window.open("https://wa.me/?text="+encodeURIComponent(buildWaText()),"_blank")};
      return<div>
        {/* Week selector */}
        <Card style={{marginBottom:12}}>
          <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
            <span style={{fontSize:FS,fontWeight:800,color:T.accent}}>🔐 شاشة المحاسب المؤكِّد</span>
            <div style={{flex:1,minWidth:200}}>
              <Sel value={activeWeekId} onChange={v=>{setVerifySelectedWeekId(v);setVerifyLastScan(null);closeVerifyCam()}}>
                {allWeeks.map(w=><option key={w.id} value={w.id}>{(w.status==="closed"?"✅ ":"🔓 ")+"W"+w.weekNum+" ("+w.weekStart+" → "+w.weekEnd+")"}</option>)}
              </Sel>
            </div>
            <span style={{fontSize:FS-2,color:T.textMut,background:T.bg,padding:"4px 10px",borderRadius:6}}>
              👤 {userName||"—"}
            </span>
          </div>
        </Card>

        {/* V14.63: Mode toggle — detailed (default, safer) vs fast (quick) */}
        <Card style={{marginBottom:12,padding:12}}>
          <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
            <span style={{fontSize:FS-1,fontWeight:700,color:T.textSec,flexShrink:0}}>وضع التأكيد:</span>
            <div style={{display:"flex",gap:0,flex:1,minWidth:260,borderRadius:10,overflow:"hidden",border:"2px solid "+(verifyMode==="fast"?T.warn:T.ok)}}>
              <div onClick={()=>{setVerifyMode("detailed");try{localStorage.setItem("clark_verifyMode","detailed")}catch(e){}}} style={{flex:1,padding:"12px 10px",textAlign:"center",cursor:"pointer",background:verifyMode==="detailed"?T.ok:"transparent",color:verifyMode==="detailed"?"#fff":T.textSec,transition:"all 0.15s"}}>
                <div style={{fontSize:FS,fontWeight:800}}>📋 مفصّل</div>
                <div style={{fontSize:FS-3,opacity:0.85,marginTop:2}}>عرض التفاصيل + تأكيد</div>
              </div>
              <div onClick={()=>{setVerifyMode("fast");try{localStorage.setItem("clark_verifyMode","fast")}catch(e){}}} style={{flex:1,padding:"12px 10px",textAlign:"center",cursor:"pointer",background:verifyMode==="fast"?T.warn:"transparent",color:verifyMode==="fast"?"#fff":T.textSec,transition:"all 0.15s"}}>
                <div style={{fontSize:FS,fontWeight:800}}>⚡ سريع</div>
                <div style={{fontSize:FS-3,opacity:0.85,marginTop:2}}>سكان وتأكيد مباشر</div>
              </div>
            </div>
          </div>
          {verifyMode==="fast"&&<div style={{marginTop:8,padding:"8px 12px",borderRadius:8,background:T.warn+"08",border:"1px solid "+T.warn+"30",fontSize:FS-2,color:T.text,lineHeight:1.5}}>
            ⚠️ <b>تنبيه:</b> في الوضع السريع، التأكيد يحدث فوراً بجرد السكان بدون مراجعة التفاصيل مع الموظف.
          </div>}
        </Card>

        {/* Live stats cards */}
        <div style={{display:"grid",gridTemplateColumns:isMob?"repeat(2,1fr)":"repeat(5,1fr)",gap:10,marginBottom:14}}>
          <div style={{padding:"12px 14px",borderRadius:12,background:T.accent+"08",border:"1px solid "+T.accent+"30",textAlign:"center"}}>
            <div style={{fontSize:FS-3,color:T.textMut,fontWeight:600}}>👥 إجمالي</div>
            <div style={{fontSize:FS+5,fontWeight:900,color:T.accent,lineHeight:1}}>{wkEmps.length}</div>
          </div>
          <div style={{padding:"12px 14px",borderRadius:12,background:T.ok+"08",border:"1px solid "+T.ok+"30",textAlign:"center"}}>
            <div style={{fontSize:FS-3,color:T.textMut,fontWeight:600}}>✅ تأكّد</div>
            <div style={{fontSize:FS+5,fontWeight:900,color:T.ok,lineHeight:1}}>{received.length}</div>
          </div>
          <div style={{padding:"12px 14px",borderRadius:12,background:T.err+"08",border:"1px solid "+T.err+"30",textAlign:"center"}}>
            <div style={{fontSize:FS-3,color:T.textMut,fontWeight:600}}>⏳ متبقي</div>
            <div style={{fontSize:FS+5,fontWeight:900,color:T.err,lineHeight:1}}>{notReceived.length}</div>
          </div>
          <div style={{padding:"12px 14px",borderRadius:12,background:T.ok+"08",border:"1px solid "+T.ok+"30",textAlign:"center"}}>
            <div style={{fontSize:FS-3,color:T.textMut,fontWeight:600}}>💰 تم تأكيده</div>
            <div style={{fontSize:FS+3,fontWeight:900,color:T.ok,lineHeight:1}}>{fmt0(totalPaid)}</div>
          </div>
          <div style={{padding:"12px 14px",borderRadius:12,background:T.warn+"08",border:"1px solid "+T.warn+"30",textAlign:"center"}}>
            <div style={{fontSize:FS-3,color:T.textMut,fontWeight:600}}>⚠️ غير مؤكد</div>
            <div style={{fontSize:FS+3,fontWeight:900,color:T.warn,lineHeight:1}}>{fmt0(totalDue-totalPaid)}</div>
          </div>
        </div>

        {/* V15.26: Amounts Review Checkpoint — mandatory before scan can start */}
        {!verifyAmountsReviewed[week.id]&&!verifyScanning&&(()=>{
          /* Show a summary of amounts the accountant is about to confirm */
          const toReview=wkEmps.map(e=>{const c=getEmpSalary(e.id,week);return{emp:e,amount:c?c.thursdayPay:0,hasIssue:!c||c.thursdayPay<=0}});
          const totalToVerify=toReview.reduce((s,r)=>s+(r.amount||0),0);
          return<Card style={{marginBottom:12,background:"#F59E0B08",border:"2px solid "+T.warn+"60"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
              <span style={{fontSize:26}}>⚠️</span>
              <div>
                <div style={{fontSize:FS+1,fontWeight:800,color:T.warn}}>مراجعة المبالغ قبل السكان</div>
                <div style={{fontSize:FS-2,color:T.textSec,marginTop:2}}>راجع المبالغ أدناه وتأكد من مطابقتها قبل بدء تأكيد الاستلام</div>
              </div>
            </div>
            <div style={{maxHeight:"32vh",overflowY:"auto",border:"1px solid "+T.brd,borderRadius:10,marginBottom:12,background:T.cardSolid}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:FS-1}}>
                <thead style={{position:"sticky",top:0,background:T.bg,zIndex:1}}><tr>
                  <th style={{padding:"8px",textAlign:"right",fontSize:FS-2,color:T.textSec,borderBottom:"2px solid "+T.brd,fontWeight:800}}>الموظف</th>
                  <th style={{padding:"8px",textAlign:"center",fontSize:FS-2,color:T.textSec,borderBottom:"2px solid "+T.brd,fontWeight:800}}>الكود</th>
                  <th style={{padding:"8px",textAlign:"center",fontSize:FS-2,color:T.textSec,borderBottom:"2px solid "+T.brd,fontWeight:800}}>المبلغ</th>
                </tr></thead>
                <tbody>{toReview.map((r,i)=>
                  <tr key={r.emp.id} style={{borderBottom:"1px solid "+T.brd,background:i%2===0?"transparent":T.bg+"40"}}>
                    <td style={{padding:"6px 8px",fontWeight:700,color:T.text,textAlign:"right"}}>{r.emp.name}</td>
                    <td style={{padding:"6px 8px",textAlign:"center",fontSize:FS-2,color:T.textMut,fontFamily:"monospace"}}>{r.emp.code||"—"}</td>
                    <td style={{padding:"6px 8px",textAlign:"center",fontWeight:800,color:r.hasIssue?T.err:T.ok}}>{fmt0(r.amount)}{r.hasIssue&&<span style={{marginInlineStart:4,fontSize:FS-3}}>⚠️</span>}</td>
                  </tr>
                )}
                <tr style={{background:T.warn+"15",fontWeight:800}}>
                  <td colSpan={2} style={{padding:"8px",textAlign:"right",color:T.warn}}>الإجمالي ({toReview.length} موظف)</td>
                  <td style={{padding:"8px",textAlign:"center",color:T.warn,fontSize:FS+1}}>{fmt0(r2(totalToVerify))} ج</td>
                </tr>
                </tbody>
              </table>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
              <Btn onClick={()=>setVerifyAmountsReviewed(p=>({...p,[week.id]:true}))} style={{background:T.ok,color:"#fff",border:"none",fontWeight:800,padding:"10px 20px",fontSize:FS}} title="تأكيد مراجعة المبالغ لبدء السكان">✓ راجعت المبالغ وهي صحيحة</Btn>
              <div style={{fontSize:FS-2,color:T.textMut,flex:1,minWidth:200}}>💡 بعد التأكيد، يمكنك بدء السكان</div>
            </div>
          </Card>;
        })()}

        {/* Main scanner section */}
        <Card style={{marginBottom:12,background:verifyScanning?T.ok+"04":T.cardSolid,border:"2px solid "+(verifyScanning?T.ok:T.brd),opacity:!verifyAmountsReviewed[week.id]?0.5:1,pointerEvents:!verifyAmountsReviewed[week.id]?"none":"auto"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
            <div style={{fontSize:FS+1,fontWeight:800,color:verifyScanning?T.ok:T.text,display:"flex",alignItems:"center",gap:8}}>
              <span>{verifyScanning?"🟢":"📱"}</span>
              <span>{verifyScanning?"الكاميرا نشطة — جاهز للسكان":"ابدأ الكاميرا لمسح QR الموظف"}</span>
            </div>
            <Btn onClick={()=>{if(!canEditVerify){showToast("⛔ ليس لديك صلاحية التأكيد");return}if(verifyScanning){closeVerifyCam()}else{setVerifyScanning(true)}}} disabled={!canEditVerify} style={{background:!canEditVerify?T.textMut+"40":(verifyScanning?T.err:T.ok),color:"#fff",border:"none",fontWeight:800,padding:"10px 24px",fontSize:FS+1,opacity:!canEditVerify?0.6:1,cursor:!canEditVerify?"not-allowed":"pointer"}} title={!canEditVerify?"ليس لديك صلاحية التأكيد":""}>
              {verifyScanning?"⏹ إيقاف الكاميرا":"▶ تشغيل الكاميرا"}
            </Btn>
          </div>
          {verifyScanning&&<div>
            <div style={{position:"relative",width:"100%",maxWidth:isMob?"100%":360,margin:"0 auto",borderRadius:14,overflow:"hidden",background:"#000",aspectRatio:"4/3"}}>
              <video id="verify-scan-video" playsInline muted autoPlay style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}} ref={el=>{if(!el||el.srcObject)return;(async()=>{try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment",width:{ideal:640}}});el.srcObject=stream;
                loadJsQR();const canvas=document.createElement("canvas");let lastScan="";let lastTime=0;
                const scan=async()=>{if(!el.srcObject)return;if(el.readyState<2){requestAnimationFrame(scan);return}canvas.width=el.videoWidth;canvas.height=el.videoHeight;canvas.getContext("2d").drawImage(el,0,0);
                  {const _qr=await scanQR(canvas);if(_qr){const now=Date.now();if(_qr!==lastScan||now-lastTime>3000){lastScan=_qr;lastTime=now;handleVerifyScan(_qr)}}}
                  requestAnimationFrame(scan)};scan()}catch(e){showToast("⚠️ تعذر فتح الكاميرا")}})()}}/>
              {/* Scan frame overlay */}
              <div style={{position:"absolute",inset:"15%",border:"3px dashed "+T.ok,borderRadius:12,pointerEvents:"none"}}></div>
            </div>
            <div style={{textAlign:"center",marginTop:10,fontSize:FS-1,color:T.textMut}}>وجّه الكاميرا على كارت QR الموظف</div>
          </div>}
        </Card>

        {/* Last scan confirmation — big visible toast */}
        {verifyLastScan&&(()=>{
          const s=verifyLastScan;
          const agoSec=Math.floor((Date.now()-new Date(s.at))/1000);
          return<Card style={{marginBottom:12,background:T.ok+"08",border:"3px solid "+T.ok,animation:"fadeSlide 0.3s"}}>
            <div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
              <div style={{width:60,height:60,borderRadius:12,background:T.ok,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:30,flexShrink:0}}>✓</div>
              <div style={{flex:1,minWidth:200}}>
                <div style={{fontSize:FS+4,fontWeight:900,color:T.text,lineHeight:1.2}}>{s.emp.name}</div>
                <div style={{fontSize:FS,color:T.textSec,marginTop:3}}>
                  {s.emp.code?<span style={{color:T.accent,fontFamily:"monospace",marginInlineEnd:10}}>#{s.emp.code}</span>:null}
                  <span style={{color:T.ok,fontWeight:800,fontSize:FS+3}}>{fmt0(s.amount)} ج.م</span>
                </div>
                <div style={{fontSize:FS-2,color:T.textMut,marginTop:4}}>✅ تم التأكيد • منذ {agoSec<5?"لحظات":agoSec+" ثواني"}</div>
              </div>
              {s.canUndo&&<Btn onClick={undoLastScan} style={{background:T.err+"15",color:T.err,border:"1px solid "+T.err+"40",fontWeight:800,padding:"8px 18px"}}>↩ تراجع (10ث)</Btn>}
            </div>
            <style>{`@keyframes fadeSlide{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}`}</style>
          </Card>;
        })()}

        {/* V15.25: Queue status indicator — shows pending/syncing/failed receipts for current week */}
        {(()=>{
          const weekPending=Object.values(getPendingForWeek(week.id));
          if(weekPending.length===0)return null;
          const failed=weekPending.filter(r=>(r._retries||0)>=3);
          const syncing=weekPending.filter(r=>(r._retries||0)<3);
          return<Card style={{marginBottom:12,border:"1.5px solid "+(failed.length>0?T.err+"40":T.warn+"40"),background:failed.length>0?T.err+"08":T.warn+"08"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
              <span style={{fontSize:22}}>{failed.length>0?"⚠️":"⏳"}</span>
              <div style={{flex:1,minWidth:180}}>
                {syncing.length>0&&<div style={{fontSize:FS-1,fontWeight:700,color:T.warn}}>
                  ⏳ {syncing.length} تأكيد جاري حفظه...
                </div>}
                {failed.length>0&&<div style={{fontSize:FS-1,fontWeight:800,color:T.err,marginTop:syncing.length>0?4:0}}>
                  ⚠️ {failed.length} تأكيد لم يُحفظ بعد {Math.max(...failed.map(f=>f._retries||0))} محاولات
                </div>}
                <div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>البيانات محفوظة محلياً — ستُرفع تلقائياً عند استقرار الاتصال</div>
              </div>
              {failed.length>0&&<Btn small onClick={()=>{forceRetryAll(week.id);setQueueTick(t=>t+1);showToast("🔄 جاري إعادة المحاولة...")}} style={{background:T.err+"15",color:T.err,border:"1px solid "+T.err+"40",fontWeight:700}}>🔄 إعادة المحاولة</Btn>}
            </div>
          </Card>;
        })()}

        {/* Quick report toggle */}
        <Card>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:verifyQuickReport?12:0}}>
            <Btn onClick={()=>setVerifyQuickReport(p=>!p)} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30",fontWeight:700}}>
              {verifyQuickReport?"▲":"▼"} {verifyQuickReport?"إخفاء":"عرض"} القائمة ({wkEmps.length})
            </Btn>
            <Btn onClick={printVerifyReport} style={{background:"#10B98112",color:"#10B981",border:"1px solid #10B98130",fontWeight:700}}>📄 تقرير + PDF</Btn>
            <Btn onClick={doWhatsapp} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630",fontWeight:700}}>📱 واتساب المدير</Btn>
            {/* V15.25: Verification check — confirms all scanned receipts are safely in Firestore */}
            <Btn onClick={async()=>{
              const pending=Object.keys(getPendingForWeek(week.id)).length;
              try{
                /* Read fresh from Firestore to compare */
                const freshSnap=await getDoc(doc(db,"factory","config"));
                if(!freshSnap.exists()){showToast("⚠️ لا يمكن قراءة البيانات من السحابة");return}
                const freshData=freshSnap.data();
                const freshWeek=(freshData.hrWeeks||[]).find(w=>w.id===week.id);
                const fsReceiptsCount=freshWeek?Object.keys(freshWeek.receipts||{}).length:0;
                const uiReceiptsCount=received.length;
                if(pending===0&&fsReceiptsCount===uiReceiptsCount){
                  showToast("✅ كل التأكيدات محفوظة بأمان ("+fsReceiptsCount+" تأكيد)");
                }else if(pending>0){
                  showToast("⏳ "+pending+" تأكيد جاري الحفظ — في السحابة: "+fsReceiptsCount);
                }else{
                  showToast("⚠️ اختلاف: الشاشة="+uiReceiptsCount+" | السحابة="+fsReceiptsCount+" — جاري إعادة المزامنة");
                  forceRetryAll(week.id);setQueueTick(t=>t+1);
                }
              }catch(e){
                showToast("⚠️ فشل الفحص: "+(e.message||"خطأ غير معروف"));
              }
            }} style={{background:"#8B5CF612",color:"#8B5CF6",border:"1px solid #8B5CF630",fontWeight:700}} title="يقارن بين الشاشة والسحابة للتأكد من حفظ كل التأكيدات">🔍 فحص التأكيدات</Btn>
          </div>
          {verifyQuickReport&&<div style={{maxHeight:"50vh",overflowY:"auto",border:"1px solid "+T.brd,borderRadius:10}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}><thead style={{position:"sticky",top:0,background:T.bg,zIndex:1}}><tr>
              {["الاسم","الكود","المبلغ","الحالة","التأكيد"].map(h=><th key={h} style={{padding:"8px",textAlign:"center",fontSize:FS-2,color:T.textSec,borderBottom:"2px solid "+T.brd,fontWeight:800}}>{h}</th>)}
            </tr></thead><tbody>
              {wkEmps.sort((a,b)=>{const ra=!!receipts[a.id];const rb=!!receipts[b.id];if(ra!==rb)return ra?1:-1;return (a.name||"").localeCompare(b.name||"")}).map((e,i)=>{
                const c=getEmpSalary(e.id,week);
                const r=receipts[e.id];
                return<tr key={e.id} style={{borderBottom:"1px solid "+T.brd,background:i%2===0?"transparent":T.bg+"50"}}>
                  <td style={{padding:"7px",fontWeight:700,color:T.text,textAlign:"right"}}>{e.name}{e.job?<span style={{fontSize:FS-3,color:T.textMut,marginInlineStart:6}}>({e.job})</span>:""}</td>
                  <td style={{padding:"7px",textAlign:"center",fontFamily:"monospace",color:T.accent,fontWeight:700}}>{e.code||"—"}</td>
                  <td style={{padding:"7px",textAlign:"center",fontWeight:800,color:r?T.ok:T.err}}>{fmt0(c?c.thursdayPay:0)}</td>
                  <td style={{padding:"7px",textAlign:"center"}}>
                    {r?<span style={{padding:"3px 10px",borderRadius:6,background:T.ok+"15",color:T.ok,fontSize:FS-2,fontWeight:800}}>✓ تأكّد</span>
                       :<span style={{padding:"3px 10px",borderRadius:6,background:T.err+"15",color:T.err,fontSize:FS-2,fontWeight:800}}>⏳ متبقي</span>}
                  </td>
                  <td style={{padding:"7px",textAlign:"center",fontSize:FS-3,color:T.textMut}}>
                    {r?new Date(r.at).toLocaleTimeString("ar-EG",{hour:"2-digit",minute:"2-digit"}):"—"}
                  </td>
                </tr>;
              })}
            </tbody></table>
          </div>}
        </Card>
      </div>;
    })()}

    {/* ══ V14.63: DETAILED REVIEW POPUP — shows full salary details to employee ══ */}
    {verifyReview&&(()=>{
      const{emp,week:w}=verifyReview;
      /* V15.19: ALWAYS read salary fresh from getEmpSalary() instead of using the snapshot 
         that was captured when scanning. This ensures the popup reflects the SAME values 
         shown in the salary table at render time — not stale data from when the scan happened. */
      const salary=getEmpSalary(emp.id,w);
      if(!salary)return null;
      const close=()=>{setVerifyReview(null);setTimeout(()=>setVerifyScanning(true),100)};
      /* Inline handlers — popup is outside IIFE scope so helpers must live here */
      const confirmReview=()=>{
        const amount=salary?salary.thursdayPay:0;
        const nowIso=new Date().toISOString();
        upConfig(d=>{
          const wi=(d.hrWeeks||[]).findIndex(x=>x.id===w.id);if(wi<0)return;
          if(!d.hrWeeks[wi].receipts)d.hrWeeks[wi].receipts={};
          d.hrWeeks[wi].receipts[emp.id]={at:nowIso,by:userName||"",verifiedAt:nowIso,verifiedBy:userName||"",mode:"detailed"};
          if(!Array.isArray(d.auditLog))d.auditLog=[];
          d.auditLog.unshift({
            id:Math.random().toString(36).slice(2)+Date.now(),
            category:"week",action:"salary_receipt_verified",
            target:"W"+w.weekNum+" — "+emp.name,
            newValue:"✅ تأكيد استلام مرتب — "+fmt0(amount)+" ج (مفصّل - الموظف راجع التفاصيل)",
            notes:"المحاسب الثاني (التأكيد): "+(userName||"—")+" | وضع: مفصّل",
            at:nowIso,severity:"info"
          });
        });
        playBeep("done");
        setVerifyLastScan({emp,amount,at:nowIso,canUndo:true});
        setTimeout(()=>setVerifyLastScan(prev=>prev&&prev.emp.id===emp.id?null:prev),10000);
        setVerifyReview(null);
        setTimeout(()=>setVerifyScanning(true),100);
      };
      const reportIssueReview=()=>{
        const amount=salary?salary.thursdayPay:0;
        const nowIso=new Date().toISOString();
        upConfig(d=>{
          const wi=(d.hrWeeks||[]).findIndex(x=>x.id===w.id);if(wi<0)return;
          if(!d.hrWeeks[wi].receiptIssues)d.hrWeeks[wi].receiptIssues={};
          d.hrWeeks[wi].receiptIssues[emp.id]={at:nowIso,by:userName||"",amount};
          if(!Array.isArray(d.auditLog))d.auditLog=[];
          d.auditLog.unshift({
            id:Math.random().toString(36).slice(2)+Date.now(),
            category:"week",action:"salary_receipt_issue",
            target:"W"+w.weekNum+" — "+emp.name,
            newValue:"⚠️ مشكلة في الاستلام — "+fmt0(amount)+" ج",
            notes:"المحاسب الثاني رفع مشكلة: "+(userName||"—")+" | تحتاج مراجعة مع المحاسب الأول",
            at:nowIso,severity:"warning"
          });
        });
        playBeep("error");
        showToast("⚠️ تم تسجيل مشكلة في استلام "+emp.name+" — يتم المراجعة");
        setVerifyReview(null);
        setTimeout(()=>setVerifyScanning(true),100);
      };
      return<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:10005,display:"flex",alignItems:"center",justifyContent:"center",padding:12,backdropFilter:"blur(6px)"}} onClick={close}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,width:"100%",maxWidth:isMob?"100%":620,maxHeight:"95vh",overflowY:"auto",border:"3px solid "+T.ok,boxShadow:"0 25px 70px rgba(0,0,0,0.5)",display:"flex",flexDirection:"column"}}>
          {/* Sticky header */}
          <div style={{padding:"14px 20px",borderBottom:"2px solid "+T.ok+"25",display:"flex",justifyContent:"space-between",alignItems:"center",background:T.cardSolid,position:"sticky",top:0,zIndex:2}}>
            <div style={{fontSize:FS+3,fontWeight:900,color:T.ok,display:"flex",alignItems:"center",gap:8}}>
              <span>📄</span><span>مراجعة مرتب — W{w.weekNum}</span>
            </div>
            <span onClick={close} style={{cursor:"pointer",fontSize:26,color:T.textMut,padding:4,lineHeight:1}}>✕</span>
          </div>

          <div style={{padding:20}}>
            {/* Employee header — blue card */}
            <div style={{padding:"16px 18px",borderRadius:14,background:T.accent+"08",border:"2px solid "+T.accent+"25",marginBottom:14}}>
              <div style={{fontSize:FS+10,fontWeight:900,color:T.text,lineHeight:1.2,marginBottom:8}}>👤 {emp.name}</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:isMob?8:14,fontSize:FS,color:T.textSec,fontWeight:600}}>
                {emp.job&&<span>🏭 <b style={{color:T.text}}>{emp.job}</b></span>}
                {emp.code&&<span>🔢 كود: <b style={{color:T.accent,fontFamily:"monospace"}}>{emp.code}</b></span>}
                {emp.code&&<span>🖐️ بصمة: <b style={{color:T.accent,fontFamily:"monospace"}}>{emp.code}</b></span>}
              </div>
            </div>

            {/* Earnings — green card */}
            <div style={{padding:"14px 16px",borderRadius:14,background:T.ok+"06",border:"2px solid "+T.ok+"25",marginBottom:12}}>
              <div style={{fontSize:FS+1,fontWeight:900,color:T.ok,marginBottom:10,paddingBottom:6,borderBottom:"1px solid "+T.ok+"25"}}>💰 الاستحقاقات</div>
              {/* Basic salary */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",fontSize:FS+1,fontWeight:700,color:T.text}}>
                <div>
                  <div>المرتب الأساسي</div>
                  <div style={{fontSize:FS-2,color:T.textMut,fontWeight:500,marginTop:2}}>({r2(salary.basicHours)} ساعة × {r2(salary.perHour)} ج)</div>
                </div>
                <div style={{fontFamily:"monospace",color:T.ok,fontSize:FS+3,fontWeight:900}}>{fmt0(salary.basicPay)} ج</div>
              </div>
              {/* Overtime */}
              {salary.overtimeHours>0&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",fontSize:FS+1,fontWeight:700,color:T.text,borderTop:"1px dashed "+T.brd}}>
                <div>
                  <div>الإضافي ({r2(salary.overtimeHours)} ساعة)</div>
                  <div style={{fontSize:FS-2,color:T.textMut,fontWeight:500,marginTop:2}}>(× {OT_MULT || 1.5})</div>
                </div>
                <div style={{fontFamily:"monospace",color:T.ok,fontSize:FS+3,fontWeight:900}}>{fmt0(salary.overtimePay)} ج</div>
              </div>}
              {/* Bonus */}
              {salary.bonus>0&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",fontSize:FS+1,fontWeight:700,color:T.text,borderTop:"1px dashed "+T.brd}}>
                <div>🎁 الحافز</div>
                <div style={{fontFamily:"monospace",color:T.ok,fontSize:FS+3,fontWeight:900}}>{fmt0(salary.bonus)} ج</div>
              </div>}
              {/* Total earnings */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0 0",marginTop:6,borderTop:"2px solid "+T.ok+"40",fontSize:FS+2,fontWeight:900,color:T.ok}}>
                <span>الإجمالي المستحق</span>
                <span style={{fontFamily:"monospace",fontSize:FS+5}}>{fmt0(salary.grossPay+salary.bonus)} ج</span>
              </div>
            </div>

            {/* Deductions — orange card */}
            {(salary.weekAdvances>0||salary.specialDeduct>0||salary.debtInstall>0)&&<div style={{padding:"14px 16px",borderRadius:14,background:T.warn+"06",border:"2px solid "+T.warn+"30",marginBottom:12}}>
              <div style={{fontSize:FS+1,fontWeight:900,color:T.warn,marginBottom:10,paddingBottom:6,borderBottom:"1px solid "+T.warn+"25"}}>📉 المخصومات</div>
              {salary.weekAdvances>0&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",fontSize:FS+1,fontWeight:700,color:T.text}}>
                <span>سلفة</span>
                <span style={{fontFamily:"monospace",color:T.warn,fontSize:FS+2,fontWeight:900}}>- {fmt0(salary.weekAdvances)} ج</span>
              </div>}
              {salary.debtInstall>0&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",fontSize:FS+1,fontWeight:700,color:T.text,borderTop:"1px dashed "+T.brd}}>
                <span>خصم (قسط)</span>
                <span style={{fontFamily:"monospace",color:T.warn,fontSize:FS+2,fontWeight:900}}>- {fmt0(salary.debtInstall)} ج</span>
              </div>}
              {salary.specialDeduct>0&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",fontSize:FS+1,fontWeight:700,color:T.text,borderTop:"1px dashed "+T.brd}}>
                <span>خصم خاص</span>
                <span style={{fontFamily:"monospace",color:T.warn,fontSize:FS+2,fontWeight:900}}>- {fmt0(salary.specialDeduct)} ج</span>
              </div>}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0 0",marginTop:6,borderTop:"2px solid "+T.warn+"40",fontSize:FS+1,fontWeight:900,color:T.warn}}>
                <span>إجمالي المخصوم</span>
                <span style={{fontFamily:"monospace",fontSize:FS+2}}>- {fmt0((salary.weekAdvances||0)+(salary.specialDeduct||0)+(salary.debtInstall||0))} ج</span>
              </div>
            </div>}

            {/* V15.15: Previous balance + Next week carry — info boxes (always show for clarity) */}
            <div style={{padding:"12px 14px",borderRadius:12,background:T.bg,border:"1px solid "+T.brd,marginBottom:12,display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,fontSize:FS,fontWeight:700}}>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:FS-2,color:T.textMut,fontWeight:600,marginBottom:4}}>🔄 رصيد سابق</div>
                <div style={{fontFamily:"monospace",fontWeight:900,color:salary.prevBalance>0?T.warn:salary.prevBalance<0?T.err:T.textMut,fontSize:FS+2}}>
                  {salary.prevBalance>0?"+":""}{fmt0(salary.prevBalance)} ج
                </div>
                <div style={{fontSize:FS-4,color:T.textMut,marginTop:2}}>(من الأسبوع السابق)</div>
              </div>
              <div style={{textAlign:"center",borderInlineStart:"1px solid "+T.brd,paddingInlineStart:12}}>
                <div style={{fontSize:FS-2,color:T.textMut,fontWeight:600,marginBottom:4}}>⏭️ يترحل للأسبوع القادم</div>
                <div style={{fontFamily:"monospace",fontWeight:900,color:salary.remainingBalance>0?T.warn:salary.remainingBalance<0?T.err:T.textMut,fontSize:FS+2}}>
                  {salary.remainingBalance>0?"+":""}{fmt0(salary.remainingBalance)} ج
                </div>
                <div style={{fontSize:FS-4,color:T.textMut,marginTop:2}}>(= صافي − دفعة من الحساب)</div>
              </div>
            </div>

            {/* BIG NUMBER = thursdayPay (actual amount accountant will pay TO HAND to employee).
               V15.21: Subtext shows totalDue (= netBalance + prevBalance) = what employee is truly owed. */}
            <div style={{padding:"20px 24px",borderRadius:18,background:"linear-gradient(135deg, "+T.ok+"15, "+T.ok+"08)",border:"3px solid "+T.ok,marginBottom:16,textAlign:"center"}}>
              <div style={{fontSize:FS,color:T.textSec,fontWeight:700,marginBottom:8}}>💵 المبلغ الفعلي اللي هيستلمه</div>
              <div style={{fontSize:isMob?38:48,fontWeight:900,color:T.ok,lineHeight:1,fontFamily:"monospace"}}>{fmt0(salary.thursdayPay)}</div>
              <div style={{fontSize:FS+1,color:T.ok,fontWeight:800,marginTop:4}}>ج.م</div>
              <div style={{fontSize:FS-2,color:T.textMut,marginTop:6,fontWeight:600}}>
                {salary.prevBalance!==0?
                  "(من أصل "+fmt0(salary.totalDue)+" ج.م = صافي "+fmt0(salary.netBalance)+" + رصيد سابق "+fmt0(salary.prevBalance)+")"
                :"(من أصل صافي "+fmt0(salary.netBalance)+" ج.م)"}
              </div>
            </div>

            {/* Confirmation prompt */}
            <div style={{padding:"12px 16px",borderRadius:12,background:T.accent+"08",border:"1px solid "+T.accent+"25",marginBottom:14,textAlign:"center"}}>
              <div style={{fontSize:FS+1,fontWeight:800,color:T.text,lineHeight:1.5}}>
                هل استلم <b style={{color:T.accent}}>{emp.name}</b> مبلغ <b style={{color:T.ok,fontFamily:"monospace"}}>{fmt0(salary.thursdayPay)} ج.م</b> كاملاً؟
              </div>
            </div>

            {/* Action buttons — big and clear */}
            <div style={{display:"flex",gap:10,flexDirection:isMob?"column":"row"}}>
              <Btn onClick={reportIssueReview} style={{flex:1,background:T.err,color:"#fff",border:"none",fontWeight:900,padding:"14px 20px",fontSize:FS+2}}>⚠️ مشكلة — للمراجعة</Btn>
              <Btn onClick={confirmReview} style={{flex:2,background:T.ok,color:"#fff",border:"none",fontWeight:900,padding:"14px 20px",fontSize:FS+2}}>✅ تأكيد الاستلام</Btn>
            </div>
          </div>
        </div>
      </div>;
    })()}

    {/* ══ SECURITY & AUDIT — Dashboard, Flags, Audit Log ══ */}
    {view==="security"&&(()=>{
      /* KPIs — this week */
      const activeOpenWeek=hrWeeks.find(w=>w.status!=="closed");
      /* Manual edits count (attendance) in last 30 days */
      const cutoff=Date.now()-30*86400000;
      const recentAudits=auditLog.filter(a=>new Date(a.ts).getTime()>cutoff);
      const manualEditsCount=recentAudits.filter(a=>a.category==="attendance"&&a.action==="manual_edit").length;
      const pasteCount=recentAudits.filter(a=>a.category==="attendance"&&a.action==="paste_biometric").length;
      const codeChanges=recentAudits.filter(a=>a.category==="employee"&&a.action==="code_change").length;
      const salaryChanges=recentAudits.filter(a=>a.category==="employee"&&a.action==="salary_change").length;
      const advDeletes=recentAudits.filter(a=>a.category==="advance"&&a.action==="delete_weekly").length;
      const dangerEvents=recentAudits.filter(a=>a.severity==="danger").length;
      /* Top overtime employees (current open week or last closed) */
      const refWeek=activeOpenWeek||hrWeeks.find(w=>w.status==="closed");
      const topOT=[];const topAdv=[];
      if(refWeek){
        activeEmps.forEach(emp=>{const c=calcSalary(emp.id,refWeek);if(c){
          if(c.overtimeHours>0)topOT.push({name:emp.name,code:emp.code,hours:c.overtimeHours,pay:c.overtimePay});
          if(c.weekAdvances>0)topAdv.push({name:emp.name,code:emp.code,amount:c.weekAdvances});
        }});
        topOT.sort((a,b)=>b.hours-a.hours);
        topAdv.sort((a,b)=>b.amount-a.amount);
      }
      /* Active flags from open week */
      const activeFlags=activeOpenWeek?computeSecurityFlags(activeOpenWeek):[];
      /* Audit log filters */
      return<div>
        {/* KPIs Grid */}
        <div style={{display:"grid",gridTemplateColumns:isMob?"repeat(2,1fr)":"repeat(6,1fr)",gap:10,marginBottom:14}}>
          <div style={{padding:12,borderRadius:12,background:T.warn+"08",border:"1px solid "+T.warn+"20",textAlign:"center"}}>
            <div style={{fontSize:FS-3,color:T.textSec,marginBottom:2}}>✏️ تعديلات يدوية</div>
            <div style={{fontSize:FS+4,fontWeight:800,color:T.warn}}>{manualEditsCount}</div>
            <div style={{fontSize:FS-4,color:T.textMut}}>آخر 30 يوم</div>
          </div>
          <div style={{padding:12,borderRadius:12,background:T.accent+"08",border:"1px solid "+T.accent+"20",textAlign:"center"}}>
            <div style={{fontSize:FS-3,color:T.textSec,marginBottom:2}}>📋 لصق بصمة</div>
            <div style={{fontSize:FS+4,fontWeight:800,color:T.accent}}>{pasteCount}</div>
            <div style={{fontSize:FS-4,color:T.textMut}}>آخر 30 يوم</div>
          </div>
          <div style={{padding:12,borderRadius:12,background:T.err+"08",border:"1px solid "+T.err+"20",textAlign:"center"}}>
            <div style={{fontSize:FS-3,color:T.textSec,marginBottom:2}}>🔑 تغيير كود</div>
            <div style={{fontSize:FS+4,fontWeight:800,color:T.err}}>{codeChanges}</div>
            <div style={{fontSize:FS-4,color:T.textMut}}>آخر 30 يوم</div>
          </div>
          <div style={{padding:12,borderRadius:12,background:"#F9731608",border:"1px solid #F9731620",textAlign:"center"}}>
            <div style={{fontSize:FS-3,color:T.textSec,marginBottom:2}}>💰 تغيير مرتب</div>
            <div style={{fontSize:FS+4,fontWeight:800,color:"#F97316"}}>{salaryChanges}</div>
            <div style={{fontSize:FS-4,color:T.textMut}}>آخر 30 يوم</div>
          </div>
          <div style={{padding:12,borderRadius:12,background:"#DC262608",border:"1px solid #DC262620",textAlign:"center"}}>
            <div style={{fontSize:FS-3,color:T.textSec,marginBottom:2}}>🗑️ حذف سلف</div>
            <div style={{fontSize:FS+4,fontWeight:800,color:"#DC2626"}}>{advDeletes}</div>
            <div style={{fontSize:FS-4,color:T.textMut}}>آخر 30 يوم</div>
          </div>
          <div style={{padding:12,borderRadius:12,background:dangerEvents>0?T.err+"15":T.ok+"08",border:"2px solid "+(dangerEvents>0?T.err+"40":T.ok+"30"),textAlign:"center"}}>
            <div style={{fontSize:FS-3,color:T.textSec,marginBottom:2}}>🚨 أحداث خطرة</div>
            <div style={{fontSize:FS+4,fontWeight:800,color:dangerEvents>0?T.err:T.ok}}>{dangerEvents}</div>
            <div style={{fontSize:FS-4,color:T.textMut}}>آخر 30 يوم</div>
          </div>
        </div>

        {/* Active Flags from open week — with dismiss controls */}
        {activeOpenWeek&&(()=>{const hasDismissed=(activeOpenWeek.dismissedFlags||[]).length>0;
          if(activeFlags.length===0){
            if(hasDismissed)return<Card style={{marginBottom:14,background:T.ok+"04",border:"1px solid "+T.ok+"30"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0"}}>
                <span style={{fontSize:FS-1,color:T.ok,fontWeight:700}}>✅ لا توجد تنبيهات نشطة — {(activeOpenWeek.dismissedFlags||[]).length} تنبيه مخفي</span>
                <Btn small onClick={restoreDismissedFlags} style={{background:T.textSec+"12",color:T.textSec,border:"1px solid "+T.textSec+"30",fontWeight:700}}>🔄 استرجاع المخفية</Btn>
              </div>
            </Card>;
            return null;
          }
          const byType={danger:activeFlags.filter(f=>f.severity==="danger"),warning:activeFlags.filter(f=>f.severity==="warning")};
          return<Card title={"🚩 تنبيهات نشطة — W"+activeOpenWeek.weekNum+" ("+activeFlags.length+")"} style={{marginBottom:14,border:"2px solid "+(byType.danger.length>0?T.err+"60":T.warn+"40")}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,paddingBottom:8,borderBottom:"1px solid "+T.brd}}>
              <div style={{fontSize:FS-2,color:T.textSec}}>
                {byType.danger.length>0&&<span style={{color:T.err,fontWeight:700}}>{byType.danger.length} خطر • </span>}
                {byType.warning.length>0&&<span style={{color:T.warn,fontWeight:700}}>{byType.warning.length} تحذير</span>}
              </div>
              <div style={{display:"flex",gap:6}}>
                {hasDismissed&&<Btn small onClick={restoreDismissedFlags} style={{background:T.textSec+"12",color:T.textSec,border:"1px solid "+T.textSec+"30",fontSize:FS-2,padding:"3px 8px"}}>🔄 استرجاع ({(activeOpenWeek.dismissedFlags||[]).length})</Btn>}
                <Btn small onClick={dismissAllFlags} style={{background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30",fontWeight:700,fontSize:FS-2,padding:"3px 8px"}}>🗑️ تجاهل الكل</Btn>
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {activeFlags.map((f,i)=>{
                const flagKey=f.type+"|"+(f.emp||"")+"|"+(f.msg||"");
                return<div key={i} style={{display:"flex",gap:10,padding:"10px 12px",borderRadius:10,background:(f.severity==="danger"?T.err:T.warn)+"08",border:"1px solid "+(f.severity==="danger"?T.err:T.warn)+"25"}}>
                  <span style={{fontSize:18}}>{f.icon}</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:FS-1,fontWeight:700,color:f.severity==="danger"?T.err:T.warn}}>{f.msg}</div>
                    {f.code&&<div style={{fontSize:FS-3,color:T.textMut,marginTop:2,direction:"ltr",textAlign:"right"}}>كود البصمة: {f.code}</div>}
                  </div>
                  <span style={{padding:"2px 8px",borderRadius:6,fontSize:FS-3,fontWeight:800,background:(f.severity==="danger"?T.err:T.warn)+"18",color:f.severity==="danger"?T.err:T.warn,flexShrink:0}}>
                    {f.severity==="danger"?"خطر":"تحذير"}
                  </span>
                  <span onClick={()=>dismissFlag(flagKey)} title="إخفاء هذا التنبيه" style={{cursor:"pointer",padding:"3px 8px",borderRadius:6,fontSize:FS-2,fontWeight:800,background:T.textMut+"15",color:T.textMut,flexShrink:0,border:"1px solid "+T.textMut+"30"}}>✕</span>
                </div>;
              })}
            </div>
          </Card>;
        })()}

        {/* Top 5 Overtime + Top 5 Advances */}
        {refWeek&&<div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:12,marginBottom:14}}>
          <Card title={"⏰ أعلى 5 في الإضافي — W"+refWeek.weekNum}>
            {topOT.length===0?<div style={{padding:14,textAlign:"center",color:T.textMut,fontSize:FS-1}}>لا يوجد إضافي</div>:<div style={{display:"flex",flexDirection:"column",gap:6}}>
              {topOT.slice(0,5).map((e,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",borderRadius:8,background:i===0?"#8B5CF612":T.bg,border:"1px solid "+(i===0?"#8B5CF630":T.brd)}}>
                <div>
                  <div style={{fontSize:FS-1,fontWeight:700}}>{i+1}. {e.name}</div>
                  {e.code&&<div style={{fontSize:FS-3,color:T.textMut,direction:"ltr",textAlign:"right"}}>#{e.code}</div>}
                </div>
                <div style={{textAlign:"left"}}>
                  <div style={{fontSize:FS,fontWeight:800,color:"#8B5CF6"}}>{hrsToHM(e.hours)}</div>
                  <div style={{fontSize:FS-3,color:T.textMut}}>{fmt0(e.pay)} ج</div>
                </div>
              </div>)}
            </div>}
          </Card>
          <Card title={"💸 أعلى 5 في السلف — W"+refWeek.weekNum}>
            {topAdv.length===0?<div style={{padding:14,textAlign:"center",color:T.textMut,fontSize:FS-1}}>لا توجد سلف</div>:<div style={{display:"flex",flexDirection:"column",gap:6}}>
              {topAdv.slice(0,5).map((e,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",borderRadius:8,background:i===0?T.err+"12":T.bg,border:"1px solid "+(i===0?T.err+"30":T.brd)}}>
                <div>
                  <div style={{fontSize:FS-1,fontWeight:700}}>{i+1}. {e.name}</div>
                  {e.code&&<div style={{fontSize:FS-3,color:T.textMut,direction:"ltr",textAlign:"right"}}>#{e.code}</div>}
                </div>
                <div style={{fontSize:FS+1,fontWeight:800,color:T.err}}>{fmt0(e.amount)} ج</div>
              </div>)}
            </div>}
          </Card>
        </div>}

        {/* Audit Log table */}
        <Card title={"📜 سجل التدقيق ("+auditLog.length+" حركة)"}>
          {auditLog.length===0?<div style={{padding:40,textAlign:"center",color:T.textMut}}>
            <div style={{fontSize:48,marginBottom:8}}>📜</div>
            <div style={{fontSize:FS}}>لا توجد حركات مسجلة بعد</div>
            <div style={{fontSize:FS-2,marginTop:4}}>كل تعديل حساس سيُسجل هنا تلقائياً</div>
          </div>:<div style={{overflowX:"auto",maxHeight:500,overflowY:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:FS-1}}>
              <thead style={{position:"sticky",top:0,zIndex:1,background:T.cardSolid}}>
                <tr>
                  <th style={TH}>الوقت</th>
                  <th style={TH}>النوع</th>
                  <th style={TH}>الهدف</th>
                  <th style={TH}>القيم</th>
                  <th style={TH}>المستخدم</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.slice(0,300).map((a,i)=>{
                  const cats={attendance:{icon:"📋",label:"حضور",color:"#0284C7"},salary:{icon:"💰",label:"مرتب",color:T.ok},
                    advance:{icon:"💸",label:"سلفة",color:T.err},employee:{icon:"👤",label:"موظف",color:"#8B5CF6"},
                    week:{icon:"📅",label:"أسبوع",color:"#06B6D4"},settings:{icon:"⚙️",label:"إعدادات",color:T.textMut},general:{icon:"📝",label:"عام",color:T.textMut}};
                  const cat=cats[a.category]||cats.general;
                  const sevColor=a.severity==="danger"?T.err:a.severity==="warning"?T.warn:T.textSec;
                  return<tr key={a.id||i} style={{borderBottom:"1px solid "+T.brd,background:i%2===1?T.bg:"transparent"}}>
                    <td style={{...TD,whiteSpace:"nowrap",fontSize:FS-3,color:T.textMut,direction:"ltr",textAlign:"right"}}>
                      <div>{a.date}</div>
                      <div>{new Date(a.ts).toLocaleTimeString("ar-EG",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}</div>
                    </td>
                    <td style={TD}>
                      <span style={{padding:"3px 8px",borderRadius:6,fontSize:FS-3,fontWeight:700,background:cat.color+"15",color:cat.color,whiteSpace:"nowrap"}}>
                        {cat.icon} {cat.label}
                      </span>
                    </td>
                    <td style={{...TD,fontWeight:700}}>{a.target}</td>
                    <td style={{...TD,color:sevColor,fontSize:FS-2}}>
                      {a.oldValue&&<div>قبل: <span style={{color:T.textMut}}>{a.oldValue}</span></div>}
                      {a.newValue&&<div>{a.oldValue?"بعد":""}: <span style={{fontWeight:700}}>{a.newValue}</span></div>}
                      {a.notes&&<div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>{a.notes}</div>}
                    </td>
                    <td style={{...TD,fontSize:FS-2,color:T.textSec}}>{a.user||"—"}</td>
                  </tr>;
                })}
              </tbody>
            </table>
            {auditLog.length>300&&<div style={{padding:10,textAlign:"center",fontSize:FS-2,color:T.textMut}}>
              عرض أحدث 300 حركة • الإجمالي: {auditLog.length}
            </div>}
          </div>}
        </Card>
      </div>;
    })()}

    {/* ══ LOG ══ */}
    {view==="log"&&(()=>{
      const salaryEntries=hrLog.filter(l=>l.type==="salary");
      const advanceEntries=hrLog.filter(l=>l.type==="advance").sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""));
      const weeksMap={};salaryEntries.forEach(l=>{const k=(l.weekStart||"")+"_"+(l.weekEnd||"");if(!weeksMap[k])weeksMap[k]={weekStart:l.weekStart,weekEnd:l.weekEnd,weekNum:getWeekNum(l.weekStart),date:l.date,by:l.by,records:[],totalGross:0,totalNet:0,totalAdvances:0};weeksMap[k].records.push(l);weeksMap[k].totalGross+=l.grossPay||0;weeksMap[k].totalNet+=l.amount||0;weeksMap[k].totalAdvances+=l.weekAdvances||0});
      const weeks=Object.values(weeksMap).sort((a,b)=>(b.weekStart||"").localeCompare(a.weekStart||""));
      return<div>
        <Card title={"📊 سجل المرتبات ("+weeks.length+" أسبوع)"} style={{marginBottom:16}}>
          {weeks.length>0?<div style={{display:"flex",flexDirection:"column",gap:8}}>
            {weeks.map(w=>{const isOpen=openLog===(w.weekStart+"_"+w.weekEnd);
              return<div key={w.weekStart+"_"+w.weekEnd} style={{borderRadius:12,border:"1px solid "+T.brd,overflow:"hidden"}}>
                <div onClick={()=>setOpenLog(isOpen?null:(w.weekStart+"_"+w.weekEnd))} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",cursor:"pointer",background:isOpen?T.accent+"06":T.bg}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:18,fontWeight:800,color:T.accent}}>{"W"+w.weekNum}</span>
                    <div><div style={{fontSize:FS-1,fontWeight:700}}>{w.weekStart+" → "+w.weekEnd}</div><div style={{fontSize:FS-3,color:T.textMut}}>{w.date+" | "+w.records.length+" موظف"}</div></div>
                    <span style={{padding:"2px 8px",borderRadius:6,fontSize:FS-3,fontWeight:700,background:T.ok+"12",color:T.ok}}>✅ مقفول</span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:FS+1,fontWeight:800,color:T.accent}}>{fmt0(r2(w.totalNet))}</span>
                    <span style={{fontSize:14,color:T.textMut,transform:isOpen?"rotate(180deg)":"",transition:"transform 0.2s"}}>▼</span>
                  </div>
                </div>
                {isOpen&&<div style={{padding:"0 14px 12px",borderTop:"1px solid "+T.brd}}>
                  <div style={{overflowX:"auto",marginTop:8}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>
                    {["الموظف","مستحق","رصيد سابق","مسحوبات","خصم","حافز","صافي","دفعة","الرصيد المُرحّل"].map(h=><th key={h} style={{padding:"5px 6px",textAlign:"center",fontSize:FS-2,color:T.textSec,borderBottom:"1px solid "+T.brd,fontWeight:700}}>{h}</th>)}
                  </tr></thead><tbody>
                    {w.records.map(r=><tr key={r.id} style={{borderBottom:"1px solid "+T.brd+"40"}}>
                      <td style={{padding:"4px 6px",fontWeight:600,fontSize:FS-1,textAlign:"right"}}>{r.empName}</td>
                      <td style={{padding:"4px 6px",color:T.ok,fontSize:FS-1,textAlign:"center"}}>{fmt0(r.grossPay||0)}</td>
                      <td style={{padding:"4px 6px",fontSize:FS-2,textAlign:"center"}}>{fmt0(r.prevBalance||0)}</td>
                      <td style={{padding:"4px 6px",color:T.err,fontSize:FS-2,textAlign:"center"}}>{r.weekAdvances?fmt0(r.weekAdvances):""}</td>
                      <td style={{padding:"4px 6px",color:T.err,fontSize:FS-2,textAlign:"center"}} title={r.deductReason||""}>{r.specialDeduct?fmt0(r.specialDeduct)+(r.deductReason?" 📝":""):""}</td>
                      <td style={{padding:"4px 6px",color:T.ok,fontSize:FS-2,textAlign:"center"}}>{r.bonus?fmt0(r.bonus):""}</td>
                      <td style={{padding:"4px 6px",fontWeight:800,color:T.accent,textAlign:"center"}}>{fmt0(r2(r.amount))}</td>
                      <td style={{padding:"4px 6px",color:T.ok,fontWeight:700,fontSize:FS-1,textAlign:"center"}}>{r.thursdayPay!=null?fmt0(r.thursdayPay):fmt0(r.amount)}</td>
                      <td style={{padding:"4px 6px",fontWeight:800,color:(r.remainingBalance||0)>0?T.warn:T.textMut,textAlign:"center"}}>{r.remainingBalance!=null?fmt0(r.remainingBalance):"0"}</td>
                    </tr>)}
                  </tbody></table></div>
                </div>}
              </div>})}
          </div>:<div style={{textAlign:"center",padding:20,color:T.textMut}}>لم يتم اعتماد مرتبات بعد</div>}
        </Card>
      </div>})()}
  </div>
}
