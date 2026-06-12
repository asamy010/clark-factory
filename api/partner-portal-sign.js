/* ═══════════════════════════════════════════════════════════════
   CLARK — Generate / Configure Partner Portal Link (V21.21.69)

   POST /api/partner-portal-sign
   Body: { adminToken, rotate?, visibility? }

   - يولّد لينك موقّع لبورتال الشريك (admin/manager فقط).
   - أول مرة: بينشئ factory/partnerPortal.key ويوقّع عليه.
   - rotate=true: يجدّد المفتاح → كل اللينكات القديمة تتلغي فوراً.
   - visibility: {sales,purchases,inventory,profit,orders,receivables,payables}
     يحفظ إعدادات العرض (المالك يختار إيه يتعرض للشريك).

   Returns: { ok, url, sig, rotated, visibility }
   ═══════════════════════════════════════════════════════════════ */

import crypto from "crypto";
import { getDb, setCors, verifyAdminToken } from "./_firebase.js";
import { signPartnerKey } from "./partner-portal.js";
import { defaultVisibility, PARTNER_TOGGLES } from "../src/utils/partnerPortal.js";

function genKey() { return crypto.randomBytes(12).toString("base64url"); }

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const body = (typeof req.body === "string") ? JSON.parse(req.body || "{}") : (req.body || {});
    const { adminToken, rotate, visibility } = body;

    const auth = await verifyAdminToken(adminToken);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

    const db = getDb();
    /* §10: دوكيومنت معزول — السيرفر بس بيكتبه (مش معرّض لكتابات config المتزامنة). */
    const ref = db.collection("factory").doc("partnerPortal");
    const snap = await ref.get();
    const cur = snap.exists ? snap.data() : {};

    let key = cur.key;
    const updates = {};
    if (!key || rotate) { key = genKey(); updates.key = key; }
    if (visibility && typeof visibility === "object") {
      /* تعقيم: مفاتيح معروفة فقط + قيم boolean */
      const clean = {};
      PARTNER_TOGGLES.forEach(t => { if (t in visibility) clean[t] = !!visibility[t]; });
      updates.visibility = { ...(cur.visibility || defaultVisibility()), ...clean };
    }
    if (Object.keys(updates).length) await ref.set(updates, { merge: true });

    const sig = signPartnerKey(key);
    const host = req.headers["x-forwarded-host"] || req.headers.host || "";
    const baseUrl = req.headers.origin || (host ? "https://" + host : "");
    const url = baseUrl + "/?partner=1&s=" + encodeURIComponent(sig);

    return res.status(200).json({
      ok: true,
      url,
      sig,
      rotated: !!updates.key,
      visibility: (updates.visibility || cur.visibility || defaultVisibility()),
    });
  } catch (err) {
    console.error("partner-portal-sign error:", err);
    return res.status(500).json({ ok: false, error: err.message || "خطأ في الخادم" });
  }
}
