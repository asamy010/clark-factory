/* ════════════════════════════════════════════════════════════════════════
   CLARK — Auth adapter (Supabase) — P3
   ════════════════════════════════════════════════════════════════════════
   طبقة رفيعة تحاكي واجهة Firebase Auth المستخدمة في التطبيق عشان نقلّل
   التعديل في LoginScreen/App.jsx/SettingsPg:
     - Firebase: signInWithEmailAndPassword(auth, email, pass)
     - هنا:      signIn(email, pass)
     - Firebase: onAuthStateChanged(auth, cb)
     - هنا:      onAuthChange(cb)
     - Firebase: createUserWithEmailAndPassword(getSecondaryAuth(), ...)
     - هنا:      adminCreateUser(...) عبر السيرفر (مفيش secondary app)

   ملاحظة الأدوار: زي Firebase بالظبط، الأدوار مش في الـ auth token — بتتقرأ
   من app_docs('config').users بالبريد. فالمنطق ده مايتغيّرش.
   ════════════════════════════════════════════════════════════════════════ */
import { supabase } from "./supabase.js";

/* بديل signInWithEmailAndPassword.
   ملاحظة UX: Supabase بيرجّع error.message مش error.code زي Firebase —
   نترجم الحالة الشائعة (بيانات غلط) لرسالة عربية زي القديم. */
export async function signIn(email, pass) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
  if (error) {
    const msg = /invalid login credentials/i.test(error.message) ? "بيانات الدخول غلط" : "خطأ: " + error.message;
    const e = new Error(msg); e.code = "auth/invalid-credential"; throw e;
  }
  return data.user;
}

/* بديل signOut(auth) */
export async function signOutUser() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/* بديل onAuthStateChanged(auth, cb) → بيرجّع دالة unsubscribe.
   بيستدعي cb(user|null) فوراً بالحالة الحالية + عند أي تغيير (زي Firebase). */
export function onAuthChange(cb) {
  // الحالة الأولية (Firebase بيـ fire فوراً)
  supabase.auth.getSession().then(({ data }) => cb(data?.session?.user || null));
  const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => cb(session?.user || null));
  return () => sub?.subscription?.unsubscribe();
}

/* بديل createUserWithEmailAndPassword(getSecondaryAuth(), ...).
   في Firebase كان لازم secondary app عشان إنشاء user مايعملش logout للأدمن.
   في Supabase الإنشاء بيتم server-side (admin API) → مفيش أي تأثير على
   جلسة الأدمن، وأنظف. SettingsPg بينادي على الـ endpoint ده بدل
   createUserWithEmailAndPassword. */
export async function adminCreateUser({ email, password, displayName }, token) {
  const res = await fetch("/api/admin/create-user", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ email, password, displayName }),
  });
  const j = await res.json();
  if (!j.ok) throw new Error(j.error || "فشل إنشاء المستخدم");
  return j.user;
}

/* مساعد: التوكن الحالي للاستدعاءات المصادَق عليها للـ api/ (بديل
   user.getIdToken() في Firebase). */
export async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || null;
}
