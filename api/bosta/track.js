/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/bosta/track (V20.1 Phase 9)
   ───────────────────────────────────────────────────────────────
   Manual tracking endpoint — admin can refresh a single order's
   Bosta status on demand (without waiting for the next webhook).

   Two modes:
   1. Add tracking to a CLARK order (link mode)
      Body: { orderId, trackingNumber }
      Effect: writes bosta.tracking_number on the order. Subsequent
      webhooks will match by tracking number.

   2. Refresh status from Bosta API (sync mode)
      Body: { orderId, refresh: true }
      Effect: GET https://app.bosta.co/api/v0/deliveries/{trackingNumber}
              with Authorization: <api_key>, then update order's bosta state.

   Auth: admin

   ═══════════════════════════════════════════════════════════════
   V21.9.20 ROOT-CAUSE FIX: route order reads/writes through
   _pendingOrders.js helper so post-migration day-doc storage works.
   Pre-V21.9.20 this endpoint wrote shopifyPendingOrders back to
   factory/config, re-creating the legacy array.
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";
import { getBostaStateMeta } from "./_constants.js";
import {
  readAllPendingOrders, upsertPendingOrder, findPendingOrder,
} from "../shopify/_pendingOrders.js";

/* Fetch a delivery by tracking number from the Bosta API.
   Returns { ok, state } or throws on auth/network error. */
async function fetchDeliveryFromBosta(apiKey, trackingNumber){
  if(!apiKey || !trackingNumber){
    throw new Error("API key + tracking number required");
  }
  /* Bosta API base — they use https://app.bosta.co/api/v0 OR /v2 depending
     on the endpoint and API version. We try the v0 endpoint first; if it
     returns 404 we fall back to v2. */
  const tn = encodeURIComponent(String(trackingNumber).trim());
  const headers = {
    "Authorization": apiKey, /* Bosta uses raw key, no Bearer prefix */
    "Accept": "application/json",
  };

  const tryFetch = async (url) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const r = await fetch(url, { headers, signal: ctrl.signal });
      const text = await r.text();
      let data;
      try { data = JSON.parse(text); } catch(_){ data = null; }
      return { ok: r.ok, status: r.status, data, text };
    } finally { clearTimeout(t); }
  };

  let resp = await tryFetch(`https://app.bosta.co/api/v0/deliveries/${tn}`);
  if(!resp.ok && resp.status === 404){
    resp = await tryFetch(`https://app.bosta.co/api/v2/deliveries/${tn}`);
  }
  if(!resp.ok){
    throw new Error("Bosta API error (" + resp.status + "): " + (resp.data?.message || resp.text || "").slice(0, 200));
  }
  return resp.data || {};
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
  const trackingNumber = String(body.trackingNumber || "").trim();
  const refresh = !!body.refresh;
  if(!orderId){
    return res.status(400).json({ ok:false, error: "orderId مطلوب" });
  }

  try {
    const db = getDb();
    const cfgRef = db.collection("factory").doc("config");

    /* Pre-read cfg once (the helper reads it implicitly to detect split state) */
    const cfgSnap = await cfgRef.get();
    const cfg = cfgSnap.exists ? (cfgSnap.data() || {}) : {};

    /* Step 1: if a tracking number was passed without refresh, link it. */
    if(trackingNumber && !refresh){
      const { order: prev } = await findPendingOrder(cfg, orderId);
      if(!prev) throw new Error("الطلب مش موجود");
      const updated = {
        ...prev,
        bosta: {
          ...(prev.bosta || {}),
          tracking_number: trackingNumber,
          linked_at: new Date().toISOString(),
          linked_by: auth.email || auth.uid,
        },
      };
      await upsertPendingOrder(cfg, updated);
      return res.status(200).json({ ok:true, order: updated, action: "linked" });
    }

    /* Step 2: refresh from Bosta API */
    const apiKey = (cfg.shopifyConfig?.bosta_api_key || "").trim();
    if(!apiKey){
      return res.status(400).json({ ok:false, error: "Bosta API key مش معدّ في الإعدادات" });
    }
    const { order } = await findPendingOrder(cfg, orderId);
    if(!order){
      return res.status(404).json({ ok:false, error: "الطلب مش موجود" });
    }
    const tn = trackingNumber || order.bosta?.tracking_number;
    if(!tn){
      return res.status(400).json({ ok:false, error: "الطلب مفيش له tracking number — اربطه بـ tracking أولاً" });
    }

    const delivery = await fetchDeliveryFromBosta(apiKey, tn);
    /* Bosta response shape: { success, message, data: { _id, state: { code, value }, ... } } */
    const d = delivery?.data || delivery;
    const stateRaw = d.state || d.status || {};
    const stateCode = Number(stateRaw.code || stateRaw.value || 0);
    const stateValue = String(stateRaw.value || stateRaw.label || "").trim();
    const meta = getBostaStateMeta(stateCode);
    const occurredAt = d.updatedAt || new Date().toISOString();

    const prevHistory = Array.isArray(order.bosta?.state_history) ? order.bosta.state_history : [];
    const lastInHistory = prevHistory[0];
    const dup = lastInHistory && lastInHistory.code === stateCode;
    const nextHistory = dup ? prevHistory : [{
      code: stateCode,
      value: stateValue || meta.label,
      bucket: meta.bucket,
      at: occurredAt,
      source: "api_refresh",
    }, ...prevHistory].slice(0, 50);

    const updated = {
      ...order,
      bosta: {
        ...(order.bosta || {}),
        tracking_number: tn,
        state_code: stateCode,
        state_value: stateValue || meta.label,
        state_bucket: meta.bucket,
        state_emoji: meta.emoji,
        state_color: meta.color,
        state_history: nextHistory,
        last_state_at: occurredAt,
        last_refresh_at: new Date().toISOString(),
      },
    };

    await upsertPendingOrder(cfg, updated);

    return res.status(200).json({
      ok: true,
      order: updated,
      action: "refreshed",
      state: { code: stateCode, value: stateValue, bucket: meta.bucket },
    });
  } catch(e){
    return res.status(400).json({ ok:false, error: e.message || String(e) });
  }
}
