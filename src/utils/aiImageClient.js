/* ═══════════════════════════════════════════════════════════════════════
   CLARK · aiImageClient.js (V21.23.0 — استوديو الموديلات Phase 2a)
   ───────────────────────────────────────────────────────────────────────
   wrapper للعميل لاستدعاء /api/ai-image/generate بالـ token. مايرميش —
   بيرجّع { ok, url, ... } أو { ok:false, error }. بيتلفّ بـ runWithProgress
   في الـ UI عشان overlay التقدّم (§11).
   ═══════════════════════════════════════════════════════════════════════ */

import { auth } from "../firebase.js";

export async function generateModelImage(args, _user){
  const u = auth.currentUser;
  if(!u) return { ok: false, error: "مش مسجّل دخول" };
  let token;
  try { token = await u.getIdToken(); }
  catch(_){ return { ok: false, error: "تعذّر الحصول على رمز الدخول" }; }

  try {
    const res = await fetch("/api/ai-image/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify(args || {}),
    });
    let j;
    try { j = await res.json(); } catch(_){ return { ok: false, error: "رد غير صالح من السيرفر (" + res.status + ")" }; }
    if(!res.ok || j.ok === false) return { ok: false, error: j.error || ("فشل التوليد (" + res.status + ")") };
    return j;
  } catch(e){
    return { ok: false, error: (e && e.message) || "تعذّر الاتصال بالسيرفر" };
  }
}

/* تحليل برومبت حر → إعدادات استوديو ({fields}) */
export async function analyzePrompt(args, _user){
  const u = auth.currentUser;
  if(!u) return { ok: false, error: "مش مسجّل دخول" };
  let token;
  try { token = await u.getIdToken(); }
  catch(_){ return { ok: false, error: "تعذّر الحصول على رمز الدخول" }; }
  try {
    const res = await fetch("/api/ai-image/analyze-prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify(args || {}),
    });
    let j;
    try { j = await res.json(); } catch(_){ return { ok: false, error: "رد غير صالح (" + res.status + ")" }; }
    if(!res.ok || j.ok === false) return { ok: false, error: j.error || ("فشل التحليل (" + res.status + ")") };
    return j;
  } catch(e){
    return { ok: false, error: (e && e.message) || "تعذّر الاتصال بالسيرفر" };
  }
}
