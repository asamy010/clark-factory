/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · Preflight Checks (V18.66)
   ───────────────────────────────────────────────────────────────────────
   Pre-closing validation. Runs 8 checks across:
     • BLOCKERS — must be fixed before closing can proceed
     • WARNINGS — informational; user can proceed with awareness
     • PASSES   — checks that confirmed nothing is wrong

   Checks:
     1. Trial balance balanced for the period (Dr === Cr)            [BLOCK]
     2. No unresolved posting failures within the period             [BLOCK]
     3. Retained earnings account exists and is leaf                 [BLOCK]
     4. No draft sales invoices in the period                        [WARN]
     5. No draft credit notes in the period                          [WARN]
     6. No draft purchase invoices in the period                     [WARN]
     7. Recent backup exists (within 7 days)                         [WARN]
     8. Period does not extend into the future                       [WARN]

   Public API:
     runPreflightChecks(data, coa, fromDate, toDate, retainedEarningsCode)
       → {checks[], blockers[], warnings[], passes[], canProceed}
   ═══════════════════════════════════════════════════════════════════════ */

import { readDayRange } from "./dayDoc.js";

const _r2 = (n) => Math.round((Number(n)||0) * 100) / 100;

/* Each check returns: { id, severity, title, detail?, fixHint? }
   Severity values: "block" | "warn" | "ok" */

export async function runPreflightChecks(data, coa, fromDate, toDate, retainedEarningsCode){
  const checks = [];
  const today = new Date().toISOString().split("T")[0];

  /* Load days once for checks 1 & 2 */
  let days = [];
  let loadError = null;
  try {
    days = await readDayRange(fromDate, toDate);
  } catch(e){
    loadError = e.message || String(e);
  }
  if(loadError){
    return {
      checks: [{
        id: "load-failed",
        severity: "block",
        title: "تعذر قراءة أيام الفترة",
        detail: loadError,
      }],
      blockers: [{ id: "load-failed", severity: "block", title: "تعذر قراءة أيام الفترة" }],
      warnings: [], passes: [], canProceed: false,
    };
  }

  /* ─── Check 1: Trial balance balanced (Dr === Cr) ─── */
  let totalDr = 0, totalCr = 0, lineCount = 0;
  days.forEach(d => (d.entries || []).forEach(e => (e.lines || []).forEach(l => {
    totalDr += Number(l.debit) || 0;
    totalCr += Number(l.credit) || 0;
    lineCount++;
  })));
  const diff = _r2(totalDr - totalCr);
  if(Math.abs(diff) > 0.01){
    checks.push({
      id: "tb-imbalance",
      severity: "block",
      title: "ميزان المراجعة غير متوازن",
      detail: `الفرق: ${diff.toFixed(2)} ج.م — لا يمكن الإقفال بميزان غير متوازن`,
      fixHint: "راجع دفتر اليومية للفترة وتأكد إن كل قيد إجمالي مدين = إجمالي دائن",
    });
  } else {
    checks.push({
      id: "tb-balanced",
      severity: "ok",
      title: "ميزان المراجعة متوازن",
      detail: `${lineCount} سطر · إجمالي مدين = دائن = ${totalDr.toFixed(2)} ج.م`,
    });
  }

  /* ─── Check 2: Posting failures ─── */
  const failures = (data.accountingPostFailures || []).filter(f => {
    const fd = (f.date || "").slice(0, 10);
    return fd >= fromDate && fd <= toDate && !f.resolved;
  });
  if(failures.length > 0){
    checks.push({
      id: "posting-failures",
      severity: "block",
      title: `${failures.length} فشل ترحيل غير محلول`,
      detail: "في عمليات لم يتم ترحيلها للقيود في هذه الفترة",
      fixHint: "روح للإعدادات → 'لوحة أخطاء الترحيل' وضغط Retry لكل واحد",
    });
  } else {
    checks.push({
      id: "no-failures",
      severity: "ok",
      title: "لا توجد إخفاقات في الترحيل",
    });
  }

  /* ─── Check 3: Retained earnings account ─── */
  const re = (coa || []).find(a => a.code === retainedEarningsCode);
  if(!re){
    checks.push({
      id: "re-missing",
      severity: "block",
      title: "حساب الأرباح المحتجزة غير موجود",
      detail: `الكود "${retainedEarningsCode}" غير موجود في شجرة الحسابات`,
      fixHint: "أضف الحساب من شجرة الحسابات أو اختر حساب آخر",
    });
  } else if(!re.isLeaf){
    checks.push({
      id: "re-not-leaf",
      severity: "block",
      title: "حساب الأرباح المحتجزة ليس حساباً فرعياً",
      detail: `${re.code} - ${re.name} يحتوي على حسابات فرعية`,
      fixHint: "اختر أحد الحسابات الفرعية تحته",
    });
  } else if(re.type !== "equity"){
    checks.push({
      id: "re-wrong-type",
      severity: "block",
      title: "حساب الأرباح المحتجزة بنوع غير صحيح",
      detail: `${re.code} نوعه ${re.type} — يجب أن يكون equity (حقوق ملكية)`,
    });
  } else {
    checks.push({
      id: "re-ok",
      severity: "ok",
      title: "حساب الأرباح المحتجزة جاهز",
      detail: `${re.code} · ${re.name}`,
    });
  }

  /* ─── Check 4: Draft sales invoices ─── */
  const draftSales = (data.salesInvoices || []).filter(i =>
    i.status === "draft" &&
    i.date >= fromDate && i.date <= toDate
  );
  if(draftSales.length > 0){
    const total = draftSales.reduce((s, i) => s + (Number(i.total) || 0), 0);
    checks.push({
      id: "draft-sales",
      severity: "warn",
      title: `${draftSales.length} فاتورة مبيعات مسودة`,
      detail: `إجمالي: ${total.toFixed(2)} ج.م — لن تُحتسب في الإيرادات إلا بعد الترحيل`,
      fixHint: "افتح صفحة 'فواتير المبيعات' وحوّلها لـ'مرحّل' لو عاوزها داخلة في الإقفال",
    });
  }

  /* ─── Check 5: Draft credit notes ─── */
  const draftCN = (data.salesCreditNotes || []).filter(c =>
    c.status === "draft" &&
    c.date >= fromDate && c.date <= toDate
  );
  if(draftCN.length > 0){
    const total = draftCN.reduce((s, c) => s + (Number(c.total) || 0), 0);
    checks.push({
      id: "draft-cn",
      severity: "warn",
      title: `${draftCN.length} إشعار دائن مسودة`,
      detail: `إجمالي: ${total.toFixed(2)} ج.م — لن يُخصم من الإيرادات إلا بعد الترحيل`,
      fixHint: "افتح صفحة 'الإشعارات الدائنة' وحوّلها لـ'مرحّل'",
    });
  }

  /* ─── Check 6: Draft purchase invoices ─── */
  const draftPurch = (data.purchaseInvoices || []).filter(i =>
    i.status === "draft" &&
    i.date >= fromDate && i.date <= toDate
  );
  if(draftPurch.length > 0){
    const total = draftPurch.reduce((s, i) => s + (Number(i.total) || 0), 0);
    checks.push({
      id: "draft-purchase",
      severity: "warn",
      title: `${draftPurch.length} فاتورة مشتريات مسودة`,
      detail: `إجمالي: ${total.toFixed(2)} ج.م`,
    });
  }

  /* ─── Check 7: Recent backup ─── */
  const backupTimestamps = [
    data.lastComprehensiveBackupAt,
    data.lastBackupAt,
    data.lastFullBackupAt,
  ].filter(Boolean);
  if(backupTimestamps.length === 0){
    checks.push({
      id: "no-backup",
      severity: "warn",
      title: "لا توجد نسخة احتياطية مسجلة",
      detail: "نوصي بشدة بعمل backup شامل قبل الإقفال",
      fixHint: "روح للإعدادات → 'النسخ الاحتياطية' وعمل نسخة جديدة",
    });
  } else {
    const latest = backupTimestamps.sort().reverse()[0];
    const ageDays = Math.floor((Date.now() - new Date(latest).getTime()) / (1000 * 60 * 60 * 24));
    if(ageDays > 7){
      checks.push({
        id: "old-backup",
        severity: "warn",
        title: "النسخة الاحتياطية قديمة",
        detail: `آخر backup من ${ageDays} يوم — نوصي بنسخة حديثة قبل الإقفال`,
        fixHint: "اعمل backup شامل من الإعدادات",
      });
    } else {
      checks.push({
        id: "backup-fresh",
        severity: "ok",
        title: "النسخة الاحتياطية حديثة",
        detail: `آخر backup من ${ageDays} يوم`,
      });
    }
  }

  /* ─── Check 8: Future dates in range ─── */
  if(toDate > today){
    checks.push({
      id: "future-dates",
      severity: "warn",
      title: "الفترة تشمل أيام مستقبلية",
      detail: `تاريخ النهاية ${toDate} بعد اليوم ${today} — تأكد إنك عاوز كده`,
    });
  }

  return {
    checks,
    blockers: checks.filter(c => c.severity === "block"),
    warnings: checks.filter(c => c.severity === "warn"),
    passes:   checks.filter(c => c.severity === "ok"),
    canProceed: checks.every(c => c.severity !== "block"),
    days, /* expose loaded days for reuse in preview step */
  };
}
