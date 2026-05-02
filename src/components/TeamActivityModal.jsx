/* ═══════════════════════════════════════════════════════════════
   CLARK — Team Activity Modal (V19.15)

   Shows the admin a list of all known users and the relative time
   since their last activity, derived from data.auditLog.

   Why audit log instead of a presence heartbeat:
     - Heartbeats cost ~17K writes/day for 6 employees → blows the free tier.
     - Audit log already records userName + ts on every meaningful action.
     - A user "silent for 1+ hour" is functionally equivalent — either they
       stopped working or they went offline. Both deserve admin attention.

   Status thresholds (ms):
     - green  : last activity ≤ 5 min
     - yellow : last activity ≤ 60 min
     - red    : last activity > 60 min

   The helper computeTeamActivity() is used both here AND in App.jsx to
   render the red badge on the topbar button — keep it pure & cheap.
   ═══════════════════════════════════════════════════════════════ */

const GREEN_MS = 5 * 60 * 1000;
const YELLOW_MS = 60 * 60 * 1000;

export function computeTeamActivity(data, currentUserName) {
  const log = (data && data.auditLog) || [];
  const lastByUser = new Map();
  /* Walk the log once. auditLog is unshift()ed so newest is first; first hit wins. */
  for (const entry of log) {
    const u = (entry.user || "").trim();
    if (!u) continue;
    if (!lastByUser.has(u)) {
      lastByUser.set(u, new Date(entry.ts).getTime() || 0);
    }
  }
  /* Also surface known users from config.users / config.usersList who haven't
     touched the audit log yet — they show up as "no activity" so the admin
     can spot a teammate who hasn't logged anything. */
  const knownUsers = new Set();
  if (data && data.usersList && Array.isArray(data.usersList)) {
    data.usersList.forEach(u => {
      const name = (u.displayName || u.name || (u.email ? u.email.split("@")[0] : "") || "").trim();
      if (name) knownUsers.add(name);
    });
  }
  for (const u of lastByUser.keys()) knownUsers.add(u);
  if (currentUserName) knownUsers.add(currentUserName);

  const now = Date.now();
  const rows = [];
  for (const name of knownUsers) {
    const last = lastByUser.get(name) || 0;
    const elapsed = last ? now - last : Infinity;
    let status = "red";
    if (elapsed <= GREEN_MS) status = "green";
    else if (elapsed <= YELLOW_MS) status = "yellow";
    rows.push({
      name,
      isMe: currentUserName && name === currentUserName,
      lastTs: last,
      elapsed,
      status,
    });
  }
  /* Sort: me first, then by elapsed ascending (most recently active first). */
  rows.sort((a, b) => {
    if (a.isMe && !b.isMe) return -1;
    if (!a.isMe && b.isMe) return 1;
    return a.elapsed - b.elapsed;
  });
  return rows;
}

function fmtElapsedAr(elapsed, lastTs) {
  if (!lastTs) return "مفيش نشاط مسجّل";
  const sec = Math.max(0, Math.floor(elapsed / 1000));
  if (sec < 10) return "نشط الآن";
  if (sec < 60) return "آخر نشاط من " + sec + " ث";
  const min = Math.floor(sec / 60);
  if (min < 60) return "آخر نشاط من " + min + " د";
  const hr = Math.floor(min / 60);
  if (hr < 24) return "آخر نشاط من " + hr + " س" + (min % 60 ? " و" + (min % 60) + " د" : "");
  const day = Math.floor(hr / 24);
  return "آخر نشاط من " + day + " يوم";
}

export default function TeamActivityModal({ open, onClose, data, currentUserName, T }) {
  if (!open) return null;
  const rows = computeTeamActivity(data, currentUserName);
  const greenCount = rows.filter(r => r.status === "green").length;
  const yellowCount = rows.filter(r => r.status === "yellow").length;
  const redCount = rows.filter(r => r.status === "red").length;

  const dot = (s) => s === "green" ? "#10B981" : s === "yellow" ? "#F59E0B" : "#EF4444";

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 9999, padding: 16, direction: "rtl"
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: T?.bg || "#fff", borderRadius: 12,
        padding: 0, maxWidth: 440, width: "100%", maxHeight: "85vh",
        display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: "0 20px 50px rgba(0,0,0,0.25)"
      }}>
        {/* Header */}
        <div style={{
          padding: "14px 18px",
          borderBottom: "1px solid " + (T?.brd || "#E5E7EB"),
          display: "flex", justifyContent: "space-between", alignItems: "center"
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: T?.text || "#111" }}>نشاط الفريق</div>
            <div style={{ fontSize: 11, color: T?.textMut || "#6B7280", marginTop: 2 }}>
              من سجل الأحداث · مفيش كتابات إضافية
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "transparent", border: "none", fontSize: 20,
            cursor: "pointer", color: T?.textMut || "#6B7280", padding: "4px 8px"
          }}>✕</button>
        </div>

        {/* Summary chips */}
        <div style={{
          padding: "10px 18px",
          display: "flex", gap: 8, flexWrap: "wrap",
          borderBottom: "1px solid " + (T?.brd || "#E5E7EB")
        }}>
          <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 12, background: "#10B98115", color: "#065F46", fontWeight: 600 }}>
            ● {greenCount} نشط
          </span>
          <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 12, background: "#F59E0B15", color: "#92400E", fontWeight: 600 }}>
            ● {yellowCount} هادي
          </span>
          <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 12, background: "#EF444415", color: "#991B1B", fontWeight: 600 }}>
            ● {redCount} ساكت
          </span>
        </div>

        {/* List */}
        <div style={{ overflow: "auto", flex: 1, padding: "8px 0" }}>
          {rows.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: T?.textMut || "#6B7280", fontSize: 13 }}>
              مفيش بيانات نشاط لسه
            </div>
          ) : rows.map(r => (
            <div key={r.name} style={{
              padding: "10px 18px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              borderBottom: "1px solid " + (T?.brd ? T.brd + "60" : "#F3F4F6")
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                <span style={{
                  width: 10, height: 10, borderRadius: "50%",
                  background: dot(r.status), flexShrink: 0
                }} />
                <span style={{
                  fontSize: 13, fontWeight: 600,
                  color: T?.text || "#111",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
                }}>
                  {r.name}
                  {r.isMe && <span style={{ fontSize: 10, color: T?.textMut || "#6B7280", fontWeight: 400, marginRight: 6 }}>(أنت)</span>}
                </span>
              </div>
              <span style={{
                fontSize: 12,
                color: r.status === "red" ? "#991B1B" : (T?.textMut || "#6B7280"),
                fontWeight: r.status === "red" ? 600 : 400,
                whiteSpace: "nowrap", marginRight: 10
              }}>
                {fmtElapsedAr(r.elapsed, r.lastTs)}
              </span>
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div style={{
          padding: "10px 18px",
          fontSize: 11, color: T?.textMut || "#6B7280",
          background: T?.bg2 || "#F9FAFB",
          borderTop: "1px solid " + (T?.brd || "#E5E7EB"),
          lineHeight: 1.5
        }}>
          الحدود: 🟢 نشاط آخر 5 د · 🟡 آخر ساعة · 🔴 من ساعة فأكثر
        </div>
      </div>
    </div>
  );
}
