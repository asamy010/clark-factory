/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/shopify/campaign-update (V21.9.8)
   ───────────────────────────────────────────────────────────────
   Update a campaign — pause / resume / cancel / mark complete /
   edit message. Body: { id, action: "pause"|"resume"|"cancel"|"complete"|"edit", patch? }
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";
import { updateCampaign } from "./_campaigns.js";

const VALID_ACTIONS = new Set(["pause", "resume", "cancel", "complete", "edit"]);
const ACTION_TO_STATUS = {
  pause: "paused",
  resume: "scheduled",
  cancel: "cancelled",
  complete: "completed",
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
  if(!id) return res.status(400).json({ ok:false, error: "id مطلوب" });
  if(!VALID_ACTIONS.has(action)) return res.status(400).json({ ok:false, error: "action غير معروف" });

  try {
    const db = getDb();
    const cfgSnap = await db.collection("factory").doc("config").get();
    const cfg = cfgSnap.exists ? (cfgSnap.data() || {}) : {};

    const patch = { processed_by: auth.email || auth.uid, processed_at: new Date().toISOString() };
    if(action !== "edit"){
      patch.status = ACTION_TO_STATUS[action];
    } else {
      const incoming = body.patch && typeof body.patch === "object" ? body.patch : {};
      const allowed = ["name", "message", "image_url", "schedule", "audience", "skip_already_contacted", "dedup_window_days"];
      for(const k of allowed){
        if(incoming[k] !== undefined) patch[k] = incoming[k];
      }
    }

    const updated = await updateCampaign(cfg, id, patch);
    return res.status(200).json({ ok: true, campaign: updated });
  } catch(e){
    return res.status(500).json({ ok:false, error: e.message });
  }
}
