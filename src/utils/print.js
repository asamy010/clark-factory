/* ═══════════════════════════════════════════════════════════════
   CLARK - Print Utilities
   Print-to-window helpers for reports, labels, QR cards.
   All open a new window and write HTML directly.
   ═══════════════════════════════════════════════════════════════ */

import { PRINT_CSS } from "../constants/index.js";
import { CLARK_LOGO, CLARK_LOGO_PRINT } from "../constants/logo.js";
import { renderTemplate } from "./templateEngine.js";
import { getTemplate } from "./printTemplates.js";

/* V16.4: Template-based printing — uses user-customized template if available,
   else falls back to default. Accepts context data and optional extra CSS. */
export function printWithTemplate(templateId, context, printTemplates, options) {
  const tpl = getTemplate(printTemplates || {}, templateId);
  if (!tpl) { console.error("Unknown template:", templateId); return false; }
  try {
    const html = renderTemplate(tpl.template, context);
    const fullHtml = "<!DOCTYPE html><html dir='rtl'><head><meta charset='UTF-8'><title>" +
      ((options && options.title) || tpl.name || "طباعة") +
      "</title><style>" + (tpl.css || "") + "</style></head><body>" + html +
      "<script>setTimeout(function(){try{window.focus();window.print()}catch(e){}}, 400)</script>" +
      "</body></html>";
    const pw = openPrintWindow();
    if (!pw) { alert("المتصفح يمنع النوافذ المنبثقة — فعّل الـ pop-ups"); return false; }
    pw.document.open();
    pw.document.write(fullHtml);
    pw.document.close();
    return true;
  } catch (e) {
    console.error("Template print failed:", e);
    alert("فشل توليد الطباعة: " + e.message);
    return false;
  }
}

/* Full-page report printing with professional header, print/PDF buttons, and footer.
   V15.58: Accepts optional configInfo = {factoryName, logo, address, phone}
   for branded output. Falls back to CLARK defaults for backward compatibility.
   
   PDF output is professional, suitable for external review/tax audit. */
export function printPage(title,bodyHtml,configInfo){const pw=openPrintWindow();if(!pw){alert("المتصفح بيمنع فتح نافذة الطباعة — فعّل النوافذ المنبثقة (pop-ups) من إعدادات المتصفح");return}
  const today=new Date().toLocaleDateString("ar-EG",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
  const timeStr=new Date().toLocaleTimeString("ar-EG",{hour:"2-digit",minute:"2-digit"});
  const safeTitle=String(title||"تقرير").replace(/[\\/:*?"<>|]/g,"_").slice(0,80);
  const factoryName=(configInfo&&configInfo.factoryName)||"CLARK Factory Management";
  const factoryLogo=(configInfo&&configInfo.logo)||CLARK_LOGO;
  const factoryAddr=(configInfo&&configInfo.address)||"";
  const factoryPhone=(configInfo&&configInfo.phone)||"";
  /* V15.58: Professional PDF-friendly header styles override the legacy .hdr */
  const enhancedStyles=".hdr{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #0284C7;padding-bottom:14px;margin-bottom:20px;gap:16px}"
    +".hdr-brand{display:flex;align-items:center;gap:12px;flex:1}"
    +".hdr-brand img{height:50px;max-width:90px;object-fit:contain}"
    +".hdr-brand-text{line-height:1.3}"
    +".hdr-brand-name{font-size:17px;font-weight:800;color:#0F172A}"
    +".hdr-brand-sub{font-size:10px;color:#64748B;font-weight:600;margin-top:2px}"
    +".hdr-title{text-align:left;flex-shrink:0;padding:8px 14px;background:#F0F9FF;border:1px solid #BAE6FD;border-radius:8px;min-width:160px}"
    +".hdr-title-main{font-size:14px;font-weight:800;color:#0369A1;line-height:1.2}"
    +".hdr-title-date{font-size:10px;color:#64748B;font-weight:600;margin-top:4px;font-family:monospace}"
    +".foot{margin-top:30px;padding-top:10px;border-top:2px solid #CBD5E1;text-align:center;font-size:9px;color:#64748B;font-weight:600;display:flex;justify-content:space-between;gap:10px}"
    +".foot-brand{font-weight:800;color:#0284C7}"
    +".foot-meta{color:#94A3B8;font-weight:500}";
  /* Build professional header */
  let brandSub="نظام إدارة مصانع الملابس";
  if(factoryAddr)brandSub=factoryAddr;
  if(factoryAddr&&factoryPhone)brandSub=factoryAddr+" • "+factoryPhone;
  else if(factoryPhone)brandSub=factoryPhone;
  const header="<div class='hdr'>"
    +"<div class='hdr-brand'>"
      +"<img src='"+factoryLogo+"'/>"
      +"<div class='hdr-brand-text'>"
        +"<div class='hdr-brand-name'>"+factoryName+"</div>"
        +"<div class='hdr-brand-sub'>"+brandSub+"</div>"
      +"</div>"
    +"</div>"
    +"<div class='hdr-title'>"
      +"<div class='hdr-title-main'>"+title+"</div>"
      +"<div class='hdr-title-date'>"+today+" • "+timeStr+"</div>"
    +"</div>"
  +"</div>";
  const footer="<div class='foot'>"
    +"<span class='foot-brand'>"+factoryName+"</span>"
    +"<span class='foot-meta'>"+today+" • Powered by CLARK Factory Management</span>"
  +"</div>";
  pw.document.write("<!DOCTYPE html><html dir='rtl'><head><meta charset='utf-8'/><link href='https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;800&display=swap' rel='stylesheet'/><script src='https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'></"+"script><title>"+title+"</title><style>"+PRINT_CSS+enhancedStyles+".pbar{position:sticky;top:0;background:#fff;padding:8px 16px;border-bottom:2px solid #E2E8F0;display:flex;justify-content:center;gap:10px;z-index:999}.pbar button{padding:8px 22px;border-radius:8px;border:none;cursor:pointer;font-family:'Cairo',sans-serif;font-size:13px;font-weight:700}.pb-back{background:#F1F5F9;color:#475569}.pb-print{background:#0EA5E9;color:#fff}.pb-pdf{background:#EF4444;color:#fff}.pb-pdf:disabled{opacity:0.6;cursor:wait}@media print{.pbar{display:none}}</style></head><body><div class='pbar'><button class='pb-back' onclick='window.close()'>↩ رجوع</button><button class='pb-print' onclick='window.print()'>🖨 طباعة</button><button class='pb-pdf' id='pdf-btn' onclick='savePdf()'>📄 حفظ PDF</button></div><div id='report-content'>"+header+bodyHtml+footer+"</div><script>function savePdf(){var btn=document.getElementById('pdf-btn');if(!window.html2pdf){alert('مكتبة PDF لم تُحمّل بعد — انتظر قليلاً ثم أعد المحاولة');return}var el=document.getElementById('report-content');if(!el){alert('محتوى التقرير غير موجود');return}var orig=btn.textContent;btn.disabled=true;btn.textContent='⏳ جاري الإنشاء...';window.html2pdf().set({margin:[10,10,10,10],filename:'"+safeTitle.replace(/'/g,"\\'")+".pdf',image:{type:'jpeg',quality:0.95},html2canvas:{scale:2,useCORS:true,letterRendering:true,allowTaint:true},jsPDF:{unit:'mm',format:'a4',orientation:'portrait',compress:true},pagebreak:{mode:['css','legacy','avoid-all']}}).from(el).save().then(function(){btn.disabled=false;btn.textContent=orig}).catch(function(e){alert('فشل إنشاء PDF: '+e.message);btn.disabled=false;btn.textContent=orig})}</"+"script></body></html>");pw.document.close();/* V15.83: restore focus + auto-print.
     Was removed in V15.79 but caused "nothing happens" — new window opens in background tab,
     user misses it. Now focus brings the window to front, print() opens the native dialog.
     Toolbar (رجوع/طباعة/PDF) stays visible so user can cancel dialog and use PDF button. */
    setTimeout(()=>{try{pw.focus();pw.print()}catch(e){}},500);}

/* Thermal package label — 10x15cm with QR and movement log */
/* V14.x: 10×15 cm customer package label.
   V16.50: now reads from `printSettings.customerLabel` slot — same shape as the
   workshop label settings. Honors fontFamily, showLogo, and per-field toggles for
   note / movements / createdBy / qr. Backward-compatible: callers that don't pass
   cfg get the historic defaults. */
export function printPkgLabel(pkgNum,pkgDate,pkgNote,pkgItems,movements,status,createdBy,qrData,cfg,clarkLogoDataUrl){
  const pw=openPrintWindow();if(!pw){alert("المتصفح بيمنع فتح نافذة الطباعة — فعّل النوافذ المنبثقة");return}
  const cu=cfg&&cfg.customerLabel?cfg.customerLabel:(cfg||{});
  const fontFam=cu.fontFamily||"Cairo";
  const fontUrl=_GOOGLE_FONT_URLS_QR[fontFam]||_GOOGLE_FONT_URLS_QR.Cairo;
  const showLogo=!!cu.showLogo;
  const fields=cu.fields||{};
  const showNote=fields.note?.show!==false;
  const showMovements=fields.movements?.show!==false;
  const showCreatedBy=fields.createdBy?.show!==false;
  const showQr=fields.qr?.show!==false;
  const totalQ=pkgItems.reduce((s,it)=>s+(Number(it.qty)||0),0);
  const totalSeries=pkgItems.reduce((s,it)=>s+(Number(it.count)||0),0);
  const stLabel=status==="مغلقة"?"مغلقة ❌":status==="مباعة"?"مباعة 💰":"مفتوحة ✅";
  const stColor=status==="مغلقة"?"#EF4444":status==="مباعة"?"#8B5CF6":"#10B981";
  let itemRows="";pkgItems.forEach(it=>{itemRows+="<tr><td class='mn'>"+it.modelNo+"</td><td class='ds'>"+(it.desc||"")+"</td><td class='ct'>"+(it.count||"")+"</td><td class='qt'>"+it.qty+"</td></tr>"});
  let movRows="";(movements||[]).forEach(m=>{const icon=m.type==="add"?"📥":m.type==="remove"?"📤":m.type==="sell"?"💰":"📋";
    movRows+="<tr><td class='md'>"+m.date+"</td><td class='md' style='color:#000;font-weight:800'>"+icon+"</td><td class='md'>"+(m.modelNo||m.custName||"")+"</td><td class='md' style='font-weight:700'>"+(m.qty||"")+"</td><td class='md' style='color:#000'>"+(m.by||"")+"</td></tr>"});
  /* Brand row: image when enabled, else text */
  const brandHtml=showLogo&&clarkLogoDataUrl
    ?"<div class='brand'><img src='"+clarkLogoDataUrl+"' alt='CLARK' style='height:9mm;max-width:55%;filter:brightness(0) saturate(100%);object-fit:contain'/></div>"
    :"<div class='brand'>CLARK</div>";
  pw.document.write("<!DOCTYPE html><html dir='rtl'><head><meta charset='utf-8'/><script src='https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js'></"+"script><link href='"+fontUrl+"' rel='stylesheet'/><style>"
  +"@page{size:10cm 15cm;margin:0}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'"+fontFam+"',Arial,sans-serif;color:#000}"
  /* V16.58: Fixed page height + .pg-inner wrapper enables auto-fit scaling
     when toggled fields cause overflow. Same pattern as renderLabelPages. */
  +".pg{width:10cm;height:15cm;padding:3mm;display:flex;flex-direction:column;overflow:hidden;position:relative}"
  +".pg-inner{display:flex;flex-direction:column;flex:1;transform-origin:top right;width:100%}"
  +".brand{text-align:center;font-size:11pt;font-weight:900;letter-spacing:3px;padding:1.5mm 0;border-bottom:2px solid #000}"
  +".top{display:flex;align-items:center;gap:3mm;padding:2mm 0;border-bottom:1px solid #999}"
  +".top canvas{flex-shrink:0}.top-info{flex:1;text-align:center}"
  /* V18.30: All label text in dark black */
  +".pn{font-size:16pt;font-weight:900;color:#000}.pd{font-size:8pt;color:#000}.ps{font-size:8pt;font-weight:700;display:inline-block;padding:1px 6px;border-radius:4px;color:#000}"
  +"table{width:100%;border-collapse:collapse}th{background:#E2E8F0;font-weight:800;font-size:7pt;padding:1.5mm 2mm;border:1px solid #94A3B8;text-align:right;color:#000}"
  +"td{padding:1.5mm 2mm;border:1px solid #CBD5E1;font-size:8pt;color:#000}.mn{font-weight:800;font-size:9pt}.ds{font-size:7pt;color:#000}.ct{text-align:center;font-size:8pt}.qt{text-align:center;font-weight:800;font-size:10pt;color:#000}"
  +".tot td{background:#EFF6FF;font-weight:800;font-size:9pt;color:#000}"
  +".sec{font-size:7pt;font-weight:800;color:#000;margin:2mm 0 1mm;padding-bottom:1mm;border-bottom:1px solid #E2E8F0}"
  +".md{padding:1mm 2mm;font-size:6.5pt;border:1px solid #E2E8F0;color:#000}"
  +".ft{margin-top:auto;padding-top:1.5mm;border-top:1px solid #000;display:flex;justify-content:space-between;font-size:6pt;color:#000;font-weight:600}"
  +".pbar{position:sticky;top:0;background:#fff;padding:4px;display:none;justify-content:center;gap:6px;border-bottom:2px solid #ccc}"
  +".pbar button{padding:5px 14px;border-radius:6px;border:1px solid #000;cursor:pointer;font-family:'"+fontFam+"';font-size:11px;font-weight:700;background:#fff}.pbar .pr{background:#000;color:#fff}"
  +"@media(max-width:1024px){.pbar{display:flex}}@media print{.pbar{display:none}}"
  +"</style></head><body>"
  +"<div class='pbar'><button onclick='window.close()'>↩</button><button class='pr' onclick='window.print()'>🖨</button></div>"
  +"<div class='pg'><div class='pg-inner'>"
  +brandHtml
  +"<div class='top'>"
  +(showQr?"<canvas id='qr'></canvas>":"")
  +"<div class='top-info'><div class='pn'>📦 "+pkgNum+"</div><div class='pd'>"+pkgDate+(showNote&&pkgNote?" — "+pkgNote:"")+"</div><div class='ps' style='background:"+stColor+"15;color:#000'>"+stLabel+"</div></div></div>"
  +"<div class='sec'>محتويات الكرتونة</div>"
  +"<table><thead><tr><th>الموديل</th><th>الوصف</th><th>سيري</th><th>الكمية</th></tr></thead><tbody>"
  +itemRows
  +"<tr class='tot'><td colspan='2'>الاجمالي</td><td class='ct'>"+totalSeries+"</td><td class='qt' style='font-size:11pt'>"+totalQ+"</td></tr></tbody></table>"
  +(showMovements&&movRows?"<div class='sec'>سجل الحركات</div><table><thead><tr><th>التاريخ</th><th>النوع</th><th>التفاصيل</th><th>الكمية</th><th>بواسطة</th></tr></thead><tbody>"+movRows+"</tbody></table>":"")
  +"<div class='ft'><span>"+(showCreatedBy&&createdBy?"التعبئة: "+createdBy:"")+"</span><span>CLARK Factory Management</span></div>"
  +"</div></div>"
  +"<script>(function(){"
  +(showQr?"try{QRCode.toCanvas(document.getElementById('qr'),'"+qrData.replace(/'/g,"\\'")+"',{width:120,margin:1},function(){})}catch(e){}":"")
  +"function autoFit(){document.querySelectorAll('.pg').forEach(function(pg){var inner=pg.querySelector('.pg-inner');if(!inner)return;var s=getComputedStyle(pg);var pad=(parseFloat(s.paddingTop)||0)+(parseFloat(s.paddingBottom)||0);var avail=pg.clientHeight-pad;var content=inner.scrollHeight;if(content>avail){var sc=(avail/content)*0.98;inner.style.transform='scale('+sc.toFixed(3)+')';inner.style.width=(100/sc).toFixed(2)+'%'}else{inner.style.transform='';inner.style.width='100%'}})}"
  +"setTimeout(autoFit,300);setTimeout(autoFit,800);setTimeout(function(){window.print()},1000);"
  +"})();</"+"script>"
  +"</body></html>");
  pw.document.close()}

/* V16.57: Print thermal sales-delivery label (10×15 cm) — printed from the
   sales screen distribution popup, one per customer row. Mirrors the structure
   of printPkgLabel (brand row, info table, items table, totals box, QR) but
   with customer-focused content (name, phone, address, delivered items, totals,
   confirmation QR). Honors printSettings.salesDeliveryLabel for font / logo /
   per-field toggles (phone, address, prices, itemsDesc, qr). 
   
   V16.70: accepts optional `existingWin` — when caller has already opened a
   print window synchronously (to avoid popup blocker after `await fetch`), we
   reuse it instead of opening a new one. The caller may have written a loading
   placeholder; we reset via document.open() before writing the real label.
   
   V16.71: accepts optional `shipN` — when > 1, the same label is repeated on
   N pages with a "i/N" shipment-count indicator at the bottom (replaces the
   old separate `printCustLabels` helper). The orange shipPopup button now
   uses this so the printed labels carry full customer details + prices + QR
   instead of the previous bare-bones format. The parent-side print fallback
   added in V16.70 was removed because it was firing the print dialog twice
   (once at 500ms from parent, once at 1000ms from inner script) which made
   "cancel" reopen the dialog. The inner script's print is enough now that
   the popup is opened synchronously.
   
   Args:
     custName, custPhone, custAddr  - customer info (phone/addr may be hidden)
     date                            - session date string
     items[]                         - {modelNo, modelDesc, qty, price?, total?}
     totals                          - {gross, discPct, discAmt, netAmt}
     confirmUrl                      - optional URL encoded into the QR
     cfg                             - data?.printSettings  (slot keyed by 'salesDeliveryLabel')
     clarkLogoDataUrl                - CLARK_LOGO_PRINT
     existingWin                     - optional pre-opened window (V16.70 popup-blocker fix)
     shipN                           - optional shipment count; default 1 (V16.71) */
export function printSalesDeliveryLabel(custName,custPhone,custAddr,date,items,totals,confirmUrl,cfg,clarkLogoDataUrl,existingWin,shipN){
  let pw;
  if(existingWin){
    pw=existingWin;
    /* Reset any loading placeholder content the caller wrote */
    try{pw.document.open()}catch(e){}
  }else{
    pw=openPrintWindow();if(!pw){alert("المتصفح بيمنع فتح نافذة الطباعة — فعّل النوافذ المنبثقة");return}
  }
  /* V16.71: clamp shipN to a sane integer ≥1; missing/invalid ⇒ 1 page (no badge) */
  const N=Math.max(1,Math.floor(Number(shipN)||1));
  const sd=cfg&&cfg.salesDeliveryLabel?cfg.salesDeliveryLabel:(cfg||{});
  const fontFam=sd.fontFamily||"Cairo";
  const fontUrl=_GOOGLE_FONT_URLS_QR[fontFam]||_GOOGLE_FONT_URLS_QR.Cairo;
  const showLogo=!!sd.showLogo;
  const fields=sd.fields||{};
  const showPhone=fields.phone?.show!==false;
  const showAddress=fields.address?.show!==false;
  const showPrices=fields.prices?.show!==false;
  const showItemsDesc=fields.itemsDesc?.show!==false;
  const showQr=fields.qr?.show!==false&&!!confirmUrl;
  const totalQ=(items||[]).reduce((s,it)=>s+(Number(it.qty)||0),0);
  const fmt=(n)=>Math.round(Number(n)||0).toLocaleString("en-US");
  /* V18.29: When items > 8, the items table forces the auto-fit to scale text down to unreadable.
     Replace the table with a clean summary card (item count + total qty + date).
     V18.31: Now controlled by `itemsMode` setting:
       - "auto"    (default): table if ≤ 8, summary if > 8 (preserves V18.29 behavior)
       - "table"           : always show items table (regardless of count)
       - "summary"         : always show summary card */
  const itemCount=(items||[]).length;
  const itemsMode=sd.itemsMode||"auto";
  const useSummary=itemsMode==="summary"?true:itemsMode==="table"?false:itemCount>8;
  /* Items rows — only built when NOT in summary mode */
  let itemRows="";
  if(!useSummary){
    (items||[]).forEach(it=>{
      itemRows+="<tr><td class='mn'>"+(it.modelNo||"")+"</td>"
        +(showItemsDesc?"<td class='ds'>"+(it.modelDesc||"")+"</td>":"")
        +"<td class='qt'>"+(it.qty||0)+"</td>"
        +(showPrices?"<td class='pr'>"+fmt(it.price)+"</td><td class='pr' style='font-weight:800'>"+fmt(it.total)+"</td>":"")
        +"</tr>";
    });
  }
  const colSpanForTotal=1+(showItemsDesc?1:0);
  /* Brand row */
  const brandHtml=showLogo&&clarkLogoDataUrl
    ?"<div class='brand'><img src='"+clarkLogoDataUrl+"' alt='CLARK' style='height:9mm;max-width:55%;filter:brightness(0) saturate(100%);object-fit:contain'/></div>"
    :"<div class='brand'>CLARK Factory</div>";
  /* Customer info table — only enabled rows */
  let custRows="<tr><td class='lbl'>التاريخ</td><td class='val'>"+date+"</td></tr>";
  if(showPhone&&custPhone)custRows+="<tr><td class='lbl'>التليفون</td><td class='val'>"+custPhone+"</td></tr>";
  if(showAddress&&custAddr)custRows+="<tr><td class='lbl'>العنوان</td><td class='val' style='font-size:7.5pt'>"+custAddr+"</td></tr>";
  /* Totals box */
  const t=totals||{};
  const gross=Number(t.gross)||0;const discPct=Number(t.discPct)||0;const discAmt=Number(t.discAmt)||0;const netAmt=Number(t.netAmt)||gross;
  const totalsBox=showPrices?"<div class='tbox'>"
    +"<div class='trow'><span>الإجمالي</span><span>"+fmt(gross)+" ج.م</span></div>"
    +(discPct>0?"<div class='trow' style='color:#000'><span>خصم "+discPct+"%</span><span>- "+fmt(discAmt)+" ج.م</span></div>":"")
    +"<div class='trow tnet'><span>الصافي</span><span>"+fmt(netAmt)+" ج.م</span></div>"
    +"</div>":"";
  pw.document.write("<!DOCTYPE html><html dir='rtl'><head><meta charset='utf-8'/><script src='https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js'></"+"script><link href='"+fontUrl+"' rel='stylesheet'/><style>"
  +"@page{size:10cm 15cm;margin:0}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'"+fontFam+"',Arial,sans-serif;color:#000}"
  /* V16.58: Fixed page height + .pg-inner for auto-fit (same as renderLabelPages). */
  +".pg{width:10cm;height:15cm;padding:3mm;display:flex;flex-direction:column;overflow:hidden;position:relative}"
  +".pg-inner{display:flex;flex-direction:column;flex:1;transform-origin:top right;width:100%}"
  +".brand{text-align:center;font-size:11pt;font-weight:900;letter-spacing:3px;padding:1.5mm 0;border-bottom:2px solid #000;margin-bottom:1.5mm}"
  +".chip{text-align:center;font-size:11pt;font-weight:800;border:2px solid #000;display:block;width:fit-content;padding:1mm 5mm;border-radius:2mm;margin:0 auto 1.5mm}"
  +".cust{text-align:center;padding:1.5mm;border:2px solid #000;border-radius:2mm;margin-bottom:1.5mm}"
  +".cust .lab{font-size:8pt;font-weight:700;color:#000}.cust .nm{font-size:14pt;font-weight:900;color:#000}"
  +".info{width:100%;border-collapse:collapse;margin-bottom:1.5mm}.info td{border:1px solid #000;padding:1mm 2mm;font-size:8.5pt;color:#000}.info .lbl{font-weight:800;width:30%}.info .val{font-weight:700}"
  +".sec{font-size:7pt;font-weight:800;color:#000;margin:1.5mm 0 1mm}"
  +"table.it{width:100%;border-collapse:collapse}table.it th{background:#E2E8F0;font-weight:800;font-size:7pt;padding:1mm 1.5mm;border:1px solid #94A3B8;text-align:right;color:#000}"
  +"table.it td{padding:1mm 1.5mm;border:1px solid #CBD5E1;font-size:8pt;color:#000}.it .mn{font-weight:800;font-size:9pt}.it .ds{font-size:7pt;color:#000}.it .qt{text-align:center;font-weight:800;font-size:10pt;color:#000}.it .pr{text-align:center;font-size:8pt}"
  +".tbox{border:2px solid #000;border-radius:2mm;padding:1.5mm 2mm;margin-bottom:1.5mm;font-size:9pt;color:#000}"
  +".trow{display:flex;justify-content:space-between;font-weight:700;line-height:1.5}"
  +".tnet{border-top:1px solid #000;padding-top:1mm;margin-top:1mm;font-weight:900;font-size:11pt;color:#000}"
  /* V18.29: Summary box — used when itemCount > 8 (replaces items table). V18.30: All-black text */
  +".sumbox{border:2px solid #000;border-radius:3mm;padding:4mm 3mm;margin:3mm 0 2mm;background:#F0F9FF}"
  +".sumrow{display:flex;justify-content:space-between;align-items:center;padding:2mm 0;border-bottom:1px dashed #000;font-size:10pt;color:#000}.sumrow:last-child{border-bottom:none}"
  +".sumlbl{font-weight:700;color:#000}.sumval{font-weight:900;font-size:13pt;color:#000}.sumval.acc{color:#000}"
  +".qrbox{display:flex;align-items:flex-end;justify-content:space-between;margin-top:auto;padding-top:2mm;gap:2mm}"
  +".qrbox .qrc{text-align:center;padding:1mm;border:2px solid #000;border-radius:2mm}.qrbox .qrc .lab{font-size:6pt;font-weight:700;margin-top:0.5mm;color:#000}"
  +".ft{text-align:center;font-size:7pt;color:#000;padding-top:1mm;border-top:1px dashed #000;margin-top:1.5mm}"
  +".pbar{position:sticky;top:0;background:#fff;padding:4px;display:none;justify-content:center;gap:6px;border-bottom:2px solid #ccc}"
  +".pbar button{padding:5px 14px;border-radius:6px;border:1px solid #000;cursor:pointer;font-family:'"+fontFam+"';font-size:11px;font-weight:700;background:#fff;color:#000}.pbar .pr-btn{background:#000;color:#fff}"
  +"@media(max-width:1024px){.pbar{display:flex}}@media print{.pbar{display:none}}"
  /* V16.71: page-break for multi-page (shipN > 1) — each label on its own page */
  +".pg{page-break-after:always}.pg:last-child{page-break-after:auto}"
  /* V16.71: shipment count badge — appears next to QR when N>1 */
  +".shipbadge{font-size:18pt;font-weight:800;border:3px solid #000;border-radius:8px;padding:1mm 5mm;line-height:1;text-align:center;color:#000}"
  +"</style></head><body>"
  +"<div class='pbar'><button onclick='window.close()'>↩</button><button class='pr-btn' onclick='window.print()'>🖨</button></div>");
  /* V16.71: Build one .pg per shipment. Each page carries the same content
     plus a "i/N" badge (only when N>1) replacing the empty spacer in .qrbox.
     Canvas IDs are unique per page (qr0, qr1, ...) so QR rendering can target
     each one individually after document.close(). */
  let bodyHtml="";
  for(let i=1;i<=N;i++){
    /* V18.29: Build the items section conditionally — summary card vs full table */
    const itemsSection = useSummary
      ? "<div class='sumbox'>"
        +"<div class='sumrow'><span class='sumlbl'>عدد الأصناف</span><span class='sumval acc'>"+itemCount+"</span></div>"
        +"<div class='sumrow'><span class='sumlbl'>إجمالي الكمية</span><span class='sumval acc'>"+totalQ+" قطعة</span></div>"
        +"<div class='sumrow'><span class='sumlbl'>التاريخ</span><span class='sumval'>"+date+"</span></div>"
        +"</div>"
      : "<div class='sec'>الأصناف</div>"
        +"<table class='it'><thead><tr><th>الموديل</th>"
        +(showItemsDesc?"<th>الوصف</th>":"")
        +"<th>الكمية</th>"
        +(showPrices?"<th>السعر</th><th>الإجمالي</th>":"")
        +"</tr></thead><tbody>"+itemRows
        +"<tr style='background:#EFF6FF'><td colspan='"+colSpanForTotal+"' style='font-weight:800'>الإجمالي</td><td class='qt' style='font-size:11pt'>"+totalQ+"</td>"
        +(showPrices?"<td colspan='2' class='pr' style='font-weight:900;color:#000'>"+fmt(netAmt)+" ج.م</td>":"")
        +"</tr></tbody></table>";
    bodyHtml+="<div class='pg'><div class='pg-inner'>"
      +brandHtml
      +"<div class='chip'>🚚 إذن تسليم</div>"
      +"<div class='cust'><div class='lab'>العميل</div><div class='nm'>"+(custName||"—")+"</div></div>"
      +"<table class='info'><tbody>"+custRows+"</tbody></table>"
      +itemsSection
      +totalsBox
      +"<div class='qrbox'>"
      +(showQr?"<div class='qrc'><canvas id='qr"+i+"' class='conf-qr'></canvas><div class='lab'>📱 امسح للتأكيد</div></div>":"<div></div>")
      /* V16.71: ship badge replaces the right-side spacer when N>1 */
      +(N>1?"<div class='shipbadge'>"+i+"/"+N+"</div>":"<div style='flex:1'></div>")
      +"</div>"
      +"<div class='ft'>"+(custName||"")+" | "+totalQ+" قطعة | "+date+(N>1?" | "+i+"/"+N:"")+"</div>"
      +"</div></div>";
  }
  pw.document.write(bodyHtml
  +"<script>(function(){"
  /* V16.71: render QR onto every page's canvas (same URL — same delivery) */
  +(showQr?"document.querySelectorAll('.conf-qr').forEach(function(c){try{QRCode.toCanvas(c,'"+confirmUrl.replace(/'/g,"\\'")+"',{width:120,margin:1,errorCorrectionLevel:'M'},function(){})}catch(e){}});":"")
  +"function autoFit(){document.querySelectorAll('.pg').forEach(function(pg){var inner=pg.querySelector('.pg-inner');if(!inner)return;var s=getComputedStyle(pg);var pad=(parseFloat(s.paddingTop)||0)+(parseFloat(s.paddingBottom)||0);var avail=pg.clientHeight-pad;var content=inner.scrollHeight;if(content>avail){var sc=(avail/content)*0.98;inner.style.transform='scale('+sc.toFixed(3)+')';inner.style.width=(100/sc).toFixed(2)+'%'}else{inner.style.transform='';inner.style.width='100%'}})}"
  +"setTimeout(autoFit,300);setTimeout(autoFit,800);setTimeout(function(){window.print()},1000);"
  +"})();</"+"script>"
  +"</body></html>");
  pw.document.close();
  /* V16.71: parent-side print fallback removed — was firing print at 500ms in
     parallel with the inner script's print at 1000ms, causing the dialog to
     re-open after the user pressed Cancel. Synchronous popup open + a single
     in-document print call is sufficient. */
}

/* V14.57: Print employee QR cards — 40×50mm (half the size of package labels)
   V16.36: Accepts optional cfg + clarkLogoDataUrl from the caller. When cfg is
   set, the cards render with the configured font (Cairo/Tajawal/Almarai/...)
   and optionally the CLARK logo at the top in pure black instead of the
   default "CLARK" text band. The logo image is forced to pure black via a CSS
   filter so it prints crisp on thermal media. */
const _GOOGLE_FONT_URLS_QR={
  Cairo:"https://fonts.googleapis.com/css2?family=Cairo:wght@600;700;800;900&display=swap",
  Tajawal:"https://fonts.googleapis.com/css2?family=Tajawal:wght@500;700;800;900&display=swap",
  Almarai:"https://fonts.googleapis.com/css2?family=Almarai:wght@700;800&display=swap",
  "Noto Sans Arabic":"https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@600;700;800;900&display=swap",
  "IBM Plex Sans Arabic":"https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@500;600;700&display=swap",
  Amiri:"https://fonts.googleapis.com/css2?family=Amiri:wght@700&display=swap",
  Lalezar:"https://fonts.googleapis.com/css2?family=Lalezar&display=swap"
};
export function printEmpQrCards(empsList,cfg,clarkLogoDataUrl){
  const pw=openPrintWindow();if(!pw){alert("المتصفح بيمنع فتح نافذة الطباعة — فعّل النوافذ المنبثقة");return}
  const c=cfg||{};
  const fontFam=c.fontFamily||"Cairo";
  const fontUrl=_GOOGLE_FONT_URLS_QR[fontFam]||_GOOGLE_FONT_URLS_QR.Cairo;
  const showLogo=!!c.showLogo;
  const w=Number(c.labelWidth)||40;
  const h=Number(c.labelHeight)||50;
  const qrColor=c.qrColor||"#000000";
  const qrLevel=c.qrLevel||"M";
  const qrMargin=c.qrMargin!==undefined?Number(c.qrMargin):0;
  let cards="";
  empsList.forEach((e,i)=>{
    const qr=("CLARK:EMP:"+e.id).replace(/'/g,"\\'");
    /* Each card is its own thermal page — no sheet grid */
    cards+="<div class='card'>"
      +(showLogo&&clarkLogoDataUrl
        ?"<img class='logo' src='"+clarkLogoDataUrl+"' alt='CLARK'/>"
        :"<div class='brand'>CLARK</div>")
      +"<canvas class='qr' data-qr='"+qr+"'></canvas>"
      +"<div class='nm'>"+(e.name||"")+"</div>"
      +"<div class='cd'>"+(e.code?"#"+e.code:"")+"</div>"
    +"</div>";
  });
  pw.document.write("<!DOCTYPE html><html dir='rtl'><head><meta charset='utf-8'/>"
    +"<script src='https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js'></"+"script>"
    +"<link href='"+fontUrl+"' rel='stylesheet'/>"
    +"<style>"
    /* V14.58: Thermal 40×50mm — one card per page (like printPkgLabel pattern)
       V16.36: dimensions, font, and optional logo from printSettings */
    +"@page{size:"+w+"mm "+h+"mm;margin:0}"
    +"*{margin:0;padding:0;box-sizing:border-box}"
    +"body{font-family:'"+fontFam+"',Arial,sans-serif;color:#000;background:#fff}"
    +".card{width:"+w+"mm;height:"+h+"mm;padding:2mm;display:flex;flex-direction:column;align-items:center;justify-content:space-between;page-break-after:always;overflow:hidden}"
    +".card:last-child{page-break-after:auto}"
    +".logo{width:80%;max-width:32mm;height:auto;max-height:7mm;object-fit:contain;filter:brightness(0) saturate(100%);margin-bottom:0.5mm}"
    +".brand{font-size:9pt;font-weight:900;letter-spacing:2.5px;border-bottom:2px solid #000;width:100%;text-align:center;padding-bottom:1mm}"
    +".qr{width:26mm!important;height:26mm!important;margin:1mm 0}"
    +".nm{font-size:10pt;font-weight:800;text-align:center;width:100%;line-height:1.15;padding:0 1mm}"
    +".cd{font-size:9pt;font-weight:700;color:#000;text-align:center;font-family:monospace;border-top:1px dashed #000;width:100%;padding-top:1mm}"
    +".pbar{position:sticky;top:0;background:#fff;padding:6px;display:none;justify-content:center;gap:8px;border-bottom:2px solid #ccc;z-index:10}"
    +".pbar button{padding:6px 16px;border-radius:6px;border:1px solid #000;cursor:pointer;font-family:'"+fontFam+"';font-size:11px;font-weight:700;background:#fff}"
    +".pbar .pr{background:#000;color:#fff}"
    +"@media(max-width:1024px){.pbar{display:flex}}@media print{.pbar{display:none}}"
    +"</style></head><body>"
    +"<div class='pbar'><button onclick='window.close()'>↩ رجوع</button><button class='pr' onclick='window.print()'>🖨 طباعة حرارية</button></div>"
    +cards
    +"<script>document.querySelectorAll('.qr').forEach(c=>{QRCode.toCanvas(c,c.dataset.qr,{width:98,margin:"+qrMargin+",errorCorrectionLevel:'"+qrLevel+"',color:{dark:'"+qrColor+"',light:'#ffffff'}},()=>{})});setTimeout(()=>window.print(),1000)</"+"script></body></html>");
  pw.document.close()}

/* Render workshop delivery/receive label pages (10cm × 15cm) */
/* V16.48: 10x15 cm delivery label.
   V16.50: now reads from `printSettings.workshopLabel` (separate from QR labels)
   and embeds a confirmation QR code (when enabled) so the workshop can scan from
   their phone to acknowledge receipt. The QR encodes a URL of the form:
     {origin}/?act=wsdel&ord=<orderId>&ws=<wsId>&idx=<deliveryIdx>     (legacy)
   or, V16.73 onwards (when the caller has a signature):
     {origin}/?wd=1&ord=<orderId>&ws=<wsId>&idx=<deliveryIdx>&sig=<hmac>
   The new format opens a public WorkshopConfirmPage with NO login required.
   Backward-compatible: callers that don't pass the workshop slot still get a
   reasonable default.
   V16.73: accepts optional `existingWin` — when the caller has already opened
   a print window synchronously (to fetch the sig without tripping the popup
   blocker), we reuse it. Same pattern as printSalesDeliveryLabel. */
export function renderLabelPages(d,n,cfg,clarkLogoDataUrl,confirmUrl,existingWin){
  let pw;
  if(existingWin){
    pw=existingWin;
    /* Reset any loading placeholder content the caller wrote */
    try{pw.document.open()}catch(e){}
  }else{
    pw=openPrintWindow();if(!pw){alert("المتصفح بيمنع فتح نافذة الطباعة — فعّل النوافذ المنبثقة");return}
  }
  /* Pull workshopLabel slot if cfg is the full printSettings object,
     otherwise treat cfg itself as the slot (back-compat with V16.48). */
  const ws=cfg&&cfg.workshopLabel?cfg.workshopLabel:(cfg||{});
  const fontFam=ws.fontFamily||"Cairo";
  const fontUrl=_GOOGLE_FONT_URLS_QR[fontFam]||_GOOGLE_FONT_URLS_QR.Cairo;
  const showLogo=!!ws.showLogo;
  const fields=ws.fields||{};
  const showDesc=fields.modelDesc?.show!==false&&fields.desc?.show!==false;/* legacy "desc" key support */
  const showSize=fields.sizeLabel?.show!==false;
  const showCutQty=fields.cutQty?.show!==false;
  const showQr=fields.qrConfirm?.show!==false&&!!confirmUrl;
  pw.document.write("<!DOCTYPE html><html dir='rtl'><head><meta charset='utf-8'/><script src='https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js'></"+"script><link href='"+fontUrl+"' rel='stylesheet'/><title>"+d.title+"</title><style>"
  +"@page{size:10cm 15cm;margin:0}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'"+fontFam+"',Arial,sans-serif;color:#000}"
  /* V16.58: Page is FIXED 10×15cm (height not min-height) so .pg-inner can be
     measured against a hard ceiling. Auto-fit JS later transforms .pg-inner
     down by a scale factor when its scrollHeight exceeds the page height. */
  +".pg{width:10cm;height:15cm;padding:4mm;display:flex;flex-direction:column;page-break-after:always;overflow:hidden;position:relative}.pg:last-child{page-break-after:auto}"
  +".pg-inner{display:flex;flex-direction:column;flex:1;transform-origin:top right;width:100%}"
  +".brand{text-align:center;padding-bottom:1.5mm;border-bottom:2px solid #000;margin-bottom:2mm}"
  +".brand-img{height:8mm;max-width:60%;filter:brightness(0) saturate(100%);display:inline-block;object-fit:contain;vertical-align:middle}"
  +".brand-txt{font-size:11pt;font-weight:800;letter-spacing:2px;color:#000}"
  +".tp{text-align:center;font-size:11pt;font-weight:800;border:2.5px solid #000;display:block;width:fit-content;padding:1mm 6mm;border-radius:4px;margin:0 auto 2mm;color:#000}"
  +".big{text-align:center;padding:2mm;border:2.5px solid #000;border-radius:6px;margin-bottom:2mm;color:#000}.big .pc{font-size:13pt;font-weight:800}.big .qt{font-size:18pt;font-weight:800}"
  +"table{width:100%;border-collapse:collapse;margin-bottom:2mm}td{padding:1mm 3mm;font-size:9pt;font-weight:700;border:1px solid #000;color:#000}td.k{font-weight:800;width:35%}"
  +".mv{border:2px solid #000;border-radius:4px;overflow:hidden;margin-bottom:2mm}.mvr{display:flex;justify-content:space-between;padding:1.5mm 3mm;font-size:9pt;font-weight:800;border-bottom:1px solid #000;color:#000}.mvr:last-child{border-bottom:none}"
  +".bot{display:flex;align-items:center;justify-content:space-between;gap:3mm;margin-top:auto;padding-top:2mm}"
  +".qrbox{text-align:center;padding:1mm;border:2px solid #000;border-radius:4px}.qrbox canvas{width:22mm;height:22mm;display:block}"
  +".qrbox .qrlbl{font-size:6pt;font-weight:700;margin-top:0.5mm;color:#000}"
  +".bags{font-size:26pt;font-weight:800;border:3px solid #000;border-radius:8px;padding:1mm 5mm;line-height:1;color:#000}"
  +".foot{text-align:center;font-size:7pt;color:#000;padding-top:1mm;border-top:1px dashed #000;margin-top:2mm}"
  +".pbar{position:sticky;top:0;background:#fff;padding:4px;display:none;justify-content:center;gap:6px;border-bottom:2px solid #ccc;z-index:99}"
  +".pbar button{padding:5px 14px;border-radius:6px;border:1px solid #000;cursor:pointer;font-family:'"+fontFam+"';font-size:11px;font-weight:700;background:#fff}.pbar .pr{background:#000;color:#fff}"
  +"@media(max-width:1024px){.pbar{display:flex}}@media print{.pbar{display:none}}"
  +"</style></head><body>");
  let h="<div class='pbar'><button onclick='window.close()'>↩</button><button class='pr' onclick='window.print()'>🖨 "+n+"</button></div>";
  const brandHtml="<div class='brand'>"+(showLogo&&clarkLogoDataUrl?"<img class='brand-img' src='"+clarkLogoDataUrl+"' alt='CLARK'/>":"<div class='brand-txt'>CLARK Factory</div>")+"</div>";
  const dataRows=[
    ["الموديل",d.modelNo||""],
    ...(showDesc?[["الوصف",d.modelDesc||""]]:[]),
    ...(showSize&&d.sizeLabel?[["المقاسات",d.sizeLabel]]:[]),
    ["الورشة",d.wsName||""],
    ...(showCutQty?[["القص",String(d.cutQty||"")]]:[])
  ];
  const tableHtml="<table>"+dataRows.map(([k,v])=>"<tr><td class='k'>"+k+"</td><td>"+v+"</td></tr>").join("")+"</table>";
  /* V16.58: Each page wraps its content in `.pg-inner` so the auto-fit script
     below can scale just the content while the page chrome stays put. */
  for(let i=1;i<=n;i++){h+="<div class='pg'><div class='pg-inner'>"+brandHtml+"<div class='tp'>"+d.arrow+" "+d.title+"</div>"
    +"<div class='big'><div class='pc'>"+d.piece+"</div><div class='qt'>"+d.qty+" قطعة</div></div>"
    +tableHtml
    +"<div class='mv'><div class='mvr'><span>↗ تسليم</span><span>"+d.delQty+"</span><span>"+d.delDate+"</span></div>"
    +(d.isRcv?"<div class='mvr'><span>↙ استلام</span><span>"+d.rcvQty+"</span><span>"+d.rcvDate+"</span></div>":"")+"</div>"
    +"<div class='bot'>"
    +(showQr?"<div class='qrbox'><canvas class='conf-qr' data-url='"+confirmUrl.replace(/'/g,"\\'")+"'></canvas><div class='qrlbl'>📱 امسح للتأكيد</div></div>":"<div></div>")
    +(n>1?"<div class='bags'>"+i+"/"+n+"</div>":"<div></div>")
    +"</div>"
    +"<div class='foot'>"+d.modelNo+" | "+d.piece+" | "+d.wsName+"</div></div></div>"}
  /* V16.58: Auto-fit script — runs after QR canvases render. For each page,
     compares the inner content's scrollHeight against the available height
     (page height minus padding). If overflowing, applies a transform:scale()
     proportional to the overflow ratio so all the toggled content fits in
     10×15cm regardless of which fields/logo/QR are enabled. The 0.98 multiplier
     leaves a tiny visual margin so the printed edge doesn't touch the paper.
     Two passes (QR-then-fit) are needed because QR canvas dims affect height. */
  h+="<script>(function(){"
    +"document.querySelectorAll('.conf-qr').forEach(function(c){try{QRCode.toCanvas(c,c.dataset.url,{width:120,margin:1,errorCorrectionLevel:'M'},function(){})}catch(e){}});"
    +"function autoFit(){document.querySelectorAll('.pg').forEach(function(pg){var inner=pg.querySelector('.pg-inner');if(!inner)return;"
    +"var pgStyle=getComputedStyle(pg);var padTop=parseFloat(pgStyle.paddingTop)||0;var padBot=parseFloat(pgStyle.paddingBottom)||0;"
    +"var available=pg.clientHeight-padTop-padBot;var content=inner.scrollHeight;"
    +"if(content>available){var scale=(available/content)*0.98;inner.style.transform='scale('+scale.toFixed(3)+')';inner.style.width=(100/scale).toFixed(2)+'%';}"
    +"else{inner.style.transform='';inner.style.width='100%';}});}"
    +"setTimeout(autoFit,300);setTimeout(autoFit,800);"  /* twice: once for fonts, once after QR/img */
    +"setTimeout(function(){window.print()},1000);"
    +"})();</"+"script>";
  pw.document.write(h+"</body></html>");pw.document.close();
  /* V16.75: Removed duplicate external print() call — the internal script
     at line ~471 (setTimeout window.print at 1000ms) already triggers print.
     The external pw.print() at 500ms was firing FIRST, the dialog would close,
     and then the internal script would re-trigger it 500ms later → "dialog
     opens twice" symptom. Other print functions (printPkgLabel etc) only use
     the internal script, so this brings renderLabelPages in line with them. */
}

/* V15.23: openPrintWindow — returns a window-like object that works with the
   classic `const pw = window.open(...); pw.document.write(...); pw.document.close(); pw.print();`
   pattern used throughout the codebase. If the browser blocks popups, falls back to a hidden
   iframe inside the current page — both paths expose the same {document, print, close, focus} API.
   Returns null only if everything fails (document.body missing etc.). */
export function openPrintWindow(){
  /* Try the traditional popup first */
  let pw=null;
  try{pw=window.open("","_blank")}catch(e){pw=null}
  if(pw){
    /* Real window — already has document/print/close/focus */
    return pw;
  }
  /* Fallback: hidden iframe inside current page */
  try{
    if(!document.body)return null;
    const iframe=document.createElement("iframe");
    iframe.style.cssText="position:fixed;left:-9999px;top:0;width:1px;height:1px;border:0;opacity:0";
    document.body.appendChild(iframe);
    const doc=iframe.contentDocument||iframe.contentWindow.document;
    /* Auto-cleanup iframe after 60s to allow print dialog to finish */
    let cleanupTimer=setTimeout(()=>{try{iframe.remove()}catch(_){}},60000);
    /* Build a window-like wrapper so all existing callers work without changes */
    const fakeWin={
      document:doc,
      print:()=>{try{iframe.contentWindow.focus();iframe.contentWindow.print()}catch(e){
        alert("المتصفح بيمنع الطباعة — فعّل النوافذ المنبثقة (pop-ups) من إعدادات المتصفح")
      }},
      focus:()=>{try{iframe.contentWindow.focus()}catch(e){}},
      close:()=>{/* extend cleanup window a bit, then remove */
        clearTimeout(cleanupTimer);
        cleanupTimer=setTimeout(()=>{try{iframe.remove()}catch(_){}},60000);
      },
      /* Flag so callers can detect fallback mode if needed */
      _isIframeFallback:true,
    };
    return fakeWin;
  }catch(e){
    try{alert("فشل فتح نافذة الطباعة: "+(e.message||e))}catch(_){}
    return null;
  }
}

/* V15.48: Print salary envelopes — DL size (220×110mm landscape), direct-to-envelope feed.
   Each employee = one envelope page. QR format matches existing CLARK:EMP:<id> so scanning
   works identically to the thermal ID cards (uses same receipt registration flow).
   V15.57: Week number moved above QR as a professional "stamp" badge. */
export function printSalaryEnvelopes(empsList,weekInfo,configInfo){
  const pw=openPrintWindow();if(!pw){alert("المتصفح بيمنع فتح نافذة الطباعة — فعّل النوافذ المنبثقة");return}
  const logo=(configInfo&&configInfo.logo)||"";
  const factoryName=(configInfo&&configInfo.factoryName)||"CLARK Factory";
  const weekLabel=weekInfo?("W"+(weekInfo.weekNum||"")):"";
  const weekDate=(weekInfo&&weekInfo.startDate)||"";
  let envelopes="";
  empsList.forEach(e=>{
    const qr=("CLARK:EMP:"+e.id).replace(/'/g,"\\'");
    envelopes+="<div class='env'>"
      +"<div class='hdr'>"
        +(logo?"<img src='"+logo+"' class='logo' alt=''/>":"<div class='logo-ph'></div>")
        +"<div class='brand'>"+factoryName+"</div>"
        +(weekDate?"<div class='date'>"+weekDate+"</div>":"")
      +"</div>"
      +"<div class='divider'></div>"
      +"<div class='body'>"
        +"<div class='qr-col'>"
          +"<div class='week-badge'>"
            +"<div class='week-label'>الأسبوع</div>"
            +"<div class='week-num'>"+weekLabel+"</div>"
          +"</div>"
          +"<canvas class='qr' data-qr='"+qr+"'></canvas>"
        +"</div>"
        +"<div class='emp-info'>"
          +"<div class='emp-name'>"+(e.name||"")+"</div>"
          +(e.code?"<div class='emp-code'>كود الموظف: <b>"+e.code+"</b></div>":"")
          +"<div class='emp-cta'>💰 استلام المرتب<br/><span class='emp-cta-sub'>امسح كود QR للتأكيد</span></div>"
        +"</div>"
      +"</div>"
    +"</div>";
  });
  pw.document.write("<!DOCTYPE html><html dir='rtl'><head><meta charset='utf-8'/>"
    +"<script src='https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js'></"+"script>"
    +"<link href='https://fonts.googleapis.com/css2?family=Cairo:wght@500;700;800;900&display=swap' rel='stylesheet'/>"
    +"<style>"
    /* DL envelope — 220mm x 110mm landscape. Direct feed into printer. */
    +"@page{size:220mm 110mm;margin:0}"
    +"*{margin:0;padding:0;box-sizing:border-box}"
    +"body{font-family:'Cairo',sans-serif;color:#000;background:#fff}"
    +".env{width:220mm;height:110mm;padding:7mm 12mm;display:flex;flex-direction:column;page-break-after:always;overflow:hidden;position:relative}"
    +".env:last-child{page-break-after:auto}"
    /* Header: logo + factory name + date */
    +".hdr{display:flex;align-items:center;gap:6mm;margin-bottom:2mm}"
    +".logo{width:14mm;height:14mm;object-fit:contain;flex-shrink:0}"
    +".logo-ph{width:14mm;height:14mm;flex-shrink:0}"
    +".brand{font-size:16pt;font-weight:900;flex:1;letter-spacing:0.5px}"
    +".date{font-size:10pt;font-weight:600;color:#000;font-family:'Cairo',monospace;white-space:nowrap}"
    /* Divider */
    +".divider{height:2px;background:linear-gradient(90deg,#000 0%,#000 20%,#888 50%,#000 80%,#000 100%);margin:1mm 0 4mm}"
    /* Body: QR column on right, employee info on left */
    +".body{flex:1;display:flex;align-items:center;gap:8mm}"
    +".qr-col{display:flex;flex-direction:column;align-items:center;gap:2mm;flex-shrink:0}"
    /* Professional week badge — stamp-style above QR */
    +".week-badge{display:flex;flex-direction:column;align-items:center;justify-content:center;width:32mm;padding:1.5mm 0;border:2.5px solid #000;border-radius:2mm;background:#000;color:#fff;line-height:1}"
    +".week-label{font-size:7pt;font-weight:700;letter-spacing:1.5px;opacity:0.75;margin-bottom:0.5mm}"
    +".week-num{font-size:16pt;font-weight:900;font-family:'Cairo',monospace;letter-spacing:1px}"
    +".qr{width:32mm!important;height:32mm!important}"
    /* Employee info */
    +".emp-info{flex:1;display:flex;flex-direction:column;gap:2.5mm}"
    +".emp-name{font-size:22pt;font-weight:900;line-height:1.1}"
    +".emp-code{font-size:12pt;font-weight:600;color:#000}"
    +".emp-code b{font-family:monospace;font-size:13pt;font-weight:800}"
    +".emp-cta{font-size:11pt;font-weight:800;color:#000;padding-top:2mm;border-top:1px dashed #999;margin-top:1mm;line-height:1.4}"
    +".emp-cta-sub{font-size:9pt;font-weight:500;color:#000}"
    /* On-screen preview controls (hidden on print) */
    +".pbar{position:sticky;top:0;background:#fff;padding:6px;display:none;justify-content:center;gap:8px;border-bottom:2px solid #ccc;z-index:10}"
    +".pbar button{padding:6px 16px;border-radius:6px;border:1px solid #000;cursor:pointer;font-family:'Cairo';font-size:11px;font-weight:700;background:#fff}"
    +".pbar .pr{background:#000;color:#fff}"
    +"@media(max-width:1024px){.pbar{display:flex}}@media print{.pbar{display:none}}"
    +"</style></head><body>"
    +"<div class='pbar'><button onclick='window.close()'>↩ رجوع</button><button class='pr' onclick='window.print()'>🖨 طباعة مظاريف</button></div>"
    +envelopes
    +"<script>document.querySelectorAll('.qr').forEach(c=>{QRCode.toCanvas(c,c.dataset.qr,{width:121,margin:0,errorCorrectionLevel:'M'},()=>{})});setTimeout(()=>window.print(),1000)</"+"script></body></html>");
  pw.document.close()}
