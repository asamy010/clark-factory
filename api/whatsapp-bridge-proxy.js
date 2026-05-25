/* ═══════════════════════════════════════════════════════════════════════
   CLARK · /api/whatsapp-bridge-proxy (V21.9.183)
   ───────────────────────────────────────────────────────────────────────
   Server-side proxy for the clark-wa-bridge service. Closes the V21.9.55
   security debt: previously the client read `cfg.campaignBridge.token`
   from factory/config and sent it directly to the bridge in an
   `Authorization: Bearer <token>` header. Anyone who could read
   factory/config could exfiltrate the token from DevTools and impersonate
   the campaign sender.

   With the proxy:
     • Client sends ONLY a Firebase ID token (admin/manager auth).
     • Server reads the bridge URL + token from EITHER a Vercel env var
       (preferred) or from cfg.campaignBridge as a fallback.
     • Server forwards the request to the bridge with the stored token.
     • Token is never exposed to the browser.

   The endpoint is intentionally GENERIC — it accepts {path, method, body,
   query} and forwards to the matching bridge route. Only paths in
   ALLOWED_PATHS are honored (defense-in-depth against open relay).

   Request shape (POST /api/whatsapp-bridge-proxy):
     Headers: Authorization: Bearer <firebase-id-token>
     Body: {
       path: "/status" | "/queue" | "/send" | ... (must be in ALLOWED_PATHS),
       method: "GET" | "POST"           (default "GET"),
       body?: <object>                  (forwarded as JSON body if present),
       query?: <object of string>       (appended as query string),
     }

   Response: status + body proxied 1:1 from the bridge.
   Timeouts: 8 seconds (CLAUDE.md §10 anti-pattern: AbortController with
   timeout < Vercel function-kill window).
   ═══════════════════════════════════════════════════════════════════════ */

import { setCors, verifyAdminToken, getDb } from "./_firebase.js";

/* Bridge routes the client may invoke. Order = readability; lookup is O(1). */
const ALLOWED_PATHS = new Set([
  "/status",
  "/queue",
  "/send",
  "/pause",
  "/resume",
  "/stop",
  "/clear",
  "/optouts",
  "/activity",
  "/reset-daily",
  "/stats",
]);

/* Read the bridge URL+token from env first (preferred for hardening), with
   fallback to factory/config.campaignBridge for backward compat. Once admins
   set both env vars, they can blank cfg.campaignBridge.token and the client
   will keep working without ever seeing the secret. */
async function readBridgeSecret() {
  const envUrl = (process.env.WHATSAPP_BRIDGE_URL || "").trim();
  const envToken = (process.env.WHATSAPP_BRIDGE_TOKEN || "").trim();
  if (envUrl && envToken) {
    return { url: envUrl, token: envToken, source: "env" };
  }
  /* Fallback: Firestore */
  const cfgSnap = await getDb().collection("factory").doc("config").get();
  const cfg = cfgSnap.exists ? (cfgSnap.data() || {}) : {};
  const b = cfg.campaignBridge || {};
  return {
    url: (b.url || envUrl || "").trim(),
    token: (b.token || envToken || "").trim(),
    source: (b.url || b.token) ? "config" : "missing",
  };
}

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST only" });
  }

  /* 1. Auth — admin/manager only (same as verifyAdminToken policy). */
  const auth = await verifyAdminToken(req.headers.authorization);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  /* 2. Parse body. */
  let body;
  try {
    body = (typeof req.body === "string") ? JSON.parse(req.body) : (req.body || {});
  } catch (e) {
    return res.status(400).json({ ok: false, error: "Invalid JSON body" });
  }

  const path = String(body.path || "").trim();
  const method = String(body.method || "GET").toUpperCase();
  const upstreamBody = body.body;
  const query = body.query;

  /* 3. Path whitelist (drop any query string for the check). */
  const cleanPath = path.split("?")[0];
  if (!ALLOWED_PATHS.has(cleanPath)) {
    return res.status(400).json({
      ok: false,
      error: "path غير مسموح: " + cleanPath,
    });
  }
  if (method !== "GET" && method !== "POST") {
    return res.status(400).json({ ok: false, error: "method لازم تكون GET أو POST" });
  }

  /* 4. Read bridge URL+token from env or config. */
  let secret;
  try {
    secret = await readBridgeSecret();
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: "تعذر قراءة إعدادات الـ Bridge: " + (e.message || e),
    });
  }
  if (!secret.url) {
    return res.status(400).json({ ok: false, error: "Bridge URL غير مُعدّ — افتح Settings → CampaignBridge" });
  }

  /* 5. Build final URL with optional query string. */
  let finalPath = cleanPath;
  if (query && typeof query === "object") {
    const qs = new URLSearchParams();
    for (const k of Object.keys(query)) {
      const v = query[k];
      if (v != null) qs.append(k, String(v));
    }
    const qstr = qs.toString();
    if (qstr) finalPath += "?" + qstr;
  }
  const upstreamUrl = secret.url.replace(/\/+$/, "") + finalPath;

  /* 6. Forward with timeout < Vercel function-kill window. */
  const ctrl = new AbortController();
  const TIMEOUT_MS = 8000;
  const tk = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const headers = {};
    if (upstreamBody) headers["Content-Type"] = "application/json";
    if (secret.token) headers["Authorization"] = "Bearer " + secret.token;

    const upstream = await fetch(upstreamUrl, {
      method,
      headers,
      body: upstreamBody ? JSON.stringify(upstreamBody) : undefined,
      signal: ctrl.signal,
    });
    clearTimeout(tk);

    /* Pass through status + body. Try JSON first; fall back to raw text. */
    const text = await upstream.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch (_) {
      payload = { raw: text };
    }
    /* Append proxy meta for debugging (not sensitive). */
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      payload._proxy = { source: secret.source, path: cleanPath };
    }
    return res.status(upstream.status).json(payload);
  } catch (e) {
    clearTimeout(tk);
    if (e && e.name === "AbortError") {
      return res.status(504).json({
        ok: false,
        error: "Bridge timeout (" + TIMEOUT_MS + "ms) — الـ bridge مش راد",
      });
    }
    return res.status(502).json({
      ok: false,
      error: "فشل الاتصال بـ Bridge: " + (e.message || String(e)),
    });
  }
}
