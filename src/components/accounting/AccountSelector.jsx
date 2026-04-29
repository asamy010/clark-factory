/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · AccountSelector
   ───────────────────────────────────────────────────────────────────────
   Searchable dropdown of leaf accounts with code+name. Used in the
   journal entry modal and in posting-rules settings.

   V18.43: dropdown now renders via a React portal at the document body
   level with fixed positioning — escapes all parent `overflow:hidden`
   constraints. Auto-flips to open upward when there's not enough room
   below. Reposition on scroll/resize so the dropdown follows the trigger.

   Props: { value (id), onChange(id), coa, T, FS, placeholder, allowAll }
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { getAccount, getLeafAccounts, getAncestors, ACCOUNT_TYPES } from "../../utils/accounting/coa.js";

const DROPDOWN_HEIGHT = 340;/* keep in sync with maxHeight below */
const DROPDOWN_GAP    = 4;

export function AccountSelector({value, onChange, coa, T, FS, placeholder, filterType, autoFocus}){
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pos, setPos] = useState({top:0, left:0, width:0, openUpward:false});
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  /* Compute dropdown position relative to viewport. Decides whether to open
     upward or downward based on available space. Called on open + on resize/scroll. */
  const recompute = () => {
    if(!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;
    /* Open upward if there's not enough room below AND there's more space above */
    const openUpward = spaceBelow < DROPDOWN_HEIGHT + 20 && spaceAbove > spaceBelow;
    /* Cap height to whatever space is available, leaving 12px breathing room */
    const maxH = Math.min(DROPDOWN_HEIGHT, Math.max(180, openUpward ? spaceAbove - 12 : spaceBelow - 12));
    const top = openUpward ? r.top - maxH - DROPDOWN_GAP : r.bottom + DROPDOWN_GAP;
    setPos({top, left: r.left, width: r.width, openUpward, maxH});
  };

  /* Reposition right after open so the dropdown sits in the right place */
  useLayoutEffect(() => {
    if(open) recompute();
  }, [open]);

  /* Reposition on resize / scroll. Uses scroll capture to catch nested scrollable parents. */
  useEffect(() => {
    if(!open) return;
    const onScroll = () => recompute();
    const onResize = () => recompute();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  /* Close on outside click — checks both trigger AND the portal'd dropdown */
  useEffect(() => {
    if(!open) return;
    const onClick = (e) => {
      const t = e.target;
      if(triggerRef.current && triggerRef.current.contains(t)) return;
      if(dropdownRef.current && dropdownRef.current.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  /* Auto-focus the search input when opened */
  useEffect(() => {
    if(open && inputRef.current){
      try { inputRef.current.focus(); } catch(e){}
    }
  }, [open]);

  const allLeaves = useMemo(() => {
    let leaves = getLeafAccounts(coa);
    if(filterType) leaves = leaves.filter(a => a.type === filterType);
    return leaves.map(a => {
      const ancestors = getAncestors(coa, a.id).slice(0,2);
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

  /* The trigger button */
  const trigger = <div ref={triggerRef} onClick={() => setOpen(o => !o)} style={{
    padding:"8px 10px", borderRadius:6, border:"1px solid "+T.brd, background:T.cardSolid,
    cursor:"pointer", fontSize:FS-1, minHeight:38, display:"flex", alignItems:"center", justifyContent:"space-between", gap:6, width:"100%",
  }}>
    {selected ? <div style={{flex:1, minWidth:0}}>
      <div style={{display:"flex", alignItems:"center", gap:6}}>
        <span style={{fontFamily:"monospace", fontSize:FS-2, color:typeColor(selected.type), fontWeight:800}}>{selected.code}</span>
        <span style={{fontWeight:700, color:T.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{selected.name}</span>
      </div>
      {selPath && <div style={{fontSize:FS-3, color:T.textMut, marginTop:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{selPath}</div>}
    </div> : <span style={{color:T.textMut}}>{placeholder||"اختر حساب..."}</span>}
    <span style={{color:T.textMut, fontSize:10}}>▾</span>
  </div>;

  /* The portal'd dropdown body — rendered into document.body to escape any
     parent overflow. Positioned with fixed coordinates from recompute(). */
  const dropdown = (open && typeof document !== "undefined")
    ? createPortal(<div ref={dropdownRef} style={{
        position:"fixed",
        top: pos.top,
        left: pos.left,
        width: pos.width,
        maxHeight: pos.maxH || DROPDOWN_HEIGHT,
        zIndex: 100002,/* above modals — 10001 */
        background: T.cardSolid,
        border: "1px solid "+T.brd,
        borderRadius: 8,
        boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
        overflow: "hidden",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{padding:8, borderBottom:"1px solid "+T.brd, flexShrink:0}}>
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
            placeholder="بحث برقم الحساب أو الاسم..." autoFocus={autoFocus}
            style={{width:"100%", padding:"7px 10px", borderRadius:6, border:"1px solid "+T.brd, fontSize:FS-1, background:T.bg, color:T.text, boxSizing:"border-box"}}/>
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
      </div>, document.body)
    : null;

  return <div style={{position:"relative", width:"100%"}}>
    {trigger}
    {dropdown}
  </div>;
}
