/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · Closing Entries (Period Closure)
   ───────────────────────────────────────────────────────────────────────
   At the end of a fiscal period, all temporary accounts (Revenue + Expense)
   should be "closed" — meaning their balances are transferred into Retained
   Earnings (3200 by default), so the next period starts with zero P&L
   account balances.

   The closing entry pattern:
     Dr Revenue accounts (each at its credit balance)
       Cr Expense accounts (each at its debit balance)
       Cr Retained Earnings (the net income, if profitable)
       OR
       Dr Retained Earnings (the net loss)

   Public API:
   - analyzePeriodForClosing(coa, daysInPeriod, retainedEarningsCode)
       → preview before posting (totalRevenue, totalExpense, netIncome,
         which accounts will be closed)
   - postClosingEntry(coa, daysInPeriod, options)
       → posts the entry with sourceId = "closing_<from>_<to>"
   - reverseClosingEntry(fromDate, toDate, createdBy)
       → undoes a closure (re-opens the period)

   Storage:
   - data.closedPeriods[] = [{
       id, fromDate, toDate, retainedEarningsCode,
       totalRevenue, totalExpense, netIncome,
       closedAt, closedBy, refNo,
       reversedAt?, reversedBy?,
     }]
   - The actual journal entry is in accountingDays/{toDate}.

   Idempotency:
   - postEntry() upserts on (sourceType, sourceId), so re-running the same
     closure on the same range OVERWRITES the previous one. This is useful
     if the user added late entries to a period after closing — they can
     just re-close to refresh the closure.
   ═══════════════════════════════════════════════════════════════════════ */

import { sumByAccount } from "./aggregate.js";
import { getAccount, getAccountByCode } from "./coa.js";
import { postEntry, reverseEntry, validateLines } from "./posting.js";

const _r2 = (n) => Math.round((Number(n)||0)*100)/100;

/* Natural-balance helper (asset/expense → debit; rest → credit). */
function naturalBalance(account, debit, credit){
  if(account.type === "asset" || account.type === "expense") return (debit||0) - (credit||0);
  return (credit||0) - (debit||0);
}

/* Filter days to exclude any pre-existing closing entry within them — we
   don't want a closure to "close itself" if the user re-runs it. */
function excludePriorClosings(days){
  return (days||[]).map(d => ({
    ...d,
    entries: (d.entries||[]).filter(e =>
      e.sourceType !== "closing_entry" && e.sourceType !== "closing_entry:reversal"
    ),
  }));
}

/* ─── ANALYSIS (pure, used for preview) ─── */

export function analyzePeriodForClosing(coa, daysInPeriod, retainedEarningsCode){
  const re = getAccountByCode(coa, retainedEarningsCode);
  if(!re) throw new Error(`حساب الأرباح المحتجزة "${retainedEarningsCode}" غير موجود في الشجرة`);
  if(!re.isLeaf) throw new Error(`حساب الأرباح المحتجزة يجب أن يكون فرعياً`);

  /* Strip out any pre-existing closure entries from the period's days
     before analyzing — otherwise the new closure would compound onto them. */
  const cleanDays = excludePriorClosings(daysInPeriod);
  const sums = sumByAccount(cleanDays);

  const revenueAccounts = [];
  const expenseAccounts = [];
  let totalRevenue = 0, totalExpense = 0;

  (coa || []).forEach(a => {
    if(!a.isLeaf) return;
    if(a.type !== "revenue" && a.type !== "expense") return;
    const s = sums.get(a.id);
    if(!s) return;
    const balance = _r2(naturalBalance(a, s.debit, s.credit));
    if(Math.abs(balance) < 0.01) return;

    const row = {
      id: a.id, code: a.code, name: a.name,
      balance, debit: s.debit, credit: s.credit,
    };

    if(a.type === "revenue"){
      revenueAccounts.push(row);
      totalRevenue = _r2(totalRevenue + balance);
    } else {
      expenseAccounts.push(row);
      totalExpense = _r2(totalExpense + balance);
    }
  });

  /* Sort by code for deterministic preview ordering */
  revenueAccounts.sort((a,b) => (a.code||"").localeCompare(b.code||"", undefined, {numeric:true}));
  expenseAccounts.sort((a,b) => (a.code||"").localeCompare(b.code||"", undefined, {numeric:true}));

  const netIncome = _r2(totalRevenue - totalExpense);

  return {
    revenueAccounts, expenseAccounts,
    totalRevenue, totalExpense, netIncome,
    retainedEarnings: {id: re.id, code: re.code, name: re.name},
    canClose: revenueAccounts.length + expenseAccounts.length > 0,
  };
}

/* ─── BUILDER (pure, builds the actual lines from analysis) ─── */

export function buildClosingLines(analysis){
  const lines = [];

  /* Close each revenue account: post the OPPOSITE side to bring balance to 0.
     Revenue normally has credit balance → debit it.
     Contra-revenue (e.g. discount) has debit balance → credit it.
     We use signed `balance` from the analysis (already natural-side). */
  analysis.revenueAccounts.forEach(r => {
    if(r.balance > 0){
      /* Normal revenue: Dr to close */
      lines.push({
        accountId: r.id, accountCode: r.code, accountName: r.name,
        debit: r.balance, credit: 0, note: "إقفال الإيرادات",
      });
    } else {
      /* Contra-revenue (negative natural balance): Cr to close */
      lines.push({
        accountId: r.id, accountCode: r.code, accountName: r.name,
        debit: 0, credit: -r.balance, note: "إقفال الإيرادات",
      });
    }
  });

  /* Close each expense account: opposite side to zero out.
     Expense normally has debit balance → credit it. */
  analysis.expenseAccounts.forEach(e => {
    if(e.balance > 0){
      /* Normal expense: Cr to close */
      lines.push({
        accountId: e.id, accountCode: e.code, accountName: e.name,
        debit: 0, credit: e.balance, note: "إقفال المصروفات",
      });
    } else {
      /* Negative expense (refund/contra): Dr to close */
      lines.push({
        accountId: e.id, accountCode: e.code, accountName: e.name,
        debit: -e.balance, credit: 0, note: "إقفال المصروفات",
      });
    }
  });

  /* Net income → Retained Earnings (only post if non-zero) */
  if(Math.abs(analysis.netIncome) >= 0.01){
    if(analysis.netIncome > 0){
      /* Profit: Cr Retained Earnings */
      lines.push({
        accountId: analysis.retainedEarnings.id,
        accountCode: analysis.retainedEarnings.code,
        accountName: analysis.retainedEarnings.name,
        debit: 0, credit: analysis.netIncome,
        note: "صافي ربح الفترة",
      });
    } else {
      /* Loss: Dr Retained Earnings */
      lines.push({
        accountId: analysis.retainedEarnings.id,
        accountCode: analysis.retainedEarnings.code,
        accountName: analysis.retainedEarnings.name,
        debit: -analysis.netIncome, credit: 0,
        note: "صافي خسارة الفترة",
      });
    }
  }

  return lines;
}

/* ─── POST (side-effecting) ─── */

export async function postClosingEntry({coa, daysInPeriod, fromDate, toDate, retainedEarningsCode, createdBy}){
  if(!fromDate || !toDate) throw new Error("حدد فترة الإقفال");
  if(new Date(fromDate) > new Date(toDate)) throw new Error("تاريخ البداية بعد تاريخ النهاية");

  const analysis = analyzePeriodForClosing(coa, daysInPeriod, retainedEarningsCode);
  if(!analysis.canClose){
    throw new Error("لا توجد إيرادات أو مصروفات بأرصدة للإقفال في هذه الفترة");
  }
  const lines = buildClosingLines(analysis);
  if(lines.length === 0) throw new Error("لم يتم بناء أي قيود إقفال");

  validateLines(lines, coa);

  const sourceId = `closing_${fromDate}_${toDate}`;
  const narration = `إقفال الفترة المالية من ${fromDate} إلى ${toDate}` +
    (analysis.netIncome >= 0 ? ` — صافي ربح ${analysis.netIncome.toFixed(2)}` : ` — صافي خسارة ${Math.abs(analysis.netIncome).toFixed(2)}`);

  await postEntry({
    date: toDate,
    sourceType: "closing_entry",
    sourceId,
    narration,
    lines,
    coa,
    createdBy,
  });

  return {
    sourceId,
    fromDate, toDate,
    retainedEarningsCode,
    totalRevenue: analysis.totalRevenue,
    totalExpense: analysis.totalExpense,
    netIncome: analysis.netIncome,
    accountsClosed: analysis.revenueAccounts.length + analysis.expenseAccounts.length,
  };
}

/* ─── REVERSE (undoes a closure) ─── */

export async function reverseClosingEntry(fromDate, toDate, createdBy){
  const sourceId = `closing_${fromDate}_${toDate}`;
  return await reverseEntry({
    date: toDate,
    sourceType: "closing_entry",
    sourceId,
    reason: "إعادة فتح الفترة المالية",
    createdBy,
  });
}
