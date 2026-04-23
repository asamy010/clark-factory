/* ═══════════════════════════════════════════════════════════════
   CLARK — MobileWarehouseShell.jsx
   
   V15.61: Enhanced shell with:
   - Connection status indicator
   - Exit confirmation when data is unsaved
   - Haptic feedback on navigation
   - Offline banner
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect } from "react";
import { MobileHome } from "./MobileHome.jsx";
import { MobileQuickSale } from "./MobileQuickSale.jsx";
import { MobileStockReceive } from "./MobileStockReceive.jsx";
import { MobileQuickReturn } from "./MobileQuickReturn.jsx";
import { MobilePackage } from "./MobilePackage.jsx";
import { MobileStockCount } from "./MobileStockCount.jsx";
import { hapticLight } from "./_shared.jsx";

export function MobileWarehouseShell(props) {
  const [screen, setScreen] = useState("home");
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const userName = props.user?.displayName || props.user?.email?.split("@")[0] || "مستخدم";

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  const S = {
    page: { fontFamily: "'Cairo', 'Segoe UI', sans-serif", background: "#0F172A", minHeight: "100vh", direction: "rtl", color: "#fff", display: "flex", flexDirection: "column" },
    topBar: { padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #1E293B", background: "linear-gradient(180deg, #1E293B 0%, #0F172A 100%)" },
    brand: { fontSize: 18, fontWeight: 900, letterSpacing: 1, display: "flex", alignItems: "center", gap: 8 },
    user: { fontSize: 12, color: "#94A3B8", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 },
    content: { flex: 1, padding: "16px", overflowY: "auto" },
    backBtn: { display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", borderRadius: 10, background: "#1E293B", border: "1px solid #334155", color: "#94A3B8", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", WebkitTapHighlightColor: "transparent" },
    dot: { display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: online ? "#10B981" : "#EF4444", boxShadow: online ? "0 0 8px #10B981" : "0 0 8px #EF4444" },
  };

  const handleExit = () => {
    if (hasUnsaved && !window.confirm("فيه بيانات مش متحفظة. تخرج من غير حفظ؟")) return;
    window.location.href = "/";
  };

  const goHome = (force) => {
    if (!force && hasUnsaved && !window.confirm("فيه بيانات مش متحفظة. ترجع من غير حفظ؟")) return;
    hapticLight();
    setHasUnsaved(false);
    setScreen("home");
  };

  const navTo = (s) => { hapticLight(); setScreen(s); };

  const childProps = { ...props, onDone: () => goHome(true), setDirty: setHasUnsaved };

  return (
    <div style={S.page}>
      <div style={S.topBar}>
        {screen === "home" ? (
          <>
            <div style={S.brand}>
              <span style={{ fontSize: 22 }}>🏭</span>
              <span>CLARK — المخزن</span>
            </div>
            <div style={S.user}>
              <span style={S.dot}></span>
              <span>👤 {userName}</span>
            </div>
          </>
        ) : (
          <>
            <button style={S.backBtn} onClick={() => goHome()}>
              <span>→</span>
              <span>القائمة</span>
            </button>
            <div style={S.user}>
              <span style={S.dot}></span>
              <span>{online ? "متصل" : "غير متصل"}</span>
            </div>
          </>
        )}
      </div>

      {!online && (
        <div style={{ background: "#EF4444", color: "#fff", padding: "8px 16px", textAlign: "center", fontSize: 13, fontWeight: 700 }}>
          ⚠️ بدون اتصال — الحفظ مش هيشتغل لحد ما النت يرجع
        </div>
      )}

      <div style={S.content}>
        {screen === "home" && <MobileHome setScreen={navTo} onExit={handleExit} />}
        {screen === "sale" && <MobileQuickSale {...childProps} />}
        {screen === "stock-in" && <MobileStockReceive {...childProps} />}
        {screen === "return" && <MobileQuickReturn {...childProps} />}
        {screen === "package" && <MobilePackage {...childProps} />}
        {screen === "count" && <MobileStockCount {...childProps} />}
      </div>
    </div>
  );
}
