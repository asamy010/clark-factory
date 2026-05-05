/* ═══════════════════════════════════════════════════════════════
   CLARK — Generate Workshop Portal Link (V17.9)
   
   POST /api/workshop-portal-sign
   Body: { wsId: string, adminToken: string }
   
   Generates a signed URL for a workshop's portal.
   Requires admin/manager Firebase ID token in body for auth.
   Returns: { url: string, sig: string }
   ═══════════════════════════════════════════════════════════════ */

import { setCors, verifyAdminToken } from "./_firebase.js";
import { signWorkshopIdWithTs } from "./workshop-portal.js";

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { wsId, adminToken } = req.body || {};
    if (!wsId) return res.status(400).json({ error: "wsId مطلوب" });

    /* Verify token AND check role (admin/manager only) */
    const auth = await verifyAdminToken(adminToken);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    /* V19.64: Timestamped URL — link expires after 90 days. Format: ?p=w&i=<id>&t=<ts>&s=<sig> */
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = signWorkshopIdWithTs(wsId, ts);
    const baseUrl = req.headers["x-forwarded-host"]
      ? "https://" + req.headers["x-forwarded-host"]
      : req.headers.origin || req.headers.host || "";
    const url = (baseUrl.startsWith("http") ? baseUrl : "https://" + baseUrl) +
                "/?p=w&i=" + encodeURIComponent(wsId) +
                "&t=" + ts +
                "&s=" + encodeURIComponent(sig);

    return res.status(200).json({ url, sig, ts, expiresAt: new Date((parseInt(ts,10) + 90*24*3600) * 1000).toISOString() });
  } catch (err) {
    console.error("workshop-portal-sign error:", err);
    return res.status(500).json({ error: err.message || "خطأ في الخادم" });
  }
}
