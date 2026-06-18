# CLARK_DB — سكافولدنج هجرة Supabase (P0/P1)

> الملفات دي اتجهّزت في `clark-factory/migration-scaffold/` لأن سيشن Claude
> الحالي مالوش وصول لريبو `CLARK_DB` لسه. **أول ما يتفتح الوصول، تتنقل لجذر
> `CLARK_DB`** (شيل الـ prefix `migration-scaffold/`).
>
> الخطة الكاملة: `clark-factory/docs/SUPABASE-MIGRATION-PLAN.md`.

## المحتوى

| الملف | الوجهة في CLARK_DB | الدور |
|---|---|---|
| `package.json` | `/package.json` | deps المشروع الجديد (Supabase بدل Firebase) |
| `.env.example` | `/.env.example` | قالب متغيرات البيئة |
| `src/supabase.js` | `/src/supabase.js` | كلاينت Supabase (anon) — بديل `src/firebase.js` |
| `src/dataClient.js` | `/src/dataClient.js` | `upConfig` + Realtime + قراءات — بديل طبقة بيانات App.jsx |
| `api/_supabase.js` | `/api/_supabase.js` | admin client (service-role) — بديل `api/_firebase.js` |
| `supabase/schema.sql` | `/supabase/schema.sql` | جداول JSONB + RLS + Realtime + CAS RPC |
| `supabase/collections-manifest.mjs` | `/supabase/collections-manifest.mjs` | مصدر الحقيقة لكل الـ collections |
| `scripts/migrate-from-firestore.mjs` | `/scripts/migrate-from-firestore.mjs` | نسخ بيانات الإنتاج (read-only) → Supabase |
| **P3 — Auth** | | |
| `src/auth.js` | `/src/auth.js` | بدائل signIn/signOut/onAuthChange/adminCreateUser |
| `api/admin/create-user.js` | `/api/admin/create-user.js` | إنشاء user server-side (بديل secondary app) |
| `scripts/migrate-auth-users.mjs` | `/scripts/migrate-auth-users.mjs` | نقل المستخدمين Firebase Auth → Supabase |
| **P5 — Storage** | | |
| `src/storageClient.js` | `/src/storageClient.js` | بديل imageStorage.js (نفس التوقيعات والمسارات) |
| `supabase/storage-buckets.sql` | `/supabase/storage-buckets.sql` | إنشاء الـ 13 bucket + policies أولية |
| `scripts/migrate-storage.mjs` | `/scripts/migrate-storage.mjs` | نقل الملفات Firebase Storage → Supabase |

## خطوات الإقلاع (بعد فتح الوصول)

1. **Supabase project جديد** → خد `URL` + `anon key` + `service_role key`.
2. شغّل `supabase/schema.sql` في SQL Editor.
3. `cp .env.example .env.local` واملا القيم (+ `FIREBASE_ADMIN_CREDENTIALS`
   مؤقتاً للهجرة).
4. `npm install`
5. `npm run migrate:dry` — تأكد من الأعداد بدون كتابة.
6. `npm run migrate` — النسخ الفعلي (الإنتاج READ-ONLY طول الوقت).
7. `npm run dev` — اختبر محلياً على Supabase.

## ملاحظات أمان (CLAUDE.md §0/§10)

- الإنتاج (Firestore) **READ-ONLY** في كل الخطوات — صفر كتابة عليه.
- السكريبت **idempotent** (upsert بمفاتيح ثابتة) → إعادة التشغيل آمنة.
- الـ RLS في `schema.sql` **مبدئية للاختبار** — لازم تتفصّل per-collection
  حسب `firestore.rules` قبل الإنتاج (خطة §8).
- الكتابة المتزامنة على المستند المركزي عبر `app_docs_cas` RPC (optimistic
  lock) — بديل `runTransaction`؛ ده أعلى منطقة مخاطرة (خطة §4)، تتختبر كويس.

## P3 — Auth (جاهز سكافولدنج)

1. `supabase/storage-buckets.sql` + ربط الأدوار: الأدوار بتفضل في
   `app_docs('config').users` بالبريد — نفس منطق Firebase (مش في التوكن).
2. هجرة المستخدمين: `firebase auth:export users.json` ثم
   `node scripts/migrate-auth-users.mjs --file users.json --dry-run`.
3. **قرار §11 مطلوب:** استيراد scrypt hashes (نفس كلمات السر) ولا reset
   للكل؟ السكريبت مبدئياً بيعمل reset (كلمة سر مؤقتة) — موثّق إزاي تبدّله
   لمسار الـ hash-import.

## P5 — Storage (جاهز سكافولدنج)

1. شغّل `supabase/storage-buckets.sql` (بيعمل 13 bucket + policies أولية).
2. انقل الملفات: `node scripts/migrate-storage.mjs --dry-run` ثم بدون dry-run.
3. `src/storageClient.js` بيحافظ على نفس توقيعات `imageStorage.js`
   (`uploadImageToStorage`, `deleteStorageImage`) ونفس مخطط المسار
   (`images/{folder}/{id}/...`) → call sites مش محتاجة تتغيّر.
4. الروابط القديمة (Firebase) تفضل شغّالة؛ تبديلها لـ Supabase URLs مرحلة
   لاحقة (`--rewrite-urls`) بعد ثبات Supabase.

## اللي لسه (مش جزء من السكافولدنج ده)

- نقل منطق `syncAllSplitChanges` / `syncAllPartitionedChanges` داخل `upConfig`
  (P4) — معلّم بـ `TODO(P4)` في `dataClient.js`.
- تحويل الـ 116 api function لـ `getSupaAdmin()` (P6).
- تفصيل RLS + Storage policies الكامل per-collection (P7).
