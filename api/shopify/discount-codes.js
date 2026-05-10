/* ═══════════════════════════════════════════════════════════════
   CLARK — POST /api/shopify/discount-codes (V21.2 Phase 10c)
   ───────────────────────────────────────────────────────────────
   Multi-action endpoint for managing Shopify discount codes.

   Body:
     { action: "list" }
     { action: "sync" }                      — list + save to factory/config.shopifyDiscountCodes
     { action: "create", code, type, value, usage_limit?, ends_at?, starts_at? }
     { action: "delete", priceRuleId }

   Auth: admin

   Shopify model:
   - PriceRule = the discount itself (10% off, $5 off, etc.)
   - DiscountCode = a usable code attached to a PriceRule

   For simplicity this endpoint creates a 1:1 PriceRule + DiscountCode
   per "code" the user makes — the simplest mental model.
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";
import { getShopifyCreds, shopifyFetch } from "./_shopifyAdmin.js";

async function listAllPriceRulesWithCodes(creds){
  /* Fetch all price rules then their codes */
  const r = await shopifyFetch(creds, "/price_rules.json?limit=250");
  const rules = (r.data && Array.isArray(r.data.price_rules)) ? r.data.price_rules : [];
  /* Fetch codes for each rule (could be slow for many rules — Shopify
     doesn't have a bulk codes endpoint). We rate-limit via shopifyFetch. */
  const enriched = [];
  for(const rule of rules){
    try {
      const cr = await shopifyFetch(creds, "/price_rules/" + rule.id + "/discount_codes.json");
      const codes = (cr.data && Array.isArray(cr.data.discount_codes)) ? cr.data.discount_codes : [];
      enriched.push({ rule, codes });
    } catch(_){
      enriched.push({ rule, codes: [] });
    }
  }
  return enriched;
}

function flatten(rulesWithCodes){
  const out = [];
  for(const { rule, codes } of rulesWithCodes){
    for(const code of codes){
      out.push({
        price_rule_id: String(rule.id),
        discount_code_id: String(code.id),
        code: code.code,
        title: rule.title || code.code,
        value_type: rule.value_type, /* "percentage" | "fixed_amount" */
        value: Math.abs(Number(rule.value)) || 0,
        target_type: rule.target_type, /* "line_item" | "shipping_line" */
        target_selection: rule.target_selection, /* "all" | "entitled" */
        allocation_method: rule.allocation_method, /* "across" | "each" */
        usage_limit: rule.usage_limit,
        once_per_customer: rule.once_per_customer,
        usage_count: code.usage_count || 0,
        starts_at: rule.starts_at,
        ends_at: rule.ends_at,
        created_at: rule.created_at,
        updated_at: rule.updated_at,
      });
    }
  }
  return out;
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
  const action = String(body.action || "").trim();

  const creds = await getShopifyCreds();
  if(!creds){
    return res.status(400).json({ ok:false, error: "Shopify creds مش معدّة" });
  }

  try {
    if(action === "list" || action === "sync"){
      const rulesWithCodes = await listAllPriceRulesWithCodes(creds);
      const flat = flatten(rulesWithCodes);
      if(action === "sync"){
        const db = getDb();
        const cfgRef = db.collection("factory").doc("config");
        await cfgRef.set({
          shopifyDiscountCodes: flat,
          shopifyConfig: {
            last_discount_codes_sync_at: new Date().toISOString(),
          },
        }, { merge: true });
      }
      return res.status(200).json({ ok: true, count: flat.length, codes: flat });
    }

    if(action === "create"){
      const code = String(body.code || "").trim().toUpperCase();
      const type = body.type === "fixed_amount" ? "fixed_amount" : "percentage";
      let value = Number(body.value);
      if(!code || !Number.isFinite(value) || value <= 0){
        return res.status(400).json({ ok:false, error: "code + value (>0) مطلوبين" });
      }
      /* Shopify needs negative value for discount */
      const valueForShopify = type === "percentage" ? -Math.abs(value) : -Math.abs(value);
      const rulePayload = {
        price_rule: {
          title: code,
          target_type: "line_item",
          target_selection: "all",
          allocation_method: "across",
          value_type: type,
          value: String(valueForShopify),
          customer_selection: "all",
          starts_at: body.starts_at || new Date().toISOString(),
          ends_at: body.ends_at || null,
          usage_limit: body.usage_limit ? Number(body.usage_limit) : null,
          once_per_customer: body.once_per_customer === true,
        },
      };
      const ruleResp = await shopifyFetch(creds, "/price_rules.json", { method: "POST", body: rulePayload });
      const rule = ruleResp.data?.price_rule;
      if(!rule){ throw new Error("Shopify ما رجّعش price_rule"); }
      const codeResp = await shopifyFetch(creds, "/price_rules/" + rule.id + "/discount_codes.json", {
        method: "POST",
        body: { discount_code: { code } },
      });
      const dc = codeResp.data?.discount_code;
      if(!dc){ throw new Error("Shopify ما رجّعش discount_code"); }
      return res.status(200).json({
        ok: true,
        action: "created",
        price_rule_id: String(rule.id),
        discount_code_id: String(dc.id),
        code: dc.code,
      });
    }

    if(action === "delete"){
      const priceRuleId = String(body.priceRuleId || "").trim();
      if(!priceRuleId){
        return res.status(400).json({ ok:false, error: "priceRuleId مطلوب" });
      }
      /* Deleting the price rule auto-deletes its discount codes */
      await shopifyFetch(creds, "/price_rules/" + priceRuleId + ".json", { method: "DELETE" });
      /* Remove from local cache */
      const db = getDb();
      const cfgRef = db.collection("factory").doc("config");
      const snap = await cfgRef.get();
      const cfg = snap.exists ? (snap.data() || {}) : {};
      const list = Array.isArray(cfg.shopifyDiscountCodes) ? cfg.shopifyDiscountCodes : [];
      const next = list.filter(c => String(c.price_rule_id) !== priceRuleId);
      await cfgRef.set({ shopifyDiscountCodes: next }, { merge: true });
      return res.status(200).json({ ok: true, action: "deleted" });
    }

    return res.status(400).json({ ok:false, error: "action غير معروف" });
  } catch(e){
    return res.status(500).json({ ok:false, error: e.message });
  }
}
