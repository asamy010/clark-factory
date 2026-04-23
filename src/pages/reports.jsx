/* ═══════════════════════════════════════════════════════════════
   CLARK - reports.jsx
   
   Extracted from App.jsx in V15.1 phase 3.
   Contains: UncutReport, ExpectedDeliveries, AvailableReport, FloorStockReport, ReportsHub, WsFullAccountReport, FabricReport, WsPerfReport, DeliveryReport, SeasonSummary, OrderAgeReport, CapacityReport, WsCostReport, WsStuckReport, ModelProfitReport, TopCustomersReport, AgingReport, MonthlyExpensesReport, CashflowReport, LaborCostReport
   ═══════════════════════════════════════════════════════════════ */

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, Btn, Card, Inp, Sel, Timeline } from "../components/ui.jsx";
import { FKEYS, FS } from "../constants/index.js";
import { T, TD, TDB, TH } from "../theme.js";
import { fmt, gIcon, gc, gcons, gf, r2, slay, parseSizes, getSizesFromSet } from "../utils/format.js";
import { calcOrder, getStatusColor } from "../utils/orders.js";
import { printPage } from "../utils/print.js";
import { exportExcel } from "../utils/print-extras.js";
import { CostPg } from "./CostPg.jsx";
import { RepPg } from "./RepPg.jsx";

export function UncutReport({data,isMob,season}){
  const ALL_COLS=[{key:"modelNo",label:"رقم الموديل",req:true},{key:"modelDesc",label:"الوصف"},{key:"sizeLabel",label:"المقاسات"},{key:"cutQty",label:"كمية القص"},{key:"rackCount",label:"عدد راقات"},{key:"linked",label:"تم قصها ✓"},{key:"piece",label:"لم يتم قصها ✕",req:true}];
  const[showColPk,setShowColPk]=useState(false);
  const[visCols,setVisCols]=useState(()=>{try{const s=localStorage.getItem("clark_uncut_cols");return s?JSON.parse(s):ALL_COLS.map(c=>c.key)}catch(e){return ALL_COLS.map(c=>c.key)}});
  const togCol=(key)=>{const c=ALL_COLS.find(x=>x.key===key);if(c?.req)return;setVisCols(p=>{const n=p.includes(key)?p.filter(k=>k!==key):[...p,key];try{localStorage.setItem("clark_uncut_cols",JSON.stringify(n))}catch(e){}return n})};
  const rows=[];
  data.orders.forEach(o=>{const pieces=o.orderPieces||[];if(pieces.length===0)return;
    const linkedPieces=new Set();FKEYS.forEach(k=>{if(gf(o,k))(o["fabricPieces"+k]||[]).forEach(p=>linkedPieces.add(p))});
    const linked=pieces.filter(p=>linkedPieces.has(p));const unlinked=pieces.filter(p=>!linkedPieces.has(p));const t=calcOrder(o);
    /* V15.30: Use pcsPerSeries from sizeSet (source of truth) */
    const sizeCount=getSizesFromSet(o,data).expectedCount||1;
    const rackCount=sizeCount>0?Math.ceil(t.cutQty/sizeCount):t.cutQty;
    unlinked.forEach(p=>rows.push({modelNo:o.modelNo,modelDesc:o.modelDesc,sizeLabel:o.sizeLabel||"—",cutQty:t.cutQty,rackCount,piece:p,linked,id:o.id}))});
  const totalCutQty=rows.reduce((s,r)=>s+r.cutQty,0);
  const cols=ALL_COLS.filter(c=>visCols.includes(c.key));
  const printRep=()=>{const el=document.getElementById("uncut-rep");if(el)printPage("تقرير القطع غير المقصوصة — "+season,el.innerHTML)};
  const exportXls=()=>{const xRows=[cols.map(c=>c.label)];rows.forEach(r=>xRows.push(cols.map(c=>c.key==="linked"?r.linked.join("، "):c.key==="piece"?r.piece:r[c.key])));xRows.push([]);xRows.push(["الاجمالي",rows.length+" قطعة","","اجمالي القص: "+fmt(totalCutQty)]);exportExcel(xRows,"قطع_غير_مقصوصة_"+season)};
  const renderCell=(r,c)=>{if(c.key==="modelNo")return<td key={c.key} style={TDB}>{r.modelNo}</td>;if(c.key==="modelDesc")return<td key={c.key} style={TD}>{r.modelDesc}</td>;if(c.key==="sizeLabel")return<td key={c.key} style={TD}>{r.sizeLabel}</td>;if(c.key==="cutQty")return<td key={c.key} style={{...TDB,color:T.accent}}>{r.cutQty}</td>;if(c.key==="rackCount")return<td key={c.key} style={{...TDB,color:"#8B5CF6"}}>{r.rackCount}</td>;if(c.key==="linked")return<td key={c.key} style={{...TD,color:T.ok}}>{r.linked.map(p=>gIcon(p,data.garmentTypes)+" "+p).join("، ")||"—"}</td>;if(c.key==="piece")return<td key={c.key} style={{...TDB,color:T.err}}>{gIcon(r.piece,data.garmentTypes)+" "+r.piece}</td>;return<td key={c.key} style={TD}>{r[c.key]}</td>};
  return<div id="uncut-rep">
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
      <div><h1 style={{fontSize:isMob?18:24,fontWeight:800,margin:"0 0 4px",color:T.err}}>✂️ قطع لم يتم قصها</h1><div style={{fontSize:FS-1,color:T.textSec}}>{"الموسم: "+season+" — "+rows.length+" قطعة — اجمالي القص: "+fmt(totalCutQty)}</div></div>
      <div style={{display:"flex",gap:6,alignItems:"center",position:"relative"}}>
        <div><Btn onClick={()=>setShowColPk(!showColPk)} style={{background:showColPk?T.accent+"15":T.bg,color:showColPk?T.accent:T.textSec,border:"1px solid "+(showColPk?T.accent+"30":T.brd),fontSize:FS-2}}>{"⚙️ الأعمدة ("+cols.length+")"}</Btn>
          {showColPk&&<div style={{position:"absolute",top:"100%",right:0,marginTop:4,background:T.cardSolid,border:"1px solid "+T.brd,borderRadius:10,boxShadow:"0 8px 24px rgba(0,0,0,0.15)",zIndex:99,padding:8,minWidth:170}}>
            {ALL_COLS.map(c=><label key={c.key} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 6px",cursor:c.req?"default":"pointer",borderRadius:6,background:visCols.includes(c.key)?T.ok+"06":"transparent"}}>
              <input type="checkbox" checked={visCols.includes(c.key)} onChange={()=>togCol(c.key)} disabled={c.req} style={{width:14,height:14}}/>
              <span style={{fontSize:FS-2,color:c.req?T.textMut:T.text,fontWeight:600}}>{c.label}{c.req?" ●":""}</span>
            </label>)}
          </div>}
        </div>
        <Btn onClick={printRep} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨</Btn>
        <Btn onClick={exportXls} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30"}} title="تصدير اكسل">📊</Btn>
      </div>
    </div>
    {rows.length>0?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}>
      <thead><tr><th style={TH}>#</th>{cols.map(c=><th key={c.key} style={TH}>{c.label}</th>)}</tr></thead>
      <tbody>{rows.map((r,i)=><tr key={i} style={{background:i%2===0?"transparent":T.bg+"80"}}><td style={TD}>{i+1}</td>{cols.map(c=>renderCell(r,c))}</tr>)}
        <tr style={{background:T.accent+"10"}}><td style={{...TD,fontWeight:800}} colSpan={2}>الاجمالي</td>
          {cols.slice(1).map(c=><td key={c.key} style={{...TD,fontWeight:800,color:T.accent,textAlign:"center"}}>{c.key==="cutQty"?fmt(totalCutQty):c.key==="rackCount"?fmt(rows.reduce((s,r)=>s+r.rackCount,0)):""}</td>)}
        </tr>
      </tbody>
    </table></div>:<div style={{textAlign:"center",padding:40,color:T.ok,fontWeight:700,fontSize:FS+2}}>✓ جميع القطع تم قصها</div>}
  </div>
}

/* ══ REPORTS HUB ══ */
/* ══ EXPECTED DELIVERY DATES ══ */


export function ExpectedDeliveries({data,isMob,season}){
  const workshops=data.workshops||[];
  /* Calculate avg days per workshop from historical data */
  const wsAvgDays={};
  data.orders.forEach(o=>{(o.workshopDeliveries||[]).forEach(wd=>{
    const delDate=new Date(wd.date);
    (wd.receives||[]).forEach(r=>{
      const rcvDate=new Date(r.date);const days=Math.max(1,Math.floor((rcvDate-delDate)/(1000*60*60*24)));
      if(!wsAvgDays[wd.wsName])wsAvgDays[wd.wsName]={total:0,count:0};
      wsAvgDays[wd.wsName].total+=days;wsAvgDays[wd.wsName].count++
    })})});
  /* Pending deliveries */
  const pending=[];
  const today=new Date();
  data.orders.forEach(o=>{(o.workshopDeliveries||[]).forEach((wd,i)=>{
    const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);
    const bal=(Number(wd.qty)||0)-rcvd;
    if(bal<=0)return;
    const delDate=new Date(wd.date);
    const daysElapsed=Math.max(0,Math.floor((today-delDate)/(1000*60*60*24)));
    /* Expected days: use avg or default formula */
    const avg=wsAvgDays[wd.wsName];
    const expectedDays=avg&&avg.count>=2?Math.round(avg.total/avg.count):Math.max(5,Math.round(((Number(wd.qty)||0)/500)*6.5));
    const expectedDate=new Date(delDate);expectedDate.setDate(expectedDate.getDate()+expectedDays);
    const remaining=Math.max(0,Math.floor((expectedDate-today)/(1000*60*60*24)));
    const isLate=daysElapsed>expectedDays;
    pending.push({modelNo:o.modelNo,modelDesc:o.modelDesc,wsName:wd.wsName,garmentType:wd.garmentType||"",qty:wd.qty,bal,delDate:wd.date,daysElapsed,expectedDays,expectedDate:expectedDate.toISOString().split("T")[0],remaining,isLate})
  })});
  pending.sort((a,b)=>a.remaining-b.remaining);
  const printRep=()=>{const el=document.getElementById("exp-del");if(el)printPage("جدول التسليم المتوقع — "+season,el.innerHTML)};
  return<div id="exp-del">
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
      <div><h1 style={{fontSize:isMob?18:24,fontWeight:800,margin:"0 0 4px",color:T.accent}}>📅 مواعيد التسليم المتوقعة</h1><div style={{fontSize:FS-1,color:T.textSec}}>{"الموسم: "+season+" — "+pending.length+" تسليمة معلقة"}</div></div>
      <Btn onClick={printRep} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨</Btn>
    </div>
    {/* Workshop avg days summary */}
    {Object.keys(wsAvgDays).length>0&&<div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
      {Object.entries(wsAvgDays).map(([name,v])=><div key={name} style={{padding:"8px 14px",borderRadius:8,background:T.cardSolid,border:"1px solid "+T.brd,textAlign:"center"}}>
        <div style={{fontSize:FS-2,color:T.textSec}}>{name}</div>
        <div style={{fontSize:FS+2,fontWeight:800,color:T.accent}}>{Math.round(v.total/v.count)+" يوم"}</div>
        <div style={{fontSize:FS-3,color:T.textMut}}>{"("+v.count+" تسليمة)"}</div>
      </div>)}
    </div>}
    {pending.length>0?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:700}}>
      <thead><tr>{["الموديل","الورشة","القطعة","الكمية","الرصيد","تاريخ التسليم","أيام مضت","المتوقع","المتبقي","الحالة"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
      <tbody>{pending.map((p,i)=><tr key={i} style={{background:p.isLate?T.err+"06":""}}>
        <td style={TDB}>{p.modelNo}</td>
        <td style={{...TD,color:"#8B5CF6",fontWeight:600}}>{p.wsName}</td>
        <td style={TD}>{p.garmentType||"—"}</td>
        <td style={TDB}>{p.qty}</td>
        <td style={{...TDB,color:T.err}}>{p.bal}</td>
        <td style={TD}>{p.delDate}</td>
        <td style={{...TDB,color:p.isLate?T.err:T.text}}>{p.daysElapsed}</td>
        <td style={TDB}>{p.expectedDays+" يوم"}</td>
        <td style={{...TDB,color:p.isLate?T.err:T.ok}}>{p.isLate?"متأخر "+(p.daysElapsed-p.expectedDays)+" يوم":p.remaining+" يوم"}</td>
        <td style={TD}>{p.isLate?<span style={{padding:"2px 8px",borderRadius:6,background:T.err+"12",color:T.err,fontWeight:700,fontSize:FS-2}}>متأخر</span>:<span style={{padding:"2px 8px",borderRadius:6,background:T.ok+"12",color:T.ok,fontWeight:700,fontSize:FS-2}}>في الموعد</span>}</td>
      </tr>)}</tbody>
    </table></div>:<div style={{textAlign:"center",padding:40,color:T.ok,fontWeight:700,fontSize:FS+2}}>✓ لا توجد تسليمات معلقة</div>}
  </div>
}

/* ══ AVAILABLE FOR DELIVERY REPORT ══ */


export function AvailableReport({data,isMob,season}){
  const rows=[];
  data.orders.forEach(o=>{
    const t=calcOrder(o);const pieces=o.orderPieces||[];const wds=o.workshopDeliveries||[];
    /* Find linked pieces */
    const linkedPieces=new Set();FKEYS.forEach(k=>{if(gf(o,k))(o["fabricPieces"+k]||[]).forEach(p=>linkedPieces.add(p))});
    if(pieces.length>0){
      pieces.forEach(p=>{
        if(!linkedPieces.has(p))return;/* not cut yet */
        const delForP=wds.filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0);
        const avail=t.cutQty-delForP;
        if(avail>0)rows.push({modelNo:o.modelNo,modelDesc:o.modelDesc,piece:p,cutQty:t.cutQty,delivered:delForP,available:avail,status:o.status,orderId:o.id})
      })
    }else{
      const totalDel=wds.reduce((s,wd)=>s+(Number(wd.qty)||0),0);
      const avail=t.cutQty-totalDel;
      if(avail>0&&t.cutQty>0)rows.push({modelNo:o.modelNo,modelDesc:o.modelDesc,piece:"—",cutQty:t.cutQty,delivered:totalDel,available:avail,status:o.status,orderId:o.id})
    }
  });
  rows.sort((a,b)=>b.available-a.available);
  const totalAvail=rows.reduce((s,r)=>s+r.available,0);
  const printRep=()=>{
    let h="<div style='margin-bottom:16px;text-align:center'><h2 style='margin:0;font-size:18px;color:#0284C7'>📤 تقرير القطع المتاحة للتسليم</h2><p style='margin:4px 0;font-size:13px;color:#64748B'>"+rows.length+" بند — "+fmt(totalAvail)+" قطعة متاحة</p></div>";
    h+="<table><thead><tr><th>#</th><th>رقم الموديل</th><th>الوصف</th><th>القطعة</th><th>كمية القص</th><th>تسليم عملاء</th><th>متاح للتسليم</th></tr></thead><tbody>";
    rows.forEach((r,i)=>{h+="<tr><td>"+(i+1)+"</td><td style='font-weight:700'>"+r.modelNo+"</td><td>"+r.modelDesc+"</td><td style='color:#8B5CF6;font-weight:700'>"+r.piece+"</td><td style='font-weight:700'>"+r.cutQty+"</td><td style='color:#F59E0B;font-weight:700'>"+r.delivered+"</td><td style='color:#10B981;font-weight:800;font-size:14px'>"+r.available+"</td></tr>"});
    h+="<tr style='background:#EFF6FF;font-weight:800'><td colspan='4'>الاجمالي</td><td>"+fmt(rows.reduce((s,r)=>s+r.cutQty,0))+"</td><td>"+fmt(rows.reduce((s,r)=>s+r.delivered,0))+"</td><td style='color:#10B981;font-size:16px'>"+fmt(totalAvail)+"</td></tr>";
    h+="</tbody></table>";
    h+="<div style='margin-top:20px;padding:12px;border:2px solid #E2E8F0;border-radius:8px;text-align:center;font-size:11px;color:#94A3B8'>تم الطباعة في "+new Date().toLocaleDateString("ar-EG")+" — CLARK Factory Management</div>";
    printPage("القطع المتاحة للتسليم — "+season,h)
  };
  return<div id="avail-rep">
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
      <div><h1 style={{fontSize:isMob?18:24,fontWeight:800,margin:"0 0 4px",color:T.accent}}>📤 القطع المتاحة للتسليم</h1><div style={{fontSize:FS-1,color:T.textSec}}>{"الموسم: "+season+" — "+rows.length+" بند — "+fmt(totalAvail)+" قطعة متاحة"}</div></div>
      <Btn onClick={printRep} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨</Btn>
    </div>
    {rows.length>0?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:500}}>
      <thead><tr>{["#","الموديل","الوصف","القطعة","كمية القص","تم تسليمه","متاح للتسليم"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r,i)=><tr key={i}>
        <td style={TD}>{i+1}</td>
        <td style={TDB}>{r.modelNo}</td>
        <td style={TD}>{r.modelDesc}</td>
        <td style={{...TD,color:"#8B5CF6",fontWeight:600}}>{r.piece}</td>
        <td style={TDB}>{r.cutQty}</td>
        <td style={{...TDB,color:T.warn}}>{r.delivered}</td>
        <td style={{...TDB,color:T.ok,fontSize:FS+1}}>{r.available}</td>
      </tr>)}
      <tr style={{background:T.accent+"08",fontWeight:800}}><td colSpan={4} style={TD}>الاجمالي</td><td style={TDB}>{fmt(rows.reduce((s,r)=>s+r.cutQty,0))}</td><td style={TDB}>{fmt(rows.reduce((s,r)=>s+r.delivered,0))}</td><td style={{...TDB,color:T.ok,fontSize:FS+2}}>{fmt(totalAvail)}</td></tr>
      </tbody>
    </table></div>:<div style={{textAlign:"center",padding:40,color:T.ok,fontWeight:700,fontSize:FS+2}}>✓ لا توجد قطع متاحة — تم تسليم كل شيء</div>}
  </div>
}



export function FloorStockReport({data,isMob,season}){
  const orders=data.orders||[];const[filter,setFilter]=useState("");const[pieceFilter,setPieceFilter]=useState("");
  const rows=[];const allPieces=new Set();
  orders.forEach(o=>{const t=calcOrder(o);if(t.cutQty===0)return;const pieces=o.orderPieces||[];const wds=o.workshopDeliveries||[];
    if(pieces.length>0){const linkedPieces=new Set();FKEYS.forEach(k=>{if(gf(o,k))(o["fabricPieces"+k]||[]).forEach(p=>linkedPieces.add(p))});
      pieces.forEach(p=>{allPieces.add(p);const isCut=linkedPieces.has(p);if(!isCut)return;const del=wds.filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0);const floor=t.cutQty-del;
        if(floor>0){const days=Math.floor((Date.now()-new Date(o.date))/(86400000));rows.push({modelNo:o.modelNo,desc:o.modelDesc,piece:p,cut:t.cutQty,del,floor,days})}})}
    else{allPieces.add("عام");const del=wds.reduce((s,wd)=>s+(Number(wd.qty)||0),0);const floor=t.cutQty-del;
      if(floor>0){const days=Math.floor((Date.now()-new Date(o.date))/(86400000));rows.push({modelNo:o.modelNo,desc:o.modelDesc,piece:"عام",cut:t.cutQty,del,floor,days})}}});
  rows.sort((a,b)=>b.floor-a.floor);
  const filtered=rows.filter(r=>{if(filter&&!r.modelNo.includes(filter)&&!(r.desc||"").toLowerCase().includes(filter.toLowerCase()))return false;if(pieceFilter&&r.piece!==pieceFilter)return false;return true});
  const totalFloor=filtered.reduce((s,r)=>s+r.floor,0);
  const printFloor=()=>{let h="<h2 style='text-align:center'>🏭 قطع على الأرض — "+season+"</h2>";
    h+="<table><thead><tr><th>الموديل</th><th>الوصف</th><th>القطعة</th><th>القص</th><th>تسليم</th><th>الأرض</th><th>الأيام</th></tr></thead><tbody>";
    filtered.forEach(r=>{h+="<tr><td style='font-weight:800'>"+r.modelNo+"</td><td>"+r.desc+"</td><td>"+r.piece+"</td><td style='text-align:center'>"+r.cut+"</td><td style='text-align:center'>"+r.del+"</td><td style='text-align:center;font-weight:800;color:#F59E0B'>"+r.floor+"</td><td style='text-align:center'>"+r.days+"</td></tr>"});
    h+="</tbody></table>";printPage("قطع على الأرض",h)};
  return<div>
    <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
      <div style={{flex:1,minWidth:150}}><Inp value={filter} onChange={setFilter} placeholder="بحث بالموديل..."/></div>
      <Sel value={pieceFilter} onChange={setPieceFilter}><option value="">كل القطع</option>{[...allPieces].sort().map(p=><option key={p} value={p}>{p}</option>)}</Sel>
      <Btn onClick={printFloor} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>🖨</Btn>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
      <div style={{padding:10,borderRadius:10,background:"#F59E0B08",border:"1px solid #F59E0B15",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>على الأرض</div><div style={{fontSize:18,fontWeight:800,color:"#F59E0B"}}>{totalFloor}</div></div>
      <div style={{padding:10,borderRadius:10,background:T.accent+"08",border:"1px solid "+T.accent+"15",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>موديلات</div><div style={{fontSize:18,fontWeight:800,color:T.accent}}>{[...new Set(filtered.map(r=>r.modelNo))].length}</div></div>
      <div style={{padding:10,borderRadius:10,background:"#EF444408",border:"1px solid #EF444415",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>{"> 7 أيام"}</div><div style={{fontSize:18,fontWeight:800,color:"#EF4444"}}>{filtered.filter(r=>r.days>7).length}</div></div>
    </div>
    {filtered.length===0?<div style={{textAlign:"center",padding:30,color:T.textMut}}>✅ لا توجد قطع</div>:
    <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["الموديل","الوصف","القطعة","القص","تسليم","الأرض","أيام"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
      <tbody>{filtered.map((r,i)=><tr key={i} style={{background:r.days>7?"#FEF2F2":"transparent"}}><td style={{...TD,fontWeight:800,color:T.accent}}>{r.modelNo}</td><td style={TD}>{r.desc}</td><td style={{...TD,color:"#8B5CF6"}}>{r.piece}</td><td style={TDB}>{r.cut}</td><td style={{...TDB,color:T.ok}}>{r.del}</td><td style={{...TDB,fontWeight:800,color:"#F59E0B"}}>{r.floor}</td><td style={{...TDB,color:r.days>7?"#EF4444":T.textMut}}>{r.days}</td></tr>)}
      </tbody></table></div>}
  </div>
}


export function ReportsHub({data,isMob,season,statusCards}){
  const[sub,setSub]=useState(null);
  const sections=[
    {title:"📊 الإنتاج",color:"#06B6D4",reports:[
      {key:"production",label:"تقرير الانتاج",icon:"📈",color:"#06B6D4"},
      {key:"uncut",label:"قطع لم يتم قصها",icon:"✂️",color:"#EF4444"},
      {key:"floor",label:"قطع على الأرض",icon:"🏭",color:"#F59E0B"},
      {key:"available",label:"القطع المتاحة للتسليم",icon:"📤",color:"#059669"},
      {key:"expected",label:"مواعيد التسليم المتوقعة",icon:"📅",color:"#F97316"},
      {key:"fabrics",label:"الخامات المستهلكة",icon:"🧵",color:"#8B5CF6"},
      {key:"orderAge",label:"عمر الأوردر",icon:"⏱️",color:"#DC2626"},
      {key:"capacity",label:"الطاقة الإنتاجية",icon:"📊",color:"#7C3AED"},
    ]},
    {title:"🏭 الورش",color:"#F59E0B",reports:[
      {key:"wsFullAccount",label:"تقرير تشغيل خارجي",icon:"📊",color:"#8B5CF6"},
      {key:"wsPerf",label:"انتاجية الورش",icon:"⚡",color:"#F59E0B"},
      {key:"delivery",label:"معدل التسليم",icon:"📦",color:"#10B981"},
      {key:"wsCostPerPiece",label:"تكلفة القطعة بالورشة",icon:"💲",color:"#EC4899"},
      {key:"wsStuck",label:"بضاعة معلقة عند الورش",icon:"🚨",color:"#EF4444"},
    ]},
    {title:"💰 المبيعات والعملاء",color:"#10B981",reports:[
      {key:"summary",label:"ملخص الموسم",icon:"📋",color:"#0EA5E9"},
      {key:"cost",label:"التكاليف",icon:"💰",color:"#EC4899"},
      {key:"modelProfit",label:"أرباح الموديل",icon:"💎",color:"#059669"},
      {key:"topCustomers",label:"أعلى 10 عملاء",icon:"🏆",color:"#F59E0B"},
      {key:"aging",label:"تقرير التحصيل (Aging)",icon:"⏳",color:"#EF4444"},
    ]},
    {title:"🏦 المالية",color:"#8B5CF6",reports:[
      {key:"monthlyExpenses",label:"المصروفات الشهرية",icon:"📉",color:"#8B5CF6"},
      {key:"cashflow",label:"التدفق النقدي",icon:"💹",color:"#0EA5E9"},
    ]},
    {title:"👷 الموارد البشرية",color:"#F97316",reports:[
      {key:"laborCost",label:"تكلفة العمالة",icon:"👷",color:"#F97316"},
    ]},
  ];
  const back=<Btn ghost onClick={()=>setSub(null)} style={{marginBottom:10}}>↩ التقارير</Btn>;
  if(sub==="floor")return<div>{back}<FloorStockReport data={data} isMob={isMob} season={season}/></div>;
  if(sub==="available")return<div>{back}<AvailableReport data={data} isMob={isMob} season={season}/></div>;
  if(sub==="expected")return<div>{back}<ExpectedDeliveries data={data} isMob={isMob} season={season}/></div>;
  if(sub==="uncut")return<div>{back}<UncutReport data={data} isMob={isMob} season={season}/></div>;
  if(sub==="production")return<div>{back}<RepPg data={data} isMob={isMob} season={season} statusCards={statusCards}/></div>;
  if(sub==="cost")return<div>{back}<CostPg data={data} isMob={isMob} statusCards={statusCards}/></div>;
  if(sub==="fabrics")return<div>{back}<FabricReport data={data} isMob={isMob} season={season}/></div>;
  if(sub==="wsPerf")return<div>{back}<WsPerfReport data={data} isMob={isMob} season={season}/></div>;
  if(sub==="wsFullAccount")return<div>{back}<WsFullAccountReport data={data} isMob={isMob} season={season}/></div>;
  if(sub==="delivery")return<div>{back}<DeliveryReport data={data} isMob={isMob} season={season}/></div>;
  if(sub==="summary")return<div>{back}<SeasonSummary data={data} isMob={isMob} season={season} statusCards={statusCards}/></div>;
  /* ── New reports ── */
  if(sub==="orderAge")return<div>{back}<OrderAgeReport data={data} isMob={isMob} season={season} statusCards={statusCards}/></div>;
  if(sub==="capacity")return<div>{back}<CapacityReport data={data} isMob={isMob} season={season}/></div>;
  if(sub==="wsCostPerPiece")return<div>{back}<WsCostReport data={data} isMob={isMob} season={season}/></div>;
  if(sub==="wsStuck")return<div>{back}<WsStuckReport data={data} isMob={isMob} season={season}/></div>;
  if(sub==="modelProfit")return<div>{back}<ModelProfitReport data={data} isMob={isMob} season={season} statusCards={statusCards}/></div>;
  if(sub==="topCustomers")return<div>{back}<TopCustomersReport data={data} isMob={isMob} season={season}/></div>;
  if(sub==="aging")return<div>{back}<AgingReport data={data} isMob={isMob} season={season}/></div>;
  if(sub==="monthlyExpenses")return<div>{back}<MonthlyExpensesReport data={data} isMob={isMob}/></div>;
  if(sub==="cashflow")return<div>{back}<CashflowReport data={data} isMob={isMob}/></div>;
  if(sub==="laborCost")return<div>{back}<LaborCostReport data={data} isMob={isMob}/></div>;
  return<div>
    {sections.map(sec=><div key={sec.title} style={{marginBottom:20}}>
      <div style={{fontSize:FS+2,fontWeight:800,color:sec.color,marginBottom:10,paddingBottom:6,borderBottom:"2px solid "+sec.color+"30"}}>{sec.title}</div>
      <div style={{display:"grid",gridTemplateColumns:isMob?"repeat(2,1fr)":"repeat(3,1fr)",gap:10}}>
        {sec.reports.map(r=><div key={r.key} onClick={()=>setSub(r.key)} style={{background:T.cardSolid,borderRadius:14,padding:isMob?14:18,border:"1px solid "+T.brd,boxShadow:T.shadow,cursor:"pointer",display:"flex",alignItems:"center",gap:12,transition:"transform 0.15s"}} onMouseEnter={e=>e.currentTarget.style.transform="translateY(-2px)"} onMouseLeave={e=>e.currentTarget.style.transform=""}>
          <div style={{width:42,height:42,borderRadius:12,background:r.color+"12",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{r.icon}</div>
          <div style={{fontSize:FS,fontWeight:700,color:T.text}}>{r.label}</div>
        </div>)}
      </div>
    </div>)}
  </div>
}

/* ══ WORKSHOP FULL ACCOUNT REPORT ══
   Comprehensive workshop accounting: deliveries by garment type, payments, 
   timeline of all movements, and full reconciliation per workshop. */


export function WsFullAccountReport({data,isMob,season}){
  const today=new Date().toLocaleDateString("ar-EG",{year:"numeric",month:"long",day:"numeric"});
  const orders=data.orders||[];
  const workshops=(data.workshops||[]).filter(w=>w&&w.name);
  const wsPayments=data.wsPayments||[];
  const[selectedWs,setSelectedWs]=useState("");/* "" = all */
  const[dateFrom,setDateFrom]=useState("");
  const[dateTo,setDateTo]=useState("");
  const[hideInternal,setHideInternal]=useState(true);
  
  /* Helper: is date in range */
  const inRange=(d)=>{if(!d)return true;if(dateFrom&&d<dateFrom)return false;if(dateTo&&d>dateTo)return false;return true};
  
  /* Build per-workshop account */
  const wsAccounts=useMemo(()=>{
    const accounts=[];
    workshops.forEach(ws=>{
      if(hideInternal&&(ws.type==="خياطة داخلي"||ws.type==="internal"))return;
      if(selectedWs&&ws.name!==selectedWs)return;
      
      /* 1. Build garment breakdown: deliveries + receives per garmentType */
      const byGarment={};/* "بنطلون" → {delivered, received, balance, price, value} */
      const timeline=[];/* chronological movements: deliveries + receives */
      let totalDelivered=0,totalReceived=0,totalValue=0;
      
      orders.forEach(o=>{
        (o.workshopDeliveries||[]).filter(wd=>wd.wsName===ws.name).forEach(wd=>{
          const gt=wd.garmentType||"عام";
          const delQty=Number(wd.qty)||0;
          const price=Number(wd.price)||0;
          /* Delivery entry */
          if(inRange(wd.date)){
            if(!byGarment[gt])byGarment[gt]={delivered:0,received:0,balance:0,totalValue:0,avgPrice:0,_prices:[]};
            byGarment[gt].delivered+=delQty;
            byGarment[gt]._prices.push({qty:delQty,price});
            totalDelivered+=delQty;
            timeline.push({
              date:wd.date,type:"delivery",modelNo:o.modelNo||"—",
              garmentType:gt,qty:delQty,price,
              orderId:o.id,note:"تسليم للورشة"
            });
          }
          /* Receives entries */
          (wd.receives||[]).forEach(r=>{
            if(!inRange(r.date))return;
            const rQty=Number(r.qty)||0;
            const rPrice=Number(r.price)||price;
            if(!byGarment[gt])byGarment[gt]={delivered:0,received:0,balance:0,totalValue:0,avgPrice:0,_prices:[]};
            byGarment[gt].received+=rQty;
            byGarment[gt].totalValue+=r2(rQty*rPrice);
            totalReceived+=rQty;
            totalValue+=r2(rQty*rPrice);
            timeline.push({
              date:r.date,type:"receive",modelNo:o.modelNo||"—",
              garmentType:gt,qty:rQty,price:rPrice,
              orderId:o.id,note:"استلام من الورشة"
            });
          });
        });
      });
      
      /* Finalize garment stats */
      const garmentList=Object.entries(byGarment).map(([gt,g])=>{
        const totalDelQty=g._prices.reduce((s,p)=>s+p.qty,0);
        const totalDelPrice=g._prices.reduce((s,p)=>s+p.qty*p.price,0);
        const avgPrice=totalDelQty>0?r2(totalDelPrice/totalDelQty):0;
        return{
          garmentType:gt,
          delivered:g.delivered,
          received:g.received,
          balance:g.delivered-g.received,
          avgPrice,
          totalValue:r2(g.totalValue)
        };
      }).sort((a,b)=>b.totalValue-a.totalValue);
      
      /* 2. Payments */
      const wsPays=wsPayments.filter(p=>p.wsName===ws.name&&inRange(p.date));
      const totalPaid=wsPays.filter(p=>p.type==="payment").reduce((s,p)=>s+(Number(p.amount)||0),0);
      const totalPurchase=wsPays.filter(p=>p.type==="purchase").reduce((s,p)=>s+(Number(p.amount)||0),0);
      const paymentsList=wsPays.slice().sort((a,b)=>(a.date||"").localeCompare(b.date||""));
      
      /* 3. Sort timeline */
      timeline.sort((a,b)=>(a.date||"").localeCompare(b.date||"")||(a.type==="delivery"?-1:1));
      
      /* 4. Reconciliation */
      const totalDue=r2(totalValue+totalPurchase);
      const balance=r2(totalDue-totalPaid);
      const qtyBalance=totalDelivered-totalReceived;
      
      /* 5. EXPECTED — if workshop delivers ALL remaining pieces */
      /* For each garment type, use its avgPrice to value the balance (pieces not yet delivered back) */
      let expectedExtra=0;
      garmentList.forEach(g=>{
        if(g.balance>0&&g.avgPrice>0){expectedExtra+=r2(g.balance*g.avgPrice)}
      });
      const expectedBalance=r2(balance+expectedExtra);
      
      accounts.push({
        ws,garmentList,paymentsList,timeline,
        totalDelivered,totalReceived,qtyBalance,
        totalValue,totalPurchase,totalPaid,totalDue,balance,
        expectedExtra,expectedBalance
      });
    });
    return accounts;
  },[orders,workshops,wsPayments,selectedWs,dateFrom,dateTo,hideInternal]);
  
  /* Grand totals */
  const grand=useMemo(()=>{
    let gDel=0,gRcv=0,gVal=0,gPaid=0,gPurch=0,gBal=0,gExpExtra=0,gExpBal=0;
    wsAccounts.forEach(a=>{gDel+=a.totalDelivered;gRcv+=a.totalReceived;gVal+=a.totalValue;gPaid+=a.totalPaid;gPurch+=a.totalPurchase;gBal+=a.balance;gExpExtra+=a.expectedExtra;gExpBal+=a.expectedBalance});
    return{gDel,gRcv,gVal,gPaid,gPurch,gBal,gExpExtra,gExpBal,count:wsAccounts.length};
  },[wsAccounts]);
  
  /* Export to Excel */
  const exportReport=()=>{
    const rows=[["تقرير تشغيل خارجي"]];
    rows.push(["تاريخ الطباعة:",today]);
    if(dateFrom||dateTo)rows.push(["الفترة:",(dateFrom||"البداية")+" → "+(dateTo||"النهاية")]);
    rows.push([]);
    wsAccounts.forEach(a=>{
      rows.push(["════════════════════════"]);
      rows.push(["الورشة:",a.ws.name,"المالك:",a.ws.owner||"—"]);
      rows.push([]);
      rows.push(["── القطع حسب النوع ──"]);
      rows.push(["نوع القطعة","تسليم","استلام مصنع","متبقي","متوسط السعر","القيمة"]);
      a.garmentList.forEach(g=>rows.push([g.garmentType,g.delivered,g.received,g.balance,g.avgPrice,g.totalValue]));
      rows.push(["الإجمالي",a.totalDelivered,a.totalReceived,a.qtyBalance,"",a.totalValue]);
      rows.push([]);
      rows.push(["── Timeline الحركات ──"]);
      rows.push(["التاريخ","النوع","الموديل","القطعة","الكمية","السعر"]);
      a.timeline.forEach(t=>rows.push([t.date,t.type==="delivery"?"تسليم":"استلام",t.modelNo,t.garmentType,t.qty,t.price]));
      rows.push([]);
      rows.push(["── الدفعات ──"]);
      rows.push(["التاريخ","النوع","المبلغ","ملاحظات"]);
      a.paymentsList.forEach(p=>rows.push([p.date,p.type==="payment"?"دفعة":"مشتريات",p.amount,p.notes||""]));
      rows.push(["الإجمالي المدفوع","","",a.totalPaid]);
      rows.push([]);
      rows.push(["── كشف الحساب ──"]);
      rows.push(["قيمة استلام المصنع",a.totalValue]);
      rows.push(["مشتريات",a.totalPurchase]);
      rows.push(["المستحق الإجمالي",a.totalDue]);
      rows.push(["المدفوع",a.totalPaid]);
      rows.push(["🟢 الرصيد الحالي المستحق",a.balance]);
      if(a.expectedExtra>0){
        rows.push(["🔴 متوقع إضافي (لو سلّمت الباقي)",a.expectedExtra]);
        rows.push(["🟣 إجمالي متوقع",a.expectedBalance]);
      }
      rows.push(["عدد القطع عند الورشة",a.qtyBalance+" قطعة"]);
      rows.push([]);rows.push([]);
    });
    exportExcel(rows,"تقرير_تشغيل_خارجي_"+today);
  };
  
  /* Print */
  const printReport=()=>{
    let html="<div class='hdr'><div style='font-size:18px;font-weight:800;color:#8B5CF6'>📊 تقرير تشغيل خارجي</div><div class='hdr-info'><div>تاريخ الطباعة: "+today+"</div>"+(dateFrom||dateTo?"<div>الفترة: "+(dateFrom||"البداية")+" → "+(dateTo||"النهاية")+"</div>":"")+"</div></div>";
    html+="<table style='margin-bottom:20px'><tr><th>إجمالي الورش</th><td class='info'>"+grand.count+"</td><th>تسليم</th><td>"+fmt(grand.gDel)+"</td><th>استلام مصنع</th><td>"+fmt(grand.gRcv)+"</td></tr><tr><th>قيمة الإنتاج</th><td class='ok'>"+fmt(r2(grand.gVal))+"</td><th>🟢 الرصيد الحالي</th><td class='err'><b>"+fmt(r2(grand.gBal))+"</b></td>"+(grand.gExpExtra>0?"<th style='color:#DC2626'>🔴 متوقع إضافي</th><td style='color:#DC2626'><b>+"+fmt(r2(grand.gExpExtra))+"</b></td>":"<th></th><td></td>")+"</tr></table>";
    wsAccounts.forEach(a=>{
      html+="<h2 style='color:#8B5CF6;page-break-before:avoid'>🏭 "+a.ws.name+(a.ws.owner?" — "+a.ws.owner:"")+"</h2>";
      /* Garment breakdown */
      html+="<h3>القطع حسب النوع</h3>";
      html+="<table><thead><tr><th>نوع القطعة</th><th>تسليم</th><th>استلام مصنع</th><th>متبقي</th><th>متوسط السعر</th><th>القيمة</th></tr></thead><tbody>";
      a.garmentList.forEach(g=>{html+="<tr><td><b>"+g.garmentType+"</b></td><td class='center'>"+fmt(g.delivered)+"</td><td class='center'>"+fmt(g.received)+"</td><td class='center "+(g.balance>0?"warn":"")+"'>"+fmt(g.balance)+"</td><td class='center'>"+fmt(g.avgPrice)+"</td><td class='center ok'>"+fmt(g.totalValue)+"</td></tr>"});
      html+="<tr style='background:#F3E8FF;font-weight:800'><td>الإجمالي</td><td class='center'>"+fmt(a.totalDelivered)+"</td><td class='center'>"+fmt(a.totalReceived)+"</td><td class='center'>"+fmt(a.qtyBalance)+"</td><td></td><td class='center'>"+fmt(a.totalValue)+"</td></tr>";
      html+="</tbody></table>";
      /* Timeline */
      if(a.timeline.length>0){
        html+="<h3>Timeline الحركات</h3>";
        html+="<table><thead><tr><th>التاريخ</th><th>النوع</th><th>الموديل</th><th>القطعة</th><th>الكمية</th><th>السعر</th></tr></thead><tbody>";
        a.timeline.forEach(t=>{const col=t.type==="delivery"?"#3B82F6":"#10B981";const lbl=t.type==="delivery"?"↗ تسليم":"↙ استلام";html+="<tr><td>"+t.date+"</td><td style='color:"+col+";font-weight:700'>"+lbl+"</td><td>"+t.modelNo+"</td><td>"+t.garmentType+"</td><td class='center'>"+fmt(t.qty)+"</td><td class='center'>"+fmt(t.price)+"</td></tr>"});
        html+="</tbody></table>";
      }
      /* Payments */
      if(a.paymentsList.length>0){
        html+="<h3>الدفعات</h3>";
        html+="<table><thead><tr><th>التاريخ</th><th>النوع</th><th>المبلغ</th><th>ملاحظات</th></tr></thead><tbody>";
        a.paymentsList.forEach(p=>{const col=p.type==="payment"?"#10B981":"#F59E0B";const lbl=p.type==="payment"?"💵 دفعة":"🛒 مشتريات";html+="<tr><td>"+p.date+"</td><td style='color:"+col+";font-weight:700'>"+lbl+"</td><td class='center'>"+fmt(Number(p.amount))+"</td><td>"+(p.notes||"—")+"</td></tr>"});
        html+="<tr style='background:#ECFDF5;font-weight:800'><td colspan='2'>الإجمالي المدفوع</td><td class='center ok'>"+fmt(r2(a.totalPaid))+"</td><td></td></tr>";
        html+="</tbody></table>";
      }
      /* Reconciliation */
      html+="<h3>كشف الحساب</h3>";
      html+="<table><tbody>";
      html+="<tr><th>قيمة استلام المصنع</th><td class='center ok'>"+fmt(r2(a.totalValue))+" ج.م</td></tr>";
      if(a.totalPurchase>0)html+="<tr><th>مشتريات الورشة</th><td class='center'>"+fmt(r2(a.totalPurchase))+" ج.م</td></tr>";
      html+="<tr><th>المستحق الإجمالي</th><td class='center info'><b>"+fmt(r2(a.totalDue))+" ج.م</b></td></tr>";
      html+="<tr><th>إجمالي المدفوع</th><td class='center'>("+fmt(r2(a.totalPaid))+") ج.م</td></tr>";
      html+="<tr style='background:"+(a.balance>0?"#FEF2F2":"#ECFDF5")+"'><th><b>🟢 الرصيد الحالي المستحق</b></th><td class='center "+(a.balance>0?"err":"ok")+"'><b style='font-size:14px'>"+fmt(r2(a.balance))+" ج.م</b></td></tr>";
      if(a.expectedExtra>0){
        html+="<tr style='background:#FEE2E2;border-top:2px dashed #DC2626'><th style='color:#DC2626'>🔴 متوقع إضافي (لو سلّمت "+fmt(a.qtyBalance)+" قطعة)</th><td class='center' style='color:#DC2626;font-weight:800'>+"+fmt(r2(a.expectedExtra))+" ج.م</td></tr>";
        html+="<tr style='background:#F3E8FF'><th style='color:#8B5CF6'>🟣 إجمالي متوقع</th><td class='center' style='color:#8B5CF6;font-weight:800;font-size:14px'>"+fmt(r2(a.expectedBalance))+" ج.م</td></tr>";
      }
      if(a.qtyBalance>0)html+="<tr style='background:#FFF7ED'><th>عدد القطع عند الورشة</th><td class='center warn'><b>"+fmt(a.qtyBalance)+" قطعة</b></td></tr>";
      html+="</tbody></table>";
      html+="<div style='page-break-after:auto;margin-bottom:20px'></div>";
    });
    html+="<div class='foot'>CLARK Factory Management — تقرير تشغيل خارجي — "+today+"</div>";
    printPage("تقرير تشغيل خارجي",html);
  };
  
  return<div>
    {/* Filters */}
    <Card>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end",marginBottom:10}}>
        <div style={{minWidth:160}}>
          <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>الورشة</label>
          <Sel value={selectedWs} onChange={setSelectedWs}>
            <option value="">كل الورش</option>
            {workshops.map(w=><option key={w.id||w.name} value={w.name}>{w.name}</option>)}
          </Sel>
        </div>
        <div style={{minWidth:130}}>
          <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>من تاريخ</label>
          <Inp type="date" value={dateFrom} onChange={setDateFrom}/>
        </div>
        <div style={{minWidth:130}}>
          <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>إلى تاريخ</label>
          <Inp type="date" value={dateTo} onChange={setDateTo}/>
        </div>
        <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",padding:"8px 12px",borderRadius:8,background:hideInternal?"#8B5CF612":T.bg,border:"1px solid "+(hideInternal?"#8B5CF630":T.brd)}}>
          <input type="checkbox" checked={hideInternal} onChange={e=>setHideInternal(e.target.checked)}/>
          <span style={{fontSize:FS-1,fontWeight:600,color:hideInternal?"#8B5CF6":T.textSec}}>إخفاء الورش الداخلية</span>
        </label>
        {(dateFrom||dateTo||selectedWs)&&<Btn small ghost onClick={()=>{setDateFrom("");setDateTo("");setSelectedWs("")}}>✕ مسح</Btn>}
        <div style={{marginInlineStart:"auto",display:"flex",gap:8}}>
          <Btn small onClick={printReport} style={{background:"#8B5CF612",color:"#8B5CF6",border:"1px solid #8B5CF630",fontWeight:700}}>🖨 طباعة</Btn>
          <Btn small onClick={exportReport} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30",fontWeight:700}}>📊 Excel</Btn>
        </div>
      </div>
    </Card>
    
    {/* Grand summary */}
    {wsAccounts.length>0&&<Card title={"📊 ملخص إجمالي — "+grand.count+" ورشة"} style={{marginBottom:14}}>
      <div style={{display:"grid",gridTemplateColumns:isMob?"repeat(2,1fr)":"repeat(3,1fr)",gap:10,marginBottom:10}}>
        <div style={{padding:12,borderRadius:10,background:"#3B82F608",border:"1px solid #3B82F620",textAlign:"center"}}>
          <div style={{fontSize:FS-3,color:T.textSec}}>تسليم للورش</div>
          <div style={{fontSize:FS+4,fontWeight:800,color:"#3B82F6"}}>{fmt(grand.gDel)}</div>
          <div style={{fontSize:FS-3,color:T.textMut}}>قطعة</div>
        </div>
        <div style={{padding:12,borderRadius:10,background:"#10B98108",border:"1px solid #10B98120",textAlign:"center"}}>
          <div style={{fontSize:FS-3,color:T.textSec}}>مُستلَم من الورش</div>
          <div style={{fontSize:FS+4,fontWeight:800,color:T.ok}}>{fmt(grand.gRcv)}</div>
          <div style={{fontSize:FS-3,color:T.textMut}}>قطعة</div>
        </div>
        <div style={{padding:12,borderRadius:10,background:"#F59E0B08",border:"1px solid #F59E0B20",textAlign:"center"}}>
          <div style={{fontSize:FS-3,color:T.textSec}}>متبقي عند الورش</div>
          <div style={{fontSize:FS+4,fontWeight:800,color:T.warn}}>{fmt(grand.gDel-grand.gRcv)}</div>
          <div style={{fontSize:FS-3,color:T.textMut}}>قطعة</div>
        </div>
      </div>
      {/* Financial summary */}
      <div style={{display:"grid",gridTemplateColumns:isMob?"repeat(2,1fr)":"repeat(3,1fr)",gap:10}}>
        <div style={{padding:12,borderRadius:10,background:"#8B5CF608",border:"1px solid #8B5CF620",textAlign:"center"}}>
          <div style={{fontSize:FS-3,color:T.textSec}}>قيمة استلام المصنع</div>
          <div style={{fontSize:FS+2,fontWeight:800,color:"#8B5CF6"}}>{fmt(r2(grand.gVal))}</div>
          <div style={{fontSize:FS-3,color:T.textMut}}>ج.م</div>
        </div>
        <div style={{padding:12,borderRadius:10,background:grand.gBal>0?T.err+"08":T.ok+"08",border:"2px solid "+(grand.gBal>0?T.err+"30":T.ok+"30"),textAlign:"center"}}>
          <div style={{fontSize:FS-3,color:T.textSec,fontWeight:700}}>🟢 الرصيد الحالي المستحق</div>
          <div style={{fontSize:FS+4,fontWeight:800,color:grand.gBal>0?T.err:T.ok}}>{fmt(r2(grand.gBal))}</div>
          <div style={{fontSize:FS-3,color:T.textMut}}>ج.م</div>
        </div>
        {grand.gExpExtra>0?<div style={{padding:12,borderRadius:10,background:T.err+"05",border:"2px dashed "+T.err+"40",textAlign:"center"}}>
          <div style={{fontSize:FS-3,color:T.textSec,fontWeight:700}}>🔴 متوقع لو سلّموا الباقي</div>
          <div style={{fontSize:FS+2,fontWeight:800,color:T.err}}>+{fmt(r2(grand.gExpExtra))}</div>
          <div style={{fontSize:FS-3,color:"#8B5CF6",fontWeight:700,marginTop:2}}>= {fmt(r2(grand.gExpBal))} ج.م</div>
        </div>:<div style={{padding:12,borderRadius:10,background:T.bg,border:"1px solid "+T.brd,textAlign:"center"}}>
          <div style={{fontSize:FS-3,color:T.textSec}}>✅ لا يوجد شغل معلق</div>
          <div style={{fontSize:FS,fontWeight:700,color:T.ok,marginTop:4}}>الورش ملتزمة بالتسليم</div>
        </div>}
      </div>
    </Card>}
    
    {/* Per-workshop detail */}
    {wsAccounts.length===0?<Card><div style={{padding:40,textAlign:"center",color:T.textMut}}>
      <div style={{fontSize:40,marginBottom:10}}>📊</div>
      <div style={{fontSize:FS+1}}>لا توجد ورش مطابقة للفلاتر</div>
    </div></Card>:wsAccounts.map(a=><Card key={a.ws.id||a.ws.name} style={{marginBottom:14}}>
      {/* Workshop header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,paddingBottom:10,borderBottom:"2px solid #8B5CF630"}}>
        <div>
          <div style={{fontSize:FS+4,fontWeight:800,color:"#8B5CF6"}}>🏭 {a.ws.name}</div>
          <div style={{fontSize:FS-1,color:T.textMut,marginTop:4,display:"flex",gap:10,flexWrap:"wrap"}}>
            {a.ws.owner&&<span>👤 {a.ws.owner}</span>}
            {a.ws.type&&<span style={{padding:"2px 8px",borderRadius:6,background:"#8B5CF615",color:"#8B5CF6",fontWeight:700}}>{a.ws.type}</span>}
            {a.ws.rating&&<span>⭐ {a.ws.rating}/10</span>}
          </div>
        </div>
        <div style={{textAlign:"center",padding:"8px 14px",borderRadius:10,background:a.balance>0?T.err+"12":T.ok+"12",border:"1px solid "+(a.balance>0?T.err+"30":T.ok+"30"),minWidth:180}}>
          <div style={{fontSize:FS-3,color:T.textSec}}>الرصيد الحالي</div>
          <div style={{fontSize:FS+2,fontWeight:800,color:a.balance>0?T.err:T.ok}}>{fmt(r2(a.balance))} ج</div>
          {a.expectedExtra>0&&<div style={{marginTop:6,paddingTop:6,borderTop:"1px dashed "+T.err+"40"}}>
            <div style={{fontSize:FS-3,color:T.err,fontWeight:700}}>+ متوقع: <span style={{fontSize:FS,fontWeight:800}}>{fmt(r2(a.expectedExtra))} ج</span></div>
            <div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>الإجمالي: {fmt(r2(a.expectedBalance))} ج</div>
          </div>}
        </div>
      </div>
      
      {/* Garment breakdown table */}
      <div style={{fontSize:FS+1,fontWeight:800,color:T.text,marginBottom:6}}>🧵 القطع حسب النوع</div>
      {a.garmentList.length===0?<div style={{padding:20,textAlign:"center",color:T.textMut,background:T.bg,borderRadius:8,marginBottom:12}}>لا توجد حركات في هذه الفترة</div>:<div style={{overflowX:"auto",marginBottom:14}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:FS-1}}>
          <thead><tr>
            <th style={TH}>نوع القطعة</th>
            <th style={{...TH,textAlign:"center"}}>تسليم</th>
            <th style={{...TH,textAlign:"center"}}>مُستلَم</th>
            <th style={{...TH,textAlign:"center"}}>متبقي</th>
            <th style={{...TH,textAlign:"center"}}>متوسط السعر</th>
            <th style={{...TH,textAlign:"center"}}>القيمة</th>
          </tr></thead>
          <tbody>
            {a.garmentList.map((g,i)=><tr key={i} style={{borderBottom:"1px solid "+T.brd,background:i%2===1?T.bg:"transparent"}}>
              <td style={{...TD,fontWeight:700}}>{g.garmentType}</td>
              <td style={{...TD,textAlign:"center"}}>{fmt(g.delivered)}</td>
              <td style={{...TD,textAlign:"center",color:T.ok,fontWeight:700}}>{fmt(g.received)}</td>
              <td style={{...TD,textAlign:"center",color:g.balance>0?T.warn:T.textMut,fontWeight:700}}>{fmt(g.balance)}</td>
              <td style={{...TD,textAlign:"center"}}>{fmt(g.avgPrice)}</td>
              <td style={{...TD,textAlign:"center",color:"#8B5CF6",fontWeight:800}}>{fmt(g.totalValue)}</td>
            </tr>)}
            <tr style={{background:"#8B5CF612",fontWeight:800,borderTop:"2px solid #8B5CF640"}}>
              <td style={{...TD,fontWeight:800}}>الإجمالي</td>
              <td style={{...TD,textAlign:"center"}}>{fmt(a.totalDelivered)}</td>
              <td style={{...TD,textAlign:"center",color:T.ok}}>{fmt(a.totalReceived)}</td>
              <td style={{...TD,textAlign:"center",color:T.warn}}>{fmt(a.qtyBalance)}</td>
              <td style={TD}></td>
              <td style={{...TD,textAlign:"center",color:"#8B5CF6",fontSize:FS+1}}>{fmt(r2(a.totalValue))}</td>
            </tr>
          </tbody>
        </table>
      </div>}
      
      {/* Timeline of movements */}
      {a.timeline.length>0&&<><div style={{fontSize:FS+1,fontWeight:800,color:T.text,marginBottom:6}}>📅 Timeline الحركات</div>
      <div style={{overflowX:"auto",maxHeight:300,overflowY:"auto",border:"1px solid "+T.brd,borderRadius:8,marginBottom:14}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:FS-1}}>
          <thead style={{position:"sticky",top:0,background:T.cardSolid,zIndex:1}}><tr>
            <th style={{...TH,whiteSpace:"nowrap"}}>التاريخ</th>
            <th style={{...TH,textAlign:"center"}}>النوع</th>
            <th style={TH}>الموديل</th>
            <th style={TH}>القطعة</th>
            <th style={{...TH,textAlign:"center"}}>الكمية</th>
            <th style={{...TH,textAlign:"center"}}>السعر</th>
          </tr></thead>
          <tbody>
            {a.timeline.map((t,i)=><tr key={i} style={{borderBottom:"1px solid "+T.brd,background:i%2===1?T.bg:"transparent"}}>
              <td style={{...TD,fontSize:FS-2,color:T.textMut,whiteSpace:"nowrap"}}>{t.date}</td>
              <td style={{...TD,textAlign:"center"}}>
                <span style={{padding:"2px 8px",borderRadius:6,fontSize:FS-3,fontWeight:700,background:(t.type==="delivery"?"#3B82F6":T.ok)+"15",color:t.type==="delivery"?"#3B82F6":T.ok}}>
                  {t.type==="delivery"?"↗ تسليم":"↙ استلام"}
                </span>
              </td>
              <td style={{...TD,fontWeight:700}}>{t.modelNo}</td>
              <td style={{...TD}}>{t.garmentType}</td>
              <td style={{...TD,textAlign:"center",fontWeight:700,color:t.type==="delivery"?"#3B82F6":T.ok}}>{(t.type==="delivery"?"→ ":"← ")+fmt(t.qty)}</td>
              <td style={{...TD,textAlign:"center"}}>{fmt(t.price)}</td>
            </tr>)}
          </tbody>
        </table>
      </div></>}
      
      {/* Payments */}
      {a.paymentsList.length>0&&<><div style={{fontSize:FS+1,fontWeight:800,color:T.text,marginBottom:6}}>💵 الدفعات والمشتريات</div>
      <div style={{overflowX:"auto",marginBottom:14}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:FS-1}}>
          <thead><tr>
            <th style={TH}>التاريخ</th>
            <th style={{...TH,textAlign:"center"}}>النوع</th>
            <th style={{...TH,textAlign:"center"}}>المبلغ</th>
            <th style={TH}>ملاحظات</th>
          </tr></thead>
          <tbody>
            {a.paymentsList.map((p,i)=><tr key={i} style={{borderBottom:"1px solid "+T.brd,background:i%2===1?T.bg:"transparent"}}>
              <td style={{...TD,whiteSpace:"nowrap"}}>{p.date}</td>
              <td style={{...TD,textAlign:"center"}}>
                <span style={{padding:"2px 8px",borderRadius:6,fontSize:FS-3,fontWeight:700,background:(p.type==="payment"?T.ok:T.warn)+"15",color:p.type==="payment"?T.ok:T.warn}}>
                  {p.type==="payment"?"💵 دفعة":"🛒 مشتريات"}
                </span>
              </td>
              <td style={{...TD,textAlign:"center",fontWeight:800,color:p.type==="payment"?T.ok:T.warn}}>{fmt(Number(p.amount))}</td>
              <td style={{...TD,color:T.textSec}}>{p.notes||"—"}</td>
            </tr>)}
            <tr style={{background:T.ok+"08",fontWeight:800,borderTop:"2px solid "+T.ok+"40"}}>
              <td style={{...TD,fontWeight:800}} colSpan={2}>الإجمالي المدفوع</td>
              <td style={{...TD,textAlign:"center",color:T.ok,fontSize:FS+1}}>{fmt(r2(a.totalPaid))}</td>
              <td style={TD}></td>
            </tr>
          </tbody>
        </table>
      </div></>}
      
      {/* Reconciliation summary */}
      <div style={{fontSize:FS+1,fontWeight:800,color:T.text,marginBottom:6}}>🧮 كشف الحساب</div>
      <div style={{padding:14,background:T.bg,borderRadius:10,border:"1px solid "+T.brd}}>
        <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid "+T.brd}}>
          <span style={{color:T.textSec}}>قيمة استلام المصنع</span>
          <span style={{fontWeight:700,color:T.ok}}>{fmt(r2(a.totalValue))} ج.م</span>
        </div>
        {a.totalPurchase>0&&<div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid "+T.brd}}>
          <span style={{color:T.textSec}}>مشتريات الورشة</span>
          <span style={{fontWeight:700,color:T.warn}}>{fmt(r2(a.totalPurchase))} ج.م</span>
        </div>}
        <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"2px solid "+T.brd,fontWeight:800}}>
          <span>المستحق الإجمالي</span>
          <span style={{color:T.accent,fontSize:FS+1}}>{fmt(r2(a.totalDue))} ج.م</span>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid "+T.brd}}>
          <span style={{color:T.textSec}}>إجمالي المدفوع</span>
          <span style={{fontWeight:700}}>{"("+fmt(r2(a.totalPaid))+") ج.م"}</span>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",padding:"10px 0",background:a.balance>0?T.err+"08":T.ok+"08",marginTop:6,borderRadius:8,paddingInline:10}}>
          <span style={{fontWeight:800}}>🟢 الرصيد المستحق حالياً</span>
          <span style={{fontWeight:800,fontSize:FS+2,color:a.balance>0?T.err:T.ok}}>{fmt(r2(a.balance))} ج.م</span>
        </div>
        {a.expectedExtra>0&&<>
          <div style={{marginTop:10,paddingTop:10,borderTop:"2px dashed "+T.err+"40"}}>
            <div style={{fontSize:FS-2,color:T.err,fontWeight:700,marginBottom:6,textAlign:"center"}}>━━━ لو الورشة سلّمت الباقي ━━━</div>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",padding:"6px 10px"}}>
            <span style={{color:T.textSec,fontSize:FS-1}}>🔴 متوقع إضافي ({fmt(a.qtyBalance)} قطعة)</span>
            <span style={{fontWeight:700,color:T.err}}>+ {fmt(r2(a.expectedExtra))} ج.م</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",padding:"10px",background:"#8B5CF608",marginTop:4,borderRadius:8,border:"1px solid #8B5CF625"}}>
            <span style={{fontWeight:800,color:"#8B5CF6"}}>🟣 إجمالي متوقع</span>
            <span style={{fontWeight:800,fontSize:FS+2,color:"#8B5CF6"}}>{fmt(r2(a.expectedBalance))} ج.م</span>
          </div>
        </>}
        {a.qtyBalance>0&&<div style={{display:"flex",justifyContent:"space-between",padding:"8px 10px",background:T.warn+"08",marginTop:6,borderRadius:8}}>
          <span style={{fontWeight:700,color:T.warn}}>⚠️ عدد القطع عند الورشة</span>
          <span style={{fontWeight:800,color:T.warn}}>{fmt(a.qtyBalance)} قطعة</span>
        </div>}
      </div>
    </Card>)}
  </div>;
}

/* ══ FABRIC CONSUMPTION REPORT ══ */


export function FabricReport({data,isMob,season}){
  const today=new Date().toLocaleDateString("ar-EG",{year:"numeric",month:"long",day:"numeric"});
  const fabMap={};
  data.orders.forEach(o=>{FKEYS.forEach(k=>{if(!gf(o,k))return;const name=gf(o,k,"Label")?.split(" - ")[0]||"";const unit=gf(o,k,"Unit")||"";const cons=gcons(o,k);const layers=slay(gc(o,k));const totalCons=r2(cons*layers);const price=gf(o,k,"Price")||0;const cost=r2(totalCons*price);
    const key=name+"|"+unit;if(!fabMap[key])fabMap[key]={name,unit,totalCons:0,totalCost:0,orders:0,price};fabMap[key].totalCons+=totalCons;fabMap[key].totalCost+=cost;fabMap[key].orders++})});
  const fabList=Object.values(fabMap).sort((a,b)=>b.totalCost-a.totalCost);
  const totalFabCost=fabList.reduce((s,f)=>s+f.totalCost,0);
  const printFab=()=>{const el=document.getElementById("fab-rep");if(!el)return;printPage("تقرير الخامات المستهلكة — "+season,el.innerHTML)};
  const exportFabXls=()=>{const rows=[["الخامة","الوحدة","اجمالي الاستهلاك","السعر","اجمالي التكلفة","عدد الموديلات"]];fabList.forEach(f=>{rows.push([f.name,f.unit,f.totalCons,f.price,r2(f.totalCost),f.orders])});rows.push([]);rows.push(["اجمالي","","","",r2(totalFabCost),""]);exportExcel(rows,"تقرير_الخامات_"+season)};
  return<div>
    <div style={{display:"flex",justifyContent:"flex-end",gap:6,marginBottom:10}}>
      <Btn onClick={exportFabXls} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30"}}>📊 Excel</Btn>
      <Btn onClick={printFab} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨</Btn>
    </div>
    <div id="fab-rep">
      <h1 style={{fontSize:isMob?18:24,fontWeight:800,margin:"0 0 4px",color:T.accent}}>تقرير الخامات المستهلكة</h1>
      <div style={{fontSize:FS-1,color:T.textSec,marginBottom:12}}>{fabList.length+" خامة | الموسم "+season+" | "+today}</div>
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        <div style={{padding:"8px 14px",borderRadius:8,border:"1px solid "+T.brd,background:T.cardSolid,textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>عدد الخامات</div><b style={{fontSize:18,fontWeight:800,color:T.accent}}>{fabList.length}</b></div>
        <div style={{padding:"8px 14px",borderRadius:8,border:"1px solid "+T.brd,background:T.cardSolid,textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>اجمالي التكلفة</div><b style={{fontSize:18,fontWeight:800,color:T.err}}>{fmt(r2(totalFabCost))+" ج.م"}</b></div>
      </div>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}>
        <thead><tr>{["#","الخامة","الوحدة","اجمالي الاستهلاك","سعر الوحدة","اجمالي التكلفة","عدد الموديلات","% من الاجمالي"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
        <tbody>{fabList.map((f,i)=><tr key={i}><td style={TD}>{i+1}</td><td style={{...TDB,color:T.accent}}>{f.name}</td><td style={TD}>{f.unit}</td><td style={TDB}>{f.totalCons}</td><td style={TD}>{f.price+" ج.م"}</td><td style={{...TDB,color:T.err}}>{fmt(r2(f.totalCost))+" ج.م"}</td><td style={TDB}>{f.orders}</td><td style={TDB}>{totalFabCost?Math.round(f.totalCost/totalFabCost*100)+"%":"0%"}</td></tr>)}
          {fabList.length>0&&<tr style={{background:T.accent+"08"}}><td colSpan={5} style={{...TD,fontWeight:800}}>الاجمالي</td><td style={{...TDB,fontWeight:800,color:T.err}}>{fmt(r2(totalFabCost))+" ج.م"}</td><td colSpan={2} style={TD}></td></tr>}
        </tbody>
      </table></div>
    </div>
  </div>
}

/* ══ WORKSHOP PRODUCTIVITY REPORT ══ */


export function WsPerfReport({data,isMob,season}){
  const today=new Date().toLocaleDateString("ar-EG",{year:"numeric",month:"long",day:"numeric"});
  const wsMap={};
  data.orders.forEach(o=>{(o.workshopDeliveries||[]).forEach(wd=>{
    if(!wsMap[wd.wsName])wsMap[wd.wsName]={name:wd.wsName,totalDel:0,totalRcv:0,orders:new Set(),avgDays:[],pieces:{}};
    wsMap[wd.wsName].totalDel+=(Number(wd.qty)||0);wsMap[wd.wsName].orders.add(o.modelNo);
    if(wd.garmentType){if(!wsMap[wd.wsName].pieces[wd.garmentType])wsMap[wd.wsName].pieces[wd.garmentType]=0;wsMap[wd.wsName].pieces[wd.garmentType]+=(Number(wd.qty)||0)}
    (wd.receives||[]).forEach(r=>{wsMap[wd.wsName].totalRcv+=(Number(r.qty)||0);
      const d1=new Date(wd.date),d2=new Date(r.date);const diff=Math.max(0,Math.floor((d2-d1)/(1000*60*60*24)));wsMap[wd.wsName].avgDays.push(diff)})
  })});
  const wsList=Object.values(wsMap).map(w=>({...w,orders:w.orders.size,avg:w.avgDays.length?Math.round(w.avgDays.reduce((a,b)=>a+b,0)/w.avgDays.length):0,completion:w.totalDel?Math.round(w.totalRcv/w.totalDel*100):0})).sort((a,b)=>b.totalRcv-a.totalRcv);
  const printWsPerf=()=>{const el=document.getElementById("ws-perf");if(!el)return;printPage("تقرير انتاجية الورش — "+season,el.innerHTML)};
  const exportWsPerfXls=()=>{const rows=[["الورشة","عدد الموديلات","تسليم ورشة","استلام مصنع","نسبة الانجاز","متوسط أيام التسليم"]];wsList.forEach(w=>{rows.push([w.name,w.orders,w.totalDel,w.totalRcv,w.completion+"%",w.avg+" يوم"])});exportExcel(rows,"انتاجية_الورش_"+season)};
  return<div>
    <div style={{display:"flex",justifyContent:"flex-end",gap:6,marginBottom:10}}>
      <Btn onClick={exportWsPerfXls} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30"}}>📊 Excel</Btn>
      <Btn onClick={printWsPerf} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨</Btn>
    </div>
    <div id="ws-perf">
      <h1 style={{fontSize:isMob?18:24,fontWeight:800,margin:"0 0 4px",color:T.accent}}>تقرير انتاجية الورش</h1>
      <div style={{fontSize:FS-1,color:T.textSec,marginBottom:12}}>{wsList.length+" ورشة | الموسم "+season+" | "+today}</div>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}>
        <thead><tr>{["#","الورشة","الموديلات","تسليم ورشة","استلام مصنع","الانجاز","متوسط الأيام","القطع"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
        <tbody>{wsList.map((w,i)=><tr key={i}><td style={TD}>{i+1}</td><td style={{...TDB,color:T.accent}}>{w.name}</td><td style={TDB}>{w.orders}</td><td style={{...TDB,color:"#8B5CF6"}}>{w.totalDel}</td><td style={{...TDB,color:T.ok}}>{w.totalRcv}</td>
          <td style={TDB}><span style={{padding:"2px 8px",borderRadius:6,background:w.completion>=80?T.ok+"12":w.completion>=50?T.warn+"12":T.err+"12",color:w.completion>=80?T.ok:w.completion>=50?T.warn:T.err,fontWeight:700}}>{w.completion+"%"}</span></td>
          <td style={TDB}><span style={{padding:"2px 8px",borderRadius:6,background:w.avg<=7?T.ok+"12":w.avg<=14?T.warn+"12":T.err+"12",color:w.avg<=7?T.ok:w.avg<=14?T.warn:T.err,fontWeight:700}}>{w.avg+" يوم"}</span></td>
          <td style={TD}><div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{Object.entries(w.pieces).map(([p,q])=><span key={p} style={{fontSize:FS-3,padding:"1px 5px",borderRadius:4,background:T.purple+"10",color:T.purple,fontWeight:600}}>{p+": "+q}</span>)}</div></td>
        </tr>)}
        </tbody>
      </table></div>
      {wsList.length>0&&<div style={{marginTop:14}}><ResponsiveContainer width="100%" height={220}>
        <BarChart data={wsList} margin={{top:10,right:10,bottom:5}}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false}/><XAxis dataKey="name" tick={{fontSize:11}} interval={0}/><YAxis tick={{fontSize:11}}/><Tooltip contentStyle={{borderRadius:8,fontSize:12}}/>
          <Bar dataKey="totalDel" name="تسليم ورشة" fill="#8B5CF6" barSize={isMob?14:20} radius={[4,4,0,0]}/>
          <Bar dataKey="totalRcv" name="استلام مصنع" fill="#10B981" barSize={isMob?14:20} radius={[4,4,0,0]}/>
          <Legend wrapperStyle={{fontSize:11}}/>
        </BarChart>
      </ResponsiveContainer></div>}
    </div>
  </div>
}

/* ══ DELIVERY RATE REPORT ══ */


export function DeliveryReport({data,isMob,season}){
  const today=new Date().toLocaleDateString("ar-EG",{year:"numeric",month:"long",day:"numeric"});
  const dayMap={};
  data.orders.forEach(o=>{(o.deliveries||[]).forEach(d=>{if(!dayMap[d.date])dayMap[d.date]={date:d.date,qty:0,orders:0};dayMap[d.date].qty+=(Number(d.qty)||0);dayMap[d.date].orders++});
    (o.workshopDeliveries||[]).forEach(wd=>{(wd.receives||[]).forEach(r=>{const k=r.date;if(!dayMap[k])dayMap[k]={date:k,qty:0,orders:0}})})});
  /* Workshop deliveries per day */
  const wsDay={};data.orders.forEach(o=>{(o.workshopDeliveries||[]).forEach(wd=>{if(!wsDay[wd.date])wsDay[wd.date]={date:wd.date,qty:0};wsDay[wd.date].qty+=(Number(wd.qty)||0)})});
  /* Cumulative stock delivery */
  const stockDays=Object.values(dayMap).filter(d=>d.qty>0).sort((a,b)=>(a.date||"").localeCompare(b.date||""));
  let cum=0;const cumData=stockDays.map(d=>{cum+=d.qty;return{date:d.date,qty:d.qty,cumulative:cum}});
  const totalCut=data.orders.reduce((s,o)=>s+calcOrder(o).cutQty,0);const totalDel=data.orders.reduce((s,o)=>s+(o.deliveredQty||0),0);
  const printDel=()=>{const el=document.getElementById("del-rep");if(!el)return;printPage("تقرير معدل التسليم — "+season,el.innerHTML)};
  return<div>
    <div style={{display:"flex",justifyContent:"flex-end",gap:6,marginBottom:10}}>
      <Btn onClick={printDel} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨</Btn>
    </div>
    <div id="del-rep">
      <h1 style={{fontSize:isMob?18:24,fontWeight:800,margin:"0 0 4px",color:T.accent}}>تقرير معدل التسليم</h1>
      <div style={{fontSize:FS-1,color:T.textSec,marginBottom:12}}>{"الموسم "+season+" | "+today}</div>
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        {[["كمية القص",fmt(totalCut),T.accent],["تسليم مخزن",fmt(totalDel),T.ok],["الرصيد",fmt(totalCut-totalDel),T.warn],["نسبة التسليم",(totalCut?Math.round(totalDel/totalCut*100):0)+"%",totalDel>=totalCut?T.ok:T.err]].map(([l,v,c],i)=>
          <div key={i} style={{padding:"8px 14px",borderRadius:8,border:"1px solid "+T.brd,background:T.cardSolid,textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>{l}</div><b style={{fontSize:18,fontWeight:800,color:c}}>{v}</b></div>)}
      </div>
      {cumData.length>0&&<Card title="التسليم التراكمي" style={{marginBottom:14}}><ResponsiveContainer width="100%" height={220}>
        <BarChart data={cumData} margin={{top:10,right:10,bottom:5}}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false}/><XAxis dataKey="date" tick={{fontSize:10}} interval={0} angle={isMob?-45:0} textAnchor={isMob?"end":"middle"} height={isMob?50:30}/><YAxis tick={{fontSize:11}}/>
          <Tooltip contentStyle={{borderRadius:8,fontSize:12}}/>
          <Bar dataKey="qty" name="تسليم يومي" fill="#10B981" barSize={isMob?14:24} radius={[4,4,0,0]}/>
        </BarChart>
      </ResponsiveContainer></Card>}
      {stockDays.length>0&&<Card title="سجل التسليمات"><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}>
        <thead><tr>{["#","التاريخ","الكمية","تراكمي","النسبة من القص"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
        <tbody>{cumData.map((d,i)=><tr key={i}><td style={TD}>{i+1}</td><td style={TD}>{d.date}</td><td style={{...TDB,color:T.ok}}>{d.qty}</td><td style={TDB}>{d.cumulative}</td><td style={TDB}>{totalCut?Math.round(d.cumulative/totalCut*100)+"%":"0%"}</td></tr>)}</tbody>
      </table></div></Card>}
    </div>
  </div>
}

/* ══ SEASON SUMMARY ══ */


export function SeasonSummary({data,isMob,season,statusCards}){
  const today=new Date().toLocaleDateString("ar-EG",{year:"numeric",month:"long",day:"numeric"});
  const totalCut=data.orders.reduce((s,o)=>s+calcOrder(o).cutQty,0);const totalDel=data.orders.reduce((s,o)=>s+(o.deliveredQty||0),0);const totalCost=data.orders.reduce((s,o)=>s+calcOrder(o).costAll,0);
  const sc={};data.orders.forEach(o=>{sc[o.status]=(sc[o.status]||0)+1});
  const wsMap={};data.orders.forEach(o=>{(o.workshopDeliveries||[]).forEach(wd=>{if(!wsMap[wd.wsName])wsMap[wd.wsName]={del:0,rcv:0};wsMap[wd.wsName].del+=(Number(wd.qty)||0);(wd.receives||[]).forEach(r=>{wsMap[wd.wsName].rcv+=(Number(r.qty)||0)})})});
  const printSum=()=>{const el=document.getElementById("sum-rep");if(!el)return;printPage("ملخص الموسم — "+season,el.innerHTML)};
  const exportSumXls=()=>{const rows=[["ملخص الموسم - "+season,""],["",""],["البيان","القيمة"],["عدد الموديلات",data.orders.length],["اجمالي القص",totalCut],["تسليم مخزن جاهز",totalDel],["الرصيد",totalCut-totalDel],["نسبة الانجاز",(totalCut?Math.round(totalDel/totalCut*100):0)+"%"],["اجمالي التكاليف",r2(totalCost)],["متوسط تكلفة القطعة",totalCut?r2(totalCost/totalCut):0],["",""],["حالات الأوردرات",""]];Object.entries(sc).forEach(([k,v])=>{rows.push([k,v])});rows.push(["",""],["أداء الورش",""],["الورشة","تسليم","استلام"]);Object.entries(wsMap).forEach(([n,v])=>{rows.push([n,v.del,v.rcv])});exportExcel(rows,"ملخص_الموسم_"+season)};
  return<div>
    <div style={{display:"flex",justifyContent:"flex-end",gap:6,marginBottom:10}}>
      <Btn onClick={exportSumXls} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30"}}>📊 Excel</Btn>
      <Btn onClick={printSum} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨</Btn>
    </div>
    <div id="sum-rep">
      <h1 style={{fontSize:isMob?18:24,fontWeight:800,margin:"0 0 4px",color:T.accent}}>ملخص الموسم</h1>
      <div style={{fontSize:FS-1,color:T.textSec,marginBottom:12}}>{season+" | "+data.orders.length+" موديل | "+today}</div>
      <div style={{display:"grid",gridTemplateColumns:isMob?"repeat(2,1fr)":"repeat(4,1fr)",gap:10,marginBottom:14}}>
        {[[data.orders.length,"الموديلات",T.accent],[fmt(totalCut),"كمية القص","#8B5CF6"],[fmt(totalDel),"مخزن جاهز",T.ok],[fmt(totalCut-totalDel),"الرصيد",T.warn],[(totalCut?Math.round(totalDel/totalCut*100):0)+"%","الانجاز",T.ok],[fmt(r2(totalCost))+" ج","اجمالي التكاليف",T.err],[totalCut?r2(totalCost/totalCut)+" ج":"0","متوسط/قطعة","#8B5CF6"],[Object.keys(wsMap).length,"الورش الفعالة",T.purple]].map(([v,l,c],i)=>
          <div key={i} style={{padding:"10px 14px",borderRadius:8,border:"1px solid "+T.brd,background:T.cardSolid,textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>{l}</div><b style={{fontSize:18,fontWeight:800,color:c}}>{v}</b></div>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:14}}>
        <Card title="توزيع الحالات">
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{Object.entries(sc).map(([k,v])=>{const col=getStatusColor(k,statusCards);return<span key={k} style={{padding:"4px 12px",borderRadius:8,background:col+"12",color:col,fontWeight:700,fontSize:FS}}>{k+": "+v}</span>})}</div>
        </Card>
        <Card title="أداء الورش">
          <div style={{display:"flex",flexDirection:"column",gap:6}}>{Object.entries(wsMap).sort((a,b)=>b[1].rcv-a[1].rcv).map(([n,v])=>{const pct=v.del?Math.round(v.rcv/v.del*100):0;return<div key={n} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",borderRadius:8,background:T.bg}}>
            <span style={{fontWeight:700,fontSize:FS}}>{n}</span>
            <div style={{display:"flex",gap:6,fontSize:FS-2}}><span style={{color:"#8B5CF6"}}>{"↗"+v.del}</span><span style={{color:T.ok}}>{"↙"+v.rcv}</span><span style={{padding:"1px 6px",borderRadius:4,background:pct>=80?T.ok+"12":T.warn+"12",color:pct>=80?T.ok:T.warn,fontWeight:700}}>{pct+"%"}</span></div>
          </div>})}</div>
        </Card>
      </div>
    </div>
  </div>
}



export function OrderAgeReport({data,isMob,season,statusCards}){
  const orders=data.orders||[];const now=new Date();
  const rows=orders.filter(o=>o.status!=="تم التسليم لمخزن الجاهز").map(o=>{
    const startDate=new Date(o.date||o.createdAt||now);const days=Math.max(0,Math.floor((now-startDate)/(1000*60*60*24)));
    let lastMove=o.date||"";(o.workshopDeliveries||[]).forEach(wd=>{if(wd.date>lastMove)lastMove=wd.date;(wd.receives||[]).forEach(r=>{if(r.date>lastMove)lastMove=r.date})});
    const stale=Math.max(0,Math.floor((now-new Date(lastMove||o.date))/(1000*60*60*24)));
    return{modelNo:o.modelNo,modelDesc:o.modelDesc,status:o.status,startDate:o.date,days,lastMove,stale,cutQty:calcOrder(o).cutQty}}).sort((a,b)=>b.days-a.days);
  const avgAge=rows.length>0?Math.round(rows.reduce((s,r)=>s+r.days,0)/rows.length):0;
  const printRep=()=>{const el=document.getElementById("orderage-rep");if(el)printPage("تقرير عمر الأوردر — "+season,el.innerHTML)};
  return<Card id="orderage-rep" title={"⏱️ عمر الأوردر — "+rows.length+" أوردر مفتوح (متوسط: "+avgAge+" يوم)"} extra={<Btn small onClick={printRep} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨</Btn>}>
    {rows.length>0?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>
      {["الموديل","الوصف","كمية القص","تاريخ البدء","عمر (يوم)","آخر حركة","ركود (يوم)","الحالة"].map(h=><th key={h} style={TH}>{h}</th>)}
    </tr></thead><tbody>{rows.map(r=><tr key={r.modelNo} style={{borderBottom:"1px solid "+T.brd,background:r.stale>14?T.err+"06":""}}>
      <td style={TDB}>{r.modelNo}</td><td style={TD}>{r.modelDesc}</td><td style={TDB}>{r.cutQty}</td>
      <td style={TD}>{r.startDate}</td><td style={{...TDB,color:r.days>30?T.err:r.days>14?T.warn:T.ok}}>{r.days}</td>
      <td style={TD}>{r.lastMove}</td><td style={{...TDB,color:r.stale>14?T.err:r.stale>7?T.warn:T.ok,fontWeight:800}}>{r.stale}</td>
      <td style={TD}><Badge t={r.status} cards={statusCards}/></td>
    </tr>)}</tbody></table></div>:<div style={{textAlign:"center",padding:30,color:T.textMut}}>كل الأوردرات مكتملة</div>}
  </Card>
}

/* ══ CAPACITY REPORT ══ */


export function CapacityReport({data,isMob,season}){
  const orders=data.orders||[];
  const weekMap={};
  orders.forEach(o=>{const d=o.date;if(!d)return;const wk=d.slice(0,7);/* month */if(!weekMap[wk])weekMap[wk]={cut:0,wsOut:0,wsIn:0,stock:0};weekMap[wk].cut+=calcOrder(o).cutQty;weekMap[wk].stock+=(o.deliveredQty||0);
    (o.workshopDeliveries||[]).forEach(wd=>{const m=(wd.date||d).slice(0,7);if(!weekMap[m])weekMap[m]={cut:0,wsOut:0,wsIn:0,stock:0};weekMap[m].wsOut+=(Number(wd.qty)||0);
      (wd.receives||[]).forEach(r=>{const rm=(r.date||wd.date||d).slice(0,7);if(!weekMap[rm])weekMap[rm]={cut:0,wsOut:0,wsIn:0,stock:0};weekMap[rm].wsIn+=(Number(r.qty)||0)})})});
  const months=Object.keys(weekMap).sort();
  const printRep=()=>{const el=document.getElementById("capacity-rep");if(el)printPage("تقرير الطاقة الإنتاجية — "+season,el.innerHTML)};
  return<Card id="capacity-rep" title="📊 الطاقة الإنتاجية — شهري" extra={<Btn small onClick={printRep} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨</Btn>}>
    {months.length>0?<div>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>
        {["الشهر","قص","تسليم ورش","استلام ورش","تسليم مخزن"].map(h=><th key={h} style={TH}>{h}</th>)}
      </tr></thead><tbody>{months.map((m,i)=>{const d=weekMap[m];const prev=i>0?weekMap[months[i-1]]:null;
        const trend=(cur,prv)=>!prv?"":(cur>prv?"▲":"▼");
        return<tr key={m} style={{borderBottom:"1px solid "+T.brd}}>
          <td style={{...TDB,color:T.accent}}>{m}</td>
          <td style={TDB}>{fmt(d.cut)} <span style={{fontSize:FS-3,color:trend(d.cut,prev?.cut)==="▲"?T.ok:T.err}}>{trend(d.cut,prev?.cut)}</span></td>
          <td style={TDB}>{fmt(d.wsOut)}</td><td style={{...TDB,color:T.ok}}>{fmt(d.wsIn)}</td>
          <td style={{...TDB,color:T.accent}}>{fmt(d.stock)}</td>
        </tr>})}</tbody></table></div>
    </div>:<div style={{textAlign:"center",padding:30,color:T.textMut}}>لا توجد بيانات</div>}
  </Card>
}

/* ══ WS COST PER PIECE REPORT ══ */


export function WsCostReport({data,isMob,season}){
  const orders=data.orders||[];const wsMap={};
  orders.forEach(o=>{(o.workshopDeliveries||[]).forEach(wd=>{
    if(!wsMap[wd.wsName])wsMap[wd.wsName]={name:wd.wsName,totalQty:0,totalAmt:0};
    (wd.receives||[]).forEach(r=>{wsMap[wd.wsName].totalQty+=(Number(r.qty)||0);wsMap[wd.wsName].totalAmt+=r2((Number(r.qty)||0)*(Number(r.price)||0))})})});
  const rows=Object.values(wsMap).filter(w=>w.totalQty>0).map(w=>({...w,avg:r2(w.totalAmt/w.totalQty)})).sort((a,b)=>a.avg-b.avg);
  const globalAvg=rows.length>0?r2(rows.reduce((s,r)=>s+r.totalAmt,0)/rows.reduce((s,r)=>s+r.totalQty,0)):0;
  const printRep=()=>{const el=document.getElementById("wscost-rep");if(el)printPage("تكلفة القطعة بالورشة — "+season,el.innerHTML)};
  return<Card id="wscost-rep" title={"💲 تكلفة القطعة بالورشة — متوسط عام: "+fmt(globalAvg)+" ج.م"} extra={<Btn small onClick={printRep} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨</Btn>}>
    {rows.length>0?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>
      {["الورشة","إجمالي القطع","إجمالي المبالغ","متوسط سعر القطعة","مقارنة بالمتوسط"].map(h=><th key={h} style={TH}>{h}</th>)}
    </tr></thead><tbody>{rows.map(r=>{const diff=r2(r.avg-globalAvg);return<tr key={r.name} style={{borderBottom:"1px solid "+T.brd}}>
      <td style={{...TD,fontWeight:700}}>{r.name}</td><td style={TDB}>{fmt(r.totalQty)}</td>
      <td style={TDB}>{fmt(r.totalAmt)}</td><td style={{...TDB,fontSize:FS+1,fontWeight:800,color:T.accent}}>{fmt(r.avg)+" ج.م"}</td>
      <td style={{...TDB,color:diff>0?T.err:T.ok,fontWeight:700}}>{(diff>0?"+":"")+fmt(diff)}</td>
    </tr>})}</tbody></table></div>:<div style={{textAlign:"center",padding:30,color:T.textMut}}>لا توجد بيانات</div>}
  </Card>
}

/* ══ WS STUCK REPORT ══ */


export function WsStuckReport({data,isMob,season}){
  const orders=data.orders||[];const now=new Date();const wsItems=[];
  orders.forEach(o=>{(o.workshopDeliveries||[]).forEach(wd=>{
    const sent=Number(wd.qty)||0;const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);const remaining=sent-rcvd;
    if(remaining<=0)return;const days=Math.max(0,Math.floor((now-new Date(wd.date))/(1000*60*60*24)));
    if(days>=7)wsItems.push({ws:wd.wsName,modelNo:o.modelNo,modelDesc:o.modelDesc,garment:wd.garmentType||"عام",sent,rcvd,remaining,date:wd.date,days})})});
  wsItems.sort((a,b)=>b.days-a.days);
  const totalStuck=wsItems.reduce((s,i)=>s+i.remaining,0);
  const printRep=()=>{const el=document.getElementById("wsstuck-rep");if(el)printPage("بضاعة معلقة عند الورش — "+season,el.innerHTML)};
  return<Card id="wsstuck-rep" title={"🚨 بضاعة معلقة عند الورش — "+wsItems.length+" حركة ("+fmt(totalStuck)+" قطعة)"} extra={<Btn small onClick={printRep} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨</Btn>}>
    {wsItems.length>0?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>
      {["الورشة","الموديل","القطعة","المرسل","استلام مصنع","المتبقي","تاريخ الإرسال","أيام"].map(h=><th key={h} style={TH}>{h}</th>)}
    </tr></thead><tbody>{wsItems.map((r,i)=><tr key={i} style={{borderBottom:"1px solid "+T.brd,background:r.days>14?T.err+"06":""}}>
      <td style={{...TD,fontWeight:700}}>{r.ws}</td><td style={TDB}>{r.modelNo}</td><td style={TD}>{r.garment}</td>
      <td style={TDB}>{r.sent}</td><td style={{...TDB,color:T.ok}}>{r.rcvd}</td>
      <td style={{...TDB,color:T.err,fontWeight:800}}>{r.remaining}</td><td style={TD}>{r.date}</td>
      <td style={{...TDB,color:r.days>14?T.err:T.warn,fontWeight:800}}>{r.days+" يوم"+(r.days>14?" 🔴":"")}</td>
    </tr>)}</tbody></table></div>:<div style={{textAlign:"center",padding:30,color:T.textMut}}>لا توجد بضاعة معلقة</div>}
  </Card>
}

/* ══ MODEL PROFIT REPORT ══ */


export function ModelProfitReport({data,isMob,season,statusCards}){
  const orders=data.orders||[];
  const rows=orders.map(o=>{const c=calcOrder(o);const sellPrice=Number(o.sellPrice)||0;const costPrice=Number(o.costPrice)||c.totalCost||0;
    const soldQty=(o.customerDeliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0)-(o.customerReturns||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);
    const revenue=r2(soldQty*sellPrice);const cost=r2(soldQty*costPrice);const profit=r2(revenue-cost);const margin=revenue>0?Math.round((profit/revenue)*100):0;
    return{modelNo:o.modelNo,modelDesc:o.modelDesc,sellPrice,costPrice,soldQty,revenue,cost,profit,margin,status:o.status}}).filter(r=>r.soldQty>0).sort((a,b)=>b.profit-a.profit);
  const totals={revenue:rows.reduce((s,r)=>s+r.revenue,0),cost:rows.reduce((s,r)=>s+r.cost,0),profit:rows.reduce((s,r)=>s+r.profit,0)};
  totals.margin=totals.revenue>0?Math.round((totals.profit/totals.revenue)*100):0;
  const printRep=()=>{const el=document.getElementById("modelprofit-rep");if(el)printPage("تقرير أرباح الموديل — "+season,el.innerHTML)};
  return<Card id="modelprofit-rep" title={"💎 أرباح الموديل — "+rows.length+" موديل | صافي ربح: "+fmt(r2(totals.profit))+" ج.م"} extra={<Btn small onClick={printRep} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨</Btn>}>
    {rows.length>0?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>
      {["الموديل","الوصف","سعر بيع","تكلفة","كمية مباعة","إيراد","تكلفة إجمالية","الربح","هامش %"].map(h=><th key={h} style={TH}>{h}</th>)}
    </tr></thead><tbody>{rows.map(r=><tr key={r.modelNo} style={{borderBottom:"1px solid "+T.brd}}>
      <td style={TDB}>{r.modelNo}</td><td style={TD}>{r.modelDesc}</td>
      <td style={TDB}>{fmt(r.sellPrice)}</td><td style={TDB}>{fmt(r.costPrice)}</td>
      <td style={TDB}>{fmt(r.soldQty)}</td><td style={{...TDB,color:T.ok}}>{fmt(r.revenue)}</td>
      <td style={{...TDB,color:T.err}}>{fmt(r.cost)}</td>
      <td style={{...TDB,color:r.profit>=0?T.ok:T.err,fontWeight:800,fontSize:FS+1}}>{fmt(r.profit)}</td>
      <td style={{...TDB,color:r.margin>=20?T.ok:r.margin>=10?T.warn:T.err}}>{r.margin+"%"}</td>
    </tr>)}
    <tr style={{background:T.accent+"06"}}><td colSpan={5} style={{...TD,fontWeight:800}}>الإجمالي</td>
      <td style={{...TDB,color:T.ok,fontWeight:800}}>{fmt(totals.revenue)}</td><td style={{...TDB,color:T.err,fontWeight:800}}>{fmt(totals.cost)}</td>
      <td style={{...TDB,color:totals.profit>=0?T.ok:T.err,fontWeight:900,fontSize:FS+2}}>{fmt(totals.profit)}</td>
      <td style={{...TDB,fontWeight:800}}>{totals.margin+"%"}</td>
    </tr></tbody></table></div>:<div style={{textAlign:"center",padding:30,color:T.textMut}}>لا توجد مبيعات</div>}
  </Card>
}

/* ══ TOP CUSTOMERS REPORT ══ */


export function TopCustomersReport({data,isMob,season}){
  const orders=data.orders||[];const customers=data.customers||[];
  const custMap={};
  orders.forEach(o=>{(o.customerDeliveries||[]).forEach(d=>{
    if(!custMap[d.custId])custMap[d.custId]={id:d.custId,sales:0,returns:0,revenue:0};
    custMap[d.custId].sales+=(Number(d.qty)||0);custMap[d.custId].revenue+=r2((Number(d.qty)||0)*(Number(o.sellPrice)||0))});
    (o.customerReturns||[]).forEach(r=>{if(!custMap[r.custId])custMap[r.custId]={id:r.custId,sales:0,returns:0,revenue:0};custMap[r.custId].returns+=(Number(r.qty)||0);custMap[r.custId].revenue-=r2((Number(r.qty)||0)*(Number(o.sellPrice)||0))})});
  const payments=(data.custPayments||[]);
  const rows=Object.values(custMap).map(c=>{const cust=customers.find(x=>x.id===c.id);const paid=payments.filter(p=>p.custId===c.id).reduce((s,p)=>s+(Number(p.amount)||0),0);
    const retPct=c.sales>0?Math.round((c.returns/c.sales)*100):0;
    return{...c,name:cust?.name||"غير معروف",phone:cust?.phone||"",paid,balance:r2(c.revenue-paid),retPct}}).sort((a,b)=>b.revenue-a.revenue).slice(0,10);
  const printRep=()=>{const el=document.getElementById("topcust-rep");if(el)printPage("أعلى 10 عملاء — "+season,el.innerHTML)};
  return<Card id="topcust-rep" title="🏆 أعلى 10 عملاء" extra={<Btn small onClick={printRep} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨</Btn>}>
    {rows.length>0?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>
      {["#","العميل","مبيعات (قطعة)","مرتجعات","% مرتجع","إيراد","مدفوع","رصيد"].map(h=><th key={h} style={TH}>{h}</th>)}
    </tr></thead><tbody>{rows.map((r,i)=><tr key={r.id} style={{borderBottom:"1px solid "+T.brd,background:i<3?T.accent+"04":""}}>
      <td style={{...TDB,fontSize:FS+1,fontWeight:800}}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":(i+1)}</td>
      <td style={{...TD,fontWeight:700}}>{r.name}</td><td style={TDB}>{fmt(r.sales)}</td>
      <td style={{...TDB,color:r.returns>0?T.err:T.textMut}}>{r.returns||"—"}</td>
      <td style={{...TDB,color:r.retPct>10?T.err:T.textMut}}>{r.retPct>0?r.retPct+"%":"—"}</td>
      <td style={{...TDB,color:T.ok,fontWeight:700}}>{fmt(r.revenue)}</td>
      <td style={TDB}>{fmt(r.paid)}</td>
      <td style={{...TDB,color:r.balance>0?T.err:T.ok,fontWeight:800}}>{fmt(r.balance)}</td>
    </tr>)}</tbody></table></div>:<div style={{textAlign:"center",padding:30,color:T.textMut}}>لا توجد مبيعات</div>}
  </Card>
}

/* ══ AGING REPORT ══ */


export function AgingReport({data,isMob,season}){
  const customers=data.customers||[];const orders=data.orders||[];const payments=data.custPayments||[];const now=new Date();
  const custMap={};
  orders.forEach(o=>{(o.customerDeliveries||[]).forEach(d=>{
    if(!custMap[d.custId])custMap[d.custId]={id:d.custId,totalDue:0,firstSale:d.date,lastSale:d.date};
    custMap[d.custId].totalDue+=r2((Number(d.qty)||0)*(Number(o.sellPrice)||0));
    if(d.date<custMap[d.custId].firstSale)custMap[d.custId].firstSale=d.date;
    if(d.date>custMap[d.custId].lastSale)custMap[d.custId].lastSale=d.date});
    (o.customerReturns||[]).forEach(r=>{if(custMap[r.custId])custMap[r.custId].totalDue-=r2((Number(r.qty)||0)*(Number(o.sellPrice)||0))})});
  const rows=Object.values(custMap).map(c=>{const cust=customers.find(x=>x.id===c.id);const paid=payments.filter(p=>p.custId===c.id).reduce((s,p)=>s+(Number(p.amount)||0),0);
    const balance=r2(c.totalDue-paid);if(balance<=0)return null;
    const days=Math.max(0,Math.floor((now-new Date(c.lastSale))/(1000*60*60*24)));
    const bucket=days<=30?"0-30 يوم":days<=60?"31-60 يوم":days<=90?"61-90 يوم":"90+ يوم";
    const bucketColor=days<=30?T.ok:days<=60?T.warn:days<=90?"#F97316":T.err;
    return{name:cust?.name||"غير معروف",phone:cust?.phone||"",balance,days,bucket,bucketColor,lastSale:c.lastSale}}).filter(Boolean).sort((a,b)=>b.days-a.days);
  const totalBalance=rows.reduce((s,r)=>s+r.balance,0);
  const printRep=()=>{const el=document.getElementById("aging-rep");if(el)printPage("تقرير التحصيل (Aging) — "+season,el.innerHTML)};
  return<Card id="aging-rep" title={"⏳ تقرير التحصيل (Aging) — "+rows.length+" عميل | إجمالي: "+fmt(r2(totalBalance))+" ج.م"} extra={<Btn small onClick={printRep} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨</Btn>}>
    {rows.length>0?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>
      {["العميل","التليفون","الرصيد المستحق","آخر بيع","أيام التأخر","الفئة"].map(h=><th key={h} style={TH}>{h}</th>)}
    </tr></thead><tbody>{rows.map(r=><tr key={r.name} style={{borderBottom:"1px solid "+T.brd}}>
      <td style={{...TD,fontWeight:700}}>{r.name}</td><td style={{...TD,direction:"ltr",fontSize:FS-2}}>{r.phone}</td>
      <td style={{...TDB,color:T.err,fontWeight:800,fontSize:FS+1}}>{fmt(r.balance)}</td>
      <td style={TD}>{r.lastSale}</td><td style={{...TDB,fontWeight:700}}>{r.days}</td>
      <td style={TDB}><span style={{padding:"3px 10px",borderRadius:6,fontSize:FS-2,fontWeight:700,background:r.bucketColor+"12",color:r.bucketColor}}>{r.bucket}</span></td>
    </tr>)}</tbody></table></div>:<div style={{textAlign:"center",padding:30,color:T.textMut}}>لا توجد أرصدة مستحقة</div>}
  </Card>
}

/* ══ MONTHLY EXPENSES REPORT ══ */


export function MonthlyExpensesReport({data,isMob}){
  const txns=data.treasury||[];const outTxns=txns.filter(t=>t.type==="out");
  const monthMap={};const catSet=new Set();
  outTxns.forEach(t=>{const m=(t.date||"").slice(0,7);if(!m)return;if(!monthMap[m])monthMap[m]={};const cat=t.category||"أخرى";catSet.add(cat);monthMap[m][cat]=(monthMap[m][cat]||0)+(Number(t.amount)||0)});
  const months=Object.keys(monthMap).sort();const cats=[...catSet].sort();
  const printRep=()=>{const el=document.getElementById("monthexp-rep");if(el)printPage("المصروفات الشهرية",el.innerHTML)};
  return<Card id="monthexp-rep" title={"📉 المصروفات الشهرية — "+months.length+" شهر"} extra={<Btn small onClick={printRep} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨</Btn>}>
    {months.length>0?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>
      <th style={TH}>الشهر</th>{cats.map(c=><th key={c} style={{...TH,fontSize:FS-3}}>{c}</th>)}<th style={TH}>الإجمالي</th>
    </tr></thead><tbody>{months.map((m,i)=>{const total=cats.reduce((s,c)=>s+(monthMap[m][c]||0),0);const prev=i>0?cats.reduce((s,c)=>s+(monthMap[months[i-1]][c]||0),0):null;
      return<tr key={m} style={{borderBottom:"1px solid "+T.brd}}>
        <td style={{...TDB,color:T.accent}}>{m}</td>
        {cats.map(c=><td key={c} style={{...TDB,fontSize:FS-2}}>{monthMap[m][c]?fmt(r2(monthMap[m][c])):"—"}</td>)}
        <td style={{...TDB,fontWeight:800,color:T.err}}>{fmt(r2(total))}{prev!=null&&<span style={{fontSize:FS-3,color:total>prev?T.err:T.ok,marginRight:4}}>{total>prev?"▲":"▼"}</span>}</td>
      </tr>})}</tbody></table></div>:<div style={{textAlign:"center",padding:30,color:T.textMut}}>لا توجد مصروفات</div>}
  </Card>
}

/* ══ CASHFLOW REPORT ══ */


export function CashflowReport({data,isMob}){
  const txns=data.treasury||[];const monthMap={};
  txns.forEach(t=>{const m=(t.date||"").slice(0,7);if(!m)return;if(!monthMap[m])monthMap[m]={inflow:0,outflow:0};
    if(t.type==="in")monthMap[m].inflow+=(Number(t.amount)||0);else monthMap[m].outflow+=(Number(t.amount)||0)});
  const months=Object.keys(monthMap).sort();let runBal=(data.treasurySettings||{}).openingBalance||0;
  const rows=months.map(m=>{const d=monthMap[m];runBal+=d.inflow-d.outflow;return{month:m,...d,net:r2(d.inflow-d.outflow),balance:r2(runBal)}});
  const printRep=()=>{const el=document.getElementById("cashflow-rep");if(el)printPage("التدفق النقدي الشهري",el.innerHTML)};
  return<Card id="cashflow-rep" title="💹 التدفق النقدي — شهري" extra={<Btn small onClick={printRep} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨</Btn>}>
    {rows.length>0?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>
      {["الشهر","وارد","منصرف","صافي الشهر","الرصيد التراكمي"].map(h=><th key={h} style={TH}>{h}</th>)}
    </tr></thead><tbody>{rows.map(r=><tr key={r.month} style={{borderBottom:"1px solid "+T.brd}}>
      <td style={{...TDB,color:T.accent}}>{r.month}</td>
      <td style={{...TDB,color:T.ok,fontWeight:700}}>{fmt(r.inflow)}</td>
      <td style={{...TDB,color:T.err,fontWeight:700}}>{fmt(r.outflow)}</td>
      <td style={{...TDB,color:r.net>=0?T.ok:T.err,fontWeight:800}}>{(r.net>=0?"+":"")+fmt(r.net)}</td>
      <td style={{...TDB,fontWeight:900,fontSize:FS+1,color:r.balance>=0?"#0D9488":T.err}}>{fmt(r.balance)}</td>
    </tr>)}</tbody></table></div>:<div style={{textAlign:"center",padding:30,color:T.textMut}}>لا توجد حركات</div>}
  </Card>
}

/* ══ LABOR COST REPORT ══ */


export function LaborCostReport({data,isMob}){
  const weeks=data.hrWeeks||[];const hrLog=data.hrLog||[];const employees=data.employees||[];
  const rows=weeks.filter(w=>w.status==="closed").sort((a,b)=>(a.weekStart||"").localeCompare(b.weekStart||"")).map(w=>{
    const salaries=hrLog.filter(l=>l.type==="salary"&&l.weekId===w.id);
    const advances=hrLog.filter(l=>l.type==="advance"&&(l.weekId===w.id||(l.date>=w.weekStart&&l.date<=w.weekEnd)));
    const totalGross=salaries.reduce((s,l)=>s+(Number(l.amount)||0),0);
    const totalAdv=advances.reduce((s,l)=>s+(Number(l.amount)||0),0);
    const totalNet=r2(totalGross-totalAdv);
    const empCount=new Set(salaries.map(l=>l.empId)).size;
    return{weekNum:w.weekNum,period:w.weekStart+" → "+w.weekEnd,empCount,totalGross:r2(totalGross),totalAdv:r2(totalAdv),totalNet,costPerEmp:empCount>0?r2(totalGross/empCount):0}});
  const totals={gross:rows.reduce((s,r)=>s+r.totalGross,0),adv:rows.reduce((s,r)=>s+r.totalAdv,0),net:rows.reduce((s,r)=>s+r.totalNet,0)};
  const printRep=()=>{const el=document.getElementById("laborcost-rep");if(el)printPage("تكلفة العمالة",el.innerHTML)};
  return<Card id="laborcost-rep" title={"👷 تكلفة العمالة — "+rows.length+" أسبوع | إجمالي: "+fmt(r2(totals.gross))+" ج.م"} extra={<Btn small onClick={printRep} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨</Btn>}>
    {rows.length>0?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>
      {["الأسبوع","الفترة","عدد الموظفين","إجمالي المرتبات","السلف","الصافي","تكلفة/موظف"].map(h=><th key={h} style={TH}>{h}</th>)}
    </tr></thead><tbody>{rows.map(r=><tr key={r.weekNum} style={{borderBottom:"1px solid "+T.brd}}>
      <td style={{...TDB,color:T.accent,fontWeight:800}}>{"W"+r.weekNum}</td><td style={TD}>{r.period}</td>
      <td style={TDB}>{r.empCount}</td><td style={{...TDB,fontWeight:700}}>{fmt(r.totalGross)}</td>
      <td style={{...TDB,color:T.err}}>{fmt(r.totalAdv)}</td>
      <td style={{...TDB,color:T.ok,fontWeight:800}}>{fmt(r.totalNet)}</td>
      <td style={{...TDB,color:T.accent}}>{fmt(r.costPerEmp)}</td>
    </tr>)}
    <tr style={{background:T.accent+"06"}}><td colSpan={3} style={{...TD,fontWeight:800}}>الإجمالي</td>
      <td style={{...TDB,fontWeight:900}}>{fmt(r2(totals.gross))}</td><td style={{...TDB,color:T.err,fontWeight:800}}>{fmt(r2(totals.adv))}</td>
      <td style={{...TDB,color:T.ok,fontWeight:900,fontSize:FS+2}}>{fmt(r2(totals.net))}</td><td style={TDB}></td>
    </tr></tbody></table></div>:<div style={{textAlign:"center",padding:30,color:T.textMut}}>لا توجد أسابيع مقفولة</div>}
  </Card>
}


/* ═══════════════════════════════════════════════════════════════════
   Module-level scan mode trackers.
   Kept OUTSIDE any component to avoid React hook violations.
   These are mutable variables that the camera scanner closures can
   read from at scan time to support live toggling of series/piece mode.
   ═══════════════════════════════════════════════════════════════════ */
let _auditScanMode="series";
let _stockRcvScanMode="series";

/* CustDeliverPg moved to pages/CustDeliverPg.jsx (V15.0 phase 2) */
