import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { auth, db, getSecondaryAuth } from "./firebase";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { doc, setDoc, onSnapshot, collection, addDoc, updateDoc, deleteDoc, getDocs, runTransaction, getDoc } from "firebase/firestore";

/* ─── V15.0 Module imports (refactored from monolith) ─── */
import { FKEYS, FCOL, WS_TYPES, COLORS_DB, THEMES, DEFAULT_STATUSES, INIT_CONFIG, GARMENT_ICONS, QUALITY_MAP, FS, PRINT_CSS } from "./constants/index.js";
import { CLARK_LOGO } from "./constants/logo.js";
import { gid, fmt, r2, gf, getSizesFromSet } from "./utils/format.js";
import { playBeep } from "./utils/audio.js";
import { compressImage, compressImg43 } from "./utils/image.js";
import { loadXLSX, loadQR, loadJsQR, scanQR, compressFile } from "./utils/qr.js";
import { addAudit } from "./utils/audit.js";
import { enforceDataLimits } from "./utils/dataLimits.js";
import { ask, tell, askInput, askForm, showToast, highlightRow } from "./utils/popups.js";
import { printPage, printPkgLabel, printEmpQrCards, renderLabelPages, openPrintWindow } from "./utils/print.js";
import { wsIsInternal, calcOrder, getConfirmedStock, checkStockAvailability, deductStockForOrder, calcWsRating, migrateStatus } from "./utils/orders.js";

/* T, TH, TD, TDB, TDL imported from theme.js (V15.0 phase 2) — mutable module-level objects.
   setActiveTheme() is called when user switches theme to refresh their properties. */
import { T, TH, TD, TDB, TDL, setActiveTheme } from "./theme.js";
import { Spinner, LoadingBtn, InlineLoading, Badge, Btn, Inp, Sel, SearchSel, Card, MetricCard, PBar, DelBtn, ColorPicker, FCTable, AccPicker, Timeline, QRImg, QRScanner, useDebounced, useWin } from "./components/ui.jsx";
import { CustDeliverPg } from "./pages/CustDeliverPg.jsx";
import { PurchasePg } from "./pages/PurchasePg.jsx";
import { TreasuryPg } from "./pages/TreasuryPg.jsx";
import { HRPg } from "./pages/HRPg.jsx";

/* V15.1 phase 3: page/component imports */
/* V15.76: print-extras imports removed — none used in App.jsx (used in pages directly) */
import { LoginScreen, TABS } from "./components/LoginScreen.jsx";
import { ActivityFeed } from "./components/ActivityFeed.jsx";
import { DashPg } from "./pages/DashPg.jsx";
import { DBPg } from "./pages/DBPg.jsx";
import { OrdForm } from "./pages/OrdForm.jsx";
import { DetPg } from "./pages/DetPg.jsx";
import { ExtProdPg } from "./pages/ExtProdPg.jsx";
import { CalcPg } from "./pages/CalcPg.jsx";
import { StockPg } from "./pages/StockPg.jsx";
import { RepPg } from "./pages/RepPg.jsx";
import { ReportsHub } from "./pages/reports.jsx";
import { CostPg } from "./pages/CostPg.jsx";
import { TasksPg } from "./pages/TasksPg.jsx";
import { SettingsPg } from "./pages/SettingsPg.jsx";
import { AuditPg } from "./pages/AuditPg.jsx";
/* V15.59: Mobile Warehouse — accessed via /warehouse URL */
import { MobileWarehouseShell } from "./pages/mobile/MobileWarehouseShell.jsx";
import { WarehousePg } from "./pages/WarehousePg.jsx";

/* V15.50: Public delivery confirmation page — opened when customer scans QR from delivery receipt.
   Rendered BEFORE auth check so it works without login. */
import { ConfirmPage } from "./components/ConfirmPage.jsx";


/* Optional libs - loaded dynamically */





/* useWin moved to components/ui.jsx (V15.0 phase 2) */






/* ═══════════════════════════════════════════════════════════════
   Loading System — unified spinners and loading buttons
   
   Usage:
     <Spinner size="small|medium|large" color="#...">
     <LoadingBtn loading={isLoading} loadingText="جاري...">Original</LoadingBtn>
     <InlineLoading message="..." />
   
   Design: CSS-only rotating border spinner, respects theme colors,
   lightweight animation (~60fps), works on all screens.
   ═══════════════════════════════════════════════════════════════ */









/* Debounced value hook — used to avoid lag on search inputs.
   value changes immediately in UI, but returned debounced value updates only
   after `delay` ms of inactivity. Typical use: expensive filters/searches. */





export default function App(){
  /* V15.50: Public delivery confirmation — checked FIRST so customer QR scans don't require login.
     URL format: /?dc=1&s=<sessionId>&c=<custId>&sig=<hmac> */
  const urlParams=new URLSearchParams(window.location.search);
  if(urlParams.get("dc")==="1"){
    const s=urlParams.get("s"),c=urlParams.get("c"),sig=urlParams.get("sig");
    if(s&&c&&sig){
      return <ConfirmPage params={{s,c,sig}}/>;
    }
  }
  /* QR scan: ?o=modelNo → order details, ?act=rcv&oid=ID&wdi=IDX → receive mode */
  const qrParams=new URLSearchParams(window.location.search);
  const qrModelNo=qrParams.get("o");
  const qrAction=qrParams.get("act");
  const qrOid=qrParams.get("oid");
  const qrWdi=qrParams.get("wdi");
  const qrWs=qrParams.get("ws");

  const[user,setUser]=useState(null);const[authLoading,setAuthLoading]=useState(true);
  const[configDoc,setConfigDoc]=useState(INIT_CONFIG);const[salesDoc,setSalesDoc]=useState({});const[tasksDoc,setTasksDoc]=useState({});const[orders,setOrders]=useState([]);const[dataLoading,setDataLoading]=useState(true);
  const config=useMemo(()=>{const merged={...configDoc,...salesDoc,...tasksDoc};
    /* Safety: if salesDoc has sessions, ALWAYS prefer it over configDoc */
    if(salesDoc.custDeliverySessions)merged.custDeliverySessions=salesDoc.custDeliverySessions;
    if(salesDoc.packages)merged.packages=salesDoc.packages;
    if(tasksDoc.tasks)merged.tasks=tasksDoc.tasks;
    if(tasksDoc.stickyNotes)merged.stickyNotes=tasksDoc.stickyNotes;
    if(tasksDoc.inventoryAudits)merged.inventoryAudits=tasksDoc.inventoryAudits;
    return merged},[configDoc,salesDoc,tasksDoc]);
  const[tab,setTab_]=useState(()=>sessionStorage.getItem("clark_tab")||"home");const[sel,setSel_]=useState(()=>sessionStorage.getItem("clark_sel")||null);
  const setTab=v=>{setTab_(v);sessionStorage.setItem("clark_tab",v)};
  const setSel=v=>{setSel_(v);if(v)sessionStorage.setItem("clark_sel",v);else sessionStorage.removeItem("clark_sel")};
  /* Cross-page tab navigation via custom event (used by WarehousePg to open stock tab) */
  useEffect(()=>{const h=(e)=>{if(e?.detail)setTab(e.detail)};window.addEventListener("goto-tab",h);return()=>window.removeEventListener("goto-tab",h)},[]);
  const[gSearch,setGSearch]=useState("");const gSearchDeb=useDebounced(gSearch,250);const[showAlerts,setShowAlerts]=useState(false);const[showLogout,setShowLogout]=useState(false);const[showScanner,setShowScanner]=useState(false);const[dbSub,setDbSub]=useState(null);const[showTheme,setShowTheme]=useState(false);const[cardPopup,setCardPopup]=useState(null);const[labelPopup,setLabelPopup]=useState(null);const[labelBags,setLabelBags]=useState(1);const[wsAccPopup,setWsAccPopup]=useState(null);const[barcodePopup,setBarcodePopup]=useState(null);const[showNotifs,setShowNotifs]=useState(false);
  const[savingOverlay,setSavingOverlay]=useState(null);/* null or {message,progress} */
  const[stickyForm,setStickyForm]=useState(null);
  const[sidebarTab,setSidebarTab]=useState("notes");/* "notes"|"tasks"|"activity" — for home sidebar */
  const[quickPopup,setQuickPopup]=useState(null);/* "task"|"notif"|null */
  const[qpTo,setQpTo]=useState("");const[qpText,setQpText]=useState("");const[qpType,setQpType]=useState("تذكير");
  const[aiMsgs,setAiMsgs]=useState([]);const[aiInput,setAiInput]=useState("");const[aiLoading,setAiLoading]=useState(false);const[aiOpen,setAiOpen]=useState(false);
  /* V15.68: Dismissed alerts moved to Firestore (per user) — syncs across all devices.
     Structure: config.userDismissed[email] = [{key, at}]
     Auto-prunes entries older than 10 days. */
  const userEmailKey=(user?.email||"").toLowerCase();
  const dismissedAlerts=useMemo(()=>{
    const all=config.userDismissed||{};
    const mine=all[userEmailKey]||[];
    const now=Date.now();
    return mine.filter(d=>d&&d.key&&now-(d.at||0)<864000000);
  },[config.userDismissed,userEmailKey]);
  const dismissAlert=(key)=>{
    if(!key||!userEmailKey)return;
    upConfig(d=>{
      if(!d.userDismissed)d.userDismissed={};
      const mine=Array.isArray(d.userDismissed[userEmailKey])?d.userDismissed[userEmailKey]:[];
      /* Dedupe + prune old (>10 days) */
      const now=Date.now();
      const filtered=mine.filter(x=>x&&x.key&&x.key!==key&&now-(x.at||0)<864000000);
      filtered.push({key,at:now});
      /* Keep last 200 to avoid bloat */
      d.userDismissed[userEmailKey]=filtered.slice(-200);
    });
  };
  const isDismissed=(key)=>dismissedAlerts.some(d=>d.key===key);
  const aiAlerts=useMemo(()=>{const a=[];const now=Date.now();const workshops=config.workshops||[];const wsPayments=config.wsPayments||[];
    /* 1. أوردرات متأخرة */
    orders.forEach(o=>{if(o.closed||o.settlement||o.status==="تم التسليم لمخزن الجاهز")return;const _t=calcOrder(o);const _stk=getConfirmedStock(o);if(_t.cutQty>0&&_stk>=_t.cutQty*0.85)return;const wds=o.workshopDeliveries||[];let lastDate=o.date;wds.forEach(wd=>{if(wd.date>lastDate)lastDate=wd.date;(wd.receives||[]).forEach(r=>{if(r.date>lastDate)lastDate=r.date})});(o.deliveries||[]).forEach(d=>{if(d.date>lastDate)lastDate=d.date});const days=Math.floor((now-new Date(lastDate))/(86400000));
      if(days>7)a.push({icon:"🔴",text:"موديل "+o.modelNo+" واقف من "+days+" يوم",type:"late",orderId:o.id,key:"late_"+o.id})});
    /* 2. أوردرات جاهزة للغلق */
    const _userName=user?.displayName||user?.email?.split("@")[0]||"";
    orders.forEach(o=>{(o.deliveries||[]).filter(d=>d.status==="pending"&&d.createdBy===_userName).forEach(d=>{a.push({icon:"⏳",text:"موديل "+o.modelNo+": "+d.qty+" قطعة في انتظار تأكيد أمين المخزن",type:"info",orderId:o.id,key:"pend_"+o.id+"_"+d.date})})});
    orders.forEach(o=>{(o.deliveries||[]).filter(d=>d.confirmedAt&&d.confirmedAt>new Date(Date.now()-24*60*60*1000).toISOString()&&d.createdBy===_userName).forEach(d=>{a.push({icon:"✅",text:"تم تأكيد استلام "+(d.confirmedQty||d.qty)+" قطعة من موديل "+o.modelNo+(d.confirmedBy?" بواسطة "+d.confirmedBy:""),type:"ready",orderId:o.id,key:"conf_"+o.id+"_"+d.confirmedAt})})});
    orders.forEach(o=>{if(o.closed)return;const t=calcOrder(o);const stockDel=getConfirmedStock(o);if(t.cutQty>0&&stockDel>=t.cutQty)a.push({icon:"✅",text:"موديل "+o.modelNo+" كامل — جاهز للغلق",type:"ready",orderId:o.id,key:"close_"+o.id})});
    /* 3. هالك كبير (>5%) */
    orders.forEach(o=>{if(o.closed||!o.settlement)return;const t=calcOrder(o);if(t.cutQty>0){const pct=Math.round((o.settlement.qty/t.cutQty)*100);if(pct>5)a.push({icon:"⚠️",text:"موديل "+o.modelNo+" فيه "+pct+"% هالك ("+o.settlement.qty+" قطعة)",type:"waste",key:"waste_"+o.id})}});
    /* 4. ورش — أرصدة مالية */
    workshops.forEach(w=>{const isInt=w.type==="داخلي"||w.type==="internal";if(isInt)return;
      let due=0;orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===w.name).forEach(wd=>{(wd.receives||[]).forEach(r=>{due+=r2((Number(r.qty)||0)*(Number(r.price)||0))})})});
      const payments=wsPayments.filter(p=>p.wsName===w.name);const paid=payments.filter(p=>p.type==="payment").reduce((s,p)=>s+(Number(p.amount)||0),0);const purchase=payments.filter(p=>p.type==="purchase").reduce((s,p)=>s+(Number(p.amount)||0),0);
      const owed=due+purchase-paid;
      if(owed<-500)a.push({icon:"💸",text:""+w.name+" عليها "+fmt(r2(Math.abs(owed)))+" ج.م (دفعنالها زيادة)",type:"overpaid"});
      if(owed>5000)a.push({icon:"💰",text:""+w.name+" ليها "+fmt(r2(owed))+" ج.م مدفعناش",type:"unpaid"})});
    /* 5. ورش بطيئة + قرب الموعد */
    workshops.forEach(w=>{const wPhone=w.phone||"";let details=[];orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===w.name).forEach(wd=>{const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);const wBal=(Number(wd.qty)||0)-rcvd;if(wBal>0){const daysSince=Math.floor((now-new Date(wd.date))/(86400000));const agreed=Number(wd.agreedDays)||0;details.push({modelNo:o.modelNo,qty:wBal,days:daysSince,agreed,garment:wd.garmentType||"",delDate:wd.date})}})});
      if(details.length>0){const totalBal=details.reduce((s,d)=>s+d.qty,0);const maxDays=Math.max(...details.map(d=>d.days));
        if(maxDays>14)a.push({icon:"🐢",text:w.name+" عندها "+totalBal+" قطعة من "+maxDays+" يوم",type:"slow",wsName:w.name,wsPhone:wPhone,details});
        details.forEach(d=>{if(d.agreed>0){const remaining=d.agreed-d.days;if(remaining<=2&&remaining>=0)a.push({icon:"⏰",text:w.name+" باقي "+(remaining||"آخر")+" يوم على موعد تسليم موديل "+d.modelNo+" ("+d.agreed+" يوم متفق)",type:"deadline",wsName:w.name,wsPhone:wPhone,details:[d]});
          else if(remaining<0)a.push({icon:"🔴",text:w.name+" متأخرة "+Math.abs(remaining)+" يوم عن الموعد — موديل "+d.modelNo+" (متفق "+d.agreed+" يوم)",type:"overdue",wsName:w.name,wsPhone:wPhone,details:[d]})}})}});
    /* 6. تنبيهات مخزن الخامات والإكسسوار — لو المخزن مفعل */
    const psettings=config.purchaseSettings||{};
    if(psettings.stockEnabled){
      (config.fabrics||[]).forEach(f=>{const st=Number(f.stock)||0;const m=Number(f.minStock)||0;
        if(m>0&&st===0)a.push({icon:"🚫",text:"خامة "+f.name+" نفذت من المخزن!",type:"stock-zero",key:"stock_zero_"+f.id});
        else if(m>0&&st<=m)a.push({icon:"⚠️",text:"خامة "+f.name+" ناقصة ("+fmt(st)+" "+(f.unit||"")+" — الحد الأدنى "+fmt(m)+")",type:"stock-low",key:"stock_low_"+f.id});
      });
      (config.accessories||[]).forEach(ac=>{const st=Number(ac.stock)||0;const m=Number(ac.minStock)||0;
        if(m>0&&st===0)a.push({icon:"🚫",text:"إكسسوار "+ac.name+" نفذ من المخزن!",type:"stock-zero",key:"stock_zero_acc_"+ac.id});
        else if(m>0&&st<=m)a.push({icon:"⚠️",text:"إكسسوار "+ac.name+" ناقص ("+fmt(st)+" "+(ac.unit||"")+" — الحد الأدنى "+fmt(m)+")",type:"stock-low",key:"stock_low_acc_"+ac.id});
      });
    }
    /* 7. تنبيهات المنتجات العامة — دايماً شغالة (مش مرتبطة بـ stockEnabled) */
    (config.generalProducts||[]).forEach(p=>{const st=Number(p.stock)||0;const m=Number(p.minStock)||0;
      if(m>0&&st===0)a.push({icon:"🚫",text:(p.category||"منتج")+" — "+p.name+" نفذ من المخزن!",type:"stock-zero",key:"stock_zero_prod_"+p.id});
      else if(m>0&&st<=m)a.push({icon:"⚠️",text:(p.category||"منتج")+" — "+p.name+" ناقص ("+fmt(st)+" "+(p.unit||"")+" — الحد الأدنى "+fmt(m)+")",type:"stock-low",key:"stock_low_prod_"+p.id});
    });
    return a},[orders,config.workshops,config.wsPayments,config.fabrics,config.accessories,config.generalProducts,config.purchaseSettings]);
  const visibleAlerts=aiAlerts.filter(a=>!isDismissed(a.key||a.text));
  const askAI=async()=>{if(!aiInput.trim()||aiLoading)return;const q=aiInput.trim();setAiInput("");setAiMsgs(p=>[...p,{role:"user",text:q}]);setAiLoading(true);
    try{
      /* Workshop summary */
      const ws=(config.workshops||[]).map(w=>{let del=0,rcv=0;orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===w.name).forEach(wd=>{del+=Number(wd.qty)||0;(wd.receives||[]).forEach(r=>{rcv+=Number(r.qty)||0})})});
        const payments=(config.wsPayments||[]).filter(p=>p.wsName===w.name);const paid=payments.filter(p=>p.type==="payment").reduce((s,p)=>s+(Number(p.amount)||0),0);
        let due=0;orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===w.name).forEach(wd=>{(wd.receives||[]).forEach(r=>{due+=r2((Number(r.qty)||0)*(Number(r.price)||0))})})});
        return{name:w.name,type:w.type,delivered:del,received:rcv,balance:del-rcv,dueMoney:r2(due),paid:r2(paid),owedMoney:r2(due-paid),payPercent:Number(w.payPercent)||60}});
      /* Orders summary */
      const ords=orders.map(o=>{const t=calcOrder(o);const wds=o.workshopDeliveries||[];const totalDel=wds.reduce((s,wd)=>s+(Number(wd.qty)||0),0);const totalRcv=wds.reduce((s,wd)=>(wd.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0)+s,0);const stockDel=getConfirmedStock(o);
        const custDel=(o.customerDeliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);const custRet=(o.customerReturns||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);
        const lastMove=wds.reduce((d,wd)=>{let ld=wd.date||"";(wd.receives||[]).forEach(r=>{if(r.date>ld)ld=r.date});return ld>d?ld:d},"");
        const days=lastMove?Math.floor((Date.now()-new Date(lastMove))/(86400000)):null;
        return{modelNo:o.modelNo,desc:o.modelDesc,status:o.status,cutQty:t.cutQty,deliveredToWs:totalDel,receivedFromWs:totalRcv,wsBalance:totalDel-totalRcv,stockDelivered:stockDel,sold:custDel-custRet,availableInStock:stockDel-(custDel-custRet),sellPrice:Number(o.sellPrice)||0,daysSinceLastMove:days,pieces:o.orderPieces||[],
          wsDetails:wds.map(wd=>{const rcvd=(wd.receives||[]).filter(r=>!r.isSettlement).reduce((s,r)=>s+(Number(r.qty)||0),0);return{ws:wd.wsName,piece:wd.garmentType||"عام",delivered:Number(wd.qty)||0,received:rcvd,balance:(Number(wd.qty)||0)-rcvd,agreed:Number(wd.agreedDays)||0,date:wd.date}}).filter(w=>w.balance>0||w.received>0)}});
      /* V15.63: Customers summary */
      const custs=(config.customers||[]).map(c=>{let totalDel=0,totalRet=0,totalMoney=0;
        orders.forEach(o=>{const price=Number(o.sellPrice)||0;
          (o.customerDeliveries||[]).filter(d=>d.custId===c.id).forEach(d=>{totalDel+=Number(d.qty)||0;totalMoney+=(Number(d.qty)||0)*(Number(d.price)||price)});
          (o.customerReturns||[]).filter(r=>r.custId===c.id).forEach(r=>{totalRet+=Number(r.qty)||0})});
        return{name:c.name,type:c.type||"",discount:Number(c.discount)||0,totalSold:totalDel-totalRet,totalMoney:r2(totalMoney)}}).filter(c=>c.totalSold>0||c.totalMoney>0);
      /* V15.63: Overall summary */
      const totalCut=ords.reduce((s,o)=>s+o.cutQty,0);
      const totalStock=ords.reduce((s,o)=>s+o.stockDelivered,0);
      const totalSold=ords.reduce((s,o)=>s+o.sold,0);
      const totalRevenue=ords.reduce((s,o)=>s+o.sold*o.sellPrice,0);
      const summary={totalCut,totalStock,totalSold,availableInStock:totalStock-totalSold,totalRevenue:r2(totalRevenue),ordersCount:ords.length,workshopsCount:ws.length,customersCount:custs.length};
      const ctx="أنت مساعد ذكي لنظام CLARK لإدارة مصانع الملابس.\n\nقواعد الرد:\n- رد بالمصري العامي (يعني، كده، خلاص، أهو)\n- اختصر اختصار غير مخل — بلاش كلام كتير\n- افصل بين كل أوردر أو معلومة بخط فاصل ─────\n- في الأرصدة المالية للورش: لو owedMoney سالب يبقى الورشة عليها فلوس (دفعنالها أكتر من المستحق)، لو موجب يبقى ليها فلوس عندنا\n- نسبة الدفع payPercent = الحد الأقصى المسموح بدفعه من المستحق (عادي 60%)\n- مصطلحات الورش مهمة جداً: workshopDeliveries.qty = الورشة استلمت منّنا (استلم)، workshopDeliveries.receives[].qty = الورشة سلّمت لنا (سلّم). يعني لما تكتب عن ورشة اكتب: استلم 508، سلّم 495، باقي 13. مش العكس!\n- availableInStock = المتاح في مخزن الجاهز (بعد طرح اللي اتباع)\n- sold = اللي اتباع للعملاء (بعد طرح المرتجعات)\n- في الآخر خالص حط سطر ─────── وبعده 💡 ملاحظتك أو نصيحتك من عندك كمدير انتاج خبرة\n\nبيانات الموسم "+season+":\n\nملخص عام:\n"+JSON.stringify(summary,null,0)+"\n\nالأوردرات ("+ords.length+"):\n"+JSON.stringify(ords,null,0)+"\n\nالورش ("+ws.length+"):\n"+JSON.stringify(ws,null,0)+"\n\nالعملاء ("+custs.length+"):\n"+JSON.stringify(custs,null,0)+"\n\nالتاريخ: "+new Date().toISOString().split("T")[0];
      const msgs=[...aiMsgs.map(m=>({role:m.role==="user"?"user":"assistant",content:m.text})),{role:"user",content:q}];
      let data2;let retries=0;
      while(retries<2){
        const res=await fetch("/api/ai",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({system:ctx,messages:msgs})});
        data2=await res.json();
        if(data2.error&&(data2.error.message||"").toLowerCase().includes("overloaded")&&retries<1){retries++;setAiMsgs(p=>[...p,{role:"ai",text:"⏳ السيرفر مشغول... بعيد المحاولة"}]);await new Promise(r=>setTimeout(r,3000));setAiMsgs(p=>p.filter(m=>m.text!=="⏳ السيرفر مشغول... بعيد المحاولة"));continue}
        break}
      if(data2.error){setAiMsgs(p=>[...p,{role:"ai",text:"⚠️ "+(data2.error.message||data2.error||"خطأ غير معروف")}]);setAiLoading(false);return}
      const reply=data2.content?.map(c=>c.text||"").join("\n")||"عذراً، لم أتمكن من الرد";
      setAiMsgs(p=>[...p,{role:"ai",text:reply}])
    }catch(e){console.error("AI error:",e);setAiMsgs(p=>[...p,{role:"ai",text:"⚠️ خطأ في الاتصال بالمساعد الذكي"}])}
    setAiLoading(false)};
  useEffect(()=>{const h=e=>{if(e.key==="Escape"){setQuickPopup(null);setShowAlerts(false);setShowScanner(false);setStickyForm(null);setShowTheme(false);setShowNotifs(false);setAiOpen(false)}};window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h)},[]);
  const[statusNotif,setStatusNotif]=useState(null);const prevStatuses=useRef({});
  /* Online/Offline status */
  const[isOnline,setIsOnline]=useState(navigator.onLine);const[justReconnected,setJustReconnected]=useState(false);
  useEffect(()=>{
    const checkReal=async()=>{try{const r=await fetch("https://firestore.googleapis.com",{method:"HEAD",mode:"no-cors",cache:"no-store"});setIsOnline(p=>{if(!p)setJustReconnected(true);return true})}catch(e){setIsOnline(false);setJustReconnected(false)}};
    const on=()=>checkReal();const off=()=>{setIsOnline(false);setJustReconnected(false)};
    window.addEventListener("online",on);window.addEventListener("offline",off);
    const interval=setInterval(checkReal,15000);checkReal();
    return()=>{window.removeEventListener("online",on);window.removeEventListener("offline",off);clearInterval(interval)}
  },[]);
  useEffect(()=>{if(justReconnected){const t=setTimeout(()=>setJustReconnected(false),4000);return()=>clearTimeout(t)}},[justReconnected]);
  /* V15.63: Bot tasks permanently disabled — user requested removal.
     V15.76: Dead ref removed — was never read anywhere. */
  const themeKey="clark-theme-"+(user?.uid||"default");
  const[theme,setTheme_]=useState(()=>{try{return localStorage.getItem("clark-theme-default")||"light"}catch(e){return"light"}});
  /* V15.3: themeTick forces re-render of all components when T/TH/TD/TDB/TDL mutate.
     Without this, components read stale theme values because T is module-level (not React state). */
  const[themeTick,setThemeTick]=useState(0);
  const setTheme=v=>{setTheme_(v);try{localStorage.setItem(themeKey,v)}catch(e){}setActiveTheme(v);setThemeTick(n=>n+1)};
  useEffect(()=>{try{const saved=localStorage.getItem(themeKey);if(saved&&saved!==theme)setTheme_(saved)}catch(e){}},[themeKey]);
  /* V15.76: Run setActiveTheme only when theme actually changes, not every render.
     useRef lets us call synchronously before children render (so T is correct on first paint),
     while skipping the expensive rebuild when theme is unchanged.
     Previously this ran on EVERY render — ~20x/second during typing. */
  const _appliedTheme=useRef(null);
  if(_appliedTheme.current!==theme){setActiveTheme(theme);_appliedTheme.current=theme}
  useEffect(()=>{try{localStorage.setItem(themeKey,theme)}catch(e){}document.body.style.background=T.bodyBg||T.bg},[theme,themeKey]);
  const w=useWin();const isMob=w<768;const isTab=w>=768&&w<1100;const season=config.activeSeason||"WS26";

  useEffect(()=>{const unsub=onAuthStateChanged(auth,u=>{setUser(u);setAuthLoading(false)});return unsub},[]);
  useEffect(()=>{if(!user)return;
    let salesReady=false;let tasksReady=false;
    /* ═══════════════════════════════════════════════════════════════════
       🛡️ MIGRATION SAFETY FRAMEWORK
       
       Problem (V10 and earlier): Firestore offline persistence caches the
       config doc locally. When a device that was offline for days reconnects,
       onSnapshot fires FIRST with cached (stale) data, THEN with server data.
       Migrations that ran on the cached data would blindly setDoc() to
       Firestore — OVERWRITING newer data that existed on the server.
       
       Fix: Three layers of protection:
       
       1. Show cached data to user immediately (good UX), BUT only run
          migrations when snap.metadata.fromCache === false — i.e. we are
          confirmed to be reading from the live server.
       
       2. Before any migration writes, create a backup in Firestore:
          backups/pre-migration-{type}-{timestamp}
       
       3. Every migration uses runTransaction() — the transaction re-reads
          the config from the server inside the transaction, applies the
          migration to THAT fresh data, and writes it back atomically.
          This guarantees we never overwrite a newer version.
       ═══════════════════════════════════════════════════════════════════ */

    /* Helper: save a backup of the current config BEFORE running a migration */
    const saveBackupBeforeMigration=async(migrationType,configData)=>{
      try{
        const ts=new Date().toISOString().replace(/[:.]/g,"-");
        const backupId="pre-migration-"+migrationType+"-"+ts;
        await setDoc(doc(db,"backups",backupId),{
          label:"قبل ميجريشن: "+migrationType,
          autoGenerated:true,
          migrationType,
          createdAt:new Date().toISOString(),
          createdBy:user.email||"system",
          config:configData||{},
          counts:{
            treasury:(configData?.treasury||[]).length,
            employees:(configData?.employees||[]).length,
            customers:(configData?.customers||[]).length,
            wsPayments:(configData?.wsPayments||[]).length
          }
        });
        return backupId;
      }catch(e){
        console.error("❌ Pre-migration backup FAILED:",e);
        /* Critical: if we can't back up, we should NOT run the migration */
        throw e;
      }
    };

    /* Helper: log migration events to Firestore for audit trail */
    const logMigration=async(migrationType,status,details)=>{
      try{
        await setDoc(doc(db,"migrationLog",migrationType+"-"+Date.now()),{
          type:migrationType,status,details:details||"",
          by:user.email||"system",at:new Date().toISOString()
        });
      }catch(e){console.warn("Migration log failed:",e)}
    };

    /* Helper: run a migration safely using a Firestore transaction.
       - Reads config from SERVER inside transaction (not from cache)
       - Calls shouldRun(server_data) to verify migration is still needed
       - Calls applyFn(server_data) to apply the change (mutates server_data)
       - Writes back atomically */
    const runMigration=async(migrationType,d,shouldRun,applyFn)=>{
      if(!shouldRun(d))return;/* Quick pre-check on cached data — skip if obviously done */
      try{
        /* Step 1: backup the current (cached) snapshot before touching anything */
        await saveBackupBeforeMigration(migrationType,d);
        /* Step 2: run inside transaction — re-reads from server to avoid stale writes */
        let didRun=false;let details="";
        await runTransaction(db,async(tx)=>{
          const ref=doc(db,"factory","config");
          const snap=await tx.get(ref);
          if(!snap.exists())return;
          const fresh=snap.data();
          /* Re-check on fresh server data — maybe another device already did it */
          if(!shouldRun(fresh)){return}
          const result=applyFn(fresh);/* mutates fresh, may return details string */
          if(typeof result==="string")details=result;
          tx.set(ref,fresh);
          didRun=true;
        });
        if(didRun){
          await logMigration(migrationType,"success",details);
        }
      }catch(e){
        console.error("❌ Migration "+migrationType+" FAILED:",e);
        await logMigration(migrationType,"failed",e.message||String(e));
      }
    };

    /* Main config listener */
    const u1=onSnapshot(doc(db,"factory","config"),snap=>{
      if(!snap.exists()){setDoc(doc(db,"factory","config"),INIT_CONFIG);return}
      const d=snap.data();
      /* ALWAYS show the data to the user (even if cached — that's fine for display) */
      setConfigDoc(d);
      /* ⛔ Skip ALL migrations if data is from local cache or has pending writes.
         Wait for the first confirmed server snapshot before running any migration. */
      if(snap.metadata.fromCache){return}
      if(snap.metadata.hasPendingWrites)return;

      /* ═══ Migration 1: swap MAIN CASH ↔ SUB CASH names ═══ */
      runMigration("cash-swap",d,
        (data)=>!data._cashSwapDone,
        (data)=>{
          const TEMP="__SWAP_TMP__";
          const swap=(name)=>name==="MAIN CASH"?"SUB CASH":name==="SUB CASH"?"MAIN CASH":name;
          let changed=false;
          if(Array.isArray(data.treasuryAccounts)){
            data.treasuryAccounts=data.treasuryAccounts.map(a=>{
              if(typeof a==="string"){const ns=swap(a);if(ns!==a)changed=true;return ns}
              const obj={...a};const nn=swap(obj.name);if(nn!==obj.name){obj.name=nn;obj.id=nn;changed=true}return obj});
          }
          if(Array.isArray(data.treasury))data.treasury=data.treasury.map(t=>{const na=swap(t.account);if(na!==t.account){changed=true;return{...t,account:na}}return t});
          if(Array.isArray(data.treasuryTransfers))data.treasuryTransfers=data.treasuryTransfers.map(tf=>{const nf=swap(tf.fromAccount);const nt=swap(tf.toAccount);if(nf!==tf.fromAccount||nt!==tf.toAccount){changed=true;return{...tf,fromAccount:nf,toAccount:nt}}return tf});
          if(Array.isArray(data.treasury))data.treasury=data.treasury.map(t=>{if(t.desc&&(t.desc.includes("MAIN CASH")||t.desc.includes("SUB CASH"))){return{...t,desc:t.desc.replace(/MAIN CASH/g,TEMP).replace(/SUB CASH/g,"MAIN CASH").replace(new RegExp(TEMP,"g"),"SUB CASH")}}return t});
          data._cashSwapDone=true;
          return"changed="+changed;
        }
      );

      /* ═══ Migration 2: fix incomplete transfers ═══ */
      runMigration("transfers-repair",d,
        (data)=>!data._transfersRepaired&&Array.isArray(data.treasuryTransfers),
        (data)=>{
          let repaired=false;
          (data.treasuryTransfers||[]).forEach(tf=>{
            if(tf.status==="cancelled")return;
            const entries=(data.treasury||[]).filter(t=>t.transferId===tf.id);
            const hasOut=entries.some(t=>t.type==="out");
            const hasIn=entries.some(t=>t.type==="in");
            const dayN=["أحد","اثنين","ثلاثاء","أربعاء","خميس","جمعة","سبت"][new Date(tf.date||new Date()).getDay()];
            if(!hasOut&&tf.fromAccount){data.treasury=data.treasury||[];data.treasury.unshift({id:Math.random().toString(36).slice(2)+Date.now(),type:"out",amount:tf.amount,desc:"تحويل إلى "+tf.toAccount+(tf.note?" — "+tf.note:""),notes:"",category:"تحويل داخلي",account:tf.fromAccount,season:data.activeSeason||"",date:tf.date||new Date().toISOString().split("T")[0],day:dayN,transferId:tf.id,by:tf.sentBy||"",createdAt:new Date().toISOString()});repaired=true}
            if(!hasIn&&tf.toAccount){data.treasury=data.treasury||[];data.treasury.unshift({id:Math.random().toString(36).slice(2)+Date.now(),type:"in",amount:tf.amount,desc:"تحويل من "+tf.fromAccount+(tf.note?" — "+tf.note:""),notes:"",category:"تحويل داخلي",account:tf.toAccount,season:data.activeSeason||"",date:tf.date||new Date().toISOString().split("T")[0],day:dayN,transferId:tf.id,by:tf.sentBy||"",createdAt:new Date().toISOString()});repaired=true}
            if(tf.status!=="confirmed"){tf.status="confirmed";repaired=true}
          });
          data._transfersRepaired=true;
          return"repaired="+repaired;
        }
      );

      /* ═══ Migration 3: link ws payments with treasury entries ═══ */
      runMigration("ws-payment-linking",d,
        (data)=>!data._wsPayLinked&&Array.isArray(data.wsPayments)&&Array.isArray(data.treasury),
        (data)=>{
          let linked=0;
          data.wsPayments.forEach(p=>{
            if(p.treasuryTxId)return;
            const candidate=(data.treasury||[]).find(t=>
              !t.wsPaymentId&&t.type==="out"&&Number(t.amount)===Number(p.amount)&&t.date===p.date&&t.desc&&t.desc.includes(p.wsName)&&(t.category==="تشغيل خارجي"||t.category==="مشتريات"));
            if(candidate){p.treasuryTxId=candidate.id;candidate.wsPaymentId=p.id;candidate.wsName=p.wsName;candidate.sourceType="ws_payment";linked++}
          });
          data._wsPayLinked=true;
          return"linked="+linked;
        }
      );

      /* ═══ Migration 4: rename legacy status cards ═══ */
      runMigration("status-rename",d,
        (data)=>!data._statusRenameDone&&Array.isArray(data.statusCards),
        (data)=>{
          let renamed=false;
          data.statusCards=data.statusCards.map(c=>{
            if(!c||!c.name)return c;
            if(c.name==="تم الشحن"||c.name==="تم التسليم"){renamed=true;return{...c,name:"تم التسليم لمخزن الجاهز"}}
            if(c.name==="شحن جزئي"){renamed=true;return{...c,name:"في مخزن الجاهز جزئي"}}
            return c;
          });
          const seen=new Set();
          data.statusCards=data.statusCards.filter(c=>{if(!c||!c.name)return false;if(seen.has(c.name))return false;seen.add(c.name);return true});
          data._statusRenameDone=true;
          return"renamed="+renamed;
        }
      );

      /* ═══ Migration: V15.17 — normalize all phone numbers to +2 prefix ═══ */
      runMigration("phone-normalize-v15-17",d,
        (data)=>!data._phoneNormalizedV1517,
        (data)=>{
          const norm=(p)=>{const s=(p||"").toString().trim();if(!s)return"";if(s.startsWith("+"))return s;const dd=s.replace(/\D/g,"");if(!dd)return"";if(dd.startsWith("2")&&dd.length>=12)return"+"+dd;return"+2"+dd};
          let count=0;
          /* Employees */
          (data.employees||[]).forEach(e=>{const old=e.phone||"";const n=norm(old);if(n!==old){e.phone=n;count++}});
          /* Customers */
          (data.customers||[]).forEach(c=>{const old=c.phone||"";const n=norm(old);if(n!==old){c.phone=n;count++}});
          /* Suppliers */
          (data.suppliers||[]).forEach(s=>{const old=s.phone||"";const n=norm(old);if(n!==old){s.phone=n;count++}});
          /* Workshops */
          (data.workshops||[]).forEach(w=>{const old=w.phone||"";const n=norm(old);if(n!==old){w.phone=n;count++}});
          /* Users (if they have phone) */
          (data.usersList||[]).forEach(u=>{if(u.phone){const old=u.phone;const n=norm(old);if(n!==old){u.phone=n;count++}}});
          data._phoneNormalizedV1517=true;
          return"normalized="+count+" phone numbers";
        }
      );

      /* ═══ Migration 5: Phase 1 — copy data to separate docs ═══
         Note: this migration writes to sales/tasks docs (not config) before
         setting _splitDone. We handle it differently from the others. */
      if(!d._splitDone&&(d.custDeliverySessions||d.packages||d.tasks||d.stickyNotes||d.inventoryAudits)){
        (async()=>{
          try{
            await saveBackupBeforeMigration("split-phase-1",d);
            await runTransaction(db,async(tx)=>{
              const ref=doc(db,"factory","config");
              const snap=await tx.get(ref);
              if(!snap.exists())return;
              const fresh=snap.data();
              if(fresh._splitDone)return;
              const salesData={custDeliverySessions:fresh.custDeliverySessions||[],packages:fresh.packages||[]};
              const tasksData={tasks:fresh.tasks||[],stickyNotes:fresh.stickyNotes||[],inventoryAudits:fresh.inventoryAudits||[]};
              tx.set(doc(db,"factory","sales"),salesData);
              tx.set(doc(db,"factory","tasks"),tasksData);
              tx.set(ref,{...fresh,_splitDone:true});
            });
            await logMigration("split-phase-1","success","");
          }catch(e){console.error("❌ split-phase-1 FAILED:",e);await logMigration("split-phase-1","failed",e.message||String(e))}
        })();
      }

      /* ═══ Migration 6: Phase 2 — clean config after split is verified ═══ */
      if(d._splitDone&&d.custDeliverySessions&&salesReady&&tasksReady){
        runMigration("split-phase-2",d,
          (data)=>data._splitDone&&data.custDeliverySessions!==undefined,
          (data)=>{
            delete data.custDeliverySessions;delete data.packages;
            delete data.tasks;delete data.stickyNotes;delete data.inventoryAudits;
            return"cleaned";
          }
        );
      }
    });

    /* Sales doc */
    const u2=onSnapshot(doc(db,"factory","sales"),snap=>{if(snap.exists()){if(snap.metadata.hasPendingWrites)return;salesReady=true;setSalesDoc(snap.data())}});
    /* Tasks doc */
    const u3=onSnapshot(doc(db,"factory","tasks"),snap=>{if(snap.exists()){if(snap.metadata.hasPendingWrites)return;tasksReady=true;setTasksDoc(snap.data())}});
    return()=>{u1();u2();u3()}},[user]);

  /* ── LOCAL SNAPSHOT: save critical collections to localStorage on every config update ── */
  useEffect(()=>{if(!configDoc||!configDoc.accessories)return;
    try{const snap={workshops:configDoc.workshops||[],customers:configDoc.customers||[],suppliers:configDoc.suppliers||[],fabrics:configDoc.fabrics||[],accessories:configDoc.accessories||[],sizeSets:configDoc.sizeSets||[],garmentTypes:configDoc.garmentTypes||[],statusCards:configDoc.statusCards||[],employees:configDoc.employees||[],treasuryAccounts:configDoc.treasuryAccounts||[],savedAt:new Date().toISOString()};
      localStorage.setItem("clark-data-snapshot",JSON.stringify(snap))}catch(e){}},[configDoc]);
  useEffect(()=>{if(!user||!season)return;setDataLoading(true);const unsub=onSnapshot(collection(db,"seasons",season,"orders"),snap=>{setOrders(snap.docs.map(d=>{const o={_docId:d.id,...d.data()};if(o.status)o.status=migrateStatus(o.status);return o}).filter(o=>o.id));setDataLoading(false)});return()=>unsub()},[user,season]);

  /* ═══ AUTO-BACKUP: once per day per user ═══ */
  useEffect(()=>{
    if(!user||!configDoc||!configDoc.accessories)return;/* wait for data load */
    const today=new Date().toISOString().split("T")[0];
    const lastBackupKey="clark-last-backup-"+user.uid;
    let lastBackup=null;try{lastBackup=localStorage.getItem(lastBackupKey)}catch(e){}
    if(lastBackup===today)return;/* already backed up today on this device */
    /* Schedule backup after 30s to avoid doing it on every page load race */
    const timer=setTimeout(async()=>{
      try{
        const backupId="auto-"+today+"-"+(user.email||"").split("@")[0];
        /* Check if this daily backup already exists (another device may have done it) */
        const existing=await getDoc(doc(db,"backups",backupId));
        if(existing.exists()){try{localStorage.setItem(lastBackupKey,today)}catch(e){}return}
        /* Create backup */
        const data={
          label:"تلقائية (يومية)",
          autoGenerated:true,
          createdAt:new Date().toISOString(),
          createdBy:user.email||"",
          config:configDoc||{},
          sales:salesDoc||{},
          tasks:tasksDoc||{},
          orders:orders||[],
          counts:{
            treasury:(configDoc?.treasury||[]).length,
            employees:(configDoc?.employees||[]).length,
            customers:(configDoc?.customers||[]).length,
            orders:(orders||[]).length
          }
        };
        await setDoc(doc(db,"backups",backupId),data);
        try{localStorage.setItem(lastBackupKey,today)}catch(e){}
        /* Cleanup old auto-backups: keep last 14 auto backups */
        try{
          const snap=await getDocs(collection(db,"backups"));
          const autos=[];snap.forEach(d=>{const x=d.data();if(x.autoGenerated)autos.push({id:d.id,createdAt:x.createdAt})});
          autos.sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""));
          const toDelete=autos.slice(14);
          for(const a of toDelete){await deleteDoc(doc(db,"backups",a.id))}
          if(toDelete.length>0){}}catch(e){console.warn("Cleanup failed:",e)}
      }catch(e){console.error("Auto-backup failed:",e)}
    },30000);
    return()=>clearTimeout(timer);
  },[user,configDoc?.accessories]);/* trigger when data first loads */

  /* ═══ TRANSACTION-SAFE WRITES ═══
     V15.69: Smarter retry — transaction conflicts are expected during concurrent
     writes (e.g. admin + payroll editing simultaneously). We retry silently up to
     5 times with exponential backoff before showing any error. Only persistent
     failures (network down, permissions) surface to the user.
     Each write re-reads the doc inside a transaction, applies the change,
     and writes back atomically. */
  const _sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  const upConfigTx=useCallback(async(fn)=>{
    const ref=doc(db,"factory","config");
    let lastErr=null;
    /* V15.69: Up to 5 retries with exponential backoff (100ms, 200ms, 400ms, 800ms, 1600ms) */
    for(let attempt=0;attempt<5;attempt++){
      try{
        await runTransaction(db,async(tx)=>{
          const snap=await tx.get(ref);
          const current=snap.exists()?snap.data():{};
          const next=JSON.parse(JSON.stringify(current));
          fn(next);
          enforceDataLimits(next);
          tx.set(ref,next);
        });
        return;/* success */
      }catch(e){
        lastErr=e;
        /* Retry on transient errors (conflicts, aborts) */
        const code=e?.code||"";
        const retriable=code==="aborted"||code==="already-exists"||code==="deadline-exceeded"||code==="unavailable"||code==="internal"||!code;
        if(!retriable||attempt===4)break;
        await _sleep(100*Math.pow(2,attempt));
      }
    }
    /* All retries exhausted — fallback to merge write and only then warn */
    console.error("upConfig tx error after retries:",lastErr);
    try{
      setConfigDoc(prev=>{try{const next=JSON.parse(JSON.stringify(prev));fn(next);enforceDataLimits(next);setDoc(ref,next,{merge:true}).catch(er=>console.error("Fallback error:",er));return next}catch(err){return prev}});
    }catch(fallbackErr){
      console.error("Fallback failed:",fallbackErr);
      showToast("⚠️ تعذر الحفظ — تأكد من الاتصال بالإنترنت");
    }
  },[]);
  const upConfig=useCallback(fn=>{
    /* Optimistic update local state first, then commit via transaction */
    setConfigDoc(prev=>{try{const next=JSON.parse(JSON.stringify(prev));fn(next);enforceDataLimits(next);return next}catch(e){return prev}});
    upConfigTx(fn);
  },[upConfigTx]);

  const upSalesTx=useCallback(async(fn)=>{
    const ref=doc(db,"factory","sales");
    let lastErr=null;
    for(let attempt=0;attempt<5;attempt++){
      try{
        await runTransaction(db,async(tx)=>{
          const snap=await tx.get(ref);
          const current=snap.exists()?snap.data():{};
          const next=JSON.parse(JSON.stringify(current));
          fn(next);
          tx.set(ref,next);
        });
        return;
      }catch(e){
        lastErr=e;
        const code=e?.code||"";
        const retriable=code==="aborted"||code==="already-exists"||code==="deadline-exceeded"||code==="unavailable"||code==="internal"||!code;
        if(!retriable||attempt===4)break;
        await _sleep(100*Math.pow(2,attempt));
      }
    }
    console.error("upSales tx error after retries:",lastErr);
    try{
      setSalesDoc(prev=>{try{const next=JSON.parse(JSON.stringify(prev));fn(next);setDoc(ref,next,{merge:true}).catch(er=>console.error("Fallback error:",er));return next}catch(err){return prev}});
    }catch(fallbackErr){
      console.error("Fallback failed:",fallbackErr);
      showToast("⚠️ تعذر الحفظ — تأكد من الاتصال بالإنترنت");
    }
  },[]);
  const upSales=useCallback(fn=>{
    setSalesDoc(prev=>{try{const next=JSON.parse(JSON.stringify(prev));fn(next);return next}catch(e){return prev}});
    upSalesTx(fn);
  },[upSalesTx]);

  const upTasksTx=useCallback(async(fn)=>{
    const ref=doc(db,"factory","tasks");
    let lastErr=null;
    for(let attempt=0;attempt<5;attempt++){
      try{
        await runTransaction(db,async(tx)=>{
          const snap=await tx.get(ref);
          const current=snap.exists()?snap.data():{};
          const next=JSON.parse(JSON.stringify(current));
          fn(next);
          tx.set(ref,next);
        });
        return;
      }catch(e){
        lastErr=e;
        const code=e?.code||"";
        const retriable=code==="aborted"||code==="already-exists"||code==="deadline-exceeded"||code==="unavailable"||code==="internal"||!code;
        if(!retriable||attempt===4)break;
        await _sleep(100*Math.pow(2,attempt));
      }
    }
    console.error("upTasks tx error after retries:",lastErr);
    try{
      setTasksDoc(prev=>{try{const next=JSON.parse(JSON.stringify(prev));fn(next);setDoc(ref,next,{merge:true}).catch(er=>console.error("Fallback error:",er));return next}catch(err){return prev}});
    }catch(fallbackErr){
      console.error("Fallback failed:",fallbackErr);
      showToast("⚠️ تعذر الحفظ — تأكد من الاتصال بالإنترنت");
    }
  },[]);
  const upTasks=useCallback(fn=>{
    setTasksDoc(prev=>{try{const next=JSON.parse(JSON.stringify(prev));fn(next);return next}catch(e){return prev}});
    upTasksTx(fn);
  },[upTasksTx]);
  const addOrder=async o=>{
    o.createdBy=userName;
    /* Stock check if enabled */
    const check=checkStockAvailability(o,{...configDoc,fabrics:configDoc.fabrics,accessories:configDoc.accessories,purchaseSettings:configDoc.purchaseSettings});
    if(!check.ok){
      let msg="⛔ لا يمكن إنشاء الأوردر — المخزن غير كافي:\n\n";
      check.shortages.forEach(s=>{msg+="• "+s.itemName+" ("+(s.itemType==="fabric"?"خامة":"إكسسوار")+")\n  المطلوب: "+s.needed+" "+s.unit+" | المتاح: "+s.available+" "+s.unit+" | ناقص: "+s.shortage+" "+s.unit+"\n\n"});
      await tell("المخزن غير كافي",msg,{type:"error"});
      return;
    }
    /* Save and deduct in one transaction via upConfig? No — orders are separate docs.
       Strategy: add order first, then update configDoc to deduct. */
    await addDoc(collection(db,"seasons",season,"orders"),o);
    /* Deduct stock via upConfig (will trigger re-render after order load) */
    await upConfig(d=>{deductStockForOrder(d,o,userName)});
  };
  const updOrder=async(orderId,fn)=>{try{const ord=orders.find(o=>o.id===orderId);if(!ord)return;const updated=JSON.parse(JSON.stringify(ord));fn(updated);const clean={...updated};delete clean._docId;await updateDoc(doc(db,"seasons",season,"orders",ord._docId),clean)}catch(e){console.error("updOrder error:",e);showToast("⚠️ خطأ في حفظ الأوردر")}};
  const delOrder=async orderId=>{
    const ord=orders.find(o=>o.id===orderId);
    if(!ord)return;
    /* V15.9: Return stock if was deducted */
    if(ord._stockDeducted){
      await upConfig(d=>{
        const empty={...ord,_stockDeducted:{fabrics:{},accessories:{}}};
        /* Temporarily pass an order with no needs — deductStockForOrder will return all to stock */
        const returnOrder={...empty,cutQty:0,accItems:[],colorsA:[],colorsB:[],colorsC:[],colorsD:[]};
        deductStockForOrder(d,returnOrder,userName);
      });
    }
    /* V15.9: Clean up references in sales doc (custDeliverySessions + packages) */
    await upSales(d=>{
      /* Remove this order from any delivery session's grid/modelIds */
      if(Array.isArray(d.custDeliverySessions)){
        d.custDeliverySessions.forEach(s=>{
          if(Array.isArray(s.modelIds))s.modelIds=s.modelIds.filter(id=>id!==orderId);
          if(s.grid){Object.keys(s.grid).forEach(k=>{if(k.startsWith(orderId+"_"))delete s.grid[k]})}
        });
        /* Remove empty sessions (no models left) */
        d.custDeliverySessions=d.custDeliverySessions.filter(s=>!Array.isArray(s.modelIds)||s.modelIds.length>0);
      }
      /* Remove items from packages that reference this order */
      if(Array.isArray(d.packages)){
        d.packages.forEach(p=>{if(Array.isArray(p.items))p.items=p.items.filter(it=>it.orderId!==orderId)});
        /* Keep empty packages — they might have movement history */
      }
    });
    /* V15.9: Clean up qrSales / sales audits that reference this order */
    await upConfig(d=>{
      if(Array.isArray(d.qrSales))d.qrSales=d.qrSales.filter(s=>s.orderId!==orderId);
      if(Array.isArray(d.salesAudits)){
        d.salesAudits.forEach(a=>{if(a.grid){Object.keys(a.grid).forEach(k=>{if(k.startsWith(orderId+"_"))delete a.grid[k]})}});
      }
    });
    await deleteDoc(doc(db,"seasons",season,"orders",ord._docId));
  };
  const replaceOrder=async(orderId,newData)=>{
    const ord=orders.find(o=>o.id===orderId);if(!ord||!ord._docId)return;
    /* Safety: verify data is a valid order object */
    if(!newData||typeof newData!=="object"||!newData.id||!newData.modelNo){console.error("replaceOrder: invalid data",newData);showToast("⚠️ خطأ — البيانات غير صالحة");return}
    /* Preserve _stockDeducted snapshot from existing order */
    if(ord._stockDeducted&&!newData._stockDeducted)newData._stockDeducted=ord._stockDeducted;
    /* Stock check (delta-aware) */
    const check=checkStockAvailability(newData,{...configDoc,fabrics:configDoc.fabrics,accessories:configDoc.accessories,purchaseSettings:configDoc.purchaseSettings});
    if(!check.ok){
      let msg="⛔ لا يمكن حفظ التعديل — المخزن غير كافي للزيادة المطلوبة:\n\n";
      check.shortages.forEach(s=>{msg+="• "+s.itemName+" ("+(s.itemType==="fabric"?"خامة":"إكسسوار")+")\n  النقص: "+s.shortage+" "+s.unit+"\n\n"});
      await tell("المخزن غير كافي",msg,{type:"error"});
      return;
    }
    const clean={...newData};delete clean._docId;
    try{
      await setDoc(doc(db,"seasons",season,"orders",ord._docId),clean);
      /* Apply stock delta */
      await upConfig(d=>{deductStockForOrder(d,clean,userName)});
    }
    catch(e){console.error("replaceOrder error:",e);showToast("⚠️ خطأ في الحفظ")}
  };
  /* Cascade rename in all orders - matches by ID (new data) or name (old data) */
  const renameInOrders=async(type,oldName,newName,entityId)=>{if(oldName===newName||!oldName||!newName)return;
    for(const o of orders){let changed=false;const upd=JSON.parse(JSON.stringify(o));
      if(type==="ws"){(upd.workshopDeliveries||[]).forEach(wd=>{if((entityId&&wd.wsId===entityId)||wd.wsName===oldName){wd.wsName=newName;if(entityId)wd.wsId=entityId;changed=true}})}
      if(type==="garment"){(upd.workshopDeliveries||[]).forEach(wd=>{if(wd.garmentType===oldName){wd.garmentType=newName;changed=true};(wd.receives||[]).forEach(r=>{if(r.garmentType===oldName){r.garmentType=newName;changed=true}})});if(upd.orderPieces){upd.orderPieces=upd.orderPieces.map(p=>p===oldName?(changed=true,newName):p)};FKEYS.forEach(k=>{if(upd["fabricPieces"+k]){upd["fabricPieces"+k]=upd["fabricPieces"+k].map(p=>p===oldName?(changed=true,newName):p)}})}
      if(type==="status"&&upd.status===oldName){upd.status=newName;changed=true}
      /* V15.32: Sync sizeLabel when a sizeSet's label is edited.
         Matches by sizeSetId (entityId) — the sizeLabel stored on each order is a snapshot of the sizeSet's label at creation time. */
      if(type==="size"&&entityId&&Number(upd.sizeSetId)===Number(entityId)){
        if(upd.sizeLabel!==newName){upd.sizeLabel=newName;changed=true}
      }
      if(changed)await replaceOrder(o.id,upd);
    }
    if(type==="ws")showToast("✓ تم تحديث "+orders.filter(o=>(o.workshopDeliveries||[]).some(wd=>wd.wsName===oldName||(entityId&&wd.wsId===entityId))).length+" أوردر");
    if(type==="size"&&entityId){
      const cnt=orders.filter(o=>Number(o.sizeSetId)===Number(entityId)).length;
      showToast("✓ تم تحديث مقاسات "+cnt+" أوردر");
    }
  };
  /* Sync all existing data with workshop IDs. nameMap: {oldName: wsId} for orphan linking */
  const syncWsIds=async(nameMap)=>{
    const wsList=config.workshops||[];
    const nm=nameMap||{};
    let ordCount=0;
    for(const o of orders){let changed=false;const upd=JSON.parse(JSON.stringify(o));
      (upd.workshopDeliveries||[]).forEach(wd=>{
        /* Match by: wsId → name → nameMap (orphan) */
        let ws=null;
        if(wd.wsId)ws=wsList.find(w=>w.id===wd.wsId);
        if(!ws)ws=wsList.find(w=>w.name===wd.wsName);
        if(!ws&&nm[wd.wsName])ws=wsList.find(w=>w.id===Number(nm[wd.wsName]));
        if(ws){if(wd.wsId!==ws.id){wd.wsId=ws.id;changed=true}if(wd.wsName!==ws.name){wd.wsName=ws.name;changed=true}}
      });
      if(changed){await replaceOrder(o.id,upd);ordCount++}
    }
    let payChanged=false;
    upConfig(d=>{
      (d.wsPayments||[]).forEach(p=>{
        let ws=null;
        if(p.wsId)ws=wsList.find(w=>w.id===p.wsId);
        if(!ws)ws=wsList.find(w=>w.name===p.wsName);
        if(!ws&&nm[p.wsName])ws=wsList.find(w=>w.id===Number(nm[p.wsName]));
        if(ws){if(p.wsId!==ws.id){p.wsId=ws.id;payChanged=true}if(p.wsName!==ws.name){p.wsName=ws.name;payChanged=true}}
      });
    });
    showToast("✓ تم مزامنة "+ordCount+" أوردر"+(payChanged?" + المدفوعات":""));
  };
  const goD=id=>{setSel(id);setTab("details")};
  useEffect(()=>{const h=()=>{const d=window.__labelData;if(d){setLabelPopup(d);setLabelBags(1);delete window.__labelData}};window.addEventListener("show-label-popup",h);return()=>window.removeEventListener("show-label-popup",h)},[]);
  /* QR scan auto-navigate */
  const qrDone=useRef(false);
  useEffect(()=>{if(qrDone.current||orders.length===0)return;
    if(qrModelNo){const o=orders.find(x=>x.modelNo===qrModelNo);if(o){qrDone.current=true;goD(o.id);window.history.replaceState({},"",window.location.pathname)}}
    if(qrAction==="rcv"&&qrOid){const o=orders.find(x=>x.id===qrOid);if(o){qrDone.current=true;setTab("external");window.history.replaceState({},"",window.location.pathname);setTimeout(()=>{window.__qrReceive={oid:qrOid,wdi:Number(qrWdi)||0};window.dispatchEvent(new Event("qr-receive"))},600)}}
    if(qrAction==="wsacc"&&qrWs){qrDone.current=true;setTab("external");window.history.replaceState({},"",window.location.pathname);setTimeout(()=>{window.__qrWsAcc={ws:decodeURIComponent(qrWs)};window.dispatchEvent(new Event("qr-wsacc"))},600)}
    if(qrAction==="stock"&&qrOid){const o=orders.find(x=>x.id===qrOid);if(o){qrDone.current=true;goD(o.id);window.history.replaceState({},"",window.location.pathname);setTimeout(()=>{window.__qrStock=true;window.dispatchEvent(new Event("qr-stock"))},800)}}
  },[orders,qrModelNo,qrAction]);

  /* Auto-resolve wsName from wsId */
  const resolvedOrders=useMemo(()=>{
    try{
      const wsList=config.workshops||[];
      return orders.map(o=>{
        let changed=false;
        const wds=(o.workshopDeliveries||[]).map(wd=>{
          if(wd.wsId){const ws=wsList.find(w=>w.id===wd.wsId);if(ws&&ws.name!==wd.wsName){changed=true;return{...wd,wsName:ws.name}}}
          return wd;
        });
        return changed?{...o,workshopDeliveries:wds}:o;
      });
    }catch(e){console.error("resolvedOrders error:",e);return orders}
  },[orders,config.workshops]);
  /* V15.76: Memoize `data` — was creating a new object on every render,
     triggering cascading re-renders in all child pages that receive it as prop. */
  const data=useMemo(()=>({...config,orders:resolvedOrders||orders}),[config,resolvedOrders,orders]);
  const getUserRole=()=>{if(config.users&&config.users[user?.uid]){const r=config.users[user.uid];return typeof r==="string"?r:r?.role||"admin"}const byEmail=(config.usersList||[]).find(u=>u.email===user?.email);if(byEmail)return byEmail.role;return"admin"};
  const userRole=getUserRole();const canEdit=userRole==="admin"||userRole==="manager";
  /* V15.28: HR permissions upgraded to granular sub-tab permissions.
     - hr now contains 4 sub-keys: weeks (salary table), verify (QR scan screen),
       employees (employee management), security (audit log).
     - Backward compat: if hr is still a string (old config), it applies to all sub-tabs.
     - Two new roles for separation of duties:
       • payroll_accountant: edits salary, NO verify access (preparer)
       • payroll_verifier: views salary (readonly), ONLY edits verify (reviewer) */
  const DEFAULT_PERMS={
    admin:{dashboard:"edit",details:"edit",external:"edit",stock:"edit",reports:"edit",calc:"edit",tasks:"edit",db:"edit",settings:"edit",custDeliver:"edit",treasury:"edit",hr:{weeks:"edit",verify:"edit",employees:"edit",security:"edit"},purchase:"edit",warehouse:"edit",audit:"view"},
    manager:{dashboard:"edit",details:"edit",external:"edit",stock:"edit",reports:"edit",calc:"edit",tasks:"edit",db:"edit",settings:"hide",custDeliver:"edit",treasury:"view",hr:{weeks:"view",verify:"view",employees:"view",security:"view"},purchase:"edit",warehouse:"edit",audit:"view"},
    sales_accountant:{dashboard:"view",details:"view",external:"hide",stock:"view",reports:"edit",calc:"hide",tasks:"edit",db:"hide",settings:"hide",custDeliver:"edit",treasury:"hide",hr:{weeks:"hide",verify:"hide",employees:"hide",security:"hide"},purchase:"hide",warehouse:"view",audit:"hide"},
    purchase_accountant:{dashboard:"view",details:"view",external:"edit",stock:"edit",reports:"edit",calc:"edit",tasks:"edit",db:"edit",settings:"hide",custDeliver:"hide",treasury:"edit",hr:{weeks:"hide",verify:"hide",employees:"hide",security:"hide"},purchase:"edit",warehouse:"edit",audit:"hide"},
    /* V15.28: New role — prepares salaries but CANNOT verify receipt (separation of duties) */
    payroll_accountant:{dashboard:"view",details:"view",external:"hide",stock:"hide",reports:"view",calc:"hide",tasks:"edit",db:"hide",settings:"hide",custDeliver:"hide",treasury:"view",hr:{weeks:"edit",verify:"hide",employees:"edit",security:"view"},purchase:"hide",warehouse:"hide",audit:"hide"},
    /* V15.28: New role — verifies receipt (QR scan) ONLY. Cannot edit salary. */
    payroll_verifier:{dashboard:"view",details:"view",external:"hide",stock:"hide",reports:"view",calc:"hide",tasks:"edit",db:"hide",settings:"hide",custDeliver:"hide",treasury:"view",hr:{weeks:"view",verify:"edit",employees:"view",security:"view"},purchase:"hide",warehouse:"hide",audit:"hide"},
    viewer:{dashboard:"view",details:"view",external:"hide",stock:"hide",reports:"view",calc:"view",tasks:"edit",db:"hide",settings:"hide",custDeliver:"hide",treasury:"hide",hr:{weeks:"hide",verify:"hide",employees:"hide",security:"hide"},purchase:"view",warehouse:"view",audit:"hide"}
  };
  const getTabPerm=(tabKey)=>{const perms=config.permissions||{};const defaults=DEFAULT_PERMS[userRole]||DEFAULT_PERMS.viewer;const rolePerm=perms[userRole]||{};const fromConfig=rolePerm[tabKey];const fromDefault=defaults[tabKey];
    /* If the permission is an object (e.g. hr), return it as-is */
    if(fromConfig&&typeof fromConfig==="object")return fromConfig;
    if(fromDefault&&typeof fromDefault==="object")return fromDefault;
    return fromConfig||fromDefault||"view";
  };
  /* V15.28: Get HR sub-permission. Handles backward compat with string hr permission. */
  const getHrSubPerm=(subKey)=>{
    const hrPerm=getTabPerm("hr");
    if(typeof hrPerm==="string")return hrPerm;/* Backward compat: old string applies to all */
    if(hrPerm&&typeof hrPerm==="object")return hrPerm[subKey]||"hide";
    return"hide";
  };
  const canEditTab=(tabKey)=>{const p=getTabPerm(tabKey);if(typeof p==="object")return Object.values(p).some(v=>v==="edit");return p==="edit"};
  const canViewTab=(tabKey)=>{const p=getTabPerm(tabKey);if(typeof p==="object")return Object.values(p).some(v=>v!=="hide");return p!=="hide"};
  const statusCards=config.statusCards||DEFAULT_STATUSES;

  /* Status change notification — V15.76: timeout now has cleanup to prevent
     leaks when the component unmounts or orders change before the 60s expires. */
  useEffect(()=>{if(orders.length===0)return;const prev=prevStatuses.current;let changed=null;
    orders.forEach(o=>{if(prev[o.id]&&prev[o.id]!==o.status)changed={modelNo:o.modelNo,from:prev[o.id],to:o.status};prev[o.id]=o.status});
    if(changed){setStatusNotif(changed);const t=setTimeout(()=>setStatusNotif(null),60000);return()=>clearTimeout(t)}
  },[orders]);

  if(authLoading)return null;
  if(!user)return<LoginScreen/>;
  if(dataLoading)return<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#EFF6FF",direction:"rtl",fontFamily:"'Cairo',sans-serif"}}>
    <div style={{textAlign:"center"}}>
      <div style={{display:"flex",justifyContent:"center",marginBottom:14}}>
        <Spinner size="large" color={T.accent}/>
      </div>
      <div style={{fontSize:13,fontWeight:700,color:T.accent}}>جاري تحميل البيانات</div>
      <div style={{fontSize:11,color:"#94A3B8",marginTop:4}}>يرجى الانتظار قليلاً...</div>
    </div>
  </div>;
  /* V15.59: Mobile Warehouse App — accessed via /warehouse URL.
     Renders a separate mobile-first shell instead of the normal app. */
  if(window.location.pathname==="/warehouse"){
    return<MobileWarehouseShell data={data} upConfig={upConfig} upSales={upSales} upTasks={upTasks} updOrder={updOrder} user={user}/>;
  }
  const userName=user.displayName||user.email.split("@")[0];
  /* Compute alerts */
  const appAlerts=(()=>{try{const a=[];
    data.orders.forEach(o=>{const wds=o.workshopDeliveries||[];const pieces=o.orderPieces||[];
      if(pieces.length===0&&wds.length===0&&o.status==="تم القص"){a.push({key:"noDeliver_"+o.id,msg:o.modelNo+" — "+o.modelDesc+" لم يُسلَّم لأي ورشة",color:T.warn,icon:"⏳",orderId:o.id})}
      /* Pieces not linked to fabric */
      const linkedPieces=new Set();if(pieces.length>0){FKEYS.forEach(k=>{if(gf(o,k))(o["fabricPieces"+k]||[]).forEach(p=>linkedPieces.add(p))});const unlinked=pieces.filter(p=>!linkedPieces.has(p));unlinked.forEach(p=>a.push({key:"uncut_"+o.id+"_"+p,msg:o.modelNo+" — متبقي "+p+" «لم يتم القص»",color:T.purple,icon:"🧵",orderId:o.id}))}
      /* Pieces linked (cut) but not delivered to any workshop */
      if(pieces.length>0){const t=calcOrder(o);pieces.forEach(p=>{if(!linkedPieces.has(p))return;const delivered=wds.some(wd=>wd.garmentType===p);if(!delivered)a.push({key:"notDelivered_"+o.id+"_"+p,msg:o.modelNo+" — "+p+" ("+t.cutQty+" قطعة) متاح للتسليم والتشغيل",color:T.warn,icon:"🏭",orderId:o.id})})}
    });
    /* Delay alerts */
    const now=new Date();data.orders.filter(o=>o.status!=="تم التسليم لمخزن الجاهز").forEach(o=>{let lastDate=o.date;(o.workshopDeliveries||[]).forEach(wd=>{if(wd.date>lastDate)lastDate=wd.date;(wd.receives||[]).forEach(r=>{if(r.date>lastDate)lastDate=r.date})});(o.deliveries||[]).forEach(d=>{if(d.date>lastDate)lastDate=d.date});const diff=Math.floor((now-new Date(lastDate))/(1000*60*60*24));if(diff>7&&!a.find(x=>x.orderId===o.id))a.push({key:"stale_"+o.id,msg:o.modelNo+" بدون حركة منذ "+diff+" يوم",color:T.err,icon:"🔴",orderId:o.id})});
    /* Completion */
    const _cutQ=data.orders.reduce((s,o)=>s+calcOrder(o).cutQty,0);const _delQ=data.orders.reduce((s,o)=>s+(o.deliveredQty||0),0);if(_cutQ&&Math.round(_delQ/_cutQ*100)>=100)a.push({key:"allDone",msg:"تم الانتهاء من جميع الأوردرات!",color:T.ok,icon:"🎉"});
    /* Workshop limit */
    (data.workshops||[]).filter(w=>!wsIsInternal(w.type)).forEach(w=>{let due=0;data.orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===w.name).forEach(wd=>{(wd.receives||[]).forEach(r=>{due+=r2((Number(r.qty)||0)*(Number(r.price)||0))})})});const purch=(data.wsPayments||[]).filter(p=>p.wsName===w.name&&p.type==="purchase").reduce((s,p)=>s+(Number(p.amount)||0),0);const paid=(data.wsPayments||[]).filter(p=>p.wsName===w.name&&p.type==="payment").reduce((s,p)=>s+(Number(p.amount)||0),0);const pct=w.payPercent||60;const limit=r2((due+purch)*(pct/100));if(paid>limit&&due>0)a.push({key:"wsLimit_"+w.name,msg:w.name+" تجاوز حد "+pct+"%",color:T.err,icon:"⚠️"})});
    /* Smart: Workshop quality alerts */
    (data.workshops||[]).filter(w=>!wsIsInternal(w.type)).forEach(w=>{const r=calcWsRating(w.name,data.orders);if(r!==null&&r<5)a.push({key:"wsQual_"+w.name,msg:w.name+" تقييم منخفض ("+r+"/10) — مراجعة الجودة",color:T.err,icon:"📉"})});
    /* Smart: Workshop delay alerts */
    const _now=new Date();
    /* Approaching deadline alerts */
    data.orders.forEach(o=>{(o.workshopDeliveries||[]).forEach((wd,wdIdx)=>{const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);if(rcvd>=(Number(wd.qty)||0))return;const days=Math.floor((_now-new Date(wd.date))/(1000*60*60*24));const ideal=Math.max(5,Math.round(((Number(wd.qty)||0)/500)*6.5));const remaining=ideal-days;if(remaining>0&&remaining<=2&&days>0)a.push({key:"deadline_"+o.id+"_"+wdIdx,msg:o.modelNo+" — "+wd.wsName+" باقي "+remaining+" يوم على الموعد",color:"#F59E0B",icon:"⏰",orderId:o.id})})});
    (data.workshops||[]).filter(w=>!wsIsInternal(w.type)).forEach(w=>{let maxDelay=0,delayOrder="";data.orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===w.name).forEach(wd=>{const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);if(rcvd<(Number(wd.qty)||0)){const days=Math.floor((_now-new Date(wd.date))/(1000*60*60*24));const ideal=Math.max(5,Math.round(((Number(wd.qty)||0)/500)*6.5));if(days>ideal*1.5&&days>maxDelay){maxDelay=days;delayOrder=o.modelNo}}})});if(maxDelay>0)a.push({key:"wsDelay_"+w.name,msg:w.name+" متأخرة "+maxDelay+" يوم (موديل "+delayOrder+")",color:T.warn,icon:"🕐"})});
    /* Workshop alerts with WhatsApp */
    const _workshops=data.workshops||[];
    _workshops.filter(w=>!wsIsInternal(w.type)).forEach(w=>{const wPhone=w.phone||"";const wsDetails=[];
      data.orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===w.name).forEach(wd=>{const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);const wBal=(Number(wd.qty)||0)-rcvd;
        if(wBal>0){const daysSince=Math.floor((_now-new Date(wd.date))/(1000*60*60*24));const agreed=Number(wd.agreedDays)||0;wsDetails.push({modelNo:o.modelNo,qty:wBal,days:daysSince,agreed,garment:wd.garmentType||"",delDate:wd.date,orderId:o.id})}})});
      wsDetails.forEach(d=>{if(d.agreed>0){const remaining=d.agreed-d.days;
        if(remaining<=2&&remaining>=0)a.push({key:"agreedDue_"+w.name+"_"+d.orderId,msg:w.name+" باقي "+(remaining||"آخر")+" يوم على تسليم موديل "+d.modelNo+" ("+d.agreed+" يوم متفق)",color:"#F59E0B",icon:"⏰",orderId:d.orderId,wsName:w.name,wsPhone:wPhone,wsDetails:[d]});
        else if(remaining<0)a.push({key:"agreedLate_"+w.name+"_"+d.orderId,msg:w.name+" متأخرة "+Math.abs(remaining)+" يوم — موديل "+d.modelNo+" (متفق "+d.agreed+" يوم)",color:T.err,icon:"🔴",orderId:d.orderId,wsName:w.name,wsPhone:wPhone,wsDetails:[d]})}})});
    /* 6. Bottleneck — طقم واقف بسبب قطعة */
    data.orders.forEach(o=>{if(o.closed)return;const pieces=o.orderPieces||[];if(pieces.length<2)return;
      const wds=o.workshopDeliveries||[];const pBal={};
      pieces.forEach(p=>{const del=wds.filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0);const rcv=wds.filter(wd=>wd.garmentType===p).reduce((s,wd)=>(wd.receives||[]).filter(r=>!r.isSettlement).reduce((ss,r)=>ss+(Number(r.qty)||0),0)+s,0);pBal[p]={del,rcv,bal:del-rcv}});
      const doneP=pieces.filter(p=>pBal[p].bal===0&&pBal[p].rcv>0);const stuckP=pieces.filter(p=>pBal[p].bal>0);
      if(doneP.length>0&&stuckP.length>0&&stuckP.length<=doneP.length){
        const minDone=Math.min(...doneP.map(p=>pBal[p].rcv));
        stuckP.forEach(p=>{const ws=wds.filter(wd=>wd.garmentType===p&&(Number(wd.qty)||0)-(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0)>0);
          const wsName=ws[0]?.wsName||"";const wsObj=_workshops.find(w=>w.name===wsName);const wPhone=wsObj?.phone||"";
          const stuckQty=pBal[p].bal;const waitingSets=Math.min(stuckQty,minDone>0?stuckQty:0);
          a.push({key:"bottleneck_"+o.id+"_"+p,msg:"🚨 موديل "+o.modelNo+" — طقم واقف! "+p+" ("+stuckQty+" قطعة) عند "+(wsName||"ورشة")+" — باقي القطع جاهزة",
            color:"#DC2626",icon:"🚨",orderId:o.id,wsName,wsPhone:wPhone,wsDetails:[{modelNo:o.modelNo,qty:stuckQty,days:0,agreed:0,garment:p}]})})}});
    /* V15.8: filter out user-dismissed alerts */
    return a.filter(al=>!isDismissed(al.key||al.msg))}catch(e){console.error("Alert error:",e);return[]}})();

  /* User notifications */
  const userEmail=user?.email||"";
  const userNotifs=(config.notifications||[]).filter(n=>n.toEmail===userEmail||n.toEmail==="all").filter(n=>!(n.readBy||[]).includes(userEmail)&&!(n.dismissedBy||[]).includes(userEmail));
  /* V15.8: Clicking a notification dismisses it for this user entirely.
     For shared notifications (toEmail="all"), we track per-user dismissal via dismissedBy. */
  const markRead=(nid)=>upConfig(d=>{const n=(d.notifications||[]).find(x=>x.id===nid);if(!n)return;
    if(n.toEmail===userEmail){
      /* Private notification — remove from the array */
      d.notifications=d.notifications.filter(x=>x.id!==nid);
    }else{
      /* Broadcast notification — add this user to dismissedBy so they don't see it again */
      if(!n.dismissedBy)n.dismissedBy=[];
      if(!n.dismissedBy.includes(userEmail))n.dismissedBy.push(userEmail);
      /* Also add to readBy for backward compat */
      if(!n.readBy)n.readBy=[];
      if(!n.readBy.includes(userEmail))n.readBy.push(userEmail);
    }
  });
  const allAlerts=[...userNotifs.map(n=>{
    /* V15.50: Delivery confirmation notification types get specific styling + link to custDelivery */
    if(n.type==="delivery_confirmed")return{msg:n.msg,color:"#10B981",icon:"✅",orderId:null,isNotif:true,notifId:n.id,from:n.fromName,date:n.createdAt,goTo:"custDelivery"};
    if(n.type==="delivery_issue")return{msg:n.msg,color:"#EF4444",icon:"⚠️",orderId:null,isNotif:true,notifId:n.id,from:n.fromName,date:n.createdAt,goTo:"custDelivery"};
    return{msg:n.msg,color:n.type==="طلب"?"#8B5CF6":n.type==="مهمة"?T.accent:T.warn,icon:n.type==="طلب"?"📩":n.type==="مهمة"?"📌":"💬",orderId:n.orderId||null,isNotif:true,notifId:n.id,from:n.fromName,date:n.createdAt};
  }),...appAlerts];
  const alertCount=allAlerts.length;
  /* Urgent tasks - separate from bell */
  const urgentTasks=(config.notifications||[]).filter(n=>n.type==="مهمة عاجلة"&&(n.toEmail===userEmail||n.toEmail==="all")&&!(n.doneBy||[]).includes(userEmail));
  const markTaskDone=(nid)=>upConfig(d=>{const n=(d.notifications||[]).find(x=>x.id===nid);if(n){if(!n.doneBy)n.doneBy=[];if(!n.doneBy.includes(userEmail))n.doneBy.push(userEmail)}});

  const goHome=async()=>{if(window.__formDirty){if(!await ask("الخروج بدون حفظ","هل تريد الخروج بدون حفظ البيانات المدخلة؟",{danger:true,confirmText:"خروج"}))return;window.__formDirty=false}setTab("home");setSel(null)};
  const goTo=async(key)=>{if(window.__formDirty){if(!await ask("الخروج بدون حفظ","هل تريد الخروج بدون حفظ البيانات المدخلة؟",{danger:true,confirmText:"خروج"}))return;window.__formDirty=false}setTab(key);if(key!=="details")setSel(null)};

  return<div onClick={()=>{if(showAlerts)setShowAlerts(false);if(gSearch)setGSearch("");if(showLogout)setShowLogout(false)}} style={{minHeight:"100vh",direction:"rtl",fontFamily:"'Cairo',sans-serif",background:T.bg,color:T.text,fontSize:FS,display:"flex",flexDirection:"column"}}>
    {/* ═══ PROFESSIONAL TOP BAR V14.47 ═══ */}
    <style>{`
      .tb-btn{transition:all 0.18s ease;cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:10px}
      .tb-btn:hover{background:${T.navBg?"rgba(255,255,255,0.2)":T.accentBg}!important}
      .tb-badge{position:absolute;top:-4px;left:-4px;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:${T.err};color:#fff;font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center;border:2px solid ${T.navBg||T.cardSolid};box-sizing:content-box}
      .tb-menu{position:absolute;top:calc(100% + 8px);left:0;min-width:240px;background:${T.cardSolid};border:1px solid ${T.brd};border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,0.12);z-index:9999;overflow:hidden;animation:tbFade 0.2s ease}
      .tb-menu-item{padding:10px 14px;cursor:pointer;display:flex;align-items:center;gap:10px;transition:background 0.15s;font-size:${FS-1}px;color:${T.text}}
      .tb-menu-item:hover{background:${T.accentBg}}
      .tb-menu-item + .tb-menu-item{border-top:1px solid ${T.brd}}
      @keyframes tbFade{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
      .tb-search{width:100%;padding:8px 14px 8px 36px;border-radius:10px;border:1px solid ${T.navBg?"rgba(255,255,255,0.2)":T.brd};font-size:${FS-1}px;font-family:inherit;background:${T.navBg?"rgba(255,255,255,0.12)":T.inputBg||T.cardSolid};color:${T.navText||T.text};box-sizing:border-box;outline:none;transition:all 0.2s}
      .tb-search:focus{border-color:${T.navBg?"rgba(255,255,255,0.5)":T.accent};background:${T.navBg?"rgba(255,255,255,0.18)":T.cardSolid};box-shadow:0 0 0 3px ${T.navBg?"rgba(255,255,255,0.1)":T.accent+"15"}}
      .tb-search::placeholder{color:${T.navText?"rgba(255,255,255,0.6)":T.textMut}}
    `}</style>
    <div style={{padding:isMob?"8px 12px":"10px 24px",background:T.navBg||T.cardSolid,borderBottom:T.navBg?"none":"1px solid "+T.brd,display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0,gap:isMob?8:16,minHeight:isMob?52:60}}>
      {/* ═══ LEFT GROUP: Home + Logo + Season + Status ═══ */}
      <div style={{display:"flex",alignItems:"center",gap:isMob?6:10,flexShrink:0}}>
        {tab!=="home"&&<div onClick={goHome} title="الصفحة الرئيسية" className="tb-btn" style={{color:T.navText||T.accent,padding:isMob?"6px":"8px 10px",background:T.navBg?"rgba(255,255,255,0.15)":T.accentBg}}>
          <svg width={isMob?18:20} height={isMob?18:20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        </div>}
        <img src={config.logo||CLARK_LOGO} alt="CLARK" style={{height:isMob?24:32,objectFit:"contain",...(T.navBg?{filter:"brightness(0) invert(1)"}:{})}}/>
        {!isMob&&<div style={{display:"flex",alignItems:"center",gap:6,lineHeight:1}}>
          <span style={{fontSize:10,padding:"1px 6px",borderRadius:4,fontWeight:700,background:justReconnected?"#10B98118":isOnline?(T.navBg?"rgba(255,255,255,0.12)":"#10B98108"):"#EF444418",color:justReconnected?"#10B981":isOnline?(T.navText?"#A7F3D0":"#10B981"):"#EF4444"}}>
            {justReconnected?"✓ تم المزامنة":isOnline?"● متصل":"○ غير متصل"}
          </span>
          <span style={{fontSize:FS-3,color:T.navText||T.textMut,fontWeight:600,fontFamily:"monospace",opacity:0.7}}>V15.85</span>
        </div>}
        {isMob&&<span style={{fontSize:9,padding:"2px 6px",borderRadius:5,fontWeight:700,background:isOnline?"#10B98120":"#EF444420",color:isOnline?"#10B981":"#EF4444"}}>{isOnline?"●":"○"}</span>}
      </div>

      {/* ═══ CENTER: Search (desktop only) ═══ */}
      {!isMob&&<div onClick={e=>e.stopPropagation()} style={{flex:1,maxWidth:440,position:"relative"}}>
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",color:T.navText?"rgba(255,255,255,0.6)":T.textMut,pointerEvents:"none"}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input value={gSearch} onChange={e=>setGSearch(e.target.value)} placeholder="بحث شامل: موديل، ورشة، خامة، عميل، مورد، موظف..." className="tb-search" style={{paddingRight:36,paddingLeft:14}}/>
        {gSearchDeb.trim()&&(()=>{const q=gSearchDeb.trim().toLowerCase();const res=[];
          data.orders.forEach(o=>{if([o.modelNo,o.modelDesc,o.poNumber||""].join(" ").toLowerCase().includes(q))res.push({type:"أوردر",label:(o.poNumber?o.poNumber+" — ":"")+o.modelNo+" — "+o.modelDesc,action:()=>{goD(o.id);setGSearch("")}})});
          (data.workshops||[]).forEach(w=>{if([w.name,w.owner||"",w.phone||""].join(" ").toLowerCase().includes(q))res.push({type:"ورشة",label:w.name+(w.owner?" — "+w.owner:""),action:()=>{setDbSub("ws");setTab("db");setGSearch("")}})});
          (data.fabrics||[]).forEach(f=>{if((f.name||"").toLowerCase().includes(q))res.push({type:"خامة",label:f.name,action:()=>{setDbSub("fab");setTab("db");setGSearch("")}})});
          (data.accessories||[]).forEach(a=>{if((a.name||"").toLowerCase().includes(q))res.push({type:"اكسسوار",label:a.name,action:()=>{setDbSub("acc");setTab("db");setGSearch("")}})});
          /* V15.14: Customer, Supplier, Employee search */
          (data.customers||[]).forEach(c=>{if([c.name||"",c.phone||"",c.address||"",c.type||""].join(" ").toLowerCase().includes(q))res.push({type:"عميل",label:c.name+(c.phone?" — "+c.phone:""),action:()=>{setTab("custDeliver");setGSearch("")}})});
          (data.suppliers||[]).forEach(s=>{if([s.name||"",s.phone||"",s.type||""].join(" ").toLowerCase().includes(q))res.push({type:"مورد",label:s.name+(s.phone?" — "+s.phone:""),action:()=>{setTab("purchase");setGSearch("")}})});
          (data.employees||[]).filter(e=>!e.inactive).forEach(e=>{if([e.name||"",e.code||"",e.job||"",e.phone||"",e.fingerprintCode||""].join(" ").toLowerCase().includes(q))res.push({type:"موظف",label:e.name+(e.code?" #"+e.code:"")+(e.job?" — "+e.job:""),action:()=>{setTab("hr");setGSearch("")}})});
          return<div style={{position:"absolute",top:"100%",right:0,left:0,marginTop:6,background:T.cardSolid,border:"1px solid "+T.brd,borderRadius:12,boxShadow:"0 12px 40px rgba(0,0,0,0.15)",zIndex:999,maxHeight:360,overflow:"auto"}}>
            {res.slice(0,12).map((r,i)=><div key={i} onClick={r.action} style={{padding:"10px 14px",cursor:"pointer",borderBottom:i<res.slice(0,12).length-1?"1px solid "+T.brd:"none",display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:FS-1,transition:"background 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background=T.accentBg} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <span style={{color:T.text,fontWeight:600}}>{r.label}</span><span style={{fontSize:FS-3,color:T.textMut,background:T.bg,padding:"2px 8px",borderRadius:6,fontWeight:700}}>{r.type}</span>
            </div>)}
            {res.length>12&&<div style={{padding:"6px 14px",textAlign:"center",color:T.textMut,fontSize:FS-3,fontWeight:600,background:T.bg}}>{"+ "+(res.length-12)+" نتيجة أخرى — حدّد البحث"}</div>}
            {res.length===0&&<div style={{padding:16,textAlign:"center",color:T.textMut,fontSize:FS-1}}>لا توجد نتائج</div>}
          </div>})()}
      </div>}

      {/* ═══ RIGHT GROUP: Urgent + Notifs + Alerts bell + AI + User menu ═══ */}
      <div style={{display:"flex",alignItems:"center",gap:isMob?4:6,flexShrink:0}}>
        {/* Urgent Tasks - desktop only */}
        {!isMob&&urgentTasks.length>0&&<div style={{display:"flex",gap:6,alignItems:"center",maxWidth:300,overflow:"auto"}}>
          {urgentTasks.map(t=><div key={t.id} onClick={()=>{markTaskDone(t.id);showToast("✓ تم تنفيذ المهمة")}} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 10px",borderRadius:8,background:"#EF444418",border:"1px solid #EF444440",cursor:"pointer",animation:"pulse 2s infinite",whiteSpace:"nowrap",transition:"all 0.2s"}} onMouseEnter={e=>e.currentTarget.style.background="#EF444430"} onMouseLeave={e=>e.currentTarget.style.background="#EF444418"}>
            <span style={{fontSize:10,color:"#EF4444"}}>●</span>
            <span style={{fontSize:FS-2,fontWeight:700,color:"#EF4444"}}>{t.msg}</span>
            <span style={{fontSize:10,color:"#EF444480"}}>✓</span>
          </div>)}
          <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.7}}`}</style>
        </div>}

        {/* Status change notification */}
        {statusNotif&&<div onClick={()=>setStatusNotif(null)} style={{display:"flex",alignItems:"center",gap:4,padding:"3px 8px",borderRadius:8,background:"#8B5CF612",border:"1px solid #8B5CF630",cursor:"pointer",animation:"pulse 2s infinite",fontSize:isMob?10:FS-1,maxWidth:isMob?120:260,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>
          <span style={{fontSize:10,color:"#8B5CF6"}}>●</span><span style={{fontWeight:700,color:"#8B5CF6"}}>{statusNotif.modelNo}</span>{!isMob&&<span style={{color:T.textSec}}>{statusNotif.from+" ← "+statusNotif.to}</span>}
        </div>}

        {/* Alerts Bell */}
        <div style={{position:"relative"}} onClick={e=>e.stopPropagation()}>
          {config.disableNotifications?<div className="tb-btn" style={{padding:8,color:T.textMut,opacity:0.4}} title="الإشعارات معطلة">
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.33-5"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
          </div>:<>
          <div onClick={()=>setShowAlerts(!showAlerts)} title="التنبيهات والإشعارات" className="tb-btn" style={{padding:8,color:T.navText||T.text,background:alertCount>0?(T.navBg?"rgba(255,255,255,0.15)":T.warn+"12"):"transparent",position:"relative"}}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            {alertCount>0&&<span className="tb-badge">{alertCount}</span>}
          </div>
          {showAlerts&&<><div onClick={()=>setShowAlerts(false)} style={{position:"fixed",inset:0,zIndex:998}}/><div style={{position:"absolute",top:"100%",left:0,marginTop:8,width:isMob?290:360,background:T.cardSolid,border:"1px solid "+T.brd,borderRadius:12,boxShadow:"0 12px 40px rgba(0,0,0,0.15)",zIndex:999,maxHeight:420,overflow:"auto"}}>
            <div style={{padding:"12px 16px",borderBottom:"1px solid "+T.brd,fontWeight:800,fontSize:FS,color:T.text,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span>التنبيهات</span>
              {alertCount>0&&<span style={{fontSize:FS-2,color:T.textMut,fontWeight:600}}>{alertCount}</span>}
            </div>
            {alertCount>0?allAlerts.map((a,i)=><div key={i} onClick={()=>{if(a.isNotif)markRead(a.notifId);if(a.orderId){goD(a.orderId);setShowAlerts(false)}else if(a.goTo==="custDelivery"){setPage("custDelivery");setShowAlerts(false)}else if(a.isNotif)setShowAlerts(false)}} style={{padding:"10px 14px",borderBottom:"1px solid "+T.brd,display:"flex",gap:10,alignItems:"flex-start",cursor:a.orderId||a.isNotif?"pointer":"default",background:a.isNotif?a.color+"06":"transparent",transition:"background 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background=a.color+"12"} onMouseLeave={e=>e.currentTarget.style.background=a.isNotif?a.color+"06":"transparent"}>
              <span style={{fontSize:16,flexShrink:0}}>{a.icon}</span>
              <div style={{flex:1}}><span style={{fontSize:FS-1,color:a.color,fontWeight:600,lineHeight:1.5}}>{a.msg}</span>{a.from&&<div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>{"من: "+a.from+(a.date?" — "+a.date:"")}</div>}{a.orderId&&!a.isNotif&&!a.wsPhone&&<div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>اضغط لفتح الأوردر</div>}</div>
              {a.wsPhone&&<span onClick={e=>{e.stopPropagation();const lines=(a.wsDetails||[]).map(d=>"• موديل *"+d.modelNo+"*: *"+d.qty+"* قطعة — "+d.days+" يوم"+(d.agreed?" (متفق "+d.agreed+" يوم)":"")).join("%0A");const msg="*CLARK — تنبيه تأخير*%0A%0A• الورشة: *"+a.wsName+"*%0A%0A"+lines+"%0A%0A⚠️ *برجاء الاهتمام بالتسليم في أقرب وقت*";window.open("https://wa.me/"+(a.wsPhone.replace(/[^0-9]/g,""))+"?text="+msg,"_blank")}} style={{cursor:"pointer",fontSize:14,color:"#25D366",flexShrink:0,padding:"2px 4px"}}>📱</span>}
            </div>):<div style={{padding:30,textAlign:"center",color:T.textMut,fontSize:FS-1}}>
              <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke={T.textMut} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{margin:"0 auto 8px",opacity:0.5}}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              <div>لا توجد تنبيهات</div>
            </div>}
          </div></>}</>}
        </div>

        {/* AI Assistant moved to floating button on home screen (V15.63) */}

        {/* User Menu Dropdown */}
        <div style={{position:"relative"}} onClick={e=>e.stopPropagation()}>
          <div onClick={()=>setShowLogout(!showLogout)} title={userName} className="tb-btn" style={{padding:isMob?"4px 8px":"6px 10px",background:showLogout?(T.navBg?"rgba(255,255,255,0.2)":T.accentBg):(T.navBg?"rgba(255,255,255,0.1)":"transparent"),border:"1px solid "+(T.navBg?"rgba(255,255,255,0.2)":T.brd),gap:8}}>
            <div style={{width:isMob?24:28,height:isMob?24:28,borderRadius:"50%",background:"linear-gradient(135deg,"+T.accent+","+T.accent+"CC)",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:isMob?11:13,fontWeight:800,flexShrink:0}}>{(userName||"?").charAt(0).toUpperCase()}</div>
            {!isMob&&<div style={{display:"flex",flexDirection:"column",alignItems:"flex-start",lineHeight:1.2}}>
              <span style={{fontSize:FS-2,color:T.navText||T.text,fontWeight:700,whiteSpace:"nowrap",maxWidth:100,overflow:"hidden",textOverflow:"ellipsis"}}>{userName}</span>
              <span style={{fontSize:9,color:T.navText?"rgba(255,255,255,0.7)":T.textMut,fontWeight:500}}>{userRole==="admin"?"مدير عام":userRole==="manager"?"مدير":userRole==="sales_accountant"?"محاسب مبيعات":userRole==="purchase_accountant"?"محاسب مشتريات":"مشاهد"}</span>
            </div>}
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{color:T.navText||T.textMut,transition:"transform 0.2s",transform:showLogout?"rotate(180deg)":""}}><polyline points="6 9 12 15 18 9"/></svg>
          </div>
          {showLogout&&<div className="tb-menu">
            {/* User info header */}
            <div style={{padding:"14px 16px",background:"linear-gradient(135deg,"+T.accent+"08, "+T.accent+"02)",borderBottom:"1px solid "+T.brd}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:44,height:44,borderRadius:"50%",background:"linear-gradient(135deg,"+T.accent+","+T.accent+"CC)",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:800,flexShrink:0}}>{(userName||"?").charAt(0).toUpperCase()}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:FS,fontWeight:800,color:T.text}}>{userName}</div>
                  <div style={{fontSize:FS-3,color:T.textMut,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user?.email}</div>
                  <div style={{fontSize:FS-3,color:T.accent,fontWeight:700,marginTop:2}}>{userRole==="admin"?"👑 مدير عام":userRole==="manager"?"⭐ مدير":userRole==="sales_accountant"?"💰 محاسب مبيعات":userRole==="purchase_accountant"?"🛒 محاسب مشتريات":"👁 مشاهد"}</div>
                </div>
              </div>
            </div>
            {/* Today's operations stat */}
            {(()=>{const td=new Date().toISOString().split("T")[0];let ops=0;data.orders.forEach(o=>{if(o.date===td)ops++;(o.workshopDeliveries||[]).forEach(wd=>{if(wd.date===td)ops++;(wd.receives||[]).forEach(r=>{if(r.date===td)ops++})});(o.deliveries||[]).forEach(d=>{if(d.date===td)ops++})});return<div style={{padding:"10px 14px",borderBottom:"1px solid "+T.brd,display:"flex",justifyContent:"space-between",alignItems:"center",background:T.bg+"40"}}>
              <span style={{fontSize:FS-2,color:T.textSec}}>📊 عمليات اليوم</span>
              <span style={{fontSize:FS-1,fontWeight:800,color:ops>0?T.ok:T.textMut,padding:"2px 10px",borderRadius:6,background:ops>0?T.ok+"12":T.bg}}>{ops}</span>
            </div>})()}
            {/* Theme submenu */}
            <div style={{padding:"10px 14px",borderBottom:"1px solid "+T.brd}}>
              <div style={{fontSize:FS-2,color:T.textSec,fontWeight:700,marginBottom:6}}>🎨 المظهر</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:5}}>
                {Object.entries(THEMES).map(([key,th])=><div key={key} onClick={()=>{setTheme(key)}} style={{cursor:"pointer",padding:"6px 4px",borderRadius:6,background:th.bg,border:theme===key?"2px solid "+th.accent:"1px solid "+th.brd,textAlign:"center",transition:"all 0.15s"}}>
                  <div style={{width:16,height:16,borderRadius:4,background:th.navBg||th.accent,margin:"0 auto 3px"}}/>
                  <div style={{fontSize:9,fontWeight:700,color:th.text,whiteSpace:"nowrap"}}>{th.name}{theme===key?" ✓":""}</div>
                </div>)}
              </div>
            </div>
            {/* Logout action */}
            <div onClick={()=>signOut(auth)} className="tb-menu-item" style={{color:T.err,fontWeight:700}}>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              <span>تسجيل الخروج</span>
            </div>
          </div>}
        </div>
      </div>
    </div>
    <div style={{flex:1,overflow:"auto",padding:isMob?"8px 10px":"12px 24px"}}>
      {/* HOME SCREEN */}
      {/* ═══ PROFESSIONAL HOME SCREEN V14.47 ═══ */}
      {tab==="home"&&(()=>{
        const hour=new Date().getHours();
        const greetText=hour<12?"صباح الخير":hour<17?"مساءً سعيداً":hour<20?"مساء الخير":"مساؤك جميل";
        const dateStr=new Date().toLocaleDateString("ar-EG",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
        const uemail=user?.email||"";
        const COLORS=[{key:"#FEF9C3",border:"#EAB308",name:"أصفر"},{key:"#DBEAFE",border:"#3B82F6",name:"أزرق"},{key:"#DCFCE7",border:"#22C55E",name:"أخضر"},{key:"#FCE7F3",border:"#EC4899",name:"وردي"},{key:"#EDE9FE",border:"#8B5CF6",name:"بنفسجي"},{key:"#FFEDD5",border:"#F97316",name:"برتقالي"}];
        const allNotes=(config.stickyNotes||[]);const myNotes=allNotes.filter(n=>n.email===uemail);
        const saveNote=(note)=>{upTasks(d=>{if(!d.stickyNotes)d.stickyNotes=[];const idx=d.stickyNotes.findIndex(n=>n.id===note.id);if(idx>=0)d.stickyNotes[idx]=note;else{if(d.stickyNotes.filter(n=>n.email===uemail).length>=20){showToast("⚠️ الحد الاقصى 20 ملاحظة");return}d.stickyNotes.push(note)}});setStickyForm(null);showToast("✓ تم الحفظ")};
        const delNote=(id)=>{upTasks(d=>{d.stickyNotes=(d.stickyNotes||[]).filter(n=>n.id!==id)})};
        const uid=user?.uid||"";const rawTasks=(config||{}).tasks;const tasksList=Array.isArray(rawTasks)?rawTasks:[];const myTasks=tasksList.filter(t=>(t.toEmail===uemail||t.toUid===uid)&&!t.done);
        const visibleTabs=TABS.filter(t=>canViewTab(t.key)).sort((a,b)=>a.key==="settings"?1:b.key==="settings"?-1:0);

        return<div>
          <style>{`
            .home-tile{transition:all 0.2s cubic-bezier(0.4,0,0.2,1);cursor:pointer}
            .home-tile:hover{transform:translateY(-4px);box-shadow:0 12px 28px -8px rgba(0,0,0,0.12)}
            .home-tile:active{transform:translateY(-2px)}
            .home-greet{background:linear-gradient(135deg,${T.accent}06,${T.accent}02);border:1px solid ${T.accent}15}
            .sb-tab{cursor:pointer;padding:10px 12px;border-radius:8px;display:flex;align-items:center;gap:6px;font-weight:700;font-size:${FS-2}px;transition:all 0.2s;justify-content:center}
            .sb-tab.active{background:${T.cardSolid};color:${T.accent};box-shadow:0 1px 3px rgba(0,0,0,0.06)}
            .sb-tab:not(.active){color:${T.textSec}}
            .sb-tab:not(.active):hover{color:${T.text}}
          `}</style>

          {/* ═══ GREETING HEADER — minimal & elegant ═══ */}
          <div className="home-greet" style={{padding:isMob?"14px 16px":"18px 24px",borderRadius:16,marginBottom:18,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
            <div>
              <div style={{fontSize:isMob?FS+2:FS+6,fontWeight:800,color:T.text,lineHeight:1.2}}>{greetText}، {userName||"مستخدم"}</div>
              <div style={{fontSize:FS-1,color:T.textSec,marginTop:4}}>{dateStr}</div>
            </div>
            <div style={{padding:"6px 12px",borderRadius:8,background:T.accent+"10",border:"1px solid "+T.accent+"20",fontSize:FS-2,fontWeight:700,color:T.accent,display:"flex",alignItems:"center",gap:6}}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <span>الموسم: {season}</span>
            </div>
          </div>

          {/* ═══ MAIN CONTENT: Tabs Grid + Sidebar (Desktop) / Stacked (Mobile) ═══ */}
          {!isMob?<div style={{display:"grid",gridTemplateColumns:"1fr 300px",gap:18,alignItems:"flex-start",maxWidth:1400,margin:"0 auto"}}>
            {/* ═══ LEFT: Tabs Grid (SVG icons) ═══ */}
            <div>
              <div style={{fontSize:FS-1,fontWeight:800,color:T.textSec,marginBottom:12,padding:"0 4px",textTransform:"uppercase",letterSpacing:"0.6px"}}>الوحدات الأساسية</div>
              <div style={{display:"grid",gridTemplateColumns:isTab?"repeat(4,1fr)":"repeat(5,1fr)",gap:12}}>
                {visibleTabs.map(t=>{const perm=getTabPerm(t.key);
                  return<div key={t.key} onClick={()=>goTo(t.key)} className="home-tile" style={{background:T.cardSolid,borderRadius:14,padding:"18px 10px",border:"1px solid "+T.brd,textAlign:"center",opacity:perm==="view"?0.75:1,position:"relative",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10,minHeight:120}}>
                    <div style={{width:48,height:48,borderRadius:12,background:t.color+"12",display:"flex",alignItems:"center",justifyContent:"center",color:t.color,border:"1px solid "+t.color+"20"}}>
                      <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{t.svg}</svg>
                    </div>
                    <div style={{fontSize:FS,fontWeight:800,color:T.text,lineHeight:1.2}}>{t.label}</div>
                    {perm==="view"&&<div style={{position:"absolute",top:6,left:6,fontSize:9,padding:"2px 6px",borderRadius:4,background:T.warn+"18",color:T.warn,fontWeight:700}}>👁 قراءة</div>}
                  </div>})}
              </div>

              {/* Quick Action Buttons */}
              <div style={{display:"flex",gap:10,marginTop:18,flexWrap:"wrap"}}>
                <div onClick={()=>setQuickPopup("task")} style={{cursor:"pointer",padding:"10px 18px",borderRadius:10,background:T.accent+"08",border:"1px solid "+T.accent+"25",display:"flex",alignItems:"center",gap:8,transition:"all 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background=T.accent+"15"} onMouseLeave={e=>e.currentTarget.style.background=T.accent+"08"}>
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  <span style={{fontSize:FS-1,fontWeight:700,color:T.accent}}>مهمة جديدة</span>
                </div>
                <div onClick={()=>setQuickPopup("notif")} style={{cursor:"pointer",padding:"10px 18px",borderRadius:10,background:"#8B5CF608",border:"1px solid #8B5CF625",display:"flex",alignItems:"center",gap:8,transition:"all 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background="#8B5CF615"} onMouseLeave={e=>e.currentTarget.style.background="#8B5CF608"}>
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  <span style={{fontSize:FS-1,fontWeight:700,color:"#8B5CF6"}}>إرسال اشعار</span>
                </div>
                <div onClick={()=>setBarcodePopup({mode:"manual",modelId:"",size:"",qty:1,serial:1})} style={{cursor:"pointer",padding:"10px 18px",borderRadius:10,background:"#F59E0B08",border:"1px solid #F59E0B25",display:"flex",alignItems:"center",gap:8,transition:"all 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background="#F59E0B15"} onMouseLeave={e=>e.currentTarget.style.background="#F59E0B08"}>
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="7" y1="7" x2="7" y2="17"/><line x1="11" y1="7" x2="11" y2="17"/><line x1="15" y1="7" x2="15" y2="17"/><line x1="17" y1="7" x2="17" y2="17"/></svg>
                  <span style={{fontSize:FS-1,fontWeight:700,color:"#F59E0B"}}>طباعة QR</span>
                </div>
              </div>

              {/* Odoo Quick Links */}
              {(()=>{
                const defaultLinks=[
                  {id:"accounting",icon:"📊",label:"المحاسبة",url:"https://clarkdb.odoo.com/odoo/accounting",color:"#8B5CF6"},
                  {id:"sales",icon:"🛒",label:"المبيعات",url:"https://clarkdb.odoo.com/odoo/sales",color:"#10B981"},
                  {id:"purchase",icon:"🏷️",label:"المشتريات",url:"https://clarkdb.odoo.com/odoo/purchase",color:"#EF4444"},
                  {id:"inventory",icon:"📦",label:"المخزن",url:"https://clarkdb.odoo.com/odoo/inventory",color:"#F59E0B"},
                  {id:"invoices",icon:"🧾",label:"فواتير بيع",url:"https://clarkdb.odoo.com/odoo/accounting/customer-invoices",color:"#0EA5E9"},
                ];
                const links=data.odooLinks||defaultLinks;
                if(links.length===0)return null;
                return<div style={{marginTop:24}}>
                  <div style={{fontSize:FS-1,fontWeight:800,color:T.textSec,marginBottom:12,padding:"0 4px",textTransform:"uppercase",letterSpacing:"0.6px",display:"flex",alignItems:"center",gap:8}}>
                    <img src="https://odoo-community.org/web/image/ir.attachment/22977/datas" alt="Odoo" style={{height:16,opacity:0.8}} onError={e=>{e.target.style.display="none"}}/>
                    <span>روابط Odoo</span>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(110px,1fr))",gap:10}}>
                    {links.map(l=><a key={l.id||l.label} href={l.url} target="_blank" rel="noopener noreferrer" className="home-tile" style={{background:T.cardSolid,borderRadius:12,padding:"14px 10px",border:"1px solid "+(l.color||T.accent)+"20",textAlign:"center",textDecoration:"none",display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
                      <div style={{fontSize:22,lineHeight:1}}>{l.icon||"🔗"}</div>
                      <div style={{fontSize:FS-2,fontWeight:700,color:l.color||T.accent,lineHeight:1.2}}>{l.label}</div>
                    </a>)}
                  </div>
                </div>;
              })()}
            </div>

            {/* ═══ RIGHT: Sidebar (Tabs: Notes / Tasks / Activity) ═══ */}
            <div style={{position:"sticky",top:12}}>
              <div style={{display:"flex",gap:4,marginBottom:14,background:T.bg,padding:4,borderRadius:10,border:"1px solid "+T.brd}}>
                <div onClick={()=>setSidebarTab("notes")} className={"sb-tab "+(sidebarTab==="notes"?"active":"")} style={{flex:1}}>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                  <span>ملاحظات{myNotes.length>0?" ("+myNotes.length+")":""}</span>
                </div>
                <div onClick={()=>setSidebarTab("tasks")} className={"sb-tab "+(sidebarTab==="tasks"?"active":"")} style={{flex:1}}>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                  <span>مهام{myTasks.length>0?" ("+myTasks.length+")":""}</span>
                </div>
                <div onClick={()=>setSidebarTab("activity")} className={"sb-tab "+(sidebarTab==="activity"?"active":"")} style={{flex:1}}>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                  <span>نشاط</span>
                </div>
              </div>

              {/* NOTES TAB */}
              {sidebarTab==="notes"&&<div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <span style={{fontSize:FS-2,color:T.textMut,fontWeight:600}}>{myNotes.length}/20</span>
                  <span onClick={()=>setStickyForm({id:gid(),email:uemail,title:"",text:"",color:"#FEF9C3",date:new Date().toISOString().split("T")[0]})} style={{cursor:"pointer",fontSize:FS-2,padding:"5px 12px",borderRadius:6,background:T.accent+"12",color:T.accent,fontWeight:700,display:"inline-flex",alignItems:"center",gap:4}}>
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    <span>جديدة</span>
                  </span>
                </div>
                {stickyForm&&<div style={{background:stickyForm.color,borderRadius:10,padding:10,border:"2px solid "+(COLORS.find(c=>c.key===stickyForm.color)?.border||"#EAB308")+"40",marginBottom:10}}>
                  <div style={{display:"flex",gap:3,marginBottom:6}}>{COLORS.map(c=><div key={c.key} onClick={()=>setStickyForm(p=>({...p,color:c.key}))} style={{width:16,height:16,borderRadius:4,background:c.key,border:stickyForm.color===c.key?"2px solid "+c.border:"1px solid #ccc",cursor:"pointer"}}/>)}</div>
                  <input value={stickyForm.title} onChange={e=>setStickyForm(p=>({...p,title:e.target.value}))} placeholder="العنوان..." style={{width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid #ddd",fontSize:FS-1,fontFamily:"inherit",fontWeight:700,background:"rgba(255,255,255,0.6)",marginBottom:4,boxSizing:"border-box"}}/>
                  <textarea value={stickyForm.text} onChange={e=>setStickyForm(p=>({...p,text:e.target.value}))} placeholder="ملاحظة..." rows={3} style={{width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid #ddd",fontSize:FS-2,fontFamily:"inherit",background:"rgba(255,255,255,0.6)",resize:"none",boxSizing:"border-box"}}/>
                  <div style={{display:"flex",gap:4,marginTop:6,justifyContent:"flex-end"}}>
                    <Btn ghost small onClick={()=>setStickyForm(null)}>إلغاء</Btn>
                    <Btn primary small onClick={()=>{if(!stickyForm.title?.trim()&&!stickyForm.text?.trim())return;saveNote(stickyForm)}}>💾 حفظ</Btn>
                  </div>
                </div>}
                <div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:500,overflowY:"auto"}}>
                  {myNotes.length>0?myNotes.map(n=>{const bc=COLORS.find(c=>c.key===n.color);return<div key={n.id} style={{background:n.color||"#FEF9C3",borderRadius:10,padding:"8px 10px",border:"1px solid "+(bc?.border||"#EAB308")+"30"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:6}}>
                      {n.title&&<div style={{fontWeight:700,fontSize:FS-1,color:"#1E293B",marginBottom:2,flex:1,lineHeight:1.3}}>{n.title}</div>}
                      <div style={{display:"flex",gap:2,flexShrink:0}}>
                        <span onClick={()=>setStickyForm({...n})} style={{cursor:"pointer",fontSize:11,opacity:0.5}}>✏️</span>
                        <span onClick={()=>delNote(n.id)} style={{cursor:"pointer",fontSize:11,opacity:0.5}}>✕</span>
                      </div>
                    </div>
                    {n.text&&<div style={{fontSize:FS-2,color:"#334155",lineHeight:1.4,whiteSpace:"pre-wrap"}}>{n.text}</div>}
                    <div style={{fontSize:FS-3,color:"#94A3B8",marginTop:4}}>{n.date}</div>
                  </div>}):<div style={{textAlign:"center",padding:"30px 14px",color:T.textMut,background:T.bg,borderRadius:10,border:"1px dashed "+T.brd}}>
                    <div style={{fontSize:30,marginBottom:6,opacity:0.5}}>📝</div>
                    <div style={{fontSize:FS-1,fontWeight:600}}>لا توجد ملاحظات</div>
                    <div style={{fontSize:FS-3,marginTop:2}}>اضغط "جديدة" لإضافة</div>
                  </div>}
                </div>
              </div>}

              {/* TASKS TAB */}
              {sidebarTab==="tasks"&&<div>
                {myTasks.length>0?<>
                  <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:520,overflowY:"auto"}}>{myTasks.map(t=><div key={t.id} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"10px 12px",borderRadius:10,background:"#FEF9C3",border:"1px solid #EAB30830"}}>
                    <span onClick={()=>upTasks(d=>{const arr=Array.isArray(d.tasks)?d.tasks:[];const tk=arr.find(x=>String(x.id)===String(t.id));if(tk){tk.done=true;tk.doneAt=new Date().toISOString()}})} style={{cursor:"pointer",fontSize:16,flexShrink:0,marginTop:1}} title="إتمام المهمة">⬜</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:FS-1,fontWeight:600,color:"#1C1917",lineHeight:1.4}}>{t.text}</div>
                      <div style={{fontSize:FS-3,color:"#78716C",marginTop:3}}>{"من: "+(t.fromName||"—")}</div>
                    </div>
                  </div>)}</div>
                  <div style={{textAlign:"center",marginTop:10}}>
                    <span onClick={()=>goTo("tasks")} style={{cursor:"pointer",fontSize:FS-2,color:T.accent,fontWeight:700,padding:"6px 14px",borderRadius:6,background:T.accent+"10",display:"inline-block"}}>عرض كل المهام</span>
                  </div>
                </>:<div style={{textAlign:"center",padding:"30px 14px",color:T.textMut,background:T.bg,borderRadius:10,border:"1px dashed "+T.brd}}>
                  <div style={{fontSize:30,marginBottom:6,opacity:0.5}}>✅</div>
                  <div style={{fontSize:FS-1,fontWeight:600}}>لا توجد مهام</div>
                  <div style={{fontSize:FS-3,marginTop:2}}>مهامك المسندة هتظهر هنا</div>
                </div>}
              </div>}

              {/* ACTIVITY TAB */}
              {sidebarTab==="activity"&&<div>
                <ActivityFeed orders={data.orders} config={config} user={user} isMob={false}/>
              </div>}
            </div>
          </div>
          :/* ═══ MOBILE LAYOUT ═══ */<div>
            {/* Tabs Grid */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>
              {visibleTabs.map(t=>{const perm=getTabPerm(t.key);
                return<div key={t.key} onClick={()=>goTo(t.key)} className="home-tile" style={{background:T.cardSolid,borderRadius:14,padding:"14px 8px",border:"1px solid "+T.brd,textAlign:"center",opacity:perm==="view"?0.75:1,position:"relative",display:"flex",flexDirection:"column",alignItems:"center",gap:8,minHeight:100}}>
                  <div style={{width:44,height:44,borderRadius:10,background:t.color+"12",display:"flex",alignItems:"center",justifyContent:"center",color:t.color,border:"1px solid "+t.color+"20"}}>
                    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{t.svg}</svg>
                  </div>
                  <div style={{fontSize:FS,fontWeight:800,color:T.text,lineHeight:1.2}}>{t.label}</div>
                  {perm==="view"&&<div style={{position:"absolute",top:4,left:4,fontSize:8,padding:"1px 4px",borderRadius:3,background:T.warn+"18",color:T.warn,fontWeight:700}}>👁</div>}
                </div>})}
            </div>

            {/* QR Scan primary button */}
            <div onClick={()=>setShowScanner("menu")} style={{margin:"0 auto 14px",maxWidth:260}}><div style={{background:"linear-gradient(135deg,"+T.accent+","+T.accent+"CC)",borderRadius:12,padding:"12px 24px",cursor:"pointer",display:"flex",alignItems:"center",gap:10,justifyContent:"center",boxShadow:"0 4px 16px "+T.accent+"40"}}>
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><path d="M15 13h3v3h-3z M18 18h3v3h-3z M13 13h2 M13 18h2"/></svg>
              <span style={{fontSize:FS+1,fontWeight:800,color:"#fff"}}>مسح QR</span>
            </div></div>

            {/* Quick actions */}
            <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap",marginBottom:14}}>
              <div onClick={()=>setQuickPopup("task")} style={{cursor:"pointer",padding:"8px 14px",borderRadius:10,background:T.accent+"10",border:"1px solid "+T.accent+"25",display:"flex",alignItems:"center",gap:6}}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                <span style={{fontSize:FS-2,fontWeight:700,color:T.accent}}>مهمة</span>
              </div>
              <div onClick={()=>setQuickPopup("notif")} style={{cursor:"pointer",padding:"8px 14px",borderRadius:10,background:"#8B5CF610",border:"1px solid #8B5CF625",display:"flex",alignItems:"center",gap:6}}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <span style={{fontSize:FS-2,fontWeight:700,color:"#8B5CF6"}}>اشعار</span>
              </div>
              <div onClick={()=>setBarcodePopup({mode:"manual",modelId:"",size:"",qty:1,serial:1})} style={{cursor:"pointer",padding:"8px 14px",borderRadius:10,background:"#F59E0B10",border:"1px solid #F59E0B25",display:"flex",alignItems:"center",gap:6}}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="7" y1="7" x2="7" y2="17"/><line x1="11" y1="7" x2="11" y2="17"/><line x1="15" y1="7" x2="15" y2="17"/><line x1="17" y1="7" x2="17" y2="17"/></svg>
                <span style={{fontSize:FS-2,fontWeight:700,color:"#F59E0B"}}>QR</span>
              </div>
              {/* V15.61: Mobile warehouse quick access */}
              <div onClick={()=>window.open("/warehouse","_blank")} style={{cursor:"pointer",padding:"8px 14px",borderRadius:10,background:"#10B98110",border:"1px solid #10B98125",display:"flex",alignItems:"center",gap:6}} title="فتح وضع المخزن السريع">
                <span style={{fontSize:14}}>📱</span>
                <span style={{fontSize:FS-2,fontWeight:700,color:"#10B981"}}>وضع المخزن</span>
              </div>
            </div>

            {/* Mobile: tasks + activity inline */}
            {myTasks.length>0&&<div style={{marginBottom:14}}>
              <div style={{background:"#FEF9C3",borderRadius:14,border:"1px solid #EAB30830",padding:12}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}><span style={{fontSize:16}}>✅</span><span style={{fontSize:FS,fontWeight:800,color:"#92400E"}}>{"مهامي ("+myTasks.length+")"}</span></div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>{myTasks.slice(0,5).map(t=><div key={t.id} style={{display:"flex",alignItems:"flex-start",gap:6,padding:"8px 10px",borderRadius:8,background:"rgba(255,255,255,0.7)",border:"1px solid #EAB30820"}}>
                  <span onClick={()=>upTasks(d=>{const arr=Array.isArray(d.tasks)?d.tasks:[];const tk=arr.find(x=>String(x.id)===String(t.id));if(tk){tk.done=true;tk.doneAt=new Date().toISOString()}})} style={{cursor:"pointer",fontSize:16}}>⬜</span>
                  <div style={{flex:1}}><div style={{fontSize:FS-1,fontWeight:600,color:"#1C1917"}}>{t.text}</div><div style={{fontSize:FS-3,color:"#78716C"}}>{"من: "+(t.fromName||"—")}</div></div>
                </div>)}</div>
              </div>
            </div>}

            <div style={{marginBottom:14}}><ActivityFeed orders={data.orders} config={config} user={user} isMob={true}/></div>

            {/* Odoo links mobile */}
            {(()=>{
              const defaultLinks=[
                {id:"accounting",icon:"📊",label:"المحاسبة",url:"https://clarkdb.odoo.com/odoo/accounting",color:"#8B5CF6"},
                {id:"sales",icon:"🛒",label:"المبيعات",url:"https://clarkdb.odoo.com/odoo/sales",color:"#10B981"},
                {id:"purchase",icon:"🏷️",label:"المشتريات",url:"https://clarkdb.odoo.com/odoo/purchase",color:"#EF4444"},
                {id:"inventory",icon:"📦",label:"المخزن",url:"https://clarkdb.odoo.com/odoo/inventory",color:"#F59E0B"},
                {id:"invoices",icon:"🧾",label:"فواتير بيع",url:"https://clarkdb.odoo.com/odoo/accounting/customer-invoices",color:"#0EA5E9"},
              ];
              const links=data.odooLinks||defaultLinks;
              if(links.length===0)return null;
              return<div>
                <div style={{fontSize:FS-1,fontWeight:800,color:T.textSec,marginBottom:10,textAlign:"center"}}>روابط Odoo</div>
                <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
                  {links.map(l=><a key={l.id||l.label} href={l.url} target="_blank" rel="noopener noreferrer" style={{background:T.cardSolid,borderRadius:12,padding:"10px 8px",border:"1px solid "+(l.color||T.accent)+"20",textDecoration:"none",width:80,textAlign:"center",display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                    <div style={{fontSize:20,lineHeight:1}}>{l.icon||"🔗"}</div>
                    <div style={{fontSize:FS-3,fontWeight:700,color:l.color||T.accent,lineHeight:1.2}}>{l.label}</div>
                  </a>)}
                </div>
              </div>;
            })()}
          </div>}

          {/* V15.63: Floating AI Assistant button — home screen, desktop only */}
          {!isMob&&<>
            <div onClick={()=>setAiOpen(!aiOpen)} title="المساعد الذكي" style={{position:"fixed",bottom:30,right:30,zIndex:9997,width:60,height:60,borderRadius:"50%",background:aiOpen?"linear-gradient(135deg,#0EA5E9,#8B5CF6)":"linear-gradient(135deg,#0EA5E9,#8B5CF6)",boxShadow:aiOpen?"0 8px 30px rgba(139,92,246,0.5)":"0 6px 20px rgba(14,165,233,0.35)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",transition:"all 0.25s cubic-bezier(0.4,0,0.2,1)",transform:aiOpen?"scale(1.05)":"scale(1)",border:"3px solid #fff"}} onMouseEnter={e=>{e.currentTarget.style.transform="scale(1.08)"}} onMouseLeave={e=>{e.currentTarget.style.transform=aiOpen?"scale(1.05)":"scale(1)"}}>
              <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>
              {visibleAlerts.length>0&&<span style={{position:"absolute",top:-4,right:-4,minWidth:22,height:22,padding:"0 6px",borderRadius:11,background:"#EF4444",color:"#fff",fontSize:11,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",border:"2px solid #fff"}}>{visibleAlerts.length}</span>}
            </div>
            {aiOpen&&<>
              <div onClick={()=>setAiOpen(false)} style={{position:"fixed",inset:0,zIndex:9998}}/>
              <div style={{position:"fixed",bottom:100,right:30,zIndex:9999}}>
                <div style={{background:T.cardSolid,borderRadius:16,border:"1px solid "+T.brd,boxShadow:"0 12px 48px rgba(0,0,0,0.25)",display:"flex",flexDirection:"column",height:520,width:400}}>
                  <div style={{padding:"12px 16px",borderBottom:"1px solid "+T.brd,display:"flex",justifyContent:"space-between",alignItems:"center",background:"linear-gradient(135deg,#0EA5E915,#8B5CF615)",borderRadius:"16px 16px 0 0"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:22}}>🤖</span><div><div style={{fontWeight:800,fontSize:FS+1,color:T.text,lineHeight:1.1}}>مساعد CLARK</div><div style={{fontSize:FS-3,color:T.textMut,marginTop:1}}>اسألني عن المصنع</div></div></div>
                    <div style={{display:"flex",gap:4}}>
                      {aiMsgs.length>0&&<span onClick={()=>setAiMsgs([])} style={{cursor:"pointer",fontSize:11,padding:"3px 10px",borderRadius:6,background:T.err+"12",color:T.err,fontWeight:700}}>مسح</span>}
                      <span onClick={()=>setAiOpen(false)} style={{cursor:"pointer",fontSize:18,color:T.textMut,padding:"0 6px"}}>✕</span>
                    </div>
                  </div>
                  <div style={{flex:1,overflowY:"auto",padding:12,display:"flex",flexDirection:"column",gap:8}}>
                    {aiMsgs.length===0&&<div>
                      {visibleAlerts.length>0&&<div style={{marginBottom:12}}>
                        <div style={{fontSize:FS-1,fontWeight:800,color:T.text,marginBottom:8,display:"flex",alignItems:"center",gap:6}}>{"⚡ "+visibleAlerts.length+" تنبيه"}</div>
                        {visibleAlerts.map((al,i)=><div key={i} onClick={()=>{setAiInput(al.text)}} style={{display:"flex",gap:8,alignItems:"flex-start",padding:"8px 10px",marginBottom:4,borderRadius:10,background:al.type==="late"?"#FEF2F2":al.type==="ready"?"#F0FDF4":al.type==="overpaid"?"#FFF7ED":al.type==="slow"?"#FFFBEB":"#F8FAFC",border:"1px solid "+(al.type==="late"?"#FECACA":al.type==="ready"?"#BBF7D0":al.type==="overpaid"?"#FED7AA":al.type==="slow"?"#FDE68A":"#E2E8F0"),cursor:"pointer"}}>
                          <span style={{fontSize:16,flexShrink:0}}>{al.icon}</span>
                          <span style={{fontSize:FS-2,color:"#1E293B",fontWeight:600,lineHeight:1.5,flex:1}}>{al.text}</span>
                          {al.wsPhone&&<span onClick={e=>{e.stopPropagation();const lines=(al.details||[]).map(d=>"• موديل *"+d.modelNo+"*: *"+d.qty+"* قطعة — "+d.days+" يوم"+(d.agreed?" (متفق "+d.agreed+" يوم)":"")).join("%0A");const msg="*CLARK — تنبيه تأخير*%0A%0A• الورشة: *"+al.wsName+"*%0A%0A"+lines+"%0A%0A⚠️ *برجاء الاهتمام بالتسليم في أقرب وقت*";window.open("https://wa.me/"+(al.wsPhone.replace(/[^0-9]/g,""))+"?text="+msg,"_blank");dismissAlert(al.key||al.text)}} style={{cursor:"pointer",fontSize:10,color:"#25D366",flexShrink:0,padding:"0 4px",fontWeight:700}}>📱</span>}
                          <span onClick={e=>{e.stopPropagation();dismissAlert(al.key||al.text)}} style={{cursor:"pointer",fontSize:10,color:"#94A3B8",flexShrink:0,padding:"0 2px"}}>✕</span>
                        </div>)}
                        <div style={{textAlign:"center",margin:"10px 0",fontSize:FS-2,color:T.textMut,letterSpacing:4}}>— — —</div>
                      </div>}
                      <div style={{textAlign:"center",padding:visibleAlerts.length>0?8:20,color:T.textMut}}>
                        {visibleAlerts.length===0&&<div style={{fontSize:38,marginBottom:10}}>🤖</div>}
                        <div style={{fontSize:FS-1,fontWeight:700,marginBottom:10,color:T.text}}>جرب تسأل:</div>
                        <div style={{display:"flex",flexDirection:"column",gap:6}}>
                          {["📦 إيه الورش اللي متأخرة؟","📊 لخصلي أداء الأسبوع","🏭 كام أوردر جاهز للتسليم؟","💰 مين الورش المدفوع لها زيادة؟","🛒 إيه أكتر الموديلات مبيعاً؟"].map((s,i)=><div key={i} onClick={()=>setAiInput(s.replace(/^[^\s]+\s/,""))} style={{padding:"8px 12px",borderRadius:10,background:T.bg,border:"1px solid "+T.brd,fontSize:FS-1,color:T.text,cursor:"pointer",textAlign:"right",fontWeight:600,transition:"all 0.15s"}} onMouseEnter={e=>{e.currentTarget.style.background=T.accent+"10";e.currentTarget.style.borderColor=T.accent+"40"}} onMouseLeave={e=>{e.currentTarget.style.background=T.bg;e.currentTarget.style.borderColor=T.brd}}>{s}</div>)}
                        </div>
                      </div>
                    </div>}
                    {aiMsgs.map((m,i)=><div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-start":"flex-end"}}>
                      <div style={{maxWidth:"85%",padding:"10px 14px",borderRadius:m.role==="user"?"12px 12px 4px 12px":"12px 12px 12px 4px",background:m.role==="user"?T.accent:T.bg,color:m.role==="user"?"#fff":T.text,fontSize:FS-1,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{m.text}</div>
                    </div>)}
                    {aiLoading&&<div style={{display:"flex",justifyContent:"flex-end"}}><div style={{padding:"10px 16px",borderRadius:12,background:T.bg,fontSize:FS-1,color:T.textMut,display:"inline-flex",alignItems:"center",gap:8}}><Spinner size="small" inline/><span>جاري التحليل...</span></div></div>}
                  </div>
                  <div style={{padding:"10px 12px",borderTop:"1px solid "+T.brd,display:"flex",gap:6}}>
                    <input value={aiInput} onChange={e=>setAiInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")askAI()}} placeholder="اسأل عن أي حاجة..." style={{flex:1,padding:"10px 12px",borderRadius:10,border:"1px solid "+T.brd,fontSize:FS,fontFamily:"inherit",background:T.bg,color:T.text,outline:"none",boxSizing:"border-box"}}/>
                    <button onClick={askAI} disabled={aiLoading||!aiInput.trim()} style={{padding:"10px 16px",borderRadius:10,border:"none",background:aiInput.trim()?"linear-gradient(135deg,#0EA5E9,#8B5CF6)":"#E2E8F0",color:aiInput.trim()?"#fff":"#94A3B8",cursor:aiInput.trim()?"pointer":"default",fontSize:14,fontWeight:700}}>📩</button>
                  </div>
                </div>
              </div>
            </>}
          </>}
        </div>;
      })()}
      {/* PAGES with back button */}
      {tab!=="home"&&canViewTab(tab)&&<div>
        {tab==="dashboard"&&<DashPg data={data} goD={goD} isMob={isMob} isTab={isTab} season={season} statusCards={statusCards} upConfig={upConfig} user={user} setCardPopup={setCardPopup} setWsAccPopup={setWsAccPopup}/>}
        {tab==="db"&&<DBPg data={data} upConfig={upConfig} isMob={isMob} isTab={isTab} canEdit={canEditTab("db")} statusCards={statusCards} initialSub={dbSub} onSubUsed={()=>setDbSub(null)} renameInOrders={renameInOrders}/>}
        {tab==="details"&&<DetPg data={data} updOrder={updOrder} replaceOrder={replaceOrder} addOrder={addOrder} delOrder={delOrder} sel={sel} setSel={setSel} isMob={isMob} isTab={isTab} canEdit={canEditTab("details")} statusCards={statusCards} goHome={goHome} upConfig={upConfig} user={user}/>}
        {tab==="external"&&<ExtProdPg data={data} updOrder={updOrder} upConfig={upConfig} isMob={isMob} isTab={isTab} canEdit={canEditTab("external")} statusCards={statusCards} season={season} user={user}/>}
        {tab==="stock"&&<StockPg data={data} updOrder={updOrder} isMob={isMob} canEdit={canEditTab("stock")} statusCards={statusCards} user={user}/>}
        {tab==="tasks"&&<TasksPg data={data} upConfig={upConfig} upTasks={upTasks} isMob={isMob} user={user} userRole={userRole}/>}
        {tab==="calc"&&<CalcPg data={data} isMob={isMob}/>}
        {tab==="reports"&&<ReportsHub data={data} isMob={isMob} season={season} statusCards={statusCards}/>}
        {tab==="settings"&&canEditTab("settings")&&<SettingsPg config={config} upConfig={upConfig} upSales={upSales} upTasks={upTasks} isMob={isMob} user={user} userRole={userRole} theme={theme} setTheme={setTheme} season={season} orders={orders} syncWsIds={syncWsIds} replaceOrder={replaceOrder} updOrder={updOrder} configDoc={configDoc} salesDoc={salesDoc} tasksDoc={tasksDoc}/>}
        {tab==="custDeliver"&&<CustDeliverPg data={data} upConfig={upConfig} upSales={upSales} upTasks={upTasks} updOrder={updOrder} isMob={isMob} isTab={isTab} canEdit={canEditTab("custDeliver")} user={user} season={season}/>}
        {tab==="purchase"&&<PurchasePg data={data} upConfig={upConfig} isMob={isMob} isTab={isTab} canEdit={canEditTab("purchase")} user={user} userRole={userRole}/>}
        {tab==="warehouse"&&<WarehousePg data={data} upConfig={upConfig} updOrder={updOrder} isMob={isMob} isTab={isTab} canEdit={canEditTab("warehouse")} statusCards={statusCards} user={user} userRole={userRole}/>}
        {tab==="treasury"&&<TreasuryPg data={data} upConfig={upConfig} isMob={isMob} canEdit={canEditTab("treasury")} user={user} userRole={userRole}/>}
        {tab==="hr"&&<HRPg data={data} upConfig={upConfig} isMob={isMob} canEdit={canEditTab("hr")} user={user} userRole={userRole} getHrSubPerm={getHrSubPerm} setSavingOverlay={setSavingOverlay}/>}
        {tab==="audit"&&canViewTab("audit")&&<AuditPg data={data} isMob={isMob} user={user}/>}
      </div>}
    </div>
    {/* Quick Task/Notification Popup */}
    {quickPopup&&(()=>{const allUsers=(config.usersList||[]);const me={email:user?.email||"",name:user?.displayName||(user?.email||"").split("@")[0],role:userRole};
      const targets=allUsers.find(u=>u.email===me.email)?allUsers:[me,...allUsers];
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:99998,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>{setQuickPopup(null);setQpTo("");setQpText("");setQpType("تذكير")}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:20,width:"100%",maxWidth:380,boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
        <div style={{display:"flex",justifyContent:"flex-end",marginBottom:4}}><Btn ghost small onClick={()=>{setQuickPopup(null);setQpTo("");setQpText("");setQpType("تذكير")}}>✕</Btn></div>
        <div style={{display:"flex",gap:0,marginBottom:14,borderRadius:10,overflow:"hidden",border:"1px solid "+T.brd}}>
          <div onClick={()=>{setQuickPopup("task");setQpTo("");setQpText("")}} style={{flex:1,padding:"8px 0",textAlign:"center",cursor:"pointer",fontWeight:700,fontSize:FS,background:quickPopup==="task"?T.accent:T.bg,color:quickPopup==="task"?"#fff":T.text}}>📌 مهمة</div>
          <div onClick={()=>{setQuickPopup("notif");setQpTo("all");setQpText("")}} style={{flex:1,padding:"8px 0",textAlign:"center",cursor:"pointer",fontWeight:700,fontSize:FS,background:quickPopup==="notif"?"#8B5CF6":T.bg,color:quickPopup==="notif"?"#fff":T.text}}>📩 اشعار</div>
        </div>
        {quickPopup==="task"?<div>
          <div style={{marginBottom:8}}><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>ارسال الى</label><Sel value={qpTo} onChange={setQpTo}><option value="">-- اختر --</option>{targets.map(u=><option key={u.email} value={u.email}>{(u.name||u.email.split("@")[0])+(u.email===me.email?" (أنا)":"")+" — "+(u.role==="admin"?"مدير النظام":u.role==="manager"?"مدير انتاج":u.role==="sales_accountant"?"محاسب مبيعات":u.role==="purchase_accountant"?"محاسب مشتريات":"مشاهد")}</option>)}</Sel></div>
          <div style={{marginBottom:8}}><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>المهمة</label><Inp value={qpText} onChange={setQpText} placeholder="اكتب المهمة..."/></div>
          <Btn primary onClick={()=>{if(!qpTo||!qpText.trim())return;const target=targets.find(u=>u.email===qpTo);
            upTasks(d=>{if(!Array.isArray(d.tasks))d.tasks=[];d.tasks.unshift({id:Date.now(),text:qpText.trim(),done:false,date:new Date().toISOString().split("T")[0],fromUid:user?.uid||"",fromEmail:user?.email||"",fromName:me.name,toEmail:qpTo,toName:target?.name||qpTo.split("@")[0]})});
            setQuickPopup(null);setQpTo("");setQpText("");showToast("✓ تم ارسال المهمة")}} style={{width:"100%"}}>📌 ارسال المهمة</Btn>
        </div>:<div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>الى</label><Sel value={qpTo} onChange={setQpTo}><option value="all">الكل</option>{targets.map(u=><option key={u.email} value={u.email}>{(u.name||u.email.split("@")[0])+(u.email===me.email?" (أنا)":"")}</option>)}</Sel></div>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>النوع</label><Sel value={qpType} onChange={setQpType}><option value="تذكير">💬 تذكير</option><option value="طلب">📩 طلب</option><option value="مهمة">📌 مهمة</option><option value="مهمة عاجلة">🔴 عاجل</option></Sel></div>
          </div>
          <div style={{marginBottom:8}}><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>الرسالة</label><Inp value={qpText} onChange={setQpText} placeholder="اكتب الاشعار..."/></div>
          <Btn primary onClick={()=>{if(!qpText.trim())return;const to=qpTo||"all";const targetUser=targets.find(u=>u.email===to);
            upConfig(d=>{if(!d.notifications)d.notifications=[];d.notifications.push({id:Date.now(),toEmail:to,toName:to==="all"?"الكل":targetUser?.name||to.split("@")[0],msg:qpText.trim(),type:qpType,fromName:me.name,createdAt:new Date().toISOString().split("T")[0],readBy:[]})});
            setQuickPopup(null);setQpTo("");setQpText("");setQpType("تذكير");showToast("✓ تم ارسال الاشعار")}} style={{width:"100%",background:"#8B5CF6"}}>📩 ارسال الاشعار</Btn>
        </div>}
      </div>
    </div>})()}
    {/* Mobile AI Chat Popup */}
    {isMob&&aiOpen&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:99997,display:"flex",alignItems:"flex-end",justifyContent:"center",padding:10}} onClick={()=>setAiOpen(false)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,border:"1px solid "+T.brd,boxShadow:"0 8px 40px rgba(0,0,0,0.15)",display:"flex",flexDirection:"column",height:"85vh",width:"100%",maxWidth:420}}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid "+T.brd,display:"flex",justifyContent:"space-between",alignItems:"center",background:"linear-gradient(135deg,#0EA5E910,#8B5CF610)",borderRadius:"16px 16px 0 0"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:20}}>🤖</span><span style={{fontWeight:800,fontSize:FS+1,color:T.text}}>مساعد CLARK</span></div>
          <div style={{display:"flex",gap:4}}>
            {aiMsgs.length>0&&<span onClick={()=>setAiMsgs([])} style={{cursor:"pointer",fontSize:11,padding:"2px 8px",borderRadius:6,background:T.err+"10",color:T.err,fontWeight:600}}>مسح</span>}
            <span onClick={()=>setAiOpen(false)} style={{cursor:"pointer",fontSize:16,color:T.textMut}}>✕</span>
          </div>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:12,display:"flex",flexDirection:"column",gap:8}}>
          {aiMsgs.length===0&&<div>
            {visibleAlerts.length>0&&<div style={{marginBottom:12}}>
              <div style={{fontSize:FS-1,fontWeight:800,color:T.text,marginBottom:8,display:"flex",alignItems:"center",gap:6}}>{"⚡ "+visibleAlerts.length+" تنبيه"}</div>
              {visibleAlerts.map((al,i)=><div key={i} onClick={()=>{setAiInput(al.text);}} style={{display:"flex",gap:8,alignItems:"flex-start",padding:"8px 10px",marginBottom:4,borderRadius:10,background:al.type==="late"?"#FEF2F2":al.type==="ready"?"#F0FDF4":al.type==="overpaid"?"#FFF7ED":al.type==="slow"?"#FFFBEB":"#F8FAFC",border:"1px solid "+(al.type==="late"?"#FECACA":al.type==="ready"?"#BBF7D0":al.type==="overpaid"?"#FED7AA":al.type==="slow"?"#FDE68A":"#E2E8F0"),cursor:"pointer",transition:"all 0.15s"}}>
                <span style={{fontSize:16,flexShrink:0}}>{al.icon}</span>
                <span style={{fontSize:FS-2,color:"#1E293B",fontWeight:600,lineHeight:1.5,flex:1}}>{al.text}</span>{al.wsPhone&&<span onClick={e=>{e.stopPropagation();const lines=(al.details||[]).map(d=>"• موديل *"+d.modelNo+"*: *"+d.qty+"* قطعة — "+d.days+" يوم"+(d.agreed?" (متفق "+d.agreed+" يوم)":"")).join("%0A");const msg="*CLARK — تنبيه تأخير*%0A%0A• الورشة: *"+al.wsName+"*%0A%0A"+lines+"%0A%0A⚠️ *برجاء الاهتمام بالتسليم في أقرب وقت*";window.open("https://wa.me/"+(al.wsPhone.replace(/[^0-9]/g,""))+"?text="+msg,"_blank");dismissAlert(al.key||al.text)}} style={{cursor:"pointer",fontSize:10,color:"#25D366",flexShrink:0,padding:"0 4px",fontWeight:700}}>📱</span>}<span onClick={e=>{e.stopPropagation();dismissAlert(al.key||al.text)}} style={{cursor:"pointer",fontSize:10,color:"#94A3B8",flexShrink:0,padding:"0 2px"}}>✕</span>
              </div>)}
              <div style={{textAlign:"center",margin:"10px 0",fontSize:FS-2,color:T.textMut,letterSpacing:4}}>— — —</div>
            </div>}
            <div style={{textAlign:"center",padding:visibleAlerts.length>0?8:20,color:T.textMut}}>
              {visibleAlerts.length===0&&<div style={{fontSize:32,marginBottom:8}}>🤖</div>}
              <div style={{fontSize:FS-1,fontWeight:600,marginBottom:4}}>اسألني عن أي حاجة</div>
              <div style={{fontSize:FS-2,lineHeight:1.8,whiteSpace:"pre-wrap"}}>{"• موديل 3262 فين؟\n• ملخص الورش\n• كام أوردر متأخر؟"}</div>
            </div>
          </div>}
          {aiMsgs.map((m,i)=><div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-start":"flex-end"}}>
            <div style={{maxWidth:"85%",padding:"8px 12px",borderRadius:m.role==="user"?"12px 12px 4px 12px":"12px 12px 12px 4px",background:m.role==="user"?T.accent:T.bg,color:m.role==="user"?"#fff":T.text,fontSize:FS-1,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{m.text}</div>
          </div>)}
          {aiLoading&&<div style={{display:"flex",justifyContent:"flex-end"}}><div style={{padding:"8px 16px",borderRadius:12,background:T.bg,fontSize:FS-1,color:T.textMut,display:"inline-flex",alignItems:"center",gap:8}}><Spinner size="small" inline/><span>جاري التحليل...</span></div></div>}
        </div>
        <div style={{padding:"8px 12px",borderTop:"1px solid "+T.brd,display:"flex",gap:6}}>
          <input value={aiInput} onChange={e=>setAiInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")askAI()}} placeholder="اسأل عن أي حاجة..." style={{flex:1,padding:"8px 12px",borderRadius:10,border:"1px solid "+T.brd,fontSize:FS,fontFamily:"inherit",background:T.bg,color:T.text,outline:"none",boxSizing:"border-box"}}/>
          <button onClick={askAI} disabled={aiLoading||!aiInput.trim()} style={{padding:"8px 14px",borderRadius:10,border:"none",background:aiInput.trim()?"linear-gradient(135deg,#0EA5E9,#8B5CF6)":"#E2E8F0",color:aiInput.trim()?"#fff":"#94A3B8",cursor:aiInput.trim()?"pointer":"default",fontSize:14,fontWeight:700}}>📩</button>
        </div>
      </div>
    </div>}
    {showScanner==="menu"&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowScanner(false)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:420,maxHeight:"85vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:FS+2,fontWeight:800,color:T.accent}}>📷 مسح QR — اختر العملية</div>
          <Btn ghost small onClick={()=>setShowScanner(false)}>✕</Btn>
        </div>
        {[
          {icon:"📷",label:"مسح ذكي (تلقائي)",desc:"التطبيق يتعرف على النوع تلقائياً",color:T.accent,action:()=>setShowScanner(true)},
          {icon:"📋",label:"فتح أوردر",desc:"اسكان QR → تفاصيل الأوردر",color:T.accent,action:()=>setShowScanner(true)},
          {icon:"↙",label:"استلام من ورشة",desc:"اسكان QR ليبل → شاشة الاستلام",color:"#8B5CF6",action:()=>setShowScanner(true)},
          {icon:"🔍",label:"استعلام موديل",desc:"اسكان أي QR → بيانات الموديل",color:"#F59E0B",action:()=>setShowScanner(true)},
          {icon:"🏭",label:"حساب ورشة",desc:"اسكان QR الورشة → الحساب",color:"#0EA5E9",action:()=>setShowScanner(true)},
        ].map(op=><div key={op.label} onClick={op.action} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:12,cursor:"pointer",border:"1px solid "+op.color+"20",marginBottom:6,transition:"background 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background=op.color+"08"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
          <div style={{width:40,height:40,borderRadius:10,background:op.color+"12",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{op.icon}</div>
          <div><div style={{fontWeight:700,fontSize:FS,color:op.color}}>{op.label}</div><div style={{fontSize:FS-2,color:T.textMut}}>{op.desc}</div></div>
        </div>)}
      </div>
    </div>}
    {showScanner===true&&<QRScanner onClose={()=>setShowScanner(false)} onScan={url=>{setShowScanner(false);try{/* Smart scan — detect type */
      if(url.startsWith("CLARK:")){const parts=url.split(":");const orderId=parts[1];const o=orders.find(x=>x.id===orderId);if(o){goD(o.id);showToast("📋 "+o.modelNo);return}}
      try{const j=JSON.parse(url);
        if(j.app==="clark"&&j.type==="pkg"){const pkg=(config.packages||[]).find(p=>p.id===j.id);if(pkg){setTab("custDeliver");setTimeout(()=>{window.__openPkg=j.id;window.dispatchEvent(new Event("open-pkg"))},500);showToast("📦 "+j.num);return}}
        if(j.app==="clark"&&j.type==="prod"){const prod=(config.generalProducts||[]).find(p=>p.id===j.id);if(prod){setTab("warehouse");setTimeout(()=>{window.__openProd=j.id;window.dispatchEvent(new Event("open-prod"))},500);showToast("➕ "+prod.name);return}else{showToast("⚠️ المنتج غير موجود");return}}
      }catch(e2){}
      const u=new URL(url);const p=new URLSearchParams(u.search);if(p.get("o")){const o=orders.find(x=>x.modelNo===p.get("o"));if(o)goD(o.id)}else if(p.get("act")==="rcv"&&p.get("oid")){setTab("external");setTimeout(()=>{window.__qrReceive={oid:p.get("oid"),wdi:Number(p.get("wdi"))||0};window.dispatchEvent(new Event("qr-receive"))},600)}else if(p.get("act")==="stock"&&p.get("oid")){const o=orders.find(x=>x.id===p.get("oid"));if(o){goD(o.id);setTimeout(()=>{window.__qrStock=true;window.dispatchEvent(new Event("qr-stock"))},800)}}else if(p.get("act")==="wsacc"&&p.get("ws")){setTab("external");setTimeout(()=>{window.__qrWsAcc={ws:decodeURIComponent(p.get("ws"))};window.dispatchEvent(new Event("qr-wsacc"))},600)}else{showToast("QR غير معروف")}}catch(e){if(url.startsWith("CLARK:")){const parts=url.split(":");const orderId=parts[1];const o=orders.find(x=>x.id===orderId);if(o){goD(o.id);return}}showToast("QR غير صالح")}}}/>}
    {cardPopup&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setCardPopup(null)}><div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:isMob?500:650,maxHeight:"80vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><div style={{fontSize:FS+2,fontWeight:800,color:cardPopup.color}}>{cardPopup.title}</div><Btn ghost small onClick={()=>setCardPopup(null)} title="إغلاق">✕</Btn></div><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><th style={TH}>البيان</th>{cardPopup.details?.[0]?.desc!==undefined&&<th style={TH}>الوصف</th>}<th style={TH}>الكمية</th></tr></thead><tbody>{(cardPopup.details||[]).map((d,i)=><tr key={i} style={{background:i%2===0?"transparent":T.bg+"80"}}><td style={{...TD,fontWeight:700,color:cardPopup.color}}>{d.model}</td>{d.desc!==undefined&&<td style={TD}>{d.desc}</td>}<td style={{...TD,textAlign:"center",fontWeight:800}}>{fmt(d.qty)}</td></tr>)}<tr style={{background:cardPopup.color+"10"}}><td style={{...TD,fontWeight:800}} colSpan={cardPopup.details?.[0]?.desc!==undefined?2:1}>الاجمالي</td><td style={{...TD,textAlign:"center",fontWeight:800,fontSize:FS+2,color:cardPopup.color}}>{fmt((cardPopup.details||[]).reduce((s,d)=>s+(Number(d.qty)||0),0))}</td></tr></tbody></table></div></div>}
    {labelPopup&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>{setLabelPopup(null);setLabelBags(1)}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:320,border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)",textAlign:"center"}}>
        <div style={{fontSize:18,fontWeight:800,color:T.text,marginBottom:4}}>{"🏷️ "+labelPopup.arrow+" "+labelPopup.title}</div>
        <div style={{fontSize:FS,color:T.textSec,marginBottom:16}}>{labelPopup.modelNo+" — "+labelPopup.piece+" — "+labelPopup.qty+" قطعة"}</div>
        <div style={{marginBottom:12}}><label style={{fontSize:FS,fontWeight:700,color:T.text}}>عدد الأكياس</label><input type="number" value={labelBags} onChange={e=>setLabelBags(Math.max(1,Number(e.target.value)||1))} min="1" style={{display:"block",margin:"8px auto",width:100,textAlign:"center",fontSize:22,fontWeight:800,border:"3px solid "+T.accent,borderRadius:10,padding:"6px",fontFamily:"Cairo",background:T.bg,color:T.text}}/></div>
        <div style={{display:"flex",gap:8,justifyContent:"center"}}>
          <Btn ghost onClick={()=>{setLabelPopup(null);setLabelBags(1)}}>✕ إغلاق</Btn>
          <Btn onClick={()=>{renderLabelPages(labelPopup,labelBags)}} style={{background:T.accent,color:"#fff",border:"none",fontWeight:700}}>{"🖨 طباعة "+labelBags}</Btn>
        </div>
      </div>
    </div>}
    {wsAccPopup&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setWsAccPopup(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:isMob?420:550,maxHeight:"80vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:FS+1,fontWeight:800,color:wsAccPopup.color}}>{wsAccPopup.title}</div>
          <div style={{display:"flex",gap:4}}>
            <Btn small onClick={()=>{const el=document.getElementById("ws-acc-popup-tbl");if(el)printPage(wsAccPopup.title,el.innerHTML)}} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨</Btn>
            <Btn ghost small onClick={()=>setWsAccPopup(null)} title="إغلاق">✕</Btn>
          </div>
        </div>
        <div id="ws-acc-popup-tbl"><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><th style={TH}>#</th><th style={TH}>الورشة</th><th style={TH}>المبلغ</th></tr></thead><tbody>
          {(wsAccPopup.items||[]).map((d,i)=><tr key={i} style={{background:i%2===0?"transparent":T.bg+"80"}}><td style={TD}>{i+1}</td><td style={{...TD,fontWeight:700}}>{d.name}</td><td style={{...TD,textAlign:"center",fontWeight:800,color:d.qty>=0?wsAccPopup.color:T.ok}}>{fmt(d.qty)+" ج.م"}</td></tr>)}
          <tr style={{background:wsAccPopup.color+"10"}}><td style={TD}></td><td style={{...TD,fontWeight:800}}>الاجمالي</td><td style={{...TD,textAlign:"center",fontWeight:800,fontSize:FS+2,color:wsAccPopup.color}}>{fmt(wsAccPopup.total)+" ج.م"}</td></tr>
        </tbody></table></div>
      </div>
    </div>}
    {/* Barcode Print Popup */}
    {barcodePopup&&(()=>{const allOrders=data.orders||[];const ps=data.printSettings||{};const lw=ps.labelWidth||40;const lh=ps.labelHeight||50;const mg=ps.margins||2;const fl=ps.fields||{};
      const selOrder=allOrders.find(o=>o.id===barcodePopup.modelId);const rs=selOrder?Number(selOrder.rackSize)||1:1;
      /* V15.30: Use getSizesFromSet — pcsPerSeries from sizeSets is the SOURCE OF TRUTH for size count */
      const sizeInfo=selOrder?getSizesFromSet(selOrder,data):{sizes:[],expectedCount:0,mismatch:false};
      const sizes=sizeInfo.sizes;
      const sizeMismatch=sizeInfo.mismatch;
      const qtyPerSize=sizes.length>0?Math.floor((selOrder?.cutQty||0)/sizes.length):(selOrder?.cutQty||0);
      const labelsPerSize=rs>0?Math.floor(qtyPerSize/rs):qtyPerSize;
      const totalLabels=sizes.length>0?labelsPerSize*sizes.length:(rs>0?Math.floor((selOrder?.cutQty||0)/rs):(selOrder?.cutQty||0));
      const mode=barcodePopup._mode||"manual";
      const qrMM=Math.min(lw-mg*2,lh-mg*2)-8;
      const buildLabel=(qrText,modelNo,desc,sizeStr,seriesStr)=>{let h="<div class='lbl'>";
        if(fl.brand?.show)h+="<div style='font-weight:900;font-size:"+((fl.brand?.size||14)/2.5)+"mm;letter-spacing:2px;line-height:1'>CLARK</div>";
        if(fl.modelNo?.show!==false)h+="<div style='font-weight:800;font-size:"+((fl.modelNo?.size||12)/2.5)+"mm;line-height:1.1'>"+modelNo+"</div>";
        if(fl.desc?.show)h+="<div style='font-size:"+((fl.desc?.size||10)/2.5)+"mm;color:#444;line-height:1'>"+desc+"</div>";
        if(fl.sizeLabel?.show!==false&&sizeStr)h+="<div style='font-weight:700;font-size:"+((fl.sizeLabel?.size||10)/2.5)+"mm;line-height:1'>"+sizeStr+"</div>";
        if(fl.qr?.show!==false)h+="<div style='flex:1;display:flex;align-items:center;justify-content:center'><img class='qr-img' data-text='"+qrText+"' style='width:"+qrMM+"mm;height:"+qrMM+"mm'/></div>";
        if(fl.series?.show!==false&&seriesStr)h+="<div style='font-weight:700;font-size:"+((fl.series?.size||12)/2.5)+"mm;line-height:1'>"+seriesStr+"</div>";
        if(fl.price?.show&&selOrder?.sellPrice)h+="<div style='font-size:"+((fl.price?.size||10)/2.5)+"mm;line-height:1'>"+selOrder.sellPrice+" ج.م</div>";
        return h+"</div>"};
      const doPrint=(labels)=>{if(labels.length===0)return;
        const qrOpts=JSON.stringify({width:400,margin:ps.qrMargin??1,errorCorrectionLevel:ps.qrLevel||"M",color:{dark:ps.qrColor||"#000000",light:"#ffffff"}});
        const w=openPrintWindow();if(!w){alert("المتصفح بيمنع فتح نافذة الطباعة — فعّل النوافذ المنبثقة");return}w.document.write("<html dir='rtl'><head><title>QR</title><script src='https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js'></"+"script><style>@page{size:"+lw+"mm "+lh+"mm;margin:"+mg+"mm}*{margin:0;padding:0}body{margin:0;padding:0;font-family:'Cairo',Arial,sans-serif}.lbl{width:"+(lw-mg*2)+"mm;height:"+(lh-mg*2)+"mm;page-break-after:always;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;overflow:hidden"+(ps.showBorder?";border:1px dashed #999":"")+"}</style></head><body>"+labels.join("")+"<script>var qrOpts="+qrOpts+";document.querySelectorAll('.qr-img').forEach(function(img){QRCode.toDataURL(img.dataset.text,qrOpts).then(function(url){img.src=url}).catch(function(){})});setTimeout(function(){window.print()},800)</"+"script></body></html>");w.document.close();
        showToast("✓ تم تجهيز "+labels.length+" ليبل")};
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setBarcodePopup(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:450,minHeight:"60vh",maxHeight:"95vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:FS+2,fontWeight:800,color:"#F59E0B"}}>🏷️ طباعة QR</div>
            <Btn ghost small onClick={()=>setBarcodePopup(null)}>✕</Btn>
          </div>
          <div style={{marginBottom:10}}><label style={{fontSize:FS-2,color:T.textSec}}>اختر الموديل</label><SearchSel value={barcodePopup.modelId||""} onChange={v=>setBarcodePopup(p=>({...p,modelId:v,_size:"",_qty:1}))} options={allOrders.map(o=>({value:o.id,label:o.modelNo+" — "+(o.modelDesc||"")}))} placeholder="اختر الموديل..."/></div>
          {selOrder&&<div style={{textAlign:"center",padding:8,background:T.bg+"60",borderRadius:10,marginBottom:10}}>
            <div style={{fontWeight:800,fontSize:FS+1,color:T.accent}}>{selOrder.modelNo}</div>
            <div style={{fontSize:FS-1,color:T.textMut}}>{selOrder.modelDesc}</div>
            <div style={{fontSize:FS-2,color:T.textSec,marginTop:2}}>{"القص: "+(selOrder.cutQty||0)+" | المقاسات: "+(sizes.join(" | ")||"—")+" | سيري: "+rs}</div>
            {sizeMismatch&&<div style={{marginTop:8,padding:"6px 10px",background:"#F59E0B15",border:"1px solid #F59E0B40",borderRadius:8,fontSize:FS-2,color:"#B45309",fontWeight:600,lineHeight:1.5}}>⚠️ عدد الأسماء في الـ label لا يطابق قطع السيري ({sizeInfo.expectedCount}). راجع كارت المقاسات في قاعدة البيانات.</div>}
          </div>}
          <div style={{display:"flex",gap:4,marginBottom:12,borderRadius:10,border:"1px solid "+T.brd,overflow:"hidden"}}>
            <div onClick={()=>setBarcodePopup(p=>({...p,_mode:"manual"}))} style={{flex:1,textAlign:"center",padding:"8px 0",fontWeight:700,fontSize:FS-1,cursor:"pointer",background:mode==="manual"?"#F59E0B":"transparent",color:mode==="manual"?"#fff":T.textSec}}>يدوية</div>
            <div onClick={()=>setBarcodePopup(p=>({...p,_mode:"series"}))} style={{flex:1,textAlign:"center",padding:"8px 0",fontWeight:700,fontSize:FS-1,cursor:"pointer",background:mode==="series"?"#F59E0B":"transparent",color:mode==="series"?"#fff":T.textSec}}>سيري</div>
            <div onClick={()=>setBarcodePopup(p=>({...p,_mode:"auto"}))} style={{flex:1,textAlign:"center",padding:"8px 0",fontWeight:700,fontSize:FS-1,cursor:"pointer",background:mode==="auto"?"#F59E0B":"transparent",color:mode==="auto"?"#fff":T.textSec}}>تلقائية</div>
            <div onClick={()=>setBarcodePopup(p=>({...p,_mode:"piece"}))} style={{flex:1,textAlign:"center",padding:"8px 0",fontWeight:700,fontSize:FS-1,cursor:"pointer",background:mode==="piece"?"#8B5CF6":"transparent",color:mode==="piece"?"#fff":T.textSec}} title="قطعة واحدة — للكسور">قطعة</div>
          </div>
          {/* V14.59: Single piece QR mode — for fractional pieces less than a full rack */}
          {mode==="piece"&&<div>
            {selOrder?<div>
              <div style={{padding:12,borderRadius:10,background:"#8B5CF608",border:"1px solid #8B5CF625",marginBottom:12,fontSize:FS-1,color:T.text,lineHeight:1.7}}>
                <b style={{color:"#8B5CF6"}}>💡 ليبل قطعة واحدة:</b> يستخدم للكسور (قطع منفردة أقل من سيري كامل). كل ليبل يمسح على أنه قطعة واحدة فقط.
              </div>
              <div style={{marginBottom:12}}><label style={{fontSize:FS,fontWeight:700,color:T.text}}>عدد القطع المنفردة</label><input type="number" value={barcodePopup._pieceQty!=null?barcodePopup._pieceQty:1} onChange={e=>setBarcodePopup(p=>({...p,_pieceQty:Math.max(1,Number(e.target.value)||1)}))} style={{display:"block",margin:"8px auto",width:120,textAlign:"center",fontSize:24,fontWeight:800,border:"3px solid #8B5CF6",borderRadius:10,padding:"8px",fontFamily:"Cairo",background:T.bg,color:T.text}}/></div>
              {sizes.length>0&&<div style={{marginBottom:10}}><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>المقاس (اختياري)</label>
                <select value={barcodePopup._pieceSize||""} onChange={e=>setBarcodePopup(p=>({...p,_pieceSize:e.target.value}))} style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid "+T.brd,fontSize:FS,fontFamily:"inherit",background:T.inputBg,color:T.text,marginTop:4}}>
                  <option value="">— بدون مقاس محدد —</option>
                  {sizes.map(sz=><option key={sz} value={sz}>{sz}</option>)}
                </select>
              </div>}
              <Btn onClick={()=>{if(!selOrder){showToast("⚠️ اختر موديل");return}
                const qty=barcodePopup._pieceQty||1;
                const qrText="CLARK:"+selOrder.id+":1";/* ← KEY: always ":1" for single piece */
                const sz=barcodePopup._pieceSize||"";
                const labels=[];
                for(let i=0;i<qty;i++)labels.push(buildLabel(qrText,selOrder.modelNo,selOrder.modelDesc||"",sz?"مقاس: "+sz:"","🔹 قطعة"));
                doPrint(labels);
              }} style={{background:"#8B5CF6",color:"#fff",border:"none",fontWeight:700,width:"100%"}}>{"🖨 طباعة "+(barcodePopup._pieceQty||1)+" ليبل قطعة"}</Btn>
            </div>
            :<div style={{padding:20,textAlign:"center",color:T.textMut}}>اختر موديل أولاً</div>}
          </div>}
          {mode==="manual"&&<div>
            {selOrder?<div>
              {sizes.length>0?<div>
                <div style={{fontSize:FS-1,fontWeight:700,color:T.textSec,marginBottom:8}}>ادخل عدد الليبلات لكل مقاس</div>
                <table style={{width:"100%",borderCollapse:"collapse",marginBottom:10}}><thead><tr><th style={{...TH,fontSize:FS-2,textAlign:"center"}}>المقاس</th><th style={{...TH,fontSize:FS-2,textAlign:"center"}}>عدد الليبلات</th></tr></thead><tbody>
                  {sizes.map(sz=>{const val=(barcodePopup._manualSizes||{})[sz]||0;return<tr key={sz}><td style={{...TD,fontWeight:700,textAlign:"center",fontSize:FS+1}}>{sz}</td>
                    <td style={{...TD,textAlign:"center",padding:2}}><input type="number" value={val||""} onChange={e=>{const v=Math.max(0,Number(e.target.value)||0);setBarcodePopup(p=>({...p,_manualSizes:{...(p._manualSizes||{}),[sz]:v}}))}} style={{width:70,textAlign:"center",border:"2px solid "+T.accent,borderRadius:6,padding:"4px",fontSize:FS+1,fontWeight:700,fontFamily:"inherit",background:T.bg,color:T.text}} placeholder="0"/></td></tr>})}
                  <tr style={{background:"#F59E0B10"}}><td style={{...TD,fontWeight:800}}>الاجمالي</td><td style={{...TD,textAlign:"center",fontWeight:800,color:"#F59E0B"}}>{sizes.reduce((s,sz)=>s+((barcodePopup._manualSizes||{})[sz]||0),0)+" ليبل"}</td></tr>
                </tbody></table>
                <Btn onClick={()=>{const ms=barcodePopup._manualSizes||{};const labels=[];
                  sizes.forEach(sz=>{const count=ms[sz]||0;for(let i=0;i<count;i++){const qrText="CLARK:"+selOrder.id+":"+rs;labels.push(buildLabel(qrText,selOrder.modelNo,selOrder.modelDesc||"","مقاس: "+sz,"سيري: "+rs))}});
                  if(labels.length===0){showToast("⚠️ ادخل كمية واحدة على الأقل");return}doPrint(labels)}} style={{background:"#F59E0B",color:"#fff",border:"none",fontWeight:700,width:"100%"}}>{"🖨 طباعة "+sizes.reduce((s,sz)=>s+((barcodePopup._manualSizes||{})[sz]||0),0)+" ليبل"}</Btn>
              </div>
              :<div>
                <div style={{marginBottom:10}}><label style={{fontSize:FS-2,color:T.textSec}}>{"عدد الليبلات (كل ليبل = "+rs+" قطع)"}</label><Inp type="number" value={barcodePopup._qty||1} onChange={v=>setBarcodePopup(p=>({...p,_qty:Math.max(1,Number(v)||1)}))}/></div>
                <Btn onClick={()=>{if(!selOrder){showToast("⚠️ اختر موديل");return}const qty=barcodePopup._qty||1;const qrText="CLARK:"+selOrder.id+":"+rs;const labels=[];
                  for(let i=0;i<qty;i++)labels.push(buildLabel(qrText,selOrder.modelNo,selOrder.modelDesc||"","","سيري: "+rs));
                  doPrint(labels)}} style={{background:"#F59E0B",color:"#fff",border:"none",fontWeight:700,width:"100%"}}>{"🖨 طباعة "+(barcodePopup._qty||1)+" ليبل"}</Btn>
              </div>}
            </div>:<div style={{textAlign:"center",padding:20,color:T.textMut}}>اختر موديل أولاً</div>}
          </div>}
          {mode==="series"&&<div>
            {selOrder?<div style={{textAlign:"center"}}>
              <div style={{padding:12,background:T.bg+"60",borderRadius:10,marginBottom:12}}>
                <div style={{fontSize:FS,fontWeight:700,color:T.textSec,marginBottom:4}}>كل ليبل = سيري كامل</div>
                <div style={{fontSize:FS+2,fontWeight:800,color:"#F59E0B"}}>{sizes.length>0?"مقاسات: "+sizes.join(" - "):"سيري: "+rs}</div>
                <div style={{fontSize:FS-1,color:T.textMut,marginTop:4}}>{"كل ليبل = "+(sizes.length>0?sizes.length*rs:rs)+" قطعة"}</div>
              </div>
              <div style={{marginBottom:12}}><label style={{fontSize:FS,fontWeight:700,color:T.text}}>عدد السيريهات</label><input type="number" value={barcodePopup._seriesQty!=null?barcodePopup._seriesQty:labelsPerSize||1} onChange={e=>setBarcodePopup(p=>({...p,_seriesQty:Math.max(1,Number(e.target.value)||1)}))} style={{display:"block",margin:"8px auto",width:120,textAlign:"center",fontSize:24,fontWeight:800,border:"3px solid #F59E0B",borderRadius:10,padding:"8px",fontFamily:"Cairo",background:T.bg,color:T.text}}/></div>
              <Btn onClick={()=>{const qty=barcodePopup._seriesQty!=null?barcodePopup._seriesQty:labelsPerSize||1;const fullQty=sizes.length>0?sizes.length*rs:rs;const qrText="CLARK:"+selOrder.id+":"+fullQty;const labels=[];
                const sizeText=sizes.length>0?"مقاسات: "+sizes.join("-"):"";
                for(let i=0;i<qty;i++)labels.push(buildLabel(qrText,selOrder.modelNo,selOrder.modelDesc||"",sizeText,"سيري: "+fullQty));
                doPrint(labels)}} style={{background:"#F59E0B",color:"#fff",border:"none",fontWeight:700,width:"100%"}}>{"🖨 طباعة "+(barcodePopup._seriesQty!=null?barcodePopup._seriesQty:labelsPerSize||1)+" ليبل سيري"}</Btn>
            </div>:<div style={{textAlign:"center",padding:20,color:T.textMut}}>اختر موديل أولاً</div>}
          </div>}
          {mode==="auto"&&<div>
            {selOrder?<div>
              <div style={{padding:10,background:T.bg+"60",borderRadius:10,marginBottom:10}}>
                {sizes.length>0?<table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><th style={{...TH,fontSize:FS-2}}>المقاس</th><th style={{...TH,fontSize:FS-2}}>الكمية</th><th style={{...TH,fontSize:FS-2}}>سيريهات</th><th style={{...TH,fontSize:FS-2}}>ليبلات</th></tr></thead><tbody>
                  {sizes.map(sz=><tr key={sz}><td style={{...TD,fontWeight:700,textAlign:"center"}}>{sz}</td><td style={{...TD,textAlign:"center"}}>{qtyPerSize}</td><td style={{...TD,textAlign:"center"}}>{labelsPerSize}</td><td style={{...TD,textAlign:"center",fontWeight:700,color:"#F59E0B"}}>{labelsPerSize}</td></tr>)}
                  <tr style={{background:"#F59E0B10"}}><td style={{...TD,fontWeight:800}}>الاجمالي</td><td style={{...TD,textAlign:"center",fontWeight:800}}>{qtyPerSize*sizes.length}</td><td style={{...TD,textAlign:"center",fontWeight:800}}>{totalLabels}</td><td style={{...TD,textAlign:"center",fontWeight:800,color:"#F59E0B"}}>{totalLabels}</td></tr>
                </tbody></table>
                :<div style={{textAlign:"center",color:T.textMut,padding:10}}>{"سيتم طباعة "+totalLabels+" ليبل (كل ليبل = سيري "+rs+" قطع)"}</div>}
                <div style={{textAlign:"center",fontSize:FS-2,color:T.textMut,marginTop:6}}>{"كل ليبل = سيري واحد ("+rs+" قطع) — المقاس للفرز فقط"}</div>
              </div>
              <Btn onClick={()=>{const labels=[];const qrText="CLARK:"+selOrder.id+":"+rs;
                if(sizes.length>0){sizes.forEach(sz=>{for(let i=0;i<labelsPerSize;i++)labels.push(buildLabel(qrText,selOrder.modelNo,selOrder.modelDesc||"","مقاس: "+sz,"سيري: "+rs))})}
                else{for(let i=0;i<totalLabels;i++)labels.push(buildLabel(qrText,selOrder.modelNo,selOrder.modelDesc||"","","سيري: "+rs))}
                doPrint(labels)}} style={{background:"#F59E0B",color:"#fff",border:"none",fontWeight:700,width:"100%"}}>{"🖨 طباعة "+totalLabels+" ليبل ("+totalLabels*rs+" قطعة)"}</Btn>
            </div>:<div style={{textAlign:"center",padding:20,color:T.textMut}}>اختر موديل أولاً</div>}
          </div>}
        </div>
      </div>})()}
    {/* ══ SAVING OVERLAY ══ */}
    {savingOverlay&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",backdropFilter:"blur(4px)",zIndex:999999,display:"flex",alignItems:"center",justifyContent:"center",direction:"rtl",fontFamily:"'Cairo',sans-serif"}}>
      <div style={{background:T.cardSolid,borderRadius:20,padding:"32px 40px",textAlign:"center",minWidth:280,boxShadow:"0 20px 60px rgba(0,0,0,0.3)",border:"1px solid "+T.brd}}>
        <div style={{display:"flex",justifyContent:"center",marginBottom:16}}>
          <Spinner size="large" color={T.accent}/>
        </div>
        <div style={{fontSize:FS+1,fontWeight:800,color:T.text,marginBottom:8}}>{savingOverlay.message||"جاري الحفظ..."}</div>
        {savingOverlay.progress!=null&&<div style={{height:8,borderRadius:4,background:T.bg,overflow:"hidden",margin:"12px 0"}}>
          <div style={{height:"100%",borderRadius:4,background:"linear-gradient(90deg,"+T.accent+","+T.ok+")",width:savingOverlay.progress+"%",transition:"width 0.4s ease"}}/>
        </div>}
        <div style={{fontSize:FS-2,color:T.textMut}}>برجاء الانتظار وعدم اغلاق الصفحة</div>
      </div>
    </div>}
  </div>
}

