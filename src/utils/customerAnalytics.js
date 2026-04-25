/* ═══════════════════════════════════════════════════════════════
   CLARK — Customer Analytics (V16.3)
   
   Computes rich statistics for a single customer:
   - Sales: total value, piece count, order count
   - Finance: paid, outstanding, avg payment days, discount amount
   - Patterns: top models, monthly breakdown, seasonality
   - Tier: Gold/Silver/Bronze based on volume + reliability
   
   All computation is local, no external calls.
   ═══════════════════════════════════════════════════════════════ */

const DAY_MS=86400000;
const daysBetween=(d1,d2)=>{
  if(!d1||!d2)return 0;
  return Math.floor((new Date(d2)-new Date(d1))/DAY_MS);
};

/* Main analyzer — returns comprehensive stats object for one customer */
export function analyzeCustomer(custId,data,opts={}){
  if(!custId||!data)return null;
  const cust=(data.customers||[]).find(c=>c.id===custId);
  if(!cust)return null;
  const orders=data.orders||[];
  const custPayments=(data.custPayments||[]).filter(p=>p.custId===custId);
  const discPct=Number(cust.discount)||0;

  /* Period filter — default: all time. opts.fromDate/toDate limit range */
  const inPeriod=(dateStr)=>{
    if(!dateStr)return true;
    if(opts.fromDate&&dateStr<opts.fromDate)return false;
    if(opts.toDate&&dateStr>opts.toDate)return false;
    return true;
  };

  /* ══════════════════════════════════════════════
     1. Collect customer transactions from orders
     ══════════════════════════════════════════════ */
  const deliveries=[];/* {date, orderId, modelNo, modelDesc, qty, sellPrice, sessionId} */
  const returns=[];
  orders.forEach(o=>{
    if(o.status==="cancelled")return;
    const sp=Number(o.sellPrice)||0;
    (o.customerDeliveries||[]).forEach(d=>{
      if(d.custId!==custId)return;
      if(!inPeriod(d.date))return;
      deliveries.push({
        date:d.date,orderId:o.id,modelNo:o.modelNo,modelDesc:o.modelDesc,
        qty:Number(d.qty)||0,sellPrice:sp,sessionId:d.sessionId,value:(Number(d.qty)||0)*sp
      });
    });
    (o.customerReturns||[]).forEach(r=>{
      if(r.custId!==custId)return;
      if(!inPeriod(r.date))return;
      returns.push({
        date:r.date,orderId:o.id,modelNo:o.modelNo,modelDesc:o.modelDesc,
        qty:Number(r.qty)||0,sellPrice:sp,value:(Number(r.qty)||0)*sp
      });
    });
  });

  /* ══════════════════════════════════════════════
     2. Aggregate totals
     ══════════════════════════════════════════════ */
  const deliveryCount=deliveries.length;
  const returnCount=returns.length;
  const piecesDelivered=deliveries.reduce((s,d)=>s+d.qty,0);
  const piecesReturned=returns.reduce((s,r)=>s+r.qty,0);
  const netPieces=piecesDelivered-piecesReturned;
  const grossValue=deliveries.reduce((s,d)=>s+d.value,0);
  const returnsValue=returns.reduce((s,r)=>s+r.value,0);
  const netSales=grossValue-returnsValue;
  const discountAmount=Math.round(netSales*discPct/100);
  const salesAfterDiscount=netSales-discountAmount;

  /* Unique orders */
  const uniqueOrderIds=new Set(deliveries.map(d=>d.orderId));
  const orderCount=uniqueOrderIds.size;

  /* ══════════════════════════════════════════════
     3. Payments analysis
     ══════════════════════════════════════════════ */
  const paymentsInPeriod=custPayments.filter(p=>inPeriod(p.date));
  const totalPaid=paymentsInPeriod.reduce((s,p)=>s+(Number(p.amount)||0),0);
  const balance=Math.round(salesAfterDiscount-totalPaid);
  const paymentCount=paymentsInPeriod.length;
  const avgPayment=paymentCount>0?Math.round(totalPaid/paymentCount):0;
  const lastPayment=paymentsInPeriod.slice().sort((a,b)=>(b.date||"").localeCompare(a.date||""))[0];
  const firstPayment=paymentsInPeriod.slice().sort((a,b)=>(a.date||"").localeCompare(b.date||""))[0];
  const today=new Date().toISOString().split("T")[0];
  const daysSinceLastPayment=lastPayment?daysBetween(lastPayment.date,today):null;

  /* ══════════════════════════════════════════════
     4. Average payment cycle (days from delivery to payment)
     Simple heuristic: avg days from first delivery of month to first payment
     ══════════════════════════════════════════════ */
  let avgPaymentCycle=null;
  if(deliveries.length>0&&paymentsInPeriod.length>0){
    /* For each payment, find closest prior delivery */
    const diffs=[];
    paymentsInPeriod.forEach(p=>{
      const priorDels=deliveries.filter(d=>d.date<=p.date).sort((a,b)=>b.date.localeCompare(a.date));
      if(priorDels.length>0){
        const d=daysBetween(priorDels[0].date,p.date);
        if(d>=0&&d<365)diffs.push(d);
      }
    });
    if(diffs.length>0)avgPaymentCycle=Math.round(diffs.reduce((s,d)=>s+d,0)/diffs.length);
  }

  /* ══════════════════════════════════════════════
     5. Top models by piece count
     ══════════════════════════════════════════════ */
  const modelMap=new Map();
  deliveries.forEach(d=>{
    const key=d.modelNo||d.orderId;
    if(!modelMap.has(key))modelMap.set(key,{modelNo:d.modelNo,modelDesc:d.modelDesc,pieces:0,value:0,orders:0});
    const m=modelMap.get(key);
    m.pieces+=d.qty;m.value+=d.value;
  });
  /* Count unique orders per model */
  modelMap.forEach((m,key)=>{
    m.orders=new Set(deliveries.filter(d=>(d.modelNo||d.orderId)===key).map(d=>d.orderId)).size;
  });
  const topModels=Array.from(modelMap.values()).sort((a,b)=>b.pieces-a.pieces).slice(0,5);

  /* ══════════════════════════════════════════════
     6. Monthly breakdown (last 12 months)
     ══════════════════════════════════════════════ */
  const monthlyMap=new Map();
  deliveries.forEach(d=>{
    if(!d.date)return;
    const ym=d.date.slice(0,7);/* YYYY-MM */
    if(!monthlyMap.has(ym))monthlyMap.set(ym,{month:ym,pieces:0,value:0,orders:new Set()});
    const m=monthlyMap.get(ym);
    m.pieces+=d.qty;m.value+=d.value;m.orders.add(d.orderId);
  });
  returns.forEach(r=>{
    if(!r.date)return;
    const ym=r.date.slice(0,7);
    if(!monthlyMap.has(ym))monthlyMap.set(ym,{month:ym,pieces:0,value:0,orders:new Set()});
    const m=monthlyMap.get(ym);
    m.pieces-=r.qty;m.value-=r.value;
  });
  const monthly=Array.from(monthlyMap.values())
    .map(m=>({...m,orderCount:m.orders.size,orders:undefined}))
    .sort((a,b)=>a.month.localeCompare(b.month));

  /* Peak month */
  const peakMonth=monthly.reduce((max,m)=>!max||m.value>max.value?m:max,null);

  /* ══════════════════════════════════════════════
     7. Tier calculation — Gold/Silver/Bronze
     Based on: total sales volume + payment reliability + order frequency
     ══════════════════════════════════════════════ */
  const allTimePieces=netPieces;
  const isReliable=daysSinceLastPayment===null||daysSinceLastPayment<60;
  const balanceRatio=salesAfterDiscount>0?balance/salesAfterDiscount:0;

  let tier,tierColor,tierLabel,tierEmoji;
  if(allTimePieces>=2000&&isReliable&&balanceRatio<0.3){
    tier="gold";tierLabel="عميل ذهبي";tierColor="#EAB308";tierEmoji="⭐";
  }else if(allTimePieces>=500&&balanceRatio<0.5){
    tier="silver";tierLabel="عميل فضي";tierColor="#94A3B8";tierEmoji="🥈";
  }else if(allTimePieces>=100){
    tier="bronze";tierLabel="عميل برونزي";tierColor="#D97706";tierEmoji="🥉";
  }else{
    tier="new";tierLabel="عميل جديد";tierColor="#64748B";tierEmoji="🌱";
  }

  /* ══════════════════════════════════════════════
     8. Growth vs previous period (same length)
     ══════════════════════════════════════════════ */
  let growthPct=null;
  if(opts.fromDate&&opts.toDate){
    const fromD=new Date(opts.fromDate);const toD=new Date(opts.toDate);
    const periodDays=Math.floor((toD-fromD)/DAY_MS);
    const prevTo=new Date(fromD.getTime()-DAY_MS).toISOString().split("T")[0];
    const prevFrom=new Date(fromD.getTime()-(periodDays+1)*DAY_MS).toISOString().split("T")[0];
    /* Compute previous period value */
    let prevValue=0;
    orders.forEach(o=>{
      if(o.status==="cancelled")return;
      const sp=Number(o.sellPrice)||0;
      (o.customerDeliveries||[]).forEach(d=>{
        if(d.custId!==custId)return;
        if(!d.date||d.date<prevFrom||d.date>prevTo)return;
        prevValue+=(Number(d.qty)||0)*sp;
      });
      (o.customerReturns||[]).forEach(r=>{
        if(r.custId!==custId)return;
        if(!r.date||r.date<prevFrom||r.date>prevTo)return;
        prevValue-=(Number(r.qty)||0)*sp;
      });
    });
    if(prevValue>0){
      growthPct=Math.round(((netSales-prevValue)/prevValue)*100);
    }
  }

  return{
    customer:{
      id:cust.id,
      name:cust.name,
      phone:cust.phone||"",
      discount:discPct,
    },
    sales:{
      grossValue:Math.round(grossValue),
      returnsValue:Math.round(returnsValue),
      netSales:Math.round(netSales),
      discountAmount,
      salesAfterDiscount,
      piecesDelivered,
      piecesReturned,
      netPieces,
      deliveryCount,
      returnCount,
      orderCount,
      avgOrderValue:orderCount>0?Math.round(salesAfterDiscount/orderCount):0,
      avgPieceValue:netPieces>0?Math.round(netSales/netPieces):0,
    },
    finance:{
      totalPaid:Math.round(totalPaid),
      balance,
      paymentCount,
      avgPayment,
      avgPaymentCycle,/* days */
      daysSinceLastPayment,
      lastPaymentDate:lastPayment?.date||null,
      lastPaymentAmount:lastPayment?.amount||0,
      firstPaymentDate:firstPayment?.date||null,
    },
    topModels,
    monthly,
    peakMonth:peakMonth?{month:peakMonth.month,value:Math.round(peakMonth.value),pieces:peakMonth.pieces}:null,
    tier:{tier,label:tierLabel,color:tierColor,emoji:tierEmoji},
    growth:growthPct,
    period:{
      from:opts.fromDate||(deliveries[0]?deliveries.map(d=>d.date).filter(Boolean).sort()[0]:null),
      to:opts.toDate||today,
    },
  };
}

/* Format helpers */
export function fmtMonth(ym){
  if(!ym)return"";
  const[y,m]=ym.split("-");
  const months=["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  return months[Number(m)-1]+" "+y;
}
