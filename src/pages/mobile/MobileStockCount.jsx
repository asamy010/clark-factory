/* ═══════════════════════════════════════════════════════════════
   CLARK — MobileStockCount.jsx
   
   V15.59: Mobile-optimized physical stock count.
   
   Flow:
   1. Scan model QR → shows system count
   2. Enter actual physical count
   3. Discrepancy calculated and logged
   4. Save → creates audit report in config.stockCounts
   
   Does NOT modify actual stock — only logs the count for review.
   Stock adjustments require desktop approval.
   ═══════════════════════════════════════════════════════════════ */

import { useState, useMemo, useEffect } from "react";
import { QRScanner } from "../../components/ui.jsx";
import { playBeep } from "../../utils/audio.js";
import { getConfirmedStock } from "../../utils/orders.js";
import { gid, fmt } from "../../utils/format.js";
import { hapticMedium, hapticError, isDuplicateScan } from "./_shared.js";

export function MobileStockCount({ data, upConfig, user, onDone, setDirty }) {
  const [step, setStep] = useState("scan"); /* scan | entry | review */
  const [currentModel, setCurrentModel] = useState(null);
  const [actualCount, setActualCount] = useState(0);
  const [counts, setCounts] = useState([]); /* [{orderId, modelNo, modelDesc, systemQty, actualQty, diff}] */
  const [showScanner, setShowScanner] = useState(true);
  const [toast, setToast] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (setDirty) setDirty(counts.length > 0); }, [counts, setDirty]);

  const userName = user?.displayName || user?.email?.split("@")[0] || "";
  const orders = data.orders || [];

  const flash = (msg, type = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2000);
  };

  const stats = useMemo(() => {
    let match = 0, over = 0, under = 0;
    counts.forEach((c) => {
      if (c.diff === 0) match++;
      else if (c.diff > 0) over++;
      else under++;
    });
    return { match, over, under };
  }, [counts]);

  /* Compute available (confirmed stock − net delivered) */
  const computeSystemQty = (order) => {
    const stock = getConfirmedStock(order);
    const del = (order.customerDeliveries || []).reduce((s, d) => s + (Number(d.qty) || 0), 0);
    const ret = (order.customerReturns || []).reduce((s, r) => s + (Number(r.qty) || 0), 0);
    return stock - (del - ret);
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
      /* Check if already counted */
      if (counts.some((c) => c.orderId === orderId)) {
        playBeep("error"); hapticError();
        flash("⚠️ الموديل ده اتعد قبل كده", "error");
        setTimeout(() => setShowScanner(true), 1500);
        return;
      }
      const systemQty = computeSystemQty(order);
      playBeep("ok"); hapticMedium();
      setCurrentModel({
        orderId,
        modelNo: order.modelNo || "",
        modelDesc: order.modelDesc || "",
        systemQty,
      });
      setActualCount(systemQty);
      setStep("entry");
    } catch (e) {
      playBeep("error"); hapticError();
      flash("⛔ خطأ في القراءة", "error");
      setTimeout(() => setShowScanner(true), 800);
    }
  };

  const confirmCount = () => {
    const actual = Math.max(0, Number(actualCount) || 0);
    const diff = actual - currentModel.systemQty;
    setCounts([...counts, {
      orderId: currentModel.orderId,
      modelNo: currentModel.modelNo,
      modelDesc: currentModel.modelDesc,
      systemQty: currentModel.systemQty,
      actualQty: actual,
      diff,
    }]);
    setCurrentModel(null);
    setActualCount(0);
    setStep("scan");
    setTimeout(() => setShowScanner(true), 300);
  };

  const removeCount = (idx) => {
    const copy = [...counts]; copy.splice(idx, 1); setCounts(copy);
  };

  const saveCountReport = async () => {
    if (counts.length === 0) { flash("⛔ أضف موديل واحد على الأقل", "error"); return; }
    setSaving(true);
    try {
      const report = {
        id: gid(),
        date: new Date().toISOString().split("T")[0],
        ts: new Date().toISOString(),
        by: userName,
        source: "mobile",
        items: counts.map((c) => ({
          orderId: c.orderId,
          modelNo: c.modelNo,
          systemQty: c.systemQty,
          actualQty: c.actualQty,
          diff: c.diff,
        })),
        totalItems: counts.length,
        totalMatch: stats.match,
        totalOver: stats.over,
        totalUnder: stats.under,
      };
      await upConfig((d) => {
        if (!d.stockCounts) d.stockCounts = [];
        d.stockCounts.unshift(report);
        /* Keep only last 50 */
        if (d.stockCounts.length > 50) d.stockCounts = d.stockCounts.slice(0, 50);
        /* Also log to audit */
        if (!d.auditLog) d.auditLog = [];
        d.auditLog.unshift({
          id: "aud_" + Date.now().toString(36),
          ts: new Date().toISOString(),
          date: new Date().toISOString().split("T")[0],
          category: "general",
          action: "stock_count_mobile",
          target: counts.length + " موديل",
          oldValue: "",
          newValue: "",
          user: userName,
          notes: "جرد من الموبايل — " + stats.match + " مطابق • " + stats.over + " زيادة • " + stats.under + " نقص",
          severity: (stats.over + stats.under) > 0 ? "warning" : "info",
        });
      });
      playBeep("done");
      flash("✅ تم حفظ الجرد", "ok");
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
        <StepHeader title="جرد المخزن" subtitle={counts.length > 0 ? counts.length + " موديل تم عده" : "امسح لبدء الجرد"} />

        {/* Stats bar */}
        {counts.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14 }}>
            <StatBox label="مطابق" value={stats.match} color="#10B981" />
            <StatBox label="زيادة" value={stats.over} color="#0EA5E9" />
            <StatBox label="نقص" value={stats.under} color="#EF4444" />
          </div>
        )}

        {showScanner ? (
          <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", marginBottom: 14, border: "2px solid #8B5CF6" }}>
            <QRScanner onScan={handleScan} onClose={() => setShowScanner(false)} />
            <button onClick={() => setShowScanner(false)} style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,0.7)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              ✕ إيقاف
            </button>
          </div>
        ) : (
          <button onClick={() => setShowScanner(true)} style={{ ...S.btn, background: "#8B5CF6", color: "#fff", width: "100%", padding: "20px", fontSize: 18, marginBottom: 14 }}>
            📷 فتح الكاميرا
          </button>
        )}

        {counts.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: "#94A3B8", fontWeight: 700, paddingInlineStart: 4 }}>الجرد الحالي</div>
            {counts.map((c, i) => {
              const diffColor = c.diff === 0 ? "#10B981" : c.diff > 0 ? "#0EA5E9" : "#EF4444";
              const diffIcon = c.diff === 0 ? "✓" : c.diff > 0 ? "↑" : "↓";
              return (
                <div key={i} style={{ ...S.card, display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>{c.modelNo}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
                      نظام: {c.systemQty} • فعلي: {c.actualQty}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ fontSize: 16, fontWeight: 900, color: diffColor, minWidth: 50, textAlign: "center" }}>
                      {diffIcon} {c.diff > 0 ? "+" : ""}{c.diff}
                    </div>
                    <button onClick={() => removeCount(i)} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #EF444440", background: "#EF444410", color: "#EF4444", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <button onClick={() => setStep("review")} disabled={counts.length === 0} style={{ ...S.btn, background: counts.length > 0 ? "#8B5CF6" : "#1E293B", color: counts.length > 0 ? "#fff" : "#64748B", width: "100%", padding: "18px", fontSize: 17, border: counts.length > 0 ? "none" : "1px solid #334155" }}>
          {counts.length > 0 ? `✓ إنهاء الجرد (${counts.length})` : "لم يبدأ الجرد"}
        </button>

        {toast && <Toast {...toast} />}
      </div>
    );
  }

  /* ══ ENTRY: Actual count ══ */
  if (step === "entry" && currentModel) {
    const diff = actualCount - currentModel.systemQty;
    const diffColor = diff === 0 ? "#10B981" : diff > 0 ? "#0EA5E9" : "#EF4444";
    return (
      <div>
        <StepHeader title="عد فعلي" subtitle={currentModel.modelNo} />

        <div style={{ ...S.card, marginBottom: 14 }}>
          <div style={{ fontSize: 13, color: "#94A3B8" }}>{currentModel.modelDesc}</div>
          <div style={{ fontSize: 12, color: "#0EA5E9", fontWeight: 700, marginTop: 6 }}>
            📊 حسب النظام: <span style={{ fontSize: 18, fontWeight: 900 }}>{currentModel.systemQty}</span> قطعة
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: "#94A3B8", fontWeight: 700, display: "block", marginBottom: 6 }}>العد الفعلي</label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setActualCount(Math.max(0, Number(actualCount) - 1))} style={{ width: 50, height: 50, borderRadius: 12, background: "#1E293B", border: "1px solid #334155", color: "#fff", fontSize: 24, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}>−</button>
            <input type="number" min={0} value={actualCount} onChange={(e) => setActualCount(e.target.value)} style={{ ...S.input, textAlign: "center", fontSize: 28, fontWeight: 900, padding: "12px 8px" }} />
            <button onClick={() => setActualCount(Number(actualCount) + 1)} style={{ width: 50, height: 50, borderRadius: 12, background: "#1E293B", border: "1px solid #334155", color: "#fff", fontSize: 24, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}>+</button>
          </div>
        </div>

        {/* Live diff display */}
        <div style={{ ...S.card, marginBottom: 14, background: diffColor + "18", border: "1.5px solid " + diffColor + "50" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 14, color: "#fff", fontWeight: 700 }}>الفرق</span>
            <span style={{ fontSize: 22, fontWeight: 900, color: diffColor }}>
              {diff === 0 ? "✓ مطابق" : (diff > 0 ? "+" : "") + diff + " قطعة"}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => { setCurrentModel(null); setStep("scan"); setTimeout(() => setShowScanner(true), 300); }} style={{ ...S.btn, background: "#1E293B", color: "#94A3B8", border: "1px solid #334155", flex: 1 }}>← إلغاء</button>
          <button onClick={confirmCount} style={{ ...S.btn, background: "#8B5CF6", color: "#fff", flex: 2, padding: "16px" }}>✓ تسجيل</button>
        </div>

        {toast && <Toast {...toast} />}
      </div>
    );
  }

  /* ══ REVIEW ══ */
  return (
    <div>
      <StepHeader title="تقرير الجرد" subtitle={counts.length + " موديل"} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14 }}>
        <StatBox label="مطابق" value={stats.match} color="#10B981" big />
        <StatBox label="زيادة" value={stats.over} color="#0EA5E9" big />
        <StatBox label="نقص" value={stats.under} color="#EF4444" big />
      </div>

      {(stats.over > 0 || stats.under > 0) && (
        <div style={{ ...S.card, marginBottom: 14, background: "#F59E0B18", border: "1.5px solid #F59E0B40" }}>
          <div style={{ fontSize: 13, color: "#FEF3C7", fontWeight: 700 }}>⚠️ يوجد اختلافات</div>
          <div style={{ fontSize: 12, color: "#FEF3C7", marginTop: 4, lineHeight: 1.5 }}>
            الجرد هيتحفظ كتقرير. تعديل المخزن الفعلي محتاج موافقة من البرنامج العادي.
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => setStep("scan")} style={{ ...S.btn, background: "#1E293B", color: "#94A3B8", border: "1px solid #334155", flex: 1 }}>← تعديل</button>
        <button onClick={saveCountReport} disabled={saving} style={{ ...S.btn, background: saving ? "#334155" : "#8B5CF6", color: "#fff", flex: 2, padding: "16px" }}>
          {saving ? "⏳ جاري الحفظ..." : "✅ حفظ التقرير"}
        </button>
      </div>

      {toast && <Toast {...toast} />}
    </div>
  );
}

function StatBox({ label, value, color, big }) {
  return (
    <div style={{ padding: big ? "14px 10px" : "10px 8px", borderRadius: 10, background: color + "15", border: "1px solid " + color + "30", textAlign: "center" }}>
      <div style={{ fontSize: big ? 26 : 20, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: big ? 12 : 11, color: "#94A3B8", fontWeight: 700, marginTop: 4 }}>{label}</div>
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
