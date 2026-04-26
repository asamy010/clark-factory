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
  let movRows="";(movements||[]).forEach(m=>{const icon=m.type==="add"?"📥":m.type==="remove"?"📤":m.type==="sell"?"💰":"📋";const color=m.type==="add"?"#10B981":m.type==="sell"?"#8B5CF6":"#EF4444";
    movRows+="<tr><td class='md'>"+m.date+"</td><td class='md' style='color:"+color+";font-weight:800'>"+icon+"</td><td class='md'>"+(m.modelNo||m.custName||"")+"</td><td class='md' style='font-weight:700'>"+(m.qty||"")+"</td><td class='md' style='color:#888'>"+(m.by||"")+"</td></tr>"});
  /* Brand row: image when enabled, else text */
  const brandHtml=showLogo&&clarkLogoDataUrl
    ?"<div class='brand'><img src='"+clarkLogoDataUrl+"' alt='CLARK' style='height:9mm;max-width:55%;filter:brightness(0) saturate(100%);object-fit:contain'/></div>"
    :"<div class='brand'>CLARK</div>";
  pw.document.write("<!DOCTYPE html><html dir='rtl'><head><meta charset='utf-8'/><script src='https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js'></"+"script><link href='"+fontUrl+"' rel='stylesheet'/><style>"
  +"@page{size:10cm 15cm;margin:0}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'"+fontFam+"',Arial,sans-serif;color:#000}"
  +".pg{width:10cm;min-height:15cm;padding:3mm;display:flex;flex-direction:column}"
  +".brand{text-align:center;font-size:11pt;font-weight:900;letter-spacing:3px;padding:1.5mm 0;border-bottom:2px solid #000}"
  +".top{display:flex;align-items:center;gap:3mm;padding:2mm 0;border-bottom:1px solid #999}"
  +".top canvas{flex-shrink:0}.top-info{flex:1;text-align:center}"
  +".pn{font-size:16pt;font-weight:900;color:#0EA5E9}.pd{font-size:8pt;color:#555}.ps{font-size:8pt;font-weight:700;display:inline-block;padding:1px 6px;border-radius:4px}"
  +"table{width:100%;border-collapse:collapse}th{background:#E2E8F0;font-weight:800;font-size:7pt;padding:1.5mm 2mm;border:1px solid #94A3B8;text-align:right}"
  +"td{padding:1.5mm 2mm;border:1px solid #CBD5E1;font-size:8pt}.mn{font-weight:800;font-size:9pt}.ds{font-size:7pt;color:#444}.ct{text-align:center;font-size:8pt}.qt{text-align:center;font-weight:800;font-size:10pt;color:#0EA5E9}"
  +".tot td{background:#EFF6FF;font-weight:800;font-size:9pt}"
  +".sec{font-size:7pt;font-weight:800;color:#475569;margin:2mm 0 1mm;padding-bottom:1mm;border-bottom:1px solid #E2E8F0}"
  +".md{padding:1mm 2mm;font-size:6.5pt;border:1px solid #E2E8F0}"
  +".ft{margin-top:auto;padding-top:1.5mm;border-top:1px solid #000;display:flex;justify-content:space-between;font-size:6pt;color:#888;font-weight:600}"
  +".pbar{position:sticky;top:0;background:#fff;padding:4px;display:none;justify-content:center;gap:6px;border-bottom:2px solid #ccc}"
  +".pbar button{padding:5px 14px;border-radius:6px;border:1px solid #000;cursor:pointer;font-family:'"+fontFam+"';font-size:11px;font-weight:700;background:#fff}.pbar .pr{background:#000;color:#fff}"
  +"@media(max-width:1024px){.pbar{display:flex}}@media print{.pbar{display:none}}"
  +"</style></head><body>"
  +"<div class='pbar'><button onclick='window.close()'>↩</button><button class='pr' onclick='window.print()'>🖨</button></div>"
  +"<div class='pg'>"
  +brandHtml
  +"<div class='top'>"
  +(showQr?"<canvas id='qr'></canvas>":"")
  +"<div class='top-info'><div class='pn'>📦 "+pkgNum+"</div><div class='pd'>"+pkgDate+(showNote&&pkgNote?" — "+pkgNote:"")+"</div><div class='ps' style='background:"+stColor+"15;color:"+stColor+"'>"+stLabel+"</div></div></div>"
  +"<div class='sec'>محتويات الكرتونة</div>"
  +"<table><thead><tr><th>الموديل</th><th>الوصف</th><th>سيري</th><th>الكمية</th></tr></thead><tbody>"
  +itemRows
  +"<tr class='tot'><td colspan='2'>الاجمالي</td><td class='ct'>"+totalSeries+"</td><td class='qt' style='font-size:11pt'>"+totalQ+"</td></tr></tbody></table>"
  +(showMovements&&movRows?"<div class='sec'>سجل الحركات</div><table><thead><tr><th>التاريخ</th><th>النوع</th><th>التفاصيل</th><th>الكمية</th><th>بواسطة</th></tr></thead><tbody>"+movRows+"</tbody></table>":"")
  +"<div class='ft'><span>"+(showCreatedBy&&createdBy?"التعبئة: "+createdBy:"")+"</span><span>CLARK Factory Management</span></div>"
  +"</div>"
  +(showQr?"<script>QRCode.toCanvas(document.getElementById('qr'),'"+qrData.replace(/'/g,"\\'")+"',{width:120,margin:1},function(){});setTimeout(function(){window.print()},800)</"+"script>":"<script>setTimeout(function(){window.print()},400)</"+"script>")
  +"</body></html>");
  pw.document.close()}

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
     {origin}/?act=wsdel&ord=<orderId>&ws=<wsId>&idx=<deliveryIdx>
   Backward-compatible: callers that don't pass the workshop slot still get a
   reasonable default. */
export function renderLabelPages(d,n,cfg,clarkLogoDataUrl,confirmUrl){
  const pw=openPrintWindow();if(!pw){alert("المتصفح بيمنع فتح نافذة الطباعة — فعّل النوافذ المنبثقة");return}
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
  +".pg{width:10cm;min-height:15cm;padding:4mm;display:flex;flex-direction:column;page-break-after:always;overflow:hidden}.pg:last-child{page-break-after:auto}"
  +".brand{text-align:center;padding-bottom:1.5mm;border-bottom:2px solid #000;margin-bottom:2mm}"
  +".brand-img{height:8mm;max-width:60%;filter:brightness(0) saturate(100%);display:inline-block;object-fit:contain;vertical-align:middle}"
  +".brand-txt{font-size:11pt;font-weight:800;letter-spacing:2px;color:#000}"
  +".tp{text-align:center;font-size:11pt;font-weight:800;border:2.5px solid #000;display:block;width:fit-content;padding:1mm 6mm;border-radius:4px;margin:0 auto 2mm}"
  +".big{text-align:center;padding:2mm;border:2.5px solid #000;border-radius:6px;margin-bottom:2mm}.big .pc{font-size:13pt;font-weight:800}.big .qt{font-size:18pt;font-weight:800}"
  +"table{width:100%;border-collapse:collapse;margin-bottom:2mm}td{padding:1mm 3mm;font-size:9pt;font-weight:700;border:1px solid #000}td.k{font-weight:800;width:35%}"
  +".mv{border:2px solid #000;border-radius:4px;overflow:hidden;margin-bottom:2mm}.mvr{display:flex;justify-content:space-between;padding:1.5mm 3mm;font-size:9pt;font-weight:800;border-bottom:1px solid #000}.mvr:last-child{border-bottom:none}"
  +".bot{display:flex;align-items:center;justify-content:space-between;gap:3mm;margin-top:auto;padding-top:2mm}"
  +".qrbox{text-align:center;padding:1mm;border:2px solid #000;border-radius:4px}.qrbox canvas{width:22mm;height:22mm;display:block}"
  +".qrbox .qrlbl{font-size:6pt;font-weight:700;margin-top:0.5mm;color:#333}"
  +".bags{font-size:26pt;font-weight:800;border:3px solid #000;border-radius:8px;padding:1mm 5mm;line-height:1}"
  +".foot{text-align:center;font-size:7pt;color:#555;padding-top:1mm;border-top:1px dashed #000;margin-top:2mm}"
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
  for(let i=1;i<=n;i++){h+="<div class='pg'>"+brandHtml+"<div class='tp'>"+d.arrow+" "+d.title+"</div>"
    +"<div class='big'><div class='pc'>"+d.piece+"</div><div class='qt'>"+d.qty+" قطعة</div></div>"
    +tableHtml
    +"<div class='mv'><div class='mvr'><span>↗ تسليم</span><span>"+d.delQty+"</span><span>"+d.delDate+"</span></div>"
    +(d.isRcv?"<div class='mvr'><span>↙ استلام</span><span>"+d.rcvQty+"</span><span>"+d.rcvDate+"</span></div>":"")+"</div>"
    +"<div class='bot'>"
    +(showQr?"<div class='qrbox'><canvas class='conf-qr' data-url='"+confirmUrl.replace(/'/g,"\\'")+"'></canvas><div class='qrlbl'>📱 امسح للتأكيد</div></div>":"<div></div>")
    +(n>1?"<div class='bags'>"+i+"/"+n+"</div>":"<div></div>")
    +"</div>"
    +"<div class='foot'>"+d.modelNo+" | "+d.piece+" | "+d.wsName+"</div></div>"}
  h+="<script>document.querySelectorAll('.conf-qr').forEach(function(c){QRCode.toCanvas(c,c.dataset.url,{width:120,margin:1,errorCorrectionLevel:'M'},function(){})});setTimeout(function(){window.print()},800)</"+"script>";
  pw.document.write(h+"</body></html>");pw.document.close();
  if(window.innerWidth>1024)setTimeout(()=>{try{pw.focus();pw.print()}catch(e){}},500)
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
    +".date{font-size:10pt;font-weight:600;color:#555;font-family:'Cairo',monospace;white-space:nowrap}"
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
    +".emp-code{font-size:12pt;font-weight:600;color:#333}"
    +".emp-code b{font-family:monospace;font-size:13pt;font-weight:800}"
    +".emp-cta{font-size:11pt;font-weight:800;color:#000;padding-top:2mm;border-top:1px dashed #999;margin-top:1mm;line-height:1.4}"
    +".emp-cta-sub{font-size:9pt;font-weight:500;color:#666}"
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
