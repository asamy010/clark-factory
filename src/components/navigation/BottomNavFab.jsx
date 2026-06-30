/* ═══════════════════════════════════════════════════════════════════════
   CLARK · BottomNavFab — زر الهوم المركزي المرتفع (V21.27.192)
   ───────────────────────────────────────────────────────────────────────
   كان زر «+» برتقالي يفتح قائمة إجراءات سريعة. بقى **زر الهوم** المركزي
   المرتفع (طلب Ahmed: «زر الموجب اللي في النص يكون زر الهوم»). أزرق متدرّج،
   أيقونة بيت SVG، انسيابي.
   ═══════════════════════════════════════════════════════════════════════ */

export function BottomNavFab({ onHome }) {
  function tap() {
    if (navigator.vibrate) { try { navigator.vibrate(10); } catch (_) {} }
    if (onHome) onHome();
  }
  return (
    <button
      onClick={tap}
      style={fabStyle}
      aria-label="الرئيسية"
      onTouchStart={(e) => { e.currentTarget.style.transform = "translateX(50%) scale(0.93)"; }}
      onTouchEnd={(e) => { e.currentTarget.style.transform = "translateX(50%) scale(1)"; }}
    >
      <svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
        <path d="M3 10.5L12 3l9 7.5" />
        <path d="M5 9.7V21h4.5v-5.5h5V21H19V9.7" />
      </svg>
    </button>
  );
}

/* RTL: right:50% + translateX(50%) لتوسيط الزر في سياق dir="rtl". */
const fabStyle = {
  position: "fixed",
  bottom: "calc(64px + env(safe-area-inset-bottom, 0px) - 26px)",
  right: "50%",
  transform: "translateX(50%)",
  width: 60,
  height: 60,
  borderRadius: "50%",
  background: "linear-gradient(135deg, #2E7BED 0%, #1D4ED8 100%)",
  boxShadow: "0 8px 22px rgba(37,99,235,0.45), 0 0 0 5px #fff",
  color: "#fff",
  border: "none",
  zIndex: 60,
  cursor: "pointer",
  transition: "transform 0.18s ease",
  WebkitTapHighlightColor: "transparent",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  fontFamily: "inherit",
};
