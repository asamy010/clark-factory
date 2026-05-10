/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/shopify/campaign-create (V21.9.8)
   ───────────────────────────────────────────────────────────────
   Create a new WhatsApp campaign.

   Body:
     {
       name: "Welcome new buyers",
       audience: { type, min_delivered?, max_age_days?, custom_ids?, ... },
       message: "أهلاً {name} 👋 ...",
       image_url?: "https://...",
       schedule: { type: "now"|"once"|"recurring", run_at?, cron?, ... },
       skip_already_contacted?: true,
       dedup_window_days?: 7,
     }

   Returns: { ok, campaign, audience_size }
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";
import {
  addCampaign, genCampaignId, buildAudience, AUDIENCE_TYPES, SCHEDULE_TYPES,
} from "./_campaigns.js";

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
  const name = String(body.name || "").trim().slice(0, 100);
  const audience = body.audience && typeof body.audience === "object" ? body.audience : {};
  const message = String(body.message || "").trim().slice(0, 4096);
  const imageUrl = String(body.image_url || "").trim();
  const schedule = body.schedule && typeof body.schedule === "object" ? body.schedule : { type: "now" };
  const skipAlreadyContacted = body.skip_already_contacted !== false;
  const dedupWindowDays = Math.max(0, Math.min(90, Number(body.dedup_window_days) || 0));

  if(!name) return res.status(400).json({ ok:false, error: "اسم الحملة مطلوب" });
  if(!message) return res.status(400).json({ ok:false, error: "نص الرسالة مطلوب" });
  if(!AUDIENCE_TYPES.find(a => a.key === audience.type)){
    return res.status(400).json({ ok:false, error: "نوع الـ audience غير معروف" });
  }
  if(!SCHEDULE_TYPES.includes(schedule.type)){
    return res.status(400).json({ ok:false, error: "نوع الجدولة غير معروف" });
  }
  if(schedule.type === "once" && !schedule.run_at){
    return res.status(400).json({ ok:false, error: "تاريخ التشغيل (run_at) مطلوب لـ schedule once" });
  }

  const now = new Date().toISOString();
  const status = schedule.type === "now" ? "draft" : "scheduled";
  const campaign = {
    id: genCampaignId(),
    name,
    audience: {
      type: audience.type,
      min_delivered: audience.min_delivered ? Number(audience.min_delivered) : undefined,
      max_delivered: audience.max_delivered ? Number(audience.max_delivered) : undefined,
      max_age_days: audience.max_age_days ? Number(audience.max_age_days) : undefined,
      custom_ids: Array.isArray(audience.custom_ids) ? audience.custom_ids.slice(0, 1000) : undefined,
    },
    message,
    image_url: imageUrl,
    schedule: {
      type: schedule.type,
      run_at: schedule.run_at || null,
      cron: schedule.cron || null,
      cron_human: schedule.cron_human || null,
      end_at: schedule.end_at || null,
    },
    skip_already_contacted: skipAlreadyContacted,
    dedup_window_days: dedupWindowDays,
    status,
    stats: { total_targets: 0, sent: 0, failed: 0, last_run_at: null },
    created_at: now,
    updated_at: now,
    created_by: auth.email || auth.uid,
  };

  /* Compute audience size as a preview */
  let audienceSize = 0;
  try {
    const db = getDb();
    const cfgSnap = await db.collection("factory").doc("config").get();
    const cfg = cfgSnap.exists ? (cfgSnap.data() || {}) : {};
    const list = await buildAudience(cfg, campaign.audience);
    audienceSize = list.length;
    campaign.stats.total_targets = audienceSize;
    await addCampaign(cfg, campaign);
  } catch(e){
    return res.status(500).json({ ok:false, error: "تعذر إنشاء الحملة: " + e.message });
  }

  return res.status(200).json({
    ok: true,
    campaign,
    audience_size: audienceSize,
  });
}
