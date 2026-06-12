/* ═══════════════════════════════════════════════════════════════
   CLARK — Order Requests review panel (V21.21.72)

   شاشة مراجعة طلبات العملاء (المالك). بتجيب الطلبات من /api/order-requests
   (admin)، وبتعرضها بشكل احترافي مع إجراءات منفصلة:
     - 📞 واتساب: كلّم العميل وأكّد.
     - 🧾 حوّل لأمر بيع: يفتح فورم أمر البيع معبّأ (onConvert) — المالك يحفظ
       بالمسار الحقيقي (مفيش schema-mismatch).
     - ✅ علّم مؤكّد / ❌ رفض: تحديث حالة الطلب.

   الإجراءات منفصلة عمداً (decoupled) — مفيش lifecycle coupling مع الفورم.
   ═══════════════════════════════════════════════════════════════ */

import { useEffect, useState, useCallback } from "react";
import { Btn } from "../ui.jsx";
import { T } from "../../theme.js";
import { FS } from "../../constants/index.js";
import { ask, showToast } from "../../utils/popups.js";
import { auth } from "../../firebase.js";

const fmt = (n) => (n == null ? "0" : Math.round(Number(n)).toLocaleString("en-US"));
const fmtDate = (d) => { try { return new Date(d).toLocaleDateString("ar-EG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch (e) { return d || ""; } };
const stepBtn = (disabled) => ({ width: 26, height: 26, borderRadius: 7, border: "1px solid " + T.brd, background: disabled ? T.bg : T.cardSolid, color: disabled ? T.textMut : T.accent, fontSize: 16, fontWeight: 800, cursor: disabled ? "default" : "pointer", lineHeight: 1, fontFamily: "inherit", flexShrink: 0 });

const STATUS_META = {
  pending: { label: "معلّق", color: "#D97706", bg: "#FEF3C7" },
  confirmed: { label: "مؤكّد", color: "#059669", bg: "#D1FAE5" },
  rejected: { label: "مرفوض", color: "#DC2626", bg: "#FEE2E2" },
};

export function OrderRequestsPanel({ onConvert, onClose, isMob, onCountChange }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState("pending");
  const [editId, setEditId] = useState("");      /* الطلب اللي بيتعدّل */
  const [draft, setDraft] = useState({});         /* { orderId: { color: qtyPieces } } */

  const call = useCallback(async (payload) => {
    const u = auth.currentUser;
    if (!u) throw new Error("يرجى تسجيل الدخول");
    const token = await u.getIdToken();
    const res = await fetch("/api/order-requests", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminToken: token, ...payload }),
    });
    const j = await res.json();
    if (!res.ok || !j.ok) throw new Error(j.error || "فشل العملية");
    return j;
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const j = await call({ action: "list", status: filter === "all" ? undefined : filter, limit: 300 });
      setRequests(j.requests || []);
      if (onCountChange) onCountChange(j.pendingCount || 0);
    } catch (e) { setError(e.message || String(e)); }
    finally { setLoading(false); }
  }, [call, filter, onCountChange]);

  useEffect(() => { load(); }, [load]);

  const setStatus = async (req, action, reason) => {
    if (busy) return;
    setBusy(req.id);
    try {
      await call({ action, requestId: req.id, date: req.date, reason });
      showToast(action === "confirm" ? "✅ اتعلّم مؤكّد" : "❌ اترفض");
      await load();
    } catch (e) { showToast("⛔ " + (e.message || "فشل")); }
    finally { setBusy(""); }
  };

  /* ── تعديل الكميات (المالك يقلّل حسب المتاح) ── */
  const startEdit = (req) => {
    const d = {};
    (req.items || []).forEach(it => {
      d[it.orderId] = {};
      const cols = (Array.isArray(it.colors) && it.colors.length) ? it.colors : [{ color: "", qty: it.qty }];
      cols.forEach(c => { d[it.orderId][c.color || ""] = c.qty; });
    });
    setDraft(d); setEditId(req.id);
  };
  const draftQty = (orderId, color) => (draft[orderId] || {})[color || ""] || 0;
  const setDraftQty = (orderId, color, qty, max, step) => {
    const st = Math.max(1, step || 1);
    let v = Math.max(0, Math.min(max, Math.floor(Number(qty) || 0)));
    v = Math.floor(v / st) * st;
    setDraft(dr => ({ ...dr, [orderId]: { ...(dr[orderId] || {}), [color || ""]: v } }));
  };
  const saveEdit = async (req) => {
    const items = Object.entries(draft).map(([id, cm]) => ({
      id, colors: Object.entries(cm).filter(([, qv]) => qv > 0).map(([color, qty]) => ({ color, qty })),
    })).filter(it => it.colors.length);
    if (items.length === 0) { showToast("⚠️ لازم كمية واحدة على الأقل"); return; }
    setBusy(req.id);
    try {
      await call({ action: "update", requestId: req.id, date: req.date, items });
      showToast("✅ اتعدّلت الكميات");
      setEditId(""); await load();
    } catch (e) { showToast("⛔ " + (e.message || "فشل")); }
    finally { setBusy(""); }
  };

  const reject = async (req) => {
    const ok = await ask("رفض الطلب", "متأكد إنك عايز ترفض طلب " + (req.custName || "العميل") + "؟");
    if (!ok) return;
    setStatus(req, "reject", "");
  };

  const whatsapp = (req) => {
    const digits = String(req.custPhone || "").replace(/[^0-9]/g, "");
    if (!digits) { showToast("⚠️ مفيش رقم تليفون للعميل"); return; }
    const lines = (req.items || []).map(it => "• " + it.modelNo + " ×" + it.qty).join("\n");
    const txt = "أهلاً " + (req.custName || "") + " 👋\nبخصوص طلبك:\n" + lines + "\nالإجمالي: " + fmt(req.totalValue) + " ج.م\nنقدر نأكّد الأوردر؟";
    window.open("https://wa.me/" + digits + "?text=" + encodeURIComponent(txt), "_blank");
  };

  return <div onClick={onClose} style={{
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 10000,
    display: "flex", alignItems: "flex-start", justifyContent: "center", padding: isMob ? 8 : 24, overflowY: "auto",
  }}>
    <div onClick={e => e.stopPropagation()} style={{
      background: T.cardSolid, borderRadius: 16, width: "100%", maxWidth: 680, marginTop: isMob ? 8 : 24,
      border: "1px solid " + T.brd, boxShadow: "0 25px 70px rgba(0,0,0,0.4)", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ padding: isMob ? "14px 16px" : "16px 20px", borderBottom: "1px solid " + T.brd, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: FS + 3, fontWeight: 800, color: T.text }}>🛒 طلبات العملاء</div>
        <Btn ghost small onClick={onClose}>✕</Btn>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 8, padding: "10px 16px", borderBottom: "1px solid " + T.brd }}>
        {[["pending", "معلّقة"], ["confirmed", "مؤكّدة"], ["rejected", "مرفوضة"], ["all", "الكل"]].map(([k, lbl]) => (
          <div key={k} onClick={() => setFilter(k)} style={{ cursor: "pointer", padding: "5px 12px", borderRadius: 8, fontSize: FS - 2, fontWeight: 700, background: filter === k ? T.accent : T.bg, color: filter === k ? "#fff" : T.textSec }}>{lbl}</div>
        ))}
        <Btn ghost small onClick={load} style={{ marginInlineStart: "auto" }}>🔄</Btn>
      </div>

      <div style={{ padding: isMob ? 12 : 16, maxHeight: "70vh", overflowY: "auto" }}>
        {loading
          ? <div style={{ padding: 30, textAlign: "center", color: T.textSec }}>⏳ جاري التحميل...</div>
          : error
          ? <div style={{ padding: 16, background: T.err + "10", border: "1px solid " + T.err + "30", borderRadius: 10, color: T.err, fontSize: FS - 1 }}>⛔ {error}</div>
          : requests.length === 0
          ? <div style={{ padding: 40, textAlign: "center", color: T.textMut, background: T.bg, borderRadius: 12, border: "1px dashed " + T.brd }}>مفيش طلبات {filter === "pending" ? "معلّقة" : ""}</div>
          : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {requests.map(req => {
              const meta = STATUS_META[req.status] || STATUS_META.pending;
              return <div key={req.id} style={{ border: "1px solid " + T.brd, borderRadius: 12, overflow: "hidden", background: T.bg }}>
                {/* card header */}
                <div style={{ padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, borderBottom: "1px solid " + T.brd, background: T.cardSolid }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, color: T.text, fontSize: FS }}>{req.custName || "عميل"}</div>
                    <div style={{ fontSize: FS - 3, color: T.textMut }}>{req.custPhone || "—"} · {fmtDate(req.createdAt)}</div>
                  </div>
                  <span style={{ fontSize: FS - 4, fontWeight: 700, color: meta.color, background: meta.bg, padding: "2px 10px", borderRadius: 20, flexShrink: 0 }}>{meta.label}</span>
                </div>
                {/* items */}
                <div style={{ padding: "8px 12px" }}>
                  {(() => {
                    const editing = editId === req.id;
                    return (req.items || []).map((it, i) => {
                      const allCols = (Array.isArray(it.colors) && it.colors.length) ? it.colors : [{ color: "", hex: "", image: "", qty: it.qty }];
                      const cols = allCols.filter(c => c.color);
                      const step = Math.max(1, Number(it.seriesSize) || 1);
                      return <div key={i} style={{ padding: "6px 0", borderBottom: i < req.items.length - 1 ? "1px dashed " + T.brd : "none" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: FS - 2 }}>
                          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: T.textSec }}>
                            <b style={{ color: T.text }}>{it.modelNo}</b>{it.sizesLabel ? " · " + it.sizesLabel : ""}{step > 1 ? " · سيري " + step : ""}{it.requestedQty > it.qty ? <span style={{ color: T.warn }}> (طلب {it.requestedQty})</span> : ""}
                          </span>
                          {!editing && <span style={{ whiteSpace: "nowrap", fontWeight: 700, color: T.text }}>{it.qty} × {fmt(it.unitPrice)}</span>}
                        </div>
                        {editing
                          ? <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 6 }}>
                            {allCols.map((c, ci) => {
                              const key = c.color || "";
                              const cur = draftQty(it.orderId, key);
                              return <div key={ci} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                {c.color
                                  ? (c.image ? <img src={c.image} alt="" style={{ width: 22, height: 22, borderRadius: 5, objectFit: "cover" }} /> : <span style={{ width: 18, height: 18, borderRadius: "50%", background: c.hex || "#ccc", display: "inline-block", border: "1px solid " + T.brd }} />)
                                  : null}
                                <span style={{ flex: 1, minWidth: 0, fontSize: FS - 3, color: T.textSec, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.color || "الكمية"}</span>
                                <button onClick={() => setDraftQty(it.orderId, key, cur - step, c.qty, step)} disabled={cur <= 0} style={stepBtn(cur <= 0)}>−</button>
                                <span style={{ minWidth: 34, textAlign: "center", fontWeight: 800, color: cur ? T.text : T.textMut, fontSize: FS - 1 }}>{cur}</span>
                                <button onClick={() => setDraftQty(it.orderId, key, cur + step, c.qty, step)} disabled={cur >= c.qty} style={stepBtn(cur >= c.qty)}>+</button>
                                <span style={{ fontSize: FS - 4, color: T.textMut, minWidth: 36, textAlign: "left" }}>/ {c.qty}</span>
                              </div>;
                            })}
                          </div>
                          : (cols.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 5 }}>
                            {cols.map((c, ci) => <span key={ci} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: FS - 4, background: T.bg, border: "1px solid " + T.brd, borderRadius: 20, padding: "2px 9px 2px 4px", color: T.textSec, fontWeight: 600 }}>
                              {c.image ? <img src={c.image} alt="" style={{ width: 16, height: 16, borderRadius: 4, objectFit: "cover" }} /> : <span style={{ width: 13, height: 13, borderRadius: "50%", background: c.hex || "#ccc", display: "inline-block", border: "1px solid " + T.brd }} />}
                              {c.color} <b style={{ color: T.text }}>×{c.qty}</b>
                            </span>)}
                          </div>)}
                      </div>;
                    });
                  })()}
                  {(() => {
                    const editing = editId === req.id;
                    let tq = req.totalQty, tv = req.totalValue;
                    if (editing) { tq = 0; tv = 0; (req.items || []).forEach(it => { const q = Object.values(draft[it.orderId] || {}).reduce((a, b) => a + b, 0); tq += q; tv += q * (Number(it.unitPrice) || 0); }); }
                    return <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, paddingTop: 6, borderTop: "1px solid " + T.brd }}>
                      <span style={{ fontSize: FS - 2, color: T.textMut }}>{tq} قطعة{editing ? " (بعد التعديل)" : ""}</span>
                      <span style={{ fontSize: FS, fontWeight: 900, color: T.text }}>{fmt(tv)} ج.م</span>
                    </div>;
                  })()}
                  {req.note && <div style={{ marginTop: 6, fontSize: FS - 3, color: T.textSec, fontStyle: "italic" }}>📝 {req.note}</div>}
                  {req.status === "confirmed" && req.salesOrderId && <div style={{ marginTop: 4, fontSize: FS - 3, color: T.ok }}>✓ اتحوّل لأمر بيع</div>}
                </div>
                {/* actions */}
                {req.status === "pending" && (editId === req.id
                  ? <div style={{ display: "flex", gap: 6, padding: "8px 12px", borderTop: "1px solid " + T.brd }}>
                    <button disabled={busy === req.id} onClick={() => saveEdit(req)} style={{ flex: "1 1 auto", padding: "8px", borderRadius: 8, border: "none", background: T.ok, color: "#fff", fontWeight: 800, fontSize: FS - 2, cursor: "pointer", fontFamily: "inherit" }}>💾 حفظ التعديلات</button>
                    <button onClick={() => setEditId("")} style={{ flex: "0 0 auto", padding: "8px 16px", borderRadius: 8, border: "1px solid " + T.brd, background: T.bg, color: T.textSec, fontWeight: 700, fontSize: FS - 2, cursor: "pointer", fontFamily: "inherit" }}>إلغاء</button>
                  </div>
                  : <div style={{ display: "flex", gap: 6, padding: "8px 12px", borderTop: "1px solid " + T.brd, flexWrap: "wrap" }}>
                    <button onClick={() => whatsapp(req)} style={{ flex: "1 1 auto", padding: "8px", borderRadius: 8, border: "1px solid #25D36640", background: "#25D36612", color: "#1DA851", fontWeight: 700, fontSize: FS - 2, cursor: "pointer", fontFamily: "inherit" }}>📞 واتساب</button>
                    <button onClick={() => { onConvert && onConvert(req); }} style={{ flex: "1 1 auto", padding: "8px", borderRadius: 8, border: "none", background: "#0EA5E9", color: "#fff", fontWeight: 800, fontSize: FS - 2, cursor: "pointer", fontFamily: "inherit" }}>🧾 حوّل لأمر بيع</button>
                    <button onClick={() => startEdit(req)} style={{ flex: "0 0 auto", padding: "8px 12px", borderRadius: 8, border: "1px solid " + T.accent + "40", background: T.accent + "12", color: T.accent, fontWeight: 700, fontSize: FS - 2, cursor: "pointer", fontFamily: "inherit" }}>✏️ تعديل</button>
                    <button disabled={busy === req.id} onClick={() => setStatus(req, "confirm")} style={{ flex: "0 0 auto", padding: "8px 12px", borderRadius: 8, border: "1px solid " + T.ok + "40", background: T.ok + "12", color: T.ok, fontWeight: 700, fontSize: FS - 2, cursor: "pointer", fontFamily: "inherit" }}>✅</button>
                    <button disabled={busy === req.id} onClick={() => reject(req)} style={{ flex: "0 0 auto", padding: "8px 12px", borderRadius: 8, border: "1px solid " + T.err + "33", background: T.err + "10", color: T.err, fontWeight: 700, fontSize: FS - 2, cursor: "pointer", fontFamily: "inherit" }}>❌</button>
                  </div>
                )}
              </div>;
            })}
          </div>}
      </div>
    </div>
  </div>;
}
