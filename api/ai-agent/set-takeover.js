/* ════════════════════════════════════════════════════════════════════════
   AI AGENT — Set manual-takeover state   (V21.9.235)
   ════════════════════════════════════════════════════════════════════════
   POST { wid, active, phone?, customerName?, customerId? }   (admin/manager)
     active=true  → grab the conversation (agent goes silent for this wid)
     active=false → resume the agent

   Writes aiAgentTakeovers/{takeoverDocId(wid)} via the Admin SDK (bypasses
   firestore.rules, so the client never needs write access). Returns the
   resulting takeover doc so the caller can update its UI optimistically even
   if its live listener isn't permitted yet (rules not deployed).
   ════════════════════════════════════════════════════════════════════════ */
import { setCors, getDb, verifyAdminToken } from "../_firebase.js";
import { takeoverDocId } from "./_takeover.js";

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ ok: false, error: "POST only" }); return; }

  const auth = await verifyAdminToken(req.headers.authorization);
  if (!auth.ok) { res.status(auth.status).json({ ok: false, error: auth.error }); return; }

  let body = {};
  try { body = (typeof req.body === "string") ? JSON.parse(req.body || "{}") : (req.body || {}); }
  catch { res.status(400).json({ ok: false, error: "bad json" }); return; }

  const wid = String(body.wid || "").trim();
  if (!wid) { res.status(400).json({ ok: false, error: "wid مطلوب" }); return; }
  const active = body.active === true;

  const db = getDb();
  const nowISO = new Date().toISOString();
  const ref = db.collection("aiAgentTakeovers").doc(takeoverDocId(wid));

  /* Merge so we don't clobber takenOverAt when toggling. */
  const patch = {
    wid,
    phone: String(body.phone || ""),
    customerName: String(body.customerName || ""),
    customerId: String(body.customerId || ""),
    active,
    updatedAt: nowISO,
  };
  if (active) {
    patch.takenOverBy = auth.email || "";
    patch.takenOverAt = nowISO;
    patch.lastAdminReplyAt = nowISO; /* start the idle timer from the grab */
    patch.resumedAt = null;
    patch.resumedBy = null;
  } else {
    patch.resumedBy = auth.email || "";
    patch.resumedAt = nowISO;
  }

  try {
    await ref.set(patch, { merge: true });
  } catch (e) {
    console.error("[ai-agent/set-takeover] write failed:", e?.message || e);
    res.status(500).json({ ok: false, error: "فشل حفظ حالة التدخّل: " + (e?.message || e) });
    return;
  }

  let takeover = { id: ref.id, ...patch };
  try { const snap = await ref.get(); if (snap.exists) takeover = { id: ref.id, ...(snap.data() || {}) }; }
  catch (_) { /* return the patch we just wrote */ }

  res.status(200).json({ ok: true, takeover });
}
