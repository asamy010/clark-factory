/* ═══════════════════════════════════════════════════════════════════════
   CLARK · BottomNav (V21.27.192 — إعادة تصميم احترافية: أبيض + أزرق انسيابي)
   ───────────────────────────────────────────────────────────────────────
   شريط سفلي ثابت (موبايل). أيقونات SVG خطّية موحّدة (بدل الإيموجي) بلون أزرق،
   تاب نشط بخلفية pill أزرق شفّاف. زر الهوم المركزي المرتفع منفصل (BottomNavFab).

   - full mode: ٤ تابات (sales/details/finance/more) + spacer مركزي لزر الهوم.
   - minimal mode (الشاشات الفرعية): زر هوم مركزي واحد بس.
   ═══════════════════════════════════════════════════════════════════════ */

import { BOTTOM_TABS } from "../../utils/navigationConfig.js";

function toArabicDigits(n) {
  return String(n).replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[d]);
}

/* ─── أيقونات SVG خطّية موحّدة (24×24، stroke currentColor) ─── */
const SvgIcon = ({ children, size = 25 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
    {children}
  </svg>
);

const ICONS = {
  sales:   <SvgIcon><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h2.2l2.3 12.1a2 2 0 0 0 2 1.6h8a2 2 0 0 0 2-1.5L21 7H5.5"/></SvgIcon>,
  details: <SvgIcon><circle cx="6" cy="6" r="2.4"/><circle cx="6" cy="18" r="2.4"/><path d="M20 4.5L8.5 16"/><path d="M14.5 14.5L20 19.5"/><path d="M8.5 8L12 11.5"/></SvgIcon>,
  finance: <SvgIcon><rect x="2.5" y="6" width="19" height="13" rx="2.5"/><path d="M2.5 10.5h19"/><circle cx="17" cy="14.5" r="1.3"/></SvgIcon>,
  more:    <SvgIcon><rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/></SvgIcon>,
  home:    <SvgIcon size={26}><path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.7V21h4.5v-5.5h5V21H19V9.7"/></SvgIcon>,
};

const BLUE = "#2563EB";
const GREY = "#94A3B8";

export function BottomNav({ activeBottomTab, onTabChange, badges, visibleTabs, minimal }) {
  const tabs = Array.isArray(visibleTabs) && visibleTabs.length > 0 ? visibleTabs : BOTTOM_TABS;

  function handleClick(tabId) {
    if (navigator.vibrate) { try { navigator.vibrate(8); } catch (_) {} }
    onTabChange(tabId);
  }

  /* minimal mode — زر هوم مركزي واحد (الشاشات الفرعية). */
  if (minimal) {
    return (
      <nav style={minimalNavStyle} role="navigation" aria-label="العودة للرئيسية">
        <button onClick={() => handleClick("home")} style={minimalHomeBtnStyle} aria-label="الرئيسية">
          {ICONS.home}
        </button>
      </nav>
    );
  }

  /* full mode — spacer في النص المظبوط (FAB/home يقع فوقه). */
  const items = [];
  const half = Math.floor(tabs.length / 2);
  tabs.forEach((tab, idx) => {
    if (idx === half) items.push({ kind: "spacer", key: "spacer-mid" });
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
            style={{ ...tabItemStyle, color: isActive ? BLUE : GREY }}
            aria-current={isActive ? "page" : undefined}
            aria-label={tab.label}
          >
            {/* badge */}
            {badge > 0 && (
              <span style={badgeStyle} aria-label={badge + " إشعار"}>
                {badge > 99 ? "+99" : toArabicDigits(badge)}
              </span>
            )}
            {/* أيقونة في pill أزرق شفّاف عند التفعيل */}
            <span style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 46,
              height: 30,
              borderRadius: 14,
              background: isActive ? "rgba(37,99,235,0.10)" : "transparent",
              transition: "background 0.2s ease",
            }}>
              {ICONS[tab.id] || null}
            </span>
            <span style={{
              fontSize: 11,
              fontWeight: isActive ? 800 : 600,
              whiteSpace: "nowrap",
              transition: "font-weight 0.15s",
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
  height: "calc(66px + env(safe-area-inset-bottom, 0px))",
  paddingBottom: "env(safe-area-inset-bottom, 0px)",
  background: "rgba(255,255,255,0.94)",
  backdropFilter: "saturate(180%) blur(20px)",
  WebkitBackdropFilter: "saturate(180%) blur(20px)",
  borderTop: "1px solid #E8EFF7",
  display: "flex",
  alignItems: "stretch",
  zIndex: 50,
  boxShadow: "0 -6px 24px rgba(37,99,235,0.06)",
  touchAction: "manipulation",
};

const tabItemStyle = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 2,
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
  maxWidth: 76,
};

const badgeStyle = {
  position: "absolute",
  top: 2, right: "calc(50% - 22px)",
  minWidth: 17, height: 17,
  padding: "0 4px",
  background: "#EF4444",
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
  zIndex: 1,
};

/* minimal mode — زر هوم مركزي (الشاشات الفرعية) — نفس شكل BottomNavFab. */
const minimalNavStyle = {
  position: "fixed",
  bottom: 0, left: 0, right: 0,
  height: "calc(72px + env(safe-area-inset-bottom, 0px))",
  paddingBottom: "env(safe-area-inset-bottom, 0px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 50,
  pointerEvents: "none",
};

const minimalHomeBtnStyle = {
  pointerEvents: "auto",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 60,
  height: 60,
  borderRadius: "50%",
  background: "linear-gradient(135deg, #2E7BED 0%, #1D4ED8 100%)",
  color: "#fff",
  border: "none",
  boxShadow: "0 8px 22px rgba(37,99,235,0.45), 0 0 0 5px #fff",
  cursor: "pointer",
  fontFamily: "inherit",
  WebkitTapHighlightColor: "transparent",
  transition: "transform .15s",
};
