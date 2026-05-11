/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/maintenance/recover-legacy-data (V21.9.27)
   ───────────────────────────────────────────────────────────────
   Recovery endpoint for the "flag was set prematurely, data lost"
   bug from V21.9.24 fix-flags. Restores data by:
     1. Reading factory/config.<legacyField> (if it still has data)
     2. OR reading from the most recent backup created by fix-flags
        / split-shopify-collections
     3. Writing the data to the proper partitioned/split collection
     4. Returning a summary

   ⚠️ This endpoint does NOT re-pull from Shopify — for that, the
   user should use sync-customers / sync-products-now. This endpoint
   is purely about RECOVERING data that was already in Firestore
   but got displaced by a bad migration.

   Body: {
     action: "scan_backups" | "restore_from_backup" | "scan_legacy" | "migrate_legacy",
     backup_doc_id?: string,  // for restore_from_backup
     field?: string,          // which field to recover (e.g. "shopifyCustomers")
     dryRun?: bool,
   }
   Auth: admin Bearer
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";

const PARTITIONED_MAP = {
  shopifyCustomers:  { collection: "shopifyCustomersDocs",  flag: "_partitionedV2192Done" },
  shopifyProducts:   { collection: "shopifyProductsDocs",   flag: "_partitionedV2192Done" },
  customers:         { collection: "customersDocs",         flag: "_partitionedV1957Done" },
  suppliers:         { collection: "suppliersDocs",         flag: "_partitionedV1957Done" },
  workshops:         { collection: "workshopsDocs",         flag: "_partitionedV1957Done" },
  employees:         { collection: "employeesDocs",         flag: "_partitionedV1957Done" },
  empDebts:          { collection: "empDebtsDocs",          flag: "_partitionedV1957Done" },
  generalProducts:   { collection: "generalProductsDocs",   flag: "_partitionedV1957Done" },
  fabrics:           { collection: "fabricsDocs",           flag: "_partitionedV1957Done" },
  accessories:       { collection: "accessoriesDocs",       flag: "_partitionedV1957Done" },
  hrWeeks:           { collection: "hrWeeksDocs",           flag: "_partitionedV1675Done" },
};

async function countDocs(db, collectionName) {
  try {
    const snap = await db.collection(collectionName).count().get();
    return snap.data().count;
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
  const action = String(body.action || "scan_legacy").trim();

  try {
    if (action === "scan_legacy") return scanLegacy(res, body);
    if (action === "scan_backups") return scanBackups(res, body);
    if (action === "migrate_legacy") return migrateLegacy(res, auth, body);
    if (action === "restore_from_backup") return restoreFromBackup(res, auth, body);
    return res.status(400).json({ ok: false, error: "action غير معروف: " + action });
  } catch (e) {
    console.error("[V21.9.27 recover-legacy-data] failed:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}

async function scanLegacy(res) {
  /* For each partitioned field, report: legacy count vs partitioned count.
     Flags candidates for recovery (legacy > 0 AND partitioned = 0). */
  const db = getDb();
  const cfgSnap = await db.collection("factory").doc("config").get();
  const cfg = cfgSnap.exists ? (cfgSnap.data() || {}) : {};

  const fields = [];
  for (const [field, { collection, flag }] of Object.entries(PARTITIONED_MAP)) {
    const legacyCount = Array.isArray(cfg[field]) ? cfg[field].length : 0;
    const partitionedCount = await countDocs(db, collection);
    const flagValue = !!cfg[flag];
    const canRecover = legacyCount > 0 && partitionedCount === 0;
    fields.push({
      field, collection, flag, flag_value: flagValue,
      legacy_count: legacyCount,
      partitioned_count: partitionedCount,
      can_recover: canRecover,
      severity: canRecover ? "high" : (legacyCount > 0 && partitionedCount > 0 ? "duplicate" : "ok"),
    });
  }
  const recoverable = fields.filter(f => f.can_recover);
  return res.status(200).json({
    ok: true,
    fields,
    recoverable_count: recoverable.length,
    total_legacy_items: recoverable.reduce((s, f) => s + f.legacy_count, 0),
  });
}

async function scanBackups(res) {
  /* List backups that contain recoverable data. */
  const db = getDb();
  const snap = await db.collection("backups").orderBy("createdAt", "desc").limit(50).get();
  const list = [];
  snap.forEach(d => {
    const data = d.data() || {};
    list.push({
      id: d.id,
      label: data.label || "",
      migrationType: data.migrationType || "",
      createdAt: data.createdAt || "",
      createdBy: data.createdBy || "",
      /* Detect what data the backup contains */
      has_shopifyCustomers: Array.isArray(data.shopifyCustomers) && data.shopifyCustomers.length > 0,
      has_shopifyProducts: Array.isArray(data.shopifyProducts) && data.shopifyProducts.length > 0,
      has_shopifyPendingOrders: Array.isArray(data.shopifyPendingOrders) && data.shopifyPendingOrders.length > 0,
      has_treasury: Array.isArray(data.treasury) && data.treasury.length > 0,
      has_users_before: !!data.users_before,
      counts: data.counts || data.fields_being_stripped || {},
    });
  });
  return res.status(200).json({ ok: true, backups: list });
}

async function migrateLegacy(res, auth, body) {
  /* Migrate cfg.<field> to <collection>. */
  const field = String(body.field || "").trim();
  const dryRun = body.dryRun === true;
  if (!field || !PARTITIONED_MAP[field]) {
    return res.status(400).json({ ok: false, error: "field غير صالح أو غير معروف" });
  }
  const { collection, flag } = PARTITIONED_MAP[field];
  const db = getDb();
  const cfgRef = db.collection("factory").doc("config");
  const cfgSnap = await cfgRef.get();
  const cfg = cfgSnap.exists ? (cfgSnap.data() || {}) : {};

  const items = Array.isArray(cfg[field]) ? cfg[field] : [];
  if (items.length === 0) {
    return res.status(200).json({ ok: true, message: "cfg." + field + " فاضي — مفيش حاجة للـ recovery." });
  }

  const partitionedCount = await countDocs(db, collection);
  if (partitionedCount > 0) {
    return res.status(400).json({
      ok: false,
      error: collection + " فيها " + partitionedCount + " doc بالفعل. الـ migration ممكن يـ create duplicates. شغّل scan_legacy الأول لتقييم الحالة.",
    });
  }

  if (dryRun) {
    return res.status(200).json({
      ok: true,
      dryRun: true,
      field, collection, flag,
      legacy_count: items.length,
      will_write_docs: items.length,
      will_set_flag: true,
      will_strip_legacy: true,
    });
  }

  /* Backup first */
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupId = "pre-recover-legacy-" + field + "-v21.9.27-" + ts;
  await db.collection("backups").doc(backupId).set({
    label: "Backup قبل recovery: " + field + " → " + collection,
    autoGenerated: true,
    migrationType: "recover-legacy-" + field + "-v21.9.27",
    createdAt: new Date().toISOString(),
    createdBy: auth.email || auth.uid,
    field, collection, flag,
    legacy_count: items.length,
    [field]: items, /* full snapshot */
  });

  /* Write each item to the partitioned collection */
  let written = 0;
  const batchSize = 400;
  for (let i = 0; i < items.length; i += batchSize) {
    const slice = items.slice(i, i + batchSize);
    const batch = db.batch();
    for (const item of slice) {
      const id = item?.id || item?.shopify_id;
      if (!id) continue;
      const safeId = String(id).replace(/\//g, "_");
      const docToWrite = { ...item, id: safeId };
      batch.set(db.collection(collection).doc(safeId), docToWrite);
      written++;
    }
    await batch.commit();
  }

  /* Set the flag + strip the legacy field */
  await db.runTransaction(async (tx) => {
    const fresh = (await tx.get(cfgRef)).data() || {};
    const next = { ...fresh };
    next[flag] = true;
    next[flag + "_recovered_at"] = new Date().toISOString();
    next[flag + "_recovered_by"] = auth.email || auth.uid;
    delete next[field];
    tx.set(cfgRef, next);
  });

  /* Log */
  try {
    await db.collection("migrationLog").doc("recover-legacy-" + field + "-v21.9.27-" + Date.now()).set({
      type: "recover-legacy-" + field + "-v21.9.27",
      status: "success",
      field, collection, flag,
      items_written: written,
      backup_doc_id: backupId,
      by: auth.email || auth.uid,
      at: new Date().toISOString(),
    });
  } catch (_) {}

  return res.status(200).json({
    ok: true,
    field, collection, flag,
    items_written: written,
    backup_doc_id: backupId,
    message: "✅ تم! نقلنا " + written + " item من cfg." + field + " إلى " + collection + ". اعمل refresh للـ app.",
  });
}

async function restoreFromBackup(res, auth, body) {
  /* Restore a specific field from a backup doc. */
  const backupDocId = String(body.backup_doc_id || "").trim();
  const field = String(body.field || "").trim();
  const dryRun = body.dryRun === true;
  if (!backupDocId) return res.status(400).json({ ok: false, error: "backup_doc_id مطلوب" });
  if (!field || !PARTITIONED_MAP[field]) {
    return res.status(400).json({ ok: false, error: "field غير صالح" });
  }
  const { collection, flag } = PARTITIONED_MAP[field];
  const db = getDb();
  const backupSnap = await db.collection("backups").doc(backupDocId).get();
  if (!backupSnap.exists) {
    return res.status(404).json({ ok: false, error: "Backup مش موجود" });
  }
  const backup = backupSnap.data() || {};
  const items = Array.isArray(backup[field]) ? backup[field] : [];
  if (items.length === 0) {
    return res.status(400).json({ ok: false, error: "Backup مفيهوش " + field + " data" });
  }

  const partitionedCount = await countDocs(db, collection);
  if (partitionedCount > 0 && !body.force) {
    return res.status(400).json({
      ok: false,
      error: collection + " فيها " + partitionedCount + " doc بالفعل. لو متأكد ابعت body.force=true.",
    });
  }

  if (dryRun) {
    return res.status(200).json({
      ok: true,
      dryRun: true,
      field, collection, flag, backup_doc_id: backupDocId,
      will_write_docs: items.length,
    });
  }

  /* Write to partitioned collection */
  let written = 0;
  const batchSize = 400;
  for (let i = 0; i < items.length; i += batchSize) {
    const slice = items.slice(i, i + batchSize);
    const batch = db.batch();
    for (const item of slice) {
      const id = item?.id || item?.shopify_id;
      if (!id) continue;
      const safeId = String(id).replace(/\//g, "_");
      batch.set(db.collection(collection).doc(safeId), { ...item, id: safeId });
      written++;
    }
    await batch.commit();
  }

  /* Ensure flag is set */
  await db.collection("factory").doc("config").set({
    [flag]: true,
    [flag + "_restored_at"]: new Date().toISOString(),
    [flag + "_restored_from_backup"]: backupDocId,
  }, { merge: true });

  try {
    await db.collection("migrationLog").doc("restore-from-backup-" + field + "-v21.9.27-" + Date.now()).set({
      type: "restore-from-backup-" + field + "-v21.9.27",
      status: "success",
      field, collection, flag,
      items_restored: written,
      backup_doc_id: backupDocId,
      by: auth.email || auth.uid,
      at: new Date().toISOString(),
    });
  } catch (_) {}

  return res.status(200).json({
    ok: true,
    field, collection, flag,
    items_restored: written,
    backup_doc_id: backupDocId,
    message: "✅ تم! استرجعنا " + written + " item من backup إلى " + collection,
  });
}
