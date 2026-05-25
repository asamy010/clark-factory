/* ═══════════════════════════════════════════════════════════════
   POST /api/notifications/whatsapp-fallback
   V21.9.179 (Slice 12/14)
   ───────────────────────────────────────────────────────────────
   Critical-only WhatsApp fallback: when a high-urgency push fails
   delivery to a user (all their devices returned terminal errors,
   or no active subscriptions exist) AND the user has a phone in
   factory/config.usersList, this endpoint sends the notification
   via the WhatsApp Bridge instead.

   Auth: X-CLARK-INTERNAL header (same as send-internal).

   Body:
     {
       userId / userEmail / phone,    // one of these to identify recipient
       title, body,
       category (used for routing),
       data,
     }

   Why critical-only:
   - WhatsApp Bridge rate limits + ban risk if abused
   - Most notifications belong on push (low-friction, free)
   - Reserving WhatsApp for "user MUST see this" prevents fatigue

   Why NOT auto-triggered from /send:
   - The send endpoint can't know "user is offline 24h+" without a
     separate liveness ping (out of scope for Slice 12)
   - This endpoint is invoked manually by ops or by a future cron
     that detects sustained delivery failures (Slice 13 analytics)

   ⚠️ NOT integrated into /send by default — opt-in by calling this
   endpoint directly from server-side automation that has reason to
   believe a push won't reach the user (e.g., last-seen > 48h).
   ═══════════════════════════════════════════════════════════════ */

import { setCors, getDb } from "../_firebase.js";

const BRIDGE_URL = process.env.WHATSAPP_BRIDGE_URL
  || "https://clark-rmg.duckdns.org";  /* documented Bridge URL (V19.x) */
const BRIDGE_TIMEOUT_MS = 8000;

function timingSafeStringEq(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function normalizePhone(p) {
  /* Egyptian normalization: +20.. → 20.., 01... → 201..., spaces stripped */
  let s = String(p || "").replace(/[^0-9+]/g, "");
  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("0")) s = "20" + s.slice(1);
  else if (s.startsWith("1") && s.length === 10) s = "20" + s;
  return s;
}

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  /* Internal-secret auth, same pattern as send-internal */
  const provided = req.headers["x-clark-internal"];
  const expected = process.env.CLARK_INTERNAL_SECRET;
  if (!expected) {
    return res.status(503).json({ ok: false, error: "CLARK_INTERNAL_SECRET غير معرّفة" });
  }
  if (!provided || typeof provided !== "string" || !timingSafeStringEq(provided, expected)) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  } catch (_) {
    return res.status(400).json({ ok: false, error: "JSON body غير صالح" });
  }

  const title = String(body.title || "").trim().slice(0, 200);
  const bodyText = String(body.body || "").trim().slice(0, 500);
  if (!title) return res.status(400).json({ ok: false, error: "title مطلوب" });

  /* ─── Resolve recipient phone ─── */
  let phone = body.phone ? normalizePhone(body.phone) : "";
  if (!phone && (body.userId || body.userEmail)) {
    /* Look up phone from factory/config.usersList */
    try {
      const cfgSnap = await getDb().collection("factory").doc("config").get();
      const cfg = cfgSnap.exists ? (cfgSnap.data() || {}) : {};
      const usersList = Array.isArray(cfg.usersList) ? cfg.usersList : [];
      const u = usersList.find(x =>
        (body.userId && x.uid === body.userId) ||
        (body.userEmail && String(x.email || "").toLowerCase() === String(body.userEmail).toLowerCase())
      );
      if (u && u.phone) phone = normalizePhone(u.phone);
    } catch (_) { /* ignore */ }
  }

  if (!phone) {
    return res.status(400).json({ ok: false, error: "phone أو userId/userEmail مطلوب" });
  }

  /* ─── Build the message ─── */
  /* Use a clear "via CLARK" prefix so the user knows it's a system message */
  const waMessage = "*CLARK — " + title + "*\n\n" + (bodyText || "");

  /* ─── Call the Bridge ─── */
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BRIDGE_TIMEOUT_MS);
  try {
    const bridgeRes = await fetch(BRIDGE_URL + "/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone,
        message: waMessage,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!bridgeRes.ok) {
      const errText = await bridgeRes.text().catch(() => "");
      return res.status(502).json({
        ok: false,
        error: "Bridge returned " + bridgeRes.status,
        bridgeError: errText.slice(0, 500),
      });
    }

    /* Log to history for audit */
    try {
      await getDb().collection("notificationHistory").add({
        at: new Date().toISOString(),
        category: body.category || "warnings",
        title,
        body: bodyText,
        data: body.data || {},
        audience: { mode: "whatsapp_fallback", phone, userId: body.userId, userEmail: body.userEmail },
        sentBy: { source: "whatsapp-fallback" },
        stats: { targeted: 1, successCount: 1, failureCount: 0 },
        sentVia: "whatsapp",
      });
    } catch (_) { /* best effort */ }

    return res.status(200).json({ ok: true, phone, sentVia: "whatsapp" });
  } catch (e) {
    clearTimeout(timeoutId);
    const isTimeout = e?.name === "AbortError";
    return res.status(isTimeout ? 504 : 502).json({
      ok: false,
      error: isTimeout ? "Bridge timeout" : "Bridge error: " + (e?.message || String(e)),
    });
  }
}
