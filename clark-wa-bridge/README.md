# CLARK WhatsApp Bridge

Node.js server that automates WhatsApp message sending for CLARK's Campaign Engine
via whatsapp-web.js + Puppeteer.

## ⚠️ Disclaimer

- **Violates WhatsApp ToS.** Your number CAN get banned.
- **Use a secondary number** — never your personal WhatsApp.
- Start with small batches (10-20 messages) per day.
- Daily cap is 80 by default — raising it increases ban risk.

---

## Two Deployment Modes

### 🌐 Mode 1: VPS Deployment (Recommended)

Run on a cloud server 24/7 with HTTPS. Accessible from anywhere.

**See [SETUP-VPS.md](./SETUP-VPS.md) for the full step-by-step guide** in Arabic.

Quick version: SSH to your VPS, then:
```bash
mkdir clark-wa-bridge && cd clark-wa-bridge
# (upload all files via scp or git)
chmod +x setup-vps.sh
./setup-vps.sh
```

The script handles everything: Docker, Compose, firewall, HTTPS via Let's Encrypt.

### 💻 Mode 2: Local PC

Run on your own Windows/Mac/Linux PC. Only accessible from same machine.

```bash
cd clark-wa-bridge
npm install      # First time only (~5 min)
npm start
```

Then open `http://localhost:3001` to scan QR with WhatsApp.

In CLARK: Campaigns → ⚙️ بريدج → URL: `http://localhost:3001` (no token needed locally).

---

## How It Works

1. **You start the bridge** on a server (or local PC)
2. **It opens WhatsApp Web** in headless Chromium and shows a QR
3. **You scan once** — session is saved persistently
4. **CLARK sends jobs** to bridge via HTTP API
5. **Bridge sends each message** with random delays + typing simulation
6. **Status updates** poll back to CLARK in real time

---

## Bridge Settings (live-tunable from CLARK UI)

| Setting | Default | Description |
|---|---|---|
| `delayMin/Max` | 8-25 sec | Random delay between messages |
| `dailyCap` | 80 | Hard cap per calendar day |
| `batchSize` | 20 | Messages before a long break |
| `batchBreakMin/Max` | 4-8 min | Break duration after each batch |
| `typingDelayMin/Max` | 2-5 sec | Simulated "typing..." before each send |
| `retryFailures` | true | Auto-retry failed sends once |
| `detectOptOuts` | true | Auto-blacklist if recipient sends STOP/إلغاء |

---

## API Endpoints

All require `Authorization: Bearer <AUTH_TOKEN>` if token is configured,
EXCEPT `GET /` and `GET /status`.

| Method | Path | Description |
|---|---|---|
| GET | `/` | Status page with QR code (HTML) |
| GET | `/status` | JSON status — used by CLARK polling |
| GET | `/queue` | Full queue contents |
| POST | `/send` | Add messages: `{messages: [{phone, message, ...}]}` |
| POST | `/pause` | Pause queue |
| POST | `/resume` | Resume queue |
| POST | `/stop` | Cancel all pending |
| POST | `/clear` | Remove completed from queue |
| POST | `/settings` | Update settings |
| GET | `/optouts` | List opted-out numbers |
| POST | `/optouts/add` | Add opt-out: `{phone}` |
| POST | `/optouts/remove` | Remove opt-out |
| POST | `/logout` | Disconnect & require re-scan QR |

---

## Anti-Ban Best Practices

1. ✅ **Use a secondary number** — burner SIM, not personal/business
2. ✅ **Personalize each message** — variation defeats spam detection
3. ✅ **Small batches** — 20 msg, 5 min break, repeat
4. ✅ **Business hours only** — avoid 11pm-7am
5. ✅ **Send to people who know you** — cold outreach gets reported
6. ✅ **Honor opt-outs** — handled automatically by the bridge
7. ✅ **Mix in real conversation** — reply manually to some chats
8. ❌ **Don't blast 200 messages at once**
9. ❌ **Don't send identical text** to many people
10. ❌ **Don't ignore "STOP" replies**

---

## Troubleshooting

| Problem | Solution |
|---|---|
| QR never appears | Wait 30-60s. Check `docker compose logs bridge` |
| "Number not on WhatsApp" | Phone is wrong or not registered |
| Disconnected after a while | Re-scan QR. Phone needs internet too |
| Caddy can't get HTTPS cert | Check DNS points to server, ports 80/443 open |
| Number banned | Use new number, reduce sending rate |

---

## File Structure

```
clark-wa-bridge/
├── server.js              # Bridge server (Node.js)
├── package.json
├── Dockerfile             # For VPS Docker deployment
├── docker-compose.yml     # Bridge + Caddy
├── Caddyfile              # Reverse proxy + auto-HTTPS
├── setup-vps.sh           # One-command VPS installer
├── .env.example           # Config template
├── README.md              # This file
└── SETUP-VPS.md           # Detailed VPS setup guide
```
