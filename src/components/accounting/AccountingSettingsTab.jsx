/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · AccountingSettingsTab
   ───────────────────────────────────────────────────────────────────────
   Two sections:
   1. Auto-Posting Rules: per-operation account mappings (with reset to defaults).
   2. Operations:
      - Toggle: enable/disable auto-posting globally
      - Button: backfill historical entries
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { Btn, Card, Sel, Inp } from "../ui.jsx";
import { AccountSelector } from "./AccountSelector.jsx";
import { OpeningBalancesModal } from "./OpeningBalancesModal.jsx";
import { ClosingEntryModal } from "./ClosingEntryModal.jsx";
import { ClosedPeriodsCard } from "./ClosedPeriodsCard.jsx";
import { FailuresCard } from "./FailuresCard.jsx";
import { CurrenciesCard } from "./CurrenciesCard.jsx";
import { FxRatesCard } from "./FxRatesCard.jsx";
import { TreasuryAccountsMapCard } from "./TreasuryAccountsMapCard.jsx";
import { DEFAULT_POSTING_RULES, DEFAULT_CATEGORY_MAP } from "../../utils/accounting/coaDefaults.js";
import { getAccountByCode } from "../../utils/accounting/coa.js";
import { backfillAll } from "../../utils/accounting/backfill.js";

/* Human-readable labels for posting rules */
const RULE_LABELS = {
  sale:                {label:"بيع للعميل", icon:"💰", fields:{customerAccount:"حساب العملاء", revenueAccount:"حساب الإيرادات", discountAccount:"حساب الخصم المسموح به"}},
  saleReturn:          {label:"مرتجع مبيعات", icon:"↩️", fields:{customerAccount:"حساب العملاء", returnAccount:"حساب مرتجع المبيعات"}},
  saleCogs:            {label:"تكلفة بضاعة مباعة (V18.40)", icon:"📦", fields:{cogsAccount:"حساب تكلفة البضاعة المباعة", finishedAccount:"مخزون منتج تام"}},
  saleReturnCogs:      {label:"إعادة تكلفة بضاعة مرتجعة (V18.40)", icon:"📥", fields:{finishedAccount:"مخزون منتج تام", cogsAccount:"حساب تكلفة البضاعة المباعة"}},
  customerPayCash:     {label:"دفعة كاش من عميل", icon:"💵", fields:{cashAccount:"حساب الخزينة", customerAccount:"حساب العملاء"}},
  customerPayTransfer: {label:"دفعة بنكية من عميل", icon:"🏦", fields:{bankAccount:"حساب البنوك", customerAccount:"حساب العملاء"}},
  customerCheck:       {label:"شيك من عميل (مستلم)", icon:"📝", fields:{checksReceivableAccount:"شيكات تحت التحصيل", customerAccount:"حساب العملاء"}},
  customerCheckCollect:{label:"تحصيل شيك عميل", icon:"✅", fields:{cashAccount:"حساب الخزينة", checksReceivableAccount:"شيكات تحت التحصيل"}},
  workshopReceive:     {label:"استلام من ورشة", icon:"📥", fields:{finishedAccount:"مخزون منتج تام", wipAccount:"مخزون تحت التشغيل"}},
  workshopPay:         {label:"دفعة لورشة", icon:"🏭", fields:{workshopAccount:"حساب الورش", cashAccount:"حساب الخزينة"}},
  workshopPurchase:    {label:"مشتريات من ورشة", icon:"🛒", fields:{materialsAccount:"مخزون خامات", cashAccount:"حساب الخزينة"}},
  hrSalary:            {label:"راتب موظف", icon:"💼", fields:{salaryAccount:"حساب الرواتب", cashAccount:"حساب الخزينة"}},
  hrBonus:             {label:"مكافأة/حافز", icon:"🎁", fields:{bonusAccount:"حساب المكافآت", cashAccount:"حساب الخزينة"}},
  hrAdvance:           {label:"سلفة لموظف", icon:"📤", fields:{advanceAccount:"حساب سلف الموظفين", cashAccount:"حساب الخزينة"}},
  treasuryExpense:     {label:"مصروف عام", icon:"💸", fields:{expenseAccount:"حساب المصروف", cashAccount:"حساب الخزينة"}},
  treasuryIncome:      {label:"إيراد عام", icon:"💰", fields:{cashAccount:"حساب الخزينة", incomeAccount:"حساب الإيراد"}},
};

export function AccountingSettingsTab({config, upConfig, coa, T, FS, isMob, showToast, userName}){
  const userRules = (config.accountingSettings||{}).rules || {};
  const enabled   = (config.accountingSettings||{}).autoPostEnabled !== false;
  const [openRule, setOpenRule] = useState(null);
  const [busy, setBusy] = useState(false);
  const [backfillResult, setBackfillResult] = useState(null);
  const [progress, setProgress] = useState({n:0, total:0, label:""});
  /* V18.37: modals for OB + closing */
  const [showOB, setShowOB] = useState(false);
  const [showClosing, setShowClosing] = useState(false);

  const setRuleField = (ruleKey, fieldKey, accountId) => {
    const acct = coa.find(a => a.id === accountId);
    if(!acct) return;
    upConfig(d => {
      if(!d.accountingSettings) d.accountingSettings = {};
      if(!d.accountingSettings.rules) d.accountingSettings.rules = {};
      if(!d.accountingSettings.rules[ruleKey]) d.accountingSettings.rules[ruleKey] = {};
      d.accountingSettings.rules[ruleKey][fieldKey] = acct.code;/* store by code */
    });
  };

  const resetRule = (ruleKey) => {
    if(!confirm("استعادة الإعدادات الافتراضية لهذه القاعدة؟")) return;
    upConfig(d => {
      if(d.accountingSettings && d.accountingSettings.rules){
        delete d.accountingSettings.rules[ruleKey];
      }
    });
    showToast("✓ تم الاستعادة");
  };

  const toggleEnabled = () => {
    upConfig(d => {
      if(!d.accountingSettings) d.accountingSettings = {};
      d.accountingSettings.autoPostEnabled = !enabled;
    });
    showToast(enabled ? "🔴 تم إيقاف الترحيل التلقائي" : "🟢 تم تفعيل الترحيل التلقائي");
  };

  const runBackfill = async (dryRun) => {
    if(!coa || coa.length === 0){
      alert("⚠️ شجرة الحسابات فارغة. ازرع الشجرة الافتراضية أولاً من تبويب 'شجرة الحسابات'.");
      return;
    }
    if(!dryRun && !confirm("سيتم ترحيل كل القيود الأثرية للعمليات السابقة (مبيعات، دفعات، رواتب...). هذه العملية آمنة وقابلة للتكرار. استمرار؟")) return;
    setBusy(true);
    setBackfillResult(null);
    setProgress({n:0, total:0, label:"بدء..."});
    try {
      const res = await backfillAll(config, {
        dryRun,
        createdBy: userName||"backfill",
        onProgress: (n, total, label) => setProgress({n, total, label}),
      });
      setBackfillResult({...res, dryRun});
      if(!res.aborted) showToast(dryRun ? "✅ معاينة الترحيل اكتملت" : "✅ اكتمل ترحيل القيود");
      else alert("⚠️ "+res.reason);
    } catch(e){
      alert("فشل الترحيل: "+(e.message||e));
    } finally {
      setBusy(false);
    }
  };

  return <>
    {/* V18.38 Section: Failed Posts (only renders if there are failures) */}
    <FailuresCard
      config={config} upConfig={upConfig}
      T={T} FS={FS} isMob={isMob}
      showToast={showToast} userName={userName}
    />

    {/* V18.44 Section: Treasury accounts → CoA mapping */}
    <TreasuryAccountsMapCard
      config={config} upConfig={upConfig}
      T={T} FS={FS} isMob={isMob}
      showToast={showToast}
    />

    {/* V18.41 Section: Multi-currency setup */}
    <CurrenciesCard
      config={config} upConfig={upConfig}
      T={T} FS={FS} isMob={isMob}
      showToast={showToast}
    />
    <FxRatesCard
      config={config} upConfig={upConfig}
      T={T} FS={FS} isMob={isMob}
      showToast={showToast} userName={userName}
    />

    {/* V18.37 Section 0a: Opening Balances */}
    <Card title="🏁 الأرصدة الافتتاحية" style={{marginBottom:16}}>
      <div style={{fontSize:FS-2, color:T.textSec, marginBottom:14, lineHeight:1.7}}>
        💡 لما تشغّل النظام أول مرة، عندك بالفعل أرصدة قائمة (خزينة، عملاء، مخزون، إلخ).
        أدخلها هنا كقيد افتتاحي متوازن — هتُحفظ كقيد محاسبي عادي قابل للعكس والتعديل.
      </div>
      {(() => {
        const obc = config.openingBalanceConfig;
        if(!obc) return <div style={{padding:14, background:T.warn+"08", borderRadius:8, border:"1px dashed "+T.warn+"40", marginBottom:10}}>
          <div style={{fontSize:FS-1, fontWeight:700, color:T.warn, marginBottom:4}}>⚠️ لم يتم إدخال أرصدة افتتاحية بعد</div>
          <div style={{fontSize:FS-2, color:T.textSec}}>للحصول على ميزان مراجعة وقوائم مالية صحيحة، أدخل الأرصدة الافتتاحية أولاً.</div>
        </div>;
        const sumBalances = Object.values(obc.balances||{}).reduce((s,v) => s + (Number(v)||0), 0);
        return <div style={{padding:14, background:T.ok+"08", borderRadius:8, border:"1px solid "+T.ok+"40", marginBottom:10}}>
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8}}>
            <div>
              <div style={{fontSize:FS-1, fontWeight:800, color:T.ok}}>✓ الأرصدة الافتتاحية مُدخلة</div>
              <div style={{fontSize:FS-3, color:T.textSec, marginTop:2}}>
                التاريخ: <b style={{fontFamily:"monospace"}}>{obc.date}</b> ·
                عدد الحسابات: <b>{Object.keys(obc.balances||{}).length}</b> ·
                إجمالي القيد: <b style={{direction:"ltr", fontFamily:"monospace"}}>{sumBalances.toFixed(2)}</b>
              </div>
              <div style={{fontSize:FS-3, color:T.textMut, marginTop:2}}>
                مُدخلة بواسطة {obc.postedBy||"—"} · {(obc.postedAt||"").split("T")[0]}
              </div>
            </div>
          </div>
        </div>;
      })()}
      <Btn primary onClick={() => setShowOB(true)} style={{background:T.accent, color:"#fff", border:"none", fontWeight:800, padding:"10px 20px"}}>
        {config.openingBalanceConfig ? "✏️ تعديل الأرصدة الافتتاحية" : "🏁 إدخال الأرصدة الافتتاحية"}
      </Btn>
    </Card>

    {/* V18.37 Section 0b: Closing Entries */}
    <Card title="🔒 إقفال الفترات المالية" style={{marginBottom:16}}>
      <div style={{fontSize:FS-2, color:T.textSec, marginBottom:14, lineHeight:1.7}}>
        💡 في نهاية كل سنة مالية (أو ربع سنوي)، اعمل قيد إقفال يصفّر أرصدة الإيرادات والمصروفات
        ويرحّل الصافي إلى حساب الأرباح المحتجزة. هذا أساسي محاسبياً لبدء فترة جديدة بنظافة.
      </div>
      <Btn primary onClick={() => setShowClosing(true)} style={{background:T.warn, color:"#fff", border:"none", fontWeight:800, padding:"10px 20px"}}>
        🔒 إقفال فترة مالية جديدة
      </Btn>
      <ClosedPeriodsCard
        closedPeriods={config.closedPeriods||[]}
        T={T} FS={FS} isMob={isMob} upConfig={upConfig}
        showToast={showToast} userName={userName}
      />
    </Card>

    {/* Section 1: Auto-post toggle */}
    <Card title="⚙️ التحكم في الترحيل التلقائي" style={{marginBottom:16}}>
      <div onClick={toggleEnabled} style={{display:"flex", alignItems:"center", gap:12, padding:"12px 14px", borderRadius:10, background: enabled ? T.ok+"08" : T.bg, border:"1px solid "+(enabled?T.ok+"40":T.brd), cursor:"pointer"}}>
        <span style={{fontSize:24, color: enabled?T.ok:T.textMut, fontWeight:800}}>{enabled?"☑":"☐"}</span>
        <div style={{flex:1}}>
          <div style={{fontSize:FS, fontWeight:800, color:T.text}}>تفعيل الترحيل التلقائي</div>
          <div style={{fontSize:FS-2, color:T.textSec, marginTop:2, lineHeight:1.5}}>
            عند التفعيل، أي عملية في النظام (بيع، دفعة، راتب...) ستنتج قيداً محاسبياً تلقائياً في يومية المحاسبة.
            عند الإيقاف، العمليات تبقى بدون قيود — بإمكانك ترحيلها لاحقاً يدوياً من زر "ترحيل القيود الأثرية".
          </div>
        </div>
        <span style={{fontSize:FS, fontWeight:800, color:enabled?T.ok:T.textMut, padding:"4px 12px", background:(enabled?T.ok:T.textMut)+"15", borderRadius:6}}>{enabled?"مُفعّل":"معطّل"}</span>
      </div>
    </Card>

    {/* V18.40 — Section 1b: Cost of Goods Sold */}
    {(() => {
      const cogsEnabled = (config.accountingSettings||{}).cogsEnabled !== false;
      const cogsSource  = (config.accountingSettings||{}).cogsCostSource || "auto";
      const toggleCogs = () => upConfig(d => {
        if(!d.accountingSettings) d.accountingSettings = {};
        d.accountingSettings.cogsEnabled = !cogsEnabled;
      });
      const setCogsSource = (src) => upConfig(d => {
        if(!d.accountingSettings) d.accountingSettings = {};
        d.accountingSettings.cogsCostSource = src;
      });
      const sources = [
        {key:"auto",     label:"تلقائي (مفضّل)", desc:"الأولوية لـ costPrice على الأوردر، fallback للقيمة المحسوبة"},
        {key:"manual",   label:"يدوي فقط",         desc:"يستخدم order.costPrice فقط — لو مش موجود، التكلفة تتجاهل"},
        {key:"computed", label:"محسوب فقط",        desc:"يستخدم calcOrder().costPer (قماش + إكسسوار + ورشة) — يتجاهل costPrice"},
      ];
      return <Card title="💰 تكلفة البضاعة المباعة (COGS)" style={{marginBottom:16}}>
        <div style={{fontSize:FS-2, color:T.textSec, marginBottom:14, lineHeight:1.7}}>
          💡 لما تشغّلها، كل بيعة هتنتج قيدين محاسبيين: قيد الإيرادات (الموجود فعلاً) + قيد <b>تكلفة البضاعة المباعة</b> اللي بينقل تكلفة المنتج من المخزون للمصروفات.
          النتيجة: قائمة الدخل بتعرض <b>صافي الربح الفعلي</b> بدلاً من إجمالي الإيرادات بدون cost.
        </div>
        <div onClick={toggleCogs} style={{display:"flex", alignItems:"center", gap:12, padding:"12px 14px", borderRadius:10, background: cogsEnabled ? T.ok+"08" : T.bg, border:"1px solid "+(cogsEnabled?T.ok+"40":T.brd), cursor:"pointer", marginBottom:cogsEnabled?12:0}}>
          <span style={{fontSize:24, color: cogsEnabled?T.ok:T.textMut, fontWeight:800}}>{cogsEnabled?"☑":"☐"}</span>
          <div style={{flex:1}}>
            <div style={{fontSize:FS, fontWeight:800, color:T.text}}>تفعيل ترحيل تكلفة البضاعة المباعة</div>
            <div style={{fontSize:FS-2, color:T.textSec, marginTop:2}}>قيد إضافي مع كل بيعة: Dr COGS / Cr مخزون منتج تام</div>
          </div>
          <span style={{fontSize:FS, fontWeight:800, color:cogsEnabled?T.ok:T.textMut, padding:"4px 12px", background:(cogsEnabled?T.ok:T.textMut)+"15", borderRadius:6}}>{cogsEnabled?"مُفعّل":"معطّل"}</span>
        </div>
        {cogsEnabled && <>
          <div style={{fontSize:FS-2, color:T.textSec, fontWeight:700, marginBottom:6}}>📊 مصدر التكلفة</div>
          <div style={{display:"flex", flexDirection:"column", gap:6}}>
            {sources.map(s => {
              const isActive = cogsSource === s.key;
              return <div key={s.key} onClick={() => setCogsSource(s.key)} style={{padding:"10px 12px", borderRadius:8, cursor:"pointer", background: isActive ? T.accent+"08" : T.cardSolid, border:"2px solid "+(isActive?T.accent:T.brd)}}>
                <div style={{display:"flex", alignItems:"center", gap:8}}>
                  <span style={{fontSize:18, color:isActive?T.accent:T.textMut, fontWeight:800}}>{isActive?"●":"○"}</span>
                  <span style={{fontSize:FS-1, fontWeight:800, color:isActive?T.accent:T.text}}>{s.label}</span>
                </div>
                <div style={{fontSize:FS-3, color:T.textMut, marginTop:3, paddingInlineStart:26, lineHeight:1.5}}>{s.desc}</div>
              </div>;
            })}
          </div>
          <div style={{marginTop:10, padding:"8px 12px", background:T.warn+"08", borderRadius:6, fontSize:FS-3, color:T.warn, lineHeight:1.7}}>
            ⚠️ <b>ملاحظة:</b> الأوردرات اللي مفيش لها تكلفة (لا costPrice ولا قيمة محسوبة) هيتم تخطيها بدون قيد COGS — هتشوف الإيرادات بس بدون تكلفة في القائمة.
            بعد تفعيل/تغيير الإعداد، شغّل <b>"ترحيل القيود الأثرية"</b> لتطبيق على العمليات السابقة.
          </div>
        </>}
      </Card>;
    })()}

    {/* Section 2: Backfill */}
    <Card title="📦 ترحيل القيود الأثرية" style={{marginBottom:16}}>
      <div style={{fontSize:FS-2, color:T.textSec, marginBottom:14, lineHeight:1.7}}>
        💡 يمر النظام على كل العمليات الموجودة (مبيعات، مرتجعات، دفعات، شيكات، رواتب، استلام من ورش...) ويولّد قيداً محاسبياً لكل عملية ليس لها قيد بعد.
        العملية <b>idempotent</b> — تكرارها لا ينتج قيوداً مكررة. يمكن تشغيلها بعد كل تعديل لشجرة الحسابات أو القواعد.
      </div>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <Btn onClick={() => runBackfill(true)} disabled={busy} ghost>👀 معاينة (بدون كتابة)</Btn>
        <Btn primary onClick={() => runBackfill(false)} disabled={busy} style={{background:T.ok, color:"#fff", border:"none", fontWeight:800, padding:"10px 24px"}}>
          {busy ? "⏳ جاري الترحيل..." : "🚀 ابدأ الترحيل"}
        </Btn>
      </div>
      {busy && progress.total>0 && <div style={{marginTop:14}}>
        <div style={{fontSize:FS-2, color:T.textSec, marginBottom:6}}>{progress.label} — {progress.n}/{progress.total}</div>
        <div style={{height:8, background:T.bg, borderRadius:4, overflow:"hidden"}}>
          <div style={{height:"100%", width:(progress.n/progress.total*100)+"%", background:T.accent, transition:"width 0.3s"}}/>
        </div>
      </div>}
      {backfillResult && <div style={{marginTop:16, padding:14, borderRadius:10, background: backfillResult.aborted?T.err+"08":T.ok+"08", border:"1px solid "+(backfillResult.aborted?T.err+"40":T.ok+"40")}}>
        {backfillResult.aborted ? <div style={{color:T.err, fontWeight:700}}>❌ تم الإلغاء: {backfillResult.reason}</div>
          : <>
            <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:10}}>
              <span style={{fontSize:18}}>✅</span>
              <span style={{fontSize:FS, fontWeight:800, color:T.ok}}>{backfillResult.dryRun?"معاينة":"تم الترحيل"}: {backfillResult.posted} قيد</span>
              {backfillResult.failed>0 && <span style={{color:T.err, fontWeight:700}}> · {backfillResult.failed} فشل</span>}
              {backfillResult.skipped>0 && <span style={{color:T.textMut, fontWeight:600}}> · {backfillResult.skipped} تم تجاهلها</span>}
            </div>
            <div style={{display:"grid", gridTemplateColumns:isMob?"1fr 1fr":"repeat(4,1fr)", gap:6, fontSize:FS-2}}>
              {Object.entries(backfillResult.byType).map(([k,v]) => <div key={k} style={{padding:"6px 10px", background:T.cardSolid, borderRadius:6, border:"1px solid "+T.brd}}>
                <div style={{color:T.textMut}}>{RULE_LABELS[k]?.label || k}</div>
                <div style={{fontSize:FS, fontWeight:800, color:T.accent}}>{v}</div>
              </div>)}
            </div>
            {backfillResult.errors?.length > 0 && <details style={{marginTop:10}}>
              <summary style={{cursor:"pointer", color:T.err, fontWeight:700, fontSize:FS-2}}>{backfillResult.errors.length} خطأ — اضغط للعرض</summary>
              <div style={{marginTop:8, maxHeight:200, overflowY:"auto", padding:"6px 10px", background:T.bg, borderRadius:6, fontSize:FS-3, fontFamily:"monospace"}}>
                {backfillResult.errors.slice(0,30).map((e,i) => <div key={i} style={{padding:"3px 0", borderBottom:"1px solid "+T.brd, color:T.err}}>{e.type}: {e.message}</div>)}
                {backfillResult.errors.length>30 && <div style={{color:T.textMut, padding:"3px 0"}}>...و {backfillResult.errors.length-30} خطأ آخر (انظر console)</div>}
              </div>
            </details>}
          </>}
      </div>}
    </Card>

    {/* Section 3: Posting rules */}
    <Card title="🎯 قواعد الترحيل التلقائي" style={{marginBottom:16}}>
      <div style={{fontSize:FS-2, color:T.textSec, marginBottom:14, lineHeight:1.7}}>
        💡 لكل نوع عملية في النظام، حدّد على أي حساب يترحل المدين والدائن. القيم الافتراضية مناسبة لمصنع ملابس مصري — عدّلها فقط لو احتجت.
      </div>
      <div style={{display:"flex", flexDirection:"column", gap:8}}>
        {Object.entries(RULE_LABELS).map(([ruleKey, info]) => {
          const isOpen = openRule === ruleKey;
          const userRule = userRules[ruleKey] || {};
          const defaultRule = DEFAULT_POSTING_RULES[ruleKey] || {};
          const merged = {...defaultRule, ...userRule};
          const hasOverrides = Object.keys(userRule).length > 0;
          return <div key={ruleKey} style={{border:"1px solid "+T.brd, borderRadius:8, overflow:"hidden", background:T.cardSolid}}>
            <div onClick={() => setOpenRule(isOpen?null:ruleKey)} style={{display:"flex", alignItems:"center", gap:10, padding:"10px 14px", cursor:"pointer", background: isOpen?T.accent+"08":"transparent"}}>
              <span style={{fontSize:18}}>{info.icon}</span>
              <span style={{flex:1, fontSize:FS-1, fontWeight:700, color:T.text}}>{info.label}</span>
              {hasOverrides && <span style={{fontSize:FS-3, color:T.warn, padding:"2px 8px", background:T.warn+"15", borderRadius:4, fontWeight:700}} title="تم تعديل الافتراضي">✨ مخصص</span>}
              <span style={{color:T.textMut}}>{isOpen?"▾":"▸"}</span>
            </div>
            {isOpen && <div style={{padding:14, borderTop:"1px solid "+T.brd, background:T.bg}}>
              <div style={{display:"flex", flexDirection:"column", gap:10}}>
                {Object.entries(info.fields).map(([fieldKey, fieldLabel]) => {
                  const code = merged[fieldKey];
                  const acct = code ? getAccountByCode(coa, code) : null;
                  return <div key={fieldKey}>
                    <label style={{fontSize:FS-2, color:T.textSec, fontWeight:700, display:"block", marginBottom:4}}>{fieldLabel}</label>
                    <AccountSelector value={acct?.id||null} onChange={id => setRuleField(ruleKey, fieldKey, id)} coa={coa} T={T} FS={FS}/>
                  </div>;
                })}
              </div>
              {hasOverrides && <Btn ghost small onClick={() => resetRule(ruleKey)} style={{marginTop:10, color:T.warn}}>↺ استعادة الافتراضي</Btn>}
            </div>}
          </div>;
        })}
      </div>
    </Card>

    {/* V18.37 Modals */}
    {showOB && <OpeningBalancesModal
      coa={coa} T={T} FS={FS} isMob={isMob}
      currentConfig={config} upConfig={upConfig}
      userName={userName} showToast={showToast}
      onClose={() => setShowOB(false)}
    />}
    {showClosing && <ClosingEntryModal
      coa={coa} T={T} FS={FS} isMob={isMob}
      upConfig={upConfig} userName={userName} showToast={showToast}
      defaultRetainedEarningsCode="3200"
      onClose={() => setShowClosing(false)}
    />}
  </>;
}
