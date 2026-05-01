/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · Aggregations
   ───────────────────────────────────────────────────────────────────────
   Lazy aggregations from raw journal entries → balances, trial balance,
   account ledger. No persistence — recomputed on demand. The day-doc model
   keeps each read very small, so even a year's worth of entries is fast.

   Public API:
   - flattenEntries(days)         → flat array of {entryRef, line, date}
   - sumByAccount(days, opts?)    → Map<accountId, {debit, credit, balance, ...}>
   - buildTrialBalance(coa, days) → array of rows (with rolled-up parents)
   - getAccountLedger(coa, days, accountId) → ordered transactions for one account
   ═══════════════════════════════════════════════════════════════════════ */

import { getAccount, getDescendants } from "./coa.js";

/* Walk a list of day-docs and return [{date, entry, line}] for every
   non-void line. Used by all aggregations. */
export function flattenEntries(days){
  const out = [];
  (days||[]).forEach(d => {
    (d.entries||[]).forEach(e => {
      if(e.status === "void") return;
      (e.lines||[]).forEach(line => {
        out.push({date: d.date, entry: e, line});
      });
    });
  });
  return out;
}

/* Reduce entries to per-account totals. Optionally filtered by partyId.
   Returns a Map<accountId, {accountId, debit, credit, count}>. */
export function sumByAccount(days, opts){
  const filter = opts?.partyId || null;
  const map = new Map();
  flattenEntries(days).forEach(({line}) => {
    if(filter && line.partyId !== filter) return;
    const k = line.accountId;
    if(!k) return;
    const cur = map.get(k) || {accountId:k, accountCode:line.accountCode, accountName:line.accountName, debit:0, credit:0, count:0};
    cur.debit  += Number(line.debit)||0;
    cur.credit += Number(line.credit)||0;
    cur.count  += 1;
    map.set(k, cur);
  });
  return map;
}

/* Determine the natural-side balance of an account.
   For asset/expense: balance = debit - credit.
   For liability/equity/revenue: balance = credit - debit.
   Returns positive when on natural side, negative when reversed. */
function naturalBalance(account, debit, credit){
  if(!account) return debit - credit;
  if(account.type === "asset" || account.type === "expense"){
    return (debit||0) - (credit||0);
  }
  return (credit||0) - (debit||0);
}

/* Build a trial balance with parent roll-up.
   Returns rows in tree order (depth-first), with each row carrying:
     {id, code, name, type, depth, isLeaf, debit, credit, balance, isParent}
   Parents aggregate their descendants; leaves use direct sums. */
export function buildTrialBalance(coa, days){
  const sums = sumByAccount(days);
  const idsWithActivity = new Set(sums.keys());
  const all = coa || [];
  const byParent = new Map();
  all.forEach(a => {
    const k = a.parent || "_ROOT_";
    if(!byParent.has(k)) byParent.set(k, []);
    byParent.get(k).push(a);
  });
  /* sort each level by code */
  byParent.forEach(arr => arr.sort((a,b) => (a.code||"").localeCompare(b.code||"", undefined, {numeric:true})));

  const rows = [];
  const walk = (parentId, depth) => {
    const children = byParent.get(parentId||"_ROOT_") || [];
    children.forEach(node => {
      let debit=0, credit=0;
      if(node.isLeaf){
        const s = sums.get(node.id);
        if(s){ debit = s.debit; credit = s.credit; }
      } else {
        /* Roll up all leaf descendants */
        getDescendants(all, node.id).forEach(desc => {
          if(desc.isLeaf){
            const s = sums.get(desc.id);
            if(s){ debit += s.debit; credit += s.credit; }
          }
        });
      }
      const balance = naturalBalance(node, debit, credit);
      rows.push({
        id: node.id,
        code: node.code,
        name: node.name,
        type: node.type,
        depth,
        isLeaf: node.isLeaf,
        debit, credit, balance,
        hasActivity: debit>0 || credit>0,
      });
      if(!node.isLeaf) walk(node.id, depth+1);
    });
  };
  walk(null, 0);
  /* Compute totals */
  const totals = rows.filter(r => r.isLeaf).reduce((acc,r) => {
    acc.debit  += r.debit;
    acc.credit += r.credit;
    return acc;
  }, {debit:0, credit:0});
  return {rows, totals};
}

/* Get all transactions touching a single account, ordered by date.
   Returns: [{date, refNo, narration, debit, credit, runningBalance, partyName, ...}] */
export function getAccountLedger(coa, days, accountId){
  const account = getAccount(coa, accountId);
  if(!account) return {account:null, lines:[], totals:{debit:0,credit:0,balance:0}};

  const all = flattenEntries(days)
    .filter(({line}) => line.accountId === accountId)
    .sort((a,b) => {
      if(a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.entry.createdAt||"").localeCompare(b.entry.createdAt||"");
    });

  let running = 0;
  const isDebitNatural = account.type === "asset" || account.type === "expense";
  const lines = all.map(({date, entry, line}) => {
    const dr = Number(line.debit)||0, cr = Number(line.credit)||0;
    running += isDebitNatural ? (dr - cr) : (cr - dr);
    return {
      date,
      refNo: entry.refNo,
      entryId: entry.id,
      narration: entry.narration,
      sourceType: entry.sourceType,
      partyName: line.partyName||"",
      partyId:   line.partyId||null,
      note:      line.note||"",
      debit: dr,
      credit: cr,
      runningBalance: running,
    };
  });
  const totals = lines.reduce((acc,l) => {
    acc.debit += l.debit; acc.credit += l.credit; return acc;
  }, {debit:0, credit:0, balance:running});

  return {account, lines, totals};
}

/* For a single party (customer/workshop/employee), return the consolidated
   debit/credit/balance across all accounts, useful for party statements. */
export function getPartyTotals(days, partyId){
  return sumByAccount(days, {partyId});
}

/* ─── PARTY LEDGER (V18.39) ───
   Build a chronological statement for a single party (customer/workshop/employee).
   Returns every journal line that touches the party with running balance,
   regardless of which account is affected.

   Convention for "natural balance" of a party:
   - Customer (asset-side, type=asset): natural debit
     → Sale increases (Dr); payment decreases (Cr)
     → Positive balance = customer owes us
   - Workshop / Supplier (liability-side): natural credit
     → Receive/Purchase increases (Cr); payment decreases (Dr)
     → Positive balance = we owe them
   - Employee: depends on transaction type — use account's natural side

   We pick the natural-side polarity from the FIRST line we encounter for
   the party, since within a party-scoped ledger all lines have the same
   account type (customer's lines are always against accounts where the
   customer is the party).

   Args:
     coa, days, partyId, options?
       options.partyType: "customer"|"workshop"|"employee" — explicit override
       options.from, options.to: date range
       options.openingBalance: the balance before `from` (number, optional)
   Returns:
     {partyId, lines:[{date, refNo, narration, debit, credit, runningBalance, accountCode, accountName, sourceType, ...}], totals}
*/
export function getPartyLedger(coa, days, partyId, options){
  if(!partyId) return {partyId:null, lines:[], totals:{debit:0,credit:0,balance:0}, partyType:null, partyName:""};

  const partyType = options?.partyType || null;
  const from = options?.from || null;
  const to   = options?.to   || null;
  const openingBalance = Number(options?.openingBalance)||0;

  /* Filter all lines that match the party */
  const matched = flattenEntries(days)
    .filter(({line}) => line.partyId === partyId)
    .filter(({date}) => {
      if(from && date < from) return false;
      if(to   && date > to)   return false;
      return true;
    })
    .sort((a,b) => {
      if(a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.entry.createdAt||"").localeCompare(b.entry.createdAt||"");
    });

  if(matched.length === 0) return {partyId, lines:[], totals:{debit:0,credit:0,balance:openingBalance}, partyType, partyName:""};

  /* Determine natural-side polarity:
     Look at the FIRST line's account type. For customers, first line is usually
     a sale → debit on customer (asset). For workshops, it's a receive → credit on
     workshop (liability). */
  const firstAcct = getAccount(coa, matched[0].line.accountId);
  const isAssetParty = firstAcct ? (firstAcct.type === "asset") : (partyType === "customer");
  /* Natural side: assets → balance = debit-credit, liabilities → balance = credit-debit */
  const sign = isAssetParty ? +1 : -1;

  let running = openingBalance;
  const partyName = matched[0].line.partyName || "";

  const lines = matched.map(({date, entry, line}) => {
    const dr = Number(line.debit)||0;
    const cr = Number(line.credit)||0;
    /* Apply natural-balance sign */
    running += sign * (dr - cr);
    return {
      date,
      refNo: entry.refNo,
      entryId: entry.id,
      narration: entry.narration,
      sourceType: entry.sourceType,
      accountCode: line.accountCode,
      accountName: line.accountName,
      note: line.note||"",
      debit: dr,
      credit: cr,
      runningBalance: running,
    };
  });

  const totals = lines.reduce((acc,l) => {
    acc.debit += l.debit; acc.credit += l.credit; return acc;
  }, {debit:0, credit:0, balance:running, openingBalance});

  return {
    partyId, partyName, partyType,
    isAssetParty,
    lines,
    totals,
  };
}
