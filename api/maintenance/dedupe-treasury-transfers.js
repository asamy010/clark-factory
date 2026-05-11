/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/maintenance/dedupe-treasury-transfers (V21.9.21)
   ───────────────────────────────────────────────────────────────
   Scan treasuryDays/{YYYY-MM-DD} day docs for duplicate transfer
   entries created by the V21.9.14 treasury approval bug.

   Background (from ISSUES_LOG.md §C2 / P6):
   Pre-V21.9.14 the treasury approval flow had a race condition:
     1. Admin clicked "تأكيد" on a pending transfer
     2. _stableMatch didn't compare the `status` field
     3. The optimistic pendingMap was cleared BEFORE the server
        write completed
     4. The UI reverted the row to "pending" → admin clicked again
     5. The ledger now had 2 sets of (in + out) legs for the same
        transferId → double-counted treasury balance

   V21.9.14 fixed the race for FUTURE transfers (3 layers of
   protection), but did NOT clean up the duplicates already in
   the ledger. Users who hit the bug between V16.x and V21.9.13
   still have phantom rows inflating their balances.

   ───────────────────────────────────────────────────────────────
   What this endpoint does:
   1. Walks every doc in treasuryDays/* (and the legacy cfg.treasury
      array if migration hasn't run yet)
   2. Groups entries by (transferId, type) — a unique transfer leg
      should appear at MOST once per (transferId, type) pair
   3. For each group with >1 entry: keep the OLDEST (by createdAt
      ascending) and mark the rest for removal
   4. Writes the cleaned entries back to the day docs
   5. Logs the operation to migrationLog
   6. Always creates a backup before any deletion

   ───────────────────────────────────────────────────────────────
   Body (optional):
     {
       dryRun?: true   -- preview only, no writes
     }

   Auth: admin Bearer
   Returns: {
     ok, dryRun, total_scanned, duplicates_found,
     entries_to_remove: 0,
     days_affected: [],
     backup_doc_id: "...",
     by_transferId: { "transfer-id-1": { kept: 2, removed: 2 }, ... }
   }
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";

const TREASURY_COLLECTION = "treasuryDays";

function newBackupId() {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return "pre-dedupe-treasury-v21.9.21-" + ts;
}

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST فقط" });
  }
  const auth = await verifyAdminToken(req.headers.authorization);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  const body = (typeof req.body === "string") ? JSON.parse(req.body || "{}") : (req.body || {});
  const dryRun = body.dryRun === true;
  const startTs = Date.now();

  try {
    const db = getDb();
    const cfgRef = db.collection("factory").doc("config");
    const cfgSnap = await cfgRef.get();
    const cfg = cfgSnap.exists ? (cfgSnap.data() || {}) : {};
    const splitActive = !!cfg._splitDaysV1674Done;

    /* Step 1: gather ALL treasury entries (from day docs OR legacy array) */
    const allEntries = []; /* { entry, source: "day:YYYY-MM-DD" | "legacy" } */
    if (splitActive) {
      const snap = await db.collection(TREASURY_COLLECTION).get();
      for (const docSnap of snap.docs) {
        const data = docSnap.data() || {};
        const entries = Array.isArray(data.entries) ? data.entries : [];
        for (const e of entries) {
          allEntries.push({ entry: e, source: "day:" + docSnap.id });
        }
      }
    } else {
      const arr = Array.isArray(cfg.treasury) ? cfg.treasury : [];
      for (const e of arr) {
        allEntries.push({ entry: e, source: "legacy" });
      }
    }

    /* Step 2: group by (transferId, type). transferId is set ONLY for
       transfer legs (category="تحويل داخلي"); regular treasury entries
       don't have it so we skip them. */
    const groups = new Map(); /* key=transferId|type → array of {entry,source} */
    for (const e of allEntries) {
      const tid = e.entry?.transferId;
      const type = e.entry?.type;
      if (!tid || !type) continue;
      const key = String(tid) + "|" + String(type);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(e);
    }

    /* Step 3: identify duplicates — any group with >1 entry */
    const duplicates = []; /* { key, transferId, type, kept, removed: [{id, source}] } */
    for (const [key, list] of groups.entries()) {
      if (list.length < 2) continue;
      /* Sort by createdAt ascending — keep the oldest */
      const sorted = list.slice().sort((a, b) => {
        const ta = a.entry?.createdAt ? new Date(a.entry.createdAt).getTime() : 0;
        const tb = b.entry?.createdAt ? new Date(b.entry.createdAt).getTime() : 0;
        return ta - tb;
      });
      const [keep, ...remove] = sorted;
      duplicates.push({
        key,
        transferId: keep.entry.transferId,
        type: keep.entry.type,
        kept_id: keep.entry.id,
        kept_source: keep.source,
        removed: remove.map(r => ({
          id: r.entry.id,
          source: r.source,
          createdAt: r.entry.createdAt,
          amount: r.entry.amount,
        })),
      });
    }

    /* Build a flat set of (source, removedId) for fast filtering */
    const removeBy = new Map(); /* source → Set<id> */
    let totalRemoved = 0;
    for (const d of duplicates) {
      for (const r of d.removed) {
        if (!removeBy.has(r.source)) removeBy.set(r.source, new Set());
        removeBy.get(r.source).add(r.id);
        totalRemoved++;
      }
    }

    if (dryRun) {
      const daysAffected = Array.from(removeBy.keys()).filter(s => s.startsWith("day:")).map(s => s.slice(4));
      return res.status(200).json({
        ok: true,
        dryRun: true,
        total_scanned: allEntries.length,
        groups_examined: groups.size,
        duplicates_found: duplicates.length,
        entries_to_remove: totalRemoved,
        days_affected: daysAffected,
        sample_duplicates: duplicates.slice(0, 10),
      });
    }

    if (totalRemoved === 0) {
      return res.status(200).json({
        ok: true,
        dryRun: false,
        total_scanned: allEntries.length,
        duplicates_found: 0,
        entries_to_remove: 0,
        message: "✨ Treasury مفيهاش duplicates — كله نظيف",
      });
    }

    /* Step 4: backup BEFORE any write */
    const backupId = newBackupId();
    const removedEntries = []; /* full entries we're about to delete */
    for (const d of duplicates) {
      for (const r of d.removed) {
        removedEntries.push({
          source: r.source,
          entry: allEntries.find(a => a.entry?.id === r.id && a.source === r.source)?.entry || null,
        });
      }
    }
    await db.collection("backups").doc(backupId).set({
      label: "Backup قبل dedupe Treasury V21.9.21",
      autoGenerated: true,
      migrationType: "dedupe-treasury-transfers-v21.9.21",
      createdAt: new Date().toISOString(),
      createdBy: auth.email || auth.uid,
      total_scanned: allEntries.length,
      duplicates_count: duplicates.length,
      entries_removed_count: totalRemoved,
      removed_entries: removedEntries,
      duplicates_summary: duplicates,
    });

    /* Step 5: write the cleaned data back */
    let daysWritten = 0;
    let legacyWritten = false;
    for (const [source, idSet] of removeBy.entries()) {
      if (source.startsWith("day:")) {
        const day = source.slice(4);
        const dayRef = db.collection(TREASURY_COLLECTION).doc(day);
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(dayRef);
          if (!snap.exists) return;
          const data = snap.data() || {};
          const entries = Array.isArray(data.entries) ? data.entries : [];
          const cleaned = entries.filter(e => !idSet.has(e?.id));
          if (cleaned.length === entries.length) return; /* nothing to remove */
          if (cleaned.length === 0) {
            tx.delete(dayRef);
          } else {
            tx.set(dayRef, {
              entries: cleaned,
              count: cleaned.length,
              updatedAt: new Date().toISOString(),
            });
          }
        });
        daysWritten++;
      } else if (source === "legacy") {
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(cfgRef);
          if (!snap.exists) return;
          const c = snap.data() || {};
          const arr = Array.isArray(c.treasury) ? c.treasury : [];
          const cleaned = arr.filter(e => !idSet.has(e?.id));
          if (cleaned.length === arr.length) return;
          tx.set(cfgRef, { treasury: cleaned }, { merge: true });
        });
        legacyWritten = true;
      }
    }

    /* Step 6: log */
    try {
      await db.collection("migrationLog").doc("dedupe-treasury-transfers-v21.9.21-" + Date.now()).set({
        type: "dedupe-treasury-transfers-v21.9.21",
        status: "success",
        total_scanned: allEntries.length,
        duplicates_count: duplicates.length,
        entries_removed: totalRemoved,
        days_written: daysWritten,
        legacy_written: legacyWritten,
        backup_doc_id: backupId,
        by: auth.email || auth.uid,
        at: new Date().toISOString(),
      });
    } catch (_) { /* non-fatal */ }

    return res.status(200).json({
      ok: true,
      dryRun: false,
      total_scanned: allEntries.length,
      duplicates_found: duplicates.length,
      entries_removed: totalRemoved,
      days_written: daysWritten,
      legacy_written: legacyWritten,
      backup_doc_id: backupId,
      durationMs: Date.now() - startTs,
      message: "✅ تم حذف " + totalRemoved + " entry مكرر من " + duplicates.length + " transfer.",
      hint: "الـ backup كامل محفوظ في backups/" + backupId + " — لو حصل مشكلة يقدر admin يـ restore.",
    });
  } catch (e) {
    console.error("[V21.9.21 dedupe-treasury-transfers] failed:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
