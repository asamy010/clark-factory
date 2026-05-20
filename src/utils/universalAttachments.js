/* ═══════════════════════════════════════════════════════════════
   CLARK V21.9.123 — Universal Attachments (Foundation)
   ───────────────────────────────────────────────────────────────
   Universal document/image attachment system. Any entity in CLARK
   can have files attached: customers, suppliers, employees, checks,
   invoices, treasury entries, workshops, etc.

   Architecture:
     - Files in Firebase Storage at  attachments/{entityType}/{entityId}/{ts}_{rand}.{ext}
     - Metadata in Firestore collection  attachments/{attachmentId}
     - Each metadata doc carries entityType + entityId for lookup
     - Soft delete via `deleted: true` (Storage file kept 30 days)

   Lessons applied:
     - V21.9.77: NO customMetadata on uploadBytes. The multipart
       protocol it triggers breaks storage rules' isAllowedMime()
       contentType check. orderId/entityType/entityId live in the
       path itself; uploadedBy is in Firestore metadata.
     - V21.9.100: SW no longer intercepts auth'd Storage GETs.
     - Compression mirror to format used in src/utils/attachments.js
       (the older order-specific module): 1920px max, JPEG 70%.
       This module is the universal replacement; the older one is
       not actively used (zero callers) and stays as legacy reference.
   ═══════════════════════════════════════════════════════════════ */

import { storage, db } from "../firebase.js";
import {
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

/* ── Constants ─────────────────────────────────────────────────── */

export const MAX_FILE_SIZE = 10 * 1024 * 1024;   /* 10 MB hard limit */
export const ALLOWED_MIME_PREFIXES = ["image/", "application/pdf"];

/* Permitted entity types — match the storage rule's path pattern.
   Adding a new entity type here implies the matching match clause
   in storage.rules already allows it under attachments/{allPaths=**}. */
export const ATTACHMENT_ENTITY_TYPES = [
  "checks",
  "salesInvoices", "creditNotes",
  "purchaseInvoices", "debitNotes",
  "treasury",
  "customers", "suppliers", "workshops", "employees",
  "orders", "contacts",
];

/* ── File helpers ──────────────────────────────────────────────── */

export function getFileMimeKind(mimeType){
  if(!mimeType) return "other";
  if(mimeType.startsWith("image/")) return "image";
  if(mimeType === "application/pdf") return "pdf";
  return "other";
}

export function getFileIcon(mimeType){
  const kind = getFileMimeKind(mimeType);
  if(kind === "image") return "🖼";
  if(kind === "pdf") return "📄";
  return "📎";
}

export function formatFileSize(bytes){
  if(!bytes) return "0 B";
  if(bytes < 1024) return bytes + " B";
  if(bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export function isAllowedMime(mimeType){
  if(!mimeType) return false;
  return ALLOWED_MIME_PREFIXES.some(p => mimeType.startsWith(p) || mimeType === p);
}

/* ── Image compression ────────────────────────────────────────────
   Resize to 1920px max (longest edge), re-encode JPEG @ 70% quality.
   PDFs pass through untouched. Returns the original file on any
   error so the upload still happens. */
export function compressImage(file){
  return new Promise((resolve) => {
    if(!file || !file.type || !file.type.startsWith("image/")){ resolve(file); return; }
    if(file.size < 500 * 1024){ resolve(file); return; }          /* small enough */
    if(file.type === "image/gif"){ resolve(file); return; }       /* preserve animation */

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 1920;
        let w = img.width, h = img.height;
        if(w > MAX_DIM || h > MAX_DIM){
          if(w > h){ h = Math.round(h * MAX_DIM / w); w = MAX_DIM; }
          else      { w = Math.round(w * MAX_DIM / h); h = MAX_DIM; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => {
          if(!blob){ resolve(file); return; }
          /* Preserve original name + reflect new extension */
          const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
          resolve(new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() }));
        }, "image/jpeg", 0.70);
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

/* ── Sanitize a file name for the storage path segment ──────────── */
function sanitizeName(name){
  return String(name || "file")
    .replace(/[^\w؀-ۿ.\- ]+/g, "_")
    .substring(0, 80);
}

/* ── Build storage path ──────────────────────────────────────────
   Pattern: attachments/{entityType}/{entityId}/{timestamp}_{random}.{ext}
   Mirrors the storage.rules `attachments/{allPaths=**}` block. */
function buildStoragePath(entityType, entityId, fileName){
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const safe = sanitizeName(fileName);
  /* V21.9.129: defense-in-depth — strip path-control chars from entityId before
     concatenation. Current callers pass gid()/Shopify-id values (alphanumeric),
     so this is NOT a fix for a known bug. Guards against future regressions if
     any caller ever passes a user-controlled string with "/" or "..". */
  const safeId = String(entityId == null ? "" : entityId).replace(/[^a-zA-Z0-9_-]/g, "_");
  return "attachments/" + entityType + "/" + safeId + "/" + ts + "_" + rand + "_" + safe;
}

/* ── Upload ──────────────────────────────────────────────────────
   Atomic flow:
   1. Compress (if image)
   2. Upload to Storage with progress
   3. Create Firestore metadata doc
   4. On Firestore failure → rollback Storage upload (best-effort)

   Returns the saved metadata object the caller can use immediately
   (no re-fetch needed). */
export async function uploadAttachment(entityType, entityId, file, user, caption, onProgress){
  if(!entityType || !ATTACHMENT_ENTITY_TYPES.includes(entityType)){
    throw new Error("UNIVERSAL_ATTACH_BAD_ENTITY_TYPE");
  }
  if(!entityId) throw new Error("UNIVERSAL_ATTACH_NO_ENTITY_ID");
  if(!file) throw new Error("UNIVERSAL_ATTACH_NO_FILE");
  if(!user || (!user.uid && !user.email)) throw new Error("UNIVERSAL_ATTACH_NO_USER");

  if(!isAllowedMime(file.type)){
    throw new Error("UNIVERSAL_ATTACH_BAD_MIME:" + (file.type || "unknown"));
  }
  if(file.size > MAX_FILE_SIZE){
    throw new Error("UNIVERSAL_ATTACH_TOO_LARGE:" + file.size);
  }

  const originalSize = file.size;
  const finalFile = await compressImage(file);

  /* Capture image dimensions for the metadata (optional — falls back to null). */
  let width = null, height = null;
  if(finalFile.type.startsWith("image/")){
    try {
      const dims = await new Promise((resolve) => {
        const img = new Image();
        img.onload  = () => resolve({ w: img.width, h: img.height });
        img.onerror = () => resolve({ w: null, h: null });
        img.src = URL.createObjectURL(finalFile);
      });
      width = dims.w;
      height = dims.h;
    } catch(_){ /* non-fatal */ }
  }

  const path = buildStoragePath(entityType, entityId, file.name);
  const ref = storageRef(storage, path);

  /* V21.9.77 LESSON: NO customMetadata — multipart protocol breaks isAllowedMime() */
  const task = uploadBytesResumable(ref, finalFile, {
    contentType: finalFile.type || "application/octet-stream",
  });

  /* Wait for upload + get download URL */
  let downloadURL;
  try {
    await new Promise((resolve, reject) => {
      task.on("state_changed",
        (snap) => {
          if(onProgress){
            const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
            onProgress(pct);
          }
        },
        (err) => reject(err),
        () => resolve()
      );
    });
    downloadURL = await getDownloadURL(task.snapshot.ref);
  } catch(storageErr){
    console.error("[universalAttachments] storage upload failed:", storageErr);
    throw new Error("UNIVERSAL_ATTACH_STORAGE_FAILED:" + (storageErr.code || storageErr.message || "unknown"));
  }

  /* Write Firestore metadata. On failure, best-effort rollback the storage file. */
  const uid = user.uid || user.email || "";
  const uname = user.name || user.displayName || user.email || "";
  const now = Date.now();
  try {
    const docRef = await addDoc(collection(db, "attachments"), {
      entityType,
      entityId: String(entityId),
      fileName: file.name,
      storagePath: path,
      downloadURL,
      mimeType: finalFile.type || "application/octet-stream",
      sizeBytes: finalFile.size,
      originalSizeBytes: originalSize,
      width,
      height,
      uploadedBy: uid,
      uploadedByName: uname,
      uploadedAt: now,
      uploadedAtServer: serverTimestamp(),
      caption: String(caption || "").trim(),
      tags: [],
      deleted: false,
      deletedAt: null,
      deletedBy: null,
    });

    return {
      id: docRef.id,
      entityType,
      entityId: String(entityId),
      fileName: file.name,
      storagePath: path,
      downloadURL,
      mimeType: finalFile.type,
      sizeBytes: finalFile.size,
      originalSizeBytes: originalSize,
      width,
      height,
      uploadedBy: uid,
      uploadedByName: uname,
      uploadedAt: now,
      caption: String(caption || "").trim(),
      tags: [],
      deleted: false,
    };
  } catch(fsErr){
    console.error("[universalAttachments] Firestore write failed, rolling back:", fsErr);
    try { await deleteObject(ref); } catch(rbErr){
      console.warn("[universalAttachments] rollback failed:", rbErr);
    }
    throw new Error("UNIVERSAL_ATTACH_METADATA_FAILED:" + (fsErr.code || fsErr.message || "unknown"));
  }
}

/* ── List attachments for an entity ──────────────────────────────
   V21.9.123 design choice: query by `entityId` SINGLE field only —
   Firestore auto-indexes single-field equality queries, so no
   composite index setup needed. Per-entity volume is small (~25
   attachments max in realistic usage), so client-side filtering
   for entityType + deleted + sorting is fine.

   If we later cross the 100+ attachments-per-entity threshold, we
   can introduce a composite index via firestore.indexes.json. */
export async function listAttachments(entityType, entityId){
  if(!entityType || !entityId) return [];
  const q = query(
    collection(db, "attachments"),
    where("entityId", "==", String(entityId))
  );
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(a => a && a.entityType === entityType && !a.deleted)
    .sort((a, b) => (Number(b.uploadedAt) || 0) - (Number(a.uploadedAt) || 0));
}

/* ── Soft delete ─────────────────────────────────────────────────
   Mark as deleted in Firestore. The Storage file is intentionally kept
   for 30 days for recovery. A separate cleanup cron (future) will hard-
   purge old soft-deleted files. */
export async function softDeleteAttachment(attachmentId, user){
  if(!attachmentId) throw new Error("UNIVERSAL_ATTACH_NO_ID");
  const uid = (user && (user.uid || user.email)) || "";
  await updateDoc(doc(db, "attachments", attachmentId), {
    deleted: true,
    deletedAt: Date.now(),
    deletedBy: uid,
  });
}

/* ── Update caption only ─────────────────────────────────────────
   Caption is the only user-editable text field on an attachment.
   Other fields (storagePath, downloadURL, sizeBytes, mimeType) are
   immutable — see Firestore rules. */
export async function updateAttachmentCaption(attachmentId, caption){
  if(!attachmentId) throw new Error("UNIVERSAL_ATTACH_NO_ID");
  await updateDoc(doc(db, "attachments", attachmentId), {
    caption: String(caption || "").trim(),
  });
}
