/* ═══════════════════════════════════════════════════════════════
   CLARK - StockPg.jsx
   
   Extracted from App.jsx in V15.1 phase 3.
   Contains: StockPg
   ═══════════════════════════════════════════════════════════════ */

import { useMemo, useState } from "react";
import { Btn, Card, DelBtn, Inp, SearchSel } from "../components/ui.jsx";
import { FS } from "../constants/index.js";
import { T, TD, TDB, TH } from "../theme.js";
import { playBeep } from "../utils/audio.js";
import { fmt, r2 } from "../utils/format.js";
import { calcOrder, getConfirmedStock, recomputeStatus } from "../utils/orders.js";
import { showToast } from "../utils/popups.js";
import { printPage } from "../utils/print.js";
import { loadJsQR, scanQR } from "../utils/qr.js";
import { printStockDelivery } from "../utils/print-extras.js";

export function StockPg({data,updOrder,isMob,canEdit,statusCards,user}){
  const userName=user?.displayName||user?.email?.split("@")[0]||"";
  const[selOrder,setSelOrder]=useState("");
  const[stQty,setStQty]=useState(0);const[stNote,setStNote]=useState("");const[stDate,setStDate]=useState(new Date().toISOString().split("T")[0]);
  const[editSt,setEditSt]=useState(null);const[edStDate,setEdStDate]=useState("");const[edStQty,setEdStQty]=useState(0);const[edStNote,setEdStNote]=useState("");
  const[showLimitPopup,setShowLimitPopup]=useState(null);
  const[stLogQ,setStLogQ]=useState("");const[stockScan,setStockScan]=useState(null);
  const[qRcvPiece,setQRcvPiece]=useState(null);const[qRcvQty,setQRcvQty]=useState(0);const[qRcvDate,setQRcvDate]=useState(new Date().toISOString().split("T")[0]);
  const[qEditPiece,setQEditPiece]=useState(null);const[qEditQty,setQEditQty]=useState(0);

  const eligible=useMemo(()=>data.orders.filter(o=>{
    const wds=o.workshopDeliveries||[];if(wds.length===0)return false;
    const t=calcOrder(o);const stockDel=getConfirmedStock(o);
    if(stockDel>=t.cutQty)return false;
    const pieces=o.orderPieces||[];
    if(pieces.length>0){
      return!pieces.some(p=>{const rcvdForP=wds.filter(wd=>wd.garmentType===p).reduce((s,wd)=>(wd.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0)+s,0);return rcvdForP===0})
    }else{
      const totalRcv=wds.reduce((s,wd)=>(wd.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0)+s,0);return totalRcv>0
    }
  }),[data.orders]);

  const ord=eligible.find(o=>o.id===selOrder);
  const t=ord?calcOrder(ord):{cutQty:0};
  const stockDel=ord?getConfirmedStock(ord):0;

  /* Per-piece breakdown & max complete set */
  const pieces=ord?(ord.orderPieces||[]):[];
  const wds=ord?(ord.workshopDeliveries||[]):[];
  const pieceBreakdown=pieces.map(p=>{
    const delToWs=wds.filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0);
    const rcvFromWs=wds.filter(wd=>wd.garmentType===p).reduce((s,wd)=>(wd.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0)+s,0);
    return{piece:p,cutQty:t.cutQty,delToWs,rcvFromWs,balance:delToWs-rcvFromWs}
  });
  const maxCompleteSet=pieces.length>0?Math.min(...pieceBreakdown.map(p=>p.rcvFromWs)):wds.reduce((s,wd)=>(wd.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0)+s,0);
  const stockRemain=Math.max(0,Math.min(t.cutQty-stockDel,maxCompleteSet-stockDel));
  const shortPieces=pieceBreakdown.filter(p=>p.rcvFromWs<maxCompleteSet||(pieces.length>0&&p.rcvFromWs===Math.min(...pieceBreakdown.map(x=>x.rcvFromWs))&&pieceBreakdown.some(x=>x.rcvFromWs>p.rcvFromWs)));

  const saveStock=(andPrint)=>{
    if(!selOrder||!stQty||stQty<=0)return;
    const qty=Number(stQty);
    if(qty>stockRemain){
      const details=pieceBreakdown.map(p=>"• "+p.piece+": استلم المصنع "+p.rcvFromWs+" من "+p.cutQty).join("\n");
      setShowLimitPopup({max:stockRemain,requested:qty,details:pieceBreakdown});return
    }
    const saveOrd=JSON.parse(JSON.stringify(ord));
    updOrder(selOrder,o=>{if(!o.deliveries)o.deliveries=[];o.deliveries.push({date:stDate,qty,notes:stNote,createdBy:userName||"",status:"pending"})});
    const newTotalDel=stockDel+qty;
    if(andPrint)setTimeout(()=>printStockDelivery(saveOrd,qty,stDate,stNote,newTotalDel,t.cutQty),400);
    setStQty(0);setStNote("");setStDate(new Date().toISOString().split("T")[0]);showToast("✓ تم تسليم المخزن")
  };

  const printLog=()=>{
    const allStock=[];data.orders.forEach(o=>{(o.deliveries||[]).forEach(d=>{allStock.push({...d,modelNo:o.modelNo,modelDesc:o.modelDesc})})});
    allStock.sort((a,b)=>(b.date||"").localeCompare(a.date||""));
    let h="<h2 style='text-align:center;margin-bottom:12px'>📦 سجل تسليمات المخزن</h2>";
    h+="<table><thead><tr><th>#</th><th>التاريخ</th><th>الموديل</th><th>الوصف</th><th>الكمية</th><th>ملاحظات</th></tr></thead><tbody>";
    allStock.forEach((s,i)=>{h+="<tr><td>"+(i+1)+"</td><td>"+s.date+"</td><td style='font-weight:700'>"+s.modelNo+"</td><td>"+s.modelDesc+"</td><td style='font-weight:700;color:#059669'>"+s.qty+"</td><td>"+(s.notes||"-")+"</td></tr>"});
    const totalQty=allStock.reduce((s,x)=>s+(Number(x.qty)||0),0);
    h+="<tr style='background:#EFF6FF;font-weight:800'><td colspan='4'>الاجمالي</td><td style='color:#059669'>"+fmt(totalQty)+"</td><td></td></tr>";
    h+="</tbody></table>";
    h+="<div style='margin-top:16px;text-align:center;font-size:10px;color:#94A3B8;border-top:1px solid #E2E8F0;padding-top:8px'>CLARK Factory Management — "+new Date().toLocaleDateString("ar-EG")+"</div>";
    printPage("سجل تسليمات المخزن",h)
  };

  return<div>
    <Card style={{marginBottom:12,overflow:"visible",position:"relative",zIndex:100}}>
      <div style={{marginBottom:12,position:"relative",zIndex:100}}>
        <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,marginBottom:4,display:"block"}}>{"اختر الأوردر ("+eligible.length+")"}</label>
        <SearchSel value={selOrder} onChange={v=>{setSelOrder(v);setStQty(0)}} options={eligible.map(o=>{const tc=calcOrder(o);const sd=getConfirmedStock(o);return{value:o.id,label:o.modelNo+" — "+o.modelDesc+" (متبقي: "+(tc.cutQty-sd)+")"}})} placeholder="ابحث بالموديل أو الوصف..."/>
      </div>
      {selOrder&&<div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"1fr 1fr 1fr auto",gap:10,alignItems:"end"}}>
        <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>{"الكمية (متاح: "+stockRemain+")"}</label><Inp type="number" value={stQty} onChange={v=>setStQty(Number(v)||0)}/></div>
        <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>التاريخ</label><Inp type="date" value={stDate} onChange={setStDate}/></div>
        <div style={{display:"flex",gap:6,alignItems:"end"}}><Btn primary onClick={()=>saveStock(false)} disabled={!stQty||stQty<=0}>📦 تسليم</Btn><Btn onClick={()=>saveStock(true)} disabled={!stQty||stQty<=0} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}}>📦+🖨</Btn></div>
      </div>}
      {/* Per-piece breakdown */}
      {selOrder&&ord&&pieces.length>0&&<div style={{marginTop:10,padding:10,borderRadius:10,background:T.bg,border:"1px solid "+T.brd}}>
        <div style={{fontSize:FS-1,fontWeight:700,color:T.textSec,marginBottom:6}}>تفاصيل القطع والطقم الكامل</div>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["القطعة","كمية القص","تسليم ورشة","استلام مصنع","متبقي عند الورش",""].map(h=><th key={h} style={{...TH,fontSize:FS-2}}>{h}</th>)}</tr></thead>
        <tbody>{pieceBreakdown.map(p=>{const isAdding=qRcvPiece===p.piece;const isEditing=qEditPiece===p.piece;
          /* Find wd with balance for adding */
          const wdForP=wds.filter(wd=>wd.garmentType===p.piece).find(wd=>{const rc=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);return rc<(Number(wd.qty)||0)});
          const wdIdx=wdForP?wds.indexOf(wdForP):-1;
          const maxAdd=wdForP?((Number(wdForP.qty)||0)-(wdForP.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0)):0;
          /* Find last receive for editing */
          let lastRcvWdIdx=-1,lastRcvRIdx=-1;
          wds.forEach((wd,wi)=>{if(wd.garmentType===p.piece)(wd.receives||[]).forEach((r,ri)=>{lastRcvWdIdx=wi;lastRcvRIdx=ri})});
          const hasRcv=lastRcvWdIdx>=0;
          return<tr key={p.piece} style={{background:(isAdding||isEditing)?T.accent+"06":""}}>
          <td style={{...TD,fontWeight:700,color:"#8B5CF6"}}>{p.piece}</td>
          <td style={TDB}>{p.cutQty}</td>
          <td style={{...TDB,color:T.purple}}>{p.delToWs}</td>
          <td style={{...TDB,color:T.ok}}>{isEditing?<Inp type="number" value={qEditQty} onChange={v=>setQEditQty(Number(v)||0)} sx={{width:70,padding:"2px 4px",fontSize:FS}}/>:isAdding?<div style={{display:"flex",gap:4,alignItems:"center"}}><span style={{fontWeight:700}}>{p.rcvFromWs}</span><span style={{color:T.textMut}}>+</span><Inp type="number" value={qRcvQty} onChange={v=>setQRcvQty(Math.min(Number(v)||0,maxAdd))} sx={{width:60,padding:"2px 4px",fontSize:FS-1}}/><Inp type="date" value={qRcvDate} onChange={setQRcvDate} sx={{padding:"2px 4px",fontSize:FS-2}}/></div>:p.rcvFromWs}</td>
          <td style={{...TDB,color:p.balance>0?T.err:T.ok}}>{p.balance>0?p.balance:"✓"}</td>
          <td style={{...TD,whiteSpace:"nowrap"}}>{canEdit&&<div style={{display:"flex",gap:3}}>
            {isEditing?<><Btn small primary onClick={()=>{updOrder(selOrder,o=>{const r=o.workshopDeliveries[lastRcvWdIdx].receives[lastRcvRIdx];if(r)r.qty=qEditQty;o.status=recomputeStatus(o)});setQEditPiece(null);showToast("✓ تم تعديل الاستلام")}} title="حفظ">💾</Btn><Btn ghost small onClick={()=>setQEditPiece(null)} title="إغلاق">✕</Btn></>
            :isAdding?<><Btn small primary onClick={()=>{if(!qRcvQty||qRcvQty<=0)return;updOrder(selOrder,o=>{if(!o.workshopDeliveries[wdIdx].receives)o.workshopDeliveries[wdIdx].receives=[];o.workshopDeliveries[wdIdx].receives.push({date:qRcvDate,qty:qRcvQty,notes:"استلام سريع",price:Number(wdForP.price)||0,amount:r2(qRcvQty*(Number(wdForP.price)||0)),createdBy:userName||""});o.status=recomputeStatus(o)});setQRcvPiece(null);setQRcvQty(0);showToast("✓ تم استلام "+qRcvQty+" "+p.piece)}} title="حفظ">💾</Btn><Btn ghost small onClick={()=>setQRcvPiece(null)} title="إغلاق">✕</Btn></>
            :<>{hasRcv&&<Btn ghost small onClick={()=>{const lastR=wds[lastRcvWdIdx].receives[lastRcvRIdx];setQEditPiece(p.piece);setQEditQty(lastR.qty);setQRcvPiece(null)}} style={{fontSize:FS-3,padding:"2px 6px"}} title="تعديل">✏️</Btn>}{p.balance>0&&wdIdx>=0&&<Btn ghost small onClick={()=>{setQRcvPiece(p.piece);setQRcvQty(0);setQRcvDate(new Date().toISOString().split("T")[0]);setQEditPiece(null)}} style={{fontSize:FS-3,padding:"2px 8px",color:T.accent}}>📥</Btn>}</>}
          </div>}</td>
        </tr>})}</tbody></table></div>
        <div style={{marginTop:8,display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <span style={{padding:"6px 14px",borderRadius:8,background:T.ok+"12",color:T.ok,fontWeight:800,fontSize:FS}}>{"🧩 الطقم الكامل المتاح: "+stockRemain}</span>
          <span style={{padding:"4px 10px",borderRadius:6,background:T.accent+"10",color:T.accent,fontWeight:600,fontSize:FS-2}}>{"= أقل قطعة من الاستلام ("+maxCompleteSet+") - تم تسليمه للمخزن ("+stockDel+")"}</span>
        </div>
      </div>}
      {/* Simple summary for orders without pieces */}
      {selOrder&&ord&&pieces.length===0&&<div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
        <span style={{padding:"4px 10px",borderRadius:6,background:T.err+"10",color:T.err,fontWeight:700,fontSize:FS-1}}>{"القص: "+t.cutQty}</span>
        <span style={{padding:"4px 10px",borderRadius:6,background:T.ok+"10",color:T.ok,fontWeight:700,fontSize:FS-1}}>{"تم تسليمه: "+stockDel}</span>
        <span style={{padding:"4px 10px",borderRadius:6,background:stockRemain>0?T.warn+"10":T.ok+"10",color:stockRemain>0?T.warn:T.ok,fontWeight:700,fontSize:FS-1}}>{"المتبقي: "+stockRemain}</span>
      </div>}
      {selOrder&&<div style={{marginTop:8}}><Inp value={stNote} onChange={setStNote} placeholder="ملاحظات (اختياري)"/></div>}
    </Card>

    {/* Limit exceeded popup */}
    {showLimitPopup&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowLimitPopup(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:24,width:"100%",maxWidth:480,border:"1px solid "+T.err+"40",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><div style={{fontSize:FS+2,fontWeight:800,color:T.err}}>⚠️ لا يمكن تسليم {showLimitPopup.requested} طقم</div><Btn ghost small onClick={()=>setShowLimitPopup(null)}>✕</Btn></div>
        <div style={{fontSize:FS,color:T.text,marginBottom:12}}>{"الحد الأقصى للطقم الكامل: "+showLimitPopup.max+" طقم فقط"}</div>
        <div style={{fontSize:FS-1,color:T.textSec,marginBottom:12}}>السبب: عدد القطع من الاستلام من الورش غير متساوي. الطقم الكامل = أقل قطعة من الاستلام.</div>
        <div style={{overflowX:"auto",marginBottom:12}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["القطعة","استلام مصنع","الحالة"].map(h=><th key={h} style={{...TH,fontSize:FS-2}}>{h}</th>)}</tr></thead>
        <tbody>{showLimitPopup.details.map(p=>{const isMin=p.rcvFromWs===Math.min(...showLimitPopup.details.map(x=>x.rcvFromWs));
          return<tr key={p.piece}><td style={{...TD,fontWeight:700,color:"#8B5CF6"}}>{p.piece}</td><td style={{...TDB,color:isMin?T.err:T.ok}}>{p.rcvFromWs}</td><td style={{...TD,fontSize:FS-2}}>{isMin&&showLimitPopup.details.some(x=>x.rcvFromWs>p.rcvFromWs)?<span style={{color:T.err,fontWeight:700}}>{"⚠️ ناقص "+(Math.max(...showLimitPopup.details.map(x=>x.rcvFromWs))-p.rcvFromWs)+" قطعة"}</span>:<span style={{color:T.ok}}>✓</span>}</td></tr>})}</tbody>
        </table></div>
        <Btn primary onClick={()=>setShowLimitPopup(null)} style={{width:"100%"}}>فهمت</Btn>
      </div>
    </div>}

    {/* Stock delivery log */}
    {(()=>{const allStock=[];data.orders.forEach(o=>{(o.deliveries||[]).forEach((d,i)=>{allStock.push({...d,modelNo:o.modelNo,modelDesc:o.modelDesc,orderId:o.id,idx:i})})});allStock.sort((a,b)=>(b.date||"").localeCompare(a.date||""));
      const startEdit=(s)=>{setEditSt({orderId:s.orderId,idx:s.idx});setEdStDate(s.date);setEdStQty(s.qty);setEdStNote(s.notes||"")};
      const saveEdit=()=>{if(!editSt)return;updOrder(editSt.orderId,o=>{const d=o.deliveries[editSt.idx];if(d){d.date=edStDate;d.qty=Number(edStQty)||0;d.notes=edStNote;o.deliveredQty=o.deliveries.reduce((s,x)=>s+(Number(x.qty)||0),0);o.status=recomputeStatus(o)}});setEditSt(null)};
      const delStock=(s)=>{updOrder(s.orderId,o=>{o.deliveries.splice(s.idx,1);o.deliveredQty=o.deliveries.reduce((ss,x)=>ss+(Number(x.qty)||0),0);o.status=recomputeStatus(o)})};
      return allStock.length>0&&<Card title={"سجل تسليمات المخزن ("+allStock.length+")"} extra={<Btn small onClick={printLog} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨</Btn>}>
        <div style={{marginBottom:8}}><Inp value={stLogQ} onChange={setStLogQ} placeholder="🔍 بحث برقم الموديل..."/></div>
        {(()=>{const filtered=stLogQ.trim()?allStock.filter(s=>s.modelNo.includes(stLogQ.trim())):allStock;return<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["#","التاريخ","الموديل","الوصف","الكمية","ملاحظات",...(canEdit?[""]:[])] .map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
        <tbody>{filtered.map((s,i)=>{const isEd=editSt&&editSt.orderId===s.orderId&&editSt.idx===s.idx;
          return<tr key={i} style={{background:isEd?T.warn+"06":""}}>
          <td style={TD}>{i+1}</td>
          <td style={{...TD,minWidth:120}}>{isEd?<Inp type="date" value={edStDate} onChange={setEdStDate}/>:s.date}</td>
          <td style={TDB}>{s.modelNo}</td><td style={TD}>{s.modelDesc}</td>
          <td style={{...TDB,color:T.ok,minWidth:80}}>{isEd?<Inp type="number" value={edStQty} onChange={v=>setEdStQty(Number(v)||0)}/>:s.qty}</td>
          <td style={{...TD,minWidth:100}}>{isEd?<Inp value={edStNote} onChange={setEdStNote}/>:(s.notes||"-")}</td>
          {canEdit&&<td style={{...TD,whiteSpace:"nowrap"}}><div style={{display:"flex",gap:3}}>
            {isEd?<><Btn small primary onClick={saveEdit} title="حفظ">💾</Btn><Btn ghost small onClick={()=>setEditSt(null)} title="إغلاق">✕</Btn></>
            :<><Btn small onClick={()=>startEdit(s)} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}} title="تعديل">✏️</Btn><DelBtn onConfirm={()=>delStock(s)}/></>}
          </div></td>}
        </tr>})}{filtered.length===0&&<tr><td colSpan={canEdit?7:6} style={{...TD,textAlign:"center",color:T.textMut,padding:20}}>لا توجد نتائج</td></tr>}</tbody>
      </table></div>})()}</Card>})()}
  
    {stockScan&&(()=>{
      const available=data.orders.filter(o=>{const wds=o.workshopDeliveries||[];const rcvFromWs=wds.reduce((s,wd)=>s+(wd.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0),0);const allDel=(o.deliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);return rcvFromWs-allDel>0}).map(o=>{const wds=o.workshopDeliveries||[];const rcvFromWs=wds.reduce((s,wd)=>s+(wd.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0),0);const allDel=(o.deliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);return{id:o.id,modelNo:o.modelNo,modelDesc:o.modelDesc||"",fromFinishing:rcvFromWs-allDel,rackSize:Number(o.rackSize)||1}});
      const rcvItems=stockScan.items||{};const totalRcv=Object.values(rcvItems).reduce((s,v)=>s+(Number(v)||0),0);
      const closeCam=()=>{try{const v=document.getElementById("stock-scan-video");if(v&&v.srcObject){v.srcObject.getTracks().forEach(t=>t.stop());v.srcObject=null}}catch(e){}setStockScan(p=>({...p,scanning:false}))};
      const confirmScan=()=>{if(totalRcv<=0){showToast("⚠️ لا توجد كميات");return}
        Object.entries(rcvItems).forEach(([oid,qty])=>{if(qty<=0)return;updOrder(oid,o=>{if(!o.deliveries)o.deliveries=[];o.deliveries.push({date:new Date().toISOString().split("T")[0],qty,notes:"تسليم سكان",createdBy:userName||"",status:"pending"})})});
        playBeep("done");showToast("⏳ تم تسجيل "+totalRcv+" قطعة — في انتظار تأكيد أمين المخزن");closeCam();setStockScan(null)};
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:isMob?8:16}} onClick={()=>{closeCam();setStockScan(null)}}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,width:"100%",maxWidth:isMob?"100%":650,maxHeight:"92vh",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)",display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <div style={{padding:isMob?"12px 16px":"16px 24px",borderBottom:"1px solid "+T.brd,flexShrink:0}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{fontSize:FS+2,fontWeight:800,color:"#059669"}}>📷 سكان تسليم مخزن جاهز</div>
              <Btn ghost small onClick={()=>{closeCam();setStockScan(null)}}>✕</Btn>
            </div>
            <div style={{display:"flex",gap:6}}>
              <Btn small onClick={()=>{if(stockScan.scanning){closeCam()}else{setStockScan(p=>({...p,scanning:true}))}}} style={{background:stockScan.scanning?"#EF444412":"#05966912",color:stockScan.scanning?"#EF4444":"#059669",border:"1px solid "+(stockScan.scanning?"#EF444430":"#05966930")}}>{stockScan.scanning?"⏹ Stop":"📷 Scan"}</Btn>
              <div style={{flex:1}}><SearchSel value="" onChange={v=>{if(!v)return;const m=available.find(x=>x.id===v);if(m){const rs=m.rackSize||1;setStockScan(p=>({...p,items:{...p.items,[v]:(p.items[v]||0)+rs}}));playBeep("ok")}}} options={available.map(m=>({value:m.id,label:m.modelNo+" — "+m.modelDesc+" ("+m.fromFinishing+")"}))} placeholder="اضف يدوي..."/></div>
            </div>
            {stockScan.scanning&&<div style={{marginTop:8}}>
              <div style={{position:"relative",width:"100%",maxWidth:200,margin:"0 auto",borderRadius:12,overflow:"hidden",background:"#000"}}>
                <video id="stock-scan-video" playsInline muted autoPlay style={{width:"100%",display:"block"}} ref={el=>{if(!el||el.srcObject)return;(async()=>{try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment",width:{ideal:640}}});el.srcObject=stream;
                  loadJsQR();const canvas=document.createElement("canvas");let lastScan="";let lastTime=0;
                  const scan=async()=>{if(!el.srcObject)return;if(el.readyState<2){requestAnimationFrame(scan);return}canvas.width=el.videoWidth;canvas.height=el.videoHeight;canvas.getContext("2d").drawImage(el,0,0);
                    {const _qr=await scanQR(canvas);if(_qr){const now=Date.now();if(_qr!==lastScan||now-lastTime>2000){lastScan=_qr;lastTime=now;
                      try{const parts=_qr.split(":");if(parts[0]==="CLARK"&&parts[1]){const oid=parts[1];const rs=Number(parts[2])||1;const m=available.find(x=>x.id===oid);
                        if(m){setStockScan(p=>({...p,items:{...p.items,[oid]:(p.items[oid]||0)+rs}}));playBeep("ok");showToast("✅ "+m.modelNo+" +"+rs)}
                        else{playBeep("error");showToast("⚠️ موديل غير متاح")}}}catch(e){}}}}
                    requestAnimationFrame(scan)};scan()}catch(e){showToast("⚠️ تعذر فتح الكاميرا")}})()}}/>
              </div></div>}
          </div>
          <div style={{flex:1,overflowY:"auto",padding:isMob?"8px 12px":"12px 24px"}}>
            {available.length>0?<table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["الموديل","الوصف","من التشطيب","استلام مصنع","الفرق"].map(h=><th key={h} style={{...TH,fontSize:FS-2}}>{h}</th>)}</tr></thead><tbody>
              {available.map(m=>{const val=rcvItems[m.id]||0;const diff=val-m.fromFinishing;
                return<tr key={m.id}><td style={{...TD,fontWeight:800,color:T.accent}}>{m.modelNo}</td><td style={{...TD,fontSize:FS-2,color:T.textMut}}>{m.modelDesc}</td>
                  <td style={{...TDB,color:"#059669"}}>{m.fromFinishing}</td>
                  <td style={{...TD,textAlign:"center",padding:2}}><input type="number" value={val||""} onChange={e=>{const v=Math.max(0,Number(e.target.value)||0);setStockScan(p=>({...p,items:{...p.items,[m.id]:v}}))}} placeholder="0" style={{width:80,textAlign:"center",border:"2px solid #059669",borderRadius:6,padding:"6px",fontSize:FS+1,fontWeight:800,fontFamily:"inherit",background:T.bg,color:T.text}}/></td>
                  <td style={{...TDB,fontWeight:800,color:val>0?(diff<0?"#EF4444":"#10B981"):T.textMut}}>{val>0?diff:"—"}</td></tr>})}
            </tbody></table>:<div style={{textAlign:"center",padding:20,color:T.textMut}}>لا توجد موديلات جاهزة للتسليم</div>}
          </div>
          <div style={{padding:"12px 24px",borderTop:"1px solid "+T.brd,flexShrink:0,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontWeight:700,color:"#059669"}}>{"اجمالي: "+totalRcv+" قطعة"}</span>
            <Btn onClick={confirmScan} disabled={totalRcv<=0} style={{background:"#059669",color:"#fff",border:"none",fontWeight:700,padding:"8px 24px"}}>{"📤 تسجيل تسليم ("+totalRcv+")"}</Btn>
          </div>
        </div></div>})()}
  </div>
}

/* ══ UNCUT PIECES REPORT ══ */
