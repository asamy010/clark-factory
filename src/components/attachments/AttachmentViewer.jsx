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
  const safeIdx = Math.max(0, Math.min(idx, (attachments || []).length - 1));
  const current = (attachments || [])[safeIdx];

  useEffect(() => {
    function onKey(e){
      if(e.key === "Escape") onClose && onClose();
      else if(e.key === "ArrowLeft") setIdx(i => Math.min(i + 1, (attachments || []).length - 1));  /* RTL: left = next */
      else if(e.key === "ArrowRight") setIdx(i => Math.max(i - 1, 0));
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
            style={{maxWidth: "100%", maxHeight: "100%", objectFit: "contain"}}
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
