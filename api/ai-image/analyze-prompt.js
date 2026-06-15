/* ═══════════════════════════════════════════════════════════════════════
   CLARK · api/ai-image/analyze-prompt.js (V21.23.3 — استوديو Phase 2c)
   ───────────────────────────────────────────────────────────────────────
   بيحلّل برومبت حر ويستخرج منه إعدادات الاستوديو (الجنس/السن/الخلفية/الإطار/
   الوقفة/لون البشرة/الإضاءة) كـ JSON — عشان نظبط الـ chips تلقائياً.

   نموذج نصّي خفيف (Gemini Flash) + responseMimeType=application/json.
   env: GEMINI_API_KEY · GEMINI_TEXT_MODEL (افتراضي gemini-2.5-flash)
   ═══════════════════════════════════════════════════════════════════════ */

import { setCors, verifyAiStudioToken } from "../_firebase.js";

export const config = { maxDuration: 30 };

const TEXT_MODEL = (process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash").trim();

const idList = (arr) => (Array.isArray(arr) ? arr : []).filter(o => o && o.id)
  .map(o => o.id + " (" + (o.label || "") + ")").join(", ");

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

  const prompt = String(body.prompt || "").trim();
  if(!prompt) return res.status(400).json({ ok: false, error: "البرومبت مطلوب" });
  const o = body.options || {};

  const instruction =
    "You extract fashion-photo settings from a user's prompt and return ONLY a JSON object (no markdown). " +
    "Pick the CLOSEST matching id from each allowed list, or null if not mentioned.\n" +
    "Allowed ids:\n" +
    "genderId: " + (idList(o.genders) || "girl, boy, woman, man, any") + "\n" +
    "ageId: " + (idList(o.ages) || "null") + "\n" +
    "backgroundId: " + (idList(o.backgrounds) || "null") + "\n" +
    "framingId: " + (idList(o.framings) || "full, half, three") + "\n" +
    "poseId: " + (idList(o.poses) || "null") + "\n" +
    "skinToneId: " + (idList(o.skinTones) || "any, light, medium, tan, dark") + "\n" +
    "lightingId: " + (idList(o.lightings) || "soft, natural, dramatic, golden") + "\n" +
    "Also return: extraNotes (any extra visual detail in the prompt not covered above, short English, or empty) " +
    "and summary (one short Arabic sentence describing the extracted setup).\n" +
    "Return JSON with exactly these keys: genderId, ageId, backgroundId, framingId, poseId, skinToneId, lightingId, extraNotes, summary.\n\n" +
    "USER PROMPT:\n" + prompt.slice(0, 4000);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + TEXT_MODEL + ":generateContent?key=" + apiKey, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: instruction }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
      }),
      signal: ctrl.signal,
    });
    const text = await resp.text();
    if(!resp.ok){
      let em = text; try { em = JSON.parse(text)?.error?.message || text; } catch(_){}
      return res.status(resp.status >= 500 ? 502 : 400).json({ ok: false, error: "فشل التحليل: " + em });
    }
    const json = JSON.parse(text);
    const raw = (json?.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("").trim();
    let fields;
    try { fields = JSON.parse(raw); }
    catch(_){
      const m = raw.match(/\{[\s\S]*\}/);
      if(!m) return res.status(502).json({ ok: false, error: "تعذّر قراءة نتيجة التحليل" });
      fields = JSON.parse(m[0]);
    }
    return res.status(200).json({ ok: true, fields });
  } catch(e){
    if(e.name === "AbortError") return res.status(504).json({ ok: false, error: "انتهت مهلة التحليل" });
    return res.status(500).json({ ok: false, error: (e && e.message) || "خطأ في التحليل" });
  } finally { clearTimeout(timer); }
}
