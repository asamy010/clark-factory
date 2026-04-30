/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · Balance Sheet (Statement of Financial Position)
   ───────────────────────────────────────────────────────────────────────
   Displays Assets / Liabilities / Equity as of a single date, grouped by
   current vs non-current. Auto-balances by computing net income from
   revenue/expense accounts up to the as-of-date.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useMemo } from "react";
import { Btn, Card, Inp } from "../ui.jsx";
import { readDayRange } from "../../utils/accounting/dayDoc.js";
import { buildBalanceSheet } from "../../utils/accounting/financialStatements.js";
import { fmt } from "../../utils/format.js";
import { printBalanceSheet } from "./reportPrint.js";

export function BalanceSheet({coa, configInfo, T, FS, isMob, showToast}){
  const today = new Date().toISOString().split("T")[0];
  const yearAgo = (() => {const d = new Date(today); d.setFullYear(d.getFullYear()-5); return d.toISOString().split("T")[0];})();
  const [asOf, setAsOf]   = useState(today);
  const [days, setDays]   = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      /* For BS we need everything from the earliest entry to as-of-date.
         We use 5 years back as a safe upper bound. */
      const result = await readDayRange(yearAgo, asOf);
      setDays(result);
    } catch(e){
      console.error("[CLARK accounting] BS load failed:", e);
      showToast("⚠️ فشل تحميل البيانات");
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const report = useMemo(() => buildBalanceSheet(coa, days, asOf), [coa, days, asOf]);

  const _row = (codeOrIcon, label, amount, opts) => {
    const isNeg = (opts?.signed && amount < 0);
    const showAmt = Math.abs(amount) < 0.005 ? "—" : fmt(Math.abs(amount).toFixed(2));
    return <div style={{display:"flex", justifyContent:"space-between", alignItems:"center",
      padding: opts?.indent ? "5px 14px 5px 28px" : "8px 14px",
      background: opts?.subtotal ? T.bg : "transparent",
      borderTop: opts?.subtotal ? "1px solid "+T.brd : "none",
      borderBottom: opts?.subtotal ? "1px solid "+T.brd : (opts?.indent ? "1px dotted "+T.brd : "none"),
      fontWeight: opts?.subtotal ? 800 : (opts?.indent ? 500 : 700),
      color: opts?.subtotal ? T.text : (opts?.indent ? T.textSec : T.text),
      fontSize: opts?.indent ? FS-1 : FS,
    }}>
      <span style={{display:"flex", alignItems:"center", gap:8}}>
        {codeOrIcon && <span style={{fontFamily:"monospace", color:T.accent, fontWeight:700}}>{codeOrIcon}</span>}
        <span>{label}</span>
      </span>
      <span style={{direction:"ltr", fontFamily:"monospace", color: isNeg?T.err:undefined}}>{isNeg?"("+showAmt+")":showAmt}</span>
    </div>;
  };

  const renderSubtree = (section) => section.groups.length === 0
    ? <div style={{padding:14, textAlign:"center", color:T.textMut, fontStyle:"italic", fontSize:FS-1}}>لا توجد حركة</div>
    : <>{section.groups.map(g => <div key={g.code}>
        {_row(g.code, g.name, g.total, {subtotal:true})}
        {g.items.map(i => <div key={i.id}>{_row(i.code, i.name, i.balance, {indent:true, signed:true})}</div>)}
      </div>)}</>;

  return <Card title="🏛️ قائمة المركز المالي" style={{marginBottom:16}}>
    {/* Filter bar */}
    <div style={{display:"flex", flexWrap:"wrap", gap:8, alignItems:"center", marginBottom:14}}>
      <label style={{fontSize:FS-2, color:T.textSec, fontWeight:700}}>كما في تاريخ:</label>
      <Inp type="date" value={asOf} onChange={setAsOf} style={{maxWidth:160}}/>
      <Btn ghost small onClick={() => {setAsOf(today);setTimeout(load,50);}}>اليوم</Btn>
      <Btn ghost small onClick={() => {const eom=new Date(today.slice(0,7)+"-01");eom.setMonth(eom.getMonth()+1);eom.setDate(0);setAsOf(eom.toISOString().split("T")[0]);setTimeout(load,50);}}>آخر الشهر</Btn>
      <Btn ghost small onClick={() => {setAsOf(today.slice(0,4)+"-12-31");setTimeout(load,50);}}>آخر السنة</Btn>
      <Btn primary onClick={load} disabled={loading}>{loading ? "⏳" : "🔄 تحديث"}</Btn>
      <div style={{flex:1}}/>
      <Btn ghost onClick={() => printBalanceSheet(report, configInfo)} disabled={loading}>🖨 طباعة / PDF</Btn>
    </div>

    {loading ? <div style={{padding:30, textAlign:"center", color:T.textMut}}>⏳ جاري الحساب...</div>
    : <div style={{display:"grid", gridTemplateColumns: isMob ? "1fr" : "1fr 1fr", gap:14}}>

        {/* ASSETS column */}
        <div style={{border:"2px solid "+T.accent+"40", borderRadius:8, overflow:"hidden", background:T.cardSolid}}>
          <div style={{padding:"12px 16px", background:T.accent+"15", borderBottom:"2px solid "+T.accent, fontSize:FS+1, fontWeight:800, color:T.accent, textAlign:"center"}}>
            🏛️ الأصول
          </div>

          <div style={{padding:"8px 14px", background:T.bg, borderBottom:"1px solid "+T.brd, fontSize:FS-1, fontWeight:800, color:T.textSec}}>
            متداولة
          </div>
          {renderSubtree(report.assets.current)}
          {_row(null, "إجمالي الأصول المتداولة", report.assets.current.total, {subtotal:true})}

          {report.assets.nonCurrent.groups.length > 0 && <>
            <div style={{padding:"8px 14px", background:T.bg, borderBottom:"1px solid "+T.brd, fontSize:FS-1, fontWeight:800, color:T.textSec, marginTop:8}}>
              غير متداولة
            </div>
            {renderSubtree(report.assets.nonCurrent)}
            {_row(null, "إجمالي الأصول غير المتداولة", report.assets.nonCurrent.total, {subtotal:true})}
          </>}

          {/* Total Assets */}
          <div style={{padding:"14px 18px", background:T.accent+"22", borderTop:"3px double "+T.accent, display:"flex", justifyContent:"space-between", alignItems:"center"}}>
            <span style={{fontSize:FS+1, fontWeight:800, color:T.accent}}>إجمالي الأصول</span>
            <span style={{fontSize:FS+3, fontWeight:800, direction:"ltr", fontFamily:"monospace", color:T.accent}}>{fmt(report.assets.total.toFixed(2))}</span>
          </div>
        </div>

        {/* LIAB + EQUITY column */}
        <div style={{border:"2px solid "+T.warn+"40", borderRadius:8, overflow:"hidden", background:T.cardSolid}}>
          <div style={{padding:"12px 16px", background:T.warn+"15", borderBottom:"2px solid "+T.warn, fontSize:FS+1, fontWeight:800, color:T.warn, textAlign:"center"}}>
            ⚖️ الخصوم وحقوق الملكية
          </div>

          {/* Liabilities */}
          {report.liabilities.current.groups.length > 0 && <>
            <div style={{padding:"8px 14px", background:T.bg, borderBottom:"1px solid "+T.brd, fontSize:FS-1, fontWeight:800, color:T.textSec}}>الخصوم المتداولة</div>
            {renderSubtree(report.liabilities.current)}
            {_row(null, "إجمالي الخصوم المتداولة", report.liabilities.current.total, {subtotal:true})}
          </>}

          {report.liabilities.nonCurrent.groups.length > 0 && <>
            <div style={{padding:"8px 14px", background:T.bg, borderBottom:"1px solid "+T.brd, fontSize:FS-1, fontWeight:800, color:T.textSec, marginTop:8}}>الخصوم غير المتداولة</div>
            {renderSubtree(report.liabilities.nonCurrent)}
            {_row(null, "إجمالي الخصوم غير المتداولة", report.liabilities.nonCurrent.total, {subtotal:true})}
          </>}

          {report.liabilities.total > 0 && <div style={{padding:"10px 14px", background:T.warn+"15", borderTop:"1px solid "+T.warn, borderBottom:"1px solid "+T.warn, display:"flex", justifyContent:"space-between", fontWeight:800, color:T.warn}}>
            <span>إجمالي الخصوم</span>
            <span style={{direction:"ltr", fontFamily:"monospace", fontSize:FS+1}}>{fmt(report.liabilities.total.toFixed(2))}</span>
          </div>}

          {/* Equity */}
          <div style={{padding:"8px 14px", background:T.bg, borderBottom:"1px solid "+T.brd, fontSize:FS-1, fontWeight:800, color:T.textSec, marginTop:8}}>حقوق الملكية</div>
          {report.equity.items.map(i => <div key={i.id}>{_row(i.code, i.name, i.balance, {indent:true, signed:true})}</div>)}
          {_row("—", "صافي ربح/خسارة الفترة", report.equity.currentPeriodNetIncome, {indent:true, signed:true})}
          {_row(null, "إجمالي حقوق الملكية", report.equity.total, {subtotal:true})}

          {/* Total */}
          <div style={{padding:"14px 18px", background:T.warn+"22", borderTop:"3px double "+T.warn, display:"flex", justifyContent:"space-between", alignItems:"center"}}>
            <span style={{fontSize:FS+1, fontWeight:800, color:T.warn}}>إجمالي الخصوم وحقوق الملكية</span>
            <span style={{fontSize:FS+3, fontWeight:800, direction:"ltr", fontFamily:"monospace", color:T.warn}}>{fmt(report.totalLiabilitiesEquity.toFixed(2))}</span>
          </div>
        </div>
      </div>}

    {!loading && <div style={{marginTop:14, padding:"12px 16px", borderRadius:8, background: report.isBalanced ? T.ok+"10" : T.err+"10", border:"2px solid "+(report.isBalanced ? T.ok : T.err), display:"flex", justifyContent:"space-between", alignItems:"center"}}>
      <span style={{fontSize:FS+1, fontWeight:800, color:report.isBalanced?T.ok:T.err}}>
        {report.isBalanced ? "✓ القائمة متوازنة (الأصول = الخصوم + حقوق الملكية)" : "⚠ القائمة غير متوازنة"}
      </span>
      {!report.isBalanced && <span style={{fontSize:FS, fontWeight:800, color:T.err, direction:"ltr", fontFamily:"monospace"}}>الفرق: {fmt(Math.abs(report.discrepancy).toFixed(2))}</span>}
    </div>}
  </Card>;
}
