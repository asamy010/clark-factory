/* ════════════════════════════════════════════════════════════════════════
   CLARK V16.78 — HelpTip Component
   ════════════════════════════════════════════════════════════════════════
   
   Tooltip component يعرض شرح مفصّل لـoption في الإعدادات.
   
   الاستخدام:
     <HelpTip text="هذا الإعداد بيحدد كذا..."/>
     <HelpTip>نص شرح طويل أو JSX</HelpTip>
   
   على الـdesktop: hover يظهره. على الموبايل: tap يظهره.
   ════════════════════════════════════════════════════════════════════════ */

import { useState, useRef, useEffect } from "react";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";

export function HelpTip({ text, children, size = "sm", placement = "top" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const content = children || text || "";
  
  /* close on outside click (mobile) */
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    /* delay listener so the opening tap doesn't immediately close it */
    const tid = setTimeout(() => document.addEventListener("click", handler), 0);
    return () => {
      clearTimeout(tid);
      document.removeEventListener("click", handler);
    };
  }, [open]);
  
  const iconSize = size === "lg" ? 18 : size === "md" ? 16 : 14;
  
  return (
    <span
      ref={ref}
      style={{
        display: "inline-flex",
        position: "relative",
        marginInlineStart: 6,
        verticalAlign: "middle",
      }}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        aria-label="مساعدة"
        style={{
          width: iconSize + 4,
          height: iconSize + 4,
          padding: 0,
          borderRadius: "50%",
          border: "1px solid " + T.brd,
          background: T.cardSolid,
          color: T.textMut,
          fontSize: iconSize - 4,
          fontWeight: 700,
          cursor: "help",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          lineHeight: 1,
          transition: "all 0.15s",
        }}
        onMouseOver={e => {
          e.currentTarget.style.borderColor = T.accent;
          e.currentTarget.style.color = T.accent;
        }}
        onMouseOut={e => {
          e.currentTarget.style.borderColor = T.brd;
          e.currentTarget.style.color = T.textMut;
        }}
      >
        ⓘ
      </button>
      {open && (
        <span
          style={{
            position: "absolute",
            zIndex: 9999,
            ...(placement === "top"
              ? { bottom: "calc(100% + 8px)", insetInlineEnd: 0 }
              : { top: "calc(100% + 8px)", insetInlineEnd: 0 }),
            minWidth: 240,
            maxWidth: 360,
            padding: "10px 12px",
            background: T.text,
            color: T.cardSolid,
            borderRadius: 8,
            fontSize: FS - 2,
            fontWeight: 500,
            lineHeight: 1.7,
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            textAlign: "start",
            whiteSpace: "normal",
            pointerEvents: "auto",
          }}
        >
          {content}
          {/* arrow */}
          <span
            style={{
              position: "absolute",
              ...(placement === "top"
                ? { top: "100%", insetInlineEnd: 8, borderTop: "6px solid " + T.text, borderInlineStart: "6px solid transparent", borderInlineEnd: "6px solid transparent" }
                : { bottom: "100%", insetInlineEnd: 8, borderBottom: "6px solid " + T.text, borderInlineStart: "6px solid transparent", borderInlineEnd: "6px solid transparent" }),
              width: 0,
              height: 0,
            }}
          />
        </span>
      )}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   CardSubtitle: يعرض وصف موجز تحت عنوان كارت الإعدادات
   الاستخدام:
     <Card title="...">
       <CardSubtitle>وصف الكارت...</CardSubtitle>
       ...
     </Card>
   ──────────────────────────────────────────────────────────────────────── */
export function CardSubtitle({ children, icon }) {
  return (
    <div
      style={{
        fontSize: FS - 2,
        color: T.textSec,
        marginTop: -4,
        marginBottom: 14,
        lineHeight: 1.7,
        padding: "8px 12px",
        background: T.accent + "06",
        borderRadius: 8,
        borderInlineStart: "3px solid " + T.accent + "60",
      }}
    >
      {icon && <span style={{ marginInlineEnd: 6 }}>{icon}</span>}
      {children}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   FieldHelp: نص شرح صغير يظهر تحت input/select مباشرة
   الاستخدام:
     <Inp ... />
     <FieldHelp>وصف للحقل ده...</FieldHelp>
   ──────────────────────────────────────────────────────────────────────── */
export function FieldHelp({ children, type = "info" }) {
  const colors = {
    info: { bg: "transparent", color: T.textMut, border: "transparent" },
    warn: { bg: T.warn + "08", color: T.warn, border: T.warn + "30" },
    danger: { bg: T.err + "08", color: T.err, border: T.err + "30" },
    success: { bg: T.ok + "08", color: T.ok, border: T.ok + "30" },
  };
  const c = colors[type] || colors.info;
  return (
    <div
      style={{
        fontSize: FS - 3,
        color: c.color,
        background: c.bg,
        border: c.border === "transparent" ? "none" : "1px solid " + c.border,
        borderRadius: 6,
        padding: c.bg === "transparent" ? "4px 0 0 0" : "6px 10px",
        marginTop: 6,
        lineHeight: 1.6,
      }}
    >
      {children}
    </div>
  );
}
