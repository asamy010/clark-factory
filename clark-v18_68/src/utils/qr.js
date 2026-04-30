/* ═══════════════════════════════════════════════════════════════
   CLARK - QR & File Utilities
   Dynamic library loaders for QR/XLSX + small file compression.
   Modules are cached at module-level after first load.
   ═══════════════════════════════════════════════════════════════ */

/* Module-level lazy-loaded libs */
let _XLSX=null,_QR=null,_jsQR=null;

export const loadXLSX=async()=>{if(!_XLSX)try{_XLSX=await import("xlsx")}catch(e){};return _XLSX};
export const loadQR=async()=>{if(!_QR)try{const m=await import("qrcode");_QR=m.default||m}catch(e){};return _QR};
export const loadJsQR=()=>new Promise(res=>{if(_jsQR)return res(_jsQR);if(window.jsQR)return res(_jsQR=window.jsQR);const s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js";s.onload=()=>{_jsQR=window.jsQR;res(_jsQR)};s.onerror=()=>res(null);document.head.appendChild(s)});

export const scanQR=async(canvas)=>{const hasBD=typeof BarcodeDetector!=="undefined";if(hasBD){try{const det=new BarcodeDetector({formats:["qr_code"]});const codes=await det.detect(canvas);if(codes.length>0)return codes[0].rawValue}catch(e){}}const jq=_jsQR||await loadJsQR();if(!jq)return null;const ctx=canvas.getContext("2d",{willReadFrequently:true});const img=ctx.getImageData(0,0,canvas.width,canvas.height);const r=jq(img.data,img.width,img.height);return r?r.data:null};

/* Simple base64 file reader — returns null for files larger than 1MB */
export function compressFile(file){
  return new Promise((resolve)=>{
    if(file.size>1000000){resolve(null);return}
    const reader=new FileReader();reader.onload=(e)=>resolve({name:file.name,type:file.type,data:e.target.result,size:file.size});reader.readAsDataURL(file)
  })
}
