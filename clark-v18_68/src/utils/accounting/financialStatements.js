/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · Financial Statements (Pure Builders)
   ───────────────────────────────────────────────────────────────────────
   Three primary financial statements:

     1. buildIncomeStatement(coa, days, {from,to})
        → Revenue, COGS, Gross Profit, Operating Expenses, Net Income
        → Used for the period from..to (inclusive).

     2. buildBalanceSheet(coa, daysToAsOf, asOfDate, [daysCurrentPeriodOnly])
        → Assets / Liabilities / Equity as of a single date.
        → Net income (Revenue - Expense for ALL time up to asOfDate)
          flows automatically into "Retained Earnings (current period)" so
          the equation ALWAYS balances without requiring closing entries.

     3. buildCashFlow(coa, days, {from,to})
        → Direct method: walks every entry that touched a cash/bank account
          and classifies movements by sourceType into Operating/Investing/
          Financing activities.

   These functions are PURE (no I/O); the caller is responsible for loading
   the right date range via readDayRange() before calling them.

   All amounts are non-negative for display. Sign is encoded by which
   subtotal line they appear under (e.g. discounts subtract from revenue).
   ═══════════════════════════════════════════════════════════════════════ */

import { flattenEntries, sumByAccount } from "./aggregate.js";
import { getAccount, getDescendants, getAccountByCode } from "./coa.js";

const _r2 = (n) => Math.round((Number(n)||0)*100)/100;

/* Natural-balance helper: positive when on the account's natural side. */
function naturalBalance(account, debit, credit){
  if(!account) return (debit||0) - (credit||0);
  if(account.type==="asset" || account.type==="expense"){
    return (debit||0) - (credit||0);
  }
  return (credit||0) - (debit||0);
}

/* Get aggregate (debit, credit, balance) for an account + all its descendants
   from the supplied entries. Returns natural-side balance (positive normally). */
function aggregateAccount(coa, sums, accountId){
  const acct = getAccount(coa, accountId);
  if(!acct) return {debit:0, credit:0, balance:0, account:null};
  let debit = 0, credit = 0;
  if(acct.isLeaf){
    const s = sums.get(accountId);
    if(s){ debit = s.debit; credit = s.credit; }
  } else {
    getDescendants(coa, accountId).forEach(d => {
      if(d.isLeaf){
        const s = sums.get(d.id);
        if(s){ debit += s.debit; credit += s.credit; }
      }
    });
  }
  return {debit, credit, balance: naturalBalance(acct, debit, credit), account: acct};
}

/* For a given root account, return a list of its direct children that have
   non-zero activity, each with their aggregate. Useful for displaying
   sub-sections in financial statements. */
function childRows(coa, sums, parentId){
  const direct = (coa||[]).filter(a => a.parent === parentId);
  return direct.map(a => {
    const agg = aggregateAccount(coa, sums, a.id);
    return {
      id: a.id, code: a.code, name: a.name, type: a.type,
      debit: agg.debit, credit: agg.credit, balance: agg.balance,
      hasActivity: agg.debit > 0 || agg.credit > 0,
    };
  }).sort((x,y) => (x.code||"").localeCompare(y.code||"", undefined, {numeric:true}));
}

/* ═════════════ 1. INCOME STATEMENT ═════════════ */

/* Calculate net income for a date range. Used both for the IS itself and
   for the "current period income" line on the Balance Sheet. */
export function calcNetIncomeForRange(coa, days){
  const sums = sumByAccount(days);
  let revenue = 0, expense = 0;
  (coa||[]).forEach(a => {
    if(!a.isLeaf) return;
    const s = sums.get(a.id);
    if(!s) return;
    if(a.type === "revenue") revenue += naturalBalance(a, s.debit, s.credit);
    else if(a.type === "expense") expense += naturalBalance(a, s.debit, s.credit);
  });
  return _r2(revenue - expense);
}

export function buildIncomeStatement(coa, days, period){
  const sums = sumByAccount(days);

  /* Revenue section: all type=revenue accounts.
     Contra-revenue (e.g. discount, returns) naturally subtract via signed balance. */
  const revenueAccts = (coa||[]).filter(a => a.type === "revenue" && a.isLeaf);
  const revenueRows = revenueAccts.map(a => {
    const agg = aggregateAccount(coa, sums, a.id);
    return {id:a.id, code:a.code, name:a.name, balance:agg.balance, debit:agg.debit, credit:agg.credit};
  }).filter(r => r.debit>0 || r.credit>0)
    .sort((a,b) => (a.code||"").localeCompare(b.code||"", undefined, {numeric:true}));
  const totalRevenue = _r2(revenueRows.reduce((s,r) => s + r.balance, 0));

  /* Expense classification by sub-tree.
     We split into:
     - 5100 Cost of Goods Sold
     - 5200 Salaries
     - 5300 Administrative
     - Other 5xxx (anything else under 5000)

     If the user customized their CoA we still show the 5xxx tree faithfully. */
  const expenseRoots = [
    {code:"5100", label:"تكلفة البضاعة المباعة"},
    {code:"5200", label:"الأجور والمرتبات"},
    {code:"5300", label:"المصروفات الإدارية"},
  ];
  const sections = [];
  let totalCogs = 0, totalOpex = 0;

  expenseRoots.forEach(root => {
    const acct = getAccountByCode(coa, root.code);
    if(!acct) return;
    const agg = aggregateAccount(coa, sums, acct.id);
    if(agg.debit === 0 && agg.credit === 0) return;
    /* Get all leaf descendants for detail */
    const leaves = getDescendants(coa, acct.id).filter(d => d.isLeaf);
    const items = leaves.map(l => {
      const a = aggregateAccount(coa, sums, l.id);
      return {id:l.id, code:l.code, name:l.name, balance:a.balance, debit:a.debit, credit:a.credit};
    }).filter(r => r.debit>0 || r.credit>0)
      .sort((a,b) => (a.code||"").localeCompare(b.code||"", undefined, {numeric:true}));
    const total = _r2(agg.balance);
    sections.push({code:root.code, label:root.label, items, total, isCogs: root.code === "5100"});
    if(root.code === "5100") totalCogs += total; else totalOpex += total;
  });

  /* Catch-all: any remaining 5xxx accounts not covered by 5100/5200/5300. */
  const exp5000 = getAccountByCode(coa, "5000");
  if(exp5000){
    const all = getDescendants(coa, exp5000.id).filter(d => d.isLeaf);
    const covered = new Set();
    expenseRoots.forEach(root => {
      const r = getAccountByCode(coa, root.code);
      if(r) getDescendants(coa, r.id).forEach(d => covered.add(d.id));
    });
    const orphans = all.filter(l => !covered.has(l.id));
    if(orphans.length > 0){
      const items = orphans.map(l => {
        const a = aggregateAccount(coa, sums, l.id);
        return {id:l.id, code:l.code, name:l.name, balance:a.balance, debit:a.debit, credit:a.credit};
      }).filter(r => r.debit>0 || r.credit>0);
      if(items.length > 0){
        const total = _r2(items.reduce((s,i) => s + i.balance, 0));
        sections.push({code:"5XXX", label:"مصروفات أخرى", items, total, isCogs: false});
        totalOpex += total;
      }
    }
  }

  totalCogs = _r2(totalCogs);
  totalOpex = _r2(totalOpex);
  const grossProfit = _r2(totalRevenue - totalCogs);
  const netIncome   = _r2(grossProfit - totalOpex);

  /* Margin ratios (% of revenue) — null when revenue is 0 */
  const ratio = (x) => totalRevenue > 0 ? _r2((x / totalRevenue) * 100) : null;

  return {
    period,
    revenue: {items: revenueRows, total: totalRevenue},
    cogs:    {sections: sections.filter(s => s.isCogs), total: totalCogs},
    grossProfit,
    operatingExpenses: {sections: sections.filter(s => !s.isCogs), total: totalOpex},
    netIncome,
    ratios: {
      grossMargin:    ratio(grossProfit),
      operatingMargin:ratio(_r2(grossProfit - totalOpex)),
      netMargin:      ratio(netIncome),
    },
  };
}

/* ═════════════ 2. BALANCE SHEET ═════════════ */

/* Classify whether an account is "current" or "non-current" by its first
   2 code digits (convention-based, matches the default CoA seed):
   - Current Assets:      11xx, 12xx, 13xx
   - Non-current Assets:  14xx, 15xx, 16xx, 17xx, 18xx, 19xx
   - Current Liabilities: 21xx, 22xx
   - Non-current Liab.:   23xx, 24xx, 25xx, 26xx, 27xx, 28xx, 29xx */
function classifyAccount(account){
  const code2 = String(account.code||"").slice(0,2);
  if(account.type === "asset"){
    if(["11","12","13"].includes(code2)) return "current";
    return "nonCurrent";
  }
  if(account.type === "liability"){
    if(["21","22"].includes(code2)) return "current";
    return "nonCurrent";
  }
  return null;
}

export function buildBalanceSheet(coa, daysToAsOf, asOfDate){
  const sums = sumByAccount(daysToAsOf);

  /* Iterate over the account tree, picking 2nd-level groups (codes like 1100,
     1200, 2100, ...) — they form natural BS sections. */
  const buildSection = (rootType, classification) => {
    const groups = [];
    /* Gather all 2nd-level (parent has parent=null root) accounts of this type */
    const roots = (coa||[]).filter(a => a.type === rootType && a.parent && classifyAccount(a) === classification);
    /* Group by the parent (1100, 1200, ...) */
    const byCode2 = new Map();
    roots.forEach(a => {
      const code2 = String(a.code||"").slice(0,2)+"00";
      if(!byCode2.has(code2)) byCode2.set(code2, []);
      byCode2.get(code2).push(a);
    });
    /* For each 2nd-level node, aggregate its descendants */
    Array.from(byCode2.keys()).sort((a,b) => a.localeCompare(b, undefined, {numeric:true})).forEach(code2 => {
      const headerAcct = getAccountByCode(coa, code2);
      if(!headerAcct) return;
      const agg = aggregateAccount(coa, sums, headerAcct.id);
      if(agg.debit === 0 && agg.credit === 0) return;
      /* Detail items: all leaves under this header */
      const leaves = getDescendants(coa, headerAcct.id).filter(d => d.isLeaf);
      const items = leaves.map(l => {
        const a = aggregateAccount(coa, sums, l.id);
        return {id:l.id, code:l.code, name:l.name, balance:a.balance};
      }).filter(r => r.balance !== 0)
        .sort((a,b) => (a.code||"").localeCompare(b.code||"", undefined, {numeric:true}));
      groups.push({
        code: headerAcct.code, name: headerAcct.name,
        items, total: _r2(agg.balance),
      });
    });
    const total = _r2(groups.reduce((s,g) => s + g.total, 0));
    return {groups, total};
  };

  const currentAssets    = buildSection("asset",     "current");
  const nonCurrentAssets = buildSection("asset",     "nonCurrent");
  const totalAssets      = _r2(currentAssets.total + nonCurrentAssets.total);

  const currentLiab    = buildSection("liability", "current");
  const nonCurrentLiab = buildSection("liability", "nonCurrent");
  const totalLiab      = _r2(currentLiab.total + nonCurrentLiab.total);

  /* Equity: own accounts + net income (revenue - expense) for everything
     up to as-of-date (since we don't have automatic period closing). */
  const equityAccts = (coa||[]).filter(a => a.type === "equity" && a.isLeaf);
  const equityItems = equityAccts.map(a => {
    const agg = aggregateAccount(coa, sums, a.id);
    return {id:a.id, code:a.code, name:a.name, balance:agg.balance};
  }).filter(r => r.balance !== 0)
    .sort((a,b) => (a.code||"").localeCompare(b.code||"", undefined, {numeric:true}));
  const equityFromAccts = _r2(equityItems.reduce((s,r) => s + r.balance, 0));

  const netIncomeToDate = calcNetIncomeForRange(coa, daysToAsOf);
  const totalEquity = _r2(equityFromAccts + netIncomeToDate);

  const totalLiabAndEquity = _r2(totalLiab + totalEquity);
  const isBalanced = Math.abs(totalAssets - totalLiabAndEquity) < 0.01;

  return {
    asOf: asOfDate,
    assets: {
      current: currentAssets,
      nonCurrent: nonCurrentAssets,
      total: totalAssets,
    },
    liabilities: {
      current: currentLiab,
      nonCurrent: nonCurrentLiab,
      total: totalLiab,
    },
    equity: {
      items: equityItems,
      fromAccts: equityFromAccts,
      currentPeriodNetIncome: netIncomeToDate,
      total: totalEquity,
    },
    totalLiabilitiesEquity: totalLiabAndEquity,
    isBalanced,
    discrepancy: _r2(totalAssets - totalLiabAndEquity),
  };
}

/* ═════════════ 3. CASH FLOW STATEMENT ═════════════ */

/* Direct method, simplified: we walk all entries in the period, find any
   that touched a cash/bank account (1110 / 1120 by default, or anything
   marked as type=asset under code 1100), and classify the OTHER side
   of the entry into Operating / Investing / Financing buckets.

   Source-type to category mapping:
   - Operating: sale, saleReturn, customerPay, workshopPay, workshopPurchase,
                hr*, treasury (if expense/income category)
   - Investing: treasury entries against fixed-asset accounts (1400+)
   - Financing: treasury entries against loan accounts (2300+) or
                equity accounts (3xxx)

   If the entry is balanced cash↔non-cash, the non-cash side determines
   the bucket. If it's cash↔cash (rare — internal transfer), it's ignored. */

const SOURCE_BUCKET_HINTS = {
  sale:                "operating",
  saleReturn:          "operating",
  customerPay:         "operating",
  customerCheck:       "operating",
  customerCheckCollect:"operating",
  workshopReceive:     "operating",
  workshopPay:         "operating",
  workshopPurchase:    "operating",
  hrSalary:            "operating",
  hrBonus:             "operating",
  hrAdvance:           "operating",
  treasury:            "operating",/* default — overridden by counter-account inspection */
  manual:              "operating",
};

function classifyCashFlow(coa, line, otherLine){
  const otherAcct = otherLine ? getAccount(coa, otherLine.accountId) : null;
  if(!otherAcct) return "operating";
  const code = String(otherAcct.code||"");
  /* Investing: fixed assets (14xx) */
  if(otherAcct.type === "asset" && code.startsWith("14")) return "investing";
  /* Financing: loans (23xx) or equity (3xxx) */
  if(otherAcct.type === "liability" && code.startsWith("23")) return "financing";
  if(otherAcct.type === "equity") return "financing";
  /* Default Operating */
  return "operating";
}

export function buildCashFlow(coa, days, period, daysBeforePeriod){
  /* Identify cash accounts: all leaves under "1100" (cash & banks) by
     convention, EXCLUDING 1130 (checks under collection — not yet cash).
     Users can rename/restructure; we re-detect leaves. */
  const cashHeader = getAccountByCode(coa, "1100");
  const cashIds = new Set();
  if(cashHeader){
    getDescendants(coa, cashHeader.id).forEach(d => {
      if(d.isLeaf && d.code !== "1130") cashIds.add(d.id);
    });
  } else {
    /* Fallback: any asset account whose name contains "خزينة" or "بنك" */
    (coa||[]).forEach(a => {
      if(!a.isLeaf || a.type !== "asset") return;
      if(/خزينة|بنك|cash|bank/i.test(a.name||"")) cashIds.add(a.id);
    });
  }

  /* Helper: compute beginning cash from daysBeforePeriod (entries up to
     the start of our window). If not given, defaults to 0. */
  let beginningCash = 0;
  if(daysBeforePeriod && daysBeforePeriod.length > 0){
    flattenEntries(daysBeforePeriod).forEach(({line}) => {
      if(cashIds.has(line.accountId)){
        beginningCash += (Number(line.debit)||0) - (Number(line.credit)||0);
      }
    });
  }

  const buckets = {
    operating: {activities:[], net:0},
    investing: {activities:[], net:0},
    financing: {activities:[], net:0},
  };

  /* Walk entries: for each entry that touches cash, find the cash line(s)
     and the non-cash line(s), then attribute movement to a bucket based on
     the non-cash side's account type/code. */
  (days||[]).forEach(d => {
    (d.entries||[]).forEach(e => {
      if(e.status === "void") return;
      const cashLines = (e.lines||[]).filter(l => cashIds.has(l.accountId));
      const otherLines = (e.lines||[]).filter(l => !cashIds.has(l.accountId));
      if(cashLines.length === 0) return;/* not a cash transaction */
      if(otherLines.length === 0) return;/* internal cash↔cash, skip */

      /* Aggregate cash side: positive = cash inflow, negative = outflow */
      const cashChange = cashLines.reduce((s,l) =>
        s + (Number(l.debit)||0) - (Number(l.credit)||0), 0);
      if(Math.abs(cashChange) < 0.01) return;

      /* Pick the largest non-cash line as representative for classification */
      const dominant = [...otherLines].sort((a,b) => {
        const ax = Math.max(Number(a.debit)||0, Number(a.credit)||0);
        const bx = Math.max(Number(b.debit)||0, Number(b.credit)||0);
        return bx - ax;
      })[0];

      let bucket = SOURCE_BUCKET_HINTS[e.sourceType] || "operating";
      const detected = classifyCashFlow(coa, cashLines[0], dominant);
      if(detected !== "operating") bucket = detected;

      const label = (dominant?.accountName || "غير محدد") + (e.narration ? " — "+e.narration : "");
      buckets[bucket].activities.push({
        date: d.date,
        refNo: e.refNo,
        narration: e.narration,
        sourceType: e.sourceType,
        accountName: dominant?.accountName || "",
        accountCode: dominant?.accountCode || "",
        amount: _r2(cashChange),/* signed */
        partyName: dominant?.partyName || cashLines[0]?.partyName || "",
      });
      buckets[bucket].net = _r2(buckets[bucket].net + cashChange);
    });
  });

  /* Group activities by accountCode within each bucket for cleaner display */
  const groupBucket = (b) => {
    const map = new Map();
    b.activities.forEach(a => {
      const k = a.accountCode + "|" + a.accountName;
      if(!map.has(k)) map.set(k, {accountCode:a.accountCode, accountName:a.accountName, total:0, count:0});
      const cur = map.get(k);
      cur.total = _r2(cur.total + a.amount);
      cur.count += 1;
    });
    return {
      groups: Array.from(map.values()).sort((x,y) => Math.abs(y.total) - Math.abs(x.total)),
      activities: b.activities,
      net: b.net,
    };
  };

  const operating = groupBucket(buckets.operating);
  const investing = groupBucket(buckets.investing);
  const financing = groupBucket(buckets.financing);
  const netCashChange = _r2(operating.net + investing.net + financing.net);
  const endingCash = _r2(beginningCash + netCashChange);

  return {
    period,
    operating,
    investing,
    financing,
    netCashChange,
    beginningCash: _r2(beginningCash),
    endingCash,
  };
}
