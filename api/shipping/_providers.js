/* ═══════════════════════════════════════════════════════════════
   CLARK — Shipping Providers Registry (V21.8 Phase 10i)
   ───────────────────────────────────────────────────────────────
   Plugin-style architecture for multiple shipping companies.
   Each provider exposes the same interface:
     - createShipment(creds, order) → { tracking_number, delivery_id }
     - getAwb(creds, deliveryIds) → { url }
     - trackByNumber(creds, trackingNumber) → { state_code, state_value, ... }
     - mapWebhookPayload(body) → { trackingNumber, stateCode, businessReference, ... }

   Bosta is implemented first. Aramex / Mylerz are stubbed.

   Provider keys:
     "bosta"   — Bosta (Egypt)
     "aramex"  — Aramex (international)
     "mylerz"  — Mylerz (Egypt)
     "manual"  — manual entry (no API integration)
   ═══════════════════════════════════════════════════════════════ */

export const SHIPPING_PROVIDERS = [
  {
    key: "bosta",
    label: "Bosta",
    icon: "🚀",
    color: "#FF6F61",
    region: "Egypt",
    api_endpoint: "https://app.bosta.co/api/v0",
    active: true,
    capabilities: { create: true, track: true, awb: true, webhook: true },
  },
  {
    key: "aramex",
    label: "Aramex",
    icon: "🟠",
    color: "#F37021",
    region: "MENA",
    api_endpoint: "https://ws.aramex.net",
    active: false, /* not implemented yet */
    capabilities: { create: false, track: false, awb: false, webhook: false },
  },
  {
    key: "mylerz",
    label: "Mylerz",
    icon: "📦",
    color: "#1E40AF",
    region: "Egypt",
    api_endpoint: "https://services.mylerz.net",
    active: false, /* not implemented yet */
    capabilities: { create: false, track: false, awb: false, webhook: false },
  },
  {
    key: "manual",
    label: "يدوي (بدون API)",
    icon: "✋",
    color: "#64748B",
    region: "—",
    api_endpoint: null,
    active: true,
    capabilities: { create: false, track: false, awb: false, webhook: false },
  },
];

export function getProvider(key){
  return SHIPPING_PROVIDERS.find(p => p.key === key) || SHIPPING_PROVIDERS[0];
}

export function getActiveProviders(){
  return SHIPPING_PROVIDERS.filter(p => p.active);
}

/* Get the configured creds for a provider from shopifyConfig */
export function getProviderCreds(cfg, providerKey){
  const sc = cfg?.shopifyConfig || {};
  switch(providerKey){
    case "bosta":
      return {
        api_key: (sc.bosta_api_key || "").trim(),
        business_id: (sc.bosta_business_id || "").trim(),
        webhook_secret_set: !!process.env.BOSTA_WEBHOOK_SECRET,
      };
    case "aramex":
      return {
        username: (sc.aramex_username || "").trim(),
        password: (sc.aramex_password || "").trim(),
        account_number: (sc.aramex_account_number || "").trim(),
      };
    case "mylerz":
      return {
        api_key: (sc.mylerz_api_key || "").trim(),
        username: (sc.mylerz_username || "").trim(),
      };
    default:
      return {};
  }
}

/* Default provider — what to use when not specified per-order */
export function getDefaultProvider(cfg){
  return cfg?.shopifyConfig?.default_shipping_provider || "bosta";
}
