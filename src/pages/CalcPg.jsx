/* ═══════════════════════════════════════════════════════════════
   CLARK - CalcPg.jsx
   
   Extracted from App.jsx in V15.1 phase 3.
   Contains: CalcPg
   ═══════════════════════════════════════════════════════════════ */

import { useState } from "react";
import { Btn, Card, Inp, Sel } from "../components/ui.jsx";
import { FS } from "../constants/index.js";
import { T, TD, TDB, TH } from "../theme.js";
import { fmt, r2 } from "../utils/format.js";

export function CalcPg({data,isMob}){
  const[cFabs,setCFabs]=useState([{fabId:"",cons:0,layers:0,pcsPerLayer:0}]);
  const[cAccs,setCAccs]=useState([]);
  const addFab=()=>setCFabs(p=>[...p,{fabId:"",cons:0,layers:0,pcsPerLayer:0}]);
  const upFab=(i,f,v)=>setCFabs(p=>p.map((x,j)=>j===i?{...x,[f]:f==="fabId"?v:(Number(v)||0)}:x));
  const mainQty=cFabs[0]?(cFabs[0].layers*cFabs[0].pcsPerLayer):0;
  const fabCosts=cFabs.map(f=>{const fb=data.fabrics.find(x=>x.id===Number(f.fabId));const price=fb?fb.price:0;return{name:fb?fb.name:"",cost:r2(f.cons*price*f.layers),perPc:mainQty?r2(f.cons*price*f.layers/mainQty):0}});
  const totalFab=fabCosts.reduce((s,f)=>s+f.cost,0);const fabPerPc=mainQty?r2(totalFab/mainQty):0;
  const accPerPc=cAccs.reduce((s,a)=>s+(Number(a.price)||0),0);const totalAcc=accPerPc*mainQty;
  const totalCost=totalFab+totalAcc;const costPerPc=r2(fabPerPc+accPerPc);
  const reset=()=>{setCFabs([{fabId:"",cons:0,layers:0,pcsPerLayer:0}]);setCAccs([])};
  return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
      <h1 style={{fontSize:isMob?20:26,fontWeight:800,color:"#EC4899",margin:0}}>🧮 حاسبة التكاليف</h1>
      <Btn ghost onClick={reset}>🔄 مسح</Btn>
    </div>
    <Card title="الخامات" style={{marginBottom:14}}>
      {cFabs.map((f,i)=>{const fb=data.fabrics.find(x=>x.id===Number(f.fabId));return<div key={i} style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"2fr 1fr 1fr 1fr auto",gap:8,marginBottom:8,padding:10,background:T.bg,borderRadius:10}}>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>الخامة{i===0?" (رئيسية) *":""}</label><Sel value={f.fabId} onChange={v=>upFab(i,"fabId",v)}><option value="">-- اختر --</option>{data.fabrics.map(x=><option key={x.id} value={x.id}>{x.name+" - "+x.price+" ج.م/"+x.unit}</option>)}</Sel></div>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>استهلاك/راق</label><Inp type="number" value={f.cons} onChange={v=>upFab(i,"cons",v)}/></div>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>الراقات</label><Inp type="number" value={f.layers} onChange={v=>upFab(i,"layers",v)}/></div>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>قطع/راق</label><Inp type="number" value={f.pcsPerLayer} onChange={v=>upFab(i,"pcsPerLayer",v)}/></div>
        {i>0&&<Btn danger small onClick={()=>setCFabs(p=>p.filter((_,j)=>j!==i))} style={{alignSelf:"end"}} title="إغلاق">✕</Btn>}
      </div>})}
      <Btn ghost small onClick={addFab} style={{color:"#EC4899"}}>+ خامة اضافية</Btn>
    </Card>
    <Card title="الاكسسوار" style={{marginBottom:14}}>
      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>{(data.accessories||[]).filter(a=>!cAccs.find(x=>x.accId===a.id)).map(a=><span key={a.id} onClick={()=>setCAccs(p=>[...p,{accId:a.id,name:a.name,price:a.price}])} style={{padding:"6px 12px",borderRadius:8,background:T.bg,border:"1px solid "+T.brd,cursor:"pointer",fontSize:FS-1}}>{"+ "+a.name+" ("+a.price+" ج.م)"}</span>)}</div>
      {cAccs.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:6}}>{cAccs.map((a,i)=><span key={i} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:8,background:"#EC4899"+"12",border:"1px solid #EC4899"+"30",fontSize:FS-1,fontWeight:600}}>{a.name+" — "+a.price+" ج.م"}<span onClick={()=>setCAccs(p=>p.filter((_,j)=>j!==i))} style={{cursor:"pointer",color:T.err,fontWeight:800}}>✕</span></span>)}</div>}
    </Card>
    {mainQty>0&&<Card title="النتيجة" accent={"linear-gradient(135deg,#EC4899,#8B5CF6)"}>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"repeat(4,1fr)",gap:12,marginBottom:14}}>
        <div style={{padding:14,borderRadius:10,background:T.accent+"08",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>كمية القطع</div><div style={{fontSize:24,fontWeight:800,color:T.accent}}>{mainQty}</div></div>
        <div style={{padding:14,borderRadius:10,background:"#EC4899"+"08",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>تكلفة الخامات</div><div style={{fontSize:20,fontWeight:800,color:"#EC4899"}}>{fmt(r2(totalFab))+" ج.م"}</div></div>
        <div style={{padding:14,borderRadius:10,background:"#8B5CF6"+"08",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>تكلفة الاكسسوار</div><div style={{fontSize:20,fontWeight:800,color:"#8B5CF6"}}>{fmt(r2(totalAcc))+" ج.م"}</div></div>
        <div style={{padding:14,borderRadius:10,background:T.ok+"08",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>التكلفة الاجمالية</div><div style={{fontSize:24,fontWeight:800,color:T.ok}}>{fmt(r2(totalCost))+" ج.م"}</div></div>
      </div>
      <div style={{textAlign:"center",padding:14,background:T.cardSolid,borderRadius:12,border:"2px solid "+T.accent}}>
        <div style={{fontSize:FS,color:T.textSec}}>تكلفة القطعة الواحدة</div>
        <div style={{fontSize:32,fontWeight:800,color:T.accent}}>{costPerPc+" ج.م"}</div>
        <div style={{fontSize:FS-2,color:T.textMut}}>{"(خامات: "+fabPerPc+" + اكسسوار: "+accPerPc+")"}</div>
      </div>
      {fabCosts.filter(f=>f.name).length>0&&<div style={{marginTop:12,overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["الخامة","التكلفة","تكلفة/قطعة"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
        {fabCosts.filter(f=>f.name).map((f,i)=><tr key={i}><td style={TD}>{f.name}</td><td style={{...TDB,color:"#EC4899"}}>{fmt(f.cost)+" ج.م"}</td><td style={{...TDB,color:T.accent}}>{f.perPc+" ج.م"}</td></tr>)}
      </tbody></table></div>}
    </Card>}
  </div>
}

/* ══ SEARCH ══ */
