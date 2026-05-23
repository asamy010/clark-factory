/* ═══════════════════════════════════════════════════════════════════════
   CLARK · MobileHomePage (V21.9.157 — Mobile Redesign Simplified)
   ───────────────────────────────────────────────────────────────────────
   Replaces the desktop home (4-column tile grid + sidebar) on mobile with
   a much simpler grid of LARGE buttons. Per user feedback:
     "محتاج تبسيط قدر الامكان — الصفحة الهوم تكون مجموعة ازرار بسيطة بشكل
      كبير نسبياً"

   Design:
   - Greeting strip at the top (1-line: name + date)
   - 2-column grid of big square buttons
   - Each button: large colored icon box + label
   - Permission-gated (canViewTab)
   - "خروج من وضع الموبيل" toggle at the bottom — V21.9.157 feature لو الـ user عاوز يرجع للـ desktop layout

   Items selected = the most-used sections per CLARK's actual workflow,
   not all 20+ pages. The "More" tab handles the rest.
   ═══════════════════════════════════════════════════════════════════════ */

import { FS } from "../constants/index.js";
import { T } from "../theme.js";

/* The 6 primary actions shown on the mobile home. Sequenced by daily use:
   dashboard → sales → treasury → invoices → cutting → purchases.
   The rest live behind the "المزيد" tab. */
const HOME_BUTTONS = [
  { key: "dashboard",     label: "لوحة التحكم",  icon: "📊", color: "#0EA5E9" },
  { key: "custDeliver",   label: "المبيعات",      icon: "🛒", color: "#10B981" },
  { key: "treasury",      label: "الخزنة",        icon: "💵", color: "#0D9488" },
  { key: "salesInvoices", label: "فواتير",       icon: "🧾", color: "#3B82F6" },
  { key: "details",       label: "أوامر القص",    icon: "✂️", color: "#8B5CF6" },
  { key: "purchase",      label: "مشتريات",       icon: "🛍️", color: "#F59E0B" },
];

export function MobileHomePage({ user, canViewTab, onNavigate, onExitMobileMode }) {
  const greetText = "مرحبا";
  const userName = user?.displayName || (user?.email || "").split("@")[0] || "مستخدم";
  const dateStr = new Date().toLocaleDateString("ar-EG", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  /* Filter by permissions */
  const visible = HOME_BUTTONS.filter(b => canViewTab(b.key));

  return (
    <div style={{ padding: "12px 14px 24px" }}>
      {/* ─── Greeting strip (compact, single row) ─── */}
      <div style={{
        background: "linear-gradient(135deg, #0EA5E910, #8B5CF608)",
        border: "1px solid #0EA5E920",
        borderRadius: 14,
        padding: "10px 14px",
        marginBottom: 14,
        display: "flex",
        alignItems: "baseline",
        gap: 10,
        flexWrap: "wrap",
      }}>
        <div style={{ fontSize: FS + 2, fontWeight: 800, color: T.text, whiteSpace: "nowrap" }}>
          {greetText}، {userName}
        </div>
        <div style={{ fontSize: FS - 2, color: T.textMut, whiteSpace: "nowrap" }}>
          {dateStr}
        </div>
      </div>

      {/* ─── Big-button grid (2 columns) ─── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 12,
        marginBottom: 18,
      }}>
        {visible.map(btn => (
          <button
            key={btn.key}
            onClick={() => onNavigate(btn.key)}
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 16,
              padding: "18px 12px",
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              minHeight: 120,
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              transition: "transform .15s, box-shadow .15s",
              WebkitTapHighlightColor: "transparent",
            }}
            onTouchStart={(e) => { e.currentTarget.style.transform = "scale(0.96)"; }}
            onTouchEnd={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
          >
            {/* Big colored icon circle */}
            <div style={{
              width: 60,
              height: 60,
              borderRadius: 16,
              background: btn.color + "15",
              border: "1px solid " + btn.color + "30",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
              lineHeight: 1,
            }}>
              {btn.icon}
            </div>
            <span style={{
              fontSize: FS + 1,
              fontWeight: 800,
              color: T.text,
              lineHeight: 1.2,
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

      {/* ─── Exit-mobile-mode toggle ─── */}
      {typeof onExitMobileMode === "function" && (
        <button
          onClick={onExitMobileMode}
          style={{
            width: "100%",
            padding: "12px 16px",
            background: "#fff",
            border: "1px solid #d1d5db",
            borderRadius: 12,
            fontFamily: "inherit",
            fontSize: FS - 1,
            fontWeight: 700,
            color: T.textSec,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <span style={{ fontSize: 18 }}>💻</span>
          <span>التحويل لوضع سطح المكتب</span>
        </button>
      )}
    </div>
  );
}
