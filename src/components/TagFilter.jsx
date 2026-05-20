/* ═══════════════════════════════════════════════════════════════
   CLARK V21.9.102 — TagFilter (Slice 2 of Universal Tagging)
   ───────────────────────────────────────────────────────────────
   Horizontal chip strip for filtering a list of entities by tag.
   Paired with `filterByTags()` in src/utils/tags.js — the page
   takes (selectedTags, mode) from this component and applies it
   via filterByTags(entities, selectedTags, mode).

   API:
     <TagFilter
       entityType="customer"
       registry={data.tagRegistry}
       selectedTags={filterTagIds}
       mode={filterMode}                         // "OR" (default) | "AND"
       onChange={(tagIds, mode) => ...}
       compact={false}                            // tighter spacing when used in toolbars
       collapseAbove={10}                         // default 10 — show "+ المزيد" when many tags
     />

   This component is presentation-only. It does NOT touch Firestore.
   ═══════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { getTagsByEntityType } from "../utils/tags.js";

export function TagFilter({
  entityType,
  registry,
  selectedTags,
  mode,
  onChange,
  compact,
  collapseAbove,
}){
  const [expanded, setExpanded] = useState(false);

  const safeRegistry = Array.isArray(registry) ? registry : [];
  const safeSelected = Array.isArray(selectedTags) ? selectedTags : [];
  const safeMode = mode === "AND" ? "AND" : "OR";
  const cap = typeof collapseAbove === "number" && collapseAbove > 0 ? collapseAbove : 10;

  /* Applicable tags, active only. Sort: selected-first, then alphabetical
     by display name — keeps the user's current filter chips visible without
     hunting through a long strip. */
  const applicable = useMemo(() => {
    const list = getTagsByEntityType(safeRegistry, entityType, { includeArchived: false });
    const selectedSet = new Set(safeSelected);
    return list.slice().sort((a, b) => {
      const aSel = selectedSet.has(a.id) ? 0 : 1;
      const bSel = selectedSet.has(b.id) ? 0 : 1;
      if(aSel !== bSel) return aSel - bSel;
      return String(a.name || "").localeCompare(String(b.name || ""), "ar");
    });
  }, [safeRegistry, entityType, safeSelected]);

  if(applicable.length === 0) return null;

  const visible = expanded ? applicable : applicable.slice(0, cap);
  const overflow = applicable.length - visible.length;

  const toggle = (tagId) => {
    const set = new Set(safeSelected);
    if(set.has(tagId)) set.delete(tagId);
    else set.add(tagId);
    onChange && onChange(Array.from(set), safeMode);
  };

  const setMode = (m) => {
    onChange && onChange(safeSelected, m);
  };

  const reset = () => {
    onChange && onChange([], safeMode);
  };

  const padding = compact ? "4px 8px" : "6px 12px";
  const gap = compact ? 4 : 6;

  return (
    <div style={{
      display:"flex",
      alignItems:"center",
      flexWrap:"wrap",
      gap,
      padding: compact ? "6px 0" : "8px 0",
      width:"100%",
    }}>
      <span style={{
        fontSize: FS-2,
        fontWeight:600,
        color: T.textSec,
        marginInlineEnd: 4,
      }}>
        🏷️ تصفية:
      </span>

      {visible.map(t => {
        const selected = safeSelected.includes(t.id);
        return (
          <button
            key={t.id}
            onClick={() => toggle(t.id)}
            title={t.description || t.name}
            style={{
              display:"inline-flex",
              alignItems:"center",
              gap: 5,
              padding,
              borderRadius: 14,
              fontSize: FS-2,
              fontWeight: selected ? 700 : 600,
              fontFamily:"inherit",
              cursor:"pointer",
              background: selected ? t.color : t.color + "18",
              color: selected ? "#fff" : t.color,
              border: "1px solid " + (selected ? t.color : t.color + "55"),
              boxShadow: selected ? "0 2px 6px " + t.color + "44" : "none",
              transition: "background 0.15s, color 0.15s, box-shadow 0.15s",
            }}
          >
            {t.icon && <span style={{fontSize: FS-2}}>{t.icon}</span>}
            <span>{t.name}</span>
            {selected && <span style={{opacity:0.85, fontWeight:700}}>✓</span>}
          </button>
        );
      })}

      {overflow > 0 && (
        <button
          onClick={() => setExpanded(true)}
          style={{
            padding,
            borderRadius: 14,
            fontSize: FS-2,
            fontWeight: 600,
            fontFamily:"inherit",
            background:"transparent",
            color: T.textSec,
            border:"1px dashed " + T.brd,
            cursor:"pointer",
          }}
        >
          + {overflow} المزيد
        </button>
      )}

      {expanded && applicable.length > cap && (
        <button
          onClick={() => setExpanded(false)}
          style={{
            padding,
            borderRadius: 14,
            fontSize: FS-2,
            fontWeight: 600,
            fontFamily:"inherit",
            background:"transparent",
            color: T.textMut,
            border:"1px dashed " + T.brd,
            cursor:"pointer",
          }}
        >
          إخفاء
        </button>
      )}

      {safeSelected.length > 1 && (
        <div style={{
          display:"inline-flex",
          alignItems:"center",
          marginInlineStart: 8,
          padding: "2px 4px",
          borderRadius: 10,
          background: T.bg,
          border: "1px solid " + T.brd,
        }}>
          <span style={{fontSize: FS-3, color: T.textMut, padding: "0 6px"}}>الوضع:</span>
          <button
            onClick={() => setMode("OR")}
            style={{
              padding: "3px 10px",
              borderRadius: 8,
              fontSize: FS-3,
              fontWeight: 700,
              fontFamily:"inherit",
              background: safeMode === "OR" ? T.accent : "transparent",
              color: safeMode === "OR" ? "#fff" : T.text,
              border: "none",
              cursor:"pointer",
            }}
            title="أي من التاجز المحددة"
          >أي</button>
          <button
            onClick={() => setMode("AND")}
            style={{
              padding: "3px 10px",
              borderRadius: 8,
              fontSize: FS-3,
              fontWeight: 700,
              fontFamily:"inherit",
              background: safeMode === "AND" ? T.accent : "transparent",
              color: safeMode === "AND" ? "#fff" : T.text,
              border: "none",
              cursor:"pointer",
            }}
            title="كل التاجز المحددة معاً"
          >كل</button>
        </div>
      )}

      {safeSelected.length > 0 && (
        <button
          onClick={reset}
          style={{
            padding: compact ? "4px 10px" : "5px 12px",
            borderRadius: 14,
            fontSize: FS-2,
            fontWeight: 600,
            fontFamily:"inherit",
            background:"transparent",
            color: T.err,
            border:"1px solid " + T.err + "44",
            cursor:"pointer",
            marginInlineStart: 4,
          }}
          title="مسح كل الفلاتر"
        >
          🔄 مسح ({safeSelected.length})
        </button>
      )}
    </div>
  );
}
