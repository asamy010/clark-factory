/* ═══════════════════════════════════════════════════════════════
   CLARK — Workshop Portal API (V17.9)
   
   GET /api/workshop-portal?w=<wsId>&sig=<hmac>
   
   Returns read-only data for a workshop:
   - Basic info (name, owner, phone, payPercent)
   - Summary (due, paid, purchase, balance, weekly limit/available)
   - Deliveries from factory to workshop (per order/session)
   - Receives back from workshop (with prices/value)
   - Payment history
   
   Security: HMAC signature prevents enumeration. Workshop gets a
   unique URL they can save. If workshop ID changes, URL invalidated.
   
   No auth required — owner shares link via WhatsApp.
   ═══════════════════════════════════════════════════════════════ */

import crypto from "crypto";
import { getDb, setCors, readSplitCollection, readPartitionedCollection } from "./_firebase.js";

/* Separate secret for workshop portal URLs */
function getPortalSecret() {
  const s = process.env.WORKSHOP_PORTAL_SECRET || process.env.CUSTOMER_PORTAL_SECRET || process.env.DELIVERY_CONFIRM_SECRET;
  if (!s || s.length < 16) {
    throw new Error("WORKSHOP_PORTAL_SECRET / CUSTOMER_PORTAL_SECRET / DELIVERY_CONFIRM_SECRET not set (min 16 chars)");
  }
  return s;
}

/* V18.12 + V19.64: signatures (legacy unbounded + timestamped expiring variants). */
export function signWorkshopId(wsId) {
  return crypto.createHmac("sha256", getPortalSecret()).update("wsportal:" + wsId).digest()
    .slice(0, 12)
    .toString("base64url");
}

export function signWorkshopIdWithTs(wsId, ts) {
  return crypto.createHmac("sha256", getPortalSecret()).update("wsportal:v2:" + wsId + ":" + ts).digest()
    .slice(0, 12)
    .toString("base64url");
}

const WORKSHOP_LINK_TTL_SECONDS = 90 * 24 * 3600;/* 90 days */

function signWorkshopIdHex(wsId) {
  return crypto.createHmac("sha256", getPortalSecret()).update("wsportal:" + wsId).digest("hex");
}

function verifyWorkshopSig(wsId, sig, ts) {
  if (!wsId || !sig) return false;
  /* V19.64: timestamped — verify expiry then HMAC */
  if (ts) {
    const tsNum = parseInt(ts, 10);
    if (!Number.isFinite(tsNum)) return false;
    const now = Math.floor(Date.now() / 1000);
    const age = now - tsNum;
    if (age < -300 || age > WORKSHOP_LINK_TTL_SECONDS) return false;
    if (sig.length !== 16) return false;
    const expected = signWorkshopIdWithTs(wsId, String(tsNum));
    try {
      const a = Buffer.from(sig, "base64url");
      const b = Buffer.from(expected, "base64url");
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch (e) { return false; }
  }
  /* Legacy formats */
  if (sig.length === 16) {
    const expected = signWorkshopId(wsId);
    try {
      const a = Buffer.from(sig, "base64url");
      const b = Buffer.from(expected, "base64url");
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch (e) { return false; }
  }
  if (sig.length === 64) {
    const expected = signWorkshopIdHex(wsId);
    try {
      const a = Buffer.from(sig, "hex");
      const b = Buffer.from(expected, "hex");
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch (e) { return false; }
  }
  return false;
}

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { w: wsId, sig, t: ts } = req.query;

    if (!wsId || !sig) {
      return res.status(400).json({ error: "البيانات ناقصة" });
    }

    /* V19.64: pass `t` (timestamp) when present */
    if (!verifyWorkshopSig(wsId, sig, ts)) {
      return res.status(403).json({ error: "رابط غير صالح أو منتهي الصلاحية" });
    }

    const db = getDb();

    /* Get workshop from config */
    const configRef = db.collection("factory").doc("config");
    const configSnap = await configRef.get();
    if (!configSnap.exists) {
      return res.status(500).json({ error: "البيانات غير متاحة" });
    }
    const config = configSnap.data();
    /* V19.57 HOTFIX: workshops moved out of factory/config to workshopsDocs/*. */
    const workshops = config._partitionedV1957Done
      ? await readPartitionedCollection("workshopsDocs")
      : (config.workshops || []);
    const workshop = workshops.find(w => String(w.id) === String(wsId));
    if (!workshop) {
      return res.status(404).json({ error: "الورشة غير موجودة" });
    }
    /* V18.16: Block archived workshops with a clear message */
    if (workshop.archived) {
      return res.status(403).json({ error: "🔒 تم إيقاف التعامل مع " + (workshop.name || "هذه الورشة") + "، يُرجى التواصل مع المصنع", archived: true, name: workshop.name || "" });
    }
    const wsName = workshop.name;

    /* Iterate orders in all seasons */
    const seasons = config.seasons || [];
    const allOrders = [];
    for (const season of seasons) {
      try {
        const snaps = await db.collection("seasons").doc(season).collection("orders").get();
        snaps.forEach(doc => {
          const o = doc.data();
          /* Only include orders that have activity with this workshop */
          const hasWs = (o.workshopDeliveries || []).some(wd => wd.wsName === wsName);
          if (hasWs) {
            allOrders.push({ ...o, id: doc.id, season });
          }
        });
      } catch (e) {
        /* Season without orders — skip */
      }
    }

    /* Build deliveries (factory → workshop) and receives (workshop → factory) */
    const deliveries = [];
    const receives = [];
    let totalDeliveredQty = 0;
    let totalReceivedQty = 0;
    let due = 0;

    allOrders.forEach(o => {
      const modelNo = o.modelNo || "—";
      const modelDesc = o.modelDesc || "";
      const modelImage = o.image || null;

      (o.workshopDeliveries || []).filter(wd => wd.wsName === wsName).forEach(wd => {
        const delQty = Number(wd.qty) || 0;
        totalDeliveredQty += delQty;
        /* V21.9.165 ROOT-CAUSE FIX: the actual garment type field on a
           workshopDelivery is `garmentType` (set in ExtProdPg.jsx:225 and the
           batch path at :968), NOT `piece`. Pre-V21.9.165 this endpoint read
           `wd.piece` which is undefined everywhere → the public portal
           statement displayed "—" in the "نوع القطعة" column for every row.
           The receive rows ALSO source garment type from the parent wd
           (receives are nested in wd, no separate type field). Kept the
           `piece` JSON key on the response for backwards-compat with the
           existing client (WorkshopPortalPage). */
        const garment = wd.garmentType || wd.piece || "";
        deliveries.push({
          date: wd.date || "",
          modelNo,
          modelDesc,
          image: modelImage,
          qty: delQty,
          piece: garment,
        });

        /* receives nested inside wd */
        (wd.receives || []).forEach(r => {
          const rQty = Number(r.qty) || 0;
          const rPrice = Number(r.price) || 0;
          const rValue = r2(rQty * rPrice);
          totalReceivedQty += rQty;
          due += rValue;
          receives.push({
            date: r.date || "",
            modelNo,
            modelDesc,
            image: modelImage,
            piece: garment,
            qty: rQty,
            price: rPrice,
            value: rValue,
          });
        });
      });
    });

    /* V19.51 HOTFIX: wsPayments moved out of factory/config in V19.49.
       Read from wsPaymentsDays/* (day-split collection) instead.
       Falls back to config.wsPayments for pre-V19.49 deployments. */
    const allWsPayments = (config._splitDaysV1949Done
      ? await readSplitCollection("wsPaymentsDays")
      : (config.wsPayments || []));
    /* Workshop payments */
    const allPayments = allWsPayments.filter(p => p.wsName === wsName);
    const payments = allPayments.map(p => ({
      date: p.date || "",
      type: p.type || "payment",
      amount: Number(p.amount) || 0,
      notes: p.notes || p.note || "",
    })).sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    const paid = allPayments.filter(p => p.type === "payment").reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const purchase = allPayments.filter(p => p.type === "purchase").reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const balance = r2(due + purchase - paid);

    /* Weekly limit based on payPercent (default 60) */
    const payPercent = Number(workshop.payPercent) || 60;
    const limit = r2((due + purchase) * payPercent / 100);
    const available = r2(Math.max(0, limit - paid));

    /* Pending pieces (delivered but not yet received back) */
    const pendingPieces = totalDeliveredQty - totalReceivedQty;

    /* Sort lists desc by date */
    deliveries.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    receives.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    /* Factory info (public-safe) */
    const factoryName = config.factoryName || "CLARK Factory";

    return res.status(200).json({
      factory: { name: factoryName },
      activeSeason: config.activeSeason || "",
      workshop: {
        id: workshop.id,
        name: workshop.name,
        owner: workshop.owner || "",
        phone: workshop.phone || "",
        type: workshop.type || "",
        payPercent,
      },
      summary: {
        due: r2(due),
        paid: r2(paid),
        purchase: r2(purchase),
        balance,
        limit,
        available,
        deliveredQty: totalDeliveredQty,
        receivedQty: totalReceivedQty,
        pendingPieces: Math.max(0, pendingPieces),
        deliveryCount: deliveries.length,
        receiveCount: receives.length,
      },
      deliveries: deliveries.slice(0, 200),
      receives: receives.slice(0, 200),
      payments: payments.slice(0, 100),
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("workshop-portal error:", err);
    return res.status(500).json({ error: "خطأ في الخادم: " + (err.message || "unknown") });
  }
}
