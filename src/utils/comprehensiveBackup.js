/* ════════════════════════════════════════════════════════════════════════
   CLARK V18.62 — Comprehensive Backup Utility
   ════════════════════════════════════════════════════════════════════════
   
   Why this exists:
   ────────────────
   Pre-V18.62 backups only captured factory/config + factory/sales +
   factory/tasks + current-season orders. Since the V16.74 split-collections
   migration, this means treasury, audit log, HR log, HR weeks, and
   most-seasons orders were NEVER in any backup. Users thought they were
   safe — they weren't.
   
   What this captures:
   ───────────────────
   EVERYTHING. Specifically:
     - factory/config        (the main settings doc)
     - factory/sales         (sales sub-doc)
     - factory/tasks         (tasks sub-doc)
     - treasuryDays/{date}   (split treasury entries, one doc per day)
     - auditDays/{date}      (split audit log)
     - hrLogDays/{date}      (split HR log)
     - hrWeeksDocs/{weekId}  (partitioned HR weeks)
     - seasons/{S}/orders/*  (orders for EVERY season, not just current)
   
   Storage layout:
   ───────────────
   To work around Firestore's 1MB-per-document limit, the backup is split
   across multiple documents:
   
     backups/{backupId}                          ← metadata + counts
        └─ parts/factoryConfig                   ← { data: factory/config }
        └─ parts/factorySales                    ← { data: factory/sales }
        └─ parts/factoryTasks                    ← { data: factory/tasks }
        └─ parts/treasuryDays                    ← { docs: [...all treasuryDays...] }
        └─ parts/auditDays                       ← { docs: [...] }
        └─ parts/hrLogDays                       ← { docs: [...] }
        └─ parts/hrWeeksDocs                     ← { docs: [...] }
        └─ parts/orders_{seasonName}             ← { docs: [...] } per season
   
   If a single part exceeds 800KB (safety margin under Firestore's 1MB),
   it is further split into chunks: parts/{name}_chunk_0, _chunk_1, ...
   
   ════════════════════════════════════════════════════════════════════════ */

import {
  doc, setDoc, getDoc, getDocs, collection, deleteDoc
} from "firebase/firestore";
import { db } from "../firebase.js";
import { SPLIT_COLLECTIONS } from "./splitCollections.js";
import { PARTITIONED_COLLECTIONS } from "./partitionedCollections.js";

/* Backup format version. Bump when format changes incompatibly. */
export const COMPREHENSIVE_BACKUP_VERSION = 1;

/* Soft limit per Firestore document — 1MB hard limit, leave headroom. */
const PART_SIZE_LIMIT_BYTES = 800 * 1024;

/* ────────────────────────────────────────────────────────────────────────
   Size estimation
   ──────────────────────────────────────────────────────────────────────── */

function estimateSize(obj) {
  try {
    return new Blob([JSON.stringify(obj)]).size;
  } catch {
    return JSON.stringify(obj).length * 2;/* rough fallback */
  }
}

/* ────────────────────────────────────────────────────────────────────────
   Chunking — splits large arrays into < PART_SIZE_LIMIT_BYTES pieces
   ──────────────────────────────────────────────────────────────────────── */

function chunkArray(arr, maxBytes = PART_SIZE_LIMIT_BYTES) {
  if (!Array.isArray(arr) || arr.length === 0) return [arr || []];
  /* Heuristic: estimate average item size, then estimate items-per-chunk. */
  const sample = arr.slice(0, Math.min(20, arr.length));
  const sampleSize = estimateSize(sample);
  const avgItemSize = sampleSize / sample.length;
  /* Aim for 75% of limit to leave headroom for envelope */
  const itemsPerChunk = Math.max(1, Math.floor((maxBytes * 0.75) / avgItemSize));
  if (arr.length <= itemsPerChunk) {
    /* Single chunk if it fits */
    if (estimateSize(arr) < maxBytes) return [arr];
  }
  const chunks = [];
  for (let i = 0; i < arr.length; i += itemsPerChunk) {
    chunks.push(arr.slice(i, i + itemsPerChunk));
  }
  return chunks;
}

/* ────────────────────────────────────────────────────────────────────────
   READ HELPERS — fetch each piece of the live database
   ──────────────────────────────────────────────────────────────────────── */

async function readDoc(path) {
  const segments = path.split("/");
  const ref = doc(db, ...segments);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

async function readCollection(collectionName) {
  const snap = await getDocs(collection(db, collectionName));
  const out = [];
  snap.forEach(d => { out.push({ _id: d.id, ...d.data() }); });
  return out;
}

/* List all season names from factory/config.seasons */
function listSeasons(factoryConfig) {
  const seasons = (factoryConfig && Array.isArray(factoryConfig.seasons)) ? factoryConfig.seasons : [];
  /* Defensive: also include activeSeason if it's not in the list (edge case) */
  if (factoryConfig?.activeSeason && !seasons.includes(factoryConfig.activeSeason)) {
    seasons.push(factoryConfig.activeSeason);
  }
  return seasons;
}

/* ────────────────────────────────────────────────────────────────────────
   WRITE HELPERS — store a part doc, splitting into chunks if needed
   ──────────────────────────────────────────────────────────────────────── */

async function writePart(backupId, name, payload, onProgress) {
  /* If payload is small enough, write as a single doc */
  const size = estimateSize(payload);
  if (size < PART_SIZE_LIMIT_BYTES) {
    await setDoc(doc(db, "backups", backupId, "parts", name), {
      ...payload,
      _meta: { chunked: false, size, savedAt: new Date().toISOString() },
    });
    onProgress?.(name + " (single, " + (size / 1024).toFixed(0) + "KB)");
    return { chunks: 1, size };
  }

  /* Chunk: payload must have a `docs` array (the only thing we ever chunk) */
  if (!Array.isArray(payload.docs)) {
    /* Can't chunk a non-array payload — write as-is and hope it fits, or fail */
    console.warn("[V18.62] Part " + name + " is large (" + size + " bytes) but not chunkable");
    await setDoc(doc(db, "backups", backupId, "parts", name), {
      ...payload,
      _meta: { chunked: false, size, savedAt: new Date().toISOString() },
    });
    return { chunks: 1, size };
  }

  const chunks = chunkArray(payload.docs);
  /* Write each chunk to its own doc */
  for (let i = 0; i < chunks.length; i++) {
    await setDoc(doc(db, "backups", backupId, "parts", name + "_chunk_" + i), {
      docs: chunks[i],
      _meta: {
        chunked: true,
        chunkIndex: i,
        totalChunks: chunks.length,
        savedAt: new Date().toISOString(),
      },
    });
  }
  /* Index doc for the chunked part */
  await setDoc(doc(db, "backups", backupId, "parts", name), {
    _meta: {
      chunked: true,
      totalChunks: chunks.length,
      totalDocs: payload.docs.length,
      size,
      savedAt: new Date().toISOString(),
    },
  });
  onProgress?.(name + " (" + chunks.length + " chunks, " + (size / 1024 / 1024).toFixed(1) + "MB)");
  return { chunks: chunks.length, size };
}

async function readPart(backupId, name) {
  const indexRef = doc(db, "backups", backupId, "parts", name);
  const indexSnap = await getDoc(indexRef);
  if (!indexSnap.exists()) return null;
  const index = indexSnap.data();
  /* Single-doc part */
  if (!index._meta?.chunked) {
    const { _meta, ...rest } = index;
    return rest;
  }
  /* Chunked: read all chunks and merge */
  const total = index._meta.totalChunks || 0;
  const allDocs = [];
  for (let i = 0; i < total; i++) {
    const chunkSnap = await getDoc(doc(db, "backups", backupId, "parts", name + "_chunk_" + i));
    if (chunkSnap.exists()) {
      const chunk = chunkSnap.data();
      if (Array.isArray(chunk.docs)) allDocs.push(...chunk.docs);
    }
  }
  return { docs: allDocs };
}

/* ────────────────────────────────────────────────────────────────────────
   CREATE — runs the full comprehensive backup
   ──────────────────────────────────────────────────────────────────────── */

/**
 * Create a comprehensive backup of EVERY collection touched by the app.
 *
 * @param {Object} options
 * @param {string} options.label - Human-readable label
 * @param {Object} options.user - { email, uid }
 * @param {Function} [options.onProgress] - Called with status strings
 * @param {boolean} [options.autoGenerated] - True for daily auto-backups
 * @returns {Promise<{backupId, summary}>}
 */
export async function createComprehensiveBackup({ label, user, onProgress, autoGenerated = false }) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupId = (autoGenerated ? "auto-comp-" : "comp-") + ts;
  const startedAt = new Date().toISOString();
  const counts = {};
  const partsManifest = [];/* names of all parts written, for restore */
  const errors = [];

  const progress = (msg) => {
    try { onProgress?.(msg); } catch {}
  };

  /* 1. factory/config */
  progress("جاري قراءة factory/config…");
  const factoryConfig = await readDoc("factory/config");
  if (!factoryConfig) {
    throw new Error("factory/config not found — backup aborted to prevent corrupt save");
  }
  await writePart(backupId, "factoryConfig", { data: factoryConfig }, progress);
  partsManifest.push("factoryConfig");
  counts.factoryConfigSize = estimateSize(factoryConfig);

  /* 2. factory/sales */
  progress("جاري قراءة factory/sales…");
  try {
    const factorySales = await readDoc("factory/sales");
    if (factorySales) {
      await writePart(backupId, "factorySales", { data: factorySales }, progress);
      partsManifest.push("factorySales");
    }
  } catch (e) { errors.push({ part: "factorySales", error: String(e?.message || e) }); }

  /* 3. factory/tasks */
  progress("جاري قراءة factory/tasks…");
  try {
    const factoryTasks = await readDoc("factory/tasks");
    if (factoryTasks) {
      await writePart(backupId, "factoryTasks", { data: factoryTasks }, progress);
      partsManifest.push("factoryTasks");
    }
  } catch (e) { errors.push({ part: "factoryTasks", error: String(e?.message || e) }); }

  /* 4. Split collections — treasuryDays, auditDays, hrLogDays */
  for (const [field, collName] of Object.entries(SPLIT_COLLECTIONS)) {
    progress("جاري قراءة " + collName + "…");
    try {
      const docs = await readCollection(collName);
      counts[collName] = docs.length;
      await writePart(backupId, collName, { docs }, progress);
      partsManifest.push(collName);
    } catch (e) {
      errors.push({ part: collName, error: String(e?.message || e) });
    }
  }

  /* 5. Partitioned collections — hrWeeksDocs */
  for (const [field, collName] of Object.entries(PARTITIONED_COLLECTIONS)) {
    progress("جاري قراءة " + collName + "…");
    try {
      const docs = await readCollection(collName);
      counts[collName] = docs.length;
      await writePart(backupId, collName, { docs }, progress);
      partsManifest.push(collName);
    } catch (e) {
      errors.push({ part: collName, error: String(e?.message || e) });
    }
  }

  /* 6. seasons/{S}/orders for EVERY season */
  const seasons = listSeasons(factoryConfig);
  counts.seasonsTotal = seasons.length;
  counts.ordersBySeason = {};
  for (const seasonName of seasons) {
    if (!seasonName || typeof seasonName !== "string") continue;
    progress("جاري قراءة seasons/" + seasonName + "/orders…");
    try {
      const orders = await readCollection("seasons/" + seasonName + "/orders");
      counts.ordersBySeason[seasonName] = orders.length;
      const partName = "orders_" + seasonName;
      await writePart(backupId, partName, { docs: orders, season: seasonName }, progress);
      partsManifest.push(partName);
    } catch (e) {
      errors.push({ part: "orders_" + seasonName, error: String(e?.message || e) });
    }
  }

  /* 7. Top-level metadata document */
  progress("جاري حفظ metadata…");
  const metadata = {
    label: label || (autoGenerated ? "تلقائية شاملة (يومية)" : "شاملة يدوية"),
    autoGenerated: !!autoGenerated,
    isComprehensive: true,/* flag to distinguish from old single-doc format */
    formatVersion: COMPREHENSIVE_BACKUP_VERSION,
    createdAt: startedAt,
    completedAt: new Date().toISOString(),
    createdBy: user?.email || user?.uid || "unknown",
    partsManifest,
    counts: {
      ...counts,
      /* High-level counts that matter most to humans */
      employees: (factoryConfig.employees || []).length,
      customers: (factoryConfig.customers || []).length,
      workshops: (factoryConfig.workshops || []).length,
      suppliers: (factoryConfig.suppliers || []).length,
      users: Object.keys(factoryConfig.users || {}).length,
      usersList: (factoryConfig.usersList || []).length,
      ordersTotal: Object.values(counts.ordersBySeason || {}).reduce((s, n) => s + n, 0),
    },
  };
  /* V19.2: Conditionally include errors field — Firestore rejects undefined values */
  if (errors.length > 0) metadata.errors = errors;
  await setDoc(doc(db, "backups", backupId), metadata);
  progress("✅ تم — " + backupId);

  return { backupId, summary: metadata };
}

/* ────────────────────────────────────────────────────────────────────────
   READ — load all parts of a comprehensive backup back into memory
   Used by restore flows.
   ──────────────────────────────────────────────────────────────────────── */

/**
 * Read a comprehensive backup back into a structured object.
 * Returns null if the backup doesn't exist or isn't comprehensive.
 *
 * @param {string} backupId
 * @returns {Promise<{
 *   metadata: object,
 *   factoryConfig: object|null,
 *   factorySales: object|null,
 *   factoryTasks: object|null,
 *   splitCollections: { treasuryDays: array, auditDays: array, hrLogDays: array },
 *   partitionedCollections: { hrWeeksDocs: array },
 *   ordersBySeason: { [season]: array }
 * }|null>}
 */
export async function readComprehensiveBackup(backupId) {
  const metaSnap = await getDoc(doc(db, "backups", backupId));
  if (!metaSnap.exists()) return null;
  const metadata = metaSnap.data();
  if (!metadata.isComprehensive) return null;/* not our format */

  const result = {
    metadata,
    factoryConfig: null,
    factorySales: null,
    factoryTasks: null,
    splitCollections: { treasuryDays: [], auditDays: [], hrLogDays: [] },
    partitionedCollections: { hrWeeksDocs: [] },
    ordersBySeason: {},
  };

  for (const partName of metadata.partsManifest || []) {
    const part = await readPart(backupId, partName);
    if (!part) continue;
    if (partName === "factoryConfig") result.factoryConfig = part.data;
    else if (partName === "factorySales") result.factorySales = part.data;
    else if (partName === "factoryTasks") result.factoryTasks = part.data;
    else if (partName in SPLIT_COLLECTIONS) {/* shouldn't happen — keys are field names */ }
    else if (Object.values(SPLIT_COLLECTIONS).includes(partName)) {
      result.splitCollections[partName] = part.docs || [];
    }
    else if (Object.values(PARTITIONED_COLLECTIONS).includes(partName)) {
      result.partitionedCollections[partName] = part.docs || [];
    }
    else if (partName.startsWith("orders_")) {
      const seasonName = partName.slice("orders_".length);
      result.ordersBySeason[seasonName] = part.docs || [];
    }
  }

  return result;
}

/* ────────────────────────────────────────────────────────────────────────
   DELETE — remove a comprehensive backup and ALL its part documents
   Caller should already have shown a confirmation.
   ──────────────────────────────────────────────────────────────────────── */

export async function deleteComprehensiveBackup(backupId) {
  /* Read manifest to know what parts to delete */
  const metaSnap = await getDoc(doc(db, "backups", backupId));
  if (!metaSnap.exists()) return;
  const metadata = metaSnap.data();
  const manifest = metadata.partsManifest || [];

  /* Delete each part (and its chunks if any) */
  for (const partName of manifest) {
    /* Try to read index to check if chunked */
    try {
      const indexRef = doc(db, "backups", backupId, "parts", partName);
      const indexSnap = await getDoc(indexRef);
      if (indexSnap.exists()) {
        const index = indexSnap.data();
        if (index._meta?.chunked) {
          const total = index._meta.totalChunks || 0;
          for (let i = 0; i < total; i++) {
            try {
              await deleteDoc(doc(db, "backups", backupId, "parts", partName + "_chunk_" + i));
            } catch {/* keep going */}
          }
        }
        await deleteDoc(indexRef);
      }
    } catch (e) {
      console.warn("[V18.62] Failed to delete part " + partName + ":", e);
    }
  }

  /* Finally delete the metadata doc */
  await deleteDoc(doc(db, "backups", backupId));
}

/* ────────────────────────────────────────────────────────────────────────
   ESTIMATE — preview how big a backup would be without actually running
   Useful for warning users before they kick off a big backup
   ──────────────────────────────────────────────────────────────────────── */

export async function estimateComprehensiveBackupSize() {
  const factoryConfig = await readDoc("factory/config");
  if (!factoryConfig) return { totalBytes: 0, breakdown: {}, error: "factory/config not found" };
  const breakdown = {};
  let total = 0;

  /* Top-level docs */
  breakdown.factoryConfig = estimateSize(factoryConfig);
  total += breakdown.factoryConfig;

  try { const fs = await readDoc("factory/sales"); if (fs) { breakdown.factorySales = estimateSize(fs); total += breakdown.factorySales; } } catch {}
  try { const ft = await readDoc("factory/tasks"); if (ft) { breakdown.factoryTasks = estimateSize(ft); total += breakdown.factoryTasks; } } catch {}

  /* Split collections (count docs only — sizing each would be slow) */
  for (const [, collName] of Object.entries(SPLIT_COLLECTIONS)) {
    try {
      const docs = await readCollection(collName);
      breakdown[collName] = estimateSize(docs);
      total += breakdown[collName];
    } catch {}
  }
  for (const [, collName] of Object.entries(PARTITIONED_COLLECTIONS)) {
    try {
      const docs = await readCollection(collName);
      breakdown[collName] = estimateSize(docs);
      total += breakdown[collName];
    } catch {}
  }

  /* Orders for each season */
  const seasons = listSeasons(factoryConfig);
  for (const seasonName of seasons) {
    if (!seasonName) continue;
    try {
      const orders = await readCollection("seasons/" + seasonName + "/orders");
      breakdown["orders_" + seasonName] = estimateSize(orders);
      total += breakdown["orders_" + seasonName];
    } catch {}
  }

  return { totalBytes: total, breakdown };
}
