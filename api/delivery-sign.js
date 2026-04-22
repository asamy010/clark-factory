/* ═══════════════════════════════════════════════════════════════
   POST /api/delivery-sign
   Input:  { pairs: [{ sessionId, custId }, ...] }
   Output: { signatures: [{ sessionId, custId, sig }, ...] }
   
   Generates HMAC signatures for delivery confirmation URLs.
   The HMAC SECRET never leaves the server — frontend only gets the signatures.
   
   This endpoint is called by the factory (authenticated workflow) when printing
   delivery receipts, to embed signed URLs in QR codes for each customer.
   ═══════════════════════════════════════════════════════════════ */

import { setCors, signPayload } from "./_firebase.js";

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { pairs } = req.body || {};
    if (!Array.isArray(pairs) || pairs.length === 0) {
      return res.status(400).json({ error: "pairs array required" });
    }
    if (pairs.length > 500) {
      return res.status(400).json({ error: "max 500 pairs per request" });
    }
    const signatures = pairs.map((p) => {
      if (!p || !p.sessionId || !p.custId) {
        return { sessionId: p?.sessionId || "", custId: p?.custId || "", sig: "" };
      }
      return {
        sessionId: p.sessionId,
        custId: p.custId,
        sig: signPayload(p.sessionId, p.custId),
      };
    });
    res.status(200).json({ signatures });
  } catch (e) {
    res.status(500).json({ error: e.message || "internal error" });
  }
}
