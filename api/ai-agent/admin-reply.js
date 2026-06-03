/* ════════════════════════════════════════════════════════════════════════
   AI AGENT — Admin manual reply (during takeover)   (V21.9.235)
   ════════════════════════════════════════════════════════════════════════
   POST { wid, message, phone?, customerName?, customerId? }   (admin/manager)

   Sends the admin's hand-typed reply to the customer through the same bridge
   the agent uses, logs it as a turn in aiAgentConversations (admin_takeover:
   true, so LogsTab renders it as a human reply, NOT an agent reply), and
   refreshes the takeover (active + restart the idle auto-resume timer). If the
   wid wasn't taken over yet, sending a manual reply grabs it automatically —
   you can't hand-reply while the agent is also free to answer.

   Bridge creds: config.campaignBridge first, then env fallback (same
   precedence as incoming.js). The webhook itself returns 200-on-skip, but THIS
   endpoint surfaces send failures (502) so the admin knows the message didn't
   go out.
   ════════════════════════════════════════════════════════════════════════ */
import { setCors, getDb, verifyAdminToken } from "../_firebase.js";
import { normalizePhoneCanonical } from "../shopify/_customers.js";
import { sendViaBridge } from "./_bridge.js";
import { takeoverDocId } from "./_takeover.js";

const MAX_MSG_LEN = 4000;

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
  const message = String(body.message || "").trim().slice(0, MAX_MSG_LEN);
  if (!wid) { res.status(400).json({ ok: false, error: "wid مطلوب" }); return; }
  if (!message) { res.status(400).json({ ok: false, error: "الرسالة فاضية" }); return; }

  /* Resolve the phone: prefer the explicit one, else derive from a @c.us wid.
     LID senders have no phone → can't be messaged via the bridge. */
  let phone = String(body.phone || "").trim();
  if (!phone && /@c\.us$/.test(wid)) phone = normalizePhoneCanonical(wid.split("@")[0]);
  if (!phone) {
    res.status(400).json({ ok: false, error: "مفيش رقم للعميل (LID) — مينفعش نبعتله رسالة من هنا" });
    return;
  }

  const db = getDb();
  const nowISO = new Date().toISOString();
  const customerName = String(body.customerName || "");
  const customerId = String(body.customerId || "");

  /* Bridge creds — config first, then env fallback (mirrors incoming.js). */
  let bridge = {};
  try {
    const snap = await db.doc("factory/config").get();
    bridge = (snap.exists ? (snap.data() || {}).campaignBridge : {}) || {};
  } catch (e) { console.warn("[ai-agent/admin-reply] config read failed:", e?.message || e); }
  const bUrl = (bridge.url || process.env.WHATSAPP_BRIDGE_URL || "").trim();
  const bTok = (bridge.token || process.env.WHATSAPP_BRIDGE_TOKEN || "").trim();
  if (!bUrl) { res.status(502).json({ ok: false, error: "الجسر مش متظبط (campaignBridge.url)" }); return; }

  /* Send to the customer. */
  let sent = false, sendErr = null;
  try { await sendViaBridge(bUrl, bTok, phone, message, customerName); sent = true; }
  catch (e) { sendErr = e?.message || String(e); console.error("[ai-agent/admin-reply] send failed:", sendErr); }

  /* Log the turn (admin_takeover so the UI shows a human reply). Best-effort —
     a failed log shouldn't change the HTTP result the admin sees. */
  try {
    await db.collection("aiAgentConversations").add({
      wid, phone, isLid: /@lid$/.test(wid), at: nowISO,
      userMessage: "", assistantReply: message,
      customerName, customerId,
      admin_takeover: true, adminBy: auth.email || "",
      sent, error: sendErr || null,
      skipped: false, source: "admin-takeover", createdAt: nowISO,
    });
  } catch (e) { console.error("[ai-agent/admin-reply] turn-log failed:", e?.message || e); }

  /* Refresh/auto-grab the takeover + restart the idle timer. Only stamp
     takenOverAt/By when it wasn't already an active takeover (so we record the
     true grab time, not every reply). */
  try {
    const ref = db.collection("aiAgentTakeovers").doc(takeoverDocId(wid));
    let alreadyActive = false;
    try { const ts = await ref.get(); alreadyActive = ts.exists && (ts.data() || {}).active === true; } catch (_) {}
    const patch = {
      wid, phone, customerName, customerId,
      active: true, lastAdminReplyAt: nowISO, updatedAt: nowISO,
      resumedAt: null, resumedBy: null,
    };
    if (!alreadyActive) { patch.takenOverBy = auth.email || ""; patch.takenOverAt = nowISO; }
    await ref.set(patch, { merge: true });
  } catch (e) { console.warn("[ai-agent/admin-reply] takeover refresh failed:", e?.message || e); }

  if (!sent) { res.status(502).json({ ok: false, error: "فشل إرسال الرسالة للعميل: " + (sendErr || "غير معروف") }); return; }
  res.status(200).json({ ok: true, sent: true, at: nowISO });
}
