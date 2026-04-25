/* ═══════════════════════════════════════════════════════════════
   CLARK — Smart Alerts Engine (V16.2)
   
   Analyzes current data to surface urgent issues that need attention TODAY.
   Categories: workshops, customers, employees, orders, treasury.
   
   Each alert has:
     - severity: "critical" | "high" | "medium" | "info"
     - category: determines icon and grouping
     - title, message, action (what to do)
     - link: where to navigate to resolve
   
   All computation is local — no external calls.
   ═══════════════════════════════════════════════════════════════ */

const DAY_MS=86400000;
const today=()=>new Date().toISOString().split("T")[0];
const daysBetween=(d1,d2)=>{
  if(!d1||!d2)return 0;
  return Math.floor((new Date(d2)-new Date(d1))/DAY_MS);
};

const SEVERITY_ORDER={critical:0,high:1,medium:2,info:3};

/* Compute all alerts for the current data state */
export function computeAlerts(data){
  const alerts=[];
  const now=today();
  const orders=data?.orders||[];
  const workshops=data?.workshops||[];
  const customers=data?.customers||[];
  const employees=(data?.employees||[]).filter(e=>!e.inactive);
  const treasury=data?.treasury||[];
  const custPayments=data?.custPayments||[];
  const hrWeeks=data?.hrWeeks||[];

  /* ══════════════════════════════════════════════
     1. LATE WORKSHOPS — delivery date passed
     ══════════════════════════════════════════════ */
  orders.forEach(o=>{
    if(o.status==="closed"||o.status==="cancelled")return;
    if(!o.expectedDeliveryDate)return;
    const daysLate=daysBetween(o.expectedDeliveryDate,now);
    if(daysLate<=0)return;
    /* Group by workshop if assigned */
    (o.workshopDeliveries||[]).forEach(wd=>{
      if(!wd.wsName)return;
      const delivered=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);
      const ordered=(wd.pieces||[]).reduce((s,p)=>s+(Number(p.qty)||0),0);
      const remaining=ordered-delivered;
      if(remaining<=0)return;/* already done */
      const severity=daysLate>=14?"critical":daysLate>=7?"high":"medium";
      alerts.push({
        id:"late_ws_"+o.id+"_"+wd.wsName,
        severity,
        category:"workshop",
        icon:"🏭",
        title:wd.wsName+" متأخرة",
        message:"أوردر "+(o.modelNo||o.id)+": متبقي "+remaining+" قطعة، متأخر "+daysLate+" يوم",
        action:"تابع الورشة أو راجع التعهد",
        link:{tab:"external",wsName:wd.wsName,orderId:o.id},
        date:o.expectedDeliveryDate
      });
    });
  });

  /* ══════════════════════════════════════════════
     2. UNCUT ORDERS near delivery
     ══════════════════════════════════════════════ */
  orders.forEach(o=>{
    if(o.status==="closed"||o.status==="cancelled")return;
    if(!o.expectedDeliveryDate)return;
    const totalCut=(o.cuts||[]).reduce((s,c)=>s+(Number(c.cutQty)||0),0);
    if(totalCut>0)return;/* already cut */
    const daysToDeliver=daysBetween(now,o.expectedDeliveryDate);
    if(daysToDeliver>14)return;/* far away */
    if(daysToDeliver<0)return;/* already overdue — covered by workshop alert */
    const severity=daysToDeliver<=3?"critical":daysToDeliver<=7?"high":"medium";
    alerts.push({
      id:"uncut_"+o.id,
      severity,
      category:"order",
      icon:"✂️",
      title:"أوردر "+(o.modelNo||o.id)+" لم يُقص",
      message:"التسليم خلال "+daysToDeliver+" يوم — وقيمة القص = 0",
      action:"ابدأ عملية القص قبل التأخير",
      link:{tab:"details",orderId:o.id},
      date:o.expectedDeliveryDate
    });
  });

  /* ══════════════════════════════════════════════
     3. CUSTOMERS with large outstanding balance
     ══════════════════════════════════════════════ */
  customers.forEach(c=>{
    if(c.archived)return;
    /* Compute outstanding balance from orders */
    const custOrders=orders.filter(o=>o.custId===c.id&&o.status!=="cancelled");
    let totalValue=0;
    custOrders.forEach(o=>{
      const pieces=(o.orderDetails?.pieces||[]).reduce((s,p)=>s+(Number(p.qty)||0),0);
      const price=Number(o.sellPrice)||0;
      totalValue+=pieces*price;
    });
    const discPct=Number(c.discount)||0;
    const afterDisc=totalValue-(totalValue*discPct/100);
    const totalPaid=custPayments.filter(p=>p.custId===c.id).reduce((s,p)=>s+(Number(p.amount)||0),0);
    const balance=Math.round(afterDisc-totalPaid);
    if(balance<=5000)return;/* small balance, skip */
    /* Check payment recency */
    const lastPayment=custPayments.filter(p=>p.custId===c.id).sort((a,b)=>(b.date||"").localeCompare(a.date||""))[0];
    const daysSincePayment=lastPayment?daysBetween(lastPayment.date,now):9999;
    if(daysSincePayment<30)return;/* paid recently */
    const severity=balance>=50000&&daysSincePayment>=60?"critical":
                   balance>=20000&&daysSincePayment>=45?"high":"medium";
    alerts.push({
      id:"cust_bal_"+c.id,
      severity,
      category:"customer",
      icon:"💰",
      title:c.name,
      message:"رصيد مستحق: "+balance.toLocaleString()+" ج • آخر دفعة منذ "+(daysSincePayment>=9999?"أبداً":daysSincePayment+" يوم"),
      action:"تواصل مع العميل لسداد المستحقات",
      link:{tab:"custDeliver",custId:c.id}
    });
  });

  /* ══════════════════════════════════════════════
     4. EMPLOYEES with high advance usage
     ══════════════════════════════════════════════ */
  const openWeek=hrWeeks.find(w=>w.status!=="closed");
  if(openWeek){
    employees.forEach(e=>{
      const empAdvances=(treasury||[]).filter(t=>
        t.empId===e.id&&t.type==="out"&&
        (t.sourceType==="hr_advance"||t.category==="مرتبات")&&
        t.date>=openWeek.weekStart&&t.date<=openWeek.weekEnd
      ).reduce((s,t)=>s+(Number(t.amount)||0),0);
      const weeklySalary=Number(e.weeklySalary)||0;
      if(weeklySalary===0)return;
      const advPct=(empAdvances/weeklySalary)*100;
      if(advPct<80)return;
      const severity=advPct>=100?"critical":advPct>=90?"high":"medium";
      alerts.push({
        id:"emp_adv_"+e.id,
        severity,
        category:"employee",
        icon:"👤",
        title:e.name,
        message:"سحب سلف "+Math.round(empAdvances).toLocaleString()+" ج ("+Math.round(advPct)+"% من الراتب)",
        action:"راجع السلف قبل إقفال الأسبوع",
        link:{tab:"hr",empId:e.id}
      });
    });
  }

  /* ══════════════════════════════════════════════
     5. ORDERS nearly complete but stuck
     ══════════════════════════════════════════════ */
  orders.forEach(o=>{
    if(o.status==="closed"||o.status==="cancelled")return;
    const totalCut=(o.cuts||[]).reduce((s,c)=>s+(Number(c.cutQty)||0),0);
    if(totalCut===0)return;
    /* Total received from workshops */
    let totalReceived=0;
    (o.workshopDeliveries||[]).forEach(wd=>{
      totalReceived+=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);
    });
    if(totalReceived===0)return;
    const completionPct=(totalReceived/totalCut)*100;
    if(completionPct<85||completionPct>=100)return;
    /* Check last activity date */
    const allReceiveDates=[];
    (o.workshopDeliveries||[]).forEach(wd=>{
      (wd.receives||[]).forEach(r=>{if(r.date)allReceiveDates.push(r.date)});
    });
    const lastActivity=allReceiveDates.sort().pop();
    const daysInactive=lastActivity?daysBetween(lastActivity,now):9999;
    if(daysInactive<10)return;
    alerts.push({
      id:"stuck_"+o.id,
      severity:"medium",
      category:"order",
      icon:"⏸️",
      title:"أوردر "+(o.modelNo||o.id)+" متوقف",
      message:Math.round(completionPct)+"% مكتمل، آخر نشاط منذ "+daysInactive+" يوم",
      action:"راجع المتبقي وأنهِ الأوردر",
      link:{tab:"details",orderId:o.id}
    });
  });

  /* ══════════════════════════════════════════════
     6. OPEN WEEK approaching end
     ══════════════════════════════════════════════ */
  if(openWeek&&openWeek.weekEnd){
    const daysToEnd=daysBetween(now,openWeek.weekEnd);
    if(daysToEnd<=2&&daysToEnd>=0){
      /* Check how many employees have incomplete attendance */
      const attendance=openWeek.attendance||{};
      const missingCount=employees.filter(e=>{
        for(let i=0;i<7;i++){
          const d=new Date(openWeek.weekStart);d.setDate(d.getDate()+i);
          const key=e.id+"_"+d.toISOString().split("T")[0];
          if(attendance[key])return false;
        }
        return true;
      }).length;
      if(missingCount>0){
        alerts.push({
          id:"week_ending",
          severity:daysToEnd===0?"high":"medium",
          category:"hr",
          icon:"📅",
          title:"أسبوع W"+openWeek.weekNum+" ينتهي قريباً",
          message:"ينتهي خلال "+daysToEnd+" يوم و "+missingCount+" موظف بدون بصمة",
          action:"أدخل بيانات البصمة المتبقية",
          link:{tab:"hr",weekId:openWeek.id}
        });
      }
    }
  }

  /* ══════════════════════════════════════════════
     7. TREASURY: Large unmatched cash movements
     ══════════════════════════════════════════════ */
  const last24h=new Date(Date.now()-DAY_MS).toISOString();
  const recentOut=treasury.filter(t=>t.type==="out"&&t.ts>=last24h&&(Number(t.amount)||0)>=10000);
  if(recentOut.length>=3){
    alerts.push({
      id:"treasury_high_out",
      severity:"info",
      category:"treasury",
      icon:"💸",
      title:"حركات منصرف كبيرة",
      message:recentOut.length+" عمليات منصرف ≥ 10,000 ج خلال 24 ساعة",
      action:"راجع سجل الخزنة",
      link:{tab:"treasury"}
    });
  }

  /* Sort by severity, then by date */
  alerts.sort((a,b)=>{
    const sDiff=SEVERITY_ORDER[a.severity]-SEVERITY_ORDER[b.severity];
    if(sDiff!==0)return sDiff;
    return(a.date||"").localeCompare(b.date||"");
  });

  return alerts;
}

/* Get color + label for severity */
export function getSeverityStyle(severity){
  if(severity==="critical")return{color:"#DC2626",bg:"#FEE2E2",border:"#FCA5A5",label:"حرج"};
  if(severity==="high")return{color:"#EA580C",bg:"#FFEDD5",border:"#FDBA74",label:"مرتفع"};
  if(severity==="medium")return{color:"#D97706",bg:"#FEF3C7",border:"#FCD34D",label:"متوسط"};
  return{color:"#0369A1",bg:"#DBEAFE",border:"#93C5FD",label:"معلومة"};
}

/* Summary counts */
export function getAlertsSummary(alerts){
  return{
    critical:alerts.filter(a=>a.severity==="critical").length,
    high:alerts.filter(a=>a.severity==="high").length,
    medium:alerts.filter(a=>a.severity==="medium").length,
    info:alerts.filter(a=>a.severity==="info").length,
    total:alerts.length
  };
}
