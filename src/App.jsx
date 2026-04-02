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

/* ── Theme System ── */
const THEMES = {
  light: {
    name:"فاتح",bg:"#EFF6FF",card:"rgba(255,255,255,0.85)",cardSolid:"#FFFFFF",glass:"rgba(255,255,255,0.6)",
    brd:"rgba(148,163,184,0.25)",brdStrong:"rgba(148,163,184,0.4)",
    text:"#1E293B",textSec:"#64748B",textMut:"#94A3B8",accent:"#0EA5E9",accentBg:"#E0F2FE",
    ok:"#10B981",err:"#EF4444",warn:"#F59E0B",purple:"#8B5CF6",shadow:"0 4px 24px rgba(0,0,0,0.06)",
    sidebarBg:"rgba(255,255,255,0.95)",inputBg:"#FFFFFF",bodyBg:"#EFF6FF"
  },
  purple: {
    name:"بنفسجي",bg:"#F8F9FC",card:"rgba(255,255,255,0.95)",cardSolid:"#FFFFFF",glass:"rgba(255,255,255,0.8)",
    brd:"rgba(108,92,231,0.12)",brdStrong:"rgba(108,92,231,0.2)",
    text:"#2D3436",textSec:"#636E72",textMut:"#B2BEC3",accent:"#6C5CE7",accentBg:"rgba(108,92,231,0.08)",
    ok:"#00B894",err:"#E17055",warn:"#FDCB6E",purple:"#6C5CE7",shadow:"0 4px 20px rgba(108,92,231,0.08)",
    sidebarBg:"#F3F4F8",inputBg:"#FFFFFF",bodyBg:"#F8F9FC"
  },
  dark: {
    name:"داكن",bg:"#1A1D23",card:"rgba(36,40,50,0.95)",cardSolid:"#242832",glass:"rgba(36,40,50,0.8)",
    brd:"rgba(255,255,255,0.08)",brdStrong:"rgba(255,255,255,0.15)",
    text:"#E8ECF1",textSec:"#9CA3AF",textMut:"#6B7280",accent:"#00BFA5",accentBg:"rgba(0,191,165,0.12)",
    ok:"#10B981",err:"#EF4444",warn:"#F59E0B",purple:"#A78BFA",shadow:"0 4px 24px rgba(0,0,0,0.3)",
    sidebarBg:"#1E222A",inputBg:"#2A2E38",bodyBg:"#1A1D23"
  },
  midnight: {
    name:"ليلي",bg:"#0F172A",card:"rgba(30,41,59,0.9)",cardSolid:"#1E293B",glass:"rgba(30,41,59,0.7)",
    brd:"rgba(148,163,184,0.12)",brdStrong:"rgba(148,163,184,0.2)",
    text:"#F1F5F9",textSec:"#94A3B8",textMut:"#64748B",accent:"#38BDF8",accentBg:"rgba(56,189,248,0.1)",
    ok:"#34D399",err:"#FB7185",warn:"#FBBF24",purple:"#C084FC",shadow:"0 4px 24px rgba(0,0,0,0.4)",
    sidebarBg:"#0F172A",inputBg:"#1E293B",bodyBg:"#0F172A"
  }
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
  workshops:[{id:1,name:"CLARK",owner:"",phone:"",address:"",idCard:"",ownerPhoto:"",rating:8},{id:2,name:"ورشة محمود",owner:"محمود",phone:"",address:"",idCard:"",ownerPhoto:"",rating:7},{id:3,name:"المصنع",owner:"",phone:"",address:"",idCard:"",ownerPhoto:"",rating:9}],
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
function sortOrders(orders){return[...orders].sort((a,b)=>(b.createdAt||b.date||"").localeCompare(a.createdAt||a.date||""))}
function getWsName(wsId,workshops){if(!wsId)return"";const ws=(workshops||[]).find(w=>w.id===Number(wsId)||w.name===wsId);return ws?ws.name:(typeof wsId==="string"?wsId:"")}
function getWsObj(wsId,workshops){return(workshops||[]).find(w=>w.id===Number(wsId)||w.name===wsId)||null}

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

function printReceipt(wsName,wsOwner,modelNo,qty,date,balance){
  const pw=window.open("","_blank");if(!pw)return;
  pw.document.write("<!DOCTYPE html><html dir='rtl'><head><meta charset='utf-8'/><link href='https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;800&display=swap' rel='stylesheet'/><title>اذن استلام</title><style>body{font-family:'Cairo',Arial,sans-serif;padding:40px;font-size:18px;direction:rtl;color:#1E293B;line-height:2}h1{font-size:28px;text-align:center;color:#0284C7;margin-bottom:30px;border-bottom:3px solid #0284C7;padding-bottom:15px}.sig{margin-top:60px;display:flex;justify-content:space-between}.sig-box{text-align:center;width:200px;border-top:2px solid #333;padding-top:10px;font-weight:bold}.info{font-weight:bold;color:#0284C7}.bal{color:#EF4444;font-weight:bold}@media print{body{padding:20px}}</style></head><body>");
  pw.document.write("<h1>اذن استلام ورشة</h1>");
  pw.document.write("<p>استلمت أنا ورشة <span class='info'>"+wsName+"</span>"+(wsOwner?" - "+wsOwner:"")+"</p>");
  pw.document.write("<p>موديل رقم: <span class='info'>"+modelNo+"</span></p>");
  pw.document.write("<p>الكمية: <span class='info'>"+qty+"</span> قطعة</p>");
  pw.document.write("<p>تاريخ الاستلام: <span class='info'>"+date+"</span></p>");
  if(balance>0)pw.document.write("<p>الرصيد المتبقي: <span class='bal'>"+balance+" قطعة</span></p>");
  pw.document.write("<br/><p>وأقر أنا الموقع أدناه بتسليم البضاعة على الحالة التي استلمتها عليها وهذا اقرار مني بذلك.</p>");
  pw.document.write("<div class='sig'><div class='sig-box'>توقيع المستلم</div><div class='sig-box'>توقيع المسلّم</div></div>");
  pw.document.write("</body></html>");pw.document.close();setTimeout(()=>{pw.focus();pw.print()},500)
}

function printReceiveReceipt(wsName,modelNo,qty,date,balance){
  const pw=window.open("","_blank");if(!pw)return;
  pw.document.write("<!DOCTYPE html><html dir='rtl'><head><meta charset='utf-8'/><link href='https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;800&display=swap' rel='stylesheet'/><title>اذن استلام مصنع</title><style>body{font-family:'Cairo',Arial,sans-serif;padding:40px;font-size:18px;direction:rtl;color:#1E293B;line-height:2}h1{font-size:28px;text-align:center;color:#10B981;margin-bottom:30px;border-bottom:3px solid #10B981;padding-bottom:15px}.info{font-weight:bold;color:#10B981}.bal{color:#EF4444;font-weight:bold}.sig{margin-top:60px;display:flex;justify-content:space-between}.sig-box{text-align:center;width:200px;border-top:2px solid #333;padding-top:10px;font-weight:bold}@media print{body{padding:20px}}</style></head><body>");
  pw.document.write("<h1>اذن استلام - المصنع</h1>");
  pw.document.write("<p>تم استلام من ورشة <span class='info'>"+wsName+"</span></p>");
  pw.document.write("<p>موديل رقم: <span class='info'>"+modelNo+"</span></p>");
  pw.document.write("<p>الكمية المستلمة: <span class='info'>"+qty+"</span> قطعة</p>");
  pw.document.write("<p>تاريخ الاستلام: <span class='info'>"+date+"</span></p>");
  if(balance>0)pw.document.write("<p>الرصيد المتبقي عند الورشة: <span class='bal'>"+balance+" قطعة</span></p>");
  pw.document.write("<div class='sig'><div class='sig-box'>المستلم</div><div class='sig-box'>المسلّم</div></div>");
  pw.document.write("</body></html>");pw.document.close();setTimeout(()=>{pw.focus();pw.print()},500)
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
  const o={id:gid(),date:today,createdAt:new Date().toISOString(),modelNo:"",modelDesc:"",sizeSetId:"",sizeLabel:"",status:"تم القص",cutQty:0,deliveredQty:0,accItems:[],deliveries:[],workshopDeliveries:[],orderPieces:[],image:"",instructions:"",attachments:[]};
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

function exportPDF(elementId,title){
  const el=document.getElementById(elementId);if(!el)return;
  const pw=window.open("","_blank");if(!pw)return;
  const html="<!DOCTYPE html><html dir='rtl'><head><meta charset='utf-8'/><link href='https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;800&display=swap' rel='stylesheet'/><title>"+title+"</title><style>body{font-family:'Cairo',Arial,sans-serif;padding:30px;font-size:13px;direction:rtl;color:#1E293B;background:#fff}table{width:100%;border-collapse:collapse;margin:14px 0}th,td{border:1px solid #E2E8F0;padding:10px 12px;text-align:right}th{background:#F1F5F9;font-weight:700;font-size:11px;color:#475569}h1{font-size:22px;color:#0284C7;margin:0 0 6px}img{max-width:140px;border-radius:10px}@media print{body{padding:15px}}</style></head><body>"+el.innerHTML+"</body></html>";
  pw.document.write(html);pw.document.close();
  setTimeout(()=>{pw.focus();pw.print()},500)
}

function printOrderSheet(order,t,activeFabs,statusCards){
  const pw=window.open("","_blank");if(!pw)return;
  let fabRows="";activeFabs.forEach(k=>{const fp=order["fabricPieces"+k]||[];fabRows+="<tr><td>"+gf(order,k,"Label")+"</td><td>"+(fp.length>0?fp.join("، "):"-")+"</td><td>"+slay(gc(order,k))+"</td><td>"+sqty(gc(order,k))+"</td></tr>"});
  let wsRows="";(order.workshopDeliveries||[]).forEach(wd=>{const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);wsRows+="<tr><td>"+wd.wsName+"</td><td>"+(wd.wsOwner||"-")+"</td><td>"+(wd.garmentType||"-")+"</td><td>"+wd.qty+"</td><td>"+rcvd+"</td><td>"+(wd.qty-rcvd)+"</td></tr>"});
  const col=getStatusColor(order.status,statusCards);
  pw.document.write("<!DOCTYPE html><html dir='rtl'><head><meta charset='utf-8'/><link href='https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;800&display=swap' rel='stylesheet'/><title>أمر تشغيل - "+order.modelNo+"</title><style>body{font-family:'Cairo',Arial,sans-serif;padding:30px;font-size:14px;direction:rtl;color:#1E293B}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #ddd;padding:10px 12px;text-align:right}th{background:#F1F5F9;font-weight:700;font-size:12px}.header{display:flex;gap:20px;align-items:flex-start;margin-bottom:20px}.img-box{width:120px;height:160px;border-radius:10px;overflow:hidden;border:1px solid #ddd;flex-shrink:0}.img-box img{width:100%;height:100%;object-fit:cover}.info{flex:1}.badge{display:inline-block;padding:4px 14px;border-radius:20px;font-weight:700;font-size:13px}h1{font-size:24px;color:#0284C7;margin:0 0 10px}@media print{body{padding:15px}}</style></head><body>");
  pw.document.write("<h1>أمر تشغيل - "+order.modelNo+"</h1>");
  pw.document.write("<div class='header'>");
  if(order.image)pw.document.write("<div class='img-box'><img src='"+order.image+"'/></div>");
  pw.document.write("<div class='info'><table><tr><th>رقم الموديل</th><td><b>"+order.modelNo+"</b></td><th>الوصف</th><td>"+order.modelDesc+"</td></tr><tr><th>المقاسات</th><td>"+order.sizeLabel+"</td><th>التاريخ</th><td>"+order.date+"</td></tr><tr><th>كمية القص</th><td><b>"+t.cutQty+"</b></td><th>تم التسليم</th><td>"+(order.deliveredQty||0)+"</td></tr><tr><th>الرصيد</th><td><b>"+t.balance+"</b></td><th>الحالة</th><td><span class='badge' style='background:"+col+"20;color:"+col+"'>"+order.status+"</span></td></tr></table></div></div>");
  if(fabRows)pw.document.write("<h2 style='font-size:16px;margin:16px 0 8px'>الخامات</h2><table><tr><th>الخامة</th><th>نوع القطعة</th><th>عدد الراقات</th><th>كمية القطع</th></tr>"+fabRows+"</table>");
  if(wsRows)pw.document.write("<h2 style='font-size:16px;margin:16px 0 8px'>الورش المستلمة</h2><table><tr><th>الورشة</th><th>صاحبها</th><th>نوع القطعة</th><th>الكمية</th><th>تم استلام</th><th>الرصيد</th></tr>"+wsRows+"</table>");
  if(order.instructions)pw.document.write("<h2 style='font-size:16px;margin:16px 0 8px'>تعليمات التشغيل</h2><div style='background:#F8FAFC;padding:14px;border-radius:8px;white-space:pre-wrap'>"+order.instructions+"</div>");
  pw.document.write("</body></html>");pw.document.close();
  setTimeout(()=>{pw.focus();pw.print()},500)
}

/* ── UI Components (Light Glassmorphism) ── */
const FS=15;
const TH={textAlign:"right",padding:"12px 14px",fontSize:FS-3,fontWeight:600,color:T.textSec,whiteSpace:"nowrap",borderBottom:"2px solid "+T.brd,background:T.inputBg||T.cardSolid,textTransform:"uppercase",letterSpacing:"0.04em"};
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
  return<input type={type||"text"} step={step||"any"} value={value==null?"":value} readOnly={readOnly} onChange={e=>onChange&&onChange(e.target.value)} placeholder={placeholder} style={{width:"100%",padding:"10px 14px",borderRadius:10,border:"1.5px solid "+T.brd,fontSize:FS,fontFamily:"inherit",background:readOnly?T.bg:T.cardSolid,color:T.text,boxSizing:"border-box",outline:"none",transition:"border-color 0.2s",...(sx||{})}}/>
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

function DelBtn({onConfirm,label,blocked}){
  const[confirm,setConfirm]=useState(false);const[showBlock,setShowBlock]=useState(false);
  if(showBlock)return<div style={{display:"inline-flex",gap:4,alignItems:"center",flexWrap:"wrap"}}><span style={{fontSize:FS-3,color:T.err,fontWeight:600,maxWidth:200}}>{"⚠️ "+blocked}</span><Btn ghost small onClick={()=>setShowBlock(false)}>حسناً</Btn></div>;
  if(confirm)return<div style={{display:"inline-flex",gap:4,alignItems:"center"}}><Btn danger small onClick={()=>{onConfirm();setConfirm(false)}}>تأكيد</Btn><Btn ghost small onClick={()=>setConfirm(false)}>الغاء</Btn></div>;
  return<Btn danger small onClick={()=>blocked?setShowBlock(true):setConfirm(true)}>{label||"حذف"}</Btn>
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
  const[email,setEmail]=useState("");const[pass,setPass]=useState("");const[name,setName]=useState("");
  const[err,setErr]=useState("");const[isReg,setIsReg]=useState(false);const[loading,setLoading]=useState(false);
  const handleLogin=async()=>{if(!email||!pass){setErr("ادخل الايميل وكلمة المرور");return}setLoading(true);setErr("");try{await signInWithEmailAndPassword(auth,email,pass)}catch(e){setErr(e.code==="auth/invalid-credential"?"بيانات الدخول غلط":"خطأ: "+e.message)}setLoading(false)};
  const handleReg=async()=>{if(!email||!pass||!name){setErr("اكمل كل البيانات");return}if(pass.length<6){setErr("كلمة المرور 6 حروف على الأقل");return}setLoading(true);setErr("");try{const cred=await createUserWithEmailAndPassword(auth,email,pass);await updateProfile(cred.user,{displayName:name})}catch(e){setErr(e.code==="auth/email-already-in-use"?"الايميل مستخدم":"خطأ: "+e.message)}setLoading(false)};
  const iS={width:"100%",padding:"14px 16px",borderRadius:14,border:"2px solid "+T.brd,fontSize:FS+1,fontFamily:"inherit",boxSizing:"border-box",background:T.cardSolid,color:T.text,outline:"none"};
  return<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#EFF6FF,#DBEAFE,#E0F2FE)",direction:"rtl",fontFamily:"'Cairo',sans-serif",padding:20}}>
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

const TABS=[{key:"dashboard",label:"لوحة التحكم",icon:"📊"},{key:"orders",label:"أوامر القص",icon:"✂️"},{key:"details",label:"تفاصيل الأوردر",icon:"📋"},{key:"external",label:"تشغيل خارجي",icon:"🏭"},{key:"report",label:"تقرير الإنتاج",icon:"📈"},{key:"cost",label:"التكاليف",icon:"💰"},{key:"search",label:"بحث",icon:"🔍"},{key:"db",label:"قاعدة البيانات",icon:"🗄️"},{key:"settings",label:"الاعدادات",icon:"⚙️"}];

/* ══ MAIN APP ══ */
export default function App(){
  const[user,setUser]=useState(null);const[authLoading,setAuthLoading]=useState(true);
  const[config,setConfig]=useState(INIT_CONFIG);const[orders,setOrders]=useState([]);const[dataLoading,setDataLoading]=useState(true);
  const[tab,setTab]=useState("dashboard");const[sel,setSel]=useState(null);const[sideOpen,setSideOpen]=useState(true);
  const[theme,setTheme]=useState(()=>localStorage.getItem("clark-theme")||"light");
  T=THEMES[theme]||THEMES.light;
  useEffect(()=>{localStorage.setItem("clark-theme",theme);document.body.style.background=T.bodyBg||T.bg},[theme]);
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

  return<div style={{display:"flex",minHeight:"100vh",direction:"rtl",fontFamily:"'Cairo',sans-serif",background:T.bg,color:T.text,fontSize:FS}}>
    {isMob&&sideOpen&&<div onClick={()=>setSideOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.3)",zIndex:998}}/>}
    <nav style={{width:isMob?(sideOpen?260:0):(sideOpen?230:56),background:T.sidebarBg||T.cardSolid,borderLeft:"1px solid "+T.brd,boxShadow:"4px 0 20px rgba(0,0,0,0.04)",flexShrink:0,display:"flex",flexDirection:"column",transition:"width 0.3s",overflow:"hidden",position:isMob?"fixed":"relative",right:0,top:0,bottom:0,zIndex:999}}>
      <div style={{padding:"20px 18px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid "+T.brd}}>
        {sideOpen&&<div><div style={{fontWeight:800,fontSize:22,color:T.accent,letterSpacing:4}}>CLARK</div><div style={{fontSize:9,color:T.textMut}}>CUTTING & PRODUCTION</div></div>}
        <div onClick={()=>setSideOpen(!sideOpen)} style={{cursor:"pointer",color:T.accent,fontSize:22}}>{"☰"}</div>
      </div>
      {sideOpen&&<div style={{padding:"8px 10px",flex:1,overflowY:"auto"}}>
        {TABS.filter(t=>t.key!=="settings"||userRole==="admin").map(t=><button key={t.key} onClick={()=>{setTab(t.key);if(isMob)setSideOpen(false)}} style={{display:"flex",alignItems:"center",gap:10,width:"100%",textAlign:"right",padding:"12px 16px",border:"none",cursor:"pointer",borderRadius:12,marginBottom:2,background:tab===t.key?T.accentBg:"transparent",color:tab===t.key?T.accent:T.textSec,fontSize:FS,fontWeight:tab===t.key?700:400,fontFamily:"inherit"}}><span style={{fontSize:18,width:24,textAlign:"center"}}>{t.icon}</span>{t.label}</button>)}
      </div>}
      {sideOpen&&<div style={{padding:"12px 18px",borderTop:"1px solid "+T.brd}}>
        <div style={{fontSize:14,fontWeight:700,color:T.accent,textAlign:"center"}}>{season}</div>
      </div>}
    </nav>
    <main style={{flex:1,overflow:"auto",minWidth:0,display:"flex",flexDirection:"column"}}>
      {/* User Bar */}
      <div style={{padding:isMob?"10px 14px":"12px 28px",background:T.cardSolid,borderBottom:"1px solid "+T.brd,display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {isMob&&!sideOpen&&<div onClick={()=>setSideOpen(true)} style={{cursor:"pointer",fontSize:22,color:T.accent}}>{"☰"}</div>}
          {config.logo&&<img src={config.logo} alt="" style={{width:32,height:32,borderRadius:8,objectFit:"cover"}}/>}
          <span style={{fontSize:FS+1,fontWeight:700,color:T.text}}>{"مرحباً، "+userName}</span>
          <span style={{fontSize:FS-1,color:T.textSec,padding:"3px 12px",background:T.accentBg,borderRadius:8}}>{season}</span>
        </div>
        <button onClick={()=>signOut(auth)} style={{padding:"8px 18px",borderRadius:10,background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30",cursor:"pointer",fontSize:FS,fontWeight:600}}>خروج</button>
      </div>
      <div style={{flex:1,padding:isMob?14:28,overflow:"auto"}}>
      {tab==="dashboard"&&<DashPg data={data} goD={goD} isMob={isMob} season={season} statusCards={statusCards}/>}
      {tab==="db"&&<DBPg data={data} upConfig={upConfig} isMob={isMob} canEdit={canEdit} statusCards={statusCards}/>}
      {tab==="orders"&&<OrdPg data={data} addOrder={addOrder} delOrder={delOrder} updOrder={updOrder} goD={goD} isMob={isMob} canEdit={canEdit} statusCards={statusCards}/>}
      {tab==="details"&&<DetPg data={data} updOrder={updOrder} replaceOrder={replaceOrder} sel={sel} setSel={setSel} isMob={isMob} canEdit={canEdit} statusCards={statusCards} setTab={setTab}/>}
      {tab==="external"&&<ExtProdPg data={data} updOrder={updOrder} isMob={isMob} canEdit={canEdit} statusCards={statusCards}/>}
      {tab==="search"&&<SearchPg data={data} goD={goD} isMob={isMob} season={season} statusCards={statusCards}/>}
      {tab==="report"&&<RepPg data={data} isMob={isMob} season={season} statusCards={statusCards}/>}
      {tab==="cost"&&<CostPg data={data} isMob={isMob} statusCards={statusCards}/>}
      {tab==="settings"&&<SettingsPg config={config} upConfig={upConfig} isMob={isMob} user={user} theme={theme} setTheme={setTheme}/>}
      </div>
    </main>
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
    <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:16,marginBottom:28}}>
      <MetricCard label="في التشغيل (عند الورش)" value={fmt(Math.max(0,inProdQty))} icon="⚙️" color="#8B5CF6" sub={"تم تسليمه: "+fmt(totalDeliveredToWs)+" - استلم: "+fmt(totalReceivedFromWs)}/>
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
      {/* Workshop Comparison Chart */}
      <Card title="أداء الورش - تم تسليمه vs تم استلامه">{wsChartData.length>0?<div>
        <ResponsiveContainer width="100%" height={Math.max(180,wsChartData.length*40)}>
          <BarChart data={wsChartData} layout="vertical" margin={{right:10}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0"/>
            <XAxis type="number" tick={{fontSize:11,fill:T.textSec}}/>
            <YAxis dataKey="name" type="category" tick={{fontSize:12,fill:T.text}} width={isMob?80:120}/>
            <Tooltip contentStyle={{borderRadius:10,border:"1px solid #E2E8F0"}}/>
            <Legend wrapperStyle={{fontSize:12}}/>
            <Bar dataKey="delivered" name="تم تسليمه للورشة" fill="#8B5CF6" barSize={14} radius={[0,4,4,0]}/>
            <Bar dataKey="received" name="استلم المصنع" fill="#10B981" barSize={14} radius={[0,4,4,0]}/>
          </BarChart>
        </ResponsiveContainer>
        {/* Top workshop badge */}
        {wsChartData.length>0&&<div style={{marginTop:12,padding:12,background:"#F0FDF4",borderRadius:10,border:"1px solid "+T.ok+"30",display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:20}}>🏆</span>
          <span style={{fontSize:FS,fontWeight:700,color:T.ok}}>{"أعلى ورشة تسليماً: "+wsChartData[0].name+" ("+wsChartData[0].received+" قطعة)"}</span>
        </div>}
      </div>:<p style={{color:T.textSec,textAlign:"center",padding:30}}>لا توجد بيانات ورش</p>}</Card>
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

  const eBtn=(onClick)=><Btn small onClick={onClick} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}}>تعديل</Btn>;
  const ords=data.orders||[];
  const fabBlock=(f)=>ords.some(o=>FKEYS.some(k=>Number(o["fabric"+k])===f.id))?"مستخدم في أوردرات":null;
  const accBlock=(a)=>ords.some(o=>(o.accItems||[]).some(x=>x.name===a.name))?"مستخدم في أوردرات":null;
  const sizeBlock=(s)=>ords.some(o=>Number(o.sizeSetId)===s.id)?"مستخدم في أوردرات":null;
  const garmentBlock=(g)=>ords.some(o=>(o.orderPieces||[]).includes(g.name))?"مستخدم في أوردرات":null;
  return<div>
    <h1 style={{fontSize:isMob?24:32,fontWeight:800,margin:"0 0 20px"}}>قاعدة البيانات</h1>
    <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>{[["fab","الأقمشة"],["acc","الاكسسوار"],["size","المقاسات"],["garment","قطع الموديل"],["ws","الورش"],["status","حالات الأوردر"]].map(([k,l])=><Btn key={k} on={sub===k} onClick={()=>setSub(k)}>{l}</Btn>)}</div>
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
  const[f,setF]=useState({name:"",owner:"",phone:"",address:"",idCard:"",ownerPhoto:"",rating:5});
  const startEdit=(ws)=>{setF({...ws});setEditId(ws.id);setShowForm(true)};
  const startNew=()=>{setF({name:"",owner:"",phone:"",address:"",idCard:"",ownerPhoto:"",rating:5});setEditId(null);setShowForm(true)};
  const handleIdCard=async e=>{const file=e.target.files[0];if(!file)return;const compressed=await compressImg43(file,300,0.5);setF(p=>({...p,idCard:compressed}))};
  const handleOwnerPhoto=async e=>{const file=e.target.files[0];if(!file)return;const compressed=await compressImage(file,200,0.5);setF(p=>({...p,ownerPhoto:compressed}))};
  const save=()=>{if(!f.name.trim())return;upConfig(d=>{if(!Array.isArray(d.workshops))d.workshops=[];if(editId){const idx=d.workshops.findIndex(w=>w.id===editId);if(idx>=0)d.workshops[idx]={...f,id:editId}}else{d.workshops.push({...f,id:Date.now()})}});setShowForm(false);setEditId(null)};
  const del=(id)=>upConfig(d=>{d.workshops=(d.workshops||[]).filter(w=>w.id!==id)});
  const wsBlock=(ws)=>{const used=(orders||[]).some(o=>(o.workshopDeliveries||[]).some(wd=>wd.wsName===ws.name));return used?"يوجد أوردرات مرتبطة بهذه الورشة":null};

  return<div>
    <Card title="ادارة الورش" extra={canEdit&&<Btn primary small onClick={startNew}>+ ورشة جديدة</Btn>}>
      {showForm&&<div style={{background:T.inputBg||T.cardSolid,borderRadius:14,padding:20,marginBottom:20,border:"1px solid "+T.brd}}>
        <div style={{fontSize:FS+1,fontWeight:700,color:T.accent,marginBottom:14}}>{editId?"تعديل الورشة":"ورشة جديدة"}</div>
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:12,marginBottom:14}}>
          <div><label style={{display:"block",fontSize:FS-2,color:T.textSec,marginBottom:4,fontWeight:600}}>اسم الورشة *</label><Inp value={f.name} onChange={v=>setF({...f,name:v})}/></div>
          <div><label style={{display:"block",fontSize:FS-2,color:T.textSec,marginBottom:4,fontWeight:600}}>اسم صاحب الورشة</label><Inp value={f.owner} onChange={v=>setF({...f,owner:v})}/></div>
          <div><label style={{display:"block",fontSize:FS-2,color:T.textSec,marginBottom:4,fontWeight:600}}>رقم التليفون</label><Inp value={f.phone} onChange={v=>setF({...f,phone:v})} type="tel"/></div>
          <div><label style={{display:"block",fontSize:FS-2,color:T.textSec,marginBottom:4,fontWeight:600}}>التقييم (من 10)</label><Inp value={f.rating} onChange={v=>setF({...f,rating:Math.min(10,Math.max(0,Number(v)||0))})} type="number"/></div>
        </div>
        <div style={{marginBottom:14}}><label style={{display:"block",fontSize:FS-2,color:T.textSec,marginBottom:4,fontWeight:600}}>العنوان بالتفصيل</label><textarea value={f.address||""} onChange={e=>setF({...f,address:e.target.value})} style={{width:"100%",height:60,padding:10,borderRadius:10,border:"1px solid "+T.brd,fontSize:FS,fontFamily:"inherit",background:T.cardSolid,color:T.text,boxSizing:"border-box",resize:"vertical"}}/></div>
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:14,marginBottom:14}}>
          <div>
            <label style={{display:"block",fontSize:FS-2,color:T.textSec,marginBottom:4,fontWeight:600}}>صورة بطاقة الورشة (4:3)</label>
            <div style={{width:"100%",height:120,borderRadius:12,border:"2px dashed "+T.brd,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",background:T.bg,cursor:"pointer",position:"relative"}}>
              {f.idCard?<img src={f.idCard} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<span style={{fontSize:FS-1,color:T.textMut}}>اضغط لرفع البطاقة</span>}
              <input type="file" accept="image/*" onChange={handleIdCard} style={{position:"absolute",inset:0,opacity:0,cursor:"pointer"}}/>
            </div>
          </div>
          <div>
            <label style={{display:"block",fontSize:FS-2,color:T.textSec,marginBottom:4,fontWeight:600}}>صورة صاحب الورشة (3:4)</label>
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
              <div style={{fontSize:FS+2,fontWeight:700,color:T.text,marginBottom:4}}>{ws.name}</div>
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
            <Btn small onClick={()=>startEdit(ws)} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}}>تعديل</Btn>
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
  const handleImg=async e=>{const f=e.target.files[0];if(!f)return;const compressed=await compressImage(f,300,0.5);setForm(p=>({...p,image:compressed}))};
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
    <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"auto 1fr",gap:16,marginBottom:20}}>
      <div><div style={{width:isMob?"100%":135,height:180,borderRadius:16,border:"2px dashed "+T.brd,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",background:T.inputBg||T.cardSolid,cursor:"pointer",position:"relative"}}>{form.image?<img src={form.image} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<span style={{fontSize:FS,color:T.textMut}}>صورة الموديل</span>}<input type="file" accept="image/*" onChange={handleImg} style={{position:"absolute",inset:0,opacity:0,cursor:"pointer"}}/></div></div>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:400}}><tbody>
        <tr><td style={TDL}>رقم الموديل *</td><td style={TD}><Inp value={form.modelNo} onChange={v=>updF("modelNo",v)}/></td><td style={TDL}>الوصف *</td><td style={TD}><Inp value={form.modelDesc} onChange={v=>updF("modelDesc",v)}/></td></tr>
        <tr><td style={TDL}>المقاسات *</td><td style={TD}><Sel value={form.sizeSetId} onChange={v=>updF("sizeSetId",v)}><option value="">-- اختر --</option>{data.sizeSets.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</Sel></td><td style={TDL}>التاريخ *</td><td style={TD}><Inp type="date" value={form.date} onChange={v=>updF("date",v)}/></td></tr>
        <tr><td style={TDL}>الحالة</td><td style={TD}><Sel value={form.status} onChange={v=>updF("status",v)}>{statuses.map(s=><option key={s} value={s}>{s}</option>)}</Sel></td><td style={TDL}> </td><td style={TD}> </td></tr>
      </tbody></table></div>
    </div>
    {/* Garment Pieces */}
    <div style={{marginBottom:16}}>
      <div style={{fontSize:FS,fontWeight:700,color:T.accent,marginBottom:10}}>{"قطع الموديل ("+((form.orderPieces||[]).length)+"/5)"}</div>
      <div style={{display:"flex",gap:10,marginBottom:10,flexWrap:"wrap",alignItems:"end"}}>
        <div style={{minWidth:180}}><Sel value="" onChange={v=>{if(!v||(form.orderPieces||[]).length>=5)return;updF("orderPieces",[...(form.orderPieces||[]),v])}}>
          <option value="">-- اضف قطعة --</option>
          {(data.garmentTypes||[]).filter(g=>!(form.orderPieces||[]).includes(g.name)).map(g=><option key={g.id} value={g.name}>{g.name}</option>)}
        </Sel></div>
      </div>
      {(form.orderPieces||[]).length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:8}}>{(form.orderPieces||[]).map((p,i)=><span key={i} style={{display:"inline-flex",alignItems:"center",gap:8,padding:"10px 16px",borderRadius:12,background:T.accentBg,border:"1px solid "+T.accent+"30",fontSize:FS,fontWeight:600,color:T.accent}}>{"👕 "+p}<span onClick={()=>updF("orderPieces",(form.orderPieces||[]).filter((_,j)=>j!==i))} style={{cursor:"pointer",color:T.err,fontWeight:800}}>x</span></span>)}</div>}
      {(form.orderPieces||[]).length===0&&<div style={{fontSize:FS-1,color:T.textMut}}>لم يتم اختيار قطع - كل قطعة تأخذ كمية القص</div>}
    </div>
    {FKEYS.map((k,idx)=>{const fid=form["fabric"+k];const fb=fabObj(fid);const fabPieces=form["fabricPieces"+k]||[];return<div key={k}>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",marginBottom:6,minWidth:500}}><tbody><tr>
        <td style={{...TDL,fontWeight:700}}><span style={{display:"inline-block",width:12,height:12,borderRadius:4,background:FCOL[idx],marginLeft:6}}/>{"خامة "+k+(k==="A"?" *":"")}</td>
        <td style={TD}><Sel value={fid} onChange={v=>updF("fabric"+k,v)}><option value="">{k==="A"?"-- اختر (اجباري) --":"-- اختياري --"}</option>{data.fabrics.map(f=><option key={f.id} value={f.id}>{f.name+" - "+f.price+" ج.م/"+f.unit}</option>)}</Sel></td>
        <td style={{...TDL,width:80}}>استهلاك/راق</td><td style={{...TD,width:100}}><Inp type="number" step="any" value={form["cons"+k]} onChange={v=>updF("cons"+k,v)}/></td>
        <td style={{...TDL,width:80}}>تاريخ القص</td><td style={{...TD,width:130}}><Inp type="date" value={form["cutDate"+k]||""} onChange={v=>updF("cutDate"+k,v)}/></td>
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
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}><h1 style={{fontSize:isMob?24:32,fontWeight:800,margin:0}}>أوامر القص</h1>{canEdit&&<Btn primary onClick={()=>setShow(!show)}>{show?"الغاء":"+ أمر قص جديد"}</Btn>}</div>
    {show&&<OrdForm data={data} initial={mkOrder()} onSave={o=>{addOrder(o);setShow(false)}} onCancel={()=>setShow(false)} isMob={isMob} statusCards={statusCards}/>}
    <Card title={"جميع الأوامر ("+data.orders.length+")"}><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:700}}>
      <thead><tr>{["#","التاريخ","موديل","الوصف","الكمية","الحالة",""].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
      <tbody>{sortOrders(data.orders).map((o,i)=>{const t=calcOrder(o);const hasWsDel=(o.workshopDeliveries||[]).length>0;const hasStockDel=(o.deliveries||[]).length>0;const delBlock=hasStockDel?"يوجد تسليمات مخزن مرتبطة":hasWsDel?"يوجد تسليمات ورش مرتبطة":null;return<tr key={o.id}><td style={TD}>{i+1}</td><td style={TD}>{o.date}</td><td style={TDB}>{o.modelNo}</td><td style={TD}>{o.modelDesc}</td><td style={{...TDB,color:T.accent}}>{t.cutQty}</td><td style={TD}><Badge t={o.status} cards={statusCards}/></td><td style={{...TD,whiteSpace:"nowrap"}}><Btn ghost small onClick={()=>goD(o.id)}>تفاصيل</Btn>{canEdit&&<>{" "}<DelBtn onConfirm={()=>delOrder(o.id)} blocked={delBlock}/></>}</td></tr>})}
        {data.orders.length===0&&<tr><td colSpan={7} style={{...TD,textAlign:"center",color:T.textSec,padding:40}}>لا توجد أوامر</td></tr>}
      </tbody>
    </table></div></Card>
  </div>
}

/* ══ DETAILS ══ */
function DetPg({data,updOrder,replaceOrder,sel,setSel,isMob,canEdit,statusCards,setTab}){
  const order=data.orders.find(o=>o.id===sel);const[editing,setEditing]=useState(false);
  const[detQ,setDetQ]=useState("");const[detSt,setDetSt]=useState("الكل");
  const statuses=(statusCards||DEFAULT_STATUSES).map(s=>s.name);

  if(!order){
    const filtered=data.orders.filter(o=>{
      if(detSt!=="الكل"&&o.status!==detSt)return false;
      if(detQ.trim()){const s=detQ.trim().toLowerCase();const h=[o.modelNo,o.modelDesc,o.sizeLabel,o.status].filter(Boolean).join(" ").toLowerCase();if(!h.includes(s))return false}
      return true
    });
    return<div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
        <h1 style={{fontSize:isMob?24:32,fontWeight:800,margin:0}}>تفاصيل الأوردر</h1>
        {setTab&&<Btn ghost onClick={()=>setTab("orders")}>← عودة</Btn>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"2fr 1fr",gap:10,marginBottom:16}}>
        <Inp value={detQ} onChange={setDetQ} placeholder="بحث بالرقم أو الوصف أو المقاسات..."/>
        <Sel value={detSt} onChange={setDetSt}><option value="الكل">كل الحالات</option>{statuses.map(s=><option key={s} value={s}>{s}</option>)}</Sel>
      </div>
      {filtered.length===0&&<Card><p style={{color:T.textSec,textAlign:"center",padding:30}}>لا توجد نتائج</p></Card>}
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {sortOrders(filtered).map(o=>{const t=calcOrder(o);
          const wds=o.workshopDeliveries||[];
          return<div key={o.id} onClick={()=>setSel(o.id)} style={{display:"flex",gap:16,padding:16,background:T.cardSolid,borderRadius:16,border:"1px solid "+T.brd,boxShadow:T.shadow,cursor:"pointer",alignItems:"flex-start"}}>
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
                        {wd.garmentType?<b style={{color:T.purple}}>{wd.garmentType+": "}</b>:""}<span style={{color:T.accent}}>{"تسليم "+wd.qty}</span>{" | "}<span style={{color:T.ok}}>{"استلم "+rcvd}</span>{bal>0&&<span style={{color:T.err}}>{" | رصيد "+bal}</span>}{bal===0&&<span style={{color:T.ok}}>{" ✓"}</span>}
                      </span>})}
                  </div>
                </div>)})()}
            </div>}
          </div>
        </div>})}
      </div>
    </div>
  }
  if(editing)return<OrdForm data={data} initial={order} onSave={o=>{replaceOrder(sel,o);setEditing(false)}} onCancel={()=>setEditing(false)} isMob={isMob} statusCards={statusCards}/>;

  const t=calcOrder(order);const accItems=order.accItems||[];const accAll=t.accPer*t.cutQty;
  const activeFabs=FKEYS.filter(k=>order["fabric"+k]);

  return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
      <h1 style={{fontSize:isMob?20:28,fontWeight:800,margin:0}}>{"أمر تشغيل - "}<span style={{color:T.accent}}>{order.modelNo}</span></h1>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><Btn onClick={()=>printOrderSheet(order,t,activeFabs,statusCards)} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}}>طباعة الأوردر</Btn>{canEdit&&<Btn primary onClick={()=>setEditing(true)}>تعديل</Btn>}<Btn ghost onClick={()=>setSel(null)}>← عودة</Btn></div>
    </div>
    <div id="parea">
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"repeat(5,1fr)",gap:12,marginBottom:20}}>
        <MetricCard label="رقم الموديل" value={order.modelNo} icon="🏷"/><MetricCard label="كمية القص" value={t.cutQty} icon="✂️" color={T.accent}/><MetricCard label="تم التسليم" value={order.deliveredQty||0} icon="📦" color={T.ok}/><MetricCard label="الرصيد" value={t.balance} icon="📊" color={t.balance>0?T.warn:T.ok}/><MetricCard label="تكلفة القطعة" value={t.costPer+" ج.م"} icon="💰" color={T.accent}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:order.image&&!isMob?"auto 1fr":"1fr",gap:16,marginBottom:16}}>
        {order.image&&<div><img src={order.image} alt="" style={{width:isMob?"100%":135,height:180,aspectRatio:"3/4",objectFit:"cover",borderRadius:16,border:"1px solid "+T.brd,boxShadow:T.shadow}}/></div>}
        <Card title="بيانات الموديل"><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:400}}><tbody>
          <tr><td style={TDL}>الوصف</td><td style={TDB}>{order.modelDesc}</td><td style={TDL}>المقاسات</td><td style={TD}>{order.sizeLabel}</td></tr>
          <tr><td style={TDL}>الحالة</td><td style={TD}>{canEdit?<Sel value={order.status} onChange={v=>updOrder(sel,o=>{o.status=v})}>{statuses.map(s=><option key={s} value={s}>{s}</option>)}</Sel>:<Badge t={order.status} cards={statusCards}/>}</td><td style={TDL}>التاريخ</td><td style={TD}>{order.date}</td></tr>
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
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:600}}>
          <thead><tr>{["الخامة","السعر","استهلاك/راق","الراقات","القطع","التكلفة","تكلفة القطعة"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
          <tbody>
            {activeFabs.map(k=>{const cons=gcons(order,k),price=gf(order,k,"Price")||0,layers=slay(gc(order,k)),qty=sqty(gc(order,k)),cost=cons*price*layers,perPc=t.cutQty?r2(cost/t.cutQty):0;return<tr key={k}><td style={TD}><span style={{display:"inline-block",width:10,height:10,borderRadius:3,background:FCOL[FKEYS.indexOf(k)],marginLeft:8}}/>{gf(order,k,"Label")}</td><td style={TD}>{price+" ج.م"}</td><td style={TD}>{cons}</td><td style={TDB}>{layers}</td><td style={TDB}>{qty}</td><td style={{...TDB,color:T.accent}}>{fmt(r2(cost))+" ج.م"}</td><td style={{...TDB,color:T.accent}}>{perPc+" ج.م"}</td></tr>})}
            <tr style={{background:T.inputBg||T.cardSolid}}><td colSpan={5} style={{...TD,fontWeight:700}}>اجمالي تكلفة الخامات</td><td style={{...TD,fontWeight:700,color:T.accent}}>{fmt(r2(t.totalFab))+" ج.م"}</td><td style={{...TD,fontWeight:800,color:T.accent,fontSize:FS+2}}>{t.fabPer+" ج.م"}</td></tr>
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
          return<Card title="تسليم مخزن جاهز" extra={canEdit&&canStock&&<Btn primary small onClick={()=>updOrder(sel,o=>{if(!o.deliveries)o.deliveries=[];o.deliveries.push({date:new Date().toISOString().split("T")[0],qty:0,notes:""})})}>+ تسليم</Btn>}>
            {!canStock&&<div style={{padding:14,background:T.err+"10",border:"1px solid "+T.err+"30",borderRadius:10,marginBottom:14,fontSize:FS,color:T.err,fontWeight:600}}>{blockMsg}</div>}
            <div style={{display:"flex",gap:14,marginBottom:14,flexWrap:"wrap"}}>
              <span style={{padding:"8px 16px",borderRadius:10,background:T.err+"12",color:T.err,fontWeight:700,fontSize:FS}}>{"كمية القص: "+t.cutQty}</span>
              <span style={{padding:"8px 16px",borderRadius:10,background:T.ok+"12",color:T.ok,fontWeight:700,fontSize:FS}}>{"تم تسليمه: "+stockDel}</span>
              <span style={{padding:"8px 16px",borderRadius:10,background:stockRemain>0?T.warn+"12":T.ok+"12",color:stockRemain>0?T.warn:T.ok,fontWeight:700,fontSize:FS}}>{"المتبقي: "+stockRemain}</span>
            </div>
            <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:350}}><thead><tr>{["#","التاريخ","الكمية","ملاحظات",...(canEdit?[""]:[])] .map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
            {(order.deliveries||[]).map((d,i)=><tr key={i}><td style={TD}>{i+1}</td><td style={TD}>{canEdit?<Inp type="date" value={d.date} onChange={v=>updOrder(sel,o=>{o.deliveries[i].date=v})}/>:d.date}</td><td style={TD}>{canEdit?<Inp type="number" value={d.qty} onChange={v=>updOrder(sel,o=>{const maxQ=t.cutQty-o.deliveries.filter((_,j)=>j!==i).reduce((s,x)=>s+(Number(x.qty)||0),0);o.deliveries[i].qty=Math.min(Number(v)||0,maxQ);o.deliveredQty=o.deliveries.reduce((s,x)=>s+(Number(x.qty)||0),0);const cut=t.cutQty;if(o.deliveredQty>=cut)o.status="تم الشحن";else if(o.deliveredQty>0)o.status="شحن جزئي"})} style={{width:80}}/>:d.qty}</td><td style={TD}>{canEdit?<Inp value={d.notes} onChange={v=>updOrder(sel,o=>{o.deliveries[i].notes=v})}/>:d.notes}</td>{canEdit&&<td style={TD}><Btn danger small onClick={()=>updOrder(sel,o=>{o.deliveries.splice(i,1);o.deliveredQty=o.deliveries.reduce((s,x)=>s+(Number(x.qty)||0),0);if(o.deliveredQty>=t.cutQty)o.status="تم الشحن";else if(o.deliveredQty>0)o.status="شحن جزئي"})}>حذف</Btn></td>}</tr>)}
            {(!order.deliveries||order.deliveries.length===0)&&<tr><td colSpan={canEdit?5:4} style={{...TD,textAlign:"center",color:T.textSec}}>لا توجد تسليمات</td></tr>}
          </tbody></table></div>
          </Card>})()}
      </div>
      {/* Workshop Deliveries Info (read-only from تشغيل خارجي page) */}
      {(order.workshopDeliveries||[]).length>0&&<Card title="التشغيل الخارجي - الورش المستلمة" style={{marginBottom:16}}>
        {(order.workshopDeliveries||[]).map((wd,i)=>{
          const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);
          const bal=(Number(wd.qty)||0)-rcvd;
          return<div key={i} style={{border:"1px solid "+T.brd,borderRadius:12,marginBottom:12,overflow:"hidden"}}>
            <div style={{padding:"12px 16px",background:bal>0?T.err+"06":"#F0FDF4",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontWeight:700,fontSize:FS+1}}>{wd.wsName}</span>
                {wd.wsOwner&&<span style={{fontSize:FS-1,color:T.textSec}}>{wd.wsOwner}</span>}
                {wd.garmentType&&<span style={{fontSize:FS-2,color:T.purple,background:T.purple+"12",padding:"2px 10px",borderRadius:12}}>{wd.garmentType}</span>}
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <span style={{padding:"4px 12px",borderRadius:8,background:T.accent+"12",fontSize:FS-2,fontWeight:600}}>{"تم تسليمه: "+wd.qty+" - "+wd.date}</span>
                {wd.price>0&&<span style={{padding:"4px 12px",borderRadius:8,background:T.purple+"12",fontSize:FS-2,fontWeight:600,color:T.purple}}>{"تشغيل: "+wd.price+" ج.م"}</span>}
                <span style={{padding:"4px 12px",borderRadius:8,background:T.ok+"12",fontSize:FS-2,fontWeight:600,color:T.ok}}>{"استلم: "+rcvd}</span>
                <span style={{padding:"4px 12px",borderRadius:8,background:bal>0?T.err+"15":T.ok+"15",fontSize:FS-2,fontWeight:700,color:bal>0?T.err:T.ok}}>{"رصيد: "+bal}</span>
              </div>
            </div>
            {(wd.receives||[]).length>0&&<div style={{padding:"8px 16px 12px"}}><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr>{["#","تاريخ الاستلام","الكمية","ملاحظات"].map(h=><th key={h} style={{...TH,fontSize:FS-3}}>{h}</th>)}</tr></thead>
              <tbody>{wd.receives.map((r,ri)=><tr key={ri}><td style={TD}>{ri+1}</td><td style={TD}>{r.date}</td><td style={{...TDB,color:T.ok}}>{r.qty}</td><td style={TD}>{r.notes||"-"}</td></tr>)}</tbody>
            </table></div></div>}
            {wd.notes&&<div style={{padding:"0 16px 10px",fontSize:FS-2,color:T.textSec}}>{"ملاحظات: "+wd.notes}</div>}
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
function ExtProdPg({data,updOrder,isMob,canEdit,statusCards}){
  const[mode,setMode]=useState(null);
  const[selWs,setSelWs]=useState("");
  const[selOrder,setSelOrder]=useState("");
  const[delQty,setDelQty]=useState(0);
  const[delType,setDelType]=useState("");
  const[delNote,setDelNote]=useState("");
  const[delPrice,setDelPrice]=useState(0);
  const[rcvInputs,setRcvInputs]=useState({});
  const getRcv=(key)=>rcvInputs[key]||{qty:0,note:""};
  const setRcv=(key,field,val)=>setRcvInputs(p=>({...p,[key]:{...getRcv(key),[field]:val}}));
  const clearRcv=(key)=>setRcvInputs(p=>{const n={...p};delete n[key];return n});
  const[movQ,setMovQ]=useState("");
  const[movWsF,setMovWsF]=useState("الكل");
  const[editMov,setEditMov]=useState(null);
  const[editQty,setEditQty]=useState(0);
  const[editNote,setEditNote]=useState("");
  const[editPrice,setEditPrice]=useState(0);
  const[editDate,setEditDate]=useState("");
  const workshops=data.workshops||[];

  const startEditMov=(m)=>{setEditMov(m);setEditQty(m.qty);setEditNote(m.notes||"");setEditPrice(m.price||0);setEditDate(m.date||"")};
  const saveEditMov=()=>{if(!editMov)return;
    if(editMov.type==="deliver"){updOrder(editMov.orderId,o=>{const wd=o.workshopDeliveries[editMov.wdIdx];if(wd){wd.qty=Number(editQty)||0;wd.notes=editNote;wd.price=Number(editPrice)||0;if(editDate)wd.date=editDate}})}
    else{updOrder(editMov.orderId,o=>{const r=o.workshopDeliveries[editMov.wdIdx].receives[editMov.rIdx];if(r){r.qty=Number(editQty)||0;r.notes=editNote;if(editDate)r.date=editDate}})}
    setEditMov(null)};
  const printMov=(m)=>{
    if(m.type==="deliver")printReceipt(m.wsName,"",m.orderNo,m.qty,m.date,0);
    else printReceiveReceipt(m.wsName,m.orderNo,m.qty,m.date,0)
  };

  const wsObj=workshops.find(w=>(w.name||w)===(selWs));
  const prodOrders=data.orders.filter(o=>o.status==="تم القص"||o.status==="في التشغيل");
  const wsOrders=selWs?data.orders.filter(o=>(o.workshopDeliveries||[]).some(wd=>wd.wsName===selWs)):[];

  const deliverToWs=(andPrint)=>{
    if(!selWs||!selOrder||!delQty)return;
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
      if(o.status==="تم القص")o.status="في التشغيل";
    });
    setSelOrder("");setDelQty(0);setDelType("");setDelNote("");setDelPrice(0);
    if(andPrint)setTimeout(()=>printReceipt(selWs,wsObj?wsObj.owner:"",saveModelNo,saveQty,saveDate,Math.max(0,availAfter)),400);
  };

  const receiveFromWs=(orderId,wdIdx,andPrint,printData,cardKey)=>{
    const rv=getRcv(cardKey);
    if(!rv.qty)return;
    const ord=data.orders.find(o=>o.id===orderId);if(!ord)return;
    const wd=(ord.workshopDeliveries||[])[wdIdx];if(!wd)return;
    const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);
    const maxRcv=(Number(wd.qty)||0)-rcvd;
    const saveQty=Math.min(Number(rv.qty),maxRcv);if(saveQty<=0)return;
    const saveNote=rv.note;const saveDate=new Date().toISOString().split("T")[0];
    updOrder(orderId,o=>{
      if(!o.workshopDeliveries[wdIdx].receives)o.workshopDeliveries[wdIdx].receives=[];
      o.workshopDeliveries[wdIdx].receives.push({date:saveDate,qty:saveQty,notes:saveNote})
    });
    clearRcv(cardKey);
    if(andPrint&&printData)setTimeout(()=>printReceiveReceipt(selWs,printData.modelNo,saveQty,saveDate,maxRcv-saveQty),400);
  };

  /* Collect all movements for the log */
  const movements=[];
  data.orders.forEach(ord=>{(ord.workshopDeliveries||[]).forEach((wd,wdIdx)=>{
    movements.push({type:"deliver",date:wd.date,wsName:wd.wsName,orderNo:ord.modelNo,orderDesc:ord.modelDesc,qty:wd.qty,garmentType:wd.garmentType||"",price:wd.price||0,notes:wd.notes||"",orderId:ord.id,wdIdx});
    (wd.receives||[]).forEach((r,rIdx)=>{movements.push({type:"receive",date:r.date,wsName:wd.wsName,orderNo:ord.modelNo,orderDesc:ord.modelDesc,qty:r.qty,garmentType:wd.garmentType||"",notes:r.notes||"",orderId:ord.id,wdIdx,rIdx})})
  })});
  movements.sort((a,b)=>b.date.localeCompare(a.date));

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
    if(m.type==="deliver"){updOrder(m.orderId,o=>{o.workshopDeliveries.splice(m.wdIdx,1);if(o.workshopDeliveries.length===0&&o.status==="في التشغيل")o.status="تم القص"})}
    else{updOrder(m.orderId,o=>{o.workshopDeliveries[m.wdIdx].receives.splice(m.rIdx,1)})}
  };

  if(!mode)return<div>
    <h1 style={{fontSize:isMob?24:32,fontWeight:800,margin:"0 0 24px"}}>التشغيل الخارجي</h1>
    <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:20,marginBottom:24}}>
      <div onClick={()=>setMode("deliver")} style={{background:T.card,backdropFilter:"blur(12px)",borderRadius:20,padding:40,border:"1px solid "+T.brd,boxShadow:T.shadow,cursor:"pointer",textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:16}}>📤</div>
        <div style={{fontSize:FS+4,fontWeight:800,color:T.accent,marginBottom:8}}>تسليم ورشة</div>
        <div style={{fontSize:FS,color:T.textSec}}>تسليم أوردرات للورش الخارجية</div>
      </div>
      <div onClick={()=>setMode("receive")} style={{background:T.card,backdropFilter:"blur(12px)",borderRadius:20,padding:40,border:"1px solid "+T.brd,boxShadow:T.shadow,cursor:"pointer",textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:16}}>📥</div>
        <div style={{fontSize:FS+4,fontWeight:800,color:T.ok,marginBottom:8}}>استلام من ورشة</div>
        <div style={{fontSize:FS,color:T.textSec}}>استلام أوردرات من الورش الخارجية</div>
      </div>
    </div>
    {/* Movement Log with search/filter */}
    <Card title={"سجل الحركات ("+movements.length+")"}>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"2fr 1fr auto",gap:10,marginBottom:14}}>
        <Inp value={movQ} onChange={setMovQ} placeholder="بحث بالموديل أو الورشة..."/>
        <Sel value={movWsF} onChange={setMovWsF}><option value="الكل">كل الورش</option>{workshops.map(w=><option key={w.id||w} value={w.name||w}>{w.name||w}</option>)}</Sel>
        <Btn onClick={()=>{const el=document.getElementById("mov-log");if(!el)return;const pw=window.open("","_blank");if(!pw)return;pw.document.write("<!DOCTYPE html><html dir='rtl'><head><meta charset='utf-8'/><link href='https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;800&display=swap' rel='stylesheet'/><title>سجل الحركات</title><style>body{font-family:'Cairo',Arial;padding:20px;font-size:12px;direction:rtl}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:right}th{background:#f5f5f5;font-weight:700}.del{color:#10B981}.rcv{color:#0EA5E9}@media print{body{padding:10px}}</style></head><body><h2>سجل حركات التشغيل الخارجي</h2>"+el.innerHTML+"</body></html>");pw.document.close();setTimeout(()=>{pw.focus();pw.print()},500)}} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>طباعة التقرير</Btn>
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
            <Btn small onClick={()=>printMov(m)} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}}>طباعة</Btn>
            <Btn small onClick={()=>startEditMov(m)} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}}>تعديل</Btn>
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
  const wsMoves=[];
  if(selWs)data.orders.forEach(ord=>{(ord.workshopDeliveries||[]).forEach((wd,wdIdx)=>{if(wd.wsName===selWs){wsMoves.push({type:"deliver",date:wd.date,orderNo:ord.modelNo,orderDesc:ord.modelDesc,qty:wd.qty,garmentType:wd.garmentType||"",price:wd.price||0,notes:wd.notes||""});(wd.receives||[]).forEach(r=>{wsMoves.push({type:"receive",date:r.date,orderNo:ord.modelNo,orderDesc:ord.modelDesc,qty:r.qty,garmentType:wd.garmentType||"",notes:r.notes||""})})}})});
  wsMoves.sort((a,b)=>b.date.localeCompare(a.date));

  if(mode==="deliver")return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
      <h1 style={{fontSize:isMob?22:28,fontWeight:800,margin:0}}>{"📤 تسليم ورشة"}</h1>
      <Btn ghost onClick={()=>{setMode(null);setSelWs("");setSelOrder("")}}>← عودة</Btn>
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
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"2fr 1fr",gap:10,marginBottom:10}}>
          <div><label style={{display:"block",fontSize:FS-2,color:T.textSec,marginBottom:4}}>اختر الأوردر</label>
            <Sel value={selOrder} onChange={v=>{setSelOrder(v);setDelType("");const o=data.orders.find(x=>x.id===v);if(o){const pieces=o.orderPieces||[];if(pieces.length===0)setDelQty(getAvailQty(o))}}}>
              <option value="">-- اختر أوردر --</option>
              {availOrders.map(o=>{const t=calcOrder(o);const pieces=o.orderPieces||[];
                const pInfo=pieces.length>0?pieces.map(p=>{const d=(o.workshopDeliveries||[]).filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0);const a=t.cutQty-d;return a>0?p+":"+a:null}).filter(Boolean).join(" | "):"متاح: "+getAvailQty(o);
                return<option key={o.id} value={o.id}>{o.modelNo+" - "+o.modelDesc+" ["+pInfo+"]"}</option>})}
            </Sel>
          </div>
          <div><label style={{display:"block",fontSize:FS-2,color:T.textSec,marginBottom:4}}>الكمية</label><Inp type="number" value={delQty} onChange={v=>{const ord=data.orders.find(x=>x.id===selOrder);const max=ord?getAvailQty(ord):99999;setDelQty(Math.min(Number(v)||0,max))}}/></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr 1fr",gap:10,marginBottom:10}}>
          <div><label style={{display:"block",fontSize:FS-2,color:T.textSec,marginBottom:4}}>نوع القطعة</label>{(()=>{
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
          <div><label style={{display:"block",fontSize:FS-2,color:T.textSec,marginBottom:4}}>سعر التشغيل</label><Inp type="number" value={delPrice} onChange={v=>setDelPrice(Number(v)||0)} placeholder="سعر القطعة"/></div>
          <div><label style={{display:"block",fontSize:FS-2,color:T.textSec,marginBottom:4}}>ملاحظات</label><Inp value={delNote} onChange={setDelNote} placeholder="ملاحظات..."/></div>
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
        <thead><tr>{["","التاريخ","موديل","الوصف","نوع القطعة","الكمية","سعر التشغيل","ملاحظات",""].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
        <tbody>{wsMoves.map((m,i)=><tr key={i} style={{background:m.type==="deliver"?"#F0FDF4":"#EFF6FF"}}>
          <td style={{...TD,textAlign:"center",fontSize:18}}>{m.type==="deliver"?<span style={{color:T.ok}}>{"↗"}</span>:<span style={{color:T.accent}}>{"↙"}</span>}</td>
          <td style={TD}>{m.date}</td><td style={TDB}>{m.orderNo}</td><td style={TD}>{m.orderDesc}</td>
          <td style={TD}>{m.garmentType||"-"}</td>
          <td style={{...TDB,color:m.type==="deliver"?T.ok:T.accent}}>{m.qty}</td>
          <td style={TD}>{m.price?m.price+" ج.م":"-"}</td>
          <td style={TD}>{m.notes||"-"}</td>
          <td style={TD}><Btn small onClick={()=>printMov(m)} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}}>طباعة</Btn></td>
        </tr>)}</tbody>
      </table></div>
    </Card>}
  </div>;

  /* ── RECEIVE MODE ── */
  return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
      <h1 style={{fontSize:isMob?22:28,fontWeight:800,margin:0}}>{"📥 استلام من ورشة"}</h1>
      <Btn ghost onClick={()=>{setMode(null);setSelWs("")}}>← عودة</Btn>
    </div>
    <Card title="اختر الورشة" style={{marginBottom:16}}>
      <Sel value={selWs} onChange={v=>setSelWs(v)}>
        <option value="">-- اختر ورشة --</option>
        {workshops.map(w=><option key={w.id||w} value={w.name||w}>{(w.name||w)+(w.owner?" - "+w.owner:"")}</option>)}
      </Sel>
    </Card>
    {selWs&&<Card title={"أوردرات تم تسليمها لـ "+selWs} style={{marginBottom:16}}>
      {wsOrders.length>0?<div style={{display:"flex",flexDirection:"column",gap:16}}>
        {wsOrders.map(ord=>{
          const wds=(ord.workshopDeliveries||[]).filter(wd=>wd.wsName===selWs);
          return wds.map((wd,wdIdx)=>{
            const actualIdx=(ord.workshopDeliveries||[]).indexOf(wd);
            const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);
            const bal=(Number(wd.qty)||0)-rcvd;
            return<div key={ord.id+"-"+wdIdx} style={{background:T.cardSolid,borderRadius:14,border:"1px solid "+(bal>0?T.err+"40":T.ok+"40"),overflow:"hidden"}}>
              <div style={{padding:"14px 18px",background:bal>0?T.err+"08":T.ok+"08",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                <div><span style={{fontWeight:700,fontSize:FS+1}}>{ord.modelNo}</span><span style={{fontSize:FS-1,color:T.textSec,marginRight:10}}>{" - "+ord.modelDesc}</span>{wd.garmentType&&<span style={{fontSize:FS,fontWeight:700,color:T.purple,background:T.purple+"15",padding:"4px 14px",borderRadius:10,marginRight:6}}>{"👕 "+wd.garmentType}</span>}</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  <span style={{padding:"4px 12px",borderRadius:8,background:T.accent+"15",fontSize:FS-1,fontWeight:600}}>{"تم تسليمه: "+wd.qty}</span>
                  <span style={{padding:"4px 12px",borderRadius:8,background:T.ok+"15",fontSize:FS-1,fontWeight:600,color:T.ok}}>{"استلم: "+rcvd}</span>
                  <span style={{padding:"4px 12px",borderRadius:8,background:bal>0?T.err+"15":T.ok+"15",fontSize:FS-1,fontWeight:700,color:bal>0?T.err:T.ok}}>{"رصيد: "+bal}</span>
                  {wd.price>0&&<span style={{padding:"4px 12px",borderRadius:8,background:T.purple+"15",fontSize:FS-1,fontWeight:600,color:T.purple}}>{"تشغيل: "+wd.price+" ج.م"}</span>}
                </div>
              </div>
              <div style={{padding:16}}>
                <div style={{fontSize:FS-2,color:T.textSec,marginBottom:8}}>{"تاريخ التسليم: "+wd.date}</div>
                {(wd.receives||[]).length>0&&<div style={{marginBottom:12}}><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:350}}><thead><tr>{["#","التاريخ","الكمية","ملاحظات",""].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
                  {wd.receives.map((r,ri)=>{const rBal=bal+Number(r.qty);return<tr key={ri}><td style={TD}>{ri+1}</td><td style={TD}>{r.date}</td><td style={TDB}>{r.qty}</td><td style={TD}>{r.notes||"-"}</td><td style={TD}><Btn small onClick={()=>printReceiveReceipt(selWs,ord.modelNo,r.qty,r.date,rBal)} style={{background:T.ok+"15",color:T.ok,border:"1px solid "+T.ok+"30"}}>طباعة</Btn></td></tr>})}
                </tbody></table></div></div>}
                {canEdit&&bal>0&&(()=>{const ck=ord.id+"-"+actualIdx;const rv=getRcv(ck);return<div style={{display:"flex",gap:8,flexWrap:"wrap",padding:12,background:T.inputBg||T.cardSolid,borderRadius:10,alignItems:"end"}}>
                  <div style={{flex:1,minWidth:80}}><Inp type="number" value={rv.qty} onChange={v=>setRcv(ck,"qty",Math.min(Number(v)||0,bal))} placeholder="الكمية"/></div>
                  <div style={{flex:1,minWidth:100}}><Inp value={rv.note} onChange={v=>setRcv(ck,"note",v)} placeholder="ملاحظات"/></div>
                  <Btn onClick={()=>receiveFromWs(ord.id,actualIdx,false,null,ck)} style={{background:T.ok+"15",color:T.ok,border:"1px solid "+T.ok+"30"}}>حفظ الاستلام</Btn>
                  <Btn onClick={()=>receiveFromWs(ord.id,actualIdx,true,{modelNo:ord.modelNo,bal},ck)} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}}>حفظ + طباعة</Btn>
                </div>})()}
                {bal===0&&<div style={{textAlign:"center",padding:10,color:T.ok,fontWeight:700,fontSize:FS}}>{"✓ تم استلام الكمية كاملة"}</div>}
              </div>
            </div>
          })
        })}
      </div>:<p style={{color:T.textSec,textAlign:"center",padding:30}}>لا توجد أوردرات تم تسليمها لهذه الورشة</p>}
    </Card>}
    {/* Workshop-specific movements */}
    {selWs&&wsMoves.length>0&&<Card title={"حركات ورشة "+selWs+" ("+wsMoves.length+")"}>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:550}}>
        <thead><tr>{["","التاريخ","موديل","الوصف","نوع القطعة","الكمية","ملاحظات",""].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
        <tbody>{wsMoves.map((m,i)=><tr key={i} style={{background:m.type==="deliver"?"#F0FDF4":"#EFF6FF"}}>
          <td style={{...TD,textAlign:"center",fontSize:18}}>{m.type==="deliver"?<span style={{color:T.ok}}>{"↗"}</span>:<span style={{color:T.accent}}>{"↙"}</span>}</td>
          <td style={TD}>{m.date}</td><td style={TDB}>{m.orderNo}</td><td style={TD}>{m.orderDesc}</td>
          <td style={TD}>{m.garmentType||"-"}</td>
          <td style={{...TDB,color:m.type==="deliver"?T.ok:T.accent}}>{m.qty}</td>
          <td style={TD}>{m.notes||"-"}</td>
          <td style={TD}><Btn small onClick={()=>printMov(m)} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}}>طباعة</Btn></td>
        </tr>)}</tbody>
      </table></div>
    </Card>}
  </div>
}

/* ══ SEARCH ══ */
function SearchPg({data,goD,isMob,season,statusCards}){
  const[q,setQ]=useState("");const[stF,setStF]=useState("الكل");const[wsF,setWsF]=useState("الكل");
  const statuses=(statusCards||DEFAULT_STATUSES).map(s=>s.name);
  const filtered=data.orders.filter(o=>{if(stF!=="الكل"&&o.status!==stF)return false;if(wsF!=="الكل"&&!(o.workshopDeliveries||[]).some(wd=>wd.wsName===wsF))return false;if(q.trim()){const s=q.trim().toLowerCase();const wsNames=(o.workshopDeliveries||[]).map(wd=>wd.wsName).join(" ");const h=[o.modelNo,o.modelDesc,o.sizeLabel,wsNames,o.status].filter(Boolean).join(" ").toLowerCase();if(!h.includes(s))return false}return true});
  return<div>
    <h1 style={{fontSize:isMob?24:32,fontWeight:800,margin:"0 0 20px"}}>{"بحث - "+season}</h1>
    <Card style={{marginBottom:20}}><div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"2fr 1fr 1fr",gap:12}}>
      <div><label style={{display:"block",fontSize:FS-2,color:T.textSec,marginBottom:4,fontWeight:600}}>بحث</label><Inp value={q} onChange={setQ} placeholder="رقم موديل، وصف..."/></div>
      <div><label style={{display:"block",fontSize:FS-2,color:T.textSec,marginBottom:4,fontWeight:600}}>الحالة</label><Sel value={stF} onChange={setStF}><option value="الكل">الكل</option>{statuses.map(s=><option key={s} value={s}>{s}</option>)}</Sel></div>
      <div><label style={{display:"block",fontSize:FS-2,color:T.textSec,marginBottom:4,fontWeight:600}}>الورشة</label><Sel value={wsF} onChange={setWsF}><option value="الكل">الكل</option>{(data.workshops||[]).map(w=><option key={w.id||w} value={w.name||w}>{w.name||w}</option>)}</Sel></div>
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
      <Btn onClick={()=>{const el=document.getElementById("rep-area");if(!el)return;const pw=window.open("","_blank");if(!pw)return;pw.document.write("<!DOCTYPE html><html dir='rtl'><head><meta charset='utf-8'/><link href='https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;800&display=swap' rel='stylesheet'/><title>تقرير الانتاج</title><style>body{font-family:'Cairo',Arial;padding:20px;font-size:13px;direction:rtl}table{width:100%;border-collapse:collapse;margin:10px 0}th,td{border:1px solid #ddd;padding:8px;text-align:right}th{background:#f5f5f5;font-weight:700}@media print{body{padding:10px}}</style></head><body>"+el.innerHTML+"</body></html>");pw.document.close();setTimeout(()=>{pw.focus();pw.print()},500)}} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>طباعة التقرير</Btn>
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
      {sortOrders(data.orders).map((o,i)=>{const c=calcOrder(o);return<tr key={o.id}><td style={TD}>{i+1}</td><td style={TDB}>{o.modelNo}</td><td style={TD}>{o.modelDesc}</td><td style={{...TDB,color:T.accent}}>{c.cutQty}</td><td style={TD}>{o.deliveredQty||0}</td><td style={{...TD,color:c.balance>0?T.warn:T.ok,fontWeight:700}}>{c.balance}</td><td style={{...TDB,color:T.accent,fontSize:FS+2}}>{c.costPer+" ج.م"}</td></tr>})}
      {data.orders.length===0&&<tr><td colSpan={7} style={{...TD,textAlign:"center",color:T.textSec,padding:40}}>لا توجد بيانات</td></tr>}
    </tbody></table></div></Card>
  </div>
}

/* ══ SETTINGS ══ */
function SettingsPg({config,upConfig,isMob,user,theme,setTheme}){
  const[newSeason,setNewSeason]=useState("");const[delConfirm,setDelConfirm]=useState("");
  const[newUserEmail,setNewUserEmail]=useState("");const[newUserRole,setNewUserRole]=useState("viewer");
  const handleLogo=async e=>{const f=e.target.files[0];if(!f)return;const compressed=await compressImage(f,200,0.6);upConfig(d=>{d.logo=compressed})};
  const addSeason=()=>{if(!newSeason.trim())return;upConfig(d=>{if(!d.seasons)d.seasons=[];if(!d.seasons.includes(newSeason.trim()))d.seasons.push(newSeason.trim());d.activeSeason=newSeason.trim()});setNewSeason("")};
  const deleteSeason=async s=>{if(delConfirm!==s){setDelConfirm(s);return}try{const snap=await getDocs(collection(db,"seasons",s,"orders"));await Promise.all(snap.docs.map(d=>deleteDoc(doc(db,"seasons",s,"orders",d.id))))}catch(e){}upConfig(d=>{d.seasons=(d.seasons||[]).filter(x=>x!==s);if(d.activeSeason===s)d.activeSeason=d.seasons[0]||""});setDelConfirm("")};

  return<div>
    <h1 style={{fontSize:isMob?24:32,fontWeight:800,margin:"0 0 20px"}}>الاعدادات</h1>
    {/* Theme Selector */}
    <Card title="مظهر التطبيق" style={{marginBottom:16}}>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"repeat(4,1fr)",gap:14}}>
        {Object.entries(THEMES).map(([key,th])=><div key={key} onClick={()=>setTheme(key)} style={{cursor:"pointer",borderRadius:16,overflow:"hidden",border:theme===key?"3px solid "+th.accent:"2px solid "+th.brd,boxShadow:theme===key?"0 0 20px "+th.accent+"40":"none",transition:"all 0.2s"}}>
          <div style={{background:th.bg,padding:14}}>
            <div style={{display:"flex",gap:8,marginBottom:10}}>
              <div style={{width:40,height:50,borderRadius:8,background:th.sidebarBg||th.cardSolid,border:"1px solid "+th.brd}}/>
              <div style={{flex:1}}>
                <div style={{height:10,borderRadius:4,background:th.accent,width:"60%",marginBottom:6}}/>
                <div style={{height:8,borderRadius:4,background:th.textMut,width:"80%",marginBottom:6}}/>
                <div style={{display:"flex",gap:4}}>
                  <div style={{height:24,flex:1,borderRadius:6,background:th.cardSolid,border:"1px solid "+th.brd}}/>
                  <div style={{height:24,flex:1,borderRadius:6,background:th.cardSolid,border:"1px solid "+th.brd}}/>
                </div>
              </div>
            </div>
            <div style={{textAlign:"center",fontWeight:700,fontSize:FS,color:th.text}}>{th.name}</div>
            {theme===key&&<div style={{textAlign:"center",fontSize:FS-2,color:th.accent,fontWeight:600,marginTop:4}}>✓ مفعّل</div>}
          </div>
        </div>)}
      </div>
    </Card>
    <Card title="لوجو المصنع" style={{marginBottom:16}}>
      <div style={{display:"flex",alignItems:"center",gap:20,flexWrap:"wrap"}}>
        <div style={{width:100,height:100,borderRadius:16,border:"2px dashed "+T.brd,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",background:T.inputBg||T.cardSolid,cursor:"pointer",position:"relative"}}>{config.logo?<img src={config.logo} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<span style={{fontSize:FS,color:T.textMut}}>لوجو</span>}<input type="file" accept="image/*" onChange={handleLogo} style={{position:"absolute",inset:0,opacity:0,cursor:"pointer"}}/></div>
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
        {(config.usersList||[]).map((u,i)=><tr key={i}><td style={{...TD,fontWeight:600}}>{u.email}</td><td style={TD}><Sel value={u.role} onChange={v=>upConfig(d=>{const x=(d.usersList||[]).find(z=>z.email===u.email);if(x)x.role=v})}><option value="admin">مدير النظام</option><option value="manager">مدير انتاج</option><option value="viewer">مشاهد فقط</option></Sel></td><td style={TD}><DelBtn onConfirm={()=>upConfig(d=>{d.usersList=(d.usersList||[]).filter(x=>x.email!==u.email)})}/></td></tr>)}
      </tbody></table></div>}
      <div style={{marginTop:16,display:"grid",gridTemplateColumns:isMob?"1fr":"repeat(3,1fr)",gap:12}}>
        {[["مدير النظام",T.accent,"كل الصلاحيات + اعدادات"],["مدير انتاج",T.ok,"اضافة وتعديل"],["مشاهد",T.warn,"عرض فقط"]].map(([n,c,d])=><div key={n} style={{padding:14,borderRadius:12,background:c+"08",border:"1px solid "+c+"25"}}><div style={{fontSize:FS,fontWeight:700,color:c,marginBottom:4}}>{n}</div><div style={{fontSize:FS-2,color:T.textSec}}>{d}</div></div>)}
      </div>
    </Card>
  </div>
}
