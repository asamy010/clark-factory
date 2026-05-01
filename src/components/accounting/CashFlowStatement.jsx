/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · Cash Flow Statement
   ───────────────────────────────────────────────────────────────────────
   Direct-method cash flow showing inflows/outflows by activity bucket
   (Operating / Investing / Financing) for a date range.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useMemo } from "react";
import { Btn, Card, Inp } from "../ui.jsx";
import { readDayRange, toDayId } from "../../utils/accounting/dayDoc.js";
import { buildCashFlow } from "../../utils/accounting/financialStatements.js";
import { fmt } from "../../utils/format.js";
import { printCashFlow } from "./reportPrint.js";

export function CashFlowStatement({coa, configInfo, T, FS, isMob, showToast}){
  const today = new Date().toISOString().split("T")[0];
  const monthStart = today.slice(0,7) + "-01";
  const [from, setFrom] = useState(monthStart);
  const [to, setTo]     = useState(today);
  const [days, setDays] = useState([]);
  const [daysBefore, setDaysBefore] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      /* Load period entries */
      const periodResult = await readDayRange(from, to);
      setDays(periodResult);
      /* Load entries before the period (for beginning cash) — back 5 yrs */
      const beforeFrom = (() => {const d = new Date(from); d.setFullYear(d.getFullYear()-5); return toDayId(d);})();
      const beforeTo   = (() => {const d = new Date(from); d.setDate(d.getDate()-1); return toDayId(d);})();
      if(new Date(beforeTo) >= new Date(beforeFrom)){
        const beforeResult = await readDayRange(beforeFrom, beforeTo);
        setDaysBefore(beforeResult);
      } else {
        setDaysBefore([]);
      }
    } catch(e){
      console.error("[CLARK accounting] CF load failed:", e);
      showToast("⚠️ فشل تحميل البيانات");
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const report = useMemo(() => buildCashFlow(coa, days, {from, to}, daysBefore), [coa, days, daysBefore, from, to]);

  const renderBucket = (b, title, color) => {
    if(b.groups.length === 0) return <div style={{padding:14, textAlign:"center", color:T.textMut, fontStyle:"italic"}}>لا توجد حركة</div>;
    return <>
      {b.groups.map((g,i) => <div key={i} style={{display:"flex", justifyContent:"space-between", padding:"6px 14px", borderBottom:"1px dotted "+T.brd, alignItems:"center"}}>
        <span style={{display:"flex", alignItems:"center", gap:6, fontSize:FS-1}}>
          {g.accountCode && <span style={{fontFamily:"monospace", color:T.accent, fontWeight:700}}>{g.accountCode}</span>}
          <span>{g.accountName||"غير محدد"}</span>
          {g.count > 1 && <span style={{fontSize:FS-3, color:T.textMut}}>×{g.count}</span>}
        </span>
        <span style={{direction:"ltr", fontFamily:"monospace", fontWeight:600, color: g.total >= 0 ? T.ok : T.err}}>
          {g.total >= 0 ? "+" : ""}{fmt(g.total.toFixed(2))}
        </span>
      </div>)}
      <div style={{padding:"10px 14px", background:T.bg, borderTop:"1px solid "+T.brd, display:"flex", justifyContent:"space-between", fontWeight:800, color}}>
        <span>صافي {title}</span>
        <span style={{direction:"ltr", fontFamily:"monospace", fontSize:FS+1}}>
          {b.net >= 0 ? "+" : ""}{fmt(b.net.toFixed(2))}
        </span>
      </div>
    </>;
  };

  return <Card title="💸 قائمة التدفقات النقدية" style={{marginBottom:16}}>
    {/* Filter bar */}
    <div style={{display:"flex", flexWrap:"wrap", gap:8, alignItems:"center", marginBottom:14}}>
      <label style={{fontSize:FS-2, color:T.textSec, fontWeight:700}}>من:</label>
      <Inp type="date" value={from} onChange={setFrom} style={{maxWidth:160}}/>
      <label style={{fontSize:FS-2, color:T.textSec, fontWeight:700}}>إلى:</label>
      <Inp type="date" value={to} onChange={setTo} style={{maxWidth:160}}/>
      <Btn ghost small onClick={() => {setFrom(monthStart);setTo(today);setTimeout(load,50);}}>الشهر</Btn>
      <Btn ghost small onClick={() => {setFrom(today.slice(0,4)+"-01-01");setTo(today);setTimeout(load,50);}}>السنة</Btn>
      <Btn primary onClick={load} disabled={loading}>{loading ? "⏳" : "🔄 تحديث"}</Btn>
      <div style={{flex:1}}/>
      <Btn ghost onClick={() => printCashFlow(report, configInfo)} disabled={loading}>🖨 طباعة / PDF</Btn>
    </div>

    {loading ? <div style={{padding:30, textAlign:"center", color:T.textMut}}>⏳ جاري الحساب...</div>
    : <>
      {/* Summary cards */}
      <div style={{display:"grid", gridTemplateColumns: isMob ? "1fr 1fr" : "repeat(4,1fr)", gap:8, marginBottom:14}}>
        <div style={{padding:12, background:T.bg, borderRadius:8, textAlign:"center", border:"1px solid "+T.brd}}>
          <div style={{fontSize:FS-2, color:T.textSec, marginBottom:4}}>رصيد البداية</div>
          <div style={{fontSize:FS+1, fontWeight:800, color:T.text, direction:"ltr", fontFamily:"monospace"}}>{fmt(report.beginningCash.toFixed(2))}</div>
        </div>
        <div style={{padding:12, background: report.netCashChange >= 0 ? T.ok+"10" : T.err+"10", borderRadius:8, textAlign:"center", border:"1px solid "+(report.netCashChange >= 0 ? T.ok+"40" : T.err+"40")}}>
          <div style={{fontSize:FS-2, color:T.textSec, marginBottom:4}}>صافي التغير</div>
          <div style={{fontSize:FS+1, fontWeight:800, color:report.netCashChange >= 0 ? T.ok : T.err, direction:"ltr", fontFamily:"monospace"}}>
            {report.netCashChange >= 0 ? "+" : ""}{fmt(report.netCashChange.toFixed(2))}
          </div>
        </div>
        <div style={{padding:12, background:T.accent+"10", borderRadius:8, textAlign:"center", border:"1px solid "+T.accent+"40"}}>
          <div style={{fontSize:FS-2, color:T.textSec, marginBottom:4}}>رصيد النهاية</div>
          <div style={{fontSize:FS+1, fontWeight:800, color:T.accent, direction:"ltr", fontFamily:"monospace"}}>{fmt(report.endingCash.toFixed(2))}</div>
        </div>
        <div style={{padding:12, background:T.bg, borderRadius:8, textAlign:"center", border:"1px solid "+T.brd}}>
          <div style={{fontSize:FS-2, color:T.textSec, marginBottom:4}}>عدد المعاملات</div>
          <div style={{fontSize:FS+1, fontWeight:800, color:T.text}}>{report.operating.activities.length + report.investing.activities.length + report.financing.activities.length}</div>
        </div>
      </div>

      {/* Operating */}
      <div style={{border:"1px solid "+T.ok+"40", borderRadius:8, overflow:"hidden", background:T.cardSolid, marginBottom:14}}>
        <div style={{padding:"10px 14px", background:T.ok+"08", borderBottom:"2px solid "+T.ok, fontSize:FS, fontWeight:800, color:T.ok}}>🏭 الأنشطة التشغيلية</div>
        {renderBucket(report.operating, "الأنشطة التشغيلية", T.ok)}
      </div>

      {/* Investing */}
      {report.investing.groups.length > 0 && <div style={{border:"1px solid "+T.warn+"40", borderRadius:8, overflow:"hidden", background:T.cardSolid, marginBottom:14}}>
        <div style={{padding:"10px 14px", background:T.warn+"08", borderBottom:"2px solid "+T.warn, fontSize:FS, fontWeight:800, color:T.warn}}>🏗️ الأنشطة الاستثمارية</div>
        {renderBucket(report.investing, "الأنشطة الاستثمارية", T.warn)}
      </div>}

      {/* Financing */}
      {report.financing.groups.length > 0 && <div style={{border:"1px solid #8B5CF640", borderRadius:8, overflow:"hidden", background:T.cardSolid, marginBottom:14}}>
        <div style={{padding:"10px 14px", background:"#8B5CF608", borderBottom:"2px solid #8B5CF6", fontSize:FS, fontWeight:800, color:"#8B5CF6"}}>💼 الأنشطة التمويلية</div>
        {renderBucket(report.financing, "الأنشطة التمويلية", "#8B5CF6")}
      </div>}
    </>}
  </Card>;
}
