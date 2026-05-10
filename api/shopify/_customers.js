/* ═══════════════════════════════════════════════════════════════
   CLARK — Shopify Customers aggregator (V20.2 Phase 11, server-side)
   ───────────────────────────────────────────────────────────────
   Builds a customer-centric view from order-centric data
   (shopifyPendingOrders). Each unique phone-number → one customer.

   Why aggregate from orders rather than pulling Shopify /customers.json?
   • The user only cares about customers who ACTUALLY purchased
     ("اللي اشتروا بالفعل وتم تسليمهم")
   • No extra Shopify API quota usage
   • The data we already have is sufficient
   • Phone-based dedup handles same-customer-multiple-orders

   The aggregator is pure (no Firestore I/O) so we can unit test it.
   The endpoint that calls it persists the result.
   ═══════════════════════════════════════════════════════════════ */

/* Normalize Egyptian phone to canonical form (digits only, with leading 2). */
export function normalizePhoneCanonical(phone){
  if(!phone) return "";
  let s = String(phone).trim().replace(/[^0-9]/g, "");
  if(s.startsWith("00")) s = s.slice(2);
  if(s.startsWith("20")) return s;
  if(s.startsWith("0")) return "20" + s.slice(1);
  if(s.length === 10 || s.length === 11) return "20" + s;
  return s;
}

/* Compute customer tier based on order history.
   - new        : 0-1 delivered, last_delivered < 30 days
   - regular    : 2-4 delivered, last_delivered < 90 days
   - vip        : 5+ delivered OR total_spent ≥ 5000
   - at_risk    : last_delivered > 90 days ago (had orders but went silent)
   - inactive   : no delivered orders ever (only refused/cancelled) */
export function computeTier(stats){
  const now = Date.now();
  const dayMs = 86400000;
  const daysSinceLastDelivered = stats.last_delivered_at
    ? Math.floor((now - new Date(stats.last_delivered_at).getTime()) / dayMs)
    : Infinity;

  if(stats.delivered_count === 0){
    return "inactive";
  }
  if(stats.delivered_count >= 5 || stats.total_revenue >= 5000){
    return "vip";
  }
  if(daysSinceLastDelivered > 90){
    return "at_risk";
  }
  if(stats.delivered_count >= 2){
    return "regular";
  }
  return "new";
}

/* Build a stable customer ID from canonical phone — used as Firestore key.
   If phone is missing, falls back to email or shopify_customer_id. */
export function buildCustomerId(phone, email, shopifyCustId){
  const normalizedPhone = normalizePhoneCanonical(phone);
  if(normalizedPhone) return "scust_p_" + normalizedPhone;
  if(email) return "scust_e_" + String(email).trim().toLowerCase().replace(/[^a-z0-9]/g, "_");
  if(shopifyCustId) return "scust_s_" + String(shopifyCustId);
  return "scust_anon_" + Date.now().toString(36);
}

/* Aggregate orders into a customers list.
   - orders: shopifyPendingOrders array
   - existingCustomers: array of previously-saved customers (preserves
     user-added fields like tags, notes, opt-ins)
   Returns: array of customer objects (newest delivered first). */
export function aggregateCustomersFromOrders(orders, existingCustomers){
  if(!Array.isArray(orders)) return [];
  /* Map from existing customer id → existing object (preserve user fields) */
  const existingMap = new Map();
  (existingCustomers || []).forEach(c => existingMap.set(c.id, c));

  /* Walk orders, group by customer-id (built from normalized phone first) */
  const grouped = new Map();
  for(const o of orders){
    const ci = o?.customer_info || {};
    const id = buildCustomerId(ci.phone, ci.email, ci.shopify_id);
    if(!id) continue;

    if(!grouped.has(id)){
      grouped.set(id, {
        id,
        shopify_customer_id: ci.shopify_id ? String(ci.shopify_id) : "",
        name: ci.name || "",
        phone: normalizePhoneCanonical(ci.phone) || ci.phone || "",
        phone_raw: ci.phone || "",
        email: (ci.email || "").trim().toLowerCase(),
        address: { ...(ci.address || {}) },
        /* Stats - will fill in below */
        orders_count: 0,
        delivered_count: 0,
        refused_count: 0,
        cancelled_count: 0,
        returned_count: 0,
        pending_count: 0,
        total_spent: 0,
        total_revenue: 0,
        first_order_at: null,
        last_order_at: null,
        last_delivered_at: null,
        last_refused_at: null,
        favorite_skus: new Map(), /* sku → qty (will Map → top-3 array later) */
      });
    }

    const c = grouped.get(id);
    /* Update name/email/address with most-recent if missing */
    if(!c.name && ci.name) c.name = ci.name;
    if(!c.email && ci.email) c.email = ci.email.trim().toLowerCase();
    if(!c.phone && ci.phone){ c.phone = normalizePhoneCanonical(ci.phone) || ci.phone; c.phone_raw = ci.phone; }
    if((!c.address || !c.address.line1) && ci.address?.line1){
      c.address = { ...(ci.address || {}) };
    }

    /* Stats */
    c.orders_count++;
    const total = Number(o.total) || 0;
    c.total_spent += total;
    if(o.status === "delivered"){
      c.delivered_count++;
      c.total_revenue += total;
      if(!c.last_delivered_at || (o.delivered_at || "") > c.last_delivered_at){
        c.last_delivered_at = o.delivered_at || o.shopify_updated_at;
      }
    } else if(o.status === "refused"){
      c.refused_count++;
      if(!c.last_refused_at || (o.refused_at || "") > c.last_refused_at){
        c.last_refused_at = o.refused_at;
      }
    } else if(o.status === "cancelled"){
      c.cancelled_count++;
    } else if(o.status === "returned"){
      c.returned_count++;
    } else {
      c.pending_count++;
    }

    /* Date tracking */
    const created = o.shopify_created_at || o.shopify_updated_at;
    if(created){
      if(!c.first_order_at || created < c.first_order_at) c.first_order_at = created;
      if(!c.last_order_at || created > c.last_order_at) c.last_order_at = created;
    }

    /* Favorite SKUs (only count from delivered orders) */
    if(o.status === "delivered" && Array.isArray(o.line_items)){
      for(const li of o.line_items){
        if(!li.sku) continue;
        c.favorite_skus.set(li.sku, (c.favorite_skus.get(li.sku) || 0) + (Number(li.quantity) || 1));
      }
    }
  }

  /* Finalize: compute tier, AOV, top SKUs, merge with existing */
  const result = [];
  for(const [id, c] of grouped.entries()){
    const aov = c.delivered_count > 0 ? Math.round(c.total_revenue / c.delivered_count) : 0;
    /* Top 3 SKUs */
    const topSkus = Array.from(c.favorite_skus.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([sku, qty]) => ({ sku, qty }));

    const stats = {
      delivered_count: c.delivered_count,
      total_revenue: c.total_revenue,
      last_delivered_at: c.last_delivered_at,
    };
    const tier = computeTier(stats);

    /* Preserve user-set fields from existing customer if present */
    const existing = existingMap.get(id) || {};
    const next = {
      id,
      shopify_customer_id: c.shopify_customer_id,
      /* Identity */
      name: c.name || "(غير معروف)",
      phone: c.phone,
      phone_raw: c.phone_raw,
      email: c.email,
      address: c.address,
      /* Stats */
      orders_count: c.orders_count,
      delivered_count: c.delivered_count,
      refused_count: c.refused_count,
      cancelled_count: c.cancelled_count,
      returned_count: c.returned_count,
      pending_count: c.pending_count,
      total_spent: Math.round(c.total_spent),
      total_revenue: Math.round(c.total_revenue),
      avg_order_value: aov,
      first_order_at: c.first_order_at,
      last_order_at: c.last_order_at,
      last_delivered_at: c.last_delivered_at,
      last_refused_at: c.last_refused_at,
      favorite_skus: topSkus,
      /* Tier (computed) */
      tier,
      /* Engagement defaults — preserved from existing if set */
      accepts_marketing: existing.accepts_marketing !== false,
      tags: Array.isArray(existing.tags) ? existing.tags : [],
      notes: typeof existing.notes === "string" ? existing.notes : "",
      do_not_contact: existing.do_not_contact === true,
      last_contacted_at: existing.last_contacted_at || null,
      contact_count: Number(existing.contact_count) || 0,
      /* Source */
      source: "shopify",
      created_at: existing.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    result.push(next);
  }

  /* Sort: most-recent delivery first, then most-recent order */
  result.sort((a, b) => {
    const ta = new Date(a.last_delivered_at || a.last_order_at || 0).getTime();
    const tb = new Date(b.last_delivered_at || b.last_order_at || 0).getTime();
    return tb - ta;
  });

  return result;
}

/* Tier metadata for the UI (label + color + emoji + condition desc). */
export const TIER_META = {
  vip:      { label: "VIP",         color: "#8B5CF6", emoji: "👑", desc: "5+ تسليم أو إنفاق ≥ 5000ج" },
  regular:  { label: "Regular",     color: "#10B981", emoji: "🌟", desc: "2-4 تسليم خلال 90 يوم" },
  new:      { label: "New",         color: "#0EA5E9", emoji: "🆕", desc: "1 تسليم حديث" },
  at_risk:  { label: "At-risk",     color: "#F59E0B", emoji: "⚠️", desc: "آخر تسليم > 90 يوم" },
  inactive: { label: "Inactive",    color: "#94A3B8", emoji: "😴", desc: "مفيش تسليم ناجح" },
};
