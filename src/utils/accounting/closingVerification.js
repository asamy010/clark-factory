/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · Closing Verification (V18.66)
   ───────────────────────────────────────────────────────────────────────
   After a closing entry is posted, this verifies:
     1. Revenue/Expense accounts have ZERO balance in the closed period
        (when the closing entry IS included in aggregation).
     2. Retained Earnings increased by exactly netIncome.
     3. The closing entry exists in accountingDays/{toDate}.

   Returns a structured result for display in the wizard's Step 5.
   ═══════════════════════════════════════════════════════════════════════ */

import { sumByAccount } from "./aggregate.js";
import { readDayRange } from "./dayDoc.js";

const _r2 = (n) => Math.round((Number(n)||0) * 100) / 100;

function naturalBalance(account, debit, credit){
  if(account.type === "asset" || account.type === "expense") return (debit||0) - (credit||0);
  return (credit||0) - (debit||0);
}

export async function verifyClosingRollover({coa, fromDate, toDate, retainedEarningsCode, expectedNetIncome}){
  /* Re-read days INCLUDING the closing entry that was just posted */
  const days = await readDayRange(fromDate, toDate);
  const sums = sumByAccount(days);

  const issues = [];
  let nonZeroPL = 0;

  /* Verify all P&L accounts ended at zero */
  (coa || []).forEach(a => {
    if(!a.isLeaf) return;
    if(a.type !== "revenue" && a.type !== "expense") return;
    const s = sums.get(a.id);
    if(!s) return;
    const balance = _r2(naturalBalance(a, s.debit, s.credit));
    if(Math.abs(balance) >= 0.01){
      nonZeroPL++;
      issues.push({
        type: "non-zero-pl",
        accountCode: a.code,
        accountName: a.name,
        balance,
      });
    }
  });

  /* Verify the closing entry exists in toDate */
  const lastDay = days.find(d => d.date === toDate);
  const closingEntries = (lastDay?.entries || []).filter(e => e.sourceType === "closing_entry");
  const closingExists = closingEntries.length > 0;

  if(!closingExists){
    issues.push({ type: "no-closing-entry" });
  }

  /* Verify Retained Earnings movement matches net income */
  const re = (coa || []).find(a => a.code === retainedEarningsCode);
  let reDelta = null;
  if(re && closingEntries.length > 0){
    /* Sum the RE lines only in the closing entry */
    let dr = 0, cr = 0;
    closingEntries.forEach(e => (e.lines || []).forEach(l => {
      if(l.accountId === re.id || l.accountCode === re.code){
        dr += Number(l.debit) || 0;
        cr += Number(l.credit) || 0;
      }
    }));
    reDelta = _r2(cr - dr); /* equity natural side: credit positive */
    const expectedDelta = _r2(expectedNetIncome);
    if(Math.abs(reDelta - expectedDelta) > 0.01){
      issues.push({
        type: "re-mismatch",
        expected: expectedDelta,
        actual: reDelta,
      });
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    nonZeroPL,
    closingExists,
    reDelta,
    expectedNetIncome: _r2(expectedNetIncome),
  };
}
