/* ═══════════════════════════════════════════════════════════════
   CLARK V21.9.123 — AttachmentViewer
   ───────────────────────────────────────────────────────────────
   Full-screen viewer for an attachment. Supports:
   - Image display (fits viewport, native zoom on touch devices)
   - PDF in iframe
   - Keyboard nav: ← → arrows, Esc to close
   - Caption edit, delete, download, navigation between siblings

   Props:
     attachments    : array of attachment metadata (sorted recent-first)
     startIndex     : initial index
     onClose        : () => void
     onDelete       : (attachment) => void   (omitted → no delete btn)
     onEditCaption  : (attachment) => void   (omitted → no edit btn)
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect } from "react";
import { T } from "../../theme.js";
import { FS } from "../../constants/index.js";
import { getFileMimeKind, formatFileSize } from "../../utils/universalAttachments.js";

export function AttachmentViewer({ attachments, startIndex, onClose, onDelete, onEditCaption }){
  const [idx, setIdx] = useState(typeof startIndex === "number" ? startIndex : 0);
  /* V21.27.60: تكبير/تحريك الصورة (zoom + pan) — للديسكتوب بالأزرار والعجلة،
     واللمس بالـ pinch الأصلي. */
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useState(() => ({ on: false, sx: 0, sy: 0, px: 0, py: 0 }))[0];
  const safeIdx = Math.max(0, Math.min(idx, (attachments || []).length - 1));
  const current = (attachments || [])[safeIdx];

  /* صفّر الـ zoom/pan عند تغيير الصورة */
  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, [safeIdx]);

  const clampZoom = (z) => Math.max(1, Math.min(6, z));
  const zoomBy = (f) => setZoom(z => { const nz = clampZoom(z * f); if(nz === 1) setPan({ x: 0, y: 0 }); return nz; });
  const onWheel = (e) => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15); };
  const onImgDown = (e) => { if(zoom <= 1) return; e.preventDefault(); dragRef.on = true; dragRef.sx = e.clientX; dragRef.sy = e.clientY; dragRef.px = pan.x; dragRef.py = pan.y; };
  const onImgMove = (e) => { if(!dragRef.on) return; setPan({ x: dragRef.px + (e.clientX - dragRef.sx), y: dragRef.py + (e.clientY - dragRef.sy) }); };
  const onImgUp = () => { dragRef.on = false; };

  useEffect(() => {
    function onKey(e){
      if(e.key === "Escape") onClose && onClose();
      else if(e.key === "ArrowLeft") setIdx(i => Math.min(i + 1, (attachments || []).length - 1));  /* RTL: left = next */
      else if(e.key === "ArrowRight") setIdx(i => Math.max(i - 1, 0));
      else if(e.key === "+" || e.key === "=") zoomBy(1.2);
      else if(e.key === "-") zoomBy(1 / 1.2);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [attachments, onClose]);

  if(!current) return null;
  const kind = getFileMimeKind(current.mimeType);

  const btnStyle = {
    padding: "6px 12px",
    background: "rgba(255,255,255,0.18)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.25)",
    borderRadius: 8,
    fontSize: FS-2,
    fontFamily: "inherit",
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 99999,
        background: "rgba(0,0,0,0.92)",
        display: "flex", flexDirection: "column",
        direction: "rtl", fontFamily: "'Cairo',sans-serif",
      }}
    >
      {/* Header — stops propagation so clicks here don't close. */}
      <div onClick={(e) => e.stopPropagation()} style={{
        padding: "10px 16px",
        background: "rgba(0,0,0,0.5)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        color: "#fff", gap: 12, flexWrap: "wrap",
      }}>
        <div style={{flex: 1, minWidth: 0}}>
          <div style={{fontSize: FS-1, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>
            {current.caption || current.fileName}
          </div>
          <div style={{fontSize: FS-3, color: "#bbb", marginTop: 2, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap"}}>
            <span>{current.uploadedByName || current.uploadedBy || "—"}</span>
            <span>·</span>
            <span>{formatFileSize(current.sizeBytes)}</span>
            <span>·</span>
            <span>{(safeIdx + 1) + " / " + attachments.length}</span>
          </div>
        </div>
        <div style={{display: "flex", gap: 6, flexWrap: "wrap"}}>
          {kind === "image" && (
            <>
              <button onClick={() => zoomBy(1 / 1.25)} style={btnStyle} title="تصغير">🔍−</button>
              <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} style={btnStyle} title="حجم أصلي">{Math.round(zoom * 100)}%</button>
              <button onClick={() => zoomBy(1.25)} style={btnStyle} title="تكبير">🔍+</button>
            </>
          )}
          {onEditCaption && (
            <button onClick={() => onEditCaption(current)} style={btnStyle} title="تعديل العنوان">✏️ تعديل</button>
          )}
          <a
            href={current.downloadURL}
            target="_blank"
            rel="noopener noreferrer"
            download={current.fileName}
            style={{...btnStyle, textDecoration: "none", display: "inline-flex", alignItems: "center"}}
            title="تنزيل"
          >📥 تنزيل</a>
          {onDelete && (
            <button
              onClick={() => { onDelete(current); }}
              style={{...btnStyle, background: "#dc262644", borderColor: "#dc262688"}}
              title="حذف"
            >🗑️ حذف</button>
          )}
          <button onClick={onClose} style={btnStyle} title="إغلاق">✕ إغلاق</button>
        </div>
      </div>

      {/* Content */}
      <div onClick={(e) => e.stopPropagation()} style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16, position: "relative", overflow: "hidden",
      }}>
        {/* Prev / Next */}
        {safeIdx > 0 && (
          <button
            onClick={() => setIdx(safeIdx - 1)}
            style={{...btnStyle, position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: FS+4, padding: "10px 14px"}}
            title="السابق"
          >›</button>
        )}
        {safeIdx < attachments.length - 1 && (
          <button
            onClick={() => setIdx(safeIdx + 1)}
            style={{...btnStyle, position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: FS+4, padding: "10px 14px"}}
            title="التالي"
          >‹</button>
        )}

        {kind === "image" ? (
          <img
            src={current.downloadURL}
            alt={current.fileName}
            onWheel={onWheel}
            onPointerDown={onImgDown}
            onPointerMove={onImgMove}
            onPointerUp={onImgUp}
            onPointerLeave={onImgUp}
            onDoubleClick={() => zoomBy(zoom >= 6 ? 1 / 6 : 2)}
            draggable={false}
            style={{
              maxWidth: "100%", maxHeight: "100%", objectFit: "contain",
              transform: "translate(" + pan.x + "px," + pan.y + "px) scale(" + zoom + ")",
              transition: dragRef.on ? "none" : "transform 0.12s",
              cursor: zoom > 1 ? (dragRef.on ? "grabbing" : "grab") : "zoom-in",
              touchAction: "none",
            }}
          />
        ) : kind === "pdf" ? (
          <iframe
            src={current.downloadURL}
            title={current.fileName}
            style={{width: "100%", height: "100%", border: "none", background: "#fff", borderRadius: 6}}
          />
        ) : (
          <div style={{color: "#fff", fontSize: FS-1, padding: 20, textAlign: "center"}}>
            نوع الملف ({current.mimeType}) غير مدعوم للعرض المباشر.
            <br />
            استخدم زر التنزيل.
          </div>
        )}
      </div>
    </div>
  );
}

export default AttachmentViewer;
