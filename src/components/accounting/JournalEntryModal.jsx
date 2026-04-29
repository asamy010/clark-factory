/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · JournalEntryModal
   ───────────────────────────────────────────────────────────────────────
   Popup for adding or editing a manual journal entry. Multi-line debit/
   credit grid with running totals + balance check.

   V18.41: per-line currency support. If a line is in a foreign currency,
   the user enters fcAmount + fxRate, and we compute the EGP equivalent
   for the actual debit/credit. Totals are always shown in EGP.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { Btn, Inp, Sel } from "../ui.jsx";
import { AccountSelector } from "./AccountSelector.jsx";
import { gid, fmt } from "../../utils/format.js";
import { validateLines } from "../../utils/accounting/posting.js";
import {
  getCurrencies, getFunctionalCurrency, isMultiCurrencyEnabled,
  findFxRate, FUNCTIONAL_CURRENCY,
} from "../../utils/accounting/currency.js";

const _emptyLine = () => ({_k: gid(), accountId:null, debit:0, credit:0, note:"", fcCurrency: FUNCTIONAL_CURRENCY, fcAmount:"", fxRate:1});

export function JournalEntryModal({existing, defaultDate, coa, config, onSave, onCancel, T, FS, isMob}){
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate]           = useState(existing?.date || defaultDate || today);
  const [narration, setNarration] = useState(existing?.narration || "");
  const multiEnabled = isMultiCurrencyEnabled(config);
  const currencies = getCurrencies(config);
  const functional = getFunctionalCurrency(config);

  const [lines, setLines] = useState(() => {
    if(existing?.lines?.length){
      return existing.lines.map(l => ({
        ...l,
        _k: gid(),
        fcCurrency: l.fcCurrency || FUNCTIONAL_CURRENCY,
        fcAmount: l.fcAmount || "",
        fxRate: l.fxRate || 1,
      }));
    }
    return [_emptyLine(), _emptyLine()];
  });

  /* When line changes currency, lookup the rate for the entry date */
  const updLineCurrency = (k, newCurrency) => {
    setLines(p => p.map(l => {
      if(l._k !== k) return l;
      if(newCurrency === FUNCTIONAL_CURRENCY){
        return {...l, fcCurrency: FUNCTIONAL_CURRENCY, fxRate:1, fcAmount:""};
      }
      const r = findFxRate(config, newCurrency, date);
      return {
        ...l,
        fcCurrency: newCurrency,
        fxRate: r ? Number(r.rate)||1 : 1,
        fcAmount: l.fcAmount || "",
      };
    }));
  };

  /* Compute the EGP-equivalent debit/credit when fcAmount/fxRate change */
  const updLineFcAmount = (k, side, fcVal) => {
    setLines(p => p.map(l => {
      if(l._k !== k) return l;
      const fc = Number(fcVal)||0;
      const rate = Number(l.fxRate)||1;
      const egp = Math.round(fc * rate * 100)/100;
      const next = {...l, fcAmount: fcVal};
      if(side === "debit"){
        next.debit = egp;
        if(egp > 0) next.credit = 0;
      } else {
        next.credit = egp;
        if(egp > 0) next.debit = 0;
      }
      return next;
    }));
  };

  const updLineRate = (k, newRate) => {
    setLines(p => p.map(l => {
      if(l._k !== k) return l;
      const rate = Number(newRate)||0;
      const fc = Number(l.fcAmount)||0;
      const egp = Math.round(fc * rate * 100)/100;
      const next = {...l, fxRate: newRate};
      /* Recompute whichever side is set */
      if(l.debit > 0) next.debit = egp;
      else if(l.credit > 0) next.credit = egp;
      return next;
    }));
  };

  const updLine = (k, patch) => setLines(p => p.map(l => l._k===k ? {...l, ...patch} : l));
  const addLine = () => setLines(p => [...p, _emptyLine()]);
  const remLine = (k) => setLines(p => p.length<=2 ? p : p.filter(l => l._k!==k));

  const totals = useMemo(() => {
    const d = lines.reduce((s,l) => s + (Number(l.debit)||0), 0);
    const c = lines.reduce((s,l) => s + (Number(l.credit)||0), 0);
    return {d, c, diff: d-c, balanced: Math.abs(d-c) < 0.01 && d > 0};
  }, [lines]);

  const handleSave = () => {
    try {
      validateLines(lines, coa);
    } catch(e){
      alert(e.message); return;
    }
    if(!date){ alert("اختر التاريخ"); return; }
    /* Pass currency-aware lines through */
    const cleanLines = lines.map(l => {
      const out = {
        accountId: l.accountId,
        accountCode: l.accountCode,
        accountName: l.accountName,
        debit: Number(l.debit)||0,
        credit: Number(l.credit)||0,
        note: l.note||"",
      };
      if(l.fcCurrency && l.fcCurrency !== FUNCTIONAL_CURRENCY && Number(l.fcAmount)){
        out.fcCurrency = l.fcCurrency;
        out.fcAmount = Number(l.fcAmount);
        out.fxRate = Number(l.fxRate)||1;
      }
      return out;
    });
    onSave({date, narration, lines: cleanLines});
  };

  const isWideMode = !isMob && multiEnabled;

  return <div className="pop-overlay" style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:10001, display:"flex", alignItems:"center", justifyContent:"center", padding:16}} onClick={onCancel}>
    <div onClick={e => e.stopPropagation()} style={{background:T.cardSolid, borderRadius:16, padding:isMob?16:24, width:"100%", maxWidth:multiEnabled?1100:900, maxHeight:"92vh", overflowY:"auto", border:"1px solid "+T.brd, boxShadow:"0 25px 70px rgba(0,0,0,0.4)"}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16}}>
        <div style={{fontSize:FS+2, fontWeight:800, color:T.accent}}>{existing ? "✏️ تعديل قيد" : "➕ قيد يومية جديد"}</div>
        <Btn ghost small onClick={onCancel}>✕</Btn>
      </div>

      {/* Header: date + narration */}
      <div style={{display:"grid", gridTemplateColumns:isMob?"1fr":"180px 1fr", gap:10, marginBottom:14}}>
        <div><label style={{fontSize:FS-2, color:T.textSec, fontWeight:700, display:"block", marginBottom:4}}>التاريخ</label>
          <Inp type="date" value={date} onChange={setDate}/></div>
        <div><label style={{fontSize:FS-2, color:T.textSec, fontWeight:700, display:"block", marginBottom:4}}>البيان</label>
          <Inp value={narration} onChange={setNarration} placeholder="مثلاً: تسوية رصيد العميل ..."/></div>
      </div>

      {multiEnabled && <div style={{padding:"6px 10px", background:T.accent+"08", borderRadius:6, fontSize:FS-3, color:T.textSec, marginBottom:10, lineHeight:1.6}}>
        💱 وضع تعدد العملات نشط — اختر العملة لكل سطر. القيم بالعملة الأساسية ({functional.code}) تُحسب تلقائياً وتظهر مباشرة لمراجعتها.
      </div>}

      {/* Lines table */}
      <div style={{border:"1px solid "+T.brd, borderRadius:8, overflow:"hidden", marginBottom:14}}>
        <div style={{display:"grid", gridTemplateColumns: isWideMode
          ? "1.6fr 1fr 80px 110px 90px 110px 110px 36px"
          : (isMob ? "1fr 100px 100px 36px" : "1fr 1fr 130px 130px 36px"),
          gap:6, padding:"10px 12px", background:T.accent+"08", fontSize:FS-2, fontWeight:800, color:T.textSec}}>
          <div>الحساب</div>
          {!isMob && !isWideMode && <div>ملاحظة</div>}
          {isWideMode && <div>ملاحظة</div>}
          {isWideMode && <div style={{textAlign:"center"}}>عملة</div>}
          {isWideMode && <div style={{textAlign:"center"}}>المبلغ بالعملة</div>}
          {isWideMode && <div style={{textAlign:"center"}}>سعر الصرف</div>}
          <div style={{textAlign:"center"}}>مدين ({functional.code})</div>
          <div style={{textAlign:"center"}}>دائن ({functional.code})</div>
          <div></div>
        </div>
        {lines.map(l => <div key={l._k} style={{display:"grid", gridTemplateColumns: isWideMode
          ? "1.6fr 1fr 80px 110px 90px 110px 110px 36px"
          : (isMob ? "1fr 100px 100px 36px" : "1fr 1fr 130px 130px 36px"),
          gap:6, padding:"8px 12px", borderTop:"1px solid "+T.brd, alignItems:"center"}}>
          <AccountSelector value={l.accountId} onChange={id => updLine(l._k, {accountId:id})} coa={coa} T={T} FS={FS}/>
          {!isMob && <Inp value={l.note} onChange={v => updLine(l._k, {note:v})} placeholder="ملاحظة..."/>}
          {isWideMode && <Sel value={l.fcCurrency} onChange={v => updLineCurrency(l._k, v)}>
            {currencies.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
          </Sel>}
          {isWideMode && <Inp type="number" disabled={l.fcCurrency===FUNCTIONAL_CURRENCY} value={l.fcAmount} onChange={v => updLineFcAmount(l._k, l.debit > 0 ? "debit" : "credit", v)} placeholder={l.fcCurrency===FUNCTIONAL_CURRENCY?"-":""} style={{textAlign:"center", direction:"ltr", opacity:l.fcCurrency===FUNCTIONAL_CURRENCY?0.5:1}}/>}
          {isWideMode && <Inp type="number" step="0.0001" disabled={l.fcCurrency===FUNCTIONAL_CURRENCY} value={l.fxRate} onChange={v => updLineRate(l._k, v)} style={{textAlign:"center", direction:"ltr", opacity:l.fcCurrency===FUNCTIONAL_CURRENCY?0.5:1}}/>}
          <Inp type="number" disabled={l.fcCurrency!==FUNCTIONAL_CURRENCY} value={l.debit} onChange={v => updLine(l._k, {debit:Number(v)||0, credit: (Number(v)||0)>0 ? 0 : l.credit})} style={{textAlign:"center", direction:"ltr", opacity:l.fcCurrency!==FUNCTIONAL_CURRENCY?0.7:1, background: l.fcCurrency!==FUNCTIONAL_CURRENCY ? T.bg : undefined}}/>
          <Inp type="number" disabled={l.fcCurrency!==FUNCTIONAL_CURRENCY} value={l.credit} onChange={v => updLine(l._k, {credit:Number(v)||0, debit: (Number(v)||0)>0 ? 0 : l.debit})} style={{textAlign:"center", direction:"ltr", opacity:l.fcCurrency!==FUNCTIONAL_CURRENCY?0.7:1, background: l.fcCurrency!==FUNCTIONAL_CURRENCY ? T.bg : undefined}}/>
          <Btn ghost small onClick={() => remLine(l._k)} disabled={lines.length<=2} style={{color:lines.length<=2?T.textMut:T.err}}>🗑</Btn>
        </div>)}
      </div>

      <Btn ghost onClick={addLine} style={{marginBottom:14}}>➕ سطر جديد</Btn>

      {/* Totals row */}
      <div style={{display:"grid", gridTemplateColumns: isMob ? "1fr 1fr 1fr" : "1fr 130px 130px", gap:6, padding:"12px", background: totals.balanced ? T.ok+"10" : T.err+"10", borderRadius:8, marginBottom:14, alignItems:"center"}}>
        <div style={{fontSize:FS-1, fontWeight:800, color:T.textSec}}>الإجمالي ({functional.code})</div>
        <div style={{textAlign:"center", direction:"ltr", fontWeight:800, color:T.accent}}>{fmt(totals.d.toFixed(2))}</div>
        <div style={{textAlign:"center", direction:"ltr", fontWeight:800, color:T.accent}}>{fmt(totals.c.toFixed(2))}</div>
      </div>
      {!totals.balanced && totals.d+totals.c > 0 && <div style={{fontSize:FS-2, color:T.err, fontWeight:700, marginBottom:14, padding:"8px 12px", background:T.err+"08", borderRadius:6}}>
        ⚠️ القيد غير متوازن — الفرق: {fmt(Math.abs(totals.diff).toFixed(2))} {functional.code}
      </div>}

      <div style={{display:"flex", gap:8, justifyContent:"flex-end", paddingTop:12, borderTop:"1px solid "+T.brd}}>
        <Btn ghost onClick={onCancel}>↩️ إلغاء</Btn>
        <Btn primary onClick={handleSave} disabled={!totals.balanced} style={{background: totals.balanced ? T.ok : T.textMut, color:"#fff", border:"none", fontWeight:800, padding:"10px 24px", opacity:totals.balanced?1:0.5}}>💾 حفظ القيد</Btn>
      </div>
    </div>
  </div>;
}
