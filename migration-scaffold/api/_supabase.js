/* ════════════════════════════════════════════════════════════════════════
   CLARK — Supabase Admin singleton للـ Vercel serverless (بديل api/_firebase.js)
   ════════════════════════════════════════════════════════════════════════
   service-role key بيتخطّى RLS — زي الـ Firebase Admin SDK بالظبط. السيرفر
   فقط (مايتسربش للمتصفح أبداً).
   ════════════════════════════════════════════════════════════════════════ */
import { createClient } from "@supabase/supabase-js";

let _client = null;

export function getSupaAdmin() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set in Vercel env vars");
  _client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _client;
}

/* بديل verifyAdminToken: بيتحقق من Supabase JWT في الـ Authorization header
   ويتأكد إن الدور admin/manager+. (تنفيذ مبدئي — اربطه بنموذج الأدوار الفعلي.) */
export async function verifyAdminToken(authHeader) {
  const token = (authHeader || "").replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("missing token");
  const supa = getSupaAdmin();
  const { data, error } = await supa.auth.getUser(token);
  if (error || !data?.user) throw new Error("invalid token");
  const email = data.user.email;
  // اقرأ الدور من app_docs('config').users
  const { data: cfgRow } = await supa.from("app_docs").select("data").eq("doc_key", "config").single();
  const users = cfgRow?.data?.users || [];
  const me = users.find(u => u.email === email);
  if (!me || !["manager", "admin", "owner"].includes(me.role)) throw new Error("not authorized");
  return { email, role: me.role, uid: data.user.id };
}

/* تنظيف undefined قبل أي write (Firestore كان بيشيلهم تلقائياً عبر
   ignoreUndefinedProperties — في Postgres/JSON لازم ننضّفهم بأنفسنا). */
export function stripUndefined(obj) {
  return JSON.parse(JSON.stringify(obj ?? null));
}
