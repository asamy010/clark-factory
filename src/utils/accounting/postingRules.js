/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · Auto-Posting Rules
   ───────────────────────────────────────────────────────────────────────
   Maps every CLARK operation type to a balanced journal entry, using the
   account codes configured in data.accountingSettings.rules (which fall
   back to DEFAULT_POSTING_RULES if unset).

   Public API per operation:
     buildSaleEntry(orderDelivery, customer, order, coa, rules)         → entry
     buildSaleReturnEntry(returnRecord, customer, order, coa, rules)    → entry
     buildSaleCogsEntry(orderDelivery, order, coa, rules)               → entry|null  (V18.40)
     buildSaleReturnCogsEntry(returnRecord, order, coa, rules)          → entry|null  (V18.40)
     buildCustomerPaymentEntry(payment, customer, coa, rules)           → entry
     buildCustomerCheckEntry(check, customer, coa, rules)               → entry
     buildWorkshopReceiveEntry(receive, ws, order, wd, coa, rules)      → entry
     buildWorkshopPaymentEntry(payment, ws, coa, rules)                 → entry
     buildHrEntry(hrLog, employee, coa, rules)                          → entry|null
     buildTreasuryEntry(tx, coa, rules)                                 → entry|null

   Each builder is PURE (no I/O) and returns either:
     { date, sourceType, sourceId, narration, lines, partyHint } — ready to
       feed into postEntry()
     OR null if the operation should not produce an entry (e.g. zero-value
       sale, missing mapping). The caller should check & log.
   ═══════════════════════════════════════════════════════════════════════ */

import { getAccountByCode } from "./coa.js";
import { DEFAULT_POSTING_RULES, DEFAULT_CATEGORY_MAP } from "./coaDefaults.js";
import { resolveTreasuryAccountByName, FALLBACK_CASH_CODE, FALLBACK_BANK_CODE } from "./treasuryMapping.js";
import { calcOrder } from "../orders.js";

/* V21.9.87 (Accounting audit Bug #2 + #4): local copy of resolveUnitCost
   to avoid the circular import autoPost.js → postingRules.js → autoPost.js.
   Keep this LOGIC IDENTICAL to autoPost.js:resolveUnitCost. If you change
   one, change the other. */
function _resolveUnitCost(order, config){
  if(!order) return 0;
  const source = (config?.accountingSettings?.cogsCostSource) || "auto";
  const manual = Number(order.costPrice) || 0;
  let computed = 0;
  try {
    const calc = calcOrder(order);
    computed = Number(calc?.costPer) || 0;
  } catch(e){ computed = 0; }
  if(source === "manual") return manual;
  if(source === "computed") return computed;
  return manual > 0 ? manual : computed;
}

/* Resolve rules with fallback to defaults. The user may override individual
   account codes — anything missing falls back to defaults. */
export function resolveRules(userRules){
  const out = {};
  Object.keys(DEFAULT_POSTING_RULES).forEach(k => {
    out[k] = {...DEFAULT_POSTING_RULES[k], ...((userRules||{})[k]||{})};
  });
  return out;
}

export function resolveCategoryMap(userMap){
  return {...DEFAULT_CATEGORY_MAP, ...(userMap||{})};
}

/* Helper: resolve a code → leaf account.
   Throws an *informative* error so the UI can show "configure your settings". */
function ensureLeaf(coa, code, label){
  const acct = getAccountByCode(coa, code);
  if(!acct) throw new Error(`حساب "${label}" برقم ${code} غير موجود في شجرة الحسابات — راجع إعدادات المحاسبة`);
  if(!acct.isLeaf) throw new Error(`حساب "${label}" (${code}) ليس حساباً فرعياً — لا يقبل ترحيلاً`);
  return acct;
}

const _r2 = (n) => Math.round((Number(n)||0)*100)/100;

/* ───────────────── 1. SALES ───────────────── */

/* A confirmed customer delivery → revenue + receivable.
   Discount is recognized as contra-revenue. We expect:
     delivery: {qty, price, date, sessionId, custId, _key:"orderId:idx"}
     order:    the parent order (for sellPrice fallback + modelNo for narration)
     customer: full customer object  */
export function buildSaleEntry(delivery, customer, order, coa, rules){
  const r = resolveRules(rules);
  const qty = Number(delivery.qty)||0;
  const price = Number(delivery.price)||Number(order.sellPrice)||0;
  const gross = _r2(qty*price);
  if(gross<=0 || qty<=0) return null;

  const discPct = Number(customer.discount)||0;
  const disc = _r2(gross * discPct/100);
  const net = _r2(gross - disc);

  const ar = ensureLeaf(coa, r.sale.customerAccount, "العملاء");
  const rv = ensureLeaf(coa, r.sale.revenueAccount,  "إيرادات المبيعات");
  const date = delivery.date || delivery.createdAt || new Date().toISOString().split("T")[0];

  const lines = [
    {accountId:ar.id, accountCode:ar.code, accountName:ar.name, debit:net, credit:0,
     partyId:customer.id, partyName:customer.name, note:`فاتورة ${order.modelNo||""}`},
    {accountId:rv.id, accountCode:rv.code, accountName:rv.name, debit:0, credit:gross,
     note:`بيع ${qty} قطعة × ${price}`},
  ];
  if(disc>0){
    const dc = ensureLeaf(coa, r.sale.discountAccount, "الخصم المسموح به");
    lines.push({accountId:dc.id, accountCode:dc.code, accountName:dc.name, debit:disc, credit:0,
                partyId:customer.id, partyName:customer.name, note:`خصم ${discPct}%`});
  }

  return {
    date,
    sourceType:"sale",
    sourceId: delivery._key || `${order.id}:saleDelivery:${delivery.sessionId||""}:${delivery.custId}:${date}`,
    narration: `بيع ${qty} قطعة من ${order.modelNo||""} للعميل ${customer.name}`,
    lines,
    partyHint: {kind:"customer", id:customer.id, name:customer.name},
  };
}

/* ───────────────── 2. SALE RETURNS ───────────────── */

export function buildSaleReturnEntry(ret, customer, order, coa, rules){
  const r = resolveRules(rules);
  const qty = Number(ret.qty)||0;
  /* V19.66 FIX: read price from the return entry first, fall back to list price.
     Pre-V19.66 returns always credited AR at order.sellPrice. If the original sale
     was at a discounted/custom price (entry.price stored on the delivery), the
     return reversed at a higher list price → permanent debit drift on the
     customer's account. Now: ret.price (recorded at sale time for discount/free
     sales) takes priority. Falls through to order.sellPrice for legacy returns. */
  const price = Number(ret.price) || Number(order.sellPrice) || 0;
  const gross = _r2(qty*price);
  if(gross<=0||qty<=0) return null;

  const discPct = Number(customer.discount)||0;
  const net = _r2(gross * (1 - discPct/100));

  const ar = ensureLeaf(coa, r.saleReturn.customerAccount, "العملاء");
  const rt = ensureLeaf(coa, r.saleReturn.returnAccount,   "مرتجع المبيعات");
  const date = ret.date || ret.createdAt || new Date().toISOString().split("T")[0];

  return {
    date,
    sourceType:"saleReturn",
    sourceId: ret._key || `${order.id}:saleReturn:${ret.sessionId||""}:${ret.custId}:${date}`,
    narration: `مرتجع ${qty} قطعة من ${order.modelNo||""} من العميل ${customer.name}`,
    lines: [
      {accountId:rt.id, accountCode:rt.code, accountName:rt.name, debit:net, credit:0,
       note:`مرتجع ${qty} قطعة`},
      {accountId:ar.id, accountCode:ar.code, accountName:ar.name, debit:0, credit:net,
       partyId:customer.id, partyName:customer.name},
    ],
    partyHint: {kind:"customer", id:customer.id, name:customer.name},
  };
}

/* ───────────────── 2b. COGS ON SALE / SALE RETURN (V18.40) ─────────────────
   Per Standard Cost model: every sale shifts (qty × unitCost) from finished
   goods inventory to COGS expense. Returns reverse this.

   Unit cost source priority (configurable via rules.saleCogs.costSource):
     1. order.costPrice     (manual override on the order)
     2. order.unitCost      (alternate field name)
     3. computed costPer    (from calcOrder utility — fabric + accessories + ws)
     4. fallback to 0       (returns null entry — sale just won't have COGS)

   We DON'T import calcOrder() here to keep this file pure. Instead we accept
   `unitCost` as a 5th argument (resolved upstream by autoPost or backfill). */

export function buildSaleCogsEntry(delivery, order, unitCost, coa, rules){
  const r = resolveRules(rules);
  const qty = Number(delivery.qty)||0;
  const cost = _r2(unitCost);
  const totalCogs = _r2(qty * cost);
  if(totalCogs <= 0 || qty <= 0) return null;

  const cogs = ensureLeaf(coa, r.saleCogs.cogsAccount, "تكلفة البضاعة المباعة");
  const fin  = ensureLeaf(coa, r.saleCogs.finishedAccount, "مخزون منتج تام");
  const date = delivery.date || delivery.createdAt || new Date().toISOString().split("T")[0];
  /* Use a related-but-distinct sourceId so this entry is independent of the
     sale entry — they're posted/reversed/re-posted independently. */
  const baseId = delivery._key || `${order.id}:saleDelivery:${delivery.sessionId||""}:${delivery.custId}:${date}`;
  return {
    date,
    sourceType:"saleCogs",
    sourceId: baseId + ":cogs",
    narration: `تكلفة بضاعة مباعة — ${qty} قطعة × ${cost.toFixed(2)} = ${totalCogs.toFixed(2)} (${order.modelNo||""})`,
    lines: [
      {accountId:cogs.id, accountCode:cogs.code, accountName:cogs.name, debit:totalCogs, credit:0,
       note:`${qty} × ${cost.toFixed(2)}`},
      {accountId:fin.id,  accountCode:fin.code,  accountName:fin.name,  debit:0, credit:totalCogs,
       note:order.modelNo||""},
    ],
  };
}

export function buildSaleReturnCogsEntry(ret, order, unitCost, coa, rules){
  const r = resolveRules(rules);
  const qty = Number(ret.qty)||0;
  const cost = _r2(unitCost);
  const totalCogs = _r2(qty * cost);
  if(totalCogs <= 0 || qty <= 0) return null;

  const fin  = ensureLeaf(coa, r.saleReturnCogs.finishedAccount, "مخزون منتج تام");
  const cogs = ensureLeaf(coa, r.saleReturnCogs.cogsAccount, "تكلفة البضاعة المباعة");
  const date = ret.date || ret.createdAt || new Date().toISOString().split("T")[0];
  const baseId = ret._key || `${order.id}:saleReturn:${ret.sessionId||""}:${ret.custId}:${date}`;
  return {
    date,
    sourceType:"saleReturnCogs",
    sourceId: baseId + ":cogs",
    narration: `إعادة تكلفة بضاعة مرتجعة — ${qty} قطعة × ${cost.toFixed(2)} = ${totalCogs.toFixed(2)} (${order.modelNo||""})`,
    lines: [
      {accountId:fin.id,  accountCode:fin.code,  accountName:fin.name,  debit:totalCogs, credit:0,
       note:`مرتجع ${qty} قطعة × ${cost.toFixed(2)}`},
      {accountId:cogs.id, accountCode:cogs.code, accountName:cogs.name, debit:0, credit:totalCogs,
       note:order.modelNo||""},
    ],
  };
}

/* ───────────────── 3. CUSTOMER PAYMENTS ───────────────── */

export function buildCustomerPaymentEntry(payment, customer, coa, rules, config){
  const r = resolveRules(rules);
  const amt = _r2(payment.amount);
  if(amt<=0) return null;

  const m = (payment.method||"").toLowerCase();
  const isCheck = m.includes("شيك") || m.includes("check");
  const isTransfer = m.includes("تحويل") || m.includes("transfer") || m.includes("بنكي") || m.includes("محفظة");

  let dCode, dLabel;
  if(isCheck){
    /* Checks have a separate flow — not handled here */
    return null;
  } else if(isTransfer){
    /* V18.44: prefer per-treasury mapping if payment.account is set, else fallback */
    dCode = (payment.account && config) ? resolveTreasuryAccountByName(payment.account, config) : r.customerPayTransfer.bankAccount;
    dLabel = "البنك";
  } else {
    dCode = (payment.account && config) ? resolveTreasuryAccountByName(payment.account, config) : r.customerPayCash.cashAccount;
    dLabel = "الخزينة";
  }
  const dr = ensureLeaf(coa, dCode, dLabel);
  const ar = ensureLeaf(coa, r.customerPayCash.customerAccount, "العملاء");
  const date = payment.date || payment.createdAt || new Date().toISOString().split("T")[0];

  return {
    date,
    sourceType:"customerPay",
    sourceId: payment.id,
    narration: `دفعة من العميل ${customer.name} (${payment.method||"كاش"})${payment.account?" — "+payment.account:""}`,
    lines: [
      {accountId:dr.id, accountCode:dr.code, accountName:dr.name, debit:amt, credit:0},
      {accountId:ar.id, accountCode:ar.code, accountName:ar.name, debit:0, credit:amt,
       partyId:customer.id, partyName:customer.name, note: payment.note||""},
    ],
    partyHint: {kind:"customer", id:customer.id, name:customer.name},
  };
}

/* ───────────────── 4. CUSTOMER CHECKS ───────────────── */

/* When a check is RECEIVED from a customer (regardless of clearance):
     Dr شيكات تحت التحصيل / Cr عملاء  (decreases customer debt)
   Only categories that represent real customer payments produce entries.
   Status changes (collected/bounced) are handled by buildCheckStatusEntry. */
export function buildCustomerCheckEntry(check, customer, coa, rules){
  if(!check || check.type !== "receivable") return null;
  if((check.category||"دفعة عميل") !== "دفعة عميل") return null;
  const amt = _r2(check.amount);
  if(amt<=0) return null;

  const r = resolveRules(rules);
  const cr = ensureLeaf(coa, r.customerCheck.checksReceivableAccount, "شيكات تحت التحصيل");
  const ar = ensureLeaf(coa, r.customerCheck.customerAccount, "العملاء");
  const date = check.date || check.createdAt || new Date().toISOString().split("T")[0];

  return {
    date,
    sourceType:"customerCheck",
    sourceId: check.id,
    narration: `استلام شيك من ${customer ? customer.name : (check.party||"عميل")} — ${check.bank||""} #${check.checkNo||""}`,
    lines: [
      {accountId:cr.id, accountCode:cr.code, accountName:cr.name, debit:amt, credit:0,
       note: `شيك #${check.checkNo||""} ${check.bank||""}`},
      {accountId:ar.id, accountCode:ar.code, accountName:ar.name, debit:0, credit:amt,
       partyId: customer?.id||null, partyName: customer?.name||check.party||""},
    ],
    partyHint: customer ? {kind:"customer", id:customer.id, name:customer.name} : null,
  };
}

/* When a customer check is COLLECTED:  Dr الخزينة / Cr شيكات تحت التحصيل */
export function buildCheckCollectionEntry(check, coa, rules, config){
  if(!check || check.type !== "receivable" || check.status !== "محصل") return null;
  const amt = _r2(check.amount);
  if(amt<=0) return null;
  const r = resolveRules(rules);
  /* V18.44: respect treasury account on the check (where it was deposited) */
  const cashCode = (check.account && config) ? resolveTreasuryAccountByName(check.account, config) : r.customerCheckCollect.cashAccount;
  const ca = ensureLeaf(coa, cashCode, "الخزينة");
  const cr = ensureLeaf(coa, r.customerCheck.checksReceivableAccount, "شيكات تحت التحصيل");
  const date = check.collectedAt || check.dueDate || check.date || new Date().toISOString().split("T")[0];
  return {
    date,
    sourceType:"customerCheckCollect",
    sourceId: check.id,
    narration: `تحصيل شيك #${check.checkNo||""} ${check.bank||""}${check.account?" → "+check.account:""}`,
    lines: [
      {accountId:ca.id, accountCode:ca.code, accountName:ca.name, debit:amt, credit:0},
      {accountId:cr.id, accountCode:cr.code, accountName:cr.name, debit:0, credit:amt},
    ],
  };
}

/* ───────────────── 5. WORKSHOP RECEIVES ───────────────── */

/* When pieces are received from a workshop, recognize the labor cost as
   a transfer from WIP into finished goods (or as expense, per user choice).
   We use the receive's price (per-piece labor cost) × qty. */
export function buildWorkshopReceiveEntry(rcv, ws, order, wd, coa, rules){
  const r = resolveRules(rules);
  const qty = Number(rcv.qty)||0;
  const price = Number(rcv.price)||Number(wd.price)||0;
  const amount = _r2(qty*price);
  if(amount<=0||qty<=0) return null;

  const fa = ensureLeaf(coa, r.workshopReceive.finishedAccount, "مخزون منتج تام");
  const wp = ensureLeaf(coa, r.workshopReceive.wipAccount,      "مخزون تحت التشغيل");
  const date = rcv.date || rcv.createdAt || new Date().toISOString().split("T")[0];

  return {
    date,
    sourceType:"workshopReceive",
    sourceId: rcv.id || `${order.id}:wsReceive:${rcv.date}:${rcv.qty}`,
    narration: `استلام ${qty} قطعة من ${ws?.name||"ورشة"} — ${order.modelNo||""}`,
    lines: [
      {accountId:fa.id, accountCode:fa.code, accountName:fa.name, debit:amount, credit:0},
      {accountId:wp.id, accountCode:wp.code, accountName:wp.name, debit:0, credit:amount,
       partyId: ws?.id||null, partyName: ws?.name||""},
    ],
    partyHint: ws ? {kind:"workshop", id:ws.id, name:ws.name} : null,
  };
}

/* ───────────────── 6. WORKSHOP PAYMENTS ───────────────── */

export function buildWorkshopPaymentEntry(payment, ws, coa, rules, config){
  const r = resolveRules(rules);
  const amt = _r2(payment.amount);
  if(amt<=0) return null;
  const isPurchase = payment.type === "purchase";
  const drCode = isPurchase ? r.workshopPurchase.materialsAccount : r.workshopPay.workshopAccount;
  const drLabel = isPurchase ? "مخزون خامات" : "ورش خارجية";
  const dr = ensureLeaf(coa, drCode, drLabel);
  /* V18.44: per-treasury mapping if payment.account is set */
  const cashCode = (payment.account && config) ? resolveTreasuryAccountByName(payment.account, config) : r.workshopPay.cashAccount;
  const ca = ensureLeaf(coa, cashCode, "الخزينة");
  const date = payment.date || payment.createdAt || new Date().toISOString().split("T")[0];

  return {
    date,
    sourceType: isPurchase ? "workshopPurchase" : "workshopPay",
    sourceId: payment.id,
    narration: `${isPurchase?"مشتريات من":"دفعة لورشة"} ${ws?.name||payment.wsName||""}${payment.account?" — "+payment.account:""}`,
    lines: [
      {accountId:dr.id, accountCode:dr.code, accountName:dr.name, debit:amt, credit:0,
       partyId: ws?.id||null, partyName: ws?.name||payment.wsName||""},
      {accountId:ca.id, accountCode:ca.code, accountName:ca.name, debit:0, credit:amt,
       note: payment.notes||""},
    ],
    partyHint: ws ? {kind:"workshop", id:ws.id, name:ws.name} : null,
  };
}

/* ───────────────── 7. HR LOGS ───────────────── */

export function buildHrEntry(hrLog, employee, coa, rules, config){
  const r = resolveRules(rules);
  const amt = _r2(hrLog.amount);
  if(amt<=0) return null;
  const t = String(hrLog.type||"").toLowerCase();

  /* Map HR log types to a posting rule key */
  let ruleKey = null;
  if(t.includes("راتب") || t.includes("salary")) ruleKey = "hrSalary";
  else if(t.includes("سلف") || t.includes("advance")) ruleKey = "hrAdvance";
  else if(t.includes("مكاف") || t.includes("حافز") || t.includes("bonus")) ruleKey = "hrBonus";
  else return null;/* unknown HR type — skip */

  const drCode = ruleKey==="hrSalary" ? r.hrSalary.salaryAccount
              : ruleKey==="hrAdvance" ? r.hrAdvance.advanceAccount
              : r.hrBonus.bonusAccount;
  const drLabel = ruleKey==="hrSalary" ? "رواتب" : ruleKey==="hrAdvance" ? "سلف موظفين" : "مكافآت";
  const dr = ensureLeaf(coa, drCode, drLabel);
  /* V18.44: per-treasury mapping if hrLog.account is set */
  const cashCode = (hrLog.account && config) ? resolveTreasuryAccountByName(hrLog.account, config) : r.hrSalary.cashAccount;
  const ca = ensureLeaf(coa, cashCode, "الخزينة");
  const date = hrLog.date || hrLog.createdAt || new Date().toISOString().split("T")[0];

  return {
    date,
    sourceType: ruleKey,
    sourceId: hrLog.id,
    narration: `${hrLog.type} — ${employee?.name||""}`,
    lines: [
      {accountId:dr.id, accountCode:dr.code, accountName:dr.name, debit:amt, credit:0,
       partyId: employee?.id||null, partyName: employee?.name||""},
      {accountId:ca.id, accountCode:ca.code, accountName:ca.name, debit:0, credit:amt,
       note: hrLog.notes||""},
    ],
    partyHint: employee ? {kind:"employee", id:employee.id, name:employee.name} : null,
  };
}

/* ───────────────── 8. TREASURY (generic in/out) ───────────────── */

/* Generic catch-all for treasury transactions that aren't already covered
   by the more specific builders above. Uses the category map to route to
   the right expense/income account. */
export function buildTreasuryEntry(tx, coa, rules, categoryMap, config){
  /* V21.9.40: Pre-V21.9.40 this skipped EVERY entry with a sourceType (only "manual"
     was allowed through). That hid a class of treasury entries that DO need the generic
     treasury posting because they have no specific HR/workshop/customer handler:
       - hr_other_expense: weekly closure "weekly other expenses" — categorized
         expense, no specific handler in postingRules.js → must use buildTreasuryEntry.
       - hr_other_expense_supplier: the mirror supplier-payment ledger entry. The
         treasury leg should post via this generic builder; the AP side is handled
         separately via supplierPayments listings.
     Without this whitelist, every weekly_other_expense treasury entry created in
     approveWeek silently fell through with `return null` → no journal posting →
     trial balance permanently understated cash outflows. */
  /* V21.9.53: extend whitelist to include check_collect + check_pay.
     ROOT CAUSE (Treasury Audit #1-2): pre-V21.9.53, when user marks a check
     as "محصل" or "مدفوع" via TreasuryPg.updateStatus, a treasury entry is
     created with sourceType="check_collect" / "check_pay". buildTreasuryEntry
     would return null (whitelist exclusion) → no journal entry → Trial Balance
     Cash account understated/overstated. Same shape as V21.9.40's hr_other_expense
     fix. The actual posting uses the existing category-to-account mapping
     (دفعة عميل → AR, دفعة مورد → AP) which is exactly what we want. */
  const _genericSources = [
    "manual",
    "hr_other_expense", "hr_other_expense_supplier",
    "check_collect", "check_pay",
  ];
  if(tx.sourceType && !_genericSources.includes(tx.sourceType)) return null;
  const amt = _r2(tx.amount);
  if(amt<=0) return null;

  const cm = resolveCategoryMap(categoryMap);
  const code = cm[tx.category] || (tx.type==="in" ? "4900" : "5390");
  const r = resolveRules(rules);
  /* V18.44: tx.account is always the treasury name (e.g. "MAIN CASH"); resolve it */
  const cashCode = (tx.account && config) ? resolveTreasuryAccountByName(tx.account, config) : r.treasuryExpense.cashAccount;
  const ca = ensureLeaf(coa, cashCode, "الخزينة");
  const other = ensureLeaf(coa, code, tx.category||"غير مصنف");
  const date = tx.date || tx.createdAt || new Date().toISOString().split("T")[0];

  /* Direction: 'in' = cash increased, 'out' = cash decreased */
  const isIn = tx.type === "in";
  const lines = isIn ? [
    {accountId:ca.id,    accountCode:ca.code,    accountName:ca.name,    debit:amt, credit:0},
    {accountId:other.id, accountCode:other.code, accountName:other.name, debit:0,   credit:amt},
  ] : [
    {accountId:other.id, accountCode:other.code, accountName:other.name, debit:amt, credit:0},
    {accountId:ca.id,    accountCode:ca.code,    accountName:ca.name,    debit:0,   credit:amt},
  ];
  return {
    date,
    sourceType:"treasury",
    sourceId: tx.id,
    narration: tx.desc || tx.category || "حركة خزينة",
    lines,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   V18.50 — INVOICE-BASED POSTING
   ───────────────────────────────────────────────────────────────────────
   New entry builders that post journal entries from sales/purchase
   invoices instead of directly from deliveries/receipts. The auto-post
   flow now goes:
     1. delivery/receipt happens   → no journal entry
     2. invoice created (draft)    → no journal entry
     3. invoice posted (status)    → buildInvoicePostedEntry → entry
     4. invoice voided             → buildInvoiceVoidedEntry → reversal entry

   The invoice carries enough info to reconstruct the same journal lines
   that V18.35-V18.49's direct builders produced, but now sourced from a
   single user-controllable document.
   ═══════════════════════════════════════════════════════════════════════ */

/* Build a journal entry from a SALES invoice transitioning to "posted".
   Same accounting logic as buildSaleEntry but driven by invoice fields. */
export function buildSalesInvoicePostedEntry(invoice, customer, order, coa, rules){
  if(!invoice || invoice.status !== "posted") return null;
  const r = resolveRules(rules);
  /* Use invoice numbers (gross before discount = subtotal; net after = total) */
  const gross = _r2(Number(invoice.subtotal)||0);
  const disc  = _r2(Number(invoice.discount)||0);
  const net   = _r2(Number(invoice.total)||0);
  if(net <= 0 && gross <= 0) return null;

  const ar = ensureLeaf(coa, r.sale.customerAccount, "العملاء");
  const date = invoice.date || new Date().toISOString().split("T")[0];

  /* V18.85: For service invoices, group items by their per-line accountId.
     If a line has no accountId, fall back to the default revenue account. */
  const isService = invoice.subtype === "service";
  const lines = [
    {accountId:ar.id, accountCode:ar.code, accountName:ar.name, debit:net, credit:0,
     partyId:customer?.id||invoice.customerId, partyName:customer?.name||invoice.customerName,
     note:`فاتورة ${invoice.invoiceNo}`},
  ];

  if(isService){
    /* Group revenue lines by accountId. Each unique account gets its own credit line.
       Lines without accountId → fall back to default revenue account. */
    const fallbackRv = ensureLeaf(coa, r.sale.revenueAccount, "إيرادات المبيعات");
    const groups = new Map();
    (invoice.items||[]).forEach(it => {
      const key = it.accountId || fallbackRv.id;
      const cur = groups.get(key) || {accountId: key, total: 0, descs: []};
      cur.total += Number(it.lineTotal)||0;
      if(it.description) cur.descs.push(it.description);
      groups.set(key, cur);
    });
    for(const g of groups.values()){
      const acc = (coa||[]).find(a => a.id === g.accountId) || fallbackRv;
      const summary = g.descs.slice(0,2).join("، ") + (g.descs.length>2 ? ` و${g.descs.length-2} بنود أخرى` : "");
      lines.push({accountId:acc.id, accountCode:acc.code, accountName:acc.name, debit:0, credit:_r2(g.total),
                  note: summary || "خدمات"});
    }
  } else {
    const rv = ensureLeaf(coa, r.sale.revenueAccount,  "إيرادات المبيعات");
    /* Build human-friendly narration from invoice items */
    const itemSummary = (invoice.items||[]).slice(0,2).map(it =>
      `${it.qty} × ${it.modelNo||"—"}`).join("، ");
    const moreCount = Math.max(0, (invoice.items||[]).length - 2);
    const summary = itemSummary + (moreCount > 0 ? ` و${moreCount} أصناف أخرى` : "");
    lines.push({accountId:rv.id, accountCode:rv.code, accountName:rv.name, debit:0, credit:gross,
                note: summary});
  }
  if(disc > 0){
    const dc = ensureLeaf(coa, r.sale.discountAccount, "الخصم المسموح به");
    lines.push({accountId:dc.id, accountCode:dc.code, accountName:dc.name, debit:disc, credit:0,
                partyId:customer?.id||invoice.customerId, partyName:customer?.name||invoice.customerName,
                note:`خصم على فاتورة ${invoice.invoiceNo}`});
  }

  return {
    date,
    sourceType: "salesInvoice",
    sourceId: invoice.id,
    narration: (isService?"فاتورة خدمات ":"فاتورة مبيعات ")+invoice.invoiceNo+" للعميل "+(invoice.customerName||""),
    lines,
    partyHint: {kind:"customer", id:customer?.id||invoice.customerId, name:customer?.name||invoice.customerName},
  };
}

/* Build the COGS companion entry for a sales invoice posting.
   Mirrors buildSaleCogsEntry but driven by the invoice's items. */
export function buildSalesInvoiceCogsEntry(invoice, order, coa, rules, config){
  if(!invoice || invoice.status !== "posted") return null;
  if(!order) return null;
  /* Determine if COGS is enabled */
  const accSettings = (config||{}).accountingSettings||{};
  if(accSettings.cogsEnabled === false) return null;
  const r = resolveRules(rules);

  /* Compute total cost across all items using order's cost structure.
     For simple 1:1 invoice (one delivery → one invoice), items[0] is the
     row we care about. We use the order's per-piece cost.
     V21.9.87 (Accounting audit Bug #2): use _resolveUnitCost to honor
     accountingSettings.cogsCostSource ('manual'|'computed'|'auto'). Pre-
     V21.9.87 only manual costPrice was used → COGS=0 when 'computed' mode
     was set → Trial Balance imbalance vs the delivery flow that uses the
     computed cost. */
  const perPiece = _resolveUnitCost(order, config);
  let totalCost = 0;
  (invoice.items||[]).forEach(it => {
    const qty = Number(it.qty)||0;
    totalCost += qty * perPiece;
  });
  totalCost = _r2(totalCost);
  if(totalCost <= 0) return null;

  const cogs = ensureLeaf(coa, r.saleCogs?.cogsAccount || "5100", "تكلفة البضاعة المباعة");
  /* V21.9.87 (Accounting audit Bug #1): use finishedAccount (matching the
     delivery-path builder buildSaleCogsEntry:158). Pre-V21.9.87 this used
     a separate `inventoryAccount` key that didn't exist in the default
     rules → fallback "1320" was applied. The delivery path used
     finishedAccount, so the two flows credited different accounts. Now
     unified to finishedAccount. */
  const inv  = ensureLeaf(coa, r.saleCogs?.finishedAccount || "1320", "مخزون منتج تام");
  const date = invoice.date || new Date().toISOString().split("T")[0];

  return {
    date,
    sourceType: "salesInvoiceCogs",
    sourceId: invoice.id + "#cogs",
    narration: `تكلفة البضاعة المباعة — فاتورة ${invoice.invoiceNo}`,
    lines: [
      {accountId:cogs.id, accountCode:cogs.code, accountName:cogs.name, debit:totalCost, credit:0,
       note:`COGS فاتورة ${invoice.invoiceNo}`},
      {accountId:inv.id, accountCode:inv.code, accountName:inv.name, debit:0, credit:totalCost,
       note:`خروج بضاعة من المخزن`},
    ],
  };
}

/* Build a journal entry from a PURCHASE invoice transitioning to "posted".
   For purchases, the inventory is debited and accounts payable credited.
   Treasury-side movements (cash payments) are handled separately when
   payments are made — not at invoice posting time. */
export function buildPurchaseInvoicePostedEntry(invoice, supplier, coa, rules){
  if(!invoice || invoice.status !== "posted") return null;
  const r = resolveRules(rules);
  const total = _r2(Number(invoice.total)||0);
  if(total <= 0) return null;
  /* V21.9.54 (Audit Acct #2): use the configured purchaseInvoice rule's
     supplierAccount instead of the hardcoded "2110" so that user CoA
     overrides take effect. Mirrors the pattern in buildPurchaseReturnEntry
     (line 767) which already uses r.purchaseReturn.supplierAccount. */
  const ap     = ensureLeaf(coa, r.purchaseInvoice?.supplierAccount || "2110", "موردون خامات");
  const date = invoice.date || new Date().toISOString().split("T")[0];
  const isService = invoice.subtype === "service";

  /* V18.85: For service invoices, debit per-line accountId (expense accounts).
     Lines without accountId fall back to a generic مصاريف عمومية account.
     Inventory accounts are NOT touched for service invoices. */
  if(isService){
    const fallbackExp = ensureLeaf(coa, "5290", "مصروفات عمومية أخرى");
    const groups = new Map();
    (invoice.items||[]).forEach(it => {
      const key = it.accountId || fallbackExp.id;
      const cur = groups.get(key) || {accountId: key, total: 0, descs: []};
      cur.total += Number(it.lineTotal)||0;
      if(it.description) cur.descs.push(it.description);
      groups.set(key, cur);
    });
    /* V21.9.56 (Audit F3 CRITICAL FIX): journal entry was IMBALANCED for
       service purchase invoices with a discount.
       Pre-V21.9.56:
         debits = sum of lineTotal (= subtotal, BEFORE discount)
         credit = invoice.total (= subtotal − discount, AFTER discount)
         → debits ≠ credits when discount > 0 → Trial Balance broken.

       Fix: distribute the discount proportionally across the expense lines
       so the per-line debit = (group.total / subtotal) × invoice.total.
       This keeps the discount mathematically baked into the expense ledger
       (matches how Egyptian small businesses typically handle service-level
       discounts: a single net cost line per account). The AP credit stays
       at invoice.total, so the JE balances. */
    const lines = [];
    const subtotalBeforeDisc = _r2(Number(invoice.subtotal) || 0);
    const proportionFactor = subtotalBeforeDisc > 0 ? (total / subtotalBeforeDisc) : 1;
    for(const g of groups.values()){
      const acc = (coa||[]).find(a => a.id === g.accountId) || fallbackExp;
      const summary = g.descs.slice(0,2).join("، ") + (g.descs.length>2 ? ` و${g.descs.length-2} بنود أخرى` : "");
      lines.push({accountId:acc.id, accountCode:acc.code, accountName:acc.name,
                  debit: _r2(g.total * proportionFactor),/* V21.9.56: discounted */
                  credit: 0,
                  note: summary || "خدمات"});
    }
    /* Adjust the LAST debit line so the rounded debits sum exactly to total,
       compensating for fractional cents lost to per-line rounding. Without
       this, a 3-line invoice with discount 7.333% could leave a 0.01 EGP
       imbalance even after proportional distribution. */
    const sumDebits = _r2(lines.reduce((s,l) => s + (l.debit||0), 0));
    if (sumDebits !== total && lines.length > 0) {
      const last = lines[lines.length - 1];
      last.debit = _r2((last.debit||0) + (total - sumDebits));
    }
    lines.push({accountId:ap.id, accountCode:ap.code, accountName:ap.name, debit:0, credit:total,
                partyId:supplier?.id||invoice.supplierId, partyName:supplier?.name||invoice.supplierName,
                note:"فاتورة "+invoice.invoiceNo});
    return {
      date,
      sourceType: "purchaseInvoice",
      sourceId: invoice.id,
      narration: "فاتورة خدمات "+invoice.invoiceNo+" من "+(invoice.supplierName||""),
      lines,
      partyHint: {kind:"supplier", id:supplier?.id||invoice.supplierId, name:supplier?.name||invoice.supplierName},
    };
  }

  /* V21.9.54 (Audit Acct #4): simplified — both branches of the previous
     fabricCount/accessoryCount conditional returned the same `materialsAccount`,
     making the conditional dead code. If/when distinct fabric vs accessory
     inventory accounts are added to the rule schema, this can be expanded.
     For now: use the configured materials account. */
  const invCode = r.workshopPurchase?.materialsAccount || "1310";
  const invAcc = ensureLeaf(coa, invCode, "مخزون خامات");

  return {
    date,
    sourceType: "purchaseInvoice",
    sourceId: invoice.id,
    narration: `فاتورة مشتريات ${invoice.invoiceNo} من ${invoice.supplierName||""}`,
    lines: [
      {accountId:invAcc.id, accountCode:invAcc.code, accountName:invAcc.name, debit:total, credit:0,
       note:`فاتورة ${invoice.invoiceNo}`},
      {accountId:ap.id, accountCode:ap.code, accountName:ap.name, debit:0, credit:total,
       partyId:supplier?.id||invoice.supplierId, partyName:supplier?.name||invoice.supplierName,
       note:`فاتورة ${invoice.invoiceNo}`},
    ],
    partyHint: {kind:"supplier", id:supplier?.id||invoice.supplierId, name:supplier?.name||invoice.supplierName},
  };
}

/* Build a REVERSAL entry for an invoice being voided.
   Takes the original entry and produces its mirror (debits become credits).
   Caller is responsible for posting both — voiding the original and
   posting this new reversal. */
export function buildInvoiceVoidEntry(originalEntry, invoice){
  if(!originalEntry || !invoice) return null;
  const date = invoice.voidedAt ? invoice.voidedAt.split("T")[0] : new Date().toISOString().split("T")[0];
  const isCogs = String(originalEntry.sourceType||"").includes("Cogs");
  const reversedLines = (originalEntry.lines||[]).map(l => ({
    accountId: l.accountId,
    accountCode: l.accountCode,
    accountName: l.accountName,
    debit: Number(l.credit)||0,    /* swap */
    credit: Number(l.debit)||0,
    partyId: l.partyId,
    partyName: l.partyName,
    note: "إلغاء — " + (l.note || ""),
  }));
  return {
    date,
    sourceType: (originalEntry.sourceType||"") + "Void",
    sourceId: invoice.id + "#void",
    narration: `إلغاء — ${originalEntry.narration||"فاتورة "+invoice.invoiceNo}`,
    lines: reversedLines,
    partyHint: originalEntry.partyHint,
    voidsEntry: originalEntry.id || null,
  };
}

/* V18.51 — Build a journal entry from a CREDIT NOTE transitioning to "posted".
   Credit note = sale return: Dr مرتجع المبيعات / Cr عملاء (reverse of sale).
   Plus COGS reversal: Dr مخزون منتج تام / Cr COGS. */
export function buildCreditNotePostedEntry(creditNote, customer, order, coa, rules){
  if(!creditNote || creditNote.status !== "posted") return null;
  const r = resolveRules(rules);
  const gross = _r2(Number(creditNote.subtotal)||0);
  const disc  = _r2(Number(creditNote.discount)||0);
  const net   = _r2(Number(creditNote.total)||0);
  if(net <= 0 && gross <= 0) return null;

  const ar = ensureLeaf(coa, r.saleReturn.customerAccount, "العملاء");
  const rt = ensureLeaf(coa, r.saleReturn.returnAccount,   "مرتجع المبيعات");
  const date = creditNote.date || new Date().toISOString().split("T")[0];

  const itemSummary = (creditNote.items||[]).slice(0,2).map(it =>
    `${it.qty} × ${it.modelNo||"—"}`).join("، ");

  return {
    date,
    sourceType: "creditNote",
    sourceId: creditNote.id,
    narration: `إشعار دائن ${creditNote.creditNoteNo} للعميل ${creditNote.customerName||""}`,
    lines: [
      {accountId:rt.id, accountCode:rt.code, accountName:rt.name, debit:net, credit:0,
       note: `مرتجع — ${itemSummary}`},
      {accountId:ar.id, accountCode:ar.code, accountName:ar.name, debit:0, credit:net,
       partyId:customer?.id||creditNote.customerId, partyName:customer?.name||creditNote.customerName,
       note:`إشعار دائن ${creditNote.creditNoteNo}`},
    ],
    partyHint: {kind:"customer", id:customer?.id||creditNote.customerId, name:customer?.name||creditNote.customerName},
  };
}

/* COGS reversal companion for a credit note */
export function buildCreditNoteCogsEntry(creditNote, order, coa, rules, config){
  if(!creditNote || creditNote.status !== "posted") return null;
  if(!order) return null;
  const accSettings = (config||{}).accountingSettings||{};
  if(accSettings.cogsEnabled === false) return null;
  const r = resolveRules(rules);

  /* V21.9.87 (Accounting audit Bug #4): use _resolveUnitCost so credit
     note COGS matches the cost basis used on the original sale. Pre-
     V21.9.87 only manual costPrice was used → return COGS=0 when computed
     mode is set → inventory perpetual balance undervalued (debited on
     sale at computed cost, credited on return at 0). */
  const perPiece = _resolveUnitCost(order, config);
  let totalCost = 0;
  (creditNote.items||[]).forEach(it => {
    const qty = Number(it.qty)||0;
    totalCost += qty * perPiece;
  });
  totalCost = _r2(totalCost);
  if(totalCost <= 0) return null;

  /* Reverse direction: Dr inventory / Cr COGS.
     V21.9.87 (Accounting audit Bug #1): unified to finishedAccount. */
  const cogs = ensureLeaf(coa, r.saleCogs?.cogsAccount || "5100", "تكلفة البضاعة المباعة");
  const inv  = ensureLeaf(coa, r.saleCogs?.finishedAccount || "1320", "مخزون منتج تام");
  const date = creditNote.date || new Date().toISOString().split("T")[0];

  return {
    date,
    sourceType: "creditNoteCogs",
    sourceId: creditNote.id + "#cogs",
    narration: `إرجاع تكلفة البضاعة — إشعار ${creditNote.creditNoteNo}`,
    lines: [
      {accountId:inv.id, accountCode:inv.code, accountName:inv.name, debit:totalCost, credit:0,
       note:`دخول بضاعة من إرجاع ${creditNote.creditNoteNo}`},
      {accountId:cogs.id, accountCode:cogs.code, accountName:cogs.name, debit:0, credit:totalCost,
       note:`إرجاع COGS إشعار ${creditNote.creditNoteNo}`},
    ],
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   V19.40 — DEBIT NOTE (مرتجع المشتريات) JOURNAL ENTRY
   ───────────────────────────────────────────────────────────────────────
   Symmetric to buildCreditNotePostedEntry. Posting:
     Dr موردون خامات (2110)        <total>     ← reduces our payable to supplier
       Cr مرتجع المشتريات (5140)   <total>     ← contra-expense (reduces COGS)

   Why a contra-expense rather than crediting inventory directly?
   The original purchase posted: Dr inventory / Cr AP. The accounting-correct
   reversal would be Dr AP / Cr inventory. But we use a separate contra-account
   so that:
     1) the income statement shows BOTH the gross purchase cost and the
        return offsets clearly, instead of inventory looking like it
        "was never bought" (which makes audit trails harder to follow), and
     2) future categorization is possible (شطب بضاعة تالفة، رد عيوب، etc).
   The user can override `returnAccount` to "1310 مخزون خامات" if they prefer
   the direct-inventory-reversal style.
   ═══════════════════════════════════════════════════════════════════════ */
export function buildDebitNotePostedEntry(debitNote, supplier, coa, rules){
  if(!debitNote || debitNote.status !== "posted") return null;
  const r = resolveRules(rules);
  const total = _r2(Number(debitNote.total)||0);
  if(total <= 0) return null;

  const ap = ensureLeaf(coa, r.purchaseReturn?.supplierAccount || "2110", "موردون خامات");
  const rt = ensureLeaf(coa, r.purchaseReturn?.returnAccount   || "5140", "مرتجع المشتريات");
  const date = debitNote.date || new Date().toISOString().split("T")[0];

  const itemSummary = (debitNote.items||[]).slice(0,2).map(it =>
    `${it.qty} × ${it.name||"—"}`).join("، ");

  return {
    date,
    sourceType: "debitNote",
    sourceId: debitNote.id,
    narration: `إشعار مدين ${debitNote.debitNoteNo} للمورد ${debitNote.supplierName||""}`,
    lines: [
      {accountId:ap.id, accountCode:ap.code, accountName:ap.name, debit:total, credit:0,
       partyId:supplier?.id||debitNote.supplierId, partyName:supplier?.name||debitNote.supplierName,
       note:`إشعار مدين ${debitNote.debitNoteNo}`},
      {accountId:rt.id, accountCode:rt.code, accountName:rt.name, debit:0, credit:total,
       note:`مرتجع — ${itemSummary}`},
    ],
    partyHint: {kind:"supplier", id:supplier?.id||debitNote.supplierId, name:supplier?.name||debitNote.supplierName},
  };
}
