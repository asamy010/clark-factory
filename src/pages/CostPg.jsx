/* ═══════════════════════════════════════════════════════════════
   CLARK - CostPg.jsx
   
   Extracted from App.jsx in V15.1 phase 3.
   Contains: CostPg
   ═══════════════════════════════════════════════════════════════ */

import { useState } from "react";
import { Btn, Inp } from "../components/ui.jsx";
import { FCOL, FKEYS, FS } from "../constants/index.js";
import { T, TD, TDB, TH } from "../theme.js";
import { fmt, gc, gcons, gf, r2, slay } from "../utils/format.js";
import { calcOrder, sortOrders } from "../utils/orders.js";
import { printPage } from "../utils/print.js";
import { exportExcel } from "../utils/print-extras.js";

export function CostPg({data,isMob,statusCards}){
  const[cDateFrom,setCDateFrom]=useState("");const[cDateTo,setCDateTo]=useState("");
  const orders=sortOrders(data.orders.filter(o=>{if(cDateFrom&&o.date<cDateFrom)return false;if(cDateTo&&o.date>cDateTo)return false;return true}));const totalCut=orders.reduce((s,o)=>s+calcOrder(o).cutQty,0);const totalCost=orders.reduce((s,o)=>s+calcOrder(o).costAll,0);const totalFab=orders.reduce((s,o)=>s+calcOrder(o).totalFab,0);const totalAcc=orders.reduce((s,o)=>s+calcOrder(o).accAll,0);const totalWs=orders.reduce((s,o)=>s+calcOrder(o).wsCostAll,0);
  const fabName=(o,k)=>{const l=gf(o,k,"Label");return l?l.split(" - ")[0]:null};
  const today=new Date().toLocaleDateString("ar-EG",{year:"numeric",month:"long",day:"numeric"});
  const printCost=()=>{const el=document.getElementById("cost-area");if(!el)return;printPage("تقرير التكاليف",el.innerHTML)};
  const exportCostXls=()=>{const rows=[["#","الموديل","الوصف","الخامات","الكمية","خامات/قطعة","اكسسوار/قطعة","ورش/قطعة","تكلفة القطعة","اجمالي"]];
    orders.forEach((o,i)=>{const c=calcOrder(o);const aFabs=FKEYS.filter(k=>gf(o,k)&&gc(o,k).length>0).map(k=>fabName(o,k)).filter(Boolean).join("، ");rows.push([i+1,o.modelNo,o.modelDesc,aFabs,c.cutQty,c.fabPer,c.accPer,c.wsCostPer,c.costPer,c.costAll])});
    rows.push([]);rows.push(["","","","اجمالي",totalCut,r2(totalFab),r2(totalAcc),r2(totalWs),"",r2(totalCost)]);exportExcel(rows,"تقرير_التكاليف")};
  return<div>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:10,flexWrap:"wrap",gap:6,alignItems:"center"}}>
      <div style={{display:"flex",gap:4,alignItems:"center",flexWrap:"wrap"}}>
        <span style={{fontSize:FS-2,color:T.textSec}}>فترة:</span>
        <Inp type="date" value={cDateFrom} onChange={setCDateFrom} style={{width:120,fontSize:FS-2}}/>
        <Inp type="date" value={cDateTo} onChange={setCDateTo} style={{width:120,fontSize:FS-2}}/>
        {(cDateFrom||cDateTo)&&<Btn ghost small onClick={()=>{setCDateFrom("");setCDateTo("")}} title="إغلاق">✕</Btn>}
      </div>
      <div style={{display:"flex",gap:6}}>
        <Btn onClick={exportCostXls} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30"}}>📊 Excel</Btn>
        <Btn onClick={printCost} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨</Btn>
      </div>
    </div>
    <div id="cost-area">
      <h1 style={{fontSize:isMob?18:24,fontWeight:800,margin:"0 0 4px",color:T.accent}}>تقرير التكاليف</h1>
      <div className="sub" style={{fontSize:FS-1,color:T.textSec,marginBottom:12}}>{orders.length+" موديل | "+today}</div>
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        {[[orders.length,"الموديلات",T.accent],[fmt(totalCut),"اجمالي القص",T.ok],[fmt(r2(totalFab))+" ج","تكلفة الخامات",T.warn],[fmt(r2(totalAcc))+" ج","تكلفة الاكسسوار",T.purple],[fmt(r2(totalWs))+" ج","تكلفة الورش",T.ok],[fmt(r2(totalCost))+" ج","اجمالي التكاليف",T.err],[totalCut?(r2(totalCost/totalCut))+" ج":"0","متوسط/قطعة","#8B5CF6"]].map(([v,l,c],i)=>
          <div key={i} className="mc" style={{padding:"8px 14px",borderRadius:8,border:"1px solid "+T.brd,background:T.cardSolid,textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>{l}</div><b style={{fontSize:16,fontWeight:800,color:c}}>{v}</b></div>)}
      </div>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:720}}>
        <thead><tr>{["#","الموديل","الوصف","الخامات","كمية","خامات/قطعة","اكسسوار/قطعة","ورش/قطعة","تكلفة القطعة","اجمالي"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
        <tbody>{orders.map((o,i)=>{const c=calcOrder(o);const aFabs=FKEYS.filter(k=>gf(o,k)&&gc(o,k).length>0);
          return<tr key={o.id}>
          <td style={TD}>{i+1}</td><td style={TDB}>{o.modelNo}</td><td style={{...TD,maxWidth:100}}>{o.modelDesc}</td>
          <td style={TD}><div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{aFabs.map(k=>{const cost=gcons(o,k)*(gf(o,k,"Price")||0)*slay(gc(o,k));const perPc=c.cutQty?r2(cost/c.cutQty):0;
            return<span key={k} className="fab" style={{display:"inline-block",padding:"2px 6px",borderRadius:4,fontSize:FS-3,fontWeight:600,background:FCOL[FKEYS.indexOf(k)]+"15",color:FCOL[FKEYS.indexOf(k)]}}>{fabName(o,k)+" "+perPc+"ج"}</span>})}{aFabs.length===0&&"-"}</div></td>
          <td style={{...TDB,color:T.accent}}>{c.cutQty}</td>
          <td style={TDB}>{c.fabPer+" ج.م"}</td>
          <td style={TDB}>{c.accPer+" ج.م"}</td>
          <td style={{...TDB,color:T.ok}}>{c.wsCostPer?c.wsCostPer+" ج.م":"-"}</td>
          <td style={{...TDB,color:T.accent,fontSize:FS+1}}>{c.costPer+" ج.م"}</td>
          <td style={{...TDB,color:T.err}}>{fmt(c.costAll)+" ج.م"}</td></tr>})}
          {orders.length>0&&<tr className="tot" style={{background:T.accent+"08"}}><td colSpan={4} style={{...TD,fontWeight:800}}>الاجمالي</td><td style={{...TDB,fontWeight:800}}>{fmt(totalCut)}</td><td style={{...TDB,fontWeight:800}}>{fmt(r2(totalFab))}</td><td style={{...TDB,fontWeight:800}}>{fmt(r2(totalAcc))}</td><td style={{...TDB,fontWeight:800,color:T.ok}}>{fmt(r2(totalWs))}</td><td style={TDB}></td><td style={{...TDB,fontWeight:800,color:T.err,fontSize:FS+1}}>{fmt(r2(totalCost))+" ج.م"}</td></tr>}
          {orders.length===0&&<tr><td colSpan={10} style={{...TD,textAlign:"center",color:T.textSec,padding:30}}>لا توجد بيانات</td></tr>}
        </tbody>
      </table></div>
    </div>
  </div>
}

/* ══ SETTINGS ══ */
/* ══ TASKS ══ */
