/* ═══════════════════════════════════════════════════════════════
   CLARK V21.9.102 — TagPicker (Slice 2 of Universal Tagging)
   ───────────────────────────────────────────────────────────────
   Reusable multi-select picker for tag IDs. Paired with TagFilter
   on the same page (TagFilter = list-level "filter by tag",
   TagPicker = entity-level "set tags on this row").

   API:
     <TagPicker
       entityType="customer" | "supplier" | "item" | "order"
       registry={data.tagRegistry}                     // tag registry array
       value={entity.tags || []}                        // selected tag IDs
       onChange={(tagIds) => ...}                       // selection change
       onRegistryChange={(newRegistry) => ...}          // called when inline-create fires
       allowCreate={isManagerOrAdmin}                   // gate inline create (Manager+Admin only per data-safety decision)
       currentUser={user}                               // for createdBy attribution
       readOnly={false}
       inline={false}                                   // compact chip strip mode (no surrounding card)
       placeholder="إضافة تاج..."
     />

   The component is pure presentation — it does NOT persist anything
   to Firestore. The parent page wires onChange + onRegistryChange
   through its standard upConfig() flow.
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import {
  TAG_COLORS,
  TAG_ENTITY_LABELS,
  TAG_ERRORS,
  createTag,
  getTagsByEntityType,
  resolveTagsForDisplay,
  normalizeTagName,
} from "../utils/tags.js";

/* Deterministic-but-pleasing color assignment for inline-created tags.
   Uses a tiny FNV-1a hash so the same name always produces the same
   palette index. Users can override later from the Settings → Tags page. */
function pickColorForName(name){
  const s = String(name || "").toLowerCase();
  let h = 2166136261 >>> 0;
  for(let i = 0; i < s.length; i++){
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return TAG_COLORS[h % TAG_COLORS.length];
}

/* Render one tag chip. `removable` shows the × button. */
function TagChip({ tag, removable, onRemove, small, dim }){
  if(!tag) return null;
  const bg = tag.color + "22";
  const border = tag.color + "55";
  const fg = tag.color;
  return (
    <span
      style={{
        display:"inline-flex",
        alignItems:"center",
        gap:6,
        padding: small ? "2px 8px" : "3px 10px",
        borderRadius:14,
        background:bg,
        color:fg,
        border:"1px solid "+border,
        fontSize: small ? FS-3 : FS-2,
        fontWeight:600,
        whiteSpace:"nowrap",
        opacity: dim ? 0.55 : 1,
      }}
      title={tag.description || tag.name}
    >
      {tag.icon ? <span style={{fontSize: small ? FS-2 : FS-1}}>{tag.icon}</span> : null}
      <span>{tag.name}</span>
      {removable && (
        <button
          onClick={(e)=>{ e.preventDefault(); e.stopPropagation(); onRemove && onRemove(); }}
          style={{
            background:"transparent",
            border:"none",
            color:fg,
            cursor:"pointer",
            padding:0,
            fontSize: small ? FS-2 : FS-1,
            fontWeight:700,
            opacity:0.7,
            lineHeight:1,
          }}
          title="إزالة"
          aria-label="إزالة"
        >×</button>
      )}
    </span>
  );
}

export function TagPicker({
  entityType,
  registry,
  value,
  onChange,
  onRegistryChange,
  allowCreate,
  currentUser,
  readOnly,
  inline,
  placeholder,
}){
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hi, setHi] = useState(0);
  const [rect, setRect] = useState(null);
  const [errMsg, setErrMsg] = useState("");
  const containerRef = useRef(null);

  const selectedIds = Array.isArray(value) ? value : [];
  const safeRegistry = Array.isArray(registry) ? registry : [];

  /* Resolve current selection for chip display. */
  const selectedTags = useMemo(
    () => resolveTagsForDisplay(selectedIds, safeRegistry, { includeArchived: true }),
    [selectedIds, safeRegistry]
  );

  /* Compute candidates: registry filtered by entityType + active + not-already-selected,
     then narrowed by the search query. */
  const candidates = useMemo(() => {
    const selectedSet = new Set(selectedIds);
    const applicable = getTagsByEntityType(safeRegistry, entityType, { includeArchived: false });
    const available = applicable.filter(t => !selectedSet.has(t.id));
    const q = normalizeTagName(query);
    if(!q) return available.slice(0, 50);
    return available.filter(t => (t.nameLC || "").includes(q)).slice(0, 50);
  }, [safeRegistry, entityType, selectedIds, query]);

  /* True if the query EXACTLY matches an existing (selectable) tag — used to suppress
     the "create new" option when the user just typed the full name of an existing tag. */
  const queryMatchesExisting = useMemo(() => {
    const q = normalizeTagName(query);
    if(!q) return false;
    return safeRegistry.some(t => t && t.nameLC === q);
  }, [safeRegistry, query]);

  const showCreateOption = allowCreate && !readOnly && query.trim().length > 0 && !queryMatchesExisting;

  /* Click-outside to close. Honors the portal-class escape so clicks inside
     the floating dropdown don't trigger close. */
  useEffect(() => {
    if(!open) return;
    const onDown = (e) => {
      if(containerRef.current && containerRef.current.contains(e.target)) return;
      if(e.target.closest && e.target.closest(".tagpicker-portal")) return;
      setOpen(false);
      setQuery("");
      setErrMsg("");
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  /* Track input position so the fixed-position portal stays aligned on scroll. */
  const updateRect = () => {
    if(containerRef.current){
      const r = containerRef.current.getBoundingClientRect();
      setRect({ top: r.bottom, left: r.left, width: Math.max(r.width, 260) });
    }
  };
  useEffect(() => {
    if(!open) return;
    updateRect();
    const onScroll = () => updateRect();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  /* Reset highlight when the candidate list changes. */
  useEffect(() => { setHi(0); }, [query, open]);

  const addTag = (tagId) => {
    if(!tagId || selectedIds.includes(tagId)) return;
    const next = [...selectedIds, tagId];
    onChange && onChange(next);
    setQuery("");
    setErrMsg("");
    /* Keep the picker open so the user can add another. */
  };

  const removeTag = (tagId) => {
    if(readOnly) return;
    const next = selectedIds.filter(id => id !== tagId);
    onChange && onChange(next);
  };

  const handleCreate = (name) => {
    if(!allowCreate) return;
    const clean = String(name || "").trim();
    if(!clean){
      setErrMsg("اكتب اسم التاج أولاً");
      return;
    }
    try{
      const { tag, registry: newReg, isNew, wasArchived } = createTag(
        clean,
        {
          color: pickColorForName(clean),
          appliesTo: entityType ? [entityType] : undefined,
        },
        safeRegistry,
        currentUser
      );
      /* Persist registry change FIRST so the new ID resolves on next render. */
      if(isNew || wasArchived){
        onRegistryChange && onRegistryChange(newReg);
      }
      addTag(tag.id);
      setErrMsg("");
    }catch(e){
      const msg = (e && e.message) || "";
      if(msg.startsWith(TAG_ERRORS.EMPTY)) setErrMsg("اكتب اسم التاج أولاً");
      else setErrMsg("تعذر إنشاء التاج");
    }
  };

  const onKey = (e) => {
    if(e.key === "Escape"){ setOpen(false); setQuery(""); return; }
    if(e.key === "ArrowDown"){
      e.preventDefault();
      const max = candidates.length + (showCreateOption ? 1 : 0) - 1;
      setHi(p => Math.min(p + 1, Math.max(0, max)));
    }
    else if(e.key === "ArrowUp"){
      e.preventDefault();
      setHi(p => Math.max(p - 1, 0));
    }
    else if(e.key === "Enter"){
      e.preventDefault();
      if(hi < candidates.length){
        const t = candidates[hi];
        if(t) addTag(t.id);
      }else if(showCreateOption){
        handleCreate(query);
      }
    }
    else if(e.key === "Backspace" && query === "" && selectedIds.length > 0){
      /* Quick-remove last chip on backspace when input is empty — same UX as gmail's tag chips. */
      e.preventDefault();
      removeTag(selectedIds[selectedIds.length - 1]);
    }
  };

  const wrapStyle = inline
    ? { display:"flex", alignItems:"center", flexWrap:"wrap", gap:6 }
    : {
        display:"flex",
        alignItems:"center",
        flexWrap:"wrap",
        gap:6,
        padding:"6px 10px",
        border:"1px solid "+(open ? T.accent : T.brd),
        borderRadius:8,
        background: readOnly ? T.bg : T.cardSolid,
        minHeight: 38,
        transition:"border 0.15s",
      };

  return (
    <div ref={containerRef} style={{position:"relative", width:"100%"}}>
      <div style={wrapStyle} onClick={() => { if(!readOnly && !open){ setOpen(true); updateRect(); } }}>
        {selectedTags.map(t => (
          <TagChip
            key={t.id}
            tag={t}
            removable={!readOnly}
            onRemove={() => removeTag(t.id)}
            dim={t.archived}
          />
        ))}
        {!readOnly && (
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); if(!open){ setOpen(true); updateRect(); } setErrMsg(""); }}
            onFocus={() => { setOpen(true); updateRect(); }}
            onKeyDown={onKey}
            placeholder={selectedTags.length === 0 ? (placeholder || "إضافة تاج...") : ""}
            style={{
              flex:1,
              minWidth: 80,
              border:"none",
              outline:"none",
              background:"transparent",
              color:T.text,
              fontSize:FS-1,
              fontFamily:"inherit",
              padding:"3px 4px",
            }}
          />
        )}
      </div>

      {open && rect && typeof document !== "undefined" && createPortal(
        <div
          className="tagpicker-portal"
          style={{
            position:"fixed",
            top: rect.top + 4,
            left: rect.left,
            width: rect.width,
            maxHeight: 320,
            overflowY:"auto",
            background: T.cardSolid,
            border:"1px solid "+T.brd,
            borderRadius:8,
            boxShadow:"0 12px 32px rgba(0,0,0,0.22)",
            zIndex: 99999,
            padding: 4,
          }}
        >
          {candidates.length === 0 && !showCreateOption && (
            <div style={{padding:"10px 12px", color:T.textMut, fontSize:FS-1, textAlign:"center"}}>
              {query ? "لا توجد تاجز مطابقة" : "اكتب لإضافة تاج"}
            </div>
          )}

          {candidates.map((t, i) => (
            <div
              key={t.id}
              onMouseDown={(e) => { e.preventDefault(); addTag(t.id); }}
              onMouseEnter={() => setHi(i)}
              style={{
                display:"flex",
                alignItems:"center",
                gap:8,
                padding:"6px 10px",
                cursor:"pointer",
                borderRadius:6,
                background: i === hi ? T.accent + "12" : "transparent",
              }}
            >
              <span style={{
                display:"inline-block",
                width:10,
                height:10,
                borderRadius:"50%",
                background:t.color,
                flexShrink:0,
              }} />
              {t.icon && <span style={{fontSize:FS-1}}>{t.icon}</span>}
              <span style={{fontSize:FS-1, color:T.text, fontWeight:500, flex:1}}>{t.name}</span>
              {t.appliesTo && t.appliesTo.length > 0 && t.appliesTo.length < 4 && (
                <span style={{fontSize:FS-3, color:T.textMut}}>
                  {t.appliesTo.map(et => TAG_ENTITY_LABELS[et] || et).join(" • ")}
                </span>
              )}
            </div>
          ))}

          {showCreateOption && (
            <div
              onMouseDown={(e) => { e.preventDefault(); handleCreate(query); }}
              onMouseEnter={() => setHi(candidates.length)}
              style={{
                display:"flex",
                alignItems:"center",
                gap:8,
                padding:"8px 10px",
                cursor:"pointer",
                borderRadius:6,
                borderTop: candidates.length > 0 ? "1px solid "+T.brd : "none",
                background: hi === candidates.length ? T.ok + "12" : "transparent",
                marginTop: candidates.length > 0 ? 4 : 0,
              }}
            >
              <span style={{
                display:"inline-flex",
                alignItems:"center",
                justifyContent:"center",
                width:18,
                height:18,
                borderRadius:"50%",
                background: T.ok,
                color:"#fff",
                fontWeight:700,
                fontSize: FS-2,
              }}>+</span>
              <span style={{fontSize:FS-1, color:T.text}}>إنشاء تاج جديد: </span>
              <span style={{fontSize:FS-1, color:T.ok, fontWeight:700}}>"{query.trim()}"</span>
            </div>
          )}

          {!allowCreate && query.trim().length > 0 && !queryMatchesExisting && (
            <div style={{padding:"6px 10px", fontSize:FS-3, color:T.textMut, fontStyle:"italic"}}>
              ⚠️ إنشاء التاجز متاح للمديرين فقط
            </div>
          )}

          {errMsg && (
            <div style={{padding:"6px 10px", fontSize:FS-2, color:T.err}}>{errMsg}</div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

/* Read-only chip strip — handy for tables where we want to display tags without
   the picker UI. Renders just the colored chips, comma-separated visually via gap. */
export function TagChips({ tagIds, registry, small, max }){
  const safe = Array.isArray(registry) ? registry : [];
  const tags = resolveTagsForDisplay(tagIds, safe, { includeArchived: false });
  if(tags.length === 0) return null;
  const sliced = (typeof max === "number" && max > 0) ? tags.slice(0, max) : tags;
  const overflow = tags.length - sliced.length;
  return (
    <span style={{display:"inline-flex", flexWrap:"wrap", gap:4, alignItems:"center"}}>
      {sliced.map(t => <TagChip key={t.id} tag={t} small={small} />)}
      {overflow > 0 && (
        <span style={{fontSize:FS-3, color:T.textMut, fontWeight:600}}>+{overflow}</span>
      )}
    </span>
  );
}
