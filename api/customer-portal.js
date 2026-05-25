/* ═══════════════════════════════════════════════════════════════
   CLARK — Customer Portal API (V16.3)
   
   GET /api/customer-portal?c=<custId>&sig=<hmac>
   
   Returns read-only data for a customer:
   - Basic info (name, phone — NO internal notes)
   - Order list (status, model, qty, dates)
   - Delivery history (sessions with pieces + dates)
   - Returns
   - Payment history
   - Current balance
   
   Security: HMAC signature prevents enumeration. Customer gets a
   unique URL they can save. If customer ID changes, URL invalidated.
   
   No auth required — owner shares link via WhatsApp.
   ═══════════════════════════════════════════════════════════════ */

import crypto from "crypto";
import { getDb, setCors, readSplitCollection, readPartitionedCollection } from "./_firebase.js";

/* Separate secret for customer portal URLs */
function getPortalSecret() {
  const s = process.env.CUSTOMER_PORTAL_SECRET || process.env.DELIVERY_CONFIRM_SECRET;
  if (!s || s.length < 16) {
    throw new Error("CUSTOMER_PORTAL_SECRET or DELIVERY_CONFIRM_SECRET not set (min 16 chars)");
  }
  return s;
}

/* V18.12: Short signature — 96 bits as base64url (16 chars) instead of 256-bit hex (64 chars).
   V19.64: Added timestamped variant. Old `signCustomerId(custId)` kept for legacy URL
   verification only — new sign endpoint uses `signCustomerIdWithTs(custId, ts)`. */
export function signCustomerId(custId) {
  return crypto.createHmac("sha256", getPortalSecret()).update("portal:" + custId).digest()
    .slice(0, 12)
    .toString("base64url");
}

/* V19.64: Timestamped signature. The unix-seconds timestamp is part of the HMAC payload
   AND verified to be within 90 days at read time. This bounds link lifetime even if
   the URL leaks (WhatsApp screenshot, indexed by search engine, etc.). */
export function signCustomerIdWithTs(custId, ts) {
  return crypto.createHmac("sha256", getPortalSecret()).update("portal:v2:" + custId + ":" + ts).digest()
    .slice(0, 12)
    .toString("base64url");
}

const PORTAL_LINK_TTL_SECONDS = 90 * 24 * 3600;/* 90 days */

/* Legacy full-hex signature — kept for backward compat verification only. */
function signCustomerIdHex(custId) {
  return crypto.createHmac("sha256", getPortalSecret()).update("portal:" + custId).digest("hex");
}

function verifyCustomerSig(custId, sig, ts) {
  if (!custId || !sig) return false;
  /* V19.64: Timestamped link — verify expiry then HMAC. Preferred format for new links. */
  if (ts) {
    const tsNum = parseInt(ts, 10);
    if (!Number.isFinite(tsNum)) return false;
    const now = Math.floor(Date.now() / 1000);
    const age = now - tsNum;
    if (age < -300 || age > PORTAL_LINK_TTL_SECONDS) return false;/* allow 5min clock skew */
    if (sig.length !== 16) return false;
    const expected = signCustomerIdWithTs(custId, String(tsNum));
    try {
      const a = Buffer.from(sig, "base64url");
      const b = Buffer.from(expected, "base64url");
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch (e) { return false; }
  }
  /* Legacy unbounded signatures — kept working so existing customer URLs don't break. */
  if (sig.length === 16) {
    const expected = signCustomerId(custId);
    try {
      const a = Buffer.from(sig, "base64url");
      const b = Buffer.from(expected, "base64url");
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch (e) { return false; }
  }
  if (sig.length === 64) {
    const expected = signCustomerIdHex(custId);
    try {
      const a = Buffer.from(sig, "hex");
      const b = Buffer.from(expected, "hex");
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch (e) { return false; }
  }
  return false;
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { c: custId, sig, t: ts, action } = req.query;

    if (!custId || !sig) {
      return res.status(400).json({ error: "البيانات ناقصة" });
    }

    /* V19.64: pass `t` (timestamp) when present — verifier rejects expired links */
    if (!verifyCustomerSig(custId, sig, ts)) {
      return res.status(403).json({ error: "رابط غير صالح أو منتهي الصلاحية" });
    }

    const db = getDb();

    /* Get customer from config */
    const configRef = db.collection("factory").doc("config");
    const configSnap = await configRef.get();
    if (!configSnap.exists) {
      return res.status(500).json({ error: "البيانات غير متاحة" });
    }
    const config = configSnap.data();
    /* V19.57 HOTFIX: customers moved out of factory/config to customersDocs/* via byId
       partitioning. Read from there if migration done; fallback to config for pre-V19.57. */
    const customers = config._partitionedV1957Done
      ? await readPartitionedCollection("customersDocs")
      : (config.customers || []);
    /* V16.12: Defensive String() compare — custId from URL is always a string,
       but legacy data may have numeric c.id (or vice-versa). The strict ===
       compare would silently fail to find the customer. */
    const customer = customers.find(c => String(c.id) === String(custId));
    if (!customer) {
      return res.status(404).json({ error: "العميل غير موجود" });
    }
    if (customer.archived) {
      return res.status(403).json({ error: "🔒 تم إيقاف التعامل مع " + (customer.name || "هذا العميل") + "، يُرجى التواصل مع المصنع", archived: true, name: customer.name || "" });
    }

    /* If action=sign — just return the URL (admin only, requires separate auth)
       For now we skip this and generate signatures only via direct call from admin UI */

    /* Get customer's orders and transactions */
    /* We iterate orders in /seasons/{season}/orders collection */
    const activeSeason = config.activeSeason;
    const allOrders = [];

    /* Try orders in all seasons */
    const seasons = config.seasons || [];
    for (const season of seasons) {
      try {
        const snaps = await db.collection("seasons").doc(season).collection("orders").get();
        snaps.forEach(doc => {
          const o = doc.data();
          /* Only include orders that have activity with this customer */
          const hasDel = (o.customerDeliveries || []).some(d => d.custId === custId);
          const hasRet = (o.customerReturns || []).some(r => r.custId === custId);
          if (hasDel || hasRet) {
            allOrders.push({ ...o, id: doc.id, season });
          }
        });
      } catch (e) {
        /* Season without orders collection — skip silently */
      }
    }

    /* Build response — ONLY data the customer should see */
    const deliveries = [];
    const returns = [];
    const activeModels = new Map();

    /* V21.9.193 — precedence chain for per-delivery discount (mirrors
       src/utils/invoices.js resolveDiscountPct + src/pages/CustDeliverPg.jsx
       pickDiscPct in the customer statement). entry.discPct → customer.discount
       → 10. Legacy entries without discPct fall through to customer.discount
       (back-compat unchanged). */
    const pickDiscPct = (entry) => {
      if (entry && entry.discPct !== undefined && entry.discPct !== null) {
        const n = Number(entry.discPct);
        if (!isNaN(n)) return n;
      }
      if (customer && customer.discount !== undefined && customer.discount !== null) {
        const n = Number(customer.discount);
        if (!isNaN(n)) return n;
      }
      return 10;
    };

    allOrders.forEach(o => {
      const sp = Number(o.sellPrice) || 0;
      const modelName = o.modelNo || "—";
      const modelDesc = o.modelDesc || "";
      const modelImage = o.image || null;

      (o.customerDeliveries || []).filter(d => d.custId === custId).forEach(d => {
        const gross = (Number(d.qty) || 0) * sp;
        const dPct = pickDiscPct(d);
        /* V21.9.193: also expose the per-delivery effective discount + net
           value so the client UI can render accurate per-row math.
           Legacy `value` (gross) kept for back-compat with existing UI. */
        deliveries.push({
          date: d.date || "",
          modelNo: modelName,
          modelDesc,
          image: modelImage,
          qty: Number(d.qty) || 0,
          sellPrice: sp,
          value: gross,
          discPct: dPct,
          valueAfterDisc: Math.round(gross * (1 - dPct/100)),
          sessionId: d.sessionId || null,
        });
      });

      (o.customerReturns || []).filter(r => r.custId === custId).forEach(r => {
        const gross = (Number(r.qty) || 0) * sp;
        const dPct = pickDiscPct(r);
        returns.push({
          date: r.date || "",
          modelNo: modelName,
          modelDesc,
          image: modelImage,
          qty: Number(r.qty) || 0,
          sellPrice: sp,
          value: gross,
          discPct: dPct,
          valueAfterDisc: Math.round(gross * (1 - dPct/100)),
          /* V18.26: include sessionId for invoice grouping (note: returns store as sessId, not sessionId) */
          sessionId: r.sessId || r.sessionId || null,
          note: r.note || "",
        });
      });

      /* Active models summary */
      if (!activeModels.has(o.id)) {
        const totalDel = (o.customerDeliveries || []).filter(d => d.custId === custId).reduce((s, d) => s + (Number(d.qty) || 0), 0);
        const totalRet = (o.customerReturns || []).filter(r => r.custId === custId).reduce((s, r) => s + (Number(r.qty) || 0), 0);
        if (totalDel > 0 || totalRet > 0) {
          activeModels.set(o.id, {
            modelNo: modelName,
            modelDesc,
            image: modelImage,
            delivered: totalDel,
            returned: totalRet,
            net: totalDel - totalRet,
            sellPrice: sp,
            status: o.status || "open",
          });
        }
      }
    });

    /* V19.51 HOTFIX: custPayments + checks moved out of factory/config in V19.49.
       Read from custPaymentsDays/* and checksDays/* (day-split collections) instead.
       Falls back to config arrays for backward compat (pre-V19.49 deployments). */
    const allCustPayments = (config._splitDaysV1949Done
      ? await readSplitCollection("custPaymentsDays")
      : (config.custPayments || []));
    const allChecks = (config._splitDaysV1949Done
      ? await readSplitCollection("checksDays")
      : (config.checks || []));

    /* Customer payments — V18.3: keep method for cash/checks split */
    const payments = allCustPayments
      .filter(p => p.custId === custId)
      .map(p => ({
        date: p.date || "",
        amount: Number(p.amount) || 0,
        method: p.method || "كاش",
        notes: p.notes || p.note || "",
      }))
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    /* V18.23+V18.24: Receivable checks — count only when category = 'دفعة عميل' (real customer payment).
       Excludes opening balances, settlements, transfers, other types — those aren't sales-related. */
    const receivableChecks = allChecks
      .filter(c => c.type === "receivable" && String(c.partyId) === String(custId) && c.status !== "مرتد" && c.status !== "ملغي" && ((c.category || "دفعة عميل") === "دفعة عميل"))
      .map(c => ({
        date: c.date || c.dueDate || "",
        amount: Number(c.amount) || 0,
        method: "شيك",
        notes: ("شيك" + (c.checkNo ? " #" + c.checkNo : "") + (c.bank ? " — " + c.bank : "") + (c.status && c.status !== "محصل" ? " (" + c.status + ")" : "")),
      }));
    /* Merge into payments list so the sorted log shows them too */
    receivableChecks.forEach(rc => payments.push(rc));
    payments.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    /* V21.9.193 — Per-delivery discount aggregation.
       Pre-V21.9.193 the portal applied a single customer.discount to the
       aggregated net sales — incorrect after V21.9.190 when per-session
       overrides made each invoice's discount potentially different.

       New formula:
         totalDelValue       = sum gross deliveries
         totalDelValueNet    = sum (gross × (1 − per-delivery discPct))
         totalRetValue       = sum gross returns
         returnsAfterDiscount= sum (gross × (1 − per-return discPct))
         discountAmount      = totalDelValue − totalDelValueNet  (derived)
         salesAfterDiscount  = totalDelValueNet − returnsAfterDiscount
         avgDiscountPct      = display-only weighted-avg (1 − net/gross)

       V21.9.56 clamp preserved: bad data entry (e.g., 150%) caught at the
       entry source (CustDeliverPg input has min=0,max=100 + the pickDiscPct
       function above accepts the stamped value as-is). The aggregation is
       robust to outliers because it sums per-entry products. */
    const totalDelValue = deliveries.reduce((s, d) => s + d.value, 0);
    const totalDelValueNet = deliveries.reduce((s, d) => s + (d.valueAfterDisc || 0), 0);
    const totalRetValue = returns.reduce((s, r) => s + r.value, 0);
    const returnsAfterDiscount = returns.reduce((s, r) => s + (r.valueAfterDisc || 0), 0);
    const discountAmount = totalDelValue - totalDelValueNet;
    const salesAfterDiscount = totalDelValueNet - returnsAfterDiscount;
    const netSales = totalDelValue - totalRetValue; /* legacy gross-net (no discount) — kept for back-compat */
    /* Weighted-average effective discount % — display only, NOT used as a
       multiplier on anything. Falls back to customer.discount when there
       are no sales (avoid div-by-zero). */
    const discPct = totalDelValue > 0
      ? Math.round((1 - (totalDelValueNet / totalDelValue)) * 100)
      : Math.max(0, Math.min(100, Number(customer.discount) || 0));
    /* Flag whether any delivery has a per-session override different from
       customer.discount — the client renders a "متوسط" hint instead of
       a single % when this is true. */
    const baselineDisc = Number(customer.discount) || 0;
    const hasMixedDiscounts = deliveries.some(d => d.discPct !== undefined && d.discPct !== null && Number(d.discPct) !== baselineDisc);
    const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
    /* V18.3+V18.23: Split paid into cash (everything except شيك) and checks (incl. pending receivable checks) */
    const checksPaid = payments.filter(p => p.method === "شيك").reduce((s, p) => s + p.amount, 0);
    const cashPaid = totalPaid - checksPaid;
    const balance = Math.round(salesAfterDiscount - totalPaid);

    /* Factory info (public-safe) */
    const factoryName = config.factoryName || "CLARK Factory";

    /* Sort deliveries and returns descending by date */
    deliveries.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    returns.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    /* V18.7: Customer rating based on retention rate */
    const piecesDeliveredTotal = deliveries.reduce((s, d) => s + d.qty, 0);
    const piecesReturnedTotal = returns.reduce((s, r) => s + r.qty, 0);
    let rating;
    if (piecesDeliveredTotal <= 0) {
      rating = { rated: false, stars: 0, label: "لم يتم التقييم بعد", color: "#94A3B8", pct: 0 };
    } else {
      const sold = Math.max(0, piecesDeliveredTotal - piecesReturnedTotal);
      const pct = (sold / piecesDeliveredTotal) * 100;
      const stars = Math.max(0, Math.min(5, Math.round((pct / 100) * 10) / 2));
      let label, color;
      if (pct >= 95) { label = "ممتاز"; color = "#059669"; }
      else if (pct >= 85) { label = "جيد جداً"; color = "#0D9488"; }
      else if (pct >= 70) { label = "متوسط"; color = "#0EA5E9"; }
      else if (pct >= 50) { label = "ضعيف"; color = "#F59E0B"; }
      else { label = "سيء"; color = "#DC2626"; }
      rating = { rated: true, stars, label, color, pct: Math.round(pct * 10) / 10 };
    }

    return res.status(200).json({
      factory: { name: factoryName },
      activeSeason: config.activeSeason || "",
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone || "",
        discount: discPct,
      },
      summary: {
        netSales: Math.round(netSales),
        totalDelValue: Math.round(totalDelValue),
        /* V21.9.193: totalDelValueAfterDisc = sum of per-delivery net values
           (gross × (1 − discPct/100)). Replaces the old single-discount
           computation. Display: '<gross> قبل الخصم → <net> بعد الخصم'. */
        totalDelValueAfterDisc: Math.round(totalDelValueNet),
        discountAmount: Math.round(discountAmount),
        /* V21.9.193: hasMixedDiscounts tells the client to render the
           "متوسط X%" hint instead of treating the % as a single multiplier. */
        hasMixedDiscounts,
        salesAfterDiscount: Math.round(salesAfterDiscount),
        returnsValue: Math.round(totalRetValue),
        returnsAfterDiscount: Math.round(returnsAfterDiscount),
        totalPaid: Math.round(totalPaid),
        cashPaid: Math.round(cashPaid),
        checksPaid: Math.round(checksPaid),
        balance,
        piecesDelivered: piecesDeliveredTotal,
        piecesReturned: piecesReturnedTotal,
        actualSold: piecesDeliveredTotal - piecesReturnedTotal,
        deliveryCount: deliveries.length,
        orderCount: activeModels.size,
        rating,
      },
      activeModels: Array.from(activeModels.values()),
      deliveries: deliveries.slice(0, 100), /* limit to last 100 */
      returns: returns.slice(0, 50),
      payments: payments.slice(0, 50),
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("customer-portal error:", err);
    return res.status(500).json({ error: "خطأ في الخادم: " + (err.message || "unknown") });
  }
}
