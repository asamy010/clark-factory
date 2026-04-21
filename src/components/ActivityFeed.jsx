/* ═══════════════════════════════════════════════════════════════
   CLARK - ActivityFeed.jsx
   
   Extracted from App.jsx in V15.1 phase 3.
   Contains: ActivityFeed
   ═══════════════════════════════════════════════════════════════ */

import { useState } from "react";
import { FS } from "../constants/index.js";
import { T } from "../theme.js";
import { fmt } from "../utils/format.js";
import { calcOrder } from "../utils/orders.js";

export function ActivityFeed({orders,config,user,isMob}){
  const[dismissed,setDismissed]=useState(()=>{try{return JSON.parse(localStorage.getItem("clark_act_dismissed")||"[]")}catch(e){return[]}});
  const dismiss=(id)=>{const n=[...dismissed,id];setDismissed(n);try{localStorage.setItem("clark_act_dismissed",JSON.stringify(n.slice(-200)))}catch(e){}};
  const dismissAll=(ids)=>{const n=[...dismissed,...ids];setDismissed(n);try{localStorage.setItem("clark_act_dismissed",JSON.stringify(n.slice(-200)))}catch(e){}};
  const myName=user?.displayName||(user?.email||"").split("@")[0];
  const now=Date.now();const cutoff=now-48*60*60*1000;const acts=[];
  orders.forEach(o=>{const mn=o.modelNo||"";
    /* Workshop deliveries */
    (o.workshopDeliveries||[]).forEach(wd=>{const d=new Date(wd.date||wd.createdAt||o.date).getTime();if(d>cutoff&&wd.createdBy&&wd.createdBy!==myName){
      acts.push({id:"wd_"+o.id+"_"+wd.date+"_"+(wd.garmentType||""),time:d,type:"wsDel",icon:"🔵",color:"#0EA5E9",by:wd.createdBy,text:"سلّم ورشة "+wd.wsName+" — "+(wd.garmentType||"عام")+" "+wd.qty+" قطعة",model:mn,qty:Number(wd.qty)||0})}
      /* Receives */
      ;(wd.receives||[]).forEach(r=>{const rd=new Date(r.date||r.createdAt||"").getTime();if(rd>cutoff&&r.createdBy&&r.createdBy!==myName){
        acts.push({id:"rcv_"+o.id+"_"+r.date+"_"+(wd.garmentType||""),time:rd,type:"wsRcv",icon:"🟢",color:"#10B981",by:r.createdBy||"",text:"استلم من ورشة "+wd.wsName+" — "+r.qty+" قطعة",model:mn,qty:Number(r.qty)||0})}})});
    /* Stock deliveries */
    (o.deliveries||[]).forEach((dl,di)=>{const d=new Date(dl.date||"").getTime();
      if(d>cutoff&&dl.createdBy&&dl.createdBy!==myName&&dl.status==="pending"){acts.push({id:"stk_"+o.id+"_"+di,time:d,type:"stockDel",icon:"🟠",color:"#F59E0B",by:dl.createdBy,text:"سلّم المخزن — "+dl.qty+" قطعة",model:mn,qty:Number(dl.qty)||0})}
      if(dl.confirmedAt){const cd=new Date(dl.confirmedAt).getTime();if(cd>cutoff&&dl.confirmedBy&&dl.confirmedBy!==myName){acts.push({id:"cfm_"+o.id+"_"+di,time:cd,type:"stockConf",icon:"✅",color:"#10B981",by:dl.confirmedBy,text:"أكد استلام المخزن — "+dl.qty+" قطعة",model:mn,qty:Number(dl.qty)||0})}}});
    /* Customer deliveries */
    (o.customerDeliveries||[]).forEach((cd,ci)=>{const d=new Date(cd.date||"").getTime();if(d>cutoff&&cd.by&&cd.by!==myName){
      acts.push({id:"sale_"+o.id+"_"+ci,time:d,type:"custDel",icon:"💰",color:"#8B5CF6",by:cd.by,text:"بيع "+(cd.custName||"عميل")+" — "+cd.qty+" قطعة",model:mn,qty:Number(cd.qty)||0})}});
    /* New order */
    if(o.createdAt){const d=new Date(o.createdAt).getTime();if(d>cutoff){const by=o.createdBy||"";if(by&&by!==myName)acts.push({id:"new_"+o.id,time:d,type:"newOrder",icon:"📋",color:T.accent,by,text:"سجّل أوردر جديد — "+mn,model:mn,qty:calcOrder(o).cutQty})}}
  });
  acts.sort((a,b)=>b.time-a.time);
  /* Group by user+type for cleaner display */
  const groups={};acts.forEach(a=>{const k=a.by+"|"+a.type;if(!groups[k])groups[k]={...a,ids:[a.id],count:1,totalQty:a.qty,models:new Set([a.model])};else{groups[k].count++;groups[k].totalQty+=a.qty;groups[k].models.add(a.model);groups[k].ids.push(a.id);if(a.time>groups[k].time)groups[k].time=a.time}});
  const grouped=Object.values(groups).map(g=>{if(g.count>1){const mList=[...g.models];return{...g,text:g.type==="wsDel"?g.by+" سلّم "+g.count+" حركة للورش ("+fmt(g.totalQty)+" قطعة)":g.type==="wsRcv"?g.by+" استلم "+g.count+" حركة من الورش ("+fmt(g.totalQty)+" قطعة)":g.type==="stockDel"?g.by+" سلّم المخزن "+mList.length+" موديل ("+fmt(g.totalQty)+" قطعة)":g.type==="stockConf"?g.by+" أكد استلام "+mList.length+" موديل ("+fmt(g.totalQty)+" قطعة)":g.type==="custDel"?g.by+" باع "+g.count+" حركة ("+fmt(g.totalQty)+" قطعة)":g.by+" سجّل "+g.count+" أوردر ("+fmt(g.totalQty)+" قطعة)",model:mList.length<=3?mList.join("، "):mList.length+" موديل"}}return{...g,text:g.by+" "+g.text}}).sort((a,b)=>b.time-a.time).slice(0,15);
  const visible=grouped.filter(g=>!g.ids.some(id=>dismissed.includes(id)));
  if(visible.length===0)return<div style={{textAlign:"center",padding:16,color:T.textMut,fontSize:FS-1}}>✅ لا توجد حركات جديدة</div>;
  return<div style={{background:T.cardSolid,borderRadius:16,border:"1px solid "+T.brd,padding:isMob?12:14,boxShadow:T.shadow}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
      <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:16}}>🔔</span><span style={{fontSize:FS,fontWeight:800,color:T.accent}}>{"آخر الحركات ("+visible.length+")"}</span></div>
      {visible.length>0&&<span onClick={()=>{dismissAll(visible.flatMap(g=>g.ids))}} style={{fontSize:FS-2,color:T.textMut,cursor:"pointer",fontWeight:600}}>مسح الكل ×</span>}
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:isMob?300:400,overflowY:"auto"}}>
      {visible.map((g,i)=><div key={g.ids[0]||i} style={{display:"flex",gap:8,padding:"8px 10px",borderRadius:10,background:(g.color||T.accent)+"06",border:"1px solid "+(g.color||T.accent)+"15",fontSize:FS-1}}>
        <span style={{fontSize:15,flexShrink:0}}>{g.icon}</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:700,color:T.text,lineHeight:1.3}}>{g.text}</div>
          <div style={{fontSize:FS-3,color:T.textMut,lineHeight:1.3}}>{g.model+(g.time?" — "+new Date(g.time).toISOString().split("T")[0]:"")}</div>
        </div>
        <span onClick={()=>{dismissAll(g.ids)}} style={{cursor:"pointer",fontSize:12,color:T.textMut,padding:"2px 6px",borderRadius:4,flexShrink:0}}>✕</span>
      </div>)}
    </div>
  </div>}

