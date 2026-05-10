/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Bosta state buckets (V20.1, client-side)
   ───────────────────────────────────────────────────────────────────────
   Mirrors api/bosta/_constants.js for the UI. The server stamps
   bucket/emoji/color on the order's bosta object so we mostly just read
   them, but this file is the source of truth for filter labels.
   ═══════════════════════════════════════════════════════════════════════ */

export const BOSTA_BUCKETS = [
  { key: "pending",     label: "بانتظار الاستلام", color: "#94A3B8", emoji: "⏳" },
  { key: "in_transit",  label: "في الطريق",         color: "#3B82F6", emoji: "📦" },
  { key: "out_for_del", label: "خرج للتوصيل",       color: "#0EA5E9", emoji: "🛵" },
  { key: "delayed",     label: "متأخر / مشكلة",     color: "#F59E0B", emoji: "⚠️" },
  { key: "delivered",   label: "تم التوصيل",         color: "#10B981", emoji: "✅" },
  { key: "returned",    label: "مرتجع",               color: "#EF4444", emoji: "↩️" },
  { key: "lost",        label: "مفقود",               color: "#DC2626", emoji: "❓" },
  { key: "damaged",     label: "تالف",                color: "#DC2626", emoji: "💥" },
  { key: "cancelled",   label: "ملغي",                color: "#94A3B8", emoji: "🚫" },
  { key: "unknown",     label: "غير معروف",           color: "#94A3B8", emoji: "❓" },
];

export function getBucketMeta(bucket){
  return BOSTA_BUCKETS.find(b => b.key === bucket) || BOSTA_BUCKETS[BOSTA_BUCKETS.length - 1];
}
