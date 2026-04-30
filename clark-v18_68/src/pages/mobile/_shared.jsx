/* ═══════════════════════════════════════════════════════════════
   CLARK — Mobile Shared Utilities
   
   V15.61: Helpers used by all mobile warehouse flows.
   - Haptic feedback (vibration API)
   - Duplicate scan prevention
   - Common mobile styles
   ═══════════════════════════════════════════════════════════════ */

/* ─── Haptic feedback ─── */
export const hapticLight = () => {
  if (navigator.vibrate) navigator.vibrate(10);
};
export const hapticMedium = () => {
  if (navigator.vibrate) navigator.vibrate(25);
};
export const hapticHeavy = () => {
  if (navigator.vibrate) navigator.vibrate([40, 20, 40]);
};
export const hapticError = () => {
  if (navigator.vibrate) navigator.vibrate([80, 50, 80, 50, 80]);
};

/* ─── Scan debounce — prevents the same QR from being read twice within 1500ms ─── */
const _lastScans = { text: "", at: 0 };
export function isDuplicateScan(text) {
  const now = Date.now();
  if (_lastScans.text === text && now - _lastScans.at < 1500) return true;
  _lastScans.text = text;
  _lastScans.at = now;
  return false;
}

/* ─── Common return reasons ─── */
export const RETURN_REASONS = [
  "عيب في الخياطة",
  "عيب في القماش",
  "مقاس خطأ",
  "لون مختلف",
  "عدم الرضا",
  "شحنة زيادة",
];

/* ─── Shared mobile styles ─── */
export const M = {
  btn: {
    padding: "14px 18px",
    borderRadius: 12,
    border: "none",
    fontSize: 16,
    fontWeight: 800,
    cursor: "pointer",
    fontFamily: "inherit",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    WebkitTapHighlightColor: "transparent",
  },
  input: {
    width: "100%",
    padding: "14px 16px",
    borderRadius: 12,
    border: "1px solid #334155",
    background: "#1E293B",
    color: "#fff",
    fontSize: 16,
    fontFamily: "inherit",
    boxSizing: "border-box",
  },
  card: {
    background: "#1E293B",
    borderRadius: 12,
    padding: "14px 16px",
    border: "1px solid #334155",
  },
};

/* ─── Toast component (reusable) ─── */
export function Toast({ msg, type }) {
  const bg = type === "error" ? "#EF4444" : type === "ok" ? "#10B981" : "#0EA5E9";
  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        left: "50%",
        transform: "translateX(-50%)",
        background: bg,
        color: "#fff",
        padding: "12px 20px",
        borderRadius: 12,
        fontSize: 15,
        fontWeight: 800,
        boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
        zIndex: 9999,
        maxWidth: "90vw",
        whiteSpace: "nowrap",
      }}
    >
      {msg}
    </div>
  );
}

/* ─── StepHeader component (reusable) ─── */
export function StepHeader({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: "#64748B", fontWeight: 700, letterSpacing: 1 }}>{title}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginTop: 2 }}>{subtitle}</div>
    </div>
  );
}

/* ─── Model manual search ─── */
export function searchOrders(orders, query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return [];
  return orders
    .filter((o) => {
      const modelNo = (o.modelNo || "").toLowerCase();
      const desc = (o.modelDesc || "").toLowerCase();
      return modelNo.includes(q) || desc.includes(q);
    })
    .slice(0, 8);
}

/* ─── Online status hook ─── */
export function getOnlineStatus() {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}
