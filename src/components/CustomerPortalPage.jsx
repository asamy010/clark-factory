/* ═══════════════════════════════════════════════════════════════
   CLARK — Customer Portal Page (V16.3)
   
   Public page that customers access via a signed URL.
   URL format: /?portal=1&c=<custId>&sig=<hmac>
   
   Shows read-only customer account:
   - Summary cards (balance, total sales, pieces)
   - Active orders/models
   - Delivery history
   - Returns
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

export function CustomerPortalPage({ params }) {
  const { c: custId, sig } = params;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("summary");

  useEffect(() => {
    const load = async () => {
      try {
        const url = "/api/customer-portal?c=" + encodeURIComponent(custId) +
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
  }, [custId, sig]);

  const wrapperStyle = {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #F8FAFC 0%, #E0E7FF 100%)",
    direction: "rtl",
    fontFamily: "'Cairo', sans-serif",
    padding: 0,
  };

  if (loading) {
    return <div style={wrapperStyle}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: 12 }}>
        <div style={{ width: 40, height: 40, border: "4px solid #E2E8F0", borderTop: "4px solid #6366F1", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ fontSize: 16, color: "#64748B", fontWeight: 600 }}>جاري تحميل حسابك...</div>
      </div>
    </div>;
  }

  if (error) {
    return <div style={wrapperStyle}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: 14, padding: 20, textAlign: "center" }}>
        <div style={{ fontSize: 56 }}>🔒</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#DC2626" }}>رابط غير صالح</div>
        <div style={{ fontSize: 15, color: "#64748B", maxWidth: 400, lineHeight: 1.6 }}>{error}</div>
        <div style={{ fontSize: 13, color: "#94A3B8", marginTop: 8 }}>اطلب من المصنع رابطاً جديداً</div>
      </div>
    </div>;
  }

  if (!data) return null;

  const { customer, summary, activeModels, deliveries, returns: rets, payments, factory } = data;
  const balanceColor = summary.balance > 0 ? "#DC2626" : summary.balance < 0 ? "#059669" : "#64748B";

  return <div style={wrapperStyle}>
    {/* Header */}
    <div style={{
      background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
      padding: "24px 20px",
      color: "#fff",
      textAlign: "center",
    }}>
      <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 4 }}>{factory.name}</div>
      <div style={{ fontSize: 22, fontWeight: 800 }}>{customer.name}</div>
      {customer.phone && <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4, direction: "ltr" }}>{customer.phone}</div>}
    </div>

    {/* Summary Cards */}
    <div style={{ padding: "16px 14px 10px", display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.04)", textAlign: "center" }}>
        <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>الرصيد المتبقي</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: balanceColor, direction: "ltr" }}>{fmt(summary.balance)} ج</div>
      </div>
      <div style={{ background: "#fff", borderRadius: 14, padding: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.04)", textAlign: "center" }}>
        <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>إجمالي المدفوع</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#059669", direction: "ltr" }}>{fmt(summary.totalPaid)} ج</div>
      </div>
      <div style={{ background: "#fff", borderRadius: 14, padding: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.04)", textAlign: "center" }}>
        <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>
          {customer.discount > 0 ? "المبيعات (بعد الخصم)" : "إجمالي المبيعات"}
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#6366F1", direction: "ltr" }}>{fmt(summary.salesAfterDiscount)} ج</div>
        {customer.discount > 0 && <div style={{ fontSize: 10, color: "#F59E0B", marginTop: 2, fontWeight: 700 }}>خصم {customer.discount}%</div>}
      </div>
      <div style={{ background: "#fff", borderRadius: 14, padding: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.04)", textAlign: "center" }}>
        <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>القطع المسلمة</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#0EA5E9", direction: "ltr" }}>{fmt(summary.piecesDelivered - summary.piecesReturned)}</div>
        {summary.piecesReturned > 0 && <div style={{ fontSize: 10, color: "#EF4444", marginTop: 2 }}>مرتجع: {summary.piecesReturned}</div>}
      </div>
    </div>

    {/* Tabs */}
    <div style={{ padding: "6px 14px", display: "flex", gap: 6, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      {[
        { id: "summary", label: "الملخص", icon: "📊" },
        { id: "models", label: "الموديلات (" + activeModels.length + ")", icon: "📦" },
        { id: "deliveries", label: "التسليمات (" + deliveries.length + ")", icon: "🚚" },
        { id: "returns", label: "المرتجعات (" + rets.length + ")", icon: "↩️" },
        { id: "payments", label: "المدفوعات (" + payments.length + ")", icon: "💰" },
      ].map(t =>
        <button key={t.id} onClick={() => setTab(t.id)} style={{
          padding: "8px 14px",
          borderRadius: 20,
          border: "none",
          background: tab === t.id ? "#6366F1" : "#fff",
          color: tab === t.id ? "#fff" : "#475569",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          whiteSpace: "nowrap",
          boxShadow: tab === t.id ? "0 2px 8px rgba(99, 102, 241, 0.3)" : "0 1px 3px rgba(0,0,0,0.05)",
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
            <Row label="إجمالي المبيعات الخام" value={fmt(summary.netSales + summary.returnsValue)} unit="ج"/>
            {summary.returnsValue > 0 && <Row label="قيمة المرتجعات" value={"-" + fmt(summary.returnsValue)} unit="ج" color="#EF4444"/>}
            <Row label="صافي المبيعات" value={fmt(summary.netSales)} unit="ج"/>
            {customer.discount > 0 && <>
              <Row label={"قيمة الخصم (" + customer.discount + "%)"} value={"-" + fmt(summary.discountAmount)} unit="ج" color="#F59E0B"/>
              <Row label="المبيعات بعد الخصم" value={fmt(summary.salesAfterDiscount)} unit="ج" color="#0EA5E9" bold/>
            </>}
            <Row label="إجمالي المدفوع" value={"-" + fmt(summary.totalPaid)} unit="ج" color="#059669"/>
            <div style={{ borderTop: "2px dashed #E2E8F0", margin: "4px 0", paddingTop: 8 }}>
              <Row label="الرصيد المتبقي" value={fmt(summary.balance)} unit="ج" color={balanceColor} bold large/>
            </div>
          </div>
        </div>

        <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 12, color: "#1E293B" }}>📈 إحصاءات</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
            <StatBox label="عدد الموديلات" value={summary.orderCount} color="#6366F1"/>
            <StatBox label="عدد التسليمات" value={summary.deliveryCount} color="#0EA5E9"/>
            <StatBox label="قطع مسلّمة" value={summary.piecesDelivered} color="#059669"/>
            <StatBox label="قطع مرتجعة" value={summary.piecesReturned} color="#EF4444"/>
          </div>
        </div>
      </div>}

      {tab === "models" && <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {activeModels.length === 0 ? <EmptyMsg text="لا توجد موديلات"/> :
          activeModels.map((m, i) => <div key={i} style={{ background: "#fff", borderRadius: 12, padding: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#6366F1", direction: "ltr" }}>{m.modelNo}</div>
              <div style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: m.status === "closed" ? "#DCFCE7" : "#DBEAFE", color: m.status === "closed" ? "#059669" : "#0EA5E9", fontWeight: 700 }}>
                {m.status === "closed" ? "✓ مكتمل" : "قيد التنفيذ"}
              </div>
            </div>
            {m.modelDesc && <div style={{ fontSize: 12, color: "#64748B", marginBottom: 8 }}>{m.modelDesc}</div>}
            <div style={{ display: "flex", gap: 12, fontSize: 13, flexWrap: "wrap" }}>
              <span><b style={{ color: "#059669" }}>{m.delivered}</b> مسلّم</span>
              {m.returned > 0 && <span><b style={{ color: "#EF4444" }}>{m.returned}</b> مرتجع</span>}
              <span><b>{m.net}</b> قطعة صافي</span>
              <span style={{ direction: "ltr" }}>@ {fmt(m.sellPrice)} ج</span>
            </div>
          </div>)
        }
      </div>}

      {tab === "deliveries" && <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {deliveries.length === 0 ? <EmptyMsg text="لا توجد تسليمات"/> :
          deliveries.map((d, i) => <div key={i} style={{ background: "#fff", borderRadius: 10, padding: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 800, color: "#6366F1", direction: "ltr", fontSize: 14 }}>{d.modelNo}</div>
                <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{fmtDate(d.date)}</div>
              </div>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#059669" }}>{d.qty} قطعة</div>
                <div style={{ fontSize: 11, color: "#64748B", direction: "ltr" }}>{fmt(d.value)} ج</div>
              </div>
            </div>
          </div>)
        }
      </div>}

      {tab === "returns" && <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rets.length === 0 ? <EmptyMsg text="لا توجد مرتجعات"/> :
          rets.map((r, i) => <div key={i} style={{ background: "#fff", borderRadius: 10, padding: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 800, color: "#6366F1", direction: "ltr", fontSize: 14 }}>{r.modelNo}</div>
                <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{fmtDate(r.date)}</div>
              </div>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#EF4444" }}>{r.qty} قطعة</div>
                <div style={{ fontSize: 11, color: "#64748B", direction: "ltr" }}>{fmt(r.value)} ج</div>
              </div>
            </div>
          </div>)
        }
      </div>}

      {tab === "payments" && <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {payments.length === 0 ? <EmptyMsg text="لا توجد مدفوعات"/> :
          payments.map((p, i) => <div key={i} style={{ background: "#fff", borderRadius: 10, padding: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#059669" }}>💰 {p.method || "كاش"}</div>
                <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{fmtDate(p.date)}</div>
                {p.notes && <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{p.notes}</div>}
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#059669", direction: "ltr" }}>{fmt(p.amount)} ج</div>
            </div>
          </div>)
        }
      </div>}
    </div>

    {/* Footer */}
    <div style={{ padding: "16px 14px", textAlign: "center", color: "#94A3B8", fontSize: 11 }}>
      آخر تحديث: {new Date(data.generatedAt).toLocaleString("ar-EG")}
      <div style={{ marginTop: 4 }}>{factory.name} • رابطك الخاص — لا تشاركه</div>
    </div>
  </div>;
}

function Row({ label, value, unit, color, bold, large }) {
  return <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "2px 0" }}>
    <span style={{ color: "#64748B", fontWeight: bold ? 700 : 500 }}>{label}</span>
    <span style={{ color: color || "#1E293B", fontWeight: bold ? 800 : 600, fontSize: large ? 18 : 14, direction: "ltr" }}>{value} {unit}</span>
  </div>;
}

function StatBox({ label, value, color }) {
  return <div style={{ background: (color || "#6366F1") + "10", borderRadius: 10, padding: 10, textAlign: "center" }}>
    <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600, marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: 18, fontWeight: 800, color: color || "#6366F1", direction: "ltr" }}>{Math.round(value).toLocaleString("en-US")}</div>
  </div>;
}

function EmptyMsg({ text }) {
  return <div style={{ textAlign: "center", padding: 40, color: "#94A3B8", fontSize: 14 }}>
    <div style={{ fontSize: 40, marginBottom: 8 }}>📭</div>
    {text}
  </div>;
}
