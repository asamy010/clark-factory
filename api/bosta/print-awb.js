/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/bosta/print-awb (V21.7 Phase 10h)
   ───────────────────────────────────────────────────────────────
   Get the AWB (Air Waybill) PDF from Bosta for printing.

   Body: {
     orderId: string,            // CLARK shopifyPendingOrders[].shopify_order_id
     bulkOrderIds?: string[]     // bulk mode (multiple at once)
   }

   Auth: admin

   Returns:
     • For single: { ok, awb_url, delivery_id }
     • For bulk:   { ok, awb_urls: [{ orderId, url }], failed: [...] }

   We try multiple Bosta endpoints since they support different
   print URLs across API versions:
     1. POST /api/v0/awb with delivery IDs → returns URL
     2. GET /api/v0/deliveries/{id}/awb
     3. Fallback: Bosta dashboard print URL

   ═══════════════════════════════════════════════════════════════
   V21.9.20 ROOT-CAUSE FIX: route order reads through
   _pendingOrders.js helper so we don't read empty array
   post-migration.
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";
import { readAllPendingOrders } from "../shopify/_pendingOrders.js";

async function fetchAwbUrl(apiKey, deliveryIds){
  /* Bosta's bulk AWB endpoint accepts an array of delivery _ids */
  const url = "https://app.bosta.co/api/v0/awb";
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
      body: JSON.stringify({ deliveries: deliveryIds }),
      signal: ctrl.signal,
    });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch(_){ data = null; }
    if(!r.ok){
      throw new Error("Bosta AWB " + r.status + ": " + (data?.message || text || "").slice(0, 200));
    }
    /* Bosta usually returns { data: { url, awb } } */
    const result = data?.data || data;
    return {
      url: result?.url || result?.awb || result?.pdf || result?.link || "",
      raw: data,
    };
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
  const ids = Array.isArray(body.bulkOrderIds) ? body.bulkOrderIds.map(String)
            : (body.orderId ? [String(body.orderId)] : []);
  if(ids.length === 0){
    return res.status(400).json({ ok:false, error: "orderId أو bulkOrderIds مطلوب" });
  }

  try {
    const db = getDb();
    const cfgRef = db.collection("factory").doc("config");
    const snap = await cfgRef.get();
    const cfg = snap.exists ? (snap.data() || {}) : {};
    const apiKey = (cfg.shopifyConfig?.bosta_api_key || "").trim();
    if(!apiKey){
      return res.status(400).json({ ok:false, error: "Bosta API key مش معدّ" });
    }

    /* V21.9.20: read via split-aware helper (works both pre- and post-migration) */
    const orders = await readAllPendingOrders(cfg);
    const idSet = new Set(ids);
    const targets = orders.filter(o => idSet.has(String(o.shopify_order_id)));

    const deliveryIds = [];
    const orderToDelivery = new Map();
    const failed = [];

    for(const o of targets){
      const did = o.bosta?.delivery_id;
      if(did){
        deliveryIds.push(did);
        orderToDelivery.set(did, String(o.shopify_order_id));
      } else if(o.bosta?.tracking_number){
        /* Don't have delivery_id but we have tracking — Bosta API needs _id.
           Skip for now and report. */
        failed.push({ orderId: String(o.shopify_order_id), reason: "no_delivery_id" });
      } else {
        failed.push({ orderId: String(o.shopify_order_id), reason: "no_tracking" });
      }
    }

    if(deliveryIds.length === 0){
      return res.status(400).json({
        ok: false,
        error: "مفيش delivery_id لأي طلب من اللي اخترتهم. الـ AWB بـ يحتاج الطلب يكون اتعمل عبر Bosta API (Phase 10d auto-create) عشان نـ store الـ delivery_id.",
        failed,
      });
    }

    /* Bosta supports bulk AWB in one call */
    const result = await fetchAwbUrl(apiKey, deliveryIds);
    if(!result.url){
      return res.status(502).json({
        ok: false,
        error: "Bosta ما رجّعش URL للـ AWB. ممكن الـ deliveries لسه ما اتـ confirmed-ـش (state=10/11).",
        raw: result.raw,
      });
    }

    return res.status(200).json({
      ok: true,
      awb_url: result.url,
      delivery_count: deliveryIds.length,
      failed,
    });
  } catch(e){
    return res.status(500).json({ ok:false, error: e.message });
  }
}
