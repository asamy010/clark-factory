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
   WHATSAPP CLIENT INIT
   ────────────────────────────────────────────────────────────────── */
function initWhatsApp() {
  if (waClient) {
    try { waClient.destroy(); } catch {}
    waClient = null;
  }
  waReady = false;
  waState = "INIT";

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
      console.log(`[Q] Skipped (opted out): ${phoneNorm}`);
      continue;
    }

    /* Send attempt */
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
      if (item.mediaBase64 && item.mediaMime) {
        const { MessageMedia } = require("whatsapp-web.js");
        const media = new MessageMedia(item.mediaMime, item.mediaBase64, item.mediaName || "file");
        await waClient.sendMessage(chatId, media, { caption: item.message || "" });
      } else {
        await waClient.sendMessage(chatId, item.message);
      }

      try { await chat.clearState(); } catch {}

      item.status = "sent";
      item.sentAt = new Date().toISOString();
      dailyCounter.sent++;
      stats.totalSent++;
      inBatch++;
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
    if (!m.phone || !m.message) continue;
    added.push({
      id: m.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 7)),
      phone: m.phone,
      message: m.message,
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
