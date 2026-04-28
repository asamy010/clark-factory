/* ═══════════════════════════════════════════════════════════════
   CLARK — Workshop Portal Page (V18.1)
   
   Public page that workshops access via a signed URL.
   URL format: /?wsportal=1&w=<wsId>&sig=<hmac>
   
   V18.1: Redesigned cards/summary/tabs per user spec:
   - 4 cards: حساب التشغيل / دفعات / رصيد / قطع تحت التشغيل
   - Summary mirrors cards exactly (same names/order/values)
   - Deliveries tab: model no / name / piece type / qty (date small in corner)
   - Receives tab: same + math equation row "price × qty = total ج.م"
   - Payments tab: + notes if any + total at bottom

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

/* V18.3: PDF via browser print */
const exportPdf = (tabLabel) => {
  document.title = "حساب الورشة — " + tabLabel;
  setTimeout(() => window.print(), 100);
};

export function WorkshopPortalPage({ params }) {
  const { w: wsId, sig } = params;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("summary");
  /* V18.4: Model number filter (applies to transactions tab) */
  const [modelFilter, setModelFilter] = useState("");

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
  /* Balance: positive = factory owes workshop (good for ws → orange/warm),
     negative = workshop owes factory (rare → red), zero = neutral */
  const balanceColor = summary.balance > 0 ? "#F59E0B" : summary.balance < 0 ? "#DC2626" : "#6B7280";
  const totalPayments = payments.filter(p => p.type === "payment").reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const totalPurchases = payments.filter(p => p.type === "purchase").reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const tabLabels = { summary: "الملخص", transactions: "سجل التسليم والاستلام", payments: "المدفوعات" };

  /* V18.4: Merge deliveries + receives by modelNo into one card per model */
  const matchesModel = (modelNo) => !modelFilter.trim() || (modelNo || "").toLowerCase().includes(modelFilter.trim().toLowerCase());
  const modelMap = new Map();
  deliveries.forEach(d => {
    if (!modelMap.has(d.modelNo)) modelMap.set(d.modelNo, { modelNo: d.modelNo, modelDesc: d.modelDesc, image: d.image, pieces: new Set(), deliveries: [], receives: [], delQty: 0, recQty: 0, totalValue: 0 });
    const m = modelMap.get(d.modelNo);
    m.deliveries.push({ date: d.date, qty: d.qty, piece: d.piece });
    if (d.piece) m.pieces.add(d.piece);
    m.delQty += d.qty;
    if (!m.image && d.image) m.image = d.image;
  });
  receives.forEach(r => {
    if (!modelMap.has(r.modelNo)) modelMap.set(r.modelNo, { modelNo: r.modelNo, modelDesc: r.modelDesc, image: r.image, pieces: new Set(), deliveries: [], receives: [], delQty: 0, recQty: 0, totalValue: 0 });
    const m = modelMap.get(r.modelNo);
    m.receives.push({ date: r.date, qty: r.qty, price: r.price, value: r.value, piece: r.piece });
    if (r.piece) m.pieces.add(r.piece);
    m.recQty += r.qty;
    m.totalValue += r.value;
    if (!m.image && r.image) m.image = r.image;
  });
  const transactions = Array.from(modelMap.values())
    .map(m => ({ ...m, pieces: Array.from(m.pieces), latestDate: [...m.deliveries.map(x => x.date), ...m.receives.map(x => x.date)].sort().reverse()[0] || "" }))
    .sort((a, b) => (b.latestDate || "").localeCompare(a.latestDate || ""));
  const filteredTransactions = transactions.filter(m => matchesModel(m.modelNo));

  return <div style={wrapperStyle}>
    {/* V18.3: Print-only CSS */}
    <style>{`
      @media print {
        body * { visibility: hidden; }
        .printable, .printable * { visibility: visible; }
        .printable { position: absolute; inset: 0; padding: 20px; background: #fff !important; }
        .no-print { display: none !important; }
        @page { size: A4; margin: 12mm; }
      }
    `}</style>

    {/* V18.6: Even more compact header + season badge */}
    <div className="no-print" style={{
      background: "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)",
      color: "#fff",
      padding: "10px 14px 11px",
      textAlign: "center",
      position: "relative",
      boxShadow: "0 4px 12px rgba(245, 158, 11, 0.25)",
    }}>
      {data.activeSeason && <div style={{ position: "absolute", top: 8, insetInlineStart: 12, padding: "3px 9px", background: "rgba(255,255,255,0.2)", borderRadius: 8, fontSize: 11, fontWeight: 700, border: "1px solid rgba(255,255,255,0.25)" }}>📅 موسم {data.activeSeason}</div>}
      <div style={{ fontSize: 10, opacity: 0.9 }}>{factory.name}</div>
      <div style={{ fontSize: 16, fontWeight: 800, marginTop: 1 }}>🏭 {workshop.name}</div>
      {workshop.owner && <div style={{ fontSize: 11, opacity: 0.95, marginTop: 1 }}>صاحب الورشة: {workshop.owner}</div>}
      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 2, flexWrap: "wrap", alignItems: "center" }}>
        {workshop.phone && <div style={{ fontSize: 10, opacity: 0.85, direction: "ltr" }}>{workshop.phone}</div>}
        {workshop.type && <div style={{ fontSize: 9, opacity: 0.9, padding: "1px 8px", background: "rgba(255,255,255,0.2)", borderRadius: 10 }}>{workshop.type}</div>}
      </div>
    </div>

    {/* V18.1: New 4-card layout — same names/order as summary section */}
    <div className="no-print" style={{ padding: "12px 12px 6px", display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
      <Card icon="🧵" label="إجمالي حساب التشغيل" value={fmt(summary.due)} unit="ج.م" color="#0EA5E9"/>
      <Card icon="💰" label="إجمالي دفعات" value={fmt(summary.paid)} unit="ج.م" color="#059669"/>
      <Card icon="⚖️" label="رصيد للورشة" value={fmt(summary.balance)} unit="ج.م" color={balanceColor} bold/>
      <Card icon="📦" label="كمية تحت التشغيل" value={fmt(summary.pendingPieces)} unit="قطعة" color="#8B5CF6" hint={summary.pendingPieces > 0 ? "لم تسلّم بعد" : null}/>
    </div>

    {/* V18.4: Tabs — deliveries + receives merged */}
    <div className="no-print" style={{ padding: "4px 12px", display: "flex", gap: 6, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      {[
        { id: "summary", label: "الملخص", icon: "📋" },
        { id: "transactions", label: "سجل التسليم والاستلام (" + transactions.length + ")", icon: "🔄" },
        { id: "payments", label: "المدفوعات (" + payments.length + ")", icon: "💰" },
      ].map(t =>
        <button key={t.id} onClick={() => setTab(t.id)} style={{
          padding: "7px 12px",
          borderRadius: 18,
          border: "none",
          background: tab === t.id ? "#F59E0B" : "#fff",
          color: tab === t.id ? "#fff" : "#475569",
          fontSize: 12,
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

    {/* V18.5: Export buttons — PDF only */}
    <div className="no-print" style={{ padding: "4px 12px 6px", display: "flex", gap: 6, justifyContent: "flex-end" }}>
      <button onClick={() => exportPdf(tabLabels[tab])} style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #EF444430", background: "#EF444412", color: "#EF4444", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>📄 PDF</button>
    </div>

    {/* Content */}
    <div className="printable" style={{ padding: "8px 12px 40px" }}>
      {/* SUMMARY — V18.1: mirrors the cards exactly */}
      {tab === "summary" && <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 12, color: "#1E293B" }}>📋 ملخص الحساب</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 14 }}>
            <Row icon="🧵" label="إجمالي حساب التشغيل" value={fmt(summary.due)} unit="ج.م" color="#0EA5E9"/>
            <Row icon="💰" label="إجمالي دفعات" value={fmt(summary.paid)} unit="ج.م" color="#059669"/>
            <div style={{ borderTop: "2px dashed #E2E8F0", margin: "2px 0", paddingTop: 10 }}>
              <Row icon="⚖️" label="رصيد للورشة" value={fmt(summary.balance)} unit="ج.م" color={balanceColor} bold large/>
            </div>
            <Row icon="📦" label="كمية تحت التشغيل" value={fmt(summary.pendingPieces)} unit="قطعة" color="#8B5CF6"/>
          </div>
          {summary.purchase > 0 && <div style={{ marginTop: 10, padding: "8px 10px", background: "#F3E8FF", borderRadius: 8, fontSize: 12, color: "#6B21A8" }}>
            ℹ️ يشمل الرصيد مشتريات (إكسسوار/خامات): <b style={{ direction: "ltr", display: "inline-block" }}>{fmt(summary.purchase)} ج.م</b>
          </div>}
        </div>

        {summary.balance > 0 && summary.available > 0 && <div style={{ background: "#FEF3C7", borderRadius: 14, padding: 14, border: "1px solid #F59E0B40" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#92400E", marginBottom: 6 }}>💡 ملاحظة</div>
          <div style={{ fontSize: 12, color: "#78350F", lineHeight: 1.6 }}>
            بحسب الاتفاق على نسبة الدفع <b>{workshop.payPercent}%</b>، الحد الأسبوعي الحالي: <b style={{ direction: "ltr", display: "inline-block" }}>{fmt(summary.available)} ج.م</b>
          </div>
        </div>}
      </div>}

      {/* V18.4: TRANSACTIONS — merged deliveries + receives, grouped by model */}
      {tab === "transactions" && <>
        {/* Filter input */}
        <div className="no-print" style={{ marginBottom: 8, display: "flex", gap: 6, alignItems: "center" }}>
          <input type="text" value={modelFilter} onChange={e => setModelFilter(e.target.value)} placeholder="🔍 فلتر برقم الموديل..." style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 13, fontFamily: "inherit", direction: "ltr", textAlign: "right", background: "#fff" }}/>
          {modelFilter && <button onClick={() => setModelFilter("")} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #CBD5E1", background: "#F1F5F9", color: "#475569", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>✕ مسح</button>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filteredTransactions.length === 0 ? <EmptyMsg text={modelFilter ? "لا يوجد موديل بهذا الرقم" : "لا توجد حركات"}/> :
            filteredTransactions.map((m, i) => {
              const wsBalance = m.delQty - m.recQty;
              /* V18.6: Last delivery / receive dates for inline display */
              const lastDelDate = m.deliveries.length ? [...m.deliveries].sort((a,b)=>(b.date||"").localeCompare(a.date||""))[0].date : "";
              const lastRecDate = m.receives.length ? [...m.receives].sort((a,b)=>(b.date||"").localeCompare(a.date||""))[0].date : "";
              return <div key={i} style={{ background: "#fff", borderRadius: 12, padding: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.04)", display: "flex", gap: 14, alignItems: "stretch", minHeight: 130 }}>
                {/* Thumbnail — bigger to match taller card */}
                <div style={{ width: 100, minWidth: 100, borderRadius: 10, overflow: "hidden", background: "#F1F5F9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {m.image ? <img src={m.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}/> : <span style={{ fontSize: 28, opacity: 0.3 }}>📦</span>}
                </div>
                {/* Data */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                  {/* Model number ABOVE description (V18.6: explicit text-align right) */}
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#0EA5E9", direction: "ltr", textAlign: "right" }}>{m.modelNo}</div>
                  {m.modelDesc && <div style={{ fontSize: 13, color: "#1E293B", fontWeight: 600 }}>{m.modelDesc}</div>}
                  {/* Piece type as text */}
                  {m.pieces.length > 0 && <div style={{ fontSize: 11, color: "#475569", display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ color: "#64748B", fontWeight: 600 }}>نوع القطعة:</span>
                    {m.pieces.map((p, j) => <span key={j} style={{ padding: "1px 8px", background: "#F1F5F9", borderRadius: 4, fontWeight: 700, color: "#475569" }}>{p}</span>)}
                  </div>}
                  {/* V18.6: Summary line with inline dates */}
                  <div style={{ display: "flex", gap: 10, fontSize: 11, marginTop: 2, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ color: "#0EA5E9", display: "inline-flex", alignItems: "center", gap: 3 }}>
                      <b>📥 تسليم {m.delQty}</b>
                      {lastDelDate && <span style={{ fontSize: 10, color: "#94A3B8", fontWeight: 600 }}>({fmtDate(lastDelDate)})</span>}
                    </span>
                    <span style={{ color: "#059669", display: "inline-flex", alignItems: "center", gap: 3 }}>
                      <b>📤 استلام {m.recQty}</b>
                      {lastRecDate && <span style={{ fontSize: 10, color: "#94A3B8", fontWeight: 600 }}>({fmtDate(lastRecDate)})</span>}
                    </span>
                    <span style={{ color: wsBalance > 0 ? "#8B5CF6" : "#64748B" }}><b>📦 رصيد بالورشة {wsBalance}</b></span>
                  </div>
                  {/* Receive equations (مبلغ التشغيل per receive batch) */}
                  {m.receives.length > 0 && <div style={{ marginTop: 4, padding: "7px 10px", background: "linear-gradient(135deg, #ECFDF5, #F0FDF4)", borderRadius: 8, border: "1px dashed #05966940" }}>
                    <div style={{ fontSize: 10, color: "#065F46", fontWeight: 700, marginBottom: 4 }}>💰 مبلغ التشغيل</div>
                    {m.receives.map((r, j) => <div key={j} style={{ direction: "ltr", fontFamily: "'Cairo', monospace", fontSize: 12, fontWeight: 700, color: "#065F46", textAlign: "center", padding: "1px 0" }}>
                      {fmt(r.price)} × {r.qty} = {fmt(r.value)} <span style={{ fontSize: 10, opacity: 0.7 }}>ج.م</span>
                      <span style={{ fontSize: 9, color: "#94A3B8", marginInlineStart: 6, fontFamily: "'Cairo', sans-serif" }}>({fmtDate(r.date)})</span>
                    </div>)}
                    {m.receives.length > 1 && <div style={{ borderTop: "1px solid #05966940", marginTop: 4, paddingTop: 4, direction: "ltr", textAlign: "center", fontSize: 13, fontWeight: 800, color: "#065F46" }}>
                      المجموع: {fmt(m.totalValue)} <span style={{ fontSize: 10, opacity: 0.7 }}>ج.م</span>
                    </div>}
                  </div>}
                </div>
              </div>;
            })
          }
        </div>
      </>}

      {/* PAYMENTS — V18.1: same + notes + total at bottom */}
      {tab === "payments" && <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {payments.length === 0 ? <EmptyMsg text="لا توجد مدفوعات بعد"/> :
          <>
            {payments.map((p, i) => <div key={i} style={{ background: "#fff", borderRadius: 12, padding: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 12, color: "#64748B" }}>{fmtDate(p.date)}</div>
                  <div style={{ fontSize: 11, marginTop: 4, padding: "2px 8px", background: p.type === "purchase" ? "#F3E8FF" : "#DCFCE7", color: p.type === "purchase" ? "#7C3AED" : "#059669", borderRadius: 6, fontWeight: 700, display: "inline-block" }}>
                    {p.type === "purchase" ? "📦 مشتريات" : "💰 دفعة"}
                  </div>
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: p.type === "purchase" ? "#7C3AED" : "#059669", direction: "ltr" }}>{fmt(p.amount)} ج.م</div>
              </div>
              {p.notes && <div style={{ fontSize: 12, color: "#475569", marginTop: 8, padding: "8px 10px", background: "#F8FAFC", borderRadius: 8, borderInlineStart: "3px solid #CBD5E1" }}>📝 {p.notes}</div>}
            </div>)}
            {/* Totals footer */}
            <div style={{ marginTop: 6, background: "linear-gradient(135deg, #ECFDF5, #F0FDF4)", borderRadius: 12, padding: 14, border: "1px solid #05966930" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: totalPurchases > 0 ? 6 : 0 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#065F46" }}>💵 إجمالي المدفوعات</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: "#059669", direction: "ltr" }}>{fmt(totalPayments)} ج.م</span>
              </div>
              {totalPurchases > 0 && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 6, borderTop: "1px dashed #05966930" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#6B21A8" }}>📦 إجمالي المشتريات</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: "#7C3AED", direction: "ltr" }}>{fmt(totalPurchases)} ج.م</span>
              </div>}
            </div>
          </>
        }
      </div>}
    </div>

    {/* Footer */}
    <div className="no-print" style={{ padding: "20px 16px", textAlign: "center", color: "#94A3B8", fontSize: 11 }}>
      <div>هذا الرابط للعرض فقط — لا يمكن إجراء تعديلات</div>
      <div style={{ marginTop: 4 }}>للاستفسار تواصل مع {factory.name}</div>
    </div>
  </div>;
}

/* V18.1: Unified card component for the 4 main metrics */
function Card({ icon, label, value, unit, color, bold, hint }) {
  return <div style={{ background: "#fff", borderRadius: 14, padding: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.04)", textAlign: "center", border: bold ? "2px solid " + color + "30" : "1px solid #F1F5F9" }}>
    <div style={{ fontSize: 11, color: "#64748B", marginBottom: 6, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span>{label}</span>
    </div>
    <div style={{ fontSize: bold ? 22 : 20, fontWeight: 800, color, direction: "ltr", lineHeight: 1.1 }}>
      {value} <span style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8" }}>{unit}</span>
    </div>
    {hint && <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 4 }}>{hint}</div>}
  </div>;
}

function Row({ icon, label, value, unit, color, bold, large }) {
  return <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
    <span style={{ color: "#475569", fontSize: large ? 15 : 13, fontWeight: bold ? 700 : 600, display: "flex", alignItems: "center", gap: 6 }}>
      {icon && <span style={{ fontSize: large ? 16 : 14 }}>{icon}</span>}
      {label}
    </span>
    <span style={{ color: color || "#1E293B", fontSize: large ? 18 : 14, fontWeight: bold ? 800 : 700, direction: "ltr" }}>
      {value} {unit && <span style={{ fontSize: 11, opacity: 0.7 }}>{unit}</span>}
    </span>
  </div>;
}

function EmptyMsg({ text }) {
  return <div style={{ background: "#fff", borderRadius: 12, padding: 30, textAlign: "center", color: "#94A3B8", fontSize: 14 }}>{text}</div>;
}
