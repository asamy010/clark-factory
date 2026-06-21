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
import { uploadAttachment, linkAttachmentFromUrl, isAllowedMime, MAX_FILE_SIZE, formatFileSize } from "../../utils/universalAttachments.js";
import { ImagePickButton } from "../DocumentImagePicker.jsx";

export function AttachmentUploader({ entityType, entityId, user, onUploaded, disabled, compact, data }){
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

  /* V21.27.78: «من مساحة التخزين» — ربط ملفات موجودة في مكتبة المستندات بدون رفع جديد. */
  const handlePickedFromStorage = async (recs) => {
    const list = Array.from(recs || []);
    if(list.length === 0) return;
    setUploading(true);
    setProgress({ done: 0, total: list.length, pct: 0 });
    const linked = [], failed = [];
    for(let i = 0; i < list.length; i++){
      try { linked.push(await linkAttachmentFromUrl(entityType, entityId, list[i], user, "")); }
      catch(err){ console.error("[AttachmentUploader] link failed:", err); failed.push({ name: list[i].name || "ملف", error: err.message || String(err) }); }
      setProgress({ done: i + 1, total: list.length, pct: 0 });
    }
    setUploading(false);
    setProgress({ done: 0, total: 0, pct: 0 });
    if(linked.length > 0){ onUploaded && onUploaded(linked); showToast("✓ تم ربط " + linked.length + " ملف من مساحة التخزين"); }
    if(failed.length > 0){ await tell("فشل ربط بعض الملفات", failed.map(f => "• " + f.name + ": " + f.error).join("\n"), { type: "error" }); }
  };

  const wrapStyle = compact
    ? { display: "inline-flex", alignItems: "center", gap: 6 }
    : { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };

  /* ستايل زر «ملف» (يُستخدم كـ trigger للبوب اب «اختر المصدر» لو data متاحة) */
  const fileBtnStyle = { display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 8, background: "#6366f112", color: "#6366f1", border: "1px solid #6366f130", fontWeight: 700, fontSize: FS - 1, fontFamily: "inherit", cursor: uploading ? "default" : "pointer", opacity: uploading ? 0.6 : 1, whiteSpace: "nowrap" };

  return (
    <div style={wrapStyle}>
      <Btn small primary onClick={() => cameraInputRef.current && cameraInputRef.current.click()} disabled={uploading} title="التقاط صورة بالكاميرا">
        📷 كاميرا
      </Btn>
      {/* V21.27.78: لو data متاحة → بوب اب «اختر المصدر» (كمبيوتر/مساحة التخزين)؛ غير كده → ملف مباشر */}
      {data ? (
        <ImagePickButton
          data={data} multiple imagesOnly={false} disabled={uploading}
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onFiles={(files) => handleFiles(files)}
          onPickMany={(recs) => handlePickedFromStorage(recs)}
          title="إضافة ملف — من الكمبيوتر أو مساحة التخزين">
          <span style={fileBtnStyle}>📎 إضافة مرفق</span>
        </ImagePickButton>
      ) : (
        <Btn small onClick={() => fileInputRef.current && fileInputRef.current.click()} disabled={uploading} title="اختيار ملف من الجهاز" style={{background:"#6366f112",color:"#6366f1",border:"1px solid #6366f130"}}>
          📁 ملف
        </Btn>
      )}

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
