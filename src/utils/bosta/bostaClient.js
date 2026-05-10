/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Bosta Client (V20.1 Phase 9)
   ───────────────────────────────────────────────────────────────────────
   Browser wrappers for /api/bosta/* endpoints.
   ═══════════════════════════════════════════════════════════════════════ */

const API_TIMEOUT_MS = 20000;

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
  } finally {
    clearTimeout(timer);
  }
}

/* Save Bosta integration settings.
   { enabled?, api_key?, business_id?, auto_mark_delivered?, auto_mark_refused?, regenerate_secret?, clear? }
   → { ok, settings, webhookUrlBase, webhookUrlExample, hasWebhookSecretSet, generatedSecret?, webhookUrl?, instructions? } */
export function bostaConfigure(opts, user){
  return call("POST", "/api/bosta/configure", opts, user);
}

/* Link a tracking number to a CLARK order, or refresh from Bosta API.
   Link mode:    { orderId, trackingNumber } → { ok, order, action: "linked" }
   Refresh mode: { orderId, refresh: true }   → { ok, order, action: "refreshed", state: {...} } */
export function bostaTrack(opts, user){
  return call("POST", "/api/bosta/track", opts, user);
}
