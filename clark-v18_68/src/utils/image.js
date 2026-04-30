/* ═══════════════════════════════════════════════════════════════
   CLARK - Image Utilities
   Image compression helpers using Canvas API.
   Pure functions — no external dependencies.
   ═══════════════════════════════════════════════════════════════ */

/* Compress image with 3:4 aspect ratio (portrait) crop */
export function compressImage(file,maxW,quality){
  return new Promise((resolve)=>{const reader=new FileReader();reader.onload=(e)=>{const img=new Image();img.onload=()=>{
    const canvas=document.createElement("canvas");let w=img.width,h=img.height;const max=maxW||300;
    if(w>max||h>max){if(w>h){h=Math.round(h*max/w);w=max}else{w=Math.round(w*max/h);h=max}}
    const tr=3/4,cr=w/h;let cw=w,ch=h,sx=0,sy=0;
    if(cr>tr){cw=Math.round(h*tr);sx=Math.round((w-cw)/2)}else{ch=Math.round(w/tr);sy=Math.round((h-ch)/2)}
    canvas.width=cw;canvas.height=ch;const ctx=canvas.getContext("2d");
    const scX=img.width/w,scY=img.height/h;
    ctx.drawImage(img,sx*scX,sy*scY,cw*scX,ch*scY,0,0,cw,ch);
    resolve(canvas.toDataURL("image/jpeg",quality||0.5))};img.src=e.target.result};reader.readAsDataURL(file)})
}

/* Compress image with 4:3 aspect ratio (landscape) crop */
export function compressImg43(file,maxW,quality){
  return new Promise((resolve)=>{const reader=new FileReader();reader.onload=(e)=>{const img=new Image();img.onload=()=>{
    const canvas=document.createElement("canvas");let w=img.width,h=img.height;const max=maxW||400;
    if(w>max||h>max){if(w>h){h=Math.round(h*max/w);w=max}else{w=Math.round(w*max/h);h=max}}
    const tr=4/3,cr=w/h;let cw=w,ch=h,sx=0,sy=0;
    if(cr>tr){cw=Math.round(h*tr);sx=Math.round((w-cw)/2)}else{ch=Math.round(w/tr);sy=Math.round((h-ch)/2)}
    canvas.width=cw;canvas.height=ch;const ctx=canvas.getContext("2d");
    const scX=img.width/w,scY=img.height/h;
    ctx.drawImage(img,sx*scX,sy*scY,cw*scX,ch*scY,0,0,cw,ch);
    resolve(canvas.toDataURL("image/jpeg",quality||0.5))};img.src=e.target.result};reader.readAsDataURL(file)})
}
