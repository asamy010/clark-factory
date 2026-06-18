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
| `scripts/migrate-from-firestore.mjs` | `/scripts/migrate-from-firestore.mjs` | نسخ الإنتاج (read-only) → Supabase |

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

## اللي لسه (مش جزء من P0/P1)

- نقل منطق `syncAllSplitChanges` / `syncAllPartitionedChanges` داخل `upConfig`
  (P4) — معلّم بـ `TODO(P4)` في `dataClient.js`.
- هجرة Auth (P3) + Storage (P5) + الـ 116 api function (P6).
- تفصيل RLS الكامل (P7).
