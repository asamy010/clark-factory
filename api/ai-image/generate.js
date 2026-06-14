/* ═══════════════════════════════════════════════════════════════════════
   CLARK · api/ai-image/generate.js (V21.23.0 — استوديو الموديلات Phase 2a)
   ───────────────────────────────────────────────────────────────────────
   توليد/تلبيس صورة موديل بـ Nano Banana Pro (Google Gemini 3 Pro Image)
   من داخل التطبيق مباشرة. بياخد صور مصدر (القطعة/عينة) + برومبت → بيرجّع
   صورة موديل لابس الطقم، بيخزّنها على Firebase Storage ويرجّع الـ URL.

   البروتوكول:
   - auth admin (verifyAdminToken) — viewer ممنوع (التوليد بيكلّف فلوس).
   - withProgress (§11) — overlay تقدّم على syncJobs.
   - AbortController + timeout < maxDuration (§10) — مفيش orphaned hangs.
   - الرفع server-side عبر Admin SDK + download-token URL ثابت.

   env:
   - GEMINI_API_KEY            (إلزامي)
   - GEMINI_IMAGE_MODEL_PRO    (افتراضي gemini-3-pro-image-preview)
   - GEMINI_IMAGE_MODEL_FLASH  (افتراضي gemini-2.5-flash-image)
   - FIREBASE_STORAGE_BUCKET   (افتراضي clarkfactorymanagement.firebasestorage.app)
   ═══════════════════════════════════════════════════════════════════════ */

import admin from "firebase-admin";
import crypto from "crypto";
import { setCors, verifyAdminToken, getAdminApp } from "../_firebase.js";
import { withProgress } from "../_progressTracker.js";

/* Vercel Pro — التوليد بياخد ٢-١٢ ثانية؛ نسيب هامش */
export const config = { maxDuration: 60 };

const BUCKET = (process.env.FIREBASE_STORAGE_BUCKET || "clarkfactorymanagement.firebasestorage.app").trim();
const MODEL_PRO = (process.env.GEMINI_IMAGE_MODEL_PRO || "gemini-3-pro-image-preview").trim();
const MODEL_FLASH = (process.env.GEMINI_IMAGE_MODEL_FLASH || "gemini-2.5-flash-image").trim();
const VALID_AR = ["1:1", "3:4", "4:3", "9:16", "16:9", "2:3", "3:2", "4:5", "5:4"];
const VALID_SIZE = ["1K", "2K", "4K"];

/* تحميل صورة مصدر وتحويلها base64 (مع timeout) */
async function fetchAsBase64(url, timeoutMs){
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if(!r.ok) throw new Error("تعذّر تحميل صورة المصدر (" + r.status + ")");
    const buf = Buffer.from(await r.arrayBuffer());
    if(buf.length > 12 * 1024 * 1024) throw new Error("صورة المصدر أكبر من ١٢ ميجا");
    const mime = (r.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
    return { data: buf.toString("base64"), mimeType: mime };
  } catch(e){
    if(e.name === "AbortError") throw new Error("انتهت مهلة تحميل صورة المصدر");
    throw e;
  } finally { clearTimeout(t); }
}

/* رفع الناتج على Storage + URL ثابت بـ download token (نفس شكل getDownloadURL) */
async function uploadGenerated(buffer, contentType, pathSuffix){
  getAdminApp(); /* ensure admin initialized */
  const bucket = admin.storage().bucket(BUCKET);
  const storagePath = "images/ai-generated/" + pathSuffix;
  const token = crypto.randomUUID();
  await bucket.file(storagePath).save(buffer, {
    resumable: false, contentType,
    metadata: { contentType, metadata: { firebaseStorageDownloadTokens: token } },
  });
  const url = "https://firebasestorage.googleapis.com/v0/b/" + BUCKET +
    "/o/" + encodeURIComponent(storagePath) + "?alt=media&token=" + token;
  return { url, storagePath };
}

/* نداء Gemini generateContent — يرجّع base64 + mimeType */
async function callGemini(apiKey, model, parts, generationConfig, timeoutMs){
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + apiKey, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig }),
      signal: ctrl.signal,
    });
    const text = await resp.text();
    if(!resp.ok){
      let em = text; try { em = JSON.parse(text)?.error?.message || text; } catch(_){}
      const e = new Error(em || ("HTTP " + resp.status));
      e.httpStatus = resp.status;
      throw e;
    }
    return JSON.parse(text);
  } catch(e){
    if(e.name === "AbortError") throw new Error("انتهت مهلة التوليد — جرّب تاني أو قلّل الحجم/الصور");
    throw e;
  } finally { clearTimeout(timer); }
}

export default async function handler(req, res){
  setCors(res, req);
  if(req.method === "OPTIONS") return res.status(204).end();
  if(req.method !== "POST") return res.status(405).json({ ok: false, error: "الطريقة غير مدعومة" });

  let body;
  try { body = (typeof req.body === "string") ? JSON.parse(req.body || "{}") : (req.body || {}); }
  catch(_){ return res.status(400).json({ ok: false, error: "جسم الطلب غير صالح" }); }

  const auth = await verifyAdminToken(req.headers.authorization || body.idToken);
  if(!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });
  if(auth.role === "viewer") return res.status(403).json({ ok: false, error: "مفيش صلاحية لتوليد الصور" });

  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if(!apiKey) return res.status(500).json({ ok: false, error: "GEMINI_API_KEY مش متظبط في Vercel" });

  return withProgress(req, res, {
    jobId: body.jobId, type: "ai-image-generate", label: "توليد صورة الموديل", by: auth.email,
  }, async (update) => {
    const prompt = String(body.prompt || "").trim();
    if(!prompt) throw new Error("البرومبت مطلوب");
    const sources = Array.isArray(body.sourceImageUrls) ? body.sourceImageUrls.filter(Boolean).slice(0, 5) : [];
    if(sources.length === 0) throw new Error("لازم صورة مصدر واحدة على الأقل (القطعة/العينة)");

    const tier = body.tier === "flash" ? "flash" : "pro";
    const model = tier === "flash" ? MODEL_FLASH : MODEL_PRO;
    const aspectRatio = VALID_AR.includes(body.aspectRatio) ? body.aspectRatio : "3:4";
    const imageSize = VALID_SIZE.includes(body.imageSize) ? body.imageSize : "2K";

    await update({ message: "بتحميل صور المصدر...", progress: 12, total: 100 });
    const parts = [{ text: prompt }];
    for(const url of sources){
      const img = await fetchAsBase64(url, 15000);
      parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
    }

    /* imageConfig: imageSize خاصية Pro؛ لـ flash نبعت aspectRatio بس */
    const imageConfig = tier === "pro" ? { aspectRatio, imageSize } : { aspectRatio };

    await update({ message: "بتولّد الصورة بالذكاء الاصطناعي... (ثواني)", progress: 40, total: 100 });
    let json;
    try {
      json = await callGemini(apiKey, model, parts, { responseModalities: ["IMAGE"], imageConfig }, 50000);
    } catch(e){
      /* بعض الإصدارات بتطلب TEXT+IMAGE — retry مرة واحدة قبل ما نفشل */
      const msg = (e && e.message || "").toLowerCase();
      if(e.httpStatus === 400 && (msg.includes("modal") || msg.includes("text"))){
        json = await callGemini(apiKey, model, parts, { responseModalities: ["TEXT", "IMAGE"], imageConfig }, 50000);
      } else {
        const err = new Error("فشل التوليد: " + (e.message || "خطأ غير معروف"));
        err.statusCode = (e.httpStatus && e.httpStatus >= 500) ? 502 : 400;
        throw err;
      }
    }

    const partsOut = json?.candidates?.[0]?.content?.parts || [];
    const imgPart = partsOut.find(p => p.inlineData && p.inlineData.data);
    if(!imgPart){
      const textOut = (partsOut.find(p => p.text) || {}).text || "";
      const blocked = json?.candidates?.[0]?.finishReason || json?.promptFeedback?.blockReason || "";
      throw new Error("النموذج مرجّعش صورة" + (textOut ? " — " + textOut.slice(0, 220) : (blocked ? " (" + blocked + ")" : "")));
    }
    const mimeType = imgPart.inlineData.mimeType || "image/png";
    const ext = mimeType.includes("png") ? "png" : (mimeType.includes("webp") ? "webp" : "jpg");
    const buffer = Buffer.from(imgPart.inlineData.data, "base64");

    await update({ message: "بيحفظ الصورة...", progress: 85, total: 100 });
    const modelId = String(body.modelId || "anon").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "anon";
    const pathSuffix = modelId + "/" + Date.now() + "_" + Math.random().toString(36).slice(2, 7) + "." + ext;
    const { url, storagePath } = await uploadGenerated(buffer, mimeType, pathSuffix);

    return { url, storagePath, mimeType, model, tier, aspectRatio, imageSize, bytes: buffer.length, message: "تم توليد الصورة ✅" };
  });
}
