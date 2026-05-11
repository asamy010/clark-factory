/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/maintenance/fix-flags (V21.9.24)
   ───────────────────────────────────────────────────────────────
   Sets missing migration flags when the underlying data already
   exists in the partitioned/split collections.

   The bug this fixes:
     - Server SDK wrote 1147 customers to shopifyCustomersDocs ✓
     - But _partitionedV2192Done was never stamped on factory/config
     - App.jsx merge: if(flag) use partitioned else use cfg.legacy
     - flag = false → uses cfg.shopifyCustomers ([])
     - UI shows 0 customers despite data being safe in Firestore

   This endpoint:
     1. Calls audit-state logic internally
     2. For each partitioned mismatch (doc_count > 0 AND flag = false):
        → set the flag to true
     3. For each split mismatch (total_entries > 0 AND flag = false):
        → set the flag to true
     4. Also strips any leftover legacy arrays on cfg whose corresponding
        flag is now set (idempotent cleanup — matches stripSplitArrays /
        stripPartitionedArrays logic in src/utils/)
     5. Returns summary

   Body (optional): { dryRun?: true } — preview without writing
   Auth: admin Bearer

   Idempotent: safe to run multiple times.
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";

const PARTITIONED_MAP = [
  { field: "hrWeeks",          collection: "hrWeeksDocs",          flag: "_partitionedV1675Done" },
  { field: "customers",        collection: "customersDocs",        flag: "_partitionedV1957Done" },
  { field: "suppliers",        collection: "suppliersDocs",        flag: "_partitionedV1957Done" },
  { field: "workshops",        collection: "workshopsDocs",        flag: "_partitionedV1957Done" },
  { field: "employees",        collection: "employeesDocs",        flag: "_partitionedV1957Done" },
  { field: "empDebts",         collection: "empDebtsDocs",         flag: "_partitionedV1957Done" },
  { field: "generalProducts",  collection: "generalProductsDocs",  flag: "_partitionedV1957Done" },
  { field: "fabrics",          collection: "fabricsDocs",          flag: "_partitionedV1957Done" },
  { field: "accessories",      collection: "accessoriesDocs",      flag: "_partitionedV1957Done" },
  { field: "shopifyProducts",  collection: "shopifyProductsDocs",  flag: "_partitionedV2192Done" },
  { field: "shopifyCustomers", collection: "shopifyCustomersDocs", flag: "_partitionedV2192Done" },
];

const SPLIT_MAP = [
  { field: "treasury",          collection: "treasuryDays",          flag: "_splitDaysV1674Done" },
  { field: "auditLog",          collection: "auditDays",             flag: "_splitDaysV1674Done" },
  { field: "hrLog",             collection: "hrLogDays",             flag: "_splitDaysV1674Done" },
  { field: "custPayments",      collection: "custPaymentsDays",      flag: "_splitDaysV1949Done" },
  { field: "supplierPayments",  collection: "supplierPaymentsDays",  flag: "_splitDaysV1949Done" },
  { field: "wsPayments",        collection: "wsPaymentsDays",        flag: "_splitDaysV1949Done" },
  { field: "checks",            collection: "checksDays",            flag: "_splitDaysV1949Done" },
  { field: "salesInvoices",     collection: "salesInvoicesDays",     flag: "_splitDaysV1950Done" },
  { field: "purchaseInvoices",  collection: "purchaseInvoicesDays",  flag: "_splitDaysV1950Done" },
  { field: "purchaseOrders",    collection: "purchaseOrdersDays",   flag: "_splitDaysV1950Done" },
  { field: "stockMovements",    collection: "stockMovementsDays",    flag: "_splitDaysV1952Done" },
  { field: "purchaseReceipts",  collection: "purchaseReceiptsDays",  flag: "_splitDaysV1952Done" },
  { field: "treasuryTransfers", collection: "treasuryTransfersDays", flag: "_splitDaysV1952Done" },
  { field: "salesAudits",       collection: "salesAuditsDays",       flag: "_splitDaysV1952Done" },
  { field: "notifications",     collection: "notificationsDays",     flag: "_splitDaysV1953Done" },
  { field: "salesCreditNotes",  collection: "salesCreditNotesDays",  flag: "_splitDaysV2195Done" },
  { field: "purchaseDebitNotes",collection: "purchaseDebitNotesDays",flag: "_splitDaysV2195Done" },
  { field: "shopifyReturnRequests", collection: "shopifyReturnRequestsDays", flag: "_splitDaysV2197Done" },
  { field: "whatsappCampaigns",     collection: "whatsappCampaignsDays",     flag: "_splitDaysV2198Done" },
  { field: "whatsappCampaignRuns",  collection: "whatsappCampaignRunsDays",  flag: "_splitDaysV2198Done" },
  { field: "shopifyPendingOrders",  collection: "shopifyOrdersDays",         flag: "_splitDaysV2199Done" },
];

async function countDocs(db, collectionName) {
  try {
    const snap = await db.collection(collectionName).count().get();
    return snap.data().count;
  } catch (e) {
    return 0;
  }
}

async function countSplitTotalEntries(db, collectionName) {
  try {
    const snap = await db.collection(collectionName).get();
    let total = 0;
    snap.forEach(d => {
      const data = d.data();
      if (Array.isArray(data?.entries)) total += data.entries.length;
    });
    return total;
  } catch (e) {
    return 0;
  }
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

    /* Detect mismatches */
    const flagsToSet = new Set();
    const fieldsToStrip = new Set();
    const detected = []; /* {field, collection, count, flag, action} */

    for (const { field, collection, flag } of PARTITIONED_MAP) {
      const docCount = await countDocs(db, collection);
      const flagValue = !!cfg[flag];
      if (docCount > 0 && !flagValue) {
        flagsToSet.add(flag);
        detected.push({ kind: "partitioned", field, collection, doc_count: docCount, flag, action: "SET FLAG" });
      }
      /* Also strip the legacy field if flag is (now) set */
      if ((flagValue || flagsToSet.has(flag)) && Array.isArray(cfg[field]) && cfg[field].length > 0) {
        fieldsToStrip.add(field);
      }
    }

    for (const { field, collection, flag } of SPLIT_MAP) {
      const totalEntries = await countSplitTotalEntries(db, collection);
      const flagValue = !!cfg[flag];
      if (totalEntries > 0 && !flagValue) {
        flagsToSet.add(flag);
        detected.push({ kind: "split", field, collection, total_entries: totalEntries, flag, action: "SET FLAG" });
      }
      if ((flagValue || flagsToSet.has(flag)) && Array.isArray(cfg[field]) && cfg[field].length > 0) {
        fieldsToStrip.add(field);
      }
    }

    if (flagsToSet.size === 0 && fieldsToStrip.size === 0) {
      return res.status(200).json({
        ok: true,
        dryRun,
        flags_set: [],
        fields_stripped: [],
        detected: [],
        message: "✨ مفيش mismatches — كل الـ flags صح",
      });
    }

    if (dryRun) {
      return res.status(200).json({
        ok: true,
        dryRun: true,
        flags_to_set: Array.from(flagsToSet),
        fields_to_strip: Array.from(fieldsToStrip),
        detected,
        durationMs: Date.now() - startTs,
      });
    }

    /* Backup before any write */
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const backupId = "pre-fix-flags-v21.9.24-" + ts;
    await db.collection("backups").doc(backupId).set({
      label: "Backup قبل fix-flags V21.9.24",
      autoGenerated: true,
      migrationType: "fix-flags-v21.9.24",
      createdAt: new Date().toISOString(),
      createdBy: auth.email || auth.uid,
      flags_before: Object.fromEntries(
        [...flagsToSet].map(f => [f, !!cfg[f]])
      ),
      fields_being_stripped: [...fieldsToStrip].reduce((acc, f) => {
        acc[f] = Array.isArray(cfg[f]) ? cfg[f].length : 0;
        return acc;
      }, {}),
    });

    /* Apply: set flags + strip legacy fields atomically */
    await db.runTransaction(async (tx) => {
      const fresh = (await tx.get(cfgRef)).data() || {};
      const next = { ...fresh };
      for (const f of flagsToSet) {
        next[f] = true;
        next[f + "_fixed_at"] = new Date().toISOString();
        next[f + "_fixed_by"] = auth.email || auth.uid;
      }
      for (const field of fieldsToStrip) {
        delete next[field];
      }
      tx.set(cfgRef, next);
    });

    /* Log */
    try {
      await db.collection("migrationLog").doc("fix-flags-v21.9.24-" + Date.now()).set({
        type: "fix-flags-v21.9.24",
        status: "success",
        flags_set: Array.from(flagsToSet),
        fields_stripped: Array.from(fieldsToStrip),
        detected,
        backup_doc_id: backupId,
        by: auth.email || auth.uid,
        at: new Date().toISOString(),
      });
    } catch (_) { /* non-fatal */ }

    return res.status(200).json({
      ok: true,
      dryRun: false,
      flags_set: Array.from(flagsToSet),
      fields_stripped: Array.from(fieldsToStrip),
      detected,
      backup_doc_id: backupId,
      durationMs: Date.now() - startTs,
      message: `✅ تم! ${flagsToSet.size} flag set + ${fieldsToStrip.size} legacy field stripped. اعمل refresh للـ app — الـ data هـ تظهر دلوقتي.`,
    });
  } catch (e) {
    console.error("[V21.9.24 fix-flags] failed:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
