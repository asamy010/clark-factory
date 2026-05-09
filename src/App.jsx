import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { auth, db, getSecondaryAuth } from "./firebase";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { doc, setDoc, onSnapshot, collection, addDoc, updateDoc, deleteDoc, getDocs, runTransaction, getDoc } from "firebase/firestore";

/* ─── V15.0 Module imports (refactored from monolith) ─── */
import { APP_VERSION, FKEYS, FCOL, WS_TYPES, COLORS_DB, THEMES, DEFAULT_STATUSES, INIT_CONFIG, GARMENT_ICONS, QUALITY_MAP, FS, PRINT_CSS } from "./constants/index.js";
import { CLARK_LOGO, CLARK_LOGO_PRINT } from "./constants/logo.js";
import { gid, fmt, r2, gf, getSizesFromSet, dayName, openWA } from "./utils/format.js";
import { playBeep } from "./utils/audio.js";
import { compressImage, compressImg43 } from "./utils/image.js";
import { loadXLSX, loadQR, loadJsQR, scanQR, compressFile } from "./utils/qr.js";
import { addAudit } from "./utils/audit.js";
import { setUpConfigCallback as registerAutoPostCallback } from "./utils/accounting/autoPost.js";
import { prefetchIpInfo } from "./utils/device.js";
import { startClockSync } from "./utils/serverTime.js";
import { enforceDataLimits } from "./utils/dataLimits.js";
import { isSafeWrite } from "./utils/dataIntegrity.js";
/* V19.48: Forensic helpers for write fallbacks — categorize errors, estimate
   doc size, build copy-paste forensic lines for bug reports. */
import {
  categorizeWriteError,
  estimateDocSize,
  formatBytes,
  buildForensicLine,
} from "./utils/writeDiagnostics.js";
const FIRESTORE_DOC_WARN_BYTES = 838860; /* ~80% of 1 MiB Firestore limit */
import { createComprehensiveBackup, deleteComprehensiveBackup } from "./utils/comprehensiveBackup.js";
import {
  syncAllSplitChanges, stripSplitArrays, SPLIT_COLLECTIONS, SPLIT_FIELDS,
  SPLIT_FIELDS_V1949, SPLIT_FIELDS_V1950, SPLIT_FIELDS_V1952, SPLIT_FIELDS_V1953,
  SPLIT_FLAG_V1674, SPLIT_FLAG_V1949, SPLIT_FLAG_V1950, SPLIT_FLAG_V1952, SPLIT_FLAG_V1953,
  _deepEqual,/* V19.65: order-independent equality for listener pending-cleanup */
  /* V19.51 — sales-doc + tasks-doc split namespaces */
  SALES_SPLIT_COLLECTIONS, SALES_SPLIT_FIELDS, SALES_SPLIT_FIELDS_V1951, SALES_SPLIT_FLAG_V1951,
  syncAllSalesSplitChanges, stripSalesSplitArrays,
  TASKS_SPLIT_COLLECTIONS, TASKS_SPLIT_FIELDS, TASKS_SPLIT_FIELDS_V1951, TASKS_SPLIT_FLAG_V1951,
  syncAllTasksSplitChanges, stripTasksSplitArrays,
} from "./utils/splitCollections.js";
import {
  syncAllPartitionedChanges, stripPartitionedArrays,
  PARTITIONED_COLLECTIONS, PARTITIONED_FIELDS,
  /* V19.57: master-data groups + flag for selective stripping */
  PARTITIONED_FIELDS_V1675, PARTITIONED_FIELDS_V1957,
  PARTITIONED_FLAG_V1675, PARTITIONED_FLAG_V1957,
} from "./utils/partitionedCollections.js";
import { noticeSuccess, noticeWarn, noticeError } from "./utils/storageNotices.js";
/* V19.58: Zod-based schema validation in WARN-only mode. Surfaces drift in
   write shapes without blocking. See utils/validateData.js + schemas/index.js. */
import { validateDoc } from "./utils/validateData.js";
import { ask, tell, askInput, askForm, showToast, highlightRow } from "./utils/popups.js";
import { printPage, printPkgLabel, printEmpQrCards, renderLabelPages, openPrintWindow } from "./utils/print.js";
import { wsIsInternal, calcOrder, getConfirmedStock, checkStockAvailability, deductStockForOrder, calcWsRating, migrateStatus, matchWorkshopFromDesc } from "./utils/orders.js";
import { ensureCategoriesInit } from "./utils/categories.js";

/* T, TH, TD, TDB, TDL imported from theme.js (V15.0 phase 2) — mutable module-level objects.
   setActiveTheme() is called when user switches theme to refresh their properties. */
import { T, TH, TD, TDB, TDL, setActiveTheme } from "./theme.js";
import { Spinner, LoadingBtn, InlineLoading, Badge, Btn, Inp, Sel, SearchSel, Card, MetricCard, PBar, DelBtn, ColorPicker, FCTable, AccPicker, Timeline, QRImg, QRScanner, useDebounced, useWin } from "./components/ui.jsx";

/* V16.1: Lazy loading for heavy pages — reduces initial bundle from ~3MB to ~500KB.
   Pages load on-demand when user navigates to them. React.Suspense shows PageLoader.
   Core pages (Dash, Login, UI) remain eager since they're needed on every session. */
import { lazy, Suspense } from "react";
import { lazyNamed, PageLoader, ChunkErrorBoundary } from "./utils/lazyLoad.jsx";

const CustDeliverPg = lazyNamed(() => import("./pages/CustDeliverPg.jsx"), "CustDeliverPg");
const SalesInvoicesPg = lazyNamed(() => import("./pages/SalesInvoicesPg.jsx"), "SalesInvoicesPg");
const CreditNotesPg = lazyNamed(() => import("./pages/CreditNotesPg.jsx"), "CreditNotesPg");
/* V19.48: Debit notes (purchase returns) */
const DebitNotesPg = lazyNamed(() => import("./pages/DebitNotesPg.jsx"), "DebitNotesPg");
const PurchasePg = lazyNamed(() => import("./pages/PurchasePg.jsx"), "PurchasePg");
const PurchaseInvoicesPg = lazyNamed(() => import("./pages/PurchaseInvoicesPg.jsx"), "PurchaseInvoicesPg");
const TreasuryPg = lazyNamed(() => import("./pages/TreasuryPg.jsx"), "TreasuryPg");
const HRPg = lazyNamed(() => import("./pages/HRPg.jsx"), "HRPg");
/* V19.48: Bulk messaging / campaigns engine */
const CampaignsPg = lazyNamed(() => import("./pages/CampaignsPg.jsx"), "CampaignsPg");
/* V19.68: Automation hub — daily reports + event triggers via WhatsApp bridge */
const AutomationPg = lazyNamed(() => import("./pages/AutomationPg.jsx"), "AutomationPg");
/* V19.71: AI Agent control center — config + training school for the WhatsApp LLM agent.
   The agent backend itself runs as a separate Node.js project on Contabo VPS
   (clark-ai-agent) and reads its config from this CLARK app via Firestore. */
const AIAgentPg = lazyNamed(() => import("./pages/AIAgentPg.jsx"), "AIAgentPg");

/* V15.1 phase 3: page/component imports */
/* V15.76: print-extras imports removed — none used in App.jsx (used in pages directly) */
import { LoginScreen, TABS } from "./components/LoginScreen.jsx";
/* V19.44: Centralized permissions registry. Single source of truth for roles,
   tab catalog, and default per-role permissions.
   V19.48: Switched to WithCustoms variants so admin-defined custom roles work
   end-to-end (tab gating + label rendering + permissions evaluation). */
import {
  effectivePermWithCustoms as effectivePermFromRegistry,
  canEditPermWithCustoms as canEditPermFromRegistry,
  canViewPermWithCustoms as canViewPermFromRegistry,
  getHrSubPermWithCustoms as getHrSubPermFromRegistry,
  validatePermsRegistry,
  getEffectiveRoleMeta,
} from "./utils/permissions.js";
/* Run the linter once at module load: emits console warnings if TABS in
   LoginScreen drift from PERMISSION_TABS in the registry. Catches bugs
   like "added a tab but forgot to gate it" before they hit production. */
validatePermsRegistry(TABS);
/* V19.48: Print version marker at module load. If you see "[CLARK V19.48]" in
   the console at startup, the new code is deployed. Helps diagnose "did the
   deploy actually go through" questions when something looks broken. */
console.info("%c[CLARK "+APP_VERSION+"] App module loaded — "+new Date().toISOString(),"color:#0EA5E9;font-weight:bold");
import { ActivityFeed } from "./components/ActivityFeed.jsx";
import { UndoToast } from "./components/UndoToast.jsx";
import { AboutVersionModal } from "./components/AboutVersionModal.jsx";
/* V19.48: Removed TeamActivityModal import — feature retired (topbar pill cleanup) */
import { DashPg } from "./pages/DashPg.jsx";/* eager — always first screen */
const DBPg = lazyNamed(() => import("./pages/DBPg.jsx"), "DBPg");
import { OrdForm } from "./pages/OrdForm.jsx";/* eager — small, used within DetPg */
const DetPg = lazyNamed(() => import("./pages/DetPg.jsx"), "DetPg");
const ExtProdPg = lazyNamed(() => import("./pages/ExtProdPg.jsx"), "ExtProdPg");
const StockPg = lazyNamed(() => import("./pages/StockPg.jsx"), "StockPg");
const RepPg = lazyNamed(() => import("./pages/RepPg.jsx"), "RepPg");
const ReportsHub = lazyNamed(() => import("./pages/reports.jsx"), "ReportsHub");
const CostPg = lazyNamed(() => import("./pages/CostPg.jsx"), "CostPg");
const TasksPg = lazyNamed(() => import("./pages/TasksPg.jsx"), "TasksPg");
const SettingsPg = lazyNamed(() => import("./pages/SettingsPg.jsx"), "SettingsPg");
const AuditPg = lazyNamed(() => import("./pages/AuditPg.jsx"), "AuditPg");
/* V18.35: Accounting system — chart of accounts, journal, trial balance, settings */
const AccountingPg = lazyNamed(() => import("./pages/AccountingPg.jsx"), "AccountingPg");
const FixedAssetsPg = lazyNamed(() => import("./pages/FixedAssetsPg.jsx"), "FixedAssetsPg");
/* V15.59: Mobile Warehouse — accessed via /warehouse URL */
import { MobileWarehouseShell } from "./pages/mobile/MobileWarehouseShell.jsx";
const WarehousePg = lazyNamed(() => import("./pages/WarehousePg.jsx"), "WarehousePg");
/* V19.81.0: Pieces lookup — scan a tracked QR → see lifecycle (sold/returned/re-sold) */
const PiecesPg = lazyNamed(() => import("./pages/PiecesPg.jsx"), "PiecesPg");
/* V19.81.0: per-piece QR tracking — generates unique pieceIds at print-time
   and writes Firestore docs that subsequent scans (delivery, return, lookup)
   can resolve back to a customer.
   V19.83.0: createLinkedSeriesBatch links 1 series QR (package outside) to
   N piece QRs (inside) so scanning the series at sale cascades to all pieces. */
import { genPieceId, buildTrackedQr, createPiecesBulk, createLinkedSeriesBatch } from "./utils/pieces.js";

/* V15.50: Public delivery confirmation page — opened when customer scans QR from delivery receipt.
   Rendered BEFORE auth check so it works without login. */
import { ConfirmPage } from "./components/ConfirmPage.jsx";
import { CustomerPortalPage } from "./components/CustomerPortalPage.jsx";
/* V17.9: Workshop portal — public read-only page for workshops via signed URL */
import { WorkshopPortalPage } from "./components/WorkshopPortalPage.jsx";
/* V16.73: Public workshop-delivery confirmation page — same idea as ConfirmPage
   above but for workshops scanning the QR on a 10×15 cm delivery label. Routed
   below at /?wd=1&ord=...&ws=...&idx=...&sig=..., before any login gate. */
import { WorkshopConfirmPage } from "./components/WorkshopConfirmPage.jsx";


/* Optional libs - loaded dynamically */





/* useWin moved to components/ui.jsx (V15.0 phase 2) */






/* ═══════════════════════════════════════════════════════════════
   Loading System — unified spinners and loading buttons
   
   Usage:
     <Spinner size="small|medium|large" color="#...">
     <LoadingBtn loading={isLoading} loadingText="جاري...">Original</LoadingBtn>
     <InlineLoading message="..." />
   
   Design: CSS-only rotating border spinner, respects theme colors,
   lightweight animation (~60fps), works on all screens.
   ═══════════════════════════════════════════════════════════════ */









/* Debounced value hook — used to avoid lag on search inputs.
   value changes immediately in UI, but returned debounced value updates only
   after `delay` ms of inactivity. Typical use: expensive filters/searches. */





export default function App(){
  /* V15.50: Public delivery confirmation — checked FIRST so customer QR scans don't require login.
     URL format: /?dc=1&s=<sessionId>&c=<custId>&sig=<hmac> */
  const urlParams=new URLSearchParams(window.location.search);
  if(urlParams.get("dc")==="1"){
    const s=urlParams.get("s"),c=urlParams.get("c"),sig=urlParams.get("sig");
    if(s&&c&&sig){
      return <ConfirmPage params={{s,c,sig}}/>;
    }
  }
  /* V16.3: Customer portal — public read-only account page for customers.
     V18.15: Now supports two URL formats (backward compat):
       Legacy:   /?portal=1&c=<custId>&sig=<hmac_hex>
       Short:    /?p=c&i=<custId>&s=<hmac_b64url>
     V19.78.2 BUGFIX: also forward `t` (timestamp) to the page. V19.64 introduced
     timestamped HMAC signatures; without `t` the API falls back to legacy
     verification → 403 for any link generated post-V19.64. */
  if(urlParams.get("portal")==="1"||urlParams.get("p")==="c"){
    const c=urlParams.get("c")||urlParams.get("i"),sig=urlParams.get("sig")||urlParams.get("s"),t=urlParams.get("t")||"";
    if(c&&sig){
      return <CustomerPortalPage params={{c,sig,t}}/>;
    }
  }
  /* V17.9: Workshop portal — public read-only account page for workshops.
     V18.15: Two URL formats. V19.78.2 BUGFIX: forward `t` like customer portal. */
  if(urlParams.get("wsportal")==="1"||urlParams.get("p")==="w"){
    const w=urlParams.get("w")||urlParams.get("i"),sig=urlParams.get("sig")||urlParams.get("s"),t=urlParams.get("t")||"";
    if(w&&sig){
      return <WorkshopPortalPage params={{w,sig,t}}/>;
    }
  }
  /* V16.73: Public workshop-delivery confirmation — opened when a workshop
     scans the QR on a 10×15 cm delivery label printed in V16.73 or later.
     URL format: /?wd=1&ord=<orderId>&ws=<wsId>&idx=<deliveryIdx>&sig=<hmac>
     Checked BEFORE the login gate (same as `dc=1` and `portal=1` above) so
     the workshop never sees a login prompt. The legacy `?act=wsdel&...` path
     handled further down still works for old labels (login-gated). */
  if(urlParams.get("wd")==="1"){
    const ord=urlParams.get("ord"),ws=urlParams.get("ws"),idx=urlParams.get("idx"),sig=urlParams.get("sig");
    if(ord&&ws&&idx!=null&&sig){
      return <WorkshopConfirmPage params={{ord,ws,idx,sig}}/>;
    }
  }
  /* QR scan: ?o=modelNo → order details, ?act=rcv&oid=ID&wdi=IDX → receive mode */
  const qrParams=new URLSearchParams(window.location.search);
  const qrModelNo=qrParams.get("o");
  const qrAction=qrParams.get("act");
  const qrOid=qrParams.get("oid");
  const qrWdi=qrParams.get("wdi");
  const qrWs=qrParams.get("ws");
  /* V16.50: ?act=wsdel&ord=X&ws=Y&idx=Z → workshop scans the QR on a delivery
     receipt to confirm receipt of that specific delivery */
  const qrOrd=qrParams.get("ord");
  const qrIdx=qrParams.get("idx");

  const[user,setUser]=useState(null);const[authLoading,setAuthLoading]=useState(true);
  const[configDoc,setConfigDoc]=useState(INIT_CONFIG);const[salesDoc,setSalesDoc]=useState({});const[tasksDoc,setTasksDoc]=useState({});const[orders,setOrders]=useState([]);const[dataLoading,setDataLoading]=useState(true);
  /* V18.60 SAFETY: configLoaded — set to true ONLY after config listener fires once
     with valid server data. Prevents writes from happening with INIT_CONFIG as base. */
  const[configLoaded,setConfigLoaded]=useState(false);
  /* V18.60 SAFETY: configError — populated if the config doc is missing or the
     listener errors. UI blocks all writes when this is non-null. */
  const[configError,setConfigError]=useState(null);
  /* V19.48: Loading-stall detection. If listeners take more than 12 seconds without
     firing, a diagnostic panel surfaces options to the user (try anyway / clear
     cache / sign out). Without this, users got stuck on the loading spinner with
     no recourse — exactly the V19.48-reported incident. */
  const[loadingStallDetected,setLoadingStallDetected]=useState(false);
  /* Tracks which listeners have fired at least once — populated by the listeners
     themselves. Used by the stall panel to show "config: ✓ / sales: ✗" status. */
  const[listenerStatus,setListenerStatus]=useState({config:false,sales:false,tasks:false,orders:false,lastError:null});
  /* V16.74: split collections state — treasury, auditLog, hrLog من daily collections */
  /* V19.63: dynamic init over SPLIT_FIELDS (was hardcoded 3 keys, missing 11 V19.49+ fields).
     Pre-V19.63 splitData[custPayments]/etc were `undefined` until first listener fire — any
     consumer reading splitDataRef directly got undefined||[]=[] which could mask wipes. */
  const[splitData,setSplitData]=useState(()=>Object.fromEntries(SPLIT_FIELDS.map(f=>[f,[]])));
  const[splitLoaded,setSplitLoaded]=useState(false);
  /* V19.51: sales-doc split state (packages, custDeliverySessions in
     packagesDays/, custDeliverySessionsDays/) */
  const[salesSplitData,setSalesSplitData]=useState({});
  const[salesSplitLoaded,setSalesSplitLoaded]=useState(false);
  /* V19.51: tasks-doc split state (tasks, stickyNotes, inventoryAudits) */
  const[tasksSplitData,setTasksSplitData]=useState({});
  const[tasksSplitLoaded,setTasksSplitLoaded]=useState(false);
  /* V19.53: per-user notification state (reads/dismisses/doneTasks).
     One doc per user in userNotifStates/{userEmail}. Replaces the old
     in-place mutation of notification.readBy/dismissedBy/doneBy arrays
     which caused write-contention when multiple users read the same notif. */
  const[userNotifState,setUserNotifState]=useState({reads:{},dismisses:{},doneTasks:{}});
  /* V17.4: ref tracking latest configDoc — used by listeners to check if a snap
     would override our local optimistic state (cached snaps with hasPendingWrites
     can race ahead of our setConfigDoc, briefly regressing the UI). */
  const configDocRef=useRef(null);
  /* V19.48: Refs for salesDoc and tasksDoc. Used by their respective Tx fallbacks
     to compute the authoritative "current state" outside React's setState callback
     (so we can await a real setDoc with proper error handling, instead of the
     fire-and-forget setDoc(...).catch() pattern that silently swallowed errors). */
  const salesDocRef=useRef({});
  const tasksDocRef=useRef({});
  /* V19.55 CRITICAL FIX: Write-queue refs to serialize Firestore writes per doc.
     ════════════════════════════════════════════════════════════════════════════
     Why this exists:
     Without serialization, parallel setDoc(merge:false) writes can land on the
     server out-of-order. Last-to-land wins → bulk-post symptom: 5 invoices show
     "posted" optimistically, then 3 seconds later 4 of them snap back to "draft"
     because an older write (with stale state) landed AFTER a newer write.

     V19.54 fixed the LOCAL state (configDocRef avoids stale closure on read).
     V19.55 fixes the REMOTE state by chaining writes onto a shared promise:
       - call N's setDoc only starts after call N-1's setDoc finishes
       - Firestore receives writes in the same order they were called
       - The latest call always wins (correct), regardless of network jitter
     The chain is per-doc (config / sales / tasks) so unrelated writes don't
     block each other across docs. */
  const upConfigWriteQueueRef=useRef(Promise.resolve());
  const upSalesWriteQueueRef=useRef(Promise.resolve());
  const upTasksWriteQueueRef=useRef(Promise.resolve());
  /* V16.75: partitioned collections state — hrWeeks (each week is its own document) */
  /* V19.57: dynamic init over PARTITIONED_FIELDS — adding new fields auto-extends. */
  /* V19.59 BUGFIX: hydrate from localStorage snapshot on first mount so users see
     last-known master data instantly instead of an empty list. The clark-data-
     snapshot is updated on every config change (see effect below) and persists
     across sessions. As listeners fire, fresh data replaces the cached arrays. */
  const[partitionedData,setPartitionedData]=useState(()=>{
    const initial=Object.fromEntries(PARTITIONED_FIELDS.map(f=>[f,[]]));
    try{
      const raw=typeof localStorage!=="undefined"?localStorage.getItem("clark-data-snapshot"):null;
      if(raw){
        const snap=JSON.parse(raw);
        for(const f of PARTITIONED_FIELDS){
          if(Array.isArray(snap[f]))initial[f]=snap[f];
        }
      }
    }catch(_){/* corrupt snapshot — ignore */}
    return initial;
  });
  const[partitionedLoaded,setPartitionedLoaded]=useState(false);
  const config=useMemo(()=>{const merged={...configDoc,...salesDoc,...tasksDoc};
    /* Safety: if salesDoc has sessions, ALWAYS prefer it over configDoc */
    if(salesDoc.custDeliverySessions)merged.custDeliverySessions=salesDoc.custDeliverySessions;
    if(salesDoc.packages)merged.packages=salesDoc.packages;
    if(tasksDoc.tasks)merged.tasks=tasksDoc.tasks;
    if(tasksDoc.stickyNotes)merged.stickyNotes=tasksDoc.stickyNotes;
    if(tasksDoc.inventoryAudits)merged.inventoryAudits=tasksDoc.inventoryAudits;
    /* V16.74 + V19.49 → V19.59 BUGFIX: split collections override config equivalents.
       PRE-V19.59 the merge required `splitLoaded === true` (all listeners fired
       at least once). If a single listener stalled (slow network, permission
       hiccup, multi-tab race), `splitLoaded` stayed false → the merge never ran
       → arrays appeared as `undefined` because configDoc no longer contains them
       post-migration. Symptom reported: "قائمة العملاء فاضية (0)" until refresh.

       V19.59 fix: drop the `splitLoaded`/`partitionedLoaded` gates from the
       merge. partitionedData/splitData start empty and fill in incrementally as
       each listener fires. Pages briefly see `data.customers === []` for the
       first few hundred ms instead of `undefined` — far better than appearing
       broken. The migration flag is the only required gate (it tells us where
       the data SHOULD come from).
       Loaded flags are still used for SAFETY GUARDS in writes (upConfigTx etc.)
       — those guards are correct: we shouldn't WRITE before we've READ. But
       READING a partial state is fine. */
    if(configDoc[SPLIT_FLAG_V1674]){
      merged.treasury=splitData.treasury||[];
      merged.auditLog=splitData.auditLog||[];
      merged.hrLog=splitData.hrLog||[];
    }
    if(configDoc[SPLIT_FLAG_V1949]){
      for(const f of SPLIT_FIELDS_V1949){
        merged[f]=splitData[f]||[];
      }
    }
    if(configDoc[SPLIT_FLAG_V1950]){
      for(const f of SPLIT_FIELDS_V1950){
        merged[f]=splitData[f]||[];
      }
    }
    if(configDoc[SPLIT_FLAG_V1952]){
      for(const f of SPLIT_FIELDS_V1952){
        merged[f]=splitData[f]||[];
      }
    }
    if(configDoc[SPLIT_FLAG_V1953]){
      for(const f of SPLIT_FIELDS_V1953){
        merged[f]=splitData[f]||[];
      }
    }
    /* V19.51 + V19.59: sales-doc + tasks-doc splits (gate dropped for the same reason). */
    if(salesDoc[SALES_SPLIT_FLAG_V1951]){
      for(const f of SALES_SPLIT_FIELDS_V1951){
        merged[f]=salesSplitData[f]||[];
      }
    }
    if(tasksDoc[TASKS_SPLIT_FLAG_V1951]){
      for(const f of TASKS_SPLIT_FIELDS_V1951){
        merged[f]=tasksSplitData[f]||[];
      }
    }
    /* V16.75 + V19.57 + V19.59 BUGFIX: partitioned collections — same gate-removal.
       Master data (customers/suppliers/workshops/etc.) used to disappear if
       *any* of the 8 listeners stalled. Now each fills in independently. */
    if(configDoc[PARTITIONED_FLAG_V1675]){
      for(const f of PARTITIONED_FIELDS_V1675){
        merged[f]=partitionedData[f]||[];
      }
    }
    if(configDoc[PARTITIONED_FLAG_V1957]){
      for(const f of PARTITIONED_FIELDS_V1957){
        merged[f]=partitionedData[f]||[];
      }
    }
    /* V19.63: removed `splitLoaded`/`partitionedLoaded`/`salesSplitLoaded`/`tasksSplitLoaded`
       from the dep array — V19.59 dropped these gates from the merge body, so they were
       triggering 4 redundant useMemo runs (and 4 redundant snapshot writes) per cold start. */
    return merged},[configDoc,salesDoc,tasksDoc,splitData,partitionedData,salesSplitData,tasksSplitData]);
  const[tab,setTab_]=useState(()=>sessionStorage.getItem("clark_tab")||"home");const[sel,setSel_]=useState(()=>sessionStorage.getItem("clark_sel")||null);
  const setTab=v=>{setTab_(v);sessionStorage.setItem("clark_tab",v)};
  const setSel=v=>{setSel_(v);if(v)sessionStorage.setItem("clark_sel",v);else sessionStorage.removeItem("clark_sel")};
  /* Cross-page tab navigation via custom event (used by WarehousePg to open stock tab) */
  useEffect(()=>{const h=(e)=>{if(e?.detail)setTab(e.detail)};window.addEventListener("goto-tab",h);return()=>window.removeEventListener("goto-tab",h)},[]);
  const[gSearch,setGSearch]=useState(""); const gSearchDeb=useDebounced(gSearch,250);const[showAlerts,setShowAlerts]=useState(false);const[showLogout,setShowLogout]=useState(false);const[showScanner,setShowScanner]=useState(false);const[dbSub,setDbSub]=useState(null);const[showTheme,setShowTheme]=useState(false);const[cardPopup,setCardPopup]=useState(null);const[labelPopup,setLabelPopup]=useState(null);const[labelBags,setLabelBags]=useState(1);const[wsAccPopup,setWsAccPopup]=useState(null);const[barcodePopup,setBarcodePopup]=useState(null);const[showNotifs,setShowNotifs]=useState(false);const[showAboutVersion,setShowAboutVersion]=useState(false);
  /* V17.1 FIX #12+#15: Migration status — blocks UI while a migration is running.
     Without this, users could add data during migration and the data would be lost
     (window between step 2 [sync] and step 3 [config write] is unsafe). */
  const[migrationStatus,setMigrationStatus]=useState(null);/* null | {label, progress?: 0-100, message?} */
  /* V16.50: workshop delivery confirmation popup — opened when a workshop scans
     the QR on a delivery receipt. Carries the order, the workshopDeliveries entry
     (snapshot at scan time), and a flag for the confirm action. */
  const[wsDelPopup,setWsDelPopup]=useState(null);
  /* V16.50: Workshop self-confirm popup — opens when scanning a CLARK:WSRCV: QR
     from a printed delivery receipt. Lets the workshop confirm receipt of
     pieces without going through the desktop UI. */
  const[wsRcvPopup,setWsRcvPopup]=useState(null);
  const[wsRcvQty,setWsRcvQty]=useState(0);
  const[savingOverlay,setSavingOverlay]=useState(null);/* null or {message,progress} */
  const[stickyForm,setStickyForm]=useState(null);
  const[sidebarTab,setSidebarTab]=useState("notes");/* "notes"|"tasks"|"activity" — for home sidebar */
  const[quickPopup,setQuickPopup]=useState(null);/* "task"|"notif"|null */
  const[qpTo,setQpTo]=useState("");const[qpText,setQpText]=useState("");const[qpType,setQpType]=useState("تذكير");
  /* V19.48: Notification expiry duration. Values: "1h"|"2h"|"1d"|"endday"|"none". Default: "2h". */
  const[qpDuration,setQpDuration]=useState("2h");
  /* V19.48 HOTFIX: notifTick state must live BEFORE any early returns to keep hook order stable across renders */
  const[_notifTick,setNotifTick]=useState(0);
  /* V19.48: Toggle for the "all notifications" popup that opens when user clicks "+N more" chip */
  const[notifPopupOpen,setNotifPopupOpen]=useState(false);
  /* V19.48 HOTFIX: ticker effect also must run unconditionally (no early-return skip).
     The dep `_notifTick` makes it a no-op rebind; the actual gate is inside (we read subBarNotifs from a ref or just always tick). */
  useEffect(()=>{
    /* Tick once a minute. Cheap setState; greeting bar reads fresh state on each render. */
    const id=setInterval(()=>setNotifTick(t=>t+1),60000);
    return()=>clearInterval(id);
  },[]);
  const[aiMsgs,setAiMsgs]=useState([]);const[aiInput,setAiInput]=useState("");const[aiLoading,setAiLoading]=useState(false);const[aiOpen,setAiOpen]=useState(false);
  /* V15.68: Dismissed alerts moved to Firestore (per user) — syncs across all devices.
     Structure: config.userDismissed[email] = [{key, at}]
     Auto-prunes entries older than 10 days. */
  const userEmailKey=(user?.email||"").toLowerCase();
  const dismissedAlerts=useMemo(()=>{
    const all=config.userDismissed||{};
    const mine=all[userEmailKey]||[];
    const now=Date.now();
    return mine.filter(d=>d&&d.key&&now-(d.at||0)<864000000);
  },[config.userDismissed,userEmailKey]);
  const dismissAlert=(key)=>{
    if(!key||!userEmailKey)return;
    upConfig(d=>{
      if(!d.userDismissed)d.userDismissed={};
      const mine=Array.isArray(d.userDismissed[userEmailKey])?d.userDismissed[userEmailKey]:[];
      /* Dedupe + prune old (>10 days) */
      const now=Date.now();
      const filtered=mine.filter(x=>x&&x.key&&x.key!==key&&now-(x.at||0)<864000000);
      filtered.push({key,at:now});
      /* Keep last 200 to avoid bloat */
      d.userDismissed[userEmailKey]=filtered.slice(-200);
    });
  };
  const isDismissed=(key)=>dismissedAlerts.some(d=>d.key===key);
  const aiAlerts=useMemo(()=>{const a=[];const now=Date.now();const workshops=config.workshops||[];const wsPayments=config.wsPayments||[];
    /* 1. أوردرات متأخرة */
    orders.forEach(o=>{if(o.closed||o.settlement||o.status==="تم التسليم لمخزن الجاهز")return;const _t=calcOrder(o);const _stk=getConfirmedStock(o);if(_t.cutQty>0&&_stk>=_t.cutQty*0.85)return;const wds=o.workshopDeliveries||[];let lastDate=o.date;wds.forEach(wd=>{if(wd.date>lastDate)lastDate=wd.date;(wd.receives||[]).forEach(r=>{if(r.date>lastDate)lastDate=r.date})});(o.deliveries||[]).forEach(d=>{if(d.date>lastDate)lastDate=d.date});const days=Math.floor((now-new Date(lastDate))/(86400000));
      if(days>7)a.push({icon:"🔴",text:"موديل "+o.modelNo+" واقف من "+days+" يوم",type:"late",orderId:o.id,key:"late_"+o.id})});
    /* 2. أوردرات جاهزة للغلق */
    const _userName=user?.displayName||user?.email?.split("@")[0]||"";
    orders.forEach(o=>{(o.deliveries||[]).filter(d=>d.status==="pending"&&d.createdBy===_userName).forEach(d=>{a.push({icon:"⏳",text:"موديل "+o.modelNo+": "+d.qty+" قطعة في انتظار تأكيد أمين المخزن",type:"info",orderId:o.id,key:"pend_"+o.id+"_"+d.date})})});
    orders.forEach(o=>{(o.deliveries||[]).filter(d=>d.confirmedAt&&d.confirmedAt>new Date(Date.now()-24*60*60*1000).toISOString()&&d.createdBy===_userName).forEach(d=>{a.push({icon:"✅",text:"تم تأكيد استلام "+(d.confirmedQty||d.qty)+" قطعة من موديل "+o.modelNo+(d.confirmedBy?" بواسطة "+d.confirmedBy:""),type:"ready",orderId:o.id,key:"conf_"+o.id+"_"+d.confirmedAt})})});
    orders.forEach(o=>{if(o.closed)return;const t=calcOrder(o);const stockDel=getConfirmedStock(o);if(t.cutQty>0&&stockDel>=t.cutQty)a.push({icon:"✅",text:"موديل "+o.modelNo+" كامل — جاهز للغلق",type:"ready",orderId:o.id,key:"close_"+o.id})});
    /* 3. هالك كبير (>5%) */
    orders.forEach(o=>{if(o.closed||!o.settlement)return;const t=calcOrder(o);if(t.cutQty>0){const pct=Math.round((o.settlement.qty/t.cutQty)*100);if(pct>5)a.push({icon:"⚠️",text:"موديل "+o.modelNo+" فيه "+pct+"% هالك ("+o.settlement.qty+" قطعة)",type:"waste",key:"waste_"+o.id})}});
    /* 4. ورش — أرصدة مالية */
    workshops.forEach(w=>{const isInt=w.type==="داخلي"||w.type==="internal";if(isInt)return;
      let due=0;orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===w.name).forEach(wd=>{(wd.receives||[]).forEach(r=>{due+=r2((Number(r.qty)||0)*(Number(r.price)||0))})})});
      const payments=wsPayments.filter(p=>p.wsName===w.name);const paid=payments.filter(p=>p.type==="payment").reduce((s,p)=>s+(Number(p.amount)||0),0);const purchase=payments.filter(p=>p.type==="purchase").reduce((s,p)=>s+(Number(p.amount)||0),0);
      const owed=due+purchase-paid;
      if(owed<-500)a.push({icon:"💸",text:""+w.name+" عليها "+fmt(r2(Math.abs(owed)))+" ج.م (دفعنالها زيادة)",type:"overpaid"});
      if(owed>5000)a.push({icon:"💰",text:""+w.name+" ليها "+fmt(r2(owed))+" ج.م مدفعناش",type:"unpaid"})});
    /* 5. ورش بطيئة + قرب الموعد */
    workshops.forEach(w=>{const wPhone=w.phone||"";let details=[];orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===w.name).forEach(wd=>{const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);const wBal=(Number(wd.qty)||0)-rcvd;if(wBal>0){const daysSince=Math.floor((now-new Date(wd.date))/(86400000));const agreed=Number(wd.agreedDays)||0;details.push({modelNo:o.modelNo,qty:wBal,days:daysSince,agreed,garment:wd.garmentType||"",delDate:wd.date})}})});
      if(details.length>0){const totalBal=details.reduce((s,d)=>s+d.qty,0);const maxDays=Math.max(...details.map(d=>d.days));
        if(maxDays>14)a.push({icon:"🐢",text:w.name+" عندها "+totalBal+" قطعة من "+maxDays+" يوم",type:"slow",wsName:w.name,wsPhone:wPhone,details});
        details.forEach(d=>{if(d.agreed>0){const remaining=d.agreed-d.days;if(remaining<=2&&remaining>=0)a.push({icon:"⏰",text:w.name+" باقي "+(remaining||"آخر")+" يوم على موعد تسليم موديل "+d.modelNo+" ("+d.agreed+" يوم متفق)",type:"deadline",wsName:w.name,wsPhone:wPhone,details:[d]});
          else if(remaining<0)a.push({icon:"🔴",text:w.name+" متأخرة "+Math.abs(remaining)+" يوم عن الموعد — موديل "+d.modelNo+" (متفق "+d.agreed+" يوم)",type:"overdue",wsName:w.name,wsPhone:wPhone,details:[d]})}})}});
    /* 6. تنبيهات مخزن الخامات والإكسسوار — لو المخزن مفعل */
    const psettings=config.purchaseSettings||{};
    if(psettings.stockEnabled){
      (config.fabrics||[]).forEach(f=>{const st=Number(f.stock)||0;const m=Number(f.minStock)||0;
        if(m>0&&st===0)a.push({icon:"🚫",text:"خامة "+f.name+" نفذت من المخزن!",type:"stock-zero",key:"stock_zero_"+f.id});
        else if(m>0&&st<=m)a.push({icon:"⚠️",text:"خامة "+f.name+" ناقصة ("+fmt(st)+" "+(f.unit||"")+" — الحد الأدنى "+fmt(m)+")",type:"stock-low",key:"stock_low_"+f.id});
      });
      (config.accessories||[]).forEach(ac=>{const st=Number(ac.stock)||0;const m=Number(ac.minStock)||0;
        if(m>0&&st===0)a.push({icon:"🚫",text:"إكسسوار "+ac.name+" نفذ من المخزن!",type:"stock-zero",key:"stock_zero_acc_"+ac.id});
        else if(m>0&&st<=m)a.push({icon:"⚠️",text:"إكسسوار "+ac.name+" ناقص ("+fmt(st)+" "+(ac.unit||"")+" — الحد الأدنى "+fmt(m)+")",type:"stock-low",key:"stock_low_acc_"+ac.id});
      });
    }
    /* 7. تنبيهات المنتجات العامة — دايماً شغالة (مش مرتبطة بـ stockEnabled) */
    (config.generalProducts||[]).forEach(p=>{const st=Number(p.stock)||0;const m=Number(p.minStock)||0;
      if(m>0&&st===0)a.push({icon:"🚫",text:(p.category||"منتج")+" — "+p.name+" نفذ من المخزن!",type:"stock-zero",key:"stock_zero_prod_"+p.id});
      else if(m>0&&st<=m)a.push({icon:"⚠️",text:(p.category||"منتج")+" — "+p.name+" ناقص ("+fmt(st)+" "+(p.unit||"")+" — الحد الأدنى "+fmt(m)+")",type:"stock-low",key:"stock_low_prod_"+p.id});
    });
    return a},[orders,config.workshops,config.wsPayments,config.fabrics,config.accessories,config.generalProducts,config.purchaseSettings]);
  const visibleAlerts=aiAlerts.filter(a=>!isDismissed(a.key||a.text));
  const askAI=async()=>{if(!aiInput.trim()||aiLoading)return;const q=aiInput.trim();setAiInput("");setAiMsgs(p=>[...p,{role:"user",text:q}]);setAiLoading(true);
    try{
      /* Workshop summary */
      const ws=(config.workshops||[]).map(w=>{let del=0,rcv=0;orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===w.name).forEach(wd=>{del+=Number(wd.qty)||0;(wd.receives||[]).forEach(r=>{rcv+=Number(r.qty)||0})})});
        const payments=(config.wsPayments||[]).filter(p=>p.wsName===w.name);const paid=payments.filter(p=>p.type==="payment").reduce((s,p)=>s+(Number(p.amount)||0),0);
        let due=0;orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===w.name).forEach(wd=>{(wd.receives||[]).forEach(r=>{due+=r2((Number(r.qty)||0)*(Number(r.price)||0))})})});
        return{name:w.name,type:w.type,delivered:del,received:rcv,balance:del-rcv,dueMoney:r2(due),paid:r2(paid),factoryOwesWorkshop:r2(due-paid),payPercent:Number(w.payPercent)||60}});
      /* Orders summary */
      const ords=orders.map(o=>{const t=calcOrder(o);const wds=o.workshopDeliveries||[];const totalDel=wds.reduce((s,wd)=>s+(Number(wd.qty)||0),0);const totalRcv=wds.reduce((s,wd)=>(wd.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0)+s,0);const stockDel=getConfirmedStock(o);
        const custDel=(o.customerDeliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);const custRet=(o.customerReturns||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);
        const lastMove=wds.reduce((d,wd)=>{let ld=wd.date||"";(wd.receives||[]).forEach(r=>{if(r.date>ld)ld=r.date});return ld>d?ld:d},"");
        const days=lastMove?Math.floor((Date.now()-new Date(lastMove))/(86400000)):null;
        return{modelNo:o.modelNo,desc:o.modelDesc,status:o.status,cutQty:t.cutQty,deliveredToWs:totalDel,receivedFromWs:totalRcv,wsBalance:totalDel-totalRcv,stockDelivered:stockDel,sold:custDel-custRet,availableInStock:stockDel-(custDel-custRet),sellPrice:Number(o.sellPrice)||0,daysSinceLastMove:days,pieces:o.orderPieces||[],
          wsDetails:wds.map(wd=>{const rcvd=(wd.receives||[]).filter(r=>!r.isSettlement).reduce((s,r)=>s+(Number(r.qty)||0),0);return{ws:wd.wsName,piece:wd.garmentType||"عام",delivered:Number(wd.qty)||0,received:rcvd,balance:(Number(wd.qty)||0)-rcvd,agreed:Number(wd.agreedDays)||0,date:wd.date}}).filter(w=>w.balance>0||w.received>0)}});
      /* V15.63: Customers summary */
      const custs=(config.customers||[]).map(c=>{let totalDel=0,totalRet=0,totalMoney=0;
        orders.forEach(o=>{const price=Number(o.sellPrice)||0;
          (o.customerDeliveries||[]).filter(d=>d.custId===c.id).forEach(d=>{totalDel+=Number(d.qty)||0;totalMoney+=(Number(d.qty)||0)*(Number(d.price)||price)});
          (o.customerReturns||[]).filter(r=>r.custId===c.id).forEach(r=>{totalRet+=Number(r.qty)||0})});
        return{name:c.name,type:c.type||"",discount:Number(c.discount)||0,totalSold:totalDel-totalRet,totalMoney:r2(totalMoney)}}).filter(c=>c.totalSold>0||c.totalMoney>0);
      /* V15.63: Overall summary */
      const totalCut=ords.reduce((s,o)=>s+o.cutQty,0);
      const totalStock=ords.reduce((s,o)=>s+o.stockDelivered,0);
      const totalSold=ords.reduce((s,o)=>s+o.sold,0);
      const totalRevenue=ords.reduce((s,o)=>s+o.sold*o.sellPrice,0);
      const summary={totalCut,totalStock,totalSold,availableInStock:totalStock-totalSold,totalRevenue:r2(totalRevenue),ordersCount:ords.length,workshopsCount:ws.length,customersCount:custs.length};
      const ctx="أنت مساعد ذكي لنظام CLARK لإدارة مصانع الملابس.\n\nقواعد الرد:\n- رد بالمصري العامي (يعني، كده، خلاص، أهو)\n- اختصر اختصار غير مخل — بلاش كلام كتير\n- افصل بين كل أوردر أو معلومة بخط فاصل ─────\n\n⚠️ قاعدة حرجة في الأرصدة المالية للورش (لازم تتبعها حرفياً):\nالـ field اسمه `factoryOwesWorkshop` ومعناه: المبلغ اللي المصنع مديون به للورشة.\n• لو `factoryOwesWorkshop` موجب (> 0): الورشة دائنة — اكتب \"الورشة **ليها** X جنيه عندنا\" أو \"المصنع مدين للورشة بـ X\". مش \"عليها\"!\n• لو `factoryOwesWorkshop` سالب (< 0): الورشة مدينة لنا — اكتب \"الورشة **عليها** X جنيه\" (دفعنالها أكتر من المستحق).\n• لو = 0: حسابها متسوّي.\nمثال: ورشة نورهان `factoryOwesWorkshop=129900` (موجب) → \"ورشة نورهان ليها 129,900 جنيه عندنا\". غلط لو كتبت \"عليها\".\n\n- نسبة الدفع payPercent = الحد الأقصى المسموح بدفعه من المستحق (عادي 60%)\n- مصطلحات الورش مهمة جداً: workshopDeliveries.qty = الورشة استلمت منّنا (استلم)، workshopDeliveries.receives[].qty = الورشة سلّمت لنا (سلّم). يعني لما تكتب عن ورشة اكتب: استلم 508، سلّم 495، باقي 13. مش العكس!\n- availableInStock = المتاح في مخزن الجاهز (بعد طرح اللي اتباع)\n- sold = اللي اتباع للعملاء (بعد طرح المرتجعات)\n- في الآخر خالص حط سطر ─────── وبعده 💡 ملاحظتك أو نصيحتك من عندك كمدير انتاج خبرة\n\nبيانات الموسم "+season+":\n\nملخص عام:\n"+JSON.stringify(summary,null,0)+"\n\nالأوردرات ("+ords.length+"):\n"+JSON.stringify(ords,null,0)+"\n\nالورش ("+ws.length+"):\n"+JSON.stringify(ws,null,0)+"\n\nالعملاء ("+custs.length+"):\n"+JSON.stringify(custs,null,0)+"\n\nالتاريخ: "+new Date().toISOString().split("T")[0];
      const msgs=[...aiMsgs.map(m=>({role:m.role==="user"?"user":"assistant",content:m.text})),{role:"user",content:q}];
      let data2;let retries=0;
      while(retries<2){
        const res=await fetch("/api/ai",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({system:ctx,messages:msgs})});
        data2=await res.json();
        if(data2.error&&(data2.error.message||"").toLowerCase().includes("overloaded")&&retries<1){retries++;setAiMsgs(p=>[...p,{role:"ai",text:"⏳ السيرفر مشغول... بعيد المحاولة"}]);await new Promise(r=>setTimeout(r,3000));setAiMsgs(p=>p.filter(m=>m.text!=="⏳ السيرفر مشغول... بعيد المحاولة"));continue}
        break}
      if(data2.error){setAiMsgs(p=>[...p,{role:"ai",text:"⚠️ "+(data2.error.message||data2.error||"خطأ غير معروف")}]);setAiLoading(false);return}
      const reply=data2.content?.map(c=>c.text||"").join("\n")||"عذراً، لم أتمكن من الرد";
      setAiMsgs(p=>[...p,{role:"ai",text:reply}])
    }catch(e){console.error("AI error:",e);setAiMsgs(p=>[...p,{role:"ai",text:"⚠️ خطأ في الاتصال بالمساعد الذكي"}])}
    setAiLoading(false)};
  useEffect(()=>{const h=e=>{if(e.key==="Escape"){setQuickPopup(null);setShowAlerts(false);setShowScanner(false);setStickyForm(null);setShowTheme(false);setShowNotifs(false);setAiOpen(false)}};window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h)},[]);
  const[statusNotif,setStatusNotif]=useState(null);const prevStatuses=useRef({});
  /* Online/Offline status */
  const[isOnline,setIsOnline]=useState(navigator.onLine);const[justReconnected,setJustReconnected]=useState(false);
  useEffect(()=>{
    const checkReal=async()=>{try{const r=await fetch("https://firestore.googleapis.com",{method:"HEAD",mode:"no-cors",cache:"no-store"});setIsOnline(p=>{if(!p)setJustReconnected(true);return true})}catch(e){setIsOnline(false);setJustReconnected(false)}};
    const on=()=>checkReal();const off=()=>{setIsOnline(false);setJustReconnected(false)};
    window.addEventListener("online",on);window.addEventListener("offline",off);
    const interval=setInterval(checkReal,15000);checkReal();
    return()=>{window.removeEventListener("online",on);window.removeEventListener("offline",off);clearInterval(interval)}
  },[]);
  useEffect(()=>{if(justReconnected){const t=setTimeout(()=>setJustReconnected(false),4000);return()=>clearTimeout(t)}},[justReconnected]);
  /* V19.48: Online-only mode — block ALL writes when offline. isOnlineRef gives callbacks
     a stable reference without forcing every useCallback dep on isOnline (which would
     cause cascade re-creations of upConfig/upSales/upTasks on every connectivity flap). */
  const isOnlineRef=useRef(navigator.onLine);
  useEffect(()=>{isOnlineRef.current=isOnline},[isOnline]);
  /* V19.48: Last sync timestamp — updated by upConfigTx/upSalesTx/upTasksTx on success.
     Persisted to localStorage so it survives reloads. Display in topbar as relative time. */
  const[lastSyncAt,setLastSyncAt]=useState(()=>{try{const v=localStorage.getItem("clark-lastSyncAt");return v?parseInt(v,10):0}catch(e){return 0}});
  const markSynced=useCallback(()=>{const t=Date.now();setLastSyncAt(t);try{localStorage.setItem("clark-lastSyncAt",String(t))}catch(e){}},[]);
  /* V19.48: human-friendly relative time used for "آخر مزامنة من ..." pill and the team panel rows. */
  const fmtRelAr=useCallback((ts)=>{
    if(!ts)return"";
    const sec=Math.max(0,Math.floor((Date.now()-ts)/1000));
    if(sec<10)return"الآن";
    if(sec<60)return"من "+sec+" ث";
    const min=Math.floor(sec/60);
    if(min<60)return"من "+min+" د";
    const hr=Math.floor(min/60);
    if(hr<24)return"من "+hr+" س"+(min%60?" و"+(min%60)+" د":"");
    const day=Math.floor(hr/24);
    return"من "+day+" يوم";
  },[]);
  /* V19.48: Force re-render every 30s so the relative-time display ("من X ثانية") stays fresh. */
  const[,setSyncTick]=useState(0);
  useEffect(()=>{const t=setInterval(()=>setSyncTick(x=>x+1),30000);return()=>clearInterval(t)},[]);
  /* V19.48: Removed showTeamActivity state — feature retired */
  /* V15.63: Bot tasks permanently disabled — user requested removal.
     V15.76: Dead ref removed — was never read anywhere. */
  const themeKey="clark-theme-"+(user?.uid||"default");
  const[theme,setTheme_]=useState(()=>{try{return localStorage.getItem("clark-theme-default")||"light"}catch(e){return"light"}});
  /* V15.3: themeTick forces re-render of all components when T/TH/TD/TDB/TDL mutate.
     Without this, components read stale theme values because T is module-level (not React state). */
  const[themeTick,setThemeTick]=useState(0);
  const setTheme=v=>{setTheme_(v);try{localStorage.setItem(themeKey,v)}catch(e){}setActiveTheme(v);setThemeTick(n=>n+1)};
  useEffect(()=>{try{const saved=localStorage.getItem(themeKey);if(saved&&saved!==theme)setTheme_(saved)}catch(e){}},[themeKey]);
  /* V15.76: Run setActiveTheme only when theme actually changes, not every render.
     useRef lets us call synchronously before children render (so T is correct on first paint),
     while skipping the expensive rebuild when theme is unchanged.
     Previously this ran on EVERY render — ~20x/second during typing. */
  const _appliedTheme=useRef(null);
  if(_appliedTheme.current!==theme){setActiveTheme(theme);_appliedTheme.current=theme}
  useEffect(()=>{try{localStorage.setItem(themeKey,theme)}catch(e){}document.body.style.background=T.bodyBg||T.bg},[theme,themeKey]);
  const w=useWin();const isMob=w<768;const isTab=w>=768&&w<1100;const season=config.activeSeason||"WS26";

  useEffect(()=>{const unsub=onAuthStateChanged(auth,u=>{setUser(u);setAuthLoading(false)});return unsub},[]);
  /* V15.92: Prefetch IP + location once per session (silent — no error if offline) */
  useEffect(()=>{prefetchIpInfo().catch(()=>{})},[]);
  /* V19.76.4: sync the local clock against /api/now (Cairo time) so timestamps
     and dates baked into payments / treasury / event messages aren't wrong on
     computers with mis-set system clocks. Best-effort — falls back to local
     Date if the endpoint is unreachable. Re-syncs lazily after 30 min. */
  useEffect(()=>{startClockSync()},[]);
  useEffect(()=>{if(!user)return;
    let salesReady=false;let tasksReady=false;
    /* ═══════════════════════════════════════════════════════════════════
       🛡️ MIGRATION SAFETY FRAMEWORK
       
       Problem (V10 and earlier): Firestore offline persistence caches the
       config doc locally. When a device that was offline for days reconnects,
       onSnapshot fires FIRST with cached (stale) data, THEN with server data.
       Migrations that ran on the cached data would blindly setDoc() to
       Firestore — OVERWRITING newer data that existed on the server.
       
       Fix: Three layers of protection:
       
       1. Show cached data to user immediately (good UX), BUT only run
          migrations when snap.metadata.fromCache === false — i.e. we are
          confirmed to be reading from the live server.
       
       2. Before any migration writes, create a backup in Firestore:
          backups/pre-migration-{type}-{timestamp}
       
       3. Every migration uses runTransaction() — the transaction re-reads
          the config from the server inside the transaction, applies the
          migration to THAT fresh data, and writes it back atomically.
          This guarantees we never overwrite a newer version.
       ═══════════════════════════════════════════════════════════════════ */

    /* Helper: save a backup of the current config BEFORE running a migration */
    const saveBackupBeforeMigration=async(migrationType,configData)=>{
      try{
        const ts=new Date().toISOString().replace(/[:.]/g,"-");
        const backupId="pre-migration-"+migrationType+"-"+ts;
        await setDoc(doc(db,"backups",backupId),{
          label:"قبل ميجريشن: "+migrationType,
          autoGenerated:true,
          migrationType,
          createdAt:new Date().toISOString(),
          createdBy:user.email||"system",
          config:configData||{},
          counts:{
            treasury:(configData?.treasury||[]).length,
            employees:(configData?.employees||[]).length,
            customers:(configData?.customers||[]).length,
            wsPayments:(configData?.wsPayments||[]).length
          }
        });
        return backupId;
      }catch(e){
        console.error("❌ Pre-migration backup FAILED:",e);
        /* Critical: if we can't back up, we should NOT run the migration */
        throw e;
      }
    };

    /* Helper: log migration events to Firestore for audit trail */
    const logMigration=async(migrationType,status,details)=>{
      try{
        await setDoc(doc(db,"migrationLog",migrationType+"-"+Date.now()),{
          type:migrationType,status,details:details||"",
          by:user.email||"system",at:new Date().toISOString()
        });
      }catch(e){console.warn("Migration log failed:",e)}
    };

    /* Helper: run a migration safely using a Firestore transaction.
       V16.12: Backup is now written INSIDE the same transaction as the
       migration. This guarantees that:
         - Backup + migration commit atomically (or both abort)
         - No more "bloat backups" from migrations that no-op on the
           shouldRun(fresh) re-check inside the transaction
         - Backup captures a deep-cloned pre-state, so even though the
           applyFn mutates `fresh` in place, the backup keeps the original.
       - Reads config from SERVER inside transaction (not from cache)
       - Calls shouldRun(server_data) to verify migration is still needed
       - Calls applyFn(server_data) to apply the change (mutates server_data)
       - Writes backup + migrated config back atomically. */
    const runMigration=async(migrationType,d,shouldRun,applyFn)=>{
      if(!shouldRun(d))return;/* Quick pre-check on cached data — skip if obviously done */
      try{
        let didRun=false;let details="";
        await runTransaction(db,async(tx)=>{
          const ref=doc(db,"factory","config");
          const snap=await tx.get(ref);
          if(!snap.exists())return;
          const fresh=snap.data();
          /* Re-check on fresh server data — maybe another device already did it */
          if(!shouldRun(fresh))return;/* No-op: skip backup + write entirely */
          /* Deep-clone fresh BEFORE applyFn mutates it — this is what we back up */
          const preState=JSON.parse(JSON.stringify(fresh));
          /* Stage the backup as part of this transaction */
          const ts=new Date().toISOString().replace(/[:.]/g,"-");
          const backupRef=doc(db,"backups","pre-migration-"+migrationType+"-"+ts);
          tx.set(backupRef,{
            label:"قبل ميجريشن: "+migrationType,
            autoGenerated:true,
            migrationType,
            createdAt:new Date().toISOString(),
            createdBy:user.email||"system",
            config:preState,
            counts:{
              treasury:(preState.treasury||[]).length,
              employees:(preState.employees||[]).length,
              customers:(preState.customers||[]).length,
              wsPayments:(preState.wsPayments||[]).length
            }
          });
          /* Apply the migration to fresh (mutates it) */
          const result=applyFn(fresh);
          if(typeof result==="string")details=result;
          /* Commit migrated config */
          tx.set(ref,fresh);
          didRun=true;
        });
        if(didRun){
          await logMigration(migrationType,"success",details);
        }
      }catch(e){
        console.error("❌ Migration "+migrationType+" FAILED:",e);
        await logMigration(migrationType,"failed",e.message||String(e));
      }
    };

    /* Main config listener */
    const u1=onSnapshot(doc(db,"factory","config"),{includeMetadataChanges:false},snap=>{
      if(!snap.exists()){
        /* V18.60 CRITICAL FIX: Previously this auto-wrote INIT_CONFIG, which
           DESTROYED real data on permission errors / transient absence. Now we
           refuse to auto-init and surface an explicit error to the UI.
           
           If this is a genuinely fresh project (first install), the user must
           run the dedicated init flow — NOT have it happen silently on every
           startup where the doc happens to look missing. */
        console.error("[V18.60 CRITICAL] factory/config does not exist! Refusing to auto-init.");
        setConfigError({
          type:"missing_config",
          ts:new Date().toISOString(),
          uid:user?.uid,
          email:user?.email
        });
        return;
      }
      const d=snap.data();
      /* V17.4 FIX: Don't override our local optimistic state with stale cached/pending data.
         
         Bug we're fixing: When user clicks "تأكيد التحويل":
         1. upConfig() does setConfigDoc(stripped) — UI shows transfer confirmed
         2. Firestore SDK caches the write locally
         3. onSnapshot fires from CACHE before the server acknowledges. snap.data() may
            return data WITHOUT our optimistic update (race window in the SDK).
         4. setConfigDoc(d) applies stale state → UI regresses to "pending"
         5. Server acknowledges → onSnapshot fires again with confirmed state
         6. setConfigDoc(d) applies the new server state → UI returns to "confirmed"
         
         The user sees: confirmed → pending (briefly) → confirmed. 
         
         Fix: ignore snaps with hasPendingWrites if we already have a configDoc loaded.
         The pending write IS our local state, no need to overwrite ourselves with our
         own intermediate cache. We will get a server-confirmed snap shortly after.
         
         Use configDocRef (not configDoc closure) because the closure captures stale value. */
      if(snap.metadata.hasPendingWrites&&configDocRef.current){
        /* Skip — our local state is fresher than this cached snap */
        return;
      }
      /* ALWAYS show the data to the user (even if cached — that's fine for display) */
      setConfigDoc(d);
      /* V18.60: Mark config as loaded once we have valid data (cached or server).
         Writes are gated on this flag — see upConfig safety check. */
      setConfigLoaded(true);
      /* V19.48: Track that the config listener has fired (for stall diagnostic). */
      setListenerStatus(s => ({...s, config: true}));
      /* Clear any prior error since we have valid data now */
      setConfigError(null);
      /* ⛔ Skip ALL migrations if data is from local cache or has pending writes.
         Wait for the first confirmed server snapshot before running any migration. */
      if(snap.metadata.fromCache){return}
      if(snap.metadata.hasPendingWrites)return;

      /* ═══ Migration 1: swap MAIN CASH ↔ SUB CASH names ═══ */
      runMigration("cash-swap",d,
        (data)=>!data._cashSwapDone,
        (data)=>{
          const TEMP="__SWAP_TMP__";
          const swap=(name)=>name==="MAIN CASH"?"SUB CASH":name==="SUB CASH"?"MAIN CASH":name;
          let changed=false;
          if(Array.isArray(data.treasuryAccounts)){
            data.treasuryAccounts=data.treasuryAccounts.map(a=>{
              if(typeof a==="string"){const ns=swap(a);if(ns!==a)changed=true;return ns}
              const obj={...a};const nn=swap(obj.name);if(nn!==obj.name){obj.name=nn;obj.id=nn;changed=true}return obj});
          }
          if(Array.isArray(data.treasury))data.treasury=data.treasury.map(t=>{const na=swap(t.account);if(na!==t.account){changed=true;return{...t,account:na}}return t});
          if(Array.isArray(data.treasuryTransfers))data.treasuryTransfers=data.treasuryTransfers.map(tf=>{const nf=swap(tf.fromAccount);const nt=swap(tf.toAccount);if(nf!==tf.fromAccount||nt!==tf.toAccount){changed=true;return{...tf,fromAccount:nf,toAccount:nt}}return tf});
          if(Array.isArray(data.treasury))data.treasury=data.treasury.map(t=>{if(t.desc&&(t.desc.includes("MAIN CASH")||t.desc.includes("SUB CASH"))){return{...t,desc:t.desc.replace(/MAIN CASH/g,TEMP).replace(/SUB CASH/g,"MAIN CASH").replace(new RegExp(TEMP,"g"),"SUB CASH")}}return t});
          data._cashSwapDone=true;
          return"changed="+changed;
        }
      );

      /* ═══ Migration 2: fix incomplete transfers ═══ */
      runMigration("transfers-repair",d,
        (data)=>!data._transfersRepaired&&Array.isArray(data.treasuryTransfers),
        (data)=>{
          let repaired=false;
          (data.treasuryTransfers||[]).forEach(tf=>{
            if(tf.status==="cancelled")return;
            const entries=(data.treasury||[]).filter(t=>t.transferId===tf.id);
            const hasOut=entries.some(t=>t.type==="out");
            const hasIn=entries.some(t=>t.type==="in");
            const dayN=dayName(tf.date||new Date().toISOString().split("T")[0]);
            if(!hasOut&&tf.fromAccount){data.treasury=data.treasury||[];data.treasury.unshift({id:gid(),type:"out",amount:tf.amount,desc:"تحويل إلى "+tf.toAccount+(tf.note?" — "+tf.note:""),notes:"",category:"تحويل داخلي",account:tf.fromAccount,season:data.activeSeason||"",date:tf.date||new Date().toISOString().split("T")[0],day:dayN,transferId:tf.id,by:tf.sentBy||"",createdAt:new Date().toISOString()});repaired=true}
            if(!hasIn&&tf.toAccount){data.treasury=data.treasury||[];data.treasury.unshift({id:gid(),type:"in",amount:tf.amount,desc:"تحويل من "+tf.fromAccount+(tf.note?" — "+tf.note:""),notes:"",category:"تحويل داخلي",account:tf.toAccount,season:data.activeSeason||"",date:tf.date||new Date().toISOString().split("T")[0],day:dayN,transferId:tf.id,by:tf.sentBy||"",createdAt:new Date().toISOString()});repaired=true}
            if(tf.status!=="confirmed"){tf.status="confirmed";repaired=true}
          });
          data._transfersRepaired=true;
          return"repaired="+repaired;
        }
      );

      /* ═══ Migration 3: link ws payments with treasury entries ═══ */
      runMigration("ws-payment-linking",d,
        (data)=>!data._wsPayLinked&&Array.isArray(data.wsPayments)&&Array.isArray(data.treasury),
        (data)=>{
          let linked=0;
          data.wsPayments.forEach(p=>{
            if(p.treasuryTxId)return;
            const candidate=(data.treasury||[]).find(t=>
              !t.wsPaymentId&&t.type==="out"&&Number(t.amount)===Number(p.amount)&&t.date===p.date&&t.desc&&t.desc.includes(p.wsName)&&(t.category==="تشغيل خارجي"||t.category==="مشتريات"));
            if(candidate){p.treasuryTxId=candidate.id;candidate.wsPaymentId=p.id;candidate.wsName=p.wsName;candidate.sourceType="ws_payment";linked++}
          });
          data._wsPayLinked=true;
          return"linked="+linked;
        }
      );

      /* ═══ Migration 3b (V18.72): backfill workshop link for treasury entries
         where the user typed the workshop name in the desc but never picked the
         workshop from the party selector. Migration 3 only matches existing
         wsPayments — this one creates new ones from orphan treasury rows. ═══ */
      runMigration("ws-treasury-desc-backfill",d,
        (data)=>!data._wsTreasuryDescBackfill&&Array.isArray(data.treasury)&&Array.isArray(data.workshops)&&data.workshops.length>0,
        (data)=>{
          if(!Array.isArray(data.wsPayments))data.wsPayments=[];
          let linked=0;
          (data.treasury||[]).forEach(t=>{
            if(!t||t.wsPaymentId)return;
            if(t.type!=="out")return;
            if(t.category!=="تشغيل خارجي"&&t.category!=="مشتريات")return;
            const ws=matchWorkshopFromDesc(t.desc||"",data.workshops);
            if(!ws)return;
            const wsPayId="wsp_bf_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,7);
            data.wsPayments.push({
              id:wsPayId,
              wsName:ws.name,
              wsId:ws.id,
              amount:Number(t.amount)||0,
              type:t.category==="مشتريات"?"purchase":"payment",
              notes:t.notes||"",
              date:t.date||"",
              createdBy:t.by||"backfill",
              treasuryTxId:t.id,
              createdAt:t.createdAt||new Date().toISOString(),
              backfilledAt:new Date().toISOString(),
            });
            t.wsPaymentId=wsPayId;
            t.wsName=ws.name;
            if(!t.sourceType)t.sourceType="ws_payment";
            linked++;
          });
          data._wsTreasuryDescBackfill=true;
          return"linked="+linked;
        }
      );

      /* ═══ Migration 3c (V18.73): extended backfill — scans desc+notes
         combined (V18.72 only scanned desc). Catches orphan treasury entries
         where the workshop name lives in `notes` only, or is split across
         desc and notes. Same ambiguity guard via matchWorkshopFromDesc. ═══ */
      runMigration("ws-treasury-desc-notes-backfill",d,
        (data)=>!data._wsTreasuryDescNotesBackfill&&Array.isArray(data.treasury)&&Array.isArray(data.workshops)&&data.workshops.length>0,
        (data)=>{
          if(!Array.isArray(data.wsPayments))data.wsPayments=[];
          let linked=0;
          (data.treasury||[]).forEach(t=>{
            if(!t||t.wsPaymentId)return;
            if(t.type!=="out")return;
            if(t.category!=="تشغيل خارجي"&&t.category!=="مشتريات")return;
            const haystack=((t.desc||"")+" "+(t.notes||"")).trim();
            const ws=matchWorkshopFromDesc(haystack,data.workshops);
            if(!ws)return;
            const wsPayId="wsp_bf2_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,7);
            data.wsPayments.push({
              id:wsPayId,
              wsName:ws.name,
              wsId:ws.id,
              amount:Number(t.amount)||0,
              type:t.category==="مشتريات"?"purchase":"payment",
              notes:t.notes||"",
              date:t.date||"",
              createdBy:t.by||"backfill",
              treasuryTxId:t.id,
              createdAt:t.createdAt||new Date().toISOString(),
              backfilledAt:new Date().toISOString(),
            });
            t.wsPaymentId=wsPayId;
            t.wsName=ws.name;
            if(!t.sourceType)t.sourceType="ws_payment";
            linked++;
          });
          data._wsTreasuryDescNotesBackfill=true;
          return"linked="+linked;
        }
      );

      /* ═══ Migration 3d (V18.74 Arabic-normalized): final backfill pass
         using the Arabic-normalized matcher in matchWorkshopFromDesc. The
         earlier passes used strict String.includes() which missed entries
         where the spelling differs (ة/ه, أ/ا, ى/ي, etc.). New key so it
         re-runs once on existing installs. ═══ */
      runMigration("ws-treasury-arabic-norm-backfill",d,
        (data)=>!data._wsTreasuryArabicNormBackfill&&Array.isArray(data.treasury)&&Array.isArray(data.workshops)&&data.workshops.length>0,
        (data)=>{
          if(!Array.isArray(data.wsPayments))data.wsPayments=[];
          let linked=0;
          (data.treasury||[]).forEach(t=>{
            if(!t||t.wsPaymentId)return;
            if(t.type!=="out")return;
            if(t.category!=="تشغيل خارجي"&&t.category!=="مشتريات")return;
            const haystack=((t.desc||"")+" "+(t.notes||"")).trim();
            const ws=matchWorkshopFromDesc(haystack,data.workshops);
            if(!ws)return;
            const wsPayId="wsp_bf3_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,7);
            data.wsPayments.push({
              id:wsPayId,
              wsName:ws.name,
              wsId:ws.id,
              amount:Number(t.amount)||0,
              type:t.category==="مشتريات"?"purchase":"payment",
              notes:t.notes||"",
              date:t.date||"",
              createdBy:t.by||"backfill",
              treasuryTxId:t.id,
              createdAt:t.createdAt||new Date().toISOString(),
              backfilledAt:new Date().toISOString(),
            });
            t.wsPaymentId=wsPayId;
            t.wsName=ws.name;
            if(!t.sourceType)t.sourceType="ws_payment";
            linked++;
          });
          data._wsTreasuryArabicNormBackfill=true;
          return"linked="+linked;
        }
      );

      /* ═══ Migration 4: rename legacy status cards ═══ */
      runMigration("status-rename",d,
        (data)=>!data._statusRenameDone&&Array.isArray(data.statusCards),
        (data)=>{
          let renamed=false;
          data.statusCards=data.statusCards.map(c=>{
            if(!c||!c.name)return c;
            if(c.name==="تم الشحن"||c.name==="تم التسليم"){renamed=true;return{...c,name:"تم التسليم لمخزن الجاهز"}}
            if(c.name==="شحن جزئي"){renamed=true;return{...c,name:"في مخزن الجاهز جزئي"}}
            return c;
          });
          const seen=new Set();
          data.statusCards=data.statusCards.filter(c=>{if(!c||!c.name)return false;if(seen.has(c.name))return false;seen.add(c.name);return true});
          data._statusRenameDone=true;
          return"renamed="+renamed;
        }
      );

      /* ═══ Migration: V15.17 — normalize all phone numbers to +2 prefix ═══ */
      runMigration("phone-normalize-v15-17",d,
        (data)=>!data._phoneNormalizedV1517,
        (data)=>{
          const norm=(p)=>{const s=(p||"").toString().trim();if(!s)return"";if(s.startsWith("+"))return s;const dd=s.replace(/\D/g,"");if(!dd)return"";if(dd.startsWith("2")&&dd.length>=12)return"+"+dd;return"+2"+dd};
          let count=0;
          /* Employees */
          (data.employees||[]).forEach(e=>{const old=e.phone||"";const n=norm(old);if(n!==old){e.phone=n;count++}});
          /* Customers */
          (data.customers||[]).forEach(c=>{const old=c.phone||"";const n=norm(old);if(n!==old){c.phone=n;count++}});
          /* Suppliers */
          (data.suppliers||[]).forEach(s=>{const old=s.phone||"";const n=norm(old);if(n!==old){s.phone=n;count++}});
          /* Workshops */
          (data.workshops||[]).forEach(w=>{const old=w.phone||"";const n=norm(old);if(n!==old){w.phone=n;count++}});
          /* Users (if they have phone) */
          (data.usersList||[]).forEach(u=>{if(u.phone){const old=u.phone;const n=norm(old);if(n!==old){u.phone=n;count++}}});
          data._phoneNormalizedV1517=true;
          return"normalized="+count+" phone numbers";
        }
      );

      /* ═══ Migration: V16.13 — recompute tx.day with timezone-safe parser ═══
         Old code used `new Date("YYYY-MM-DD").getDay()` which parses as UTC
         midnight. Devices in negative-UTC zones got the previous weekday.
         We now rebuild every treasury entry's `day` field from `date` using
         the local-components parser. Idempotent: same date → same name. */
      runMigration("day-name-tz-fix-v16-13",d,
        (data)=>!data._dayNameTzFixV1613&&Array.isArray(data.treasury)&&data.treasury.length>0,
        (data)=>{
          let fixed=0;
          (data.treasury||[]).forEach(t=>{
            if(!t||!t.date)return;
            const correct=dayName(t.date);
            if(t.day!==correct){t.day=correct;fixed++}
          });
          data._dayNameTzFixV1613=true;
          return"recomputed day for "+fixed+" treasury entries";
        }
      );

      /* ═══ Migration: V16.31 — initialize itemCategories + inventoryItems ═══
         Seeds the two core categories (قماش + اكسسوار) backed by existing
         data.fabrics / data.accessories. New categories like "قطع غيار" can
         be added through the UI, with their items in data.inventoryItems[]. */
      runMigration("init-item-categories-v16-31",d,
        (data)=>!data._categoriesInitV1631,
        (data)=>{
          ensureCategoriesInit(data);
          data._categoriesInitV1631=true;
          return"seeded "+(data.itemCategories||[]).length+" categories";
        }
      );

      /* ═══ Migration: V16.33 — remove erroneous endorse treasury entries ═══
         The old endorse code created a fake "out" treasury entry on a "CHECKS"
         account, which mis-counted endorsements as cash outflow. Conceptually,
         endorsing a customer check just changes its owner — no treasury
         movement. This pass removes those entries. */
      runMigration("clean-endorse-treasury-v16-33",d,
        (data)=>!data._cleanEndorseTreasuryV1633&&Array.isArray(data.treasury)&&data.treasury.some(t=>t&&t.sourceType==="check_endorse"),
        (data)=>{
          const before=(data.treasury||[]).length;
          data.treasury=(data.treasury||[]).filter(t=>!(t&&t.sourceType==="check_endorse"));
          data._cleanEndorseTreasuryV1633=true;
          return"removed "+(before-data.treasury.length)+" stale endorse entries";
        }
      );

      /* ═══ Migration 5: Phase 1 — copy data to separate docs ═══
         Note: this migration writes to sales/tasks docs (not config) before
         setting _splitDone. We handle it differently from the others.
         V16.12: Backup is now staged inside the transaction along with the
         split, so we no longer save a backup if a concurrent device already
         set _splitDone (which would no-op the migration). */
      if(!d._splitDone&&(d.custDeliverySessions||d.packages||d.tasks||d.stickyNotes||d.inventoryAudits)){
        (async()=>{
          try{
            let didRun=false;
            await runTransaction(db,async(tx)=>{
              const ref=doc(db,"factory","config");
              const snap=await tx.get(ref);
              if(!snap.exists())return;
              const fresh=snap.data();
              if(fresh._splitDone)return;/* No-op: another device beat us, skip backup + writes */
              const preState=JSON.parse(JSON.stringify(fresh));
              /* Stage backup as part of the transaction */
              const ts=new Date().toISOString().replace(/[:.]/g,"-");
              tx.set(doc(db,"backups","pre-migration-split-phase-1-"+ts),{
                label:"قبل ميجريشن: split-phase-1",
                autoGenerated:true,
                migrationType:"split-phase-1",
                createdAt:new Date().toISOString(),
                createdBy:user.email||"system",
                config:preState,
                counts:{
                  treasury:(preState.treasury||[]).length,
                  employees:(preState.employees||[]).length,
                  customers:(preState.customers||[]).length,
                  wsPayments:(preState.wsPayments||[]).length
                }
              });
              const salesData={custDeliverySessions:fresh.custDeliverySessions||[],packages:fresh.packages||[]};
              const tasksData={tasks:fresh.tasks||[],stickyNotes:fresh.stickyNotes||[],inventoryAudits:fresh.inventoryAudits||[]};
              tx.set(doc(db,"factory","sales"),salesData);
              tx.set(doc(db,"factory","tasks"),tasksData);
              tx.set(ref,{...fresh,_splitDone:true});
              didRun=true;
            });
            if(didRun)await logMigration("split-phase-1","success","");
          }catch(e){console.error("❌ split-phase-1 FAILED:",e);await logMigration("split-phase-1","failed",e.message||String(e))}
        })();
      }

      /* V16.11: Migration 6 (split-phase-2 cleanup) was previously here, gated on
         `salesReady && tasksReady` closure flags. Those flags only flip true after
         the sales/tasks onSnapshot callbacks fire — which happens AFTER this
         config snapshot callback in most load orderings. Result: the cleanup
         never ran, leaving stale custDeliverySessions / packages / tasks /
         stickyNotes / inventoryAudits in the config doc indefinitely.
         Moved to a dedicated effect below that watches React state directly. */
    },err=>{
      /* V18.60 FIX: Error handler was missing — silent failures could cause
         the app to keep running with stale state on permission denied / network
         errors. Now we surface the error to the UI and block writes. */
      console.error("[V18.60 CRITICAL] config listener error:",err);
      setListenerStatus(s=>({...s,lastError:"config: "+(err?.code||err?.message||"unknown")}));
      setConfigError({
        type:"listener_error",
        code:err?.code||"unknown",
        message:err?.message||String(err),
        ts:new Date().toISOString(),
        uid:user?.uid,
        email:user?.email
      });
    });

    /* Sales doc */
    const u2=onSnapshot(doc(db,"factory","sales"),snap=>{if(snap.exists()){if(snap.metadata.hasPendingWrites)return;salesReady=true;setSalesDoc(snap.data());setListenerStatus(s=>({...s,sales:true}))}},err=>{console.error("[V18.60] sales listener error:",err);setListenerStatus(s=>({...s,lastError:"sales: "+(err?.code||err?.message||"unknown")}))});
    /* Tasks doc */
    const u3=onSnapshot(doc(db,"factory","tasks"),snap=>{if(snap.exists()){if(snap.metadata.hasPendingWrites)return;tasksReady=true;setTasksDoc(snap.data());setListenerStatus(s=>({...s,tasks:true}))}},err=>{console.error("[V18.60] tasks listener error:",err);setListenerStatus(s=>({...s,lastError:"tasks: "+(err?.code||err?.message||"unknown")}))});
    return()=>{u1();u2();u3()}},[user]);

  /* ═══ V16.11: Migration 6 (split-phase-2 cleanup) — moved out of the config
     snapshot callback. Watches React state for all 3 docs to be ready, then
     runs a self-contained transaction that re-reads config from server and
     deletes the legacy fields ONLY if they're still present.
     
     Idempotent — once the fields are gone, the effect short-circuits before
     touching Firestore. Safe to run on every render. */
  const splitPhase2RanRef=useRef(false);
  useEffect(()=>{
    if(!user||splitPhase2RanRef.current)return;
    /* Phase-1 must have completed (set _splitDone) */
    if(!configDoc||!configDoc._splitDone)return;
    /* Anything left to clean? */
    const hasLegacy=configDoc.custDeliverySessions!==undefined
                  ||configDoc.packages!==undefined
                  ||configDoc.tasks!==undefined
                  ||configDoc.stickyNotes!==undefined
                  ||configDoc.inventoryAudits!==undefined;
    if(!hasLegacy){splitPhase2RanRef.current=true;return}
    /* Verify split actually wrote the new docs — guards against running cleanup
       if Phase-1 set _splitDone but the sales/tasks writes failed. */
    const salesPopulated=salesDoc&&Object.keys(salesDoc).length>0;
    const tasksPopulated=tasksDoc&&Object.keys(tasksDoc).length>0;
    if(!salesPopulated||!tasksPopulated)return;
    /* All conditions met — run cleanup */
    splitPhase2RanRef.current=true;
    (async()=>{
      const ref=doc(db,"factory","config");
      try{
        /* V16.12: Backup is now staged inside the transaction along with the
           cleanup, so we don't pile up backups when the migration no-ops
           (e.g. another device already cleaned, or _splitDone got rolled back). */
        let didRun=false;
        await runTransaction(db,async(tx)=>{
          const snap=await tx.get(ref);
          if(!snap.exists())return;
          const fresh=snap.data();
          if(!fresh._splitDone)return;
          const stillHasLegacy=fresh.custDeliverySessions!==undefined
                            ||fresh.packages!==undefined
                            ||fresh.tasks!==undefined
                            ||fresh.stickyNotes!==undefined
                            ||fresh.inventoryAudits!==undefined;
          if(!stillHasLegacy)return;/* No-op: skip backup + write entirely */
          /* Capture pre-state for backup BEFORE mutating fresh */
          const preState=JSON.parse(JSON.stringify(fresh));
          const ts=new Date().toISOString().replace(/[:.]/g,"-");
          tx.set(doc(db,"backups","pre-migration-split-phase-2-"+ts),{
            label:"قبل ميجريشن: split-phase-2",
            autoGenerated:true,
            migrationType:"split-phase-2",
            createdAt:new Date().toISOString(),
            createdBy:user.email||"system",
            config:preState,
            counts:{
              treasury:(preState.treasury||[]).length,
              employees:(preState.employees||[]).length,
              customers:(preState.customers||[]).length,
              wsPayments:(preState.wsPayments||[]).length
            }
          });
          delete fresh.custDeliverySessions;
          delete fresh.packages;
          delete fresh.tasks;
          delete fresh.stickyNotes;
          delete fresh.inventoryAudits;
          tx.set(ref,fresh);
          didRun=true;
        });
        if(didRun){
          await setDoc(doc(db,"migrationLog","split-phase-2-"+Date.now()),{
            type:"split-phase-2",status:"success",details:"cleaned (V16.12 effect)",
            by:user.email||"system",at:new Date().toISOString()
          });
        }
      }catch(e){
        console.error("❌ split-phase-2 (V16.12 effect) FAILED:",e);
        splitPhase2RanRef.current=false;/* let it retry on next data change */
        try{
          await setDoc(doc(db,"migrationLog","split-phase-2-"+Date.now()),{
            type:"split-phase-2",status:"failed",details:(e.message||String(e)).slice(0,200),
            by:user.email||"system",at:new Date().toISOString()
          });
        }catch(_){}
      }
    })();
  },[user,configDoc,salesDoc,tasksDoc]);

  /* ═══════════════════════════════════════════════════════════════════
     V16.74: One-time migration — split treasury/auditLog/hrLog from
     factory/config into daily collections (treasuryDays, auditDays, hrLogDays).
     
     Why: factory/config was approaching 1MB limit due to these 3 arrays
     growing unbounded. Splitting them by day keeps each document small
     (~5KB) and allows years of growth without hitting limits.
     
     Once flag _splitDaysV1674Done is set in config, this migration is skipped.
     ═══════════════════════════════════════════════════════════════════ */
  const splitDaysMigrationRef=useRef(false);
  useEffect(()=>{
    if(!user||splitDaysMigrationRef.current)return;
    if(!configDoc||!configDoc.accessories)return;/* config not loaded yet */
    if(configDoc._splitDaysV1674Done)return;/* already migrated */
    
    /* انتظار: لازم listeners الـsplit collections تكون اشتغلت كي لا نعمل dup */
    if(!splitLoaded)return;
    
    /* Anything to migrate? */
    const hasLegacyTreasury=Array.isArray(configDoc.treasury)&&configDoc.treasury.length>0;
    const hasLegacyAudit=Array.isArray(configDoc.auditLog)&&configDoc.auditLog.length>0;
    const hasLegacyHrLog=Array.isArray(configDoc.hrLog)&&configDoc.hrLog.length>0;
    
    splitDaysMigrationRef.current=true;/* lock to prevent re-runs */
    
    (async()=>{
      try{
        if(!hasLegacyTreasury&&!hasLegacyAudit&&!hasLegacyHrLog){
          /* لا يوجد بيانات للـmigrate — فقط نحط الـflag */
          await runTransaction(db,async(tx)=>{
            const ref=doc(db,"factory","config");
            const snap=await tx.get(ref);
            if(!snap.exists())return;
            const fresh=snap.data();
            if(fresh._splitDaysV1674Done)return;
            tx.set(ref,{...fresh,_splitDaysV1674Done:true});
          });
          return;
        }
        
        /* V17.1 FIX #12+#15: Show loading screen to block UI during migration.
           This prevents users from adding data while we're moving it to day collections,
           which previously could cause data loss in the unsafe window. */
        setMigrationStatus({
          label:"جاري تحديث نظام التخزين (V16.74)",
          message:"الرجاء عدم إغلاق البرنامج. هذا يحدث مرة واحدة فقط.",
          progress:5,
        });
        
        /* Backup أولاً */
        setMigrationStatus(s=>({...s,message:"إنشاء نسخة احتياطية...",progress:15}));
        const ts=new Date().toISOString().replace(/[:.]/g,"-");
        await setDoc(doc(db,"backups","pre-migration-split-days-v1674-"+ts),{
          label:"قبل ميجريشن: split-days-v16.74",
          autoGenerated:true,
          migrationType:"split-days-v16.74",
          createdAt:new Date().toISOString(),
          createdBy:user.email||"system",
          counts:{
            treasury:(configDoc.treasury||[]).length,
            auditLog:(configDoc.auditLog||[]).length,
            hrLog:(configDoc.hrLog||[]).length,
          },
          /* النسخة الكاملة من config (يشمل treasury, auditLog, hrLog) */
          config:JSON.parse(JSON.stringify(configDoc)),
        });
        
        /* Sync to day collections */
        setMigrationStatus(s=>({...s,message:"نقل البيانات إلى الـcollections اليومية...",progress:50}));
        await syncAllSplitChanges(
          {treasury:[],auditLog:[],hrLog:[]},
          {
            treasury:configDoc.treasury||[],
            auditLog:configDoc.auditLog||[],
            hrLog:   configDoc.hrLog||[],
          }
        );
        
        /* الآن نحذف الـ3 arrays من factory/config ونحط flag */
        setMigrationStatus(s=>({...s,message:"تنظيف الـconfig...",progress:85}));
        await runTransaction(db,async(tx)=>{
          const ref=doc(db,"factory","config");
          const snap=await tx.get(ref);
          if(!snap.exists())return;
          const fresh=snap.data();
          if(fresh._splitDaysV1674Done)return;
          const next=stripSplitArrays(fresh);
          next._splitDaysV1674Done=true;
          tx.set(ref,next);
        });
        
        try{
          await setDoc(doc(db,"migrationLog","split-days-v16.74-"+Date.now()),{
            type:"split-days-v16.74",status:"success",
            counts:{
              treasury:(configDoc.treasury||[]).length,
              auditLog:(configDoc.auditLog||[]).length,
              hrLog:(configDoc.hrLog||[]).length,
            },
            by:user.email||"system",at:new Date().toISOString(),
          });
        }catch(_){}
        
        /* V16.75: الإعلام في الإعدادات بدلاً من toast popup عشان ما يقفزش لكل المستخدمين */
        noticeSuccess(
          "تم تطبيق تحديث V16.74",
          "تم تحويل الخزنة وسجل الأحداث وسجل HR لتخزين يومي منفصل. هذا يسمح للنظام باستيعاب نمو سنوي بدون قيود الحجم."
        );
        setMigrationStatus({label:"تم بنجاح",message:"تم تحديث النظام. يمكنك الاستمرار.",progress:100});
        setTimeout(()=>setMigrationStatus(null),1500);
      }catch(err){
        console.error("[V16.74] Split days migration failed:",err);
        try{
          await setDoc(doc(db,"migrationLog","split-days-v16.74-"+Date.now()),{
            type:"split-days-v16.74",status:"failed",
            details:(err.message||String(err)).slice(0,300),
            by:user.email||"system",at:new Date().toISOString(),
          });
        }catch(_){}
        /* unlock فاحس يمكن نحاول ثانية */
        splitDaysMigrationRef.current=false;
        setMigrationStatus(null);
      }
    })();
  },[user,configDoc,splitLoaded]);

  /* ═══════════════════════════════════════════════════════════════════
     V19.49: One-time migration — split FOUR more growing arrays from
     factory/config into daily collections:
       custPayments     → custPaymentsDays/{YYYY-MM-DD}
       supplierPayments → supplierPaymentsDays/{YYYY-MM-DD}
       wsPayments       → wsPaymentsDays/{YYYY-MM-DD}
       checks           → checksDays/{YYYY-MM-DD}

     Why: factory/config was approaching 1MB again — V16.74 only handled
     treasury/auditLog/hrLog. These 4 also grow daily and are the next
     largest contributors. Same pattern as V16.74, gated by
     _splitDaysV1949Done so the migration runs at most once per install.

     Prerequisite: V16.74 must be done first (we gate on _splitDaysV1674Done).
     ═══════════════════════════════════════════════════════════════════ */
  const splitDaysV1949MigrationRef=useRef(false);
  useEffect(()=>{
    if(!user||splitDaysV1949MigrationRef.current)return;
    if(!configDoc||!configDoc.accessories)return;/* config not loaded yet */
    if(!configDoc._splitDaysV1674Done)return;/* V16.74 must run first */
    if(configDoc._splitDaysV1949Done)return;/* already migrated */

    /* انتظار: لازم listeners الـsplit collections تكون اشتغلت */
    if(!splitLoaded)return;

    /* Anything to migrate? */
    const legacyArrays={};
    let totalLegacy=0;
    for(const f of SPLIT_FIELDS_V1949){
      const arr=Array.isArray(configDoc[f])?configDoc[f]:[];
      legacyArrays[f]=arr;
      totalLegacy+=arr.length;
    }

    splitDaysV1949MigrationRef.current=true;/* lock to prevent re-runs */

    (async()=>{
      try{
        if(totalLegacy===0){
          /* لا يوجد بيانات للـmigrate — فقط نحط الـflag */
          await runTransaction(db,async(tx)=>{
            const ref=doc(db,"factory","config");
            const snap=await tx.get(ref);
            if(!snap.exists())return;
            const fresh=snap.data();
            if(fresh._splitDaysV1949Done)return;
            tx.set(ref,{...fresh,_splitDaysV1949Done:true});
          });
          return;
        }

        setMigrationStatus({
          label:"جاري تحديث نظام التخزين (V19.49)",
          message:"الرجاء عدم إغلاق البرنامج. هذا يحدث مرة واحدة فقط.",
          progress:5,
        });

        /* Backup أولاً — يحفظ نسخة كاملة من config قبل أي تعديل */
        setMigrationStatus(s=>({...s,message:"إنشاء نسخة احتياطية...",progress:15}));
        const ts=new Date().toISOString().replace(/[:.]/g,"-");
        await setDoc(doc(db,"backups","pre-migration-split-days-v1949-"+ts),{
          label:"قبل ميجريشن: split-days-v19.49",
          autoGenerated:true,
          migrationType:"split-days-v19.49",
          createdAt:new Date().toISOString(),
          createdBy:user.email||"system",
          counts:Object.fromEntries(SPLIT_FIELDS_V1949.map(f=>[f,(configDoc[f]||[]).length])),
          /* النسخة الكاملة من config (يشمل الحقول المُهجّرة) */
          config:JSON.parse(JSON.stringify(configDoc)),
        });

        /* Sync to day collections.
           نمرر oldArr=[] حتى يعتبر كل entry "added" ويكتبهم لـday docs. */
        setMigrationStatus(s=>({...s,message:"نقل البيانات إلى الـcollections اليومية...",progress:50}));
        const oldEmpty=Object.fromEntries(SPLIT_FIELDS_V1949.map(f=>[f,[]]));
        await syncAllSplitChanges(oldEmpty,legacyArrays);

        /* الآن نحذف الـ4 arrays من factory/config ونحط flag.
           نستعمل runTransaction كي تكون atomic: إما الكل أو لا شيء. */
        setMigrationStatus(s=>({...s,message:"تنظيف الـconfig...",progress:85}));
        await runTransaction(db,async(tx)=>{
          const ref=doc(db,"factory","config");
          const snap=await tx.get(ref);
          if(!snap.exists())return;
          const fresh=snap.data();
          if(fresh._splitDaysV1949Done)return;
          /* اكتب الـflag أولاً ثم استدعِ stripSplitArrays حتى تستعمل الـflag الجديد للحذف */
          const flagged={...fresh,_splitDaysV1949Done:true};
          const next=stripSplitArrays(flagged);
          tx.set(ref,next);
        });

        try{
          await setDoc(doc(db,"migrationLog","split-days-v19.49-"+Date.now()),{
            type:"split-days-v19.49",status:"success",
            counts:Object.fromEntries(SPLIT_FIELDS_V1949.map(f=>[f,(configDoc[f]||[]).length])),
            by:user.email||"system",at:new Date().toISOString(),
          });
        }catch(_){}

        noticeSuccess(
          "تم تطبيق تحديث V19.49",
          "تم تحويل 4 مجموعات إضافية (مدفوعات العملاء، مدفوعات الموردين، مدفوعات الورش، الشيكات) لتخزين يومي منفصل. حجم ملف الإعدادات هينخفض بشكل كبير ولن يصل لحد 1MB أبداً."
        );
        setMigrationStatus({label:"تم بنجاح",message:"تم تحديث النظام. يمكنك الاستمرار.",progress:100});
        setTimeout(()=>setMigrationStatus(null),1500);
      }catch(err){
        console.error("[V19.49] Split days migration failed:",err);
        try{
          await setDoc(doc(db,"migrationLog","split-days-v19.49-"+Date.now()),{
            type:"split-days-v19.49",status:"failed",
            details:(err.message||String(err)).slice(0,300),
            by:user.email||"system",at:new Date().toISOString(),
          });
        }catch(_){}
        /* unlock فاحس يمكن نحاول ثانية */
        splitDaysV1949MigrationRef.current=false;
        setMigrationStatus(null);
      }
    })();
  },[user,configDoc,splitLoaded]);

  /* ═══════════════════════════════════════════════════════════════════
     V19.50: One-time migration — split THREE more arrays from factory/config
     into daily collections, plus cleanup of legacy coa_backup_* keys:

       salesInvoices    → salesInvoicesDays/{YYYY-MM-DD}      (الأكبر)
       purchaseInvoices → purchaseInvoicesDays/{YYYY-MM-DD}
       purchaseOrders   → purchaseOrdersDays/{YYYY-MM-DD}

     Plus cleanup: any field on factory/config that starts with
     "coa_backup_pre_upgrade_" gets DELETED. These were inline backups dumped
     into config by ChartOfAccountsTab.jsx whenever the user upgraded the
     chart of accounts — they polluted config with ~12 KB each. The actual
     backups live in the `backups/` collection so this cleanup is safe.
     V19.50 also fixes ChartOfAccountsTab.jsx to write future backups to the
     proper backups/ collection so this issue can't recur.

     Why: salesInvoices alone was 54% of factory/config. At ~10 invoices/day
     this would breach the 1MB Firestore limit in 2-3 months. The split
     pattern (one document per day) keeps each doc under ~100 KB even at
     extreme load (50 invoices/day) and gives us decades of headroom.

     Prerequisite: V19.49 must be done first (we gate on _splitDaysV1949Done).
     ═══════════════════════════════════════════════════════════════════ */
  const splitDaysV1950MigrationRef=useRef(false);
  useEffect(()=>{
    if(!user||splitDaysV1950MigrationRef.current)return;
    if(!configDoc||!configDoc.accessories)return;/* config not loaded yet */
    if(!configDoc._splitDaysV1949Done)return;/* V19.49 must run first */
    if(configDoc._splitDaysV1950Done)return;/* already migrated */

    /* انتظار: لازم listeners الـsplit collections تكون اشتغلت */
    if(!splitLoaded)return;

    /* Anything to migrate? */
    const legacyArrays={};
    let totalLegacy=0;
    for(const f of SPLIT_FIELDS_V1950){
      const arr=Array.isArray(configDoc[f])?configDoc[f]:[];
      legacyArrays[f]=arr;
      totalLegacy+=arr.length;
    }
    /* Find legacy coa_backup_pre_upgrade_* keys */
    const coaBackupKeys=Object.keys(configDoc).filter(k=>k.startsWith("coa_backup_pre_upgrade_"));
    const hasCleanup=coaBackupKeys.length>0;

    splitDaysV1950MigrationRef.current=true;/* lock to prevent re-runs */

    (async()=>{
      try{
        if(totalLegacy===0&&!hasCleanup){
          /* لا شيء للنقل ولا للتنظيف — فقط نحط الـflag */
          await runTransaction(db,async(tx)=>{
            const ref=doc(db,"factory","config");
            const snap=await tx.get(ref);
            if(!snap.exists())return;
            const fresh=snap.data();
            if(fresh._splitDaysV1950Done)return;
            tx.set(ref,{...fresh,_splitDaysV1950Done:true});
          });
          return;
        }

        setMigrationStatus({
          label:"جاري تحديث نظام التخزين (V19.50)",
          message:"الرجاء عدم إغلاق البرنامج. هذا يحدث مرة واحدة فقط.",
          progress:5,
        });

        /* Backup أولاً — يحفظ نسخة كاملة من config قبل أي تعديل */
        setMigrationStatus(s=>({...s,message:"إنشاء نسخة احتياطية...",progress:15}));
        const ts=new Date().toISOString().replace(/[:.]/g,"-");
        await setDoc(doc(db,"backups","pre-migration-split-days-v1950-"+ts),{
          label:"قبل ميجريشن: split-days-v19.50",
          autoGenerated:true,
          migrationType:"split-days-v19.50",
          createdAt:new Date().toISOString(),
          createdBy:user.email||"system",
          counts:Object.fromEntries(SPLIT_FIELDS_V1950.map(f=>[f,(configDoc[f]||[]).length])),
          coaBackupKeysRemoved:coaBackupKeys.length,
          /* النسخة الكاملة من config قبل التعديل (يشمل كل حاجة هتتشال) */
          config:JSON.parse(JSON.stringify(configDoc)),
        });

        /* V19.50 EXTRA SAFETY: rescue any legacy coa_backup_pre_upgrade_* arrays
           into separate backup docs in backups/ collection. The pre-migration
           backup already contains them, but having them as standalone docs
           makes manual restore easier (a single grep on the backups collection
           finds all coa-related backups). */
        if(coaBackupKeys.length>0){
          setMigrationStatus(s=>({...s,message:"حفظ نسخ coa_backup القديمة في الـcollection الصحيحة...",progress:30}));
          for(const k of coaBackupKeys){
            try{
              await setDoc(doc(db,"backups","coa-rescued-from-config-"+k.replace(/^coa_backup_pre_upgrade_/,"")),{
                label:"COA backup مُنقذ من factory/config (V19.50 cleanup)",
                rescuedFrom:"factory/config."+k,
                rescuedAt:new Date().toISOString(),
                rescuedBy:user.email||"system",
                originalKey:k,
                coa:JSON.parse(JSON.stringify(configDoc[k]||[])),
              });
            }catch(rescueErr){
              console.warn("[V19.50] Failed to rescue coa backup",k,"— it remains in the main backup doc:",rescueErr?.message||rescueErr);
              /* غير حرج — الـbackup الأساسي عنده النسخة كاملة برضه */
            }
          }
        }

        /* Sync to day collections.
           نمرر oldArr=[] حتى يعتبر كل entry "added" ويكتبهم لـday docs. */
        setMigrationStatus(s=>({...s,message:"نقل الفواتير لـcollections يومية...",progress:55}));
        const oldEmpty=Object.fromEntries(SPLIT_FIELDS_V1950.map(f=>[f,[]]));
        await syncAllSplitChanges(oldEmpty,legacyArrays);

        /* الآن: حذف الـ3 arrays + الـcoa_backup_* keys + كتابة flag.
           transaction atomic: إما الكل أو لا شيء. */
        setMigrationStatus(s=>({...s,message:"تنظيف الـconfig...",progress:85}));
        await runTransaction(db,async(tx)=>{
          const ref=doc(db,"factory","config");
          const snap=await tx.get(ref);
          if(!snap.exists())return;
          const fresh=snap.data();
          if(fresh._splitDaysV1950Done)return;
          /* اكتب الـflag الجديد ثم استدعِ stripSplitArrays حتى تستعمل الـflag للحذف */
          const flagged={...fresh,_splitDaysV1950Done:true};
          let next=stripSplitArrays(flagged);
          /* Cleanup: remove coa_backup_pre_upgrade_* keys from config */
          for(const k of Object.keys(next)){
            if(k.startsWith("coa_backup_pre_upgrade_"))delete next[k];
          }
          tx.set(ref,next);
        });

        try{
          await setDoc(doc(db,"migrationLog","split-days-v19.50-"+Date.now()),{
            type:"split-days-v19.50",status:"success",
            counts:Object.fromEntries(SPLIT_FIELDS_V1950.map(f=>[f,(configDoc[f]||[]).length])),
            coaBackupKeysRemoved:coaBackupKeys.length,
            by:user.email||"system",at:new Date().toISOString(),
          });
        }catch(_){}

        noticeSuccess(
          "تم تطبيق تحديث V19.50",
          "تم تحويل فواتير المبيعات والمشتريات وأوامر الشراء لتخزين يومي منفصل، وتم تنظيف "+coaBackupKeys.length+" نسخة coa backup قديمة من الإعدادات. حجم ملف الإعدادات هينخفض بشكل ضخم — كان حوالي 54% منه فواتير المبيعات لوحدها."
        );
        setMigrationStatus({label:"تم بنجاح",message:"تم تحديث النظام. يمكنك الاستمرار.",progress:100});
        setTimeout(()=>setMigrationStatus(null),1500);
      }catch(err){
        console.error("[V19.50] Split days migration failed:",err);
        try{
          await setDoc(doc(db,"migrationLog","split-days-v19.50-"+Date.now()),{
            type:"split-days-v19.50",status:"failed",
            details:(err.message||String(err)).slice(0,300),
            by:user.email||"system",at:new Date().toISOString(),
          });
        }catch(_){}
        /* unlock فاحس يمكن نحاول ثانية */
        splitDaysV1950MigrationRef.current=false;
        setMigrationStatus(null);
      }
    })();
  },[user,configDoc,splitLoaded]);

  /* ═══════════════════════════════════════════════════════════════════
     V19.52: One-time migration — split FOUR more arrays from factory/config
     into daily collections (آخر الـoperational arrays في config):
       stockMovements    → stockMovementsDays/{YYYY-MM-DD}     (warehouse)
       purchaseReceipts  → purchaseReceiptsDays/{YYYY-MM-DD}   (purchases)
       treasuryTransfers → treasuryTransfersDays/{YYYY-MM-DD}  (transfers)
       salesAudits       → salesAuditsDays/{YYYY-MM-DD}        (audits)

     Why: factory/config remaining arrays from V19.50. notifications مؤجلة
     لـV19.53 (refactor مطلوب لـreadBy/dismissedBy). recycleBin بتفضل (محدودة
     بـ100 entry بـauto-prune).

     Prerequisite: V19.50 must be done first (gate على _splitDaysV1950Done).
     ═══════════════════════════════════════════════════════════════════ */
  const splitDaysV1952MigrationRef=useRef(false);
  useEffect(()=>{
    if(!user||splitDaysV1952MigrationRef.current)return;
    if(!configDoc||!configDoc.accessories)return;
    if(!configDoc._splitDaysV1950Done)return;/* V19.50 must run first */
    if(configDoc._splitDaysV1952Done)return;/* already migrated */
    if(!splitLoaded)return;

    const legacyArrays={};
    let totalLegacy=0;
    for(const f of SPLIT_FIELDS_V1952){
      const arr=Array.isArray(configDoc[f])?configDoc[f]:[];
      legacyArrays[f]=arr;
      totalLegacy+=arr.length;
    }

    splitDaysV1952MigrationRef.current=true;

    (async()=>{
      try{
        if(totalLegacy===0){
          await runTransaction(db,async(tx)=>{
            const ref=doc(db,"factory","config");
            const snap=await tx.get(ref);
            if(!snap.exists())return;
            const fresh=snap.data();
            if(fresh._splitDaysV1952Done)return;
            tx.set(ref,{...fresh,_splitDaysV1952Done:true});
          });
          return;
        }

        setMigrationStatus({
          label:"جاري تحديث نظام التخزين (V19.52)",
          message:"الرجاء عدم إغلاق البرنامج. هذا يحدث مرة واحدة فقط.",
          progress:5,
        });

        setMigrationStatus(s=>({...s,message:"إنشاء نسخة احتياطية...",progress:15}));
        const ts=new Date().toISOString().replace(/[:.]/g,"-");
        await setDoc(doc(db,"backups","pre-migration-split-days-v1952-"+ts),{
          label:"قبل ميجريشن: split-days-v19.52",
          autoGenerated:true,
          migrationType:"split-days-v19.52",
          createdAt:new Date().toISOString(),
          createdBy:user.email||"system",
          counts:Object.fromEntries(SPLIT_FIELDS_V1952.map(f=>[f,(configDoc[f]||[]).length])),
          config:JSON.parse(JSON.stringify(configDoc)),
        });

        setMigrationStatus(s=>({...s,message:"نقل البيانات لـcollections يومية...",progress:55}));
        const oldEmpty=Object.fromEntries(SPLIT_FIELDS_V1952.map(f=>[f,[]]));
        await syncAllSplitChanges(oldEmpty,legacyArrays);

        setMigrationStatus(s=>({...s,message:"تنظيف الـconfig...",progress:85}));
        await runTransaction(db,async(tx)=>{
          const ref=doc(db,"factory","config");
          const snap=await tx.get(ref);
          if(!snap.exists())return;
          const fresh=snap.data();
          if(fresh._splitDaysV1952Done)return;
          const flagged={...fresh,_splitDaysV1952Done:true};
          const next=stripSplitArrays(flagged);
          tx.set(ref,next);
        });

        try{
          await setDoc(doc(db,"migrationLog","split-days-v19.52-"+Date.now()),{
            type:"split-days-v19.52",status:"success",
            counts:Object.fromEntries(SPLIT_FIELDS_V1952.map(f=>[f,(configDoc[f]||[]).length])),
            by:user.email||"system",at:new Date().toISOString(),
          });
        }catch(_){}

        noticeSuccess(
          "تم تطبيق تحديث V19.52",
          "تم تحويل 4 مجموعات إضافية (حركات المخزن، استلامات الشراء، تحويلات الخزنة، جرد المبيعات) لتخزين يومي منفصل. آخر العمليات الكبيرة في factory/config اتقسموا — مفيش حقل operational يكبر بعد كده."
        );
        setMigrationStatus({label:"تم بنجاح",message:"تم تحديث النظام. يمكنك الاستمرار.",progress:100});
        setTimeout(()=>setMigrationStatus(null),1500);
      }catch(err){
        console.error("[V19.52] Split days migration failed:",err);
        try{
          await setDoc(doc(db,"migrationLog","split-days-v19.52-"+Date.now()),{
            type:"split-days-v19.52",status:"failed",
            details:(err.message||String(err)).slice(0,300),
            by:user.email||"system",at:new Date().toISOString(),
          });
        }catch(_){}
        splitDaysV1952MigrationRef.current=false;
        setMigrationStatus(null);
      }
    })();
  },[user,configDoc,splitLoaded]);

  /* ═══════════════════════════════════════════════════════════════════
     V19.53: One-time migration — refactor notifications + split by day.
     ──
     ─── المرحلة 1: refactor (per-user state) ───
     قبل: notifications: [{ id, msg, ..., readBy:[emails], dismissedBy:[emails], doneBy:[emails] }]
     بعد:
       notifications: [{ id, msg, ... }]   ← immutable post-create
       userNotifStates/{email}: { reads:{id:ts}, dismisses:{id:ts}, doneTasks:{id:ts} }

     ─── المرحلة 2: daily-split ───
     notifications → notificationsDays/{YYYY-MM-DD}

     السبب: قبل V19.53 لو 5 users قراوا نفس الإشعار في نفس اللحظة → 5 writes
     على نفس day-doc → race condition (lost updates). بالـrefactor كل user
     بيكتب على doc بتاعه الخاص → صفر contention.

     Prerequisite: V19.52 must be done (gate على _splitDaysV1952Done).
     ═══════════════════════════════════════════════════════════════════ */
  const splitDaysV1953MigrationRef=useRef(false);
  useEffect(()=>{
    if(!user||splitDaysV1953MigrationRef.current)return;
    if(!configDoc||!configDoc.accessories)return;
    if(!configDoc._splitDaysV1952Done)return;/* V19.52 must run first */
    if(configDoc._splitDaysV1953Done)return;
    if(!splitLoaded)return;

    const legacyNotifs=Array.isArray(configDoc.notifications)?configDoc.notifications:[];
    const totalLegacy=legacyNotifs.length;

    splitDaysV1953MigrationRef.current=true;

    (async()=>{
      try{
        if(totalLegacy===0){
          await runTransaction(db,async(tx)=>{
            const ref=doc(db,"factory","config");
            const snap=await tx.get(ref);
            if(!snap.exists())return;
            const fresh=snap.data();
            if(fresh._splitDaysV1953Done)return;
            tx.set(ref,{...fresh,_splitDaysV1953Done:true});
          });
          return;
        }

        setMigrationStatus({
          label:"جاري تحديث نظام الإشعارات (V19.53)",
          message:"الرجاء عدم إغلاق البرنامج. هذا يحدث مرة واحدة فقط.",
          progress:5,
        });

        /* Phase 1a: Backup */
        setMigrationStatus(s=>({...s,message:"إنشاء نسخة احتياطية...",progress:15}));
        const ts=new Date().toISOString().replace(/[:.]/g,"-");
        await setDoc(doc(db,"backups","pre-migration-notifications-v1953-"+ts),{
          label:"قبل ميجريشن: notifications-v19.53",
          autoGenerated:true,
          migrationType:"notifications-v19.53",
          createdAt:new Date().toISOString(),
          createdBy:user.email||"system",
          notifCount:totalLegacy,
          config:JSON.parse(JSON.stringify(configDoc)),
        });

        /* Phase 1b: Build per-user state from existing readBy/dismissedBy/doneBy */
        setMigrationStatus(s=>({...s,message:"استخراج حالة كل مستخدم للإشعارات...",progress:35}));
        const stateByEmail=new Map();/* email → {reads, dismisses, doneTasks} */
        const ensureEmailState=(email)=>{
          let st=stateByEmail.get(email);
          if(!st){st={reads:{},dismisses:{},doneTasks:{}};stateByEmail.set(email,st)}
          return st;
        };
        const migratedTs=new Date().toISOString();
        for(const n of legacyNotifs){
          if(!n||!n.id)continue;
          for(const email of (n.readBy||[])){
            if(typeof email==="string"&&email)ensureEmailState(email).reads[n.id]=migratedTs;
          }
          for(const email of (n.dismissedBy||[])){
            if(typeof email==="string"&&email)ensureEmailState(email).dismisses[n.id]=migratedTs;
          }
          for(const email of (n.doneBy||[])){
            if(typeof email==="string"&&email)ensureEmailState(email).doneTasks[n.id]=migratedTs;
          }
        }

        /* Write per-user state docs (one per user). */
        setMigrationStatus(s=>({...s,message:"كتابة doc لكل مستخدم...",progress:55}));
        for(const [email,st] of stateByEmail.entries()){
          try{
            await setDoc(doc(db,"userNotifStates",email),{
              ...st,
              updatedAt:migratedTs,
              _migratedFromV1953:true,
            },{merge:true});
          }catch(e){
            /* Non-fatal — log and continue. The notification entry will still be moved
               to a day doc; the user just won't have their migrated read/dismiss state.
               They can re-dismiss notifications they don't want to see. */
            console.warn("[V19.53] userNotifStates write failed for",email,":",e?.message||e);
          }
        }

        /* Phase 2: Strip readBy/dismissedBy/doneBy from notifications, then split by day */
        setMigrationStatus(s=>({...s,message:"تنظيف ونقل الإشعارات لـcollections يومية...",progress:75}));
        const cleanNotifs=legacyNotifs.map(n=>{
          if(!n)return n;
          const {readBy,dismissedBy,doneBy,read,...rest}=n;/* drop legacy fields */
          return rest;
        });
        const oldEmpty={notifications:[]};
        await syncAllSplitChanges(oldEmpty,{notifications:cleanNotifs});

        /* Phase 2b: Strip notifications from config + set V1953 flag (atomic) */
        setMigrationStatus(s=>({...s,message:"تنظيف الـconfig...",progress:90}));
        await runTransaction(db,async(tx)=>{
          const ref=doc(db,"factory","config");
          const snap=await tx.get(ref);
          if(!snap.exists())return;
          const fresh=snap.data();
          if(fresh._splitDaysV1953Done)return;
          const flagged={...fresh,_splitDaysV1953Done:true};
          const next=stripSplitArrays(flagged);
          tx.set(ref,next);
        });

        try{
          await setDoc(doc(db,"migrationLog","notifications-v19.53-"+Date.now()),{
            type:"notifications-v19.53",status:"success",
            notifCount:totalLegacy,
            userStateDocsWritten:stateByEmail.size,
            by:user.email||"system",at:new Date().toISOString(),
          });
        }catch(_){}

        noticeSuccess(
          "تم تطبيق تحديث V19.53 — الإشعارات",
          "تم نقل "+totalLegacy+" إشعار لـcollection يومية، وحالة القراءة/التجاهل لكل مستخدم بقت في doc لوحدها. الإشعارات بقت immutable بعد إنشائها — مفيش race conditions بعد كده."
        );
        setMigrationStatus({label:"تم بنجاح",message:"تم تحديث النظام. يمكنك الاستمرار.",progress:100});
        setTimeout(()=>setMigrationStatus(null),1500);
      }catch(err){
        console.error("[V19.53] Notifications migration failed:",err);
        try{
          await setDoc(doc(db,"migrationLog","notifications-v19.53-"+Date.now()),{
            type:"notifications-v19.53",status:"failed",
            details:(err.message||String(err)).slice(0,300),
            by:user.email||"system",at:new Date().toISOString(),
          });
        }catch(_){}
        splitDaysV1953MigrationRef.current=false;
        setMigrationStatus(null);
      }
    })();
  },[user,configDoc,splitLoaded]);

  /* ═══════════════════════════════════════════════════════════════════
     V19.51: One-time migration for SALES doc — split 2 arrays from
     factory/sales into daily collections:
       packages              → packagesDays/{YYYY-MM-DD}
       custDeliverySessions  → custDeliverySessionsDays/{YYYY-MM-DD}

     Why: factory/sales had 2 arrays growing daily. After this migration,
     factory/sales becomes a tiny settings-only doc (~5 KB). Same proven
     pattern as V19.49/V19.50 but on a different parent doc.

     Independent from config-doc migrations — no cross-flag dependency.
     ═══════════════════════════════════════════════════════════════════ */
  const salesSplitV1951MigrationRef=useRef(false);
  useEffect(()=>{
    if(!user||salesSplitV1951MigrationRef.current)return;
    if(!salesDoc)return;
    if(salesDoc[SALES_SPLIT_FLAG_V1951])return;/* already migrated */
    if(!salesSplitLoaded)return;/* listeners haven't fired yet */

    /* Anything to migrate? */
    const legacyArrays={};
    let totalLegacy=0;
    for(const f of SALES_SPLIT_FIELDS_V1951){
      const arr=Array.isArray(salesDoc[f])?salesDoc[f]:[];
      legacyArrays[f]=arr;
      totalLegacy+=arr.length;
    }

    salesSplitV1951MigrationRef.current=true;

    (async()=>{
      try{
        if(totalLegacy===0){
          /* لا يوجد بيانات للـmigrate — فقط نحط الـflag */
          await runTransaction(db,async(tx)=>{
            const ref=doc(db,"factory","sales");
            const snap=await tx.get(ref);
            const fresh=snap.exists()?snap.data():{};
            if(fresh[SALES_SPLIT_FLAG_V1951])return;
            tx.set(ref,{...fresh,[SALES_SPLIT_FLAG_V1951]:true});
          });
          return;
        }

        setMigrationStatus({
          label:"جاري تحديث نظام تخزين المبيعات (V19.51)",
          message:"الرجاء عدم إغلاق البرنامج. هذا يحدث مرة واحدة فقط.",
          progress:5,
        });

        /* Backup */
        setMigrationStatus(s=>({...s,message:"إنشاء نسخة احتياطية...",progress:15}));
        const ts=new Date().toISOString().replace(/[:.]/g,"-");
        await setDoc(doc(db,"backups","pre-migration-sales-split-v1951-"+ts),{
          label:"قبل ميجريشن: sales-split-v19.51",
          autoGenerated:true,
          migrationType:"sales-split-v19.51",
          createdAt:new Date().toISOString(),
          createdBy:user.email||"system",
          counts:Object.fromEntries(SALES_SPLIT_FIELDS_V1951.map(f=>[f,(salesDoc[f]||[]).length])),
          sales:JSON.parse(JSON.stringify(salesDoc)),
        });

        /* Sync to day collections */
        setMigrationStatus(s=>({...s,message:"نقل بيانات المبيعات لـcollections يومية...",progress:55}));
        const oldEmpty=Object.fromEntries(SALES_SPLIT_FIELDS_V1951.map(f=>[f,[]]));
        await syncAllSalesSplitChanges(oldEmpty,legacyArrays);

        /* Strip + flag in atomic transaction */
        setMigrationStatus(s=>({...s,message:"تنظيف factory/sales...",progress:85}));
        await runTransaction(db,async(tx)=>{
          const ref=doc(db,"factory","sales");
          const snap=await tx.get(ref);
          const fresh=snap.exists()?snap.data():{};
          if(fresh[SALES_SPLIT_FLAG_V1951])return;
          const flagged={...fresh,[SALES_SPLIT_FLAG_V1951]:true};
          const next=stripSalesSplitArrays(flagged);
          tx.set(ref,next);
        });

        try{
          await setDoc(doc(db,"migrationLog","sales-split-v19.51-"+Date.now()),{
            type:"sales-split-v19.51",status:"success",
            counts:Object.fromEntries(SALES_SPLIT_FIELDS_V1951.map(f=>[f,(salesDoc[f]||[]).length])),
            by:user.email||"system",at:new Date().toISOString(),
          });
        }catch(_){}

        noticeSuccess(
          "تم تطبيق تحديث V19.51 — المبيعات",
          "تم تحويل packages و custDeliverySessions لـcollections يومية. حجم factory/sales هينخفض بشكل كبير ومستحيل يكبر بعد كده."
        );
        setMigrationStatus({label:"تم بنجاح",message:"تم تحديث المبيعات. يمكنك الاستمرار.",progress:100});
        setTimeout(()=>setMigrationStatus(null),1500);
      }catch(err){
        console.error("[V19.51] Sales split migration failed:",err);
        try{
          await setDoc(doc(db,"migrationLog","sales-split-v19.51-"+Date.now()),{
            type:"sales-split-v19.51",status:"failed",
            details:(err.message||String(err)).slice(0,300),
            by:user.email||"system",at:new Date().toISOString(),
          });
        }catch(_){}
        salesSplitV1951MigrationRef.current=false;
        setMigrationStatus(null);
      }
    })();
  },[user,salesDoc,salesSplitLoaded]);

  /* ═══════════════════════════════════════════════════════════════════
     V19.51: One-time migration for TASKS doc — split 3 arrays from
     factory/tasks into daily collections:
       tasks            → tasksDays/{YYYY-MM-DD}
       stickyNotes      → stickyNotesDays/{YYYY-MM-DD}
       inventoryAudits  → inventoryAuditsDays/{YYYY-MM-DD}

     Independent from sales migration — runs in parallel.
     ═══════════════════════════════════════════════════════════════════ */
  const tasksSplitV1951MigrationRef=useRef(false);
  useEffect(()=>{
    if(!user||tasksSplitV1951MigrationRef.current)return;
    if(!tasksDoc)return;
    if(tasksDoc[TASKS_SPLIT_FLAG_V1951])return;
    if(!tasksSplitLoaded)return;

    const legacyArrays={};
    let totalLegacy=0;
    for(const f of TASKS_SPLIT_FIELDS_V1951){
      const arr=Array.isArray(tasksDoc[f])?tasksDoc[f]:[];
      legacyArrays[f]=arr;
      totalLegacy+=arr.length;
    }

    tasksSplitV1951MigrationRef.current=true;

    (async()=>{
      try{
        if(totalLegacy===0){
          await runTransaction(db,async(tx)=>{
            const ref=doc(db,"factory","tasks");
            const snap=await tx.get(ref);
            const fresh=snap.exists()?snap.data():{};
            if(fresh[TASKS_SPLIT_FLAG_V1951])return;
            tx.set(ref,{...fresh,[TASKS_SPLIT_FLAG_V1951]:true});
          });
          return;
        }

        setMigrationStatus({
          label:"جاري تحديث نظام تخزين المهام (V19.51)",
          message:"الرجاء عدم إغلاق البرنامج. هذا يحدث مرة واحدة فقط.",
          progress:5,
        });

        setMigrationStatus(s=>({...s,message:"إنشاء نسخة احتياطية...",progress:15}));
        const ts=new Date().toISOString().replace(/[:.]/g,"-");
        await setDoc(doc(db,"backups","pre-migration-tasks-split-v1951-"+ts),{
          label:"قبل ميجريشن: tasks-split-v19.51",
          autoGenerated:true,
          migrationType:"tasks-split-v19.51",
          createdAt:new Date().toISOString(),
          createdBy:user.email||"system",
          counts:Object.fromEntries(TASKS_SPLIT_FIELDS_V1951.map(f=>[f,(tasksDoc[f]||[]).length])),
          tasks:JSON.parse(JSON.stringify(tasksDoc)),
        });

        setMigrationStatus(s=>({...s,message:"نقل بيانات المهام لـcollections يومية...",progress:55}));
        const oldEmpty=Object.fromEntries(TASKS_SPLIT_FIELDS_V1951.map(f=>[f,[]]));
        await syncAllTasksSplitChanges(oldEmpty,legacyArrays);

        setMigrationStatus(s=>({...s,message:"تنظيف factory/tasks...",progress:85}));
        await runTransaction(db,async(tx)=>{
          const ref=doc(db,"factory","tasks");
          const snap=await tx.get(ref);
          const fresh=snap.exists()?snap.data():{};
          if(fresh[TASKS_SPLIT_FLAG_V1951])return;
          const flagged={...fresh,[TASKS_SPLIT_FLAG_V1951]:true};
          const next=stripTasksSplitArrays(flagged);
          tx.set(ref,next);
        });

        try{
          await setDoc(doc(db,"migrationLog","tasks-split-v19.51-"+Date.now()),{
            type:"tasks-split-v19.51",status:"success",
            counts:Object.fromEntries(TASKS_SPLIT_FIELDS_V1951.map(f=>[f,(tasksDoc[f]||[]).length])),
            by:user.email||"system",at:new Date().toISOString(),
          });
        }catch(_){}

        noticeSuccess(
          "تم تطبيق تحديث V19.51 — المهام",
          "تم تحويل tasks و stickyNotes و inventoryAudits لـcollections يومية. factory/tasks بقى ثابت الحجم — مستحيل يكبر بعد كده."
        );
        setMigrationStatus({label:"تم بنجاح",message:"تم تحديث المهام. يمكنك الاستمرار.",progress:100});
        setTimeout(()=>setMigrationStatus(null),1500);
      }catch(err){
        console.error("[V19.51] Tasks split migration failed:",err);
        try{
          await setDoc(doc(db,"migrationLog","tasks-split-v19.51-"+Date.now()),{
            type:"tasks-split-v19.51",status:"failed",
            details:(err.message||String(err)).slice(0,300),
            by:user.email||"system",at:new Date().toISOString(),
          });
        }catch(_){}
        tasksSplitV1951MigrationRef.current=false;
        setMigrationStatus(null);
      }
    })();
  },[user,tasksDoc,tasksSplitLoaded]);

  /* ═══════════════════════════════════════════════════════════════════
     V16.75: One-time migration — partition hrWeeks from factory/config
     into individual documents in hrWeeksDocs collection.
     
     Why: hrWeeks objects are large (~67 KB each). With 50 weeks/year,
     they would exceed the 1 MB Firestore document limit. By making each
     week its own document, the system can scale indefinitely.
     
     Pattern differs from V16.74:
     - V16.74: collection of small entries grouped BY DATE → daily doc
     - V16.75: array of large objects → ONE document PER object.id
     
     Once flag _partitionedV1675Done is set in config, this is skipped.
     ═══════════════════════════════════════════════════════════════════ */
  const partitionedMigrationRef=useRef(false);
  useEffect(()=>{
    if(!user||partitionedMigrationRef.current)return;
    if(!configDoc||!configDoc.accessories)return;
    if(configDoc._partitionedV1675Done)return;
    if(!partitionedLoaded)return;/* انتظر حتى listener يقرأ */
    
    const hasLegacyHrWeeks=Array.isArray(configDoc.hrWeeks)&&configDoc.hrWeeks.length>0;
    
    partitionedMigrationRef.current=true;
    
    (async()=>{
      try{
        if(!hasLegacyHrWeeks){
          /* لا يوجد بيانات — نحط الـflag فقط */
          await runTransaction(db,async(tx)=>{
            const ref=doc(db,"factory","config");
            const snap=await tx.get(ref);
            if(!snap.exists())return;
            const fresh=snap.data();
            if(fresh._partitionedV1675Done)return;
            tx.set(ref,{...fresh,_partitionedV1675Done:true});
          });
          return;
        }
        
        /* V17.1 FIX #12+#15: Show loading screen during partitioned migration */
        setMigrationStatus({
          label:"جاري تحديث نظام التخزين (V16.75)",
          message:"الرجاء عدم إغلاق البرنامج. هذا يحدث مرة واحدة فقط.",
          progress:5,
        });
        
        /* Backup */
        setMigrationStatus(s=>({...s,message:"إنشاء نسخة احتياطية...",progress:15}));
        const ts=new Date().toISOString().replace(/[:.]/g,"-");
        await setDoc(doc(db,"backups","pre-migration-partitioned-v1675-"+ts),{
          label:"قبل ميجريشن: partitioned-v16.75 (hrWeeks)",
          autoGenerated:true,
          migrationType:"partitioned-v16.75",
          createdAt:new Date().toISOString(),
          createdBy:user.email||"system",
          counts:{
            hrWeeks:(configDoc.hrWeeks||[]).length,
          },
          /* النسخة الكاملة من config */
          config:JSON.parse(JSON.stringify(configDoc)),
        });
        
        /* Sync to partitioned collection */
        setMigrationStatus(s=>({...s,message:"نقل أسابيع المرتبات إلى documents منفصلة...",progress:50}));
        await syncAllPartitionedChanges(
          {hrWeeks:[]},
          {hrWeeks:configDoc.hrWeeks||[]}
        );
        
        /* احذف hrWeeks من config وحط الـflag */
        setMigrationStatus(s=>({...s,message:"تنظيف الـconfig...",progress:85}));
        await runTransaction(db,async(tx)=>{
          const ref=doc(db,"factory","config");
          const snap=await tx.get(ref);
          if(!snap.exists())return;
          const fresh=snap.data();
          if(fresh._partitionedV1675Done)return;
          const next=stripPartitionedArrays(fresh);
          next._partitionedV1675Done=true;
          tx.set(ref,next);
        });
        
        try{
          await setDoc(doc(db,"migrationLog","partitioned-v16.75-"+Date.now()),{
            type:"partitioned-v16.75",status:"success",
            counts:{hrWeeks:(configDoc.hrWeeks||[]).length},
            by:user.email||"system",at:new Date().toISOString(),
          });
        }catch(_){}
        
        /* V16.75: الإعلام في الإعدادات بدلاً من toast popup */
        noticeSuccess(
          "تم تطبيق تحديث V16.75",
          "تم تقسيم أسابيع المرتبات لـdocuments منفصلة (كل أسبوع document مستقل)."
        );
        setMigrationStatus({label:"تم بنجاح",message:"تم تحديث النظام. يمكنك الاستمرار.",progress:100});
        setTimeout(()=>setMigrationStatus(null),1500);
      }catch(err){
        console.error("[V16.75] Partitioned migration failed:",err);
        try{
          await setDoc(doc(db,"migrationLog","partitioned-v16.75-"+Date.now()),{
            type:"partitioned-v16.75",status:"failed",
            details:(err.message||String(err)).slice(0,300),
            by:user.email||"system",at:new Date().toISOString(),
          });
        }catch(_){}
        partitionedMigrationRef.current=false;
        setMigrationStatus(null);
      }
    })();
  },[user,configDoc,partitionedLoaded]);

  /* ═══════════════════════════════════════════════════════════════════
     V19.57: One-time migration — partition 8 master-data arrays from
     factory/config into individual byId collections:
       customers       → customersDocs/{id}
       suppliers       → suppliersDocs/{id}
       workshops       → workshopsDocs/{id}
       employees       → employeesDocs/{id}
       empDebts        → empDebtsDocs/{id}
       generalProducts → generalProductsDocs/{id}
       fabrics         → fabricsDocs/{id}
       accessories     → accessoriesDocs/{id}

     After V19.57 = factory/config holds settings + lookup tables only
     (sizeSets, statusCards, garmentTypes, permissions, etc.). All operational
     entities live as individual docs → never hits 1MB regardless of count.

     Same pattern as V16.75 (hrWeeks) but for 8 fields. Pages keep reading
     `data.customers` etc. as full arrays — the merge layer in `config` useMemo
     hydrates from partitionedData when the V1957 flag is set.

     Prerequisite: V16.75 must be done first (gate on _partitionedV1675Done).
     ═══════════════════════════════════════════════════════════════════ */
  const partitionedV1957MigrationRef=useRef(false);
  useEffect(()=>{
    if(!user||partitionedV1957MigrationRef.current)return;
    if(!configDoc||!configDoc.accessories)return;
    if(!configDoc[PARTITIONED_FLAG_V1675])return;/* V16.75 must run first */
    if(configDoc[PARTITIONED_FLAG_V1957])return;/* already migrated */
    if(!partitionedLoaded)return;

    /* Anything to migrate? */
    const legacyArrays={};
    let totalLegacy=0;
    for(const f of PARTITIONED_FIELDS_V1957){
      const arr=Array.isArray(configDoc[f])?configDoc[f]:[];
      legacyArrays[f]=arr;
      totalLegacy+=arr.length;
    }

    partitionedV1957MigrationRef.current=true;

    (async()=>{
      try{
        if(totalLegacy===0){
          /* لا يوجد بيانات للـmigrate — فقط نحط الـflag */
          await runTransaction(db,async(tx)=>{
            const ref=doc(db,"factory","config");
            const snap=await tx.get(ref);
            if(!snap.exists())return;
            const fresh=snap.data();
            if(fresh[PARTITIONED_FLAG_V1957])return;
            tx.set(ref,{...fresh,[PARTITIONED_FLAG_V1957]:true});
          });
          return;
        }

        setMigrationStatus({
          label:"جاري تحديث نظام التخزين (V19.57)",
          message:"الرجاء عدم إغلاق البرنامج. هذا يحدث مرة واحدة فقط.",
          progress:5,
        });

        /* Backup */
        setMigrationStatus(s=>({...s,message:"إنشاء نسخة احتياطية...",progress:15}));
        const ts=new Date().toISOString().replace(/[:.]/g,"-");
        await setDoc(doc(db,"backups","pre-migration-partitioned-v1957-"+ts),{
          label:"قبل ميجريشن: partitioned-v19.57 (master data byId)",
          autoGenerated:true,
          migrationType:"partitioned-v19.57",
          createdAt:new Date().toISOString(),
          createdBy:user.email||"system",
          counts:Object.fromEntries(PARTITIONED_FIELDS_V1957.map(f=>[f,(configDoc[f]||[]).length])),
          config:JSON.parse(JSON.stringify(configDoc)),
        });

        /* V19.57: ensure every entity has an `id` field — required for byId collections.
           Some legacy data may have entries without id (numeric idx etc.); generate one. */
        for(const f of PARTITIONED_FIELDS_V1957){
          legacyArrays[f]=legacyArrays[f].map((entity,idx)=>{
            if(!entity)return entity;
            if(entity.id||entity.id===0)return entity;
            return{...entity,id:f.slice(0,3)+"_legacy_"+idx+"_"+Date.now().toString(36)};
          });
        }

        /* Sync to partitioned collections (8 fields × N docs each) */
        setMigrationStatus(s=>({...s,message:"نقل البيانات الأساسية لـdocuments منفصلة... ("+totalLegacy+" عنصر)",progress:50}));
        const oldEmpty=Object.fromEntries(PARTITIONED_FIELDS_V1957.map(f=>[f,[]]));
        await syncAllPartitionedChanges(oldEmpty,legacyArrays);

        /* Atomic strip + flag */
        setMigrationStatus(s=>({...s,message:"تنظيف الـconfig...",progress:85}));
        await runTransaction(db,async(tx)=>{
          const ref=doc(db,"factory","config");
          const snap=await tx.get(ref);
          if(!snap.exists())return;
          const fresh=snap.data();
          if(fresh[PARTITIONED_FLAG_V1957])return;
          const flagged={...fresh,[PARTITIONED_FLAG_V1957]:true};
          const next=stripPartitionedArrays(flagged);
          tx.set(ref,next);
        });

        try{
          await setDoc(doc(db,"migrationLog","partitioned-v19.57-"+Date.now()),{
            type:"partitioned-v19.57",status:"success",
            counts:Object.fromEntries(PARTITIONED_FIELDS_V1957.map(f=>[f,(configDoc[f]||[]).length])),
            by:user.email||"system",at:new Date().toISOString(),
          });
        }catch(_){}

        noticeSuccess(
          "تم تطبيق تحديث V19.57 — البيانات الأساسية",
          "تم تحويل العملاء/الموردين/الورش/الموظفين/المنتجات/الأقمشة/الإكسسوارات/الديون لـdocuments منفصلة. كل entity ملف لوحده — factory/config بقى ثابت الحجم تماماً."
        );
        setMigrationStatus({label:"تم بنجاح",message:"تم تحديث النظام. يمكنك الاستمرار.",progress:100});
        setTimeout(()=>setMigrationStatus(null),1500);
      }catch(err){
        console.error("[V19.57] Partitioned migration failed:",err);
        try{
          await setDoc(doc(db,"migrationLog","partitioned-v19.57-"+Date.now()),{
            type:"partitioned-v19.57",status:"failed",
            details:(err.message||String(err)).slice(0,300),
            by:user.email||"system",at:new Date().toISOString(),
          });
        }catch(_){}
        partitionedV1957MigrationRef.current=false;
        setMigrationStatus(null);
      }
    })();
  },[user,configDoc,partitionedLoaded]);

  /* ── LOCAL SNAPSHOT: save critical collections to localStorage on every config update ──
     V19.57: read from `config` (the merged useMemo) instead of `configDoc` directly,
     so post-migration the snapshot still has master-data arrays from partitionedData.
     V19.63 BUGFIX: dynamic over PARTITIONED_FIELDS so newly added fields auto-extend.
     Pre-V19.63 the writer was a hand-picked list of 12 keys — `hrWeeks` was OMITTED so
     HR/payroll never hydrated from cache → "empty list flash" symptom V19.59 was meant
     to eliminate persisted for HR. Now matches the reader (line ~296) exactly. */
  useEffect(()=>{if(!config||!config.accessories)return;
    try{const snap={
      ...Object.fromEntries(PARTITIONED_FIELDS.map(f=>[f,config[f]||[]])),
      /* Legacy non-partitioned keys kept for backward-compat (not currently re-hydrated) */
      sizeSets:config.sizeSets||[],garmentTypes:config.garmentTypes||[],
      statusCards:config.statusCards||[],treasuryAccounts:config.treasuryAccounts||[],
      savedAt:new Date().toISOString(),
    };
      localStorage.setItem("clark-data-snapshot",JSON.stringify(snap))}catch(e){}},[config]);

  /* ═══════════════════════════════════════════════════════════════════
     V16.74: SPLIT COLLECTIONS LISTENERS
     listeners على treasuryDays/, auditDays/, hrLogDays/.
     كل ما حصل تغيير في أي day document، نعيد بناء الـmerged array
     ونحطه في splitData state. الـconfig useMemo بيدمجه في data.treasury.
     ═══════════════════════════════════════════════════════════════════ */
  /* V17.0 FIX #8: Track pending optimistic writes per collection.
     Map structure: collectionName → Map(entryId → entry).
     When we apply an optimistic update, we record the pending entry here.
     When the listener fires with server data, we merge pending entries that
     haven't yet appeared in the server state, preventing flicker.
     When the server confirms an entry (it appears in the listener data),
     we remove it from the pending map. */
  /* V19.49: dynamic init over SPLIT_FIELDS so adding a new field doesn't require touching this. */
  const pendingSplitWritesRef=useRef(
    Object.fromEntries(SPLIT_FIELDS.map(f=>[f,new Map()]))
  );
  /* V19.51: parallel pending-writes refs for sales-doc + tasks-doc splits */
  const pendingSalesSplitWritesRef=useRef(
    Object.fromEntries(SALES_SPLIT_FIELDS.map(f=>[f,new Map()]))
  );
  const pendingTasksSplitWritesRef=useRef(
    Object.fromEntries(TASKS_SPLIT_FIELDS.map(f=>[f,new Map()]))
  );
  /* V19.57: dynamic init over PARTITIONED_FIELDS so new master-data fields are
     auto-included in pending-writes tracking (no manual edit per field). */
  const pendingPartitionedWritesRef=useRef(
    Object.fromEntries(PARTITIONED_FIELDS.map(f=>[f,new Map()]))
  );
  /* Helper: register pending writes after an optimistic update */
  /* V19.80.19: hard cap to prevent unbounded growth of the pending Map.
     With V19.80.16's removal of the blind 30s sweep + V19.80.19's stricter
     stable-field cleanup, pending entries that genuinely never confirm could
     accumulate. We cap at 5000 per field and FIFO-evict the oldest. The user
     is already warned via noticeWarn at >60s, so eviction is purely a memory
     safety valve, not data-loss insurance. */
  const PENDING_CAP=5000;
  const _capAndEvict=(map)=>{
    if(!map||map.size<=PENDING_CAP)return;
    /* FIFO eviction by timestamp ascending. Keep the cap exactly. */
    const sorted=[...map.entries()].sort((a,b)=>(a[1]?.timestamp||0)-(b[1]?.timestamp||0));
    const dropCount=map.size-PENDING_CAP;
    for(let i=0;i<dropCount;i++){
      map.delete(sorted[i][0]);
    }
    console.warn("[V19.80.19] pending map evicted "+dropCount+" oldest entries (cap "+PENDING_CAP+")");
  };
  const registerPendingSplitWrites=useCallback((before,after)=>{
    /* V19.49: iterate ALL split fields dynamically */
    for(const f of SPLIT_FIELDS){
      const beforeIds=new Set((before[f]||[]).map(e=>String(e?.id||"")));
      const afterArr=after[f]||[];
      for(const entry of afterArr){
        const id=String(entry?.id||"");
        if(!id)continue;
        const beforeEntry=(before[f]||[]).find(e=>String(e?.id||"")===id);
        /* Mark as pending if it's new OR if it changed */
        if(!beforeEntry||!_deepEqual(beforeEntry,entry)){/* V19.65: order-independent */
          pendingSplitWritesRef.current[f].set(id,{entry,timestamp:Date.now()});
        }
      }
      /* Pending deletes: in before but not in after */
      const afterIds=new Set(afterArr.map(e=>String(e?.id||"")));
      for(const id of beforeIds){
        if(!afterIds.has(id)){
          pendingSplitWritesRef.current[f].set(id,{deleted:true,timestamp:Date.now()});
        }
      }
      _capAndEvict(pendingSplitWritesRef.current[f]);
    }
  },[]);
  /* V19.51: same helper but for sales-doc split fields. Records adds/mods/deletes
     so the listener-driven rebuild merges optimistic state and the UI doesn't
     flicker between save → server-echo. */
  const registerPendingSalesSplitWrites=useCallback((before,after)=>{
    for(const f of SALES_SPLIT_FIELDS){
      const beforeIds=new Set((before[f]||[]).map(e=>String(e?.id||"")));
      const afterArr=after[f]||[];
      for(const entry of afterArr){
        const id=String(entry?.id||"");
        if(!id)continue;
        const beforeEntry=(before[f]||[]).find(e=>String(e?.id||"")===id);
        if(!beforeEntry||!_deepEqual(beforeEntry,entry)){/* V19.65: order-independent */
          pendingSalesSplitWritesRef.current[f].set(id,{entry,timestamp:Date.now()});
        }
      }
      const afterIds=new Set(afterArr.map(e=>String(e?.id||"")));
      for(const id of beforeIds){
        if(!afterIds.has(id)){
          pendingSalesSplitWritesRef.current[f].set(id,{deleted:true,timestamp:Date.now()});
        }
      }
    }
  },[]);
  /* V19.51: same helper but for tasks-doc split fields. */
  const registerPendingTasksSplitWrites=useCallback((before,after)=>{
    for(const f of TASKS_SPLIT_FIELDS){
      const beforeIds=new Set((before[f]||[]).map(e=>String(e?.id||"")));
      const afterArr=after[f]||[];
      for(const entry of afterArr){
        const id=String(entry?.id||"");
        if(!id)continue;
        const beforeEntry=(before[f]||[]).find(e=>String(e?.id||"")===id);
        if(!beforeEntry||!_deepEqual(beforeEntry,entry)){/* V19.65: order-independent */
          pendingTasksSplitWritesRef.current[f].set(id,{entry,timestamp:Date.now()});
        }
      }
      const afterIds=new Set(afterArr.map(e=>String(e?.id||"")));
      for(const id of beforeIds){
        if(!afterIds.has(id)){
          pendingTasksSplitWritesRef.current[f].set(id,{deleted:true,timestamp:Date.now()});
        }
      }
    }
  },[]);
  const registerPendingPartitionedWrites=useCallback((before,after)=>{
    /* V19.57: iterate ALL partitioned fields dynamically (was hardcoded ["hrWeeks"]). */
    for(const f of PARTITIONED_FIELDS){
      const beforeIds=new Set((before[f]||[]).map(o=>String(o?.id||"")));
      const afterArr=after[f]||[];
      for(const obj of afterArr){
        const id=String(obj?.id||"");
        if(!id)continue;
        const beforeObj=(before[f]||[]).find(o=>String(o?.id||"")===id);
        if(!beforeObj||!_deepEqual(beforeObj,obj)){/* V19.65: order-independent */
          pendingPartitionedWritesRef.current[f].set(id,{entry:obj,timestamp:Date.now()});
        }
      }
      const afterIds=new Set(afterArr.map(o=>String(o?.id||"")));
      for(const id of beforeIds){
        if(!afterIds.has(id)){
          pendingPartitionedWritesRef.current[f].set(id,{deleted:true,timestamp:Date.now()});
        }
      }
    }
  },[]);
  /* V19.80.16 ROOT-CAUSE FIX — DATA LOSS PREVENTION:
     Pre-V19.80.16 this loop blindly deleted any pending write older than 30s,
     under the assumption that "the server should have echoed it by then." This
     assumption is unsafe: when an entry FAILS to persist (e.g., silent date-
     rejection in splitCollections.js, partial sync failure, or any silent error),
     the optimistic UI shows it via the pending map until cleanup deletes it →
     entry vanishes from the UI permanently even though the user thought it saved.
     Real-world incident (W19, 2026-05-09): close-week + orphan-sync caused all
     Thursday treasury entries + a treasury transfer to disappear after 30s.

     New behavior:
     - flatten() at line ~2580 already deletes pending entries when the server
       confirms them (matches deep-equal). That's the only correct deletion path.
     - This loop NO LONGER deletes. It SURFACES stuck pending writes (>60s) as a
       user-visible warning notice so the user knows something didn't save and
       can refresh / retry, without silent data loss.
     - We mark each stuck entry as `_stuckReported` so the warning fires once. */
  useEffect(()=>{
    const interval=setInterval(()=>{
      const now=Date.now();
      const STUCK_MS=60000;
      const stuck=[];
      const _scan=(map,group,field)=>{
        if(!map)return;
        for(const[id,info]of map){
          if(now-info.timestamp<=STUCK_MS)continue;
          if(info._stuckReported)continue;
          info._stuckReported=true;
          stuck.push(group+"."+field+":"+id);
        }
      };
      for(const f of SPLIT_FIELDS)_scan(pendingSplitWritesRef.current[f],"split",f);
      for(const f of SALES_SPLIT_FIELDS)_scan(pendingSalesSplitWritesRef.current[f],"sales",f);
      for(const f of TASKS_SPLIT_FIELDS)_scan(pendingTasksSplitWritesRef.current[f],"tasks",f);
      for(const f of PARTITIONED_FIELDS)_scan(pendingPartitionedWritesRef.current[f],"part",f);
      if(stuck.length>0){
        console.error("[V19.80.16] "+stuck.length+" pending write(s) stuck >60s — likely failed to persist:",stuck.slice(0,20));
        noticeWarn(
          "تحذير: حركات لم تُحفظ على السيرفر",
          stuck.length+" حركة في حالة معلقة (لسه شايفها على الشاشة بس مش متسجلة في Firestore). اعمل refresh للصفحة وحاول تاني، أو راجع الـconsole. تفاصيل: "+stuck.slice(0,5).join(" | ")
        );
      }
    },10000);
    return()=>clearInterval(interval);
  },[]);

  useEffect(()=>{if(!user)return;
    const unsubs=[];
    /* Maps: dayId → entries[] لكل collection (V19.49: dynamic over SPLIT_FIELDS) */
    const dayDocs=Object.fromEntries(SPLIT_FIELDS.map(f=>[f,new Map()]));
    let firstFires=Object.fromEntries(SPLIT_FIELDS.map(f=>[f,false]));
    const rebuild=()=>{
      /* V16.75 FIX: flatten by sorting day keys DESC (newest day first), then concat each day's entries.
         This matches the expectation in TreasuryPg/HRPg/AuditPg that array is newest-first.
         Without this, Map insertion order leaks to the UI: oldest day's entries appear first.
         
         V17.0 FIX #8: Merge pending optimistic writes with server data to prevent flicker. */
      const flatten=(map,pendingMap)=>{
        const sortedDays=[...map.keys()].sort((a,b)=>b.localeCompare(a));
        const all=[];
        const serverIds=new Set();
        /* V19.48 FIX: Track duplicate ids across day docs for diagnostic logging.
           If the same id appears in 2+ day docs, only the FIRST occurrence (newest day,
           because sortedDays is DESC) is included in the merged array. The duplicates
           in older day docs are filtered out here at the UI layer; the cleanup
           migration in TreasuryPg removes them from Firestore as well.
           
           ROOT CAUSE: When a treasury entry's date was edited, the previous logic
           (V16.80 FIX #2) was supposed to remove from old day + add to new day. If
           the old-day removal silently failed (no retry on partial sync failures),
           the entry persisted in BOTH day docs with the same id. Without dedup, the
           UI showed 2 rows; deleting one removed the entry from local state by id
           (which matched both rows) but only cleaned ONE day doc on the server side. */
        const dupIds=new Set();
        for(const dayKey of sortedDays){
          const entries=map.get(dayKey)||[];
          for(const e of entries){
            const id=String(e?.id||"");
            /* V19.48 FIX: skip if already added from a newer day doc */
            if(id&&serverIds.has(id)){dupIds.add(id);continue;}
            /* Skip server entries that user just deleted optimistically */
            const pending=pendingMap.get(id);
            if(pending&&pending.deleted)continue;
            /* Use the pending (optimistic) version if it exists — server may be stale */
            if(pending&&pending.entry){
              all.push(pending.entry);
            }else{
              all.push(e);
            }
            serverIds.add(id);
          }
        }
        /* V19.48: Surface duplicates once per session for diagnostics */
        if(dupIds.size>0){
          /* Use a module-level Set to avoid spamming console on every rebuild */
          if(!window.__clarkSeenDups)window.__clarkSeenDups=new Set();
          for(const id of dupIds){
            if(!window.__clarkSeenDups.has(id)){
              window.__clarkSeenDups.add(id);
              console.warn("[V19.48 DEDUP] Duplicate id "+id+" found across day docs — kept newest, hiding older copies. The cleanup migration will remove duplicates from Firestore.");
            }
          }
        }
        /* Add pending entries that haven't appeared in server yet */
        for(const[id,info]of pendingMap){
          if(info.deleted)continue;
          if(!serverIds.has(id)&&info.entry){
            /* Insert at the start (newest-first convention) */
            all.unshift(info.entry);
          }
        }
        /* Cleanup: server has confirmed pending writes.
           V19.80.19 ROBUSTNESS FIX: pre-V19.80.19 we required a strict deepEqual
           match between server state and pending entry. If ANY code path enriched
           the server-side entry with extra fields (e.g., editedBy/editedAt on
           a transfer edit, _v193DupCleanup migration tags, _v199Recovered marks,
           server-side cloud-function transformations, even just whitespace
           differences in normalized fields), the deepEqual returned false and
           the pending entry NEVER got cleared — accumulating the pending Map
           indefinitely after V19.80.16 removed the blind 30s sweep. The Map
           growth + repeated stuck warnings made the V19.80.16 fix fragile.

           New strategy: compare only the STABLE business fields that uniquely
           identify the entry's economic content. If those match, server has
           the entry — pending can clear. Server-only enrichment fields are
           ignored. If any of these stable fields diverge, the pending stays
           visible (correct — there IS a real divergence the user should see). */
        const _stableMatch=(server,pending)=>{
          if(!server||!pending)return false;
          if(String(server.id||"")!==String(pending.id||""))return false;
          /* Compare key fields. Number-coerce amounts to ignore "5" vs 5 etc. */
          const eq=(a,b)=>{
            if(a===b)return true;
            if(a==null&&b==null)return true;
            return String(a||"")===String(b||"");
          };
          const numEq=(a,b)=>Math.abs((Number(a)||0)-(Number(b)||0))<0.005;
          if(!numEq(server.amount,pending.amount))return false;
          if(!eq(server.date,pending.date))return false;
          if(!eq(server.type,pending.type))return false;
          if(!eq(server.category,pending.category))return false;
          if(!eq(server.account,pending.account))return false;
          if(!eq(server.desc,pending.desc))return false;
          /* Specific cross-checks (cheap and accurate) */
          if(!eq(server.transferId,pending.transferId))return false;
          if(!eq(server.weekId,pending.weekId))return false;
          if(!eq(server.empId,pending.empId))return false;
          if(!eq(server.custId,pending.custId))return false;
          if(!eq(server.supplierId,pending.supplierId))return false;
          return true;
        };
        for(const[id,info]of pendingMap){
          if(info.deleted){
            /* Confirmed deleted: not in server anymore */
            if(!serverIds.has(id))pendingMap.delete(id);
          }else if(info.entry){
            const serverEntry=Array.from(map.values()).flat().find(e=>String(e?.id||"")===id);
            if(serverEntry&&_stableMatch(serverEntry,info.entry)){
              pendingMap.delete(id);
            }
          }
        }
        return all;
      };
      /* V19.49 + V19.60 + V19.61 BUGFIX: field-isolated rebuild + sync ref update.
         See partitioned rebuild for full reasoning. */
      setSplitData(prev=>{
        const next={...prev};
        for(const f of SPLIT_FIELDS){
          if(firstFires[f]){
            next[f]=flatten(dayDocs[f],pendingSplitWritesRef.current[f]||new Map());
          }
        }
        splitDataRef.current=next;/* V19.61: sync ref update */
        return next;
      });
      /* mark loaded after first round trip from ALL collections */
      if(SPLIT_FIELDS.every(f=>firstFires[f])){
        setSplitLoaded(true);
      }
    };
    const subscribeCol=(field,collName)=>{
      const map=dayDocs[field];
      const unsub=onSnapshot(collection(db,collName),snap=>{
        snap.docChanges().forEach(change=>{
          const docData=change.doc.data();
          const entries=(docData&&docData.entries)||[];
          if(change.type==="removed"){
            map.delete(change.doc.id);
          }else{
            map.set(change.doc.id,entries);
          }
        });
        firstFires[field]=true;
        rebuild();
      },err=>{
        console.error(`[V16.74] Listener error ${collName}:`,err);
        /* V19.61: do NOT mark firstFires=true on error. Pre-V19.61 we did, so the
           UI wouldn't hang on splitLoaded. But that side-effect is gone now (we
           dropped the merge gate in V19.59), and marking-on-error caused rebuild
           to run with empty docsById → wiped any cached/last-good values for this
           field. Now the error is logged + state preserved. The listener will
           reconnect automatically on the next Firestore retry; if a real boot
           hang happens, the loaded flag's only effect is gating writes (which is
           desirable — don't write before successfully reading). */
      });
      unsubs.push(unsub);
    };
    /* V19.49: subscribe to ALL split collections dynamically */
    for(const f of SPLIT_FIELDS){
      subscribeCol(f,SPLIT_COLLECTIONS[f]);
    }
    return()=>{unsubs.forEach(u=>u())};
  },[user]);

  /* ═══════════════════════════════════════════════════════════════════
     V19.51: SALES-DOC SPLIT LISTENERS
     packages → packagesDays/, custDeliverySessions → custDeliverySessionsDays/
     مرايا للـconfig listener بس على collections الـsales.
     ═══════════════════════════════════════════════════════════════════ */
  useEffect(()=>{if(!user)return;
    const unsubs=[];
    const dayDocs=Object.fromEntries(SALES_SPLIT_FIELDS.map(f=>[f,new Map()]));
    let firstFires=Object.fromEntries(SALES_SPLIT_FIELDS.map(f=>[f,false]));
    const rebuild=()=>{
      const flatten=(map,pendingMap)=>{
        const sortedDays=[...map.keys()].sort((a,b)=>b.localeCompare(a));
        const all=[];
        const serverIds=new Set();
        for(const dayKey of sortedDays){
          const entries=map.get(dayKey)||[];
          for(const e of entries){
            const id=String(e?.id||"");
            if(id&&serverIds.has(id))continue;
            const pending=pendingMap.get(id);
            if(pending&&pending.deleted)continue;
            if(pending&&pending.entry){all.push(pending.entry)}
            else{all.push(e)}
            serverIds.add(id);
          }
        }
        for(const[id,info]of pendingMap){
          if(info.deleted)continue;
          if(!serverIds.has(id)&&info.entry)all.unshift(info.entry);
        }
        for(const[id,info]of pendingMap){
          if(info.deleted){if(!serverIds.has(id))pendingMap.delete(id)}
          else if(info.entry){
            const serverEntry=Array.from(map.values()).flat().find(e=>String(e?.id||"")===id);
            if(serverEntry&&_deepEqual(serverEntry,info.entry))pendingMap.delete(id);/* V19.65: order-independent */
          }
        }
        return all;
      };
      /* V19.60 + V19.61: field-isolated rebuild + sync ref update. */
      setSalesSplitData(prev=>{
        const next={...prev};
        for(const f of SALES_SPLIT_FIELDS){
          if(firstFires[f]){
            next[f]=flatten(dayDocs[f],pendingSalesSplitWritesRef.current[f]||new Map());
          }
        }
        salesSplitDataRef.current=next;/* V19.61: sync ref update */
        return next;
      });
      if(SALES_SPLIT_FIELDS.every(f=>firstFires[f]))setSalesSplitLoaded(true);
    };
    const subscribeCol=(field,collName)=>{
      const map=dayDocs[field];
      const unsub=onSnapshot(collection(db,collName),snap=>{
        snap.docChanges().forEach(change=>{
          const docData=change.doc.data();
          const entries=(docData&&docData.entries)||[];
          if(change.type==="removed")map.delete(change.doc.id);
          else map.set(change.doc.id,entries);
        });
        firstFires[field]=true;
        rebuild();
      },err=>{
        console.error(`[V19.51] Sales listener error ${collName}:`,err);
        /* V19.61: do NOT wipe state on error — see split listener above. */
      });
      unsubs.push(unsub);
    };
    for(const f of SALES_SPLIT_FIELDS){
      subscribeCol(f,SALES_SPLIT_COLLECTIONS[f]);
    }
    return()=>{unsubs.forEach(u=>u())};
  },[user]);

  /* ═══════════════════════════════════════════════════════════════════
     V19.51: TASKS-DOC SPLIT LISTENERS
     tasks/stickyNotes/inventoryAudits → tasksDays/, stickyNotesDays/, inventoryAuditsDays/
     ═══════════════════════════════════════════════════════════════════ */
  useEffect(()=>{if(!user)return;
    const unsubs=[];
    const dayDocs=Object.fromEntries(TASKS_SPLIT_FIELDS.map(f=>[f,new Map()]));
    let firstFires=Object.fromEntries(TASKS_SPLIT_FIELDS.map(f=>[f,false]));
    const rebuild=()=>{
      const flatten=(map,pendingMap)=>{
        const sortedDays=[...map.keys()].sort((a,b)=>b.localeCompare(a));
        const all=[];
        const serverIds=new Set();
        for(const dayKey of sortedDays){
          const entries=map.get(dayKey)||[];
          for(const e of entries){
            const id=String(e?.id||"");
            if(id&&serverIds.has(id))continue;
            const pending=pendingMap.get(id);
            if(pending&&pending.deleted)continue;
            if(pending&&pending.entry){all.push(pending.entry)}
            else{all.push(e)}
            serverIds.add(id);
          }
        }
        for(const[id,info]of pendingMap){
          if(info.deleted)continue;
          if(!serverIds.has(id)&&info.entry)all.unshift(info.entry);
        }
        for(const[id,info]of pendingMap){
          if(info.deleted){if(!serverIds.has(id))pendingMap.delete(id)}
          else if(info.entry){
            const serverEntry=Array.from(map.values()).flat().find(e=>String(e?.id||"")===id);
            if(serverEntry&&_deepEqual(serverEntry,info.entry))pendingMap.delete(id);/* V19.65: order-independent */
          }
        }
        return all;
      };
      /* V19.60 + V19.61: field-isolated rebuild + sync ref update. */
      setTasksSplitData(prev=>{
        const next={...prev};
        for(const f of TASKS_SPLIT_FIELDS){
          if(firstFires[f]){
            next[f]=flatten(dayDocs[f],pendingTasksSplitWritesRef.current[f]||new Map());
          }
        }
        tasksSplitDataRef.current=next;/* V19.61: sync ref update */
        return next;
      });
      if(TASKS_SPLIT_FIELDS.every(f=>firstFires[f]))setTasksSplitLoaded(true);
    };
    const subscribeCol=(field,collName)=>{
      const map=dayDocs[field];
      const unsub=onSnapshot(collection(db,collName),snap=>{
        snap.docChanges().forEach(change=>{
          const docData=change.doc.data();
          const entries=(docData&&docData.entries)||[];
          if(change.type==="removed")map.delete(change.doc.id);
          else map.set(change.doc.id,entries);
        });
        firstFires[field]=true;
        rebuild();
      },err=>{
        console.error(`[V19.51] Tasks listener error ${collName}:`,err);
        /* V19.61: do NOT wipe state on error — see split listener above. */
      });
      unsubs.push(unsub);
    };
    for(const f of TASKS_SPLIT_FIELDS){
      subscribeCol(f,TASKS_SPLIT_COLLECTIONS[f]);
    }
    return()=>{unsubs.forEach(u=>u())};
  },[user]);

  /* ═══════════════════════════════════════════════════════════════════
     V19.53: USER NOTIFICATION STATE LISTENER
     userNotifStates/{userEmail} = {reads, dismisses, doneTasks, updatedAt}
     يـsubscribe على doc واحد فقط (الخاص بالـuser الحالي). كل user يكتب على
     doc بتاعه فقط — مفيش contention بين users على نفس الـdoc.
     ═══════════════════════════════════════════════════════════════════ */
  useEffect(()=>{
    const email=user?.email||"";
    if(!user||!email)return;
    const ref=doc(db,"userNotifStates",email);
    const unsub=onSnapshot(ref,snap=>{
      const data=snap.exists()?snap.data():{};
      setUserNotifState({
        reads:data.reads||{},
        dismisses:data.dismisses||{},
        doneTasks:data.doneTasks||{},
      });
    },err=>{
      console.error("[V19.53] userNotifStates listener error:",err);
      setUserNotifState({reads:{},dismisses:{},doneTasks:{}});
    });
    return()=>unsub();
  },[user]);

  /* ═══════════════════════════════════════════════════════════════════
     V16.75: PARTITIONED COLLECTIONS LISTENERS
     hrWeeks → hrWeeksDocs/{weekId}
     كل week.id يبقى document مستقل. listener بيحدث partitionedData.
     ═══════════════════════════════════════════════════════════════════ */
  useEffect(()=>{if(!user)return;
    const unsubs=[];
    /* V19.57: dynamic init over PARTITIONED_FIELDS (was hardcoded {hrWeeks: ...}). */
    const docsById=Object.fromEntries(PARTITIONED_FIELDS.map(f=>[f,new Map()]));
    const firstFires=Object.fromEntries(PARTITIONED_FIELDS.map(f=>[f,false]));
    const rebuild=()=>{
      /* V17.0 FIX #8: Merge pending optimistic writes with server data */
      const flatten=(map,pendingMap)=>{
        const all=[];
        const serverIds=new Set();
        for(const obj of map.values()){
          const id=String(obj?.id||"");
          const pending=pendingMap.get(id);
          if(pending&&pending.deleted)continue;
          if(pending&&pending.entry){
            all.push(pending.entry);
          }else{
            all.push(obj);
          }
          serverIds.add(id);
        }
        /* Add pending writes not yet seen in server */
        for(const[id,info]of pendingMap){
          if(info.deleted)continue;
          if(!serverIds.has(id)&&info.entry){
            all.push(info.entry);
          }
        }
        /* Cleanup confirmed pending */
        for(const[id,info]of pendingMap){
          if(info.deleted){
            if(!serverIds.has(id))pendingMap.delete(id);
          }else if(info.entry){
            const serverObj=Array.from(map.values()).find(o=>String(o?.id||"")===id);
            if(serverObj&&_deepEqual(serverObj,info.entry)){/* V19.65: order-independent */
              pendingMap.delete(id);
            }
          }
        }
        all.sort((a,b)=>String(a.id||"").localeCompare(String(b.id||"")));
        return all;
      };
      /* V19.57 + V19.60 + V19.61 BUGFIX:
         V19.60 added field-isolation (only update fields whose listener fired).
         V19.61 fixes the REMAINING race: partitionedDataRef.current is updated
         via useEffect AFTER render commit. There's a brief window where state
         has been queued but ref still holds old value. If the user clicks
         "confirm sale" in that window, upConfig reads explicitPartBefore from
         ref (stale, possibly empty), writes empty arrays into newPart, and
         setPartitionedData(newPart) persists the wipe.
         Fix: update the ref SYNCHRONOUSLY inside the setState callback so any
         immediate-next upConfig sees the freshly-computed value. Same pattern
         as the V19.54 configDocRef fix. */
      setPartitionedData(prev=>{
        const next={...prev};
        for(const f of PARTITIONED_FIELDS){
          if(firstFires[f]){
            next[f]=flatten(docsById[f],pendingPartitionedWritesRef.current[f]||new Map());
          }
          /* else: keep prev[f] (cache from localStorage or last good value) */
        }
        partitionedDataRef.current=next;/* V19.61: sync ref update inside callback */
        return next;
      });
      /* mark loaded after first round trip from EVERY collection */
      if(PARTITIONED_FIELDS.every(f=>firstFires[f])){
        setPartitionedLoaded(true);
      }
    };
    const subscribeCol=(field,collName)=>{
      const map=docsById[field];
      const unsub=onSnapshot(collection(db,collName),snap=>{
        snap.docChanges().forEach(change=>{
          const docData=change.doc.data();
          if(change.type==="removed"){
            map.delete(change.doc.id);
          }else if(docData&&docData.id){
            map.set(change.doc.id,docData);
          }
        });
        firstFires[field]=true;
        rebuild();
      },err=>{
        console.error(`[V19.57] Partitioned listener error ${collName}:`,err);
        /* V19.61: do NOT wipe state on error. Pre-V19.61 we marked firstFires
           and rebuilt — which wiped the cached/loaded customers/suppliers/etc.
           when ANY listener errored. After-sale "العملاء (0)" was traced to a
           transient permission re-eval during the config write triggering an
           error pulse on customersDocs listener, which then wiped the cache.
           Now the error is logged but state stays intact; the SDK retries the
           subscription automatically. */
      });
      unsubs.push(unsub);
    };
    /* V19.57: subscribe to ALL partitioned collections dynamically */
    for(const f of PARTITIONED_FIELDS){
      subscribeCol(f,PARTITIONED_COLLECTIONS[f]);
    }
    return()=>{unsubs.forEach(u=>u())};
  },[user]);

  useEffect(()=>{if(!user||!season)return;setDataLoading(true);const unsub=onSnapshot(collection(db,"seasons",season,"orders"),snap=>{setOrders(snap.docs.map(d=>{const o={_docId:d.id,...d.data()};if(o.status)o.status=migrateStatus(o.status);return o}).filter(o=>o.id));setDataLoading(false);setListenerStatus(s=>({...s,orders:true}))},err=>{console.error("[V18.60] orders listener error:",err);setDataLoading(false);setListenerStatus(s=>({...s,lastError:"orders: "+(err?.code||err?.message||"unknown")}))});return()=>unsub()},[user,season]);

  /* ═══ AUTO-BACKUP: once per day per user — V18.62: NOW COMPREHENSIVE ═══
     
     Pre-V18.62: backup contained only configDoc + salesDoc + tasksDoc + current
     season's orders. This MISSED treasury, audit log, hr log, hr weeks, and
     orders from other seasons (since the V16.74 split-collections migration).
     
     V18.62: backup is now comprehensive — includes ALL collections via
     createComprehensiveBackup(). Larger (5-50MB depending on data volume) but
     actually protects everything.
     
     Cleanup keeps last 14 comprehensive auto-backups (~14 days). Older ones
     are deleted along with their part docs. */
  useEffect(()=>{
    if(!user||!configDoc||!configDoc.accessories)return;/* wait for data load */
    if(!configLoaded)return;/* V18.62 SAFETY: never auto-backup before config is loaded */
    const today=new Date().toISOString().split("T")[0];
    const lastBackupKey="clark-last-backup-"+user.uid;
    let lastBackup=null;try{lastBackup=localStorage.getItem(lastBackupKey)}catch(e){}
    if(lastBackup===today)return;/* already backed up today on this device */
    /* Schedule backup after 30s to avoid doing it on every page load race */
    const timer=setTimeout(async()=>{
      try{
        /* V18.62: Multi-device coordination — check if a comprehensive backup
           with today's date prefix already exists (another device beat us to it). */
        const todayPrefix="auto-comp-"+today.replace(/-/g,"-");
        const allSnap=await getDocs(collection(db,"backups"));
        let alreadyDoneToday=false;
        allSnap.forEach(d=>{
          const data=d.data();
          if(!data.autoGenerated||!data.isComprehensive)return;
          const cAt=(data.createdAt||"").slice(0,10);
          if(cAt===today)alreadyDoneToday=true;
        });
        if(alreadyDoneToday){
          try{localStorage.setItem(lastBackupKey,today)}catch(e){}
          return;
        }
        /* Run the comprehensive backup */
        await createComprehensiveBackup({
          label:"تلقائية شاملة (يومية)",
          user:{email:user.email,uid:user.uid},
          autoGenerated:true,
          /* Silent — no UI feedback for daily auto-backup */
          onProgress:()=>{},
        });
        try{localStorage.setItem(lastBackupKey,today)}catch(e){}
        /* Cleanup: keep only last 14 auto-comprehensive backups */
        try{
          const snap=await getDocs(collection(db,"backups"));
          const autos=[];
          snap.forEach(d=>{
            const x=d.data();
            if(x.autoGenerated&&x.isComprehensive){
              autos.push({id:d.id,createdAt:x.createdAt});
            }
          });
          autos.sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""));
          const toDelete=autos.slice(14);
          for(const a of toDelete){
            try{await deleteComprehensiveBackup(a.id)}
            catch(e){console.warn("Cleanup delete failed for "+a.id+":",e)}
          }
        }catch(e){console.warn("Cleanup failed:",e)}
      }catch(e){console.error("[V18.62] Auto-backup failed:",e)}
    },30000);
    return()=>clearTimeout(timer);
  },[user,configDoc?.accessories,configLoaded]);/* trigger when data first loads */

  /* ═══ TRANSACTION-SAFE WRITES ═══
     V15.69: Smarter retry — transaction conflicts are expected during concurrent
     writes (e.g. admin + payroll editing simultaneously). We retry silently up to
     5 times with exponential backoff before showing any error. Only persistent
     failures (network down, permissions) surface to the user.
     Each write re-reads the doc inside a transaction, applies the change,
     and writes back atomically. */
  const _sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  /* V16.74: ref to current splitData للقراءة من داخل upConfigTx (transactions تشتغل بدون state freshness) */
  const splitDataRef=useRef(splitData);
  /* V19.51: parallel refs for sales-doc + tasks-doc splits */
  const salesSplitDataRef=useRef(salesSplitData);
  const tasksSplitDataRef=useRef(tasksSplitData);
  useEffect(()=>{splitDataRef.current=splitData},[splitData]);
  /* V19.51: keep sales/tasks split refs current */
  useEffect(()=>{salesSplitDataRef.current=salesSplitData},[salesSplitData]);
  useEffect(()=>{tasksSplitDataRef.current=tasksSplitData},[tasksSplitData]);
  /* V17.4: keep configDocRef in sync — used by config listener to detect own optimistic state */
  useEffect(()=>{configDocRef.current=configDoc},[configDoc]);
  /* V19.48: Same pattern for sales/tasks — used by their fallback writers */
  useEffect(()=>{salesDocRef.current=salesDoc},[salesDoc]);
  useEffect(()=>{tasksDocRef.current=tasksDoc},[tasksDoc]);
  /* V16.75: ref to current partitionedData للقراءة من داخل upConfigTx */
  const partitionedDataRef=useRef(partitionedData);
  useEffect(()=>{partitionedDataRef.current=partitionedData},[partitionedData]);
  /* V17.2 CRITICAL FIX: signature changed — now accepts pre-computed objects instead of fn.
     The user's fn runs ONCE in upConfig (the caller). We just write the result here.
     This prevents id duplication on transaction retries. */
  const upConfigTx=useCallback(async(precomputedNext,precomputedNewSplit,precomputedNewPart,explicitSplitBefore,explicitPartBefore)=>{
    /* V19.55: Serialize writes via promise chain. See upConfigWriteQueueRef
       declaration for the full reasoning. The actual write logic is wrapped in
       _doWrite below; the chain ensures setDoc N only runs after setDoc N-1
       finished, so Firestore receives writes in the call order (latest wins). */
    const _doWrite=async()=>{
    const ref=doc(db,"factory","config");
    let lastErr=null;
    /* V16.75 CRITICAL SAFETY: refuse to write if split/partitioned data hasn't loaded yet.
       Otherwise we'd inject empty arrays into config and lose all server data. */
    if(configDoc&&configDoc._splitDaysV1674Done&&!splitLoaded){
      console.error("[V16.75 SAFETY] Refusing upConfig — splitData not loaded yet");
      showToast("⏳ البرنامج لسه بيحمّل البيانات — حاول تاني بعد ثانيتين");
      return;
    }
    /* V19.57: refuse if any partitioned migration is done but listeners haven't loaded yet */
    if(configDoc&&(configDoc[PARTITIONED_FLAG_V1675]||configDoc[PARTITIONED_FLAG_V1957])&&!partitionedLoaded){
      console.error("[V19.57 SAFETY] Refusing upConfig — partitionedData not loaded yet");
      showToast("⏳ البرنامج لسه بيحمّل البيانات — حاول تاني بعد ثانيتين");
      return;
    }
    /* V19.49: dynamic splitBefore covering ALL split fields */
    const splitBefore=explicitSplitBefore||Object.fromEntries(
      SPLIT_FIELDS.map(f=>[f,splitDataRef.current[f]||[]])
    );
    /* V19.57: dynamic partBefore covering ALL partitioned fields */
    const partBefore=explicitPartBefore||Object.fromEntries(
      PARTITIONED_FIELDS.map(f=>[f,partitionedDataRef.current[f]||[]])
    );
    /* V17.2: Use precomputed values directly. No fn re-execution. */
    const splitActive=Boolean(configDoc?._splitDaysV1674Done);
    /* V19.57: partActive triggered by either V1675 or V1957 flag */
    const partActive=Boolean(configDoc?.[PARTITIONED_FLAG_V1675])||Boolean(configDoc?.[PARTITIONED_FLAG_V1957]);
    const splitAfter=splitActive?precomputedNewSplit:null;
    const partAfter=partActive?precomputedNewPart:null;
    /* Strip the precomputed next */
    let stripped=precomputedNext;
    if(splitActive)stripped=stripSplitArrays(stripped);
    if(partActive)stripped=stripPartitionedArrays(stripped);
    /* V15.69: Up to 5 retries with exponential backoff */
    for(let attempt=0;attempt<5;attempt++){
      try{
        /* V17.2: simple write — no transaction needed since fn already ran.
           The precomputed `stripped` object has all the changes baked in.
           
           Why use setDoc instead of runTransaction:
           - The point of runTransaction was to read-modify-write atomically (fn(next) used
             current value). Now fn already ran with our local view of the data, and we
             just want to write the result. setDoc(merge:false) is the correct API.
           - This also means concurrent writes from other users will overwrite each other,
             but that was ALREADY the behavior — our previous fn used `splitBefore` (a
             local snapshot), so any concurrent server change would be lost on retry too.
             The retry mechanism only helped with transient errors, not concurrent edits. */
        await setDoc(ref,stripped,{merge:false});
        /* V19.48: write reached the server — record the sync timestamp for the topbar pill. */
        markSynced();
        /* V16.74: sync split day docs */
        if(splitActive&&splitAfter){
          /* V19.48 FIX: Retry sync up to 3 times with backoff. The previous
             behavior was "log on first failure, no retry" — which left Firestore
             in inconsistent state when one of the parallel day-doc writes failed
             (e.g. on date-change: new-day write succeeds but old-day delete fails,
             leaving the entry in BOTH days with the same id = the duplication bug). */
          let syncErr=null;
          for(let syncAttempt=0;syncAttempt<3;syncAttempt++){
            try{
              await syncAllSplitChanges(splitBefore,splitAfter);
              syncErr=null;
              break;
            }catch(e){
              syncErr=e;
              console.warn("[V19.48] syncAllSplitChanges attempt "+(syncAttempt+1)+" failed:",e?.message||e);
              if(syncAttempt<2)await _sleep(150*Math.pow(2,syncAttempt));
            }
          }
          if(syncErr){
            console.error("[V16.74] Failed to sync split day docs after 3 retries:",syncErr);
            /* V16.75: notice فقط — لا توست عشان ما يقفزش للمستخدم */
            noticeWarn(
              "تعذر حفظ بعض البيانات في وضع التخزين اليومي",
              "خطأ في كتابة documents الـsplit (treasury/audit/hrLog) بعد 3 محاولات. البيانات الأساسية محفوظة في factory/config، لكن الـday docs قد لا تكون متزامنة. التفاصيل: "+(syncErr.message||String(syncErr)).slice(0,200)
            );
          }
        }
        /* V16.75: sync partitioned docs */
        if(partActive&&partAfter){
          /* V19.48 FIX: same retry pattern for hrWeeks partitioned writes */
          let syncErr=null;
          for(let syncAttempt=0;syncAttempt<3;syncAttempt++){
            try{
              await syncAllPartitionedChanges(partBefore,partAfter);
              syncErr=null;
              break;
            }catch(e){
              syncErr=e;
              console.warn("[V19.48] syncAllPartitionedChanges attempt "+(syncAttempt+1)+" failed:",e?.message||e);
              if(syncAttempt<2)await _sleep(150*Math.pow(2,syncAttempt));
            }
          }
          if(syncErr){
            console.error("[V16.75] Failed to sync partitioned docs after 3 retries:",syncErr);
            noticeWarn(
              "تعذر حفظ أسابيع المرتبات في الـcollection المنفصلة",
              "خطأ في كتابة hrWeeksDocs بعد 3 محاولات. البيانات الأساسية محفوظة، لكن الـpartitioned docs قد لا تكون متزامنة. التفاصيل: "+(syncErr.message||String(syncErr)).slice(0,200)
            );
          }
        }
        return;/* success */
      }catch(e){
        lastErr=e;
        const code=e?.code||"";
        const retriable=code==="aborted"||code==="already-exists"||code==="deadline-exceeded"||code==="unavailable"||code==="internal"||!code;
        if(!retriable||attempt===4)break;
        await _sleep(100*Math.pow(2,attempt));
      }
    }
    /* All retries exhausted — fallback path.
       V19.48 FIX: Don't show "فشل حفظ" toast pre-emptively. Previously the user
       saw a scary failure toast EVEN WHEN the fallback succeeded a moment later
       — leading to "فشل التسجيل لكن البيانات اتسجلت" reports. New behavior:
         - Silent retry via fallback setDoc
         - On fallback success: log warning to console, show subtle "✓ تم الحفظ" only
         - On fallback failure: show categorized error with forensic details */
    console.warn("[V19.48] upConfig tx exhausted retries — attempting fallback. Last error:", lastErr?.message||lastErr);
    try{
      /* V17.2: simpler fallback — we already have precomputed objects. */
      /* V17.0 FIX #9: Sync day docs FIRST (idempotent and safe to retry) */
      try{
        if(splitAfter)await syncAllSplitChanges(splitBefore,splitAfter);
        if(partAfter)await syncAllPartitionedChanges(partBefore,partAfter);
      }catch(syncErr){
        const cat = categorizeWriteError(syncErr);
        const forensic = buildForensicLine({
          docPath: "factory/{splitDays|hrWeeks}",
          docSize: -1,
          errCode: syncErr?.code || "",
          errMsg: syncErr?.message || String(syncErr),
          attempts: 5,
          operation: "upConfig-syncDocs",
        });
        console.error(forensic);
        showToast("⛔ فشل حفظ بعض البيانات (sync): "+(cat.arabic||""));
        return;
      }
      try{
        await setDoc(ref,stripped,{merge:false});
        markSynced(); /* V19.48: fallback DID reach server */
        /* Quiet success — don't alarm user. The data IS saved, no need for warnings. */
        console.warn("[V19.48] upConfig recovered via fallback setDoc");
      }catch(er){
        const cat = categorizeWriteError(er);
        const docSize = estimateDocSize(stripped);
        const forensic = buildForensicLine({
          docPath: "factory/config",
          docSize,
          errCode: er?.code || "",
          errMsg: er?.message || String(er),
          attempts: 5,
          operation: "upConfig",
        });
        console.error(forensic);
        showToast("⛔ فشل حفظ البيانات: "+(cat.arabic||"خطأ غير معروف")+(docSize > FIRESTORE_DOC_WARN_BYTES ? " (حجم البيانات: "+formatBytes(docSize)+")" : ""));
      }
    }catch(fallbackErr){
      const cat = categorizeWriteError(fallbackErr);
      console.error("[V19.48] upConfig fallback unexpected error:", fallbackErr);
      showToast("⚠️ تعذر الحفظ: "+(cat.arabic||((fallbackErr.message||String(fallbackErr)).substring(0,80))));
    }
    };/* end of _doWrite */
    /* V19.55: chain onto the per-doc write queue. Each call's setDoc starts only
       after the previous call's setDoc finished — guarantees Firestore receives
       writes in the same order they were called (latest call wins). */
    const myWrite=upConfigWriteQueueRef.current.then(_doWrite);
    /* Keep the chain alive even if a write rejected — we don't want one failure
       to permanently break subsequent writes. The actual error is still thrown
       to the caller via myWrite. */
    upConfigWriteQueueRef.current=myWrite.catch(()=>{});
    return myWrite;
  },[configDoc,splitLoaded,partitionedLoaded,markSynced]);
  const upConfig=useCallback(fn=>{
    /* V19.48: Online-only mode — refuse all writes when device is offline.
       Reading from cache is fine, but writes must reach the server immediately
       to avoid the race conditions that motivated this whole online-only push.
       Read-only banner + topbar pill already tell the user; this is the actual
       enforcement gate. Toast gives them an explicit, immediate signal. */
    if(!isOnlineRef.current){
      console.warn("[V19.48] Refusing upConfig — device is offline");
      showToast("⛔ أنت أوفلاين دلوقتي — التعديل مش متاح لحد ما النت يرجع");
      return;
    }
    /* V18.60 CRITICAL SAFETY: refuse all writes if config not loaded from server yet.
       Previously, writes could happen with INIT_CONFIG as base (during the brief
       window between app mount and first config snapshot), which would OVERWRITE
       real data with defaults — wiping users, customers, workshops, etc. */
    if(!configLoaded){
      console.error("[V18.60 SAFETY] Refusing upConfig — configDoc not loaded from server yet");
      showToast("⏳ البيانات لسه بتتحمّل من السيرفر — استنى ثانيتين وحاول تاني");
      return;
    }
    /* V18.60 CRITICAL SAFETY: refuse writes if config has known error state.
       Writing on top of an error could corrupt data further. */
    if(configError){
      console.error("[V18.60 SAFETY] Refusing upConfig — configError is set:",configError);
      showToast("⛔ فيه مشكلة في تحميل الإعدادات — اقفل وافتح التطبيق أو اتصل بالدعم");
      return;
    }
    /* V16.75 SAFETY: refuse if split/partitioned data not loaded */
    if(configDoc&&configDoc._splitDaysV1674Done&&!splitLoaded){
      console.error("[V16.75 SAFETY] Refusing upConfig — splitData not loaded yet");
      showToast("⏳ البرنامج لسه بيحمّل البيانات — حاول تاني بعد ثانيتين");
      return;
    }
    /* V19.57: refuse if any partitioned migration is done but listeners haven't loaded yet */
    if(configDoc&&(configDoc[PARTITIONED_FLAG_V1675]||configDoc[PARTITIONED_FLAG_V1957])&&!partitionedLoaded){
      console.error("[V19.57 SAFETY] Refusing upConfig — partitionedData not loaded yet");
      showToast("⏳ البرنامج لسه بيحمّل البيانات — حاول تاني بعد ثانيتين");
      return;
    }
    /* V16.75 FIX: capture PRE-mutation snapshots NOW, pass them explicitly to upConfigTx.
       The optimistic update below mutates splitDataRef.current, so by the time
       upConfigTx runs (in next async tick), reading splitDataRef would give the
       post-mutation state — making the diff produce zero changes. */
    /* V19.49: dynamic snapshot of all split fields */
    const explicitSplitBefore=Object.fromEntries(
      SPLIT_FIELDS.map(f=>[f,[...(splitDataRef.current[f]||[])]])
    );
    /* V19.62 ROOT-CAUSE FIX: dynamic snapshot of ALL partitioned fields.
       Pre-V19.62 this was hardcoded to {hrWeeks: [...]} — a leftover from V16.75
       when only hrWeeks was partitioned. V19.57 added 8 master-data fields
       (customers, suppliers, workshops, employees, empDebts, generalProducts,
       fabrics, accessories) but THIS line was never updated. The hydration loop
       below reads explicitPartBefore[customers] = undefined → falls back to [],
       so next.customers = [] before fn(next) runs. fn (e.g. confirm-sale) does
       not touch customers, so newPart.customers = [], setPartitionedData(newPart)
       wipes state, and partitionedDataRef.current = newPart wipes the ref.
       The Firestore docs survive (syncAllPartitionedChanges short-circuits when
       both arrays are empty) — but the local React state and localStorage
       snapshot are wiped, producing the "العملاء (0)" report. V19.59/60/61 each
       fixed a downstream symptom (merge gate / listener rebuild / ref race +
       error wipe) but the upstream wipe in upConfig kept re-injecting the bug
       on every sale. Same dynamic pattern as upConfigTx fallback (line ~3030)
       and explicitSplitBefore above. */
    const explicitPartBefore=Object.fromEntries(
      PARTITIONED_FIELDS.map(f=>[f,[...(partitionedDataRef.current[f]||[])]])
    );
    /* V16.80 FIX #6: Compute the next state OUTSIDE setState callback.
       The previous code put fn() and side-effects (setSplitData, splitDataRef.current=)
       INSIDE setConfigDoc(prev=>...). React Strict Mode runs callbacks twice for purity
       checking — meaning fn() executed twice, side-effects fired twice, and any
       non-deterministic ids (Date.now()) could yield duplicate entries.

       The new flow:
         1. Compute next/newSplit/newPart deterministically once, here
         2. Apply state updates (no callback form, just direct values)
         3. Side-effects run exactly once */
    /* V19.54 BULK-POST FIX: Read from configDocRef.current — NOT the configDoc closure.
       Why: when a sync loop calls upConfig N times in a row (like bulk invoice posting),
       the closure captures configDoc from the original render. React batches state
       updates, so the closure stays stale across iterations. iteration N would
       overwrite N-1's optimistic update with stale `prev`, reverting earlier work.
       Symptom: bulk-posting 5 invoices → only the LAST one stays posted.
       Fix: configDocRef is mutated synchronously after setConfigDoc(stripped) below,
       so iteration N+1 sees iteration N's optimistic state.
       Falls back to the closure if ref is null (first call after mount). */
    const prev=configDocRef.current||configDoc||{};
    let next, newSplit=null, newPart=null, stripped=null;
    try{
      next=JSON.parse(JSON.stringify(prev));
      /* V19.49: hydrate split fields based on which migration flag is set.
         Pre-migration fields stay in config (no hydration needed). */
      const splitFieldsActive=[];
      if(prev[SPLIT_FLAG_V1674]){
        for(const f of ["treasury","auditLog","hrLog"]){
          next[f]=JSON.parse(JSON.stringify(explicitSplitBefore[f]||[]));
          splitFieldsActive.push(f);
        }
      }
      if(prev[SPLIT_FLAG_V1949]){
        for(const f of SPLIT_FIELDS_V1949){
          next[f]=JSON.parse(JSON.stringify(explicitSplitBefore[f]||[]));
          splitFieldsActive.push(f);
        }
      }
      if(prev[SPLIT_FLAG_V1950]){
        for(const f of SPLIT_FIELDS_V1950){
          next[f]=JSON.parse(JSON.stringify(explicitSplitBefore[f]||[]));
          splitFieldsActive.push(f);
        }
      }
      if(prev[SPLIT_FLAG_V1952]){
        for(const f of SPLIT_FIELDS_V1952){
          next[f]=JSON.parse(JSON.stringify(explicitSplitBefore[f]||[]));
          splitFieldsActive.push(f);
        }
      }
      if(prev[SPLIT_FLAG_V1953]){
        for(const f of SPLIT_FIELDS_V1953){
          next[f]=JSON.parse(JSON.stringify(explicitSplitBefore[f]||[]));
          splitFieldsActive.push(f);
        }
      }
      const splitActive=splitFieldsActive.length>0;
      /* V19.57: hydrate partitioned fields based on per-group flags. Pre-migration
         fields stay in config (no hydration needed), same gating as splitFields. */
      const partFieldsActive=[];
      if(prev[PARTITIONED_FLAG_V1675]){
        for(const f of PARTITIONED_FIELDS_V1675){
          next[f]=JSON.parse(JSON.stringify(explicitPartBefore[f]||[]));
          partFieldsActive.push(f);
        }
      }
      if(prev[PARTITIONED_FLAG_V1957]){
        for(const f of PARTITIONED_FIELDS_V1957){
          next[f]=JSON.parse(JSON.stringify(explicitPartBefore[f]||[]));
          partFieldsActive.push(f);
        }
      }
      const partActive=partFieldsActive.length>0;
      fn(next);
      enforceDataLimits(next);
      /* V19.58: WARN-only schema validation — checks the diffed entries against
         Zod schemas. Failures log to console + Settings UI but never block. */
      try{validateDoc(prev,next,"config")}catch(e){console.warn("[V19.58 validator threw]",e)}
      /* V18.60 SAFETY NET: refuse writes that wipe critical fields entirely.
         This is a last-resort guard against bugs that cause mass data loss.
         The check is intentionally permissive (only blocks 🚨-severity wipes
         of users/usersList/customers/workshops/etc.) — normal user operations
         pass through unhindered. Logs warnings for the audit trail either way. */
      if(!isSafeWrite(prev,next)){
        console.error("[V18.60 BLOCKED] Write refused — would wipe critical data. prev/next:",{prev,next});
        showToast("⛔ تم منع تعديل خطير: ممكن يمسح بيانات مهمة. اتصل بالدعم لو محتاج العملية دي فعلاً.");
        return;/* abort the optimistic update entirely */
      }
      if(splitActive){
        /* V19.49: build newSplit only for fields whose flag is on */
        newSplit={};
        for(const f of splitFieldsActive){
          newSplit[f]=Array.isArray(next[f])?next[f]:[];
        }
      }
      if(partActive){
        /* V19.57: build newPart only for fields whose flag is on (was hardcoded hrWeeks) */
        newPart={};
        for(const f of partFieldsActive){
          newPart[f]=Array.isArray(next[f])?next[f]:[];
        }
      }
      stripped=next;
      if(splitActive)stripped=stripSplitArrays(stripped);
      if(partActive)stripped=stripPartitionedArrays(stripped);
    }catch(e){
      console.error("[upConfig] fn threw, aborting optimistic update:",e);
      return;
    }
    /* V19.62/63 SAFETY NET: detect mass wipes of any partitioned OR split field.
       Pre-V19.62 the explicitPartBefore-only-has-hrWeeks bug caused EVERY sale to
       wipe customers/suppliers/etc. to []. V19.62 caught V19.57 master data; V19.63
       extends coverage to ALL partitioned fields (incl. hrWeeks) AND all split fields
       (treasury, custPayments, salesInvoices, packages, tasks, etc.). Same threshold
       (≥5 → 0) — high enough to never catch single-item edits, low enough to catch
       any future regression of the V19.62 shape across the entire write path. */
    if(newPart||newSplit){
      const wipes=[];
      /* All partitioned fields (V1675 hrWeeks + V1957 master data) */
      if(newPart){
        for(const f of PARTITIONED_FIELDS){
          if(!(f in newPart))continue;/* only check fields included in this write */
          const before=(partitionedDataRef.current[f]||[]).length;
          const after=(newPart[f]||[]).length;
          if(before>=5&&after===0)wipes.push(`${f}: ${before} → 0 (partitioned)`);
        }
      }
      /* All split fields (treasury, hrLog, custPayments, salesInvoices, etc.) */
      if(newSplit){
        for(const f of SPLIT_FIELDS){
          if(!(f in newSplit))continue;
          const before=(splitDataRef.current[f]||[]).length;
          const after=(newSplit[f]||[]).length;
          if(before>=5&&after===0)wipes.push(`${f}: ${before} → 0 (split)`);
        }
      }
      if(wipes.length>0){
        console.error("[V19.63 BLOCKED] Refusing mass wipe:",wipes,
          "\nexplicitPartBefore keys:",Object.keys(explicitPartBefore||{}),
          "\nexplicitSplitBefore keys:",Object.keys(explicitSplitBefore||{}),
          "\npartitionedDataRef counts:",Object.fromEntries(PARTITIONED_FIELDS.map(f=>[f,(partitionedDataRef.current[f]||[]).length])),
          "\nsplitDataRef counts:",Object.fromEntries(SPLIT_FIELDS.map(f=>[f,(splitDataRef.current[f]||[]).length])));
        showToast("⛔ تم منع تعديل خطير: ممكن يمسح بيانات ("+wipes.join("، ")+"). اتصل بالدعم لو محتاج العملية دي فعلاً.");
        return;
      }
    }
    /* Apply state updates (each runs exactly once, even in Strict Mode) */
    setConfigDoc(stripped);
    /* V19.54: update the ref synchronously so a follow-up upConfig() in the same
       JS tick sees this optimistic state (not the stale React closure). */
    configDocRef.current=stripped;
    if(newSplit){
      /* V17.0 FIX #8: Track pending writes to merge with listener data */
      registerPendingSplitWrites(explicitSplitBefore,newSplit);
      setSplitData(newSplit);
      splitDataRef.current=newSplit;
    }
    if(newPart){
      /* V17.0 FIX #8: Same for partitioned */
      registerPendingPartitionedWrites(explicitPartBefore,newPart);
      setPartitionedData(newPart);
      partitionedDataRef.current=newPart;
    }
    /* V17.2 CRITICAL FIX: Pass the PRE-COMPUTED `next` object (not fn) to upConfigTx.
       Why: Firestore's runTransaction re-runs the callback on conflicts (up to 5 retries).
       If we passed fn, fn(next) would execute again on each retry, calling gid()/Date.now()
       and producing DIFFERENT ids each time. The optimistic UI shows ids from call #1
       (gid="X1"), the server stores ids from call #N (gid="X2"). The pending writes
       map has {X1: pending}, the listener sees {X2: server} — both end up rendered =
       DUPLICATE entries on the UI.
       
       Now we pass the already-computed `next` and `newSplit`/`newPart`. The transaction
       just writes them as-is, no re-execution of user fn. */
    /* V19.56: return the Tx promise so callers can `await upConfig(...)` to be sure
       the write actually flushed to Firestore (not just the optimistic UI). This is
       what bulk operations need so a progress bar reflects real state. */
    return upConfigTx(next,newSplit,newPart,explicitSplitBefore,explicitPartBefore);
  },[upConfigTx,configDoc,splitLoaded,partitionedLoaded,registerPendingSplitWrites,registerPendingPartitionedWrites]);

  /* V18.38: Register the autoPost module's upConfig callback so it can persist
     posting failures into data.accountingPostFailures for the user to review. */
  useEffect(() => {
    registerAutoPostCallback(upConfig);
  }, [upConfig]);

  /* V19.51: upSalesTx accepts pre-computed values like upConfigTx (V17.2 pattern).
     - precomputedNext: full salesDoc state already hydrated + fn-applied + stripped
     - precomputedNewSalesSplit: the split fields to sync to day docs (or null pre-migration)
     - explicitSalesSplitBefore: snapshot for diff against newSalesSplit
     The transaction just writes precomputedNext as-is — fn does NOT re-run on retries. */
  const upSalesTx=useCallback(async(precomputedNext,precomputedNewSalesSplit,explicitSalesSplitBefore)=>{
    /* V19.55: serialize via promise chain — see upConfigTx for full reasoning. */
    const _doWrite=async()=>{
    const ref=doc(db,"factory","sales");
    let lastErr=null;
    /* V19.51 SAFETY: refuse writes if migration done but listeners not loaded */
    if(salesDoc&&salesDoc[SALES_SPLIT_FLAG_V1951]&&!salesSplitLoaded){
      console.error("[V19.51 SAFETY] Refusing upSales — salesSplitData not loaded yet");
      showToast("⏳ البرنامج لسه بيحمّل بيانات المبيعات — حاول تاني بعد ثانيتين");
      return;
    }
    const splitBefore=explicitSalesSplitBefore||Object.fromEntries(
      SALES_SPLIT_FIELDS.map(f=>[f,salesSplitDataRef.current[f]||[]])
    );
    const splitActive=Boolean(salesDoc?.[SALES_SPLIT_FLAG_V1951]);
    const splitAfter=splitActive?precomputedNewSalesSplit:null;

    for(let attempt=0;attempt<5;attempt++){
      try{
        await setDoc(ref,precomputedNext,{merge:false});
        markSynced(); /* V19.48 */
        /* V19.51: sync split day docs */
        if(splitActive&&splitAfter){
          let syncErr=null;
          for(let syncAttempt=0;syncAttempt<3;syncAttempt++){
            try{
              await syncAllSalesSplitChanges(splitBefore,splitAfter);
              syncErr=null;
              break;
            }catch(e){
              syncErr=e;
              console.warn("[V19.51] syncAllSalesSplitChanges attempt "+(syncAttempt+1)+" failed:",e?.message||e);
              if(syncAttempt<2)await _sleep(150*Math.pow(2,syncAttempt));
            }
          }
          if(syncErr){
            console.error("[V19.51] Failed to sync sales split day docs after 3 retries:",syncErr);
            noticeWarn(
              "تعذر حفظ بعض بيانات المبيعات في وضع التخزين اليومي",
              "خطأ في كتابة sales day docs بعد 3 محاولات. البيانات الأساسية محفوظة في factory/sales، لكن day docs (packages/custDeliverySessions) قد لا تكون متزامنة. التفاصيل: "+(syncErr.message||String(syncErr)).slice(0,200)
            );
          }
        }
        return;
      }catch(e){
        lastErr=e;
        const code=e?.code||"";
        const retriable=code==="aborted"||code==="already-exists"||code==="deadline-exceeded"||code==="unavailable"||code==="internal"||!code;
        if(!retriable||attempt===4)break;
        await _sleep(100*Math.pow(2,attempt));
      }
    }
    /* V19.48 + V19.51: AWAIT fallback. Real failure surfaces categorized error. */
    console.error("[V19.51] upSales setDoc error after retries:", lastErr);
    try {
      /* Sync split docs first (idempotent). */
      if(splitAfter){
        try{ await syncAllSalesSplitChanges(splitBefore,splitAfter) }
        catch(syncErr){ console.warn("[V19.51] sales fallback split sync failed:",syncErr) }
      }
      await setDoc(ref, precomputedNext, { merge: false });
      markSynced();
      console.warn("[V19.51] upSales recovered via fallback setDoc");
    } catch(fallbackErr){
      const cat = categorizeWriteError(fallbackErr);
      const docSize = estimateDocSize(precomputedNext);
      const forensic = buildForensicLine({
        docPath: "factory/sales",
        docSize,
        errCode: fallbackErr?.code || "",
        errMsg: fallbackErr?.message || String(fallbackErr),
        attempts: 5,
        operation: "upSales",
      });
      console.error(forensic);
      showToast("⛔ فشل حفظ بيانات المبيعات: "+(cat.arabic||"خطأ غير معروف")+(docSize > FIRESTORE_DOC_WARN_BYTES ? " (حجم البيانات: "+formatBytes(docSize)+")" : ""));
    }
    };/* end of _doWrite */
    const myWrite=upSalesWriteQueueRef.current.then(_doWrite);
    upSalesWriteQueueRef.current=myWrite.catch(()=>{});
    return myWrite;
  },[markSynced,salesDoc,salesSplitLoaded]);
  const upSales=useCallback(fn=>{
    /* V19.48: Online-only — refuse writes when offline. Same enforcement as upConfig. */
    if(!isOnlineRef.current){
      showToast("⛔ أنت أوفلاين دلوقتي — التعديل مش متاح لحد ما النت يرجع");
      return;
    }
    /* V18.62: Same safety guards as upConfig — refuse writes before config loaded
       or while in error state. Prevents writes to factory/sales during the brief
       window before any listener has fired. */
    if(!configLoaded){
      console.error("[V18.62 SAFETY] Refusing upSales — config not loaded yet");
      showToast("⏳ البيانات لسه بتتحمّل — حاول تاني بعد ثانيتين");
      return;
    }
    if(configError){
      console.error("[V18.62 SAFETY] Refusing upSales — configError set");
      showToast("⛔ فيه مشكلة — اقفل وافتح التطبيق");
      return;
    }
    /* V19.51 SAFETY: refuse if migration done but listeners not loaded */
    if(salesDoc&&salesDoc[SALES_SPLIT_FLAG_V1951]&&!salesSplitLoaded){
      console.error("[V19.51 SAFETY] Refusing upSales — salesSplitData not loaded yet");
      showToast("⏳ البرنامج لسه بيحمّل بيانات المبيعات — حاول تاني بعد ثانيتين");
      return;
    }
    /* V19.51: snapshot pre-mutation split state for the diff */
    const explicitSalesSplitBefore=Object.fromEntries(
      SALES_SPLIT_FIELDS.map(f=>[f,[...(salesSplitDataRef.current[f]||[])]])
    );
    /* V19.51: compute next + newSplit deterministically (mirrors upConfig V16.80 FIX #6) */
    /* V19.54: read from salesDocRef.current to avoid stale-closure bug — see upConfig
       comment above for full explanation (bulk-post race condition). */
    const prev=salesDocRef.current||salesDoc||{};
    let next, newSalesSplit=null, stripped=null;
    try{
      next=JSON.parse(JSON.stringify(prev));
      const salesSplitActive=Boolean(prev[SALES_SPLIT_FLAG_V1951]);
      if(salesSplitActive){
        for(const f of SALES_SPLIT_FIELDS_V1951){
          next[f]=JSON.parse(JSON.stringify(explicitSalesSplitBefore[f]||[]));
        }
      }
      fn(next);
      /* V19.58: WARN-only schema validation (sales doc — most fields aren't in schemas yet, no-op typically). */
      try{validateDoc(prev,next,"sales")}catch(e){console.warn("[V19.58 validator threw]",e)}
      if(salesSplitActive){
        newSalesSplit={};
        for(const f of SALES_SPLIT_FIELDS_V1951){
          newSalesSplit[f]=Array.isArray(next[f])?next[f]:[];
        }
      }
      stripped=salesSplitActive?stripSalesSplitArrays(next):next;
    }catch(e){
      console.error("[upSales] fn threw, aborting optimistic update:",e);
      return;
    }
    /* V19.65 SAFETY NET: same wipe guard as upConfig (V19.62/63). Detects mass wipes
       of sales-split fields (packages, custDeliverySessions). Threshold ≥5→0. */
    if(newSalesSplit){
      const wipes=[];
      for(const f of SALES_SPLIT_FIELDS){
        if(!(f in newSalesSplit))continue;
        const before=(salesSplitDataRef.current[f]||[]).length;
        const after=(newSalesSplit[f]||[]).length;
        if(before>=5&&after===0)wipes.push(`${f}: ${before} → 0 (sales-split)`);
      }
      if(wipes.length>0){
        console.error("[V19.65 BLOCKED upSales] Refusing mass wipe:",wipes,
          "\nexplicitSalesSplitBefore keys:",Object.keys(explicitSalesSplitBefore||{}),
          "\nsalesSplitDataRef counts:",Object.fromEntries(SALES_SPLIT_FIELDS.map(f=>[f,(salesSplitDataRef.current[f]||[]).length])));
        showToast("⛔ تم منع تعديل خطير في المبيعات: ممكن يمسح بيانات ("+wipes.join("، ")+"). اتصل بالدعم.");
        return;
      }
    }
    /* Apply optimistic state */
    setSalesDoc(stripped);
    /* V19.54: sync ref update for stale-closure protection (see upConfig). */
    salesDocRef.current=stripped;
    if(newSalesSplit){
      registerPendingSalesSplitWrites(explicitSalesSplitBefore,newSalesSplit);
      setSalesSplitData(newSalesSplit);
      salesSplitDataRef.current=newSalesSplit;
    }
    /* V19.56: return the Tx promise so callers can await actual flush (see upConfig). */
    return upSalesTx(stripped,newSalesSplit,explicitSalesSplitBefore);
  },[upSalesTx,configLoaded,configError,salesDoc,salesSplitLoaded,registerPendingSalesSplitWrites]);

  /* V19.51: upTasksTx parallels upSalesTx — accepts pre-computed values. */
  const upTasksTx=useCallback(async(precomputedNext,precomputedNewTasksSplit,explicitTasksSplitBefore)=>{
    /* V19.55: serialize via promise chain — see upConfigTx for full reasoning. */
    const _doWrite=async()=>{
    const ref=doc(db,"factory","tasks");
    let lastErr=null;
    if(tasksDoc&&tasksDoc[TASKS_SPLIT_FLAG_V1951]&&!tasksSplitLoaded){
      console.error("[V19.51 SAFETY] Refusing upTasks — tasksSplitData not loaded yet");
      showToast("⏳ البرنامج لسه بيحمّل بيانات المهام — حاول تاني بعد ثانيتين");
      return;
    }
    const splitBefore=explicitTasksSplitBefore||Object.fromEntries(
      TASKS_SPLIT_FIELDS.map(f=>[f,tasksSplitDataRef.current[f]||[]])
    );
    const splitActive=Boolean(tasksDoc?.[TASKS_SPLIT_FLAG_V1951]);
    const splitAfter=splitActive?precomputedNewTasksSplit:null;

    for(let attempt=0;attempt<5;attempt++){
      try{
        await setDoc(ref,precomputedNext,{merge:false});
        markSynced(); /* V19.48 */
        if(splitActive&&splitAfter){
          let syncErr=null;
          for(let syncAttempt=0;syncAttempt<3;syncAttempt++){
            try{
              await syncAllTasksSplitChanges(splitBefore,splitAfter);
              syncErr=null;
              break;
            }catch(e){
              syncErr=e;
              console.warn("[V19.51] syncAllTasksSplitChanges attempt "+(syncAttempt+1)+" failed:",e?.message||e);
              if(syncAttempt<2)await _sleep(150*Math.pow(2,syncAttempt));
            }
          }
          if(syncErr){
            console.error("[V19.51] Failed to sync tasks split day docs after 3 retries:",syncErr);
            noticeWarn(
              "تعذر حفظ بعض بيانات المهام في وضع التخزين اليومي",
              "خطأ في كتابة tasks day docs بعد 3 محاولات. التفاصيل: "+(syncErr.message||String(syncErr)).slice(0,200)
            );
          }
        }
        return;
      }catch(e){
        lastErr=e;
        const code=e?.code||"";
        const retriable=code==="aborted"||code==="already-exists"||code==="deadline-exceeded"||code==="unavailable"||code==="internal"||!code;
        if(!retriable||attempt===4)break;
        await _sleep(100*Math.pow(2,attempt));
      }
    }
    /* V19.48 + V19.51: AWAIT fallback. */
    console.error("[V19.51] upTasks setDoc error after retries:", lastErr);
    try {
      if(splitAfter){
        try{ await syncAllTasksSplitChanges(splitBefore,splitAfter) }
        catch(syncErr){ console.warn("[V19.51] tasks fallback split sync failed:",syncErr) }
      }
      await setDoc(ref, precomputedNext, { merge: false });
      markSynced();
      console.warn("[V19.51] upTasks recovered via fallback setDoc");
    } catch(fallbackErr){
      const cat = categorizeWriteError(fallbackErr);
      const docSize = estimateDocSize(precomputedNext);
      const forensic = buildForensicLine({
        docPath: "factory/tasks",
        docSize,
        errCode: fallbackErr?.code || "",
        errMsg: fallbackErr?.message || String(fallbackErr),
        attempts: 5,
        operation: "upTasks",
      });
      console.error(forensic);
      showToast("⛔ فشل حفظ المهام: "+(cat.arabic||"خطأ غير معروف")+(docSize > FIRESTORE_DOC_WARN_BYTES ? " (حجم البيانات: "+formatBytes(docSize)+")" : ""));
    }
    };/* end of _doWrite */
    const myWrite=upTasksWriteQueueRef.current.then(_doWrite);
    upTasksWriteQueueRef.current=myWrite.catch(()=>{});
    return myWrite;
  },[markSynced,tasksDoc,tasksSplitLoaded]);
  const upTasks=useCallback(fn=>{
    /* V19.48: Online-only — refuse writes when offline. */
    if(!isOnlineRef.current){
      showToast("⛔ أنت أوفلاين دلوقتي — التعديل مش متاح لحد ما النت يرجع");
      return;
    }
    /* V18.62: Same safety guards as upConfig */
    if(!configLoaded){
      console.error("[V18.62 SAFETY] Refusing upTasks — config not loaded yet");
      showToast("⏳ البيانات لسه بتتحمّل — حاول تاني بعد ثانيتين");
      return;
    }
    if(configError){
      console.error("[V18.62 SAFETY] Refusing upTasks — configError set");
      showToast("⛔ فيه مشكلة — اقفل وافتح التطبيق");
      return;
    }
    /* V19.51 SAFETY: refuse if migration done but listeners not loaded */
    if(tasksDoc&&tasksDoc[TASKS_SPLIT_FLAG_V1951]&&!tasksSplitLoaded){
      console.error("[V19.51 SAFETY] Refusing upTasks — tasksSplitData not loaded yet");
      showToast("⏳ البرنامج لسه بيحمّل بيانات المهام — حاول تاني بعد ثانيتين");
      return;
    }
    /* V19.51: snapshot pre-mutation split state for the diff */
    const explicitTasksSplitBefore=Object.fromEntries(
      TASKS_SPLIT_FIELDS.map(f=>[f,[...(tasksSplitDataRef.current[f]||[])]])
    );
    /* V19.54: read from tasksDocRef.current to avoid stale-closure bug. */
    const prev=tasksDocRef.current||tasksDoc||{};
    let next, newTasksSplit=null, stripped=null;
    try{
      next=JSON.parse(JSON.stringify(prev));
      const tasksSplitActive=Boolean(prev[TASKS_SPLIT_FLAG_V1951]);
      if(tasksSplitActive){
        for(const f of TASKS_SPLIT_FIELDS_V1951){
          next[f]=JSON.parse(JSON.stringify(explicitTasksSplitBefore[f]||[]));
        }
      }
      fn(next);
      /* V19.58: WARN-only schema validation (tasks doc — typically a no-op). */
      try{validateDoc(prev,next,"tasks")}catch(e){console.warn("[V19.58 validator threw]",e)}
      if(tasksSplitActive){
        newTasksSplit={};
        for(const f of TASKS_SPLIT_FIELDS_V1951){
          newTasksSplit[f]=Array.isArray(next[f])?next[f]:[];
        }
      }
      stripped=tasksSplitActive?stripTasksSplitArrays(next):next;
    }catch(e){
      console.error("[upTasks] fn threw, aborting optimistic update:",e);
      return;
    }
    /* V19.65 SAFETY NET: wipe guard for tasks-split fields (tasks, stickyNotes, inventoryAudits). */
    if(newTasksSplit){
      const wipes=[];
      for(const f of TASKS_SPLIT_FIELDS){
        if(!(f in newTasksSplit))continue;
        const before=(tasksSplitDataRef.current[f]||[]).length;
        const after=(newTasksSplit[f]||[]).length;
        if(before>=5&&after===0)wipes.push(`${f}: ${before} → 0 (tasks-split)`);
      }
      if(wipes.length>0){
        console.error("[V19.65 BLOCKED upTasks] Refusing mass wipe:",wipes,
          "\nexplicitTasksSplitBefore keys:",Object.keys(explicitTasksSplitBefore||{}),
          "\ntasksSplitDataRef counts:",Object.fromEntries(TASKS_SPLIT_FIELDS.map(f=>[f,(tasksSplitDataRef.current[f]||[]).length])));
        showToast("⛔ تم منع تعديل خطير في المهام: ممكن يمسح بيانات ("+wipes.join("، ")+"). اتصل بالدعم.");
        return;
      }
    }
    setTasksDoc(stripped);
    /* V19.54: sync ref update for stale-closure protection. */
    tasksDocRef.current=stripped;
    if(newTasksSplit){
      registerPendingTasksSplitWrites(explicitTasksSplitBefore,newTasksSplit);
      setTasksSplitData(newTasksSplit);
      tasksSplitDataRef.current=newTasksSplit;
    }
    /* V19.56: return the Tx promise so callers can await actual flush (see upConfig). */
    return upTasksTx(stripped,newTasksSplit,explicitTasksSplitBefore);
  },[upTasksTx,configLoaded,configError,tasksDoc,tasksSplitLoaded,registerPendingTasksSplitWrites]);
  /* V16.11: ATOMIC ORDER OPERATIONS — addOrder/replaceOrder/delOrder now run
     stock check + order write + stock deduction inside a SINGLE Firestore
     transaction. Fixes a TOCTOU window where a check would pass on stale
     local data, but by the time the deduction committed another writer had
     consumed the stock — leaving negative balances or duplicate-deducted
     orders. delOrder also got the same treatment so an order, its stock
     refund, and reference cleanups all commit or all roll back together.

     Helper kept as a closure: format a shortages list into a Tell-style msg. */
  const _formatShortageMsg=(headline,shortages)=>{
    let msg=headline+"\n\n";
    (shortages||[]).forEach(s=>{
      msg+="• "+s.itemName+" ("+(s.itemType==="fabric"?"خامة":"إكسسوار")+")\n";
      if(s.needed!==undefined&&s.available!==undefined){
        msg+="  المطلوب: "+s.needed+" "+s.unit+" | المتاح: "+s.available+" "+s.unit+" | ناقص: "+s.shortage+" "+s.unit+"\n\n";
      }else{
        msg+="  ناقص: "+s.shortage+" "+s.unit+"\n\n";
      }
    });
    return msg;
  };
  const addOrder=async o=>{
    o.createdBy=userName;
    /* Fast local pre-check — gives immediate feedback before paying the network round-trip.
       The transaction below re-checks against fresh server data anyway. */
    const localCheck=checkStockAvailability(o,{...configDoc,fabrics:configDoc.fabrics,accessories:configDoc.accessories,purchaseSettings:configDoc.purchaseSettings});
    /* V19.48 BUG FIX: Respect blockOnInsufficientStock setting. When user picks
       "السماح بالسالب" (warning mode), blockOnInsufficientStock=false → we should
       show a warning but allow the order. Previously we always blocked, ignoring
       the setting completely. */
    const _blockShortage=(configDoc.purchaseSettings||{}).blockOnInsufficientStock!==false;
    if(!localCheck.ok&&_blockShortage){
      await tell("المخزن غير كافي",_formatShortageMsg("⛔ لا يمكن إنشاء الأوردر — المخزن غير كافي:",localCheck.shortages),{type:"error"});
      return;
    }
    if(!localCheck.ok&&!_blockShortage){
      /* Warning mode: notify but proceed — stock will go negative */
      showToast("⚠️ المخزن غير كافي — هيتم الخصم بالسالب",{type:"warning",duration:5000});
    }
    const orderRef=doc(collection(db,"seasons",season,"orders"));/* auto-id */
    const configRef=doc(db,"factory","config");
    try{
      await runTransaction(db,async(tx)=>{
        /* Re-read config from server inside the transaction */
        const cfgSnap=await tx.get(configRef);
        const cfg=cfgSnap.exists()?cfgSnap.data():{};
        /* Re-check stock against FRESH data — closes the TOCTOU window.
           V19.48: also respect the setting on the server-side recheck. */
        const freshCheck=checkStockAvailability(o,cfg);
        const _blockFresh=(cfg.purchaseSettings||{}).blockOnInsufficientStock!==false;
        if(!freshCheck.ok&&_blockFresh){
          const err=new Error("STOCK_INSUFFICIENT");
          err.shortages=freshCheck.shortages;
          throw err;
        }
        /* Apply deduction to a fresh copy, then commit order + config atomically.
           In warning mode this will produce negative stock — that's intentional. */
        const nextCfg=JSON.parse(JSON.stringify(cfg));
        deductStockForOrder(nextCfg,o,userName);
        enforceDataLimits(nextCfg);
        tx.set(orderRef,o);
        tx.set(configRef,nextCfg);
      });
    }catch(e){
      if(e&&e.message==="STOCK_INSUFFICIENT"){
        await tell("المخزن غير كافي",_formatShortageMsg("⛔ المخزن غير كافي (تأكيد من السيرفر):",e.shortages),{type:"error"});
        return;
      }
      console.error("addOrder tx error:",e);
      showToast("⚠️ خطأ في حفظ الأوردر: "+((e.message||String(e)).substring(0,100)));
    }
  };
  const updOrder=async(orderId,fn)=>{try{const ord=orders.find(o=>o.id===orderId);if(!ord)return;const updated=JSON.parse(JSON.stringify(ord));fn(updated);const clean={...updated};delete clean._docId;await updateDoc(doc(db,"seasons",season,"orders",ord._docId),clean)}catch(e){console.error("updOrder error:",e);showToast("⚠️ خطأ في حفظ الأوردر")}};
  const delOrder=async orderId=>{
    const ord=orders.find(o=>o.id===orderId);
    if(!ord||!ord._docId)return;
    const orderRef=doc(db,"seasons",season,"orders",ord._docId);
    const configRef=doc(db,"factory","config");
    const salesRef=doc(db,"factory","sales");
    try{
      await runTransaction(db,async(tx)=>{
        /* All reads must precede any writes inside a transaction */
        const cfgSnap=await tx.get(configRef);
        const salesSnap=await tx.get(salesRef);
        const cfg=cfgSnap.exists()?cfgSnap.data():{};
        const sales=salesSnap.exists()?salesSnap.data():{};
        const nextCfg=JSON.parse(JSON.stringify(cfg));
        const nextSales=JSON.parse(JSON.stringify(sales));
        /* Refund stock if it was previously deducted */
        if(ord._stockDeducted){
          const returnOrder={...ord,_stockDeducted:ord._stockDeducted,cutQty:0,accItems:[],colorsA:[],colorsB:[],colorsC:[],colorsD:[]};
          deductStockForOrder(nextCfg,returnOrder,userName);
        }
        /* Clean up config-side references (qrSales / salesAudits) */
        if(Array.isArray(nextCfg.qrSales))nextCfg.qrSales=nextCfg.qrSales.filter(s=>s.orderId!==orderId);
        if(Array.isArray(nextCfg.salesAudits)){
          nextCfg.salesAudits.forEach(a=>{if(a.grid){Object.keys(a.grid).forEach(k=>{if(k.startsWith(orderId+"_"))delete a.grid[k]})}});
        }
        enforceDataLimits(nextCfg);
        /* Clean up sales-side references (custDeliverySessions + packages) */
        if(Array.isArray(nextSales.custDeliverySessions)){
          nextSales.custDeliverySessions.forEach(s=>{
            if(Array.isArray(s.modelIds))s.modelIds=s.modelIds.filter(id=>id!==orderId);
            if(s.grid){Object.keys(s.grid).forEach(k=>{if(k.startsWith(orderId+"_"))delete s.grid[k]})}
          });
          nextSales.custDeliverySessions=nextSales.custDeliverySessions.filter(s=>!Array.isArray(s.modelIds)||s.modelIds.length>0);
        }
        if(Array.isArray(nextSales.packages)){
          nextSales.packages.forEach(p=>{if(Array.isArray(p.items))p.items=p.items.filter(it=>it.orderId!==orderId)});
        }
        /* Atomic writes — all 3 docs commit together or none do */
        tx.set(configRef,nextCfg);
        tx.set(salesRef,nextSales);
        tx.delete(orderRef);
      });
      /* V19.48: After the Firestore transaction commits, best-effort cleanup of the
         order's Storage assets. Firestore transactions can't span Storage, so this
         runs separately. Failures are non-fatal — orphans are harmless and we log.
         Imports kept lazy here to avoid pulling Storage SDK into the App.jsx bundle hot path. */
      if(ord.imageStoragePath){
        import("./utils/orderImages.js").then(({deleteOrderImage})=>{
          deleteOrderImage(ord.imageStoragePath).catch(err=>console.warn("[V19.48] image cleanup post-delete:",err));
        });
      }
    }catch(e){
      console.error("delOrder tx error:",e);
      showToast("⚠️ خطأ في حذف الأوردر: "+((e.message||String(e)).substring(0,100)));
    }
  };
  const replaceOrder=async(orderId,newData)=>{
    const ord=orders.find(o=>o.id===orderId);if(!ord||!ord._docId)return;
    /* Safety: verify data is a valid order object */
    if(!newData||typeof newData!=="object"||!newData.id||!newData.modelNo){console.error("replaceOrder: invalid data",newData);showToast("⚠️ خطأ — البيانات غير صالحة");return}
    /* Preserve _stockDeducted snapshot from existing order */
    if(ord._stockDeducted&&!newData._stockDeducted)newData._stockDeducted=ord._stockDeducted;
    /* Local pre-check (delta-aware) for fast UX */
    const localCheck=checkStockAvailability(newData,{...configDoc,fabrics:configDoc.fabrics,accessories:configDoc.accessories,purchaseSettings:configDoc.purchaseSettings});
    /* V19.48 BUG FIX: Respect blockOnInsufficientStock setting (warning mode allows negative). */
    const _blockShortage=(configDoc.purchaseSettings||{}).blockOnInsufficientStock!==false;
    if(!localCheck.ok&&_blockShortage){
      await tell("المخزن غير كافي",_formatShortageMsg("⛔ لا يمكن حفظ التعديل — المخزن غير كافي للزيادة المطلوبة:",localCheck.shortages),{type:"error"});
      return;
    }
    if(!localCheck.ok&&!_blockShortage){
      showToast("⚠️ المخزن غير كافي — هيتم الخصم بالسالب",{type:"warning",duration:5000});
    }
    const clean={...newData};delete clean._docId;
    const orderRef=doc(db,"seasons",season,"orders",ord._docId);
    const configRef=doc(db,"factory","config");
    try{
      await runTransaction(db,async(tx)=>{
        const cfgSnap=await tx.get(configRef);
        const cfg=cfgSnap.exists()?cfgSnap.data():{};
        /* Re-check stock against FRESH data using the new order's needs */
        const freshCheck=checkStockAvailability(clean,cfg);
        const _blockFresh=(cfg.purchaseSettings||{}).blockOnInsufficientStock!==false;
        if(!freshCheck.ok&&_blockFresh){
          const err=new Error("STOCK_INSUFFICIENT");
          err.shortages=freshCheck.shortages;
          throw err;
        }
        const nextCfg=JSON.parse(JSON.stringify(cfg));
        deductStockForOrder(nextCfg,clean,userName);
        enforceDataLimits(nextCfg);
        tx.set(orderRef,clean);
        tx.set(configRef,nextCfg);
      });
    }catch(e){
      if(e&&e.message==="STOCK_INSUFFICIENT"){
        await tell("المخزن غير كافي",_formatShortageMsg("⛔ المخزن غير كافي (تأكيد من السيرفر):",e.shortages),{type:"error"});
        return;
      }
      console.error("replaceOrder tx error:",e);
      showToast("⚠️ خطأ في الحفظ: "+((e.message||String(e)).substring(0,100)));
    }
  };
  /* Cascade rename in all orders - matches by ID (new data) or name (old data) */
  const renameInOrders=async(type,oldName,newName,entityId)=>{if(oldName===newName||!oldName||!newName)return;
    for(const o of orders){let changed=false;const upd=JSON.parse(JSON.stringify(o));
      if(type==="ws"){(upd.workshopDeliveries||[]).forEach(wd=>{if((entityId&&wd.wsId===entityId)||wd.wsName===oldName){wd.wsName=newName;if(entityId)wd.wsId=entityId;changed=true}})}
      if(type==="garment"){(upd.workshopDeliveries||[]).forEach(wd=>{if(wd.garmentType===oldName){wd.garmentType=newName;changed=true};(wd.receives||[]).forEach(r=>{if(r.garmentType===oldName){r.garmentType=newName;changed=true}})});if(upd.orderPieces){upd.orderPieces=upd.orderPieces.map(p=>p===oldName?(changed=true,newName):p)};FKEYS.forEach(k=>{if(upd["fabricPieces"+k]){upd["fabricPieces"+k]=upd["fabricPieces"+k].map(p=>p===oldName?(changed=true,newName):p)}})}
      if(type==="status"&&upd.status===oldName){upd.status=newName;changed=true}
      /* V15.32: Sync sizeLabel when a sizeSet's label is edited.
         Matches by sizeSetId (entityId) — the sizeLabel stored on each order is a snapshot of the sizeSet's label at creation time. */
      if(type==="size"&&entityId&&Number(upd.sizeSetId)===Number(entityId)){
        if(upd.sizeLabel!==newName){upd.sizeLabel=newName;changed=true}
      }
      if(changed)await replaceOrder(o.id,upd);
    }
    if(type==="ws")showToast("✓ تم تحديث "+orders.filter(o=>(o.workshopDeliveries||[]).some(wd=>wd.wsName===oldName||(entityId&&wd.wsId===entityId))).length+" أوردر");
    if(type==="size"&&entityId){
      const cnt=orders.filter(o=>Number(o.sizeSetId)===Number(entityId)).length;
      showToast("✓ تم تحديث مقاسات "+cnt+" أوردر");
    }
  };
  /* Sync all existing data with workshop IDs. nameMap: {oldName: wsId} for orphan linking */
  const syncWsIds=async(nameMap)=>{
    const wsList=config.workshops||[];
    const nm=nameMap||{};
    let ordCount=0;
    for(const o of orders){let changed=false;const upd=JSON.parse(JSON.stringify(o));
      (upd.workshopDeliveries||[]).forEach(wd=>{
        /* Match by: wsId → name → nameMap (orphan) */
        let ws=null;
        if(wd.wsId)ws=wsList.find(w=>w.id===wd.wsId);
        if(!ws)ws=wsList.find(w=>w.name===wd.wsName);
        if(!ws&&nm[wd.wsName])ws=wsList.find(w=>w.id===Number(nm[wd.wsName]));
        if(ws){if(wd.wsId!==ws.id){wd.wsId=ws.id;changed=true}if(wd.wsName!==ws.name){wd.wsName=ws.name;changed=true}}
      });
      if(changed){await replaceOrder(o.id,upd);ordCount++}
    }
    let payChanged=false;
    upConfig(d=>{
      (d.wsPayments||[]).forEach(p=>{
        let ws=null;
        if(p.wsId)ws=wsList.find(w=>w.id===p.wsId);
        if(!ws)ws=wsList.find(w=>w.name===p.wsName);
        if(!ws&&nm[p.wsName])ws=wsList.find(w=>w.id===Number(nm[p.wsName]));
        if(ws){if(p.wsId!==ws.id){p.wsId=ws.id;payChanged=true}if(p.wsName!==ws.name){p.wsName=ws.name;payChanged=true}}
      });
    });
    showToast("✓ تم مزامنة "+ordCount+" أوردر"+(payChanged?" + المدفوعات":""));
  };
  const goD=id=>{setSel(id);setTab("details")};
  useEffect(()=>{const h=()=>{const d=window.__labelData;if(d){setLabelPopup(d);setLabelBags(1);delete window.__labelData}};window.addEventListener("show-label-popup",h);return()=>window.removeEventListener("show-label-popup",h)},[]);
  /* QR scan auto-navigate */
  const qrDone=useRef(false);
  useEffect(()=>{if(qrDone.current||orders.length===0)return;
    if(qrModelNo){const o=orders.find(x=>x.modelNo===qrModelNo);if(o){qrDone.current=true;goD(o.id);window.history.replaceState({},"",window.location.pathname)}}
    if(qrAction==="rcv"&&qrOid){const o=orders.find(x=>x.id===qrOid);if(o){qrDone.current=true;setTab("external");window.history.replaceState({},"",window.location.pathname);setTimeout(()=>{window.__qrReceive={oid:qrOid,wdi:Number(qrWdi)||0};window.dispatchEvent(new Event("qr-receive"))},600)}}
    if(qrAction==="wsacc"&&qrWs){qrDone.current=true;setTab("external");window.history.replaceState({},"",window.location.pathname);setTimeout(()=>{window.__qrWsAcc={ws:decodeURIComponent(qrWs)};window.dispatchEvent(new Event("qr-wsacc"))},600)}
    /* V16.50: workshop scans the delivery-receipt QR */
    if(qrAction==="wsdel"&&qrOrd&&qrIdx!=null){
      const o=orders.find(x=>x.id===qrOrd);
      if(o){
        const i=Number(qrIdx);
        const wd=(o.workshopDeliveries||[])[i];
        if(wd){
          qrDone.current=true;
          window.history.replaceState({},"",window.location.pathname);
          setWsDelPopup({order:o,wdIdx:i,wd:JSON.parse(JSON.stringify(wd))});
        }
      }
    }
    if(qrAction==="stock"&&qrOid){const o=orders.find(x=>x.id===qrOid);if(o){qrDone.current=true;goD(o.id);window.history.replaceState({},"",window.location.pathname);setTimeout(()=>{window.__qrStock=true;window.dispatchEvent(new Event("qr-stock"))},800)}}
  },[orders,qrModelNo,qrAction,qrOrd]);

  /* Auto-resolve wsName from wsId */
  const resolvedOrders=useMemo(()=>{
    try{
      const wsList=config.workshops||[];
      return orders.map(o=>{
        let changed=false;
        const wds=(o.workshopDeliveries||[]).map(wd=>{
          if(wd.wsId){const ws=wsList.find(w=>w.id===wd.wsId);if(ws&&ws.name!==wd.wsName){changed=true;return{...wd,wsName:ws.name}}}
          return wd;
        });
        return changed?{...o,workshopDeliveries:wds}:o;
      });
    }catch(e){console.error("resolvedOrders error:",e);return orders}
  },[orders,config.workshops]);
  /* V15.76: Memoize `data` — was creating a new object on every render,
     triggering cascading re-renders in all child pages that receive it as prop. */
  const data=useMemo(()=>({...config,orders:resolvedOrders||orders}),[config,resolvedOrders,orders]);
  /* V16.11: SECURITY FIX — default role is now "viewer" instead of "admin".
     Previously, any user authenticated to Firebase Auth (even unprovisioned ones)
     received admin privileges by default, since:
       (a) Firebase Auth users not in config.users / config.usersList → fell through to "admin"
       (b) A temporary config-load race could also drop a real user to the default
     Both paths now return "viewer" — admins must be explicitly added to usersList. */
  const getUserRole=()=>{if(config.users&&config.users[user?.uid]){const r=config.users[user.uid];return typeof r==="string"?r:r?.role||"viewer"}const byEmail=(config.usersList||[]).find(u=>u.email===user?.email);if(byEmail)return byEmail.role;return"viewer"};
  const userRole=getUserRole();const canEdit=userRole==="admin"||userRole==="manager";
  /* V19.44: DEFAULT_PERMS, role list, and tab catalog moved to src/utils/permissions.js
     (single source of truth — see file header for rationale). The code below is now a
     thin wrapper that delegates to the registry's pure functions. The runtime linter
     emits console warnings at startup if TABS in LoginScreen drift from PERMISSION_TABS.
     V19.48: Pass full config (not just permissions) so custom roles get resolved. */
  const getTabPerm=(tabKey)=>effectivePermFromRegistry(userRole,tabKey,config);
  const getHrSubPerm=(subKey)=>getHrSubPermFromRegistry(userRole,subKey,config);
  const canEditTab=(tabKey)=>canEditPermFromRegistry(userRole,tabKey,config);
  const canViewTab=(tabKey)=>canViewPermFromRegistry(userRole,tabKey,config);
  const statusCards=config.statusCards||DEFAULT_STATUSES;

  /* V19.48: Removed the prevStatuses → statusNotif effect. The pill it fed
     was removed from the topbar (it caused phantom notifications on re-login
     because the first listener snapshot was diffed against an empty ref).
     The state hook itself is kept (line ~399) to avoid touching Hook order;
     it's just never written to anymore. */

  /* V19.48: Detect loading stall after 12 seconds. If listeners haven't all fired,
     surface a diagnostic panel with escape-hatch options. Without this users got
     stuck on the spinner forever with no recourse when a listener silently failed
     (cache corruption, network hiccup, region issues, etc.). */
  useEffect(()=>{
    if(!user)return;
    if(!dataLoading && configLoaded)return; /* Already loaded — nothing to detect */
    const timer = setTimeout(()=>{
      /* Re-check at fire time — state may have caught up by then */
      if(dataLoading || !configLoaded){
        console.warn("[V19.48] Loading stalled after 12s. Listener status:", listenerStatus);
        setLoadingStallDetected(true);
      }
    }, 12000);
    return ()=>clearTimeout(timer);
  },[user,dataLoading,configLoaded,listenerStatus]);

  if(authLoading)return null;
  if(!user)return<LoginScreen/>;
  /* V18.60: Critical config error — show explicit error state instead of letting
     the user interact with stale or default data. */
  if(configError){
    const isMissing=configError.type==="missing_config";
    return<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#FEF2F2",direction:"rtl",fontFamily:"'Cairo',sans-serif",padding:20}}>
      <div style={{maxWidth:560,background:"#fff",borderRadius:16,padding:32,border:"2px solid #DC2626",boxShadow:"0 10px 40px rgba(220,38,38,0.15)"}}>
        <div style={{fontSize:48,textAlign:"center",marginBottom:12}}>⛔</div>
        <div style={{fontSize:20,fontWeight:800,color:"#DC2626",textAlign:"center",marginBottom:14}}>
          {isMissing?"لم يتم العثور على إعدادات النظام":"خطأ في تحميل الإعدادات"}
        </div>
        <div style={{fontSize:14,color:"#374151",lineHeight:1.7,marginBottom:18,padding:14,background:"#FEF2F2",borderRadius:10,border:"1px solid #FCA5A5"}}>
          {isMissing
            ?"الـ document بتاع factory/config مش موجود في Firestore. ده ممكن يكون بسبب: مشكلة في الصلاحيات، أو الـ document اتمسح بالغلط، أو تنصيب جديد لم يكتمل."
            :"حصل خطأ أثناء قراءة الإعدادات: "+(configError.message||"غير معروف")}
        </div>
        <div style={{fontSize:13,color:"#6B7280",lineHeight:1.7,marginBottom:18,padding:12,background:"#F9FAFB",borderRadius:8}}>
          <b style={{color:"#DC2626"}}>⚠️ مهم جداً:</b> التطبيق منع نفسه من الكتابة لحد ما المشكلة دي تتحل، عشان نحمي بياناتك من الاستبدال بالقيم الافتراضية. متعملش refresh عشواي — اتصل بمدير النظام أو الدعم الفني.
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10,fontSize:12,color:"#6B7280",background:"#F3F4F6",padding:12,borderRadius:8,fontFamily:"monospace"}}>
          <div><b>النوع:</b> {configError.type}</div>
          {configError.code&&<div><b>الكود:</b> {configError.code}</div>}
          <div><b>المستخدم:</b> {configError.email||configError.uid||"-"}</div>
          <div><b>الوقت:</b> {configError.ts}</div>
        </div>
        <div style={{marginTop:18,display:"flex",gap:10,justifyContent:"center"}}>
          <button onClick={()=>window.location.reload()} style={{padding:"10px 20px",background:"#DC2626",color:"#fff",border:"none",borderRadius:8,fontWeight:700,cursor:"pointer",fontSize:14,fontFamily:"inherit"}}>إعادة المحاولة</button>
          <button onClick={()=>signOut(auth)} style={{padding:"10px 20px",background:"#F3F4F6",color:"#374151",border:"1px solid #D1D5DB",borderRadius:8,fontWeight:700,cursor:"pointer",fontSize:14,fontFamily:"inherit"}}>تسجيل خروج</button>
        </div>
      </div>
    </div>;
  }
  /* V18.60: Wait for config to load from server before rendering UI.
     Previously the UI rendered with INIT_CONFIG as base while waiting for the
     listener — which could trigger writes that overwrote real data with defaults.
     V19.48: After 12s of waiting, surface a stall-recovery panel so the user has
     options instead of being stuck on the spinner forever. */
  if(dataLoading||!configLoaded){
    if(loadingStallDetected){
      const stat = listenerStatus;
      const StatusRow = ({label, ok}) => (
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",fontSize:13}}>
          <span style={{color:"#374151"}}>{label}</span>
          <span style={{color:ok?"#10B981":"#EF4444",fontWeight:700}}>{ok?"✓ متصل":"✗ متأخر"}</span>
        </div>
      );
      const tryAnyway = () => {
        /* Force-bypass: use whatever state we have. Risky but better than infinite stuck. */
        console.warn("[V19.48] User clicked 'Try anyway' — forcing through loading gate");
        if(!configLoaded) setConfigLoaded(true);
        if(dataLoading) setDataLoading(false);
        setLoadingStallDetected(false);
      };
      const clearCacheAndReload = async () => {
        try {
          /* Best-effort clearing of Firestore IndexedDB persistence cache.
             If this fails (browser doesn't allow it), still try to reload. */
          if(window.indexedDB && window.indexedDB.databases){
            const dbs = await window.indexedDB.databases();
            for(const d of dbs){
              if(d.name && d.name.startsWith("firestore")){
                try { window.indexedDB.deleteDatabase(d.name); } catch(_){}
              }
            }
          }
        } catch(e){ console.warn("clearCache failed:", e); }
        /* Hard-reload (bypass HTTP cache) */
        window.location.reload();
      };
      return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#FEF3C7",direction:"rtl",fontFamily:"'Cairo',sans-serif",padding:20}}>
        <div style={{maxWidth:560,background:"#fff",borderRadius:16,padding:28,border:"2px solid #F59E0B",boxShadow:"0 10px 40px rgba(245,158,11,0.2)"}}>
          <div style={{fontSize:42,textAlign:"center",marginBottom:8}}>⏱️</div>
          <div style={{fontSize:18,fontWeight:800,color:"#D97706",textAlign:"center",marginBottom:14}}>
            تأخر في تحميل البيانات
          </div>
          <div style={{fontSize:13,color:"#374151",lineHeight:1.7,marginBottom:14,padding:12,background:"#FEF3C7",borderRadius:10,border:"1px solid #FCD34D"}}>
            بقالنا 12 ثانية بنحاول نوصل لقاعدة البيانات. ممكن تكون مشكلة شبكة، أو الكاش المحلي تالف، أو المستندات أكبر من اللازم. اختار حل من تحت.
          </div>
          <div style={{padding:12,background:"#F9FAFB",borderRadius:10,marginBottom:14,border:"1px solid #E5E7EB"}}>
            <div style={{fontSize:12,fontWeight:700,color:"#6B7280",marginBottom:8}}>حالة الاتصال:</div>
            <StatusRow label="الإعدادات (factory/config)" ok={stat.config}/>
            <StatusRow label="بيانات المبيعات (factory/sales)" ok={stat.sales}/>
            <StatusRow label="المهام (factory/tasks)" ok={stat.tasks}/>
            <StatusRow label="الأوردرات (seasons/...)" ok={stat.orders}/>
            {stat.lastError && (
              <div style={{marginTop:10,padding:8,background:"#FEE2E2",borderRadius:6,fontSize:11,color:"#991B1B",fontFamily:"monospace",direction:"ltr",textAlign:"left"}}>
                {stat.lastError}
              </div>
            )}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {stat.config && stat.orders ? (
              <button onClick={tryAnyway} style={{padding:"12px 18px",background:"#10B981",color:"#fff",border:"none",borderRadius:10,fontWeight:800,cursor:"pointer",fontSize:14,fontFamily:"inherit"}}>
                ✓ متابعة بالبيانات الحالية ({(stat.config?1:0)+(stat.sales?1:0)+(stat.tasks?1:0)+(stat.orders?1:0)}/4 جاهزة)
              </button>
            ) : (
              <button onClick={tryAnyway} style={{padding:"12px 18px",background:"#F59E0B",color:"#fff",border:"none",borderRadius:10,fontWeight:800,cursor:"pointer",fontSize:14,fontFamily:"inherit"}}>
                ⚠️ متابعة على مسؤوليتي (البيانات قد تكون ناقصة)
              </button>
            )}
            <button onClick={clearCacheAndReload} style={{padding:"10px 18px",background:"#3B82F6",color:"#fff",border:"none",borderRadius:10,fontWeight:700,cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>
              🗑 مسح الـ cache المحلي + إعادة تحميل
            </button>
            <button onClick={()=>window.location.reload()} style={{padding:"10px 18px",background:"#F3F4F6",color:"#374151",border:"1px solid #D1D5DB",borderRadius:10,fontWeight:700,cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>
              ↻ إعادة تحميل بسيطة
            </button>
            <button onClick={()=>signOut(auth)} style={{padding:"10px 18px",background:"transparent",color:"#6B7280",border:"1px solid #D1D5DB",borderRadius:10,fontWeight:600,cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>
              تسجيل خروج
            </button>
          </div>
          <div style={{marginTop:14,fontSize:11,color:"#9CA3AF",lineHeight:1.6,padding:8,background:"#F3F4F6",borderRadius:6}}>
            💡 لو الإعدادات والأوردرات (الأهم) متصلة، اختر "متابعة بالبيانات الحالية" — التطبيق هيشتغل عادي. لو الكاش تالف، "مسح الـ cache" بيحلها في الغالب.
          </div>
        </div>
      </div>;
    }
    return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#EFF6FF",direction:"rtl",fontFamily:"'Cairo',sans-serif"}}>
      <div style={{textAlign:"center"}}>
        <div style={{display:"flex",justifyContent:"center",marginBottom:14}}>
          <Spinner size="large" color={T.accent}/>
        </div>
        <div style={{fontSize:13,fontWeight:700,color:T.accent}}>جاري تحميل البيانات</div>
        <div style={{fontSize:11,color:"#94A3B8",marginTop:4}}>يرجى الانتظار قليلاً...</div>
      </div>
    </div>;
  }
  /* V15.59: Mobile Warehouse App — accessed via /warehouse URL.
     Renders a separate mobile-first shell instead of the normal app. */
  if(window.location.pathname==="/warehouse"){
    return<MobileWarehouseShell data={data} upConfig={upConfig} upSales={upSales} upTasks={upTasks} updOrder={updOrder} user={user}/>;
  }
  const userName=user.displayName||user.email.split("@")[0];
  /* Compute alerts */
  const appAlerts=(()=>{try{const a=[];
    data.orders.forEach(o=>{const wds=o.workshopDeliveries||[];const pieces=o.orderPieces||[];
      if(pieces.length===0&&wds.length===0&&o.status==="تم القص"){a.push({key:"noDeliver_"+o.id,msg:o.modelNo+" — "+o.modelDesc+" لم يُسلَّم لأي ورشة",color:T.warn,icon:"⏳",orderId:o.id})}
      /* Pieces not linked to fabric */
      const linkedPieces=new Set();if(pieces.length>0){FKEYS.forEach(k=>{if(gf(o,k))(o["fabricPieces"+k]||[]).forEach(p=>linkedPieces.add(p))});const unlinked=pieces.filter(p=>!linkedPieces.has(p));unlinked.forEach(p=>a.push({key:"uncut_"+o.id+"_"+p,msg:o.modelNo+" — متبقي "+p+" «لم يتم القص»",color:T.purple,icon:"🧵",orderId:o.id}))}
      /* Pieces linked (cut) but not delivered to any workshop */
      if(pieces.length>0){const t=calcOrder(o);pieces.forEach(p=>{if(!linkedPieces.has(p))return;const delivered=wds.some(wd=>wd.garmentType===p);if(!delivered)a.push({key:"notDelivered_"+o.id+"_"+p,msg:o.modelNo+" — "+p+" ("+t.cutQty+" قطعة) متاح للتسليم والتشغيل",color:T.warn,icon:"🏭",orderId:o.id})})}
    });
    /* Delay alerts */
    const now=new Date();data.orders.filter(o=>o.status!=="تم التسليم لمخزن الجاهز").forEach(o=>{let lastDate=o.date;(o.workshopDeliveries||[]).forEach(wd=>{if(wd.date>lastDate)lastDate=wd.date;(wd.receives||[]).forEach(r=>{if(r.date>lastDate)lastDate=r.date})});(o.deliveries||[]).forEach(d=>{if(d.date>lastDate)lastDate=d.date});const diff=Math.floor((now-new Date(lastDate))/(1000*60*60*24));if(diff>7&&!a.find(x=>x.orderId===o.id))a.push({key:"stale_"+o.id,msg:o.modelNo+" بدون حركة منذ "+diff+" يوم",color:T.err,icon:"🔴",orderId:o.id})});
    /* Completion */
    const _cutQ=data.orders.reduce((s,o)=>s+calcOrder(o).cutQty,0);const _delQ=data.orders.reduce((s,o)=>s+(o.deliveredQty||0),0);if(_cutQ&&Math.round(_delQ/_cutQ*100)>=100)a.push({key:"allDone",msg:"تم الانتهاء من جميع الأوردرات!",color:T.ok,icon:"🎉"});
    /* Workshop limit */
    (data.workshops||[]).filter(w=>!wsIsInternal(w.type)).forEach(w=>{let due=0;data.orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===w.name).forEach(wd=>{(wd.receives||[]).forEach(r=>{due+=r2((Number(r.qty)||0)*(Number(r.price)||0))})})});const purch=(data.wsPayments||[]).filter(p=>p.wsName===w.name&&p.type==="purchase").reduce((s,p)=>s+(Number(p.amount)||0),0);const paid=(data.wsPayments||[]).filter(p=>p.wsName===w.name&&p.type==="payment").reduce((s,p)=>s+(Number(p.amount)||0),0);const pct=w.payPercent||60;const limit=r2((due+purch)*(pct/100));if(paid>limit&&due>0)a.push({key:"wsLimit_"+w.name,msg:w.name+" تجاوز حد "+pct+"%",color:T.err,icon:"⚠️"})});
    /* Smart: Workshop quality alerts */
    (data.workshops||[]).filter(w=>!wsIsInternal(w.type)).forEach(w=>{const r=calcWsRating(w.name,data.orders);if(r!==null&&r<5)a.push({key:"wsQual_"+w.name,msg:w.name+" تقييم منخفض ("+r+"/10) — مراجعة الجودة",color:T.err,icon:"📉"})});
    /* Smart: Workshop delay alerts */
    const _now=new Date();
    /* Approaching deadline alerts */
    data.orders.forEach(o=>{(o.workshopDeliveries||[]).forEach((wd,wdIdx)=>{const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);if(rcvd>=(Number(wd.qty)||0))return;const days=Math.floor((_now-new Date(wd.date))/(1000*60*60*24));const ideal=Math.max(5,Math.round(((Number(wd.qty)||0)/500)*6.5));const remaining=ideal-days;if(remaining>0&&remaining<=2&&days>0)a.push({key:"deadline_"+o.id+"_"+wdIdx,msg:o.modelNo+" — "+wd.wsName+" باقي "+remaining+" يوم على الموعد",color:"#F59E0B",icon:"⏰",orderId:o.id})})});
    (data.workshops||[]).filter(w=>!wsIsInternal(w.type)).forEach(w=>{let maxDelay=0,delayOrder="";data.orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===w.name).forEach(wd=>{const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);if(rcvd<(Number(wd.qty)||0)){const days=Math.floor((_now-new Date(wd.date))/(1000*60*60*24));const ideal=Math.max(5,Math.round(((Number(wd.qty)||0)/500)*6.5));if(days>ideal*1.5&&days>maxDelay){maxDelay=days;delayOrder=o.modelNo}}})});if(maxDelay>0)a.push({key:"wsDelay_"+w.name,msg:w.name+" متأخرة "+maxDelay+" يوم (موديل "+delayOrder+")",color:T.warn,icon:"🕐"})});
    /* Workshop alerts with WhatsApp */
    const _workshops=data.workshops||[];
    _workshops.filter(w=>!wsIsInternal(w.type)).forEach(w=>{const wPhone=w.phone||"";const wsDetails=[];
      data.orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===w.name).forEach(wd=>{const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);const wBal=(Number(wd.qty)||0)-rcvd;
        if(wBal>0){const daysSince=Math.floor((_now-new Date(wd.date))/(1000*60*60*24));const agreed=Number(wd.agreedDays)||0;wsDetails.push({modelNo:o.modelNo,qty:wBal,days:daysSince,agreed,garment:wd.garmentType||"",delDate:wd.date,orderId:o.id})}})});
      wsDetails.forEach(d=>{if(d.agreed>0){const remaining=d.agreed-d.days;
        if(remaining<=2&&remaining>=0)a.push({key:"agreedDue_"+w.name+"_"+d.orderId,msg:w.name+" باقي "+(remaining||"آخر")+" يوم على تسليم موديل "+d.modelNo+" ("+d.agreed+" يوم متفق)",color:"#F59E0B",icon:"⏰",orderId:d.orderId,wsName:w.name,wsPhone:wPhone,wsDetails:[d]});
        else if(remaining<0)a.push({key:"agreedLate_"+w.name+"_"+d.orderId,msg:w.name+" متأخرة "+Math.abs(remaining)+" يوم — موديل "+d.modelNo+" (متفق "+d.agreed+" يوم)",color:T.err,icon:"🔴",orderId:d.orderId,wsName:w.name,wsPhone:wPhone,wsDetails:[d]})}})});
    /* 6. Bottleneck — طقم واقف بسبب قطعة */
    data.orders.forEach(o=>{if(o.closed)return;const pieces=o.orderPieces||[];if(pieces.length<2)return;
      const wds=o.workshopDeliveries||[];const pBal={};
      pieces.forEach(p=>{const del=wds.filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0);const rcv=wds.filter(wd=>wd.garmentType===p).reduce((s,wd)=>(wd.receives||[]).filter(r=>!r.isSettlement).reduce((ss,r)=>ss+(Number(r.qty)||0),0)+s,0);pBal[p]={del,rcv,bal:del-rcv}});
      const doneP=pieces.filter(p=>pBal[p].bal===0&&pBal[p].rcv>0);const stuckP=pieces.filter(p=>pBal[p].bal>0);
      if(doneP.length>0&&stuckP.length>0&&stuckP.length<=doneP.length){
        const minDone=Math.min(...doneP.map(p=>pBal[p].rcv));
        stuckP.forEach(p=>{const ws=wds.filter(wd=>wd.garmentType===p&&(Number(wd.qty)||0)-(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0)>0);
          const wsName=ws[0]?.wsName||"";const wsObj=_workshops.find(w=>w.name===wsName);const wPhone=wsObj?.phone||"";
          const stuckQty=pBal[p].bal;const waitingSets=Math.min(stuckQty,minDone>0?stuckQty:0);
          a.push({key:"bottleneck_"+o.id+"_"+p,msg:"🚨 موديل "+o.modelNo+" — طقم واقف! "+p+" ("+stuckQty+" قطعة) عند "+(wsName||"ورشة")+" — باقي القطع جاهزة",
            color:"#DC2626",icon:"🚨",orderId:o.id,wsName,wsPhone:wPhone,wsDetails:[{modelNo:o.modelNo,qty:stuckQty,days:0,agreed:0,garment:p}]})})}});
    /* V15.8: filter out user-dismissed alerts */
    return a.filter(al=>!isDismissed(al.key||al.msg))}catch(e){console.error("Alert error:",e);return[]}})();

  /* User notifications */
  const userEmail=user?.email||"";
  /* V19.53: Filter using userNotifState (per-user state doc) instead of
     in-place readBy/dismissedBy on the notification itself.
     - endedAt: sender or admin clicked "End" → hide for everyone
     - expiresAt: passed → hide for everyone (auto-expire)
     - userNotifState.dismisses[id]: this user dismissed → hide just for them
     - readBy/dismissedBy on notif itself: legacy path for pre-V19.53 entries */
  const _now=new Date();
  const userDismisses=userNotifState?.dismisses||{};
  const userReads=userNotifState?.reads||{};
  const userNotifs=(config.notifications||[]).filter(n=>n.toEmail===userEmail||n.toEmail==="all").filter(n=>{
    if(n.endedAt)return false;
    if(n.expiresAt&&new Date(n.expiresAt)<=_now)return false;
    /* V19.53: per-user dismiss check — primary path */
    if(userDismisses[n.id])return false;
    if(userReads[n.id])return false;
    /* Legacy fallback for old notifications that still have inline arrays */
    if((n.readBy||[]).includes(userEmail))return false;
    if((n.dismissedBy||[]).includes(userEmail))return false;
    /* V19.48: forAdminsOnly notifs (e.g. transfer approval requests) only show for admins */
    if(n.forAdminsOnly&&userRole!=="admin")return false;
    return true;
  });
  /* V19.53: markRead writes to userNotifStates/{userEmail} (per-user doc) instead
     of mutating the notification entry. This avoids cross-user write contention
     on the day doc when multiple users read the same notification simultaneously.
     Each user's "read" or "dismiss" only writes to their own doc.
     For private (direct) notifications we still write to userNotifStates rather
     than deleting the entry — same semantic, simpler concurrency model. */
  const markRead=(nid)=>{
    if(!userEmail||!nid)return;
    const ts=new Date().toISOString();
    setDoc(doc(db,"userNotifStates",userEmail),{
      dismisses:{[nid]:ts},
      reads:{[nid]:ts},
      updatedAt:ts,
    },{merge:true}).catch(err=>{
      console.warn("[V19.53] userNotifStates markRead failed:",err);
    });
    /* Optimistic local update so the notif disappears immediately */
    setUserNotifState(s=>({
      ...s,
      reads:{...(s.reads||{}),[nid]:ts},
      dismisses:{...(s.dismisses||{}),[nid]:ts},
    }));
  };
  const allAlerts=[...userNotifs.map(n=>{
    /* V15.50: Delivery confirmation notification types get specific styling + link to custDelivery */
    if(n.type==="delivery_confirmed")return{msg:n.msg,color:"#10B981",icon:"✅",orderId:null,isNotif:true,notifId:n.id,from:n.fromName,date:n.createdAt,goTo:"custDelivery"};
    if(n.type==="delivery_issue")return{msg:n.msg,color:"#EF4444",icon:"⚠️",orderId:null,isNotif:true,notifId:n.id,from:n.fromName,date:n.createdAt,goTo:"custDelivery"};
    return{msg:n.msg,color:n.type==="طلب"?"#8B5CF6":n.type==="مهمة"?T.accent:T.warn,icon:n.type==="طلب"?"📩":n.type==="مهمة"?"📌":"💬",orderId:n.orderId||null,isNotif:true,notifId:n.id,from:n.fromName,date:n.createdAt};
  }),...appAlerts];
  const alertCount=allAlerts.length;
  /* V19.48: Urgent tasks bar in topbar disabled — these now show in the greeting bar
     as type chips along with all other types. Keep as empty array to keep refs alive. */
  const urgentTasks=[];
  /* V19.53: doneTask state stored per-user too (was n.doneBy[]). */
  const markTaskDone=(nid)=>{
    if(!userEmail||!nid)return;
    const ts=new Date().toISOString();
    setDoc(doc(db,"userNotifStates",userEmail),{
      doneTasks:{[nid]:ts},
      updatedAt:ts,
    },{merge:true}).catch(err=>{
      console.warn("[V19.53] userNotifStates markTaskDone failed:",err);
    });
    setUserNotifState(s=>({...s,doneTasks:{...(s.doneTasks||{}),[nid]:ts}}));
  };
  /* V19.48: End-for-everyone — sender or admin clicks ⏹ → endedAt set → hidden for all users.
     Different from dismiss (which only hides for current user). */
  const endNotif=(nid)=>upConfig(d=>{const n=(d.notifications||[]).find(x=>x.id===nid);if(!n)return;
    n.endedAt=new Date().toISOString();
    n.endedBy=userEmail;
  });
  /* V19.48: Notifications shown in sub-bar — all types (تذكير/طلب/مهمة/مهمة عاجلة).
     Excludes system-generated types like delivery_confirmed/delivery_issue (those go to bell). */
  const subBarNotifs=userNotifs.filter(n=>{
    const t=n.type;
    return t==="تذكير"||t==="طلب"||t==="مهمة"||t==="مهمة عاجلة";
  });
  /* Helper: format time-remaining for an expiring notification. Returns "1س 23د" / "45د" / "آخر اليوم" / null. */
  const formatRemaining=(n)=>{
    if(!n.expiresAt)return null;
    const ms=new Date(n.expiresAt).getTime()-Date.now();
    if(ms<=0)return null;
    const mins=Math.floor(ms/60000);
    const hrs=Math.floor(mins/60);
    const remMins=mins%60;
    if(hrs>=24)return Math.floor(hrs/24)+"ي "+(hrs%24)+"س";
    if(hrs>0)return hrs+"س"+(remMins>0?" "+remMins+"د":"");
    return mins+"د";
  };
  /* V19.48: Notification link handler — clicking a chip with `link` field navigates
     the user to the referenced entity (invoice/order/etc.). Also marks the notification
     as read for this user. */
  const handleNotifLinkClick=(n)=>{
    if(!n.link){markRead(n.id);return}
    const{type,id,subType}=n.link;
    /* Mark as read so it stops showing in the bar */
    markRead(n.id);
    /* Use a custom event to deep-link inside the destination page after tab switch */
    const navigate=(targetTab,payload)=>{setTab(targetTab);setTimeout(()=>{window.dispatchEvent(new CustomEvent("notif-deeplink",{detail:{type,id,subType,...payload}}))},150)};
    if(type==="invoice"){
      if(subType==="purchase")navigate("purchaseInvoices",{invoiceId:id});
      else navigate("salesInvoices",{invoiceId:id});
    }else if(type==="order"){
      setSel(id);setTab("details");
    }else if(type==="treasury"){
      /* V19.48: Sub-type "transfer_pending" → opens transfers view in TreasuryPg */
      navigate("treasury",{entryId:id,view:subType==="transfer_pending"?"transfers":undefined});
    }else if(type==="workshop"){
      navigate("external",{wsName:id});
    }else if(type==="hrWeek"){
      navigate("hr",{weekId:id});
    }else{
      showToast("⚠️ نوع الوجهة غير مدعوم");
    }
  };
  /* Type → icon + colors mapping for sub-bar chips */
  const NOTIF_STYLE={
    "تذكير":      {icon:"💬",bg:"#FFFBEB",border:"#FDE68A",text:"#B45309"},
    "طلب":        {icon:"📩",bg:"#F5F3FF",border:"#DDD6FE",text:"#7C3AED"},
    "مهمة":       {icon:"📌",bg:"#EFF6FF",border:"#BFDBFE",text:"#2563EB"},
    "مهمة عاجلة": {icon:"🔴",bg:"#FEF2F2",border:"#FECACA",text:"#DC2626"},
  };

  /* V19.48: Live ticker is wired at top of component (before early returns) for hook-order stability. */

  const goHome=async()=>{if(window.__formDirty){if(!await ask("الخروج بدون حفظ","هل تريد الخروج بدون حفظ البيانات المدخلة؟",{danger:true,confirmText:"خروج"}))return;window.__formDirty=false}setTab("home");setSel(null)};
  const goTo=async(key)=>{if(window.__formDirty){if(!await ask("الخروج بدون حفظ","هل تريد الخروج بدون حفظ البيانات المدخلة؟",{danger:true,confirmText:"خروج"}))return;window.__formDirty=false}setTab(key);if(key!=="details")setSel(null)};

  return<div onClick={()=>{if(showAlerts)setShowAlerts(false);if(gSearch)setGSearch("");if(showLogout)setShowLogout(false)}} style={{minHeight:"100vh",direction:"rtl",fontFamily:"'Cairo',sans-serif",background:T.bg,color:T.text,fontSize:FS,display:"flex",flexDirection:"column"}}>
    {/* ═══ PROFESSIONAL TOP BAR V14.47 ═══ */}
    <style>{`
      .tb-btn{transition:all 0.18s ease;cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:10px}
      .tb-btn:hover{background:${T.navBg?"rgba(255,255,255,0.2)":T.accentBg}!important}
      .tb-badge{position:absolute;top:-4px;left:-4px;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:${T.err};color:#fff;font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center;border:2px solid ${T.navBg||T.cardSolid};box-sizing:content-box}
      .tb-menu{position:absolute;top:calc(100% + 8px);left:0;min-width:240px;background:${T.cardSolid};border:1px solid ${T.brd};border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,0.12);z-index:9999;overflow:hidden;animation:tbFade 0.2s ease}
      .tb-menu-item{padding:10px 14px;cursor:pointer;display:flex;align-items:center;gap:10px;transition:background 0.15s;font-size:${FS-1}px;color:${T.text}}
      .tb-menu-item:hover{background:${T.accentBg}}
      .tb-menu-item + .tb-menu-item{border-top:1px solid ${T.brd}}
      @keyframes tbFade{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
      .tb-search{width:100%;padding:8px 14px 8px 36px;border-radius:10px;border:1px solid ${T.navBg?"rgba(255,255,255,0.2)":T.brd};font-size:${FS-1}px;font-family:inherit;background:${T.navBg?"rgba(255,255,255,0.12)":T.inputBg||T.cardSolid};color:${T.navText||T.text};box-sizing:border-box;outline:none;transition:all 0.2s}
      .tb-search:focus{border-color:${T.navBg?"rgba(255,255,255,0.5)":T.accent};background:${T.navBg?"rgba(255,255,255,0.18)":T.cardSolid};box-shadow:0 0 0 3px ${T.navBg?"rgba(255,255,255,0.1)":T.accent+"15"}}
      .tb-search::placeholder{color:${T.navText?"rgba(255,255,255,0.6)":T.textMut}}
    `}</style>
    <div style={{padding:isMob?"8px 12px":"10px 24px",background:T.navBg||T.cardSolid,borderBottom:T.navBg?"none":"1px solid "+T.brd,display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0,gap:isMob?8:16,minHeight:isMob?52:60}}>
      {/* ═══ LEFT GROUP: Home + Logo + Season + Status ═══ */}
      <div style={{display:"flex",alignItems:"center",gap:isMob?6:10,flexShrink:0}}>
        {tab!=="home"&&<div onClick={goHome} title="الصفحة الرئيسية" className="tb-btn" style={{color:T.navText||T.accent,padding:isMob?"6px":"8px 10px",background:T.navBg?"rgba(255,255,255,0.15)":T.accentBg}}>
          <svg width={isMob?18:20} height={isMob?18:20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        </div>}
        <img src={config.logo||CLARK_LOGO} alt="CLARK" style={{height:isMob?24:32,objectFit:"contain",...(T.navBg?{filter:"brightness(0) invert(1)"}:{})}}/>
        {!isMob&&<div style={{display:"flex",alignItems:"center",gap:6,lineHeight:1}}>
          <span title={lastSyncAt?"آخر مزامنة "+fmtRelAr(lastSyncAt):""} style={{fontSize:10,padding:"1px 6px",borderRadius:4,fontWeight:700,background:justReconnected?"#10B98118":isOnline?(T.navBg?"rgba(255,255,255,0.12)":"#10B98108"):"#F59E0B22",color:justReconnected?"#10B981":isOnline?(T.navText?"#A7F3D0":"#10B981"):"#B45309"}}>
            {justReconnected?"✓ تم المزامنة":isOnline?"● متصل":"⊘ أوفلاين · قراءة فقط"}
          </span>
          {/* V19.48: removed "مزامنة من X د" timestamp pill + "👥 الفريق" pill — too noisy in topbar */}
          <span 
            onClick={()=>setShowAboutVersion(true)} 
            title="عرض سجل التحديثات"
            style={{
              fontSize:FS-3,color:T.navText||T.textMut,fontWeight:600,fontFamily:"monospace",opacity:0.7,
              cursor:"pointer",
              padding:"2px 8px",
              borderRadius:6,
              transition:"all 0.15s",
              display:"inline-flex",
              alignItems:"center",
              gap:4,
            }}
            onMouseOver={e=>{e.currentTarget.style.opacity="1";e.currentTarget.style.background=(T.navText?"rgba(255,255,255,0.1)":T.accent+"10")}}
            onMouseOut={e=>{e.currentTarget.style.opacity="0.7";e.currentTarget.style.background="transparent"}}
          >{APP_VERSION} <span style={{fontSize:FS-3,opacity:0.7}}>📋</span></span>
        </div>}
        {isMob&&<>
          <span title={lastSyncAt?"آخر مزامنة "+fmtRelAr(lastSyncAt):""} style={{fontSize:9,padding:"2px 6px",borderRadius:5,fontWeight:700,background:isOnline?"#10B98120":"#F59E0B22",color:isOnline?"#10B981":"#B45309"}}>{isOnline?"●":"⊘ قراءة"}</span>
          <span
            onClick={()=>setShowAboutVersion(true)}
            title="عرض سجل التحديثات"
            style={{fontSize:9,padding:"2px 6px",borderRadius:5,fontWeight:700,fontFamily:"monospace",background:T.navText?"rgba(255,255,255,0.15)":T.accent+"10",color:T.navText||T.accent,cursor:"pointer"}}
          >{APP_VERSION}</span>
        </>}
      </div>

      {/* ═══ CENTER: Search (desktop only) ═══ */}
      {!isMob&&<div onClick={e=>e.stopPropagation()} style={{flex:1,maxWidth:440,position:"relative"}}>
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",color:T.navText?"rgba(255,255,255,0.6)":T.textMut,pointerEvents:"none"}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input value={gSearch} onChange={e=>setGSearch(e.target.value)} placeholder="بحث شامل: موديل، ورشة، خامة، عميل، مورد، موظف..." className="tb-search" style={{paddingRight:36,paddingLeft:14}}/>
        {gSearchDeb.trim()&&(()=>{const q=gSearchDeb.trim().toLowerCase();const res=[];
          data.orders.forEach(o=>{if([o.modelNo,o.modelDesc,o.poNumber||""].join(" ").toLowerCase().includes(q))res.push({type:"أوردر",label:(o.poNumber?o.poNumber+" — ":"")+o.modelNo+" — "+o.modelDesc,action:()=>{goD(o.id);setGSearch("")}})});
          (data.workshops||[]).forEach(w=>{if([w.name,w.owner||"",w.phone||""].join(" ").toLowerCase().includes(q))res.push({type:"ورشة",label:w.name+(w.owner?" — "+w.owner:""),action:()=>{setDbSub("ws");setTab("db");setGSearch("")}})});
          (data.fabrics||[]).forEach(f=>{if((f.name||"").toLowerCase().includes(q))res.push({type:"خامة",label:f.name,action:()=>{setDbSub("fab");setTab("db");setGSearch("")}})});
          (data.accessories||[]).forEach(a=>{if((a.name||"").toLowerCase().includes(q))res.push({type:"اكسسوار",label:a.name,action:()=>{setDbSub("acc");setTab("db");setGSearch("")}})});
          /* V15.14: Customer, Supplier, Employee search */
          (data.customers||[]).forEach(c=>{if([c.name||"",c.phone||"",c.address||"",c.type||""].join(" ").toLowerCase().includes(q))res.push({type:"عميل",label:c.name+(c.phone?" — "+c.phone:""),action:()=>{setTab("custDeliver");setGSearch("")}})});
          (data.suppliers||[]).forEach(s=>{if([s.name||"",s.phone||"",s.type||""].join(" ").toLowerCase().includes(q))res.push({type:"مورد",label:s.name+(s.phone?" — "+s.phone:""),action:()=>{setTab("purchase");setGSearch("")}})});
          (data.employees||[]).filter(e=>!e.inactive).forEach(e=>{if([e.name||"",e.code||"",e.job||"",e.phone||"",e.fingerprintCode||""].join(" ").toLowerCase().includes(q))res.push({type:"موظف",label:e.name+(e.code?" #"+e.code:"")+(e.job?" — "+e.job:""),action:()=>{setTab("hr");setGSearch("")}})});
          return<div style={{position:"absolute",top:"100%",right:0,left:0,marginTop:6,background:T.cardSolid,border:"1px solid "+T.brd,borderRadius:12,boxShadow:"0 12px 40px rgba(0,0,0,0.15)",zIndex:999,maxHeight:360,overflow:"auto"}}>
            {res.slice(0,12).map((r,i)=><div key={i} onClick={r.action} style={{padding:"10px 14px",cursor:"pointer",borderBottom:i<res.slice(0,12).length-1?"1px solid "+T.brd:"none",display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:FS-1,transition:"background 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background=T.accentBg} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <span style={{color:T.text,fontWeight:600}}>{r.label}</span><span style={{fontSize:FS-3,color:T.textMut,background:T.bg,padding:"2px 8px",borderRadius:6,fontWeight:700}}>{r.type}</span>
            </div>)}
            {res.length>12&&<div style={{padding:"6px 14px",textAlign:"center",color:T.textMut,fontSize:FS-3,fontWeight:600,background:T.bg}}>{"+ "+(res.length-12)+" نتيجة أخرى — حدّد البحث"}</div>}
            {res.length===0&&<div style={{padding:16,textAlign:"center",color:T.textMut,fontSize:FS-1}}>لا توجد نتائج</div>}
          </div>})()}
      </div>}

      {/* ═══ RIGHT GROUP: Urgent + Notifs + Alerts bell + AI + User menu ═══ */}
      <div style={{display:"flex",alignItems:"center",gap:isMob?4:6,flexShrink:0}}>
        {/* Urgent Tasks - desktop only */}
        {!isMob&&urgentTasks.length>0&&<div style={{display:"flex",gap:6,alignItems:"center",maxWidth:300,overflow:"auto"}}>
          {urgentTasks.map(t=><div key={t.id} onClick={()=>{markTaskDone(t.id);showToast("✓ تم تنفيذ المهمة")}} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 10px",borderRadius:8,background:"#EF444418",border:"1px solid #EF444440",cursor:"pointer",animation:"pulse 2s infinite",whiteSpace:"nowrap",transition:"all 0.2s"}} onMouseEnter={e=>e.currentTarget.style.background="#EF444430"} onMouseLeave={e=>e.currentTarget.style.background="#EF444418"}>
            <span style={{fontSize:10,color:"#EF4444"}}>●</span>
            <span style={{fontSize:FS-2,fontWeight:700,color:"#EF4444"}}>{t.msg}</span>
            <span style={{fontSize:10,color:"#EF444480"}}>✓</span>
          </div>)}
          <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.7}}`}</style>
        </div>}

        {/* V19.48: Status-change pill removed from topbar — caused phantom
            "model X" notifications to appear after logout/login (the order
            listener's first snapshot looked like a status change relative to
            the empty prevStatuses ref). Notifications belong in the bell only.
            The greeting-bar dashboard alerts (e.g. "167 أوردر بدون موديل")
            are unaffected — those live in DashboardPg, not here. */}

        {/* Alerts Bell */}
        <div style={{position:"relative"}} onClick={e=>e.stopPropagation()}>
          {config.disableNotifications?<div className="tb-btn" style={{padding:8,color:T.textMut,opacity:0.4}} title="الإشعارات معطلة">
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.33-5"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
          </div>:<>
          <div onClick={()=>setShowAlerts(!showAlerts)} title="التنبيهات والإشعارات" className="tb-btn" style={{padding:8,color:T.navText||T.text,background:alertCount>0?(T.navBg?"rgba(255,255,255,0.15)":T.warn+"12"):"transparent",position:"relative"}}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            {alertCount>0&&<span className="tb-badge">{alertCount}</span>}
          </div>
          {showAlerts&&<><div onClick={()=>setShowAlerts(false)} style={{position:"fixed",inset:0,zIndex:998}}/><div style={{position:"absolute",top:"100%",left:0,marginTop:8,width:isMob?290:360,background:T.cardSolid,border:"1px solid "+T.brd,borderRadius:12,boxShadow:"0 12px 40px rgba(0,0,0,0.15)",zIndex:999,maxHeight:420,overflow:"auto"}}>
            <div style={{padding:"12px 16px",borderBottom:"1px solid "+T.brd,fontWeight:800,fontSize:FS,color:T.text,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span>التنبيهات</span>
              {alertCount>0&&<span style={{fontSize:FS-2,color:T.textMut,fontWeight:600}}>{alertCount}</span>}
            </div>
            {alertCount>0?allAlerts.map((a,i)=><div key={i} onClick={()=>{if(a.isNotif)markRead(a.notifId);if(a.orderId){goD(a.orderId);setShowAlerts(false)}else if(a.goTo==="custDelivery"){setPage("custDelivery");setShowAlerts(false)}else if(a.isNotif)setShowAlerts(false)}} style={{padding:"10px 14px",borderBottom:"1px solid "+T.brd,display:"flex",gap:10,alignItems:"flex-start",cursor:a.orderId||a.isNotif?"pointer":"default",background:a.isNotif?a.color+"06":"transparent",transition:"background 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background=a.color+"12"} onMouseLeave={e=>e.currentTarget.style.background=a.isNotif?a.color+"06":"transparent"}>
              <span style={{fontSize:16,flexShrink:0}}>{a.icon}</span>
              <div style={{flex:1}}><span style={{fontSize:FS-1,color:a.color,fontWeight:600,lineHeight:1.5}}>{a.msg}</span>{a.from&&<div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>{"من: "+a.from+(a.date?" — "+a.date:"")}</div>}{a.orderId&&!a.isNotif&&!a.wsPhone&&<div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>اضغط لفتح الأوردر</div>}</div>
              {a.wsPhone&&<span onClick={e=>{e.stopPropagation();const lines=(a.wsDetails||[]).map(d=>"• موديل *"+d.modelNo+"*: *"+d.qty+"* قطعة — "+d.days+" يوم"+(d.agreed?" (متفق "+d.agreed+" يوم)":"")).join("%0A");const msg="*CLARK — تنبيه تأخير*%0A%0A• الورشة: *"+a.wsName+"*%0A%0A"+lines+"%0A%0A⚠️ *برجاء الاهتمام بالتسليم في أقرب وقت*";openWA("https://wa.me/"+(a.wsPhone.replace(/[^0-9]/g,""))+"?text="+msg,"_blank")}} style={{cursor:"pointer",fontSize:14,color:"#25D366",flexShrink:0,padding:"2px 4px"}}>📱</span>}
            </div>):<div style={{padding:30,textAlign:"center",color:T.textMut,fontSize:FS-1}}>
              <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke={T.textMut} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{margin:"0 auto 8px",opacity:0.5}}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              <div>لا توجد تنبيهات</div>
            </div>}
          </div></>}</>}
        </div>

        {/* V19.48: Season badge — moved here from greeting bar to keep greeting-bar single-row.
            Visually placed next to the bell. Compact format on mobile (📅 S26) vs. desktop (📅 الموسم: S26). */}
        <div title={"الموسم: "+season} style={{display:"flex",alignItems:"center",gap:5,padding:isMob?"4px 8px":"5px 10px",borderRadius:7,background:T.navBg?"rgba(16,185,129,0.18)":T.ok+"12",border:"1px solid "+(T.navBg?"rgba(16,185,129,0.4)":T.ok+"40"),color:T.navBg?"#fff":T.ok,fontSize:isMob?10:11,fontWeight:800,whiteSpace:"nowrap",flexShrink:0}}>
          <svg width={isMob?11:12} height={isMob?11:12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span>{isMob?season:"الموسم: "+season}</span>
        </div>

        {/* AI Assistant moved to floating button on home screen (V15.63) */}

        {/* User Menu Dropdown */}
        <div style={{position:"relative"}} onClick={e=>e.stopPropagation()}>
          <div onClick={()=>setShowLogout(!showLogout)} title={userName} className="tb-btn" style={{padding:isMob?"4px 8px":"6px 10px",background:showLogout?(T.navBg?"rgba(255,255,255,0.2)":T.accentBg):(T.navBg?"rgba(255,255,255,0.1)":"transparent"),border:"1px solid "+(T.navBg?"rgba(255,255,255,0.2)":T.brd),gap:8}}>
            <div style={{width:isMob?24:28,height:isMob?24:28,borderRadius:"50%",background:"linear-gradient(135deg,"+T.accent+","+T.accent+"CC)",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:isMob?11:13,fontWeight:800,flexShrink:0}}>{(userName||"?").charAt(0).toUpperCase()}</div>
            {!isMob&&<div style={{display:"flex",flexDirection:"column",alignItems:"flex-start",lineHeight:1.2}}>
              <span style={{fontSize:FS-2,color:T.navText||T.text,fontWeight:700,whiteSpace:"nowrap",maxWidth:100,overflow:"hidden",textOverflow:"ellipsis"}}>{userName}</span>
              <span style={{fontSize:9,color:T.navText?"rgba(255,255,255,0.7)":T.textMut,fontWeight:500}}>{/* V19.48: registry + custom roles */}{(getEffectiveRoleMeta(config)[userRole]?.label)||"مشاهد"}</span>
            </div>}
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{color:T.navText||T.textMut,transition:"transform 0.2s",transform:showLogout?"rotate(180deg)":""}}><polyline points="6 9 12 15 18 9"/></svg>
          </div>
          {showLogout&&<div className="tb-menu">
            {/* User info header */}
            <div style={{padding:"14px 16px",background:"linear-gradient(135deg,"+T.accent+"08, "+T.accent+"02)",borderBottom:"1px solid "+T.brd}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:44,height:44,borderRadius:"50%",background:"linear-gradient(135deg,"+T.accent+","+T.accent+"CC)",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:800,flexShrink:0}}>{(userName||"?").charAt(0).toUpperCase()}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:FS,fontWeight:800,color:T.text}}>{userName}</div>
                  <div style={{fontSize:FS-3,color:T.textMut,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user?.email}</div>
                  <div style={{fontSize:FS-3,color:T.accent,fontWeight:700,marginTop:2}}>{/* V19.48: registry + custom roles */}{(()=>{const r=getEffectiveRoleMeta(config)[userRole];return r?(r.icon+" "+r.label):"👁 مشاهد"})()}</div>
                </div>
              </div>
            </div>
            {/* Today's operations stat */}
            {(()=>{const td=new Date().toISOString().split("T")[0];let ops=0;data.orders.forEach(o=>{if(o.date===td)ops++;(o.workshopDeliveries||[]).forEach(wd=>{if(wd.date===td)ops++;(wd.receives||[]).forEach(r=>{if(r.date===td)ops++})});(o.deliveries||[]).forEach(d=>{if(d.date===td)ops++})});return<div style={{padding:"10px 14px",borderBottom:"1px solid "+T.brd,display:"flex",justifyContent:"space-between",alignItems:"center",background:T.bg+"40"}}>
              <span style={{fontSize:FS-2,color:T.textSec}}>📊 عمليات اليوم</span>
              <span style={{fontSize:FS-1,fontWeight:800,color:ops>0?T.ok:T.textMut,padding:"2px 10px",borderRadius:6,background:ops>0?T.ok+"12":T.bg}}>{ops}</span>
            </div>})()}
            {/* Theme submenu */}
            <div style={{padding:"10px 14px",borderBottom:"1px solid "+T.brd}}>
              <div style={{fontSize:FS-2,color:T.textSec,fontWeight:700,marginBottom:6}}>🎨 المظهر</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:5}}>
                {Object.entries(THEMES).map(([key,th])=><div key={key} onClick={()=>{setTheme(key)}} style={{cursor:"pointer",padding:"6px 4px",borderRadius:6,background:th.bg,border:theme===key?"2px solid "+th.accent:"1px solid "+th.brd,textAlign:"center",transition:"all 0.15s"}}>
                  <div style={{width:16,height:16,borderRadius:4,background:th.navBg||th.accent,margin:"0 auto 3px"}}/>
                  <div style={{fontSize:9,fontWeight:700,color:th.text,whiteSpace:"nowrap"}}>{th.name}{theme===key?" ✓":""}</div>
                </div>)}
              </div>
            </div>
            {/* Logout action */}
            <div onClick={()=>signOut(auth)} className="tb-menu-item" style={{color:T.err,fontWeight:700}}>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              <span>تسجيل الخروج</span>
            </div>
          </div>}
        </div>
      </div>
    </div>
    {/* V19.48: Read-only banner — appears under the topbar whenever the device
        is offline. We show it as info (gray/amber), not danger, because the
        app is still usable for browsing — just not for writes. */}
    {!isOnline&&<div style={{
      padding:isMob?"6px 12px":"7px 24px",
      background:"#FEF3C7",
      borderBottom:"1px solid #FDE68A",
      color:"#78350F",
      fontSize:isMob?12:13,
      fontWeight:600,
      display:"flex",
      alignItems:"center",
      gap:8,
      flexShrink:0,
      direction:"rtl"
    }}>
      <span style={{fontSize:14}}>⊘</span>
      <span>وضع قراءة فقط · مفيش تعديل لحد ما الإنترنت يرجع</span>
      {lastSyncAt>0&&<span style={{marginRight:"auto",fontSize:11,fontWeight:500,opacity:0.85}}>
        آخر مزامنة {fmtRelAr(lastSyncAt)}
      </span>}
    </div>}
    <div style={{flex:1,overflow:"auto",padding:isMob?"8px 10px":"12px 24px"}}>
      {/* HOME SCREEN */}
      {/* ═══ PROFESSIONAL HOME SCREEN V14.47 ═══ */}
      {tab==="home"&&(()=>{
        /* V18.25: Greeting fixed to "مرحبا" — always (was time-based) */
        const greetText="مرحبا";
        const dateStr=new Date().toLocaleDateString("ar-EG",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
        const uemail=user?.email||"";
        const COLORS=[{key:"#FEF9C3",border:"#EAB308",name:"أصفر"},{key:"#DBEAFE",border:"#3B82F6",name:"أزرق"},{key:"#DCFCE7",border:"#22C55E",name:"أخضر"},{key:"#FCE7F3",border:"#EC4899",name:"وردي"},{key:"#EDE9FE",border:"#8B5CF6",name:"بنفسجي"},{key:"#FFEDD5",border:"#F97316",name:"برتقالي"}];
        const allNotes=(config.stickyNotes||[]);const myNotes=allNotes.filter(n=>n.email===uemail);
        const saveNote=(note)=>{upTasks(d=>{if(!d.stickyNotes)d.stickyNotes=[];const idx=d.stickyNotes.findIndex(n=>n.id===note.id);if(idx>=0)d.stickyNotes[idx]=note;else{if(d.stickyNotes.filter(n=>n.email===uemail).length>=20){showToast("⚠️ الحد الاقصى 20 ملاحظة");return}d.stickyNotes.push(note)}});setStickyForm(null);showToast("✓ تم الحفظ")};
        const delNote=(id)=>{upTasks(d=>{d.stickyNotes=(d.stickyNotes||[]).filter(n=>n.id!==id)})};
        const uid=user?.uid||"";const rawTasks=(config||{}).tasks;const tasksList=Array.isArray(rawTasks)?rawTasks:[];const myTasks=tasksList.filter(t=>(t.toEmail===uemail||t.toUid===uid)&&!t.done);
        const visibleTabs=TABS.filter(t=>canViewTab(t.key)).sort((a,b)=>a.key==="settings"?1:b.key==="settings"?-1:0);

        return<div>
          <style>{`
            .home-tile{transition:all 0.2s cubic-bezier(0.4,0,0.2,1);cursor:pointer}
            .home-tile:hover{transform:translateY(-4px);box-shadow:0 12px 28px -8px rgba(0,0,0,0.12)}
            .home-tile:active{transform:translateY(-2px)}
            .home-greet{background:linear-gradient(135deg,${T.accent}06,${T.accent}02);border:1px solid ${T.accent}15}
            .sb-tab{cursor:pointer;padding:10px 12px;border-radius:8px;display:flex;align-items:center;gap:6px;font-weight:700;font-size:${FS-2}px;transition:all 0.2s;justify-content:center}
            .sb-tab.active{background:${T.cardSolid};color:${T.accent};box-shadow:0 1px 3px rgba(0,0,0,0.06)}
            .sb-tab:not(.active){color:${T.textSec}}
            .sb-tab:not(.active):hover{color:${T.text}}
            @keyframes chipPulse{0%,100%{opacity:1}50%{opacity:0.85}}
          `}</style>

          {/* ═══ GREETING HEADER — V19.48: single-row guaranteed, chips shrink instead of wrapping ═══ */}
          <div className="home-greet" style={{padding:isMob?"14px 16px":"18px 24px",borderRadius:16,marginBottom:18,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"nowrap",gap:12,minWidth:0}}>
            <div style={{flexShrink:0,minWidth:0}}>
              <div style={{fontSize:isMob?FS+2:FS+6,fontWeight:800,color:T.text,lineHeight:1.2,whiteSpace:"nowrap"}}>{greetText}، {userName||"مستخدم"}</div>
              <div style={{fontSize:FS-1,color:T.textSec,marginTop:4,whiteSpace:"nowrap"}}>{dateStr}</div>
            </div>
            {/* V19.48: Chips compress (shrink) instead of wrapping when space gets tight.
                - Outer container: nowrap + overflow:hidden (forces single row)
                - Each chip: flex:1 1 auto with minWidth ~120-140 (chip can shrink as space dwindles)
                - Chip's text span: flex:1, minWidth:0 (text truncates first via ellipsis)
                - "+N more" button: flexShrink:0 (stays full size — most important to keep visible) */}
            {subBarNotifs.length>0&&(()=>{
              const visibleCount=isMob?1:2;
              const visible=subBarNotifs.slice(0,visibleCount);
              const hiddenCount=subBarNotifs.length-visible.length;
              return<div style={{flex:"1 1 auto",minWidth:0,display:"flex",flexWrap:"nowrap",gap:8,alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
              {visible.map(n=>{const st=NOTIF_STYLE[n.type]||NOTIF_STYLE["تذكير"];const remain=formatRemaining(n);
                const canEnd=userRole==="admin"||n.fromEmail===userEmail;
                const hasLink=!!n.link;
                return<div key={n.id} onClick={hasLink?()=>handleNotifLinkClick(n):undefined} style={{display:"inline-flex",alignItems:"center",gap:8,padding:"8px 14px",borderRadius:10,background:st.bg,border:"1.5px solid "+st.border,color:st.text,fontSize:FS+1,fontWeight:700,animation:"chipPulse 3s ease-in-out infinite",cursor:hasLink?"pointer":"default",transition:"transform 0.15s",flex:"1 1 auto",minWidth:isMob?110:140,maxWidth:"100%",overflow:"hidden"}} onMouseEnter={hasLink?(e)=>{e.currentTarget.style.transform="scale(1.02)"}:undefined} onMouseLeave={hasLink?(e)=>{e.currentTarget.style.transform="scale(1)"}:undefined} title={n.msg+(n.fromName?" • من: "+n.fromName:"")+(remain?" • متبقي: "+remain:"")+(hasLink?" • اضغط للذهاب لـ"+(n.link.label||""):"")}>
                  <span style={{fontSize:FS+3,lineHeight:1,flexShrink:0}}>{st.icon}</span>
                  <span style={{lineHeight:1.3,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",flex:"1 1 auto",minWidth:30}}>{n.msg}</span>
                  {hasLink&&<span style={{fontSize:FS-1,padding:"2px 8px",borderRadius:6,background:"rgba(255,255,255,0.55)",border:"1px solid "+st.text+"40",fontWeight:800,flexShrink:0,whiteSpace:"nowrap"}}>🔗 {n.link.label||"فتح"}</span>}
                  {n.fromName&&<span style={{fontSize:FS-2,opacity:0.7,fontWeight:600,flexShrink:0,whiteSpace:"nowrap",display:isMob?"none":"inline"}}>— {n.fromName}</span>}
                  {remain&&<span style={{fontSize:FS-2,opacity:0.7,padding:"0 5px",borderInlineStart:"1px solid "+st.text+"40",flexShrink:0,whiteSpace:"nowrap"}}>⏰ {remain}</span>}
                  {canEnd&&<span onClick={(e)=>{e.stopPropagation();endNotif(n.id);showToast("⏹ تم إنهاء الإشعار للجميع")}} title="إنهاء (للجميع)" style={{cursor:"pointer",padding:"2px 8px",borderRadius:6,background:"rgba(255,255,255,0.65)",border:"1px solid "+st.text+"50",fontSize:FS-1,fontWeight:800,flexShrink:0,whiteSpace:"nowrap"}}>⏹ إنهاء</span>}
                  <span onClick={(e)=>{e.stopPropagation();markRead(n.id)}} title="إخفاء عندي" style={{cursor:"pointer",opacity:0.55,padding:"0 3px",fontSize:FS,flexShrink:0}}>✕</span>
                </div>;
              })}
              {hiddenCount>0&&<div onClick={()=>setNotifPopupOpen(true)} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:10,background:"#6366F112",border:"1.5px solid #6366F140",color:"#4F46E5",fontSize:FS+1,fontWeight:800,cursor:"pointer",transition:"transform 0.15s",flexShrink:0,whiteSpace:"nowrap"}} onMouseEnter={(e)=>{e.currentTarget.style.transform="scale(1.03)"}} onMouseLeave={(e)=>{e.currentTarget.style.transform="scale(1)"}} title="عرض كل الإشعارات">
                <span style={{fontSize:FS+3,lineHeight:1}}>📥</span>
                <span>+{hiddenCount} {hiddenCount===1?"إشعار آخر":"إشعارات أخرى"}</span>
              </div>}
            </div>;
            })()}
            {/* V19.48: Season badge moved to top bar (next to bell). Removed from here to keep
                greeting-bar single-row even when notifications are present. */}
          </div>

          {/* ═══ MAIN CONTENT: Tabs Grid + Sidebar (Desktop) / Stacked (Mobile) ═══ */}
          {!isMob?<div style={{display:"grid",gridTemplateColumns:"1fr 300px",gap:18,alignItems:"flex-start",maxWidth:1400,margin:"0 auto"}}>
            {/* ═══ LEFT: Tabs Grid (SVG icons) ═══ */}
            <div>
              {/* V19.48: Tile width capped to ~130px (was filling the column = ~160-180px),
                  giving a more compact dashboard. Gap (24), aspect-ratio (1), inner padding,
                  and icon size (44×44, SVG 22×22) all preserved as requested.
                  justifyContent:"center" centers the grid since it no longer fills the column. */}
              <div style={{display:"grid",gridTemplateColumns:isTab?"repeat(4, minmax(0, 130px))":"repeat(6, minmax(0, 130px))",gap:24,justifyContent:"center"}}>
                {visibleTabs.map(t=>{const perm=getTabPerm(t.key);
                  return<div key={t.key} onClick={()=>goTo(t.key)} className="home-tile" style={{background:T.cardSolid,borderRadius:11,padding:"10px 8px",border:"1px solid "+T.brd,textAlign:"center",opacity:perm==="view"?0.75:1,position:"relative",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,aspectRatio:"1"}}>
                    <div style={{width:44,height:44,borderRadius:11,background:t.color+"12",display:"flex",alignItems:"center",justifyContent:"center",color:t.color,border:"1px solid "+t.color+"20"}}>
                      <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{t.svg}</svg>
                    </div>
                    <div style={{fontSize:FS-1,fontWeight:800,color:T.text,lineHeight:1.15}}>{t.label}</div>
                    {perm==="view"&&<div style={{position:"absolute",top:4,left:4,fontSize:8,padding:"1px 5px",borderRadius:4,background:T.warn+"18",color:T.warn,fontWeight:700}}>👁</div>}
                  </div>})}
              </div>

              {/* Quick Action Buttons */}
              <div style={{display:"flex",gap:10,marginTop:18,flexWrap:"wrap"}}>
                <div onClick={()=>setQuickPopup("task")} style={{cursor:"pointer",padding:"10px 18px",borderRadius:10,background:T.accent+"08",border:"1px solid "+T.accent+"25",display:"flex",alignItems:"center",gap:8,transition:"all 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background=T.accent+"15"} onMouseLeave={e=>e.currentTarget.style.background=T.accent+"08"}>
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  <span style={{fontSize:FS-1,fontWeight:700,color:T.accent}}>مهمة جديدة</span>
                </div>
                <div onClick={()=>setQuickPopup("notif")} style={{cursor:"pointer",padding:"10px 18px",borderRadius:10,background:"#8B5CF608",border:"1px solid #8B5CF625",display:"flex",alignItems:"center",gap:8,transition:"all 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background="#8B5CF615"} onMouseLeave={e=>e.currentTarget.style.background="#8B5CF608"}>
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  <span style={{fontSize:FS-1,fontWeight:700,color:"#8B5CF6"}}>إرسال اشعار</span>
                </div>
                <div onClick={()=>setBarcodePopup({mode:"manual",modelId:"",size:"",qty:1,serial:1})} style={{cursor:"pointer",padding:"10px 18px",borderRadius:10,background:"#F59E0B08",border:"1px solid #F59E0B25",display:"flex",alignItems:"center",gap:8,transition:"all 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background="#F59E0B15"} onMouseLeave={e=>e.currentTarget.style.background="#F59E0B08"}>
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="7" y1="7" x2="7" y2="17"/><line x1="11" y1="7" x2="11" y2="17"/><line x1="15" y1="7" x2="15" y2="17"/><line x1="17" y1="7" x2="17" y2="17"/></svg>
                  <span style={{fontSize:FS-1,fontWeight:700,color:"#F59E0B"}}>طباعة QR</span>
                </div>
                {/* V19.81.0: Pieces lookup quick action */}
                {canViewTab("pieces")&&<div onClick={()=>goTo("pieces")} style={{cursor:"pointer",padding:"10px 18px",borderRadius:10,background:"#0EA5E908",border:"1px solid #0EA5E925",display:"flex",alignItems:"center",gap:8,transition:"all 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background="#0EA5E915"} onMouseLeave={e=>e.currentTarget.style.background="#0EA5E908"}>
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#0EA5E9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><rect x="7" y="7" width="2.5" height="2.5"/><rect x="12.5" y="7" width="2.5" height="2.5"/><rect x="7" y="12.5" width="2.5" height="2.5"/></svg>
                  <span style={{fontSize:FS-1,fontWeight:700,color:"#0EA5E9"}}>🔍 تتبع القطع</span>
                </div>}
                {/* V19.68: Automation quick action — gated by canViewTab */}
                {canViewTab("automation")&&<div onClick={()=>goTo("automation")} style={{cursor:"pointer",padding:"10px 18px",borderRadius:10,background:"#0EA5E908",border:"1px solid #0EA5E925",display:"flex",alignItems:"center",gap:8,transition:"all 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background="#0EA5E915"} onMouseLeave={e=>e.currentTarget.style.background="#0EA5E908"}>
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#0EA5E9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>
                  <span style={{fontSize:FS-1,fontWeight:700,color:"#0EA5E9"}}>🤖 Automation</span>
                </div>}
              </div>

              {/* Odoo Quick Links — V18.46: gated by config.odooEnabled */}
              {(data.odooEnabled !== false) && (()=>{
                const defaultLinks=[
                  {id:"accounting",icon:"📊",label:"المحاسبة",url:"https://clarkdb.odoo.com/odoo/accounting",color:"#8B5CF6"},
                  {id:"sales",icon:"🛒",label:"المبيعات",url:"https://clarkdb.odoo.com/odoo/sales",color:"#10B981"},
                  {id:"purchase",icon:"🏷️",label:"المشتريات",url:"https://clarkdb.odoo.com/odoo/purchase",color:"#EF4444"},
                  {id:"inventory",icon:"📦",label:"المخزن",url:"https://clarkdb.odoo.com/odoo/inventory",color:"#F59E0B"},
                  {id:"invoices",icon:"🧾",label:"فواتير بيع",url:"https://clarkdb.odoo.com/odoo/accounting/customer-invoices",color:"#0EA5E9"},
                ];
                const links=data.odooLinks||defaultLinks;
                if(links.length===0)return null;
                return<div style={{marginTop:24}}>
                  <div style={{fontSize:FS-1,fontWeight:800,color:T.textSec,marginBottom:12,padding:"0 4px",textTransform:"uppercase",letterSpacing:"0.6px",display:"flex",alignItems:"center",gap:8}}>
                    <img src="https://odoo-community.org/web/image/ir.attachment/22977/datas" alt="Odoo" style={{height:16,opacity:0.8}} onError={e=>{e.target.style.display="none"}}/>
                    <span>روابط Odoo</span>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(110px,1fr))",gap:10}}>
                    {links.map(l=><a key={l.id||l.label} href={l.url} target="_blank" rel="noopener noreferrer" className="home-tile" style={{background:T.cardSolid,borderRadius:12,padding:"14px 10px",border:"1px solid "+(l.color||T.accent)+"20",textAlign:"center",textDecoration:"none",display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
                      <div style={{fontSize:22,lineHeight:1}}>{l.icon||"🔗"}</div>
                      <div style={{fontSize:FS-2,fontWeight:700,color:l.color||T.accent,lineHeight:1.2}}>{l.label}</div>
                    </a>)}
                  </div>
                </div>;
              })()}
            </div>

            {/* ═══ RIGHT: Sidebar (Tabs: Notes / Tasks / Activity) ═══ */}
            <div style={{position:"sticky",top:12}}>
              <div style={{display:"flex",gap:4,marginBottom:14,background:T.bg,padding:4,borderRadius:10,border:"1px solid "+T.brd}}>
                <div onClick={()=>setSidebarTab("notes")} className={"sb-tab "+(sidebarTab==="notes"?"active":"")} style={{flex:1}}>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                  <span>ملاحظات{myNotes.length>0?" ("+myNotes.length+")":""}</span>
                </div>
                <div onClick={()=>setSidebarTab("tasks")} className={"sb-tab "+(sidebarTab==="tasks"?"active":"")} style={{flex:1}}>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                  <span>مهام{myTasks.length>0?" ("+myTasks.length+")":""}</span>
                </div>
                <div onClick={()=>setSidebarTab("activity")} className={"sb-tab "+(sidebarTab==="activity"?"active":"")} style={{flex:1}}>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                  <span>نشاط</span>
                </div>
              </div>

              {/* NOTES TAB */}
              {sidebarTab==="notes"&&<div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <span style={{fontSize:FS-2,color:T.textMut,fontWeight:600}}>{myNotes.length}/20</span>
                  <span onClick={()=>setStickyForm({id:gid(),email:uemail,title:"",text:"",color:"#FEF9C3",date:new Date().toISOString().split("T")[0]})} style={{cursor:"pointer",fontSize:FS-2,padding:"5px 12px",borderRadius:6,background:T.accent+"12",color:T.accent,fontWeight:700,display:"inline-flex",alignItems:"center",gap:4}}>
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    <span>جديدة</span>
                  </span>
                </div>
                {stickyForm&&<div style={{background:stickyForm.color,borderRadius:10,padding:10,border:"2px solid "+(COLORS.find(c=>c.key===stickyForm.color)?.border||"#EAB308")+"40",marginBottom:10}}>
                  <div style={{display:"flex",gap:3,marginBottom:6}}>{COLORS.map(c=><div key={c.key} onClick={()=>setStickyForm(p=>({...p,color:c.key}))} style={{width:16,height:16,borderRadius:4,background:c.key,border:stickyForm.color===c.key?"2px solid "+c.border:"1px solid #ccc",cursor:"pointer"}}/>)}</div>
                  <input value={stickyForm.title} onChange={e=>setStickyForm(p=>({...p,title:e.target.value}))} placeholder="العنوان..." style={{width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid #ddd",fontSize:FS-1,fontFamily:"inherit",fontWeight:700,background:"rgba(255,255,255,0.6)",marginBottom:4,boxSizing:"border-box"}}/>
                  <textarea value={stickyForm.text} onChange={e=>setStickyForm(p=>({...p,text:e.target.value}))} placeholder="ملاحظة..." rows={3} style={{width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid #ddd",fontSize:FS-2,fontFamily:"inherit",background:"rgba(255,255,255,0.6)",resize:"none",boxSizing:"border-box"}}/>
                  <div style={{display:"flex",gap:4,marginTop:6,justifyContent:"flex-end"}}>
                    <Btn ghost small onClick={()=>setStickyForm(null)}>إلغاء</Btn>
                    <Btn primary small onClick={()=>{if(!stickyForm.title?.trim()&&!stickyForm.text?.trim())return;saveNote(stickyForm)}}>💾 حفظ</Btn>
                  </div>
                </div>}
                <div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:500,overflowY:"auto"}}>
                  {myNotes.length>0?myNotes.map(n=>{const bc=COLORS.find(c=>c.key===n.color);return<div key={n.id} style={{background:n.color||"#FEF9C3",borderRadius:10,padding:"8px 10px",border:"1px solid "+(bc?.border||"#EAB308")+"30"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:6}}>
                      {n.title&&<div style={{fontWeight:700,fontSize:FS-1,color:"#1E293B",marginBottom:2,flex:1,lineHeight:1.3}}>{n.title}</div>}
                      <div style={{display:"flex",gap:2,flexShrink:0}}>
                        <span onClick={()=>setStickyForm({...n})} style={{cursor:"pointer",fontSize:11,opacity:0.5}}>✏️</span>
                        <span onClick={()=>delNote(n.id)} style={{cursor:"pointer",fontSize:11,opacity:0.5}}>✕</span>
                      </div>
                    </div>
                    {n.text&&<div style={{fontSize:FS-2,color:"#334155",lineHeight:1.4,whiteSpace:"pre-wrap"}}>{n.text}</div>}
                    <div style={{fontSize:FS-3,color:"#94A3B8",marginTop:4}}>{n.date}</div>
                  </div>}):<div style={{textAlign:"center",padding:"30px 14px",color:T.textMut,background:T.bg,borderRadius:10,border:"1px dashed "+T.brd}}>
                    <div style={{fontSize:30,marginBottom:6,opacity:0.5}}>📝</div>
                    <div style={{fontSize:FS-1,fontWeight:600}}>لا توجد ملاحظات</div>
                    <div style={{fontSize:FS-3,marginTop:2}}>اضغط "جديدة" لإضافة</div>
                  </div>}
                </div>
              </div>}

              {/* TASKS TAB */}
              {sidebarTab==="tasks"&&<div>
                {myTasks.length>0?<>
                  <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:520,overflowY:"auto"}}>{myTasks.map(t=><div key={t.id} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"10px 12px",borderRadius:10,background:"#FEF9C3",border:"1px solid #EAB30830"}}>
                    <span onClick={()=>upTasks(d=>{const arr=Array.isArray(d.tasks)?d.tasks:[];const tk=arr.find(x=>String(x.id)===String(t.id));if(tk){tk.done=true;tk.doneAt=new Date().toISOString()}})} style={{cursor:"pointer",fontSize:16,flexShrink:0,marginTop:1}} title="إتمام المهمة">⬜</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:FS-1,fontWeight:600,color:"#1C1917",lineHeight:1.4}}>{t.text}</div>
                      <div style={{fontSize:FS-3,color:"#78716C",marginTop:3}}>{"من: "+(t.fromName||"—")}</div>
                    </div>
                  </div>)}</div>
                  <div style={{textAlign:"center",marginTop:10}}>
                    <span onClick={()=>goTo("tasks")} style={{cursor:"pointer",fontSize:FS-2,color:T.accent,fontWeight:700,padding:"6px 14px",borderRadius:6,background:T.accent+"10",display:"inline-block"}}>عرض كل المهام</span>
                  </div>
                </>:<div style={{textAlign:"center",padding:"30px 14px",color:T.textMut,background:T.bg,borderRadius:10,border:"1px dashed "+T.brd}}>
                  <div style={{fontSize:30,marginBottom:6,opacity:0.5}}>✅</div>
                  <div style={{fontSize:FS-1,fontWeight:600}}>لا توجد مهام</div>
                  <div style={{fontSize:FS-3,marginTop:2}}>مهامك المسندة هتظهر هنا</div>
                </div>}
              </div>}

              {/* ACTIVITY TAB */}
              {sidebarTab==="activity"&&<div>
                <ActivityFeed orders={data.orders} config={config} user={user} isMob={false}/>
              </div>}
            </div>
          </div>
          :/* ═══ MOBILE LAYOUT ═══ */<div>
            {/* Tabs Grid */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>
              {visibleTabs.map(t=>{const perm=getTabPerm(t.key);
                return<div key={t.key} onClick={()=>goTo(t.key)} className="home-tile" style={{background:T.cardSolid,borderRadius:14,padding:"14px 8px",border:"1px solid "+T.brd,textAlign:"center",opacity:perm==="view"?0.75:1,position:"relative",display:"flex",flexDirection:"column",alignItems:"center",gap:8,minHeight:100}}>
                  <div style={{width:44,height:44,borderRadius:10,background:t.color+"12",display:"flex",alignItems:"center",justifyContent:"center",color:t.color,border:"1px solid "+t.color+"20"}}>
                    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{t.svg}</svg>
                  </div>
                  <div style={{fontSize:FS,fontWeight:800,color:T.text,lineHeight:1.2}}>{t.label}</div>
                  {perm==="view"&&<div style={{position:"absolute",top:4,left:4,fontSize:8,padding:"1px 4px",borderRadius:3,background:T.warn+"18",color:T.warn,fontWeight:700}}>👁</div>}
                </div>})}
            </div>

            {/* QR Scan primary button */}
            <div onClick={()=>setShowScanner("menu")} style={{margin:"0 auto 14px",maxWidth:260}}><div style={{background:"linear-gradient(135deg,"+T.accent+","+T.accent+"CC)",borderRadius:12,padding:"12px 24px",cursor:"pointer",display:"flex",alignItems:"center",gap:10,justifyContent:"center",boxShadow:"0 4px 16px "+T.accent+"40"}}>
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><path d="M15 13h3v3h-3z M18 18h3v3h-3z M13 13h2 M13 18h2"/></svg>
              <span style={{fontSize:FS+1,fontWeight:800,color:"#fff"}}>مسح QR</span>
            </div></div>

            {/* Quick actions */}
            <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap",marginBottom:14}}>
              <div onClick={()=>setQuickPopup("task")} style={{cursor:"pointer",padding:"8px 14px",borderRadius:10,background:T.accent+"10",border:"1px solid "+T.accent+"25",display:"flex",alignItems:"center",gap:6}}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                <span style={{fontSize:FS-2,fontWeight:700,color:T.accent}}>مهمة</span>
              </div>
              <div onClick={()=>setQuickPopup("notif")} style={{cursor:"pointer",padding:"8px 14px",borderRadius:10,background:"#8B5CF610",border:"1px solid #8B5CF625",display:"flex",alignItems:"center",gap:6}}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <span style={{fontSize:FS-2,fontWeight:700,color:"#8B5CF6"}}>اشعار</span>
              </div>
              <div onClick={()=>setBarcodePopup({mode:"manual",modelId:"",size:"",qty:1,serial:1})} style={{cursor:"pointer",padding:"8px 14px",borderRadius:10,background:"#F59E0B10",border:"1px solid #F59E0B25",display:"flex",alignItems:"center",gap:6}}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="7" y1="7" x2="7" y2="17"/><line x1="11" y1="7" x2="11" y2="17"/><line x1="15" y1="7" x2="15" y2="17"/><line x1="17" y1="7" x2="17" y2="17"/></svg>
                <span style={{fontSize:FS-2,fontWeight:700,color:"#F59E0B"}}>QR</span>
              </div>
              {/* V15.61: Mobile warehouse quick access */}
              <div onClick={()=>window.open("/warehouse","_blank")} style={{cursor:"pointer",padding:"8px 14px",borderRadius:10,background:"#10B98110",border:"1px solid #10B98125",display:"flex",alignItems:"center",gap:6}} title="فتح وضع المخزن السريع">
                <span style={{fontSize:14}}>📱</span>
                <span style={{fontSize:FS-2,fontWeight:700,color:"#10B981"}}>وضع المخزن</span>
              </div>
              {/* V19.68: Automation mobile button */}
              {canViewTab("automation")&&<div onClick={()=>goTo("automation")} style={{cursor:"pointer",padding:"8px 14px",borderRadius:10,background:"#0EA5E910",border:"1px solid #0EA5E925",display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:14}}>🤖</span>
                <span style={{fontSize:FS-2,fontWeight:700,color:"#0EA5E9"}}>Automation</span>
              </div>}
            </div>

            {/* Mobile: tasks + activity inline */}
            {myTasks.length>0&&<div style={{marginBottom:14}}>
              <div style={{background:"#FEF9C3",borderRadius:14,border:"1px solid #EAB30830",padding:12}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}><span style={{fontSize:16}}>✅</span><span style={{fontSize:FS,fontWeight:800,color:"#92400E"}}>{"مهامي ("+myTasks.length+")"}</span></div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>{myTasks.slice(0,5).map(t=><div key={t.id} style={{display:"flex",alignItems:"flex-start",gap:6,padding:"8px 10px",borderRadius:8,background:"rgba(255,255,255,0.7)",border:"1px solid #EAB30820"}}>
                  <span onClick={()=>upTasks(d=>{const arr=Array.isArray(d.tasks)?d.tasks:[];const tk=arr.find(x=>String(x.id)===String(t.id));if(tk){tk.done=true;tk.doneAt=new Date().toISOString()}})} style={{cursor:"pointer",fontSize:16}}>⬜</span>
                  <div style={{flex:1}}><div style={{fontSize:FS-1,fontWeight:600,color:"#1C1917"}}>{t.text}</div><div style={{fontSize:FS-3,color:"#78716C"}}>{"من: "+(t.fromName||"—")}</div></div>
                </div>)}</div>
              </div>
            </div>}

            <div style={{marginBottom:14}}><ActivityFeed orders={data.orders} config={config} user={user} isMob={true}/></div>

            {/* Odoo links mobile — V18.46: gated by config.odooEnabled */}
            {(data.odooEnabled !== false) && (()=>{
              const defaultLinks=[
                {id:"accounting",icon:"📊",label:"المحاسبة",url:"https://clarkdb.odoo.com/odoo/accounting",color:"#8B5CF6"},
                {id:"sales",icon:"🛒",label:"المبيعات",url:"https://clarkdb.odoo.com/odoo/sales",color:"#10B981"},
                {id:"purchase",icon:"🏷️",label:"المشتريات",url:"https://clarkdb.odoo.com/odoo/purchase",color:"#EF4444"},
                {id:"inventory",icon:"📦",label:"المخزن",url:"https://clarkdb.odoo.com/odoo/inventory",color:"#F59E0B"},
                {id:"invoices",icon:"🧾",label:"فواتير بيع",url:"https://clarkdb.odoo.com/odoo/accounting/customer-invoices",color:"#0EA5E9"},
              ];
              const links=data.odooLinks||defaultLinks;
              if(links.length===0)return null;
              return<div>
                <div style={{fontSize:FS-1,fontWeight:800,color:T.textSec,marginBottom:10,textAlign:"center"}}>روابط Odoo</div>
                <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
                  {links.map(l=><a key={l.id||l.label} href={l.url} target="_blank" rel="noopener noreferrer" style={{background:T.cardSolid,borderRadius:12,padding:"10px 8px",border:"1px solid "+(l.color||T.accent)+"20",textDecoration:"none",width:80,textAlign:"center",display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                    <div style={{fontSize:20,lineHeight:1}}>{l.icon||"🔗"}</div>
                    <div style={{fontSize:FS-3,fontWeight:700,color:l.color||T.accent,lineHeight:1.2}}>{l.label}</div>
                  </a>)}
                </div>
              </div>;
            })()}
          </div>}

          {/* V15.63: Floating AI Assistant button — home screen, desktop only */}
          {!isMob&&<>
            <div onClick={()=>setAiOpen(!aiOpen)} title="المساعد الذكي" style={{position:"fixed",bottom:30,right:30,zIndex:9997,width:60,height:60,borderRadius:"50%",background:aiOpen?"linear-gradient(135deg,#0EA5E9,#8B5CF6)":"linear-gradient(135deg,#0EA5E9,#8B5CF6)",boxShadow:aiOpen?"0 8px 30px rgba(139,92,246,0.5)":"0 6px 20px rgba(14,165,233,0.35)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",transition:"all 0.25s cubic-bezier(0.4,0,0.2,1)",transform:aiOpen?"scale(1.05)":"scale(1)",border:"3px solid #fff"}} onMouseEnter={e=>{e.currentTarget.style.transform="scale(1.08)"}} onMouseLeave={e=>{e.currentTarget.style.transform=aiOpen?"scale(1.05)":"scale(1)"}}>
              <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>
              {visibleAlerts.length>0&&<span style={{position:"absolute",top:-4,right:-4,minWidth:22,height:22,padding:"0 6px",borderRadius:11,background:"#EF4444",color:"#fff",fontSize:11,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",border:"2px solid #fff"}}>{visibleAlerts.length}</span>}
            </div>
            {aiOpen&&<>
              <div onClick={()=>setAiOpen(false)} style={{position:"fixed",inset:0,zIndex:9998}}/>
              <div style={{position:"fixed",bottom:100,right:30,zIndex:9999}}>
                <div style={{background:T.cardSolid,borderRadius:16,border:"1px solid "+T.brd,boxShadow:"0 12px 48px rgba(0,0,0,0.25)",display:"flex",flexDirection:"column",height:520,width:400}}>
                  <div style={{padding:"12px 16px",borderBottom:"1px solid "+T.brd,display:"flex",justifyContent:"space-between",alignItems:"center",background:"linear-gradient(135deg,#0EA5E915,#8B5CF615)",borderRadius:"16px 16px 0 0"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:22}}>🤖</span><div><div style={{fontWeight:800,fontSize:FS+1,color:T.text,lineHeight:1.1}}>مساعد CLARK</div><div style={{fontSize:FS-3,color:T.textMut,marginTop:1}}>اسألني عن المصنع</div></div></div>
                    <div style={{display:"flex",gap:4}}>
                      {aiMsgs.length>0&&<span onClick={()=>setAiMsgs([])} style={{cursor:"pointer",fontSize:11,padding:"3px 10px",borderRadius:6,background:T.err+"12",color:T.err,fontWeight:700}}>مسح</span>}
                      <span onClick={()=>setAiOpen(false)} style={{cursor:"pointer",fontSize:18,color:T.textMut,padding:"0 6px"}}>✕</span>
                    </div>
                  </div>
                  <div style={{flex:1,overflowY:"auto",padding:12,display:"flex",flexDirection:"column",gap:8}}>
                    {aiMsgs.length===0&&<div>
                      {visibleAlerts.length>0&&<div style={{marginBottom:12}}>
                        <div style={{fontSize:FS-1,fontWeight:800,color:T.text,marginBottom:8,display:"flex",alignItems:"center",gap:6}}>{"⚡ "+visibleAlerts.length+" تنبيه"}</div>
                        {visibleAlerts.map((al,i)=><div key={i} onClick={()=>{setAiInput(al.text)}} style={{display:"flex",gap:8,alignItems:"flex-start",padding:"8px 10px",marginBottom:4,borderRadius:10,background:al.type==="late"?"#FEF2F2":al.type==="ready"?"#F0FDF4":al.type==="overpaid"?"#FFF7ED":al.type==="slow"?"#FFFBEB":"#F8FAFC",border:"1px solid "+(al.type==="late"?"#FECACA":al.type==="ready"?"#BBF7D0":al.type==="overpaid"?"#FED7AA":al.type==="slow"?"#FDE68A":"#E2E8F0"),cursor:"pointer"}}>
                          <span style={{fontSize:16,flexShrink:0}}>{al.icon}</span>
                          <span style={{fontSize:FS-2,color:"#1E293B",fontWeight:600,lineHeight:1.5,flex:1}}>{al.text}</span>
                          {al.wsPhone&&<span onClick={e=>{e.stopPropagation();const lines=(al.details||[]).map(d=>"• موديل *"+d.modelNo+"*: *"+d.qty+"* قطعة — "+d.days+" يوم"+(d.agreed?" (متفق "+d.agreed+" يوم)":"")).join("%0A");const msg="*CLARK — تنبيه تأخير*%0A%0A• الورشة: *"+al.wsName+"*%0A%0A"+lines+"%0A%0A⚠️ *برجاء الاهتمام بالتسليم في أقرب وقت*";openWA("https://wa.me/"+(al.wsPhone.replace(/[^0-9]/g,""))+"?text="+msg,"_blank");dismissAlert(al.key||al.text)}} style={{cursor:"pointer",fontSize:10,color:"#25D366",flexShrink:0,padding:"0 4px",fontWeight:700}}>📱</span>}
                          <span onClick={e=>{e.stopPropagation();dismissAlert(al.key||al.text)}} style={{cursor:"pointer",fontSize:10,color:"#94A3B8",flexShrink:0,padding:"0 2px"}}>✕</span>
                        </div>)}
                        <div style={{textAlign:"center",margin:"10px 0",fontSize:FS-2,color:T.textMut,letterSpacing:4}}>— — —</div>
                      </div>}
                      <div style={{textAlign:"center",padding:visibleAlerts.length>0?8:20,color:T.textMut}}>
                        {visibleAlerts.length===0&&<div style={{fontSize:38,marginBottom:10}}>🤖</div>}
                        <div style={{fontSize:FS-1,fontWeight:700,marginBottom:10,color:T.text}}>جرب تسأل:</div>
                        <div style={{display:"flex",flexDirection:"column",gap:6}}>
                          {["📦 إيه الورش اللي متأخرة؟","📊 لخصلي أداء الأسبوع","🏭 كام أوردر جاهز للتسليم؟","💰 مين الورش المدفوع لها زيادة؟","🛒 إيه أكتر الموديلات مبيعاً؟"].map((s,i)=><div key={i} onClick={()=>setAiInput(s.replace(/^[^\s]+\s/,""))} style={{padding:"8px 12px",borderRadius:10,background:T.bg,border:"1px solid "+T.brd,fontSize:FS-1,color:T.text,cursor:"pointer",textAlign:"right",fontWeight:600,transition:"all 0.15s"}} onMouseEnter={e=>{e.currentTarget.style.background=T.accent+"10";e.currentTarget.style.borderColor=T.accent+"40"}} onMouseLeave={e=>{e.currentTarget.style.background=T.bg;e.currentTarget.style.borderColor=T.brd}}>{s}</div>)}
                        </div>
                      </div>
                    </div>}
                    {aiMsgs.map((m,i)=><div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-start":"flex-end"}}>
                      <div style={{maxWidth:"85%",padding:"10px 14px",borderRadius:m.role==="user"?"12px 12px 4px 12px":"12px 12px 12px 4px",background:m.role==="user"?T.accent:T.bg,color:m.role==="user"?"#fff":T.text,fontSize:FS-1,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{m.text}</div>
                    </div>)}
                    {aiLoading&&<div style={{display:"flex",justifyContent:"flex-end"}}><div style={{padding:"10px 16px",borderRadius:12,background:T.bg,fontSize:FS-1,color:T.textMut,display:"inline-flex",alignItems:"center",gap:8}}><Spinner size="small" inline/><span>جاري التحليل...</span></div></div>}
                  </div>
                  <div style={{padding:"10px 12px",borderTop:"1px solid "+T.brd,display:"flex",gap:6}}>
                    <input value={aiInput} onChange={e=>setAiInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")askAI()}} placeholder="اسأل عن أي حاجة..." style={{flex:1,padding:"10px 12px",borderRadius:10,border:"1px solid "+T.brd,fontSize:FS,fontFamily:"inherit",background:T.bg,color:T.text,outline:"none",boxSizing:"border-box"}}/>
                    <button onClick={askAI} disabled={aiLoading||!aiInput.trim()} style={{padding:"10px 16px",borderRadius:10,border:"none",background:aiInput.trim()?"linear-gradient(135deg,#0EA5E9,#8B5CF6)":"#E2E8F0",color:aiInput.trim()?"#fff":"#94A3B8",cursor:aiInput.trim()?"pointer":"default",fontSize:14,fontWeight:700}}>📩</button>
                  </div>
                </div>
              </div>
            </>}
          </>}
        </div>;
      })()}
      {/* PAGES with back button */}
      {/* V16.1: All lazy pages wrapped in ChunkErrorBoundary + Suspense.
         DashPg stays eager (always first screen), rest load on-demand. */}
      {tab!=="home"&&canViewTab(tab)&&<div>
        {tab==="dashboard"&&<DashPg data={data} goD={goD} isMob={isMob} isTab={isTab} season={season} statusCards={statusCards} upConfig={upConfig} user={user} setCardPopup={setCardPopup} setWsAccPopup={setWsAccPopup}/>}
        <ChunkErrorBoundary>
        <Suspense fallback={<PageLoader/>}>
        {tab==="db"&&<DBPg data={data} upConfig={upConfig} isMob={isMob} isTab={isTab} canEdit={canEditTab("db")} statusCards={statusCards} initialSub={dbSub} onSubUsed={()=>setDbSub(null)} renameInOrders={renameInOrders}/>}
        {tab==="details"&&<DetPg data={data} updOrder={updOrder} replaceOrder={replaceOrder} addOrder={addOrder} delOrder={delOrder} sel={sel} setSel={setSel} isMob={isMob} isTab={isTab} canEdit={canEditTab("details")} statusCards={statusCards} goHome={goHome} upConfig={upConfig} user={user}/>}
        {tab==="external"&&<ExtProdPg data={data} updOrder={updOrder} upConfig={upConfig} isMob={isMob} isTab={isTab} canEdit={canEditTab("external")} statusCards={statusCards} season={season} user={user}/>}
        {tab==="stock"&&<StockPg data={data} updOrder={updOrder} isMob={isMob} canEdit={canEditTab("stock")} statusCards={statusCards} user={user}/>}
        {tab==="tasks"&&<TasksPg data={data} upConfig={upConfig} upTasks={upTasks} isMob={isMob} user={user} userRole={userRole}/>}
        {tab==="reports"&&<ReportsHub data={data} isMob={isMob} season={season} statusCards={statusCards}/>}
        {tab==="settings"&&canEditTab("settings")&&<SettingsPg config={config} upConfig={upConfig} upSales={upSales} upTasks={upTasks} isMob={isMob} user={user} userRole={userRole} theme={theme} setTheme={setTheme} season={season} orders={orders} syncWsIds={syncWsIds} replaceOrder={replaceOrder} updOrder={updOrder} configDoc={configDoc} salesDoc={salesDoc} tasksDoc={tasksDoc}/>}
        {tab==="custDeliver"&&<CustDeliverPg data={data} upConfig={upConfig} upSales={upSales} upTasks={upTasks} updOrder={updOrder} isMob={isMob} isTab={isTab} canEdit={canEditTab("custDeliver")} user={user} season={season}/>}
        {/* V19.48: 6 tabs that were UNGATED before V19.48 (open to all roles).
            Now properly checked via canViewTab — viewer/payroll/etc. see "hide". */}
        {tab==="salesInvoices"&&canViewTab("salesInvoices")&&<SalesInvoicesPg data={data} upConfig={upConfig} isMob={isMob} user={user}/>}
        {tab==="creditNotes"&&canViewTab("creditNotes")&&<CreditNotesPg data={data} upConfig={upConfig} isMob={isMob} user={user}/>}
        {tab==="purchase"&&<PurchasePg data={data} upConfig={upConfig} isMob={isMob} isTab={isTab} canEdit={canEditTab("purchase")} user={user} userRole={userRole}/>}
        {tab==="purchaseInvoices"&&canViewTab("purchaseInvoices")&&<PurchaseInvoicesPg data={data} upConfig={upConfig} isMob={isMob} canEdit={canEditTab("purchaseInvoices")} user={user}/>}
        {/* V19.48: Debit notes (purchase returns) */}
        {tab==="debitNotes"&&canViewTab("debitNotes")&&<DebitNotesPg data={data} upConfig={upConfig} isMob={isMob} canEdit={canEditTab("debitNotes")} user={user}/>}
        {tab==="warehouse"&&<WarehousePg data={data} upConfig={upConfig} updOrder={updOrder} isMob={isMob} isTab={isTab} canEdit={canEditTab("warehouse")} statusCards={statusCards} user={user} userRole={userRole}/>}
        {/* V19.81.0: Pieces lookup — scan QR → see lifecycle.
            V19.86.0: also receives upSales + updOrder so SellTab can create
            real customer deliveries that show up in KASF + accounting. */}
        {tab==="pieces"&&canViewTab("pieces")&&<PiecesPg data={data} isMob={isMob} T={T} FS={FS} user={user} upConfig={upConfig} upSales={upSales} updOrder={updOrder}/>}
        {tab==="treasury"&&<TreasuryPg data={data} upConfig={upConfig} isMob={isMob} canEdit={canEditTab("treasury")} user={user} userRole={userRole}/>}
        {tab==="hr"&&<HRPg data={data} upConfig={upConfig} isMob={isMob} canEdit={canEditTab("hr")} user={user} userRole={userRole} getHrSubPerm={getHrSubPerm} setSavingOverlay={setSavingOverlay}/>}
        {/* V19.48: Bulk messaging campaigns */}
        {tab==="campaigns"&&<CampaignsPg data={data} upConfig={upConfig} isMob={isMob} canEdit={canEditTab("campaigns")} user={user}/>}
        {/* V19.68: Automation hub — daily reports + (future) event triggers */}
        {tab==="automation"&&<AutomationPg data={data} upConfig={upConfig} isMob={isMob} user={user}/>}
        {/* V19.71: AI Agent control center — personality, FAQs, schedule, logs (Phase A scaffold) */}
        {tab==="aiAgent"&&canViewTab("aiAgent")&&<AIAgentPg data={data} upConfig={upConfig} isMob={isMob} canEdit={canEditTab("aiAgent")} user={user}/>}
        {tab==="audit"&&canViewTab("audit")&&<AuditPg data={data} isMob={isMob} user={user}/>}
        {tab==="accounting"&&canViewTab("accounting")&&<AccountingPg data={data} config={config} upConfig={upConfig} isMob={isMob} canEdit={canEditTab("accounting")} user={user}/>}
        {tab==="fixedAssets"&&canViewTab("fixedAssets")&&<FixedAssetsPg data={data} config={config} isMob={isMob} canEdit={canEditTab("fixedAssets")} user={user}/>}
        </Suspense>
        </ChunkErrorBoundary>
      </div>}
    </div>
    {/* Quick Task/Notification Popup */}
    {quickPopup&&(()=>{const allUsers=(config.usersList||[]);const me={email:user?.email||"",name:user?.displayName||(user?.email||"").split("@")[0],role:userRole};
      const targets=allUsers.find(u=>u.email===me.email)?allUsers:[me,...allUsers];
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:99998,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>{setQuickPopup(null);setQpTo("");setQpText("");setQpType("تذكير")}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:20,width:"100%",maxWidth:380,boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
        <div style={{display:"flex",justifyContent:"flex-end",marginBottom:4}}><Btn ghost small onClick={()=>{setQuickPopup(null);setQpTo("");setQpText("");setQpType("تذكير")}}>✕</Btn></div>
        <div style={{display:"flex",gap:0,marginBottom:14,borderRadius:10,overflow:"hidden",border:"1px solid "+T.brd}}>
          <div onClick={()=>{setQuickPopup("task");setQpTo("");setQpText("")}} style={{flex:1,padding:"8px 0",textAlign:"center",cursor:"pointer",fontWeight:700,fontSize:FS,background:quickPopup==="task"?T.accent:T.bg,color:quickPopup==="task"?"#fff":T.text}}>📌 مهمة</div>
          <div onClick={()=>{setQuickPopup("notif");setQpTo("all");setQpText("")}} style={{flex:1,padding:"8px 0",textAlign:"center",cursor:"pointer",fontWeight:700,fontSize:FS,background:quickPopup==="notif"?"#8B5CF6":T.bg,color:quickPopup==="notif"?"#fff":T.text}}>📩 اشعار</div>
        </div>
        {quickPopup==="task"?<div>
          <div style={{marginBottom:8}}><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>ارسال الى</label><Sel value={qpTo} onChange={setQpTo}><option value="">-- اختر --</option>{targets.map(u=><option key={u.email} value={u.email}>{(u.name||u.email.split("@")[0])+(u.email===me.email?" (أنا)":"")+" — "+(u.role==="admin"?"مدير النظام":u.role==="manager"?"مدير انتاج":u.role==="sales_accountant"?"محاسب مبيعات":u.role==="purchase_accountant"?"محاسب مشتريات":"مشاهد")}</option>)}</Sel></div>
          <div style={{marginBottom:8}}><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>المهمة</label><Inp value={qpText} onChange={setQpText} placeholder="اكتب المهمة..."/></div>
          <Btn primary onClick={()=>{if(!qpTo||!qpText.trim())return;const target=targets.find(u=>u.email===qpTo);
            upTasks(d=>{if(!Array.isArray(d.tasks))d.tasks=[];d.tasks.unshift({id:Date.now(),text:qpText.trim(),done:false,date:new Date().toISOString().split("T")[0],fromUid:user?.uid||"",fromEmail:user?.email||"",fromName:me.name,toEmail:qpTo,toName:target?.name||qpTo.split("@")[0]})});
            setQuickPopup(null);setQpTo("");setQpText("");showToast("✓ تم ارسال المهمة")}} style={{width:"100%"}}>📌 ارسال المهمة</Btn>
        </div>:<div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>الى</label><Sel value={qpTo} onChange={setQpTo}><option value="all">الكل</option>{targets.map(u=><option key={u.email} value={u.email}>{(u.name||u.email.split("@")[0])+(u.email===me.email?" (أنا)":"")}</option>)}</Sel></div>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>النوع</label><Sel value={qpType} onChange={setQpType}><option value="تذكير">💬 تذكير</option><option value="طلب">📩 طلب</option><option value="مهمة">📌 مهمة</option><option value="مهمة عاجلة">🔴 عاجل</option></Sel></div>
            {/* V19.48: Display duration — sender chooses how long the notification stays visible */}
            <div><label style={{fontSize:FS-2,color:"#8B5CF6",fontWeight:700}}>⏱ مدة العرض</label><Sel value={qpDuration} onChange={setQpDuration}><option value="1h">🕐 ساعة</option><option value="2h">⏰ ساعتين</option><option value="1d">📅 يوم</option><option value="endday">🌅 آخر اليوم</option><option value="none">🔓 بدون حد</option></Sel></div>
          </div>
          <div style={{marginBottom:8}}><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>الرسالة</label><Inp value={qpText} onChange={setQpText} placeholder="اكتب الاشعار..."/></div>
          <Btn primary onClick={()=>{if(!qpText.trim())return;const to=qpTo||"all";const targetUser=targets.find(u=>u.email===to);
            /* V19.48: Compute expiresAt based on selected duration. */
            let expiresAt=null;
            const now=new Date();
            if(qpDuration==="1h")expiresAt=new Date(now.getTime()+60*60*1000).toISOString();
            else if(qpDuration==="2h")expiresAt=new Date(now.getTime()+2*60*60*1000).toISOString();
            else if(qpDuration==="1d")expiresAt=new Date(now.getTime()+24*60*60*1000).toISOString();
            else if(qpDuration==="endday"){const eod=new Date(now);eod.setHours(23,59,59,999);expiresAt=eod.toISOString()}
            /* "none" → null = no expiry */
            upConfig(d=>{if(!d.notifications)d.notifications=[];d.notifications.push({id:Date.now(),toEmail:to,toName:to==="all"?"الكل":targetUser?.name||to.split("@")[0],msg:qpText.trim(),type:qpType,fromName:me.name,fromEmail:me.email,createdAt:new Date().toISOString().split("T")[0],createdAtTs:new Date().toISOString(),expiresAt,endedAt:null,endedBy:null})});/* V19.53: readBy/dismissedBy moved to userNotifStates */
            setQuickPopup(null);setQpTo("");setQpText("");setQpType("تذكير");setQpDuration("2h");showToast("✓ تم ارسال الاشعار")}} style={{width:"100%",background:"#8B5CF6"}}>📩 ارسال الاشعار</Btn>
        </div>}
      </div>
    </div>})()}
    {/* Mobile AI Chat Popup */}
    {isMob&&aiOpen&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:99997,display:"flex",alignItems:"flex-end",justifyContent:"center",padding:10}} onClick={()=>setAiOpen(false)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,border:"1px solid "+T.brd,boxShadow:"0 8px 40px rgba(0,0,0,0.15)",display:"flex",flexDirection:"column",height:"85vh",width:"100%",maxWidth:420}}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid "+T.brd,display:"flex",justifyContent:"space-between",alignItems:"center",background:"linear-gradient(135deg,#0EA5E910,#8B5CF610)",borderRadius:"16px 16px 0 0"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:20}}>🤖</span><span style={{fontWeight:800,fontSize:FS+1,color:T.text}}>مساعد CLARK</span></div>
          <div style={{display:"flex",gap:4}}>
            {aiMsgs.length>0&&<span onClick={()=>setAiMsgs([])} style={{cursor:"pointer",fontSize:11,padding:"2px 8px",borderRadius:6,background:T.err+"10",color:T.err,fontWeight:600}}>مسح</span>}
            <span onClick={()=>setAiOpen(false)} style={{cursor:"pointer",fontSize:16,color:T.textMut}}>✕</span>
          </div>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:12,display:"flex",flexDirection:"column",gap:8}}>
          {aiMsgs.length===0&&<div>
            {visibleAlerts.length>0&&<div style={{marginBottom:12}}>
              <div style={{fontSize:FS-1,fontWeight:800,color:T.text,marginBottom:8,display:"flex",alignItems:"center",gap:6}}>{"⚡ "+visibleAlerts.length+" تنبيه"}</div>
              {visibleAlerts.map((al,i)=><div key={i} onClick={()=>{setAiInput(al.text);}} style={{display:"flex",gap:8,alignItems:"flex-start",padding:"8px 10px",marginBottom:4,borderRadius:10,background:al.type==="late"?"#FEF2F2":al.type==="ready"?"#F0FDF4":al.type==="overpaid"?"#FFF7ED":al.type==="slow"?"#FFFBEB":"#F8FAFC",border:"1px solid "+(al.type==="late"?"#FECACA":al.type==="ready"?"#BBF7D0":al.type==="overpaid"?"#FED7AA":al.type==="slow"?"#FDE68A":"#E2E8F0"),cursor:"pointer",transition:"all 0.15s"}}>
                <span style={{fontSize:16,flexShrink:0}}>{al.icon}</span>
                <span style={{fontSize:FS-2,color:"#1E293B",fontWeight:600,lineHeight:1.5,flex:1}}>{al.text}</span>{al.wsPhone&&<span onClick={e=>{e.stopPropagation();const lines=(al.details||[]).map(d=>"• موديل *"+d.modelNo+"*: *"+d.qty+"* قطعة — "+d.days+" يوم"+(d.agreed?" (متفق "+d.agreed+" يوم)":"")).join("%0A");const msg="*CLARK — تنبيه تأخير*%0A%0A• الورشة: *"+al.wsName+"*%0A%0A"+lines+"%0A%0A⚠️ *برجاء الاهتمام بالتسليم في أقرب وقت*";openWA("https://wa.me/"+(al.wsPhone.replace(/[^0-9]/g,""))+"?text="+msg,"_blank");dismissAlert(al.key||al.text)}} style={{cursor:"pointer",fontSize:10,color:"#25D366",flexShrink:0,padding:"0 4px",fontWeight:700}}>📱</span>}<span onClick={e=>{e.stopPropagation();dismissAlert(al.key||al.text)}} style={{cursor:"pointer",fontSize:10,color:"#94A3B8",flexShrink:0,padding:"0 2px"}}>✕</span>
              </div>)}
              <div style={{textAlign:"center",margin:"10px 0",fontSize:FS-2,color:T.textMut,letterSpacing:4}}>— — —</div>
            </div>}
            <div style={{textAlign:"center",padding:visibleAlerts.length>0?8:20,color:T.textMut}}>
              {visibleAlerts.length===0&&<div style={{fontSize:32,marginBottom:8}}>🤖</div>}
              <div style={{fontSize:FS-1,fontWeight:600,marginBottom:4}}>اسألني عن أي حاجة</div>
              <div style={{fontSize:FS-2,lineHeight:1.8,whiteSpace:"pre-wrap"}}>{"• موديل 3262 فين؟\n• ملخص الورش\n• كام أوردر متأخر؟"}</div>
            </div>
          </div>}
          {aiMsgs.map((m,i)=><div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-start":"flex-end"}}>
            <div style={{maxWidth:"85%",padding:"8px 12px",borderRadius:m.role==="user"?"12px 12px 4px 12px":"12px 12px 12px 4px",background:m.role==="user"?T.accent:T.bg,color:m.role==="user"?"#fff":T.text,fontSize:FS-1,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{m.text}</div>
          </div>)}
          {aiLoading&&<div style={{display:"flex",justifyContent:"flex-end"}}><div style={{padding:"8px 16px",borderRadius:12,background:T.bg,fontSize:FS-1,color:T.textMut,display:"inline-flex",alignItems:"center",gap:8}}><Spinner size="small" inline/><span>جاري التحليل...</span></div></div>}
        </div>
        <div style={{padding:"8px 12px",borderTop:"1px solid "+T.brd,display:"flex",gap:6}}>
          <input value={aiInput} onChange={e=>setAiInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")askAI()}} placeholder="اسأل عن أي حاجة..." style={{flex:1,padding:"8px 12px",borderRadius:10,border:"1px solid "+T.brd,fontSize:FS,fontFamily:"inherit",background:T.bg,color:T.text,outline:"none",boxSizing:"border-box"}}/>
          <button onClick={askAI} disabled={aiLoading||!aiInput.trim()} style={{padding:"8px 14px",borderRadius:10,border:"none",background:aiInput.trim()?"linear-gradient(135deg,#0EA5E9,#8B5CF6)":"#E2E8F0",color:aiInput.trim()?"#fff":"#94A3B8",cursor:aiInput.trim()?"pointer":"default",fontSize:14,fontWeight:700}}>📩</button>
        </div>
      </div>
    </div>}
    {showScanner==="menu"&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowScanner(false)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:420,maxHeight:"85vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:FS+2,fontWeight:800,color:T.accent}}>📷 مسح QR — اختر العملية</div>
          <Btn ghost small onClick={()=>setShowScanner(false)}>✕</Btn>
        </div>
        {[
          {icon:"📷",label:"مسح ذكي (تلقائي)",desc:"التطبيق يتعرف على النوع تلقائياً",color:T.accent,action:()=>setShowScanner(true)},
          {icon:"📋",label:"فتح أوردر",desc:"اسكان QR → تفاصيل الأوردر",color:T.accent,action:()=>setShowScanner(true)},
          {icon:"↙",label:"استلام من ورشة",desc:"اسكان QR ليبل → شاشة الاستلام",color:"#8B5CF6",action:()=>setShowScanner(true)},
          {icon:"🔍",label:"استعلام موديل",desc:"اسكان أي QR → بيانات الموديل",color:"#F59E0B",action:()=>setShowScanner(true)},
          {icon:"🏭",label:"حساب ورشة",desc:"اسكان QR الورشة → الحساب",color:"#0EA5E9",action:()=>setShowScanner(true)},
        ].map(op=><div key={op.label} onClick={op.action} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:12,cursor:"pointer",border:"1px solid "+op.color+"20",marginBottom:6,transition:"background 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background=op.color+"08"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
          <div style={{width:40,height:40,borderRadius:10,background:op.color+"12",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{op.icon}</div>
          <div><div style={{fontWeight:700,fontSize:FS,color:op.color}}>{op.label}</div><div style={{fontSize:FS-2,color:T.textMut}}>{op.desc}</div></div>
        </div>)}
      </div>
    </div>}
    {showScanner===true&&<QRScanner onClose={()=>setShowScanner(false)} onScan={url=>{setShowScanner(false);try{/* Smart scan — detect type */
      /* V16.50: workshop receipt confirmation flow.
         Format: CLARK:WSRCV:{orderId}:{wsName-encoded}:{wdIdx}
         Opens a popup with order image + delivered breakdown + confirm button. */
      if(url.startsWith("CLARK:WSRCV:")){
        const parts=url.split(":");
        const orderId=parts[2];const wsName=parts[3]?decodeURIComponent(parts[3]):"";const wdIdx=Number(parts[4])||0;
        const o=orders.find(x=>x.id===orderId);
        if(!o){showToast("⚠️ الأوردر غير موجود");return}
        const wd=(o.workshopDeliveries||[])[wdIdx];
        if(!wd||wd.wsName!==wsName){showToast("⚠️ بيانات التسليم غير متطابقة");return}
        const totalDel=Number(wd.qty)||0;
        const totalRcv=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);
        const remaining=Math.max(0,totalDel-totalRcv);
        setWsRcvPopup({order:o,wd,wdIdx,wsName,totalDel,totalRcv,remaining});
        setWsRcvQty(remaining);
        return;
      }
      /* V19.87.0: tracked-piece QR (CLARK:P:p_xxx) → route to Pieces lookup tab.
         Pre-V19.87 the smart scanner silently no-op'd because parts[1]="P"
         doesn't match any orderId. Now we detect the prefix explicitly and
         hand off to PiecesPg with the URL pre-filled (window event mirrors
         the existing __openPkg pattern). */
      if(url.startsWith("CLARK:P:")){
        if(!canViewTab("pieces")){showToast("⚠️ مفيش صلاحية لصفحة تتبع القطع");return}
        setTab("pieces");
        setTimeout(()=>{window.__piecesLookup=url;window.dispatchEvent(new Event("pieces-lookup"))},400);
        showToast("🔍 فتح استعلام القطعة...");
        return;
      }
      if(url.startsWith("CLARK:")){const parts=url.split(":");const orderId=parts[1];const o=orders.find(x=>x.id===orderId);if(o){goD(o.id);showToast("📋 "+o.modelNo);return}}
      try{const j=JSON.parse(url);
        if(j.app==="clark"&&j.type==="pkg"){const pkg=(config.packages||[]).find(p=>p.id===j.id);if(pkg){setTab("custDeliver");setTimeout(()=>{window.__openPkg=j.id;window.dispatchEvent(new Event("open-pkg"))},500);showToast("📦 "+j.num);return}}
        if(j.app==="clark"&&j.type==="prod"){const prod=(config.generalProducts||[]).find(p=>p.id===j.id);if(prod){setTab("warehouse");setTimeout(()=>{window.__openProd=j.id;window.dispatchEvent(new Event("open-prod"))},500);showToast("➕ "+prod.name);return}else{showToast("⚠️ المنتج غير موجود");return}}
      }catch(e2){}
      const u=new URL(url);const p=new URLSearchParams(u.search);if(p.get("o")){const o=orders.find(x=>x.modelNo===p.get("o"));if(o)goD(o.id)}else if(p.get("act")==="rcv"&&p.get("oid")){setTab("external");setTimeout(()=>{window.__qrReceive={oid:p.get("oid"),wdi:Number(p.get("wdi"))||0};window.dispatchEvent(new Event("qr-receive"))},600)}else if(p.get("act")==="stock"&&p.get("oid")){const o=orders.find(x=>x.id===p.get("oid"));if(o){goD(o.id);setTimeout(()=>{window.__qrStock=true;window.dispatchEvent(new Event("qr-stock"))},800)}}else if(p.get("act")==="wsacc"&&p.get("ws")){setTab("external");setTimeout(()=>{window.__qrWsAcc={ws:decodeURIComponent(p.get("ws"))};window.dispatchEvent(new Event("qr-wsacc"))},600)}else{showToast("QR غير معروف")}}catch(e){if(url.startsWith("CLARK:")){const parts=url.split(":");const orderId=parts[1];const o=orders.find(x=>x.id===orderId);if(o){goD(o.id);return}}showToast("QR غير صالح")}}}/>}
    {cardPopup&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setCardPopup(null)}><div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:isMob?500:650,maxHeight:"80vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><div style={{fontSize:FS+2,fontWeight:800,color:cardPopup.color}}>{cardPopup.title}</div><Btn ghost small onClick={()=>setCardPopup(null)} title="إغلاق">✕</Btn></div><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><th style={TH}>البيان</th>{cardPopup.details?.[0]?.desc!==undefined&&<th style={TH}>الوصف</th>}<th style={TH}>الكمية</th></tr></thead><tbody>{(cardPopup.details||[]).map((d,i)=><tr key={i} style={{background:i%2===0?"transparent":T.bg+"80"}}><td style={{...TD,fontWeight:700,color:cardPopup.color}}>{d.model}</td>{d.desc!==undefined&&<td style={TD}>{d.desc}</td>}<td style={{...TD,textAlign:"center",fontWeight:800}}>{fmt(d.qty)}</td></tr>)}<tr style={{background:cardPopup.color+"10"}}><td style={{...TD,fontWeight:800}} colSpan={cardPopup.details?.[0]?.desc!==undefined?2:1}>الاجمالي</td><td style={{...TD,textAlign:"center",fontWeight:800,fontSize:FS+2,color:cardPopup.color}}>{fmt((cardPopup.details||[]).reduce((s,d)=>s+(Number(d.qty)||0),0))}</td></tr></tbody></table></div></div>}
    {/* V16.50: Workshop self-confirm popup — invoked when scanning the QR
        on a printed تسليم ورشة receipt. Shows the model image, delivered
        details, current balance, and a "تأكيد الاستلام" button. The qty
        defaults to the remaining (so the workshop just has to hit confirm
        for the common "received in full" case), but can be edited for partials. */}
    {wsRcvPopup&&(()=>{
      const{order,wd,wdIdx,wsName,totalDel,totalRcv,remaining}=wsRcvPopup;
      const t=calcOrder(order);
      const close=()=>{setWsRcvPopup(null);setWsRcvQty(0)};
      const confirm=async()=>{
        const q=Math.max(0,Math.min(remaining,Number(wsRcvQty)||0));
        if(q<=0){showToast("⚠️ ادخل كمية أكبر من صفر");return}
        try{
          const today=new Date().toISOString().split("T")[0];
          await updOrder(order.id,o=>{
            if(!o.workshopDeliveries||!o.workshopDeliveries[wdIdx])return;
            if(!o.workshopDeliveries[wdIdx].receives)o.workshopDeliveries[wdIdx].receives=[];
            o.workshopDeliveries[wdIdx].receives.push({date:today,qty:q,confirmedByQR:true,by:userName||""});
          });
          showToast("✅ تم تأكيد استلام "+q+" قطعة");
          close();
        }catch(e){
          showToast("⚠️ فشل الحفظ — حاول مرة أخرى");
        }
      };
      const piece=wd.garmentType||"عام";
      /* Color/qty breakdown for this piece (from fabric color allocations) */
      const fabRows=[];
      ["A","B","C","D","E","F"].forEach(k=>{
        const fab=order["fabric"+k];if(!fab)return;
        const fp=order["fabricPieces"+k]||[];
        if(piece!=="عام"&&fp.length>0&&!fp.includes(piece))return;
        const colors=order["fabricColors"+k]||[];
        colors.forEach(c=>{
          const ly=Number(c.layers)||0;const pp=Number(c.pcsPerLayer)||0;const q=ly*pp;
          if(q>0)fabRows.push({color:c.color||"-",qty:q});
        });
      });
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:isMob?8:16}} onClick={close}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,width:"100%",maxWidth:480,maxHeight:"95vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.4)"}}>
          {/* Header */}
          <div style={{padding:"14px 16px",borderBottom:"1px solid "+T.brd,display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,background:T.cardSolid,zIndex:1}}>
            <div style={{fontSize:FS+1,fontWeight:800,color:"#8B5CF6"}}>📱 تأكيد استلام من الورشة</div>
            <Btn ghost small onClick={close}>✕</Btn>
          </div>
          {/* Body */}
          <div style={{padding:16,display:"flex",flexDirection:"column",gap:12}}>
            {/* Model header — image + main info */}
            <div style={{display:"flex",gap:12,padding:12,borderRadius:10,background:T.bg,border:"1px solid "+T.brd}}>
              {order.image?<img src={order.image} alt="" style={{width:80,height:106,borderRadius:8,objectFit:"cover",flexShrink:0,border:"1px solid "+T.brd}}/>:<div style={{width:80,height:106,borderRadius:8,background:T.cardSolid,display:"flex",alignItems:"center",justifyContent:"center",fontSize:30,color:T.textMut,flexShrink:0}}>📷</div>}
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:FS+2,fontWeight:900,color:T.text,marginBottom:2}}>{order.modelNo}</div>
                <div style={{fontSize:FS-1,color:T.textSec,marginBottom:6,lineHeight:1.3}}>{order.modelDesc}</div>
                <div style={{fontSize:FS-2,color:T.textMut,display:"flex",flexDirection:"column",gap:2}}>
                  <span>📐 {order.sizeLabel||"—"}</span>
                  <span style={{color:"#8B5CF6",fontWeight:700}}>🏭 {wsName}</span>
                  <span style={{color:"#0284C7",fontWeight:700}}>👕 {piece}</span>
                </div>
              </div>
            </div>
            {/* Color breakdown */}
            {fabRows.length>0&&<div style={{padding:10,borderRadius:10,background:T.bg,border:"1px solid "+T.brd}}>
              <div style={{fontSize:FS-2,fontWeight:700,color:T.textSec,marginBottom:6}}>🎨 توزيع الألوان</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                {fabRows.map((r,i)=><span key={i} style={{padding:"3px 9px",borderRadius:6,background:T.cardSolid,border:"1px solid "+T.brd,fontSize:FS-2,fontWeight:700}}>{r.color}: <b style={{color:"#0284C7"}}>{r.qty}</b></span>)}
              </div>
            </div>}
            {/* Delivery summary — 3 numbers stacked */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
              <div style={{padding:"10px 6px",textAlign:"center",borderRadius:8,background:"#0284C715",border:"1px solid #0284C730"}}>
                <div style={{fontSize:FS-3,color:T.textSec,fontWeight:700,marginBottom:2}}>تسليم</div>
                <div style={{fontSize:FS+4,fontWeight:900,color:"#0284C7",fontVariantNumeric:"tabular-nums"}}>{totalDel}</div>
              </div>
              <div style={{padding:"10px 6px",textAlign:"center",borderRadius:8,background:T.ok+"15",border:"1px solid "+T.ok+"30"}}>
                <div style={{fontSize:FS-3,color:T.textSec,fontWeight:700,marginBottom:2}}>مستلم</div>
                <div style={{fontSize:FS+4,fontWeight:900,color:T.ok,fontVariantNumeric:"tabular-nums"}}>{totalRcv}</div>
              </div>
              <div style={{padding:"10px 6px",textAlign:"center",borderRadius:8,background:(remaining>0?T.warn:T.ok)+"15",border:"1px solid "+(remaining>0?T.warn:T.ok)+"30"}}>
                <div style={{fontSize:FS-3,color:T.textSec,fontWeight:700,marginBottom:2}}>متبقي</div>
                <div style={{fontSize:FS+4,fontWeight:900,color:remaining>0?T.warn:T.ok,fontVariantNumeric:"tabular-nums"}}>{remaining}</div>
              </div>
            </div>
            {/* Confirm input */}
            {remaining>0?<div style={{padding:14,borderRadius:10,background:T.ok+"08",border:"2px solid "+T.ok+"40"}}>
              <label style={{fontSize:FS,fontWeight:800,color:T.text,display:"block",textAlign:"center",marginBottom:8}}>كمية الاستلام</label>
              <input type="number" value={wsRcvQty} onChange={e=>setWsRcvQty(Math.max(0,Math.min(remaining,Number(e.target.value)||0)))} min="0" max={remaining} style={{display:"block",margin:"0 auto",width:140,textAlign:"center",fontSize:32,fontWeight:900,border:"3px solid "+T.ok,borderRadius:10,padding:"8px",fontFamily:"inherit",background:T.cardSolid,color:T.ok}}/>
              <div style={{textAlign:"center",fontSize:FS-3,color:T.textMut,marginTop:6}}>(الحد الأقصى: {remaining})</div>
            </div>:<div style={{padding:12,borderRadius:10,background:T.ok+"15",border:"1px solid "+T.ok+"40",textAlign:"center",fontSize:FS,fontWeight:800,color:T.ok}}>
              ✓ تم استلام كل الكمية بالكامل
            </div>}
            {/* Action buttons */}
            <div style={{display:"flex",gap:8,marginTop:4}}>
              <Btn ghost onClick={close} style={{flex:1}}>إلغاء</Btn>
              {remaining>0&&<Btn onClick={confirm} disabled={!wsRcvQty||wsRcvQty<=0} style={{flex:2,background:T.ok,color:"#fff",border:"none",fontWeight:800,fontSize:FS+1,padding:"12px"}}>✅ تأكيد الاستلام</Btn>}
            </div>
          </div>
        </div>
      </div>;
    })()}
    {/* V16.50: Workshop delivery-confirmation popup — shown when a workshop scans
        the QR on a delivery receipt. Shows the model image (compressed), pieces
        delivered, and a single button to acknowledge receipt. The confirmation
        adds an entry to the workshopDelivery's receives[] array, which is what
        the rest of the system already reads to compute workshop balances.
        V16.51: race-safe — re-reads the live order at confirm time so concurrent
        admin edits aren't overwritten by a stale snapshot. */}
    {wsDelPopup&&(()=>{
      const ord=wsDelPopup.order;
      const wd=wsDelPopup.wd;
      const idx=wsDelPopup.wdIdx;
      /* Compute current ws balance from the LIVE order in state (not the snapshot)
         so the displayed balance reflects any changes that landed after the scan. */
      const liveOrd=orders.find(x=>x.id===ord.id)||ord;
      const liveWd=(liveOrd.workshopDeliveries||[])[idx]||wd;
      const wsName=liveWd.wsName||wd.wsName||"";
      const sameWsDeliveries=(liveOrd.workshopDeliveries||[]).filter(x=>x.wsName===wsName);
      const totalDel=sameWsDeliveries.reduce((s,x)=>s+(Number(x.qty)||0),0);
      const totalRcv=sameWsDeliveries.reduce((s,x)=>s+(x.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0),0);
      const wsBal=totalDel-totalRcv;
      const alreadyConfirmed=(liveWd.receives||[]).some(r=>r.viaQR);
      /* Sanity check: the snapshot delivery should still match the live one.
         If admins deleted/replaced this delivery, refuse to confirm. */
      const deliveryStillExists=!!liveWd&&liveWd.wsName===wd.wsName&&Number(liveWd.qty)===Number(wd.qty)&&liveWd.date===wd.date;
      const close=()=>setWsDelPopup(null);
      const confirmReceive=async()=>{
        if(!deliveryStillExists){
          tell("التسليم غير موجود","هذا التسليم لم يعد موجوداً أو تم تعديله بواسطة الإدارة. أعد مسح ليبل التسليم الجديد.",{danger:true});
          setWsDelPopup(null);
          return;
        }
        if(alreadyConfirmed){
          showToast("سبق تأكيده");
          setWsDelPopup(null);
          return;
        }
        const today=new Date().toISOString().split("T")[0];
        /* Build the new order from the LIVE order, not the snapshot.
           This preserves any concurrent admin edits (other deliveries, status changes, etc.). */
        const newOrd=JSON.parse(JSON.stringify(liveOrd));
        if(!Array.isArray(newOrd.workshopDeliveries))newOrd.workshopDeliveries=[];
        const targetWd=newOrd.workshopDeliveries[idx];
        if(!targetWd){tell("التسليم غير موجود","",{danger:true});setWsDelPopup(null);return}
        if(!Array.isArray(targetWd.receives))targetWd.receives=[];
        /* Re-check that this exact delivery hasn't been QR-confirmed since the popup opened */
        if(targetWd.receives.some(r=>r.viaQR)){
          showToast("سبق تأكيده");
          setWsDelPopup(null);
          return;
        }
        targetWd.receives.push({
          date:today,
          qty:Number(targetWd.qty)||0,/* use the LIVE qty, not the snapshot */
          /* V16.51: full standard receive shape — same fields ExtProdPg/DetPg
             create when receives are added manually. Without these, the QR
             receives wouldn't show up in financial calculations
             (wsAccounts.due uses r.qty * r.price). */
          notes:"تأكيد QR من الورشة",
          price:Number(targetWd.price)||0,
          amount:r2((Number(targetWd.qty)||0)*(Number(targetWd.price)||0)),
          quality:"استلام QR",
          createdBy:wsName||"ورشة (QR)",
          confirmedBy:wsName||"ورشة (QR)",
          viaQR:true,
          createdAt:new Date().toISOString()
        });
        try{
          await replaceOrder(ord.id,newOrd);
          showToast("✓ تم تأكيد الاستلام بواسطة الورشة");
          setWsDelPopup(null);
        }catch(e){
          tell("فشل الحفظ",e?.message||String(e),{danger:true});
        }
      };
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:99999,display:"flex",alignItems:"flex-end",justifyContent:"center",padding:0}} onClick={close}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:"20px 20px 0 0",width:"100%",maxWidth:520,padding:"20px 18px 24px",border:"1px solid "+T.brd,maxHeight:"95vh",overflowY:"auto"}}>
          {/* Drag handle */}
          <div style={{width:48,height:5,borderRadius:3,background:T.brd,margin:"0 auto 14px"}}/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:FS+3,fontWeight:900,color:T.accent}}>📥 تأكيد استلام الورشة</div>
            <Btn ghost small onClick={close}>✕</Btn>
          </div>
          {/* Compressed image — small for mobile bandwidth */}
          {liveOrd.image&&<div style={{display:"flex",justifyContent:"center",marginBottom:12}}>
            <img src={liveOrd.image} alt={liveOrd.modelNo} style={{width:120,height:160,objectFit:"cover",borderRadius:12,border:"1px solid "+T.brd,boxShadow:T.shadow}}/>
          </div>}
          {/* Order header */}
          <div style={{textAlign:"center",marginBottom:14}}>
            <div style={{fontSize:FS+5,fontWeight:900,color:T.text,letterSpacing:0.3}}>{liveOrd.modelNo}</div>
            <div style={{fontSize:FS-1,color:T.textSec,marginTop:2}}>{liveOrd.modelDesc}</div>
          </div>
          {/* Delivery details — from LIVE data */}
          <div style={{padding:14,borderRadius:12,background:T.accent+"08",border:"1px solid "+T.accent+"25",marginBottom:12}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div><div style={{fontSize:FS-3,color:T.textMut,fontWeight:700}}>الورشة</div><div style={{fontSize:FS,fontWeight:800,color:T.text}}>🏭 {wsName}</div></div>
              <div><div style={{fontSize:FS-3,color:T.textMut,fontWeight:700}}>القطعة</div><div style={{fontSize:FS,fontWeight:800,color:T.text}}>{liveWd.garmentType||"عام"}</div></div>
              <div><div style={{fontSize:FS-3,color:T.textMut,fontWeight:700}}>تاريخ التسليم</div><div style={{fontSize:FS,fontWeight:700,color:T.text}}>📅 {liveWd.date||"—"}</div></div>
              <div><div style={{fontSize:FS-3,color:T.textMut,fontWeight:700}}>الكمية</div><div style={{fontSize:FS+4,fontWeight:900,color:T.accent,fontVariantNumeric:"tabular-nums"}}>{liveWd.qty} قطعة</div></div>
            </div>
            {liveOrd.sizeLabel&&<div style={{marginTop:10,paddingTop:10,borderTop:"1px solid "+T.brd}}>
              <span style={{fontSize:FS-2,color:T.textMut}}>المقاسات: </span>
              <span style={{fontSize:FS-1,fontWeight:700,color:T.text}}>{liveOrd.sizeLabel}</span>
            </div>}
          </div>
          {/* Workshop balance */}
          <div style={{padding:12,borderRadius:10,background:wsBal>0?T.warn+"10":T.ok+"10",border:"1px solid "+(wsBal>0?T.warn:T.ok)+"30",marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:FS-1,color:T.textSec,fontWeight:700}}>رصيدك الحالي عند هذا الموديل:</span>
            <span style={{fontSize:FS+3,fontWeight:900,color:wsBal>0?T.warn:T.ok,fontVariantNumeric:"tabular-nums"}}>{wsBal} قطعة</span>
          </div>
          {!deliveryStillExists?<div style={{padding:12,borderRadius:10,background:T.err+"15",color:T.err,fontWeight:800,textAlign:"center",fontSize:FS-1,lineHeight:1.7}}>
            ⚠️ هذا التسليم لم يعد موجوداً أو تم تعديله من الإدارة. أعد مسح الليبل الحالي.
          </div>:alreadyConfirmed?<div style={{padding:12,borderRadius:10,background:T.ok+"15",color:T.ok,fontWeight:800,textAlign:"center",fontSize:FS}}>
            ✓ تم تأكيد استلام هذه الكمية مسبقاً عبر QR
          </div>:<Btn primary onClick={confirmReceive} style={{background:T.ok,color:"#fff",border:"none",fontWeight:900,fontSize:FS+2,padding:"14px 0",width:"100%",borderRadius:12}}>
            ✅ تأكيد استلام {liveWd.qty} قطعة
          </Btn>}
          <div style={{fontSize:FS-3,color:T.textMut,textAlign:"center",marginTop:10,lineHeight:1.6}}>
            بالضغط على "تأكيد"، يتم تسجيل الاستلام في النظام مباشرة وتحديث رصيدك عند الإدارة.
          </div>
        </div>
      </div>;
    })()}
    {labelPopup&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>{setLabelPopup(null);setLabelBags(1)}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:320,border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)",textAlign:"center"}}>
        <div style={{fontSize:18,fontWeight:800,color:T.text,marginBottom:4}}>{"🏷️ "+labelPopup.arrow+" "+labelPopup.title}</div>
        <div style={{fontSize:FS,color:T.textSec,marginBottom:16}}>{labelPopup.modelNo+" — "+labelPopup.piece+" — "+labelPopup.qty+" قطعة"}</div>
        <div style={{marginBottom:12}}><label style={{fontSize:FS,fontWeight:700,color:T.text}}>عدد الأكياس</label><input type="number" value={labelBags} onChange={e=>setLabelBags(Math.max(1,Number(e.target.value)||1))} min="1" style={{display:"block",margin:"8px auto",width:100,textAlign:"center",fontSize:22,fontWeight:800,border:"3px solid "+T.accent,borderRadius:10,padding:"6px",fontFamily:"Cairo",background:T.bg,color:T.text}}/></div>
        <div style={{display:"flex",gap:8,justifyContent:"center"}}>
          <Btn ghost onClick={()=>{setLabelPopup(null);setLabelBags(1)}}>✕ إغلاق</Btn>
          <Btn onClick={async()=>{
            /* V16.73: Workshop QR now points at the PUBLIC WorkshopConfirmPage
               (no login needed), so the URL must carry an HMAC signature. We
               fetch that signature from /api/workshop-delivery-sign before
               handing the data to renderLabelPages. Same popup-blocker workaround
               as the customer flow: open the print window SYNCHRONOUSLY here,
               show a loading placeholder, then write the real label after the
               fetch completes.

               Backwards-compat: if signing fails (network down, /api endpoint
               not deployed yet, missing wsId for legacy data) we fall back to
               the old `?act=wsdel&...` URL which still works inside the app
               for logged-in users. So a failed sign just costs the workshop
               the convenience of a no-login flow — it doesn't break printing. */
            const lp=labelPopup;const bagsAtClick=labelBags;
            setLabelPopup(null);setLabelBags(1);
            const pw=openPrintWindow();
            if(!pw){tell("المتصفح يمنع الطباعة","فعّل النوافذ المنبثقة",{danger:true});return}
            try{
              pw.document.write("<!DOCTYPE html><html dir='rtl'><head><meta charset='utf-8'/><title>جاري التحضير…</title><style>body{font-family:Cairo,Arial,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8fafc;color:#475569}.box{text-align:center}.sp{display:inline-block;width:36px;height:36px;border:4px solid #E2E8F0;border-top-color:#0EA5E9;border-radius:50%;animation:s 0.8s linear infinite;margin-bottom:12px}@keyframes s{to{transform:rotate(360deg)}}</style></head><body><div class='box'><div class='sp'></div><div style='font-size:14px;font-weight:700'>جاري تحضير ليبل التسليم…</div></div></body></html>");
            }catch(e){}
            const origin=(typeof window!=="undefined"&&window.location)?window.location.origin:"";
            let confirmUrl="";
            const haveTrio=lp.orderId&&lp.wsId&&lp.deliveryIdx>=0;
            if(haveTrio){
              /* Try to mint a public signed URL (V16.73). Fall back to the
                 legacy in-app URL on any error so the print itself never blocks. */
              let sig="",signErr="";
              try{
                const _u=auth.currentUser;
                if(!_u){signErr="not logged in";throw new Error(signErr)}
                const _tok=await _u.getIdToken();
                const r=await fetch("/api/workshop-delivery-sign",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+_tok},body:JSON.stringify({triples:[{orderId:lp.orderId,wsId:lp.wsId,deliveryIdx:lp.deliveryIdx}]})});
                const j=await r.json();
                if(r.ok&&j.signatures&&j.signatures[0])sig=j.signatures[0].sig||"";
                else signErr=(j&&j.error)?j.error:"HTTP "+r.status;
              }catch(e){signErr=signErr||("Network: "+(e.message||e))}
              if(sig){
                confirmUrl=origin+"/?wd=1&ord="+encodeURIComponent(lp.orderId)+"&ws="+encodeURIComponent(lp.wsId)+"&idx="+lp.deliveryIdx+"&sig="+encodeURIComponent(sig);
              }else{
                console.warn("[CLARK] workshop-delivery-sign failed, using legacy URL:",signErr);
                confirmUrl=origin+"/?act=wsdel&ord="+encodeURIComponent(lp.orderId)+"&ws="+encodeURIComponent(lp.wsId)+"&idx="+lp.deliveryIdx;
              }
            }
            renderLabelPages(lp,bagsAtClick,data?.printSettings,CLARK_LOGO_PRINT,confirmUrl,pw)
          }} style={{background:T.accent,color:"#fff",border:"none",fontWeight:700}}>{"🖨 طباعة "+labelBags}</Btn>
        </div>
      </div>
    </div>}
    {wsAccPopup&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setWsAccPopup(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:isMob?420:550,maxHeight:"80vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:FS+1,fontWeight:800,color:wsAccPopup.color}}>{wsAccPopup.title}</div>
          <div style={{display:"flex",gap:4}}>
            <Btn small onClick={()=>{const el=document.getElementById("ws-acc-popup-tbl");if(el)printPage(wsAccPopup.title,el.innerHTML)}} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨</Btn>
            <Btn ghost small onClick={()=>setWsAccPopup(null)} title="إغلاق">✕</Btn>
          </div>
        </div>
        <div id="ws-acc-popup-tbl"><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><th style={TH}>#</th><th style={TH}>الورشة</th><th style={TH}>المبلغ</th></tr></thead><tbody>
          {(wsAccPopup.items||[]).map((d,i)=><tr key={i} style={{background:i%2===0?"transparent":T.bg+"80"}}><td style={TD}>{i+1}</td><td style={{...TD,fontWeight:700}}>{d.name}</td><td style={{...TD,textAlign:"center",fontWeight:800,color:d.qty>=0?wsAccPopup.color:T.ok}}>{fmt(d.qty)+" ج.م"}</td></tr>)}
          <tr style={{background:wsAccPopup.color+"10"}}><td style={TD}></td><td style={{...TD,fontWeight:800}}>الاجمالي</td><td style={{...TD,textAlign:"center",fontWeight:800,fontSize:FS+2,color:wsAccPopup.color}}>{fmt(wsAccPopup.total)+" ج.م"}</td></tr>
        </tbody></table></div>
      </div>
    </div>}
    {/* Barcode Print Popup */}
    {barcodePopup&&(()=>{const allOrders=data.orders||[];const ps=data.printSettings||{};const lw=ps.labelWidth||40;const lh=ps.labelHeight||50;const mg=ps.margins||2;const fl=ps.fields||{};
      /* V16.49: honor showLogo + fontFamily from printSettings (same source as the live preview).
         When showLogo is on, the CLARK logo image replaces the "CLARK" text band.
         The font URL is inlined into the print HTML below. */
      const showLogoFlag=!!ps.showLogo;
      const fontFam=ps.fontFamily||"Cairo";
      const _GOOGLE_FONT_URLS_PG={
        Cairo:"https://fonts.googleapis.com/css2?family=Cairo:wght@600;700;800;900&display=swap",
        Tajawal:"https://fonts.googleapis.com/css2?family=Tajawal:wght@500;700;800;900&display=swap",
        Almarai:"https://fonts.googleapis.com/css2?family=Almarai:wght@700;800&display=swap",
        "Noto Sans Arabic":"https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@600;700;800;900&display=swap",
        "IBM Plex Sans Arabic":"https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@500;600;700&display=swap",
        Amiri:"https://fonts.googleapis.com/css2?family=Amiri:wght@700&display=swap",
        Lalezar:"https://fonts.googleapis.com/css2?family=Lalezar&display=swap"
      };
      const fontUrl=_GOOGLE_FONT_URLS_PG[fontFam]||_GOOGLE_FONT_URLS_PG.Cairo;
      const selOrder=allOrders.find(o=>o.id===barcodePopup.modelId);const rs=selOrder?Number(selOrder.rackSize)||1:1;
      /* V15.30: Use getSizesFromSet — pcsPerSeries from sizeSets is the SOURCE OF TRUTH for size count */
      const sizeInfo=selOrder?getSizesFromSet(selOrder,data):{sizes:[],expectedCount:0,mismatch:false};
      const sizes=sizeInfo.sizes;
      const sizeMismatch=sizeInfo.mismatch;
      const qtyPerSize=sizes.length>0?Math.floor((selOrder?.cutQty||0)/sizes.length):(selOrder?.cutQty||0);
      const labelsPerSize=rs>0?Math.floor(qtyPerSize/rs):qtyPerSize;
      const totalLabels=sizes.length>0?labelsPerSize*sizes.length:(rs>0?Math.floor((selOrder?.cutQty||0)/rs):(selOrder?.cutQty||0));
      const mode=barcodePopup._mode||"manual";
      const qrMM=Math.min(lw-mg*2,lh-mg*2)-8;
      /* V19.55: درجة تانية (QC-2) toggle — applies to ALL tabs.
         When on, the QR is shrunk to ~80% to make room for a small "QC-2"
         box stamped underneath, signalling the printed label is for second-grade
         output. The QR data itself doesn't change — the warehouse QR scanner
         keeps working as normal. */
      const secondGrade=!!barcodePopup._secondGrade;
      /* V19.85.0: tracking restored as opt-in. Default OFF — the user must
         tick the checkbox to switch from the legacy CLARK:orderId:qty format
         to the per-piece CLARK:P:<id> format. (V19.84.1 had removed the
         checkbox entirely; V19.85.0 restores it but flips the default per
         user request: "احتفظ بالاوبشن بس لما المستخدم يحب يشغله".) */
      const trackPieces = !!barcodePopup._trackPieces;
      const qrMMEffective=secondGrade?Math.round(qrMM*0.8):qrMM;
      /* V19.70.26: QC-2 box larger and more legible. Was ≈18% of QR (too small to read
         on a typical 30-40mm QR), now ≈26% giving more headroom for the bigger text.
         The box's vertical padding (0.4mm) is unchanged so the box itself doesn't
         dominate; only the inner font + height grow proportionally. */
      const qcStampMM=Math.max(4,Math.round(qrMM*0.26));/* QC-2 box height ≈26% of QR */
      const buildLabel=(qrText,modelNo,desc,sizeStr,seriesStr)=>{let h="<div class='lbl'>";
        /* V16.49: logo overrides brand-text when enabled. brightness(0) forces pure black for thermal print. */
        if(showLogoFlag)h+="<img src='"+CLARK_LOGO_PRINT+"' alt='CLARK' style='width:75%;max-width:30mm;height:auto;max-height:7mm;object-fit:contain;filter:brightness(0) saturate(100%);margin-bottom:0.5mm;display:block;margin-left:auto;margin-right:auto'/>";
        else if(fl.brand?.show)h+="<div style='font-weight:900;font-size:"+((fl.brand?.size||14)/2.5)+"mm;letter-spacing:2px;line-height:1'>CLARK</div>";
        if(fl.modelNo?.show!==false)h+="<div style='font-weight:800;font-size:"+((fl.modelNo?.size||12)/2.5)+"mm;line-height:1.1'>"+modelNo+"</div>";
        if(fl.desc?.show)h+="<div style='font-size:"+((fl.desc?.size||10)/2.5)+"mm;color:#444;line-height:1'>"+desc+"</div>";
        /* V16.49: if size field is enabled and no specific size string came in (e.g. piece mode without size pick),
           fall back to the order's overall sizeLabel so the toggle does what users expect. */
        const sizeOut=sizeStr||(fl.sizeLabel?.show!==false&&selOrder?.sizeLabel?"مقاس: "+selOrder.sizeLabel:"");
        if(fl.sizeLabel?.show!==false&&sizeOut)h+="<div style='font-weight:700;font-size:"+((fl.sizeLabel?.size||10)/2.5)+"mm;line-height:1'>"+sizeOut+"</div>";
        if(fl.qr?.show!==false){
          /* V19.55: QR + optional QC-2 stamp stacked vertically. */
          h+="<div style='flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.8mm'>";
          h+="<img class='qr-img' data-text='"+qrText+"' style='width:"+qrMMEffective+"mm;height:"+qrMMEffective+"mm'/>";
          if(secondGrade){
            /* V19.70.26: bigger inner font (0.7 of box height) + slightly more
               horizontal padding so 'QC-2' has breathing room.
               Box height comes from qcStampMM (~26% of QR vs old 18%). */
            h+="<div style='border:1.8px solid #000;padding:0.6mm "+(qcStampMM*0.7)+"mm;font-weight:900;font-size:"+(qcStampMM*0.7)+"mm;line-height:1;letter-spacing:1.5px;border-radius:1.2mm'>QC-2</div>";
          }
          h+="</div>";
        }
        if(fl.series?.show!==false&&seriesStr)h+="<div style='font-weight:700;font-size:"+((fl.series?.size||12)/2.5)+"mm;line-height:1'>"+seriesStr+"</div>";
        if(fl.price?.show&&selOrder?.sellPrice)h+="<div style='font-size:"+((fl.price?.size||10)/2.5)+"mm;line-height:1'>"+selOrder.sellPrice+" ج.م</div>";
        return h+"</div>"};
      /* V19.81.0: helper that builds N labels, generates a unique pieceId for
         each (when tracking is on), writes the piece docs to Firestore in a
         single batch, then returns the label HTML strings ready for doPrint.
         Each `spec` entry describes ONE physical label (one row, one piece).

         Spec shape:
           { count, type, modelNo, modelDesc, size, seriesQty,
             sizeStr, seriesStr, legacyQrText }
         Where legacyQrText is the un-tracked QR string used when the toggle
         is off (preserves backward compat with existing warehouse scanners). */
      const buildLabelsAndTrack = async (specs) => {
        const labels = [];
        const pieceSpecs = [];
        const userName = user?.displayName || (user?.email||"").split("@")[0] || "";
        for (const sp of specs) {
          for (let i = 0; i < (sp.count || 0); i++) {
            let qrText;
            if (trackPieces) {
              const pieceId = genPieceId();
              pieceSpecs.push({
                pieceId,
                type: sp.type || "piece",
                modelNo: sp.modelNo || "",
                modelDesc: sp.modelDesc || "",
                size: sp.size || null,
                seriesQty: sp.seriesQty || null,
                orderId: selOrder?.id || null,
                isSecondGrade: !!secondGrade,
                by: userName,
              });
              qrText = buildTrackedQr(pieceId);
            } else {
              qrText = sp.legacyQrText;
            }
            labels.push(buildLabel(qrText, sp.modelNo, sp.modelDesc || "", sp.sizeStr || "", sp.seriesStr || ""));
          }
        }
        if (trackPieces && pieceSpecs.length > 0) {
          if (typeof setSavingOverlay === "function") {
            setSavingOverlay({ message: "جاري تسجيل " + pieceSpecs.length + " قطعة في النظام...", progress: 30 });
          }
          try {
            await createPiecesBulk(pieceSpecs, {
              onProgress: (done, total) => {
                if (typeof setSavingOverlay === "function") {
                  const pct = 30 + Math.round((done / Math.max(1, total)) * 60);
                  setSavingOverlay({ message: "تسجيل القطع... " + done + "/" + total, progress: pct });
                }
              },
            });
          } catch (e) {
            if (typeof setSavingOverlay === "function") setSavingOverlay(null);
            throw new Error("فشل تسجيل القطع — " + (e?.message || e));
          }
          if (typeof setSavingOverlay === "function") {
            setSavingOverlay({ message: "✅ تم — جاري الطباعة...", progress: 100 });
            setTimeout(() => setSavingOverlay(null), 600);
          }
        }
        return labels;
      };
      const doPrint=(labels)=>{if(labels.length===0)return;
        const qrOpts=JSON.stringify({width:400,margin:ps.qrMargin??1,errorCorrectionLevel:ps.qrLevel||"M",color:{dark:ps.qrColor||"#000000",light:"#ffffff"}});
        const w=openPrintWindow();if(!w){tell("المتصفح يمنع الطباعة","فعّل النوافذ المنبثقة",{danger:true});return}
        /* V16.49: chosen font is loaded as a stylesheet and applied to body */
        w.document.write("<html dir='rtl'><head><title>QR</title><script src='https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js'></"+"script><link href='"+fontUrl+"' rel='stylesheet'/><style>@page{size:"+lw+"mm "+lh+"mm;margin:"+mg+"mm}*{margin:0;padding:0}body{margin:0;padding:0;font-family:'"+fontFam+"',Arial,sans-serif}.lbl{width:"+(lw-mg*2)+"mm;height:"+(lh-mg*2)+"mm;page-break-after:always;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;overflow:hidden"+(ps.showBorder?";border:1px dashed #999":"")+"}</style></head><body>"+labels.join("")+"<script>var qrOpts="+qrOpts+";document.querySelectorAll('.qr-img').forEach(function(img){QRCode.toDataURL(img.dataset.text,qrOpts).then(function(url){img.src=url}).catch(function(){})});setTimeout(function(){window.print()},800)</"+"script></body></html>");w.document.close();
        showToast("✓ تم تجهيز "+labels.length+" ليبل")};
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setBarcodePopup(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:450,minHeight:"60vh",maxHeight:"95vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:FS+2,fontWeight:800,color:"#F59E0B"}}>🏷️ طباعة QR</div>
            <Btn ghost small onClick={()=>setBarcodePopup(null)}>✕</Btn>
          </div>
          <div style={{marginBottom:10}}><label style={{fontSize:FS-2,color:T.textSec}}>اختر الموديل</label><SearchSel value={barcodePopup.modelId||""} onChange={v=>setBarcodePopup(p=>({...p,modelId:v,_size:"",_qty:1}))} options={allOrders.map(o=>({value:o.id,label:o.modelNo+" — "+(o.modelDesc||"")}))} placeholder="اختر الموديل..."/></div>
          {selOrder&&<div style={{textAlign:"center",padding:8,background:T.bg+"60",borderRadius:10,marginBottom:10}}>
            <div style={{fontWeight:800,fontSize:FS+1,color:T.accent}}>{selOrder.modelNo}</div>
            <div style={{fontSize:FS-1,color:T.textMut}}>{selOrder.modelDesc}</div>
            <div style={{fontSize:FS-2,color:T.textSec,marginTop:2}}>{"القص: "+(selOrder.cutQty||0)+" | المقاسات: "+(sizes.join(" | ")||"—")+" | سيري: "+rs}</div>
            {sizeMismatch&&<div style={{marginTop:8,padding:"6px 10px",background:"#F59E0B15",border:"1px solid #F59E0B40",borderRadius:8,fontSize:FS-2,color:"#B45309",fontWeight:600,lineHeight:1.5}}>⚠️ عدد الأسماء في الـ label لا يطابق قطع السيري ({sizeInfo.expectedCount}). راجع كارت المقاسات في قاعدة البيانات.</div>}
          </div>}
          {/* V19.55: درجة تانية toggle — global across all tabs. Stamps "QC-2" under
              the QR and shrinks the QR slightly to make room. The QR payload itself
              (CLARK:orderId:qty) is unchanged — scanners keep working. */}
          <label style={{
            display:"flex",alignItems:"center",gap:10,marginBottom:12,
            padding:"8px 12px",borderRadius:10,
            background:!!barcodePopup._secondGrade?"#F59E0B15":T.bg+"60",
            border:"1px solid "+(!!barcodePopup._secondGrade?"#F59E0B60":T.brd),
            cursor:"pointer",transition:"all 0.2s",
          }}>
            <input
              type="checkbox"
              checked={!!barcodePopup._secondGrade}
              onChange={e=>setBarcodePopup(p=>({...p,_secondGrade:e.target.checked}))}
              style={{width:20,height:20,cursor:"pointer",accentColor:"#F59E0B",flexShrink:0}}
            />
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:FS-1,fontWeight:700,color:T.text,lineHeight:1.2}}>
                ⚠️ درجة تانية
              </div>
              <div style={{fontSize:FS-3,color:T.textMut,marginTop:2,lineHeight:1.3}}>
                يضيف ختم <span style={{fontFamily:"monospace",fontWeight:800,color:"#000",border:"1px solid #999",padding:"0 4px",borderRadius:3}}>QC-2</span> أسفل الـ QR ويصغّر حجم الـ QR قليلاً.
              </div>
            </div>
          </label>
          {/* V19.85.0: tracking checkbox restored as opt-in (default OFF).
              When ON: each label gets a unique pieceId + Firestore doc, scannable
              from the lookup/sell/return tabs. When OFF: legacy CLARK:orderId:qty
              format (faster, no DB writes, no individual tracking). */}
          <label style={{
            display:"flex",alignItems:"center",gap:10,marginBottom:12,
            padding:"8px 12px",borderRadius:10,
            background:trackPieces?"#0EA5E915":T.bg+"60",
            border:"1px solid "+(trackPieces?"#0EA5E960":T.brd),
            cursor:"pointer",transition:"all 0.2s",
          }}>
            <input
              type="checkbox"
              checked={trackPieces}
              onChange={e=>setBarcodePopup(p=>({...p,_trackPieces:e.target.checked}))}
              style={{width:20,height:20,cursor:"pointer",accentColor:"#0EA5E9",flexShrink:0}}
            />
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:FS-1,fontWeight:700,color:T.text,lineHeight:1.2}}>
                🔍 تتبع كل قطعة (اختياري)
              </div>
              <div style={{fontSize:FS-3,color:T.textMut,marginTop:2,lineHeight:1.3}}>
                لما تفعّله، كل ليبل بيتطبع بـ <span style={{fontFamily:"monospace",fontWeight:800}}>QR فريد</span> ويتسجل في النظام —
                تقدر بعدها تـ scan أي قطعة وتعرف لمين راحت ودورة حياتها كاملة.
              </div>
            </div>
          </label>
          <div style={{display:"flex",gap:4,marginBottom:12,borderRadius:10,border:"1px solid "+T.brd,overflow:"hidden",flexWrap:"wrap"}}>
            <div onClick={()=>setBarcodePopup(p=>({...p,_mode:"manual"}))} style={{flex:1,minWidth:80,textAlign:"center",padding:"8px 0",fontWeight:700,fontSize:FS-1,cursor:"pointer",background:mode==="manual"?"#F59E0B":"transparent",color:mode==="manual"?"#fff":T.textSec}}>يدوية</div>
            <div onClick={()=>setBarcodePopup(p=>({...p,_mode:"series"}))} style={{flex:1,minWidth:80,textAlign:"center",padding:"8px 0",fontWeight:700,fontSize:FS-1,cursor:"pointer",background:mode==="series"?"#F59E0B":"transparent",color:mode==="series"?"#fff":T.textSec}}>سيري</div>
            <div onClick={()=>setBarcodePopup(p=>({...p,_mode:"auto"}))} style={{flex:1,minWidth:80,textAlign:"center",padding:"8px 0",fontWeight:700,fontSize:FS-1,cursor:"pointer",background:mode==="auto"?"#F59E0B":"transparent",color:mode==="auto"?"#fff":T.textSec}}>تلقائية</div>
            <div onClick={()=>setBarcodePopup(p=>({...p,_mode:"piece"}))} style={{flex:1,minWidth:80,textAlign:"center",padding:"8px 0",fontWeight:700,fontSize:FS-1,cursor:"pointer",background:mode==="piece"?"#8B5CF6":"transparent",color:mode==="piece"?"#fff":T.textSec}} title="قطعة واحدة — للكسور">قطعة</div>
            {/* V19.83.0: Linked series — print 1 series QR + N piece QRs (one per size) all linked.
                Scanning the series at sale auto-includes all contained pieces. */}
            <div onClick={()=>setBarcodePopup(p=>({...p,_mode:"linked"}))} style={{flex:1.4,minWidth:120,textAlign:"center",padding:"8px 0",fontWeight:700,fontSize:FS-1,cursor:"pointer",background:mode==="linked"?"#0EA5E9":"transparent",color:mode==="linked"?"#fff":T.textSec}} title="سيري + قطع داخله مرتبطة">🔗 سيري مرتبط</div>
          </div>
          {/* V14.59: Single piece QR mode — for fractional pieces less than a full rack */}
          {mode==="piece"&&<div>
            {selOrder?<div>
              <div style={{padding:12,borderRadius:10,background:"#8B5CF608",border:"1px solid #8B5CF625",marginBottom:12,fontSize:FS-1,color:T.text,lineHeight:1.7}}>
                <b style={{color:"#8B5CF6"}}>💡 ليبل قطعة واحدة:</b> يستخدم للكسور (قطع منفردة أقل من سيري كامل). كل ليبل يمسح على أنه قطعة واحدة فقط.
              </div>
              <div style={{marginBottom:12}}><label style={{fontSize:FS,fontWeight:700,color:T.text}}>عدد القطع المنفردة</label><input type="number" value={barcodePopup._pieceQty!=null?barcodePopup._pieceQty:1} onChange={e=>setBarcodePopup(p=>({...p,_pieceQty:Math.max(1,Number(e.target.value)||1)}))} style={{display:"block",margin:"8px auto",width:120,textAlign:"center",fontSize:24,fontWeight:800,border:"3px solid #8B5CF6",borderRadius:10,padding:"8px",fontFamily:"Cairo",background:T.bg,color:T.text}}/></div>
              {sizes.length>0&&<div style={{marginBottom:10}}><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>المقاس (اختياري)</label>
                <select value={barcodePopup._pieceSize||""} onChange={e=>setBarcodePopup(p=>({...p,_pieceSize:e.target.value}))} style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid "+T.brd,fontSize:FS,fontFamily:"inherit",background:T.inputBg,color:T.text,marginTop:4}}>
                  <option value="">— بدون مقاس محدد —</option>
                  {sizes.map(sz=><option key={sz} value={sz}>{sz}</option>)}
                </select>
              </div>}
              <Btn onClick={async ()=>{if(!selOrder){showToast("⚠️ اختر موديل");return}
                const qty=barcodePopup._pieceQty||1;
                const sz=barcodePopup._pieceSize||"";
                try {
                  const labels = await buildLabelsAndTrack([{
                    count: qty, type: "piece",
                    modelNo: selOrder.modelNo, modelDesc: selOrder.modelDesc || "",
                    size: sz || null, seriesQty: 1,
                    sizeStr: sz ? "مقاس: " + sz : "", seriesStr: "🔹 قطعة",
                    legacyQrText: "CLARK:" + selOrder.id + ":1",
                  }]);
                  doPrint(labels);
                } catch (e) { showToast("⛔ " + (e?.message || e)); }
              }} style={{background:"#8B5CF6",color:"#fff",border:"none",fontWeight:700,width:"100%"}}>{"🖨 طباعة "+(barcodePopup._pieceQty||1)+" ليبل قطعة"}</Btn>
            </div>
            :<div style={{padding:20,textAlign:"center",color:T.textMut}}>اختر موديل أولاً</div>}
          </div>}
          {mode==="manual"&&<div>
            {selOrder?<div>
              {sizes.length>0?<div>
                <div style={{fontSize:FS-1,fontWeight:700,color:T.textSec,marginBottom:8}}>ادخل عدد الليبلات لكل مقاس</div>
                <table style={{width:"100%",borderCollapse:"collapse",marginBottom:10}}><thead><tr><th style={{...TH,fontSize:FS-2,textAlign:"center"}}>المقاس</th><th style={{...TH,fontSize:FS-2,textAlign:"center"}}>عدد الليبلات</th></tr></thead><tbody>
                  {sizes.map(sz=>{const val=(barcodePopup._manualSizes||{})[sz]||0;return<tr key={sz}><td style={{...TD,fontWeight:700,textAlign:"center",fontSize:FS+1}}>{sz}</td>
                    <td style={{...TD,textAlign:"center",padding:2}}><input type="number" value={val||""} onChange={e=>{const v=Math.max(0,Number(e.target.value)||0);setBarcodePopup(p=>({...p,_manualSizes:{...(p._manualSizes||{}),[sz]:v}}))}} style={{width:70,textAlign:"center",border:"2px solid "+T.accent,borderRadius:6,padding:"4px",fontSize:FS+1,fontWeight:700,fontFamily:"inherit",background:T.bg,color:T.text}} placeholder="0"/></td></tr>})}
                  <tr style={{background:"#F59E0B10"}}><td style={{...TD,fontWeight:800}}>الاجمالي</td><td style={{...TD,textAlign:"center",fontWeight:800,color:"#F59E0B"}}>{sizes.reduce((s,sz)=>s+((barcodePopup._manualSizes||{})[sz]||0),0)+" ليبل"}</td></tr>
                </tbody></table>
                <Btn onClick={async ()=>{const ms=barcodePopup._manualSizes||{};
                  const total = sizes.reduce((s,sz)=>s+(ms[sz]||0), 0);
                  if(total===0){showToast("⚠️ ادخل كمية واحدة على الأقل");return}
                  try {
                    const specs = sizes.map(sz => ({
                      count: ms[sz] || 0, type: "piece",
                      modelNo: selOrder.modelNo, modelDesc: selOrder.modelDesc || "",
                      size: sz, seriesQty: rs,
                      sizeStr: "مقاس: " + sz, seriesStr: "سيري: " + rs,
                      legacyQrText: "CLARK:" + selOrder.id + ":" + rs,
                    }));
                    const labels = await buildLabelsAndTrack(specs);
                    doPrint(labels);
                  } catch (e) { showToast("⛔ " + (e?.message || e)); }
                }} style={{background:"#F59E0B",color:"#fff",border:"none",fontWeight:700,width:"100%"}}>{"🖨 طباعة "+sizes.reduce((s,sz)=>s+((barcodePopup._manualSizes||{})[sz]||0),0)+" ليبل"}</Btn>
              </div>
              :<div>
                <div style={{marginBottom:10}}><label style={{fontSize:FS-2,color:T.textSec}}>{"عدد الليبلات (كل ليبل = "+rs+" قطع)"}</label><Inp type="number" value={barcodePopup._qty||1} onChange={v=>setBarcodePopup(p=>({...p,_qty:Math.max(1,Number(v)||1)}))}/></div>
                <Btn onClick={async ()=>{if(!selOrder){showToast("⚠️ اختر موديل");return}
                  const qty=barcodePopup._qty||1;
                  try {
                    const labels = await buildLabelsAndTrack([{
                      count: qty, type: "piece",
                      modelNo: selOrder.modelNo, modelDesc: selOrder.modelDesc || "",
                      size: null, seriesQty: rs,
                      sizeStr: "", seriesStr: "سيري: " + rs,
                      legacyQrText: "CLARK:" + selOrder.id + ":" + rs,
                    }]);
                    doPrint(labels);
                  } catch (e) { showToast("⛔ " + (e?.message || e)); }
                }} style={{background:"#F59E0B",color:"#fff",border:"none",fontWeight:700,width:"100%"}}>{"🖨 طباعة "+(barcodePopup._qty||1)+" ليبل"}</Btn>
              </div>}
            </div>:<div style={{textAlign:"center",padding:20,color:T.textMut}}>اختر موديل أولاً</div>}
          </div>}
          {mode==="series"&&<div>
            {selOrder?<div style={{textAlign:"center"}}>
              <div style={{padding:12,background:T.bg+"60",borderRadius:10,marginBottom:12}}>
                <div style={{fontSize:FS,fontWeight:700,color:T.textSec,marginBottom:4}}>كل ليبل = سيري كامل</div>
                <div style={{fontSize:FS+2,fontWeight:800,color:"#F59E0B"}}>{sizes.length>0?"مقاسات: "+sizes.join(" - "):"سيري: "+rs}</div>
                <div style={{fontSize:FS-1,color:T.textMut,marginTop:4}}>{"كل ليبل = "+(sizes.length>0?sizes.length*rs:rs)+" قطعة"}</div>
              </div>
              <div style={{marginBottom:12}}><label style={{fontSize:FS,fontWeight:700,color:T.text}}>عدد السيريهات</label><input type="number" value={barcodePopup._seriesQty!=null?barcodePopup._seriesQty:labelsPerSize||1} onChange={e=>setBarcodePopup(p=>({...p,_seriesQty:Math.max(1,Number(e.target.value)||1)}))} style={{display:"block",margin:"8px auto",width:120,textAlign:"center",fontSize:24,fontWeight:800,border:"3px solid #F59E0B",borderRadius:10,padding:"8px",fontFamily:"Cairo",background:T.bg,color:T.text}}/></div>
              <Btn onClick={async ()=>{const qty=barcodePopup._seriesQty!=null?barcodePopup._seriesQty:labelsPerSize||1;
                const fullQty=sizes.length>0?sizes.length*rs:rs;
                const sizeText=sizes.length>0?"مقاسات: "+sizes.join("-"):"";
                try {
                  const labels = await buildLabelsAndTrack([{
                    count: qty, type: "series",
                    modelNo: selOrder.modelNo, modelDesc: selOrder.modelDesc || "",
                    size: null, seriesQty: fullQty,
                    sizeStr: sizeText, seriesStr: "سيري: " + fullQty,
                    legacyQrText: "CLARK:" + selOrder.id + ":" + fullQty,
                  }]);
                  doPrint(labels);
                } catch (e) { showToast("⛔ " + (e?.message || e)); }
              }} style={{background:"#F59E0B",color:"#fff",border:"none",fontWeight:700,width:"100%"}}>{"🖨 طباعة "+(barcodePopup._seriesQty!=null?barcodePopup._seriesQty:labelsPerSize||1)+" ليبل سيري"}</Btn>
            </div>:<div style={{textAlign:"center",padding:20,color:T.textMut}}>اختر موديل أولاً</div>}
          </div>}
          {mode==="auto"&&<div>
            {selOrder?<div>
              <div style={{padding:10,background:T.bg+"60",borderRadius:10,marginBottom:10}}>
                {sizes.length>0?<table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><th style={{...TH,fontSize:FS-2}}>المقاس</th><th style={{...TH,fontSize:FS-2}}>الكمية</th><th style={{...TH,fontSize:FS-2}}>سيريهات</th><th style={{...TH,fontSize:FS-2}}>ليبلات</th></tr></thead><tbody>
                  {sizes.map(sz=><tr key={sz}><td style={{...TD,fontWeight:700,textAlign:"center"}}>{sz}</td><td style={{...TD,textAlign:"center"}}>{qtyPerSize}</td><td style={{...TD,textAlign:"center"}}>{labelsPerSize}</td><td style={{...TD,textAlign:"center",fontWeight:700,color:"#F59E0B"}}>{labelsPerSize}</td></tr>)}
                  <tr style={{background:"#F59E0B10"}}><td style={{...TD,fontWeight:800}}>الاجمالي</td><td style={{...TD,textAlign:"center",fontWeight:800}}>{qtyPerSize*sizes.length}</td><td style={{...TD,textAlign:"center",fontWeight:800}}>{totalLabels}</td><td style={{...TD,textAlign:"center",fontWeight:800,color:"#F59E0B"}}>{totalLabels}</td></tr>
                </tbody></table>
                :<div style={{textAlign:"center",color:T.textMut,padding:10}}>{"سيتم طباعة "+totalLabels+" ليبل (كل ليبل = سيري "+rs+" قطع)"}</div>}
                <div style={{textAlign:"center",fontSize:FS-2,color:T.textMut,marginTop:6}}>{"كل ليبل = سيري واحد ("+rs+" قطع) — المقاس للفرز فقط"}</div>
              </div>
              <Btn onClick={async ()=>{
                try {
                  let specs;
                  if (sizes.length > 0) {
                    specs = sizes.map(sz => ({
                      count: labelsPerSize, type: "piece",
                      modelNo: selOrder.modelNo, modelDesc: selOrder.modelDesc || "",
                      size: sz, seriesQty: rs,
                      sizeStr: "مقاس: " + sz, seriesStr: "سيري: " + rs,
                      legacyQrText: "CLARK:" + selOrder.id + ":" + rs,
                    }));
                  } else {
                    specs = [{
                      count: totalLabels, type: "piece",
                      modelNo: selOrder.modelNo, modelDesc: selOrder.modelDesc || "",
                      size: null, seriesQty: rs,
                      sizeStr: "", seriesStr: "سيري: " + rs,
                      legacyQrText: "CLARK:" + selOrder.id + ":" + rs,
                    }];
                  }
                  const labels = await buildLabelsAndTrack(specs);
                  doPrint(labels);
                } catch (e) { showToast("⛔ " + (e?.message || e)); }
              }} style={{background:"#F59E0B",color:"#fff",border:"none",fontWeight:700,width:"100%"}}>{"🖨 طباعة "+totalLabels+" ليبل ("+totalLabels*rs+" قطعة)"}</Btn>
            </div>:<div style={{textAlign:"center",padding:20,color:T.textMut}}>اختر موديل أولاً</div>}
          </div>}
          {/* V19.83.0: 🔗 سيري مرتبط — prints 1 series QR (package outside) +
              K piece QRs (inside, one per size). All linked in DB so scanning
              the series at sale cascades to its contained pieces. */}
          {mode==="linked"&&<div>
            {selOrder?<div>
              <div style={{padding:12,borderRadius:10,background:"#0EA5E908",border:"1px solid #0EA5E925",marginBottom:12,fontSize:FS-1,color:T.text,lineHeight:1.7}}>
                <b style={{color:"#0EA5E9"}}>🔗 سيري + قطع داخله (مرتبط):</b> لكل سيري بـ نطبع
                <span style={{margin:"0 4px",fontWeight:800,color:"#0EA5E9"}}>{sizes.length>0?sizes.length:1}</span>
                ليبل قطعة (واحد لكل مقاس) + 1 ليبل سيري على الكرتونة. الـ QR على السيري بـ يـ link مع الـ QR's على القطع جواه — لما تـ scan-ه عند البيع، النظام يربط كل القطع الـ4 بالعميل تلقائياً.
              </div>
              {sizes.length===0&&<div style={{padding:10,background:"#FEF3C7",border:"1px solid #FDE68A",borderRadius:8,marginBottom:10,fontSize:FS-2,color:"#78350F"}}>⚠️ الموديل مالوش مقاسات في الـ size set — هاتطبع 1 piece فقط لكل سيري. أضف مقاسات من DB لو محتاج أكتر.</div>}
              <div style={{marginBottom:12}}><label style={{fontSize:FS,fontWeight:700,color:T.text}}>عدد السيريهات</label>
                <input type="number" value={barcodePopup._linkedQty!=null?barcodePopup._linkedQty:1} onChange={e=>setBarcodePopup(p=>({...p,_linkedQty:Math.max(1,Number(e.target.value)||1)}))} style={{display:"block",margin:"8px auto",width:120,textAlign:"center",fontSize:24,fontWeight:800,border:"3px solid #0EA5E9",borderRadius:10,padding:"8px",fontFamily:"Cairo",background:T.bg,color:T.text}}/>
              </div>
              <div style={{padding:10,background:T.bg+"60",borderRadius:8,marginBottom:12,fontSize:FS-2,color:T.textSec,textAlign:"center"}}>
                النتيجة:
                <b style={{color:"#0EA5E9",margin:"0 4px"}}>{(barcodePopup._linkedQty||1)*(sizes.length||1)}</b>
                ليبل قطعة +
                <b style={{color:"#0EA5E9",margin:"0 4px"}}>{barcodePopup._linkedQty||1}</b>
                ليبل سيري =
                <b style={{color:T.text,margin:"0 4px"}}>{(barcodePopup._linkedQty||1)*(sizes.length||1)+(barcodePopup._linkedQty||1)}</b>
                ليبل إجمالي
              </div>
              <Btn onClick={async ()=>{if(!selOrder){showToast("⚠️ اختر موديل");return}
                const seriesCount = barcodePopup._linkedQty||1;
                const pieceSizes = sizes.length>0 ? sizes : [null]; /* fall back to a single piece per series if no sizes */
                const userName = user?.displayName || (user?.email||"").split("@")[0] || "";
                /* Build series + pieces specs */
                const seriesSpecs = [];
                const piecesSpecs = [];
                for (let i = 0; i < seriesCount; i++) {
                  const seriesId = genPieceId();
                  seriesSpecs.push({
                    pieceId: seriesId,
                    modelNo: selOrder.modelNo,
                    modelDesc: selOrder.modelDesc || "",
                    seriesQty: pieceSizes.length,
                    orderId: selOrder.id,
                    isSecondGrade: !!secondGrade,
                    by: userName,
                  });
                  const sub = pieceSizes.map(sz => ({
                    pieceId: genPieceId(),
                    modelNo: selOrder.modelNo,
                    modelDesc: selOrder.modelDesc || "",
                    size: sz,
                    orderId: selOrder.id,
                    isSecondGrade: !!secondGrade,
                    by: userName,
                  }));
                  piecesSpecs.push(sub);
                }
                /* Write all linked docs in batches */
                if (typeof setSavingOverlay === "function") {
                  setSavingOverlay({ message: "جاري تسجيل "+seriesCount+" سيري + "+(seriesCount*pieceSizes.length)+" قطعة مرتبطة...", progress: 30 });
                }
                try {
                  await createLinkedSeriesBatch(seriesSpecs, piecesSpecs, {
                    onProgress: (done, total) => {
                      if (typeof setSavingOverlay === "function") {
                        const pct = 30 + Math.round((done/Math.max(1,total))*60);
                        setSavingOverlay({ message: "تسجيل "+done+"/"+total, progress: pct });
                      }
                    },
                  });
                  if (typeof setSavingOverlay === "function") {
                    setSavingOverlay({ message: "✅ تم — جاري الطباعة...", progress: 100 });
                    setTimeout(() => setSavingOverlay(null), 600);
                  }
                } catch (e) {
                  if (typeof setSavingOverlay === "function") setSavingOverlay(null);
                  showToast("⛔ فشل تسجيل القطع: "+(e?.message||e));
                  return;
                }
                /* Build the labels — interleave: series first then its pieces */
                const labels = [];
                const sizeText = pieceSizes.filter(Boolean).length>0 ? "مقاسات: "+pieceSizes.filter(Boolean).join("-") : "";
                seriesSpecs.forEach((s, idx) => {
                  /* Series label */
                  labels.push(buildLabel(buildTrackedQr(s.pieceId), s.modelNo, s.modelDesc, sizeText, "📦 سيري ("+pieceSizes.length+" قطع)"));
                  /* Piece labels — one per size */
                  piecesSpecs[idx].forEach(p => {
                    labels.push(buildLabel(buildTrackedQr(p.pieceId), p.modelNo, p.modelDesc, p.size?"مقاس: "+p.size:"", "🔗 ضمن سيري"));
                  });
                });
                doPrint(labels);
              }} style={{background:"#0EA5E9",color:"#fff",border:"none",fontWeight:700,width:"100%"}}>{"🖨 طباعة "+((barcodePopup._linkedQty||1)*((sizes.length||1)+1))+" ليبل (سيري + قطع مرتبطة)"}</Btn>
            </div>:<div style={{textAlign:"center",padding:20,color:T.textMut}}>اختر موديل أولاً</div>}
          </div>}
        </div>
      </div>})()}
    {/* ══ SAVING OVERLAY ══ */}
    {savingOverlay&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",backdropFilter:"blur(4px)",zIndex:999999,display:"flex",alignItems:"center",justifyContent:"center",direction:"rtl",fontFamily:"'Cairo',sans-serif"}}>
      <div style={{background:T.cardSolid,borderRadius:20,padding:"32px 40px",textAlign:"center",minWidth:280,boxShadow:"0 20px 60px rgba(0,0,0,0.3)",border:"1px solid "+T.brd}}>
        <div style={{display:"flex",justifyContent:"center",marginBottom:16}}>
          <Spinner size="large" color={T.accent}/>
        </div>
        <div style={{fontSize:FS+1,fontWeight:800,color:T.text,marginBottom:8}}>{savingOverlay.message||"جاري الحفظ..."}</div>
        {savingOverlay.progress!=null&&<div style={{height:8,borderRadius:4,background:T.bg,overflow:"hidden",margin:"12px 0"}}>
          <div style={{height:"100%",borderRadius:4,background:"linear-gradient(90deg,"+T.accent+","+T.ok+")",width:savingOverlay.progress+"%",transition:"width 0.4s ease"}}/>
        </div>}
        <div style={{fontSize:FS-2,color:T.textMut}}>برجاء الانتظار وعدم اغلاق الصفحة</div>
      </div>
    </div>}
    {/* V16.2: Undo Toast — global, shown after any undoable action for 5 minutes */}
    <UndoToast/>
    {/* V17.1 FIX #12+#15: Migration overlay — blocks UI while a schema migration is running.
        This prevents users from adding data during the unsafe window between
        step 2 (sync day docs) and step 3 (config write). */}
    {migrationStatus && (
      <div style={{
        position:"fixed",inset:0,zIndex:99998,
        background:"rgba(0,0,0,0.75)",backdropFilter:"blur(4px)",
        display:"flex",alignItems:"center",justifyContent:"center",
        padding:16,
      }}>
        <div style={{
          background:T.cardSolid,borderRadius:16,padding:32,
          maxWidth:480,width:"100%",
          textAlign:"center",
          boxShadow:"0 20px 60px rgba(0,0,0,0.4)",
          border:"2px solid "+T.accent+"40",
        }}>
          <div style={{fontSize:48,marginBottom:16}}>⚙️</div>
          <div style={{fontSize:FS+4,fontWeight:800,color:T.accent,marginBottom:8}}>
            {migrationStatus.label}
          </div>
          {migrationStatus.message && (
            <div style={{fontSize:FS,color:T.textSec,marginBottom:20,lineHeight:1.7}}>
              {migrationStatus.message}
            </div>
          )}
          {typeof migrationStatus.progress==="number" && (
            <div style={{
              width:"100%",height:8,
              background:T.brd,borderRadius:4,overflow:"hidden",
              marginBottom:12,
            }}>
              <div style={{
                width:migrationStatus.progress+"%",height:"100%",
                background:"linear-gradient(90deg, "+T.accent+", "+T.accent+"cc)",
                transition:"width 0.5s ease",
              }}/>
            </div>
          )}
          {typeof migrationStatus.progress==="number" && (
            <div style={{fontSize:FS-2,color:T.textMut,fontFamily:"monospace"}}>
              {migrationStatus.progress}%
            </div>
          )}
          <div style={{fontSize:FS-3,color:T.textMut,marginTop:18,lineHeight:1.6}}>
            ⚠️ لا تغلق البرنامج أو تعمل refresh أثناء التحديث
          </div>
        </div>
      </div>
    )}
    {/* V19.48: Full notifications popup — opens when user clicks "+N more" chip in greeting bar */}
    {notifPopupOpen&&<div onClick={(e)=>{if(e.target===e.currentTarget)setNotifPopupOpen(false)}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99998,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:T.bg,borderRadius:14,maxWidth:520,width:"100%",maxHeight:"82vh",border:"2px solid #6366F140",boxShadow:"0 25px 70px rgba(0,0,0,0.3)",overflow:"hidden",display:"flex",flexDirection:"column"}}>
        {/* Header */}
        <div style={{padding:"14px 18px",borderBottom:"1px solid "+T.brd,background:"#6366F108",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:FS+2,fontWeight:900,color:"#4F46E5"}}>📥 الإشعارات النشطة ({subBarNotifs.length})</div>
          <span onClick={()=>setNotifPopupOpen(false)} style={{cursor:"pointer",fontSize:FS+4,color:T.textMut,padding:"0 4px"}}>✕</span>
        </div>
        {/* List */}
        <div style={{padding:12,display:"flex",flexDirection:"column",gap:10,overflowY:"auto",flex:1}}>
          {subBarNotifs.length===0?<div style={{textAlign:"center",padding:40,color:T.textMut,fontSize:FS}}>— مفيش إشعارات نشطة —</div>:subBarNotifs.map(n=>{
            const st=NOTIF_STYLE[n.type]||NOTIF_STYLE["تذكير"];const remain=formatRemaining(n);
            const canEnd=userRole==="admin"||n.fromEmail===userEmail;
            const hasLink=!!n.link;
            return<div key={n.id} style={{padding:"12px 14px",borderRadius:10,border:"1.5px solid "+st.border,background:st.bg,display:"flex",flexDirection:"column",gap:8}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:FS+5,lineHeight:1}}>{st.icon}</span>
                <span style={{fontSize:FS+1,fontWeight:800,color:st.text,flex:1,lineHeight:1.4}}>{n.msg}</span>
              </div>
              <div style={{display:"flex",gap:12,flexWrap:"wrap",fontSize:FS-1,color:st.text,opacity:0.75}}>
                {n.fromName&&<span>👤 من: <b>{n.fromName}</b></span>}
                {remain&&<span>⏰ متبقي: <b>{remain}</b></span>}
                {!remain&&n.expiresAt==null&&<span>⏰ بدون حد</span>}
                <span>🏷 {n.type}</span>
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:2}}>
                {hasLink&&<span onClick={()=>{handleNotifLinkClick(n);setNotifPopupOpen(false)}} style={{cursor:"pointer",padding:"6px 12px",borderRadius:6,background:"rgba(255,255,255,0.6)",border:"1.5px solid "+st.text+"50",color:st.text,fontSize:FS-1,fontWeight:800}}>🔗 فتح {n.link.label||""}</span>}
                {canEnd&&<span onClick={()=>{endNotif(n.id);showToast("⏹ تم إنهاء الإشعار للجميع")}} style={{cursor:"pointer",padding:"6px 12px",borderRadius:6,background:"rgba(255,255,255,0.7)",border:"1.5px solid "+st.text+"60",color:st.text,fontSize:FS-1,fontWeight:800}}>⏹ إنهاء (للجميع)</span>}
                <span onClick={()=>markRead(n.id)} style={{cursor:"pointer",padding:"6px 12px",borderRadius:6,background:T.cardSolid,border:"1.5px solid "+st.text+"40",color:st.text,fontSize:FS-1,fontWeight:700}}>✕ إخفاء عندي</span>
              </div>
            </div>;
          })}
        </div>
      </div>
    </div>}
    {/* V16.79: About Version modal — opens when clicking version label in TopBar */}
    <AboutVersionModal open={showAboutVersion} onClose={()=>setShowAboutVersion(false)} currentVersion={APP_VERSION}/>
    {/* V19.48: Removed <TeamActivityModal/> render — feature retired */}
  </div>
}

