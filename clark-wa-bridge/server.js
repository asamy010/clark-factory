/* ═══════════════════════════════════════════════════════════════════
   CLARK WhatsApp Bridge — V1.0 (CLARK V19.28)
   ───────────────────────────────────────────────────────────────────
   This is a local Node.js server that runs whatsapp-web.js via
   Puppeteer to send messages on behalf of CLARK's Campaign Engine.

   ⚠️ DISCLAIMER: This violates WhatsApp's Terms of Service. The
   phone number used MAY GET BANNED by WhatsApp. Use a secondary
   number, never your personal one. Use small batches with delays.

   USAGE:
     1. Install: npm install
     2. Run:    npm start
     3. Open:   http://localhost:3001 (scan QR with phone)
     4. In CLARK Settings → enable "Bridge Mode" + URL = http://localhost:3001

   FEATURES:
     • QR-based linking (scan once, persists in .wwebjs_auth/)
     • Queue-based sending with random delays (anti-ban)
     • Daily cap enforced server-side
     • Pause / Resume / Stop
     • Live progress via /status polling
     • Automatic batch breaks (every N messages, pause M minutes)
     • Number normalization (Egyptian +20 prefix)
     • Failed-send retry (1 retry per number)
     • Opt-out detection (saved STOP/UNSUBSCRIBE replies)
     • Health endpoint for CLARK to verify connection
═══════════════════════════════════════════════════════════════════ */

const express = require("express");
const cors = require("cors");
const qrcode = require("qrcode");
const fs = require("fs");
const path = require("path");
const { Client, LocalAuth } = require("whatsapp-web.js");

const PORT = process.env.PORT || 3001;
/* V19.30: Optional auth token. If AUTH_TOKEN env var is set, all requests
   (except / and /status) require Authorization: Bearer <token>.
   If unset, the bridge runs in open mode (only safe for localhost). */
const AUTH_TOKEN = (process.env.AUTH_TOKEN || "").trim();
const STATE_FILE = path.join(__dirname, ".bridge-state.json");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

/* V19.30: Auth middleware — runs before any /send /pause etc.
   Skipped for: GET / (status page), GET /status (health check). */
app.use((req, res, next) => {
  if (!AUTH_TOKEN) return next(); /* No token configured = open mode */
  /* Allow status page + health check without token (so the public page works) */
  if (req.method === "GET" && (req.path === "/" || req.path === "/status")) return next();
  const auth = req.headers.authorization || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match || match[1].trim() !== AUTH_TOKEN) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  next();
});

/* ──────────────────────────────────────────────────────────────────
   GLOBAL STATE
   ────────────────────────────────────────────────────────────────── */
let waClient = null;
let waReady = false;
let waState = "INIT"; /* INIT | QR | AUTHENTICATING | READY | DISCONNECTED */
let lastQR = "";
let lastQRDataURL = "";
let myNumber = "";
let myName = "";

/* Queue */
let queue = []; /* [{id, phone, message, status, attempts, error, sentAt, mediaBase64?, mediaName?, mediaMime?}] */
let queueRunning = false;
let queuePaused = false;
let queueAbort = false;

/* Settings (configurable via /settings endpoint) */
let settings = {
  delayMin: 8000,        /* min ms between messages */
  delayMax: 25000,       /* max ms */
  dailyCap: 80,          /* max sends per day */
  batchSize: 20,         /* messages between long breaks */
  batchBreakMin: 4 * 60 * 1000,   /* break duration min (ms) — 4 min */
  batchBreakMax: 8 * 60 * 1000,   /* break duration max (ms) — 8 min */
  typingDelayMin: 2000,  /* simulate typing 2-5 sec */
  typingDelayMax: 5000,
  retryFailures: true,   /* retry once after delay if a send fails */
  detectOptOuts: true,   /* listen for STOP/UNSUBSCRIBE replies */
};

/* Persistent counters */
let dailyCounter = { date: new Date().toISOString().slice(0, 10), sent: 0 };
let optOuts = []; /* numbers that replied STOP */
let stats = { totalSent: 0, totalFailed: 0, sessionStart: Date.now() };
/* V19.31: Activity log — last 100 send attempts */
let activityLog = []; /* [{phone, customerName, status, timestamp, error?, durationMs?}] */
const ACTIVITY_LOG_MAX = 100;

function addActivity(entry){
  activityLog.unshift({...entry, timestamp: new Date().toISOString()});
  if(activityLog.length > ACTIVITY_LOG_MAX) activityLog = activityLog.slice(0, ACTIVITY_LOG_MAX);
}

/* ──────────────────────────────────────────────────────────────────
   V19.35: Media URL cache
   ──────────────────────────────────────────────────────────────────
   CLARK now ships media references as URLs (Firebase Storage) instead
   of inline base64 — keeping the Firestore document tiny.

   The same template image is typically sent to every recipient in a
   campaign (50+ messages). Without caching, we'd re-download the same
   image dozens of times. This in-memory LRU caches the decoded base64
   for an hour; entries are evicted on size cap to bound memory.
   ────────────────────────────────────────────────────────────────── */
const MEDIA_CACHE_TTL_MS = 60 * 60 * 1000; /* 1 hour */
const MEDIA_CACHE_MAX_ENTRIES = 50;
const mediaCache = new Map(); /* url -> {data: base64, mime, expiresAt} */

async function fetchMediaToBase64(url){
  if(!url || typeof url !== "string") throw new Error("invalid media url");
  const now = Date.now();
  const cached = mediaCache.get(url);
  if(cached && cached.expiresAt > now){
    /* Refresh LRU position */
    mediaCache.delete(url);
    mediaCache.set(url, cached);
    return cached;
  }
  const resp = await fetch(url);
  if(!resp.ok) throw new Error(`media fetch failed: HTTP ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  const data = buf.toString("base64");
  /* Prefer the response's content-type when present (Firebase Storage
     returns the original mime); fall back to image/jpeg. */
  const mime = (resp.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
  const entry = { data, mime, expiresAt: now + MEDIA_CACHE_TTL_MS, size: buf.length };
  mediaCache.set(url, entry);
  /* Evict oldest entries when over the size cap. Map iteration order
     is insertion order, so .keys().next() gives us the LRU candidate. */
  while(mediaCache.size > MEDIA_CACHE_MAX_ENTRIES){
    const oldest = mediaCache.keys().next().value;
    if(oldest === undefined) break;
    mediaCache.delete(oldest);
  }
  return entry;
}

/* Load saved state */
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const s = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
      if (s.dailyCounter && s.dailyCounter.date === new Date().toISOString().slice(0, 10)) {
        dailyCounter = s.dailyCounter;
      }
      if (Array.isArray(s.optOuts)) optOuts = s.optOuts;
      if (s.settings) settings = { ...settings, ...s.settings };
      if (s.stats) stats = { ...stats, ...s.stats, sessionStart: Date.now() };
    }
  } catch (e) { console.warn("loadState failed:", e.message); }
}
function saveState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ dailyCounter, optOuts, settings, stats }, null, 2));
  } catch (e) { console.warn("saveState failed:", e.message); }
}
loadState();

/* ──────────────────────────────────────────────────────────────────
   PHONE NUMBER NORMALIZATION (Egyptian-aware)
   ────────────────────────────────────────────────────────────────── */
function normalizePhone(raw) {
  if (!raw) return "";
  let p = String(raw).replace(/\D/g, "");
  if (p.startsWith("00")) p = p.slice(2);
  if (p.startsWith("20")) return p;
  if (p.startsWith("0")) p = p.slice(1);
  /* Egyptian mobile starts with 1 (10/11/12/15) → prefix 20 */
  if (/^1[0-2,5]\d{8}$/.test(p)) return "20" + p;
  return p; /* fallback: assume already international */
}

function formatChatId(phone) {
  return phone + "@c.us";
}

/* ──────────────────────────────────────────────────────────────────
   V19.37: SINGLETON LOCK CLEANUP
   ──────────────────────────────────────────────────────────────────
   When Chromium dies hard (container OOM-kill, force-stop, host reboot),
   it leaves SingletonLock / SingletonCookie / SingletonSocket files in
   the auth profile. On next start Chromium refuses to launch:
     "The profile appears to be in use by another Chromium process".
   This was the V19.36→V19.37 in-the-wild incident. Cleaning these files
   on every startup turns the failure mode into a self-heal: a forced
   shutdown costs at most one extra restart, never an SSH visit.
   ────────────────────────────────────────────────────────────────── */
function cleanupSingletonLocks() {
  const authDir = path.join(__dirname, ".wwebjs_auth");
  if (!fs.existsSync(authDir)) return 0;
  let removed = 0;
  const stack = [authDir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.name.startsWith("Singleton")) {
        try { fs.rmSync(full, { force: true, recursive: true }); removed++; } catch {}
      } else if (e.isDirectory()) {
        stack.push(full);
      }
    }
  }
  return removed;
}

/* ──────────────────────────────────────────────────────────────────
   WHATSAPP CLIENT INIT
   ────────────────────────────────────────────────────────────────── */
function initWhatsApp() {
  if (waClient) {
    try { waClient.destroy(); } catch {}
    waClient = null;
  }
  waReady = false;
  waState = "INIT";

  /* V19.37: Always sweep stale Singleton locks before booting Chromium.
     A no-op if the profile is clean; saves us from "stuck in INIT" otherwise. */
  const swept = cleanupSingletonLocks();
  if (swept > 0) console.log(`[WA] Swept ${swept} stale Singleton lock files`);

  console.log("[WA] Initializing client...");

  waClient = new Client({
    authStrategy: new LocalAuth({ clientId: "clark-bridge", dataPath: path.join(__dirname, ".wwebjs_auth") }),
    puppeteer: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-extensions",
        "--no-first-run",
      ],
    },
  });

  waClient.on("qr", async (qr) => {
    console.log("[WA] QR code received");
    waState = "QR";
    lastQR = qr;
    try { lastQRDataURL = await qrcode.toDataURL(qr); } catch (e) { lastQRDataURL = ""; }
  });

  waClient.on("authenticated", () => {
    console.log("[WA] Authenticated");
    waState = "AUTHENTICATING";
    lastQR = "";
    lastQRDataURL = "";
  });

  waClient.on("ready", async () => {
    waReady = true;
    waState = "READY";
    try {
      const me = waClient.info;
      myNumber = me.wid.user;
      myName = me.pushname || "";
      console.log(`[WA] Ready as ${myName} (${myNumber})`);
    } catch {}
  });

  waClient.on("disconnected", (reason) => {
    console.log("[WA] Disconnected:", reason);
    waReady = false;
    waState = "DISCONNECTED";
    setTimeout(initWhatsApp, 5000);
  });

  waClient.on("auth_failure", (msg) => {
    console.error("[WA] Auth failure:", msg);
    waState = "INIT";
  });

  /* Opt-out detection: listen for STOP/إلغاء/UNSUBSCRIBE replies */
  waClient.on("message", async (msg) => {
    if (!settings.detectOptOuts) return;
    if (msg.fromMe) return;
    const body = (msg.body || "").trim().toUpperCase();
    if (["STOP", "إلغاء", "الغاء", "UNSUBSCRIBE", "إيقاف", "ايقاف"].includes(body)) {
      const phone = msg.from.split("@")[0];
      if (!optOuts.includes(phone)) {
        optOuts.push(phone);
        saveState();
        console.log(`[WA] Opt-out received from ${phone}`);
        try { await msg.reply("تم إلغاء الاشتراك. ✓"); } catch {}
      }
    }
  });

  waClient.initialize().catch((e) => {
    console.error("[WA] Initialize failed:", e.message);
    waState = "INIT";
    setTimeout(initWhatsApp, 10000);
  });
}

initWhatsApp();

/* ──────────────────────────────────────────────────────────────────
   QUEUE PROCESSOR
   ────────────────────────────────────────────────────────────────── */
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function rolloverDailyCounter() {
  const today = new Date().toISOString().slice(0, 10);
  if (dailyCounter.date !== today) {
    dailyCounter = { date: today, sent: 0 };
    saveState();
  }
}

async function processQueue() {
  if (queueRunning) return;
  queueRunning = true;
  console.log(`[Q] Processing queue: ${queue.length} pending`);
  let inBatch = 0;

  while (queue.length > 0 && !queueAbort) {
    /* Pause check */
    while (queuePaused && !queueAbort) {
      await sleep(1000);
    }
    if (queueAbort) break;

    /* Daily cap check */
    rolloverDailyCounter();
    if (dailyCounter.sent >= settings.dailyCap) {
      console.log(`[Q] Daily cap reached (${settings.dailyCap}). Pausing queue.`);
      queuePaused = true;
      continue;
    }

    /* Batch break */
    if (inBatch > 0 && inBatch % settings.batchSize === 0) {
      const breakMs = rand(settings.batchBreakMin, settings.batchBreakMax);
      console.log(`[Q] Batch break: ${Math.round(breakMs / 1000)}s`);
      await sleep(breakMs);
      if (queueAbort) break;
    }

    const item = queue.find((q) => q.status === "pending");
    if (!item) break;

    /* Opt-out check */
    const phoneNorm = normalizePhone(item.phone);
    if (optOuts.includes(phoneNorm)) {
      item.status = "skipped";
      item.error = "Opted out";
      addActivity({phone: phoneNorm, customerName: item.customerName||"", status: "skipped", error: "Opted out", campaignId: item.campaignId});
      console.log(`[Q] Skipped (opted out): ${phoneNorm}`);
      continue;
    }

    /* Send attempt */
    const sendStartedAt = Date.now();
    item.status = "sending";
    item.attempts = (item.attempts || 0) + 1;

    try {
      if (!waReady) throw new Error("WhatsApp not ready");
      const chatId = formatChatId(phoneNorm);

      /* Validate number first */
      const isReg = await waClient.isRegisteredUser(chatId).catch(() => false);
      if (!isReg) throw new Error("Number not on WhatsApp");

      /* Simulate typing */
      const chat = await waClient.getChatById(chatId);
      try { await chat.sendStateTyping(); } catch {}
      await sleep(rand(settings.typingDelayMin, settings.typingDelayMax));

      /* Send */
      /* V19.35: media items can be URL-form (Firebase Storage) or legacy
         base64-form. URLs get fetched-and-cached so a campaign of 50 messages
         hits Storage 1× per image, not 50×.
         Backwards compatible with old mediaBase64/mediaMime single-image fields. */
      const mediaArr = Array.isArray(item.media) && item.media.length > 0
        ? item.media
        : (item.mediaBase64 && item.mediaMime
            ? [{base64: item.mediaBase64, mime: item.mediaMime, name: item.mediaName || "file"}]
            : []);

      if (mediaArr.length > 0) {
        const { MessageMedia } = require("whatsapp-web.js");
        for (let i = 0; i < mediaArr.length; i++) {
          const m = mediaArr[i];
          let b64, mime;
          if (m.url) {
            /* V19.35: fetch from Firebase Storage (or any HTTPS URL) */
            const fetched = await fetchMediaToBase64(m.url);
            b64 = fetched.data;
            mime = m.mime || fetched.mime;
          } else if (m.base64) {
            b64 = m.base64;
            mime = m.mime || "image/jpeg";
          } else {
            console.warn("[Q] media item missing both url and base64, skipping", m);
            continue;
          }
          const media = new MessageMedia(mime, b64, m.name || "file");
          /* Caption (text) goes with the FIRST image only */
          const opts = i === 0 && item.message ? { caption: item.message } : {};
          await waClient.sendMessage(chatId, media, opts);
          /* Short delay between images (1-2 sec) — avoids spam detection */
          if (i < mediaArr.length - 1) await sleep(rand(1000, 2000));
        }
      } else {
        await waClient.sendMessage(chatId, item.message);
      }

      try { await chat.clearState(); } catch {}

      item.status = "sent";
      item.sentAt = new Date().toISOString();
      dailyCounter.sent++;
      stats.totalSent++;
      inBatch++;
      addActivity({phone: phoneNorm, customerName: item.customerName||"", status: "sent", durationMs: Date.now() - sendStartedAt, campaignId: item.campaignId});
      console.log(`[Q] Sent to ${phoneNorm} (${dailyCounter.sent}/${settings.dailyCap})`);
    } catch (e) {
      console.error(`[Q] Send failed for ${phoneNorm}: ${e.message}`);
      item.error = e.message;
      if (settings.retryFailures && item.attempts < 2) {
        item.status = "pending"; /* retry once */
        await sleep(rand(15000, 30000));
        continue;
      }
      item.status = "failed";
      stats.totalFailed++;
      addActivity({phone: phoneNorm, customerName: item.customerName||"", status: "failed", error: e.message, campaignId: item.campaignId});
    }
    saveState();

    /* Random delay between messages */
    const delay = rand(settings.delayMin, settings.delayMax);
    await sleep(delay);
  }

  queueRunning = false;
  queueAbort = false;
  console.log("[Q] Queue idle");
}

/* ──────────────────────────────────────────────────────────────────
   HTTP API
   ────────────────────────────────────────────────────────────────── */

/* Health check + status */
app.get("/status", (req, res) => {
  rolloverDailyCounter();
  /* V19.30: Indicate whether auth is required (so CLARK can warn if missing) */
  const authRequired = !!AUTH_TOKEN;
  res.json({
    ok: true,
    authRequired,
    waState,
    waReady,
    myNumber,
    myName,
    qr: lastQR ? lastQRDataURL : null,
    queue: {
      total: queue.length,
      pending: queue.filter((q) => q.status === "pending").length,
      sending: queue.filter((q) => q.status === "sending").length,
      sent: queue.filter((q) => q.status === "sent").length,
      failed: queue.filter((q) => q.status === "failed").length,
      skipped: queue.filter((q) => q.status === "skipped").length,
      running: queueRunning,
      paused: queuePaused,
    },
    daily: dailyCounter,
    optOutsCount: optOuts.length,
    stats,
    settings,
    bridgeVersion: "1.0",
    uptime: Date.now() - stats.sessionStart,
  });
});

/* Get full queue (with details) */
app.get("/queue", (req, res) => {
  res.json({ queue, dailyCounter, optOuts, stats });
});

/* Add messages to queue */
app.post("/send", (req, res) => {
  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ ok: false, error: "messages array required" });
  }
  if (!waReady) {
    return res.status(503).json({ ok: false, error: "WhatsApp not connected" });
  }
  const added = [];
  for (const m of messages) {
    /* V19.33: Allow items with only media (no text caption) — but at least phone is required */
    if (!m.phone) continue;
    if (!m.message && !m.mediaBase64 && !(Array.isArray(m.media) && m.media.length > 0)) continue;
    added.push({
      id: m.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 7)),
      phone: m.phone,
      message: m.message || "",
      /* V19.33: media[] array (preferred) or legacy single-image fields */
      media: Array.isArray(m.media) ? m.media : null,
      mediaBase64: m.mediaBase64 || null,
      mediaMime: m.mediaMime || null,
      mediaName: m.mediaName || null,
      campaignId: m.campaignId || null,
      customerName: m.customerName || "",
      status: "pending",
      attempts: 0,
      error: null,
      sentAt: null,
      addedAt: new Date().toISOString(),
    });
  }
  queue.push(...added);
  if (!queueRunning && !queuePaused) processQueue();
  res.json({ ok: true, added: added.length, queueTotal: queue.length });
});

/* Pause / Resume / Stop */
app.post("/pause", (req, res) => { queuePaused = true; res.json({ ok: true }); });
app.post("/resume", (req, res) => {
  queuePaused = false;
  if (!queueRunning) processQueue();
  res.json({ ok: true });
});
app.post("/stop", (req, res) => {
  queueAbort = true;
  queuePaused = false;
  /* Mark all pending as cancelled */
  queue.forEach((q) => { if (q.status === "pending") { q.status = "cancelled"; } });
  res.json({ ok: true });
});

/* Clear completed/failed from queue */
app.post("/clear", (req, res) => {
  const before = queue.length;
  queue = queue.filter((q) => q.status === "pending" || q.status === "sending");
  res.json({ ok: true, removed: before - queue.length });
});

/* Update settings live */
app.post("/settings", (req, res) => {
  const updates = req.body || {};
  /* Bounds checks */
  if (typeof updates.delayMin === "number") settings.delayMin = Math.max(3000, updates.delayMin);
  if (typeof updates.delayMax === "number") settings.delayMax = Math.max(settings.delayMin + 1000, updates.delayMax);
  if (typeof updates.dailyCap === "number") settings.dailyCap = Math.max(1, Math.min(500, updates.dailyCap));
  if (typeof updates.batchSize === "number") settings.batchSize = Math.max(5, Math.min(100, updates.batchSize));
  if (typeof updates.batchBreakMin === "number") settings.batchBreakMin = Math.max(60000, updates.batchBreakMin);
  if (typeof updates.batchBreakMax === "number") settings.batchBreakMax = Math.max(settings.batchBreakMin + 30000, updates.batchBreakMax);
  if (typeof updates.typingDelayMin === "number") settings.typingDelayMin = Math.max(500, updates.typingDelayMin);
  if (typeof updates.typingDelayMax === "number") settings.typingDelayMax = Math.max(settings.typingDelayMin + 500, updates.typingDelayMax);
  if (typeof updates.retryFailures === "boolean") settings.retryFailures = updates.retryFailures;
  if (typeof updates.detectOptOuts === "boolean") settings.detectOptOuts = updates.detectOptOuts;
  saveState();
  res.json({ ok: true, settings });
});

/* Manage opt-outs */
app.get("/optouts", (req, res) => res.json({ optOuts }));
app.post("/optouts/add", (req, res) => {
  const { phone } = req.body || {};
  const p = normalizePhone(phone);
  if (p && !optOuts.includes(p)) { optOuts.push(p); saveState(); }
  res.json({ ok: true, optOuts });
});
app.post("/optouts/remove", (req, res) => {
  const { phone } = req.body || {};
  const p = normalizePhone(phone);
  optOuts = optOuts.filter((x) => x !== p);
  saveState();
  res.json({ ok: true, optOuts });
});

/* V19.31: Activity log endpoint — last 100 send attempts */
app.get("/activity", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  res.json({
    activity: activityLog.slice(0, limit),
    total: activityLog.length,
  });
});

/* V19.31: QR code endpoint — for in-app display when WhatsApp needs re-link */
app.get("/qr", (req, res) => {
  if (!lastQR) return res.json({ qr: null, state: waState });
  res.json({ qr: lastQRDataURL, state: waState, raw: lastQR });
});

/* V19.31: Test message — send a single message immediately (bypasses queue) */
app.post("/test-message", async (req, res) => {
  if (!waReady) return res.status(503).json({ ok: false, error: "WhatsApp not ready" });
  const { phone, message } = req.body || {};
  if (!phone || !message) return res.status(400).json({ ok: false, error: "phone and message required" });
  try {
    const phoneNorm = normalizePhone(phone);
    const chatId = formatChatId(phoneNorm);
    const isReg = await waClient.isRegisteredUser(chatId).catch(() => false);
    if (!isReg) return res.status(404).json({ ok: false, error: "Number not on WhatsApp" });
    await waClient.sendMessage(chatId, message);
    addActivity({ phone: phoneNorm, customerName: "TEST", status: "sent", campaignId: "test" });
    res.json({ ok: true, sentTo: phoneNorm });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* V19.31: Reset daily counter (use sparingly!) */
app.post("/reset-daily", (req, res) => {
  const oldCount = dailyCounter.sent;
  dailyCounter = { date: new Date().toISOString().slice(0, 10), sent: 0 };
  saveState();
  console.log(`[ADMIN] Daily counter reset (was ${oldCount})`);
  res.json({ ok: true, previousCount: oldCount });
});

/* V19.31: Bulk opt-outs add — accepts array of phone numbers */
app.post("/optouts/bulk-add", (req, res) => {
  const { phones } = req.body || {};
  if (!Array.isArray(phones)) return res.status(400).json({ ok: false, error: "phones array required" });
  let added = 0;
  phones.forEach(p => {
    const norm = normalizePhone(p);
    if (norm && !optOuts.includes(norm)) {
      optOuts.push(norm);
      added++;
    }
  });
  saveState();
  res.json({ ok: true, added, total: optOuts.length });
});

/* V19.31: Stats — detailed analytics */
app.get("/stats", (req, res) => {
  const sentActivities = activityLog.filter(a => a.status === "sent");
  const failedActivities = activityLog.filter(a => a.status === "failed");
  const skippedActivities = activityLog.filter(a => a.status === "skipped");
  /* Top recipients */
  const recipientCounts = {};
  sentActivities.forEach(a => {
    if (a.phone) recipientCounts[a.phone] = (recipientCounts[a.phone] || 0) + 1;
  });
  const topRecipients = Object.entries(recipientCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([phone, count]) => ({ phone, count }));
  /* Avg duration */
  const durations = sentActivities.map(a => a.durationMs).filter(Boolean);
  const avgMs = durations.length ? Math.round(durations.reduce((a,b) => a+b, 0) / durations.length) : 0;
  /* Success rate (lifetime) */
  const successRate = (stats.totalSent + stats.totalFailed > 0)
    ? Math.round((stats.totalSent / (stats.totalSent + stats.totalFailed)) * 100)
    : 100;
  res.json({
    lifetime: stats,
    successRate,
    avgSendMs: avgMs,
    activityRecent: {
      sent: sentActivities.length,
      failed: failedActivities.length,
      skipped: skippedActivities.length,
    },
    topRecipients,
    sessionUptime: Date.now() - stats.sessionStart,
  });
});

/* V19.37: One-click repair endpoint.
   This is the SSH-free version of the recipe we ran in the wild during the
   V19.36 incident: destroy WA client → sweep Singleton lock files → reinitialize.
   The user's CLARK Dashboard exposes this as "🔧 إصلاح تلقائي" so they don't
   need to open a terminal for the most common bridge failure mode.
   Replies immediately; the actual reinit happens asynchronously. The client
   side polls /status to see READY again. */
app.post("/repair", async (req, res) => {
  console.log("[REPAIR] requested via API");
  const previousState = waState;
  waState = "REPAIRING";
  waReady = false;

  /* Step 1: destroy current client gracefully (with hard timeout — destroy()
     can hang if Chromium is already wedged, which is why we're here). */
  if (waClient) {
    try {
      await Promise.race([
        waClient.destroy(),
        new Promise(r => setTimeout(r, 5000)),
      ]);
      console.log("[REPAIR] client destroyed");
    } catch (e) {
      console.log("[REPAIR] destroy error (non-fatal):", e.message);
    }
    waClient = null;
  }

  /* Step 2: sweep Singleton locks (the actual fix) */
  const removed = cleanupSingletonLocks();
  console.log(`[REPAIR] swept ${removed} Singleton lock files`);

  /* Step 3: reinitialize after a beat. Don't await — we want to return now. */
  setTimeout(() => initWhatsApp(), 1000);

  res.json({
    ok: true,
    previousState,
    locksRemoved: removed,
    message: "Repair started. Poll /status — should be READY in ~30s.",
  });
});

/* Logout / re-link */
app.post("/logout", async (req, res) => {
  try {
    if (waClient) await waClient.logout();
    res.json({ ok: true });
    setTimeout(initWhatsApp, 2000);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* Bridge home page (QR display + status) */
app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>CLARK WhatsApp Bridge</title>
  <meta http-equiv="refresh" content="3">
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; background: #0F172A; color: #F1F5F9; padding: 24px; }
    .card { background: #1E293B; border-radius: 12px; padding: 20px; max-width: 500px; margin: 16px auto; border: 1px solid #334155; }
    h1 { font-size: 22px; margin-top: 0; }
    .state { display: inline-block; padding: 4px 12px; border-radius: 20px; font-weight: 700; font-size: 13px; }
    .state-READY { background: #10B98125; color: #34D399; }
    .state-QR { background: #F59E0B25; color: #FBBF24; }
    .state-AUTHENTICATING { background: #3B82F625; color: #60A5FA; }
    .state-INIT, .state-DISCONNECTED { background: #EF444425; color: #F87171; }
    .qr { text-align: center; padding: 16px; background: white; border-radius: 8px; margin: 12px 0; }
    .qr img { max-width: 100%; }
    .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
    .stat { background: #0F172A; padding: 10px; border-radius: 8px; }
    .stat-label { font-size: 12px; color: #94A3B8; }
    .stat-val { font-size: 18px; font-weight: 800; margin-top: 2px; }
    .warn { background: #F59E0B15; border: 1px solid #F59E0B40; padding: 10px; border-radius: 8px; font-size: 13px; color: #FBBF24; margin: 12px 0; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🌉 CLARK WhatsApp Bridge</h1>
    <div>الحالة: <span class="state state-${waState}">${waState}</span></div>
    ${waReady ? `<div style="margin-top:8px;font-size:13px;color:#94A3B8">متصل كـ <b style="color:#F1F5F9">${myName}</b> (${myNumber})</div>` : ""}
    ${lastQRDataURL ? `<div class="qr"><img src="${lastQRDataURL}"/></div><div style="text-align:center;font-size:13px;color:#94A3B8">امسح الكود من واتساب → الإعدادات → الأجهزة المرتبطة</div>` : ""}
    ${waReady ? `
    <div class="stats">
      <div class="stat"><div class="stat-label">رسايل اليوم</div><div class="stat-val">${dailyCounter.sent} / ${settings.dailyCap}</div></div>
      <div class="stat"><div class="stat-label">في الطابور</div><div class="stat-val">${queue.filter(q=>q.status==="pending").length}</div></div>
      <div class="stat"><div class="stat-label">مرسلة (إجمالي)</div><div class="stat-val">${stats.totalSent}</div></div>
      <div class="stat"><div class="stat-label">فشل</div><div class="stat-val">${stats.totalFailed}</div></div>
    </div>` : ""}
    <div class="warn">
      ⚠️ <b>تحذير:</b> هذا الـ bridge يستخدم WhatsApp Web automation وهو مخالف لشروط واتساب.
      الرقم قد يتم حظره. استخدم رقماً ثانوياً، ابدأ بكميات صغيرة، وراقب النتائج.
    </div>
    <div style="font-size:12px;color:#64748B;text-align:center;margin-top:8px">
      الصفحة تتحدث كل 3 ثواني · في CLARK: الإعدادات → Bridge Mode → URL: <code>http://localhost:${PORT}</code>
    </div>
  </div>
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║  CLARK WhatsApp Bridge v1.0              ║`);
  console.log(`║  http://localhost:${PORT}                    ║`);
  console.log(`╚══════════════════════════════════════════╝\n`);
  console.log(`Open the URL above in a browser to scan QR.\n`);
});
