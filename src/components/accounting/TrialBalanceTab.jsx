/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · TrialBalanceTab
   ───────────────────────────────────────────────────────────────────────
   Date range filter + tree-rolled-up trial balance + drill-down to
   account ledger.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useMemo } from "react";
import { Btn, Card, Inp } from "../ui.jsx";
import { readDayRange } from "../../utils/accounting/dayDoc.js";
import { buildTrialBalance, getAccountLedger } from "../../utils/accounting/aggregate.js";
import { fmt } from "../../utils/format.js";
import { ACCOUNT_TYPES } from "../../utils/accounting/coa.js";

const TYPE_COLOR = Object.fromEntries(ACCOUNT_TYPES.map(t => [t.key, t.color]));

export function TrialBalanceTab({coa, T, FS, isMob, showToast}){
  const today = new Date().toISOString().split("T")[0];
  const monthStart = today.slice(0,7) + "-01";
  const [from, setFrom]   = useState(monthStart);
  const [to, setTo]       = useState(today);
  const [days, setDays]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [showZero, setShowZero] = useState(false);
  const [drillAcct, setDrillAcct] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const result = await readDayRange(from, to);
      setDays(result);
    } catch(e){
      console.error("[CLARK accounting] load range failed:", e);
      showToast("⚠️ فشل تحميل ميزان المراجعة");
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const tb = useMemo(() => buildTrialBalance(coa, days), [coa, days]);
  const visibleRows = showZero ? tb.rows : tb.rows.filter(r => r.hasActivity || !r.isLeaf);
  const ledger = useMemo(() => drillAcct ? getAccountLedger(coa, days, drillAcct) : null, [drillAcct, coa, days]);

  return <Card title="⚖️ ميزان المراجعة" style={{marginBottom:16}}>
    {/* Filter bar */}
    <div style={{display:"flex", flexWrap:"wrap", gap:8, alignItems:"center", marginBottom:14}}>
      <label style={{fontSize:FS-2, color:T.textSec, fontWeight:700}}>من:</label>
      <Inp type="date" value={from} onChange={setFrom} style={{maxWidth:160}}/>
      <label style={{fontSize:FS-2, color:T.textSec, fontWeight:700}}>إلى:</label>
      <Inp type="date" value={to} onChange={setTo} style={{maxWidth:160}}/>
      <Btn primary onClick={load} disabled={loading}>{loading ? "⏳" : "🔄 تحديث"}</Btn>
      <div style={{flex:1}}/>
      <span onClick={() => setShowZero(s => !s)} style={{cursor:"pointer", fontSize:FS-2, color:showZero?T.accent:T.textMut, fontWeight:700, padding:"6px 10px", borderRadius:6, border:"1px solid "+(showZero?T.accent+"40":T.brd)}}>
        {showZero?"☑":"☐"} عرض الحسابات بدون حركة
      </span>
    </div>

    {loading ? <div style={{padding:30, textAlign:"center", color:T.textMut}}>⏳ جاري الحساب...</div>
      : visibleRows.length === 0 ? <div style={{padding:30, textAlign:"center", color:T.textMut, background:T.bg, borderRadius:10, border:"1px dashed "+T.brd}}>
        لا توجد قيود في الفترة المحددة
      </div>
      : <>
        <div style={{overflowX:"auto", border:"1px solid "+T.brd, borderRadius:8}}>
          <table style={{width:"100%", borderCollapse:"collapse", fontSize:FS-1}}>
            <thead><tr style={{background:T.accent+"08", position:"sticky", top:0, zIndex:1}}>
              <th style={{padding:"10px 12px", textAlign:"right", color:T.textSec, fontWeight:800, fontSize:FS-2, borderBottom:"2px solid "+T.brd}}>الحساب</th>
              <th style={{padding:"10px 12px", textAlign:"center", color:T.textSec, fontWeight:800, fontSize:FS-2, borderBottom:"2px solid "+T.brd, width:130}}>إجمالي مدين</th>
              <th style={{padding:"10px 12px", textAlign:"center", color:T.textSec, fontWeight:800, fontSize:FS-2, borderBottom:"2px solid "+T.brd, width:130}}>إجمالي دائن</th>
              <th style={{padding:"10px 12px", textAlign:"center", color:T.textSec, fontWeight:800, fontSize:FS-2, borderBottom:"2px solid "+T.brd, width:140}}>الرصيد</th>
            </tr></thead>
            <tbody>{visibleRows.map(r => {
              const color = TYPE_COLOR[r.type] || T.text;
              const indentPx = r.depth * 16;
              return <tr key={r.id} onClick={() => r.isLeaf && setDrillAcct(r.id)} style={{
                cursor: r.isLeaf ? "pointer" : "default",
                background: r.depth===0 ? color+"05" : "transparent",
                borderTop: "1px solid "+T.brd,
              }} onMouseEnter={e => { if(r.isLeaf) e.currentTarget.style.background = T.accent+"08"; }}
                 onMouseLeave={e => { if(r.isLeaf) e.currentTarget.style.background = r.depth===0 ? color+"05" : "transparent"; }}>
                <td style={{padding:"8px 12px", paddingInlineStart:12+indentPx}}>
                  <div style={{display:"flex", alignItems:"center", gap:6}}>
                    <span style={{fontFamily:"monospace", fontSize:FS-2, color, fontWeight:800, minWidth:50}}>{r.code}</span>
                    <span style={{fontWeight: r.isLeaf?600:800, color:T.text}}>{r.name}</span>
                    {!r.isLeaf && <span style={{fontSize:FS-3, color:T.textMut, fontStyle:"italic"}}>(مجموع)</span>}
                  </div>
                </td>
                <td style={{padding:"8px 12px", textAlign:"center", direction:"ltr", fontWeight: r.debit>0?(r.isLeaf?600:800):400, color: r.debit>0?T.ok:T.textMut}}>{r.debit>0 ? fmt(r.debit.toFixed(2)) : "—"}</td>
                <td style={{padding:"8px 12px", textAlign:"center", direction:"ltr", fontWeight: r.credit>0?(r.isLeaf?600:800):400, color: r.credit>0?T.err:T.textMut}}>{r.credit>0 ? fmt(r.credit.toFixed(2)) : "—"}</td>
                <td style={{padding:"8px 12px", textAlign:"center", direction:"ltr", fontWeight:800, color: r.balance>0 ? T.ok : r.balance<0 ? T.err : T.textMut}}>
                  {Math.abs(r.balance) < 0.01 ? "—" : fmt(Math.abs(r.balance).toFixed(2))}
                  {r.balance !== 0 && <span style={{fontSize:FS-3, marginInlineStart:4, opacity:0.7}}>{r.balance>0?"مدين":"دائن"}</span>}
                </td>
              </tr>;
            })}</tbody>
            <tfoot><tr style={{background:T.accent+"15", borderTop:"2px solid "+T.accent}}>
              <td style={{padding:"10px 12px", fontWeight:800, color:T.accent}}>الإجمالي</td>
              <td style={{padding:"10px 12px", textAlign:"center", direction:"ltr", fontWeight:800, color:T.ok, fontSize:FS}}>{fmt(tb.totals.debit.toFixed(2))}</td>
              <td style={{padding:"10px 12px", textAlign:"center", direction:"ltr", fontWeight:800, color:T.err, fontSize:FS}}>{fmt(tb.totals.credit.toFixed(2))}</td>
              <td style={{padding:"10px 12px", textAlign:"center", direction:"ltr", fontWeight:800, color: Math.abs(tb.totals.debit-tb.totals.credit)<0.01 ? T.ok : T.err}}>
                {Math.abs(tb.totals.debit-tb.totals.credit) < 0.01 ? "✓ متوازن" : "⚠️ "+fmt(Math.abs(tb.totals.debit-tb.totals.credit).toFixed(2))}
              </td>
            </tr></tfoot>
          </table>
        </div>
        <div style={{fontSize:FS-3, color:T.textMut, marginTop:8, lineHeight:1.5}}>
          💡 اضغط على أي حساب فرعي لعرض كل القيود التفصيلية له خلال هذه الفترة (الأستاذ).
        </div>
      </>}

    {/* Account ledger drill-down */}
    {ledger && ledger.account && <div className="pop-overlay" style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:10001, display:"flex", alignItems:"center", justifyContent:"center", padding:16}} onClick={() => setDrillAcct(null)}>
      <div onClick={e => e.stopPropagation()} style={{background:T.cardSolid, borderRadius:14, padding:isMob?14:20, width:"100%", maxWidth:1100, maxHeight:"90vh", overflowY:"auto", border:"1px solid "+T.brd, boxShadow:"0 25px 70px rgba(0,0,0,0.4)"}}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14}}>
          <div>
            <div style={{fontSize:FS-2, color:T.textSec}}>📒 أستاذ الحساب</div>
            <div style={{display:"flex", alignItems:"center", gap:8, marginTop:2}}>
              <span style={{fontFamily:"monospace", fontSize:FS, color:TYPE_COLOR[ledger.account.type], fontWeight:800}}>{ledger.account.code}</span>
              <span style={{fontSize:FS+1, fontWeight:800, color:T.text}}>{ledger.account.name}</span>
            </div>
          </div>
          <Btn ghost small onClick={() => setDrillAcct(null)}>✕</Btn>
        </div>
        <div style={{display:"grid", gridTemplateColumns:isMob?"1fr 1fr":"repeat(3,1fr)", gap:8, marginBottom:14}}>
          <div style={{padding:10, background:T.ok+"08", borderRadius:8, textAlign:"center"}}>
            <div style={{fontSize:FS-2, color:T.textSec}}>إجمالي مدين</div>
            <div style={{fontSize:FS+1, fontWeight:800, color:T.ok, direction:"ltr"}}>{fmt(ledger.totals.debit.toFixed(2))}</div>
          </div>
          <div style={{padding:10, background:T.err+"08", borderRadius:8, textAlign:"center"}}>
            <div style={{fontSize:FS-2, color:T.textSec}}>إجمالي دائن</div>
            <div style={{fontSize:FS+1, fontWeight:800, color:T.err, direction:"ltr"}}>{fmt(ledger.totals.credit.toFixed(2))}</div>
          </div>
          <div style={{padding:10, background:T.accent+"08", borderRadius:8, textAlign:"center", gridColumn:isMob?"1/3":"auto"}}>
            <div style={{fontSize:FS-2, color:T.textSec}}>الرصيد النهائي</div>
            <div style={{fontSize:FS+1, fontWeight:800, color:T.accent, direction:"ltr"}}>{fmt(Math.abs(ledger.totals.balance).toFixed(2))} {ledger.totals.balance>=0?"مدين":"دائن"}</div>
          </div>
        </div>
        <div style={{overflowX:"auto", border:"1px solid "+T.brd, borderRadius:8}}>
          <table style={{width:"100%", borderCollapse:"collapse", fontSize:FS-2}}>
            <thead><tr style={{background:T.accent+"08"}}>
              <th style={{padding:"8px 10px", textAlign:"right", color:T.textSec, fontWeight:800}}>التاريخ</th>
              <th style={{padding:"8px 10px", textAlign:"right", color:T.textSec, fontWeight:800}}>المرجع</th>
              <th style={{padding:"8px 10px", textAlign:"right", color:T.textSec, fontWeight:800}}>البيان</th>
              {!isMob && <th style={{padding:"8px 10px", textAlign:"right", color:T.textSec, fontWeight:800}}>الجهة</th>}
              <th style={{padding:"8px 10px", textAlign:"center", color:T.textSec, fontWeight:800, width:110}}>مدين</th>
              <th style={{padding:"8px 10px", textAlign:"center", color:T.textSec, fontWeight:800, width:110}}>دائن</th>
              <th style={{padding:"8px 10px", textAlign:"center", color:T.textSec, fontWeight:800, width:130}}>الرصيد التراكمي</th>
            </tr></thead>
            <tbody>{ledger.lines.map((l,i) => <tr key={i} style={{borderTop:"1px solid "+T.brd}}>
              <td style={{padding:"7px 10px", fontFamily:"monospace", fontSize:FS-2}}>{l.date}</td>
              <td style={{padding:"7px 10px", fontFamily:"monospace", fontSize:FS-2, color:T.accent, fontWeight:700}}>{l.refNo}</td>
              <td style={{padding:"7px 10px"}}>{l.narration}{l.note?<div style={{fontSize:FS-3, color:T.textMut}}>{l.note}</div>:null}</td>
              {!isMob && <td style={{padding:"7px 10px", color:T.textSec}}>{l.partyName||"—"}</td>}
              <td style={{padding:"7px 10px", textAlign:"center", direction:"ltr", color:l.debit>0?T.ok:T.textMut, fontWeight:l.debit>0?700:400}}>{l.debit>0 ? fmt(l.debit.toFixed(2)) : "—"}</td>
              <td style={{padding:"7px 10px", textAlign:"center", direction:"ltr", color:l.credit>0?T.err:T.textMut, fontWeight:l.credit>0?700:400}}>{l.credit>0 ? fmt(l.credit.toFixed(2)) : "—"}</td>
              <td style={{padding:"7px 10px", textAlign:"center", direction:"ltr", fontWeight:800, color:T.accent}}>{fmt(l.runningBalance.toFixed(2))}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>}
  </Card>;
}
