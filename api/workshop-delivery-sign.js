/* ═══════════════════════════════════════════════════════════════
   POST /api/workshop-delivery-sign  (V16.73)
   Input:  { triples: [{ orderId, wsId, deliveryIdx }, ...] }
           + Authorization: Bearer <Firebase ID token>  (admin/manager only)
   Output: { signatures: [{ orderId, wsId, deliveryIdx, sig }, ...] }

   Generates HMAC signatures used in the QR code printed on the workshop
   delivery label (10×15 cm). When the workshop scans the QR they're routed
   to the public WorkshopConfirmPage WITHOUT having to log into the factory
   app — the signature in the URL proves the request came from a real label.

   Mirrors /api/delivery-sign (the customer-facing equivalent) including the
   admin-token gate: anyone with valid factory credentials can mint signatures
   for any (orderId, wsId, deliveryIdx) triple, but the unprivileged public
   cannot. This prevents an outsider from generating their own URL to fake a
   workshop confirmation.
   ═══════════════════════════════════════════════════════════════ */

import { setCors, signWorkshopPayload, verifyAdminToken } from "./_firebase.js";

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    /* ─── Auth: admin/manager Firebase ID token required ─── */
    const token = req.headers.authorization || (req.body && req.body.idToken);
    const auth = await verifyAdminToken(token);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    const { triples } = req.body || {};
    if (!Array.isArray(triples) || triples.length === 0) {
      return res.status(400).json({ error: "triples array required" });
    }
    if (triples.length > 500) {
      return res.status(400).json({ error: "max 500 triples per request" });
    }

    const signatures = triples.map((t) => {
      /* deliveryIdx may legitimately be 0 (first delivery) — check explicitly
         for null/undefined/empty rather than truthiness. */
      const idxOk = t && t.deliveryIdx != null && t.deliveryIdx !== "";
      if (!t || !t.orderId || !t.wsId || !idxOk) {
        return {
          orderId: t?.orderId || "",
          wsId: t?.wsId || "",
          deliveryIdx: t?.deliveryIdx ?? "",
          sig: "",
        };
      }
      return {
        orderId: t.orderId,
        wsId: t.wsId,
        deliveryIdx: t.deliveryIdx,
        sig: signWorkshopPayload(t.orderId, t.wsId, t.deliveryIdx),
      };
    });
    res.status(200).json({ signatures });
  } catch (e) {
    res.status(500).json({ error: e.message || "internal error" });
  }
}
