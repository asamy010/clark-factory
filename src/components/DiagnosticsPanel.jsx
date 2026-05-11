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
import { fetchDiagnostics, splitShopifyCollections, splitShopifyOrdersDaily, dedupeTreasuryTransfers, auditState, fixFlags, myPermissions, usersPermissions, recoverLegacyData, migrationLog } from "../utils/shopify/shopifyClient.js";
import { collection, getDocs, query, limit } from "firebase/firestore";
import { db } from "../firebase.js";

export function DiagnosticsPanel({ data, canEdit, user, isMob }){
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

  const docPct = report?.storage?.config_doc_pct_of_max || 0;
  const splitDone = !!data?._partitionedV2192Done;
  const showSplitWarning = docPct >= 50 && !splitDone;
  /* V21.9.22: detect if shopifyPendingOrders force-migration is needed.
     Show button whenever the legacy array still has entries (regardless of doc%). */
  const ordersSplitDone = !!data?._splitDaysV2199Done;
  const pendingOrdersArrSize = (report?.storage?.arrays || []).find(a => a.name === "shopifyPendingOrders");
  const showOrdersForceButton = pendingOrdersArrSize && pendingOrdersArrSize.count > 0;

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
  );
}
