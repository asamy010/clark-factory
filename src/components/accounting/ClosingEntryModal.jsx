/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · ClosingEntryModal
   ───────────────────────────────────────────────────────────────────────
   Wizard for closing a fiscal period:
     1. User picks fromDate, toDate, retainedEarningsCode.
     2. We load the days in the range, run analyzePeriodForClosing()
        (LIVE — runs on every input change).
     3. Display preview: revenue accounts, expense accounts, net income.
     4. User confirms → postClosingEntry() and persist to data.closedPeriods.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useMemo } from "react";
import { Btn, Inp } from "../ui.jsx";
import { AccountSelector } from "./AccountSelector.jsx";
import { getAccountByCode } from "../../utils/accounting/coa.js";
import { readDayRange } from "../../utils/accounting/dayDoc.js";
import { analyzePeriodForClosing, postClosingEntry } from "../../utils/accounting/closingEntries.js";
import { fmt, gid } from "../../utils/format.js";

export function ClosingEntryModal({coa, T, FS, isMob, onClose, showToast, userName, upConfig, defaultRetainedEarningsCode}){
  const today = new Date().toISOString().split("T")[0];
  const yearStart = today.slice(0,4) + "-01-01";
  const yearEnd   = today.slice(0,4) + "-12-31";

  const [fromDate, setFromDate] = useState(yearStart);
  const [toDate, setToDate]     = useState(yearEnd);
  const [reCode, setReCode]     = useState(defaultRetainedEarningsCode || "3200");
  const [days, setDays]         = useState([]);
  const [loading, setLoading]   = useState(false);
  const [busy, setBusy]         = useState(false);

  /* Load days whenever the range changes */
  useEffect(() => {
    let cancelled = false;
    if(!fromDate || !toDate) return;
    if(new Date(fromDate) > new Date(toDate)) return;
    setLoading(true);
    readDayRange(fromDate, toDate).then(result => {
      if(!cancelled) setDays(result);
    }).finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [fromDate, toDate]);

  /* Live analysis */
  const analysis = useMemo(() => {
    try { return analyzePeriodForClosing(coa, days, reCode); }
    catch(e){ return {error: e.message}; }
  }, [coa, days, reCode]);

  const reAcct = getAccountByCode(coa, reCode);

  const handleClose = async () => {
    if(analysis.error || !analysis.canClose) return;
    if(!confirm(`سيتم إقفال الفترة من ${fromDate} إلى ${toDate}.\n\nصافي ${analysis.netIncome>=0?"الربح":"الخسارة"}: ${fmt(Math.abs(analysis.netIncome).toFixed(2))} ج.م\n\nسيُصفّر النظام أرصدة كل الإيرادات والمصروفات في الفترة.\n\nاستمرار؟`)) return;
    setBusy(true);
    try {
      const result = await postClosingEntry({
        coa, daysInPeriod: days,
        fromDate, toDate, retainedEarningsCode: reCode,
        createdBy: userName,
      });
      /* Persist to data.closedPeriods (idempotent on sourceId) */
      if(typeof upConfig === "function"){
        upConfig(d => {
          if(!Array.isArray(d.closedPeriods)) d.closedPeriods = [];
          /* Remove any prior record for the same range (we just overwrote the entry) */
          d.closedPeriods = d.closedPeriods.filter(p => p.sourceId !== result.sourceId);
          d.closedPeriods.push({
            id: gid(),
            sourceId: result.sourceId,
            fromDate, toDate,
            retainedEarningsCode: reCode,
            totalRevenue: result.totalRevenue,
            totalExpense: result.totalExpense,
            netIncome: result.netIncome,
            accountsClosed: result.accountsClosed,
            closedAt: new Date().toISOString(),
            closedBy: userName||"",
          });
          /* Sort newest-first */
          d.closedPeriods.sort((a,b) => (b.closedAt||"").localeCompare(a.closedAt||""));
        });
      }
      showToast("✅ تم إقفال الفترة بنجاح");
      onClose();
    } catch(e){
      console.error(e);
      alert("⚠️ فشل الإقفال:\n"+(e.message||e));
    } finally {
      setBusy(false);
    }
  };

  const _amt = (n) => Math.abs(n) < 0.005 ? "—" : fmt(n.toFixed(2));

  return <div className="pop-overlay" style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:10001, display:"flex", alignItems:"center", justifyContent:"center", padding:isMob?8:16}} onClick={onClose}>
    <div onClick={e => e.stopPropagation()} style={{background:T.cardSolid, borderRadius:14, width:"100%", maxWidth:760, maxHeight:"94vh", display:"flex", flexDirection:"column", border:"1px solid "+T.brd, boxShadow:"0 25px 70px rgba(0,0,0,0.4)"}}>

      {/* Header */}
      <div style={{padding:isMob?14:18, borderBottom:"1px solid "+T.brd, display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0}}>
        <div>
          <div style={{fontSize:FS+2, fontWeight:800, color:T.warn}}>🔒 إقفال الفترة المالية</div>
          <div style={{fontSize:FS-2, color:T.textSec, marginTop:2}}>تصفير الإيرادات والمصروفات وترحيل الصافي للأرباح المحتجزة</div>
        </div>
        <Btn ghost small onClick={onClose}>✕</Btn>
      </div>

      {/* Form (sticky) */}
      <div style={{padding:isMob?12:16, background:T.bg, borderBottom:"1px solid "+T.brd, flexShrink:0}}>
        <div style={{display:"grid", gridTemplateColumns: isMob?"1fr 1fr":"1fr 1fr 1.5fr", gap:10}}>
          <div>
            <label style={{fontSize:FS-2, color:T.textSec, fontWeight:700, display:"block", marginBottom:4}}>من تاريخ</label>
            <Inp type="date" value={fromDate} onChange={setFromDate}/>
          </div>
          <div>
            <label style={{fontSize:FS-2, color:T.textSec, fontWeight:700, display:"block", marginBottom:4}}>إلى تاريخ</label>
            <Inp type="date" value={toDate} onChange={setToDate}/>
          </div>
          <div style={{gridColumn: isMob?"1/3":"auto"}}>
            <label style={{fontSize:FS-2, color:T.textSec, fontWeight:700, display:"block", marginBottom:4}}>حساب الأرباح المحتجزة</label>
            <AccountSelector value={reAcct?.id||null} onChange={id => {const a = coa.find(x => x.id===id); if(a) setReCode(a.code);}} coa={coa} T={T} FS={FS} filterType="equity"/>
          </div>
        </div>
      </div>

      {/* Preview */}
      <div style={{flex:1, overflowY:"auto", padding:isMob?12:16}}>
        {loading ? <div style={{padding:30, textAlign:"center", color:T.textMut}}>⏳ جاري التحليل...</div>
        : analysis.error ? <div style={{padding:14, background:T.err+"10", borderRadius:8, color:T.err, fontWeight:700}}>⚠️ {analysis.error}</div>
        : !analysis.canClose ? <div style={{padding:30, textAlign:"center", color:T.textMut, background:T.bg, borderRadius:8, border:"1px dashed "+T.brd}}>
            لا توجد إيرادات أو مصروفات بأرصدة في هذه الفترة
          </div>
        : <>
          {/* Revenue accounts */}
          {analysis.revenueAccounts.length > 0 && <div style={{marginBottom:14}}>
            <div style={{padding:"8px 12px", background:T.ok+"08", borderRadius:6, marginBottom:6, fontSize:FS, fontWeight:800, color:T.ok}}>
              📊 الإيرادات (سيتم إقفالها)
            </div>
            <div style={{border:"1px solid "+T.brd, borderRadius:6, overflow:"hidden"}}>
              {analysis.revenueAccounts.map((r,i) => <div key={r.id} style={{display:"flex", alignItems:"center", gap:8, padding:"6px 12px", borderBottom:i<analysis.revenueAccounts.length-1?"1px solid "+T.brd:"none", background: r.balance < 0 ? T.warn+"08" : "transparent"}}>
                <span style={{fontFamily:"monospace", color:T.accent, fontWeight:700, minWidth:50, fontSize:FS-2}}>{r.code}</span>
                <span style={{flex:1, fontSize:FS-1, fontWeight:600}}>{r.name}{r.balance<0 && <span style={{color:T.warn, marginInlineStart:6, fontSize:FS-3}}>(contra)</span>}</span>
                <span style={{direction:"ltr", fontFamily:"monospace", fontWeight:700, color: r.balance<0?T.warn:T.ok, fontSize:FS-1}}>{r.balance < 0 ? "("+_amt(Math.abs(r.balance))+")" : _amt(r.balance)}</span>
              </div>)}
              <div style={{padding:"8px 12px", background:T.ok+"15", borderTop:"2px solid "+T.ok, display:"flex", justifyContent:"space-between", fontWeight:800, color:T.ok}}>
                <span>إجمالي صافي الإيرادات</span>
                <span style={{direction:"ltr", fontFamily:"monospace", fontSize:FS}}>{_amt(analysis.totalRevenue)}</span>
              </div>
            </div>
          </div>}

          {/* Expense accounts */}
          {analysis.expenseAccounts.length > 0 && <div style={{marginBottom:14}}>
            <div style={{padding:"8px 12px", background:T.err+"08", borderRadius:6, marginBottom:6, fontSize:FS, fontWeight:800, color:T.err}}>
              💸 المصروفات (سيتم إقفالها)
            </div>
            <div style={{border:"1px solid "+T.brd, borderRadius:6, overflow:"hidden"}}>
              {analysis.expenseAccounts.map((e,i) => <div key={e.id} style={{display:"flex", alignItems:"center", gap:8, padding:"6px 12px", borderBottom:i<analysis.expenseAccounts.length-1?"1px solid "+T.brd:"none"}}>
                <span style={{fontFamily:"monospace", color:T.accent, fontWeight:700, minWidth:50, fontSize:FS-2}}>{e.code}</span>
                <span style={{flex:1, fontSize:FS-1, fontWeight:600}}>{e.name}</span>
                <span style={{direction:"ltr", fontFamily:"monospace", fontWeight:700, color:T.err, fontSize:FS-1}}>{_amt(e.balance)}</span>
              </div>)}
              <div style={{padding:"8px 12px", background:T.err+"15", borderTop:"2px solid "+T.err, display:"flex", justifyContent:"space-between", fontWeight:800, color:T.err}}>
                <span>إجمالي المصروفات</span>
                <span style={{direction:"ltr", fontFamily:"monospace", fontSize:FS}}>{_amt(analysis.totalExpense)}</span>
              </div>
            </div>
          </div>}

          {/* Net income summary */}
          <div style={{padding:"14px 18px", background: analysis.netIncome>=0 ? "linear-gradient(135deg, "+T.ok+"22, "+T.ok+"08)" : "linear-gradient(135deg, "+T.err+"22, "+T.err+"08)", borderRadius:10, border:"2px solid "+(analysis.netIncome>=0?T.ok:T.err), display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10}}>
            <div>
              <div style={{fontSize:FS+1, fontWeight:800, color:analysis.netIncome>=0?T.ok:T.err}}>
                {analysis.netIncome>=0 ? "✓ صافي الربح" : "⚠ صافي الخسارة"}
              </div>
              <div style={{fontSize:FS-2, color:T.textSec, marginTop:2}}>سيُرحّل إلى: {analysis.retainedEarnings.code} {analysis.retainedEarnings.name}</div>
            </div>
            <span style={{fontSize:FS+4, fontWeight:800, direction:"ltr", fontFamily:"monospace", color:analysis.netIncome>=0?T.ok:T.err}}>
              {_amt(Math.abs(analysis.netIncome))}
            </span>
          </div>

          {/* Warning */}
          <div style={{padding:"10px 14px", background:T.warn+"10", borderRadius:8, border:"1px solid "+T.warn+"40", fontSize:FS-2, color:T.warn, fontWeight:700, lineHeight:1.7}}>
            ⚠️ <b>تحذير:</b> هذا القيد سيُصفّر أرصدة كل حسابات الإيرادات والمصروفات للفترة المحددة وينقل الصافي للأرباح المحتجزة. يمكن عكسه لاحقاً من قائمة "الفترات المُقفلة" في الإعدادات.
          </div>
        </>}
      </div>

      {/* Footer */}
      <div style={{padding:isMob?12:16, background:T.bg, borderTop:"1px solid "+T.brd, display:"flex", gap:8, justifyContent:"flex-end", flexShrink:0}}>
        <Btn ghost onClick={onClose} disabled={busy}>↩️ إلغاء</Btn>
        <Btn primary onClick={handleClose} disabled={busy || loading || !analysis.canClose || analysis.error} style={{background: analysis.canClose && !analysis.error ? T.warn : T.textMut, color:"#fff", border:"none", fontWeight:800, padding:"10px 24px"}}>
          {busy ? "⏳ جاري الإقفال..." : "🔒 إقفال الفترة"}
        </Btn>
      </div>
    </div>
  </div>;
}
