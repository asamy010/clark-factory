/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/shopify/campaigns-list (V21.9.8)
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";
import { readAllCampaigns, CAMPAIGN_STATUSES } from "./_campaigns.js";

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
  const status = body.status && body.status !== "all" ? new Set(Array.isArray(body.status) ? body.status : [String(body.status)]) : null;

  try {
    const db = getDb();
    const cfgSnap = await db.collection("factory").doc("config").get();
    const cfg = cfgSnap.exists ? (cfgSnap.data() || {}) : {};
    const all = await readAllCampaigns(cfg);

    const stats = { total: all.length };
    for(const s of CAMPAIGN_STATUSES) stats[s] = 0;
    for(const c of all){ if(stats[c.status] !== undefined) stats[c.status]++; }

    const filtered = status ? all.filter(c => status.has(c.status)) : all;
    return res.status(200).json({ ok: true, total: filtered.length, stats, campaigns: filtered });
  } catch(e){
    return res.status(500).json({ ok:false, error: e.message });
  }
}
