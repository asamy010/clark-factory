/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/judgeme/sync-reviews (V21.5 Phase 10f)
   ───────────────────────────────────────────────────────────────
   Pull reviews from Judge.me and save aggregated ratings per
   shopify product ID. Read-only — display only, no creation.

   Body: {} (no params)
   Auth: admin

   Returns: { ok, total_reviews, products_with_reviews, avg_rating }

   Required config in shopifyConfig:
     judgeme_api_token  — get from Judge.me dashboard → API
     shop_domain        — your-store.myshopify.com (already saved)

   Judge.me API: https://judge.me/api
   Endpoint: GET https://judge.me/api/v1/reviews?api_token=...&shop_domain=...&per_page=100
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";

async function fetchReviewsPage(apiToken, shopDomain, page){
  const url = "https://judge.me/api/v1/reviews"
    + "?api_token=" + encodeURIComponent(apiToken)
    + "&shop_domain=" + encodeURIComponent(shopDomain)
    + "&page=" + page
    + "&per_page=100";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if(!r.ok){
      const text = await r.text().catch(() => "");
      throw new Error("Judge.me " + r.status + ": " + text.slice(0, 200));
    }
    return await r.json();
  } finally { clearTimeout(timer); }
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

  try {
    const db = getDb();
    const cfgRef = db.collection("factory").doc("config");
    const snap = await cfgRef.get();
    const cfg = snap.exists ? (snap.data() || {}) : {};
    const apiToken = (cfg.shopifyConfig?.judgeme_api_token || "").trim();
    const shopDomain = (cfg.shopifyConfig?.store_url || "").trim();
    if(!apiToken){
      return res.status(400).json({ ok:false, error: "Judge.me API token مش معدّ في الإعدادات" });
    }
    if(!shopDomain){
      return res.status(400).json({ ok:false, error: "Shopify store URL مش متصل" });
    }

    /* Fetch all reviews paginated. Cap at 50 pages = 5,000 reviews. */
    const allReviews = [];
    for(let page = 1; page <= 50; page++){
      const data = await fetchReviewsPage(apiToken, shopDomain, page);
      const list = Array.isArray(data?.reviews) ? data.reviews : [];
      if(list.length === 0) break;
      allReviews.push(...list);
      if(list.length < 100) break;
      /* Pause briefly to avoid rate limits */
      await new Promise(r => setTimeout(r, 300));
    }

    /* Aggregate by product_external_id (= Shopify product ID) */
    const byProduct = new Map();
    for(const review of allReviews){
      const productId = String(review.product_external_id || review.product_id || "");
      if(!productId) continue;
      if(!byProduct.has(productId)){
        byProduct.set(productId, {
          product_id: productId,
          count: 0,
          rating_sum: 0,
          ratings: [0, 0, 0, 0, 0, 0], /* index = star count (0-5) */
          recent: [],
        });
      }
      const p = byProduct.get(productId);
      const rating = Number(review.rating) || 0;
      p.count++;
      p.rating_sum += rating;
      if(rating >= 1 && rating <= 5){ p.ratings[rating]++; }
      /* Keep last 5 reviews for display */
      if(p.recent.length < 5){
        p.recent.push({
          rating,
          title: review.title || "",
          body: (review.body || "").slice(0, 300),
          reviewer_name: review.reviewer?.name || review.reviewer_name || "",
          created_at: review.created_at || "",
          verified: !!review.verified,
        });
      }
    }

    const aggregates = Array.from(byProduct.values()).map(p => ({
      ...p,
      avg_rating: p.count > 0 ? r2(p.rating_sum / p.count) : 0,
    }));

    /* Save aggregates */
    const totalRating = allReviews.reduce((s, r) => s + (Number(r.rating) || 0), 0);
    const overallAvg = allReviews.length > 0 ? r2(totalRating / allReviews.length) : 0;
    await cfgRef.set({
      judgemeReviews: aggregates,
      shopifyConfig: {
        ...(cfg.shopifyConfig || {}),
        last_judgeme_sync_at: new Date().toISOString(),
        last_judgeme_sync_count: allReviews.length,
      },
    }, { merge: true });

    return res.status(200).json({
      ok: true,
      total_reviews: allReviews.length,
      products_with_reviews: aggregates.length,
      avg_rating: overallAvg,
    });
  } catch(e){
    return res.status(500).json({ ok:false, error: e.message });
  }
}

function r2(n){ return Math.round((Number(n) || 0) * 100) / 100; }
