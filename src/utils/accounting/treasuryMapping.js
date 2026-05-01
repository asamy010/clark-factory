/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · Treasury Account Mapping
   ───────────────────────────────────────────────────────────────────────
   Bridges data.treasuryAccounts (cash boxes, banks) with the chart of
   accounts. Each treasury can be mapped to its OWN sub-account in the
   CoA so reports show balances per-cashbox / per-bank instead of one
   consolidated 1110 / 1120 figure.

   ─── Design choice: subaccounts as SIBLINGS under 1100 ───
   New treasury sub-accounts (1111, 1112, ..., 1121, 1122, ...) are added
   as children of 1100 (the group), NOT as children of 1110/1120. This
   preserves 1110 and 1120 as LEAF "fallback" accounts so existing posted
   entries (which reference 1110) keep working without migration.

   Tree shape after seeding:
     1100 — النقدية والبنوك (group)
     ├── 1110 — الخزينة الرئيسية (leaf, fallback for unmapped cash)
     ├── 1111 — MAIN CASH (leaf, mapped to "MAIN CASH" treasury)
     ├── 1112 — SUB CASH (leaf, mapped to "SUB CASH" treasury)
     ├── 1120 — البنوك (leaf, fallback for unmapped bank)
     ├── 1121 — CIB BANK (leaf, mapped to "CIB BANK" treasury)
     └── 1130 — شيكات تحت التحصيل (leaf, fixed)

   ─── Storage ───
     data.treasuryAccountMap = { [treasuryAccountId]: coaCode }

   ─── Public API ───
     resolveTreasuryAccount(treasuryAccountId, treasuryType, config) → coaCode
     resolveTreasuryAccountByName(name, config) → coaCode
     buildAutoSeedPlan(treasuryAccounts, coa, currentMap, parent1100Id) → plan
     applyAutoSeedPlan(plan, upConfig) → mutates config
     findOrphanMappings(treasuryAccounts, coa, map) → []
   ═══════════════════════════════════════════════════════════════════════ */

import { getAccountByCode } from "./coa.js";

export const FALLBACK_CASH_CODE = "1110";
export const FALLBACK_BANK_CODE = "1120";
export const TREASURY_GROUP_CODE = "1100";

/* Resolve the CoA code for a given treasury account.
   Always returns a code (never null) — falls back to 1110/1120 when
   no explicit mapping exists. */
export function resolveTreasuryAccount(treasuryAccountId, treasuryType, config){
  const map = (config && config.treasuryAccountMap) || {};
  if(treasuryAccountId && map[treasuryAccountId]){
    return map[treasuryAccountId];
  }
  return treasuryType === "bank" ? FALLBACK_BANK_CODE : FALLBACK_CASH_CODE;
}

/* Same but looks up the treasury type from the treasuryAccounts list using
   its name (since transactions store t.account = treasury.name). */
export function resolveTreasuryAccountByName(treasuryAccountName, config){
  if(!treasuryAccountName) return FALLBACK_CASH_CODE;
  const list = (config && config.treasuryAccounts) || [];
  const t = list.find(x => x && (x.id === treasuryAccountName || x.name === treasuryAccountName));
  if(t) return resolveTreasuryAccount(t.id, t.type, config);
  return FALLBACK_CASH_CODE;
}

/* Pick the next available code in the 11xx range that's NOT already in
   the CoA. Skips reserved codes (1100, 1110, 1120, 1130) and the codes
   already allocated within this plan. */
function pickNextCode(usedCodes, type){
  const reserved = new Set(["1100","1110","1120","1130"]);
  /* Cash range: 1111-1119 then 11A0...
     Bank range: 1121-1129 */
  const startBase = type === "bank" ? "112" : "111";
  for(let d=1; d<=9; d++){
    const code = startBase + d;
    if(!reserved.has(code) && !usedCodes.has(code)) return code;
  }
  /* Overflow: try the OTHER range's leftover (rare — only if user has 9+
     of one type). 1140-1149 as last resort. */
  for(let d=0; d<=9; d++){
    const code = "114" + d;
    if(!usedCodes.has(code)) return code;
  }
  return null;/* truly exhausted */
}

/* Build a plan listing what would be auto-created and mapped. The user
   reviews this in the UI before applying. Pure function. */
export function buildAutoSeedPlan(treasuryAccounts, coa, currentMap){
  const map = currentMap || {};
  const creates = [];
  const mappings = {};
  const skipped  = [];
  /* Codes already allocated (in CoA + within this plan run) */
  const used = new Set((coa||[]).map(a => a.code));

  (treasuryAccounts||[]).forEach(t => {
    if(!t || !t.id) return;
    if(map[t.id]){
      /* Already mapped — but verify the CoA code still exists */
      const code = map[t.id];
      const exists = (coa||[]).some(a => a.code === code);
      if(exists){
        skipped.push({treasuryId: t.id, name: t.name, reason: "already-mapped", code});
      } else {
        skipped.push({treasuryId: t.id, name: t.name, reason: "mapping-orphan", code});
      }
      return;
    }
    const isBank = t.type === "bank";
    const newCode = pickNextCode(used, isBank ? "bank" : "cash");
    if(!newCode){
      skipped.push({treasuryId: t.id, name: t.name, reason: "exhausted-codes"});
      return;
    }
    used.add(newCode);
    creates.push({
      code: newCode,
      name: t.name || t.id,
      treasuryId: t.id,
      treasuryType: isBank ? "bank" : "cash",
    });
    mappings[t.id] = newCode;
  });

  return {creates, mappings, skipped};
}

/* Apply an auto-seed plan: creates the sub-accounts in the CoA and writes
   the mappings via upConfig. */
export function applyAutoSeedPlan(plan, upConfig){
  if(!plan) return;
  const hasCreates = plan.creates && plan.creates.length > 0;
  const hasMappings = plan.mappings && Object.keys(plan.mappings).length > 0;
  if(!hasCreates && !hasMappings) return;

  upConfig(d => {
    if(!Array.isArray(d.coa)) d.coa = [];
    if(!d.treasuryAccountMap || typeof d.treasuryAccountMap !== "object"){
      d.treasuryAccountMap = {};
    }
    /* Find the 1100 parent — sub-accounts go under it as siblings */
    const parent1100 = d.coa.find(a => a.code === TREASURY_GROUP_CODE);
    if(!parent1100){
      console.warn("[treasuryMapping] 1100 group not found in CoA; cannot seed.");
      return;
    }

    (plan.creates||[]).forEach(c => {
      /* Skip if a CoA account with this code already exists (idempotent) */
      if(d.coa.some(a => a.code === c.code)) return;
      d.coa.push({
        id: "acct_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,7),
        code: c.code,
        name: c.name,
        type: "asset",
        parent: parent1100.id,
        parentCode: TREASURY_GROUP_CODE,
        isLeaf: true,
        system: false,
        treasuryId: c.treasuryId,
        autoCreated: true,
      });
    });
    /* Merge mappings (don't overwrite existing) */
    Object.entries(plan.mappings||{}).forEach(([tId, code]) => {
      if(!d.treasuryAccountMap[tId]) d.treasuryAccountMap[tId] = code;
    });
  });
}

/* Manually link/unlink a single treasury to a CoA code. */
export function setTreasuryMapping(treasuryId, coaCode, upConfig){
  if(!treasuryId) return;
  upConfig(d => {
    if(!d.treasuryAccountMap || typeof d.treasuryAccountMap !== "object"){
      d.treasuryAccountMap = {};
    }
    if(!coaCode){
      delete d.treasuryAccountMap[treasuryId];
    } else {
      d.treasuryAccountMap[treasuryId] = coaCode;
    }
  });
}

/* Detect mappings that point to deleted treasuries or deleted CoA codes. */
export function findOrphanMappings(treasuryAccounts, coa, map){
  const taIds = new Set((treasuryAccounts||[]).map(t => t && t.id).filter(Boolean));
  const codes = new Set((coa||[]).map(a => a.code));
  const orphans = [];
  Object.entries(map||{}).forEach(([tId, code]) => {
    if(!taIds.has(tId)){
      orphans.push({treasuryId: tId, coaCode: code, reason: "treasury-deleted"});
    } else if(!codes.has(code)){
      orphans.push({treasuryId: tId, coaCode: code, reason: "coa-code-deleted"});
    }
  });
  return orphans;
}

/* List candidate CoA accounts (under 1100 group) that a treasury can be
   mapped to. Used to populate the dropdown in the UI. */
export function listMappableAccounts(coa){
  const parent1100 = (coa||[]).find(a => a.code === TREASURY_GROUP_CODE);
  if(!parent1100) return [];
  /* Direct leaf children of 1100 except 1130 (checks-under-collection) */
  return (coa||[])
    .filter(a => a.parent === parent1100.id && a.isLeaf && a.code !== "1130")
    .sort((a,b) => (a.code||"").localeCompare(b.code||"", undefined, {numeric:true}));
}
