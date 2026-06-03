/* ════════════════════════════════════════════════════════════════════════
   AI AGENT — Incoming WhatsApp webhook receiver  (Slice 1 / V21.9.225)
   ════════════════════════════════════════════════════════════════════════
   The Contabo WhatsApp bridge POSTs every INCOMING customer message here.
   This is the FOUNDATION slice: it only AUTHENTICATES + LOGS the message
   into `aiAgentConversations` (one doc per turn — matches the shape the
   CLARK Logs tab already reads). It does NOT call Claude and does NOT reply
   to the customer yet (that starts in a later slice, gated by testMode).
   So shipping this is SAFE: customers see no behavior change; the admin just
   starts SEEING incoming messages live in CLARK → AI Agent → Logs.

   Security: HMAC-SHA256 signature over `${ts}|${from}|${body}` using the
   shared WEBHOOK_SECRET (set on BOTH the bridge and Vercel env). Fail-closed:
   if the secret isn't configured, the endpoint refuses everything. Replay
   guard: timestamp must be within 5 minutes.

   Writes via the Admin SDK (getDb) → bypasses firestore.rules, so NO rules
   change is needed for this slice. The Logs tab reads aiAgentConversations
   with the existing isManagerPlus read rule.
   ════════════════════════════════════════════════════════════════════════ */
import crypto from "crypto";
import { getDb } from "../_firebase.js";
import { normalizePhoneCanonical } from "../shopify/_customers.js";
import { findCustomerByPhone } from "./_customerLookup.js";
import { processTurn } from "./_processTurn.js";
import { sendViaBridge } from "./_bridge.js";

const FIVE_MIN_MS = 5 * 60 * 1000;
const MAX_MSG_LEN = 4000;

/* timing-safe hex compare (guards against length-based + timing leaks) */
function safeEqualHex(a, b) {
  const ba = Buffer.from(String(a || ""), "utf8");
  const bb = Buffer.from(String(b || ""), "utf8");
  if (ba.length !== bb.length) return false;
  try { return crypto.timingSafeEqual(ba, bb); } catch { return false; }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "POST only" });
    return;
  }

  /* Fail-closed: no secret configured → refuse (prevents an open endpoint) */
  const secret = (process.env.WEBHOOK_SECRET || "").trim();
  if (!secret) {
    console.error("[ai-agent/incoming] WEBHOOK_SECRET not set — refusing");
    res.status(503).json({ ok: false, error: "agent not configured" });
    return;
  }

  /* Body may arrive parsed (object) or raw (string) depending on runtime */
  let payload = {};
  try {
    payload = (typeof req.body === "string") ? JSON.parse(req.body || "{}") : (req.body || {});
  } catch {
    res.status(400).json({ ok: false, error: "bad json" });
    return;
  }

  const { wid, from, body: text, ts, type } = payload;
  const ftext = String(text || "");

  /* HMAC verify over the exact fields the bridge signed */
  const sig = String(req.headers["x-clark-sig"] || "");
  const expected = crypto.createHmac("sha256", secret).update(`${ts}|${from}|${ftext}`).digest("hex");
  if (!sig || !safeEqualHex(sig, expected)) {
    res.status(401).json({ ok: false, error: "bad signature" });
    return;
  }

  /* Replay guard — timestamp must be fresh */
  const tsNum = Number(ts) || 0;
  if (!tsNum || Math.abs(Date.now() - tsNum) > FIVE_MIN_MS) {
    res.status(401).json({ ok: false, error: "stale timestamp" });
    return;
  }

  /* Only individual customer chats (@c.us) or LID (@lid). Skip groups /
     broadcast / status — the agent never engages those. */
  const rawId = String(from || wid || "");
  if (!/@c\.us$|@lid$/.test(rawId)) {
    res.status(200).json({ ok: true, ignored: "non-individual chat" });
    return;
  }

  const messageText = ftext.trim().slice(0, MAX_MSG_LEN);
  if (!messageText) {
    res.status(200).json({ ok: true, ignored: "empty body" });
    return;
  }

  const isLid = rawId.includes("@lid");
  const phone = isLid ? "" : normalizePhoneCanonical(rawId.split("@")[0]);

  /* V21.9.226 (Slice 2-3): recognize the customer by phone (cached lookup).
     LID senders have no phone → stay unrecognized until mapped. */
  let customerName = "", customerId = "", customerType = "";
  if (phone) {
    try {
      const c = await findCustomerByPhone(phone);
      if (c) { customerName = c.name || ""; customerId = c.id || ""; customerType = c.type || ""; }
    } catch (e) { console.warn("[ai-agent/incoming] customer lookup failed:", e?.message || e); }
  }

  /* ── V21.9.227 (Slice 4): gate → reply → send → log ──
     INERT by default. The reply path fires ONLY when the agent is enabled AND
     (testMode off OR the sender is whitelisted). So shipping this changes
     nothing for customers until the admin explicitly enables + whitelists. */
  const db = getDb();
  const nowISO = new Date().toISOString();
  const baseTurn = {
    wid: rawId, phone, isLid, at: nowISO,
    userMessage: messageText,
    customerName, customerId, customerType,
    msgType: String(type || "chat"),
    source: "whatsapp-bridge",
    createdAt: nowISO,
  };

  /* Agent config + bridge creds (admin SDK read of factory/config) */
  let agent = {}, bridge = {};
  try {
    const snap = await db.doc("factory/config").get();
    const cfg = snap.exists ? (snap.data() || {}) : {};
    agent = cfg.aiAgent || {};
    bridge = cfg.campaignBridge || {};
  } catch (e) {
    console.error("[ai-agent/incoming] config read failed:", e?.message || e);
  }

  /* Eligibility (soft-launch gate) */
  const tm = agent.testMode || {};
  const inWhitelist = Array.isArray(tm.whitelist) && tm.whitelist.some((w) =>
    w && (w.wid === rawId ||
      (phone && normalizePhoneCanonical(String(w.wid || "").split("@")[0]) === phone)));
  let skipReason = null;
  if (agent.enabled !== true)               skipReason = "الأيجنت متوقّف (enabled=false)";
  else if (agent.schedule?.mode === "off")  skipReason = "الجدول = إيقاف";
  else if (tm.enabled && !inWhitelist)      skipReason = "خارج قائمة التجربة (testMode)";
  else if (!phone)                          skipReason = "LID بدون رقم — محتاج ربط";

  if (skipReason) {
    try {
      await db.collection("aiAgentConversations").add({
        ...baseTurn, assistantReply: "", skipped: true, skippedReason: skipReason, ingestOnly: true,
      });
    } catch (e) { console.error("[ai-agent/incoming] skip-log failed:", e?.message || e); }
    res.status(200).json({ ok: true, skipped: skipReason });
    return;
  }

  /* Eligible → generate a reply with Claude */
  const tStart = Date.now();
  let reply = "", usage = null, model = "", errMsg = null;
  try {
    const out = await processTurn({
      systemPrompt: agent.personality?.systemPrompt || "",
      customer: customerName ? { name: customerName, type: customerType } : null,
      userMessage: messageText,
    });
    reply = out.reply || ""; usage = out.usage; model = out.model;
  } catch (e) {
    errMsg = e?.message || String(e);
    console.error("[ai-agent/incoming] processTurn failed:", errMsg);
  }

  /* Send the reply to the customer via the existing bridge /send */
  let sent = false, sendErr = null;
  if (reply && !errMsg) {
    const bUrl = (bridge.url || process.env.WHATSAPP_BRIDGE_URL || "").trim();
    const bTok = (bridge.token || process.env.WHATSAPP_BRIDGE_TOKEN || "").trim();
    if (!bUrl) sendErr = "bridge URL not configured";
    else {
      try { await sendViaBridge(bUrl, bTok, phone, reply, customerName); sent = true; }
      catch (e) { sendErr = e?.message || String(e); console.error("[ai-agent/incoming] sendViaBridge failed:", sendErr); }
    }
  }

  /* Log the turn (reply + meta) — webhook always returns 200 so the bridge
     doesn't retry-storm; failures are recorded on the turn for the admin. */
  try {
    await db.collection("aiAgentConversations").add({
      ...baseTurn,
      assistantReply: reply,
      model: model || null,
      usage,
      durationMs: Date.now() - tStart,
      iterations: 1,
      sent,
      error: errMsg || sendErr || null,
      skipped: false,
    });
  } catch (e) { console.error("[ai-agent/incoming] turn-log failed:", e?.message || e); }

  res.status(200).json({ ok: true, replied: sent, error: errMsg || sendErr || null });
}
