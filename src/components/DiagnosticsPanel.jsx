/* ═══════════════════════════════════════════════════════════════════════
   CLARK · DiagnosticsPanel (V21.9.3 — extracted from ShopifyIntegrationPg)
   ───────────────────────────────────────────────────────────────────────
   Smart health monitor + storage diagnostics — used in:
   • SettingsPg → general tab (top, "صيانة" section)
   • Previously also in ShopifyIntegrationPg → Settings sub-tab (removed)

   Backed by GET /api/diagnostics — file-size analysis, connection health,
   critical data alerts. Severity-coded: ok / info / warn / error / critical.

   Also exposes the V21.9.2 split-shopify-collections migration trigger
   (one-shot button that appears as a banner when factory/config doc ≥ 50%
   of the Firestore 1MB cap).
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from "react";
import { Btn, Card, LoadingBtn } from "./ui.jsx";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { ask, showToast, tell } from "../utils/popups.js";
import { fetchDiagnostics, splitShopifyCollections, splitShopifyOrdersDaily, dedupeTreasuryTransfers, auditState, fixFlags, myPermissions, usersPermissions, recoverLegacyData, migrationLog, auditPermissions, roleScopes, migrateLegacyOrders, migrateRecurringTreasury, repairConfirmedTransfers } from "../utils/shopify/shopifyClient.js";
import { collection, getDocs, query, limit } from "firebase/firestore";
import { db } from "../firebase.js";
/* V21.9.35: shared bridge client — used by BridgeStatusCard for live status,
   queue inspection, activity log, and pause/resume controls. */
import { bridge as waBridge } from "../utils/whatsappBridge.js";

export function DiagnosticsPanel({ data, canEdit, user, isMob, getUserRole }){
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [splitBusy, setSplitBusy] = useState(false);
  const [splitResult, setSplitResult] = useState(null);
  /* V21.9.22: Force-split for shopifyPendingOrders + treasury dedupe */
  const [ordersBusy, setOrdersBusy] = useState(false);
  const [ordersResult, setOrdersResult] = useState(null);
  const [dedupeBusy, setDedupeBusy] = useState(false);
  const [dedupeResult, setDedupeResult] = useState(null);
  /* V21.9.42: legacy orders migration (factory/config.orders → seasons/.../orders) */
  const [legacyOrdersBusy, setLegacyOrdersBusy] = useState(false);
  const [legacyOrdersResult, setLegacyOrdersResult] = useState(null);
  /* V21.9.44: recurring treasury migration (cfg.recurringTreasury → recurringTreasuryDocs/{id}) */
  const [recurringBusy, setRecurringBusy] = useState(false);
  const [recurringResult, setRecurringResult] = useState(null);
  /* V21.9.45: repair confirmed transfers — legs recovery */
  const [transferRepairBusy, setTransferRepairBusy] = useState(false);
  const [transferRepairResult, setTransferRepairResult] = useState(null);
  const [transferRepairScan, setTransferRepairScan] = useState(null);
  /* V21.9.23: Firestore rules deployment test — detects "rules not published"
     bug where partitioned collections (customersDocs / productsDocs / etc.)
     get permission-denied on the client even though they exist on server. */
  const [rulesBusy, setRulesBusy] = useState(false);
  const [rulesResult, setRulesResult] = useState(null);
  const [autoListenerErrors, setAutoListenerErrors] = useState({});
  /* V21.9.24: State audit + permissions diagnostics */
  const [auditBusy, setAuditBusy] = useState(false);
  const [auditResult, setAuditResult] = useState(null);
  const [fixBusy, setFixBusy] = useState(false);
  const [myPermsBusy, setMyPermsBusy] = useState(false);
  const [myPerms, setMyPerms] = useState(null);
  const [usersBusy, setUsersBusy] = useState(false);
  const [usersList, setUsersList] = useState(null);
  const [addUid, setAddUid] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState("manager");
  /* V21.9.26: Users sync audit (cfg.users ↔ cfg.usersList) */
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [syncApplyBusy, setSyncApplyBusy] = useState(false);
  /* Per-row role override for the sync table */
  const [syncOverrides, setSyncOverrides] = useState({});
  /* V21.9.27: Recover legacy data (fix-flags data loss) */
  const [recoverBusy, setRecoverBusy] = useState(false);
  const [recoverScan, setRecoverScan] = useState(null);
  const [migrateBusy, setMigrateBusy] = useState({});
  /* V21.9.28: Migration log inspector */
  const [logBusy, setLogBusy] = useState(false);
  const [logEntries, setLogEntries] = useState(null);
  const [logFilter, setLogFilter] = useState("");
  const [expandedLogEntry, setExpandedLogEntry] = useState(null);
  const [restoreBusy, setRestoreBusy] = useState(false);
  /* V21.9.30: Permissions audit (rules vs matrix) */
  const [permAuditBusy, setPermAuditBusy] = useState(false);
  const [permAuditResult, setPermAuditResult] = useState(null);
  const [permFixBusy, setPermFixBusy] = useState(false);
  const [permRoleFilter, setPermRoleFilter] = useState("");
  /* V21.9.32: Dynamic role scopes editor */
  const [scopesBusy, setScopesBusy] = useState(false);
  const [scopesData, setScopesData] = useState(null);
  const [scopesEdits, setScopesEdits] = useState({}); /* { scopeName: [roles...] } */
  const [scopesSaveBusy, setScopesSaveBusy] = useState(false);

  /* V21.9.23: poll window.__clarkListenerErrors every 3s — captured by the
     App.jsx listener-error callback. Surfaces the "permission-denied" cases
     that previously only showed in DevTools console. */
  useEffect(() => {
    const tick = () => {
      try {
        if(typeof window !== "undefined" && window.__clarkListenerErrors){
          setAutoListenerErrors({ ...window.__clarkListenerErrors });
        }
      } catch(_){}
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => clearInterval(id);
  }, []);

  const sevColor = (s) => ({
    ok: T.ok, info: "#0EA5E9", warn: T.warn, error: T.err,
    critical: "#DC2626",
  })[s] || T.textMut;
  const sevIcon = (s) => ({
    ok: "✅", info: "ℹ️", warn: "⚠️", error: "❌", critical: "🚨",
  })[s] || "•";
  const sevLabel = (s) => ({
    ok: "سليم", info: "معلومة", warn: "تحذير", error: "خطأ", critical: "حرج جداً",
  })[s] || s;

  const runCheck = async () => {
    setBusy(true); setError(null);
    try {
      const r = await fetchDiagnostics(user);
      if(r?.ok) setReport(r);
      else { setError(r?.error || "فشل"); setReport(null); }
    } catch(e){ setError(e.message); setReport(null); }
    finally { setBusy(false); }
  };

  const runSplitMigration = async () => {
    if(!canEdit) return;
    setSplitBusy(true);
    try {
      const dry = await splitShopifyCollections({ dryRun: true }, user);
      if(!dry?.ok){
        showToast("⛔ " + (dry?.error || "فشل dry-run"));
        return;
      }
      const yes = await ask(
        "✂️ تقسيم shopifyProducts + shopifyCustomers",
        `هـ يـ migrate البيانات من factory/config إلى collections منفصلة:\n\n` +
        `📦 منتجات: ${dry.products_count} (${dry.products_kb} KB)\n` +
        `👥 عملاء: ${dry.customers_count} (${dry.customers_kb} KB)\n\n` +
        `قبل: ${dry.before_kb} KB من حجم config\n` +
        `بعد: ~${dry.after_kb_estimate} KB ← هـ نوفّر ${dry.will_free_kb} KB\n\n` +
        `هذا الإجراء آمن — في backup كامل + idempotent. تأكيد؟`
      );
      if(!yes) return;
      const r = await splitShopifyCollections({ dryRun: false }, user);
      setSplitResult(r);
      if(r?.ok){
        if(r.skipped){
          showToast("ℹ️ التقسيم مطبّق بالفعل");
        } else {
          showToast(`✅ تم! 📦 ${r.products_migrated} · 👥 ${r.customers_migrated} · وفّرنا ${r.freed_kb} KB (${r.freed_pct}%)`);
          setTimeout(() => runCheck(), 1500);
        }
      } else {
        showToast("⛔ " + (r?.error || "فشل"));
      }
    } catch(e){ showToast("⛔ " + e.message); }
    finally { setSplitBusy(false); }
  };

  /* V21.9.22: Force-split for shopifyPendingOrders → shopifyOrdersDays daily */
  const runOrdersSplitMigration = async () => {
    if(!canEdit) return;
    setOrdersBusy(true);
    try {
      const dry = await splitShopifyOrdersDaily({ dryRun: true }, user);
      if(!dry?.ok){
        showToast("⛔ " + (dry?.error || "فشل dry-run"));
        return;
      }
      const yes = await ask(
        "✂️ تقسيم طلبات Shopify (V21.9.18 force-migration)",
        `هـ يـ migrate الطلبات من factory/config.shopifyPendingOrders إلى docs يومية:\n\n` +
        `📦 طلبات: ${dry.total_orders} طلب\n` +
        `📅 أيام: ${dry.days_count}\n` +
        `📊 الحجم اللي هـ نوفّره: ~${dry.will_free_kb} KB من factory/config\n\n` +
        `الـ migration الـ auto كان المفروض تشتغل من V21.9.18 لكن لو ما اشتغلتش لأي سبب (rules مش deploy، service worker قديم، إلخ) ده الـ fallback الـ official.\n\n` +
        `آمن — backup كامل + idempotent. تأكيد؟`
      );
      if(!yes) return;
      const r = await splitShopifyOrdersDaily({}, user);
      setOrdersResult(r);
      if(r?.ok){
        if(r.skipped){
          showToast("ℹ️ التقسيم مطبّق بالفعل");
        } else {
          showToast(`✅ تم! نقلنا ${r.total_migrated} طلب على ${r.days_created} يوم · وفّرنا ${r.freed_kb} KB`);
          setTimeout(() => runCheck(), 1500);
        }
      } else {
        showToast("⛔ " + (r?.error || "فشل"));
      }
    } catch(e){ showToast("⛔ " + e.message); }
    finally { setOrdersBusy(false); }
  };

  /* V21.9.22: Treasury duplicate cleanup (from pre-V21.9.14 race) */
  const runTreasuryDedupe = async () => {
    if(!canEdit) return;
    setDedupeBusy(true);
    try {
      const dry = await dedupeTreasuryTransfers({ dryRun: true }, user);
      if(!dry?.ok){
        showToast("⛔ " + (dry?.error || "فشل dry-run"));
        return;
      }
      if(dry.duplicates_found === 0){
        showToast("✨ مفيش duplicates في Treasury — كله نظيف");
        setDedupeResult({ ok: true, dryRun: true, duplicates_found: 0, entries_removed: 0 });
        return;
      }
      const yes = await ask(
        "🧹 تنظيف duplicates في Treasury",
        `لقينا duplicates ناتجين من race condition قديم (قبل V21.9.14):\n\n` +
        `🔍 entries مكررة: ${dry.entries_to_remove}\n` +
        `📋 transfers متأثرة: ${dry.duplicates_found}\n` +
        `📅 أيام بـ تحتاج تعديل: ${dry.days_affected.length}\n\n` +
        `الـ cleanup هـ يحتفظ بالـ entry الأقدم (oldest createdAt) ويحذف الباقي.\n\n` +
        `آمن — backup كامل قبل أي حذف. تأكيد؟`
      );
      if(!yes) return;
      const r = await dedupeTreasuryTransfers({}, user);
      setDedupeResult(r);
      if(r?.ok){
        showToast(`✅ تم! حذفنا ${r.entries_removed} entry مكرر من ${r.duplicates_found} transfer`);
        setTimeout(() => runCheck(), 1500);
      } else {
        showToast("⛔ " + (r?.error || "فشل"));
      }
    } catch(e){ showToast("⛔ " + e.message); }
    finally { setDedupeBusy(false); }
  };

  /* V21.9.45: Confirmed-transfers leg-recovery handler.
     Two-phase: (1) scan-only dryRun to count missing legs, (2) run repair on confirm.
     Idempotent — only writes missing legs. */
  const scanTransferRepair = async () => {
    if(!canEdit) return;
    setTransferRepairBusy(true);
    try {
      const r = await repairConfirmedTransfers({ dryRun: true }, user);
      setTransferRepairScan(r);
      if(!r?.ok){
        showToast("⛔ " + (r?.error || "فشل scan"));
        return;
      }
      if(r.transfers_with_missing_legs === 0){
        showToast("✨ كل التحويلات سليمة — مفيش legs ناقصة");
        return;
      }
      /* User confirms before running real repair */
      const yes = await ask(
        "🔧 إصلاح التحويلات المعتمدة الناقصة",
        `لقينا ${r.transfers_with_missing_legs} تحويل معتمد لكن مفقود الـ legs الخاصة بيهم (debit/credit).\n\n` +
        `📊 التفاصيل:\n` +
        `• تحويلات اتفحصت: ${r.transfers_scanned}\n` +
        `• تحويلات ناقصها legs: ${r.transfers_with_missing_legs}\n` +
        `• Legs محتاجة إنشاء: ${r.legs_to_create}\n` +
        `  → Out (debit): ${r.legs_out_to_create}\n` +
        `  → In (credit): ${r.legs_in_to_create}\n` +
        `• أيام متأثرة: ${r.days_affected}\n\n` +
        `${r.sample_repaired?.length ? "🔍 عينة من التحويلات:\n" + r.sample_repaired.slice(0, 5).map(t =>
          `• ${t.amount} ج.م من ${t.from} → ${t.to} (${t.date}) — ناقص ${t.missing}`
        ).join("\n") + "\n\n" : ""}` +
        `✅ آمن:\n` +
        `• Idempotent — لو ضغطت مرتين، الـ legs المضافة ما تتـ duplicate-ـش\n` +
        `• الـ legs بـ تتـ merge مع entries اليوم الموجودة (مش overwrite)\n` +
        `• كل leg مُعلَّم بـ repairedAt + repairReason للـ audit trail\n\n` +
        `تأكيد إنشاء الـ legs الناقصة؟`
      );
      if(!yes) return;

      const real = await repairConfirmedTransfers({ dryRun: false }, user);
      setTransferRepairResult(real);
      if(real?.ok){
        showToast(`✅ تم! 🔧 ${real.legs_created} leg (${real.legs_out_created} debit + ${real.legs_in_created} credit) لـ ${real.transfers_with_missing_legs} تحويل`);
        setTimeout(() => runCheck(), 1500);
      } else {
        showToast("⛔ " + (real?.error || "فشل"));
      }
    } catch(e){ showToast("⛔ " + e.message); }
    finally { setTransferRepairBusy(false); }
  };

  /* V21.9.44: Recurring treasury migration handler.
     Moves cfg.recurringTreasury[] → recurringTreasuryDocs/{id} per-id collection.
     Pattern matches V21.9.42 — dry-run first → confirmation → real run. */
  const runRecurringMigration = async () => {
    if(!canEdit) return;
    setRecurringBusy(true);
    try {
      const dry = await migrateRecurringTreasury({ dryRun: true }, user);
      if(!dry?.ok){
        showToast("⛔ " + (dry?.error || "فشل dry-run"));
        return;
      }
      if(dry.rules_count === 0){
        showToast("✨ مفيش recurring rules — كله مهاجر بالفعل");
        setRecurringResult({ ok: true, dryRun: true, rules_count: 0 });
        return;
      }
      const yes = await ask(
        "🔁 نقل قواعد الـ Recurring Treasury — حل لمشكلة 'اختفاء البنود بين الأجهزة'",
        `هـ يتـ نقل ${dry.rules_count} قاعدة من factory/config.recurringTreasury[] إلى recurringTreasuryDocs/{id} (per-id collection).\n\n` +
        `📊 Stats:\n` +
        `• حجم factory/config: ${dry.before_kb} KB\n` +
        `• حجم الـ rules array: ${dry.rules_kb} KB\n\n` +
        `🔍 Sample analysis (${dry.sample_size} من ${dry.rules_count}):\n` +
        `• جديد للـ collection: ${dry.sample_new}\n` +
        `• موجود بالفعل (يـ skip): ${dry.sample_exist}\n` +
        `• بدون id (يـ generate): ${dry.sample_idless}\n\n` +
        `💾 بعد الـ migration: ~${dry.after_kb_estimate} KB ← هـ نوفّر ${dry.will_free_kb} KB\n\n` +
        `✅ آمن جداً:\n` +
        `• Backup كامل للـ rules array قبل أي كتابة\n` +
        `• Idempotent — لو ran مرة تاني يـ skip اللي اتـ migrate-ـت\n` +
        `• لو رول موجود بـ updatedAt أحدث، ما يتـ overwrite-ـش\n` +
        `• الـ flag مش بـ يتسطّ لو فيه أي failure\n\n` +
        `هذا الإجراء يحل مشكلة اختفاء الـ recurring rules لما تـ سجلهم من موبيل ثم تفتح على PC. تأكيد؟`
      );
      if(!yes) return;
      const r = await migrateRecurringTreasury({ dryRun: false }, user);
      setRecurringResult(r);
      if(r?.ok){
        if(r.skipped){
          showToast("ℹ️ الـ migration مطبّق بالفعل");
        } else {
          showToast(`✅ تم! 🔁 ${r.rules_migrated} قاعدة · ${r.rules_skipped_existing} موجودة بالفعل · وفّرنا ${r.freed_kb} KB`);
          setTimeout(() => runCheck(), 1500);
        }
      } else if(r?.partial){
        showToast(`⚠️ ${r.message || "migration partial — راجع الـ logs"}`);
      } else {
        showToast("⛔ " + (r?.error || "فشل"));
      }
    } catch(e){ showToast("⛔ " + e.message); }
    finally { setRecurringBusy(false); }
  };

  /* V21.9.42: Legacy orders migration handler.
     Moves cfg.orders[] → seasons/{season}/orders/{docId} subcollection.
     ALWAYS dry-run first → present summary → confirm → real run.
     Anti-pattern: destructive migration without dry-run confirmation. */
  const runLegacyOrdersMigration = async () => {
    if(!canEdit) return;
    setLegacyOrdersBusy(true);
    try {
      const dry = await migrateLegacyOrders({ dryRun: true }, user);
      if(!dry?.ok){
        showToast("⛔ " + (dry?.error || "فشل dry-run"));
        return;
      }
      if(dry.orders_count === 0){
        showToast("✨ مفيش legacy orders — كله مهاجر بالفعل");
        setLegacyOrdersResult({ ok: true, dryRun: true, orders_count: 0 });
        return;
      }
      const yes = await ask(
        "📦 نقل الـ Legacy Orders — حل لمشكلة 'الملف ١ ميجا'",
        `هـ يتـ نقل ${dry.orders_count} طلب من factory/config.orders[] إلى الـ subcollection seasons/.../orders/{id}.\n\n` +
        `📊 الـ Stats:\n` +
        `• حجم factory/config الحالي: ${dry.before_kb} KB\n` +
        `• حجم الـ orders array: ${dry.orders_kb} KB\n` +
        `• الـ active season: ${dry.active_season}\n\n` +
        `🔍 Sample analysis (${dry.sample_size} من ${dry.orders_count}):\n` +
        `• جديد للـ subcollection: ~${dry.sample_estimated_new}\n` +
        `• موجود بالفعل (يـ skip): ~${dry.sample_estimated_already_in_subcol}\n` +
        `• بدون season/id (يـ generate id): ~${dry.sample_seasonless_or_idless}\n\n` +
        `💾 بعد الـ migration: ~${dry.after_kb_estimate} KB ← هـ نوفّر ${dry.will_free_kb} KB\n\n` +
        `✅ آمن جداً:\n` +
        `• Backup كامل للـ orders array قبل الـ migration\n` +
        `• Idempotent — لو ran مرة تاني يـ skip اللي اتـ migrate-ـت\n` +
        `• الـ orders الموجودة في الـ subcollection بـ updatedAt أحدث ما تتـ overwrite-ـش\n` +
        `• لو فيه أي failure، flag الـ migration مش بـ يتسطّ + cfg.orders بـ يفضل كما هو\n\n` +
        `هذا الإجراء هو الحل لرسالة "حجم البيانات تجاوز الحد" اللي بـ تظهر للمحاسب. تأكيد؟`
      );
      if(!yes) return;
      const r = await migrateLegacyOrders({ dryRun: false }, user);
      setLegacyOrdersResult(r);
      if(r?.ok){
        if(r.skipped){
          showToast("ℹ️ الـ migration مطبّق بالفعل");
        } else {
          showToast(`✅ تم! 📦 ${r.orders_migrated} طلب · 🔁 ${r.orders_skipped_existing} موجود بالفعل · وفّرنا ${r.freed_kb} KB`);
          setTimeout(() => runCheck(), 1500);
        }
      } else if(r?.partial){
        /* Migration had failures — flag NOT set, cfg.orders preserved. */
        showToast(`⚠️ ${r.message || "migration partial — راجع الـ logs"}`);
      } else {
        showToast("⛔ " + (r?.error || "فشل"));
      }
    } catch(e){ showToast("⛔ " + e.message); }
    finally { setLegacyOrdersBusy(false); }
  };

  const docPct = report?.storage?.config_doc_pct_of_max || 0;
  const splitDone = !!data?._partitionedV2192Done;
  const showSplitWarning = docPct >= 50 && !splitDone;
  /* V21.9.22: detect if shopifyPendingOrders force-migration is needed.
     Show button whenever the legacy array still has entries (regardless of doc%). */
  const ordersSplitDone = !!data?._splitDaysV2199Done;
  const pendingOrdersArrSize = (report?.storage?.arrays || []).find(a => a.name === "shopifyPendingOrders");
  const showOrdersForceButton = pendingOrdersArrSize && pendingOrdersArrSize.count > 0;
  /* V21.9.42: detect legacy orders that need migration to seasons/.../orders subcollection.
     ROOT CAUSE: pre-V18.60 installs have cfg.orders[] still populated. Every upConfig
     rewrites the doc with this array → factory/config bloats to 1MB → writes fail with
     "حجم البيانات تجاوز الحد". This was the user-reported "محاسب الخزنة رفض يسجل" bug.
     Show banner if EITHER:
       1. Migration flag not set AND cfg.orders has entries
       2. Diagnostics report flagged it explicitly */
  const legacyOrdersMigrated = !!data?._legacyOrdersMigratedV2110;
  const legacyOrdersArrSize = (report?.storage?.arrays || []).find(a => a.name === "orders");
  const reportFlaggedLegacyOrders = (report?.critical || []).some(c => c?.kind === "legacy_orders_present");
  const showLegacyOrdersButton = !legacyOrdersMigrated && (
    (legacyOrdersArrSize && legacyOrdersArrSize.count > 0) || reportFlaggedLegacyOrders
  );
  /* V21.9.44: Recurring treasury migration flag.
     Show banner whenever migration flag is unset (regardless of whether the
     array has entries — empty installs benefit from setting the flag too, so
     subsequent recurring rule saves go directly to the per-id collection). */
  const recurringMigrated = !!data?._partitionedRecurringV21944Done;
  const recurringArrEntries = Array.isArray(data?.recurringTreasury) ? data.recurringTreasury.length : 0;
  const showRecurringButton = !recurringMigrated;

  /* V21.9.23: Test Firestore rules deployment by attempting to read 1 doc
     from each critical collection. The server (admin SDK) bypasses rules so
     the data is written successfully, but client-side reads need the rules
     to be PUBLISHED on Firebase Console. Pre-V21.9.23 the user only saw
     "0 customers / 0 products" with no hint that the rules weren't published.

     This helper attempts a getDocs(query(collection, limit(1))) on each
     partitioned collection and classifies the result:
       ok          = read succeeded (rules OK)
       denied      = permission-denied (rules NOT published)
       empty       = succeeded but collection has 0 docs (not necessarily bad)
       error       = other Firestore error (network, etc.) */
  const COLLECTIONS_TO_TEST = [
    { col: "shopifyCustomersDocs", label: "عملاء Shopify", critical: true },
    { col: "shopifyProductsDocs",  label: "منتجات Shopify", critical: true },
    { col: "shopifyOrdersDays",    label: "طلبات Shopify (يومي)", critical: false },
    { col: "shopifyOrdersArchive", label: "أرشيف الطلبات", critical: false },
    { col: "bostaDeliveriesArchive", label: "أرشيف Bosta", critical: false },
    { col: "salesCreditNotesDays", label: "إشعارات دائنة (يومي)", critical: false },
    { col: "syncJobs",             label: "Sync jobs progress", critical: false },
  ];

  const runRulesTest = async () => {
    setRulesBusy(true);
    const results = [];
    for(const { col, label, critical } of COLLECTIONS_TO_TEST){
      try {
        const snap = await getDocs(query(collection(db, col), limit(1)));
        if(snap.size === 0){
          results.push({ col, label, critical, status: "empty", emoji: "○", msg: "تجريباً 0 doc — اللي ينفع لو الـ collection فعلاً فاضي" });
        } else {
          results.push({ col, label, critical, status: "ok", emoji: "✅", msg: "OK — الـ rule بـ يـ allow الـ read" });
        }
      } catch(err){
        const code = err?.code || "";
        if(code === "permission-denied"){
          results.push({ col, label, critical, status: "denied", emoji: "🚨", msg: "permission-denied — الـ rule مش publish-ـة أو مش بـ تـ allow read" });
        } else {
          results.push({ col, label, critical, status: "error", emoji: "❌", msg: (err?.message || "error").slice(0, 80) });
        }
      }
    }
    const deniedCritical = results.filter(r => r.status === "denied" && r.critical);
    const deniedAny = results.filter(r => r.status === "denied");
    setRulesResult({
      results,
      anyDenied: deniedAny.length > 0,
      criticalDenied: deniedCritical.length > 0,
      ranAt: new Date().toISOString(),
    });
    setRulesBusy(false);
    if(deniedCritical.length > 0){
      showToast("🚨 " + deniedCritical.length + " collection denied — لازم تـ deploy firestore.rules");
    } else if(deniedAny.length > 0){
      showToast("⚠️ " + deniedAny.length + " collection denied — راجع التفاصيل");
    } else {
      showToast("✅ كل الـ rules شغّالة");
    }
  };

  /* Auto-listener errors from window.__clarkListenerErrors */
  const autoErrorList = Object.entries(autoListenerErrors).map(([col, info]) => ({
    col, ...info, isDenied: info.code === "permission-denied",
  }));
  const autoCriticalErrors = autoErrorList.filter(e => e.isDenied);

  /* V21.9.24: State audit + auto-fix flags */
  const runStateAudit = async () => {
    setAuditBusy(true);
    try {
      const r = await auditState(user);
      setAuditResult(r);
      if(!r?.ok){
        showToast("⛔ " + (r?.error || "فشل"));
      }
    } catch(e){ showToast("⛔ " + e.message); }
    finally { setAuditBusy(false); }
  };

  const runFixFlags = async () => {
    if(!canEdit) return;
    setFixBusy(true);
    try {
      const dry = await fixFlags({ dryRun: true }, user);
      if(!dry?.ok){
        showToast("⛔ " + (dry?.error || "فشل dry-run"));
        return;
      }
      if((dry.flags_to_set || []).length === 0 && (dry.fields_to_strip || []).length === 0){
        showToast("✨ مفيش mismatches — كله صح");
        setAuditResult(null);
        runStateAudit();
        return;
      }
      const yes = await ask(
        "🔧 إصلاح الـ migration flags",
        `هـ يتـ set الـ flags دي:\n${(dry.flags_to_set||[]).map(f=>"• "+f).join("\n")}\n\n` +
        (dry.fields_to_strip?.length ? `وهـ يـ strip الـ legacy fields:\n${dry.fields_to_strip.map(f=>"• "+f).join("\n")}\n\n` : "") +
        `هذا الإجراء آمن (backup كامل + idempotent). تأكيد؟`
      );
      if(!yes) return;
      const r = await fixFlags({}, user);
      if(r?.ok){
        showToast(`✅ تم! ${(r.flags_set||[]).length} flags set + ${(r.fields_stripped||[]).length} fields stripped`);
        await runStateAudit();
        setTimeout(() => {
          tell("✨ تم بنجاح", "الـ flags اتـ fix-ت. اعمل refresh (F5) للصفحة عشان الـ data تظهر دلوقتي.");
        }, 500);
      } else {
        showToast("⛔ " + (r?.error || "فشل"));
      }
    } catch(e){ showToast("⛔ " + e.message); }
    finally { setFixBusy(false); }
  };

  /* V21.9.24: My Permissions (auto-load on mount + on canEdit changes) */
  const loadMyPerms = async () => {
    setMyPermsBusy(true);
    try {
      const r = await myPermissions(user);
      setMyPerms(r);
    } catch(e){
      setMyPerms({ ok: false, error: e.message });
    }
    finally { setMyPermsBusy(false); }
  };

  useEffect(() => {
    if(user) loadMyPerms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  /* V21.9.24: Users management — admin only */
  const loadUsersList = async () => {
    setUsersBusy(true);
    try {
      const r = await usersPermissions({ action: "list" }, user);
      if(r?.ok) setUsersList(r);
      else showToast("⛔ " + (r?.error || "فشل"));
    } catch(e){ showToast("⛔ " + e.message); }
    finally { setUsersBusy(false); }
  };

  const setUserRole = async (uid, email, role) => {
    if(!canEdit) return;
    const yes = await ask(
      "🛡 تعيين role",
      `هـ يتـ set الـ role '${role}' للـ user ${email || uid}.\nتأكيد؟`
    );
    if(!yes) return;
    setUsersBusy(true);
    try {
      const r = await usersPermissions({ action: "set", uid, email, role }, user);
      if(r?.ok){
        showToast("✅ " + r.message);
        await loadUsersList();
      } else showToast("⛔ " + (r?.error || "فشل"));
    } catch(e){ showToast("⛔ " + e.message); }
    finally { setUsersBusy(false); }
  };

  const removeUser = async (uid, email) => {
    if(!canEdit) return;
    const yes = await ask(
      "🗑 حذف user",
      `هـ يتـ remove ${email || uid} من cfg.users. هـ يـ default لـ 'viewer' في الـ rules.\nتأكيد؟`
    );
    if(!yes) return;
    setUsersBusy(true);
    try {
      const r = await usersPermissions({ action: "remove", uid }, user);
      if(r?.ok){
        showToast("✅ تم الحذف");
        await loadUsersList();
      } else showToast("⛔ " + (r?.error || "فشل"));
    } catch(e){ showToast("⛔ " + e.message); }
    finally { setUsersBusy(false); }
  };

  const bootstrapMe = async () => {
    const yes = await ask(
      "🆘 Bootstrap admin",
      `هـ يضيفك (${myPerms?.email || myPerms?.uid}) كـ admin في cfg.users.\n\nهذا الزر بـ يشتغل فقط في حالة:\n• مفيش admin معمول حالياً\n• أو الـ UID بتاعك = bootstrap UID المعرّف في rules\n\nتأكيد؟`
    );
    if(!yes) return;
    try {
      const r = await usersPermissions({ action: "bootstrap_self" }, user);
      if(r?.ok){
        showToast("✅ " + r.message);
        await loadMyPerms();
      } else showToast("⛔ " + (r?.error || "فشل"));
    } catch(e){ showToast("⛔ " + e.message); }
  };

  /* V21.9.32: Dynamic role scopes — load + save */
  const loadRoleScopes = async () => {
    setScopesBusy(true);
    try {
      const r = await roleScopes({ action: "get" }, user);
      if(r?.ok){
        setScopesData(r);
        setScopesEdits({ ...r.scopes }); /* prime the edit buffer */
      } else {
        showToast("⛔ " + (r?.error || "فشل"));
      }
    } catch(e){ showToast("⛔ " + e.message); }
    finally { setScopesBusy(false); }
  };

  const toggleRoleInScope = (scopeName, role) => {
    const current = scopesEdits[scopeName] || [];
    const has = current.includes(role);
    const next = has ? current.filter(r => r !== role) : [...current, role];
    setScopesEdits({ ...scopesEdits, [scopeName]: next });
  };

  const initRoleScopes = async () => {
    if(!canEdit) return;
    setScopesBusy(true);
    try {
      const r = await roleScopes({ action: "init" }, user);
      if(r?.ok){
        showToast(r.skipped ? "ℹ️ موجود بالفعل" : "✅ تم الإنشاء");
        await loadRoleScopes();
      } else showToast("⛔ " + (r?.error || "فشل"));
    } catch(e){ showToast("⛔ " + e.message); }
    finally { setScopesBusy(false); }
  };

  const resetRoleScopes = async () => {
    if(!canEdit) return;
    const yes = await ask("⚠️ Reset Role Scopes", "هتـ revert كل الـ scopes للـ defaults. تأكيد؟");
    if(!yes) return;
    setScopesBusy(true);
    try {
      const r = await roleScopes({ action: "reset" }, user);
      if(r?.ok){
        showToast("✅ تم الـ reset");
        await loadRoleScopes();
      } else showToast("⛔ " + (r?.error || "فشل"));
    } catch(e){ showToast("⛔ " + e.message); }
    finally { setScopesBusy(false); }
  };

  const saveRoleScopes = async () => {
    if(!canEdit) return;
    /* Calculate changes from defaults */
    const changes = [];
    for(const [scopeName, currentRoles] of Object.entries(scopesEdits)){
      const original = scopesData?.scopes?.[scopeName] || [];
      const added = currentRoles.filter(r => !original.includes(r));
      const removed = original.filter(r => !currentRoles.includes(r));
      if(added.length > 0 || removed.length > 0){
        changes.push({ scopeName, added, removed });
      }
    }
    if(changes.length === 0){
      showToast("ℹ️ مفيش تغييرات");
      return;
    }
    const summary = changes.map(c =>
      `${c.scopeName}: ${c.added.length > 0 ? "+[" + c.added.join(",") + "]" : ""}${c.removed.length > 0 ? " -[" + c.removed.join(",") + "]" : ""}`
    ).join("\n");
    const yes = await ask(
      "💾 حفظ Role Scopes",
      `هـ يتـ update ${changes.length} scope:\n\n${summary}\n\n` +
      `التغيير بـ يـ take effect فوراً (مفيش rules republish needed).\nBackup كامل قبل أي تعديل. تأكيد؟`
    );
    if(!yes) return;
    setScopesSaveBusy(true);
    try {
      const r = await roleScopes({ action: "set", scopes: scopesEdits }, user);
      if(r?.ok){
        showToast(`✅ تم! ${r.scopes_updated?.length || 0} scope مـ updated`);
        await loadRoleScopes();
      } else showToast("⛔ " + (r?.error || "فشل"));
    } catch(e){ showToast("⛔ " + e.message); }
    finally { setScopesSaveBusy(false); }
  };

  /* V21.9.30: Permissions audit */
  const runPermissionsAudit = async () => {
    setPermAuditBusy(true);
    try {
      const r = await auditPermissions({ action: "audit" }, user);
      if(r?.ok) setPermAuditResult(r);
      else showToast("⛔ " + (r?.error || "فشل"));
    } catch(e){ showToast("⛔ " + e.message); }
    finally { setPermAuditBusy(false); }
  };

  const autofixPermissions = async () => {
    if(!canEdit) return;
    setPermFixBusy(true);
    try {
      const dry = await auditPermissions({ action: "autofix", dryRun: true }, user);
      if(!dry?.ok){ showToast("⛔ " + (dry?.error || "فشل dry-run")); return; }
      if((dry.changes || []).length === 0){
        showToast("✨ مفيش conflicts للـ fix");
        return;
      }
      const yes = await ask(
        "🔧 إصلاح الـ permissions matrix",
        `هـ يتـ تعديل ${dry.changes.length} cell في cfg.permissions:\n\n` +
        dry.changes.slice(0, 10).map(c => `• ${c.role}.${c.tab}: ${c.from} → ${c.to}`).join("\n") +
        (dry.changes.length > 10 ? `\n... و ${dry.changes.length - 10} آخرين` : "") +
        `\n\nده هـ يـ align الـ UI مع الـ Firestore rules. Backup كامل قبل أي تعديل. تأكيد؟`
      );
      if(!yes) return;
      const r = await auditPermissions({ action: "autofix" }, user);
      if(r?.ok){
        showToast(`✅ تم! ${r.changes_applied} conflict اتـ fix`);
        await runPermissionsAudit();
        setTimeout(() => {
          tell("✨ تم!", "اطلب من كل الموظفين يعملوا Ctrl+Shift+R في الـ apps بتاعتهم — الـ tabs بـ تـ refresh مع الـ permissions الجديدة.");
        }, 500);
      } else {
        showToast("⛔ " + (r?.error || "فشل"));
      }
    } catch(e){ showToast("⛔ " + e.message); }
    finally { setPermFixBusy(false); }
  };

  /* V21.9.28: Migration Log inspector + restore */
  const loadMigrationLog = async () => {
    setLogBusy(true);
    try {
      const opts = { action: "list", limit: 50 };
      if(logFilter) opts.filterType = logFilter;
      const r = await migrationLog(opts, user);
      if(r?.ok) setLogEntries(r.entries);
      else showToast("⛔ " + (r?.error || "فشل"));
    } catch(e){ showToast("⛔ " + e.message); }
    finally { setLogBusy(false); }
  };

  const restoreFromBackup = async (backupDocId, fields) => {
    if(!canEdit) return;
    const yes = await ask(
      "♻️ Restore من backup",
      `هـ يتـ restore الـ fields دي من backup ${backupDocId.slice(0,40)}…:\n\n` +
      fields.map(f => "• " + f).join("\n") + "\n\n" +
      `الـ current state بـ يـ saved في backup جديد قبل الـ restore.\nتأكيد؟`
    );
    if(!yes) return;
    setRestoreBusy(true);
    try {
      const r = await migrationLog({
        action: "restore_backup",
        backup_doc_id: backupDocId,
        fields_to_restore: fields,
      }, user);
      if(r?.ok){
        showToast(`✅ تم! استرجعنا ${r.fields_count} field`);
        await loadMigrationLog();
      } else {
        showToast("⛔ " + (r?.error || "فشل"));
      }
    } catch(e){ showToast("⛔ " + e.message); }
    finally { setRestoreBusy(false); }
  };

  /* V21.9.27: Recover legacy data */
  const runRecoverScan = async () => {
    setRecoverBusy(true);
    try {
      const r = await recoverLegacyData({ action: "scan_legacy" }, user);
      if(r?.ok) setRecoverScan(r);
      else showToast("⛔ " + (r?.error || "فشل"));
    } catch(e){ showToast("⛔ " + e.message); }
    finally { setRecoverBusy(false); }
  };

  const migrateLegacyField = async (field, legacyCount) => {
    if(!canEdit) return;
    const yes = await ask(
      "🆘 Recover " + field,
      `هـ يتـ migrate ${legacyCount} item من cfg.${field} إلى الـ partitioned collection.\n\n` +
      `Backup كامل بـ يـ saved قبل الـ migration.\n` +
      `Idempotent + آمن. تأكيد؟`
    );
    if(!yes) return;
    setMigrateBusy({ ...migrateBusy, [field]: true });
    try {
      const r = await recoverLegacyData({ action: "migrate_legacy", field }, user);
      if(r?.ok){
        showToast(`✅ تم! نقلنا ${r.items_written} item`);
        await runRecoverScan();
      } else {
        showToast("⛔ " + (r?.error || "فشل"));
      }
    } catch(e){ showToast("⛔ " + e.message); }
    finally { setMigrateBusy({ ...migrateBusy, [field]: false }); }
  };

  /* V21.9.26: Users sync audit + apply */
  const runUsersSyncAudit = async () => {
    if(!canEdit) return;
    setSyncBusy(true);
    setSyncOverrides({});
    try {
      const r = await usersPermissions({ action: "sync_audit" }, user);
      if(r?.ok) setSyncResult(r);
      else showToast("⛔ " + (r?.error || "فشل"));
    } catch(e){ showToast("⛔ " + e.message); }
    finally { setSyncBusy(false); }
  };

  const applyUsersSync = async () => {
    if(!syncResult || !canEdit) return;
    /* Build the changes list using overrides or recommended */
    const changes = (syncResult.users || [])
      .filter(u => u.will_change || syncOverrides[u.uid || u.email])
      .map(u => ({
        uid: u.uid,
        email: u.email,
        role: syncOverrides[u.uid || u.email] || u.recommended_role,
      }))
      .filter(c => c.uid || c.email);

    if(changes.length === 0){
      showToast("✨ مفيش تغييرات للتطبيق");
      return;
    }

    const yes = await ask(
      "🔧 تطبيق الـ users sync",
      `هـ يتـ sync ${changes.length} user:\n\n` +
      changes.slice(0, 10).map(c => "• " + (c.email || c.uid) + " → " + c.role).join("\n") +
      (changes.length > 10 ? `\n... و ${changes.length - 10} آخرين` : "") +
      `\n\nالتغييرات بـ تتـ write على cfg.users AND cfg.usersList بـ نفس القيم.\nBackup كامل قبل أي write.\nتأكيد؟`
    );
    if(!yes) return;

    setSyncApplyBusy(true);
    try {
      const r = await usersPermissions({ action: "sync_apply", changes }, user);
      if(r?.ok){
        showToast(`✅ تم! sync ${r.applied} user`);
        await runUsersSyncAudit(); /* refresh */
        setTimeout(() => {
          tell("✨ تم بنجاح", "اطلب من المستخدمين يعملوا Ctrl+Shift+R في الـ apps بتاعتهم — الصلاحيات بـ تتفعّل فوراً بعد الـ refresh.");
        }, 500);
      } else showToast("⛔ " + (r?.error || "فشل"));
    } catch(e){ showToast("⛔ " + e.message); }
    finally { setSyncApplyBusy(false); }
  };

  const addUserManually = async () => {
    if(!addUid.trim() && !addEmail.trim()){
      showToast("⛔ ادخل UID أو email");
      return;
    }
    setUsersBusy(true);
    try {
      let uidToUse = addUid.trim();
      let emailToUse = addEmail.trim();

      /* If only email given, look up the UID from Firebase Auth */
      if(!uidToUse && emailToUse){
        const search = await usersPermissions({ action: "auth_search", email: emailToUse }, user);
        if(search?.ok && search.user?.uid){
          uidToUse = search.user.uid;
        } else {
          showToast("⛔ الـ email مش موجود في Firebase Auth");
          return;
        }
      }

      const r = await usersPermissions({ action: "set", uid: uidToUse, email: emailToUse, role: addRole }, user);
      if(r?.ok){
        showToast("✅ تم إضافة الـ user");
        setAddUid(""); setAddEmail(""); setAddRole("manager");
        await loadUsersList();
      } else showToast("⛔ " + (r?.error || "فشل"));
    } catch(e){ showToast("⛔ " + e.message); }
    finally { setUsersBusy(false); }
  };

  const fmtBytes = (b) => {
    if(b < 1024) return b + " B";
    if(b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
    return (b / 1024 / 1024).toFixed(2) + " MB";
  };

  return (
    <>
      {/* V21.9.35: Bridge Status Card — live visibility for WhatsApp bridge.
          Surfaces waReady, queue state, daily cap, recent activity. The most
          actionable signal for "messages don't send" bugs. */}
      <BridgeStatusCard data={data} canEdit={canEdit} />

      {/* V21.9.72: Storage Diagnostic — self-test for "فشل رفع الصورة" reports.
          User can run this without Firebase Console access. */}
      <StorageDiagnosticCard data={data} user={user} getUserRole={getUserRole} />

    <Card title="🩺 فحص الصحة + المخزن (Diagnostics)" extra={
      <LoadingBtn primary loading={busy} loadingText="..." onClick={runCheck} disabled={!canEdit} small>
        🔍 شغّل فحص شامل
      </LoadingBtn>
    }>
      <div style={{ fontSize: FS - 2, color: T.textMut, marginBottom: 12, lineHeight: 1.7 }}>
        ℹ️ بـ يـ check حجم الـ Firestore docs، آخر sync لكل provider، الحجوزات اليتيمة، الطلبات pending قديمة، إلخ. أي حالة <b>error</b> أو <b>critical</b> تحتاج action فوري.
      </div>

      {/* V21.9.23: Auto-detected listener errors (permission-denied) — shows
          the moment App.jsx detects a denied subscription. Most actionable signal
          for the "data disappears after refresh" bug. */}
      {autoCriticalErrors.length > 0 && (
        <div style={{
          padding: 14, marginBottom: 12,
          background: "#DC2626" + "12",
          border: "2px solid " + "#DC2626" + "60",
          borderRadius: 10,
        }}>
          <div style={{ fontWeight: 800, color: "#DC2626", fontSize: FS + 1, marginBottom: 6 }}>
            🚨 firestore.rules مش publish-ـة على Firebase Console!
          </div>
          <div style={{ fontSize: FS - 2, color: T.text, lineHeight: 1.8, marginBottom: 10 }}>
            الـ client بـ يحاول يقرأ من collections دي وبيتـ <b>deny</b> — ده السبب إن المنتجات والعملاء بـ يظهروا 0 بعد كل refresh:
            <div style={{ marginTop: 6, padding: 8, background: "#DC2626" + "08", borderRadius: 6 }}>
              {autoCriticalErrors.map(e => (
                <div key={e.col} style={{ fontSize: FS - 2, fontFamily: "monospace" }}>
                  ❌ <code>{e.col}</code> ({e.field || "—"}) — <b style={{ color: "#DC2626" }}>permission-denied</b>
                </div>
              ))}
            </div>
          </div>
          <details style={{ fontSize: FS - 2, color: T.textSec, lineHeight: 1.7 }}>
            <summary style={{ cursor: "pointer", color: T.accent, fontWeight: 700, padding: "6px 0" }}>
              📖 كيفية الحل (3 خطوات — دقيقتين)
            </summary>
            <ol style={{ marginInlineStart: 20, marginTop: 8 }}>
              <li>افتح <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" style={{ color: T.accent, fontWeight: 700 }}>Firebase Console</a> واختار الـ project</li>
              <li>روح: <b>Build → Firestore Database → Rules tab</b></li>
              <li>افتح ملف <code>firestore.rules</code> من الـ GitHub repo، انسخ <b>كل المحتوى</b>، الصقه في الـ Console editor، واضغط <b>Publish</b></li>
            </ol>
            <div style={{ marginTop: 6, padding: 8, background: T.accent + "10", borderRadius: 6 }}>
              💡 لو Setup GitHub Actions (V21.9.21 workflow) معمول، الـ deploy بـ يحصل تلقائياً على كل push. شوف <code>.github/workflows/deploy-firebase-rules.yml</code> للتفاصيل.
            </div>
          </details>
        </div>
      )}

      {/* V21.9.23: Manual rules-test button banner */}
      <div style={{
        padding: 10, marginBottom: 12,
        background: T.bg, borderRadius: 8, border: "1px solid " + T.brd,
        display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10,
      }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 700, fontSize: FS - 1, marginBottom: 2 }}>
            🔐 Test Firestore Rules Deployment
          </div>
          <div style={{ fontSize: FS - 3, color: T.textSec, lineHeight: 1.6 }}>
            بـ يحاول read من كل collection حساسة. لو في permission-denied، الـ rules مش publish-ـة على Firebase. ضروري بعد كل تعديل لـ <code>firestore.rules</code>.
          </div>
        </div>
        <LoadingBtn loading={rulesBusy} loadingText="جاري الفحص..." onClick={runRulesTest} small
          style={{ background: T.accent, color: "#fff", border: "none", fontWeight: 700 }}>
          🔐 اختبر القواعد
        </LoadingBtn>
      </div>

      {/* V21.9.23: Rules test results */}
      {rulesResult && (
        <div style={{
          padding: 12, marginBottom: 12,
          background: rulesResult.criticalDenied ? "#DC2626" + "10" : (rulesResult.anyDenied ? T.warn + "10" : T.ok + "10"),
          border: "1.5px solid " + (rulesResult.criticalDenied ? "#DC2626" : (rulesResult.anyDenied ? T.warn : T.ok)) + "40",
          borderRadius: 10,
        }}>
          <div style={{ fontWeight: 800, color: rulesResult.criticalDenied ? "#DC2626" : (rulesResult.anyDenied ? T.warn : T.ok), fontSize: FS, marginBottom: 6 }}>
            {rulesResult.criticalDenied
              ? "🚨 Rules ناقصة — لازم Publish يدوي"
              : (rulesResult.anyDenied ? "⚠️ بعض الـ collections denied (مش حرجة)" : "✅ كل الـ rules شغّالة")}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {rulesResult.results.map(r => (
              <div key={r.col} style={{
                padding: "4px 8px", fontSize: FS - 2, fontFamily: "monospace",
                background: T.cardSolid + "80", borderRadius: 5,
              }}>
                {r.emoji} <code>{r.col}</code> {r.critical && <span style={{ color: T.err, fontWeight: 700 }}>(حرج)</span>} — {r.msg}
              </div>
            ))}
          </div>
          {rulesResult.criticalDenied && (
            <div style={{ marginTop: 10, padding: 10, background: T.bg, borderRadius: 6, fontSize: FS - 2, lineHeight: 1.8 }}>
              <b>الحل:</b> افتح <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" style={{ color: T.accent, fontWeight: 700 }}>Firebase Console</a> → Build → Firestore Database → Rules tab → الصق <code>firestore.rules</code> من الـ repo → Publish.
            </div>
          )}
        </div>
      )}

      {/* V21.9.24: My Permissions Panel (auto-loads) */}
      {myPerms && myPerms.ok && (
        <div style={{
          padding: 12, marginBottom: 12,
          background: (myPerms.warnings?.length > 0 ? T.warn + "10" : T.ok + "10"),
          border: "1.5px solid " + (myPerms.warnings?.length > 0 ? T.warn : T.ok) + "40",
          borderRadius: 10,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
            <div style={{ fontWeight: 800, color: myPerms.warnings?.length > 0 ? T.warn : T.ok, fontSize: FS }}>
              🛡 صلاحياتي
            </div>
            <LoadingBtn loading={myPermsBusy} loadingText="..." onClick={loadMyPerms} small>
              🔄 إعادة فحص
            </LoadingBtn>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 1fr", gap: 6, fontSize: FS - 2 }}>
            <div><b>UID:</b> <code style={{ fontSize: FS - 3 }}>{myPerms.uid}</code></div>
            <div><b>Email:</b> {myPerms.email || "—"}</div>
            <div><b>Role:</b> <span style={{ color: myPerms.role === "admin" ? T.ok : (myPerms.role === "viewer" ? T.err : T.warn), fontWeight: 800 }}>{myPerms.role}</span></div>
            <div><b>Source:</b> <span style={{ fontSize: FS - 3, color: T.textSec }}>{myPerms.source}</span></div>
            <div><b>Bootstrap:</b> {myPerms.isBootstrap ? "✅ نعم" : "✗ لأ"}</div>
            <div><b>في cfg.users:</b> {myPerms.isInUsersList ? "✅ نعم" : "❌ لأ"}</div>
          </div>
          {myPerms.warnings?.length > 0 && (
            <div style={{ marginTop: 10, padding: 8, background: T.warn + "10", borderRadius: 6 }}>
              {myPerms.warnings.map((w, i) => (
                <div key={i} style={{ fontSize: FS - 2, color: T.warn, marginBottom: 4 }}>{w}</div>
              ))}
              {!myPerms.isInUsersList && myPerms.admin_count === 0 && (
                <LoadingBtn small onClick={bootstrapMe}
                  style={{ background: T.err, color: "#fff", border: "none", fontWeight: 700, marginTop: 6 }}>
                  🆘 Bootstrap me as admin
                </LoadingBtn>
              )}
            </div>
          )}
        </div>
      )}

      {/* V21.9.32: Dynamic Role Scopes Editor — admin can change which roles are in each scope */}
      {canEdit && myPerms?.role === "admin" && (
        <div style={{
          padding: 10, marginBottom: 12,
          background: T.bg, borderRadius: 8, border: "1px solid " + T.brd,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 800, fontSize: FS, color: T.text }}>
                🎯 Role Scopes Editor — تعديل الصلاحيات بدون republish
              </div>
              <div style={{ fontSize: FS - 3, color: T.textSec, marginTop: 4, lineHeight: 1.7 }}>
                الـ scopes (isPurchaseScope, isSalesScope, إلخ) دلوقتي بـ تتـ store في <code>factory/roleScopes</code>. الـ Firestore rules بـ تـ read منهم تلقائياً. لما تـ change role بـ يـ take effect فوراً — مفيش rules republish needed. ⚠️ الـ admin دايماً included في كل scope (auto-protection).
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <LoadingBtn loading={scopesBusy} loadingText="..." onClick={loadRoleScopes} small
                style={{ background: T.accent, color: "#fff", border: "none", fontWeight: 700 }}>
                📋 جلب الـ Scopes
              </LoadingBtn>
            </div>
          </div>

          {scopesData && (
            <div style={{ marginTop: 8 }}>
              {!scopesData.exists && (
                <div style={{
                  padding: 10, marginBottom: 10,
                  background: T.warn + "15", border: "1.5px solid " + T.warn + "60",
                  borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap",
                }}>
                  <div style={{ fontSize: FS - 2, color: T.warn }}>
                    ⚠️ <code>factory/roleScopes</code> doc مش موجود — الـ rules بـ تستخدم الـ defaults الـ hardcoded. لـ enable الـ dynamic editing اضغط 'Init'.
                  </div>
                  <LoadingBtn loading={scopesBusy} loadingText="..." onClick={initRoleScopes} small
                    style={{ background: T.warn, color: "#fff", border: "none", fontWeight: 700 }}>
                    🚀 Init بـ Defaults
                  </LoadingBtn>
                </div>
              )}

              <div style={{ borderRadius: 8, border: "1px solid " + T.brd, overflow: "hidden", marginBottom: 8 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FS - 2 }}>
                  <thead style={{ background: T.cardSolid }}>
                    <tr>
                      <th style={{ padding: "8px 6px", textAlign: "start", borderBottom: "1px solid " + T.brd, minWidth: 200 }}>Scope</th>
                      {(scopesData.valid_roles || []).map(role => (
                        <th key={role} style={{
                          padding: "8px 6px", textAlign: "center", borderBottom: "1px solid " + T.brd,
                          fontSize: FS - 4, color: T.textSec, fontWeight: 600,
                        }}>
                          {role.replace("_", "_\n")}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(scopesData.scopes || {}).map(([scopeName, defaultRoles]) => {
                      const currentRoles = scopesEdits[scopeName] || defaultRoles;
                      const label = scopesData.labels[scopeName] || scopeName;
                      return (
                        <tr key={scopeName} style={{ borderBottom: "1px solid " + T.brd }}>
                          <td style={{ padding: "8px 6px", verticalAlign: "top" }}>
                            <div style={{ fontWeight: 700, fontSize: FS - 2 }}>{label}</div>
                            <div style={{ fontFamily: "monospace", fontSize: FS - 4, color: T.textMut, marginTop: 2 }}>
                              {scopeName}
                            </div>
                          </td>
                          {(scopesData.valid_roles || []).map(role => {
                            const inScope = currentRoles.includes(role);
                            const isAdminCell = role === "admin"; /* always disabled — auto-included */
                            return (
                              <td key={role} style={{ padding: "8px 4px", textAlign: "center", verticalAlign: "middle" }}>
                                <input
                                  type="checkbox"
                                  checked={inScope}
                                  disabled={isAdminCell || scopeName === "isAdmin"}
                                  onChange={() => !isAdminCell && toggleRoleInScope(scopeName, role)}
                                  style={{
                                    width: 18, height: 18,
                                    cursor: (isAdminCell || scopeName === "isAdmin") ? "not-allowed" : "pointer",
                                    accentColor: inScope ? T.ok : T.textMut,
                                  }}
                                  title={isAdminCell ? "admin دايماً included" : (inScope ? "اضغط لـ remove" : "اضغط لـ add")}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div style={{ fontSize: FS - 3, color: T.textMut }}>
                  ℹ️ التغيير بـ يـ take effect فوراً بعد الـ Save. أعمل F5 + اطلب من الموظفين الـ refresh.
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <LoadingBtn loading={scopesBusy} loadingText="..." onClick={resetRoleScopes} small
                    style={{ background: T.bg, color: T.err, border: "1px solid " + T.err + "60", fontWeight: 700 }}>
                    🔄 Reset to Defaults
                  </LoadingBtn>
                  <LoadingBtn loading={scopesSaveBusy} loadingText="جاري الحفظ..." onClick={saveRoleScopes}
                    style={{ background: T.ok, color: "#fff", border: "none", fontWeight: 800 }}>
                    💾 حفظ التغييرات
                  </LoadingBtn>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* V21.9.30: Permissions Audit — rules vs cfg.permissions cross-check */}
      {canEdit && myPerms?.role === "admin" && (
        <div style={{
          padding: 10, marginBottom: 12,
          background: T.bg, borderRadius: 8, border: "1px solid " + T.brd,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 800, fontSize: FS, color: T.text }}>
                🛡 Permissions Audit — Rules vs UI Matrix
              </div>
              <div style={{ fontSize: FS - 3, color: T.textSec, marginTop: 4, lineHeight: 1.7 }}>
                المشكلة الأكثر شيوعاً: cfg.permissions[role][tab] = "view" لكن firestore.rules بـ تـ deny الـ read للـ role دي. النتيجة: الـ user يشوف الـ tab لكن الـ data جاية صفر. الـ audit بـ يـ scan كل role × كل tab × الـ rules + الـ matrix ويعرضك الـ mismatches.
              </div>
            </div>
            <LoadingBtn loading={permAuditBusy} loadingText="..." onClick={runPermissionsAudit} small
              style={{ background: "#8B5CF6", color: "#fff", border: "none", fontWeight: 700 }}>
              🛡 افحص الـ Permissions
            </LoadingBtn>
          </div>

          {permAuditResult && permAuditResult.ok && (
            <div style={{ marginTop: 8 }}>
              <div style={{
                padding: 10, marginBottom: 10,
                background: (permAuditResult.summary.critical_conflicts > 0 ? "#DC2626" + "10" : T.ok + "10"),
                border: "1.5px solid " + (permAuditResult.summary.critical_conflicts > 0 ? "#DC2626" : T.ok) + "40",
                borderRadius: 8,
              }}>
                <div style={{ fontWeight: 800, fontSize: FS - 1, color: permAuditResult.summary.critical_conflicts > 0 ? "#DC2626" : T.ok, marginBottom: 6 }}>
                  {permAuditResult.summary.critical_conflicts > 0
                    ? `🚨 ${permAuditResult.summary.critical_conflicts} conflicts حرجة + ${permAuditResult.summary.total_conflicts - permAuditResult.summary.critical_conflicts} تحذيرات`
                    : "✅ Permissions matrix متطابق مع firestore.rules"}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr 1fr" : "repeat(4, 1fr)", gap: 6 }}>
                  {(permAuditResult.roles || []).map(role => {
                    const stats = permAuditResult.summary.by_role[role] || { total: 0, critical: 0 };
                    if(stats.total === 0) return null;
                    return (
                      <div key={role} style={{ fontSize: FS - 3, color: T.textSec, padding: "4px 8px", background: T.cardSolid, borderRadius: 4 }}>
                        <code>{role}</code>:{" "}
                        <b style={{ color: stats.critical > 0 ? "#DC2626" : T.warn }}>{stats.total}</b>
                        {stats.critical > 0 && <span style={{ color: "#DC2626" }}> ({stats.critical} حرج)</span>}
                      </div>
                    );
                  })}
                </div>
              </div>

              {permAuditResult.summary.critical_conflicts > 0 && (
                <>
                  <div style={{ marginBottom: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <select
                      value={permRoleFilter}
                      onChange={(e) => setPermRoleFilter(e.target.value)}
                      style={{ padding: "6px 10px", border: "1px solid " + T.brd, borderRadius: 6, background: T.inputBg, color: T.text, fontSize: FS - 2 }}
                    >
                      <option value="">All roles</option>
                      {(permAuditResult.roles || []).map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <LoadingBtn loading={permFixBusy} loadingText="..." onClick={autofixPermissions} small
                      style={{ background: "#DC2626", color: "#fff", border: "none", fontWeight: 800 }}>
                      🔧 Auto-fix الكل
                    </LoadingBtn>
                  </div>
                  <div style={{ borderRadius: 6, border: "1px solid " + T.brd, overflow: "hidden", maxHeight: 450, overflowY: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FS - 2 }}>
                      <thead style={{ background: T.cardSolid, position: "sticky", top: 0 }}>
                        <tr>
                          <th style={{ padding: "6px", textAlign: "start" }}>Role</th>
                          <th style={{ padding: "6px", textAlign: "start" }}>Tab</th>
                          <th style={{ padding: "6px", textAlign: "start" }}>Matrix</th>
                          <th style={{ padding: "6px", textAlign: "start" }}>Rules</th>
                          <th style={{ padding: "6px", textAlign: "start" }}>المشكلة</th>
                          <th style={{ padding: "6px", textAlign: "start" }}>التصحيح</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(permAuditResult.conflicts || [])
                          .filter(c => !permRoleFilter || c.role === permRoleFilter)
                          .map((c, i) => (
                            <tr key={i} style={{ borderBottom: "1px solid " + T.brd, background: "#DC2626" + "06" }}>
                              <td style={{ padding: "6px", fontWeight: 700 }}>{c.role}</td>
                              <td style={{ padding: "6px" }}><code>{c.tab}</code></td>
                              <td style={{ padding: "6px" }}>
                                <code style={{ background: T.cardSolid, padding: "1px 6px", borderRadius: 4 }}>{c.matrix || "—"}</code>
                              </td>
                              <td style={{ padding: "6px", fontSize: FS - 3 }}>
                                {c.can_read ? "✅ read" : "❌ deny read"} · {c.can_write ? "✅ write" : "❌ deny write"}
                              </td>
                              <td style={{ padding: "6px", fontSize: FS - 3, color: T.err }}>
                                {c.conflict === "matrix_says_view_but_rules_deny_read" && "tab تظهر فاضية"}
                                {c.conflict === "matrix_says_edit_but_rules_deny_write" && "مش يقدر يحفظ"}
                                {c.conflict === "matrix_says_edit_but_rules_only_allow_read" && "edit مش بـ يشتغل"}
                              </td>
                              <td style={{ padding: "6px" }}>
                                {c.matrix} → <b style={{ color: T.ok }}>{c.recommended}</b>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* V21.9.28: Migration Log inspector — see what every button did */}
      {canEdit && myPerms?.role === "admin" && (
        <div style={{
          padding: 10, marginBottom: 12,
          background: T.bg, borderRadius: 8, border: "1px solid " + T.brd,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 800, fontSize: FS, color: T.text }}>
                📋 Migration Log — سجل العمليات
              </div>
              <div style={{ fontSize: FS - 3, color: T.textSec, marginTop: 4, lineHeight: 1.7 }}>
                كل زر في الـ Diagnostics بـ يـ log إيه عمله (flags set, fields stripped, items migrated, إلخ). دي طريقة الـ debugging الأساسية لو data ضاعت بشكل غير متوقع. لكل entry فيها backup_doc_id، تقدر تـ restore منها بـ click.
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                value={logFilter}
                onChange={(e) => setLogFilter(e.target.value)}
                placeholder="filter by type..."
                style={{ padding: "6px 10px", border: "1px solid " + T.brd, borderRadius: 6, background: T.inputBg, color: T.text, fontSize: FS - 2, width: 160 }}
              />
              <LoadingBtn loading={logBusy} loadingText="..." onClick={loadMigrationLog} small
                style={{ background: T.accent, color: "#fff", border: "none", fontWeight: 700 }}>
                📋 جلب الـ Log
              </LoadingBtn>
            </div>
          </div>

          {logEntries && (
            <div style={{ borderRadius: 8, border: "1px solid " + T.brd, overflow: "hidden" }}>
              {logEntries.length === 0 ? (
                <div style={{ padding: 14, textAlign: "center", color: T.textMut, fontSize: FS - 2 }}>
                  مفيش entries
                </div>
              ) : (
                <div style={{ maxHeight: 450, overflow: "auto" }}>
                  {logEntries.map((e, i) => {
                    const isExpanded = expandedLogEntry === e.id;
                    const isDangerous = !!(e.fields_stripped && e.fields_stripped.length > 0);
                    const isRecovery = (e.type || "").includes("recover") || (e.type || "").includes("restore");
                    const bgColor = isDangerous ? "#DC2626" + "08" :
                                    isRecovery ? T.ok + "08" : "transparent";
                    return (
                      <div key={e.id} style={{
                        padding: "8px 10px",
                        borderBottom: i < logEntries.length - 1 ? "1px solid " + T.brd : "none",
                        background: bgColor,
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                          <div style={{ flex: 1, minWidth: 200 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <span style={{
                                fontFamily: "monospace", fontSize: FS - 2, fontWeight: 700,
                                color: isDangerous ? "#DC2626" : (isRecovery ? T.ok : T.text),
                              }}>
                                {isDangerous ? "⚠️ " : (isRecovery ? "♻️ " : "▸ ")}
                                {e.type || "(unknown)"}
                              </span>
                              {e.status && (
                                <span style={{
                                  fontSize: FS - 4, padding: "1px 6px", borderRadius: 4,
                                  background: e.status === "success" ? T.ok + "20" : T.err + "20",
                                  color: e.status === "success" ? T.ok : T.err,
                                }}>
                                  {e.status}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 2 }}>
                              {e.at ? new Date(e.at).toLocaleString("ar-EG") : "—"} · {e.by || "—"}
                            </div>
                            {/* Surface key fields per entry type */}
                            {e.fields_stripped && e.fields_stripped.length > 0 && (
                              <div style={{ fontSize: FS - 3, color: "#DC2626", marginTop: 2, fontFamily: "monospace" }}>
                                🗑 stripped: {e.fields_stripped.join(", ")}
                              </div>
                            )}
                            {e.flags_set && e.flags_set.length > 0 && (
                              <div style={{ fontSize: FS - 3, color: T.warn, marginTop: 2, fontFamily: "monospace" }}>
                                🏳 flags set: {e.flags_set.join(", ")}
                              </div>
                            )}
                            {e.items_migrated && (
                              <div style={{ fontSize: FS - 3, color: T.ok, marginTop: 2 }}>
                                ✓ {e.items_migrated} item processed
                              </div>
                            )}
                          </div>
                          <div style={{ display: "flex", gap: 4 }}>
                            <button
                              onClick={() => setExpandedLogEntry(isExpanded ? null : e.id)}
                              style={{
                                padding: "4px 10px", background: T.bg, color: T.text,
                                border: "1px solid " + T.brd, borderRadius: 4, cursor: "pointer",
                                fontSize: FS - 3, fontFamily: "inherit",
                              }}>
                              {isExpanded ? "▲ إخفاء" : "▼ تفاصيل"}
                            </button>
                            {e.backup_doc_id && e.fields_stripped && e.fields_stripped.length > 0 && (
                              <LoadingBtn loading={restoreBusy} loadingText="..."
                                onClick={() => restoreFromBackup(e.backup_doc_id, e.fields_stripped)} small
                                style={{ background: T.ok, color: "#fff", border: "none", fontWeight: 700, fontSize: FS - 3 }}>
                                ♻️ Restore
                              </LoadingBtn>
                            )}
                          </div>
                        </div>
                        {isExpanded && (
                          <pre style={{
                            marginTop: 8, padding: 8, background: T.cardSolid, borderRadius: 4,
                            fontSize: FS - 4, overflow: "auto", maxHeight: 280,
                            fontFamily: "monospace", direction: "ltr", textAlign: "left",
                          }}>{JSON.stringify(e.raw, null, 2)}</pre>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* V21.9.27: Data Recovery — legacy fields that got orphaned */}
      {canEdit && myPerms?.role === "admin" && (
        <div style={{
          padding: 10, marginBottom: 12,
          background: T.bg, borderRadius: 8, border: "1px solid " + T.brd,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 800, fontSize: FS, color: T.text }}>
                🆘 Data Recovery — استرجاع البيانات الـ legacy
              </div>
              <div style={{ fontSize: FS - 3, color: T.textSec, marginTop: 4, lineHeight: 1.7 }}>
                لو الـ V21.9.24 fix-flags strip-ـ الـ cfg fields بطريقة الخطأ (الـ flag كان set لكن الـ collection فاضية)، الـ data ممكن تكون موجودة في cfg لسه. الزر ده بـ يـ scan ويـ migrate الـ data للـ partitioned collections الصحيحة.
              </div>
            </div>
            <LoadingBtn loading={recoverBusy} loadingText="..." onClick={runRecoverScan} small
              style={{ background: "#DC2626", color: "#fff", border: "none", fontWeight: 700 }}>
              🔍 افحص الـ legacy data
            </LoadingBtn>
          </div>

          {recoverScan && recoverScan.ok && (
            <div style={{ marginTop: 8 }}>
              {recoverScan.recoverable_count > 0 ? (
                <div style={{
                  padding: 10, marginBottom: 10,
                  background: "#DC2626" + "10",
                  border: "1.5px solid " + "#DC2626" + "60",
                  borderRadius: 8,
                }}>
                  <div style={{ fontWeight: 800, fontSize: FS - 1, color: "#DC2626", marginBottom: 6 }}>
                    🚨 لقينا {recoverScan.recoverable_count} حقل قابل للاسترجاع ({recoverScan.total_legacy_items} item)
                  </div>
                </div>
              ) : (
                <div style={{
                  padding: 10, marginBottom: 10,
                  background: T.ok + "10",
                  border: "1.5px solid " + T.ok + "40",
                  borderRadius: 8,
                }}>
                  <div style={{ fontWeight: 700, color: T.ok, fontSize: FS - 1 }}>
                    ✅ مفيش data في cfg legacy fields محتاجة recovery
                  </div>
                </div>
              )}
              <div style={{ borderRadius: 8, border: "1px solid " + T.brd, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FS - 2 }}>
                  <thead style={{ background: T.cardSolid }}>
                    <tr>
                      <th style={{ padding: "6px", textAlign: "start" }}>Field</th>
                      <th style={{ padding: "6px", textAlign: "start" }}>cfg legacy</th>
                      <th style={{ padding: "6px", textAlign: "start" }}>Partitioned</th>
                      <th style={{ padding: "6px", textAlign: "start" }}>Flag</th>
                      <th style={{ padding: "6px", textAlign: "start" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(recoverScan.fields || []).map(f => (
                      <tr key={f.field} style={{ borderBottom: "1px solid " + T.brd, background: f.can_recover ? "#DC2626" + "06" : "transparent" }}>
                        <td style={{ padding: "6px" }}>
                          <code>{f.field}</code>
                          <div style={{ fontSize: FS - 4, color: T.textMut }}>{f.collection}</div>
                        </td>
                        <td style={{ padding: "6px", fontWeight: f.legacy_count > 0 ? 700 : 400, color: f.legacy_count > 0 ? T.warn : T.textMut }}>
                          {f.legacy_count}
                        </td>
                        <td style={{ padding: "6px", fontWeight: f.partitioned_count > 0 ? 700 : 400, color: f.partitioned_count > 0 ? T.ok : "#DC2626" }}>
                          {f.partitioned_count}
                        </td>
                        <td style={{ padding: "6px" }}>
                          <span style={{ fontSize: FS - 3, color: f.flag_value ? T.ok : T.textMut }}>
                            {f.flag_value ? "✅" : "—"}
                          </span>
                        </td>
                        <td style={{ padding: "6px" }}>
                          {f.can_recover ? (
                            <LoadingBtn loading={migrateBusy[f.field]} loadingText="..."
                              onClick={() => migrateLegacyField(f.field, f.legacy_count)} small
                              style={{ background: T.err, color: "#fff", border: "none", fontWeight: 700, fontSize: FS - 3 }}>
                              🆘 استرجع
                            </LoadingBtn>
                          ) : f.severity === "duplicate" ? (
                            <span style={{ fontSize: FS - 3, color: T.warn }}>⚠️ duplicate</span>
                          ) : (
                            <span style={{ fontSize: FS - 3, color: T.ok }}>✅ ok</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* V21.9.24: State Audit + Fix Flags (admin-only) */}
      {canEdit && (
        <div style={{
          padding: 10, marginBottom: 12,
          background: T.bg, borderRadius: 8, border: "1px solid " + T.brd,
          display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10,
        }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 700, fontSize: FS - 1, marginBottom: 2 }}>
              🔍 State Audit — كشف flag/data mismatches
            </div>
            <div style={{ fontSize: FS - 3, color: T.textSec, lineHeight: 1.6 }}>
              لو الـ data موجودة في Firestore لكن الـ UI بـ يـ show 0، السبب على الأرجح إن الـ migration flag مش set. الزر ده بـ يـ scan كل الـ collections + flags ويعرضك المشاكل + يـ fix-ها بزرّ واحد.
            </div>
          </div>
          <LoadingBtn loading={auditBusy} loadingText="..." onClick={runStateAudit} small
            style={{ background: T.purple, color: "#fff", border: "none", fontWeight: 700 }}>
            🔍 افحص الـ state
          </LoadingBtn>
        </div>
      )}

      {auditResult && auditResult.ok && (
        <div style={{
          padding: 12, marginBottom: 12,
          background: (auditResult.mismatches?.any ? "#DC2626" + "10" : T.ok + "10"),
          border: "1.5px solid " + (auditResult.mismatches?.any ? "#DC2626" : T.ok) + "40",
          borderRadius: 10,
        }}>
          <div style={{ fontWeight: 800, color: auditResult.mismatches?.any ? "#DC2626" : T.ok, fontSize: FS, marginBottom: 8 }}>
            {auditResult.mismatches?.any
              ? `🚨 لقينا ${(auditResult.mismatches.partitioned?.length||0) + (auditResult.mismatches.split?.length||0)} mismatch`
              : "✅ كل الـ flags و collections متسقين"}
          </div>
          {auditResult.mismatches?.any && (
            <>
              <div style={{ fontSize: FS - 2, marginBottom: 8, color: T.text, lineHeight: 1.7 }}>
                <b>المشكلة:</b> فيه data موجودة في collections لكن الـ migration flag في factory/config مش set. الـ client merge بـ يستخدم الـ legacy field الفاضي → UI بـ يـ show 0.
              </div>
              <div style={{ background: T.cardSolid, padding: 8, borderRadius: 6, marginBottom: 8, maxHeight: 200, overflow: "auto" }}>
                {auditResult.mismatches.partitioned?.map(m => (
                  <div key={m.collection} style={{ fontSize: FS - 2, fontFamily: "monospace", marginBottom: 3 }}>
                    🔧 <code>{m.collection}</code>: {m.doc_count} doc لكن <code>{m.flag}</code> = false
                  </div>
                ))}
                {auditResult.mismatches.split?.map(m => (
                  <div key={m.collection} style={{ fontSize: FS - 2, fontFamily: "monospace", marginBottom: 3 }}>
                    🔧 <code>{m.collection}</code>: {m.total_entries} entries في {m.day_doc_count} day docs لكن <code>{m.flag}</code> = false
                  </div>
                ))}
              </div>
              <LoadingBtn loading={fixBusy} loadingText="جاري الإصلاح..." onClick={runFixFlags}
                style={{ background: "#DC2626", color: "#fff", border: "none", fontWeight: 800 }}>
                🔧 اصلح الـ Flags دلوقتي
              </LoadingBtn>
            </>
          )}
          {auditResult.suggestions?.length > 0 && !auditResult.mismatches?.any && (
            <div style={{ marginTop: 6, fontSize: FS - 2, color: T.textSec }}>
              {auditResult.suggestions.map((s, i) => <div key={i}>• {s}</div>)}
            </div>
          )}
        </div>
      )}

      {/* V21.9.26: Users Sync Audit (cfg.users ↔ cfg.usersList mismatch detection) */}
      {canEdit && myPerms?.role === "admin" && (
        <div style={{
          padding: 10, marginBottom: 12,
          background: T.bg, borderRadius: 8, border: "1px solid " + T.brd,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 800, fontSize: FS, color: T.text }}>
                🔄 Users Sync — كشف عدم تطابق Settings ↔ Rules
              </div>
              <div style={{ fontSize: FS - 3, color: T.textSec, marginTop: 4, lineHeight: 1.7 }}>
                CLARK عنده مصدرين للـ users: <code>cfg.usersList</code> (الـ Settings page بـ يـ display) و <code>cfg.users</code> (الـ Firestore rules بـ تستخدم). لو الاتنين مش متطابقين، الـ user بـ يـ شوف صلاحياتها لكن مش يقدر يـ save (الـ rules بـ تـ deny). كمان الـ roles ممكن تكون مكتوبة بـ Arabic ("محاسب مشتريات") في usersList بدل English ("purchase_accountant") في users.
              </div>
            </div>
            <LoadingBtn loading={syncBusy} loadingText="..." onClick={runUsersSyncAudit} small
              style={{ background: "#8B5CF6", color: "#fff", border: "none", fontWeight: 700 }}>
              🔍 افحص الـ Sync
            </LoadingBtn>
          </div>

          {syncResult && syncResult.ok && (
            <div style={{ marginTop: 8 }}>
              <div style={{
                padding: 10, marginBottom: 10,
                background: (syncResult.total_issues > 0 ? "#DC2626" + "10" : T.ok + "10"),
                border: "1.5px solid " + (syncResult.total_issues > 0 ? "#DC2626" : T.ok) + "40",
                borderRadius: 8,
              }}>
                <div style={{ fontWeight: 800, fontSize: FS - 1, color: syncResult.total_issues > 0 ? "#DC2626" : T.ok }}>
                  {syncResult.total_issues > 0
                    ? `🚨 لقينا ${syncResult.total_issues} مشكلة في ${syncResult.users.length} user`
                    : `✅ كل الـ users متطابقين`}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr 1fr" : "repeat(5, 1fr)", gap: 6, marginTop: 8 }}>
                  <div style={{ fontSize: FS - 3, color: T.textSec }}>
                    Role mismatches: <b style={{ color: T.warn }}>{syncResult.summary.role_mismatches}</b>
                  </div>
                  <div style={{ fontSize: FS - 3, color: T.textSec }}>
                    مش في cfg.users: <b style={{ color: "#DC2626" }}>{syncResult.summary.missing_from_users}</b>
                  </div>
                  <div style={{ fontSize: FS - 3, color: T.textSec }}>
                    مش في usersList: <b style={{ color: T.warn }}>{syncResult.summary.missing_from_userslist}</b>
                  </div>
                  <div style={{ fontSize: FS - 3, color: T.textSec }}>
                    Unknown labels: <b style={{ color: T.warn }}>{syncResult.summary.unknown_labels}</b>
                  </div>
                  <div style={{ fontSize: FS - 3, color: T.textSec }}>
                    مفيش UID: <b style={{ color: T.err }}>{syncResult.summary.missing_uid}</b>
                  </div>
                </div>
              </div>

              <div style={{ maxHeight: 400, overflow: "auto", borderRadius: 8, border: "1px solid " + T.brd, marginBottom: 8 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FS - 2 }}>
                  <thead style={{ background: T.cardSolid, position: "sticky", top: 0 }}>
                    <tr>
                      <th style={{ padding: "8px 6px", textAlign: "start", borderBottom: "1px solid " + T.brd }}>User</th>
                      <th style={{ padding: "8px 6px", textAlign: "start", borderBottom: "1px solid " + T.brd }}>usersList (Arabic)</th>
                      <th style={{ padding: "8px 6px", textAlign: "start", borderBottom: "1px solid " + T.brd }}>users (English)</th>
                      <th style={{ padding: "8px 6px", textAlign: "start", borderBottom: "1px solid " + T.brd }}>Issues</th>
                      <th style={{ padding: "8px 6px", textAlign: "start", borderBottom: "1px solid " + T.brd }}>الـ Role النهائي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(syncResult.users || []).map((u, i) => {
                      const key = u.uid || u.email || ("row_" + i);
                      const overrideVal = syncOverrides[key];
                      const finalRole = overrideVal || u.recommended_role;
                      const hasIssues = u.issues && u.issues.length > 0;
                      return (
                        <tr key={key} style={{
                          background: hasIssues ? "#DC2626" + "06" : "transparent",
                          borderBottom: "1px solid " + T.brd,
                        }}>
                          <td style={{ padding: "6px", verticalAlign: "top" }}>
                            <div style={{ fontWeight: 700 }}>{u.display_name || u.email || u.uid}</div>
                            <div style={{ fontSize: FS - 3, color: T.textMut, fontFamily: "monospace" }}>
                              {u.email}{u.uid ? " · " + u.uid.slice(0, 12) + "…" : ""}
                            </div>
                          </td>
                          <td style={{ padding: "6px", verticalAlign: "top" }}>
                            {u.userslist_raw ? (
                              <div>
                                <code style={{ background: T.cardSolid, padding: "2px 6px", borderRadius: 4 }}>{u.userslist_raw}</code>
                                {u.userslist_normalized !== u.userslist_raw && (
                                  <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 2 }}>
                                    → {u.userslist_normalized}
                                  </div>
                                )}
                              </div>
                            ) : <span style={{ color: T.textMut }}>—</span>}
                          </td>
                          <td style={{ padding: "6px", verticalAlign: "top" }}>
                            {u.users_raw ? (
                              <code style={{ background: T.cardSolid, padding: "2px 6px", borderRadius: 4, color: u.users_normalized !== u.userslist_normalized && u.userslist_normalized ? "#DC2626" : T.text }}>
                                {u.users_raw}
                              </code>
                            ) : <span style={{ color: "#DC2626", fontWeight: 700 }}>❌ مش موجود</span>}
                          </td>
                          <td style={{ padding: "6px", verticalAlign: "top" }}>
                            {hasIssues ? (
                              u.issues.map((iss, j) => (
                                <span key={j} style={{
                                  display: "inline-block", padding: "1px 6px", margin: "1px",
                                  background: "#DC2626" + "20", color: "#DC2626",
                                  fontSize: FS - 4, borderRadius: 4, fontFamily: "monospace",
                                }}>{iss}</span>
                              ))
                            ) : <span style={{ color: T.ok }}>✅</span>}
                          </td>
                          <td style={{ padding: "6px", verticalAlign: "top" }}>
                            <select
                              value={finalRole}
                              onChange={(e) => setSyncOverrides({ ...syncOverrides, [key]: e.target.value })}
                              style={{ padding: "4px 6px", border: "1px solid " + T.brd, borderRadius: 4, background: T.inputBg, color: T.text, fontSize: FS - 2 }}
                            >
                              {(syncResult.valid_roles || []).map(r => (
                                <option key={r} value={r}>{r}</option>
                              ))}
                              {(syncResult.custom_roles || []).map(r => (
                                <option key={r} value={r}>{r} (custom)</option>
                              ))}
                            </select>
                            {u.recommended_reason && (
                              <div style={{ fontSize: FS - 4, color: T.textMut, marginTop: 2 }}>
                                {u.recommended_reason}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {syncResult.total_issues > 0 && (
                <LoadingBtn loading={syncApplyBusy} loadingText="جاري التطبيق..." onClick={applyUsersSync}
                  style={{ background: "#DC2626", color: "#fff", border: "none", fontWeight: 800 }}>
                  🔧 طبّق الـ Sync على كل الـ users
                </LoadingBtn>
              )}
            </div>
          )}
        </div>
      )}

      {/* V21.9.24: Users & Permissions admin panel */}
      {canEdit && myPerms?.role === "admin" && (
        <div style={{
          padding: 10, marginBottom: 12,
          background: T.bg, borderRadius: 8, border: "1px solid " + T.brd,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
            <div style={{ fontWeight: 800, fontSize: FS - 1 }}>
              👥 إدارة المستخدمين والصلاحيات
            </div>
            <LoadingBtn loading={usersBusy} loadingText="..." onClick={loadUsersList} small
              style={{ background: T.accent, color: "#fff", border: "none", fontWeight: 700 }}>
              {usersList ? "🔄 تحديث" : "📋 جلب القائمة"}
            </LoadingBtn>
          </div>
          <div style={{ fontSize: FS - 3, color: T.textSec, lineHeight: 1.6, marginBottom: 8 }}>
            الناس اللي بتشتغل على البرنامج لازم يكون عندهم role في cfg.users، غير كده الـ Firestore بـ يـ default لـ 'viewer' وما يقدروش يـ save أي حاجة.
          </div>

          {usersList && (
            <>
              <div style={{ padding: 10, background: T.cardSolid, borderRadius: 6, marginBottom: 8 }}>
                <div style={{ fontWeight: 700, marginBottom: 6, fontSize: FS - 2 }}>
                  ➕ إضافة user جديد
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 1fr 130px 100px", gap: 6, alignItems: "center" }}>
                  <input
                    value={addEmail}
                    onChange={(e) => setAddEmail(e.target.value)}
                    placeholder="Email (نبحث عن UID تلقائياً)"
                    style={{ padding: "6px 10px", border: "1px solid " + T.brd, borderRadius: 6, background: T.inputBg, color: T.text, fontSize: FS - 2 }}
                  />
                  <input
                    value={addUid}
                    onChange={(e) => setAddUid(e.target.value)}
                    placeholder="UID (لو معروف — اختياري)"
                    style={{ padding: "6px 10px", border: "1px solid " + T.brd, borderRadius: 6, background: T.inputBg, color: T.text, fontSize: FS - 2 }}
                  />
                  <select
                    value={addRole}
                    onChange={(e) => setAddRole(e.target.value)}
                    style={{ padding: "6px 10px", border: "1px solid " + T.brd, borderRadius: 6, background: T.inputBg, color: T.text, fontSize: FS - 2 }}
                  >
                    {(usersList.valid_roles || []).map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  <LoadingBtn loading={usersBusy} loadingText="..." onClick={addUserManually} small
                    style={{ background: T.ok, color: "#fff", border: "none", fontWeight: 700 }}>
                    ➕ إضافة
                  </LoadingBtn>
                </div>
              </div>

              <div style={{ maxHeight: 320, overflow: "auto", borderRadius: 6, border: "1px solid " + T.brd }}>
                {(usersList.users || []).length === 0 ? (
                  <div style={{ padding: 14, textAlign: "center", color: T.textMut, fontSize: FS - 2 }}>
                    مفيش users في cfg.users — أضف أول user من الفورم فوق.
                  </div>
                ) : (
                  (usersList.users || []).map((u, i) => (
                    <div key={u.uid || i} style={{
                      padding: 8, fontSize: FS - 2,
                      borderBottom: i < usersList.users.length - 1 ? "1px solid " + T.brd : "none",
                      display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 130px 80px",
                      gap: 6, alignItems: "center",
                    }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>
                          {u.auth_info?.displayName || u.email || u.uid}
                          {u.uid === myPerms?.uid && <span style={{ marginInlineStart: 6, color: T.accent }}>(أنت)</span>}
                        </div>
                        <div style={{ fontSize: FS - 3, color: T.textMut, fontFamily: "monospace" }}>
                          {u.email}{u.email && u.uid ? " · " : ""}{u.uid && u.uid.slice(0, 18) + "..."}
                        </div>
                        {u.auth_info?.lastSignInTime && (
                          <div style={{ fontSize: FS - 3, color: T.textMut }}>
                            آخر دخول: {new Date(u.auth_info.lastSignInTime).toLocaleString("ar-EG")}
                          </div>
                        )}
                      </div>
                      <select
                        value={u.role || "viewer"}
                        onChange={(e) => setUserRole(u.uid, u.email, e.target.value)}
                        disabled={u.uid === myPerms?.uid}
                        style={{ padding: "6px 10px", border: "1px solid " + T.brd, borderRadius: 6, background: T.inputBg, color: T.text, fontSize: FS - 2 }}
                      >
                        {(usersList.valid_roles || []).map(r => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                      <LoadingBtn loading={usersBusy} loadingText="..." onClick={() => removeUser(u.uid, u.email)} small
                        disabled={u.uid === myPerms?.uid}
                        style={{ background: T.err, color: "#fff", border: "none", fontWeight: 700 }}>
                        🗑 حذف
                      </LoadingBtn>
                    </div>
                  ))
                )}
              </div>
              <div style={{ marginTop: 6, fontSize: FS - 3, color: T.textMut }}>
                إجمالي: {usersList.total} user · بـ role admin: {(usersList.users || []).filter(u => u.role === "admin").length}
              </div>
            </>
          )}
        </div>
      )}

      {(showSplitWarning || splitResult?.ok) && (
        <div style={{
          padding: 12,
          marginBottom: 12,
          background: splitDone ? T.ok + "10" : T.warn + "10",
          border: "1.5px solid " + (splitDone ? T.ok : T.warn) + "40",
          borderRadius: 10,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div>
              <div style={{ fontWeight: 800, color: splitDone ? T.ok : T.warn, fontSize: FS }}>
                {splitDone ? "✅ تم تقسيم Shopify Products + Customers" : "✂️ ينصح بـ تقسيم البيانات"}
              </div>
              <div style={{ fontSize: FS - 2, color: T.textSec, marginTop: 4, lineHeight: 1.7 }}>
                {splitDone
                  ? "البيانات في collections منفصلة. الـ factory/config doc مش هـ يضرب الحد الأقصى."
                  : `factory/config = ${docPct}% من الحد. shopifyProducts + shopifyCustomers بـ يأخذوا ~80% من الحجم. التقسيم بـ ينقلهم لـ collections منفصلة (آمن + idempotent + مع backup).`}
              </div>
            </div>
            {!splitDone && (
              <LoadingBtn loading={splitBusy} loadingText="جاري التقسيم..." onClick={runSplitMigration} disabled={!canEdit} small
                style={{ background: T.warn, color: "#fff", border: "none", fontWeight: 800 }}>
                ✂️ ابدأ التقسيم
              </LoadingBtn>
            )}
          </div>
          {splitResult?.ok && !splitResult.skipped && (
            <div style={{ marginTop: 10, padding: 8, background: T.ok + "08", borderRadius: 6, fontSize: FS - 2 }}>
              📦 منتجات اتنقلوا: <b>{splitResult.products_migrated}</b> · 👥 عملاء: <b>{splitResult.customers_migrated}</b>
              {" · "}وفّرنا <b style={{ color: T.ok }}>{splitResult.freed_kb} KB</b> ({splitResult.freed_pct}%)
              {splitResult.backup_doc_id && (
                <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 4 }}>
                  Backup: <code>{splitResult.backup_doc_id}</code>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* V21.9.22: Force-split for shopifyPendingOrders (V21.9.18 fallback) */}
      {(showOrdersForceButton || ordersResult?.ok) && (
        <div style={{
          padding: 12,
          marginBottom: 12,
          background: ordersResult?.ok ? T.ok + "10" : "#DC2626" + "12",
          border: "1.5px solid " + (ordersResult?.ok ? T.ok : "#DC2626") + "60",
          borderRadius: 10,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 800, color: ordersResult?.ok ? T.ok : "#DC2626", fontSize: FS }}>
                {ordersResult?.ok ? "✅ تم تقسيم طلبات Shopify" : "🚨 تقسيم طلبات Shopify لسه ما اشتغلش"}
              </div>
              <div style={{ fontSize: FS - 2, color: T.textSec, marginTop: 4, lineHeight: 1.7 }}>
                {ordersResult?.ok
                  ? `الطلبات اتنقلوا لـ shopifyOrdersDays/{date} docs منفصلة. الـ factory/config ما هـ يضرب الحد الأقصى تاني.`
                  : `الـ array \`shopifyPendingOrders\` لسه فيه ${pendingOrdersArrSize?.count || 0} طلب على factory/config. الـ migration الـ auto كان المفروض تشتغل من V21.9.18 — اضغط الزر ده لتشغيلها يدوياً (force-migration). آمن + idempotent + مع backup كامل.`}
              </div>
            </div>
            {!ordersResult?.ok && (
              <LoadingBtn loading={ordersBusy} loadingText="جاري التقسيم..." onClick={runOrdersSplitMigration} disabled={!canEdit} small
                style={{ background: "#DC2626", color: "#fff", border: "none", fontWeight: 800 }}>
                ✂️ شغّل التقسيم الآن
              </LoadingBtn>
            )}
          </div>
          {ordersResult?.ok && ordersResult.total_migrated > 0 && (
            <div style={{ marginTop: 10, padding: 8, background: T.ok + "08", borderRadius: 6, fontSize: FS - 2 }}>
              📦 طلبات اتنقلوا: <b>{ordersResult.total_migrated}</b> · 📅 أيام: <b>{ordersResult.days_created}</b>
              {" · "}وفّرنا <b style={{ color: T.ok }}>{ordersResult.freed_kb} KB</b>
              {ordersResult.backup_doc_id && (
                <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 4 }}>
                  Backup: <code>{ordersResult.backup_doc_id}</code>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* V21.9.45: Confirmed Transfers Repair — on-demand maintenance tool.
          Detects approved transfers that lost their treasury legs to a silent
          syncAllSplitChanges failure. Always available as a tool — runs a fast
          scan when invoked. */}
      <div style={{
        padding: 12,
        marginBottom: 12,
        background: transferRepairResult?.ok ? T.ok + "10" : T.brd + "12",
        border: "1.5px solid " + (transferRepairResult?.ok ? T.ok : T.brd),
        borderRadius: 10,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 800, color: transferRepairResult?.ok ? T.ok : T.text, fontSize: FS }}>
              {transferRepairResult?.ok
                ? "✅ تم إصلاح التحويلات الناقصة"
                : "🔧 إصلاح التحويلات المعتمدة بـ legs ناقصة"}
            </div>
            <div style={{ fontSize: FS - 2, color: T.textSec, marginTop: 4, lineHeight: 1.7 }}>
              {transferRepairResult?.ok
                ? `أنشأنا ${transferRepairResult.legs_created} leg جديد (${transferRepairResult.legs_out_created} debit + ${transferRepairResult.legs_in_created} credit) لـ ${transferRepairResult.transfers_with_missing_legs} تحويل. الـ legs دلوقتي في السجلات.`
                : `لو وافقت على transfer لكن مظهرش في السجلات (السيناريو: tf.status="confirmed" بس الـ legs مفقودة)، اضغط الزر لـ scan + إصلاح. الـ Tool يقرأ كل التحويلات المعتمدة، يحدد المفقودين، ويـ create الـ legs مع merge آمن (مش overwrite). Idempotent — آمن لو ضغطته مرتين.`}
            </div>
            {transferRepairScan && !transferRepairResult?.ok && (
              <div style={{ marginTop: 6, padding: 6, background: T.brd + "20", borderRadius: 6, fontSize: FS - 3 }}>
                آخر scan: {transferRepairScan.transfers_scanned} transfer اتفحصوا · {transferRepairScan.transfers_with_missing_legs} ناقصها legs · {transferRepairScan.legs_to_create} leg محتاج إنشاء
              </div>
            )}
          </div>
          {!transferRepairResult?.ok && (
            <LoadingBtn loading={transferRepairBusy} loadingText="جاري الفحص..." onClick={scanTransferRepair} disabled={!canEdit} small
              style={{ background: T.text, color: "#fff", border: "none", fontWeight: 800 }}>
              🔧 فحص + إصلاح
            </LoadingBtn>
          )}
        </div>
        {transferRepairResult?.ok && transferRepairResult.legs_created > 0 && transferRepairResult.sample_repaired && (
          <div style={{ marginTop: 10, padding: 8, background: T.ok + "08", borderRadius: 6, fontSize: FS - 2 }}>
            🔍 عينة من التحويلات اللي اتصلحت:
            <ul style={{ marginTop: 4, paddingInlineStart: 20 }}>
              {transferRepairResult.sample_repaired.slice(0, 5).map((t, i) => (
                <li key={i} style={{ marginTop: 2 }}>
                  <b>{t.amount}</b> ج.م — {t.from} → {t.to} ({t.date}) <span style={{ color: T.textMut }}>[{t.missing}]</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* V21.9.44: Recurring Treasury Migration banner.
          Addresses cross-device stale-write loss of recurringTreasury rules. */}
      {(showRecurringButton || recurringResult?.ok) && (
        <div style={{
          padding: 12,
          marginBottom: 12,
          background: recurringResult?.ok ? T.ok + "10" : T.warn + "12",
          border: "1.5px solid " + (recurringResult?.ok ? T.ok : T.warn) + "60",
          borderRadius: 10,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 800, color: recurringResult?.ok ? T.ok : T.warn, fontSize: FS }}>
                {recurringResult?.ok
                  ? "✅ تم نقل قواعد الـ Recurring Treasury"
                  : "🔁 قواعد الـ Recurring Treasury لسه في factory/config — معرّضة للاختفاء بين الأجهزة"}
              </div>
              <div style={{ fontSize: FS - 2, color: T.textSec, marginTop: 4, lineHeight: 1.7 }}>
                {recurringResult?.ok
                  ? `الـ rules اتنقلوا لـ recurringTreasuryDocs/{id} (per-id collection). الكتابات من device تاني ما تقدرش تـ overwrite الـ rules دلوقتي.`
                  : `الـ array \`factory/config.recurringTreasury\` فيه ${recurringArrEntries} قاعدة. الـ field ده مش محمي بـ split ولا partitioned، فلو حد سجل قاعدة جديدة من موبيل وفي نفس الوقت device تاني عمل save بـ stale config، الـ قاعدة الجديدة بـ تتمسح (السيناريو اللي حصل قبل V21.9.44). اضغط الزر لنقلهم لـ per-id collection (آمن + idempotent + backup).`}
              </div>
            </div>
            {!recurringResult?.ok && (
              <LoadingBtn loading={recurringBusy} loadingText="جاري النقل..." onClick={runRecurringMigration} disabled={!canEdit} small
                style={{ background: T.warn, color: "#fff", border: "none", fontWeight: 800 }}>
                🔁 ابدأ نقل القواعد
              </LoadingBtn>
            )}
          </div>
          {recurringResult?.ok && recurringResult.rules_migrated >= 0 && (
            <div style={{ marginTop: 10, padding: 8, background: T.ok + "08", borderRadius: 6, fontSize: FS - 2 }}>
              🔁 قواعد اتنقلت: <b>{recurringResult.rules_migrated}</b>
              {" · "}موجودة بالفعل: <b>{recurringResult.rules_skipped_existing}</b>
              {" · "}وفّرنا <b style={{ color: T.ok }}>{recurringResult.freed_kb} KB</b>
              {recurringResult.backup_doc_id && (
                <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 4 }}>
                  Backup: <code>{recurringResult.backup_doc_id}</code>
                </div>
              )}
            </div>
          )}
          {recurringResult?.partial && (
            <div style={{ marginTop: 10, padding: 8, background: T.warn + "10", borderRadius: 6, fontSize: FS - 2, color: T.warn }}>
              ⚠️ Migration partial — flag NOT set.
              نجح: <b>{recurringResult.rules_migrated}</b> · فشل: <b>{recurringResult.rules_failed}</b>
            </div>
          )}
        </div>
      )}

      {/* V21.9.42: Legacy Orders Migration banner — HIGHEST PRIORITY when active.
          This addresses the user-reported "factory/config = 1MB → writes fail" bug.
          Show whenever the legacy array still has entries (regardless of doc%) so
          users can proactively migrate before hitting the wall. */}
      {(showLegacyOrdersButton || legacyOrdersResult?.ok) && (
        <div style={{
          padding: 12,
          marginBottom: 12,
          background: legacyOrdersResult?.ok ? T.ok + "10" : "#DC2626" + "12",
          border: "1.5px solid " + (legacyOrdersResult?.ok ? T.ok : "#DC2626") + "60",
          borderRadius: 10,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 800, color: legacyOrdersResult?.ok ? T.ok : "#DC2626", fontSize: FS }}>
                {legacyOrdersResult?.ok
                  ? "✅ تم نقل الـ Legacy Orders"
                  : "🚨 Legacy Orders في factory/config — السبب الجذري لمشكلة 'الملف ١ ميجا'"}
              </div>
              <div style={{ fontSize: FS - 2, color: T.textSec, marginTop: 4, lineHeight: 1.7 }}>
                {legacyOrdersResult?.ok
                  ? `الطلبات اتنقلوا لـ seasons/{season}/orders/{id} subcollection. الـ factory/config ما هـ يضرب الـ 1MB تاني بسبب الـ orders.`
                  : `الـ array \`factory/config.orders\` فيه ${legacyOrdersArrSize?.count || "؟"} طلب (${legacyOrdersArrSize ? Math.round(legacyOrdersArrSize.est_bytes / 1024) : "؟"} KB). الـ orders المفروض تعيش في \`seasons/{season}/orders/{id}\` subcollection منذ V18.60، لكن الـ array الـ legacy لسه موجود وبـ يكبر مع كل save. هذا هو السبب اللي بـ يخلي محاسب الخزنة بـ يـ get "حجم البيانات تجاوز الحد". اضغط الزر لتشغيل الـ migration (آمن + dry-run + backup كامل + idempotent).`}
              </div>
            </div>
            {!legacyOrdersResult?.ok && (
              <LoadingBtn loading={legacyOrdersBusy} loadingText="جاري النقل..." onClick={runLegacyOrdersMigration} disabled={!canEdit} small
                style={{ background: "#DC2626", color: "#fff", border: "none", fontWeight: 800 }}>
                📦 ابدأ نقل الـ Orders
              </LoadingBtn>
            )}
          </div>
          {legacyOrdersResult?.ok && legacyOrdersResult.orders_migrated > 0 && (
            <div style={{ marginTop: 10, padding: 8, background: T.ok + "08", borderRadius: 6, fontSize: FS - 2 }}>
              📦 طلبات اتنقلت: <b>{legacyOrdersResult.orders_migrated}</b>
              {" · "}🔁 موجود بالفعل: <b>{legacyOrdersResult.orders_skipped_existing}</b>
              {" · "}وفّرنا <b style={{ color: T.ok }}>{legacyOrdersResult.freed_kb} KB</b>
              {" "}({legacyOrdersResult.freed_pct}%)
              {legacyOrdersResult.backup_doc_id && (
                <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 4 }}>
                  Backup: <code>{legacyOrdersResult.backup_doc_id}</code>
                </div>
              )}
            </div>
          )}
          {legacyOrdersResult?.partial && (
            <div style={{ marginTop: 10, padding: 8, background: T.warn + "10", borderRadius: 6, fontSize: FS - 2, color: T.warn }}>
              ⚠️ Migration partial — flag NOT set, cfg.orders preserved.
              نجح: <b>{legacyOrdersResult.orders_migrated}</b> · فشل: <b>{legacyOrdersResult.orders_failed}</b>
              {legacyOrdersResult.sample_failures?.length > 0 && (
                <ul style={{ marginTop: 6, paddingInlineStart: 20, fontSize: FS - 3 }}>
                  {legacyOrdersResult.sample_failures.slice(0, 5).map((f, i) => (
                    <li key={i} style={{ color: T.err }}><code>{f}</code></li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* V21.9.22: Treasury duplicate cleanup banner — always available as a tool */}
      {dedupeResult && (
        <div style={{
          padding: 12,
          marginBottom: 12,
          background: T.ok + "10",
          border: "1.5px solid " + T.ok + "40",
          borderRadius: 10,
        }}>
          <div style={{ fontWeight: 800, color: T.ok, fontSize: FS }}>
            ✅ Treasury Cleanup
          </div>
          {dedupeResult.duplicates_found === 0 ? (
            <div style={{ fontSize: FS - 2, color: T.textSec, marginTop: 4 }}>
              مفيش duplicates. الـ ledger نظيف ✨
            </div>
          ) : (
            <div style={{ marginTop: 6, padding: 8, background: T.ok + "08", borderRadius: 6, fontSize: FS - 2 }}>
              🧹 entries اتحذفت: <b>{dedupeResult.entries_removed}</b> · transfers متأثرة: <b>{dedupeResult.duplicates_found}</b>
              {dedupeResult.backup_doc_id && (
                <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 4 }}>
                  Backup: <code>{dedupeResult.backup_doc_id}</code>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <div style={{ padding: 10, background: T.err + "10", color: T.err, borderRadius: 8, fontSize: FS - 2 }}>
          ⛔ {error}
        </div>
      )}

      {report && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{
            padding: 14,
            background: sevColor(report.overall_severity) + "12",
            border: "2px solid " + sevColor(report.overall_severity) + "40",
            borderRadius: 10,
            display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10,
          }}>
            <div>
              <div style={{ fontSize: FS + 1, fontWeight: 800, color: sevColor(report.overall_severity) }}>
                {sevIcon(report.overall_severity)} الحالة العامة: {sevLabel(report.overall_severity)}
              </div>
              <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 4 }}>
                {new Date(report.generated_at).toLocaleString("ar-EG")}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {["ok", "info", "warn", "error", "critical"].map(s => (
                report.summary[s] > 0 && (
                  <span key={s} style={{
                    padding: "2px 8px", borderRadius: 6,
                    background: sevColor(s) + "20", color: sevColor(s),
                    fontSize: FS - 3, fontWeight: 700,
                  }}>
                    {sevIcon(s)} {report.summary[s]}
                  </span>
                )
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 800, marginBottom: 8, fontSize: FS, color: T.text }}>💾 المخزن</div>
            <div style={{ marginBottom: 8, padding: 10, background: T.bg, borderRadius: 8 }}>
              <div style={{ fontSize: FS - 2, marginBottom: 6 }}>
                Document <code>factory/config</code>: <b>{fmtBytes(report.storage.config_doc_bytes)}</b>
                {" "}({report.storage.config_doc_pct_of_max}% من الحد الأقصى 1 MB)
              </div>
              <div style={{ height: 8, background: T.brd, borderRadius: 4, overflow: "hidden" }}>
                <div style={{
                  width: Math.min(100, report.storage.config_doc_pct_of_max) + "%",
                  height: "100%",
                  background: sevColor(report.storage.config_doc_pct_of_max >= 80 ? "critical" : report.storage.config_doc_pct_of_max >= 60 ? "error" : report.storage.config_doc_pct_of_max >= 40 ? "warn" : "ok"),
                  transition: "width 300ms",
                }} />
              </div>
            </div>

            <div style={{ marginTop: 8 }}>
              <div style={{ fontWeight: 700, marginBottom: 4, fontSize: FS - 1 }}>أكبر 8 مصفوفات:</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {report.storage.arrays.slice(0, 8).map(a => (
                  <div key={a.name} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "5px 10px", background: T.cardSolid, borderRadius: 6,
                    border: "1px solid " + (a.severity === "ok" ? T.brd : sevColor(a.severity) + "40"),
                  }}>
                    <span style={{ fontSize: FS - 2 }}>
                      <span style={{ color: sevColor(a.severity), marginInlineEnd: 6 }}>{sevIcon(a.severity)}</span>
                      <b>{a.label}</b> · {a.count} عنصر
                    </span>
                    <span style={{ fontSize: FS - 3, fontFamily: "monospace", color: T.textMut }}>
                      {fmtBytes(a.est_bytes)} · {a.pct_of_doc}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {report.storage.archive_collections.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 700, marginBottom: 4, fontSize: FS - 1 }}>Archive collections:</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {report.storage.archive_collections.map(c => (
                    <div key={c.name} style={{ padding: "5px 10px", background: T.cardSolid, borderRadius: 6, border: "1px solid " + T.brd, fontSize: FS - 2 }}>
                      <code>{c.name}</code> — <b>{c.doc_count}</b> doc · ~{fmtBytes(c.est_total_bytes)}
                      {c.error && <span style={{ color: T.err }}> · {c.error}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <div style={{ fontWeight: 800, marginBottom: 8, fontSize: FS, color: T.text }}>🔌 الاتصالات</div>
            <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 1fr", gap: 8 }}>
              <div style={{ padding: 10, background: sevColor(report.connections.shopify.severity) + "10", borderRadius: 8, border: "1px solid " + sevColor(report.connections.shopify.severity) + "40" }}>
                <div style={{ fontWeight: 700, fontSize: FS - 1 }}>
                  {sevIcon(report.connections.shopify.severity)} Shopify
                </div>
                <div style={{ fontSize: FS - 3, color: T.textSec, marginTop: 4 }}>
                  {report.connections.shopify.configured ? "✓ متصل" : "✕ مش متصل"}
                  {report.connections.shopify.age_hours != null && (
                    <> · آخر sync: {report.connections.shopify.age_hours}h</>
                  )}
                </div>
              </div>
              <div style={{ padding: 10, background: sevColor(report.connections.bosta.severity) + "10", borderRadius: 8, border: "1px solid " + sevColor(report.connections.bosta.severity) + "40" }}>
                <div style={{ fontWeight: 700, fontSize: FS - 1 }}>
                  {sevIcon(report.connections.bosta.severity)} Bosta
                </div>
                <div style={{ fontSize: FS - 3, color: T.textSec, marginTop: 4 }}>
                  {report.connections.bosta.configured ? "✓ متصل" : "○ غير معدّ"}
                  {" · webhook: "}{report.connections.bosta.has_webhook ? "✓" : "✕"}
                </div>
              </div>
            </div>
          </div>

          {report.critical.length > 0 && (
            <div>
              <div style={{ fontWeight: 800, marginBottom: 8, fontSize: FS, color: T.text }}>🚨 تنبيهات حرجة</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {report.critical.map((c, i) => (
                  <div key={i} style={{
                    padding: 10,
                    borderRadius: 8,
                    background: sevColor(c.severity) + "10",
                    border: "1px solid " + sevColor(c.severity) + "40",
                    borderInlineStart: "4px solid " + sevColor(c.severity),
                  }}>
                    <div style={{ fontWeight: 700, color: sevColor(c.severity), fontSize: FS - 1 }}>
                      {sevIcon(c.severity)} {sevLabel(c.severity)}
                    </div>
                    <div style={{ fontSize: FS - 2, color: T.text, marginTop: 4 }}>
                      {c.message}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* V21.9.22: Maintenance tools section — always available for admin */}
          {canEdit && (
            <div>
              <div style={{ fontWeight: 800, marginBottom: 8, fontSize: FS, color: T.text }}>🛠 أدوات الصيانة</div>
              <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 1fr", gap: 8 }}>
                <div style={{ padding: 10, background: T.bg, borderRadius: 8, border: "1px solid " + T.brd }}>
                  <div style={{ fontWeight: 700, fontSize: FS - 1, marginBottom: 4 }}>
                    🧹 تنظيف Treasury Duplicates
                  </div>
                  <div style={{ fontSize: FS - 3, color: T.textSec, marginBottom: 8, lineHeight: 1.6 }}>
                    لو عندك تحويلات قديمة من قبل V21.9.14 ممكن تكون مكررة بسبب race condition قديم. الأداة بـ تـ scan + تحذف الـ duplicates مع backup.
                  </div>
                  <LoadingBtn loading={dedupeBusy} loadingText="جاري الفحص..." onClick={runTreasuryDedupe} small
                    style={{ background: T.warn, color: "#fff", border: "none", fontWeight: 700, width: "100%" }}>
                    🧹 فحص + تنظيف
                  </LoadingBtn>
                </div>
                {!ordersSplitDone && (
                  <div style={{ padding: 10, background: T.bg, borderRadius: 8, border: "1px solid " + T.brd }}>
                    <div style={{ fontWeight: 700, fontSize: FS - 1, marginBottom: 4 }}>
                      ✂️ Force-Split Shopify Orders
                    </div>
                    <div style={{ fontSize: FS - 3, color: T.textSec, marginBottom: 8, lineHeight: 1.6 }}>
                      لو الـ V21.9.18 auto-migration ما اشتغلتش، اضغط هنا لتشغيلها يدوياً. هـ ينقل الـ shopifyPendingOrders لـ shopifyOrdersDays/{"{date}"} منفصلة.
                    </div>
                    <LoadingBtn loading={ordersBusy} loadingText="جاري التقسيم..." onClick={runOrdersSplitMigration} small
                      style={{ background: "#DC2626", color: "#fff", border: "none", fontWeight: 700, width: "100%" }}>
                      ✂️ شغّل Migration
                    </LoadingBtn>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {!report && !error && (
        <div style={{ padding: 30, textAlign: "center", color: T.textMut, border: "2px dashed " + T.brd, borderRadius: 10 }}>
          <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.4 }}>🩺</div>
          <div>اضغط "شغّل فحص شامل" لتقرير الحالة الكاملة</div>
        </div>
      )}
    </Card>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   BridgeStatusCard (V21.9.35)
   ─────────────────────────────────────────────────────────────────────
   Live WhatsApp Bridge dashboard inside CLARK. Polls /status every 3s
   when expanded. Shows:
   • Connection health: waReady, queueRunning, queuePaused
   • Daily counter: sent / cap (with progress bar)
   • Queue: pending / sending / sent / failed / skipped
   • Recent activity (last 20 with timestamps + reasons)
   • Pause / Resume / Clear / Reset-Daily controls
   • Link to open bridge dashboard directly

   This is the single most actionable diagnostic for "messages don't
   send" complaints. Before V21.9.35 the user had no visibility into
   why the bridge was silently dropping messages. Now they can see the
   exact reason (queuePaused, daily cap, WhatsApp not connected, etc.).
   ───────────────────────────────────────────────────────────────────── */
function BridgeStatusCard({ data, canEdit }){
  const bridgeUrl = data?.campaignBridge?.url || "";
  const bridgeToken = data?.campaignBridge?.token || "";
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState(null);
  const [activity, setActivity] = useState([]);
  const [optoutsCount, setOptoutsCount] = useState(null);
  const [err, setErr] = useState("");
  const [actionBusy, setActionBusy] = useState("");

  /* Poll status + activity every 3s when expanded. Stops when collapsed
     so we don't waste bandwidth on a background card. */
  useEffect(() => {
    if(!expanded || !bridgeUrl) return;
    let dead = false;
    const tick = async () => {
      try {
        const [s, a] = await Promise.all([
          waBridge.status(bridgeUrl, bridgeToken),
          waBridge.activity(bridgeUrl, bridgeToken, 20).catch(() => ({ activity: [] })),
        ]);
        if(dead) return;
        setStatus(s);
        setActivity(a.activity || []);
        setOptoutsCount(s.optOutsCount ?? null);
        setErr("");
      } catch(e){
        if(!dead) setErr(e.message || "فشل الاتصال");
      }
    };
    tick();
    const iv = setInterval(tick, 3000);
    return () => { dead = true; clearInterval(iv); };
  }, [expanded, bridgeUrl, bridgeToken]);

  const handleAction = async (kind) => {
    if(actionBusy) return;
    if(kind === "clear" && !confirm("Clear الـ queue من الـ completed/failed entries؟")) return;
    if(kind === "stop"  && !confirm("Stop الـ queue كله؟ كل الرسائل الـ pending هـ تتلغى.")) return;
    if(kind === "reset" && !confirm("Reset الـ daily counter لـ 0؟ استخدمها فقط لو محتاج تبعت أكتر من الـ cap اليومي.")) return;
    setActionBusy(kind);
    try {
      if(kind === "pause")  await waBridge.pause(bridgeUrl, bridgeToken);
      if(kind === "resume") await waBridge.resume(bridgeUrl, bridgeToken);
      if(kind === "clear")  await waBridge.clear(bridgeUrl, bridgeToken);
      if(kind === "stop")   await waBridge.stop(bridgeUrl, bridgeToken);
      if(kind === "reset")  await waBridge.resetDaily(bridgeUrl, bridgeToken);
      showToast("✅ " + kind + " — done");
      /* Force a status refresh */
      const s = await waBridge.status(bridgeUrl, bridgeToken);
      setStatus(s);
    } catch(e){
      showToast("⛔ " + e.message);
    } finally {
      setActionBusy("");
    }
  };

  /* Don't show the card if no bridge is configured */
  if(!bridgeUrl) return null;

  /* Compact summary line — shown when collapsed */
  const summaryColor = !status ? T.textMut
    : status.waReady === false ? "#DC2626"
    : status.queuePaused ? "#F59E0B"
    : "#10B981";
  const summaryIcon = !status ? "🌉"
    : status.waReady === false ? "🔴"
    : status.queuePaused ? "⏸"
    : "🟢";
  const summaryText = !status ? "Bridge — اضغط للفتح"
    : status.waReady === false ? "WhatsApp مش متصل!"
    : status.queuePaused ? "Bridge موقّف (paused)"
    : `Bridge شغّال · ${status.daily?.sent || 0}/${status.settings?.dailyCap || 50} اليوم · ${status.queue?.pending || 0} pending`;

  return (
    <Card title={
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span>🌉 WhatsApp Bridge Status</span>
        <span style={{ fontSize: FS - 3, fontWeight: 400, color: T.textMut }}>(V21.9.35)</span>
      </span>
    } extra={
      <Btn small onClick={() => setExpanded(e => !e)}>
        {expanded ? "▲ إخفاء" : "▼ عرض"}
      </Btn>
    }>
      {/* Summary line — always shown */}
      <div style={{
        padding: "10px 14px",
        background: summaryColor + "15",
        border: "1.5px solid " + summaryColor + "60",
        borderRadius: 8,
        marginBottom: expanded ? 12 : 0,
        display: "flex", alignItems: "center", gap: 10,
        cursor: "pointer",
      }} onClick={() => setExpanded(e => !e)}>
        <span style={{ fontSize: 22 }}>{summaryIcon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: FS - 1, fontWeight: 700, color: summaryColor }}>{summaryText}</div>
          <div style={{ fontSize: FS - 4, color: T.textMut, marginTop: 2, fontFamily: "monospace" }}>{bridgeUrl}</div>
        </div>
        {err && <span style={{ fontSize: FS - 3, color: T.err }}>⚠ {err}</span>}
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {!status && !err && (
            <div style={{ padding: 20, textAlign: "center", color: T.textMut, fontSize: FS - 2 }}>
              ⏳ جاري التحميل...
            </div>
          )}

          {status && (
            <>
              {/* Health row — 3 indicators */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
                <StatusPill label="WhatsApp" value={status.waReady ? "متصل" : "غير متصل"} color={status.waReady ? "#10B981" : "#DC2626"} />
                <StatusPill label="Queue" value={status.queueRunning ? "بـ يـ process" : (status.queuePaused ? "موقّف" : "خامل")} color={status.queueRunning ? "#10B981" : (status.queuePaused ? "#F59E0B" : T.textMut)} />
                <StatusPill label="State" value={status.waState || "—"} color="#6366F1" />
              </div>

              {/* Daily counter with progress bar */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: FS - 2, fontWeight: 700, color: T.text }}>📅 الحد اليومي</span>
                  <span style={{ fontSize: FS - 2, fontFamily: "monospace", color: T.textSec }}>
                    {status.daily?.sent || 0} / {status.settings?.dailyCap || 50}
                  </span>
                </div>
                <div style={{ height: 8, background: T.brd, borderRadius: 4, overflow: "hidden" }}>
                  <div style={{
                    width: Math.min(100, ((status.daily?.sent || 0) / (status.settings?.dailyCap || 50)) * 100) + "%",
                    height: "100%",
                    background: (status.daily?.sent || 0) >= (status.settings?.dailyCap || 50) ? "#DC2626" : "#10B981",
                    transition: "width 0.3s",
                  }} />
                </div>
              </div>

              {/* Queue stats — 5 cells */}
              <div>
                <div style={{ fontSize: FS - 2, fontWeight: 700, color: T.text, marginBottom: 6 }}>📊 الـ Queue</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, fontSize: FS - 3 }}>
                  <QueueStat label="pending" value={status.queue?.pending || 0} color="#F59E0B" />
                  <QueueStat label="sending" value={status.queue?.sending || 0} color="#0EA5E9" />
                  <QueueStat label="sent" value={status.queue?.sent || 0} color="#10B981" />
                  <QueueStat label="failed" value={status.queue?.failed || 0} color="#DC2626" />
                  <QueueStat label="skipped" value={status.queue?.skipped || 0} color="#6B7280" />
                </div>
                {optoutsCount != null && (
                  <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 6 }}>
                    🚫 Opt-outs: <b>{optoutsCount}</b> · إجمالي الـ queue: <b>{status.queue?.total || 0}</b>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              {canEdit && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {status.queuePaused ? (
                    <Btn small primary disabled={actionBusy} onClick={() => handleAction("resume")}>
                      {actionBusy === "resume" ? "⏳..." : "▶ Resume"}
                    </Btn>
                  ) : (
                    <Btn small disabled={actionBusy} onClick={() => handleAction("pause")}>
                      {actionBusy === "pause" ? "⏳..." : "⏸ Pause"}
                    </Btn>
                  )}
                  <Btn small disabled={actionBusy} onClick={() => handleAction("clear")}>
                    {actionBusy === "clear" ? "⏳..." : "🗑 Clear Completed"}
                  </Btn>
                  <Btn small disabled={actionBusy} onClick={() => handleAction("reset")}>
                    {actionBusy === "reset" ? "⏳..." : "🔄 Reset Daily"}
                  </Btn>
                  <Btn small ghost danger disabled={actionBusy} onClick={() => handleAction("stop")}>
                    {actionBusy === "stop" ? "⏳..." : "⛔ Stop All"}
                  </Btn>
                  <Btn small onClick={() => window.open(bridgeUrl, "_blank")}>
                    🌐 افتح Dashboard
                  </Btn>
                </div>
              )}

              {/* Recent activity */}
              {activity.length > 0 && (
                <div>
                  <div style={{ fontSize: FS - 2, fontWeight: 700, color: T.text, marginBottom: 6 }}>
                    📜 آخر {activity.length} رسالة:
                  </div>
                  <div style={{
                    maxHeight: 240, overflowY: "auto",
                    border: "1px solid " + T.brd, borderRadius: 6,
                    background: T.bg,
                  }}>
                    {activity.map((a, i) => (
                      <ActivityRow key={i} item={a} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function StatusPill({ label, value, color }){
  return (
    <div style={{
      padding: "8px 10px",
      background: color + "10",
      border: "1px solid " + color + "40",
      borderRadius: 6,
    }}>
      <div style={{ fontSize: FS - 4, color: T.textMut, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: FS - 1, color, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function QueueStat({ label, value, color }){
  return (
    <div style={{
      padding: "6px 4px",
      textAlign: "center",
      background: color + "10",
      border: "1px solid " + color + "30",
      borderRadius: 6,
    }}>
      <div style={{ fontSize: FS, color, fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: FS - 4, color: T.textMut }}>{label}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   StorageDiagnosticCard (V21.9.72)
   ───────────────────────────────────────────────────────────────────────
   Self-diagnostic for "فشل رفع الصورة: storage/unauthorized" reports.

   Why this exists: The user (Ahmed) reported template + campaign image
   uploads failing with `storage/unauthorized` even though he is the
   bootstrap admin (UID matches the hardcoded bootstrap admin in
   storage.rules → should bypass ALL role checks). Earlier diagnostic
   attempts pointed him at Firebase Console → Rules Playground, but he
   doesn't have the technical context to run that flow. This card moves
   the diagnostic INTO the app:
     • One button → attempts a real upload to templates/_diag/timestamp.txt
     • Reports the exact failure code, message, path, content-type, size
     • Shows the user's UID, email, client-side role
     • Compares UID against the hardcoded bootstrap admin UID
     • Surfaces the likely fix (add UID to cfg.users, redeploy rules, etc.)

   The diagnostic uploads a tiny TEXT file (not a JPEG image) to avoid
   wasting Storage egress on real test images — but the path mimics the
   real template upload path so the same Storage rule applies. A 5-byte
   text file is enough to trigger or pass the rule check.
   ═══════════════════════════════════════════════════════════════════════ */
function StorageDiagnosticCard({ data, user, getUserRole }){
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  /* The bootstrap-admin UID hardcoded in firestore.rules + storage.rules.
     If the user's UID matches this, ALL rule checks bypass — uploads must work. */
  const BOOTSTRAP_ADMIN_UID = "fJDTS57ndvVfPozGgwYybKJymuA3";

  /* V21.9.73: run THREE tests with progressively-narrower variables. By comparing
     which pass and which fail, we isolate the exact discriminator:
       A. text-plain to templates/_diag_X/test.txt — baseline (proved Storage open in V21.9.72)
       B. image-jpeg to templates/_diag_X/test.jpg — SAME path-prefix, NEW content-type
       C. image-jpeg to templates/tpl_draft_X/test.jpg — EXACT mimic of the failing real-upload path
     Result matrix:
       A pass, B pass, C pass: bug is in the client upload code (templateImages.js),
                               not the Storage rule. Storage allows everything that should work.
       A pass, B fail        : MIME-type discriminator. image/jpeg specifically denied
                               (rule regex broken, or App Check gates JPG uploads).
       A pass, B pass, C fail: path-prefix discriminator. tpl_draft segment denied
                               specifically (unlikely with allPaths wildcard but possible).
       A fail                : catastrophic — Storage entirely denied (shouldn't happen
                               given V21.9.72 already proved A passed).
     The triple-test removes guesswork from the next iteration.
     NOTE — V21.9.74 build-fix: prior comment used a literal asterisk-slash inside
     the path examples (mimicking the Storage wildcard), which terminated this block
     comment early and broke Vite's esbuild parse. Path examples now use "_X" as the
     placeholder. */
  const runTest = async () => {
    setBusy(true);
    setResult(null);
    const currentUser = (typeof user === "object" && user) ? user : null;
    const uid = currentUser?.uid || "—";
    const email = currentUser?.email || "—";
    const role = (typeof getUserRole === "function") ? (getUserRole() || "viewer") : "—";
    const isBootstrap = uid === BOOTSTRAP_ADMIN_UID;

    /* Dynamically import to avoid a hard dependency from this diagnostic file. */
    let storageMod, refMod, uploadMod, deleteMod;
    try {
      storageMod = await import("../firebase.js");
      const fb = await import("firebase/storage");
      refMod = fb.ref;
      uploadMod = fb.uploadBytes;
      deleteMod = fb.deleteObject;
    } catch(e){
      setResult({ tests: [], phase:"import", error: "فشل تحميل Firebase SDK", uid, email, role, isBootstrap });
      setBusy(false);
      return;
    }

    const storage = storageMod.storage;
    const ts = Date.now();

    /* JPEG SOI + APP0 marker bytes — enough for Firebase Storage to accept as image/jpeg.
       Actual decoded image isn't required for the rule check; only the contentType matters. */
    const jpegBytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);

    const tests = [
      {
        id: "txt_diag",
        label: "A. text/plain → templates/_diag_*/test.txt",
        path: `templates/_diag_${ts}/test_a.txt`,
        blob: new Blob(["diag"], { type: "text/plain" }),
        contentType: "text/plain",
      },
      {
        id: "jpg_diag",
        label: "B. image/jpeg → templates/_diag_*/test.jpg (same path, JPG type)",
        path: `templates/_diag_${ts}/test_b.jpg`,
        blob: new Blob([jpegBytes], { type: "image/jpeg" }),
        contentType: "image/jpeg",
      },
      {
        id: "jpg_tpldraft",
        label: "C. image/jpeg → templates/tpl_draft_*/test.jpg (exact mimic of failing upload)",
        path: `templates/tpl_draft_diag_${ts}/test_c.jpg`,
        blob: new Blob([jpegBytes], { type: "image/jpeg" }),
        contentType: "image/jpeg",
      },
    ];

    const results = [];
    for(const t of tests){
      let err = null, ok = false;
      try {
        const r = refMod(storage, t.path);
        await uploadMod(r, t.blob, { contentType: t.contentType });
        ok = true;
        try { await deleteMod(r); } catch(_){}
      } catch(e){
        err = {
          code: e?.code || "unknown",
          message: e?.message || String(e),
        };
      }
      results.push({ ...t, ok, error: err });
    }

    /* Identify discriminator pattern from the results. */
    const aOk = results[0].ok;
    const bOk = results[1].ok;
    const cOk = results[2].ok;
    let pattern = "unknown";
    let fix = "";
    if(aOk && bOk && cOk){
      pattern = "all_pass";
      fix = "🎉 الـ 3 tests نجحوا — يبقى الـ Storage rules + الـ permissions كلهم سليمين. "
          + "المشكلة في الـ template editor code نفسه — مش في الـ Firebase. "
          + "احتمال: الـ blob من الـ image compression بـ يـ produce blob.type='' (فارغ) → "
          + "بـ يـ default-ـه templateImages.js لـ 'image/jpeg' بـ تنجح المرة، بس عند ال upload "
          + "الفعلي بـ يحدث mismatch مع actual bytes (مش JPEG حقيقي). راجع compressImageToBlob.";
    } else if(aOk && !bOk && !cOk){
      pattern = "jpeg_denied";
      fix = "⚠️ TXT بـ يـ pass بس JPG بـ يـ deny — Storage rule بـ يـ deny image/jpeg specifically. "
          + "احتمال 1: الـ rule's isAllowedMime regex مش matching فعلاً. "
          + "احتمال 2: App Check مـ فعّل + بـ يـ require token للـ image uploads فقط. "
          + "احتمال 3: Firebase Storage quota للـ images متجاوز.";
    } else if(aOk && bOk && !cOk){
      pattern = "path_discriminator";
      fix = "⚠️ نفس content-type بس path مختلف بـ يـ fail — يبقى الـ `tpl_draft_*` prefix بـ يـ trigger "
          + "rule مختلفة. غريب لأن الـ `{allPaths=**}` المفروض يـ match. شوف Firebase Console → Storage → Rules "
          + "وتأكد إن `match /templates/{allPaths=**}` هو اللي مفعّل (مش حاجة أكثر تحديداً).";
    } else if(!aOk){
      pattern = "all_fail";
      fix = "💥 الـ A فشل دلوقتي بس كان نجح في V21.9.72 — حاجة اتغيرت. "
          + "اتأكد من الـ rules في Firebase Console (مفروض الـ V21.9.71 hardcoded). "
          + "أو ممكن الـ auth token expired — sign out + sign in.";
    } else {
      pattern = "partial_other";
      fix = "🔍 نمط غير-متوقع — ابعت screenshot للـ تفاصيل تحت.";
    }

    setResult({ tests: results, uid, email, role, isBootstrap, pattern, fix });
    setBusy(false);
  };

  const r = result;

  return (
    <Card title="🧪 اختبار رفع الصور (Storage Diagnostic)">
      <div style={{ fontSize: FS-2, color: T.textMut, marginBottom: 12, lineHeight: 1.6 }}>
        ٣ tests متتابعة لـ isolate المشكلة: TXT-عام، JPG-بنفس-الـ path، JPG-بـ exact-mimic للـ real path.
        النتيجة بـ تـ tell-ك بالظبط هل المشكلة في الـ content-type، الـ path، ولا في كود الـ upload نفسه.
      </div>
      <LoadingBtn primary loading={busy} loadingText="جاري الاختبار (3 tests)..." onClick={runTest} small>
        🧪 شغّل اختبار الـ Storage (3 سيناريوهات)
      </LoadingBtn>
      {r && (
        <div style={{ marginTop: 14 }}>
          <div style={{ padding: 10, borderRadius: 8, background: T.bg, border: "1px solid " + T.brd, marginBottom: 10, fontSize: FS-2, color: T.text, lineHeight: 1.8 }}>
            <div><b>UID:</b> <code style={{ fontFamily: "monospace", fontSize: FS-3 }}>{r.uid}</code></div>
            <div><b>Email:</b> {r.email}</div>
            <div><b>Role:</b> {r.role}</div>
            <div><b>Bootstrap admin?</b> {r.isBootstrap ? "✅ نعم" : "لا"}</div>
          </div>
          {(r.tests || []).map((t,i) => (
            <div key={i} style={{
              padding: 10, marginBottom: 8, borderRadius: 8,
              background: t.ok ? T.ok+"08" : T.err+"08",
              border: "1px solid " + (t.ok ? T.ok+"40" : T.err+"40"),
            }}>
              <div style={{ fontSize: FS-2, fontWeight: 800, color: t.ok ? T.ok : T.err, marginBottom: 4 }}>
                {t.ok ? "✅" : "❌"} {t.label}
              </div>
              <div style={{ fontSize: FS-3, color: T.textMut, fontFamily: "monospace", wordBreak: "break-all" }}>{t.path}</div>
              {t.error && (
                <div style={{ marginTop: 6, fontSize: FS-3, color: T.err }}>
                  <b>{t.error.code}:</b> {t.error.message}
                </div>
              )}
            </div>
          ))}
          {r.pattern && r.fix && (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 10,
                background: T.accent+"08", border: "1px solid " + T.accent+"40",
                fontSize: FS-2, lineHeight: 1.7, color: T.text }}>
              <div style={{ fontWeight: 800, color: T.accent, marginBottom: 6 }}>التشخيص: {r.pattern}</div>
              {r.fix}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function ActivityRow({ item }){
  const statusColors = {
    sent:    "#10B981",
    failed:  "#DC2626",
    skipped: "#6B7280",
    pending: "#F59E0B",
    sending: "#0EA5E9",
  };
  const color = statusColors[item.status] || T.textMut;
  const time = item.timestamp || item.sentAt;
  const timeStr = time ? new Date(time).toLocaleTimeString("ar-EG", { hour12: false }) : "—";
  return (
    <div style={{
      padding: "6px 10px",
      borderBottom: "1px solid " + T.brd,
      display: "grid",
      gridTemplateColumns: "70px 70px 1fr 1fr",
      gap: 8,
      fontSize: FS - 3,
      alignItems: "center",
    }}>
      <span style={{ color: T.textMut, fontFamily: "monospace" }}>{timeStr}</span>
      <span style={{ color, fontWeight: 700 }}>{item.status}</span>
      <span style={{ fontFamily: "monospace", color: T.textSec, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {item.phone || "—"}
      </span>
      <span style={{ color: T.textSec, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.error || item.customerName || ""}>
        {item.error || item.customerName || "—"}
      </span>
    </div>
  );
}
