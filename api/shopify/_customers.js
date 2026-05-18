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

/* Normalize Egyptian phone to canonical form (digits only, with leading 2).
   V21.9.86 (Shopify audit Bug #7): tighter normalization to reduce dedup
   failures across phone formats. Pre-V21.9.86 the function had two issues:
   (1) `00201001234567` (E.164 with "00" prefix) was handled but `+201...`
       was rejected because the `+` was stripped early and the leading "2"
       made it look like a local string.
   (2) `1001234567` (10 digits, no leading 0) returned `+21001234567` —
       a Moroccan-prefix-looking string, breaking customer dedup.
   Now: handle +20 explicitly, validate Egyptian mobile prefix (01[0-5]),
   and prefer "" for ambiguous formats over a guess. */
export function normalizePhoneCanonical(phone){
  if(!phone) return "";
  let s = String(phone).trim();
  if(s.startsWith("+")) s = s.slice(1);
  s = s.replace(/[^0-9]/g, "");
  if(s.startsWith("00")) s = s.slice(2);
  if(!s) return "";
  /* Already in canonical form: 20 + 10-digit mobile = 12 digits total */
  if(s.startsWith("20") && s.length === 12) return s;
  /* Local Egyptian mobile: 01[0-5]XXXXXXXX (11 digits, starts with 0) */
  if(/^0[1][0-5]\d{8}$/.test(s)) return "20" + s.slice(1);
  /* 10-digit form WITHOUT leading 0 (e.g. "1001234567") — assume Egyptian */
  if(/^[1][0-5]\d{8}$/.test(s)) return "20" + s;
  /* Length 10 or 11 ambiguous fallback (legacy behavior) but only when
     the leading digits look Egyptian-mobile-ish. Otherwise return the
     raw string so dedup keeps it distinct rather than falsely merging
     with an EG customer. */
  if(s.length === 11 && s.startsWith("0")) return "20" + s.slice(1);
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

/* V20.3 Phase 11+: Merge Shopify-direct customers with order-aggregated customers.
   The strategy:
   - Order-aggregated customers have rich CLARK-side data (delivered_count,
     last_delivered_at, refused, tier, etc.)
   - Shopify-direct customers have richer engagement data (accepts_marketing,
     tags from Shopify, total_spent across ALL orders, shopify_id)
   - When same person exists in both → merge, with order data taking precedence
     for stats and Shopify data filling in gaps.
   - When only in Shopify (never bought via CLARK) → still include them with
     "shopify_only" source flag so the user can target them in campaigns.

   Returns the merged array. */
export function mergeShopifyCustomers(orderAggregated, shopifyDirect, existing){
  /* Index order-aggregated by id (= scust_p_<phone>) */
  const byId = new Map();
  (orderAggregated || []).forEach(c => byId.set(c.id, { ...c, source: "orders" }));

  /* For each Shopify direct customer, build the same id and merge */
  for(const sc of (shopifyDirect || [])){
    const id = buildCustomerId(sc.phone, sc.email, sc.shopify_customer_id);
    const existingEntry = byId.get(id);
    if(existingEntry){
      /* Merge: orders data wins for stats, Shopify fills gaps */
      byId.set(id, {
        ...existingEntry,
        shopify_customer_id: sc.shopify_customer_id || existingEntry.shopify_customer_id,
        /* Shopify-side stats — different from CLARK stats! */
        shopify_orders_count: sc.shopify_orders_count,
        shopify_total_spent: sc.shopify_total_spent,
        /* Engagement from Shopify (only if not user-overridden) */
        accepts_marketing: existingEntry.accepts_marketing !== false ? sc.accepts_marketing : existingEntry.accepts_marketing,
        accepts_marketing_updated_at: sc.accepts_marketing_updated_at,
        shopify_tags: sc.shopify_tags || [],
        shopify_note: sc.shopify_note || "",
        shopify_state: sc.shopify_state || "",
        shopify_verified_email: sc.shopify_verified_email,
        shopify_created_at: sc.shopify_created_at,
        shopify_updated_at: sc.shopify_updated_at,
        /* Fill in name/email/address gaps */
        name: existingEntry.name || sc.name,
        email: existingEntry.email || sc.email,
        address: (existingEntry.address && existingEntry.address.line1)
          ? existingEntry.address
          : (sc.default_address || existingEntry.address),
        source: "merged", /* both sources */
      });
    } else {
      /* Shopify-only customer (no orders in CLARK yet) */
      const existingShopifyOnly = (existing || []).find(c => c.id === id);
      const userTags = Array.isArray(existingShopifyOnly?.tags) ? existingShopifyOnly.tags : [];
      const userNotes = typeof existingShopifyOnly?.notes === "string" ? existingShopifyOnly.notes : "";

      /* Compute "synthetic tier" from Shopify data only, since we have no
         CLARK orders for this customer. */
      let syntheticTier = "shopify_only";
      if(sc.shopify_orders_count >= 5 || sc.shopify_total_spent >= 5000){
        syntheticTier = "vip";
      } else if(sc.shopify_orders_count >= 2){
        syntheticTier = "regular";
      } else if(sc.shopify_orders_count === 1){
        syntheticTier = "new";
      }

      byId.set(id, {
        id,
        shopify_customer_id: sc.shopify_customer_id,
        /* Identity */
        name: sc.name || "(غير معروف)",
        phone: normalizePhoneCanonical(sc.phone) || sc.phone || "",
        phone_raw: sc.phone || "",
        email: sc.email || "",
        address: sc.default_address || {},
        /* Stats — zero from CLARK side, Shopify side from API */
        orders_count: 0,
        delivered_count: 0,
        refused_count: 0,
        cancelled_count: 0,
        returned_count: 0,
        pending_count: 0,
        total_spent: 0,
        total_revenue: 0,
        avg_order_value: 0,
        first_order_at: null,
        last_order_at: null,
        last_delivered_at: null,
        last_refused_at: null,
        favorite_skus: [],
        /* Shopify-side stats */
        shopify_orders_count: sc.shopify_orders_count,
        shopify_total_spent: sc.shopify_total_spent,
        shopify_tags: sc.shopify_tags || [],
        shopify_note: sc.shopify_note || "",
        shopify_state: sc.shopify_state || "",
        shopify_verified_email: sc.shopify_verified_email,
        shopify_created_at: sc.shopify_created_at,
        shopify_updated_at: sc.shopify_updated_at,
        accepts_marketing_updated_at: sc.accepts_marketing_updated_at,
        /* Tier */
        tier: syntheticTier,
        /* Engagement */
        accepts_marketing: existingShopifyOnly?.accepts_marketing !== false
          ? sc.accepts_marketing
          : existingShopifyOnly.accepts_marketing,
        tags: userTags,
        notes: userNotes,
        do_not_contact: existingShopifyOnly?.do_not_contact === true,
        last_contacted_at: existingShopifyOnly?.last_contacted_at || null,
        contact_count: Number(existingShopifyOnly?.contact_count) || 0,
        /* Source */
        source: "shopify_only",
        created_at: existingShopifyOnly?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  }

  /* Sort: most-recent delivery first, fall back to last order, fall back to Shopify created_at */
  const result = Array.from(byId.values());
  result.sort((a, b) => {
    const ta = new Date(a.last_delivered_at || a.last_order_at || a.shopify_created_at || 0).getTime();
    const tb = new Date(b.last_delivered_at || b.last_order_at || b.shopify_created_at || 0).getTime();
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
