# دليل تركيب البريدج على VPS — خطوة بخطوة

## المتطلبات
- VPS Ubuntu 22.04 أو 24.04 (مينيمم 1GB RAM)
- domain يشاور للسيرفر (مثلاً `clark-rmg.duckdns.org`)
- SSH access كـ root

---

## الخطوة 1: ارفع الملفات للسيرفر

عندك طريقتين:

### الطريقة A: scp من PowerShell (الأسهل)

من PC الويندوز، افتح PowerShell **في المجلد اللي فيه clark-wa-bridge**:

```powershell
cd C:\path\to\clark-wa-bridge
scp -r * root@77.237.235.160:/root/clark-wa-bridge/
```

(غير الـ IP لرقم السيرفر بتاعك)

هيطلب password — الصقه.

### الطريقة B: zip + upload يدوي

1. اعمل zip للمجلد `clark-wa-bridge`
2. ارفعه على أي filesharing
3. على السيرفر: `wget <link>` ثم `unzip`

---

## الخطوة 2: SSH للسيرفر وتشغيل السكريبت

```bash
ssh root@77.237.235.160
cd /root/clark-wa-bridge
chmod +x setup-vps.sh
./setup-vps.sh
```

السكريبت هيسألك عن:
- **Domain:** اكتب `clark-rmg.duckdns.org` (أو أياً كان)

السكريبت هيعمل التالي **تلقائياً**:

| الخطوة | الوقت |
|---|---|
| 1. تحديث النظام | 1-2 دقيقة |
| 2. تركيب Docker | 1-2 دقيقة |
| 3. ضبط الـ firewall (UFW) | 5 ثواني |
| 4. توليد Auth Token عشوائي | فوري |
| 5. بناء صورة البريدج | 3-5 دقائق |
| 6. تشغيل البريدج + Caddy | 10 ثواني |

⚠️ **بعد ما يخلص:** انسخ الـ AUTH_TOKEN اللي طلع — هتحتاجه في CLARK.

---

## الخطوة 3: استنى Caddy ياخد شهادة HTTPS

أول دخول، Caddy بياخد **30-60 ثانية** عشان يطلب شهادة من Let's Encrypt.

تشيك إنه شغال:
```bash
docker compose logs caddy | tail -20
```

لو شفت `certificate obtained successfully` — كله تمام.

---

## الخطوة 4: افتح صفحة البريدج

في المتصفح:
```
https://clark-rmg.duckdns.org
```

المفروض تشوف:
- صفحة سوداء فيها logo CLARK Bridge
- QR Code أبيض كبير

---

## الخطوة 5: اربط الواتساب

على الموبايل (الرقم الاحتياطي):
1. واتساب → الإعدادات → **الأجهزة المرتبطة**
2. اضغط **ربط جهاز**
3. امسح QR من المتصفح
4. استنى 10-15 ثانية
5. الصفحة هتقول `READY ✓` وتعرض اسم الواتساب المتصل

---

## الخطوة 6: ربط CLARK بالبريدج

في CLARK:
1. Campaigns → ⚙️ **بريدج**
2. **URL:** `https://clark-rmg.duckdns.org`
3. **Auth Token:** الصق الـ token اللي السكريبت ولّده
4. **Test Connection** → المفروض يطلع ✓ متصل
5. Save

---

## أوامر مفيدة على السيرفر

| الأمر | الوظيفة |
|---|---|
| `docker compose logs -f` | شوف الـ logs لايف |
| `docker compose ps` | حالة الـ containers |
| `docker compose restart` | إعادة تشغيل |
| `docker compose down` | إيقاف |
| `docker compose up -d` | تشغيل |
| `docker compose up -d --build` | إعادة بناء + تشغيل |
| `cat .env` | شوف الـ token + domain |
| `df -h` | الـ disk usage |
| `free -h` | الـ RAM usage |

---

## إعادة الـ scan QR

لو احتجت تربط رقم تاني أو السيشن قطعت:

```bash
docker compose down
docker volume rm clark-wa-bridge_bridge-auth
docker compose up -d
```

افتح الصفحة تاني وامسح QR جديد.

---

## التحديث

لو طلعت نسخة V19.31 وفيها تعديل في server.js:

```bash
cd /root/clark-wa-bridge
# ارفع الملفات الجديدة (بنفس طريقة الخطوة 1)
docker compose up -d --build
```

الـ session WhatsApp **مش هتضيع** لأنها في volume منفصل.

---

## Backup للـ session

عشان مايضيعش لو حصلت مشكلة:

```bash
docker run --rm -v clark-wa-bridge_bridge-auth:/data -v $(pwd):/backup alpine tar czf /backup/wa-session-backup.tar.gz -C /data .
```

ده بيعمل ملف `wa-session-backup.tar.gz` فيه السيشن. احفظه في مكان آمن.

---

## الأمان

- ✅ Firewall بيقفل كل الـ ports غير 22, 80, 443
- ✅ HTTPS تلقائي عبر Let's Encrypt
- ✅ Auth Token بيقفل البريدج (مش أي حد يقدر يبعت رسائل)
- ✅ الـ token طوله 64 حرف عشوائي — صعب التخمين

⚠️ **خلي بالك:**
- متشاركش الـ Auth Token مع حد
- متعرضش الـ token في GitHub أو أي مكان عام
- لو الـ token اتسرّب: غيّره في `.env` و`docker compose restart`

---

## TROUBLESHOOTING

### مشكلة: Caddy ما اقدرش ياخد certificate

**أسباب محتملة:**
1. الـ domain مش بيشاور للسيرفر
   - اختبر: `dig +short clark-rmg.duckdns.org` لازم يطلع IP السيرفر
   - الحل: حدّث DuckDNS بالـ IP الصح
2. Port 80 مقفول
   - اختبر: `ufw status`
   - الحل: `ufw allow 80/tcp`
3. Let's Encrypt rate limit
   - استنى ساعة وحاول تاني

### مشكلة: السيرفر بطيء

```bash
# شوف استهلاك الـ RAM
docker stats --no-stream
```

لو استهلاك أكتر من 80%، ممكن تحتاج VPS أكبر.

### مشكلة: WhatsApp بيقطع كل شوية

- تأكد إن الموبايل اللي عليه الرقم متصل بالنت دايماً
- لو بيقطع كتير، الرقم ممكن يكون tagged بـ flag — جرب رقم تاني

---

## أسئلة سريعة

**س: هل الـ session هتفضل لو reboot للسيرفر؟**
ج: آه، الـ Docker volumes بتفضل. مش هتحتاج تـ scan QR تاني.

**س: كم رسالة ممكن أبعت؟**
ج: الـ default 80/يوم. ممكن تزود لـ 150 لكن خطر الحظر بيزيد.

**س: لو الرقم اتحظر إيه أعمل؟**
ج: استخدم رقم جديد. اعمل reset session زي ما فوق.

**س: ممكن أربط أكتر من رقم؟**
ج: ع البريدج الواحد، رقم واحد فقط. لو محتاج تاني، اشغل بريدج تاني على port مختلف.

**س: ممكن أبعت صور؟**
ج: حالياً النص بس. الصور هتكون في V19.31.

---

## دعم

لو حصلت مشكلة:
1. شوف الـ logs: `docker compose logs -f`
2. ابعت screenshot من الـ error
