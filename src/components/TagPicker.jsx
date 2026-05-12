/* ═══════════════════════════════════════════════════════════════════════
   CLARK · TagPicker (V21.11.3 — #10 Slice 2)
   ───────────────────────────────────────────────────────────────────────
   Reusable multi-select tag picker for entity edit forms.

   Props:
     - entityType: "customer" | "supplier" | "item" | "order" | ...
     - value: string[] (tag IDs)
     - onChange: (tagIds: string[]) => void
     - registry: tagRegistry array (from config)
     - readOnly?: boolean
     - placeholder?: string

   Behavior:
     - Filters registry by appliesTo.includes(entityType) && !archived
     - Toggle to select/deselect
     - Shows color-coded chips for selected tags
     - "Add" mode shows the filtered dropdown for unselected tags
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import {
  resolveTagsForDisplay, getTagsForEntityType,
} from "../utils/tags.js";

export function TagPicker({
  entityType, value = [], onChange, registry = [],
  readOnly = false, placeholder = "أضف tag...",
}){
  const [search, setSearch] = useState("");
  const [showPicker, setShowPicker] = useState(false);

  const availableTags = useMemo(() => getTagsForEntityType(registry, entityType), [registry, entityType]);
  const selectedTags = useMemo(() => resolveTagsForDisplay(value, registry), [value, registry]);
  const selectedIds = useMemo(() => new Set(value), [value]);
  const unselectedTags = useMemo(
    () => availableTags.filter(t => !selectedIds.has(t.id) && (
      !search.trim() || t.name.toLowerCase().includes(search.toLowerCase())
    )),
    [availableTags, selectedIds, search]
  );

  const handleAdd = (tagId) => {
    if(!onChange) return;
    onChange([...value, tagId]);
    setSearch("");
  };
  const handleRemove = (tagId) => {
    if(!onChange) return;
    onChange(value.filter(t => t !== tagId));
  };

  return <div style={{display:"flex", flexWrap:"wrap", gap:4, alignItems:"center"}}>
    {selectedTags.map(tag => (
      <span key={tag.id} style={{
        display:"inline-flex", alignItems:"center", gap:4,
        padding:"3px 8px", borderRadius:4, fontSize:FS-2, fontWeight:700,
        background: tag.color + "15", color: tag.color,
        border: "1px solid " + tag.color + "40",
      }}>
        {tag.icon && <span>{tag.icon}</span>}
        <span>{tag.name}</span>
        {!readOnly && (
          <button onClick={(e) => { e.stopPropagation(); handleRemove(tag.id); }}
            style={{
              border:"none", background:"transparent", cursor:"pointer",
              color:tag.color, fontWeight:800, padding:0, marginRight:2,
            }}>✕</button>
        )}
      </span>
    ))}

    {!readOnly && availableTags.length > 0 && (
      <div style={{position:"relative", display:"inline-block"}}>
        {!showPicker ? (
          <button onClick={() => setShowPicker(true)} style={{
            padding:"3px 10px", borderRadius:4, fontSize:FS-2, fontWeight:600,
            background: T.bg, color: T.textMut,
            border: "1px dashed " + T.brd, cursor:"pointer",
          }}>+ {placeholder}</button>
        ) : (
          <div style={{
            display:"inline-flex", alignItems:"center", gap:4,
            padding:"2px 4px", borderRadius:4, background: T.bg, border: "1px solid " + T.brd,
          }}>
            <input value={search} onChange={e => setSearch(e.target.value)}
              autoFocus placeholder="ابحث..."
              style={{
                border:"none", outline:"none", background:"transparent",
                fontSize:FS-2, padding:"2px 4px", width:120, color:T.text,
              }}/>
            <button onClick={() => { setShowPicker(false); setSearch(""); }} style={{
              border:"none", background:"transparent", cursor:"pointer",
              color:T.textMut, padding:"2px 4px", fontSize:FS-2,
            }}>✕</button>
          </div>
        )}
        {showPicker && unselectedTags.length > 0 && (
          <div style={{
            position:"absolute", top:"100%", right:0, marginTop:4,
            background:T.cardSolid, border:"1px solid "+T.brd, borderRadius:8,
            boxShadow:"0 4px 12px rgba(0,0,0,0.1)", padding:4,
            maxHeight:200, overflowY:"auto", zIndex:1000, minWidth:180,
          }}>
            {unselectedTags.map(tag => (
              <button key={tag.id} onClick={() => handleAdd(tag.id)} style={{
                display:"flex", alignItems:"center", gap:6, width:"100%",
                padding:"6px 10px", borderRadius:4, fontSize:FS-2, fontWeight:600,
                background:"transparent", border:"none", cursor:"pointer",
                color: T.text, textAlign:"right",
              }}
              onMouseEnter={e => e.currentTarget.style.background = tag.color + "15"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <span style={{width:14, height:14, borderRadius:3, background:tag.color}}/>
                {tag.icon && <span>{tag.icon}</span>}
                <span>{tag.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    )}

    {!readOnly && availableTags.length === 0 && (
      <span style={{fontSize:FS-3, color:T.textMut, fontStyle:"italic"}}>
        مفيش tags معرّفة لـ {entityType} — أنشئ من Settings → الصيانة → 🏷️ نظام الـ Tags
      </span>
    )}

    {readOnly && selectedTags.length === 0 && (
      <span style={{fontSize:FS-3, color:T.textMut, fontStyle:"italic"}}>—</span>
    )}
  </div>;
}

/* ═══════════════════════════════════════════════════════════════════════
   TagChips — read-only display variant (smaller, no picker).
   For table rows and compact displays.
   ═══════════════════════════════════════════════════════════════════════ */
export function TagChips({ tagIds = [], registry = [], max = null, size = "sm" }){
  const tags = useMemo(() => resolveTagsForDisplay(tagIds, registry), [tagIds, registry]);
  if(tags.length === 0) return null;
  const visible = max != null ? tags.slice(0, max) : tags;
  const hidden = max != null && tags.length > max ? tags.length - max : 0;
  const padding = size === "sm" ? "1px 6px" : "3px 8px";
  const fontSize = size === "sm" ? FS - 3 : FS - 2;
  return <span style={{display:"inline-flex", flexWrap:"wrap", gap:3, alignItems:"center"}}>
    {visible.map(tag => (
      <span key={tag.id} style={{
        display:"inline-flex", alignItems:"center", gap:2,
        padding, borderRadius:3, fontSize, fontWeight:700,
        background: tag.color + "15", color: tag.color,
      }}>
        {tag.icon && <span>{tag.icon}</span>}
        {tag.name}
      </span>
    ))}
    {hidden > 0 && (
      <span style={{fontSize, color: T.textMut, fontWeight:600}}>+{hidden}</span>
    )}
  </span>;
}

/* ═══════════════════════════════════════════════════════════════════════
   TagFilter — chip strip for filtering lists by tag.
   Click toggles include/exclude. AND/OR mode toggle.
   ═══════════════════════════════════════════════════════════════════════ */
export function TagFilter({
  entityType, registry = [], selectedTags = [], onChange,
  mode = "OR", onModeChange,
}){
  const availableTags = useMemo(() => getTagsForEntityType(registry, entityType), [registry, entityType]);
  if(availableTags.length === 0) return null;

  const selectedSet = new Set(selectedTags);
  const toggle = (tagId) => {
    if(!onChange) return;
    if(selectedSet.has(tagId)) onChange(selectedTags.filter(t => t !== tagId));
    else onChange([...selectedTags, tagId]);
  };

  return <div style={{display:"flex", flexWrap:"wrap", gap:4, alignItems:"center"}}>
    <span style={{fontSize:FS-3, color:T.textMut, fontWeight:700}}>🏷️ Tags:</span>
    {availableTags.map(tag => {
      const sel = selectedSet.has(tag.id);
      return <button key={tag.id} onClick={() => toggle(tag.id)} style={{
        display:"inline-flex", alignItems:"center", gap:3,
        padding:"3px 8px", borderRadius:4, fontSize:FS-3, fontWeight:700,
        background: sel ? tag.color : tag.color + "12",
        color: sel ? "#fff" : tag.color,
        border: "1px solid " + tag.color + (sel ? "" : "30"),
        cursor:"pointer", transition:"all 0.15s",
      }}>
        {tag.icon && <span>{tag.icon}</span>}
        <span>{tag.name}</span>
      </button>;
    })}
    {selectedTags.length > 0 && onChange && (
      <>
        <button onClick={() => onChange([])} style={{
          padding:"3px 8px", borderRadius:4, fontSize:FS-3, fontWeight:700,
          background: T.bg, color: T.textMut, border: "1px solid " + T.brd, cursor:"pointer",
        }}>مسح ({selectedTags.length})</button>
        {selectedTags.length > 1 && onModeChange && (
          <button onClick={() => onModeChange(mode === "OR" ? "AND" : "OR")} style={{
            padding:"3px 8px", borderRadius:4, fontSize:FS-3, fontWeight:700,
            background: T.accent + "15", color: T.accent, border:"1px solid " + T.accent + "40",
            cursor:"pointer",
          }}>{mode === "OR" ? "أي منهم" : "كلهم معاً"}</button>
        )}
      </>
    )}
  </div>;
}

export default TagPicker;
