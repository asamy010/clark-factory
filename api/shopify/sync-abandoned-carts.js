/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/shopify/sync-abandoned-carts (V21.1 Phase 10b)
   ───────────────────────────────────────────────────────────────
   Pull "abandoned checkouts" from Shopify (= customers who started
   buying but didn't complete). Used for WhatsApp recovery campaigns.

   Body: { hoursBack?: 720 }  (default 30 days)
   Auth: admin

   Returns: { ok, total, withPhone, withEmail, totalValue }

   Stored in factory/config.shopifyAbandonedCarts[]
   Each cart entry: { id, token, abandoned_checkout_url, customer info,
   line_items, total_price, created_at, recovered_at? }

   Idempotency: cart by token is unique. We preserve user-set notes
   and last_recovered_at on resync.
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";
import { getShopifyCreds, shopifyFetch } from "./_shopifyAdmin.js";

const CARTS_CAP = 1000;

function mapCheckout(c){
  if(!c) return null;
  const sa = c.shipping_address || c.billing_address || {};
  const customerObj = c.customer || {};
  const items = (c.line_items || []).map(li => ({
    sku: li.sku || "",
    title: li.title || "",
    variant_title: li.variant_title || "",
    quantity: Number(li.quantity) || 0,
    price: Number(li.price) || 0,
  }));
  return {
    id: String(c.id),
    token: c.token || "",
    abandoned_checkout_url: c.abandoned_checkout_url || c.url || "",
    email: (c.email || customerObj.email || "").trim().toLowerCase(),
    phone: c.phone || sa.phone || customerObj.phone || "",
    customer_name: [sa.first_name, sa.last_name].filter(Boolean).join(" ").trim()
                  || [customerObj.first_name, customerObj.last_name].filter(Boolean).join(" ").trim() || "",
    line_items: items,
    items_count: items.reduce((s, it) => s + (it.quantity || 0), 0),
    subtotal_price: Number(c.subtotal_price) || 0,
    total_price: Number(c.total_price) || 0,
    currency: c.currency || "EGP",
    note: c.note || "",
    created_at: c.created_at || null,
    updated_at: c.updated_at || null,
    completed_at: c.completed_at || null,
  };
}

async function fetchAllAbandonedCheckouts(creds, sinceISO){
  const all = [];
  let sinceId = 0;
  let page = 0;
  const maxPages = 20;
  while(page < maxPages){
    const params = ["limit=250"];
    if(sinceId) params.push("since_id=" + sinceId);
    if(sinceISO) params.push("created_at_min=" + encodeURIComponent(sinceISO));
    /* status=open by default; we want only un-completed */
    params.push("status=open");
    const r = await shopifyFetch(creds, "/checkouts.json?" + params.join("&"));
    const list = (r.data && Array.isArray(r.data.checkouts)) ? r.data.checkouts : [];
    if(list.length === 0) break;
    list.forEach(c => all.push(c));
    if(list.length < 250) break;
    sinceId = list[list.length - 1].id;
    page++;
  }
  return all.map(mapCheckout).filter(Boolean);
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

  const creds = await getShopifyCreds();
  if(!creds){
    return res.status(400).json({ ok:false, error: "Shopify creds مش معدّة" });
  }

  const body = (typeof req.body === "string") ? JSON.parse(req.body || "{}") : (req.body || {});
  const hoursBack = Math.max(1, Math.min(8760, Number(body.hoursBack) || 720));
  const sinceISO = new Date(Date.now() - hoursBack * 3600 * 1000).toISOString();

  let fetched;
  try {
    fetched = await fetchAllAbandonedCheckouts(creds, sinceISO);
  } catch(e){
    return res.status(502).json({ ok:false, error: "Shopify fetch failed: " + (e.message || e) });
  }

  /* Save (preserve user notes + last_recovered_at if cart already in DB) */
  let stats = { total: 0, withPhone: 0, withEmail: 0, totalValue: 0 };
  try {
    const db = getDb();
    const cfgRef = db.collection("factory").doc("config");
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(cfgRef);
      const cfg = snap.exists ? (snap.data() || {}) : {};
      const existing = Array.isArray(cfg.shopifyAbandonedCarts) ? cfg.shopifyAbandonedCarts : [];
      const existingMap = new Map(existing.map(c => [String(c.id), c]));
      const merged = [];
      for(const cart of fetched.slice(0, CARTS_CAP)){
        const prev = existingMap.get(cart.id);
        merged.push({
          ...cart,
          /* Preserve user-set fields */
          last_contacted_at: prev?.last_contacted_at || null,
          contact_count: Number(prev?.contact_count) || 0,
          recovered_at: prev?.recovered_at || null,
          recovered_by: prev?.recovered_by || null,
          do_not_contact: prev?.do_not_contact === true,
          user_note: prev?.user_note || "",
        });
        stats.total++;
        if(cart.phone) stats.withPhone++;
        if(cart.email) stats.withEmail++;
        stats.totalValue += cart.total_price;
      }
      tx.set(cfgRef, {
        shopifyAbandonedCarts: merged,
        shopifyConfig: {
          ...(cfg.shopifyConfig || {}),
          last_abandoned_carts_sync_at: new Date().toISOString(),
          last_abandoned_carts_count: merged.length,
        },
      }, { merge: true });
    });
  } catch(e){
    return res.status(500).json({ ok:false, error: e.message });
  }

  return res.status(200).json({ ok: true, ...stats });
}
