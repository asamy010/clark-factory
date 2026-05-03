# CLARK WhatsApp Bridge

Local Node.js server that automates WhatsApp message sending for CLARK's Campaign Engine.

## ⚠️ Important Warnings

- **Violates WhatsApp ToS.** Your number can get banned.
- **Use a secondary number** — never your personal WhatsApp.
- Start with small batches (10-20 messages) and watch for any restrictions.
- Daily cap is enforced at 80 by default — don't raise it dramatically.
- Random delays mimic human behavior but are not a guarantee.

## Setup

### Prerequisites
- Node.js 16+ installed ([nodejs.org](https://nodejs.org))
- A second WhatsApp account (NOT your personal one)
- A computer / Raspberry Pi / VPS that can stay on

### Install
```bash
cd clark-wa-bridge
npm install
```

First install takes 2-3 minutes (Puppeteer downloads Chromium ~150MB).

### Run
```bash
npm start
```

You should see:
```
╔══════════════════════════════════════════╗
║  CLARK WhatsApp Bridge v1.0              ║
║  http://localhost:3001                   ║
╚══════════════════════════════════════════╝
```

### Link your phone

1. Open `http://localhost:3001` in any browser on the same machine
2. A QR code will appear
3. On your phone: WhatsApp → Settings → Linked Devices → Link a Device
4. Scan the QR
5. Wait ~10 seconds. The page should now show "READY ✓"

The session is saved in `.wwebjs_auth/` — you only scan once.

### Connect from CLARK

1. Open CLARK in your browser/iPad
2. Go to **Campaigns** → **Settings (⚙️)**
3. Toggle **Bridge Mode** ON
4. Bridge URL: `http://localhost:3001` (or `http://YOUR_LOCAL_IP:3001` if iPad is on same network)
5. Click **Test Connection** → should show ✅

If iPad is on different network, you need port forwarding or use a service like `ngrok` to expose the local server.

## Settings (live-tunable from CLARK)

| Setting | Default | Description |
|---|---|---|
| `delayMin` / `delayMax` | 8000 / 25000 ms | Random delay between sends (8-25 sec) |
| `dailyCap` | 80 | Max messages per calendar day |
| `batchSize` | 20 | Messages before a long break |
| `batchBreakMin/Max` | 4-8 min | Break length after batch |
| `typingDelayMin/Max` | 2-5 sec | "Typing..." simulation before send |
| `retryFailures` | true | Retry once if send fails |
| `detectOptOuts` | true | Auto-blacklist if recipient sends STOP/إلغاء |

## Endpoints

```
GET  /              Status page with QR
GET  /status        JSON status (used by CLARK polling)
GET  /queue         Full queue + stats
POST /send          { messages: [{phone, message, mediaBase64?, mediaMime?, mediaName?}] }
POST /pause         Pause queue
POST /resume        Resume queue
POST /stop          Cancel all pending
POST /clear         Remove completed/failed from queue
POST /settings      Update settings
GET  /optouts       List of opted-out numbers
POST /optouts/add   { phone }
POST /optouts/remove { phone }
POST /logout        Disconnect & re-link
```

## Anti-Ban Best Practices

1. **Don't blast 100+ messages in one go.** Use batches of 20 with breaks.
2. **Personalize each message.** WhatsApp's anti-spam detection flags identical messages.
3. **Send only to people who know you.** Cold outreach gets reported faster.
4. **Honor opt-outs immediately.** The bridge does this automatically.
5. **Mix in some manual replies** through the linked phone — looks more natural.
6. **Don't send at 3 AM.** Stick to business hours.

## Troubleshooting

**QR code never appears**
- First run can take 30-60 seconds. Wait, refresh the page.
- If still nothing, check console for Chromium errors.

**"Number not on WhatsApp"**
- The number is invalid or not registered. CLARK's normalization handles `01xxx` → `+201xxx`.

**Disconnected after a while**
- Phone went offline / WhatsApp logged out the session. Re-scan QR.

**Number banned**
- It happens. Use a different number. Reduce sending rate.

## File Structure

```
clark-wa-bridge/
├── server.js              # Main server
├── package.json
├── README.md              # This file
├── .wwebjs_auth/          # Session data (auto-created, don't commit)
└── .bridge-state.json     # Counters & opt-outs (auto-created)
```

## Stopping the bridge

`Ctrl+C` in the terminal. Session is preserved.

To run as a background service on Linux/Pi, use `pm2`:
```bash
npm install -g pm2
pm2 start server.js --name clark-bridge
pm2 save
pm2 startup  # follow instructions to auto-start on boot
```
