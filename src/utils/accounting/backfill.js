/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · Backfill (Historical Posting)
   ───────────────────────────────────────────────────────────────────────
   Walks every existing CLARK operation and posts a journal entry for
   anything that doesn't already have one. Fully idempotent — running it
   twice produces the same result.

   This is invoked by the user from Accounting Settings → "ترحيل القيود
   الأثرية" after they:
   1. Seeded the Chart of Accounts.
   2. Reviewed/adjusted the auto-posting rules.
   3. Decided they want history posted (vs. starting clean from today).

   Operations covered (in order):
   - Confirmed customer deliveries (sales)
   - Customer returns
   - Customer payments (cash/transfer)
   - Customer checks (receivable)
   - Workshop receives (priced)
   - Workshop payments
   - HR logs (salary/bonus/advance)
   - Treasury transactions not covered by anything above

   Edge cases:
   - Sales with sellPrice=0 → skipped (logged as "no price")
   - Operations missing dates → use createdAt or today
   - Mapping errors (account code missing in CoA) → skipped & counted
   - Each post is wrapped in try/catch so one bad row doesn't stop the run
   ═══════════════════════════════════════════════════════════════════════ */

import { postEntry } from "./posting.js";
import {
  buildSaleEntry, buildSaleReturnEntry, buildCustomerPaymentEntry,
  buildCustomerCheckEntry, buildCheckCollectionEntry,
  buildWorkshopReceiveEntry, buildWorkshopPaymentEntry,
  buildHrEntry, buildTreasuryEntry,
  buildSaleCogsEntry, buildSaleReturnCogsEntry,
} from "./postingRules.js";
import { calcOrder } from "../orders.js";

/* Stats accumulator for the run — surfaces a useful summary in the UI. */
const _stats = () => ({
  posted: 0, skipped: 0, failed: 0,
  byType: {}, errors: [], skipReasons: {}
});
const _bump = (s, type) => { s.byType[type] = (s.byType[type]||0) + 1; };
const _skip = (s, type, reason) => {
  s.skipped += 1;
  s.skipReasons[reason] = (s.skipReasons[reason]||0) + 1;
};
const _fail = (s, type, err, ctx) => {
  s.failed += 1;
  s.errors.push({type, message: err.message||String(err), ctx});
  console.warn("[CLARK backfill] failed:", type, err.message, ctx);
};

/* Wrapped post call: catches errors, updates stats, returns boolean. */
async function _safePost(s, builder, type, args, createdBy){
  let entry;
  try {
    entry = builder(...args);
  } catch(e){
    _fail(s, type, e, {args:args.map(a => a?.id||a?.code||typeof a)});
    return false;
  }
  if(!entry){ _skip(s, type, "no-entry-for-input"); return false; }
  try {
    await postEntry({...entry, coa: args[args.length-2], createdBy});
    s.posted += 1;
    _bump(s, type);
    return true;
  } catch(e){
    _fail(s, type, e, {sourceId: entry.sourceId, narration: entry.narration});
    return false;
  }
}

/* The main run. `data` is the full CLARK config snapshot.
   `options.dryRun` to preview without writing.
   `options.onProgress(n,total,label)` for UI updates. */
export async function backfillAll(data, opts){
  const stats = _stats();
  const coa = data.coa||[];
  const rules = (data.accountingSettings||{}).rules;
  const catMap = (data.accountingSettings||{}).categoryMap;
  const createdBy = opts?.createdBy || "backfill";
  const onProg = typeof opts?.onProgress === "function" ? opts.onProgress : () => {};

  /* If CoA is empty, abort early. */
  if(!Array.isArray(coa) || coa.length===0){
    return {...stats, aborted:true, reason:"شجرة الحسابات فارغة — استخدم 'شجرة افتراضية' أولاً"};
  }

  /* ── 1. Sales (confirmed customer deliveries) ── */
  const customers = data.customers||[];
  const orders = data.orders||[];
  const allTasks = [];
  /* V18.40 — COGS posting depends on cost source setting */
  const cogsEnabled = (data.accountingSettings||{}).cogsEnabled !== false;
  const cogsSource  = (data.accountingSettings||{}).cogsCostSource || "auto";
  const _resolveCost = (order) => {
    if(!cogsEnabled) return 0;
    const manual = Number(order.costPrice) || 0;
    let computed = 0;
    try { computed = Number(calcOrder(order)?.costPer) || 0; } catch(e){}
    if(cogsSource === "manual") return manual;
    if(cogsSource === "computed") return computed;
    return manual > 0 ? manual : computed;
  };

  orders.forEach(order => {
    const unitCost = _resolveCost(order);
    (order.customerDeliveries||[]).forEach((d, idx) => {
      /* Posting only confirmed deliveries; pending ones become entries when confirmed */
      if(!d.confirmedAt && !d.isAdjustment) return;
      const cust = customers.find(c => c.id === d.custId);
      if(!cust){ _skip(stats, "sale", "customer-not-found"); return; }
      d._key = d._key || `${order.id}:saleDelivery:${d.sessionId||""}:${d.custId}:${idx}`;
      allTasks.push({type:"sale", builder:buildSaleEntry, args:[d, cust, order, coa, rules]});
      /* V18.40 — companion COGS task (skipped silently if unitCost=0) */
      if(unitCost > 0){
        allTasks.push({type:"saleCogs", builder:buildSaleCogsEntry, args:[d, order, unitCost, coa, rules]});
      }
    });
    (order.customerReturns||[]).forEach((r, idx) => {
      const cust = customers.find(c => c.id === r.custId);
      if(!cust){ _skip(stats, "saleReturn", "customer-not-found"); return; }
      r._key = r._key || `${order.id}:saleReturn:${r.sessionId||""}:${r.custId}:${idx}`;
      allTasks.push({type:"saleReturn", builder:buildSaleReturnEntry, args:[r, cust, order, coa, rules]});
      if(unitCost > 0){
        allTasks.push({type:"saleReturnCogs", builder:buildSaleReturnCogsEntry, args:[r, order, unitCost, coa, rules]});
      }
    });
    /* Workshop receives */
    (order.workshopDeliveries||[]).forEach((wd, wdIdx) => {
      const ws = (data.workshops||[]).find(w => w.name===wd.wsName || w.id===wd.wsId);
      (wd.receives||[]).forEach((rcv, rIdx) => {
        rcv.id = rcv.id || `${order.id}:wsReceive:${wdIdx}:${rIdx}`;
        allTasks.push({type:"workshopReceive", builder:buildWorkshopReceiveEntry, args:[rcv, ws, order, wd, coa, rules]});
      });
    });
  });

  /* ── 2. Customer payments ── */
  /* V18.44: enrich payment with treasury account name (for per-treasury mapping).
     The payment might not have .account directly, but it's linked to a treasury tx
     via treasuryTxId or via custPaymentId on the tx. Look it up. */
  const _findTreasuryFor = (filter) => (data.treasury||[]).find(filter);
  (data.custPayments||[]).forEach(p => {
    const c = customers.find(x => x.id===p.custId);
    if(!c){ _skip(stats, "customerPay", "customer-not-found"); return; }
    const enriched = {...p};
    if(!enriched.account){
      const tx = _findTreasuryFor(t => t.id === p.treasuryTxId || t.custPaymentId === p.id);
      if(tx && tx.account) enriched.account = tx.account;
    }
    allTasks.push({type:"customerPay", builder:buildCustomerPaymentEntry, args:[enriched, c, coa, rules, data]});
  });

  /* ── 3. Receivable checks ── */
  (data.checks||[]).filter(c => c.type==="receivable").forEach(chk => {
    const cust = customers.find(x => x.id===chk.partyId);
    allTasks.push({type:"customerCheck", builder:buildCustomerCheckEntry, args:[chk, cust, coa, rules]});
    if(chk.status === "محصل"){
      const enrichedChk = {...chk};
      if(!enrichedChk.account){
        const tx = _findTreasuryFor(t => t.checkId === chk.id);
        if(tx && tx.account) enrichedChk.account = tx.account;
      }
      allTasks.push({type:"customerCheckCollect", builder:buildCheckCollectionEntry, args:[enrichedChk, coa, rules, data]});
    }
  });

  /* ── 4. Workshop payments ── */
  (data.wsPayments||[]).forEach(p => {
    const ws = (data.workshops||[]).find(w => w.name===p.wsName || w.id===p.wsId);
    const enriched = {...p};
    if(!enriched.account){
      const tx = _findTreasuryFor(t => t.id === p.treasuryTxId || t.wsPaymentId === p.id);
      if(tx && tx.account) enriched.account = tx.account;
    }
    allTasks.push({type:"workshopPay", builder:buildWorkshopPaymentEntry, args:[enriched, ws, coa, rules, data]});
  });

  /* ── 5. HR logs ── */
  (data.hrLog||[]).forEach(log => {
    const emp = (data.employees||[]).find(e => e.id===log.empId);
    const enriched = {...log};
    if(!enriched.account){
      const tx = _findTreasuryFor(t => t.id === log.treasuryTxId || t.hrLogId === log.id);
      if(tx && tx.account) enriched.account = tx.account;
    }
    allTasks.push({type:"hr", builder:buildHrEntry, args:[enriched, emp, coa, rules, data]});
  });

  /* ── 6. Generic treasury (catch-all for anything not auto-linked) ── */
  (data.treasury||[]).forEach(tx => {
    /* Skip transactions that already have a linked source — those are already
       handled by 1-5 above. We only want orphan/manual treasury rows here. */
    if(tx.sourceType && tx.sourceType !== "manual") return;
    if(tx.custPaymentId || tx.wsPaymentId || tx.hrLogId || tx.checkId) return;
    allTasks.push({type:"treasury", builder:buildTreasuryEntry, args:[tx, coa, rules, catMap, data]});
  });

  /* Execute serially — Firestore transactions on the same day-doc need to
     queue, so concurrency would just fight itself. */
  const total = allTasks.length;
  let i = 0;
  for(const t of allTasks){
    if(opts?.dryRun){
      try {
        const e = t.builder(...t.args);
        if(e) _bump(stats, t.type), stats.posted++;
        else  _skip(stats, t.type, "no-entry-for-input");
      } catch(e){ _fail(stats, t.type, e, {}); }
    } else {
      await _safePost(stats, t.builder, t.type, t.args, createdBy);
    }
    i++;
    if(i % 25 === 0) onProg(i, total, "ترحيل العمليات...");
  }
  onProg(total, total, "اكتمل");
  return stats;
}
