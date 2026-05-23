/* ═══════════════════════════════════════════════════════════════════════
   CLARK · BottomNav (V21.9.155 — Mobile Redesign Phase A)
   ───────────────────────────────────────────────────────────────────────
   Fixed bottom tab bar (mobile only). Renders 5 tabs from BOTTOM_TABS
   with badges + active indicator + safe-area padding for iPhone home
   indicator.

   The center "spacer" slot is intentionally left clear so the FAB
   (rendered separately as BottomNavFab) sits in the middle without
   colliding with any tab button.
   ═══════════════════════════════════════════════════════════════════════ */

import { T } from "../../theme.js";
import { FS } from "../../constants/index.js";
import { BOTTOM_TABS } from "../../utils/navigationConfig.js";

/* Convert latin digits to Arabic-Indic for badge display (consistent with
   the rest of the app's number rendering). */
function toArabicDigits(n) {
  return String(n).replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[d]);
}

export function BottomNav({ activeBottomTab, onTabChange, badges, visibleTabs }) {
  /* `visibleTabs` is the filtered list (after permissions) — passed from
     App.jsx so the component stays pure UI. Falls back to BOTTOM_TABS for
     the rare case where the caller hasn't pre-filtered. */
  const tabs = Array.isArray(visibleTabs) && visibleTabs.length > 0
    ? visibleTabs
    : BOTTOM_TABS;

  function handleClick(tabId) {
    if (navigator.vibrate) {
      try { navigator.vibrate(8); } catch(_) {}
    }
    onTabChange(tabId);
  }

  /* V21.9.157: build the final list with a SPACER element at the exact center
     so the FAB sits centered (50/50 split, not the previous best-effort spacer).
     For 4 tabs → [tab0, tab1, SPACER, tab2, tab3]. For odd counts the spacer
     still inserts at the midpoint (handles permission-hidden tabs gracefully). */
  const items = [];
  const half = Math.floor(tabs.length / 2);
  tabs.forEach((tab, idx) => {
    if (idx === half) {
      items.push({ kind: "spacer", key: "spacer-mid" });
    }
    items.push({ kind: "tab", key: tab.id, tab });
  });

  return (
    <nav style={navStyle} role="navigation" aria-label="التنقل الرئيسي">
      {items.map(it => {
        if (it.kind === "spacer") {
          return <div key={it.key} style={spacerStyle} aria-hidden="true" />;
        }
        const tab = it.tab;
        const isActive = activeBottomTab === tab.id;
        const badge = badges?.[tab.id] || 0;
        return (
          <button
            key={it.key}
            onClick={() => handleClick(tab.id)}
            style={{
              ...tabItemStyle,
              color: isActive ? "#0369a1" : "#64748b",
            }}
            aria-current={isActive ? "page" : undefined}
            aria-label={tab.label}
          >
            {/* Active indicator (top bar) */}
            {isActive && <span style={activeIndicatorStyle} aria-hidden="true" />}
            {/* Badge (top-right of icon) */}
            {badge > 0 && (
              <span style={badgeStyle} aria-label={badge + " إشعار"}>
                {badge > 99 ? "+99" : toArabicDigits(badge)}
              </span>
            )}
            {/* Icon */}
            <span style={{
              fontSize: 24,/* V21.9.157: bigger icon — was 22 */
              lineHeight: 1,
              transform: isActive ? "translateY(-1px) scale(1.08)" : "none",
              transition: "transform 0.2s",
            }} aria-hidden="true">{tab.icon}</span>
            {/* Label */}
            <span style={{
              fontSize: 11,/* V21.9.157: slightly bigger — was 10.5 */
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

/* ── Styles ─────────────────────────────────────────────── */

const navStyle = {
  position: "fixed",
  bottom: 0, left: 0, right: 0,
  height: "calc(64px + env(safe-area-inset-bottom, 0px))",
  paddingBottom: "env(safe-area-inset-bottom, 0px)",
  background: "rgba(255,255,255,0.92)",
  backdropFilter: "saturate(180%) blur(20px)",
  WebkitBackdropFilter: "saturate(180%) blur(20px)",
  borderTop: "1px solid #e2e8f0",
  display: "flex",
  alignItems: "stretch",
  zIndex: 50,
  boxShadow: "0 -4px 24px rgba(15,23,42,0.06)",
  /* Stop iOS double-tap zoom inside the nav */
  touchAction: "manipulation",
};

const tabItemStyle = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 3,
  background: "none",
  border: "none",
  cursor: "pointer",
  position: "relative",
  minHeight: 44,
  transition: "color 0.2s",
  WebkitTapHighlightColor: "transparent",
  padding: 0,
  fontFamily: "inherit",
};

const spacerStyle = {
  flex: 1,
  /* Cap the spacer so the FAB (64px) has clearance but doesn't dominate.
     ~70px = FAB + small breathing room on each side. */
  maxWidth: 70,
};

const activeIndicatorStyle = {
  position: "absolute",
  top: 0, left: "50%",
  transform: "translateX(-50%)",
  width: 28, height: 3,
  background: "#0369a1",
  borderRadius: "0 0 4px 4px",
};

const badgeStyle = {
  position: "absolute",
  top: 4, right: "calc(50% - 22px)",
  minWidth: 17, height: 17,
  padding: "0 4px",
  background: "#dc2626",
  color: "#fff",
  fontSize: 10,
  fontWeight: 700,
  borderRadius: 9,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "2px solid #fff",
  boxSizing: "border-box",
  lineHeight: 1,
};
