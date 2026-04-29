/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · TreasuryAccountsMapCard
   ───────────────────────────────────────────────────────────────────────
   Hybrid mapping UI for linking treasury accounts (cash boxes, banks)
   to specific sub-accounts in the Chart of Accounts.

   Two modes coexist:
   1. Auto-seed: one click to create sub-accounts for ALL unmapped treasuries
      (preview + confirm before applying).
   2. Manual: per-treasury dropdown to pick any existing CoA leaf account
      under 1100 (or "fallback" to use 1110/1120 generic).
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { Btn, Card } from "../ui.jsx";
import {
  buildAutoSeedPlan, applyAutoSeedPlan, setTreasuryMapping,
  findOrphanMappings, listMappableAccounts,
  FALLBACK_CASH_CODE, FALLBACK_BANK_CODE,
} from "../../utils/accounting/treasuryMapping.js";
import { getAccountByCode } from "../../utils/accounting/coa.js";

export function TreasuryAccountsMapCard({config, upConfig, T, FS, isMob, showToast}){
  const [planPreview, setPlanPreview] = useState(null);

  const treasuryAccounts = config.treasuryAccounts || [];
  const map = config.treasuryAccountMap || {};
  const coa = config.coa || [];

  /* List of accounts that any treasury can map to (leaves under 1100) */
  const mappableAccounts = useMemo(() => listMappableAccounts(coa), [coa]);

  /* Detect orphans: mappings pointing to deleted treasuries / deleted CoA codes */
  const orphans = useMemo(() => findOrphanMappings(treasuryAccounts, coa, map), [treasuryAccounts, coa, map]);

  /* Group treasuries by type for display */
  const grouped = useMemo(() => {
    const cash = []; const bank = [];
    treasuryAccounts.forEach(t => {
      if(t && t.type === "bank") bank.push(t);
      else cash.push(t);
    });
    return {cash, bank};
  }, [treasuryAccounts]);

  /* Stats */
  const totalCount = treasuryAccounts.length;
  const mappedCount = treasuryAccounts.filter(t => t && map[t.id]).length;
  const unmappedCount = totalCount - mappedCount;

  /* Compute auto-seed plan on demand */
  const computePlan = () => {
    const plan = buildAutoSeedPlan(treasuryAccounts, coa, map);
    setPlanPreview(plan);
  };

  /* Apply the plan */
  const applyPlan = () => {
    if(!planPreview) return;
    if(planPreview.creates.length === 0 && Object.keys(planPreview.mappings).length === 0){
      showToast("لا يوجد ما يحتاج للإنشاء أو الربط");
      setPlanPreview(null); return;
    }
    if(!confirm(`سيتم إنشاء ${planPreview.creates.length} حساب فرعي في الشجرة وربط ${Object.keys(planPreview.mappings).length} خزنة/بنك. استمرار؟`)) return;
    applyAutoSeedPlan(planPreview, upConfig);
    showToast("✅ تم الإنشاء والربط");
    setPlanPreview(null);
  };

  /* Manual mapping change */
  const updateMapping = (treasuryId, newCode) => {
    if(newCode === "__none__"){
      setTreasuryMapping(treasuryId, null, upConfig);
      showToast("✓ تم إزالة الربط (سيستخدم الحساب الافتراضي)");
    } else {
      setTreasuryMapping(treasuryId, newCode, upConfig);
      showToast("✓ تم تحديث الربط");
    }
  };

  /* Remove orphan mappings */
  const purgeOrphans = () => {
    if(orphans.length === 0) return;
    if(!confirm(`حذف ${orphans.length} ربط مهجور (يشير إلى خزنة/حساب لم يعد موجوداً)؟`)) return;
    upConfig(d => {
      if(!d.treasuryAccountMap) return;
      orphans.forEach(o => { delete d.treasuryAccountMap[o.treasuryId]; });
    });
    showToast("✓ تم تنظيف الربطات المهجورة");
  };

  if(totalCount === 0){
    return <Card title="🏦 ربط الخزائن والبنوك بشجرة الحسابات" style={{marginBottom:16}}>
      <div style={{padding:14, background:T.bg, borderRadius:8, border:"1px dashed "+T.brd, textAlign:"center", color:T.textMut}}>
        لا توجد خزائن أو بنوك في النظام بعد. أضفها من صفحة الخزينة أولاً.
      </div>
    </Card>;
  }

  return <Card title="🏦 ربط الخزائن والبنوك بشجرة الحسابات" style={{marginBottom:16}}>
    <div style={{fontSize:FS-2, color:T.textSec, marginBottom:14, lineHeight:1.7}}>
      💡 كل خزنة أو بنك في النظام يُفضّل أن يكون له <b>حساب فرعي خاص به</b> في شجرة الحسابات،
      لتظهر أرصدة كل خزنة على حدة في ميزان المراجعة وقائمة المركز المالي.
      <br/>
      الخزائن غير المربوطة تترحل لـ<b>1110 (الخزينة الرئيسية)</b> والبنوك غير المربوطة لـ<b>1120 (البنوك)</b>.
    </div>

    {/* Stats summary */}
    <div style={{display:"grid", gridTemplateColumns: isMob ? "1fr 1fr 1fr" : "repeat(3,1fr)", gap:8, marginBottom:14}}>
      <div style={{padding:10, background:T.bg, borderRadius:6, textAlign:"center", border:"1px solid "+T.brd}}>
        <div style={{fontSize:FS-3, color:T.textSec}}>إجمالي</div>
        <div style={{fontSize:FS+2, fontWeight:800, color:T.text}}>{totalCount}</div>
      </div>
      <div style={{padding:10, background:T.ok+"08", borderRadius:6, textAlign:"center", border:"1px solid "+T.ok+"40"}}>
        <div style={{fontSize:FS-3, color:T.textSec}}>مربوطة</div>
        <div style={{fontSize:FS+2, fontWeight:800, color:T.ok}}>{mappedCount}</div>
      </div>
      <div style={{padding:10, background: unmappedCount > 0 ? T.warn+"08" : T.bg, borderRadius:6, textAlign:"center", border:"1px solid "+(unmappedCount>0?T.warn+"40":T.brd)}}>
        <div style={{fontSize:FS-3, color:T.textSec}}>غير مربوطة</div>
        <div style={{fontSize:FS+2, fontWeight:800, color:unmappedCount>0?T.warn:T.textMut}}>{unmappedCount}</div>
      </div>
    </div>

    {/* Auto-seed bar */}
    {unmappedCount > 0 && <div style={{padding:12, background:T.accent+"08", borderRadius:8, border:"1px solid "+T.accent+"40", marginBottom:14}}>
      <div style={{fontSize:FS-1, fontWeight:800, color:T.accent, marginBottom:4}}>🚀 الإنشاء التلقائي</div>
      <div style={{fontSize:FS-2, color:T.textSec, marginBottom:10, lineHeight:1.7}}>
        النظام يقدر ينشئ حساباً فرعياً في الشجرة لكل خزنة/بنك غير مربوط ويربطه تلقائياً.
        الحسابات الفرعية للنقدية ترقم 1111, 1112... وللبنوك 1121, 1122... — تحت 1100.
      </div>
      {!planPreview ? <Btn primary onClick={computePlan} style={{background:T.accent, color:"#fff", border:"none", fontWeight:800}}>👀 معاينة الخطة</Btn>
        : <div style={{display:"flex", flexDirection:"column", gap:8}}>
            <div style={{padding:10, background:T.cardSolid, borderRadius:6, border:"1px solid "+T.brd}}>
              <div style={{fontWeight:800, color:T.text, marginBottom:6}}>ستُنشأ {planPreview.creates.length} حسابات فرعية:</div>
              {planPreview.creates.length === 0 ? <div style={{color:T.textMut, fontSize:FS-2, fontStyle:"italic"}}>لا شيء للإنشاء — كل الخزائن مربوطة بالفعل</div>
                : <div style={{display:"flex", flexDirection:"column", gap:4}}>{planPreview.creates.map(c => <div key={c.code} style={{display:"flex", alignItems:"center", gap:8, fontSize:FS-2, padding:"4px 0"}}>
                    <span style={{fontFamily:"monospace", color:T.accent, fontWeight:800, minWidth:50}}>{c.code}</span>
                    <span style={{flex:1, fontWeight:600}}>{c.name}</span>
                    <span style={{fontSize:FS-3, color:T.textMut, padding:"2px 6px", background:T.bg, borderRadius:4}}>{c.treasuryType==="bank"?"🏦 بنك":"💰 خزنة"}</span>
                  </div>)}</div>}
              {planPreview.skipped.length > 0 && <div style={{marginTop:8, padding:"6px 10px", background:T.warn+"08", borderRadius:4, fontSize:FS-3, color:T.warn}}>
                ⚠️ تم تخطّي {planPreview.skipped.length} (مربوطة بالفعل أو نفدت الأكواد)
              </div>}
            </div>
            <div style={{display:"flex", gap:8}}>
              <Btn ghost onClick={() => setPlanPreview(null)}>↩️ إلغاء</Btn>
              <Btn primary onClick={applyPlan} style={{background:T.ok, color:"#fff", border:"none", fontWeight:800, flex:1}}>✅ تطبيق ({planPreview.creates.length})</Btn>
            </div>
          </div>}
    </div>}

    {/* Orphan warning */}
    {orphans.length > 0 && <div style={{padding:10, background:T.err+"08", borderRadius:6, border:"1px solid "+T.err+"40", marginBottom:14, display:"flex", alignItems:"center", gap:10, flexWrap:"wrap"}}>
      <span style={{fontSize:FS-1, fontWeight:800, color:T.err}}>⚠️ {orphans.length} ربط مهجور</span>
      <span style={{flex:1, fontSize:FS-2, color:T.textSec}}>يشير إلى خزنة أو حساب تم حذفه</span>
      <Btn small ghost onClick={purgeOrphans} style={{color:T.err}}>🗑 تنظيف</Btn>
    </div>}

    {/* Manual mapping table */}
    <div style={{display:"flex", flexDirection:"column", gap:10}}>
      {[
        {key:"cash", label:"💰 الخزائن", list:grouped.cash, fallback: FALLBACK_CASH_CODE},
        {key:"bank", label:"🏦 البنوك",  list:grouped.bank, fallback: FALLBACK_BANK_CODE},
      ].map(group => group.list.length > 0 && <div key={group.key}>
        <div style={{fontSize:FS, fontWeight:800, color:T.text, marginBottom:6, padding:"6px 10px", background:T.bg, borderRadius:6}}>{group.label} ({group.list.length})</div>
        <div style={{display:"flex", flexDirection:"column", gap:6}}>
          {group.list.map(t => {
            const mappedCode = map[t.id];
            const mappedAccount = mappedCode ? getAccountByCode(coa, mappedCode) : null;
            const fallbackAccount = getAccountByCode(coa, group.fallback);
            return <div key={t.id} style={{display:"flex", alignItems:"center", gap:8, padding:"8px 10px", background:T.cardSolid, borderRadius:6, border:"1px solid "+T.brd, flexWrap:"wrap"}}>
              <div style={{flex: isMob ? "1 1 100%" : 1, minWidth:120}}>
                <div style={{fontSize:FS-1, fontWeight:800, color:T.text}}>{t.name}</div>
                {t.ownerEmail && <div style={{fontSize:FS-3, color:T.textMut, marginTop:1}}>{t.ownerEmail}</div>}
              </div>
              <select
                value={mappedCode || "__none__"}
                onChange={e => updateMapping(t.id, e.target.value)}
                style={{padding:"6px 10px", borderRadius:6, border:"1px solid "+(mappedCode?T.ok+"40":T.brd), background:T.cardSolid, color:T.text, fontSize:FS-1, fontWeight:600, minWidth:200, fontFamily:"inherit"}}
              >
                <option value="__none__">─ يستخدم {group.fallback} {fallbackAccount?.name||""} ─</option>
                {mappableAccounts.map(a => <option key={a.code} value={a.code}>
                  {a.code} — {a.name}
                </option>)}
              </select>
              {mappedAccount ? <span style={{fontSize:FS-3, color:T.ok, padding:"2px 8px", background:T.ok+"15", borderRadius:4, fontWeight:700, fontFamily:"monospace"}}>✓ {mappedCode}</span>
                : <span style={{fontSize:FS-3, color:T.textMut, padding:"2px 8px", background:T.bg, borderRadius:4, fontWeight:700, fontFamily:"monospace"}}>↺ {group.fallback}</span>}
            </div>;
          })}
        </div>
      </div>)}
    </div>

    {mappableAccounts.length === 0 && <div style={{marginTop:14, padding:"10px 14px", background:T.warn+"08", borderRadius:6, border:"1px dashed "+T.warn+"40", fontSize:FS-2, color:T.warn, lineHeight:1.7}}>
      ⚠️ <b>ملاحظة:</b> لا توجد حسابات فرعية مناسبة في الشجرة بعد. استخدم زر "الإنشاء التلقائي" أعلاه لإنشاء حسابات فرعية لكل خزنة/بنك دفعة واحدة.
    </div>}
  </Card>;
}
