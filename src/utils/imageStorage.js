/* ═══════════════════════════════════════════════════════════════
   CLARK — imageStorage.js (V21.22.6)

   رفع الصور على Firebase Storage بجودة عالية (بدون قص) — المعيار الموحّد
   لأي رفع صورة في التطبيق (أمر Ahmed: «أي رفع صور/ملفات يكون على الستوريج
   عشان الجودة الكاملة»، مش base64 مضغوط).

   المسار: images/{folder}/{id}/{ts}_{rnd}.jpg  →  قاعدة storage.rules
   `match /images/{allPaths=**}` (write آمن بـ mime+size guard).

   ⚠️ لازم نشر storage.rules (firebase deploy --only storage) قبل الاستخدام،
   وإلا الرفع بيرجع permission-denied (الـ base64 القديم كان شغّال بدونها).
   ═══════════════════════════════════════════════════════════════ */

import { storage } from "../firebase.js";
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

/* تصغير بدون قص (يحافظ على نسبة الأبعاد) لأقصى بُعد + جودة عالية.
   2048px @ 0.9 = جودة ممتازة بحجم معقول. لو فشل أي شيء → الملف الأصلي. */
function resizeNoCrop(file, maxDim, quality){
  return new Promise((resolve) => {
    try {
      const reader = new FileReader();
      reader.onerror = () => resolve(file);
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = () => resolve(file);
        img.onload = () => {
          let w = img.width, h = img.height;
          if(w > maxDim || h > maxDim){
            if(w >= h){ h = Math.round(h * maxDim / w); w = maxDim; }
            else { w = Math.round(w * maxDim / h); h = maxDim; }
          }
          const c = document.createElement("canvas");
          c.width = w; c.height = h;
          c.getContext("2d").drawImage(img, 0, 0, w, h);
          c.toBlob(b => resolve(b || file), "image/jpeg", quality);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    } catch(_){ resolve(file); }
  });
}

const MAX_IMG_BYTES = 25 * 1024 * 1024; /* 25MB قبل التصغير */

/* رفع صورة على Storage → { url, storagePath }. */
export async function uploadImageToStorage(folder, id, file){
  if(!file) throw new Error("file required");
  if(!(file.type || "").startsWith("image/")) throw new Error("الملف لازم يكون صورة");
  if(file.size > MAX_IMG_BYTES) throw new Error("الصورة أكبر من 25 ميجا");
  const blob = await resizeNoCrop(file, 2048, 0.9);
  const ts = Date.now();
  const rnd = Math.random().toString(36).slice(2, 8);
  const safeFolder = String(folder || "misc").replace(/[^\w/-]/g, "_");
  const safeId = String(id || ("tmp_" + rnd)).replace(/[^\w-]/g, "_");
  const path = `images/${safeFolder}/${safeId}/${ts}_${rnd}.jpg`;
  const r = storageRef(storage, path);
  const snap = await uploadBytes(r, blob, { contentType: blob.type || "image/jpeg" });
  const url = await getDownloadURL(snap.ref);
  return { url, storagePath: path };
}

/* حذف صورة من Storage (idempotent — 404 صامت). */
export async function deleteStorageImage(path){
  if(!path || typeof path !== "string" || !path.startsWith("images/")) return;
  try { await deleteObject(storageRef(storage, path)); }
  catch(e){ if(e?.code !== "storage/object-not-found") console.warn("[imageStorage] delete failed:", e?.message || e); }
}
