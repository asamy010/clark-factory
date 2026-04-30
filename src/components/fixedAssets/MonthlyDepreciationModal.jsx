/* ═══════════════════════════════════════════════════════════════════════
   CLARK · MonthlyDepreciationModal (V18.67)
   ───────────────────────────────────────────────────────────────────────
   Preview + execute monthly depreciation for all active assets.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { Btn, Inp, Sel } from "../ui.jsx";
import {
  analyzeDepreciationForMonth,
  postDepreciationForMonth,
  ymFormat, lastDayOfMonth,
} from "../../utils/accounting/depreciation.js";
import { fmt } from "../../utils/format.js";
import { tell } from "../../utils/popups.js";
import { isDateLocked, getLockReason } from "../../utils/accounting/periodLock.js";

const ARABIC_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

export function MonthlyDepreciationModal({
  assets, coa, config, T, FS, isMob,
  onClose, showToast, userName,
}){
  const today = new Date();
  /* Default to PREVIOUS month (most common scenario: run end-of-month for last month) */
  const defaultDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const [year, setYear]   = useState(defaultDate.getFullYear());
  const [month, setMonth] = useState(defaultDate.getMonth() + 1);

  const [busy, setBusy]     = useState(false);
  const [result, setResult] = useState(null);

  /* Live analysis */
  const analysis = useMemo(() =>
    analyzeDepreciationForMonth(assets, year, month),
    [assets, year, month],
  );

  const targetDate = lastDayOfMonth(year, month);
  const lockReason = isDateLocked(targetDate, config) ? getLockReason(targetDate, config) : null;

  const handleRun = async () => {
    if(lockReason){
      await tell("الفترة مُقفلة", lockReason, { danger: true });
      return;
    }
    if(analysis.toChargeCount === 0){
      await tell("لا يوجد إهلاك", "لا توجد أصول تستحق إهلاك في هذا الشهر", { danger: true });
      return;
    }
    setBusy(true);
    try {
      const res = await postDepreciationForMonth({
        assets,
        year, month,
        coa,
        userName,
        configForLockCheck: config,
      });
      setResult(res);
      const total = res.posted.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      showToast(`✓ ترحيل ${res.posted.length} قيد بإجمالي ${fmt(total.toFixed(2))} ج.م`);
    } catch(e){
      console.error(e);
      await tell("فشل الترحيل", e.message || String(e), { danger: true });
    } finally {
      setBusy(false);
    }
  };

  const _amt = (n) => Math.abs(n) < 0.005 ? "—" : fmt(n.toFixed(2));

  /* Year options: last 3 years + current + next */
  const yearOpts = (() => {
    const arr = [];
    const cy = today.getFullYear();
    for(let y = cy - 3; y <= cy + 1; y++) arr.push(y);
    return arr;
  })();

  return <div className="pop-overlay" style={{
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 10001,
    display: "flex", alignItems: "center", justifyContent: "center", padding: isMob ? 4 : 16,
  }} onClick={!busy && !result ? onClose : undefined}>
    <div onClick={e => e.stopPropagation()} style={{
      background: T.cardSolid, borderRadius: 14, width: "100%", maxWidth: 760,
      maxHeight: "94vh", display: "flex", flexDirection: "column",
      border: "1px solid "+T.brd, boxShadow: "0 25px 70px rgba(0,0,0,0.4)",
    }}>

      <div style={{
        padding: isMob ? "12px 14px" : "14px 18px", borderBottom: "1px solid "+T.brd,
        display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0,
      }}>
        <div>
          <div style={{fontSize: FS+2, fontWeight: 800, color: T.accent}}>⚡ إهلاك شهري للأصول</div>
          <div style={{fontSize: FS-2, color: T.textSec, marginTop: 2}}>
            {result ? "تم التشغيل" : "اختر الشهر للمعاينة قبل الترحيل"}
          </div>
        </div>
        <Btn ghost small onClick={onClose} disabled={busy}>✕</Btn>
      </div>

      <div style={{flex: 1, overflowY: "auto", padding: isMob ? 12 : 16}}>

        {!result && <>
          {/* Period picker */}
          <div style={{
            padding: "12px 14px", background: T.bg, borderRadius: 10,
            border: "1px solid "+T.brd, marginBottom: 14,
          }}>
            <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10}}>
              <div>
                <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 700, display: "block", marginBottom: 4}}>
                  السنة
                </label>
                <Sel value={String(year)} onChange={v => setYear(Number(v))}>
                  {yearOpts.map(y => <option key={y} value={String(y)}>{y}</option>)}
                </Sel>
              </div>
              <div>
                <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 700, display: "block", marginBottom: 4}}>
                  الشهر
                </label>
                <Sel value={String(month)} onChange={v => setMonth(Number(v))}>
                  {ARABIC_MONTHS.map((m, i) => <option key={i+1} value={String(i+1)}>{m}</option>)}
                </Sel>
              </div>
            </div>
            <div style={{
              fontSize: FS-2, color: T.textMut, marginTop: 8, textAlign: "center",
            }}>
              تاريخ القيود: <b style={{fontFamily: "monospace", color: T.text}}>{targetDate}</b> (آخر يوم في الشهر)
            </div>
          </div>

          {/* Period lock warning */}
          {lockReason && <div style={{
            padding: "12px 14px", background: T.err+"10",
            borderRadius: 8, border: "1px solid "+T.err+"40",
            fontSize: FS-1, color: T.err, fontWeight: 700, marginBottom: 14,
          }}>
            🔒 {lockReason}
          </div>}

          {/* Summary */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14,
          }}>
            <div style={{padding: 10, background: T.bg, borderRadius: 8, border: "1px solid "+T.brd, textAlign: "center"}}>
              <div style={{fontSize: FS+4, fontWeight: 800, color: T.text}}>{analysis.results.length}</div>
              <div style={{fontSize: FS-3, color: T.textSec, fontWeight: 700}}>إجمالي الأصول</div>
            </div>
            <div style={{padding: 10, background: T.ok+"10", borderRadius: 8, border: "1px solid "+T.ok+"30", textAlign: "center"}}>
              <div style={{fontSize: FS+4, fontWeight: 800, color: T.ok}}>{analysis.toChargeCount}</div>
              <div style={{fontSize: FS-3, color: T.ok, fontWeight: 700}}>سيتم إهلاكها</div>
            </div>
            <div style={{padding: 10, background: T.accent+"10", borderRadius: 8, border: "1px solid "+T.accent+"30", textAlign: "center"}}>
              <div style={{fontSize: FS+1, fontWeight: 800, color: T.accent, direction: "ltr", fontFamily: "monospace"}}>
                {fmt(analysis.totalAmount.toFixed(2))}
              </div>
              <div style={{fontSize: FS-3, color: T.accent, fontWeight: 700}}>إجمالي الإهلاك</div>
            </div>
          </div>

          {/* Asset list */}
          <div style={{fontSize: FS-1, fontWeight: 800, color: T.text, marginBottom: 8}}>
            تفاصيل الأصول:
          </div>
          {analysis.results.length === 0 ? <div style={{
            padding: 30, textAlign: "center", color: T.textMut,
            background: T.bg, borderRadius: 8, border: "1px dashed "+T.brd,
          }}>
            لا توجد أصول مسجلة
          </div> : <div style={{display: "flex", flexDirection: "column", gap: 6}}>
            {analysis.results.map((row, i) => {
              const willCharge = row.totalAmount > 0;
              return <div key={i} style={{
                padding: "8px 12px", borderRadius: 8,
                background: willCharge ? T.cardSolid : T.bg,
                border: "1px solid "+(willCharge ? T.brd : T.brd),
                opacity: willCharge ? 1 : 0.7,
              }}>
                <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8}}>
                  <div style={{flex: 1, minWidth: 200}}>
                    <div style={{fontSize: FS-1, fontWeight: 700}}>
                      <span style={{fontFamily: "monospace", color: T.accent}}>{row.asset.code}</span>
                      <span style={{marginInlineStart: 8}}>{row.asset.name}</span>
                    </div>
                    <div style={{fontSize: FS-3, color: T.textMut, marginTop: 2}}>
                      {willCharge
                        ? `${row.monthsToCharge} شهر × ${_amt(row.monthlyAmount)} ج.م`
                        : (row.reason || "—")}
                    </div>
                  </div>
                  <div style={{
                    fontSize: FS, fontWeight: 800, direction: "ltr", fontFamily: "monospace",
                    color: willCharge ? T.accent : T.textMut,
                  }}>
                    {willCharge ? _amt(row.totalAmount) : "—"}
                  </div>
                </div>
              </div>;
            })}
          </div>}
        </>}

        {/* Result */}
        {result && <>
          <div style={{textAlign: "center", marginBottom: 14}}>
            <div style={{fontSize: 40, marginBottom: 6}}>✅</div>
            <div style={{fontSize: FS+1, fontWeight: 800, color: T.ok}}>تم ترحيل قيود الإهلاك</div>
            <div style={{fontSize: FS-2, color: T.textSec, marginTop: 4}}>
              {result.targetYM} · {result.postingDate}
            </div>
          </div>

          <div style={{display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14}}>
            <div style={{padding: 10, background: T.ok+"10", borderRadius: 8, textAlign: "center"}}>
              <div style={{fontSize: FS+4, fontWeight: 800, color: T.ok}}>{result.posted.length}</div>
              <div style={{fontSize: FS-3, color: T.ok, fontWeight: 700}}>تم الترحيل</div>
            </div>
            <div style={{padding: 10, background: T.textMut+"15", borderRadius: 8, textAlign: "center"}}>
              <div style={{fontSize: FS+4, fontWeight: 800, color: T.textMut}}>{result.skipped.length}</div>
              <div style={{fontSize: FS-3, color: T.textMut, fontWeight: 700}}>تم تخطيها</div>
            </div>
            <div style={{padding: 10, background: T.err+"10", borderRadius: 8, textAlign: "center"}}>
              <div style={{fontSize: FS+4, fontWeight: 800, color: T.err}}>{result.failed.length}</div>
              <div style={{fontSize: FS-3, color: T.err, fontWeight: 700}}>فشل</div>
            </div>
          </div>

          {result.failed.length > 0 && <div style={{
            padding: "10px 12px", background: T.err+"08", borderRadius: 8,
            border: "1px solid "+T.err+"30", marginBottom: 10,
          }}>
            <div style={{fontSize: FS-1, fontWeight: 800, color: T.err, marginBottom: 6}}>
              فشل ترحيل {result.failed.length} أصل:
            </div>
            {result.failed.map((f, i) => <div key={i} style={{fontSize: FS-2, color: T.err, marginBottom: 4}}>
              • {f.asset.code} {f.asset.name}: {f.reason}
            </div>)}
          </div>}
        </>}
      </div>

      <div style={{
        padding: isMob ? 12 : 14, background: T.bg, borderTop: "1px solid "+T.brd,
        display: "flex", gap: 8, justifyContent: "flex-end", flexShrink: 0,
      }}>
        {result ? <Btn primary onClick={onClose} style={{
          background: T.ok, color: "#fff", border: "none", fontWeight: 800, padding: "10px 24px",
        }}>تم ✓</Btn> : <>
          <Btn ghost onClick={onClose} disabled={busy}>↩️ إلغاء</Btn>
          <Btn primary onClick={handleRun} disabled={busy || !!lockReason || analysis.toChargeCount === 0} style={{
            background: T.accent, color: "#fff", border: "none",
            fontWeight: 800, padding: "10px 22px",
          }}>
            {busy ? "⏳ جاري الترحيل..." : `⚡ ترحيل ${analysis.toChargeCount} قيد`}
          </Btn>
        </>}
      </div>
    </div>
  </div>;
}
