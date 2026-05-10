/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Judge.me Client (V21.5 Phase 10f)
   ═══════════════════════════════════════════════════════════════════════ */

const API_TIMEOUT_MS = 60000; /* longer because reviews fetch can take a while */

async function getIdToken(user){
  if(!user || typeof user.getIdToken !== "function"){
    throw new Error("لازم تسجّل دخول كأدمن");
  }
  return await user.getIdToken();
}

async function call(method, path, body, user){
  const idToken = await getIdToken(user);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);
  try {
    const opts = {
      method,
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + idToken,
      },
      signal: ctrl.signal,
    };
    if(body && method !== "GET") opts.body = JSON.stringify(body);
    const r = await fetch(path, opts);
    let data;
    try { data = await r.json(); } catch(_){ data = {}; }
    if(!r.ok){
      throw new Error(data?.error || ("HTTP " + r.status));
    }
    return data;
  } finally { clearTimeout(timer); }
}

/* Sync reviews from Judge.me. Returns { ok, total_reviews, products_with_reviews, avg_rating } */
export function judgemeSyncReviews(user){
  return call("POST", "/api/judgeme/sync-reviews", {}, user);
}

/* Get aggregated stats for a product (client-side helper, no API call) */
export function getProductRating(data, shopifyProductId){
  if(!shopifyProductId) return null;
  const list = Array.isArray(data?.judgemeReviews) ? data.judgemeReviews : [];
  return list.find(r => String(r.product_id) === String(shopifyProductId)) || null;
}
