/* ═══════════════════════════════════════════════════════════════
   CLARK - Order Business Logic
   
   Pure functions for calculating order totals, stock availability,
   and workshop rating. All functions are memoized via WeakMap where
   order objects are inputs.
   
   Since orders are deep-cloned before updates, stale order objects
   become unreachable and their cache entries are automatically
   garbage-collected. No invalidation logic needed.
   ═══════════════════════════════════════════════════════════════ */

import { FKEYS, DEFAULT_STATUSES, QUALITY_MAP } from "../constants/index.js";
import { gid, r2, sqty, slay, gf, gc, gcons, gIcon } from "./format.js";

/* Workshop type info — maps a workshop type string to icon/color/internal flag */
export function wsTypeInfo(type){
  /* Import WS_TYPES lazily at call time to avoid circular dep */
  const WS_TYPES_LAZY=[
    {key:"خياطة خارجي",icon:"🏭",color:"#8B5CF6",internal:false},
    {key:"خياطة داخلي",icon:"🏠",color:"#0EA5E9",internal:true},
    {key:"تطريز",icon:"🪡",color:"#F59E0B",internal:false},
    {key:"طباعة",icon:"🖨",color:"#EF4444",internal:false},
    {key:"تشطيب وتعبئة خارجي",icon:"👔",color:"#10B981",internal:false},
    {key:"مخصص",icon:"⚙️",color:"#64748B",internal:false},
  ];
  /* Migrate old types */
  if(type==="خارجي")type="خياطة خارجي";if(type==="داخلي")type="خياطة داخلي";
  return WS_TYPES_LAZY.find(t=>t.key===type)||WS_TYPES_LAZY[0];
}

export function wsIsInternal(type){return wsTypeInfo(type).internal}

/* Get status color from cards or fallback to default gray */
export function getStatusColor(name,cards){const c=(cards||DEFAULT_STATUSES).find(s=>s.name===name);return c?c.color:"#94A3B8"}

/* V16.47: Production stage timeline.
   Maps a free-form status string to an index in a 5-stage production lifecycle:
     0  قص
     1  تشغيل (خياطة)  — also catches طباعة / تطريز / غسيل (V16.72: collapsed
        into stage 1 because the factory doesn't run a separate decoration
        phase. Statuses containing those keywords are still produced by
        recomputeStatus when external workshops happen to be of those types,
        so we map them here as a safety net rather than dropping them.)
     2  تشطيب وتعبئة
     3  جاهز (تم التسليم لمخزن الجاهز)
   Also returns a special-case "cancelled" flag for "ملغي".
   Falls back to stage 0 for unknown statuses. */
export const PRODUCTION_STAGES=[
  {key:"cut",     short:"قص",      full:"تم القص"},
  {key:"sew",     short:"تشغيل",   full:"في التشغيل"},
  /* V16.72: removed {key:"deco",short:"طباعة",...} — factory doesn't run a
     printing/embroidery phase, the dot in the order-card timeline was just
     visual clutter. If decoration statuses ever reappear they'll fall back
     onto the sewing stage in getStageIndex below. */
  {key:"finish",  short:"تشطيب",   full:"تشطيب وتعبئة"},
  {key:"ready",   short:"جاهز",    full:"تم التسليم لمخزن الجاهز"}
];
export function getStageIndex(status){
  const s=String(status||"").trim();
  if(!s)return 0;
  if(s==="ملغي")return-1;/* cancelled */
  /* V16.72: stage indices renumbered after removing the print/embroidery dot.
     Keep this list in step with PRODUCTION_STAGES above. */
  /* Stage 3: ready / partially-ready */
  if(s==="تم التسليم لمخزن الجاهز")return 3;
  if(s==="في مخزن الجاهز جزئي")return 3;
  /* Stage 2: finishing */
  if(s.indexOf("تشطيب")>=0)return 2;
  /* Stage 1: sewing — internal, external, OR decoration (print/embroidery/wash)
     all collapse here since there's no separate decoration stage anymore. */
  if(s.indexOf("طباعة")>=0||s.indexOf("تطريز")>=0||s.indexOf("غسيل")>=0)return 1;
  if(s.indexOf("تشغيل")>=0)return 1;
  /* Stage 0: cut */
  if(s==="تم القص")return 0;
  return 0;
}

/* ═══════════════════════════════════════════════════════════════
   PERFORMANCE CACHES — WeakMap-based memoization for pure functions
   
   All three functions below are pure (output depends only on input).
   Since orders are deep-cloned before updates, stale order objects become
   unreachable and their cache entries are automatically garbage-collected.
   No invalidation logic needed — WeakMap handles it natively.
   
   Performance impact: With 500+ orders rendered across Dashboard + DetPg +
   CustDeliver + Reports, we go from ~3000 computations/render to ~500
   WeakMap lookups. Big win on mobile especially.
   ═══════════════════════════════════════════════════════════════ */
const _orderCache=new WeakMap();
const _stockCache=new WeakMap();
const _pendingCache=new WeakMap();

/* V16.24: Per-piece cut quantity override.
   The order has one global cutQty (e.g. 192 sets), but in practice individual
   piece types may have a different actual cut quantity — for example the user
   bumped cutQty in anticipation of cutting more, but only some pieces have
   actually been re-cut.
   V16.25: Auto-derive from fabric data (which is the source of truth):
     1. If user has set an explicit override → use it
     2. Else, sum the cut qty of fabrics that have this piece linked
        (e.g. t-shirt linked to fabric B with cut=128 → piece cut = 128,
         even if global fabric A has cut=192)
     3. Else fallback to global cutQty.
   This means the per-piece accounting works with zero manual setup as long
   as pieces are linked to fabrics correctly. */
export function getPieceCutQty(order,piece){
  if(!order||!piece)return 0;
  const map=order.pieceCutQty;
  if(map&&typeof map==="object"&&map[piece]!=null&&!isNaN(Number(map[piece])))return Number(map[piece]);
  /* Auto-derive from linked fabrics */
  let total=0;let linked=false;
  FKEYS.forEach(k=>{
    const pieces=order["fabricPieces"+k]||[];
    if(pieces.includes(piece)){linked=true;total+=sqty(gc(order,k))||0}
  });
  if(linked)return total;
  /* No fabric link found → fall back to global cut */
  const t=calcOrder(order);
  return t.cutQty||0;
}

export function calcOrder(o){
  if(!o||typeof o!=="object")return{cutQty:0,totalFab:0,fabPer:0,accPer:0,accAll:0,wsCostAll:0,wsCostPer:0,costPer:0,costAll:0,balance:0};
  const cached=_orderCache.get(o);
  if(cached)return cached;
  const mainCut=sqty(gc(o,"A"))||o.cutQty||0;let totalFab=0;const fp=[];
  FKEYS.forEach(k=>{if(!gf(o,k))return;const cost=gcons(o,k)*(gf(o,k,"Price")||0)*slay(gc(o,k));totalFab+=cost;fp.push(mainCut?r2(cost/mainCut):0)});
  const fabPer=fp.reduce((s,v)=>s+v,0);const accPer=(o.accItems||[]).reduce((s,a)=>s+(a.price||0),0);
  /* V15.3: Workshop cost — sum of actual receives from EXTERNAL workshops only.
     Internal workshops excluded (their cost comes from payroll, tracked separately).
     Uses receives (actual) not deliveries (planned) so cost reflects what was really paid. */
  let wsCostAll=0;
  (o.workshopDeliveries||[]).forEach(wd=>{
    if(wsIsInternal(wd.wsType))return;/* skip internal workshops */
    (wd.receives||[]).forEach(r=>{
      if(r.isSettlement)return;/* skip settlement entries (those are waste adjustments) */
      const rQty=Number(r.qty)||0;
      const rPrice=Number(r.price)||Number(wd.price)||0;/* fallback to wd.price if receive has no price */
      wsCostAll+=rQty*rPrice;
    });
  });
  const wsCostPer=mainCut>0?r2(wsCostAll/mainCut):0;
  const result={cutQty:mainCut,totalFab,fabPer:r2(fabPer),accPer,accAll:accPer*mainCut,wsCostAll:r2(wsCostAll),wsCostPer,costPer:r2(fabPer+accPer+wsCostPer),costAll:r2(totalFab+accPer*mainCut+wsCostAll),balance:mainCut-(o.deliveredQty||0)};
  _orderCache.set(o,result);
  return result;
}

export function getConfirmedStock(o){
  if(!o||typeof o!=="object")return 0;
  const cached=_stockCache.get(o);
  if(cached!==undefined)return cached;
  const result=(o.deliveries||[]).filter(d=>d.status!=="pending").reduce((s,d)=>s+(Number(d.qty)||0),0);
  _stockCache.set(o,result);
  return result;
}

/* V18.21: Series vs Broken stock distinction.
   Default for legacy entries (no `type` field) = "series" — preserves backward compat. */
export function getConfirmedSeriesStock(o){
  if(!o||typeof o!=="object")return 0;
  return (o.deliveries||[]).filter(d=>d.status!=="pending"&&(d.type||"series")==="series").reduce((s,d)=>s+(Number(d.qty)||0),0);
}
export function getConfirmedBrokenStock(o){
  if(!o||typeof o!=="object")return 0;
  return (o.deliveries||[]).filter(d=>d.status!=="pending"&&d.type==="broken").reduce((s,d)=>s+(Number(d.qty)||0),0);
}

export function getPendingStock(o){
  if(!o||typeof o!=="object")return 0;
  const cached=_pendingCache.get(o);
  if(cached!==undefined)return cached;
  const result=(o.deliveries||[]).filter(d=>d.status==="pending").reduce((s,d)=>s+(Number(d.qty)||0),0);
  _pendingCache.set(o,result);
  return result;
}

/* ═══════════════════════════════════════════════════════════════
   STOCK MANAGEMENT — Hard Block + Auto Deduct
   
   calcStockNeeded(order): returns {fabrics:{id:qty}, accessories:{id:qty}}
   checkStockAvailability(order, data): returns {ok, shortages[]}
   deductStockForOrder(d, order, userName): mutates draft to deduct (delta-aware)
   
   Uses _stockDeducted snapshot on the order for delta calculations.
   ═══════════════════════════════════════════════════════════════ */
export function calcStockNeeded(order){
  if(!order)return{fabrics:{},accessories:{},cutQty:0};
  const t=calcOrder(order);const cutQty=t.cutQty||0;
  const needed={fabrics:{},accessories:{},cutQty};
  if(cutQty<=0)return needed;
  /* Fabrics: cons is consumption PER LAYER (not per piece), so total fabric = cons × total_layers.
     V15.3 fix: was "cons × cutQty" which overestimated fabric usage dramatically
     (e.g. 1000 pieces × 2m/layer = 2000m instead of the correct 20 layers × 2m = 40m). */
  FKEYS.forEach(k=>{
    const fabId=gf(order,k);if(!fabId)return;
    const cons=Number(gcons(order,k))||0;
    const lay=slay(gc(order,k))||0;
    if(cons<=0||lay<=0)return;
    /* Fabric needed = consumption_per_layer × total_layers */
    const qtyNeeded=r2(cons*lay);
    if(qtyNeeded>0)needed.fabrics[fabId]=(needed.fabrics[fabId]||0)+qtyNeeded;
  });
  /* Accessories: qtyPerPiece × cutQty (this is correct — accessories are per finished piece) */
  (order.accItems||[]).forEach(ac=>{
    if(!ac.accId)return;
    const qpp=Number(ac.qtyPerPiece)||1;/* default 1 if not set */
    const qtyNeeded=r2(qpp*cutQty);
    if(qtyNeeded>0)needed.accessories[ac.accId]=(needed.accessories[ac.accId]||0)+qtyNeeded;
  });
  return needed;
}

/* Returns {ok: boolean, shortages: [{itemType, itemId, itemName, unit, needed, available, shortage}]} */
export function checkStockAvailability(order,data,deltaOnly){
  const purchaseSettings=data.purchaseSettings||{};
  if(!purchaseSettings.stockEnabled||!purchaseSettings.autoDeductOnCut)return{ok:true,shortages:[]};
  const activationDate=purchaseSettings.stockActivationDate||"";
  /* Skip orders created before activation */
  if(activationDate&&order.date&&order.date<activationDate)return{ok:true,shortages:[],skipped:"before-activation"};

  const needed=calcStockNeeded(order);
  const prev=order._stockDeducted||{fabrics:{},accessories:{}};
  const shortages=[];
  const fabrics=data.fabrics||[];
  const accessories=data.accessories||[];

  /* Calculate delta: what ADDITIONAL stock is needed beyond what was already deducted */
  Object.entries(needed.fabrics).forEach(([fabId,qty])=>{
    const already=Number(prev.fabrics[fabId])||0;
    const delta=r2(qty-already);
    if(delta<=0)return;/* reduction or same — no shortage check needed */
    const fab=fabrics.find(f=>String(f.id)===String(fabId));
    if(!fab)return;
    const available=Number(fab.stock)||0;
    if(delta>available){shortages.push({itemType:"fabric",itemId:fabId,itemName:fab.name||"—",unit:fab.unit||"",needed:delta,available,shortage:r2(delta-available)})}
  });
  Object.entries(needed.accessories).forEach(([accId,qty])=>{
    const already=Number(prev.accessories[accId])||0;
    const delta=r2(qty-already);
    if(delta<=0)return;
    const acc=accessories.find(a=>String(a.id)===String(accId));
    if(!acc)return;
    const available=Number(acc.stock)||0;
    if(delta>available){shortages.push({itemType:"accessory",itemId:accId,itemName:acc.name||"—",unit:acc.unit||"",needed:delta,available,shortage:r2(delta-available)})}
  });

  return{ok:shortages.length===0,shortages,needed,delta:{fabrics:{},accessories:{}}};
}

/* Mutates draft config to apply stock deduction (delta-aware).
   Must be called INSIDE upConfig callback, and the order in d.orders must be the updated one. */
export function deductStockForOrder(d,order,userName){
  const purchaseSettings=d.purchaseSettings||{};
  if(!purchaseSettings.stockEnabled||!purchaseSettings.autoDeductOnCut)return;
  const activationDate=purchaseSettings.stockActivationDate||"";
  if(activationDate&&order.date&&order.date<activationDate)return;

  const needed=calcStockNeeded(order);
  const prev=order._stockDeducted||{fabrics:{},accessories:{}};
  if(!d.stockMovements)d.stockMovements=[];
  const now=new Date().toISOString();
  const today=now.split("T")[0];

  /* Process fabrics */
  Object.entries(needed.fabrics).forEach(([fabId,qty])=>{
    const already=Number(prev.fabrics[fabId])||0;
    const delta=r2(qty-already);
    if(delta===0)return;
    const idx=(d.fabrics||[]).findIndex(f=>String(f.id)===String(fabId));
    if(idx<0)return;
    const fab=d.fabrics[idx];
    fab.stock=r2((Number(fab.stock)||0)-delta);
    d.stockMovements.push({
      id:gid(),type:delta>0?"out":"in",itemType:"fabric",itemId:fabId,itemName:fab.name||"",
      qty:Math.abs(delta),unit:fab.unit||"",price:Number(fab.avgCost)||0,date:today,
      sourceType:"cut",sourceId:order.id,
      notes:"قص موديل "+(order.modelNo||"")+(delta<0?" (تعديل — إرجاع للمخزن)":""),
      createdBy:userName||"",createdAt:now
    });
  });
  /* Handle removed fabrics (existed in prev but not in needed — return to stock) */
  Object.entries(prev.fabrics).forEach(([fabId,oldQty])=>{
    if(needed.fabrics[fabId]!==undefined)return;/* already processed */
    const idx=(d.fabrics||[]).findIndex(f=>String(f.id)===String(fabId));
    if(idx<0)return;
    const fab=d.fabrics[idx];
    fab.stock=r2((Number(fab.stock)||0)+oldQty);
    d.stockMovements.push({
      id:gid(),type:"in",itemType:"fabric",itemId:fabId,itemName:fab.name||"",
      qty:oldQty,unit:fab.unit||"",price:Number(fab.avgCost)||0,date:today,
      sourceType:"cut",sourceId:order.id,
      notes:"إرجاع خامة من موديل "+(order.modelNo||"")+" (تعديل)",
      createdBy:userName||"",createdAt:now
    });
  });
  /* Process accessories */
  Object.entries(needed.accessories).forEach(([accId,qty])=>{
    const already=Number(prev.accessories[accId])||0;
    const delta=r2(qty-already);
    if(delta===0)return;
    const idx=(d.accessories||[]).findIndex(a=>String(a.id)===String(accId));
    if(idx<0)return;
    const acc=d.accessories[idx];
    acc.stock=r2((Number(acc.stock)||0)-delta);
    d.stockMovements.push({
      id:gid(),type:delta>0?"out":"in",itemType:"accessory",itemId:accId,itemName:acc.name||"",
      qty:Math.abs(delta),unit:acc.unit||"",price:Number(acc.avgCost)||0,date:today,
      sourceType:"cut",sourceId:order.id,
      notes:"قص موديل "+(order.modelNo||"")+(delta<0?" (تعديل — إرجاع للمخزن)":""),
      createdBy:userName||"",createdAt:now
    });
  });
  Object.entries(prev.accessories).forEach(([accId,oldQty])=>{
    if(needed.accessories[accId]!==undefined)return;
    const idx=(d.accessories||[]).findIndex(a=>String(a.id)===String(accId));
    if(idx<0)return;
    const acc=d.accessories[idx];
    acc.stock=r2((Number(acc.stock)||0)+oldQty);
    d.stockMovements.push({
      id:gid(),type:"in",itemType:"accessory",itemId:accId,itemName:acc.name||"",
      qty:oldQty,unit:acc.unit||"",price:Number(acc.avgCost)||0,date:today,
      sourceType:"cut",sourceId:order.id,
      notes:"إرجاع إكسسوار من موديل "+(order.modelNo||"")+" (تعديل)",
      createdBy:userName||"",createdAt:now
    });
  });

  /* Save snapshot on the order for next delta calc */
  order._stockDeducted={fabrics:{...needed.fabrics},accessories:{...needed.accessories}};
}

/* Workshop quality/time/delivery rating — returns 2-10 or null if no data */
export function calcWsRating(wsName,orders){
  let totalDel=0,totalRcv=0;
  const qScores=[],tScores=[];
  orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===wsName).forEach(wd=>{
    const delDate=new Date(wd.date);const qty=Number(wd.qty)||0;
    totalDel+=qty;
    const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);
    totalRcv+=rcvd;
    (wd.receives||[]).forEach(r=>{
      /* Quality score */
      qScores.push(QUALITY_MAP[r.quality]||6);
      /* Time score: ideal = qty/500 * 6.5 days */
      const rcvDate=new Date(r.date);
      const days=Math.max(1,Math.floor((rcvDate-delDate)/(1000*60*60*24)));
      const idealDays=Math.max(3,Math.round((qty/500)*6.5));
      if(days<=idealDays)tScores.push(10);
      else if(days<=idealDays*1.3)tScores.push(8);
      else if(days<=idealDays*1.6)tScores.push(6);
      else if(days<=idealDays*2)tScores.push(4);
      else tScores.push(2);
    })})});
  if(qScores.length===0)return null;
  /* 1. Quality avg (40%) */
  const avgQ=qScores.reduce((s,v)=>s+v,0)/qScores.length;
  /* 2. Time avg (25%) */
  const avgT=tScores.length>0?tScores.reduce((s,v)=>s+v,0)/tScores.length:5;
  /* 3. Delivery rate (20%) */
  const delRate=totalDel>0?Math.min(1,totalRcv/totalDel):0;
  const delScore=delRate>=0.95?10:delRate>=0.8?8:delRate>=0.6?6:delRate>=0.4?4:2;
  /* 4. Consistency (15%) - low quality variance = better */
  const qMean=avgQ;const variance=qScores.reduce((s,v)=>s+Math.pow(v-qMean,2),0)/qScores.length;
  const consScore=variance<=1?10:variance<=4?8:variance<=9?6:4;
  /* Combined */
  return r2(avgQ*0.4+avgT*0.25+delScore*0.2+consScore*0.15);
}

/* V15.45: Workshop Partnership Tier — measures relationship SIZE (not performance).
   Based on total pieces the workshop has DELIVERED BACK to us (totalRcv).
   Kept separate from calcWsRating so ratings stay performance-focused.
   Caller should filter to external workshops only (use wsIsInternal). */
export function getWsPartnershipTier(wsName,orders){
  let totalRcv=0;
  orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===wsName).forEach(wd=>{
    totalRcv+=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);
  })});
  let tier,icon,color,label;
  if(totalRcv>=5000){tier="major";icon="🥇";color="#F59E0B";label="شراكة كبرى"}
  else if(totalRcv>=1000){tier="medium";icon="🥈";color="#94A3B8";label="شراكة متوسطة"}
  else if(totalRcv>=100){tier="small";icon="🥉";color="#CD7F32";label="شراكة صغيرة"}
  else{tier="new";icon="🌱";color="#10B981";label="شراكة جديدة"}
  return{tier,totalRcv,icon,color,label};
}

/* V15.45/46: Detect mismatch between cut qty and workshop delivery qty — PER PIECE (garmentType).
   Business logic: An order is a SET — cut=357 means 357 sets, each set = 1 shirt + 1 shorts + 1 tshirt.
   Each piece gets delivered to a separate workshop. For each piece, sum(workshop deliveries) should == cutQty.
   We compare PER PIECE, not aggregated total (which would falsely count 357×3 pieces as "over-delivered").
   Returns:
     - pieces: [{piece, totalDelivered, wds:[{idx,wsName,qty,receivedQty,...}], diff}]
     - mismatchedPieces: only pieces with diff!==0 AND totalDelivered>0 (ignores pieces never worked on)
     - hasMismatch: bool
     - cutQty: the reference cut quantity
   
   V15.46: Orders without pieces (legacy) still work — all deliveries group under "عام". */
export function detectQtyMismatch(order){
  if(!order)return{cutQty:0,pieces:[],mismatchedPieces:[],hasExternalWs:false,hasMismatch:false};
  const t=calcOrder(order);
  const cutQty=t.cutQty||0;
  /* V16.22: count ALL deliveries (internal + external). Internal workshops
     also consume cut pieces, so excluding them gave false-positive mismatches
     when cut pieces went to in-house production. `hasExternalWs` still
     reflects only external workshops for the UI flag. */
  const allWds=(order.workshopDeliveries||[]);
  const externalWds=allWds.filter(wd=>!wsIsInternal(wd.wsType));
  /* Group deliveries by piece (garmentType) — ALL deliveries count */
  const byPiece={};
  allWds.forEach((wd,idx)=>{
    const piece=wd.garmentType||"عام";
    if(!byPiece[piece])byPiece[piece]={piece,totalDelivered:0,wds:[]};
    const wdQty=Number(wd.qty)||0;
    const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);
    byPiece[piece].totalDelivered+=wdQty;
    byPiece[piece].wds.push({wdIdx:idx,wsName:wd.wsName||"",currentQty:wdQty,receivedQty:rcvd,isInternal:wsIsInternal(wd.wsType)});
  });
  const pieces=Object.values(byPiece).map(p=>{
    const pieceCut=getPieceCutQty(order,p.piece);
    return{...p,pieceCutQty:pieceCut,diff:pieceCut-p.totalDelivered};
  });
  /* V16.23: Only flag OVER-delivered pieces (totalDelivered > pieceCutQty).
     V16.24: Compare against per-piece cut qty, not global. */
  const mismatchedPieces=pieces.filter(p=>p.diff<0);
  return{cutQty,pieces,mismatchedPieces,hasExternalWs:externalWds.length>0,hasMismatch:mismatchedPieces.length>0};
}

/* V15.45/46: Compute sync plan PER PIECE — adjust each piece's workshops independently to match cutQty.
   Strategy: proportional redistribution within each piece's workshops, capped by receivedQty.
   Returns array of {piece, wds:[{wdIdx,wsName,currentQty,receivedQty,newQty,delta,capped}], feasible, ...}.
   Only includes pieces with mismatches (others stay unchanged). */
export function planCutSync(order){
  const m=detectQtyMismatch(order);
  if(!m.hasMismatch)return{pieces:[],feasible:true,m};
  const piecePlans=m.mismatchedPieces.map(p=>{
    const totalCurrent=p.totalDelivered;
    if(totalCurrent<=0)return{piece:p.piece,targetQty:m.cutQty,wds:[],feasible:false,reason:"no_ws"};
    const factor=m.cutQty/totalCurrent;
    let wds=p.wds.map(w=>{
      const proposed=Math.round(w.currentQty*factor);
      const capped=proposed<w.receivedQty;
      const newQty=Math.max(w.receivedQty,proposed);
      return{...w,newQty,delta:newQty-w.currentQty,capped};
    });
    /* Rounding correction — force sum == cutQty */
    const sum=wds.reduce((s,w)=>s+w.newQty,0);
    const drift=m.cutQty-sum;
    if(drift!==0){
      const candidates=[...wds].sort((a,b)=>b.newQty-a.newQty);
      if(candidates[0]){
        const target=candidates.find(c=>!c.capped||drift>0)||candidates[0];
        const tgtIdx=wds.findIndex(w=>w.wdIdx===target.wdIdx);
        if(tgtIdx>=0)wds[tgtIdx].newQty+=drift;
      }
    }
    wds=wds.map(w=>({...w,delta:w.newQty-w.currentQty}));
    const finalSum=wds.reduce((s,w)=>s+w.newQty,0);
    const feasible=finalSum===m.cutQty&&wds.every(w=>w.newQty>=w.receivedQty);
    return{piece:p.piece,targetQty:m.cutQty,currentTotal:totalCurrent,wds,feasible};
  });
  const feasible=piecePlans.every(pp=>pp.feasible);
  return{pieces:piecePlans,feasible,m};
}

/* Sort orders by various modes — returns new array.
   V15.5: "recent" mode now prefers updatedAt over createdAt so recently-modified orders surface. */
export function sortOrders(orders,mode){const valid=[...orders].filter(o=>o&&o.id);
  if(mode==="oldest")return valid.sort((a,b)=>(a.createdAt||a.date||"").localeCompare(b.createdAt||b.date||""));
  if(mode==="qty")return valid.sort((a,b)=>(calcOrder(b).cutQty||0)-(calcOrder(a).cutQty||0));
  if(mode==="name")return valid.sort((a,b)=>(a.modelNo||"").localeCompare(b.modelNo||"","ar"));
  /* default: recent — prefer updatedAt (if exists), fallback to createdAt, then date */
  return valid.sort((a,b)=>{
    const aKey=a.updatedAt||a.createdAt||a.date||"";
    const bKey=b.updatedAt||b.createdAt||b.date||"";
    return bKey.localeCompare(aKey);
  });
}

/* Smart status recompute based on data state.
   V15.5: also sets/bumps updatedAt if status change happens so order surfaces in sortOrders. */
export function recomputeStatus(o){
  const newStatus=_computeStatus(o);
  if(o.status!==newStatus)o.updatedAt=new Date().toISOString();
  return newStatus;
}

function _computeStatus(o){
  /* Closed orders always show as delivered to ready-stock. Highest priority. */
  if(o.closed)return"تم التسليم لمخزن الجاهز";
  const t=calcOrder(o);const wds=o.workshopDeliveries||[];const dels=o.deliveries||[];
  const stockDel=dels.filter(d=>d.status!=="pending").reduce((s,d)=>s+(Number(d.qty)||0),0);
  if(stockDel>=t.cutQty&&t.cutQty>0)return"تم التسليم لمخزن الجاهز";
  if(stockDel>0)return"في مخزن الجاهز جزئي";
  const pieces=o.orderPieces||[];
  if(wds.length>0){
    let totalWsDel=0,totalWsRcv=0;
    wds.forEach(wd=>{totalWsDel+=(Number(wd.qty)||0);(wd.receives||[]).forEach(r=>{totalWsRcv+=(Number(r.qty)||0)})});
    /* Check if enough received back for تشطيب */
    let isFinishing=false;
    if(pieces.length>0){
      const allRcvd=pieces.every(p=>{const rcvP=wds.filter(wd=>wd.garmentType===p).reduce((s,wd)=>(wd.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0)+s,0);return rcvP>0});
      if(allRcvd&&totalWsDel>0&&totalWsRcv>=totalWsDel*0.3)isFinishing=true
    } else {
      if(totalWsDel>0&&totalWsRcv>=totalWsDel*0.3)isFinishing=true
    }
    if(isFinishing)return"تشطيب وتعبئة";
    /* Determine status from last active (pending) workshop type */
    if(totalWsDel>0){
      const lastActive=wds.filter(wd=>{const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);return rcvd<(Number(wd.qty)||0)}).pop();
      if(lastActive&&lastActive.wsType){
        if(lastActive.wsType.includes("طباعة"))return"في الطباعة";
        if(lastActive.wsType.includes("تطريز"))return"في التطريز";
        if(lastActive.wsType.includes("تشطيب وتعبئة"))return"تشطيب وتعبئة خارجي";
      }
      return"في التشغيل"
    }
  }
  return"تم القص"
}

/* Migration helper: convert legacy status names to new ones.
   Used on load (from Firestore) and as safety-net in aging/filter logic.
   Non-destructive: returns the new name without modifying the order object. */
export function migrateStatus(status){
  if(status==="تم التسليم"||status==="تم الشحن")return"تم التسليم لمخزن الجاهز";
  if(status==="شحن جزئي")return"في مخزن الجاهز جزئي";
  return status
}

/* Create a new empty order with today's date as default */
export function mkOrder(){
  const today=new Date().toISOString().split("T")[0];
  const o={id:gid(),date:today,createdAt:new Date().toISOString(),modelNo:"",modelDesc:"",poNumber:"",sizeSetId:"",sizeLabel:"",status:"تم القص",cutQty:0,deliveredQty:0,accItems:[],deliveries:[],workshopDeliveries:[],orderPieces:[],image:"",instructions:"",attachments:[],marker:""};
  FKEYS.forEach(k=>{o["fabric"+k]="";o["cons"+k]=0;o["cutDate"+k]=today;o["colors"+k]=k==="A"?[{color:"",colorHex:"",layers:0,pcsPerLayer:0,qty:0}]:[];o["fabric"+k+"Label"]="";o["fabric"+k+"Price"]=0;o["fabric"+k+"Unit"]=""});
  return o
}

/* Validate order form - returns array of error messages */
export function validateOrder(form){
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

/* Order summary text for sharing (WhatsApp/Telegram).
   V18.89: Added per-piece breakdown showing cut qty, workshop-delivered qty, and available qty.
   Only shown for multi-piece orders (orderPieces.length > 1) to avoid noise on single-piece. */
export function getOrderDetails(o,t){
  const lines=["*CLARK — تفاصيل أوردر*","","• رقم الموديل: *"+o.modelNo+"*","• الوصف: "+o.modelDesc,"• المقاسات: "+(o.sizeLabel||"-"),"• كمية القص: *"+(t?.cutQty||0)+"*","• الحالة: "+o.status,"• مخزن جاهز: *"+(o.deliveredQty||0)+"*"];
  /* V18.89: Per-piece breakdown */
  const pieces=o.orderPieces||[];
  if(pieces.length>1){
    lines.push("","📌 تفاصيل القطع:");
    pieces.forEach(p=>{
      const cut=getPieceCutQty(o,p);
      const delivered=(o.workshopDeliveries||[]).filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0);
      const avail=Math.max(0,cut-delivered);
      lines.push(gIcon(p)+" "+p+": قص "+cut+" - تشغيل "+delivered+" - متاح للتسليم "+avail);
    });
  }
  return lines.join("\n");
}

/* Order timeline text for sharing — events sorted by date */
export function getOrderTimeline(o,t){
  const evs=[];
  if(o.date)evs.push({d:o.date,t:"✂️ تم القص ("+(t?.cutQty||0)+" قطعة)"});
  /* V15.46: Include cut-sync events (per-piece history format) */
  (o.cutSyncHistory||[]).forEach(h=>{const date=(h.at||"").split("T")[0];
    /* V15.46 format: h.pieces=[{piece,before,after}] • V15.45 format (legacy): h.totalBefore/After */
    if(h.pieces&&h.pieces.length>0){const summary=h.pieces.map(p=>p.piece+":"+p.before+"→"+p.after).join(" • ");evs.push({d:date,t:"🔄 مزامنة "+(h.by||"?")+" ("+summary+")"})}
    else{const changes=(h.changes||[]).map(c=>c.wsName+":"+c.from+"→"+c.to).join(" • ");evs.push({d:date,t:"🔄 مزامنة "+(h.by||"?")+" (التسليم "+(h.totalBefore||0)+"→"+(h.totalAfter||0)+(changes?" | "+changes:"")+")"})}
  });
  (o.workshopDeliveries||[]).forEach(wd=>{evs.push({d:wd.date,t:"📦 تسليم "+wd.wsName+" — "+(wd.garmentType||"عام")+" ("+wd.qty+")"});
    (wd.receives||[]).forEach(r=>{if(r.isSettlement)evs.push({d:r.date,t:"⚖️ تسوية "+wd.wsName+" ("+r.qty+")"});
      else evs.push({d:r.date,t:"↙ استلام "+(wd.garmentType||"")+" من "+wd.wsName+" ("+r.qty+")"})})});
  (o.deliveries||[]).forEach(d=>{evs.push({d:d.date,t:"📦 مخزن جاهز ("+d.qty+")"})});
  (o.customerDeliveries||[]).forEach(d=>{evs.push({d:d.date,t:"🚚 تسليم "+(d.custName||"عميل")+" ("+d.qty+")"})});
  if(o.settlement)evs.push({d:o.settlement.date,t:"⚖️ تسوية وغلق ("+o.settlement.qty+" هالك)"});
  evs.sort((a,b)=>(a.d||"").localeCompare(b.d||""));
  if(evs.length===0)return null;
  const stockDel=getConfirmedStock(o);
  const custDel=(o.customerDeliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);
  const remain=stockDel-custDel;
  const lines=["","─────────────────","*📋 تايم لاين:*",...evs.map(e=>e.d+" │ "+e.t),"─────────────────","📦 *رصيد المخزن الجاهز: "+remain+" قطعة*"];
  return lines.join("\n")
}

/* V18.72: Match a workshop from a treasury desc/notes string.
   Used to auto-link treasury entries to wsPayments when the user typed the
   workshop name in the desc but didn't pick it from the party selector.

   Returns the workshop object on a confident single match; null if nothing
   matched OR if multiple unrelated workshops appeared (ambiguous → safer to
   leave the entry unlinked than to guess wrong).

   Edge case handled: when one match's name is a strict substring of a longer
   match (e.g. "محمد" inside "محمد ستارال"), we pick the longer one — that's
   the real workshop, the shorter is just an accidental substring hit. */
/* V18.73: Normalize Arabic text for matching — collapse common variants
   (alef forms, ta marbuta vs ha, alef maksura vs ya, kashida, diacritics,
   tatweel, and whitespace). Used by workshop-name matching so that
   e.g. "ورشه محمد ايمن" matches a workshop named "ورشة محمد أيمن". */
function normalizeAr(s){
  if(!s||typeof s!=="string")return"";
  return s
    .replace(/[\u064B-\u065F\u0670]/g,"")  /* diacritics + dagger alef */
    .replace(/\u0640/g,"")                  /* tatweel */
    .replace(/[\u0622\u0623\u0625\u0671]/g,"\u0627") /* أ إ آ → ا */
    .replace(/\u0629/g,"\u0647")            /* ة → ه */
    .replace(/\u0649/g,"\u064A")            /* ى → ي */
    .replace(/\u0624/g,"\u0648")            /* ؤ → و */
    .replace(/\u0626/g,"\u064A")            /* ئ → ي */
    .replace(/\s+/g," ")
    .trim();
}

export function matchWorkshopFromDesc(desc, workshops){
  if(!desc||typeof desc!=="string")return null;
  if(!Array.isArray(workshops)||workshops.length===0)return null;
  const descN=normalizeAr(desc);
  const matches=[];
  for(const ws of workshops){
    if(!ws||!ws.name)continue;
    const name=ws.name.trim();
    if(!name)continue;
    const nameN=normalizeAr(name);
    if(!nameN)continue;
    if(descN.includes(nameN))matches.push(ws);
  }
  if(matches.length===0)return null;
  if(matches.length===1)return matches[0];
  /* Multiple matches — accept the longest only if every other match is a
     strict substring of it. Otherwise return null (genuinely ambiguous). */
  matches.sort((a,b)=>b.name.length-a.name.length);
  const longest=matches[0];
  const longestN=normalizeAr(longest.name);
  const allContained=matches.slice(1).every(m=>longestN.includes(normalizeAr(m.name)));
  return allContained?longest:null;
}

/* V19.0: Per-piece progress in current stage.
   Returns breakdown of how each garment piece is progressing in the order's current stage.

   Logic per stage:
   - تم القص: each piece = 100% (cut quantity, by definition full at this stage)
   - في التشغيل: Σ wd.qty where garmentType==piece (any workshop)
   - في الطباعة: Σ wd.qty where garmentType==piece AND wsType includes "طباعة"
   - في التطريز: Σ wd.qty where garmentType==piece AND wsType includes "تطريز"
   - تشطيب وتعبئة: Σ receives.qty where wd.garmentType==piece (received back from any workshop)
   - تشطيب وتعبئة خارجي: Σ wd.qty where garmentType==piece AND wsType includes "تشطيب"
   - تم التسليم/جزئي: no per-piece tracking (returns null) — handled separately at UI layer
   - other (الغسيل/تشغيل خارجي/ملغي/etc): each piece = 100% fallback

   Returns:
   {
     hasBreakdown: bool — false for cancelled/done/partial-stock states
     stageName: string — the current stage label
     pieces: [{piece, current, total, pct}]  — sorted by lowest pct first (bottleneck first)
     overall: { current, total, pct }        — sum across pieces
     weakest: piece with lowest pct (or null if all 100%)
     deliveredQty, cutQty                    — for done/partial states
   }
*/
export function getStageProgress(o){
  if(!o||typeof o!=="object")return{hasBreakdown:false,stageName:"",pieces:[],overall:null,weakest:null,deliveredQty:0,cutQty:0};
  const t=calcOrder(o);
  const cutQty=t.cutQty||0;
  const deliveredQty=o.deliveredQty||0;
  const status=o.status||"";
  /* No breakdown for delivered (full or partial) — UI shows simple message instead */
  const isDoneState=status==="تم التسليم لمخزن الجاهز"||status==="في مخزن الجاهز جزئي"||o.closed;
  const isCancelled=status==="ملغي";
  if(isDoneState||isCancelled){
    return{hasBreakdown:false,stageName:status,pieces:[],overall:null,weakest:null,deliveredQty,cutQty};
  }
  /* Determine pieces list */
  let pieces=Array.isArray(o.orderPieces)&&o.orderPieces.length>0?o.orderPieces:["عام"];
  /* Per-stage logic */
  const wds=o.workshopDeliveries||[];
  const stageMatchesWorkshop=(wd,stage)=>{
    if(!wd.wsType)return false;
    if(stage==="في الطباعة")return wd.wsType.includes("طباعة");
    if(stage==="في التطريز")return wd.wsType.includes("تطريز");
    if(stage==="تشطيب وتعبئة خارجي")return wd.wsType.includes("تشطيب");
    return true;/* "في التشغيل" — any workshop */
  };
  const computeForPiece=(piece)=>{
    const total=getPieceCutQty(o,piece)||cutQty||0;
    let current=total;/* default for "تم القص" / fallback */
    if(status==="في التشغيل"||status==="في الطباعة"||status==="في التطريز"||status==="تشطيب وتعبئة خارجي"){
      current=wds.filter(wd=>(wd.garmentType||"عام")===piece&&stageMatchesWorkshop(wd,status))
        .reduce((s,wd)=>s+(Number(wd.qty)||0),0);
    }else if(status==="تشطيب وتعبئة"){
      /* Sum receives across all workshops for this piece */
      current=wds.filter(wd=>(wd.garmentType||"عام")===piece)
        .reduce((s,wd)=>s+(wd.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0),0);
    }
    /* "تم القص" or any other → fallback total (=100%) */
    const pct=total>0?Math.round((current/total)*100):0;
    return{piece,current,total,pct};
  };
  const piecesData=pieces.map(computeForPiece);
  /* Overall: sum across pieces */
  const overallCurrent=piecesData.reduce((s,p)=>s+p.current,0);
  const overallTotal=piecesData.reduce((s,p)=>s+p.total,0);
  const overallPct=overallTotal>0?Math.round((overallCurrent/overallTotal)*100):0;
  /* Sort by lowest pct (bottleneck first) but keep stable order if all equal */
  const sortedPieces=[...piecesData].sort((a,b)=>a.pct-b.pct);
  /* Weakest: piece with lowest pct (only meaningful if it's <100%) */
  const minPct=Math.min(...piecesData.map(p=>p.pct));
  const weakest=minPct<100?sortedPieces[0]:null;
  return{
    hasBreakdown:true,
    stageName:status,
    pieces:sortedPieces,
    overall:{current:overallCurrent,total:overallTotal,pct:overallPct},
    weakest,
    deliveredQty,cutQty,
  };
}
