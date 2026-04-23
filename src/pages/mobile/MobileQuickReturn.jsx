/* ═══════════════════════════════════════════════════════════════
   CLARK — MobileQuickReturn.jsx
   
   V15.59: Mobile-optimized customer return flow.
   
   Steps:
   1. Pick customer (search)
   2. Scan model QR + enter return qty + note
   3. Review + confirm → saved to order.customerReturns
   
   Validates: cannot return more than customer has received (net).
   ═══════════════════════════════════════════════════════════════ */

import { useState, useMemo, useEffect } from "react";
import { QRScanner } from "../../components/ui.jsx";
import { playBeep } from "../../utils/audio.js";
import { fmt } from "../../utils/format.js";
import { hapticMedium, hapticError, isDuplicateScan, RETURN_REASONS } from "./_shared.jsx";

export function MobileQuickReturn({ data, updOrder, user, onDone, setDirty }) {
  const [step, setStep] = useState("customer"); /* customer | scan | entry | review */
  const [selectedCust, setSelectedCust] = useState(null);
  const [custSearch, setCustSearch] = useState("");
  const [currentModel, setCurrentModel] = useState(null); /* {orderId, modelNo, modelDesc, available} */
  const [retQty, setRetQty] = useState(1);
  const [retNote, setRetNote] = useState("");
  const [items, setItems] = useState([]); /* [{orderId, modelNo, modelDesc, qty, note}] */
  const [showScanner, setShowScanner] = useState(false);
  const [toast, setToast] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (setDirty) setDirty(items.length > 0); }, [items, setDirty]);

  const userName = user?.displayName || user?.email?.split("@")[0] || "";
  const customers = data.customers || [];
  const orders = data.orders || [];

  const flash = (msg, type = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2000);
  };

  const filteredCusts = useMemo(() => {
    const q = custSearch.trim().toLowerCase();
    if (!q) return customers.slice(0, 30);
    return customers.filter((c) => (c.name || "").toLowerCase().includes(q) || (c.phone || "").includes(q));
  }, [customers, custSearch]);

  const totalQty = useMemo(() => items.reduce((s, it) => s + (Number(it.qty) || 0), 0), [items]);

  /* Compute how many pieces this customer has net received for a model */
  const netForCustomer = (orderId, custId) => {
    const o = orders.find((x) => x.id === orderId);
    if (!o) return 0;
    const del = (o.customerDeliveries || []).filter((d) => d.custId === custId).reduce((s, d) => s + (Number(d.qty) || 0), 0);
    const ret = (o.customerReturns || []).filter((r) => r.custId === custId).reduce((s, r) => s + (Number(r.qty) || 0), 0);
    const pendingInItems = items.filter((i) => i.orderId === orderId).reduce((s, i) => s + i.qty, 0);
    return del - ret - pendingInItems;
  };

  const handleScan = (text) => {
    setShowScanner(false);
    if (isDuplicateScan(text)) { setTimeout(() => setShowScanner(true), 400); return; }
    try {
      const parts = (text || "").split(":");
      if (parts[0] !== "CLARK" || !parts[1]) {
        playBeep("error"); hapticError(); flash("⛔ QR غير صحيح", "error");
        setTimeout(() => setShowScanner(true), 800); return;
      }
      const orderId = parts[1];
      const order = orders.find((o) => o.id === orderId);
      if (!order) { playBeep("error"); hapticError(); flash("⛔ موديل غير موجود", "error"); setTimeout(() => setShowScanner(true), 800); return; }
      const available = netForCustomer(orderId, selectedCust.id);
      if (available <= 0) {
        playBeep("error"); hapticError();
        flash("⛔ العميل مسلمش الموديل ده", "error");
        setTimeout(() => setShowScanner(true), 1500);
        return;
      }
      playBeep("ok"); hapticMedium();
      setCurrentModel({ orderId, modelNo: order.modelNo, modelDesc: order.modelDesc || "", available });
      setRetQty(1);
      setRetNote("");
      setStep("entry");
    } catch (e) {
      playBeep("error"); hapticError();
      flash("⛔ خطأ في القراءة", "error");
      setTimeout(() => setShowScanner(true), 800);
    }
  };

  const confirmModel = () => {
    if (retQty <= 0) { flash("⛔ الكمية لازم تكون أكبر من صفر", "error"); return; }
    if (retQty > currentModel.available) {
      flash("⛔ الكمية أكبر من المسلم (" + currentModel.available + ")", "error");
      return;
    }
    setItems([...items, {
      orderId: currentModel.orderId,
      modelNo: currentModel.modelNo,
      modelDesc: currentModel.modelDesc,
      qty: Number(retQty),
      note: retNote.trim(),
    }]);
    setCurrentModel(null);
    setStep("scan");
    setTimeout(() => setShowScanner(true), 300);
  };

  const removeItem = (idx) => {
    const copy = [...items]; copy.splice(idx, 1); setItems(copy);
  };

  const saveReturns = async () => {
    if (!selectedCust || items.length === 0) { flash("⛔ أضف مرتجع واحد على الأقل", "error"); return; }
    setSaving(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      /* V15.61: Parallel save */
      await Promise.all(items.map((it) =>
        updOrder(it.orderId, (o) => {
          if (!o.customerReturns) o.customerReturns = [];
          o.customerReturns.push({
            custId: selectedCust.id,
            custName: selectedCust.name,
            qty: it.qty,
            note: it.note || "",
            date: today,
            sessId: "free",
            createdBy: userName,
          });
        })
      ));
      playBeep("done");
      flash("✅ تم تسجيل المرتجع: " + totalQty + " قطعة", "ok");
      if (setDirty) setDirty(false);
      setTimeout(() => onDone && onDone(), 1000);
    } catch (e) {
      playBeep("error"); hapticError();
      flash("⛔ خطأ في الحفظ", "error");
      setSaving(false);
    }
  };

  const S = {
    btn: { padding: "14px 18px", borderRadius: 12, border: "none", fontSize: 16, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, WebkitTapHighlightColor: "transparent" },
    input: { width: "100%", padding: "14px 16px", borderRadius: 12, border: "1px solid #334155", background: "#1E293B", color: "#fff", fontSize: 16, fontFamily: "inherit", boxSizing: "border-box" },
    card: { background: "#1E293B", borderRadius: 12, padding: "14px 16px", border: "1px solid #334155" },
  };

  /* ══ STEP 1: CUSTOMER ══ */
  if (step === "customer") {
    return (
      <div>
        <StepHeader title="الخطوة 1 من 3" subtitle="اختر العميل" />
        <input style={S.input} placeholder="🔍 ابحث بالاسم أو التليفون..." value={custSearch} onChange={(e) => setCustSearch(e.target.value)} />
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          {filteredCusts.length === 0 ? (
            <div style={{ textAlign: "center", padding: 30, color: "#64748B" }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🔍</div>
              لا توجد نتائج
            </div>
          ) : (
            filteredCusts.map((c) => (
              <button key={c.id} onClick={() => {
                setSelectedCust(c);
                setStep("scan");
                setTimeout(() => setShowScanner(true), 300);
              }} style={{ ...S.card, textAlign: "right", cursor: "pointer", color: "#fff", fontFamily: "inherit", width: "100%" }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: "#fff" }}>{c.name}</div>
                <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 3, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {c.phone && <span>📞 {c.phone}</span>}
                  {c.type && <span>🏷️ {c.type}</span>}
                </div>
              </button>
            ))
          )}
        </div>
        {toast && <Toast {...toast} />}
      </div>
    );
  }

  /* ══ STEP 2: SCAN ══ */
  if (step === "scan") {
    return (
      <div>
        <StepHeader title="الخطوة 2 من 3" subtitle={"مرتجع من — " + selectedCust.name} />

        {showScanner ? (
          <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", marginBottom: 14, border: "2px solid #EF4444" }}>
            <QRScanner onScan={handleScan} onClose={() => setShowScanner(false)} />
            <button onClick={() => setShowScanner(false)} style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,0.7)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              ✕ إيقاف
            </button>
          </div>
        ) : (
          <button onClick={() => setShowScanner(true)} style={{ ...S.btn, background: "#EF4444", color: "#fff", width: "100%", padding: "20px", fontSize: 18, marginBottom: 14 }}>
            📷 فتح الكاميرا
          </button>
        )}

        {items.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: "#94A3B8", fontWeight: 700, paddingInlineStart: 4 }}>
              المرتجعات ({items.length} موديل • {totalQty} قطعة)
            </div>
            {items.map((it, i) => (
              <div key={i} style={{ ...S.card, display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>{it.modelNo}</div>
                  <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{it.qty} قطعة {it.note ? " • " + it.note : ""}</div>
                </div>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#EF4444" }}>−{it.qty}</div>
                <button onClick={() => removeItem(i)} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #EF444440", background: "#EF444410", color: "#EF4444", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>✕</button>
              </div>
            ))}
          </div>
        )}

        <button onClick={() => setStep("review")} disabled={items.length === 0} style={{ ...S.btn, background: items.length > 0 ? "#EF4444" : "#1E293B", color: items.length > 0 ? "#fff" : "#64748B", width: "100%", padding: "18px", fontSize: 17, border: items.length > 0 ? "none" : "1px solid #334155" }}>
          {items.length > 0 ? `✓ مراجعة (${totalQty} قطعة)` : "لا توجد مرتجعات"}
        </button>

        {toast && <Toast {...toast} />}
      </div>
    );
  }

  /* ══ STEP 2.5: ENTRY (after scan) ══ */
  if (step === "entry" && currentModel) {
    return (
      <div>
        <StepHeader title="إدخال المرتجع" subtitle={currentModel.modelNo} />

        <div style={{ ...S.card, marginBottom: 14 }}>
          <div style={{ fontSize: 13, color: "#94A3B8" }}>{currentModel.modelDesc}</div>
          <div style={{ fontSize: 12, color: "#10B981", fontWeight: 700, marginTop: 4 }}>
            مسلم للعميل: {currentModel.available} قطعة
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: "#94A3B8", fontWeight: 700, display: "block", marginBottom: 6 }}>كمية المرتجع</label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setRetQty(Math.max(1, retQty - 1))} style={{ width: 50, height: 50, borderRadius: 12, background: "#1E293B", border: "1px solid #334155", color: "#fff", fontSize: 24, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}>−</button>
            <input type="number" min={1} max={currentModel.available} value={retQty} onChange={(e) => setRetQty(Number(e.target.value) || 0)} style={{ ...S.input, textAlign: "center", fontSize: 24, fontWeight: 900, padding: "12px 8px" }} />
            <button onClick={() => setRetQty(Math.min(currentModel.available, retQty + 1))} style={{ width: 50, height: 50, borderRadius: 12, background: "#1E293B", border: "1px solid #334155", color: "#fff", fontSize: 24, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}>+</button>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: "#94A3B8", fontWeight: 700, display: "block", marginBottom: 6 }}>السبب (اختياري)</label>
          {/* V15.61: Quick reason buttons */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {RETURN_REASONS.map((r) => (
              <button
                key={r}
                onClick={() => setRetNote(r)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid " + (retNote === r ? "#EF4444" : "#334155"),
                  background: retNote === r ? "#EF444418" : "#1E293B",
                  color: retNote === r ? "#EF4444" : "#94A3B8",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                {r}
              </button>
            ))}
          </div>
          <input style={S.input} value={retNote} onChange={(e) => setRetNote(e.target.value)} placeholder="أو اكتب سبب مخصص..." />
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => { setCurrentModel(null); setStep("scan"); setTimeout(() => setShowScanner(true), 300); }} style={{ ...S.btn, background: "#1E293B", color: "#94A3B8", border: "1px solid #334155", flex: 1 }}>← إلغاء</button>
          <button onClick={confirmModel} style={{ ...S.btn, background: "#EF4444", color: "#fff", flex: 2, padding: "16px" }}>
            ✓ إضافة للقائمة
          </button>
        </div>

        {toast && <Toast {...toast} />}
      </div>
    );
  }

  /* ══ STEP 3: REVIEW ══ */
  return (
    <div>
      <StepHeader title="الخطوة 3 من 3" subtitle="تأكيد المرتجعات" />

      <div style={{ ...S.card, marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: "#94A3B8", fontWeight: 700 }}>العميل</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginTop: 2 }}>{selectedCust.name}</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
        {items.map((it, i) => (
          <div key={i} style={{ ...S.card, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>{it.modelNo}</div>
              {it.note && <div style={{ fontSize: 11, color: "#F59E0B", marginTop: 1 }}>📝 {it.note}</div>}
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#EF4444" }}>−{it.qty}</div>
          </div>
        ))}
      </div>

      <div style={{ ...S.card, marginBottom: 14, background: "#EF444418", border: "1.5px solid #EF444440" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 15, color: "#FEE2E2", fontWeight: 700 }}>إجمالي المرتجع</span>
          <span style={{ fontSize: 24, fontWeight: 900, color: "#EF4444" }}>{totalQty} قطعة</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => setStep("scan")} style={{ ...S.btn, background: "#1E293B", color: "#94A3B8", border: "1px solid #334155", flex: 1 }}>← تعديل</button>
        <button onClick={saveReturns} disabled={saving} style={{ ...S.btn, background: saving ? "#334155" : "#EF4444", color: "#fff", flex: 2, padding: "16px" }}>
          {saving ? "⏳ جاري الحفظ..." : "✅ تأكيد المرتجع"}
        </button>
      </div>

      {toast && <Toast {...toast} />}
    </div>
  );
}

function StepHeader({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: "#64748B", fontWeight: 700, letterSpacing: 1 }}>{title}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginTop: 2 }}>{subtitle}</div>
    </div>
  );
}

function Toast({ msg, type }) {
  const bg = type === "error" ? "#EF4444" : type === "ok" ? "#10B981" : "#0EA5E9";
  return (
    <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: bg, color: "#fff", padding: "12px 20px", borderRadius: 12, fontSize: 15, fontWeight: 800, boxShadow: "0 8px 24px rgba(0,0,0,0.3)", zIndex: 9999, maxWidth: "90vw", whiteSpace: "nowrap" }}>
      {msg}
    </div>
  );
}
