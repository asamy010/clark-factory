import { useState, useEffect, useCallback } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { auth, db } from "./firebase";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from "firebase/auth";
import { doc, setDoc, onSnapshot, collection, addDoc, updateDoc, deleteDoc, getDocs } from "firebase/firestore";

const FKEYS = ["A","B","C","D","E"];
const FCOL = ["#0EA5E9","#10B981","#F59E0B","#8B5CF6","#EF4444"];
const CPAL = ["#0EA5E9","#10B981","#F59E0B","#EF4444","#8B5CF6","#06B6D4","#D97706","#EC4899"];
const COLORS_DB = [
  {n:"ابيض",h:"#FFFFFF"},{n:"اسود",h:"#1a1a1a"},{n:"كحلي",h:"#1B2A4A"},{n:"رمادي",h:"#8B8B8B"},{n:"بيج",h:"#D4C5A9"},{n:"كريمي",h:"#FFF8DC"},
  {n:"احمر",h:"#C62828"},{n:"نبيتي",h:"#6A1B29"},{n:"برتقالي",h:"#E65100"},{n:"اصفر",h:"#F9A825"},{n:"زيتي",h:"#556B2F"},{n:"اخضر",h:"#2E7D32"},
  {n:"لبني",h:"#81D4FA"},{n:"سماوي",h:"#00ACC1"},{n:"ازرق",h:"#1565C0"},{n:"بنفسجي",h:"#6A1B9A"},{n:"موف",h:"#9C27B0"},{n:"روز",h:"#E91E63"},
  {n:"فوشيا",h:"#D81B60"},{n:"بني",h:"#5D4037"},{n:"كاكي",h:"#8D6E63"},{n:"منت",h:"#80CBC4"},{n:"مشمشي",h:"#FFAB91"},{n:"سلمون",h:"#EF9A9A"},
];

/* ── Light Glassmorphism Theme ── */
const T = {
  bg: "#EFF6FF", card: "rgba(255,255,255,0.85)", cardSolid: "#FFFFFF", glass: "rgba(255,255,255,0.6)",
  brd: "rgba(148,163,184,0.25)", brdStrong: "rgba(148,163,184,0.4)",
  accent: "#0EA5E9", accentDark: "#0284C7", accentBg: "rgba(14,165,233,0.08)",
  text: "#1E293B", textSec: "#64748B", textMut: "#94A3B8",
  ok: "#10B981", warn: "#F59E0B", err: "#EF4444", purple: "#8B5CF6",
  shadow: "0 4px 24px rgba(148,163,184,0.12)", shadowLg: "0 8px 40px rgba(148,163,184,0.18)",
};

const DEFAULT_STATUSES = [
  {id:1,name:"تم القص",color:"#0EA5E9"},{id:2,name:"في التشغيل",color:"#F59E0B"},
  {id:3,name:"ملغي",color:"#EF4444"},{id:4,name:"في الغسيل",color:"#EC4899"},
  {id:5,name:"تشطيب وتعبئة",color:"#10B981"},{id:6,name:"تم الشحن",color:"#059669"},
  {id:7,name:"شحن جزئي",color:"#D97706"},{id:8,name:"تشغيل خارجي",color:"#8B5CF6"},
];

const INIT_CONFIG = {
  fabrics:[{id:1,name:"قماش شعييرات مازيراتي",unit:"كيلو",price:170},{id:2,name:"قماش درببي مسحب ابيض",unit:"كيلو",price:170},{id:3,name:"قماش بسكوته تيشرت",unit:"كيلو",price:160},{id:4,name:"قماش كارس",unit:"متر",price:0},{id:5,name:"جبردين خفيف",unit:"متر",price:0}],
  accessories:[{id:1,name:"تشغيل من القص للتعبئة",unit:"قطعة",price:100},{id:2,name:"طباعة",unit:"قطعة",price:0},{id:3,name:"تطريز",unit:"قطعة",price:0},{id:4,name:"بادجات",unit:"قطعة",price:5},{id:5,name:"كباسين",unit:"قطعة",price:5},{id:6,name:"أستيك",unit:"قطعة",price:5},{id:7,name:"سوستة",unit:"قطعة",price:0},{id:8,name:"دوبار",unit:"قطعة",price:10},{id:9,name:"شماعة",unit:"قطعة",price:8},{id:10,name:"كفر",unit:"قطعة",price:3},{id:11,name:"كرتونة",unit:"قطعة",price:3},{id:12,name:"تكاليف أخرى",unit:"قطعة",price:10},{id:13,name:"تسويق",unit:"قطعة",price:10}],
  sizeSets:[{id:1,label:"6-9M - 9-12M - 12-18M"},{id:2,label:"2-3-4-5"},{id:3,label:"6-8-10-12"},{id:4,label:"M-L-XL-2XL"},{id:5,label:"L-XL-2XL-3XL"},{id:6,label:"FREE SIZE"},{id:7,label:"4-6-8-10-12"},{id:8,label:"S/L/M/XL"}],
  statusCards: DEFAULT_STATUSES,
  workshops:["CLARK","ورشة محمود","ورشة عماد الدين","المصنع","ابو جاسم","ورشه ماهر"],
  seasons:["WS26"], activeSeason:"WS26", logo:"", users:{}, usersList:[],
};

const ROLES = {admin:"مدير النظام",manager:"مدير انتاج",viewer:"مشاهد فقط"};
function loadUsers(){try{return JSON.parse(localStorage.getItem("clark-users"))||[{username:"admin",password:"admin123",name:"المدير"}]}catch(e){return[]}}
function gid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6)}
function fmt(n){return Number(n||0).toLocaleString("en-US")}
function r2(n){return Math.round((n||0)*100)/100}
function sqty(a){return(a||[]).reduce((s,c)=>s+(Number(c.qty)||0),0)}
function slay(a){return(a||[]).reduce((s,c)=>s+(Number(c.layers)||0),0)}
function setF(o,k,v){const c=JSON.parse(JSON.stringify(o));c[k]=v;return c}
function gf(o,k,s){return o["fabric"+k+(s||"")]}
function gc(o,k){return o["colors"+k]||[]}
function gcons(o,k){return parseFloat(o["cons"+k])||0}
function gdate(o,k){return o["cutDate"+k]||""}
function useWin(){const[w,setW]=useState(typeof window!=="undefined"?window.innerWidth:1200);useEffect(()=>{const h=()=>setW(window.innerWidth);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h)},[]);return w}
function getStatusColor(name,cards){const c=(cards||DEFAULT_STATUSES).find(s=>s.name===name);return c?c.color:"#94A3B8"}

function compressImage(file,maxW,quality){
  return new Promise((resolve)=>{const reader=new FileReader();reader.onload=(e)=>{const img=new Image();img.onload=()=>{
    const canvas=document.createElement("canvas");let w=img.width,h=img.height;const max=maxW||300;
    if(w>max||h>max){if(w>h){h=Math.round(h*max/w);w=max}else{w=Math.round(w*max/h);h=max}}
    const tr=3/4,cr=w/h;let cw=w,ch=h,sx=0,sy=0;
    if(cr>tr){cw=Math.round(h*tr);sx=Math.round((w-cw)/2)}else{ch=Math.round(w/tr);sy=Math.round((h-ch)/2)}
    canvas.width=cw;canvas.height=ch;const ctx=canvas.getContext("2d");
    const scX=img.width/w,scY=img.height/h;
    ctx.drawImage(img,sx*scX,sy*scY,cw*scX,ch*scY,0,0,cw,ch);
    resolve(canvas.toDataURL("image/jpeg",quality||0.5))};img.src=e.target.result};reader.readAsDataURL(file)})
}

function compressFile(file){
  return new Promise((resolve)=>{
    if(file.size>500000){resolve(null);return}
    const reader=new FileReader();reader.onload=(e)=>resolve({name:file.name,type:file.type,data:e.target.result,size:file.size});reader.readAsDataURL(file)
  })
}

function calcOrder(o){
  const mainCut=sqty(gc(o,"A"))||o.cutQty||0;let totalFab=0;const fp=[];
  FKEYS.forEach(k=>{if(!gf(o,k))return;const cost=gcons(o,k)*(gf(o,k,"Price")||0)*slay(gc(o,k));totalFab+=cost;fp.push(mainCut?r2(cost/mainCut):0)});
  const fabPer=fp.reduce((s,v)=>s+v,0);const accPer=(o.accItems||[]).reduce((s,a)=>s+(a.price||0),0);
  return{cutQty:mainCut,totalFab,fabPer:r2(fabPer),accPer,accAll:accPer*mainCut,costPer:r2(fabPer+accPer),costAll:r2(totalFab+accPer*mainCut),balance:mainCut-(o.deliveredQty||0)}
}

function mkOrder(){
  const today=new Date().toISOString().split("T")[0];
  const o={id:gid(),date:today,modelNo:"",modelDesc:"",sizeSetId:"",sizeLabel:"",workshop:"",status:"تم القص",cutQty:0,deliveredQty:0,accItems:[],deliveries:[],image:"",instructions:"",attachments:[]};
  FKEYS.forEach(k=>{o["fabric"+k]="";o["cons"+k]=0;o["cutDate"+k]=today;o["colors"+k]=k==="A"?[{color:"",colorHex:"",layers:0,pcsPerLayer:0,qty:0}]:[];o["fabric"+k+"Label"]="";o["fabric"+k+"Price"]=0;o["fabric"+k+"Unit"]=""});
  return o
}

function validateOrder(form){
  const e=[];
  if(!form.modelNo.trim())e.push("رقم الموديل مطلوب");
  if(!form.modelDesc.trim())e.push("وصف الموديل مطلوب");
  if(!form.sizeSetId)e.push("المقاسات مطلوبة");
  if(!form.date)e.push("التاريخ مطلوب");
  if(!form.fabricA)e.push("خامة A مطلوبة");
  else{const ca=form.colorsA||[];if(ca.length===0||!ca[0].color)e.push("لون خامة A مطلوب");if(ca.length>0&&(!ca[0].layers||ca[0].layers<=0))e.push("عدد الراقات مطلوب");if(ca.length>0&&(!ca[0].pcsPerLayer||ca[0].pcsPerLayer<=0))e.push("القطع/راق مطلوب");if(!gcons(form,"A")||gcons(form,"A")<=0)e.push("استهلاك خامة A مطلوب")}
  return e
}

function exportPDF(elementId,title){
  const el=document.getElementById(elementId);if(!el)return;
  const pw=window.open("","_blank");if(!pw)return;
  pw.document.write("<!DOCTYPE html><html dir='rtl'><head><meta charset='utf-8'/><title>"+title+"</title><style>body{font-family:Arial,sans-serif;padding:30px;font-size:13px;direction:rtl;color:#1E293B;background:#fff}table{width:100%;border-collapse:collapse;margin:14px 0}th,td{border:1px solid #E2E8F0;padding:10px 12px;text-align:right}th{background:#F1F5F9;font-weight:700;font-size:11px;color:#475569}h1{font-size:22px;color:#0284C7;margin:0 0 6px}h2{font-size:16px;color:#334155;margin:0 0 16px}img{max-width:140px;border-radius:10px}.metric{display:inline-block;padding:12px 20px;margin:4px;border:1px solid #E2E8F0;border-radius:10px;text-align:center;min-width:120px}.metric-val{font-size:22px;font-weight:700;color:#0284C7}.metric-label{font-size:10px;color:#64748B;margin-top:4px}@media print{body{padding:15px}}</style></head><body>");
  pw.document.write(el.innerHTML);
  pw.document.write("</body></html>");pw.document.close();
  pw.onload=()=>{pw.focus();pw.print()}
}

/* ── UI Components (Light Glassmorphism) ── */
const FS=15;
const TH={textAlign:"right",padding:"12px 14px",fontSize:FS-3,fontWeight:600,color:T.textSec,whiteSpace:"nowrap",borderBottom:"2px solid "+T.brd,background:"#F8FAFC",textTransform:"uppercase",letterSpacing:"0.04em"};
const TD={padding:"12px 14px",fontSize:FS,color:T.text,borderBottom:"1px solid "+T.brd,verticalAlign:"middle"};
const TDB={...TD,fontWeight:600};
const TDL={...TD,color:T.textSec,width:100};

function Badge({t,cards}){const col=getStatusColor(t,cards);return<span style={{padding:"5px 14px",borderRadius:20,fontSize:FS-2,fontWeight:600,background:col+"18",color:col,border:"1px solid "+col+"30"}}>{t}</span>}

function Btn({children,on,primary,danger,ghost,onClick,small,disabled,style:sx}){
  let bg=T.cardSolid,fg=T.text,bd="1px solid "+T.brd;
  if(on||primary){bg="linear-gradient(135deg,#0EA5E9,#0284C7)";fg="#fff";bd="none"}
  if(danger){bg=T.err+"12";fg=T.err;bd="1px solid "+T.err+"30"}
  if(ghost){bg="transparent";bd="none";fg=T.textSec}
  return<button onClick={onClick} disabled={disabled} style={{padding:small?"6px 14px":"10px 22px",borderRadius:10,fontSize:small?FS-2:FS,fontWeight:600,background:bg,color:fg,border:bd,cursor:disabled?"default":"pointer",fontFamily:"inherit",opacity:disabled?0.5:1,boxShadow:primary?"0 2px 12px rgba(14,165,233,0.3)":"none",...(sx||{})}}>{children}</button>
}

function Inp({value,onChange,placeholder,type,step,style:sx,readOnly}){
  return<input type={type||"text"} step={step||"any"} value={value==null?"":value} readOnly={readOnly} onChange={e=>onChange&&onChange(e.target.value)} placeholder={placeholder} style={{width:"100%",padding:"10px 14px",borderRadius:10,border:"1.5px solid "+T.brd,fontSize:FS,fontFamily:"inherit",background:readOnly?"#F8FAFC":T.cardSolid,color:T.text,boxSizing:"border-box",outline:"none",transition:"border-color 0.2s",...(sx||{})}}/>
}

function Sel({value,onChange,children}){
  return<select value={value==null?"":value} onChange={e=>onChange(e.target.value)} style={{width:"100%",padding:"10px 14px",borderRadius:10,border:"1.5px solid "+T.brd,fontSize:FS,fontFamily:"inherit",background:T.cardSolid,color:T.text,boxSizing:"border-box"}}>{children}</select>
}

function Card({children,title,extra,accent,style:sx}){
  return<div style={{background:T.card,backdropFilter:"blur(12px)",borderRadius:16,border:"1px solid "+T.brd,boxShadow:T.shadow,overflow:"visible",...(sx||{})}}>
    {(title||extra)&&<div style={{padding:"16px 22px",borderBottom:"1px solid "+T.brd,display:"flex",justifyContent:"space-between",alignItems:"center",background:accent||"rgba(248,250,252,0.8)",borderRadius:"16px 16px 0 0"}}><span style={{fontSize:FS+1,fontWeight:700,color:accent?"#fff":T.text}}>{title}</span>{extra}</div>}
    <div style={{padding:22}}>{children}</div>
  </div>
}

function MetricCard({label,value,color,icon,sub}){
  return<div style={{background:T.card,backdropFilter:"blur(12px)",borderRadius:16,padding:"22px 24px",border:"1px solid "+T.brd,boxShadow:T.shadow,display:"flex",alignItems:"center",gap:16}}>
    <div style={{width:52,height:52,borderRadius:14,background:(color||T.accent)+"12",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0,boxShadow:"0 2px 8px "+(color||T.accent)+"20"}}>{icon}</div>
    <div style={{flex:1}}>
      <div style={{fontSize:FS-2,color:T.textSec,marginBottom:4,fontWeight:500}}>{label}</div>
      <div style={{fontSize:28,fontWeight:800,color:color||T.text,letterSpacing:"-0.02em"}}>{value}</div>
      {sub&&<div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>{sub}</div>}
    </div>
  </div>
}

function PBar({value,color}){return<div style={{height:10,borderRadius:5,background:"#E2E8F0",overflow:"hidden",marginTop:8}}><div style={{height:"100%",width:Math.min(value,100)+"%",borderRadius:5,background:color||"linear-gradient(90deg,#0EA5E9,#06B6D4)",transition:"width 0.6s"}}/></div>}

function ColorPicker({value,colorHex,onSelect}){
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

function FCTable({label,fabName,colors,setColors,accent,readOnly}){
  const tQ=sqty(colors),tL=slay(colors);
  const addC=()=>setColors([...colors,{color:"",colorHex:"",layers:0,pcsPerLayer:0,qty:0}]);
  const upC=(i,fld,val)=>{const nc=colors.map((c,j)=>{if(j!==i)return c;const u={...c};u[fld]=(fld==="color"||fld==="colorHex")?val:(Number(val)||0);if(fld==="layers"||fld==="pcsPerLayer")u.qty=(Number(u.layers)||0)*(Number(u.pcsPerLayer)||0);return u});setColors(nc)};
  return<div style={{border:"1px solid "+T.brd,borderRadius:14,overflow:"visible",marginBottom:12,boxShadow:"0 2px 8px rgba(0,0,0,0.04)"}}>
    <div style={{padding:"10px 16px",background:accent,display:"flex",justifyContent:"space-between",alignItems:"center",borderRadius:"14px 14px 0 0",flexWrap:"wrap",gap:8}}>
      <span style={{fontSize:FS,fontWeight:700,color:"#fff"}}>{label+": "+(fabName||"")}</span>
      <div style={{display:"flex",gap:8}}><span style={{fontSize:FS-2,color:"#fff",background:"rgba(255,255,255,0.25)",padding:"4px 14px",borderRadius:20,fontWeight:600}}>{"راقات: "+tL}</span><span style={{fontSize:FS-2,color:"#fff",background:"rgba(255,255,255,0.25)",padding:"4px 14px",borderRadius:20,fontWeight:600}}>{"قطع: "+tQ}</span></div>
    </div>
    <div style={{padding:12,overflowX:"auto"}}>
      <table style={{width:"100%",borderCollapse:"collapse",minWidth:450}}>
        <thead><tr><th style={{...TH,background:"transparent"}}>اللون</th><th style={{...TH,background:"transparent"}}>الراقات</th><th style={{...TH,background:"transparent"}}>القطع/راق</th><th style={{...TH,background:"transparent"}}>الكمية</th>{!readOnly&&<th style={{...TH,background:"transparent"}}> </th>}</tr></thead>
        <tbody>{colors.map((c,i)=><tr key={i}>
          <td style={{...TD,minWidth:160,overflow:"visible"}}>{readOnly?<div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:22,height:22,borderRadius:6,background:c.colorHex||"#E2E8F0",border:"1px solid #E2E8F0",flexShrink:0}}/><span style={{fontWeight:500}}>{c.color||"-"}</span></div>:<ColorPicker value={c.color} colorHex={c.colorHex} onSelect={(nm,hx)=>{const nc=colors.map((cc,jj)=>jj===i?{...cc,color:nm,colorHex:hx}:cc);setColors(nc)}}/>}</td>
          <td style={{...TD,width:100}}>{readOnly?c.layers:<Inp type="number" value={c.layers} onChange={v=>upC(i,"layers",v)}/>}</td>
          <td style={{...TD,width:100}}>{readOnly?(c.pcsPerLayer||"-"):<Inp type="number" value={c.pcsPerLayer} onChange={v=>upC(i,"pcsPerLayer",v)}/>}</td>
          <td style={{...TDB,width:80,background:"#F0F9FF",textAlign:"center",borderRadius:6,color:T.accent}}>{c.qty}</td>
          {!readOnly&&<td style={{...TD,width:40}}><Btn danger small onClick={()=>setColors(colors.filter((_,j)=>j!==i))}>x</Btn></td>}
        </tr>)}</tbody>
      </table>
      {!readOnly&&<Btn ghost small onClick={addC} style={{marginTop:6,color:accent}}>+ لون جديد</Btn>}
    </div>
  </div>
}

function AccPicker({accItems,dbAcc,onChange}){
  const[selId,setSelId]=useState("");
  const available=dbAcc.filter(a=>!accItems.find(x=>x.accId===a.id));
  const addAcc=()=>{if(!selId)return;const acc=dbAcc.find(a=>a.id===Number(selId));if(!acc)return;onChange([...accItems,{accId:acc.id,name:acc.name,unit:acc.unit,price:acc.price}]);setSelId("")};
  return<div>
    <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
      <div style={{flex:1,minWidth:200}}><Sel value={selId} onChange={setSelId}><option value="">-- اختر بند اكسسوار --</option>{available.map(a=><option key={a.id} value={a.id}>{a.name+" - "+a.price+" ج.م"}</option>)}</Sel></div>
      <Btn primary onClick={addAcc}>+ اضافة</Btn>
    </div>
    {accItems.length>0&&<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:400}}><thead><tr>{["الوصف","الوحدة","السعر",""].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
      {accItems.map((a,i)=><tr key={i}><td style={{...TD,fontWeight:600}}>{a.name}</td><td style={TD}>{a.unit}</td><td style={TD}><Inp type="number" value={a.price} onChange={v=>{const n=[...accItems];n[i]={...n[i],price:Number(v)||0};onChange(n)}} style={{width:90}}/></td><td style={TD}><Btn danger small onClick={()=>onChange(accItems.filter((_,j)=>j!==i))}>x</Btn></td></tr>)}
    </tbody></table></div>}
  </div>
}

/* ══ LOGIN ══ */
function LoginScreen(){
  const[email,setEmail]=useState("");const[pass,setPass]=useState("");const[name,setName]=useState("");
  const[err,setErr]=useState("");const[isReg,setIsReg]=useState(false);const[loading,setLoading]=useState(false);
  const handleLogin=async()=>{if(!email||!pass){setErr("ادخل الايميل وكلمة المرور");return}setLoading(true);setErr("");try{await signInWithEmailAndPassword(auth,email,pass)}catch(e){setErr(e.code==="auth/invalid-credential"?"بيانات الدخول غلط":"خطأ: "+e.message)}setLoading(false)};
  const handleReg=async()=>{if(!email||!pass||!name){setErr("اكمل كل البيانات");return}if(pass.length<6){setErr("كلمة المرور 6 حروف على الأقل");return}setLoading(true);setErr("");try{const cred=await createUserWithEmailAndPassword(auth,email,pass);await updateProfile(cred.user,{displayName:name})}catch(e){setErr(e.code==="auth/email-already-in-use"?"الايميل مستخدم":"خطأ: "+e.message)}setLoading(false)};
  const iS={width:"100%",padding:"14px 16px",borderRadius:14,border:"2px solid "+T.brd,fontSize:FS+1,fontFamily:"inherit",boxSizing:"border-box",background:T.cardSolid,color:T.text,outline:"none"};
  return<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#EFF6FF,#DBEAFE,#E0F2FE)",direction:"rtl",fontFamily:"var(--font-sans)",padding:20}}>
    <div style={{width:"100%",maxWidth:420,background:T.card,backdropFilter:"blur(20px)",borderRadius:28,padding:44,border:"1px solid "+T.brd,boxShadow:T.shadowLg}}>
      <div style={{textAlign:"center",marginBottom:36}}>
        <div style={{fontSize:48,fontWeight:800,background:"linear-gradient(135deg,#0EA5E9,#0284C7)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",letterSpacing:8}}>CLARK</div>
        <div style={{fontSize:FS,color:T.textSec,marginTop:6}}>نظام ادارة القص والتشغيل</div>
      </div>
      {!isReg?<div>
        <div style={{marginBottom:16}}><label style={{display:"block",fontSize:FS,color:T.textSec,marginBottom:6,fontWeight:600}}>البريد الالكتروني</label><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="example@email.com" type="email" onKeyDown={e=>e.key==="Enter"&&handleLogin()} style={iS}/></div>
        <div style={{marginBottom:20}}><label style={{display:"block",fontSize:FS,color:T.textSec,marginBottom:6,fontWeight:600}}>كلمة المرور</label><input type="password" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleLogin()} style={iS}/></div>
        {err&&<div style={{color:T.err,fontSize:FS,marginBottom:12,textAlign:"center",fontWeight:600}}>{err}</div>}
        <button onClick={handleLogin} disabled={loading} style={{width:"100%",padding:16,borderRadius:14,background:"linear-gradient(135deg,#0EA5E9,#0284C7)",color:"#fff",fontSize:FS+2,fontWeight:800,border:"none",cursor:"pointer",marginBottom:14,boxShadow:"0 4px 16px rgba(14,165,233,0.3)"}}>{loading?"جاري الدخول...":"تسجيل الدخول"}</button>
        <div style={{textAlign:"center"}}><span style={{color:T.textSec}}>مستخدم جديد؟ </span><span onClick={()=>{setIsReg(true);setErr("")}} style={{color:T.accent,cursor:"pointer",fontWeight:700}}>انشاء حساب</span></div>
      </div>:<div>
        <div style={{marginBottom:14}}><label style={{display:"block",fontSize:FS,color:T.textSec,marginBottom:6,fontWeight:600}}>الاسم</label><input value={name} onChange={e=>setName(e.target.value)} style={iS}/></div>
        <div style={{marginBottom:14}}><label style={{display:"block",fontSize:FS,color:T.textSec,marginBottom:6,fontWeight:600}}>البريد الالكتروني</label><input value={email} onChange={e=>setEmail(e.target.value)} type="email" style={iS}/></div>
        <div style={{marginBottom:20}}><label style={{display:"block",fontSize:FS,color:T.textSec,marginBottom:6,fontWeight:600}}>كلمة المرور</label><input type="password" value={pass} onChange={e=>setPass(e.target.value)} style={iS}/></div>
        {err&&<div style={{color:T.err,fontSize:FS,marginBottom:12,textAlign:"center"}}>{err}</div>}
        <button onClick={handleReg} disabled={loading} style={{width:"100%",padding:16,borderRadius:14,background:"linear-gradient(135deg,#0EA5E9,#0284C7)",color:"#fff",fontSize:FS+2,fontWeight:800,border:"none",cursor:"pointer",marginBottom:14}}>{loading?"جاري الانشاء...":"انشاء حساب"}</button>
        <div style={{textAlign:"center"}}><span onClick={()=>{setIsReg(false);setErr("")}} style={{color:T.accent,cursor:"pointer",fontWeight:700}}>عودة لتسجيل الدخول</span></div>
      </div>}
    </div>
  </div>
}

const TABS=[{key:"dashboard",label:"لوحة التحكم"},{key:"db",label:"قاعدة البيانات"},{key:"orders",label:"أوامر القص"},{key:"details",label:"تفاصيل الأوردر"},{key:"search",label:"بحث"},{key:"report",label:"تقرير الإنتاج"},{key:"cost",label:"التكاليف"},{key:"settings",label:"الاعدادات"}];

/* ══ MAIN APP ══ */
export default function App(){
  const[user,setUser]=useState(null);const[authLoading,setAuthLoading]=useState(true);
  const[config,setConfig]=useState(INIT_CONFIG);const[orders,setOrders]=useState([]);const[dataLoading,setDataLoading]=useState(true);
  const[tab,setTab]=useState("dashboard");const[sel,setSel]=useState(null);const[sideOpen,setSideOpen]=useState(true);
  const w=useWin();const isMob=w<768;const season=config.activeSeason||"WS26";

  useEffect(()=>{const unsub=onAuthStateChanged(auth,u=>{setUser(u);setAuthLoading(false)});return unsub},[]);
  useEffect(()=>{if(!user)return;const unsub=onSnapshot(doc(db,"factory","config"),snap=>{if(snap.exists())setConfig(snap.data());else setDoc(doc(db,"factory","config"),INIT_CONFIG)});return()=>unsub()},[user]);
  useEffect(()=>{if(!user||!season)return;setDataLoading(true);const unsub=onSnapshot(collection(db,"seasons",season,"orders"),snap=>{setOrders(snap.docs.map(d=>({_docId:d.id,...d.data()})));setDataLoading(false)});return()=>unsub()},[user,season]);
  useEffect(()=>{if(isMob)setSideOpen(false)},[isMob]);

  const upConfig=useCallback(fn=>{setConfig(prev=>{const next=JSON.parse(JSON.stringify(prev));fn(next);setDoc(doc(db,"factory","config"),next);return next})},[]);
  const addOrder=async o=>{await addDoc(collection(db,"seasons",season,"orders"),o)};
  const updOrder=async(orderId,fn)=>{const ord=orders.find(o=>o.id===orderId);if(!ord)return;const updated=JSON.parse(JSON.stringify(ord));fn(updated);const clean={...updated};delete clean._docId;await updateDoc(doc(db,"seasons",season,"orders",ord._docId),clean)};
  const delOrder=async orderId=>{const ord=orders.find(o=>o.id===orderId);if(ord)await deleteDoc(doc(db,"seasons",season,"orders",ord._docId))};
  const replaceOrder=async(orderId,newData)=>{const ord=orders.find(o=>o.id===orderId);if(!ord)return;const clean={...newData};delete clean._docId;await setDoc(doc(db,"seasons",season,"orders",ord._docId),clean)};
  const goD=id=>{setSel(id);setTab("details");if(isMob)setSideOpen(false)};

  const data={...config,orders};
  const getUserRole=()=>{if(config.users&&config.users[user?.uid])return config.users[user.uid];const byEmail=(config.usersList||[]).find(u=>u.email===user?.email);if(byEmail)return byEmail.role;return"admin"};
  const userRole=getUserRole();const canEdit=userRole==="admin"||userRole==="manager";
  const statusCards=config.statusCards||DEFAULT_STATUSES;

  if(authLoading)return<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:T.bg,color:T.accent,fontSize:20,fontWeight:700}}>جاري التحميل...</div>;
  if(!user)return<LoginScreen/>;
  if(dataLoading)return<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:T.bg,color:T.accent,fontSize:20,fontWeight:700,direction:"rtl"}}>{"جاري تحميل بيانات "+season+"..."}</div>;
  const userName=user.displayName||user.email.split("@")[0];

  return<div style={{display:"flex",minHeight:"100vh",direction:"rtl",fontFamily:"var(--font-sans)",background:T.bg,color:T.text,fontSize:FS}}>
    {isMob&&sideOpen&&<div onClick={()=>setSideOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.3)",zIndex:998}}/>}
    <nav style={{width:isMob?(sideOpen?260:0):(sideOpen?230:56),background:T.cardSolid,borderLeft:"1px solid "+T.brd,boxShadow:"4px 0 20px rgba(0,0,0,0.04)",flexShrink:0,display:"flex",flexDirection:"column",transition:"width 0.3s",overflow:"hidden",position:isMob?"fixed":"relative",right:0,top:0,bottom:0,zIndex:999}}>
      <div style={{padding:"20px 18px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid "+T.brd}}>
        {sideOpen&&<div style={{display:"flex",alignItems:"center",gap:10}}>{config.logo&&<img src={config.logo} alt="" style={{width:36,height:36,borderRadius:8,objectFit:"cover"}}/>}<div><div style={{fontWeight:800,fontSize:22,color:T.accent,letterSpacing:4}}>CLARK</div><div style={{fontSize:9,color:T.textMut}}>ONLINE</div></div></div>}
        <div onClick={()=>setSideOpen(!sideOpen)} style={{cursor:"pointer",color:T.accent,fontSize:22}}>{"☰"}</div>
      </div>
      {sideOpen&&<div style={{padding:"8px 10px",flex:1,overflowY:"auto"}}>
        {TABS.filter(t=>t.key!=="settings"||userRole==="admin").map(t=><button key={t.key} onClick={()=>{setTab(t.key);if(isMob)setSideOpen(false)}} style={{display:"block",width:"100%",textAlign:"right",padding:"12px 16px",border:"none",cursor:"pointer",borderRadius:12,marginBottom:2,background:tab===t.key?T.accentBg:"transparent",color:tab===t.key?T.accent:T.textSec,fontSize:FS,fontWeight:tab===t.key?700:400,fontFamily:"inherit"}}>{t.label}</button>)}
      </div>}
      {sideOpen&&<div style={{padding:"14px 18px",borderTop:"1px solid "+T.brd}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><div style={{fontSize:11,color:T.textMut}}>{"مرحبا، "+userName}</div><div style={{fontSize:18,fontWeight:700,color:T.accent}}>{season}</div></div>
          <button onClick={()=>signOut(auth)} style={{padding:"6px 14px",borderRadius:8,background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30",cursor:"pointer",fontSize:FS-2,fontWeight:600}}>خروج</button>
        </div>
      </div>}
    </nav>
    <main style={{flex:1,padding:isMob?14:28,overflow:"auto",minWidth:0}}>
      {isMob&&!sideOpen&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><div onClick={()=>setSideOpen(true)} style={{cursor:"pointer",fontSize:24,color:T.accent}}>{"☰"}</div><span style={{fontSize:FS,color:T.textSec,fontWeight:600}}>{TABS.find(t=>t.key===tab)?.label}</span><span style={{fontSize:12,color:T.textMut}}>{season}</span></div>}
      {tab==="dashboard"&&<DashPg data={data} goD={goD} isMob={isMob} season={season} statusCards={statusCards}/>}
      {tab==="db"&&<DBPg data={data} upConfig={upConfig} isMob={isMob} canEdit={canEdit} statusCards={statusCards}/>}
      {tab==="orders"&&<OrdPg data={data} addOrder={addOrder} delOrder={delOrder} goD={goD} isMob={isMob} canEdit={canEdit} statusCards={statusCards}/>}
      {tab==="details"&&<DetPg data={data} updOrder={updOrder} replaceOrder={replaceOrder} sel={sel} setSel={setSel} isMob={isMob} canEdit={canEdit} statusCards={statusCards}/>}
      {tab==="search"&&<SearchPg data={data} goD={goD} isMob={isMob} season={season} statusCards={statusCards}/>}
      {tab==="report"&&<RepPg data={data} isMob={isMob} season={season} statusCards={statusCards}/>}
      {tab==="cost"&&<CostPg data={data} isMob={isMob} statusCards={statusCards}/>}
      {tab==="settings"&&<SettingsPg config={config} upConfig={upConfig} isMob={isMob} user={user}/>}
    </main>
  </div>
}

/* ══ DASHBOARD ══ */
function DashPg({data,goD,isMob,season,statusCards}){
  const orders=data.orders;
  const cutQ=orders.reduce((s,o)=>s+calcOrder(o).cutQty,0);
  const delQ=orders.reduce((s,o)=>s+(o.deliveredQty||0),0);
  const comp=cutQ?Math.round((delQ/cutQ)*100):0;
  const withWs=orders.filter(o=>(o.status==="في التشغيل"||o.status==="تشغيل خارجي")&&o.workshop);
  const inProdQty=withWs.reduce((s,o)=>s+calcOrder(o).cutQty,0);
  const noWs=orders.filter(o=>(o.status==="في التشغيل"||o.status==="تشغيل خارجي")&&!o.workshop);
  const underProdQty=noWs.reduce((s,o)=>s+calcOrder(o).cutQty,0);
  const sc={};orders.forEach(o=>{sc[o.status]=(sc[o.status]||0)+1});
  const pieData=Object.entries(sc).map(([name,value])=>({name,value,fill:getStatusColor(name,statusCards)}));
  const recent=orders.slice().reverse().slice(0,6);

  return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:28,flexWrap:"wrap",gap:10}}>
      <div style={{display:"flex",alignItems:"center",gap:14}}>
        {data.logo&&<img src={data.logo} alt="" style={{width:56,height:56,borderRadius:14,objectFit:"cover",border:"2px solid "+T.brd,boxShadow:T.shadow}}/>}
        <div><h1 style={{fontSize:isMob?24:32,fontWeight:800,margin:0,color:T.text}}>لوحة التحكم</h1><div style={{fontSize:FS,color:T.textSec,marginTop:2}}>{"الموسم "+season+" - "+orders.length+" موديل"}</div></div>
      </div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"repeat(3,1fr)",gap:16,marginBottom:28}}>
      <MetricCard label="اجمالي كمية القص" value={fmt(cutQ)} icon="✂️" color={T.accent} sub="قطعة"/>
      <MetricCard label="تسليم مخزن جاهز" value={fmt(delQ)} icon="📦" color={T.ok} sub="قطعة"/>
      <MetricCard label="رصيد بالمصنع" value={fmt(cutQ-delQ)} icon="🏭" color={T.warn} sub="قطعة"/>
    </div>
    <div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"repeat(3,1fr)",gap:16,marginBottom:28}}>
      <MetricCard label="في التشغيل (بورشة)" value={fmt(inProdQty)} icon="⚙️" color="#8B5CF6" sub={withWs.length+" موديل"}/>
      <MetricCard label="تحت التشغيل (بدون ورشة)" value={fmt(underProdQty)} icon="⏳" color="#EC4899" sub={noWs.length+" موديل"}/>
      <div style={{background:T.card,backdropFilter:"blur(12px)",borderRadius:16,padding:"22px 24px",border:"1px solid "+T.brd,boxShadow:T.shadow}}>
        <div style={{fontSize:FS,color:T.textSec,marginBottom:8,fontWeight:600}}>معدل الانجاز</div>
        <div style={{fontSize:38,fontWeight:800,color:T.accent}}>{comp+"%"}</div>
        <PBar value={comp}/>
      </div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:16,marginBottom:24}}>
      <Card title="توزيع الحالات">{pieData.length>0?<div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
        <ResponsiveContainer width={isMob?"100%":160} height={160}><PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={68} paddingAngle={3} dataKey="value" stroke="none">{pieData.map((d,i)=><Cell key={i} fill={d.fill}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer>
        <div style={{flex:1,minWidth:120}}>{pieData.map((d,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",fontSize:FS}}><span style={{width:12,height:12,borderRadius:4,background:d.fill,flexShrink:0}}/><span style={{color:T.textSec,flex:1}}>{d.name}</span><span style={{fontWeight:700}}>{d.value}</span></div>)}</div>
      </div>:<p style={{color:T.textSec,textAlign:"center",padding:30}}>لا توجد بيانات</p>}</Card>
      <Card title="آخر الأوامر"><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:400}}>
        <thead><tr>{["موديل","الوصف","الكمية","الحالة"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
        <tbody>{recent.map(o=>{const t=calcOrder(o);return<tr key={o.id} style={{cursor:"pointer"}} onClick={()=>goD(o.id)}><td style={TDB}>{o.modelNo}</td><td style={TD}>{o.modelDesc}</td><td style={{...TDB,color:T.accent}}>{t.cutQty}</td><td style={TD}><Badge t={o.status} cards={statusCards}/></td></tr>})}
          {recent.length===0&&<tr><td colSpan={4} style={{...TD,textAlign:"center",color:T.textSec,padding:40}}>لا توجد أوامر</td></tr>}
        </tbody>
      </table></div></Card>
    </div>
  </div>
}

/* ══ DB ══ */
function DBPg({data,upConfig,isMob,canEdit,statusCards}){
  const[sub,setSub]=useState("fab");const[ff,setFf]=useState({name:"",unit:"كيلو",price:""});
  const[af,setAf]=useState({name:"",unit:"قطعة",price:""});const[sfld,setSfld]=useState({label:""});const[wf,setWf]=useState("");
  const[stName,setStName]=useState("");const[stColor,setStColor]=useState("#0EA5E9");
  return<div>
    <h1 style={{fontSize:isMob?24:32,fontWeight:800,margin:"0 0 20px"}}>قاعدة البيانات</h1>
    <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>{[["fab","الأقمشة"],["acc","الاكسسوار"],["size","المقاسات"],["ws","الورش"],["status","حالات الأوردر"]].map(([k,l])=><Btn key={k} on={sub===k} onClick={()=>setSub(k)}>{l}</Btn>)}</div>
    {sub==="fab"&&<Card title="جدول الأقمشة">{canEdit&&<div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"3fr 1fr 1fr auto",gap:10,marginBottom:16}}><Inp value={ff.name} onChange={v=>setFf({...ff,name:v})} placeholder="اسم القماش"/><Sel value={ff.unit} onChange={v=>setFf({...ff,unit:v})}><option value="كيلو">كيلو</option><option value="متر">متر</option><option value="يارد">يارد</option></Sel><Inp value={ff.price} onChange={v=>setFf({...ff,price:v})} placeholder="السعر" type="number"/><Btn primary onClick={()=>{if(!ff.name)return;upConfig(d=>d.fabrics.push({id:Date.now(),name:ff.name,unit:ff.unit,price:Number(ff.price)||0}));setFf({name:"",unit:"كيلو",price:""})}}>+ اضافة</Btn></div>}
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:450}}><thead><tr>{["#","القماش","الوحدة","السعر",...(canEdit?[""]:[])] .map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>{data.fabrics.map((f,i)=><tr key={f.id}><td style={TD}>{i+1}</td><td style={{...TD,fontWeight:600}}>{f.name}</td><td style={TD}>{f.unit}</td><td style={{...TDB,color:T.accent}}>{f.price+" ج.م"}</td>{canEdit&&<td style={TD}><Btn danger small onClick={()=>upConfig(d=>{d.fabrics=d.fabrics.filter(x=>x.id!==f.id)})}>حذف</Btn></td>}</tr>)}</tbody></table></div></Card>}
    {sub==="acc"&&<Card title="الاكسسوار">{canEdit&&<div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"3fr 1fr 1fr auto",gap:10,marginBottom:16}}><Inp value={af.name} onChange={v=>setAf({...af,name:v})} placeholder="الوصف"/><Sel value={af.unit} onChange={v=>setAf({...af,unit:v})}><option value="قطعة">قطعة</option><option value="متر">متر</option></Sel><Inp value={af.price} onChange={v=>setAf({...af,price:v})} placeholder="السعر" type="number"/><Btn primary onClick={()=>{if(!af.name)return;upConfig(d=>d.accessories.push({id:Date.now(),name:af.name,unit:af.unit,price:Number(af.price)||0}));setAf({name:"",unit:"قطعة",price:""})}}>+ اضافة</Btn></div>}
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:400}}><thead><tr>{["#","الوصف","الوحدة","السعر",...(canEdit?[""]:[])] .map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>{data.accessories.map((a,i)=><tr key={a.id}><td style={TD}>{i+1}</td><td style={{...TD,fontWeight:600}}>{a.name}</td><td style={TD}>{a.unit}</td><td style={{...TDB,color:T.accent}}>{a.price+" ج.م"}</td>{canEdit&&<td style={TD}><Btn danger small onClick={()=>upConfig(d=>{d.accessories=d.accessories.filter(x=>x.id!==a.id)})}>حذف</Btn></td>}</tr>)}</tbody></table></div></Card>}
    {sub==="size"&&<Card title="المقاسات">{canEdit&&<div style={{display:"grid",gridTemplateColumns:"3fr auto",gap:10,marginBottom:16}}><Inp value={sfld.label} onChange={v=>setSfld({label:v})} placeholder="المقاسات"/><Btn primary onClick={()=>{if(!sfld.label)return;upConfig(d=>d.sizeSets.push({id:Date.now(),label:sfld.label}));setSfld({label:""})}}>+ اضافة</Btn></div>}<table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["#","المقاسات",...(canEdit?[""]:[])] .map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>{data.sizeSets.map((s,i)=><tr key={s.id}><td style={TD}>{i+1}</td><td style={{...TD,fontWeight:600}}>{s.label}</td>{canEdit&&<td style={TD}><Btn danger small onClick={()=>upConfig(d=>{d.sizeSets=d.sizeSets.filter(x=>x.id!==s.id)})}>حذف</Btn></td>}</tr>)}</tbody></table></Card>}
    {sub==="ws"&&<Card title="الورش">{canEdit&&<div style={{display:"grid",gridTemplateColumns:"3fr auto",gap:10,marginBottom:16}}><Inp value={wf} onChange={setWf} placeholder="اسم الورشة"/><Btn primary onClick={()=>{if(!wf.trim())return;upConfig(d=>d.workshops.push(wf.trim()));setWf("")}}>+ اضافة</Btn></div>}<div style={{display:"flex",flexWrap:"wrap",gap:10}}>{data.workshops.map((w,i)=><span key={i} style={{display:"inline-flex",alignItems:"center",gap:8,padding:"10px 16px",borderRadius:12,border:"1px solid "+T.brd,fontSize:FS,fontWeight:600,background:T.cardSolid,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>{w}{canEdit&&<span onClick={()=>upConfig(d=>{d.workshops.splice(i,1)})} style={{cursor:"pointer",color:T.err,fontWeight:800}}>x</span>}</span>)}</div></Card>}
    {/* STATUS CARDS */}
    {sub==="status"&&<Card title="حالات الأوردر (بالألوان)">
      {canEdit&&<div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
        <Inp value={stName} onChange={setStName} placeholder="اسم الحالة" style={{width:200}}/>
        <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:FS-2,color:T.textSec}}>اللون:</span><input type="color" value={stColor} onChange={e=>setStColor(e.target.value)} style={{width:40,height:36,borderRadius:8,border:"none",cursor:"pointer"}}/></div>
        <Btn primary onClick={()=>{if(!stName.trim())return;upConfig(d=>{if(!d.statusCards)d.statusCards=[...DEFAULT_STATUSES];d.statusCards.push({id:Date.now(),name:stName.trim(),color:stColor})});setStName("")}}>+ اضافة حالة</Btn>
      </div>}
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"repeat(4,1fr)",gap:12}}>
        {statusCards.map(s=><div key={s.id} style={{padding:16,borderRadius:14,border:"2px solid "+s.color+"40",background:s.color+"08",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:20,height:20,borderRadius:6,background:s.color}}/><span style={{fontWeight:700,fontSize:FS,color:T.text}}>{s.name}</span></div>
          {canEdit&&<Btn danger small onClick={()=>upConfig(d=>{d.statusCards=(d.statusCards||[]).filter(x=>x.id!==s.id)})}>x</Btn>}
        </div>)}
      </div>
    </Card>}
  </div>
}

/* ══ ORDER FORM ══ */
function OrdForm({data,initial,onSave,onCancel,isMob,statusCards}){
  const[form,setForm]=useState(initial);const[errs,setErrs]=useState([]);
  const fabObj=id=>data.fabrics.find(x=>x.id===Number(id));
  const handleImg=async e=>{const f=e.target.files[0];if(!f)return;const compressed=await compressImage(f,300,0.5);setForm(p=>({...p,image:compressed}))};
  const handleFile=async e=>{const f=e.target.files[0];if(!f)return;if(f.size>500000){alert("حجم الملف أكبر من 500KB");return}const result=await compressFile(f);if(result)setForm(p=>({...p,attachments:[...(p.attachments||[]),result]}))};
  const mainQty=sqty(form.colorsA);const updF=(key,val)=>setForm(p=>setF(p,key,val));
  const save=()=>{const v=validateOrder(form);if(v.length>0){setErrs(v);return}setErrs([]);const ss=data.sizeSets.find(s=>s.id===Number(form.sizeSetId));const o={...form,cutQty:mainQty,sizeLabel:ss?ss.label:""};FKEYS.forEach(k=>{const fb=fabObj(o["fabric"+k]);o["fabric"+k+"Label"]=fb?(fb.name+" - "+fb.unit):"";o["fabric"+k+"Price"]=fb?fb.price:0;o["fabric"+k+"Unit"]=fb?fb.unit:""});delete o._docId;onSave(o)};
  const statuses=(statusCards||DEFAULT_STATUSES).map(s=>s.name);

  return<Card title={initial.modelNo?"تعديل الأوردر":"أمر قص جديد"} accent="linear-gradient(135deg,#0EA5E9,#0284C7)" style={{marginBottom:20}}>
    {errs.length>0&&<div style={{background:T.err+"10",border:"1px solid "+T.err+"30",borderRadius:12,padding:14,marginBottom:16}}>{errs.map((e,i)=><div key={i} style={{color:T.err,fontSize:FS,fontWeight:600,padding:"2px 0"}}>{"* "+e}</div>)}</div>}
    <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"auto 1fr",gap:16,marginBottom:20}}>
      <div><div style={{width:isMob?"100%":135,height:180,borderRadius:16,border:"2px dashed "+T.brd,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",background:"#F8FAFC",cursor:"pointer",position:"relative"}}>{form.image?<img src={form.image} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<span style={{fontSize:FS,color:T.textMut}}>صورة الموديل</span>}<input type="file" accept="image/*" onChange={handleImg} style={{position:"absolute",inset:0,opacity:0,cursor:"pointer"}}/></div></div>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:400}}><tbody>
        <tr><td style={TDL}>رقم الموديل *</td><td style={TD}><Inp value={form.modelNo} onChange={v=>updF("modelNo",v)}/></td><td style={TDL}>الوصف *</td><td style={TD}><Inp value={form.modelDesc} onChange={v=>updF("modelDesc",v)}/></td></tr>
        <tr><td style={TDL}>المقاسات *</td><td style={TD}><Sel value={form.sizeSetId} onChange={v=>updF("sizeSetId",v)}><option value="">-- اختر --</option>{data.sizeSets.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</Sel></td><td style={TDL}>التاريخ *</td><td style={TD}><Inp type="date" value={form.date} onChange={v=>updF("date",v)}/></td></tr>
        <tr><td style={TDL}>الورشة</td><td style={TD}><Sel value={form.workshop} onChange={v=>updF("workshop",v)}><option value="">-- اختر --</option>{data.workshops.map((w,i)=><option key={i} value={w}>{w}</option>)}</Sel></td><td style={TDL}>الحالة</td><td style={TD}><Sel value={form.status} onChange={v=>updF("status",v)}>{statuses.map(s=><option key={s} value={s}>{s}</option>)}</Sel></td></tr>
      </tbody></table></div>
    </div>
    {FKEYS.map((k,idx)=>{const fid=form["fabric"+k];const fb=fabObj(fid);return<div key={k}>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",marginBottom:6,minWidth:500}}><tbody><tr>
        <td style={{...TDL,fontWeight:700}}><span style={{display:"inline-block",width:12,height:12,borderRadius:4,background:FCOL[idx],marginLeft:6}}/>{"خامة "+k+(k==="A"?" *":"")}</td>
        <td style={TD}><Sel value={fid} onChange={v=>updF("fabric"+k,v)}><option value="">{k==="A"?"-- اختر (اجباري) --":"-- اختياري --"}</option>{data.fabrics.map(f=><option key={f.id} value={f.id}>{f.name+" - "+f.price+" ج.م/"+f.unit}</option>)}</Sel></td>
        <td style={{...TDL,width:80}}>استهلاك/راق</td><td style={{...TD,width:100}}><Inp type="number" step="any" value={form["cons"+k]} onChange={v=>updF("cons"+k,v)}/></td>
        <td style={{...TDL,width:80}}>تاريخ القص</td><td style={{...TD,width:130}}><Inp type="date" value={form["cutDate"+k]||""} onChange={v=>updF("cutDate"+k,v)}/></td>
      </tr></tbody></table></div>
      {fid&&<FCTable label={"خامة "+k} fabName={fb?fb.name:""} accent={FCOL[idx]} colors={form["colors"+k]||[]} setColors={c=>updF("colors"+k,c)}/>}
    </div>})}
    <div style={{marginBottom:16}}><div style={{fontSize:FS,fontWeight:700,color:T.accent,marginBottom:10}}>بنود الاكسسوار</div><AccPicker accItems={form.accItems||[]} dbAcc={data.accessories} onChange={items=>updF("accItems",items)}/></div>
    <div style={{marginBottom:16}}><label style={{display:"block",fontSize:FS,color:T.textSec,marginBottom:6,fontWeight:600}}>ملفات مرفقة (حد أقصى 500KB/ملف)</label>
      <input type="file" onChange={handleFile} style={{marginBottom:8,fontSize:FS}}/>
      {(form.attachments||[]).length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:8}}>{form.attachments.map((a,i)=><span key={i} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:8,background:"#F0F9FF",border:"1px solid "+T.brd,fontSize:FS-2}}>{"📎 "+a.name}<span onClick={()=>updF("attachments",form.attachments.filter((_,j)=>j!==i))} style={{cursor:"pointer",color:T.err,fontWeight:800}}>x</span></span>)}</div>}
    </div>
    <div style={{marginBottom:16}}><label style={{display:"block",fontSize:FS,color:T.textSec,marginBottom:6,fontWeight:600}}>تعليمات التشغيل</label><textarea value={form.instructions||""} onChange={e=>updF("instructions",e.target.value)} placeholder="تعليمات التشغيل..." style={{width:"100%",height:100,padding:14,borderRadius:14,border:"1.5px solid "+T.brd,fontSize:FS,fontFamily:"inherit",background:T.cardSolid,color:T.text,boxSizing:"border-box",resize:"vertical"}}/></div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:16,borderTop:"1px solid "+T.brd,flexWrap:"wrap",gap:10}}>
      <div style={{fontSize:20,fontWeight:800}}>{"كمية القص (A): "}<span style={{color:T.accent}}>{mainQty}</span></div>
      <div style={{display:"flex",gap:10}}><Btn ghost onClick={onCancel}>الغاء</Btn><Btn primary onClick={save}>حفظ</Btn></div>
    </div>
  </Card>
}

/* ══ ORDERS PAGE ══ */
function OrdPg({data,addOrder,delOrder,goD,isMob,canEdit,statusCards}){
  const[show,setShow]=useState(false);
  return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}><h1 style={{fontSize:isMob?24:32,fontWeight:800,margin:0}}>أوامر القص</h1>{canEdit&&<Btn primary onClick={()=>setShow(!show)}>{show?"الغاء":"+ أمر قص جديد"}</Btn>}</div>
    {show&&<OrdForm data={data} initial={mkOrder()} onSave={o=>{addOrder(o);setShow(false)}} onCancel={()=>setShow(false)} isMob={isMob} statusCards={statusCards}/>}
    <Card title={"جميع الأوامر ("+data.orders.length+")"}><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:650}}>
      <thead><tr>{["#","التاريخ","موديل","الوصف","الكمية","الحالة",""].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
      <tbody>{data.orders.map((o,i)=>{const t=calcOrder(o);return<tr key={o.id}><td style={TD}>{i+1}</td><td style={TD}>{o.date}</td><td style={TDB}>{o.modelNo}</td><td style={TD}>{o.modelDesc}</td><td style={{...TDB,color:T.accent}}>{t.cutQty}</td><td style={TD}><Badge t={o.status} cards={statusCards}/></td><td style={{...TD,whiteSpace:"nowrap"}}><Btn ghost small onClick={()=>goD(o.id)}>تفاصيل</Btn>{canEdit&&<>{" "}<Btn danger small onClick={()=>delOrder(o.id)}>حذف</Btn></>}</td></tr>})}
        {data.orders.length===0&&<tr><td colSpan={7} style={{...TD,textAlign:"center",color:T.textSec,padding:40}}>لا توجد أوامر</td></tr>}
      </tbody>
    </table></div></Card>
  </div>
}

/* ══ DETAILS ══ */
function DetPg({data,updOrder,replaceOrder,sel,setSel,isMob,canEdit,statusCards}){
  const order=data.orders.find(o=>o.id===sel);const[editing,setEditing]=useState(false);
  const statuses=(statusCards||DEFAULT_STATUSES).map(s=>s.name);

  if(!order)return<div><h1 style={{fontSize:isMob?24:32,fontWeight:800,margin:"0 0 20px"}}>تفاصيل الأوردر</h1><Card title="اختر أوردر"><div style={{display:"flex",flexWrap:"wrap",gap:10}}>{data.orders.map(o=><Btn key={o.id} onClick={()=>setSel(o.id)} style={{padding:"14px 20px"}}>{o.modelNo+" - "+o.modelDesc}</Btn>)}{data.orders.length===0&&<p style={{color:T.textSec}}>لا توجد أوامر</p>}</div></Card></div>;
  if(editing)return<OrdForm data={data} initial={order} onSave={o=>{replaceOrder(sel,o);setEditing(false)}} onCancel={()=>setEditing(false)} isMob={isMob} statusCards={statusCards}/>;

  const t=calcOrder(order);const accItems=order.accItems||[];const accAll=t.accPer*t.cutQty;
  const activeFabs=FKEYS.filter(k=>order["fabric"+k]);

  return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
      <h1 style={{fontSize:isMob?20:28,fontWeight:800,margin:0}}>{"أمر تشغيل - "}<span style={{color:T.accent}}>{order.modelNo}</span></h1>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><Btn onClick={()=>exportPDF("parea",order.modelNo)} style={{background:"#F1F5F9",color:T.text,border:"1px solid "+T.brd}}>تصدير PDF</Btn>{canEdit&&<Btn primary onClick={()=>setEditing(true)}>تعديل</Btn>}<Btn ghost onClick={()=>setSel(null)}>عودة</Btn></div>
    </div>
    <div id="parea">
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"repeat(5,1fr)",gap:12,marginBottom:20}}>
        <MetricCard label="رقم الموديل" value={order.modelNo} icon="🏷"/><MetricCard label="كمية القص" value={t.cutQty} icon="✂️" color={T.accent}/><MetricCard label="تم التسليم" value={order.deliveredQty||0} icon="📦" color={T.ok}/><MetricCard label="الرصيد" value={t.balance} icon="📊" color={t.balance>0?T.warn:T.ok}/><MetricCard label="تكلفة القطعة" value={t.costPer+" ج.م"} icon="💰" color={T.accent}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:order.image&&!isMob?"auto 1fr":"1fr",gap:16,marginBottom:16}}>
        {order.image&&<div><img src={order.image} alt="" style={{width:isMob?"100%":135,height:180,aspectRatio:"3/4",objectFit:"cover",borderRadius:16,border:"1px solid "+T.brd,boxShadow:T.shadow}}/></div>}
        <Card title="بيانات الموديل"><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:400}}><tbody>
          <tr><td style={TDL}>الوصف</td><td style={TDB}>{order.modelDesc}</td><td style={TDL}>المقاسات</td><td style={TD}>{order.sizeLabel}</td></tr>
          <tr><td style={TDL}>الورشة</td><td style={TD}>{canEdit?<Sel value={order.workshop} onChange={v=>updOrder(sel,o=>{o.workshop=v})}><option value="">-</option>{data.workshops.map((w,i)=><option key={i} value={w}>{w}</option>)}</Sel>:order.workshop}</td><td style={TDL}>الحالة</td><td style={TD}>{canEdit?<Sel value={order.status} onChange={v=>updOrder(sel,o=>{o.status=v})}>{statuses.map(s=><option key={s} value={s}>{s}</option>)}</Sel>:<Badge t={order.status} cards={statusCards}/>}</td></tr>
        </tbody></table></div></Card>
      </div>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":activeFabs.length>=3?"1fr 1fr 1fr":activeFabs.length===2?"1fr 1fr":"1fr",gap:14,marginBottom:16}}>
        {activeFabs.map(k=>{const colors=gc(order,k);if(colors.length===0)return null;const dt=gdate(order,k);return<div key={k}><FCTable label={"خامة "+k} fabName={gf(order,k,"Label")} accent={FCOL[FKEYS.indexOf(k)]} colors={colors} setColors={()=>{}} readOnly/>{dt&&<div style={{fontSize:FS-2,color:T.textSec,marginTop:-8,marginBottom:10}}>{"تاريخ القص: "+dt}</div>}</div>})}
      </div>
      <Card title={"تكلفة الخامات (كمية A = "+t.cutQty+")"} style={{marginBottom:16}}>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:600}}>
          <thead><tr>{["الخامة","السعر","استهلاك/راق","الراقات","القطع","التكلفة","تكلفة القطعة"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
          <tbody>
            {activeFabs.map(k=>{const cons=gcons(order,k),price=gf(order,k,"Price")||0,layers=slay(gc(order,k)),qty=sqty(gc(order,k)),cost=cons*price*layers,perPc=t.cutQty?r2(cost/t.cutQty):0;return<tr key={k}><td style={TD}><span style={{display:"inline-block",width:10,height:10,borderRadius:3,background:FCOL[FKEYS.indexOf(k)],marginLeft:8}}/>{gf(order,k,"Label")}</td><td style={TD}>{price+" ج.م"}</td><td style={TD}>{cons}</td><td style={TDB}>{layers}</td><td style={TDB}>{qty}</td><td style={{...TDB,color:T.accent}}>{fmt(r2(cost))+" ج.م"}</td><td style={{...TDB,color:T.accent}}>{perPc+" ج.م"}</td></tr>})}
            <tr style={{background:"#F8FAFC"}}><td colSpan={5} style={{...TD,fontWeight:700}}>اجمالي تكلفة الخامات</td><td style={{...TD,fontWeight:700,color:T.accent}}>{fmt(r2(t.totalFab))+" ج.م"}</td><td style={{...TD,fontWeight:800,color:T.accent,fontSize:FS+2}}>{t.fabPer+" ج.م"}</td></tr>
          </tbody>
        </table></div>
      </Card>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1.5fr 1fr",gap:16,marginBottom:16}}>
        <Card title="تكاليف الاكسسوار">{accItems.length>0?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:400}}><thead><tr>{["الوصف","السعر","اجمالي"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
          {accItems.map((a,i)=><tr key={i}><td style={{...TD,fontWeight:600}}>{a.name}</td><td style={TD}>{a.price+" ج.م"}</td><td style={{...TDB,color:T.accent}}>{fmt(a.price*t.cutQty)+" ج.م"}</td></tr>)}
          <tr style={{background:"#F8FAFC"}}><td style={{...TD,fontWeight:700}}>اجمالي</td><td style={{...TD,fontWeight:700}}>{t.accPer+" ج.م/قطعة"}</td><td style={{...TD,fontWeight:700,color:T.accent}}>{fmt(accAll)+" ج.م"}</td></tr>
        </tbody></table></div>:<div style={{textAlign:"center",padding:20,color:T.textSec}}>لم يتم اضافة بنود</div>}</Card>
        <Card title="التسليمات" extra={canEdit&&<Btn primary small onClick={()=>updOrder(sel,o=>{if(!o.deliveries)o.deliveries=[];o.deliveries.push({date:new Date().toISOString().split("T")[0],qty:0,notes:""})})}>+ تسليم</Btn>}>
          <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:350}}><thead><tr>{["#","التاريخ","الكمية","ملاحظات",...(canEdit?[""]:[])] .map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
            {(order.deliveries||[]).map((d,i)=><tr key={i}><td style={TD}>{i+1}</td><td style={TD}>{canEdit?<Inp type="date" value={d.date} onChange={v=>updOrder(sel,o=>{o.deliveries[i].date=v})}/>:d.date}</td><td style={TD}>{canEdit?<Inp type="number" value={d.qty} onChange={v=>updOrder(sel,o=>{o.deliveries[i].qty=Number(v)||0;o.deliveredQty=o.deliveries.reduce((s,x)=>s+(Number(x.qty)||0),0)})} style={{width:80}}/>:d.qty}</td><td style={TD}>{canEdit?<Inp value={d.notes} onChange={v=>updOrder(sel,o=>{o.deliveries[i].notes=v})}/>:d.notes}</td>{canEdit&&<td style={TD}><Btn danger small onClick={()=>updOrder(sel,o=>{o.deliveries.splice(i,1);o.deliveredQty=o.deliveries.reduce((s,x)=>s+(Number(x.qty)||0),0)})}>حذف</Btn></td>}</tr>)}
            {(!order.deliveries||order.deliveries.length===0)&&<tr><td colSpan={canEdit?5:4} style={{...TD,textAlign:"center",color:T.textSec}}>لا توجد تسليمات</td></tr>}
          </tbody></table></div>
        </Card>
      </div>
      {/* Attachments */}
      {(order.attachments||[]).length>0&&<Card title="ملفات مرفقة" style={{marginBottom:16}}><div style={{display:"flex",flexWrap:"wrap",gap:10}}>{order.attachments.map((a,i)=><a key={i} href={a.data} download={a.name} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"10px 16px",borderRadius:10,background:"#F0F9FF",border:"1px solid "+T.brd,fontSize:FS,color:T.accent,fontWeight:600,textDecoration:"none"}}>{"📎 "+a.name}</a>)}</div></Card>}
      <Card title="ملخص تكلفة الموديل" accent="linear-gradient(135deg,#0EA5E9,#0284C7)">
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:FS+1}}><thead><tr>{["البند","التكلفة الكلية","تكلفة القطعة"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
          <tr><td style={TD}>تكلفة الخامات</td><td style={TDB}>{fmt(r2(t.totalFab))+" ج.م"}</td><td style={TDB}>{t.fabPer+" ج.م"}</td></tr>
          <tr><td style={TD}>تكاليف الاكسسوار</td><td style={TDB}>{fmt(accAll)+" ج.م"}</td><td style={TDB}>{t.accPer+" ج.م"}</td></tr>
          <tr style={{background:T.accentBg}}><td style={{...TD,fontWeight:800,fontSize:FS+4,color:T.accent}}>الاجمالي</td><td style={{...TD,fontWeight:800,fontSize:FS+4,color:T.accent}}>{fmt(r2(t.costAll))+" ج.م"}</td><td style={{...TD,fontWeight:800,fontSize:FS+6,color:T.accent}}>{t.costPer+" ج.م"}</td></tr>
        </tbody></table>
      </Card>
      {order.instructions&&<Card title="تعليمات التشغيل" style={{marginTop:16}}><div style={{whiteSpace:"pre-wrap",fontSize:FS+1,lineHeight:2}}>{order.instructions}</div></Card>}
    </div>
  </div>
}

/* ══ SEARCH ══ */
function SearchPg({data,goD,isMob,season,statusCards}){
  const[q,setQ]=useState("");const[stF,setStF]=useState("الكل");const[wsF,setWsF]=useState("الكل");
  const statuses=(statusCards||DEFAULT_STATUSES).map(s=>s.name);
  const filtered=data.orders.filter(o=>{if(stF!=="الكل"&&o.status!==stF)return false;if(wsF!=="الكل"&&o.workshop!==wsF)return false;if(q.trim()){const s=q.trim().toLowerCase();const h=[o.modelNo,o.modelDesc,o.sizeLabel,o.workshop,o.status].filter(Boolean).join(" ").toLowerCase();if(!h.includes(s))return false}return true});
  return<div>
    <h1 style={{fontSize:isMob?24:32,fontWeight:800,margin:"0 0 20px"}}>{"بحث - "+season}</h1>
    <Card style={{marginBottom:20}}><div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"2fr 1fr 1fr",gap:12}}>
      <div><label style={{display:"block",fontSize:FS-2,color:T.textSec,marginBottom:4,fontWeight:600}}>بحث</label><Inp value={q} onChange={setQ} placeholder="رقم موديل، وصف..."/></div>
      <div><label style={{display:"block",fontSize:FS-2,color:T.textSec,marginBottom:4,fontWeight:600}}>الحالة</label><Sel value={stF} onChange={setStF}><option value="الكل">الكل</option>{statuses.map(s=><option key={s} value={s}>{s}</option>)}</Sel></div>
      <div><label style={{display:"block",fontSize:FS-2,color:T.textSec,marginBottom:4,fontWeight:600}}>الورشة</label><Sel value={wsF} onChange={setWsF}><option value="الكل">الكل</option>{data.workshops.map((w,i)=><option key={i} value={w}>{w}</option>)}</Sel></div>
    </div></Card>
    <Card title={"نتائج ("+filtered.length+")"}><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:650}}>
      <thead><tr>{["#","التاريخ","موديل","الوصف","الورشة","الكمية","الحالة",""].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
      <tbody>{filtered.map((o,i)=>{const t=calcOrder(o);return<tr key={o.id}><td style={TD}>{i+1}</td><td style={TD}>{o.date}</td><td style={TDB}>{o.modelNo}</td><td style={TD}>{o.modelDesc}</td><td style={TD}>{o.workshop||"-"}</td><td style={{...TDB,color:T.accent}}>{t.cutQty}</td><td style={TD}><Badge t={o.status} cards={statusCards}/></td><td style={TD}><Btn ghost small onClick={()=>goD(o.id)}>تفاصيل</Btn></td></tr>})}
        {filtered.length===0&&<tr><td colSpan={8} style={{...TD,textAlign:"center",color:T.textSec,padding:40}}>لا توجد نتائج</td></tr>}
      </tbody>
    </table></div></Card>
  </div>
}

/* ══ PRODUCTION REPORT ══ */
function RepPg({data,isMob,season,statusCards}){
  const[filter,setFilter]=useState("الكل");
  const statuses=(statusCards||DEFAULT_STATUSES).map(s=>s.name);
  const list=filter==="الكل"?data.orders:data.orders.filter(o=>o.status===filter);
  const cutQ=list.reduce((s,o)=>s+calcOrder(o).cutQty,0);
  const delQ=list.reduce((s,o)=>s+(o.deliveredQty||0),0);
  const comp=cutQ?Math.round((delQ/cutQ)*100):0;
  const today=new Date().toLocaleDateString("ar-EG",{weekday:"long",year:"numeric",month:"long",day:"numeric"});

  return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:10}}>
      <div><div style={{fontSize:isMob?18:26,fontWeight:800,color:T.text}}>{today}</div><div style={{fontSize:FS+2,color:T.accent,fontWeight:700,marginTop:4}}>{"الموسم: "+season}</div></div>
      <Btn onClick={()=>exportPDF("rep-area","تقرير الانتاج - "+season)} style={{background:"#F1F5F9",color:T.text,border:"1px solid "+T.brd}}>تصدير PDF / طباعة</Btn>
    </div>
    <div id="rep-area">
      <h1 style={{fontSize:isMob?22:30,fontWeight:800,margin:"16px 0 20px"}}>تقرير قص وانتاج المصنع</h1>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"repeat(4,1fr)",gap:12,marginBottom:20}}>
        <MetricCard label="كمية القص" value={fmt(cutQ)} icon="✂️" color={T.accent}/>
        <MetricCard label="تسليم مخزن" value={fmt(delQ)} icon="📦" color={T.ok}/>
        <MetricCard label="رصيد بالمصنع" value={fmt(cutQ-delQ)} icon="🏭" color={T.warn}/>
        <div style={{background:T.card,borderRadius:16,padding:"22px 24px",border:"1px solid "+T.brd,boxShadow:T.shadow}}>
          <div style={{fontSize:FS,color:T.textSec,marginBottom:8,fontWeight:600}}>معدل الانجاز</div>
          <div style={{fontSize:32,fontWeight:800,color:T.accent}}>{comp+"%"}</div>
          <PBar value={comp}/>
        </div>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>{["الكل",...statuses].map(s=><Btn key={s} on={filter===s} small onClick={()=>setFilter(s)}>{s}</Btn>)}</div>
      <Card><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:800}}>
        <thead><tr>{["#","رقم الموديل","وصف الموديل",...FKEYS.map(k=>"خامة "+k),"كمية القص","تسليم مخزن","رصيد","الحالة"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
        <tbody>{list.map((o,i)=>{const c=calcOrder(o);return<tr key={o.id}><td style={TD}>{i+1}</td><td style={TDB}>{o.modelNo}</td><td style={TD}>{o.modelDesc}</td>
          {FKEYS.map(k=><td key={k} style={{...TD,fontSize:FS-2,maxWidth:100,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{gf(o,k,"Label")?gf(o,k,"Label").split(" - ")[0]:"-"}</td>)}
          <td style={{...TDB,color:T.accent}}>{c.cutQty}</td><td style={TD}>{o.deliveredQty||0}</td><td style={{...TD,color:c.balance>0?T.warn:T.ok,fontWeight:700}}>{c.balance}</td><td style={TD}><Badge t={o.status} cards={statusCards}/></td></tr>})}
          {list.length===0&&<tr><td colSpan={12} style={{...TD,textAlign:"center",color:T.textSec,padding:40}}>لا توجد بيانات</td></tr>}
        </tbody>
      </table></div></Card>
    </div>
  </div>
}

/* ══ COST ══ */
function CostPg({data,isMob,statusCards}){
  return<div><h1 style={{fontSize:isMob?24:32,fontWeight:800,margin:"0 0 20px"}}>تقرير التكاليف</h1>
    <div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"repeat(auto-fit,minmax(160px,1fr))",gap:12,marginBottom:20}}><MetricCard label="عدد الموديلات" value={data.orders.length} icon="📦" color={T.accent}/><MetricCard label="اجمالي القص" value={fmt(data.orders.reduce((s,o)=>s+calcOrder(o).cutQty,0))} icon="✂️" color={T.ok}/></div>
    <Card><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:550}}><thead><tr>{["#","موديل","الوصف","الكمية","تسليم","رصيد","تكلفة القطعة"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
      {data.orders.map((o,i)=>{const c=calcOrder(o);return<tr key={o.id}><td style={TD}>{i+1}</td><td style={TDB}>{o.modelNo}</td><td style={TD}>{o.modelDesc}</td><td style={{...TDB,color:T.accent}}>{c.cutQty}</td><td style={TD}>{o.deliveredQty||0}</td><td style={{...TD,color:c.balance>0?T.warn:T.ok,fontWeight:700}}>{c.balance}</td><td style={{...TDB,color:T.accent,fontSize:FS+2}}>{c.costPer+" ج.م"}</td></tr>})}
      {data.orders.length===0&&<tr><td colSpan={7} style={{...TD,textAlign:"center",color:T.textSec,padding:40}}>لا توجد بيانات</td></tr>}
    </tbody></table></div></Card>
  </div>
}

/* ══ SETTINGS ══ */
function SettingsPg({config,upConfig,isMob,user}){
  const[newSeason,setNewSeason]=useState("");const[delConfirm,setDelConfirm]=useState("");
  const[newUserEmail,setNewUserEmail]=useState("");const[newUserRole,setNewUserRole]=useState("viewer");
  const handleLogo=async e=>{const f=e.target.files[0];if(!f)return;const compressed=await compressImage(f,200,0.6);upConfig(d=>{d.logo=compressed})};
  const addSeason=()=>{if(!newSeason.trim())return;upConfig(d=>{if(!d.seasons)d.seasons=[];if(!d.seasons.includes(newSeason.trim()))d.seasons.push(newSeason.trim());d.activeSeason=newSeason.trim()});setNewSeason("")};
  const deleteSeason=async s=>{if(delConfirm!==s){setDelConfirm(s);return}try{const snap=await getDocs(collection(db,"seasons",s,"orders"));await Promise.all(snap.docs.map(d=>deleteDoc(doc(db,"seasons",s,"orders",d.id))))}catch(e){}upConfig(d=>{d.seasons=(d.seasons||[]).filter(x=>x!==s);if(d.activeSeason===s)d.activeSeason=d.seasons[0]||""});setDelConfirm("")};

  return<div>
    <h1 style={{fontSize:isMob?24:32,fontWeight:800,margin:"0 0 20px"}}>الاعدادات</h1>
    <Card title="لوجو المصنع" style={{marginBottom:16}}>
      <div style={{display:"flex",alignItems:"center",gap:20,flexWrap:"wrap"}}>
        <div style={{width:100,height:100,borderRadius:16,border:"2px dashed "+T.brd,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",background:"#F8FAFC",cursor:"pointer",position:"relative"}}>{config.logo?<img src={config.logo} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<span style={{fontSize:FS,color:T.textMut}}>لوجو</span>}<input type="file" accept="image/*" onChange={handleLogo} style={{position:"absolute",inset:0,opacity:0,cursor:"pointer"}}/></div>
        <div><div style={{fontSize:FS,color:T.text,fontWeight:600,marginBottom:4}}>اضغط لرفع اللوجو</div>{config.logo&&<Btn danger small onClick={()=>upConfig(d=>{d.logo=""})} style={{marginTop:8}}>حذف اللوجو</Btn>}</div>
      </div>
    </Card>
    <Card title="ادارة المواسم" style={{marginBottom:16}}>
      <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}><Inp value={newSeason} onChange={setNewSeason} placeholder="اسم الموسم (مثال: SS27)" style={{width:220}}/><Btn primary onClick={addSeason}>+ موسم جديد</Btn></div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {(config.seasons||[]).map(s=><div key={s} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderRadius:12,border:s===config.activeSeason?"2px solid "+T.accent:"1px solid "+T.brd,background:s===config.activeSeason?T.accentBg:T.cardSolid,flexWrap:"wrap",gap:8}}>
          <div onClick={()=>upConfig(d=>{d.activeSeason=s})} style={{cursor:"pointer",display:"flex",alignItems:"center",gap:10}}><span style={{fontWeight:700,fontSize:FS+2,color:s===config.activeSeason?T.accent:T.text}}>{s}</span>{s===config.activeSeason&&<span style={{fontSize:FS-3,color:T.ok,background:T.ok+"15",padding:"2px 10px",borderRadius:12}}>نشط</span>}</div>
          <div style={{display:"flex",gap:8}}>{s!==config.activeSeason&&<Btn small onClick={()=>upConfig(d=>{d.activeSeason=s})} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}}>تفعيل</Btn>}<Btn danger small onClick={()=>deleteSeason(s)}>{delConfirm===s?"تأكيد الحذف؟":"حذف"}</Btn>{delConfirm===s&&<Btn ghost small onClick={()=>setDelConfirm("")}>الغاء</Btn>}</div>
        </div>)}
      </div>
    </Card>
    <Card title="ادارة المستخدمين">
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"2fr 1fr auto",gap:10,marginBottom:20}}>
        <Inp value={newUserEmail} onChange={setNewUserEmail} placeholder="البريد الالكتروني"/>
        <Sel value={newUserRole} onChange={setNewUserRole}><option value="admin">مدير النظام</option><option value="manager">مدير انتاج</option><option value="viewer">مشاهد فقط</option></Sel>
        <Btn primary onClick={()=>{if(!newUserEmail.trim())return;upConfig(d=>{if(!d.usersList)d.usersList=[];const ex=d.usersList.find(u=>u.email===newUserEmail.trim());if(ex)ex.role=newUserRole;else d.usersList.push({email:newUserEmail.trim(),role:newUserRole})});setNewUserEmail("")}}>+ اضافة</Btn>
      </div>
      {(config.usersList||[]).length>0&&<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:500}}><thead><tr>{["البريد","الصلاحية",""].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
        {(config.usersList||[]).map((u,i)=><tr key={i}><td style={{...TD,fontWeight:600}}>{u.email}</td><td style={TD}><Sel value={u.role} onChange={v=>upConfig(d=>{const x=(d.usersList||[]).find(z=>z.email===u.email);if(x)x.role=v})}><option value="admin">مدير النظام</option><option value="manager">مدير انتاج</option><option value="viewer">مشاهد فقط</option></Sel></td><td style={TD}><Btn danger small onClick={()=>upConfig(d=>{d.usersList=(d.usersList||[]).filter(x=>x.email!==u.email)})}>حذف</Btn></td></tr>)}
      </tbody></table></div>}
      <div style={{marginTop:16,display:"grid",gridTemplateColumns:isMob?"1fr":"repeat(3,1fr)",gap:12}}>
        {[["مدير النظام",T.accent,"كل الصلاحيات + اعدادات"],["مدير انتاج",T.ok,"اضافة وتعديل"],["مشاهد",T.warn,"عرض فقط"]].map(([n,c,d])=><div key={n} style={{padding:14,borderRadius:12,background:c+"08",border:"1px solid "+c+"25"}}><div style={{fontSize:FS,fontWeight:700,color:c,marginBottom:4}}>{n}</div><div style={{fontSize:FS-2,color:T.textSec}}>{d}</div></div>)}
      </div>
    </Card>
  </div>
}
