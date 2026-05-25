/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Accounting · DashboardTab (V21.9.187)
   ───────────────────────────────────────────────────────────────────────
   Odoo-style accounting dashboard. 7 cards showing key financial metrics
   with colored stat lines + weekly bar charts + navigation buttons.

   All data is read from the merged `data` prop (auto-populated from split
   collections via App.jsx's syncAllSplitChanges). NO async loading needed
   — by the time this tab renders, data.salesInvoices/.checks/.treasury/...
   are already in memory.

   Layout per card:
     • Left-accent stripe (color-coded per metric type)
     • Title row + primary action button (المعاملات)
     • Stat lines: colored number + label (e.g., "1 بانتظار التصديق")
     • Weekly bar chart (last 7 weeks of activity)

   Card colors:
     • المبيعات       → emerald  (#10B981)
     • المشتريات     → purple   (#8B5CF6)
     • شيكات قبض     → amber    (#F59E0B)
     • شيكات دفع     → red      (#EF4444)
     • الخزينة       → blue     (#0EA5E9)
     • الأصول        → teal     (#14B8A6)
     • متنوع         → slate    (#64748B)

   Charts use recharts (already in the bundle — used in DashPg/HRPg etc.).
   ═══════════════════════════════════════════════════════════════════════ */

import { useMemo } from "react";
import { Card } from "../ui.jsx";
import { BarChart, Bar, ResponsiveContainer, Tooltip, XAxis } from "recharts";

/* ─── helpers ──────────────────────────────────────────────────────── */

/* Format money like Odoo: "5,493.00 LE" with thousand separators. */
function fmtMoney(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " LE";
}

/* Get the start of the week (Saturday in EG convention) containing `date`. */
function weekStart(date) {
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  const day = d.getDay(); /* 0=Sun, 6=Sat — for EG week (Sat start) */
  const diff = (day + 1) % 7; /* days since last Saturday */
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/* Format a week label: "8 - 14 يونيو" (Arabic month). */
const AR_MONTHS = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
function weekLabel(weekStartDate) {
  if (!weekStartDate) return "";
  const end = new Date(weekStartDate);
  end.setDate(end.getDate() + 6);
  const s = weekStartDate.getDate();
  const e = end.getDate();
  const m = AR_MONTHS[weekStartDate.getMonth()];
  return `${s} - ${e} ${m}`;
}

/* Bucket an array of {date, amount} into the last N weeks (newest last).
   Returns [{label, value}]. */
function bucketWeekly(items, getDate, getAmount, weeks = 7) {
  const now = new Date();
  const buckets = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const ws = weekStart(now);
    ws.setDate(ws.getDate() - i * 7);
    buckets.push({ ts: ws.getTime(), label: weekLabel(ws), value: 0 });
  }
  items.forEach(it => {
    const d = getDate(it);
    if (!d) return;
    const ws = weekStart(d);
    if (!ws) return;
    const found = buckets.find(b => b.ts === ws.getTime());
    if (found) found.value += Number(getAmount(it)) || 0;
  });
  return buckets;
}

/* Tooltip content for the mini charts. */
function ChartTooltip({ active, payload, label, T, FS, color }) {
  if (!active || !payload || !payload.length) return null;
  const v = payload[0].value || 0;
  return (
    <div style={{
      background: T.cardSolid, border: "1px solid " + color + "60",
      borderRadius: 6, padding: "6px 10px", fontSize: FS - 2,
      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    }}>
      <div style={{ color: T.textSec, fontSize: FS - 3, marginBottom: 2 }}>{label}</div>
      <div style={{ color: color, fontWeight: 800 }}>{fmtMoney(v)}</div>
    </div>
  );
}

/* ─── card primitive ──────────────────────────────────────────────── */

function DashCard({ title, color, stats, chartData, onMainAction, mainActionLabel, T, FS, extra }) {
  return (
    <div style={{
      position: "relative",
      background: T.cardSolid,
      border: "1px solid " + T.brd,
      borderRadius: 12,
      padding: 14,
      paddingInlineStart: 18, /* room for accent stripe */
      display: "flex", flexDirection: "column", gap: 10,
      minHeight: 220,
      overflow: "hidden",
    }}>
      {/* Color accent stripe on the inline-start edge */}
      <div style={{
        position: "absolute", insetInlineStart: 0, top: 0, bottom: 0,
        width: 4, background: color,
      }} />

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: FS + 1, fontWeight: 800, color: color }}>{title}</div>
        {onMainAction && (
          <button
            onClick={onMainAction}
            style={{
              padding: "4px 12px", borderRadius: 6, fontSize: FS - 2, fontWeight: 700,
              background: color + "12", color: color, border: "1px solid " + color + "30",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = color + "22"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = color + "12"; }}
          >{mainActionLabel || "المعاملات"}</button>
        )}
      </div>

      {/* Stat lines */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {stats.map((s, i) => (
          <div key={i} style={{
            display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8,
            fontSize: FS - 1,
          }}>
            <span style={{ color: T.textSec, fontWeight: 600 }}>{s.label}</span>
            <span style={{
              color: s.color || color, fontWeight: 800,
              fontSize: s.big ? FS + 1 : FS,
              fontFamily: "monospace",
              direction: "ltr",
            }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Mini bar chart */}
      {chartData && chartData.some(d => d.value > 0) && (
        <div style={{ height: 60, marginTop: "auto", marginInlineStart: -8 /* tighten chart to card edge */ }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <XAxis
                dataKey="label" tick={{ fontSize: 9, fill: T.textMut }}
                axisLine={false} tickLine={false}
                interval={0}
              />
              <Tooltip content={(p) => <ChartTooltip {...p} T={T} FS={FS} color={color} />} cursor={{ fill: color + "10" }} />
              <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {/* Extras (small text or secondary buttons) */}
      {extra && <div style={{ marginTop: 4 }}>{extra}</div>}
    </div>
  );
}

/* ─── MAIN COMPONENT ──────────────────────────────────────────────── */

export function DashboardTab({ data, config, T, FS, isMob, setActive, gotoTopTab }) {
  const sales        = Array.isArray(data?.salesInvoices)    ? data.salesInvoices    : [];
  const purchases    = Array.isArray(data?.purchaseInvoices) ? data.purchaseInvoices : [];
  const checks       = Array.isArray(data?.checks)           ? data.checks           : [];
  const treasury     = Array.isArray(data?.treasury)         ? data.treasury         : [];
  const fixedAssets  = Array.isArray(data?.fixedAssets)      ? data.fixedAssets      : [];
  /* Pull manual-entry count from the COA + accountingDays — we don't load
     the day docs here (heavy); instead surface the count of entries on
     factory/config.recentManualEntries if maintained, else fallback to
     a simple message. */

  /* ── Sales metrics ── */
  const salesMetrics = useMemo(() => {
    const draft   = sales.filter(s => (s.status || "posted") === "draft");
    const posted  = sales.filter(s => s.status === "posted" || !s.status);
    const voided  = sales.filter(s => s.status === "void");
    const totalPosted = posted.reduce((s, i) => s + (Number(i.total) || 0), 0);
    const totalDraft  = draft.reduce((s, i)  => s + (Number(i.total) || 0), 0);
    return { draft, posted, voided, totalPosted, totalDraft };
  }, [sales]);

  const salesChart = useMemo(() =>
    bucketWeekly(sales.filter(s => s.status !== "void"), s => s.date, s => s.total),
    [sales]);

  /* ── Purchase metrics ── */
  const purchaseMetrics = useMemo(() => {
    const draft  = purchases.filter(p => (p.status || "posted") === "draft");
    const posted = purchases.filter(p => p.status === "posted" || !p.status);
    const voided = purchases.filter(p => p.status === "void");
    const totalPosted = posted.reduce((s, i) => s + (Number(i.total) || 0), 0);
    const totalDraft  = draft.reduce((s, i)  => s + (Number(i.total) || 0), 0);
    return { draft, posted, voided, totalPosted, totalDraft };
  }, [purchases]);

  const purchaseChart = useMemo(() =>
    bucketWeekly(purchases.filter(p => p.status !== "void"), p => p.date, p => p.total),
    [purchases]);

  /* ── Receivable checks ── */
  const recvChecks = useMemo(() => {
    const all = checks.filter(c => c.type === "receivable");
    const pending = all.filter(c => !c.status || c.status === "pending" || c.status === "في الخزنة");
    const cleared = all.filter(c => c.status === "cleared" || c.status === "تم تحصيله" || c.status === "تم الصرف");
    const bounced = all.filter(c => c.status === "bounced" || c.status === "مرتجع");
    const pendingTotal = pending.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const clearedTotal = cleared.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    return { all, pending, cleared, bounced, pendingTotal, clearedTotal };
  }, [checks]);

  const recvChecksChart = useMemo(() =>
    bucketWeekly(recvChecks.all, c => c.date, c => c.amount),
    [recvChecks.all]);

  /* ── Payable checks ── */
  const payChecks = useMemo(() => {
    const all = checks.filter(c => c.type === "payable");
    const pending = all.filter(c => !c.status || c.status === "pending" || c.status === "في الخزنة");
    const cleared = all.filter(c => c.status === "cleared" || c.status === "تم تحصيله" || c.status === "تم الصرف");
    const pendingTotal = pending.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const clearedTotal = cleared.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    return { all, pending, cleared, pendingTotal, clearedTotal };
  }, [checks]);

  const payChecksChart = useMemo(() =>
    bucketWeekly(payChecks.all, c => c.date, c => c.amount),
    [payChecks.all]);

  /* ── Treasury ── */
  const treasuryMetrics = useMemo(() => {
    /* Treasury entries have `type` ("in"|"out" loosely; CLARK uses "وارد"/"منصرف" too)
       and `amount`. For balance, we sum signed amounts by inspecting type/sign. */
    let balance = 0;
    let monthIn = 0, monthOut = 0;
    const cutoffMonth = new Date(); cutoffMonth.setMonth(cutoffMonth.getMonth() - 1);
    for (const t of treasury) {
      const amt = Number(t.amount) || 0;
      const inflow = t.type === "in" || t.type === "وارد" || t.type === "Incoming" || amt > 0 && !["out","منصرف","Outgoing"].includes(t.type);
      const dir = inflow ? 1 : -1;
      balance += Math.abs(amt) * dir;
      const td = new Date(t.date);
      if (!isNaN(td) && td >= cutoffMonth) {
        if (inflow) monthIn += Math.abs(amt);
        else monthOut += Math.abs(amt);
      }
    }
    return { balance, monthIn, monthOut, count: treasury.length };
  }, [treasury]);

  const treasuryChart = useMemo(() => {
    /* For treasury, plot weekly NET movement (in - out). */
    return bucketWeekly(treasury, t => t.date, t => {
      const amt = Number(t.amount) || 0;
      const inflow = t.type === "in" || t.type === "وارد" || t.type === "Incoming";
      return inflow ? Math.abs(amt) : -Math.abs(amt);
    });
  }, [treasury]);

  /* ── Fixed assets ── */
  const assetsMetrics = useMemo(() => {
    const active = fixedAssets.filter(a => !a.disposed);
    const cost = active.reduce((s, a) => s + (Number(a.cost) || 0), 0);
    const acc  = active.reduce((s, a) => s + (Number(a.accumulatedDepreciation) || 0), 0);
    const nbv  = cost - acc;
    return { count: active.length, totalCount: fixedAssets.length, cost, acc, nbv };
  }, [fixedAssets]);

  /* ── Misc / Journal entries (recent only — we don't load accountingDays here) ──
     Show count of all coa entries + a hint to navigate to journal for details. */
  const coa = config?.coa || [];

  /* ── Navigation handlers ── */
  const handleGoto = (tab) => {
    if (gotoTopTab) gotoTopTab(tab);
    else window.dispatchEvent(new CustomEvent("goto-tab", { detail: tab }));
  };

  /* ── Render ── */
  return (
    <div>
      <Card style={{ marginBottom: 14 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          fontSize: FS - 1, color: T.textSec, lineHeight: 1.6,
        }}>
          <span style={{ fontSize: 20 }}>📊</span>
          <span>لوحة بيانات مالية مختصرة — كل card بـ stats + bar chart بـ آخر 7 أسابيع. اضغط على زرار <b>"المعاملات"</b> في أي card عشان تنتقل لـ tab التفاصيل.</span>
        </div>
      </Card>

      <div style={{
        display: "grid",
        gridTemplateColumns: isMob ? "1fr" : "repeat(auto-fit, minmax(300px, 1fr))",
        gap: 12,
      }}>

        {/* ─── 1. المبيعات ─── */}
        <DashCard
          T={T} FS={FS}
          title="📤 المبيعات"
          color="#10B981"
          stats={[
            ...(salesMetrics.draft.length > 0
              ? [{ label: "بانتظار التصديق", value: salesMetrics.draft.length + ` (${fmtMoney(salesMetrics.totalDraft)})`, color: "#F59E0B" }]
              : []),
            { label: "فواتير معتمدة", value: salesMetrics.posted.length, color: "#10B981" },
            { label: "إجمالي مرحّل", value: fmtMoney(salesMetrics.totalPosted), big: true, color: "#10B981" },
            ...(salesMetrics.voided.length > 0
              ? [{ label: "ملغاة", value: salesMetrics.voided.length, color: T.textMut }]
              : []),
          ]}
          chartData={salesChart}
          onMainAction={() => handleGoto("salesInvoices")}
          mainActionLabel="المعاملات"
        />

        {/* ─── 2. المشتريات ─── */}
        <DashCard
          T={T} FS={FS}
          title="📥 المشتريات"
          color="#8B5CF6"
          stats={[
            ...(purchaseMetrics.draft.length > 0
              ? [{ label: "بانتظار التصديق", value: purchaseMetrics.draft.length + ` (${fmtMoney(purchaseMetrics.totalDraft)})`, color: "#F59E0B" }]
              : []),
            { label: "فواتير معتمدة", value: purchaseMetrics.posted.length, color: "#8B5CF6" },
            { label: "إجمالي مرحّل", value: fmtMoney(purchaseMetrics.totalPosted), big: true, color: "#8B5CF6" },
            ...(purchaseMetrics.voided.length > 0
              ? [{ label: "ملغاة", value: purchaseMetrics.voided.length, color: T.textMut }]
              : []),
          ]}
          chartData={purchaseChart}
          onMainAction={() => handleGoto("purchaseInvoices")}
          mainActionLabel="المعاملات"
        />

        {/* ─── 3. شيكات أوراق قبض ─── */}
        <DashCard
          T={T} FS={FS}
          title="🟡 شيكات أوراق قبض"
          color="#F59E0B"
          stats={[
            { label: "في الخزنة", value: recvChecks.pending.length, color: "#F59E0B" },
            { label: "تم تحصيله", value: recvChecks.cleared.length, color: "#10B981" },
            ...(recvChecks.bounced.length > 0
              ? [{ label: "مرتجع", value: recvChecks.bounced.length, color: "#EF4444" }]
              : []),
            { label: "الرصيد (pending)", value: fmtMoney(recvChecks.pendingTotal), big: true, color: "#F59E0B" },
          ]}
          chartData={recvChecksChart}
          onMainAction={() => handleGoto("treasury")}
          mainActionLabel="إدارة الشيكات"
        />

        {/* ─── 4. شيكات أوراق دفع ─── */}
        <DashCard
          T={T} FS={FS}
          title="🔴 شيكات أوراق دفع"
          color="#EF4444"
          stats={[
            { label: "في الخزنة", value: payChecks.pending.length, color: "#EF4444" },
            { label: "تم الصرف", value: payChecks.cleared.length, color: T.textMut },
            { label: "الرصيد (pending)", value: fmtMoney(payChecks.pendingTotal), big: true, color: "#EF4444" },
          ]}
          chartData={payChecksChart}
          onMainAction={() => handleGoto("treasury")}
          mainActionLabel="إدارة الشيكات"
        />

        {/* ─── 5. الخزينة ─── */}
        <DashCard
          T={T} FS={FS}
          title="💵 الخزينة"
          color="#0EA5E9"
          stats={[
            { label: "الرصيد الحالي", value: fmtMoney(treasuryMetrics.balance), big: true, color: treasuryMetrics.balance >= 0 ? "#10B981" : "#EF4444" },
            { label: "حركات الشهر — وارد", value: fmtMoney(treasuryMetrics.monthIn), color: "#10B981" },
            { label: "حركات الشهر — منصرف", value: fmtMoney(treasuryMetrics.monthOut), color: "#EF4444" },
            { label: "إجمالي العمليات", value: treasuryMetrics.count, color: T.textSec },
          ]}
          chartData={treasuryChart}
          onMainAction={() => handleGoto("treasury")}
          mainActionLabel="المعاملات"
        />

        {/* ─── 6. الأصول الثابتة ─── */}
        <DashCard
          T={T} FS={FS}
          title="🏭 الأصول الثابتة"
          color="#14B8A6"
          stats={[
            { label: "عدد الأصول", value: assetsMetrics.count + (assetsMetrics.totalCount > assetsMetrics.count ? ` / ${assetsMetrics.totalCount} (مع المستبعدة)` : "") , color: "#14B8A6" },
            { label: "تكلفة الاقتناء", value: fmtMoney(assetsMetrics.cost), color: T.textSec },
            { label: "الإهلاك التراكمي", value: fmtMoney(assetsMetrics.acc), color: T.textMut },
            { label: "القيمة الدفترية (NBV)", value: fmtMoney(assetsMetrics.nbv), big: true, color: "#14B8A6" },
          ]}
          onMainAction={() => handleGoto("fixedAssets")}
          mainActionLabel="إدارة الأصول"
        />

        {/* ─── 7. متنوع · القيود اليدوية ─── */}
        <DashCard
          T={T} FS={FS}
          title="📔 متنوع · القيود اليدوية"
          color="#64748B"
          stats={[
            { label: "حسابات الـ COA", value: coa.length, color: "#64748B" },
            { label: "المالية", value: "اضغط لفتح القوائم المالية", color: T.textMut },
          ]}
          onMainAction={() => setActive && setActive("journal")}
          mainActionLabel="دفتر اليومية"
          extra={
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button
                onClick={() => setActive && setActive("tb")}
                style={{ padding: "3px 10px", borderRadius: 6, fontSize: FS - 3, fontWeight: 600, background: "#64748B12", color: "#64748B", border: "1px solid #64748B30", cursor: "pointer" }}
              >⚖️ ميزان المراجعة</button>
              <button
                onClick={() => setActive && setActive("reports")}
                style={{ padding: "3px 10px", borderRadius: 6, fontSize: FS - 3, fontWeight: 600, background: "#64748B12", color: "#64748B", border: "1px solid #64748B30", cursor: "pointer" }}
              >📈 القوائم المالية</button>
              <button
                onClick={() => setActive && setActive("aging")}
                style={{ padding: "3px 10px", borderRadius: 6, fontSize: FS - 3, fontWeight: 600, background: "#64748B12", color: "#64748B", border: "1px solid #64748B30", cursor: "pointer" }}
              >⏳ تقادم الديون</button>
            </div>
          }
        />
      </div>
    </div>
  );
}
