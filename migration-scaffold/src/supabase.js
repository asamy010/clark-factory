/* ════════════════════════════════════════════════════════════════════════
   CLARK — Supabase client (بديل src/firebase.js)
   ════════════════════════════════════════════════════════════════════════
   anon key فقط في الكلاينت — الأمان عبر RLS (مش عبر إخفاء المفتاح).
   ملاحظة: Vite بيستخدم VITE_* prefix للمتغيرات المكشوفة للمتصفح.
   ════════════════════════════════════════════════════════════════════════ */
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error("[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY غير مضبوطين");
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: { params: { eventsPerSecond: 10 } },
});

/* بديل getSecondaryAuth: في Supabase إنشاء users بيتم server-side عبر
   admin API (api/_supabase.js → supaAdmin.auth.admin.createUser)، فمفيش
   حاجة للـ secondary app الكلاينتي اللي كان في Firebase. */
