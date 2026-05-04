# SECURITY.md — CLARK Factory

> دليل تطبيق إصلاحات الأمان لـ V18.70.
> الإصلاحات دي **نصفها كود** ونصفها **إعدادات يدوية** في Firebase Console + Google Cloud Console + Vercel.

---

## 🔴 V18.70 — Security Phase 1: خطوات التطبيق

### ✅ الخطوة 1 — Deploy Firestore Rules + Storage Rules (مهم جداً)

الـrepo دلوقتي فيه:
- `firestore.rules`
- `storage.rules`
- `firebase.json`

**قبل ما تـdeploy:**

1. افتح `firestore.rules` وغيّر السطر ده:
   ```
   && request.auth.uid == 'REPLACE_WITH_OWNER_UID';
   ```
   حط مكان `REPLACE_WITH_OWNER_UID` الـUID بتاع حسابك من:
   Firebase Console → Authentication → Users → دور على إيميلك → User UID

2. ثبّت Firebase CLI لو مش متثبت:
   ```bash
   npm install -g firebase-tools
   firebase login
   ```

3. اربط المشروع:
   ```bash
   firebase use clarkfactorymanagement
   ```

4. اعمل deploy للـrules:
   ```bash
   firebase deploy --only firestore:rules
   firebase deploy --only storage:rules
   ```

**اختبار سريع بعد الـdeploy:**
- افتح الـapp بـuser غير مسجل دخول → لازم يفشل قراءة أي collection
- افتح بـuser viewer → لازم يقرا بس مش يكتب
- افتح بـuser admin → كل شيء يشتغل

---

### ✅ الخطوة 2 — تقييد الـAPI Key في Google Cloud Console

الـAPI key اللي في `src/firebase.js` متاح في الـclient بطبيعته (مش مشكلة حقيقية لو الـrules مفعّلة)، لكن تقييده بيمنع abuse من domains تانية.

1. افتح: https://console.cloud.google.com/apis/credentials?project=clarkfactorymanagement
2. دور على الـAPI key اللي قيمته `AIzaSyD42_SF_afFduOpaSkMNcJdy55EXV8kzKo`
3. اضغط على اسم الـkey → Edit
4. تحت **Application restrictions**:
   - اختار **HTTP referrers (web sites)**
   - ضيف:
     - `https://YOUR-VERCEL-DOMAIN.vercel.app/*`
     - `https://YOUR-CUSTOM-DOMAIN.com/*` (لو في domain مخصص)
     - `http://localhost:*` (للـdevelopment)
5. تحت **API restrictions**:
   - اختار **Restrict key**
   - فعّل **بس** الـAPIs دي:
     - Identity Toolkit API
     - Token Service API
     - Cloud Firestore API
     - Firebase Installations API
     - Firebase Cloud Messaging API (لو بتستخدمه)
     - Cloud Storage for Firebase API
6. Save

**ملاحظة:** بعد التقييد، الـapp ميشتغلش من أي domain مش في الـreferrers — اختبره على Vercel preview deploy + production + localhost قبل ما تتأكد.

---

### ✅ الخطوة 3 — إضافة BOOTSTRAP_ADMIN_UID في Vercel

ده env var بيخلي الـAPI endpoints (`delivery-sign`, `customer-portal-sign`, إلخ) تتعامل مع UID معين كـadmin بغض النظر عن `factory/config`. مهم في حالة config corruption.

1. افتح: https://vercel.com/dashboard → مشروع CLARK → Settings → Environment Variables
2. ضيف:
   - **Key:** `BOOTSTRAP_ADMIN_UID`
   - **Value:** نفس الـUID اللي حطيته في `firestore.rules`
   - **Environment:** Production + Preview + Development (الـ3 كلهم)
3. Save
4. اعمل **redeploy** للمشروع عشان الـenv var ياخد effect

---

### ✅ الخطوة 4 — تأكيد Vercel Env Vars الموجودة

افحص إن الـenv vars دي كلها موجودة في Vercel:

| Env Var | الاستخدام | لازم؟ |
|---|---|---|
| `FIREBASE_ADMIN_CREDENTIALS` | Firebase Admin SDK في الـAPI routes | ✅ مطلوب |
| `DELIVERY_CONFIRM_SECRET` | HMAC signing للـQR codes | ✅ مطلوب (≥16 حرف) |
| `CUSTOMER_PORTAL_SECRET` | HMAC للـcustomer portal | اختياري (يفول للـDELIVERY_CONFIRM_SECRET) |
| `ANTHROPIC_API_KEY` | Claude AI proxy في `api/ai.js` | لو بتستخدم AI |
| `BOOTSTRAP_ADMIN_UID` | **جديد V18.70** — admin escape hatch | ✅ مطلوب |

لو أي واحد ناقص، ضيفه قبل الـdeploy.

---

### ✅ الخطوة 5 — تأكيد الـrules اشتغلت

بعد الـdeploy:

1. افتح Firebase Console → Firestore Database → Rules → شوف إن الـrules اللي اتعملها deploy موجودة
2. روح Rules Playground (تبويب جنب الـrules) واختبر سيناريوهات:
   - **Unauthenticated read على `/factory/config`** → لازم يفشل
   - **Authenticated viewer write على `/treasuryDays/2026-01-01`** → لازم يفشل
   - **Authenticated admin write على نفس الحاجة** → لازم ينجح

---

## 🆘 لو حصلت مشكلة بعد الـdeploy

### الـapp مش بيفتح بعد الـrules deploy

غالباً الـrules فيها bug. ارجع للـconsole:
1. Firebase Console → Firestore → Rules → ارجع للـversion السابقة (مفيش rules) عشان تتعافى
2. ابعتلي error message من Firestore

### مفيش admin يقدر يدخل (config locked)

استخدم الـbootstrap admin:
1. اطمن إن `BOOTSTRAP_ADMIN_UID` متعين في Vercel
2. اطمن إن نفس الـUID في `firestore.rules`
3. سجل دخول بحساب الـbootstrap UID — هتعدي كل الـchecks

### الـAPI key restrictions كسرت الـapp

روح Google Cloud Console وامسح الـHTTP referrers مؤقتاً (سيب الـAPI restrictions). جرب الـapp تاني، وضيف الـreferrer الصح بناءً على الـerror.

---

## 📋 Checklist V18.70

- [ ] غيرت `REPLACE_WITH_OWNER_UID` في `firestore.rules`
- [ ] `firebase deploy --only firestore:rules` نجح
- [ ] `firebase deploy --only storage:rules` نجح
- [ ] قيدت الـAPI key في Google Cloud Console (HTTP referrers + API restrictions)
- [ ] ضفت `BOOTSTRAP_ADMIN_UID` في Vercel env vars (production + preview + development)
- [ ] عملت Vercel redeploy
- [ ] اختبرت scenarios في Rules Playground
- [ ] اختبرت login + read + write بـuser admin بعد الـdeploy
- [ ] اختبرت login + write بـuser viewer (لازم يفشل)

---

## 📅 الإصلاحات الجاية (V18.71+)

### V18.71 — Security Phase 2 (High)
- حماية `api/ai.js` بـauth + rate limiting
- إزالة `_debug` من `api/delivery-confirm.js`
- إضافة CSP meta + SRI لـhtml2pdf في `index.html`
- تقييد CORS على الـadmin endpoints

### V18.72 — Security Phase 3 (Medium + Low)
- إصلاح ثغرة الـ24h lock في `delivery-confirm`
- مراجعة كل `document.write` للـescape
- ترقية `xlsx`, `firebase`, `firebase-admin`
- استبدال `Math.random()` بـ`crypto.randomUUID()`
- حذف فولدر `clark-v18_68/` المكرر
- sync `package.json` version

---

**آخر تحديث:** V18.70 (2026-04-30)
