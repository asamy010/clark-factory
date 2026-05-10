/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Shipping multi-provider client (V21.8 Phase 10i)
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
    if(!r.ok) throw new Error(data?.error || ("HTTP " + r.status));
    return data;
  } finally { clearTimeout(timer); }
}

/* Configure shipping providers (saves credentials for any/all providers).
   { default_provider?, bosta?, aramex?, mylerz? } → { ok, settings } */
export function shippingConfigure(opts, user){
  return call("POST", "/api/shipping/configure", opts, user);
}

/* Provider registry — mirrors api/shipping/_providers.js for the UI */
export const SHIPPING_PROVIDERS = [
  { key: "bosta",  label: "Bosta",  icon: "🚀", color: "#FF6F61", region: "Egypt", active: true,  capabilities: { create: true,  track: true,  awb: true,  webhook: true } },
  { key: "aramex", label: "Aramex", icon: "🟠", color: "#F37021", region: "MENA",  active: false, capabilities: { create: false, track: false, awb: false, webhook: false } },
  { key: "mylerz", label: "Mylerz", icon: "📦", color: "#1E40AF", region: "Egypt", active: false, capabilities: { create: false, track: false, awb: false, webhook: false } },
  { key: "manual", label: "يدوي",   icon: "✋",  color: "#64748B", region: "—",     active: true,  capabilities: { create: false, track: false, awb: false, webhook: false } },
];
