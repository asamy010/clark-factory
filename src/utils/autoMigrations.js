/* ═══════════════════════════════════════════════════════════════
   CLARK V21.9.49 — Auto-Run Pending Migrations on App Boot

   PURPOSE:
   ─────────────────────────────────────────────────────────────
   Before V21.9.49, the V21.9.42 (legacy orders), V21.9.44 (recurring
   treasury), and V21.9.45 (transfer leg repair) migrations all required
   the user to manually click a banner in DiagnosticsPanel. The user
   (Ahmed) reported on 2026-05-16:

     "ممكن انت تعمل ميجريشان بمجرد مايفتح التحديث. بلاش انا اعمله
      يحصل مشاكل"
     (Can you run the migrations automatically when the update opens?
      Don't make me do it manually — might cause problems.)

   This module auto-runs the eligible migrations on app boot, behind
   a one-time flag per migration. The user no longer has to remember
   to click buttons. The DiagnosticsPanel buttons remain as fallback
   for re-running or manual control.

   DESIGN PRINCIPLES:
   • Idempotent — safe to re-run; the server endpoints check the flag
     and skip with `skipped:true` if already done.
   • Sequential — one migration at a time. Avoids concurrent Firestore
     writes which could race with each other.
   • Admin-only — only users with `admin` role trigger the auto-run.
     Non-admins ignore the entire flow (their UI still gets the
     migrated data through normal listeners).
   • Resilient — failure of one migration doesn't block the others.
     Each failure is logged + an error notice surfaces to the user.
   • Observable — every run logs to console + creates a migrationLog
     doc on the server. The user sees a top-bar banner during execution
     and a completion notice after.

   SAFETY GUARANTEES (inherited from the underlying endpoints):
   • Backup doc created BEFORE any destructive write
   • Per-batch best-effort — partial failure doesn't set the flag
   • Conflict-avoidance — newer subcollection entries are NOT overwritten
   • Audit trail — repairedAt + repairedBy + repairReason on every leg

   ═══════════════════════════════════════════════════════════════ */

import {
  migrateLegacyOrders,
  migrateRecurringTreasury,
  repairConfirmedTransfers,
} from "./shopify/shopifyClient.js";

/* ── Migration manifest ──────────────────────────────────────────
   Each entry describes an auto-runnable migration. The `shouldRun`
   predicate decides whether to invoke it based on configDoc state.
   The `run` function invokes the endpoint. Sequential ordering
   matters: smaller/safer first, larger/more-impactful later. */
export const AUTO_MIGRATIONS = [
  {
    id: "recurring_treasury_v21944",
    label: "نقل قواعد الـ Recurring Treasury إلى partitioned collection",
    /* Run if: legacy array has entries AND migration flag not set.
       The server endpoint will also re-check the flag and return
       skipped:true if it was set in the meantime. */
    shouldRun: (configDoc) => {
      const arr = configDoc?.recurringTreasury;
      return Array.isArray(arr) && arr.length > 0 && !configDoc._partitionedRecurringV21944Done;
    },
    run: (user) => migrateRecurringTreasury({ dryRun: false }, user),
    /* User-facing description on success: */
    successMsg: (r) => `🔁 نُقلت ${r.rules_migrated || 0} قاعدة Recurring لـ collection منفصل (${r.freed_kb || 0} KB)`,
    /* Description on the loading banner: */
    loadingMsg: "📦 نقل قواعد الـ Recurring Treasury…",
  },
  {
    id: "repair_confirmed_transfers_v21945",
    label: "إصلاح التحويلات المعتمدة بـ legs ناقصة",
    /* Repair always runs (no flag) — it's a scan + targeted repair.
       V21.9.50 FIX: previously this returned true whenever ANY confirmed
       transfer existed, causing the banner to flash on every app open
       even when there was nothing to repair. Now we do the SAME index +
       scan that the server endpoint does, client-side, before deciding
       to run. Returns true ONLY if at least 1 confirmed transfer is
       actually missing an out-leg or in-leg.

       Cost: O(N + M) where N = transfers, M = treasury entries. Both
       are local arrays (already in memory via splitData). For 10K
       entries this is < 5ms — negligible.

       Result: banner only appears when work is actually needed. */
    shouldRun: (configDoc, data) => {
      const transfers = data?.treasuryTransfers || configDoc?.treasuryTransfers || [];
      const treasury  = data?.treasury || configDoc?.treasury || [];
      if (!Array.isArray(transfers) || transfers.length === 0) return false;
      /* Index legs by transferId (same shape as the server endpoint) */
      const legsByTransferId = new Map();
      for (const t of treasury) {
        if (t && t.transferId) {
          if (!legsByTransferId.has(t.transferId)) legsByTransferId.set(t.transferId, []);
          legsByTransferId.get(t.transferId).push(t);
        }
      }
      /* Look for at least one tf.status==='confirmed' missing a leg */
      for (const tf of transfers) {
        if (!tf || tf.status !== "confirmed") continue;
        const legs = legsByTransferId.get(tf.id) || [];
        const hasOut = legs.some(l => l && l.type === "out");
        const hasIn  = legs.some(l => l && l.type === "in");
        if ((tf.fromAccount && !hasOut) || (tf.toAccount && !hasIn)) {
          return true; /* found at least one broken — repair needed */
        }
      }
      return false; /* everything is whole — skip */
    },
    run: (user) => repairConfirmedTransfers({ dryRun: false }, user),
    successMsg: (r) => {
      if(!r.legs_created) return null; /* no-op, don't notify */
      return `🔧 أصلحنا ${r.legs_created} leg لـ ${r.transfers_with_missing_legs} تحويل`;
    },
    loadingMsg: "🔧 فحص + إصلاح التحويلات المعتمدة…",
  },
  {
    id: "legacy_orders_v2110",
    label: "نقل الـ Legacy Orders إلى seasons subcollection",
    /* The big one — can take 2-3 minutes for thousands of orders.
       Still safe to auto-run because: idempotent + backup + per-batch
       best-effort + conflict-avoidance. But we want the user to see
       a clear loading banner so they don't panic. */
    shouldRun: (configDoc) => {
      const arr = configDoc?.orders;
      return Array.isArray(arr) && arr.length > 0 && !configDoc._legacyOrdersMigratedV2110;
    },
    run: (user) => migrateLegacyOrders({ dryRun: false }, user),
    successMsg: (r) => `📦 نُقل ${r.orders_migrated || 0} طلب لـ seasons subcollection (${r.freed_kb || 0} KB)`,
    loadingMsg: "📦 نقل الـ Legacy Orders — قد ياخد 2-3 دقايق…",
  },
];

/* ── Should auto-migrations run at all? ──────────────────────────
   Gate: user must be admin, app must be online, listeners loaded.
   The flag in localStorage prevents re-attempts within a 5-minute
   window if the previous attempt is in progress (browser refresh
   while a migration is mid-flight). */
export function shouldAttemptAutoMigrations({ userRole, isOnline, listenersLoaded }) {
  if (!isOnline) return { ok: false, reason: "offline" };
  if (!listenersLoaded) return { ok: false, reason: "listeners-not-loaded" };
  if (userRole !== "admin") return { ok: false, reason: "not-admin" };

  /* Re-run lock: skip if a previous attempt is still considered "live" */
  try {
    if (typeof window !== "undefined") {
      const lockKey = "_clark_automigration_lock";
      const lockedAt = window.localStorage?.getItem(lockKey);
      if (lockedAt) {
        const age = Date.now() - parseInt(lockedAt, 10);
        if (age < 5 * 60 * 1000) {
          /* Lock is fresh — another tab/refresh might be mid-run */
          return { ok: false, reason: "lock-fresh", age };
        }
      }
    }
  } catch (_) {}

  return { ok: true };
}

/* ── Acquire the lock so concurrent tabs don't both run. ──────── */
export function acquireAutoMigrationLock() {
  try {
    if (typeof window !== "undefined") {
      window.localStorage?.setItem("_clark_automigration_lock", String(Date.now()));
    }
  } catch (_) {}
}

/* ── Release the lock after completion (success or failure). ──── */
export function releaseAutoMigrationLock() {
  try {
    if (typeof window !== "undefined") {
      window.localStorage?.removeItem("_clark_automigration_lock");
    }
  } catch (_) {}
}

/* ── Run a single migration with logging. Returns { ok, result, error } */
export async function runOneMigration(entry, user) {
  const startTs = Date.now();
  console.log(`[V21.9.49 auto-migration] STARTING ${entry.id}: ${entry.label}`);
  try {
    const result = await entry.run(user);
    const elapsed = Date.now() - startTs;
    if (result?.ok) {
      if (result.skipped) {
        console.log(`[V21.9.49] ${entry.id}: SKIPPED (already done) — ${elapsed}ms`);
      } else {
        console.log(`[V21.9.49] ${entry.id}: SUCCESS — ${elapsed}ms`, result);
      }
      return { ok: true, result };
    }
    /* result.ok === false → backend reported failure */
    console.warn(`[V21.9.49] ${entry.id}: backend-error`, result);
    return { ok: false, error: result?.error || "backend-error", result };
  } catch (err) {
    const elapsed = Date.now() - startTs;
    console.error(`[V21.9.49] ${entry.id}: THREW after ${elapsed}ms`, err);
    return { ok: false, error: err?.message || String(err) };
  }
}

/* ── The orchestrator. Sequentially runs all eligible migrations,
   firing progress callbacks so the UI banner can update. ──────── */
export async function runAllPendingMigrations({
  configDoc,
  data,
  user,
  onProgress, /* ({step, total, currentLabel, statusEntries}) => void */
  onResult,   /* (entryId, {ok, result, error}) => void */
}) {
  const eligible = AUTO_MIGRATIONS.filter(m => {
    try { return m.shouldRun(configDoc, data); }
    catch (e) { console.warn(`[V21.9.49] shouldRun threw for ${m.id}:`, e); return false; }
  });

  if (eligible.length === 0) {
    onProgress?.({ step: 0, total: 0, currentLabel: null, statusEntries: [] });
    return { ranCount: 0, eligibleCount: 0, statuses: [] };
  }

  acquireAutoMigrationLock();
  const statuses = [];
  try {
    for (let i = 0; i < eligible.length; i++) {
      const entry = eligible[i];
      onProgress?.({
        step: i + 1,
        total: eligible.length,
        currentLabel: entry.loadingMsg || entry.label,
        statusEntries: [...statuses],
      });
      const outcome = await runOneMigration(entry, user);
      statuses.push({ entry, outcome });
      onResult?.(entry.id, outcome);
    }
  } finally {
    releaseAutoMigrationLock();
  }

  onProgress?.({
    step: eligible.length,
    total: eligible.length,
    currentLabel: null,
    statusEntries: statuses,
  });

  return { ranCount: eligible.length, eligibleCount: eligible.length, statuses };
}
