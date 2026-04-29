/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · Report Print Helpers
   ───────────────────────────────────────────────────────────────────────
   Generates print-ready HTML for the three financial statements with a
   professional layout. Uses the existing printPage() utility which
   provides the factory letterhead, footer, and "Save as PDF" toolbar.
   ═══════════════════════════════════════════════════════════════════════ */

import { printPage } from "../../utils/print.js";
import { fmt } from "../../utils/format.js";

/* Inline styles tuned for printing — printPage's PRINT_CSS handles the
   page wrapper, header, and footer. We add only the report-specific bits. */
const REPORT_CSS = `
  <style>
    .rpt-period { padding: 10px 16px; background: #F0F9FF; border: 1px solid #BAE6FD; border-radius: 8px; margin-bottom: 14px; font-size: 12px; color: #0369A1; font-weight: 700; text-align: center; }
    .rpt-section { margin: 18px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #0EA5E9; font-size: 14px; font-weight: 800; color: #0F172A; }
    .rpt-subhead { margin: 12px 0 6px; font-size: 12px; font-weight: 700; color: #334155; padding: 6px 12px; background: #F1F5F9; border-inline-start: 3px solid #94A3B8; border-radius: 0 4px 4px 0; }
    table.rpt-tbl { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    table.rpt-tbl td { padding: 5px 12px; border-bottom: 1px dotted #DDD; vertical-align: middle; font-size: 11px; }
    table.rpt-tbl tr.subtotal td { border-top: 1px solid #94A3B8; border-bottom: 1px solid #94A3B8; font-weight: 700; background: #FAFAFA; font-size: 11.5px; }
    table.rpt-tbl tr.total td { border-top: 2px double #0F172A; border-bottom: 2px double #0F172A; font-weight: 800; font-size: 12.5px; padding: 8px 12px; }
    table.rpt-tbl .code { width: 60px; font-family: monospace; color: #0EA5E9; font-weight: 700; }
    table.rpt-tbl .name { padding-inline-start: 6px; }
    table.rpt-tbl .amt  { width: 110px; text-align: left; direction: ltr; font-variant-numeric: tabular-nums; font-family: monospace; }
    table.rpt-tbl tr.indent td.name { padding-inline-start: 28px; color: #475569; font-size: 10.5px; }
    table.rpt-tbl tr.indent td.amt  { font-size: 10.5px; color: #475569; }
    .rpt-grand { margin-top: 14px; padding: 12px 18px; border: 2px solid #0F172A; background: #F1F5F9; display: flex; justify-content: space-between; align-items: center; font-size: 14px; font-weight: 800; border-radius: 6px; }
    .rpt-grand.profit { background: #ECFDF5; border-color: #10B981; color: #065F46; }
    .rpt-grand.loss   { background: #FEF2F2; border-color: #EF4444; color: #991B1B; }
    .rpt-grand .amt-big { direction: ltr; font-family: monospace; font-size: 16px; }
    .rpt-ratio { margin-top: 10px; padding: 8px 14px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 4px; font-size: 11px; color: #475569; }
    .rpt-ratio b { color: #0F172A; font-weight: 800; }
    .rpt-sig { margin-top: 30px; display: flex; justify-content: space-around; gap: 20px; }
    .rpt-sig .box { width: 180px; text-align: center; border-top: 1px solid #0F172A; padding-top: 6px; font-size: 10px; color: #475569; font-weight: 700; }
    .neg { color: #B91C1C; }
    .empty { text-align: center; color: #94A3B8; padding: 12px; font-style: italic; }
    @media print {
      tr { page-break-inside: avoid; }
      .rpt-section { page-break-after: avoid; }
    }
  </style>
`;

const _amt = (n, neg) => {
  const x = Number(n)||0;
  if(Math.abs(x) < 0.005) return "—";
  const txt = fmt(x.toFixed(2));
  return neg && x !== 0 ? `<span class="neg">(${txt})</span>` : txt;
};

const _signatures = `
  <div class="rpt-sig">
    <div class="box">المحاسب</div>
    <div class="box">المراجع الداخلي</div>
    <div class="box">المدير المالي</div>
  </div>`;

/* ═══ Income Statement print ═══ */

export function printIncomeStatement(report, configInfo){
  const period = `الفترة من ${report.period.from} إلى ${report.period.to}`;

  const revenueRows = report.revenue.items.length === 0
    ? `<tr><td colspan="3" class="empty">لا توجد إيرادات في هذه الفترة</td></tr>`
    : report.revenue.items.map(r => `
        <tr class="indent"><td class="code">${r.code}</td><td class="name">${r.name}</td><td class="amt">${_amt(r.balance, r.balance < 0)}</td></tr>`).join("");

  const cogsHtml = report.cogs.sections.map(sec => `
    <tr class="subtotal"><td colspan="2">${sec.label}</td><td class="amt">${_amt(sec.total, true)}</td></tr>
    ${sec.items.map(it => `<tr class="indent"><td class="code">${it.code}</td><td class="name">${it.name}</td><td class="amt">${_amt(it.balance, true)}</td></tr>`).join("")}
  `).join("");

  const opexHtml = report.operatingExpenses.sections.map(sec => `
    <tr class="subtotal"><td colspan="2">${sec.label}</td><td class="amt">${_amt(sec.total, true)}</td></tr>
    ${sec.items.map(it => `<tr class="indent"><td class="code">${it.code}</td><td class="name">${it.name}</td><td class="amt">${_amt(it.balance, true)}</td></tr>`).join("")}
  `).join("");

  const isProfit = report.netIncome >= 0;
  const ratios = report.ratios;
  const ratioLine = (ratios.grossMargin != null) ? `
    <div class="rpt-ratio">
      <b>هامش مجمل الربح:</b> ${ratios.grossMargin}% &nbsp;·&nbsp;
      <b>هامش التشغيل:</b> ${ratios.operatingMargin}% &nbsp;·&nbsp;
      <b>هامش صافي الربح:</b> ${ratios.netMargin}%
    </div>` : "";

  const body = `
    ${REPORT_CSS}
    <div class="rpt-period">${period}</div>

    <div class="rpt-section">الإيرادات</div>
    <table class="rpt-tbl">
      ${revenueRows}
      <tr class="subtotal"><td colspan="2">إجمالي الإيرادات</td><td class="amt">${_amt(report.revenue.total)}</td></tr>
    </table>

    ${report.cogs.sections.length > 0 ? `
      <div class="rpt-section">تكلفة البضاعة المباعة</div>
      <table class="rpt-tbl">
        ${cogsHtml}
        <tr class="subtotal"><td colspan="2">إجمالي تكلفة البضاعة المباعة</td><td class="amt">${_amt(report.cogs.total, true)}</td></tr>
      </table>` : ""}

    <div class="rpt-grand ${report.grossProfit >= 0 ? "profit" : "loss"}">
      <div>${report.grossProfit >= 0 ? "مجمل الربح" : "مجمل الخسارة"}</div>
      <div class="amt-big">${_amt(Math.abs(report.grossProfit))}</div>
    </div>

    ${report.operatingExpenses.sections.length > 0 ? `
      <div class="rpt-section">المصروفات التشغيلية</div>
      <table class="rpt-tbl">
        ${opexHtml}
        <tr class="subtotal"><td colspan="2">إجمالي المصروفات التشغيلية</td><td class="amt">${_amt(report.operatingExpenses.total, true)}</td></tr>
      </table>` : ""}

    <div class="rpt-grand ${isProfit ? "profit" : "loss"}">
      <div>${isProfit ? "✓ صافي الربح" : "⚠ صافي الخسارة"}</div>
      <div class="amt-big">${_amt(Math.abs(report.netIncome))}</div>
    </div>

    ${ratioLine}
    ${_signatures}
  `;
  printPage("قائمة الدخل — "+period, body, configInfo);
}

/* ═══ Balance Sheet print ═══ */

export function printBalanceSheet(report, configInfo){
  const period = `كما في تاريخ ${report.asOf}`;

  const renderSection = (section) => {
    if(section.groups.length === 0) return `<tr><td colspan="3" class="empty">لا توجد حركة</td></tr>`;
    return section.groups.map(g => `
      <tr class="subtotal"><td class="code">${g.code}</td><td class="name">${g.name}</td><td class="amt">${_amt(g.total)}</td></tr>
      ${g.items.map(i => `<tr class="indent"><td class="code">${i.code}</td><td class="name">${i.name}</td><td class="amt">${_amt(i.balance, i.balance < 0)}</td></tr>`).join("")}
    `).join("");
  };

  const body = `
    ${REPORT_CSS}
    <div class="rpt-period">${period}</div>

    <div class="rpt-section">الأصول</div>

    <div class="rpt-subhead">الأصول المتداولة</div>
    <table class="rpt-tbl">
      ${renderSection(report.assets.current)}
      <tr class="subtotal"><td colspan="2">إجمالي الأصول المتداولة</td><td class="amt">${_amt(report.assets.current.total)}</td></tr>
    </table>

    ${report.assets.nonCurrent.groups.length > 0 ? `
      <div class="rpt-subhead">الأصول غير المتداولة</div>
      <table class="rpt-tbl">
        ${renderSection(report.assets.nonCurrent)}
        <tr class="subtotal"><td colspan="2">إجمالي الأصول غير المتداولة</td><td class="amt">${_amt(report.assets.nonCurrent.total)}</td></tr>
      </table>` : ""}

    <table class="rpt-tbl">
      <tr class="total"><td colspan="2">إجمالي الأصول</td><td class="amt">${_amt(report.assets.total)}</td></tr>
    </table>

    <div class="rpt-section">الخصوم وحقوق الملكية</div>

    ${report.liabilities.current.groups.length > 0 ? `
      <div class="rpt-subhead">الخصوم المتداولة</div>
      <table class="rpt-tbl">
        ${renderSection(report.liabilities.current)}
        <tr class="subtotal"><td colspan="2">إجمالي الخصوم المتداولة</td><td class="amt">${_amt(report.liabilities.current.total)}</td></tr>
      </table>` : ""}

    ${report.liabilities.nonCurrent.groups.length > 0 ? `
      <div class="rpt-subhead">الخصوم غير المتداولة</div>
      <table class="rpt-tbl">
        ${renderSection(report.liabilities.nonCurrent)}
        <tr class="subtotal"><td colspan="2">إجمالي الخصوم غير المتداولة</td><td class="amt">${_amt(report.liabilities.nonCurrent.total)}</td></tr>
      </table>` : ""}

    <table class="rpt-tbl">
      <tr class="subtotal"><td colspan="2">إجمالي الخصوم</td><td class="amt">${_amt(report.liabilities.total)}</td></tr>
    </table>

    <div class="rpt-subhead">حقوق الملكية</div>
    <table class="rpt-tbl">
      ${report.equity.items.map(i => `<tr class="indent"><td class="code">${i.code}</td><td class="name">${i.name}</td><td class="amt">${_amt(i.balance, i.balance < 0)}</td></tr>`).join("")}
      <tr class="indent"><td class="code">—</td><td class="name">صافي ربح/خسارة الفترة</td><td class="amt">${_amt(report.equity.currentPeriodNetIncome, report.equity.currentPeriodNetIncome < 0)}</td></tr>
      <tr class="subtotal"><td colspan="2">إجمالي حقوق الملكية</td><td class="amt">${_amt(report.equity.total)}</td></tr>
    </table>

    <table class="rpt-tbl">
      <tr class="total"><td colspan="2">إجمالي الخصوم وحقوق الملكية</td><td class="amt">${_amt(report.totalLiabilitiesEquity)}</td></tr>
    </table>

    <div class="rpt-grand ${report.isBalanced ? "profit" : "loss"}">
      <div>${report.isBalanced ? "✓ القائمة متوازنة (الأصول = الخصوم + حقوق الملكية)" : "⚠ القائمة غير متوازنة"}</div>
      <div class="amt-big">${report.isBalanced ? "✓" : _amt(Math.abs(report.discrepancy))}</div>
    </div>

    ${_signatures}
  `;
  printPage("قائمة المركز المالي — "+period, body, configInfo);
}

/* ═══ Cash Flow print ═══ */

export function printCashFlow(report, configInfo){
  const period = `الفترة من ${report.period.from} إلى ${report.period.to}`;

  const renderBucket = (b) => b.groups.length === 0
    ? `<tr><td colspan="3" class="empty">لا توجد حركة</td></tr>`
    : b.groups.map(g => `
        <tr><td class="code">${g.accountCode||"—"}</td><td class="name">${g.accountName||"غير محدد"} ${g.count>1?`<span style="color:#94A3B8">×${g.count}</span>`:""}</td><td class="amt">${_amt(g.total, g.total < 0)}</td></tr>
      `).join("");

  const body = `
    ${REPORT_CSS}
    <div class="rpt-period">${period}</div>

    <div class="rpt-section">الأنشطة التشغيلية</div>
    <table class="rpt-tbl">
      ${renderBucket(report.operating)}
      <tr class="subtotal"><td colspan="2">صافي التدفق من الأنشطة التشغيلية</td><td class="amt">${_amt(report.operating.net, report.operating.net < 0)}</td></tr>
    </table>

    ${report.investing.groups.length > 0 ? `
      <div class="rpt-section">الأنشطة الاستثمارية</div>
      <table class="rpt-tbl">
        ${renderBucket(report.investing)}
        <tr class="subtotal"><td colspan="2">صافي التدفق من الأنشطة الاستثمارية</td><td class="amt">${_amt(report.investing.net, report.investing.net < 0)}</td></tr>
      </table>` : ""}

    ${report.financing.groups.length > 0 ? `
      <div class="rpt-section">الأنشطة التمويلية</div>
      <table class="rpt-tbl">
        ${renderBucket(report.financing)}
        <tr class="subtotal"><td colspan="2">صافي التدفق من الأنشطة التمويلية</td><td class="amt">${_amt(report.financing.net, report.financing.net < 0)}</td></tr>
      </table>` : ""}

    <table class="rpt-tbl">
      <tr><td colspan="2">رصيد النقدية في بداية الفترة</td><td class="amt">${_amt(report.beginningCash)}</td></tr>
      <tr class="subtotal"><td colspan="2">صافي التغير في النقدية</td><td class="amt">${_amt(report.netCashChange, report.netCashChange < 0)}</td></tr>
      <tr class="total"><td colspan="2">رصيد النقدية في نهاية الفترة</td><td class="amt">${_amt(report.endingCash)}</td></tr>
    </table>

    ${_signatures}
  `;
  printPage("قائمة التدفقات النقدية — "+period, body, configInfo);
}

/* ═══ Party Statement print (V18.39) ═══ */

export function printPartyStatement(report, partyType, partyName, configInfo){
  const period = (report.totals && (report.totals.openingBalance !== undefined))
    ? `الفترة من ${report.fromDate || "البداية"} إلى ${report.toDate || "اليوم"}`
    : "كشف الحساب الكامل";

  const partyTypeLabel = partyType === "customer" ? "عميل" : partyType === "workshop" ? "ورشة" : partyType === "employee" ? "موظف" : "طرف";
  const balanceLabel = report.isAssetParty ? "(مدين له)" : "(دائن له)";

  const rows = report.lines.length === 0
    ? `<tr><td colspan="6" class="empty">لا توجد حركات في الفترة المحددة</td></tr>`
    : report.lines.map(l => `
        <tr>
          <td style="font-family:monospace;width:80px">${l.date}</td>
          <td style="font-family:monospace;color:#0EA5E9;font-weight:700;width:90px">${l.refNo||"—"}</td>
          <td>
            <div>${l.narration||"—"}</div>
            ${l.note ? `<div style="color:#94A3B8;font-size:9px;margin-top:2px">${l.note}</div>` : ""}
            <div style="color:#64748B;font-size:9px;margin-top:2px"><span style="font-family:monospace">${l.accountCode}</span> ${l.accountName}</div>
          </td>
          <td class="amt" style="width:90px;color:${l.debit>0?'#10B981':'#94A3B8'}">${l.debit>0 ? _amt(l.debit) : '—'}</td>
          <td class="amt" style="width:90px;color:${l.credit>0?'#EF4444':'#94A3B8'}">${l.credit>0 ? _amt(l.credit) : '—'}</td>
          <td class="amt" style="width:100px;font-weight:700;color:${l.runningBalance >= 0 ? '#0EA5E9' : '#EF4444'}">${_amt(Math.abs(l.runningBalance))}</td>
        </tr>`).join("");

  const body = `
    ${REPORT_CSS}
    <div class="rpt-period">
      <div style="font-size:14pt;font-weight:800;margin-bottom:4px">${partyTypeLabel}: ${partyName}</div>
      <div>${period}</div>
    </div>

    ${(report.totals.openingBalance||0) !== 0 ? `
      <div style="margin-bottom:10px;padding:8px 14px;background:#F8FAFC;border-radius:6px;border:1px solid #E2E8F0">
        <span style="font-weight:700">الرصيد الافتتاحي:</span>
        <span style="direction:ltr;font-family:monospace;margin-inline-start:8px">${_amt(Math.abs(report.totals.openingBalance))}</span>
        <span style="margin-inline-start:6px;color:#64748B;font-size:10px">${report.totals.openingBalance >= 0 ? balanceLabel : '(دائن له)'}</span>
      </div>` : ""}

    <table class="rpt-tbl">
      <thead>
        <tr style="background:#F1F5F9;border-bottom:2px solid #94A3B8">
          <th style="padding:6px 10px;text-align:right;font-size:10pt;font-weight:800">التاريخ</th>
          <th style="padding:6px 10px;text-align:right;font-size:10pt;font-weight:800">المرجع</th>
          <th style="padding:6px 10px;text-align:right;font-size:10pt;font-weight:800">البيان</th>
          <th style="padding:6px 10px;text-align:left;font-size:10pt;font-weight:800;direction:ltr">مدين</th>
          <th style="padding:6px 10px;text-align:left;font-size:10pt;font-weight:800;direction:ltr">دائن</th>
          <th style="padding:6px 10px;text-align:left;font-size:10pt;font-weight:800;direction:ltr">الرصيد</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr class="subtotal">
          <td colspan="3" style="font-weight:800">الإجمالي</td>
          <td class="amt" style="font-weight:800;color:#10B981">${_amt(report.totals.debit)}</td>
          <td class="amt" style="font-weight:800;color:#EF4444">${_amt(report.totals.credit)}</td>
          <td class="amt" style="font-weight:800;color:${report.totals.balance >= 0 ? '#0EA5E9' : '#EF4444'}">${_amt(Math.abs(report.totals.balance))}</td>
        </tr>
      </tfoot>
    </table>

    <div class="rpt-grand ${report.totals.balance >= 0 ? 'profit' : 'loss'}">
      <div>الرصيد النهائي ${balanceLabel}</div>
      <div class="amt-big">${_amt(Math.abs(report.totals.balance))}</div>
    </div>

    <div style="margin-top:14px;padding:10px 14px;background:#F8FAFC;border-radius:6px;font-size:10pt;color:#475569;border:1px solid #E2E8F0">
      💡 هذا الكشف مولّد من القيود المحاسبية مباشرة — يعكس الحركة الفعلية بعد كل التسويات والقيود اليدوية.
    </div>

    ${_signatures}
  `;
  printPage(`كشف حساب ${partyTypeLabel} — ${partyName}`, body, configInfo);
}
