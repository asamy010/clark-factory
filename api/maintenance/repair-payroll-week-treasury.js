/* ═══════════════════════════════════════════════════════════════
   CLARK V21.9.252 — Repair Payroll Week → Treasury salary legs

   ROOT CAUSE this endpoint addresses (cross-document atomicity gap):
   ─────────────────────────────────────────────────────────────
   upConfig() persists a week-close across THREE separate Firestore
   write groups (App.jsx upConfigTx):
     1. factory/config  (setDoc)
     2. split day docs  (treasuryDays, hrLogDays, ...)   ← salary money
     3. partitioned docs (hrWeeksDocs, employeesDocs, ...) ← week.status

   These are NOT one atomic transaction. The dangerous drift:
     • a closed week (status="closed", committed in group 3) whose
       expected salary treasury entries (group 2) are absent — e.g.
       the split write partially failed, OR a later edit / cross-device
       race removed the legs while the week stayed closed.

   WHY salary specifically: advances / ws-payments / other-expenses all
   carry a stale-link recovery inside approveWeek (`_existingTx` check →
   recreate on re-close), so they self-heal. SALARY entries had NO such
   guard — a missing salary leg stayed missing forever, silently
   understating cash outflow and leaving the employee's pay unrecorded
   in the treasury ledger.

   What this endpoint does:
   ─────────────────────────────────────────────────────────────
   1. Load all weeks (hrWeeksDocs if partitioned, else cfg.hrWeeks).
   2. Load all treasury entries (treasuryDays if split, else cfg.treasury).
   3. For each CLOSED, non-analysis week that has a `closedRecords`
      snapshot: for every record with thursdayPay > 0, the treasury
      MUST contain an `hr_salary` entry for (weekId, empId). If it's
      missing → queue a replacement leg with the V21.9.250 deterministic
      id  "hrsal-<weekId>-<empId>".
   4. dryRun → report only. Apply → merge the missing legs into the
      proper treasuryDays/{date} doc (read-modify-write, NEVER overwrite),
      idempotent by entry id.
   5. Also DETECT (report only, never auto-write) the reverse drift:
      hr_salary entries whose week is not currently closed — these need
      human judgement, so we surface them for manual review.

   Idempotent: a closed week whose salary legs are all present is skipped.
   Additive-only: this endpoint NEVER deletes — every created leg is tagged
   `repairReason` and logged to migrationLog, so it's fully auditable and
   reversible (an admin can delete the tagged legs if a repair was wrong).

   Auth: admin Bearer token
   Body: { dryRun?: boolean }
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken, readSplitCollection, readPartitionedCollection } from "../_firebase.js";

const FLAG_TREASURY_SPLIT = "_splitDaysV1674Done";
const FLAG_HRWEEKS_PART   = "_partitionedV1675Done";

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function dayName(dateStr){
  if(!dateStr) return "";
  try {
    return new Date(dateStr + "T00:00:00Z").toLocaleDateString("ar-EG", { weekday: "long" });
  } catch(_) { return ""; }
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
  const who = auth.email || auth.uid || "";

  try {
    const db = getDb();
    const cfgRef = db.collection("factory").doc("config");
    const snap = await cfgRef.get();
    if(!snap.exists){
      return res.status(404).json({ ok:false, error: "factory/config doesn't exist" });
    }
    const cfg = snap.data() || {};

    /* ── Load weeks ── */
    const weeksPart = !!cfg[FLAG_HRWEEKS_PART];
    const weeks = weeksPart
      ? await readPartitionedCollection("hrWeeksDocs")
      : (Array.isArray(cfg.hrWeeks) ? cfg.hrWeeks : []);

    /* ── Load treasury ── */
    const treasurySplit = !!cfg[FLAG_TREASURY_SPLIT];
    const treasury = treasurySplit
      ? await readSplitCollection("treasuryDays")
      : (Array.isArray(cfg.treasury) ? cfg.treasury : []);

    /* Index existing salary entries by (weekId|empId) — match by the
       semantic key, NOT by id, so legacy random-gid legs count as present
       (avoids false positives on weeks closed before V21.9.250). */
    const salByKey = new Set();
    const salWeekIds = new Set();
    for(const t of treasury){
      if(t && t.sourceType === "hr_salary"){
        salByKey.add(String(t.weekId || "") + "|" + String(t.empId || ""));
        if(t.weekId) salWeekIds.add(String(t.weekId));
      }
    }
    const closedWeekIds = new Set(
      weeks.filter(w => w && w.status === "closed").map(w => String(w.id))
    );

    /* ── Scan closed weeks for missing salary legs ── */
    let weeksScanned = 0;
    let weeksWithMissing = 0;
    let legsCreated = 0;
    const legsToCreate = [];   /* {day, leg} */
    const sampleRepaired = []; /* {weekId, weekNum, date, missing, sampleEmps} */
    const daysAffected = new Set();

    for(const w of weeks){
      if(!w || typeof w !== "object") continue;
      if(w.status !== "closed") continue;
      if(w.isAnalysisOnly) continue;            /* analysis weeks never pay */
      if(!Array.isArray(w.closedRecords)) continue; /* no snapshot → can't know expected */
      weeksScanned++;

      const date = String(w.closedAt || w.actualClosedAt || "").slice(0, 10);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue; /* can't resolve day doc */
      const dayN = dayName(date);

      let weekMissing = 0;
      const sampleEmps = [];
      for(const rec of w.closedRecords){
        if(!rec) continue;
        const pay = r2(rec.thursdayPay);
        if(pay <= 0) continue;                  /* nothing paid → no entry expected */
        const key = String(w.id) + "|" + String(rec.empId);
        if(salByKey.has(key)) continue;         /* already present (legacy or new) */

        /* MISSING — recreate with the V21.9.250 deterministic id. */
        legsToCreate.push({
          day: date,
          leg: {
            id: "hrsal-" + w.id + "-" + rec.empId,
            type: "out",
            amount: pay,
            desc: "مرتب " + (rec.empName || "") + " W" + (w.weekNum != null ? w.weekNum : ""),
            notes: "",
            category: "مرتبات",
            account: "SUB CASH",
            season: cfg.activeSeason || "",
            date,
            day: dayN,
            sourceType: "hr_salary",
            weekId: w.id,
            empId: rec.empId,
            by: w.closedBy || who,
            createdAt: new Date().toISOString(),
            repairedAt: new Date().toISOString(),
            repairedBy: who,
            repairReason: "v21.9.252-payroll-salary-leg-recovery",
          },
        });
        /* Defense-in-depth: don't double-count if the same key recurs. */
        salByKey.add(key);
        weekMissing++;
        legsCreated++;
        daysAffected.add(date);
        if(sampleEmps.length < 4) sampleEmps.push({ emp: rec.empName || rec.empId, amount: pay });
      }

      if(weekMissing > 0){
        weeksWithMissing++;
        if(sampleRepaired.length < 10){
          sampleRepaired.push({
            weekId: w.id,
            weekNum: w.weekNum,
            date,
            missing: weekMissing,
            sampleEmps,
          });
        }
      }
    }

    /* ── Reverse drift (report only) — salary legs whose week isn't closed.
       Never auto-fixed: could mean a week was reopened but legs lingered,
       which needs a human decision. */
    let orphanSalaryWeeks = 0;
    const orphanSalarySample = [];
    for(const wid of salWeekIds){
      if(!closedWeekIds.has(wid)){
        orphanSalaryWeeks++;
        if(orphanSalarySample.length < 10) orphanSalarySample.push(wid);
      }
    }

    const baseStats = {
      weeks_scanned: weeksScanned,
      weeks_with_missing_salary: weeksWithMissing,
      salary_legs_to_create: legsToCreate.length,
      days_affected: daysAffected.size,
      sample_repaired: sampleRepaired,
      orphan_salary_weeks: orphanSalaryWeeks,
      orphan_salary_sample: orphanSalarySample,
      treasury_split: treasurySplit,
      weeks_partitioned: weeksPart,
    };

    /* ── DRY RUN ── */
    if(dryRun){
      return res.status(200).json({ ok:true, dryRun:true, ...baseStats });
    }

    /* ── Nothing to do ── */
    if(legsToCreate.length === 0){
      return res.status(200).json({
        ok: true,
        message: "مفيش أسابيع مقفولة ناقصها حركات مرتب — كله سليم",
        salary_legs_created: 0,
        ...baseStats,
        durationMs: Date.now() - startTs,
      });
    }

    /* ── APPLY — additive merge (never overwrite) ── */
    const legsByDay = new Map();
    for(const { day, leg } of legsToCreate){
      if(!legsByDay.has(day)) legsByDay.set(day, []);
      legsByDay.get(day).push(leg);
    }

    let daysWritten = 0;
    if(treasurySplit){
      for(const [day, newLegs] of legsByDay){
        const dayRef = db.collection("treasuryDays").doc(day);
        /* Atomic read-modify-write per day — mirrors syncSplitCollection. */
        const wrote = await db.runTransaction(async (tx) => {
          const daySnap = await tx.get(dayRef);
          const entries = (daySnap.exists && Array.isArray(daySnap.data()?.entries))
            ? daySnap.data().entries : [];
          const existingIds = new Set(entries.map(e => String(e?.id || "")));
          const fresh = newLegs.filter(l => !existingIds.has(String(l.id)));
          if(fresh.length === 0) return false;
          const merged = [...fresh, ...entries]; /* prepend — treasury unshift convention */
          tx.set(dayRef, {
            entries: merged,
            count: merged.length,
            updatedAt: new Date().toISOString(),
            repairTouched: true,
            repairAt: new Date().toISOString(),
          }, { merge: true });
          return true;
        });
        if(wrote) daysWritten++;
      }
    } else {
      /* Legacy pre-V16.74 — write to cfg.treasury via transaction. */
      await db.runTransaction(async (tx) => {
        const fresh = (await tx.get(cfgRef)).data() || {};
        const arr = Array.isArray(fresh.treasury) ? fresh.treasury : [];
        const existingIds = new Set(arr.map(e => String(e?.id || "")));
        const allNew = legsToCreate.map(x => x.leg).filter(l => !existingIds.has(String(l.id)));
        if(allNew.length === 0) return;
        tx.set(cfgRef, { ...fresh, treasury: [...allNew, ...arr] });
        daysWritten = legsByDay.size;
      });
    }

    /* Migration log (audit trail — what was created, fully reversible) */
    try {
      await db.collection("migrationLog").doc("repair-payroll-week-treasury-v21.9.252-" + Date.now()).set({
        type: "repair-payroll-week-treasury-v21.9.252",
        status: "success",
        ...baseStats,
        salary_legs_created: legsToCreate.length,
        days_written: daysWritten,
        days_list: Array.from(daysAffected),
        by: who,
        at: new Date().toISOString(),
      });
    } catch(_) {}

    return res.status(200).json({
      ok: true,
      ...baseStats,
      salary_legs_created: legsToCreate.length,
      days_written: daysWritten,
      days_list: Array.from(daysAffected),
      durationMs: Date.now() - startTs,
    });
  } catch(e){
    console.error("[V21.9.252 repair-payroll-week-treasury] failed:", e);
    return res.status(500).json({ ok:false, error: e.message });
  }
}
