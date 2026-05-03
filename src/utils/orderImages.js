/* ═══════════════════════════════════════════════════════════════
   CLARK — Order Images Utility (V19.36)

   Handles uploads of per-order model images to Firebase Storage.

   Background: pre-V19.36, model images were compressed to 250px
   @ JPEG q=0.4 and stored as base64 inside the order document. That
   produced visibly pixelated images when shared via WhatsApp (which
   renders at 800-1200px). V19.36 lifts the cap — we now compress to
   1280px @ q=0.85 and put the binary in Storage. Each order doc
   shrinks from ~5-8KB to ~1-2KB, and shared images look sharp.

   Storage layout:
     orders/{orderId}/model_{ts}.jpg

   Order record fields (V19.36):
     image:            "https://...storage URL..."   ← unchanged field name, was base64
     imageStoragePath: "orders/{id}/model_xxx.jpg"   ← new, used for delete cleanup

   Compatibility: legacy orders keep `image` as a base64 data string
   (or bare base64). Display code (<img src={...}>) and Web Share
   (`fetch(image).blob()`) both handle URL and data: forms transparently,
   so reads need no migration. Migration is opt-in via the Settings UI.
   ═══════════════════════════════════════════════════════════════ */

import { storage } from "../firebase.js";
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";

export const MAX_ORDER_IMAGE_SIZE = 10 * 1024 * 1024;

/* Compress an image with the high-quality settings model display deserves.
   1280px max dimension, JPEG q=0.85 — the same pipeline templateImages.js
   uses, intentionally consistent so output looks the same wherever it ends up. */
export function compressOrderImageToBlob(file){
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
          blob => blob ? resolve(blob) : reject(new Error("compression failed")),
          "image/jpeg", 0.85
        );
      };
      img.onerror = () => reject(new Error("invalid image"));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}

/* Convert a base64 string (with or without data: prefix) into a Blob. */
export function base64ToBlob(b64Input, mime){
  if(!b64Input) throw new Error("empty base64");
  /* Tolerate both "data:image/jpeg;base64,...." and bare "...." inputs */
  const b64 = b64Input.includes("base64,") ? b64Input.split("base64,")[1] : b64Input;
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime || "image/jpeg" });
}

function buildPath(orderId){
  const ts = Date.now();
  const rnd = Math.random().toString(36).slice(2, 8);
  const oid = (orderId || "tmp_" + Math.random().toString(36).slice(2, 10)).replace(/[^\w]/g, "_");
  return `orders/${oid}/model_${ts}_${rnd}.jpg`;
}

/* Upload a Blob and return {storagePath, url}. */
export async function uploadOrderImageBlob(orderId, blob){
  if(!blob) throw new Error("blob is required");
  if(blob.size > MAX_ORDER_IMAGE_SIZE) throw new Error("image too large");
  const path = buildPath(orderId);
  const ref = storageRef(storage, path);
  const snap = await uploadBytes(ref, blob, {
    contentType: blob.type || "image/jpeg",
    customMetadata: { orderId: orderId || "" },
  });
  const url = await getDownloadURL(snap.ref);
  return { storagePath: path, url };
}

/* Compress + upload from a File. */
export async function uploadOrderImageFile(orderId, file){
  const blob = await compressOrderImageToBlob(file);
  return uploadOrderImageBlob(orderId, blob);
}

/* Delete a Storage object. 404 is silent (idempotent). */
export async function deleteOrderImage(storagePath){
  if(!storagePath) return;
  try {
    await deleteObject(storageRef(storage, storagePath));
  } catch(e){
    if(e?.code !== "storage/object-not-found"){
      console.error("[orderImages] delete failed:", e);
      throw e;
    }
  }
}

/* Detect whether an order's image field is a legacy inline base64 (vs URL).
   Empty image counts as not-legacy (nothing to migrate). */
export function hasLegacyImage(order){
  if(!order) return false;
  const img = order.image;
  if(!img || typeof img !== "string") return false;
  /* URL? Storage download URLs start with https. */
  if(img.startsWith("http://") || img.startsWith("https://")) return false;
  /* Empty string */
  if(img.length < 50) return false;
  /* data: URI or bare base64 */
  return img.startsWith("data:") || /^[A-Za-z0-9+/=]+$/.test(img.substring(0, 100));
}

/* Migrate one order's image to Storage. Returns {url, storagePath} or null
   if there was nothing to migrate. The image was already compressed to 250px
   client-side at upload time pre-V19.36, so we re-upload as-is — quality
   doesn't get better but the order doc shrinks dramatically. */
export async function migrateOrderImage(order){
  if(!hasLegacyImage(order)) return null;
  const blob = base64ToBlob(order.image, "image/jpeg");
  return uploadOrderImageBlob(order.id, blob);
}

/* Approximate base64 size in bytes for an order's image field. */
export function legacyImageSize(order){
  const img = order?.image;
  if(typeof img !== "string") return 0;
  if(img.startsWith("http")) return 0;
  return img.length;
}
