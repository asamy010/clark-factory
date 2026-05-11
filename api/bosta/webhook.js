/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/bosta/webhook (V20.1 Phase 9)
   ───────────────────────────────────────────────────────────────
   Bosta webhook endpoint. Bosta posts here every time a delivery's
   state changes. We:
     1. Verify the secret token (?token=… or X-Bosta-Token header)
     2. Normalize the payload
     3. Match the delivery to a CLARK shopifyPendingOrder
     4. Append to bosta.state_history + update bosta.state_code/value
     5. Optionally trigger auto mark-delivered / mark-refused

   Auth: NOT admin auth (Bosta can't carry our Bearer token).
   Instead:
     • Required: ?token=<secret> matches BOSTA_WEBHOOK_SECRET env var
     • OR: X-Bosta-Token header matches
   The secret is generated once and the user pastes it into Bosta's
   webhook URL config. Rotation = update env var + update Bosta URL.

   Webhook URL format the user gives Bosta:
     https://clark-factory.vercel.app/api/bosta/webhook?token=XXXXX

   On match-failure we still 200 OK (so Bosta doesn't retry forever)
   but log to a misses array for debugging.

   On unauthorized request we return 401.

   ═══════════════════════════════════════════════════════════════
   V21.9.20 ROOT-CAUSE FIX: pre-V21.9.20 this endpoint wrote orders
   array back to factory/config inside transactions. Post-migration
   this would re-create the legacy cfg.shopifyPendingOrders array
   with stale/partial data, undoing the V21.9.18 split.

   Fix: route order reads/writes through _pendingOrders.js helper.
   Misses log + shopifyConfig metadata stay on factory/config.
   ═══════════════════════════════════════════════════════════════ */

import { getDb } from "../_firebase.js";
import { normalizeBostaWebhook, matchOrderToBostaDelivery, getBostaStateMeta } from "./_constants.js";
import {
  readAllPendingOrders, upsertPendingOrder, isPendingOrdersSplit,
} from "../shopify/_pendingOrders.js";

const MAX_HISTORY_PER_ORDER = 50;
const MAX_MISSES_LOG = 100;

function isAuthorized(req){
  const expected = (process.env.BOSTA_WEBHOOK_SECRET || "").trim();
  if(!expected) return false;
  const fromQuery = String(req.query?.token || "").trim();
  const fromHeader = String(req.headers?.["x-bosta-token"] || req.headers?.["x-webhook-token"] || "").trim();
  return fromQuery === expected || fromHeader === expected;
}

export default async function handler(req, res){
  /* Allow GET for connectivity test (Bosta sometimes pings with GET first) */
  if(req.method === "GET"){
    if(!isAuthorized(req)){
      return res.status(401).json({ ok:false, error: "Unauthorized — missing or wrong token" });
    }
    return res.status(200).json({ ok:true, ping: "ok", endpoint: "bosta-webhook" });
  }
  if(req.method !== "POST"){
    return res.status(405).json({ ok:false, error: "POST only" });
  }
  if(!isAuthorized(req)){
    return res.status(401).json({ ok:false, error: "Unauthorized" });
  }

  /* Parse body — Vercel sometimes passes string */
  let body;
  try {
    body = (typeof req.body === "string") ? JSON.parse(req.body || "{}") : (req.body || {});
  } catch(e){
    return res.status(400).json({ ok:false, error: "Invalid JSON" });
  }

  const normalized = normalizeBostaWebhook(body);
  if(!normalized){
    return res.status(400).json({ ok:false, error: "Could not parse Bosta payload" });
  }

  const stateMeta = getBostaStateMeta(normalized.stateCode);
  const historyEntry = {
    code: normalized.stateCode,
    value: normalized.stateValue || stateMeta.label,
    bucket: stateMeta.bucket,
    at: normalized.occurredAt,
    source: "webhook",
  };

  /* ── V21.9.20: split-aware match + update ── */
  let result = { matched: false, orderId: null, action: null };
  try {
    const db = getDb();
    const cfgRef = db.collection("factory").doc("config");

    /* Pre-read cfg + all pending orders */
    const cfgSnap = await cfgRef.get();
    const cfg = cfgSnap.exists ? (cfgSnap.data() || {}) : {};
    const allOrders = await readAllPendingOrders(cfg);
    const idx = matchOrderToBostaDelivery(allOrders, normalized);

    if(idx < 0){
      /* Unmatched — record in misses log on cfg (cfg.bostaWebhookMisses is
         a small bounded array, stays on factory/config). */
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(cfgRef);
        const c = snap.exists ? (snap.data() || {}) : {};
        const misses = Array.isArray(c.bostaWebhookMisses) ? c.bostaWebhookMisses.slice() : [];
        misses.unshift({
          at: new Date().toISOString(),
          tracking_number: normalized.trackingNumber,
          business_reference: normalized.businessReference,
          receiver_phone: normalized.receiverPhone,
          state_code: normalized.stateCode,
          state_value: normalized.stateValue,
        });
        tx.set(cfgRef, {
          bostaWebhookMisses: misses.slice(0, MAX_MISSES_LOG),
          shopifyConfig: {
            ...(c.shopifyConfig || {}),
            bosta_last_webhook_at: new Date().toISOString(),
            bosta_last_webhook_status: "unmatched",
          },
        }, { merge: true });
      });
      result = { matched: false, orderId: null, action: "logged_miss" };
    } else {
      const order = allOrders[idx];
      const prevBosta = order.bosta || {};
      const prevHistory = Array.isArray(prevBosta.state_history) ? prevBosta.state_history : [];
      /* De-dup: skip if the exact same state arrived again within 60 seconds */
      const lastInHistory = prevHistory[0];
      const isDup = lastInHistory && lastInHistory.code === historyEntry.code &&
        Math.abs(new Date(lastInHistory.at).getTime() - new Date(historyEntry.at).getTime()) < 60000;
      const nextHistory = isDup ? prevHistory : [historyEntry, ...prevHistory].slice(0, MAX_HISTORY_PER_ORDER);

      const updatedOrder = {
        ...order,
        bosta: {
          ...prevBosta,
          tracking_number: normalized.trackingNumber || prevBosta.tracking_number || "",
          business_reference: normalized.businessReference || prevBosta.business_reference || "",
          receiver_phone: normalized.receiverPhone || prevBosta.receiver_phone || "",
          delivery_id: normalized.deliveryId || prevBosta.delivery_id || "",
          state_code: normalized.stateCode,
          state_value: normalized.stateValue || stateMeta.label,
          state_bucket: stateMeta.bucket,
          state_emoji: stateMeta.emoji,
          state_color: stateMeta.color,
          state_history: nextHistory,
          last_webhook_at: new Date().toISOString(),
          last_state_at: normalized.occurredAt,
        },
      };

      /* Write the updated order via helper (routes to day doc when split is
         active, falls back to legacy cfg array pre-migration). */
      await upsertPendingOrder(cfg, updatedOrder);

      /* Also update shopifyConfig metadata on factory/config */
      await db.runTransaction(async (tx) => {
        tx.set(cfgRef, {
          shopifyConfig: {
            ...(cfg.shopifyConfig || {}),
            bosta_last_webhook_at: new Date().toISOString(),
            bosta_last_webhook_status: "matched",
          },
        }, { merge: true });
      });

      result = { matched: true, orderId: String(order.shopify_order_id), action: "updated" };

      /* Auto-actions — flag for follow-up call from the handler. We don't
         actually call the mark-delivered/mark-refused endpoints inline. */
      result.shouldAutoMarkDelivered = stateMeta.bucket === "delivered" &&
        cfg.shopifyConfig?.bosta_auto_mark_delivered === true &&
        order.status === "pending_delivery";
      result.shouldAutoMarkRefused = stateMeta.bucket === "returned" &&
        cfg.shopifyConfig?.bosta_auto_mark_refused === true &&
        order.status === "pending_delivery";
      result._matchedOrder = updatedOrder;
    }
  } catch(e){
    console.error("[bosta/webhook] match+update failed:", e);
    return res.status(500).json({ ok:false, error: e.message });
  }

  /* ── Optional auto-actions (after the match) ── */
  if(result.shouldAutoMarkDelivered || result.shouldAutoMarkRefused){
    try {
      const db = getDb();
      const cfgSnap = await db.collection("factory").doc("config").get();
      const cfg = cfgSnap.exists ? (cfgSnap.data() || {}) : {};
      /* Re-read the order from the live source — protects against the rare
         race where the user marked it manually between our updates. */
      const allOrders = await readAllPendingOrders(cfg);
      const fresh = allOrders.find(o => String(o.shopify_order_id) === result.orderId);
      if(fresh && fresh.status === "pending_delivery"){
        if(result.shouldAutoMarkDelivered){
          await upsertPendingOrder(cfg, {
            ...fresh,
            status: "delivered",
            delivered_at: new Date().toISOString(),
            delivered_by: "bosta_auto",
          });
          result.action = "auto_marked_delivered";
        } else if(result.shouldAutoMarkRefused){
          await upsertPendingOrder(cfg, {
            ...fresh,
            status: "refused",
            refused_at: new Date().toISOString(),
            refused_by: "bosta_auto",
            refusal_reason: "Bosta state: " + (normalized.stateValue || stateMeta.label),
          });
          result.action = "auto_marked_refused";
        }
      }
    } catch(e){
      console.warn("[bosta/webhook] auto status flip failed:", e.message);
    }
  }

  /* Always 200 OK so Bosta doesn't retry */
  return res.status(200).json({
    ok: true,
    matched: result.matched,
    orderId: result.orderId,
    action: result.action,
    state: { code: normalized.stateCode, value: normalized.stateValue, bucket: stateMeta.bucket },
  });
}
