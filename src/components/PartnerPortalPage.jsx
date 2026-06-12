/* ═══════════════════════════════════════════════════════════════
   CLARK — Partner Portal Page (V21.21.69)

   صفحة عامة (بدون login) لبورتال الشريك. URL: /?partner=1&s=<sig>
   تعرض الأقسام اللي المالك فعّلها فقط (كل قسم بيظهر في الـ payload لو
   مفعّل): KPIs · حالة الأوامر + الإنجاز · تفصيل أرصدة العملاء/الموردين.

   standalone — مفيش اعتماد على ثيم التطبيق (inline styles, mobile-first).
   ═══════════════════════════════════════════════════════════════ */

import { useEffect, useState } from "react";

const fmt = (n) => (n == null ? "0" : Math.round(Number(n)).toLocaleString("en-US"));

const C = {
  bg: "linear-gradient(135deg,#F8FAFC 0%,#EEF2FF 100%)",
  card: "#FFFFFF", brd: "#E2E8F0", text: "#0F172A", sec: "#475569", mut: "#94A3B8",
  accent: "#6366F1", ok: "#059669", err: "#DC2626", warn: "#D97706", cyan: "#0EA5E9", purple: "#8B5CF6",
};

export function PartnerPortalPage({ params }) {
  const { sig } = params;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/partner-portal?s=" + encodeURIComponent(sig));
        const j = await r.json();
        if (!r.ok || !j.ok) setError(j.error || "خطأ في التحميل");
        else setData(j);
      } catch (e) { setError("فشل الاتصال بالخادم"); }
      finally { setLoading(false); }
    })();
  }, [sig]);

  const wrap = { minHeight: "100vh", background: C.bg, direction: "rtl", fontFamily: "'Cairo',sans-serif" };

  if (loading) {
    return <div style={wrap}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: 12 }}>
        <div style={{ width: 42, height: 42, border: "4px solid " + C.brd, borderTop: "4px solid " + C.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ fontSize: 16, color: C.sec, fontWeight: 700 }}>جاري تحميل اللوحة...</div>
      </div>
    </div>;
  }

  if (error) {
    return <div style={wrap}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: 14, padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 54 }}>🔒</div>
        <div style={{ fontSize: 19, color: C.text, fontWeight: 800 }}>{error}</div>
        <div style={{ fontSize: 14, color: C.mut, maxWidth: 320, lineHeight: 1.7 }}>الرابط ممكن يكون اتلغى. تواصل مع المالك للحصول على رابط جديد.</div>
      </div>
    </div>;
  }

  const factory = data.factory || {};

  const Card = ({ label, value, color, sub }) => (
    <div style={{ flex: "1 1 150px", minWidth: 140, background: C.card, border: "1px solid " + C.brd, borderRadius: 14, padding: "14px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      <div style={{ fontSize: 12, color: C.mut, fontWeight: 700, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 900, color: color || C.text, lineHeight: 1.1, direction: "ltr", textAlign: "right" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.sec, fontWeight: 600, marginTop: 4 }}>{sub}</div>}
    </div>
  );

  const Section = ({ title, children }) => (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 16, fontWeight: 900, color: C.text, margin: "0 2px 10px", display: "flex", alignItems: "center", gap: 8 }}>{title}</div>
      {children}
    </div>
  );

  const Th = ({ children, align }) => <th style={{ textAlign: align || "right", padding: "9px 10px", fontSize: 12, fontWeight: 800, color: C.sec, borderBottom: "2px solid " + C.brd, whiteSpace: "nowrap" }}>{children}</th>;
  const Td = ({ children, align, color, bold }) => <td style={{ textAlign: align || "right", padding: "8px 10px", fontSize: 13, color: color || C.text, fontWeight: bold ? 800 : 500, whiteSpace: "nowrap", borderBottom: "1px solid " + C.brd }}>{children}</td>;

  const balColor = (b) => (b > 0 ? C.err : b < 0 ? C.ok : C.mut);

  return <div style={wrap}>
    {/* Header */}
    <div style={{ background: C.card, borderBottom: "1px solid " + C.brd, padding: "16px 18px", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 5 }}>
      {factory.logo
        ? <img src={factory.logo} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover" }} />
        : <div style={{ width: 44, height: 44, borderRadius: 10, background: "#EEF2FF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>📊</div>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{factory.name || "لوحة التحكم"}</div>
        <div style={{ fontSize: 12, color: C.mut, fontWeight: 600 }}>لوحة التحكم · {data.activeSeason || "الموسم الحالي"} · بيانات لحظية</div>
      </div>
    </div>

    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      {/* KPI cards */}
      {(data.sales || data.purchases || data.inventory || data.profit) && <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 22 }}>
        {data.sales && <Card label="صافي المبيعات" value={fmt(data.sales.net)} color={C.cyan} sub={"مرتجعات " + fmt(data.sales.returns)} />}
        {data.sales && <Card label="التحصيلات" value={fmt(data.sales.collected)} color={C.ok} />}
        {data.sales && <Card label="رصيد العملاء (عليهم لينا)" value={fmt(data.sales.balance)} color={balColor(data.sales.balance)} />}
        {data.purchases && <Card label="صافي المشتريات" value={fmt(data.purchases.net)} color={C.purple} />}
        {data.purchases && <Card label="مستحق للموردين (علينا ليهم)" value={fmt(data.purchases.payable)} color={C.warn} />}
        {data.inventory && <Card label="تقييم المخزون" value={fmt(data.inventory.total)} color={C.text} sub={"جاهز " + fmt(data.inventory.finished)} />}
        {data.profit && <Card label="صافي الربح" value={fmt(data.profit.netProfit)} color={data.profit.netProfit >= 0 ? C.ok : C.err} sub={data.profit.configured ? "" : "بدون مصروفات تشغيلية"} />}
      </div>}

      {/* Orders status */}
      {data.orders && <Section title="🏭 حالة الأوامر">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <Card label="إجمالي الأوامر" value={fmt(data.orders.total)} color={C.text} />
          <Card label="تحت التشغيل" value={fmt(data.orders.working)} color={C.warn} />
          <Card label="مكتملة الإنتاج" value={fmt(data.orders.done)} color={C.ok} />
          <Card label="معدل الإنجاز" value={data.orders.completionRate + "%"} color={C.accent} />
        </div>
        {/* completion bar */}
        <div style={{ background: C.card, border: "1px solid " + C.brd, borderRadius: 12, padding: 14 }}>
          <div style={{ height: 14, background: "#EEF2FF", borderRadius: 8, overflow: "hidden", marginBottom: 12 }}>
            <div style={{ width: data.orders.completionRate + "%", height: "100%", background: "linear-gradient(90deg," + C.accent + "," + C.cyan + ")", borderRadius: 8 }} />
          </div>
          {data.orders.items.length > 0 && <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><Th>الموديل</Th><Th align="center">مقصوص</Th><Th align="center">جاهز</Th><Th align="center">الإنجاز</Th></tr></thead>
              <tbody>
                {data.orders.items.slice(0, 60).map((o, i) => <tr key={i}>
                  <Td bold>{o.modelNo}{o.modelDesc ? <span style={{ color: C.mut, fontWeight: 500 }}> — {o.modelDesc}</span> : ""}</Td>
                  <Td align="center">{fmt(o.cut)}</Td>
                  <Td align="center">{fmt(o.confirmed)}</Td>
                  <Td align="center" color={o.status === "done" ? C.ok : C.warn} bold>{o.completion}%</Td>
                </tr>)}
              </tbody>
            </table>
          </div>}
        </div>
      </Section>}

      {/* Receivables — customers owe us */}
      {data.receivables && <Section title="🟢 أرصدة العملاء (عليهم لينا)">
        <BalanceTable rows={data.receivables} valueKey="sales" valueLabel="مبيعات" Th={Th} Td={Td} balColor={balColor} />
      </Section>}

      {/* Payables — we owe suppliers */}
      {data.payables && <Section title="🟠 أرصدة الموردين (علينا ليهم)">
        <BalanceTable rows={data.payables} valueKey="purchases" valueLabel="مشتريات" Th={Th} Td={Td} balColor={balColor} />
      </Section>}

      <div style={{ marginTop: 20, textAlign: "center", fontSize: 11, color: C.mut, paddingBottom: 24 }}>
        محدّث لحظياً · CLARK · {new Date(data.generatedAt).toLocaleString("ar-EG")}
      </div>
    </div>
  </div>;

  function BalanceTable({ rows, valueKey, valueLabel, Th, Td, balColor }) {
    if (!rows || rows.length === 0) return <div style={{ padding: 24, textAlign: "center", color: C.mut, background: C.card, borderRadius: 12, border: "1px dashed " + C.brd }}>لا يوجد</div>;
    const totalBal = rows.reduce((s, r) => s + (Number(r.balance) || 0), 0);
    return <div style={{ background: C.card, border: "1px solid " + C.brd, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><Th>الاسم</Th><Th align="center">{valueLabel}</Th><Th align="center">مدفوع</Th><Th align="center">الرصيد</Th></tr></thead>
          <tbody>
            {rows.map((r, i) => <tr key={i}>
              <Td bold>{r.name}</Td>
              <Td align="center">{fmt(r[valueKey])}</Td>
              <Td align="center" color={C.sec}>{fmt(r.paid)}</Td>
              <Td align="center" color={balColor(r.balance)} bold>{fmt(r.balance)}</Td>
            </tr>)}
          </tbody>
          <tfoot><tr style={{ background: "#F8FAFC" }}>
            <Td bold>الإجمالي ({rows.length})</Td><Td /><Td />
            <Td align="center" color={balColor(totalBal)} bold>{fmt(totalBal)}</Td>
          </tr></tfoot>
        </table>
      </div>
    </div>;
  }
}
