/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/maintenance/split-shopify-orders-daily
   (V21.9.3 / V21.9.20 — force-migration fallback)
   ───────────────────────────────────────────────────────────────
   Migrates factory/config.shopifyPendingOrders array into daily
   docs in shopifyOrdersDays/{YYYY-MM-DD}.

   Why: per the engineering protocol (CLAUDE.md §2), every growing
   array of dated entries should be split daily. shopifyPendingOrders
   is currently capped at 200 in factory/config, but as volume grows
   we want the cap to disappear and rely on daily docs (~10-50 orders
   per day, well under 1MB per doc).

   Behaviour:
     • Each order goes into the day doc keyed by its shopify_created_at
       (YYYY-MM-DD UTC).
     • Doc shape: { date: "YYYY-MM-DD", entries: [...], count }
     • Sets factory/config._splitDaysV2199Done = true (matches client App.jsx)
       AND _splitShopifyOrdersDaily = true (legacy compat).
     • Removes shopifyPendingOrders from factory/config.

   ═══════════════════════════════════════════════════════════════
   V21.9.20 ROOT-CAUSE FIX:
   Pre-V21.9.20 this endpoint set `_splitShopifyOrdersDaily` but the
   CLIENT (App.jsx V21.9.19) checks `_splitDaysV2199Done`. They were
   DIFFERENT FLAGS. So if the admin force-ran this endpoint:
     1. Server moved orders to day docs ✓
     2. Server stripped cfg.shopifyPendingOrders ✓
     3. Server set _splitShopifyOrdersDaily=true ✓
     4. Client refreshed → checked _splitDaysV2199Done (false) → ran
        the auto-migration AGAIN on an empty cfg.shopifyPendingOrders
        → no-op (stamps the V2199 flag with 0 orders) ✓ kinda
     5. Net result: orders ARE in day docs but the client's "merge"
        in App.jsx didn't gate on V2199 properly until V21.9.18, so
        the orders rendered as empty.
     6. WORSE: the broken cron (pre-V21.9.20) wrote orders BACK to
        cfg.shopifyPendingOrders within minutes — the bloat returned.

   This V21.9.20 rewrite:
     • Sets BOTH flags so client + server agree on migration state.
     • Also strips shopifyPendingOrders idempotently if it sneaks back
       (e.g. someone reverts a deploy briefly).
     • The note about "future cron writes back" is now FALSE — the
       cron is split-aware as of V21.9.20.

   This endpoint is now the OFFICIAL force-migration fallback if the
   client auto-migration fails to run (network blip during refresh,
   user opens the app from a stale tab, etc.).
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";

const COLLECTION = "shopifyOrdersDays";
const FLAG_NEW = "_splitDaysV2199Done";    /* V21.9.20: matches client App.jsx */
const FLAG_OLD = "_splitShopifyOrdersDaily"; /* legacy — keep for older clients */

function approxBytes(v){
  try { return Buffer.byteLength(JSON.stringify(v) || "", "utf8"); }
  catch(_) { return 0; }
}

function dayBucket(iso){
  if(!iso) return "unknown";
  const d = new Date(iso);
  if(isNaN(d.getTime())) return "unknown";
  return d.toISOString().slice(0, 10); /* YYYY-MM-DD */
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
  const force = body.force === true; /* re-run even if flag is set (e.g. cleanup) */
  const startTs = Date.now();

  try {
    const db = getDb();
    const cfgRef = db.collection("factory").doc("config");
    const snap = await cfgRef.get();
    if(!snap.exists){
      return res.status(404).json({ ok:false, error: "factory/config doesn't exist" });
    }
    const cfg = snap.data() || {};

    const alreadyMigrated = !!cfg[FLAG_NEW];
    const hasLeftoverArray = Array.isArray(cfg.shopifyPendingOrders) && cfg.shopifyPendingOrders.length > 0;

    /* Skip only if both flags set AND no leftover array. Otherwise we have
       work to do (re-strip, or migrate orders that snuck back in). */
    if(alreadyMigrated && !hasLeftoverArray && !force){
      return res.status(200).json({
        ok: true,
        skipped: true,
        message: "Migration already completed (V21.9.20 daily split for orders)",
        flags: { [FLAG_NEW]: !!cfg[FLAG_NEW], [FLAG_OLD]: !!cfg[FLAG_OLD] },
      });
    }

    const orders = Array.isArray(cfg.shopifyPendingOrders) ? cfg.shopifyPendingOrders : [];
    const ordersBytes = approxBytes(orders);

    /* Group by day (created_at) */
    const byDay = new Map();
    for(const o of orders){
      const day = dayBucket(o.shopify_created_at);
      if(!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(o);
    }

    if(dryRun){
      const breakdown = {};
      for(const [day, arr] of byDay.entries()) breakdown[day] = arr.length;
      return res.status(200).json({
        ok: true,
        dryRun: true,
        already_migrated: alreadyMigrated,
        has_leftover_array: hasLeftoverArray,
        total_orders: orders.length,
        days_count: byDay.size,
        days_breakdown: breakdown,
        will_free_kb: Math.round(ordersBytes / 1024),
        biggest_day_size: Math.max(...Array.from(byDay.values()).map(a => approxBytes(a)), 0),
      });
    }

    /* Step 1: backup (only if there's anything to back up) */
    let backupId = null;
    if(orders.length > 0){
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      backupId = "pre-split-shopify-orders-daily-v21.9.20-" + ts;
      await db.collection("backups").doc(backupId).set({
        label: "Backup قبل migration: split shopifyPendingOrders بـ يوم (V21.9.20 force-run)",
        autoGenerated: true,
        migrationType: "split-shopify-orders-daily-v21.9.20",
        createdAt: new Date().toISOString(),
        createdBy: auth.email || auth.uid,
        orders_count: orders.length,
        shopifyPendingOrders: orders,
      });
    }

    /* Step 2: write per-day docs (MERGE with existing, never overwrite —
       day doc may already have orders from other sources). */
    let daysCreated = 0;
    if(orders.length > 0){
      for(const [day, arr] of byDay.entries()){
        if(day === "unknown") continue;
        const dayRef = db.collection(COLLECTION).doc(day);
        await db.runTransaction(async (tx) => {
          const dSnap = await tx.get(dayRef);
          const existing = dSnap.exists ? (dSnap.data()?.entries || []) : [];
          const byId = new Map(existing.map(o => [String(o.shopify_order_id), o]));
          for(const o of arr){
            const id = String(o.shopify_order_id);
            /* Preserve any local state already in the day doc (delivered_at, etc.) */
            const prev = byId.get(id);
            byId.set(id, prev ? { ...prev, ...o, /* prev local fields win for delivered/etc. */
              status: prev.status && ["delivered","refused","returned"].includes(prev.status) ? prev.status : (o.status || prev.status),
              delivered_at: prev.delivered_at || o.delivered_at,
              delivered_by: prev.delivered_by || o.delivered_by,
              refused_at: prev.refused_at || o.refused_at,
              refused_by: prev.refused_by || o.refused_by,
              returned_at: prev.returned_at || o.returned_at,
              returned_by: prev.returned_by || o.returned_by,
              invoice_id: prev.invoice_id || o.invoice_id,
              invoice_no: prev.invoice_no || o.invoice_no,
              return_credit_note_id: prev.return_credit_note_id || o.return_credit_note_id,
              return_credit_note_no: prev.return_credit_note_no || o.return_credit_note_no,
              bosta: prev.bosta || o.bosta,
            } : o);
          }
          const merged = Array.from(byId.values()).sort((a, b) => {
            const ta = a.shopify_created_at ? new Date(a.shopify_created_at).getTime() : 0;
            const tb = b.shopify_created_at ? new Date(b.shopify_created_at).getTime() : 0;
            return tb - ta;
          });
          tx.set(dayRef, {
            date: day,
            entries: merged,
            count: merged.length,
            synced_at: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        });
        daysCreated++;
      }
    }

    /* Step 3: atomic strip + set BOTH flags (V21.9.20 fix) */
    await db.runTransaction(async (tx) => {
      const fresh = (await tx.get(cfgRef)).data() || {};
      const next = { ...fresh };
      delete next.shopifyPendingOrders;
      next[FLAG_NEW] = true;
      next[FLAG_OLD] = true; /* legacy flag — kept for any old client checks */
      next[FLAG_NEW + "_at"] = fresh[FLAG_NEW + "_at"] || new Date().toISOString();
      next[FLAG_NEW + "_by"] = fresh[FLAG_NEW + "_by"] || (auth.email || auth.uid);
      next._splitShopifyOrdersDaily_at = next._splitShopifyOrdersDaily_at || new Date().toISOString();
      next._splitShopifyOrdersDaily_by = next._splitShopifyOrdersDaily_by || (auth.email || auth.uid);
      next._splitShopifyOrdersDaily_orders_migrated = orders.length;
      next._splitShopifyOrdersDaily_days_count = daysCreated;
      next._splitShopifyOrdersDaily_force_run_at = new Date().toISOString();
      tx.set(cfgRef, next);
    });

    /* Step 4: log */
    try {
      await db.collection("migrationLog").doc("split-shopify-orders-daily-v21.9.20-" + Date.now()).set({
        type: "split-shopify-orders-daily-v21.9.20",
        status: "success",
        orders_migrated: orders.length,
        days_count: daysCreated,
        bytes_freed: ordersBytes,
        backup_doc_id: backupId,
        was_already_migrated: alreadyMigrated,
        had_leftover_array: hasLeftoverArray,
        by: auth.email || auth.uid,
        at: new Date().toISOString(),
      });
    } catch(_) {}

    return res.status(200).json({
      ok: true,
      total_migrated: orders.length,
      days_created: daysCreated,
      freed_kb: Math.round(ordersBytes / 1024),
      backup_doc_id: backupId,
      durationMs: Date.now() - startTs,
      flags: { [FLAG_NEW]: true, [FLAG_OLD]: true },
      note: "✅ Migration done. V21.9.20 has updated all server endpoints (cron, bosta, shopify) to write through _pendingOrders.js helper — the orders array will NOT re-accumulate in factory/config.",
    });
  } catch(e){
    console.error("[V21.9.20 split-shopify-orders-daily] failed:", e);
    return res.status(500).json({ ok:false, error: e.message });
  }
}
