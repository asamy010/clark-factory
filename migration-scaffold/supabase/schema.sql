-- ════════════════════════════════════════════════════════════════════════
-- CLARK → Supabase — Schema (المرحلة 1: JSONB Lift & Shift)
-- ════════════════════════════════════════════════════════════════════════
-- شغّل ده في Supabase SQL Editor على المشروع الاختباري الجديد.
-- الفلسفة: نحاكي بنية Firestore 1:1 بـ JSONB → أقل تعديل في التطبيق +
-- مشكلة الـ 1MB بتختفي (صف JSONB في Postgres لحد ~1GB عبر TOAST).
--
-- 3 جداول عامة + جدولين خاصين:
--   app_docs      ← المستندات المركزية (config/sales/tasks/roleScopes)
--   day_docs      ← المجموعات اليومية { entries:[...] }  (collection, day)
--   entity_docs   ← المجموعات per-id (object كامل)         (collection, id)
--   archive_docs  ← الأرشيف الشهري                          (collection, month)
--   orders        ← seasons/{season}/orders/{id}            (season, id)
--
-- ⚠️ optimistic locking: عمود version على app_docs/orders لمنع فقدان
-- الكتابة المتزامنة (بديل runTransaction في Firestore — راجع خطة §4).
-- ════════════════════════════════════════════════════════════════════════

-- ─── extensions ──────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ════════════════════════════════════════════════════════════════════════
-- 1) المستندات المركزية
-- ════════════════════════════════════════════════════════════════════════
create table if not exists app_docs (
  doc_key    text primary key,              -- 'config' | 'sales' | 'tasks' | 'roleScopes'
  data       jsonb not null default '{}'::jsonb,
  version    bigint not null default 0,     -- optimistic lock (CAS)
  updated_at timestamptz not null default now(),
  updated_by text
);

-- ════════════════════════════════════════════════════════════════════════
-- 2) المجموعات اليومية { entries:[...] }
-- ════════════════════════════════════════════════════════════════════════
create table if not exists day_docs (
  collection text not null,                 -- 'treasuryDays' | 'salesInvoicesDays' | ...
  day        text not null,                 -- 'YYYY-MM-DD'
  data       jsonb not null default '{"entries":[]}'::jsonb,
  count      int  not null default 0,
  updated_at timestamptz not null default now(),
  primary key (collection, day)
);
create index if not exists day_docs_collection_idx on day_docs (collection);
-- استعلام نطاق تواريخ سريع لكل collection
create index if not exists day_docs_collection_day_idx on day_docs (collection, day desc);

-- ════════════════════════════════════════════════════════════════════════
-- 3) المجموعات per-id (object كامل لكل صف)
-- ════════════════════════════════════════════════════════════════════════
create table if not exists entity_docs (
  collection text not null,                 -- 'customersDocs' | 'fabricsDocs' | ...
  id         text not null,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);
create index if not exists entity_docs_collection_idx on entity_docs (collection);

-- ════════════════════════════════════════════════════════════════════════
-- 4) الأرشيف الشهري
-- ════════════════════════════════════════════════════════════════════════
create table if not exists archive_docs (
  collection text not null,                 -- 'shopifyOrdersArchive' | 'bostaDeliveriesArchive'
  month      text not null,                 -- 'YYYY-MM'
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (collection, month)
);

-- ════════════════════════════════════════════════════════════════════════
-- 5) أوامر الموسم — seasons/{season}/orders/{id}
--    (يفضل JSONB في المرحلة 1؛ مرشّح أول للـ normalize في المرحلة 2)
-- ════════════════════════════════════════════════════════════════════════
create table if not exists orders (
  season     text not null,                 -- 'WS26' ...
  id         text not null,
  data       jsonb not null default '{}'::jsonb,
  version    bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (season, id)
);
create index if not exists orders_season_idx on orders (season);

-- ════════════════════════════════════════════════════════════════════════
-- 6) جداول تشغيلية
-- ════════════════════════════════════════════════════════════════════════
create table if not exists migration_log (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════════════════
-- RLS — Row Level Security
-- ════════════════════════════════════════════════════════════════════════
-- helpers تحاكي firestore.rules. الأدوار بتتقرأ من app_docs('config').users
-- بحسب بريد المستخدم (auth.jwt()->>'email'). عدّل الشروط حسب الـ rules
-- الفعلية قبل الإنتاج (خطة §8) — دي نسخة أولية للاختبار.

-- بريد المستخدم الحالي من JWT
create or replace function clark_email() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email', '')
$$;

-- هل المستخدم موجود في config.users (أي مستخدم مصرّح)؟
create or replace function is_any_user() returns boolean
language sql stable as $$
  select exists (
    select 1 from app_docs
    where doc_key = 'config'
      and (data #> '{users}') @> jsonb_build_array(jsonb_build_object('email', clark_email()))
  )
$$;

-- هل دوره manager فأعلى؟ (مبدئي — عدّل حسب نموذج الأدوار الفعلي)
create or replace function is_manager_plus() returns boolean
language sql stable as $$
  select exists (
    select 1 from app_docs, jsonb_array_elements(app_docs.data #> '{users}') u
    where app_docs.doc_key = 'config'
      and u ->> 'email' = clark_email()
      and (u ->> 'role') in ('manager','admin','owner')
  )
$$;

-- فعّل RLS على كل الجداول
alter table app_docs     enable row level security;
alter table day_docs     enable row level security;
alter table entity_docs  enable row level security;
alter table archive_docs enable row level security;
alter table orders       enable row level security;
alter table migration_log enable row level security;

-- سياسات أولية (authenticated يقرأ، manager+ يكتب).
-- ⚠️ مبدئية للاختبار — لازم تتفصّل per-collection قبل الإنتاج (خطة §8).
do $$
declare t text;
begin
  foreach t in array array['app_docs','day_docs','entity_docs','archive_docs','orders','migration_log']
  loop
    execute format('drop policy if exists %I_read on %I', t, t);
    execute format('drop policy if exists %I_write on %I', t, t);
    execute format($p$create policy %I_read  on %I for select using (auth.role() = 'authenticated')$p$, t, t);
    execute format($p$create policy %I_write on %I for all    using (is_manager_plus()) with check (is_manager_plus())$p$, t, t);
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- Realtime — بديل onSnapshot
-- ════════════════════════════════════════════════════════════════════════
-- ضيف الجداول لـ publication بتاع Supabase Realtime عشان الكلاينت يسمع
-- postgres_changes. (الكلاينت بيشترك بـ filter doc_key=eq.config إلخ).
alter publication supabase_realtime add table app_docs;
alter publication supabase_realtime add table day_docs;
alter publication supabase_realtime add table entity_docs;
alter publication supabase_realtime add table orders;

-- ════════════════════════════════════════════════════════════════════════
-- CAS RPC — كتابة ذرّية للمستند المركزي (بديل runTransaction)
-- ════════════════════════════════════════════════════════════════════════
-- الكلاينت بيبعت النسخة المتوقعة (expected_version) + الداتا الجديدة.
-- لو النسخة على السيرفر اتغيّرت (جهاز تاني كتب) → بيرجّع conflict، والكلاينت
-- يعيد القراءة + الدمج + المحاولة. ده بيمنع فقدان الكتابة المتزامنة (§4).
create or replace function app_docs_cas(
  p_key text, p_expected_version bigint, p_data jsonb, p_by text
) returns table(ok boolean, new_version bigint, server_data jsonb)
language plpgsql as $$
declare cur_version bigint;
begin
  select version into cur_version from app_docs where doc_key = p_key for update;
  if cur_version is null then
    insert into app_docs(doc_key, data, version, updated_by) values (p_key, p_data, 1, p_by);
    return query select true, 1::bigint, p_data;
  elsif cur_version = p_expected_version then
    update app_docs set data = p_data, version = cur_version + 1,
           updated_at = now(), updated_by = p_by where doc_key = p_key;
    return query select true, cur_version + 1, p_data;
  else
    -- تعارض — رجّع نسخة السيرفر الحالية عشان الكلاينت يدمج ويعيد
    return query select false, cur_version, (select data from app_docs where doc_key = p_key);
  end if;
end $$;
