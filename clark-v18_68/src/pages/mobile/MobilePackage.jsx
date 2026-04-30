/* ═══════════════════════════════════════════════════════════════
   CLARK — MobilePackage.jsx
   
   V15.59: Mobile-optimized package (carton) creation.
   
   Steps:
   1. Scan models → accumulate into package
   2. Add note + confirm
   3. Package saved to config.packages with auto-numbered ID
   
   Matches desktop package structure — rendered/tracked there later.
   ═══════════════════════════════════════════════════════════════ */

import { useState, useMemo, useEffect } from "react";
import { QRScanner } from "../../components/ui.jsx";
import { playBeep } from "../../utils/audio.js";
import { gid } from "../../utils/format.js";
import { hapticMedium, hapticError, isDuplicateScan } from "./_shared.jsx";

export function MobilePackage({ data, upSales, user, onDone, setDirty }) {
  const [step, setStep] = useState("scan"); /* scan | review */
  const [items, setItems] = useState([]); /* [{orderId, modelNo, modelDesc, rackSize, count, qty}] */
  const [note, setNote] = useState("");
  const [showScanner, setShowScanner] = useState(true);
  const [toast, setToast] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (setDirty) setDirty(items.length > 0); }, [items, setDirty]);

  const userName = user?.displayName || user?.email?.split("@")[0] || "";
  const orders = data.orders || [];
  const packages = data.packages || [];

  /* Auto-number */
  const pkgNum = useMemo(() => {
    const nums = packages.map((p) => {
      const m = (p.number || "").match(/\d+/);
      return m ? Number(m[0]) : 0;
    });
    return "CTN-" + String(Math.max(0, ...nums) + 1).padStart(3, "0");
  }, [packages]);

  const flash = (msg, type = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2000);
  };

  const totalQty = useMemo(() => items.reduce((s, it) => s + (Number(it.qty) || 0), 0), [items]);
  const totalModels = items.length;

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
      const existing = items.findIndex((i) => i.orderId === orderId);
      if (existing >= 0) {
        const copy = [...items];
        copy[existing] = {
          ...copy[existing],
          count: copy[existing].count + 1,
          qty: (copy[existing].count + 1) * copy[existing].rackSize,
        };
        setItems(copy);
      } else {
        setItems([...items, {
          orderId, modelNo: order.modelNo || "", modelDesc: order.modelDesc || "",
          rackSize, count: 1, qty: rackSize,
        }]);
      }
      playBeep("ok"); hapticMedium();
      flash("✓ " + order.modelNo + " (×" + rackSize + ")", "ok");
      setTimeout(() => setShowScanner(true), 400);
    } catch (e) {
      playBeep("error"); hapticError(); flash("⛔ خطأ في القراءة", "error");
      setTimeout(() => setShowScanner(true), 800);
    }
  };

  const adjustCount = (idx, delta) => {
    const copy = [...items];
    const newCount = Math.max(0, copy[idx].count + delta);
    if (newCount === 0) copy.splice(idx, 1);
    else copy[idx] = { ...copy[idx], count: newCount, qty: newCount * copy[idx].rackSize };
    setItems(copy);
  };

  const removeItem = (idx) => {
    const copy = [...items]; copy.splice(idx, 1); setItems(copy);
  };

  const savePackage = async () => {
    if (items.length === 0) { flash("⛔ أضف موديل واحد على الأقل", "error"); return; }
    setSaving(true);
    try {
      const pkg = {
        id: gid(),
        number: pkgNum,
        date: new Date().toISOString().split("T")[0],
        note: note.trim(),
        items: items.map((it) => ({
          orderId: it.orderId,
          modelNo: it.modelNo,
          rackSize: it.rackSize,
          count: it.count,
          qty: it.qty,
        })),
        createdBy: userName,
        status: "مخزن",
        movements: [{
          date: new Date().toISOString().split("T")[0],
          type: "create",
          by: userName,
          note: "إنشاء من الموبايل",
        }],
      };
      await upSales((d) => {
        if (!d.packages) d.packages = [];
        d.packages.push(pkg);
      });
      playBeep("done");
      flash("✅ تم حفظ كرتونة " + pkgNum, "ok");
      if (setDirty) setDirty(false);
      setTimeout(() => onDone && onDone(), 1000);
    } catch (e) {
      playBeep("error"); flash("⛔ خطأ في الحفظ", "error"); setSaving(false);
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
        <StepHeader title={"كرتونة " + pkgNum} subtitle={"امسح الموديلات — " + totalModels + " موديل • " + totalQty + " قطعة"} />

        {showScanner ? (
          <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", marginBottom: 14, border: "2px solid #F59E0B" }}>
            <QRScanner onScan={handleScan} onClose={() => setShowScanner(false)} />
            <button onClick={() => setShowScanner(false)} style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,0.7)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              ✕ إيقاف
            </button>
          </div>
        ) : (
          <button onClick={() => setShowScanner(true)} style={{ ...S.btn, background: "#F59E0B", color: "#fff", width: "100%", padding: "20px", fontSize: 18, marginBottom: 14 }}>
            📷 فتح الكاميرا
          </button>
        )}

        {items.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            {items.map((it, i) => (
              <div key={i} style={{ ...S.card, display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>{it.modelNo}</div>
                  <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
                    {it.count} × {it.rackSize} = <span style={{ color: "#F59E0B", fontWeight: 700 }}>{it.qty}</span> قطعة
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <button onClick={() => adjustCount(i, -1)} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #334155", background: "#0F172A", color: "#fff", fontSize: 18, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>−</button>
                  <span style={{ fontSize: 16, fontWeight: 900, color: "#F59E0B", minWidth: 32, textAlign: "center" }}>{it.count}</span>
                  <button onClick={() => adjustCount(i, 1)} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #334155", background: "#0F172A", color: "#fff", fontSize: 18, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>+</button>
                  <button onClick={() => removeItem(i)} style={{ marginInlineStart: 4, width: 32, height: 32, borderRadius: 8, border: "1px solid #EF444440", background: "#EF444410", color: "#EF4444", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>✕</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: 30, color: "#64748B", marginBottom: 14 }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📦</div>
            <div style={{ fontSize: 14 }}>امسح QR للبدء</div>
          </div>
        )}

        <button onClick={() => setStep("review")} disabled={items.length === 0} style={{ ...S.btn, background: items.length > 0 ? "#F59E0B" : "#1E293B", color: items.length > 0 ? "#fff" : "#64748B", width: "100%", padding: "18px", fontSize: 17, border: items.length > 0 ? "none" : "1px solid #334155" }}>
          {items.length > 0 ? `✓ حفظ الكرتونة (${totalQty} قطعة)` : "لا توجد قطع"}
        </button>

        {toast && <Toast {...toast} />}
      </div>
    );
  }

  /* Review */
  return (
    <div>
      <StepHeader title="تأكيد الكرتونة" subtitle={pkgNum + " — " + totalQty + " قطعة"} />

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
        {items.map((it, i) => (
          <div key={i} style={{ ...S.card, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>{it.modelNo}</div>
              <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>{it.count} × {it.rackSize}</div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#F59E0B" }}>{it.qty}</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 12, color: "#94A3B8", fontWeight: 700, display: "block", marginBottom: 6 }}>ملاحظة (اختياري)</label>
        <input style={S.input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثال: شحنة عميل X" />
      </div>

      <div style={{ ...S.card, marginBottom: 14, background: "#F59E0B18", border: "1.5px solid #F59E0B40" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, color: "#FEF3C7", fontWeight: 700 }}>رقم الكرتونة</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#F59E0B", fontFamily: "monospace" }}>{pkgNum}</div>
          </div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 12, color: "#FEF3C7", fontWeight: 700 }}>الإجمالي</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#F59E0B" }}>{totalQty}</div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => setStep("scan")} style={{ ...S.btn, background: "#1E293B", color: "#94A3B8", border: "1px solid #334155", flex: 1 }}>← تعديل</button>
        <button onClick={savePackage} disabled={saving} style={{ ...S.btn, background: saving ? "#334155" : "#F59E0B", color: "#fff", flex: 2, padding: "16px" }}>
          {saving ? "⏳ جاري الحفظ..." : "✅ حفظ الكرتونة"}
        </button>
      </div>

      <div style={{ fontSize: 11, color: "#64748B", textAlign: "center", marginTop: 10 }}>
        💡 QR الكرتونة يُطبع من البرنامج العادي بعد الحفظ
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
