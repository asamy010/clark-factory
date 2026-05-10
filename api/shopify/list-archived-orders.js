/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/shopify/list-archived-orders (V21.9.1 Phase 11g)
   ───────────────────────────────────────────────────────────────
   Browse historical orders from shopifyOrdersArchive collection.
   Each order includes shipment status (fulfillment_status), payment
   status (financial_status, payment_method) and customer info.

   Body: {
     month?: "2024_03"      -- a specific YYYY_MM bucket (recommended)
                              if omitted, returns the most recent month only
     limit?: 200            -- per-bucket cap (default 200)
     status?: "delivered"|"refused"|"pending_delivery"|"all"
   }

   Auth: admin Bearer

   Returns: {
     ok, month, total_in_archive, returned, orders: [...],
     available_months: ["2024_03", "2024_04", ...]
   }
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";

const ARCHIVE_COLLECTION = "shopifyOrdersArchive";

export default async function handler(req, res){
  setCors(res, req);
  if(req.method === "OPTIONS"){ res.status(204).end(); return; }
  if(req.method !== "POST" && req.method !== "GET"){
    return res.status(405).json({ ok:false, error: "POST/GET فقط" });
  }
  const auth = await verifyAdminToken(req.headers.authorization);
  if(!auth.ok){
    return res.status(auth.status).json({ ok:false, error: auth.error });
  }

  const body = (typeof req.body === "string") ? JSON.parse(req.body || "{}") : (req.body || {});
  const month = String(body.month || "").trim();
  const limit = Math.max(1, Math.min(2000, Number(body.limit) || 200));
  const statusFilter = String(body.status || "all").trim();

  try {
    const db = getDb();
    /* List available months (one per archive doc, dedup pages) */
    const allDocs = await db.collection(ARCHIVE_COLLECTION).get();
    const monthsMap = new Map(); /* bucket → total count across pages */
    allDocs.forEach(d => {
      const data = d.data() || {};
      const bk = data.bucket || d.id.split("_p")[0];
      const cnt = data.count || (Array.isArray(data.orders) ? data.orders.length : 0);
      monthsMap.set(bk, (monthsMap.get(bk) || 0) + cnt);
    });
    const availableMonths = Array.from(monthsMap.keys()).sort().reverse(); /* newest first */
    const totalInArchive = Array.from(monthsMap.values()).reduce((s, c) => s + c, 0);

    if(availableMonths.length === 0){
      return res.status(200).json({
        ok: true,
        month: null,
        total_in_archive: 0,
        returned: 0,
        orders: [],
        available_months: [],
      });
    }

    /* Pick the requested month or default to most recent */
    const targetMonth = month && monthsMap.has(month) ? month : availableMonths[0];

    /* Read all docs for that month (could be _p1, _p2, etc.) */
    const orders = [];
    for(const d of allDocs.docs){
      const data = d.data() || {};
      if(data.bucket === targetMonth || d.id.startsWith(targetMonth)){
        const arr = Array.isArray(data.orders) ? data.orders : [];
        for(const o of arr) orders.push(o);
      }
    }

    /* Apply status filter */
    let filtered = orders;
    if(statusFilter !== "all"){
      filtered = orders.filter(o => o.status === statusFilter);
    }

    /* Sort newest-first */
    filtered.sort((a, b) => {
      const ta = a.shopify_created_at ? new Date(a.shopify_created_at).getTime() : 0;
      const tb = b.shopify_created_at ? new Date(b.shopify_created_at).getTime() : 0;
      return tb - ta;
    });

    /* Cap to limit */
    const returned = filtered.slice(0, limit);

    return res.status(200).json({
      ok: true,
      month: targetMonth,
      total_in_archive: totalInArchive,
      total_in_month: orders.length,
      total_after_filter: filtered.length,
      returned: returned.length,
      orders: returned,
      available_months: availableMonths.map(bk => ({
        month: bk,
        count: monthsMap.get(bk),
      })),
    });
  } catch(e){
    return res.status(500).json({ ok:false, error: e.message });
  }
}
