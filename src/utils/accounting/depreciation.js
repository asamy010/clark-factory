/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · Depreciation Engine (V18.67)
   ───────────────────────────────────────────────────────────────────────
   Computes monthly depreciation for fixed assets and posts journal
   entries (Dr مصروف الإهلاك / Cr مجمع الإهلاك).

   Idempotency:
     sourceType = "depreciation"
     sourceId   = `${assetId}_${YYYY-MM}` — one entry per asset per month.
     Re-running the same month is a no-op (postEntry upserts).

   Public API:
     analyzeDepreciationForMonth(assets, year, month)
       → preview: list of {asset, monthsToCharge, amountPerMonth, totalAmount, reason?}
     postDepreciationForMonth({assets, year, month, coa, userName})
       → executes; returns {posted: [...], skipped: [...], failed: [...]}
     reverseDepreciationForMonth({assets, year, month, reason, createdBy})
       → reverses (creates contra-entries) for the month — used if user
         wants to undo and re-run with different rates.
   ═══════════════════════════════════════════════════════════════════════ */

import { postEntry, reverseEntry } from "./posting.js";
import { getAccountByCode } from "./coa.js";
import { isDateLocked } from "./periodLock.js";
import { monthlyDepreciation, recordDepreciationProgress } from "./fixedAssets.js";

const _r2 = (n) => Math.round((Number(n)||0) * 100) / 100;
const _pad2 = (n) => String(n).padStart(2, "0");

/* ─── Helpers ─── */

/* Last day of a given month (returns "YYYY-MM-DD") */
export function lastDayOfMonth(year, month){
  /* JS Date trick: day 0 of next month = last day of this month */
  const d = new Date(year, month, 0);
  return `${d.getFullYear()}-${_pad2(d.getMonth() + 1)}-${_pad2(d.getDate())}`;
}

/* Compare YYYY-MM strings */
function ymCompare(a, b){
  return a.localeCompare(b);
}

/* Returns the month AFTER the given "YYYY-MM" string */
function nextMonth(ym){
  const [y, m] = ym.split("-").map(Number);
  if(m === 12) return `${y + 1}-01`;
  return `${y}-${_pad2(m + 1)}`;
}

/* Format a target as YYYY-MM */
export function ymFormat(year, month){
  return `${year}-${_pad2(month)}`;
}

/* ─── Compute months to charge for one asset, up to and including target month ─── */
function computeMonthsToCharge(asset, targetYM){
  if(asset.status !== "active") return { months: 0, reason: "غير نشط" };
  if(!asset.depreciationStartMonth || !asset.depreciationEndMonth){
    return { months: 0, reason: "جدولة الإهلاك غير محددة" };
  }
  /* Range to charge: [from, to] inclusive */
  const from = asset.lastDepreciatedThrough
    ? nextMonth(asset.lastDepreciatedThrough)
    : asset.depreciationStartMonth;

  const to = ymCompare(targetYM, asset.depreciationEndMonth) <= 0
    ? targetYM
    : asset.depreciationEndMonth;

  if(ymCompare(from, to) > 0) return { months: 0, reason: "محدّث للشهر المستهدف" };
  if(ymCompare(targetYM, asset.depreciationStartMonth) < 0){
    return { months: 0, reason: "قبل تاريخ بداية الإهلاك" };
  }

  /* Count inclusive months between `from` and `to` */
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  const months = (ty * 12 + tm) - (fy * 12 + fm) + 1;
  return { months, reason: null, fromMonth: from, toMonth: to };
}

/* ─── Pure analysis (used for preview before user confirms) ─── */
export function analyzeDepreciationForMonth(assets, year, month){
  const targetYM = ymFormat(year, month);
  const results = [];
  let totalAmount = 0;
  let toChargeCount = 0;

  (assets || []).forEach(asset => {
    const calc = computeMonthsToCharge(asset, targetYM);
    const monthlyAmt = monthlyDepreciation(asset);
    const total = _r2(monthlyAmt * calc.months);
    /* Cap at remaining base (cost − salvage − already depreciated) to avoid
       over-depreciating from rounding accumulation. */
    const remaining = _r2(
      (Number(asset.acquisitionCost) || 0)
      - (Number(asset.salvageValue)   || 0)
      - (Number(asset.totalDepreciated) || 0)
    );
    const finalAmount = Math.min(total, Math.max(0, remaining));
    if(finalAmount > 0) toChargeCount++;
    totalAmount = _r2(totalAmount + finalAmount);
    results.push({
      asset,
      monthsToCharge: calc.months,
      monthlyAmount: monthlyAmt,
      totalAmount: finalAmount,
      reason: calc.reason,
      fromMonth: calc.fromMonth,
      toMonth: calc.toMonth,
    });
  });

  return { results, totalAmount, toChargeCount, targetYM };
}

/* ─── Post depreciation entries for one month ─── */
export async function postDepreciationForMonth({assets, year, month, coa, userName, configForLockCheck}){
  const targetYM = ymFormat(year, month);
  const postingDate = lastDayOfMonth(year, month);

  /* Period-lock check */
  if(configForLockCheck && isDateLocked(postingDate, configForLockCheck)){
    throw new Error(
      `يوم ${postingDate} ضمن فترة مُقفلة محاسبياً — لا يمكن ترحيل قيود إهلاك فيها`
    );
  }

  const analysis = analyzeDepreciationForMonth(assets, year, month);
  const posted = [];
  const skipped = [];
  const failed = [];

  for(const row of analysis.results){
    if(row.totalAmount <= 0){
      skipped.push({ asset: row.asset, reason: row.reason || "بدون مبلغ" });
      continue;
    }
    /* Resolve account codes → account ids */
    const expAcc = getAccountByCode(coa, row.asset.depExpenseAccountCode);
    const accAcc = getAccountByCode(coa, row.asset.accumDepAccountCode);
    if(!expAcc || !expAcc.isLeaf){
      failed.push({
        asset: row.asset,
        reason: `حساب مصروف الإهلاك "${row.asset.depExpenseAccountCode}" غير موجود/غير فرعي`,
      });
      continue;
    }
    if(!accAcc || !accAcc.isLeaf){
      failed.push({
        asset: row.asset,
        reason: `حساب مجمع الإهلاك "${row.asset.accumDepAccountCode}" غير موجود/غير فرعي`,
      });
      continue;
    }

    const sourceId = `${row.asset.id}_${targetYM}`;
    const lines = [
      {
        accountId: expAcc.id, accountCode: expAcc.code, accountName: expAcc.name,
        debit: row.totalAmount, credit: 0,
        note: `إهلاك شهري — ${row.asset.code} ${row.asset.name}`,
      },
      {
        accountId: accAcc.id, accountCode: accAcc.code, accountName: accAcc.name,
        debit: 0, credit: row.totalAmount,
        note: `إهلاك شهري — ${row.asset.code} ${row.asset.name}`,
      },
    ];
    const narration = `إهلاك ${row.asset.code} ${row.asset.name} — ${targetYM}`
      + (row.monthsToCharge > 1 ? ` (${row.monthsToCharge} شهور)` : "");

    try {
      await postEntry({
        date: postingDate,
        sourceType: "depreciation",
        sourceId,
        narration,
        lines,
        coa,
        createdBy: userName,
      });
      /* Update the asset's tracking — even if catching up multiple months,
         lastDepreciatedThrough advances to the targetYM (or end month). */
      const throughMonth = row.toMonth || targetYM;
      await recordDepreciationProgress(row.asset.id, throughMonth, row.totalAmount);

      posted.push({
        asset: row.asset,
        amount: row.totalAmount,
        monthsCharged: row.monthsToCharge,
        throughMonth,
      });
    } catch(e){
      failed.push({
        asset: row.asset,
        reason: e.message || String(e),
      });
    }
  }

  return { posted, skipped, failed, targetYM, postingDate };
}

/* ─── Reverse depreciation entries for one month ─── */
export async function reverseDepreciationForMonth({assets, year, month, reason, createdBy, configForLockCheck}){
  const targetYM = ymFormat(year, month);
  const postingDate = lastDayOfMonth(year, month);

  if(configForLockCheck && isDateLocked(postingDate, configForLockCheck)){
    throw new Error(
      `يوم ${postingDate} ضمن فترة مُقفلة محاسبياً — لا يمكن إلغاء قيود فيها`
    );
  }

  const reversed = [];
  const failed = [];

  for(const asset of (assets || [])){
    const sourceId = `${asset.id}_${targetYM}`;
    try {
      const res = await reverseEntry({
        date: postingDate,
        sourceType: "depreciation",
        sourceId,
        reason: reason || "إلغاء إهلاك شهري",
        createdBy,
      });
      if(res && res.reversed){
        reversed.push({ asset });
        /* NOTE: We do NOT decrement asset.totalDepreciated automatically here.
           If the user wants to re-post, they should run normal posting which
           will advance lastDepreciatedThrough; but the prior contra entry
           offsets in the journal. For exact tracking, an admin should
           manually reset lastDepreciatedThrough on the asset. */
      }
    } catch(e){
      failed.push({ asset, reason: e.message || String(e) });
    }
  }

  return { reversed, failed, targetYM };
}
