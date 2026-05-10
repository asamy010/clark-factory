/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Shopify Customer Tier metadata (V20.2 client-side)
   ───────────────────────────────────────────────────────────────────────
   Mirror of api/shopify/_customers.js TIER_META. The tier itself is
   computed server-side; this file just provides the UI rendering meta.
   ═══════════════════════════════════════════════════════════════════════ */

export const TIER_META = {
  vip:          { label: "VIP",      color: "#8B5CF6", emoji: "👑", desc: "5+ تسليم أو إنفاق ≥ 5000ج" },
  regular:      { label: "Regular",  color: "#10B981", emoji: "🌟", desc: "2-4 تسليم خلال 90 يوم" },
  new:          { label: "جديد",      color: "#0EA5E9", emoji: "🆕", desc: "1 تسليم حديث" },
  at_risk:      { label: "بحاجة لمتابعة", color: "#F59E0B", emoji: "⚠️", desc: "آخر تسليم > 90 يوم" },
  inactive:     { label: "غير نشط",    color: "#94A3B8", emoji: "😴", desc: "مفيش تسليم ناجح" },
  /* V20.3: Shopify-only customers (registered but never bought via CLARK) */
  shopify_only: { label: "Shopify فقط", color: "#06B6D4", emoji: "🛍️", desc: "مسجل في Shopify (مش متابع في CLARK)" },
  unknown:      { label: "غير محدد",   color: "#64748B", emoji: "❓", desc: "" },
};

export function getTierMeta(tier){
  return TIER_META[tier] || TIER_META.unknown;
}

/* WhatsApp deep-link builder. Returns wa.me URL with pre-filled text. */
export function buildWhatsAppLink(phone, text){
  if(!phone) return "";
  const digits = String(phone).replace(/[^0-9]/g, "");
  return "https://wa.me/" + digits + (text ? "?text=" + encodeURIComponent(text) : "");
}
