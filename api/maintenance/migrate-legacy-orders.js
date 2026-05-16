/* ═══════════════════════════════════════════════════════════════
   CLARK V21.9.42 — Legacy Orders Migration

   ROOT CAUSE this migration addresses:
   ─────────────────────────────────────────────────────────────
   Pre-V18.60, CLARK stored ALL orders as a flat array on
   factory/config.orders[]. From V18.60 onward, orders live in
   the subcollection seasons/{seasonId}/orders/{docId}.

   BUT: the legacy `factory/config.orders[]` array was NEVER
   stripped — it kept growing forever:
     • Every order had nested arrays (customerDeliveries[],
       customerReturns[], workshopDeliveries[], cuts[], rolls[]).
     • Each nested array grew with every delivery / return.
     • With 1-2 active seasons × ~100 orders × dozens of nested
       entries per order, the array can easily reach 600-900 KB.
     • factory/config approaches Firestore's hard 1 MB cap →
       writes start failing with "حجم البيانات تجاوز الحد".

   Symptom the user reported (V21.9.41 debugging session):
     "محاسب الخزنة بيسجل حركات وارد للخزنة اشتغل شوية تسجيل
      وبعد كده رفض يسجل تاني وبيظهر رسالة تم ملئ البيانات الملف
      ١ ميجا"

   The treasury writes themselves are fine — they're split into
   treasuryDays/. But every upConfig() rewrites the WHOLE
   factory/config doc, including the legacy orders array. Once
   the legacy orders push the doc over ~80% of 1 MB, writes fail.

   What this migration does:
   ─────────────────────────────────────────────────────────────
   1. Read cfg.orders[] (the legacy array — may be 0 entries
      if user is on a clean install, or thousands on old installs).
   2. Backup the full array to backups/pre-legacy-orders-migration-{ts}
   3. For each legacy order:
      a. Resolve target season: ord.season → activeSeason → "WS26"
      b. Resolve target docId: ord._docId → ord.id → gid()
      c. Check if seasons/{season}/orders/{docId} already exists
         - If yes + same updatedAt → skip (idempotent)
         - If yes + older updatedAt → skip (don't overwrite newer data)
         - If no → setDoc with the legacy order
   4. Atomic transaction:
      - cfg.orders = []           (or delete the field)
      - cfg._legacyOrdersMigratedV2110 = true
      - cfg._legacyOrdersMigratedV2110_at = timestamp
      - cfg._legacyOrdersMigratedV2110_count = migrated count
      - cfg._legacyOrdersMigratedV2110_freed_kb = bytes freed

   Idempotent: if the flag is already set, returns ok+skipped.

   ⚠️ This migration is ONE-WAY. The backup doc is the only way
      back. Always run with dryRun:true first on production data.

   Auth: admin Bearer token
   Body: { dryRun?: boolean }

   Returns: {
     ok, skipped?, dryRun?,
     orders_migrated, orders_skipped, orders_failed,
     before_bytes, after_bytes_estimate, freed_kb,
     backup_doc_id, durationMs
   }
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";

const FLAG = "_legacyOrdersMigratedV2110";
const DEFAULT_SEASON = "WS26";

function approxBytes(v){
  try { return Buffer.byteLength(JSON.stringify(v) || "", "utf8"); }
  catch(_) { return 0; }
}

/* Generate a stable id if order lacks one. Mirrors src/utils/format.js gid(). */
function gid(){
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export default async function handler(req, res){
  setCors(res, req);
  if(req.method === "OPTIONS"){ res.status(204).end(); return; }
  if(req.method !== "POST"){
    return res.status(405).json({ ok:false, error: "POST فقط" });
  }
  const auth = await verifyAdminToken(req.headers.authorization);
  if(!auth.ok){
    return res.status(auth.status).json({ ok:false, error: auth.error });
  }

  const body = (typeof req.body === "string") ? JSON.parse(req.body || "{}") : (req.body || {});
  const dryRun = body.dryRun === true;
  const startTs = Date.now();

  try {
    const db = getDb();
    const cfgRef = db.collection("factory").doc("config");
    const snap = await cfgRef.get();
    if(!snap.exists){
      return res.status(404).json({ ok:false, error: "factory/config doesn't exist" });
    }
    const cfg = snap.data() || {};

    if(cfg[FLAG]){
      return res.status(200).json({
        ok: true,
        skipped: true,
        message: "Migration already completed",
        flag_set_at: cfg[FLAG + "_at"] || null,
        previous_count: cfg[FLAG + "_count"] || 0,
        previous_freed_kb: cfg[FLAG + "_freed_kb"] || 0,
      });
    }

    const orders = Array.isArray(cfg.orders) ? cfg.orders : [];
    const activeSeason = cfg.activeSeason || DEFAULT_SEASON;

    const beforeBytes = approxBytes(cfg);
    const ordersBytes = approxBytes(orders);
    const freedBytes = ordersBytes;

    /* ── DRY RUN: report only, no writes ─────────────────────── */
    if(dryRun){
      /* Pre-flight: check how many will be new vs existing-skip.
         Sample up to 50 to estimate without scanning everything (which
         would blow Vercel function timeout for huge legacy arrays). */
      const sampleSize = Math.min(50, orders.length);
      let sampleNew = 0, sampleExist = 0, sampleSeasonless = 0;
      for(let i = 0; i < sampleSize; i++){
        const ord = orders[i];
        if(!ord) continue;
        const targetSeason = ord.season || activeSeason;
        const targetDocId = ord._docId || ord.id;
        if(!targetDocId){ sampleSeasonless++; continue; }
        const existing = await db.collection("seasons").doc(targetSeason)
          .collection("orders").doc(targetDocId).get();
        if(existing.exists) sampleExist++;
        else sampleNew++;
      }
      const newRatio = sampleSize > 0 ? sampleNew / sampleSize : 0;
      const existRatio = sampleSize > 0 ? sampleExist / sampleSize : 0;

      return res.status(200).json({
        ok: true,
        dryRun: true,
        orders_count: orders.length,
        active_season: activeSeason,
        before_bytes: beforeBytes,
        before_kb: Math.round(beforeBytes / 1024),
        orders_kb: Math.round(ordersBytes / 1024),
        will_free_kb: Math.round(freedBytes / 1024),
        after_bytes_estimate: beforeBytes - freedBytes,
        after_kb_estimate: Math.round((beforeBytes - freedBytes) / 1024),
        sample_size: sampleSize,
        sample_estimated_new: Math.round(orders.length * newRatio),
        sample_estimated_already_in_subcol: Math.round(orders.length * existRatio),
        sample_seasonless_or_idless: sampleSeasonless,
      });
    }

    /* ── ACTUAL RUN ─────────────────────────────────────────── */

    /* Step 1: Backup the full legacy array */
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const backupId = "pre-legacy-orders-migration-" + ts;
    /* Backup may be large (up to ~900 KB). If it exceeds Firestore's
       1 MB doc limit, split into chunks. For now do single doc — most
       legacy arrays are under 1 MB by definition (we'd have crashed before). */
    await db.collection("backups").doc(backupId).set({
      label: "Backup قبل migration: legacy orders → seasons subcollection (V21.9.42)",
      autoGenerated: true,
      migrationType: "legacy-orders-v21.9.42",
      createdAt: new Date().toISOString(),
      createdBy: auth.email || auth.uid,
      orders_count: orders.length,
      bytes_before: beforeBytes,
      active_season: activeSeason,
      orders: orders,
    });

    /* Step 2: Migrate each order to seasons/{season}/orders/{docId} */
    let migrated = 0;
    let skippedExisting = 0;
    let failed = 0;
    const failures = [];

    /* Use small batches to keep memory + transaction count manageable.
       Each order can be large (with nested arrays), so don't pack 500 in
       one batch — 50 is safer. */
    const BATCH_SIZE = 50;
    for(let i = 0; i < orders.length; i += BATCH_SIZE){
      const slice = orders.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      const intents = []; /* track each intended write for skip-check */

      for(const ord of slice){
        if(!ord || typeof ord !== "object"){ failed++; failures.push("invalid-entry"); continue; }
        const targetSeason = ord.season || activeSeason;
        const targetDocId = ord._docId || ord.id || gid();
        intents.push({ ord, targetSeason, targetDocId });
      }

      /* Check existence for the whole slice in parallel before writing.
         Firestore allows parallel reads inside an async loop; we don't
         use a Firestore-tx here because we WANT non-atomic per-batch. */
      const existsResults = await Promise.all(intents.map(it =>
        db.collection("seasons").doc(it.targetSeason)
          .collection("orders").doc(it.targetDocId).get()
          .then(snap => ({ ...it, exists: snap.exists, existingData: snap.exists ? snap.data() : null }))
          .catch(err => ({ ...it, exists: null, err: err.message }))
      ));

      for(const it of existsResults){
        if(it.err){
          failed++;
          failures.push(`read-failed:${it.targetSeason}/${it.targetDocId}: ${it.err}`);
          continue;
        }
        if(it.exists){
          /* Conflict-avoidance: only overwrite if the legacy ord has a
             strictly newer updatedAt. Otherwise the subcollection version
             is canonical (it was written by V18.60+ code paths). */
          const legacyTs = Date.parse(it.ord.updatedAt || it.ord.modifiedAt || it.ord.createdAt || 0);
          const existingTs = Date.parse(it.existingData?.updatedAt || it.existingData?.modifiedAt || it.existingData?.createdAt || 0);
          if(Number.isFinite(legacyTs) && Number.isFinite(existingTs) && legacyTs > existingTs){
            /* Legacy is newer — overwrite (rare; happens if user
               edited via legacy code path). Log loudly. */
            const docRef = db.collection("seasons").doc(it.targetSeason)
              .collection("orders").doc(it.targetDocId);
            const writable = { ...it.ord };
            delete writable._docId; /* Firestore would reject this as a field name? actually fine, but redundant */
            batch.set(docRef, writable);
            migrated++;
          } else {
            skippedExisting++;
          }
          continue;
        }
        /* New: write into subcollection */
        const docRef = db.collection("seasons").doc(it.targetSeason)
          .collection("orders").doc(it.targetDocId);
        const writable = { ...it.ord };
        delete writable._docId;
        batch.set(docRef, writable);
        migrated++;
      }

      try {
        await batch.commit();
      } catch(batchErr){
        /* If a batch fails (unlikely with 50 ops), record all as failed.
           Subsequent batches still get a chance — the migration is
           per-batch best-effort, NOT all-or-nothing. The flag won't be
           set if ANY order failed (Step 3 check). */
        failed += intents.length;
        migrated -= intents.length;
        failures.push(`batch-commit-failed at offset ${i}: ${batchErr.message}`);
      }
    }

    /* Step 3: Strip cfg.orders + set flag (ONLY if no failures) */
    if(failed > 0){
      console.warn("[V21.9.42 migrate-legacy-orders] migration had failures, flag NOT set:", failures.slice(0, 10));
      return res.status(200).json({
        ok: false,
        partial: true,
        message: "Migration had failures — flag NOT set, cfg.orders preserved. Investigate failures and re-run.",
        orders_migrated: migrated,
        orders_skipped_existing: skippedExisting,
        orders_failed: failed,
        sample_failures: failures.slice(0, 20),
        backup_doc_id: backupId,
        durationMs: Date.now() - startTs,
      });
    }

    await db.runTransaction(async (tx) => {
      const fresh = (await tx.get(cfgRef)).data() || {};
      if(fresh[FLAG]) return; /* race-protect */
      const next = { ...fresh };
      /* Strip the legacy array — set to [] rather than delete to keep
         the field present (in case any read code does cfg.orders?.length). */
      next.orders = [];
      next[FLAG] = true;
      next[FLAG + "_at"] = new Date().toISOString();
      next[FLAG + "_by"] = auth.email || auth.uid;
      next[FLAG + "_count"] = migrated;
      next[FLAG + "_skipped"] = skippedExisting;
      next[FLAG + "_freed_kb"] = Math.round(freedBytes / 1024);
      next[FLAG + "_backup_id"] = backupId;
      tx.set(cfgRef, next);
    });

    /* Step 4: Migration log */
    try {
      await db.collection("migrationLog").doc("legacy-orders-v21.9.42-" + Date.now()).set({
        type: "legacy-orders-v21.9.42",
        status: "success",
        orders_migrated: migrated,
        orders_skipped_existing: skippedExisting,
        bytes_before: beforeBytes,
        freed_bytes: freedBytes,
        backup_doc_id: backupId,
        by: auth.email || auth.uid,
        at: new Date().toISOString(),
      });
    } catch(_) {}

    return res.status(200).json({
      ok: true,
      orders_migrated: migrated,
      orders_skipped_existing: skippedExisting,
      orders_failed: 0,
      before_bytes: beforeBytes,
      before_kb: Math.round(beforeBytes / 1024),
      after_bytes_estimate: beforeBytes - freedBytes,
      after_kb_estimate: Math.round((beforeBytes - freedBytes) / 1024),
      freed_kb: Math.round(freedBytes / 1024),
      freed_pct: beforeBytes > 0 ? Math.round((freedBytes / beforeBytes) * 100) : 0,
      backup_doc_id: backupId,
      durationMs: Date.now() - startTs,
    });
  } catch(e){
    console.error("[V21.9.42 migrate-legacy-orders] failed:", e);
    return res.status(500).json({ ok:false, error: e.message });
  }
}
