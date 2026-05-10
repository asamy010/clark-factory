/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/shopify/return-requests-list (V21.9.7)
   ───────────────────────────────────────────────────────────────
   List return requests with optional filtering.

   Body (all optional):
     {
       status: "all" | "pending_review" | "approved" | "rejected"
             | "in_pickup" | "received" | "refunded" | "cancelled"
             | ["pending_review", "approved"],   // array OK
       limit: 200,    // default 200
       offset: 0,
       search: "phone | name | order#",
     }

   Auth: admin
   Returns: {
     ok, total, returned,
     stats: { pending_review, approved, in_pickup, received, refunded, ... },
     requests: [...]
   }
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";
import { readAllReturnRequests, RETURN_STATUSES } from "./_returnRequests.js";

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
  const limit = Math.max(1, Math.min(2000, Number(body.limit) || 200));
  const offset = Math.max(0, Number(body.offset) || 0);
  const search = String(body.search || "").trim().toLowerCase();

  /* Normalize status filter */
  let statusFilter = null; /* null = all */
  if(body.status && body.status !== "all"){
    if(Array.isArray(body.status)){
      statusFilter = new Set(body.status);
    } else {
      statusFilter = new Set([String(body.status)]);
    }
  }

  try {
    const db = getDb();
    const cfgSnap = await db.collection("factory").doc("config").get();
    const cfg = cfgSnap.exists ? (cfgSnap.data() || {}) : {};
    let all = await readAllReturnRequests(cfg);

    /* Compute stats across the FULL dataset (pre-filter) */
    const stats = { total: all.length };
    for(const s of RETURN_STATUSES) stats[s] = 0;
    for(const r of all){
      if(stats[r.status] !== undefined) stats[r.status]++;
    }

    /* Apply filters */
    let filtered = all;
    if(statusFilter){
      filtered = filtered.filter(r => statusFilter.has(r.status));
    }
    if(search){
      filtered = filtered.filter(r => {
        const phone = String(r.customer?.phone || "").toLowerCase();
        const name = String(r.customer?.name || "").toLowerCase();
        const ordNum = String(r.shopify_order_number || "").toLowerCase();
        const ordId = String(r.shopify_order_id || "").toLowerCase();
        return phone.includes(search) || name.includes(search) ||
               ordNum.includes(search) || ordId.includes(search) ||
               String(r.id).toLowerCase().includes(search);
      });
    }

    const total = filtered.length;
    const requests = filtered.slice(offset, offset + limit);

    return res.status(200).json({
      ok: true,
      total,
      returned: requests.length,
      offset,
      limit,
      stats,
      requests,
    });
  } catch(e){
    return res.status(500).json({ ok:false, error: e.message });
  }
}
