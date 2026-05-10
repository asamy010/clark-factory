/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/bosta/configure (V20.1 Phase 9)
   ───────────────────────────────────────────────────────────────
   Save / update Bosta integration settings under
   shopifyConfig.bosta_*. Generates a webhook secret on first
   configuration so the user can paste the full URL into Bosta.

   Body: {
     enabled?: bool,
     api_key?: string,         (Bosta API key for outbound calls)
     business_id?: string,     (optional — for refs)
     auto_mark_delivered?: bool,
     auto_mark_refused?: bool,
     regenerate_secret?: bool, (force a new webhook secret)
     clear?: bool,             (wipe all bosta config)
   }
   Auth: admin

   Returns: { ok, settings, webhookUrl }
   The webhook secret is returned ONCE here — copy + paste it into
   Bosta dashboard's webhook URL config. After that, only the URL
   is stored; the secret is server-side only.
   ═══════════════════════════════════════════════════════════════ */

import crypto from "crypto";
import { getDb, setCors, verifyAdminToken } from "../_firebase.js";

function genSecret(){
  return crypto.randomBytes(20).toString("base64url");
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

  try {
    const db = getDb();
    const cfgRef = db.collection("factory").doc("config");
    let resultSettings = null;
    let resultSecret = null;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(cfgRef);
      const cfg = snap.exists ? (snap.data() || {}) : {};
      const sc = cfg.shopifyConfig || {};

      if(body.clear){
        const cleared = { ...sc };
        delete cleared.bosta_enabled;
        delete cleared.bosta_api_key;
        delete cleared.bosta_business_id;
        delete cleared.bosta_auto_mark_delivered;
        delete cleared.bosta_auto_mark_refused;
        delete cleared.bosta_webhook_secret_set_at;
        tx.set(cfgRef, { shopifyConfig: cleared }, { merge: true });
        resultSettings = { cleared: true };
        return;
      }

      const updates = { ...sc };
      if(typeof body.enabled === "boolean") updates.bosta_enabled = body.enabled;
      if(typeof body.api_key === "string" && body.api_key.trim()) updates.bosta_api_key = body.api_key.trim();
      if(typeof body.business_id === "string") updates.bosta_business_id = body.business_id.trim();
      if(typeof body.auto_mark_delivered === "boolean") updates.bosta_auto_mark_delivered = body.auto_mark_delivered;
      if(typeof body.auto_mark_refused === "boolean") updates.bosta_auto_mark_refused = body.auto_mark_refused;

      /* Webhook secret: stored in env (BOSTA_WEBHOOK_SECRET) — we can't
         change env from the API. Instead, we just track WHETHER one is
         configured and WHEN it was last rotated. The actual rotation
         happens manually in Vercel env vars. */
      if(body.regenerate_secret){
        /* Generate a new secret to display ONCE — user pastes it in:
           1. Vercel env: BOSTA_WEBHOOK_SECRET
           2. Bosta dashboard webhook URL: ?token=<this>
           Then they save the env var in Vercel. */
        resultSecret = genSecret();
        updates.bosta_webhook_secret_generated_at = new Date().toISOString();
        updates.bosta_webhook_secret_generated_by = auth.email || auth.uid;
      }

      tx.set(cfgRef, { shopifyConfig: updates }, { merge: true });
      resultSettings = updates;
    });

    /* Build the webhook URL the user should paste in Bosta */
    const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0];
    const host = req.headers.host || "";
    const baseOverride = (process.env.SHOPIFY_APP_BASE_URL || "").trim().replace(/\/+$/, "");
    const base = baseOverride || (proto + "://" + host);
    const webhookUrlBase = base + "/api/bosta/webhook";
    const hasEnvSecret = !!(process.env.BOSTA_WEBHOOK_SECRET || "").trim();

    return res.status(200).json({
      ok: true,
      settings: resultSettings,
      webhookUrlBase,
      webhookUrlExample: hasEnvSecret
        ? `${webhookUrlBase}?token=<your-secret-from-vercel-env>`
        : `${webhookUrlBase}?token=<NEEDS_SETUP>`,
      hasWebhookSecretSet: hasEnvSecret,
      ...(resultSecret ? {
        generatedSecret: resultSecret,
        webhookUrl: `${webhookUrlBase}?token=${resultSecret}`,
        instructions: [
          "1. اتنسخ الـ secret ده دلوقتي — مش هـ يظهر تاني",
          "2. روح Vercel → Settings → Environment Variables",
          "3. أضف BOSTA_WEBHOOK_SECRET = <هذا الـ secret>",
          "4. روح Bosta dashboard → Add Webhook URL",
          "5. الصق الـ URL الكامل (مع ?token=)",
          "6. Save في الجانبين",
        ],
      } : {}),
    });
  } catch(e){
    return res.status(500).json({ ok:false, error: e.message });
  }
}
