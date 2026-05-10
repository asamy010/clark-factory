/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/shopify/return-request-update (V21.9.7)
   ───────────────────────────────────────────────────────────────
   Update a return request — status transitions + admin notes.

   Body:
     {
       id: "rr_...",            // required
       action: "approve"        // → status=approved (+ optionally creates Bosta pickup)
             | "reject"         // → status=rejected
             | "mark_in_pickup" // → status=in_pickup (manual; if not auto-Bosta)
             | "mark_received"  // → status=received
             | "mark_refunded"  // → status=refunded
             | "cancel"         // → status=cancelled
             | "update_notes",  // just update notes/refund_amount
       notes?: string,
       refund_amount?: number,
       refund_method?: string,
       reject_reason?: string,
       create_bosta_pickup?: boolean,   // for approve action only — also call Bosta CRP
     }

   Auth: admin
   Returns: { ok, request, bosta? }
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";
import { updateReturnRequest } from "./_returnRequests.js";

const VALID_ACTIONS = new Set([
  "approve", "reject", "mark_in_pickup", "mark_received",
  "mark_refunded", "cancel", "update_notes",
]);

const ACTION_TO_STATUS = {
  approve: "approved",
  reject: "rejected",
  mark_in_pickup: "in_pickup",
  mark_received: "received",
  mark_refunded: "refunded",
  cancel: "cancelled",
};

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
  const id = String(body.id || "").trim();
  const action = String(body.action || "").trim();
  const notes = body.notes != null ? String(body.notes).slice(0, 1000) : null;
  const refundAmount = body.refund_amount != null ? Number(body.refund_amount) : null;
  const refundMethod = body.refund_method ? String(body.refund_method).trim() : null;
  const rejectReason = body.reject_reason ? String(body.reject_reason).slice(0, 500) : null;
  const createBostaPickup = body.create_bosta_pickup === true;

  if(!id) return res.status(400).json({ ok:false, error: "id مطلوب" });
  if(!VALID_ACTIONS.has(action)){
    return res.status(400).json({ ok:false, error: "action غير معروف. الـ allowed: " + Array.from(VALID_ACTIONS).join(", ") });
  }

  try {
    const db = getDb();
    const cfgSnap = await db.collection("factory").doc("config").get();
    const cfg = cfgSnap.exists ? (cfgSnap.data() || {}) : {};

    const now = new Date().toISOString();
    const patch = {
      processed_by: auth.email || auth.uid,
      processed_at: now,
    };

    if(action === "update_notes"){
      if(notes != null) patch.notes = notes;
      if(refundAmount != null) patch.refund_amount = Math.max(0, refundAmount);
      if(refundMethod != null) patch.refund_method = refundMethod;
    } else {
      patch.status = ACTION_TO_STATUS[action];
      if(action === "reject" && rejectReason) patch.reject_reason = rejectReason;
      if(notes != null) patch.notes = notes;
      if(refundAmount != null) patch.refund_amount = Math.max(0, refundAmount);
      if(refundMethod != null) patch.refund_method = refundMethod;
    }

    /* If approving + Bosta requested, create the pickup BEFORE the status update
       so we can store the pickup details on the same patch */
    let bostaResult = null;
    if(action === "approve" && createBostaPickup){
      try {
        const bosta = await createBostaPickupForRequest(db, cfg, id, auth.email || auth.uid);
        if(bosta?.ok){
          patch.bosta_pickup = bosta.pickup;
          patch.status = "in_pickup"; /* skip approved → in_pickup */
          bostaResult = bosta;
        } else {
          /* Bosta failed — proceed with approve only, log the error */
          bostaResult = { ok: false, error: bosta?.error || "Bosta pickup failed" };
          patch.bosta_pickup_error = bostaResult.error;
        }
      } catch(e){
        bostaResult = { ok: false, error: e.message || String(e) };
        patch.bosta_pickup_error = bostaResult.error;
      }
    }

    const updated = await updateReturnRequest(cfg, id, patch);

    return res.status(200).json({
      ok: true,
      request: updated,
      bosta: bostaResult,
    });
  } catch(e){
    return res.status(500).json({ ok:false, error: e.message });
  }
}

/* Helper — call the Bosta CRP endpoint internally to create a pickup. */
async function createBostaPickupForRequest(db, cfg, requestId, by){
  const apiKey = (cfg.shopifyConfig?.bosta_api_key || "").trim();
  if(!apiKey){
    return { ok: false, error: "Bosta API key مش معدّ" };
  }

  /* Read the request to get customer + items */
  const { readReturnRequestById } = await import("./_returnRequests.js");
  const rr = await readReturnRequestById(cfg, requestId);
  if(!rr) return { ok: false, error: "Return request not found" };

  /* Build the Bosta CRP payload.
     Bosta type code 25 = "Customer Return Pickup" (customer → merchant).
     Reference: Bosta Public API v0 — POST /api/v0/deliveries
     The merchant pickup address is auto-filled by Bosta from the business
     profile, so we just provide the dropoff (= customer's address) and
     other details. */
  const phone = (rr.customer?.phone || "").replace(/[^0-9]/g, "");
  if(!phone || phone.length < 10){
    return { ok: false, error: "تليفون العميل غير صحيح" };
  }
  const address = rr.customer?.address || {};

  /* Bosta CRP shape (best-effort — may need tuning per business config):
     The API accepts these fields under "pickupAddress" for CRP type.
     In CRP, the pickupAddress is the CUSTOMER's address (where Bosta picks up). */
  const itemSummary = (rr.items || []).map(it =>
    `${it.qty} × ${it.title || it.sku}`
  ).join(" | ").slice(0, 250);

  const payload = {
    type: 25, /* CRP — Customer Return Pickup */
    specs: {
      packageType: "Parcel",
      size: "Normal",
    },
    cod: 0, /* No cash collection on returns */
    notes: `[CLARK return ${requestId}] Order #${rr.shopify_order_number || rr.shopify_order_id} — ${itemSummary}`,
    receiver: {
      firstName: (rr.customer?.name || "").split(" ")[0] || "Customer",
      lastName: (rr.customer?.name || "").split(" ").slice(1).join(" ") || "",
      phone, /* receiver in CRP = customer */
    },
    pickupAddress: {
      city: { name: address.city || address.governorate || "Cairo" },
      district: { name: address.governorate || "" },
      firstLine: address.line1 || "",
      secondLine: address.line2 || "",
    },
    businessReference: requestId, /* CLARK reference for cross-linking */
  };

  /* Make the actual call to Bosta */
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch("https://app.bosta.co/api/v0/deliveries", {
      method: "POST",
      headers: {
        "Authorization": apiKey,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch(_){ data = null; }
    if(!r.ok){
      return {
        ok: false,
        error: "Bosta " + r.status + ": " + (data?.message || text || "").slice(0, 300),
      };
    }
    /* Bosta returns the created delivery */
    const d = data?.data || data;
    return {
      ok: true,
      pickup: {
        delivery_id: d._id || d.id || "",
        tracking_number: d.trackingNumber || d.tracking_number || "",
        type: 25,
        type_label: "CRP",
        cod: 0,
        notes: payload.notes,
        created_at: new Date().toISOString(),
        created_by: by,
      },
      raw: data,
    };
  } catch(e){
    clearTimeout(t);
    if(e.name === "AbortError"){
      return { ok: false, error: "Bosta ما ردّش في الوقت المحدد" };
    }
    return { ok: false, error: e.message || String(e) };
  }
}
