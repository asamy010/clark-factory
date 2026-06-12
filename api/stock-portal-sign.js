/* ═══════════════════════════════════════════════════════════════
   CLARK — Generate / Revoke Stock Portal Link (V21.21.68)

   POST /api/stock-portal-sign
   Body: { adminToken, rotate?, phone? }

   - يولّد لينك موقّع لبورتال المخزن المتاح (admin/manager فقط).
   - أول مرة: بينشئ config.stockPortalKey (مفتاح عشوائي) ويوقّع عليه.
   - rotate=true: بيجدّد المفتاح → كل اللينكات القديمة تتلغي فوراً (revoke).
   - phone: بيحفظ رقم واتساب الاستلام (config.stockPortalPhone) لزر الطلب.

   Returns: { ok, url, sig, rotated, phone }
   ═══════════════════════════════════════════════════════════════ */

import crypto from "crypto";
import { getDb, setCors, verifyAdminToken } from "./_firebase.js";
import { signStockKey } from "./stock-portal.js";

function genKey() { return crypto.randomBytes(12).toString("base64url"); }

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const body = (typeof req.body === "string") ? JSON.parse(req.body || "{}") : (req.body || {});
    const { adminToken, rotate, phone } = body;

    /* admin/manager فقط — توليد/إلغاء لينك عام حساس */
    const auth = await verifyAdminToken(adminToken);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

    const db = getDb();
    /* §10: دوكيومنت منفصل (مش factory/config) — السيرفر بس بيكتبه، فمفيش خطر
       إن كتابة config متزامنة من العميل تمسح المفتاح (concurrent-overwrite). */
    const ref = db.collection("factory").doc("stockPortal");
    const snap = await ref.get();
    const cur = snap.exists ? snap.data() : {};

    let stockKey = cur.key;
    const updates = {};
    if (!stockKey || rotate) { stockKey = genKey(); updates.key = stockKey; }
    if (typeof phone === "string") { updates.phone = phone.trim(); }
    if (Object.keys(updates).length) await ref.set(updates, { merge: true });

    const sig = signStockKey(stockKey);
    const host = req.headers["x-forwarded-host"] || req.headers.host || "";
    const baseUrl = req.headers.origin
      || (host ? "https://" + host : "");
    const url = baseUrl + "/?stock=1&s=" + encodeURIComponent(sig);

    return res.status(200).json({
      ok: true,
      url,
      sig,
      rotated: !!updates.key,
      phone: (updates.phone !== undefined ? updates.phone : (cur.phone || "")),
    });
  } catch (err) {
    console.error("stock-portal-sign error:", err);
    return res.status(500).json({ ok: false, error: err.message || "خطأ في الخادم" });
  }
}
