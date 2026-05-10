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

  const startTs = Date.now();
  const monthlyBuckets = new Map(); /* "2024_03" → [order, order, ...] */
  let totalFetched = 0;
  let pagesFetched = 0;
  let hitMax = false;

  const bucketKey = (iso) => {
    if(!iso) return "unknown";
    const d = new Date(iso);
    if(isNaN(d.getTime())) return "unknown";
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    return y + "_" + m;
  };

  /* Step 1: Walk all pages, bucket by YYYY_MM in memory.
     Memory footprint: 50k orders × ~1KB ≈ 50MB. Vercel functions get 1024MB
     by default for Pro plans, so we're fine. For free-tier (1024MB also),
     50MB is comfortable. */
  try {
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
      },
    });
    totalFetched = r.totalFetched;
    pagesFetched = r.pagesFetched;
    hitMax = r.hitMax;
  } catch(e){
    return res.status(502).json({ ok:false, error: "فشل سحب الطلبات: " + (e.message || e) });
  }

  /* Step 2: Write each YYYY_MM bucket to Firestore. Split if a single bucket
     exceeds MAX_ORDERS_PER_DOC by suffixing _p1, _p2 etc. */
  let archiveDocsWritten = 0;
  const monthlyBreakdown = {};
  try {
    const db = getDb();
    /* We use top-level collection `shopifyOrdersArchive` (not subcollection)
       to keep query patterns simple. Doc id = "{YYYY_MM}" or "{YYYY_MM}_pN". */
    for(const [bk, orders] of monthlyBuckets.entries()){
      monthlyBreakdown[bk] = orders.length;
      /* Sort newest-first within each bucket (matches user expectation) */
      orders.sort((a, b) => {
        const ta = a.shopify_created_at ? new Date(a.shopify_created_at).getTime() : 0;
        const tb = b.shopify_created_at ? new Date(b.shopify_created_at).getTime() : 0;
        return tb - ta;
      });
      /* Split into chunks of MAX_ORDERS_PER_DOC */
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
    }
    /* Save sync metadata */
    await db.collection("factory").doc("config").set({
      shopifyConfig: {
        last_historical_sync_at: new Date().toISOString(),
        last_historical_sync_count: totalFetched,
        last_historical_sync_since: sinceISO,
        last_historical_sync_months: Object.keys(monthlyBreakdown).length,
        last_historical_sync_archive_docs: archiveDocsWritten,
      },
    }, { merge: true });
  } catch(e){
    return res.status(500).json({ ok:false, error: "فشل حفظ الأرشيف: " + (e.message || e) });
  }

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
