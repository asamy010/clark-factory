/* ════════════════════════════════════════════════════════════════════════
   CLARK — Storage migration: Firebase Storage → Supabase Storage (P5)
   ════════════════════════════════════════════════════════════════════════
   بينقل كل الملفات من Firebase Storage bucket لـ Supabase buckets المطابقة
   (أول جزء من المسار = اسم الـ bucket). الإنتاج READ-ONLY (download فقط).

   ⚠️ الـ URLs المخزّنة في الـ DB: روابط Firebase getDownloadURL القديمة
   هتفضل شغّالة طول ما مشروع Firebase موجود. بعد ثبات Supabase، شغّل
   --rewrite-urls (مرحلة لاحقة) عشان يبدّل الروابط في app_docs/entity_docs/
   day_docs لروابط Supabase publicUrl. مبدئياً انقل الملفات بس.

   المتطلبات: FIREBASE_ADMIN_CREDENTIALS + SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
   الاستخدام:
     node scripts/migrate-storage.mjs --dry-run
     node scripts/migrate-storage.mjs
     node scripts/migrate-storage.mjs --prefix images/   # جزء معيّن
   ════════════════════════════════════════════════════════════════════════ */

import admin from "firebase-admin";
import { createClient } from "@supabase/supabase-js";
import { BUCKETS } from "../src/storageClient.js"; // نفس قائمة الـ buckets

const DRY = process.argv.includes("--dry-run");
const prefixArg = (() => { const i = process.argv.indexOf("--prefix"); return i >= 0 ? process.argv[i + 1] : ""; })();

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_ADMIN_CREDENTIALS)) });
const bucket = admin.storage().bucket(); // default bucket من الـ credentials

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } });

function bucketFor(path) {
  const idx = path.indexOf("/");
  const top = idx < 0 ? "images" : path.slice(0, idx);
  return BUCKETS.includes(top) ? { bucket: top, key: idx < 0 ? path : path.slice(idx + 1) } : { bucket: "images", key: path };
}

console.log(`\n🗂️  هجرة Storage ${DRY ? "(DRY-RUN)" : ""}${prefixArg ? ` prefix=${prefixArg}` : ""}\n`);

const [files] = await bucket.getFiles({ prefix: prefixArg });
let ok = 0, fail = 0, skipped = 0;

for (const file of files) {
  const path = file.name;
  if (path.endsWith("/")) { skipped++; continue; } // مجلد وهمي
  const { bucket: b, key } = bucketFor(path);
  if (DRY) { console.log(`  • ${path}  →  ${b}/${key}`); ok++; continue; }
  try {
    const [buf] = await file.download(); // READ-ONLY على Firebase
    const contentType = file.metadata?.contentType || "application/octet-stream";
    const { error } = await supa.storage.from(b).upload(key, buf, { contentType, upsert: true });
    if (error) { console.error(`  ✗ ${path}:`, error.message); fail++; }
    else ok++;
  } catch (e) { console.error(`  ✗ ${path}:`, e.message); fail++; }
}

console.log(`\n── الإجمالي ──  نُقل=${ok}  فشل=${fail}  تخطّي=${skipped}\n`);
process.exit(fail > 0 ? 2 : 0);
