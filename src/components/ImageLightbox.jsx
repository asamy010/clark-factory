/* ═══════════════════════════════════════════════════════════════
   CLARK · ImageLightbox.jsx (V21.27.19)
   عرض صورة بجودتها الكاملة في بوب اب (موديل/أوردر/أي صورة). Esc/كليك
   بره/زر ✕ يقفل. zoom بسيط بالضغط على الصورة.
   ═══════════════════════════════════════════════════════════════ */
import { useEffect, useState } from "react";
import { T } from "../theme.js";

export function ImageLightbox({ src, alt, onClose }){
  const [zoom, setZoom] = useState(false);
  useEffect(() => {
    const h = (e) => { if(e.key === "Escape") onClose && onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);
  if(!src) return null;
  return (
    <div onClick={() => onClose && onClose()} style={{ position: "fixed", inset: 0, zIndex: 100090, background: "rgba(0,0,0,0.92)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflow: "auto" }}>
      <img src={src} alt={alt || ""} onClick={e => { e.stopPropagation(); setZoom(z => !z); }}
        style={{ maxWidth: zoom ? "none" : "96vw", maxHeight: zoom ? "none" : "94vh", width: zoom ? "auto" : undefined, objectFit: "contain", borderRadius: 8, cursor: zoom ? "zoom-out" : "zoom-in", boxShadow: "0 20px 80px rgba(0,0,0,0.6)" }} />
      <button onClick={e => { e.stopPropagation(); onClose && onClose(); }} title="إغلاق"
        style={{ position: "fixed", top: 14, insetInlineEnd: 14, width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)", fontSize: 20, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
      {alt && <div style={{ position: "fixed", bottom: 14, insetInlineStart: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.5)", color: "#fff", padding: "6px 16px", borderRadius: 999, fontSize: 13, fontWeight: 700, maxWidth: "90vw", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{alt}</div>}
    </div>
  );
}

export default ImageLightbox;
