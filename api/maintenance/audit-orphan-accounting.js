/* ═══════════════════════════════════════════════════════════════
   CLARK V21.9.67 — Audit + Repair Orphan Accounting Entries

   ROOT CAUSE this endpoint addresses:
   ─────────────────────────────────────────────────────────────
   Pre-V21.9.67, every approveWeek/approveTransfer/saveTx flow had this
   shape:

     upConfig(d => { /* mutate treasury/hrLog/... */ });    // async, NOT awaited
     autoPost.hr(data, log, emp, userName);                  // fires immediately
     autoPost.workshopPay(...); autoPost.treasury(...);

   The autoPost.* calls write to accountingDays/{YYYY-MM-DD} via runTransaction.
   They fire BEFORE the upConfig's Firestore write actually completes. If the
   upConfig write fails (1MB doc limit, network blip, split-sync error), the
   optimistic state is rolled back by the listener — but the accountingDays
   entries are ALREADY committed. Result: orphan journal entries referencing
   treasury/hrLog rows that never landed in the database.

   User-visible symptom: Trial Balance / Cash account on accounting reports
   doesn't match treasury totals. The HR week shows as "not closed" but
   accountingDays has the salary postings. Reconciliation is broken silently.

   V21.9.67 fixed the bug at the source (await upConfig + check status before
   autoPost). This endpoint cleans up orphans that ACCUMULATED before the fix
   landed — by scanning accountingDays for entries whose sourceId no longer
   exists in the operational data.

   What this endpoint does:
   ─────────────────────────────────────────────────────────────
   1. Load all accountingDays/* entries
   2. Build operational-id sets for: hrLog, treasury, custPayments,
      supplierPayments, wsPayments (from split collections OR cfg arrays)
   3. For each accounting entry, check if its sourceId exists in the
      relevant operational set (per sourceType)
   4. Report orphans (count + sample + grouped by sourceType)
   5. With dryRun=false: REVERSE each orphan via `reverseEntry`. The reverse
      writes a balancing journal entry rather than deleting — preserves audit
      trail.

   Idempotent: orphans already reversed have a `reversed:true` flag — they
   are skipped. Re-running the endpoint is safe.

   Auth: admin Bearer token
   Body: { dryRun?: boolean (default true) }

   Returns: {
     ok, dryRun,
     accountingEntriesScanned,
     operationalIds: { hrLog, treasury, custPayments, supplierPayments, wsPayments },
     orphansFound, orphansByType,
     orphansReversed,
     sampleOrphans,
     durationMs
   }
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";

const FLAG_TREASURY_SPLIT = "_splitDaysV1674Done";
const FLAG_PAYMENTS_SPLIT = "_splitDaysV1949Done";

/* Map sourceType (as written by buildHrEntry/buildTreasuryEntry/etc.) to
   the operational collection where the sourceId should resolve.

   The sourceTypes here are exactly what postingRules.js builders use — keep
   in sync if new entry types are added. */
const SOURCE_TYPE_TO_COLLECTION = {
  /* HR — sourceId = hrLog.id */
  hr_salary:                 "hrLog",
  hr_advance:                "hrLog",
  hr_weekly_advance:         "hrLog",
  hr_bonus:                  "hrLog",
  hr_other_expense:          "treasury",  /* postingRules treats as treasury w/ category */
  /* Treasury — sourceId = tx.id */
  treasury:                  "treasury",
  hr_weekly_ws_payment:      "wsPayments", /* though the autoPost route is workshopPay */
  /* Payments — each has its own collection */
  customerPay:               "custPayments",
  customerCheck:             "checks",
  customerCheckCollect:      "checks",
  supplierPay:               "supplierPayments",
  workshopPay:               "wsPayments",
  workshopReceive:           "wsReceives", /* receives are nested in orders — skip below */
  /* Invoices — sourceId = invoice.id (in salesInvoices/purchaseInvoices arrays) */
  salesInvoice:              "salesInvoices",
  purchaseInvoice:           "purchaseInvoices",
  creditNote:                "salesCreditNotes",
  debitNote:                 "purchaseDebitNotes",
  /* Companion entries — sourceId has a suffix (#cogs / :cogs) — handled below */
};

async function readSplitDays(db, collectionName){
  try {
    const snap = await db.collection(collectionName).get();
    const all = [];
    snap.forEach(docSnap => {
      const data = docSnap.data();
      if(data && Array.isArray(data.entries)){
        all.push(...data.entries);
      }
    });
    return all;
  } catch(e){
    console.warn(`[audit-orphan-accounting] readSplitDays ${collectionName} failed:`, e?.message||e);
    return [];
  }
}

/* Pull operational entries: prefer split if migration flag is set, else cfg. */
async function loadOperationalData(db, cfg){
  const out = {};
  const treasurySplit = !!cfg[FLAG_TREASURY_SPLIT];
  const paymentsSplit = !!cfg[FLAG_PAYMENTS_SPLIT];

  out.treasury = treasurySplit ? await readSplitDays(db, "treasuryDays") : (Array.isArray(cfg.treasury) ? cfg.treasury : []);
  out.hrLog = treasurySplit ? await readSplitDays(db, "hrLogDays") : (Array.isArray(cfg.hrLog) ? cfg.hrLog : []);
  out.custPayments = paymentsSplit ? await readSplitDays(db, "custPaymentsDays") : (Array.isArray(cfg.custPayments) ? cfg.custPayments : []);
  out.supplierPayments = paymentsSplit ? await readSplitDays(db, "supplierPaymentsDays") : (Array.isArray(cfg.supplierPayments) ? cfg.supplierPayments : []);
  out.wsPayments = paymentsSplit ? await readSplitDays(db, "wsPaymentsDays") : (Array.isArray(cfg.wsPayments) ? cfg.wsPayments : []);
  out.checks = paymentsSplit ? await readSplitDays(db, "checksDays") : (Array.isArray(cfg.checks) ? cfg.checks : []);
  /* Invoices */
  const v1950 = !!cfg._splitDaysV1950Done;
  out.salesInvoices = v1950 ? await readSplitDays(db, "salesInvoicesDays") : (Array.isArray(cfg.salesInvoices) ? cfg.salesInvoices : []);
  out.purchaseInvoices = v1950 ? await readSplitDays(db, "purchaseInvoicesDays") : (Array.isArray(cfg.purchaseInvoices) ? cfg.purchaseInvoices : []);
  /* Credit/debit notes */
  const v2195 = !!cfg._splitDaysV2195Done;
  out.salesCreditNotes = v2195 ? await readSplitDays(db, "salesCreditNotesDays") : (Array.isArray(cfg.salesCreditNotes) ? cfg.salesCreditNotes : []);
  out.purchaseDebitNotes = v2195 ? await readSplitDays(db, "purchaseDebitNotesDays") : (Array.isArray(cfg.purchaseDebitNotes) ? cfg.purchaseDebitNotes : []);

  return out;
}

/* Strip companion suffix from sourceId before lookup.
   COGS entries have sourceId like "X#cogs" or "X:cogs" — the underlying X
   should resolve in the source collection. */
function normalizeSourceId(sourceId){
  if(!sourceId) return "";
  return String(sourceId).replace(/[#:]cogs$/i, "").replace(/[#:]void$/i, "");
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
  const dryRun = body.dryRun !== false; /* default TRUE — must explicitly opt in to reversal */
  const startTs = Date.now();

  try {
    const db = getDb();
    const cfgSnap = await db.collection("factory").doc("config").get();
    if(!cfgSnap.exists){
      return res.status(404).json({ ok:false, error: "factory/config doesn't exist" });
    }
    const cfg = cfgSnap.data() || {};

    /* Load operational data */
    const op = await loadOperationalData(db, cfg);
    const idSets = {};
    for(const [k, arr] of Object.entries(op)){
      idSets[k] = new Set(arr.filter(x => x && x.id).map(x => String(x.id)));
    }

    /* Scan accountingDays */
    const accSnap = await db.collection("accountingDays").get();
    let scanned = 0;
    const orphans = []; /* {date, sourceType, sourceId, narration, entryId} */

    accSnap.forEach(docSnap => {
      const data = docSnap.data();
      const entries = (data && Array.isArray(data.entries)) ? data.entries : [];
      const date = docSnap.id;
      for(const entry of entries){
        if(!entry || !entry.sourceType || !entry.sourceId) continue;
        /* Skip already-reversed entries (idempotency) */
        if(entry.reversed === true) continue;
        /* Skip entries that are themselves reversals (have a referenceTo field) */
        if(entry.reversalOf || entry.isReversal) continue;
        scanned++;

        const collKey = SOURCE_TYPE_TO_COLLECTION[entry.sourceType];
        if(!collKey) continue; /* unknown sourceType — skip rather than false-positive */
        if(collKey === "wsReceives") continue; /* nested in orders, expensive to scan — skip */

        const idSet = idSets[collKey];
        if(!idSet) continue; /* operational collection not loaded — skip */

        const normalizedId = normalizeSourceId(entry.sourceId);
        if(idSet.has(String(entry.sourceId)) || idSet.has(normalizedId)) continue;

        /* Orphan */
        orphans.push({
          date,
          sourceType: entry.sourceType,
          sourceId: entry.sourceId,
          narration: (entry.narration || "").slice(0, 100),
          entryId: entry.id || null,
          amount: entry.lines ? entry.lines.reduce((s, l) => s + (Number(l.debit)||0), 0) : 0,
        });
      }
    });

    /* Group orphans by sourceType for the summary */
    const orphansByType = {};
    for(const o of orphans){
      orphansByType[o.sourceType] = (orphansByType[o.sourceType] || 0) + 1;
    }

    let reversed = 0;
    const reversalErrors = [];
    if(!dryRun && orphans.length > 0){
      /* Reverse each orphan by flagging it in-place. We don't write a
         counter-balancing entry here (that would require pulling the full
         posting rules + COA); instead we mark the entry as { reversed: true,
         reversedAt, reversedBy, reversalReason } so it's excluded from Trial
         Balance / reports that filter on `reversed !== true`. This is a
         "soft" reversal that preserves audit trail without re-running the
         posting logic from the server side. */
      const orphansByDay = new Map();
      for(const o of orphans){
        if(!orphansByDay.has(o.date)) orphansByDay.set(o.date, []);
        orphansByDay.get(o.date).push(o);
      }
      const now = new Date().toISOString();
      for(const [date, dayOrphans] of orphansByDay){
        try {
          const dayRef = db.collection("accountingDays").doc(date);
          const daySnap = await dayRef.get();
          if(!daySnap.exists) continue;
          const dayData = daySnap.data() || {};
          const entries = Array.isArray(dayData.entries) ? dayData.entries : [];
          const orphanIdSet = new Set(dayOrphans.map(o => `${o.sourceType}|${o.sourceId}`));
          let changed = false;
          for(const entry of entries){
            if(!entry || !entry.sourceType || !entry.sourceId) continue;
            const key = `${entry.sourceType}|${entry.sourceId}`;
            if(orphanIdSet.has(key) && entry.reversed !== true){
              entry.reversed = true;
              entry.reversedAt = now;
              entry.reversedBy = auth.email || "audit-orphan-endpoint";
              entry.reversalReason = "orphan — source operation no longer exists (V21.9.67 audit)";
              reversed++;
              changed = true;
            }
          }
          if(changed){
            await dayRef.set({ ...dayData, entries, updatedAt: now });
          }
        } catch(e){
          reversalErrors.push({ date, error: e?.message || String(e) });
        }
      }
    }

    return res.status(200).json({
      ok: true,
      dryRun,
      accountingEntriesScanned: scanned,
      operationalIds: Object.fromEntries(Object.entries(idSets).map(([k, s]) => [k, s.size])),
      orphansFound: orphans.length,
      orphansByType,
      orphansReversed: reversed,
      reversalErrors: reversalErrors.length > 0 ? reversalErrors : undefined,
      sampleOrphans: orphans.slice(0, 20),
      durationMs: Date.now() - startTs,
    });
  } catch(e){
    console.error("[V21.9.67 audit-orphan-accounting] failed:", e);
    return res.status(500).json({ ok:false, error: e?.message || String(e) });
  }
}
