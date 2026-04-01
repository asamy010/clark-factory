# دليل إعداد Firebase والنشر الأونلاين - خطوة بخطوة

## الخطوة 1: إنشاء مشروع Firebase (5 دقائق)

1. افتح **https://console.firebase.google.com**
2. سجل دخول بحساب Google (Gmail)
3. اضغط **"Create a project"** (انشاء مشروع)
4. اكتب اسم المشروع: **clark-factory**
5. اضغط **Continue**
6. في صفحة Google Analytics اختار **OFF** (مش محتاجينه) واضغط **Create Project**
7. استنى شوية لحد ما المشروع يتعمل واضغط **Continue**

---

## الخطوة 2: تفعيل تسجيل الدخول (Authentication)

1. في القائمة الجانبية اضغط **Build** ثم **Authentication**
2. اضغط **Get Started**
3. في تاب **Sign-in method** اضغط على **Email/Password**
4. فعّل **Enable** واضغط **Save**

---

## الخطوة 3: إنشاء قاعدة البيانات (Firestore)

1. في القائمة الجانبية اضغط **Build** ثم **Firestore Database**
2. اضغط **Create Database**
3. اختار **Start in test mode** (وضع الاختبار)
4. اختار أقرب موقع سيرفر (eur3 أو nam5) واضغط **Create**

### تعديل قواعد الأمان (مهم):
1. في Firestore اضغط تاب **Rules**
2. استبدل الكود الموجود بالكود ده:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

3. اضغط **Publish**

> ده معناه إن أي حد مسجل دخول يقدر يقرأ ويكتب البيانات

---

## الخطوة 4: إنشاء تطبيق ويب والحصول على الكونفيج

1. في الصفحة الرئيسية للمشروع، اضغط على أيقونة الويب **</>**
2. اكتب اسم التطبيق: **clark-web** واضغط **Register app**
3. هتظهرلك بيانات الكونفيج زي كده:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyB.....................",
  authDomain: "clark-factory.firebaseapp.com",
  projectId: "clark-factory",
  storageBucket: "clark-factory.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

4. **انسخ البيانات دي** (هتحتاجها في الخطوة الجاية)
5. اضغط **Continue to console**

---

## الخطوة 5: وضع بيانات Firebase في المشروع

1. فك الضغط عن ملف **clark-online-project.zip**
2. افتح ملف **src/firebase.js** بأي محرر نصوص (Notepad++)
3. استبدل البيانات الوهمية ببيانات مشروعك:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY_HERE",        // غيّر ده
  authDomain: "YOUR_PROJECT.firebaseapp.com",  // غيّر ده
  projectId: "YOUR_PROJECT_ID",       // غيّر ده
  storageBucket: "YOUR_PROJECT.appspot.com",  // غيّر ده
  messagingSenderId: "000000000000",  // غيّر ده
  appId: "YOUR_APP_ID"               // غيّر ده
};
```

4. احفظ الملف

---

## الخطوة 6: رفع المشروع على GitHub

1. ادخل **https://github.com** (لو مش عندك حساب اعمل واحد)
2. اضغط **+** ثم **New repository**
3. الاسم: **clark-online** واضغط **Create**
4. ارفع كل الملفات من مجلد المشروع:
   - `index.html`
   - `package.json`
   - `vite.config.js`
   - مجلد `src/` بالملفات اللي جواه

### رفع مجلد src:
- اضغط **Add file** > **Create new file**
- اكتب **src/firebase.js** (بيعمل المجلد تلقائي)
- الصق محتوى الملف واضغط **Commit**
- كرر لملف **src/main.jsx** و **src/App.jsx**

---

## الخطوة 7: النشر على Vercel

1. ادخل **https://vercel.com/signup** وسجل بـ GitHub
2. اختار مشروع **clark-online** واضغط **Import**
3. Framework: **Vite**
4. اضغط **Deploy**
5. استنى دقيقتين وهيكون عندك رابط شغال!

---

## كيفية الاستخدام

### أول مرة:
1. افتح الرابط
2. اضغط **"انشاء حساب"**
3. ادخل اسمك + ايميل + كلمة مرور (6 حروف على الأقل)
4. هتدخل على التطبيق مباشرة

### اضافة مستخدمين:
- كل شخص يفتح الرابط ويعمل حساب بنفسه
- كل المستخدمين هيشوفوا **نفس البيانات**
- أي تعديل من أي جهاز بيظهر فوراً عند الكل

---

## مميزات النسخة الأونلاين

- بيانات مشتركة بين كل المستخدمين على كل الأجهزة
- تحديث فوري في الوقت الحقيقي (Real-time sync)
- تسجيل دخول آمن بالايميل وكلمة المرور
- البيانات محفوظة على سيرفرات Google (Firebase)
- مجاني تماماً (حتى 50,000 قراءة / 20,000 كتابة يومياً)

---

## حل مشاكل شائعة

### "Firebase: Error (auth/configuration-not-found)"
- تأكد إنك وضعت بيانات Firebase الصحيحة في `src/firebase.js`

### "Permission denied"
- تأكد إنك عدّلت قواعد Firestore (الخطوة 3)

### الصفحة مش بتحمل
- افتح F12 > Console وشوف الأخطاء
- تأكد إن كل الملفات اترفعت صح على GitHub

### البيانات مش بتظهر عند مستخدم تاني
- تأكد إن الاتنين سجلوا دخول
- تأكد إن الاتنين بيستخدموا نفس الرابط
