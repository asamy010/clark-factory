# CLARK — خطة الهجرة الكاملة من Firebase إلى Supabase

> **الحالة:** مسودة للمراجعة (V21.27.65). الهدف: نقل CLARK بالكامل من
> Firebase (Firestore + Auth + Storage) إلى Supabase (Postgres + Auth +
> Storage + Realtime) — **بدون أي تلامس مع الإنتاج الحالي** أثناء التطوير
> والاختبار.
>
> **قرار Ahmed (2026-06-18):** نبدأ بخطة كاملة الأول، والـ Supabase
> الاختباري يبدأ بـ **نسخة من بيانات الإنتاج**.

---

## 0. الخلاصة التنفيذية (اقرأ ده الأول)

CLARK مبني على **نموذج قاعدة بيانات مستندية (document store)**: مستند مركزي
ضخم `factory/config` + ~50 collection مقسّمة (يومي / per-id)، التطبيق كله
بيشترك فيها بـ `onSnapshot` وبيعدّلها بـ `upConfig(d => {...})`. ده نمط
**Firestore-shaped**، مش relational.

عندنا فلسفتين للهجرة:

| | **A — Lift & Shift (JSONB)** | **B — Relational كامل** |
|---|---|---|
| الفكرة | نخزّن كل مستند كصف JSONB في Postgres | نعمل جدول حقيقي بأعمدة لكل collection |
| تعديل التطبيق | **بسيط** — نمط `upConfig` يفضل تقريباً زيّه | **إعادة بناء شبه كاملة** للـ data layer |
| الـ 116 api function | تعديل طبقة الوصول بس (admin SDK → supabase) | إعادة كتابة الاستعلامات كلها |
| مشكلة الـ 1MB | **بتختفي تماماً** (JSONB في Postgres لحد ~1GB) | بتختفي + استعلامات SQL حقيقية |
| المخاطرة | **منخفضة** | عالية جداً |
| الوقت | أسابيع | شهور |

### 🎯 التوصية: مسار هجين على مراحل

1. **المرحلة 1 — Lift & Shift (JSONB):** ننقل على Supabase بأقل تعديل ممكن،
   ونـ**نقتل مشكلة الـ 1MB فوراً** (السبب الجذري لمعظم آلامنا الأخيرة —
   راجع V21.27.62-64). التطبيق يشتغل زيّه بالظبط بس على Postgres.
2. **المرحلة 2 — Normalize تدريجي:** بعد ما نثبت على Supabase، نـ normalize
   الـ collections الأعلى قيمة (treasury, invoices, orders) جدول-جدول على
   مهلنا — كل واحدة لوحدها قابلة للمراجعة، بدون «big bang».

السبب: «big bang rewrite» لتطبيق بحجم CLARK = وصفة لكارثة regressions (راجع
بروتوكول §0.1). المسار الهجين بياخدنا على Postgres بأمان، ويحل الألم الحقيقي
(حدود المستند)، ويخلّي التحسين الـ relational اختيار تدريجي مش شرط أولي.

> **قرار مطلوب من Ahmed:** نمشي بالمسار الهجين (موصى به) ولا relational كامل
> من الأول؟ باقي المستند مكتوب على أساس **الهجين** مع ملاحظات الفرق.

---

## 1. كيف تختبر التطبيق الجديد بدون لمس الإنتاج (إجابة سؤالك الأصلي)

العزل بييجي طبيعي من **3 طبقات منفصلة تماماً** — الإنتاج الحالي مايتأثرش ولا 1%:

### الطبقة 1 — مشروع Supabase جديد (قاعدة بيانات معزولة)
- اعمل **Supabase project جديد** → Postgres معزول، مالوش علاقة بـ Firestore.
- نبدأه بـ **نسخة من بيانات الإنتاج** (شوف §9 — export Firestore → import Supabase).
- الأصل في Firestore مايتأثرش لأن دي نسخة منفصلة فعلياً.

### الطبقة 2 — مشروع Vercel جديد مربوط بالريبو الجديد
- ربط الريبو الجديد بـ **Vercel project منفصل** عن `clark-factory`.
- بياخد URL خاص: `clark-v22.vercel.app` (مثال).
- متغيّرات البيئة (`SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`) تتحط **في المشروع الجديد بس** — عمرها ما
  تتحط في القديم.
- كل branch/PR في الريبو الجديد بياخد **Preview URL تلقائي** للاختبار المعزول.

### الطبقة 3 — URL مختلف = مستخدمين مختلفين
- المستخدمين الحقيقيين يفضلوا على `clark-factory.vercel.app`.
- إنت تختبر على اللينك الجديد. **صفر تداخل.**

### الاختبار المحلي (الأسرع أثناء التطوير)
```bash
npm run dev   # localhost:5173
```
مع `.env.local` بيشاور على مشروع Supabase الاختباري. تجرّب على جهازك بدون deploy.

### ⛔ ممنوعات الأمان
- ❌ ماتحطّش أي Firebase config إنتاجي في الريبو الجديد.
- ❌ ماتربطش الـ Vercel الجديد بالـ **custom domain** الإنتاجي إلا يوم الـ cutover.
- ❌ ماتلمسش الريبو القديم / Firestore / متغيّرات الإنتاج إطلاقاً.
- ✅ سيب القديم شغّال زيّه لحد ما الجديد يثبت 100%.

### يوم الـ Cutover (في المستقبل، بعد التأكد)
1. migration نهائية محدّثة للبيانات Firestore → Supabase (delta من آخر نسخة).
2. تحويل الـ domain للمشروع الجديد.
3. **Rollback في ثواني:** ترجّع الـ domain للقديم لو حصل أي مشكلة (القديم
   لسه شغّال بالكامل).

---

## 2. خريطة الهجرة: Firebase → Supabase

| الخدمة الحالية (Firebase) | البديل (Supabase) | ملاحظات |
|---|---|---|
| Firestore (document store) | Postgres + JSONB | المرحلة 1 JSONB، المرحلة 2 relational |
| `onSnapshot` (real-time) | **Supabase Realtime** (postgres_changes) | نمط الاشتراك بيتغيّر — شوف §4 |
| Firebase Auth | **Supabase Auth** (GoTrue) | email/password موجود؛ شوف §6 |
| Firebase Storage | **Supabase Storage** | buckets + policies؛ شوف §7 |
| `firestore.rules` (660 سطر) | **RLS policies** (Postgres) | إعادة صياغة كاملة؛ شوف §8 |
| `storage.rules` (210 سطر) | **Storage policies** | شوف §7 |
| Admin SDK (`api/_firebase.js`) | **`@supabase/supabase-js`** بـ service-role key | شوف §5 |
| Client SDK (`src/firebase.js`) | **`@supabase/supabase-js`** بـ anon key | شوف §3 |

---

## 3. طبقة الكلاينت: `src/firebase.js` → `src/supabase.js`

### الحالي
```js
// src/firebase.js
export const auth = getAuth(app);
export const db = initializeFirestore(app, { ignoreUndefinedProperties:true, localCache:... });
export const storage = getStorage(app);
```

### الجديد
```js
// src/supabase.js
import { createClient } from "@supabase/supabase-js";
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: true, autoRefreshToken: true } }
);
```

**التغييرات الجوهرية في الكلاينت:**
- `ignoreUndefinedProperties:true` → في Postgres `undefined` لازم يتنضّف قبل
  الكتابة (helper `stripUndefined()` قبل أي `.update()` / `.insert()`).
- الـ offline cache (IndexedDB persistence) → Supabase مفيهوش offline cache
  مدمج بنفس القوة. لازم قرار: نقبل online-only (CLARK أصلاً online-only من
  V19.48!) ولا نضيف طبقة cache يدوية. **CLARK already online-only → سهل.**

---

## 4. ⭐ أصعب جزء: نموذج البيانات التفاعلي (`upConfig` + `onSnapshot`)

### الحالي (Firestore)
- `factory/config` = مستند واحد ضخم بكل الإعدادات + arrays.
- `factory/sales` + `factory/tasks` = مستندات منفصلة (split V18.x).
- ~50 collection مقسّمة: daily (`treasuryDays/{date}`) + per-id (`customersDocs/{id}`).
- التطبيق بيشترك بـ `onSnapshot` على المستند المركزي + listeners للـ splits.
- الكتابة: `upConfig(d => { d.someArray.push(...) })` → بيقرأ، يعدّل JS object،
  يكتب بـ `runTransaction` + بيـ sync الـ splits/partitions (راجع
  `splitCollections.js` + `partitionedCollections.js`).

### الجديد (Supabase) — مرحلة 1 (JSONB)
الجداول المقترحة (تحاكي البنية الحالية 1:1 = أقل مخاطرة):

```sql
-- المستندات المركزية (factory/config, sales, tasks, roleScopes)
create table app_docs (
  doc_key   text primary key,        -- 'config' | 'sales' | 'tasks' | 'roleScopes'
  data      jsonb not null default '{}',
  updated_at timestamptz default now()
);

-- المستندات اليومية (treasuryDays, auditDays, salesInvoicesDays, ...)
create table day_docs (
  collection text not null,          -- 'treasury' | 'audit' | 'salesInvoices' | ...
  day        text not null,          -- 'YYYY-MM-DD'
  data       jsonb not null default '{"entries":[]}',
  updated_at timestamptz default now(),
  primary key (collection, day)
);

-- المستندات per-id (customersDocs, suppliersDocs, ...)
create table entity_docs (
  collection text not null,          -- 'customers' | 'suppliers' | 'fabrics' | ...
  id         text not null,
  data       jsonb not null,
  updated_at timestamptz default now(),
  primary key (collection, id)
);
```

> **الفايدة الفورية:** صف JSONB في Postgres ممكن يوصل ~1GB (مع TOAST) — يعني
> **مشكلة الـ 1MB بتختفي خالص** (لكن نفضل نخلّي الـ split للأداء + Realtime
> granularity، مش للحدود).

**`upConfig` الجديدة** (نفس التوقيع، تنفيذ مختلف):
```js
async function upConfig(fn) {
  const { data: row } = await supabase.from("app_docs").select("data").eq("doc_key","config").single();
  const next = structuredClone(row.data);
  fn(next);
  // sync splits/partitions زي ما بيحصل دلوقتي (نفس splitCollections logic)
  const { error } = await supabase.from("app_docs").update({ data: stripUndefined(next) }).eq("doc_key","config");
  return error ? { ok:false, error:error.message } : { ok:true };
}
```

**الاشتراك الجديد** (بدل `onSnapshot`):
```js
supabase.channel("config")
  .on("postgres_changes", { event:"UPDATE", schema:"public", table:"app_docs", filter:"doc_key=eq.config" },
      payload => setConfigDoc(payload.new.data))
  .subscribe();
```

> ⚠️ **نقطة حرجة:** الكتابة المتزامنة من أجهزة مختلفة. Firestore بـ
> `runTransaction` بيتعامل معاها. في Postgres لازم نستخدم **optimistic
> locking** (عمود `version` + `where version = X`) أو **Postgres function
> (RPC) ذرّية** للـ mutators الحرجة (treasury, approveTransfer, approveWeek).
> ده **نفس الـ regression class** اللي البروتوكول §0.1 بيحذّر منه — لازم
> تتعمل بحرص + اختبار.

### مرحلة 2 (relational تدريجي)
نختار collection عالية القيمة (مثلاً `treasury`) ونعمل لها جدول حقيقي:
```sql
create table treasury (
  id uuid primary key default gen_random_uuid(),
  date date not null, account text, amount numeric, type text,
  source_type text, ...,
  created_at timestamptz default now()
);
create index on treasury (date);
```
ونحوّل قراءاتها/كتاباتها لاستعلامات SQL. كل collection لوحدها = PR منفصل قابل
للمراجعة + اختبار.

---

## 5. الـ 116 Serverless Function (`api/`)

**التوزيع:**
- Shopify (~45 function) — أكبر مجموعة
- Bosta (~7), Odoo, AI agent, accounting, admin, maintenance, cron triggers

**نمط التعديل (موحّد):**
- كل function بتستخدم `getAdminApp()` من `api/_firebase.js` (Admin SDK).
- نعمل `api/_supabase.js` بديل:
  ```js
  import { createClient } from "@supabase/supabase-js";
  export const supaAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  ```
- الـ service-role key بيتخطّى RLS (زي الـ Admin SDK بالظبط) — مناسب للسيرفر.
- نستبدل `.firestore().collection().doc().get()/set()` بـ
  `supaAdmin.from(table).select()/upsert()`.

**الأولوية:** الـ functions اللي بتلمس `factory/config` والـ splits الأول
(لأنها بتشارك نمط البيانات)، بعدين الـ integrations (Shopify/Bosta — دي
بتكلّم APIs خارجية، تعديلها في طبقة التخزين بس).

> ⚠️ الـ functions اللي فيها `AbortController` + timeouts (راجع §10 anti-patterns
> في CLAUDE.md) لازم تفضل بنفس الحماية بعد الهجرة.

---

## 6. المصادقة: Firebase Auth → Supabase Auth

- **الحالي:** email/password عبر Firebase Auth. `onAuthStateChanged` في
  `App.jsx:1248`. Secondary app لإنشاء users بدون logout (`getSecondaryAuth`).
- **الأدوار:** مخزّنة في `factory/config.users` + `roleScopes` (مش custom claims —
  ده يسهّل الهجرة).
- **الجديد:** Supabase Auth (GoTrue).
  - `supabase.auth.signInWithPassword({email, password})`.
  - `supabase.auth.onAuthStateChange(...)` بدل `onAuthStateChanged`.
  - إنشاء users من الأدمن: `supaAdmin.auth.admin.createUser(...)` (server-side)
    — بيحل مشكلة الـ secondary app بشكل أنظف.
- **هجرة المستخدمين:** Firebase Auth export → Supabase. كلمات السر hashed
  (scrypt) — Supabase بيدعم استيراد Firebase hashes. **قرار مطلوب:** استيراد
  الـ hashes ولا reset كلمات سر لكل المستخدمين؟

---

## 7. التخزين: Firebase Storage → Supabase Storage

- **الاستخدام:** 27 `uploadBytes` + 20 `getDownloadURL` عبر صور الطلبات،
  المرفقات، الشعارات، صور AI… (`imageStorage.js`, `attachments.js`,
  `universalAttachments.js`, `orderImages.js`).
- **الجديد:** Supabase Storage buckets:
  - `documents/`, `order-images/`, `attachments/`, `logos/`, `ai-images/`
  - `supabase.storage.from(bucket).upload(path, file)` بدل `uploadBytes`.
  - `getPublicUrl()` / `createSignedUrl()` بدل `getDownloadURL`.
- **هجرة الملفات:** سكريبت ينقل الملفات من Firebase Storage bucket لـ Supabase
  (download → upload)، ويحدّث الـ URLs المخزّنة في البيانات.
- **storage.rules → Storage policies** (RLS على bucket).

---

## 8. القواعد: `firestore.rules` (660 سطر) → RLS Policies

- **الحالي:** ~50 `match` block، كل واحد بصلاحيات مختلفة (`isAnyUser`,
  `isManagerPlus`, `isHRRole`…) معتمدة على دور المستخدم في `factory/config`.
- **الجديد:** RLS policy لكل جدول. الأدوار تتقرأ من جدول `app_docs` (config)
  أو جدول `users` مخصص. مثال:
  ```sql
  alter table day_docs enable row level security;
  create policy "read_all_auth" on day_docs for select using (auth.role() = 'authenticated');
  create policy "write_manager" on day_docs for insert with check ( is_manager_plus(auth.uid()) );
  ```
- نعمل **helper functions** في Postgres (`is_manager_plus()`, `is_hr_role()`)
  تحاكي الـ helpers في firestore.rules.

> ⚠️ تحذير البروتوكول §0.1: الـ rules cross-service. في Postgres الـ RLS
> أقوى وأوضح، بس **لازم اختبار شامل** — RLS غلط = إما block كامل أو تسريب
> صلاحيات. مفيش local test env حالياً → الـ Supabase الاختباري **هو** بيئة
> اختبار الـ RLS قبل الإنتاج. ميزة كبيرة عن الوضع الحالي.

---

## 9. هجرة البيانات: Firestore → Supabase (نسخة من الإنتاج)

**السكريبت (one-off، Node):**
1. اقرأ كل collection من Firestore بالـ Admin SDK (read-only — مايأثرش على الإنتاج).
2. حوّل لـ shape الجداول الجديدة:
   - `factory/{config,sales,tasks,roleScopes}` → صفوف في `app_docs`.
   - `*Days/{date}` → صفوف في `day_docs`.
   - `*Docs/{id}` → صفوف في `entity_docs`.
   - `seasons/{s}/orders/{id}` → جدول `orders` (أو `entity_docs` collection=orders).
3. اكتب في Supabase الاختباري بالـ service-role key.
4. تحقّق: عدد الصفوف = عدد المستندات، spot-check للقيم.

**مميزات:** نسخة كاملة واقعية للاختبار، والإنتاج read-only فمايتأثرش.
السكريبت ده هو نفسه أساس migration الـ cutover (مع delta من آخر نسخة).

---

## 10. خطة المراحل (Phased Rollout)

| المرحلة | المحتوى | المخرج |
|---|---|---|
| **P0 — Setup** | Supabase project + Vercel project + env vars + `.env.local` | بيئة معزولة شغّالة |
| **P1 — Schema** | جداول `app_docs`/`day_docs`/`entity_docs` + RLS أولية | DB جاهزة |
| **P2 — Data copy** | سكريبت الهجرة (نسخة إنتاج) | داتا واقعية للاختبار |
| **P3 — Auth** | Supabase Auth + هجرة المستخدمين + LoginScreen | تسجيل دخول شغّال |
| **P4 — Client data layer** | `supabase.js` + `upConfig` + Realtime + listeners | التطبيق بيقرأ/يكتب من Supabase |
| **P5 — Storage** | buckets + هجرة الملفات + تحديث الـ uploads | المرفقات شغّالة |
| **P6 — API functions** | الـ 116 function batch-by-batch | السيرفر شغّال |
| **P7 — RLS كامل** | كل الـ policies + اختبار صلاحيات لكل دور | أمان مكتمل |
| **P8 — اختبار شامل** | كل الـ flows الحرجة (treasury, invoices, payroll, shopify) | تأكيد |
| **P9 — Cutover** | delta migration + تحويل domain + مراقبة | إنتاج |
| **P10 — Normalize** | (تدريجي) جداول relational للـ collections عالية القيمة | تحسين مستمر |

---

## 11. المخاطر والقرارات المطلوبة

### قرارات لـ Ahmed (قبل ما نبدأ كود)
1. **هجين ولا relational كامل؟** (موصى به: هجين — §0).
2. ~~**هجرة المستخدمين:** استيراد password hashes ولا reset للكل؟~~
   ✅ **محسوم (Ahmed — 2026-06-18): Reset للكل** — كل مستخدم ياخد كلمة سر
   مؤقتة ويعمل reset عند أول دخول. ده اللي `scripts/migrate-auth-users.mjs`
   بيعمله افتراضياً (مفيش حاجة نغيّرها).
3. **Offline:** CLARK online-only أصلاً (V19.48) — نأكّد إننا مكملين online-only؟ (أسهل).
4. **الـ Realtime granularity:** نشترك على كل day_docs ولا بس الإعدادات + lazy-load الباقي؟

### المخاطر الكبيرة
- **الكتابة المتزامنة** (treasury/approve flows) — تحتاج RPC ذرّية أو optimistic
  locking. أعلى مخاطرة (§4).
- **حجم الهجرة** — 116 function + data layer كامل. لازم staging صارم، مفيش big bang.
- **الـ RLS** — اختبار لكل دور إلزامي قبل cutover.
- **التكافؤ السلوكي** — أي اختلاف دقيق بين Firestore و Postgres semantics
  (مثلاً ترتيب، null vs undefined، نوع البيانات) ممكن يسبب bugs خفية.

---

## 12. تقدير المجهود (تقريبي جداً)

- **المسار الهجين (P0–P9):** عدة أسابيع تطوير مركّز (الـ data layer + 116 function
  + auth + storage + rules + اختبار).
- **Relational كامل من الأول:** يضرب التقدير ×3–4 ويضاعف المخاطرة.

> ده **أكبر تغيير في تاريخ CLARK**. النجاح بيعتمد على: مراحل صغيرة قابلة
> للمراجعة، اختبار على نسخة الإنتاج في البيئة المعزولة، والاحتفاظ بالقديم
> شغّال للـ rollback. مفيش «اعمل deploy وادعي».

---

*آخر تحديث: V21.27.65 (2026-06-18). الخطة مسودة — في انتظار قرارات §11.*
