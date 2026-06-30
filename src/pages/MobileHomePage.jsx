/* ═══════════════════════════════════════════════════════════════════════
   CLARK · MobileHomePage
   ───────────────────────────────────────────────────────────────────────
   شاشة الهوم على الموبايل: هيدر ترحيب + شبكة أزرار كبيرة للأقسام الأكثر
   استخدامًا (الباقي في تاب «المزيد»). الأزرار permission-gated (canViewTab).

   V21.27.191 — إعادة تصميم احترافية (طلب Ahmed: «أبيض وأزرق شفّاف زي المرجع»):
   - أيقونات SVG خطّية موحّدة بدل الإيموجي المختلطة → مظهر متّسق احترافي.
   - هيدر أزرق متدرّج (hero) بدل الشريط الباهت.
   - كروت بيضا، زوايا دائرية، ظلال ناعمة، وخلفية أيقونة «أزرق شفّاف» موحّدة.
   ═══════════════════════════════════════════════════════════════════════ */

import { FS } from "../constants/index.js";
import { T } from "../theme.js";

/* ─── لوحة الألوان (أبيض + أزرق شفّاف) ─── */
const BLUE       = "#2563EB";  /* لون الأيقونة + اللمسات */
const TILE_BG    = "linear-gradient(155deg, #F0F6FF 0%, #DCEAFF 100%)";  /* أزرق شفّاف */
const TILE_BRD   = "#CBDEFB";
const CARD_BRD   = "#EAF0F8";
const CARD_SHADOW= "0 8px 20px rgba(37,99,235,0.07), 0 2px 5px rgba(15,23,42,0.03)";
const CARD_SHADOW_ACTIVE = "0 3px 10px rgba(37,99,235,0.10)";

/* ─── أيقونات SVG خطّية موحّدة (24×24، stroke currentColor) ─── */
const SvgIcon = ({ children, size = 25 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
    {children}
  </svg>
);

const ICONS = {
  /* لوحة التحكم — أعمدة بيانية */
  dashboard: <SvgIcon><path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6" rx="0.6"/><rect x="12" y="7" width="3" height="10" rx="0.6"/><rect x="17" y="13" width="3" height="4" rx="0.6"/></SvgIcon>,
  /* مسح QR — إطار ماسح */
  __qrScan: <SvgIcon><path d="M4 8V6a2 2 0 0 1 2-2h2"/><path d="M16 4h2a2 2 0 0 1 2 2v2"/><path d="M20 16v2a2 2 0 0 1-2 2h-2"/><path d="M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M4 12h16"/></SvgIcon>,
  /* المبيعات — عربة تسوّق */
  custDeliver: <SvgIcon><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h2.2l2.3 12.1a2 2 0 0 0 2 1.6h8a2 2 0 0 0 2-1.5L21 7H5.5"/></SvgIcon>,
  /* حركة خزنة سريعة — محفظة/كارت */
  __quickTreasury: <SvgIcon><rect x="2.5" y="6" width="19" height="13" rx="2.5"/><path d="M2.5 10.5h19"/><circle cx="17" cy="14.5" r="1.4"/></SvgIcon>,
  /* فواتير — إيصال */
  salesInvoices: <SvgIcon><path d="M6 2.5h12v19l-3-2-3 2-3-2-3 2z"/><path d="M9 7.5h6"/><path d="M9 11.5h6"/><path d="M9 15.5h4"/></SvgIcon>,
  /* التصنيع — مقص */
  details: <SvgIcon><circle cx="6" cy="6" r="2.6"/><circle cx="6" cy="18" r="2.6"/><path d="M20 4.5L8.5 16"/><path d="M14.5 14.5L20 19.5"/><path d="M8.5 8L12 11.5"/></SvgIcon>,
  /* AI Studio — لمعات */
  aiStudio: <SvgIcon><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"/><path d="M18.5 14l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/></SvgIcon>,
  /* مشتريات — شنطة */
  purchase: <SvgIcon><path d="M6 2.5l-2 4V20a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6.5l-2-4z"/><path d="M4 6.5h16"/><path d="M9 10.5a3 3 0 0 0 6 0"/></SvgIcon>,
};

/* الأقسام المعروضة على الهوم — tabs (canViewTab) أو special actions. */
const HOME_BUTTONS = [
  { key: "dashboard",       label: "لوحة التحكم" },
  { key: "__qrScan",        label: "مسح QR",          special: true },
  { key: "custDeliver",     label: "المبيعات" },
  { key: "__quickTreasury", label: "حركة خزنة سريعة", special: true },
  { key: "salesInvoices",   label: "فواتير" },
  { key: "details",         label: "التصنيع" },
  { key: "aiStudio",        label: "AI Studio" },
  { key: "purchase",        label: "مشتريات" },
];

export function MobileHomePage({ user, canViewTab, onNavigate, onSpecialAction }) {
  const greetText = "مرحباً";
  const userName = user?.displayName || (user?.email || "").split("@")[0] || "مستخدم";
  const dateStr = new Date().toLocaleDateString("ar-EG", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  /* فلترة بالصلاحيات. الـ special actions (qrScan/quickTreasury) مش tabs. */
  const visible = HOME_BUTTONS.filter(b => {
    if (b.special) {
      if (b.key === "__quickTreasury") return canViewTab("treasury");
      return true;/* qrScan للجميع */
    }
    return canViewTab(b.key);
  });

  return (
    <div style={{ padding: "12px 14px 24px" }}>
      {/* ─── Hero ترحيب (أزرق متدرّج) ─── */}
      <div style={{
        position: "relative",
        overflow: "hidden",
        background: "linear-gradient(135deg, #1D4ED8 0%, #2E7BED 55%, #38BDF8 120%)",
        borderRadius: 22,
        padding: "18px 18px",
        marginBottom: 16,
        boxShadow: "0 10px 24px rgba(37,99,235,0.22)",
        color: "#fff",
      }}>
        {/* لمسة زخرفية ناعمة */}
        <div style={{
          position: "absolute", insetInlineEnd: -34, top: -42,
          width: 150, height: 150, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,255,255,0.28), transparent 68%)",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", insetInlineStart: -30, bottom: -50,
          width: 130, height: 130, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,255,255,0.14), transparent 70%)",
          pointerEvents: "none",
        }} />
        <div style={{ position: "relative" }}>
          <div style={{ fontSize: FS - 2, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>
            {greetText} 👋
          </div>
          <div style={{ fontSize: FS + 6, fontWeight: 800, color: "#fff", marginTop: 2, lineHeight: 1.2 }}>
            {userName}
          </div>
          <div style={{ fontSize: FS - 3, color: "rgba(255,255,255,0.78)", marginTop: 6 }}>
            {dateStr}
          </div>
        </div>
      </div>

      {/* ─── شبكة الأقسام (٣ أعمدة — V21.27.193) ─── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 10,
        marginBottom: 18,
      }}>
        {visible.map(btn => (
          <button
            key={btn.key}
            onClick={() => {
              if (btn.special && typeof onSpecialAction === "function") onSpecialAction(btn.key);
              else onNavigate(btn.key);
            }}
            style={{
              background: "#fff",
              border: "1px solid " + CARD_BRD,
              borderRadius: 18,
              padding: "15px 6px",
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "flex-start",
              gap: 9,
              minHeight: 112,
              boxShadow: CARD_SHADOW,
              transition: "transform .14s ease, box-shadow .14s ease",
              WebkitTapHighlightColor: "transparent",
            }}
            onTouchStart={(e) => { e.currentTarget.style.transform = "scale(0.96)"; e.currentTarget.style.boxShadow = CARD_SHADOW_ACTIVE; }}
            onTouchEnd={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = CARD_SHADOW; }}
          >
            {/* أيقونة في خلفية أزرق شفّاف موحّدة */}
            <div style={{
              width: 50,
              height: 50,
              borderRadius: 15,
              background: TILE_BG,
              border: "1px solid " + TILE_BRD,
              color: BLUE,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "inset 0 1px 2px rgba(255,255,255,0.9)",
            }}>
              {ICONS[btn.key]}
            </div>
            <span style={{
              fontSize: FS - 1,
              fontWeight: 700,
              color: T.text,
              lineHeight: 1.25,
              textAlign: "center",
            }}>{btn.label}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 && (
        <div style={{
          textAlign: "center",
          padding: 40,
          color: T.textMut,
          background: T.bg,
          borderRadius: 14,
          border: "1px dashed " + T.brd,
          marginBottom: 18,
        }}>
          <div style={{ fontSize: 36, marginBottom: 8, opacity: 0.5 }}>🔒</div>
          <div style={{ fontSize: FS, fontWeight: 600 }}>لا يوجد أقسام متاحة بصلاحياتك</div>
        </div>
      )}
    </div>
  );
}
