/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/shopify/campaign-prepare-run (V21.9.8)
   ───────────────────────────────────────────────────────────────
   Prepare the per-customer messages for a campaign — does NOT
   actually send (WhatsApp can't be sent server-side without WA
   Business API). Returns the list of (phone, message, wa_url)
   tuples for the client to open in WhatsApp Web tabs.

   Body: { id }   — campaign id
   Returns: {
     ok, campaign,
     audience: [{ id, name, phone, message, wa_url }],
     skipped: [{ id, reason }],
   }
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";
import {
  readCampaignById, updateCampaign, buildAudience, dedupAudience, renderMessage,
  addCampaignRun, genRunId,
} from "./_campaigns.js";

function buildWaUrl(phone, text){
  const digits = String(phone || "").replace(/[^0-9]/g, "");
  if(!digits || digits.length < 10) return null;
  return "https://wa.me/" + digits + (text ? "?text=" + encodeURIComponent(text) : "");
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
  const campaignId = String(body.id || "").trim();
  if(!campaignId) return res.status(400).json({ ok:false, error: "id مطلوب" });

  try {
    const db = getDb();
    const cfgSnap = await db.collection("factory").doc("config").get();
    const cfg = cfgSnap.exists ? (cfgSnap.data() || {}) : {};
    const campaign = await readCampaignById(cfg, campaignId);
    if(!campaign) return res.status(404).json({ ok:false, error: "الحملة مش موجودة" });

    /* Build the audience */
    const audience = await buildAudience(cfg, campaign.audience);

    /* Dedup if requested */
    let fresh = audience;
    let skipped = [];
    if(campaign.skip_already_contacted){
      /* V21.9.55: pass getDb so dedupAudience can also check whatsappCampaignRuns
         (not just the customer's last_contacted_at field). Closes the gap where
         same campaign on day 1 + day 5 hit the same recipients. */
      const dedup = await dedupAudience(cfg, audience, campaign.dedup_window_days, getDb);
      fresh = dedup.fresh;
      skipped = dedup.skipped.map(c => ({ id: c.id, name: c.name, phone: c.phone, reason: "متواصل قبل كده" }));
    }

    /* Render per-customer */
    const now = new Date().toISOString();
    const prepared = [];
    for(const c of fresh){
      const text = renderMessage(campaign.message, c) +
        (campaign.image_url ? "\n\n📸 " + campaign.image_url : "");
      const waUrl = buildWaUrl(c.phone, text);
      if(!waUrl){
        skipped.push({ id: c.id, name: c.name, phone: c.phone, reason: "تليفون غير صالح" });
        continue;
      }
      const runEntry = {
        id: genRunId(),
        campaign_id: campaign.id,
        customer_id: c.id || "",
        phone: c.phone,
        name: c.name || "",
        message: text,
        wa_url: waUrl,
        status: "queued",
        queued_at: now,
      };
      prepared.push(runEntry);
      /* Persist the run entry — best-effort, non-blocking */
      try { await addCampaignRun(cfg, runEntry); } catch(_){}
    }

    /* Update campaign stats + status */
    const updatedCampaign = await updateCampaign(cfg, campaign.id, {
      status: "running",
      stats: {
        ...(campaign.stats || {}),
        total_targets: audience.length,
        prepared_count: prepared.length,
        skipped_count: skipped.length,
        last_run_at: now,
        last_run_by: auth.email || auth.uid,
      },
    });

    return res.status(200).json({
      ok: true,
      campaign: updatedCampaign,
      audience: prepared,
      skipped,
      summary: {
        total: audience.length,
        prepared: prepared.length,
        skipped: skipped.length,
      },
    });
  } catch(e){
    return res.status(500).json({ ok:false, error: e.message });
  }
}
