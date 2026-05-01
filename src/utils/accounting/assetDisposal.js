/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · Asset Disposal (V18.67)
   ───────────────────────────────────────────────────────────────────────
   Builds and posts a journal entry to dispose of a fixed asset.

   Standard accounting:
     Original cost C, Accumulated depreciation A, Book value = C − A
     Sale proceeds = S (S=0 means scrapped)

     If S > Book Value (gain):
       Dr Cash/Receivable        S
       Dr Accumulated Dep        A
       Cr Fixed Asset            C
       Cr Gain on Disposal       (S − BV)

     If S < Book Value (loss):
       Dr Cash/Receivable        S
       Dr Accumulated Dep        A
       Dr Loss on Disposal       (BV − S)
       Cr Fixed Asset            C

     If S = Book Value (no gain/loss):
       Dr Cash/Receivable        S
       Dr Accumulated Dep        A
       Cr Fixed Asset            C

   Idempotent on sourceId = `disposal_${assetId}`.

   Public API:
     buildDisposalAnalysis(asset, disposalAmount)
       → {bookValue, gain, loss, hasGain, hasLoss}
     postAssetDisposal({asset, disposalDate, disposalAmount, proceedsAccountCode,
       gainAccountCode, lossAccountCode, coa, userName, configForLockCheck, notes})
   ═══════════════════════════════════════════════════════════════════════ */

import { postEntry } from "./posting.js";
import { getAccountByCode } from "./coa.js";
import { isDateLocked } from "./periodLock.js";
import { markAssetDisposed } from "./fixedAssets.js";

const _r2 = (n) => Math.round((Number(n)||0) * 100) / 100;

export function buildDisposalAnalysis(asset, disposalAmount){
  const cost = Number(asset.acquisitionCost) || 0;
  const acc = Number(asset.totalDepreciated) || 0;
  const bv = _r2(cost - acc);
  const proceeds = _r2(Number(disposalAmount) || 0);
  const diff = _r2(proceeds - bv);
  return {
    bookValue: bv,
    cost,
    accumulatedDepreciation: acc,
    proceeds,
    gain: diff > 0 ? diff : 0,
    loss: diff < 0 ? -diff : 0,
    hasGain: diff > 0,
    hasLoss: diff < 0,
    breakEven: diff === 0,
  };
}

export async function postAssetDisposal({
  asset, disposalDate, disposalAmount,
  proceedsAccountCode, gainAccountCode, lossAccountCode,
  coa, userName, configForLockCheck, notes,
}){
  if(!disposalDate) throw new Error("حدد تاريخ التصرف");
  if(configForLockCheck && isDateLocked(disposalDate, configForLockCheck)){
    throw new Error(`اليوم ${disposalDate} ضمن فترة مُقفلة محاسبياً`);
  }
  if(asset.status === "disposed"){
    throw new Error("الأصل تم التصرف فيه بالفعل");
  }

  const analysis = buildDisposalAnalysis(asset, disposalAmount);

  /* Resolve all needed accounts */
  const assetAcc = getAccountByCode(coa, asset.assetAccountCode);
  const accAcc   = getAccountByCode(coa, asset.accumDepAccountCode);
  if(!assetAcc || !assetAcc.isLeaf) throw new Error("حساب الأصل غير صحيح");
  if(!accAcc || !accAcc.isLeaf)     throw new Error("حساب مجمع الإهلاك غير صحيح");

  /* Default proceeds account: cash if missing */
  const proceedsCode = proceedsAccountCode || "1110";
  const proceedsAcc = getAccountByCode(coa, proceedsCode);
  if(analysis.proceeds > 0 && (!proceedsAcc || !proceedsAcc.isLeaf)){
    throw new Error(`حساب المتحصلات "${proceedsCode}" غير صحيح`);
  }

  const lines = [];

  /* Dr Cash/Receivable for proceeds (if any) */
  if(analysis.proceeds > 0){
    lines.push({
      accountId: proceedsAcc.id, accountCode: proceedsAcc.code, accountName: proceedsAcc.name,
      debit: analysis.proceeds, credit: 0,
      note: `متحصلات بيع الأصل ${asset.code}`,
    });
  }

  /* Dr Accumulated Depreciation (clear it) */
  if(analysis.accumulatedDepreciation > 0){
    lines.push({
      accountId: accAcc.id, accountCode: accAcc.code, accountName: accAcc.name,
      debit: analysis.accumulatedDepreciation, credit: 0,
      note: `إقفال مجمع إهلاك ${asset.code}`,
    });
  }

  /* If loss → Dr Loss on Disposal */
  if(analysis.hasLoss){
    const lossCode = lossAccountCode || "5420";
    const lossAcc = getAccountByCode(coa, lossCode);
    if(!lossAcc || !lossAcc.isLeaf) throw new Error(`حساب خسارة التصرف "${lossCode}" غير صحيح`);
    lines.push({
      accountId: lossAcc.id, accountCode: lossAcc.code, accountName: lossAcc.name,
      debit: analysis.loss, credit: 0,
      note: `خسارة تصرف في ${asset.code}`,
    });
  }

  /* Cr Fixed Asset (remove from books at original cost) */
  lines.push({
    accountId: assetAcc.id, accountCode: assetAcc.code, accountName: assetAcc.name,
    debit: 0, credit: analysis.cost,
    note: `استبعاد الأصل ${asset.code}`,
  });

  /* If gain → Cr Gain on Disposal */
  if(analysis.hasGain){
    const gainCode = gainAccountCode || "4920";
    const gainAcc = getAccountByCode(coa, gainCode);
    if(!gainAcc || !gainAcc.isLeaf) throw new Error(`حساب ربح التصرف "${gainCode}" غير صحيح`);
    lines.push({
      accountId: gainAcc.id, accountCode: gainAcc.code, accountName: gainAcc.name,
      debit: 0, credit: analysis.gain,
      note: `ربح تصرف في ${asset.code}`,
    });
  }

  if(lines.length < 2){
    throw new Error("قيد التصرف يحتاج سطرين على الأقل — تأكد من بيانات الأصل");
  }

  const sourceId = `disposal_${asset.id}`;
  const narration = `تصرف في الأصل ${asset.code} ${asset.name}`
    + (analysis.hasGain ? ` — ربح ${analysis.gain.toFixed(2)} ج.م` : "")
    + (analysis.hasLoss ? ` — خسارة ${analysis.loss.toFixed(2)} ج.م` : "");

  await postEntry({
    date: disposalDate,
    sourceType: "asset_disposal",
    sourceId,
    narration,
    lines,
    coa,
    createdBy: userName,
  });

  /* Mark asset as disposed in the assets collection */
  await markAssetDisposed(asset.id, {
    disposalDate,
    disposalAmount: analysis.proceeds,
    disposalNotes: notes || "",
  }, userName);

  return { analysis, sourceId };
}
