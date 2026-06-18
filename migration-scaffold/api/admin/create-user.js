/* ════════════════════════════════════════════════════════════════════════
   CLARK — POST /api/admin/create-user (P3)
   ════════════════════════════════════════════════════════════════════════
   بديل نمط secondary-app في Firebase. إنشاء user جديد server-side بالـ
   service-role — مايلمسش جلسة الأدمن إطلاقاً. admin-only.
   ════════════════════════════════════════════════════════════════════════ */
import { getSupaAdmin, verifyAdminToken } from "../_supabase.js";

export default async function handler(req, res) {
  // CORS (نفس اتفاقية §9)
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method not allowed" });

  try {
    await verifyAdminToken(req.headers.authorization);
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { email, password, displayName } = body;
    if (!email || !password) return res.status(400).json({ ok: false, error: "email و password مطلوبين" });

    const supa = getSupaAdmin();
    const { data, error } = await supa.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // مفيش flow تأكيد بريد في CLARK — أكّده مباشرة
      user_metadata: { displayName: displayName || "" },
    });
    if (error) return res.status(400).json({ ok: false, error: error.message });

    // ملاحظة: ربط الدور في app_docs('config').users بيتم من SettingsPg
    // عبر upConfig زي ما هو دلوقتي — مش هنا.
    return res.status(200).json({ ok: true, user: { id: data.user.id, email: data.user.email } });
  } catch (e) {
    const status = /token|authorized/i.test(e.message) ? 401 : 500;
    return res.status(status).json({ ok: false, error: e.message });
  }
}
