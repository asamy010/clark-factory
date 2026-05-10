/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/bosta/sync-historical (V21.9 Phase 11d)
   ───────────────────────────────────────────────────────────────
   Pull ALL historical Bosta deliveries for verification + archive.

   Bosta API: GET https://app.bosta.co/api/v0/deliveries (paginated)
   We pull every delivery the business has, then:
     1. Archive them in Firestore subcollection: bostaDeliveriesArchive
        (split per yearmonth, max 600 per doc)
     2. Run a verification check against existing CLARK orders:
        for each Bosta delivery linked to a CLARK order via tracking_number,
        compare Bosta state vs CLARK status — flag mismatches.

   Body (optional):
     {
       sinceISO: "2024-01-01T00:00:00Z"  -- start date (default: 1 year back)
       maxDeliveries: 10000              -- safety cap
       maxPages: 100                     -- safety cap
     }

   Auth: admin Bearer

   Returns: {
     ok, totalFetched, pagesFetched,
     monthlyBreakdown: { "2024_03": 87, ... },
     archiveDocsWritten,
     verification: {
       linked: 142,            // CLARK orders that have Bosta tracking
       matching: 138,          // Bosta state matches CLARK status
       mismatches: [           // up to 50 entries for the UI
         { orderId, trackingNumber, clarkStatus, bostaState, severity }
       ],
       unlinked_bosta: 23,     // Bosta deliveries NOT in CLARK
       unlinked_clark: 7,      // CLARK orders with no Bosta delivery
     }
   }
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";
import { getBostaStateMeta } from "./_constants.js";

const MAX_DELIVERIES_PER_DOC = 600;
const ARCHIVE_COLLECTION = "bostaDeliveriesArchive";
const DEFAULT_LOOKBACK_DAYS = 365;
const PAGE_LIMIT = 100;

/* Map a Bosta delivery → CLARK shape */
function mapBostaDelivery(d){
  if(!d) return null;
  const stateRaw = d.state || {};
  const stateCode = Number(stateRaw.code || stateRaw.value || 0);
  const stateValue = String(stateRaw.value || stateRaw.label || "").trim();
  const meta = getBostaStateMeta(stateCode);
  return {
    bosta_id: String(d._id || d.id || ""),
    tracking_number: String(d.trackingNumber || d.tracking_number || "").trim(),
    state_code: stateCode,
    state_value: stateValue || meta.label,
    state_bucket: meta.bucket,
    receiver_phone: d.receiver?.phone || "",
    receiver_name: ((d.receiver?.firstName || "") + " " + (d.receiver?.lastName || "")).trim(),
    cod_amount: Number(d.cod || 0),
    cod_collected: !!d.codCollected,
    created_at: d.createdAt || null,
    updated_at: d.updatedAt || null,
    delivered_at: meta.bucket === "delivered" ? (d.updatedAt || null) : null,
    raw_status: d.status || null,
  };
}

/* Fetch a page of deliveries from Bosta. */
async function fetchDeliveriesPage(apiKey, page, since){
  const params = ["page=" + page, "limit=" + PAGE_LIMIT];
  if(since) params.push("createdAtMin=" + encodeURIComponent(since));
  const url = "https://app.bosta.co/api/v0/deliveries?" + params.join("&");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(url, {
      headers: { "Authorization": apiKey, "Accept": "application/json" },
      signal: ctrl.signal,
    });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch(_){ data = null; }
    if(!r.ok){
      throw new Error("Bosta " + r.status + ": " + (data?.message || text || "").slice(0, 200));
    }
    /* Bosta v0 list shape: { success, data: { list: [...], count, totalPages } } */
    const list = data?.data?.list || data?.data?.deliveries || data?.deliveries || [];
    const total = data?.data?.count || data?.totalCount || null;
    return { deliveries: list, total, hasMore: list.length >= PAGE_LIMIT };
  } finally { clearTimeout(t); }
}

const bucketKey = (iso) => {
  if(!iso) return "unknown";
  const d = new Date(iso);
  if(isNaN(d.getTime())) return "unknown";
  return d.getUTCFullYear() + "_" + String(d.getUTCMonth() + 1).padStart(2, "0");
};

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
  const sinceISO = body.sinceISO || new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 86400000).toISOString();
  const maxDeliveries = Math.max(1, Math.min(50000, Number(body.maxDeliveries) || 10000));
  const maxPages = Math.max(1, Math.min(1000, Number(body.maxPages) || 200));

  /* ── Get API key ── */
  let apiKey, clarkOrders;
  try {
    const db = getDb();
    const snap = await db.collection("factory").doc("config").get();
    const cfg = snap.exists ? (snap.data() || {}) : {};
    apiKey = (cfg.shopifyConfig?.bosta_api_key || "").trim();
    clarkOrders = Array.isArray(cfg.shopifyPendingOrders) ? cfg.shopifyPendingOrders : [];
  } catch(e){
    return res.status(500).json({ ok:false, error: "تعذر قراءة config: " + e.message });
  }
  if(!apiKey){
    return res.status(400).json({ ok:false, error: "Bosta API key مش معدّ" });
  }

  /* ── Pull all pages ── */
  const startTs = Date.now();
  const allDeliveries = [];
  let pagesFetched = 0;
  try {
    let page = 1;
    while(pagesFetched < maxPages){
      const r = await fetchDeliveriesPage(apiKey, page, sinceISO);
      pagesFetched++;
      const mapped = r.deliveries.map(mapBostaDelivery).filter(Boolean);
      for(const d of mapped){
        allDeliveries.push(d);
        if(allDeliveries.length >= maxDeliveries){
          r.hasMore = false;
          break;
        }
      }
      if(!r.hasMore) break;
      page++;
    }
  } catch(e){
    return res.status(502).json({ ok:false, error: "فشل سحب البيانات من Bosta: " + (e.message || e) });
  }

  /* ── Archive (split per month + 600/doc) ── */
  const monthlyBuckets = new Map();
  for(const d of allDeliveries){
    const k = bucketKey(d.created_at);
    if(!monthlyBuckets.has(k)) monthlyBuckets.set(k, []);
    monthlyBuckets.get(k).push(d);
  }
  let archiveDocsWritten = 0;
  const monthlyBreakdown = {};
  try {
    const db = getDb();
    for(const [bk, arr] of monthlyBuckets.entries()){
      monthlyBreakdown[bk] = arr.length;
      arr.sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
      });
      const chunks = [];
      for(let i = 0; i < arr.length; i += MAX_DELIVERIES_PER_DOC){
        chunks.push(arr.slice(i, i + MAX_DELIVERIES_PER_DOC));
      }
      for(let i = 0; i < chunks.length; i++){
        const docId = chunks.length === 1 ? bk : (bk + "_p" + (i + 1));
        await db.collection(ARCHIVE_COLLECTION).doc(docId).set({
          bucket: bk,
          page: i + 1,
          pages_total: chunks.length,
          deliveries: chunks[i],
          count: chunks[i].length,
          synced_at: new Date().toISOString(),
        });
        archiveDocsWritten++;
      }
    }
  } catch(e){
    return res.status(500).json({ ok:false, error: "فشل حفظ الأرشيف: " + (e.message || e) });
  }

  /* ── Verification check ── */
  /* Build a tracking_number → bosta delivery map */
  const bostaByTracking = new Map();
  for(const d of allDeliveries){
    if(d.tracking_number) bostaByTracking.set(d.tracking_number, d);
  }
  const clarkByTracking = new Map();
  for(const o of clarkOrders){
    const tn = o.bosta?.tracking_number;
    if(tn) clarkByTracking.set(tn, o);
  }
  const verification = {
    linked: 0,
    matching: 0,
    mismatches: [],
    unlinked_bosta: 0,
    unlinked_clark: 0,
    bosta_total: allDeliveries.length,
    clark_total: clarkOrders.length,
  };
  for(const [tn, o] of clarkByTracking.entries()){
    const d = bostaByTracking.get(tn);
    if(!d){
      verification.unlinked_clark++;
      continue;
    }
    verification.linked++;
    /* Compare statuses: CLARK status vs Bosta bucket */
    const clarkStatus = o.status; /* pending_delivery | delivered | refused | cancelled | returned */
    const bostaBucket = d.state_bucket; /* pending | in_transit | delivered | failed | returned */
    let matches = false;
    if(clarkStatus === "delivered" && bostaBucket === "delivered") matches = true;
    else if(clarkStatus === "refused" && bostaBucket === "failed") matches = true;
    else if(clarkStatus === "returned" && bostaBucket === "returned") matches = true;
    else if(clarkStatus === "pending_delivery" && (bostaBucket === "pending" || bostaBucket === "in_transit")) matches = true;
    else if(clarkStatus === "cancelled" && bostaBucket === "failed") matches = true;
    if(matches){
      verification.matching++;
    } else {
      /* Severity:
         - high: Bosta says delivered/failed but CLARK is still pending → STALE
         - medium: states diverge in a non-final way
         - low: CLARK is finalized but Bosta still in_transit (cleanup needed) */
      let severity = "medium";
      if(clarkStatus === "pending_delivery" && (bostaBucket === "delivered" || bostaBucket === "failed" || bostaBucket === "returned")){
        severity = "high";
      } else if((clarkStatus === "delivered" || clarkStatus === "refused") && bostaBucket === "in_transit"){
        severity = "low";
      }
      if(verification.mismatches.length < 50){
        verification.mismatches.push({
          orderId: o.shopify_order_id,
          orderName: o.shopify_name || "",
          customerName: o.customer_info?.name || "",
          customerPhone: o.customer_info?.phone || "",
          trackingNumber: tn,
          clarkStatus,
          bostaState: d.state_value,
          bostaBucket,
          severity,
        });
      }
    }
  }
  /* Bosta deliveries not linked to any CLARK order */
  for(const tn of bostaByTracking.keys()){
    if(!clarkByTracking.has(tn)) verification.unlinked_bosta++;
  }

  /* Save verification report */
  try {
    const db = getDb();
    await db.collection("factory").doc("config").set({
      shopifyConfig: {
        last_bosta_historical_sync_at: new Date().toISOString(),
        last_bosta_historical_sync_count: allDeliveries.length,
        last_bosta_verification: {
          ...verification,
          mismatches: verification.mismatches.slice(0, 50),
          run_at: new Date().toISOString(),
        },
      },
    }, { merge: true });
  } catch(e){
    /* non-fatal */
  }

  return res.status(200).json({
    ok: true,
    totalFetched: allDeliveries.length,
    pagesFetched,
    monthlyBreakdown,
    archiveDocsWritten,
    verification,
    durationMs: Date.now() - startTs,
    sinceISO,
  });
}
