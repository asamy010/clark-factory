/* ═══════════════════════════════════════════════════════════════
   CLARK V21.9.47 — Unified Health Check Utility

   PURPOSE:
   ─────────────────────────────────────────────────────────────
   Addresses the user's "في مشاكل كتير محتاج فحص شامل" (V21.9.46
   debugging session) — the user couldn't tell what was broken
   without going to Settings → Maintenance → Diagnostics and
   running multiple separate audits.

   This utility runs all known health checks against the in-memory
   `data` (merged config + split + partitioned) and returns a
   flat list of issues, each categorized + actionable.

   Issues are surfaced via:
   • Topbar "🩺" pill with count badge (added in App.jsx)
   • Clicking opens Settings → DiagnosticsPanel
   • The DiagnosticsPanel reads these same issues for its summary

   DESIGN PRINCIPLES:
   • Pure function — no React state, no Firestore reads
   • Fast — O(N) at worst, no async work
   • Deterministic — same input → same output (idempotent)
   • Categorized severity: critical | error | warning | info
   ═══════════════════════════════════════════════════════════════ */

/* Severity hierarchy — higher index = more severe */
const SEVERITY_RANK = { info: 0, warning: 1, error: 2, critical: 3 };

/**
 * @param {Object} args
 * @param {Object} args.data — the merged data object (from App.jsx useMemo)
 * @param {Object} args.configDoc — the raw factory/config doc (for flag checks)
 * @param {Object} args.listenerErrors — window.__clarkListenerErrors map
 * @param {string} [args.userRole] — current user's role (V21.9.61: used to
 *   suppress expected-by-design denials per firestoreScopes.js)
 * @param {Function} [args.isExpectedDenial] — predicate(role, col) → bool
 *   (V21.9.61: injected to avoid pulling the scope map into healthCheck)
 * @param {number} [args.cfgSizeBytes] — pre-computed estimate of cfg doc size
 * @returns {Array<{kind, severity, title, detail, hint, navigateTo?, runAction?}>}
 */
export function evaluateHealthIssues({ data, configDoc, listenerErrors, cfgSizeBytes, userRole, isExpectedDenial }) {
  const issues = [];
  const cfg = configDoc || {};

  /* ═══ 1. Listener-health checks ═══════════════════════════════
     V21.9.46 added terminal/transient distinction. Surface BOTH
     here so the user sees the full picture.
     V21.9.61: if userRole + isExpectedDenial predicate are provided,
     suppress permission-denied entries that are CORRECT by design
     (e.g., warehouse_keeper on HR/payment collections). */
  for (const [colName, info] of Object.entries(listenerErrors || {})) {
    if (!info) continue;
    /* V21.9.61: skip expected denials so the "🩺" health pill doesn't
       flag legitimate role-based access restrictions as critical issues. */
    if (info.terminal && info.code === "permission-denied"
        && typeof isExpectedDenial === "function"
        && isExpectedDenial(userRole, colName)) {
      continue;
    }
    if (info.terminal) {
      issues.push({
        kind: "listener_terminal",
        severity: "critical",
        title: `Listener معطل: ${colName}`,
        detail: `Code: ${info.code}. Message: ${(info.message || "").slice(0, 100)}`,
        hint: "راجع firestore.rules + اعمل deploy. ثم refresh الصفحة. التفاصيل في DiagnosticsPanel.",
        navigateTo: "settings",
      });
    } else {
      /* Non-terminal — could be transient, but warn the user it's flapping */
      issues.push({
        kind: "listener_transient",
        severity: "warning",
        title: `Listener له خطأ مؤقت: ${colName}`,
        detail: `Code: ${info.code}. السلوك: الـ SDK بـ يـ retry تلقائياً.`,
        hint: "لو الخطأ بـ يستمر، راجع الإنترنت أو firestore.rules.",
        navigateTo: "settings",
      });
    }
  }

  /* ═══ 2. Pending migrations — legacy data still in cfg arrays ═══ */

  /* 2a. Legacy orders (V21.9.42 migration) */
  if (Array.isArray(cfg.orders) && cfg.orders.length > 0 && !cfg._legacyOrdersMigratedV2110) {
    issues.push({
      kind: "pending_migration_orders",
      severity: "warning",
      title: `Orders في legacy storage — ${cfg.orders.length} طلب`,
      detail: "الـ orders المفروض في seasons/{season}/orders/ subcollection. الـ legacy array بـ تخلي factory/config يكبر ويـ approach الـ 1MB limit.",
      hint: "افتح Diagnostics واضغط '📦 ابدأ نقل الـ Orders'.",
      navigateTo: "settings",
    });
  }

  /* 2b. Legacy recurring rules (V21.9.44 migration) */
  if (Array.isArray(cfg.recurringTreasury) && cfg.recurringTreasury.length > 0 && !cfg._partitionedRecurringV21944Done) {
    issues.push({
      kind: "pending_migration_recurring",
      severity: "warning",
      title: `Recurring rules غير محمية — ${cfg.recurringTreasury.length} قاعدة`,
      detail: "الـ recurringTreasury في cfg array — معرّضة لـ cross-device stale-write loss (السيناريو اللي حصل في V21.9.44 debugging).",
      hint: "افتح Diagnostics واضغط '🔁 ابدأ نقل القواعد'.",
      navigateTo: "settings",
    });
  }

  /* 2c. Older migrations — only surface if flag missing AND legacy field has data */
  const OLDER_MIGRATIONS = [
    { flag: "_splitDaysV1674Done", fields: ["treasury", "auditLog", "hrLog"], version: "V16.74", label: "Treasury / Audit / HR daily split" },
    { flag: "_splitDaysV1949Done", fields: ["custPayments", "supplierPayments", "wsPayments", "checks"], version: "V19.49", label: "Payments + Checks daily split" },
    { flag: "_splitDaysV1950Done", fields: ["salesInvoices", "purchaseInvoices", "purchaseOrders"], version: "V19.50", label: "Invoices daily split" },
    { flag: "_partitionedV1675Done", fields: ["hrWeeks"], version: "V16.75", label: "HR weeks per-id" },
    { flag: "_partitionedV1957Done", fields: ["customers", "suppliers", "workshops", "employees", "empDebts", "generalProducts", "fabrics", "accessories"], version: "V19.57", label: "Master data per-id" },
    { flag: "_partitionedV2192Done", fields: ["shopifyProducts", "shopifyCustomers"], version: "V21.9.2", label: "Shopify products + customers per-id" },
  ];
  for (const m of OLDER_MIGRATIONS) {
    if (cfg[m.flag]) continue; /* migration done */
    const legacyEntries = m.fields.reduce((sum, f) => sum + (Array.isArray(cfg[f]) ? cfg[f].length : 0), 0);
    if (legacyEntries > 0) {
      issues.push({
        kind: "pending_migration_old",
        severity: legacyEntries > 500 ? "error" : "warning",
        title: `${m.version} migration لسه ما تمتش — ${legacyEntries} entry`,
        detail: `${m.label} — الـ data لسه في cfg arrays. لو سـ سنوات من النشاط، الـ doc بـ يـ approach 1MB.`,
        hint: "افتح الـ app بـ user admin — الـ migration المفروض تـ run-ـت تلقائياً. لو لأ، راجع console logs لـ errors.",
        navigateTo: "settings",
      });
    }
  }

  /* ═══ 3. factory/config size health ═══════════════════════════
     V21.9.46+: estimate the doc size if not provided. Warn at
     >60%, error at >80%, critical at >90%. */
  if (typeof cfgSizeBytes === "number" && cfgSizeBytes > 0) {
    const pct = (cfgSizeBytes / (1024 * 1024)) * 100;
    if (pct >= 90) {
      issues.push({
        kind: "config_size_critical",
        severity: "critical",
        title: `factory/config حجمه ${(cfgSizeBytes / 1024).toFixed(0)} KB (${pct.toFixed(1)}% من الحد)`,
        detail: "الـ doc قارب على الـ 1MB limit. أي write جديد ممكن يفشل بـ 'حجم البيانات تجاوز الحد'.",
        hint: "افتح Diagnostics → شغّل الـ migrations المتاحة لـ تنقّل arrays لـ subcollections.",
        navigateTo: "settings",
      });
    } else if (pct >= 80) {
      issues.push({
        kind: "config_size_error",
        severity: "error",
        title: `factory/config حجمه ${(cfgSizeBytes / 1024).toFixed(0)} KB (${pct.toFixed(1)}% من الحد)`,
        detail: "الـ doc قرب على الـ 1MB. هـ يحتاج تنظيف قريب.",
        hint: "افتح Diagnostics وراجع 'أكبر arrays' + شغّل الـ migrations المتاحة.",
        navigateTo: "settings",
      });
    } else if (pct >= 60) {
      issues.push({
        kind: "config_size_warning",
        severity: "warning",
        title: `factory/config حجمه ${(cfgSizeBytes / 1024).toFixed(0)} KB (${pct.toFixed(1)}% من الحد)`,
        detail: "الـ doc بـ يكبر — راقبه + شغّل migrations لو متاحة.",
        hint: "Diagnostics → 'storage' section.",
        navigateTo: "settings",
      });
    }
  }

  /* ═══ 4. Data sanity checks ═══════════════════════════════════ */

  /* 4a. treasuryAccounts must have at least 1 entry */
  if (!Array.isArray(data?.treasuryAccounts) || data.treasuryAccounts.length === 0) {
    issues.push({
      kind: "missing_treasury_accounts",
      severity: "error",
      title: "مفيش حسابات خزنة",
      detail: "data.treasuryAccounts فاضي — لا يمكن تسجيل أي حركة خزنة بدون حساب واحد على الأقل (مثل MAIN CASH).",
      hint: "افتح TreasuryPg → الحسابات → أضف حساب جديد.",
      navigateTo: "treasury",
    });
  }

  /* 4b. activeSeason must be set */
  if (!cfg.activeSeason) {
    issues.push({
      kind: "missing_active_season",
      severity: "error",
      title: "مفيش موسم نشط (activeSeason)",
      detail: "configDoc.activeSeason فاضي — الـ orders بـ تحفظ في seasons/{activeSeason}/orders/ فلازم يتحدد.",
      hint: "افتح Settings → general → اختار الموسم النشط (مثل WS26).",
      navigateTo: "settings",
    });
  }

  /* 4c. Stale tombstones — _deletedCustPayTreasuryIds shouldn't exceed cap (1000) */
  if (Array.isArray(cfg._deletedCustPayTreasuryIds) && cfg._deletedCustPayTreasuryIds.length > 1000) {
    issues.push({
      kind: "stale_tombstones",
      severity: "info",
      title: `Tombstone array تخطى الحد — ${cfg._deletedCustPayTreasuryIds.length} entry`,
      detail: "الـ _deletedCustPayTreasuryIds مفروض cap على 1000 (V21.9.251: اترفع من 200 لتقليل خطر بعث المحذوفات). أي ذيادة بـ تستهلك مساحة بـ لا فائدة.",
      hint: "صغير الأثر — هـ يتـ trim تلقائياً في الـ delete التالية.",
      navigateTo: null,
    });
  }

  /* ═══ 5. Confirmed transfers missing legs (V21.9.45 sanity) ═══
     Quick heuristic: scan transfers + treasury for legs by transferId. */
  const transfers = Array.isArray(data?.treasuryTransfers) ? data.treasuryTransfers : [];
  const treasury = Array.isArray(data?.treasury) ? data.treasury : [];
  if (transfers.length > 0 && treasury.length > 0) {
    const legsByTransferId = new Map();
    for (const t of treasury) {
      if (t && t.transferId) {
        if (!legsByTransferId.has(t.transferId)) legsByTransferId.set(t.transferId, []);
        legsByTransferId.get(t.transferId).push(t);
      }
    }
    let brokenCount = 0;
    for (const tf of transfers) {
      if (tf.status !== "confirmed") continue;
      const legs = legsByTransferId.get(tf.id) || [];
      const hasOut = legs.some(l => l.type === "out");
      const hasIn = legs.some(l => l.type === "in");
      if ((tf.fromAccount && !hasOut) || (tf.toAccount && !hasIn)) {
        brokenCount++;
      }
    }
    if (brokenCount > 0) {
      issues.push({
        kind: "transfers_missing_legs",
        severity: "error",
        title: `${brokenCount} تحويل معتمد بدون legs في الخزنة`,
        detail: "الـ transfer اتعمل approve لكن الـ out/in entries مش في الـ treasury log. يعني الـ balance على الحسابات مش متطابق مع التحويلات المعتمدة.",
        hint: "افتح Diagnostics واضغط '🔧 فحص + إصلاح' في قسم 'إصلاح التحويلات المعتمدة'.",
        navigateTo: "settings",
      });
    }
  }

  /* ═══ 6. V21.9.67: Unresolved accounting-post failures ═══════
     Each autoPost.* call records to data.accountingPostFailures on failure
     (see src/utils/accounting/autoPost.js:recordFailure). These represent
     journal entries that SHOULD have been posted but weren't — meaning the
     operational state (treasury, hrLog, wsPayments) and the accounting books
     (accountingDays) are out of sync. Without this surface, admin has no idea
     until they hit a Trial Balance mismatch.

     V21.9.67 root context: this metric became MUCH more important when we
     fixed Bug #2 (sequential autoPost + skip-on-upConfig-failure). Before,
     orphans accumulated invisibly; now they're explicitly recorded — but only
     useful if the admin can SEE them. */
  if (Array.isArray(cfg.accountingPostFailures)) {
    const unresolved = cfg.accountingPostFailures.filter(f => f && !f.resolvedAt);
    if (unresolved.length > 0) {
      /* Group by type for the detail message */
      const byType = {};
      for (const f of unresolved) {
        const t = f.type || "unknown";
        byType[t] = (byType[t] || 0) + 1;
      }
      const breakdown = Object.entries(byType)
        .map(([t, n]) => `${t}:${n}`)
        .slice(0, 5)
        .join(", ");
      /* Severity: error if >5 failures, warning otherwise. Critical never —
         this is recoverable via Diagnostics → retry, not data-loss. */
      const severity = unresolved.length > 5 ? "error" : "warning";
      issues.push({
        kind: "accounting_post_failures",
        severity,
        title: `${unresolved.length} entry مش متـ post في المحاسبة`,
        detail: `الـ Trial Balance ممكن يكون مش matching مع الخزنة. الـ types: ${breakdown}${Object.keys(byType).length > 5 ? "…" : ""}`,
        hint: "افتح Diagnostics → 'محاسبة' → 'إعادة محاولة'. الـ builders idempotent.",
        navigateTo: "settings",
      });
    }
  }

  /* ═══ Sort by severity DESC, then by kind alphabetically ═══ */
  issues.sort((a, b) => {
    const sa = SEVERITY_RANK[a.severity] || 0;
    const sb = SEVERITY_RANK[b.severity] || 0;
    if (sa !== sb) return sb - sa;
    return String(a.kind).localeCompare(String(b.kind));
  });

  return issues;
}

/* Summary helper — counts issues by severity. */
export function summarizeHealth(issues) {
  const counts = { critical: 0, error: 0, warning: 0, info: 0 };
  for (const i of issues || []) {
    if (counts[i.severity] !== undefined) counts[i.severity]++;
  }
  const total = (issues || []).length;
  const worst = counts.critical > 0 ? "critical"
              : counts.error    > 0 ? "error"
              : counts.warning  > 0 ? "warning"
              : counts.info     > 0 ? "info"
              : "ok";
  return { total, counts, worst };
}

/* Severity → color mapping (for UI badges) */
export const SEVERITY_COLORS = {
  critical: "#DC2626",  /* red-600 */
  error:    "#EA580C",  /* orange-600 */
  warning:  "#D97706",  /* amber-600 */
  info:     "#0284C7",  /* sky-600 */
  ok:       "#10B981",  /* emerald-500 */
};

/* Severity → emoji (for compact display) */
export const SEVERITY_EMOJI = {
  critical: "🚨",
  error:    "❌",
  warning:  "⚠️",
  info:     "ℹ️",
  ok:       "✅",
};
