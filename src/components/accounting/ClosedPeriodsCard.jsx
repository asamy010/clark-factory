/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · ClosedPeriodsCard
   ───────────────────────────────────────────────────────────────────────
   Lists previously-closed fiscal periods and allows reversing them.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState } from "react";
import { Btn } from "../ui.jsx";
import { reverseClosingEntry } from "../../utils/accounting/closingEntries.js";
import { fmt } from "../../utils/format.js";
import { ask, tell } from "../../utils/popups.js";

export function ClosedPeriodsCard({closedPeriods, T, FS, isMob, upConfig, showToast, userName}){
  const [busyId, setBusyId] = useState(null);

  const list = Array.isArray(closedPeriods) ? closedPeriods : [];
  const active = list.filter(p => !p.reversedAt);
  const reversed = list.filter(p => p.reversedAt);

  const handleReverse = async (period) => {
    if(!await ask("إعادة فتح الفترة", "سيتم إعادة فتح الفترة "+period.fromDate+" → "+period.toDate+".\n\nالقيد العكسي سيُلغي إقفال الإيرادات والمصروفات ويعيد رصيد الأرباح المحتجزة لما كان عليه.\n\nاستمرار؟", {danger:true, confirmText:"إعادة فتح"})) return;
    setBusyId(period.id);
    try {
      const res = await reverseClosingEntry(period.fromDate, period.toDate, userName);
      if(!res.reversed){ await tell("لا يوجد قيد للعكس", res.reason||"لا يوجد قيد للعكس", {danger:true}); return; }
      if(typeof upConfig === "function"){
        upConfig(d => {
          if(!Array.isArray(d.closedPeriods)) d.closedPeriods = [];
          const idx = d.closedPeriods.findIndex(p => p.id === period.id);
          if(idx >= 0){
            d.closedPeriods[idx] = {
              ...d.closedPeriods[idx],
              reversedAt: new Date().toISOString(),
              reversedBy: userName||"",
            };
          }
        });
      }
      showToast("✓ تم إعادة فتح الفترة");
    } catch(e){
      await tell("فشل", e.message||String(e), {danger:true});
    } finally {
      setBusyId(null);
    }
  };

  if(list.length === 0) return null;

  return <div style={{marginTop:14, padding:isMob?12:14, background:T.bg, borderRadius:8, border:"1px solid "+T.brd}}>
    <div style={{fontSize:FS, fontWeight:800, color:T.text, marginBottom:10, display:"flex", alignItems:"center", gap:6}}>
      <span>📅</span><span>الفترات المُقفلة ({active.length})</span>
    </div>
    <div style={{display:"flex", flexDirection:"column", gap:6}}>
      {active.map(p => <div key={p.id} style={{padding:"10px 12px", background:T.cardSolid, borderRadius:6, border:"1px solid "+T.brd, display:"flex", flexWrap:"wrap", gap:8, alignItems:"center"}}>
        <div style={{flex:1, minWidth:200}}>
          <div style={{fontSize:FS-1, fontWeight:800, color:T.text}}>
            <span style={{fontFamily:"monospace", color:T.accent}}>{p.fromDate}</span>
            <span style={{margin:"0 6px", color:T.textMut}}>→</span>
            <span style={{fontFamily:"monospace", color:T.accent}}>{p.toDate}</span>
          </div>
          <div style={{fontSize:FS-3, color:T.textMut, marginTop:2, display:"flex", flexWrap:"wrap", gap:8}}>
            <span>📊 إيرادات: <b style={{color:T.ok, direction:"ltr", fontFamily:"monospace"}}>{fmt(Number(p.totalRevenue||0).toFixed(2))}</b></span>
            <span>💸 مصروفات: <b style={{color:T.err, direction:"ltr", fontFamily:"monospace"}}>{fmt(Number(p.totalExpense||0).toFixed(2))}</b></span>
            <span>{(p.netIncome||0)>=0?"✓ ربح":"⚠ خسارة"}: <b style={{color:(p.netIncome||0)>=0?T.ok:T.err, direction:"ltr", fontFamily:"monospace"}}>{fmt(Math.abs(p.netIncome||0).toFixed(2))}</b></span>
          </div>
          <div style={{fontSize:FS-3, color:T.textMut, marginTop:2}}>
            بواسطة {p.closedBy||"—"} · {(p.closedAt||"").split("T")[0]}
          </div>
        </div>
        <Btn small ghost onClick={() => handleReverse(p)} disabled={busyId===p.id} style={{color:T.warn, fontSize:FS-2}}>
          {busyId===p.id ? "⏳" : "↩️ إعادة فتح"}
        </Btn>
      </div>)}
    </div>

    {reversed.length > 0 && <details style={{marginTop:10}}>
      <summary style={{cursor:"pointer", fontSize:FS-2, color:T.textMut, fontWeight:700}}>
        🗂 عرض الفترات المعاد فتحها ({reversed.length})
      </summary>
      <div style={{display:"flex", flexDirection:"column", gap:6, marginTop:6}}>
        {reversed.map(p => <div key={p.id} style={{padding:"8px 12px", background:T.cardSolid, borderRadius:6, border:"1px dashed "+T.brd, opacity:0.7, fontSize:FS-2}}>
          <div style={{fontWeight:700}}>{p.fromDate} → {p.toDate}</div>
          <div style={{color:T.textMut, fontSize:FS-3, marginTop:2}}>
            مُغلقة بواسطة {p.closedBy||"—"} · مُعاد فتحها بواسطة {p.reversedBy||"—"} ({(p.reversedAt||"").split("T")[0]})
          </div>
        </div>)}
      </div>
    </details>}
  </div>;
}
