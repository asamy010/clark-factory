/* ═══════════════════════════════════════════════════════════════════════
   CLARK · SubViewTabs (V21.9.155 — Mobile Redesign Phase A)
   ───────────────────────────────────────────────────────────────────────
   Horizontal scrollable chip strip — sits below the topbar on mobile and
   above the current page content. Lets the user switch sub-views within
   the active bottom-tab without going back to the bottom nav.

   Hidden when:
     - There's only one sub-view (no need to choose).
     - The bottom-tab is "more" (uses MoreMenuPage vertical list instead).
     - The bottom-tab is "home" (single dashboard view).
   ═══════════════════════════════════════════════════════════════════════ */

export function SubViewTabs({ subViews, activeTabKey, onChange }) {
  if (!Array.isArray(subViews) || subViews.length <= 1) return null;

  return (
    <div style={barStyle} role="tablist">
      {subViews.map(sv => {
        const isActive = activeTabKey === sv.tabKey;
        return (
          <button
            key={sv.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(sv.tabKey)}
            style={{
              ...chipStyle,
              background: isActive ? "#0369a1" : "#fff",
              color: isActive ? "#fff" : "#374151",
              borderColor: isActive ? "#0369a1" : "#d1d5db",
              fontWeight: isActive ? 700 : 600,
            }}
          >
            {sv.icon && <span style={{ fontSize: 13 }} aria-hidden="true">{sv.icon} </span>}
            {sv.label}
          </button>
        );
      })}
    </div>
  );
}

const barStyle = {
  display: "flex",
  gap: 8,
  padding: "10px 14px",
  overflowX: "auto",
  WebkitOverflowScrolling: "touch",
  background: "#fff",
  borderBottom: "1px solid #e5e7eb",
  position: "sticky",
  top: 0,
  zIndex: 10,
  /* Hide horizontal scrollbar while keeping scroll behavior */
  scrollbarWidth: "none",
};

const chipStyle = {
  padding: "8px 16px",
  borderRadius: 20,
  border: "1px solid",
  fontSize: 13,
  whiteSpace: "nowrap",
  cursor: "pointer",
  flexShrink: 0,
  fontFamily: "inherit",
  minHeight: 36,
  WebkitTapHighlightColor: "transparent",
};
