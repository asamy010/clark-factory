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
import { getDb, setCors } from "./_firebase.js";

/* Separate secret for customer portal URLs */
function getPortalSecret() {
  const s = process.env.CUSTOMER_PORTAL_SECRET || process.env.DELIVERY_CONFIRM_SECRET;
  if (!s || s.length < 16) {
    throw new Error("CUSTOMER_PORTAL_SECRET or DELIVERY_CONFIRM_SECRET not set (min 16 chars)");
  }
  return s;
}

export function signCustomerId(custId) {
  return crypto.createHmac("sha256", getPortalSecret()).update("portal:" + custId).digest("hex");
}

function verifyCustomerSig(custId, sig) {
  if (!custId || !sig) return false;
  const expected = signCustomerId(custId);
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (e) {
    return false;
  }
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { c: custId, sig, action } = req.query;

    if (!custId || !sig) {
      return res.status(400).json({ error: "البيانات ناقصة" });
    }

    /* Verify signature */
    if (!verifyCustomerSig(custId, sig)) {
      return res.status(403).json({ error: "رابط غير صالح" });
    }

    const db = getDb();

    /* Get customer from config */
    const configRef = db.collection("factory").doc("config");
    const configSnap = await configRef.get();
    if (!configSnap.exists) {
      return res.status(500).json({ error: "البيانات غير متاحة" });
    }
    const config = configSnap.data();
    /* V16.12: Defensive String() compare — custId from URL is always a string,
       but legacy data may have numeric c.id (or vice-versa). The strict ===
       compare would silently fail to find the customer. */
    const customer = (config.customers || []).find(c => String(c.id) === String(custId));
    if (!customer) {
      return res.status(404).json({ error: "العميل غير موجود" });
    }
    if (customer.archived) {
      return res.status(403).json({ error: "الحساب غير نشط" });
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

    allOrders.forEach(o => {
      const sp = Number(o.sellPrice) || 0;
      const modelName = o.modelNo || "—";
      const modelDesc = o.modelDesc || "";

      (o.customerDeliveries || []).filter(d => d.custId === custId).forEach(d => {
        deliveries.push({
          date: d.date || "",
          modelNo: modelName,
          modelDesc,
          qty: Number(d.qty) || 0,
          sellPrice: sp,
          value: (Number(d.qty) || 0) * sp,
          sessionId: d.sessionId || null,
        });
      });

      (o.customerReturns || []).filter(r => r.custId === custId).forEach(r => {
        returns.push({
          date: r.date || "",
          modelNo: modelName,
          modelDesc,
          qty: Number(r.qty) || 0,
          sellPrice: sp,
          value: (Number(r.qty) || 0) * sp,
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
            delivered: totalDel,
            returned: totalRet,
            net: totalDel - totalRet,
            sellPrice: sp,
            status: o.status || "open",
          });
        }
      }
    });

    /* Customer payments */
    const payments = (config.custPayments || [])
      .filter(p => p.custId === custId)
      .map(p => ({
        date: p.date || "",
        amount: Number(p.amount) || 0,
        method: p.method || "كاش",
        notes: p.notes || "",
      }))
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    /* Calculate balance */
    const discPct = Number(customer.discount) || 0;
    const totalDelValue = deliveries.reduce((s, d) => s + d.value, 0);
    const totalRetValue = returns.reduce((s, r) => s + r.value, 0);
    const netSales = totalDelValue - totalRetValue;
    const discountAmount = Math.round(netSales * discPct / 100);
    const salesAfterDiscount = netSales - discountAmount;
    const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
    const balance = Math.round(salesAfterDiscount - totalPaid);

    /* Factory info (public-safe) */
    const factoryName = config.factoryName || "CLARK Factory";

    /* Sort deliveries and returns descending by date */
    deliveries.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    returns.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    return res.status(200).json({
      factory: { name: factoryName },
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone || "",
        discount: discPct,
      },
      summary: {
        netSales: Math.round(netSales),
        discountAmount,
        salesAfterDiscount: Math.round(salesAfterDiscount),
        returnsValue: Math.round(totalRetValue),
        totalPaid: Math.round(totalPaid),
        balance,
        piecesDelivered: deliveries.reduce((s, d) => s + d.qty, 0),
        piecesReturned: returns.reduce((s, r) => s + r.qty, 0),
        deliveryCount: deliveries.length,
        orderCount: activeModels.size,
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
