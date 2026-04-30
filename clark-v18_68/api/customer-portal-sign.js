/* ═══════════════════════════════════════════════════════════════
   CLARK — Generate Customer Portal Link (V16.3)
   
   POST /api/customer-portal-sign
   Body: { custId: string, adminToken: string }
   
   Generates a signed URL for a customer's portal.
   Requires admin/manager Firebase ID token in body for auth.
   Returns: { url: string, sig: string }

   V16.12 SECURITY: Now enforces role check (admin/manager only).
   Previously it only verified the token was valid — meaning any
   authenticated Firebase user (including viewers) could mint
   portal links for any customer and leak their financial data.
   ═══════════════════════════════════════════════════════════════ */

import { setCors, verifyAdminToken } from "./_firebase.js";
import { signCustomerId } from "./customer-portal.js";

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { custId, adminToken } = req.body || {};
    if (!custId) return res.status(400).json({ error: "custId مطلوب" });

    /* V16.12: Verify token AND check role (admin/manager only) */
    const auth = await verifyAdminToken(adminToken);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    /* V18.12: Generate short URL format ?p=c&i=<id>&s=<short_sig> */
    const sig = signCustomerId(custId);
    const baseUrl = req.headers["x-forwarded-host"]
      ? "https://" + req.headers["x-forwarded-host"]
      : req.headers.origin || req.headers.host || "";
    const url = (baseUrl.startsWith("http") ? baseUrl : "https://" + baseUrl) +
                "/?p=c&i=" + encodeURIComponent(custId) +
                "&s=" + encodeURIComponent(sig);

    return res.status(200).json({ url, sig });
  } catch (err) {
    console.error("customer-portal-sign error:", err);
    return res.status(500).json({ error: err.message || "خطأ في الخادم" });
  }
}
