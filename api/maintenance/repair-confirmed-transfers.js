/* ═══════════════════════════════════════════════════════════════
   CLARK V21.9.45 — Repair Confirmed Transfers (Bug 4)

   ROOT CAUSE this migration addresses:
   ─────────────────────────────────────────────────────────────
   When an admin approves a treasury transfer (TreasuryPg.approveTransfer),
   the upConfig() mutator atomically:
     1. Sets tf.status = "confirmed" on the transfer record
     2. Pushes 2 treasury legs (out from source, in to destination)
        into d.treasury, dated tf.date

   The flow then commits:
     • factory/config write — captures tf.status update (treasuryTransfers
       lives in treasuryTransfersDays/{date} via V19.52 split — survives)
     • syncAllSplitChanges — writes the 2 new legs to treasuryDays/{tf.date}

   FAILURE MODE (the user-reported bug):
     If syncAllSplitChanges silently fails (network blip, Firestore rule
     deny, sync sequence interrupted) for the treasury legs day-doc, the
     resulting state is:
       ✅ tf.status = "confirmed"   (committed to factory/config)
       ❌ treasury legs missing in treasuryDays/{tf.date}

   The original auto-repair migration in App.jsx (`transfers-repair`,
   line 857) is GATED on `!data._splitDaysV1952Done` — meaning post-V19.52
   installs NEVER run it. So once treasuryTransfers moved to a split
   collection, the self-healing path closed. This repair endpoint re-opens
   it as an on-demand operation that works regardless of V1952 state.

   User-reported symptom (V21.9.45 debugging session):
     "محاسب الخزنة ارسل ليا طلب تحويل من الرئيسية للفرعية. عملت موافقة
      على الطلب ولكن ماظهرش في السجلات لاي خزنة"

   What this endpoint does:
   ─────────────────────────────────────────────────────────────
   1. Load all treasury transfers (from treasuryTransfersDays/* if split,
      else cfg.treasuryTransfers).
   2. Load all treasury entries (from treasuryDays/* if split, else
      cfg.treasury).
   3. For each tf with status === "confirmed":
        a. Find legs in treasury with t.transferId === tf.id
        b. Detect missing out leg (when tf.fromAccount is set)
        c. Detect missing in leg (when tf.toAccount is set)
        d. Construct and queue the missing legs
   4. Write all repairs grouped by day doc (or to cfg.treasury for
      pre-V16.74 installs).
   5. Return the count of legs created + sample of repaired transfers.

   Idempotent: a confirmed transfer with both legs already present is
   skipped silently. Re-running the endpoint is safe — it only writes
   the missing legs.

   Auth: admin Bearer token
   Body: { dryRun?: boolean }

   Returns: {
     ok, dryRun?,
     transfers_scanned, transfers_with_missing_legs,
     legs_created, legs_out_created, legs_in_created,
     days_affected, sample_repaired, durationMs
   }
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";

const FLAG_TREASURY_SPLIT = "_splitDaysV1674Done";
const FLAG_TRANSFERS_SPLIT = "_splitDaysV1952Done";

function gid(){
  return "rep_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
}
function dayName(dateStr){
  if(!dateStr) return "";
  try {
    return new Date(dateStr + "T00:00:00Z").toLocaleDateString("ar-EG", { weekday: "long" });
  } catch(_) { return ""; }
}

/* Load all entries from a daily-split collection.
   Returns array of entries flattened from each day doc. */
async function readSplitDays(db, collectionName){
  const snap = await db.collection(collectionName).get();
  const all = [];
  snap.forEach(docSnap => {
    const data = docSnap.data();
    if(data && Array.isArray(data.entries)){
      all.push(...data.entries);
    }
  });
  return all;
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

    /* ── Load transfers ── */
    const transfersSplit = !!cfg[FLAG_TRANSFERS_SPLIT];
    let transfers = [];
    if(transfersSplit){
      transfers = await readSplitDays(db, "treasuryTransfersDays");
    } else {
      transfers = Array.isArray(cfg.treasuryTransfers) ? cfg.treasuryTransfers : [];
    }

    /* ── Load treasury entries ── */
    const treasurySplit = !!cfg[FLAG_TREASURY_SPLIT];
    let treasury = [];
    if(treasurySplit){
      treasury = await readSplitDays(db, "treasuryDays");
    } else {
      treasury = Array.isArray(cfg.treasury) ? cfg.treasury : [];
    }

    /* Index treasury legs by transferId for fast lookup */
    const legsByTransferId = new Map();
    for(const t of treasury){
      if(t && t.transferId){
        if(!legsByTransferId.has(t.transferId)) legsByTransferId.set(t.transferId, []);
        legsByTransferId.get(t.transferId).push(t);
      }
    }

    /* ── Scan confirmed transfers for missing legs ── */
    let scanned = 0;
    let withMissing = 0;
    let outCreated = 0;
    let inCreated = 0;
    const legsToCreate = [];     /* {leg, day} */
    const sampleRepaired = [];   /* {tfId, amount, from, to, missing} */
    const daysAffected = new Set();

    for(const tf of transfers){
      if(!tf || typeof tf !== "object") continue;
      if(tf.status !== "confirmed") continue;
      scanned++;

      const existingLegs = legsByTransferId.get(tf.id) || [];
      const hasOut = existingLegs.some(t => t.type === "out");
      const hasIn  = existingLegs.some(t => t.type === "in");

      const date = String(tf.date || "").slice(0, 10);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){
        /* Skip transfers with invalid dates — can't determine day doc */
        continue;
      }

      const dayN = dayName(date);
      const missing = [];

      /* Out leg — only if fromAccount set */
      if(!hasOut && tf.fromAccount){
        legsToCreate.push({
          day: date,
          leg: {
            id: gid(),
            type: "out",
            amount: Number(tf.amount) || 0,
            desc: "تحويل إلى " + tf.toAccount + (tf.note ? " — " + tf.note : ""),
            notes: "",
            category: "تحويل داخلي",
            account: tf.fromAccount,
            season: cfg.activeSeason || "",
            date,
            day: dayN,
            transferId: tf.id,
            by: tf.sentBy || tf.approvedBy || (auth.email || auth.uid),
            createdAt: new Date().toISOString(),
            repairedAt: new Date().toISOString(),
            repairedBy: auth.email || auth.uid,
            repairReason: "v21.9.45-confirmed-transfer-legs-recovery",
          },
        });
        outCreated++;
        missing.push("out");
        daysAffected.add(date);
      }

      /* In leg — only if toAccount set */
      if(!hasIn && tf.toAccount){
        legsToCreate.push({
          day: date,
          leg: {
            id: gid(),
            type: "in",
            amount: Number(tf.amount) || 0,
            desc: "تحويل من " + tf.fromAccount + (tf.note ? " — " + tf.note : ""),
            notes: "",
            category: "تحويل داخلي",
            account: tf.toAccount,
            season: cfg.activeSeason || "",
            date,
            day: dayN,
            transferId: tf.id,
            by: tf.sentBy || tf.approvedBy || (auth.email || auth.uid),
            createdAt: new Date().toISOString(),
            repairedAt: new Date().toISOString(),
            repairedBy: auth.email || auth.uid,
            repairReason: "v21.9.45-confirmed-transfer-legs-recovery",
          },
        });
        inCreated++;
        missing.push("in");
        daysAffected.add(date);
      }

      if(missing.length > 0){
        withMissing++;
        if(sampleRepaired.length < 10){
          sampleRepaired.push({
            tfId: tf.id,
            amount: Number(tf.amount) || 0,
            from: tf.fromAccount || "",
            to:   tf.toAccount || "",
            date,
            missing: missing.join("+"),
          });
        }
      }
    }

    /* ── DRY RUN: report only ── */
    if(dryRun){
      return res.status(200).json({
        ok: true,
        dryRun: true,
        transfers_scanned: scanned,
        transfers_with_missing_legs: withMissing,
        legs_to_create: legsToCreate.length,
        legs_out_to_create: outCreated,
        legs_in_to_create: inCreated,
        days_affected: daysAffected.size,
        sample_repaired: sampleRepaired,
        treasury_split: treasurySplit,
        transfers_split: transfersSplit,
      });
    }

    /* ── ACTUAL RUN: write the legs ── */
    if(legsToCreate.length === 0){
      return res.status(200).json({
        ok: true,
        message: "مفيش transfers محتاجة repair — كله سليم",
        transfers_scanned: scanned,
        legs_created: 0,
        durationMs: Date.now() - startTs,
      });
    }

    /* Group new legs by day doc */
    const legsByDay = new Map();
    for(const { day, leg } of legsToCreate){
      if(!legsByDay.has(day)) legsByDay.set(day, []);
      legsByDay.get(day).push(leg);
    }

    if(treasurySplit){
      /* Write to treasuryDays/{date}.
         CRITICAL: read existing entries, MERGE with new legs, write back.
         Never overwrite — that would wipe entries from other transactions
         on the same day (V16.75 lesson). */
      for(const [day, newLegs] of legsByDay){
        const dayRef = db.collection("treasuryDays").doc(day);
        const daySnap = await dayRef.get();
        let entries = [];
        if(daySnap.exists){
          const data = daySnap.data();
          entries = Array.isArray(data?.entries) ? data.entries : [];
        }
        /* Defense in depth: skip any leg whose id already exists in entries
           (idempotency for re-runs against the same data). */
        const existingIds = new Set(entries.map(e => String(e?.id || "")));
        const fresh = newLegs.filter(l => !existingIds.has(String(l.id)));
        if(fresh.length === 0) continue;
        /* Prepend (treasury uses unshift convention — newest first) */
        const merged = [...fresh, ...entries];
        await dayRef.set({
          entries: merged,
          count: merged.length,
          updatedAt: new Date().toISOString(),
          repairTouched: true,
          repairAt: new Date().toISOString(),
        }, { merge: true });
      }
    } else {
      /* Pre-V16.74 install — write to cfg.treasury directly.
         Use a transaction to avoid stale-write collision. */
      await db.runTransaction(async (tx) => {
        const fresh = (await tx.get(cfgRef)).data() || {};
        const arr = Array.isArray(fresh.treasury) ? fresh.treasury : [];
        const existingIds = new Set(arr.map(e => String(e?.id || "")));
        const allNew = legsToCreate.map(x => x.leg).filter(l => !existingIds.has(String(l.id)));
        if(allNew.length === 0) return;
        const next = { ...fresh, treasury: [...allNew, ...arr] };
        tx.set(cfgRef, next);
      });
    }

    /* Migration log */
    try {
      await db.collection("migrationLog").doc("repair-confirmed-transfers-v21.9.45-" + Date.now()).set({
        type: "repair-confirmed-transfers-v21.9.45",
        status: "success",
        transfers_scanned: scanned,
        transfers_with_missing_legs: withMissing,
        legs_created: legsToCreate.length,
        legs_out_created: outCreated,
        legs_in_created: inCreated,
        days_affected: Array.from(daysAffected),
        sample_repaired: sampleRepaired,
        by: auth.email || auth.uid,
        at: new Date().toISOString(),
      });
    } catch(_) {}

    return res.status(200).json({
      ok: true,
      transfers_scanned: scanned,
      transfers_with_missing_legs: withMissing,
      legs_created: legsToCreate.length,
      legs_out_created: outCreated,
      legs_in_created: inCreated,
      days_affected: daysAffected.size,
      days_list: Array.from(daysAffected),
      sample_repaired: sampleRepaired,
      treasury_split: treasurySplit,
      transfers_split: transfersSplit,
      durationMs: Date.now() - startTs,
    });
  } catch(e){
    console.error("[V21.9.45 repair-confirmed-transfers] failed:", e);
    return res.status(500).json({ ok:false, error: e.message });
  }
}
