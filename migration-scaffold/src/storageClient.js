/* ════════════════════════════════════════════════════════════════════════
   CLARK — Storage adapter (Supabase) — P5
   ════════════════════════════════════════════════════════════════════════
   بديل src/utils/imageStorage.js + ref/uploadBytes/getDownloadURL. بنحافظ
   على نفس التوقيعات والـ return shape ({ url, storagePath }) عشان call sites
   متتغيّرش. ونفس مخطط المسار: images/{folder}/{id}/{ts}_{rnd}.jpg.

   فرق جوهري عن Firebase: في Firebase الـ "bucket" واحد والمسار بيبدأ بـ
   prefix (images/, attachments/, ...). في Supabase دي **buckets منفصلة**.
   فبنحوّل أول جزء من المسار لاسم bucket، والباقي مفتاح داخله.
   مثال: "images/orders/42/x.jpg" → bucket="images", path="orders/42/x.jpg".
   ════════════════════════════════════════════════════════════════════════ */
import { supabase } from "./supabase.js";

/* الـ buckets المطابقة لـ top-level paths في storage.rules القديمة */
export const BUCKETS = [
  "images", "documents", "invoices", "orders", "seasons", "templates",
  "campaigns", "logos", "qr", "attachments", "shopify-products",
  "whatsapp-campaigns", "temp",
];

/* يفصل "bucket/rest/of/path" → { bucket, key } */
function splitPath(fullPath) {
  const idx = fullPath.indexOf("/");
  if (idx < 0) return { bucket: "images", key: fullPath };
  return { bucket: fullPath.slice(0, idx), key: fullPath.slice(idx + 1) };
}

/* تصغير بدون قص — منسوخ كما هو من imageStorage.js (سلوك متطابق) */
function resizeNoCrop(file, maxDim, quality) {
  return new Promise((resolve) => {
    try {
      const reader = new FileReader();
      reader.onerror = () => resolve(file);
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = () => resolve(file);
        img.onload = () => {
          let w = img.width, h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w >= h) { h = Math.round(h * maxDim / w); w = maxDim; }
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
    } catch (_) { resolve(file); }
  });
}

const MAX_IMG_BYTES = 25 * 1024 * 1024;

/* بديل uploadImageToStorage(folder, id, file) → { url, storagePath }.
   storagePath بيفضل بنفس الشكل القديم "images/{folder}/{id}/..." عشان
   قيم الـ DB المخزّنة (و deleteStorageImage) متبقاش متوافقة. */
export async function uploadImageToStorage(folder, id, file) {
  if (!file) throw new Error("file required");
  if (!(file.type || "").startsWith("image/")) throw new Error("الملف لازم يكون صورة");
  if (file.size > MAX_IMG_BYTES) throw new Error("الصورة أكبر من 25 ميجا");
  const blob = await resizeNoCrop(file, 2048, 0.9);
  const ts = Date.now();
  const rnd = Math.random().toString(36).slice(2, 8);
  const safeFolder = String(folder || "misc").replace(/[^\w/-]/g, "_");
  const safeId = String(id || ("tmp_" + rnd)).replace(/[^\w-]/g, "_");
  const storagePath = `images/${safeFolder}/${safeId}/${ts}_${rnd}.jpg`;
  const { bucket, key } = splitPath(storagePath);

  const { error } = await supabase.storage.from(bucket).upload(key, blob, {
    contentType: blob.type || "image/jpeg", upsert: true,
  });
  if (error) throw new Error("فشل رفع الصورة: " + error.message);
  const { data } = supabase.storage.from(bucket).getPublicUrl(key);
  return { url: data.publicUrl, storagePath };
}

/* بديل رفع ملف عام (مرفقات/مستندات) بدون تصغير */
export async function uploadFileToStorage(fullPath, file, contentType) {
  const { bucket, key } = splitPath(fullPath);
  const { error } = await supabase.storage.from(bucket).upload(key, file, {
    contentType: contentType || file.type || "application/octet-stream", upsert: true,
  });
  if (error) throw new Error("فشل رفع الملف: " + error.message);
  const { data } = supabase.storage.from(bucket).getPublicUrl(key);
  return { url: data.publicUrl, storagePath: fullPath };
}

/* بديل deleteStorageImage(path) — idempotent */
export async function deleteStorageImage(fullPath) {
  if (!fullPath || typeof fullPath !== "string") return;
  const { bucket, key } = splitPath(fullPath);
  const { error } = await supabase.storage.from(bucket).remove([key]);
  if (error) console.warn("[storageClient] delete failed:", error.message);
}
