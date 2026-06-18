-- ════════════════════════════════════════════════════════════════════════
-- CLARK → Supabase Storage — Buckets + Policies (P5)
-- ════════════════════════════════════════════════════════════════════════
-- شغّله بعد schema.sql. بيعمل bucket لكل top-level path كان في storage.rules.
-- السياسات أولية (authenticated يقرأ/يكتب) — فصّلها حسب storage.rules الفعلية
-- قبل الإنتاج (مثلاً invoices للقراءة للكل، الكتابة manager+).
-- ════════════════════════════════════════════════════════════════════════

-- أنشئ الـ buckets (public=true عشان getPublicUrl يشتغل زي getDownloadURL).
-- لو عايز خصوصية أعلى لبعضها، خلّيه public=false واستخدم createSignedUrl.
insert into storage.buckets (id, name, public)
values
  ('images','images',true),
  ('documents','documents',true),
  ('invoices','invoices',true),
  ('orders','orders',true),
  ('seasons','seasons',true),
  ('templates','templates',true),
  ('campaigns','campaigns',true),
  ('logos','logos',true),
  ('qr','qr',true),
  ('attachments','attachments',true),
  ('shopify-products','shopify-products',true),
  ('whatsapp-campaigns','whatsapp-campaigns',true),
  ('temp','temp',true)
on conflict (id) do nothing;

-- سياسات storage.objects — أولية للاختبار.
-- القراءة: لأي authenticated. الكتابة/الحذف: authenticated (شدّدها لـ manager+
-- per-bucket عند تفصيل RLS — P7).
drop policy if exists clark_storage_read on storage.objects;
drop policy if exists clark_storage_write on storage.objects;
drop policy if exists clark_storage_delete on storage.objects;

create policy clark_storage_read on storage.objects
  for select using (auth.role() = 'authenticated');

create policy clark_storage_write on storage.objects
  for insert with check (auth.role() = 'authenticated');

create policy clark_storage_delete on storage.objects
  for delete using (auth.role() = 'authenticated');
