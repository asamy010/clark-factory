/* ═══════════════════════════════════════════════════════════════
   CLARK — Workshop Portal Page (V17.9)
   
   Public page that workshops access via a signed URL.
   URL format: /?wsportal=1&w=<wsId>&sig=<hmac>
   
   Shows read-only workshop account:
   - Summary cards (balance, due, paid, available)
   - Deliveries (pieces sent from factory)
   - Receives (pieces returned with prices)
   - Payment history
   
   No login needed — security via HMAC signature.
   Mobile-first design.
   ═══════════════════════════════════════════════════════════════ */

import { useEffect, useState } from "react";

const fmt = (n) => (n == null ? "0" : Math.round(Number(n)).toLocaleString("en-US"));
const fmtDate = (d) => {
  if (!d) return "—";
  try {
    const date = new Date(d);
    return date.toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" });
  } catch (e) { return d; }
};

export function WorkshopPortalPage({ params }) {
  const { w: wsId, sig } = params;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("summary");

  useEffect(() => {
    const load = async () => {
      try {
        const url = "/api/workshop-portal?w=" + encodeURIComponent(wsId) +
                    "&sig=" + encodeURIComponent(sig);
        const r = await fetch(url);
        const j = await r.json();
        if (!r.ok) {
          setError(j.error || "خطأ في التحميل");
        } else {
          setData(j);
        }
      } catch (e) {
        setError("فشل الاتصال بالخادم");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [wsId, sig]);

  const wrapperStyle = {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #F8FAFC 0%, #FEF3C7 100%)",
    direction: "rtl",
    fontFamily: "'Cairo', sans-serif",
    padding: 0,
  };

  if (loading) {
    return <div style={wrapperStyle}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: 12 }}>
        <div style={{ width: 40, height: 40, border: "4px solid #E2E8F0", borderTop: "4px solid #F59E0B", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ fontSize: 16, color: "#64748B", fontWeight: 600 }}>جاري تحميل حساب الورشة...</div>
      </div>
    </div>;
  }

  if (error) {
    return <div style={wrapperStyle}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: 14, padding: 20, textAlign: "center" }}>
        <div style={{ fontSize: 56 }}>🔒</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#DC2626" }}>رابط غير صالح</div>
        <div style={{ fontSize: 15, color: "#64748B", maxWidth: 400, lineHeight: 1.6 }}>{error}</div>
        <div style={{ fontSize: 13, color: "#94A3B8", marginTop: 8 }}>تواصل مع المصنع للحصول على رابط جديد</div>
      </div>
    </div>;
  }

  if (!data) return null;

  const { factory, workshop, summary, deliveries, receives, payments } = data;
  /* Balance color — owed to workshop is positive (good for ws), zero is neutral, negative is unusual */
  const balanceColor = summary.balance > 0 ? "#F59E0B" : summary.balance < 0 ? "#059669" : "#6B7280";

  return <div style={wrapperStyle}>
    {/* Header */}
    <div style={{
      background: "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)",
      color: "#fff",
      padding: "20px 16px 24px",
      textAlign: "center",
      boxShadow: "0 4px 12px rgba(245, 158, 11, 0.25)",
    }}>
      <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 4 }}>{factory.name}</div>
      <div style={{ fontSize: 22, fontWeight: 800 }}>🏭 {workshop.name}</div>
      {workshop.owner && <div style={{ fontSize: 14, opacity: 0.95, marginTop: 4 }}>صاحب الورشة: {workshop.owner}</div>}
      {workshop.phone && <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4, direction: "ltr" }}>{workshop.phone}</div>}
      {workshop.type && <div style={{ fontSize: 11, opacity: 0.8, marginTop: 6, padding: "2px 10px", background: "rgba(255,255,255,0.2)", borderRadius: 12, display: "inline-block" }}>{workshop.type}</div>}
    </div>

    {/* Summary Cards */}
    <div style={{ padding: "16px 14px 10px", display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.04)", textAlign: "center" }}>
        <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>المستحق للورشة</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: balanceColor, direction: "ltr" }}>{fmt(summary.balance)} ج</div>
      </div>
      <div style={{ background: "#fff", borderRadius: 14, padding: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.04)", textAlign: "center" }}>
        <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>إجمالي المدفوع</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#059669", direction: "ltr" }}>{fmt(summary.paid)} ج</div>
      </div>
      <div style={{ background: "#fff", borderRadius: 14, padding: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.04)", textAlign: "center" }}>
        <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>إجمالي الأجور</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#0EA5E9", direction: "ltr" }}>{fmt(summary.due)} ج</div>
      </div>
      <div style={{ background: "#fff", borderRadius: 14, padding: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.04)", textAlign: "center" }}>
        <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>قطع تحت التشغيل</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#8B5CF6", direction: "ltr" }}>{fmt(summary.pendingPieces)}</div>
        {summary.pendingPieces > 0 && <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>لم تسلّم بعد</div>}
      </div>
    </div>

    {/* Tabs */}
    <div style={{ padding: "6px 14px", display: "flex", gap: 6, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      {[
        { id: "summary", label: "الملخص", icon: "📊" },
        { id: "deliveries", label: "تسليم للورشة (" + deliveries.length + ")", icon: "📤" },
        { id: "receives", label: "استلام من الورشة (" + receives.length + ")", icon: "📥" },
        { id: "payments", label: "المدفوعات (" + payments.length + ")", icon: "💰" },
      ].map(t =>
        <button key={t.id} onClick={() => setTab(t.id)} style={{
          padding: "8px 14px",
          borderRadius: 20,
          border: "none",
          background: tab === t.id ? "#F59E0B" : "#fff",
          color: tab === t.id ? "#fff" : "#475569",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          whiteSpace: "nowrap",
          boxShadow: tab === t.id ? "0 2px 8px rgba(245, 158, 11, 0.3)" : "0 1px 3px rgba(0,0,0,0.05)",
          fontFamily: "inherit",
        }}>
          {t.icon} {t.label}
        </button>
      )}
    </div>

    {/* Content */}
    <div style={{ padding: "14px 14px 40px" }}>
      {tab === "summary" && <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 12, color: "#1E293B" }}>📋 ملخص الحساب</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 14 }}>
            <Row label="إجمالي أجور التشطيب" value={fmt(summary.due)} unit="ج" color="#0EA5E9"/>
            {summary.purchase > 0 && <Row label="مشتريات (إكسسوار/خامات)" value={fmt(summary.purchase)} unit="ج" color="#8B5CF6"/>}
            <Row label="إجمالي المستحق" value={fmt(summary.due + summary.purchase)} unit="ج" bold/>
            <Row label="إجمالي المدفوع" value={"-" + fmt(summary.paid)} unit="ج" color="#059669"/>
            <div style={{ borderTop: "2px dashed #E2E8F0", margin: "4px 0", paddingTop: 8 }}>
              <Row label="المستحق للورشة" value={fmt(summary.balance)} unit="ج" color={balanceColor} bold large/>
            </div>
          </div>
        </div>

        <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 12, color: "#1E293B" }}>📈 إحصاءات</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
            <StatBox label="قطع مسلّمة من المصنع" value={fmt(summary.deliveredQty)} color="#0EA5E9"/>
            <StatBox label="قطع مسلّمة للمصنع" value={fmt(summary.receivedQty)} color="#059669"/>
            <StatBox label="قطع تحت التشغيل" value={fmt(summary.pendingPieces)} color="#8B5CF6"/>
            <StatBox label="نسبة الدفع المتفق عليها" value={workshop.payPercent + "%"} color="#F59E0B"/>
          </div>
        </div>

        {summary.balance > 0 && summary.available > 0 && <div style={{ background: "#FEF3C7", borderRadius: 14, padding: 14, border: "1px solid #F59E0B40" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#92400E", marginBottom: 6 }}>💡 ملاحظة</div>
          <div style={{ fontSize: 12, color: "#78350F", lineHeight: 1.6 }}>
            بحسب الاتفاق على نسبة الدفع <b>{workshop.payPercent}%</b>، الحد الأسبوعي الحالي: <b style={{ direction: "ltr", display: "inline-block" }}>{fmt(summary.available)} ج</b>
          </div>
        </div>}
      </div>}

      {tab === "deliveries" && <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {deliveries.length === 0 ? <EmptyMsg text="لا توجد تسليمات للورشة"/> :
          deliveries.map((d, i) => <div key={i} style={{ background: "#fff", borderRadius: 12, padding: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#0EA5E9", direction: "ltr" }}>{d.modelNo}</div>
              <div style={{ fontSize: 12, color: "#64748B" }}>{fmtDate(d.date)}</div>
            </div>
            {d.modelDesc && <div style={{ fontSize: 12, color: "#64748B", marginBottom: 6 }}>{d.modelDesc}</div>}
            <div style={{ display: "flex", gap: 12, fontSize: 13, flexWrap: "wrap" }}>
              <span><b style={{ color: "#0EA5E9" }}>{d.qty}</b> قطعة</span>
              {d.piece && <span style={{ padding: "2px 8px", background: "#F1F5F9", borderRadius: 6, fontSize: 11, color: "#475569", fontWeight: 600 }}>{d.piece}</span>}
            </div>
          </div>)
        }
      </div>}

      {tab === "receives" && <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {receives.length === 0 ? <EmptyMsg text="لم يتم استلام قطع من الورشة بعد"/> :
          receives.map((r, i) => <div key={i} style={{ background: "#fff", borderRadius: 12, padding: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#059669", direction: "ltr" }}>{r.modelNo}</div>
              <div style={{ fontSize: 12, color: "#64748B" }}>{fmtDate(r.date)}</div>
            </div>
            {r.modelDesc && <div style={{ fontSize: 12, color: "#64748B", marginBottom: 6 }}>{r.modelDesc}</div>}
            <div style={{ display: "flex", gap: 12, fontSize: 13, flexWrap: "wrap", alignItems: "center" }}>
              <span><b style={{ color: "#059669" }}>{r.qty}</b> قطعة</span>
              {r.piece && <span style={{ padding: "2px 8px", background: "#F1F5F9", borderRadius: 6, fontSize: 11, color: "#475569", fontWeight: 600 }}>{r.piece}</span>}
              <span style={{ direction: "ltr", color: "#64748B" }}>@ {fmt(r.price)} ج</span>
              <span style={{ marginInlineStart: "auto", fontWeight: 800, color: "#0EA5E9", direction: "ltr" }}>= {fmt(r.value)} ج</span>
            </div>
          </div>)
        }
      </div>}

      {tab === "payments" && <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {payments.length === 0 ? <EmptyMsg text="لا توجد مدفوعات بعد"/> :
          payments.map((p, i) => <div key={i} style={{ background: "#fff", borderRadius: 12, padding: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 12, color: "#64748B" }}>{fmtDate(p.date)}</div>
                <div style={{ fontSize: 11, marginTop: 4, padding: "2px 8px", background: p.type === "purchase" ? "#F3E8FF" : "#DCFCE7", color: p.type === "purchase" ? "#7C3AED" : "#059669", borderRadius: 6, fontWeight: 700, display: "inline-block" }}>
                  {p.type === "purchase" ? "📦 مشتريات" : "💰 دفعة"}
                </div>
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: p.type === "purchase" ? "#7C3AED" : "#059669", direction: "ltr" }}>{fmt(p.amount)} ج</div>
            </div>
            {p.notes && <div style={{ fontSize: 12, color: "#64748B", marginTop: 8, padding: "6px 10px", background: "#F8FAFC", borderRadius: 8 }}>{p.notes}</div>}
          </div>)
        }
      </div>}
    </div>

    {/* Footer */}
    <div style={{ padding: "20px 16px", textAlign: "center", color: "#94A3B8", fontSize: 11 }}>
      <div>هذا الرابط للعرض فقط — لا يمكن إجراء تعديلات</div>
      <div style={{ marginTop: 4 }}>للاستفسار تواصل مع {factory.name}</div>
    </div>
  </div>;
}

function Row({ label, value, unit, color, bold, large }) {
  return <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
    <span style={{ color: "#475569", fontSize: large ? 15 : 13, fontWeight: bold ? 700 : 500 }}>{label}</span>
    <span style={{ color: color || "#1E293B", fontSize: large ? 18 : 14, fontWeight: bold ? 800 : 700, direction: "ltr" }}>
      {value} {unit && <span style={{ fontSize: 11, opacity: 0.7 }}>{unit}</span>}
    </span>
  </div>;
}

function StatBox({ label, value, color }) {
  return <div style={{ background: "#F8FAFC", borderRadius: 10, padding: 10, textAlign: "center" }}>
    <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600 }}>{label}</div>
    <div style={{ fontSize: 18, fontWeight: 800, color: color || "#1E293B", marginTop: 4, direction: "ltr" }}>{value}</div>
  </div>;
}

function EmptyMsg({ text }) {
  return <div style={{ background: "#fff", borderRadius: 12, padding: 30, textAlign: "center", color: "#94A3B8", fontSize: 14 }}>{text}</div>;
}
