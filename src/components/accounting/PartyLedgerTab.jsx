/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · PartyLedgerTab
   ───────────────────────────────────────────────────────────────────────
   Unified statement of account for any party (customer / workshop /
   employee), built directly from journal entries — single source of truth.

   Workflow:
     1. User selects party type (customer / workshop / employee)
     2. Lookup dropdown for the party
     3. Date range filter
     4. Live ledger with running balance + print button
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useMemo } from "react";
import { Btn, Card, Inp } from "../ui.jsx";
import { readDayRange } from "../../utils/accounting/dayDoc.js";
import { getPartyLedger } from "../../utils/accounting/aggregate.js";
import { fmt } from "../../utils/format.js";
import { printPartyStatement } from "./reportPrint.js";

const PARTY_TYPES = [
  {key:"customer", label:"عميل",   icon:"👤", listKey:"customers", color:"#0EA5E9"},
  {key:"workshop", label:"ورشة",   icon:"🏭", listKey:"workshops", color:"#F59E0B"},
  {key:"employee", label:"موظف",   icon:"💼", listKey:"employees", color:"#8B5CF6"},
];

export function PartyLedgerTab({coa, data, configInfo, T, FS, isMob, showToast}){
  const today = new Date().toISOString().split("T")[0];
  const yearStart = today.slice(0,4) + "-01-01";
  const earliestPossible = (() => {const d = new Date(today); d.setFullYear(d.getFullYear()-5); return d.toISOString().split("T")[0];})();

  const [partyType, setPartyType] = useState("customer");
  const [partyId, setPartyId]     = useState("");
  const [partySearch, setPartySearch] = useState("");
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [from, setFrom] = useState(yearStart);
  const [to, setTo]     = useState(today);
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(false);

  /* List of parties to choose from */
  const partyList = useMemo(() => {
    const def = PARTY_TYPES.find(p => p.key === partyType);
    if(!def) return [];
    const list = (data[def.listKey]||[]).filter(p => !p.archived && !p.inactive);
    if(!partySearch) return list;
    const q = partySearch.trim().toLowerCase();
    return list.filter(p => (p.name||"").toLowerCase().includes(q));
  }, [partyType, partySearch, data]);

  const selectedParty = useMemo(() => {
    const def = PARTY_TYPES.find(p => p.key === partyType);
    if(!def || !partyId) return null;
    return (data[def.listKey]||[]).find(p => p.id === partyId) || null;
  }, [partyType, partyId, data]);

  /* Reset partyId when type changes */
  useEffect(() => { setPartyId(""); setPartySearch(""); }, [partyType]);

  /* Load entries when party + range change */
  const load = async () => {
    if(!partyId) { setDays([]); return; }
    setLoading(true);
    try {
      const result = await readDayRange(showFullHistory ? earliestPossible : from, to);
      setDays(result);
    } catch(e){
      console.error("[CLARK accounting] PartyLedger load failed:", e);
      showToast("⚠️ فشل تحميل البيانات");
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [partyId, from, to, showFullHistory]);

  const ledger = useMemo(() => {
    if(!partyId) return null;
    return getPartyLedger(coa, days, partyId, {
      partyType,
      from: showFullHistory ? null : from,
      to: showFullHistory ? null : to,
      openingBalance: 0,
    });
  }, [coa, days, partyId, partyType, from, to, showFullHistory]);

  const partyDef = PARTY_TYPES.find(p => p.key === partyType);
  const balanceLabel = ledger ? (ledger.isAssetParty ? "مدين له" : "دائن له") : "";

  const handlePrint = () => {
    if(!ledger || !selectedParty) return;
    printPartyStatement(
      {...ledger, fromDate: showFullHistory ? null : from, toDate: showFullHistory ? null : to},
      partyType,
      selectedParty.name,
      configInfo
    );
  };

  return <Card title="👥 كشف حساب جاري" style={{marginBottom:16}}>
    <div style={{fontSize:FS-2, color:T.textSec, marginBottom:14, lineHeight:1.7}}>
      💡 كشف حساب موحد من القيود المحاسبية مباشرة — يعكس كل الحركات (مبيعات، دفعات، تسويات، قيود يدوية) في مكان واحد.
    </div>

    {/* Party type tabs */}
    <div style={{display:"flex", gap:6, marginBottom:12, flexWrap:"wrap"}}>
      {PARTY_TYPES.map(p => {
        const isActive = partyType === p.key;
        return <div key={p.key} onClick={() => setPartyType(p.key)} style={{
          padding:"8px 14px", cursor:"pointer", borderRadius:8,
          background: isActive ? p.color+"15" : T.cardSolid,
          border:"2px solid "+(isActive ? p.color : T.brd),
          fontSize:FS-1, fontWeight:isActive?800:600, color: isActive ? p.color : T.text,
          display:"inline-flex", alignItems:"center", gap:6,
        }}>
          <span>{p.icon}</span><span>{p.label}</span>
        </div>;
      })}
    </div>

    {/* Party selector + date range */}
    <div style={{display:"grid", gridTemplateColumns: isMob ? "1fr" : "2fr 1fr 1fr 1fr", gap:8, marginBottom:14}}>
      <div>
        <label style={{fontSize:FS-2, color:T.textSec, fontWeight:700, display:"block", marginBottom:4}}>اختر {partyDef?.label}</label>
        <Inp value={partySearch} onChange={setPartySearch} placeholder={"🔎 ابحث عن "+(partyDef?.label||"")+"..."}/>
        {partySearch && <div style={{maxHeight:200, overflowY:"auto", marginTop:4, border:"1px solid "+T.brd, borderRadius:6, background:T.cardSolid}}>
          {partyList.length === 0 ? <div style={{padding:10, color:T.textMut, fontSize:FS-2, textAlign:"center"}}>لا توجد نتائج</div>
          : partyList.slice(0,30).map(p => <div key={p.id} onClick={() => {setPartyId(p.id); setPartySearch(p.name);}} style={{padding:"6px 10px", borderBottom:"1px solid "+T.brd, cursor:"pointer", fontSize:FS-1, fontWeight:600, color:p.id===partyId?T.accent:T.text, background:p.id===partyId?T.accent+"10":"transparent"}} onMouseEnter={e => e.currentTarget.style.background = T.bg} onMouseLeave={e => e.currentTarget.style.background = p.id===partyId?T.accent+"10":"transparent"}>
            {p.name}
          </div>)}
        </div>}
      </div>
      <div>
        <label style={{fontSize:FS-2, color:T.textSec, fontWeight:700, display:"block", marginBottom:4}}>من</label>
        <Inp type="date" value={from} onChange={setFrom} disabled={showFullHistory}/>
      </div>
      <div>
        <label style={{fontSize:FS-2, color:T.textSec, fontWeight:700, display:"block", marginBottom:4}}>إلى</label>
        <Inp type="date" value={to} onChange={setTo} disabled={showFullHistory}/>
      </div>
      <div>
        <label style={{fontSize:FS-2, color:T.textSec, fontWeight:700, display:"block", marginBottom:4}}>&nbsp;</label>
        <span onClick={() => setShowFullHistory(s => !s)} style={{display:"inline-flex", alignItems:"center", gap:6, padding:"8px 12px", borderRadius:6, cursor:"pointer", background:showFullHistory?T.accent+"15":T.bg, border:"1px solid "+(showFullHistory?T.accent+"40":T.brd), fontSize:FS-2, fontWeight:700, color:showFullHistory?T.accent:T.textSec}}>
          {showFullHistory?"☑":"☐"} كل الحركات
        </span>
      </div>
    </div>

    {!partyId ? <div style={{padding:30, textAlign:"center", color:T.textMut, background:T.bg, borderRadius:10, border:"1px dashed "+T.brd}}>
      <div style={{fontSize:36, marginBottom:8}}>{partyDef?.icon}</div>
      <div style={{fontSize:FS, fontWeight:700, color:T.text, marginBottom:4}}>اختر {partyDef?.label} لعرض كشف حسابه</div>
      <div style={{fontSize:FS-1, color:T.textSec}}>ابدأ بالكتابة في صندوق البحث أعلاه</div>
    </div> : loading ? <div style={{padding:30, textAlign:"center", color:T.textMut}}>⏳ جاري التحميل...</div>
    : ledger && <>
      {/* Summary cards */}
      <div style={{display:"grid", gridTemplateColumns: isMob ? "1fr 1fr" : "repeat(4,1fr)", gap:8, marginBottom:14}}>
        <div style={{padding:12, background:T.ok+"08", borderRadius:8, textAlign:"center", border:"1px solid "+T.ok+"40"}}>
          <div style={{fontSize:FS-2, color:T.textSec, marginBottom:4}}>إجمالي مدين</div>
          <div style={{fontSize:FS+1, fontWeight:800, color:T.ok, direction:"ltr", fontFamily:"monospace"}}>{fmt(ledger.totals.debit.toFixed(2))}</div>
        </div>
        <div style={{padding:12, background:T.err+"08", borderRadius:8, textAlign:"center", border:"1px solid "+T.err+"40"}}>
          <div style={{fontSize:FS-2, color:T.textSec, marginBottom:4}}>إجمالي دائن</div>
          <div style={{fontSize:FS+1, fontWeight:800, color:T.err, direction:"ltr", fontFamily:"monospace"}}>{fmt(ledger.totals.credit.toFixed(2))}</div>
        </div>
        <div style={{padding:12, background: ledger.totals.balance >= 0 ? T.accent+"08" : T.warn+"08", borderRadius:8, textAlign:"center", border:"1px solid "+(ledger.totals.balance >= 0 ? T.accent+"40" : T.warn+"40"), gridColumn: isMob ? "1/3" : "auto"}}>
          <div style={{fontSize:FS-2, color:T.textSec, marginBottom:4}}>الرصيد ({balanceLabel})</div>
          <div style={{fontSize:FS+2, fontWeight:800, color: ledger.totals.balance >= 0 ? T.accent : T.warn, direction:"ltr", fontFamily:"monospace"}}>{fmt(Math.abs(ledger.totals.balance).toFixed(2))}</div>
        </div>
        <div style={{padding:12, background:T.bg, borderRadius:8, textAlign:"center", border:"1px solid "+T.brd, gridColumn: isMob ? "1/3" : "auto"}}>
          <div style={{fontSize:FS-2, color:T.textSec, marginBottom:4}}>عدد الحركات</div>
          <div style={{fontSize:FS+1, fontWeight:800, color:T.text}}>{ledger.lines.length}</div>
        </div>
      </div>

      {/* Print button */}
      <div style={{display:"flex", justifyContent:"flex-end", marginBottom:10}}>
        <Btn ghost onClick={handlePrint} disabled={ledger.lines.length === 0}>🖨 طباعة كشف الحساب / PDF</Btn>
      </div>

      {/* Ledger table */}
      {ledger.lines.length === 0 ? <div style={{padding:30, textAlign:"center", color:T.textMut, background:T.bg, borderRadius:10, border:"1px dashed "+T.brd}}>
        لا توجد حركات في هذه الفترة
      </div> : <div style={{overflowX:"auto", border:"1px solid "+T.brd, borderRadius:8}}>
        <table style={{width:"100%", borderCollapse:"collapse", fontSize:FS-1}}>
          <thead><tr style={{background:T.accent+"08"}}>
            <th style={{padding:"10px 12px", textAlign:"right", color:T.textSec, fontWeight:800, fontSize:FS-2, borderBottom:"2px solid "+T.brd}}>التاريخ</th>
            <th style={{padding:"10px 12px", textAlign:"right", color:T.textSec, fontWeight:800, fontSize:FS-2, borderBottom:"2px solid "+T.brd}}>المرجع</th>
            <th style={{padding:"10px 12px", textAlign:"right", color:T.textSec, fontWeight:800, fontSize:FS-2, borderBottom:"2px solid "+T.brd}}>البيان</th>
            {!isMob && <th style={{padding:"10px 12px", textAlign:"right", color:T.textSec, fontWeight:800, fontSize:FS-2, borderBottom:"2px solid "+T.brd}}>الحساب</th>}
            <th style={{padding:"10px 12px", textAlign:"center", color:T.textSec, fontWeight:800, fontSize:FS-2, borderBottom:"2px solid "+T.brd, width:100}}>مدين</th>
            <th style={{padding:"10px 12px", textAlign:"center", color:T.textSec, fontWeight:800, fontSize:FS-2, borderBottom:"2px solid "+T.brd, width:100}}>دائن</th>
            <th style={{padding:"10px 12px", textAlign:"center", color:T.textSec, fontWeight:800, fontSize:FS-2, borderBottom:"2px solid "+T.brd, width:120}}>الرصيد</th>
          </tr></thead>
          <tbody>{ledger.lines.map((l,i) => <tr key={i} style={{borderTop:"1px solid "+T.brd}}>
            <td style={{padding:"7px 10px", fontFamily:"monospace", fontSize:FS-2}}>{l.date}</td>
            <td style={{padding:"7px 10px", fontFamily:"monospace", fontSize:FS-2, color:T.accent, fontWeight:700}}>{l.refNo}</td>
            <td style={{padding:"7px 10px"}}>
              <div style={{fontWeight:600}}>{l.narration}</div>
              {l.note && <div style={{fontSize:FS-3, color:T.textMut, marginTop:1}}>{l.note}</div>}
              {isMob && <div style={{fontSize:FS-3, color:T.textMut, marginTop:1}}><span style={{fontFamily:"monospace"}}>{l.accountCode}</span> {l.accountName}</div>}
            </td>
            {!isMob && <td style={{padding:"7px 10px", color:T.textSec, fontSize:FS-2}}>
              <span style={{fontFamily:"monospace", color:T.accent, fontWeight:700, marginInlineEnd:4}}>{l.accountCode}</span>
              {l.accountName}
            </td>}
            <td style={{padding:"7px 10px", textAlign:"center", direction:"ltr", color:l.debit>0?T.ok:T.textMut, fontWeight:l.debit>0?700:400}}>{l.debit>0 ? fmt(l.debit.toFixed(2)) : "—"}</td>
            <td style={{padding:"7px 10px", textAlign:"center", direction:"ltr", color:l.credit>0?T.err:T.textMut, fontWeight:l.credit>0?700:400}}>{l.credit>0 ? fmt(l.credit.toFixed(2)) : "—"}</td>
            <td style={{padding:"7px 10px", textAlign:"center", direction:"ltr", fontWeight:800, color: l.runningBalance >= 0 ? T.accent : T.warn}}>{fmt(Math.abs(l.runningBalance).toFixed(2))}</td>
          </tr>)}</tbody>
          <tfoot><tr style={{background:T.accent+"15", borderTop:"2px solid "+T.accent}}>
            <td colSpan={isMob?3:4} style={{padding:"10px 12px", fontWeight:800, color:T.accent}}>الإجمالي</td>
            <td style={{padding:"10px 12px", textAlign:"center", direction:"ltr", fontWeight:800, color:T.ok, fontSize:FS}}>{fmt(ledger.totals.debit.toFixed(2))}</td>
            <td style={{padding:"10px 12px", textAlign:"center", direction:"ltr", fontWeight:800, color:T.err, fontSize:FS}}>{fmt(ledger.totals.credit.toFixed(2))}</td>
            <td style={{padding:"10px 12px", textAlign:"center", direction:"ltr", fontWeight:800, color: ledger.totals.balance >= 0 ? T.accent : T.warn}}>{fmt(Math.abs(ledger.totals.balance).toFixed(2))}</td>
          </tr></tfoot>
        </table>
      </div>}
    </>}
  </Card>;
}
