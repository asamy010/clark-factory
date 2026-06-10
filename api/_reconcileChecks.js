/* ═══════════════════════════════════════════════════════════════════════
   CLARK · فحوصات المطابقة المالية اليومية (V21.21.34 — خطة التحصين 1.3)
   ───────────────────────────────────────────────────────────────────────
   دوال نقية 100% (صفر I/O) — بتاخد البيانات المقروءة وبترجّع قائمة
   مشاكل (issues). الـ endpoint (api/cron/reconcile-financials.js) بيقرأ
   النوافذ الزمنية من Firestore وبيمرّرها هنا. النقاء = قابلة للاختبار
   بالكامل في vitest بدون محاكي.

   كل فحص مبني على صنف حادثة موثّق:
   • أرجل التحويلات الناقصة/المكررة  → V21.9.45 / V21.9.14 / V21.9.249
   • القيد غير المتوازن               → V21.9.56 class
   • تكرار معرّفات الخزنة             → V21.9.14 dup-ledger class
   • فاتورة مرحّلة بلا قيد            → V21.9.67 orphan class (معكوسة)
   • حجم factory/config               → V21.9.42 class (1MB cliff)

   شكل الـ issue الموحد:
     { type, severity: "high"|"warn", label, count, details: [..≤10] }
   ═══════════════════════════════════════════════════════════════════════ */

const TOLERANCE = 0.01;

/* فحص ١ — التحويلات المؤكدة: أرجل ناقصة أو مكررة.
   transfers: قائمة التحويلات (في النافذة) · treasury: حركات الخزنة (في النافذة) */
export function checkTransferLegs(transfers, treasury){
  const legsByTransferId = new Map();
  for(const t of (treasury || [])){
    if(!t || !t.transferId) continue;
    if(!legsByTransferId.has(t.transferId)) legsByTransferId.set(t.transferId, []);
    legsByTransferId.get(t.transferId).push(t);
  }
  const missing = [], dups = [];
  for(const tf of (transfers || [])){
    if(!tf || tf.status !== "confirmed") continue;
    const legs = legsByTransferId.get(tf.id) || [];
    const outs = legs.filter(l => l && l.type === "out").length;
    const ins  = legs.filter(l => l && l.type === "in").length;
    if((tf.fromAccount && outs === 0) || (tf.toAccount && ins === 0)){
      missing.push({ id: tf.id, date: tf.date, amount: tf.amount, outs, ins });
    }
    if(outs > 1 || ins > 1){
      dups.push({ id: tf.id, date: tf.date, amount: tf.amount, outs, ins });
    }
  }
  const issues = [];
  if(missing.length) issues.push({
    type: "transfer-missing-legs", severity: "high",
    label: "تحويلات مؤكدة بأرجل ناقصة في الخزنة",
    count: missing.length, details: missing.slice(0, 10),
  });
  if(dups.length) issues.push({
    type: "transfer-duplicate-legs", severity: "high",
    label: "تحويلات بأرجل مكررة (رصيد منفوخ)",
    count: dups.length, details: dups.slice(0, 10),
  });
  return issues;
}

/* فحص ٢ — توازن القيود: كل قيد مرحّل لازم مدينه = دائنه (±0.01).
   accountingEntries: قيود اليومية في النافذة (مع date مرفقة لكل قيد) */
export function checkJournalBalance(accountingEntries){
  const bad = [];
  for(const e of (accountingEntries || [])){
    if(!e || e.status === "void") continue;
    let dr = 0, cr = 0;
    for(const l of (e.lines || [])){ dr += Number(l?.debit) || 0; cr += Number(l?.credit) || 0; }
    if(Math.abs(dr - cr) > TOLERANCE){
      bad.push({ id: e.id, refNo: e.refNo, date: e._day || e.date, dr: Math.round(dr*100)/100, cr: Math.round(cr*100)/100 });
    }
  }
  if(!bad.length) return [];
  return [{
    type: "journal-imbalanced", severity: "high",
    label: "قيود يومية غير متوازنة (مدين ≠ دائن)",
    count: bad.length, details: bad.slice(0, 10),
  }];
}

/* فحص ٣ — تكرار معرّفات حركات الخزنة عبر مستندات الأيام (دبل-عدّ). */
export function checkDuplicateTreasuryIds(treasury){
  const seen = new Map();
  const dups = new Map();
  for(const t of (treasury || [])){
    if(!t || !t.id) continue;
    const k = String(t.id);
    if(seen.has(k)){
      dups.set(k, (dups.get(k) || 1) + 1);
    } else {
      seen.set(k, true);
    }
  }
  if(dups.size === 0) return [];
  return [{
    type: "treasury-duplicate-ids", severity: "high",
    label: "حركات خزنة مكررة بنفس المعرّف (تُحتسب مرتين)",
    count: dups.size,
    details: Array.from(dups.entries()).slice(0, 10).map(([id, n]) => ({ id, occurrences: n })),
  }];
}

/* فحص ٤ — فواتير مرحّلة بلا قيد يومية.
   يعمل فقط في وضع «الترحيل من الفاتورة» (invoiceSettings.autoPostFromInvoice)
   — في الوضع المباشر القيود مصدرها التسليمات مش الفواتير فالفحص هيكذب.
   invoices: [{id, invoiceNo, date, status, _kind:"sales"|"purchase"}]
   accountingEntries: قيود النافذة — بنفهرس sourceType+sourceId. */
export function checkPostedInvoicesHaveJournal(invoices, accountingEntries, opts){
  const { autoPostFromInvoice, autoPostEnabled, fromDate } = opts || {};
  if(autoPostFromInvoice !== true) return [];
  if(autoPostEnabled === false) return [];
  const index = new Set();
  for(const e of (accountingEntries || [])){
    if(!e || e.status === "void") continue;
    if(e.sourceType && e.sourceId) index.add(e.sourceType + "|" + e.sourceId);
  }
  const missing = [];
  for(const inv of (invoices || [])){
    if(!inv || inv.status !== "posted") continue;
    /* هامش يومين من بداية النافذة — فاتورة قيدها قبل النافذة مش انحراف */
    if(fromDate && String(inv.date || "") < fromDate) continue;
    const st = inv._kind === "purchase" ? "purchaseInvoice" : "salesInvoice";
    if(!index.has(st + "|" + inv.id)){
      missing.push({ id: inv.id, invoiceNo: inv.invoiceNo, date: inv.date, kind: inv._kind });
    }
  }
  if(!missing.length) return [];
  return [{
    type: "invoice-missing-journal", severity: "warn",
    label: "فواتير مرحّلة بدون قيد يومية مقابل",
    count: missing.length, details: missing.slice(0, 10),
  }];
}

/* فحص ٥ — فشل ترحيل محاسبي غير مُعالج (من قائمة autoPost). */
export function checkUnresolvedPostFailures(cfg){
  const fails = Array.isArray(cfg?.accountingPostFailures) ? cfg.accountingPostFailures : [];
  const unresolved = fails.filter(f => f && !f.resolvedAt);
  if(!unresolved.length) return [];
  return [{
    type: "unresolved-post-failures", severity: "warn",
    label: "عمليات فشل ترحيلها المحاسبي ومستنية إعادة محاولة",
    count: unresolved.length,
    details: unresolved.slice(0, 10).map(f => ({ type: f.type, sourceId: f.sourceId, error: f.errorMessage, attempts: f.attempts })),
  }];
}

/* فحص ٦ — حجم factory/config مقابل حد الـ 1MiB (إنذار مبكر V21.9.42).
   cfgBytes يُحسب في الـ endpoint (Buffer.byteLength). */
export function checkConfigSize(cfgBytes){
  const LIMIT = 1048576;
  const pct = Math.round((cfgBytes / LIMIT) * 100);
  if(pct < 70) return [];
  return [{
    type: "config-size", severity: pct >= 85 ? "high" : "warn",
    label: `حجم factory/config وصل ${pct}% من حد الـ 1MB`,
    count: 1,
    details: [{ bytes: cfgBytes, pct, limit: LIMIT }],
  }];
}

/* المجمّع — يشغّل كل الفحوصات ويبني التقرير النهائي. */
export function runAllChecks(input){
  const {
    transfers, treasury, accountingEntries,
    invoices, cfg, cfgBytes, fromDate, toDate, windowDays,
  } = input || {};
  const issues = [
    ...checkTransferLegs(transfers, treasury),
    ...checkJournalBalance(accountingEntries),
    ...checkDuplicateTreasuryIds(treasury),
    ...checkPostedInvoicesHaveJournal(invoices, accountingEntries, {
      autoPostFromInvoice: (cfg?.invoiceSettings || {}).autoPostFromInvoice === true,
      autoPostEnabled: (cfg?.accountingSettings || {}).autoPostEnabled,
      fromDate,
    }),
    ...checkUnresolvedPostFailures(cfg),
    ...checkConfigSize(cfgBytes || 0),
  ];
  const high = issues.filter(i => i.severity === "high").length;
  return {
    ok: issues.length === 0,
    fromDate, toDate, windowDays,
    scanned: {
      transfers: (transfers || []).length,
      treasury: (treasury || []).length,
      journalEntries: (accountingEntries || []).length,
      invoices: (invoices || []).length,
    },
    issues,
    highCount: high,
    warnCount: issues.length - high,
  };
}

/* رسالة الواتساب — عربي مختصر، سطر لكل مشكلة. */
export function buildAlertMessage(report, dateLabel){
  const lines = [
    "⚠️ *CLARK — تقرير المطابقة المالية*",
    "📅 " + (dateLabel || report.toDate || ""),
    "─────────────────",
  ];
  for(const i of (report.issues || [])){
    lines.push((i.severity === "high" ? "🔴 " : "🟡 ") + i.label + ": *" + i.count + "*");
  }
  lines.push("─────────────────");
  lines.push("افتح شاشة التشخيصات في كلارك لمراجعة التفاصيل والإصلاح.");
  return lines.join("\n");
}
