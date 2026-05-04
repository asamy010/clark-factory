/* ═══════════════════════════════════════════════════════════════
   CLARK - RepPg.jsx
   
   Extracted from App.jsx in V15.1 phase 3.
   Contains: RepPg
   ═══════════════════════════════════════════════════════════════ */

import { Badge, Btn } from "../components/ui.jsx";
import { DEFAULT_STATUSES, FCOL, FKEYS, FS } from "../constants/index.js";
import { T, TD, TDB, TH } from "../theme.js";
import { fmt, gc, gf } from "../utils/format.js";
import { calcOrder, sortOrders } from "../utils/orders.js";
import { printPage } from "../utils/print.js";
import { exportExcel } from "../utils/print-extras.js";

export function RepPg({data,isMob,season,statusCards}){
  const statuses=(statusCards||DEFAULT_STATUSES).map(s=>s.name);
  const list=sortOrders(data.orders);
  const cutQ=list.reduce((s,o)=>s+calcOrder(o).cutQty,0);
  const delQ=list.reduce((s,o)=>s+(o.deliveredQty||0),0);
  const comp=cutQ?Math.round((delQ/cutQ)*100):0;
  const today=new Date().toLocaleDateString("ar-EG",{year:"numeric",month:"long",day:"numeric"});
  const fabName=(o,k)=>{const l=gf(o,k,"Label");return l?l.split(" - ")[0]:null};
  const activeFabs=(o)=>FKEYS.filter(k=>gf(o,k)&&gc(o,k).length>0);
  const printRep=()=>{const el=document.getElementById("rep-area");if(!el)return;printPage("تقرير الانتاج — "+season,el.innerHTML)};
  const exportRepXls=()=>{const rows=[["#","الموديل","الوصف","الخامات","القطع","كمية القص","مخزن جاهز","الرصيد","الحالة"]];
    list.forEach((o,i)=>{const c=calcOrder(o);const aF=activeFabs(o).map(k=>fabName(o,k)).filter(Boolean).join("، ");const pcs=(o.orderPieces||[]).join("، ");rows.push([i+1,o.modelNo,o.modelDesc,aF,pcs,c.cutQty,o.deliveredQty||0,c.balance,o.status])});
    rows.push([]);rows.push(["","","","","اجمالي",cutQ,delQ,cutQ-delQ,comp+"%"]);exportExcel(rows,"تقرير_الانتاج_"+season)};

  return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
      <div><div style={{fontSize:FS,color:T.textSec}}>{today}</div></div>
      <div style={{display:"flex",gap:6}}>
        <Btn onClick={exportRepXls} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30"}}>📊 Excel</Btn>
        <Btn onClick={printRep} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨</Btn>
      </div>
    </div>
    <div id="rep-area">
      <h1 style={{fontSize:isMob?18:24,fontWeight:800,margin:"0 0 4px",color:T.accent}}>تقرير قص وانتاج المصنع</h1>
      <div className="sub" style={{fontSize:FS-1,color:T.textSec,marginBottom:12}}>{"الموسم: "+season+" | "+list.length+" موديل | "+today}</div>
      {(()=>{const inProd=list.filter(o=>o.status==="في التشغيل").length;const finishing=list.filter(o=>o.status==="تشطيب وتعبئة").length;const shipped=list.filter(o=>o.status==="تم التسليم لمخزن الجاهز").length;const balance=cutQ-delQ;
        return<div style={{display:"grid",gridTemplateColumns:isMob?"repeat(3,1fr)":"repeat(5,1fr)",gap:8,marginBottom:14}}>
          {[["عدد الموديلات",list.length,"📋",T.accent],["في المخزن الجاهز",shipped,"✅","#059669"],["تشطيب وتعبئة",finishing,"🏭","#8B5CF6"],["في التشغيل",inProd,"⚡","#F59E0B"],["رصيد المصنع",fmt(balance),"📊",balance>0?T.err:T.ok]].map(([l,v,ic,c],i)=>
            <div key={i} style={{padding:"10px 8px",borderRadius:10,border:"1px solid "+T.brd,background:T.cardSolid,textAlign:"center"}}><div style={{fontSize:16,marginBottom:2}}>{ic}</div><div style={{fontSize:FS+4,fontWeight:800,color:c}}>{v}</div><div style={{fontSize:FS-2,color:T.textSec}}>{l}</div></div>)}
        </div>})()}
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:700}}>
        <thead><tr>{["#","الموديل","الوصف","الخامات","القطع","كمية القص","مخزن","رصيد","الورش","الحالة"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
        <tbody>{list.map((o,i)=>{const c=calcOrder(o);const aFabs=activeFabs(o);const wds=o.workshopDeliveries||[];const pieces=o.orderPieces||[];
          return<tr key={o.id}>
          <td style={TD}>{i+1}</td><td style={TDB}>{o.modelNo}</td><td style={{...TD,maxWidth:120}}>{o.modelDesc}</td>
          <td style={TD}><div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{aFabs.map(k=><span key={k} className="fab" style={{display:"inline-block",padding:"1px 6px",borderRadius:4,fontSize:FS-3,fontWeight:600,background:FCOL[FKEYS.indexOf(k)]+"18",color:FCOL[FKEYS.indexOf(k)]}}>{fabName(o,k)}</span>)}</div></td>
          <td style={TD}>{pieces.length>0?<div style={{display:"flex",gap:2,flexWrap:"wrap"}}>{pieces.map(p=><span key={p} style={{fontSize:FS-3,padding:"1px 5px",borderRadius:4,background:T.purple+"10",color:T.purple,fontWeight:600}}>{p}</span>)}</div>:"-"}</td>
          <td style={{...TDB,color:T.accent}}>{c.cutQty}</td><td style={TDB}>{o.deliveredQty||0}</td>
          <td style={{...TDB,color:c.balance>0?T.warn:T.ok}}>{c.balance}</td>
          <td style={TD}>{wds.length>0?<div style={{display:"flex",gap:2,flexWrap:"wrap"}}>{[...new Set(wds.map(wd=>wd.wsName))].map(n=><span key={n} className="ws" style={{fontSize:FS-3,padding:"1px 5px",borderRadius:4,background:T.ok+"10",color:T.ok,fontWeight:600}}>{n}</span>)}</div>:"-"}</td>
          <td style={TD}><Badge t={o.status} cards={statusCards}/></td></tr>})}
          {list.length===0&&<tr><td colSpan={10} style={{...TD,textAlign:"center",color:T.textSec,padding:30}}>لا توجد بيانات</td></tr>}
        </tbody>
      </table></div>
    </div>
  </div>
}

/* ══ COST ══ */
