/* ═══════════════════════════════════════════════════════════════
   CLARK — Notification Bell (V21.9.176, Slice 8/14)
   ───────────────────────────────────────────────────────────────

   In-app notification center — shows recent push notifications the
   user received (or that were sent to their audience). Reads from
   the `notificationHistory` Firestore collection populated by the
   /send and /send-internal endpoints.

   UX:
   - 🔔 icon (with unread badge count) in the topbar
   - Click → dropdown with last 20 notifications
   - Each item: category emoji + title + body + time + actions
   - "✓ تحديد الكل كمقروء" + "افتح الكل" actions

   Where to mount: import + render in App.jsx's TopBar / Navbar.
   The component is self-contained — no props required except UI
   primitives (T, FS) passed in for theme consistency.

   Read scope:
   - Admin/manager users (per firestore.rules: notificationHistory
     read = isManagerPlus) — viewers won't see anything (firestore
     will silently fail their read, which is OK)
   - Future: filter by audience to only show notifications relevant
     to the current user (Slice 13 analytics)

   Unread tracking:
   - localStorage key 'clark-notif-last-read' stores ISO timestamp
   - All items newer than that are 'unread'
   - Marking-as-read updates the timestamp to now
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useMemo, useRef } from "react";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "../firebase.js";

const LS_LAST_READ = "clark-notif-last-read";
const MAX_ITEMS = 30;

const CATEGORY_EMOJI = {
  treasury: "💰",
  tasks: "✅",
  instructions: "📋",
  warnings: "⚠️",
  approvals: "👍",
  broadcast: "📢",
  daily_summary: "📊",
};

function timeAgo(iso) {
  if (!iso) return "";
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diff = now - t;
  if (diff < 60_000) return "الآن";
  if (diff < 3_600_000) return Math.floor(diff / 60_000) + " د";
  if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + " س";
  return Math.floor(diff / 86_400_000) + " يوم";
}

export function NotificationBell({ T, FS }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [lastRead, setLastRead] = useState(() => {
    try { return localStorage.getItem(LS_LAST_READ) || ""; } catch (_) { return ""; }
  });
  const ddRef = useRef(null);

  /* ─── Subscribe to history collection ─── */
  useEffect(() => {
    const q = query(
      collection(db, "notificationHistory"),
      orderBy("at", "desc"),
      limit(MAX_ITEMS)
    );
    const unsub = onSnapshot(q, snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => {
      /* Viewer-role users get permission-denied here — fail quiet */
      if (err?.code !== "permission-denied") {
        console.warn("[V21.9.176] notification history listener error:", err?.code);
      }
      setItems([]);
    });
    return () => unsub();
  }, []);

  /* ─── Click-outside to close dropdown ─── */
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (ddRef.current && !ddRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  /* ─── Unread count ─── */
  const unreadCount = useMemo(() => {
    if (!lastRead) return items.length;
    return items.filter(i => String(i.at || "") > lastRead).length;
  }, [items, lastRead]);

  const markAllRead = () => {
    const now = new Date().toISOString();
    setLastRead(now);
    try { localStorage.setItem(LS_LAST_READ, now); } catch (_) { /* ignore */ }
  };

  /* ─── Build deep-link URL for an item ─── */
  const itemUrl = (item) => {
    const d = item.data || {};
    if (d.url) return d.url;
    const t = d.type || item.category;
    if (t === "treasury") return "/?tab=treasury" + (d.entryId ? "&entryId=" + encodeURIComponent(d.entryId) : "");
    if (t === "task") return "/?tab=tasks" + (d.taskId ? "&taskId=" + encodeURIComponent(d.taskId) : "");
    if (t === "instruction") return "/?tab=home&inst=" + encodeURIComponent(d.instructionId || "");
    if (t === "warning") return "/?tab=" + encodeURIComponent(d.target || "home");
    if (t === "broadcast") return "/?tab=home";
    return "/";
  };

  const onItemClick = (item) => {
    const url = itemUrl(item);
    setOpen(false);
    markAllRead();
    if (url && url !== "/") {
      try { window.location.href = url; } catch (_) { /* ignore */ }
    }
  };

  if (items.length === 0 && unreadCount === 0) {
    /* Empty state — still show the bell, just no badge */
  }

  return (
    <div ref={ddRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="الإشعارات"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "6px 8px",
          borderRadius: 8,
          position: "relative",
          fontSize: 18,
          color: T?.text || "#1E293B",
        }}
      >
        🔔
        {unreadCount > 0 && (
          <span style={{
            position: "absolute",
            top: 0,
            insetInlineEnd: 0,
            background: "#EF4444",
            color: "#fff",
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 800,
            padding: "1px 5px",
            minWidth: 16,
            textAlign: "center",
            lineHeight: 1.2,
          }}>{unreadCount > 99 ? "99+" : unreadCount}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute",
          top: "100%",
          insetInlineEnd: 0,
          marginTop: 6,
          width: 360,
          maxWidth: "calc(100vw - 20px)",
          maxHeight: 480,
          overflowY: "auto",
          background: T?.card || "#fff",
          border: "1px solid " + (T?.brd || "#E2E8F0"),
          borderRadius: 12,
          boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
          zIndex: 1000,
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 14px",
            borderBottom: "1px solid " + (T?.brd || "#E2E8F0"),
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "sticky",
            top: 0,
            background: T?.card || "#fff",
          }}>
            <div style={{ fontWeight: 800, fontSize: FS || 13 }}>الإشعارات ({items.length})</div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                style={{
                  background: "none",
                  border: "none",
                  color: T?.accent || "#0EA5E9",
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >✓ تحديد الكل كمقروء</button>
            )}
          </div>

          {/* Items */}
          {items.length === 0 ? (
            <div style={{ padding: "30px 14px", textAlign: "center", color: T?.textSec || "#64748B", fontSize: 12 }}>
              ما فيش إشعارات لسه
            </div>
          ) : (
            items.map(item => {
              const isUnread = !lastRead || String(item.at || "") > lastRead;
              return (
                <div
                  key={item.id}
                  onClick={() => onItemClick(item)}
                  style={{
                    padding: "10px 14px",
                    borderBottom: "1px solid " + (T?.brd || "#F1F5F9"),
                    cursor: "pointer",
                    background: isUnread ? (T?.accent + "08" || "#F0F9FF") : "transparent",
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = T?.bg || "#F8FAFC"}
                  onMouseLeave={e => e.currentTarget.style.background = isUnread ? (T?.accent + "08" || "#F0F9FF") : "transparent"}
                >
                  <div style={{ fontSize: 22, lineHeight: 1 }}>
                    {CATEGORY_EMOJI[item.category] || "🔔"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: 800,
                      fontSize: 13,
                      color: T?.text || "#1E293B",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}>{item.title || "—"}</div>
                    {item.body && (
                      <div style={{
                        fontSize: 11,
                        color: T?.textSec || "#64748B",
                        marginTop: 2,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}>{item.body}</div>
                    )}
                    <div style={{
                      fontSize: 10,
                      color: T?.textMut || "#94A3B8",
                      marginTop: 4,
                      display: "flex",
                      gap: 8,
                    }}>
                      <span>{timeAgo(item.at)}</span>
                      {item.stats && (
                        <span>· {item.stats.successCount}/{item.stats.targeted} وصلوا</span>
                      )}
                      {item.sentBy?.email && (
                        <span>· {item.sentBy.email}</span>
                      )}
                    </div>
                  </div>
                  {isUnread && (
                    <div style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: T?.accent || "#0EA5E9",
                      flexShrink: 0,
                      marginTop: 6,
                    }}/>
                  )}
                </div>
              );
            })
          )}

          {/* Footer */}
          {items.length > 0 && (
            <div style={{
              padding: "8px 14px",
              borderTop: "1px solid " + (T?.brd || "#E2E8F0"),
              fontSize: 11,
              color: T?.textSec || "#64748B",
              textAlign: "center",
              position: "sticky",
              bottom: 0,
              background: T?.card || "#fff",
            }}>
              عرض آخر {Math.min(MAX_ITEMS, items.length)} إشعار · الإعدادات: التواصل والإشعارات
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
