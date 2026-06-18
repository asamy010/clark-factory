/* ═══════════════════════════════════════════════════════════════
   CLARK V21.9.123 — AttachmentList
   ───────────────────────────────────────────────────────────────
   Grid display of attachments for a specific entity. Includes:
     - "Header" row with title + uploader buttons
     - Thumbnail grid (image previews + PDF icons)
     - Click thumbnail → opens AttachmentViewer
     - Loading + empty states

   Self-contained: handles list/upload/delete/edit-caption flow internally.

   Props:
     entityType   : one of ATTACHMENT_ENTITY_TYPES
     entityId     : string ID of the entity
     user         : current user object { uid, email, displayName }
     canEdit      : boolean — gates uploader + delete + caption edit
     label        : header title (default "المرفقات")
     compact      : tighter spacing for embedded use
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from "react";
import { T } from "../../theme.js";
import { FS } from "../../constants/index.js";
import { ask, askInput, tell, showToast } from "../../utils/popups.js";
import {
  listAttachments,
  softDeleteAttachment,
  updateAttachmentCaption,
  uploadAttachment,
  getFileMimeKind,
  formatFileSize,
} from "../../utils/universalAttachments.js";
import { AttachmentUploader } from "./AttachmentUploader.jsx";
import { AttachmentViewer } from "./AttachmentViewer.jsx";
import { DocScannerModal } from "./DocScannerModal.jsx";

function fmtDate(ts){
  if(!ts) return "—";
  try{
    const d = new Date(ts);
    return d.toLocaleDateString("ar-EG", { day: "numeric", month: "short" });
  }catch(_){ return "—"; }
}

export function AttachmentList({ entityType, entityId, user, canEdit, label, compact }){
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewerIdx, setViewerIdx] = useState(null);  /* null = closed */
  const [scanning, setScanning] = useState(null);    /* V21.27.61: المرفق اللي بيتمسح ضوئياً */

  const reload = useCallback(async () => {
    if(!entityType || !entityId){
      setAttachments([]); setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const items = await listAttachments(entityType, entityId);
      setAttachments(items);
    } catch(e){
      console.error("[AttachmentList] load failed:", e);
      setError(e && e.message ? e.message : "فشل تحميل المرفقات");
      setAttachments([]);
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    let cancelled = false;
    listAttachments(entityType, entityId)
      .then(items => { if(!cancelled){ setAttachments(items); setLoading(false); } })
      .catch(e => {
        console.error("[AttachmentList] load failed:", e);
        if(!cancelled){ setError(e && e.message ? e.message : "فشل تحميل المرفقات"); setAttachments([]); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, [entityType, entityId]);

  const handleUploaded = (newOnes) => {
    /* Prepend new attachments — server orders desc by uploadedAt so they're newest. */
    setAttachments(prev => [...newOnes, ...prev]);
  };

  const handleDelete = async (att) => {
    const yes = await ask("حذف المرفق", "هل أنت متأكد من حذف \"" + (att.caption || att.fileName) + "\"؟\n\nالملف هـ يتـ marked كـ deleted (soft delete).", { confirmText: "حذف", danger: true });
    if(!yes) return;
    try {
      await softDeleteAttachment(att.id, user);
      setAttachments(prev => prev.filter(a => a.id !== att.id));
      setViewerIdx(null);
      showToast("✓ تم الحذف");
    } catch(e){
      console.error("[AttachmentList] delete failed:", e);
      await tell("فشل الحذف", e && e.message ? e.message : "حاول مرة تانية", { type: "error" });
    }
  };

  /* V21.27.61: حفظ نتيجة السكانر كمرفق جديد (الأصل بيفضل). */
  const handleScanSave = async (blob) => {
    const baseName = (scanning && (scanning.caption || scanning.fileName) || "scan").replace(/\.[^.]+$/, "");
    const file = new File([blob], baseName + " — ممسوح.jpg", { type: "image/jpeg" });
    try {
      const att = await uploadAttachment(entityType, entityId, file, user, "ممسوح ضوئياً");
      setAttachments(prev => [att, ...prev]);
      setScanning(null);
      setViewerIdx(null);
      showToast("✓ تم حفظ النسخة الممسوحة كمرفق جديد");
    } catch(e){
      console.error("[AttachmentList] scan save failed:", e);
      await tell("فشل الحفظ", e && e.message ? e.message : "حاول مرة تانية", { type: "error" });
    }
  };

  const handleEditCaption = async (att) => {
    const next = await askInput("تعديل العنوان", { defaultValue: att.caption || "", placeholder: "عنوان وصفي للمرفق" });
    if(next === null) return;
    try {
      await updateAttachmentCaption(att.id, next);
      setAttachments(prev => prev.map(a => a.id === att.id ? { ...a, caption: String(next).trim() } : a));
      showToast("✓ تم التعديل");
    } catch(e){
      console.error("[AttachmentList] caption update failed:", e);
      await tell("فشل التعديل", e && e.message ? e.message : "حاول مرة تانية", { type: "error" });
    }
  };

  /* If entityId is not yet defined (e.g., new entity not saved), show a hint. */
  if(!entityId){
    return (
      <div style={{padding: compact ? "8px 10px" : "10px 12px", background: T.bg, borderRadius: 8, border: "1px dashed " + T.brd, fontSize: FS-2, color: T.textMut, lineHeight: 1.6}}>
        💡 احفظ السجل أولاً عشان تقدر ترفع مرفقات.
      </div>
    );
  }

  return (
    <div style={{
      padding: compact ? "10px 12px" : "12px 14px",
      background: T.bg,
      borderRadius: 10,
      border: "1px solid " + T.brd,
    }}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 10, gap: 8, flexWrap: "wrap"}}>
        <div style={{fontSize: FS, fontWeight: 700, color: T.text, display: "inline-flex", alignItems: "center", gap: 6}}>
          📎 {label || "المرفقات"} {attachments.length > 0 && <span style={{color: T.textMut, fontWeight: 500}}>({attachments.length})</span>}
        </div>
        {canEdit && (
          <AttachmentUploader
            entityType={entityType}
            entityId={String(entityId)}
            user={user}
            onUploaded={handleUploaded}
            compact={compact}
          />
        )}
      </div>

      {error && (
        <div style={{padding: "8px 10px", background: T.err + "10", color: T.err, borderRadius: 8, fontSize: FS-2, marginBottom: 8}}>
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <div style={{padding: 20, textAlign: "center", color: T.textMut, fontSize: FS-2}}>
          ⏳ جاري التحميل...
        </div>
      ) : attachments.length === 0 ? (
        <div style={{padding: 20, textAlign: "center", color: T.textMut, fontSize: FS-2}}>
          لا توجد مرفقات بعد
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(" + (compact ? "100px" : "130px") + ", 1fr))",
          gap: 8,
        }}>
          {attachments.map((att, idx) => {
            const kind = getFileMimeKind(att.mimeType);
            return (
              <div
                key={att.id}
                onClick={() => setViewerIdx(idx)}
                style={{
                  background: T.cardSolid,
                  border: "1px solid " + T.brd,
                  borderRadius: 8,
                  overflow: "hidden",
                  cursor: "pointer",
                  transition: "transform 0.12s, box-shadow 0.12s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}
              >
                <div style={{width: "100%", height: 90, background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden"}}>
                  {kind === "image" ? (
                    <img
                      src={att.downloadURL}
                      alt={att.fileName}
                      loading="lazy"
                      style={{width: "100%", height: "100%", objectFit: "cover", display: "block"}}
                    />
                  ) : kind === "pdf" ? (
                    <div style={{fontSize: 36}}>📄</div>
                  ) : (
                    <div style={{fontSize: 36}}>📎</div>
                  )}
                </div>
                <div style={{padding: "6px 8px", borderTop: "1px solid " + T.brd, fontSize: FS-3}}>
                  <div title={att.caption || att.fileName} style={{color: T.text, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>
                    {att.caption || att.fileName}
                  </div>
                  <div style={{display: "flex", justifyContent: "space-between", color: T.textMut, marginTop: 2, fontSize: FS-3}}>
                    <span>{formatFileSize(att.sizeBytes)}</span>
                    <span>{fmtDate(att.uploadedAt)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {viewerIdx !== null && (
        <AttachmentViewer
          attachments={attachments}
          startIndex={viewerIdx}
          onClose={() => setViewerIdx(null)}
          onDelete={canEdit ? handleDelete : null}
          onEditCaption={canEdit ? handleEditCaption : null}
          onScan={canEdit ? (att) => setScanning(att) : null}
        />
      )}

      {/* V21.27.61: سكانر/معالجة الصورة → حفظ نسخة محسّنة كمرفق جديد */}
      {scanning && (
        <DocScannerModal
          src={scanning.downloadURL}
          fileName={scanning.fileName}
          onClose={() => setScanning(null)}
          onSave={handleScanSave}
        />
      )}
    </div>
  );
}

export default AttachmentList;
