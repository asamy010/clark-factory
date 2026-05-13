# CLARK Factory Management — Handoff Document

> **آخر تحديث:** V19.32 (3 مايو 2026)  
> **الحالة:** كل الـ infrastructure شغّال + البريدج LIVE + Customer Portal Link في الحملات

---

## 📌 الملخص السريع

CLARK هو نظام إدارة مصنع للأنتيكا والديكور (6 موظفين، iPad-first). React + Firebase + Vercel.

في الجلسة دي اتعمل:

1. **محرّك حملات WhatsApp كامل** — يدوي + تلقائي (Bridge)
2. **VPS LIVE** على Contabo شغّال 24/7 بـ HTTPS
3. **Dashboard احترافي** للبريدج داخل CLARK نفسه

---

## 🎯 الحالة الحالية

### V19.32 LIVE — كل الـ features شغّالة

| الكمبوننت | الحالة | الموقع |
|---|---|---|
| CLARK web app | ✅ shipped | Vercel `clarkfactorymanagement` |
| WhatsApp Bridge | ✅ LIVE | Contabo VPS Germany |
| Domain + HTTPS | ✅ شغّال | `clark-rmg.duckdns.org` |
| WhatsApp linked | ✅ متصل | `CLARK (201100201057)` |

---

## 🔐 البيانات الحساسة (ضروري للشات الجديد)

```
═══════════════════════════════════════════════════════════════
  Server: Contabo VPS S — Germany
═══════════════════════════════════════════════════════════════
  IP:           77.237.235.160
  Hostname:     vmi3275806
  SSH user:     root
  SSH pass:     clarkbridge2026

═══════════════════════════════════════════════════════════════
  Domain: DuckDNS (free)
═══════════════════════════════════════════════════════════════
  URL:          https://clark-rmg.duckdns.org
  Token:        cce458ca-37c6-4026-8b0e-79558f458ee1

═══════════════════════════════════════════════════════════════
  Bridge Authentication
═══════════════════════════════════════════════════════════════
  Auth Token:   382757cfdf6ffdaf8112bddac4eaf8365eb47638840f703803c445d9d35add60

═══════════════════════════════════════════════════════════════
  Firebase
═══════════════════════════════════════════════════════════════
  Project:      clarkfactorymanagement
  src/firebase.js → ⚠️ يجب الحفاظ عليه verbatim (لا تعدّل!)

═══════════════════════════════════════════════════════════════
  WhatsApp Linked
═══════════════════════════════════════════════════════════════
  Number:       CLARK (201100201057)
  Status:       READY ✓
═══════════════════════════════════════════════════════════════
```

---

## 📚 ما تم تطويره في الجلسة (V19.20 → V19.31)

### V19.20 — Workshop Data Integrity
- الخزنة كمصدر وحيد للحقيقة
- إزالة V19.17 silent auto-sync (كانت بترجع البيانات المحذوفة)
- أداة تنظيف للـ ghost wsPayments + orphan treasury
- Bilateral cascade في حذف الخزنة
- HRPg: زر "+ قسط مدفوع" يدوي

### V19.21 — Popup Whitespace
- StageProgressModal: تصميم أبيض + إطار 2px ملوّن

### V19.22 — Topbar Cleanup + Debt History
- إزالة pills قديمة + TeamActivityModal
- 📋 سجل دفعات في popup المديونيات

### V19.23-26 — HR Filter Fixes
- إصلاح فلتر تواريخ المديونيات
- Recovery scanner banner

### V19.25 — WhatsApp Daily Report Cleanup
- TreasuryPg: تبسيط الرسالة اليومية (ملخصات بدون تفاصيل transaction-by-transaction)

### V19.27 — Allow-Negative Inventory Fix
- إصلاح bug: blockOnInsufficientStock setting كان متجاهل
- Toast warning بدل ما يحظر الإرسال لو السماح بالسالب مفعّل

### V19.28 — Bridge Foundation
- إنشاء `clark-wa-bridge/` (Node.js + whatsapp-web.js + Puppeteer)
- وضعين للإرسال: يدوي vs تلقائي (Bridge)
- ChooseSendMode + BridgeSettings + BridgeSendScreen
- Anti-ban: delays عشوائية + simulated typing + daily cap + batch breaks + opt-outs

### V19.29 — Manual Mode Pro Features (13 ميزة)
- **🧹 auto-remove sent items** (ON بالافتراضي)
- **🔍 search box** + filter بالحالة
- **⏭ jump-to-customer** بالضغط في القائمة
- **✏️ تعديل الرسالة لكل عميل** قبل الإرسال
- **📝 تخطّى مع ملاحظة** (skip note)
- **↩ undo last action**
- **🚫 قائمة المحظورين** (`data.campaignBlocklist[]`) — استبعاد تلقائي من كل الحملات
- **🔁 إعادة الفاشل** بضغطة
- **💾 Resume in-progress** — Banner أزرق "حملات معلّقة" مع progress
- **⏱ ETA estimate** بناءً على المعدل الفعلي
- **📊 Campaign detail modal** — تفاصيل كل عميل في الحملة + Excel export + إعادة فاشل/كل
- **🗑 حذف الحملات** فردي + الكل
- **📊 Excel export** للسجل

### V19.30 — Bridge على VPS (Docker + HTTPS + Auth)
- **🐳 Dockerfile** — Node 20 + Chromium
- **🔧 docker-compose.yml** — bridge + Caddy reverse proxy + 5 volumes
- **🔒 Caddyfile** — HTTPS تلقائي عبر Let's Encrypt
- **🚀 setup-vps.sh** — سكريبت آلي يعمل كل حاجة بأمر واحد
- **🔐 AUTH_TOKEN** middleware — كل endpoint محمي (ماعدا / و /status)
- **🛡 UFW firewall** — ports 22/80/443 فقط
- **💾 Persistent volumes** — السيشن مش بتضيع لما الكونتينر يتعاد
- CLARK side: خانة Auth Token + كل bridge calls تمرر الـ token

### V19.31 — Bridge Dashboard في CLARK (الحالي)
**5 تابات احترافية في صفحة إعدادات البريدج:**

#### 📊 Dashboard
- حالة اتصال + اسم الرقم + uptime
- 6 stat cards (مرسلة اليوم، في الطابور، إجمالي، فشل، opt-outs، بيبعت الآن)
- Progress bar للحد اليومي
- 🎮 أزرار تحكم سريعة (pause/resume/stop/clear/logout)
- معاينة آخر 10 نشاطات
- 📱 QR display داخل CLARK لو الواتساب اتقطع

#### ⚙️ Settings
- URL + Auth Token + كل anti-ban settings
- 🆕 Typing simulation settings
- اختبار اتصال + توقعات الوقت

#### 📈 Stats
- معدل النجاح % + متوسط الإرسال + uptime
- توزيع آخر 50 محاولة
- 🏆 أكثر 10 عملاء استلاماً

#### 📋 Activity
- آخر 100 محاولة إرسال
- فلتر بالحالة (نجح/فشل/تخطّى)
- وقت نسبي + سبب الفشل + مدة الإرسال

#### 🛠 Tools
- 📨 إرسال رسالة اختبار (بدون queue)
- 🚫 إدارة opt-outs (عرض/إضافة جماعية/حذف)
- 🔄 تصفير العداد اليومي

**Bridge endpoints جديدة:**
- `GET /activity?limit=N`
- `GET /qr`
- `POST /test-message {phone, message}`
- `POST /reset-daily`
- `POST /optouts/bulk-add {phones: []}`
- `GET /stats` (analytics)

### V19.32 — Customer Portal Link في الحملات (الحالي)
- **🔗 placeholder جديد** `{لينك}` في قوالب الحملات
- بيتحوّل لـ portal URL خاص بكل عميل (read-only لحسابه)
- **⚡ Pre-fetch تلقائي:** لما القالب فيه `{لينك}`، CLARK يولّد لينكات كل العملاء قبل الإرسال (5 requests متوازية)
- **شاشة loading** بـ progress bar أثناء التوليد
- **💾 Resume support:** لينكات محفوظة في `data.activeCampaigns[]` — مش بتتولّد تاني عند الاستئناف
- شغال في **both modes** (manual + bridge)
- function `portalUrlBatch(custIds, onProgress)` بتنادي `/api/customer-portal-sign` مع admin token
- **Auth import** جديد في CampaignsPg: `import { auth } from "../firebase.js"`
- Sample portal URL في template editor preview

### Files modified in V19.32
- `src/pages/CampaignsPg.jsx` — VARIABLES + personalize() + portalUrlBatch() + SendScreen + BridgeSendScreen + activeCampaigns persistence
- `src/components/AboutVersionModal.jsx` — V19.32 changelog (drop V19.22, add V19.32)

### How it works (technical)
1. User opens campaign with template containing `{لينك}`
2. SendScreen / BridgeSendScreen detects `needsPortalLinks = true`
3. useEffect fires `portalUrlBatch()` with all customer IDs
4. Each ID → POST to `/api/customer-portal-sign` with adminToken (5 concurrent)
5. Returned URLs stored in `items[].portalUrl`
6. `personalize()` substitutes `{لينك}` with `ctx.portalUrl`
7. Loading screen shows progress until all done
8. Then normal send flow continues

---

## 📁 بنية الملفات

### CLARK (React app)
```
clark-v19_31/
├── src/
│   ├── App.jsx                              # Top-level (V19.31 string × 52)
│   ├── firebase.js                          # ⚠️ verbatim — never modify
│   ├── components/
│   │   ├── AboutVersionModal.jsx            # CHANGELOG (max 10 entries)
│   │   ├── StageProgressModal.jsx           # V19.21 white redesign
│   │   └── ui.jsx                           # Btn, Inp, Card primitives
│   └── pages/
│       ├── App.jsx
│       ├── CampaignsPg.jsx                  # 2458 lines — البريدج + dashboard + manual
│       ├── ExtProdPg.jsx                    # V19.20 cleanup tool
│       ├── HRPg.jsx                         # V19.20-26 debt fixes
│       └── TreasuryPg.jsx                   # V19.20 bilateral cascade
└── clark-wa-bridge/                          # ⚠️ منفصل تماماً عن React
    ├── server.js                            # Node.js bridge (642 lines)
    ├── package.json
    ├── Dockerfile                           # Node 20 + Chromium
    ├── docker-compose.yml                   # bridge + Caddy
    ├── Caddyfile                            # HTTPS auto + reverse proxy
    ├── setup-vps.sh                         # Installer
    ├── README.md
    └── SETUP-VPS.md                         # Arabic guide
```

### Data structures الجديدة في `data.*`
```js
data.campaignBridge {
  enabled, url, token,
  delayMin, delayMax, dailyCap, batchSize,
  batchBreakMin, batchBreakMax,
  typingMin, typingMax,                    // V19.31
  retryFailures, detectOptOuts
}

data.campaignBlocklist[]                    // V19.29 — استبعاد تلقائي
  [{id, name, phone, blockedAt, blockedBy, reason}]

data.activeCampaigns[]                      // V19.29 — حملات قابلة للاستئناف (max 5)
  [{id, templateId, templateName, templateBody, segmentKey, segmentLabel,
    sendMode, items[], startedAt, updatedAt, startedBy}]

data.campaigns[]                            // المحدّث: items[] في كل حملة (max 50)
  [{id, templateId, templateName, templateBody,
    audienceLabel, segmentKey, segmentLabel,
    sendMode: "manual" | "bridge",
    totalCount, sentCount, skippedCount, failedCount,
    items[: {id, name, phone, status, sentAt, skipNote, customMessage}],
    createdAt, completedAt, createdBy}]

data.campaignTemplates[]                    // (موجود من V19.19, max 30)
```

---

## 🛠 Routine للإصدار الجديد

### في كل V19.X جديدة

```bash
# 1. نسخ المجلد
cd /home/claude && cp -r clark-v19_32 clark-v19_33

# 2. Bump version
cd clark-v19_33 && sed -i 's/V19\.31/V19.32/g' src/App.jsx
grep -c "V19.33" src/App.jsx   # المفروض 52

# 3. Edit code (str_replace)
# ...

# 4. Update CHANGELOG في src/components/AboutVersionModal.jsx
# - Drop oldest entry
# - Add new V19.33 entry at top
# - Verify count == 10

# 5. Syntax check
node -e "
const parser = require('/tmp/node_modules/@babel/parser');
const fs = require('fs');
['src/App.jsx','src/components/AboutVersionModal.jsx','src/pages/CampaignsPg.jsx',
 'src/pages/HRPg.jsx','src/pages/TreasuryPg.jsx','src/pages/SettingsPg.jsx',
 'src/components/StageProgressModal.jsx'].forEach(f=>{
  try { parser.parse(fs.readFileSync(f,'utf8'),{sourceType:'module',plugins:['jsx']}); console.log('OK:',f); }
  catch(e){ console.log('FAIL:',f,'-',e.message); }
});
"

# 6. Verify firebase.js verbatim
diff src/firebase.js /tmp/orig_firebase.js   # must show nothing

# 7. Build zip
cd /home/claude && zip -rq /mnt/user-data/outputs/clark-v19_32.zip clark-v19_32 \
  -x "*/node_modules/*" "*/.git/*" "*/dist/*" "*/.wwebjs_auth/*" "*/.wwebjs_cache/*"

# 8. لو في تعديل في clark-wa-bridge، اعمل zip منفصل
cd clark-v19_33 && zip -rq /mnt/user-data/outputs/clark-wa-bridge-v32.zip clark-wa-bridge \
  -x "*/node_modules/*" "*/.wwebjs_auth/*" "*/.wwebjs_cache/*"

# 9. present_files
```

### أمور خاصة بـ Bridge updates

```bash
# على السيرفر بعد رفع الملفات الجديدة:
cd /root/clark-wa-bridge
docker compose up -d --build

# الـ session مش بتضيع لأن .wwebjs_auth في volume منفصل.
```

---

## ⚙️ أوامر مفيدة على السيرفر

```bash
# دخول السيرفر
ssh root@77.237.235.160                    # password: clarkbridge2026

# داخل /root/clark-wa-bridge
docker compose ps                          # حالة الـ containers
docker compose logs -f                     # logs لايف
docker compose logs bridge --tail 50       # آخر 50 سطر من البريدج
docker compose logs caddy --tail 50        # آخر 50 سطر من Caddy
docker compose restart                     # إعادة تشغيل الكل
docker compose restart bridge              # إعادة تشغيل البريدج بس
docker compose down                        # إيقاف
docker compose up -d                       # تشغيل
docker compose up -d --build               # إعادة بناء + تشغيل
cat .env                                   # شوف الـ token + domain

# لو محتاج تـ scan QR من جديد (مثلاً ربط رقم تاني)
docker compose down
docker volume rm clark-wa-bridge_bridge-auth
docker compose up -d
# افتح https://clark-rmg.duckdns.org → امسح QR
```

---

## ⚠️ نقاط مهمة جداً

### 1. firebase.js
**❌ لا تعدّله أبداً.** فيه API keys حقيقية. أي تغيير يكسر الـ deployment.

في كل إصدار، تأكد:
```bash
diff src/firebase.js /tmp/orig_firebase.js
```
لازم يطلع فاضي.

### 2. Version sync
السلسلة اللي اسمها `V19.X` لازم تكون متطابقة في:
- `src/App.jsx` (52 occurrence)
- اسم المجلد `clark-v19_X/`
- اسم الـ zip
- entry في CHANGELOG

### 3. CHANGELOG cap
**Maximum 10 entries.** كل إصدار جديد:
- اضف entry جديد في الأعلى (بعد `const CHANGELOG = [`)
- احذف الـ oldest entry (في الأسفل قبل `];`)

### 4. JSX comments
**Always use `{/* ... */}`** — السطر اللي قبل أو بعد ممكن يكسر JSX silently.

### 5. Egyptian week
السبت → الخميس (مش الأحد → السبت).

### 6. الـ Bridge — Auth Token
- البريدج محمي بـ token
- CLARK لازم يبعت `Authorization: Bearer <token>` على كل request
- ماعدا `/` و `/status` (مفتوحين عشان الصفحة تظهر QR)

---

## 💡 طلبات مفتوحة / Roadmap

### مطلوب في V19.32+

#### 📷 إرسال الصور (مطلوب)
**خطة Phase 1 (Bridge):** ✅ سهل
- زر "📷 إضافة صورة" في محرر القالب
- file picker / drag-drop
- Convert to base64
- البريدج يستقبل `mediaBase64 + mediaMime + mediaName` ويبعت كـ MessageMedia (whatsapp-web.js يدعم native)

**خطة Phase 2 (Manual mode):** أصعب
- Web Share API للموبايل (iPhone/iPad)
- Clipboard + Ctrl+V instructions للويندوز

**التقدير:** Phase 1 = 3 ساعات، Phase 2 = 2 ساعة، الاتنين = 6 ساعات

#### 📅 Schedule Campaigns (Bridge فقط)
- جدولة حملة لوقت معين (مرة واحدة أو متكررة)
- cron loop في server.js
- UI لاختيار التاريخ/الوقت
- **التقدير:** 4 ساعات (مرة واحدة) أو 7 ساعات (recurring)

#### 📞 Click-to-Call
- زر `<a href="tel:+...">📞 اتصل</a>` جنب كل عميل
- في شاشة الحملة + campaign detail modal + customer list
- **التقدير:** 30 دقيقة

### تم رفضها (overkill)

- 🧪 A/B Template Testing — sample size صغير جداً، مش هينفع للمصنع

### ميزات ممكنة لم تذكر

- 🔔 Auto-followup للفاشل (3 أيام بعدين)
- 📈 Customer Health Score
- 💬 Reply Tracking في الـ Bridge

---

## 🐛 حلول لمشاكل سابقة

### المستخدم لا يقدر يعمل copy/paste في Command Prompt
**الحل:** فعّل QuickEdit في Properties → Options، أو استخدم Ctrl+Shift+V في PowerShell.

### Hetzner verification يطلب passport
**الحل:** غيّر لـ Contabo (نفس السعر، أبسط).

### Contabo UIN field validation (39 alphanumeric)
**الحل:** اترك Business Name فاضي → الفورم بيتحول لـ personal.

### Caddy 400 Bad Request
**السبب:** الـ DuckDNS كان بيشاور لـ IP قديم، أو `{$DOMAIN}` env var ما اشتغلش في Caddyfile.
**الحل:** 
1. حدّث DuckDNS بالـ IP الصح
2. اعمل Caddyfile مع domain ثابت (مش متغيّر)
3. `docker compose restart caddy`

### setup-vps.sh: Invalid syntax في UFW
**السبب:** comments جوة الـ ufw allow command.
**الحل (manual):**
```bash
ufw --force reset && ufw default deny incoming && ufw default allow outgoing && \
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable
```

---

## 📞 Contact info

- **Owner:** Ahmed Samy
- **Email (Contabo):** a.samy@live.com
- **Customer ID:** 14929983
- **Order ID:** 14930007

---

## 🔍 الجلسات السابقة في `/mnt/transcripts/`

```
2026-05-02-15-54-29-clark-v19-15-to-19-18-session.txt    # V19.15-19.18 baseline
2026-05-02-17-44-37-clark-v19-15-to-26-session.txt        # V19.20-26 (workshop fixes)
2026-05-03-11-35-51-clark-v19-20-to-31-bridge.txt         # V19.27-31 (الجلسة دي)
journal.txt                                               # catalog
```

---

## ✅ Validation Checklist لكل إصدار جديد

- [ ] Bumped version في App.jsx (52 occurrence)
- [ ] Folder renamed `clark-v19_X/`
- [ ] CHANGELOG: dropped oldest, added new (still == 10 entries)
- [ ] All JSX files: babel parse OK
- [ ] firebase.js: diff against /tmp/orig_firebase.js shows nothing
- [ ] (لو تعديل في bridge) node --check server.js OK
- [ ] zip built without node_modules / .wwebjs_*
- [ ] present_files called
- [ ] (لو bridge updated) رفع لـ /root/clark-wa-bridge/ + docker compose up -d --build

---

**🎉 Bridge LIVE. Dashboard كامل. كل حاجة جاهزة.**
