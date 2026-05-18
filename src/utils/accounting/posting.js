/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · Posting Engine
   ───────────────────────────────────────────────────────────────────────
   Core utility that builds a balanced journal entry for a given source
   operation and writes it to the appropriate day document.

   Public API:
   - postEntry({date, sourceType, sourceId, narration, lines, partyHint, createdBy})
       → upserts an entry; idempotent on (sourceType, sourceId, date).
   - reverseEntry({date, sourceType, sourceId, reason, createdBy})
       → if a non-void entry exists, posts a mirror "void" entry that
         negates each line, then marks the original as void.
   - postManualEntry({date, narration, lines, createdBy})
       → user-typed entry; no source linkage; always appends.

   Validation rules enforced (throw on failure — caller decides how to surface):
   - At least 2 lines.
   - Each line has either a debit > 0 OR credit > 0 (not both, not neither).
   - Σ debits === Σ credits (within 0.01 tolerance).
   - All accountIds resolve to leaf accounts in the supplied CoA.
   ═══════════════════════════════════════════════════════════════════════ */

import { gid } from "../format.js";
import { mutateDay, findEntryBySource, toDayId } from "./dayDoc.js";
import { getAccount } from "./coa.js";

const TOLERANCE = 0.01;

/* Pure: validate a journal entry's lines. Throws on failure. */
export function validateLines(lines, coa){
  if(!Array.isArray(lines) || lines.length < 2){
    throw new Error("القيد يحتاج سطرين على الأقل (مدين ودائن)");
  }
  let totalDr = 0, totalCr = 0;
  lines.forEach((l,i) => {
    const dr = Number(l.debit)||0;
    const cr = Number(l.credit)||0;
    if(dr<0 || cr<0) throw new Error(`السطر ${i+1}: لا يمكن أن يكون سالباً`);
    if(dr>0 && cr>0) throw new Error(`السطر ${i+1}: لا يمكن أن يكون مدين ودائن في نفس السطر`);
    if(dr===0 && cr===0) throw new Error(`السطر ${i+1}: يجب أن يكون مدين أو دائن`);
    if(!l.accountId) throw new Error(`السطر ${i+1}: حساب غير محدد`);
    if(coa){
      const acct = getAccount(coa, l.accountId);
      if(!acct) throw new Error(`السطر ${i+1}: حساب غير موجود في الشجرة`);
      if(!acct.isLeaf) throw new Error(`السطر ${i+1}: لا يمكن الترحيل إلى حساب أم — اختر حساب فرعي`);
    }
    totalDr += dr;
    totalCr += cr;
  });
  if(Math.abs(totalDr - totalCr) > TOLERANCE){
    throw new Error(`القيد غير متوازن: مدين ${totalDr.toFixed(2)} ≠ دائن ${totalCr.toFixed(2)}`);
  }
  return {totalDr, totalCr};
}

/* Pure: round each line to 2 decimals + attach accountCode for human display.
   V18.41: also preserves multi-currency fields (fcAmount, fcCurrency, fxRate).
   These describe the foreign-currency dimension of the line; debit/credit
   are ALWAYS in the functional currency (EGP) for consistent reporting. */
function normalizeLines(lines, coa){
  return lines.map(l => {
    const acct = coa ? getAccount(coa, l.accountId) : null;
    const dr = Math.round((Number(l.debit)||0)*100)/100;
    const cr = Math.round((Number(l.credit)||0)*100)/100;
    const fcAmount = (l.fcAmount !== undefined && l.fcAmount !== null && l.fcAmount !== "")
      ? Math.round((Number(l.fcAmount)||0)*100)/100
      : null;
    return {
      accountId:   l.accountId,
      accountCode: acct ? acct.code : (l.accountCode || ""),
      accountName: acct ? acct.name : (l.accountName || ""),
      debit:       dr,
      credit:      cr,
      ...(l.partyId   ? {partyId: l.partyId}     : {}),
      ...(l.partyName ? {partyName: l.partyName} : {}),
      ...(l.note      ? {note: l.note}            : {}),
      /* V18.41 — currency-tracking fields, only stored when the line is
         denominated in a non-functional currency. */
      ...(fcAmount && l.fcCurrency && l.fcCurrency !== "EGP"
        ? {fcAmount, fcCurrency: l.fcCurrency, fxRate: Number(l.fxRate)||0}
        : {}),
    };
  });
}

/* Generate a human-readable entry reference number using the year + a per-doc
   sequential. Falls back to a gid suffix if we can't read existing entries. */
export function buildRefNo(date, dayEntries){
  const year = String(date).slice(0,4);
  const seq  = ((dayEntries||[]).length + 1).toString().padStart(4,"0");
  return `JE-${year}-${seq}`;
}

/* Idempotent post: writes a new entry, OR updates an existing one matched by
   (sourceType, sourceId) on the same date. Returns the resulting entry. */
export async function postEntry({date, sourceType, sourceId, narration, lines, coa, createdBy, refNoOverride}){
  validateLines(lines, coa);
  const dayId = toDayId(date);
  const norm  = normalizeLines(lines, coa);
  const now   = new Date().toISOString();

  return await mutateDay(dayId, (cur) => {
    /* Check for existing auto-posted entry */
    const existingIdx = (sourceType && sourceId)
      ? cur.findIndex(e => e.sourceType===sourceType && e.sourceId===sourceId && e.status!=="void")
      : -1;

    if(existingIdx >= 0){
      /* V21.9.87 (Accounting audit Bug #3): no-op if lines unchanged.
         Pre-V21.9.87 we always overwrote `lines` in-place, even when the
         new norm was identical. That meant retries / re-posts silently
         mutated entries without any audit trail or refNo change — external
         reconciliation software that cached refNo→amount mappings missed
         the silent corrections. Now: only update if lines genuinely differ.
         When they differ, we still update in-place (preserving id+refNo+
         createdAt) but emit a console.warn so the change is traceable.
         A more formal void+repost flow is a TODO — requires audit-trail
         design (e.g., entry.editHistory[]). */
      const next = [...cur];
      const old = next[existingIdx];
      const linesUnchanged = JSON.stringify(old.lines) === JSON.stringify(norm);
      if (linesUnchanged) {
        return cur;/* truly idempotent — skip */
      }
      console.warn("[V21.9.87 postEntry] lines mutated on idempotent re-post", {
        sourceType, sourceId, refNo: old.refNo, dayId,
      });
      next[existingIdx] = {
        ...old,
        narration: narration || old.narration,
        lines: norm,
        editedAt: now,
        editedBy: createdBy || old.editedBy || "",
      };
      return next;
    }

    /* New entry */
    const entry = {
      id: gid(),
      refNo: refNoOverride || buildRefNo(dayId, cur),
      narration: narration || "",
      sourceType: sourceType || "manual",
      sourceId: sourceId || null,
      lines: norm,
      status: "posted",
      createdAt: now,
      createdBy: createdBy || "",
    };
    return [...cur, entry];
  });
}

/* Reverse an auto-posted entry. Two-step:
   1. Find existing entry by (sourceType, sourceId, date).
   2. If found and non-void: append a reversal entry whose lines flip Dr<->Cr,
      and mark both with cross-references (voidedBy / voidsEntry). */
export async function reverseEntry({date, sourceType, sourceId, reason, createdBy}){
  if(!sourceType || !sourceId) return {reversed:false, reason:"sourceType/sourceId مفقود"};
  const dayId = toDayId(date);
  const found = await findEntryBySource(dayId, sourceType, sourceId);
  if(!found) return {reversed:false, reason:"لا يوجد قيد مرتبط"};

  const original = found.entry;
  if(original.status === "void") return {reversed:false, reason:"القيد ملغى مسبقاً"};

  const reversalId = gid();
  const reversedLines = original.lines.map(l => ({
    accountId:   l.accountId,
    accountCode: l.accountCode,
    accountName: l.accountName,
    debit:       l.credit,
    credit:      l.debit,
    ...(l.partyId   ? {partyId: l.partyId}     : {}),
    ...(l.partyName ? {partyName: l.partyName} : {}),
    /* V18.41 — preserve currency dimension on reversal */
    ...(l.fcAmount ? {fcAmount: l.fcAmount, fcCurrency: l.fcCurrency, fxRate: l.fxRate} : {}),
  }));
  const now = new Date().toISOString();

  await mutateDay(dayId, (cur) => {
    const next = cur.map(e => e.id === original.id
      ? {...e, status:"void", voidedBy: reversalId, voidedAt: now}
      : e);
    next.push({
      id: reversalId,
      refNo: buildRefNo(dayId, next) + "-VOID",
      narration: `إلغاء قيد ${original.refNo}${reason ? " — "+reason : ""}`,
      sourceType: sourceType + ":reversal",
      sourceId: sourceId,
      voidsEntry: original.id,
      lines: reversedLines,
      status: "posted",
      createdAt: now,
      createdBy: createdBy || "",
    });
    return next;
  });

  return {reversed:true, originalId: original.id, reversalId};
}

/* Manual entry: no source linkage. Always appends. */
export async function postManualEntry({date, narration, lines, coa, createdBy}){
  validateLines(lines, coa);
  return await postEntry({
    date, sourceType:"manual", sourceId:null,
    narration, lines, coa, createdBy
  });
}
