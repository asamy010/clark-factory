/* ═══════════════════════════════════════════════════════════════
   CLARK - print-extras.js
   
   Extracted from App.jsx in V15.1 phase 3.
   Contains: exportExcel, printReceipt, printLabel, printReceiveReceipt, printWorkshopReport, printOrderSheet, printStockDelivery
   ═══════════════════════════════════════════════════════════════ */

import { Badge } from "../components/ui.jsx";
import { FKEYS, FS } from "../constants/index.js";
import { TD, TDB, TDL, TH } from "../theme.js";
import { gIcon, gc, gcons, gf, ltrPhone } from "../utils/format.js";
import { calcOrder, calcStockNeeded, checkStockAvailability, deductStockForOrder, getOrderDetails, getOrderTimeline, getStatusColor } from "../utils/orders.js";
import { tell } from "../utils/popups.js";
import { printPage } from "../utils/print.js";
import { loadQR, loadXLSX } from "../utils/qr.js";

export async function exportExcel(rows,fileName){const X=await loadXLSX();if(!X){await tell("مكتبة Excel غير متوفرة","يرجى المحاولة مرة أخرى لاحقاً",{type:"error"});return}const ws=X.utils.aoa_to_sheet(rows);ws["!cols"]=rows[0].map(()=>({wch:18}));const wb=X.utils.book_new();X.utils.book_append_sheet(wb,ws,"Sheet1");X.writeFile(wb,fileName+".xlsx")}






export async function printReceipt(wsName,wsOwner,order,garmentType,qty,date,balance,gtList,_returnHtml){
  if(!order){if(_returnHtml)return"";return;}
  const t=calcOrder(order);
  /* Fallback: find wsName from order's workshopDeliveries if not passed */
  let ws=wsName||"";let wdIdx=0;
  if(order.workshopDeliveries){const idx=order.workshopDeliveries.findIndex(w=>w.wsName===(wsName||ws)&&(!garmentType||w.garmentType===garmentType));if(idx>=0)wdIdx=idx;if(!ws){const wd=order.workshopDeliveries[idx>=0?idx:order.workshopDeliveries.length-1];if(wd)ws=wd.wsName||""}}
  let wsO=wsOwner||"";
  if(!wsO&&order.workshopDeliveries){const wd=order.workshopDeliveries.find(w=>w.wsName===ws);if(wd)wsO=wd.wsOwner||""}
  const gi=n=>gIcon(n,gtList);
  /* V16.50: Generate QR for workshop self-confirmation flow.
     V16.58: Switched from CLARK:WSRCV: payload to a URL with ?act=wsdel&ord&ws&idx
     so this QR opens the same wsDelPopup the thermal label uses (V16.50–V16.51).
     One confirmation flow for both prints means workshops see the same UX whether
     they scan the A4 receipt or the thermal label, and we have a single popup
     to maintain. */
  let receiptQrSrc="";
  try{
    const QR=await loadQR();
    if(QR&&order.id&&ws){
      const origin=(typeof window!=="undefined"&&window.location)?window.location.origin:"";
      const qrPayload=origin+"/?act=wsdel&ord="+encodeURIComponent(order.id)+"&ws="+encodeURIComponent(ws)+"&idx="+wdIdx;
      receiptQrSrc=await QR.toDataURL(qrPayload,{width:130,margin:1,errorCorrectionLevel:"M"});
    }
  }catch(e){}
  /* Generate receipt */
  const modelNo=order.modelNo||"";const modelDesc=order.modelDesc||"";const sizeLabel=order.sizeLabel||"";const marker=order.marker||"";
  let h="<h2>اذن تسليم ورشة</h2>";
  /* Order info table */
  h+="<div style='display:flex;gap:16px;align-items:flex-start;margin-bottom:16px'>";
  if(order.image)h+="<div style='width:80px;height:107px;border-radius:8px;overflow:hidden;border:1px solid #ddd;flex-shrink:0'><img src='"+order.image+"' style='width:100%;height:100%;object-fit:cover'/></div>";
  h+="<div style='flex:1'><table>";
  h+="<tr><th>رقم الموديل</th><td><b>"+modelNo+"</b></td><th>الوصف</th><td>"+modelDesc+"</td></tr>";
  h+="<tr><th>المقاسات</th><td>"+sizeLabel+"</td><th>كمية القص</th><td><b>"+t.cutQty+"</b></td></tr>";
  h+="<tr><th>الورشة</th><td><b style='color:#8B5CF6'>"+ws+"</b>"+(wsO?" — "+wsO:"")+"</td><th>التاريخ</th><td>"+(date||"")+"</td></tr>";
  if(garmentType)h+="<tr><th>قطعة التسليم</th><td><b style='color:#8B5CF6'>"+gi(garmentType)+" "+garmentType+"</b></td><th>كمية التسليم</th><td><b style='color:#0284C7;font-size:16px'>"+qty+"</b> قطعة</td></tr>";
  else h+="<tr><th>كمية التسليم</th><td colspan='3'><b style='color:#0284C7;font-size:16px'>"+qty+"</b> قطعة</td></tr>";
  if(marker)h+="<tr><th>ماركر</th><td colspan='3'>"+marker+"</td></tr>";
  h+="</table></div></div>";
  /* Fabric details - only fabrics assigned to this garment piece */
  const activeFabs=FKEYS.filter(k=>gf(order,k));
  const fabsForPiece=activeFabs.filter(k=>{if(!garmentType)return true;const fp=order["fabricPieces"+k]||[];return fp.length===0||fp.includes(garmentType)});
  fabsForPiece.forEach(k=>{const colors=gc(order,k);if(colors.length===0)return;
    const label=gf(order,k,"Label")||("خامة "+k);const cons=gcons(order,k);const unit=gf(order,k,"Unit")||"";
    h+="<h2 style='font-size:13px;margin:14px 0 4px'>"+(garmentType?""+gi(garmentType)+" "+garmentType+" — "+label:label)+"</h2>";
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
  /* V16.50: Signatures + QR (workshop scans this from their phone to confirm) */
  if(receiptQrSrc){
    h+="<div style='display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-top:24px'>";
    h+="<div class='sig-box' style='flex:1'>توقيع صاحب الورشة<br/><span style='font-size:11px;color:#8B5CF6'>"+ws+"</span></div>";
    h+="<div class='sig-box' style='flex:1'>مسؤول القص والتسليم</div>";
    h+="<div style='text-align:center;flex-shrink:0'><img src='"+receiptQrSrc+"' style='width:100px;height:100px;display:block'/><div style='font-size:9px;color:#475569;margin-top:3px;font-weight:700'>📱 امسح للتأكيد</div></div>";
    h+="</div>";
  }else{
    h+="<div class='sig'><div class='sig-box'>توقيع صاحب الورشة<br/><span style='font-size:11px;color:#8B5CF6'>"+ws+"</span></div><div class='sig-box'>مسؤول القص والتسليم</div></div>";
  }
  if(_returnHtml)return h;
  printPage("اذن تسليم ورشة — "+modelNo,h)
}

/* getOrderDetails, getOrderTimeline moved to utils/orders.js (V15.0) */


export async function printLabel(wsName,order,garmentType,qty,date,gtList,opts){
  if(!order)return;
  const t=calcOrder(order);
  const type=(opts?.type)||"deliver";const rcvDate=opts?.rcvDate||"";const delDate=opts?.delDate||date||"";const rcvQty=opts?.rcvQty||0;const delQty=opts?.delQty||qty;
  const isRcv=type==="receive";const title=isRcv?"استلام مصنع":"تسليم ورشة";const arrow=isRcv?"↙":"↗";
  /* V16.50: identify the workshop delivery being printed so the label can carry
     a confirmation QR. wsId is found from the workshop list inside the order's
     deliveries; deliveryIdx is the position of the matching deliver entry in the
     order.workshopDeliveries array. Both are best-effort — if they can't be
     resolved (legacy data), the QR simply won't render. */
  let wsId="";let deliveryIdx=-1;
  if(!isRcv&&Array.isArray(order.workshopDeliveries)){
    /* Find most-recent matching deliver entry: same wsName, same garmentType (or both empty), same date+qty */
    for(let i=order.workshopDeliveries.length-1;i>=0;i--){
      const wd=order.workshopDeliveries[i];if(!wd)continue;
      const gtMatch=(garmentType&&wd.garmentType===garmentType)||(!garmentType&&!wd.garmentType);
      if(wd.wsName===wsName&&gtMatch&&Number(wd.qty)===Number(delQty)){deliveryIdx=i;wsId=wd.wsId||"";break}
    }
  }
  const d={title,arrow,qrSrc:"",piece:garmentType||"عام",qty:isRcv?rcvQty:delQty,
    modelNo:order.modelNo||"",modelDesc:order.modelDesc||"",sizeLabel:order.sizeLabel||"",
    wsName,cutQty:t.cutQty,delQty,delDate,rcvQty,rcvDate,isRcv,
    /* V16.50 — fields used by App.jsx to build the confirmation URL */
    orderId:order.id||"",wsId,deliveryIdx
  };
  /* Store data and trigger popup event */
  window.__labelData=d;window.dispatchEvent(new Event("show-label-popup"))
}



export async function printReceiveReceipt(wsName,order,garmentType,qty,date,balance,gtList,_returnHtml){
  if(!order){if(_returnHtml)return"";printPage("اذن استلام مصنع","<p>بيانات غير متوفرة</p>");return}
  const t=calcOrder(order);const gi=n=>gIcon(n,gtList);
  let ws=wsName||"";
  if(!ws&&order.workshopDeliveries){const wd=order.workshopDeliveries.find(w=>w.garmentType===garmentType)||order.workshopDeliveries[order.workshopDeliveries.length-1];if(wd)ws=wd.wsName||""}
  const modelNo=order.modelNo||"";const modelDesc=order.modelDesc||"";const sizeLabel=order.sizeLabel||"";const marker=order.marker||"";
  /* Generate workshop QR */
  let wsQrSrc="";try{const QR=await loadQR();if(QR&&ws)wsQrSrc=await QR.toDataURL(window.location.origin+"?act=wsacc&ws="+encodeURIComponent(ws),{width:130,margin:1,errorCorrectionLevel:"L"})}catch(e){}
  let h="<h2>اذن استلام مصنع</h2>";
  h+="<div style='display:flex;gap:16px;align-items:flex-start;margin-bottom:16px'>";
  if(order.image)h+="<div style='width:80px;height:107px;border-radius:8px;overflow:hidden;border:1px solid #ddd;flex-shrink:0'><img src='"+order.image+"' style='width:100%;height:100%;object-fit:cover'/></div>";
  h+="<div style='flex:1'><table>";
  h+="<tr><th>رقم الموديل</th><td><b>"+modelNo+"</b></td><th>الوصف</th><td>"+modelDesc+"</td></tr>";
  h+="<tr><th>المقاسات</th><td>"+sizeLabel+"</td><th>كمية القص</th><td><b>"+t.cutQty+"</b></td></tr>";
  h+="<tr><th>الورشة</th><td><b style='color:#8B5CF6'>"+ws+"</b></td><th>التاريخ</th><td>"+(date||"")+"</td></tr>";
  if(garmentType)h+="<tr><th>القطعة</th><td><b style='color:#8B5CF6'>"+gi(garmentType)+" "+garmentType+"</b></td><th>كمية الاستلام</th><td><b style='color:#10B981;font-size:16px'>"+qty+"</b> قطعة</td></tr>";
  else h+="<tr><th>كمية الاستلام</th><td colspan='3'><b style='color:#10B981;font-size:16px'>"+qty+"</b> قطعة</td></tr>";
  if(marker)h+="<tr><th>ماركر</th><td colspan='3'>"+marker+"</td></tr>";
  h+="</table></div></div>";
  /* Fabric details */
  const activeFabs=FKEYS.filter(k=>gf(order,k));
  const fabsForPiece=activeFabs.filter(k=>{if(!garmentType)return true;const fp=order["fabricPieces"+k]||[];return fp.length===0||fp.includes(garmentType)});
  fabsForPiece.forEach(k=>{const colors=gc(order,k);if(colors.length===0)return;
    const label=gf(order,k,"Label")||("خامة "+k);const cons=gcons(order,k);const unit=gf(order,k,"Unit")||"";
    h+="<h2 style='font-size:13px;margin:14px 0 4px'>"+(garmentType?""+gi(garmentType)+" "+garmentType+" — "+label:label)+"</h2>";
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
  /* Workshop QR + Signature */
  if(wsQrSrc)h+="<div style='display:flex;justify-content:space-between;align-items:flex-end;margin-top:30px'><div style='text-align:center;width:200px'><div style='border-top:2px solid #333;padding-top:8px;font-weight:700;font-size:12px'>توقيع المستلم</div></div><div style='text-align:center'><img src='"+wsQrSrc+"' style='width:94px;height:94px'/><div style='font-size:8px;color:#94A3B8;margin-top:2px'>كشف حساب "+ws+"</div></div></div>";
  else h+="<div style='margin-top:50px;text-align:center;width:200px'><div style='border-top:2px solid #333;padding-top:8px;font-weight:700;font-size:13px'>توقيع المستلم</div></div>";
  if(_returnHtml)return h;
  printPage("اذن استلام مصنع — "+modelNo,h)
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



/* ═══════════════════════════════════════════════════════════════
   STOCK MANAGEMENT — Hard Block + Auto Deduct
   
   calcStockNeeded(order): returns {fabrics:{id:qty}, accessories:{id:qty}}
   checkStockAvailability(order, data): returns {ok, shortages[]}
   deductStockForOrder(d, order, userName): mutates draft to deduct (delta-aware)
   
   Uses _stockDeducted snapshot on the order for delta calculations.
   ═══════════════════════════════════════════════════════════════ */







/* ═══ V14.51: Print workshop activity report for an order ═══ */


export async function printWorkshopReport(order,filterWsName){
  const wds=(order.workshopDeliveries||[]).filter(wd=>!filterWsName||wd.wsName===filterWsName);
  if(wds.length===0){printPage("كشف تشغيل خارجي","<p>لا توجد حركات</p>");return}
  /* Group by workshop */
  const wsGroup={};
  wds.forEach(wd=>{if(!wsGroup[wd.wsName])wsGroup[wd.wsName]=[];wsGroup[wd.wsName].push(wd)});
  const title=filterWsName?("كشف تشغيل خارجي — "+filterWsName):"كشف تشغيل خارجي (جميع الورش)";
  let h="<div style='margin-bottom:14px'><h2 style='font-size:16px;margin:0 0 4px;color:#0284C7'>"+title+"</h2>";
  h+="<div style='font-size:12px;color:#64748B'>موديل: <b>"+order.modelNo+"</b> — "+(order.modelDesc||"")+(order.poNumber?" • PO: <b>"+order.poNumber+"</b>":"")+"</div>";
  h+="<div style='font-size:11px;color:#94A3B8;margin-top:3px'>تاريخ الطباعة: "+new Date().toLocaleString("ar-EG")+"</div></div>";

  Object.entries(wsGroup).forEach(([wsName,items])=>{
    const totalDel=items.reduce((s,wd)=>s+(Number(wd.qty)||0),0);
    const totalRcv=items.reduce((s,wd)=>s+(wd.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0),0);
    const bal=totalDel-totalRcv;
    const progress=totalDel>0?Math.round((totalRcv/totalDel)*100):0;
    h+="<div style='margin-bottom:16px;border:1px solid #E2E8F0;border-radius:8px;overflow:hidden;break-inside:avoid'>";
    /* Workshop header */
    h+="<div style='background:linear-gradient(135deg,#8B5CF608,#8B5CF604);padding:10px 14px;border-bottom:1px solid #E2E8F0'>";
    h+="<div style='display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px'>";
    h+="<div><span style='font-weight:800;font-size:14px;color:#8B5CF6'>🏭 "+wsName+"</span></div>";
    h+="<div style='display:flex;gap:8px;font-size:11px;flex-wrap:wrap'>";
    h+="<span style='padding:3px 10px;border-radius:6px;background:#8B5CF612;color:#8B5CF6;font-weight:700'>تسليم: "+totalDel+"</span>";
    h+="<span style='padding:3px 10px;border-radius:6px;background:#10B98112;color:#10B981;font-weight:700'>استلام: "+totalRcv+"</span>";
    h+="<span style='padding:3px 10px;border-radius:6px;background:"+(bal>0?"#EF444412":"#10B98112")+";color:"+(bal>0?"#EF4444":"#10B981")+";font-weight:700'>"+(bal>0?"رصيد: "+bal:"✓ مكتمل")+"</span>";
    h+="<span style='padding:3px 10px;border-radius:6px;background:"+(progress>=80?"#10B98112":progress>=50?"#F59E0B12":"#EF444412")+";color:"+(progress>=80?"#10B981":progress>=50?"#F59E0B":"#EF4444")+";font-weight:700'>"+progress+"%</span>";
    h+="</div></div></div>";
    /* Movements */
    items.forEach(wd=>{
      const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);
      h+="<div style='padding:10px 14px;border-bottom:1px solid #F1F5F9'>";
      h+="<div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:6px'>";
      h+="<span style='font-weight:700;font-size:13px;color:#1E293B'>"+(wd.garmentType||"عام")+"</span>";
      h+="<span style='font-size:11px;color:#64748B'>تسليم: "+wd.date+"</span>";
      h+="</div>";
      h+="<table style='width:100%;border-collapse:collapse;font-size:11px;margin-top:6px'>";
      h+="<thead><tr style='background:#F8FAFC'><th style='padding:5px 8px;text-align:right;border:1px solid #E2E8F0'>نوع الحركة</th><th style='padding:5px 8px;border:1px solid #E2E8F0'>التاريخ</th><th style='padding:5px 8px;border:1px solid #E2E8F0'>الكمية</th><th style='padding:5px 8px;border:1px solid #E2E8F0'>الجودة</th><th style='padding:5px 8px;border:1px solid #E2E8F0'>ملاحظات</th></tr></thead><tbody>";
      /* Delivery row */
      h+="<tr style='background:#F5F3FF'><td style='padding:5px 8px;border:1px solid #E2E8F0;font-weight:700;color:#8B5CF6'>📤 تسليم</td><td style='padding:5px 8px;text-align:center;border:1px solid #E2E8F0'>"+wd.date+"</td><td style='padding:5px 8px;text-align:center;border:1px solid #E2E8F0;font-weight:700'>"+wd.qty+"</td><td style='padding:5px 8px;text-align:center;border:1px solid #E2E8F0'>-</td><td style='padding:5px 8px;border:1px solid #E2E8F0'>"+(wd.notes||"-")+"</td></tr>";
      /* Receives rows */
      (wd.receives||[]).forEach(r=>{
        const isSet=!!r.isSettlement;
        h+="<tr style='background:"+(isSet?"#FEF2F2":"#F0FDF4")+"'><td style='padding:5px 8px;border:1px solid #E2E8F0;font-weight:700;color:"+(isSet?"#EF4444":"#10B981")+"'>"+(isSet?"⚖️ تسوية":"📥 استلام")+"</td><td style='padding:5px 8px;text-align:center;border:1px solid #E2E8F0'>"+r.date+"</td><td style='padding:5px 8px;text-align:center;border:1px solid #E2E8F0;font-weight:700'>"+r.qty+"</td><td style='padding:5px 8px;text-align:center;border:1px solid #E2E8F0'>"+(r.quality||"-")+"</td><td style='padding:5px 8px;border:1px solid #E2E8F0'>"+(r.notes||"-")+"</td></tr>";
      });
      if((wd.receives||[]).length===0){
        h+="<tr><td colspan='5' style='padding:5px 8px;border:1px solid #E2E8F0;text-align:center;color:#94A3B8;font-style:italic'>لم يتم استلام أي كمية بعد</td></tr>";
      }
      h+="</tbody></table>";
      /* Balance for this item */
      const itemBal=(Number(wd.qty)||0)-rcvd;
      if(itemBal>0){h+="<div style='margin-top:5px;padding:4px 10px;background:#FEF2F2;border-radius:5px;font-size:11px;color:#EF4444;font-weight:700;display:inline-block'>⚠️ رصيد باقي: "+itemBal+" قطعة</div>"}
      h+="</div>";
    });
    h+="</div>";
  });
  printPage(title,h);
}



export async function printOrderSheet(order,t,activeFabs,statusCards){
  let wsRows="";(order.workshopDeliveries||[]).forEach(wd=>{const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);wsRows+="<tr><td>"+wd.wsName+"</td><td>"+(wd.garmentType||"-")+"</td><td>"+wd.qty+"</td><td>"+rcvd+"</td><td>"+(wd.qty-rcvd)+"</td></tr>"});
  const col=getStatusColor(order.status,statusCards);
  const pieces=order.orderPieces||[];
  let h="<div style='display:flex;gap:16px;align-items:flex-start;margin-bottom:16px'>";
  if(order.image)h+="<div style='width:100px;height:133px;border-radius:8px;overflow:hidden;border:1px solid #ddd;flex-shrink:0'><img src='"+order.image+"' style='width:100%;height:100%;object-fit:cover'/></div>";
    h+="<div style='flex:1'><table><tr><th>رقم الموديل</th><td><b style='font-size:16px;color:#0284C7'>"+order.modelNo+"</b></td><th>الوصف</th><td>"+order.modelDesc+"</td></tr><tr><th>المقاسات</th><td>"+order.sizeLabel+"</td><th>التاريخ</th><td>"+order.date+"</td></tr><tr><th>كمية القص</th><td><b style='font-size:15px;color:#0284C7'>"+t.cutQty+"</b></td><th>الحالة</th><td><span class='badge' style='background:"+col+"20;color:"+col+"'>"+order.status+"</span></td></tr>"+(order.marker?"<tr><th>ماركر</th><td colspan='3'>"+order.marker+"</td></tr>":"")+"</table></div></div>";
  /* Order pieces */
  if(pieces.length>0){h+="<div style='margin-bottom:12px;padding:8px 14px;background:#F8FAFC;border-radius:8px;border:1px solid #E2E8F0'><span style='font-weight:700;font-size:12px;color:#475569'>قطع الموديل: </span>";pieces.forEach(p=>{h+="<span style='display:inline-block;padding:3px 10px;margin:2px 3px;border-radius:6px;font-size:11px;font-weight:600;background:#8B5CF615;color:#8B5CF6;border:1px solid #8B5CF630'>"+p+"</span>"});h+="</div>"}
  /* Fabric tables */
  if(activeFabs.length>0){h+="<h2 style='font-size:14px;margin:12px 0 6px'>الخامات</h2>";
    activeFabs.forEach(k=>{const colors=gc(order,k);const fp=order["fabricPieces"+k]||[];const cons=gcons(order,k);const unit=gf(order,k,"Unit")||"";
      h+="<div style='margin-bottom:10px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden'>";
      h+="<div style='background:#f1f5f9;padding:6px 12px;font-weight:700;font-size:12px;display:flex;justify-content:space-between'><span>"+gf(order,k,"Label")+"</span><span>استهلاك/راق: "+cons+(unit?" "+unit:"")+(fp.length>0?" | القطع: "+fp.join("، "):"")+"</span></div>";
      h+="<table style='margin:0'><tr><th>اللون</th><th>الراقات</th><th>قطع/راق</th><th>اجمالي القطع</th></tr>";
      let totalLayers=0,totalQty=0;colors.forEach(c=>{const q=(Number(c.layers)||0)*(Number(c.pcsPerLayer)||0);totalLayers+=(Number(c.layers)||0);totalQty+=q;
        h+="<tr><td>"+(c.color||"-")+"</td><td style='font-weight:700'>"+(c.layers||0)+"</td><td>"+(c.pcsPerLayer||0)+"</td><td style='font-weight:700;color:#0284C7'>"+q+"</td></tr>"});
      h+="<tr style='background:#f8fafc;font-weight:800'><td>الاجمالي</td><td>"+totalLayers+"</td><td></td><td style='color:#0284C7'>"+totalQty+"</td></tr>";
      h+="</table></div>"})};
  if(wsRows)h+="<h2 style='font-size:14px;margin:12px 0 6px'>الورش</h2><table><tr><th>الورشة</th><th>القطعة</th><th>الكمية</th><th>استلام مصنع</th><th>رصيد حالي</th></tr>"+wsRows+"</table>";
  if(order.instructions)h+="<h2 style='font-size:14px;margin:12px 0 6px'>تعليمات التشغيل</h2><div style='background:#f8fafc;padding:10px;border-radius:6px;white-space:pre-wrap;font-size:12px'>"+order.instructions+"</div>";
  h+="<div class='sig'><div class='sig-box'>توقيع مسؤول القص</div><div class='sig-box'>مسؤول التشغيل</div><div class='sig-box'>مدير الانتاج</div></div>";
  printPage("أمر قص — "+order.modelNo,h)
}



export async function printStockDelivery(order,qty,date,note,totalDelivered,totalCut){
  if(!order)return;
  let h="<div style='display:flex;gap:16px;align-items:flex-start;margin-bottom:16px'>";
  if(order.image)h+="<div style='width:80px;height:107px;border-radius:8px;overflow:hidden;border:1px solid #ddd;flex-shrink:0'><img src='"+order.image+"' style='width:100%;height:100%;object-fit:cover'/></div>";
    h+="<div style='flex:1'><table>";
  h+="<tr><th>رقم الموديل</th><td><b style='font-size:16px;color:#059669'>"+order.modelNo+"</b></td><th>الوصف</th><td>"+order.modelDesc+"</td></tr>";
  h+="<tr><th>المقاسات</th><td>"+order.sizeLabel+"</td><th>التاريخ</th><td><b>"+date+"</b></td></tr>";
  h+="<tr><th>كمية التسليم</th><td><b style='font-size:18px;color:#059669'>"+qty+"</b> قطعة</td><th>اجمالي القص</th><td>"+totalCut+"</td></tr>";
  h+="<tr><th>اجمالي التسليم للمخزن</th><td><b>"+totalDelivered+"</b></td><th>المتبقي</th><td><b style='color:"+(totalCut-totalDelivered>0?"#EF4444":"#10B981")+"'>"+(totalCut-totalDelivered)+"</b></td></tr>";
  if(note)h+="<tr><th>ملاحظات</th><td colspan='3'>"+note+"</td></tr>";
  h+="</table></div></div>";
  /* Statement */
  h+="<div style='margin:20px 0;padding:14px;border:2px solid #CBD5E1;border-radius:10px;background:#F0FDF4;font-size:12px;line-height:2;text-align:center'>";
  h+="أقر بأنني استلمت الكمية المذكورة أعلاه وتم ادخالها للمخزن بعد الفحص والمراجعة</div>";
  h+="<div class='sig'><div class='sig-box'>أمين المخزن</div><div class='sig-box'>مسؤول التشطيب</div><div class='sig-box'>مدير الانتاج</div></div>";
  h+="<div style='margin-top:16px;text-align:center;font-size:10px;color:#94A3B8;border-top:1px solid #E2E8F0;padding-top:8px'>CLARK ERP System — "+new Date().toLocaleDateString("ar-EG")+"</div>";
  printPage("اذن تسليم مخزن — "+order.modelNo,h)
}

/* V16.60: Arabic number-to-words converter for cash receipts.
   Handles 0 to 999,999,999 with reasonable Arabic grammar (the "بالحروف"
   line on Egyptian cash receipts). Skips fractional piasters — amounts
   are rounded to whole pounds since fmt0 (V16.45) drops decimals system-wide.
   
   Grammar shortcuts:
   - 1×million = "مليون", 2 = "مليونان", 3-10 = "X ملايين", 11+ = "X مليوناً"
   - same shape for thousands (ألف / ألفان / آلاف / ألف)
   - tens use "X و Y" form (e.g. "خمسة و أربعون" not "أربعة وخمسة")
   - parts joined with "و" so a real receipt reads naturally */
const _ONES_AR=['','واحد','اثنان','ثلاثة','أربعة','خمسة','ستة','سبعة','ثمانية','تسعة'];
const _TENS_AR=['','عشرة','عشرون','ثلاثون','أربعون','خمسون','ستون','سبعون','ثمانون','تسعون'];
const _TEENS_AR=['عشرة','أحد عشر','اثنا عشر','ثلاثة عشر','أربعة عشر','خمسة عشر','ستة عشر','سبعة عشر','ثمانية عشر','تسعة عشر'];
const _HUNDREDS_AR=['','مائة','مائتان','ثلاثمائة','أربعمائة','خمسمائة','ستمائة','سبعمائة','ثمانمائة','تسعمائة'];
function _below1000Ar(n){
  if(n===0)return'';
  if(n<10)return _ONES_AR[n];
  if(n<20)return _TEENS_AR[n-10];
  if(n<100){const o=n%10,t=Math.floor(n/10);return o>0?(_ONES_AR[o]+' و'+_TENS_AR[t]):_TENS_AR[t]}
  const h=Math.floor(n/100),rest=n%100;
  return rest>0?(_HUNDREDS_AR[h]+' و'+_below1000Ar(rest)):_HUNDREDS_AR[h];
}
export function arabicNumberToWords(num){
  num=Math.floor(Math.abs(Number(num)||0));
  if(num===0)return'صفر';
  const millions=Math.floor(num/1000000);
  const thousands=Math.floor((num%1000000)/1000);
  const ones=num%1000;
  const parts=[];
  if(millions>0){
    if(millions===1)parts.push('مليون');
    else if(millions===2)parts.push('مليونان');
    else if(millions<=10)parts.push(_below1000Ar(millions)+' ملايين');
    else parts.push(_below1000Ar(millions)+' مليوناً');
  }
  if(thousands>0){
    if(thousands===1)parts.push('ألف');
    else if(thousands===2)parts.push('ألفان');
    else if(thousands<=10)parts.push(_below1000Ar(thousands)+' آلاف');
    else parts.push(_below1000Ar(thousands)+' ألف');
  }
  if(ones>0)parts.push(_below1000Ar(ones));
  return parts.join(' و');
}

/* V16.60: Print formal cash receipt for a treasury transaction.
   Two flavors based on tx.type:
   - "in"  → "إيصال استلام نقدية" (received cash from a customer / capital / etc.)
   - "out" → "إيصال صرف نقدية"   (paid cash to a supplier / employee / expense)
   
   The receipt is A4 portrait, half-page (so two can be printed per sheet for
   the customer copy + the office copy). Includes:
   - Brand header (factory name + logo)
   - Receipt # (derived from tx.id last 6 chars)
   - Date + day name
   - Party name + phone + address (if available)
   - Amount in digits — large, prominent, color-coded green/red
   - Amount in Arabic words ("بالحروف: ...")
   - Reason/category/notes/treasury account
   - Signature lines: المستلم — المحاسب — المدير
   - Recorded-by / created-at footer */
export function printCashReceipt(tx,partyInfo,configInfo){
  if(!tx){alert("لا توجد بيانات حركة");return}
  const isIn=tx.type==="in";
  const title=isIn?"إيصال استلام نقدية":"إيصال صرف نقدية";
  const accentColor=isIn?"#059669":"#DC2626";
  const arrowIcon=isIn?"↓":"↑";
  const partyLabel=isIn?"استلمت من السيد/الشركة":"دفعت إلى السيد/الشركة";
  const amountColor=isIn?"#059669":"#DC2626";
  /* Receipt number: short stable ID. tx.id is a string/number — take last 6 chars,
     uppercase, prefix with R for "Receipt". Falls back to a date-based stamp. */
  const idStr=String(tx.id||"");
  const rcptNo="R-"+(idStr.length>=6?idStr.slice(-6).toUpperCase():(Date.now()%1000000).toString());
  const amount=Math.round(Number(tx.amount)||0);
  const amountFmt=amount.toLocaleString("en-US");
  const amountWords=arabicNumberToWords(amount);
  const partyName=(partyInfo&&partyInfo.name)||tx.custName||tx.supplierName||tx.empName||tx.wsName||"—";
  const partyPhone=(partyInfo&&partyInfo.phone)||"";
  const partyAddress=(partyInfo&&partyInfo.address)||"";
  const reasonParts=[];
  if(tx.desc)reasonParts.push(tx.desc);
  if(tx.notes&&tx.notes!==tx.desc)reasonParts.push(tx.notes);
  const reasonText=reasonParts.join(" — ")||"—";
  /* Build the inner HTML — printPage wraps it with header + footer */
  let h="<div style='max-width:170mm;margin:0 auto'>";
  /* Top metadata bar */
  h+="<div style='display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:"+accentColor+"08;border:2px solid "+accentColor+"40;border-radius:10px;margin-bottom:18px'>";
  h+="<div style='display:flex;align-items:center;gap:10px'>";
  h+="<span style='font-size:24px;color:"+accentColor+"'>"+arrowIcon+"</span>";
  h+="<div><div style='font-size:18px;font-weight:900;color:"+accentColor+"'>"+title+"</div>";
  h+="<div style='font-size:11px;color:#64748B;font-weight:600'>"+(tx.day||"")+" — "+(tx.date||"")+"</div></div></div>";
  h+="<div style='text-align:left'><div style='font-size:10px;color:#64748B;font-weight:600'>رقم الإيصال</div>";
  h+="<div style='font-size:14px;font-weight:800;color:#1E293B;font-family:monospace'>"+rcptNo+"</div></div>";
  h+="</div>";
  /* Party info */
  h+="<table style='width:100%;border-collapse:collapse;margin-bottom:14px;font-size:13px'>";
  h+="<tr><th style='text-align:right;padding:8px 12px;background:#F8FAFC;font-weight:700;width:30%;border:1px solid #E2E8F0'>"+partyLabel+"</th>";
  h+="<td style='padding:8px 12px;font-weight:800;font-size:15px;border:1px solid #E2E8F0'>"+partyName+"</td></tr>";
  if(partyPhone)h+="<tr><th style='text-align:right;padding:6px 12px;background:#F8FAFC;font-weight:700;border:1px solid #E2E8F0'>التليفون</th><td style='padding:6px 12px;font-weight:600;border:1px solid #E2E8F0;direction:ltr;text-align:right'>"+ltrPhone(partyPhone)+"</td></tr>";
  if(partyAddress)h+="<tr><th style='text-align:right;padding:6px 12px;background:#F8FAFC;font-weight:700;border:1px solid #E2E8F0'>العنوان</th><td style='padding:6px 12px;font-weight:600;border:1px solid #E2E8F0'>"+partyAddress+"</td></tr>";
  h+="</table>";
  /* Amount block — prominent */
  h+="<div style='border:3px solid "+amountColor+";border-radius:14px;padding:20px;margin-bottom:14px;background:linear-gradient(135deg,"+amountColor+"06,"+amountColor+"02);text-align:center'>";
  h+="<div style='font-size:11px;font-weight:700;color:#64748B;letter-spacing:1px;margin-bottom:4px'>المبلغ</div>";
  h+="<div style='font-size:38px;font-weight:900;color:"+amountColor+";line-height:1.1;font-family:monospace'>"+amountFmt+" <span style='font-size:18px'>ج.م</span></div>";
  h+="<div style='font-size:13px;color:#475569;margin-top:10px;line-height:1.7;padding:8px 14px;background:#fff;border-radius:8px;border:1px dashed #94A3B8;font-weight:600'>";
  h+="<span style='color:#64748B;font-weight:700'>فقط: </span><span style='color:#1E293B;font-weight:800'>"+amountWords+" جنيهاً مصرياً لا غير</span>";
  h+="</div></div>";
  /* Reason / category / treasury */
  h+="<table style='width:100%;border-collapse:collapse;margin-bottom:18px;font-size:12px'>";
  h+="<tr><th style='text-align:right;padding:8px 12px;background:#F8FAFC;font-weight:700;width:30%;border:1px solid #E2E8F0'>وذلك مقابل</th>";
  h+="<td style='padding:8px 12px;font-weight:600;border:1px solid #E2E8F0'>"+reasonText+"</td></tr>";
  if(tx.category)h+="<tr><th style='text-align:right;padding:6px 12px;background:#F8FAFC;font-weight:700;border:1px solid #E2E8F0'>التصنيف</th><td style='padding:6px 12px;border:1px solid #E2E8F0'><span style='padding:2px 10px;border-radius:6px;background:"+accentColor+"15;color:"+accentColor+";font-weight:700'>"+tx.category+"</span></td></tr>";
  if(tx.account)h+="<tr><th style='text-align:right;padding:6px 12px;background:#F8FAFC;font-weight:700;border:1px solid #E2E8F0'>الخزنة</th><td style='padding:6px 12px;font-weight:700;border:1px solid #E2E8F0'>"+tx.account+"</td></tr>";
  if(tx.season)h+="<tr><th style='text-align:right;padding:6px 12px;background:#F8FAFC;font-weight:700;border:1px solid #E2E8F0'>الموسم</th><td style='padding:6px 12px;color:#64748B;border:1px solid #E2E8F0'>"+tx.season+"</td></tr>";
  h+="</table>";
  /* Signatures */
  h+="<div style='margin-top:30px;display:flex;gap:14px;justify-content:space-between'>";
  h+="<div style='flex:1;text-align:center'><div style='border-top:2px solid #1E293B;padding-top:8px;font-weight:800;font-size:12px;color:#475569'>"+(isIn?"المستلم":"المستلم النقدية")+"</div><div style='font-size:9px;color:#94A3B8;margin-top:2px'>("+(isIn?"المحاسب":partyName)+")</div></div>";
  h+="<div style='flex:1;text-align:center'><div style='border-top:2px solid #1E293B;padding-top:8px;font-weight:800;font-size:12px;color:#475569'>المحاسب</div><div style='font-size:9px;color:#94A3B8;margin-top:2px'>("+(tx.by||"—")+")</div></div>";
  h+="<div style='flex:1;text-align:center'><div style='border-top:2px solid #1E293B;padding-top:8px;font-weight:800;font-size:12px;color:#475569'>المدير</div><div style='font-size:9px;color:#94A3B8;margin-top:2px;color:transparent'>.</div></div>";
  h+="</div>";
  /* Audit footer */
  h+="<div style='margin-top:20px;padding-top:8px;border-top:1px dashed #94A3B8;font-size:9px;color:#94A3B8;display:flex;justify-content:space-between'>";
  h+="<span>أنشأ بواسطة: "+(tx.by||"—")+(tx.updatedBy&&tx.updatedBy!==tx.by?" • عدّل: "+tx.updatedBy:"")+"</span>";
  h+="<span>تم الإنشاء: "+(tx.createdAt?new Date(tx.createdAt).toLocaleString("ar-EG"):"—")+"</span>";
  h+="</div>";
  h+="</div>";
  printPage(title+" — "+rcptNo,h,configInfo);
}

/* V16.62: Print check receipt voucher (إذن استلام/تسليم شيك).
   Two flavors based on check.type:
   - "receivable" → "إذن استلام شيك" (we received a cheque from a customer)
   - "payable"    → "إذن تسليم شيك"  (we delivered a cheque to a supplier)
   
   Cheque receipts in Egyptian factories are formal handover documents — they
   serve as proof that the cheque physically changed hands. Layout differs from
   the cash receipt because cheques carry their own metadata (bank, check #,
   due date) that needs to be prominent so both parties can verify the document
   matches the physical cheque on the table.
   
   Always includes a "طلب التوقيع" prompt + dual signature lines so the
   recipient signs to acknowledge the handover. */
export function printCheckReceipt(check,partyInfo,configInfo){
  if(!check){alert("لا توجد بيانات شيك");return}
  const isReceiving=check.type==="receivable";/* we receive vs we deliver */
  const title=isReceiving?"إذن استلام شيك":"إذن تسليم شيك";
  const accentColor=isReceiving?"#059669":"#DC2626";
  const arrowIcon=isReceiving?"📥":"📤";
  /* Phrasing flips: when receiving, customer is "the giver"; when paying,
     supplier is "the receiver" of the cheque. */
  const partyLabel=isReceiving?"استلمنا الشيك من":"سلمنا الشيك إلى";
  const partyName=(partyInfo&&partyInfo.name)||check.party||"—";
  const partyPhone=(partyInfo&&partyInfo.phone)||"";
  const partyAddress=(partyInfo&&partyInfo.address)||"";
  /* Receipt number — distinct prefix from cash receipts (CR-) so they're
     identifiable in audit logs by ID alone. */
  const idStr=String(check.id||"");
  const rcptNo="CR-"+(idStr.length>=6?idStr.slice(-6).toUpperCase():(Date.now()%1000000).toString());
  const amount=Math.round(Number(check.amount)||0);
  const amountFmt=amount.toLocaleString("en-US");
  const amountWords=arabicNumberToWords(amount);
  const printDate=new Date().toISOString().split("T")[0];
  const dayName=new Date().toLocaleDateString("ar-EG",{weekday:"long"});
  let h="<div style='max-width:170mm;margin:0 auto'>";
  /* Top metadata */
  h+="<div style='display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:"+accentColor+"08;border:2px solid "+accentColor+"40;border-radius:10px;margin-bottom:18px'>";
  h+="<div style='display:flex;align-items:center;gap:10px'>";
  h+="<span style='font-size:24px'>"+arrowIcon+"</span>";
  h+="<div><div style='font-size:18px;font-weight:900;color:"+accentColor+"'>"+title+"</div>";
  h+="<div style='font-size:11px;color:#64748B;font-weight:600'>"+dayName+" — "+printDate+"</div></div></div>";
  h+="<div style='text-align:left'><div style='font-size:10px;color:#64748B;font-weight:600'>رقم الإذن</div>";
  h+="<div style='font-size:14px;font-weight:800;color:#1E293B;font-family:monospace'>"+rcptNo+"</div></div>";
  h+="</div>";
  /* Party block */
  h+="<table style='width:100%;border-collapse:collapse;margin-bottom:14px;font-size:13px'>";
  h+="<tr><th style='text-align:right;padding:8px 12px;background:#F8FAFC;font-weight:700;width:30%;border:1px solid #E2E8F0'>"+partyLabel+"</th>";
  h+="<td style='padding:8px 12px;font-weight:800;font-size:15px;border:1px solid #E2E8F0'>"+partyName+"</td></tr>";
  if(partyPhone)h+="<tr><th style='text-align:right;padding:6px 12px;background:#F8FAFC;font-weight:700;border:1px solid #E2E8F0'>التليفون</th><td style='padding:6px 12px;font-weight:600;border:1px solid #E2E8F0;direction:ltr;text-align:right'>"+ltrPhone(partyPhone)+"</td></tr>";
  if(partyAddress)h+="<tr><th style='text-align:right;padding:6px 12px;background:#F8FAFC;font-weight:700;border:1px solid #E2E8F0'>العنوان</th><td style='padding:6px 12px;font-weight:600;border:1px solid #E2E8F0'>"+partyAddress+"</td></tr>";
  h+="</table>";
  /* Cheque details — prominent boxed section that mirrors the physical cheque */
  h+="<div style='border:3px solid "+accentColor+";border-radius:14px;padding:18px;margin-bottom:14px;background:linear-gradient(135deg,"+accentColor+"06,"+accentColor+"02)'>";
  h+="<div style='font-size:11px;font-weight:700;color:#64748B;letter-spacing:1px;margin-bottom:10px;text-align:center'>بيانات الشيك</div>";
  h+="<div style='display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px'>";
  if(check.checkNo)h+="<div style='padding:10px;background:#fff;border:1px solid #E2E8F0;border-radius:8px;text-align:center'><div style='font-size:10px;color:#64748B;font-weight:700'>رقم الشيك</div><div style='font-size:16px;font-weight:900;color:#1E293B;font-family:monospace;direction:ltr'>"+check.checkNo+"</div></div>";
  if(check.bank)h+="<div style='padding:10px;background:#fff;border:1px solid #E2E8F0;border-radius:8px;text-align:center'><div style='font-size:10px;color:#64748B;font-weight:700'>البنك</div><div style='font-size:14px;font-weight:800;color:#1E293B'>"+check.bank+"</div></div>";
  if(check.date)h+="<div style='padding:10px;background:#fff;border:1px solid #E2E8F0;border-radius:8px;text-align:center'><div style='font-size:10px;color:#64748B;font-weight:700'>تاريخ الشيك</div><div style='font-size:14px;font-weight:800;color:#1E293B'>"+check.date+"</div></div>";
  if(check.dueDate)h+="<div style='padding:10px;background:#fff;border:1px solid #FCA5A5;border-radius:8px;text-align:center;background:#FEF2F2'><div style='font-size:10px;color:#991B1B;font-weight:700'>تاريخ الاستحقاق</div><div style='font-size:14px;font-weight:900;color:#DC2626'>"+check.dueDate+"</div></div>";
  h+="</div>";
  /* Amount */
  h+="<div style='text-align:center;padding:12px 0;border-top:2px solid "+accentColor+"40'>";
  h+="<div style='font-size:11px;color:#64748B;font-weight:700;letter-spacing:1px;margin-bottom:4px'>قيمة الشيك</div>";
  h+="<div style='font-size:34px;font-weight:900;color:"+accentColor+";line-height:1.1;font-family:monospace'>"+amountFmt+" <span style='font-size:16px'>ج.م</span></div>";
  h+="<div style='font-size:13px;color:#475569;margin-top:10px;line-height:1.6;padding:8px 14px;background:#fff;border-radius:8px;border:1px dashed #94A3B8;font-weight:600'>";
  h+="<span style='color:#64748B;font-weight:700'>فقط: </span><span style='color:#1E293B;font-weight:800'>"+amountWords+" جنيهاً مصرياً لا غير</span>";
  h+="</div></div>";
  h+="</div>";
  /* Reason / category */
  const reasonText=check.notes||(isReceiving?"دفعة من العميل":"دفعة لمورد");
  h+="<table style='width:100%;border-collapse:collapse;margin-bottom:18px;font-size:12px'>";
  h+="<tr><th style='text-align:right;padding:8px 12px;background:#F8FAFC;font-weight:700;width:30%;border:1px solid #E2E8F0'>وذلك مقابل</th>";
  h+="<td style='padding:8px 12px;font-weight:600;border:1px solid #E2E8F0'>"+reasonText+"</td></tr>";
  if(check.category)h+="<tr><th style='text-align:right;padding:6px 12px;background:#F8FAFC;font-weight:700;border:1px solid #E2E8F0'>التصنيف</th><td style='padding:6px 12px;border:1px solid #E2E8F0'><span style='padding:2px 10px;border-radius:6px;background:"+accentColor+"15;color:"+accentColor+";font-weight:700'>"+check.category+"</span></td></tr>";
  h+="<tr><th style='text-align:right;padding:6px 12px;background:#F8FAFC;font-weight:700;border:1px solid #E2E8F0'>الحالة الحالية</th><td style='padding:6px 12px;font-weight:700;border:1px solid #E2E8F0'>"+(check.status||"معلق")+"</td></tr>";
  h+="</table>";
  /* Signature request — prominent banner */
  h+="<div style='margin:20px 0 14px;padding:12px 18px;background:#FEF3C7;border:2px dashed #F59E0B;border-radius:10px;text-align:center'>";
  h+="<div style='font-size:13px;font-weight:800;color:#92400E'>📝 برجاء التوقيع على ما تم استلامه/تسليمه</div>";
  h+="<div style='font-size:10px;color:#92400E;margin-top:3px;font-weight:600'>التوقيع يثبت "+(isReceiving?"استلام الشيك بالبيانات المذكورة":"تسليم الشيك بالبيانات المذكورة")+"</div>";
  h+="</div>";
  /* Dual-signature block — left = our staff, right = the other party */
  h+="<div style='margin-top:24px;display:flex;gap:20px;justify-content:space-between'>";
  h+="<div style='flex:1;text-align:center;padding:8px;border:1px solid #E2E8F0;border-radius:8px;background:#F8FAFC'>";
  h+="<div style='font-size:10px;color:#64748B;font-weight:700;margin-bottom:35px'>"+(isReceiving?"المستلم — المحاسب":"المسلم — المحاسب")+"</div>";
  h+="<div style='border-top:2px solid #1E293B;padding-top:6px;font-weight:800;font-size:11px'>التوقيع</div>";
  h+="<div style='font-size:9px;color:#94A3B8;margin-top:2px'>("+(check.by||"—")+")</div>";
  h+="</div>";
  h+="<div style='flex:1;text-align:center;padding:8px;border:2px solid "+accentColor+"40;border-radius:8px;background:"+accentColor+"04'>";
  h+="<div style='font-size:10px;color:"+accentColor+";font-weight:800;margin-bottom:35px'>"+(isReceiving?"المسلم — صاحب الشيك":"المستلم — صاحب الشيك")+"</div>";
  h+="<div style='border-top:2px solid "+accentColor+";padding-top:6px;font-weight:800;font-size:11px;color:"+accentColor+"'>التوقيع + التاريخ</div>";
  h+="<div style='font-size:9px;color:#94A3B8;margin-top:2px'>("+partyName+")</div>";
  h+="</div>";
  h+="</div>";
  /* Audit footer */
  h+="<div style='margin-top:20px;padding-top:8px;border-top:1px dashed #94A3B8;font-size:9px;color:#94A3B8;display:flex;justify-content:space-between'>";
  h+="<span>أنشأ بواسطة: "+(check.by||"—")+"</span>";
  h+="<span>تاريخ الطباعة: "+printDate+" "+new Date().toLocaleTimeString("ar-EG")+"</span>";
  h+="</div>";
  h+="</div>";
  printPage(title+" — "+rcptNo,h,configInfo);
}



/* ── UI Components (Light Glassmorphism) ── */
/* FS imported from constants/index.js; TH/TD/TDB/TDL imported from theme.js (V15.0) */

/* Badge moved to components/ui.jsx (V15.0 phase 2) */













/* ══ LOGIN ══ */
