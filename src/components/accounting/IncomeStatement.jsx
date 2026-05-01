/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · Income Statement (Profit & Loss)
   ───────────────────────────────────────────────────────────────────────
   Displays the income statement for a date range, with click-through to
   account ledger and a print button.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useMemo } from "react";
import { Btn, Card, Inp } from "../ui.jsx";
import { readDayRange } from "../../utils/accounting/dayDoc.js";
import { buildIncomeStatement } from "../../utils/accounting/financialStatements.js";
import { getAccountLedger } from "../../utils/accounting/aggregate.js";
import { fmt } from "../../utils/format.js";
import { printIncomeStatement } from "./reportPrint.js";

export function IncomeStatement({coa, configInfo, T, FS, isMob, showToast}){
  const today = new Date().toISOString().split("T")[0];
  const monthStart = today.slice(0,7) + "-01";
  const [from, setFrom]   = useState(monthStart);
  const [to, setTo]       = useState(today);
  const [days, setDays]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [drillAcct, setDrillAcct] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const result = await readDayRange(from, to);
      /* V18.37: filter out closing entries from IS — including a closure
         would cancel out all revenue and expense balances, making the IS
         show zeros after a period is closed. The closure is for BS purposes
         only (it transfers net income to retained earnings). */
      const filtered = (result||[]).map(d => ({
        ...d,
        entries: (d.entries||[]).filter(e =>
          e.sourceType !== "closing_entry" && e.sourceType !== "closing_entry:reversal"
        ),
      }));
      setDays(filtered);
    } catch(e){
      console.error("[CLARK accounting] IS load failed:", e);
      showToast("⚠️ فشل تحميل البيانات");
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const report = useMemo(() => buildIncomeStatement(coa, days, {from, to}), [coa, days, from, to]);
  const ledger = useMemo(() => drillAcct ? getAccountLedger(coa, days, drillAcct) : null, [drillAcct, coa, days]);

  /* Compact preset buttons */
  const presets = [
    {label:"الشهر", from: monthStart, to: today},
    {label:"الربع الأخير", from: ((d)=>{const x=new Date(d);x.setMonth(x.getMonth()-3);return x.toISOString().split("T")[0]})(today), to: today},
    {label:"السنة", from: today.slice(0,4)+"-01-01", to: today},
  ];

  const _row = (label, amount, opts) => {
    const isNeg = (opts?.signed && amount < 0);
    const showAmt = Math.abs(amount) < 0.005 ? "—" : fmt(Math.abs(amount).toFixed(2));
    return <div style={{display:"flex", justifyContent:"space-between", padding: opts?.indent ? "5px 14px 5px 28px" : "8px 14px",
      background: opts?.subtotal ? T.bg : "transparent",
      borderTop: opts?.subtotal ? "1px solid "+T.brd : "none",
      borderBottom: opts?.subtotal ? "1px solid "+T.brd : (opts?.indent ? "1px dotted "+T.brd : "none"),
      fontWeight: opts?.subtotal ? 800 : (opts?.indent ? 500 : 700),
      color: opts?.subtotal ? T.text : (opts?.indent ? T.textSec : T.text),
      fontSize: opts?.indent ? FS-1 : FS,
      cursor: opts?.onClick ? "pointer" : "default",
    }} onClick={opts?.onClick}>
      <span>{label}</span>
      <span style={{direction:"ltr", fontFamily:"monospace", color: isNeg?T.err:undefined}}>{isNeg?"("+showAmt+")":showAmt}</span>
    </div>;
  };

  return <Card title="📊 قائمة الدخل" style={{marginBottom:16}}>
    {/* Filter bar */}
    <div style={{display:"flex", flexWrap:"wrap", gap:8, alignItems:"center", marginBottom:14}}>
      <label style={{fontSize:FS-2, color:T.textSec, fontWeight:700}}>من:</label>
      <Inp type="date" value={from} onChange={setFrom} style={{maxWidth:160}}/>
      <label style={{fontSize:FS-2, color:T.textSec, fontWeight:700}}>إلى:</label>
      <Inp type="date" value={to} onChange={setTo} style={{maxWidth:160}}/>
      {presets.map(p => <Btn key={p.label} ghost small onClick={() => {setFrom(p.from);setTo(p.to);setTimeout(load,50);}}>{p.label}</Btn>)}
      <Btn primary onClick={load} disabled={loading}>{loading ? "⏳" : "🔄 تحديث"}</Btn>
      <div style={{flex:1}}/>
      <Btn ghost onClick={() => printIncomeStatement(report, configInfo)} disabled={loading}>🖨 طباعة / PDF</Btn>
    </div>

    {loading ? <div style={{padding:30, textAlign:"center", color:T.textMut}}>⏳ جاري الحساب...</div>
    : <div style={{border:"1px solid "+T.brd, borderRadius:8, overflow:"hidden", background:T.cardSolid}}>
        {/* Revenue */}
        <div style={{padding:"10px 14px", background:T.ok+"08", borderBottom:"2px solid "+T.ok, fontSize:FS, fontWeight:800, color:T.ok}}>الإيرادات</div>
        {report.revenue.items.length === 0
          ? <div style={{padding:14, textAlign:"center", color:T.textMut, fontStyle:"italic"}}>لا توجد إيرادات في هذه الفترة</div>
          : report.revenue.items.map(r => <div key={r.id}>{_row(<><span style={{fontFamily:"monospace", color:T.accent, fontWeight:700, marginInlineEnd:8}}>{r.code}</span>{r.name}</>, r.balance, {indent:true, signed:true, onClick: () => setDrillAcct(r.id)})}</div>)}
        {_row("إجمالي الإيرادات", report.revenue.total, {subtotal:true})}

        {/* COGS */}
        {report.cogs.sections.length > 0 && <>
          <div style={{padding:"10px 14px", background:T.warn+"08", borderTop:"1px solid "+T.brd, borderBottom:"2px solid "+T.warn, fontSize:FS, fontWeight:800, color:T.warn}}>تكلفة البضاعة المباعة</div>
          {report.cogs.sections.map(sec => <div key={sec.code}>
            {_row(sec.label, sec.total, {subtotal:true, signed:true})}
            {sec.items.map(it => <div key={it.id}>{_row(<><span style={{fontFamily:"monospace", color:T.accent, fontWeight:700, marginInlineEnd:8}}>{it.code}</span>{it.name}</>, it.balance, {indent:true, onClick: () => setDrillAcct(it.id)})}</div>)}
          </div>)}
          {_row("إجمالي تكلفة البضاعة المباعة", report.cogs.total, {subtotal:true, signed:true})}
        </>}

        {/* Gross Profit */}
        <div style={{padding:"14px 18px", background: report.grossProfit>=0 ? T.ok+"15" : T.err+"15", borderTop:"2px solid "+(report.grossProfit>=0?T.ok:T.err), borderBottom:"2px solid "+(report.grossProfit>=0?T.ok:T.err), display:"flex", justifyContent:"space-between", alignItems:"center"}}>
          <span style={{fontSize:FS+1, fontWeight:800, color:report.grossProfit>=0?T.ok:T.err}}>{report.grossProfit>=0?"مجمل الربح":"مجمل الخسارة"}</span>
          <span style={{fontSize:FS+2, fontWeight:800, direction:"ltr", fontFamily:"monospace", color:report.grossProfit>=0?T.ok:T.err}}>{fmt(Math.abs(report.grossProfit).toFixed(2))}</span>
        </div>

        {/* Operating Expenses */}
        {report.operatingExpenses.sections.length > 0 && <>
          <div style={{padding:"10px 14px", background:T.err+"08", borderBottom:"2px solid "+T.err, fontSize:FS, fontWeight:800, color:T.err}}>المصروفات التشغيلية</div>
          {report.operatingExpenses.sections.map(sec => <div key={sec.code}>
            {_row(sec.label, sec.total, {subtotal:true, signed:true})}
            {sec.items.map(it => <div key={it.id}>{_row(<><span style={{fontFamily:"monospace", color:T.accent, fontWeight:700, marginInlineEnd:8}}>{it.code}</span>{it.name}</>, it.balance, {indent:true, onClick: () => setDrillAcct(it.id)})}</div>)}
          </div>)}
          {_row("إجمالي المصروفات التشغيلية", report.operatingExpenses.total, {subtotal:true, signed:true})}
        </>}

        {/* Net Income */}
        <div style={{padding:"18px 20px", background: report.netIncome>=0 ? "linear-gradient(135deg, "+T.ok+"22, "+T.ok+"08)" : "linear-gradient(135deg, "+T.err+"22, "+T.err+"08)", borderTop:"3px double "+(report.netIncome>=0?T.ok:T.err), display:"flex", justifyContent:"space-between", alignItems:"center"}}>
          <span style={{fontSize:FS+3, fontWeight:800, color:report.netIncome>=0?T.ok:T.err}}>
            {report.netIncome>=0?"✓ صافي الربح":"⚠ صافي الخسارة"}
          </span>
          <span style={{fontSize:FS+5, fontWeight:800, direction:"ltr", fontFamily:"monospace", color:report.netIncome>=0?T.ok:T.err}}>{fmt(Math.abs(report.netIncome).toFixed(2))}</span>
        </div>

        {/* Margin ratios */}
        {report.ratios.grossMargin != null && <div style={{padding:"10px 14px", background:T.bg, borderTop:"1px solid "+T.brd, fontSize:FS-2, color:T.textSec, display:"flex", flexWrap:"wrap", gap:14, justifyContent:"center"}}>
          <span>📈 <b style={{color:T.text}}>هامش مجمل الربح:</b> {report.ratios.grossMargin}%</span>
          <span>⚙️ <b style={{color:T.text}}>هامش التشغيل:</b> {report.ratios.operatingMargin}%</span>
          <span>💰 <b style={{color:T.text}}>هامش صافي الربح:</b> {report.ratios.netMargin}%</span>
        </div>}
      </div>}

    {/* Drill-down ledger */}
    {ledger && ledger.account && <div className="pop-overlay" style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:10001, display:"flex", alignItems:"center", justifyContent:"center", padding:16}} onClick={() => setDrillAcct(null)}>
      <div onClick={e => e.stopPropagation()} style={{background:T.cardSolid, borderRadius:14, padding:isMob?14:20, width:"100%", maxWidth:1000, maxHeight:"90vh", overflowY:"auto", border:"1px solid "+T.brd, boxShadow:"0 25px 70px rgba(0,0,0,0.4)"}}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14}}>
          <div>
            <div style={{fontSize:FS-2, color:T.textSec}}>📒 حركة الحساب</div>
            <div style={{fontSize:FS+1, fontWeight:800, color:T.text}}>
              <span style={{fontFamily:"monospace", color:T.accent, marginInlineEnd:8}}>{ledger.account.code}</span>{ledger.account.name}
            </div>
          </div>
          <Btn ghost small onClick={() => setDrillAcct(null)}>✕</Btn>
        </div>
        <div style={{overflowX:"auto", border:"1px solid "+T.brd, borderRadius:8}}>
          <table style={{width:"100%", borderCollapse:"collapse", fontSize:FS-2}}>
            <thead><tr style={{background:T.accent+"08"}}>
              <th style={{padding:"8px 10px", textAlign:"right", color:T.textSec, fontWeight:800}}>التاريخ</th>
              <th style={{padding:"8px 10px", textAlign:"right", color:T.textSec, fontWeight:800}}>المرجع</th>
              <th style={{padding:"8px 10px", textAlign:"right", color:T.textSec, fontWeight:800}}>البيان</th>
              <th style={{padding:"8px 10px", textAlign:"center", color:T.textSec, fontWeight:800, width:110}}>مدين</th>
              <th style={{padding:"8px 10px", textAlign:"center", color:T.textSec, fontWeight:800, width:110}}>دائن</th>
            </tr></thead>
            <tbody>{ledger.lines.map((l,i) => <tr key={i} style={{borderTop:"1px solid "+T.brd}}>
              <td style={{padding:"7px 10px", fontFamily:"monospace"}}>{l.date}</td>
              <td style={{padding:"7px 10px", fontFamily:"monospace", color:T.accent, fontWeight:700}}>{l.refNo}</td>
              <td style={{padding:"7px 10px"}}>{l.narration}</td>
              <td style={{padding:"7px 10px", textAlign:"center", direction:"ltr", color:l.debit>0?T.ok:T.textMut, fontWeight:l.debit>0?700:400}}>{l.debit>0 ? fmt(l.debit.toFixed(2)) : "—"}</td>
              <td style={{padding:"7px 10px", textAlign:"center", direction:"ltr", color:l.credit>0?T.err:T.textMut, fontWeight:l.credit>0?700:400}}>{l.credit>0 ? fmt(l.credit.toFixed(2)) : "—"}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>}
  </Card>;
}
