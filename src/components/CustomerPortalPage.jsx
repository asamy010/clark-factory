/* ═══════════════════════════════════════════════════════════════
   CLARK — Customer Portal Page (V18.3)
   
   Public page that customers access via a signed URL.
   URL format: /?portal=1&c=<custId>&sig=<hmac>
   
   V18.3 Redesign:
   - Compact header (less vertical space)
   - 6 cards mirroring in-app statement (sales, returns, discount,
     paid w/ cash+checks split, balance, net pieces) — smaller size
   - Summary mirrors cards exactly
   - Stats incl. new "الكمية المباعة الفعلية"
   - Models tab: thumbnail + data, "تسليم" wording, math equation
     row, no "قيد التنفيذ" badge
   - Payments: 3 mini cards (cash/checks/total) + full log
   - PDF (browser print) + WhatsApp share on every tab
   - Mobile-first
   ═══════════════════════════════════════════════════════════════ */

import { useEffect, useState } from "react";
import { Stars } from "../utils/rating.jsx";

const fmt = (n) => (n == null ? "0" : Math.round(Number(n)).toLocaleString("en-US"));
const fmtDate = (d) => {
  if (!d) return "—";
  try {
    const date = new Date(d);
    return date.toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" });
  } catch (e) { return d; }
};

/* PDF = browser print dialog (user picks Save as PDF). Print CSS in <style> below
   hides everything except the active content panel and a header banner. */
const exportPdf = (tabLabel) => {
  document.title = "كشف حساب — " + tabLabel;
  setTimeout(() => window.print(), 100);
};

/* V18.26: Compact, professional table styles for invoice tables */
const tblTh = { padding: "8px 10px", textAlign: "right", fontSize: 11, fontWeight: 800, color: "#475569", borderBottom: "1px solid #E2E8F0", whiteSpace: "nowrap", letterSpacing: "0.02em" };
const tblTd = { padding: "8px 10px", fontSize: 12, color: "#1E293B", whiteSpace: "nowrap" };

export function CustomerPortalPage({ params }) {
  const { c: custId, sig } = params;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [errorMeta, setErrorMeta] = useState(null);/* V18.16: holds {archived, name} when archived */
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("summary");
  /* V18.4: Model number filter (applies to models, deliveries, returns tabs) */
  const [modelFilter, setModelFilter] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const url = "/api/customer-portal?c=" + encodeURIComponent(custId) +
                    "&sig=" + encodeURIComponent(sig);
        const r = await fetch(url);
        const j = await r.json();
        if (!r.ok) {
          setError(j.error || "خطأ في التحميل");
          /* V18.16: store archived metadata for tailored UI */
          if (j.archived) setErrorMeta({ archived: true, name: j.name || "" });
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
    /* V18.16: Detect archived state from API and show a tailored message */
    if (errorMeta && errorMeta.archived) {
      return <div style={wrapperStyle}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: 18, padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 72 }}>🔒</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#DC2626", lineHeight: 1.5, maxWidth: 420 }}>تم إيقاف التعامل مع {errorMeta.name || "هذا الحساب"}</div>
          <div style={{ fontSize: 14, color: "#475569", maxWidth: 420, lineHeight: 1.7, padding: "10px 16px", background: "#FEE2E2", borderRadius: 12, border: "1px solid #FECACA" }}>يُرجى التواصل مع المصنع لمزيد من المعلومات</div>
        </div>
      </div>;
    }
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
  /* V18.3: Flipped — positive=customer owes us=GREEN, negative=factory owes=RED */
  const balanceColor = summary.balance > 0 ? "#059669" : summary.balance < 0 ? "#DC2626" : "#6B7280";
  /* V18.4: Corrected balance labels */
  const balanceLabel = summary.balance > 0 ? "💚 مستحق للمصنع" : summary.balance < 0 ? "❤️ مستحق للعميل" : "✓ متعادل";
  const tabLabels = { summary: "الملخص", transactions: "سجل الحركات", payments: "المدفوعات" };
  /* V18.4: Filter helper — case-insensitive substring match on model number */
  const matchesModel = (modelNo) => !modelFilter.trim() || (modelNo || "").toLowerCase().includes(modelFilter.trim().toLowerCase());
  /* V18.5: Merged delivery + returns log, sorted chronologically (descending) */
  const transactions = [
    ...deliveries.map(d => ({ ...d, kind: "delivery" })),
    ...rets.map(r => ({ ...r, kind: "return" })),
  ].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const filteredTransactions = transactions.filter(t => matchesModel(t.modelNo));
  /* V18.4: Compute gross sales after discount (for card display) */
  const grossAfterDisc = customer.discount > 0 ? Math.round(summary.totalDelValue * (1 - customer.discount / 100)) : summary.totalDelValue;

  /* V18.26: Group deliveries and returns by session into "invoices" — one row per session.
     Records without sessionId fall back to a "NO_SESS_<date>" key so they're still grouped reasonably.
     Numbering is sequential per-customer based on earliest-date ascending. */
  const discPct = Number(customer.discount) || 0;
  const buildInvoices = (rows) => {
    const groups = {};
    rows.forEach(r => {
      const key = r.sessionId || ("NO_SESS_" + (r.date || "unknown"));
      if (!groups[key]) groups[key] = { sessionId: key, date: r.date || "", qty: 0, value: 0, count: 0 };
      groups[key].qty += Number(r.qty) || 0;
      groups[key].value += Number(r.value) || 0;
      groups[key].count += 1;
      /* Use earliest date if multiple deliveries on different dates within a session */
      if (r.date && (!groups[key].date || r.date < groups[key].date)) groups[key].date = r.date;
    });
    /* Sort ascending to assign sequential numbers, then we'll display descending */
    const list = Object.values(groups).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    list.forEach((inv, i) => {
      inv.invoiceNo = i + 1;
      inv.valueAfterDisc = discPct > 0 ? Math.round(inv.value * (1 - discPct / 100)) : inv.value;
    });
    return list.reverse();/* newest first for display */
  };
  const salesInvoices = buildInvoices(deliveries);
  const returnInvoices = buildInvoices(rets);

  return <div style={wrapperStyle}>
    {/* Print-only CSS — hides everything except the printable area */}
    <style>{`
      @media print {
        body * { visibility: hidden; }
        .printable, .printable * { visibility: visible; }
        .printable { position: absolute; inset: 0; padding: 20px; background: #fff !important; }
        .no-print { display: none !important; }
        @page { size: A4; margin: 12mm; }
      }
    `}</style>

    {/* COMPACT Header — V18.3: reduced height — V18.6: + season badge — V18.7: + rating */}
    <div className="no-print" style={{
      background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
      padding: "12px 20px 14px",
      color: "#fff",
      position: "relative",
      textAlign: "center",
    }}>
      {data.activeSeason && <div style={{ position: "absolute", top: 10, insetInlineStart: 14, padding: "4px 10px", background: "rgba(255,255,255,0.2)", borderRadius: 8, fontSize: 11, fontWeight: 700, backdropFilter: "blur(4px)", border: "1px solid rgba(255,255,255,0.25)" }}>📅 موسم {data.activeSeason}</div>}
      <div style={{ fontSize: 11, opacity: 0.85 }}>{factory.name}</div>
      <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{customer.name}</div>
      {customer.phone && <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2, direction: "ltr" }}>{customer.phone}</div>}
      {/* V18.7: Rating badge — V18.11: simplified (stars + number only) */}
      {summary.rating && summary.rating.rated && <div style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 14px", background: "rgba(255,255,255,0.18)", borderRadius: 999, border: "1px solid rgba(255,255,255,0.3)", backdropFilter: "blur(4px)" }}>
        <Stars value={summary.rating.stars} size={14} gap={1}/>
        <span style={{ fontSize: 12, fontWeight: 800, direction: "ltr" }}>{summary.rating.stars}</span>
      </div>}
    </div>

    {/* Print-only banner (visible during print) */}
    <div className="printable" style={{ display: "none" }}>
      <div style={{ borderBottom: "2px solid #6366F1", paddingBottom: 10, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: "#64748B" }}>{factory.name}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#1E293B" }}>كشف حساب — {customer.name}</div>
        <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>القسم: {tabLabels[tab]} • {new Date().toLocaleDateString("ar-EG")}</div>
      </div>
      <div id="print-body"></div>
    </div>

    {/* V18.3: 6 compact cards mirroring in-app statement */}
    <div className="no-print" style={{ padding: "10px 12px 6px", display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
      {/* Card 1: Total Sales (GROSS — V18.4: was netSales which is wrong, now totalDelValue) */}
      <MiniCard icon="📤" label="إجمالي فواتير المبيعات" mainValue={fmt(summary.totalDelValue)} mainSub={customer.discount > 0 ? "قبل الخصم" : "إجمالي التسليم"} unit="ج.م" color="#6366F1"
        secondary={customer.discount > 0 ? { value: fmt(grossAfterDisc), label: "بعد الخصم" } : null}/>
      {/* Card 2: Total Returns */}
      <MiniCard icon="↩️" label="إجمالي المرتجعات" mainValue={fmt(summary.returnsValue)} mainSub={customer.discount > 0 ? "قبل الخصم" : "قيمة المرتجعات"} unit="ج.م" color="#EF4444"
        secondary={customer.discount > 0 && summary.returnsValue > 0 ? { value: fmt(summary.returnsAfterDiscount), label: "بعد الخصم" } : null}/>
      {/* Card 3: Discount — V18.8: restored per user request */}
      {customer.discount > 0 && <MiniCard icon="🏷️" label="إجمالي الخصم" mainValue={fmt(summary.discountAmount)} mainSub={"نسبة " + customer.discount + "%"} unit="ج.م" color="#F59E0B" badge={customer.discount + "%"}/>}
      {/* Card 4: Paid (cash + checks) */}
      <div style={{ background: "#fff", borderRadius: 10, padding: 10, boxShadow: "0 2px 6px rgba(0,0,0,0.04)", border: "1px solid #05966920" }}>
        <div style={{ fontSize: 10, color: "#64748B", fontWeight: 700, marginBottom: 6 }}>💰 إجمالي المدفوع</div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#475569", marginBottom: 2 }}><span>💵 نقدي</span><span style={{ fontWeight: 700, color: "#059669", direction: "ltr" }}>{fmt(summary.cashPaid)}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#475569", marginBottom: 4 }}><span>📝 شيكات</span><span style={{ fontWeight: 700, color: "#059669", direction: "ltr" }}>{fmt(summary.checksPaid)}</span></div>
        <div style={{ borderTop: "1px solid #05966930", paddingTop: 4, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#475569" }}>الإجمالي</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: "#059669", direction: "ltr" }}>{fmt(summary.totalPaid)} <span style={{ fontSize: 9, color: "#94A3B8" }}>ج.م</span></span>
        </div>
      </div>
      {/* Card 5: Balance — emphasized */}
      <div style={{ background: balanceColor + "10", borderRadius: 10, padding: 10, boxShadow: "0 2px 6px rgba(0,0,0,0.04)", border: "2px solid " + balanceColor + "40", textAlign: "center" }}>
        <div style={{ fontSize: 10, color: "#64748B", fontWeight: 700, marginBottom: 4 }}>⚖️ الرصيد الحالي</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: balanceColor, direction: "ltr", lineHeight: 1.1 }}>{fmt(summary.balance)} <span style={{ fontSize: 11, color: "#94A3B8" }}>ج.م</span></div>
        <div style={{ fontSize: 10, color: "#64748B", marginTop: 3, fontWeight: 600 }}>{balanceLabel}</div>
      </div>
      {/* Card 6: Net sold quantity — V18.4 renamed */}
      <MiniCard icon="📦" label="صافي الكمية المباعة" mainValue={fmt(summary.actualSold)} mainSub="تسليم - مرتجع" unit="قطعة" color="#0EA5E9"/>
    </div>

    {/* Tabs — V18.6: models tab removed (transactions log is enough) */}
    <div className="no-print" style={{ padding: "6px 12px", display: "flex", gap: 6, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      {[
        { id: "summary", label: "الملخص", icon: "📋" },
        { id: "transactions", label: "سجل الحركات (" + transactions.length + ")", icon: "🔄" },
        { id: "payments", label: "المدفوعات (" + payments.length + ")", icon: "💰" },
      ].map(t =>
        <button key={t.id} onClick={() => setTab(t.id)} style={{
          padding: "7px 12px",
          borderRadius: 18,
          border: "none",
          background: tab === t.id ? "#6366F1" : "#fff",
          color: tab === t.id ? "#fff" : "#475569",
          fontSize: 12,
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

    {/* Export buttons — V18.5: PDF only (WhatsApp removed per user request) */}
    <div className="no-print" style={{ padding: "4px 12px 8px", display: "flex", gap: 6, justifyContent: "flex-end" }}>
      <button onClick={() => exportPdf(tabLabels[tab])} style={btnStyle("#EF4444")}>📄 PDF</button>
    </div>

    {/* Content (printable area gets cloned for print) */}
    <div className="printable" style={{ padding: "4px 12px 40px" }}>
      {/* SUMMARY */}
      {tab === "summary" && <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ background: "#fff", borderRadius: 12, padding: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10, color: "#1E293B" }}>📋 ملخص الحساب</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
            <Row icon="📤" label="إجمالي فواتير المبيعات" value={fmt(summary.totalDelValue)} unit="ج.م" color="#6366F1"
              detail={customer.discount > 0 ? { label: "بعد الخصم", value: fmt(grossAfterDisc) } : null}/>
            <Row icon="↩️" label="إجمالي المرتجعات" value={fmt(summary.returnsValue)} unit="ج.م" color="#EF4444"
              detail={customer.discount > 0 && summary.returnsValue > 0 ? { label: "بعد الخصم", value: fmt(summary.returnsAfterDiscount) } : null}/>
            <Row icon="💵" label="مدفوع نقدي" value={fmt(summary.cashPaid)} unit="ج.م" color="#059669"/>
            <Row icon="📝" label="مدفوع شيكات" value={fmt(summary.checksPaid)} unit="ج.م" color="#059669"/>
            <Row icon="💰" label="إجمالي المدفوع" value={fmt(summary.totalPaid)} unit="ج.م" color="#059669" bold/>
            <div style={{ borderTop: "2px dashed #E2E8F0", margin: "4px 0", paddingTop: 8 }}>
              <Row icon="⚖️" label="الرصيد الحالي" value={fmt(summary.balance)} unit="ج.م" color={balanceColor} bold xlarge/>
              <div style={{ fontSize: 11, color: "#64748B", textAlign: "left", marginTop: 2 }}>{balanceLabel}</div>
            </div>
            <Row icon="📦" label="صافي الكمية المباعة (تسليم - مرتجع)" value={fmt(summary.actualSold)} unit="قطعة" color="#0EA5E9"/>
          </div>
        </div>

        <div style={{ background: "#fff", borderRadius: 12, padding: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10, color: "#1E293B" }}>📈 إحصاءات</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
            <StatBox label="عدد الموديلات" value={summary.orderCount} color="#6366F1"/>
            <StatBox label="عدد التسليمات" value={summary.deliveryCount} color="#0EA5E9"/>
            <StatBox label="قطع مسلّمة" value={summary.piecesDelivered} color="#059669"/>
            <StatBox label="قطع مرتجعة" value={summary.piecesReturned} color="#EF4444"/>
            <StatBox label="الكمية المباعة الفعلية" value={summary.actualSold} color="#8B5CF6" wide/>
          </div>
        </div>

        {/* V18.7: Rating card with details */}
        {summary.rating && <div style={{ background: "linear-gradient(135deg, " + summary.rating.color + "10, " + summary.rating.color + "03)", borderRadius: 12, padding: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.04)", border: "1px solid " + summary.rating.color + "30" }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10, color: "#1E293B" }}>⭐ تقييم العميل</div>
          {summary.rating.rated ? <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center", textAlign: "center" }}>
            <Stars value={summary.rating.stars} size={26} gap={3}/>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 22, fontWeight: 900, color: summary.rating.color, direction: "ltr" }}>{summary.rating.stars}</span>
              <span style={{ fontSize: 12, color: "#94A3B8", fontWeight: 600 }}>/ 5</span>
            </div>
            <div style={{ fontSize: 12, color: "#475569", marginTop: 4, display: "flex", flexDirection: "column", gap: 3, width: "100%" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span>نسبة البيع:</span><b style={{ color: summary.rating.color, direction: "ltr" }}>{summary.rating.pct}%</b></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span>كمية مسلمة:</span><b style={{ direction: "ltr" }}>{summary.piecesDelivered}</b></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span>كمية مرتجعة:</span><b style={{ color: "#EF4444", direction: "ltr" }}>{summary.piecesReturned}</b></div>
              <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px dashed #E2E8F0", paddingTop: 4 }}><span>كمية مباعة فعلياً:</span><b style={{ color: "#059669", direction: "ltr" }}>{summary.actualSold}</b></div>
            </div>
          </div> : <div style={{ textAlign: "center", padding: "16px 0", color: "#94A3B8" }}>
            <div style={{ fontSize: 30, marginBottom: 6 }}>📊</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{summary.rating.label}</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>التقييم يبدأ بعد أول تسليم</div>
          </div>}
        </div>}
      </div>}

      {/* V18.26: Sales invoices table — one row per session (aggregated). Shown only on transactions tab */}
      {tab === "transactions" && <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, padding: "0 2px" }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: "#059669" }}>🛒 مبيعات</span>
          <span style={{ fontSize: 11, color: "#64748B" }}>({salesInvoices.length} فاتورة)</span>
        </div>
        {salesInvoices.length === 0 ? <div style={{ padding: 16, textAlign: "center", background: "#fff", borderRadius: 10, color: "#94A3B8", fontSize: 12, border: "1px solid #E2E8F0" }}>لا توجد مبيعات</div> :
          <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #E2E8F0", overflowX: "auto", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 540 }}>
              <thead><tr style={{ background: "#F0FDF4" }}>
                <th style={tblTh}>#</th>
                <th style={tblTh}>التاريخ</th>
                <th style={{ ...tblTh, textAlign: "center" }}>الكمية</th>
                <th style={{ ...tblTh, textAlign: "center" }}>القيمة قبل الخصم</th>
                <th style={{ ...tblTh, textAlign: "center" }}>القيمة بعد الخصم</th>
                <th style={{ ...tblTh, textAlign: "center" }}>النوع</th>
              </tr></thead>
              <tbody>{salesInvoices.map((inv, i) => <tr key={inv.sessionId} style={{ background: i % 2 === 0 ? "#fff" : "#F8FAFC", borderTop: "1px solid #F1F5F9" }}>
                <td style={{ ...tblTd, fontWeight: 800, color: "#059669" }}>#{inv.invoiceNo}</td>
                <td style={tblTd}>{fmtDate(inv.date)}</td>
                <td style={{ ...tblTd, textAlign: "center", fontWeight: 700 }}>{fmt(inv.qty)} <span style={{ fontSize: 9, color: "#94A3B8", fontWeight: 600 }}>قطعة</span></td>
                <td style={{ ...tblTd, textAlign: "center", direction: "ltr", fontVariantNumeric: "tabular-nums" }}>{fmt(inv.value)}</td>
                <td style={{ ...tblTd, textAlign: "center", fontWeight: 800, color: "#059669", direction: "ltr", fontVariantNumeric: "tabular-nums" }}>{fmt(inv.valueAfterDisc)}</td>
                <td style={{ ...tblTd, textAlign: "center" }}>
                  <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, background: "#F0FDF4", color: "#059669", fontWeight: 800, border: "1px solid #DCFCE7", whiteSpace: "nowrap" }}>📄 فاتورة بيع</span>
                </td>
              </tr>)}
              {/* Totals row */}
              <tr style={{ background: "#ECFDF5", borderTop: "2px solid #10B981" }}>
                <td colSpan={2} style={{ ...tblTd, fontWeight: 800, color: "#059669" }}>الإجمالي</td>
                <td style={{ ...tblTd, textAlign: "center", fontWeight: 800, color: "#059669" }}>{fmt(salesInvoices.reduce((s, x) => s + x.qty, 0))}</td>
                <td style={{ ...tblTd, textAlign: "center", fontWeight: 800, color: "#059669", direction: "ltr", fontVariantNumeric: "tabular-nums" }}>{fmt(salesInvoices.reduce((s, x) => s + x.value, 0))}</td>
                <td style={{ ...tblTd, textAlign: "center", fontWeight: 800, color: "#059669", direction: "ltr", fontVariantNumeric: "tabular-nums" }}>{fmt(salesInvoices.reduce((s, x) => s + x.valueAfterDisc, 0))}</td>
                <td style={tblTd}></td>
              </tr>
              </tbody>
            </table>
          </div>}
      </div>}

      {/* V18.26: Returns invoices table — one row per session (aggregated) */}
      {tab === "transactions" && <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, padding: "0 2px" }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: "#EF4444" }}>↩️ مرتجعات</span>
          <span style={{ fontSize: 11, color: "#64748B" }}>({returnInvoices.length})</span>
        </div>
        {returnInvoices.length === 0 ? <div style={{ padding: 16, textAlign: "center", background: "#fff", borderRadius: 10, color: "#94A3B8", fontSize: 12, border: "1px solid #E2E8F0" }}>لا توجد مرتجعات</div> :
          <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #E2E8F0", overflowX: "auto", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 540 }}>
              <thead><tr style={{ background: "#FEF2F2" }}>
                <th style={tblTh}>#</th>
                <th style={tblTh}>التاريخ</th>
                <th style={{ ...tblTh, textAlign: "center" }}>الكمية</th>
                <th style={{ ...tblTh, textAlign: "center" }}>القيمة قبل الخصم</th>
                <th style={{ ...tblTh, textAlign: "center" }}>القيمة بعد الخصم</th>
                <th style={{ ...tblTh, textAlign: "center" }}>النوع</th>
              </tr></thead>
              <tbody>{returnInvoices.map((inv, i) => <tr key={inv.sessionId} style={{ background: i % 2 === 0 ? "#fff" : "#F8FAFC", borderTop: "1px solid #F1F5F9" }}>
                <td style={{ ...tblTd, fontWeight: 800, color: "#EF4444" }}>#{inv.invoiceNo}</td>
                <td style={tblTd}>{fmtDate(inv.date)}</td>
                <td style={{ ...tblTd, textAlign: "center", fontWeight: 700 }}>{fmt(inv.qty)} <span style={{ fontSize: 9, color: "#94A3B8", fontWeight: 600 }}>قطعة</span></td>
                <td style={{ ...tblTd, textAlign: "center", direction: "ltr", fontVariantNumeric: "tabular-nums" }}>{fmt(inv.value)}</td>
                <td style={{ ...tblTd, textAlign: "center", fontWeight: 800, color: "#EF4444", direction: "ltr", fontVariantNumeric: "tabular-nums" }}>{fmt(inv.valueAfterDisc)}</td>
                <td style={{ ...tblTd, textAlign: "center" }}>
                  <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, background: "#FEF2F2", color: "#EF4444", fontWeight: 800, border: "1px solid #FEE2E2", whiteSpace: "nowrap" }}>↩️ مرتجع</span>
                </td>
              </tr>)}
              {/* Totals row */}
              <tr style={{ background: "#FEF2F2", borderTop: "2px solid #EF4444" }}>
                <td colSpan={2} style={{ ...tblTd, fontWeight: 800, color: "#EF4444" }}>الإجمالي</td>
                <td style={{ ...tblTd, textAlign: "center", fontWeight: 800, color: "#EF4444" }}>{fmt(returnInvoices.reduce((s, x) => s + x.qty, 0))}</td>
                <td style={{ ...tblTd, textAlign: "center", fontWeight: 800, color: "#EF4444", direction: "ltr", fontVariantNumeric: "tabular-nums" }}>{fmt(returnInvoices.reduce((s, x) => s + x.value, 0))}</td>
                <td style={{ ...tblTd, textAlign: "center", fontWeight: 800, color: "#EF4444", direction: "ltr", fontVariantNumeric: "tabular-nums" }}>{fmt(returnInvoices.reduce((s, x) => s + x.valueAfterDisc, 0))}</td>
                <td style={tblTd}></td>
              </tr>
              </tbody>
            </table>
          </div>}
      </div>}

      {/* V18.6: Model filter — shown on transactions tab only (models tab removed) */}
      {tab === "transactions" && <div className="no-print" style={{ marginBottom: 8, display: "flex", gap: 6, alignItems: "center" }}>
        <input type="text" value={modelFilter} onChange={e => setModelFilter(e.target.value)} placeholder="🔍 فلتر برقم الموديل..." style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 13, fontFamily: "inherit", direction: "ltr", textAlign: "right", background: "#fff" }}/>
        {modelFilter && <button onClick={() => setModelFilter("")} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #CBD5E1", background: "#F1F5F9", color: "#475569", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>✕ مسح</button>}
      </div>}

      {/* V18.5+V18.26: Detailed cards — per-model/transaction view (filtered by model) */}
      {tab === "transactions" && <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, marginBottom: 6, padding: "0 2px" }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: "#6366F1" }}>📋 تفاصيل حسب الموديل</span>
        <span style={{ fontSize: 11, color: "#64748B" }}>({filteredTransactions.length})</span>
      </div>}
      {tab === "transactions" && <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {filteredTransactions.length === 0 ? <EmptyMsg text={modelFilter ? "لا توجد حركات بهذا الرقم" : "لا توجد حركات"}/> :
          filteredTransactions.map((t, i) => {
            const isReturn = t.kind === "return";
            const color = isReturn ? "#EF4444" : "#059669";
            const bgTint = isReturn ? "#FEF2F2" : "#F0FDF4";
            const borderTint = isReturn ? "#FEE2E2" : "#DCFCE7";
            const label = isReturn ? "مرتجع" : "تسليم";
            const icon = isReturn ? "↩️" : "📥";
            return <div key={i} style={{ background: "#fff", borderRadius: 10, padding: 10, boxShadow: "0 1px 4px rgba(0,0,0,0.04)", display: "flex", gap: 10, alignItems: "stretch", borderInlineStart: "3px solid " + color }}>
              {/* Thumbnail */}
              <div style={{ width: 56, minWidth: 56, borderRadius: 8, overflow: "hidden", background: "#F1F5F9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {t.image ? <img src={t.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}/> : <span style={{ fontSize: 22, opacity: 0.3 }}>📦</span>}
              </div>
              {/* Data */}
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                  <div style={{ fontWeight: 800, color: "#6366F1", direction: "ltr", fontSize: 14 }}>{t.modelNo}</div>
                  <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, background: bgTint, color, fontWeight: 800, border: "1px solid " + borderTint }}>{icon} {label}</span>
                </div>
                {t.modelDesc && <div style={{ fontSize: 11, color: "#64748B" }}>{t.modelDesc}</div>}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 2 }}>
                  <span style={{ fontSize: 10, color: "#94A3B8" }}>{fmtDate(t.date)}</span>
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color }}>{t.qty} <span style={{ fontSize: 9, color: "#64748B", fontWeight: 600 }}>قطعة</span></span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#475569", direction: "ltr" }}>{fmt(t.value)} <span style={{ fontSize: 9, color: "#94A3B8", fontWeight: 600 }}>ج.م</span></span>
                  </div>
                </div>
              </div>
            </div>;
          })
        }
      </div>}

      {/* PAYMENTS — V18.3: 3 summary cards + full transaction log */}
      {tab === "payments" && <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* 3 summary cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          <PayCard icon="💵" label="نقدي" value={fmt(summary.cashPaid)} color="#059669"/>
          <PayCard icon="📝" label="شيكات" value={fmt(summary.checksPaid)} color="#0EA5E9"/>
          <PayCard icon="💰" label="إجمالي" value={fmt(summary.totalPaid)} color="#6366F1" bold/>
        </div>
        {/* Full transaction log */}
        {payments.length === 0 ? <EmptyMsg text="لا توجد مدفوعات"/> :
          payments.map((p, i) => <div key={i} style={{ background: "#fff", borderRadius: 10, padding: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: p.method === "شيك" ? "#0EA5E9" : "#059669" }}>
                  {p.method === "شيك" ? "📝" : "💵"} {p.method}
                </div>
                <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{fmtDate(p.date)}</div>
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: p.method === "شيك" ? "#0EA5E9" : "#059669", direction: "ltr" }}>{fmt(p.amount)} ج.م</div>
            </div>
            {p.notes && <div style={{ fontSize: 11, color: "#475569", marginTop: 6, padding: "6px 8px", background: "#F8FAFC", borderRadius: 6, borderInlineStart: "3px solid #CBD5E1" }}>📝 {p.notes}</div>}
          </div>)
        }
      </div>}
    </div>

    {/* Footer */}
    <div className="no-print" style={{ padding: "12px 14px", textAlign: "center", color: "#94A3B8", fontSize: 11 }}>
      آخر تحديث: {new Date(data.generatedAt).toLocaleString("ar-EG")}
      <div style={{ marginTop: 4 }}>{factory.name} • رابطك الخاص — لا تشاركه</div>
    </div>
  </div>;
}

const btnStyle = (color) => ({
  padding: "5px 10px",
  borderRadius: 8,
  border: "1px solid " + color + "30",
  background: color + "12",
  color,
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
});

function MiniCard({ icon, label, mainValue, mainSub, unit, color, secondary, badge }) {
  return <div style={{ background: "#fff", borderRadius: 10, padding: 10, boxShadow: "0 2px 6px rgba(0,0,0,0.04)", border: "1px solid " + color + "20" }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 10, color: "#64748B", fontWeight: 700, marginBottom: 4 }}>
      <span>{icon} {label}</span>
      {badge && <span style={{ padding: "1px 6px", background: color + "20", color, borderRadius: 4, fontSize: 9, fontWeight: 800 }}>{badge}</span>}
    </div>
    <div style={{ fontSize: 16, fontWeight: 800, color, direction: "ltr", lineHeight: 1.1 }}>{mainValue} <span style={{ fontSize: 9, color: "#94A3B8", fontWeight: 600 }}>{unit}</span></div>
    {mainSub && <div style={{ fontSize: 9, color: "#94A3B8", marginTop: 1 }}>{mainSub}</div>}
    {secondary && <div style={{ marginTop: 4, paddingTop: 4, borderTop: "1px dashed " + color + "30" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color, direction: "ltr" }}>{secondary.value} <span style={{ fontSize: 9, color: "#94A3B8", fontWeight: 600 }}>{unit}</span></div>
      <div style={{ fontSize: 9, color: "#94A3B8" }}>{secondary.label}</div>
    </div>}
  </div>;
}

function Row({ icon, label, value, unit, color, bold, large, xlarge, detail }) {
  const valueSize = xlarge ? 20 : large ? 16 : 13;
  return <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "1px 0" }}>
      <span style={{ color: "#475569", fontWeight: bold ? 700 : 600, fontSize: 13, display: "flex", alignItems: "center", gap: 5 }}>
        {icon && <span style={{ fontSize: 13 }}>{icon}</span>}
        {label}
      </span>
      <span style={{ color: color || "#1E293B", fontWeight: bold ? 800 : 700, fontSize: valueSize, direction: "ltr" }}>{value} <span style={{ fontSize: 10, color: "#94A3B8", fontWeight: 600 }}>{unit}</span></span>
    </div>
    {detail && <div style={{ display: "flex", justifyContent: "space-between", paddingInlineStart: 22, fontSize: 11, color: "#64748B" }}>
      <span>{detail.label}</span>
      <span style={{ direction: "ltr", fontWeight: 700, color }}>{detail.value} <span style={{ fontSize: 9, opacity: 0.7 }}>{unit}</span></span>
    </div>}
  </div>;
}

function StatBox({ label, value, color, wide }) {
  return <div style={{ background: (color || "#6366F1") + "10", borderRadius: 10, padding: 10, textAlign: "center", gridColumn: wide ? "span 2" : "auto" }}>
    <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600, marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: 18, fontWeight: 800, color: color || "#6366F1", direction: "ltr" }}>{Math.round(value).toLocaleString("en-US")}</div>
  </div>;
}

function PayCard({ icon, label, value, color, bold }) {
  return <div style={{ background: bold ? color + "12" : "#fff", borderRadius: 10, padding: 10, textAlign: "center", border: "1px solid " + color + (bold ? "40" : "20"), boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
    <div style={{ fontSize: 11, color: "#64748B", fontWeight: 700 }}>{icon} {label}</div>
    <div style={{ fontSize: bold ? 17 : 15, fontWeight: 800, color, direction: "ltr", marginTop: 3 }}>{value} <span style={{ fontSize: 9, color: "#94A3B8" }}>ج.م</span></div>
  </div>;
}

function EmptyMsg({ text }) {
  return <div style={{ textAlign: "center", padding: 40, color: "#94A3B8", fontSize: 14 }}>
    <div style={{ fontSize: 40, marginBottom: 8 }}>📭</div>
    {text}
  </div>;
}
