/* ═══════════════════════════════════════════════════════════════
   CLARK - print-extras.js
   
   Extracted from App.jsx in V15.1 phase 3.
   Contains: exportExcel, printReceipt, printLabel, printReceiveReceipt, printWorkshopReport, printOrderSheet, printStockDelivery
   ═══════════════════════════════════════════════════════════════ */

import { Badge } from "../components/ui.jsx";
import { FKEYS, FS } from "../constants/index.js";
import { TD, TDB, TDL, TH } from "../theme.js";
import { gIcon, gc, gcons, gf } from "../utils/format.js";
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
  /* Signatures */
  h+="<div class='sig'><div class='sig-box'>توقيع صاحب الورشة<br/><span style='font-size:11px;color:#8B5CF6'>"+ws+"</span></div><div class='sig-box'>مسؤول القص والتسليم</div></div>";
  if(_returnHtml)return h;
  printPage("اذن تسليم ورشة — "+modelNo,h)
}

/* getOrderDetails, getOrderTimeline moved to utils/orders.js (V15.0) */


export async function printLabel(wsName,order,garmentType,qty,date,gtList,opts){
  if(!order)return;
  const t=calcOrder(order);
  const type=(opts?.type)||"deliver";const rcvDate=opts?.rcvDate||"";const delDate=opts?.delDate||date||"";const rcvQty=opts?.rcvQty||0;const delQty=opts?.delQty||qty;
  const isRcv=type==="receive";const title=isRcv?"استلام مصنع":"تسليم ورشة";const arrow=isRcv?"↙":"↗";
  const d={title,arrow,qrSrc:"",piece:garmentType||"عام",qty:isRcv?rcvQty:delQty,modelNo:order.modelNo||"",modelDesc:order.modelDesc||"",sizeLabel:order.sizeLabel||"",wsName,cutQty:t.cutQty,delQty,delDate,rcvQty,rcvDate,isRcv};
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
  h+="<div style='margin-top:16px;text-align:center;font-size:10px;color:#94A3B8;border-top:1px solid #E2E8F0;padding-top:8px'>CLARK Factory Management — "+new Date().toLocaleDateString("ar-EG")+"</div>";
  printPage("اذن تسليم مخزن — "+order.modelNo,h)
}

/* ── UI Components (Light Glassmorphism) ── */
/* FS imported from constants/index.js; TH/TD/TDB/TDL imported from theme.js (V15.0) */

/* Badge moved to components/ui.jsx (V15.0 phase 2) */













/* ══ LOGIN ══ */
