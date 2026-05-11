/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/maintenance/audit-state (V21.9.24)
   ───────────────────────────────────────────────────────────────
   Full diagnostic: reads ALL migration flags + counts every
   partitioned/split collection + counts every legacy cfg array.

   The goal: detect "data exists in Firestore but UI shows 0".
   The root cause is almost always a flag/data mismatch:
     - shopifyCustomersDocs has 1147 docs
     - cfg._partitionedV2192Done is FALSE
     - App.jsx merge skips partitionedData → uses cfg.shopifyCustomers ([])
     - UI: 0 customers

   This endpoint surfaces those mismatches so the UI can show the
   user a clear "Fix flags" button.

   Returns: {
     ok,
     flags: { _partitionedV2192Done: bool, _splitDaysV1674Done: bool, ... },
     partitioned: [{ field, collection, doc_count, flag, flag_value, mismatch, legacy_count }],
     split: [{ field, collection, doc_count, flag, flag_value, mismatch, legacy_count }],
     mismatches: { partitioned: [...], split: [...] },
     legacy_cfg_arrays: { shopifyCustomers: 0, shopifyProducts: 0, ... },
     suggestions: ["..."]
   }

   Auth: admin Bearer
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";

/* Field → collection mapping + flag (from splitCollections.js / partitionedCollections.js).
   We duplicate the maps here because serverless functions can't easily
   import from src/. The mappings MUST stay in sync with those files. */

const PARTITIONED_MAP = [
  /* field name, collection name, flag */
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

const ALL_FLAGS = [
  "_partitionedV1675Done",
  "_partitionedV1957Done",
  "_partitionedV2192Done",
  "_splitDaysV1674Done",
  "_splitDaysV1949Done",
  "_splitDaysV1950Done",
  "_splitDaysV1952Done",
  "_splitDaysV1953Done",
  "_splitDaysV2195Done",
  "_splitDaysV2197Done",
  "_splitDaysV2198Done",
  "_splitDaysV2199Done",
  "_splitShopifyOrdersDaily", /* legacy flag for shopifyPendingOrders */
];

async function countDocs(db, collectionName) {
  try {
    const snap = await db.collection(collectionName).count().get();
    return snap.data().count;
  } catch (e) {
    return -1; /* error marker */
  }
}

async function countSplitEntries(db, collectionName) {
  /* For split collections, also tally the total entries across all day docs */
  try {
    const snap = await db.collection(collectionName).get();
    let totalEntries = 0;
    let docCount = 0;
    snap.forEach(d => {
      docCount++;
      const data = d.data();
      if (Array.isArray(data?.entries)) totalEntries += data.entries.length;
    });
    return { docCount, totalEntries };
  } catch (e) {
    return { docCount: -1, totalEntries: -1, error: e.message };
  }
}

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "POST/GET فقط" });
  }
  const auth = await verifyAdminToken(req.headers.authorization);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  try {
    const db = getDb();

    /* Read factory/config once for flags + legacy arrays */
    const cfgSnap = await db.collection("factory").doc("config").get();
    const cfg = cfgSnap.exists ? (cfgSnap.data() || {}) : {};

    /* 1) All flags */
    const flags = {};
    for (const flag of ALL_FLAGS) {
      flags[flag] = !!cfg[flag];
    }

    /* 2) Partitioned collections — count docs in each */
    const partitionedResults = [];
    for (const { field, collection, flag } of PARTITIONED_MAP) {
      const docCount = await countDocs(db, collection);
      const flagValue = !!cfg[flag];
      const legacyCount = Array.isArray(cfg[field]) ? cfg[field].length : 0;
      /* Mismatch: data exists in collection but flag is not set
         → client UI will use legacy (empty) array → "0 customers" bug */
      const mismatch = docCount > 0 && !flagValue;
      partitionedResults.push({
        field, collection, doc_count: docCount, flag, flag_value: flagValue,
        legacy_count: legacyCount, mismatch,
      });
    }

    /* 3) Split collections — count day docs + total entries */
    const splitResults = [];
    for (const { field, collection, flag } of SPLIT_MAP) {
      const counts = await countSplitEntries(db, collection);
      const flagValue = !!cfg[flag];
      const legacyCount = Array.isArray(cfg[field]) ? cfg[field].length : 0;
      const mismatch = counts.totalEntries > 0 && !flagValue;
      splitResults.push({
        field, collection,
        day_doc_count: counts.docCount,
        total_entries: counts.totalEntries,
        flag, flag_value: flagValue,
        legacy_count: legacyCount,
        mismatch,
        error: counts.error,
      });
    }

    /* 4) Legacy cfg arrays still on factory/config (mostly important fields) */
    const legacyArrayKeys = [
      "shopifyCustomers", "shopifyProducts", "shopifyPendingOrders",
      "customers", "suppliers", "workshops", "employees",
      "treasury", "salesInvoices",
    ];
    const legacyArrays = {};
    for (const k of legacyArrayKeys) {
      legacyArrays[k] = Array.isArray(cfg[k]) ? cfg[k].length : null;
    }

    /* 5) Mismatches summary */
    const partitionedMismatches = partitionedResults.filter(r => r.mismatch);
    const splitMismatches = splitResults.filter(r => r.mismatch);

    /* 6) Actionable suggestions */
    const suggestions = [];
    if (partitionedMismatches.length > 0) {
      suggestions.push(
        `${partitionedMismatches.length} partitioned collection فيها docs لكن الـ flag مش set. ` +
        `الـ UI هـ يـ show 0. شغّل POST /api/maintenance/fix-flags لإصلاح.`
      );
    }
    if (splitMismatches.length > 0) {
      suggestions.push(
        `${splitMismatches.length} split collection فيها entries لكن الـ flag مش set. ` +
        `الـ UI هـ يـ use الـ legacy field. شغّل POST /api/maintenance/fix-flags لإصلاح.`
      );
    }
    if (!cfg.users || Object.keys(cfg.users || {}).length === 0) {
      suggestions.push(
        "factory/config.users فارغ! مفيش admin/manager assigned. كل الـ writes هتـ deny. " +
        "أضف entry: cfg.users[<uid>] = 'admin'."
      );
    }

    /* 7) Current user info (from auth) */
    const userInfo = {
      uid: auth.uid,
      email: auth.email,
      role: auth.role,
    };

    return res.status(200).json({
      ok: true,
      auth: userInfo,
      flags,
      partitioned: partitionedResults,
      split: splitResults,
      mismatches: {
        partitioned: partitionedMismatches,
        split: splitMismatches,
        any: partitionedMismatches.length + splitMismatches.length > 0,
      },
      legacy_cfg_arrays: legacyArrays,
      cfg_users_count: Object.keys(cfg.users || {}).length,
      suggestions,
      generated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[V21.9.24 audit-state] failed:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
