/* ═══════════════════════════════════════════════════════════════
   CLARK - UI Components (V15.0 Phase 2)
   
   All shared UI primitives extracted from App.jsx.
   These components read T/TH/TD/TDB/TDL from theme.js (mutable).
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef } from "react";
import { T, TH, TD, TDB, TDL } from "../theme.js";
import { FS, COLORS_DB } from "../constants/index.js";
import { sqty, slay, safeCalc } from "../utils/format.js";
import { getStatusColor } from "../utils/orders.js";
import { loadQR, loadJsQR, scanQR } from "../utils/qr.js";

/* ──────── Spinner / LoadingBtn / InlineLoading ──────── */
export function Spinner({size,color,inline}){
  const sz=size==="small"?14:size==="large"?48:22;
  const bw=size==="small"?2:size==="large"?4:3;
  const c=color||(T&&T.accent)||"#0EA5E9";
  const borderBg=(T&&T.brd)||"#E2E8F0";
  const style={width:sz,height:sz,borderRadius:"50%",border:bw+"px solid "+borderBg,borderTopColor:c,animation:"clarkSpin 0.7s linear infinite",display:inline?"inline-block":"block",flexShrink:0,verticalAlign:inline?"middle":"initial"};
  return<span style={style} aria-label="loading"/>;
}

export function LoadingBtn({loading,loadingText,children,onClick,disabled,primary,small,ghost,danger,style:sx,...rest}){
  /* Wraps standard button but shows spinner + text swap when loading */
  const isDisabled=disabled||loading;
  const mob=typeof window!=="undefined"&&window.innerWidth<768;
  const bg=ghost?"transparent":danger?T.err:primary?T.accent:T.bg;
  const fg=ghost?T.text:danger?"#fff":primary?"#fff":T.text;
  const bd=ghost?"1px solid "+T.brd:danger?"none":primary?"none":"1px solid "+T.brd;
  return<button onClick={onClick} disabled={isDisabled} style={{padding:small?(mob?"6px 12px":"4px 10px"):(mob?"9px 18px":"7px 16px"),borderRadius:8,fontSize:small?FS-2:FS,fontWeight:600,background:bg,color:fg,border:bd,cursor:isDisabled?"default":"pointer",fontFamily:"inherit",opacity:isDisabled?(loading?0.85:0.5):1,boxShadow:primary?"0 2px 8px "+T.accent+"33":"none",minHeight:mob?36:undefined,display:"inline-flex",alignItems:"center",justifyContent:"center",gap:8,...(sx||{})}} {...rest}>
    {loading&&<Spinner size="small" color={fg} inline/>}
    <span>{loading&&loadingText?loadingText:children}</span>
  </button>;
}

export function InlineLoading({message,size,color}){
  return<div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",color:(T&&T.textSec)||"#64748B",fontSize:(typeof FS!=="undefined"?FS-1:12),justifyContent:"center"}}>
    <Spinner size={size||"medium"} color={color} inline/>
    <span>{message||"جاري التحميل..."}</span>
  </div>;
}

/* Ensure spinner keyframes exist globally (idempotent) */
if(typeof document!=="undefined"&&!document.getElementById("__clark_spin_css")){
  const s=document.createElement("style");s.id="__clark_spin_css";
  s.textContent="@keyframes clarkSpin{to{transform:rotate(360deg)}}";
  document.head.appendChild(s);
}

/* ──────── Badge / Btn / Inp / Sel / SearchSel ──────── */
export function Badge({t,cards}){const col=getStatusColor(t,cards);return<span style={{padding:"5px 14px",borderRadius:20,fontSize:FS-2,fontWeight:600,background:col+"18",color:col,border:"1px solid "+col+"30"}}>{t}</span>}

export function Btn({children,on,primary,danger,ghost,onClick,small,disabled,style:sx,title}){
  let bg=T.cardSolid,fg=T.text,bd="1px solid "+T.brd;
  if(on||primary){bg="linear-gradient(135deg,"+T.accent+","+T.accent+"CC)";fg="#fff";bd="none"}
  if(danger){bg=T.err+"12";fg=T.err;bd="1px solid "+T.err+"30"}
  if(ghost){bg="transparent";bd="none";fg=T.textSec}
  const mob=typeof window!=="undefined"&&window.innerWidth<768;
  return<button onClick={onClick} disabled={disabled} title={title} style={{padding:small?(mob?"6px 12px":"4px 10px"):(mob?"9px 18px":"7px 16px"),borderRadius:8,fontSize:small?FS-2:FS,fontWeight:600,background:bg,color:fg,border:bd,cursor:disabled?"default":"pointer",fontFamily:"inherit",opacity:disabled?0.5:1,boxShadow:primary?"0 2px 8px "+T.accent+"33":"none",minHeight:mob?36:undefined,...(sx||{})}}>{children}</button>
}

export function Inp({value,onChange,placeholder,type,step,style:sx,readOnly}){
  const isNum=type==="number";
  const handleKey=(e)=>{if(e.key==="Enter"&&isNum){const v=String(e.target.value);if(v.startsWith("=")){const r=safeCalc(v.slice(1));if(r!==null&&onChange)onChange(r)}}};
  return<input type={isNum?"text":type||"text"} inputMode={isNum?"decimal":undefined} step={step||"any"} value={value==null?"":value} readOnly={readOnly} onChange={e=>{const v=e.target.value;if(isNum&&!v.startsWith("=")){let cleaned=v.replace(/[^0-9.\-]/g,"");const parts=cleaned.split(".");if(parts.length>2)cleaned=parts[0]+"."+parts.slice(1).join("");onChange&&onChange(cleaned)}else{onChange&&onChange(v)}}} onKeyDown={handleKey} onFocus={e=>e.target.select()} placeholder={placeholder||(isNum?"0":"")} style={{width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid "+T.brd,fontSize:FS,fontFamily:"inherit",background:readOnly?T.bg:T.cardSolid,color:T.text,boxSizing:"border-box",outline:"none",...(sx||{})}}/>
}

export function Sel({value,onChange,children}){
  return<select value={value==null?"":value} onChange={e=>onChange(e.target.value)} style={{width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid "+T.brd,fontSize:FS,fontFamily:"inherit",background:T.cardSolid,color:T.text,boxSizing:"border-box"}}>{children}</select>
}

export function SearchSel({value,onChange,options,placeholder,maxResults,showAllOnFocus}){
  const[q,setQ]=useState("");const[focused,setFocused]=useState(false);const[hi,setHi]=useState(0);const ref=useRef(null);
  const selected=options.find(o=>o.value===value);
  const limit=maxResults||5;
  /* V18.52: when showAllOnFocus is true and input is empty, show all options
     (clamped to limit). Otherwise legacy behavior: show results only when typing. */
  const showResults=focused&&(q.length>0||showAllOnFocus);
  const filtered=q
    ?options.filter(o=>o.label.toLowerCase().includes(q.toLowerCase())).slice(0,limit)
    :(showAllOnFocus?options.slice(0,limit):[]);
  useEffect(()=>{const h=e=>{if(ref.current&&!ref.current.contains(e.target))setFocused(false)};document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h)},[]);
  /* Reset highlight when filtered list changes */
  useEffect(()=>{setHi(0)},[q,focused]);
  const onKey=(e)=>{
    if(e.key==="Escape"){setFocused(false);return}
    if(!showResults||filtered.length===0)return;
    if(e.key==="ArrowDown"){e.preventDefault();setHi(p=>Math.min(p+1,filtered.length-1))}
    else if(e.key==="ArrowUp"){e.preventDefault();setHi(p=>Math.max(p-1,0))}
    else if(e.key==="Enter"){e.preventDefault();const o=filtered[hi];if(o){onChange(o.value);setQ("");setFocused(false)}}
  };
  return<div ref={ref} style={{position:"relative",zIndex:focused?999:1}}>
    <input value={focused?q:(selected?selected.label:"")}
      onChange={e=>{setQ(e.target.value);if(!focused)setFocused(true)}}
      onFocus={()=>{setFocused(true);setQ("")}}
      onKeyDown={onKey}
      placeholder={placeholder||"اكتب للبحث..."}
      style={{width:"100%",padding:"6px 10px",border:"2px solid "+(focused?T.accent:T.brd),borderRadius:8,fontSize:FS,fontFamily:"inherit",background:T.cardSolid,color:T.text,boxSizing:"border-box",outline:"none",transition:"border 0.15s"}}/>
    {selected&&!focused&&<div style={{fontSize:FS-3,color:T.ok,marginTop:2}}>{"✓ "+selected.label}</div>}
    {showResults&&<div style={{position:"absolute",top:"100%",left:0,right:0,marginTop:1,zIndex:9999,borderRadius:8,border:"1px solid "+T.brd,overflow:"hidden",background:T.cardSolid,boxShadow:"0 8px 24px rgba(0,0,0,0.2)",maxHeight:280,overflowY:"auto"}}>
      {filtered.length>0?filtered.map((o,i)=><div key={o.value} onMouseDown={e=>{e.preventDefault();onChange(o.value);setQ("");setFocused(false)}}
        onMouseEnter={()=>setHi(i)}
        style={{padding:"8px 12px",cursor:"pointer",fontSize:FS,color:o.value===value?T.accent:T.text,fontWeight:o.value===value?700:400,background:i===hi?T.accent+"15":(o.value===value?T.accent+"08":T.cardSolid),borderBottom:"1px solid "+T.brd+"30"}}>{o.label}</div>)
      :<div style={{padding:"8px 12px",textAlign:"center",color:T.textMut,fontSize:FS-1}}>لا توجد نتائج</div>}
    </div>}
  </div>
}

/* ──────── Card / MetricCard / PBar / DelBtn ──────── */
export function Card({id,children,title,extra,accent,style:sx}){
  return<div id={id} style={{background:T.cardSolid,borderRadius:12,border:"1px solid "+T.brd,boxShadow:T.shadow,overflow:"visible",...(sx||{})}}>
    {(title||extra)&&<div style={{padding:"10px 16px",borderBottom:"1px solid "+T.brd,display:"flex",justifyContent:"space-between",alignItems:"center",background:accent||T.bg,borderRadius:"12px 12px 0 0"}}><span style={{fontSize:FS+1,fontWeight:700,color:accent?"#fff":T.text}}>{title}</span>{extra}</div>}
    <div style={{padding:14}}>{children}</div>
  </div>
}

export function MetricCard({label,value,color,icon,sub}){
  return<div className="metric-card" style={{background:T.card,backdropFilter:"blur(12px)",borderRadius:12,padding:"14px 16px",border:"1px solid "+T.brd,boxShadow:T.shadow,display:"flex",alignItems:"center",gap:12,minWidth:0}}>
    <div style={{width:40,height:40,borderRadius:10,background:(color||T.accent)+"12",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{icon}</div>
    <div style={{flex:1,minWidth:0}}>
      <div className="metric-label" style={{fontSize:FS-2,color:T.textSec,marginBottom:2,fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{label}</div>
      <div className="metric-value" style={{fontSize:22,fontWeight:800,color:color||T.text,wordBreak:"break-word"}}>{value}</div>
      {sub&&<div className="metric-sub" style={{fontSize:FS-3,color:T.textMut,marginTop:1}}>{sub}</div>}
    </div>
  </div>
}

export function PBar({value,color}){return<div style={{height:6,borderRadius:3,background:"#E2E8F0",overflow:"hidden",marginTop:4}}><div style={{height:"100%",width:Math.min(value,100)+"%",borderRadius:3,background:color||"linear-gradient(90deg,#0EA5E9,#06B6D4)",transition:"width 0.6s"}}/></div>}

export function DelBtn({onConfirm,label,blocked}){
  const[confirm,setConfirm]=useState(false);const[showBlock,setShowBlock]=useState(false);
  if(showBlock)return<div style={{display:"inline-flex",gap:4,alignItems:"center",flexWrap:"wrap"}}><span style={{fontSize:FS-3,color:T.err,fontWeight:600,maxWidth:200}}>{"⚠️ "+blocked}</span><Btn ghost small onClick={()=>setShowBlock(false)}>✓</Btn></div>;
  if(confirm)return<div style={{display:"inline-flex",gap:4,alignItems:"center"}}><Btn danger small onClick={()=>{onConfirm();setConfirm(false)}}>✓ تأكيد</Btn><Btn ghost small onClick={()=>setConfirm(false)} title="إغلاق">✕</Btn></div>;
  return<Btn danger small onClick={()=>blocked?setShowBlock(true):setConfirm(true)}>{label||"🗑️"}</Btn>
}

/* ──────── ColorPicker / FCTable / AccPicker ──────── */
export function ColorPicker({value,colorHex,onSelect}){
  const[open,setOpen]=useState(false);const[txt,setTxt]=useState(value||"");
  useEffect(()=>{setTxt(value||"")},[value]);
  return<div style={{position:"relative",display:"flex",alignItems:"center",gap:8}}>
    <div onClick={()=>setOpen(!open)} style={{width:30,height:30,borderRadius:8,border:"2px solid "+T.brd,background:colorHex||"#F1F5F9",cursor:"pointer",flexShrink:0}}/>
    <input value={txt} onChange={e=>{setTxt(e.target.value);const f=COLORS_DB.find(c=>c.n===e.target.value);onSelect(e.target.value,f?f.h:colorHex||"#ccc")}} placeholder="اكتب اللون" style={{width:100,padding:"6px 10px",borderRadius:8,border:"1px solid "+T.brd,fontSize:FS-1,fontFamily:"inherit",background:T.cardSolid,color:T.text}}/>
    {open&&<div style={{position:"fixed",zIndex:9999,background:T.cardSolid,border:"1px solid "+T.brd,borderRadius:16,padding:14,boxShadow:T.shadowLg,width:280}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:6}}>{COLORS_DB.map(c=><div key={c.h} onClick={()=>{onSelect(c.n,c.h);setTxt(c.n);setOpen(false)}} title={c.n} style={{width:38,height:38,borderRadius:8,background:c.h,cursor:"pointer",border:colorHex===c.h?"3px solid "+T.accent:"2px solid transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:c.h==="#FFFFFF"?"#999":"#fff",fontWeight:600}}>{c.n}</div>)}</div>
      <div onClick={()=>setOpen(false)} style={{marginTop:10,textAlign:"center",fontSize:FS,color:T.accent,cursor:"pointer",fontWeight:700}}>اغلاق</div>
    </div>}
  </div>
}

export function FCTable({label,fabName,colors,setColors,accent,readOnly,pcsPerSeries}){
  const tQ=sqty(colors),tL=slay(colors);
  const pps=pcsPerSeries||0;
  const addC=()=>setColors([...colors,{color:"",colorHex:"",layers:0,pcsPerLayer:pps||0,qty:0}]);
  const upC=(i,fld,val)=>{const nc=colors.map((c,j)=>{if(j!==i)return c;const u={...c};u[fld]=(fld==="color"||fld==="colorHex")?val:(Number(val)||0);if(fld==="layers"||fld==="pcsPerLayer")u.qty=(Number(u.layers)||0)*(Number(u.pcsPerLayer)||0);return u});setColors(nc)};
  return<div style={{border:"1px solid "+T.brd,borderRadius:14,overflow:"visible",marginBottom:12,boxShadow:"0 2px 8px rgba(0,0,0,0.04)"}}>
    <div style={{padding:"10px 16px",background:accent,display:"flex",justifyContent:"space-between",alignItems:"center",borderRadius:"14px 14px 0 0",flexWrap:"wrap",gap:8}}>
      <span style={{fontSize:FS,fontWeight:700,color:"#fff"}}>{label+": "+(fabName||"")}</span>
      <div style={{display:"flex",gap:8}}>{pps>0&&<span style={{fontSize:FS-2,color:"#fff",background:"rgba(255,255,255,0.25)",padding:"4px 14px",borderRadius:20,fontWeight:600}}>{"سيري: "+pps}</span>}<span style={{fontSize:FS-2,color:"#fff",background:"rgba(255,255,255,0.25)",padding:"4px 14px",borderRadius:20,fontWeight:600}}>{"راقات: "+tL}</span><span style={{fontSize:FS-2,color:"#fff",background:"rgba(255,255,255,0.25)",padding:"4px 14px",borderRadius:20,fontWeight:600}}>{"قطع: "+tQ}</span></div>
    </div>
    <div style={{padding:12,overflowX:"auto"}}>
      <table style={{width:"100%",borderCollapse:"collapse",minWidth:450}}>
        <thead><tr><th style={{...TH,background:"transparent"}}>اللون</th><th style={{...TH,background:"transparent"}}>الراقات</th><th style={{...TH,background:"transparent"}}>القطع/راق</th><th style={{...TH,background:"transparent"}}>الكمية</th>{!readOnly&&<th style={{...TH,background:"transparent"}}> </th>}</tr></thead>
        <tbody>{colors.map((c,i)=>{const isFree=c._free;const ppsValid=pps>0&&!isFree;return<tr key={i}>
          <td style={{...TD,minWidth:160,overflow:"visible"}}>{readOnly?<div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:22,height:22,borderRadius:6,background:c.colorHex||"#E2E8F0",border:"1px solid #E2E8F0",flexShrink:0}}/><span style={{fontWeight:500}}>{c.color||"-"}</span></div>:<ColorPicker value={c.color} colorHex={c.colorHex} onSelect={(nm,hx)=>{const nc=colors.map((cc,jj)=>jj===i?{...cc,color:nm,colorHex:hx}:cc);setColors(nc)}}/>}</td>
          <td style={{...TD,width:100}}>{readOnly?c.layers:<Inp type="number" value={c.layers} onChange={v=>{upC(i,"layers",v);if(ppsValid&&(!c.pcsPerLayer||c.pcsPerLayer===0)){upC(i,"pcsPerLayer",pps)}}}/>}</td>
          <td style={{...TD,width:120}}>{readOnly?(c.pcsPerLayer||"-"):<div style={{display:"flex",gap:3,alignItems:"center"}}>{ppsValid?<Sel value={c.pcsPerLayer||""} onChange={v=>upC(i,"pcsPerLayer",v)}><option value="">--</option>{Array.from({length:5},(_,n)=>(n+1)*pps).map(v=><option key={v} value={v}>{v}</option>)}</Sel>:<Inp type="number" value={c.pcsPerLayer} onChange={v=>upC(i,"pcsPerLayer",v)}/>}{!readOnly&&pps>0&&<Btn small onClick={()=>{const nc=colors.map((cc,jj)=>jj===i?{...cc,_free:!cc._free}:cc);setColors(nc)}} style={{padding:"2px 6px",fontSize:FS-3,background:isFree?T.warn+"15":"transparent",color:isFree?T.warn:T.textMut,border:"1px solid "+(isFree?T.warn+"40":T.brd),whiteSpace:"nowrap",flexShrink:0}}>{isFree?"🔓":"🔒"}</Btn>}</div>}</td>
          <td style={{...TDB,width:80,background:T.accentBg,textAlign:"center",borderRadius:6,color:T.accent}}>{c.qty}</td>
          {!readOnly&&<td style={{...TD,width:40}}><Btn danger small onClick={()=>setColors(colors.filter((_,j)=>j!==i))}>x</Btn></td>}
        </tr>})}</tbody>
      </table>
      {!readOnly&&<Btn ghost small onClick={addC} style={{marginTop:6,color:accent}}>+ لون جديد</Btn>}
    </div>
  </div>
}

export function AccPicker({accItems,dbAcc,onChange}){
  const[showPick,setShowPick]=useState(false);
  const[picked,setPicked]=useState({});
  const available=dbAcc.filter(a=>!accItems.find(x=>x.accId===a.id));
  const openPicker=()=>{setPicked({});setShowPick(true)};
  const togglePick=(id)=>setPicked(p=>({...p,[id]:!p[id]}));
  const addSelected=()=>{const ids=Object.keys(picked).filter(k=>picked[k]);const newItems=ids.map(id=>{const acc=dbAcc.find(a=>a.id===Number(id));return acc?{accId:acc.id,name:acc.name,unit:acc.unit,price:acc.price}:null}).filter(Boolean);if(newItems.length>0)onChange([...accItems,...newItems]);setShowPick(false)};
  const selCount=Object.values(picked).filter(Boolean).length;
  return<div>
    <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
      <Btn primary onClick={openPicker} disabled={available.length===0}>{"+ اختيار اكسسوارات ("+(available.length)+" متاح)"}</Btn>
    </div>
    {showPick&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowPick(false)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:20,width:"100%",maxWidth:450,maxHeight:"70vh",overflow:"auto",border:"1px solid "+T.brd,boxShadow:"0 10px 40px rgba(0,0,0,0.2)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:FS+2,fontWeight:800,color:T.accent}}>اختر بنود الاكسسوار</div>
          <Btn ghost small onClick={()=>setShowPick(false)} title="إغلاق">✕</Btn>
        </div>
        {available.length>0?<div style={{display:"flex",flexDirection:"column",gap:6}}>
          {available.map(a=><div key={a.id} onClick={()=>togglePick(a.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:10,cursor:"pointer",background:picked[a.id]?T.accent+"12":T.bg,border:"1.5px solid "+(picked[a.id]?T.accent:T.brd),transition:"all 0.15s"}}>
            <div style={{width:22,height:22,borderRadius:6,border:"2px solid "+(picked[a.id]?T.accent:T.brd),background:picked[a.id]?T.accent:"transparent",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:14,fontWeight:800,flexShrink:0}}>{picked[a.id]?"✓":""}</div>
            <div style={{flex:1}}><div style={{fontWeight:600}}>{a.name}</div><div style={{fontSize:FS-2,color:T.textSec}}>{a.unit+" — "+a.price+" ج.م"}</div></div>
          </div>)}
        </div>:<div style={{textAlign:"center",padding:20,color:T.textSec}}>تم اضافة جميع الاكسسوارات</div>}
        {selCount>0&&<div style={{marginTop:14,display:"flex",justifyContent:"center"}}><Btn primary onClick={addSelected}>{"اضافة "+selCount+" بند"}</Btn></div>}
      </div>
    </div>}
    {accItems.length>0&&<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:400}}><thead><tr>{["الوصف","الوحدة","السعر",""].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
      {accItems.map((a,i)=><tr key={i}><td style={{...TD,fontWeight:600}}>{a.name}</td><td style={TD}>{a.unit}</td><td style={TD}><Inp type="number" value={a.price} onChange={v=>{const n=[...accItems];n[i]={...n[i],price:Number(v)||0};onChange(n)}} style={{width:90}}/></td><td style={TD}><Btn danger small onClick={()=>onChange(accItems.filter((_,j)=>j!==i))}>x</Btn></td></tr>)}
    </tbody></table></div>}
  </div>
}

/* ──────── Timeline ──────── */
export function Timeline({phases,currentIdx}){if(!phases||phases.length===0)return null;
  /* V18.92: Fixed minWidth per phase (110px) so on small screens the timeline overflows
     and the parent's overflow-x:auto activates real horizontal scroll instead of squeezing. */
  return<div style={{padding:"8px 0",minWidth:phases.length*110}}>
    <style>{`@keyframes tl-pulse{0%,100%{box-shadow:0 0 0 0 var(--pc)}50%{box-shadow:0 0 0 8px transparent}}`}</style>
    <div style={{display:"flex",alignItems:"flex-start",position:"relative",gap:0}}>
      <div style={{position:"absolute",top:16,right:phases.length>1?"calc(50% / "+phases.length+")":"0",left:phases.length>1?"calc(50% / "+phases.length+")":"0",height:3,background:T.brd,borderRadius:2}}/>
      {phases.map((p,i)=>{const isCurrent=i===currentIdx;const isPast=i<currentIdx;const isFuture=i>currentIdx;
        return<div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",position:"relative",minWidth:100}}>
          <div style={{width:isCurrent?20:14,height:isCurrent?20:14,borderRadius:"50%",background:isFuture?T.brd:p.color||T.accent,border:"3px solid "+T.cardSolid,boxShadow:isCurrent?"0 0 0 3px "+(p.color||T.accent):"0 0 0 2px "+(isFuture?T.brd:p.color||T.accent),zIndex:2,transition:"all 0.3s","--pc":(p.color||T.accent)+"60",animation:isCurrent?"tl-pulse 2s infinite":"none"}}/>
          <div style={{fontSize:FS-1,fontWeight:800,color:isFuture?T.textMut:p.color||T.accent,textAlign:"center",marginTop:8,lineHeight:1.2}}>{p.title}</div>
          {p.date&&<div style={{fontSize:FS-3,color:T.textSec,marginTop:2}}>{p.date}</div>}
          {p.details&&p.details.length>0&&<div style={{marginTop:4,textAlign:"center"}}>
            {p.details.map((d,di)=><div key={di} style={{fontSize:FS-3,color:isFuture?T.textMut:T.textSec,lineHeight:1.4}}>{d}</div>)}
          </div>}
        </div>})}
    </div>
  </div>}

/* ──────── QRImg / QRScanner ──────── */
export function QRImg({text,size}){const[src,setSrc]=useState("");useEffect(()=>{if(!text)return;loadQR().then(QR=>{if(QR)QR.toDataURL(text,{width:size||120,margin:1,errorCorrectionLevel:"L",color:{dark:"#1E293B",light:"#FFFFFF"}}).then(setSrc).catch(()=>{})}).catch(()=>{})},[text,size]);return src?<img src={src} alt="QR" style={{width:size||120,height:size||120,borderRadius:8,border:"1px solid #E2E8F0"}}/>:null}

export function QRScanner({onScan,onClose}){
  const videoRef=useRef(null);
  const canvasRef=useRef(null);
  const streamRef=useRef(null);
  const[err,setErr]=useState("");
  const[scanning,setScanning]=useState(true);
  const[camReady,setCamReady]=useState(false);
  useEffect(()=>{
    let active=true;
    loadJsQR();/* preload jsQR while camera starts */
    const startCam=async()=>{
      try{
        const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment",width:{ideal:640},height:{ideal:480}}});
        if(!active){stream.getTracks().forEach(t=>t.stop());return}
        streamRef.current=stream;
        if(videoRef.current){videoRef.current.srcObject=stream;await videoRef.current.play();setCamReady(true)}
        const scan=async()=>{
          if(!active||!videoRef.current||!canvasRef.current)return;
          const v=videoRef.current;const c=canvasRef.current;
          if(v.readyState>=2){
            c.width=v.videoWidth;c.height=v.videoHeight;
            c.getContext("2d").drawImage(v,0,0);
            const qrResult=await scanQR(c);if(qrResult&&active){active=false;onScan(qrResult);return}
          }
          if(active)requestAnimationFrame(scan)
        };
        requestAnimationFrame(scan)
      }catch(e){setErr("لا يمكن فتح الكاميرا — تأكد من السماح بالوصول")}
    };
    startCam();
    return()=>{active=false;if(streamRef.current)streamRef.current.getTracks().forEach(t=>t.stop())}
  },[]);
  const stop=()=>{if(streamRef.current)streamRef.current.getTracks().forEach(t=>t.stop());onClose()};
  return<div style={{position:"fixed",inset:0,background:"#000",zIndex:99999,display:"flex",flexDirection:"column"}}>
    <div style={{padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",background:"rgba(0,0,0,0.8)"}}>
      <span style={{color:"#fff",fontWeight:700,fontSize:16}}>📷 مسح QR Code</span>
      <button onClick={stop} style={{background:"#EF4444",color:"#fff",border:"none",borderRadius:8,padding:"8px 20px",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✕ اغلاق</button>
    </div>
    <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
      {err?<div style={{color:"#fff",textAlign:"center",padding:20}}><div style={{fontSize:40,marginBottom:12}}>📷</div><div style={{fontSize:16}}>{err}</div></div>
      :<>
        {!camReady&&<div style={{position:"absolute",zIndex:2,color:"#fff",textAlign:"center",display:"flex",flexDirection:"column",alignItems:"center",gap:10}}><Spinner size="large" color="#fff"/><div style={{fontSize:14}}>جاري فتح الكاميرا...</div></div>}
        <video ref={videoRef} playsInline muted style={{width:"100%",height:"100%",objectFit:"cover",opacity:camReady?1:0,transition:"opacity 0.3s"}}/>
        <canvas ref={canvasRef} style={{display:"none"}}/>
        {camReady&&<><div style={{position:"absolute",top:"20%",left:"50%",transform:"translate(-50%,-50%)",width:220,height:220,border:"3px solid #10B981",borderRadius:16,boxShadow:"0 0 0 9999px rgba(0,0,0,0.4)"}}/>
        <div style={{position:"absolute",top:"38%",left:"50%",transform:"translateX(-50%)",color:"#fff",fontSize:14,fontWeight:600,background:"rgba(0,0,0,0.6)",padding:"8px 20px",borderRadius:10}}>وجّه الكاميرا على كود QR</div></>}
      </>}
    </div>
  </div>
}

/* ──────── useDebounced hook ──────── */
export function useDebounced(value,delay){
  const[d,setD]=useState(value);
  useEffect(()=>{const t=setTimeout(()=>setD(value),delay||250);return()=>clearTimeout(t)},[value,delay]);
  return d;
}

/* ──────── useWin hook ──────── */
export function useWin(){const[w,setW]=useState(typeof window!=="undefined"?window.innerWidth:1200);useEffect(()=>{const h=()=>setW(window.innerWidth);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h)},[]);return w}
