/* ═══════════════════════════════════════════════════════════════════════
   CLARK · DefaultModelImg (V19.0)
   ───────────────────────────────────────────────────────────────────────
   Renders an image with a 3:4 portrait aspect ratio.
   If `src` is missing or empty, shows a default placeholder with a garment
   icon, the model number, and the piece type — all on a soft gradient.

   Used in: order list cards (DetPg list view), order detail page,
   and any other place that previously rendered a raw <img> for a model.
   ═══════════════════════════════════════════════════════════════════════ */

import { T } from "../theme.js";
import { FS } from "../constants/index.js";

function pieceIconFor(modelDesc, orderPieces){
  /* Try to infer piece type from model description or first orderPiece */
  const txt = ((modelDesc||"") + " " + ((orderPieces||[])[0]||"")).trim();
  if(!txt)return"👕";
  if(txt.includes("تيشيرت")||txt.includes("تى شيرت"))return"👕";
  if(txt.includes("قميص"))return"👔";
  if(txt.includes("شورت")||txt.includes("بنطلون"))return"🩳";
  if(txt.includes("بدلة")||txt.includes("سوت")||txt.includes("طقم"))return"🥋";
  if(txt.includes("جاكيت"))return"🧥";
  if(txt.includes("فستان"))return"👗";
  if(txt.includes("جيبة"))return"👗";
  if(txt.includes("بلوزة"))return"👚";
  if(txt.includes("كولوت"))return"🩲";
  return"👕";
}

export function DefaultModelImg({src,modelNo,modelDesc,orderPieces,width,height,style,className,onClick,title}){
  const hasImg = src && typeof src==="string" && src.trim().length>0;
  /* Standard 3:4 portrait. Width takes priority; height auto-derived. */
  const w = width || (height ? Math.round(height*3/4) : null);
  const h = height || (width ? Math.round(width*4/3) : null);
  const sizeStyle = w&&h ? {width:w, height:h} : {width:"100%", aspectRatio:"3 / 4"};
  const baseStyle = {
    ...sizeStyle,
    borderRadius: 8,
    flexShrink: 0,
    objectFit: "cover",
    ...(style||{})
  };

  if(hasImg){
    return <img
      src={src} alt={modelNo||""}
      className={className} style={baseStyle}
      onClick={onClick} title={title}
      onError={(e)=>{e.currentTarget.style.display="none";const ph=e.currentTarget.nextElementSibling;if(ph)ph.style.display="flex"}}
    />;
  }

  /* Placeholder */
  return <div
    className={className}
    onClick={onClick}
    title={title||(modelNo||"بدون صورة")}
    style={{
      ...baseStyle,
      background:"linear-gradient(135deg, "+T.accent+"15, "+T.accent+"06)",
      border:"1px dashed "+T.accent+"30",
      display:"flex",
      flexDirection:"column",
      alignItems:"center",
      justifyContent:"center",
      gap:4,
      padding:6,
      overflow:"hidden",
      cursor:onClick?"pointer":"default",
    }}>
    <span style={{
      fontSize: w&&w<60 ? 22 : w&&w<100 ? 32 : 44,
      lineHeight:1,
      filter:"grayscale(0.2) opacity(0.85)",
    }}>{pieceIconFor(modelDesc, orderPieces)}</span>
    {modelNo && <span style={{
      fontSize: FS-3, fontWeight:800, color:T.accent,
      textAlign:"center",lineHeight:1.2,
      maxWidth:"100%",
      overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
      fontFamily:"monospace",
    }}>{modelNo}</span>}
    <span style={{
      fontSize: FS-4, color:T.textMut, fontWeight:600,
      lineHeight:1,
    }}>بدون صورة</span>
  </div>;
}
