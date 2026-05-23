/* ═══════════════════════════════════════════════════════════════════════
   CLARK · MoreMenuPage (V21.9.155 — Mobile Redesign Phase A)
   ───────────────────────────────────────────────────────────────────────
   Vertical menu shown when the "المزيد" bottom tab is active on mobile.
   Lists all sub-views from TAB_SUBVIEWS.more, filtered by user permissions.
   Tapping an item navigates to that section via the existing `goTo()`.

   Why not chip-strip like other tabs? The "more" tab has 10+ items —
   horizontally scrolling them is unergonomic. A vertical list is the
   standard mobile pattern for catch-all menus (iOS Settings, etc.).
   ═══════════════════════════════════════════════════════════════════════ */

import { TAB_SUBVIEWS } from "../utils/navigationConfig.js";
import { FS } from "../constants/index.js";
import { T } from "../theme.js";

export function MoreMenuPage({ canViewTab, onNavigate }) {
  /* Filter the menu by user permissions. Each item maps to an existing tab
     key so we can reuse canViewTab() — same source of truth as the bottom
     nav permission gating. */
  const items = (TAB_SUBVIEWS.more || []).filter(item => canViewTab(item.tabKey));

  if (items.length === 0) {
    return (
      <div style={{
        padding: 40,
        textAlign: "center",
        color: T.textMut,
      }}>
        <div style={{ fontSize: 48, marginBottom: 10, opacity: 0.5 }}>🔒</div>
        <div style={{ fontSize: FS - 1, fontWeight: 600 }}>
          لا يوجد عناصر متاحة بصلاحياتك
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 14, paddingBottom: 24 }}>
      <div style={{
        fontSize: FS + 4,
        fontWeight: 800,
        color: T.text,
        marginBottom: 4,
        padding: "0 2px",
      }}>المزيد</div>
      <div style={{
        fontSize: FS - 2,
        color: T.textSec,
        marginBottom: 14,
        padding: "0 2px",
      }}>كل الأقسام الأخرى</div>

      {items.map(item => (
        <button
          key={item.id}
          onClick={() => onNavigate(item.tabKey)}
          style={rowStyle}
        >
          <span style={{ fontSize: 22, flexShrink: 0 }} aria-hidden="true">{item.icon || "▸"}</span>
          <span style={{
            flex: 1,
            textAlign: "start",
            fontSize: FS,
            fontWeight: 600,
            color: T.text,
          }}>{item.label}</span>
          <span style={{
            color: "#94a3b8",
            fontSize: 18,
            flexShrink: 0,
          }} aria-hidden="true">‹</span>
        </button>
      ))}
    </div>
  );
}

const rowStyle = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: 14,
  padding: "14px 16px",
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  marginBottom: 8,
  cursor: "pointer",
  fontFamily: "inherit",
  minHeight: 44,
  WebkitTapHighlightColor: "transparent",
};
