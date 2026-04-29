/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · AccountSelector
   ───────────────────────────────────────────────────────────────────────
   Searchable dropdown of leaf accounts with code+name. Used in the
   journal entry modal and in posting-rules settings.

   Props: { value (id), onChange(id), coa, T, FS, placeholder, allowAll }
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo, useRef, useEffect } from "react";
import { getAccount, getLeafAccounts, getAncestors, ACCOUNT_TYPES } from "../../utils/accounting/coa.js";

export function AccountSelector({value, onChange, coa, T, FS, placeholder, filterType, autoFocus}){
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);
  const inputRef = useRef(null);

  /* close on outside click */
  useEffect(() => {
    const onClick = (e) => {
      if(ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if(open && inputRef.current){ try { inputRef.current.focus(); } catch(e){} }
  }, [open]);

  const allLeaves = useMemo(() => {
    let leaves = getLeafAccounts(coa);
    if(filterType) leaves = leaves.filter(a => a.type === filterType);
    /* annotate each with its parent path for display */
    return leaves.map(a => {
      const ancestors = getAncestors(coa, a.id).slice(0,2);/* up to 2 ancestors for breadcrumb */
      const path = ancestors.reverse().map(p => p.name).join(" › ");
      return {...a, _path: path};
    }).sort((a,b) => (a.code||"").localeCompare(b.code||"", undefined, {numeric:true}));
  }, [coa, filterType]);

  const filtered = useMemo(() => {
    if(!q) return allLeaves;
    const qq = q.trim().toLowerCase();
    return allLeaves.filter(a =>
      String(a.code).includes(qq) ||
      (a.name||"").toLowerCase().includes(qq) ||
      (a._path||"").toLowerCase().includes(qq)
    );
  }, [allLeaves, q]);

  const selected = value ? getAccount(coa, value) : null;
  const selPath  = selected ? getAncestors(coa, selected.id).reverse().map(p => p.name).join(" › ") : "";

  const typeColor = (t) => (ACCOUNT_TYPES.find(x => x.key===t)||{}).color || T.textSec;

  return <div ref={ref} style={{position:"relative", width:"100%"}}>
    <div onClick={() => setOpen(o => !o)} style={{
      padding:"8px 10px", borderRadius:6, border:"1px solid "+T.brd, background:T.cardSolid,
      cursor:"pointer", fontSize:FS-1, minHeight:38, display:"flex", alignItems:"center", justifyContent:"space-between", gap:6,
    }}>
      {selected ? <div style={{flex:1, minWidth:0}}>
        <div style={{display:"flex", alignItems:"center", gap:6}}>
          <span style={{fontFamily:"monospace", fontSize:FS-2, color:typeColor(selected.type), fontWeight:800}}>{selected.code}</span>
          <span style={{fontWeight:700, color:T.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{selected.name}</span>
        </div>
        {selPath && <div style={{fontSize:FS-3, color:T.textMut, marginTop:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{selPath}</div>}
      </div> : <span style={{color:T.textMut}}>{placeholder||"اختر حساب..."}</span>}
      <span style={{color:T.textMut, fontSize:10}}>▾</span>
    </div>
    {open && <div style={{
      position:"absolute", top:"100%", insetInlineStart:0, insetInlineEnd:0, marginTop:4, zIndex:1000,
      background:T.cardSolid, border:"1px solid "+T.brd, borderRadius:8,
      boxShadow:"0 12px 32px rgba(0,0,0,0.18)", maxHeight:340, overflow:"hidden",
      display:"flex", flexDirection:"column",
    }}>
      <div style={{padding:8, borderBottom:"1px solid "+T.brd}}>
        <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
          placeholder="بحث برقم الحساب أو الاسم..." autoFocus={autoFocus}
          style={{width:"100%", padding:"7px 10px", borderRadius:6, border:"1px solid "+T.brd, fontSize:FS-1, background:T.bg, color:T.text}}/>
      </div>
      <div style={{flex:1, overflowY:"auto", padding:4}}>
        {filtered.length === 0 ? <div style={{padding:14, textAlign:"center", color:T.textMut, fontSize:FS-1}}>لا توجد حسابات مطابقة</div>
          : filtered.map(a => <div key={a.id} onClick={() => {onChange(a.id); setOpen(false); setQ("");}} style={{
              padding:"7px 10px", borderRadius:6, cursor:"pointer",
              background: value===a.id ? T.accent+"15" : "transparent",
              borderInlineStart: "3px solid "+typeColor(a.type),
            }} onMouseEnter={(e) => e.currentTarget.style.background = T.accent+"10"}
               onMouseLeave={(e) => e.currentTarget.style.background = value===a.id ? T.accent+"15" : "transparent"}>
              <div style={{display:"flex", alignItems:"center", gap:6}}>
                <span style={{fontFamily:"monospace", fontSize:FS-2, color:typeColor(a.type), fontWeight:800, minWidth:50}}>{a.code}</span>
                <span style={{fontWeight:700, color:T.text}}>{a.name}</span>
              </div>
              {a._path && <div style={{fontSize:FS-3, color:T.textMut, marginTop:1, paddingInlineStart:56}}>{a._path}</div>}
            </div>)}
      </div>
    </div>}
  </div>;
}
