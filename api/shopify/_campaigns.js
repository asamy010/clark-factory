/* ═══════════════════════════════════════════════════════════════
   CLARK — WhatsApp Campaigns helpers (V21.9.8)
   ───────────────────────────────────────────────────────────────
   Schema:

   whatsappCampaigns (template + targeting + schedule):
   {
     id: "wc_<ts>_<rand>",
     name: "Welcome new buyers",
     audience: {
       type: "purchased" | "not_purchased" | "abandoned_cart"
           | "shopify_only" | "vip" | "at_risk" | "custom",
       /* type-specific filters */
       min_delivered?: number,    // for purchased
       max_delivered?: number,
       max_age_days?: number,     // last activity within N days
       custom_ids?: string[],     // for custom audiences
     },
     message: "أهلاً {name} 👋 ...",
     image_url: "https://...",  // optional
     schedule: {
       type: "now" | "once" | "recurring",
       run_at: "ISO timestamp",   // for once
       cron?: "0 9 * * 1",        // for recurring (Monday 9 AM)
       cron_human?: "أسبوعياً يوم الإثنين 9 ص",
       end_at?: "ISO",            // optional stop date for recurring
     },
     skip_already_contacted: true,   // dedup
     dedup_window_days: 7,           // don't re-message within X days
     status: "draft" | "scheduled" | "running" | "paused" | "completed" | "cancelled",
     stats: { total_targets: 0, sent: 0, failed: 0, last_run_at: null },
     created_at, updated_at, created_by,
   }

   whatsappCampaignRuns (per-customer message log):
   {
     id: "wcr_<ts>_<rand>",
     campaign_id: "wc_...",
     customer_id, phone, name,
     message,                      // rendered text
     status: "queued" | "opened" | "failed",
     wa_url,                       // the wa.me URL
     queued_at, opened_at?, error?,
   }
   ═══════════════════════════════════════════════════════════════ */

import { getDb } from "../_firebase.js";

export const AUDIENCE_TYPES = [
  { key: "purchased",       label_ar: "اللي اشتروا (delivered ≥ 1)" },
  { key: "not_purchased",   label_ar: "اللي طلبوا وما اشتروش (refused/cancelled)" },
  { key: "abandoned_cart",  label_ar: "السلال المهجورة (مترددين)" },
  { key: "shopify_only",    label_ar: "مسجلين في Shopify (لسه ما طلبوش)" },
  { key: "vip",             label_ar: "VIP فقط" },
  { key: "at_risk",         label_ar: "بحاجة لمتابعة (at-risk)" },
  { key: "custom",          label_ar: "اختيار يدوي" },
];

export const SCHEDULE_TYPES = ["now", "once", "recurring"];
export const CAMPAIGN_STATUSES = [
  "draft", "scheduled", "running", "paused", "completed", "cancelled",
];

const SPLIT_FLAG = "_splitDaysV2198Done";
const CAMPAIGNS_COLLECTION = "whatsappCampaignsDays";
const RUNS_COLLECTION = "whatsappCampaignRunsDays";

export function genCampaignId(){
  return "wc_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}
export function genRunId(){
  return "wcr_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

function dayKey(iso){
  const d = new Date(iso || Date.now());
  if(isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/* Read all campaigns. Sorted newest-first. */
export async function readAllCampaigns(cfg){
  if(cfg && cfg[SPLIT_FLAG]){
    const db = getDb();
    const snap = await db.collection(CAMPAIGNS_COLLECTION).get();
    const all = [];
    snap.forEach(d => {
      const data = d.data() || {};
      const entries = Array.isArray(data.entries) ? data.entries : [];
      for(const e of entries) all.push(e);
    });
    all.sort((a, b) => {
      const ta = a?.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b?.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });
    return all;
  }
  return Array.isArray(cfg?.whatsappCampaigns) ? cfg.whatsappCampaigns : [];
}

export async function readCampaignById(cfg, id){
  if(!id) return null;
  const all = await readAllCampaigns(cfg);
  return all.find(c => c.id === id) || null;
}

export async function addCampaign(cfg, entry){
  const db = getDb();
  if(cfg && cfg[SPLIT_FLAG]){
    const day = dayKey(entry.created_at);
    const ref = db.collection(CAMPAIGNS_COLLECTION).doc(day);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? (snap.data() || {}) : { date: day, entries: [] };
      const entries = Array.isArray(data.entries) ? data.entries.slice() : [];
      entries.unshift(entry);
      tx.set(ref, { ...data, date: day, entries, count: entries.length, updated_at: new Date().toISOString() }, { merge: true });
    });
    return;
  }
  const cfgRef = db.collection("factory").doc("config");
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(cfgRef);
    const c = snap.exists ? (snap.data() || {}) : {};
    const arr = Array.isArray(c.whatsappCampaigns) ? c.whatsappCampaigns.slice() : [];
    arr.unshift(entry);
    tx.set(cfgRef, { whatsappCampaigns: arr }, { merge: true });
  });
}

export async function updateCampaign(cfg, id, patch){
  if(!id) throw new Error("id required");
  const db = getDb();
  if(cfg && cfg[SPLIT_FLAG]){
    const snap = await db.collection(CAMPAIGNS_COLLECTION).get();
    let found = null;
    for(const d of snap.docs){
      const data = d.data() || {};
      const entries = Array.isArray(data.entries) ? data.entries : [];
      const idx = entries.findIndex(e => e.id === id);
      if(idx >= 0){ found = { ref: d.ref, data, idx }; break; }
    }
    if(!found) throw new Error("campaign not found: " + id);
    const updated = { ...found.data.entries[found.idx], ...patch, updated_at: new Date().toISOString() };
    const newEntries = found.data.entries.slice();
    newEntries[found.idx] = updated;
    await found.ref.set({ ...found.data, entries: newEntries, updated_at: new Date().toISOString() }, { merge: true });
    return updated;
  }
  const cfgRef = db.collection("factory").doc("config");
  let updated = null;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(cfgRef);
    const c = snap.exists ? (snap.data() || {}) : {};
    const arr = Array.isArray(c.whatsappCampaigns) ? c.whatsappCampaigns.slice() : [];
    const idx = arr.findIndex(r => r.id === id);
    if(idx < 0) throw new Error("campaign not found: " + id);
    arr[idx] = { ...arr[idx], ...patch, updated_at: new Date().toISOString() };
    updated = arr[idx];
    tx.set(cfgRef, { whatsappCampaigns: arr }, { merge: true });
  });
  return updated;
}

export async function addCampaignRun(cfg, runEntry){
  const db = getDb();
  if(cfg && cfg[SPLIT_FLAG]){
    const day = dayKey(runEntry.queued_at);
    const ref = db.collection(RUNS_COLLECTION).doc(day);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? (snap.data() || {}) : { date: day, entries: [] };
      const entries = Array.isArray(data.entries) ? data.entries.slice() : [];
      entries.unshift(runEntry);
      tx.set(ref, { ...data, date: day, entries, count: entries.length }, { merge: true });
    });
    return;
  }
  const cfgRef = db.collection("factory").doc("config");
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(cfgRef);
    const c = snap.exists ? (snap.data() || {}) : {};
    const arr = Array.isArray(c.whatsappCampaignRuns) ? c.whatsappCampaignRuns.slice() : [];
    arr.unshift(runEntry);
    tx.set(cfgRef, { whatsappCampaignRuns: arr.slice(0, 5000) }, { merge: true });
  });
}

/* Build the audience for a campaign by reading customers + applying filters.
   Returns array of customers (with phone, name) ready for messaging. */
export async function buildAudience(cfg, audience){
  if(!audience || !audience.type) return [];
  const type = audience.type;

  /* Helper: read all customers (handles partition flag) */
  const { readAllShopifyCustomers } = await import("./_partitioned.js");
  const customers = await readAllShopifyCustomers(cfg);

  /* Filter by type */
  let res;
  switch(type){
    case "purchased":
      res = customers.filter(c => Number(c.delivered_count) > 0);
      if(audience.min_delivered) res = res.filter(c => Number(c.delivered_count) >= audience.min_delivered);
      if(audience.max_delivered) res = res.filter(c => Number(c.delivered_count) <= audience.max_delivered);
      break;
    case "not_purchased":
      res = customers.filter(c =>
        (Number(c.orders_count) > 0) &&
        (Number(c.delivered_count) === 0) &&
        (Number(c.refused_count) > 0 || Number(c.cancelled_count) > 0)
      );
      break;
    case "abandoned_cart": {
      /* Pull from shopifyAbandonedCarts — these have phone+name */
      const carts = Array.isArray(cfg.shopifyAbandonedCarts) ? cfg.shopifyAbandonedCarts : [];
      res = carts
        .filter(c => c.phone && !c.recovered_at)
        .map(c => ({
          id: "cart_" + c.id,
          name: c.customer_name || "",
          phone: c.phone,
          accepts_marketing: true,
          contact_count: Number(c.contact_count) || 0,
          last_contacted_at: c.last_contacted_at || null,
          /* preserve cart-specific data for variable rendering */
          abandoned_checkout_url: c.abandoned_checkout_url,
          total: c.total_price,
        }));
      break;
    }
    case "shopify_only":
      res = customers.filter(c => c.tier === "shopify_only" || (c.source === "shopify_only"));
      break;
    case "vip":
      res = customers.filter(c => c.tier === "vip");
      break;
    case "at_risk":
      res = customers.filter(c => c.tier === "at_risk");
      break;
    case "custom":
      {
        const ids = new Set(Array.isArray(audience.custom_ids) ? audience.custom_ids : []);
        res = customers.filter(c => ids.has(c.id));
      }
      break;
    default:
      res = [];
  }

  /* Filter: must have phone */
  res = res.filter(c => !!c.phone);

  /* Filter: respect do_not_contact + accepts_marketing */
  res = res.filter(c => !c.do_not_contact && c.accepts_marketing !== false);

  /* Optional: max_age_days based on last activity */
  if(audience.max_age_days){
    const cutoff = Date.now() - audience.max_age_days * 86400000;
    res = res.filter(c => {
      const ts = c.last_delivered_at || c.last_order_at || c.shopify_updated_at || c.updated_at;
      if(!ts) return true;
      return new Date(ts).getTime() >= cutoff;
    });
  }

  return res;
}

/* Apply dedup based on previous campaign runs.
   Returns { fresh: [...], skipped: [...] } */
export async function dedupAudience(cfg, audience, dedupWindowDays){
  if(!dedupWindowDays || dedupWindowDays <= 0){
    return { fresh: audience, skipped: [] };
  }
  const cutoff = Date.now() - dedupWindowDays * 86400000;
  const fresh = [];
  const skipped = [];
  for(const c of audience){
    const lastContact = c.last_contacted_at ? new Date(c.last_contacted_at).getTime() : 0;
    if(lastContact >= cutoff) skipped.push(c);
    else fresh.push(c);
  }
  return { fresh, skipped };
}

/* Render message with customer-specific variables */
export function renderMessage(template, customer){
  return String(template || "")
    .replace(/\{name\}/g, customer?.name || "العميل")
    .replace(/\{phone\}/g, customer?.phone || "—")
    .replace(/\{order\}/g, customer?.shopify_order_number || customer?.order || "—")
    .replace(/\{total\}/g, customer?.total ? customer.total + " ج" : (customer?.total_revenue ? customer.total_revenue + " ج" : "—"))
    .replace(/\{discount\}/g, customer?.discount_code || "BACK10");
}
