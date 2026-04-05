import { useState, useEffect, useCallback, useRef } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { auth, db, getSecondaryAuth } from "./firebase";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from "firebase/auth";
import { doc, setDoc, onSnapshot, collection, addDoc, updateDoc, deleteDoc, getDocs } from "firebase/firestore";

/* Optional libs - loaded dynamically */
let _XLSX=null,_QR=null;
const loadXLSX=async()=>{if(!_XLSX)try{_XLSX=await import("xlsx")}catch(e){};return _XLSX};
const loadQR=async()=>{if(!_QR)try{const m=await import("qrcode");_QR=m.default||m}catch(e){};return _QR};

const FKEYS = ["A","B","C","D","E"];
const CLARK_LOGO="data:image/png;base64,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";
const FCOL = ["#0EA5E9","#10B981","#F59E0B","#8B5CF6","#EF4444"];
const COLORS_DB = [
  {n:"ابيض",h:"#FFFFFF"},{n:"اسود",h:"#1a1a1a"},{n:"كحلي",h:"#1B2A4A"},{n:"رمادي",h:"#8B8B8B"},{n:"بيج",h:"#D4C5A9"},{n:"كريمي",h:"#FFF8DC"},
  {n:"احمر",h:"#C62828"},{n:"نبيتي",h:"#6A1B29"},{n:"برتقالي",h:"#E65100"},{n:"اصفر",h:"#F9A825"},{n:"زيتي",h:"#556B2F"},{n:"اخضر",h:"#2E7D32"},
  {n:"لبني",h:"#81D4FA"},{n:"سماوي",h:"#00ACC1"},{n:"ازرق",h:"#1565C0"},{n:"بنفسجي",h:"#6A1B9A"},{n:"موف",h:"#9C27B0"},{n:"روز",h:"#E91E63"},
  {n:"فوشيا",h:"#D81B60"},{n:"بني",h:"#5D4037"},{n:"كاكي",h:"#8D6E63"},{n:"منت",h:"#80CBC4"},{n:"مشمشي",h:"#FFAB91"},{n:"سلمون",h:"#EF9A9A"},
];

/* ── Theme System ── */
const THEMES = {
  light:{name:"فاتح",bg:"#EFF6FF",card:"rgba(255,255,255,0.9)",cardSolid:"#FFF",glass:"rgba(255,255,255,0.6)",brd:"rgba(148,163,184,0.2)",brdStrong:"rgba(148,163,184,0.4)",text:"#1E293B",textSec:"#64748B",textMut:"#94A3B8",accent:"#0EA5E9",accentBg:"#E0F2FE",ok:"#10B981",err:"#EF4444",warn:"#F59E0B",purple:"#8B5CF6",shadow:"0 2px 12px rgba(0,0,0,0.04)",sidebarBg:"#FFF",inputBg:"#FFF",bodyBg:"#EFF6FF"},
  dark:{name:"داكن",bg:"#1A1D23",card:"rgba(36,40,50,0.95)",cardSolid:"#242832",glass:"rgba(36,40,50,0.8)",brd:"rgba(255,255,255,0.08)",brdStrong:"rgba(255,255,255,0.15)",text:"#E8ECF1",textSec:"#9CA3AF",textMut:"#6B7280",accent:"#00BFA5",accentBg:"rgba(0,191,165,0.1)",ok:"#10B981",err:"#EF4444",warn:"#F59E0B",purple:"#A78BFA",shadow:"0 2px 12px rgba(0,0,0,0.2)",sidebarBg:"#1E222A",inputBg:"#2A2E38",bodyBg:"#1A1D23"}
};
let T = THEMES.light;

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
  garmentTypes:[{id:1,name:"قميص"},{id:2,name:"شورت"},{id:3,name:"تيشيرت"},{id:4,name:"بنطلون"},{id:5,name:"شنطة"},{id:6,name:"جاكت"}],
  workshops:[{id:1,name:"CLARK",owner:"",phone:"",address:"",idCard:"",ownerPhoto:"",rating:8,type:"داخلي"},{id:2,name:"ورشة محمود",owner:"محمود",phone:"",address:"",idCard:"",ownerPhoto:"",rating:7,type:"خارجي"},{id:3,name:"المصنع",owner:"",phone:"",address:"",idCard:"",ownerPhoto:"",rating:9,type:"داخلي"}],
  seasons:["WS26"], activeSeason:"WS26", logo:"", users:{}, usersList:[], wsPayments:[],
};

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
function sortOrders(orders){return[...orders].sort((a,b)=>(b.createdAt||b.date||"").localeCompare(a.createdAt||a.date||""))}

/* Smart status recompute based on data state */
function recomputeStatus(o){
  const t=calcOrder(o);const wds=o.workshopDeliveries||[];const dels=o.deliveries||[];
  const stockDel=dels.reduce((s,d)=>s+(Number(d.qty)||0),0);
  if(stockDel>=t.cutQty&&t.cutQty>0)return"تم الشحن";
  if(stockDel>0)return"شحن جزئي";
  /* Check if 30%+ of all pieces received back */
  const pieces=o.orderPieces||[];
  if(wds.length>0){
    let totalWsDel=0,totalWsRcv=0;
    wds.forEach(wd=>{totalWsDel+=(Number(wd.qty)||0);(wd.receives||[]).forEach(r=>{totalWsRcv+=(Number(r.qty)||0)})});
    if(pieces.length>0){
      const allRcvd=pieces.every(p=>{const rcvP=wds.filter(wd=>wd.garmentType===p).reduce((s,wd)=>(wd.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0)+s,0);return rcvP>0});
      if(allRcvd&&totalWsDel>0&&totalWsRcv>=totalWsDel*0.3)return"تشطيب وتعبئة"
    } else {
      if(totalWsDel>0&&totalWsRcv>=totalWsDel*0.3)return"تشطيب وتعبئة"
    }
    if(totalWsDel>0)return"في التشغيل"
  }
  return"تم القص"
}

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

function compressImg43(file,maxW,quality){
  return new Promise((resolve)=>{const reader=new FileReader();reader.onload=(e)=>{const img=new Image();img.onload=()=>{
    const canvas=document.createElement("canvas");let w=img.width,h=img.height;const max=maxW||400;
    if(w>max||h>max){if(w>h){h=Math.round(h*max/w);w=max}else{w=Math.round(w*max/h);h=max}}
    const tr=4/3,cr=w/h;let cw=w,ch=h,sx=0,sy=0;
    if(cr>tr){cw=Math.round(h*tr);sx=Math.round((w-cw)/2)}else{ch=Math.round(w/tr);sy=Math.round((h-ch)/2)}
    canvas.width=cw;canvas.height=ch;const ctx=canvas.getContext("2d");
    const scX=img.width/w,scY=img.height/h;
    ctx.drawImage(img,sx*scX,sy*scY,cw*scX,ch*scY,0,0,cw,ch);
    resolve(canvas.toDataURL("image/jpeg",quality||0.5))};img.src=e.target.result};reader.readAsDataURL(file)})
}

/* Toast notification - no hooks */
function showToast(msg){const el=document.createElement("div");el.textContent=msg;el.style.cssText="position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#10B981;color:#fff;padding:10px 28px;border-radius:10px;font-family:'Cairo',sans-serif;font-size:13px;font-weight:700;z-index:99999;box-shadow:0 4px 20px rgba(0,0,0,0.2);direction:rtl;animation:toastIn 0.3s ease";document.body.appendChild(el);const style=document.createElement("style");style.textContent="@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}";document.head.appendChild(style);setTimeout(()=>{el.style.opacity="0";el.style.transition="opacity 0.3s";setTimeout(()=>{el.remove();style.remove()},300)},2000)}

function highlightRow(id){setTimeout(()=>{const el=document.querySelector("[data-oid='"+id+"']");if(!el)return;el.style.transition="background 0.3s";el.style.background="#FEF3C7";setTimeout(()=>{el.style.background="";setTimeout(()=>el.style.transition="",500)},2000)},200)}

const PRINT_CSS="*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Cairo',Arial,sans-serif;padding:30px;font-size:13px;direction:rtl;color:#1E293B;line-height:1.6}.hdr{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #0284C7;padding-bottom:14px;margin-bottom:24px}.hdr img{height:44px}.hdr-info{text-align:left;font-size:11px;color:#64748B;font-weight:600}h2{font-size:16px;color:#0284C7;margin:16px 0 8px;padding-bottom:4px;border-bottom:1px solid #E2E8F0}table{width:100%;border-collapse:collapse;margin:8px 0 16px;border:1px solid #CBD5E1}th{background:linear-gradient(180deg,#F1F5F9,#E2E8F0);font-weight:700;font-size:11px;color:#475569;padding:6px 10px;text-align:right;border:1px solid #CBD5E1}td{padding:5px 10px;text-align:right;border:1px solid #E2E8F0;font-size:12px}tr:nth-child(even){background:#F8FAFC}.info{font-weight:700;color:#0284C7}.ok{color:#10B981;font-weight:700}.err{color:#EF4444;font-weight:700}.sig{margin-top:50px;display:flex;justify-content:space-between}.sig-box{text-align:center;width:180px;border-top:2px solid #333;padding-top:8px;font-weight:700;font-size:13px}.badge{display:inline-block;padding:3px 10px;border-radius:6px;font-size:11px;font-weight:600;margin:2px}@media print{body{padding:15px}table{page-break-inside:auto}tr{page-break-inside:avoid}@page{margin:15mm;@bottom-center{content:counter(page)' / 'counter(pages)}}}";
function printPage(title,bodyHtml){const pw=window.open("","_blank");if(!pw)return;const today=new Date().toLocaleDateString("ar-EG");pw.document.write("<!DOCTYPE html><html dir='rtl'><head><meta charset='utf-8'/><link href='https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;800&display=swap' rel='stylesheet'/><title>"+title+"</title><style>"+PRINT_CSS+"</style></head><body><div class='hdr'><div><img src='"+CLARK_LOGO+"'/></div><div class='hdr-info'>"+title+"<br/>"+today+"</div></div>"+bodyHtml+"</body></html>");pw.document.close();setTimeout(()=>{pw.focus();pw.print()},500)}

async function exportExcel(rows,fileName){const X=await loadXLSX();if(!X){alert("مكتبة Excel غير متوفرة");return}const ws=X.utils.aoa_to_sheet(rows);ws["!cols"]=rows[0].map(()=>({wch:18}));const wb=X.utils.book_new();X.utils.book_append_sheet(wb,ws,"Sheet1");X.writeFile(wb,fileName+".xlsx")}

function QRImg({text,size}){const[src,setSrc]=useState("");useEffect(()=>{if(!text)return;loadQR().then(QR=>{if(QR)QR.toDataURL(text,{width:size||120,margin:1,errorCorrectionLevel:"L",color:{dark:"#1E293B",light:"#FFFFFF"}}).then(setSrc).catch(()=>{})}).catch(()=>{})},[text,size]);return src?<img src={src} alt="QR" style={{width:size||120,height:size||120,borderRadius:8,border:"1px solid #E2E8F0"}}/>:null}

function Timeline({events}){if(!events||events.length===0)return null;return<div style={{overflowX:"auto",padding:"8px 0"}}>
  <div style={{display:"flex",alignItems:"flex-start",minWidth:events.length*130,position:"relative"}}>
    {/* Continuous line */}
    <div style={{position:"absolute",top:28,right:events.length>1?"calc(50% / "+events.length+")":"0",left:events.length>1?"calc(50% / "+events.length+")":"0",height:2,background:T.brd}}/>
    {events.map((e,i)=><div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",position:"relative",minWidth:110}}>
      <div style={{fontSize:FS-2,fontWeight:700,color:e.color||T.accent,textAlign:"center",marginBottom:6,maxWidth:110,lineHeight:1.3}}>{e.title}</div>
      <div style={{width:14,height:14,borderRadius:7,background:e.color||T.accent,border:"3px solid "+T.cardSolid,boxShadow:"0 0 0 2px "+(e.color||T.accent),zIndex:1}}/>
      <div style={{fontSize:FS-3,color:T.textSec,marginTop:6,textAlign:"center"}}>{e.date}</div>
      {e.detail&&<div style={{fontSize:FS-3,color:T.textMut,textAlign:"center",marginTop:1}}>{e.detail}</div>}
    </div>)}
  </div>
</div>}

function printReceipt(wsName,wsOwner,order,garmentType,qty,date,balance){
  if(!order)return;
  const t=calcOrder(order);
  /* Fallback: find wsName from order's workshopDeliveries if not passed */
  let ws=wsName||"";
  if(!ws&&order.workshopDeliveries){const wd=order.workshopDeliveries.find(w=>w.garmentType===garmentType)||order.workshopDeliveries[order.workshopDeliveries.length-1];if(wd)ws=wd.wsName||""}
  let wsO=wsOwner||"";
  if(!wsO&&order.workshopDeliveries){const wd=order.workshopDeliveries.find(w=>w.wsName===ws);if(wd)wsO=wd.wsOwner||""}
  const modelNo=order.modelNo||"";const modelDesc=order.modelDesc||"";const sizeLabel=order.sizeLabel||"";const marker=order.marker||"";
  let h="<h2>اذن تسليم ورشة</h2>";
  /* Order info table */
  h+="<div style='display:flex;gap:16px;align-items:flex-start;margin-bottom:16px'>";
  if(order.image)h+="<div style='width:80px;height:107px;border-radius:8px;overflow:hidden;border:1px solid #ddd;flex-shrink:0'><img src='"+order.image+"' style='width:100%;height:100%;object-fit:cover'/></div>";
  h+="<div style='flex:1'><table>";
  h+="<tr><th>رقم الموديل</th><td><b>"+modelNo+"</b></td><th>الوصف</th><td>"+modelDesc+"</td></tr>";
  h+="<tr><th>المقاسات</th><td>"+sizeLabel+"</td><th>كمية القص</th><td><b>"+t.cutQty+"</b></td></tr>";
  h+="<tr><th>الورشة</th><td><b style='color:#8B5CF6'>"+ws+"</b>"+(wsO?" — "+wsO:"")+"</td><th>التاريخ</th><td>"+(date||"")+"</td></tr>";
  if(garmentType)h+="<tr><th>القطعة المسلمة</th><td><b style='color:#8B5CF6'>👕 "+garmentType+"</b></td><th>الكمية المسلمة</th><td><b style='color:#0284C7;font-size:16px'>"+qty+"</b> قطعة</td></tr>";
  else h+="<tr><th>الكمية المسلمة</th><td colspan='3'><b style='color:#0284C7;font-size:16px'>"+qty+"</b> قطعة</td></tr>";
  if(marker)h+="<tr><th>ماركر</th><td colspan='3'>"+marker+"</td></tr>";
  h+="</table></div></div>";
  /* Fabric details - only fabrics assigned to this garment piece */
  const activeFabs=FKEYS.filter(k=>gf(order,k));
  const fabsForPiece=activeFabs.filter(k=>{if(!garmentType)return true;const fp=order["fabricPieces"+k]||[];return fp.length===0||fp.includes(garmentType)});
  fabsForPiece.forEach(k=>{const colors=gc(order,k);if(colors.length===0)return;
    const label=gf(order,k,"Label")||("خامة "+k);const cons=gcons(order,k);const unit=gf(order,k,"Unit")||"";
    h+="<h2 style='font-size:13px;margin:14px 0 4px'>"+(garmentType?"👕 "+garmentType+" — "+label:label)+"</h2>";
    h+="<div style='border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:8px'>";
    if(cons)h+="<div style='background:#f1f5f9;padding:5px 12px;font-size:11px;color:#475569'>استهلاك/راق: <b>"+cons+" "+unit+"</b></div>";
    h+="<table style='margin:0'><tr><th>اللون</th><th>الراقات</th><th>قطع/راق</th><th>اجمالي القطع</th></tr>";
    let tL=0,tQ=0;colors.forEach(c=>{const ly=Number(c.layers)||0;const pp=Number(c.pcsPerLayer)||0;const q=ly*pp;tL+=ly;tQ+=q;
      h+="<tr><td>"+(c.color||"-")+"</td><td style='font-weight:700'>"+ly+"</td><td>"+pp+"</td><td style='font-weight:700;color:#0284C7'>"+q+"</td></tr>"});
    h+="<tr style='background:#f8fafc;font-weight:800'><td>الاجمالي</td><td>"+tL+"</td><td></td><td style='color:#0284C7'>"+tQ+"</td></tr>";
    h+="</table></div>"});
  if(balance>0)h+="<p style='margin:12px 0;color:#EF4444;font-weight:700'>الرصيد المتبقي: "+balance+" قطعة</p>";
  /* Receipt statement */
  h+="<div style='margin:20px 0;padding:16px;border:2px solid #CBD5E1;border-radius:10px;background:#F8FAFC;font-size:13px;line-height:2;text-align:center'>";
  h+="اقر أنا الموقع أدناه بأنني استلمت هذه البضاعة المذكورة عاليه وأتعهد بسداد قيمتها وقت طلبها. وأعتبر مسؤلاً مسئولية كاملة في حالة تبديد هذه البضاعة أو تلفها. وهذا اقرار مني بذلك</div>";
  /* Signatures */
  h+="<div class='sig'><div class='sig-box'>توقيع صاحب الورشة<br/><span style='font-size:11px;color:#8B5CF6'>"+ws+"</span></div><div class='sig-box'>مسؤول القص والتسليم</div></div>";
  printPage("اذن تسليم ورشة — "+modelNo,h)
}

function printReceiveReceipt(wsName,order,garmentType,qty,date,balance){
  if(!order){printPage("اذن استلام مصنع","<p>بيانات غير متوفرة</p>");return}
  const t=calcOrder(order);
  let ws=wsName||"";
  if(!ws&&order.workshopDeliveries){const wd=order.workshopDeliveries.find(w=>w.garmentType===garmentType)||order.workshopDeliveries[order.workshopDeliveries.length-1];if(wd)ws=wd.wsName||""}
  const modelNo=order.modelNo||"";const modelDesc=order.modelDesc||"";const sizeLabel=order.sizeLabel||"";const marker=order.marker||"";
  let h="<h2>اذن استلام مصنع</h2>";
  h+="<div style='display:flex;gap:16px;align-items:flex-start;margin-bottom:16px'>";
  if(order.image)h+="<div style='width:80px;height:107px;border-radius:8px;overflow:hidden;border:1px solid #ddd;flex-shrink:0'><img src='"+order.image+"' style='width:100%;height:100%;object-fit:cover'/></div>";
  h+="<div style='flex:1'><table>";
  h+="<tr><th>رقم الموديل</th><td><b>"+modelNo+"</b></td><th>الوصف</th><td>"+modelDesc+"</td></tr>";
  h+="<tr><th>المقاسات</th><td>"+sizeLabel+"</td><th>كمية القص</th><td><b>"+t.cutQty+"</b></td></tr>";
  h+="<tr><th>الورشة</th><td><b style='color:#8B5CF6'>"+ws+"</b></td><th>التاريخ</th><td>"+(date||"")+"</td></tr>";
  if(garmentType)h+="<tr><th>القطعة</th><td><b style='color:#8B5CF6'>👕 "+garmentType+"</b></td><th>الكمية المستلمة</th><td><b style='color:#10B981;font-size:16px'>"+qty+"</b> قطعة</td></tr>";
  else h+="<tr><th>الكمية المستلمة</th><td colspan='3'><b style='color:#10B981;font-size:16px'>"+qty+"</b> قطعة</td></tr>";
  if(marker)h+="<tr><th>ماركر</th><td colspan='3'>"+marker+"</td></tr>";
  h+="</table></div></div>";
  /* Fabric details */
  const activeFabs=FKEYS.filter(k=>gf(order,k));
  const fabsForPiece=activeFabs.filter(k=>{if(!garmentType)return true;const fp=order["fabricPieces"+k]||[];return fp.length===0||fp.includes(garmentType)});
  fabsForPiece.forEach(k=>{const colors=gc(order,k);if(colors.length===0)return;
    const label=gf(order,k,"Label")||("خامة "+k);const cons=gcons(order,k);const unit=gf(order,k,"Unit")||"";
    h+="<h2 style='font-size:13px;margin:14px 0 4px'>"+(garmentType?"👕 "+garmentType+" — "+label:label)+"</h2>";
    h+="<div style='border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:8px'>";
    if(cons)h+="<div style='background:#f1f5f9;padding:5px 12px;font-size:11px;color:#475569'>استهلاك/راق: <b>"+cons+" "+unit+"</b></div>";
    h+="<table style='margin:0'><tr><th>اللون</th><th>الراقات</th><th>قطع/راق</th><th>اجمالي القطع</th></tr>";
    let tL=0,tQ=0;colors.forEach(c=>{const ly=Number(c.layers)||0;const pp=Number(c.pcsPerLayer)||0;const q=ly*pp;tL+=ly;tQ+=q;
      h+="<tr><td>"+(c.color||"-")+"</td><td style='font-weight:700'>"+ly+"</td><td>"+pp+"</td><td style='font-weight:700;color:#0284C7'>"+q+"</td></tr>"});
    h+="<tr style='background:#f8fafc;font-weight:800'><td>الاجمالي</td><td>"+tL+"</td><td></td><td style='color:#0284C7'>"+tQ+"</td></tr>";
    h+="</table></div>"});
  /* Balance - calculate from actual order data */
  let realBal=0;
  if(order.workshopDeliveries){const wds=(order.workshopDeliveries||[]).filter(wd=>wd.wsName===ws&&(!garmentType||wd.garmentType===garmentType||!wd.garmentType));
    wds.forEach(wd=>{const del=Number(wd.qty)||0;const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);realBal+=del-rcvd})}
  if(realBal>0)h+="<div style='margin:16px 0;padding:12px 20px;background:#FEF2F2;border:2px solid #FECACA;border-radius:10px;text-align:center;font-size:16px;font-weight:800;color:#EF4444'>الرصيد الباقي عند الورشة: "+realBal+" قطعة</div>";
  else h+="<div style='margin:16px 0;padding:12px 20px;background:#F0FDF4;border:2px solid #BBF7D0;border-radius:10px;text-align:center;font-size:16px;font-weight:800;color:#10B981'>✓ تم استلام الكمية كاملة</div>";
  /* Signature */
  h+="<div style='margin-top:50px;text-align:center;width:200px'><div style='border-top:2px solid #333;padding-top:8px;font-weight:700;font-size:13px'>توقيع المستلم</div></div>";
  printPage("اذن استلام مصنع — "+modelNo,h)
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
  const o={id:gid(),date:today,createdAt:new Date().toISOString(),modelNo:"",modelDesc:"",sizeSetId:"",sizeLabel:"",status:"تم القص",cutQty:0,deliveredQty:0,accItems:[],deliveries:[],workshopDeliveries:[],orderPieces:[],image:"",instructions:"",attachments:[],marker:""};
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
  FKEYS.forEach(k=>{
    if(!form["fabric"+k])return;
    const ca=form["colors"+k]||[];
    if(ca.length===0||!ca[0].color)e.push("لون خامة "+k+" مطلوب");
    if(ca.length>0&&(!ca[0].layers||ca[0].layers<=0))e.push("عدد الراقات مطلوب لخامة "+k);
    if(ca.length>0&&(!ca[0].pcsPerLayer||ca[0].pcsPerLayer<=0))e.push("القطع/راق مطلوب لخامة "+k);
    if(!gcons(form,k)||gcons(form,k)<=0)e.push("استهلاك خامة "+k+" مطلوب");
  });
  return e
}


async function printOrderSheet(order,t,activeFabs,statusCards){
  let qrSrc="";try{const QR=await loadQR();if(QR)qrSrc=await QR.toDataURL(window.location.origin+"?o="+encodeURIComponent(order.modelNo),{width:100,margin:1,errorCorrectionLevel:"L"})}catch(e){}
  let wsRows="";(order.workshopDeliveries||[]).forEach(wd=>{const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);wsRows+="<tr><td>"+wd.wsName+"</td><td>"+(wd.garmentType||"-")+"</td><td>"+wd.qty+"</td><td>"+rcvd+"</td><td>"+(wd.qty-rcvd)+"</td></tr>"});
  const col=getStatusColor(order.status,statusCards);
  let h="<div style='display:flex;gap:16px;align-items:flex-start;margin-bottom:16px'>";
  if(order.image)h+="<div style='width:100px;height:133px;border-radius:8px;overflow:hidden;border:1px solid #ddd;flex-shrink:0'><img src='"+order.image+"' style='width:100%;height:100%;object-fit:cover'/></div>";
  if(qrSrc)h+="<div style='flex-shrink:0'><img src='"+qrSrc+"' style='width:80px;height:80px'/></div>";
  h+="<div style='flex:1'><table><tr><th>رقم الموديل</th><td><b>"+order.modelNo+"</b></td><th>الوصف</th><td>"+order.modelDesc+"</td></tr><tr><th>المقاسات</th><td>"+order.sizeLabel+"</td><th>التاريخ</th><td>"+order.date+"</td></tr><tr><th>كمية القص</th><td><b>"+t.cutQty+"</b></td><th>تم التسليم</th><td>"+(order.deliveredQty||0)+"</td></tr><tr><th>الرصيد</th><td><b>"+t.balance+"</b></td><th>الحالة</th><td><span class='badge' style='background:"+col+"20;color:"+col+"'>"+order.status+"</span></td></tr>"+(order.marker?"<tr><th>ماركر</th><td colspan='3'>"+order.marker+"</td></tr>":"")+"</table></div></div>";
  /* Detailed fabric tables */
  if(activeFabs.length>0){h+="<h2 style='font-size:14px;margin:12px 0 6px'>الخامات</h2>";
    activeFabs.forEach(k=>{const colors=gc(order,k);const fp=order["fabricPieces"+k]||[];const cons=gcons(order,k);const unit=gf(order,k,"Unit")||"";
      h+="<div style='margin-bottom:10px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden'>";
      h+="<div style='background:#f1f5f9;padding:6px 12px;font-weight:700;font-size:12px;display:flex;justify-content:space-between'><span>"+gf(order,k,"Label")+"</span><span>استهلاك/راق: "+cons+(unit?" "+unit:"")+(fp.length>0?" | القطع: "+fp.join("، "):"")+"</span></div>";
      h+="<table style='margin:0'><tr><th>اللون</th><th>الراقات</th><th>قطع/راق</th><th>اجمالي القطع</th></tr>";
      let totalLayers=0,totalQty=0;colors.forEach(c=>{const q=(Number(c.layers)||0)*(Number(c.pcsPerLayer)||0);totalLayers+=(Number(c.layers)||0);totalQty+=q;
        h+="<tr><td>"+(c.color||"-")+"</td><td style='font-weight:700'>"+(c.layers||0)+"</td><td>"+(c.pcsPerLayer||0)+"</td><td style='font-weight:700;color:#0284C7'>"+q+"</td></tr>"});
      h+="<tr style='background:#f8fafc;font-weight:800'><td>الاجمالي</td><td>"+totalLayers+"</td><td></td><td style='color:#0284C7'>"+totalQty+"</td></tr>";
      h+="</table></div>"})};
  if(wsRows)h+="<h2 style='font-size:14px;margin:12px 0 6px'>الورش</h2><table><tr><th>الورشة</th><th>القطعة</th><th>الكمية</th><th>استلام مصنع</th><th>الرصيد</th></tr>"+wsRows+"</table>";
  if(order.instructions)h+="<h2 style='font-size:14px;margin:12px 0 6px'>تعليمات التشغيل</h2><div style='background:#f8fafc;padding:10px;border-radius:6px;white-space:pre-wrap;font-size:12px'>"+order.instructions+"</div>";
  h+="<div class='sig'><div class='sig-box'>مسؤول القص</div><div class='sig-box'>مسؤول التشغيل</div><div class='sig-box'>مدير الانتاج</div></div>";
  printPage("أمر تشغيل — "+order.modelNo,h)
}

/* ── UI Components (Light Glassmorphism) ── */
const FS=13;
const TH={textAlign:"right",padding:"6px 10px",fontSize:FS-2,fontWeight:600,color:T.textSec,whiteSpace:"nowrap",borderBottom:"2px solid "+T.brd,background:T.inputBg||T.cardSolid,letterSpacing:"0.03em"};
const TD={padding:"6px 10px",fontSize:FS,color:T.text,borderBottom:"1px solid "+T.brd,verticalAlign:"middle"};
const TDB={...TD,fontWeight:600};
const TDL={...TD,color:T.textSec,width:80,whiteSpace:"nowrap"};

function Badge({t,cards}){const col=getStatusColor(t,cards);return<span style={{padding:"5px 14px",borderRadius:20,fontSize:FS-2,fontWeight:600,background:col+"18",color:col,border:"1px solid "+col+"30"}}>{t}</span>}

function Btn({children,on,primary,danger,ghost,onClick,small,disabled,style:sx}){
  let bg=T.cardSolid,fg=T.text,bd="1px solid "+T.brd;
  if(on||primary){bg="linear-gradient(135deg,#0EA5E9,#0284C7)";fg="#fff";bd="none"}
  if(danger){bg=T.err+"12";fg=T.err;bd="1px solid "+T.err+"30"}
  if(ghost){bg="transparent";bd="none";fg=T.textSec}
  const mob=typeof window!=="undefined"&&window.innerWidth<768;
  return<button onClick={onClick} disabled={disabled} style={{padding:small?(mob?"6px 12px":"4px 10px"):(mob?"9px 18px":"7px 16px"),borderRadius:8,fontSize:small?FS-2:FS,fontWeight:600,background:bg,color:fg,border:bd,cursor:disabled?"default":"pointer",fontFamily:"inherit",opacity:disabled?0.5:1,boxShadow:primary?"0 2px 8px rgba(14,165,233,0.2)":"none",minHeight:mob?36:undefined,...(sx||{})}}>{children}</button>
}

function Inp({value,onChange,placeholder,type,step,style:sx,readOnly}){
  return<input type={type||"text"} step={step||"any"} value={value==null?"":value} readOnly={readOnly} onChange={e=>onChange&&onChange(e.target.value)} placeholder={placeholder} style={{width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid "+T.brd,fontSize:FS,fontFamily:"inherit",background:readOnly?T.bg:T.cardSolid,color:T.text,boxSizing:"border-box",outline:"none",...(sx||{})}}/>
}

function Sel({value,onChange,children}){
  return<select value={value==null?"":value} onChange={e=>onChange(e.target.value)} style={{width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid "+T.brd,fontSize:FS,fontFamily:"inherit",background:T.cardSolid,color:T.text,boxSizing:"border-box"}}>{children}</select>
}

function Card({children,title,extra,accent,style:sx}){
  return<div style={{background:T.card,backdropFilter:"blur(12px)",borderRadius:12,border:"1px solid "+T.brd,boxShadow:T.shadow,overflow:"visible",...(sx||{})}}>
    {(title||extra)&&<div style={{padding:"10px 16px",borderBottom:"1px solid "+T.brd,display:"flex",justifyContent:"space-between",alignItems:"center",background:accent||"rgba(248,250,252,0.8)",borderRadius:"12px 12px 0 0"}}><span style={{fontSize:FS+1,fontWeight:700,color:accent?"#fff":T.text}}>{title}</span>{extra}</div>}
    <div style={{padding:14}}>{children}</div>
  </div>
}

function MetricCard({label,value,color,icon,sub}){
  return<div style={{background:T.card,backdropFilter:"blur(12px)",borderRadius:12,padding:"14px 16px",border:"1px solid "+T.brd,boxShadow:T.shadow,display:"flex",alignItems:"center",gap:12}}>
    <div style={{width:40,height:40,borderRadius:10,background:(color||T.accent)+"12",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{icon}</div>
    <div style={{flex:1}}>
      <div style={{fontSize:FS-2,color:T.textSec,marginBottom:2,fontWeight:500}}>{label}</div>
      <div style={{fontSize:22,fontWeight:800,color:color||T.text}}>{value}</div>
      {sub&&<div style={{fontSize:FS-3,color:T.textMut,marginTop:1}}>{sub}</div>}
    </div>
  </div>
}

function PBar({value,color}){return<div style={{height:6,borderRadius:3,background:"#E2E8F0",overflow:"hidden",marginTop:4}}><div style={{height:"100%",width:Math.min(value,100)+"%",borderRadius:3,background:color||"linear-gradient(90deg,#0EA5E9,#06B6D4)",transition:"width 0.6s"}}/></div>}

function DelBtn({onConfirm,label,blocked}){
  const[confirm,setConfirm]=useState(false);const[showBlock,setShowBlock]=useState(false);
  if(showBlock)return<div style={{display:"inline-flex",gap:4,alignItems:"center",flexWrap:"wrap"}}><span style={{fontSize:FS-3,color:T.err,fontWeight:600,maxWidth:200}}>{"⚠️ "+blocked}</span><Btn ghost small onClick={()=>setShowBlock(false)}>✓</Btn></div>;
  if(confirm)return<div style={{display:"inline-flex",gap:4,alignItems:"center"}}><Btn danger small onClick={()=>{onConfirm();setConfirm(false)}}>✓ تأكيد</Btn><Btn ghost small onClick={()=>setConfirm(false)}>✕</Btn></div>;
  return<Btn danger small onClick={()=>blocked?setShowBlock(true):setConfirm(true)}>{label||"🗑️"}</Btn>
}

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
          <td style={{...TDB,width:80,background:T.accentBg,textAlign:"center",borderRadius:6,color:T.accent}}>{c.qty}</td>
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
  const[email,setEmail]=useState("");const[pass,setPass]=useState("");
  const[err,setErr]=useState("");const[loading,setLoading]=useState(false);
  const handleLogin=async()=>{if(!email||!pass){setErr("ادخل الايميل وكلمة المرور");return}setLoading(true);setErr("");try{await signInWithEmailAndPassword(auth,email,pass)}catch(e){setErr(e.code==="auth/invalid-credential"?"بيانات الدخول غلط":"خطأ: "+e.message)}setLoading(false)};
  const iS={width:"100%",padding:"14px 16px",borderRadius:14,border:"2px solid "+T.brd,fontSize:FS+1,fontFamily:"inherit",boxSizing:"border-box",background:T.cardSolid,color:T.text,outline:"none"};
  return<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#EFF6FF,#DBEAFE,#E0F2FE)",direction:"rtl",fontFamily:"'Cairo',sans-serif",padding:20}}>
    <div style={{width:"100%",maxWidth:420,background:T.card,backdropFilter:"blur(20px)",borderRadius:28,padding:44,border:"1px solid "+T.brd,boxShadow:T.shadow}}>
      <div style={{textAlign:"center",marginBottom:36}}>
        <img src={CLARK_LOGO} alt="CLARK" style={{width:200,marginBottom:12}}/>
        <div style={{fontSize:FS,color:T.textSec}}>نظام ادارة القص والتشغيل</div>
      </div>
      <div style={{marginBottom:16}}><label style={{display:"block",fontSize:FS,color:T.textSec,marginBottom:6,fontWeight:600}}>البريد الالكتروني</label><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="example@email.com" type="email" onKeyDown={e=>e.key==="Enter"&&handleLogin()} style={iS}/></div>
      <div style={{marginBottom:20}}><label style={{display:"block",fontSize:FS,color:T.textSec,marginBottom:6,fontWeight:600}}>كلمة المرور</label><input type="password" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleLogin()} style={iS}/></div>
      {err&&<div style={{color:T.err,fontSize:FS,marginBottom:12,textAlign:"center",fontWeight:600}}>{err}</div>}
      <button onClick={handleLogin} disabled={loading} style={{width:"100%",padding:16,borderRadius:14,background:"linear-gradient(135deg,#0EA5E9,#0284C7)",color:"#fff",fontSize:FS+2,fontWeight:800,border:"none",cursor:"pointer",boxShadow:"0 4px 16px rgba(14,165,233,0.3)",fontFamily:"inherit"}}>{loading?"جاري الدخول...":"تسجيل الدخول"}</button>
      <div style={{textAlign:"center",marginTop:14,fontSize:FS-1,color:T.textMut}}>تواصل مع المدير للحصول على حساب</div>
    </div>
  </div>
}

const TABS=[
  {key:"dashboard",label:"لوحة التحكم",icon:"📊",color:"#0EA5E9",bg:"#E0F2FE"},
  {key:"orders",label:"أوامر القص",icon:"✂️",color:"#8B5CF6",bg:"#EDE9FE"},
  {key:"details",label:"تفاصيل الأوردر",icon:"📋",color:"#F59E0B",bg:"#FEF3C7"},
  {key:"external",label:"تشغيل خارجي",icon:"🏭",color:"#10B981",bg:"#D1FAE5"},
  {key:"stock",label:"تسليم مخزن جاهز",icon:"📦",color:"#059669",bg:"#ECFDF5"},
  {key:"reports",label:"التقارير",icon:"📈",color:"#06B6D4",bg:"#CFFAFE"},
  {key:"search",label:"بحث",icon:"🔍",color:"#6366F1",bg:"#E0E7FF"},
  {key:"db",label:"قاعدة البيانات",icon:"🗄️",color:"#EF4444",bg:"#FEE2E2"},
  {key:"settings",label:"الاعدادات",icon:"⚙️",color:"#64748B",bg:"#F1F5F9"}
];

/* ══ MAIN APP ══ */
export default function App(){
  /* QR scan: ?o=modelNo → after login, open order details */
  const qrModelNo=new URLSearchParams(window.location.search).get("o");

  const[user,setUser]=useState(null);const[authLoading,setAuthLoading]=useState(true);
  const[config,setConfig]=useState(INIT_CONFIG);const[orders,setOrders]=useState([]);const[dataLoading,setDataLoading]=useState(true);
  const[tab,setTab]=useState("home");const[sel,setSel]=useState(null);const[gSearch,setGSearch]=useState("");const[showAlerts,setShowAlerts]=useState(false);const[showLogout,setShowLogout]=useState(false);
  const[theme,setTheme]=useState(()=>localStorage.getItem("clark-theme")||"light");
  T=THEMES[theme]||THEMES.light;
  useEffect(()=>{localStorage.setItem("clark-theme",theme);document.body.style.background=T.bodyBg||T.bg},[theme]);
  const w=useWin();const isMob=w<768;const season=config.activeSeason||"WS26";

  useEffect(()=>{const unsub=onAuthStateChanged(auth,u=>{setUser(u);setAuthLoading(false)});return unsub},[]);
  useEffect(()=>{if(!user)return;const unsub=onSnapshot(doc(db,"factory","config"),snap=>{if(snap.exists())setConfig(snap.data());else setDoc(doc(db,"factory","config"),INIT_CONFIG)});return()=>unsub()},[user]);
  useEffect(()=>{if(!user||!season)return;setDataLoading(true);const unsub=onSnapshot(collection(db,"seasons",season,"orders"),snap=>{setOrders(snap.docs.map(d=>({_docId:d.id,...d.data()})));setDataLoading(false)});return()=>unsub()},[user,season]);

  const upConfig=useCallback(fn=>{setConfig(prev=>{const next=JSON.parse(JSON.stringify(prev));fn(next);setDoc(doc(db,"factory","config"),next);return next})},[]);
  const addOrder=async o=>{await addDoc(collection(db,"seasons",season,"orders"),o)};
  const updOrder=async(orderId,fn)=>{const ord=orders.find(o=>o.id===orderId);if(!ord)return;const updated=JSON.parse(JSON.stringify(ord));fn(updated);const clean={...updated};delete clean._docId;await updateDoc(doc(db,"seasons",season,"orders",ord._docId),clean)};
  const delOrder=async orderId=>{const ord=orders.find(o=>o.id===orderId);if(ord)await deleteDoc(doc(db,"seasons",season,"orders",ord._docId))};
  const replaceOrder=async(orderId,newData)=>{const ord=orders.find(o=>o.id===orderId);if(!ord)return;const clean={...newData};delete clean._docId;await setDoc(doc(db,"seasons",season,"orders",ord._docId),clean)};
  const goD=id=>{setSel(id);setTab("details")};
  /* QR scan auto-navigate */
  const qrDone=useRef(false);
  useEffect(()=>{if(qrModelNo&&!qrDone.current&&orders.length>0){const o=orders.find(x=>x.modelNo===qrModelNo);if(o){qrDone.current=true;goD(o.id);window.history.replaceState({},"",window.location.pathname)}}},[orders,qrModelNo]);

  const data={...config,orders};
  const getUserRole=()=>{if(config.users&&config.users[user?.uid])return config.users[user.uid];const byEmail=(config.usersList||[]).find(u=>u.email===user?.email);if(byEmail)return byEmail.role;return"admin"};
  const userRole=getUserRole();const canEdit=userRole==="admin"||userRole==="manager";
  const statusCards=config.statusCards||DEFAULT_STATUSES;

  if(authLoading)return null;
  if(!user)return<LoginScreen/>;
  if(dataLoading)return<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#EFF6FF",direction:"rtl",fontFamily:"'Cairo',sans-serif"}}>
    <div style={{width:280}}>
      <div style={{height:28,borderRadius:8,background:"#E2E8F0",overflow:"hidden",position:"relative"}}>
        <div style={{position:"absolute",top:0,right:0,bottom:0,width:"100%",borderRadius:8,background:"linear-gradient(90deg,#0EA5E9,#0284C7)",transformOrigin:"right",animation:"fillOnce 2s ease-out 1 forwards",transform:"scaleX(0)"}}/>
        <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"#fff",textShadow:"0 1px 2px rgba(0,0,0,0.3)",zIndex:1}}>جاري تحميل البيانات</div>
      </div>
      <style>{`@keyframes fillOnce{from{transform:scaleX(0)}to{transform:scaleX(1)}}`}</style>
    </div>
  </div>;
  const userName=user.displayName||user.email.split("@")[0];
  /* Compute alerts */
  const appAlerts=(()=>{try{const a=[];
    data.orders.forEach(o=>{const wds=o.workshopDeliveries||[];const pieces=o.orderPieces||[];
      if(pieces.length>0){
        const allMissing=pieces.every(p=>wds.filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0)===0);
        const someMissing=pieces.some(p=>wds.filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0)===0);
        if(allMissing&&wds.length===0)a.push({msg:o.modelNo+" — كل القطع لم تُسلَّم ("+pieces.join("، ")+")",color:T.warn,icon:"⏳",orderId:o.id});
        else if(someMissing){const missing=pieces.filter(p=>wds.filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0)===0);const done=pieces.filter(p=>!missing.includes(p));a.push({msg:o.modelNo+" — متبقي: "+missing.join("، ")+(done.length>0?" (تم: "+done.join("، ")+")":""),color:T.warn,icon:"⏳",orderId:o.id})}
      }else if(wds.length===0&&o.status==="تم القص"){a.push({msg:o.modelNo+" — "+o.modelDesc+" لم يُسلَّم لأي ورشة",color:T.warn,icon:"⏳",orderId:o.id})}
    });
    /* Delay alerts */
    const now=new Date();data.orders.filter(o=>o.status!=="تم الشحن").forEach(o=>{let lastDate=o.date;(o.workshopDeliveries||[]).forEach(wd=>{if(wd.date>lastDate)lastDate=wd.date;(wd.receives||[]).forEach(r=>{if(r.date>lastDate)lastDate=r.date})});(o.deliveries||[]).forEach(d=>{if(d.date>lastDate)lastDate=d.date});const diff=Math.floor((now-new Date(lastDate))/(1000*60*60*24));if(diff>7&&!a.find(x=>x.orderId===o.id))a.push({msg:o.modelNo+" بدون حركة منذ "+diff+" يوم",color:T.err,icon:"🔴",orderId:o.id})});
    /* Completion */
    const _cutQ=data.orders.reduce((s,o)=>s+calcOrder(o).cutQty,0);const _delQ=data.orders.reduce((s,o)=>s+(o.deliveredQty||0),0);if(_cutQ&&Math.round(_delQ/_cutQ*100)>=100)a.push({msg:"تم الانتهاء من جميع الأوردرات!",color:T.ok,icon:"🎉"});
    /* Workshop limit */
    (data.workshops||[]).filter(w=>w.type!=="داخلي").forEach(w=>{let due=0;data.orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===w.name).forEach(wd=>{(wd.receives||[]).forEach(r=>{due+=r2((Number(r.qty)||0)*(Number(r.price)||0))})})});const purch=(data.wsPayments||[]).filter(p=>p.wsName===w.name&&p.type==="purchase").reduce((s,p)=>s+(Number(p.amount)||0),0);const paid=(data.wsPayments||[]).filter(p=>p.wsName===w.name&&p.type==="payment").reduce((s,p)=>s+(Number(p.amount)||0),0);const pct=w.payPercent||70;const limit=r2((due+purch)*(pct/100));if(paid>limit&&due>0)a.push({msg:w.name+" تجاوز حد "+pct+"%",color:T.err,icon:"⚠️"})});
    return a}catch(e){console.error("Alert error:",e);return[]}})();

  const goHome=()=>{setTab("home");setSel(null)};
  const goTo=(key)=>{setTab(key);if(key!=="details")setSel(null)};

  return<div onClick={()=>{if(showAlerts)setShowAlerts(false);if(gSearch)setGSearch("");if(showLogout)setShowLogout(false)}} style={{minHeight:"100vh",direction:"rtl",fontFamily:"'Cairo',sans-serif",background:T.bg,color:T.text,fontSize:FS,display:"flex",flexDirection:"column"}}>
    {/* Top Bar */}
    <div style={{padding:isMob?"8px 10px":"12px 28px",background:T.cardSolid,borderBottom:"1px solid "+T.brd,display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
      <div style={{display:"flex",alignItems:"center",gap:isMob?6:10}}>
        {tab!=="home"&&<div onClick={goHome} style={{cursor:"pointer",fontSize:isMob?22:28,color:T.accent,padding:isMob?"4px 8px":"6px 12px",borderRadius:10,background:T.accentBg,lineHeight:1}}>{"⌂"}</div>}
        <img src={config.logo||CLARK_LOGO} alt="CLARK" style={{height:isMob?22:28,objectFit:"contain"}}/>
        <span style={{fontSize:isMob?10:FS-1,color:T.textSec,padding:"2px 8px",background:T.accentBg,borderRadius:6}}>{season}</span>
      </div>
      {!isMob&&<div onClick={e=>e.stopPropagation()} style={{flex:1,display:"flex",justifyContent:"center",position:"relative"}}>
        <div style={{position:"relative",width:280}}>
          <input value={gSearch} onChange={e=>setGSearch(e.target.value)} placeholder="🔍 بحث سريع..." style={{width:"100%",padding:"5px 12px",borderRadius:8,border:"1px solid "+T.brd,fontSize:FS-1,fontFamily:"inherit",background:T.inputBg||T.cardSolid,color:T.text,boxSizing:"border-box",outline:"none"}}/>
          {gSearch.trim()&&(()=>{const q=gSearch.trim().toLowerCase();const res=[];
            data.orders.forEach(o=>{if([o.modelNo,o.modelDesc].join(" ").toLowerCase().includes(q))res.push({type:"أوردر",label:o.modelNo+" — "+o.modelDesc,action:()=>{goD(o.id);setGSearch("")}})});
            (data.workshops||[]).forEach(w=>{if(w.name.toLowerCase().includes(q))res.push({type:"ورشة",label:w.name+(w.owner?" — "+w.owner:""),action:()=>{setTab("db");setGSearch("")}})});
            (data.fabrics||[]).forEach(f=>{if(f.name.toLowerCase().includes(q))res.push({type:"خامة",label:f.name,action:()=>{setTab("db");setGSearch("")}})});
            return<div style={{position:"absolute",top:"100%",right:0,left:0,marginTop:4,background:T.cardSolid,border:"1px solid "+T.brd,borderRadius:10,boxShadow:"0 8px 30px rgba(0,0,0,0.15)",zIndex:999,maxHeight:300,overflow:"auto"}}>
              {res.slice(0,8).map((r,i)=><div key={i} onClick={r.action} style={{padding:"8px 12px",cursor:"pointer",borderBottom:"1px solid "+T.brd,display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:FS-1}} onMouseEnter={e=>e.currentTarget.style.background=T.accentBg} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <span>{r.label}</span><span style={{fontSize:FS-3,color:T.textMut,background:T.bg,padding:"1px 6px",borderRadius:4}}>{r.type}</span>
              </div>)}
              {res.length===0&&<div style={{padding:12,textAlign:"center",color:T.textMut,fontSize:FS-1}}>لا توجد نتائج</div>}
            </div>})()}
        </div>
      </div>}
      <div style={{display:"flex",alignItems:"center",gap:isMob?6:10}}>
        {/* Alerts Bell */}
        <div style={{position:"relative"}} onClick={e=>e.stopPropagation()}>
          <div onClick={()=>setShowAlerts(!showAlerts)} style={{cursor:"pointer",fontSize:isMob?18:22,padding:"2px 6px",borderRadius:8,background:appAlerts.length>0?T.warn+"12":"transparent",position:"relative"}}>🔔
            {appAlerts.length>0&&<span style={{position:"absolute",top:-2,left:-2,width:16,height:16,borderRadius:8,background:T.err,color:"#fff",fontSize:9,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>{appAlerts.length}</span>}
          </div>
          {showAlerts&&<div style={{position:"absolute",top:"100%",left:0,marginTop:6,width:isMob?280:340,background:T.cardSolid,border:"1px solid "+T.brd,borderRadius:12,boxShadow:"0 8px 30px rgba(0,0,0,0.15)",zIndex:999,maxHeight:400,overflow:"auto"}}>
            <div style={{padding:"10px 14px",borderBottom:"1px solid "+T.brd,fontWeight:700,fontSize:FS,color:T.text}}>{"الاشعارات ("+appAlerts.length+")"}</div>
            {appAlerts.length>0?appAlerts.map((a,i)=><div key={i} onClick={()=>{if(a.orderId){goD(a.orderId);setShowAlerts(false)}}} style={{padding:"10px 14px",borderBottom:"1px solid "+T.brd,display:"flex",gap:8,alignItems:"flex-start",cursor:a.orderId?"pointer":"default",transition:"background 0.15s"}} onMouseEnter={e=>{if(a.orderId)e.currentTarget.style.background=T.accentBg}} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <span style={{fontSize:16,flexShrink:0}}>{a.icon}</span>
              <div style={{flex:1}}><span style={{fontSize:FS-1,color:a.color,fontWeight:600,lineHeight:1.5}}>{a.msg}</span>{a.orderId&&<div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>اضغط لفتح الأوردر</div>}</div>
            </div>):<div style={{padding:20,textAlign:"center",color:T.textMut,fontSize:FS-1}}>لا توجد اشعارات</div>}
          </div>}
        </div>
        <span style={{fontSize:isMob?11:FS,color:T.textSec}}>{userName}</span>
        {!showLogout?<button onClick={e=>{e.stopPropagation();setShowLogout(true)}} style={{padding:isMob?"4px 10px":"6px 14px",borderRadius:8,background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30",cursor:"pointer",fontSize:isMob?11:FS-1,fontWeight:600,fontFamily:"inherit"}}>خروج</button>
        :<div onClick={e=>e.stopPropagation()} style={{display:"flex",gap:4,alignItems:"center"}}><button onClick={()=>signOut(auth)} style={{padding:isMob?"4px 8px":"5px 12px",borderRadius:6,background:T.err,color:"#fff",border:"none",cursor:"pointer",fontSize:isMob?10:FS-1,fontWeight:700,fontFamily:"inherit"}}>تأكيد</button><button onClick={()=>setShowLogout(false)} style={{padding:isMob?"4px 8px":"5px 12px",borderRadius:6,background:T.cardSolid,color:T.textSec,border:"1px solid "+T.brd,cursor:"pointer",fontSize:isMob?10:FS-1,fontWeight:600,fontFamily:"inherit"}}>الغاء</button></div>}
      </div>
    </div>
    <div style={{flex:1,overflow:"auto",padding:isMob?"8px 10px":"12px 24px"}}>
      {/* HOME SCREEN */}
      {tab==="home"&&<div>
          <div style={{textAlign:"center",marginBottom:isMob?14:20}}><h1 style={{fontSize:isMob?22:32,fontWeight:800,color:T.text,margin:0}}>{"مرحباً، "+userName}</h1></div>
          <div style={{display:"grid",gridTemplateColumns:isMob?"repeat(3,1fr)":"repeat(5,1fr)",gap:isMob?10:16,maxWidth:800,margin:"0 auto"}}>
            {TABS.filter(t=>t.key!=="settings"||userRole==="admin").map(t=><div key={t.key} onClick={()=>goTo(t.key)} style={{background:T.cardSolid,borderRadius:16,padding:isMob?"16px 8px":"20px 14px",border:"1px solid "+T.brd,boxShadow:T.shadow,cursor:"pointer",textAlign:"center",transition:"transform 0.15s,box-shadow 0.15s"}} onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="0 8px 30px rgba(0,0,0,0.12)"}} onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow=T.shadow}}>
              <div style={{width:isMob?44:52,height:isMob?44:52,borderRadius:14,background:t.bg,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 10px",fontSize:isMob?22:26}}>{t.icon}</div>
              <div style={{fontSize:isMob?FS-3:FS-1,fontWeight:700,color:T.text}}>{t.label}</div>
            </div>)}
          </div>
      </div>}
      {/* PAGES with back button */}
      {tab!=="home"&&<div>
        {tab==="dashboard"&&<DashPg data={data} goD={goD} isMob={isMob} season={season} statusCards={statusCards}/>}
        {tab==="db"&&<DBPg data={data} upConfig={upConfig} isMob={isMob} canEdit={canEdit} statusCards={statusCards}/>}
        {tab==="orders"&&<OrdPg data={data} addOrder={addOrder} delOrder={delOrder} updOrder={updOrder} goD={goD} isMob={isMob} canEdit={canEdit} statusCards={statusCards}/>}
        {tab==="details"&&<DetPg data={data} updOrder={updOrder} replaceOrder={replaceOrder} sel={sel} setSel={setSel} isMob={isMob} canEdit={canEdit} statusCards={statusCards} goHome={goHome}/>}
        {tab==="external"&&<ExtProdPg data={data} updOrder={updOrder} upConfig={upConfig} isMob={isMob} canEdit={canEdit} statusCards={statusCards} season={season}/>}
        {tab==="stock"&&<StockPg data={data} updOrder={updOrder} isMob={isMob} canEdit={canEdit} statusCards={statusCards}/>}
        {tab==="search"&&<SearchPg data={data} goD={goD} isMob={isMob} season={season} statusCards={statusCards}/>}
        {tab==="reports"&&<ReportsHub data={data} isMob={isMob} season={season} statusCards={statusCards}/>}
        {tab==="settings"&&<SettingsPg config={config} upConfig={upConfig} isMob={isMob} user={user} theme={theme} setTheme={setTheme} season={season} orders={orders}/>}
      </div>}
    </div>
  </div>
}

/* ══ DASHBOARD ══ */
function DashPg({data,goD,isMob,season,statusCards}){
  const orders=data.orders;
  const cutQ=orders.reduce((s,o)=>s+calcOrder(o).cutQty,0);
  const delQ=orders.reduce((s,o)=>s+(o.deliveredQty||0),0);
  const comp=cutQ?Math.round((delQ/cutQ)*100):0;

  /* في التشغيل = مجموع الكميات اللي اتسلمت للورش - مجموع الكميات المستلمة من الورش */
  let totalDeliveredToWs=0,totalReceivedFromWs=0;
  orders.forEach(o=>{(o.workshopDeliveries||[]).forEach(wd=>{totalDeliveredToWs+=(Number(wd.qty)||0);(wd.receives||[]).forEach(r=>{totalReceivedFromWs+=(Number(r.qty)||0)})})});
  const inProdQty=totalDeliveredToWs-totalReceivedFromWs;

  const sc={};orders.forEach(o=>{sc[o.status]=(sc[o.status]||0)+1});
  const pieData=Object.entries(sc).map(([name,value])=>({name,value,fill:getStatusColor(name,statusCards)}));
  const recent=sortOrders(orders).slice(0,6);

  /* Workshop comparison chart data */
  const wsMap={};
  orders.forEach(o=>{(o.workshopDeliveries||[]).forEach(wd=>{
    if(!wsMap[wd.wsName])wsMap[wd.wsName]={name:wd.wsName,delivered:0,received:0};
    wsMap[wd.wsName].delivered+=(Number(wd.qty)||0);
    (wd.receives||[]).forEach(r=>{wsMap[wd.wsName].received+=(Number(r.qty)||0)})
  })});
  const wsChartData=Object.values(wsMap).sort((a,b)=>b.received-a.received);

  /* Workshop accounts totals */
  let wsDue=0,wsPaid=0,wsPurchase=0;
  const _isInt=(n)=>{const w=(data.workshops||[]).find(x=>x.name===n);return w?w.type==="داخلي":false};
  const wsAccounts=(wsName)=>{if(_isInt(wsName))return{due:0,totalPaid:0,totalPurchase:0,balance:0};let due=0;data.orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===wsName).forEach(wd=>{(wd.receives||[]).forEach(r=>{due+=r2((Number(r.qty)||0)*(Number(r.price)||0))})})});const payments=(data.wsPayments||[]).filter(p=>p.wsName===wsName);const totalPaid=payments.filter(p=>p.type==="payment").reduce((s,p)=>s+(Number(p.amount)||0),0);const totalPurchase=payments.filter(p=>p.type==="purchase").reduce((s,p)=>s+(Number(p.amount)||0),0);return{due,totalPaid,totalPurchase,balance:due+totalPurchase-totalPaid}};
  orders.forEach(o=>{(o.workshopDeliveries||[]).forEach(wd=>{if(_isInt(wd.wsName))return;(wd.receives||[]).forEach(r=>{wsDue+=r2((Number(r.qty)||0)*(Number(r.price)||0))})})});
  (data.wsPayments||[]).forEach(p=>{if(p.type==="payment")wsPaid+=(Number(p.amount)||0);else wsPurchase+=(Number(p.amount)||0)});
  const wsBalance=wsDue+wsPurchase-wsPaid;

  return<div>
    <Card title={"الانتاج - الموسم "+season+" ("+orders.length+" موديل)"} style={{marginBottom:12}}>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"repeat(5,1fr)",gap:10}}>
        <div style={{padding:10,borderRadius:8,background:T.accent+"06",border:"1px solid "+T.accent+"12",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>كمية القص</div><div style={{fontSize:isMob?18:22,fontWeight:800,color:T.accent}}>{fmt(cutQ)}</div><div style={{fontSize:FS-3,color:T.textMut}}>قطعة</div></div>
        <div style={{padding:10,borderRadius:8,background:T.ok+"06",border:"1px solid "+T.ok+"12",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>مخزن جاهز</div><div style={{fontSize:isMob?18:22,fontWeight:800,color:T.ok}}>{fmt(delQ)}</div><div style={{fontSize:FS-3,color:T.textMut}}>قطعة</div></div>
        <div style={{padding:10,borderRadius:8,background:T.warn+"06",border:"1px solid "+T.warn+"12",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>رصيد المصنع</div><div style={{fontSize:isMob?18:22,fontWeight:800,color:T.warn}}>{fmt(cutQ-delQ)}</div><div style={{fontSize:FS-3,color:T.textMut}}>قطعة</div></div>
        <div style={{padding:10,borderRadius:8,background:"#8B5CF606",border:"1px solid #8B5CF612",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>عند الورش</div><div style={{fontSize:isMob?18:22,fontWeight:800,color:"#8B5CF6"}}>{fmt(Math.max(0,inProdQty))}</div><div style={{fontSize:FS-3,color:T.textMut}}>{"تسليم ورشة: "+fmt(totalDeliveredToWs)+" | استلام مصنع: "+fmt(totalReceivedFromWs)}</div></div>
        <div style={{padding:10,borderRadius:8,background:(comp>=80?T.ok:comp>=50?T.warn:T.err)+"06",border:"1px solid "+(comp>=80?T.ok:comp>=50?T.warn:T.err)+"12",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>الانجاز</div><div style={{fontSize:isMob?18:22,fontWeight:800,color:comp>=80?T.ok:comp>=50?T.warn:T.err}}>{comp+"%"}</div><PBar value={comp}/></div>
      </div>
    </Card>
    {/* Workshop Accounts Summary */}
    <Card title="حسابات الورش" style={{marginBottom:12}}>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"repeat(3,1fr)",gap:12}}>
        <div style={{padding:12,borderRadius:10,background:T.accent+"08",border:"1px solid "+T.accent+"15",textAlign:"center"}}>
          <div style={{fontSize:FS-1,color:T.textSec,marginBottom:4}}>مستحق للورش</div>
          <div style={{fontSize:20,fontWeight:800,color:T.accent}}>{fmt(r2(wsDue+wsPurchase))+" ج.م"}</div>
        </div>
        <div style={{padding:12,borderRadius:10,background:T.warn+"08",border:"1px solid "+T.warn+"15",textAlign:"center"}}>
          <div style={{fontSize:FS-1,color:T.textSec,marginBottom:4}}>اجمالي المدفوع</div>
          <div style={{fontSize:20,fontWeight:800,color:T.warn}}>{fmt(r2(wsPaid))+" ج.م"}</div>
        </div>
        <div style={{padding:12,borderRadius:10,background:(wsBalance>0?T.err:T.ok)+"08",border:"1px solid "+(wsBalance>0?T.err:T.ok)+"15",textAlign:"center"}}>
          <div style={{fontSize:FS-1,color:T.textSec,marginBottom:4}}>رصيد الورش</div>
          <div style={{fontSize:20,fontWeight:800,color:wsBalance>0?T.err:T.ok}}>{fmt(r2(wsBalance))+" ج.م"}</div>
        </div>
      </div>
    </Card>
    <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:16,marginBottom:24}}>
      <Card title="توزيع الحالات">{pieData.length>0?<div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
        <ResponsiveContainer width={isMob?"100%":160} height={160}><PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={68} paddingAngle={3} dataKey="value" stroke="none">{pieData.map((d,i)=><Cell key={i} fill={d.fill}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer>
        <div style={{flex:1,minWidth:120}}>{pieData.map((d,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",fontSize:FS}}><span style={{width:12,height:12,borderRadius:4,background:d.fill,flexShrink:0}}/><span style={{color:T.textSec,flex:1}}>{d.name}</span><span style={{fontWeight:700}}>{d.value}</span></div>)}</div>
      </div>:<p style={{color:T.textSec,textAlign:"center",padding:30}}>لا توجد بيانات</p>}</Card>
      {/* Workshop Comparison Chart */}
      <Card title="أداء الورش - تسليم ورشة vs استلام مصنع">{wsChartData.length>0?<div>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={wsChartData} margin={{top:10,right:10,bottom:5}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false}/>
            <XAxis dataKey="name" tick={{fontSize:11,fill:T.text}} interval={0} angle={isMob?-45:0} textAnchor={isMob?"end":"middle"} height={isMob?60:30}/>
            <YAxis tick={{fontSize:11,fill:T.textSec}}/>
            <Tooltip contentStyle={{borderRadius:8,border:"1px solid #E2E8F0",fontSize:12}}/>
            <Legend wrapperStyle={{fontSize:11}}/>
            <Bar dataKey="delivered" name="تسليم ورشة" fill="#8B5CF6" barSize={isMob?16:24} radius={[4,4,0,0]}/>
            <Bar dataKey="received" name="استلام مصنع" fill="#10B981" barSize={isMob?16:24} radius={[4,4,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
        {wsChartData.length>0&&<div style={{marginTop:8,padding:8,background:"#F0FDF4",borderRadius:8,border:"1px solid "+T.ok+"30",display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:18}}>🏆</span>
          <span style={{fontSize:FS,fontWeight:700,color:T.ok}}>{"أعلى ورشة: "+wsChartData[0].name+" ("+wsChartData[0].received+" قطعة)"}</span>
        </div>}
      </div>:<p style={{color:T.textSec,textAlign:"center",padding:20}}>لا توجد بيانات ورش</p>}</Card>
    </div>
    <Card title="آخر الأوامر"><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:400}}>
      <thead><tr>{["موديل","الوصف","الكمية","الحالة"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
      <tbody>{recent.map(o=>{const t=calcOrder(o);return<tr key={o.id} style={{cursor:"pointer"}} onClick={()=>goD(o.id)}><td style={TDB}>{o.modelNo}</td><td style={TD}>{o.modelDesc}</td><td style={{...TDB,color:T.accent}}>{t.cutQty}</td><td style={TD}><Badge t={o.status} cards={statusCards}/></td></tr>})}
        {recent.length===0&&<tr><td colSpan={4} style={{...TD,textAlign:"center",color:T.textSec,padding:40}}>لا توجد أوامر</td></tr>}
      </tbody>
    </table></div></Card>
  </div>
}

/* ══ DB ══ */
function DBPg({data,upConfig,isMob,canEdit,statusCards}){
  const[sub,setSub]=useState("fab");
  const[ff,setFf]=useState({name:"",unit:"كيلو",price:"",_eid:null});
  const[af,setAf]=useState({name:"",unit:"قطعة",price:"",_eid:null});
  const[sfld,setSfld]=useState({label:"",_eid:null});
  const[wf,setWf]=useState("");
  const[stName,setStName]=useState("");const[stColor,setStColor]=useState("#0EA5E9");const[stEid,setStEid]=useState(null);
  const[gName,setGName]=useState("");const[gEid,setGEid]=useState(null);

  const saveFab=()=>{if(!ff.name)return;upConfig(d=>{if(ff._eid){const idx=d.fabrics.findIndex(x=>x.id===ff._eid);if(idx>=0)d.fabrics[idx]={...d.fabrics[idx],name:ff.name,unit:ff.unit,price:Number(ff.price)||0}}else{d.fabrics.push({id:Date.now(),name:ff.name,unit:ff.unit,price:Number(ff.price)||0})}});setFf({name:"",unit:"كيلو",price:"",_eid:null})};
  const saveAcc=()=>{if(!af.name)return;upConfig(d=>{if(af._eid){const idx=d.accessories.findIndex(x=>x.id===af._eid);if(idx>=0)d.accessories[idx]={...d.accessories[idx],name:af.name,unit:af.unit,price:Number(af.price)||0}}else{d.accessories.push({id:Date.now(),name:af.name,unit:af.unit,price:Number(af.price)||0})}});setAf({name:"",unit:"قطعة",price:"",_eid:null})};
  const saveSize=()=>{if(!sfld.label)return;upConfig(d=>{if(sfld._eid){const idx=d.sizeSets.findIndex(x=>x.id===sfld._eid);if(idx>=0)d.sizeSets[idx]={...d.sizeSets[idx],label:sfld.label}}else{d.sizeSets.push({id:Date.now(),label:sfld.label})}});setSfld({label:"",_eid:null})};
  const saveGarment=()=>{if(!gName.trim())return;upConfig(d=>{if(!d.garmentTypes)d.garmentTypes=[];if(gEid){const idx=d.garmentTypes.findIndex(x=>x.id===gEid);if(idx>=0)d.garmentTypes[idx].name=gName.trim()}else{d.garmentTypes.push({id:Date.now(),name:gName.trim()})}});setGName("");setGEid(null)};
  const saveStatus=()=>{if(!stName.trim())return;upConfig(d=>{if(!d.statusCards)d.statusCards=[...DEFAULT_STATUSES];if(stEid){const idx=d.statusCards.findIndex(x=>x.id===stEid);if(idx>=0){d.statusCards[idx].name=stName.trim();d.statusCards[idx].color=stColor}}else{d.statusCards.push({id:Date.now(),name:stName.trim(),color:stColor})}});setStName("");setStColor("#0EA5E9");setStEid(null)};

  const eBtn=(onClick)=><Btn small onClick={onClick} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}}>✏️</Btn>;
  const ords=data.orders||[];
  const fabBlock=(f)=>ords.some(o=>FKEYS.some(k=>Number(o["fabric"+k])===f.id))?"مستخدم في أوردرات":null;
  const accBlock=(a)=>ords.some(o=>(o.accItems||[]).some(x=>x.name===a.name))?"مستخدم في أوردرات":null;
  const sizeBlock=(s)=>ords.some(o=>Number(o.sizeSetId)===s.id)?"مستخدم في أوردرات":null;
  const garmentBlock=(g)=>ords.some(o=>(o.orderPieces||[]).includes(g.name))?"مستخدم في أوردرات":null;
  return<div>
    <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>{[["fab","الأقمشة"],["acc","الاكسسوار"],["size","المقاسات"],["garment","قطع الموديل"],["ws","الورش"],["status","حالات الأوردر"]].map(([k,l])=><Btn key={k} on={sub===k} onClick={()=>setSub(k)}>{l}</Btn>)}</div>
    {sub==="fab"&&<Card title="جدول الأقمشة">{canEdit&&<div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"3fr 1fr 1fr auto",gap:10,marginBottom:16}}><Inp value={ff.name} onChange={v=>setFf({...ff,name:v})} placeholder="اسم القماش"/><Sel value={ff.unit} onChange={v=>setFf({...ff,unit:v})}><option value="كيلو">كيلو</option><option value="متر">متر</option><option value="يارد">يارد</option></Sel><Inp value={ff.price} onChange={v=>setFf({...ff,price:v})} placeholder="السعر" type="number"/><div style={{display:"flex",gap:4}}><Btn primary onClick={saveFab}>{ff._eid?"تحديث":"+ اضافة"}</Btn>{ff._eid&&<Btn ghost onClick={()=>setFf({name:"",unit:"كيلو",price:"",_eid:null})}>الغاء</Btn>}</div></div>}
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:450}}><thead><tr>{["#","القماش","الوحدة","السعر",...(canEdit?[""]:[])] .map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>{data.fabrics.map((f,i)=><tr key={f.id} style={{background:ff._eid===f.id?T.warn+"10":"transparent"}}><td style={TD}>{i+1}</td><td style={{...TD,fontWeight:600}}>{f.name}</td><td style={TD}>{f.unit}</td><td style={{...TDB,color:T.accent}}>{f.price+" ج.م"}</td>{canEdit&&<td style={{...TD,whiteSpace:"nowrap"}}><div style={{display:"flex",gap:4}}>{eBtn(()=>setFf({name:f.name,unit:f.unit,price:f.price,_eid:f.id}))}<DelBtn onConfirm={()=>upConfig(d=>{d.fabrics=d.fabrics.filter(x=>x.id!==f.id)})} blocked={fabBlock(f)}/></div></td>}</tr>)}</tbody></table></div></Card>}
    {sub==="acc"&&<Card title="الاكسسوار">{canEdit&&<div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"3fr 1fr 1fr auto",gap:10,marginBottom:16}}><Inp value={af.name} onChange={v=>setAf({...af,name:v})} placeholder="الوصف"/><Sel value={af.unit} onChange={v=>setAf({...af,unit:v})}><option value="قطعة">قطعة</option><option value="متر">متر</option></Sel><Inp value={af.price} onChange={v=>setAf({...af,price:v})} placeholder="السعر" type="number"/><div style={{display:"flex",gap:4}}><Btn primary onClick={saveAcc}>{af._eid?"تحديث":"+ اضافة"}</Btn>{af._eid&&<Btn ghost onClick={()=>setAf({name:"",unit:"قطعة",price:"",_eid:null})}>الغاء</Btn>}</div></div>}
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:400}}><thead><tr>{["#","الوصف","الوحدة","السعر",...(canEdit?[""]:[])] .map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>{data.accessories.map((a,i)=><tr key={a.id} style={{background:af._eid===a.id?T.warn+"10":"transparent"}}><td style={TD}>{i+1}</td><td style={{...TD,fontWeight:600}}>{a.name}</td><td style={TD}>{a.unit}</td><td style={{...TDB,color:T.accent}}>{a.price+" ج.م"}</td>{canEdit&&<td style={{...TD,whiteSpace:"nowrap"}}><div style={{display:"flex",gap:4}}>{eBtn(()=>setAf({name:a.name,unit:a.unit,price:a.price,_eid:a.id}))}<DelBtn onConfirm={()=>upConfig(d=>{d.accessories=d.accessories.filter(x=>x.id!==a.id)})} blocked={accBlock(a)}/></div></td>}</tr>)}</tbody></table></div></Card>}
    {sub==="size"&&<Card title="المقاسات">{canEdit&&<div style={{display:"grid",gridTemplateColumns:"3fr auto",gap:10,marginBottom:16}}><Inp value={sfld.label} onChange={v=>setSfld({...sfld,label:v})} placeholder="المقاسات"/><div style={{display:"flex",gap:4}}><Btn primary onClick={saveSize}>{sfld._eid?"تحديث":"+ اضافة"}</Btn>{sfld._eid&&<Btn ghost onClick={()=>setSfld({label:"",_eid:null})}>الغاء</Btn>}</div></div>}<table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["#","المقاسات",...(canEdit?[""]:[])] .map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>{data.sizeSets.map((s,i)=><tr key={s.id} style={{background:sfld._eid===s.id?T.warn+"10":"transparent"}}><td style={TD}>{i+1}</td><td style={{...TD,fontWeight:600}}>{s.label}</td>{canEdit&&<td style={{...TD,whiteSpace:"nowrap"}}><div style={{display:"flex",gap:4}}>{eBtn(()=>setSfld({label:s.label,_eid:s.id}))}<DelBtn onConfirm={()=>upConfig(d=>{d.sizeSets=d.sizeSets.filter(x=>x.id!==s.id)})} blocked={sizeBlock(s)}/></div></td>}</tr>)}</tbody></table></Card>}
    {sub==="garment"&&<Card title="قطع الموديل">{canEdit&&<div style={{display:"grid",gridTemplateColumns:"3fr auto",gap:10,marginBottom:16}}><Inp value={gName} onChange={setGName} placeholder="اسم القطعة (مثال: قميص، شورت، تيشيرت)"/><div style={{display:"flex",gap:4}}><Btn primary onClick={saveGarment}>{gEid?"تحديث":"+ اضافة"}</Btn>{gEid&&<Btn ghost onClick={()=>{setGName("");setGEid(null)}}>الغاء</Btn>}</div></div>}
      <div style={{display:"flex",flexWrap:"wrap",gap:10}}>{(data.garmentTypes||[]).map(g=><span key={g.id} style={{display:"inline-flex",alignItems:"center",gap:8,padding:"10px 18px",borderRadius:12,border:"1px solid "+(gEid===g.id?T.warn:T.brd),fontSize:FS,fontWeight:600,background:gEid===g.id?T.warn+"10":T.cardSolid}}>{"👕 "+g.name}{canEdit&&<>{" "}{eBtn(()=>{setGName(g.name);setGEid(g.id)})}<DelBtn onConfirm={()=>upConfig(d=>{d.garmentTypes=(d.garmentTypes||[]).filter(x=>x.id!==g.id)})} blocked={garmentBlock(g)}/></>}</span>)}</div>
      {(!data.garmentTypes||data.garmentTypes.length===0)&&<div style={{textAlign:"center",padding:20,color:T.textSec}}>لم يتم اضافة قطع بعد</div>}
    </Card>}
    {sub==="ws"&&<WsManager workshops={data.workshops||[]} upConfig={upConfig} canEdit={canEdit} isMob={isMob} orders={data.orders}/>}
    {/* STATUS CARDS */}
    {sub==="status"&&<Card title="حالات الأوردر (بالألوان)">
      {canEdit&&<div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
        <Inp value={stName} onChange={setStName} placeholder="اسم الحالة" style={{width:200}}/>
        <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:FS-2,color:T.textSec}}>اللون:</span><input type="color" value={stColor} onChange={e=>setStColor(e.target.value)} style={{width:40,height:36,borderRadius:8,border:"none",cursor:"pointer"}}/></div>
        <Btn primary onClick={saveStatus}>{stEid?"تحديث":"+ اضافة حالة"}</Btn>
        {stEid&&<Btn ghost onClick={()=>{setStName("");setStColor("#0EA5E9");setStEid(null)}}>الغاء</Btn>}
      </div>}
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"repeat(4,1fr)",gap:12}}>
        {statusCards.map(s=><div key={s.id} style={{padding:16,borderRadius:14,border:"2px solid "+(stEid===s.id?T.warn:s.color)+"40",background:s.color+"08",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:20,height:20,borderRadius:6,background:s.color}}/><span style={{fontWeight:700,fontSize:FS,color:T.text}}>{s.name}</span></div>
          {canEdit&&<div style={{display:"flex",gap:4}}>{eBtn(()=>{setStName(s.name);setStColor(s.color);setStEid(s.id)})}<DelBtn onConfirm={()=>upConfig(d=>{d.statusCards=(d.statusCards||[]).filter(x=>x.id!==s.id)})}/></div>}
        </div>)}
      </div>
    </Card>}
  </div>
}

/* ══ WORKSHOP MANAGER ══ */
function WsManager({workshops,upConfig,canEdit,isMob,orders}){
  const[showForm,setShowForm]=useState(false);const[editId,setEditId]=useState(null);
  const[f,setF]=useState({name:"",owner:"",phone:"",address:"",idCard:"",ownerPhoto:"",rating:5,type:"خارجي",payPercent:70});
  const startEdit=(ws)=>{setF({...ws,type:ws.type||"خارجي",payPercent:ws.payPercent||70});setEditId(ws.id);setShowForm(true)};
  const startNew=()=>{setF({name:"",owner:"",phone:"",address:"",idCard:"",ownerPhoto:"",rating:5,type:"خارجي",payPercent:70});setEditId(null);setShowForm(true)};
  const handleIdCard=async e=>{const file=e.target.files[0];if(!file)return;const compressed=await compressImg43(file,300,0.5);setF(p=>({...p,idCard:compressed}))};
  const handleOwnerPhoto=async e=>{const file=e.target.files[0];if(!file)return;const compressed=await compressImage(file,200,0.5);setF(p=>({...p,ownerPhoto:compressed}))};
  const save=()=>{if(!f.name.trim())return;upConfig(d=>{if(!Array.isArray(d.workshops))d.workshops=[];if(editId){const idx=d.workshops.findIndex(w=>w.id===editId);if(idx>=0)d.workshops[idx]={...f,id:editId}}else{d.workshops.push({...f,id:Date.now()})}});setShowForm(false);setEditId(null)};
  const del=(id)=>upConfig(d=>{d.workshops=(d.workshops||[]).filter(w=>w.id!==id)});
  const wsBlock=(ws)=>{const used=(orders||[]).some(o=>(o.workshopDeliveries||[]).some(wd=>wd.wsName===ws.name));return used?"يوجد أوردرات مرتبطة بهذه الورشة":null};

  return<div>
    <Card title="ادارة الورش" extra={canEdit&&<Btn primary small onClick={startNew}>+ ورشة جديدة</Btn>}>
      {showForm&&<div style={{background:T.inputBg||T.cardSolid,borderRadius:14,padding:20,marginBottom:20,border:"1px solid "+T.brd}}>
        <div style={{fontSize:FS+1,fontWeight:700,color:T.accent,marginBottom:14}}>{editId?"تعديل الورشة":"ورشة جديدة"}</div>
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr 1fr 1fr",gap:10,marginBottom:12}}>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap",fontWeight:600}}>اسم الورشة *</label><Inp value={f.name} onChange={v=>setF({...f,name:v})}/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap",fontWeight:600}}>اسم صاحب الورشة</label><Inp value={f.owner} onChange={v=>setF({...f,owner:v})}/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap",fontWeight:600}}>نوع الورشة *</label><Sel value={f.type||"خارجي"} onChange={v=>setF({...f,type:v})}><option value="خارجي">خارجي</option><option value="داخلي">داخلي</option></Sel></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap",fontWeight:600}}>النسبة من الدفعات</label><Sel value={f.payPercent||70} onChange={v=>setF({...f,payPercent:Number(v)})}>{[30,40,50,60,70,80,90,100].map(p=><option key={p} value={p}>{p+"%"}</option>)}</Sel></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:10,marginBottom:12}}>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap",fontWeight:600}}>رقم التليفون</label><Inp value={f.phone} onChange={v=>setF({...f,phone:v})} type="tel"/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap",fontWeight:600}}>التقييم (من 10)</label><Inp value={f.rating} onChange={v=>setF({...f,rating:Math.min(10,Math.max(0,Number(v)||0))})} type="number"/></div>
        </div>
        <div style={{marginBottom:14}}><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap",fontWeight:600}}>العنوان بالتفصيل</label><textarea value={f.address||""} onChange={e=>setF({...f,address:e.target.value})} style={{width:"100%",height:60,padding:10,borderRadius:10,border:"1px solid "+T.brd,fontSize:FS,fontFamily:"inherit",background:T.cardSolid,color:T.text,boxSizing:"border-box",resize:"vertical"}}/></div>
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:14,marginBottom:14}}>
          <div>
            <label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap",fontWeight:600}}>صورة بطاقة الورشة (4:3)</label>
            <div style={{width:"100%",height:120,borderRadius:12,border:"2px dashed "+T.brd,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",background:T.bg,cursor:"pointer",position:"relative"}}>
              {f.idCard?<img src={f.idCard} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<span style={{fontSize:FS-1,color:T.textMut}}>اضغط لرفع البطاقة</span>}
              <input type="file" accept="image/*" onChange={handleIdCard} style={{position:"absolute",inset:0,opacity:0,cursor:"pointer"}}/>
            </div>
          </div>
          <div>
            <label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap",fontWeight:600}}>صورة صاحب الورشة (3:4)</label>
            <div style={{width:100,height:133,borderRadius:12,border:"2px dashed "+T.brd,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",background:T.bg,cursor:"pointer",position:"relative"}}>
              {f.ownerPhoto?<img src={f.ownerPhoto} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<span style={{fontSize:FS-2,color:T.textMut}}>صورة</span>}
              <input type="file" accept="image/*" onChange={handleOwnerPhoto} style={{position:"absolute",inset:0,opacity:0,cursor:"pointer"}}/>
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:10}}><Btn primary onClick={save}>حفظ</Btn><Btn ghost onClick={()=>{setShowForm(false);setEditId(null)}}>الغاء</Btn></div>
      </div>}
      {/* Workshop Cards */}
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:14}}>
        {(workshops||[]).map(ws=><div key={ws.id} style={{background:T.cardSolid,borderRadius:14,border:"1px solid "+T.brd,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,0.04)"}}>
          <div style={{display:"flex",gap:14,padding:16}}>
            {ws.ownerPhoto&&<img src={ws.ownerPhoto} alt="" style={{width:60,height:80,borderRadius:10,objectFit:"cover",flexShrink:0}}/>}
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,flexWrap:"wrap"}}><span style={{fontSize:FS+2,fontWeight:700,color:T.text}}>{ws.name}</span><span style={{fontSize:FS-3,padding:"2px 8px",borderRadius:6,fontWeight:600,background:ws.type==="داخلي"?T.accent+"12":T.ok+"12",color:ws.type==="داخلي"?T.accent:T.ok}}>{ws.type||"خارجي"}</span>{ws.type!=="داخلي"&&<span style={{fontSize:FS-3,padding:"2px 8px",borderRadius:6,fontWeight:600,background:T.purple+"12",color:T.purple}}>{(ws.payPercent||70)+"%"}</span>}</div>
              {ws.owner&&<div style={{fontSize:FS-1,color:T.textSec}}>{"👤 "+ws.owner}</div>}
              {ws.phone&&<div style={{fontSize:FS-1,color:T.textSec}}>{"📱 "+ws.phone}</div>}
              {ws.address&&<div style={{fontSize:FS-2,color:T.textMut,marginTop:2}}>{ws.address}</div>}
              <div style={{display:"flex",alignItems:"center",gap:4,marginTop:6}}>
                <span style={{fontSize:FS-2,color:T.textSec}}>التقييم:</span>
                <span style={{fontSize:FS,fontWeight:700,color:ws.rating>=7?T.ok:ws.rating>=4?T.warn:T.err}}>{ws.rating+"/10"}</span>
                <div style={{flex:1,height:6,borderRadius:3,background:"#E2E8F0",overflow:"hidden",marginRight:6}}><div style={{height:"100%",width:(ws.rating*10)+"%",borderRadius:3,background:ws.rating>=7?T.ok:ws.rating>=4?T.warn:T.err}}/></div>
              </div>
            </div>
          </div>
          {ws.idCard&&<div style={{padding:"0 16px 12px"}}><img src={ws.idCard} alt="" style={{width:"100%",height:80,objectFit:"cover",borderRadius:8,border:"1px solid "+T.brd}}/></div>}
          {canEdit&&<div style={{padding:"0 16px 14px",display:"flex",gap:8}}>
            <Btn small onClick={()=>startEdit(ws)} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}}>✏️</Btn>
            <DelBtn onConfirm={()=>del(ws.id)} blocked={wsBlock(ws)}/>
          </div>}
        </div>)}
      </div>
      {(!workshops||workshops.length===0)&&<div style={{textAlign:"center",padding:30,color:T.textSec}}>لا توجد ورش مسجلة</div>}
    </Card>
  </div>
}

/* ══ ORDER FORM ══ */
function OrdForm({data,initial,onSave,onCancel,isMob,statusCards}){
  const[form,setForm]=useState(initial);const[errs,setErrs]=useState([]);
  const[copyMode,setCopyMode]=useState(false);const[copyFrom,setCopyFrom]=useState("");
  const[copyFields,setCopyFields]=useState({fabrics:true,pieces:true,sizes:true,acc:true,instructions:true});
  const fabObj=id=>data.fabrics.find(x=>x.id===Number(id));
  const handleImg=async e=>{const f=e.target.files[0];if(!f)return;const compressed=await compressImage(f,250,0.4);setForm(p=>({...p,image:compressed}))};
  const handleFile=async e=>{const f=e.target.files[0];if(!f)return;if(f.size>500000){alert("حجم الملف أكبر من 500KB");return}const result=await compressFile(f);if(result)setForm(p=>({...p,attachments:[...(p.attachments||[]),result]}))};
  const mainQty=sqty(form.colorsA);const updF=(key,val)=>setForm(p=>setF(p,key,val));
  const save=()=>{const v=validateOrder(form);if(v.length>0){setErrs(v);return}setErrs([]);const ss=data.sizeSets.find(s=>s.id===Number(form.sizeSetId));const o={...form,cutQty:mainQty,sizeLabel:ss?ss.label:""};FKEYS.forEach(k=>{const fb=fabObj(o["fabric"+k]);o["fabric"+k+"Label"]=fb?(fb.name+" - "+fb.unit):"";o["fabric"+k+"Price"]=fb?fb.price:0;o["fabric"+k+"Unit"]=fb?fb.unit:""});delete o._docId;onSave(o)};
  const doCopy=()=>{const src=data.orders.find(o=>o.id===copyFrom);if(!src)return;setForm(p=>{const n={...p};
    if(copyFields.sizes){n.sizeSetId=src.sizeSetId;n.sizeLabel=src.sizeLabel}
    if(copyFields.fabrics)FKEYS.forEach(k=>{n["fabric"+k]=src["fabric"+k]||"";n["cons"+k]=src["cons"+k]||"";n["colors"+k]=JSON.parse(JSON.stringify(src["colors"+k]||[]));n["cutDate"+k]=src["cutDate"+k]||"";n["fabricPieces"+k]=src["fabricPieces"+k]||[]});
    if(copyFields.pieces)n.orderPieces=[...(src.orderPieces||[])];
    if(copyFields.acc)n.accItems=JSON.parse(JSON.stringify(src.accItems||[]));
    if(copyFields.instructions)n.instructions=src.instructions||"";
    return n});setCopyMode(false);setCopyFrom("")};
  const statuses=(statusCards||DEFAULT_STATUSES).map(s=>s.name);
  const toggleCF=k=>setCopyFields(p=>({...p,[k]:!p[k]}));

  if(copyMode)return<Card title="نسخ بيانات من أوردر" accent="linear-gradient(135deg,#8B5CF6,#7C3AED)" style={{marginBottom:20}}>
    <div style={{marginBottom:16}}>
      <label style={{display:"block",fontSize:FS,fontWeight:600,color:T.textSec,marginBottom:6}}>اختر الأوردر المصدر</label>
      <Sel value={copyFrom} onChange={setCopyFrom}><option value="">-- اختر أوردر --</option>{sortOrders(data.orders).map(o=><option key={o.id} value={o.id}>{o.modelNo+" - "+o.modelDesc}</option>)}</Sel>
    </div>
    <div style={{marginBottom:16}}>
      <label style={{display:"block",fontSize:FS,fontWeight:600,color:T.textSec,marginBottom:8}}>البيانات المراد نسخها</label>
      <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
        {[["fabrics","الخامات والألوان"],["pieces","قطع الموديل"],["sizes","المقاسات"],["acc","الاكسسوار"],["instructions","تعليمات التشغيل"]].map(([k,l])=><span key={k} onClick={()=>toggleCF(k)} style={{padding:"10px 18px",borderRadius:12,fontSize:FS,fontWeight:600,cursor:"pointer",background:copyFields[k]?T.accent+"15":T.bg,color:copyFields[k]?T.accent:T.textMut,border:"1.5px solid "+(copyFields[k]?T.accent+"50":T.brd)}}>{(copyFields[k]?"✓ ":"")+ l}</span>)}
      </div>
    </div>
    <div style={{display:"flex",gap:8}}><Btn primary onClick={doCopy} disabled={!copyFrom}>نسخ البيانات</Btn><Btn ghost onClick={()=>setCopyMode(false)}>الغاء</Btn></div>
  </Card>;

  return<Card title={initial.modelNo?"تعديل الأوردر":"أمر قص جديد"} accent="linear-gradient(135deg,#0EA5E9,#0284C7)" extra={<div style={{display:"flex",gap:8}}>{!initial.modelNo&&<Btn small onClick={()=>setCopyMode(true)} style={{background:"rgba(255,255,255,0.2)",color:"#fff",border:"none"}}>نسخ من أوردر</Btn>}<Btn small onClick={save} style={{background:"#fff",color:T.accent,border:"none",fontWeight:700}}>حفظ</Btn><Btn small onClick={onCancel} style={{background:"rgba(255,255,255,0.3)",color:"#fff",border:"none"}}>الغاء</Btn></div>} style={{marginBottom:20}}>
    {errs.length>0&&<div style={{background:T.err+"10",border:"1px solid "+T.err+"30",borderRadius:12,padding:14,marginBottom:16}}>{errs.map((e,i)=><div key={i} style={{color:T.err,fontSize:FS,fontWeight:600,padding:"2px 0"}}>{"* "+e}</div>)}</div>}
    <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"auto 1fr",gap:10,marginBottom:10}}>
      <div><div style={{width:isMob?"100%":100,height:isMob?120:160,borderRadius:10,border:"2px dashed "+T.brd,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",background:T.inputBg||T.cardSolid,cursor:"pointer",position:"relative"}}>{form.image?<img src={form.image} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<span style={{fontSize:FS-1,color:T.textMut}}>صورة</span>}<input type="file" accept="image/*" onChange={handleImg} style={{position:"absolute",inset:0,opacity:0,cursor:"pointer"}}/></div></div>
      <div>
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"1fr 2fr 1fr 1fr 1fr",gap:6,marginBottom:6}}>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>رقم الموديل *</label><Inp value={form.modelNo} onChange={v=>updF("modelNo",v)}/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>الوصف *</label><Inp value={form.modelDesc} onChange={v=>updF("modelDesc",v)}/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>المقاسات *</label><Sel value={form.sizeSetId} onChange={v=>updF("sizeSetId",v)}><option value="">-- اختر --</option>{data.sizeSets.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</Sel></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>التاريخ *</label><Inp type="date" value={form.date} onChange={v=>updF("date",v)}/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>الحالة</label><Sel value={form.status} onChange={v=>updF("status",v)}>{statuses.map(s=><option key={s} value={s}>{s}</option>)}</Sel></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 2fr 2fr",gap:6}}>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>قطع الموديل</label><Sel value="" onChange={v=>{if(!v||(form.orderPieces||[]).length>=5)return;updF("orderPieces",[...(form.orderPieces||[]),v])}}>
            <option value="">{"-- اضف ("+(form.orderPieces||[]).length+"/5) --"}</option>
            {(data.garmentTypes||[]).filter(g=>!(form.orderPieces||[]).includes(g.name)).map(g=><option key={g.id} value={g.name}>{g.name}</option>)}
          </Sel></div>
          <div style={{display:"flex",gap:4,alignItems:"end",flexWrap:"wrap"}}>
            {(form.orderPieces||[]).map((p,i)=><span key={i} style={{display:"inline-flex",alignItems:"center",gap:4,padding:"4px 10px",borderRadius:8,background:T.accentBg,border:"1px solid "+T.accent+"30",fontSize:FS-2,fontWeight:600,color:T.accent}}>{"👕 "+p}<span onClick={()=>updF("orderPieces",(form.orderPieces||[]).filter((_,j)=>j!==i))} style={{cursor:"pointer",color:T.err,fontWeight:800,fontSize:FS-1}}>×</span></span>)}
          </div>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>ماركر (جربر)</label><Inp value={form.marker||""} onChange={v=>updF("marker",v)} placeholder="بيانات الماركر..."/></div>
        </div>
      </div>
    </div>
    {FKEYS.map((k,idx)=>{const fid=form["fabric"+k];const fb=fabObj(fid);const fabPieces=form["fabricPieces"+k]||[];return<div key={k}>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",marginBottom:4,minWidth:500}}><tbody><tr>
        <td style={{...TDL,fontWeight:700,whiteSpace:"nowrap"}}><span style={{display:"inline-block",width:10,height:10,borderRadius:3,background:FCOL[idx],marginLeft:4}}/>{"خامة "+k+(k==="A"?" *":"")}</td>
        <td style={TD}><Sel value={fid} onChange={v=>updF("fabric"+k,v)}><option value="">{k==="A"?"-- اختر --":"-- اختياري --"}</option>{data.fabrics.map(f=><option key={f.id} value={f.id}>{f.name+" - "+f.price+" ج.م/"+f.unit}</option>)}</Sel></td>
        <td style={{...TDL,whiteSpace:"nowrap"}}>استهلاك/راق</td><td style={{...TD,width:90}}><Inp type="number" step="any" value={form["cons"+k]} onChange={v=>updF("cons"+k,v)}/></td>
        <td style={{...TDL,whiteSpace:"nowrap"}}>تاريخ القص</td><td style={{...TD,width:130}}><Inp type="date" value={form["cutDate"+k]||""} onChange={v=>updF("cutDate"+k,v)}/></td>
      </tr></tbody></table></div>
      {fid&&<FCTable label={"خامة "+k} fabName={fb?fb.name:""} accent={FCOL[idx]} colors={form["colors"+k]||[]} setColors={c=>updF("colors"+k,c)}/>}
      {fid&&(form.orderPieces||[]).length>0&&<div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12,alignItems:"center"}}>
        <span style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>{"قطع خامة "+k+":"}</span>
        {(form.orderPieces||[]).map(p=>{const sel=fabPieces.includes(p);return<span key={p} onClick={()=>{const np=sel?fabPieces.filter(x=>x!==p):[...fabPieces,p];updF("fabricPieces"+k,np)}} style={{padding:"5px 12px",borderRadius:10,fontSize:FS-2,fontWeight:600,cursor:"pointer",background:sel?FCOL[idx]+"20":"#F1F5F9",color:sel?FCOL[idx]:T.textMut,border:"1px solid "+(sel?FCOL[idx]+"50":T.brd)}}>{p}</span>})}
      </div>}
    </div>})}
    <div style={{marginBottom:16}}><div style={{fontSize:FS,fontWeight:700,color:T.accent,marginBottom:10}}>بنود الاكسسوار</div><AccPicker accItems={form.accItems||[]} dbAcc={data.accessories} onChange={items=>updF("accItems",items)}/></div>
    <div style={{marginBottom:16}}><label style={{display:"block",fontSize:FS,color:T.textSec,marginBottom:6,fontWeight:600}}>ملفات مرفقة (حد أقصى 500KB/ملف)</label>
      <input type="file" onChange={handleFile} style={{marginBottom:8,fontSize:FS}}/>
      {(form.attachments||[]).length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:8}}>{form.attachments.map((a,i)=><span key={i} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:8,background:T.accentBg,border:"1px solid "+T.brd,fontSize:FS-2}}>{"📎 "+a.name}<span onClick={()=>updF("attachments",form.attachments.filter((_,j)=>j!==i))} style={{cursor:"pointer",color:T.err,fontWeight:800}}>x</span></span>)}</div>}
    </div>
    <div style={{marginBottom:16}}><label style={{display:"block",fontSize:FS,color:T.textSec,marginBottom:6,fontWeight:600}}>تعليمات التشغيل</label><textarea value={form.instructions||""} onChange={e=>updF("instructions",e.target.value)} placeholder="تعليمات التشغيل..." style={{width:"100%",height:100,padding:14,borderRadius:14,border:"1.5px solid "+T.brd,fontSize:FS,fontFamily:"inherit",background:T.cardSolid,color:T.text,boxSizing:"border-box",resize:"vertical"}}/></div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:16,borderTop:"1px solid "+T.brd,flexWrap:"wrap",gap:10}}>
      <div style={{fontSize:20,fontWeight:800}}>{"كمية القص (A): "}<span style={{color:T.accent}}>{mainQty}</span></div>
      <div style={{display:"flex",gap:10}}><Btn ghost onClick={onCancel}>الغاء</Btn><Btn primary onClick={save}>حفظ</Btn></div>
    </div>
  </Card>
}

/* ══ ORDERS PAGE ══ */
function OrdPg({data,addOrder,delOrder,updOrder,goD,isMob,canEdit,statusCards}){
  const[show,setShow]=useState(false);
  const statuses=(statusCards||DEFAULT_STATUSES).map(s=>s.name);
  return<div>
    <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>{canEdit&&<Btn primary onClick={()=>setShow(!show)}>{show?"الغاء":"+ أمر قص جديد"}</Btn>}</div>
    {show&&<OrdForm data={data} initial={mkOrder()} onSave={o=>{addOrder(o);setShow(false);showToast("✓ تم اضافة أمر القص")}} onCancel={()=>setShow(false)} isMob={isMob} statusCards={statusCards}/>}
    <Card title={"جميع الأوامر ("+data.orders.length+")"}><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:isMob?400:800}}>
      <thead><tr>{["#","التاريخ","موديل","الوصف","الكمية",...(isMob?[]:["آخر حركة"]),"الحالة",""].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
      <tbody>{sortOrders(data.orders).map((o,i)=>{const t=calcOrder(o);const hasWsDel=(o.workshopDeliveries||[]).length>0;const hasStockDel=(o.deliveries||[]).length>0;const delBlock=hasStockDel?"يوجد تسليمات مخزن مرتبطة":hasWsDel?"يوجد تسليمات ورش مرتبطة":null;
        let lastMov=null;(o.workshopDeliveries||[]).forEach(wd=>{if(!lastMov||wd.date>lastMov.date)lastMov={date:wd.date,type:"تسليم ورشة",name:wd.wsName};(wd.receives||[]).forEach(r=>{if(!lastMov||r.date>lastMov.date)lastMov={date:r.date,type:"استلام مصنع",name:wd.wsName}})});(o.deliveries||[]).forEach(d=>{if(!lastMov||d.date>lastMov.date)lastMov={date:d.date,type:"مخزن جاهز"}});
        return<tr key={o.id} data-oid={o.id}><td style={TD}>{i+1}</td><td style={TD}>{o.date}</td><td style={TDB}>{o.modelNo}</td><td style={TD}>{o.modelDesc}</td><td style={{...TDB,color:T.accent}}>{t.cutQty}</td>
        {!isMob&&<td style={{...TD,fontSize:FS-2}}>{lastMov?<span style={{color:lastMov.type==="مخزن جاهز"?T.ok:lastMov.type==="استلام مصنع"?T.accent:T.purple}}>{lastMov.type+" "+lastMov.date}</span>:<span style={{color:T.textMut}}>—</span>}</td>}
        <td style={TD}><Badge t={o.status} cards={statusCards}/></td><td style={{...TD,whiteSpace:"nowrap"}}><Btn ghost small onClick={()=>goD(o.id)}>تفاصيل</Btn>{canEdit&&<>{" "}<DelBtn onConfirm={()=>delOrder(o.id)} blocked={delBlock}/></>}</td></tr>})}
        {data.orders.length===0&&<tr><td colSpan={isMob?7:8} style={{...TD,textAlign:"center",color:T.textSec,padding:40}}>لا توجد أوامر</td></tr>}
      </tbody>
    </table></div></Card>
  </div>
}

/* ══ DETAILS ══ */
function DetPg({data,updOrder,replaceOrder,sel,setSel,isMob,canEdit,statusCards,goHome}){
  const order=data.orders.find(o=>o.id===sel);const[editing,setEditing]=useState(false);
  const[detQ,setDetQ]=useState("");const[detSt,setDetSt]=useState("الكل");
  const[editStockIdx,setEditStockIdx]=useState(null);
  const statuses=(statusCards||DEFAULT_STATUSES).map(s=>s.name);

  if(!order){
    const filtered=data.orders.filter(o=>{
      if(detSt!=="الكل"&&o.status!==detSt)return false;
      if(detQ.trim()){const s=detQ.trim().toLowerCase();const h=[o.modelNo,o.modelDesc,o.sizeLabel,o.status].filter(Boolean).join(" ").toLowerCase();if(!h.includes(s))return false}
      return true
    });
    return<div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:6}}>
        <h2 style={{fontSize:FS+1,fontWeight:700,margin:0,color:T.textSec}}>{"اختر أوردر ("+filtered.length+")"}</h2>
      </div>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"2fr 1fr",gap:8,marginBottom:10}}>
        <Inp value={detQ} onChange={setDetQ} placeholder="بحث بالرقم أو الوصف أو المقاسات..."/>
        <Sel value={detSt} onChange={setDetSt}><option value="الكل">كل الحالات</option>{statuses.map(s=><option key={s} value={s}>{s}</option>)}</Sel>
      </div>
      {filtered.length===0&&<Card><p style={{color:T.textSec,textAlign:"center",padding:30}}>لا توجد نتائج</p></Card>}
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {sortOrders(filtered).map(o=>{const t=calcOrder(o);
          const wds=o.workshopDeliveries||[];
          return<div key={o.id} data-oid={o.id} onClick={()=>setSel(o.id)} style={{display:"flex",gap:16,padding:16,background:T.cardSolid,borderRadius:16,border:"1px solid "+T.brd,boxShadow:T.shadow,cursor:"pointer",alignItems:"flex-start"}}>
          {o.image?<img src={o.image} alt="" style={{width:80,height:107,borderRadius:10,objectFit:"cover",flexShrink:0,border:"1px solid "+T.brd}}/>:<div style={{width:80,height:107,borderRadius:10,background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:28,color:T.textMut}}>📷</div>}
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6,gap:8}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:FS+3,fontWeight:800,color:T.text,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis"}}>{o.modelDesc}</div>
                <div style={{fontSize:FS,color:T.textSec}}>{"مقاس "+o.sizeLabel}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}><span style={{fontSize:18,color:"#F59E0B"}}>★</span><span style={{fontSize:FS,fontWeight:700,color:T.textSec}}>{"["+o.modelNo+"]"}</span></div>
            </div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center",marginBottom:wds.length>0?8:0}}>
              <Badge t={o.status} cards={statusCards}/>
              <span style={{fontSize:FS,color:T.textSec}}>{"الكمية: "}<b style={{color:T.accent}}>{t.cutQty}</b></span>
              <span style={{fontSize:FS,color:T.textSec}}>{"تسليم: "}<b style={{color:T.ok}}>{o.deliveredQty||0}</b></span>
              <span style={{fontSize:FS,color:T.textSec}}>{"رصيد: "}<b style={{color:t.balance>0?T.err:T.ok}}>{t.balance}</b></span>
            </div>
            {wds.length>0&&<div style={{display:"flex",flexDirection:"column",gap:6}}>
              {(()=>{const wsGroup={};wds.forEach(wd=>{if(!wsGroup[wd.wsName])wsGroup[wd.wsName]=[];wsGroup[wd.wsName].push(wd)});
                return Object.entries(wsGroup).map(([name,items])=><div key={name} style={{display:"flex",flexDirection:"column",gap:2}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontSize:FS-2,padding:"2px 8px",borderRadius:6,background:T.purple+"12",color:T.purple,fontWeight:700}}>{"🏭 "+name}</span>
                  </div>
                  <div style={{display:"flex",gap:4,flexWrap:"wrap",paddingRight:20}}>
                    {items.map((wd,wi)=>{const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);const bal=wd.qty-rcvd;
                      return<span key={wi} style={{fontSize:FS-3,padding:"3px 8px",borderRadius:6,background:bal>0?T.warn+"10":T.ok+"10",border:"1px solid "+(bal>0?T.warn:T.ok)+"25"}}>
                        {wd.garmentType?<b style={{color:T.purple}}>{wd.garmentType+": "}</b>:""}<span style={{color:T.accent}}>{"تسليم ورشة "+wd.qty}</span>{" | "}<span style={{color:T.ok}}>{"استلام مصنع "+rcvd}</span>{bal>0&&<span style={{color:T.err}}>{" | رصيد "+bal}</span>}{bal===0&&<span style={{color:T.ok}}>{" ✓"}</span>}
                      </span>})}
                  </div>
                </div>)})()}
            </div>}
          </div>
        </div>})}
      </div>
    </div>
  }
  if(editing)return<OrdForm data={data} initial={order} onSave={o=>{replaceOrder(sel,o);setEditing(false);showToast("✓ تم حفظ التعديلات");highlightRow(sel)}} onCancel={()=>setEditing(false)} isMob={isMob} statusCards={statusCards}/>;

  const t=calcOrder(order);const accItems=order.accItems||[];const accAll=t.accPer*t.cutQty;
  const activeFabs=FKEYS.filter(k=>order["fabric"+k]);

  /* Prev/Next navigation */
  const sortedIds=sortOrders(data.orders).map(o=>o.id);const curIdx=sortedIds.indexOf(sel);
  const prevId=curIdx>0?sortedIds[curIdx-1]:null;const nextId=curIdx<sortedIds.length-1?sortedIds[curIdx+1]:null;

  return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <Btn ghost onClick={()=>setSel(null)} style={{fontSize:isMob?16:20}}>✕</Btn>
        <h1 style={{fontSize:isMob?18:24,fontWeight:800,margin:0}}>{"أمر تشغيل - "}<span style={{color:T.accent}}>{order.modelNo}</span></h1>
      </div>
      <div style={{display:"flex",gap:4,alignItems:"center"}}>
        <Btn small onClick={()=>prevId&&setSel(prevId)} disabled={!prevId} style={{fontSize:18,padding:"2px 8px",opacity:prevId?1:0.3}}>→</Btn>
        <span style={{fontSize:FS-2,color:T.textSec}}>{(curIdx+1)+"/"+sortedIds.length}</span>
        <Btn small onClick={()=>nextId&&setSel(nextId)} disabled={!nextId} style={{fontSize:18,padding:"2px 8px",opacity:nextId?1:0.3}}>←</Btn>
        <div style={{width:1,height:20,background:T.brd,margin:"0 4px"}}/>
        <Btn small onClick={()=>printOrderSheet(order,t,activeFabs,statusCards)} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}}>🖨</Btn>
        {canEdit&&<Btn small primary onClick={()=>setEditing(true)}>✏️</Btn>}
      </div>
    </div>
    <div id="parea">
      <div style={{display:"flex",gap:10,marginBottom:12}}>
        {isMob&&order.image&&<div style={{flexShrink:0}}><img src={order.image} alt="" style={{width:70,height:93,objectFit:"cover",borderRadius:10,border:"1px solid "+T.brd}}/></div>}
        <div style={{flex:1,display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"repeat(5,1fr)",gap:isMob?6:12}}>
          <MetricCard label="رقم الموديل" value={order.modelNo} icon="🏷"/><MetricCard label="كمية القص" value={t.cutQty} icon="✂️" color={T.accent}/><MetricCard label="تم التسليم" value={order.deliveredQty||0} icon="📦" color={T.ok}/><MetricCard label="الرصيد" value={t.balance} icon="📊" color={t.balance>0?T.warn:T.ok}/><MetricCard label="تكلفة القطعة" value={t.costPer+" ج.م"} icon="💰" color={T.accent}/>
        </div>
      </div>
      {/* Timeline - horizontal after cards */}
      {(()=>{const ev=[];ev.push({title:"تم القص",date:order.date,color:T.accent,detail:"كمية: "+t.cutQty});
        (order.workshopDeliveries||[]).forEach(wd=>{ev.push({title:"تسليم ورشة — "+wd.wsName,date:wd.date,color:"#8B5CF6",detail:(wd.garmentType||"")+" | "+wd.qty+" قطعة"});(wd.receives||[]).forEach(r=>{ev.push({title:"استلام مصنع — "+wd.wsName,date:r.date,color:T.ok,detail:r.qty+" قطعة"})})});
        (order.deliveries||[]).forEach(d=>{ev.push({title:"مخزن جاهز",date:d.date,color:"#059669",detail:d.qty+" قطعة"})});
        ev.sort((a,b)=>a.date.localeCompare(b.date));
        return ev.length>1&&<div style={{marginBottom:14,background:T.cardSolid,borderRadius:10,padding:"10px 14px",border:"1px solid "+T.brd}}><Timeline events={ev}/></div>})()}
      <div style={{display:"grid",gridTemplateColumns:order.image&&!isMob?"auto 1fr":"1fr",gap:16,marginBottom:16}}>
        {!isMob&&order.image&&<div><img src={order.image} alt="" style={{width:135,height:180,aspectRatio:"3/4",objectFit:"cover",borderRadius:16,border:"1px solid "+T.brd,boxShadow:T.shadow}}/></div>}
        <Card title="بيانات الموديل"><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:400}}><tbody>
          <tr><td style={TDL}>الوصف</td><td style={TDB}>{order.modelDesc}</td><td style={TDL}>المقاسات</td><td style={TD}>{order.sizeLabel}</td></tr>
          <tr><td style={TDL}>الحالة</td><td style={TD}>{canEdit?<Sel value={order.status} onChange={v=>updOrder(sel,o=>{o.status=v})}>{statuses.map(s=><option key={s} value={s}>{s}</option>)}</Sel>:<Badge t={order.status} cards={statusCards}/>}</td><td style={TDL}>التاريخ</td><td style={TD}>{order.date}</td></tr>
          {order.marker&&<tr><td style={TDL}>ماركر</td><td colSpan={3} style={TD}>{order.marker}</td></tr>}
        </tbody></table></div></Card>
      </div>
      {/* Order Pieces */}
      {(order.orderPieces||[]).length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:10,marginBottom:16}}>
        <span style={{fontSize:FS,fontWeight:700,color:T.text}}>{"قطع الموديل ("+order.orderPieces.length+"):"}</span>
        {order.orderPieces.map((p,i)=>{
          const delForP=(order.workshopDeliveries||[]).filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0);
          const avail=t.cutQty-delForP;
          return<span key={i} style={{padding:"8px 16px",borderRadius:12,background:avail>0?"#FEF3C7":"#D1FAE5",border:"1px solid "+(avail>0?T.warn:T.ok)+"40",fontSize:FS,fontWeight:600}}>{"👕 "+p}<span style={{fontSize:FS-2,color:T.textSec,marginRight:6}}>{" (تشغيل: "+delForP+" / متاح: "+avail+")"}</span></span>
        })}
      </div>}
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":activeFabs.length>=3?"1fr 1fr 1fr":activeFabs.length===2?"1fr 1fr":"1fr",gap:14,marginBottom:16}}>
        {activeFabs.map(k=>{const colors=gc(order,k);if(colors.length===0)return null;const dt=gdate(order,k);const fp=order["fabricPieces"+k]||[];return<div key={k}><FCTable label={"خامة "+k} fabName={gf(order,k,"Label")} accent={FCOL[FKEYS.indexOf(k)]} colors={colors} setColors={()=>{}} readOnly/>
          {fp.length>0&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:-8,marginBottom:8}}>{fp.map(p=><span key={p} style={{padding:"3px 10px",borderRadius:8,fontSize:FS-3,fontWeight:600,background:FCOL[FKEYS.indexOf(k)]+"15",color:FCOL[FKEYS.indexOf(k)],border:"1px solid "+FCOL[FKEYS.indexOf(k)]+"30"}}>{"👕 "+p}</span>)}</div>}
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
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1.5fr 1fr",gap:16,marginBottom:16}}>
        <Card title="تكاليف الاكسسوار">{accItems.length>0?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:400}}><thead><tr>{["الوصف","السعر","اجمالي"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
          {accItems.map((a,i)=><tr key={i}><td style={{...TD,fontWeight:600}}>{a.name}</td><td style={TD}>{a.price+" ج.م"}</td><td style={{...TDB,color:T.accent}}>{fmt(a.price*t.cutQty)+" ج.م"}</td></tr>)}
          <tr style={{background:T.inputBg||T.cardSolid}}><td style={{...TD,fontWeight:700}}>اجمالي</td><td style={{...TD,fontWeight:700}}>{t.accPer+" ج.م/قطعة"}</td><td style={{...TD,fontWeight:700,color:T.accent}}>{fmt(accAll)+" ج.م"}</td></tr>
        </tbody></table></div>:<div style={{textAlign:"center",padding:20,color:T.textSec}}>لم يتم اضافة بنود</div>}</Card>
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
          const stockDel=(order.deliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);const stockRemain=t.cutQty-stockDel;
          return<Card title="تسليم مخزن جاهز" extra={canEdit&&canStock&&<Btn primary small onClick={()=>updOrder(sel,o=>{if(!o.deliveries)o.deliveries=[];o.deliveries.push({date:new Date().toISOString().split("T")[0],qty:0,notes:""});setTimeout(()=>setEditStockIdx(o.deliveries.length-1),100)})}>+ تسليم</Btn>}>
            {!canStock&&<div style={{padding:10,background:T.err+"10",border:"1px solid "+T.err+"30",borderRadius:8,marginBottom:10,fontSize:FS,color:T.err,fontWeight:600}}>{blockMsg}</div>}
            <div style={{display:"flex",gap:10,marginBottom:10,flexWrap:"wrap"}}>
              <span style={{padding:"6px 12px",borderRadius:8,background:T.err+"12",color:T.err,fontWeight:700,fontSize:FS}}>{"كمية القص: "+t.cutQty}</span>
              <span style={{padding:"6px 12px",borderRadius:8,background:T.ok+"12",color:T.ok,fontWeight:700,fontSize:FS}}>{"تم تسليمه: "+stockDel}</span>
              <span style={{padding:"6px 12px",borderRadius:8,background:stockRemain>0?T.warn+"12":T.ok+"12",color:stockRemain>0?T.warn:T.ok,fontWeight:700,fontSize:FS}}>{"المتبقي: "+stockRemain}</span>
            </div>
            <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:450}}><thead><tr>{["#","التاريخ","الكمية","ملاحظات",...(canEdit?[""]:[])] .map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
            {(order.deliveries||[]).map((d,i)=>{const isEd=editStockIdx===i&&canEdit;
              return<tr key={i} style={{background:isEd?T.warn+"06":"transparent"}}>
              <td style={TD}>{i+1}</td>
              <td style={{...TD,minWidth:130}}>{isEd?<Inp type="date" value={d.date} onChange={v=>updOrder(sel,o=>{o.deliveries[i].date=v})}/>:d.date}</td>
              <td style={{...TD,minWidth:100}}>{isEd?<Inp type="number" value={d.qty} onChange={v=>updOrder(sel,o=>{const maxQ=t.cutQty-o.deliveries.filter((_,j)=>j!==i).reduce((s,x)=>s+(Number(x.qty)||0),0);o.deliveries[i].qty=Math.min(Number(v)||0,maxQ);o.deliveredQty=o.deliveries.reduce((s,x)=>s+(Number(x.qty)||0),0);o.status=recomputeStatus(o)})}/>:<span style={{fontWeight:700,color:T.accent}}>{d.qty}</span>}</td>
              <td style={{...TD,minWidth:120}}>{isEd?<Inp value={d.notes} onChange={v=>updOrder(sel,o=>{o.deliveries[i].notes=v})} placeholder="ملاحظات"/>:(d.notes||"-")}</td>
              {canEdit&&<td style={{...TD,whiteSpace:"nowrap"}}><div style={{display:"flex",gap:3}}>
                {isEd?<><Btn small primary onClick={()=>setEditStockIdx(null)}>💾</Btn><Btn danger small onClick={()=>{updOrder(sel,o=>{o.deliveries.splice(i,1);o.deliveredQty=o.deliveries.reduce((s,x)=>s+(Number(x.qty)||0),0);o.status=recomputeStatus(o)});setEditStockIdx(null)}}>🗑️</Btn></>
                :<Btn small onClick={()=>setEditStockIdx(i)} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}}>✏️</Btn>}
              </div></td>}
            </tr>})}
            {(!order.deliveries||order.deliveries.length===0)&&<tr><td colSpan={canEdit?5:4} style={{...TD,textAlign:"center",color:T.textSec}}>لا توجد تسليمات</td></tr>}
          </tbody></table></div>
          </Card>})()}
      </div>
      {/* Workshop Deliveries Info */}
      {(order.workshopDeliveries||[]).length>0&&<Card title="التشغيل الخارجي" style={{marginBottom:16}}>
        {(order.workshopDeliveries||[]).map((wd,i)=>{
          const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);
          const bal=(Number(wd.qty)||0)-rcvd;
          return<div key={i} style={{border:"1px solid "+T.brd,borderRadius:8,marginBottom:8,overflow:"hidden"}}>
            <div style={{padding:"8px 12px",background:bal>0?T.err+"05":T.ok+"05",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontWeight:700,fontSize:FS}}>{wd.wsName}</span>
                {wd.garmentType&&<span style={{fontSize:FS-3,color:T.purple,background:T.purple+"10",padding:"1px 6px",borderRadius:6}}>{wd.garmentType}</span>}
                <span style={{fontSize:FS-3,padding:"1px 6px",borderRadius:6,background:bal>0?T.err+"10":T.ok+"10",color:bal>0?T.err:T.ok,fontWeight:700}}>{"رصيد: "+bal}</span>
              </div>
            </div>
            <div style={{padding:"4px 12px 8px"}}><table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr>{["","الحركة","التاريخ","الكمية","ملاحظات"].map(h=><th key={h} style={{...TH,fontSize:FS-3,padding:"4px 8px"}}>{h}</th>)}</tr></thead>
              <tbody>
                <tr style={{background:"#F0FDF408"}}><td style={{...TD,padding:"4px 8px",textAlign:"center",color:T.ok,fontSize:14}}>↗</td><td style={{...TD,padding:"4px 8px",fontWeight:600,color:T.ok}}>تسليم ورشة</td><td style={{...TD,padding:"4px 8px"}}>{wd.date}</td><td style={{...TDB,padding:"4px 8px",color:T.ok}}>{wd.qty}</td><td style={{...TD,padding:"4px 8px",fontSize:FS-2}}>{wd.notes||"-"}</td></tr>
                {(wd.receives||[]).map((r,ri)=><tr key={ri} style={{background:"#EFF6FF08"}}><td style={{...TD,padding:"4px 8px",textAlign:"center",color:T.accent,fontSize:14}}>↙</td><td style={{...TD,padding:"4px 8px",fontWeight:600,color:T.accent}}>استلام مصنع</td><td style={{...TD,padding:"4px 8px"}}>{r.date}</td><td style={{...TDB,padding:"4px 8px",color:T.accent}}>{r.qty}</td><td style={{...TD,padding:"4px 8px",fontSize:FS-2}}>{r.notes||"-"}</td></tr>)}
              </tbody>
            </table></div>
          </div>
        })}
      </Card>}
      {/* Attachments */}
      {(order.attachments||[]).length>0&&<Card title="ملفات مرفقة" style={{marginBottom:16}}><div style={{display:"flex",flexWrap:"wrap",gap:10}}>{order.attachments.map((a,i)=><a key={i} href={a.data} download={a.name} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"10px 16px",borderRadius:10,background:T.accentBg,border:"1px solid "+T.brd,fontSize:FS,color:T.accent,fontWeight:600,textDecoration:"none"}}>{"📎 "+a.name}</a>)}</div></Card>}
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

/* ══ EXTERNAL PRODUCTION ══ */
function ExtProdPg({data,updOrder,upConfig,isMob,canEdit,statusCards,season}){
  const[mode,setMode]=useState(null);
  const[selWs,setSelWs]=useState("");
  const[selOrder,setSelOrder]=useState("");
  const[ordSearch,setOrdSearch]=useState("");
  const[delQty,setDelQty]=useState(0);
  const[delType,setDelType]=useState("");
  const[delNote,setDelNote]=useState("");
  const[delPrice,setDelPrice]=useState("");
  const[rcvInputs,setRcvInputs]=useState({});
  const getRcv=(key)=>rcvInputs[key]||{qty:0,note:"",price:0};
  const setRcv=(key,field,val)=>setRcvInputs(p=>({...p,[key]:{...getRcv(key),[field]:val}}));
  const clearRcv=(key)=>setRcvInputs(p=>{const n={...p};delete n[key];return n});
  /* Payment states */
  const[payWs,setPayWs]=useState("");const[payAmt,setPayAmt]=useState("");const[payNote,setPayNote]=useState("");const[payType,setPayType]=useState("payment");const[payDate,setPayDate]=useState(new Date().toISOString().split("T")[0]);
  const[accWsF,setAccWsF]=useState("الكل");
  const[movQ,setMovQ]=useState("");
  const[movWsF,setMovWsF]=useState("الكل");
  const[editMov,setEditMov]=useState(null);
  const[editQty,setEditQty]=useState(0);
  const[editNote,setEditNote]=useState("");
  const[editPrice,setEditPrice]=useState(0);
  const[editDate,setEditDate]=useState("");
  const workshops=data.workshops||[];
  const isInternal=(name)=>{const w=workshops.find(x=>x.name===name);return w?w.type==="داخلي":false};
  const extWorkshops=workshops.filter(w=>w.type!=="داخلي");

  const startEditMov=(m)=>{setEditMov(m);setEditQty(m.qty);setEditNote(m.notes||"");setEditPrice(m.price||0);setEditDate(m.date||"")};
  const saveEditMov=()=>{if(!editMov)return;
    if(editMov.type==="deliver"){updOrder(editMov.orderId,o=>{const wd=o.workshopDeliveries[editMov.wdIdx];if(wd){wd.qty=Number(editQty)||0;wd.notes=editNote;wd.price=Number(editPrice)||0;if(editDate)wd.date=editDate};o.status=recomputeStatus(o)})}
    else{updOrder(editMov.orderId,o=>{const r=o.workshopDeliveries[editMov.wdIdx].receives[editMov.rIdx];if(r){r.qty=Number(editQty)||0;r.notes=editNote;if(editDate)r.date=editDate};o.status=recomputeStatus(o)})}
    setEditMov(null)};
  const printMov=(m)=>{
    const ord=data.orders.find(o=>o.id===m.orderId);
    const ws=(data.workshops||[]).find(w=>w.name===m.wsName);
    if(m.type==="deliver")printReceipt(m.wsName||"",ws?ws.owner:"",ord||{modelNo:m.orderNo||"",modelDesc:m.orderDesc||""},m.garmentType||"",m.qty,m.date,0);
    else printReceiveReceipt(m.wsName||"",ord||{modelNo:m.orderNo||"",modelDesc:m.orderDesc||""},m.garmentType||"",m.qty,m.date,0)
  };

  const wsObj=workshops.find(w=>(w.name||w)===(selWs));
  const prodOrders=data.orders.filter(o=>o.status==="تم القص"||o.status==="في التشغيل");
  const wsOrders=selWs?data.orders.filter(o=>(o.workshopDeliveries||[]).some(wd=>wd.wsName===selWs)):[];

  const deliverToWs=(andPrint)=>{
    if(!selWs||!selOrder||!delQty)return;
    if(!isInternal(selWs)&&!Number(delPrice)){alert("سعر التشغيل مطلوب");return}
    const ord=data.orders.find(o=>o.id===selOrder);if(!ord)return;
    const t=calcOrder(ord);
    const pieces=ord.orderPieces||[];
    let maxAllowed=t.cutQty;
    if(pieces.length>0&&delType){const delForP=(ord.workshopDeliveries||[]).filter(wd=>wd.garmentType===delType).reduce((s,wd)=>s+(Number(wd.qty)||0),0);maxAllowed=t.cutQty-delForP}
    else if(pieces.length===0){const totalDel=(ord.workshopDeliveries||[]).reduce((s,wd)=>s+(Number(wd.qty)||0),0);maxAllowed=t.cutQty-totalDel}
    const saveQty=Math.min(Number(delQty),maxAllowed);if(saveQty<=0){alert("لا توجد كمية متاحة للتسليم");return}
    const saveType=delType;const saveNote=delNote;const savePrice=Number(delPrice)||0;
    const saveModelNo=ord.modelNo;const saveDate=new Date().toISOString().split("T")[0];
    const availAfter=maxAllowed-saveQty;
    updOrder(selOrder,o=>{
      if(!o.workshopDeliveries)o.workshopDeliveries=[];
      o.workshopDeliveries.push({id:gid(),wsName:selWs,wsOwner:wsObj?wsObj.owner:"",qty:saveQty,garmentType:saveType,notes:saveNote,price:savePrice,date:saveDate,receives:[]});
      o.status=recomputeStatus(o);
    });
    setSelOrder("");setDelQty(0);setDelType("");setDelNote("");setDelPrice("");showToast("✓ تم تسليم "+saveQty+" قطعة لـ "+selWs);
    if(andPrint){const printOrd=JSON.parse(JSON.stringify(ord));const pWs=selWs;const pWsOwner=wsObj?wsObj.owner:"";setTimeout(()=>printReceipt(pWs,pWsOwner,printOrd,saveType,saveQty,saveDate,Math.max(0,availAfter)),400)}
  };

  const receiveFromWs=(orderId,wdIdx,andPrint,printData,cardKey)=>{
    const rv=getRcv(cardKey);
    if(!rv.qty)return;
    const ord=data.orders.find(o=>o.id===orderId);if(!ord)return;
    const wd=(ord.workshopDeliveries||[])[wdIdx];if(!wd)return;
    const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);
    const maxRcv=(Number(wd.qty)||0)-rcvd;
    const saveQty=Math.min(Number(rv.qty),maxRcv);if(saveQty<=0)return;
    const saveNote=rv.note;const wdPrice=Number(wd.price)||0;const saveDate=new Date().toISOString().split("T")[0];
    updOrder(orderId,o=>{
      if(!o.workshopDeliveries[wdIdx].receives)o.workshopDeliveries[wdIdx].receives=[];
      o.workshopDeliveries[wdIdx].receives.push({date:saveDate,qty:saveQty,notes:saveNote,price:wdPrice,amount:r2(saveQty*wdPrice)});
      o.status=recomputeStatus(o)
    });
    clearRcv(cardKey);showToast("✓ تم استلام "+saveQty+" قطعة");
    if(andPrint&&printData){const pOrd=JSON.parse(JSON.stringify(ord));if(pOrd.workshopDeliveries&&pOrd.workshopDeliveries[wdIdx]){if(!pOrd.workshopDeliveries[wdIdx].receives)pOrd.workshopDeliveries[wdIdx].receives=[];pOrd.workshopDeliveries[wdIdx].receives.push({date:saveDate,qty:saveQty})}const pWs=selWs;const pType=wd.garmentType||"";setTimeout(()=>printReceiveReceipt(pWs,pOrd,pType,saveQty,saveDate,0),400)}
  };

  /* Collect all movements for the log */
  const movements=[];let _mi=0;
  data.orders.forEach(ord=>{(ord.workshopDeliveries||[]).forEach((wd,wdIdx)=>{
    movements.push({type:"deliver",date:wd.date,wsName:wd.wsName,orderNo:ord.modelNo,orderDesc:ord.modelDesc,qty:wd.qty,garmentType:wd.garmentType||"",price:wd.price||0,notes:wd.notes||"",orderId:ord.id,wdIdx,_i:_mi++});
    (wd.receives||[]).forEach((r,rIdx)=>{movements.push({type:"receive",date:r.date,wsName:wd.wsName,orderNo:ord.modelNo,orderDesc:ord.modelDesc,qty:r.qty,garmentType:wd.garmentType||"",notes:r.notes||"",orderId:ord.id,wdIdx,rIdx,_i:_mi++})})
  })});
  movements.sort((a,b)=>b.date.localeCompare(a.date)||b._i-a._i);

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
  const delMovement=(m)=>{
    if(m.type==="deliver"){updOrder(m.orderId,o=>{o.workshopDeliveries.splice(m.wdIdx,1);o.status=recomputeStatus(o)})}
    else{updOrder(m.orderId,o=>{o.workshopDeliveries[m.wdIdx].receives.splice(m.rIdx,1);o.status=recomputeStatus(o)})}
  };

  /* Workshop accounts calculation */
  const wsAccounts=(wsName)=>{if(isInternal(wsName))return{due:0,totalPaid:0,totalPurchase:0,balance:0};let due=0;data.orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===wsName).forEach(wd=>{(wd.receives||[]).forEach(r=>{due+=r2((Number(r.qty)||0)*(Number(r.price)||0))})})});
    const payments=(data.wsPayments||[]).filter(p=>p.wsName===wsName);
    const totalPaid=payments.filter(p=>p.type==="payment").reduce((s,p)=>s+(Number(p.amount)||0),0);
    const totalPurchase=payments.filter(p=>p.type==="purchase").reduce((s,p)=>s+(Number(p.amount)||0),0);
    return{due,totalPaid,totalPurchase,balance:due+totalPurchase-totalPaid}
  };
  const addPayment=()=>{if(!payWs||!payAmt)return;upConfig(d=>{if(!d.wsPayments)d.wsPayments=[];d.wsPayments.push({id:gid(),wsName:payWs,amount:Number(payAmt),type:payType,notes:payNote,date:payDate})});setPayAmt("");setPayNote("");setPayDate(new Date().toISOString().split("T")[0])};

  if(!mode)return<div>
    <div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"repeat(4,1fr)",gap:12,marginBottom:20}}>
      <div onClick={()=>setMode("deliver")} style={{background:T.card,borderRadius:14,padding:isMob?16:24,border:"1px solid "+T.brd,boxShadow:T.shadow,cursor:"pointer",textAlign:"center"}}>
        <div style={{fontSize:32,marginBottom:8}}>📤</div>
        <div style={{fontSize:FS+1,fontWeight:800,color:T.accent}}>تسليم ورشة</div>
      </div>
      <div onClick={()=>setMode("receive")} style={{background:T.card,borderRadius:14,padding:isMob?16:24,border:"1px solid "+T.brd,boxShadow:T.shadow,cursor:"pointer",textAlign:"center"}}>
        <div style={{fontSize:32,marginBottom:8}}>📥</div>
        <div style={{fontSize:FS+1,fontWeight:800,color:T.ok}}>استلام من ورشة</div>
      </div>
      <div onClick={()=>setMode("payment")} style={{background:T.card,borderRadius:14,padding:isMob?16:24,border:"1px solid "+T.brd,boxShadow:T.shadow,cursor:"pointer",textAlign:"center"}}>
        <div style={{fontSize:32,marginBottom:8}}>💳</div>
        <div style={{fontSize:FS+1,fontWeight:800,color:T.purple}}>اضافة دفعة</div>
      </div>
      <div onClick={()=>setMode("accounts")} style={{background:T.card,borderRadius:14,padding:isMob?16:24,border:"1px solid "+T.brd,boxShadow:T.shadow,cursor:"pointer",textAlign:"center"}}>
        <div style={{fontSize:32,marginBottom:8}}>📊</div>
        <div style={{fontSize:FS+1,fontWeight:800,color:T.warn}}>حسابات الورش</div>
      </div>
    </div>
    {/* Movement Log with search/filter */}
    <Card title={"سجل الحركات ("+movements.length+")"}>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"2fr 1fr auto",gap:10,marginBottom:14}}>
        <Inp value={movQ} onChange={setMovQ} placeholder="بحث بالموديل أو الورشة..."/>
        <Sel value={movWsF} onChange={setMovWsF}><option value="الكل">كل الورش</option>{workshops.map(w=><option key={w.id||w} value={w.name||w}>{w.name||w}</option>)}</Sel>
        <Btn onClick={()=>{const el=document.getElementById("mov-log");if(!el)return;printPage("سجل حركات التشغيل الخارجي",el.innerHTML)}} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>🖨 طباعة</Btn>
      </div>
      {(()=>{const fMov=movements.filter(m=>{if(movWsF!=="الكل"&&m.wsName!==movWsF)return false;if(movQ.trim()){const s=movQ.trim().toLowerCase();if(!((m.orderNo||"").toLowerCase().includes(s)||(m.wsName||"").toLowerCase().includes(s)||(m.orderDesc||"").toLowerCase().includes(s)))return false}return true});return<div id="mov-log"><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:700}}>
        <thead><tr>{["","التاريخ","الورشة","موديل","الوصف","نوع القطعة","الكمية","سعر التشغيل","ملاحظات",""].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
        <tbody>{fMov.length>0?fMov.slice(0,50).map((m,i)=>{
          const isEditing=editMov&&editMov.orderId===m.orderId&&editMov.wdIdx===m.wdIdx&&editMov.type===m.type&&(m.type==="deliver"||editMov.rIdx===m.rIdx);
          return<tr key={i} style={{background:m.type==="deliver"?"#F0FDF4":"#EFF6FF"}}>
          <td style={{...TD,textAlign:"center",fontSize:20}}>{m.type==="deliver"?<span style={{color:T.ok}}>{"↗"}</span>:<span style={{color:T.accent}}>{"↙"}</span>}</td>
          <td style={TD}>{isEditing?<Inp type="date" value={editDate} onChange={setEditDate} style={{width:130}}/>:m.date}</td><td style={{...TD,fontWeight:600}}>{m.wsName}</td><td style={TDB}>{m.orderNo}</td><td style={TD}>{m.orderDesc}</td>
          <td style={TD}>{m.garmentType||"-"}</td>
          <td style={{...TDB,color:m.type==="deliver"?T.ok:T.accent}}>{isEditing?<Inp type="number" value={editQty} onChange={v=>setEditQty(Number(v)||0)} style={{width:70}}/>:m.qty}</td>
          <td style={TD}>{isEditing&&m.type==="deliver"?<Inp type="number" value={editPrice} onChange={v=>setEditPrice(Number(v)||0)} style={{width:70}}/>:(m.price?m.price+" ج.م":"-")}</td>
          <td style={TD}>{isEditing?<Inp value={editNote} onChange={setEditNote} style={{width:100}}/>:(m.notes||"-")}</td>
          <td style={{...TD,whiteSpace:"nowrap"}}>{canEdit&&<div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            {isEditing?<><Btn small primary onClick={saveEditMov}>حفظ</Btn><Btn ghost small onClick={()=>setEditMov(null)}>الغاء</Btn></>:<>
            <Btn small onClick={()=>printMov(m)} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}}>🖨</Btn>
            <Btn small onClick={()=>startEditMov(m)} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}}>✏️</Btn>
            <DelBtn onConfirm={()=>delMovement(m)} blocked={getMovBlock(m)}/></>}
          </div>}</td>
        </tr>}):<tr><td colSpan={10} style={{...TD,textAlign:"center",color:T.textSec,padding:30}}>لا توجد حركات</td></tr>}</tbody>
      </table></div></div>})()}
    </Card>
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
  const availOrders=prodOrders.filter(o=>getAvailQty(o)>0);
  /* Workshop-specific movements */
  const wsMoves=[];let _wi=0;
  if(selWs)data.orders.forEach(ord=>{(ord.workshopDeliveries||[]).forEach((wd,wdIdx)=>{if(wd.wsName===selWs){wsMoves.push({type:"deliver",date:wd.date,orderNo:ord.modelNo,orderDesc:ord.modelDesc,qty:wd.qty,garmentType:wd.garmentType||"",price:wd.price||0,notes:wd.notes||"",orderId:ord.id,wdIdx,_i:_wi++});(wd.receives||[]).forEach((r,rIdx)=>{wsMoves.push({type:"receive",date:r.date,orderNo:ord.modelNo,orderDesc:ord.modelDesc,qty:r.qty,garmentType:wd.garmentType||"",price:r.price||0,notes:r.notes||"",orderId:ord.id,wdIdx,rIdx,_i:_wi++})})}})});
  wsMoves.sort((a,b)=>b.date.localeCompare(a.date)||b._i-a._i);

  if(mode==="deliver")return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
      <h1 style={{fontSize:isMob?22:28,fontWeight:800,margin:0}}>{"📤 تسليم ورشة"}</h1>
      <Btn ghost onClick={()=>{setMode(null);setSelWs("");setSelOrder("")}}>↩</Btn>
    </div>
    <Card title="اختر الورشة" style={{marginBottom:16}}>
      <Sel value={selWs} onChange={v=>{setSelWs(v);setSelOrder("")}}>
        <option value="">-- اختر ورشة --</option>
        {workshops.map(w=><option key={w.id||w} value={w.name||w}>{(w.name||w)+(w.owner?" - "+w.owner:"")}</option>)}
      </Sel>
      {wsObj&&<div style={{marginTop:12,display:"flex",alignItems:"center",gap:12,padding:12,background:T.accentBg,borderRadius:10}}>
        {wsObj.ownerPhoto&&<img src={wsObj.ownerPhoto} alt="" style={{width:40,height:53,borderRadius:8,objectFit:"cover"}}/>}
        <div><div style={{fontWeight:700,fontSize:FS}}>{wsObj.name}</div>{wsObj.phone&&<div style={{fontSize:FS-2,color:T.textSec}}>{"📱 "+wsObj.phone}</div>}</div>
        <div style={{marginRight:"auto",fontWeight:700,color:wsObj.rating>=7?T.ok:T.warn}}>{wsObj.rating+"/10"}</div>
      </div>}
    </Card>
    {selWs&&<Card title={"أوردرات متاحة للتسليم ("+availOrders.length+")"} style={{marginBottom:16}}>
      {availOrders.length>0?<div>
        <Inp value={ordSearch} onChange={setOrdSearch} placeholder="بحث بالرقم أو الوصف..." style={{marginBottom:10}}/>
        {(()=>{const fOrds=ordSearch.trim()?availOrders.filter(o=>{const s=ordSearch.trim().toLowerCase();return(o.modelNo||"").toLowerCase().includes(s)||(o.modelDesc||"").toLowerCase().includes(s)}):availOrders;return<div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"2fr 1fr",gap:10,marginBottom:10}}>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>{"اختر الأوردر ("+fOrds.length+")"}</label>
            <Sel value={selOrder} onChange={v=>{setSelOrder(v);setDelType("");const o=data.orders.find(x=>x.id===v);if(o){const pieces=o.orderPieces||[];if(pieces.length===0)setDelQty(getAvailQty(o))}}}>
              <option value="">-- اختر أوردر --</option>
              {fOrds.map(o=>{const t=calcOrder(o);const pieces=o.orderPieces||[];
                const pInfo=pieces.length>0?pieces.map(p=>{const d=(o.workshopDeliveries||[]).filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0);const a=t.cutQty-d;return a>0?p+":"+a:null}).filter(Boolean).join(" | "):"متاح: "+getAvailQty(o);
                return<option key={o.id} value={o.id}>{o.modelNo+" - "+o.modelDesc+" ["+pInfo+"]"}</option>})}
            </Sel>
          </div>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>الكمية</label><Inp type="number" value={delQty} onChange={v=>{const ord=data.orders.find(x=>x.id===selOrder);const max=ord?getAvailQty(ord):99999;setDelQty(Math.min(Number(v)||0,max))}}/></div>
        </div>})()}
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr 1fr",gap:10,marginBottom:10}}>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>نوع القطعة</label>{(()=>{
            const ord=data.orders.find(x=>x.id===selOrder);
            const pieces=ord?(ord.orderPieces||[]):[];
            const t=ord?calcOrder(ord):{cutQty:0};
            /* Compute available pieces */
            const availPieces=pieces.filter(p=>{const delForP=(ord.workshopDeliveries||[]).filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0);return delForP<t.cutQty});
            return pieces.length>0?<Sel value={delType} onChange={v=>{setDelType(v);if(v&&ord){const delForP=(ord.workshopDeliveries||[]).filter(wd=>wd.garmentType===v).reduce((s,wd)=>s+(Number(wd.qty)||0),0);setDelQty(t.cutQty-delForP)}}}>
              <option value="">-- اختر القطعة --</option>
              {availPieces.map(p=>{const delForP=(ord.workshopDeliveries||[]).filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0);return<option key={p} value={p}>{p+" (متاح: "+(t.cutQty-delForP)+")"}</option>})}
            </Sel>:<Inp value={delType} onChange={setDelType} placeholder="نوع القطعة..."/>
          })()}</div>
          {!isInternal(selWs)&&<div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>سعر التشغيل</label><Inp type="number" step="0.01" value={delPrice} onChange={v=>setDelPrice(v)} placeholder="سعر القطعة"/></div>}
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>ملاحظات</label><Inp value={delNote} onChange={setDelNote} placeholder="ملاحظات..."/></div>
        </div>
        <div style={{display:"flex",gap:8}}><Btn primary onClick={()=>deliverToWs(false)} disabled={!selOrder||!delQty}>تسليم وحفظ</Btn><Btn onClick={()=>deliverToWs(true)} disabled={!selOrder||!delQty} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}}>تسليم + طباعة</Btn></div>
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
    {selWs&&wsMoves.length>0&&<Card title={"حركات ورشة "+selWs+" ("+wsMoves.length+")"}>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:550}}>
        <thead><tr>{["","التاريخ","موديل","الوصف","نوع القطعة","الكمية",...(isInternal(selWs)?[]:["سعر"]),"ملاحظات",""].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
        <tbody>{wsMoves.map((m,i)=>{const isEd=editMov&&editMov.orderId===m.orderId&&editMov.wdIdx===m.wdIdx&&editMov.type===m.type&&(m.type==="deliver"||editMov.rIdx===m.rIdx);
          return<tr key={i} style={{background:m.type==="deliver"?"#F0FDF4":"#EFF6FF"}}>
          <td style={{...TD,textAlign:"center",fontSize:16}}>{m.type==="deliver"?<span style={{color:T.ok}}>{"↗"}</span>:<span style={{color:T.accent}}>{"↙"}</span>}</td>
          <td style={TD}>{isEd?<Inp type="date" value={editDate} onChange={setEditDate} style={{width:120}}/>:m.date}</td>
          <td style={TDB}>{m.orderNo}</td><td style={TD}>{m.orderDesc}</td><td style={TD}>{m.garmentType||"-"}</td>
          <td style={{...TDB,color:m.type==="deliver"?T.ok:T.accent}}>{isEd?<Inp type="number" value={editQty} onChange={v=>setEditQty(Number(v)||0)} style={{width:60}}/>:m.qty}</td>
          {!isInternal(selWs)&&<td style={TD}>{isEd&&m.type==="deliver"?<Inp type="number" step="0.01" value={editPrice} onChange={v=>setEditPrice(v)} style={{width:60}}/>:(m.price?m.price+" ج.م":"-")}</td>}
          <td style={TD}>{isEd?<Inp value={editNote} onChange={setEditNote} style={{width:80}}/>:(m.notes||"-")}</td>
          <td style={{...TD,whiteSpace:"nowrap"}}>{canEdit&&<div style={{display:"flex",gap:3}}>
            {isEd?<><Btn small primary onClick={saveEditMov}>حفظ</Btn><Btn ghost small onClick={()=>setEditMov(null)}>✕</Btn></>:<>
            <Btn small onClick={()=>startEditMov(m)} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}}>✏️</Btn>
            <DelBtn onConfirm={()=>delMovement(m)} blocked={getMovBlock(m)}/>
            <Btn small onClick={()=>printMov(m)} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}}>🖨</Btn></>}
          </div>}</td></tr>})}</tbody>
      </table></div>
    </Card>}
  </div>;

  /* ── RECEIVE MODE ── */
  if(mode==="receive")return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
      <h1 style={{fontSize:isMob?22:28,fontWeight:800,margin:0}}>{"📥 استلام من ورشة"}</h1>
      <Btn ghost onClick={()=>{setMode(null);setSelWs("")}}>↩</Btn>
    </div>
    <Card title="اختر الورشة" style={{marginBottom:16}}>
      <Sel value={selWs} onChange={v=>setSelWs(v)}>
        <option value="">-- اختر ورشة --</option>
        {workshops.map(w=><option key={w.id||w} value={w.name||w}>{(w.name||w)+(w.owner?" - "+w.owner:"")}</option>)}
      </Sel>
    </Card>
    {selWs&&<Card title={"أوردرات تم تسليمها لـ "+selWs} style={{marginBottom:16}}>
      {(()=>{
        const cards=[];wsOrders.forEach(ord=>{(ord.workshopDeliveries||[]).filter(wd=>wd.wsName===selWs).forEach((wd,wdIdx)=>{const actualIdx=(ord.workshopDeliveries||[]).indexOf(wd);const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);const bal=(Number(wd.qty)||0)-rcvd;if(bal>0)cards.push({ord,wd,wdIdx,actualIdx,rcvd,bal})})});
        if(cards.length===0){const hasAny=wsOrders.some(o=>(o.workshopDeliveries||[]).some(wd=>wd.wsName===selWs));return<p style={{color:hasAny?T.ok:T.textSec,textAlign:"center",padding:30,fontWeight:hasAny?700:400}}>{hasAny?"✓ تم استلام جميع الكميات من الورشة":"لا توجد أوردرات تم تسليمها لهذه الورشة"}</p>}
        return<div style={{display:"flex",flexDirection:"column",gap:16}}>
          {cards.map(({ord,wd,wdIdx,actualIdx,rcvd,bal})=>{
            return<div key={ord.id+"-"+wdIdx} style={{background:T.cardSolid,borderRadius:14,border:"1px solid "+T.err+"40",overflow:"hidden"}}>
              <div style={{padding:"14px 18px",background:T.err+"08",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                <div><span style={{fontWeight:700,fontSize:FS+1}}>{ord.modelNo}</span><span style={{fontSize:FS-1,color:T.textSec,marginRight:10}}>{" - "+ord.modelDesc}</span>{wd.garmentType&&<span style={{fontSize:FS,fontWeight:700,color:T.purple,background:T.purple+"15",padding:"4px 14px",borderRadius:10,marginRight:6}}>{"👕 "+wd.garmentType}</span>}</div>
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
                  {wd.receives.map((r,ri)=>{const rBal=bal+Number(r.qty);return<tr key={ri}><td style={TD}>{ri+1}</td><td style={TD}>{r.date}</td><td style={TDB}>{r.qty}</td><td style={TD}>{r.notes||"-"}</td><td style={TD}><Btn small onClick={()=>printReceiveReceipt(selWs,ord,wd.garmentType||"",r.qty,r.date,rBal)} style={{background:T.ok+"15",color:T.ok,border:"1px solid "+T.ok+"30"}}>🖨</Btn></td></tr>})}
                </tbody></table></div></div>}
                {canEdit&&(()=>{const ck=ord.id+"-"+actualIdx;const rv=getRcv(ck);const wdP=Number(wd.price)||0;return<div style={{display:"flex",gap:6,flexWrap:"wrap",padding:8,background:T.inputBg||T.cardSolid,borderRadius:8,alignItems:"end"}}>
                  <div style={{minWidth:70}}><label style={{fontSize:FS-3,color:T.textSec}}>الكمية</label><Inp type="number" value={rv.qty} onChange={v=>setRcv(ck,"qty",Math.min(Number(v)||0,bal))}/></div>
                  {!isInternal(selWs)&&wdP>0&&<div><label style={{fontSize:FS-3,color:T.purple}}>سعر التشغيل</label><div style={{padding:"6px 10px",borderRadius:8,background:T.purple+"10",fontWeight:700,color:T.purple,fontSize:FS}}>{wdP+" ج.م"}</div></div>}
                  {!isInternal(selWs)&&wdP>0&&(rv.qty||0)>0&&<div><label style={{fontSize:FS-3,color:T.accent}}>المبلغ</label><div style={{padding:"6px 10px",borderRadius:8,background:T.accent+"10",fontWeight:700,color:T.accent,fontSize:FS}}>{fmt(r2((rv.qty||0)*wdP))+" ج.م"}</div></div>}
                  <div style={{flex:1,minWidth:80}}><label style={{fontSize:FS-3,color:T.textSec}}>ملاحظات</label><Inp value={rv.note} onChange={v=>setRcv(ck,"note",v)}/></div>
                  <Btn onClick={()=>receiveFromWs(ord.id,actualIdx,false,null,ck)} style={{background:T.ok+"15",color:T.ok,border:"1px solid "+T.ok+"30"}}>حفظ</Btn>
                  <Btn onClick={()=>receiveFromWs(ord.id,actualIdx,true,{modelNo:ord.modelNo,bal},ck)} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}}>حفظ+طباعة</Btn>
                </div>})()}
              </div>
            </div>
          })}
        </div>})()}
    </Card>}
    {/* Workshop-specific movements */}
    {selWs&&wsMoves.length>0&&<Card title={"حركات ورشة "+selWs+" ("+wsMoves.length+")"}>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:550}}>
        <thead><tr>{["","التاريخ","موديل","الوصف","نوع القطعة","الكمية",...(isInternal(selWs)?[]:["سعر"]),"ملاحظات",""].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
        <tbody>{wsMoves.map((m,i)=>{const isEd=editMov&&editMov.orderId===m.orderId&&editMov.wdIdx===m.wdIdx&&editMov.type===m.type&&(m.type==="deliver"||editMov.rIdx===m.rIdx);
          return<tr key={i} style={{background:m.type==="deliver"?"#F0FDF4":"#EFF6FF"}}>
          <td style={{...TD,textAlign:"center",fontSize:16}}>{m.type==="deliver"?<span style={{color:T.ok}}>{"↗"}</span>:<span style={{color:T.accent}}>{"↙"}</span>}</td>
          <td style={TD}>{isEd?<Inp type="date" value={editDate} onChange={setEditDate} style={{width:120}}/>:m.date}</td>
          <td style={TDB}>{m.orderNo}</td><td style={TD}>{m.orderDesc}</td><td style={TD}>{m.garmentType||"-"}</td>
          <td style={{...TDB,color:m.type==="deliver"?T.ok:T.accent}}>{isEd?<Inp type="number" value={editQty} onChange={v=>setEditQty(Number(v)||0)} style={{width:60}}/>:m.qty}</td>
          {!isInternal(selWs)&&<td style={TD}>{isEd&&m.type==="deliver"?<Inp type="number" step="0.01" value={editPrice} onChange={v=>setEditPrice(v)} style={{width:60}}/>:(m.price?m.price+" ج.م":"-")}</td>}
          <td style={TD}>{isEd?<Inp value={editNote} onChange={setEditNote} style={{width:80}}/>:(m.notes||"-")}</td>
          <td style={{...TD,whiteSpace:"nowrap"}}>{canEdit&&<div style={{display:"flex",gap:3}}>
            {isEd?<><Btn small primary onClick={saveEditMov}>حفظ</Btn><Btn ghost small onClick={()=>setEditMov(null)}>✕</Btn></>:<>
            <Btn small onClick={()=>startEditMov(m)} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}}>✏️</Btn>
            <DelBtn onConfirm={()=>delMovement(m)} blocked={getMovBlock(m)}/>
            <Btn small onClick={()=>printMov(m)} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}}>🖨</Btn></>}
          </div>}</td></tr>})}</tbody>
      </table></div>
    </Card>}
  </div>;

  /* ── PAYMENT MODE ── */
  if(mode==="payment")return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><h2 style={{fontSize:isMob?18:22,fontWeight:800,margin:0}}>{"💳 اضافة دفعة"}</h2><Btn ghost onClick={()=>setMode(null)}>↩</Btn></div>
    <Card title="تسجيل دفعة" style={{marginBottom:14}}>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:8,marginBottom:8}}>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>الورشة *</label><Sel value={payWs} onChange={setPayWs}><option value="">-- اختر --</option>{extWorkshops.map(w=><option key={w.id} value={w.name}>{w.name}</option>)}</Sel></div>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>نوع الحركة</label><Sel value={payType} onChange={setPayType}><option value="payment">دفعة للورشة (↗ تقليل)</option><option value="purchase">مشتريات الورشة (↙ اضافة)</option></Sel></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr 2fr",gap:8,marginBottom:8}}>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>المبلغ *</label><Inp type="number" step="0.01" value={payAmt} onChange={setPayAmt}/></div>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>التاريخ</label><Inp type="date" value={payDate} onChange={setPayDate}/></div>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>ملاحظات</label><Inp value={payNote} onChange={setPayNote}/></div>
      </div>
      {payWs&&(()=>{const a=wsAccounts(payWs);const wsObj=workshops.find(x=>x.name===payWs);const pct=wsObj?.payPercent||70;const totalDue=a.due+a.totalPurchase;const limit=r2(totalDue*(pct/100));const remaining=r2(limit-a.totalPaid);const exceeded=remaining<0;
        return<div style={{marginBottom:8}}>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:4}}>
            <span style={{padding:"4px 10px",borderRadius:6,fontSize:FS-1,fontWeight:700,background:a.balance>0?T.err+"10":T.ok+"10",color:a.balance>0?T.err:T.ok}}>{"الرصيد: "+fmt(r2(a.balance))+" ج.م"}</span>
            <span style={{padding:"4px 10px",borderRadius:6,fontSize:FS-1,fontWeight:600,background:T.purple+"10",color:T.purple}}>{"حد "+pct+"%: "+fmt(limit)}</span>
            <span style={{padding:"4px 10px",borderRadius:6,fontSize:FS-1,fontWeight:600,background:T.warn+"10"}}>{"مدفوع: "+fmt(r2(a.totalPaid))}</span>
            <span style={{padding:"4px 10px",borderRadius:6,fontSize:FS-1,fontWeight:700,background:remaining>0?T.ok+"10":T.err+"10",color:remaining>0?T.ok:T.err}}>{"متاح للدفع: "+(remaining>0?fmt(remaining)+" ج.م":"0")}</span>
          </div>
          {exceeded&&<div style={{padding:6,borderRadius:6,background:T.err+"10",fontSize:FS-1,fontWeight:700,color:T.err}}>{"⚠️ تجاوز حد "+pct+"% بمبلغ "+fmt(Math.abs(remaining))+" ج.م"}</div>}
        </div>})()}
      <Btn primary onClick={addPayment} disabled={!payWs||!payAmt}>تسجيل</Btn>
    </Card>
    {payWs&&<Card title={"دفعات "+payWs}><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["التاريخ","النوع","المبلغ","ملاحظات",""].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
      {(data.wsPayments||[]).filter(p=>p.wsName===payWs).sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map((p,i)=><tr key={i} style={{background:p.type==="payment"?"#FEF2F2":"#F0FDF4"}}>
        <td style={TD}>{p.date}</td><td style={{...TD,fontWeight:700,color:p.type==="payment"?T.err:T.ok}}>{p.type==="payment"?"دفعة ↗":"مشتريات ↙"}</td>
        <td style={{...TDB,color:p.type==="payment"?T.err:T.ok}}>{fmt(p.amount)+" ج.م"}</td><td style={TD}>{p.notes||"-"}</td>
        <td style={TD}><DelBtn onConfirm={()=>upConfig(d=>{d.wsPayments=(d.wsPayments||[]).filter(x=>x.id!==p.id)})}/></td>
      </tr>)}{(data.wsPayments||[]).filter(p=>p.wsName===payWs).length===0&&<tr><td colSpan={5} style={{...TD,textAlign:"center",color:T.textSec}}>لا توجد دفعات</td></tr>}
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
          <Btn onClick={()=>{const rows=[["الورشة","النسبة","مستحق","مدفوع","حد النسبة","متاح للدفع","الرصيد"]];activeWs.forEach(w=>{const a=wsAccounts(w.name);const pct=w.payPercent||70;const totalDue=a.due+a.totalPurchase;const limit=r2(totalDue*(pct/100));const remaining=r2(limit-a.totalPaid);rows.push([w.name,pct+"%",r2(totalDue),r2(a.totalPaid),limit,remaining>0?remaining:0,r2(a.balance)])});rows.push([]);rows.push(["اجمالي","",r2(totals.due+totals.purchase),r2(totals.paid),"","",r2(totals.balance)]);exportExcel(rows,"حسابات_الورش_"+season)}} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30"}}>📊 Excel</Btn>
          <Btn onClick={()=>{const el=document.getElementById("ws-acc-area");if(!el)return;printPage("حسابات الورش — "+season,el.innerHTML)}} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>🖨 طباعة</Btn>
          <Btn ghost onClick={()=>setMode(null)}>↩</Btn>
        </div>
      </div>
      <div id="ws-acc-area">
      <Card title="ملخص الحسابات" style={{marginBottom:14}}><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}>
        <thead><tr>{["الورشة","النسبة","مستحق","مدفوع","حد النسبة","متاح للدفع","الرصيد",""].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
        <tbody>{activeWs.map(w=>{const a=wsAccounts(w.name);const pct=w.payPercent||70;const totalDue=a.due+a.totalPurchase;const limit=r2(totalDue*(pct/100));const remaining=r2(limit-a.totalPaid);const exceeded=remaining<0;
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
          {(()=>{const tLimit=activeWs.reduce((s,w)=>{const a=wsAccounts(w.name);const pct=w.payPercent||70;return s+r2((a.due+a.totalPurchase)*(pct/100))},0);const tRemaining=r2(tLimit-totals.paid);
          return<tr style={{background:T.accent+"08"}}><td style={{...TD,fontWeight:800}}>الاجمالي</td><td style={TD}></td>
          <td style={{...TDB,color:T.accent,fontWeight:800}}>{fmt(r2(totals.due+totals.purchase))}</td>
          <td style={{...TDB,color:T.warn,fontWeight:800}}>{fmt(r2(totals.paid))}</td>
          <td style={{...TDB,fontWeight:800}}>{fmt(r2(tLimit))}</td>
          <td style={{...TDB,fontWeight:800,color:tRemaining>0?T.ok:T.err}}>{tRemaining>0?fmt(tRemaining):tRemaining<0?"تجاوز "+fmt(Math.abs(tRemaining)):"0"}</td>
          <td style={{...TDB,fontSize:FS+2,fontWeight:800,color:totals.balance>0?T.err:T.ok}}>{fmt(r2(totals.balance))+" ج.م"}</td><td style={TD}></td></tr>})()}
        </tbody>
      </table></div></Card>
      {/* Workshop filter */}
      <div style={{marginBottom:14}}><Sel value={accWsF} onChange={setAccWsF}><option value="الكل">كل الورش</option>{activeWs.map(w=><option key={w.id} value={w.name}>{w.name}</option>)}</Sel></div>
      {/* Per-workshop statement */}
      {filteredWs.map(w=>{const a=wsAccounts(w.name);
        const entries=[];
        data.orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===w.name).forEach(wd=>{(wd.receives||[]).forEach(r=>{entries.push({date:r.date,desc:o.modelNo+(wd.garmentType?" - "+wd.garmentType:""),qty:r.qty,price:r.price||0,amount:r2((r.qty||0)*(r.price||0)),type:"due"})})})});
        (data.wsPayments||[]).filter(p=>p.wsName===w.name).forEach(p=>{entries.push({date:p.date,desc:p.type==="payment"?"دفعة"+(p.notes?" - "+p.notes:""):"مشتريات"+(p.notes?" - "+p.notes:""),amount:p.amount,type:p.type})});
        entries.sort((a,b)=>(a.date||"").localeCompare(b.date||""));let running=0;
        return<Card key={w.id} title={"كشف حساب: "+w.name} style={{marginTop:12}} extra={<Btn small onClick={()=>{
          const el=document.getElementById("ws-stmt-"+w.id);if(!el)return;printPage("كشف حساب — "+w.name,el.innerHTML)
        }} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}}>🖨</Btn>}>
          <div id={"ws-stmt-"+w.id}>
          <h2>{"كشف حساب: "+w.name}</h2>
          <div className="sub">{"الموسم: "+season+" | التاريخ: "+new Date().toLocaleDateString("ar-EG")}</div>
          {(()=>{const pct=w.payPercent||70;const totalDue=a.due+a.totalPurchase;const limit=r2(totalDue*(pct/100));const remaining=r2(limit-a.totalPaid);const exceeded=remaining<0;
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

/* ══ SEARCH ══ */
function SearchPg({data,goD,isMob,season,statusCards}){
  const[q,setQ]=useState("");const[stF,setStF]=useState("الكل");const[wsF,setWsF]=useState("الكل");
  const statuses=(statusCards||DEFAULT_STATUSES).map(s=>s.name);
  const filtered=data.orders.filter(o=>{if(stF!=="الكل"&&o.status!==stF)return false;if(wsF!=="الكل"&&!(o.workshopDeliveries||[]).some(wd=>wd.wsName===wsF))return false;if(q.trim()){const s=q.trim().toLowerCase();const wsNames=(o.workshopDeliveries||[]).map(wd=>wd.wsName).join(" ");const h=[o.modelNo,o.modelDesc,o.sizeLabel,wsNames,o.status].filter(Boolean).join(" ").toLowerCase();if(!h.includes(s))return false}return true});
  return<div>
    <Card style={{marginBottom:12}}><div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"2fr 1fr 1fr",gap:8}}>
      <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap",fontWeight:600}}>بحث</label><Inp value={q} onChange={setQ} placeholder="رقم موديل، وصف..."/></div>
      <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap",fontWeight:600}}>الحالة</label><Sel value={stF} onChange={setStF}><option value="الكل">الكل</option>{statuses.map(s=><option key={s} value={s}>{s}</option>)}</Sel></div>
      <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap",fontWeight:600}}>الورشة</label><Sel value={wsF} onChange={setWsF}><option value="الكل">الكل</option>{(data.workshops||[]).map(w=><option key={w.id||w} value={w.name||w}>{w.name||w}</option>)}</Sel></div>
    </div></Card>
    <Card title={"نتائج ("+filtered.length+")"}><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:650}}>
      <thead><tr>{["#","التاريخ","موديل","الوصف","الورشة","الكمية","الحالة",""].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
      <tbody>{sortOrders(filtered).map((o,i)=>{const t=calcOrder(o);const wsNames=(o.workshopDeliveries||[]).map(wd=>wd.wsName).join(", ");return<tr key={o.id}><td style={TD}>{i+1}</td><td style={TD}>{o.date}</td><td style={TDB}>{o.modelNo}</td><td style={TD}>{o.modelDesc}</td><td style={TD}>{wsNames||"-"}</td><td style={{...TDB,color:T.accent}}>{t.cutQty}</td><td style={TD}><Badge t={o.status} cards={statusCards}/></td><td style={TD}><Btn ghost small onClick={()=>goD(o.id)}>تفاصيل</Btn></td></tr>})}
        {filtered.length===0&&<tr><td colSpan={8} style={{...TD,textAlign:"center",color:T.textSec,padding:40}}>لا توجد نتائج</td></tr>}
      </tbody>
    </table></div></Card>
  </div>
}

/* ══ PRODUCTION REPORT ══ */
/* ══ STOCK DELIVERY ══ */
function StockPg({data,updOrder,isMob,canEdit,statusCards}){
  const[selOrder,setSelOrder]=useState("");
  const[stQty,setStQty]=useState(0);const[stNote,setStNote]=useState("");const[stDate,setStDate]=useState(new Date().toISOString().split("T")[0]);
  const[editSt,setEditSt]=useState(null);const[edStDate,setEdStDate]=useState("");const[edStQty,setEdStQty]=useState(0);const[edStNote,setEdStNote]=useState("");

  /* Eligible orders: has workshop deliveries AND all pieces received */
  const eligible=data.orders.filter(o=>{
    const wds=o.workshopDeliveries||[];if(wds.length===0)return false;
    const t=calcOrder(o);const stockDel=(o.deliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);
    if(stockDel>=t.cutQty)return false;
    const pieces=o.orderPieces||[];
    if(pieces.length>0){
      return!pieces.some(p=>{const rcvdForP=wds.filter(wd=>wd.garmentType===p).reduce((s,wd)=>(wd.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0)+s,0);return rcvdForP===0})
    }else{
      const totalRcv=wds.reduce((s,wd)=>(wd.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0)+s,0);return totalRcv>0
    }
  });

  const ord=eligible.find(o=>o.id===selOrder);
  const t=ord?calcOrder(ord):{cutQty:0};
  const stockDel=ord?(ord.deliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0):0;
  const stockRemain=t.cutQty-stockDel;

  const saveStock=()=>{
    if(!selOrder||!stQty||stQty<=0)return;
    const qty=Math.min(Number(stQty),stockRemain);if(qty<=0){alert("لا توجد كمية متاحة");return}
    updOrder(selOrder,o=>{if(!o.deliveries)o.deliveries=[];o.deliveries.push({date:stDate,qty,notes:stNote});o.deliveredQty=o.deliveries.reduce((s,x)=>s+(Number(x.qty)||0),0);o.status=recomputeStatus(o)});
    setStQty(0);setStNote("");setStDate(new Date().toISOString().split("T")[0]);showToast("✓ تم تسليم المخزن")
  };

  return<div>
    <Card style={{marginBottom:12}}>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr 1fr auto",gap:10,alignItems:"end"}}>
        <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>اختر الأوردر</label>
          <Sel value={selOrder} onChange={v=>setSelOrder(v)}><option value="">-- اختر أوردر --</option>{eligible.map(o=>{const tc=calcOrder(o);const sd=(o.deliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);return<option key={o.id} value={o.id}>{o.modelNo+" — "+o.modelDesc+" (متبقي: "+(tc.cutQty-sd)+")"}</option>})}</Sel>
        </div>
        {selOrder&&<><div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>الكمية (متاح: {stockRemain})</label><Inp type="number" value={stQty} onChange={v=>setStQty(Math.min(Number(v)||0,stockRemain))}/></div>
        <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>التاريخ</label><Inp type="date" value={stDate} onChange={setStDate}/></div>
        <Btn primary onClick={saveStock} disabled={!stQty||stQty<=0}>📦 تسليم</Btn></>}
      </div>
      {selOrder&&<div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
        <span style={{padding:"4px 10px",borderRadius:6,background:T.err+"10",color:T.err,fontWeight:700,fontSize:FS-1}}>{"القص: "+t.cutQty}</span>
        <span style={{padding:"4px 10px",borderRadius:6,background:T.ok+"10",color:T.ok,fontWeight:700,fontSize:FS-1}}>{"تم تسليمه: "+stockDel}</span>
        <span style={{padding:"4px 10px",borderRadius:6,background:stockRemain>0?T.warn+"10":T.ok+"10",color:stockRemain>0?T.warn:T.ok,fontWeight:700,fontSize:FS-1}}>{"المتبقي: "+stockRemain}</span>
      </div>}
      {/* Workshop balance for selected order */}
      {selOrder&&ord&&(ord.workshopDeliveries||[]).length>0&&<div style={{marginTop:8,padding:8,borderRadius:8,background:T.bg,border:"1px solid "+T.brd}}>
        <div style={{fontSize:FS-2,fontWeight:700,color:T.textSec,marginBottom:4}}>حالة الورش</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{(ord.workshopDeliveries||[]).map((wd,i)=>{const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);const bal=(Number(wd.qty)||0)-rcvd;
          return<span key={i} style={{padding:"3px 8px",borderRadius:6,fontSize:FS-2,fontWeight:600,background:bal>0?T.err+"08":T.ok+"08",color:bal>0?T.err:T.ok,border:"1px solid "+(bal>0?T.err:T.ok)+"15"}}>{wd.wsName+(wd.garmentType?" ("+wd.garmentType+")":"")+" → سلّم: "+wd.qty+" | رجع: "+rcvd+(bal>0?" | متبقي: "+bal:" ✓")}</span>})}</div>
      </div>}
      {selOrder&&<div style={{marginTop:8}}><Inp value={stNote} onChange={setStNote} placeholder="ملاحظات (اختياري)"/></div>}
    </Card>
    {/* Recent stock deliveries */}
    {(()=>{const allStock=[];data.orders.forEach(o=>{(o.deliveries||[]).forEach((d,i)=>{allStock.push({...d,modelNo:o.modelNo,modelDesc:o.modelDesc,orderId:o.id,idx:i})})});allStock.sort((a,b)=>b.date.localeCompare(a.date));
      const startEdit=(s)=>{setEditSt({orderId:s.orderId,idx:s.idx});setEdStDate(s.date);setEdStQty(s.qty);setEdStNote(s.notes||"")};
      const saveEdit=()=>{if(!editSt)return;updOrder(editSt.orderId,o=>{const d=o.deliveries[editSt.idx];if(d){d.date=edStDate;d.qty=Number(edStQty)||0;d.notes=edStNote;o.deliveredQty=o.deliveries.reduce((s,x)=>s+(Number(x.qty)||0),0);o.status=recomputeStatus(o)}});setEditSt(null)};
      const delStock=(s)=>{updOrder(s.orderId,o=>{o.deliveries.splice(s.idx,1);o.deliveredQty=o.deliveries.reduce((ss,x)=>ss+(Number(x.qty)||0),0);o.status=recomputeStatus(o)})};
      return allStock.length>0&&<Card title={"سجل تسليمات المخزن ("+allStock.length+")"}>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["#","التاريخ","الموديل","الوصف","الكمية","ملاحظات",...(canEdit?[""]:[])] .map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
        <tbody>{allStock.map((s,i)=>{const isEd=editSt&&editSt.orderId===s.orderId&&editSt.idx===s.idx;
          return<tr key={i} style={{background:isEd?T.warn+"06":""}}>
          <td style={TD}>{i+1}</td>
          <td style={{...TD,minWidth:120}}>{isEd?<Inp type="date" value={edStDate} onChange={setEdStDate}/>:s.date}</td>
          <td style={TDB}>{s.modelNo}</td><td style={TD}>{s.modelDesc}</td>
          <td style={{...TDB,color:T.ok,minWidth:80}}>{isEd?<Inp type="number" value={edStQty} onChange={v=>setEdStQty(Number(v)||0)}/>:s.qty}</td>
          <td style={{...TD,minWidth:100}}>{isEd?<Inp value={edStNote} onChange={setEdStNote}/>:(s.notes||"-")}</td>
          {canEdit&&<td style={{...TD,whiteSpace:"nowrap"}}><div style={{display:"flex",gap:3}}>
            {isEd?<><Btn small primary onClick={saveEdit}>💾</Btn><Btn ghost small onClick={()=>setEditSt(null)}>✕</Btn></>
            :<><Btn small onClick={()=>startEdit(s)} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}}>✏️</Btn><DelBtn onConfirm={()=>delStock(s)}/></>}
          </div></td>}
        </tr>})}</tbody>
      </table></div></Card>})()}
  </div>
}

/* ══ REPORTS HUB ══ */
function ReportsHub({data,isMob,season,statusCards}){
  const[sub,setSub]=useState(null);
  const reports=[
    {key:"production",label:"تقرير الانتاج",icon:"📈",color:"#06B6D4"},
    {key:"cost",label:"التكاليف",icon:"💰",color:"#EC4899"},
    {key:"fabrics",label:"الخامات المستهلكة",icon:"🧵",color:"#8B5CF6"},
    {key:"wsPerf",label:"انتاجية الورش",icon:"⚡",color:"#F59E0B"},
    {key:"delivery",label:"معدل التسليم",icon:"📦",color:"#10B981"},
    {key:"summary",label:"ملخص الموسم",icon:"📋",color:"#0EA5E9"},
  ];
  if(sub==="production")return<div><Btn ghost onClick={()=>setSub(null)} style={{marginBottom:10}}>↩ التقارير</Btn><RepPg data={data} isMob={isMob} season={season} statusCards={statusCards}/></div>;
  if(sub==="cost")return<div><Btn ghost onClick={()=>setSub(null)} style={{marginBottom:10}}>↩ التقارير</Btn><CostPg data={data} isMob={isMob} statusCards={statusCards}/></div>;
  if(sub==="fabrics")return<div><Btn ghost onClick={()=>setSub(null)} style={{marginBottom:10}}>↩ التقارير</Btn><FabricReport data={data} isMob={isMob} season={season}/></div>;
  if(sub==="wsPerf")return<div><Btn ghost onClick={()=>setSub(null)} style={{marginBottom:10}}>↩ التقارير</Btn><WsPerfReport data={data} isMob={isMob} season={season}/></div>;
  if(sub==="delivery")return<div><Btn ghost onClick={()=>setSub(null)} style={{marginBottom:10}}>↩ التقارير</Btn><DeliveryReport data={data} isMob={isMob} season={season}/></div>;
  if(sub==="summary")return<div><Btn ghost onClick={()=>setSub(null)} style={{marginBottom:10}}>↩ التقارير</Btn><SeasonSummary data={data} isMob={isMob} season={season} statusCards={statusCards}/></div>;
  return<div>
    <div style={{display:"grid",gridTemplateColumns:isMob?"repeat(2,1fr)":"repeat(3,1fr)",gap:12}}>
      {reports.map(r=><div key={r.key} onClick={()=>setSub(r.key)} style={{background:T.cardSolid,borderRadius:14,padding:isMob?16:20,border:"1px solid "+T.brd,boxShadow:T.shadow,cursor:"pointer",display:"flex",alignItems:"center",gap:12,transition:"transform 0.15s"}} onMouseEnter={e=>e.currentTarget.style.transform="translateY(-2px)"} onMouseLeave={e=>e.currentTarget.style.transform=""}>
        <div style={{width:44,height:44,borderRadius:12,background:r.color+"12",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{r.icon}</div>
        <div style={{fontSize:FS,fontWeight:700,color:T.text}}>{r.label}</div>
      </div>)}
    </div>
  </div>
}

/* ══ FABRIC CONSUMPTION REPORT ══ */
function FabricReport({data,isMob,season}){
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
      <Btn onClick={printFab} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>🖨 طباعة</Btn>
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
function WsPerfReport({data,isMob,season}){
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
      <Btn onClick={printWsPerf} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>🖨 طباعة</Btn>
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
function DeliveryReport({data,isMob,season}){
  const today=new Date().toLocaleDateString("ar-EG",{year:"numeric",month:"long",day:"numeric"});
  const dayMap={};
  data.orders.forEach(o=>{(o.deliveries||[]).forEach(d=>{if(!dayMap[d.date])dayMap[d.date]={date:d.date,qty:0,orders:0};dayMap[d.date].qty+=(Number(d.qty)||0);dayMap[d.date].orders++});
    (o.workshopDeliveries||[]).forEach(wd=>{(wd.receives||[]).forEach(r=>{const k=r.date;if(!dayMap[k])dayMap[k]={date:k,qty:0,orders:0}})})});
  /* Workshop deliveries per day */
  const wsDay={};data.orders.forEach(o=>{(o.workshopDeliveries||[]).forEach(wd=>{if(!wsDay[wd.date])wsDay[wd.date]={date:wd.date,qty:0};wsDay[wd.date].qty+=(Number(wd.qty)||0)})});
  /* Cumulative stock delivery */
  const stockDays=Object.values(dayMap).filter(d=>d.qty>0).sort((a,b)=>a.date.localeCompare(b.date));
  let cum=0;const cumData=stockDays.map(d=>{cum+=d.qty;return{date:d.date,qty:d.qty,cumulative:cum}});
  const totalCut=data.orders.reduce((s,o)=>s+calcOrder(o).cutQty,0);const totalDel=data.orders.reduce((s,o)=>s+(o.deliveredQty||0),0);
  const printDel=()=>{const el=document.getElementById("del-rep");if(!el)return;printPage("تقرير معدل التسليم — "+season,el.innerHTML)};
  return<div>
    <div style={{display:"flex",justifyContent:"flex-end",gap:6,marginBottom:10}}>
      <Btn onClick={printDel} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>🖨 طباعة</Btn>
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
function SeasonSummary({data,isMob,season,statusCards}){
  const today=new Date().toLocaleDateString("ar-EG",{year:"numeric",month:"long",day:"numeric"});
  const totalCut=data.orders.reduce((s,o)=>s+calcOrder(o).cutQty,0);const totalDel=data.orders.reduce((s,o)=>s+(o.deliveredQty||0),0);const totalCost=data.orders.reduce((s,o)=>s+calcOrder(o).costAll,0);
  const sc={};data.orders.forEach(o=>{sc[o.status]=(sc[o.status]||0)+1});
  const wsMap={};data.orders.forEach(o=>{(o.workshopDeliveries||[]).forEach(wd=>{if(!wsMap[wd.wsName])wsMap[wd.wsName]={del:0,rcv:0};wsMap[wd.wsName].del+=(Number(wd.qty)||0);(wd.receives||[]).forEach(r=>{wsMap[wd.wsName].rcv+=(Number(r.qty)||0)})})});
  const printSum=()=>{const el=document.getElementById("sum-rep");if(!el)return;printPage("ملخص الموسم — "+season,el.innerHTML)};
  const exportSumXls=()=>{const rows=[["ملخص الموسم - "+season,""],["",""],["البيان","القيمة"],["عدد الموديلات",data.orders.length],["اجمالي القص",totalCut],["تسليم مخزن جاهز",totalDel],["الرصيد",totalCut-totalDel],["نسبة الانجاز",(totalCut?Math.round(totalDel/totalCut*100):0)+"%"],["اجمالي التكاليف",r2(totalCost)],["متوسط تكلفة القطعة",totalCut?r2(totalCost/totalCut):0],["",""],["حالات الأوردرات",""]];Object.entries(sc).forEach(([k,v])=>{rows.push([k,v])});rows.push(["",""],["أداء الورش",""],["الورشة","تسليم","استلام"]);Object.entries(wsMap).forEach(([n,v])=>{rows.push([n,v.del,v.rcv])});exportExcel(rows,"ملخص_الموسم_"+season)};
  return<div>
    <div style={{display:"flex",justifyContent:"flex-end",gap:6,marginBottom:10}}>
      <Btn onClick={exportSumXls} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30"}}>📊 Excel</Btn>
      <Btn onClick={printSum} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>🖨 طباعة</Btn>
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

function RepPg({data,isMob,season,statusCards}){
  const[filter,setFilter]=useState("الكل");const[dateFrom,setDateFrom]=useState("");const[dateTo,setDateTo]=useState("");
  const statuses=(statusCards||DEFAULT_STATUSES).map(s=>s.name);
  const list=sortOrders((filter==="الكل"?data.orders:data.orders.filter(o=>o.status===filter)).filter(o=>{if(dateFrom&&o.date<dateFrom)return false;if(dateTo&&o.date>dateTo)return false;return true}));
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
        <Btn onClick={printRep} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>🖨 طباعة</Btn>
      </div>
    </div>
    <div id="rep-area">
      <h1 style={{fontSize:isMob?18:24,fontWeight:800,margin:"0 0 4px",color:T.accent}}>تقرير قص وانتاج المصنع</h1>
      <div className="sub" style={{fontSize:FS-1,color:T.textSec,marginBottom:12}}>{"الموسم: "+season+" | "+list.length+" موديل | "+today}</div>
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        <div className="mc" style={{padding:"8px 14px",borderRadius:8,border:"1px solid "+T.brd,background:T.cardSolid,textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>كمية القص</div><b style={{fontSize:20,fontWeight:800,color:T.accent}}>{fmt(cutQ)}</b></div>
        <div className="mc" style={{padding:"8px 14px",borderRadius:8,border:"1px solid "+T.brd,background:T.cardSolid,textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>مخزن جاهز</div><b style={{fontSize:20,fontWeight:800,color:T.ok}}>{fmt(delQ)}</b></div>
        <div className="mc" style={{padding:"8px 14px",borderRadius:8,border:"1px solid "+T.brd,background:T.cardSolid,textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>الرصيد</div><b style={{fontSize:20,fontWeight:800,color:T.warn}}>{fmt(cutQ-delQ)}</b></div>
        <div className="mc" style={{padding:"8px 14px",borderRadius:8,border:"1px solid "+T.brd,background:T.cardSolid,textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>الانجاز</div><b style={{fontSize:20,fontWeight:800,color:comp>=80?T.ok:comp>=50?T.warn:T.err}}>{comp+"%"}</b></div>
      </div>
      <div style={{display:"flex",gap:4,marginBottom:8,flexWrap:"wrap",alignItems:"center"}}>{["الكل",...statuses].map(s=><Btn key={s} on={filter===s} small onClick={()=>setFilter(s)}>{s}</Btn>)}
        <span style={{fontSize:FS-2,color:T.textMut,margin:"0 4px"}}>|</span>
        <Inp type="date" value={dateFrom} onChange={setDateFrom} placeholder="من" style={{width:120,fontSize:FS-2}}/>
        <Inp type="date" value={dateTo} onChange={setDateTo} placeholder="إلى" style={{width:120,fontSize:FS-2}}/>
        {(dateFrom||dateTo)&&<Btn ghost small onClick={()=>{setDateFrom("");setDateTo("")}}>✕</Btn>}
      </div>
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
function CostPg({data,isMob,statusCards}){
  const[cDateFrom,setCDateFrom]=useState("");const[cDateTo,setCDateTo]=useState("");
  const orders=sortOrders(data.orders.filter(o=>{if(cDateFrom&&o.date<cDateFrom)return false;if(cDateTo&&o.date>cDateTo)return false;return true}));const totalCut=orders.reduce((s,o)=>s+calcOrder(o).cutQty,0);const totalCost=orders.reduce((s,o)=>s+calcOrder(o).costAll,0);const totalFab=orders.reduce((s,o)=>s+calcOrder(o).totalFab,0);const totalAcc=orders.reduce((s,o)=>s+calcOrder(o).accAll,0);
  const fabName=(o,k)=>{const l=gf(o,k,"Label");return l?l.split(" - ")[0]:null};
  const today=new Date().toLocaleDateString("ar-EG",{year:"numeric",month:"long",day:"numeric"});
  const printCost=()=>{const el=document.getElementById("cost-area");if(!el)return;printPage("تقرير التكاليف",el.innerHTML)};
  const exportCostXls=()=>{const rows=[["#","الموديل","الوصف","الخامات","الكمية","خامات/قطعة","اكسسوار/قطعة","تكلفة القطعة","اجمالي"]];
    orders.forEach((o,i)=>{const c=calcOrder(o);const aFabs=FKEYS.filter(k=>gf(o,k)&&gc(o,k).length>0).map(k=>fabName(o,k)).filter(Boolean).join("، ");rows.push([i+1,o.modelNo,o.modelDesc,aFabs,c.cutQty,c.fabPer,c.accPer,c.costPer,c.costAll])});
    rows.push([]);rows.push(["","","","اجمالي",totalCut,r2(totalFab),r2(totalAcc),"",r2(totalCost)]);exportExcel(rows,"تقرير_التكاليف")};
  return<div>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:10,flexWrap:"wrap",gap:6,alignItems:"center"}}>
      <div style={{display:"flex",gap:4,alignItems:"center",flexWrap:"wrap"}}>
        <span style={{fontSize:FS-2,color:T.textSec}}>فترة:</span>
        <Inp type="date" value={cDateFrom} onChange={setCDateFrom} style={{width:120,fontSize:FS-2}}/>
        <Inp type="date" value={cDateTo} onChange={setCDateTo} style={{width:120,fontSize:FS-2}}/>
        {(cDateFrom||cDateTo)&&<Btn ghost small onClick={()=>{setCDateFrom("");setCDateTo("")}}>✕</Btn>}
      </div>
      <div style={{display:"flex",gap:6}}>
        <Btn onClick={exportCostXls} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30"}}>📊 Excel</Btn>
        <Btn onClick={printCost} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>🖨 طباعة</Btn>
      </div>
    </div>
    <div id="cost-area">
      <h1 style={{fontSize:isMob?18:24,fontWeight:800,margin:"0 0 4px",color:T.accent}}>تقرير التكاليف</h1>
      <div className="sub" style={{fontSize:FS-1,color:T.textSec,marginBottom:12}}>{orders.length+" موديل | "+today}</div>
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        {[[orders.length,"الموديلات",T.accent],[fmt(totalCut),"اجمالي القص",T.ok],[fmt(r2(totalFab))+" ج","تكلفة الخامات",T.warn],[fmt(r2(totalAcc))+" ج","تكلفة الاكسسوار",T.purple],[fmt(r2(totalCost))+" ج","اجمالي التكاليف",T.err],[totalCut?(r2(totalCost/totalCut))+" ج":"0","متوسط/قطعة","#8B5CF6"]].map(([v,l,c],i)=>
          <div key={i} className="mc" style={{padding:"8px 14px",borderRadius:8,border:"1px solid "+T.brd,background:T.cardSolid,textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>{l}</div><b style={{fontSize:16,fontWeight:800,color:c}}>{v}</b></div>)}
      </div>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:650}}>
        <thead><tr>{["#","الموديل","الوصف","الخامات","كمية","خامات/قطعة","اكسسوار/قطعة","تكلفة القطعة","اجمالي"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
        <tbody>{orders.map((o,i)=>{const c=calcOrder(o);const aFabs=FKEYS.filter(k=>gf(o,k)&&gc(o,k).length>0);
          return<tr key={o.id}>
          <td style={TD}>{i+1}</td><td style={TDB}>{o.modelNo}</td><td style={{...TD,maxWidth:100}}>{o.modelDesc}</td>
          <td style={TD}><div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{aFabs.map(k=>{const cost=gcons(o,k)*(gf(o,k,"Price")||0)*slay(gc(o,k));const perPc=c.cutQty?r2(cost/c.cutQty):0;
            return<span key={k} className="fab" style={{display:"inline-block",padding:"2px 6px",borderRadius:4,fontSize:FS-3,fontWeight:600,background:FCOL[FKEYS.indexOf(k)]+"15",color:FCOL[FKEYS.indexOf(k)]}}>{fabName(o,k)+" "+perPc+"ج"}</span>})}{aFabs.length===0&&"-"}</div></td>
          <td style={{...TDB,color:T.accent}}>{c.cutQty}</td>
          <td style={TDB}>{c.fabPer+" ج.م"}</td>
          <td style={TDB}>{c.accPer+" ج.م"}</td>
          <td style={{...TDB,color:T.accent,fontSize:FS+1}}>{c.costPer+" ج.م"}</td>
          <td style={{...TDB,color:T.err}}>{fmt(c.costAll)+" ج.م"}</td></tr>})}
          {orders.length>0&&<tr className="tot" style={{background:T.accent+"08"}}><td colSpan={4} style={{...TD,fontWeight:800}}>الاجمالي</td><td style={{...TDB,fontWeight:800}}>{fmt(totalCut)}</td><td style={{...TDB,fontWeight:800}}>{fmt(r2(totalFab))}</td><td style={{...TDB,fontWeight:800}}>{fmt(r2(totalAcc))}</td><td style={TDB}></td><td style={{...TDB,fontWeight:800,color:T.err,fontSize:FS+1}}>{fmt(r2(totalCost))+" ج.م"}</td></tr>}
          {orders.length===0&&<tr><td colSpan={9} style={{...TD,textAlign:"center",color:T.textSec,padding:30}}>لا توجد بيانات</td></tr>}
        </tbody>
      </table></div>
    </div>
  </div>
}

/* ══ SETTINGS ══ */
function SettingsPg({config,upConfig,isMob,user,theme,setTheme,season,orders}){
  const[newSeason,setNewSeason]=useState("");const[delConfirm,setDelConfirm]=useState("");
  const[newUserEmail,setNewUserEmail]=useState("");const[newUserRole,setNewUserRole]=useState("viewer");
  const[newUserName,setNewUserName]=useState("");const[newUserPass,setNewUserPass]=useState("");const[newUserPass2,setNewUserPass2]=useState("");
  const[createErr,setCreateErr]=useState("");const[createOk,setCreateOk]=useState("");const[creating,setCreating]=useState(false);
  const[clearConfirm,setClearConfirm]=useState(false);
  /* Admin password gate */
  const[pendingAction,setPendingAction]=useState(null);const[adminPass,setAdminPass]=useState("");const[passErr,setPassErr]=useState("");const[passLoading,setPassLoading]=useState(false);
  const requirePass=(action)=>{setPendingAction(()=>action);setAdminPass("");setPassErr("")};
  const confirmPass=async()=>{if(!adminPass){setPassErr("ادخل كلمة المرور");return}setPassLoading(true);setPassErr("");
    try{await signInWithEmailAndPassword(auth,user.email,adminPass);if(pendingAction)pendingAction();setPendingAction(null);setAdminPass("")}
    catch(e){setPassErr("كلمة المرور غير صحيحة")}finally{setPassLoading(false)}};
  const handleLogo=async e=>{const f=e.target.files[0];if(!f)return;const compressed=await compressImage(f,200,0.6);requirePass(()=>upConfig(d=>{d.logo=compressed}))};
  const addSeason=()=>{if(!newSeason.trim())return;requirePass(()=>{upConfig(d=>{if(!d.seasons)d.seasons=[];if(!d.seasons.includes(newSeason.trim()))d.seasons.push(newSeason.trim());d.activeSeason=newSeason.trim()});setNewSeason("")})};
  const deleteSeason=(s)=>{requirePass(async()=>{try{const snap=await getDocs(collection(db,"seasons",s,"orders"));await Promise.all(snap.docs.map(d=>deleteDoc(doc(db,"seasons",s,"orders",d.id))))}catch(e){}upConfig(d=>{d.seasons=(d.seasons||[]).filter(x=>x!==s);if(d.activeSeason===s)d.activeSeason=d.seasons[0]||""})})};
  const clearAllOrders=()=>{requirePass(async()=>{try{const snap=await getDocs(collection(db,"seasons",season,"orders"));await Promise.all(snap.docs.map(d=>deleteDoc(doc(db,"seasons",season,"orders",d.id))))}catch(e){}setClearConfirm(false)})};

  const createUser=async()=>{
    setCreateErr("");setCreateOk("");
    if(!newUserName.trim()||!newUserEmail.trim()||!newUserPass){setCreateErr("اكمل جميع البيانات");return}
    if(newUserPass.length<6){setCreateErr("كلمة المرور 6 حروف على الأقل");return}
    if(newUserPass!==newUserPass2){setCreateErr("كلمة المرور غير متطابقة");return}
    setCreating(true);
    try{
      const secAuth=getSecondaryAuth();
      const cred=await createUserWithEmailAndPassword(secAuth,newUserEmail.trim(),newUserPass);
      await updateProfile(cred.user,{displayName:newUserName.trim()});
      await signOut(secAuth);
      upConfig(d=>{if(!d.usersList)d.usersList=[];const ex=d.usersList.find(u=>u.email===newUserEmail.trim());if(ex){ex.role=newUserRole;ex.name=newUserName.trim()}else{d.usersList.push({email:newUserEmail.trim(),role:newUserRole,name:newUserName.trim()})}});
      setCreateOk("تم انشاء الحساب بنجاح: "+newUserEmail.trim());
      setNewUserName("");setNewUserEmail("");setNewUserPass("");setNewUserPass2("");setNewUserRole("viewer");
    }catch(e){
      setCreateErr(e.code==="auth/email-already-in-use"?"الايميل مستخدم بالفعل":"خطأ: "+e.message)
    }
    setCreating(false);
  };

  return<div>
    {/* Admin Password Modal */}
    {pendingAction&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",direction:"rtl"}} onClick={()=>{setPendingAction(null);setAdminPass("");setPassErr("")}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:24,width:isMob?300:360,boxShadow:"0 20px 60px rgba(0,0,0,0.3)",border:"1px solid "+T.brd}}>
        <div style={{fontSize:FS+2,fontWeight:800,color:T.text,marginBottom:4,textAlign:"center"}}>🔐 تأكيد الهوية</div>
        <div style={{fontSize:FS-1,color:T.textSec,textAlign:"center",marginBottom:16}}>ادخل كلمة مرور المدير للمتابعة</div>
        <Inp type="password" value={adminPass} onChange={setAdminPass} placeholder="كلمة المرور"/>
        {passErr&&<div style={{color:T.err,fontSize:FS-1,fontWeight:600,marginTop:6,textAlign:"center"}}>{passErr}</div>}
        <div style={{display:"flex",gap:8,marginTop:14,justifyContent:"center"}}>
          <Btn primary onClick={confirmPass} disabled={passLoading}>{passLoading?"جاري التحقق...":"تأكيد"}</Btn>
          <Btn ghost onClick={()=>{setPendingAction(null);setAdminPass("");setPassErr("")}}>الغاء</Btn>
        </div>
      </div>
    </div>}
    <Card title="ادارة المواسم" style={{marginBottom:12}}>
      <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}><Inp value={newSeason} onChange={setNewSeason} placeholder="اسم الموسم (مثال: SS27)" style={{width:220}}/><Btn primary onClick={addSeason}>+ موسم جديد</Btn></div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {(config.seasons||[]).map(s=><div key={s} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderRadius:12,border:s===config.activeSeason?"2px solid "+T.accent:"1px solid "+T.brd,background:s===config.activeSeason?T.accentBg:T.cardSolid,flexWrap:"wrap",gap:8}}>
          <div onClick={()=>requirePass(()=>upConfig(d=>{d.activeSeason=s}))} style={{cursor:"pointer",display:"flex",alignItems:"center",gap:10}}><span style={{fontWeight:700,fontSize:FS+2,color:s===config.activeSeason?T.accent:T.text}}>{s}</span>{s===config.activeSeason&&<span style={{fontSize:FS-3,color:T.ok,background:T.ok+"15",padding:"2px 10px",borderRadius:12}}>نشط</span>}</div>
          <div style={{display:"flex",gap:8}}>{s!==config.activeSeason&&<Btn small onClick={()=>requirePass(()=>upConfig(d=>{d.activeSeason=s}))} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}}>تفعيل</Btn>}<Btn danger small onClick={()=>deleteSeason(s)}>حذف</Btn></div>
        </div>)}
      </div>
    </Card>
    <Card title="نسخ احتياطي" style={{marginBottom:12}}>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
        <Btn primary onClick={()=>{const backup={config,orders,exportDate:new Date().toISOString(),season};const blob=new Blob([JSON.stringify(backup,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="clark-backup-"+season+"-"+new Date().toISOString().split("T")[0]+".json";a.click();URL.revokeObjectURL(url)}}>📥 تصدير</Btn>
        <div style={{position:"relative"}}><Btn onClick={()=>{}} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}}>📤 استيراد</Btn><input type="file" accept=".json" onChange={e=>{const f=e.target.files[0];if(!f)return;requirePass(()=>{const reader=new FileReader();reader.onload=async ev=>{try{const d=JSON.parse(ev.target.result);if(d.config){await setDoc(doc(db,"factory","config"),d.config)}if(d.orders&&d.season){for(const o of d.orders){const{_docId,...rest}=o;await addDoc(collection(db,"seasons",d.season,"orders"),rest)}}alert("تم استيراد النسخة الاحتياطية بنجاح")}catch(err){alert("خطأ في الملف: "+err.message)}};reader.readAsText(f)});e.target.value=""}} style={{position:"absolute",inset:0,opacity:0,cursor:"pointer"}}/></div>
        <span style={{fontSize:FS-2,color:T.textSec}}>{"الموسم: "+season}</span>
      </div>
    </Card>
    <Card title="مسح بيانات الأوردرات" style={{marginBottom:12}}>
      <div style={{fontSize:FS,color:T.textSec,marginBottom:10}}>{"الموسم الحالي: "+season+" - عدد الأوردرات: "+(orders||[]).length}</div>
      {!clearConfirm?<Btn danger onClick={()=>setClearConfirm(true)}>مسح جميع الأوردرات للموسم الحالي</Btn>:
      <div style={{padding:16,background:T.err+"08",borderRadius:12,border:"1px solid "+T.err+"30"}}>
        <div style={{fontSize:FS,fontWeight:700,color:T.err,marginBottom:10}}>{"⚠️ سيتم حذف "+(orders||[]).length+" أوردر نهائياً مع جميع التسليمات - هل أنت متأكد؟"}</div>
        <div style={{display:"flex",gap:8}}><Btn danger onClick={clearAllOrders}>تأكيد المسح</Btn><Btn ghost onClick={()=>setClearConfirm(false)}>الغاء</Btn></div>
      </div>}
    </Card>
    <Card title="لوجو المصنع" style={{marginBottom:12}}>
      <div style={{display:"flex",alignItems:"center",gap:20,flexWrap:"wrap"}}>
        <div style={{width:80,height:80,borderRadius:12,border:"2px dashed "+T.brd,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",background:T.inputBg||T.cardSolid,cursor:"pointer",position:"relative"}}>{config.logo?<img src={config.logo} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<span style={{fontSize:FS-1,color:T.textMut}}>لوجو</span>}<input type="file" accept="image/*" onChange={handleLogo} style={{position:"absolute",inset:0,opacity:0,cursor:"pointer"}}/></div>
        <div><div style={{fontSize:FS,color:T.text,fontWeight:600,marginBottom:4}}>اضغط لرفع اللوجو</div>{config.logo&&<Btn danger small onClick={()=>requirePass(()=>upConfig(d=>{d.logo=""}))} style={{marginTop:4}}>حذف اللوجو</Btn>}</div>
      </div>
    </Card>
    <Card title="ادارة المستخدمين" style={{marginBottom:16}}>
      {/* Create new user */}
      <div style={{padding:20,background:T.accentBg,borderRadius:14,marginBottom:20,border:"1px solid "+T.accent+"20"}}>
        <div style={{fontSize:FS+1,fontWeight:700,color:T.accent,marginBottom:14}}>انشاء حساب جديد</div>
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:10,marginBottom:10}}>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap",fontWeight:600}}>اسم المستخدم *</label><Inp value={newUserName} onChange={setNewUserName} placeholder="الاسم الكامل"/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap",fontWeight:600}}>البريد الالكتروني *</label><Inp value={newUserEmail} onChange={setNewUserEmail} placeholder="example@email.com" type="email"/></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr 1fr",gap:10,marginBottom:10}}>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap",fontWeight:600}}>كلمة المرور *</label><Inp value={newUserPass} onChange={setNewUserPass} type="password" placeholder="6 حروف على الأقل"/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap",fontWeight:600}}>تأكيد كلمة المرور *</label><Inp value={newUserPass2} onChange={setNewUserPass2} type="password" placeholder="أعد كتابة كلمة المرور"/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap",fontWeight:600}}>الصلاحية</label><Sel value={newUserRole} onChange={setNewUserRole}><option value="admin">مدير النظام</option><option value="manager">مدير انتاج</option><option value="viewer">مشاهد فقط</option></Sel></div>
        </div>
        {createErr&&<div style={{color:T.err,fontSize:FS,marginBottom:10,fontWeight:600}}>{"⚠️ "+createErr}</div>}
        {createOk&&<div style={{color:T.ok,fontSize:FS,marginBottom:10,fontWeight:600}}>{"✓ "+createOk}</div>}
        <Btn primary onClick={createUser} disabled={creating}>{creating?"جاري الانشاء...":"انشاء الحساب"}</Btn>
      </div>
      {/* Existing users */}
      <div style={{fontSize:FS,fontWeight:700,color:T.text,marginBottom:10}}>المستخدمين الحاليين</div>
      {(config.usersList||[]).length>0&&<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:500}}><thead><tr>{["الاسم","البريد","الصلاحية",""].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
        {(config.usersList||[]).map((u,i)=><tr key={i}><td style={{...TD,fontWeight:600}}>{u.name||"-"}</td><td style={TD}>{u.email}</td><td style={TD}><Sel value={u.role} onChange={v=>requirePass(()=>upConfig(d=>{const x=(d.usersList||[]).find(z=>z.email===u.email);if(x)x.role=v}))}><option value="admin">مدير النظام</option><option value="manager">مدير انتاج</option><option value="viewer">مشاهد فقط</option></Sel></td><td style={TD}><DelBtn onConfirm={()=>requirePass(()=>upConfig(d=>{d.usersList=(d.usersList||[]).filter(x=>x.email!==u.email)}))}/></td></tr>)}
      </tbody></table></div>}
      {(config.usersList||[]).length===0&&<div style={{textAlign:"center",padding:20,color:T.textSec}}>لم يتم اضافة مستخدمين</div>}
      <div style={{marginTop:16,display:"grid",gridTemplateColumns:isMob?"1fr":"repeat(3,1fr)",gap:12}}>
        {[["مدير النظام",T.accent,"كل الصلاحيات + اعدادات"],["مدير انتاج",T.ok,"اضافة وتعديل"],["مشاهد",T.warn,"عرض فقط"]].map(([n,c,d])=><div key={n} style={{padding:14,borderRadius:12,background:c+"08",border:"1px solid "+c+"25"}}><div style={{fontSize:FS,fontWeight:700,color:c,marginBottom:4}}>{n}</div><div style={{fontSize:FS-2,color:T.textSec}}>{d}</div></div>)}
      </div>
    </Card>
    {/* Theme Toggle - Bottom */}
    <div style={{display:"flex",justifyContent:"center",gap:12,marginTop:16}}>
      {Object.entries(THEMES).map(([key,th])=><div key={key} onClick={()=>setTheme(key)} style={{cursor:"pointer",padding:"10px 28px",borderRadius:10,background:th.bg,border:theme===key?"2px solid "+th.accent:"1px solid "+th.brd,textAlign:"center",transition:"all 0.2s"}}>
        <div style={{width:22,height:22,borderRadius:6,background:th.accent,margin:"0 auto 6px"}}/>
        <div style={{fontSize:FS,fontWeight:700,color:th.text}}>{th.name}{theme===key?" ✓":""}</div>
      </div>)}
    </div>
  </div>
}
