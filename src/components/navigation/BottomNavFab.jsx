/* ═══════════════════════════════════════════════════════════════════════
   CLARK · BottomNavFab (V21.9.155 — Mobile Redesign Phase A)
   ───────────────────────────────────────────────────────────────────────
   Floating Action Button — sits centered above the bottom nav bar.
   Tapping it expands a menu of 5 quick actions (per V21.9.154 audit):
     فاتورة بيع · حركة خزنة · جهة اتصال · مهمة · إشعار

   The component is pure UI — actual action dispatching happens in App.jsx
   via the `onAction(action)` callback (action is the FAB_ACTIONS entry).

   Z-index strategy (mobile shell):
     Bottom nav        — 50
     FAB button        — 60
     FAB menu/backdrop — 55 (above nav, below FAB itself so the + can
                             still be tapped to close)
   ═══════════════════════════════════════════════════════════════════════ */

import { useState } from "react";
import { FAB_ACTIONS } from "../../utils/navigationConfig.js";

export function BottomNavFab({ onAction }) {
  const [open, setOpen] = useState(false);

  function toggle() {
    setOpen(o => !o);
    if (navigator.vibrate) {
      try { navigator.vibrate(10); } catch(_) {}
    }
  }

  function handleAction(action) {
    setOpen(false);
    if (onAction) onAction(action);
  }

  return (
    <>
      {/* Backdrop — only when open */}
      {open && (
        <div
          onClick={toggle}
          style={backdropStyle}
          aria-hidden="true"
        />
      )}

      {/* Action menu */}
      {open && (
        <div style={menuStyle} role="menu" aria-label="إجراءات سريعة">
          {FAB_ACTIONS.map(action => (
            <button
              key={action.id}
              onClick={() => handleAction(action)}
              style={actionRowStyle}
              role="menuitem"
            >
              <span style={{
                ...actionDotStyle,
                background: action.color,
              }} aria-hidden="true">{action.icon}</span>
              <span style={{
                fontSize: 14,
                fontWeight: 600,
                color: "#0f172a",
              }}>{action.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* The FAB itself */}
      <button
        onClick={toggle}
        style={{
          ...fabStyle,
          transform: open
            ? "translateX(50%) rotate(45deg)"  /* RTL flip + rotate to × */
            : "translateX(50%) rotate(0deg)",
        }}
        aria-label={open ? "إغلاق القائمة" : "إجراء سريع"}
        aria-expanded={open}
      >+</button>
    </>
  );
}

/* ── Styles ─────────────────────────────────────────────── */

/* RTL note: we use right:50% + transform:translateX(50%) so the FAB centers
   horizontally in RTL contexts. Pure `left:50%` would resolve oddly under
   `dir="rtl"` document-level direction. */
const fabStyle = {
  position: "fixed",
  bottom: "calc(64px + env(safe-area-inset-bottom, 0px) - 28px)",
  right: "50%",
  transform: "translateX(50%)",
  width: 64,
  height: 64,
  borderRadius: "50%",
  background: "linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)",
  boxShadow: "0 8px 24px rgba(245,158,11,0.45), 0 0 0 5px #f1f5f9",
  color: "#fff",
  fontSize: 30,
  fontWeight: 300,
  border: "none",
  zIndex: 60,
  cursor: "pointer",
  transition: "transform 0.25s",
  WebkitTapHighlightColor: "transparent",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  lineHeight: 1,
  padding: 0,
  fontFamily: "inherit",
};

const menuStyle = {
  position: "fixed",
  bottom: "calc(64px + env(safe-area-inset-bottom, 0px) + 50px)",
  right: "50%",
  transform: "translateX(50%)",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  zIndex: 58,
  alignItems: "stretch",
  /* Slide-up animation handled by .fab-menu-anim class if added globally;
     for now using a simple opacity flicker. */
};

const actionRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  background: "#fff",
  padding: "10px 16px",
  borderRadius: 30,
  boxShadow: "0 4px 16px rgba(15,23,42,0.18)",
  border: "none",
  cursor: "pointer",
  fontFamily: "inherit",
  whiteSpace: "nowrap",
  minHeight: 44,
  WebkitTapHighlightColor: "transparent",
  direction: "rtl",
};

const actionDotStyle = {
  width: 32,
  height: 32,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 16,
  color: "#fff",
  flexShrink: 0,
};

const backdropStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.4)",
  zIndex: 55,
  WebkitTapHighlightColor: "transparent",
};
