/* ═══════════════════════════════════════════════════════════════════════
   CLARK · api/ai-image/describe-image.js (V21.27.13 — استوديو)
   ───────────────────────────────────────────────────────────────────────
   بياخد صورة وقفة (base64) ويطلّع منها «برومبت توليد» كامل قابل لإعادة
   الاستخدام (الوقفة/الإطار/زاوية الكاميرا/الإضاءة/الخلفية/التعبير/المود) +
   اسم عربي قصير — عشان يتحفظ في مكتبة البرومبتس بالصورة.

   Gemini Flash (vision) + responseMimeType=application/json.
   env: GEMINI_API_KEY · GEMINI_TEXT_MODEL (افتراضي gemini-2.5-flash)
   ═══════════════════════════════════════════════════════════════════════ */

import { setCors, verifyAiStudioToken } from "../_firebase.js";

export const config = { maxDuration: 60 };

const TEXT_MODEL = (process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash").trim();

const INSTRUCTION =
  "You are a fashion-photography prompt engineer. Look at the photo and write ONE detailed, " +
  "reusable text-to-image PROMPT (in English) that would recreate the SAME SHOT. Focus on: model " +
  "pose & body position, framing/crop (full-body / half / close-up), camera angle & lens feel, " +
  "lighting style & direction, background/setting, mood & facial expression, and overall composition. " +
  "Do NOT describe the specific garment fabric/brand, and ignore any text or logos. Keep it " +
  "production-ready, comma-separated, no markdown, no preamble. " +
  "Also produce a SHORT Arabic name (2-4 words) describing the pose. " +
  "Return ONLY a JSON object with exactly these keys: { \"prompt\": \"...\", \"name\": \"...\" }";

export default async function handler(req, res){
  setCors(res, req);
  if(req.method === "OPTIONS") return res.status(204).end();
  if(req.method !== "POST") return res.status(405).json({ ok: false, error: "الطريقة غير مدعومة" });

  let body;
  try { body = (typeof req.body === "string") ? JSON.parse(req.body || "{}") : (req.body || {}); }
  catch(_){ return res.status(400).json({ ok: false, error: "جسم الطلب غير صالح" }); }

  const auth = await verifyAiStudioToken(req.headers.authorization || body.idToken);
  if(!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if(!apiKey) return res.status(500).json({ ok: false, error: "GEMINI_API_KEY مش متظبط" });

  /* الصورة كـ base64 (من غير بادئة data:) + النوع. بيتقبل data URL كامل برضه.
     أو imageUrl (من مساحة التخزين) — بيتجاب من السيرفر (مفيش CORS). */
  let b64 = String(body.imageBase64 || "").trim();
  let mimeType = String(body.mimeType || "image/jpeg").trim();
  if(b64.startsWith("data:")){
    const m = b64.match(/^data:([^;]+);base64,(.*)$/);
    if(m){ mimeType = m[1]; b64 = m[2]; }
  }
  if(!b64){
    const url = String(body.imageUrl || "").trim();
    if(url){
      try {
        const ictrl = new AbortController();
        const itimer = setTimeout(() => ictrl.abort(), 12000);
        const ir = await fetch(url, { signal: ictrl.signal });
        clearTimeout(itimer);
        if(!ir.ok) return res.status(400).json({ ok: false, error: "تعذّر تحميل الصورة من الرابط (" + ir.status + ")" });
        const ct = (ir.headers.get("content-type") || "").split(";")[0].trim();
        if(ct.startsWith("image/")) mimeType = ct;
        const ab = await ir.arrayBuffer();
        if(ab.byteLength > 5_500_000) return res.status(413).json({ ok: false, error: "الصورة كبيرة جداً" });
        b64 = Buffer.from(ab).toString("base64");
      } catch(e){
        return res.status(400).json({ ok: false, error: "فشل تحميل الصورة من الرابط" });
      }
    }
  }
  if(!b64) return res.status(400).json({ ok: false, error: "الصورة مطلوبة" });
  /* حد أمان (~7MB base64 ≈ 5MB صورة) */
  if(b64.length > 7_000_000) return res.status(413).json({ ok: false, error: "الصورة كبيرة — صغّرها قبل الرفع" });

  /* V21.27.36: استدعاء Gemini مرة واحدة. بيرجّع { raw, finishReason, block }.
     - thinkingConfig.thinkingBudget=0: يعطّل «التفكير» في gemini-2.5-flash —
       كان بياكل ميزانية التوكنز فالموديل يرجّع parts فاضية (finishReason
       MAX_TOKENS) → «تعذّر قراءة نتيجة التحليل» بشكل متقطّع. ده السبب الجذري.
     - maxOutputTokens: سقف واضح للمخرجات. */
  const callOnce = async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    try {
      const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + TEXT_MODEL + ":generateContent?key=" + apiKey, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [
            { text: INSTRUCTION },
            { inlineData: { mimeType, data: b64 } },
          ] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.3, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
        }),
        signal: ctrl.signal,
      });
      const text = await resp.text();
      if(!resp.ok){
        let em = text; try { em = JSON.parse(text)?.error?.message || text; } catch(_){}
        const e = new Error("فشل التحليل: " + em); e.statusCode = resp.status >= 500 ? 502 : 400; throw e;
      }
      const json = JSON.parse(text);
      const cand = json?.candidates?.[0] || {};
      const raw = (cand?.content?.parts || []).map(p => p.text || "").join("").trim();
      return { raw, finishReason: cand.finishReason || "", block: json?.promptFeedback?.blockReason || "" };
    } finally { clearTimeout(timer); }
  };

  try {
    let r = await callOnce();
    /* إعادة محاولة واحدة لو الرد فاضي (مش بسبب حجب أمان) — يعالج التقطّع */
    if(!r.raw && r.block !== "SAFETY" && r.block !== "PROHIBITED_CONTENT") r = await callOnce();

    if(!r.raw){
      const why = r.block ? ("المحتوى اتحجب (" + r.block + ")") : (r.finishReason ? ("النموذج مرجّعش نص (" + r.finishReason + ")") : "النموذج رجّع رد فاضي");
      return res.status(502).json({ ok: false, error: "تعذّر التحليل: " + why + " — جرّب صورة تانية أو تاني." });
    }
    let fields;
    try { fields = JSON.parse(r.raw); }
    catch(_){
      const mm = r.raw.match(/\{[\s\S]*\}/);
      try { fields = mm ? JSON.parse(mm[0]) : null; } catch(__){ fields = null; }
      if(!fields) return res.status(502).json({ ok: false, error: "تعذّر قراءة نتيجة التحليل — جرّب تاني." });
    }
    const prompt = String(fields?.prompt || "").trim();
    const name = String(fields?.name || "").trim();
    if(!prompt) return res.status(502).json({ ok: false, error: "مفيش برومبت في النتيجة — جرّب تاني." });
    return res.status(200).json({ ok: true, prompt, name });
  } catch(e){
    if(e.name === "AbortError") return res.status(504).json({ ok: false, error: "انتهت مهلة التحليل — جرّب تاني." });
    return res.status(e.statusCode || 500).json({ ok: false, error: (e && e.message) || "خطأ في التحليل" });
  }
}
