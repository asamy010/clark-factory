/* ═══════════════════════════════════════════════════════════════
   CLARK — Template Images Utility (V19.35)

   Handles uploads of campaign-template images to Firebase Storage.
   The Firestore document factory/config has a hard 1MB limit, and
   embedding base64 images (V19.33-V19.34 design) saturated it. This
   utility moves images to Firebase Storage and keeps Firestore tiny.

   Storage layout:
     templates/{templateId}/{ts}_{name}.jpg

   Firestore record (in template.images[]):
     {
       storagePath,    // for delete cleanup
       url,            // signed download URL (long-lived token)
       mime, name, size
     }

   Image at 1280px JPEG q=82 ≈ 200KB binary. URL string is ~200 bytes.
   1000× compression vs base64-in-doc.
   ═══════════════════════════════════════════════════════════════ */

import { storage } from "../firebase.js";
import {
  ref as storageRef,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";

/* Hard-cap any single image at 5MB pre-upload (already compressed
   client-side, so this is just a safety net). */
export const MAX_TEMPLATE_IMAGE_SIZE = 5 * 1024 * 1024;

/* Compress an image in a Canvas at 1280px max + JPEG q=0.82, return Blob.
   This is the V19.34 algorithm, lifted out of CampaignsPg into a shared
   utility so the editor and the migration path use the exact same pipeline. */
export function compressImageToBlob(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1280;
        let { width, height } = img;
        if(width > MAX || height > MAX){
          const ratio = Math.min(MAX/width, MAX/height);
          width = Math.round(width*ratio);
          height = Math.round(height*ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          blob => blob ? resolve({ blob, width, height }) : reject(new Error("compression failed")),
          "image/jpeg", 0.82
        );
      };
      img.onerror = () => reject(new Error("invalid image"));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}

/* Convert a base64 string (no data: prefix) into a Blob. Used by
   migration to lift legacy V19.33-V19.34 templates into Storage. */
export function base64ToBlob(b64, mime){
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime || "image/jpeg" });
}

/* Sanitize a filename for use as a Storage object name. */
function safeName(name){
  return (name || "img.jpg").replace(/[^\w.\-]+/g, "_").substring(0, 80);
}

/* Build the Storage path for a template image. */
function buildPath(templateId, name){
  const ts = Date.now();
  const rnd = Math.random().toString(36).slice(2, 8);
  const tid = (templateId || "tpl_unknown").replace(/[^\w]/g, "_");
  return `templates/${tid}/${ts}_${rnd}_${safeName(name)}`;
}

/* Upload a Blob to Storage and return {storagePath, url, mime, name, size}.
   The download URL has an embedded long-lived token, so it can be fetched
   from anywhere (including the bridge VPS) without auth. */
export async function uploadTemplateImageBlob(templateId, blob, displayName){
  if(!blob) throw new Error("blob is required");
  if(blob.size > MAX_TEMPLATE_IMAGE_SIZE) throw new Error("image too large");
  const finalName = safeName(displayName).replace(/\.\w+$/, "") + ".jpg";
  const path = buildPath(templateId, finalName);
  const ref = storageRef(storage, path);
  const snap = await uploadBytes(ref, blob, {
    contentType: blob.type || "image/jpeg",
    customMetadata: { templateId: templateId || "" },
  });
  const url = await getDownloadURL(snap.ref);
  return {
    storagePath: path,
    url,
    mime: blob.type || "image/jpeg",
    name: finalName,
    size: blob.size,
  };
}

/* Compress + upload a File from the user's file input. */
export async function uploadTemplateImageFile(templateId, file){
  const { blob } = await compressImageToBlob(file);
  return uploadTemplateImageBlob(templateId, blob, file.name);
}

/* Delete a single image from Storage. 404 is silent (idempotent). */
export async function deleteTemplateImage(storagePath){
  if(!storagePath) return;
  try {
    await deleteObject(storageRef(storage, storagePath));
  } catch(e){
    if(e?.code !== "storage/object-not-found"){
      console.error("[templateImages] delete failed:", e);
      throw e;
    }
  }
}

/* Detect whether a template object holds any legacy base64 image data.
   Templates with only {url, storagePath} are considered already-migrated. */
export function hasLegacyBase64(tpl){
  if(!tpl || !Array.isArray(tpl.images)) return false;
  return tpl.images.some(img => img && img.base64);
}

/* Migrate a single template's images: any image with `base64` is uploaded
   to Storage and replaced with `{storagePath, url, mime, name, size}`.
   Images that already have `url` are kept as-is. Returns a fresh array.
   Throws if any upload fails — caller should retry the whole template. */
export async function migrateTemplateImages(template){
  if(!template || !Array.isArray(template.images)) return template?.images || [];
  const out = [];
  for(const img of template.images){
    if(!img) continue;
    if(img.url && img.storagePath){
      out.push(img);
      continue;
    }
    if(!img.base64){
      /* Malformed entry — drop it rather than fail the whole migration */
      continue;
    }
    const blob = base64ToBlob(img.base64, img.mime || "image/jpeg");
    const meta = await uploadTemplateImageBlob(
      template.id,
      blob,
      img.name || "migrated.jpg",
    );
    out.push(meta);
  }
  return out;
}

/* Estimate how many KB of base64 a template still has embedded.
   Used by the UI banner to show the user how much they'll free up. */
export function legacyBase64Size(tpl){
  if(!tpl || !Array.isArray(tpl.images)) return 0;
  return tpl.images.reduce((sum, img) => sum + (img?.base64?.length || 0), 0);
}

/* ═══════════════════════════════════════════════════════════════
   V19.38: NON-IMAGE ATTACHMENTS (PDFs, Word, Excel, video, audio, ZIPs)

   Attachments are a separate concept from images even though both end
   up in Firebase Storage. The differences worth knowing:
     - No compression — files go up as-is.
     - Per-mime size limits enforced (WhatsApp's caps).
     - Upload uses uploadBytesResumable so the UI can show a progress bar
       (a 50MB PDF on slow internet is a real wait).
     - Stored on the template in `template.attachments[]`, separate from
       `template.images[]` so the editor can render each kind correctly
       (image previews vs file-type icons).

   The Bridge's send pipeline doesn't care about the distinction — it
   receives a unified `media[]` array with {url, mime, name} entries and
   dispatches each via MessageMedia. CLARK is what merges images +
   attachments into that array at send time.
   ═══════════════════════════════════════════════════════════════ */

/* WhatsApp's per-type size ceilings. We enforce client-side so we fail
   fast with a clear message instead of letting WhatsApp reject the send. */
export const WA_MAX_BY_KIND = {
  image:    16 * 1024 * 1024,
  video:    16 * 1024 * 1024,
  audio:    16 * 1024 * 1024,
  document: 100 * 1024 * 1024,
};

/* Bucket a mime type into one of the four WhatsApp media kinds. */
export function classifyMime(mime){
  const m = (mime || "").toLowerCase();
  if(m.startsWith("image/")) return "image";
  if(m.startsWith("video/")) return "video";
  if(m.startsWith("audio/")) return "audio";
  return "document";
}

/* Visual icon for each file type. Used in the editor + send screen. */
export function getFileIcon(mime){
  const m = (mime || "").toLowerCase();
  if(m === "application/pdf") return "📄";
  if(m.includes("spreadsheetml") || m.includes("ms-excel") || m.endsWith("/csv")) return "📊";
  if(m.includes("wordprocessingml") || m === "application/msword") return "📝";
  if(m.includes("presentationml") || m.includes("ms-powerpoint")) return "📑";
  if(m === "application/zip" || m === "application/x-rar-compressed" || m === "application/x-7z-compressed") return "🗜️";
  if(m.startsWith("video/")) return "🎬";
  if(m.startsWith("audio/")) return "🎵";
  if(m.startsWith("image/")) return "🖼";
  if(m.startsWith("text/")) return "📃";
  return "📎";
}

/* Format bytes as KB / MB for display. */
export function formatFileSize(bytes){
  if(!bytes) return "0 B";
  if(bytes < 1024) return bytes + " B";
  if(bytes < 1024*1024) return Math.round(bytes/1024) + " KB";
  return (bytes/(1024*1024)).toFixed(1) + " MB";
}

/* Storage path for an attachment. Different prefix from images so cleanup
   logic (and human inspection in the Firebase console) can tell them apart. */
function buildAttachmentPath(templateId, name){
  const ts = Date.now();
  const rnd = Math.random().toString(36).slice(2, 8);
  const tid = (templateId || "tpl_unknown").replace(/[^\w]/g, "_");
  /* Sanitize filename but PRESERVE the extension — WhatsApp uses it in the
     document name shown to the recipient, so "report.pdf" stays "report.pdf". */
  const cleaned = (name || "file").replace(/[^\w.\-\u0600-\u06FF]+/g, "_").substring(0, 80);
  return `templates/${tid}/attachments/${ts}_${rnd}_${cleaned}`;
}

/* Upload a non-image File. onProgress(percent) is invoked during upload. */
export async function uploadTemplateAttachmentFile(templateId, file, onProgress){
  if(!file) throw new Error("file is required");
  const kind = classifyMime(file.type);
  const cap = WA_MAX_BY_KIND[kind];
  if(file.size > cap){
    throw new Error(
      `الملف أكبر من الحد المسموح في WhatsApp (${formatFileSize(cap)}). ` +
      `حجم الملف: ${formatFileSize(file.size)}`
    );
  }
  const path = buildAttachmentPath(templateId, file.name);
  const ref = storageRef(storage, path);
  const task = uploadBytesResumable(ref, file, {
    contentType: file.type || "application/octet-stream",
    customMetadata: { templateId: templateId || "", originalName: file.name },
  });
  return new Promise((resolve, reject) => {
    task.on(
      "state_changed",
      snap => {
        if(onProgress){
          const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
          onProgress(pct);
        }
      },
      err => reject(err),
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          resolve({
            storagePath: path,
            url,
            mime: file.type || "application/octet-stream",
            name: file.name,
            size: file.size,
            kind,
          });
        } catch(e){ reject(e); }
      }
    );
  });
}

/* Alias for symmetry — Storage delete is identical regardless of file kind. */
export const deleteTemplateAttachment = deleteTemplateImage;
