/* ═══════════════════════════════════════════════════════════════
   CLARK — MobileHome.jsx
   
   V15.59: Mobile warehouse home screen.
   5 large action buttons — one-tap access to common warehouse tasks.
   ═══════════════════════════════════════════════════════════════ */

export function MobileHome({ setScreen, onExit }) {
  const actions = [
    {
      key: "sale",
      icon: "💰",
      label: "بيع سريع",
      sub: "بيع للعميل مباشرة",
      color: "#10B981",
      bgColor: "rgba(16, 185, 129, 0.1)",
      borderColor: "#10B98140",
    },
    {
      key: "stock-in",
      icon: "📥",
      label: "استلام مخزن",
      sub: "بضاعة من التشطيب",
      color: "#0EA5E9",
      bgColor: "rgba(14, 165, 233, 0.1)",
      borderColor: "#0EA5E940",
    },
    {
      key: "return",
      icon: "↩️",
      label: "مرتجع سريع",
      sub: "إرجاع من العميل",
      color: "#EF4444",
      bgColor: "rgba(239, 68, 68, 0.1)",
      borderColor: "#EF444440",
    },
    {
      key: "package",
      icon: "📦",
      label: "كرتونة",
      sub: "تعبئة وتغليف",
      color: "#F59E0B",
      bgColor: "rgba(245, 158, 11, 0.1)",
      borderColor: "#F59E0B40",
    },
    {
      key: "count",
      icon: "🔍",
      label: "جرد مخزن",
      sub: "عد الكميات الفعلية",
      color: "#8B5CF6",
      bgColor: "rgba(139, 92, 246, 0.1)",
      borderColor: "#8B5CF640",
    },
  ];

  return (
    <div style={{ maxWidth: 560, margin: "0 auto" }}>
      {/* Welcome header */}
      <div
        style={{
          textAlign: "center",
          marginBottom: 24,
          padding: "16px 12px",
          background: "linear-gradient(135deg, rgba(14, 165, 233, 0.08) 0%, rgba(139, 92, 246, 0.08) 100%)",
          borderRadius: 16,
          border: "1px solid #1E293B",
        }}
      >
        <div style={{ fontSize: 13, color: "#64748B", fontWeight: 700, marginBottom: 4 }}>اختر المهمة</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>وضع المخزن السريع</div>
      </div>

      {/* Action grid — 2 columns, last item full width */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          marginBottom: 16,
        }}
      >
        {actions.slice(0, 4).map((a) => (
          <ActionButton key={a.key} action={a} onClick={() => setScreen(a.key)} />
        ))}
      </div>

      {/* Last button — full width */}
      <div style={{ marginBottom: 24 }}>
        <ActionButton action={actions[4]} onClick={() => setScreen(actions[4].key)} fullWidth />
      </div>

      {/* Exit to desktop */}
      <button
        onClick={onExit}
        style={{
          width: "100%",
          padding: "14px",
          borderRadius: 12,
          background: "#1E293B",
          border: "1px solid #334155",
          color: "#94A3B8",
          fontSize: 14,
          fontWeight: 700,
          cursor: "pointer",
          fontFamily: "inherit",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <span>🖥️</span>
        <span>خروج لوضع العادي</span>
      </button>
    </div>
  );
}

function ActionButton({ action, onClick, fullWidth }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: fullWidth ? "22px 20px" : "20px 14px",
        borderRadius: 16,
        background: action.bgColor,
        border: "1.5px solid " + action.borderColor,
        color: "#fff",
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "transform 0.1s, background 0.2s",
        display: "flex",
        flexDirection: fullWidth ? "row" : "column",
        alignItems: "center",
        justifyContent: fullWidth ? "center" : "center",
        gap: fullWidth ? 14 : 10,
        minHeight: fullWidth ? 80 : 120,
        WebkitTapHighlightColor: "transparent",
      }}
      onTouchStart={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
      onTouchEnd={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      <div
        style={{
          fontSize: fullWidth ? 38 : 44,
          lineHeight: 1,
          filter: "grayscale(0)",
        }}
      >
        {action.icon}
      </div>
      <div style={{ textAlign: fullWidth ? "right" : "center", flex: fullWidth ? 1 : undefined }}>
        <div style={{ fontSize: fullWidth ? 18 : 16, fontWeight: 800, color: action.color, lineHeight: 1.2 }}>
          {action.label}
        </div>
        <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 3, fontWeight: 500 }}>{action.sub}</div>
      </div>
    </button>
  );
}
