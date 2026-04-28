/* ═══════════════════════════════════════════════════════════════
   CLARK — Generate Workshop Portal Link (V17.9)
   
   POST /api/workshop-portal-sign
   Body: { wsId: string, adminToken: string }
   
   Generates a signed URL for a workshop's portal.
   Requires admin/manager Firebase ID token in body for auth.
   Returns: { url: string, sig: string }
   ═══════════════════════════════════════════════════════════════ */

import { setCors, verifyAdminToken } from "./_firebase.js";
import { signWorkshopId } from "./workshop-portal.js";

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

    /* V18.12: Generate short URL format ?p=w&i=<id>&s=<short_sig> */
    const sig = signWorkshopId(wsId);
    const baseUrl = req.headers["x-forwarded-host"]
      ? "https://" + req.headers["x-forwarded-host"]
      : req.headers.origin || req.headers.host || "";
    const url = (baseUrl.startsWith("http") ? baseUrl : "https://" + baseUrl) +
                "/?p=w&i=" + encodeURIComponent(wsId) +
                "&s=" + encodeURIComponent(sig);

    return res.status(200).json({ url, sig });
  } catch (err) {
    console.error("workshop-portal-sign error:", err);
    return res.status(500).json({ error: err.message || "خطأ في الخادم" });
  }
}
