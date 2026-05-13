/* ═══════════════════════════════════════════════════════════════
   CLARK — AI proxy endpoint (V19.64 hardened)
   ═══════════════════════════════════════════════════════════════
   POST /api/ai
   Body: { idToken: string (Firebase), system?: string, messages: array }

   V19.64 SECURITY HARDENING:
   Pre-V19.64 this endpoint had:
     - No auth (anyone on the internet could hit it)
     - No CORS restriction (`*`)
     - No rate limit (cost abuse — any user could spend all the project's
       Anthropic budget by calling in a loop)
     - No body-size cap
     - Attacker-controlled `system` prompt (prompt-injection / system prompt
       exfiltration)

   New behavior:
     - Require valid Firebase ID token (any authed user)
     - Per-UID rate limit: 30 requests / 5 minutes (in-memory, best-effort)
     - Body size cap: messages stringified must be < 50KB
     - System prompt restricted to a server-controlled value when
       AI_SYSTEM_PROMPT env var is set; otherwise client `system` is allowed
       but capped at 4KB (so injection still possible — it's a feature for
       admins building tools, not a 100% block — but cost-bound)

   The right long-term fix is to provision a separate Anthropic key per
   role + log all calls to a moderation table. For now this stops the
   wide-open exposure. */

import admin from "firebase-admin";

let _app = null;
function getApp() {
  if (_app) return _app;
  if (admin.apps.length > 0) { _app = admin.apps[0]; return _app; }
  const raw = process.env.FIREBASE_ADMIN_CREDENTIALS;
  if (!raw) throw new Error("FIREBASE_ADMIN_CREDENTIALS not set");
  const creds = typeof raw === "string" ? JSON.parse(raw) : raw;
  _app = admin.initializeApp({ credential: admin.credential.cert(creds) });
  return _app;
}

/* In-memory rate limit (best-effort across one Vercel function instance) */
const _rateMap = new Map();/* uid → { count, windowStart } */
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 5 * 60 * 1000;

function checkRateLimit(uid) {
  const now = Date.now();
  const entry = _rateMap.get(uid);
  if (!entry || (now - entry.windowStart) > RATE_WINDOW_MS) {
    _rateMap.set(uid, { count: 1, windowStart: now });
    return { ok: true };
  }
  if (entry.count >= RATE_LIMIT) {
    const retryAfter = Math.ceil((RATE_WINDOW_MS - (now - entry.windowStart)) / 1000);
    return { ok: false, retryAfter };
  }
  entry.count++;
  return { ok: true };
}

const MAX_MESSAGES_BYTES = 50 * 1024;
const MAX_SYSTEM_BYTES = 4 * 1024;

export default async function handler(req, res) {
  /* V19.64: tighter CORS (origin allowlist via env if provided) */
  const allowedOrigin = process.env.AI_ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: { message: "POST only" } });

  /* Auth: require Firebase ID token (any authed user). V19.64. */
  let uid;
  try {
    const authHeader = req.headers.authorization || "";
    const bodyToken = (req.body && req.body.idToken) || "";
    const raw = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : (bodyToken || "").trim();
    if (!raw) return res.status(401).json({ error: { message: "Authentication required" } });
    const decoded = await getApp().auth().verifyIdToken(raw);
    uid = decoded.uid;
    if (!uid) return res.status(401).json({ error: { message: "Invalid token" } });
  } catch (e) {
    return res.status(401).json({ error: { message: "Invalid or expired token" } });
  }

  /* Rate limit per UID */
  const rate = checkRateLimit(uid);
  if (!rate.ok) {
    res.setHeader("Retry-After", String(rate.retryAfter));
    return res.status(429).json({ error: { message: "Too many requests — حاول بعد " + rate.retryAfter + " ثانية" } });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: { message: "ANTHROPIC_API_KEY not set in Vercel Environment Variables" } });

  try {
    const { system: clientSystem, messages } = req.body || {};

    /* Body-size guards */
    const messagesStr = JSON.stringify(messages || []);
    if (messagesStr.length > MAX_MESSAGES_BYTES) {
      return res.status(413).json({ error: { message: "Request body too large (>50KB messages)" } });
    }
    const clientSystemStr = String(clientSystem || "");
    if (clientSystemStr.length > MAX_SYSTEM_BYTES) {
      return res.status(413).json({ error: { message: "System prompt too large (>4KB)" } });
    }

    /* If server has a fixed system prompt, prefer it (prevents client-side injection
       on the most sensitive use cases). Otherwise allow the client's. */
    const system = process.env.AI_SYSTEM_PROMPT || clientSystemStr;

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system,
        messages: messages || []
      })
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: { message: data.error?.message || "API error: " + r.status } });
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: { message: e.message } });
  }
}
