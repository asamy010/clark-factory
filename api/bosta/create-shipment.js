/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/bosta/create-shipment (V21.3 Phase 10d)
   ───────────────────────────────────────────────────────────────
   Auto-create a Bosta shipment from a Shopify pending order.
   Creates a delivery in Bosta and writes the tracking number back
   to the order so the existing webhook flow takes over.

   Body: {
     orderId: string,        // shopify_order_id
     packageType?: string,   // "Parcel" (default) | "Document" | "Bulky"
     size?: string,          // "Small" (default) | "Medium" | "Large"
     notes?: string          // override
   }

   Auth: admin
   Returns: { ok, tracking_number, delivery_id, bosta_response }

   Bosta API: POST /api/v0/deliveries
   - Maps Shopify order → Bosta delivery payload
   - Sets businessReference = shopify_order_id (for matching)
   - Uses customer info from order
   - COD amount = order.total

   ═══════════════════════════════════════════════════════════════
   V21.9.20 ROOT-CAUSE FIX: route order reads/writes through
   _pendingOrders.js helper for split-aware storage.
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";
import { findPendingOrder, upsertPendingOrder } from "../shopify/_pendingOrders.js";

/* Build the Bosta delivery payload from a Shopify order. */
function buildPayload(order, opts = {}){
  const customer = order.customer_info || {};
  const addr = customer.address || {};
  const phone = String(customer.phone || "").replace(/\D/g, "");
  /* Build a single-line address from whatever we have */
  const firstLine = [addr.line1, addr.line2].filter(Boolean).join(" - ")
    || addr.line1 || "";
  /* Try to parse city/governorate */
  const city = addr.city || addr.governorate || "";

  return {
    /* Type 10 = "SEND" (regular delivery) */
    type: 10,
    specs: {
      size: opts.size || "Small",
      packageType: opts.packageType || "Parcel",
    },
    cod: order.payment_method === "cod" ? Number(order.total) || 0 : 0,
    notes: opts.notes || ("Shopify Order #" + (order.shopify_order_number || order.shopify_order_id)),
    businessReference: String(order.shopify_order_id),
    dropOffAddress: {
      city,
      zone: addr.governorate || "",
      district: addr.line1 || "",
      firstLine: firstLine || addr.line1 || "(لا يوجد عنوان)",
    },
    receiver: {
      firstName: (customer.name || "").split(" ")[0] || customer.name || "—",
      lastName: (customer.name || "").split(" ").slice(1).join(" ") || "",
      phone: phone || "",
      email: customer.email || "",
    },
  };
}

async function postBostaDelivery(apiKey, payload){
  const url = "https://app.bosta.co/api/v0/deliveries";
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": apiKey,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch(_){ data = null; }
    if(!r.ok){
      throw new Error("Bosta API " + r.status + ": " + (data?.message || data?.error || text || "").slice(0, 300));
    }
    return data;
  } finally { clearTimeout(t); }
}

export default async function handler(req, res){
  setCors(res, req);
  if(req.method === "OPTIONS"){ res.status(204).end(); return; }
  if(req.method !== "POST"){
    return res.status(405).json({ ok:false, error: "POST فقط" });
  }
  const auth = await verifyAdminToken(req.headers.authorization);
  if(!auth.ok){
    return res.status(auth.status).json({ ok:false, error: auth.error });
  }

  const body = (typeof req.body === "string") ? JSON.parse(req.body || "{}") : (req.body || {});
  const orderId = String(body.orderId || "").trim();
  if(!orderId){
    return res.status(400).json({ ok:false, error: "orderId مطلوب" });
  }

  try {
    const db = getDb();
    const cfgRef = db.collection("factory").doc("config");
    const cfgSnap = await cfgRef.get();
    const cfg = cfgSnap.exists ? (cfgSnap.data() || {}) : {};
    const apiKey = (cfg.shopifyConfig?.bosta_api_key || "").trim();
    if(!apiKey){
      return res.status(400).json({ ok:false, error: "Bosta API key مش معدّ" });
    }

    /* V21.9.20: find via split-aware helper */
    const { order } = await findPendingOrder(cfg, orderId);
    if(!order){
      return res.status(404).json({ ok:false, error: "الطلب مش موجود" });
    }

    /* Idempotent — if order already has tracking, refuse (use refresh instead) */
    if(order.bosta?.tracking_number){
      return res.status(400).json({
        ok: false,
        error: "الطلب عنده tracking بالفعل (" + order.bosta.tracking_number + "). استخدم refresh عشان تحدّث الحالة.",
      });
    }

    const payload = buildPayload(order, body);
    if(!payload.receiver.phone){
      return res.status(400).json({ ok:false, error: "العميل مالوش تليفون — مش هـ ينفع تتعمل شحنة" });
    }

    const bostaResp = await postBostaDelivery(apiKey, payload);
    /* Bosta response shape: { success, message, data: { _id, trackingNumber, ... } } */
    const d = bostaResp?.data || bostaResp;
    const trackingNumber = String(d.trackingNumber || d.tracking_number || "").trim();
    const deliveryId = String(d._id || d.id || "").trim();
    if(!trackingNumber){
      throw new Error("Bosta ما رجّعش tracking number");
    }

    /* Save tracking to the order via helper */
    const updated = {
      ...order,
      bosta: {
        ...(order.bosta || {}),
        tracking_number: trackingNumber,
        delivery_id: deliveryId,
        business_reference: String(orderId),
        receiver_phone: payload.receiver.phone,
        state_code: 10, /* New */
        state_value: "تم الإنشاء",
        state_bucket: "pending",
        state_emoji: "🆕",
        state_color: "#94A3B8",
        state_history: [{
          code: 10,
          value: "تم الإنشاء عبر CLARK",
          bucket: "pending",
          at: new Date().toISOString(),
          source: "auto_create",
        }, ...(Array.isArray(order.bosta?.state_history) ? order.bosta.state_history : [])].slice(0, 50),
        last_state_at: new Date().toISOString(),
        created_via: "clark_auto",
        created_by: auth.email || auth.uid,
      },
    };
    await upsertPendingOrder(cfg, updated);

    return res.status(200).json({
      ok: true,
      tracking_number: trackingNumber,
      delivery_id: deliveryId,
    });
  } catch(e){
    return res.status(400).json({ ok:false, error: e.message || String(e) });
  }
}
