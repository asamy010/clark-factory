/* ═══════════════════════════════════════════════════════════════
   CLARK — Bosta state codes + helpers (V20.1 Phase 9, server-side)
   ───────────────────────────────────────────────────────────────
   Bosta uses numeric state codes for delivery status. We map them
   to CLARK-side state buckets so the UI can render consistent
   icons/colors regardless of which exact Bosta sub-state we got.

   Source: Bosta API docs (https://docs.bosta.co)
   Code list verified from real webhook payloads + dashboard UI.
   ═══════════════════════════════════════════════════════════════ */

/* Detailed Bosta state codes → CLARK bucket + display meta. */
export const BOSTA_STATES = {
  /* Pre-pickup */
  10: { bucket: "pending",      label: "جديد",                 emoji: "🆕", color: "#94A3B8" },
  11: { bucket: "pending",      label: "بانتظار الاستلام",      emoji: "⏳", color: "#F59E0B" },
  /* Pickup */
  20: { bucket: "in_transit",   label: "تم الاستلام",           emoji: "📦", color: "#3B82F6" },
  21: { bucket: "in_transit",   label: "تم الاستلام",           emoji: "📦", color: "#3B82F6" },
  22: { bucket: "in_transit",   label: "في المخزن",             emoji: "🏬", color: "#6366F1" },
  23: { bucket: "in_transit",   label: "في الطريق للهب",        emoji: "🚛", color: "#6366F1" },
  /* Out for delivery */
  24: { bucket: "out_for_del",  label: "خرج للتوصيل",           emoji: "🛵", color: "#0EA5E9" },
  25: { bucket: "out_for_del",  label: "خرج للتوصيل",           emoji: "🛵", color: "#0EA5E9" },
  /* Issues */
  41: { bucket: "delayed",      label: "متأخر",                  emoji: "⚠️", color: "#F59E0B" },
  42: { bucket: "delayed",      label: "تأجيل من العميل",        emoji: "⏸",  color: "#F59E0B" },
  43: { bucket: "delayed",      label: "محاولة فاشلة",           emoji: "❗", color: "#F59E0B" },
  44: { bucket: "delayed",      label: "تم تغيير العنوان",       emoji: "📍", color: "#8B5CF6" },
  /* Final states */
  45: { bucket: "delivered",    label: "تم التوصيل",             emoji: "✅", color: "#10B981" },
  46: { bucket: "returned",     label: "مرتجع",                   emoji: "↩️", color: "#EF4444" },
  47: { bucket: "returned",     label: "مرتجع للمخزن",            emoji: "↩️", color: "#EF4444" },
  48: { bucket: "returned",     label: "مرتجع كلياً",            emoji: "↩️", color: "#EF4444" },
  49: { bucket: "lost",         label: "مفقود",                   emoji: "❓", color: "#DC2626" },
  50: { bucket: "damaged",      label: "تالف",                    emoji: "💥", color: "#DC2626" },
  /* Cancelled */
  60: { bucket: "cancelled",    label: "ملغي",                    emoji: "🚫", color: "#94A3B8" },
};

/* Get meta for a state code; returns a generic "unknown" entry if not in our map. */
export function getBostaStateMeta(code){
  const c = Number(code);
  if(BOSTA_STATES[c]) return { code: c, ...BOSTA_STATES[c] };
  /* Unknown code — bucket by range */
  if(c >= 10 && c <= 19) return { code: c, bucket: "pending", label: "حالة #" + c, emoji: "❓", color: "#94A3B8" };
  if(c >= 20 && c <= 29) return { code: c, bucket: "in_transit", label: "حالة #" + c, emoji: "📦", color: "#3B82F6" };
  if(c >= 40 && c <= 44) return { code: c, bucket: "delayed", label: "حالة #" + c, emoji: "⚠️", color: "#F59E0B" };
  if(c >= 45 && c <= 48) return { code: c, bucket: "returned", label: "حالة #" + c, emoji: "↩️", color: "#EF4444" };
  return { code: c || 0, bucket: "unknown", label: "غير معروف", emoji: "❓", color: "#94A3B8" };
}

/* Bucket → display meta (for UI badges). */
export const BOSTA_BUCKETS = {
  pending:      { label: "بانتظار الاستلام", color: "#94A3B8", emoji: "⏳" },
  in_transit:   { label: "في الطريق",         color: "#3B82F6", emoji: "📦" },
  out_for_del:  { label: "خرج للتوصيل",       color: "#0EA5E9", emoji: "🛵" },
  delayed:      { label: "متأخر / مشكلة",     color: "#F59E0B", emoji: "⚠️" },
  delivered:    { label: "تم التوصيل",         color: "#10B981", emoji: "✅" },
  returned:     { label: "مرتجع",               color: "#EF4444", emoji: "↩️" },
  lost:         { label: "مفقود",               color: "#DC2626", emoji: "❓" },
  damaged:      { label: "تالف",                color: "#DC2626", emoji: "💥" },
  cancelled:    { label: "ملغي",                color: "#94A3B8", emoji: "🚫" },
  unknown:      { label: "غير معروف",           color: "#94A3B8", emoji: "❓" },
};

/* Extract delivery info from a Bosta webhook payload. Bosta payloads
   come in different shapes depending on event type and API version.
   This normalizer covers the common ones we see:
     • { type:"DELIVERY_STATUS_UPDATE", delivery: {...} }
     • { event:"...", data: { delivery: {...} } }
     • { trackingNumber, state, ... } (flat) */
export function normalizeBostaWebhook(payload){
  if(!payload || typeof payload !== "object") return null;
  const d = payload.delivery || payload.data?.delivery || payload.data || payload;
  if(!d || typeof d !== "object") return null;
  const trackingNumber = String(
    d.trackingNumber || d.tracking_number || d.tracking || d.trackingNo || ""
  ).trim();
  const stateRaw = d.state || d.status || {};
  const stateCode = Number(stateRaw.code || stateRaw.id || stateRaw.value || stateRaw) || 0;
  const stateValue = String(stateRaw.value || stateRaw.label || stateRaw.name || stateRaw.text || "").trim();
  const businessReference = String(d.businessReference || d.business_reference || d.reference || "").trim();
  const receiver = d.receiver || d.recipient || {};
  const receiverPhone = String(receiver.phone || receiver.phoneNumber || receiver.mobile || "").trim();
  const receiverName = [receiver.firstName, receiver.lastName].filter(Boolean).join(" ").trim()
    || String(receiver.name || receiver.fullName || "").trim();
  const cod = Number(d.cod || d.codAmount || d.cashOnDelivery || 0) || 0;
  return {
    trackingNumber,
    stateCode,
    stateValue,
    businessReference,
    receiverPhone,
    receiverName,
    cod,
    occurredAt: d.updatedAt || d.timestamp || d.createdAt || new Date().toISOString(),
    deliveryId: String(d._id || d.id || ""),
    raw: payload,
  };
}

/* Normalize a phone number to comparable form (digits only, with leading 2 for Egypt). */
export function normalizePhone(phone){
  if(!phone) return "";
  let s = String(phone).trim().replace(/[^0-9]/g, "");
  /* Strip leading 0 for Egyptian numbers, then prepend 2 */
  if(s.startsWith("00")) s = s.slice(2);
  if(s.startsWith("20")) return s;
  if(s.startsWith("0")) return "20" + s.slice(1);
  if(s.length === 10 || s.length === 11) return "20" + s;
  return s;
}

/* Match a Bosta delivery to a CLARK shopifyPendingOrder. Returns the order
   index in the array, or -1. Tries multiple strategies in order:
     1. By tracking_number (if user already linked the order)
     2. By business_reference == shopify_order_id
     3. By customer phone match (latest pending order wins)  */
export function matchOrderToBostaDelivery(orders, normalized){
  if(!Array.isArray(orders) || !normalized) return -1;
  const tn = normalized.trackingNumber;
  const ref = normalized.businessReference;
  const phone = normalizePhone(normalized.receiverPhone);

  /* 1) Tracking number match */
  if(tn){
    const i = orders.findIndex(o =>
      o?.bosta?.tracking_number && String(o.bosta.tracking_number).trim() === tn
    );
    if(i >= 0) return i;
  }

  /* 2) Business reference match (= shopify_order_id) */
  if(ref){
    const i = orders.findIndex(o => String(o.shopify_order_id) === ref);
    if(i >= 0) return i;
  }

  /* 3) Phone match — prefer pending_delivery, then most recent */
  if(phone){
    const candidates = orders
      .map((o, idx) => {
        const oPhone = normalizePhone(o?.customer_info?.phone);
        if(!oPhone) return null;
        if(oPhone === phone || oPhone.endsWith(phone) || phone.endsWith(oPhone)){
          return { idx, status: o.status, createdAt: o.shopify_created_at };
        }
        return null;
      })
      .filter(Boolean);
    if(candidates.length > 0){
      /* Prefer pending_delivery */
      const pending = candidates.filter(c => c.status === "pending_delivery");
      const list = pending.length > 0 ? pending : candidates;
      list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      return list[0].idx;
    }
  }

  return -1;
}
