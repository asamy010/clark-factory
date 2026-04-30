/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · Opening Balances
   ───────────────────────────────────────────────────────────────────────
   Lets the user record the system's starting balances on day 1 (cash on
   hand, outstanding customer receivables, supplier dues, inventory value,
   capital, etc.) as a single balanced opening journal entry.

   Storage:
   - data.openingBalanceConfig = {
       date,                      // ISO date when system started
       balancingAccount,          // CoA code used to absorb the balancing diff (default 3100 capital)
       balances: { code: amount } // user input — amounts always positive
       postedAt, postedBy
     }
   - The actual journal entry lives in accountingDays/{date} with
     sourceType="opening_balance", sourceId="opening_balance" (singleton).

   Sign convention (entered amounts always positive):
   - Asset / Expense accounts → posted as DEBIT
   - Liability / Equity / Revenue accounts → posted as CREDIT
   The "balancing" account picks up whatever's needed to balance Dr=Cr.

   Re-saving the OB entry:
   - postOpeningBalances() uses the standard postEntry() upsert path
     (idempotent on sourceType+sourceId), so re-saving simply overwrites
     the existing entry on the same day.
   - If the user CHANGES THE DATE, we reverse the old entry first (at the
     old date) before posting the new one.
   ═══════════════════════════════════════════════════════════════════════ */

import { getAccount, getAccountByCode } from "./coa.js";
import { postEntry, reverseEntry, validateLines } from "./posting.js";
import { findEntryBySource } from "./dayDoc.js";

const _r2 = (n) => Math.round((Number(n)||0)*100)/100;

/* Sign helper: which side does this account naturally sit on? */
function isDebitNatural(account){
  return account.type === "asset" || account.type === "expense";
}

/* Pure: build the journal lines from a {code:amount} map.
   - Throws if any code is missing from CoA or is non-leaf.
   - Auto-balances using `balancingAccount` (no entry created if balanced).
   Returns lines array ready to feed into postEntry/validateLines. */
export function buildOpeningBalanceLines(balancesByCode, coa, balancingAccountCode){
  const lines = [];
  let totalDr = 0, totalCr = 0;

  Object.entries(balancesByCode || {}).forEach(([code, amt]) => {
    const a = _r2(amt);
    if(Math.abs(a) < 0.01) return;
    const acct = getAccountByCode(coa, code);
    if(!acct) throw new Error(`الحساب ${code} غير موجود في الشجرة`);
    if(!acct.isLeaf) throw new Error(`الحساب "${acct.name}" (${code}) ليس حساباً فرعياً — لا يقبل ترحيلاً`);

    if(isDebitNatural(acct)){
      lines.push({
        accountId: acct.id, accountCode: acct.code, accountName: acct.name,
        debit: a, credit: 0,
        note: "رصيد افتتاحي",
      });
      totalDr = _r2(totalDr + a);
    } else {
      lines.push({
        accountId: acct.id, accountCode: acct.code, accountName: acct.name,
        debit: 0, credit: a,
        note: "رصيد افتتاحي",
      });
      totalCr = _r2(totalCr + a);
    }
  });

  /* Auto-balance with the chosen balancing account */
  const diff = _r2(totalDr - totalCr);
  if(Math.abs(diff) >= 0.01){
    const balancer = getAccountByCode(coa, balancingAccountCode);
    if(!balancer) throw new Error(`حساب التوازن "${balancingAccountCode}" غير موجود — حدد حساب رأس مال أو حقوق ملكية`);
    if(!balancer.isLeaf) throw new Error(`حساب التوازن يجب أن يكون فرعياً`);
    if(diff > 0){
      /* More debits → balance with credit on the balancing account */
      lines.push({
        accountId: balancer.id, accountCode: balancer.code, accountName: balancer.name,
        debit: 0, credit: diff,
        note: "توازن الأرصدة الافتتاحية",
      });
    } else {
      lines.push({
        accountId: balancer.id, accountCode: balancer.code, accountName: balancer.name,
        debit: -diff, credit: 0,
        note: "توازن الأرصدة الافتتاحية",
      });
    }
  }

  return lines;
}

/* Build the full entry object (date+narration+lines+sourceMeta). */
export function buildOpeningBalanceEntry({balancesByCode, coa, date, balancingAccountCode, narration}){
  const lines = buildOpeningBalanceLines(balancesByCode, coa, balancingAccountCode);
  return {
    date,
    sourceType: "opening_balance",
    sourceId: "opening_balance",/* singleton key — there's only one OB per system */
    narration: narration || "الأرصدة الافتتاحية",
    lines,
  };
}

/* Side-effecting: post the OB entry. Idempotent on (sourceType, sourceId) —
   overwrites if exists on same date. If date is changing from previous,
   the caller should call reverseOpeningBalance(oldDate) FIRST. */
export async function postOpeningBalances({balancesByCode, coa, date, balancingAccountCode, narration, createdBy}){
  if(!date) throw new Error("التاريخ مطلوب");
  if(!balancingAccountCode) throw new Error("حدد حساب التوازن (عادة رأس المال)");
  const built = buildOpeningBalanceEntry({balancesByCode, coa, date, balancingAccountCode, narration});
  if(built.lines.length === 0) throw new Error("لا توجد أرصدة للترحيل");
  validateLines(built.lines, coa);
  await postEntry({...built, coa, createdBy});
  return built;
}

/* Reverse the OB entry on a given date (used when the user moves OB to
   a different date, or wants to clear it entirely). */
export async function reverseOpeningBalance(date, createdBy){
  return await reverseEntry({
    date,
    sourceType: "opening_balance",
    sourceId: "opening_balance",
    reason: "إعادة إدخال الأرصدة الافتتاحية",
    createdBy,
  });
}

/* Look up the existing OB entry on a given date (useful for pre-filling form). */
export async function findOpeningBalance(date){
  if(!date) return null;
  return await findEntryBySource(date, "opening_balance", "opening_balance");
}

/* Reverse-engineer the {code:amount} map from an existing OB entry's lines.
   This is what the form pre-fills with. */
export function extractBalancesFromEntry(entry, coa){
  if(!entry || !entry.lines) return {};
  const out = {};
  entry.lines.forEach(l => {
    const acct = getAccount(coa, l.accountId);
    if(!acct) return;
    /* Skip the "balancing" line — it's auto-computed; user shouldn't see it
       as a manually-entered value. We detect it by the note. */
    if(l.note === "توازن الأرصدة الافتتاحية") return;
    const amt = isDebitNatural(acct) ? l.debit : l.credit;
    if(amt > 0) out[acct.code] = _r2(amt);
  });
  return out;
}
