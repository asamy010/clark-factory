# CLARK — بيئة الاختبار (Testing) — دليل شامل

> **الهدف:** أي تعديل يتجرّب **فعليًا** قبل ما يوصل للإنتاج — على الماك (Emulator)
> أو على الكلاود (Staging Preview) — من غير ما نلمس بيانات المستخدمين الحقيقية.
> ده بيحل مشكلة «No local test environment» اللي سبّبت regressions كتير
> (V21.9.67-69، باج التخزين...). أُضيف في **V21.27.207**.

الأحدث بيتشرح الأول: الطريقة اليومية السريعة (Emulator)، بعدين الكلاود، بعدين
الاختبارات الآلية.

---

## 0. الطبقات الأربعة للأمان (من الأرخص للأغلى)

| الطبقة | إيه بتختبر | الأمر | السرعة |
|--------|-----------|-------|--------|
| **١. Unit tests** | منطق بحت (حسابات، مصفوفات، تفقيط...) | `npm test` | ثواني (531 اختبار) |
| **٢. Rules tests** | صلاحيات Firestore (مين يقرا/يكتب إيه) | `npm run test:rules` | ~دقيقة |
| **٣. Emulator محلي** | **التطبيق الحقيقي** + Firestore/Auth/Storage وهميين | `npm run emu` + `npm run dev:emu` | يدوي (كليك) |
| **٤. Staging كلاود** | نسخة حية على لينك preload قبل الإنتاج | push على فرع التطوير | تلقائي (بعد الضبط) |

**القاعدة الجديدة:** أي تعديل بيلمس **بيانات/مالية/صلاحيات/تهيئة** → لازم يتجرّب
على الطبقة ٣ (Emulator) على الأقل قبل الدفع للإنتاج.

---

## 1. Emulator محلي على الماك (الطريقة اليومية — الأهم)

Firebase عندهم **Emulator Suite** — بيشغّل Firestore + Auth + Storage **وهميين
على جهازك**، بنفس الـ `firestore.rules` و`storage.rules` الحقيقية. التطبيق بيتوصل
بيهم بدل الإنتاج، فتقدر تعمل أي حاجة (أوردر، حركة خزنة، رفع صور، براند...) **بصفر
خطر** على بيانات المستخدمين.

### التشغيل (تيرمينالين)

```bash
# تيرمينال 1 — شغّل الـ emulator (بيفضل شغّال)
npm run emu

# تيرمينال 2 — شغّل التطبيق موصول بالـ emulator
npm run dev:emu
```

- التطبيق بيفتح على `http://localhost:5173` (Vite) — بس موصول بـ Firebase وهمي.
- لوحة الـ Emulator UI على `http://localhost:4000` — تشوف/تعدّل البيانات، الحسابات، الملفات.
- في الكونسول بتاع المتصفح هتلاقي: `🔧 CLARK متصل بالـ Firebase Emulator — بيئة اختبار، مش الإنتاج`.

> **إزاي بيشتغل تقنيًا:** `src/firebase.js` بيتوصل بالـ emulator **بس** لما
> `VITE_USE_EMULATOR=1` (وده اللي بيعمله `npm run dev:emu`). في بناء الإنتاج على
> Vercel العلَم ده مش مضبوط أبدًا → كود الـ emulator بيبقى dead code، **الإنتاج
> مطابق تمامًا** للسلوك القديم. مفيش أي تأثير على المستخدمين.

### حفظ/استرجاع البيانات بين الجلسات (اختياري)

الافتراضي: الـ emulator بيبدأ **فاضي** كل مرة. لو عايز تحتفظ بالبيانات:

```bash
npm run emu:save    # بيستورد من ./.emulator-data لو موجود، ويحفظ فيه عند الخروج
```

(المجلد `./.emulator-data` متجاهَل في git.)

### أول تشغيل

- أول مرة `npm run emu` هينزّل ملفات الـ emulator (مرة واحدة، محتاج إنترنت).
- محتاج **Java** متثبّت (الـ Firestore/Storage emulators بيحتاجوها) — على الماك:
  `brew install openjdk` لو مش موجودة.

### إيه اللي بيتختبر فعليًا هنا

- الـ **security rules** الحقيقية (نفس `firestore.rules`) — فلو تعديل هيكسر
  صلاحية، هيبان هنا مش في الإنتاج.
- **الكتابة/القراءة** الحقيقية (setDoc/runTransaction/listeners) — الـ splitting،
  الـ partitioned collections، الـ migrations... كلها بتشتغل على داتا حقيقية.
- **رفع الصور** (Storage) — بدون ما تملا الـ bucket الحقيقي.
- **الـ UX flows** — الفورمات، البوب-اب، الطباعة، التوستات.

---

## 2. Staging على الكلاود (Vercel Preview + مشروع Firebase تاني)

الفكرة: مشروع Firebase **منفصل** (`clark-staging`) ببياناته الخاصة، والتطبيق
بياخد إعداداته من **env variables** (اللي ظبطناها في `src/firebase.js` V21.27.207).
فأي push على فرع التطوير بيطلع **لينك preview حي** على بيانات staging.

### الخطوات (محتاجة حسابك — مرة واحدة)

1. **اعمل مشروع Firebase جديد** اسمه `clark-staging` (Firebase Console → Add project).
   فعّل فيه Firestore + Auth (Email/Password) + Storage.
2. **انشر الـ rules عليه:**
   ```bash
   npx firebase-tools@14 use clark-staging
   npx firebase-tools@14 deploy --only firestore:rules,storage:rules
   npx firebase-tools@14 use clarkfactorymanagement   # رجّع الافتراضي للإنتاج!
   ```
3. **هات إعدادات مشروع staging** (Project settings → Web app config): apiKey،
   authDomain، projectId، storageBucket، messagingSenderId، appId.
4. **في Vercel** (Project → Settings → Environment Variables) ضيف المتغيّرات دي
   واختار **Preview** بس (مش Production!):
   ```
   VITE_FB_API_KEY          = <staging apiKey>
   VITE_FB_AUTH_DOMAIN      = <staging authDomain>
   VITE_FB_PROJECT_ID       = clark-staging
   VITE_FB_STORAGE_BUCKET   = <staging storageBucket>
   VITE_FB_SENDER_ID        = <staging messagingSenderId>
   VITE_FB_APP_ID           = <staging appId>
   ```
5. خلاص. أي push على فرع التطوير `claude/...` → Vercel بيطلع Preview URL على
   بيانات staging. جرّب عليه، ولو تمام اعمل fast-forward على `main` (الإنتاج).

> ⚠️ **مهم:** المتغيّرات دي في **Preview** بس. الـ **Production** يفضل من غير أي
> `VITE_FB_*` → بيستخدم الإنتاج الافتراضي (fallback في الكود). لو حطيتهم بالغلط في
> Production، الإنتاج هيتوجّه لـ staging — فخليها Preview فقط.

---

## 3. اختبارات Playwright الآلية (اختياري — للمسارات الحرجة)

اختبارات متصفح بتشغّل التطبيق فعليًا (كليك حقيقي) على الـ emulator، وتتأكد إن
أهم المسارات ما اتكسرتش: تسجيل دخول → إنشاء أوردر → حركة خزنة → طباعة → براند.
Chromium متثبّت جاهز في بيئة الكلاود. **(لسه مش متعمِلة — نضيفها لما نحتاجها.)**

الشكل المتوقع لما نعملها:
```bash
npm run test:e2e     # بيشغّل emulator + vite + playwright على المسارات الحرجة
```

---

## 4. الـ workflow الموصى بعد V21.27.207

```
تعديل الكود
   ↓
npm run build           ← لازم ✓ built
npm test                ← 531 اختبار منطق
   ↓  (لو التعديل بيلمس بيانات/مالية/صلاحيات/تهيئة)
npm run emu + dev:emu    ← جرّب فعليًا على emulator (الطبقة ٣)
   ↓  (اختياري — لو عايز تجربة أقرب للإنتاج)
push فرع التطوير → Preview URL على staging  (الطبقة ٤)
   ↓
commit + push main (الإنتاج) + zip
```

**الخلاصة:** بقى فيه بيئة اختبار فعلية. للتغييرات الحسّاسة (خزنة، مرتبات، محاسبة،
migrations، rules، تهيئة Firebase) — **جرّب على الـ emulator الأول**، مش «ship and hope».
