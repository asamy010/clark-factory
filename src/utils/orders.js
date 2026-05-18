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

   ═══════════════════════════════════════════════════════════════
   V21.9.80 (Bug #8 in cutting audit) — INVARIANT for callers:
   ───────────────────────────────────────────────────────────────
   The cache is keyed by ORDER REFERENCE. If a caller calls calcOrder(o),
   then mutates `o` (e.g. `o.colorsA.push({...})`), and then calls
   calcOrder(o) AGAIN, the second call returns the STALE first result.

   This is safe in CLARK today because the standard mutation pattern is:
     const updated = JSON.parse(JSON.stringify(ord));   // clone
     fn(updated);                                        // mutate clone
     await updateDoc(...,updated);                       // commit
   The clone is a NEW reference → fresh cache entry. The original `ord`
   in `orders` array is untouched.

   This invariant is REQUIRED. If you ever need to read calcOrder, mutate
   the order, then re-read calcOrder in the SAME function scope, you MUST
   deep-clone between the reads:
     const t1=calcOrder(o);
     const clone=JSON.parse(JSON.stringify(o));
     clone.workshopDeliveries.push(...);
     const t2=calcOrder(clone);   // not calcOrder(o) — would return stale t1

   Standard pattern (updOrder, addOrder, replaceOrder) all clone before
   mutating. Verified at: src/App.jsx:4949 (updOrder).
   ═══════════════════════════════════════════════════════════════ */
const _orderCache=new WeakMap();
const _stockCache=new WeakMap();
const _pendingCache=new WeakMap();
/* V21.9.80 (Bug #16): de-dup the missing-qtyPerPiece warning so Ahmed sees
   each (orderId,accId) at most once per session. */
const _warnedMissingQpp=new Set();

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
  let total=0;let linked=false;let anyLinkedInOrder=false;
  FKEYS.forEach(k=>{
    const pieces=order["fabricPieces"+k]||[];
    if(pieces.length>0)anyLinkedInOrder=true;
    if(pieces.includes(piece)){linked=true;total+=sqty(gc(order,k))||0}
  });
  if(linked)return total;
  /* V21.9.80 ROOT-CAUSE FIX (Bug #3 in cutting audit):
     Pre-V21.9.80: unlinked pieces would FALL BACK to global cutQty
     (=sqty(colorsA)). This let users deliver "ghost" pieces to workshops —
     e.g. a "شورت" piece never cut from any fabric would appear in the
     workshop-delivery popup with cutQty=192 (borrowed from fabric A which
     was for قميص). The user could then send 192 شورت to a workshop that
     don't exist as cut pieces, breaking inventory + cost accounting.

     New behavior:
     • If the order uses fabric-piece LINKING for ANY piece, unlinked
       pieces return 0 (they're not cut). The UI's "أوامر قص ناقصة" warning
       in App.jsx:5355 already flags these — now they also can't be sent
       to workshops by mistake.
     • If the order uses NO linking at all (legacy single-fabric workflow),
       fall back to global cutQty as before. Preserves backward compat
       for pre-V19.80.3 orders. */
  if(anyLinkedInOrder)return 0;
  const t=calcOrder(order);
  return t.cutQty||0;
}

export function calcOrder(o){
  if(!o||typeof o!=="object")return{cutQty:0,totalFab:0,fabPer:0,accPer:0,accAll:0,wsCostAll:0,wsCostPer:0,costPer:0,costAll:0,wsCostAllProjected:0,wsCostPerProjected:0,costPerProjected:0,costAllProjected:0,balance:0};
  const cached=_orderCache.get(o);
  if(cached)return cached;
  const mainCut=sqty(gc(o,"A"))||o.cutQty||0;let totalFab=0;const fp=[];
  FKEYS.forEach(k=>{if(!gf(o,k))return;const cost=gcons(o,k)*(gf(o,k,"Price")||0)*slay(gc(o,k));totalFab+=cost;fp.push(mainCut?r2(cost/mainCut):0)});
  const fabPer=fp.reduce((s,v)=>s+v,0);const accPer=(o.accItems||[]).reduce((s,a)=>s+(a.price||0),0);
  /* V15.3: Workshop cost — sum of actual receives from EXTERNAL workshops only.
     Internal workshops excluded (their cost comes from payroll, tracked separately).
     Uses receives (actual) not deliveries (planned) so cost reflects what was really paid.

     V21.9.81 ROOT-CAUSE FIX (Bug #9 in cutting audit):
     Pre-V21.9.81, calcOrder returned a SINGLE costPer based on actual
     incurred (received pieces × actual receive price). Mid-production this
     dramatically under-reported the cost per piece because pending workshop
     deliveries weren't counted. The "تكلفة القطعة" KPI in DetPg looked
     misleadingly cheap until every workshop had returned its pieces.

     Now we compute TWO parallel cost figures:
     • wsCostAll / wsCostPer / costPer / costAll  — ACTUAL incurred only.
       Accounting auto-post uses these (conservative, only post realized).
     • wsCostAllProjected / wsCostPerProjected /
       costPerProjected / costAllProjected         — PROJECTED.
       For each external wd: actual receives + (pending qty × wd.price).
       DetPg KPI uses these (user sees expected cost mid-production).

     The accounting path (api/.../autoPost.js → calcOrder(order).costPer)
     is UNTOUCHED to preserve the existing posting semantics. Only display
     code paths should opt into the projected fields. */
  let wsCostAll=0;
  let wsCostAllProjected=0;
  (o.workshopDeliveries||[]).forEach(wd=>{
    if(wsIsInternal(wd.wsType))return;/* skip internal workshops */
    let received=0;
    let receivedCost=0;
    (wd.receives||[]).forEach(r=>{
      if(r.isSettlement)return;/* skip settlement entries (those are waste adjustments) */
      const rQty=Number(r.qty)||0;
      const rPrice=Number(r.price)||Number(wd.price)||0;/* fallback to wd.price if receive has no price */
      received+=rQty;
      receivedCost+=rQty*rPrice;
    });
    wsCostAll+=receivedCost;
    /* Project pending portion of this wd at wd.price (the negotiated rate) */
    const wdQty=Number(wd.qty)||0;
    const wdPrice=Number(wd.price)||0;
    const pending=Math.max(0,wdQty-received);
    wsCostAllProjected+=receivedCost+(pending*wdPrice);
  });
  const wsCostPer=mainCut>0?r2(wsCostAll/mainCut):0;
  const wsCostPerProjected=mainCut>0?r2(wsCostAllProjected/mainCut):0;
  const result={
    cutQty:mainCut,totalFab,fabPer:r2(fabPer),accPer,accAll:accPer*mainCut,
    wsCostAll:r2(wsCostAll),wsCostPer,
    wsCostAllProjected:r2(wsCostAllProjected),wsCostPerProjected,
    costPer:r2(fabPer+accPer+wsCostPer),
    costAll:r2(totalFab+accPer*mainCut+wsCostAll),
    costPerProjected:r2(fabPer+accPer+wsCostPerProjected),
    costAllProjected:r2(totalFab+accPer*mainCut+wsCostAllProjected),
    balance:mainCut-(o.deliveredQty||0)
  };
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
  /* Accessories: qtyPerPiece × cutQty (this is correct — accessories are per finished piece).
     V21.9.80 (Bug #16 in cutting audit): when qtyPerPiece is missing on an
     accItem (legacy data or accessory added before AccPicker prompted for
     it), the silent default of 1 means stock is deducted at 1-per-piece —
     which is a reasonable default for most accessories (buttons, zippers)
     but WRONG for fractional ones (0.5m of trim per piece) or zero-per-
     piece additions. Behavior preserved (default 1) for backward compat,
     but we now emit a one-time console.warn per (orderId,accId) so Ahmed
     can spot missing data in the diagnostics console. */
  (order.accItems||[]).forEach(ac=>{
    if(!ac.accId)return;
    if(ac.qtyPerPiece==null||ac.qtyPerPiece===""){
      try{
        const key=order.id+":"+ac.accId;
        _warnedMissingQpp.has(key)||(_warnedMissingQpp.add(key),console.warn("[V21.9.80 calcStockNeeded] accessory missing qtyPerPiece — defaulting to 1:",{orderId:order.id,modelNo:order.modelNo,accId:ac.accId,accName:ac.name}));
      }catch(_){}
    }
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

   V21.9.80 (Bug #15 in cutting audit) — STRENGTHENED CONTRACT:
   ───────────────────────────────────────────────────────────
   This function has TWO side effects, both critical:
   1. Mutates `d.fabrics[i].stock` and `d.accessories[i].stock` (the draft
      config) — these get committed by the surrounding upConfig/transaction.
   2. Mutates `order._stockDeducted` on the order object passed in — this
      is the snapshot used for the NEXT delta calculation.

   The caller MUST ensure:
   • `d` is the working draft inside a Firestore transaction or upConfig
     callback. Direct mutation of live state will corrupt other readers.
   • `order` is THE SAME REFERENCE that will be committed back to Firestore
     (the snapshot persists on the order). If you pass a clone and discard
     it, the snapshot is lost and the NEXT save will compute delta as
     `needed - 0 = needed`, deducting stock twice.

   Valid call sites (verified):
   • src/App.jsx:4935  — addOrder transaction (mutates `o` then writes)
   • src/App.jsx:4968  — delOrder refund (constructs returnOrder; snapshot
                          mutation is harmless since the order is deleted)
   • src/App.jsx:5039  — replaceOrder transaction (mutates `clean` then writes)

   Anti-example (do NOT do this):
     const tempOrder={...ord};
     deductStockForOrder(nextCfg, tempOrder, userName);  // snapshot lost
   ─────────────────────────────────────────────────────────── */
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
      /* Time score: ideal = qty/500 * 6.5 days.
         V21.9.80 (Bug #14 in cutting audit): if rcvDate < delDate (user
         typed receive date BEFORE delivery date by mistake), `days` would
         be negative, then Math.max(1, negative) clamps to 1 → top time
         score (10). Workshops with bad date entries got artificially-high
         time ratings.

         Detect inverted dates and SKIP the time score (only count quality).
         The rating remains computable from quality + delivery + consistency. */
      const rcvDate=new Date(r.date);
      const rawDays=Math.floor((rcvDate-delDate)/(1000*60*60*24));
      if(rawDays<0)return;/* skip time score for inverted date entries */
      const days=Math.max(1,rawDays);
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
    /* V21.9.80 (Bug #6 in cutting audit):
       Pre-V21.9.80, when cutQty < sum(receivedQty), the rounding-correction
       step would attempt to subtract `drift` from a `capped` workshop entry,
       silently pushing `newQty < receivedQty`. The final feasibility check
       caught it (`feasible=false`) but the UI just showed a generic
       "infeasible" without explaining WHY.

       Now we detect this case upfront and return a structured `reason` so
       the UI can render an actionable message: cutQty was set lower than
       what workshops already returned, so syncing is mathematically
       impossible — the user must either raise cutQty or zero out the
       receives. */
    const minReceived=p.wds.reduce((s,w)=>s+(Number(w.receivedQty)||0),0);
    if(m.cutQty<minReceived){
      return{piece:p.piece,targetQty:m.cutQty,wds:p.wds,feasible:false,reason:"received_exceeds_cut",minReceived};
    }
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
        /* V21.9.80: when drift<0, only target non-capped entries to keep the
           floor invariant. If every entry is capped, leave drift unresolved
           — the final feasibility check will flag it and the UI shows the
           upstream `received_exceeds_cut` reason. */
        const target=drift<0
          ? candidates.find(c=>!c.capped)
          : (candidates.find(c=>!c.capped)||candidates[0]);
        if(target){
          const tgtIdx=wds.findIndex(w=>w.wdIdx===target.wdIdx);
          if(tgtIdx>=0)wds[tgtIdx].newQty+=drift;
        }
      }
    }
    wds=wds.map(w=>({...w,delta:w.newQty-w.currentQty}));
    const finalSum=wds.reduce((s,w)=>s+w.newQty,0);
    const feasible=finalSum===m.cutQty&&wds.every(w=>w.newQty>=w.receivedQty);
    const reason=feasible?undefined:(finalSum!==m.cutQty?"sum_mismatch":"below_floor");
    return{piece:p.piece,targetQty:m.cutQty,currentTotal:totalCurrent,wds,feasible,reason};
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
    /* Check if enough received back for تشطيب.
       V21.9.80 (Bug #13 in cutting audit): pre-V21.9.80 the threshold was
       GLOBAL — `totalWsRcv >= totalWsDel * 0.3`. A multi-piece order where
       one piece was 100% received and another barely started (1 piece
       received) would flip to "تشطيب" because the global ratio passed 30%,
       even though the second piece was still in workshops at single-digit
       progress. Confused users into thinking finishing was active for
       parts not yet ready.

       New behavior for multi-piece: require EACH piece's received qty to
       be ≥ 30% of its delivered qty. Pieces that weren't sent out at all
       (delP=0) block the transition. */
    let isFinishing=false;
    if(pieces.length>0){
      const allReadyForFinish=pieces.every(p=>{
        const delP=wds.filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0);
        if(delP<=0)return false;
        const rcvP=wds.filter(wd=>wd.garmentType===p).reduce((s,wd)=>(wd.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0)+s,0);
        return rcvP>=delP*0.3;
      });
      if(allReadyForFinish)isFinishing=true;
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
        /* V21.9.80 (Bug #12 in cutting audit): only return "خارجي" if the
           workshop is actually external. Pre-V21.9.80 always returned
           "تشطيب وتعبئة خارجي" — wrong if a future داخلي variant is added,
           or if migration data has odd wsType strings. Use wsIsInternal()
           as the source of truth instead of substring matching. */
        if(lastActive.wsType.includes("تشطيب وتعبئة")){
          return wsIsInternal(lastActive.wsType)?"تشطيب وتعبئة":"تشطيب وتعبئة خارجي";
        }
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

/* Create a new empty order with today's date as default.
   V21.9.80 (Bug #10 in cutting audit): cutDate is set ONLY for slot A
   (the mandatory primary fabric). For B-H, leave empty until the user
   actually picks a fabric for that slot. Pre-V21.9.80 every slot got
   today's date even when never used → misleading "تاريخ القص" in printouts
   and reports for fabric slots that don't exist on the order. */
export function mkOrder(){
  const today=new Date().toISOString().split("T")[0];
  const o={id:gid(),date:today,createdAt:new Date().toISOString(),modelNo:"",modelDesc:"",poNumber:"",sizeSetId:"",sizeLabel:"",status:"تم القص",cutQty:0,deliveredQty:0,accItems:[],deliveries:[],workshopDeliveries:[],orderPieces:[],image:"",instructions:"",attachments:[],marker:""};
  FKEYS.forEach(k=>{o["fabric"+k]="";o["cons"+k]=0;o["cutDate"+k]=k==="A"?today:"";o["colors"+k]=k==="A"?[{color:"",colorHex:"",layers:0,pcsPerLayer:0,qty:0}]:[];o["fabric"+k+"Label"]="";o["fabric"+k+"Price"]=0;o["fabric"+k+"Unit"]=""});
  return o
}

/* Validate order form - returns array of error messages.
   V21.9.79 (Bug #5 + #7 in cutting audit):
   - Defensive `||""` on modelNo/modelDesc to handle legacy/migration data
     where the field may be undefined → `.trim()` would throw TypeError.
   - Validate EVERY color in colorsX, not just ca[0]. Pre-V21.9.79 a user
     could add a second color row with empty name / layers=0 / pcsPerLayer=0
     and save silently — the row would appear blank in printouts and reports
     and inflate the color count without contributing qty. */
export function validateOrder(form){
  const e=[];
  if(!(form.modelNo||"").trim())e.push("رقم الموديل مطلوب");
  if(!(form.modelDesc||"").trim())e.push("وصف الموديل مطلوب");
  if(!form.sizeSetId)e.push("المقاسات مطلوبة");
  if(!form.date)e.push("التاريخ مطلوب");
  /* V19.80.4: pieces are mandatory — multi-piece orders depend on per-piece
     cut quantities and workshop deliveries, and a fabric without a piece
     can't be linked to anything. At least one piece must be selected. */
  if(!Array.isArray(form.orderPieces)||form.orderPieces.length===0)e.push("قطع الموديل مطلوبة — أضف قطعة واحدة على الأقل (قميص / شورت / إلخ)");
  if(!form.fabricA)e.push("خامة A مطلوبة");
  FKEYS.forEach(k=>{
    if(!form["fabric"+k])return;
    const ca=form["colors"+k]||[];
    if(ca.length===0)e.push("لون خامة "+k+" مطلوب");
    if(!gcons(form,k)||gcons(form,k)<=0)e.push("استهلاك خامة "+k+" مطلوب");
    /* V21.9.79: validate every row, label row index for clarity */
    ca.forEach((row,i)=>{
      const rowLabel=ca.length>1?(" (لون "+(i+1)+")"):"";
      if(!row||!row.color)e.push("لون خامة "+k+rowLabel+" مطلوب");
      if(!row||!row.layers||row.layers<=0)e.push("عدد الراقات مطلوب لخامة "+k+rowLabel);
      if(!row||!row.pcsPerLayer||row.pcsPerLayer<=0)e.push("القطع/راق مطلوب لخامة "+k+rowLabel);
    });
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

/* V19.9: Generic party matcher — for customers/suppliers/employees.
   Same logic as matchWorkshopFromDesc but works on any list of {id,name} items.
   Returns the unambiguous match or null when ambiguous/no-match.
   
   Use case: when user fills a treasury entry's بيان field with a customer name
   (e.g. "دفعة من مكتب الرائد") without selecting from the dropdown picker, this
   helper auto-matches the party by name. Without it, treasury entries get
   saved as "دفعة عميل" (category) but with no custId — invisible in customer
   statements and the cash-payment summary card. */
export function matchPartyFromDesc(desc, parties, opts){
  if(!desc||typeof desc!=="string")return null;
  if(!Array.isArray(parties)||parties.length===0)return null;
  /* opts.minNameLength: skip parties with very short names (e.g. "أ") to avoid
     false positives — defaults to 3 chars after normalization. */
  const minLen=(opts&&opts.minNameLength!=null)?opts.minNameLength:3;
  const descN=normalizeAr(desc);
  const matches=[];
  for(const p of parties){
    if(!p||!p.name)continue;
    const name=p.name.trim();
    if(!name)continue;
    const nameN=normalizeAr(name);
    if(!nameN||nameN.length<minLen)continue;
    if(descN.includes(nameN))matches.push(p);
  }
  if(matches.length===0)return null;
  if(matches.length===1)return matches[0];
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
