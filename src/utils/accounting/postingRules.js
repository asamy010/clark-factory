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
  const price = Number(order.sellPrice)||0;
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
  /* Don't re-post operations that have a specific handler */
  if(tx.sourceType && tx.sourceType !== "manual") return null;
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
