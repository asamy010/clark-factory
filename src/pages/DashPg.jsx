/* ═══════════════════════════════════════════════════════════════
   CLARK - DashPg.jsx
   
   Extracted from App.jsx in V15.1 phase 3.
   Contains: DashPg
   ═══════════════════════════════════════════════════════════════ */

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, Btn, Card } from "../components/ui.jsx";
import { FS } from "../constants/index.js";
import { T, TD, TDB, TH } from "../theme.js";
import { fmt, r2, dayName } from "../utils/format.js";
import { calcOrder, calcWsRating, getWsPartnershipTier, getStatusColor, wsIsInternal, wsTypeInfo } from "../utils/orders.js";
import { computeWorkshopDue, computeWorkshopBalance } from "../utils/accountSummary.js";
import { printPage } from "../utils/print.js";
import { DashboardKpis } from "../components/DashboardKpis.jsx";
/* V16.12: alerts.js import removed — the engine used field names that don't
   match the actual order/treasury schema (e.g. o.expectedDeliveryDate, wd.pieces,
   o.cuts, t.ts), so SmartAlertsSection on the dashboard was effectively
   rendering nothing. The real per-page alerts (App.jsx aiAlerts/appAlerts on
   the alerts bell) cover the same ground correctly. */

export function DashPg({data,goD,isMob,isTab,season,statusCards,upConfig,user,setCardPopup,setWsAccPopup}){
  const orders=data.orders;

  /* ═══ MEMOIZED COMPUTATIONS ═══ */
  const stats=useMemo(()=>{
    const cutQ=orders.reduce((s,o)=>s+calcOrder(o).cutQty,0);
    const delQ=orders.reduce((s,o)=>s+(o.deliveredQty||0),0);
    const comp=cutQ?Math.round((delQ/cutQ)*100):0;
    let totalDeliveredToWs=0,totalReceivedFromWs=0;
    orders.forEach(o=>{(o.workshopDeliveries||[]).forEach(wd=>{totalDeliveredToWs+=(Number(wd.qty)||0);(wd.receives||[]).forEach(r=>{totalReceivedFromWs+=(Number(r.qty)||0)})})});
    const inProdQty=totalDeliveredToWs-totalReceivedFromWs;
    /* Per-piece breakdown at workshops */
    const wsPieces={};let totalCompleteSets=0;
    orders.forEach(o=>{const pieces=o.orderPieces||[];const pieceBalances={};
      (o.workshopDeliveries||[]).forEach(wd=>{const g=wd.garmentType||"عام";if(!pieceBalances[g])pieceBalances[g]=0;pieceBalances[g]+=(Number(wd.qty)||0);(wd.receives||[]).forEach(r=>{pieceBalances[g]-=(Number(r.qty)||0)})});
      Object.entries(pieceBalances).forEach(([g,bal])=>{if(bal>0){if(!wsPieces[g])wsPieces[g]=0;wsPieces[g]+=bal}});
      if(pieces.length>1){const pBals=pieces.map(p=>pieceBalances[p]||0);const minBal=Math.min(...pBals);if(minBal>0)totalCompleteSets+=minBal}
      else if(pieces.length===1){const bal=pieceBalances[pieces[0]]||0;if(bal>0)totalCompleteSets+=bal}
      else{const bal=pieceBalances["عام"]||0;if(bal>0)totalCompleteSets+=bal}
    });
    const sc={};orders.forEach(o=>{sc[o.status]=(sc[o.status]||0)+1});
    const pieData=Object.entries(sc).map(([name,value])=>({name,value,fill:getStatusColor(name,statusCards)}));
    const wsMap={};
    orders.forEach(o=>{(o.workshopDeliveries||[]).forEach(wd=>{
      if(!wsMap[wd.wsName])wsMap[wd.wsName]={name:wd.wsName,delivered:0,received:0};
      wsMap[wd.wsName].delivered+=(Number(wd.qty)||0);
      (wd.receives||[]).forEach(r=>{wsMap[wd.wsName].received+=(Number(r.qty)||0)})
    })});
    const wsChartData=Object.values(wsMap).sort((a,b)=>b.received-a.received);
    const _isInt=(n)=>{const w=(data.workshops||[]).find(x=>x.name===n);return w?wsIsInternal(w.type):false};
    /* V21.9.83 (Treasury audit Bug #1 + #4): exclude settlement entries from
       due and apply r2() consistently to prevent float drift. wsPayments
       totals also rounded per-step. */
    let wsDue=0,wsPaid=0,wsPurchase=0;
    orders.forEach(o=>{(o.workshopDeliveries||[]).forEach(wd=>{if(_isInt(wd.wsName))return;(wd.receives||[]).forEach(r=>{if(r&&r.isSettlement)return;wsDue+=r2((Number(r.qty)||0)*(Number(r.price)||0))})})});
    (data.wsPayments||[]).forEach(p=>{if(p.type==="payment")wsPaid+=(Number(p.amount)||0);else wsPurchase+=(Number(p.amount)||0)});
    wsDue=r2(wsDue);wsPaid=r2(wsPaid);wsPurchase=r2(wsPurchase);
    const wsBalance=r2(wsDue+wsPurchase-wsPaid);
    const finishingQty=orders.filter(o=>o.status==="تشطيب وتعبئة").reduce((s,o)=>s+calcOrder(o).cutQty,0);
    return{cutQ,delQ,comp,totalDeliveredToWs,totalReceivedFromWs,inProdQty,wsPieces,totalCompleteSets,pieData,wsMap,wsChartData,wsDue,wsPaid,wsPurchase,wsBalance,finishingQty,_isInt}
  },[orders,statusCards,data.wsPayments,data.workshops]);

  const{cutQ,delQ,comp,totalDeliveredToWs,totalReceivedFromWs,inProdQty,wsPieces,totalCompleteSets,pieData,wsMap,wsChartData,wsDue,wsPaid,wsPurchase,wsBalance,finishingQty,_isInt}=stats;
  /* V21.9.83 (Treasury audit Bug #1 + #4): delegate to the central helper.
     Pre-V21.9.83 this duplicated the (settlement-included, no-r2) logic. */
  const wsAccounts=(wsName)=>{
    if(_isInt(wsName))return{due:0,totalPaid:0,totalPurchase:0,balance:0};
    return computeWorkshopBalance(wsName,data);
  };

  /* Today's Summary stats — memoized so we don't recompute on every render */
  const todayStats=useMemo(()=>{
    const today=new Date().toISOString().split("T")[0];
    let todayCut=0,todayWsDel=0,todayWsRcv=0,todayStock=0;
    const todayOrders=[];const todayWsNames=new Set();
    orders.forEach(o=>{
      if(o.date===today){todayCut+=calcOrder(o).cutQty;todayOrders.push(o.modelNo)}
      (o.workshopDeliveries||[]).forEach(wd=>{
        if(wd.date===today){todayWsDel+=Number(wd.qty)||0;todayWsNames.add(wd.wsName)}
        (wd.receives||[]).forEach(r=>{if(r.date===today)todayWsRcv+=Number(r.qty)||0})
      });
      (o.deliveries||[]).forEach(d=>{if(d.date===today)todayStock+=Number(d.qty)||0})
    });
    return{today,todayCut,todayWsDel,todayWsRcv,todayStock,todayOrders,todayWsNames};
  },[orders]);

  /* ═══════════════════════════════════════════════════════════════
     PROFESSIONAL DASHBOARD V14.46 — Minimal & Clean
     Structure:
     1. HERO SECTION (greeting + 4 KPIs + 3 Quick Actions)
     2. TODAY'S ACTIVITY
     3. PRODUCTION OVERVIEW (season stats)
     4. FINANCIAL OVERVIEW (workshop accounts)
     5. VISUAL ANALYTICS (charts)
     6. WORKSHOP PERFORMANCE (race, pressure, timer, top 3)
     7. ATTENTION NEEDED (delays, waste, workshop comparison)
     8. SYSTEM INFO
  ═══════════════════════════════════════════════════════════════ */

  /* ─── Personalized greeting ─── */
  const userName=user?.displayName||(user?.email||"").split("@")[0]||"";
  const hour=new Date().getHours();
  const greetEmoji=hour<12?"🌅":hour<17?"☀️":hour<20?"🌇":"🌙";
  const greetText=hour<12?"صباح الخير":hour<17?"مساءً سعيداً":hour<20?"مساء الخير":"مساؤك جميل";

  /* ─── SVG Icons (reusable professional icons) ─── */
  const Icon=({path,size=20,sw=2})=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={{display:"block"}}>{path}</svg>;
  const II={
    scissors:<><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></>,
    checkCircle:<><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>,
    factory:<><path d="M17 18a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2"/><rect x="2" y="6" width="20" height="16" rx="2"/><path d="M2 10h20"/></>,
    trendingUp:<><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>,
    plus:<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    truck:<><path d="M14 16V6a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h1"/><path d="M14 9h4l3 3v4a1 1 0 0 1-1 1h-1"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/><path d="M9 18h6"/></>,
    chart:<><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><path d="M2 20h20"/></>,
    package:<><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></>,
    arrowUp:<><polyline points="12 19 12 5"/><polyline points="5 12 12 5 19 12"/></>,
    arrowDown:<><polyline points="12 5 12 19"/><polyline points="19 12 12 19 5 12"/></>,
    alert:<><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
    clock:<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    target:<><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></>,
    zap:<><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></>,
    database:<><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></>
  };

  /* ─── Action handler: navigate to a tab ─── */
  const goTab=(key)=>window.dispatchEvent(new CustomEvent("goto-tab",{detail:key}));

  /* V15.5: Compute proactive alerts — low stock and stuck orders */
  const alerts=useMemo(()=>{
    const today=new Date();
    const daysBetween=(dateStr)=>{if(!dateStr)return 0;const d=new Date(dateStr);return Math.floor((today-d)/(1000*60*60*24))};
    /* 1. Low stock (fabrics + accessories with stock <= minStock or <= 20 default) */
    const lowStock=[];
    (data.fabrics||[]).forEach(f=>{const min=Number(f.minStock)||20;const cur=Number(f.stock)||0;if(cur<=min)lowStock.push({type:"قماش",name:f.name,stock:cur,min,unit:f.unit||"متر"})});
    (data.accessories||[]).forEach(a=>{const min=Number(a.minStock)||50;const cur=Number(a.stock)||0;if(cur<=min)lowStock.push({type:"اكسسوار",name:a.name,stock:cur,min,unit:a.unit||"قطعة"})});
    /* 2. Orders stuck in workshops > 14 days */
    const stuckInWs=[];
    orders.forEach(o=>{
      if(o.closed)return;
      (o.workshopDeliveries||[]).forEach(wd=>{
        const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);
        const rem=(Number(wd.qty)||0)-rcvd;
        if(rem<=0)return;
        const days=daysBetween(wd.date);
        if(days>14)stuckInWs.push({modelNo:o.modelNo,wsName:wd.wsName,days,remaining:rem,orderId:o.id,garmentType:wd.garmentType||""});
      });
    });
    stuckInWs.sort((a,b)=>b.days-a.days);
    /* 3. Orders cut > 7 days ago with no workshop activity */
    const stuckCut=[];
    orders.forEach(o=>{
      if(o.closed)return;
      const t=calcOrder(o);
      if(t.cutQty<=0)return;
      const hasWsActivity=(o.workshopDeliveries||[]).length>0;
      if(hasWsActivity)return;
      const days=daysBetween(o.date);
      if(days>7)stuckCut.push({modelNo:o.modelNo,days,cutQty:t.cutQty,orderId:o.id});
    });
    stuckCut.sort((a,b)=>b.days-a.days);
    return{lowStock,stuckInWs:stuckInWs.slice(0,8),stuckCut:stuckCut.slice(0,8),totalAlerts:lowStock.length+stuckInWs.length+stuckCut.length};
  },[orders,data.fabrics,data.accessories]);

  /* V15.5: Profitability — uses sellPrice (from CustDeliver matrix) vs cost (fabrics + acc + external ws).
     Only considers orders that have both sellPrice > 0 AND cutQty > 0 (avoid noise). */
  const profitability=useMemo(()=>{
    const rows=[];let totalRevenue=0,totalCost=0;
    orders.forEach(o=>{
      const sellPrice=Number(o.sellPrice)||0;
      if(sellPrice<=0)return;
      const t=calcOrder(o);
      if(t.cutQty<=0)return;
      const revenue=sellPrice*t.cutQty;
      /* V21.9.81 (Bug #9): profit projection uses costAllProjected so
         mid-production orders show realistic margins (was using costAll
         which only counted received workshop pieces → inflated profit). */
      const cost=t.costAllProjected;
      const profit=revenue-cost;
      const profitPct=revenue>0?r2((profit/revenue)*100):0;
      rows.push({modelNo:o.modelNo,modelDesc:o.modelDesc,cutQty:t.cutQty,sellPrice,costPer:t.costPerProjected,profitPer:r2(sellPrice-t.costPerProjected),profitPct,revenue,cost,profit,orderId:o.id});
      totalRevenue+=revenue;totalCost+=cost;
    });
    rows.sort((a,b)=>b.profitPct-a.profitPct);
    const topProfitable=rows.slice(0,5);
    const losing=rows.filter(r=>r.profitPct<15).slice(-5).reverse();/* margin < 15% = risk */
    const avgMargin=totalRevenue>0?r2(((totalRevenue-totalCost)/totalRevenue)*100):0;
    return{rows,topProfitable,losing,totalRevenue,totalCost,totalProfit:totalRevenue-totalCost,avgMargin,count:rows.length};
  },[orders]);

  return<div style={{maxWidth:1400,margin:"0 auto"}}>
    {/* V21.21.18: مؤشرات KPI الشاملة (مبيعات/مشتريات/مخزون/ربح) أعلى لوحة التحكم */}
    <DashboardKpis data={data} isMob={isMob} upConfig={upConfig}/>
    {/* Custom styles for hero section */}
    <style>{`
      .hero-kpi{transition:all 0.25s cubic-bezier(0.4,0,0.2,1);cursor:default}
      .hero-kpi:hover{transform:translateY(-4px)}
      .quick-action{transition:all 0.2s ease}
      .quick-action:hover{transform:translateY(-2px);box-shadow:0 8px 16px -6px rgba(0,0,0,0.15)}
      .minimal-stat{transition:all 0.15s ease;cursor:pointer}
      .minimal-stat:hover{background:${T.bg};border-color:${T.accent}30}
      .section-title{font-size:${FS-1}px;font-weight:800;color:${T.textSec};margin:0 0 12px;padding:0 4px;display:flex;align-items:center;gap:8px;text-transform:uppercase;letter-spacing:0.6px}
      .section-title::after{content:"";flex:1;height:1px;background:linear-gradient(to left,${T.brd},transparent);margin-right:4px}
    `}</style>

    {/* V16.12: SmartAlertsSection removed — see comment at top of file.
        The alerts bell in App.jsx (aiAlerts) covers the same ground using
        the actual schema and works correctly. */}

    {/* ═══════════════════════════════════════════════════════════════
        V15.5 ALERTS SECTION — Low stock + Stuck orders
        Only shown when alerts exist. Zero-configuration.
       ═══════════════════════════════════════════════════════════════ */}
    {alerts.totalAlerts>0&&<div style={{marginBottom:18,background:"linear-gradient(135deg, #FEF2F2, #FEF3C7)",borderRadius:16,padding:isMob?14:20,border:"1px solid #FED7AA",boxShadow:"0 4px 12px -4px rgba(239,68,68,0.15)"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
        <div style={{width:40,height:40,borderRadius:10,background:"#EF4444",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>⚠️</div>
        <div>
          <div style={{fontSize:FS+2,fontWeight:800,color:"#991B1B"}}>تنبيهات تحتاج اهتمام</div>
          <div style={{fontSize:FS-2,color:"#7C2D12"}}>{alerts.totalAlerts} تنبيه يلزم مراجعته</div>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"repeat(auto-fit,minmax(280px,1fr))",gap:12}}>
        {/* Low stock */}
        {alerts.lowStock.length>0&&<div style={{background:"#fff",borderRadius:12,padding:14,border:"1px solid #FECACA"}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8,fontSize:FS,fontWeight:800,color:"#991B1B"}}>📦 مخزون منخفض <span style={{background:"#FEE2E2",color:"#991B1B",padding:"2px 10px",borderRadius:10,fontSize:FS-3,fontWeight:700,marginRight:4}}>{alerts.lowStock.length}</span></div>
          <div style={{maxHeight:180,overflow:"auto"}}>
            {alerts.lowStock.slice(0,6).map((s,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",padding:"6px 8px",fontSize:FS-1,borderBottom:"1px solid #F1F5F9"}}>
              <span style={{fontWeight:600,color:"#1E293B"}}>{s.type} · {s.name}</span>
              <span style={{fontWeight:700,color:"#EF4444"}}>{s.stock} {s.unit}</span>
            </div>)}
            {alerts.lowStock.length>6&&<div style={{fontSize:FS-3,color:"#64748B",textAlign:"center",paddingTop:6}}>+{alerts.lowStock.length-6} أخرى</div>}
          </div>
        </div>}
        {/* Stuck in workshops */}
        {alerts.stuckInWs.length>0&&<div style={{background:"#fff",borderRadius:12,padding:14,border:"1px solid #FED7AA"}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8,fontSize:FS,fontWeight:800,color:"#92400E"}}>⏰ عالقة في الورش <span style={{background:"#FEF3C7",color:"#92400E",padding:"2px 10px",borderRadius:10,fontSize:FS-3,fontWeight:700,marginRight:4}}>{alerts.stuckInWs.length}</span></div>
          <div style={{maxHeight:180,overflow:"auto"}}>
            {alerts.stuckInWs.map((s,i)=><div key={i} onClick={()=>goD&&goD(s.orderId)} style={{display:"flex",justifyContent:"space-between",padding:"6px 8px",fontSize:FS-1,borderBottom:"1px solid #F1F5F9",cursor:"pointer"}}>
              <span style={{fontWeight:600,color:"#1E293B"}}>{s.modelNo}{s.garmentType?" - "+s.garmentType:""} · {s.wsName}</span>
              <span style={{fontWeight:700,color:"#F59E0B"}}>{s.days} يوم</span>
            </div>)}
          </div>
        </div>}
        {/* Cut but no workshop */}
        {alerts.stuckCut.length>0&&<div style={{background:"#fff",borderRadius:12,padding:14,border:"1px solid #FDE68A"}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8,fontSize:FS,fontWeight:800,color:"#78350F"}}>✂️ مقصوصة ولسه ما اتسلمتش لورشة <span style={{background:"#FEF3C7",color:"#78350F",padding:"2px 10px",borderRadius:10,fontSize:FS-3,fontWeight:700,marginRight:4}}>{alerts.stuckCut.length}</span></div>
          <div style={{maxHeight:180,overflow:"auto"}}>
            {alerts.stuckCut.map((s,i)=><div key={i} onClick={()=>goD&&goD(s.orderId)} style={{display:"flex",justifyContent:"space-between",padding:"6px 8px",fontSize:FS-1,borderBottom:"1px solid #F1F5F9",cursor:"pointer"}}>
              <span style={{fontWeight:600,color:"#1E293B"}}>{s.modelNo} ({s.cutQty} قطعة)</span>
              <span style={{fontWeight:700,color:"#F59E0B"}}>{s.days} يوم</span>
            </div>)}
          </div>
        </div>}
      </div>
    </div>}

    {/* ═══════════════════════════════════════════════════════════════
        V15.5 PROFITABILITY SECTION — Revenue vs Cost based on sellPrice
        Only shown when at least one order has sellPrice set.
       ═══════════════════════════════════════════════════════════════ */}
    {profitability.count>0&&<div style={{marginBottom:18,background:"linear-gradient(135deg, #F0FDF4, #ECFEFF)",borderRadius:16,padding:isMob?14:20,border:"1px solid #BBF7D0",boxShadow:"0 4px 12px -4px rgba(16,185,129,0.12)"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,flexWrap:"wrap"}}>
        <div style={{width:40,height:40,borderRadius:10,background:"#10B981",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>💰</div>
        <div style={{flex:1,minWidth:180}}>
          <div style={{fontSize:FS+2,fontWeight:800,color:"#064E3B"}}>تحليل الربحية الحقيقية</div>
          <div style={{fontSize:FS-2,color:"#065F46"}}>{profitability.count} موديل · متوسط الهامش {profitability.avgMargin}%</div>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:isMob?"repeat(2,1fr)":"repeat(4,1fr)",gap:10,marginBottom:14}}>
        <div style={{background:"#fff",padding:"10px 14px",borderRadius:10,border:"1px solid #D1FAE5"}}>
          <div style={{fontSize:FS-3,color:"#065F46",fontWeight:600}}>الإيرادات</div>
          <div style={{fontSize:16,fontWeight:800,color:"#10B981"}}>{fmt(r2(profitability.totalRevenue))} ج</div>
        </div>
        <div style={{background:"#fff",padding:"10px 14px",borderRadius:10,border:"1px solid #FECACA"}}>
          <div style={{fontSize:FS-3,color:"#991B1B",fontWeight:600}}>التكاليف</div>
          <div style={{fontSize:16,fontWeight:800,color:"#EF4444"}}>{fmt(r2(profitability.totalCost))} ج</div>
        </div>
        <div style={{background:"#fff",padding:"10px 14px",borderRadius:10,border:"1px solid #BBF7D0"}}>
          <div style={{fontSize:FS-3,color:"#064E3B",fontWeight:600}}>صافي الربح</div>
          <div style={{fontSize:16,fontWeight:800,color:profitability.totalProfit>=0?"#10B981":"#EF4444"}}>{fmt(r2(profitability.totalProfit))} ج</div>
        </div>
        <div style={{background:"#fff",padding:"10px 14px",borderRadius:10,border:"1px solid #DBEAFE"}}>
          <div style={{fontSize:FS-3,color:"#1E40AF",fontWeight:600}}>متوسط الهامش</div>
          <div style={{fontSize:16,fontWeight:800,color:profitability.avgMargin>=20?"#10B981":profitability.avgMargin>=10?"#F59E0B":"#EF4444"}}>{profitability.avgMargin}%</div>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"repeat(2,1fr)",gap:12}}>
        {profitability.topProfitable.length>0&&<div style={{background:"#fff",borderRadius:12,padding:14,border:"1px solid #D1FAE5"}}>
          <div style={{fontSize:FS,fontWeight:800,color:"#064E3B",marginBottom:8}}>🏆 أعلى هامش ربح</div>
          <div>{profitability.topProfitable.map((r,i)=><div key={i} onClick={()=>goD&&goD(r.orderId)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 8px",fontSize:FS-1,borderBottom:i<profitability.topProfitable.length-1?"1px solid #F1F5F9":"none",cursor:"pointer"}}>
            <span style={{fontWeight:600,color:"#1E293B"}}>{r.modelNo}</span>
            <span style={{fontWeight:800,color:"#10B981"}}>{r.profitPct}%</span>
          </div>)}</div>
        </div>}
        {profitability.losing.length>0&&<div style={{background:"#fff",borderRadius:12,padding:14,border:"1px solid #FED7AA"}}>
          <div style={{fontSize:FS,fontWeight:800,color:"#78350F",marginBottom:8}}>⚠️ هامش منخفض (&lt;15%)</div>
          <div>{profitability.losing.map((r,i)=><div key={i} onClick={()=>goD&&goD(r.orderId)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 8px",fontSize:FS-1,borderBottom:i<profitability.losing.length-1?"1px solid #F1F5F9":"none",cursor:"pointer"}}>
            <span style={{fontWeight:600,color:"#1E293B"}}>{r.modelNo}</span>
            <span style={{fontWeight:800,color:r.profitPct<0?"#EF4444":"#F59E0B"}}>{r.profitPct}%</span>
          </div>)}</div>
        </div>}
      </div>
    </div>}

    {/* ═══════════════════════════════════════════════════════════════
        1. HERO SECTION — Greeting + 4 Primary KPIs + Quick Actions
       ═══════════════════════════════════════════════════════════════ */}
    <div style={{background:"linear-gradient(135deg, "+T.accent+" 0%, #0284C7 50%, #0369A1 100%)",borderRadius:20,padding:isMob?18:26,marginBottom:18,color:"#fff",position:"relative",overflow:"hidden",boxShadow:"0 10px 30px -10px "+T.accent+"80"}}>
      {/* Decorative circles */}
      <div style={{position:"absolute",top:-80,right:-80,width:240,height:240,borderRadius:"50%",background:"rgba(255,255,255,0.08)",pointerEvents:"none"}}/>
      <div style={{position:"absolute",bottom:-100,left:-60,width:200,height:200,borderRadius:"50%",background:"rgba(255,255,255,0.05)",pointerEvents:"none"}}/>

      {/* Greeting row */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:isMob?14:18,flexWrap:"wrap",gap:10,position:"relative"}}>
        <div>
          <div style={{fontSize:isMob?FS+2:FS+6,fontWeight:800,display:"flex",alignItems:"center",gap:8}}>
            <span>{greetEmoji}</span><span>{greetText}{userName?"، "+userName:""}</span>
          </div>
          <div style={{fontSize:FS-1,opacity:0.85,marginTop:2}}>
            {new Date().toLocaleDateString("ar-EG",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}
          </div>
        </div>
        <div style={{padding:"6px 14px",borderRadius:999,background:"rgba(255,255,255,0.2)",fontSize:FS-1,fontWeight:700,backdropFilter:"blur(8px)",border:"1px solid rgba(255,255,255,0.3)"}}>
          📅 الموسم: <b>{season}</b>
        </div>
      </div>

      {/* 4 Primary KPIs */}
      <div style={{display:"grid",gridTemplateColumns:isMob?"repeat(2,1fr)":"repeat(4,1fr)",gap:isMob?8:12,marginBottom:isMob?12:16,position:"relative"}}>
        <div className="hero-kpi" style={{background:"rgba(255,255,255,0.18)",backdropFilter:"blur(10px)",border:"1px solid rgba(255,255,255,0.25)",borderRadius:14,padding:isMob?12:14}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,opacity:0.95}}>
            <Icon path={II.scissors} size={16}/>
            <span style={{fontSize:FS-2,fontWeight:600}}>كمية القص</span>
          </div>
          <div style={{fontSize:isMob?24:30,fontWeight:900,lineHeight:1.1}}>{fmt(cutQ)}</div>
          <div style={{fontSize:FS-3,opacity:0.8,marginTop:2}}>قطعة</div>
        </div>
        <div className="hero-kpi" style={{background:"rgba(255,255,255,0.18)",backdropFilter:"blur(10px)",border:"1px solid rgba(255,255,255,0.25)",borderRadius:14,padding:isMob?12:14}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,opacity:0.95}}>
            <Icon path={II.package} size={16}/>
            <span style={{fontSize:FS-2,fontWeight:600}}>جاهز بالمخزن</span>
          </div>
          <div style={{fontSize:isMob?24:30,fontWeight:900,lineHeight:1.1}}>{fmt(delQ)}</div>
          <div style={{fontSize:FS-3,opacity:0.8,marginTop:2}}>{cutQ?Math.round(delQ/cutQ*100):0}% من المقصوص</div>
        </div>
        <div className="hero-kpi" style={{background:"rgba(255,255,255,0.18)",backdropFilter:"blur(10px)",border:"1px solid rgba(255,255,255,0.25)",borderRadius:14,padding:isMob?12:14}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,opacity:0.95}}>
            <Icon path={II.factory} size={16}/>
            <span style={{fontSize:FS-2,fontWeight:600}}>عند الورش</span>
          </div>
          <div style={{fontSize:isMob?24:30,fontWeight:900,lineHeight:1.1}}>{fmt(Math.max(0,inProdQty))}</div>
          <div style={{fontSize:FS-3,opacity:0.8,marginTop:2}}>قطعة في الإنتاج</div>
        </div>
        <div className="hero-kpi" style={{background:"rgba(255,255,255,0.18)",backdropFilter:"blur(10px)",border:"1px solid rgba(255,255,255,0.25)",borderRadius:14,padding:isMob?12:14}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,opacity:0.95}}>
            <Icon path={II.target} size={16}/>
            <span style={{fontSize:FS-2,fontWeight:600}}>معدل الانجاز</span>
          </div>
          <div style={{fontSize:isMob?24:30,fontWeight:900,lineHeight:1.1}}>{comp}<span style={{fontSize:isMob?16:20}}>%</span></div>
          <div style={{height:4,borderRadius:2,background:"rgba(255,255,255,0.2)",marginTop:6,overflow:"hidden"}}>
            <div style={{height:"100%",width:comp+"%",background:"#fff",borderRadius:2,transition:"width 1s ease"}}/>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{display:"grid",gridTemplateColumns:isMob?"repeat(3,1fr)":"repeat(3,minmax(0,auto)) 1fr",gap:isMob?6:10,position:"relative"}}>
        <div className="quick-action" onClick={()=>goTab("details")} style={{background:"rgba(255,255,255,0.22)",backdropFilter:"blur(10px)",borderRadius:10,padding:isMob?"8px 10px":"10px 16px",cursor:"pointer",border:"1px solid rgba(255,255,255,0.3)",display:"flex",alignItems:"center",gap:8,justifyContent:"center",fontWeight:700,fontSize:isMob?FS-2:FS-1}}>
          <Icon path={II.plus} size={16} sw={2.5}/>
          <span>{isMob?"قص":"أمر قص جديد"}</span>
        </div>
        <div className="quick-action" onClick={()=>goTab("external")} style={{background:"rgba(255,255,255,0.22)",backdropFilter:"blur(10px)",borderRadius:10,padding:isMob?"8px 10px":"10px 16px",cursor:"pointer",border:"1px solid rgba(255,255,255,0.3)",display:"flex",alignItems:"center",gap:8,justifyContent:"center",fontWeight:700,fontSize:isMob?FS-2:FS-1}}>
          <Icon path={II.truck} size={16}/>
          <span>{isMob?"ورش":"تشغيل خارجي"}</span>
        </div>
        <div className="quick-action" onClick={()=>goTab("reports")} style={{background:"rgba(255,255,255,0.22)",backdropFilter:"blur(10px)",borderRadius:10,padding:isMob?"8px 10px":"10px 16px",cursor:"pointer",border:"1px solid rgba(255,255,255,0.3)",display:"flex",alignItems:"center",gap:8,justifyContent:"center",fontWeight:700,fontSize:isMob?FS-2:FS-1}}>
          <Icon path={II.chart} size={16}/>
          <span>{isMob?"تقارير":"التقارير"}</span>
        </div>
      </div>
    </div>

    {/* ═══════════════════════════════════════════════════════════════
        2. TODAY'S ACTIVITY (minimal card with 4 small stats)
       ═══════════════════════════════════════════════════════════════ */}
    {(()=>{const{today,todayCut,todayWsDel,todayWsRcv,todayStock,todayOrders,todayWsNames}=todayStats;
      const hasActivity=todayCut||todayWsDel||todayWsRcv||todayStock;
      return<div style={{marginBottom:18}}>
        <div className="section-title"><Icon path={II.clock} size={14}/> ملخص اليوم — {today}</div>
        <Card style={{marginBottom:0}}>
          {hasActivity?<div>
            <div style={{display:"grid",gridTemplateColumns:isMob?"repeat(2,1fr)":"repeat(4,1fr)",gap:10}}>
              <div style={{padding:"12px 14px",borderRadius:10,background:T.accent+"06",border:"1px solid "+T.accent+"15",display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:36,height:36,borderRadius:8,background:T.accent+"15",display:"flex",alignItems:"center",justifyContent:"center",color:T.accent,flexShrink:0}}><Icon path={II.scissors} size={18}/></div>
                <div><div style={{fontSize:FS+3,fontWeight:800,color:T.accent,lineHeight:1}}>{todayCut}</div><div style={{fontSize:FS-3,color:T.textMut}}>قطعة مقصوصة</div></div>
              </div>
              <div style={{padding:"12px 14px",borderRadius:10,background:"#8B5CF606",border:"1px solid #8B5CF615",display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:36,height:36,borderRadius:8,background:"#8B5CF615",display:"flex",alignItems:"center",justifyContent:"center",color:"#8B5CF6",flexShrink:0}}><Icon path={II.arrowUp} size={18}/></div>
                <div><div style={{fontSize:FS+3,fontWeight:800,color:"#8B5CF6",lineHeight:1}}>{todayWsDel}</div><div style={{fontSize:FS-3,color:T.textMut}}>تسليم ورشة</div></div>
              </div>
              <div style={{padding:"12px 14px",borderRadius:10,background:T.ok+"06",border:"1px solid "+T.ok+"15",display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:36,height:36,borderRadius:8,background:T.ok+"15",display:"flex",alignItems:"center",justifyContent:"center",color:T.ok,flexShrink:0}}><Icon path={II.arrowDown} size={18}/></div>
                <div><div style={{fontSize:FS+3,fontWeight:800,color:T.ok,lineHeight:1}}>{todayWsRcv}</div><div style={{fontSize:FS-3,color:T.textMut}}>استلام مصنع</div></div>
              </div>
              <div style={{padding:"12px 14px",borderRadius:10,background:"#05966906",border:"1px solid #05966915",display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:36,height:36,borderRadius:8,background:"#05966915",display:"flex",alignItems:"center",justifyContent:"center",color:"#059669",flexShrink:0}}><Icon path={II.package} size={18}/></div>
                <div><div style={{fontSize:FS+3,fontWeight:800,color:"#059669",lineHeight:1}}>{todayStock}</div><div style={{fontSize:FS-3,color:T.textMut}}>مخزن جاهز</div></div>
              </div>
            </div>
            {todayOrders.length>0&&<div style={{fontSize:FS-2,color:T.textSec,marginTop:10,padding:"6px 10px",borderRadius:6,background:T.bg}}>📋 {"أوامر قص: "+todayOrders.join("، ")}</div>}
            {todayWsNames.size>0&&<div style={{fontSize:FS-2,color:T.textSec,marginTop:4,padding:"6px 10px",borderRadius:6,background:T.bg}}>🏭 {"ورش: "+[...todayWsNames].join("، ")}</div>}
          </div>:<div style={{textAlign:"center",padding:"30px 20px",color:T.textMut}}>
            <div style={{fontSize:36,marginBottom:6}}>☕</div>
            <div style={{fontSize:FS,fontWeight:600}}>لا توجد حركات اليوم بعد</div>
            <div style={{fontSize:FS-2,color:T.textMut,marginTop:4}}>ابدأ يومك بإضافة أمر قص أو تسليم ورشة</div>
          </div>}
        </Card>
      </div>;
    })()}

    {/* ═══════════════════════════════════════════════════════════════
        3. PRODUCTION OVERVIEW (season stats — 6 KPI minimal tiles)
       ═══════════════════════════════════════════════════════════════ */}
    <div style={{marginBottom:18}}>
      <div className="section-title"><Icon path={II.chart} size={14}/> نظرة الإنتاج — الموسم ({orders.length} موديل)</div>
      <Card style={{marginBottom:0}}>
        <div style={{display:"grid",gridTemplateColumns:isMob?"repeat(2,1fr)":isTab?"repeat(3,1fr)":"repeat(6,1fr)",gap:10}}>
          <div onClick={()=>{const details=[];orders.forEach(o=>{const t=calcOrder(o);if(t.cutQty>0)details.push({model:o.modelNo,desc:o.modelDesc,qty:t.cutQty})});setCardPopup({title:"كمية القص",color:T.accent,details})}} className="minimal-stat" style={{padding:"14px 10px",borderRadius:10,border:"1px solid "+T.brd,textAlign:"center"}}>
            <div style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>كمية القص</div>
            <div style={{fontSize:isMob?20:24,fontWeight:800,color:T.accent,marginTop:4}}>{fmt(cutQ)}</div>
            <div style={{fontSize:FS-3,color:T.textMut}}>قطعة</div>
          </div>
          <div className="minimal-stat" style={{padding:"14px 10px",borderRadius:10,border:"1px solid "+T.brd,textAlign:"center",cursor:"default"}}>
            <div style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>جاهز بالمخزن</div>
            <div style={{fontSize:isMob?20:24,fontWeight:800,color:T.ok,marginTop:4}}>{fmt(delQ)}</div>
            <div style={{fontSize:FS-3,color:T.textMut}}>قطعة</div>
          </div>
          <div className="minimal-stat" style={{padding:"14px 10px",borderRadius:10,border:"1px solid "+T.brd,textAlign:"center",cursor:"default"}}>
            <div style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>رصيد المصنع</div>
            <div style={{fontSize:isMob?20:24,fontWeight:800,color:T.warn,marginTop:4}}>{fmt(cutQ-delQ)}</div>
            <div style={{fontSize:FS-3,color:T.textMut}}>قطعة</div>
          </div>
          <div onClick={()=>{const details=[];Object.entries(wsPieces).sort((a,b)=>b[1]-a[1]).forEach(([piece,qty])=>{details.push({model:piece,qty})});details.push({model:"✅ طقم كامل",qty:totalCompleteSets});details.push({model:"↗ تسليم ورشة",qty:totalDeliveredToWs});details.push({model:"↙ استلام مصنع",qty:totalReceivedFromWs});setCardPopup({title:"عند الورش",color:"#8B5CF6",details})}} className="minimal-stat" style={{padding:"14px 10px",borderRadius:10,border:"1px solid "+T.brd,textAlign:"center"}}>
            <div style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>عند الورش</div>
            <div style={{fontSize:isMob?20:24,fontWeight:800,color:"#8B5CF6",marginTop:4}}>{fmt(Math.max(0,inProdQty))}</div>
            <div style={{fontSize:FS-3,color:T.textMut}}>قطعة</div>
          </div>
          <div className="minimal-stat" style={{padding:"14px 10px",borderRadius:10,border:"1px solid "+T.brd,textAlign:"center",cursor:"default"}}>
            <div style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>تشطيب وتعبئة</div>
            <div style={{fontSize:isMob?20:24,fontWeight:800,color:"#F59E0B",marginTop:4}}>{fmt(finishingQty)}</div>
            <div style={{fontSize:FS-3,color:T.textMut}}>قطعة</div>
          </div>
          <div className="minimal-stat" style={{padding:"14px 10px",borderRadius:10,border:"1px solid "+T.brd,textAlign:"center",cursor:"default"}}>
            <div style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>الانجاز</div>
            <div style={{fontSize:isMob?20:24,fontWeight:800,color:comp>=80?T.ok:comp>=50?T.warn:T.err,marginTop:4}}>{comp+"%"}</div>
            <div style={{height:4,borderRadius:2,background:T.bg,marginTop:6,overflow:"hidden"}}><div style={{height:"100%",width:comp+"%",background:comp>=80?T.ok:comp>=50?T.warn:T.err,transition:"width 0.8s"}}/></div>
          </div>
        </div>
      </Card>
    </div>

    {/* ═══════════════════════════════════════════════════════════════
        4. FINANCIAL OVERVIEW (workshop accounts)
       ═══════════════════════════════════════════════════════════════ */}
    <div style={{marginBottom:18}}>
      <div className="section-title">💰 نظرة مالية — حسابات الورش</div>
      <Card style={{marginBottom:0}}>
        <div style={{display:"grid",gridTemplateColumns:isMob?"repeat(2,1fr)":"repeat(4,1fr)",gap:12}}>
          <div onClick={()=>{const ws=(data.workshops||[]).filter(w=>!wsIsInternal(w.type));const items=ws.map(w=>{const a=wsAccounts(w.name);return{name:w.name,qty:r2(a.due+a.totalPurchase)}}).filter(x=>x.qty!==0).sort((a,b)=>b.qty-a.qty);setWsAccPopup({title:"💰 مستحق للورش",color:T.accent,items,total:r2(wsDue+wsPurchase)})}} className="minimal-stat" style={{padding:14,borderRadius:12,border:"1px solid "+T.brd,textAlign:"center"}}>
            <div style={{fontSize:FS-2,color:T.textSec,fontWeight:600,marginBottom:4}}>مستحق للورش</div>
            <div style={{fontSize:isMob?16:20,fontWeight:800,color:T.accent}}>{fmt(r2(wsDue+wsPurchase))}</div>
            <div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>ج.م</div>
          </div>
          {(()=>{const ws=(data.workshops||[]).filter(w=>!wsIsInternal(w.type));let totalLimit=0;const items=ws.map(w=>{const a=wsAccounts(w.name);const pct=w.payPercent||60;const lim=r2((a.due+a.totalPurchase)*(pct/100));totalLimit+=lim;return{name:w.name+" ("+pct+"%)",qty:lim}}).filter(x=>x.qty>0).sort((a,b)=>b.qty-a.qty);
            return<div onClick={()=>setWsAccPopup({title:"📈 اجمالي حد النسبة",color:"#8B5CF6",items,total:r2(totalLimit)})} className="minimal-stat" style={{padding:14,borderRadius:12,border:"1px solid "+T.brd,textAlign:"center"}}>
              <div style={{fontSize:FS-2,color:T.textSec,fontWeight:600,marginBottom:4}}>حد النسبة</div>
              <div style={{fontSize:isMob?16:20,fontWeight:800,color:"#8B5CF6"}}>{fmt(r2(totalLimit))}</div>
              <div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>ج.م</div>
            </div>})()}
          <div onClick={()=>{const ws=(data.workshops||[]).filter(w=>!wsIsInternal(w.type));const items=ws.map(w=>{const a=wsAccounts(w.name);return{name:w.name,qty:r2(a.totalPaid)}}).filter(x=>x.qty>0).sort((a,b)=>b.qty-a.qty);setWsAccPopup({title:"💳 اجمالي المدفوع",color:T.warn,items,total:r2(wsPaid)})}} className="minimal-stat" style={{padding:14,borderRadius:12,border:"1px solid "+T.brd,textAlign:"center"}}>
            <div style={{fontSize:FS-2,color:T.textSec,fontWeight:600,marginBottom:4}}>المدفوع</div>
            <div style={{fontSize:isMob?16:20,fontWeight:800,color:T.warn}}>{fmt(r2(wsPaid))}</div>
            <div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>ج.م</div>
          </div>
          <div onClick={()=>{const ws=(data.workshops||[]).filter(w=>!wsIsInternal(w.type));const items=ws.map(w=>{const a=wsAccounts(w.name);const bal=a.due+a.totalPurchase-a.totalPaid;return{name:w.name,qty:r2(bal)}}).filter(x=>x.qty!==0).sort((a,b)=>b.qty-a.qty);setWsAccPopup({title:"📊 رصيد الورش",color:wsBalance>0?T.err:T.ok,items,total:r2(wsBalance)})}} className="minimal-stat" style={{padding:14,borderRadius:12,border:"1px solid "+T.brd,textAlign:"center"}}>
            <div style={{fontSize:FS-2,color:T.textSec,fontWeight:600,marginBottom:4}}>الرصيد</div>
            <div style={{fontSize:isMob?16:20,fontWeight:800,color:wsBalance>0?T.err:T.ok}}>{fmt(r2(wsBalance))}</div>
            <div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>ج.م</div>
          </div>
        </div>
      </Card>
    </div>

    {/* ═══════════════════════════════════════════════════════════════
        5. VISUAL ANALYTICS (pie chart + bar chart)
       ═══════════════════════════════════════════════════════════════ */}
    <div style={{marginBottom:18}}>
      <div className="section-title"><Icon path={II.chart} size={14}/> التحليلات البصرية</div>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:14}}>
        <Card title="توزيع الحالات" style={{marginBottom:0}}>{pieData.length>0?<div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
          <ResponsiveContainer width={isMob?"100%":160} height={160}><PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={68} paddingAngle={3} dataKey="value" stroke="none">{pieData.map((d,i)=><Cell key={i} fill={d.fill}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer>
          <div style={{flex:1,minWidth:120}}>{pieData.map((d,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",fontSize:FS}}><span style={{width:12,height:12,borderRadius:4,background:d.fill,flexShrink:0}}/><span style={{color:T.textSec,flex:1}}>{d.name}</span><span style={{fontWeight:700}}>{d.value}</span></div>)}</div>
        </div>:<p style={{color:T.textSec,textAlign:"center",padding:30}}>لا توجد بيانات</p>}</Card>
        <Card title="أداء الورش" style={{marginBottom:0}}>{wsChartData.length>0?<div>
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
    </div>

    {/* ═══════════════════════════════════════════════════════════════
        6. PERFORMANCE & METRICS (heatmap + speedometer)
       ═══════════════════════════════════════════════════════════════ */}
    <div style={{marginBottom:18}}>
      <div className="section-title"><Icon path={II.zap} size={14}/> أداء الموسم</div>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"2fr 1fr",gap:14}}>
        <Card title="📅 خريطة اسبوعية للانتاج" style={{marginBottom:0}}>
          {(()=>{const days=[];for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);days.push(d.toISOString().split("T")[0])}
            const dayData=days.map(d=>{let ops=0;orders.forEach(o=>{if(o.date===d)ops+=calcOrder(o).cutQty;(o.workshopDeliveries||[]).forEach(wd=>{if(wd.date===d)ops+=Number(wd.qty)||0;(wd.receives||[]).forEach(r=>{if(r.date===d)ops+=Number(r.qty)||0})});(o.deliveries||[]).forEach(dl=>{if(dl.date===d)ops+=Number(dl.qty)||0})});return{date:d,ops}});
            const maxOps=Math.max(1,...dayData.map(x=>x.ops));
            
            return<div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:6}}>{dayData.map(d=>{const pct=d.ops/maxOps;const bg=d.ops===0?"#F1F5F9":pct>0.7?"#059669":pct>0.3?"#F59E0B":"#FCA5A5";
              return<div key={d.date} style={{textAlign:"center",padding:10,borderRadius:10,background:bg+"18",border:"1px solid "+bg+"30"}}>
                <div style={{fontSize:FS-2,color:T.textSec}}>{dayName(d.date)}</div>
                <div style={{fontSize:FS+2,fontWeight:800,color:bg==="F1F5F9"?T.textMut:bg}}>{d.ops}</div>
                <div style={{fontSize:FS-3,color:T.textMut}}>{d.date.slice(5)}</div>
              </div>})}</div>})()}
        </Card>
        <Card title="🏎 مؤشر السرعة" style={{marginBottom:0}}>
          {(()=>{const pct=comp;const color=pct>=80?"#10B981":pct>=50?"#F59E0B":"#EF4444";
            return<div style={{textAlign:"center"}}>
              <svg width={isMob?200:240} height={isMob?120:140} viewBox="0 0 260 150">
                <path d="M30 140 A100 100 0 0 1 230 140" fill="none" stroke="#E2E8F0" strokeWidth="18" strokeLinecap="round"/>
                <path d="M30 140 A100 100 0 0 1 230 140" fill="none" stroke={color} strokeWidth="18" strokeLinecap="round" strokeDasharray={`${pct*3.14} 314`}/>
                <text x="130" y="110" textAnchor="middle" fill={color} fontSize="36" fontWeight="800" fontFamily="Cairo">{pct+"%"}</text>
                <text x="130" y="135" textAnchor="middle" fill="#94A3B8" fontSize="12" fontFamily="Cairo">{pct>=80?"ممتاز 🔥":pct>=50?"جيد ⚡":"بطيء 🐢"}</text>
              </svg>
              <div style={{fontSize:FS-2,color:T.textSec,marginTop:4}}>{"قص: "+fmt(cutQ)+" | جاهز: "+fmt(delQ)}</div>
            </div>})()}
        </Card>
      </div>
    </div>

    {/* ═══════════════════════════════════════════════════════════════
        7. WORKSHOP PERFORMANCE (pressure + timer + race)
       ═══════════════════════════════════════════════════════════════ */}
    <div style={{marginBottom:18}}>
      <div className="section-title"><Icon path={II.factory} size={14}/> أداء الورش</div>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:14,marginBottom:14}}>
        <Card title="📊 مقياس الضغط على الورش" style={{marginBottom:0}}>
          {(()=>{const wsList=(data.workshops||[]).filter(w=>!wsIsInternal(w.type));
            const wsLoad=wsList.map(w=>{let del=0,rcv=0;orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===w.name).forEach(wd=>{del+=Number(wd.qty)||0;(wd.receives||[]).forEach(r=>{rcv+=Number(r.qty)||0})})});const pending=del-rcv;const pct=del?Math.round((pending/del)*100):0;return{name:w.name,del,rcv,pending,pct}}).filter(w=>w.del>0).sort((a,b)=>b.pct-a.pct);
            return wsLoad.length>0?<div style={{display:"flex",flexDirection:"column",gap:8}}>{wsLoad.map(w=><div key={w.name}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:FS-1,marginBottom:2}}><span style={{fontWeight:700}}>{w.name}</span><span style={{color:w.pct>60?T.err:w.pct>30?T.warn:T.ok,fontWeight:700}}>{w.pending+" متبقي ("+w.pct+"%)"}{w.pct>60?" ⚠️":""}</span></div>
              <div style={{height:8,borderRadius:4,background:T.bg}}><div style={{height:"100%",borderRadius:4,background:w.pct>60?T.err:w.pct>30?T.warn:T.ok,width:w.pct+"%",transition:"width 0.5s"}}/></div>
            </div>)}</div>:<div style={{textAlign:"center",color:T.textMut,padding:20}}>لا توجد بيانات</div>})()}
        </Card>
        <Card title="⏱ أيام بدون حركة" style={{marginBottom:0}}>
          {(()=>{const now=new Date();const wsList=(data.workshops||[]).filter(w=>!wsIsInternal(w.type));
            const wsTimers=wsList.map(w=>{let lastAct=null;orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===w.name).forEach(wd=>{if(!lastAct||wd.date>lastAct)lastAct=wd.date;(wd.receives||[]).forEach(r=>{if(!lastAct||r.date>lastAct)lastAct=r.date})})});const days=lastAct?Math.floor((now-new Date(lastAct))/(1000*60*60*24)):null;return{name:w.name,days,lastAct}}).filter(w=>w.lastAct).sort((a,b)=>b.days-a.days);
            return wsTimers.length>0?<div style={{display:"flex",flexDirection:"column",gap:6}}>{wsTimers.map(w=><div key={w.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",borderRadius:8,background:w.days>7?T.err+"08":w.days>3?T.warn+"08":T.ok+"08"}}>
              <span style={{fontWeight:700,fontSize:FS}}>{w.name}</span>
              <span style={{fontWeight:800,fontSize:FS,color:w.days>7?T.err:w.days>3?T.warn:T.ok}}>{w.days===0?"اليوم ✓":w.days+" يوم"}{w.days>7?" 🔴":""}</span>
            </div>)}</div>:<div style={{textAlign:"center",color:T.textMut,padding:20}}>لا توجد بيانات</div>})()}
        </Card>
      </div>

      <Card title="🏁 معدل انجاز الورش" style={{marginBottom:14}}>
        {(()=>{const wsRace=Object.values(wsMap).map(w=>({...w,pct:w.delivered?Math.round((w.received/w.delivered)*100):0})).sort((a,b)=>b.pct-a.pct);
          return wsRace.length>0?<div style={{display:"flex",flexDirection:"column",gap:10}}>{wsRace.map((w,i)=><div key={w.name}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:FS,marginBottom:3}}>
              <span style={{fontWeight:700}}>{(i===0?"🥇 ":i===1?"🥈 ":i===2?"🥉 ":(i+1)+". ")+w.name}</span>
              <span style={{fontWeight:800,color:w.pct>=80?T.ok:w.pct>=50?T.warn:T.err}}>{w.pct+"%"}</span>
            </div>
            <div style={{height:14,borderRadius:7,background:T.bg,overflow:"hidden",position:"relative"}}>
              <div style={{height:"100%",borderRadius:7,background:w.pct>=80?"linear-gradient(90deg,#10B981,#059669)":w.pct>=50?"linear-gradient(90deg,#F59E0B,#D97706)":"linear-gradient(90deg,#EF4444,#DC2626)",width:w.pct+"%",transition:"width 1s ease",position:"relative"}}>
                <span style={{position:"absolute",left:6,top:0,fontSize:9,lineHeight:"14px",color:"#fff",fontWeight:700}}>{w.received+"/"+w.delivered}</span>
              </div>
            </div>
          </div>)}</div>:<div style={{textAlign:"center",color:T.textMut,padding:20}}>لا توجد بيانات</div>})()}
      </Card>

      {/* Top 3 workshops */}
      {(()=>{const wsList=(data.workshops||[]).filter(w=>!wsIsInternal(w.type));
        const rated=wsList.map(w=>{const score=calcWsRating(w.name,orders);const tier=getWsPartnershipTier(w.name,orders);return{name:w.name,type:w.type,rating:w.rating||0,score,owner:w.owner||"",tier}}).filter(w=>w.score!==null).sort((a,b)=>b.score-a.score).slice(0,3);
        if(rated.length===0)return null;
        const medals=["🥇","🥈","🥉"];const colors=["#F59E0B","#94A3B8","#CD7F32"];
        return<Card title="⭐ أعلى 3 ورش تقييماً" style={{marginBottom:0}}>
          <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"repeat(3,1fr)",gap:12}}>
            {rated.map((w,i)=><div key={w.name} style={{padding:16,borderRadius:14,background:i===0?"linear-gradient(135deg,#FEF3C7,#FDE68A20)":T.bg,border:"2px solid "+(i===0?"#F59E0B40":T.brd),textAlign:"center",position:"relative"}}>
              <div style={{fontSize:32,marginBottom:6}}>{medals[i]}</div>
              <div style={{fontSize:FS+1,fontWeight:800,color:T.text}}>{w.name}</div>
              {w.owner&&<div style={{fontSize:FS-2,color:T.textMut,marginTop:2}}>{w.owner}</div>}
              <div style={{fontSize:28,fontWeight:900,color:colors[i],marginTop:8}}>{w.score}<span style={{fontSize:FS-1,fontWeight:600,color:T.textMut}}>/10</span></div>
              <div style={{display:"flex",justifyContent:"center",gap:2,marginTop:6}}>
                {Array.from({length:10}).map((_,s)=><div key={s} style={{width:8,height:8,borderRadius:"50%",background:s<Math.round(w.score)?colors[i]:T.brd}}/>)}
              </div>
              <div style={{fontSize:FS-2,color:T.textSec,marginTop:6}}>{wsTypeInfo(w.type).icon+" "+wsTypeInfo(w.type).key}</div>
              {/* V15.44: Partnership tier badge — separate from performance rating */}
              <div title={"إجمالي ما سلّمته الورشة: "+fmt(w.tier.totalRcv)+" قطعة"} style={{marginTop:8,padding:"4px 10px",borderRadius:20,background:w.tier.color+"15",border:"1px solid "+w.tier.color+"35",fontSize:FS-2,fontWeight:700,color:w.tier.color,display:"inline-flex",alignItems:"center",gap:4}}>
                <span>{w.tier.icon}</span>
                <span>{w.tier.label}</span>
                <span style={{fontSize:FS-3,opacity:0.8,fontWeight:600}}>· {fmt(w.tier.totalRcv)} قطعة</span>
              </div>
            </div>)}
          </div>
        </Card>})()}
    </div>

    {/* ═══════════════════════════════════════════════════════════════
        8. ATTENTION NEEDED (delays + waste)
       ═══════════════════════════════════════════════════════════════ */}
    {(()=>{
      const now=new Date();
      const delayed=orders.filter(o=>{if(o.status==="تم التسليم لمخزن الجاهز")return false;let ld=o.date;(o.workshopDeliveries||[]).forEach(wd=>{if(wd.date>ld)ld=wd.date;(wd.receives||[]).forEach(r=>{if(r.date>ld)ld=r.date})});(o.deliveries||[]).forEach(d=>{if(d.date>ld)ld=d.date});return Math.floor((now-new Date(ld))/(1000*60*60*24))>7}).map(o=>{let ld=o.date;(o.workshopDeliveries||[]).forEach(wd=>{if(wd.date>ld)ld=wd.date;(wd.receives||[]).forEach(r=>{if(r.date>ld)ld=r.date})});(o.deliveries||[]).forEach(d=>{if(d.date>ld)ld=d.date});return{...o,ageDays:Math.floor((now-new Date(ld))/(1000*60*60*24))}}).sort((a,b)=>b.ageDays-a.ageDays);

      const wasteRows=[];orders.forEach(o=>{const t=calcOrder(o);const wds=o.workshopDeliveries||[];
        const pieces=o.orderPieces||[];
        if(pieces.length>0){pieces.forEach(p=>{const rcv=wds.filter(wd=>wd.garmentType===p).reduce((s,wd)=>(wd.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0)+s,0);if(rcv>0&&rcv<t.cutQty)wasteRows.push({modelNo:o.modelNo,piece:p,cut:t.cutQty,rcv,waste:t.cutQty-rcv,pct:Math.round(((t.cutQty-rcv)/t.cutQty)*100)})})}
        else{const rcv=wds.reduce((s,wd)=>(wd.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0)+s,0);if(rcv>0&&rcv<t.cutQty)wasteRows.push({modelNo:o.modelNo,piece:"عام",cut:t.cutQty,rcv,waste:t.cutQty-rcv,pct:Math.round(((t.cutQty-rcv)/t.cutQty)*100)})}
      });wasteRows.sort((a,b)=>b.waste-a.waste);
      const totalWaste=wasteRows.reduce((s,w)=>s+w.waste,0);const totalCut=wasteRows.reduce((s,w)=>s+w.cut,0);const totalRcv=wasteRows.reduce((s,w)=>s+w.rcv,0);const avgPct=totalCut?Math.round(((totalCut-totalRcv)/totalCut)*100):0;
      const printWaste=()=>{let h="<h2 style='text-align:center'>📉 تقرير الفاقد</h2><table><thead><tr><th>الموديل</th><th>القطعة</th><th>القص</th><th>المستلم</th><th>الفاقد</th><th>النسبة</th></tr></thead><tbody>";wasteRows.forEach(w=>{h+="<tr><td style='font-weight:700'>"+w.modelNo+"</td><td>"+w.piece+"</td><td>"+w.cut+"</td><td style='color:#10B981'>"+w.rcv+"</td><td style='color:#EF4444;font-weight:700'>"+w.waste+"</td><td>"+ w.pct+"%</td></tr>"});h+="<tr style='background:#FEF2F2;font-weight:800'><td colspan='2'>الاجمالي</td><td>"+fmt(totalCut)+"</td><td style='color:#10B981'>"+fmt(totalRcv)+"</td><td style='color:#EF4444'>"+fmt(totalWaste)+"</td><td>"+avgPct+"%</td></tr></tbody></table><div style='margin-top:12px;text-align:center;font-size:10px;color:#94A3B8;border-top:1px solid #E2E8F0;padding-top:8px'>CLARK Factory Management</div>";printPage("تقرير الفاقد",h)};

      if(delayed.length===0&&wasteRows.length===0)return null;

      return<div style={{marginBottom:18}}>
        <div className="section-title" style={{color:T.err}}><Icon path={II.alert} size={14}/> تحتاج انتباهك</div>
        {delayed.length>0&&<Card title={"🚨 لوحة المتأخرات ("+delayed.length+")"} style={{marginBottom:14}}>
          <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["الموديل","الوصف","الحالة","آخر حركة","أيام التأخر"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
          <tbody>{delayed.map(o=><tr key={o.id} style={{cursor:"pointer",background:o.ageDays>14?T.err+"06":""}} onClick={()=>goD(o.id)}>
            <td style={TDB}>{o.modelNo}</td><td style={TD}>{o.modelDesc}</td><td style={TD}><Badge t={o.status} cards={statusCards}/></td>
            <td style={TD}>{(()=>{let ld=o.date;(o.workshopDeliveries||[]).forEach(wd=>{if(wd.date>ld)ld=wd.date;(wd.receives||[]).forEach(r=>{if(r.date>ld)ld=r.date})});(o.deliveries||[]).forEach(d=>{if(d.date>ld)ld=d.date});return ld})()}</td>
            <td style={{...TDB,color:T.err,fontSize:FS+1}}>{o.ageDays+" يوم 🔴"}</td>
          </tr>)}</tbody></table></div>
        </Card>}

        {wasteRows.length>0&&<Card title={"📉 تقرير الفاقد ("+wasteRows.length+")"} style={{marginBottom:0}} extra={<Btn small onClick={printWaste} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨</Btn>}>
          <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["الموديل","القطعة","القص","المستلم","الفاقد","النسبة"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
          <tbody>{wasteRows.map((w,i)=><tr key={i}><td style={TDB}>{w.modelNo}</td><td style={{...TD,color:"#8B5CF6",fontWeight:600}}>{w.piece}</td><td style={TDB}>{w.cut}</td><td style={{...TDB,color:T.ok}}>{w.rcv}</td><td style={{...TDB,color:T.err}}>{w.waste}</td><td style={{...TDB,color:w.pct>5?T.err:T.warn}}>{w.pct+"%"}</td></tr>)}
          <tr style={{background:T.err+"06"}}><td colSpan={2} style={{...TD,fontWeight:800}}>الاجمالي</td><td style={TDB}>{fmt(totalCut)}</td><td style={{...TDB,color:T.ok}}>{fmt(totalRcv)}</td><td style={{...TDB,color:T.err,fontSize:FS+1}}>{fmt(totalWaste)}</td><td style={{...TDB,color:T.err}}>{avgPct+"%"}</td></tr>
          </tbody></table></div>
        </Card>}
      </div>;
    })()}

    {/* ═══════════════════════════════════════════════════════════════
        9. WORKSHOP COMPARISON (detailed table)
       ═══════════════════════════════════════════════════════════════ */}
    <div style={{marginBottom:18}}>
      <div className="section-title"><Icon path={II.chart} size={14}/> تقرير مقارنة الورش</div>
      <Card style={{marginBottom:0}}>
        {(()=>{const wsList=(data.workshops||[]).filter(w=>!wsIsInternal(w.type));
          const wsComp=wsList.map(w=>{let del=0,rcv=0,waste=0,totalAmt=0;
            orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===w.name).forEach(wd=>{del+=Number(wd.qty)||0;(wd.receives||[]).forEach(r=>{rcv+=Number(r.qty)||0;totalAmt+=r2((Number(r.qty)||0)*(Number(r.price)||0))})})});
            waste=del-rcv;const wastePct=del?Math.round((waste/del)*100):0;
            const acc=wsAccounts(w.name);
            return{name:w.name,type:w.type,del,rcv,waste,wastePct,totalAmt,balance:acc.balance}
          }).sort((a,b)=>b.rcv-a.rcv);
          const tDel=wsComp.reduce((s,w)=>s+w.del,0);const tRcv=wsComp.reduce((s,w)=>s+w.rcv,0);const tWaste=wsComp.reduce((s,w)=>s+w.waste,0);const tAmt=wsComp.reduce((s,w)=>s+w.totalAmt,0);const tBal=wsComp.reduce((s,w)=>s+w.balance,0);
          const printComp=()=>{let h="<h2 style='text-align:center'>📊 تقرير مقارنة الورش</h2><table><thead><tr><th>الورشة</th><th>النوع</th><th>تسليم</th><th>استلام</th><th>فاقد</th><th>نسبة</th><th>المستحق</th><th>رصيد حالي</th></tr></thead><tbody>";wsComp.forEach(w=>{h+="<tr><td style='font-weight:700'>"+w.name+"</td><td>"+wsTypeInfo(w.type).key+"</td><td>"+w.del+"</td><td style='color:#10B981'>"+w.rcv+"</td><td style='color:#EF4444'>"+w.waste+"</td><td>"+w.wastePct+"%</td><td>"+fmt(r2(w.totalAmt))+"</td><td style='color:"+(w.balance>0?"#EF4444":"#10B981")+"'>"+fmt(r2(w.balance))+"</td></tr>"});h+="<tr style='background:#EFF6FF;font-weight:800'><td colspan='2'>الاجمالي</td><td>"+fmt(tDel)+"</td><td style='color:#10B981'>"+fmt(tRcv)+"</td><td style='color:#EF4444'>"+fmt(tWaste)+"</td><td>"+(tDel?Math.round((tWaste/tDel)*100):0)+"%</td><td>"+fmt(r2(tAmt))+"</td><td style='color:"+(tBal>0?"#EF4444":"#10B981")+"'>"+fmt(r2(tBal))+"</td></tr></tbody></table><div style='margin-top:12px;text-align:center;font-size:10px;color:#94A3B8;border-top:1px solid #E2E8F0;padding-top:8px'>CLARK Factory Management</div>";printPage("تقرير مقارنة الورش",h)};
          return wsComp.length>0?<div>
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}><Btn small onClick={printComp} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨 طباعة</Btn></div>
            <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["الورشة","النوع","تسليم","استلام","فاقد","نسبة","المستحق","الرصيد"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
          <tbody>{wsComp.map(w=><tr key={w.name}><td style={{...TD,fontWeight:700}}>{w.name}</td><td style={{...TD,fontSize:FS-2}}>{wsTypeInfo(w.type).icon+" "+wsTypeInfo(w.type).key}</td><td style={TDB}>{w.del}</td><td style={{...TDB,color:T.ok}}>{w.rcv}</td><td style={{...TDB,color:w.waste>0?T.err:T.ok}}>{w.waste}</td><td style={{...TDB,color:w.wastePct>5?T.err:T.warn}}>{w.wastePct+"%"}</td><td style={{...TDB,color:T.accent}}>{fmt(r2(w.totalAmt))}</td><td style={{...TDB,color:w.balance>0?T.err:T.ok}}>{fmt(r2(w.balance))}</td></tr>)}
          <tr style={{background:T.accent+"06"}}><td colSpan={2} style={{...TD,fontWeight:800}}>الاجمالي</td><td style={TDB}>{fmt(tDel)}</td><td style={{...TDB,color:T.ok}}>{fmt(tRcv)}</td><td style={{...TDB,color:T.err}}>{fmt(tWaste)}</td><td style={{...TDB,color:T.err}}>{(tDel?Math.round((tWaste/tDel)*100):0)+"%"}</td><td style={{...TDB,color:T.accent}}>{fmt(r2(tAmt))}</td><td style={{...TDB,color:tBal>0?T.err:T.ok}}>{fmt(r2(tBal))}</td></tr>
          </tbody></table></div></div>:<div style={{textAlign:"center",color:T.textMut,padding:20}}>لا توجد ورش</div>})()}
      </Card>
    </div>

    {/* ═══════════════════════════════════════════════════════════════
        10. SYSTEM INFO (database size)
       ═══════════════════════════════════════════════════════════════ */}
    <div style={{marginBottom:8}}>
      <div className="section-title"><Icon path={II.database} size={14}/> معلومات النظام</div>
      <Card style={{marginBottom:0}}>
        {(()=>{
          const _cfg={...data};delete _cfg.custDeliverySessions;delete _cfg.packages;delete _cfg.tasks;delete _cfg.stickyNotes;delete _cfg.inventoryAudits;delete _cfg.orders;
          const _sal={custDeliverySessions:data.custDeliverySessions||[],packages:data.packages||[]};
          const _tsk={tasks:data.tasks||[],stickyNotes:data.stickyNotes||[],inventoryAudits:data.inventoryAudits||[]};
          const cSize=new Blob([JSON.stringify(_cfg)]).size;
          const sSize=new Blob([JSON.stringify(_sal)]).size;
          const tSize=new Blob([JSON.stringify(_tsk)]).size;
          const oSize=new Blob([JSON.stringify(data.orders||[])]).size;
          const total=cSize+sSize+tSize+oSize;
          const fmtSize=(b)=>b<1024?b+" B":b<1024*1024?(b/1024).toFixed(1)+" KB":(b/(1024*1024)).toFixed(2)+" MB";
          const docs=[
            {name:"⚙️ Config",size:cSize,items:[(data.workshops||[]).length+" ورشة",(data.customers||[]).length+" عميل",(data.fabrics||[]).length+" خامة"],color:T.accent},
            {name:"📦 Orders",size:oSize,items:[orders.length+" أمر قص"],color:"#8B5CF6"},
            {name:"💰 Sales",size:sSize,items:[(data.custDeliverySessions||[]).length+" توزيعة",(data.packages||[]).length+" كرتونة"],color:"#10B981"},
            {name:"📋 Tasks",size:tSize,items:[(data.tasks||[]).length+" مهمة",(data.stickyNotes||[]).length+" ملاحظة"],color:"#F59E0B"}
          ];
          return<div>
            <div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"repeat(4,1fr)",gap:10,marginBottom:10}}>
              {docs.map(d=><div key={d.name} style={{padding:12,borderRadius:10,background:d.color+"06",border:"1px solid "+d.color+"15"}}>
                <div style={{fontSize:FS-1,fontWeight:700,color:d.color,marginBottom:4}}>{d.name}</div>
                <div style={{fontSize:FS+1,fontWeight:800,color:T.text}}>{fmtSize(d.size)}</div>
                <div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>{d.items.join(" • ")}</div>
              </div>)}
            </div>
            <div style={{padding:"10px 14px",borderRadius:10,background:T.bg,border:"1px solid "+T.brd,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:FS-1,color:T.textSec,fontWeight:600}}>📊 إجمالي حجم البيانات</span>
              <span style={{fontSize:FS+2,fontWeight:800,color:T.accent}}>{fmtSize(total)}</span>
            </div>
          </div>;
        })()}
      </Card>
    </div>
  </div>
}

/* V16.12: SmartAlertsSection removed — relied on alerts.js which used a
   schema that doesn't match real CLARK orders/treasury data. The function
   silently rendered nothing in practice. The alerts bell in App.jsx
   covers the same cases correctly. */

/* ══ DB ══ */
