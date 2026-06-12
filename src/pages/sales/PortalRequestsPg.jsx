/* ═══════════════════════════════════════════════════════════════
   CLARK — Portal Sales Requests page (V21.21.79)

   تاب «🛒 طلبات بورتال» في هَب المبيعات. بيعرض طلبات العملاء الجاية من
   البورتال — لكل عميل، بالألوان وصورة كل لون. الإجراءات:
     - 📞 واتساب: كلّم العميل وأكّد.
     - ✏️ تعديل: المالك يقلّل كمية أي لون حسب المتاح (re-validate server-side).
     - 🧾 حوّل لأمر بيع: ينشئ أمر بيع **بالإجمالي** (سطر لكل موديل، الألوان
       في الوصف) عبر createSalesOrderDirectMutator — يحجز/يخصم من المخزون
       ويمشي في المسار الطبيعي للمبيعات. (الألوان طبقة عرض/تجهيز — المخزون
       مايتتبّعش باللون، فالأمر بالإجمالي هو الصح.)
     - ✅ علّم مؤكّد / ❌ رفض.
   ═══════════════════════════════════════════════════════════════ */

import { useEffect, useState, useCallback } from "react";
import { Btn, Card } from "../../components/ui.jsx";
import { T } from "../../theme.js";
import { FS } from "../../constants/index.js";
import { ask, showToast } from "../../utils/popups.js";
import { auth } from "../../firebase.js";
import { createSalesOrderDirectMutator } from "../../utils/sales/salesOrders.js";

const fmt = (n) => (n == null ? "0" : Math.round(Number(n)).toLocaleString("en-US"));
const fmtDate = (d) => { try { return new Date(d).toLocaleDateString("ar-EG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch (e) { return d || ""; } };
const stepBtn = (disabled) => ({ width: 26, height: 26, borderRadius: 7, border: "1px solid " + T.brd, background: disabled ? T.bg : T.cardSolid, color: disabled ? T.textMut : T.accent, fontSize: 16, fontWeight: 800, cursor: disabled ? "default" : "pointer", lineHeight: 1, fontFamily: "inherit", flexShrink: 0 });

const STATUS_META = {
  pending: { label: "معلّق", color: "#D97706", bg: "#FEF3C7" },
  confirmed: { label: "مؤكّد", color: "#059669", bg: "#D1FAE5" },
  rejected: { label: "مرفوض", color: "#DC2626", bg: "#FEE2E2" },
};

export function PortalRequestsPg({ data, upConfig, isMob, user, canEdit }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState("pending");
  const [editId, setEditId] = useState("");
  const [draft, setDraft] = useState({});
  const userName = user?.displayName || (user?.email || "").split("@")[0] || "";

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
    } catch (e) { setError(e.message || String(e)); }
    finally { setLoading(false); }
  }, [call, filter]);

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

  const reject = async (req) => {
    const ok = await ask("رفض الطلب", "متأكد إنك عايز ترفض طلب " + (req.custName || "العميل") + "؟");
    if (ok) setStatus(req, "reject", "");
  };

  const whatsapp = (req) => {
    const digits = String(req.custPhone || "").replace(/[^0-9]/g, "");
    if (!digits) { showToast("⚠️ مفيش رقم تليفون للعميل"); return; }
    const lines = (req.items || []).map(it => "• " + it.modelNo + " ×" + it.qty).join("\n");
    const txt = "أهلاً " + (req.custName || "") + " 👋\nبخصوص طلبك:\n" + lines + "\nالإجمالي: " + fmt(req.totalValue) + " ج.م\nنقدر نأكّد الأوردر؟";
    window.open("https://wa.me/" + digits + "?text=" + encodeURIComponent(txt), "_blank");
  };

  /* ── تحويل لأمر بيع (بالإجمالي — سطر لكل موديل، الألوان في الوصف) ── */
  const convertToSO = async (req) => {
    if (!canEdit) { showToast("⚠️ مالكش صلاحية إنشاء أوامر بيع"); return; }
    const colorNote = (it) => {
      const cols = (it.colors || []).filter(c => c.color);
      return cols.length ? cols.map(c => c.color + "×" + c.qty).join("، ") : "";
    };
    const ok = await ask("تحويل لأمر بيع",
      "هيتعمل أمر بيع بإجمالي " + req.totalQty + " قطعة لـ " + (req.custName || "العميل") +
      " ويتحجز من المخزون (المسار الطبيعي للمبيعات). تمام؟");
    if (!ok) return;
    setBusy(req.id);
    try {
      const payload = {
        date: new Date().toISOString().split("T")[0],
        customerId: req.custId || "",
        customerName: req.custName || "",
        customerPhone: req.custPhone || "",
        customerNameAdHoc: "",
        items: (req.items || []).map(it => {
          const note = colorNote(it);
          return {
            sourceType: "order", sourceId: it.orderId,
            modelNo: it.modelNo || "",
            description: (it.modelDesc || "") + (note ? " (" + note + ")" : ""),
            unit: "قطعة", qty: it.qty, unitPrice: it.unitPrice,
            discountType: "pct", discountValue: 0,
          };
        }),
        discountPct: 0,
        notes: "من طلب بورتال" + (req.note ? " — " + req.note : ""),
      };
      const ps = data.purchaseSettings || {};
      const opts = { stockEnabled: !!ps.stockEnabled, blockOnInsufficientStock: ps.blockOnInsufficientStock !== false };
      let res = { ok: true };
      upConfig(d => { res = createSalesOrderDirectMutator(d, payload, userName, opts); });
      if (!res || !res.ok) { showToast("⛔ " + (res?.error || "تعذّر إنشاء أمر البيع")); setBusy(""); return; }
      showToast("✓ اتعمل أمر بيع " + (res.salesOrder?.orderNo || "") + (opts.stockEnabled && res.salesOrder?.stockDeducted ? " وخصم المخزون" : ""));
      try { await call({ action: "confirm", requestId: req.id, date: req.date, salesOrderId: res.salesOrder?.orderNo || res.salesOrder?.id || "" }); } catch (e) { /* الأمر اتعمل */ }
      await load();
    } catch (e) { showToast("⛔ " + (e.message || "فشل")); }
    finally { setBusy(""); }
  };

  /* ── تعديل الكميات ── */
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

  const pendingCount = requests.filter(r => r.status === "pending").length;

  return <div style={{ padding: isMob ? 12 : 20 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
      <div style={{ fontWeight: 800, fontSize: FS + 4, color: T.text }}>🛒 طلبات بورتال العملاء</div>
      <Btn ghost small onClick={load}>🔄 تحديث</Btn>
    </div>

    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
      {[["pending", "معلّقة"], ["confirmed", "مؤكّدة"], ["rejected", "مرفوضة"], ["all", "الكل"]].map(([k, lbl]) => (
        <div key={k} onClick={() => setFilter(k)} style={{ cursor: "pointer", padding: "6px 14px", borderRadius: 8, fontSize: FS - 2, fontWeight: 700, background: filter === k ? T.accent : T.bg, color: filter === k ? "#fff" : T.textSec, border: "1px solid " + (filter === k ? T.accent : T.brd) }}>
          {lbl}{k === "pending" && filter === "pending" && pendingCount ? " (" + pendingCount + ")" : ""}
        </div>
      ))}
    </div>

    {loading
      ? <div style={{ padding: 40, textAlign: "center", color: T.textSec }}>⏳ جاري التحميل...</div>
      : error
      ? <div style={{ padding: 16, background: T.err + "10", border: "1px solid " + T.err + "30", borderRadius: 10, color: T.err, fontSize: FS - 1 }}>⛔ {error}</div>
      : requests.length === 0
      ? <div style={{ padding: 40, textAlign: "center", color: T.textMut, background: T.bg, borderRadius: 12, border: "1px dashed " + T.brd }}>مفيش طلبات {filter === "pending" ? "معلّقة" : ""}</div>
      : <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "repeat(auto-fill,minmax(380px,1fr))", gap: 12 }}>
        {requests.map(req => {
          const meta = STATUS_META[req.status] || STATUS_META.pending;
          const editing = editId === req.id;
          let tq = req.totalQty, tv = req.totalValue;
          if (editing) { tq = 0; tv = 0; (req.items || []).forEach(it => { const q = Object.values(draft[it.orderId] || {}).reduce((a, b) => a + b, 0); tq += q; tv += q * (Number(it.unitPrice) || 0); }); }
          return <Card key={req.id} style={{ padding: 0, overflow: "hidden" }}>
            {/* header */}
            <div style={{ padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, borderBottom: "1px solid " + T.brd, background: T.bg }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, color: T.text, fontSize: FS }}>{req.custName || "عميل"}</div>
                <div style={{ fontSize: FS - 3, color: T.textMut }}>{req.custPhone || "—"} · {fmtDate(req.createdAt)}</div>
              </div>
              <span style={{ fontSize: FS - 4, fontWeight: 700, color: meta.color, background: meta.bg, padding: "2px 10px", borderRadius: 20, flexShrink: 0 }}>{meta.label}</span>
            </div>
            {/* items */}
            <div style={{ padding: "8px 12px" }}>
              {(req.items || []).map((it, i) => {
                const allCols = (Array.isArray(it.colors) && it.colors.length) ? it.colors : [{ color: "", hex: "", image: "", qty: it.qty }];
                const cols = allCols.filter(c => c.color);
                const step = Math.max(1, Number(it.seriesSize) || 1);
                return <div key={i} style={{ padding: "8px 0", borderBottom: i < req.items.length - 1 ? "1px dashed " + T.brd : "none" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {it.image
                      ? <img src={it.image} alt="" loading="lazy" style={{ width: 42, height: 56, borderRadius: 8, objectFit: "cover", flexShrink: 0, border: "1px solid " + T.brd }} />
                      : <div style={{ width: 42, height: 56, borderRadius: 8, background: T.bg, border: "1px solid " + T.brd, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>👕</div>}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: FS - 1, fontWeight: 800, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.modelNo}</div>
                      <div style={{ fontSize: FS - 4, color: T.textMut }}>{it.sizesLabel ? "📏 " + it.sizesLabel : ""}{step > 1 ? " · سيري " + step : ""}{it.requestedQty > it.qty ? " · طلب " + it.requestedQty : ""}</div>
                      {!editing && <div style={{ fontSize: FS - 2, fontWeight: 700, color: T.text }}>{it.qty} قطعة × {fmt(it.unitPrice)}</div>}
                    </div>
                  </div>
                  {/* colors with images */}
                  {editing
                    ? <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 8 }}>
                      {allCols.map((c, ci) => {
                        const key = c.color || ""; const cur = draftQty(it.orderId, key);
                        return <div key={ci} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {c.color && (c.image
                            ? <img src={c.image} alt="" style={{ width: 26, height: 26, borderRadius: 6, objectFit: "cover" }} />
                            : <span style={{ width: 20, height: 20, borderRadius: "50%", background: c.hex || "#ccc", display: "inline-block", border: "1px solid " + T.brd }} />)}
                          <span style={{ flex: 1, minWidth: 0, fontSize: FS - 2, color: T.textSec, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.color || "الكمية"}</span>
                          <button onClick={() => setDraftQty(it.orderId, key, cur - step, c.qty, step)} disabled={cur <= 0} style={stepBtn(cur <= 0)}>−</button>
                          <span style={{ minWidth: 34, textAlign: "center", fontWeight: 800, color: cur ? T.text : T.textMut, fontSize: FS - 1 }}>{cur}</span>
                          <button onClick={() => setDraftQty(it.orderId, key, cur + step, c.qty, step)} disabled={cur >= c.qty} style={stepBtn(cur >= c.qty)}>+</button>
                          <span style={{ fontSize: FS - 4, color: T.textMut, minWidth: 36, textAlign: "left" }}>/ {c.qty}</span>
                        </div>;
                      })}
                    </div>
                    : (cols.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                      {cols.map((c, ci) => <div key={ci} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, width: 56 }}>
                        {c.image
                          ? <img src={c.image} alt="" loading="lazy" style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover", border: "1px solid " + T.brd }} />
                          : <span style={{ width: 48, height: 48, borderRadius: 8, background: c.hex || "#ccc", border: "1px solid " + T.brd }} />}
                        <span style={{ fontSize: FS - 5, color: T.textSec, fontWeight: 600, textAlign: "center", lineHeight: 1.1, maxWidth: 56, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%" }}>{c.color}</span>
                        <span style={{ fontSize: FS - 3, fontWeight: 900, color: T.accent }}>×{c.qty}</span>
                      </div>)}
                    </div>)}
                </div>;
              })}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTop: "1px solid " + T.brd }}>
                <span style={{ fontSize: FS - 1, color: T.textMut, fontWeight: 700 }}>{tq} قطعة{editing ? " (بعد التعديل)" : ""}</span>
                <span style={{ fontSize: FS + 2, fontWeight: 900, color: T.text }}>{fmt(tv)} ج.م</span>
              </div>
              {req.note && <div style={{ marginTop: 6, fontSize: FS - 3, color: T.textSec, fontStyle: "italic" }}>📝 {req.note}</div>}
              {req.status === "confirmed" && req.salesOrderId && <div style={{ marginTop: 4, fontSize: FS - 3, color: T.ok, fontWeight: 700 }}>✓ اتحوّل لأمر بيع {req.salesOrderId}</div>}
            </div>
            {/* actions */}
            {req.status === "pending" && (editing
              ? <div style={{ display: "flex", gap: 6, padding: "8px 12px", borderTop: "1px solid " + T.brd }}>
                <button disabled={busy === req.id} onClick={() => saveEdit(req)} style={{ flex: "1 1 auto", padding: "9px", borderRadius: 8, border: "none", background: T.ok, color: "#fff", fontWeight: 800, fontSize: FS - 1, cursor: "pointer", fontFamily: "inherit" }}>💾 حفظ التعديلات</button>
                <button onClick={() => setEditId("")} style={{ flex: "0 0 auto", padding: "9px 18px", borderRadius: 8, border: "1px solid " + T.brd, background: T.bg, color: T.textSec, fontWeight: 700, fontSize: FS - 1, cursor: "pointer", fontFamily: "inherit" }}>إلغاء</button>
              </div>
              : <div style={{ display: "flex", gap: 6, padding: "8px 12px", borderTop: "1px solid " + T.brd, flexWrap: "wrap" }}>
                <button onClick={() => whatsapp(req)} style={{ flex: "1 1 auto", padding: "9px", borderRadius: 8, border: "1px solid #25D36640", background: "#25D36612", color: "#1DA851", fontWeight: 700, fontSize: FS - 1, cursor: "pointer", fontFamily: "inherit" }}>📞 واتساب</button>
                {canEdit && <button disabled={busy === req.id} onClick={() => convertToSO(req)} style={{ flex: "1 1 auto", padding: "9px", borderRadius: 8, border: "none", background: "#0EA5E9", color: "#fff", fontWeight: 800, fontSize: FS - 1, cursor: "pointer", fontFamily: "inherit" }}>🧾 حوّل لأمر بيع</button>}
                {canEdit && <button onClick={() => startEdit(req)} style={{ flex: "0 0 auto", padding: "9px 12px", borderRadius: 8, border: "1px solid " + T.accent + "40", background: T.accent + "12", color: T.accent, fontWeight: 700, fontSize: FS - 1, cursor: "pointer", fontFamily: "inherit" }}>✏️</button>}
                {canEdit && <button disabled={busy === req.id} onClick={() => setStatus(req, "confirm")} style={{ flex: "0 0 auto", padding: "9px 12px", borderRadius: 8, border: "1px solid " + T.ok + "40", background: T.ok + "12", color: T.ok, fontWeight: 700, fontSize: FS - 1, cursor: "pointer", fontFamily: "inherit" }}>✅</button>}
                {canEdit && <button disabled={busy === req.id} onClick={() => reject(req)} style={{ flex: "0 0 auto", padding: "9px 12px", borderRadius: 8, border: "1px solid " + T.err + "33", background: T.err + "10", color: T.err, fontWeight: 700, fontSize: FS - 1, cursor: "pointer", fontFamily: "inherit" }}>❌</button>}
              </div>
            )}
          </Card>;
        })}
      </div>}
  </div>;
}
