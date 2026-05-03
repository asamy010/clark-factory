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
