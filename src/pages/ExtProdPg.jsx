/* ═══════════════════════════════════════════════════════════════
   CLARK - ExtProdPg.jsx
   
   Extracted from App.jsx in V15.1 phase 3.
   Contains: ExtProdPg
   ═══════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { Btn, Card, DelBtn, Inp, SearchSel, Sel, useDebounced } from "../components/ui.jsx";
import { FKEYS, FS } from "../constants/index.js";
import { CLARK_LOGO } from "../constants/logo.js";
import { db } from "../firebase";
import { T, TD, TDB, TH } from "../theme.js";
import { fmt, gIcon, gf, gid, r2, dayName, openWA } from "../utils/format.js";
import { calcOrder, recomputeStatus, wsIsInternal, wsTypeInfo } from "../utils/orders.js";
import { buildWorkshopSummary, formatWorkshopSummaryWA } from "../utils/accountSummary.js";
import { ask, showToast, tell } from "../utils/popups.js";
import { printPage } from "../utils/print.js";
import { loadQR } from "../utils/qr.js";
import { exportExcel, printLabel, printReceipt, printReceiveReceipt } from "../utils/print-extras.js";
import { autoPost } from "../utils/accounting/autoPost.js";

export function ExtProdPg({data,updOrder,upConfig,isMob,isTab,canEdit,statusCards,season,user}){
  const userName=user?.displayName||user?.email?.split("@")[0]||"";
  const[mode,setMode]=useState(null);
  const[selWs,setSelWs]=useState("");
  const[selOrder,setSelOrder]=useState("");
  const[delQty,setDelQty]=useState(0);
  const[delType,setDelType]=useState("");
  const[delNote,setDelNote]=useState("");const[delAgreed,setDelAgreed]=useState("");
  const[delPrice,setDelPrice]=useState("");
  const[delDate,setDelDate]=useState(new Date().toISOString().split("T")[0]);
  const[rcvInputs,setRcvInputs]=useState({});
  const getRcv=(key)=>rcvInputs[key]||{qty:0,note:"",price:0,quality:"جيد جداً",date:new Date().toISOString().split("T")[0]};
  const setRcv=(key,field,val)=>setRcvInputs(p=>({...p,[key]:{...getRcv(key),[field]:val}}));
  const clearRcv=(key)=>setRcvInputs(p=>{const n={...p};delete n[key];return n});
  /* Payment states */
  const[payWs,setPayWs]=useState("");const[payAmt,setPayAmt]=useState("");const[payNote,setPayNote]=useState("");const[payType,setPayType]=useState("payment");const[payDate,setPayDate]=useState(new Date().toISOString().split("T")[0]);
  const[editPayId,setEditPayId]=useState(null);const[edPayDate,setEdPayDate]=useState("");const[edPayAmt,setEdPayAmt]=useState("");const[edPayNote,setEdPayNote]=useState("");const[edPayType,setEdPayType]=useState("payment");
  const[accWsF,setAccWsF]=useState("الكل");
  const[movQ,setMovQ]=useState("");
  const[selMoves,setSelMoves]=useState(new Set());
  const[movWsF,setMovWsF]=useState("الكل");
  const[movTypeF,setMovTypeF]=useState("الكل");const[lateChecked,setLateChecked]=useState({});const[lateSent,setLateSent]=useState({});
  const[movLimit,setMovLimit]=useState(50);
  const[rcvSearch,setRcvSearch]=useState("");const rcvSearchDeb=useDebounced(rcvSearch,250);
  const[batchItems,setBatchItems]=useState([]);const[batchDate,setBatchDate]=useState(new Date().toISOString().split("T")[0]);const[batchQ,setBatchQ]=useState("");
  const[editMov,setEditMov]=useState(null);
  const[editQty,setEditQty]=useState(0);
  const[editNote,setEditNote]=useState("");
  const[editPrice,setEditPrice]=useState(0);
  const[editDate,setEditDate]=useState("");
  const[editQuality,setEditQuality]=useState("");
  /* V16.10: Transfer delivery between workshops state */
  const[transferMov,setTransferMov]=useState(null);/* {orderId, wdIdx, from, modelNo, qty, garmentType} */
  const[transferToWs,setTransferToWs]=useState("");
  const[transferReason,setTransferReason]=useState("");
  /* V18.16: Hide archived workshops from all pickers/dropdowns */
  const workshops=(data.workshops||[]).filter(w=>!w.archived);
  const isInternal=(name)=>{const w=workshops.find(x=>x.name===name);return w?wsIsInternal(w.type):false};
  const extWorkshops=workshops.filter(w=>!wsIsInternal(w.type));

  /* QR scan receive handler */
  useEffect(()=>{const h=()=>{const qr=window.__qrReceive;if(!qr)return;const ord=data.orders.find(o=>o.id===qr.oid);if(!ord)return;const wd=(ord.workshopDeliveries||[])[qr.wdi];if(!wd)return;setMode("receive");setSelWs(wd.wsName);setRcvSearch(ord.modelNo);delete window.__qrReceive};window.addEventListener("qr-receive",h);return()=>window.removeEventListener("qr-receive",h)},[data.orders]);
  useEffect(()=>{const h=()=>{const qr=window.__qrWsAcc;if(!qr)return;setMode("accounts");setAccWsF(qr.ws);delete window.__qrWsAcc};window.addEventListener("qr-wsacc",h);return()=>window.removeEventListener("qr-wsacc",h)},[]);

  const startEditMov=(m)=>{setEditMov(m);setEditQty(m.qty);setEditNote(m.notes||"");setEditPrice(m.price||0);setEditDate(m.date||"");
    if(m.type==="receive"){const ord=data.orders.find(o=>o.id===m.orderId);const r=ord?.workshopDeliveries?.[m.wdIdx]?.receives?.[m.rIdx];setEditQuality(r?.quality||"جيد جداً")}else{setEditQuality("")}};
  const saveEditMov=()=>{if(!editMov)return;
    if(editMov.type==="deliver"){updOrder(editMov.orderId,o=>{const wd=o.workshopDeliveries[editMov.wdIdx];if(wd){const newPrice=Number(editPrice)||0;const oldPrice=Number(wd.price)||0;
      wd.qty=Number(editQty)||0;wd.notes=editNote;wd.price=newPrice;if(editDate)wd.date=editDate;
      /* Cascade price change to all receives under this delivery.
         Run ALWAYS (not just when newPrice !== oldPrice) to fix any existing inconsistencies
         in legacy data where receives might have stale prices. */
      if(Array.isArray(wd.receives)&&wd.receives.length>0){
        wd.receives.forEach(r=>{
          r.price=newPrice;
          r.amount=r2((Number(r.qty)||0)*newPrice);
        });
      }
      /* Tag the cascade for user feedback */
      if(newPrice!==oldPrice)wd._priceChangedAt=new Date().toISOString();
      };o.status=recomputeStatus(o)})}
    else{updOrder(editMov.orderId,o=>{const wd=o.workshopDeliveries[editMov.wdIdx];const r=wd?.receives?.[editMov.rIdx];if(r){r.qty=Number(editQty)||0;r.notes=editNote;if(editDate)r.date=editDate;if(editQuality)r.quality=editQuality;
      /* Update receive price from delivery price */
      r.price=Number(wd.price)||0;r.amount=r2((Number(r.qty)||0)*r.price)};o.status=recomputeStatus(o)})}
    setEditMov(null);
    if(editMov.type==="deliver"){
      const oldP=Number(editMov.price)||0;const newP=Number(editPrice)||0;
      if(oldP!==newP){showToast("✅ تم التعديل — حساب الورشة تحدث تلقائياً (السعر: "+oldP+" → "+newP+")")}
      else{showToast("✓ تم التعديل — الحسابات محدّثة")}
    }else{showToast("✓ تم التعديل — الحسابات محدّثة")}
  };
  const printMov=(m)=>{
    const ord=data.orders.find(o=>o.id===m.orderId);
    const ws=(data.workshops||[]).find(w=>w.name===m.wsName);
    if(m.type==="deliver")printReceipt(m.wsName||"",ws?ws.owner:"",ord||{modelNo:m.orderNo||"",modelDesc:m.orderDesc||""},m.garmentType||"",m.qty,m.date,0,data.garmentTypes);
    else printReceiveReceipt(m.wsName||"",ord||{modelNo:m.orderNo||"",modelDesc:m.orderDesc||""},m.garmentType||"",m.qty,m.date,0,data.garmentTypes)
  };

  /* V16.10: Transfer a delivery from one workshop to another.
     Updates wd.wsName + cascades to all receives. Logs the transfer in transferHistory. */
  const startTransferMov=(m)=>{
    if(m.type!=="deliver"){showToast("⚠️ يمكن نقل التسليمات فقط (وليس الاستلامات)");return}
    setTransferMov(m);
    setTransferToWs("");
    setTransferReason("");
  };
  const saveTransferMov=()=>{
    if(!transferMov)return;
    const newWs=transferToWs.trim();
    if(!newWs){showToast("⚠️ اختر الورشة الجديدة");return}
    if(newWs===transferMov.wsName){showToast("⚠️ الورشة الجديدة هي نفسها الحالية");return}
    const newWsObj=workshops.find(w=>w.name===newWs);
    if(!newWsObj){showToast("⛔ الورشة غير موجودة");return}
    const fromWs=transferMov.wsName;
    const today=new Date().toISOString().split("T")[0];
    const transferNote="🔀 نُقل من "+fromWs+" إلى "+newWs+" بتاريخ "+today+(transferReason?" — "+transferReason:"");
    updOrder(transferMov.orderId,o=>{
      const wd=o.workshopDeliveries[transferMov.wdIdx];
      if(!wd)return;
      /* Build transfer history entry (preserves audit trail) */
      if(!Array.isArray(wd.transferHistory))wd.transferHistory=[];
      wd.transferHistory.push({
        from:fromWs,
        fromId:wd.wsId||null,
        to:newWs,
        toId:newWsObj.id||null,
        date:today,
        reason:transferReason||"",
        by:user?.displayName||user?.email||"",
        at:new Date().toISOString(),
      });
      /* Update workshop assignment */
      wd.wsName=newWs;
      wd.wsId=newWsObj.id||null;
      wd.wsType=newWsObj.type||"";
      wd.wsOwner=newWsObj.owner||"";
      /* Append transfer note to existing notes */
      wd.notes=(wd.notes?wd.notes+" | ":"")+transferNote;
      /* Cascade to receives — they're tied to the same wd, so wsName follows automatically.
         But if any receive has its own wsName (legacy), update it too */
      if(Array.isArray(wd.receives)){
        wd.receives.forEach(r=>{
          if(r.wsName)r.wsName=newWs;
        });
      }
    });
    setTransferMov(null);
    setTransferToWs("");
    setTransferReason("");
    showToast("✅ تم نقل التسليم من "+fromWs+" إلى "+newWs+" — حسابات الورش تحدثت تلقائياً");
  };

  const wsObj=workshops.find(w=>(w.name||w)===(selWs));
  const prodOrders=useMemo(()=>data.orders.filter(o=>o.status==="تم القص"||o.status==="في التشغيل"),[data.orders]);
  const wsOrders=selWs?data.orders.filter(o=>(o.workshopDeliveries||[]).some(wd=>wd.wsName===selWs)):[];

  const deliverToWs=async(andPrint,andWa,andLabel)=>{
    if(!selWs||!selOrder||!delQty||!delType)return;
    if(!isInternal(selWs)&&!Number(delPrice)){await tell("سعر التشغيل مطلوب","يرجى إدخال سعر التشغيل قبل التسليم",{type:"warning"});return}
    const ord=data.orders.find(o=>o.id===selOrder);if(!ord)return;
    const t=calcOrder(ord);
    const pieces=ord.orderPieces||[];
    /* V15.6: Safety check — piece must be cut (linked to fabric) before delivery */
    if(pieces.length>1){
      const linkedPieces=new Set();FKEYS.forEach(k=>{if(gf(ord,k))(ord["fabricPieces"+k]||[]).forEach(p=>linkedPieces.add(p))});
      if(!linkedPieces.has(delType)){
        await tell("القطعة لم يتم قصها","القطعة «"+delType+"» لم يتم ربطها بخامة (لم تُقص بعد). لا يمكن تسليمها للورشة.",{type:"warning"});
        return;
      }
    }
    let maxAllowed=t.cutQty;
    if(pieces.length>0&&delType){const delForP=(ord.workshopDeliveries||[]).filter(wd=>wd.garmentType===delType).reduce((s,wd)=>s+(Number(wd.qty)||0),0);maxAllowed=t.cutQty-delForP}
    else if(pieces.length===0){const totalDel=(ord.workshopDeliveries||[]).reduce((s,wd)=>s+(Number(wd.qty)||0),0);maxAllowed=t.cutQty-totalDel}
    const saveQty=Math.min(Number(delQty),maxAllowed);if(saveQty<=0){await tell("لا توجد كمية متاحة","الكمية المطلوبة تتجاوز المتاح للتسليم",{type:"warning"});return}
    const saveType=delType;const saveNote=delNote;const savePrice=Number(delPrice)||0;
    const saveModelNo=ord.modelNo;const saveDate=delDate||new Date().toISOString().split("T")[0];
    const availAfter=maxAllowed-saveQty;
    updOrder(selOrder,o=>{
      if(!o.workshopDeliveries)o.workshopDeliveries=[];
      o.workshopDeliveries.push({id:gid(),wsName:selWs,wsId:wsObj?wsObj.id:null,wsType:wsObj?wsObj.type:"",wsOwner:wsObj?wsObj.owner:"",qty:saveQty,garmentType:saveType,notes:saveNote,price:savePrice,date:saveDate,receives:[],createdBy:userName||"",agreedDays:Number(delAgreed)||0});
      o.status=recomputeStatus(o);
    });
    setSelOrder("");setDelQty(0);setDelType("");setDelNote("");setDelPrice("");setDelDate(new Date().toISOString().split("T")[0]);showToast("✓ تم تسليم "+saveQty+" قطعة لـ "+selWs);
    if(andPrint){const printOrd=JSON.parse(JSON.stringify(ord));const pWs=selWs;const pWsOwner=wsObj?wsObj.owner:"";const pGt=data.garmentTypes;setTimeout(()=>printReceipt(pWs,pWsOwner,printOrd,saveType,saveQty,saveDate,Math.max(0,availAfter),pGt),400)}
    if(andLabel){const printOrd=JSON.parse(JSON.stringify(ord));const pWs=selWs;const pGt=data.garmentTypes;setTimeout(()=>printLabel(pWs,printOrd,saveType,saveQty,saveDate,pGt,{type:"deliver",delDate:saveDate,delQty:saveQty}),400)}
    if(andWa){const phone=wsObj?.phone||"";let msg="*CLARK — اذن تسليم ورشة*%0A%0A• الورشة: *"+selWs+"*%0A• رقم الموديل: *"+ord.modelNo+"*%0A• الوصف: "+ord.modelDesc+"%0A• نوع القطعة: *"+saveType+"*%0A• الكمية: *"+saveQty+"* قطعة%0A• السعر: *"+savePrice+"* ج.م/قطعة%0A• التاريخ: *"+saveDate+"*"+(Number(delAgreed)>0?"%0A• مدة التسليم: *"+delAgreed+"* يوم%0A• موعد التسليم: *"+new Date(new Date(saveDate).getTime()+Number(delAgreed)*86400000).toISOString().split("T")[0]+"*":"")+"%0A%0A*برجاء التأكيد*";
      /* V18.33: Append workshop account summary footer */
      const summary=formatWorkshopSummaryWA(buildWorkshopSummary(selWs,data),(data?.printSettings||{}).whatsappSummary);
      if(summary)msg+=encodeURIComponent(summary);
      openWA("https://wa.me/"+(phone?phone.replace(/[^0-9]/g,""):"")+"?text="+msg,"_blank")}
  };

  const receiveFromWs=(orderId,wdIdx,andPrint,printData,cardKey,andWa,andLabel)=>{
    const rv=getRcv(cardKey);
    if(!rv.qty)return;
    const ord=data.orders.find(o=>o.id===orderId);if(!ord)return;
    const wd=(ord.workshopDeliveries||[])[wdIdx];if(!wd)return;
    const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);
    const maxRcv=(Number(wd.qty)||0)-rcvd;
    if(Number(rv.qty)>maxRcv){showToast("⚠️ الكمية "+rv.qty+" أكبر من المتبقي "+maxRcv+" — الحد الأقصى: ما تم تسليمه للورشة");return}
    const saveQty=Math.min(Number(rv.qty),maxRcv);if(saveQty<=0){showToast("⚠️ لا يوجد رصيد متبقي للاستلام");return}
    const saveNote=rv.note;const wdPrice=Number(wd.price)||0;const saveDate=rv.date||new Date().toISOString().split("T")[0];const saveQuality=rv.quality||"جيد جداً";
    updOrder(orderId,o=>{
      if(!o.workshopDeliveries[wdIdx].receives)o.workshopDeliveries[wdIdx].receives=[];
      o.workshopDeliveries[wdIdx].receives.push({date:saveDate,qty:saveQty,notes:saveNote,price:wdPrice,amount:r2(saveQty*wdPrice),quality:saveQuality,createdBy:userName||""});
      o.status=recomputeStatus(o)
    });
    clearRcv(cardKey);showToast("✓ تم استلام "+saveQty+" قطعة");
    if(andPrint&&printData){const pOrd=JSON.parse(JSON.stringify(ord));if(pOrd.workshopDeliveries&&pOrd.workshopDeliveries[wdIdx]){if(!pOrd.workshopDeliveries[wdIdx].receives)pOrd.workshopDeliveries[wdIdx].receives=[];pOrd.workshopDeliveries[wdIdx].receives.push({date:saveDate,qty:saveQty})}const pWs=selWs;const pType=wd.garmentType||"";const pGt=data.garmentTypes;setTimeout(()=>printReceiveReceipt(pWs,pOrd,pType,saveQty,saveDate,0,pGt),400)}
    if(andLabel){const pOrd=JSON.parse(JSON.stringify(ord));const pGt=data.garmentTypes;setTimeout(()=>printLabel(wd.wsName,pOrd,wd.garmentType||"عام",saveQty,saveDate,pGt,{type:"receive",delDate:wd.date,delQty:wd.qty,rcvDate:saveDate,rcvQty:saveQty}),400)}
    if(andWa){const wsObj=workshops.find(w=>w.name===wd.wsName);const phone=wsObj?.phone||"";const totalDelivered=Number(wd.qty)||0;const allRcvs=(wd.receives||[]);const totalRcvBefore=allRcvs.reduce((s,r)=>s+(Number(r.qty)||0),0);const remaining=totalDelivered-(totalRcvBefore+saveQty);const rcvHistory=allRcvs.length>0?allRcvs.map(r=>"  ↩ "+r.date+": *"+r.qty+"* قطعة").join("%0A")+"%0A":"";let msg="*CLARK — اذن استلام من ورشة*%0A%0A• الورشة: *"+wd.wsName+"*%0A• رقم الموديل: *"+ord.modelNo+"*%0A• الوصف: "+ord.modelDesc+"%0A• نوع القطعة: *"+(wd.garmentType||"عام")+"*%0A%0A━━━━━━━━━━━━━━%0A📤 تسليم للورشة: *"+totalDelivered+"* قطعة%0A"+(rcvHistory?"📥 سجل الاستلام:%0A"+rcvHistory:"")+"📥 استلام اليوم: *"+saveQty+"* قطعة%0A📊 الرصيد عند الورشة: *"+Math.max(0,remaining)+"* قطعة%0A━━━━━━━━━━━━━━%0A%0A• التاريخ: *"+saveDate+"*";
      /* V18.33: Append workshop account summary footer */
      const summary=formatWorkshopSummaryWA(buildWorkshopSummary(wd.wsName,data),(data?.printSettings||{}).whatsappSummary);
      if(summary)msg+=encodeURIComponent(summary);
      openWA("https://wa.me/"+(phone?phone.replace(/[^0-9]/g,""):"")+"?text="+msg,"_blank")}
  };

  /* Collect all movements for the log — memoized */
  const movements=useMemo(()=>{const mvs=[];let _mi=0;
  data.orders.forEach(ord=>{(ord.workshopDeliveries||[]).forEach((wd,wdIdx)=>{
    mvs.push({type:"deliver",date:wd.date,wsName:wd.wsName,orderNo:ord.modelNo,orderDesc:ord.modelDesc,qty:wd.qty,garmentType:wd.garmentType||"",price:wd.price||0,notes:wd.notes||"",orderId:ord.id,wdIdx,_i:_mi++,createdBy:wd.createdBy||""});
    (wd.receives||[]).forEach((r,rIdx)=>{mvs.push({type:r.isSettlement?"settlement":"receive",date:r.date,wsName:wd.wsName,orderNo:ord.modelNo,orderDesc:ord.modelDesc,qty:r.qty,garmentType:wd.garmentType||"",notes:r.notes||"",orderId:ord.id,wdIdx,rIdx,_i:_mi++,createdBy:r.createdBy||"",isSettlement:!!r.isSettlement})})
  })});
  mvs.sort((a,b)=>(b.date||"").localeCompare(a.date||"")||b._i-a._i);return mvs},[data.orders]);

  const getMovBlock=(m)=>{
    const ord=data.orders.find(o=>o.id===m.orderId);if(!ord)return null;
    if(m.type==="deliver"){
      const wd=(ord.workshopDeliveries||[])[m.wdIdx];
      if(wd&&(wd.receives||[]).length>0)return"يوجد استلامات مرتبطة بهذا التسليم";
      if((ord.deliveries||[]).length>0)return"يوجد تسليمات مخزن مرتبطة بالأوردر";
      return null
    } else {
      if((ord.deliveries||[]).length>0)return"يوجد تسليمات مخزن - لا يمكن حذف الاستلام";
      return null
    }
  };
  const delMovement=async(m)=>{
    if(m.type==="deliver"){
      /* V15.9: Warn if delivery has receives — deleting will lose workshop payment history */
      const ord=data.orders.find(o=>o.id===m.orderId);
      const wd=ord?.workshopDeliveries?.[m.wdIdx];
      const rcvCount=(wd?.receives||[]).length;
      const rcvQty=(wd?.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);
      if(rcvCount>0){
        const ok=await ask("⚠️ تحذير: حذف تسليم عليه استلامات",
          "هذا التسليم فيه "+rcvCount+" استلام ("+rcvQty+" قطعة). حذفه سيفقد سجل التسليم والاستلامات معاً. هل تريد المتابعة؟",
          {type:"danger",confirmText:"حذف"});
        if(!ok)return;
      }
      updOrder(m.orderId,o=>{o.workshopDeliveries.splice(m.wdIdx,1);o.status=recomputeStatus(o)});
    }
    else{updOrder(m.orderId,o=>{o.workshopDeliveries[m.wdIdx].receives.splice(m.rIdx,1);o.status=recomputeStatus(o)})}
  };

  /* Workshop accounts calculation */
  const wsAccounts=(wsName)=>{if(isInternal(wsName))return{due:0,totalPaid:0,totalPurchase:0,balance:0};let due=0;data.orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===wsName).forEach(wd=>{(wd.receives||[]).forEach(r=>{due+=r2((Number(r.qty)||0)*(Number(r.price)||0))})})});
    const payments=(data.wsPayments||[]).filter(p=>p.wsName===wsName);
    let totalPaid=payments.filter(p=>p.type==="payment").reduce((s,p)=>s+(Number(p.amount)||0),0);
    let totalPurchase=payments.filter(p=>p.type==="purchase").reduce((s,p)=>s+(Number(p.amount)||0),0);
    /* V18.72: Defensive — also pick up orphan treasury entries that carry this
       workshop's name but never got a wsPayment (e.g. the auto-link / backfill
       missed them, or a manual edit broke the link). Skip entries with
       wsPaymentId to avoid double counting. */
    (data.treasury||[]).forEach(t=>{
      if(!t||t.wsPaymentId)return;
      if(t.type!=="out")return;
      if(t.wsName!==wsName)return;
      if(t.category!=="تشغيل خارجي"&&t.category!=="مشتريات")return;
      const amt=Number(t.amount)||0;
      if(t.category==="مشتريات")totalPurchase+=amt;
      else totalPaid+=amt;
    });
    return{due,totalPaid,totalPurchase,balance:due+totalPurchase-totalPaid}
  };
  const addPayment=(wa)=>{if(!payWs||!payAmt)return;const wsObj=workshops.find(w=>w.name===payWs);
    const wsPayId=gid();const txId=gid();
    const _newWsPayment={id:wsPayId,wsName:payWs,wsId:wsObj?wsObj.id:null,amount:Number(payAmt),type:payType,notes:payNote,date:payDate,createdBy:userName||"",treasuryTxId:txId};
    upConfig(d=>{if(!d.wsPayments)d.wsPayments=[];
      d.wsPayments.push(_newWsPayment);
      /* Auto-register in treasury — linked to ws payment */
      if(!d.treasury)d.treasury=[];d.treasury.unshift({id:txId,type:"out",amount:Number(payAmt),desc:(payType==="payment"?"دفعة ورشة ":"مشتريات ورشة ")+payWs+(payNote?" — "+payNote:""),notes:"",category:payType==="payment"?"تشغيل خارجي":"مشتريات",account:"SUB CASH",season:d.activeSeason||"",date:payDate,day:dayName(payDate),sourceType:"ws_payment",wsPaymentId:wsPayId,wsName:payWs,by:userName||"",createdAt:new Date().toISOString()})});
    /* V18.35: auto-post journal entry */
    autoPost.workshopPay(data, _newWsPayment, wsObj, userName).catch(()=>{});
    if(wa){
      const phone=wsObj?.phone||"";
      let msg="*CLARK — اشعار دفعة*%0A%0A• الورشة: *"+payWs+"*%0A• نوع العملية: *"+(payType==="payment"?"دفعة":"مشتريات")+"*%0A• المبلغ: *"+fmt(Number(payAmt))+"* ج.م%0A• التاريخ: *"+payDate+"*"+(payNote?"%0A• ملاحظات: "+payNote:"");
      /* V18.33: Append configurable workshop account summary (replaces inline hardcoded summary).
         Build summary AFTER the upConfig above has registered the new payment so the totals reflect it. */
      const updatedData={...data,wsPayments:[...(data.wsPayments||[]),{wsName:payWs,amount:Number(payAmt),type:payType}]};
      const summary=formatWorkshopSummaryWA(buildWorkshopSummary(payWs,updatedData),(data?.printSettings||{}).whatsappSummary);
      if(summary)msg+=encodeURIComponent(summary);
      openWA("https://wa.me/"+(phone?phone.replace(/[^0-9]/g,""):"")+"?text="+msg,"_blank")}
    setPayAmt("");setPayNote("");setPayDate(new Date().toISOString().split("T")[0])};

  /* V15.7: Orphan Delivery Audit — finds workshopDeliveries where the garmentType
     is NOT linked to any fabric (i.e. piece wasn't cut but got delivered anyway).
     Only includes deliveries without any receives (those are "resolved" historical data). */
  const[auditOpen,setAuditOpen]=useState(false);
  const[auditDismissed,setAuditDismissed]=useState(()=>{try{return new Set(JSON.parse(localStorage.getItem("clark_orphan_del_dismissed")||"[]"))}catch(e){return new Set()}});
  const orphanDeliveries=useMemo(()=>{
    const issues=[];
    (data.orders||[]).forEach(ord=>{
      const pieces=ord.orderPieces||[];
      if(pieces.length<=1)return;/* single-piece orders: no issue */
      const hasFabric=FKEYS.some(k=>gf(ord,k));
      if(!hasFabric)return;/* no fabric at all — different issue, skip here */
      const linkedPieces=new Set();
      FKEYS.forEach(k=>{if(gf(ord,k))(ord["fabricPieces"+k]||[]).forEach(p=>linkedPieces.add(p))});
      (ord.workshopDeliveries||[]).forEach((wd,wdIdx)=>{
        const gt=wd.garmentType||"";
        if(!gt)return;
        if(linkedPieces.has(gt))return;/* this piece IS linked — fine */
        const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);
        if(rcvd>0)return;/* already received — treated as historical, leave alone per user request */
        const key=ord.id+"_"+wdIdx;
        if(auditDismissed.has(key))return;
        issues.push({
          key,orderId:ord.id,modelNo:ord.modelNo,modelDesc:ord.modelDesc||"",
          garmentType:gt,wsName:wd.wsName,qty:Number(wd.qty)||0,date:wd.date,price:Number(wd.price)||0,
          wdIdx,
          /* Fabrics available on this order (so user can link retroactively) */
          availableFabrics:FKEYS.filter(k=>gf(ord,k)).map(k=>({
            key:k,label:gf(ord,k,"Label")||("خامة "+k),
            currentPieces:[...(ord["fabricPieces"+k]||[])]
          })),
          linkedPieces:[...linkedPieces]
        });
      });
    });
    return issues;
  },[data.orders,auditDismissed]);

  /* Orders that have NO fabrics at all but DO have workshop deliveries — legacy data */
  const noFabricOrders=useMemo(()=>{
    const rows=[];
    (data.orders||[]).forEach(ord=>{
      const hasFabric=FKEYS.some(k=>gf(ord,k));
      if(hasFabric)return;
      if(!(ord.workshopDeliveries||[]).length)return;
      const totalDel=ord.workshopDeliveries.reduce((s,wd)=>s+(Number(wd.qty)||0),0);
      rows.push({orderId:ord.id,modelNo:ord.modelNo,modelDesc:ord.modelDesc||"",totalDel,wsCount:ord.workshopDeliveries.length});
    });
    return rows;
  },[data.orders]);

  const linkOrphanToFabric=async(issue,fabricKey)=>{
    const ok=await ask("ربط القطعة بخامة","هل تريد ربط القطعة «"+issue.garmentType+"» بخامة «"+issue.availableFabrics.find(f=>f.key===fabricKey)?.label+"» في موديل "+issue.modelNo+"؟\n\n(سيتم إضافتها لقائمة fabricPieces"+fabricKey+")",{type:"question"});
    if(!ok)return;
    updOrder(issue.orderId,o=>{
      const fp=o["fabricPieces"+fabricKey]||[];
      if(!fp.includes(issue.garmentType))fp.push(issue.garmentType);
      o["fabricPieces"+fabricKey]=fp;
      o.status=recomputeStatus(o);
    });
    showToast("✓ تم ربط "+issue.garmentType+" بخامة "+fabricKey);
  };

  const deleteOrphan=async(issue)=>{
    const ok=await ask("حذف التسليم","سيتم حذف تسليم «"+issue.qty+" "+issue.garmentType+"» من موديل "+issue.modelNo+" لورشة "+issue.wsName+".\n\nهذا الإجراء لا يمكن التراجع عنه. هل أنت متأكد؟",{type:"danger",confirmText:"حذف"});
    if(!ok)return;
    updOrder(issue.orderId,o=>{
      (o.workshopDeliveries||[]).splice(issue.wdIdx,1);
      o.status=recomputeStatus(o);
    });
    showToast("🗑️ تم حذف التسليم");
  };

  const dismissOrphan=(issue)=>{
    const next=new Set(auditDismissed);next.add(issue.key);
    setAuditDismissed(next);
    try{localStorage.setItem("clark_orphan_del_dismissed",JSON.stringify([...next]))}catch(e){}
    showToast("تم التجاهل");
  };

  if(!mode)return<div>
    {/* ═══ V14.53: Hero stats for external processing ═══ */}
    {(()=>{
      const totalDel=movements.filter(m=>m.type==="deliver").reduce((s,m)=>s+(Number(m.qty)||0),0);
      const totalRcv=movements.filter(m=>m.type==="receive").reduce((s,m)=>s+(Number(m.qty)||0),0);
      const totalBal=totalDel-totalRcv;
      const activeWs=new Set();
      data.orders.forEach(ord=>(ord.workshopDeliveries||[]).forEach(wd=>{
        const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);
        if((Number(wd.qty)||0)-rcvd>0)activeWs.add(wd.wsName);
      }));
      /* Count late */
      const _now=new Date();let lateCount=0;
      data.orders.forEach(ord=>(ord.workshopDeliveries||[]).forEach(wd=>{
        const rcvd=(wd.receives||[]).filter(r=>!r.isSettlement).reduce((s,r)=>s+(Number(r.qty)||0),0);
        const bal=(Number(wd.qty)||0)-rcvd;if(bal<=0)return;
        const days=Math.floor((_now-new Date(wd.date))/(86400000));
        const agreed=Number(wd.agreedDays)||0;
        if((agreed>0?days>agreed:days>14))lateCount++;
      }));
      return<div style={{display:"grid",gridTemplateColumns:isMob?"repeat(2,1fr)":"repeat(4,1fr)",gap:12,marginBottom:18}}>
        <div style={{padding:"14px 16px",borderRadius:12,border:"1px solid "+T.brd,background:T.cardSolid,display:"flex",alignItems:"center",gap:12,boxShadow:T.shadow}}>
          <div style={{width:40,height:40,borderRadius:10,background:"#8B5CF612",display:"flex",alignItems:"center",justifyContent:"center",color:"#8B5CF6",flexShrink:0,fontSize:20}}>🏭</div>
          <div><div style={{fontSize:FS-2,color:T.textMut,fontWeight:600}}>ورش نشطة</div><div style={{fontSize:isMob?FS+4:FS+8,fontWeight:900,color:T.text,lineHeight:1}}>{activeWs.size}</div></div>
        </div>
        <div style={{padding:"14px 16px",borderRadius:12,border:"1px solid "+T.brd,background:T.cardSolid,display:"flex",alignItems:"center",gap:12,boxShadow:T.shadow}}>
          <div style={{width:40,height:40,borderRadius:10,background:T.accent+"12",display:"flex",alignItems:"center",justifyContent:"center",color:T.accent,flexShrink:0,fontSize:20}}>📤</div>
          <div><div style={{fontSize:FS-2,color:T.textMut,fontWeight:600}}>إجمالي التسليم</div><div style={{fontSize:isMob?FS+4:FS+8,fontWeight:900,color:T.accent,lineHeight:1}}>{fmt(totalDel)}</div></div>
        </div>
        <div style={{padding:"14px 16px",borderRadius:12,border:"1px solid "+T.brd,background:T.cardSolid,display:"flex",alignItems:"center",gap:12,boxShadow:T.shadow}}>
          <div style={{width:40,height:40,borderRadius:10,background:T.ok+"12",display:"flex",alignItems:"center",justifyContent:"center",color:T.ok,flexShrink:0,fontSize:20}}>📥</div>
          <div><div style={{fontSize:FS-2,color:T.textMut,fontWeight:600}}>إجمالي الاستلام</div><div style={{fontSize:isMob?FS+4:FS+8,fontWeight:900,color:T.ok,lineHeight:1}}>{fmt(totalRcv)}</div></div>
        </div>
        <div onClick={lateCount>0?()=>setMovTypeF("late"):undefined} style={{padding:"14px 16px",borderRadius:12,border:"1px solid "+(lateCount>0?T.err+"40":T.brd),background:lateCount>0?T.err+"04":T.cardSolid,display:"flex",alignItems:"center",gap:12,boxShadow:T.shadow,cursor:lateCount>0?"pointer":"default",transition:"all 0.15s"}}>
          <div style={{width:40,height:40,borderRadius:10,background:(lateCount>0?T.err:T.warn)+"12",display:"flex",alignItems:"center",justifyContent:"center",color:lateCount>0?T.err:T.warn,flexShrink:0,fontSize:20}}>⏰</div>
          <div><div style={{fontSize:FS-2,color:T.textMut,fontWeight:600}}>متأخرات</div><div style={{fontSize:isMob?FS+4:FS+8,fontWeight:900,color:lateCount>0?T.err:T.text,lineHeight:1}}>{lateCount}</div></div>
        </div>
      </div>;
    })()}

    {/* V15.7: Orphan Delivery Audit — deliveries of uncut pieces */}
    {(orphanDeliveries.length>0||noFabricOrders.length>0)&&<div style={{marginBottom:18,background:"#FEF2F2",borderRadius:14,padding:isMob?14:18,border:"1px solid #FCA5A5",boxShadow:"0 4px 12px -4px rgba(239,68,68,0.15)"}}>
      <div onClick={()=>setAuditOpen(!auditOpen)} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
        <div style={{width:40,height:40,borderRadius:10,background:"#EF4444",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>⚠️</div>
        <div style={{flex:1}}>
          <div style={{fontSize:FS+2,fontWeight:800,color:"#991B1B"}}>تسليمات تحتاج مراجعة</div>
          <div style={{fontSize:FS-1,color:"#7C2D12"}}>
            {orphanDeliveries.length>0&&<span>{orphanDeliveries.length} قطعة اتسلمت بدون ربط بخامة</span>}
            {orphanDeliveries.length>0&&noFabricOrders.length>0&&<span> · </span>}
            {noFabricOrders.length>0&&<span>{noFabricOrders.length} أوردر بدون خامات أصلاً</span>}
          </div>
        </div>
        <div style={{fontSize:22,color:"#991B1B",fontWeight:800}}>{auditOpen?"▲":"▼"}</div>
      </div>

      {auditOpen&&<div style={{marginTop:14,paddingTop:14,borderTop:"1px solid #FCA5A5"}}>
        {orphanDeliveries.length>0&&<div style={{marginBottom:noFabricOrders.length>0?16:0}}>
          <div style={{fontSize:FS+1,fontWeight:800,color:"#991B1B",marginBottom:10}}>🔴 تسليمات قطع غير مقصوصة</div>
          <div style={{fontSize:FS-2,color:"#7C2D12",marginBottom:10,lineHeight:1.6}}>
            دي قطع اتسلمت للورش لكن مش مربوطة بأي خامة (يعني مش مقصوصة تقنياً).
            <br/>التسليمات اللي ليها استلام (receives) مش ظاهرة هنا — هي بيانات تاريخية بتفضل زي ما هي.
          </div>
          <div style={{display:"grid",gap:10}}>
            {orphanDeliveries.map(issue=><div key={issue.key} style={{background:"#fff",borderRadius:10,padding:12,border:"1px solid #FECACA"}}>
              <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center",marginBottom:10}}>
                <span style={{fontWeight:800,color:T.text,fontSize:FS+1}}>{issue.modelNo}</span>
                {issue.modelDesc&&<span style={{fontSize:FS-2,color:T.textSec}}>· {issue.modelDesc}</span>}
              </div>
              <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"repeat(auto-fit,minmax(140px,1fr))",gap:8,marginBottom:10,fontSize:FS-1}}>
                <div><span style={{color:T.textMut}}>القطعة:</span> <span style={{fontWeight:700,color:"#EF4444"}}>{gIcon(issue.garmentType,data.garmentTypes)} {issue.garmentType}</span></div>
                <div><span style={{color:T.textMut}}>الورشة:</span> <span style={{fontWeight:700,color:T.text}}>{issue.wsName}</span></div>
                <div><span style={{color:T.textMut}}>الكمية:</span> <span style={{fontWeight:700,color:T.text}}>{fmt(issue.qty)} قطعة</span></div>
                <div><span style={{color:T.textMut}}>التاريخ:</span> <span style={{fontWeight:700,color:T.text}}>{issue.date}</span></div>
              </div>
              {issue.linkedPieces.length>0&&<div style={{fontSize:FS-2,color:T.textSec,marginBottom:8}}>
                <span style={{color:T.textMut}}>القطع المربوطة في هذا الموديل:</span> {issue.linkedPieces.join(" · ")}
              </div>}
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:10,paddingTop:10,borderTop:"1px dashed "+T.brd}}>
                <span style={{fontSize:FS-2,color:T.textMut,alignSelf:"center",marginLeft:4}}>🔗 ربط بخامة:</span>
                {issue.availableFabrics.map(fab=><Btn key={fab.key} small onClick={()=>linkOrphanToFabric(issue,fab.key)} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30",fontSize:FS-2}}>
                  خامة {fab.key} ({fab.label})
                </Btn>)}
                <div style={{flex:1}}/>
                <Btn small onClick={()=>dismissOrphan(issue)} style={{background:T.textMut+"15",color:T.textSec,border:"1px solid "+T.brd,fontSize:FS-2}}>✓ تجاهل</Btn>
                <Btn small onClick={()=>deleteOrphan(issue)} style={{background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30",fontSize:FS-2}}>🗑️ حذف التسليم</Btn>
              </div>
            </div>)}
          </div>
        </div>}

        {noFabricOrders.length>0&&<div>
          <div style={{fontSize:FS+1,fontWeight:800,color:"#92400E",marginBottom:10}}>⚠️ أوردرات بدون خامات (للمعلومية)</div>
          <div style={{fontSize:FS-2,color:"#78350F",marginBottom:10,lineHeight:1.6}}>
            دي أوردرات قديمة مش ليها خامات مسجلة أصلاً (اتسجلت قبل تطبيق نظام الخامات).
            <br/>مش محتاجة إجراء فوري — مجرد إشارة لو حبيت تضيف خامات لاحقاً.
          </div>
          <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"repeat(auto-fit,minmax(260px,1fr))",gap:8}}>
            {noFabricOrders.map(row=><div key={row.orderId} style={{background:"#fff",borderRadius:8,padding:10,border:"1px solid #FED7AA",fontSize:FS-1}}>
              <div style={{fontWeight:800,color:T.text}}>{row.modelNo}</div>
              {row.modelDesc&&<div style={{fontSize:FS-2,color:T.textSec,marginBottom:4}}>{row.modelDesc}</div>}
              <div style={{fontSize:FS-2,color:T.textMut}}>{fmt(row.totalDel)} قطعة · {row.wsCount} تسليم</div>
            </div>)}
          </div>
        </div>}
      </div>}
    </div>}

    {/* Mode buttons row — V18.77: removed "إضافة دفعة" (use Treasury directly), 5 buttons */}
    <div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":isTab?"repeat(3,1fr)":"repeat(5,1fr)",gap:12,marginBottom:20}}>
      <div onClick={()=>setMode("deliver")} style={{background:T.card,borderRadius:14,padding:isMob?16:22,border:"1px solid "+T.brd,boxShadow:T.shadow,cursor:"pointer",textAlign:"center",transition:"all 0.2s"}} onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="0 10px 25px -8px "+T.accent+"30";e.currentTarget.style.borderColor=T.accent+"40"}} onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow=T.shadow;e.currentTarget.style.borderColor=T.brd}}>
        <div style={{fontSize:32,marginBottom:8}}>📤</div>
        <div style={{fontSize:FS+1,fontWeight:800,color:T.accent}}>تسليم ورشة</div>
      </div>
      <div onClick={()=>setMode("receive")} style={{background:T.card,borderRadius:14,padding:isMob?16:22,border:"1px solid "+T.brd,boxShadow:T.shadow,cursor:"pointer",textAlign:"center",transition:"all 0.2s"}} onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="0 10px 25px -8px "+T.ok+"30";e.currentTarget.style.borderColor=T.ok+"40"}} onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow=T.shadow;e.currentTarget.style.borderColor=T.brd}}>
        <div style={{fontSize:32,marginBottom:8}}>📥</div>
        <div style={{fontSize:FS+1,fontWeight:800,color:T.ok}}>استلام من ورشة</div>
      </div>
      <div onClick={()=>setMode("accounts")} style={{background:T.card,borderRadius:14,padding:isMob?16:22,border:"1px solid "+T.brd,boxShadow:T.shadow,cursor:"pointer",textAlign:"center",transition:"all 0.2s"}} onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="0 10px 25px -8px "+T.warn+"30";e.currentTarget.style.borderColor=T.warn+"40"}} onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow=T.shadow;e.currentTarget.style.borderColor=T.brd}}>
        <div style={{fontSize:32,marginBottom:8}}>📊</div>
        <div style={{fontSize:FS+1,fontWeight:800,color:T.warn}}>حسابات الورش</div>
      </div>
      <div onClick={()=>{setMode("batch");setSelWs("");setBatchItems([]);setBatchDate(new Date().toISOString().split("T")[0])}} style={{background:T.card,borderRadius:14,padding:isMob?16:22,border:"1px solid "+T.brd,boxShadow:T.shadow,cursor:"pointer",textAlign:"center",transition:"all 0.2s"}} onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="0 10px 25px -8px #8B5CF630";e.currentTarget.style.borderColor="#8B5CF640"}} onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow=T.shadow;e.currentTarget.style.borderColor=T.brd}}>
        <div style={{fontSize:32,marginBottom:8}}>📦</div>
        <div style={{fontSize:FS+1,fontWeight:800,color:"#8B5CF6"}}>تسليم مُجمع</div>
      </div>
      <div onClick={()=>{setMode("batchRcv");setSelWs("");setBatchItems([]);setBatchDate(new Date().toISOString().split("T")[0])}} style={{background:T.card,borderRadius:14,padding:isMob?16:22,border:"1px solid "+T.brd,boxShadow:T.shadow,cursor:"pointer",textAlign:"center",transition:"all 0.2s"}} onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="0 10px 25px -8px "+T.ok+"30";e.currentTarget.style.borderColor=T.ok+"40"}} onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow=T.shadow;e.currentTarget.style.borderColor=T.brd}}>
        <div style={{fontSize:32,marginBottom:8}}>📥</div>
        <div style={{fontSize:FS+1,fontWeight:800,color:T.ok}}>استلام مُجمع</div>
      </div>
    </div>
    {/* Movement Log with search/filter */}
    <Card title={"سجل الحركات ("+movements.length+")"}>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":isTab?"1fr 1fr":"2fr 1fr 1fr 1fr",gap:8,marginBottom:10}}>
        <Inp value={movQ} onChange={setMovQ} placeholder="بحث بالموديل أو الورشة..."/>
        <Sel value={movWsF} onChange={setMovWsF}><option value="الكل">كل الورش</option>{workshops.map(w=><option key={w.id||w} value={w.name||w}>{(w.type?wsTypeInfo(w.type).icon+" "+wsTypeInfo(w.type).key+" — ":"")+(w.name||w)}</option>)}</Sel>
        <Sel value={movTypeF} onChange={v=>{setMovTypeF(v);setLateChecked({})}}><option value="الكل">كل الحركات</option><option value="deliver">تسليم ورشة</option><option value="receive">استلام مصنع</option><option value="late">⏰ متأخرات</option></Sel>
        <div style={{display:"flex",gap:4}}>
          <Btn onClick={()=>{const el=document.getElementById("mov-log");if(!el)return;printPage("سجل حركات التشغيل الخارجي",el.innerHTML)}} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd,flex:1}} title="طباعة الحركات المعروضة">🖨 المعروض</Btn>
          <Btn onClick={()=>{const allH="<table><thead><tr>"+["نوع","التاريخ","الورشة","موديل","الوصف","القطعة","الكمية","السعر","ملاحظات"].map(h=>"<th>"+h+"</th>").join("")+"</tr></thead><tbody>"+movements.map(m=>"<tr style='background:"+(m.type==="deliver"?"#F0FDF4":m.type==="settlement"?"#FEF2F2":"#EFF6FF")+"'><td style='color:"+(m.type==="deliver"?"#10B981":m.type==="settlement"?"#EF4444":"#0EA5E9")+";font-weight:700'>"+(m.type==="deliver"?"تسليم ورشة":m.type==="settlement"?"⚖️ تسوية":"استلام مصنع")+"</td><td>"+m.date+"</td><td>"+m.wsName+"</td><td><b>"+m.orderNo+"</b></td><td>"+(m.orderDesc||"")+"</td><td>"+(m.garmentType||"-")+"</td><td><b>"+m.qty+"</b></td><td>"+(m.price?m.price+" ج.م":"-")+"</td><td>"+(m.notes||"-")+"</td></tr>").join("")+"</tbody></table>";printPage("سجل حركات التشغيل الخارجي (كامل - "+movements.length+" حركة)",allH)}} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30",flex:1}} title="طباعة كل الحركات">🖨 الكل</Btn>
        </div>
      </div>
      {(()=>{
      /* Compute late deliveries */
      const _now=new Date();const lateItems=[];
      if(movTypeF==="late"){data.orders.forEach(ord=>{(ord.workshopDeliveries||[]).forEach((wd,wdIdx)=>{const rcvd=(wd.receives||[]).filter(r=>!r.isSettlement).reduce((s,r)=>s+(Number(r.qty)||0),0);const bal=(Number(wd.qty)||0)-rcvd;if(bal<=0)return;const days=Math.floor((_now-new Date(wd.date))/(86400000));const agreed=Number(wd.agreedDays)||0;const isLate=agreed>0?days>agreed:days>14;if(isLate)lateItems.push({wsName:wd.wsName,orderNo:ord.modelNo,orderDesc:ord.modelDesc,garment:wd.garmentType||"عام",qty:bal,days,agreed,orderId:ord.id,wdIdx,delDate:wd.date,key:ord.id+"_"+wdIdx})})})}
      const fMov=movTypeF==="late"?[]:movements.filter(m=>{if(movWsF!=="الكل"&&m.wsName!==movWsF)return false;if(movTypeF!=="الكل"&&m.type!==movTypeF)return false;if(movQ.trim()){const s=movQ.trim().toLowerCase();if(!((m.orderNo||"").toLowerCase().includes(s)||(m.wsName||"").toLowerCase().includes(s)||(m.orderDesc||"").toLowerCase().includes(s)))return false}return true});const shown=movTypeF==="late"?[]:fMov.slice(0,movLimit);
      const toggleSel=(idx)=>setSelMoves(p=>{const n=new Set(p);n.has(idx)?n.delete(idx):n.add(idx);return n});
      const selArr=[...selMoves].map(i=>shown[i]).filter(Boolean);
      const printBatch=()=>{if(selArr.length===0)return;selArr.forEach((m,i)=>{setTimeout(()=>printMov(m),i*500)})};
      const printBatchCombined=async()=>{if(selArr.length===0)return;let pages=[];
        for(const m of selArr){const ord=data.orders.find(o=>o.id===m.orderId);const ws=(data.workshops||[]).find(w=>w.name===m.wsName);
          let html="";if(m.type==="deliver")html=await printReceipt(m.wsName,ws?.owner||"",ord||{modelNo:m.orderNo,modelDesc:m.orderDesc},m.garmentType||"",m.qty,m.date,0,data.garmentTypes,true);
          else html=await printReceiveReceipt(m.wsName,ord||{modelNo:m.orderNo,modelDesc:m.orderDesc},m.garmentType||"",m.qty,m.date,0,data.garmentTypes,true);
          if(html)pages.push(html)}
        if(pages.length===0)return;
        const combined=pages.map((p,i)=>"<div"+(i>0?" style='page-break-before:always'":"")+">"+p+"</div>").join("");
        printPage("اذونات مجمعة ("+pages.length+")",combined)};
      const waBatch=()=>{if(selArr.length===0)return;const byWs={};selArr.forEach(m=>{if(!byWs[m.wsName])byWs[m.wsName]=[];byWs[m.wsName].push(m)});Object.entries(byWs).forEach(([ws,items])=>{const wsObj=workshops.find(w=>w.name===ws);const phone=wsObj?.phone||"";const lines=items.map(m=>{const _o=data.orders.find(o=>o.id===m.orderId);const _w=_o?((_o.workshopDeliveries||[])[m.wdIdx]):null;const _dq=_w?Number(_w.qty)||0:0;const _tr=_w?(_w.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0):0;const _bal=_dq-_tr;return m.type==="deliver"?"📤 تسليم — موديل *"+m.orderNo+"*%0A  "+(m.orderDesc||"-")+" — "+(m.garmentType||"عام")+" — *"+m.qty+"* قطعة":"📥 استلام — موديل *"+m.orderNo+"*%0A  "+(m.orderDesc||"-")+" — "+(m.garmentType||"عام")+"%0A  تسليم للورشة: *"+_dq+"* | استلام مصنع: *"+_tr+"* | رصيد: *"+Math.max(0,_bal)+"*"}).join("%0A%0A───────────%0A");const tQty=items.reduce((s,m)=>s+(Number(m.qty)||0),0);let msg="*CLARK — ملخص حركات*%0A%0A• الورشة: *"+ws+"*%0A%0A─────────────────%0A"+lines+"%0A─────────────────%0A• الاجمالي: *"+tQty+"* قطعة%0A%0A*برجاء التأكيد*";
        /* V18.33: Append workshop account summary */
        const summary=formatWorkshopSummaryWA(buildWorkshopSummary(ws,data),(data?.printSettings||{}).whatsappSummary);
        if(summary)msg+=encodeURIComponent(summary);
        openWA("https://wa.me/"+(phone?phone.replace(/[^0-9]/g,""):"")+"?text="+msg,"_blank")})};
      return<div id="mov-log">
      {/* Late deliveries view */}
      {movTypeF==="late"&&<div>
        {lateItems.length>0?<div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
            <span style={{fontWeight:700,color:T.err,fontSize:FS}}>{"⏰ "+lateItems.length+" تسليم متأخر"}</span>
            <div style={{display:"flex",gap:6}}>
              <Btn small onClick={()=>{const all={};lateItems.forEach(l=>{all[l.key]=!Object.keys(lateChecked).length||!lateChecked[l.key]});setLateChecked(all)}} style={{background:T.bg,color:T.textSec,border:"1px solid "+T.brd}}>{Object.values(lateChecked).filter(Boolean).length===lateItems.length?"☑ الغاء الكل":"☐ اختار الكل"}</Btn>
              {Object.values(lateChecked).filter(Boolean).length>0&&<Btn small onClick={()=>{const byWs={};lateItems.filter(l=>lateChecked[l.key]).forEach(l=>{if(!byWs[l.wsName])byWs[l.wsName]=[];byWs[l.wsName].push(l)});Object.entries(byWs).forEach(([ws,items])=>{const wsObj=workshops.find(w=>w.name===ws);const phone=wsObj?.phone||"";const lines=items.map(l=>"• موديل *"+l.orderNo+"* "+l.garment+" — *"+l.qty+"* قطعة — متأخر *"+l.days+"* يوم"+(l.agreed?" (متفق "+l.agreed+" يوم)":"")).join("%0A");const msg="*CLARK — تنبيه تأخير*%0A%0A• الورشة: *"+ws+"*%0A%0A"+lines+"%0A%0A⚠️ *برجاء الاهتمام بالتسليم في أقرب وقت*";openWA("https://wa.me/"+(phone?phone.replace(/[^0-9]/g,""):"")+"?text="+msg,"_blank")});const sent={};lateItems.filter(l=>lateChecked[l.key]).forEach(l=>{sent[l.key]=Date.now()});setLateSent(p=>({...p,...sent}));setLateChecked({})}} style={{background:"#25D366",color:"#fff",border:"none",fontWeight:700}}>{"📱 ارسال تحذير ("+Object.values(lateChecked).filter(Boolean).length+")"}</Btn>}
            </div>
          </div>
          <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["☐","الورشة","موديل","القطعة","الرصيد","الأيام","المتفق",""].map(h=><th key={h} style={{...TH,fontSize:FS-2}}>{h}</th>)}</tr></thead>
            <tbody>{lateItems.map((l,i)=>{const isSent=lateSent[l.key]&&(Date.now()-lateSent[l.key]<60000);return<tr key={l.key} style={{background:isSent?T.ok+"12":i%2===0?"transparent":T.bg+"80"}}>
              <td style={{...TD,textAlign:"center"}}><span onClick={()=>setLateChecked(p=>({...p,[l.key]:!p[l.key]}))} style={{cursor:"pointer",fontSize:16}}>{lateChecked[l.key]?"☑":"☐"}</span></td>
              <td style={{...TD,fontWeight:700}}>{l.wsName}</td><td style={TDB}>{l.orderNo}</td><td style={TD}>{l.garment}</td>
              <td style={{...TDB,color:T.err}}>{l.qty}</td><td style={{...TD,fontWeight:700,color:T.err}}>{l.days+" يوم"}</td>
              <td style={TD}>{l.agreed?l.agreed+" يوم":"—"}</td>
              <td style={TD}>{isSent?<span style={{color:T.ok,fontWeight:700}}>{"✅ تم"}</span>:""}</td>
            </tr>})}</tbody>
          </table></div>
        </div>:<div style={{textAlign:"center",padding:30,color:T.ok,fontWeight:700}}>✅ لا توجد تسليمات متأخرة</div>}
      </div>}
      {selArr.length>0&&<div style={{padding:"10px 14px",borderRadius:10,background:"#8B5CF608",border:"1px solid #8B5CF625",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
        <span style={{fontWeight:700,color:"#8B5CF6",fontSize:FS}}>{"☑ "+selArr.length+" حركة محددة ("+selArr.reduce((s,m)=>s+(Number(m.qty)||0),0)+" قطعة)"}</span>
        <div style={{display:"flex",gap:6}}><Btn small onClick={printBatchCombined} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}} title="طباعة كل الحركات المحددة">🖨 طباعة مجمعة</Btn><Btn small onClick={waBatch} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}} title="ارسال واتساب للحركات المحددة">📱 واتساب مجمع</Btn><Btn ghost small onClick={()=>setSelMoves(new Set())} title="إلغاء التحديد">✕ الغاء</Btn></div>
      </div>}
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:700}}>
        <thead><tr>{["☐","نوع الحركة","التاريخ","الورشة","موديل","الوصف","نوع القطعة","الكمية","سعر التشغيل","ملاحظات",""].map(h=><th key={h} style={{...TH,width:h==="☐"?30:"auto"}}>{h==="☐"?<span onClick={()=>{if(selMoves.size===shown.length)setSelMoves(new Set());else setSelMoves(new Set(shown.map((_,i)=>i)))}} style={{cursor:"pointer",fontSize:16}}>{selMoves.size===shown.length&&shown.length>0?"☑":"☐"}</span>:h}</th>)}</tr></thead>
        <tbody>{shown.length>0?shown.map((m,i)=>{
          const isEditing=editMov&&editMov.orderId===m.orderId&&editMov.wdIdx===m.wdIdx&&editMov.type===m.type&&(m.type==="deliver"||editMov.rIdx===m.rIdx);
          const isSel=selMoves.has(i);
          return<tr key={i} style={{background:isSel?"#8B5CF610":m.type==="deliver"?"#F0FDF4":"#EFF6FF"}}>
          <td style={{...TD,textAlign:"center"}}><span onClick={()=>toggleSel(i)} style={{cursor:"pointer",fontSize:16}}>{isSel?"☑":"☐"}</span></td>
          <td style={{...TD,fontWeight:700,color:m.type==="deliver"?T.ok:m.type==="settlement"?T.err:T.accent}}>{m.type==="deliver"?"↗ تسليم ورشة":m.type==="settlement"?"⚖️ تسوية":"↙ استلام مصنع"}</td>
          <td style={TD}>{isEditing?<Inp type="date" value={editDate} onChange={setEditDate} style={{width:130}}/>:m.date}</td><td style={{...TD,fontWeight:600}}>{m.wsName}</td><td style={TDB}>{m.orderNo}</td><td style={TD}>{m.orderDesc}</td>
          <td style={TD}>{m.garmentType||"-"}</td>
          <td style={{...TDB,color:m.type==="deliver"?T.ok:m.type==="settlement"?T.err:T.accent}}>{isEditing?<Inp type="number" value={editQty} onChange={v=>setEditQty(Number(v)||0)} style={{width:70}}/>:m.qty}</td>
          <td style={TD}>{isEditing&&m.type==="deliver"?<Inp type="number" value={editPrice} onChange={v=>setEditPrice(Number(v)||0)} style={{width:70}}/>:(m.price?m.price+" ج.م":"-")}</td>
          <td style={TD}>{isEditing?<div style={{display:"flex",flexDirection:"column",gap:4}}>{m.type==="receive"&&<Sel value={editQuality} onChange={setEditQuality}>{["ممتاز","جيد جداً","جيد","مقبول","سئ"].map(q=><option key={q} value={q}>{q}</option>)}</Sel>}<Inp value={editNote} onChange={setEditNote} placeholder="ملاحظات" style={{width:100}}/></div>:<>{m.notes||"-"}{m.createdBy&&<div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>{"👤 "+m.createdBy}</div>}</>}</td>
          <td style={{...TD,whiteSpace:"nowrap"}}>{canEdit&&<div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            {isEditing?<><Btn small primary onClick={saveEditMov}>حفظ</Btn><Btn ghost small onClick={()=>setEditMov(null)}>الغاء</Btn></>:<>
            <Btn small onClick={()=>printMov(m)} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}} title="طباعة">🖨</Btn>
            <Btn small onClick={()=>{const ord=data.orders.find(o=>o.id===m.orderId);if(!ord)return;const wd=(ord.workshopDeliveries||[])[m.wdIdx];if(!wd)return;if(m.type==="deliver")printLabel(m.wsName,ord,m.garmentType,m.qty,m.date,data.garmentTypes,{type:"deliver",delDate:m.date,delQty:m.qty});else{printLabel(m.wsName,ord,m.garmentType,m.qty,m.date,data.garmentTypes,{type:"receive",delDate:wd.date,delQty:wd.qty,rcvDate:m.date,rcvQty:m.qty})}}} style={{background:"#F59E0B12",color:"#F59E0B",border:"1px solid #F59E0B30"}} title="طباعة ليبل حراري">🏷️</Btn>
            <Btn small onClick={()=>{const wsObj=workshops.find(w=>w.name===m.wsName);const phone=wsObj?.phone||"";const _ord=data.orders.find(o=>o.id===m.orderId);const _wd=_ord?((_ord.workshopDeliveries||[])[m.wdIdx]):null;const _delQty=_wd?Number(_wd.qty)||0:0;const _allRcv=_wd?(_wd.receives||[]):[];const _totalRcv=_allRcv.reduce((s,r)=>s+(Number(r.qty)||0),0);const _wsBal=_delQty-_totalRcv;const msg=m.type==="deliver"?"*CLARK — اذن تسليم ورشة*%0A%0A• الورشة: *"+m.wsName+"*%0A• رقم الموديل: *"+m.orderNo+"*%0A• الوصف: "+m.orderDesc+"%0A• نوع القطعة: *"+(m.garmentType||"عام")+"*%0A• الكمية: *"+m.qty+"* قطعة%0A• السعر: *"+(m.price||0)+"* ج.م/قطعة%0A• التاريخ: *"+m.date+"*%0A%0A*برجاء التأكيد*":"*CLARK — اذن استلام من ورشة*%0A%0A• الورشة: *"+m.wsName+"*%0A• رقم الموديل: *"+m.orderNo+"*%0A• الوصف: "+m.orderDesc+"%0A• نوع القطعة: *"+(m.garmentType||"عام")+"*%0A%0A━━━━━━━━━━━━━━%0A📤 تسليم للورشة: *"+_delQty+"* قطعة%0A📥 استلام مصنع: *"+_totalRcv+"* قطعة%0A📥 استلام اليوم: *"+m.qty+"* قطعة%0A📊 الرصيد عند الورشة: *"+Math.max(0,_wsBal)+"* قطعة%0A━━━━━━━━━━━━━━%0A%0A• التاريخ: *"+m.date+"*";openWA("https://wa.me/"+(phone?phone.replace(/[^0-9]/g,""):"")+"?text="+msg,"_blank")}} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}} title="ارسال واتساب">📱</Btn>
            <Btn small onClick={()=>startEditMov(m)} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}} title="تعديل">✏️</Btn>
            {m.type==="deliver"&&<Btn small onClick={()=>startTransferMov(m)} style={{background:"#8B5CF612",color:"#8B5CF6",border:"1px solid #8B5CF630"}} title="نقل التسليم لورشة أخرى">🔀</Btn>}
            <DelBtn onConfirm={()=>delMovement(m)} blocked={getMovBlock(m)}/></>}
          </div>}</td>
        </tr>}):<tr><td colSpan={10} style={{...TD,textAlign:"center",color:T.textSec,padding:30}}>لا توجد حركات</td></tr>}</tbody>
      </table></div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:10}}>
        <span style={{fontSize:FS-2,color:T.textMut}}>{"عرض "+Math.min(movLimit,fMov.length)+" من "+fMov.length+" حركة"}</span>
        {fMov.length>movLimit&&<Btn small onClick={()=>setMovLimit(p=>p+25)} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}}>{"عرض المزيد (+25)"}</Btn>}
      </div></div>})()}
    </Card>
    {/* V16.10: Transfer delivery between workshops popup */}
    {transferMov&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:100000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(6px)"}} onClick={()=>setTransferMov(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:22,width:"100%",maxWidth:520,border:"2px solid #8B5CF6",boxShadow:"0 25px 80px rgba(0,0,0,0.4)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,paddingBottom:12,borderBottom:"1px solid "+T.brd}}>
          <div style={{fontSize:FS+2,fontWeight:800,color:"#8B5CF6"}}>🔀 نقل التسليم لورشة أخرى</div>
          <Btn ghost small onClick={()=>setTransferMov(null)}>✕</Btn>
        </div>
        <div style={{padding:12,borderRadius:10,background:T.bg,border:"1px solid "+T.brd,marginBottom:14}}>
          <div style={{fontSize:FS-2,color:T.textMut,marginBottom:4}}>التسليم الحالي:</div>
          <div style={{fontSize:FS,fontWeight:700,color:T.text,marginBottom:6}}>الموديل: <b style={{color:T.accent}}>{transferMov.orderNo}</b></div>
          <div style={{fontSize:FS-1,color:T.textSec,lineHeight:1.7}}>
            <div>📤 من: <b style={{color:T.warn}}>{transferMov.wsName}</b></div>
            <div>📦 الكمية: <b>{transferMov.qty}</b> قطعة {transferMov.garmentType?"("+transferMov.garmentType+")":""}</div>
            <div>📅 تاريخ التسليم الأصلي: {transferMov.date}</div>
            {Number(transferMov.price)>0&&<div>💰 سعر التشغيل: {transferMov.price} ج.م/قطعة</div>}
          </div>
        </div>
        <div style={{marginBottom:14}}>
          <label style={{fontSize:FS-1,color:T.textSec,fontWeight:700,display:"block",marginBottom:6}}>الورشة الجديدة <span style={{color:T.err}}>*</span></label>
          <Sel value={transferToWs} onChange={setTransferToWs}>
            <option value="">-- اختر ورشة --</option>
            {workshops.filter(w=>w.name!==transferMov.wsName&&!w.archived).map(w=>
              <option key={w.id||w.name} value={w.name}>{w.name}{w.owner?" (صاحبها: "+w.owner+")":""}</option>
            )}
          </Sel>
        </div>
        <div style={{marginBottom:16}}>
          <label style={{fontSize:FS-1,color:T.textSec,fontWeight:700,display:"block",marginBottom:6}}>سبب النقل (اختياري)</label>
          <Inp value={transferReason} onChange={setTransferReason} placeholder="مثال: تأخر التسليم — تم سحبها لورشة أخرى"/>
        </div>
        <div style={{padding:10,borderRadius:8,background:T.warn+"08",border:"1px solid "+T.warn+"30",fontSize:FS-2,color:T.textSec,lineHeight:1.7,marginBottom:14}}>
          <b style={{color:T.warn}}>⚠️ ما يحدث عند الحفظ:</b>
          <div style={{marginTop:4}}>• حساب <b>{transferMov.wsName}</b> ينقص بقيمة هذا التسليم</div>
          <div>• حساب الورشة الجديدة يزيد بنفس القيمة</div>
          <div>• كل الاستلامات (إن وُجدت) تنتقل للورشة الجديدة</div>
          <div>• يُسجَّل في "ملاحظات" التسليم: من أين وإلى أين النقل</div>
          <div>• يُحفظ سجل كامل في تاريخ التسليم (audit trail)</div>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <Btn ghost onClick={()=>setTransferMov(null)}>إلغاء</Btn>
          <Btn primary onClick={saveTransferMov} disabled={!transferToWs} style={{background:"#8B5CF6",color:"#fff",border:"none",fontWeight:800,padding:"10px 20px"}}>🔀 تأكيد النقل</Btn>
        </div>
      </div>
    </div>}
  </div>;

  /* ── DELIVER MODE ── */
  const getAvailQty=(ord)=>{
    const t=calcOrder(ord);
    const pieces=ord.orderPieces||[];
    if(pieces.length>0){
      /* At least one piece must have available qty */
      let anyAvail=false;
      pieces.forEach(p=>{const delForP=(ord.workshopDeliveries||[]).filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0);if(delForP<t.cutQty)anyAvail=true});
      return anyAvail?t.cutQty:0
    }
    const delivered=(ord.workshopDeliveries||[]).reduce((s,wd)=>s+(Number(wd.qty)||0),0);
    return Math.max(0,t.cutQty-delivered)
  };
  const availOrders=prodOrders.filter(o=>getAvailQty(o)>0&&FKEYS.some(k=>gf(o,k)));
  /* Workshop-specific movements */
  const wsMoves=[];
  if(selWs)data.orders.forEach(ord=>{(ord.workshopDeliveries||[]).forEach((wd,wdIdx)=>{if(wd.wsName===selWs){wsMoves.push({type:"deliver",date:wd.date,orderNo:ord.modelNo,orderDesc:ord.modelDesc,qty:wd.qty,garmentType:wd.garmentType||"",price:wd.price||0,notes:wd.notes||"",orderId:ord.id,wdIdx,_ts:new Date(wd.date).getTime()+wdIdx,createdBy:wd.createdBy||""});(wd.receives||[]).forEach((r,rIdx)=>{wsMoves.push({type:r.isSettlement?"settlement":"receive",date:r.date,orderNo:ord.modelNo,orderDesc:ord.modelDesc,qty:r.qty,garmentType:wd.garmentType||"",price:r.price||0,notes:r.notes||"",orderId:ord.id,wdIdx,rIdx,_ts:new Date(r.date).getTime()+wdIdx*100+rIdx,createdBy:r.createdBy||"",isSettlement:!!r.isSettlement})})}})});
  wsMoves.sort((a,b)=>(b.date||"").localeCompare(a.date||"")||b._ts-a._ts);

  if(mode==="deliver")return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
      <h1 style={{fontSize:isMob?22:28,fontWeight:800,margin:0}}>{"📤 تسليم ورشة"}</h1>
      <Btn ghost onClick={()=>{setMode(null);setSelWs("");setSelOrder("")}}>↩</Btn>
    </div>
    <Card title="اختر الورشة" style={{marginBottom:16,position:"relative",zIndex:100}}>
      <SearchSel value={selWs} onChange={v=>{setSelWs(v);setSelOrder("")}} options={workshops.map(w=>({value:w.name||w,label:(w.type?wsTypeInfo(w.type).icon+" "+wsTypeInfo(w.type).key+" — ":"")+(w.name||w)+(w.owner?" - "+w.owner:"")}))} placeholder="ابحث عن ورشة..."/>
      {wsObj&&(()=>{let wsTotalDel=0,wsTotalRcv=0;data.orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===selWs).forEach(wd=>{wsTotalDel+=Number(wd.qty)||0;(wd.receives||[]).forEach(r=>{wsTotalRcv+=Number(r.qty)||0})})});const wsBal=wsTotalDel-wsTotalRcv;
        return<div style={{marginTop:12,padding:12,background:T.accentBg,borderRadius:10}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
            {wsObj.ownerPhoto&&<img src={wsObj.ownerPhoto} alt="" style={{width:40,height:53,borderRadius:8,objectFit:"cover"}}/>}
            <div style={{flex:1}}><div style={{fontWeight:700,fontSize:FS}}>{wsObj.name}</div>{wsObj.phone&&<div style={{fontSize:FS-2,color:T.textSec}}>{"📱 "+wsObj.phone}</div>}</div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
            <div style={{padding:"6px 8px",borderRadius:8,background:T.purple+"10",textAlign:"center"}}><div style={{fontSize:FS-3,color:T.textSec}}>تسليم ورشة</div><div style={{fontWeight:800,color:T.purple}}>{wsTotalDel}</div></div>
            <div style={{padding:"6px 8px",borderRadius:8,background:T.ok+"10",textAlign:"center"}}><div style={{fontSize:FS-3,color:T.textSec}}>استلام مصنع</div><div style={{fontWeight:800,color:T.ok}}>{wsTotalRcv}</div></div>
            <div style={{padding:"6px 8px",borderRadius:8,background:(wsBal>0?T.err:T.ok)+"10",textAlign:"center"}}><div style={{fontSize:FS-3,color:T.textSec}}>رصيد حالي</div><div style={{fontWeight:800,color:wsBal>0?T.err:T.ok}}>{wsBal}</div></div>
          </div>
        </div>})()}
    </Card>
    {selWs&&<Card title={"أوردرات متاحة للتسليم ("+availOrders.length+")"} style={{marginBottom:16}}>
      {availOrders.length>0?<div>
        {(()=>{const fOrds=availOrders;return<div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"2fr 1fr",gap:10,marginBottom:10}}>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>{"اختر الأوردر ("+fOrds.length+")"}</label>
            <SearchSel value={selOrder} onChange={v=>{setSelOrder(v);setDelType("");const o=data.orders.find(x=>x.id===v);if(o){const pieces=o.orderPieces||[];if(pieces.length===0)setDelQty(getAvailQty(o))}}} options={fOrds.map(o=>{const t=calcOrder(o);const pieces=o.orderPieces||[];const pInfo=pieces.length>0?pieces.map(p=>{const d=(o.workshopDeliveries||[]).filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0);const a=t.cutQty-d;return a>0?p+":"+a:null}).filter(Boolean).join(" | "):"متاح: "+getAvailQty(o);return{value:o.id,label:o.modelNo+" - "+o.modelDesc+" ["+pInfo+"]"}})} placeholder="ابحث بالموديل..."/>
          </div>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>الكمية</label><Inp type="number" value={delQty} onChange={v=>{const ord=data.orders.find(x=>x.id===selOrder);const max=ord?getAvailQty(ord):99999;setDelQty(Math.min(Number(v)||0,max))}}/></div>
        </div>})()}
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr 1fr",gap:10,marginBottom:10}}>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>نوع القطعة</label>{(()=>{
            const ord=data.orders.find(x=>x.id===selOrder);
            const pieces=ord?(ord.orderPieces||[]):[];
            const t=ord?calcOrder(ord):{cutQty:0};
            /* Check which pieces are linked to fabrics */
            const linkedPieces=new Set();if(ord)FKEYS.forEach(k=>{if(gf(ord,k))(ord["fabricPieces"+k]||[]).forEach(p=>linkedPieces.add(p))});
            const hasFabric=ord?FKEYS.some(k=>gf(ord,k)):false;
            /* V15.6 FIX: A piece is only "cut" (linked) if:
               - There's at least one fabric on the order, AND
               - Either (a) only one piece total (single-piece orders get the fabric by default),
                 OR (b) this piece is explicitly in the fabricPieces mapping.
               Previously: linkedPieces.size===0 made ALL pieces linked — bug that allowed
               delivering uncut pieces to workshops. */
            const isLinked=p=>hasFabric&&(pieces.length<=1||linkedPieces.has(p));
            /* Compute available pieces */
            const availPieces=pieces.filter(p=>{if(!isLinked(p))return false;const delForP=(ord.workshopDeliveries||[]).filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0);return delForP<t.cutQty});
            const unlinkedPieces=pieces.filter(p=>!isLinked(p));
            return pieces.length>0?<><Sel value={delType} onChange={v=>{setDelType(v);if(v&&ord){const delForP=(ord.workshopDeliveries||[]).filter(wd=>wd.garmentType===v).reduce((s,wd)=>s+(Number(wd.qty)||0),0);setDelQty(t.cutQty-delForP);const gt=(data.garmentTypes||[]).find(g=>g.name===v);if(gt?.defaultPrice&&!delPrice)setDelPrice(gt.defaultPrice)}}}>
              <option value="">-- اختر القطعة --</option>
              {availPieces.map(p=>{const delForP=(ord.workshopDeliveries||[]).filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0);return<option key={p} value={p}>{gIcon(p,data.garmentTypes)+" "+p+" (متاح: "+(t.cutQty-delForP)+")"}</option>})}
            </Sel>{unlinkedPieces.length>0&&<div style={{marginTop:4}}>{unlinkedPieces.map(p=><span key={p} style={{display:"inline-block",padding:"3px 10px",borderRadius:6,fontSize:FS-2,fontWeight:600,color:T.err,background:T.err+"10",border:"1px solid "+T.err+"20",marginLeft:4}}>{gIcon(p,data.garmentTypes)+" "+p+" — لم يتم القص"}</span>)}</div>}</>:<Inp value={delType} onChange={setDelType} placeholder="نوع القطعة..."/>
          })()}</div>
          {!isInternal(selWs)&&<div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>سعر التشغيل</label><Inp type="number" step="0.01" value={delPrice} onChange={v=>setDelPrice(v)} placeholder="سعر القطعة"/></div>}
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>ملاحظات</label><Inp value={delNote} onChange={setDelNote} placeholder="ملاحظات..."/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>مدة التسليم (أيام)</label><Inp type="number" value={delAgreed} onChange={setDelAgreed} placeholder="اختياري"/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>التاريخ</label><Inp type="date" value={delDate} onChange={setDelDate}/></div>
        </div>
        <div style={{display:"flex",gap:8}}><Btn primary onClick={()=>deliverToWs(false)} disabled={!selOrder||!delQty||!delType}>تسليم وحفظ</Btn><Btn onClick={()=>deliverToWs(true)} disabled={!selOrder||!delQty||!delType} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}}>تسليم + طباعة</Btn><Btn onClick={()=>deliverToWs(false,false,true)} disabled={!selOrder||!delQty||!delType} style={{background:"#F59E0B12",color:"#F59E0B",border:"1px solid #F59E0B30"}} title="طباعة ليبل حراري">🏷️ ليبل</Btn><Btn onClick={()=>deliverToWs(false,true)} disabled={!selOrder||!delQty||!delType} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}} title="ارسال عبر واتساب">📱 واتساب</Btn><Btn ghost onClick={()=>{setSelOrder("");setDelQty(0);setDelType("");setDelNote("");setDelPrice("")}}>الغاء</Btn></div>
        {selOrder&&(()=>{const ord=data.orders.find(o=>o.id===selOrder);if(!ord)return null;const t=calcOrder(ord);const avail=getAvailQty(ord);const totalDel=(ord.workshopDeliveries||[]).reduce((s,wd)=>s+(Number(wd.qty)||0),0);return<div style={{padding:14,background:T.inputBg||T.cardSolid,borderRadius:10,border:"1px solid "+T.brd,marginTop:12}}>
          <div style={{fontSize:FS,fontWeight:700,marginBottom:6}}>{"تفاصيل الأوردر: "+ord.modelNo}</div>
          <div style={{display:"flex",gap:14,flexWrap:"wrap",fontSize:FS-1}}>
            <span>{"الوصف: "+ord.modelDesc}</span><span>{"المقاسات: "+ord.sizeLabel}</span>
            <span style={{fontWeight:700,color:T.accent}}>{"كمية القص: "+t.cutQty}</span>
            <span style={{fontWeight:700,color:T.warn}}>{"تم تسليمه: "+totalDel}</span>
            <span style={{fontWeight:700,color:T.ok}}>{"متاح: "+avail}</span>
          </div>
          {(ord.workshopDeliveries||[]).length>0&&<div style={{marginTop:10}}><div style={{fontSize:FS-2,color:T.textSec,marginBottom:4}}>تم تسليمه سابقاً:</div>{(ord.workshopDeliveries||[]).map((wd,i)=><div key={i} style={{fontSize:FS-2,color:T.purple,padding:"2px 0"}}>{"• "+wd.wsName+" - "+wd.qty+" قطعة"+(wd.garmentType?" ("+wd.garmentType+")":"")+" - "+wd.date}</div>)}</div>}
        </div>})()}
      </div>:<p style={{color:T.textSec,textAlign:"center",padding:30}}>لا توجد أوردرات متاحة للتسليم</p>}
    </Card>}
    {/* Workshop-specific movements */}
    {/* Workshop-specific movements */}
    {selWs&&wsMoves.length>0&&(()=>{
      /* Recalculate all receives' price + amount from their delivery's current wd.price. */
      const recalcWsPrices=async()=>{
        let touched=0;let deliveriesTouched=0;
        data.orders.forEach(o=>{
          (o.workshopDeliveries||[]).forEach(wd=>{
            if(wd.wsName!==selWs)return;
            if(!Array.isArray(wd.receives)||wd.receives.length===0)return;
            const newPrice=Number(wd.price)||0;
            let thisWdTouched=false;
            wd.receives.forEach(r=>{
              const oldP=Number(r.price)||0;
              const oldAmt=Number(r.amount)||0;
              const newAmt=r2((Number(r.qty)||0)*newPrice);
              if(oldP!==newPrice||oldAmt!==newAmt){touched++;thisWdTouched=true}
            });
            if(thisWdTouched)deliveriesTouched++;
          });
        });
        if(touched===0){showToast("✅ كل الاستلامات محدّثة بالفعل");return}
        if(!await ask("تحديث الأسعار","سيتم تحديث "+touched+" استلام من "+deliveriesTouched+" تسليم. هل تريد المتابعة؟",{confirmText:"متابعة"}))return;
        upConfig(d=>{
          (d.orders||[]).forEach(o=>{
            (o.workshopDeliveries||[]).forEach(wd=>{
              if(wd.wsName!==selWs)return;
              if(!Array.isArray(wd.receives))return;
              const newPrice=Number(wd.price)||0;
              wd.receives.forEach(r=>{
                r.price=newPrice;
                r.amount=r2((Number(r.qty)||0)*newPrice);
              });
            });
          });
        });
        showToast("✅ تم إعادة حساب "+touched+" استلام — حساب الورشة محدّث");
      };
      return<Card title={"حركات ورشة "+selWs+" (آخر "+Math.min(10,wsMoves.length)+" من "+wsMoves.length+")"}>
      <div style={{marginBottom:10,display:"flex",justifyContent:"flex-end"}}>
        {canEdit&&!isInternal(selWs)&&<Btn small onClick={recalcWsPrices} style={{background:"#8B5CF612",color:"#8B5CF6",border:"1px solid #8B5CF640",fontWeight:700}} title="يعيد حساب كل الاستلامات بناءً على الأسعار الحالية">🔄 إعادة حساب الأسعار</Btn>}
      </div>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:550}}>
        <thead><tr>{["نوع الحركة","التاريخ","موديل","الوصف","نوع القطعة","الكمية",...(isInternal(selWs)?[]:["سعر"]),"ملاحظات",""].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
        <tbody>{wsMoves.slice(0,10).map((m,i)=>{const isEd=editMov&&editMov.orderId===m.orderId&&editMov.wdIdx===m.wdIdx&&editMov.type===m.type&&(m.type==="deliver"||editMov.rIdx===m.rIdx);
          return<tr key={i} style={{background:m.type==="deliver"?"#F0FDF4":"#EFF6FF"}}>
          <td style={{...TD,fontWeight:700,color:m.type==="deliver"?T.ok:m.type==="settlement"?T.err:T.accent}}>{m.type==="deliver"?"↗ تسليم ورشة":m.type==="settlement"?"⚖️ تسوية":"↙ استلام مصنع"}</td>
          <td style={TD}>{isEd?<Inp type="date" value={editDate} onChange={setEditDate} style={{width:120}}/>:m.date}</td>
          <td style={TDB}>{m.orderNo}</td><td style={TD}>{m.orderDesc}</td><td style={TD}>{m.garmentType||"-"}</td>
          <td style={{...TDB,color:m.type==="deliver"?T.ok:m.type==="settlement"?T.err:T.accent}}>{isEd?<Inp type="number" value={editQty} onChange={v=>setEditQty(Number(v)||0)} style={{width:60}}/>:m.qty}</td>
          {!isInternal(selWs)&&<td style={TD}>{isEd&&m.type==="deliver"?<Inp type="number" step="0.01" value={editPrice} onChange={v=>setEditPrice(v)} style={{width:60}}/>:(m.price?m.price+" ج.م":"-")}</td>}
          <td style={TD}>{isEd?<Inp value={editNote} onChange={setEditNote} style={{width:80}}/>:(m.notes||"-")}</td>
          <td style={{...TD,whiteSpace:"nowrap"}}>{canEdit&&<div style={{display:"flex",gap:3}}>
            {isEd?<><Btn small primary onClick={saveEditMov}>حفظ</Btn><Btn ghost small onClick={()=>setEditMov(null)} title="إغلاق">✕</Btn></>:<>
            <Btn small onClick={()=>startEditMov(m)} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}} title="تعديل">✏️</Btn>
            <DelBtn onConfirm={()=>delMovement(m)} blocked={getMovBlock(m)}/>
            <Btn small onClick={()=>printMov(m)} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}} title="طباعة">🖨</Btn>
            <Btn small onClick={()=>{const ord=data.orders.find(o=>o.id===m.orderId);if(!ord)return;const wd=(ord.workshopDeliveries||[])[m.wdIdx];if(!wd)return;if(m.type==="deliver")printLabel(m.wsName,ord,m.garmentType,m.qty,m.date,data.garmentTypes,{type:"deliver",delDate:m.date,delQty:m.qty});else{printLabel(m.wsName,ord,m.garmentType,m.qty,m.date,data.garmentTypes,{type:"receive",delDate:wd.date,delQty:wd.qty,rcvDate:m.date,rcvQty:m.qty})}}} style={{background:"#F59E0B12",color:"#F59E0B",border:"1px solid #F59E0B30"}} title="طباعة ليبل حراري">🏷️</Btn>
            <Btn small onClick={()=>{const phone=wsObj?.phone||"";const msg=m.type==="deliver"?"*CLARK — تسليم*%0A%0A• الورشة: *"+selWs+"*%0A• موديل: *"+m.orderNo+"*%0A• الوصف: "+(m.orderDesc||"-")+"%0A• القطعة: *"+(m.garmentType||"عام")+"*%0A• الكمية: *"+m.qty+"*%0A• التاريخ: *"+m.date+"*%0A%0A*برجاء التأكيد*":"*CLARK — استلام*%0A%0A• الورشة: *"+selWs+"*%0A• موديل: *"+m.orderNo+"*%0A• الوصف: "+(m.orderDesc||"-")+"%0A• القطعة: *"+(m.garmentType||"عام")+"*%0A• الكمية: *"+m.qty+"*%0A• التاريخ: *"+m.date+"*%0A%0A*برجاء التأكيد*";openWA("https://wa.me/"+(phone?phone.replace(/[^0-9]/g,""):"")+"?text="+msg,"_blank")}} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}} title="ارسال واتساب">📱</Btn></>}
          </div>}</td></tr>})}</tbody>
      </table></div>
    </Card>})()}
  </div>;

  /* ── BATCH DELIVER MODE ── */
  if(mode==="batch"){
    /* Build available items when workshop selected */
    const buildBatchItems=()=>{if(!selWs)return[];const items=[];
      data.orders.forEach(o=>{const t=calcOrder(o);if(!FKEYS.some(k=>gf(o,k)))return;const pieces=o.orderPieces||[];const linkedPieces=new Set();FKEYS.forEach(k=>{if(gf(o,k))(o["fabricPieces"+k]||[]).forEach(p=>linkedPieces.add(p))});
        if(pieces.length>0){pieces.forEach(p=>{if(linkedPieces.size>0&&!linkedPieces.has(p))return;const delForP=(o.workshopDeliveries||[]).filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0);const avail=t.cutQty-delForP;if(avail>0)items.push({orderId:o.id,modelNo:o.modelNo,modelDesc:o.modelDesc,garmentType:p,qty:avail,maxQty:avail,price:0,checked:false})})}
        else{const totalDel=(o.workshopDeliveries||[]).reduce((s,wd)=>s+(Number(wd.qty)||0),0);const avail=t.cutQty-totalDel;if(avail>0)items.push({orderId:o.id,modelNo:o.modelNo,modelDesc:o.modelDesc,garmentType:"عام",qty:avail,maxQty:avail,price:0,checked:false})}
      });return items};
    const toggleItem=(idx)=>setBatchItems(p=>p.map((x,i)=>i===idx?{...x,checked:!x.checked}:x));
    const updateItem=(idx,field,val)=>setBatchItems(p=>p.map((x,i)=>i===idx?{...x,[field]:field==="qty"?Math.min(Number(val)||0,x.maxQty):field==="price"?Number(val)||0:val}:x));
    const selectAll=()=>setBatchItems(p=>p.map(x=>({...x,checked:true})));
    const deselectAll=()=>setBatchItems(p=>p.map(x=>({...x,checked:false})));
    const checked=batchItems.filter(x=>x.checked&&x.qty>0);
    const totalQty=checked.reduce((s,x)=>s+x.qty,0);

    const doBatchDeliver=async(andPrint,andWa)=>{if(checked.length===0)return;
      /* Group items by orderId */
      const byOrder={};checked.forEach(item=>{if(!byOrder[item.orderId])byOrder[item.orderId]=[];byOrder[item.orderId].push(item)});
      /* Direct Firestore writes - bypass updOrder to avoid stale state */
      for(const[orderId,items] of Object.entries(byOrder)){
        const ord=data.orders.find(o=>o.id===orderId);if(!ord||!ord._docId)continue;
        const updated=JSON.parse(JSON.stringify(ord));
        if(!updated.workshopDeliveries)updated.workshopDeliveries=[];
        items.forEach(item=>{updated.workshopDeliveries.push({id:gid(),wsName:selWs,wsId:wsObj?wsObj.id:null,wsType:wsObj?wsObj.type:"",wsOwner:wsObj?wsObj.owner:"",qty:item.qty,garmentType:item.garmentType,notes:"تسليم مُجمع",price:item.price,date:batchDate,receives:[],createdBy:userName||""})});
        updated.status=recomputeStatus(updated);
        const clean={...updated};delete clean._docId;
        try{await setDoc(doc(db,"seasons",season,"orders",ord._docId),clean)}catch(e){console.error("batch write error:",e)}
      }
      showToast("✓ تم تسليم "+checked.length+" بند ("+totalQty+" قطعة) لـ "+selWs);
      if(andPrint){let pages=[];for(const item of checked){const ord=data.orders.find(o=>o.id===item.orderId);
          const html=await printReceipt(selWs,wsObj?.owner||"",ord||{modelNo:item.modelNo,modelDesc:item.modelDesc},item.garmentType,item.qty,batchDate,0,data.garmentTypes,true);
          if(html)pages.push(html)}
        if(pages.length>0)printPage("اذن تسليم مُجمع — "+selWs,pages.map((p,i)=>"<div"+(i>0?" style='page-break-before:always'":"")+">"+p+"</div>").join(""))}
      if(andWa){const phone=wsObj?.phone||"";let lines=checked.map(item=>"• موديل *"+item.modelNo+"* — "+item.modelDesc+"%0A  "+item.garmentType+" — *"+item.qty+"* قطعة"+(item.price?" — "+item.price+" ج.م":"")).join("%0A");
        const msg="*CLARK — اذن تسليم مُجمع*%0A%0A• الورشة: *"+selWs+"*%0A• التاريخ: *"+batchDate+"*%0A%0A─────────────────%0A"+lines+"%0A─────────────────%0A• الاجمالي: *"+totalQty+"* قطعة%0A%0A*برجاء التأكيد*";
        openWA("https://wa.me/"+(phone?phone.replace(/[^0-9]/g,""):"")+"?text="+msg,"_blank")}
      setBatchItems([]);setSelWs("");setMode(null)};

    return<div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <h1 style={{fontSize:isMob?22:28,fontWeight:800,margin:0,color:"#8B5CF6"}}>{"📦 تسليم مُجمع"}</h1>
        <Btn ghost onClick={()=>{setMode(null);setSelWs("");setBatchItems([])}}>↩</Btn>
      </div>
      <Card title="اختر الورشة" style={{marginBottom:16,position:"relative",zIndex:100}}>
        <SearchSel value={selWs} onChange={v=>{setSelWs(v);
          /* Build items using same logic as regular deliver */
          const items=[];
          const eligible=data.orders.filter(o=>{const s=o.status;return s==="تم القص"||s==="في التشغيل"||s==="في الطباعة"||s==="في التطريز"});
          eligible.forEach(o=>{const t=calcOrder(o);if(t.cutQty<=0)return;
            const pieces=o.orderPieces||[];
            if(pieces.length>0){
              pieces.forEach(p=>{
                const delForP=(o.workshopDeliveries||[]).filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0);
                const avail=t.cutQty-delForP;
                if(avail>0)items.push({orderId:o.id,modelNo:o.modelNo,modelDesc:o.modelDesc,garmentType:p,qty:avail,maxQty:avail,price:0,checked:false})
              })
            }else{
              const totalDel=(o.workshopDeliveries||[]).reduce((s,wd)=>s+(Number(wd.qty)||0),0);
              const avail=t.cutQty-totalDel;
              if(avail>0)items.push({orderId:o.id,modelNo:o.modelNo,modelDesc:o.modelDesc,garmentType:"عام",qty:avail,maxQty:avail,price:0,checked:false})
            }
          });
          setBatchItems(items)
        }} options={workshops.map(w=>({value:w.name||w,label:(w.type?wsTypeInfo(w.type).icon+" "+wsTypeInfo(w.type).key+" — ":"")+(w.name||w)}))} placeholder="ابحث عن ورشة..."/>
      </Card>
      {selWs&&batchItems.length>0&&(()=>{const bq=batchQ.trim().toLowerCase();const filteredIdx=batchItems.map((item,i)=>({item,i})).filter(({item})=>!bq||(item.modelNo||"").toLowerCase().includes(bq)||(item.modelDesc||"").toLowerCase().includes(bq));
        return<Card title={"الاوردرات المتاحة للتسليم ("+batchItems.length+")"} style={{marginBottom:16}}>
        <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
          <Btn small onClick={selectAll} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30"}}>تحديد الكل</Btn>
          <Btn small onClick={deselectAll} style={{background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30"}}>الغاء الكل</Btn>
          <div><label style={{fontSize:FS-2,color:T.textSec}}>التاريخ </label><input type="date" value={batchDate} onChange={e=>setBatchDate(e.target.value)} style={{padding:"4px 8px",borderRadius:6,border:"1px solid "+T.brd,fontSize:FS-1,fontFamily:"inherit",background:T.cardSolid,color:T.text}}/></div>
          {checked.length>0&&<><Btn small primary onClick={()=>doBatchDeliver(false)}>📦 تسليم ({checked.length})</Btn><Btn small onClick={()=>doBatchDeliver(true)} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}} title="طباعة">🖨</Btn><Btn small onClick={()=>doBatchDeliver(false,true)} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}} title="ارسال واتساب">📱</Btn></>}
        </div>
        <Inp value={batchQ} onChange={setBatchQ} placeholder="فلتر برقم الموديل أو الوصف..." style={{marginBottom:8}}/>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["✓","الموديل","الوصف","القطعة","الكمية","السعر"].map(h=><th key={h} style={{...TH,fontSize:FS-1}}>{h}</th>)}</tr></thead>
        <tbody>{filteredIdx.map(({item,i})=><tr key={i} style={{background:item.checked?T.ok+"04":"",opacity:item.checked?1:0.5}}>
          <td style={{...TD,textAlign:"center"}}><span onClick={()=>toggleItem(i)} style={{cursor:"pointer",fontSize:18}}>{item.checked?"☑":"☐"}</span></td>
          <td style={{...TDB,fontSize:FS}}>{item.modelNo}</td>
          <td style={{...TD,fontSize:FS-1}}>{item.modelDesc}</td>
          <td style={{...TD,fontWeight:700,color:"#8B5CF6",fontSize:FS}}>{item.garmentType}</td>
          <td style={{...TD,minWidth:70}}><Inp type="number" value={item.qty} onChange={v=>updateItem(i,"qty",v)} sx={{padding:"3px 6px",fontSize:FS-1,textAlign:"center"}}/></td>
          <td style={{...TD,minWidth:70}}>{!isInternal(selWs)&&<Inp type="number" value={item.price||""} onChange={v=>updateItem(i,"price",v)} sx={{padding:"3px 6px",fontSize:FS-1}} placeholder="السعر"/>}</td>
        </tr>)}</tbody></table></div>
        {checked.length>0&&<div style={{marginTop:12,padding:12,borderRadius:10,background:"#8B5CF608",border:"1px solid #8B5CF620"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
            <div style={{fontSize:FS+1,fontWeight:800,color:"#8B5CF6"}}>{"اجمالي: "+checked.length+" بند — "+totalQty+" قطعة"}</div>
            <div style={{display:"flex",gap:6}}>
              <Btn primary onClick={()=>doBatchDeliver(false)}>📦 تسليم الكل</Btn>
              <Btn onClick={()=>doBatchDeliver(true)} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}}>📦 تسليم + طباعة</Btn>
              <Btn onClick={()=>doBatchDeliver(false,true)} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}} title="ارسال عبر واتساب">📱 واتساب</Btn>
            </div>
          </div>
        </div>}
      </Card>})()}
      {selWs&&batchItems.length===0&&<Card><div style={{textAlign:"center",padding:30,color:T.textMut}}>لا توجد قطع متاحة للتسليم لهذه الورشة</div></Card>}
    </div>
  }

  /* ── BATCH RECEIVE MODE ── */
  if(mode==="batchRcv"){
    const buildRcvItems=()=>{if(!selWs)return[];const items=[];
      data.orders.forEach(o=>{(o.workshopDeliveries||[]).forEach((wd,wdIdx)=>{if(wd.wsName!==selWs)return;
        const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);const bal=(Number(wd.qty)||0)-rcvd;
        if(bal>0)items.push({orderId:o.id,docId:o._docId,modelNo:o.modelNo,modelDesc:o.modelDesc,garmentType:wd.garmentType||"عام",wdIdx,delivered:wd.qty,received:rcvd,balance:bal,qty:bal,price:Number(wd.price)||0,checked:false})
      })});return items};
    const toggleRcv=(idx)=>setBatchItems(p=>p.map((x,i)=>i===idx?{...x,checked:!x.checked}:x));
    const updateRcv=(idx,val)=>setBatchItems(p=>p.map((x,i)=>i===idx?{...x,qty:Math.min(Number(val)||0,x.balance)}:x));
    const checkedRcv=batchItems.filter(x=>x.checked&&x.qty>0);
    const totalRcvQty=checkedRcv.reduce((s,x)=>s+x.qty,0);

    const doBatchReceive=async(andPrint,andWa)=>{if(checkedRcv.length===0)return;
      const byOrder={};checkedRcv.forEach(item=>{if(!byOrder[item.orderId])byOrder[item.orderId]=[];byOrder[item.orderId].push(item)});
      for(const[orderId,items] of Object.entries(byOrder)){
        const ord=data.orders.find(o=>o.id===orderId);if(!ord||!ord._docId)continue;
        const updated=JSON.parse(JSON.stringify(ord));
        items.forEach(item=>{if(!updated.workshopDeliveries[item.wdIdx].receives)updated.workshopDeliveries[item.wdIdx].receives=[];
          updated.workshopDeliveries[item.wdIdx].receives.push({date:batchDate,qty:item.qty,notes:"استلام مُجمع",price:item.price,amount:r2(item.qty*item.price),quality:"جيد جداً",createdBy:userName||""})});
        updated.status=recomputeStatus(updated);
        const clean={...updated};delete clean._docId;
        try{await setDoc(doc(db,"seasons",season,"orders",ord._docId),clean)}catch(e){console.error("batch rcv error:",e)}
      }
      showToast("✓ تم استلام "+checkedRcv.length+" بند ("+totalRcvQty+" قطعة) من "+selWs);
      if(andPrint){let pages=[];for(const item of checkedRcv){const ord=data.orders.find(o=>o.id===item.orderId);
          const html=await printReceiveReceipt(selWs,ord||{modelNo:item.modelNo,modelDesc:item.modelDesc},item.garmentType,item.qty,batchDate,0,data.garmentTypes,true);
          if(html)pages.push(html)}
        if(pages.length>0)printPage("اذونات استلام مجمعة — "+selWs,pages.map((p,i)=>"<div"+(i>0?" style='page-break-before:always'":"")+">"+p+"</div>").join(""))}
      if(andWa){const phone=wsObj?.phone||"";const lines=checkedRcv.map(item=>"• موديل *"+item.modelNo+"* — "+item.modelDesc+"%0A  "+item.garmentType+" — *"+item.qty+"* قطعة").join("%0A");
        const msg="*CLARK — استلام مُجمع من ورشة*%0A%0A• الورشة: *"+selWs+"*%0A• التاريخ: *"+batchDate+"*%0A%0A─────────────────%0A"+lines+"%0A─────────────────%0A• الاجمالي: *"+totalRcvQty+"* قطعة%0A%0A*برجاء التأكيد*";
        openWA("https://wa.me/"+(phone?phone.replace(/[^0-9]/g,""):"")+"?text="+msg,"_blank")}
      setBatchItems([]);setSelWs("");setMode(null)};

    return<div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <h1 style={{fontSize:isMob?22:28,fontWeight:800,margin:0,color:T.ok}}>{"📥 استلام مُجمع"}</h1>
        <Btn ghost onClick={()=>{setMode(null);setSelWs("");setBatchItems([])}}>↩</Btn>
      </div>
      <Card title="اختر الورشة" style={{marginBottom:16,position:"relative",zIndex:100}}>
        <SearchSel value={selWs} onChange={v=>{setSelWs(v);
          const items=[];data.orders.forEach(o=>{(o.workshopDeliveries||[]).forEach((wd,wdIdx)=>{if(wd.wsName!==v)return;
            const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);const bal=(Number(wd.qty)||0)-rcvd;
            if(bal>0)items.push({orderId:o.id,docId:o._docId,modelNo:o.modelNo,modelDesc:o.modelDesc,garmentType:wd.garmentType||"عام",wdIdx,delivered:wd.qty,received:rcvd,balance:bal,qty:bal,price:Number(wd.price)||0,checked:false})
          })});setBatchItems(items);setBatchQ("")
        }} options={workshops.map(w=>({value:w.name||w,label:(w.type?wsTypeInfo(w.type).icon+" "+wsTypeInfo(w.type).key+" — ":"")+(w.name||w)}))} placeholder="ابحث عن ورشة..."/>
      </Card>
      {selWs&&batchItems.length>0&&(()=>{const bq=batchQ.trim().toLowerCase();const filteredIdx=batchItems.map((item,i)=>({item,i})).filter(({item})=>!bq||(item.modelNo||"").toLowerCase().includes(bq)||(item.modelDesc||"").toLowerCase().includes(bq));
        return<Card title={"الاوردرات المتاحة للاستلام ("+batchItems.length+")"} style={{marginBottom:16}}>
        <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
          <Btn small onClick={()=>setBatchItems(p=>p.map(x=>({...x,checked:true})))} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30"}}>تحديد الكل</Btn>
          <Btn small onClick={()=>setBatchItems(p=>p.map(x=>({...x,checked:false})))} style={{background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30"}}>الغاء الكل</Btn>
          <div><label style={{fontSize:FS-2,color:T.textSec}}>التاريخ </label><input type="date" value={batchDate} onChange={e=>setBatchDate(e.target.value)} style={{padding:"4px 8px",borderRadius:6,border:"1px solid "+T.brd,fontSize:FS-1,fontFamily:"inherit",background:T.cardSolid,color:T.text}}/></div>
          {checkedRcv.length>0&&<><Btn small onClick={()=>doBatchReceive(false)} style={{background:T.ok,color:"#fff",border:"none"}}>📥 استلام ({checkedRcv.length})</Btn><Btn small onClick={()=>doBatchReceive(true)} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}} title="طباعة">🖨</Btn><Btn small onClick={()=>doBatchReceive(false,true)} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}} title="ارسال واتساب">📱</Btn></>}
        </div>
        <Inp value={batchQ} onChange={setBatchQ} placeholder="فلتر برقم الموديل أو الوصف..." style={{marginBottom:8}}/>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["✓","الموديل","الوصف","القطعة","تسليم","استلام مصنع","رصيد","استلام الآن"].map(h=><th key={h} style={{...TH,fontSize:FS-1}}>{h}</th>)}</tr></thead>
        <tbody>{filteredIdx.map(({item,i})=><tr key={i} style={{background:item.checked?T.ok+"04":"",opacity:item.checked?1:0.5}}>
          <td style={{...TD,textAlign:"center"}}><span onClick={()=>toggleRcv(i)} style={{cursor:"pointer",fontSize:18}}>{item.checked?"☑":"☐"}</span></td>
          <td style={{...TDB,fontSize:FS}}>{item.modelNo}</td>
          <td style={{...TD,fontSize:FS-1}}>{item.modelDesc}</td>
          <td style={{...TD,fontWeight:700,color:"#8B5CF6"}}>{item.garmentType}</td>
          <td style={TDB}>{item.delivered}</td>
          <td style={{...TDB,color:T.ok}}>{item.received}</td>
          <td style={{...TDB,color:T.err}}>{item.balance}</td>
          <td style={{...TD,minWidth:70}}><Inp type="number" value={item.qty} onChange={v=>updateRcv(i,v)} sx={{padding:"3px 6px",fontSize:FS-1,textAlign:"center"}}/></td>
        </tr>)}</tbody></table></div>
        {checkedRcv.length>0&&<div style={{marginTop:12,padding:12,borderRadius:10,background:T.ok+"08",border:"1px solid "+T.ok+"20"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
            <div style={{fontSize:FS+1,fontWeight:800,color:T.ok}}>{"اجمالي: "+checkedRcv.length+" بند — "+totalRcvQty+" قطعة"}</div>
            <div style={{display:"flex",gap:6}}>
              <Btn primary onClick={()=>doBatchReceive(false)} style={{background:T.ok,border:"none"}}>📥 استلام الكل</Btn>
              <Btn onClick={()=>doBatchReceive(true)} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}}>📥 استلام + طباعة</Btn>
              <Btn onClick={()=>doBatchReceive(false,true)} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}} title="ارسال عبر واتساب">📱 واتساب</Btn>
            </div>
          </div>
        </div>}
      </Card>})()}
      {selWs&&batchItems.length===0&&<Card><div style={{textAlign:"center",padding:30,color:T.textMut}}>لا توجد قطع في انتظار الاستلام من هذه الورشة</div></Card>}
    </div>
  }

  /* ── RECEIVE MODE ── */
  if(mode==="receive")return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
      <h1 style={{fontSize:isMob?22:28,fontWeight:800,margin:0}}>{"📥 استلام من ورشة"}</h1>
      <Btn ghost onClick={()=>{setMode(null);setSelWs("")}}>↩</Btn>
    </div>
    <Card title="اختر الورشة" style={{marginBottom:16,position:"relative",zIndex:100}}>
      <SearchSel value={selWs} onChange={v=>{setSelWs(v);setRcvSearch("")}} options={workshops.map(w=>({value:w.name||w,label:(w.type?wsTypeInfo(w.type).icon+" "+wsTypeInfo(w.type).key+" — ":"")+(w.name||w)+(w.owner?" - "+w.owner:"")}))} placeholder="ابحث عن ورشة..."/>
      {selWs&&<div style={{marginTop:8}}><Inp value={rcvSearch} onChange={setRcvSearch} placeholder="بحث برقم الموديل..."/></div>}
    </Card>
    {selWs&&<Card title={"أوردرات تم تسليمها لـ "+selWs} style={{marginBottom:16}}>
      {(()=>{
        const cards=[];wsOrders.forEach(ord=>{(ord.workshopDeliveries||[]).filter(wd=>wd.wsName===selWs).forEach((wd,wdIdx)=>{const actualIdx=(ord.workshopDeliveries||[]).indexOf(wd);const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);const bal=(Number(wd.qty)||0)-rcvd;if(bal>0)cards.push({ord,wd,wdIdx,actualIdx,rcvd,bal})})});
        const filtered=rcvSearchDeb.trim()?cards.filter(c=>c.ord.modelNo.toLowerCase().includes(rcvSearchDeb.trim().toLowerCase())):cards;
        if(filtered.length===0){const hasAny=wsOrders.some(o=>(o.workshopDeliveries||[]).some(wd=>wd.wsName===selWs));return<p style={{color:hasAny?T.ok:T.textSec,textAlign:"center",padding:30,fontWeight:hasAny?700:400}}>{rcvSearchDeb.trim()?"لا توجد نتائج لـ \""+rcvSearchDeb+"\"":hasAny?"✓ تم استلام جميع الكميات من الورشة":"لا توجد أوردرات تم تسليمها لهذه الورشة"}</p>}
        return<div style={{display:"flex",flexDirection:"column",gap:16}}>
          {filtered.map(({ord,wd,wdIdx,actualIdx,rcvd,bal})=>{
            return<div key={ord.id+"-"+wdIdx} style={{background:T.cardSolid,borderRadius:14,border:"1px solid "+T.err+"40",overflow:"hidden"}}>
              <div style={{padding:"14px 18px",background:T.err+"08",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                <div><span style={{fontWeight:700,fontSize:FS+1}}>{ord.modelNo}</span><span style={{fontSize:FS-1,color:T.textSec,marginRight:10}}>{" - "+ord.modelDesc}</span>{wd.garmentType&&<span style={{fontSize:FS,fontWeight:700,color:T.purple,background:T.purple+"15",padding:"4px 14px",borderRadius:10,marginRight:6}}>{gIcon(wd.garmentType,data.garmentTypes)+" "+wd.garmentType}</span>}</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  <span style={{padding:"4px 12px",borderRadius:8,background:T.accent+"15",fontSize:FS-1,fontWeight:600}}>{"تسليم ورشة: "+wd.qty}</span>
                  <span style={{padding:"4px 12px",borderRadius:8,background:T.ok+"15",fontSize:FS-1,fontWeight:600,color:T.ok}}>{"استلام مصنع: "+rcvd}</span>
                  <span style={{padding:"4px 12px",borderRadius:8,background:T.err+"15",fontSize:FS-1,fontWeight:700,color:T.err}}>{"رصيد: "+bal}</span>
                  {!isInternal(selWs)&&wd.price>0&&<span style={{padding:"4px 12px",borderRadius:8,background:T.purple+"15",fontSize:FS-1,fontWeight:600,color:T.purple}}>{"تشغيل: "+wd.price+" ج.م"}</span>}
                </div>
              </div>
              <div style={{padding:16}}>
                <div style={{fontSize:FS-2,color:T.textSec,marginBottom:8}}>{"تاريخ التسليم: "+wd.date}</div>
                {(wd.receives||[]).length>0&&<div style={{marginBottom:12}}><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:350}}><thead><tr>{["#","التاريخ","الكمية","ملاحظات",""].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
                  {wd.receives.map((r,ri)=>{const rBal=bal+Number(r.qty);return<tr key={ri}><td style={TD}>{ri+1}</td><td style={TD}>{r.date}</td><td style={TDB}>{r.qty}</td><td style={TD}>{r.notes||"-"}</td><td style={{...TD,whiteSpace:"nowrap"}}><div style={{display:"flex",gap:3}}><Btn small onClick={()=>printReceiveReceipt(selWs,ord,wd.garmentType||"",r.qty,r.date,rBal,data.garmentTypes)} style={{background:T.ok+"15",color:T.ok,border:"1px solid "+T.ok+"30"}} title="طباعة">🖨</Btn></div></td></tr>})}
                </tbody></table></div></div>}
                {canEdit&&(()=>{const ck=ord.id+"-"+actualIdx;const rv=getRcv(ck);const wdP=Number(wd.price)||0;return<div style={{display:"flex",gap:6,flexWrap:"wrap",padding:8,background:T.inputBg||T.cardSolid,borderRadius:8,alignItems:"end"}}>
                  <div style={{minWidth:70}}><label style={{fontSize:FS-3,color:T.textSec}}>الكمية</label><Inp type="number" value={rv.qty} onChange={v=>setRcv(ck,"qty",Math.min(Number(v)||0,bal))}/></div>
                  {!isInternal(selWs)&&wdP>0&&<div><label style={{fontSize:FS-3,color:T.purple}}>سعر التشغيل</label><div style={{padding:"6px 10px",borderRadius:8,background:T.purple+"10",fontWeight:700,color:T.purple,fontSize:FS}}>{wdP+" ج.م"}</div></div>}
                  {!isInternal(selWs)&&wdP>0&&(rv.qty||0)>0&&<div><label style={{fontSize:FS-3,color:T.accent}}>المبلغ</label><div style={{padding:"6px 10px",borderRadius:8,background:T.accent+"10",fontWeight:700,color:T.accent,fontSize:FS}}>{fmt(r2((rv.qty||0)*wdP))+" ج.م"}</div></div>}
                  <div style={{flex:1,minWidth:80}}><label style={{fontSize:FS-3,color:T.textSec}}>ملاحظات</label><Inp value={rv.note} onChange={v=>setRcv(ck,"note",v)}/></div>
                  <div style={{minWidth:90}}><label style={{fontSize:FS-3,color:T.warn}}>تقييم الجودة</label><Sel value={rv.quality||"جيد جداً"} onChange={v=>setRcv(ck,"quality",v)}><option value="ممتاز">⭐ ممتاز</option><option value="جيد جداً">⭐ جيد جداً</option><option value="جيد">⭐ جيد</option><option value="مقبول">⭐ مقبول</option><option value="سئ">⭐ سئ</option></Sel></div>
                  <div style={{minWidth:110}}><label style={{fontSize:FS-3,color:T.textSec}}>التاريخ</label><Inp type="date" value={rv.date||new Date().toISOString().split("T")[0]} onChange={v=>setRcv(ck,"date",v)}/></div>
                  <Btn onClick={()=>receiveFromWs(ord.id,actualIdx,false,null,ck)} style={{background:T.ok+"15",color:T.ok,border:"1px solid "+T.ok+"30"}}>حفظ</Btn>
                  <Btn onClick={()=>receiveFromWs(ord.id,actualIdx,true,{modelNo:ord.modelNo,bal},ck)} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}}>حفظ+طباعة</Btn>
                  <Btn onClick={()=>receiveFromWs(ord.id,actualIdx,false,null,ck,false,true)} style={{background:"#F59E0B12",color:"#F59E0B",border:"1px solid #F59E0B30"}} title="طباعة ليبل حراري">🏷️</Btn>
                  <Btn onClick={()=>receiveFromWs(ord.id,actualIdx,false,null,ck,true)} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}} title="ارسال واتساب">📱</Btn>
                </div>})()}
              </div>
            </div>
          })}
        </div>})()}
    </Card>}
    {/* Workshop-specific movements */}
    {selWs&&wsMoves.length>0&&<Card title={"حركات ورشة "+selWs+" (آخر "+Math.min(10,wsMoves.length)+" من "+wsMoves.length+")"}>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:550}}>
        <thead><tr>{["نوع الحركة","التاريخ","موديل","الوصف","نوع القطعة","الكمية",...(isInternal(selWs)?[]:["سعر"]),"ملاحظات",""].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
        <tbody>{wsMoves.slice(0,10).map((m,i)=>{const isEd=editMov&&editMov.orderId===m.orderId&&editMov.wdIdx===m.wdIdx&&editMov.type===m.type&&(m.type==="deliver"||editMov.rIdx===m.rIdx);
          return<tr key={i} style={{background:m.type==="deliver"?"#F0FDF4":"#EFF6FF"}}>
          <td style={{...TD,fontWeight:700,color:m.type==="deliver"?T.ok:m.type==="settlement"?T.err:T.accent}}>{m.type==="deliver"?"↗ تسليم ورشة":m.type==="settlement"?"⚖️ تسوية":"↙ استلام مصنع"}</td>
          <td style={TD}>{isEd?<Inp type="date" value={editDate} onChange={setEditDate} style={{width:120}}/>:m.date}</td>
          <td style={TDB}>{m.orderNo}</td><td style={TD}>{m.orderDesc}</td><td style={TD}>{m.garmentType||"-"}</td>
          <td style={{...TDB,color:m.type==="deliver"?T.ok:m.type==="settlement"?T.err:T.accent}}>{isEd?<Inp type="number" value={editQty} onChange={v=>setEditQty(Number(v)||0)} style={{width:60}}/>:m.qty}</td>
          {!isInternal(selWs)&&<td style={TD}>{isEd&&m.type==="deliver"?<Inp type="number" step="0.01" value={editPrice} onChange={v=>setEditPrice(v)} style={{width:60}}/>:(m.price?m.price+" ج.م":"-")}</td>}
          <td style={TD}>{isEd?<Inp value={editNote} onChange={setEditNote} style={{width:80}}/>:(m.notes||"-")}</td>
          <td style={{...TD,whiteSpace:"nowrap"}}>{canEdit&&<div style={{display:"flex",gap:3}}>
            {isEd?<><Btn small primary onClick={saveEditMov}>حفظ</Btn><Btn ghost small onClick={()=>setEditMov(null)} title="إغلاق">✕</Btn></>:<>
            <Btn small onClick={()=>startEditMov(m)} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}} title="تعديل">✏️</Btn>
            <DelBtn onConfirm={()=>delMovement(m)} blocked={getMovBlock(m)}/>
            <Btn small onClick={()=>printMov(m)} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}} title="طباعة">🖨</Btn>
            <Btn small onClick={()=>{const ord=data.orders.find(o=>o.id===m.orderId);if(!ord)return;const wd=(ord.workshopDeliveries||[])[m.wdIdx];if(!wd)return;if(m.type==="deliver")printLabel(m.wsName,ord,m.garmentType,m.qty,m.date,data.garmentTypes,{type:"deliver",delDate:m.date,delQty:m.qty});else{printLabel(m.wsName,ord,m.garmentType,m.qty,m.date,data.garmentTypes,{type:"receive",delDate:wd.date,delQty:wd.qty,rcvDate:m.date,rcvQty:m.qty})}}} style={{background:"#F59E0B12",color:"#F59E0B",border:"1px solid #F59E0B30"}} title="طباعة ليبل حراري">🏷️</Btn>
            <Btn small onClick={()=>{const phone=wsObj?.phone||"";const msg=m.type==="deliver"?"*CLARK — تسليم*%0A%0A• الورشة: *"+selWs+"*%0A• موديل: *"+m.orderNo+"*%0A• الوصف: "+(m.orderDesc||"-")+"%0A• القطعة: *"+(m.garmentType||"عام")+"*%0A• الكمية: *"+m.qty+"*%0A• التاريخ: *"+m.date+"*%0A%0A*برجاء التأكيد*":"*CLARK — استلام*%0A%0A• الورشة: *"+selWs+"*%0A• موديل: *"+m.orderNo+"*%0A• الوصف: "+(m.orderDesc||"-")+"%0A• القطعة: *"+(m.garmentType||"عام")+"*%0A• الكمية: *"+m.qty+"*%0A• التاريخ: *"+m.date+"*%0A%0A*برجاء التأكيد*";openWA("https://wa.me/"+(phone?phone.replace(/[^0-9]/g,""):"")+"?text="+msg,"_blank")}} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}} title="ارسال واتساب">📱</Btn></>}
          </div>}</td></tr>})}</tbody>
      </table></div>
    </Card>}
  </div>;

  /* ── PAYMENT MODE ── */
  if(mode==="payment")return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><h2 style={{fontSize:isMob?18:22,fontWeight:800,margin:0}}>{"💳 اضافة دفعة"}</h2><Btn ghost onClick={()=>setMode(null)}>↩</Btn></div>
    <Card title="تسجيل دفعة" style={{marginBottom:14}}>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:8,marginBottom:8}}>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>الورشة *</label><SearchSel value={payWs} onChange={setPayWs} options={extWorkshops.map(w=>({value:w.name,label:wsTypeInfo(w.type).icon+" "+wsTypeInfo(w.type).key+" — "+w.name}))} placeholder="ابحث عن ورشة..."/></div>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>نوع الحركة</label><Sel value={payType} onChange={setPayType}><option value="payment">دفعة للورشة (↗ تقليل)</option><option value="purchase">مشتريات الورشة (↙ اضافة)</option></Sel></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr 2fr",gap:8,marginBottom:8}}>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>المبلغ *</label><Inp type="number" step="0.01" value={payAmt} onChange={setPayAmt}/></div>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>التاريخ</label><Inp type="date" value={payDate} onChange={setPayDate}/></div>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>ملاحظات</label><Inp value={payNote} onChange={setPayNote}/></div>
      </div>
      {payWs&&(()=>{const a=wsAccounts(payWs);const wsObj=workshops.find(x=>x.name===payWs);const pct=wsObj?.payPercent||60;const totalDue=a.due+a.totalPurchase;const limit=r2(totalDue*(pct/100));const remaining=r2(limit-a.totalPaid);const exceeded=remaining<0;
        return<div style={{marginBottom:8}}>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:4}}>
            <span style={{padding:"4px 10px",borderRadius:6,fontSize:FS-1,fontWeight:700,background:a.balance>0?T.err+"10":T.ok+"10",color:a.balance>0?T.err:T.ok}}>{"الرصيد: "+fmt(r2(a.balance))+" ج.م"}</span>
            <span style={{padding:"4px 10px",borderRadius:6,fontSize:FS-1,fontWeight:600,background:T.purple+"10",color:T.purple}}>{"حد "+pct+"%: "+fmt(limit)}</span>
            <span style={{padding:"4px 10px",borderRadius:6,fontSize:FS-1,fontWeight:600,background:T.warn+"10"}}>{"مدفوع: "+fmt(r2(a.totalPaid))}</span>
            <span style={{padding:"4px 10px",borderRadius:6,fontSize:FS-1,fontWeight:700,background:remaining>0?T.ok+"10":T.err+"10",color:remaining>0?T.ok:T.err}}>{"متاح للدفع: "+(remaining>0?fmt(remaining)+" ج.م":"0")}</span>
          </div>
          {exceeded&&<div style={{padding:6,borderRadius:6,background:T.err+"10",fontSize:FS-1,fontWeight:700,color:T.err}}>{"⚠️ تجاوز حد "+pct+"% بمبلغ "+fmt(Math.abs(remaining))+" ج.م"}</div>}
        </div>})()}
      <Btn primary onClick={()=>addPayment(false)} disabled={!payWs||!payAmt}>تسجيل</Btn>
      <Btn onClick={()=>addPayment(true)} disabled={!payWs||!payAmt} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}} title="ارسال عبر واتساب">📱 واتساب</Btn>
    </Card>
    {payWs&&<Card title={"دفعات "+payWs}><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["التاريخ","النوع","المبلغ","ملاحظات",""].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
      {(data.wsPayments||[]).filter(p=>p.wsName===payWs).sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map((p,i)=>{const isEd=editPayId===p.id;
        return<tr key={i} style={{background:isEd?T.warn+"08":p.type==="payment"?"#FEF2F2":"#F0FDF4"}}>
        <td style={{...TD,minWidth:110}}>{isEd?<Inp type="date" value={edPayDate} onChange={setEdPayDate}/>:p.date}</td>
        <td style={{...TD,fontWeight:700,color:p.type==="payment"?T.err:T.ok}}>{isEd?<Sel value={edPayType} onChange={setEdPayType}><option value="payment">دفعة</option><option value="purchase">مشتريات</option></Sel>:(p.type==="payment"?"دفعة ↗":"مشتريات ↙")}</td>
        <td style={{...TDB,color:p.type==="payment"?T.err:T.ok,minWidth:90}}>{isEd?<Inp type="number" value={edPayAmt} onChange={setEdPayAmt}/>:fmt(p.amount)+" ج.م"}</td>
        <td style={{...TD,minWidth:80}}>{isEd?<Inp value={edPayNote} onChange={setEdPayNote}/>:(p.notes||"-")}</td>
        <td style={{...TD,whiteSpace:"nowrap"}}><div style={{display:"flex",gap:3}}>
          {isEd?<><Btn small primary onClick={()=>{upConfig(d=>{const t=(d.wsPayments||[]).find(x=>x.id===p.id);if(t){t.date=edPayDate;t.amount=Number(edPayAmt)||0;t.notes=edPayNote;t.type=edPayType;
            /* Sync linked treasury entry */
            const txId=t.treasuryTxId;const tx=txId?(d.treasury||[]).find(x=>x.id===txId):(d.treasury||[]).find(x=>x.wsPaymentId===t.id);
            if(tx){tx.date=edPayDate;tx.amount=Number(edPayAmt)||0;tx.category=edPayType==="payment"?"تشغيل خارجي":"مشتريات";tx.desc=(edPayType==="payment"?"دفعة ورشة ":"مشتريات ورشة ")+t.wsName+(edPayNote?" — "+edPayNote:"");tx.day=dayName(edPayDate)}}
            });setEditPayId(null);showToast("✓ تم التعديل")}} title="حفظ">💾</Btn><Btn ghost small onClick={()=>setEditPayId(null)} title="إغلاق">✕</Btn></>
          :<><Btn small onClick={()=>{setEditPayId(p.id);setEdPayDate(p.date);setEdPayAmt(p.amount);setEdPayNote(p.notes||"");setEdPayType(p.type)}} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}} title="تعديل">✏️</Btn>
          <Btn small onClick={()=>{const wsO=workshops.find(w=>w.name===payWs);const ph=wsO?.phone||"";const ac=wsAccounts(payWs);const mg="*CLARK — "+(p.type==="payment"?"اشعار دفعة":"اشعار مشتريات")+"*%0A%0A• الورشة: *"+payWs+"*%0A• المبلغ: *"+fmt(p.amount)+"* ج.م%0A• التاريخ: *"+p.date+"*%0A"+(p.notes?"• ملاحظات: "+p.notes+"%0A":"")+"%0A─────────────────%0A*الرصيد الحالي: "+fmt(r2(ac.balance))+" ج.م*";openWA("https://wa.me/"+(ph?ph.replace(/[^0-9]/g,""):"")+"?text="+mg,"_blank")}} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}} title="ارسال واتساب">📱</Btn>
          <DelBtn onConfirm={()=>upConfig(d=>{
            const pay=(d.wsPayments||[]).find(x=>x.id===p.id);
            d.wsPayments=(d.wsPayments||[]).filter(x=>x.id!==p.id);
            /* Remove linked treasury entry */
            if(pay?.treasuryTxId)d.treasury=(d.treasury||[]).filter(t=>t.id!==pay.treasuryTxId);
            else d.treasury=(d.treasury||[]).filter(t=>t.wsPaymentId!==p.id);
          })}/></>}
        </div></td>
      </tr>})}{(data.wsPayments||[]).filter(p=>p.wsName===payWs).length===0&&<tr><td colSpan={5} style={{...TD,textAlign:"center",color:T.textSec}}>لا توجد دفعات</td></tr>}
    </tbody></table></div></Card>}
  </div>;

  /* ── ACCOUNTS MODE ── */
  if(mode==="accounts"){
    const activeWs=extWorkshops.filter(w=>{const a=wsAccounts(w.name);return a.due>0||a.totalPaid>0||a.totalPurchase>0});
    const totals=activeWs.reduce((s,w)=>{const a=wsAccounts(w.name);return{due:s.due+a.due,purchase:s.purchase+a.totalPurchase,paid:s.paid+a.totalPaid,balance:s.balance+a.balance}},{due:0,purchase:0,paid:0,balance:0});
    const filteredWs=accWsF==="الكل"?activeWs:activeWs.filter(w=>w.name===accWsF);
    return<div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
        <div><h2 style={{fontSize:isMob?18:22,fontWeight:800,margin:0}}>{"📊 حسابات الورش"}</h2><div style={{fontSize:FS-1,color:T.textSec}}>{"الموسم: "+season}</div></div>
        <div style={{display:"flex",gap:6}}>
          <Btn onClick={()=>{const rows=[["الورشة","النسبة","مستحق","مدفوع","حد النسبة","متاح للدفع","الرصيد"]];activeWs.forEach(w=>{const a=wsAccounts(w.name);const pct=w.payPercent||60;const totalDue=a.due+a.totalPurchase;const limit=r2(totalDue*(pct/100));const remaining=r2(limit-a.totalPaid);rows.push([w.name,pct+"%",r2(totalDue),r2(a.totalPaid),limit,remaining>0?remaining:0,r2(a.balance)])});rows.push([]);rows.push(["اجمالي","",r2(totals.due+totals.purchase),r2(totals.paid),"","",r2(totals.balance)]);exportExcel(rows,"حسابات_الورش_"+season)}} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30"}}>📊 Excel</Btn>
          <Btn onClick={()=>{const el=document.getElementById("ws-acc-area");if(!el)return;printPage("حسابات الورش — "+season,el.innerHTML)}} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨</Btn>
          <Btn ghost onClick={()=>setMode(null)}>↩</Btn>
        </div>
      </div>
      <div id="ws-acc-area">
      <Card title="ملخص الحسابات" style={{marginBottom:14}}><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}>
        <thead><tr>{["الورشة","النسبة","مستحق","مدفوع","حد النسبة","متاح للدفع","الرصيد",""].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
        <tbody>{activeWs.map(w=>{const a=wsAccounts(w.name);const pct=w.payPercent||60;const totalDue=a.due+a.totalPurchase;const limit=r2(totalDue*(pct/100));const remaining=r2(limit-a.totalPaid);const exceeded=remaining<0;
          return<tr key={w.id}>
          <td style={{...TD,fontWeight:700}}>{w.name}</td>
          <td style={{...TDB,color:T.purple}}>{pct+"%"}</td>
          <td style={{...TDB,color:T.accent}}>{fmt(r2(totalDue))}</td>
          <td style={{...TDB,color:T.warn}}>{fmt(r2(a.totalPaid))}</td>
          <td style={TDB}>{fmt(limit)}</td>
          <td style={{...TDB,fontWeight:700,color:remaining>0?T.ok:remaining<0?T.err:T.textMut}}>{remaining>0?fmt(remaining):remaining<0?"تجاوز "+fmt(Math.abs(remaining)):"0"}</td>
          <td style={{...TDB,fontSize:FS+1,color:a.balance>0?T.err:T.ok}}>{fmt(r2(a.balance))}</td>
          <td style={TD}>{exceeded&&<span style={{fontSize:FS-2,padding:"2px 6px",borderRadius:6,background:T.err+"12",color:T.err,fontWeight:700}}>⚠</span>}</td>
        </tr>})}
          {(()=>{const tLimit=activeWs.reduce((s,w)=>{const a=wsAccounts(w.name);const pct=w.payPercent||60;return s+r2((a.due+a.totalPurchase)*(pct/100))},0);const tRemaining=r2(tLimit-totals.paid);
          return<tr style={{background:T.accent+"08"}}><td style={{...TD,fontWeight:800}}>الاجمالي</td><td style={TD}></td>
          <td style={{...TDB,color:T.accent,fontWeight:800}}>{fmt(r2(totals.due+totals.purchase))}</td>
          <td style={{...TDB,color:T.warn,fontWeight:800}}>{fmt(r2(totals.paid))}</td>
          <td style={{...TDB,fontWeight:800}}>{fmt(r2(tLimit))}</td>
          <td style={{...TDB,fontWeight:800,color:tRemaining>0?T.ok:T.err}}>{tRemaining>0?fmt(tRemaining):tRemaining<0?"تجاوز "+fmt(Math.abs(tRemaining)):"0"}</td>
          <td style={{...TDB,fontSize:FS+2,fontWeight:800,color:totals.balance>0?T.err:T.ok}}>{fmt(r2(totals.balance))+" ج.م"}</td><td style={TD}></td></tr>})()}
        </tbody>
      </table></div></Card>
      {/* Workshop filter */}
      <div style={{marginBottom:14}}><SearchSel value={accWsF} onChange={setAccWsF} options={[{value:"الكل",label:"كل الورش"},...activeWs.map(w=>({value:w.name,label:(w.type?wsTypeInfo(w.type).icon+" "+wsTypeInfo(w.type).key+" — ":"")+w.name}))]} placeholder="ابحث عن ورشة..."/></div>
      {/* Per-workshop statement */}
      {filteredWs.map(w=>{const a=wsAccounts(w.name);
        const entries=[];
        data.orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===w.name).forEach(wd=>{(wd.receives||[]).forEach(r=>{entries.push({date:r.date,desc:o.modelNo+(wd.garmentType?" - "+wd.garmentType:""),qty:r.qty,price:r.price||0,amount:r2((r.qty||0)*(r.price||0)),type:"due"})})})});
        (data.wsPayments||[]).filter(p=>p.wsName===w.name).forEach(p=>{entries.push({date:p.date,desc:p.type==="payment"?"دفعة"+(p.notes?" - "+p.notes:""):"مشتريات"+(p.notes?" - "+p.notes:""),amount:p.amount,type:p.type})});
        entries.sort((a,b)=>(a.date||"").localeCompare(b.date||""));let running=0;
        const printStmt=async()=>{
          let qrSrc="";try{const QR=await loadQR();if(QR)qrSrc=await QR.toDataURL(window.location.origin+"?act=wsacc&ws="+encodeURIComponent(w.name),{width:120,margin:1})}catch(e){}
          const totalDue=a.due+a.totalPurchase;const pct=w.payPercent||60;
          let del=0,rcv=0;data.orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===w.name).forEach(wd=>{del+=Number(wd.qty)||0;(wd.receives||[]).forEach(r=>{rcv+=Number(r.qty)||0})})});
          let h="<div style='text-align:center;margin-bottom:20px'><img src='"+CLARK_LOGO+"' style='width:160px;margin-bottom:8px'/><h1 style='font-size:22px;margin:0;color:#0F172A'>كشف حساب ورشة</h1><h2 style='font-size:26px;margin:4px 0;color:#0284C7'>"+w.name+"</h2><div style='font-size:12px;color:#64748B'>الموسم: "+season+" | تاريخ الطباعة: "+new Date().toLocaleDateString("ar-EG")+"</div></div>";
          h+="<div style='display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-bottom:16px'>";
          h+="<div style='padding:10px 16px;border-radius:8px;background:#EFF6FF;text-align:center;min-width:100px'><div style='font-size:11px;color:#64748B'>تسليم للورشة</div><div style='font-size:18px;font-weight:800;color:#0284C7'>"+fmt(del)+"</div></div>";
          h+="<div style='padding:10px 16px;border-radius:8px;background:#F0FDF4;text-align:center;min-width:100px'><div style='font-size:11px;color:#64748B'>استلام مصنع</div><div style='font-size:18px;font-weight:800;color:#10B981'>"+fmt(rcv)+"</div></div>";
          h+="<div style='padding:10px 16px;border-radius:8px;background:#FEF3C7;text-align:center;min-width:100px'><div style='font-size:11px;color:#64748B'>المستحق</div><div style='font-size:18px;font-weight:800;color:#F59E0B'>"+fmt(r2(totalDue))+"</div></div>";
          h+="<div style='padding:10px 16px;border-radius:8px;background:#FEE2E2;text-align:center;min-width:100px'><div style='font-size:11px;color:#64748B'>المدفوع</div><div style='font-size:18px;font-weight:800;color:#EF4444'>"+fmt(r2(a.totalPaid))+"</div></div>";
          h+="<div style='padding:10px 16px;border-radius:8px;background:"+(a.balance>0?"#FEE2E2":"#F0FDF4")+";text-align:center;min-width:100px'><div style='font-size:11px;color:#64748B'>رصيد حالي</div><div style='font-size:18px;font-weight:800;color:"+(a.balance>0?"#EF4444":"#10B981")+"'>"+fmt(r2(a.balance))+"</div></div></div>";
          h+="<table><thead><tr><th>التاريخ</th><th>البيان</th><th>كمية</th><th>سعر</th><th>مستحق</th><th>مدفوع</th><th>رصيد حالي</th></tr></thead><tbody>";
          let pRun=0;entries.forEach(e=>{if(e.type==="due"||e.type==="purchase")pRun+=e.amount;else pRun-=e.amount;
            h+="<tr style='background:"+(e.type==="payment"?"#FEF2F2":e.type==="purchase"?"#F0FDF4":"")+"'><td>"+e.date+"</td><td>"+e.desc+"</td><td style='font-weight:700'>"+(e.qty||"-")+"</td><td>"+(e.price||"-")+"</td><td style='color:#0284C7;font-weight:700'>"+(e.type==="due"?fmt(e.amount):e.type==="purchase"?fmt(e.amount):"-")+"</td><td style='color:#EF4444;font-weight:700'>"+(e.type==="payment"?fmt(e.amount):"-")+"</td><td style='font-weight:700;color:"+(pRun>0?"#EF4444":"#10B981")+"'>"+fmt(r2(pRun))+"</td></tr>"});
          h+="</tbody></table>";
          h+="<div style='display:flex;justify-content:space-between;align-items:flex-end;margin-top:30px'><div style='text-align:center;width:180px'><div style='border-top:2px solid #333;padding-top:8px;font-weight:700;font-size:12px'>توقيع المسؤول</div></div><div style='text-align:center;width:180px'><div style='border-top:2px solid #333;padding-top:8px;font-weight:700;font-size:12px'>توقيع الورشة</div></div>"+(qrSrc?"<div style='text-align:center'><img src='"+qrSrc+"' style='width:80px;height:80px'/><div style='font-size:8px;color:#94A3B8'>"+w.name+"</div></div>":"")+"</div>";
          h+="<div style='margin-top:16px;text-align:center;font-size:10px;color:#94A3B8;border-top:1px solid #E2E8F0;padding-top:8px'>CLARK Factory Management — "+new Date().toLocaleDateString("ar-EG")+"</div>";
          printPage("كشف حساب — "+w.name,h)
        };
        return<Card key={w.id} title={"كشف حساب: "+w.name} style={{marginTop:12}} extra={<Btn small onClick={printStmt} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}} title="طباعة">🖨 طباعة</Btn>}>
          <div id={"ws-stmt-"+w.id}>
          <h2>{"كشف حساب: "+w.name}</h2>
          <div className="sub">{"الموسم: "+season+" | التاريخ: "+new Date().toLocaleDateString("ar-EG")}</div>
          {(()=>{const pct=w.payPercent||60;const totalDue=a.due+a.totalPurchase;const limit=r2(totalDue*(pct/100));const remaining=r2(limit-a.totalPaid);const exceeded=remaining<0;
          return<><div style={{display:"flex",gap:6,marginBottom:6,flexWrap:"wrap"}}>
            <span className="badge" style={{padding:"4px 10px",borderRadius:6,background:T.accent+"10",fontSize:FS-1,fontWeight:600}}>{"مستحق: "+fmt(r2(totalDue))}</span>
            <span className="badge" style={{padding:"4px 10px",borderRadius:6,background:T.warn+"10",fontSize:FS-1,fontWeight:600}}>{"مدفوع: "+fmt(r2(a.totalPaid))}</span>
            <span className="badge" style={{padding:"4px 10px",borderRadius:6,background:T.purple+"10",fontSize:FS-1,fontWeight:600,color:T.purple}}>{"حد "+pct+"%: "+fmt(limit)}</span>
            <span className="badge" style={{padding:"4px 10px",borderRadius:6,background:remaining>0?T.ok+"10":T.err+"10",fontSize:FS-1,fontWeight:700,color:remaining>0?T.ok:T.err}}>{"متاح للدفع: "+(remaining>0?fmt(remaining):"0")}</span>
            <span className="badge" style={{padding:"4px 10px",borderRadius:6,background:a.balance>0?T.err+"10":T.ok+"10",fontSize:FS-1,fontWeight:700,color:a.balance>0?T.err:T.ok}}>{"الرصيد النهائي: "+fmt(r2(a.balance))+" ج.م"}</span>
          </div>
          {exceeded&&<div style={{padding:8,borderRadius:8,background:T.err+"10",border:"1px solid "+T.err+"25",marginBottom:8,fontSize:FS,fontWeight:700,color:T.err}}>{"⚠️ تجاوز حد النسبة "+pct+"% بمبلغ "+fmt(Math.abs(remaining))+" ج.م"}</div>}</>})()}
          <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["التاريخ","البيان","كمية","سعر","مستحق","مدفوع","الرصيد"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
            <tbody>{entries.map((e,i)=>{if(e.type==="due"||e.type==="purchase")running+=e.amount;else running-=e.amount;
              return<tr key={i} style={{background:e.type==="payment"?"#FEF2F2":e.type==="purchase"?"#F0FDF4":""}}>
                <td style={TD}>{e.date}</td><td style={TD}>{e.desc}</td><td style={TDB}>{e.qty||"-"}</td><td style={TD}>{e.price?e.price:"-"}</td>
                <td style={{...TDB,color:T.accent}}>{e.type==="due"?fmt(e.amount):e.type==="purchase"?fmt(e.amount):"-"}</td>
                <td style={{...TDB,color:T.err}}>{e.type==="payment"?fmt(e.amount):"-"}</td>
                <td style={{...TDB,color:running>0?T.err:T.ok}}>{fmt(r2(running))}</td></tr>})}</tbody>
          </table></div>
          </div>
        </Card>})}
      </div>
    </div>
  }
  return null
}

/* ══ COST CALCULATOR ══ */
