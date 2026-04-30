/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · ClosingWizardModal (V18.66)
   ───────────────────────────────────────────────────────────────────────
   5-step wizard for closing a fiscal period:
     1. Period selection      — date range + retained earnings + FY suggestions
     2. Pre-flight checks     — 8 validations (3 blockers, 5 warnings)
     3. Preview               — income statement summary + accounts to be closed
     4. Confirm + execute     — final warning, then post the closing entry
     5. Post-close report     — success summary + rollover verification

   Replaces the legacy ClosingEntryModal which was a single-modal flow.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo, useEffect } from "react";
import { Btn, Inp, Sel } from "../ui.jsx";
import { AccountSelector } from "./AccountSelector.jsx";
import { getAccountByCode } from "../../utils/accounting/coa.js";
import { readDayRange } from "../../utils/accounting/dayDoc.js";
import {
  analyzePeriodForClosing,
  postClosingEntry,
} from "../../utils/accounting/closingEntries.js";
import { runPreflightChecks } from "../../utils/accounting/preflightChecks.js";
import { verifyClosingRollover } from "../../utils/accounting/closingVerification.js";
import {
  getCurrentFiscalYear,
  getPreviousFiscalYear,
} from "../../utils/accounting/fiscalYear.js";
import { fmt, gid } from "../../utils/format.js";
import { tell } from "../../utils/popups.js";

const STEP_DEFS = [
  { num: 1, label: "الفترة",      icon: "📅" },
  { num: 2, label: "الفحوصات",    icon: "🛡️" },
  { num: 3, label: "المعاينة",    icon: "👁️" },
  { num: 4, label: "التأكيد",     icon: "🔒" },
  { num: 5, label: "التقرير",     icon: "✅" },
];

/* ─── Severity badges ─── */
function SeverityBadge({severity, T, FS}){
  const cfg = severity === "block" ? { color: T.err, bg: T.err+"15", label: "❌ Blocker" }
            : severity === "warn"  ? { color: T.warn, bg: T.warn+"15", label: "⚠️ تحذير" }
            : { color: T.ok, bg: T.ok+"15", label: "✓ تم" };
  return <span style={{
    fontSize: FS-3, fontWeight: 800, color: cfg.color, background: cfg.bg,
    padding: "3px 10px", borderRadius: 12, whiteSpace: "nowrap",
  }}>{cfg.label}</span>;
}

/* ─── Stepper header (visual progress) ─── */
function Stepper({currentStep, T, FS, isMob}){
  return <div style={{
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: isMob ? "10px 8px" : "12px 16px", background: T.bg,
    borderBottom: "1px solid "+T.brd, gap: isMob ? 4 : 8,
    overflowX: "auto",
  }}>
    {STEP_DEFS.map((s, i) => {
      const active = s.num === currentStep;
      const done = s.num < currentStep;
      return <div key={s.num} style={{display: "flex", alignItems: "center", gap: isMob ? 4 : 8, flexShrink: 0}}>
        <div style={{
          width: isMob ? 26 : 32, height: isMob ? 26 : 32, borderRadius: "50%",
          background: active ? T.warn : done ? T.ok : T.cardSolid,
          color: active || done ? "#fff" : T.textMut,
          border: "2px solid " + (active ? T.warn : done ? T.ok : T.brd),
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: isMob ? FS-2 : FS-1, fontWeight: 800,
          transition: "all 0.2s",
        }}>{done ? "✓" : s.num}</div>
        {!isMob && <div style={{
          fontSize: FS-2, fontWeight: active ? 800 : 600,
          color: active ? T.text : done ? T.ok : T.textMut,
        }}>{s.icon} {s.label}</div>}
        {i < STEP_DEFS.length - 1 && <div style={{
          width: isMob ? 16 : 30, height: 2,
          background: done ? T.ok : T.brd, marginInline: isMob ? 2 : 4,
        }}/>}
      </div>;
    })}
  </div>;
}

/* ─── Main wizard component ─── */
export function ClosingWizardModal({
  data, coa, T, FS, isMob,
  onClose, showToast, userName, upConfig,
  defaultRetainedEarningsCode,
}){
  /* Suggested defaults: previous fiscal year (most common closing scenario) */
  const prevFY = useMemo(() => getPreviousFiscalYear(data || {}), [data]);
  const curFY  = useMemo(() => getCurrentFiscalYear(data || {}), [data]);

  /* Wizard state */
  const [step, setStep] = useState(1);
  const [fromDate, setFromDate] = useState(prevFY.start);
  const [toDate, setToDate]     = useState(prevFY.end);
  const [reCode, setReCode]     = useState(defaultRetainedEarningsCode || "3200");

  const [days, setDays]               = useState([]);
  const [loadingDays, setLoadingDays] = useState(false);

  const [preflight, setPreflight]         = useState(null);
  const [runningPreflight, setRunningPreflight] = useState(false);

  const [closing, setClosing]         = useState(false);
  const [closeResult, setCloseResult] = useState(null);
  const [verifyResult, setVerifyResult] = useState(null);

  const reAcct = getAccountByCode(coa, reCode);

  /* When entering Step 3, ensure days are loaded for analysis */
  useEffect(() => {
    if(step !== 3) return;
    /* Reuse preflight.days if available */
    if(preflight?.days?.length){
      setDays(preflight.days);
      return;
    }
    let cancelled = false;
    setLoadingDays(true);
    readDayRange(fromDate, toDate).then(result => {
      if(!cancelled) setDays(result);
    }).finally(() => { if(!cancelled) setLoadingDays(false); });
    return () => { cancelled = true; };
  }, [step, fromDate, toDate, preflight]);

  /* Live analysis (only meaningful in Step 3) */
  const analysis = useMemo(() => {
    if(step !== 3 || days.length === 0) return null;
    try { return analyzePeriodForClosing(coa, days, reCode); }
    catch(e){ return { error: e.message }; }
  }, [step, coa, days, reCode]);

  /* ─── Step transitions ─── */

  const handleNext = async () => {
    if(step === 1){
      /* Validate dates */
      if(!fromDate || !toDate){
        await tell("بيانات ناقصة", "حدد تاريخ بداية ونهاية", { danger: true });
        return;
      }
      if(new Date(fromDate) > new Date(toDate)){
        await tell("تاريخ غير صحيح", "تاريخ البداية بعد تاريخ النهاية", { danger: true });
        return;
      }
      if(!reAcct){
        await tell("حساب غير موجود", `حساب الأرباح المحتجزة "${reCode}" غير موجود`, { danger: true });
        return;
      }
      /* Move to Step 2 and run preflight */
      setStep(2);
      setRunningPreflight(true);
      try {
        const result = await runPreflightChecks(data, coa, fromDate, toDate, reCode);
        setPreflight(result);
      } catch(e){
        await tell("فشل الفحص", e.message || String(e), { danger: true });
        setStep(1);
      } finally {
        setRunningPreflight(false);
      }
    } else if(step === 2){
      if(!preflight?.canProceed){
        await tell("لا يمكن المتابعة", "في Blockers لازم تتحل قبل ما تكمل", { danger: true });
        return;
      }
      setStep(3);
    } else if(step === 3){
      if(!analysis || analysis.error){
        await tell("التحليل غير جاهز", analysis?.error || "حصل خطأ", { danger: true });
        return;
      }
      if(!analysis.canClose){
        await tell("لا يوجد ما يُقفل", "لا توجد إيرادات أو مصروفات في هذه الفترة", { danger: true });
        return;
      }
      setStep(4);
    } else if(step === 4){
      await executeClosing();
    } else if(step === 5){
      onClose();
    }
  };

  const handleBack = () => {
    if(step === 1) return;
    if(step === 5) return; /* can't go back from success */
    if(step === 2) setPreflight(null);
    setStep(step - 1);
  };

  /* ─── Closing execution ─── */

  const executeClosing = async () => {
    if(closing) return;
    setClosing(true);
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
            closedBy: userName || "",
          });
          d.closedPeriods.sort((a, b) => (b.closedAt || "").localeCompare(a.closedAt || ""));
        });
      }
      setCloseResult(result);

      /* Run rollover verification (post-close) */
      try {
        const v = await verifyClosingRollover({
          coa, fromDate, toDate,
          retainedEarningsCode: reCode,
          expectedNetIncome: result.netIncome,
        });
        setVerifyResult(v);
      } catch(e){
        setVerifyResult({ ok: false, issues: [{ type: "verify-failed", message: e.message }] });
      }

      setStep(5);
      showToast("✅ تم إقفال الفترة بنجاح");
    } catch(e){
      console.error(e);
      await tell("فشل الإقفال", e.message || String(e), { danger: true });
    } finally {
      setClosing(false);
    }
  };

  /* ─── Period suggestion handlers ─── */
  const applySuggestion = (fy) => {
    setFromDate(fy.start);
    setToDate(fy.end);
  };

  /* ─── Render ─── */

  const _amt = (n) => Math.abs(n) < 0.005 ? "—" : fmt(n.toFixed(2));

  return <div className="pop-overlay" style={{
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 10001,
    display: "flex", alignItems: "center", justifyContent: "center", padding: isMob ? 4 : 16,
  }} onClick={step !== 4 && step !== 5 ? onClose : undefined}>
    <div onClick={e => e.stopPropagation()} style={{
      background: T.cardSolid, borderRadius: 14, width: "100%", maxWidth: 820,
      maxHeight: "96vh", display: "flex", flexDirection: "column",
      border: "1px solid "+T.brd, boxShadow: "0 25px 70px rgba(0,0,0,0.4)",
    }}>

      {/* Header */}
      <div style={{
        padding: isMob ? "12px 14px" : "14px 18px", borderBottom: "1px solid "+T.brd,
        display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0,
      }}>
        <div>
          <div style={{fontSize: FS+2, fontWeight: 800, color: T.warn}}>
            🔒 معالج إقفال السنة المالية
          </div>
          <div style={{fontSize: FS-2, color: T.textSec, marginTop: 2}}>
            خطوة {step} من {STEP_DEFS.length} — {STEP_DEFS[step-1].label}
          </div>
        </div>
        {step !== 4 && step !== 5 && <Btn ghost small onClick={onClose}>✕</Btn>}
      </div>

      {/* Stepper */}
      <Stepper currentStep={step} T={T} FS={FS} isMob={isMob}/>

      {/* Body */}
      <div style={{flex: 1, overflowY: "auto", padding: isMob ? 12 : 16}}>

        {/* ════════ STEP 1 — Period selection ════════ */}
        {step === 1 && <div>
          <div style={{fontSize: FS, fontWeight: 700, color: T.text, marginBottom: 10}}>
            📅 حدد الفترة المراد إقفالها
          </div>

          {/* Quick suggestions */}
          <div style={{
            padding: "12px 14px", background: T.bg, borderRadius: 10,
            border: "1px dashed "+T.brd, marginBottom: 14,
          }}>
            <div style={{fontSize: FS-2, color: T.textSec, fontWeight: 700, marginBottom: 8}}>
              💡 اقتراحات سريعة:
            </div>
            <div style={{display: "flex", gap: 8, flexWrap: "wrap"}}>
              <Btn small ghost onClick={() => applySuggestion(prevFY)} style={{
                background: T.accent + "10", border: "1px solid "+T.accent+"40",
                color: T.accent, fontWeight: 700,
              }}>
                ⏪ السنة المالية السابقة ({prevFY.label})
              </Btn>
              <Btn small ghost onClick={() => applySuggestion(curFY)} style={{
                background: T.warn + "10", border: "1px solid "+T.warn+"40",
                color: T.warn, fontWeight: 700,
              }}>
                📅 السنة المالية الحالية ({curFY.label})
              </Btn>
            </div>
            <div style={{fontSize: FS-3, color: T.textMut, marginTop: 8}}>
              السنة المالية بتبدأ في {prevFY.isCalendar ? "1 يناير" : "(مخصصة)"} — تقدر تغيرها من الإعدادات
            </div>
          </div>

          {/* Date inputs */}
          <div style={{display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 1fr 1.4fr", gap: 12, marginBottom: 14}}>
            <div>
              <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 700, display: "block", marginBottom: 6}}>
                من تاريخ
              </label>
              <Inp type="date" value={fromDate} onChange={setFromDate}/>
            </div>
            <div>
              <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 700, display: "block", marginBottom: 6}}>
                إلى تاريخ
              </label>
              <Inp type="date" value={toDate} onChange={setToDate}/>
            </div>
            <div>
              <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 700, display: "block", marginBottom: 6}}>
                حساب الأرباح المحتجزة
              </label>
              <AccountSelector
                value={reAcct?.id || null}
                onChange={id => { const a = coa.find(x => x.id === id); if(a) setReCode(a.code); }}
                coa={coa} T={T} FS={FS} filterType="equity"
              />
            </div>
          </div>

          {/* Info box */}
          <div style={{
            padding: "12px 14px", background: T.accent+"08", borderRadius: 8,
            border: "1px solid "+T.accent+"30", fontSize: FS-2, color: T.text, lineHeight: 1.7,
          }}>
            <b style={{color: T.accent}}>📚 ماذا يفعل الإقفال؟</b><br/>
            في نهاية كل سنة مالية، يجب تصفير حسابات الإيرادات والمصروفات (الحسابات المؤقتة)
            ونقل صافي الربح/الخسارة إلى حساب <b>الأرباح المحتجزة</b> (حساب دائم).
            هذا بيخلي السنة الجديدة تبدأ بأرصدة P&L = 0 — وده أساس صحيح للمحاسبة المزدوجة.
          </div>
        </div>}

        {/* ════════ STEP 2 — Preflight checks ════════ */}
        {step === 2 && <div>
          <div style={{fontSize: FS, fontWeight: 700, color: T.text, marginBottom: 10}}>
            🛡️ فحوصات قبل الإقفال
          </div>

          {runningPreflight && <div style={{
            padding: 30, textAlign: "center", color: T.textMut,
            background: T.bg, borderRadius: 8,
          }}>
            ⏳ جاري تشغيل الفحوصات...
          </div>}

          {!runningPreflight && preflight && <>
            {/* Summary */}
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14,
            }}>
              <div style={{
                padding: 10, background: T.err+"10", borderRadius: 8,
                border: "1px solid "+T.err+"30", textAlign: "center",
              }}>
                <div style={{fontSize: FS+4, fontWeight: 800, color: T.err}}>{preflight.blockers.length}</div>
                <div style={{fontSize: FS-3, color: T.err, fontWeight: 700}}>Blockers</div>
              </div>
              <div style={{
                padding: 10, background: T.warn+"10", borderRadius: 8,
                border: "1px solid "+T.warn+"30", textAlign: "center",
              }}>
                <div style={{fontSize: FS+4, fontWeight: 800, color: T.warn}}>{preflight.warnings.length}</div>
                <div style={{fontSize: FS-3, color: T.warn, fontWeight: 700}}>تحذيرات</div>
              </div>
              <div style={{
                padding: 10, background: T.ok+"10", borderRadius: 8,
                border: "1px solid "+T.ok+"30", textAlign: "center",
              }}>
                <div style={{fontSize: FS+4, fontWeight: 800, color: T.ok}}>{preflight.passes.length}</div>
                <div style={{fontSize: FS-3, color: T.ok, fontWeight: 700}}>تم</div>
              </div>
            </div>

            {/* Checks list */}
            <div style={{display: "flex", flexDirection: "column", gap: 6}}>
              {preflight.checks.map(c => {
                const sevColor = c.severity === "block" ? T.err : c.severity === "warn" ? T.warn : T.ok;
                return <div key={c.id} style={{
                  padding: "10px 12px", borderRadius: 8,
                  background: sevColor + "06",
                  border: "1px solid "+sevColor+"30",
                  borderInlineStart: "4px solid "+sevColor,
                }}>
                  <div style={{display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 4}}>
                    <div style={{fontSize: FS-1, fontWeight: 700, color: T.text}}>{c.title}</div>
                    <SeverityBadge severity={c.severity} T={T} FS={FS}/>
                  </div>
                  {c.detail && <div style={{fontSize: FS-2, color: T.textSec, lineHeight: 1.6}}>{c.detail}</div>}
                  {c.fixHint && <div style={{
                    fontSize: FS-2, color: sevColor, marginTop: 4, fontWeight: 600, lineHeight: 1.6,
                  }}>💡 {c.fixHint}</div>}
                </div>;
              })}
            </div>

            {/* Status banner */}
            {preflight.canProceed ? <div style={{
              marginTop: 14, padding: "12px 14px",
              background: preflight.warnings.length > 0 ? T.warn+"10" : T.ok+"10",
              borderRadius: 8, fontSize: FS-1, fontWeight: 700,
              color: preflight.warnings.length > 0 ? T.warn : T.ok,
              border: "1px solid "+(preflight.warnings.length > 0 ? T.warn : T.ok)+"40",
            }}>
              {preflight.warnings.length > 0
                ? "⚠️ في تحذيرات — تقدر تكمل لكن راجعها كويس"
                : "✅ كل شيء جاهز — تقدر تكمل بأمان"}
            </div> : <div style={{
              marginTop: 14, padding: "12px 14px", background: T.err+"10",
              borderRadius: 8, fontSize: FS-1, fontWeight: 700, color: T.err,
              border: "1px solid "+T.err+"40",
            }}>
              ❌ في Blockers لازم تتحل قبل ما تكمل الإقفال
            </div>}
          </>}
        </div>}

        {/* ════════ STEP 3 — Preview ════════ */}
        {step === 3 && <div>
          <div style={{fontSize: FS, fontWeight: 700, color: T.text, marginBottom: 10}}>
            👁️ معاينة قائمة الدخل للفترة
          </div>
          {loadingDays && <div style={{padding: 30, textAlign: "center", color: T.textMut}}>
            ⏳ جاري التحميل...
          </div>}
          {analysis?.error && <div style={{
            padding: 14, background: T.err+"10", borderRadius: 8, color: T.err, fontWeight: 700,
          }}>⚠️ {analysis.error}</div>}
          {analysis && !analysis.error && !analysis.canClose && <div style={{
            padding: 30, textAlign: "center", color: T.textMut,
            background: T.bg, borderRadius: 8, border: "1px dashed "+T.brd,
          }}>
            لا توجد إيرادات أو مصروفات بأرصدة في هذه الفترة
          </div>}
          {analysis && !analysis.error && analysis.canClose && <>

            {/* Net income hero card */}
            <div style={{
              padding: "18px 20px",
              background: analysis.netIncome >= 0
                ? "linear-gradient(135deg, "+T.ok+"22, "+T.ok+"08)"
                : "linear-gradient(135deg, "+T.err+"22, "+T.err+"08)",
              borderRadius: 12, border: "2px solid "+(analysis.netIncome >= 0 ? T.ok : T.err),
              marginBottom: 14,
            }}>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                flexWrap: "wrap", gap: 10,
              }}>
                <div>
                  <div style={{fontSize: FS+1, fontWeight: 800,
                    color: analysis.netIncome >= 0 ? T.ok : T.err}}>
                    {analysis.netIncome >= 0 ? "✓ صافي الربح" : "⚠ صافي الخسارة"}
                  </div>
                  <div style={{fontSize: FS-2, color: T.textSec, marginTop: 4}}>
                    سيُرحّل إلى: <b>{analysis.retainedEarnings.code} {analysis.retainedEarnings.name}</b>
                  </div>
                </div>
                <span style={{
                  fontSize: FS+8, fontWeight: 800, direction: "ltr",
                  fontFamily: "monospace",
                  color: analysis.netIncome >= 0 ? T.ok : T.err,
                }}>
                  {_amt(Math.abs(analysis.netIncome))}
                </span>
              </div>
              <div style={{
                marginTop: 12, paddingTop: 12, borderTop: "1px dashed "+T.brd,
                display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: FS-2,
              }}>
                <div>
                  <span style={{color: T.textMut}}>إجمالي الإيرادات: </span>
                  <b style={{color: T.ok, direction: "ltr", fontFamily: "monospace"}}>{_amt(analysis.totalRevenue)}</b>
                </div>
                <div>
                  <span style={{color: T.textMut}}>إجمالي المصروفات: </span>
                  <b style={{color: T.err, direction: "ltr", fontFamily: "monospace"}}>{_amt(analysis.totalExpense)}</b>
                </div>
              </div>
            </div>

            {/* Revenue accounts */}
            {analysis.revenueAccounts.length > 0 && <div style={{marginBottom: 12}}>
              <div style={{
                padding: "8px 12px", background: T.ok+"08", borderRadius: 6,
                marginBottom: 6, fontSize: FS, fontWeight: 800, color: T.ok,
              }}>
                📊 الإيرادات ({analysis.revenueAccounts.length} حساب)
              </div>
              <div style={{border: "1px solid "+T.brd, borderRadius: 6, overflow: "hidden"}}>
                {analysis.revenueAccounts.map((r, i) => <div key={r.id} style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
                  borderBottom: i < analysis.revenueAccounts.length-1 ? "1px solid "+T.brd : "none",
                  background: r.balance < 0 ? T.warn+"08" : "transparent",
                }}>
                  <span style={{fontFamily: "monospace", color: T.accent, fontWeight: 700, minWidth: 50, fontSize: FS-2}}>{r.code}</span>
                  <span style={{flex: 1, fontSize: FS-1, fontWeight: 600}}>
                    {r.name}
                    {r.balance < 0 && <span style={{color: T.warn, marginInlineStart: 6, fontSize: FS-3}}>(contra)</span>}
                  </span>
                  <span style={{
                    direction: "ltr", fontFamily: "monospace", fontWeight: 700,
                    color: r.balance < 0 ? T.warn : T.ok, fontSize: FS-1,
                  }}>{r.balance < 0 ? "("+_amt(Math.abs(r.balance))+")" : _amt(r.balance)}</span>
                </div>)}
              </div>
            </div>}

            {/* Expense accounts */}
            {analysis.expenseAccounts.length > 0 && <div>
              <div style={{
                padding: "8px 12px", background: T.err+"08", borderRadius: 6,
                marginBottom: 6, fontSize: FS, fontWeight: 800, color: T.err,
              }}>
                💸 المصروفات ({analysis.expenseAccounts.length} حساب)
              </div>
              <div style={{border: "1px solid "+T.brd, borderRadius: 6, overflow: "hidden"}}>
                {analysis.expenseAccounts.map((e, i) => <div key={e.id} style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
                  borderBottom: i < analysis.expenseAccounts.length-1 ? "1px solid "+T.brd : "none",
                }}>
                  <span style={{fontFamily: "monospace", color: T.accent, fontWeight: 700, minWidth: 50, fontSize: FS-2}}>{e.code}</span>
                  <span style={{flex: 1, fontSize: FS-1, fontWeight: 600}}>{e.name}</span>
                  <span style={{
                    direction: "ltr", fontFamily: "monospace", fontWeight: 700,
                    color: T.err, fontSize: FS-1,
                  }}>{_amt(e.balance)}</span>
                </div>)}
              </div>
            </div>}
          </>}
        </div>}

        {/* ════════ STEP 4 — Confirm ════════ */}
        {step === 4 && <div>
          <div style={{fontSize: FS+1, fontWeight: 800, color: T.warn, marginBottom: 14, textAlign: "center"}}>
            ⚠️ تأكيد نهائي قبل الإقفال
          </div>

          {/* Summary card */}
          <div style={{
            padding: "16px 18px", background: T.bg, borderRadius: 10,
            border: "1px solid "+T.brd, marginBottom: 14,
          }}>
            <div style={{display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 1fr", gap: 10, fontSize: FS-1}}>
              <div>
                <div style={{color: T.textMut, fontSize: FS-2}}>الفترة</div>
                <div style={{fontWeight: 800, fontFamily: "monospace"}}>{fromDate} → {toDate}</div>
              </div>
              <div>
                <div style={{color: T.textMut, fontSize: FS-2}}>الأرباح المحتجزة</div>
                <div style={{fontWeight: 800}}>{reAcct?.code} {reAcct?.name}</div>
              </div>
              <div>
                <div style={{color: T.textMut, fontSize: FS-2}}>إجمالي الإيرادات</div>
                <div style={{fontWeight: 800, color: T.ok, direction: "ltr", fontFamily: "monospace"}}>
                  {analysis ? _amt(analysis.totalRevenue) : "—"}
                </div>
              </div>
              <div>
                <div style={{color: T.textMut, fontSize: FS-2}}>إجمالي المصروفات</div>
                <div style={{fontWeight: 800, color: T.err, direction: "ltr", fontFamily: "monospace"}}>
                  {analysis ? _amt(analysis.totalExpense) : "—"}
                </div>
              </div>
            </div>
            <div style={{
              marginTop: 12, padding: 10,
              background: analysis && analysis.netIncome >= 0 ? T.ok+"15" : T.err+"15",
              borderRadius: 8, textAlign: "center",
            }}>
              <div style={{fontSize: FS-2, color: T.textSec, fontWeight: 700}}>
                {analysis && analysis.netIncome >= 0 ? "صافي ربح يُرحّل للأرباح المحتجزة" : "صافي خسارة تُخصم من الأرباح المحتجزة"}
              </div>
              <div style={{
                fontSize: FS+6, fontWeight: 800, direction: "ltr", fontFamily: "monospace",
                color: analysis && analysis.netIncome >= 0 ? T.ok : T.err,
              }}>
                {analysis ? _amt(Math.abs(analysis.netIncome)) : "—"}
              </div>
            </div>
          </div>

          {/* Warnings */}
          <div style={{
            padding: "12px 14px", background: T.err+"10", borderRadius: 8,
            border: "1px solid "+T.err+"40", fontSize: FS-2, color: T.err,
            fontWeight: 600, lineHeight: 1.8,
          }}>
            <div style={{fontWeight: 800, marginBottom: 6}}>🚨 ما الذي سيحدث:</div>
            <ul style={{margin: 0, paddingInlineStart: 20}}>
              <li>سيتم إنشاء قيد إقفال يصفّر <b>{(analysis?.revenueAccounts.length || 0) + (analysis?.expenseAccounts.length || 0)}</b> حساب إيرادات/مصروفات</li>
              <li>صافي الربح/الخسارة سيُرحّل لـ <b>{reAcct?.name}</b></li>
              <li>الفترة <b>{fromDate} → {toDate}</b> ستُقفل تلقائياً — لن يُسمح بإضافة قيود جديدة فيها</li>
              <li>يمكن عكس الإقفال لاحقاً من قائمة "الفترات المُقفلة"</li>
            </ul>
          </div>
        </div>}

        {/* ════════ STEP 5 — Success report ════════ */}
        {step === 5 && closeResult && <div>
          <div style={{textAlign: "center", marginBottom: 16}}>
            <div style={{fontSize: 48, marginBottom: 8}}>✅</div>
            <div style={{fontSize: FS+2, fontWeight: 800, color: T.ok}}>تم إقفال الفترة بنجاح</div>
            <div style={{fontSize: FS-2, color: T.textSec, marginTop: 4}}>
              {fromDate} → {toDate}
            </div>
          </div>

          {/* Result summary */}
          <div style={{
            padding: "16px 18px", background: T.ok+"08", borderRadius: 10,
            border: "1px solid "+T.ok+"30", marginBottom: 12,
          }}>
            <div style={{display: "grid", gridTemplateColumns: isMob ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10, fontSize: FS-2}}>
              <div style={{textAlign: "center"}}>
                <div style={{color: T.textMut}}>إيرادات</div>
                <div style={{fontWeight: 800, color: T.ok, direction: "ltr", fontFamily: "monospace"}}>{_amt(closeResult.totalRevenue)}</div>
              </div>
              <div style={{textAlign: "center"}}>
                <div style={{color: T.textMut}}>مصروفات</div>
                <div style={{fontWeight: 800, color: T.err, direction: "ltr", fontFamily: "monospace"}}>{_amt(closeResult.totalExpense)}</div>
              </div>
              <div style={{textAlign: "center"}}>
                <div style={{color: T.textMut}}>صافي {closeResult.netIncome >= 0 ? "ربح" : "خسارة"}</div>
                <div style={{fontWeight: 800, color: closeResult.netIncome >= 0 ? T.ok : T.err, direction: "ltr", fontFamily: "monospace"}}>{_amt(Math.abs(closeResult.netIncome))}</div>
              </div>
              <div style={{textAlign: "center"}}>
                <div style={{color: T.textMut}}>حسابات مُقفلة</div>
                <div style={{fontWeight: 800, color: T.text}}>{closeResult.accountsClosed}</div>
              </div>
            </div>
          </div>

          {/* Rollover verification */}
          {verifyResult && <div style={{
            padding: "12px 14px",
            background: verifyResult.ok ? T.ok+"08" : T.warn+"10",
            borderRadius: 8,
            border: "1px solid "+(verifyResult.ok ? T.ok+"30" : T.warn+"40"),
            fontSize: FS-2, lineHeight: 1.7,
            marginBottom: 12,
          }}>
            <div style={{fontWeight: 800, color: verifyResult.ok ? T.ok : T.warn, marginBottom: 6}}>
              {verifyResult.ok ? "✅ التحقق من الترحيل: الكل صحيح" : "⚠️ مشاكل في التحقق"}
            </div>
            {verifyResult.ok ? <ul style={{margin: 0, paddingInlineStart: 20, color: T.text}}>
              <li>كل حسابات الإيرادات والمصروفات أصبحت بأرصدة صفرية</li>
              <li>قيد الإقفال موجود في {toDate}</li>
              <li>الأرباح المحتجزة تحركت بـ <b style={{direction: "ltr", display: "inline-block", fontFamily: "monospace"}}>{_amt(Math.abs(verifyResult.reDelta||0))}</b> ج.م ({verifyResult.reDelta >= 0 ? "زيادة" : "نقصان"})</li>
            </ul> : <div>
              {verifyResult.issues.map((iss, i) => {
                let txt = "";
                if(iss.type === "non-zero-pl") txt = `• الحساب ${iss.accountCode} ${iss.accountName} لسه برصيد ${iss.balance.toFixed(2)}`;
                else if(iss.type === "no-closing-entry") txt = "• قيد الإقفال غير موجود في يوم النهاية";
                else if(iss.type === "re-mismatch") txt = `• حركة الأرباح المحتجزة: متوقع ${iss.expected.toFixed(2)} لكن الفعلي ${iss.actual.toFixed(2)}`;
                else if(iss.type === "verify-failed") txt = `• ${iss.message}`;
                return <div key={i} style={{color: T.warn, marginBottom: 4}}>{txt}</div>;
              })}
            </div>}
          </div>}

          {/* Next steps */}
          <div style={{
            padding: "12px 14px", background: T.accent+"08", borderRadius: 8,
            border: "1px solid "+T.accent+"30", fontSize: FS-2, color: T.text, lineHeight: 1.7,
          }}>
            <b style={{color: T.accent}}>📋 الخطوات التالية:</b>
            <ul style={{margin: "6px 0 0 0", paddingInlineStart: 20}}>
              <li>الفترة المُقفلة الآن مؤمّنة من القيود الجديدة (Period Lock تلقائي)</li>
              <li>افتح <b>القوائم المالية</b> لطباعة قائمة الدخل والمركز المالي للسنة المُقفلة</li>
              <li>لو محتاج تعدّل، تقدر تعكس الإقفال من <b>قائمة الفترات المُقفلة</b> في الإعدادات</li>
            </ul>
          </div>
        </div>}

      </div>

      {/* Footer (navigation) */}
      <div style={{
        padding: isMob ? 12 : 14, background: T.bg, borderTop: "1px solid "+T.brd,
        display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", flexShrink: 0,
      }}>
        <Btn ghost
          onClick={handleBack}
          disabled={step === 1 || step === 5 || closing || runningPreflight}
          style={{visibility: step === 1 || step === 5 ? "hidden" : "visible"}}
        >← السابق</Btn>

        <div style={{flex: 1}}/>

        {step === 5 ? <Btn primary onClick={onClose} style={{
          background: T.ok, color: "#fff", border: "none", fontWeight: 800, padding: "10px 28px",
        }}>إنهاء ✓</Btn> : <Btn primary
          onClick={handleNext}
          disabled={
            closing || runningPreflight ||
            (step === 2 && !preflight?.canProceed) ||
            (step === 3 && (!analysis || analysis.error || !analysis.canClose)) ||
            (step === 4 && (!analysis || analysis.error))
          }
          style={{
            background: step === 4 ? T.err : T.warn,
            color: "#fff", border: "none", fontWeight: 800, padding: "10px 24px",
          }}>
          {closing ? "⏳ جاري الإقفال..."
            : step === 1 ? "التالي: الفحوصات →"
            : step === 2 ? "التالي: المعاينة →"
            : step === 3 ? "التالي: التأكيد →"
            : step === 4 ? "🔒 تنفيذ الإقفال"
            : "التالي →"}
        </Btn>}
      </div>
    </div>
  </div>;
}
