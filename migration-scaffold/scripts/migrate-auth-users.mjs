/* ════════════════════════════════════════════════════════════════════════
   CLARK — Auth migration: Firebase Auth → Supabase Auth (P3)
   ════════════════════════════════════════════════════════════════════════
   بينقل المستخدمين بكلمات سرّهم (Firebase بيستخدم scrypt — Supabase/GoTrue
   بيدعم استيراد الـ hash، فالمستخدم بيفضل يدخل بنفس كلمة السر).

   ⚠️ قرار مطلوب (خطة §11): استيراد hashes ولا reset للكل؟ السكريبت ده
   بيعمل الاستيراد. لو فضّلنا reset، نستخدم adminCreateUser بكلمة سر مؤقتة بدله.

   المتطلبات للاستيراد بالـ hash:
     1. صدّر مستخدمي Firebase + معاملات الـ hash:
        firebase auth:export users.json --project clarkfactorymanagement
        firebase auth:export --format=json ...   # + hash params من الـ Console
        (Authentication → ⋮ → Password hash parameters: signer_key, salt_separator,
         rounds, mem_cost)
     2. Supabase: استيراد الـ hash بيتعمل عبر إدخال صفوف في auth.users مباشرة
        (service-role + SQL) بصيغة firebase-scrypt المدعومة، أو عبر أداة
        supabase auth import. التفاصيل أدناه.

   الاستخدام:
     node scripts/migrate-auth-users.mjs --file users.json --dry-run
     node scripts/migrate-auth-users.mjs --file users.json
   ════════════════════════════════════════════════════════════════════════ */

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const DRY = process.argv.includes("--dry-run");
const fileArg = (() => { const i = process.argv.indexOf("--file"); return i >= 0 ? process.argv[i + 1] : null; })();
if (!fileArg) { console.error("✗ مرّر --file users.json (من firebase auth:export)"); process.exit(1); }

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } });

const exported = JSON.parse(fs.readFileSync(fileArg, "utf8"));
const users = exported.users || exported; // firebase auth:export يلفّها في {users:[...]}

console.log(`\n🔐 هجرة Auth: ${users.length} مستخدم ${DRY ? "(DRY-RUN)" : ""}\n`);

let ok = 0, fail = 0;
for (const u of users) {
  const email = u.email;
  if (!email) { console.warn("  ⚠️ تخطّي مستخدم بدون بريد:", u.localId); continue; }
  if (DRY) { console.log("  • " + email); ok++; continue; }

  /* ملاحظة: استيراد scrypt hash لـ Supabase بيتطلب إدراج صف auth.users
     بـ encrypted_password بصيغة GoTrue المدعومة. أبسط مسار عملي:
       أ) لو الـ hashes متاحة وعايز تحافظ على كلمات السر → استخدم
          `supabase` CLI / migration SQL لإدراج الصفوف مع الـ scrypt params.
       ب) لو مقبول reset → createUser بكلمة سر مؤقتة + send recovery email.
     السكريبت ده بيعمل (ب) كـ fallback آمن وموثّق. بدّله للمسار (أ) بعد
     قرار §11. */
  const { data, error } = await supa.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { displayName: u.displayName || "", migratedFromFirebase: true, firebaseUid: u.localId },
    // كلمة سر مؤقتة عشوائية — المستخدم يعمل reset عند أول دخول (مسار ب).
    password: "Clark!" + Math.random().toString(36).slice(2, 12),
  });
  if (error) { console.error(`  ✗ ${email}:`, error.message); fail++; }
  else { console.log(`  ✓ ${email}`); ok++; }
}

console.log(`\n── الإجمالي ──  ok=${ok}  fail=${fail}\n`);
if (!DRY && ok > 0) console.log("ℹ️ المستخدمون اتنقلوا بمسار reset (كلمة سر مؤقتة). لو عايز تحافظ على كلمات السر الأصلية، نفّذ مسار scrypt-import (تعليقات أعلاه) بعد قرار §11.");
process.exit(fail > 0 ? 2 : 0);
