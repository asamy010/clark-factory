/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · AgingReportTab (V18.54)
   ───────────────────────────────────────────────────────────────────────
   Two reports side by side:
     1. Receivables Aging — مستحقات العملاء
     2. Payables Aging    — مستحقات الموردين والورش

   Each shows a table grouped by party with 5 buckets:
     Current / 0-30 / 31-60 / 61-90 / 90+
   Plus a totals row.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useMemo } from "react";
import { Btn, Card, Inp } from "../ui.jsx";
import { readDayRange } from "../../utils/accounting/dayDoc.js";
import { buildAgingReport } from "../../utils/accounting/aging.js";
import { fmt } from "../../utils/format.js";
import { openPrintWindow } from "../../utils/print.js";
import { PRINT_CSS } from "../../constants/index.js";

export function AgingReportTab({data, T, FS, isMob, showToast}){
  const today = new Date().toISOString().split("T")[0];
  const earliest = (() => {const d = new Date(today); d.setFullYear(d.getFullYear()-5); return d.toISOString().split("T")[0];})();

  const [side, setSide]     = useState("receivable");/* "receivable" | "payable" */
  const [asOfDate, setAsOf] = useState(today);
  const [days, setDays]     = useState([]);
  const [loading, setLoad]  = useState(false);
  const [showZero, setShowZero] = useState(false);

  const load = async () => {
    setLoad(true);
    try {
      const result = await readDayRange(earliest, asOfDate);
      setDays(result || []);
    } catch(e){
      console.error("[CLARK aging] load failed:", e);
      showToast && showToast("⚠️ فشل تحميل البيانات");
    } finally { setLoad(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [asOfDate]);

  /* Flatten entries from days */
  const allEntries = useMemo(() => {
    const out = [];
    (days || []).forEach(day => {
      (day.entries || []).forEach(e => {
        if(!e.date) e._date = day.id;/* fallback */
        out.push({...e, date: e.date || day.id});
      });
    });
    return out;
  }, [days]);

  const report = useMemo(() => buildAgingReport(allEntries, asOfDate, side),
                         [allEntries, asOfDate, side]);

  const partiesView = showZero ? report.parties
    : report.parties.filter(p => Math.abs(p.grand) > 0.01);

  const sideLabel = side === "receivable" ? "العملاء (مدينون)" : "الموردين والورش (دائنون)";
  const sideIcon  = side === "receivable" ? "💰" : "🏭";
  const sideColor = side === "receivable" ? "#10B981" : "#F59E0B";

  const handlePrint = () => {
    const w = openPrintWindow();
    if(!w){ alert("المتصفح يمنع نوافذ الطباعة — فعّل النوافذ المنبثقة"); return; }
    const partyHeader = side === "receivable" ? "العميل" : "المورد / الورشة";
    const rowsHtml = partiesView.map(p =>
      `<tr>
        <td>${_esc(p.name)}</td>
        <td class="center">${fmt(p.current.toFixed(2))}</td>
        <td class="center">${fmt(p.b0_30.toFixed(2))}</td>
        <td class="center">${fmt(p.b31_60.toFixed(2))}</td>
        <td class="center">${fmt(p.b61_90.toFixed(2))}</td>
        <td class="center" style="color:#EF4444;font-weight:700">${fmt(p.b90_plus.toFixed(2))}</td>
        <td class="center" style="font-weight:800;background:#F8FAFC">${fmt(p.grand.toFixed(2))}</td>
      </tr>`).join("");
    const t = report.totals;
    const totalsRow = `<tr style="background:${sideColor}15;font-weight:800">
      <td>الإجمالي</td>
      <td class="center">${fmt(t.current.toFixed(2))}</td>
      <td class="center">${fmt(t.b0_30.toFixed(2))}</td>
      <td class="center">${fmt(t.b31_60.toFixed(2))}</td>
      <td class="center">${fmt(t.b61_90.toFixed(2))}</td>
      <td class="center" style="color:#EF4444">${fmt(t.b90_plus.toFixed(2))}</td>
      <td class="center" style="font-size:14px;color:${sideColor}">${fmt(t.grand.toFixed(2))}</td>
    </tr>`;
    const html = `<html dir="rtl"><head><meta charset="UTF-8"><title>تقرير تقادم الديون</title><style>${PRINT_CSS}.center{text-align:center}</style></head><body>
<div class="hdr"><div style="font-size:18px;font-weight:800;color:${sideColor}">${sideIcon} تقرير تقادم الديون — ${_esc(sideLabel)}</div><div class="hdr-info"><div>كما في: ${asOfDate}</div></div></div>
<table>
  <thead>
    <tr>
      <th>${partyHeader}</th>
      <th class="center">جاري</th>
      <th class="center">0-30 يوم</th>
      <th class="center">31-60 يوم</th>
      <th class="center">61-90 يوم</th>
      <th class="center" style="color:#EF4444">90+ يوم</th>
      <th class="center">الإجمالي</th>
    </tr>
  </thead>
  <tbody>${rowsHtml}${totalsRow}</tbody>
</table>
<div class="foot">CLARK ERP System — تقرير تقادم — تم الطباعة: ${new Date().toLocaleString("ar-EG")}</div>
<script>setTimeout(function(){window.print()},500)</script>
</body></html>`;
    w.document.write(html);
    w.document.close();
  };

  return <div style={{padding:isMob?12:0}}>
    {/* Side selector + asOf date */}
    <Card style={{marginBottom:14}}>
      <div style={{display:"grid", gridTemplateColumns:isMob?"1fr":"auto auto auto 1fr auto", gap:10, alignItems:"center", padding:8}}>
        <div style={{display:"flex", gap:6}}>
          <div onClick={() => setSide("receivable")} style={{padding:"8px 16px", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:FS, background:side==="receivable"?"#10B98115":"transparent", border:"2px solid "+(side==="receivable"?"#10B981":T.brd), color:side==="receivable"?"#10B981":T.textSec}}>💰 ذمم مدينة</div>
          <div onClick={() => setSide("payable")} style={{padding:"8px 16px", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:FS, background:side==="payable"?"#F59E0B15":"transparent", border:"2px solid "+(side==="payable"?"#F59E0B":T.brd), color:side==="payable"?"#F59E0B":T.textSec}}>🏭 ذمم دائنة</div>
        </div>
        <div>
          <label style={{fontSize:FS-3, color:T.textSec, fontWeight:600, display:"block", marginBottom:2}}>كما في تاريخ</label>
          <Inp type="date" value={asOfDate} onChange={setAsOf}/>
        </div>
        <label style={{display:"flex", alignItems:"center", gap:6, cursor:"pointer", fontSize:FS-1, color:T.textSec, fontWeight:600}}>
          <input type="checkbox" checked={showZero} onChange={e=>setShowZero(e.target.checked)}/>
          إظهار الأطراف بدون رصيد
        </label>
        <div></div>
        <Btn onClick={handlePrint} style={{background:T.accent+"12", color:T.accent, border:"1px solid "+T.accent+"30"}}>🖨️ طباعة</Btn>
      </div>
    </Card>

    {/* Summary cards */}
    <div style={{display:"grid", gridTemplateColumns:isMob?"repeat(2,1fr)":"repeat(6,1fr)", gap:8, marginBottom:14}}>
      {[
        {key:"current", label:"جاري", color:"#0EA5E9"},
        {key:"b0_30",   label:"0-30 يوم", color:"#10B981"},
        {key:"b31_60",  label:"31-60 يوم", color:"#F59E0B"},
        {key:"b61_90",  label:"61-90 يوم", color:"#F97316"},
        {key:"b90_plus",label:"90+ يوم", color:"#EF4444"},
        {key:"grand",   label:"الإجمالي", color:sideColor},
      ].map(b => <div key={b.key} style={{padding:10, background:b.color+"08", borderRadius:8, border:"1px solid "+b.color+"30", textAlign:"center"}}>
        <div style={{fontSize:FS-3, color:b.color, fontWeight:700}}>{b.label}</div>
        <div style={{fontSize:FS+2, fontWeight:800, color:b.color, direction:"ltr", marginTop:2}}>{fmt((report.totals[b.key]||0).toFixed(0))}</div>
      </div>)}
    </div>

    {loading && <div style={{padding:30, textAlign:"center", color:T.textMut}}>⏳ جارٍ التحميل...</div>}

    {!loading && partiesView.length === 0 && <Card>
      <div style={{padding:30, textAlign:"center", color:T.textMut, fontSize:FS-1}}>
        💡 لا توجد ذمم {side==="receivable"?"مدينة":"دائنة"} في هذا التاريخ.
      </div>
    </Card>}

    {!loading && partiesView.length > 0 && <Card title={`${sideIcon} ${sideLabel} — كما في ${asOfDate}`} accent={sideColor}>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%", borderCollapse:"collapse", fontSize:FS-1}}>
          <thead>
            <tr style={{background:T.bg}}>
              <th style={{padding:"10px 12px", textAlign:"right", color:T.textSec, fontWeight:800, fontSize:FS-2, borderBottom:"2px solid "+T.brd}}>{side==="receivable"?"العميل":"المورد / الورشة"}</th>
              <th style={{padding:"10px 8px", textAlign:"center", color:T.textSec, fontWeight:800, fontSize:FS-2, borderBottom:"2px solid "+T.brd}}>جاري</th>
              <th style={{padding:"10px 8px", textAlign:"center", color:T.textSec, fontWeight:800, fontSize:FS-2, borderBottom:"2px solid "+T.brd}}>0-30 يوم</th>
              <th style={{padding:"10px 8px", textAlign:"center", color:T.textSec, fontWeight:800, fontSize:FS-2, borderBottom:"2px solid "+T.brd}}>31-60 يوم</th>
              <th style={{padding:"10px 8px", textAlign:"center", color:T.textSec, fontWeight:800, fontSize:FS-2, borderBottom:"2px solid "+T.brd}}>61-90 يوم</th>
              <th style={{padding:"10px 8px", textAlign:"center", color:"#EF4444", fontWeight:800, fontSize:FS-2, borderBottom:"2px solid "+T.brd}}>90+ يوم</th>
              <th style={{padding:"10px 8px", textAlign:"center", color:T.textSec, fontWeight:800, fontSize:FS-2, borderBottom:"2px solid "+T.brd, background:T.bg}}>الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {partiesView.map(p => <tr key={p.id} style={{borderTop:"1px solid "+T.brd}}>
              <td style={{padding:"8px 12px", fontWeight:600, color:T.text}}>{p.name}</td>
              <td style={{padding:"8px 8px", textAlign:"center", direction:"ltr", color:T.textSec}}>{fmt(p.current.toFixed(0))}</td>
              <td style={{padding:"8px 8px", textAlign:"center", direction:"ltr", color:p.b0_30>0?"#10B981":T.textMut}}>{fmt(p.b0_30.toFixed(0))}</td>
              <td style={{padding:"8px 8px", textAlign:"center", direction:"ltr", color:p.b31_60>0?"#F59E0B":T.textMut}}>{fmt(p.b31_60.toFixed(0))}</td>
              <td style={{padding:"8px 8px", textAlign:"center", direction:"ltr", color:p.b61_90>0?"#F97316":T.textMut, fontWeight:p.b61_90>0?700:400}}>{fmt(p.b61_90.toFixed(0))}</td>
              <td style={{padding:"8px 8px", textAlign:"center", direction:"ltr", color:p.b90_plus>0?"#EF4444":T.textMut, fontWeight:p.b90_plus>0?800:400}}>{fmt(p.b90_plus.toFixed(0))}</td>
              <td style={{padding:"8px 8px", textAlign:"center", direction:"ltr", fontWeight:800, color:T.text, background:T.bg}}>{fmt(p.grand.toFixed(0))}</td>
            </tr>)}
            {/* Totals row */}
            <tr style={{borderTop:"2px solid "+T.brd, background:sideColor+"08"}}>
              <td style={{padding:"10px 12px", fontWeight:800, color:T.text}}>الإجمالي</td>
              <td style={{padding:"10px 8px", textAlign:"center", direction:"ltr", fontWeight:700, color:T.text}}>{fmt(report.totals.current.toFixed(0))}</td>
              <td style={{padding:"10px 8px", textAlign:"center", direction:"ltr", fontWeight:700, color:"#10B981"}}>{fmt(report.totals.b0_30.toFixed(0))}</td>
              <td style={{padding:"10px 8px", textAlign:"center", direction:"ltr", fontWeight:700, color:"#F59E0B"}}>{fmt(report.totals.b31_60.toFixed(0))}</td>
              <td style={{padding:"10px 8px", textAlign:"center", direction:"ltr", fontWeight:700, color:"#F97316"}}>{fmt(report.totals.b61_90.toFixed(0))}</td>
              <td style={{padding:"10px 8px", textAlign:"center", direction:"ltr", fontWeight:800, color:"#EF4444"}}>{fmt(report.totals.b90_plus.toFixed(0))}</td>
              <td style={{padding:"10px 8px", textAlign:"center", direction:"ltr", fontWeight:800, color:sideColor, fontSize:FS+1}}>{fmt(report.totals.grand.toFixed(0))}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{padding:"8px 12px", fontSize:FS-3, color:T.textMut, background:T.bg, borderTop:"1px solid "+T.brd}}>
        💡 الفترات محسوبة من تاريخ القيد. الـ"جاري" يعني قيود {asOfDate} (نفس اليوم). 90+ تعني ديون عمرها أكتر من 3 شهور.
      </div>
    </Card>}
  </div>;
}

function _esc(s){
  return String(s||"").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}
