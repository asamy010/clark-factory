/* ═══════════════════════════════════════════════════════════════
   CLARK - Print Utilities
   Print-to-window helpers for reports, labels, QR cards.
   All open a new window and write HTML directly.
   ═══════════════════════════════════════════════════════════════ */

import { PRINT_CSS } from "../constants/index.js";
import { CLARK_LOGO } from "../constants/logo.js";

/* Full-page report printing with CLARK header, print/PDF buttons, and footer */
export function printPage(title,bodyHtml){const pw=window.open("","_blank");if(!pw)return;const today=new Date().toLocaleDateString("ar-EG");const safeTitle=String(title||"تقرير").replace(/[\\/:*?"<>|]/g,"_").slice(0,80);pw.document.write("<!DOCTYPE html><html dir='rtl'><head><meta charset='utf-8'/><link href='https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;800&display=swap' rel='stylesheet'/><script src='https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'></"+"script><title>"+title+"</title><style>"+PRINT_CSS+".pbar{position:sticky;top:0;background:#fff;padding:8px 16px;border-bottom:2px solid #E2E8F0;display:none;justify-content:center;gap:10px;z-index:999}.pbar button{padding:8px 22px;border-radius:8px;border:none;cursor:pointer;font-family:'Cairo',sans-serif;font-size:13px;font-weight:700}.pb-back{background:#F1F5F9;color:#475569}.pb-print{background:#0EA5E9;color:#fff}.pb-pdf{background:#EF4444;color:#fff}.pb-pdf:disabled{opacity:0.6;cursor:wait}@media(max-width:1024px){.pbar{display:flex}}@media print{.pbar{display:none}}</style></head><body><div class='pbar'><button class='pb-back' onclick='window.close()'>↩ رجوع</button><button class='pb-print' onclick='window.print()'>🖨 طباعة</button><button class='pb-pdf' id='pdf-btn' onclick='savePdf()'>📄 حفظ PDF</button></div><div id='report-content'><div class='hdr'><div><img src='"+CLARK_LOGO+"'/></div><div class='hdr-info'>"+title+"<br/>"+today+"</div></div>"+bodyHtml+"<div class='foot'>CLARK Factory Management — "+today+"</div></div><script>function savePdf(){var btn=document.getElementById('pdf-btn');if(!window.html2pdf){alert('مكتبة PDF لم تُحمّل بعد — انتظر قليلاً ثم أعد المحاولة');return}var el=document.getElementById('report-content');if(!el){alert('محتوى التقرير غير موجود');return}var orig=btn.textContent;btn.disabled=true;btn.textContent='⏳ جاري الإنشاء...';window.html2pdf().set({margin:[8,8,8,8],filename:'"+safeTitle.replace(/'/g,"\\'")+".pdf',image:{type:'jpeg',quality:0.95},html2canvas:{scale:2,useCORS:true,letterRendering:true},jsPDF:{unit:'mm',format:'a4',orientation:'portrait'},pagebreak:{mode:['css','legacy']}}).from(el).save().then(function(){btn.disabled=false;btn.textContent=orig}).catch(function(e){alert('فشل إنشاء PDF: '+e.message);btn.disabled=false;btn.textContent=orig})}</"+"script></body></html>");pw.document.close();if(window.innerWidth>1024)setTimeout(()=>{pw.focus();pw.print()},500)}

/* Thermal package label — 10x15cm with QR and movement log */
export function printPkgLabel(pkgNum,pkgDate,pkgNote,pkgItems,movements,status,createdBy,qrData){
  const pw=window.open("","_blank");if(!pw)return;
  const totalQ=pkgItems.reduce((s,it)=>s+(Number(it.qty)||0),0);
  const totalSeries=pkgItems.reduce((s,it)=>s+(Number(it.count)||0),0);
  const stLabel=status==="مغلقة"?"مغلقة ❌":status==="مباعة"?"مباعة 💰":"مفتوحة ✅";
  const stColor=status==="مغلقة"?"#EF4444":status==="مباعة"?"#8B5CF6":"#10B981";
  let itemRows="";pkgItems.forEach(it=>{itemRows+="<tr><td class='mn'>"+it.modelNo+"</td><td class='ds'>"+(it.desc||"")+"</td><td class='ct'>"+(it.count||"")+"</td><td class='qt'>"+it.qty+"</td></tr>"});
  let movRows="";(movements||[]).forEach(m=>{const icon=m.type==="add"?"📥":m.type==="remove"?"📤":m.type==="sell"?"💰":"📋";const color=m.type==="add"?"#10B981":m.type==="sell"?"#8B5CF6":"#EF4444";
    movRows+="<tr><td class='md'>"+m.date+"</td><td class='md' style='color:"+color+";font-weight:800'>"+icon+"</td><td class='md'>"+(m.modelNo||m.custName||"")+"</td><td class='md' style='font-weight:700'>"+(m.qty||"")+"</td><td class='md' style='color:#888'>"+(m.by||"")+"</td></tr>"});
  pw.document.write("<!DOCTYPE html><html dir='rtl'><head><meta charset='utf-8'/><script src='https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js'></"+"script><link href='https://fonts.googleapis.com/css2?family=Cairo:wght@600;800;900&display=swap' rel='stylesheet'/><style>"
  +"@page{size:10cm 15cm;margin:0}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Cairo',sans-serif;color:#000}"
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
  +".pbar button{padding:5px 14px;border-radius:6px;border:1px solid #000;cursor:pointer;font-family:'Cairo';font-size:11px;font-weight:700;background:#fff}.pbar .pr{background:#000;color:#fff}"
  +"@media(max-width:1024px){.pbar{display:flex}}@media print{.pbar{display:none}}"
  +"</style></head><body>"
  +"<div class='pbar'><button onclick='window.close()'>↩</button><button class='pr' onclick='window.print()'>🖨</button></div>"
  +"<div class='pg'>"
  +"<div class='brand'>CLARK</div>"
  +"<div class='top'><canvas id='qr'></canvas><div class='top-info'><div class='pn'>📦 "+pkgNum+"</div><div class='pd'>"+pkgDate+(pkgNote?" — "+pkgNote:"")+"</div><div class='ps' style='background:"+stColor+"15;color:"+stColor+"'>"+stLabel+"</div></div></div>"
  +"<div class='sec'>محتويات الكرتونة</div>"
  +"<table><thead><tr><th>الموديل</th><th>الوصف</th><th>سيري</th><th>الكمية</th></tr></thead><tbody>"
  +itemRows
  +"<tr class='tot'><td colspan='2'>الاجمالي</td><td class='ct'>"+totalSeries+"</td><td class='qt' style='font-size:11pt'>"+totalQ+"</td></tr></tbody></table>"
  +(movRows?"<div class='sec'>سجل الحركات</div><table><thead><tr><th>التاريخ</th><th>النوع</th><th>التفاصيل</th><th>الكمية</th><th>بواسطة</th></tr></thead><tbody>"+movRows+"</tbody></table>":"")
  +"<div class='ft'><span>"+(createdBy?"التعبئة: "+createdBy:"")+"</span><span>CLARK Factory Management</span></div>"
  +"</div>"
  +"<script>QRCode.toCanvas(document.getElementById('qr'),'"+qrData.replace("'","\\'")+"',{width:120,margin:1},()=>{});setTimeout(()=>window.print(),800)</"+"script></body></html>");
  pw.document.close()}

/* V14.57: Print employee QR cards — 40×50mm (half the size of package labels) */
export function printEmpQrCards(empsList){
  const pw=window.open("","_blank");if(!pw)return;
  let cards="";
  empsList.forEach((e,i)=>{
    const qr=("CLARK:EMP:"+e.id).replace(/'/g,"\\'");
    /* Each card is its own thermal page — no sheet grid */
    cards+="<div class='card'>"
      +"<div class='brand'>CLARK</div>"
      +"<canvas class='qr' data-qr='"+qr+"'></canvas>"
      +"<div class='nm'>"+(e.name||"")+"</div>"
      +"<div class='cd'>"+(e.code?"#"+e.code:"")+"</div>"
    +"</div>";
  });
  pw.document.write("<!DOCTYPE html><html dir='rtl'><head><meta charset='utf-8'/>"
    +"<script src='https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js'></"+"script>"
    +"<link href='https://fonts.googleapis.com/css2?family=Cairo:wght@600;800;900&display=swap' rel='stylesheet'/>"
    +"<style>"
    /* V14.58: Thermal 40×50mm — one card per page (like printPkgLabel pattern) */
    +"@page{size:40mm 50mm;margin:0}"
    +"*{margin:0;padding:0;box-sizing:border-box}"
    +"body{font-family:'Cairo',sans-serif;color:#000;background:#fff}"
    +".card{width:40mm;height:50mm;padding:2mm;display:flex;flex-direction:column;align-items:center;justify-content:space-between;page-break-after:always;overflow:hidden}"
    +".card:last-child{page-break-after:auto}"
    +".brand{font-size:9pt;font-weight:900;letter-spacing:2.5px;border-bottom:2px solid #000;width:100%;text-align:center;padding-bottom:1mm}"
    +".qr{width:26mm!important;height:26mm!important;margin:1mm 0}"
    +".nm{font-size:10pt;font-weight:800;text-align:center;width:100%;line-height:1.15;padding:0 1mm}"
    +".cd{font-size:9pt;font-weight:700;color:#000;text-align:center;font-family:monospace;border-top:1px dashed #000;width:100%;padding-top:1mm}"
    +".pbar{position:sticky;top:0;background:#fff;padding:6px;display:none;justify-content:center;gap:8px;border-bottom:2px solid #ccc;z-index:10}"
    +".pbar button{padding:6px 16px;border-radius:6px;border:1px solid #000;cursor:pointer;font-family:'Cairo';font-size:11px;font-weight:700;background:#fff}"
    +".pbar .pr{background:#000;color:#fff}"
    +"@media(max-width:1024px){.pbar{display:flex}}@media print{.pbar{display:none}}"
    +"</style></head><body>"
    +"<div class='pbar'><button onclick='window.close()'>↩ رجوع</button><button class='pr' onclick='window.print()'>🖨 طباعة حرارية</button></div>"
    +cards
    +"<script>document.querySelectorAll('.qr').forEach(c=>{QRCode.toCanvas(c,c.dataset.qr,{width:98,margin:0,errorCorrectionLevel:'M'},()=>{})});setTimeout(()=>window.print(),1000)</"+"script></body></html>");
  pw.document.close()}

/* Render workshop delivery/receive label pages (10cm × 15cm) */
export function renderLabelPages(d,n){
  const pw=window.open("","_blank");if(!pw)return;
  pw.document.write("<!DOCTYPE html><html dir='rtl'><head><meta charset='utf-8'/><link href='https://fonts.googleapis.com/css2?family=Cairo:wght@600;800&display=swap' rel='stylesheet'/><title>"+d.title+"</title><style>"
  +"@page{size:10cm 15cm;margin:0}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Cairo',sans-serif;color:#000}"
  +".pg{width:10cm;min-height:15cm;padding:4mm;display:flex;flex-direction:column;page-break-after:always;overflow:hidden}.pg:last-child{page-break-after:auto}"
  +".brand{text-align:center;font-size:10pt;font-weight:800;letter-spacing:2px;color:#555;padding-bottom:1mm;border-bottom:2px solid #000;margin-bottom:2mm}"
  +".tp{text-align:center;font-size:11pt;font-weight:800;border:2.5px solid #000;display:block;width:fit-content;padding:1mm 6mm;border-radius:4px;margin:0 auto 2mm}"
  +".big{text-align:center;padding:2mm;border:2.5px solid #000;border-radius:6px;margin-bottom:2mm}.big .pc{font-size:13pt;font-weight:800}.big .qt{font-size:18pt;font-weight:800}"
  +"table{width:100%;border-collapse:collapse;margin-bottom:2mm}td{padding:1mm 3mm;font-size:9pt;font-weight:700;border:1px solid #000}td.k{font-weight:800;width:35%}"
  +".mv{border:2px solid #000;border-radius:4px;overflow:hidden;margin-bottom:2mm}.mvr{display:flex;justify-content:space-between;padding:1.5mm 3mm;font-size:9pt;font-weight:800;border-bottom:1px solid #000}.mvr:last-child{border-bottom:none}"
  +".bot{display:flex;align-items:center;justify-content:center;gap:5mm;margin-top:auto;padding-top:2mm}.bot img{width:22mm;height:22mm}"
  +".bags{font-size:26pt;font-weight:800;border:3px solid #000;border-radius:8px;padding:1mm 5mm;line-height:1}"
  +".foot{text-align:center;font-size:7pt;color:#555;padding-top:1mm;border-top:1px dashed #000;margin-top:2mm}"
  +".pbar{position:sticky;top:0;background:#fff;padding:4px;display:none;justify-content:center;gap:6px;border-bottom:2px solid #ccc;z-index:99}"
  +".pbar button{padding:5px 14px;border-radius:6px;border:1px solid #000;cursor:pointer;font-family:'Cairo';font-size:11px;font-weight:700;background:#fff}.pbar .pr{background:#000;color:#fff}"
  +"@media(max-width:1024px){.pbar{display:flex}}@media print{.pbar{display:none}}"
  +"</style></head><body>");
  let h="<div class='pbar'><button onclick='window.close()'>↩</button><button class='pr' onclick='window.print()'>🖨 "+n+"</button></div>";
  for(let i=1;i<=n;i++){h+="<div class='pg'><div class='brand'>CLARK Factory</div><div class='tp'>"+d.arrow+" "+d.title+"</div>"
    +"<div class='big'><div class='pc'>"+d.piece+"</div><div class='qt'>"+d.qty+" قطعة</div></div>"
    +"<table><tr><td class='k'>الموديل</td><td>"+d.modelNo+"</td></tr><tr><td class='k'>الوصف</td><td>"+d.modelDesc+"</td></tr><tr><td class='k'>المقاسات</td><td>"+d.sizeLabel+"</td></tr><tr><td class='k'>الورشة</td><td>"+d.wsName+"</td></tr><tr><td class='k'>القص</td><td>"+d.cutQty+"</td></tr></table>"
    +"<div class='mv'><div class='mvr'><span>↗ تسليم</span><span>"+d.delQty+"</span><span>"+d.delDate+"</span></div>"
    +(d.isRcv?"<div class='mvr'><span>↙ استلام</span><span>"+d.rcvQty+"</span><span>"+d.rcvDate+"</span></div>":"")+"</div>"
    +"<div class='bot'>"+(n>1?"<div class='bags'>"+i+"/"+n+"</div>":"")+"</div>"
    +"<div class='foot'>"+d.modelNo+" | "+d.piece+" | "+d.wsName+"</div></div>"}
  pw.document.write(h+"</body></html>");pw.document.close();
  if(window.innerWidth>1024)setTimeout(()=>{pw.focus();pw.print()},500)
}
