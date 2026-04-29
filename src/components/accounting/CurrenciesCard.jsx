/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · CurrenciesCard
   ───────────────────────────────────────────────────────────────────────
   Manages the list of currencies the system supports. EGP is always
   functional and protected; user can add/remove foreign currencies.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState } from "react";
import { Btn, Card, Inp } from "../ui.jsx";
import { getCurrencies, DEFAULT_CURRENCIES, validateCurrencySettings, FUNCTIONAL_CURRENCY } from "../../utils/accounting/currency.js";
import { ask, tell } from "../../utils/popups.js";

export function CurrenciesCard({config, upConfig, T, FS, isMob, showToast}){
  const [adding, setAdding]   = useState(null);/* {code, name, symbol} */
  const currencies = getCurrencies(config);

  const seedDefaults = async () => {
    if(currencies.length > 1){
      if(!await ask("إضافة العملات الافتراضية", "سيتم دمج العملات الافتراضية الناقصة فقط — استمرار؟", {confirmText:"استمرار"})) return;
    }
    upConfig(d => {
      if(!d.accountingSettings) d.accountingSettings = {};
      const existing = new Set((d.accountingSettings.currencies||[]).map(c => c.code));
      const merged = [...(d.accountingSettings.currencies||[])];
      DEFAULT_CURRENCIES.forEach(def => {
        if(!existing.has(def.code)) merged.push({...def});
      });
      /* ensure functional present */
      if(!merged.find(c => c.isFunctional)){
        const eg = DEFAULT_CURRENCIES.find(c => c.code === FUNCTIONAL_CURRENCY);
        if(eg && !merged.find(c => c.code === FUNCTIONAL_CURRENCY)) merged.unshift({...eg});
      }
      d.accountingSettings.currencies = merged;
    });
    showToast("✓ تم إضافة العملات الافتراضية");
  };

  const startAdd = () => setAdding({code:"", name:"", symbol:"", decimals:2});

  const saveNew = () => {
    if(!adding.code || !adding.name){ tell("بيانات ناقصة", "ادخل الكود والاسم", {danger:true}); return; }
    const code = adding.code.toUpperCase().trim();
    if(!/^[A-Z]{3}$/.test(code)){ tell("كود غير صحيح", "الكود يجب أن يكون 3 حروف إنجليزية كبيرة", {danger:true}); return; }
    const newList = [...currencies, {code, name:adding.name.trim(), symbol:(adding.symbol||code).trim(), isFunctional:false, decimals:Number(adding.decimals)||2, system:false}];
    const v = validateCurrencySettings(newList);
    if(!v.ok){ tell("بيانات غير صحيحة", v.reason, {danger:true}); return; }
    upConfig(d => {
      if(!d.accountingSettings) d.accountingSettings = {};
      d.accountingSettings.currencies = newList;
    });
    showToast("✓ تم إضافة العملة");
    setAdding(null);
  };

  const remove = async (currency) => {
    if(currency.isFunctional){ tell("غير مسموح", "لا يمكن حذف العملة الأساسية", {danger:true}); return; }
    if(currency.system){
      if(!await ask("حذف عملة افتراضية", "عملة "+currency.code+" من العملات الافتراضية. حذفها لن يحذف أسعار الصرف المسجلة. استمرار؟", {danger:true, confirmText:"حذف"})) return;
    } else {
      if(!await ask("حذف عملة", "حذف "+currency.name+" ("+currency.code+")؟", {danger:true, confirmText:"حذف"})) return;
    }
    upConfig(d => {
      if(!d.accountingSettings) d.accountingSettings = {};
      d.accountingSettings.currencies = (d.accountingSettings.currencies||[]).filter(c => c.code !== currency.code);
    });
    showToast("✓ تم الحذف");
  };

  return <Card title="🌍 العملات المُعتمدة" style={{marginBottom:16}}>
    <div style={{fontSize:FS-2, color:T.textSec, marginBottom:14, lineHeight:1.7}}>
      💡 العملة الأساسية (EGP) ثابتة — كل القوائم المالية تُعرض بها. أضف العملات الأجنبية اللي بتتعامل بيها (USD, EUR, ...) عشان تقدر تسجل عمليات بأسعار صرف ثابتة.
    </div>

    {currencies.length <= 1 && <div style={{padding:14, background:T.warn+"08", borderRadius:8, border:"1px dashed "+T.warn+"40", marginBottom:10}}>
      <div style={{fontSize:FS-1, fontWeight:700, color:T.warn, marginBottom:6}}>⚠️ النظام يعمل بعملة واحدة فقط (EGP)</div>
      <div style={{fontSize:FS-2, color:T.textSec, marginBottom:8}}>لتفعيل تعدد العملات، أضف عملة أجنبية واحدة على الأقل أو استخدم العملات الافتراضية.</div>
      <Btn primary onClick={seedDefaults} style={{background:T.ok, color:"#fff", border:"none", fontWeight:800}}>📥 إضافة العملات الافتراضية (USD, EUR, SAR, AED, GBP)</Btn>
    </div>}

    <div style={{display:"flex", flexDirection:"column", gap:6, marginBottom:10}}>
      {currencies.map(c => <div key={c.code} style={{display:"flex", alignItems:"center", gap:10, padding:"10px 12px", background:T.cardSolid, borderRadius:6, border:"1px solid "+(c.isFunctional?T.accent+"40":T.brd)}}>
        <span style={{fontSize:FS+4, fontWeight:800, color:T.accent, minWidth:30, textAlign:"center"}}>{c.symbol}</span>
        <span style={{fontFamily:"monospace", fontSize:FS, fontWeight:800, color:T.text, minWidth:50}}>{c.code}</span>
        <span style={{flex:1, fontSize:FS-1, fontWeight:600}}>{c.name}</span>
        {c.isFunctional && <span style={{fontSize:FS-3, color:T.accent, padding:"2px 8px", background:T.accent+"15", borderRadius:4, fontWeight:700}}>🏛️ أساسية</span>}
        {c.system && !c.isFunctional && <span style={{fontSize:FS-3, color:T.textMut, padding:"2px 6px", background:T.bg, borderRadius:4, fontWeight:700}}>افتراضية</span>}
        {!c.isFunctional && <Btn small ghost onClick={() => remove(c)} style={{color:T.err}}>🗑</Btn>}
      </div>)}
    </div>

    <Btn ghost onClick={startAdd}>➕ إضافة عملة جديدة</Btn>

    {/* Add modal */}
    {adding && <div className="pop-overlay" style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:10001, display:"flex", alignItems:"center", justifyContent:"center", padding:16}} onClick={() => setAdding(null)}>
      <div onClick={e => e.stopPropagation()} style={{background:T.cardSolid, borderRadius:14, padding:24, width:"100%", maxWidth:480, border:"1px solid "+T.brd, boxShadow:"0 25px 70px rgba(0,0,0,0.4)"}}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16}}>
          <div style={{fontSize:FS+1, fontWeight:800, color:T.accent}}>➕ عملة جديدة</div>
          <Btn ghost small onClick={() => setAdding(null)}>✕</Btn>
        </div>
        <div style={{display:"flex", flexDirection:"column", gap:10, marginBottom:16}}>
          <div>
            <label style={{fontSize:FS-2, color:T.textSec, fontWeight:700, display:"block", marginBottom:4}}>الكود (3 حروف ISO)</label>
            <Inp value={adding.code} onChange={v => setAdding(p => ({...p, code:v.toUpperCase()}))} placeholder="USD"/>
          </div>
          <div>
            <label style={{fontSize:FS-2, color:T.textSec, fontWeight:700, display:"block", marginBottom:4}}>الاسم</label>
            <Inp value={adding.name} onChange={v => setAdding(p => ({...p, name:v}))} placeholder="دولار أمريكي"/>
          </div>
          <div>
            <label style={{fontSize:FS-2, color:T.textSec, fontWeight:700, display:"block", marginBottom:4}}>الرمز (اختياري)</label>
            <Inp value={adding.symbol} onChange={v => setAdding(p => ({...p, symbol:v}))} placeholder="$"/>
          </div>
        </div>
        <div style={{display:"flex", gap:8, justifyContent:"flex-end", paddingTop:12, borderTop:"1px solid "+T.brd}}>
          <Btn ghost onClick={() => setAdding(null)}>↩️ إلغاء</Btn>
          <Btn primary onClick={saveNew} style={{background:T.ok, color:"#fff", border:"none", fontWeight:800, padding:"10px 24px"}}>💾 حفظ</Btn>
        </div>
      </div>
    </div>}
  </Card>;
}
