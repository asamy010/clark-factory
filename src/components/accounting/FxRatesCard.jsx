/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · FxRatesCard
   ───────────────────────────────────────────────────────────────────────
   Manages the data.fxRates list — add, edit, delete exchange rates by
   (currency, date). Used for both posting and reporting.

   Storage:
     data.fxRates = [
       { id, currency, date, rate, by, createdAt }
     ]

   The card is rendered in AccountingSettingsTab. Hidden when there's only
   one currency (functional only) — multi-currency must be enabled first.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { Btn, Card, Inp, Sel } from "../ui.jsx";
import { gid, fmt } from "../../utils/format.js";
import { getCurrencies, getFunctionalCurrency, isMultiCurrencyEnabled } from "../../utils/accounting/currency.js";
import { ask, tell } from "../../utils/popups.js";

export function FxRatesCard({config, upConfig, T, FS, isMob, showToast, userName}){
  const [adding, setAdding]   = useState(false);
  const [editing, setEditing] = useState(null);/* {id, currency, date, rate} */
  const today = new Date().toISOString().split("T")[0];

  const currencies = getCurrencies(config);
  const foreign = currencies.filter(c => !c.isFunctional);
  const fxRates = config.fxRates || [];

  /* Group rates by currency, sorted by date desc within each */
  const grouped = useMemo(() => {
    const out = new Map();
    fxRates.forEach(r => {
      if(!out.has(r.currency)) out.set(r.currency, []);
      out.get(r.currency).push(r);
    });
    out.forEach(arr => arr.sort((a,b) => (b.date||"").localeCompare(a.date||"")));
    return out;
  }, [fxRates]);

  const startAdd = () => {
    setEditing({id: null, currency: foreign[0]?.code || "USD", date: today, rate: ""});
    setAdding(true);
  };
  const startEdit = (rate) => {
    setEditing({...rate});
    setAdding(true);
  };
  const cancel = () => { setAdding(false); setEditing(null); };

  const save = async () => {
    if(!editing.currency || !editing.date || !editing.rate){
      await tell("بيانات ناقصة", "ادخل العملة والتاريخ وسعر الصرف", {danger:true});
      return;
    }
    const rate = Number(editing.rate);
    if(!rate || rate <= 0){
      await tell("سعر غير صحيح", "سعر الصرف يجب أن يكون أكبر من 0", {danger:true});
      return;
    }
    /* Check for duplicate BEFORE entering upConfig (since ask() is async) */
    if(!editing.id){
      const dup = (config.fxRates || []).find(r => r.currency === editing.currency && r.date === editing.date);
      if(dup){
        if(!await ask("سعر موجود", "يوجد سعر صرف للعملة "+editing.currency+" بتاريخ "+editing.date+". تحديث؟", {confirmText:"تحديث"})) return;
      }
    }
    upConfig(d => {
      if(!Array.isArray(d.fxRates)) d.fxRates = [];
      if(editing.id){
        /* update */
        const idx = d.fxRates.findIndex(r => r.id === editing.id);
        if(idx >= 0) d.fxRates[idx] = {...d.fxRates[idx], currency: editing.currency, date: editing.date, rate};
      } else {
        const dup = d.fxRates.find(r => r.currency === editing.currency && r.date === editing.date);
        if(dup){
          dup.rate = rate;
          dup.editedAt = new Date().toISOString();
          dup.editedBy = userName||"";
        } else {
          d.fxRates.push({
            id: gid(),
            currency: editing.currency, date: editing.date, rate,
            by: userName||"", createdAt: new Date().toISOString(),
          });
        }
      }
    });
    showToast("✓ تم الحفظ");
    cancel();
  };

  const remove = async (rate) => {
    if(!await ask("حذف سعر صرف", "حذف سعر صرف "+rate.currency+" بتاريخ "+rate.date+"؟", {danger:true, confirmText:"حذف"})) return;
    upConfig(d => {
      if(!Array.isArray(d.fxRates)) return;
      d.fxRates = d.fxRates.filter(r => r.id !== rate.id);
    });
    showToast("✓ تم الحذف");
  };

  if(!isMultiCurrencyEnabled(config)) return null;
  const functional = getFunctionalCurrency(config);

  return <Card title="💱 أسعار صرف العملات" style={{marginBottom:16}}>
    <div style={{fontSize:FS-2, color:T.textSec, marginBottom:14, lineHeight:1.7}}>
      💡 سجّل سعر صرف كل عملة أجنبية مقابل <b>{functional.name} ({functional.code})</b>. النظام يستخدم أحدث سعر متاح في تاريخ كل عملية.
      <br/>
      مثال: سعر الدولار 1 يناير = 50.5 → بيعة بـ$1000 يوم 5 يناير هتترحل بـ50,500 ج.م.
    </div>

    <div style={{display:"flex", gap:8, marginBottom:14, flexWrap:"wrap"}}>
      <Btn primary onClick={startAdd} style={{background:T.ok, color:"#fff", border:"none", fontWeight:800}}>➕ سعر صرف جديد</Btn>
    </div>

    {fxRates.length === 0 ? <div style={{padding:30, textAlign:"center", color:T.textMut, background:T.bg, borderRadius:10, border:"1px dashed "+T.brd}}>
      <div style={{fontSize:36, marginBottom:8}}>💱</div>
      <div style={{fontSize:FS, fontWeight:700, color:T.text, marginBottom:4}}>لم يتم إدخال أسعار صرف بعد</div>
      <div style={{fontSize:FS-2, color:T.textSec}}>سجّل سعر صرف لكل عملة أجنبية تتعامل بها</div>
    </div> : <div style={{display:"flex", flexDirection:"column", gap:14}}>
      {Array.from(grouped.entries()).map(([code, rates]) => {
        const c = currencies.find(x => x.code === code);
        return <div key={code} style={{border:"1px solid "+T.brd, borderRadius:8, overflow:"hidden", background:T.cardSolid}}>
          <div style={{padding:"10px 14px", background:T.accent+"08", borderBottom:"1px solid "+T.brd, display:"flex", alignItems:"center", gap:10}}>
            <span style={{fontSize:FS+2, fontWeight:800, color:T.accent}}>{c?.symbol||code}</span>
            <span style={{fontSize:FS, fontWeight:700}}>{c?.name||code} ({code})</span>
            <span style={{fontSize:FS-3, color:T.textMut, marginInlineStart:8}}>{rates.length} سعر</span>
          </div>
          <div>{rates.map((r,i) => <div key={r.id} style={{display:"flex", alignItems:"center", gap:8, padding:"8px 14px", borderTop: i>0?"1px solid "+T.brd:"none"}}>
            <span style={{fontSize:FS-1, fontFamily:"monospace", fontWeight:700, color:T.text, minWidth:100}}>{r.date}</span>
            <span style={{flex:1, fontSize:FS-1, color:T.textSec}}>1 {code} = </span>
            <span style={{fontSize:FS, fontWeight:800, color:T.accent, direction:"ltr", fontFamily:"monospace"}}>{fmt(Number(r.rate).toFixed(4))} {functional.symbol}</span>
            <Btn small ghost onClick={() => startEdit(r)}>✏️</Btn>
            <Btn small ghost onClick={() => remove(r)} style={{color:T.err}}>🗑</Btn>
          </div>)}</div>
        </div>;
      })}
    </div>}

    {/* Edit/Add modal */}
    {adding && editing && <div className="pop-overlay" style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:10001, display:"flex", alignItems:"center", justifyContent:"center", padding:16}} onClick={cancel}>
      <div onClick={e => e.stopPropagation()} style={{background:T.cardSolid, borderRadius:14, padding:24, width:"100%", maxWidth:500, border:"1px solid "+T.brd, boxShadow:"0 25px 70px rgba(0,0,0,0.4)"}}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16}}>
          <div style={{fontSize:FS+1, fontWeight:800, color:T.accent}}>{editing.id ? "✏️ تعديل سعر صرف" : "➕ سعر صرف جديد"}</div>
          <Btn ghost small onClick={cancel}>✕</Btn>
        </div>
        <div style={{display:"flex", flexDirection:"column", gap:10, marginBottom:16}}>
          <div>
            <label style={{fontSize:FS-2, color:T.textSec, fontWeight:700, display:"block", marginBottom:4}}>العملة</label>
            <Sel value={editing.currency} onChange={v => setEditing(p => ({...p, currency:v}))}>
              {foreign.map(c => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
            </Sel>
          </div>
          <div>
            <label style={{fontSize:FS-2, color:T.textSec, fontWeight:700, display:"block", marginBottom:4}}>التاريخ</label>
            <Inp type="date" value={editing.date} onChange={v => setEditing(p => ({...p, date:v}))}/>
          </div>
          <div>
            <label style={{fontSize:FS-2, color:T.textSec, fontWeight:700, display:"block", marginBottom:4}}>سعر الصرف (1 {editing.currency} = ؟ {functional.code})</label>
            <Inp type="number" step="0.0001" value={editing.rate} onChange={v => setEditing(p => ({...p, rate:v}))} placeholder="50.50"/>
          </div>
          <div style={{padding:"8px 12px", background:T.bg, borderRadius:6, fontSize:FS-3, color:T.textMut, lineHeight:1.7}}>
            💡 السعر سينطبق على كل العمليات بالعملة {editing.currency} من تاريخ {editing.date} حتى تاريخ السعر التالي. أحدث سعر يحكم.
          </div>
        </div>
        <div style={{display:"flex", gap:8, justifyContent:"flex-end", paddingTop:12, borderTop:"1px solid "+T.brd}}>
          <Btn ghost onClick={cancel}>↩️ إلغاء</Btn>
          <Btn primary onClick={save} style={{background:T.ok, color:"#fff", border:"none", fontWeight:800, padding:"10px 24px"}}>💾 حفظ</Btn>
        </div>
      </div>
    </div>}
  </Card>;
}
