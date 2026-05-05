/* ═══════════════════════════════════════════════════════════════════════
   CLARK Automation · Event Trigger Endpoint (V19.70)
   ───────────────────────────────────────────────────────────────────────
   POST /api/event-trigger
   Body: { eventType, payload, customerPhone?, idempotencyKey, force? }
   Header: Authorization: Bearer <Firebase-admin-token OR cron-secret>

   Thin HTTP wrapper around processEvent() in _eventProcessor.js.
   The shared processor is also used by automation-tick.js (cron-detected
   events + pending drain).

   See _eventProcessor.js for the full behavior contract.
   ═══════════════════════════════════════════════════════════════════════ */

import { getDb, verifyAdminToken } from "./_firebase.js";
import { processEvent } from "./_eventProcessor.js";

async function checkAuth(req){
  const auth = req.headers.authorization || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return { ok: false, status: 401, error: "Authorization header missing" };
  const token = m[1].trim();
  if (!token) return { ok: false, status: 401, error: "Empty token" };

  const expected = (process.env.AUTOMATION_TICK_SECRET || "").trim();
  if (expected && token === expected) return { ok: true, source: "cron" };

  try {
    const r = await verifyAdminToken(token);
    if (r.ok) return { ok: true, source: "manual-admin", uid: r.uid, email: r.email };
  } catch (_) { /* fall through */ }

  return { ok: false, status: 401, error: "Unauthorized" };
}

export default async function handler(req, res){
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

  const auth = await checkAuth(req);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

  const body = req.body || {};
  const sourceLabel = auth.source === "cron"
    ? "cron"
    : (body.force ? "manual" : "client");

  try {
    const db = getDb();
    const result = await processEvent(db, {
      eventType: body.eventType,
      payload: body.payload,
      customerPhone: body.customerPhone,
      idempotencyKey: body.idempotencyKey,
      force: !!body.force,
      source: sourceLabel,
    });
    return res.status(result.status).json(result.body);
  } catch (e) {
    return res.status(503).json({ ok: false, error: e.message || String(e) });
  }
}
