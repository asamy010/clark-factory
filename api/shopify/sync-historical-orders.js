/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/shopify/sync-historical-orders (V21.9 Phase 11c)
   ───────────────────────────────────────────────────────────────
   FULL-HISTORY backfill of Shopify orders using cursor pagination.

   Unlike sync-orders-now (which is a 7-day window capped at 200 in
   factory/config.shopifyPendingOrders), this endpoint:
     • Walks ALL historical orders (no time window by default)
     • Uses Link-header cursor pagination (>250 orders per call)
     • SPLITS storage by yearmonth into Firestore subcollection:
         factory/config_archives/orders_{YYYY_MM}
       Each archive doc holds at most ~5000 orders (~800KB) — well
       under Firestore's 1MB cap.
     • Returns a per-month breakdown so the UI can show progress.

   Body (optional):
     {
       sinceISO: "2024-01-01T00:00:00Z"   -- start date (default: 2 years back)
       maxOrders: 20000                    -- safety cap
       maxPages: 200                       -- safety cap (200 × 250 = 50k orders)
       status: "any"                       -- any | open | closed | cancelled
     }

   Auth: admin Bearer token

   Returns: {
     ok, totalFetched, pagesFetched, hitMax,
     monthlyBreakdown: { "2024_03": 142, "2024_04": 198, ... },
     archiveDocsWritten: 12,
     durationMs: 45000
   }
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";
import { getShopifyCreds, fetchHistoricalOrders } from "./_shopifyAdmin.js";
import { withProgress } from "../_progressTracker.js";

/* Cap per archive doc — keep well under Firestore's 1 MB hard limit.
   Empirically each mapped order is ~600B-1.5KB; 5000 × 1KB ≈ 5MB which
   is too large. Real cap: 800KB safety → ~600 orders per doc. We bucket
   by year-month and split into pages if a single month overflows. */
const MAX_ORDERS_PER_DOC = 600;
const ARCHIVE_COLLECTION = "shopifyOrdersArchive";
const DEFAULT_LOOKBACK_DAYS = 730; /* 2 years */

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

  const creds = await getShopifyCreds();
  if(!creds){
    return res.status(400).json({ ok:false, error: "الاتصال بـ Shopify مش معدّ" });
  }

  const body = (typeof req.body === "string") ? JSON.parse(req.body || "{}") : (req.body || {});
  const sinceISO = body.sinceISO || new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 86400000).toISOString();
  const maxOrders = Math.max(1, Math.min(50000, Number(body.maxOrders) || 20000));
  const maxPages = Math.max(1, Math.min(500, Number(body.maxPages) || 200));
  const status = body.status || "any";

  const bucketKey = (iso) => {
    if(!iso) return "unknown";
    const d = new Date(iso);
    if(isNaN(d.getTime())) return "unknown";
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    return y + "_" + m;
  };

  /* V21.9.4: wrap in withProgress to report live progress to the client overlay */
  return withProgress(req, res, {
    jobId: body.jobId,
    type: "shopify-sync-historical-orders",
    label: "سحب كل طلبات Shopify التاريخية",
    by: auth.email || auth.uid,
    total: maxOrders, /* upper bound; updated as we know better */
  }, async (update) => {
    await update({ message: "بدء الاتصال بـ Shopify..." });

    const startTs = Date.now();
    const monthlyBuckets = new Map();
    let totalFetched = 0;
    let pagesFetched = 0;
    let hitMax = false;

    /* Step 1: paginate */
    const r = await fetchHistoricalOrders(creds, {
      createdSince: sinceISO,
      status,
      maxOrders,
      maxPages,
      onPage: async (mapped, pageNum, totalSoFar) => {
        for(const o of mapped){
          if(!o.shopify_created_at) continue;
          const k = bucketKey(o.shopify_created_at);
          if(!monthlyBuckets.has(k)) monthlyBuckets.set(k, []);
          monthlyBuckets.get(k).push(o);
        }
        await update({
          progress: totalSoFar,
          total: maxOrders,
          message: `سحب الصفحة ${pageNum} — ${totalSoFar} طلب حتى الآن`,
          sub_message: `${monthlyBuckets.size} شهر مقسّم في الذاكرة`,
        });
      },
    });
    totalFetched = r.totalFetched;
    pagesFetched = r.pagesFetched;
    hitMax = r.hitMax;

    await update({
      progress: totalFetched,
      total: totalFetched, /* 100% for the fetch phase */
      message: `تم سحب ${totalFetched} طلب · جاري الحفظ في الأرشيف...`,
      sub_message: `${monthlyBuckets.size} شهر`,
    });

    /* Step 2: write archive docs */
    let archiveDocsWritten = 0;
    const monthlyBreakdown = {};
    const db = getDb();
    const totalBuckets = monthlyBuckets.size;
    let bucketIdx = 0;
    for(const [bk, orders] of monthlyBuckets.entries()){
      bucketIdx++;
      monthlyBreakdown[bk] = orders.length;
      orders.sort((a, b) => {
        const ta = a.shopify_created_at ? new Date(a.shopify_created_at).getTime() : 0;
        const tb = b.shopify_created_at ? new Date(b.shopify_created_at).getTime() : 0;
        return tb - ta;
      });
      const chunks = [];
      for(let i = 0; i < orders.length; i += MAX_ORDERS_PER_DOC){
        chunks.push(orders.slice(i, i + MAX_ORDERS_PER_DOC));
      }
      for(let i = 0; i < chunks.length; i++){
        const docId = chunks.length === 1 ? bk : (bk + "_p" + (i + 1));
        const docRef = db.collection(ARCHIVE_COLLECTION).doc(docId);
        await docRef.set({
          bucket: bk,
          page: i + 1,
          pages_total: chunks.length,
          orders: chunks[i],
          count: chunks[i].length,
          synced_at: new Date().toISOString(),
        });
        archiveDocsWritten++;
      }
      await update({
        message: `حفظ الأرشيف: ${bucketIdx}/${totalBuckets} شهر`,
        sub_message: `شهر ${bk.replace("_", "/")} — ${orders.length} طلب`,
      });
    }
    /* V21.9.9: ALSO populate factory/config.shopifyPendingOrders with the
       most-recent orders so they appear in the live Orders tab. Previously
       the historical sync only wrote to the archive, leaving the live list
       empty — user reported "الطلبات مظهرتش في القائمة".

       Take the most-recent N=200 orders (matches ORDERS_CAP in sync-orders-now)
       and merge with existing live orders by shopify_order_id. Existing local
       state (status, invoice_id, delivered_at) is preserved. */
    await update({ message: "تحديث قائمة الطلبات الـ live..." });
    const ORDERS_CAP_LIVE = 200;
    const allOrdersFlat = [];
    for(const [, list] of monthlyBuckets.entries()){
      for(const o of list) allOrdersFlat.push(o);
    }
    /* Sort newest first by shopify_created_at */
    allOrdersFlat.sort((a, b) => {
      const ta = a.shopify_created_at ? new Date(a.shopify_created_at).getTime() : 0;
      const tb = b.shopify_created_at ? new Date(b.shopify_created_at).getTime() : 0;
      return tb - ta;
    });
    const recentForLive = allOrdersFlat.slice(0, ORDERS_CAP_LIVE);

    /* Merge with existing live (preserve local state mutations) */
    const cfgRef = db.collection("factory").doc("config");
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(cfgRef);
      const fresh = snap.exists ? (snap.data() || {}) : {};
      const existingLive = Array.isArray(fresh.shopifyPendingOrders) ? fresh.shopifyPendingOrders : [];
      const existingMap = new Map(existingLive.map(o => [String(o.shopify_order_id), o]));

      const mergedList = [];
      const seenIds = new Set();
      for(const o of recentForLive){
        const id = String(o.shopify_order_id);
        if(seenIds.has(id)) continue;
        seenIds.add(id);
        const prev = existingMap.get(id);
        if(prev){
          /* Preserve local mutations + Bosta tracking */
          mergedList.push({
            ...o,
            status: prev.status || o.status,
            stock_reserved: prev.stock_reserved,
            stock_reservations: prev.stock_reservations,
            invoice_id: prev.invoice_id,
            delivered_at: prev.delivered_at,
            refused_at: prev.refused_at,
            refusal_reason: prev.refusal_reason,
            returned_at: prev.returned_at,
            return_credit_note_id: prev.return_credit_note_id,
            bosta: prev.bosta || o.bosta,
          });
        } else {
          mergedList.push(o);
        }
      }
      /* Also include any existing live orders that weren't in the historical
         pull (newer than sinceISO maybe, or edge cases). */
      for(const o of existingLive){
        const id = String(o.shopify_order_id);
        if(!seenIds.has(id)){
          seenIds.add(id);
          mergedList.push(o);
        }
      }

      /* Sort + cap */
      mergedList.sort((a, b) => {
        const ta = a.shopify_created_at ? new Date(a.shopify_created_at).getTime() : 0;
        const tb = b.shopify_created_at ? new Date(b.shopify_created_at).getTime() : 0;
        return tb - ta;
      });
      const final = mergedList.slice(0, ORDERS_CAP_LIVE);

      tx.set(cfgRef, {
        shopifyPendingOrders: final,
        shopifyConfig: {
          ...(fresh.shopifyConfig || {}),
          last_historical_sync_at: new Date().toISOString(),
          last_historical_sync_count: totalFetched,
          last_historical_sync_since: sinceISO,
          last_historical_sync_months: Object.keys(monthlyBreakdown).length,
          last_historical_sync_archive_docs: archiveDocsWritten,
          last_orders_sync_at: new Date().toISOString(),
          last_orders_sync_count: final.length,
        },
      }, { merge: true });
    });

    /* Final result — returned to HTTP + saved to job.result */
    return {
      totalFetched,
      pagesFetched,
      hitMax,
      monthlyBreakdown,
      archiveDocsWritten,
      durationMs: Date.now() - startTs,
      sinceISO,
      message: `تم! ${totalFetched} طلب في ${Object.keys(monthlyBreakdown).length} شهر`,
    };
  });
}

/* legacy unused code path left as fallback if withProgress fails to load */
async function _oldHandler(req, res, monthlyBreakdown, totalFetched, pagesFetched, hitMax, archiveDocsWritten, sinceISO, startTs){
  return res.status(200).json({
    ok: true,
    totalFetched,
    pagesFetched,
    hitMax,
    monthlyBreakdown,
    archiveDocsWritten,
    durationMs: Date.now() - startTs,
    sinceISO,
  });
}
