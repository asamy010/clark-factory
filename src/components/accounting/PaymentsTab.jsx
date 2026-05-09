/* ════════════════════════════════════════════════════════════════════════
   CLARK V18.63 · Accounting · PaymentsTab
   ══════════════════════════════════════════════════════════════════════════
   
   Comprehensive log of ALL payments — combines:
     • Customer cash payments    (config.custPayments[])
     • Supplier cash payments    (config.supplierPayments[])
     • Receivable checks         (config.checks[] where type="receivable")
     • Payable checks            (config.checks[] where type="payable")
   
   Filters:
     • Direction:  all / incoming (in) / outgoing (out)
     • Channel:    all / cash / check
     • Status:     all / cleared / pending  (checks only)
     • Date range
     • Free-text search on party name + notes
   
   Why this lives in Accounting (V18.63):
   ─────────────────────────────────────
   Pre-V18.63 the per-customer payments log lived inside the customer-statement
   popup in Sales. Users wanted a single global view of ALL payments (cash +
   checks, customers + suppliers) for accounting reconciliation. This tab is
   that view.
   ════════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { Btn, Card, Inp, Sel } from "../ui.jsx";
import { fmt } from "../../utils/format.js";
import { matchPartyFromDesc } from "../../utils/orders.js";

const DIRECTIONS = [
  {key:"all", label:"الكل",       icon:"📊"},
  {key:"in",  label:"وارد",       icon:"📥", color:"#10B981"},
  {key:"out", label:"صادر",       icon:"📤", color:"#EF4444"},
];

const CHANNELS = [
  {key:"all",   label:"الكل"},
  {key:"cash",  label:"نقدي"},
  {key:"check", label:"شيك"},
];

const STATUSES = [
  {key:"all",     label:"الكل"},
  {key:"cleared", label:"محصلة/مدفوعة"},
  {key:"pending", label:"معلقة"},
];

/* Cash-payment "method" values that count as a cheque rather than cash */
const CHEQUE_METHODS = new Set(["شيك"]);

/* V19.12: Generate a stable id for payment rows. */
const _gid = () => "p_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);

export function PaymentsTab({ config, upConfig, userName, T, FS, isMob, showToast }){
  const today = new Date().toISOString().split("T")[0];
  const yearStart = today.slice(0,4) + "-01-01";

  const [direction, setDirection] = useState("all");
  const [channel, setChannel]     = useState("all");
  const [status, setStatus]       = useState("all");
  const [from, setFrom]           = useState(yearStart);
  const [to, setTo]               = useState(today);
  const [search, setSearch]       = useState("");
  /* V19.12: confirmation dialog state for delete */
  const [confirmDel, setConfirmDel] = useState(null);
  /* V19.12: indicator for the in-flight global sync */
  const [syncing, setSyncing] = useState(false);

  /* V19.12: DELETE handler — handles all 5 _kind variants:
       custPay / supPay        → remove from custPayments/supplierPayments + linked treasury entry + add tombstone
       treasuryOrphanCust/Sup  → remove from treasury + add tombstone (these only exist in treasury)
       check                   → not deleted from here (refer to checks management)
     The tombstone (`_deletedCustPayTreasuryIds` / `_deletedSupplierPayTreasuryIds`)
     prevents V19.9 recovery from re-creating the deleted payment. */
  const deletePayment = (p) => {
    if (!upConfig) { showToast("⛔ تعذر الحذف — صلاحية الكتابة غير متاحة"); return; }
    if (p._kind === "check") {
      showToast("ℹ️ حذف الشيك من 'إدارة الشيكات' في صفحة الخزنة (يحفظ السجل التاريخي)");
      return;
    }
    upConfig(d => {
      if (p._kind === "custPay") {
        /* Mirror logic of delCustPay in CustDeliverPg */
        const pay = (d.custPayments || []).find(x => x.id === p.id);
        d.custPayments = (d.custPayments || []).filter(x => x.id !== p.id);
        if (pay) {
          if (pay.treasuryTxId && d.treasury) d.treasury = d.treasury.filter(t => t.id !== pay.treasuryTxId);
          else if (d.treasury) {
            /* Legacy fallback — match by category+custId+amount+date */
            d.treasury = d.treasury.filter(t => !(t.category === "دفعة عميل" && t.custId === pay.custId && Math.abs((Number(t.amount)||0) - (Number(pay.amount)||0)) < 0.01 && t.date === pay.date));
          }
          if (!d._deletedCustPayTreasuryIds) d._deletedCustPayTreasuryIds = [];
          if (pay.treasuryTxId) d._deletedCustPayTreasuryIds.push(pay.treasuryTxId);
          if (d._deletedCustPayTreasuryIds.length > 200) d._deletedCustPayTreasuryIds = d._deletedCustPayTreasuryIds.slice(-200);
        }
      } else if (p._kind === "supPay") {
        const pay = (d.supplierPayments || []).find(x => x.id === p.id);
        d.supplierPayments = (d.supplierPayments || []).filter(x => x.id !== p.id);
        if (pay) {
          if (pay.treasuryTxId && d.treasury) d.treasury = d.treasury.filter(t => t.id !== pay.treasuryTxId);
          else if (d.treasury) {
            d.treasury = d.treasury.filter(t => !(t.category === "دفعة مورد" && t.supplierId === pay.supplierId && Math.abs((Number(t.amount)||0) - (Number(pay.amount)||0)) < 0.01 && t.date === pay.date));
          }
          if (!d._deletedSupplierPayTreasuryIds) d._deletedSupplierPayTreasuryIds = [];
          if (pay.treasuryTxId) d._deletedSupplierPayTreasuryIds.push(pay.treasuryTxId);
          if (d._deletedSupplierPayTreasuryIds.length > 200) d._deletedSupplierPayTreasuryIds = d._deletedSupplierPayTreasuryIds.slice(-200);
        }
      } else if (p._kind === "treasuryOrphanCust" || p._kind === "treasuryOrphanSup") {
        /* The id is "tcust:RAW_ID" or "tsup:RAW_ID" — strip the prefix */
        const rawId = p.id.replace(/^t(cust|sup):/, "");
        if (d.treasury) d.treasury = d.treasury.filter(t => t.id !== rawId);
        const tomb = p._kind === "treasuryOrphanCust" ? "_deletedCustPayTreasuryIds" : "_deletedSupplierPayTreasuryIds";
        if (!d[tomb]) d[tomb] = [];
        d[tomb].push(rawId);
        if (d[tomb].length > 200) d[tomb] = d[tomb].slice(-200);
      }
    });
    setConfirmDel(null);
    showToast("✓ تم حذف الدفعة وكل الحركات المرتبطة");
  };

  /* V19.12: Manual sync — runs the V19.9 recovery logic on demand.
     Scans treasury for orphan customer/supplier payments (no link in
     custPayments/supplierPayments), tries to auto-match the party from
     the description, and creates the missing payment records.
     Honors tombstones — won't re-link deleted payments. */
  const runSync = () => {
    if (!upConfig) { showToast("⛔ تعذر المزامنة — صلاحية الكتابة غير متاحة"); return; }
    setSyncing(true);
    try {
      const customers = config.customers || [];
      const suppliers = config.suppliers || [];
      const custPayTxIds = new Set((config.custPayments || []).map(p => p.treasuryTxId).filter(Boolean));
      const supPayTxIds = new Set((config.supplierPayments || []).map(p => p.treasuryTxId).filter(Boolean));
      const tombstones = new Set([
        ...(config._deletedCustPayTreasuryIds || []),
        ...(config._deletedSupplierPayTreasuryIds || []),
      ]);
      const orphans = [];
      (config.treasury || []).forEach(tx => {
        if (!tx || !tx.id) return;
        if (tombstones.has(tx.id)) return;
        /* V19.80.12: handle treasury entries that ALREADY carry supplierId/custId
           but have no matching custPayments/supplierPayments record. This is the
           common case for HR weekly "دفعة مورد" expenses (V19.80.11) — the
           treasury entry has supplierId set on creation, but no supplierPayment
           was pushed. Just create the missing payment record using the linked ID. */
        if (tx.type === "out" && tx.supplierId && !supPayTxIds.has(tx.id)) {
          const s = suppliers.find(x => String(x.id) === String(tx.supplierId));
          if (s) { orphans.push({kind: "supplier", tx, party: s}); return; }
        }
        if (tx.type === "in" && tx.custId && !custPayTxIds.has(tx.id)) {
          const c = customers.find(x => String(x.id) === String(tx.custId));
          if (c) { orphans.push({kind: "customer", tx, party: c}); return; }
        }
        /* Legacy path: treasury entry with no party ID — try matching by name in desc.
           Skip entries that have a sourceType (those are HR/cost/manufacturing entries
           that aren't standalone "دفعة عميل/مورد" rows). */
        if (tx.sourceType) return;
        const haystack = ((tx.desc||"") + " " + (tx.notes||"")).trim();
        if (!haystack) return;
        if (tx.type === "in" && tx.category === "دفعة عميل" && !tx.custId && !custPayTxIds.has(tx.id)) {
          const m = matchPartyFromDesc(haystack, customers, {minNameLength: 3});
          if (m) orphans.push({kind: "customer", tx, party: m});
        } else if (tx.type === "out" && tx.category === "دفعة مورد" && !tx.supplierId && !supPayTxIds.has(tx.id)) {
          const m = matchPartyFromDesc(haystack, suppliers, {minNameLength: 3});
          if (m) orphans.push({kind: "supplier", tx, party: m});
        }
      });
      if (orphans.length === 0) {
        showToast("✓ كل الدفعات مزامنة بالفعل — لا حركات يتيمة");
        setSyncing(false);
        return;
      }
      upConfig(d => {
        if (!d.custPayments) d.custPayments = [];
        if (!d.supplierPayments) d.supplierPayments = [];
        const now = new Date().toISOString();
        orphans.forEach(({kind, tx, party}) => {
          if (kind === "customer") {
            d.custPayments.push({
              id: _gid(),
              custId: party.id,
              custName: party.name,
              amount: Number(tx.amount) || 0,
              date: tx.date,
              note: tx.notes || tx.desc || "",
              method: "كاش",
              by: tx.by || (userName + "-sync"),
              treasuryTxId: tx.id,
              createdAt: now,
              _v1912ManualSync: now,
            });
            const t = d.treasury?.find(x => x.id === tx.id);
            if (t) t.custId = party.id;
          } else if (kind === "supplier") {
            d.supplierPayments.push({
              id: _gid(),
              supplierId: party.id,
              supplierName: party.name,
              amount: Number(tx.amount) || 0,
              date: tx.date,
              note: tx.notes || tx.desc || "",
              method: "كاش",
              by: tx.by || (userName + "-sync"),
              treasuryTxId: tx.id,
              createdAt: now,
              _v1912ManualSync: now,
            });
            const t = d.treasury?.find(x => x.id === tx.id);
            if (t) t.supplierId = party.id;
          }
        });
      });
      showToast("✓ تم ربط " + orphans.length + " دفعة يتيمة بالعملاء/الموردين");
    } catch (e) {
      console.error("[V19.12 sync] failed:", e);
      showToast("⛔ فشلت المزامنة — راجع الـconsole");
    } finally {
      setSyncing(false);
    }
  };

  /* V19.13: DEAD-CLEANUP — removes cust/supplier payments whose treasury entry
     no longer exists. This handles the case where a user deleted a treasury
     entry BEFORE V19.13 (no tombstone added at the time), leaving a stale
     custPayment/supplierPayment record that still appears in customer/supplier
     statements. Runs on demand from a dedicated button. Adds tombstones for
     the removed entries' treasury IDs as a belt-and-suspenders measure. */
  const [cleaning, setCleaning] = useState(false);
  const [cleanupPreview, setCleanupPreview] = useState(null);
  
  /* Pass 1: scan and report what would be cleaned */
  const previewDeadCleanup = () => {
    const treasuryIds = new Set((config.treasury||[]).map(t=>t.id).filter(Boolean));
    const deadCust = (config.custPayments||[]).filter(p =>
      p.treasuryTxId && !treasuryIds.has(p.treasuryTxId)
    );
    const deadSup = (config.supplierPayments||[]).filter(p =>
      p.treasuryTxId && !treasuryIds.has(p.treasuryTxId)
    );
    if (deadCust.length === 0 && deadSup.length === 0) {
      showToast("✓ لا توجد دفعات ميتة — كل الدفعات لها حركة خزنة سليمة");
      return;
    }
    setCleanupPreview({ deadCust, deadSup });
  };
  
  /* Pass 2: actually delete after confirmation */
  const confirmDeadCleanup = () => {
    if (!cleanupPreview || !upConfig) return;
    setCleaning(true);
    try {
      const { deadCust, deadSup } = cleanupPreview;
      upConfig(d => {
        const deadCustIds = new Set(deadCust.map(p => p.id));
        const deadSupIds = new Set(deadSup.map(p => p.id));
        d.custPayments = (d.custPayments||[]).filter(p => !deadCustIds.has(p.id));
        d.supplierPayments = (d.supplierPayments||[]).filter(p => !deadSupIds.has(p.id));
        /* Add tombstones for the (already-deleted) treasury IDs */
        if (!Array.isArray(d._deletedCustPayTreasuryIds)) d._deletedCustPayTreasuryIds = [];
        if (!Array.isArray(d._deletedSupplierPayTreasuryIds)) d._deletedSupplierPayTreasuryIds = [];
        deadCust.forEach(p => p.treasuryTxId && d._deletedCustPayTreasuryIds.push(p.treasuryTxId));
        deadSup.forEach(p => p.treasuryTxId && d._deletedSupplierPayTreasuryIds.push(p.treasuryTxId));
        if (d._deletedCustPayTreasuryIds.length > 200) d._deletedCustPayTreasuryIds = d._deletedCustPayTreasuryIds.slice(-200);
        if (d._deletedSupplierPayTreasuryIds.length > 200) d._deletedSupplierPayTreasuryIds = d._deletedSupplierPayTreasuryIds.slice(-200);
      });
      showToast("✓ تم تنظيف " + (cleanupPreview.deadCust.length + cleanupPreview.deadSup.length) + " دفعة ميتة");
      setCleanupPreview(null);
    } catch (e) {
      console.error("[V19.13 dead-cleanup] failed:", e);
      showToast("⛔ فشل التنظيف — راجع الـconsole");
    } finally {
      setCleaning(false);
    }
  };

  /* V19.80.17: RECOVER MISSING CLOSE-WEEK TREASURY ENTRIES
     Companion to the V19.80.16 root-cause fix (silent-rejection / blind-cleanup).
     Pre-V19.80.16 incidents may have left closed weeks with `weeklyAdvances`/
     `weeklyWsPayments`/`weeklyOtherExpenses`/`closedRecords` snapshots referencing
     treasuryTxIds that no longer exist in `config.treasury` (the entries were
     never persisted to Firestore in the first place — see V19.80.16 changelog).
     This scanner walks every closed week, cross-references each snapshot entry
     against the live treasury, and recreates the missing entries from the
     snapshot data. Salaries (no treasuryTxId stored back) are matched by
     weekId+empId+sourceType=hr_salary; misses are recreated with a fresh id. */
  const [recovering, setRecovering] = useState(false);
  const [recoveryPreview, setRecoveryPreview] = useState(null);

  const _dayName = (date) => {
    const days = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
    if (!date) return "";
    const d = new Date(date);
    if (isNaN(d.getTime())) return "";
    return days[d.getDay()] || "";
  };
  const _r2 = (n) => Math.round(Number(n)*100)/100;
  const _gidR = () => "rec_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);

  const previewMissingCloseWeekEntries = () => {
    const treasuryIds = new Set((config.treasury || []).map(t => t.id).filter(Boolean));
    /* For salary lookup: index treasury by weekId+empId where sourceType=hr_salary */
    const salaryByKey = new Set();
    (config.treasury || []).forEach(t => {
      if (t && t.sourceType === "hr_salary" && t.weekId && t.empId) {
        salaryByKey.add(t.weekId + "::" + t.empId);
      }
    });
    const missing = { salaries: [], advances: [], wsPayments: [], otherExps: [] };

    (config.hrWeeks || []).forEach(w => {
      if (w.status !== "closed") return;
      /* Salaries — from closedRecords snapshot. No treasuryTxId stored back, match by composite key. */
      if (Array.isArray(w.closedRecords)) {
        w.closedRecords.forEach(r => {
          const thursdayPay = Number(r.thursdayPay) || 0;
          if (thursdayPay <= 0) return;
          if (salaryByKey.has(w.id + "::" + r.empId)) return;
          missing.salaries.push({ week: w, record: r });
        });
      }
      /* Weekly advances */
      (w.weeklyAdvances || []).forEach(a => {
        if (a.planned) return;
        if (!a.treasuryTxId) return;
        if (treasuryIds.has(a.treasuryTxId)) return;
        missing.advances.push({ week: w, advance: a });
      });
      /* Workshop payments */
      (w.weeklyWsPayments || []).forEach(p => {
        if (p.planned) return;
        if (!p.treasuryTxId) return;
        if (treasuryIds.has(p.treasuryTxId)) return;
        missing.wsPayments.push({ week: w, payment: p });
      });
      /* Other expenses */
      (w.weeklyOtherExpenses || []).forEach(ex => {
        if (ex.planned) return;
        if (!ex.treasuryTxId) return;
        if (treasuryIds.has(ex.treasuryTxId)) return;
        missing.otherExps.push({ week: w, expense: ex });
      });
    });

    const total = missing.salaries.length + missing.advances.length + missing.wsPayments.length + missing.otherExps.length;
    if (total === 0) {
      showToast("✓ كل الحركات سليمة — لا حركات مفقودة في الخزنة");
      return;
    }
    setRecoveryPreview(missing);
  };

  const confirmRecovery = () => {
    if (!recoveryPreview || !upConfig) return;
    setRecovering(true);
    try {
      const m = recoveryPreview;
      upConfig(d => {
        if (!Array.isArray(d.treasury)) d.treasury = [];
        if (!Array.isArray(d.hrLog)) d.hrLog = [];
        if (!Array.isArray(d.supplierPayments)) d.supplierPayments = [];
        if (!Array.isArray(d.wsPayments)) d.wsPayments = [];
        if (!Array.isArray(d.auditLog)) d.auditLog = [];
        const now = new Date().toISOString();
        const season = d.activeSeason || "";

        m.salaries.forEach(({ week: w, record: r }) => {
          const thursdayPay = _r2(Number(r.thursdayPay) || 0);
          const date = w.closedAt || w.actualClosedAt || w.weekEnd || "";
          d.treasury.unshift({
            id: _gidR(),
            type: "out",
            amount: thursdayPay,
            desc: "مرتب " + (r.empName || "") + " W" + w.weekNum,
            category: "مرتبات",
            account: "SUB CASH",
            season,
            date,
            day: _dayName(date),
            sourceType: "hr_salary",
            weekId: w.id,
            empId: r.empId,
            by: "RECOVERY-V19.80.17",
            createdAt: now,
            snapshotId: w.snapshotId || null,
            recoveredAt: now,
            recoveredFrom: "missing-close-week-entry",
          });
        });

        m.advances.forEach(({ week: w, advance: a }) => {
          d.treasury.unshift({
            id: a.treasuryTxId,
            type: "out",
            amount: _r2(Number(a.amount) || 0),
            desc: "سلفة " + (a.empName || "") + " W" + w.weekNum + (a.note ? " — " + a.note : ""),
            category: "مرتبات",
            account: "SUB CASH",
            season,
            date: a.date || "",
            day: _dayName(a.date || ""),
            sourceType: "hr_weekly_advance",
            weekId: w.id,
            empId: a.empId,
            weeklyAdvanceId: a.id,
            by: "RECOVERY-V19.80.17",
            createdAt: now,
            snapshotId: w.snapshotId || null,
            recoveredAt: now,
            recoveredFrom: "missing-close-week-entry",
          });
          const hrLogExists = (d.hrLog || []).some(h => h.weeklyAdvanceId === a.id);
          if (!hrLogExists) {
            d.hrLog.unshift({
              id: _gidR(),
              type: "weekly_advance",
              empId: a.empId,
              empName: a.empName || "",
              empJob: a.empJob || "",
              amount: Number(a.amount) || 0,
              note: a.note || "",
              weekId: w.id,
              weekStart: w.weekStart,
              weekEnd: w.weekEnd,
              date: a.date || "",
              by: "RECOVERY-V19.80.17",
              createdAt: now,
              weeklyAdvanceId: a.id,
              treasuryTxId: a.treasuryTxId,
              snapshotId: w.snapshotId || null,
            });
          }
        });

        m.wsPayments.forEach(({ week: w, payment: p }) => {
          const _wsLabel = (p.wsName || "").replace(/^\s*ورشة\s+/, "");
          d.treasury.unshift({
            id: p.treasuryTxId,
            type: "out",
            amount: _r2(Number(p.amount) || 0),
            desc: (p.type === "payment" ? "دفعة ورشة " : "مشتريات ورشة ") + _wsLabel + " W" + w.weekNum + (p.note ? " — " + p.note : ""),
            category: p.type === "payment" ? "تشغيل خارجي" : "مشتريات",
            account: "SUB CASH",
            season,
            date: p.date || "",
            day: _dayName(p.date || ""),
            sourceType: "hr_weekly_ws_payment",
            weekId: w.id,
            wsName: p.wsName || "",
            wsPaymentId: p.wsPaymentId || null,
            by: "RECOVERY-V19.80.17",
            createdAt: now,
            snapshotId: w.snapshotId || null,
            recoveredAt: now,
            recoveredFrom: "missing-close-week-entry",
          });
          if (p.wsPaymentId) {
            const wsPayExists = (d.wsPayments || []).some(wp => wp.id === p.wsPaymentId);
            if (!wsPayExists) {
              d.wsPayments.push({
                id: p.wsPaymentId,
                wsName: p.wsName || "",
                wsId: p.wsId || null,
                amount: Number(p.amount) || 0,
                type: p.type || "payment",
                notes: p.note || "",
                date: p.date || "",
                createdBy: "RECOVERY-V19.80.17",
                treasuryTxId: p.treasuryTxId,
                sourceWeekId: w.id,
              });
            }
          }
        });

        m.otherExps.forEach(({ week: w, expense: ex }) => {
          d.treasury.unshift({
            id: ex.treasuryTxId,
            type: "out",
            amount: _r2(Number(ex.amount) || 0),
            desc: "مصروف — " + (ex.category || "") + " W" + w.weekNum + (ex.desc ? " — " + ex.desc : ""),
            category: ex.category || "مصاريف أخرى",
            account: ex.account || "SUB CASH",
            season,
            date: ex.date || "",
            day: _dayName(ex.date || ""),
            sourceType: "hr_other_expense",
            weekId: w.id,
            ...(ex.supplierId ? { supplierId: ex.supplierId, supplierName: ex.supplierName || "" } : {}),
            by: "RECOVERY-V19.80.17",
            createdAt: now,
            snapshotId: w.snapshotId || null,
            recoveredAt: now,
            recoveredFrom: "missing-close-week-entry",
          });
          if (ex.supplierId) {
            const supPayExists = (d.supplierPayments || []).some(sp => sp.treasuryTxId === ex.treasuryTxId);
            if (!supPayExists) {
              d.supplierPayments.push({
                id: _gidR(),
                supplierId: ex.supplierId,
                supplierName: ex.supplierName || "",
                amount: _r2(Number(ex.amount) || 0),
                date: ex.date || "",
                note: ex.desc || "",
                method: "كاش",
                account: ex.account || "SUB CASH",
                by: "RECOVERY-V19.80.17",
                treasuryTxId: ex.treasuryTxId,
                createdAt: now,
                sourceType: "hr_other_expense_supplier",
                sourceWeekId: w.id,
              });
            }
          }
        });

        d.auditLog.unshift({
          id: _gidR(),
          category: "treasury",
          action: "v19.80.17_recovery",
          target: "missing close-week entries",
          meta: {
            salaries: m.salaries.length,
            advances: m.advances.length,
            wsPayments: m.wsPayments.length,
            otherExps: m.otherExps.length,
          },
          by: "RECOVERY-V19.80.17",
          ts: now,
        });
      });
      const total = m.salaries.length + m.advances.length + m.wsPayments.length + m.otherExps.length;
      showToast("✓ تم استرداد " + total + " حركة مفقودة في الخزنة");
      setRecoveryPreview(null);
    } catch (e) {
      console.error("[V19.80.17 recovery] failed:", e);
      showToast("⛔ فشل الاسترداد — راجع الـconsole");
    } finally {
      setRecovering(false);
    }
  };

  /* Build a unified, normalized payment stream out of three sources. */
  const allPayments = useMemo(() => {
    const out = [];

    /* 1. Customer cash payments (incoming) */
    (config.custPayments || []).forEach(p => {
      const isCheque = CHEQUE_METHODS.has(p.method || "");
      out.push({
        _kind: "custPay",
        id: p.id,
        direction: "in",
        channel: isCheque ? "check" : "cash",
        date: p.date || "",
        amount: Number(p.amount) || 0,
        partyType: "عميل",
        partyName: p.custName || "—",
        partyId: p.custId || "",
        method: p.method || "كاش",
        status: "cleared", /* cash payments are always settled at time of recording */
        note: p.note || "",
        account: p.account || "",
        by: p.by || "",
        sourceLabel: "💵 دفعة عميل (نقدي/تحويل)",
      });
    });

    /* 2. Supplier cash payments (outgoing) */
    (config.supplierPayments || []).forEach(p => {
      const isCheque = CHEQUE_METHODS.has(p.method || "");
      out.push({
        _kind: "supPay",
        id: p.id,
        direction: "out",
        channel: isCheque ? "check" : "cash",
        date: p.date || "",
        amount: Number(p.amount) || 0,
        partyType: "مورد",
        partyName: p.supplierName || "—",
        partyId: p.supplierId || "",
        method: p.method || "كاش",
        status: "cleared",
        note: p.note || "",
        account: p.account || "",
        by: p.by || "",
        sourceLabel: "💸 دفعة مورد (نقدي/تحويل)",
      });
    });

    /* 3. Checks (both receivable and payable) */
    (config.checks || []).forEach(c => {
      const isReceivable = c.type === "receivable";
      const st = c.status || "معلق";
      /* Map the workflow status to our 3-state vocabulary */
      let normStatus = "pending";
      if (isReceivable) {
        if (st === "محصل" || st === "مُظهّر") normStatus = "cleared";
        else if (st === "مرتد" || st === "ملغي") normStatus = "cancelled";
        else normStatus = "pending";
      } else {
        if (st === "مدفوع") normStatus = "cleared";
        else if (st === "ملغي" || st === "مرتجع") normStatus = "cancelled";
        else normStatus = "pending";
      }
      out.push({
        _kind: "check",
        id: c.id,
        direction: isReceivable ? "in" : "out",
        channel: "check",
        /* Use due date for forward planning; fall back to issue date */
        date: c.date || c.dueDate || "",
        dueDate: c.dueDate || "",
        amount: Number(c.amount) || 0,
        partyType: isReceivable ? "عميل/طرف" : "مورد/طرف",
        partyName: c.party || "—",
        partyId: c.partyId || "",
        method: "شيك",
        status: normStatus,
        rawStatus: st,
        note: c.notes || "",
        bank: c.bank || "",
        checkNo: c.checkNo || "",
        category: c.category || "",
        statusDate: c.statusDate || "",
        by: c.by || "",
        sourceLabel: isReceivable ? "📝 شيك مستحق (وارد)" : "📝 شيك واجب الدفع (صادر)",
      });
    });

    /* 4. V18.64 — Orphan treasury entries (linked to a customer/supplier but
       NOT yet reflected in custPayments / supplierPayments).
       
       These are real cash flows the treasury has recorded but never made it
       into the per-party payment arrays — usually because of historic data
       desyncs (older versions, partial restores, manual edits). Surfacing
       them here so accounting can see the FULL payment history. */
    const knownTreasuryTxIds = new Set();
    (config.custPayments || []).forEach(p => p.treasuryTxId && knownTreasuryTxIds.add(p.treasuryTxId));
    (config.supplierPayments || []).forEach(p => p.treasuryTxId && knownTreasuryTxIds.add(p.treasuryTxId));
    /* V19.12: tombstones — exclude treasury entries that were explicitly deleted */
    const _tombstones = new Set([
      ...(config._deletedCustPayTreasuryIds || []),
      ...(config._deletedSupplierPayTreasuryIds || []),
    ]);
    (config.treasury || []).forEach(t => {
      if (!t.id) return;
      if (knownTreasuryTxIds.has(t.id)) return;
      if (_tombstones.has(t.id)) return;
      if (t.sourceType === "check_bounce") return;/* check-bounce reversals aren't payments */
      /* Orphan customer payment (incoming, has custId) */
      if (t.type === "in" && t.custId) {
        const c = (config.customers || []).find(x => x.id === t.custId);
        out.push({
          _kind: "treasuryOrphanCust",
          id: "tcust:" + t.id,
          direction: "in",
          channel: "cash",
          date: t.date || "",
          amount: Number(t.amount) || 0,
          partyType: "عميل",
          partyName: c ? c.name : "(عميل غير معروف)",
          partyId: t.custId,
          method: t.notes || "كاش",
          status: "cleared",
          note: t.notes || t.desc || "",
          account: t.account || "",
          by: t.by || "",
          sourceLabel: "⚠️ خزنة فقط (غير مزامنة في كشف العميل)",
          _orphan: true,
        });
      }
      /* Orphan supplier payment (outgoing, has supplierId) */
      if (t.type === "out" && t.supplierId) {
        const s = (config.suppliers || []).find(x => x.id === t.supplierId);
        out.push({
          _kind: "treasuryOrphanSup",
          id: "tsup:" + t.id,
          direction: "out",
          channel: "cash",
          date: t.date || "",
          amount: Number(t.amount) || 0,
          partyType: "مورد",
          partyName: s ? s.name : "(مورد غير معروف)",
          partyId: t.supplierId,
          method: t.notes || "كاش",
          status: "cleared",
          note: t.notes || t.desc || "",
          account: t.account || "",
          by: t.by || "",
          sourceLabel: "⚠️ خزنة فقط (غير مزامنة في كشف المورد)",
          _orphan: true,
        });
      }
    });

    /* Newest first */
    out.sort((a,b) => (b.date||"").localeCompare(a.date||""));
    return out;
  }, [config.custPayments, config.supplierPayments, config.checks, config.treasury, config.customers, config.suppliers]);

  /* Apply filters */
  const filtered = useMemo(() => {
    const q = (search||"").trim().toLowerCase();
    return allPayments.filter(p => {
      if (direction !== "all" && p.direction !== direction) return false;
      if (channel !== "all" && p.channel !== channel) return false;
      if (status !== "all") {
        if (status === "cleared" && p.status !== "cleared") return false;
        if (status === "pending" && p.status !== "pending") return false;
      }
      if (from && p.date && p.date < from) return false;
      if (to   && p.date && p.date > to)   return false;
      if (q) {
        const hay = ((p.partyName||"") + " " + (p.note||"") + " " + (p.checkNo||"") + " " + (p.bank||"")).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allPayments, direction, channel, status, from, to, search]);

  /* Aggregates */
  const stats = useMemo(() => {
    const incoming      = filtered.filter(p => p.direction === "in").reduce((s,p) => s + p.amount, 0);
    const outgoing      = filtered.filter(p => p.direction === "out").reduce((s,p) => s + p.amount, 0);
    const cashIncoming  = filtered.filter(p => p.direction === "in"  && p.channel === "cash").reduce((s,p) => s + p.amount, 0);
    const cashOutgoing  = filtered.filter(p => p.direction === "out" && p.channel === "cash").reduce((s,p) => s + p.amount, 0);
    const checkIncoming = filtered.filter(p => p.direction === "in"  && p.channel === "check").reduce((s,p) => s + p.amount, 0);
    const checkOutgoing = filtered.filter(p => p.direction === "out" && p.channel === "check").reduce((s,p) => s + p.amount, 0);
    const pendingChecks = filtered.filter(p => p.channel === "check" && p.status === "pending").reduce((s,p) => s + p.amount, 0);
    return {
      count: filtered.length,
      incoming, outgoing,
      cashIncoming, cashOutgoing,
      checkIncoming, checkOutgoing,
      pendingChecks,
      net: incoming - outgoing,
    };
  }, [filtered]);

  const TH_BASE = { padding:"8px 10px", fontSize:FS-2, fontWeight:800, color:T.textSec, textAlign:"right", borderBottom:"2px solid "+T.brd, whiteSpace:"nowrap" };
  const TD_BASE = { padding:"7px 10px", fontSize:FS-1, color:T.text, borderBottom:"1px solid "+T.brd };

  return <Card title="💰 سجل الدفعات الكامل" style={{marginBottom:16}}>
    <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:8, marginBottom:14}}>
      <div style={{fontSize:FS-2, color:T.textSec, lineHeight:1.7, flex:1, minWidth:200}}>
        💡 سجل موحّد لكل الدفعات: نقدي وشيكات، عملاء وموردين — بفلاتر اتجاه/قناة/حالة/تاريخ/بحث.
      </div>
      {/* V19.12: manual sync button — runs the V19.9 recovery on demand.
          Useful when the user opens the customer/supplier statement BEFORE
          opening the treasury page (where the auto-recovery normally fires).
          Also handy as a "force re-sync" after restore-from-backup or any
          time the user notices the cash totals don't match. */}
      <div style={{display:"flex", gap:6, flexWrap:"wrap"}}>
        <Btn small onClick={runSync} disabled={syncing} style={{background:"#0EA5E915", color:"#0EA5E9", border:"1px solid #0EA5E940", fontWeight:700, whiteSpace:"nowrap"}}>
          {syncing ? "⏳ جاري المزامنة..." : "🔄 مزامنة الدفعات اليتيمة"}
        </Btn>
        {/* V19.13: dead-cleanup — for users on data older than V19.13.
            If a treasury entry was deleted before tombstoning existed (V19.13+),
            its linked cust/supplier payment may have survived as a "ghost" still
            visible in customer/supplier statements. This button finds those
            ghosts (cust/supplierPayments with no matching treasury entry) and
            removes them, adding tombstones to prevent recovery from re-creating. */}
        <Btn small onClick={previewDeadCleanup} disabled={cleaning} style={{background:"#EF444415", color:"#EF4444", border:"1px solid #EF444440", fontWeight:700, whiteSpace:"nowrap"}}>
          {cleaning ? "⏳ جاري التنظيف..." : "🧹 تنظيف الدفعات الميتة"}
        </Btn>
        {/* V19.80.17: recover treasury entries that were lost to the V19.80.16 bug.
            Walks every closed week's snapshots (closedRecords/weeklyAdvances/
            weeklyWsPayments/weeklyOtherExpenses) and recreates any treasury entry
            referenced there but missing from config.treasury. */}
        <Btn small onClick={previewMissingCloseWeekEntries} disabled={recovering} style={{background:"#F59E0B15", color:"#F59E0B", border:"1px solid #F59E0B40", fontWeight:700, whiteSpace:"nowrap"}}>
          {recovering ? "⏳ جاري الاسترداد..." : "🚑 استرداد حركات الخزنة المفقودة"}
        </Btn>
      </div>
    </div>

    {/* Filter row */}
    <div style={{display:"grid", gridTemplateColumns: isMob ? "1fr 1fr" : "auto auto auto 1fr 1fr 2fr", gap:8, marginBottom:14, alignItems:"end"}}>
      <div>
        <label style={{fontSize:FS-3, color:T.textSec, fontWeight:700, display:"block", marginBottom:3}}>الاتجاه</label>
        <Sel value={direction} onChange={setDirection}>
          {DIRECTIONS.map(d => <option key={d.key} value={d.key}>{d.icon+" "+d.label}</option>)}
        </Sel>
      </div>
      <div>
        <label style={{fontSize:FS-3, color:T.textSec, fontWeight:700, display:"block", marginBottom:3}}>القناة</label>
        <Sel value={channel} onChange={setChannel}>
          {CHANNELS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </Sel>
      </div>
      <div>
        <label style={{fontSize:FS-3, color:T.textSec, fontWeight:700, display:"block", marginBottom:3}}>الحالة</label>
        <Sel value={status} onChange={setStatus}>
          {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </Sel>
      </div>
      <div>
        <label style={{fontSize:FS-3, color:T.textSec, fontWeight:700, display:"block", marginBottom:3}}>من</label>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{display:"block", width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid "+T.brd, fontSize:FS-1, fontFamily:"inherit", background:T.inputBg||T.cardSolid, color:T.text}}/>
      </div>
      <div>
        <label style={{fontSize:FS-3, color:T.textSec, fontWeight:700, display:"block", marginBottom:3}}>إلى</label>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{display:"block", width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid "+T.brd, fontSize:FS-1, fontFamily:"inherit", background:T.inputBg||T.cardSolid, color:T.text}}/>
      </div>
      <div>
        <label style={{fontSize:FS-3, color:T.textSec, fontWeight:700, display:"block", marginBottom:3}}>بحث</label>
        <Inp value={search} onChange={setSearch} placeholder="🔍 الطرف، البنك، رقم الشيك، ملاحظات..."/>
      </div>
    </div>

    {/* Stats cards */}
    <div style={{display:"grid", gridTemplateColumns: isMob ? "repeat(2, 1fr)" : "repeat(auto-fit, minmax(160px, 1fr))", gap:10, marginBottom:14}}>
      <div style={{padding:"10px 12px", borderRadius:10, background:"linear-gradient(135deg, #10B98112, #10B98103)", border:"1px solid #10B98130"}}>
        <div style={{fontSize:FS-3, color:T.textSec, fontWeight:700, marginBottom:4}}>📥 الوارد</div>
        <div style={{fontSize:FS+3, fontWeight:800, color:"#10B981"}}>{fmt(stats.incoming)} <span style={{fontSize:FS-2, fontWeight:600, color:T.textMut}}>ج.م</span></div>
        <div style={{fontSize:FS-3, color:T.textMut, marginTop:2}}>نقدي: {fmt(stats.cashIncoming)} | شيكات: {fmt(stats.checkIncoming)}</div>
      </div>
      <div style={{padding:"10px 12px", borderRadius:10, background:"linear-gradient(135deg, #EF444412, #EF444403)", border:"1px solid #EF444430"}}>
        <div style={{fontSize:FS-3, color:T.textSec, fontWeight:700, marginBottom:4}}>📤 الصادر</div>
        <div style={{fontSize:FS+3, fontWeight:800, color:"#EF4444"}}>{fmt(stats.outgoing)} <span style={{fontSize:FS-2, fontWeight:600, color:T.textMut}}>ج.م</span></div>
        <div style={{fontSize:FS-3, color:T.textMut, marginTop:2}}>نقدي: {fmt(stats.cashOutgoing)} | شيكات: {fmt(stats.checkOutgoing)}</div>
      </div>
      <div style={{padding:"10px 12px", borderRadius:10, background:"linear-gradient(135deg, "+T.accent+"12, "+T.accent+"03)", border:"1px solid "+T.accent+"30"}}>
        <div style={{fontSize:FS-3, color:T.textSec, fontWeight:700, marginBottom:4}}>⚖️ الصافي</div>
        <div style={{fontSize:FS+3, fontWeight:800, color:stats.net>=0?"#10B981":"#EF4444"}}>{fmt(stats.net)} <span style={{fontSize:FS-2, fontWeight:600, color:T.textMut}}>ج.م</span></div>
        <div style={{fontSize:FS-3, color:T.textMut, marginTop:2}}>{stats.count} حركة</div>
      </div>
      <div style={{padding:"10px 12px", borderRadius:10, background:"linear-gradient(135deg, #F59E0B12, #F59E0B03)", border:"1px solid #F59E0B30"}}>
        <div style={{fontSize:FS-3, color:T.textSec, fontWeight:700, marginBottom:4}}>⏳ شيكات معلقة</div>
        <div style={{fontSize:FS+3, fontWeight:800, color:"#F59E0B"}}>{fmt(stats.pendingChecks)} <span style={{fontSize:FS-2, fontWeight:600, color:T.textMut}}>ج.م</span></div>
        <div style={{fontSize:FS-3, color:T.textMut, marginTop:2}}>غير محصلة/مدفوعة بعد</div>
      </div>
    </div>

    {/* Payments table */}
    {filtered.length === 0 ? <div style={{textAlign:"center", padding:"36px 12px", color:T.textMut, background:T.bg, borderRadius:10}}>
      <div style={{fontSize:32, marginBottom:8}}>📭</div>
      <div style={{fontSize:FS-1, fontWeight:600}}>لا توجد دفعات مطابقة للفلاتر</div>
    </div>
    : <div style={{overflowX:"auto", border:"1px solid "+T.brd, borderRadius:10}}>
      <table style={{width:"100%", borderCollapse:"collapse", minWidth:isMob?700:0}}>
        <thead>
          <tr style={{background:T.bg}}>
            <th style={TH_BASE}>التاريخ</th>
            <th style={TH_BASE}>الاتجاه</th>
            <th style={TH_BASE}>القناة</th>
            <th style={TH_BASE}>الطرف</th>
            <th style={TH_BASE}>المبلغ</th>
            <th style={TH_BASE}>الحالة</th>
            <th style={TH_BASE}>تفاصيل</th>
            <th style={TH_BASE}>بواسطة</th>
            {/* V19.12: actions column for delete */}
            <th style={{...TH_BASE, textAlign:"center"}}>إجراءات</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((p, i) => {
            const dirColor = p.direction === "in" ? "#10B981" : "#EF4444";
            const dirLabel = p.direction === "in" ? "↘ وارد" : "↗ صادر";
            const isCheque = p.channel === "check";
            const isOrphan = !!p._orphan;
            const statusColor = p.status === "cleared" ? "#10B981" : p.status === "pending" ? "#F59E0B" : "#94A3B8";
            const statusLabel = p.status === "cleared" ? "✓ تم" : p.status === "pending" ? "⏳ معلق" : (p.rawStatus || "—");
            /* V19.12: only deletable kinds; checks should be deleted from check-management */
            const canDelete = p._kind === "custPay" || p._kind === "supPay" || p._kind === "treasuryOrphanCust" || p._kind === "treasuryOrphanSup";
            return <tr key={p._kind+":"+p.id} style={{
              background: isOrphan ? "#F59E0B08" : (i % 2 === 0 ? "transparent" : T.bg+"60"),
              borderInlineStart: isOrphan ? "3px solid #F59E0B" : "none",
            }} title={isOrphan ? "هذه الحركة موجودة في الخزنة لكن غير مزامنة في كشف الطرف. اضغط 'مزامنة الدفعات اليتيمة' بالأعلى." : ""}>
              <td style={{...TD_BASE, fontSize:FS-2, whiteSpace:"nowrap"}}>{p.date || "—"}{p.dueDate && p.dueDate !== p.date ? <div style={{fontSize:FS-3, color:T.textMut}}>استحقاق: {p.dueDate}</div> : null}</td>
              <td style={{...TD_BASE, color:dirColor, fontWeight:700, fontSize:FS-2}}>{dirLabel}</td>
              <td style={{...TD_BASE, fontSize:FS-2}}>
                <span style={{padding:"2px 8px", borderRadius:6, background: isCheque?"#8B5CF615":"#0EA5E915", color:isCheque?"#8B5CF6":"#0EA5E9", fontWeight:700}}>{isCheque ? "📝 شيك" : "💵 "+(p.method||"نقدي")}</span>
              </td>
              <td style={{...TD_BASE, fontWeight:700}}>
                {p.partyName}
                <div style={{fontSize:FS-3, color:T.textMut, fontWeight:400}}>{p.partyType}</div>
              </td>
              <td style={{...TD_BASE, textAlign:"center", fontWeight:800, color:dirColor, fontSize:FS}}>{fmt(p.amount)}</td>
              <td style={{...TD_BASE, fontSize:FS-2}}>
                {isOrphan
                  ? <span style={{padding:"2px 8px", borderRadius:6, background:"#F59E0B15", color:"#F59E0B", fontWeight:700, whiteSpace:"nowrap"}} title="هذه الحركة في الخزنة فقط — غير مزامنة في كشف الطرف">⚠️ غير مزامنة</span>
                  : <span style={{padding:"2px 8px", borderRadius:6, background:statusColor+"15", color:statusColor, fontWeight:700, whiteSpace:"nowrap"}}>{statusLabel}</span>
                }
              </td>
              <td style={{...TD_BASE, fontSize:FS-3, color:T.textSec, maxWidth:240}}>
                {isCheque && <div>
                  {p.bank && <span style={{padding:"1px 6px", borderRadius:4, background:T.bg, marginInlineEnd:4}}>🏦 {p.bank}</span>}
                  {p.checkNo && <span style={{padding:"1px 6px", borderRadius:4, background:T.bg, fontFamily:"monospace"}}>#{p.checkNo}</span>}
                </div>}
                {p.note && <div style={{marginTop:isCheque?4:0, color:T.textMut}}>{p.note}</div>}
                {!isCheque && p.account && <div style={{fontSize:FS-3, color:T.textMut}}>حساب: {p.account}</div>}
              </td>
              <td style={{...TD_BASE, fontSize:FS-3, color:T.textMut}}>{p.by || "—"}</td>
              <td style={{...TD_BASE, textAlign:"center"}}>
                {canDelete ? (
                  <span
                    onClick={() => setConfirmDel(p)}
                    style={{cursor:"pointer", padding:"4px 8px", borderRadius:6, background:"#EF444415", color:"#EF4444", fontWeight:700, fontSize:FS-2, border:"1px solid #EF444430", display:"inline-block", whiteSpace:"nowrap"}}
                    title="حذف الدفعة وكل الحركات المرتبطة بها"
                  >🗑 حذف</span>
                ) : (
                  <span style={{fontSize:FS-3, color:T.textMut}} title="حذف الشيك من إدارة الشيكات في الخزنة">—</span>
                )}
              </td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>}

    {/* V19.12: Delete confirmation modal */}
    {confirmDel && <div style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:10001, display:"flex", alignItems:"center", justifyContent:"center", padding:16}} onClick={() => setConfirmDel(null)}>
      <div onClick={e => e.stopPropagation()} style={{background:T.cardSolid, borderRadius:14, padding:20, maxWidth:480, width:"100%", border:"1px solid "+T.brd, boxShadow:"0 12px 40px rgba(0,0,0,0.3)"}}>
        <div style={{fontSize:FS+2, fontWeight:800, color:"#EF4444", marginBottom:8}}>⚠️ تأكيد حذف الدفعة</div>
        <div style={{fontSize:FS-1, color:T.textSec, marginBottom:14, lineHeight:1.7}}>
          هتحذف دفعة <b style={{color:T.text}}>{fmt(confirmDel.amount)} ج.م</b> للطرف <b style={{color:T.text}}>{confirmDel.partyName}</b> بتاريخ <b style={{color:T.text}}>{confirmDel.date}</b>.
          <div style={{marginTop:8, padding:"8px 10px", borderRadius:8, background:"#EF444408", border:"1px solid #EF444420", fontSize:FS-2}}>
            ⚠️ هتتشال من: <b>سجل الدفعات</b> + <b>الخزنة</b> + <b>كشف حساب الطرف</b>. الـ accounting journal بيتعمل reverse تلقائي. الحذف نهائي — لا يمكن استرجاعه.
          </div>
        </div>
        <div style={{display:"flex", gap:8, justifyContent:"flex-end"}}>
          <Btn small onClick={() => setConfirmDel(null)}>إلغاء</Btn>
          <Btn small onClick={() => deletePayment(confirmDel)} style={{background:"#EF4444", color:"#fff", fontWeight:800}}>🗑 نعم، احذف</Btn>
        </div>
      </div>
    </div>}

    {/* V19.13: dead-cleanup confirmation modal. Shows the list of ghost
        payments to be removed, with totals, before any data is touched. */}
    {cleanupPreview && <div style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:10001, display:"flex", alignItems:"center", justifyContent:"center", padding:16}} onClick={() => setCleanupPreview(null)}>
      <div onClick={e => e.stopPropagation()} style={{background:T.cardSolid, borderRadius:14, padding:20, maxWidth:600, width:"100%", maxHeight:"85vh", overflowY:"auto", border:"1px solid "+T.brd, boxShadow:"0 12px 40px rgba(0,0,0,0.3)"}}>
        <div style={{fontSize:FS+2, fontWeight:800, color:"#EF4444", marginBottom:8}}>🧹 تنظيف الدفعات الميتة</div>
        <div style={{fontSize:FS-1, color:T.textSec, marginBottom:14, lineHeight:1.7}}>
          الدفعات دي مسجلة في كشف العميل/المورد لكن **مفيش حركة خزنة موجودة لها** — يعني المفروض اتحذفت قبل ما tombstones تكون موجودة (قبل V19.13).
          <div style={{marginTop:8, padding:"8px 10px", borderRadius:8, background:"#EF444408", border:"1px solid #EF444420", fontSize:FS-2}}>
            ⚠️ التنظيف هيشيلهم نهائياً من custPayments/supplierPayments + يضيفهم للـtombstones عشان ما يرجعوش تاني عبر الـsync.
          </div>
        </div>
        {cleanupPreview.deadCust.length > 0 && <div style={{marginBottom:12}}>
          <div style={{fontSize:FS-1, fontWeight:800, color:T.text, marginBottom:6}}>👥 دفعات عملاء ميتة ({cleanupPreview.deadCust.length}):</div>
          <div style={{maxHeight:180, overflowY:"auto", border:"1px solid "+T.brd, borderRadius:8, padding:6, background:T.bg}}>
            {cleanupPreview.deadCust.map(p => (
              <div key={p.id} style={{padding:"4px 6px", fontSize:FS-2, color:T.textSec, borderBottom:"1px dashed "+T.brd}}>
                {p.date} · <b style={{color:T.text}}>{p.custName||"—"}</b> · {fmt(p.amount)} ج.م {p.note ? "· " + p.note : ""}
              </div>
            ))}
          </div>
          <div style={{fontSize:FS-2, color:T.textMut, marginTop:4, textAlign:"end"}}>إجمالي: <b>{fmt(cleanupPreview.deadCust.reduce((s,p)=>s+(Number(p.amount)||0),0))} ج.م</b></div>
        </div>}
        {cleanupPreview.deadSup.length > 0 && <div style={{marginBottom:12}}>
          <div style={{fontSize:FS-1, fontWeight:800, color:T.text, marginBottom:6}}>🏭 دفعات موردين ميتة ({cleanupPreview.deadSup.length}):</div>
          <div style={{maxHeight:180, overflowY:"auto", border:"1px solid "+T.brd, borderRadius:8, padding:6, background:T.bg}}>
            {cleanupPreview.deadSup.map(p => (
              <div key={p.id} style={{padding:"4px 6px", fontSize:FS-2, color:T.textSec, borderBottom:"1px dashed "+T.brd}}>
                {p.date} · <b style={{color:T.text}}>{p.supplierName||"—"}</b> · {fmt(p.amount)} ج.م {p.note ? "· " + p.note : ""}
              </div>
            ))}
          </div>
          <div style={{fontSize:FS-2, color:T.textMut, marginTop:4, textAlign:"end"}}>إجمالي: <b>{fmt(cleanupPreview.deadSup.reduce((s,p)=>s+(Number(p.amount)||0),0))} ج.م</b></div>
        </div>}
        <div style={{display:"flex", gap:8, justifyContent:"flex-end", marginTop:14}}>
          <Btn small onClick={() => setCleanupPreview(null)}>إلغاء</Btn>
          <Btn small onClick={confirmDeadCleanup} disabled={cleaning} style={{background:"#EF4444", color:"#fff", fontWeight:800}}>
            {cleaning ? "⏳ جاري التنظيف..." : "🧹 نعم، نظّف الكل"}
          </Btn>
        </div>
      </div>
    </div>}

    {/* V19.80.17: recovery preview modal — shows the list of missing close-week
        treasury entries (salaries, advances, ws_payments, other_expenses) found
        by walking each closed week's snapshot. After confirmation, recreates
        each entry from the snapshot data, restoring the cash flow timeline. */}
    {recoveryPreview && <div style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:10001, display:"flex", alignItems:"center", justifyContent:"center", padding:16}} onClick={() => setRecoveryPreview(null)}>
      <div onClick={e => e.stopPropagation()} style={{background:T.cardSolid, borderRadius:14, padding:20, maxWidth:680, width:"100%", maxHeight:"85vh", overflowY:"auto", border:"1px solid "+T.brd, boxShadow:"0 12px 40px rgba(0,0,0,0.3)"}}>
        <div style={{fontSize:FS+2, fontWeight:800, color:"#F59E0B", marginBottom:8}}>🚑 استرداد حركات الخزنة المفقودة</div>
        <div style={{fontSize:FS-1, color:T.textSec, marginBottom:14, lineHeight:1.7}}>
          الحركات دي مسجلة في الـ snapshot بتاع الأسبوع لكن مفقودة من الخزنة. هـ تتـ recreate من بيانات الـ snapshot:
          <div style={{marginTop:8, padding:"8px 10px", borderRadius:8, background:"#F59E0B08", border:"1px solid #F59E0B30", fontSize:FS-2}}>
            ℹ️ الـ IDs المفقودة هـ تتعمل من جديد بنفس الـ treasuryTxId الأصلي (لو مخزّن) عشان أي روابط (supplierPayments/wsPayments) تستمر تشتغل صح. السلف بـ تتـ recreate كمان في hrLog لو مفقودة.
          </div>
        </div>
        {recoveryPreview.salaries.length > 0 && <div style={{marginBottom:12}}>
          <div style={{fontSize:FS-1, fontWeight:800, color:T.text, marginBottom:6}}>💰 مرتبات مفقودة ({recoveryPreview.salaries.length}):</div>
          <div style={{maxHeight:140, overflowY:"auto", border:"1px solid "+T.brd, borderRadius:8, padding:6, background:T.bg}}>
            {recoveryPreview.salaries.map((x,i) => (
              <div key={i} style={{padding:"4px 6px", fontSize:FS-2, color:T.textSec, borderBottom:"1px dashed "+T.brd}}>
                W{x.week.weekNum} · <b style={{color:T.text}}>{x.record.empName||"—"}</b> · {fmt(x.record.thursdayPay)} ج.م
              </div>
            ))}
          </div>
          <div style={{fontSize:FS-2, color:T.textMut, marginTop:4, textAlign:"end"}}>إجمالي: <b>{fmt(recoveryPreview.salaries.reduce((s,x)=>s+(Number(x.record.thursdayPay)||0),0))} ج.م</b></div>
        </div>}
        {recoveryPreview.advances.length > 0 && <div style={{marginBottom:12}}>
          <div style={{fontSize:FS-1, fontWeight:800, color:T.text, marginBottom:6}}>👤 سلف أسبوعية مفقودة ({recoveryPreview.advances.length}):</div>
          <div style={{maxHeight:140, overflowY:"auto", border:"1px solid "+T.brd, borderRadius:8, padding:6, background:T.bg}}>
            {recoveryPreview.advances.map((x,i) => (
              <div key={i} style={{padding:"4px 6px", fontSize:FS-2, color:T.textSec, borderBottom:"1px dashed "+T.brd}}>
                W{x.week.weekNum} · {x.advance.date} · <b style={{color:T.text}}>{x.advance.empName||"—"}</b> · {fmt(x.advance.amount)} ج.م
              </div>
            ))}
          </div>
          <div style={{fontSize:FS-2, color:T.textMut, marginTop:4, textAlign:"end"}}>إجمالي: <b>{fmt(recoveryPreview.advances.reduce((s,x)=>s+(Number(x.advance.amount)||0),0))} ج.م</b></div>
        </div>}
        {recoveryPreview.wsPayments.length > 0 && <div style={{marginBottom:12}}>
          <div style={{fontSize:FS-1, fontWeight:800, color:T.text, marginBottom:6}}>🏭 دفعات/مشتريات ورش مفقودة ({recoveryPreview.wsPayments.length}):</div>
          <div style={{maxHeight:140, overflowY:"auto", border:"1px solid "+T.brd, borderRadius:8, padding:6, background:T.bg}}>
            {recoveryPreview.wsPayments.map((x,i) => (
              <div key={i} style={{padding:"4px 6px", fontSize:FS-2, color:T.textSec, borderBottom:"1px dashed "+T.brd}}>
                W{x.week.weekNum} · {x.payment.date} · <b style={{color:T.text}}>{x.payment.wsName||"—"}</b> · {fmt(x.payment.amount)} ج.م ({x.payment.type==="payment"?"دفعة":"مشتريات"})
              </div>
            ))}
          </div>
          <div style={{fontSize:FS-2, color:T.textMut, marginTop:4, textAlign:"end"}}>إجمالي: <b>{fmt(recoveryPreview.wsPayments.reduce((s,x)=>s+(Number(x.payment.amount)||0),0))} ج.م</b></div>
        </div>}
        {recoveryPreview.otherExps.length > 0 && <div style={{marginBottom:12}}>
          <div style={{fontSize:FS-1, fontWeight:800, color:T.text, marginBottom:6}}>📋 مصاريف أخرى مفقودة ({recoveryPreview.otherExps.length}):</div>
          <div style={{maxHeight:140, overflowY:"auto", border:"1px solid "+T.brd, borderRadius:8, padding:6, background:T.bg}}>
            {recoveryPreview.otherExps.map((x,i) => (
              <div key={i} style={{padding:"4px 6px", fontSize:FS-2, color:T.textSec, borderBottom:"1px dashed "+T.brd}}>
                W{x.week.weekNum} · {x.expense.date} · <b style={{color:T.text}}>{x.expense.category||"—"}</b> · {fmt(x.expense.amount)} ج.م {x.expense.supplierName?"· "+x.expense.supplierName:""}
              </div>
            ))}
          </div>
          <div style={{fontSize:FS-2, color:T.textMut, marginTop:4, textAlign:"end"}}>إجمالي: <b>{fmt(recoveryPreview.otherExps.reduce((s,x)=>s+(Number(x.expense.amount)||0),0))} ج.م</b></div>
        </div>}
        <div style={{display:"flex", gap:8, justifyContent:"flex-end", marginTop:14}}>
          <Btn small onClick={() => setRecoveryPreview(null)}>إلغاء</Btn>
          <Btn small onClick={confirmRecovery} disabled={recovering} style={{background:"#F59E0B", color:"#fff", fontWeight:800}}>
            {recovering ? "⏳ جاري الاسترداد..." : "🚑 نعم، استرد الحركات"}
          </Btn>
        </div>
      </div>
    </div>}

    <div style={{marginTop:10, fontSize:FS-3, color:T.textMut, padding:"6px 10px", background:T.bg, borderRadius:8, textAlign:"center"}}>
      💡 لإضافة دفعة جديدة: من شاشة المبيعات (دفعة عميل) أو الخزنة (دفعة مورد) أو إدارة الشيكات في الخزنة.
    </div>
  </Card>;
}
