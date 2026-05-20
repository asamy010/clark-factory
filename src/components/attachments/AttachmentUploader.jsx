/* ═══════════════════════════════════════════════════════════════
   CLARK V21.9.123 — AttachmentUploader
   ───────────────────────────────────────────────────────────────
   Camera-capture + multi-file picker. Calls uploadAttachment per
   file, surfaces per-file progress, returns the uploaded list to
   the parent via onUploaded.

   Two buttons:
     📷 كاميرا  — opens device camera (capture="environment" → rear)
     📁 ملف     — opens standard file picker (multi-select, image+PDF)
   ═══════════════════════════════════════════════════════════════ */

import { useState, useRef } from "react";
import { T } from "../../theme.js";
import { FS } from "../../constants/index.js";
import { Btn } from "../ui.jsx";
import { tell, showToast } from "../../utils/popups.js";
import { uploadAttachment, isAllowedMime, MAX_FILE_SIZE, formatFileSize } from "../../utils/universalAttachments.js";

export function AttachmentUploader({ entityType, entityId, user, onUploaded, disabled, compact }){
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, pct: 0 });
  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);

  if(disabled) return null;

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if(files.length === 0) return;

    /* Pre-flight validation — reject the whole batch with one toast */
    for(const f of files){
      if(!isAllowedMime(f.type)){
        await tell("نوع غير مدعوم", "فقط الصور (jpg/png/webp) أو PDF — الملف \"" + f.name + "\" نوعه " + (f.type || "غير معروف"), { type: "warning" });
        return;
      }
      if(f.size > MAX_FILE_SIZE){
        await tell("الملف كبير جداً", "\"" + f.name + "\" حجمه " + formatFileSize(f.size) + " — الحد الأقصى 10 ميجا (بعد الضغط)", { type: "warning" });
        return;
      }
    }

    setUploading(true);
    setProgress({ done: 0, total: files.length, pct: 0 });

    const uploaded = [];
    const failed = [];

    for(let i = 0; i < files.length; i++){
      try {
        const att = await uploadAttachment(entityType, entityId, files[i], user, "", (pct) => {
          setProgress({ done: i, total: files.length, pct });
        });
        uploaded.push(att);
      } catch(err){
        console.error("[AttachmentUploader] upload failed:", err);
        failed.push({ name: files[i].name, error: err.message || String(err) });
      }
      setProgress({ done: i + 1, total: files.length, pct: 0 });
    }

    setUploading(false);
    setProgress({ done: 0, total: 0, pct: 0 });

    if(uploaded.length > 0){
      onUploaded && onUploaded(uploaded);
      showToast("✓ تم رفع " + uploaded.length + " ملف" + (failed.length > 0 ? " (فشل " + failed.length + ")" : ""));
    }
    if(failed.length > 0){
      await tell("فشل رفع بعض الملفات",
        failed.map(f => "• " + f.name + ": " + f.error).join("\n"),
        { type: "error" }
      );
    }
  };

  const wrapStyle = compact
    ? { display: "inline-flex", alignItems: "center", gap: 6 }
    : { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };

  return (
    <div style={wrapStyle}>
      <Btn small primary onClick={() => cameraInputRef.current && cameraInputRef.current.click()} disabled={uploading} title="التقاط صورة بالكاميرا">
        📷 كاميرا
      </Btn>
      <Btn small onClick={() => fileInputRef.current && fileInputRef.current.click()} disabled={uploading} title="اختيار ملف من الجهاز" style={{background:"#6366f112",color:"#6366f1",border:"1px solid #6366f130"}}>
        📁 ملف
      </Btn>

      {uploading && (
        <span style={{fontSize: FS-2, color: T.textSec, display:"inline-flex", alignItems:"center", gap: 6}}>
          ⏳ {progress.done}/{progress.total} {progress.pct > 0 && "(" + progress.pct + "%)"}
        </span>
      )}

      {/* hidden inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{display:"none"}}
        onChange={(e) => handleFiles(e.target.files)}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        multiple
        style={{display:"none"}}
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
      />
    </div>
  );
}

export default AttachmentUploader;
