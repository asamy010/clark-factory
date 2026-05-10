/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/shopify/verify-product-pushed (V21.9.13)
   ───────────────────────────────────────────────────────────────
   Bidirectional sync helper for the Push button on order cards.

   When a CLARK order has shopify_meta.shopify_product_id set, the
   user expects the card to show "Pushed". But if the product was
   manually deleted on Shopify (admin → Products → Delete), the
   meta is now stale — the card claims "Pushed" but Shopify has
   no record. This endpoint reconciles:

   1. Read the order from seasons/{season}/orders/{docId}.
   2. If shopify_meta.shopify_product_id is missing, return
      { ok:true, exists:false, cleared:false } (nothing to do).
   3. GET /products/{shopify_product_id}.json from Shopify.
   4. If 200 → product still exists. Return exists:true.
   5. If 404 → product deleted. Clear the order's shopify_meta
      (specifically the IDs that prove "pushed" state) and return
      { ok:true, exists:false, cleared:true }. The next data
      snapshot will refresh the order card so the badge disappears
      and the Push button reappears.

   Why this is safe to clear automatically:
     • The deletion is verified against Shopify's authoritative
       state — not inferred from a flaky local check.
     • We keep the historical fields (last_pushed_at, images,
       description, etc.) so a re-push uses the same config.
     • Only the IDs that mark "currently pushed" are removed:
       shopify_product_id, shopify_handle, shopify_title, push_status.

   Body: { orderId: string }
   Auth: admin
   Returns: { ok, exists, cleared, shopify_product_id? }
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";
import { getShopifyCreds, shopifyFetch } from "./_shopifyAdmin.js";

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

  const creds = await getShopifyCreds();
  if(!creds){
    return res.status(400).json({ ok:false, error: "الاتصال بـ Shopify مش معدّ" });
  }

  /* Find the order — same lookup pattern as push-product-from-clark.js */
  const db = getDb();
  let orderDocRef = null;
  let orderData = null;
  try {
    const cfgSnap = await db.collection("factory").doc("config").get();
    const cfg = cfgSnap.exists ? (cfgSnap.data() || {}) : {};
    const activeSeason = cfg.activeSeason || "WS26";
    let orderSnap = await db.collection("seasons").doc(activeSeason)
      .collection("orders").where("id", "==", orderId).limit(1).get();
    if(orderSnap.empty){
      const numId = Number(orderId);
      if(Number.isFinite(numId)){
        orderSnap = await db.collection("seasons").doc(activeSeason)
          .collection("orders").where("id", "==", numId).limit(1).get();
      }
    }
    if(orderSnap.empty){
      const seasonsSnap = await db.collection("seasons").listDocuments();
      for(const seasonRef of seasonsSnap){
        if(seasonRef.id === activeSeason) continue;
        const ss = await seasonRef.collection("orders").where("id", "==", orderId).limit(1).get();
        if(!ss.empty){ orderSnap = ss; break; }
      }
    }
    if(orderSnap.empty){
      return res.status(404).json({ ok:false, error: "الموديل مش موجود" });
    }
    orderDocRef = orderSnap.docs[0].ref;
    orderData = orderSnap.docs[0].data() || {};
  } catch(e){
    return res.status(500).json({ ok:false, error: "فشل قراءة الموديل: " + e.message });
  }

  const meta = orderData.shopify_meta || {};
  const shopifyId = meta.shopify_product_id;
  if(!shopifyId){
    return res.status(200).json({ ok:true, exists:false, cleared:false });
  }

  /* Ping Shopify */
  try {
    await shopifyFetch(creds, "/products/" + shopifyId + ".json", { method: "GET" });
    /* Found → still pushed */
    return res.status(200).json({
      ok: true,
      exists: true,
      cleared: false,
      shopify_product_id: String(shopifyId),
    });
  } catch(e){
    /* Detect 404 vs other errors. shopifyFetch throws Arabic error strings;
       the 404 case includes "مش موجود". For other errors (auth, 5xx, network)
       we DO NOT clear — those are transient and clearing would erase
       legitimate state. */
    const msg = String(e?.message || e || "");
    const is404 = /مش موجود|HTTP 404|404/i.test(msg) && !/Shopify بطيء/.test(msg);
    if(!is404){
      /* Transient — surface the error, keep meta intact */
      return res.status(502).json({ ok:false, error: "تعذر التحقق من حالة Shopify: " + msg });
    }

    /* Confirmed 404 — Shopify product was deleted. Clear the "currently
       pushed" markers but preserve the user's push config (description,
       images, sku pattern, etc.) for an easy re-push. */
    try {
      const fresh = (await orderDocRef.get()).data() || {};
      const freshMeta = fresh.shopify_meta || {};
      const nextMeta = { ...freshMeta };
      delete nextMeta.shopify_product_id;
      delete nextMeta.shopify_handle;
      delete nextMeta.shopify_title;
      nextMeta.push_status = "deleted_on_shopify";
      nextMeta.deleted_on_shopify_detected_at = new Date().toISOString();
      nextMeta.last_known_shopify_product_id = String(shopifyId);
      await orderDocRef.set({ ...fresh, shopify_meta: nextMeta });
    } catch(writeErr){
      return res.status(500).json({
        ok: false,
        error: "تم اكتشاف حذف المنتج من Shopify لكن فشل تحديث الموديل: " + writeErr.message,
      });
    }

    return res.status(200).json({
      ok: true,
      exists: false,
      cleared: true,
      shopify_product_id: String(shopifyId),
      message: "تم حذف المنتج من Shopify — اتـ unmark كـ pushed محلياً",
    });
  }
}
