/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · OpeningBalancesModal
   ───────────────────────────────────────────────────────────────────────
   Friendly form for entering the system's opening balances. Groups leaf
   accounts by type (asset / liability / equity), shows a running totals
   bar, auto-balances against a chosen capital/equity account.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useMemo } from "react";
import { Btn, Inp, Sel } from "../ui.jsx";
import { AccountSelector } from "./AccountSelector.jsx";
import { getLeafAccounts, getAccountByCode, ACCOUNT_TYPES } from "../../utils/accounting/coa.js";
import {
  postOpeningBalances, reverseOpeningBalance,
  findOpeningBalance, extractBalancesFromEntry,
} from "../../utils/accounting/openingBalances.js";
import { fmt } from "../../utils/format.js";

const TYPE_GROUPS = [
  {key:"asset",     title:"💰 الأصول",         subtitle:"الموجودات: نقدية، عملاء، مخزون، أصول ثابتة", color:"#0EA5E9"},
  {key:"liability", title:"⚖️ الخصوم",         subtitle:"المطلوبات: موردين، قروض، دائنون",          color:"#EF4444"},
  {key:"equity",    title:"🏛️ حقوق الملكية",   subtitle:"رأس المال + الأرباح المحتجزة السابقة",     color:"#8B5CF6"},
];

export function OpeningBalancesModal({coa, T, FS, isMob, onClose, showToast, userName, currentConfig, upConfig}){
  const today = new Date().toISOString().split("T")[0];
  const yearStart = today.slice(0,4) + "-01-01";

  const cfg = currentConfig?.openingBalanceConfig || null;

  /* Form state */
  const [date, setDate]     = useState(cfg?.date || yearStart);
  const [origDate, setOrigDate] = useState(cfg?.date || null);/* the date of the existing entry, if any */
  const [balancingAccountCode, setBalancingAccountCode] = useState(cfg?.balancingAccount || "3100");
  const [balances, setBalances] = useState(cfg?.balances || {});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasExisting, setHasExisting] = useState(false);

  /* Try to load the existing entry on mount (and whenever the date changes) */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    findOpeningBalance(date).then(found => {
      if(cancelled) return;
      if(found){
        const restored = extractBalancesFromEntry(found.entry, coa);
        setBalances(restored);
        setHasExisting(true);
        setOrigDate(found.date);
      } else {
        setHasExisting(false);
      }
    }).catch(() => {/* ignore */}).finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [date]);/* eslint-disable-line */

  /* Group leaf accounts by type */
  const accountsByType = useMemo(() => {
    const out = {asset:[], liability:[], equity:[], revenue:[], expense:[]};
    getLeafAccounts(coa).forEach(a => {
      if(out[a.type]) out[a.type].push(a);
    });
    /* Sort each group by code */
    Object.values(out).forEach(arr =>
      arr.sort((a,b) => (a.code||"").localeCompare(b.code||"", undefined, {numeric:true}))
    );
    return out;
  }, [coa]);

  /* Compute running totals */
  const totals = useMemo(() => {
    let dr = 0, cr = 0;
    Object.entries(balances).forEach(([code, amt]) => {
      const a = parseFloat(amt) || 0;
      if(Math.abs(a) < 0.01) return;
      const acct = getAccountByCode(coa, code);
      if(!acct) return;
      const isDebit = acct.type === "asset" || acct.type === "expense";
      if(isDebit) dr += a; else cr += a;
    });
    return {dr: Math.round(dr*100)/100, cr: Math.round(cr*100)/100, diff: Math.round((dr-cr)*100)/100};
  }, [balances, coa]);

  const balancer = balancingAccountCode ? getAccountByCode(coa, balancingAccountCode) : null;
  /* Whether the balancing line goes Dr or Cr depends on the balancer's natural side AND the diff.
     We surface a clear text to the user. */
  const balancerSide = balancer ? (() => {
    if(Math.abs(totals.diff) < 0.01) return null;
    return totals.diff > 0 ? "credit" : "debit";
  })() : null;

  const updBalance = (code, val) => {
    setBalances(p => {
      const next = {...p};
      const num = parseFloat(val);
      if(!val || isNaN(num) || num === 0) delete next[code];
      else next[code] = num;
      return next;
    });
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      /* If existing entry was on a different date, reverse it first */
      if(hasExisting && origDate && origDate !== date){
        await reverseOpeningBalance(origDate, userName);
      }
      /* Post new (or update on same date — postEntry handles upsert) */
      const built = await postOpeningBalances({
        balancesByCode: balances, coa, date,
        balancingAccountCode, createdBy: userName,
      });
      /* Persist config so we can preload next time */
      if(typeof upConfig === "function"){
        upConfig(d => {
          d.openingBalanceConfig = {
            date, balancingAccount: balancingAccountCode,
            balances: {...balances},
            postedAt: new Date().toISOString(), postedBy: userName||"",
            entryRefNo: built?.refNo || "",
          };
        });
      }
      showToast("✅ تم حفظ الأرصدة الافتتاحية وترحيلها");
      onClose();
    } catch(e){
      console.error(e);
      alert("⚠️ فشل الحفظ:\n"+(e.message||e));
    } finally {
      setBusy(false);
    }
  };

  const handleClear = async () => {
    if(!confirm("سيتم حذف الأرصدة الافتتاحية وعكس قيدها. متأكد؟")) return;
    setBusy(true);
    try {
      if(origDate) await reverseOpeningBalance(origDate, userName);
      if(typeof upConfig === "function"){
        upConfig(d => { delete d.openingBalanceConfig; });
      }
      showToast("✓ تم حذف الأرصدة الافتتاحية");
      onClose();
    } catch(e){
      alert("⚠️ فشل: "+(e.message||e));
    } finally {
      setBusy(false);
    }
  };

  return <div className="pop-overlay" style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:10001, display:"flex", alignItems:"center", justifyContent:"center", padding:isMob?8:16}} onClick={onClose}>
    <div onClick={e => e.stopPropagation()} style={{background:T.cardSolid, borderRadius:14, width:"100%", maxWidth:780, maxHeight:"94vh", display:"flex", flexDirection:"column", border:"1px solid "+T.brd, boxShadow:"0 25px 70px rgba(0,0,0,0.4)"}}>

      {/* Header (sticky) */}
      <div style={{padding:isMob?14:18, borderBottom:"1px solid "+T.brd, display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0}}>
        <div>
          <div style={{fontSize:FS+2, fontWeight:800, color:T.accent}}>🏁 الأرصدة الافتتاحية</div>
          <div style={{fontSize:FS-2, color:T.textSec, marginTop:2}}>أدخل أرصدة كل حساب عند بداية تشغيل النظام</div>
        </div>
        <Btn ghost small onClick={onClose}>✕</Btn>
      </div>

      {/* Top form: date + balancing account */}
      <div style={{padding:isMob?12:16, background:T.bg, borderBottom:"1px solid "+T.brd, flexShrink:0}}>
        <div style={{display:"grid", gridTemplateColumns: isMob?"1fr":"1fr 2fr", gap:10}}>
          <div>
            <label style={{fontSize:FS-2, color:T.textSec, fontWeight:700, display:"block", marginBottom:4}}>📅 تاريخ الافتتاح</label>
            <Inp type="date" value={date} onChange={setDate}/>
          </div>
          <div>
            <label style={{fontSize:FS-2, color:T.textSec, fontWeight:700, display:"block", marginBottom:4}}>⚖️ حساب التوازن (يمتص الفرق — عادة رأس المال)</label>
            <AccountSelector value={balancer?.id||null} onChange={id => {const a = coa.find(x => x.id===id); if(a) setBalancingAccountCode(a.code);}} coa={coa} T={T} FS={FS} filterType="equity"/>
          </div>
        </div>
        {hasExisting && <div style={{marginTop:10, padding:"8px 12px", background:T.warn+"15", borderRadius:6, fontSize:FS-2, color:T.warn, fontWeight:700}}>
          ℹ️ تم تحميل الأرصدة الافتتاحية الموجودة — أي تعديلات هتتعكس بحفظ القيد القديم وإنشاء قيد جديد
        </div>}
      </div>

      {/* Account groups */}
      <div style={{flex:1, overflowY:"auto", padding:isMob?12:16}}>
        {loading ? <div style={{padding:40, textAlign:"center", color:T.textMut}}>⏳ جاري التحميل...</div>
        : TYPE_GROUPS.map(g => {
            const accts = accountsByType[g.key] || [];
            if(accts.length === 0) return null;
            return <div key={g.key} style={{marginBottom:18}}>
              <div style={{display:"flex", alignItems:"center", gap:8, padding:"8px 12px", background:g.color+"10", borderRadius:8, marginBottom:8, borderInlineStart:`4px solid ${g.color}`}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:FS, fontWeight:800, color:g.color}}>{g.title}</div>
                  <div style={{fontSize:FS-3, color:T.textMut, marginTop:1}}>{g.subtitle}</div>
                </div>
              </div>
              <div style={{display:"flex", flexDirection:"column", gap:5}}>
                {accts.map(a => {
                  const cur = balances[a.code] || "";
                  const isBalancer = a.code === balancingAccountCode;
                  return <div key={a.id} style={{display:"flex", alignItems:"center", gap:8, padding:"6px 10px", background: isBalancer?T.accent+"08":T.cardSolid, borderRadius:6, border:"1px solid "+(isBalancer?T.accent+"40":T.brd)}}>
                    <span style={{fontFamily:"monospace", color:g.color, fontWeight:800, minWidth:48, fontSize:FS-2}}>{a.code}</span>
                    <span style={{flex:1, fontSize:FS-1, fontWeight:600, color:T.text}}>{a.name}</span>
                    {isBalancer ? <span style={{fontSize:FS-3, color:T.accent, fontWeight:700, padding:"3px 8px", background:T.accent+"15", borderRadius:4, fontFamily:"monospace", direction:"ltr"}}>
                      {Math.abs(totals.diff) < 0.01 ? "0.00" : fmt(Math.abs(totals.diff).toFixed(2))} <span style={{fontSize:FS-3, opacity:0.7}}>(تلقائي)</span>
                    </span> : <input
                      type="number"
                      value={cur}
                      onChange={e => updBalance(a.code, e.target.value)}
                      placeholder="0"
                      style={{width:130, padding:"6px 8px", textAlign:"left", direction:"ltr", fontFamily:"monospace", fontSize:FS-1, borderRadius:4, border:"1px solid "+T.brd, background:T.cardSolid, color:T.text}}
                    />}
                  </div>;
                })}
              </div>
            </div>;
          })}
        {!loading && Object.keys(accountsByType.asset||{}).length === 0 && Object.keys(accountsByType.liability||{}).length === 0 && Object.keys(accountsByType.equity||{}).length === 0 && <div style={{padding:30, textAlign:"center", color:T.textMut, background:T.bg, borderRadius:8, border:"1px dashed "+T.brd}}>
          ⚠️ لا توجد حسابات فرعية في الشجرة. ابدأ بزرع الشجرة الافتراضية أولاً.
        </div>}
      </div>

      {/* Totals bar (sticky) */}
      <div style={{padding:isMob?12:16, background:T.bg, borderTop:"1px solid "+T.brd, flexShrink:0}}>
        <div style={{display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:10}}>
          <div style={{padding:"8px 10px", background:T.ok+"10", borderRadius:6, textAlign:"center"}}>
            <div style={{fontSize:FS-3, color:T.textSec}}>إجمالي مدين</div>
            <div style={{fontSize:FS+1, fontWeight:800, color:T.ok, direction:"ltr", fontFamily:"monospace"}}>{fmt(totals.dr.toFixed(2))}</div>
          </div>
          <div style={{padding:"8px 10px", background:T.err+"10", borderRadius:6, textAlign:"center"}}>
            <div style={{fontSize:FS-3, color:T.textSec}}>إجمالي دائن</div>
            <div style={{fontSize:FS+1, fontWeight:800, color:T.err, direction:"ltr", fontFamily:"monospace"}}>{fmt(totals.cr.toFixed(2))}</div>
          </div>
          <div style={{padding:"8px 10px", background:T.accent+"10", borderRadius:6, textAlign:"center"}}>
            <div style={{fontSize:FS-3, color:T.textSec}}>الفرق ({balancerSide==="credit"?"دائن":balancerSide==="debit"?"مدين":"-"})</div>
            <div style={{fontSize:FS+1, fontWeight:800, color:T.accent, direction:"ltr", fontFamily:"monospace"}}>{fmt(Math.abs(totals.diff).toFixed(2))}</div>
          </div>
        </div>
        <div style={{display:"flex", gap:8, justifyContent:"space-between", flexWrap:"wrap"}}>
          {hasExisting && <Btn ghost onClick={handleClear} disabled={busy} style={{color:T.err}}>🗑 حذف الأرصدة الافتتاحية</Btn>}
          <div style={{flex:1}}/>
          <Btn ghost onClick={onClose} disabled={busy}>↩️ إلغاء</Btn>
          <Btn primary onClick={handleSave} disabled={busy || !balancer} style={{background:T.ok, color:"#fff", border:"none", fontWeight:800, padding:"10px 24px"}}>
            {busy ? "⏳ جاري الحفظ..." : "💾 حفظ وترحيل"}
          </Btn>
        </div>
      </div>
    </div>
  </div>;
}
