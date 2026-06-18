/* ════════════════════════════════════════════════════════════════════════
   CLARK — One-off migration: Firestore (production) → Supabase (test)
   ════════════════════════════════════════════════════════════════════════
   بيقرأ من Firestore بالـ Admin SDK (READ-ONLY — الإنتاج مايتأثرش) وبيكتب في
   Supabase الاختباري بالـ service-role key. مدفوع بالكامل من
   collections-manifest.mjs.

   الاستخدام:
     1. اعمل export لـ FIREBASE_ADMIN_CREDENTIALS (نفس قيمة Vercel الحالية).
     2. اعمل export لـ SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (المشروع الجديد).
     3. شغّل schema.sql في Supabase الأول.
     4. node scripts/migrate-from-firestore.mjs            # تنفيذ كامل
        node scripts/migrate-from-firestore.mjs --dry-run  # عدّ بس، بدون كتابة
        node scripts/migrate-from-firestore.mjs --only customersDocs,treasuryDays

   مبادئ الأمان (CLAUDE.md §0/§10):
     - الإنتاج READ-ONLY (مفيش أي write على Firestore).
     - idempotent: upsert بمفتاح ثابت → إعادة التشغيل آمنة.
     - batching: 500 صف/دفعة عشان مانخنقش Supabase.
     - تقرير في الآخر: لكل collection عدد المقروء/المكتوب/الفشل.
   ════════════════════════════════════════════════════════════════════════ */

import admin from "firebase-admin";
import { createClient } from "@supabase/supabase-js";
import {
  CENTRAL_DOCS, DAY_COLLECTIONS, ENTITY_COLLECTIONS,
  ARCHIVE_COLLECTIONS, SEASON_ORDERS, OPERATIONAL_COLLECTIONS,
} from "../supabase/collections-manifest.mjs";

const DRY = process.argv.includes("--dry-run");
const onlyArg = (() => {
  const i = process.argv.indexOf("--only");
  return i >= 0 && process.argv[i + 1] ? new Set(process.argv[i + 1].split(",")) : null;
})();
const want = (name) => !onlyArg || onlyArg.has(name);

// ─── init Firebase Admin (read-only usage) ────────────────────────────────
const raw = process.env.FIREBASE_ADMIN_CREDENTIALS;
if (!raw) { console.error("✗ FIREBASE_ADMIN_CREDENTIALS غير مضبوط"); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
const fs = admin.firestore();

// ─── init Supabase (service-role — يتخطّى RLS) ────────────────────────────
const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_URL || !SUPA_KEY) { console.error("✗ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY غير مضبوط"); process.exit(1); }
const supa = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });

const report = [];
const log = (name, read, wrote, failed) => {
  report.push({ name, read, wrote, failed });
  console.log(`  ${failed ? "⚠️" : "✓"} ${name.padEnd(28)} read=${read} wrote=${wrote}${failed ? ` failed=${failed}` : ""}`);
};

// upsert في دفعات 500
async function upsert(table, rows, conflict) {
  if (DRY || rows.length === 0) return { wrote: DRY ? 0 : rows.length, failed: 0 };
  let wrote = 0, failed = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = await supa.from(table).upsert(batch, { onConflict: conflict });
    if (error) { console.error(`    ✗ ${table} batch@${i}:`, error.message); failed += batch.length; }
    else wrote += batch.length;
  }
  return { wrote, failed };
}

// ════════════════════════════════════════════════════════════════════════
async function run() {
  console.log(`\n🚀 CLARK Firestore → Supabase migration ${DRY ? "(DRY-RUN)" : ""}\n`);

  // 1) المستندات المركزية → app_docs
  if (CENTRAL_DOCS.some(d => want(d.key))) {
    const rows = [];
    for (const d of CENTRAL_DOCS) {
      if (!want(d.key)) continue;
      const [coll, id] = d.firestore.split("/");
      const snap = await fs.collection(coll).doc(id).get();
      if (snap.exists) rows.push({ doc_key: d.key, data: snap.data(), version: 0 });
    }
    const r = await upsert("app_docs", rows, "doc_key");
    log("app_docs", rows.length, r.wrote, r.failed);
  }

  // 2) المجموعات اليومية → day_docs
  for (const coll of DAY_COLLECTIONS) {
    if (!want(coll)) continue;
    const snap = await fs.collection(coll).get();
    const rows = [];
    snap.forEach(doc => {
      const data = doc.data() || {};
      rows.push({ collection: coll, day: doc.id, data, count: Array.isArray(data.entries) ? data.entries.length : 0 });
    });
    const r = await upsert("day_docs", rows, "collection,day");
    log(coll, rows.length, r.wrote, r.failed);
  }

  // 3) المجموعات per-id → entity_docs
  for (const coll of ENTITY_COLLECTIONS) {
    if (!want(coll)) continue;
    const snap = await fs.collection(coll).get();
    const rows = [];
    snap.forEach(doc => rows.push({ collection: coll, id: doc.id, data: doc.data() || {} }));
    const r = await upsert("entity_docs", rows, "collection,id");
    log(coll, rows.length, r.wrote, r.failed);
  }

  // 4) الأرشيف الشهري → archive_docs
  for (const coll of ARCHIVE_COLLECTIONS) {
    if (!want(coll)) continue;
    const snap = await fs.collection(coll).get();
    const rows = [];
    snap.forEach(doc => rows.push({ collection: coll, month: doc.id, data: doc.data() || {} }));
    const r = await upsert("archive_docs", rows, "collection,month");
    log(coll, rows.length, r.wrote, r.failed);
  }

  // 5) أوامر الموسم seasons/{season}/orders/{id} → orders
  if (want("orders")) {
    const seasons = await fs.collection(SEASON_ORDERS.parent).listDocuments();
    const rows = [];
    for (const seasonRef of seasons) {
      const ordSnap = await seasonRef.collection(SEASON_ORDERS.sub).get();
      ordSnap.forEach(doc => rows.push({ season: seasonRef.id, id: doc.id, data: doc.data() || {}, version: 0 }));
    }
    const r = await upsert("orders", rows, "season,id");
    log("orders", rows.length, r.wrote, r.failed);
  }

  // 6) تشغيلية (migrationLog) — backups/syncJobs متخطّاة افتراضياً
  for (const op of OPERATIONAL_COLLECTIONS) {
    if (op.skipByDefault || !want(op.name)) continue;
    const snap = await fs.collection(op.name).get();
    const rows = [];
    snap.forEach(doc => rows.push({ id: doc.id, data: doc.data() || {} }));
    const r = await upsert("migration_log", rows, "id");
    log(op.name, rows.length, r.wrote, r.failed);
  }

  // ─── تقرير نهائي ─────────────────────────────────────────────────────────
  const totalRead = report.reduce((s, r) => s + r.read, 0);
  const totalWrote = report.reduce((s, r) => s + r.wrote, 0);
  const totalFailed = report.reduce((s, r) => s + r.failed, 0);
  console.log(`\n── الإجمالي ──  read=${totalRead}  wrote=${totalWrote}  failed=${totalFailed}`);
  if (totalFailed > 0) { console.error("⚠️ فيه فشل في بعض الصفوف — راجع اللوج فوق."); process.exit(2); }
  console.log("✅ تمت الهجرة بنجاح.\n");
}

run().catch(e => { console.error("✗ فشل عام:", e); process.exit(1); });
