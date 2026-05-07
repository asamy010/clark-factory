/* ═══════════════════════════════════════════════════════════════
   CLARK - DetPg.jsx
   
   Extracted from App.jsx in V15.1 phase 3.
   Contains: DetPg
   ═══════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from "react";
import { Badge, Btn, Card, DelBtn, FCTable, Inp, MetricCard, SearchSel, Sel, Timeline } from "../components/ui.jsx";
import { DEFAULT_STATUSES, FCOL, FKEYS, FS } from "../constants/index.js";
import { T, TD, TDB, TDL, TH } from "../theme.js";
import { fmt, gIcon, gc, gcons, gdate, gf, gid, r2, slay, sqty, openWA } from "../utils/format.js";
import { nowISO, cairoDateStr } from "../utils/serverTime.js";
import { calcOrder, detectQtyMismatch, getConfirmedStock, getOrderDetails, getOrderTimeline, getPieceCutQty, getStageIndex, mkOrder, planCutSync, PRODUCTION_STAGES, recomputeStatus, sortOrders, wsIsInternal, wsTypeInfo } from "../utils/orders.js";
import { addAudit } from "../utils/audit.js";
import { ask, highlightRow, showToast } from "../utils/popups.js";
import { printLabel, printOrderSheet, printReceipt, printWorkshopReport } from "../utils/print-extras.js";
import { uploadMultiple, deleteAttachment, getFileIcon, formatFileSize, isAllowedFile, MAX_FILE_SIZE } from "../utils/attachments.js";
/* V19.36: clean up the model image's Storage object when the user deletes the image */
import { deleteOrderImage } from "../utils/orderImages.js";
import { OrdForm } from "./OrdForm.jsx";
import { ReviewRequestModal } from "../components/ReviewRequestModal.jsx";
import { ReviewRequestBanner } from "../components/ReviewRequestBanner.jsx";
import { StageProgressModal } from "../components/StageProgressModal.jsx";
import { DefaultModelImg } from "../components/DefaultModelImg.jsx";

export function DetPg({data,updOrder,replaceOrder,addOrder,delOrder,sel,setSel,isMob,isTab,canEdit,statusCards,goHome,upConfig,user}){
  const order=data.orders.find(o=>o.id===sel);const[editing,setEditing]=useState(false);
  const userName=user?.displayName||user?.email?.split("@")[0]||"";
  const[detQ,setDetQ]=useState("");const[detSt,setDetSt]=useState("الكل");const[waSent,setWaSent]=useState({});const[waPopup,setWaPopup]=useState(null);
  /* V18.90: Review request modal toggle */
  const[showReview,setShowReview]=useState(false);
  /* V14.50: view mode + smart filters */
  const[detView,setDetView]=useState(()=>{try{return localStorage.getItem("clark_det_view")||"cards"}catch(e){return"cards"}});/* "cards"|"table" */
  const[detWs,setDetWs]=useState("");/* workshop filter */
  const[detSort,setDetSort]=useState("recent");/* recent|oldest|qty|cost|name */
  /* V14.51: expandable workshop timelines + print dropdown */
  const[wsExpand,setWsExpand]=useState({});/* {wsKey: bool} - auto-open for incomplete */
  const[showPrintMenu,setShowPrintMenu]=useState(false);
  const[printWsName,setPrintWsName]=useState("");
  const[editStockIdx,setEditStockIdx]=useState(null);
  const[settReason,setSettReason]=useState("");const[settNotes,setSettNotes]=useState("");
  /* V15.10: Extra cost popup state — tracks form fields for adding/editing additional costs */
  const[extraCostPopup,setExtraCostPopup]=useState(null);/* {editId?, category, customReason, amount, date, notes} */
  const[stageProgressOrder,setStageProgressOrder]=useState(null);/* V19.0: order to show in stage-progress modal */
  const[showNew,setShowNew]=useState(false);
  /* V16.37: mobile-only overflow menu — collapses secondary actions into a list */
  const[showActionsMenu,setShowActionsMenu]=useState(false);
  const[dupInit,setDupInit]=useState(null);
  const[showDeliver,setShowDeliver]=useState(false);
  /* V15.45: Cut/workshop sync state */
  const[syncPopup,setSyncPopup]=useState(null);/* null | {plan, m, manual:{wdIdx:qty}} */
  /* V16.24: per-piece cut quantity edit popup */
  const[pieceCutPopup,setPieceCutPopup]=useState(null);/* null | {draft:{piece:qty}} */
  const[editStatusMode,setEditStatusMode]=useState(false);
  const[dWs,setDWs]=useState("");const[dType,setDType]=useState("");const[dQty,setDQty]=useState(0);const[dPrice,setDPrice]=useState("");const[dNote,setDNote]=useState("");const[dDate,setDDate]=useState(new Date().toISOString().split("T")[0]);const[dAgreed,setDAgreed]=useState("");
  const statuses=(statusCards||DEFAULT_STATUSES).map(s=>s.name);
  const workshops=data.workshops||[];
  const customers=data.customers||[];
  /* V16.16: collapsible sales-to-customers section on order detail card */
  const[salesExpand,setSalesExpand]=useState(false);
  /* V19.79.0: redesigned detail view — tab navigation persisted in localStorage */
  const[activeTab,setActiveTab]=useState(()=>{try{return localStorage.getItem("clark_det_tab")||"fabrics"}catch(e){return"fabrics"}});
  useEffect(()=>{try{localStorage.setItem("clark_det_tab",activeTab)}catch(e){}},[activeTab]);
  /* V19.80.5: click model image to open a 3:4 portrait zoom modal. The image
     URL is the same Firebase Storage URL already shown in the cell, so the
     cache-first SW (V19.80.2) means the zoom shows instantly without a
     re-download. Esc or backdrop click closes. */
  const[imgZoom,setImgZoom]=useState(false);
  useEffect(()=>{if(!imgZoom)return;const h=e=>{if(e.key==="Escape")setImgZoom(false)};document.addEventListener("keydown",h);return()=>document.removeEventListener("keydown",h)},[imgZoom]);
  const isInternal=(name)=>{const w=workshops.find(x=>x.name===name);return w?wsIsInternal(w.type):false};
  /* V16.26: keep a fresh ref to data so the QR-stock listener can read the
     latest order even when sel hasn't changed (effect captures closures). */
  const dataRef=useRef(data);
  useEffect(()=>{dataRef.current=data},[data]);
  /* V16.26: QR-stock listener — uses dataRef to avoid stale closure on order.
     Captures the deliveries length BEFORE the push so the new item's index
     is deterministic regardless of how long the state update takes. */
  useEffect(()=>{
    const h=()=>{
      if(!window.__qrStock)return;
      const currentOrder=dataRef.current.orders.find(o=>o.id===sel);
      if(!currentOrder)return;
      delete window.__qrStock;
      const newIdx=(currentOrder.deliveries||[]).length;/* index after push */
      updOrder(sel,o=>{if(!o.deliveries)o.deliveries=[];o.deliveries.push({date:new Date().toISOString().split("T")[0],qty:0,notes:"",createdBy:userName||"",status:"pending"})});
      setTimeout(()=>{
        setEditStockIdx(newIdx);
        setTimeout(()=>{const inp=document.querySelector("#stock-qty-input-wrap input");if(inp)inp.focus()},300);
      },200);
    };
    window.addEventListener("qr-stock",h);
    return()=>window.removeEventListener("qr-stock",h);
  },[sel]);// eslint-disable-line react-hooks/exhaustive-deps

  /* V19.80.2: pre-fetch the adjacent orders' images so prev/next navigation
     shows the image instantly. Combined with the cache-first SW for images,
     the browser already has the bytes by the time the user clicks the arrow. */
  useEffect(()=>{
    if(!sel)return;
    const sortedIds=sortOrders(data.orders).map(o=>o.id);
    const curIdx=sortedIds.indexOf(sel);
    const prefetchIds=[];
    if(curIdx>0)prefetchIds.push(sortedIds[curIdx-1]);
    if(curIdx<sortedIds.length-1)prefetchIds.push(sortedIds[curIdx+1]);
    if(curIdx>1)prefetchIds.push(sortedIds[curIdx-2]);
    if(curIdx<sortedIds.length-2)prefetchIds.push(sortedIds[curIdx+2]);
    prefetchIds.forEach(id=>{
      const o=data.orders.find(x=>x.id===id);
      if(o&&o.image){const img=new Image();img.src=o.image;}
    });
  },[sel,data.orders.length]);
  /* V19.80.8: bulk-prefetch ALL orders' model images during browser idle time.
     The user complained that opening order details still showed a loading flash.
     Reason: only orders that had been visible (and lazy-loaded) in the list grid
     were in the cache; clicking an order the user hadn't scrolled to triggered
     a fresh Firebase Storage fetch (~200-500ms). This effect dispatches new
     Image() requests in idle callbacks, populating the cache-first SW image
     cache (clark-images-v1) with every model image. Subsequent clicks are
     guaranteed instant. The prefetched-URL set persists across renders so we
     never re-issue a request for an already-prefetched image. */
  const prefetchedRef=useRef(new Set());
  useEffect(()=>{
    if(!Array.isArray(data?.orders)||data.orders.length===0)return;
    const idleCb=window.requestIdleCallback||((cb)=>setTimeout(()=>cb({timeRemaining:()=>50,didTimeout:false}),300));
    const cancelIdle=window.cancelIdleCallback||clearTimeout;
    let cancelled=false;
    /* Newest first — most likely to be opened soon. */
    const queue=[...data.orders].reverse().map(o=>o.image).filter(Boolean).filter(u=>!prefetchedRef.current.has(u));
    let handle;
    const processNext=(deadline)=>{
      if(cancelled)return;
      while(queue.length>0&&deadline.timeRemaining()>5){
        const url=queue.shift();
        if(!prefetchedRef.current.has(url)){
          prefetchedRef.current.add(url);
          const img=new Image();
          img.src=url;
        }
      }
      if(queue.length>0)handle=idleCb(processNext,{timeout:2000});
    };
    handle=idleCb(processNext,{timeout:2000});
    return()=>{
      cancelled=true;
      if(handle)try{cancelIdle(handle)}catch(_){}
    };
  },[data?.orders?.length]);

  if(dupInit)return<OrdForm data={data} initial={dupInit} onSave={o=>{addOrder(o);setDupInit(null);showToast("✓ تم تكرار الأوردر")}} onCancel={()=>setDupInit(null)} isMob={isMob} statusCards={statusCards} upConfig={upConfig}/>;
  if(showNew)return<OrdForm data={data} initial={mkOrder()} onSave={o=>{addOrder(o);setShowNew(false);showToast("✓ تم اضافة أمر القص")}} onCancel={()=>setShowNew(false)} isMob={isMob} statusCards={statusCards} upConfig={upConfig}/>;

  if(!order){
    const filtered=data.orders.filter(o=>{
      if(detSt==="⚠️"){const _now=new Date();let _ld=o.date;(o.workshopDeliveries||[]).forEach(wd=>{if(wd.date>_ld)_ld=wd.date;(wd.receives||[]).forEach(r=>{if(r.date>_ld)_ld=r.date})});(o.deliveries||[]).forEach(d=>{if(d.date>_ld)_ld=d.date});if(Math.floor((_now-new Date(_ld))/(1000*60*60*24))<=7||o.status==="تم التسليم لمخزن الجاهز")return false}
      if(detSt!=="الكل"&&detSt!=="⚠️"&&o.status!==detSt)return false;
      if(detWs){const wds=o.workshopDeliveries||[];if(!wds.some(wd=>wd.wsName===detWs))return false}
      if(detQ.trim()){const s=detQ.trim().toLowerCase();const h=[o.modelNo,o.modelDesc,o.sizeLabel,o.status,o.poNumber].filter(Boolean).join(" ").toLowerCase();if(!h.includes(s))return false}
      return true
    });
    return<div>
      <style>{`
        .det-tile{transition:all 0.2s cubic-bezier(0.4,0,0.2,1);cursor:pointer}
        .det-tile:hover{transform:translateY(-3px);box-shadow:0 10px 30px -8px rgba(0,0,0,0.12);border-color:${T.accent}40!important}
        .det-stat-tile{transition:all 0.15s ease;cursor:default}
        .det-stat-tile.clickable{cursor:pointer}
        .det-stat-tile.clickable:hover{transform:translateY(-2px);box-shadow:0 6px 16px -4px rgba(0,0,0,0.08)}
        .det-chip{cursor:pointer;transition:all 0.15s ease;user-select:none;white-space:nowrap}
        .det-chip:hover{transform:translateY(-1px)}
        .det-chip.active{box-shadow:0 2px 8px -2px currentColor}
        .det-section-title{font-size:${FS-1}px;font-weight:800;color:${T.textSec};margin:0 0 10px;padding:0 4px;display:flex;align-items:center;gap:8px;text-transform:uppercase;letter-spacing:0.5px}
        .det-section-title::after{content:"";flex:1;height:1px;background:linear-gradient(to left,${T.brd},transparent);margin-right:4px}
        .det-progress-bar{height:6px;border-radius:3px;background:${T.bg};overflow:hidden;position:relative}
        .det-progress-fill{height:100%;border-radius:3px;transition:width 0.8s cubic-bezier(0.4,0,0.2,1)}
        .det-row:hover{background:${T.accent}06!important}
        .det-view-btn{padding:6px 12px;border-radius:8px;cursor:pointer;transition:all 0.15s;display:flex;align-items:center;gap:6px;font-size:${FS-2}px;font-weight:700;border:1px solid ${T.brd}}
        .det-view-btn.active{background:${T.accent};color:#fff;border-color:${T.accent}}
        .det-view-btn:not(.active){background:${T.cardSolid};color:${T.textSec}}
      `}</style>

      {/* ═══════════════════════════════════════════════════════════════
          1. HERO HEADER — Title + Add button
         ═══════════════════════════════════════════════════════════════ */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
        <div>
          <h2 style={{fontSize:isMob?FS+3:FS+6,fontWeight:900,margin:0,color:T.text,letterSpacing:"-0.5px"}}>أوامر القص</h2>
          <div style={{fontSize:FS-1,color:T.textSec,marginTop:2}}>إدارة أوامر الإنتاج والتسليم</div>
        </div>
        {canEdit&&<Btn primary onClick={()=>setShowNew(true)} style={{display:"flex",alignItems:"center",gap:6}}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <span>أمر قص جديد</span>
        </Btn>}
      </div>

      {/* V19.67: HERO STATS (4 KPI cards) removed per user request — clean layout.
          The status chips row below still surfaces الكل/متأخر/per-status counts. */}

      {/* ═══════════════════════════════════════════════════════════════
          2. SEARCH + FILTERS BAR
         ═══════════════════════════════════════════════════════════════ */}
      <div style={{background:T.cardSolid,borderRadius:14,border:"1px solid "+T.brd,padding:14,marginBottom:14}}>
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"2fr 1fr 1fr 1fr",gap:8,marginBottom:10}}>
          <div style={{position:"relative",display:"flex",alignItems:"center",background:T.cardSolid,borderRadius:6,border:"1px solid "+T.brd}}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,marginInlineStart:10,marginInlineEnd:6,color:T.textMut,pointerEvents:"none"}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input value={detQ==null?"":detQ} onChange={e=>setDetQ(e.target.value)} placeholder="ابحث بالرقم، الوصف، المقاس..." style={{flex:1,minWidth:0,padding:"5px 8px 5px 0",border:"none",outline:"none",fontSize:FS,fontFamily:"inherit",background:"transparent",color:T.text,boxSizing:"border-box"}}/>
          </div>
          <Sel value={detSt} onChange={setDetSt}><option value="الكل">كل الحالات</option>{statuses.map(s=><option key={s} value={s}>{s}</option>)}</Sel>
          <Sel value={detWs} onChange={setDetWs}><option value="">كل الورش</option>{workshops.map(w=><option key={w.id} value={w.name}>{w.name}</option>)}</Sel>
          <Sel value={detSort} onChange={setDetSort}>
            <option value="recent">🕐 الأحدث أولاً</option>
            <option value="oldest">📅 الأقدم أولاً</option>
            <option value="qty">📊 الكمية الأكبر</option>
            <option value="name">🔤 اسم الموديل</option>
          </Sel>
        </div>

        {/* Status chips row */}
        {(()=>{const counts={};statuses.forEach(s=>{counts[s]=data.orders.filter(o=>o.status===s).length});
          const lateOrders=data.orders.filter(o=>{if(o.status==="تم التسليم لمخزن الجاهز")return false;const _now=new Date();let _ld=o.date;(o.workshopDeliveries||[]).forEach(wd=>{if(wd.date>_ld)_ld=wd.date;(wd.receives||[]).forEach(r=>{if(r.date>_ld)_ld=r.date})});(o.deliveries||[]).forEach(d=>{if(d.date>_ld)_ld=d.date});return Math.floor((_now-new Date(_ld))/(1000*60*60*24))>7});
          return<div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <span onClick={()=>setDetSt("الكل")} className={"det-chip"+(detSt==="الكل"?" active":"")} style={{padding:"5px 12px",borderRadius:20,background:detSt==="الكل"?T.accent:T.bg,border:"1px solid "+(detSt==="الكل"?T.accent:T.brd),fontSize:FS-2,fontWeight:700,color:detSt==="الكل"?"#fff":T.textSec,display:"inline-flex",alignItems:"center",gap:5}}>
              <span>الكل</span><span style={{fontSize:FS-3,opacity:0.9}}>{data.orders.length}</span>
            </span>
            {statuses.filter(s=>counts[s]>0).map(s=>{const sc=(statusCards||[]).find(x=>x.name===s);const color=sc?.color||T.accent;
              return<span key={s} onClick={()=>setDetSt(detSt===s?"الكل":s)} className={"det-chip"+(detSt===s?" active":"")} style={{padding:"5px 12px",borderRadius:20,background:detSt===s?color:color+"12",border:"1px solid "+(detSt===s?color:color+"30"),fontSize:FS-2,fontWeight:700,color:detSt===s?"#fff":color,display:"inline-flex",alignItems:"center",gap:5}}>
                <span>{s}</span><span style={{fontSize:FS-3,opacity:0.9}}>{counts[s]}</span>
              </span>;
            })}
            {lateOrders.length>0&&<span onClick={()=>setDetSt(detSt==="⚠️"?"الكل":"⚠️")} className={"det-chip"+(detSt==="⚠️"?" active":"")} style={{padding:"5px 12px",borderRadius:20,background:detSt==="⚠️"?T.err:T.err+"12",border:"1px solid "+(detSt==="⚠️"?T.err:T.err+"30"),fontSize:FS-2,fontWeight:700,color:detSt==="⚠️"?"#fff":T.err,display:"inline-flex",alignItems:"center",gap:5}}>
              <span>⚠️ متأخر</span><span style={{fontSize:FS-3,opacity:0.9}}>{lateOrders.length}</span>
            </span>}
          </div>;
        })()}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          4. VIEW TOGGLE + RESULT COUNT
         ═══════════════════════════════════════════════════════════════ */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
        <div style={{fontSize:FS-1,color:T.textSec,fontWeight:600}}>
          <span style={{color:T.text,fontWeight:800}}>{filtered.length}</span>
          <span> من </span>
          <span>{data.orders.length}</span>
          <span> أمر</span>
        </div>
        <div style={{display:"flex",gap:4,padding:3,background:T.bg,borderRadius:10,border:"1px solid "+T.brd}}>
          <div onClick={()=>{setDetView("cards");try{localStorage.setItem("clark_det_view","cards")}catch(e){}}} className={"det-view-btn"+(detView==="cards"?" active":"")} style={{border:"none"}}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            <span>بطاقات</span>
          </div>
          <div onClick={()=>{setDetView("table");try{localStorage.setItem("clark_det_view","table")}catch(e){}}} className={"det-view-btn"+(detView==="table"?" active":"")} style={{border:"none"}}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            <span>جدول</span>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          5. EMPTY STATE or RESULTS
         ═══════════════════════════════════════════════════════════════ */}
      {filtered.length===0?<div style={{background:T.cardSolid,borderRadius:14,border:"1px dashed "+T.brd,padding:"50px 20px",textAlign:"center"}}>
        <div style={{fontSize:56,marginBottom:12,opacity:0.3}}>
          {data.orders.length===0?"✂️":"🔍"}
        </div>
        <div style={{fontSize:FS+2,fontWeight:800,color:T.text,marginBottom:6}}>
          {data.orders.length===0?"لا توجد أوامر قص بعد":"لا توجد نتائج"}
        </div>
        <div style={{fontSize:FS-1,color:T.textMut,marginBottom:16}}>
          {data.orders.length===0?"ابدأ بإضافة أول أمر قص للمصنع":"جرب تعديل الفلاتر أو البحث"}
        </div>
        {data.orders.length===0&&canEdit&&<Btn primary onClick={()=>setShowNew(true)} style={{padding:"10px 22px",fontSize:FS}}>+ أمر قص جديد</Btn>}
      </div>:null}

      {/* ═══════════════════════════════════════════════════════════════
          6A. TABLE VIEW
         ═══════════════════════════════════════════════════════════════ */}
      {filtered.length>0&&detView==="table"&&<div style={{background:T.cardSolid,borderRadius:14,border:"1px solid "+T.brd,overflow:"hidden"}}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:FS-1}}>
            <thead style={{background:T.bg}}>
              <tr>
                <th style={{...TH,textAlign:"right",paddingRight:16}}>الموديل</th>
                <th style={{...TH,textAlign:"right"}}>الوصف</th>
                <th style={TH}>المقاس</th>
                <th style={TH}>الحالة</th>
                <th style={TH}>الكمية</th>
                <th style={TH}>التسليم</th>
                <th style={TH}>الرصيد</th>
                <th style={TH}>الإنجاز</th>
                <th style={TH}>التكلفة</th>
              </tr>
            </thead>
            <tbody>
              {sortOrders(filtered,detSort).map(o=>{const t=calcOrder(o);
                const progress=t.cutQty>0?Math.round(((o.deliveredQty||0)/t.cutQty)*100):0;
                const now=new Date();let lastDate=o.date;(o.workshopDeliveries||[]).forEach(wd=>{if(wd.date>lastDate)lastDate=wd.date;(wd.receives||[]).forEach(r=>{if(r.date>lastDate)lastDate=r.date})});(o.deliveries||[]).forEach(d=>{if(d.date>lastDate)lastDate=d.date});
                const ageDays=Math.floor((now-new Date(lastDate))/(1000*60*60*24));
                const isStale=ageDays>7&&o.status!=="تم التسليم لمخزن الجاهز";
                /* V18.99: Include extra costs (هالك / تشغيل / نقل / إلخ) in displayed cost-per-piece.
                   Each extraCost honors its costType: "perPiece" → already per-piece; "total" → divide by cutQty. */
                const _extraPer=(o.extraCosts||[]).reduce((s,x)=>{const amt=Number(x.amount)||0;return s+(x.costType==="perPiece"?amt:(t.cutQty>0?amt/t.cutQty:0))},0);
                const _settPer=(o.settlement&&(o.deliveredQty||0)>0)?((o.settlement.cost||0)/(o.deliveredQty||1)):0;
                const _displayCostPer=t.costPer+_extraPer+_settPer;
                const _hasExtra=_extraPer>0||_settPer>0;
                return<tr key={o.id} className="det-row" onClick={()=>setSel(o.id)} style={{borderBottom:"1px solid "+T.brd,cursor:"pointer",transition:"background 0.15s"}}>
                  <td style={{...TD,paddingRight:16}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <DefaultModelImg src={o.image} modelNo={o.modelNo} modelDesc={o.modelDesc} orderPieces={o.orderPieces} width={36} style={{borderRadius:6}}/>
                      <div style={{minWidth:0}}>
                        {o.poNumber&&<div style={{fontSize:FS-3,color:T.accent,fontFamily:"monospace",fontWeight:700}}>{o.poNumber}</div>}
                        <div style={{fontWeight:800,color:T.text}}>{o.modelNo}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{...TD,color:T.textSec,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{o.modelDesc}</td>
                  <td style={{...TD,textAlign:"center",fontSize:FS-2,color:T.textMut}}>{o.sizeLabel}</td>
                  <td style={{...TD,textAlign:"center"}}><Badge t={o.status} cards={statusCards}/></td>
                  <td style={{...TDB,textAlign:"center",color:T.accent}}>{t.cutQty}</td>
                  <td style={{...TDB,textAlign:"center",color:T.ok}}>{o.deliveredQty||0}</td>
                  <td style={{...TDB,textAlign:"center",color:t.balance>0?T.err:T.ok}}>{t.balance}</td>
                  <td style={{...TD,textAlign:"center",minWidth:90}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <div className="det-progress-bar" style={{flex:1,height:5}}><div className="det-progress-fill" style={{width:progress+"%",background:progress>=80?T.ok:progress>=50?T.warn:T.err}}/></div>
                      <span style={{fontSize:FS-3,fontWeight:700,color:progress>=80?T.ok:progress>=50?T.warn:T.err,minWidth:32}}>{progress}%</span>
                    </div>
                    {isStale&&<div style={{fontSize:FS-3,color:T.err,fontWeight:700,marginTop:3}}>🔴 {ageDays} يوم</div>}
                  </td>
                  <td style={{...TDB,textAlign:"center",color:_hasExtra?"#F59E0B":"#8B5CF6"}} title={_hasExtra?"شامل تكاليف إضافية / تسوية":""}>
                    {Math.ceil(_displayCostPer)+" ج"}
                    {_hasExtra&&<span style={{fontSize:FS-4,marginInlineStart:3,opacity:0.8}}>*</span>}
                  </td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </div>}

      {/* ═══════════════════════════════════════════════════════════════
          6B. CARDS VIEW — Modern minimal
         ═══════════════════════════════════════════════════════════════ */}
      {filtered.length>0&&detView==="cards"&&<div style={{display:"grid",gridTemplateColumns:isMob?"1fr":isTab?"repeat(2,1fr)":"repeat(4,1fr)",gap:16}}>
        {sortOrders(filtered,detSort).map(o=>{const t=calcOrder(o);
          const wds=o.workshopDeliveries||[];const hasData=wds.length>0||(o.deliveries||[]).length>0;
          /* Progress */
          const progress=t.cutQty>0?Math.round(((o.deliveredQty||0)/t.cutQty)*100):0;
          /* Age */
          const now=new Date();let lastDate=o.date;(o.workshopDeliveries||[]).forEach(wd=>{if(wd.date>lastDate)lastDate=wd.date;(wd.receives||[]).forEach(r=>{if(r.date>lastDate)lastDate=r.date})});(o.deliveries||[]).forEach(d=>{if(d.date>lastDate)lastDate=d.date});
          const ageDays=Math.floor((now-new Date(lastDate))/(1000*60*60*24));
          const isStale=ageDays>7&&o.status!=="تم التسليم لمخزن الجاهز";
          /* V18.99: Include extra costs + settlement in displayed cost-per-piece */
          const _extraPer=(o.extraCosts||[]).reduce((s,x)=>{const amt=Number(x.amount)||0;return s+(x.costType==="perPiece"?amt:(t.cutQty>0?amt/t.cutQty:0))},0);
          const _settPer=(o.settlement&&(o.deliveredQty||0)>0)?((o.settlement.cost||0)/(o.deliveredQty||1)):0;
          const _displayCostPer=t.costPer+_extraPer+_settPer;
          const _hasExtra=_extraPer>0||_settPer>0;
          const isSent=waSent[o.id]&&(Date.now()-waSent[o.id]<60000);
          const sc=(statusCards||[]).find(x=>x.name===o.status);const statusColor=sc?.color||T.accent;
          return<div key={o.id} data-oid={o.id} className="det-tile" style={{background:T.cardSolid,borderRadius:14,border:"1px solid "+T.brd,overflow:"hidden",position:"relative",display:"flex",flexDirection:"column"}} onClick={()=>setSel(o.id)}>
            {/* V18.79: status stripe removed — unified card look */}
            <div style={{padding:14,display:"flex",flexDirection:"column",gap:12,flex:1}}>
              {/* ── Row 1: image + title block ── */}
              <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                {/* Image — slightly smaller than before to give room for KPIs */}
                <div style={{position:"relative",flexShrink:0}}>
                  <DefaultModelImg src={o.image} modelNo={o.modelNo} modelDesc={o.modelDesc} orderPieces={o.orderPieces} width={60} style={{borderRadius:10,background:T.bg}}/>
                </div>

                {/* Title block */}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:6}}>
                    <div style={{flex:1,minWidth:0}}>
                      {/* Inline modelNo + PO badge */}
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3,flexWrap:"wrap"}}>
                        <span style={{fontSize:FS+2,fontWeight:900,color:T.text,lineHeight:1.1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{o.modelNo}</span>
                        {o.poNumber&&<span style={{fontSize:FS-3,fontWeight:800,color:T.accent,fontFamily:"monospace",letterSpacing:0.4,padding:"2px 6px",borderRadius:4,background:T.accent+"10",border:"1px solid "+T.accent+"20"}}>{o.poNumber}</span>}
                      </div>
                      <div style={{fontSize:FS-1,color:T.textSec,marginBottom:5,lineHeight:1.3,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{o.modelDesc}</div>
                      {/* Meta row — size, age, workshop count */}
                      <div style={{fontSize:FS-3,color:T.textMut,fontWeight:600,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                        <span>📐 {o.sizeLabel}</span>
                        {wds.length>0&&<span>🏭 {new Set(wds.map(w=>w.wsName)).size} ورش</span>}
                        {o.closed&&<span style={{fontWeight:700,color:"#64748B"}}>🔒 مغلق</span>}
                        {isStale&&!isSent&&<span style={{padding:"1px 6px",borderRadius:4,background:T.err+"12",color:T.err,fontWeight:700,border:"1px solid "+T.err+"25"}}>🔴 {ageDays}ي</span>}
                        {isSent&&<span style={{padding:"1px 6px",borderRadius:4,background:T.ok+"12",color:T.ok,fontWeight:700,border:"1px solid "+T.ok+"25"}}>✅ تم</span>}
                      </div>
                    </div>
                    {canEdit&&!hasData&&<div onClick={e=>e.stopPropagation()}><DelBtn onConfirm={()=>delOrder(o.id)}/></div>}
                  </div>
                </div>
              </div>

              {/* ── Row 2: STAGE TIMELINE — milestones (V16.47) ── 
                  Shows where the order is in the 5-step production lifecycle
                  (قص → تشغيل → طباعة → تشطيب → جاهز). Cancelled orders show
                  a single red banner instead. */}
              {(()=>{
                const stageIdx=getStageIndex(o.status);
                if(stageIdx<0){/* cancelled */
                  return<div style={{padding:"10px 12px",borderRadius:10,background:T.err+"08",border:"1px solid "+T.err+"30",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <span style={{fontSize:FS-2,color:T.err,fontWeight:800}}>🚫 {o.status}</span>
                    <span style={{fontSize:FS-3,color:T.textMut}}>تم إلغاء الأوردر</span>
                  </div>;
                }
                /* Progress fill: percent from start to current stage */
                const fillPct=stageIdx===0?5:(stageIdx/(PRODUCTION_STAGES.length-1))*100;
                return<div style={{padding:"10px 12px 8px",borderRadius:10,background:T.bg,border:"1px solid "+T.brd}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <span style={{fontSize:FS-3,color:T.textMut,fontWeight:700}}>المرحلة الحالية</span>
                    <span onClick={(e)=>{e.stopPropagation();setStageProgressOrder(o)}} title="اضغط لعرض تفاصيل المرحلة لكل قطعة" style={{padding:"3px 10px",borderRadius:5,background:statusColor,color:"#fff",fontSize:FS-3,fontWeight:800,whiteSpace:"nowrap",cursor:"pointer",display:"inline-flex",alignItems:"center",gap:4,transition:"transform 0.15s, box-shadow 0.15s"}} onMouseEnter={(e)=>{e.currentTarget.style.transform="scale(1.05)";e.currentTarget.style.boxShadow="0 4px 12px rgba(0,0,0,0.15)"}} onMouseLeave={(e)=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow=""}}>
                      <span>{o.status||"—"}</span>
                      <span style={{fontSize:9,opacity:0.85}}>▾</span>
                    </span>
                  </div>
                  {/* Dots track */}
                  <div style={{position:"relative",height:22,marginInline:6}}>
                    {/* gray base line behind everything */}
                    <div style={{position:"absolute",insetBlockStart:9,insetInlineStart:0,insetInlineEnd:0,height:2,background:T.brd,borderRadius:1}}/>
                    {/* green fill line up to current stage */}
                    <div style={{position:"absolute",insetBlockStart:9,insetInlineStart:0,height:2,background:T.ok,borderRadius:1,width:fillPct+"%",transition:"width 0.4s"}}/>
                    {/* dots */}
                    <div style={{position:"relative",display:"flex",justifyContent:"space-between",zIndex:1}}>
                      {PRODUCTION_STAGES.map((st,i)=>{
                        const isDone=i<stageIdx;
                        const isCurrent=i===stageIdx;
                        const isFuture=i>stageIdx;
                        return<div key={st.key} style={{
                          width:20,height:20,borderRadius:"50%",
                          background:isDone?T.ok:isCurrent?statusColor:T.cardSolid,
                          border:"2px solid "+(isDone?T.ok:isCurrent?statusColor:T.brd),
                          color:isFuture?T.textMut:"#fff",
                          display:"flex",alignItems:"center",justifyContent:"center",
                          fontSize:11,fontWeight:900,lineHeight:1,
                          ...(isCurrent?{boxShadow:"0 0 0 4px "+statusColor+"33"}:{})
                        }}>{isDone?"✓":isCurrent?"●":""}</div>;
                      })}
                    </div>
                  </div>
                  {/* Stage labels under dots */}
                  <div style={{display:"flex",justifyContent:"space-between",marginTop:6,marginInline:-2}}>
                    {PRODUCTION_STAGES.map((st,i)=>{
                      const isDone=i<stageIdx;const isCurrent=i===stageIdx;
                      return<span key={st.key} style={{flex:1,textAlign:"center",fontSize:FS-4,fontWeight:isCurrent?800:isDone?700:500,color:isCurrent?statusColor:isDone?T.ok:T.textMut,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",padding:"0 1px"}}>{st.short}</span>;
                    })}
                  </div>
                  {/* Numbers row — context made explicit so "0" stops being confusing */}
                  <div style={{display:"flex",alignItems:"baseline",gap:6,marginTop:9,paddingTop:8,borderTop:"1px dashed "+T.brd}}>
                    <span style={{fontSize:FS+4,fontWeight:900,color:progress>=80?T.ok:progress>=50?T.warn:T.textSec,fontVariantNumeric:"tabular-nums",lineHeight:1}}>{o.deliveredQty||0}</span>
                    <span style={{fontSize:FS-2,color:T.textMut,fontWeight:600,fontVariantNumeric:"tabular-nums"}}>/ {t.cutQty} لمخزن الجاهز</span>
                    <span style={{marginInlineStart:"auto",fontSize:FS-3,fontWeight:800,color:T.textSec,fontVariantNumeric:"tabular-nums"}}>{stageIdx+1}/{PRODUCTION_STAGES.length} مراحل</span>
                  </div>
                </div>;
              })()}

              {/* ── Row 3: KPIs row — big numbers, lowercase labels ── */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
                <div style={{padding:"8px 4px",textAlign:"center"}}>
                  <div style={{fontSize:FS-4,color:T.textMut,fontWeight:700,textTransform:"uppercase",letterSpacing:0.3,marginBottom:1}}>رصيد</div>
                  <div style={{fontSize:FS+4,fontWeight:900,color:t.balance>0?T.err:T.ok,lineHeight:1,fontVariantNumeric:"tabular-nums"}}>{t.balance}</div>
                </div>
                <div style={{padding:"8px 4px",textAlign:"center",borderInlineStart:"1px solid "+T.brd,borderInlineEnd:"1px solid "+T.brd}}>
                  <div style={{fontSize:FS-4,color:T.textMut,fontWeight:700,textTransform:"uppercase",letterSpacing:0.3,marginBottom:1}}>مخزن</div>
                  <div style={{fontSize:FS+4,fontWeight:900,color:T.purple||"#8B5CF6",lineHeight:1,fontVariantNumeric:"tabular-nums"}}>{getConfirmedStock(o)}</div>
                </div>
                <div style={{padding:"8px 4px",textAlign:"center"}}>
                  <div style={{fontSize:FS-4,color:T.textMut,fontWeight:700,textTransform:"uppercase",letterSpacing:0.3,marginBottom:1}}>تكلفة{_hasExtra?" *":""}</div>
                  <div style={{fontSize:FS+4,fontWeight:900,color:_hasExtra?"#F59E0B":"#8B5CF6",lineHeight:1,fontVariantNumeric:"tabular-nums"}} title={_hasExtra?"شامل تكاليف إضافية / تسوية":""}>{Math.ceil(_displayCostPer)}</div>
                </div>
              </div>

              {/* ── Row 4: Workshop chips — preserved exactly as before ── */}
              {wds.length>0&&(()=>{
                const grp={};
                wds.forEach(wd=>{
                  const ws=wd.wsName;const pc=wd.garmentType||"عام";
                  const k=ws+"|"+pc;
                  if(!grp[k])grp[k]={ws,piece:pc,del:0,rcv:0};
                  grp[k].del+=Number(wd.qty)||0;
                  (wd.receives||[]).forEach(r=>{grp[k].rcv+=Number(r.qty)||0});
                });
                const rows=Object.values(grp).map(g=>({...g,bal:g.del-g.rcv}))
                  .sort((a,b)=>b.bal-a.bal);
                return<div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {rows.slice(0,3).map((g,i)=>{
                    const c=g.bal>0?T.warn:T.ok;
                    return<div key={i} style={{padding:"5px 8px",borderRadius:6,background:c+"08",border:"1px solid "+c+"22",display:"flex",flexDirection:"column",gap:3}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:6}}>
                        <span style={{fontSize:FS-3,fontWeight:800,color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>🏭 {g.ws}</span>
                        <span style={{fontSize:FS-3,fontWeight:700,color:T.textMut,whiteSpace:"nowrap"}}>{g.piece}</span>
                      </div>
                      <div style={{display:"flex",gap:4,fontSize:FS-3,fontWeight:700,fontVariantNumeric:"tabular-nums"}}>
                        <span style={{flex:1,padding:"2px 5px",borderRadius:4,background:T.accent+"10",color:T.accent,textAlign:"center"}} title="تسليم">📤 {g.del}</span>
                        <span style={{flex:1,padding:"2px 5px",borderRadius:4,background:T.ok+"10",color:T.ok,textAlign:"center"}} title="استلام">📥 {g.rcv}</span>
                        <span style={{flex:1,padding:"2px 5px",borderRadius:4,background:c+"15",color:c,textAlign:"center"}} title="رصيد عند الورشة">{g.bal>0?"⏳ "+g.bal:"✓ 0"}</span>
                      </div>
                    </div>;
                  })}
                  {rows.length>3&&<span style={{fontSize:FS-3,padding:"3px 8px",borderRadius:5,background:T.bg,color:T.textMut,fontWeight:700,textAlign:"center"}}>+{rows.length-3} أخرى</span>}
                </div>;
              })()}

              {/* ── Footer: WhatsApp ── */}
              <div style={{display:"flex",gap:6,marginTop:"auto",paddingTop:4,borderTop:"1px solid "+T.brd}}>
                <div onClick={e=>{e.stopPropagation();setWaPopup({order:o,t:calcOrder(o),fromCard:true})}} title="ارسال واتساب" style={{flex:1,padding:"6px",borderRadius:8,background:"#25D36608",color:"#25D366",border:"1px solid #25D36620",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:FS-2,fontWeight:700,gap:5,transition:"all 0.15s"}} onMouseEnter={e=>{e.currentTarget.style.background="#25D36615"}} onMouseLeave={e=>{e.currentTarget.style.background="#25D36608"}}>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 3.5A11.5 11.5 0 0 0 12 0a12 12 0 0 0-10.4 18L0 24l6.2-1.6A12 12 0 0 0 12 24c6.6 0 12-5.4 12-12 0-3.2-1.2-6.2-3.5-8.5zm-8.5 18.5a10 10 0 0 1-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4a10 10 0 1 1 18.4-5.4c0 5.5-4.5 10-10 10zm5.5-7.5c-.3-.2-1.8-.9-2-1-.3-.1-.5-.2-.7.1-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1a8 8 0 0 1-2.3-1.4 8.8 8.8 0 0 1-1.6-2c-.2-.3 0-.4.1-.6l.3-.4.2-.3.1-.3a.3.3 0 0 0 0-.3l-1-2.2c-.2-.5-.4-.5-.6-.5H8c-.3 0-.6.1-.8.4-.3.4-1 1-1 2.3s1 2.7 1.2 2.9c.1.2 2.1 3.2 5 4.4 2.4 1 2.9.8 3.4.8.6-.1 1.8-.8 2-1.5.3-.8.3-1.4.2-1.5-.1-.1-.3-.2-.6-.3z"/></svg>
                  <span>واتساب</span>
                </div>
              </div>
            </div>
          </div>;
        })}
      </div>}

    {waPopup&&(()=>{const wo=waPopup.order;const wt=waPopup.t||calcOrder(wo);const timeline=getOrderTimeline(wo,wt);const hasTimeline=!!timeline;
      const sendWa=async(withTimeline)=>{let text=getOrderDetails(wo,wt);if(withTimeline&&timeline)text+=timeline;
        if(wo.image&&navigator.canShare){try{const res=await fetch(wo.image);const blob=await res.blob();const file=new File([blob],wo.modelNo+".jpg",{type:blob.type||"image/jpeg"});if(navigator.canShare({files:[file]})){await navigator.share({title:"CLARK — "+wo.modelNo,text,files:[file]});setWaSent(p=>({...p,[wo.id]:Date.now()}));setTimeout(()=>setWaSent(p=>{const n={...p};delete n[wo.id];return n}),60000);setWaPopup(null);return}}catch(e){}}
        openWA("https://wa.me/?text="+encodeURIComponent(text),"_blank");setWaSent(p=>({...p,[wo.id]:Date.now()}));setTimeout(()=>setWaSent(p=>{const n={...p};delete n[wo.id];return n}),60000);setWaPopup(null)};
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setWaPopup(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:380,border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{textAlign:"center",marginBottom:16}}><div style={{fontSize:20,marginBottom:4}}>📱</div><div style={{fontSize:FS+1,fontWeight:800,color:"#25D366"}}>ارسال واتساب</div><div style={{fontSize:FS-1,color:T.textSec}}>{wo.modelNo+" — "+wo.modelDesc}</div></div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div onClick={()=>sendWa(false)} style={{padding:14,borderRadius:12,border:"1px solid #25D36630",background:"#25D36606",cursor:"pointer",textAlign:"center"}} onMouseEnter={e=>e.currentTarget.style.background="#25D36612"} onMouseLeave={e=>e.currentTarget.style.background="#25D36606"}><div style={{fontSize:FS,fontWeight:700,color:"#25D366"}}>📋 تفاصيل الأوردر فقط</div><div style={{fontSize:FS-2,color:T.textMut,marginTop:2}}>رقم الموديل والوصف والكمية والحالة</div></div>
            {hasTimeline&&<div onClick={()=>sendWa(true)} style={{padding:14,borderRadius:12,border:"1px solid #25D36630",background:"#25D36606",cursor:"pointer",textAlign:"center"}} onMouseEnter={e=>e.currentTarget.style.background="#25D36612"} onMouseLeave={e=>e.currentTarget.style.background="#25D36606"}><div style={{fontSize:FS,fontWeight:700,color:"#25D366"}}>📋 تفاصيل + تايم لاين</div><div style={{fontSize:FS-2,color:T.textMut,marginTop:2}}>كل الحركات + رصيد المخزن</div></div>}
          </div>
          <div style={{textAlign:"center",marginTop:12}}><Btn ghost small onClick={()=>setWaPopup(null)}>الغاء</Btn></div>
        </div>
      </div>})()}
    {/* V19.16: Mount StageProgressModal in the orders-list branch too. The badge
        in the card (line ~384) calls setStageProgressOrder, but previously the
        modal was only mounted in the order-detail branch (line ~1691) — so the
        first click set the state but rendered nothing, and the second click on
        the card flipped to the detail branch where the modal *was* mounted,
        causing both the modal and the detail view to open at once. */}
    {stageProgressOrder&&<StageProgressModal order={stageProgressOrder} onClose={()=>setStageProgressOrder(null)}/>}
    </div>
  }
  if(editing)return<OrdForm data={data} initial={order} onSave={o=>{replaceOrder(sel,o);setEditing(false);showToast("✓ تم حفظ التعديلات");highlightRow(sel)}} onCancel={()=>setEditing(false)} isMob={isMob} statusCards={statusCards} upConfig={upConfig}/>;

  const t=calcOrder(order);const accItems=order.accItems||[];const accAll=t.accPer*t.cutQty;
  const activeFabs=FKEYS.filter(k=>order["fabric"+k]);

  /* V18.88: Extra cost categories — added "تشغيل من القص للتعبئة" as the first category */
  const EXTRA_COST_CATEGORIES=[
    {name:"تشغيل من القص للتعبئة",icon:"🏭"},
    {name:"هالك",icon:"🔴"},
    {name:"نقل",icon:"🚚"},
    {name:"تغليف",icon:"📦"},
    {name:"كوي",icon:"🧺"},
    {name:"عمولة",icon:"💼"},
    {name:"إصلاح",icon:"🔧"},
    {name:"أخرى",icon:"➕"}
  ];
  const getCategoryIcon=(name)=>{const c=EXTRA_COST_CATEGORIES.find(x=>x.name===name);return c?c.icon:"➕"};

  /* Prev/Next navigation */
  const sortedIds=sortOrders(data.orders).map(o=>o.id);const curIdx=sortedIds.indexOf(sel);
  const prevId=curIdx>0?sortedIds[curIdx-1]:null;const nextId=curIdx<sortedIds.length-1?sortedIds[curIdx+1]:null;

  return<div>
    {/* V18.94: Review-request banner — visible only to the sender if there's an active request for this order */}
    <ReviewRequestBanner
      linkType="order"
      linkId={order.id}
      data={data} upConfig={upConfig} user={user}
    />
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
      {/* V19.80.0: prominent model number + sizes; PO + description as secondary line */}
      <div style={{display:"flex",alignItems:"center",gap:8,flex:1,minWidth:0}}>
        <Btn ghost onClick={()=>setSel(null)} style={{fontSize:isMob?16:20}} title="إغلاق">✕</Btn>
        <div style={{minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:isMob?8:14,flexWrap:"wrap"}}>
            <h1 style={{fontSize:isMob?22:30,fontWeight:900,margin:0,color:T.accent,letterSpacing:"-0.5px",lineHeight:1.05}}>🏷 {order.modelNo||"—"}</h1>
            {order.sizeLabel&&<span style={{fontSize:isMob?15:20,fontWeight:800,color:T.text,padding:"3px 12px",borderRadius:8,background:T.accent+"10",border:"1px solid "+T.accent+"35",whiteSpace:"nowrap"}}>📐 {order.sizeLabel}</span>}
          </div>
          <div style={{fontSize:FS-1,color:T.textSec,marginTop:4,display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
            {order.poNumber&&<span style={{fontFamily:"monospace",fontWeight:700,color:T.accent,letterSpacing:0.5}}>📋 {order.poNumber}</span>}
            {order.poNumber&&order.modelDesc&&<span style={{color:T.textMut}}>•</span>}
            {order.modelDesc&&<span style={{overflow:"hidden",textOverflow:"ellipsis"}}>{order.modelDesc}</span>}
          </div>
        </div>
      </div>
      {/* V16.37: Action row — desktop shows everything inline; mobile keeps
          only prev/next nav + print, and folds secondary actions into a "⋯" menu. */}
      <div className="action-row-scroll" style={{display:"flex",gap:4,alignItems:"center",maxWidth:"100%",position:"relative"}}>
        <Btn small onClick={()=>prevId&&setSel(prevId)} disabled={!prevId} style={{fontSize:18,padding:"2px 8px",opacity:prevId?1:0.3}}>→</Btn>
        <span style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>{(curIdx+1)+"/"+sortedIds.length}</span>
        <Btn small onClick={()=>nextId&&setSel(nextId)} disabled={!nextId} style={{fontSize:18,padding:"2px 8px",opacity:nextId?1:0.3}}>←</Btn>
        <div style={{width:1,height:20,background:T.brd,margin:"0 4px",flexShrink:0}}/>
        <Btn small onClick={()=>printOrderSheet(order,t,activeFabs,statusCards)} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}} title="طباعة">🖨</Btn>
        {/* Desktop: inline buttons */}
        {!isMob&&<>
          {canEdit&&!order.closed&&<Btn small primary onClick={()=>setEditing(true)} title="تعديل">✏️</Btn>}
          <Btn small onClick={()=>setWaPopup({order,t,fromCard:false})} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}} title="ارسال واتساب">📱</Btn>
          {/* V18.90: Request review */}
          <Btn small onClick={()=>setShowReview(true)} style={{background:"#8B5CF612",color:"#8B5CF6",border:"1px solid #8B5CF630"}} title="طلب مراجعة">📌</Btn>
          {canEdit&&!order.closed&&<Btn small onClick={()=>{const dup=JSON.parse(JSON.stringify(order));dup.id=gid();dup.date=new Date().toISOString().split("T")[0];dup.createdAt=new Date().toISOString();dup.modelNo="";dup.status="تم القص";dup.deliveredQty=0;dup.deliveries=[];dup.workshopDeliveries=[];dup._isDup=true;delete dup._docId;setDupInit(dup)}} style={{background:"#8B5CF6"+"12",color:"#8B5CF6",border:"1px solid #8B5CF630",whiteSpace:"nowrap"}} title="تكرار الأوردر">📋 تكرار</Btn>}
          {canEdit&&!order.closed&&t.cutQty>0&&activeFabs.length>0&&<Btn small onClick={()=>{setShowDeliver(true);setDWs("");setDType("");setDQty(0);setDPrice("");setDNote("")}} style={{background:"#8B5CF6"+"12",color:"#8B5CF6",border:"1px solid #8B5CF630",whiteSpace:"nowrap"}}>📤 تسليم ورشة</Btn>}
          {canEdit&&!order.closed&&<Btn small onClick={()=>setShowNew(true)} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30",whiteSpace:"nowrap"}}>+ جديد</Btn>}
        </>}
        {/* Mobile: overflow "⋯" menu */}
        {isMob&&<>
          <Btn small onClick={()=>setShowActionsMenu(true)} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd,fontSize:18,padding:"2px 10px",fontWeight:800}} title="المزيد">⋯</Btn>
        </>}
        {order.closed&&<span style={{padding:"4px 12px",borderRadius:8,background:"#64748B12",color:"#64748B",fontWeight:700,fontSize:FS-1,whiteSpace:"nowrap"}}>🔒 مغلق</span>}
      </div>
    </div>
    <div id="parea">
      {/* ═══════════════════════════════════════════════════════════════
          V19.80.1 — Top row: reversed direction + timeline stretches full width
          ───────────────────────────────────────────────────────────────
          Desktop (RTL visual): [image (right) | 2x2 KPI grid | timeline (left, 1fr)]
          DOM order matches visual RTL so the timeline cell gets the 1fr column
          and stretches across the entire remaining width.
          Tablet (<1100px): [image | 2x2 KPI grid] then [timeline full-width below]
          Mobile (<540px): same 2-row layout, smaller image + tighter cards
         ═══════════════════════════════════════════════════════════════ */}
      <style>{`
        .det-top-row{display:grid;grid-template-columns:auto auto 1fr;gap:12px;margin-bottom:12px;align-items:stretch}
        .det-top-row > .det-img-cell{position:relative;display:flex;align-items:stretch}
        /* V19.80.6: image cell uses a fixed-size container with 4:5 portrait
           ratio (1080:1350 — fashion catalog standard). Desktop 144×180 and
           mobile 108×135 are both exact 4:5 multiples (×36 and ×27 respectively).
           Source image is uploaded at natural ratio; the displayed frame crops
           with object-fit:cover so any source still looks framed correctly. */
        .det-top-row > .det-img-cell > .det-img-frame{width:144px;height:180px;border-radius:14px;overflow:hidden;border:1px solid ${T.brd};box-shadow:${T.shadow};flex-shrink:0;align-self:flex-start}
        @media (max-width: 540px){.det-top-row > .det-img-cell > .det-img-frame{width:108px;height:135px}}
        .det-top-row > .det-img-cell > .det-img-frame > img,.det-top-row > .det-img-cell > .det-img-frame > div{width:100%;height:100%;object-fit:cover;border-radius:0;border:none;box-shadow:none}
        .det-top-row > .det-kpis-cell{display:grid;grid-template-columns:1fr 1fr;gap:8px;min-width:280px}
        .det-top-row > .det-kpis-cell > div,.det-top-row > .det-kpis-cell > .metric-card{height:100%;box-sizing:border-box}
        .det-top-row > .det-kpis-cell .metric-card{padding:10px 12px;height:100%}
        .det-top-row > .det-timeline-cell{min-width:0;background:${T.cardSolid};border-radius:12px;padding:8px 12px;border:1px solid ${T.brd};overflow-x:auto;-webkit-overflow-scrolling:touch;display:flex;align-items:center;justify-content:stretch}
        .det-top-row > .det-timeline-cell > div{width:100%;flex:1;min-width:0}
        @media (max-width: 1100px){
          .det-top-row{grid-template-columns:auto 1fr;grid-template-rows:auto auto}
          .det-top-row > .det-img-cell{grid-column:1;grid-row:1}
          .det-top-row > .det-kpis-cell{grid-column:2;grid-row:1;min-width:0}
          .det-top-row > .det-timeline-cell{grid-column:1 / -1;grid-row:2}
        }
        @media (max-width: 540px){
          .det-top-row{gap:8px}
          .det-top-row > .det-kpis-cell{grid-template-columns:1fr 1fr;gap:6px;min-width:0}
          .det-top-row > .det-kpis-cell .metric-card{padding:8px 10px}
        }
        .det-meta-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;background:${T.bg};border:1px solid ${T.brd};font-size:${FS-1}px;font-weight:600;color:${T.textSec};white-space:nowrap}
        .det-tab-bar{display:flex;gap:4px;overflow-x:auto;border-bottom:2px solid ${T.brd};padding:0 4px;margin-bottom:16px;-webkit-overflow-scrolling:touch;scrollbar-width:thin}
        .det-tab-bar::-webkit-scrollbar{height:4px}
        .det-tab-bar::-webkit-scrollbar-thumb{background:${T.brd};border-radius:2px}
        .det-tab-pill{cursor:pointer;padding:10px 16px;border-radius:10px 10px 0 0;font-weight:700;white-space:nowrap;display:inline-flex;align-items:center;gap:8px;transition:all 0.15s;border-bottom:3px solid transparent;color:${T.textSec};margin-bottom:-2px;user-select:none}
        .det-tab-pill:hover{background:${T.bg}}
        @media (max-width: 720px){
          .det-tab-bar{border-bottom:none;background:${T.cardSolid};padding:6px;border-radius:14px;margin-bottom:14px;border:1px solid ${T.brd};gap:4px}
          .det-tab-pill{border-radius:10px;border-bottom:none !important;padding:10px 12px;font-size:${FS-1}px;flex-shrink:0}
        }
        .det-pieces-row{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;align-items:center;padding:10px 12px;background:${T.cardSolid};border-radius:12px;border:1px solid ${T.brd}}
      `}</style>
      <div className="det-top-row">
        {/* V19.80.4: image always rendered inside a fixed-size 3:4 portrait
             frame (140×187 desktop / 105×140 mobile). No matter what natural
             dimensions the source has, it's clamped via object-fit:cover so a
             large upload can never blow the layout up. loading="eager" so the
             hero image shows immediately on prev/next nav. */}
        <div className="det-img-cell">
          {/* V19.80.5: click to zoom (only when an image is set) */}
          <div className="det-img-frame" onClick={order.image?()=>setImgZoom(true):undefined} style={{cursor:order.image?"zoom-in":"default"}} title={order.image?"عرض بالحجم الكامل":""}>
            <DefaultModelImg src={order.image} modelNo={order.modelNo} modelDesc={order.modelDesc} orderPieces={order.orderPieces} loading="eager"/>
          </div>
          {canEdit&&order.image&&<div onClick={async(e)=>{e.stopPropagation();if(await ask("حذف الصورة","متأكد من حذف صورة الأوردر؟",{danger:true})){const path=order.imageStoragePath;updOrder(sel,o=>{o.image="";o.imageStoragePath=""});if(path)deleteOrderImage(path).catch(err=>console.warn("[V19.36] storage cleanup failed:",err))}}} style={{position:"absolute",top:6,right:6,width:24,height:24,borderRadius:12,background:"rgba(0,0,0,0.65)",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:12,zIndex:2}}>✕</div>}
        </div>
        {/* 2x2 KPI grid → middle column (col 2: auto width) */}
        <div className="det-kpis-cell">
          {/* KPI 1 — cut qty (clickable to per-piece editor) */}
          <div onClick={canEdit?()=>{
            const pieces=order.orderPieces||[];
            const draft={};
            pieces.forEach(p=>{draft[p]=getPieceCutQty(order,p)});
            setPieceCutPopup({draft})
          }:undefined} style={{cursor:canEdit?"pointer":"default",position:"relative",minWidth:0}} title={canEdit?"اضغط لضبط كمية القص لكل قطعة على حدة":""}>
            <MetricCard label="كمية القص" value={t.cutQty} icon="✂️" color={T.accent}/>
            {canEdit&&(order.orderPieces||[]).some(p=>(order.pieceCutQty?.[p]!=null)&&Number(order.pieceCutQty[p])!==t.cutQty)&&<span style={{position:"absolute",top:4,insetInlineEnd:6,fontSize:9,color:T.warn,fontWeight:700,padding:"1px 5px",borderRadius:4,background:T.warn+"15"}} title="بعض القطع لها كمية قص يدوية مختلفة عن الإجمالي">يدوي</span>}
          </div>
          {/* KPI 2 — ready stock */}
          <MetricCard label="في المخزن الجاهز" value={order.deliveredQty||0} icon="📦" color={T.ok}/>
          {/* KPI 3 — balance */}
          <MetricCard label="الرصيد" value={t.balance} icon="📊" color={t.balance>0?T.warn:T.ok}/>
          {/* KPI 4 — cost (compact; warning shown as banner below) */}
          {(()=>{
            const hasSettlement=!!order.settlement;
            const delivered=order.deliveredQty||0;
            const originalCostPer=r2(t.costPer);
            const cutQ=t.cutQty||0;
            const extraTotal=(order.extraCosts||[]).reduce((s,x)=>{const amt=Number(x.amount)||0;return s+(x.costType==="perPiece"?amt*cutQ:amt)},0);
            const hasExtra=extraTotal>0;
            let label,value,color,sub;
            if(hasSettlement&&delivered>0){
              const actualCostPer=r2((t.costAll+(order.settlement.cost||0)+extraTotal)/delivered);
              const diff=r2(actualCostPer-originalCostPer);
              label="تكلفة القطعة الفعلية";value=Math.ceil(actualCostPer)+" ج.م";color=T.err;
              sub="فرق +"+Math.ceil(diff)+" ج.م";
            }else if(hasExtra){
              const actualCostPer=cutQ>0?r2((t.costAll+extraTotal)/cutQ):originalCostPer;
              label="تكلفة القطعة الفعلية";value=Math.ceil(actualCostPer)+" ج.م";color="#F59E0B";
              const diff=Math.ceil(actualCostPer-originalCostPer);
              sub="إضافي +"+diff+" ج.م";
            }else{
              label="تكلفة القطعة";value=originalCostPer+" ج.م";color=T.accent;sub=null;
            }
            return<MetricCard label={label} value={value} icon="💰" color={color} sub={sub}/>;
          })()}
        </div>
        {/* V19.80.1: Timeline → leftmost column (col 3: 1fr) — stretches across the remaining width */}
        <div className="det-timeline-cell">
          {(()=>{const wds=order.workshopDeliveries||[];const dels=order.deliveries||[];
            const totalWsDel=wds.reduce((s,wd)=>s+(Number(wd.qty)||0),0);
            const totalWsRcv=wds.reduce((s,wd)=>s+(wd.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0),0);
            const stockDel=getConfirmedStock(order);const isClosed=order.closed||!!order.settlement;
            const phases=[];
            phases.push({title:"تم القص",color:T.accent,date:order.date,details:["كمية: "+t.cutQty]});
            const wsDetails=[];const wsNames=[...new Set(wds.map(w=>w.wsName))];
            wsNames.forEach(n=>{const wdForWs=wds.filter(w=>w.wsName===n);const pieces=wdForWs.map(w=>(w.garmentType||"عام")+" ("+w.qty+")").join("، ");wsDetails.push(n+": "+pieces)});
            if(wsDetails.length>0)phases.push({title:"في التشغيل",color:"#8B5CF6",date:wds[0]?.date,details:wsDetails});
            else phases.push({title:"في التشغيل",color:"#8B5CF6",details:[]});
            const rcvDetails=[];wsNames.forEach(n=>{const rcvd=wds.filter(w=>w.wsName===n).reduce((s,w)=>(w.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0)+s,0);if(rcvd>0)rcvDetails.push("استلام "+n+": "+rcvd)});
            phases.push({title:"تشطيب وتعبئة",color:T.ok,details:rcvDetails.length>0?rcvDetails:[]});
            const stockDetails=[];if(stockDel>0)stockDetails.push("مؤكد: "+stockDel+" قطعة");
            const pendDel=dels.filter(d=>d.status==="pending").reduce((s,d)=>s+(Number(d.qty)||0),0);
            if(pendDel>0)stockDetails.push("⏳ معلّق: "+pendDel);
            phases.push({title:"مخزن نهائي",color:"#059669",details:stockDetails});
            if(isClosed)phases.push({title:"مغلق ✅",color:"#64748B",details:order.settlement?["هالك: "+(order.settlement.qty||0)]:[]});
            let curIdx=0;
            if(totalWsDel>0)curIdx=1;
            if(totalWsRcv>0)curIdx=2;
            if(stockDel>0)curIdx=3;
            if(isClosed)curIdx=phases.length-1;
            return<Timeline phases={phases} currentIdx={curIdx}/>;
          })()}
        </div>
      </div>

      {/* ═══ Cost-incomplete warning banner ═══ */}
      {(()=>{
        const pieces=order.orderPieces||[];
        const linked=new Set();FKEYS.forEach(k=>{if(gf(order,k))(order["fabricPieces"+k]||[]).forEach(p=>linked.add(p))});
        const missing=pieces.filter(p=>!linked.has(p));
        const hasWarning=pieces.length>1&&missing.length>0;
        if(!hasWarning)return null;
        const done=pieces.filter(p=>linked.has(p));
        return<div style={{padding:"10px 14px",marginBottom:12,borderRadius:12,background:"#F59E0B08",border:"1.5px solid #F59E0B40",display:"flex",alignItems:"flex-start",gap:10,flexWrap:"wrap"}}>
          <span style={{fontSize:18,marginTop:2}}>⚠️</span>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:FS,fontWeight:800,color:"#F59E0B"}}>تكلفة غير مكتملة — ناقص خامات</div>
            <div style={{fontSize:FS-1,color:T.textSec,marginTop:2}}>{done.length+"/"+pieces.length+" قطعة مرتبطة بخامة"}</div>
            <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:6}}>
              {missing.map(p=><span key={"m-"+p} style={{padding:"2px 8px",borderRadius:6,background:"#EF444412",color:"#EF4444",fontWeight:700,fontSize:FS-2,border:"1px solid #EF444425",whiteSpace:"nowrap"}}>{"❌ "+p}</span>)}
              {done.map(p=><span key={"d-"+p} style={{padding:"2px 8px",borderRadius:6,background:"#10B98112",color:"#10B981",fontWeight:700,fontSize:FS-2,border:"1px solid #10B98125",whiteSpace:"nowrap"}}>{"✅ "+p}</span>)}
            </div>
          </div>
        </div>;
      })()}

      {/* ═══ Meta chips: status / date / marker / PO (sizes moved to header) ═══ */}
      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12,alignItems:"center"}}>
        <span className="det-meta-chip" style={{padding:"3px 8px"}}>
          {canEdit&&editStatusMode?<><Sel value={order.status} onChange={v=>{updOrder(sel,o=>{o.status=v});setEditStatusMode(false)}}>{statuses.map(s=><option key={s} value={s}>{s}</option>)}</Sel><Btn ghost small onClick={()=>setEditStatusMode(false)} title="إغلاق">✕</Btn></>:<><span onClick={()=>setStageProgressOrder(order)} title="اضغط لعرض تفاصيل المرحلة لكل قطعة" style={{cursor:"pointer",display:"inline-flex",alignItems:"center",gap:4}}><Badge t={order.status} cards={statusCards}/><span style={{fontSize:11,color:T.textSec,fontWeight:800}}>▾</span></span>{canEdit&&<Btn ghost small onClick={()=>setEditStatusMode(true)} style={{fontSize:FS-3,padding:"2px 8px",marginInlineStart:4}} title="تعديل">✏️</Btn>}</>}
        </span>
        <span className="det-meta-chip"><span>📅</span><span>{order.date}</span></span>
        {order.marker&&<span className="det-meta-chip"><span>📏 ماركر:</span><span>{order.marker}</span></span>}
      </div>

      {/* ═══ Sync banner — cut/workshop quantity mismatch (urgent, kept full-width above tabs) ═══ */}
      {(()=>{const m=detectQtyMismatch(order);if(!m.hasMismatch||order.closed)return null;
        const lastSync=(order.cutSyncHistory||[]).slice(-1)[0];
        return<div style={{padding:"10px 14px",marginBottom:14,borderRadius:12,background:"#F59E0B08",border:"1.5px solid #F59E0B35"}}>
          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
            <div style={{display:"flex",alignItems:"flex-start",gap:10,flex:1,minWidth:0}}>
              <span style={{fontSize:20,flexShrink:0,marginTop:2}}>⚠️</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:FS-1,fontWeight:800,color:"#B45309"}}>عدم تطابق بين كمية القص والتسليم للورش</div>
                <div style={{fontSize:FS-2,color:T.textSec,marginTop:2}}>القص: <b style={{color:T.text}}>{m.cutQty}</b> طقم — {m.mismatchedPieces.length} قطعة/قطع غير متطابقة:</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:6}}>
                  {m.mismatchedPieces.map(p=>{const col=p.diff>0?"#F59E0B":"#EF4444";return<div key={p.piece} style={{padding:"4px 10px",borderRadius:8,background:col+"12",border:"1px solid "+col+"35",fontSize:FS-2}}>
                    <b style={{color:col}}>{p.piece}</b>
                    <span style={{color:T.textMut,margin:"0 4px"}}>•</span>
                    <span>تسليم <b>{p.totalDelivered}</b></span>
                    <span style={{color:col,fontWeight:700,marginInlineStart:6}}>({p.diff>0?"+":""}{-p.diff})</span>
                  </div>})}
                </div>
                {lastSync&&<div style={{fontSize:FS-3,color:T.textMut,marginTop:6}}>آخر مزامنة: {lastSync.by||"—"} • {lastSync.at?new Date(lastSync.at).toLocaleString("ar-EG"):"—"}</div>}
              </div>
            </div>
            {canEdit&&<Btn small onClick={()=>{const pl=planCutSync(order);setSyncPopup({...pl,manual:{}})}} style={{background:"#F59E0B",color:"#fff",border:"none",fontWeight:700,whiteSpace:"nowrap",flexShrink:0}}>🔄 مزامنة</Btn>}
          </div>
        </div>
      })()}

      {/* ═══ Order pieces (chips) — moved above tabs so they're always visible ═══ */}
      {(order.orderPieces||[]).length>0&&<div className="det-pieces-row">
        <span style={{fontSize:FS-1,fontWeight:700,color:T.textSec}}>{"قطع الموديل ("+order.orderPieces.length+"):"}</span>
        {order.orderPieces.map((p,i)=>{
          const delForP=(order.workshopDeliveries||[]).filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0);
          const pieceCut=getPieceCutQty(order,p);
          const avail=Math.max(0,pieceCut-delForP);
          return<span key={i} style={{padding:"6px 12px",borderRadius:10,background:avail>0?"#FEF3C7":"#D1FAE5",border:"1px solid "+(avail>0?T.warn:T.ok)+"40",fontSize:FS-1,fontWeight:700}}>{gIcon(p,data.garmentTypes)+" "+p}<span style={{fontSize:FS-2,color:T.textSec,marginRight:6,fontWeight:600}}>{" (تشغيل: "+delForP+" / متاح: "+avail+")"}</span></span>
        })}
      </div>}
      {/* ═══ Tab bar — sticky-ish; switches between section groups ═══ */}
      {(()=>{
        const wds=order.workshopDeliveries||[];
        const wsCount=new Set(wds.map(w=>w.wsName)).size;
        const dels=order.deliveries||[];
        const custDels=order.customerDeliveries||[];
        const att=(order.attachments||[]).length;
        const TABS=[
          {id:"fabrics",label:"القماش والخامات",icon:"🧵",color:T.accent,badge:activeFabs.length},
          {id:"accessories",label:"الاكسسوار",icon:"🔘",color:"#0EA5E9",badge:accItems.length},
          {id:"costs",label:"التكاليف",icon:"💰",color:"#F59E0B",badge:(order.extraCosts||[]).length},
          {id:"workshops",label:"التشغيل والورش",icon:"🏭",color:"#8B5CF6",badge:wsCount},
          {id:"sales",label:"المبيعات والمخزن",icon:"📦",color:"#10B981",badge:dels.length+custDels.length},
          {id:"settlement",label:"التسوية والمرفقات",icon:"⚖️",color:"#EF4444",badge:att+(order.settlement?1:0)},
        ];
        return<div className="det-tab-bar" role="tablist">
          {TABS.map(tab=>{const isActive=activeTab===tab.id;
            /* V19.80.0: on mobile, active tab is a filled pill button (full bg color, white text); on desktop it's an underlined tab. */
            return<div key={tab.id} role="tab" onClick={()=>setActiveTab(tab.id)} className="det-tab-pill" style={{
              background:isActive?(isMob?tab.color:tab.color+"12"):"transparent",
              borderBottomColor:isActive&&!isMob?tab.color:"transparent",
              border:isMob?("1.5px solid "+(isActive?tab.color:T.brd)):undefined,
              color:isActive?(isMob?"#fff":tab.color):T.textSec,
              fontSize:FS,
              boxShadow:isActive&&isMob?"0 2px 6px "+tab.color+"40":undefined,
            }}>
              <span style={{fontSize:FS+2}}>{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.badge>0&&<span style={{padding:"1px 8px",borderRadius:10,background:isActive?(isMob?"rgba(255,255,255,0.25)":tab.color):T.brd,color:isActive?"#fff":T.textSec,fontSize:FS-3,fontWeight:800,minWidth:18,textAlign:"center"}}>{tab.badge}</span>}
            </div>;
          })}
        </div>;
      })()}

      {/* ═══════════════════════════════════════════════════════════════
          TAB: القماش والخامات — pieces, fabric color tables, materials cost, instructions
         ═══════════════════════════════════════════════════════════════ */}
      {activeTab==="fabrics"&&<>
      {order.instructions&&<Card title="📝 تعليمات التشغيل" style={{marginBottom:16}}><div style={{whiteSpace:"pre-wrap",fontSize:FS+1,lineHeight:2}}>{order.instructions}</div></Card>}
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":activeFabs.length>=3?"1fr 1fr 1fr":activeFabs.length===2?"1fr 1fr":"1fr",gap:14,marginBottom:16}}>
        {activeFabs.map(k=>{const colors=gc(order,k);if(colors.length===0)return null;const dt=gdate(order,k);const fp=order["fabricPieces"+k]||[];const fabP=gf(order,k,"Price");const fabU=gf(order,k,"Unit");return<div key={k}><FCTable label={"خامة "+k} fabName={gf(order,k,"Label")} fabPrice={fabP?(fabP+" ج.م"+(fabU?"/"+fabU:"")):""} accent={FCOL[FKEYS.indexOf(k)]} colors={colors} setColors={()=>{}} readOnly/>
          {fp.length>0&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:-8,marginBottom:8}}>{fp.map(p=><span key={p} style={{padding:"3px 10px",borderRadius:8,fontSize:FS-3,fontWeight:600,background:FCOL[FKEYS.indexOf(k)]+"15",color:FCOL[FKEYS.indexOf(k)],border:"1px solid "+FCOL[FKEYS.indexOf(k)]+"30"}}>{gIcon(p,data.garmentTypes)+" "+p}</span>)}</div>}
          {dt&&<div style={{fontSize:FS-2,color:T.textSec,marginTop:-4,marginBottom:10}}>{"تاريخ القص: "+dt}</div>}
        </div>})}
      </div>
      <Card title={"تكلفة الخامات (كمية A = "+t.cutQty+")"} style={{marginBottom:16}}>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:700}}>
          <thead><tr>{["الخامة","السعر","استهلاك/راق","استهلاك/قطعة","الراقات","القطع","التكلفة","تكلفة/قطعة"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
          <tbody>
            {activeFabs.map(k=>{const cons=gcons(order,k),price=gf(order,k,"Price")||0,layers=slay(gc(order,k)),qty=sqty(gc(order,k)),cost=cons*price*layers,perPc=t.cutQty?r2(cost/t.cutQty):0,unit=gf(order,k,"Unit")||"",ppl=(gc(order,k)[0]||{}).pcsPerLayer||1,consPc=r2(cons/ppl);return<tr key={k}><td style={TD}><span style={{display:"inline-block",width:10,height:10,borderRadius:3,background:FCOL[FKEYS.indexOf(k)],marginLeft:8}}/>{gf(order,k,"Label")}</td><td style={TD}>{price+" ج.م"}</td><td style={TD}>{cons+(unit?" "+unit:"")}</td><td style={{...TDB,color:T.purple}}>{consPc+(unit?" "+unit:"")}</td><td style={TDB}>{layers}</td><td style={TDB}>{qty}</td><td style={{...TDB,color:T.accent}}>{fmt(r2(cost))+" ج.م"}</td><td style={{...TDB,color:T.accent}}>{perPc+" ج.م"}</td></tr>})}
            <tr style={{background:T.inputBg||T.cardSolid}}><td colSpan={6} style={{...TD,fontWeight:700}}>اجمالي تكلفة الخامات</td><td style={{...TD,fontWeight:700,color:T.accent}}>{fmt(r2(t.totalFab))+" ج.م"}</td><td style={{...TD,fontWeight:800,color:T.accent,fontSize:FS+2}}>{t.fabPer+" ج.م"}</td></tr>
          </tbody>
        </table></div>
      </Card>
      </>}

      {/* ═══════════════════════════════════════════════════════════════
          TAB: التشغيل والورش — full workshop section (V14.51 redesign)
         ═══════════════════════════════════════════════════════════════ */}
      {activeTab==="workshops"&&<>
      {(()=>{const wds=order.workshopDeliveries||[];
        if(wds.length===0){
          /* Empty state — still show card to encourage action */
          if(!canEdit)return null;
          return<div style={{marginBottom:16,padding:18,borderRadius:14,border:"1px dashed "+T.brd,background:T.cardSolid,textAlign:"center"}}>
            <div style={{fontSize:36,opacity:0.4,marginBottom:8}}>🏭</div>
            <div style={{fontSize:FS+1,fontWeight:800,color:T.text,marginBottom:4}}>التشغيل الخارجي</div>
            <div style={{fontSize:FS-1,color:T.textMut,marginBottom:12}}>لم يتم تسليم أي قطعة لورشة بعد</div>
            {t.cutQty>0&&activeFabs.length>0&&<Btn primary onClick={()=>{setShowDeliver(true);setDWs("");setDType("");setDQty(0);setDPrice("");setDNote("")}} style={{padding:"8px 18px"}}>
              📤 تسليم أول ورشة
            </Btn>}
          </div>;
        }
        /* Group deliveries by workshop */
        const wsGroup={};
        wds.forEach((wd,idx)=>{if(!wsGroup[wd.wsName])wsGroup[wd.wsName]={items:[],idxs:[]};wsGroup[wd.wsName].items.push(wd);wsGroup[wd.wsName].idxs.push(idx)});
        const wsNames=Object.keys(wsGroup);
        /* Summary totals */
        const totalDel=wds.reduce((s,wd)=>s+(Number(wd.qty)||0),0);
        const totalRcv=wds.reduce((s,wd)=>s+(wd.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0),0);
        const totalBal=totalDel-totalRcv;
        const overallProgress=totalDel>0?Math.round((totalRcv/totalDel)*100):0;

        return<div style={{marginBottom:16}}>
          <style>{`
            .ws-card{transition:all 0.2s ease;overflow:hidden}
            .ws-card:hover{box-shadow:0 6px 20px -6px rgba(139,92,246,0.15)}
            .ws-progress-bar{height:6px;border-radius:3px;background:${T.bg};overflow:hidden}
            .ws-progress-fill{height:100%;border-radius:3px;transition:width 0.8s cubic-bezier(0.4,0,0.2,1)}
            .ws-expand-btn{cursor:pointer;padding:6px 12px;border-radius:8px;background:${T.bg};color:${T.textSec};font-size:${FS-2}px;font-weight:700;border:1px solid ${T.brd};display:inline-flex;align-items:center;gap:6px;transition:all 0.15s}
            .ws-expand-btn:hover{background:${T.accent}08;color:${T.accent};border-color:${T.accent}30}
            .ws-timeline-item{display:grid;grid-template-columns:auto 1fr auto;gap:10px;padding:8px 12px;border-radius:8px;align-items:center;font-size:${FS-1}px}
            .ws-action-btn{padding:5px 10px;border-radius:7px;font-size:${FS-2}px;font-weight:700;cursor:pointer;border:1px solid transparent;transition:all 0.15s;display:inline-flex;align-items:center;gap:4px}
            .print-menu-item{padding:10px 14px;cursor:pointer;transition:background 0.15s;font-size:${FS-1}px;display:flex;align-items:center;gap:8px;border-bottom:1px solid ${T.brd}}
            .print-menu-item:last-child{border-bottom:none}
            .print-menu-item:hover{background:${T.accent}08}
          `}</style>

          <div style={{background:T.cardSolid,borderRadius:14,border:"1px solid "+T.brd,overflow:"hidden"}}>
            {/* Header */}
            <div style={{padding:"14px 18px",borderBottom:"1px solid "+T.brd,background:"linear-gradient(135deg,#8B5CF606,#8B5CF602)",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:36,height:36,borderRadius:10,background:"#8B5CF612",display:"flex",alignItems:"center",justifyContent:"center",color:"#8B5CF6"}}>
                  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 18a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2"/><rect x="2" y="6" width="20" height="16" rx="2"/><path d="M2 10h20"/></svg>
                </div>
                <div>
                  <div style={{fontSize:FS+2,fontWeight:800,color:T.text}}>التشغيل الخارجي</div>
                  <div style={{fontSize:FS-2,color:T.textMut}}>{wsNames.length+" ورشة • "+wds.length+" حركة"}</div>
                </div>
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {canEdit&&!order.closed&&t.cutQty>0&&activeFabs.length>0&&<Btn small onClick={()=>{setShowDeliver(true);setDWs("");setDType("");setDQty(0);setDPrice("");setDNote("")}} style={{background:"#8B5CF6",color:"#fff",border:"none",fontWeight:700}}>
                  <span style={{marginLeft:4}}>📤</span>تسليم جديد
                </Btn>}
                {/* Print menu */}
                <div style={{position:"relative"}} onClick={e=>e.stopPropagation()}>
                  <Btn small onClick={()=>setShowPrintMenu(!showPrintMenu)} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd,fontWeight:700}}>
                    <span style={{marginLeft:4}}>🖨</span>كشف
                    <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:4}}><polyline points="6 9 12 15 18 9"/></svg>
                  </Btn>
                  {showPrintMenu&&<><div onClick={()=>setShowPrintMenu(false)} style={{position:"fixed",inset:0,zIndex:998}}/>
                    <div style={{position:"absolute",top:"100%",left:0,marginTop:4,background:T.cardSolid,border:"1px solid "+T.brd,borderRadius:10,boxShadow:"0 8px 24px rgba(0,0,0,0.12)",zIndex:999,minWidth:220,overflow:"hidden"}}>
                      <div className="print-menu-item" onClick={()=>{printWorkshopReport(order,"");setShowPrintMenu(false)}}>
                        <span>🏭</span>
                        <div><div style={{fontWeight:700,color:T.text}}>كشف الأوردر كامل</div><div style={{fontSize:FS-3,color:T.textMut}}>جميع الورش والحركات</div></div>
                      </div>
                      {wsNames.map(name=><div key={name} className="print-menu-item" onClick={()=>{printWorkshopReport(order,name);setShowPrintMenu(false)}}>
                        <span>🏭</span>
                        <div><div style={{fontWeight:700,color:T.text}}>{name}</div><div style={{fontSize:FS-3,color:T.textMut}}>كشف ورشة محددة</div></div>
                      </div>)}
                    </div></>}
                </div>
              </div>
            </div>

            {/* Summary stats row */}
            <div style={{padding:14,borderBottom:"1px solid "+T.brd,background:T.bg+"40"}}>
              <div style={{display:"grid",gridTemplateColumns:isMob?"repeat(2,1fr)":"repeat(4,1fr)",gap:10,marginBottom:12}}>
                <div style={{padding:"10px 12px",borderRadius:10,background:T.cardSolid,border:"1px solid "+T.brd,display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:32,height:32,borderRadius:8,background:"#8B5CF612",color:"#8B5CF6",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  </div>
                  <div><div style={{fontSize:FS-3,color:T.textMut,fontWeight:600}}>الورش</div><div style={{fontSize:FS+3,fontWeight:800,color:T.text,lineHeight:1}}>{wsNames.length}</div></div>
                </div>
                <div style={{padding:"10px 12px",borderRadius:10,background:T.cardSolid,border:"1px solid "+T.brd,display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:32,height:32,borderRadius:8,background:T.accent+"12",color:T.accent,display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
                  </div>
                  <div><div style={{fontSize:FS-3,color:T.textMut,fontWeight:600}}>تسليم</div><div style={{fontSize:FS+3,fontWeight:800,color:T.accent,lineHeight:1}}>{totalDel}</div></div>
                </div>
                <div style={{padding:"10px 12px",borderRadius:10,background:T.cardSolid,border:"1px solid "+T.brd,display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:32,height:32,borderRadius:8,background:T.ok+"12",color:T.ok,display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="17" y1="7" x2="7" y2="17"/><polyline points="17 17 7 17 7 7"/></svg>
                  </div>
                  <div><div style={{fontSize:FS-3,color:T.textMut,fontWeight:600}}>استلام</div><div style={{fontSize:FS+3,fontWeight:800,color:T.ok,lineHeight:1}}>{totalRcv}</div></div>
                </div>
                <div style={{padding:"10px 12px",borderRadius:10,background:T.cardSolid,border:"1px solid "+T.brd,display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:32,height:32,borderRadius:8,background:(totalBal>0?T.err:T.ok)+"12",color:totalBal>0?T.err:T.ok,display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{totalBal>0?<><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>:<><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>}</svg>
                  </div>
                  <div><div style={{fontSize:FS-3,color:T.textMut,fontWeight:600}}>الرصيد</div><div style={{fontSize:FS+3,fontWeight:800,color:totalBal>0?T.err:T.ok,lineHeight:1}}>{totalBal}</div></div>
                </div>
              </div>
              {/* Overall progress */}
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                  <span style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>نسبة الإنجاز الإجمالية</span>
                  <span style={{fontSize:FS-1,fontWeight:800,color:overallProgress>=80?T.ok:overallProgress>=50?T.warn:T.err}}>{overallProgress}%</span>
                </div>
                <div className="ws-progress-bar"><div className="ws-progress-fill" style={{width:overallProgress+"%",background:overallProgress>=80?"linear-gradient(90deg,"+T.ok+","+T.ok+"CC)":overallProgress>=50?"linear-gradient(90deg,"+T.warn+","+T.warn+"CC)":"linear-gradient(90deg,"+T.err+","+T.err+"CC)"}}/></div>
              </div>
            </div>

            {/* Workshop cards */}
            <div style={{padding:14,display:"flex",flexDirection:"column",gap:12}}>
              {wsNames.map(wsName=>{const grp=wsGroup[wsName];const items=grp.items;
                const wsObj=workshops.find(w=>w.name===wsName);
                const wsDel=items.reduce((s,wd)=>s+(Number(wd.qty)||0),0);
                const wsRcv=items.reduce((s,wd)=>s+(wd.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0),0);
                const wsBal=wsDel-wsRcv;
                const wsProgress=wsDel>0?Math.round((wsRcv/wsDel)*100):0;
                /* Auto-expand incomplete workshops; user can toggle */
                const wsKey=order.id+":"+wsName;
                const isExpanded=wsExpand[wsKey]===true;/* V15.36: Collapsed by default — user clicks to expand */
                /* Latest dates */
                const lastDel=items.map(wd=>wd.date).sort().slice(-1)[0]||"-";
                const allRcv=items.flatMap(wd=>(wd.receives||[]).map(r=>({...r,piece:wd.garmentType,wdIdx:grp.idxs[items.indexOf(wd)]})));
                const lastRcv=allRcv.length>0?allRcv.map(r=>r.date).sort().slice(-1)[0]:"-";
                /* Days since last activity */
                const lastActivity=[lastDel,lastRcv].filter(d=>d&&d!=="-").sort().slice(-1)[0]||lastDel;
                const ageDays=lastActivity&&lastActivity!=="-"?Math.floor((new Date()-new Date(lastActivity))/(1000*60*60*24)):0;
                const isStale=ageDays>7&&wsBal>0;
                /* Status color */
                const statusColor=wsBal===0?T.ok:wsProgress>=50?T.warn:T.err;

                return<div key={wsName} className="ws-card" style={{background:T.cardSolid,borderRadius:12,border:"1px solid "+T.brd,borderRight:"3px solid "+statusColor}}>
                  {/* Card header */}
                  <div style={{padding:"12px 14px",cursor:"pointer"}} onClick={()=>setWsExpand(p=>({...p,[wsKey]:!isExpanded}))}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8,marginBottom:8}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:3}}>
                          <span style={{fontSize:FS+1,fontWeight:800,color:T.text}}>🏭 {wsName}</span>
                          {wsObj?.owner&&<span style={{fontSize:FS-3,color:T.textMut}}>• {wsObj.owner}</span>}
                          {isStale&&<span style={{fontSize:FS-3,padding:"2px 8px",borderRadius:5,background:T.err+"12",color:T.err,fontWeight:700,border:"1px solid "+T.err+"25"}}>🔴 {ageDays} يوم بدون حركة</span>}
                        </div>
                        {/* Pieces breakdown */}
                        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                          {items.map((wd,i)=>{const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);const bal=(Number(wd.qty)||0)-rcvd;
                            return<span key={i} style={{fontSize:FS-3,padding:"2px 8px",borderRadius:5,background:bal>0?T.warn+"10":T.ok+"10",color:bal>0?T.warn:T.ok,border:"1px solid "+(bal>0?T.warn:T.ok)+"25",fontWeight:700}}>
                              {wd.garmentType?wd.garmentType+": ":""}{wd.qty}/{rcvd}{bal>0?" ("+bal+" متبقي)":" ✓"}
                            </span>;
                          })}
                        </div>
                      </div>
                      <div style={{fontSize:FS+2,fontWeight:800,color:statusColor}}>{wsProgress}%</div>
                    </div>
                    {/* Stats row */}
                    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginBottom:8}}>
                      <div style={{padding:"6px 8px",borderRadius:6,background:T.accent+"06",border:"1px solid "+T.accent+"15",textAlign:"center"}}>
                        <div style={{fontSize:FS-3,color:T.textMut,fontWeight:600}}>تسليم</div>
                        <div style={{fontSize:FS,fontWeight:800,color:T.accent}}>{wsDel}</div>
                      </div>
                      <div style={{padding:"6px 8px",borderRadius:6,background:T.ok+"06",border:"1px solid "+T.ok+"15",textAlign:"center"}}>
                        <div style={{fontSize:FS-3,color:T.textMut,fontWeight:600}}>استلام</div>
                        <div style={{fontSize:FS,fontWeight:800,color:T.ok}}>{wsRcv}</div>
                      </div>
                      <div style={{padding:"6px 8px",borderRadius:6,background:(wsBal>0?T.err:T.ok)+"06",border:"1px solid "+(wsBal>0?T.err:T.ok)+"15",textAlign:"center"}}>
                        <div style={{fontSize:FS-3,color:T.textMut,fontWeight:600}}>رصيد</div>
                        <div style={{fontSize:FS,fontWeight:800,color:wsBal>0?T.err:T.ok}}>{wsBal}</div>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="ws-progress-bar"><div className="ws-progress-fill" style={{width:wsProgress+"%",background:wsProgress>=80?"linear-gradient(90deg,"+T.ok+","+T.ok+"CC)":wsProgress>=50?"linear-gradient(90deg,"+T.warn+","+T.warn+"CC)":"linear-gradient(90deg,"+T.err+","+T.err+"CC)"}}/></div>
                    {/* Dates + expand indicator */}
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8,flexWrap:"wrap",gap:6}}>
                      <div style={{display:"flex",gap:10,fontSize:FS-3,color:T.textMut,flexWrap:"wrap"}}>
                        <span>📤 آخر تسليم: <b style={{color:T.textSec}}>{lastDel}</b></span>
                        {lastRcv!=="-"&&<span>📥 آخر استلام: <b style={{color:T.textSec}}>{lastRcv}</b></span>}
                      </div>
                      <div className="ws-expand-btn">
                        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{transform:isExpanded?"rotate(180deg)":"",transition:"transform 0.2s"}}><polyline points="6 9 12 15 18 9"/></svg>
                        <span>{isExpanded?"إخفاء السجل":"عرض السجل ("+(items.length+allRcv.length)+" حركة)"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Expanded timeline */}
                  {isExpanded&&<div style={{padding:"0 14px 14px",borderTop:"1px solid "+T.brd}}>
                    <div style={{fontSize:FS-2,fontWeight:700,color:T.textSec,margin:"10px 0 8px",padding:"0 4px",textTransform:"uppercase",letterSpacing:"0.5px"}}>السجل التفصيلي</div>
                    {items.map((wd,wdi)=>{const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);const pieceBal=(Number(wd.qty)||0)-rcvd;
                      return<div key={wdi} style={{marginBottom:10,padding:10,borderRadius:10,background:T.bg+"60",border:"1px solid "+T.brd}}>
                        {/* Piece header */}
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:6}}>
                          <div style={{fontWeight:700,color:T.text}}>
                            {wd.garmentType?gIcon(wd.garmentType,data.garmentTypes)+" "+wd.garmentType:"عام"}
                          </div>
                          <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                            {wd.agreedDays>0&&<span style={{fontSize:FS-3,color:T.textMut}}>⏱ متفق: {wd.agreedDays} يوم</span>}
                            <span style={{fontSize:FS-3,padding:"2px 8px",borderRadius:5,background:pieceBal>0?T.err+"10":T.ok+"10",color:pieceBal>0?T.err:T.ok,fontWeight:700}}>{pieceBal>0?"باقي "+pieceBal:"✓ مكتمل"}</span>
                          </div>
                        </div>
                        {/* Timeline */}
                        <div style={{display:"flex",flexDirection:"column",gap:3}}>
                          {/* Delivery event */}
                          <div className="ws-timeline-item" style={{background:"#8B5CF608",border:"1px solid #8B5CF615"}}>
                            <span style={{fontSize:FS-2,padding:"3px 8px",borderRadius:5,background:"#8B5CF6",color:"#fff",fontWeight:700,whiteSpace:"nowrap"}}>📤 تسليم</span>
                            <div style={{display:"flex",flexDirection:"column",minWidth:0}}>
                              <div style={{fontSize:FS-1,color:T.text,fontWeight:700}}>{wd.qty} قطعة</div>
                              <div style={{fontSize:FS-3,color:T.textMut}}>{wd.date}{wd.notes?" • "+wd.notes:""}</div>
                            </div>
                            <div/>
                          </div>
                          {/* Receive events */}
                          {(wd.receives||[]).map((r,ri)=>{const isSet=!!r.isSettlement;
                            return<div key={ri} className="ws-timeline-item" style={{background:isSet?T.err+"06":T.ok+"06",border:"1px solid "+(isSet?T.err:T.ok)+"15"}}>
                              <span style={{fontSize:FS-2,padding:"3px 8px",borderRadius:5,background:isSet?T.err:T.ok,color:"#fff",fontWeight:700,whiteSpace:"nowrap"}}>{isSet?"⚖️ تسوية":"📥 استلام"}</span>
                              <div style={{display:"flex",flexDirection:"column",minWidth:0}}>
                                <div style={{fontSize:FS-1,color:T.text,fontWeight:700}}>{r.qty} قطعة{r.quality?" • "+r.quality:""}</div>
                                <div style={{fontSize:FS-3,color:T.textMut,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.date}{r.notes?" • "+r.notes:""}</div>
                              </div>
                              <div/>
                            </div>;
                          })}
                          {(wd.receives||[]).length===0&&<div style={{padding:"6px 12px",borderRadius:8,background:T.bg,textAlign:"center",fontSize:FS-2,color:T.textMut,fontStyle:"italic"}}>لم يتم استلام أي كمية بعد</div>}
                        </div>
                      </div>;
                    })}
                    {/* Action buttons for this workshop */}
                    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:10,paddingTop:10,borderTop:"1px solid "+T.brd}}>
                      <div onClick={e=>{e.stopPropagation();printWorkshopReport(order,wsName)}} className="ws-action-btn" style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>
                        <span>🖨</span><span>طباعة الكشف</span>
                      </div>
                      {wsObj?.phone&&<div onClick={e=>{e.stopPropagation();const msg="*CLARK — متابعة تشغيل*%0A%0A• الورشة: *"+wsName+"*%0A• الموديل: *"+order.modelNo+"*%0A• تسليم: *"+wsDel+"*%0A• استلام: *"+wsRcv+"*%0A• رصيد: *"+wsBal+"*%0A"+(wsBal>0?"%0A⚠️ *برجاء الاهتمام بالتسليم*":"%0A✅ *الحمد لله - مكتمل*");openWA("https://wa.me/"+(wsObj.phone.replace(/[^0-9]/g,""))+"?text="+msg,"_blank")}} className="ws-action-btn" style={{background:"#25D36608",color:"#25D366",border:"1px solid #25D36625"}}>
                        <span>📱</span><span>واتساب للورشة</span>
                      </div>}
                    </div>
                  </div>}
                </div>;
              })}
            </div>
          </div>
        </div>;
      })()}

      </>}

      {/* ═══════════════════════════════════════════════════════════════
          TAB: الاكسسوار — accessories cost table
         ═══════════════════════════════════════════════════════════════ */}
      {activeTab==="accessories"&&<>
        <Card title={"تكاليف الاكسسوار"+(accItems.length>0?" ("+accItems.length+" بند)":"")} style={{marginBottom:16}}>{accItems.length>0?<div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:420}}>
          <thead><tr>
            <th style={{...TH,padding:"10px 12px",textAlign:"right",width:"50%"}}>الوصف</th>
            <th style={{...TH,padding:"10px 12px",textAlign:"center",width:"22%",whiteSpace:"nowrap"}}>سعر القطعة</th>
            <th style={{...TH,padding:"10px 12px",textAlign:"center",width:"28%",whiteSpace:"nowrap"}}>اجمالي</th>
          </tr></thead>
          <tbody>
            {accItems.map((a,i)=><tr key={i}>
              <td style={{...TD,fontWeight:700,padding:"10px 12px",textAlign:"right",fontSize:FS}}>{a.name}</td>
              <td style={{...TD,padding:"10px 12px",textAlign:"center",whiteSpace:"nowrap",fontSize:FS-1,color:T.textSec}}>{fmt(a.price)+" ج.م"}</td>
              <td style={{...TDB,color:T.accent,padding:"10px 12px",textAlign:"center",whiteSpace:"nowrap",fontSize:FS,fontWeight:700}}>{fmt(a.price*t.cutQty)+" ج.م"}</td>
            </tr>)}
            <tr style={{background:T.inputBg||T.cardSolid,borderTop:"2px solid "+T.brd}}>
              <td style={{...TD,fontWeight:800,padding:"12px",textAlign:"right",fontSize:FS}}>الاجمالي</td>
              <td style={{...TD,fontWeight:800,padding:"12px",textAlign:"center",whiteSpace:"nowrap",fontSize:FS-1}}>{t.accPer+" ج.م/قطعة"}</td>
              <td style={{...TD,fontWeight:800,color:T.accent,padding:"12px",textAlign:"center",whiteSpace:"nowrap",fontSize:FS+1}}>{fmt(accAll)+" ج.م"}</td>
            </tr>
          </tbody>
        </table></div>:<div style={{textAlign:"center",padding:20,color:T.textSec}}>لم يتم اضافة بنود</div>}</Card>
      </>}

      {/* ═══════════════════════════════════════════════════════════════
          TAB: المبيعات والمخزن — stock delivery + sales-to-customers
         ═══════════════════════════════════════════════════════════════ */}
      {activeTab==="sales"&&<>
        {(()=>{
          const wds=order.workshopDeliveries||[];
          const pieces=order.orderPieces||[];
          let canStock=false;let blockMsg="";
          if(wds.length===0){blockMsg="⚠️ لا يمكن تسليم مخزن الجاهز - لم يتم تسليم طقم كامل للمصنع حتى الان"}
          else if(pieces.length>0){
            const missing=pieces.filter(p=>{
              const rcvdForP=wds.filter(wd=>wd.garmentType===p).reduce((s,wd)=>(wd.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0)+s,0);
              return rcvdForP===0
            });
            if(missing.length>0){blockMsg="⚠️ لا يمكن تسليم مخزن جاهز - لم يتم استلام: "+missing.join("، ")+" من الورش بعد"}
            else{canStock=true}
          } else {
            const totalRcv=wds.reduce((s,wd)=>(wd.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0)+s,0);
            if(totalRcv===0){blockMsg="⚠️ لا يمكن تسليم مخزن جاهز - لم يتم استلام أي كمية من الورش بعد"}
            else{canStock=true}
          }
          const stockDel=getConfirmedStock(order);const pendingDel=(order.deliveries||[]).filter(d=>d.status==="pending").reduce((s,d)=>s+(Number(d.qty)||0),0);const stockRemain=Math.max(0,t.cutQty-stockDel-pendingDel);
          return<Card title={"تسليم مخزن جاهز"+((order.deliveries||[]).some(d=>d.status==="pending")?" ⏳":"")} extra={canEdit&&canStock&&<Btn primary small onClick={()=>updOrder(sel,o=>{if(!o.deliveries)o.deliveries=[];o.deliveries.push({date:new Date().toISOString().split("T")[0],qty:0,notes:"",createdBy:userName||"",status:"pending",type:"series"});const newIdx=o.deliveries.length-1;/* V16.26: capture before setTimeout to avoid stale draft */setTimeout(()=>setEditStockIdx(newIdx),100)})}>+ تسليم</Btn>}>
            {!canStock&&<div style={{padding:10,background:T.err+"10",border:"1px solid "+T.err+"30",borderRadius:8,marginBottom:10,fontSize:FS,color:T.err,fontWeight:600}}>{blockMsg}</div>}
            <div style={{display:"flex",gap:10,marginBottom:10,flexWrap:"wrap"}}>
              <span style={{padding:"6px 12px",borderRadius:8,background:T.err+"12",color:T.err,fontWeight:700,fontSize:FS}}>{"كمية القص: "+t.cutQty}</span>
              <span style={{padding:"6px 12px",borderRadius:8,background:T.ok+"12",color:T.ok,fontWeight:700,fontSize:FS}}>{"✅ مؤكد: "+stockDel}</span>
              {pendingDel>0&&<span style={{padding:"6px 12px",borderRadius:8,background:"#F59E0B12",color:"#F59E0B",fontWeight:700,fontSize:FS}}>{"⏳ معلّق: "+pendingDel}</span>}
              <span style={{padding:"6px 12px",borderRadius:8,background:stockRemain>0?T.warn+"12":T.ok+"12",color:stockRemain>0?T.warn:T.ok,fontWeight:700,fontSize:FS}}>{"المتبقي: "+stockRemain}</span>
              {/* V18.21: Show series vs broken split */}
              {(()=>{const ser=(order.deliveries||[]).filter(d=>d.status!=="pending"&&(d.type||"series")==="series").reduce((s,d)=>s+(Number(d.qty)||0),0);const brk=(order.deliveries||[]).filter(d=>d.status!=="pending"&&d.type==="broken").reduce((s,d)=>s+(Number(d.qty)||0),0);return(ser>0||brk>0)?<><span style={{padding:"6px 12px",borderRadius:8,background:"#0EA5E912",color:"#0EA5E9",fontWeight:700,fontSize:FS}}>{"📦 سيري: "+ser}</span><span style={{padding:"6px 12px",borderRadius:8,background:"#8B5CF612",color:"#8B5CF6",fontWeight:700,fontSize:FS}}>{"🧩 كسر: "+brk}</span></>:null})()}
            </div>
            <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:520}}><thead><tr>{["#","التاريخ","الكمية","النوع","الحالة","ملاحظات",...(canEdit?[""]:[])] .map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
            {(order.deliveries||[]).map((d,i)=>{const isEd=editStockIdx===i&&canEdit;
              const dType=d.type||"series";
              return<tr key={i} style={{background:isEd?T.warn+"06":"transparent"}}>
              <td style={TD}>{i+1}</td>
              <td style={{...TD,minWidth:130}}>{isEd?<Inp type="date" value={d.date} onChange={v=>updOrder(sel,o=>{o.deliveries[i].date=v})}/>:d.date}</td>
              <td style={{...TD,minWidth:80}}>{isEd?<div id="stock-qty-input-wrap"><Inp type="number" value={d.qty} onChange={v=>updOrder(sel,o=>{const totalRcvd=(o.workshopDeliveries||[]).reduce((s,wd)=>(wd.receives||[]).filter(r=>!r.isSettlement).reduce((ss,r)=>ss+(Number(r.qty)||0),0)+s,0);const otherDels=o.deliveries.filter((_,j)=>j!==i).reduce((s,x)=>s+(Number(x.qty)||0),0);const maxQ=Math.min(t.cutQty-otherDels,totalRcvd-otherDels);o.deliveries[i].qty=Math.min(Math.max(0,Number(v)||0),Math.max(0,maxQ));o.deliveredQty=getConfirmedStock(o);o.status=recomputeStatus(o)})}/></div>:<span style={{fontWeight:700,color:T.accent}}>{d.qty}</span>}</td>
              {/* V18.21: Type column — series (default) / broken */}
              <td style={{...TD,minWidth:90,textAlign:"center"}}>{isEd?<Sel value={dType} onChange={v=>updOrder(sel,o=>{o.deliveries[i].type=v})}><option value="series">📦 سيري</option><option value="broken">🧩 كسر</option></Sel>:<span style={{padding:"3px 8px",borderRadius:6,fontWeight:700,fontSize:FS-2,background:dType==="broken"?"#8B5CF615":"#0EA5E915",color:dType==="broken"?"#8B5CF6":"#0EA5E9"}}>{dType==="broken"?"🧩 كسر":"📦 سيري"}</span>}</td>
              <td style={{...TD,textAlign:"center"}}>{d.status==="pending"?<span style={{color:"#F59E0B",fontWeight:700,fontSize:FS-1}}>⏳ معلّق</span>:d.confirmedBy?<span style={{color:"#10B981",fontWeight:700,fontSize:FS-1}}>{"✅ "+d.confirmedBy}</span>:<span style={{color:"#10B981",fontWeight:700,fontSize:FS-1}}>✅ مؤكد</span>}</td>
              <td style={{...TD,minWidth:120}}>{isEd?<Inp value={d.notes} onChange={v=>updOrder(sel,o=>{o.deliveries[i].notes=v})} placeholder="ملاحظات"/>:(d.notes||"-")}</td>
              {canEdit&&<td style={{...TD,whiteSpace:"nowrap"}}><div style={{display:"flex",gap:3}}>
                {isEd?<><Btn small primary onClick={()=>setEditStockIdx(null)} title="حفظ">💾</Btn><Btn small onClick={()=>{setEditStockIdx(null);printLabel("مخزن جاهز",order,"مخزن جاهز",d.qty,d.date,data.garmentTypes,{type:"deliver",delDate:d.date,delQty:d.qty})}} style={{background:"#F59E0B12",color:"#F59E0B",border:"1px solid #F59E0B30"}} title="طباعة ليبل حراري">🏷️</Btn><Btn danger small onClick={()=>{updOrder(sel,o=>{o.deliveries.splice(i,1);o.deliveredQty=getConfirmedStock(o);o.status=recomputeStatus(o)});setEditStockIdx(null)}}>🗑️</Btn></>
                :<Btn small onClick={()=>setEditStockIdx(i)} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}} title="تعديل">✏️</Btn>}
              </div></td>}
            </tr>})}
            {(!order.deliveries||order.deliveries.length===0)&&<tr><td colSpan={canEdit?7:6} style={{...TD,textAlign:"center",color:T.textSec}}>لا توجد تسليمات</td></tr>}
          </tbody></table></div>
          </Card>})()}

      {/* V16.16: Sales to customers — collapsible block.
          Reads o.customerDeliveries / o.customerReturns directly off the order
          (already populated by the cust-deliver flow), so no scan of sessions. */}
      {(()=>{
        const dels=order.customerDeliveries||[];
        const rets=order.customerReturns||[];
        if(dels.length===0&&rets.length===0)return null;
        /* Aggregate per customer */
        const byCust={};
        dels.forEach(d=>{
          const k=d.custId||"_unknown";
          if(!byCust[k])byCust[k]={custId:k,del:0,ret:0,lastDate:"",dels:[],rets:[]};
          byCust[k].del+=Number(d.qty)||0;
          byCust[k].dels.push(d);
          if((d.date||"")>byCust[k].lastDate)byCust[k].lastDate=d.date||"";
        });
        rets.forEach(r=>{
          const k=r.custId||"_unknown";
          if(!byCust[k])byCust[k]={custId:k,del:0,ret:0,lastDate:"",dels:[],rets:[]};
          byCust[k].ret+=Number(r.qty)||0;
          byCust[k].rets.push(r);
          if((r.date||"")>byCust[k].lastDate)byCust[k].lastDate=r.date||"";
        });
        const rows=Object.values(byCust).map(x=>({...x,net:x.del-x.ret}))
          .filter(x=>x.del>0||x.ret>0)
          .sort((a,b)=>b.net-a.net);
        const totalDel=rows.reduce((s,x)=>s+x.del,0);
        const totalRet=rows.reduce((s,x)=>s+x.ret,0);
        const totalNet=totalDel-totalRet;
        return<Card style={{marginBottom:16}}>
          <div onClick={()=>setSalesExpand(!salesExpand)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",userSelect:"none",gap:10,flexWrap:"wrap"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:FS+4}}>{salesExpand?"▼":"◀"}</span>
              <span style={{fontSize:FS+1,fontWeight:800,color:"#10B981"}}>📦 المبيعات للعملاء</span>
              <span style={{fontSize:FS-2,color:T.textMut,fontWeight:600}}>({rows.length} عميل)</span>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",fontSize:FS-2,fontWeight:700,fontVariantNumeric:"tabular-nums"}}>
              <span style={{padding:"4px 10px",borderRadius:6,background:"#10B98110",color:"#047857",border:"1px solid #10B98130"}}>📤 تسليم: {fmt(totalDel)}</span>
              {totalRet>0&&<span style={{padding:"4px 10px",borderRadius:6,background:"#EF444410",color:"#B91C1C",border:"1px solid #EF444430"}}>↩️ مرتجع: {fmt(totalRet)}</span>}
              <span style={{padding:"4px 10px",borderRadius:6,background:"#0EA5E910",color:"#0369A1",border:"1px solid #0EA5E930"}}>🛒 صافي مبيع: {fmt(totalNet)}</span>
            </div>
          </div>
          {salesExpand&&<div style={{marginTop:14,paddingTop:14,borderTop:"1px solid "+T.brd}}>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",minWidth:520}}>
                <thead><tr>{["العميل","تليفون","تسليم","مرتجع","صافي","آخر حركة"].map(h=><th key={h} style={{...TH,fontSize:FS-2}}>{h}</th>)}</tr></thead>
                <tbody>
                  {rows.map(x=>{const c=customers.find(cc=>cc.id===x.custId);
                    return<tr key={x.custId} style={{borderBottom:"1px solid "+T.brd}}>
                      <td style={{...TD,fontWeight:700}}>{c?c.name:"— (عميل محذوف)"}</td>
                      <td style={{...TD,fontSize:FS-2,color:T.textMut,direction:"ltr",textAlign:"right"}}>{c?.phone||"—"}</td>
                      <td style={{...TD,color:"#047857",fontWeight:800,fontVariantNumeric:"tabular-nums"}}>{fmt(x.del)}</td>
                      <td style={{...TD,color:x.ret>0?"#B91C1C":T.textMut,fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{x.ret>0?fmt(x.ret):"—"}</td>
                      <td style={{...TD,color:"#0369A1",fontWeight:800,fontVariantNumeric:"tabular-nums"}}>{fmt(x.net)}</td>
                      <td style={{...TD,fontSize:FS-2,color:T.textMut,direction:"ltr",textAlign:"right"}}>{x.lastDate||"—"}</td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          </div>}
        </Card>;
      })()}
      </>}

      {/* ═══════════════════════════════════════════════════════════════
          TAB: التكاليف — full cost summary (materials + accessories + extras + add-extra button)
         ═══════════════════════════════════════════════════════════════ */}
      {activeTab==="costs"&&<>
      <Card title="ملخص تكلفة الموديل" accent={"linear-gradient(135deg,"+T.accent+","+T.accent+"CC)"} style={{marginBottom:16}}>
        {(()=>{const pieces=order.orderPieces||[];const linked=new Set();FKEYS.forEach(k=>{if(gf(order,k))(order["fabricPieces"+k]||[]).forEach(p=>linked.add(p))});const missing=pieces.filter(p=>!linked.has(p));
          return missing.length>0&&pieces.length>1?<div style={{padding:"8px 12px",borderRadius:8,background:"#F59E0B10",border:"1px solid #F59E0B30",marginBottom:10,fontSize:FS-1,fontWeight:700,color:"#F59E0B"}}>{"⚠️ تكلفة غير مكتملة — ناقص: "+missing.join("، ")}</div>:null})()}
        {(()=>{
          /* V15.10: Extra costs sum (هالك، نقل، تغليف، إلخ).
             V18.97: Each cost row has `costType`: "total" (default, legacy) means amount IS the total cost.
             "perPiece" means amount is per-piece — total = amount * cutQty.
             Always backward-compatible: rows without costType are treated as "total". */
          const extraCosts=order.extraCosts||[];
          const cutQty=t.cutQty||0;
          const ecTotal=(x)=>{
            const amt=Number(x.amount)||0;
            return x.costType==="perPiece"?amt*cutQty:amt;
          };
          const ecPer=(x)=>{
            const amt=Number(x.amount)||0;
            if(x.costType==="perPiece")return amt;
            return cutQty>0?amt/cutQty:0;
          };
          const extraTotal=extraCosts.reduce((s,x)=>s+ecTotal(x),0);
          const settCost=Number(order.settlement?.cost)||0;
          const totalAllCost=t.costAll+settCost+extraTotal;
          const finalPer=order.deliveredQty>0?totalAllCost/order.deliveredQty:0;
          /* V19.76.7: per-piece for the grand total uses the same cutQty divisor as
             the other rows (materials/accessories/extras) — keeps the column
             consistent. Previously التكلفة الفعلية divided by deliveredQty which
             produced a different scale (e.g. 161,290 / 48 = 3361 vs the materials'
             95,090 / 400 = 237.73). User flagged that "الرقم لتكلفة القطعة مش صح". */
          const totalAllPer = cutQty > 0 ? totalAllCost / cutQty : 0;
          return<><table style={{width:"100%",borderCollapse:"collapse",fontSize:FS+1}}><thead><tr>{["البند","التكلفة الكلية","تكلفة القطعة"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
          {/* V19.76.7: extras + settlement now appear BEFORE the total. The total
              row is the LAST row and sums everything above it. User report:
              "اي بند اضافي يطلع فوق في الجدول والاجمالي يظهر تحت اخر صف". */}
          <tr><td style={TD}>تكلفة الخامات</td><td style={TDB}>{fmt(r2(t.totalFab))+" ج.م"}</td><td style={TDB}>{t.fabPer+" ج.م"}</td></tr>
          <tr><td style={TD}>تكاليف الاكسسوار</td><td style={TDB}>{fmt(accAll)+" ج.م"}</td><td style={TDB}>{t.accPer+" ج.م"}</td></tr>
          {order.settlement&&<tr style={{background:T.err+"08"}}><td style={{...TD,fontWeight:800,color:T.err}}>{"🔴 هالك تسوية ("+order.settlement.qty+" قطعة)"}</td><td style={{...TD,fontWeight:800,color:T.err}}>{fmt(r2(order.settlement.cost))+" ج.م"}</td><td style={{...TD,fontWeight:700,color:T.err}}>{order.settlement.reason}</td></tr>}
          {/* V15.10 + V18.97: Extra costs rows — show both total + per-piece, with badge indicating costType */}
          {extraCosts.map((x,i)=>{const isPerPiece=x.costType==="perPiece";const xTotal=ecTotal(x);const xPer=ecPer(x);
            return<tr key={x.id||i} style={{background:"#F59E0B06"}}>
            <td style={{...TD,fontWeight:700,color:"#F59E0B"}}>
              <span>{getCategoryIcon(x.category)+" "+(x.category||"تكلفة إضافية")}</span>
              <span style={{marginInlineStart:6,padding:"1px 7px",borderRadius:5,fontSize:FS-2,fontWeight:800,background:isPerPiece?"#10B98115":"#6366F115",color:isPerPiece?"#059669":"#4F46E5",border:"1px solid "+(isPerPiece?"#10B98140":"#6366F140")}} title={isPerPiece?"المبلغ المدخَل لكل قطعة (يُضرب في كمية القص)":"المبلغ المدخَل إجمالي (يُقسم على كمية القص)"}>{isPerPiece?"🔢 على القطعة":"📦 إجمالي"}</span>
              {x.reason&&<span style={{marginInlineStart:6,color:T.textSec,fontWeight:500,fontSize:FS-1}}>— {x.reason}</span>}
              <span style={{marginInlineStart:8,color:T.textMut,fontSize:FS-2,fontWeight:500}}>({x.date})</span>
            </td>
            <td style={{...TD,fontWeight:800,color:"#F59E0B"}}>{fmt(r2(xTotal))+" ج.م"}</td>
            <td style={{...TD}}>
              <div style={{display:"flex",gap:6,alignItems:"center",justifyContent:"space-between"}}>
                <span style={{fontWeight:700,color:"#F59E0B"}}>{cutQty>0?fmt(r2(xPer))+" ج.م":"—"}</span>
                {canEdit&&!order.closed&&<div style={{display:"flex",gap:4}}>
                  <Btn small onClick={()=>setExtraCostPopup({editId:x.id,category:x.category||"أخرى",reason:x.reason||"",amount:String(x.amount||""),costType:x.costType||"total",date:x.date||cairoDateStr(),notes:x.notes||""})} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30",padding:"2px 6px",fontSize:11}} title="تعديل">✏️</Btn>
                  <DelBtn label="🗑" onConfirm={()=>updOrder(sel,o=>{o.extraCosts=(o.extraCosts||[]).filter(y=>y.id!==x.id)})}/>
                </div>}
              </div>
            </td>
          </tr>;
          })}
          {/* V19.76.7: single grand-total row at the bottom — sums materials + accessories + settlement + all extras */}
          <tr style={{background:T.accentBg}}>
            <td style={{...TD,fontWeight:800,fontSize:FS+4,color:T.accent}}>الاجمالي</td>
            <td style={{...TD,fontWeight:800,fontSize:FS+4,color:T.accent}}>{fmt(Math.ceil(totalAllCost))+" ج.م"}</td>
            <td style={{...TD,fontWeight:800,fontSize:FS+6,color:T.accent}}>{cutQty>0?Math.ceil(totalAllPer)+" ج.م":"—"}</td>
          </tr>
        </tbody></table>
        {/* V15.10: Add extra cost button */}
        {canEdit&&!order.closed&&<div style={{marginTop:12,paddingTop:12,borderTop:"1px dashed "+T.brd,display:"flex",justifyContent:"flex-end"}}>
          <Btn small onClick={()=>setExtraCostPopup({category:"هالك",reason:"",amount:"",costType:"total",date:cairoDateStr(),notes:""})} style={{background:"#F59E0B12",color:"#F59E0B",border:"1px solid #F59E0B35",fontWeight:700}}>➕ تكلفة إضافية / هالك</Btn>
        </div>}
        </>;})()}
      </Card>
      </>}

      {/* ═══════════════════════════════════════════════════════════════
          TAB: التسوية والمرفقات — settlement + Firebase Storage attachments
         ═══════════════════════════════════════════════════════════════ */}
      {activeTab==="settlement"&&<>
          {(()=>{
            const stockDel=getConfirmedStock(order);
            const remain=t.cutQty-stockDel;
            const hasSett=!!order.settlement;const isClosed=!!order.closed;
            /* Workshop balances for this order */
            const wsBals=[];(order.workshopDeliveries||[]).forEach((wd,idx)=>{const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);const bal=(Number(wd.qty)||0)-rcvd;if(bal>0)wsBals.push({wsName:wd.wsName,garment:wd.garmentType||"عام",qty:bal,wdIdx:idx,price:Number(wd.price)||0})});
            const wsBalTotal=wsBals.reduce((s,w)=>s+w.qty,0);
            if(isClosed)return<Card style={{marginBottom:16,background:"#64748B08",border:"1px solid #64748B20"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                <span style={{fontSize:20}}>🔒</span><span style={{fontSize:FS+2,fontWeight:800,color:"#64748B"}}>أوردر مغلق</span>
              </div>
              {hasSett&&<div style={{padding:12,borderRadius:10,background:T.err+"06",border:"1px solid "+T.err+"20",marginBottom:8}}>
                <div style={{fontSize:FS,fontWeight:700,color:T.err,marginBottom:6}}>{"⚖️ تسوية: "+order.settlement.qty+" قطعة"}</div>
                <div style={{display:"flex",gap:10,flexWrap:"wrap",fontSize:FS-1}}>
                  <span>{"السبب: "+order.settlement.reason}</span>
                  <span style={{fontWeight:700,color:T.err}}>{"تكلفة الهالك: "+fmt(r2(order.settlement.cost))+" ج.م"}</span>
                  <span style={{color:T.textMut}}>{order.settlement.date}</span>
                </div>
                {order.settlement.notes&&<div style={{fontSize:FS-2,color:T.textSec,marginTop:4}}>{order.settlement.notes}</div>}
                {order.settlement.wsSettled&&<div style={{fontSize:FS-2,color:T.err,marginTop:4}}>{"✓ تم تصفير رصيد "+order.settlement.wsSettled.length+" ورشة"}</div>}
              </div>}
              <div style={{display:"flex",gap:10,flexWrap:"wrap",fontSize:FS}}>
                <span>{"تسليم مخزن: "+stockDel+" قطعة"}</span>
                <span style={{fontWeight:700,color:T.ok}}>{"تكلفة الانتاج: "+fmt(r2(t.costAll))+" ج.م"}</span>
                {hasSett&&<span style={{fontWeight:700,color:T.err}}>{"+ هالك: "+fmt(r2(order.settlement.cost))+" ج.م"}</span>}
                {(()=>{const cq=t.cutQty||0;const ec=(order.extraCosts||[]).reduce((s,x)=>{const amt=Number(x.amount)||0;return s+(x.costType==="perPiece"?amt*cq:amt)},0);return ec>0?<span style={{fontWeight:700,color:"#F59E0B"}}>{"+ تكاليف إضافية: "+fmt(r2(ec))+" ج.م"}</span>:null})()}
                {(()=>{const cq=t.cutQty||0;const ec=(order.extraCosts||[]).reduce((s,x)=>{const amt=Number(x.amount)||0;return s+(x.costType==="perPiece"?amt*cq:amt)},0);const total=t.costAll+(hasSett?order.settlement.cost:0)+ec;
                  return<>
                    <span style={{fontWeight:800,color:T.accent}}>{"= الاجمالي: "+fmt(r2(total))+" ج.م"}</span>
                    {stockDel>0&&<span style={{fontWeight:700,color:"#8B5CF6"}}>{"تكلفة القطعة الفعلية: "+r2(total/stockDel)+" ج.م"}</span>}
                  </>;
                })()}
              </div>
              {canEdit&&<Btn small onClick={()=>updOrder(sel,o=>{o.closed=false;o.settlement=null;o.status=recomputeStatus(o)})} style={{marginTop:10,background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}}>↩ اعادة فتح الأوردر</Btn>}
            </Card>;
            if(stockDel===0||isClosed)return null;
            return<Card title="⚖️ تسوية وغلق الأوردر" style={{marginBottom:16}}>
              <div style={{display:"flex",gap:10,marginBottom:12,flexWrap:"wrap"}}>
                <span style={{padding:"6px 12px",borderRadius:8,background:T.accent+"12",color:T.accent,fontWeight:700}}>{"كمية القص: "+t.cutQty}</span>
                <span style={{padding:"6px 12px",borderRadius:8,background:T.ok+"12",color:T.ok,fontWeight:700}}>{"مخزن جاهز: "+stockDel}</span>
                {remain>0&&<span style={{padding:"6px 12px",borderRadius:8,background:T.err+"12",color:T.err,fontWeight:700}}>{"متبقي: "+remain+" قطعة"}</span>}
              </div>
              {remain===0?<div>
                <div style={{padding:12,borderRadius:10,background:T.ok+"08",border:"1px solid "+T.ok+"20",marginBottom:10,textAlign:"center"}}>
                  <span style={{fontSize:FS+1,fontWeight:800,color:T.ok}}>✅ تم تسليم كامل الكمية للمخزن</span>
                </div>
                {canEdit&&<Btn primary onClick={()=>updOrder(sel,o=>{o.closed=true;o.status="تم التسليم لمخزن الجاهز"})}>🔒 غلق الأوردر</Btn>}
              </div>
              :<div>
                <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:12,marginBottom:12}}>
                  <div style={{padding:10,borderRadius:10,background:T.warn+"08",border:"1px solid "+T.warn+"20"}}>
                    <div style={{fontSize:FS,fontWeight:700,color:T.warn,marginBottom:4}}>{"⚠️ يوجد "+remain+" قطعة لم تسلّم للمخزن"}</div>
                    {wsBalTotal>0&&<div style={{fontSize:FS-2,color:T.textSec}}>{"منها "+wsBalTotal+" قطعة عند الورش"}</div>}
                  </div>
                  {wsBals.length>0&&<div style={{padding:10,borderRadius:10,background:"#8B5CF606",border:"1px solid #8B5CF615"}}>
                    <div style={{fontSize:FS-2,fontWeight:700,color:"#8B5CF6",marginBottom:4}}>رصيد الورش:</div>
                    {wsBals.map((w,i)=><div key={i} style={{display:"flex",gap:6,fontSize:FS-2,padding:"2px 0"}}>
                      <span style={{fontWeight:700,color:"#8B5CF6",flex:1}}>{w.wsName}</span>
                      <span style={{color:T.textSec}}>{w.garment}</span>
                      <span style={{fontWeight:800,color:T.err}}>{w.qty}</span>
                    </div>)}
                  </div>}
                </div>
                {/* Compact workshop movements */}
                {(()=>{const wdList=(order.workshopDeliveries||[]).filter(wd=>{const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);return(Number(wd.qty)||0)-rcvd!==0||rcvd>0});
                  return wdList.length>0&&<div style={{marginBottom:12,borderRadius:10,border:"1px solid "+T.brd,overflow:"hidden"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:FS-2}}>
                      <thead><tr style={{background:T.bg}}><th style={{...TH,padding:"4px 8px",fontSize:FS-2}}>الورشة</th><th style={{...TH,padding:"4px 8px",fontSize:FS-2}}>القطعة</th><th style={{...TH,padding:"4px 8px",fontSize:FS-2}}>تسليم</th><th style={{...TH,padding:"4px 8px",fontSize:FS-2}}>استلام</th><th style={{...TH,padding:"4px 8px",fontSize:FS-2}}>الرصيد</th></tr></thead>
                      <tbody>{wdList.map((wd,i)=>{const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);const bal=(Number(wd.qty)||0)-rcvd;
                        return<tr key={i} style={{background:bal>0?T.err+"04":"transparent"}}><td style={{...TD,padding:"3px 6px",fontWeight:700}}>{wd.wsName}</td><td style={{...TD,padding:"3px 6px"}}>{wd.garmentType||"عام"}</td><td style={{...TD,padding:"3px 6px",color:T.ok,fontWeight:700}}>{wd.qty}</td><td style={{...TD,padding:"3px 6px",color:T.accent,fontWeight:700}}>{rcvd}</td><td style={{...TD,padding:"3px 6px",fontWeight:800,color:bal>0?T.err:T.ok}}>{bal}</td></tr>})}</tbody>
                    </table>
                  </div>})()}
                {canEdit&&(()=>{
                  const settCost=r2(remain*t.costPer);
                  const REASONS=["عيوب تصنيع","تالف خامة","فاقد ورشة","خطأ قص","أخرى"];
                  return<div style={{padding:14,borderRadius:10,background:T.err+"04",border:"1px solid "+T.err+"15"}}>
                    <div style={{fontSize:FS+1,fontWeight:800,color:T.err,marginBottom:10}}>{"🔴 تكلفة الهالك: "+fmt(settCost)+" ج.م"}</div>
                    <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:8,marginBottom:10}}>
                      <div><label style={{fontSize:FS-2,color:T.textSec}}>سبب التسوية</label><Sel value={settReason} onChange={setSettReason}><option value="">-- اختر --</option>{REASONS.map(r=><option key={r} value={r}>{r}</option>)}</Sel></div>
                      <div><label style={{fontSize:FS-2,color:T.textSec}}>ملاحظات</label><Inp value={settNotes} onChange={setSettNotes} placeholder="ملاحظات اضافية..."/></div>
                    </div>
                    {wsBals.length>0&&<div style={{padding:8,borderRadius:8,background:T.warn+"08",border:"1px solid "+T.warn+"15",marginBottom:10,fontSize:FS-2,color:T.warn,fontWeight:600}}>
                      {"⚡ سيتم تصفير رصيد "+wsBals.length+" ورشة وتسجيل استلام تسوية تلقائي"}
                    </div>}
                    <div style={{display:"flex",gap:8}}>
                      <Btn onClick={()=>{if(!settReason){showToast("⚠️ اختر سبب التسوية");return}
                        updOrder(sel,o=>{
                          /* Zero workshop balances */
                          const wsSettled=[];
                          (o.workshopDeliveries||[]).forEach((wd,idx)=>{const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);const bal=(Number(wd.qty)||0)-rcvd;
                            if(bal>0){if(!wd.receives)wd.receives=[];wd.receives.push({date:new Date().toISOString().split("T")[0],qty:bal,notes:"⚖️ تسوية — "+settReason,price:Number(wd.price)||0,amount:r2(bal*(Number(wd.price)||0)),quality:"تسوية",createdBy:userName||"",isSettlement:true});
                              wsSettled.push({wsName:wd.wsName,garment:wd.garmentType||"",qty:bal})}});
                          o.settlement={qty:remain,reason:settReason,notes:settNotes,cost:settCost,date:new Date().toISOString().split("T")[0],createdBy:userName||"",wsSettled};
                          o.closed=true;o.status="تم التسليم لمخزن الجاهز"});setSettReason("");setSettNotes("")}} style={{background:T.err,color:"#fff",border:"none",fontWeight:700}}>⚖️ تسوية + غلق</Btn>
                      <Btn onClick={()=>{if(!settReason){showToast("⚠️ اختر سبب التسوية");return}
                        updOrder(sel,o=>{
                          const wsSettled=[];
                          (o.workshopDeliveries||[]).forEach((wd,idx)=>{const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);const bal=(Number(wd.qty)||0)-rcvd;
                            if(bal>0){if(!wd.receives)wd.receives=[];wd.receives.push({date:new Date().toISOString().split("T")[0],qty:bal,notes:"⚖️ تسوية — "+settReason,price:Number(wd.price)||0,amount:r2(bal*(Number(wd.price)||0)),quality:"تسوية",createdBy:userName||"",isSettlement:true});
                              wsSettled.push({wsName:wd.wsName,garment:wd.garmentType||"",qty:bal})}});
                          o.settlement={qty:remain,reason:settReason,notes:settNotes,cost:settCost,date:new Date().toISOString().split("T")[0],createdBy:userName||"",wsSettled};
                          o.status=recomputeStatus(o)});setSettReason("");setSettNotes("")}} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}}>⚖️ تسوية فقط</Btn>
                    </div>
                  </div>})()}
              </div>}
            </Card>
          })()}
      {/* V15.90: Attachments card — files stored in Firebase Storage, metadata only in Firestore */}
      <AttachmentsCard order={order} updOrder={updOrder} sel={sel} canEdit={canEdit} userName={userName} isMob={isMob}/>
      </>}
    </div>
    {/* WhatsApp Choice Popup */}
    {waPopup&&(()=>{const wo=waPopup.order;const wt=waPopup.t||calcOrder(wo);const timeline=getOrderTimeline(wo,wt);const hasTimeline=!!timeline;
      const sendWa=async(withTimeline)=>{let text=getOrderDetails(wo,wt);if(withTimeline&&timeline)text+=timeline;
        if(wo.image&&navigator.canShare){try{const res=await fetch(wo.image);const blob=await res.blob();const file=new File([blob],wo.modelNo+".jpg",{type:blob.type||"image/jpeg"});if(navigator.canShare({files:[file]})){await navigator.share({title:"CLARK — "+wo.modelNo,text,files:[file]});setWaSent(p=>({...p,[wo.id]:Date.now()}));setTimeout(()=>setWaSent(p=>{const n={...p};delete n[wo.id];return n}),60000);setWaPopup(null);return}}catch(e){}}
        openWA("https://wa.me/?text="+encodeURIComponent(text),"_blank");setWaSent(p=>({...p,[wo.id]:Date.now()}));setTimeout(()=>setWaSent(p=>{const n={...p};delete n[wo.id];return n}),60000);setWaPopup(null)};
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setWaPopup(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:380,border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{textAlign:"center",marginBottom:16}}>
            <div style={{fontSize:20,marginBottom:4}}>📱</div>
            <div style={{fontSize:FS+1,fontWeight:800,color:"#25D366"}}>ارسال واتساب</div>
            <div style={{fontSize:FS-1,color:T.textSec}}>{wo.modelNo+" — "+wo.modelDesc}</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div onClick={()=>sendWa(false)} style={{padding:14,borderRadius:12,border:"1px solid #25D36630",background:"#25D36606",cursor:"pointer",textAlign:"center",transition:"background 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background="#25D36612"} onMouseLeave={e=>e.currentTarget.style.background="#25D36606"}>
              <div style={{fontSize:FS,fontWeight:700,color:"#25D366"}}>📋 تفاصيل الأوردر فقط</div>
              <div style={{fontSize:FS-2,color:T.textMut,marginTop:2}}>رقم الموديل والوصف والكمية والحالة</div>
            </div>
            {hasTimeline&&<div onClick={()=>sendWa(true)} style={{padding:14,borderRadius:12,border:"1px solid #25D36630",background:"#25D36606",cursor:"pointer",textAlign:"center",transition:"background 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background="#25D36612"} onMouseLeave={e=>e.currentTarget.style.background="#25D36606"}>
              <div style={{fontSize:FS,fontWeight:700,color:"#25D366"}}>📋 تفاصيل + تايم لاين</div>
              <div style={{fontSize:FS-2,color:T.textMut,marginTop:2}}>كل الحركات من القص للتسليم + رصيد المخزن</div>
            </div>}
          </div>
          <div style={{textAlign:"center",marginTop:12}}><Btn ghost small onClick={()=>setWaPopup(null)}>الغاء</Btn></div>
        </div>
      </div>})()}
    {/* Deliver to Workshop Popup */}
    {showDeliver&&(()=>{
      const pieces=order.orderPieces||[];
      const linkedPieces=new Set();FKEYS.forEach(k=>{if(gf(order,k))(order["fabricPieces"+k]||[]).forEach(p=>linkedPieces.add(p))});
      const hasFabric=FKEYS.some(k=>gf(order,k));
      const isLinked=p=>hasFabric&&(linkedPieces.size===0||linkedPieces.has(p));
      const availPieces=pieces.filter(p=>{if(!isLinked(p))return false;const delForP=(order.workshopDeliveries||[]).filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0);return delForP<getPieceCutQty(order,p)});
      const totalDelForType=dType?(order.workshopDeliveries||[]).filter(wd=>wd.garmentType===dType).reduce((s,wd)=>s+(Number(wd.qty)||0),0):0;
      /* V16.24: per-piece cut qty (falls back to global cutQty if no override set) */
      const pieceCutForType=dType?getPieceCutQty(order,dType):t.cutQty;
      const maxQty=dType?Math.max(0,pieceCutForType-totalDelForType):t.cutQty;
      const doDeliver=async(print,wa,label)=>{
        if(!dWs||!dType||!dQty)return;
        const wsObj=workshops.find(w=>w.name===dWs);
        const saveQty=Number(dQty);const saveType=dType;const saveDate=dDate||new Date().toISOString().split("T")[0];const savePrice=Number(dPrice)||0;const saveNote=dNote;
        try{
          await updOrder(sel,o=>{
            if(!o.workshopDeliveries)o.workshopDeliveries=[];
            o.workshopDeliveries.push({id:gid(),wsName:dWs,wsId:wsObj?wsObj.id:null,wsType:wsObj?wsObj.type:"",wsOwner:wsObj?wsObj.owner:"",qty:saveQty,garmentType:saveType,price:savePrice,notes:saveNote,date:saveDate,receives:[],createdBy:userName||"",agreedDays:Number(dAgreed)||0});
            o.status=recomputeStatus(o);
          });
          showToast("✓ تم التسليم — "+dWs);setShowDeliver(false);
          if(print){setTimeout(()=>{const pOrd=data.orders.find(o=>o.id===sel)||order;printReceipt(dWs,wsObj?wsObj.owner:"",pOrd,saveType,saveQty,saveDate,maxQty-saveQty,data.garmentTypes)},400)}
          if(label){setTimeout(()=>{const pOrd=data.orders.find(o=>o.id===sel)||order;printLabel(dWs,pOrd,saveType,saveQty,saveDate,data.garmentTypes,{type:"deliver",delDate:saveDate,delQty:saveQty})},400)}
          if(wa){const phone=wsObj?.phone||"";const msg="*CLARK — اذن تسليم ورشة*%0A%0A• الورشة: *"+dWs+"*%0A• رقم الموديل: *"+order.modelNo+"*%0A• الوصف: "+order.modelDesc+"%0A• نوع القطعة: *"+saveType+"*%0A• كمية التسليم: *"+saveQty+"* قطعة%0A• السعر: *"+(savePrice||0)+"* ج.م/قطعة%0A• التاريخ: *"+saveDate+"*"+(Number(dAgreed)>0?"%0A• مدة التسليم المتفق عليها: *"+dAgreed+"* يوم%0A• موعد التسليم المتوقع: *"+new Date(new Date(saveDate).getTime()+Number(dAgreed)*86400000).toISOString().split("T")[0]+"*":"")+"%0A%0A*برجاء التأكيد*";openWA("https://wa.me/"+(phone?phone.replace(/[^0-9]/g,""):"")+"?text="+msg,"_blank")}
        }catch(e){console.error("doDeliver error:",e);showToast("⚠️ خطأ في حفظ التسليم")}
      };
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowDeliver(false)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div style={{fontSize:FS+2,fontWeight:800,color:"#8B5CF6"}}>{"📤 تسليم "+order.modelNo+" لورشة"}</div>
            <Btn ghost onClick={()=>setShowDeliver(false)} title="إغلاق">✕</Btn>
          </div>
          <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:10,marginBottom:12}}>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>الورشة *</label><SearchSel value={dWs} onChange={v=>{setDWs(v);setDPrice("")}} options={workshops.map(w=>({value:w.name,label:wsTypeInfo(w.type).icon+" "+wsTypeInfo(w.type).key+" — "+w.name+(w.owner?" - "+w.owner:"")}))} placeholder="ابحث عن ورشة..."/></div>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>نوع القطعة *</label><Sel value={dType} onChange={v=>{setDType(v);const delForP=(order.workshopDeliveries||[]).filter(wd=>wd.garmentType===v).reduce((s,wd)=>s+(Number(wd.qty)||0),0);setDQty(Math.max(0,getPieceCutQty(order,v)-delForP));const gt=(data.garmentTypes||[]).find(g=>g.name===v);if(gt?.defaultPrice&&!dPrice)setDPrice(gt.defaultPrice)}}><option value="">-- اختر --</option>{(availPieces.length>0?availPieces:pieces.filter(p=>{const dp=(order.workshopDeliveries||[]).filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0);return dp<getPieceCutQty(order,p)})).map(p=>{const dp=(order.workshopDeliveries||[]).filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0);return<option key={p} value={p}>{gIcon(p,data.garmentTypes)+" "+p+" (متاح: "+(getPieceCutQty(order,p)-dp)+")"}</option>})}</Sel></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr 1fr",gap:10,marginBottom:12}}>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>الكمية *</label><Inp type="number" value={dQty} onChange={v=>setDQty(Math.min(Number(v)||0,maxQty))}/></div>
            {dWs&&!isInternal(dWs)&&<div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>سعر القطعة</label><Inp type="number" value={dPrice} onChange={setDPrice}/></div>}
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>ملاحظات</label><Inp value={dNote} onChange={setDNote}/></div>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>مدة التسليم المتفق عليها (أيام)</label><Inp type="number" value={dAgreed} onChange={setDAgreed} placeholder="اختياري"/>{dAgreed&&Number(dAgreed)>0&&<div style={{fontSize:FS-3,color:T.ok,marginTop:2}}>{"📅 موعد التسليم المتوقع: "+new Date(new Date(dDate||Date.now()).getTime()+Number(dAgreed)*86400000).toISOString().split("T")[0]}</div>}</div>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>التاريخ</label><Inp type="date" value={dDate} onChange={setDDate}/></div>
          </div>
          {dWs&&dType&&<div style={{padding:10,borderRadius:8,background:T.accentBg,marginBottom:12,fontSize:FS-1,color:T.textSec}}>
            {"كمية القص (لـ "+dType+"): "+pieceCutForType+(pieceCutForType!==t.cutQty?" (يدوي)":"")+" | تم تسليمه: "+totalDelForType+" | متاح: "+maxQty}
          </div>}
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <Btn ghost onClick={()=>setShowDeliver(false)}>الغاء</Btn>
            <Btn primary onClick={()=>doDeliver(false)} disabled={!dWs||!dType||!dQty}>تسليم وحفظ</Btn>
            <Btn onClick={()=>doDeliver(true)} disabled={!dWs||!dType||!dQty} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}}>تسليم + طباعة</Btn>
            <Btn onClick={()=>doDeliver(false,false,true)} disabled={!dWs||!dType||!dQty} style={{background:"#F59E0B12",color:"#F59E0B",border:"1px solid #F59E0B30"}} title="طباعة ليبل حراري">🏷️ ليبل</Btn>
            <Btn onClick={()=>doDeliver(false,true)} disabled={!dWs||!dType||!dQty} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}} title="ارسال عبر واتساب">📱 واتساب</Btn>
          </div>
        </div>
      </div>})()}

    {/* V15.10: Extra cost popup */}
    {extraCostPopup&&(()=>{
      const ec=extraCostPopup;
      const amt=Number(ec.amount)||0;
      const isEdit=!!ec.editId;
      /* V18.97: costType — "total" (default) or "perPiece". Default to "total" for backward compat. */
      const costType=ec.costType||"total";
      const cutQty=t.cutQty||0;
      /* Live computed values for the summary */
      const computedTotal=costType==="perPiece"?amt*cutQty:amt;
      const computedPer=costType==="perPiece"?amt:(cutQty>0?amt/cutQty:0);
      const save=()=>{
        if(amt<=0){showToast("⚠️ المبلغ يجب أن يكون أكبر من صفر");return}
        updOrder(sel,o=>{
          if(!Array.isArray(o.extraCosts))o.extraCosts=[];
          if(isEdit){
            const idx=o.extraCosts.findIndex(x=>x.id===ec.editId);
            if(idx>=0)o.extraCosts[idx]={...o.extraCosts[idx],category:ec.category,reason:ec.reason,amount:amt,costType,date:ec.date,notes:ec.notes};
          }else{
            o.extraCosts.push({id:gid(),category:ec.category,reason:ec.reason,amount:amt,costType,date:ec.date,notes:ec.notes,createdBy:userName,createdAt:new Date().toISOString()});
          }
        });
        setExtraCostPopup(null);
        showToast(isEdit?"✅ تم تحديث التكلفة":"✅ تم إضافة التكلفة");
      };
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:10001,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={()=>setExtraCostPopup(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:20,width:"100%",maxWidth:520,maxHeight:"92vh",overflowY:"auto",border:"2px solid #F59E0B",boxShadow:"0 25px 70px rgba(0,0,0,0.45)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,paddingBottom:12,borderBottom:"2px solid #F59E0B25"}}>
            <div style={{fontSize:FS+3,fontWeight:900,color:"#F59E0B",display:"flex",alignItems:"center",gap:8}}>
              <span>💰</span><span>{isEdit?"تعديل تكلفة إضافية":"تكلفة إضافية / هالك"}</span>
            </div>
            <span onClick={()=>setExtraCostPopup(null)} style={{cursor:"pointer",fontSize:22,color:T.textMut,padding:4}}>✕</span>
          </div>
          {/* Order context reminder */}
          <div style={{padding:"8px 12px",borderRadius:8,background:T.accentBg,border:"1px solid "+T.accent+"25",marginBottom:12,fontSize:FS-1}}>
            <span style={{fontWeight:700,color:T.accent}}>{order.modelNo}</span>
            <span style={{color:T.textSec}}>{" — "+order.modelDesc}</span>
            <span style={{color:T.textMut,marginInlineStart:8}}>{"كمية القص: "+cutQty}</span>
          </div>
          {/* Category cards */}
          <div style={{marginBottom:14}}>
            <label style={{fontSize:FS-1,color:T.textSec,fontWeight:600,display:"block",marginBottom:6}}>التصنيف</label>
            <div style={{display:"grid",gridTemplateColumns:isMob?"repeat(3,1fr)":"repeat(4,1fr)",gap:6}}>
              {EXTRA_COST_CATEGORIES.map(c=>{const isSel=ec.category===c.name;
                return<div key={c.name} onClick={()=>setExtraCostPopup(p=>({...p,category:c.name}))} style={{cursor:"pointer",padding:"8px 6px",borderRadius:10,border:"2px solid "+(isSel?"#F59E0B":T.brd),background:isSel?"#F59E0B15":T.bg,textAlign:"center",transition:"all 0.15s"}}>
                  <div style={{fontSize:18,marginBottom:2}}>{c.icon}</div>
                  <div style={{fontSize:FS-2,fontWeight:700,color:isSel?"#F59E0B":T.text}}>{c.name}</div>
                </div>;
              })}
            </div>
          </div>
          {/* V18.97: Cost Type selector */}
          <div style={{marginBottom:12}}>
            <label style={{fontSize:FS-1,color:T.textSec,fontWeight:600,display:"block",marginBottom:6}}>نوع التكلفة</label>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <div onClick={()=>setExtraCostPopup(p=>({...p,costType:"total"}))} style={{cursor:"pointer",padding:"10px 12px",borderRadius:10,border:"2px solid "+(costType==="total"?"#6366F1":T.brd),background:costType==="total"?"#6366F112":T.bg,transition:"all 0.15s"}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                  <span style={{fontSize:16}}>📦</span>
                  <span style={{fontSize:FS-1,fontWeight:800,color:costType==="total"?"#4F46E5":T.text}}>مبلغ إجمالي</span>
                </div>
                <div style={{fontSize:FS-3,color:T.textMut,lineHeight:1.4}}>المبلغ المُدخَل = الإجمالي. يُقسم على كمية القص.</div>
              </div>
              <div onClick={()=>setExtraCostPopup(p=>({...p,costType:"perPiece"}))} style={{cursor:"pointer",padding:"10px 12px",borderRadius:10,border:"2px solid "+(costType==="perPiece"?"#10B981":T.brd),background:costType==="perPiece"?"#10B98112":T.bg,transition:"all 0.15s"}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                  <span style={{fontSize:16}}>🔢</span>
                  <span style={{fontSize:FS-1,fontWeight:800,color:costType==="perPiece"?"#059669":T.text}}>على القطعة</span>
                </div>
                <div style={{fontSize:FS-3,color:T.textMut,lineHeight:1.4}}>المبلغ المُدخَل = سعر القطعة. يُضرب في كمية القص.</div>
              </div>
            </div>
          </div>
          {/* Free reason */}
          <div style={{marginBottom:12}}>
            <label style={{fontSize:FS-1,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>السبب / الوصف (اختياري)</label>
            <Inp value={ec.reason} onChange={v=>setExtraCostPopup(p=>({...p,reason:v}))} placeholder="مثال: هالك في القص، شحنة من المورد..."/>
          </div>
          {/* Amount + Date row */}
          <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:10,marginBottom:12}}>
            <div>
              <label style={{fontSize:FS-1,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>{costType==="perPiece"?"سعر القطعة (ج.م) *":"المبلغ الإجمالي (ج.م) *"}</label>
              <Inp type="number" value={ec.amount} onChange={v=>setExtraCostPopup(p=>({...p,amount:v}))} placeholder="0"/>
            </div>
            <div>
              <label style={{fontSize:FS-1,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>التاريخ</label>
              <Inp type="date" value={ec.date} onChange={v=>setExtraCostPopup(p=>({...p,date:v}))}/>
            </div>
          </div>
          {/* Notes */}
          <div style={{marginBottom:14}}>
            <label style={{fontSize:FS-1,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>ملاحظات إضافية</label>
            <Inp value={ec.notes} onChange={v=>setExtraCostPopup(p=>({...p,notes:v}))} placeholder="اختياري"/>
          </div>
          {/* V18.97: Live calculation preview */}
          {amt>0&&<div style={{padding:12,borderRadius:8,background:"#F59E0B08",border:"1px dashed #F59E0B40",marginBottom:12,display:"flex",flexDirection:"column",gap:6}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:FS-1,color:T.textSec}}>التكلفة الكلية:</span>
              <span style={{fontSize:FS+1,fontWeight:800,color:"#F59E0B"}}>{fmt(r2(computedTotal))+" ج.م"}</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:FS-1,color:T.textSec}}>تكلفة القطعة (× {cutQty} قطعة):</span>
              <span style={{fontSize:FS+1,fontWeight:800,color:"#F59E0B"}}>{cutQty>0?fmt(r2(computedPer))+" ج.م/قطعة":"—"}</span>
            </div>
          </div>}
          {/* Actions */}
          <div style={{display:"flex",gap:8,justifyContent:"flex-end",paddingTop:10,borderTop:"1px solid "+T.brd}}>
            <Btn ghost onClick={()=>setExtraCostPopup(null)}>إلغاء</Btn>
            <Btn onClick={save} disabled={amt<=0} style={{background:amt>0?"#F59E0B":"#F59E0B40",color:"#fff",border:"none",fontWeight:800,padding:"10px 20px"}}>
              {isEdit?"💾 تحديث":"➕ إضافة التكلفة"}
            </Btn>
          </div>
        </div>
      </div>;
    })()}
    {/* V16.24: Per-piece cut quantity edit popup */}
    {/* V16.37: Mobile actions menu — bottom-sheet style with stacked list items.
        Renders the same actions as the desktop inline buttons, but vertically
        and tap-friendly. Each item runs its handler then closes the sheet. */}
    {showActionsMenu&&(()=>{
      const close=()=>setShowActionsMenu(false);
      const run=(fn)=>()=>{close();setTimeout(fn,50)};
      const items=[];
      if(canEdit&&!order.closed)items.push({icon:"✏️",label:"تعديل الأوردر",color:T.accent,onClick:run(()=>setEditing(true))});
      items.push({icon:"📱",label:"إرسال واتساب",color:"#25D366",onClick:run(()=>setWaPopup({order,t,fromCard:false}))});
      items.push({icon:"📌",label:"طلب مراجعة",color:"#8B5CF6",onClick:run(()=>setShowReview(true))});
      if(canEdit&&!order.closed)items.push({icon:"📋",label:"تكرار الأوردر",color:"#8B5CF6",onClick:run(()=>{const dup=JSON.parse(JSON.stringify(order));dup.id=gid();dup.date=new Date().toISOString().split("T")[0];dup.createdAt=new Date().toISOString();dup.modelNo="";dup.status="تم القص";dup.deliveredQty=0;dup.deliveries=[];dup.workshopDeliveries=[];dup._isDup=true;delete dup._docId;setDupInit(dup)})});
      if(canEdit&&!order.closed&&t.cutQty>0&&activeFabs.length>0)items.push({icon:"📤",label:"تسليم ورشة",color:"#8B5CF6",onClick:run(()=>{setShowDeliver(true);setDWs("");setDType("");setDQty(0);setDPrice("");setDNote("")})});
      if(canEdit&&!order.closed)items.push({icon:"➕",label:"أوردر جديد",color:T.ok,onClick:run(()=>setShowNew(true))});
      return<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99998,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={close}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:"20px 20px 0 0",width:"100%",maxWidth:480,padding:"12px 0 20px",borderTop:"1px solid "+T.brd,boxShadow:"0 -8px 24px rgba(0,0,0,0.15)",animation:"slideUp 0.2s ease-out"}}>
          {/* Drag handle */}
          <div style={{width:40,height:4,borderRadius:2,background:T.brd,margin:"0 auto 12px"}}/>
          <div style={{padding:"0 16px 8px",fontSize:FS-1,fontWeight:700,color:T.textSec,borderBottom:"1px solid "+T.brd,marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span>إجراءات الأوردر</span>
            <Btn ghost small onClick={close} title="إغلاق">✕</Btn>
          </div>
          {items.length===0&&<div style={{padding:"30px 16px",textAlign:"center",color:T.textMut,fontSize:FS-1}}>لا توجد إجراءات متاحة</div>}
          {items.map((it,i)=><div key={i} onClick={it.onClick} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",cursor:"pointer",borderBottom:i<items.length-1?"1px solid "+T.brd:"none"}}>
            <span style={{fontSize:22,width:32,textAlign:"center"}}>{it.icon}</span>
            <span style={{flex:1,fontSize:FS,fontWeight:700,color:it.color}}>{it.label}</span>
            <span style={{fontSize:FS,color:T.textMut}}>‹</span>
          </div>)}
        </div>
      </div>;
    })()}
    {pieceCutPopup&&(()=>{
      const pieces=order.orderPieces||[];
      const globalCut=t.cutQty||0;
      const save=()=>{
        updOrder(sel,o=>{
          if(!o.pieceCutQty)o.pieceCutQty={};
          pieces.forEach(p=>{
            const v=Number(pieceCutPopup.draft[p]);
            if(isNaN(v)){delete o.pieceCutQty[p];return}
            /* V16.26: clear redundant overrides — if value equals what auto-derive
               would yield without this override, no need to store. Prevents stale
               overrides from sticking around if fabric cut changes later. */
            const probeMap={...o.pieceCutQty};delete probeMap[p];
            const auto=getPieceCutQty({...o,pieceCutQty:probeMap},p);
            if(v===auto)delete o.pieceCutQty[p];
            else o.pieceCutQty[p]=v;
          });
          if(Object.keys(o.pieceCutQty).length===0)delete o.pieceCutQty;
        });
        setPieceCutPopup(null);
        showToast("✓ تم حفظ كميات القص");
      };
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setPieceCutPopup(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:20,width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:FS+2,fontWeight:800,color:T.accent}}>✂️ ضبط كمية القص لكل قطعة</div>
            <Btn ghost small onClick={()=>setPieceCutPopup(null)}>✕</Btn>
          </div>
          <div style={{padding:"8px 12px",borderRadius:8,background:T.accent+"08",border:"1px solid "+T.accent+"20",fontSize:FS-2,color:T.textSec,marginBottom:14,lineHeight:1.7}}>
            💡 الكمية الإجمالية للأوردر: <b style={{color:T.text}}>{globalCut}</b> طقم. القيم الافتراضية محسوبة من قص الخامات المرتبطة بكل قطعة. عدّل لو احتجت تتجاوز الحساب التلقائي.
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
            {pieces.map(p=>{
              const dp=(order.workshopDeliveries||[]).filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0);
              const cur=Number(pieceCutPopup.draft[p])||0;
              const avail=Math.max(0,cur-dp);
              return<div key={p} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:8,border:"1px solid "+T.brd,background:T.bg}}>
                <div style={{flex:1,fontWeight:700,fontSize:FS-1}}>{gIcon(p,data.garmentTypes)} {p}</div>
                <Inp type="number" value={pieceCutPopup.draft[p]} onChange={v=>setPieceCutPopup(prev=>({...prev,draft:{...prev.draft,[p]:Number(v)||0}}))} style={{width:80,textAlign:"center"}}/>
                <div style={{fontSize:FS-3,color:T.textMut,minWidth:90}}>تسليم: <b style={{color:T.accent}}>{dp}</b> • متاح: <b style={{color:avail>0?T.warn:T.ok}}>{avail}</b></div>
              </div>;
            })}
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <Btn ghost onClick={()=>setPieceCutPopup(null)}>إلغاء</Btn>
            <Btn primary onClick={save}>💾 حفظ</Btn>
          </div>
        </div>
      </div>;
    })()}
    {/* V15.46: Cut/workshop sync popup — PER PIECE plan. Each piece group sums to cutQty. */}
    {syncPopup&&(()=>{const piecePlans=syncPopup.pieces;const m=syncPopup.m;
      /* Apply manual overrides and compute effective state per piece */
      const effPieces=piecePlans.map(pp=>{
        const wds=pp.wds.map(w=>{const key=pp.piece+"_"+w.wdIdx;const ov=syncPopup.manual[key];const eff=ov!==undefined&&ov!==""?Number(ov):w.newQty;return{...w,newQty:eff,delta:eff-w.currentQty,belowReceived:eff<w.receivedQty}});
        const sumNew=wds.reduce((s,w)=>s+(Number(w.newQty)||0),0);
        return{...pp,wds,sumNew,matchesCut:sumNew===m.cutQty,anyBelowRcv:wds.some(w=>w.belowReceived)};
      });
      const allMatch=effPieces.every(p=>p.matchesCut);
      const anyBelowRcv=effPieces.some(p=>p.anyBelowRcv);
      const canApply=allMatch&&!anyBelowRcv;
      const applyPlan=()=>{
        if(!canApply)return;
        const changes=[];
        effPieces.forEach(pp=>{pp.wds.forEach(w=>{if(w.delta!==0)changes.push({piece:pp.piece,wsName:w.wsName,from:w.currentQty,to:w.newQty,delta:w.delta})})});
        updOrder(sel,o=>{
          effPieces.forEach(pp=>{pp.wds.forEach(w=>{if(o.workshopDeliveries&&o.workshopDeliveries[w.wdIdx]){o.workshopDeliveries[w.wdIdx].qty=w.newQty}})});
          if(!o.cutSyncHistory)o.cutSyncHistory=[];
          o.cutSyncHistory.push({at:new Date().toISOString(),by:userName,cutQty:m.cutQty,pieces:effPieces.map(p=>({piece:p.piece,before:p.currentTotal,after:p.sumNew})),changes});
          o.status=recomputeStatus(o);
        });
        upConfig(d=>{addAudit(d,{category:"order",action:"cut_sync",target:"موديل "+order.modelNo,oldValue:"قبل: "+effPieces.map(p=>p.piece+"="+p.currentTotal).join(", "),newValue:"بعد: "+effPieces.map(p=>p.piece+"="+p.sumNew).join(", ")+" (القص="+m.cutQty+")",user:userName,notes:changes.map(c=>c.piece+"/"+c.wsName+": "+c.from+"→"+c.to).join(" | "),severity:"warning"})});
        showToast("✓ تمت مزامنة "+changes.length+" تسليم لـ "+effPieces.length+" قطعة");
        setSyncPopup(null);
      };
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setSyncPopup(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:20,width:"100%",maxWidth:780,maxHeight:"88vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div>
              <div style={{fontSize:FS+2,fontWeight:800,color:T.accent}}>🔄 مزامنة التسليم للورش</div>
              <div style={{fontSize:FS-2,color:T.textMut,marginTop:2}}>كل قطعة (قميص/شورت/إلخ) لازم يكون إجمالي تسليمها = كمية القص ({m.cutQty})</div>
            </div>
            <Btn ghost small onClick={()=>setSyncPopup(null)} title="إغلاق">✕</Btn>
          </div>
          {/* Per-piece plan tables */}
          {effPieces.map(pp=>{const pieceColor=pp.matchesCut&&!pp.anyBelowRcv?T.ok:pp.anyBelowRcv?T.err:T.warn;
            return<div key={pp.piece} style={{marginBottom:14,border:"1.5px solid "+pieceColor+"35",borderRadius:12,overflow:"hidden"}}>
              <div style={{padding:"8px 12px",background:pieceColor+"10",borderBottom:"1px solid "+pieceColor+"25",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:FS,fontWeight:800,color:pieceColor}}>📦 {pp.piece}</span>
                  <span style={{fontSize:FS-2,color:T.textMut}}>({pp.wds.length} ورشة)</span>
                </div>
                <div style={{display:"flex",gap:10,fontSize:FS-2,flexWrap:"wrap"}}>
                  <span>قبل: <b>{pp.currentTotal}</b></span>
                  <span>→</span>
                  <span>بعد: <b style={{color:pieceColor}}>{pp.sumNew}</b></span>
                  <span style={{color:pp.matchesCut?T.ok:T.err,fontWeight:800}}>{pp.matchesCut?"✓ مطابق للقص":"≠ "+m.cutQty}</span>
                </div>
              </div>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr style={{background:T.bg}}>
                  {["الورشة","الحالي","استلام مصنع","الجديد","الفرق",""].map(h=><th key={h} style={{...TH,fontSize:FS-2,padding:"5px 8px"}}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {pp.wds.map(w=>{const key=pp.piece+"_"+w.wdIdx;const inputVal=syncPopup.manual[key]!==undefined?syncPopup.manual[key]:w.newQty;
                    return<tr key={key} style={{background:w.belowReceived?T.err+"08":"transparent"}}>
                      <td style={{...TD,fontWeight:700,color:T.accent,fontSize:FS-1}}>{w.wsName||"—"}</td>
                      <td style={{...TD,textAlign:"center",fontSize:FS-1}}>{w.currentQty}</td>
                      <td style={{...TD,textAlign:"center",color:T.textMut,fontSize:FS-1}}>{w.receivedQty}</td>
                      <td style={{...TD,textAlign:"center"}}>
                        <input type="number" min={w.receivedQty} value={inputVal} onChange={e=>setSyncPopup(sp=>({...sp,manual:{...sp.manual,[key]:e.target.value}}))} style={{width:70,padding:"3px 6px",borderRadius:6,border:"1px solid "+(w.belowReceived?T.err:T.brd),fontSize:FS,fontWeight:700,fontFamily:"inherit",background:T.cardSolid,color:T.text,textAlign:"center"}}/>
                      </td>
                      <td style={{...TD,textAlign:"center",fontWeight:800,color:w.delta===0?T.textMut:w.delta>0?T.ok:T.err,fontSize:FS-1}}>{w.delta>0?"+":""}{w.delta}</td>
                      <td style={{...TD,textAlign:"center"}}>
                        {w.belowReceived&&<span style={{fontSize:FS-2,color:T.err,fontWeight:700}} title="أقل من الاستلام">⛔</span>}
                        {w.capped&&!w.belowReceived&&<span style={{fontSize:FS-2,color:T.warn,fontWeight:700}} title="مُقيّد بالاستلام">⚠</span>}
                      </td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>;
          })}
          {/* Warnings */}
          {anyBelowRcv&&<div style={{padding:"8px 12px",borderRadius:8,background:T.err+"10",border:"1px solid "+T.err+"30",color:T.err,fontSize:FS-1,fontWeight:700,marginBottom:10}}>⛔ فيه ورشة/ورش كميتها أقل من اللي استلموها — عدّل يدوياً قبل الحفظ</div>}
          {!allMatch&&!anyBelowRcv&&<div style={{padding:"8px 12px",borderRadius:8,background:T.warn+"10",border:"1px solid "+T.warn+"30",color:T.warn,fontSize:FS-1,fontWeight:700,marginBottom:10}}>⚠️ فيه قطعة/قطع مجموع تسليمها مش = القص ({m.cutQty}) — عدّل يدوياً</div>}
          <div style={{padding:"8px 10px",borderRadius:8,background:T.accent+"06",border:"1px dashed "+T.accent+"30",fontSize:FS-2,color:T.textSec,marginBottom:12,lineHeight:1.5}}>
            💡 <b>كل قطعة مستقلة:</b> إجمالي الشورت لازم = القص، وإجمالي القميص لازم = القص، وهكذا. التوزيع داخل كل قطعة تناسبي بناءً على الكميات الحالية، وكل ورشة ما تنزلش أقل من اللي استلمته فعلاً.
          </div>
          {/* Actions */}
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <Btn ghost onClick={()=>setSyncPopup(null)}>إلغاء</Btn>
            <Btn onClick={applyPlan} disabled={!canApply} style={{background:canApply?T.ok:T.brd,color:"#fff",border:"none",fontWeight:800,padding:"8px 18px",opacity:canApply?1:0.5}}>💾 تطبيق المزامنة</Btn>
          </div>
        </div>
      </div>
    })()}
    {/* V18.90: Review request modal */}
    {showReview&&order&&<ReviewRequestModal
      link={{
        type:"order",
        id:order.id,
        label:"أوردر "+(order.poNumber||order.modelNo),
      }}
      defaultMsg={"راجع أوردر "+(order.poNumber||order.modelNo)+" من فضلك"}
      data={data} upConfig={upConfig} user={user}
      onClose={()=>setShowReview(false)}
    />}
    {/* V19.0: Stage progress modal — opens when clicking interactive stage badge */}
    {stageProgressOrder&&<StageProgressModal order={stageProgressOrder} onClose={()=>setStageProgressOrder(null)}/>}
    {/* V19.80.5: Image zoom lightbox — click anywhere on the backdrop or press Esc to close.
        The image is constrained to a 3:4 portrait frame so it never blows past 90vh. */}
    {imgZoom&&order.image&&<div onClick={()=>setImgZoom(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:24,cursor:"zoom-out"}}>
      <div style={{position:"relative",height:"90vh",aspectRatio:"4 / 5",maxWidth:"95vw",borderRadius:16,overflow:"hidden",boxShadow:"0 30px 80px rgba(0,0,0,0.6)"}}>
        <img src={order.image} alt={order.modelNo||""} loading="eager" decoding="async" style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
      </div>
      <button onClick={(e)=>{e.stopPropagation();setImgZoom(false)}} style={{position:"absolute",top:18,insetInlineEnd:18,width:40,height:40,borderRadius:20,background:"rgba(0,0,0,0.55)",color:"#fff",border:"1px solid rgba(255,255,255,0.25)",fontSize:18,fontWeight:800,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}} title="إغلاق (Esc)">✕</button>
      <div style={{position:"absolute",bottom:18,insetInlineStart:18,padding:"6px 14px",borderRadius:10,background:"rgba(0,0,0,0.55)",color:"#fff",fontSize:FS-1,fontWeight:700,fontFamily:"monospace",letterSpacing:0.5}}>{order.poNumber||order.modelNo}</div>
    </div>}
  </div>
}

/* ══ V15.90: ATTACHMENTS CARD — per-order file storage via Firebase Storage ══
   Files stored at: orders/{orderId}/attachments/
   Only metadata (name, type, size, storagePath, downloadURL) persisted in Firestore. */
function AttachmentsCard({order,updOrder,sel,canEdit,userName,isMob}){
  const attachments=order.attachments||[];
  const[uploading,setUploading]=useState(false);
  const[uploadProgress,setUploadProgress]=useState({});/* {idx: pct} */
  const[uploadErrors,setUploadErrors]=useState([]);
  const[deleteId,setDeleteId]=useState(null);

  const onFilesSelected=async(e)=>{
    const files=Array.from(e.target.files||[]);
    if(files.length===0)return;
    /* Validate all files first */
    const invalid=files.filter(f=>!isAllowedFile(f.name));
    if(invalid.length>0){
      showToast("⛔ ملفات غير مدعومة: "+invalid.map(f=>f.name).join(", "));
      e.target.value="";return;
    }
    const tooBig=files.filter(f=>f.size>MAX_FILE_SIZE);
    if(tooBig.length>0){
      showToast("⛔ ملفات أكبر من 10 MB: "+tooBig.map(f=>f.name).join(", "));
      e.target.value="";return;
    }
    setUploading(true);
    setUploadErrors([]);
    setUploadProgress({});
    try{
      const results=await uploadMultiple(sel,files,userName,(idx,pct)=>{
        setUploadProgress(p=>({...p,[idx]:pct}));
      });
      const successes=results.filter(r=>!r.error);
      const failures=results.filter(r=>r.error);
      if(successes.length>0){
        updOrder(sel,o=>{
          if(!Array.isArray(o.attachments))o.attachments=[];
          successes.forEach(att=>o.attachments.push(att));
        });
        showToast("✅ تم رفع "+successes.length+" ملف");
      }
      if(failures.length>0){
        setUploadErrors(failures.map(f=>f.fileName+": "+f.error));
      }
    }catch(err){
      showToast("⛔ خطأ في الرفع: "+(err.message||String(err)));
    }finally{
      setUploading(false);
      setUploadProgress({});
      e.target.value="";
    }
  };

  const doDelete=async(att)=>{
    if(!att)return;
    try{
      await deleteAttachment(att.storagePath);
      updOrder(sel,o=>{
        o.attachments=(o.attachments||[]).filter(a=>a.id!==att.id);
      });
      showToast("✅ تم حذف المرفق");
    }catch(err){
      showToast("⛔ فشل الحذف: "+(err.message||String(err)));
    }finally{
      setDeleteId(null);
    }
  };

  const totalSize=attachments.reduce((s,a)=>s+(Number(a.size)||0),0);

  return<Card title={"📎 مرفقات الأوردر"+(attachments.length>0?" ("+attachments.length+")":"")} style={{marginTop:16}}>
    {/* Upload button + info */}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,marginBottom:12}}>
      <div style={{fontSize:FS-2,color:T.textSec}}>
        {attachments.length===0?"لا توجد مرفقات":"الإجمالي: "+formatFileSize(totalSize)}
      </div>
      {canEdit&&<label style={{cursor:uploading?"wait":"pointer",padding:"8px 16px",borderRadius:10,background:uploading?T.bg:T.accent+"12",color:uploading?T.textMut:T.accent,border:"1px solid "+(uploading?T.brd:T.accent+"30"),fontWeight:700,fontSize:FS-1,display:"inline-flex",alignItems:"center",gap:6}}>
        {uploading?"⏳ جاري الرفع...":"➕ إضافة مرفقات"}
        <input type="file" multiple disabled={uploading} onChange={onFilesSelected} accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.doc,.docx,.xls,.xlsx,.txt" style={{display:"none"}}/>
      </label>}
    </div>

    {/* Upload progress */}
    {uploading&&Object.keys(uploadProgress).length>0&&<div style={{padding:10,borderRadius:10,background:T.accent+"06",border:"1px solid "+T.accent+"20",marginBottom:12}}>
      {Object.entries(uploadProgress).map(([idx,pct])=>
        <div key={idx} style={{marginBottom:4}}>
          <div style={{fontSize:FS-2,color:T.textSec,marginBottom:2}}>ملف {Number(idx)+1}: {pct}%</div>
          <div style={{height:6,background:T.bg,borderRadius:3,overflow:"hidden"}}>
            <div style={{height:"100%",width:pct+"%",background:T.accent,transition:"width 0.2s"}}></div>
          </div>
        </div>
      )}
    </div>}

    {/* Upload errors */}
    {uploadErrors.length>0&&<div style={{padding:10,borderRadius:10,background:T.err+"08",border:"1px solid "+T.err+"30",marginBottom:12,fontSize:FS-2,color:T.err}}>
      <div style={{fontWeight:700,marginBottom:4}}>⛔ فشل رفع بعض الملفات:</div>
      {uploadErrors.map((e,i)=><div key={i}>• {e}</div>)}
    </div>}

    {/* Attachments list */}
    {attachments.length>0&&<div style={{display:"flex",flexDirection:"column",gap:6}}>
      {attachments.map(att=>
        <div key={att.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:T.bg,borderRadius:10,border:"1px solid "+T.brd}}>
          <span style={{fontSize:22}}>{getFileIcon(att.type)}</span>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:700,color:T.text,fontSize:FS-1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={att.name}>{att.name}</div>
            <div style={{fontSize:FS-3,color:T.textMut,display:"flex",gap:8,flexWrap:"wrap"}}>
              <span>{formatFileSize(att.size)}</span>
              <span>•</span>
              <span>{(att.uploadedAt||"").split("T")[0]}</span>
              {att.uploadedBy&&<><span>•</span><span>{att.uploadedBy}</span></>}
            </div>
          </div>
          <a href={att.downloadURL} target="_blank" rel="noopener noreferrer" style={{padding:"6px 10px",borderRadius:8,background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30",fontSize:FS-2,fontWeight:700,textDecoration:"none"}} title="فتح/تحميل">👁 فتح</a>
          {canEdit&&<Btn small onClick={()=>setDeleteId(att)} style={{background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30",padding:"6px 10px"}} title="حذف">🗑</Btn>}
        </div>
      )}
    </div>}

    {/* Info note */}
    <div style={{marginTop:10,padding:"8px 12px",background:T.accent+"06",borderRadius:8,fontSize:FS-3,color:T.textMut,lineHeight:1.6}}>
      💡 الملفات المدعومة: صور (jpg/png/webp/gif), PDF, Word, Excel. أقصى حجم: 10 MB للملف.
    </div>

    {/* Delete confirmation */}
    {deleteId&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setDeleteId(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:22,width:"100%",maxWidth:420,border:"2px solid "+T.err,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{fontSize:FS+1,fontWeight:800,color:T.err,marginBottom:10}}>⛔ حذف مرفق</div>
        <div style={{fontSize:FS,color:T.text,marginBottom:14,lineHeight:1.6}}>
          هل تريد حذف <b>{deleteId.name}</b>؟
          <div style={{fontSize:FS-2,color:T.textMut,marginTop:4}}>لا يمكن التراجع عن هذا الإجراء.</div>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <Btn onClick={()=>setDeleteId(null)} style={{background:T.bg,color:T.textSec,border:"1px solid "+T.brd}}>إلغاء</Btn>
          <Btn onClick={()=>doDelete(deleteId)} style={{background:T.err,color:"#fff",border:"none",fontWeight:700}}>🗑 حذف</Btn>
        </div>
      </div>
    </div>}
  </Card>;
}

/* ══ EXTERNAL PRODUCTION ══ */
