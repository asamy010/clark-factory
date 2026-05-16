/* ═══════════════════════════════════════════════════════════════
   CLARK V21.9.44 — Recurring Treasury Migration (Bug 3)

   ROOT CAUSE this migration addresses:
   ─────────────────────────────────────────────────────────────
   Pre-V21.9.44, `recurringTreasury` lived as a plain array on
   factory/config. It was NEVER in SPLIT_FIELDS or PARTITIONED_FIELDS,
   so it had NO protection against the documented cross-device
   stale-write race (App.jsx:3711-3714 comment explicitly accepts
   "concurrent writes will overwrite each other" for non-split fields).

   User-reported symptom (V21.9.44 debugging session):
     "امبارح سجلت في الدفعات المتكررة في الخزنة بندين جداد من
      الموبيل وظهروا تمام لكن لما جيت اشتغلت ع الكمبيوتر لقيت
      البندين دول مش موجودين اختفو من قايمة التكرار ولكن موجودين
      بسجل الخزنة"

   The reproduction:
     1. Mobile creates recurring rules J, K → upConfig saves to
        factory/config.recurringTreasury [A..I, J, K]
     2. Mobile's same upConfig also pushes generated treasury txs
        → goes to treasuryDays/{date} (V16.74 split — SURVIVES)
     3. PC opens app; onSnapshot listener hasn't caught up yet
        OR PC stays on a stale snapshot momentarily
     4. PC user does ANY save → upConfig clones stale configDocRef
        → setDoc(factory/config, stripped, {merge:false}) →
        recurringTreasury reverted to [A..I] 🚨
     5. The treasury txs remain in treasuryDays/{date} — that's why
        the user sees them in the treasury log but NOT in the rules list

   The fix (this migration + V21.9.44 hydration in App.jsx):
   ─────────────────────────────────────────────────────────────
   Move recurringTreasury to a per-id partitioned collection:
     factory/config.recurringTreasury[]  ❌ (vulnerable)
     recurringTreasuryDocs/{ruleId}      ✅ (isolated per rule)

   Per-id collection = each rule = its own Firestore document.
   PC's stale write to factory/config can't affect documents in a
   separate collection. Same protection model as customersDocs,
   shopifyProductsDocs, etc.

   What this migration does:
   ─────────────────────────────────────────────────────────────
   1. Read cfg.recurringTreasury[] (may be empty on fresh installs)
   2. Backup the array → backups/pre-recurring-treasury-migration-{ts}
   3. For each rule:
      a. Resolve docId = rule.id (or generate if missing)
      b. Check if recurringTreasuryDocs/{docId} already exists
         - If yes + same updatedAt → skip
         - If no → setDoc with the rule (id field enforced)
   4. Atomic transaction:
      - cfg.recurringTreasury = []
      - cfg._partitionedRecurringV21944Done = true
      - cfg._partitionedRecurringV21944Done_at = timestamp
   5. Migration log entry for audit trail

   Idempotent: if the flag is already set, returns ok+skipped.

   Auth: admin Bearer token
   Body: { dryRun?: boolean }

   Returns: {
     ok, skipped?, dryRun?,
     rules_migrated, rules_skipped_existing,
     before_bytes, after_bytes_estimate, freed_kb,
     backup_doc_id, durationMs
   }
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";

const COL = "recurringTreasuryDocs";
const FLAG = "_partitionedRecurringV21944Done";

function approxBytes(v){
  try { return Buffer.byteLength(JSON.stringify(v) || "", "utf8"); }
  catch(_) { return 0; }
}
function gid(){
  return "rec_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
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
      });
    }

    const rules = Array.isArray(cfg.recurringTreasury) ? cfg.recurringTreasury : [];

    const beforeBytes = approxBytes(cfg);
    const rulesBytes = approxBytes(rules);
    const freedBytes = rulesBytes;

    /* ── DRY RUN ─────────────────────────────────────────────── */
    if(dryRun){
      /* Sample existence check — show user how many are already in collection
         (idempotency check) so they know the migration won't overwrite. */
      const sampleSize = Math.min(rules.length, 20);
      let sampleNew = 0, sampleExist = 0, sampleIdless = 0;
      for(let i = 0; i < sampleSize; i++){
        const r = rules[i];
        if(!r || !r.id){ sampleIdless++; continue; }
        const existing = await db.collection(COL).doc(r.id).get();
        if(existing.exists) sampleExist++;
        else sampleNew++;
      }

      return res.status(200).json({
        ok: true,
        dryRun: true,
        rules_count: rules.length,
        before_bytes: beforeBytes,
        before_kb: Math.round(beforeBytes / 1024),
        rules_kb: Math.round(rulesBytes / 1024),
        will_free_kb: Math.round(freedBytes / 1024),
        after_bytes_estimate: beforeBytes - freedBytes,
        after_kb_estimate: Math.round((beforeBytes - freedBytes) / 1024),
        sample_size: sampleSize,
        sample_new: sampleNew,
        sample_exist: sampleExist,
        sample_idless: sampleIdless,
      });
    }

    /* ── ACTUAL RUN ─────────────────────────────────────────── */

    /* Step 1: Backup the rules array */
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const backupId = "pre-recurring-treasury-migration-" + ts;
    await db.collection("backups").doc(backupId).set({
      label: "Backup قبل migration: recurringTreasury → recurringTreasuryDocs (V21.9.44)",
      autoGenerated: true,
      migrationType: "recurring-treasury-v21.9.44",
      createdAt: new Date().toISOString(),
      createdBy: auth.email || auth.uid,
      rules_count: rules.length,
      bytes_before: beforeBytes,
      recurringTreasury: rules,
    });

    /* Step 2: Write per-id docs (idempotent — don't overwrite newer state) */
    let migrated = 0;
    let skippedExisting = 0;
    let failed = 0;
    const failures = [];

    /* Process in small batches — rules are typically small (< 500 bytes each)
       so 200/batch is comfortable, but stay defensive. */
    const BATCH_SIZE = 200;
    for(let i = 0; i < rules.length; i += BATCH_SIZE){
      const slice = rules.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      const intents = [];

      for(const rule of slice){
        if(!rule || typeof rule !== "object"){ failed++; failures.push("invalid-entry"); continue; }
        const docId = rule.id || gid();
        intents.push({ rule, docId });
      }

      /* Pre-flight existence check (Promise.all for parallel) */
      const existsResults = await Promise.all(intents.map(it =>
        db.collection(COL).doc(it.docId).get()
          .then(snap => ({ ...it, exists: snap.exists, existingData: snap.exists ? snap.data() : null }))
          .catch(err => ({ ...it, exists: null, err: err.message }))
      ));

      for(const it of existsResults){
        if(it.err){
          failed++;
          failures.push(`read-failed:${it.docId}: ${it.err}`);
          continue;
        }
        if(it.exists){
          /* If subcollection version is newer (or same), don't overwrite —
             preserve any edits made after the legacy array snapshot. */
          const legacyTs = Date.parse(it.rule.updatedAt || it.rule.modifiedAt || it.rule.createdAt || 0);
          const existingTs = Date.parse(it.existingData?.updatedAt || it.existingData?.modifiedAt || it.existingData?.createdAt || 0);
          if(Number.isFinite(legacyTs) && Number.isFinite(existingTs) && legacyTs > existingTs){
            /* Legacy is strictly newer → overwrite. Enforce top-level `id`
               field so the partitioned listener picks it up (V21.9.9 pattern). */
            const docRef = db.collection(COL).doc(it.docId);
            batch.set(docRef, { ...it.rule, id: it.docId });
            migrated++;
          } else {
            skippedExisting++;
          }
          continue;
        }
        /* Fresh write into the partitioned collection. */
        const docRef = db.collection(COL).doc(it.docId);
        batch.set(docRef, { ...it.rule, id: it.docId });
        migrated++;
      }

      try {
        await batch.commit();
      } catch(batchErr){
        failed += intents.length;
        migrated -= intents.length;
        failures.push(`batch-commit-failed at offset ${i}: ${batchErr.message}`);
      }
    }

    /* Step 3: Strip cfg.recurringTreasury + set flag (only if no failures) */
    if(failed > 0){
      console.warn("[V21.9.44 migrate-recurring-treasury] migration had failures, flag NOT set:", failures.slice(0, 10));
      return res.status(200).json({
        ok: false,
        partial: true,
        message: "Migration had failures — flag NOT set, cfg.recurringTreasury preserved.",
        rules_migrated: migrated,
        rules_skipped_existing: skippedExisting,
        rules_failed: failed,
        sample_failures: failures.slice(0, 20),
        backup_doc_id: backupId,
        durationMs: Date.now() - startTs,
      });
    }

    await db.runTransaction(async (tx) => {
      const fresh = (await tx.get(cfgRef)).data() || {};
      if(fresh[FLAG]) return; /* race-protect */
      const next = { ...fresh };
      next.recurringTreasury = [];  /* set to [] rather than delete to keep field present */
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
      await db.collection("migrationLog").doc("recurring-treasury-v21.9.44-" + Date.now()).set({
        type: "recurring-treasury-v21.9.44",
        status: "success",
        rules_migrated: migrated,
        rules_skipped_existing: skippedExisting,
        bytes_before: beforeBytes,
        freed_bytes: freedBytes,
        backup_doc_id: backupId,
        by: auth.email || auth.uid,
        at: new Date().toISOString(),
      });
    } catch(_) {}

    return res.status(200).json({
      ok: true,
      rules_migrated: migrated,
      rules_skipped_existing: skippedExisting,
      rules_failed: 0,
      before_bytes: beforeBytes,
      before_kb: Math.round(beforeBytes / 1024),
      after_bytes_estimate: beforeBytes - freedBytes,
      after_kb_estimate: Math.round((beforeBytes - freedBytes) / 1024),
      freed_kb: Math.round(freedBytes / 1024),
      backup_doc_id: backupId,
      durationMs: Date.now() - startTs,
    });
  } catch(e){
    console.error("[V21.9.44 migrate-recurring-treasury] failed:", e);
    return res.status(500).json({ ok:false, error: e.message });
  }
}
