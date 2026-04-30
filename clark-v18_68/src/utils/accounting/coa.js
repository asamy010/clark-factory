/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · CoA (Chart of Accounts) utilities
   ───────────────────────────────────────────────────────────────────────
   The CoA is stored as a flat array on data.coa. Each node has:
     {
       id:        string (gid),
       code:      string ("1000", "1110", ...) — must be unique
       name:      string (Arabic)
       type:      "asset" | "liability" | "equity" | "revenue" | "expense"
       parent:    string|null (parent id)
       isLeaf:    boolean — only leaves can carry journal entries
       system:    boolean — system-protected, can't be deleted by users
       createdAt: ISO
     }

   Rules enforced:
   - Codes are unique across the tree.
   - A leaf can be promoted to a non-leaf only if it has no entries.
   - A non-leaf can be demoted only if it has no children.
   - Deleting an account requires: no children + no entries.
   - The 5 root types are seeded by the defaults and marked system:true.
   ═══════════════════════════════════════════════════════════════════════ */

export const ACCOUNT_TYPES = [
  {key:"asset",     label:"أصول",         normalBalance:"debit",  color:"#0EA5E9"},
  {key:"liability", label:"خصوم",         normalBalance:"credit", color:"#EF4444"},
  {key:"equity",    label:"حقوق ملكية",   normalBalance:"credit", color:"#8B5CF6"},
  {key:"revenue",   label:"إيرادات",      normalBalance:"credit", color:"#10B981"},
  {key:"expense",   label:"مصروفات",      normalBalance:"debit",  color:"#F59E0B"},
];

export function getAccountType(typeKey){
  return ACCOUNT_TYPES.find(t=>t.key===typeKey) || ACCOUNT_TYPES[0];
}

/* Build a tree (nested children[]) from the flat coa array.
   Returns a sorted array of root nodes; each node has `.children` recursively. */
export function buildCoaTree(coa){
  if(!Array.isArray(coa)||coa.length===0)return [];
  const map = new Map();
  coa.forEach(n => map.set(n.id, {...n, children: []}));
  const roots = [];
  map.forEach(node => {
    if(node.parent && map.has(node.parent)){
      map.get(node.parent).children.push(node);
    } else {
      roots.push(node);
    }
  });
  /* Sort by code at every level */
  const sortRec = (arr) => {
    arr.sort((a,b) => (a.code||"").localeCompare(b.code||"", undefined, {numeric:true}));
    arr.forEach(n => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

/* Get all descendants of an account (recursive). Excludes self. */
export function getDescendants(coa, accountId){
  const tree = buildCoaTree(coa);
  const find = (nodes) => {
    for(const n of nodes){
      if(n.id===accountId) return n;
      const found = find(n.children);
      if(found) return found;
    }
    return null;
  };
  const root = find(tree);
  if(!root) return [];
  const result = [];
  const walk = (node) => {
    node.children.forEach(c => {
      result.push(c);
      walk(c);
    });
  };
  walk(root);
  return result;
}

/* Get all leaf accounts (where isLeaf=true). Used for posting. */
export function getLeafAccounts(coa){
  return (coa||[]).filter(a => a.isLeaf);
}

/* Lookup by id — used heavily in aggregation. */
export function getAccount(coa, id){
  return (coa||[]).find(a => a.id===id) || null;
}

/* Lookup by code — used by auto-posting rules + by humans typing. */
export function getAccountByCode(coa, code){
  if(!code) return null;
  return (coa||[]).find(a => a.code===String(code)) || null;
}

/* Validation: code must be unique (excluding self for edits). */
export function isCodeUnique(coa, code, excludeId){
  if(!code) return false;
  return !(coa||[]).some(a => a.code===String(code) && a.id!==excludeId);
}

/* Compute the next sibling code under a given parent. Best-effort —
   takes the max child code and increments by 10 (or 1000 for roots). */
export function suggestNextCode(coa, parentId){
  const siblings = (coa||[]).filter(a => a.parent===parentId);
  if(siblings.length===0){
    /* New top-level: parent dictates start. If parent given, use parent.code+"100" */
    if(parentId){
      const parent = getAccount(coa, parentId);
      if(parent) return String(parent.code)+"00";
    }
    return "1000";
  }
  const codes = siblings.map(s => parseInt(String(s.code).replace(/\D/g,""),10)).filter(n => !isNaN(n));
  if(codes.length===0) return "";
  const max = Math.max(...codes);
  /* Find the parent's code length to maintain hierarchy */
  return String(max + (siblings[0].code.length>3?10:100));
}

/* Walk up the tree from a leaf to its root, returning the chain.
   Used in trial balance to roll up sub-totals. */
export function getAncestors(coa, accountId){
  const chain = [];
  let cur = getAccount(coa, accountId);
  while(cur && cur.parent){
    cur = getAccount(coa, cur.parent);
    if(cur) chain.push(cur);
  }
  return chain;
}

/* Determine if an account can be safely deleted.
   Returns {ok:boolean, reason?:string} */
export function canDeleteAccount(coa, accountId, allEntries){
  const acct = getAccount(coa, accountId);
  if(!acct) return {ok:false, reason:"الحساب غير موجود"};
  if(acct.system) return {ok:false, reason:"حساب نظام محمي — لا يمكن حذفه"};
  /* Check for children */
  const hasChildren = (coa||[]).some(a => a.parent===accountId);
  if(hasChildren) return {ok:false, reason:"الحساب له حسابات فرعية — احذفها أولاً أو انقلها"};
  /* Check for entries */
  const used = (allEntries||[]).some(e => (e.lines||[]).some(l => l.accountId===accountId));
  if(used) return {ok:false, reason:"الحساب مستخدم في قيود — لا يمكن حذفه (حول الرصيد لحساب آخر بقيد تسوية)"};
  return {ok:true};
}
