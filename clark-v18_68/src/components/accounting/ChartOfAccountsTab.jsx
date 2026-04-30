/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · ChartOfAccountsTab
   ───────────────────────────────────────────────────────────────────────
   Visual tree of accounts with inline expand/collapse, add/edit/delete,
   and a "📥 شجرة افتراضية" button to seed a default Egyptian-garment CoA.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { Btn, Card, Inp, Sel } from "../ui.jsx";
import { ACCOUNT_TYPES, buildCoaTree, getAccount, isCodeUnique, suggestNextCode, canDeleteAccount } from "../../utils/accounting/coa.js";
import { DEFAULT_COA } from "../../utils/accounting/coaDefaults.js";
import { gid } from "../../utils/format.js";
import { ask, tell } from "../../utils/popups.js";

const TYPE_COLOR = Object.fromEntries(ACCOUNT_TYPES.map(t => [t.key, t.color]));
const TYPE_LABEL = Object.fromEntries(ACCOUNT_TYPES.map(t => [t.key, t.label]));

/* V18.68: analyze which DEFAULT_COA codes are missing from the current tree.
   Returns { missing: [...], existing: number, alreadyUpToDate: boolean }.
   Pure function — no side effects. */
function analyzeMissingDefaults(coa){
  const codes = new Set((coa || []).map(a => a.code));
  const missing = DEFAULT_COA.filter(d => !codes.has(d.code));
  return {
    missing,
    existing: (coa || []).length,
    matched: DEFAULT_COA.length - missing.length,
    alreadyUpToDate: missing.length === 0,
  };
}

export function ChartOfAccountsTab({coa, allEntries, upConfig, T, FS, isMob, showToast, userName}){
  const [expanded, setExpanded] = useState(new Set());/* expanded node ids */
  const [editing, setEditing] = useState(null);/* {id?, code, name, type, parent, isLeaf} */
  const [search, setSearch] = useState("");
  const [freshlyAdded, setFreshlyAdded] = useState(new Set());/* V18.68: codes added by upgrade (highlight 30s) */

  const tree = useMemo(() => buildCoaTree(coa), [coa]);
  const isEmpty = !Array.isArray(coa) || coa.length === 0;

  /* V18.68: live analysis of missing defaults — drives the upgrade button visibility */
  const missingAnalysis = useMemo(() => analyzeMissingDefaults(coa), [coa]);

  /* Initialize expanded with all root nodes once on first render */
  useState(() => {
    if(tree.length>0){
      const init = new Set(tree.map(t => t.id));
      setExpanded(init);
    }
  });

  const toggleExpand = (id) => setExpanded(p => {
    const n = new Set(p);
    if(n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const startAdd = (parent) => {
    const parentNode = parent ? getAccount(coa, parent) : null;
    setEditing({
      code: suggestNextCode(coa, parent),
      name: "",
      type: parentNode ? parentNode.type : "asset",
      parent: parent,
      isLeaf: true,
    });
  };

  const startEdit = (node) => setEditing({...node});

  const cancelEdit = () => setEditing(null);

  const saveEdit = () => {
    const e = editing;
    if(!e.code || !e.name){ showToast("⚠️ ادخل الكود والاسم"); return; }
    if(!isCodeUnique(coa, e.code, e.id)){ showToast("⚠️ الكود مستخدم — اختر كود آخر"); return; }
    upConfig(d => {
      if(!d.coa) d.coa = [];
      if(e.id){
        /* edit */
        const idx = d.coa.findIndex(a => a.id === e.id);
        if(idx>=0) d.coa[idx] = {...d.coa[idx], code:e.code, name:e.name, type:e.type, isLeaf:!!e.isLeaf};
      } else {
        /* add */
        d.coa.push({
          id: gid(), code:e.code, name:e.name, type:e.type, parent:e.parent||null,
          isLeaf: !!e.isLeaf, system:false, createdAt: new Date().toISOString(), createdBy: userName||"",
        });
      }
    });
    setEditing(null);
    showToast("✓ تم الحفظ");
  };

  const removeAccount = (node) => {
    const c = canDeleteAccount(coa, node.id, allEntries);
    if(!c.ok){ showToast("⚠️ "+c.reason); return; }
    if(!confirm(`حذف حساب "${node.name}" (${node.code})؟`)) return;
    upConfig(d => {
      d.coa = (d.coa||[]).filter(a => a.id !== node.id);
    });
    showToast("✓ تم الحذف");
  };

  /* V18.68: initial seed (only when CoA is empty). Same as before. */
  const seedDefaults = () => {
    upConfig(d => {
      if(!d.coa) d.coa = [];
      const codeMap = new Map();
      d.coa.forEach(a => codeMap.set(a.code, a.id));
      const newOnes = [];
      DEFAULT_COA.forEach(def => {
        if(codeMap.has(def.code)) return;
        const id = gid();
        newOnes.push({id, code:def.code, name:def.name, type:def.type, parentCode:def.parentCode, isLeaf:def.isLeaf, system:def.system});
        codeMap.set(def.code, id);
      });
      newOnes.forEach(a => {
        d.coa.push({
          id:a.id, code:a.code, name:a.name, type:a.type,
          parent: a.parentCode ? (codeMap.get(a.parentCode) || null) : null,
          isLeaf:a.isLeaf, system:a.system,
          createdAt: new Date().toISOString(), createdBy:"system",
        });
      });
    });
    showToast("✅ تم زرع شجرة الحسابات الافتراضية");
  };

  /* V18.68: smart upgrade — adds ONLY missing accounts, preserves everything else.
     Shows a confirmation with the breakdown, takes a backup, then applies. */
  const upgradeToLatest = async () => {
    const analysis = analyzeMissingDefaults(coa);
    if(analysis.alreadyUpToDate){
      await tell("شجرتك محدّثة", "كل الحسابات الافتراضية موجودة بالفعل — لا يوجد ما يضاف", { danger: false });
      return;
    }

    /* Build a human-readable list of what's about to be added */
    const list = analysis.missing.slice(0, 12).map(m => `• ${m.code} — ${m.name}`).join("\n");
    const more = analysis.missing.length > 12 ? `\n... و ${analysis.missing.length - 12} حساب آخر` : "";

    const ok = await ask(
      "ترقية شجرة الحسابات",
      `سيتم إضافة ${analysis.missing.length} حساب جديد بدون تعديل أي حساب موجود:\n\n${list}${more}\n\n` +
      `سيتم أيضاً حفظ نسخة احتياطية من الشجرة الحالية تلقائياً.\n\n` +
      `هل تريد المتابعة؟`,
      { danger: false, confirmText: "⬆️ ترقية" },
    );
    if(!ok) return;

    /* Apply the upgrade with backup, in a single config mutation */
    const newCodes = new Set(analysis.missing.map(m => m.code));
    upConfig(d => {
      if(!d.coa) d.coa = [];
      /* Backup BEFORE any change — under a timestamped key */
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      d[`coa_backup_pre_upgrade_${ts}`] = JSON.parse(JSON.stringify(d.coa));

      /* Build code → id map (existing + about to be added) */
      const codeMap = new Map();
      d.coa.forEach(a => codeMap.set(a.code, a.id));

      /* Pass 1: assign ids to all new accounts so parent links can resolve */
      const newOnes = [];
      analysis.missing.forEach(def => {
        const id = gid();
        newOnes.push({
          id,
          code: def.code,
          name: def.name,
          type: def.type,
          parentCode: def.parentCode,
          isLeaf: def.isLeaf,
          system: def.system,
        });
        codeMap.set(def.code, id);
      });

      /* Pass 2: push them to coa with resolved parent ids */
      newOnes.forEach(a => {
        d.coa.push({
          id: a.id,
          code: a.code,
          name: a.name,
          type: a.type,
          parent: a.parentCode ? (codeMap.get(a.parentCode) || null) : null,
          isLeaf: a.isLeaf,
          system: a.system,
          createdAt: new Date().toISOString(),
          createdBy: "system-upgrade",
        });
      });
    });

    /* Highlight the freshly-added accounts for 30 seconds */
    setFreshlyAdded(newCodes);
    setTimeout(() => setFreshlyAdded(new Set()), 30000);

    showToast(`✨ تم إضافة ${analysis.missing.length} حساب جديد`);
  };

  /* Filter helper for search */
  const matchesSearch = (node) => {
    if(!search) return true;
    const q = search.trim().toLowerCase();
    return String(node.code).includes(q) || (node.name||"").toLowerCase().includes(q);
  };

  /* Recursive renderer. nodeMatches OR has any descendant matching → render. */
  const renderNode = (node, depth) => {
    const directMatch = matchesSearch(node);
    const childrenRendered = (node.children||[]).map(c => renderNode(c, depth+1)).filter(Boolean);
    if(!directMatch && childrenRendered.length===0) return null;
    const isOpen = expanded.has(node.id) || (search && childrenRendered.length>0);
    const color = TYPE_COLOR[node.type] || T.textSec;
    const isFresh = freshlyAdded.has(node.code);

    return <div key={node.id}>
      <div style={{
        display:"flex", alignItems:"center", gap:8, padding:"8px 10px", borderRadius:6,
        marginInlineStart: depth*16,
        background: isFresh ? T.warn+"15" : (depth===0 ? color+"08" : T.bg),
        borderInlineStart: depth===0 ? `3px solid ${color}` : `1px solid ${T.brd}`,
        marginBottom:3,
        boxShadow: isFresh ? `0 0 0 2px ${T.warn}40` : "none",
        transition: "background 0.3s, box-shadow 0.3s",
      }}>
        {/* expand arrow (only for non-leaves) */}
        {!node.isLeaf ? <span onClick={() => toggleExpand(node.id)} style={{cursor:"pointer", fontSize:11, width:14, color:T.textSec, fontWeight:800}}>{isOpen?"▾":"▸"}</span>
                      : <span style={{width:14, fontSize:10, color:T.textMut}}>•</span>}
        <span style={{fontFamily:"monospace", fontSize:FS-1, color, fontWeight:800, minWidth:60}}>{node.code}</span>
        <span style={{fontWeight: node.isLeaf?600:800, color:T.text, flex:1}}>{node.name}</span>
        {isFresh && <span style={{
          fontSize:FS-3, color:"#fff", padding:"2px 8px", background:T.warn,
          borderRadius:10, fontWeight:800, whiteSpace:"nowrap",
        }}>✨ جديد</span>}
        <span style={{fontSize:FS-3, color:T.textMut, padding:"2px 8px", background:color+"12", borderRadius:4, fontWeight:700}}>{TYPE_LABEL[node.type]}</span>
        {node.system && <span style={{fontSize:FS-3, color:T.warn, padding:"2px 6px", background:T.warn+"12", borderRadius:4, fontWeight:700}} title="حساب نظام محمي">🔒</span>}
        {!node.isLeaf && <Btn small ghost onClick={() => startAdd(node.id)} title="إضافة فرعي" style={{fontSize:11}}>＋</Btn>}
        <Btn small ghost onClick={() => startEdit(node)} title="تعديل" style={{fontSize:11}}>✏️</Btn>
        {!node.system && <Btn small ghost onClick={() => removeAccount(node)} title="حذف" style={{fontSize:11, color:T.err}}>🗑</Btn>}
      </div>
      {isOpen && childrenRendered}
    </div>;
  };

  return <Card title="🌳 شجرة الحسابات" style={{marginBottom:16}}>
    <div style={{display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginBottom:14}}>
      <Inp value={search} onChange={setSearch} placeholder="🔎 بحث في شجرة الحسابات..." style={{flex:1, minWidth:200}}/>
      <Btn primary onClick={() => startAdd(null)}>➕ حساب رئيسي جديد</Btn>
      {isEmpty && <Btn onClick={seedDefaults} style={{background:T.ok, color:"#fff", border:"none", fontWeight:800}}>📥 شجرة افتراضية</Btn>}
      {/* V18.68: smart upgrade — visible only when CoA is non-empty AND has missing defaults */}
      {!isEmpty && missingAnalysis.missing.length > 0 && <Btn
        onClick={upgradeToLatest}
        style={{
          background:"linear-gradient(135deg, "+T.warn+", "+T.warn+"DD)",
          color:"#fff", border:"none", fontWeight:800,
          boxShadow:"0 2px 8px "+T.warn+"40",
        }}
        title={`${missingAnalysis.missing.length} حساب جديد متاح للإضافة`}
      >
        ⬆️ ترقية للحسابات الجديدة
        <span style={{
          marginInlineStart:6, padding:"2px 8px", background:"rgba(255,255,255,0.25)",
          borderRadius:10, fontSize:FS-3, fontWeight:800,
        }}>+{missingAnalysis.missing.length}</span>
      </Btn>}
    </div>

    {isEmpty ? <div style={{padding:30, textAlign:"center", color:T.textMut, background:T.bg, borderRadius:10, border:"1px dashed "+T.brd}}>
      <div style={{fontSize:36, marginBottom:8}}>🌱</div>
      <div style={{fontSize:FS, fontWeight:700, color:T.text, marginBottom:4}}>شجرة الحسابات فارغة</div>
      <div style={{fontSize:FS-1, color:T.textSec, marginBottom:14}}>ابدأ بزرع الشجرة الافتراضية أو أضف حساباتك بنفسك</div>
      <Btn onClick={seedDefaults} style={{background:T.ok, color:"#fff", border:"none", fontWeight:800, padding:"10px 24px"}}>📥 زرع الشجرة الافتراضية</Btn>
    </div> : <div style={{maxHeight:600, overflowY:"auto", paddingInlineEnd:6}}>
      {tree.map(t => renderNode(t, 0))}
    </div>}

    {/* Edit / Add modal */}
    {editing && <div className="pop-overlay" style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:16}} onClick={cancelEdit}>
      <div onClick={e => e.stopPropagation()} style={{background:T.cardSolid, borderRadius:14, padding:24, width:"100%", maxWidth:500, border:"1px solid "+T.brd, boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16}}>
          <div style={{fontSize:FS+1, fontWeight:800, color:T.accent}}>{editing.id ? "✏️ تعديل حساب" : "➕ حساب جديد"}</div>
          <Btn ghost small onClick={cancelEdit}>✕</Btn>
        </div>
        <div style={{display:"flex", flexDirection:"column", gap:10, marginBottom:16}}>
          <div><label style={{fontSize:FS-2, color:T.textSec, fontWeight:700, display:"block", marginBottom:4}}>الكود *</label>
            <Inp value={editing.code} onChange={v => setEditing(p => ({...p, code:v}))} placeholder="1110"/></div>
          <div><label style={{fontSize:FS-2, color:T.textSec, fontWeight:700, display:"block", marginBottom:4}}>الاسم *</label>
            <Inp value={editing.name} onChange={v => setEditing(p => ({...p, name:v}))} placeholder="الخزينة الرئيسية"/></div>
          <div><label style={{fontSize:FS-2, color:T.textSec, fontWeight:700, display:"block", marginBottom:4}}>النوع</label>
            <Sel value={editing.type} onChange={v => setEditing(p => ({...p, type:v}))}>
              {ACCOUNT_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </Sel></div>
          <div onClick={() => setEditing(p => ({...p, isLeaf: !p.isLeaf}))} style={{display:"flex", alignItems:"center", gap:8, padding:"8px 10px", borderRadius:6, background:T.bg, border:"1px solid "+T.brd, cursor:"pointer"}}>
            <span style={{fontSize:18, color:editing.isLeaf?T.accent:T.textMut, fontWeight:800}}>{editing.isLeaf?"☑":"☐"}</span>
            <span style={{fontSize:FS-1, fontWeight:700, color:T.text}}>حساب فرعي (يقبل قيوداً مباشرة)</span>
          </div>
          <div style={{fontSize:FS-3, color:T.textMut, lineHeight:1.5}}>
            💡 <b>الحساب الفرعي</b> هو اللي بتترحل عليه القيود مباشرة (مثلاً: الخزينة، عميل، إيجار). الحساب الأم (مش فرعي) بيكون للتجميع فقط.
          </div>
        </div>
        <div style={{display:"flex", gap:8, justifyContent:"flex-end", paddingTop:12, borderTop:"1px solid "+T.brd}}>
          <Btn ghost onClick={cancelEdit}>↩️ إلغاء</Btn>
          <Btn primary onClick={saveEdit} style={{background:T.ok, color:"#fff", border:"none", fontWeight:800, padding:"10px 24px"}}>💾 حفظ</Btn>
        </div>
      </div>
    </div>}
  </Card>;
}
