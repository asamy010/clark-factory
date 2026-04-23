/* ═══════════════════════════════════════════════════════════════
   CLARK — MobileStockReceive.jsx
   
   V15.59: Mobile-optimized stock receive flow.
   Scan finished-garment QRs → accumulate counts → save as deliveries.
   Each delivery is marked "pending" (awaits stock-keeper confirmation
   in the desktop app), matching existing stock flow.
   ═══════════════════════════════════════════════════════════════ */

import { useState, useMemo, useEffect } from "react";
import { QRScanner } from "../../components/ui.jsx";
import { playBeep } from "../../utils/audio.js";
import { fmt } from "../../utils/format.js";
import { hapticMedium, hapticError, isDuplicateScan } from "./_shared.js";

export function MobileStockReceive({ data, updOrder, user, onDone, setDirty }) {
  const [step, setStep] = useState("scan"); /* scan | review */
  const [items, setItems] = useState([]); /* [{orderId, modelNo, modelDesc, qty, rackSize}] */
  const [showScanner, setShowScanner] = useState(true);
  const [notes, setNotes] = useState("");
  const [toast, setToast] = useState(null);
  const [saving, setSaving] = useState(false);

  /* Track dirty state */
  useEffect(() => { if (setDirty) setDirty(items.length > 0); }, [items, setDirty]);

  const userName = user?.displayName || user?.email?.split("@")[0] || "";
  const orders = data.orders || [];

  const flash = (msg, type = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2000);
  };

  const totalQty = useMemo(() => items.reduce((s, it) => s + (Number(it.qty) || 0), 0), [items]);

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
      const rackSize = parts[2] ? Number(parts[2]) : 1;
      const addQty = rackSize > 0 ? rackSize : 1;
      const existing = items.findIndex((i) => i.orderId === orderId);
      if (existing >= 0) {
        const copy = [...items];
        copy[existing] = { ...copy[existing], qty: copy[existing].qty + addQty };
        setItems(copy);
      } else {
        setItems([...items, { orderId, modelNo: order.modelNo || "", modelDesc: order.modelDesc || "", qty: addQty, rackSize }]);
      }
      playBeep("ok"); hapticMedium();
      flash("✓ " + order.modelNo + " +" + addQty, "ok");
      setTimeout(() => setShowScanner(true), 400);
    } catch (e) {
      playBeep("error"); hapticError(); flash("⛔ خطأ في القراءة", "error");
      setTimeout(() => setShowScanner(true), 800);
    }
  };

  const adjustQty = (idx, delta) => {
    const copy = [...items];
    const newQty = Math.max(0, copy[idx].qty + delta);
    if (newQty === 0) copy.splice(idx, 1);
    else copy[idx] = { ...copy[idx], qty: newQty };
    setItems(copy);
  };

  const removeItem = (idx) => {
    const copy = [...items]; copy.splice(idx, 1); setItems(copy);
  };

  const saveReceive = async () => {
    if (items.length === 0) { flash("⛔ أضف موديل واحد على الأقل", "error"); return; }
    setSaving(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      /* V15.61: Parallel save */
      await Promise.all(items.map((it) =>
        updOrder(it.orderId, (o) => {
          if (!o.deliveries) o.deliveries = [];
          o.deliveries.push({
            date: today,
            qty: it.qty,
            notes: notes || "سكان موبايل",
            createdBy: userName,
            status: "pending",
          });
        })
      ));
      playBeep("done");
      flash("✅ تم التسليم: " + totalQty + " قطعة", "ok");
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

  if (step === "scan") {
    return (
      <div>
        <StepHeader title="استلام مخزن جاهز" subtitle="امسح الموديلات الواردة" />

        {showScanner ? (
          <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", marginBottom: 14, border: "2px solid #0EA5E9" }}>
            <QRScanner onScan={handleScan} onClose={() => setShowScanner(false)} />
            <button onClick={() => setShowScanner(false)} style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,0.7)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              ✕ إيقاف
            </button>
          </div>
        ) : (
          <button onClick={() => setShowScanner(true)} style={{ ...S.btn, background: "#0EA5E9", color: "#fff", width: "100%", padding: "20px", fontSize: 18, marginBottom: 14 }}>
            📷 فتح الكاميرا
          </button>
        )}

        {items.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: "#94A3B8", fontWeight: 700, paddingInlineStart: 4 }}>
              المستلم ({items.length} موديل • {totalQty} قطعة)
            </div>
            {items.map((it, i) => (
              <div key={i} style={{ ...S.card, display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>{it.modelNo}</div>
                  <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.modelDesc}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <button onClick={() => adjustQty(i, -1)} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #334155", background: "#0F172A", color: "#fff", fontSize: 18, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>−</button>
                  <span style={{ fontSize: 16, fontWeight: 900, color: "#0EA5E9", minWidth: 32, textAlign: "center" }}>{it.qty}</span>
                  <button onClick={() => adjustQty(i, 1)} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #334155", background: "#0F172A", color: "#fff", fontSize: 18, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>+</button>
                  <button onClick={() => removeItem(i)} style={{ marginInlineStart: 4, width: 32, height: 32, borderRadius: 8, border: "1px solid #EF444440", background: "#EF444410", color: "#EF4444", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>✕</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: 30, color: "#64748B", marginBottom: 14 }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📥</div>
            <div style={{ fontSize: 14 }}>امسح QR للموديلات الواردة</div>
          </div>
        )}

        <button onClick={() => setStep("review")} disabled={items.length === 0} style={{ ...S.btn, background: items.length > 0 ? "#0EA5E9" : "#1E293B", color: items.length > 0 ? "#fff" : "#64748B", width: "100%", padding: "18px", fontSize: 17, border: items.length > 0 ? "none" : "1px solid #334155" }}>
          {items.length > 0 ? `✓ تأكيد (${totalQty} قطعة)` : "لا توجد قطع"}
        </button>

        {toast && <Toast {...toast} />}
      </div>
    );
  }

  /* Review step */
  return (
    <div>
      <StepHeader title="تأكيد الاستلام" subtitle={totalQty + " قطعة من " + items.length + " موديل"} />

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
        {items.map((it, i) => (
          <div key={i} style={{ ...S.card, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>{it.modelNo}</div>
              <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>{it.modelDesc}</div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#0EA5E9" }}>{it.qty}</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 12, color: "#94A3B8", fontWeight: 700, display: "block", marginBottom: 6 }}>ملاحظات (اختياري)</label>
        <input style={S.input} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="مثال: من ورشة الخياطة" />
      </div>

      <div style={{ ...S.card, marginBottom: 14, background: "#F59E0B15", border: "1px solid #F59E0B40" }}>
        <div style={{ fontSize: 12, color: "#FBBF24", fontWeight: 700 }}>⚠️ ملاحظة</div>
        <div style={{ fontSize: 13, color: "#FEF3C7", marginTop: 4, lineHeight: 1.5 }}>
          التسليم يبقى "معلق" لحد ما أمين المخزن يأكده من البرنامج العادي.
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => setStep("scan")} style={{ ...S.btn, background: "#1E293B", color: "#94A3B8", border: "1px solid #334155", flex: 1 }}>← تعديل</button>
        <button onClick={saveReceive} disabled={saving} style={{ ...S.btn, background: saving ? "#334155" : "#0EA5E9", color: "#fff", flex: 2, padding: "16px" }}>
          {saving ? "⏳ جاري الحفظ..." : "✅ تأكيد التسليم"}
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
