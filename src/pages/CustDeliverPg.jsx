/* ═══════════════════════════════════════════════════════════════
   CLARK - CustDeliverPg
   
   Extracted from App.jsx in V15.0 phase 2.
   Dependencies imported explicitly — no code changes inside.
   V16.70: Moved CLARK_LOGO_PRINT import out of this comment block —
   it was inside the block-comment delimiters since V15.0 so the
   binding was never created at runtime. The bug was hidden because
   (a) the sales-delivery label popup at line ~1100 was blocked by the browser before the reference
   was reached, and (b) the warehouse-package-label call sites further
   down were never exercised in the field. After the V16.70 popup-blocker
   fix that line started executing and surfaced the dormant ReferenceError.
   ═══════════════════════════════════════════════════════════════ */

import { CLARK_LOGO_PRINT } from "../constants/logo.js";
import { useState, useEffect, useRef, useMemo } from "react";
import { FKEYS, FS } from "../constants/index.js";
import { gid, fmt, r2, gf, normalizePhone, parseSizes, getSizesFromSet, dayName, openWA, ltrPhone } from "../utils/format.js";
import { nowISO, cairoDateStr } from "../utils/serverTime.js";
import { getPriceTiers } from "../utils/pricing.js";
import { playBeep } from "../utils/audio.js";
import { loadQR, loadJsQR, scanQR } from "../utils/qr.js";
import { ask, askForm, showToast, tell } from "../utils/popups.js";
import { printPage, printPkgLabel, printSalesDeliveryLabel, openPrintWindow } from "../utils/print.js";
import { calcOrder, getConfirmedStock, getConfirmedSeriesStock, getConfirmedBrokenStock, recomputeStatus } from "../utils/orders.js";
import { computeSoReserved, computeOrderAvail } from "../utils/stockCatalog.js";
import { buildCustomerSummary, formatCustomerSummaryWA } from "../utils/accountSummary.js";
import { analyzeCustomer, fmtMonth } from "../utils/customerAnalytics.js";
import { getCustRating, Stars } from "../utils/rating.jsx";
import { getDeleteBlocker } from "../utils/dataIntegrity.js";
import { auth } from "../firebase";
import { autoPost } from "../utils/accounting/autoPost.js";
import { buildSalesInvoiceFromDelivery, buildCreditNoteFromReturn, upsertSalesInvoiceFromDelivery, upsertCreditNoteFromReturn } from "../utils/invoices.js";
import { generateSalesOrdersFromSessionMutator } from "../utils/sales/salesOrders.js";
import { Spinner, Btn, Inp, Sel, SearchSel, Card, DelBtn, QRImg } from "../components/ui.jsx";
/* V21.9.105: Universal Tagging — Slice 4b Customer integration. TagPicker
   for edit form, TagFilter + TagChips for list view. Manager+Admin only
   create inline tags (per data-safety §0.1 decision). */
import { DiscountModal } from "../components/sales/DiscountModal.jsx";
import { DiscountsManager } from "../components/sales/DiscountsManager.jsx";
import { TagPicker, TagChips } from "../components/TagPicker.jsx";
import { TagFilter } from "../components/TagFilter.jsx";
import { filterByTags } from "../utils/tags.js";
/* V21.9.124: Universal Attachments — wire to customer edit form. Only mounts
   for an existing customer (cEditId truthy) because attachments need a stable
   entityId before they can be linked. */
import { AttachmentList } from "../components/attachments/AttachmentList.jsx";
import { StockPortalLinkModal } from "../components/StockPortalLinkModal.jsx";
import { T, TH, TD, TDB } from "../theme.js";
/* V19.70.12: html→pdf for WhatsApp delivery receipts */
import { htmlToPdfBase64, loadPdfLibs } from "../utils/htmlToPdf.js";
/* V19.80.22: arabicPdf.js (jsPDF + custom Arabic shaper) was rewritten OUT
   of this flow. The shaper had multiple unfixable bugs (chars never reached
   contextual shaping, full-string reversal flipped Arabic letter-by-letter)
   so the auto-WhatsApp PDF rendered "نظام" as "ماظن", "احمد" as "دمحا", etc.
   We now generate the PDF from HTML via html2canvas (the same path that
   already produces the correct print-version PDF), with Arial font for clean
   readable Latin/digit rendering and system Arabic fallback (Tahoma/GeezaPro). */
/* V19.70.23: Approach A applied to bulk delivery PDF — jsPDF + Cairo TTF + Arabic shaper.
   Replaces the html2canvas image-capture pipeline that broke Arabic shaping in V19.70.14-22
   despite four font/element fixes. The new path uses jsPDF text APIs directly → vector PDF
   output (high quality, smaller files) with Arabic shaped via our embedded shaper. */
/* V19.80.22: arabicPdf.js no longer imported — see comment above the
   htmlToPdf import. The file is kept on disk for reference but is dead code. */

/* V18.17: Module-level mutable variable used by inventory-audit scanner closure
   to read latest scan mode. Was assigned but never declared — caused ReferenceError
   when opening 'جرد المخزن من المبيعات' page after Vite/ESM strict-mode upgrade. */
let _auditScanMode = "series";
/* V21.21.39 (اكتشفه ESLint no-undef): _stockRcvScanMode كانت بتتسند من غير
   تعريف — في ESM (strict mode) ده ReferenceError فوري → إعداد وضع مسح
   استلام المخزن كان بينهار بصمت (الـ catch القديم الفاضي بلعه لحد
   V21.21.31). نفس نمط _auditScanMode الشقيقة. */
let _stockRcvScanMode = "series";

export function CustDeliverPg({data,upConfig,upSales,upTasks,updOrder,isMob,isTab,canEdit,user,season,hubView}){
  const config=data;const orders=data.orders||[];const customers=config.customers||[];const sessions=config.custDeliverySessions||[];
  const[showCustForm,setShowCustForm]=useState(false);const[showCustList,setShowCustList]=useState(false);const[custSalesLog,setCustSalesLog]=useState(null);const[editSaleIdx,setEditSaleIdx]=useState(null);const[editSaleQty,setEditSaleQty]=useState(0);const[logCustF,setLogCustF]=useState("");const[logModelF,setLogModelF]=useState("");const[logDateF,setLogDateF]=useState("");const[logTypeFilter,setLogTypeFilter]=useState("");const[logLimit,setLogLimit]=useState(50);const[quoteCust,setQuoteCust]=useState(null);const[balReview,setBalReview]=useState(false);const[pendingRcv,setPendingRcv]=useState(null);
  /* V18.63: Delivery-note popup state — same flow as quoteCust but prints quantities only (no prices). */
  const[deliverNote,setDeliverNote]=useState(null);
  /* V18.63: Show-more flags for the session pickers (default to "last 10 only") */
  const[showAllSessQuote,setShowAllSessQuote]=useState(false);
  const[showAllSessDeliver,setShowAllSessDeliver]=useState(false);
  /* V18.63: Customer statement tab state — "summary" or "log" */
  const[statementTab,setStatementTab]=useState("summary");
  /* V18.63: Model filter inside the customer statement (applies to both tabs) */
  const[statementModelFilter,setStatementModelFilter]=useState("");
  /* V14.59: Receipt report — after confirmation, show the summary */
  const[lastReceiptReport,setLastReceiptReport]=useState(null);/* {items:[{orderId,modelNo,desc,confirmedQty,pendingQty,diff}], total, confirmedBy, at} */
  const[showReceiptLog,setShowReceiptLog]=useState(false);
  /* V21.19.0: مودال «المنتجات» — كل المنتج الجاهز + كمية متاحة + تعديل سعر البيع */
  const[productsPrice,setProductsPrice]=useState(false);
  const[ppSearch,setPpSearch]=useState("");
  const[ppEdits,setPpEdits]=useState({});/* {orderId: priceStr} */
  /* V21.9.189: default new-customer discount is 10% (was 0% before). Existing
     customers keep whatever they have stored — only freshly-created customers
     pick up the new default. The edit form below still preserves c.discount
     for existing records. Phase 2 will add per-row override in the Plan tab. */
  const[cName,setCName]=useState("");const[cPhone,setCPhone]=useState("");const[cAddr,setCAddr]=useState("");const[cEditId,setCEditId]=useState(null);const[cType,setCType]=useState("مكتب");const[cDiscount,setCDiscount]=useState(10);const[custFilter,setCustFilter]=useState("");
  /* V18.16: Archive flag for customer form */
  const[cArchived,setCArchived]=useState(false);
  /* V21.9.105: Customer tags state (Slice 4b of Universal Tagging).
     `cTags` is the array of tag IDs being edited; `custTagFilter` filters
     the customer list popup. Mode defaults to "OR" (any). */
  const[cTags,setCTags]=useState([]);
  const[cPriceTier,setCPriceTier]=useState("");/* V21.21.54: نوع تسعير العميل الافتراضي */
  const[custTagFilter,setCustTagFilter]=useState([]);
  const[custTagFilterMode,setCustTagFilterMode]=useState("OR");
  /* V18.16: Show-archived toggle (admin only — defaults off so archived are hidden everywhere) */
  const[showArchivedCusts,setShowArchivedCusts]=useState(false);
  /* V18.19: Item card (كارت صنف) — full movement history per model */
  const[itemCard,setItemCard]=useState(null);/* null | "pick" | {orderId} */
  const[itemCardFilter,setItemCardFilter]=useState("");
  const[showNewSession,setShowNewSession]=useState(false);
  const[selModels,setSelModels]=useState({});const[selCusts,setSelCusts]=useState({});
  /* V19.76.6: filter inputs in the "تسليم جديد" popup — quick search across many models/customers. */
  const[newSessModelFilter,setNewSessModelFilter]=useState("");
  const[newSessCustFilter,setNewSessCustFilter]=useState("");
  const[activeSession,setActiveSession]=useState(null);
  const[editCell,setEditCell]=useState(null);const[editVal,setEditVal]=useState(0);const[cellError,setCellError]=useState("");
  /* V19.70.22: local-state grid for the distribution matrix. Holds unsaved edits as the
     user types. Initialized from the active session's grid when activeSession changes.
     The save-all button (added at the matrix footer) commits the entire localGrid via a
     single upSales call. This eliminates the per-cell flicker (typed → blur → setState
     to null → wait for Firestore round-trip → re-read → re-display) that the user reported.
     `localGridDirty` flips true on first edit; it gates the save button + warns on close. */
  const[localGrid,setLocalGrid]=useState({});
  const[localGridDirty,setLocalGridDirty]=useState(false);
  /* ── V21.9.190 — Phase 2 ──────────────────────────────────────────────
     Per-customer-per-session discount override. Stored in
     `sess.custDisc` (object map: { custId: pct }). Mirrored to local
     state for snappy input editing without round-tripping each keystroke
     through Firestore. The committed-sale path reads the EFFECTIVE
     discount via getEffectiveDiscount() and stamps it on the delivery
     entry as `discPct` so the invoice generator can pick it up.

     Precedence:
       1. sess.custDisc[custId]    (per-session override — Phase 2)
       2. customer.discount         (customer-level default)
       3. 10                        (system default — Phase 1)
  */
  const [localCustDisc, setLocalCustDisc] = useState({});
  const [localCustDiscDirty, setLocalCustDiscDirty] = useState(false);
  /* V21.9.190 — single source of truth for "what discount applies to this
     customer in this session". Used by render (display in input + receipt
     totals), by save flows (stamp entry.discPct), and by the sales report
     (per-session iteration). Pass `sess` explicitly so report code can ask
     about a non-active session. If sess matches the active session, the
     LIVE local overrides are preferred over the persisted sess.custDisc
     (so unsaved edits show through immediately). */
  const getEffectiveDiscount = (customer, sess) => {
    if (!customer) return 10;
    const map = (sess && sess.id === activeSession)
      ? localCustDisc
      : ((sess && sess.custDisc) || {});
    const override = map[customer.id];
    if (override !== undefined && override !== null && override !== "") {
      const n = Number(override);
      if (!isNaN(n)) return n;
    }
    if (customer.discount !== undefined && customer.discount !== null) {
      const n = Number(customer.discount);
      if (!isNaN(n)) return n;
    }
    return 10;
  };
  /* V21.9.192 — find the discPct from the matching sale entry for this
     return. Used by the 3 return-creation flows (doReturn popup, free
     return, QR return) so credit notes match the original invoice's
     discount instead of relying on the customer's CURRENT discount,
     which may have changed since the sale.

     Match priority (most specific first):
       1. Same custId + sessionId  (returning from the exact session)
       2. Same custId, any session (orphan return / multi-session)
     Newest delivery wins (reverse iteration). Returns the entry's
     `discPct` if found; otherwise undefined → caller falls through
     the resolveDiscountPct chain (customer.discount → 10). */
  const findMatchingSaleDiscPct = (order, custId, sessionId) => {
    const dels = (order && order.customerDeliveries) || [];
    /* Pass 1: same-session match */
    if (sessionId) {
      for (let i = dels.length - 1; i >= 0; i--) {
        const d = dels[i];
        if (d && d.custId === custId && d.sessionId === sessionId
            && d.discPct !== undefined && d.discPct !== null) {
          const n = Number(d.discPct);
          if (!isNaN(n)) return n;
        }
      }
    }
    /* Pass 2: any-session match (newest first) */
    for (let i = dels.length - 1; i >= 0; i--) {
      const d = dels[i];
      if (d && d.custId === custId
          && d.discPct !== undefined && d.discPct !== null) {
        const n = Number(d.discPct);
        if (!isNaN(n)) return n;
      }
    }
    return undefined;
  };
  /* Setter for the per-cell input — keeps validation tight (0..100, allow
     empty string so user can clear back to the fallback). */
  const setCustDiscount = (custId, rawVal) => {
    setLocalCustDisc(prev => {
      const next = { ...prev };
      if (rawVal === "" || rawVal === null || rawVal === undefined) {
        delete next[custId];
      } else {
        const n = Number(rawVal);
        if (isNaN(n)) return prev;
        next[custId] = Math.max(0, Math.min(100, n));
      }
      return next;
    });
    setLocalCustDiscDirty(true);
    setLocalGridDirty(true); /* surfaces in the same "save all" button */
  };
  /* Same idea for the sales-audit grid (جدول الجرد للعملاء). Separate state because
     the audit grid is rendered in a different popup and has different lifecycle. */
  const[localAudGrid,setLocalAudGrid]=useState({});
  const[localAudGridDirty,setLocalAudGridDirty]=useState(false);
  const[shipPopup,setShipPopup]=useState(null);const[shipCount,setShipCount]=useState(1);
  /* V16.72: Pre-fetched delivery-sign promise — populated when shipPopup opens
     so the signature is being fetched WHILE the user is filling in the
     shipment count. The print-button click handler just awaits this promise
     instead of starting the fetch then. Saves ~500–1000ms of perceived latency
     between clicking "🖨 طباعة N ليبل" and the print dialog appearing. */
  const sigPromiseRef=useRef(null);
  /* V19.66: double-submit guard for the QR confirm-sale popup */
  const qrSaleSubmittingRef=useRef(false);
  const[sessFilterQ,setSessFilterQ]=useState("");
  /* V21.11.1: سجل التسليمات — عرض أول 25 + «عرض المزيد» (طلب Ahmed). */
  const[sessLimit,setSessLimit]=useState(25);
  const[reportRange,setReportRange]=useState({from:"",to:""});const[showReport,setShowReport]=useState(false);const[rptType,setRptType]=useState("all");const[rptCust,setRptCust]=useState("");const[rptModel,setRptModel]=useState("");
  const[invAudit,setInvAudit]=useState(null);/* {items:{orderId:{counted:n}},scanning:false} */
  const[groupPrint,setGroupPrint]=useState(null);const[addCustPick,setAddCustPick]=useState(null);const[stockRcv,setStockRcv]=useState(null);/* {items:{},scanning:false} */
  /* V19.70.20: Click-to-expand popup for the رصيد متاح dashboard card.
     Shows all models with avail > 0, breaking down series-vs-broken pieces.
     Supports search/filter, print (browser-native), and WhatsApp PDF send to owner phones. */
  const[availPopup,setAvailPopup]=useState(null);/* { search, sending } | null */
  const[showNewAudit,setShowNewAudit]=useState(false);const[auditDate,setAuditDate]=useState(cairoDateStr());const[auditFrom,setAuditFrom]=useState("");const[auditTo,setAuditTo]=useState("");const[auditNote,setAuditNote]=useState("");const[auditSelCusts,setAuditSelCusts]=useState({});
  const[activeAudit,setActiveAudit]=useState(null);const[auditCell,setAuditCell]=useState(null);const[auditVal,setAuditVal]=useState(0);const[showAuditAnalysis,setShowAuditAnalysis]=useState(null);
  const[ocrCust,setOcrCust]=useState(null);const[ocrLoading,setOcrLoading]=useState(false);const[ocrResult,setOcrResult]=useState(null);const ocrRef=useRef(null);const[auditInclude,setAuditInclude]=useState(null);
  /* V15.64: Enhanced OCR — preview + confidence */
  const[ocrImageUrl,setOcrImageUrl]=useState(null);
  const[returnPopup,setReturnPopup]=useState(null);const[retQty,setRetQty]=useState(0);const[retNote,setRetNote]=useState("");
  const[freeReturn,setFreeReturn]=useState(null);const[freeRetItems,setFreeRetItems]=useState({});const[freeRetNote,setFreeRetNote]=useState("");
  const[custQR,setCustQR]=useState(null);const[salesDetail,setSalesDetail]=useState(null);const[custStatement,setCustStatement]=useState(null);const[salesAnalysis,setSalesAnalysis]=useState(false);const[seasonReport,setSeasonReport]=useState(false);const[editRetIdx,setEditRetIdx]=useState(null);const[editRetQty,setEditRetQty]=useState(0);const[editRetNote,setEditRetNote]=useState("");
  /* V17.7: Returns log grouped by customer — popup shows full return history */
  const[returnsPopupCustId,setReturnsPopupCustId]=useState(null);
  const[returnsLogFilter,setReturnsLogFilter]=useState("");
  /* V17.9: Tab system for the 4 main lists at the bottom of sales page (sessions / returns / audits / stale) */
  const[salesTab,setSalesTab]=useState("sessions");
  /* V16.3: Portal URL popup + Stats toggle */
  const[portalUrlPopup,setPortalUrlPopup]=useState(null);/* {url, custName, loading, error} */
  const[showStockPortal,setShowStockPortal]=useState(false);/* V21.21.68: بورتال المخزن المتاح */
  const[showCustStats,setShowCustStats]=useState(false);
  /* V18.63: Reset statement tab/filter whenever the user opens a different customer.
     IMPORTANT — must be placed AFTER custStatement is declared (line 84). Putting
     it earlier crashes at module load with a TDZ error: the dependency array
     [custStatement] is evaluated synchronously the moment useEffect is invoked,
     which happens during the function body's top-down execution. */
  useEffect(()=>{
    if(custStatement&&custStatement!=="pick"){
      setStatementTab("summary");
      setStatementModelFilter("");
    }
  },[custStatement]);

  /* V19.70.22: sync localGrid with the activeSession's committed grid whenever
     the session changes (open/switch). We do NOT re-init on every grid change
     during editing — that would clobber the user's unsaved edits. Only on
     activeSession id change. The dirty flag resets too. */
  useEffect(() => {
    if (!activeSession) {
      setLocalGrid({});
      setLocalGridDirty(false);
      setLocalCustDisc({});
      setLocalCustDiscDirty(false);
      return;
    }
    const sess = (data.custDeliverySessions || []).find(s => s.id === activeSession);
    setLocalGrid({ ...(sess?.grid || {}) });
    setLocalGridDirty(false);
    /* V21.9.190: also hydrate per-customer discount map for this session */
    setLocalCustDisc({ ...(sess?.custDisc || {}) });
    setLocalCustDiscDirty(false);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [activeSession]);

  /* V19.70.22: same pattern for the sales-audit grid. activeAudit governs the popup;
     when it changes, copy the audit's persisted grid into localAudGrid. */
  useEffect(() => {
    if (!activeAudit) {
      setLocalAudGrid({});
      setLocalAudGridDirty(false);
      return;
    }
    const aud = ((data.salesAudits) || []).find(a => a.id === activeAudit);
    setLocalAudGrid({ ...(aud?.grid || {}) });
    setLocalAudGridDirty(false);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [activeAudit]);
  
  /* V19.14: auto-sync orphan treasury → custPayments on opening a customer
     statement. Mirrors the same logic just added to PurchasePg for suppliers.
     Without this, the V18.64 orphan-fallback shows the entry inline as
     "غير مزامنة", confusing users who expected a clean statement. */
  const _custSyncedRef = useRef(new Set());
  useEffect(() => {
    if (!custStatement || custStatement === "pick") return;
    if (_custSyncedRef.current.has(custStatement)) return;
    _custSyncedRef.current.add(custStatement);
    const knownTxIds = new Set((data.custPayments||[]).filter(p => String(p.custId)===String(custStatement)).map(p=>p.treasuryTxId).filter(Boolean));
    const tombstones = new Set(data._deletedCustPayTreasuryIds || []);
    const orphans = (data.treasury||[]).filter(t =>
      t && t.id && t.type === "in" &&
      String(t.custId||"") === String(custStatement) &&
      !knownTxIds.has(t.id) &&
      !tombstones.has(t.id) &&
      t.sourceType !== "check_bounce"
    );
    if (orphans.length === 0) return;
    const cust = (data.customers||[]).find(c => c.id === custStatement);
    if (!cust) return;
    upConfig(d => {
      if (!d.custPayments) d.custPayments = [];
      const existingNow = new Set((d.custPayments||[]).filter(p => String(p.custId)===String(custStatement)).map(p=>p.treasuryTxId).filter(Boolean));
      const now = nowISO();
      orphans.forEach(t => {
        if (existingNow.has(t.id)) return;
        d.custPayments.push({
          id: gid(),
          custId: custStatement,
          custName: cust.name,
          amount: Number(t.amount) || 0,
          date: t.date,
          note: t.notes || t.desc || "",
          method: "كاش",
          treasuryTxId: t.id,
          by: t.by || "v1914-auto-sync",
          createdAt: now,
          _v1914AutoSync: now,
        });
      });
    });
  }, [custStatement, data.treasury, data.custPayments]);
  
  /* V16.3: Generate portal URL for a customer */
  const generatePortalUrl=async(custId,custName)=>{
    setPortalUrlPopup({loading:true,custName,url:"",error:""});
    try{
      const user=auth.currentUser;
      if(!user){setPortalUrlPopup({loading:false,custName,url:"",error:"يرجى تسجيل الدخول"});return}
      const token=await user.getIdToken();
      const res=await fetch("/api/customer-portal-sign",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({custId,adminToken:token})
      });
      const json=await res.json();
      if(!res.ok){setPortalUrlPopup({loading:false,custName,url:"",error:json.error||"فشل التوليد"});return}
      setPortalUrlPopup({loading:false,custName,url:json.url,error:""});
    }catch(err){
      setPortalUrlPopup({loading:false,custName,url:"",error:err.message||String(err)});
    }
  };
  /* Customer statement payment form */
  const[payAmt,setPayAmt_]=useState("");const[payDate_,setPayDate_]=useState(cairoDateStr());const[payNote_,setPayNote_]=useState("");const[payMethod,setPayMethod]=useState("كاش");
  const[showCustDiscount,setShowCustDiscount]=useState(false);/* V21.21.59: خصم إضافي */
  /* V19.11: account selector in customer payment form (used to default-hardcode "SUB CASH",
     which silently routed every customer payment to that one account. Users with multiple
     treasury accounts (MAIN CASH, CIB, etc.) had to delete + re-create from TreasuryPg to
     correct the routing. */
  const[payAccount,setPayAccount]=useState("");
  /* Distribution grid filters */
  const[gridModelF,setGridModelF]=useState("");const[gridCustF,setGridCustF]=useState("");
  /* V15.37: Draft sell prices — typed but not saved until user clicks "حفظ". Keyed by group key (modelNo). */
  const[sellPriceDrafts,setSellPriceDrafts]=useState({});
  const[qrSale,setQrSale]=useState(null);/* {mode:"sale"|"return",custId,items:[{orderId,modelNo,modelDesc,rackSize,qty}],note,linkedSession} */
  const[qrScanActive,setQrScanActive]=useState(false);const[customLabel,setCustomLabel]=useState(null);
  const[pkgPopup,setPkgPopup]=useState(null);const[pkgItems,setPkgItems]=useState([]);const[pkgNote,setPkgNote]=useState("");const[pkgSearch,setPkgSearch]=useState("");const[pkgScan,setPkgScan]=useState(false);const[pkgAction,setPkgAction]=useState(null);/* {id,mode:"menu"|"add"|"remove"} */
  useEffect(()=>{const h=()=>{const mode=window.__qrSaleMode;if(mode){delete window.__qrSaleMode;setQrSale({mode,custId:null,items:[],note:"",linkedSession:mode==="return"?"free":undefined})}};const h2=()=>{const pkgId=window.__openPkg;if(pkgId){delete window.__openPkg;setPkgAction({id:pkgId,mode:"menu"})}};window.addEventListener("qr-sale-trigger",h);window.addEventListener("open-pkg",h2);return()=>{window.removeEventListener("qr-sale-trigger",h);window.removeEventListener("open-pkg",h2)}},[]);
  const userName=user?.displayName||user?.email?.split("@")[0]||"";

  /* V15.30: Use sizeSet.pcsPerSeries as source of truth (falls back to label parsing) */
  const getRackSize=(orderId)=>{const o=orders.find(x=>x.id===orderId);if(!o)return 1;const info=getSizesFromSet(o,data);return info.expectedCount||1};

  /* V15.36: FIFO Auto-Distribution helpers for duplicate-modelNo orders.
     Problem: scanning a QR for orderA (only 5 left) when orderB has 80 left but same modelNo
              currently rejects. These helpers redistribute across same-modelNo orders. */
  /* Returns all orders sharing this modelNo, sorted FIFO (oldest first) */
  const getSameModelOrders=(orderId)=>{
    const o=orders.find(x=>x.id===orderId);if(!o||!o.modelNo)return[];
    return orders.filter(x=>x.modelNo===o.modelNo)
      .sort((a,b)=>((a.createdAt||a.id||"")+"").localeCompare(((b.createdAt||b.id||"")+"")));
  };
  /* Check if a group of orders have consistent sell price — allow 0 as "unset" */
  const checkGroupPriceConsistent=(groupOrders)=>{
    const prices=groupOrders.map(o=>Number(o.sellPrice)||0).filter(p=>p>0);
    if(prices.length<=1)return{consistent:true,prices};
    const first=prices[0];
    return{consistent:prices.every(p=>p===first),prices};
  };
  /* Distribute qty FIFO across same-modelNo orders.
     mode: "sale" → use avail stock. "return" → use delivered-returned.
     currentCart: {orderId: qtyAlreadyInCart}
     linkedSessGrid: if provided, cap BY GROUP SUM (not per-order) of planned remaining
     overrideMode: if true, SKIP planned check (only stock limit applies) — emergency use
     Returns: {ok: bool, allocations: [{orderId, qty}], error: string, grandAvail: number, modelNo: string}
     V15.38 FIX: Group-level caps — previously applied planned-per-order which failed when
     one sub-order had stock but no planned (or vice versa). Now: planned_sum and stock_sum
     are the effective caps, and FIFO distributes across available stock freely.
     V15.40: overrideMode skips planned limits for emergency sales beyond plan. */
  const distributeFIFO=(groupOrders,requestedQty,mode,currentCart,linkedSessGrid,custIdForReturn,overrideMode)=>{
    const modelNo=groupOrders[0]?.modelNo||"?";
    const custId=currentCart.__custId||"";
    const sessId=currentCart.__sessId||null;
    /* Step 1: Per-order stock availability (FIFO order) */
    const perOrder=groupOrders.map(go=>{
      let stockAvail=0;
      if(mode==="sale"){
        const sm=stockModels.find(m=>m.id===go.id);
        stockAvail=sm?sm.avail:0;
      }else{/* return */
        let cd=0,ret=0;
        if(custIdForReturn){
          cd=(go.customerDeliveries||[]).filter(d=>d.custId===custIdForReturn).reduce((s,d)=>s+(Number(d.qty)||0),0);
          ret=(go.customerReturns||[]).filter(r=>r.custId===custIdForReturn).reduce((s,r)=>s+(Number(r.qty)||0),0);
        }else{
          cd=(go.customerDeliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);
          ret=(go.customerReturns||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);
        }
        stockAvail=cd-ret;
      }
      const alreadyInCart=Number(currentCart[go.id])||0;
      const canTake=Math.max(0,stockAvail-alreadyInCart);
      return{go,stockAvail,canTake};
    });
    const stockLimit=perOrder.reduce((s,p)=>s+p.canTake,0);
    /* Step 2: Planned limit (SUMMED across group) — only for linked sale sessions, and only if NOT override */
    let plannedLimit=Infinity;
    let plannedDetails=null;
    if(linkedSessGrid&&mode==="sale"&&!overrideMode){
      plannedDetails={totalPlanned:0,totalDelivered:0,totalRemaining:0};
      for(const go of groupOrders){
        const planned=Number(linkedSessGrid[go.id+"_"+custId])||0;
        /* V15.42 FIX: Filter by BOTH sessionId AND custId — previously summed all customers in the session,
           falsely triggering "plan complete" for customers who hadn't received anything yet.
           Also: returns no longer subtracted here — returns happen end-of-season and are unrelated to plan completion. */
        const deliveredInSess=(go.customerDeliveries||[]).filter(d=>d.sessionId===sessId&&d.custId===custId).reduce((s,d)=>s+(Number(d.qty)||0),0);
        plannedDetails.totalPlanned+=planned;
        plannedDetails.totalDelivered+=deliveredInSess;
        plannedDetails.totalRemaining+=Math.max(0,planned-deliveredInSess);
      }
      /* Subtract what's already in cart (across all sub-orders in group) */
      const alreadyInCartForGroup=perOrder.reduce((s,p)=>s+(Number(currentCart[p.go.id])||0),0);
      plannedLimit=Math.max(0,plannedDetails.totalRemaining-alreadyInCartForGroup);
    }
    const effectiveCap=Math.min(plannedLimit,stockLimit);
    /* Step 3: Validation with DETAILED error — diagnoses the limiting factor */
    if(requestedQty>effectiveCap){
      const parts=[];
      if(plannedDetails){
        if(plannedDetails.totalRemaining<=0){
          parts.push("الخطة اكتملت ("+plannedDetails.totalDelivered+"/"+plannedDetails.totalPlanned+")");
        }else if(plannedLimit<stockLimit){
          parts.push("المتبقي من الخطة "+plannedLimit);
        }
      }
      if(stockLimit<requestedQty&&(!plannedDetails||stockLimit<plannedLimit)){
        parts.push("المخزن المتاح "+stockLimit+" قطعة");
      }
      const cartSum=perOrder.reduce((s,p)=>s+(Number(currentCart[p.go.id])||0),0);
      if(cartSum>0)parts.push("في الـ cart: "+cartSum);
      let err="⛔ "+modelNo+": المطلوب "+requestedQty;
      if(parts.length>0)err+=" — "+parts.join("، ");
      /* V15.41: Add per-order breakdown for diagnosis */
      if(groupOrders.length>0){
        err+="\n📊 التشخيص:";
        for(let i=0;i<groupOrders.length;i++){
          const go=groupOrders[i];const po=perOrder[i];
          const planned=linkedSessGrid?(Number(linkedSessGrid[go.id+"_"+custId])||0):0;
          const delIn=sessId?(go.customerDeliveries||[]).filter(d=>d.sessionId===sessId&&d.custId===custId).reduce((s,d)=>s+(Number(d.qty)||0),0):0;
          err+="\n• تشغيل "+(i+1)+": خطة="+planned+"، تسليم="+delIn+"، مخزن="+po.stockAvail;
        }
      }
      /* Hint about override — only if planned is the limit */
      if(!overrideMode&&plannedDetails&&stockLimit>=requestedQty){
        err+="\n💡 فعّل \"وضع الطوارئ 🚨\" للبيع خارج الخطة";
      }
      return{ok:false,allocations:[],error:err,grandAvail:effectiveCap,modelNo};
    }
    /* Step 4: FIFO distribution — fill from oldest, respecting each order's stock ceiling */
    let remaining=requestedQty;
    const allocations=[];
    for(const{go,canTake} of perOrder){
      if(remaining<=0)break;
      const take=Math.min(remaining,canTake);
      if(take>0){
        allocations.push({orderId:go.id,qty:take});
        remaining-=take;
      }
    }
    return{ok:true,allocations,grandAvail:effectiveCap,modelNo};
  };

  const orderCalcs=useMemo(()=>{const m=new Map();orders.forEach(o=>m.set(o.id,calcOrder(o)));return m},[orders]);
  const getCalc=(oid)=>orderCalcs.get(oid)||calcOrder({});
  /* V21.20.5: كميات أوامر البيع المحجوزة لكل موديل («أمر البيع = بيع» يخصم المتاح).
     V21.21.67: اتنقلت للـ util stockCatalog.js (مصدر حقيقة واحد مع بورتال المخزن). */
  const soReservedByOrder=useMemo(()=>computeSoReserved(data.salesOrders),[data.salesOrders]);
  const stockModels=useMemo(()=>orders.filter(o=>getConfirmedStock(o)>0).map(o=>{const{stockQty,avail,delivered,returned}=computeOrderAvail(o,soReservedByOrder);const net=(delivered-returned)+(soReservedByOrder[o.id]||0);return{id:o.id,modelNo:o.modelNo,modelDesc:o.modelDesc,image:o.image||"",stockQty,seriesQty:getConfirmedSeriesStock(o),brokenQty:getConfirmedBrokenStock(o),custDel:net,avail,rackSize:getRackSize(o.id),sellPrice:Number(o.sellPrice)||0,returns:returned}}),[orders,soReservedByOrder]);

  const saveCust=()=>{if(!cName.trim()||!cPhone.trim()){showToast("⚠️ الاسم والتليفون مطلوبين");return}
    const phoneClean=normalizePhone(cPhone.trim());
    const discVal=Math.max(0,Math.min(100,Number(cDiscount)||0));
    /* V21.9.105: snapshot tags to a safe array — never undefined, dedup just in case. */
    const tagsClean=Array.from(new Set(Array.isArray(cTags)?cTags.filter(Boolean):[]));
    const tierVal=String(cPriceTier||"").trim();/* V21.21.54 */
    upConfig(d=>{if(!d.customers)d.customers=[];if(cEditId){const idx=d.customers.findIndex(c=>c.id===cEditId);if(idx>=0){d.customers[idx].name=cName.trim();d.customers[idx].phone=phoneClean;d.customers[idx].address=cAddr.trim();d.customers[idx].type=cType;d.customers[idx].discount=discVal;d.customers[idx].archived=!!cArchived;d.customers[idx].tags=tagsClean;d.customers[idx].priceTier=tierVal}}else{d.customers.push({id:gid(),name:cName.trim(),phone:phoneClean,address:cAddr.trim(),type:cType,discount:discVal,archived:!!cArchived,tags:tagsClean,priceTier:tierVal})}});
    setCName("");setCPhone("");setCAddr("");setCType("مكتب");setCDiscount(10);setCArchived(false);setCTags([]);setCPriceTier("");setCEditId(null);setShowCustForm(false);showToast("✓ تم الحفظ")};

  /* V21.9.57 CRITICAL FIX (Reported Bug — '"تسوية جرد" مش بعرف احذف'):
     `safeDelete` was referenced at line ~3116 inside the customer list
     `DelBtn onConfirm` but NEVER DEFINED in this component (not in props,
     not local, not imported). Clicking "تأكيد" threw a silent ReferenceError
     and the customer record stayed forever.

     This was masked because:
     1. The button click handler is wrapped in onConfirm callback — exceptions
        get swallowed by React error boundaries instead of surfacing as toast
     2. Users assumed "delete is blocked by some reference" (the typical CLARK
        behavior) instead of "delete code is missing"

     Adopting the same pattern from DBPg.jsx:32 — moves to recycleBin so
     accidental deletes are reversible. Defensively excludes pseudo-IDs that
     start with "_" (like "_adjust" from inventory audit) from going to the
     recycle bin since those are internal markers, not real records. */
  const safeDelete=(collection,id,type)=>{
    upConfig(d=>{
      if(!d.recycleBin)d.recycleBin=[];
      const arr=d[collection]||[];
      const item=arr.find(x=>x.id===id);
      /* Only archive REAL records — pseudo-IDs (_adjust, etc.) are
         system-internal and shouldn't appear in the recycle bin. */
      if(item && !String(id).startsWith("_")){
        d.recycleBin.unshift({...item,_type:type,_collection:collection,_deletedAt:new Date().toISOString()});
      }
      d[collection]=arr.filter(x=>x.id!==id);
      if(d.recycleBin.length>100)d.recycleBin=d.recycleBin.slice(0,100);
    });
    showToast("✓ تم الحذف"+(String(id).startsWith("_")?"":" — يمكن الاستعادة من سلة المحذوفات"));
  };

  const createSession=()=>{const mIds=Object.keys(selModels).filter(k=>selModels[k]);const cIds=Object.keys(selCusts).filter(k=>selCusts[k]);
    if(mIds.length===0||cIds.length===0){showToast("⚠️ اختر موديل وعميل على الأقل");return}
    const sess={id:gid(),date:cairoDateStr(),createdAt:nowISO(),modelIds:mIds,custIds:cIds,grid:{}};
    upSales(d=>{if(!d.custDeliverySessions)d.custDeliverySessions=[];d.custDeliverySessions.unshift(sess)});
    setActiveSession(sess.id);setShowNewSession(false);setSelModels({});setSelCusts({});showToast("✓ تم انشاء التسليم")};

  const saveCell=(sessId,orderId,custId,newQty)=>{
    /* V14.64: Check if orderId is a virtual group id (starts with "GRP:") */
    if(typeof orderId==="string"&&orderId.startsWith("GRP:")){
      const groupKey=orderId.substring(4);
      const group=aMods.find(g=>g.key===groupKey);
      if(!group){setCellError("مجموعة غير موجودة");return}
      /* Validate — rackSize must match across all sub-orders (safety) */
      const rackSize=group.rackSize||1;
      if(newQty>0&&newQty%rackSize!==0){setCellError("الكمية "+newQty+" مش من مضاعفات السيري ("+rackSize+") — جرب "+Math.round(newQty/rackSize)*rackSize);return}
      setCellError("");
      /* FIFO distribution: take from oldest sub-order first
         V15.73: Allow planning even when stock is exhausted — if sub-order not in stockModels,
         fall back to its group sub-order record (has id + stockQty) so the user's input is preserved.
         Previously this caused quantities to silently reset to 0 on edit. */
      let remaining=Math.max(0,newQty);
      const distribution={};/* orderId → qty to set */
      for(const so of group.subOrders){
        if(remaining<=0){distribution[so.id]=0;continue}
        const sm=stockModels.find(m=>m.id===so.id);
        /* V15.73: Compute available capacity — fallback to so.stockQty when not in stockModels */
        const sess=sessions.find(s=>s.id===sessId);
        const otherCellsPlan=Object.entries(sess?.grid||{}).filter(([k])=>{const[oid,cid]=k.split("_");return oid===so.id&&cid!==custId}).reduce((s,[_,v])=>s+(Number(v)||0),0);
        const subStock=sm?sm.avail:Math.max(0,(Number(so.stockQty)||0)-otherCellsPlan);
        const capacity=Math.max(0,subStock);
        const take=Math.min(remaining,capacity);
        distribution[so.id]=take;
        remaining-=take;
      }
      /* If still remaining after all sub-orders — put overflow in oldest sub-order (warn) */
      if(remaining>0){
        distribution[group.subOrders[0].id]=(distribution[group.subOrders[0].id]||0)+remaining;
        showToast("⚠️ الكمية ("+newQty+") أكبر من المتاح — تحذير فقط (مخطط)");
      }
      /* Apply all updates in one upSales call */
      upSales(d=>{const si=d.custDeliverySessions.findIndex(s=>s.id===sessId);if(si<0)return;if(!d.custDeliverySessions[si].grid)d.custDeliverySessions[si].grid={};
        Object.entries(distribution).forEach(([oid,q])=>{
          if(q>0)d.custDeliverySessions[si].grid[oid+"_"+custId]=q;
          else delete d.custDeliverySessions[si].grid[oid+"_"+custId];
        });
      });
      setEditCell(null);
      return;
    }
    /* LEGACY PATH — direct orderId (for single-order groups, kept for safety) */
    const rackSize=getRackSize(orderId);
    if(newQty>0&&newQty%rackSize!==0){setCellError("الكمية "+newQty+" مش من مضاعفات السيري ("+rackSize+") — جرب "+Math.round(newQty/rackSize)*rackSize);return}
    setCellError("");
    const o=orders.find(x=>x.id===orderId);if(!o)return;
    const sm=stockModels.find(m=>m.id===orderId);if(!sm)return;
    const availStock=sm.avail||0;
    /* Warn if total plan exceeds stock, but don't block — plan is not actual sale */
    if(newQty>availStock&&newQty>0){const sess=sessions.find(s=>s.id===sessId);const otherQ=Object.entries(sess?.grid||{}).filter(([k])=>{const[oid]=k.split("_");return oid===orderId&&k!==orderId+"_"+custId}).reduce((s,[_,v])=>s+(Number(v)||0),0);
      if(newQty+otherQ>availStock){showToast("⚠️ "+o.modelNo+": اجمالي الخطة ("+(newQty+otherQ)+") أكبر من المتاح ("+availStock+") — تحذير فقط")}}
    const qty=Math.max(0,newQty);
    /* Plan only — update grid, NO customerDeliveries */
    upSales(d=>{const si=d.custDeliverySessions.findIndex(s=>s.id===sessId);if(si<0)return;if(!d.custDeliverySessions[si].grid)d.custDeliverySessions[si].grid={};
      if(qty>0)d.custDeliverySessions[si].grid[orderId+"_"+custId]=qty;
      else delete d.custDeliverySessions[si].grid[orderId+"_"+custId]});
    setEditCell(null)};

  /* V19.70.22: helpers for the new always-on inputs in the distribution matrix.
     Reads/writes to localGrid (unsaved local state) instead of going through
     saveCell → upSales → Firestore round-trip per keystroke. The save-all
     button at the matrix footer commits the entire localGrid in one upSales. */

  /* Sum of qty across all sub-orders of a group, for one customer, READ FROM localGrid.
     Mirrors getGroupQty's logic but on the unsaved local state. */
  const getGroupQtyLocal = (m, custId) => {
    const oids = m.orderIds || [m.id];
    return oids.reduce((s, oid) => s + (Number(localGrid[oid + "_" + custId]) || 0), 0);
  };

  /* Set the qty for a (group, customer) cell in localGrid. For grouped models,
     distribute the qty across sub-orders FIFO based on each sub-order's stock
     (same algorithm as saveCell). For single-order groups, write directly.
     Marks dirty so the save button can light up + warn-on-close gate fires. */
  const setLocalCellQty = (m, custId, newQty) => {
    const qty = Math.max(0, Number(newQty) || 0);
    const oids = m.orderIds || [m.id];
    setLocalGrid(prev => {
      const next = { ...prev };
      if (oids.length === 1) {
        const k = oids[0] + "_" + custId;
        if (qty > 0) next[k] = qty;
        else delete next[k];
        return next;
      }
      /* Multi-sub-order group: FIFO distribute qty across sub-orders.
         Capacity per sub-order = sub_stock - other_customers_planned_in_local. */
      let remaining = qty;
      for (const oid of oids) {
        const sm = stockModels.find(x => x.id === oid);
        /* Other customers' planned qty for THIS sub-order, READ FROM localGrid (excluding this customer) */
        let otherPlan = 0;
        Object.entries(prev).forEach(([key, v]) => {
          const [subOid, subCust] = key.split("_");
          if (subOid === oid && subCust !== custId) otherPlan += Number(v) || 0;
        });
        const subStock = sm ? sm.stockQty : 0;/* total physical stock for this sub-order */
        const subSold = sm ? sm.custDel : 0;/* delivered already */
        const capacity = Math.max(0, subStock - subSold - otherPlan);
        const take = Math.min(remaining, capacity);
        const k = oid + "_" + custId;
        if (take > 0) next[k] = take;
        else delete next[k];
        remaining -= take;
        if (remaining <= 0) break;
      }
      /* Overflow — put extra in oldest sub-order so the user sees "X exceeds avail" warn */
      if (remaining > 0) {
        const oldest = oids[0];
        const k = oldest + "_" + custId;
        next[k] = (next[k] || 0) + remaining;
      }
      return next;
    });
    setLocalGridDirty(true);
  };

  /* Compute the available capacity for a (group, customer) cell — what's the max
     the user can enter before exceeding total stock for this group?
     V19.76.6: `subSold` (sm.custDel) counts ALL committed deliveries, INCLUDING
     ones that came from THIS session's plan. The plan cells are already represented
     in `otherPlan` (and the cell's own value), so subtracting subSold raw double-counts.
     User report: "ال 48 دخلوا و ال 48 خرجوا" — 48 distributed, 48 sold from those plans,
     yet the cells flagged "تخطى" because cap was computed as 0. Fix: add back the
     deliveries that came from THIS session, leaving only out-of-session sales subtracted.
       cap = subStock − (subSold − inSessionDelivered) − otherPlan
   */
  const availForGroupCell = (m, custId) => {
    const oids = m.orderIds || [m.id];
    let cap = 0;
    for (const oid of oids) {
      const sm = stockModels.find(x => x.id === oid);
      if (!sm) continue;
      const subStock = sm.stockQty;
      const subSold = sm.custDel;
      /* In-session deliveries: don't double-subtract, they're already in the plan cells. */
      let inSessionDelivered = 0;
      if (activeSess) {
        const o = orders.find(x => x.id === oid);
        if (o) {
          inSessionDelivered = (o.customerDeliveries || [])
            .filter(d => d.sessionId === activeSess.id)
            .reduce((s, d) => s + (Number(d.qty) || 0), 0);
        }
      }
      const outOfSessionSold = Math.max(0, subSold - inSessionDelivered);
      let otherPlan = 0;
      Object.entries(localGrid).forEach(([key, v]) => {
        const [subOid, subCust] = key.split("_");
        if (subOid === oid && subCust !== custId) otherPlan += Number(v) || 0;
      });
      cap += Math.max(0, subStock - outOfSessionSold - otherPlan);
    }
    return cap;
  };

  /* Commit the entire localGrid to Firestore in one upSales call. Replaces the
     session's grid wholesale — values that were in the old grid but cleared in
     localGrid get removed (we don't merge). Triggered by the footer save button.
     V21.9.190: also commits localCustDisc to session.custDisc so per-customer
     discount overrides persist across reloads / users. */
  const saveAllLocalGrid = (sessId) => {
    upSales(d => {
      const si = (d.custDeliverySessions || []).findIndex(s => s.id === sessId);
      if (si < 0) return;
      const sess = d.custDeliverySessions[si];
      /* Build a clean grid from localGrid: only positive entries */
      const cleaned = {};
      Object.entries(localGrid).forEach(([k, v]) => {
        const num = Number(v) || 0;
        if (num > 0) cleaned[k] = num;
      });
      sess.grid = cleaned;
      /* V21.9.190: persist per-customer discount overrides.
         Only store entries that are explicitly set (numeric, including 0).
         Empty / undefined entries are removed so the precedence chain falls
         back to customer.discount → 10. */
      const cleanedDisc = {};
      Object.entries(localCustDisc).forEach(([k, v]) => {
        if (v === "" || v == null) return;
        const num = Number(v);
        if (isNaN(num)) return;
        cleanedDisc[k] = Math.max(0, Math.min(100, num));
      });
      sess.custDisc = cleanedDisc;
    });
    setLocalGridDirty(false);
    setLocalCustDiscDirty(false);
    showToast("✓ تم حفظ كل التغييرات");
  };

  /* Same idea for the audit grid. We use upConfig (audits live on config doc). */
  const saveAllLocalAudGrid = (audId) => {
    upConfig(d => {
      const ai = (d.salesAudits || []).findIndex(a => a.id === audId);
      if (ai < 0) return;
      const cleaned = {};
      Object.entries(localAudGrid).forEach(([k, v]) => {
        const num = Number(v) || 0;
        if (num > 0) cleaned[k] = num;
      });
      d.salesAudits[ai].grid = cleaned;
    });
    setLocalAudGridDirty(false);
    showToast("✓ تم حفظ الجرد");
  };

  const delSession=(sessId)=>{const sess=sessions.find(s=>s.id===sessId);if(!sess)return;
    /* Check ACTUAL sales data - not just flags */
    const hasSales=orders.some(o=>(o.customerDeliveries||[]).some(d=>d.sessionId===sessId));
    if(hasSales){playBeep("error");showToast("⛔ لا يمكن حذف توزيعة بها حركات بيع فعلية — احذف حركات البيع أولاً");return}
    const affectedOrders=new Set();
    Object.entries(sess.grid||{}).forEach(([k])=>{const[orderId]=k.split("_");affectedOrders.add(orderId)});
    sess.modelIds.forEach(id=>affectedOrders.add(id));
    affectedOrders.forEach(orderId=>{updOrder(orderId,o=>{
      o.customerDeliveries=(o.customerDeliveries||[]).filter(d=>d.sessionId!==sessId)})});
    upSales(d=>{d.custDeliverySessions=(d.custDeliverySessions||[]).filter(s=>s.id!==sessId)});
    if(activeSession===sessId)setActiveSession(null);showToast("✓ تم الحذف")};

  /* V15.32: Group models by modelNo (same logic as aMods in the matrix popup).
     Returns array of groups: [{modelNo, modelDesc, orderIds:[], stockQty, isGrouped}] */
  const groupSessionModels=(sess)=>{
    const raw=sess.modelIds.map(id=>{const sm=stockModels.find(m=>m.id===id);const o=orders.find(x=>x.id===id);return sm||(o?{id,modelNo:o.modelNo,modelDesc:o.modelDesc||"",stockQty:0}:null)}).filter(Boolean);
    const groups={};
    raw.forEach(m=>{
      const o=orders.find(x=>x.id===m.id);if(!o)return;
      const key=o.modelNo||m.id;
      if(!groups[key])groups[key]={key,modelNo:o.modelNo,modelDesc:o.modelDesc||m.modelDesc||"",orderIds:[],stockQty:0,isGrouped:false};
      groups[key].orderIds.push(m.id);
      groups[key].stockQty+=(Number(m.stockQty)||0);
    });
    return Object.values(groups).map(g=>({...g,id:"GRP:"+g.key,isGrouped:g.orderIds.length>1}));
  };
  /* V15.32: Get merged quantity for a grouped model + customer (sums across sub-orders) */
  const getGroupQtyForPrint=(group,custId,grid)=>{
    return group.orderIds.reduce((s,oid)=>s+(Number(grid[oid+"_"+custId])||0),0);
  };

  /* V21.21.1: «تأكيد البيع» — يولّد أمر بيع (مرآة مقفولة) لكل عميل في التوزيعة.
     التوزيعة تفضل مصدر الرصيد والمخزون؛ الأمر مستند عرض/فوترة فقط. idempotent. */
  const confirmSessionSalesOrders=async(sessId)=>{
    const sess=sessions.find(s=>s.id===sessId);if(!sess)return;
    const yes=await ask("تأكيد البيع وإنشاء أوامر بيع","هنولّد أمر بيع لكل عميل في التوزيعة دي (مرآة مستندية — التوزيعة تفضل مصدر الرصيد والمخزون، فمفيش حساب مزدوج). إعادة التأكيد بتزامن الأوامر غير المفوترة مع التوزيعة. تكمل؟");
    if(!yes)return;
    /* V21.21.13: الأوامر في subcollection الموسم + salesOrders في config → بنقرأ
       من البيانات الحيّة (orders/customers/session) ونكتب عبر upConfig. */
    let res;await upConfig(d=>{res=generateSalesOrdersFromSessionMutator(d,sessId,userName,{orders,customers,session:sess})});
    if(res&&res.ok){const parts=[];if(res.created)parts.push("اتعمل "+res.created+" أمر بيع");if(res.updated)parts.push("اتزامن "+res.updated);if(res.skipped)parts.push("متخطّي "+res.skipped+" (مقفول)");showToast("✅ "+(parts.join(" · ")||"تم"));}
    else showToast("⛔ "+((res&&res.error)||"فشل توليد أوامر البيع"));
  };

  const printSession=(sessId)=>{const sess=sessions.find(s=>s.id===sessId);if(!sess)return;
    /* V15.32: Use grouped models so duplicate modelNo columns are merged (matches matrix popup) */
    const mods=groupSessionModels(sess);
    const custs=sess.custIds.map(id=>customers.find(c=>c.id===id)).filter(Boolean);
    const g=sess.grid||{};
    let h="<h2>🚚 تسليم عملاء — "+sess.date+"</h2><table><thead><tr><th>المكتب / العميل</th>";
    mods.forEach(m=>{h+="<th style='text-align:center'>"+m.modelNo+(m.isGrouped?" <span style='font-size:10px;color:#8B5CF6'>⧉"+m.orderIds.length+"</span>":"")+"</th>"});
    h+="<th style='background:#0284C7;color:#fff;text-align:center'>اجمالي</th></tr></thead><tbody>";
    custs.forEach(c=>{let total=0;h+="<tr><td><b>"+c.name+"</b></td>";
      mods.forEach(m=>{const q=getGroupQtyForPrint(m,c.id,g);total+=q;h+="<td style='text-align:center;"+(q>0?"font-weight:800;color:#0284C7":"color:#ccc")+"'>"+(q||"—")+"</td>"});
      h+="<td style='text-align:center;font-weight:800;background:#F0F9FF;color:#0284C7'>"+total+"</td></tr>"});
    let gt=0;h+="<tr style='background:#F1F5F9;font-weight:800'><td>الاجمالي</td>";
    mods.forEach(m=>{const mt=custs.reduce((s,c)=>s+getGroupQtyForPrint(m,c.id,g),0);gt+=mt;h+="<td style='text-align:center;color:#059669'>"+mt+"</td>"});
    h+="<td style='text-align:center;background:#059669;color:#fff;font-size:14px'>"+gt+"</td></tr></tbody></table>";
    h+="<div class='sig'><div class='sig-box'>مسؤول التسليم</div><div class='sig-box'>المستلم</div></div>";
    printPage("تسليم عملاء — "+sess.date,h,{factoryName:config.factoryName,logo:config.logo})};

  const custTotalsMap=useMemo(()=>{const m=new Map();(config.customers||[]).forEach(c=>{let t=0;orders.forEach(o=>{const d=(o.customerDeliveries||[]).filter(x=>x.custId===c.id).reduce((s,x)=>s+(Number(x.qty)||0),0);const r=(o.customerReturns||[]).filter(x=>x.custId===c.id).reduce((s,x)=>s+(Number(x.qty)||0),0);t+=d-r});m.set(c.id,t)});return m},[orders,config.customers]);
  /* V18.7: Per-customer delivered/returned breakdown — used for rating in customer picker */
  const custDelRetMap=useMemo(()=>{const m=new Map();(config.customers||[]).forEach(c=>{let del=0,ret=0;orders.forEach(o=>{del+=(o.customerDeliveries||[]).filter(x=>x.custId===c.id).reduce((s,x)=>s+(Number(x.qty)||0),0);ret+=(o.customerReturns||[]).filter(x=>x.custId===c.id).reduce((s,x)=>s+(Number(x.qty)||0),0)});m.set(c.id,{del,ret})});return m},[orders,config.customers]);
  const getDeliveredForSess=(custId,sessId,orderId)=>{const o=orders.find(x=>x.id===orderId);if(!o)return 0;return(o.customerDeliveries||[]).filter(d=>d.custId===custId&&d.sessionId===sessId).reduce((s,d)=>s+(Number(d.qty)||0),0)};
  const getRemainingForSess=(custId,sessId,orderId,grid)=>{const planned=Number(grid[orderId+"_"+custId])||0;const delivered=getDeliveredForSess(custId,sessId,orderId);return Math.max(0,planned-delivered)};
  const getCustTotal=(custId)=>custTotalsMap.get(custId)||orders.reduce((s,o)=>{const del=(o.customerDeliveries||[]).filter(d=>d.custId===custId).reduce((ss,d)=>ss+(Number(d.qty)||0),0);const ret=(o.customerReturns||[]).filter(r=>r.custId===custId).reduce((ss,r)=>ss+(Number(r.qty)||0),0);return s+del-ret},0);
  const sortedSessions=useMemo(()=>[...sessions].sort((a,b)=>(b.createdAt||b.date||"").localeCompare(a.createdAt||a.date||"")),[sessions]);
  const activeSess=sessions.find(s=>s.id===activeSession);
  /* V14.64: Group models by modelNo — FIFO (oldest order first). Each group has virtual id and sub-orders sorted oldest→newest. */
  const aModsRaw=activeSess?activeSess.modelIds.map(id=>{const sm=stockModels.find(m=>m.id===id);const o=orders.find(x=>x.id===id);if(!o)return null;const sd=(o.deliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);return sm||{id,modelNo:o.modelNo,modelDesc:o.modelDesc,stockQty:sd,seriesQty:getConfirmedSeriesStock(o),brokenQty:getConfirmedBrokenStock(o),rackSize:getRackSize(id)}}).filter(Boolean):[];
  /* Build grouped view — one entry per modelNo, with subOrders sorted by createdAt (FIFO) */
  const aMods=useMemo(()=>{
    if(!activeSess)return[];
    const groups={};
    aModsRaw.forEach(m=>{
      const o=orders.find(x=>x.id===m.id);if(!o)return;
      const key=o.modelNo||m.id;
      if(!groups[key])groups[key]={key,modelNo:o.modelNo,modelDesc:o.modelDesc||m.modelDesc,rackSize:m.rackSize,subOrders:[]};
      /* V15.37: Track sellPrice per sub-order so the group can expose FIFO-aggregate price + mixed flag
         V18.21: Track seriesQty/brokenQty per sub-order */
      groups[key].subOrders.push({id:m.id,stockQty:m.stockQty,seriesQty:m.seriesQty||0,brokenQty:m.brokenQty||0,createdAt:o.createdAt||o.id,modelDesc:o.modelDesc||m.modelDesc,sellPrice:Number(o.sellPrice)||0});
    });
    /* Return array with subOrders sorted FIFO (oldest first), totals aggregated */
    return Object.values(groups).map(g=>{
      g.subOrders.sort((a,b)=>(a.createdAt||"").localeCompare(b.createdAt||""));
      g.id="GRP:"+g.key;/* Virtual grouped id */
      g.orderIds=g.subOrders.map(s=>s.id);
      g.stockQty=g.subOrders.reduce((s,x)=>s+(Number(x.stockQty)||0),0);
      /* V18.21: Aggregate series/broken across sub-orders */
      g.seriesQty=g.subOrders.reduce((s,x)=>s+(Number(x.seriesQty)||0),0);
      g.brokenQty=g.subOrders.reduce((s,x)=>s+(Number(x.brokenQty)||0),0);
      g.isGrouped=g.subOrders.length>1;
      /* V15.37: Expose sellPrice (FIFO — oldest order's price) + detect mixed prices */
      g.sellPrice=g.subOrders[0]?.sellPrice||0;
      const nonZeroPrices=g.subOrders.map(s=>s.sellPrice).filter(p=>p>0);
      g.sellPriceMixed=nonZeroPrices.length>1&&!nonZeroPrices.every(p=>p===nonZeroPrices[0]);
      return g;
    });
  },[activeSess,aModsRaw,orders]);
  const aCusts=activeSess?activeSess.custIds.map(id=>customers.find(c=>c.id===id)).filter(Boolean):[];
  const fMods=gridModelF.trim()?aMods.filter(m=>(m.modelNo||"").includes(gridModelF)||(m.modelDesc||"").includes(gridModelF)):aMods;
  const fCusts=gridCustF.trim()?aCusts.filter(c=>(c.name||"").includes(gridCustF)||(c.phone||"").includes(gridCustF)):aCusts;
  const aGrid=activeSess?.grid||{};
  /* V14.64: Helper to get merged quantity for a group + customer (sum of all sub-orders) */
  const getGroupQty=(group,custId)=>{
    if(!group.isGrouped)return Number(aGrid[group.orderIds[0]+"_"+custId])||0;
    return group.orderIds.reduce((s,oid)=>s+(Number(aGrid[oid+"_"+custId])||0),0);
  };
  /* V14.64: Helper to build breakdown string (tooltip) */
  const getGroupBreakdown=(group,custId)=>{
    if(!group.isGrouped)return"";
    const parts=[];
    group.subOrders.forEach((so,i)=>{
      const q=Number(aGrid[so.id+"_"+custId])||0;
      if(q>0){
        const dt=so.createdAt?(so.createdAt.split("T")[0]||so.createdAt.substring(0,10)):"—";
        parts.push("تشغيل "+(i+1)+" ("+dt+"): "+q+" قطعة");
      }
    });
    return parts.length>0?parts.join("\n"):"لم يتم التوزيع بعد";
  };
  const isSessClosed=activeSess?.status==="تم التسليم";
  const sessCanEdit=canEdit&&!isSessClosed;/* Allow editing after sales — stock validation handles limits. Block only if closed */
  const closeMatrix=async(forceKeep)=>{if(!activeSess){setActiveSession(null);return}
    /* V19.70.22: auto-save unsaved edits on close. The user explicitly clicks save
       at the footer when they're done. Closing via ✕ or backdrop also commits —
       no silent data loss. If they really want to discard, they can use the
       discard button at the footer (separate from close). */
    if (localGridDirty && !forceKeep) {
      saveAllLocalGrid(activeSess.id);
    }
    setActiveSession(null);setCellError("")};

  /* Session status */
  const SESS_STATUSES=["جاري التجهيز","تم الشحن","تم التسليم"];
  const updateSessStatus=(sessId,status)=>{upSales(d=>{const si=(d.custDeliverySessions||[]).findIndex(s=>s.id===sessId);if(si>=0)d.custDeliverySessions[si].status=status})};

  /* Returns
     V21.9.56 (Sales Audit L1): block over-returns. Pre-V21.9.56 a user
     could register more returned qty than was ever delivered to this customer
     (e.g., delivered 10 → return 20). This corrupts the order's net
     delivery count + customer balance (negative net pieces).

     Now: sum customerDeliveries.qty (this custId) − sum prior customerReturns.qty
     (this custId) to get the net-deliverable headroom, then block if retQty > that.
     The check inspects the merged data (cross-session) so it respects all
     historical deliveries for the same custId on the same order. */
  const doReturn=()=>{
    if(!returnPopup||retQty<=0)return;
    const{orderId,custId,custName,sessId}=returnPopup;
    const order = (data.orders||[]).find(o => o.id === orderId);
    if(order){
      /* V21.9.85 (CustDeliver audit Bug #2): SESSION-aware return validation.
         Pre-V21.9.85 the check summed deliveries across ALL sessions for the
         customer → a return entered in Session B could "borrow" headroom
         from Session A's deliveries → session-level accounting became
         ambiguous (return attributed to a session that didn't deliver).
         Now: prefer the session-specific headroom when sessId is known;
         fall back to the legacy cross-session check only if no session
         deliveries are found (orphan return — preserves backward compat). */
      const dels = (order.customerDeliveries||[]).filter(d => d.custId === custId);
      const rets = (order.customerReturns||[]).filter(r => r.custId === custId);
      const sessDels = sessId ? dels.filter(d => d.sessionId === sessId) : [];
      const sessRets = sessId ? rets.filter(r => r.sessId === sessId) : [];
      const sessDelQty = sessDels.reduce((s,d) => s + (Number(d.qty)||0), 0);
      const sessRetQty = sessRets.reduce((s,r) => s + (Number(r.qty)||0), 0);
      const totalDel = dels.reduce((s,d) => s + (Number(d.qty)||0), 0);
      const totalRet = rets.reduce((s,r) => s + (Number(r.qty)||0), 0);
      /* Use session headroom when available; else fall back to total. */
      const sessionMax = sessDelQty - sessRetQty;
      const totalMax = totalDel - totalRet;
      const useSession = sessId && sessDelQty > 0;
      const maxReturnable = useSession ? sessionMax : totalMax;
      if(retQty > maxReturnable){
        const scope = useSession ? "في هذه الجلسة" : "إجمالي";
        showToast("⛔ لا يمكن إرجاع "+retQty+" قطعة. المتاح "+scope+": "+maxReturnable);
        return;
      }
    }
    updOrder(orderId,o=>{
      if(!o.customerReturns)o.customerReturns=[];
      /* V21.9.192: stamp discPct from the matching sale entry so the credit
         note reflects the original invoice's discount, not the customer's
         current discount (which may have changed since the sale). */
      const retEntry={custId,custName,qty:retQty,note:retNote,date:cairoDateStr(),sessId,createdBy:userName||""};
      const matchedDisc=findMatchingSaleDiscPct(o,custId,sessId);
      if(matchedDisc!==undefined)retEntry.discPct=matchedDisc;
      o.customerReturns.push(retEntry);
    });
    setReturnPopup(null);setRetQty(0);setRetNote("");
    showToast("✓ تم تسجيل مرتجع "+retQty+" قطعة");
  };

  /* Sell price */
  const setSellPrice=(orderId,price)=>{updOrder(orderId,o=>{o.sellPrice=Number(price)||0})};
  /* V15.37: Save draft sell prices to ALL sub-orders in the matching groups (syncs back to all linked quick sales) */
  const saveSellPrices=async()=>{
    const entries=Object.entries(sellPriceDrafts).filter(([,v])=>v!==""&&v!==null&&v!==undefined);
    if(entries.length===0){showToast("⚠️ لا توجد تعديلات للحفظ");return}
    let orderCount=0,modelCount=0;
    for(const[key,price] of entries){
      const p=Number(price);if(isNaN(p)||p<0)continue;
      const m=aMods.find(mm=>mm.key===key);if(!m)continue;
      for(const oid of m.orderIds){
        await updOrder(oid,o=>{o.sellPrice=p});
        orderCount++;
      }
      modelCount++;
    }
    setSellPriceDrafts({});
    showToast("✅ تم حفظ أسعار "+modelCount+" موديل ("+orderCount+" تشغيل) — تم مزامنة البيع السريع");
  };
  const cancelSellPriceDrafts=()=>{setSellPriceDrafts({})};

  /* Period report */
  /* Floor stock report - قطع على الأرض */
  const printFloorStock=()=>{const rows=[];
    orders.forEach(o=>{const t=calcOrder(o);if(t.cutQty===0)return;const pieces=o.orderPieces||[];const wds=o.workshopDeliveries||[];
      if(pieces.length>0){const linkedPieces=new Set();FKEYS.forEach(k=>{if(gf(o,k))(o["fabricPieces"+k]||[]).forEach(p=>linkedPieces.add(p))});
        pieces.forEach(p=>{const isCut=linkedPieces.has(p);if(!isCut)return;const del=wds.filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0);const floor=t.cutQty-del;
          if(floor>0){const days=Math.floor((Date.now()-new Date(o.date))/(86400000));rows.push({modelNo:o.modelNo,desc:o.modelDesc,piece:p,cut:t.cutQty,del,floor,days})}})}
      else{const del=wds.reduce((s,wd)=>s+(Number(wd.qty)||0),0);const floor=t.cutQty-del;
        if(floor>0){const days=Math.floor((Date.now()-new Date(o.date))/(86400000));rows.push({modelNo:o.modelNo,desc:o.modelDesc,piece:"عام",cut:t.cutQty,del,floor,days})}}});
    if(rows.length===0){showToast("✅ لا توجد قطع على الأرض");return}
    rows.sort((a,b)=>b.floor-a.floor);const totalFloor=rows.reduce((s,r)=>s+r.floor,0);
    let h="<h2 style='text-align:center'>📋 قطع على الأرض — جاهزة للتسليم</h2><div style='text-align:center;margin-bottom:12px;font-size:16px;font-weight:800;color:#F59E0B'>"+totalFloor+" قطعة على الأرض</div>";
    h+="<table><thead><tr><th>الموديل</th><th>الوصف</th><th>القطعة</th><th>القص</th><th>تسليم</th><th>على الأرض</th><th>الأيام</th></tr></thead><tbody>";
    rows.forEach(r=>{const warn=r.days>7;h+="<tr style='background:"+(warn?"#FEF2F2":"transparent")+"'><td style='font-weight:800'>"+r.modelNo+"</td><td>"+r.desc+"</td><td>"+r.piece+"</td><td style='text-align:center'>"+r.cut+"</td><td style='text-align:center'>"+r.del+"</td><td style='text-align:center;font-weight:800;color:#F59E0B'>"+r.floor+(warn?" ⚠️":"")+"</td><td style='text-align:center;color:"+(warn?"#EF4444":"#666")+"'>"+r.days+"</td></tr>"});
    h+="<tr style='background:#F59E0B10;font-weight:800'><td colspan='5'>الاجمالي</td><td style='text-align:center;color:#F59E0B;font-size:16px'>"+totalFloor+"</td><td></td></tr></tbody></table>";
    h+="<div class='sig'><div class='sig-box'>مسؤول التشغيل</div><div class='sig-box'>المدير</div></div>";printPage("قطع على الأرض",h,{factoryName:config.factoryName,logo:config.logo})};

  /* Production line report - خط الانتاج (per garment piece) */
  const printProductionLine=()=>{const rows=[];
    orders.forEach(o=>{const t=calcOrder(o);if(t.cutQty===0)return;const wds=o.workshopDeliveries||[];
      const pieces=o.orderPieces||[];const hasPieces=pieces.length>1;
      if(hasPieces){
        pieces.forEach(p=>{
          const delToWs=wds.filter(wd=>(wd.garmentType||"عام")===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0);
          const rcvFromWs=wds.filter(wd=>(wd.garmentType||"عام")===p).reduce((s,wd)=>(wd.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0)+s,0);
          const wsBalance=delToWs-rcvFromWs;
          rows.push({modelNo:o.modelNo,desc:o.modelDesc,piece:p,cut:t.cutQty,delWs:delToWs,rcvWs:rcvFromWs,finishing:0,stock:0,wsBalance:Math.max(0,wsBalance)})});
        const stockDel=getConfirmedStock(o);const totalRcv=wds.reduce((s,wd)=>(wd.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0)+s,0);
        rows[rows.length-1].stock=stockDel;rows[rows.length-1].finishing=Math.max(0,totalRcv-stockDel);
      }else{
        const delToWs=wds.reduce((s,wd)=>s+(Number(wd.qty)||0),0);const rcvFromWs=wds.reduce((s,wd)=>(wd.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0)+s,0);
        const stockDel=getConfirmedStock(o);const finishing=rcvFromWs-stockDel;const wsBalance=delToWs-rcvFromWs;
        rows.push({modelNo:o.modelNo,desc:o.modelDesc,piece:"—",cut:t.cutQty,delWs:delToWs,rcvWs:rcvFromWs,finishing:Math.max(0,finishing),stock:stockDel,wsBalance:Math.max(0,wsBalance)})}});
    if(rows.length===0){showToast("⚠️ لا توجد بيانات");return}
    const totals=rows.reduce((s,r)=>({cut:s.cut+r.cut,delWs:s.delWs+r.delWs,rcvWs:s.rcvWs+r.rcvWs,finishing:s.finishing+r.finishing,stock:s.stock+r.stock,wsBalance:s.wsBalance+r.wsBalance}),{cut:0,delWs:0,rcvWs:0,finishing:0,stock:0,wsBalance:0});
    let h="<h2 style='text-align:center'>📊 تقرير خط الانتاج</h2>";
    h+="<table><thead><tr><th>الموديل</th><th>الوصف</th><th>القطعة</th><th>القص</th><th>تسليم ورش</th><th>استلام ورش</th><th>رصيد ورش</th><th>عند التشطيب</th><th>مخزن جاهز</th></tr></thead><tbody>";
    rows.forEach(r=>{h+="<tr><td style='font-weight:800'>"+r.modelNo+"</td><td>"+r.desc+"</td><td style='color:#8B5CF6;font-weight:600'>"+r.piece+"</td><td style='text-align:center'>"+r.cut+"</td><td style='text-align:center'>"+r.delWs+"</td><td style='text-align:center'>"+r.rcvWs+"</td><td style='text-align:center;color:"+(r.wsBalance>0?"#EF4444":"#10B981")+";font-weight:700'>"+(r.wsBalance||"✅")+"</td><td style='text-align:center;color:"+(r.finishing>0?"#F59E0B":"#666")+";font-weight:700'>"+(r.finishing||"—")+"</td><td style='text-align:center;font-weight:800;color:#0EA5E9'>"+r.stock+"</td></tr>"});
    h+="<tr style='background:#F1F5F9;font-weight:800'><td colspan='3'>الاجمالي</td><td style='text-align:center'>"+totals.cut+"</td><td style='text-align:center'>"+totals.delWs+"</td><td style='text-align:center'>"+totals.rcvWs+"</td><td style='text-align:center;color:#EF4444'>"+totals.wsBalance+"</td><td style='text-align:center;color:#F59E0B'>"+totals.finishing+"</td><td style='text-align:center;color:#0EA5E9;font-size:14px'>"+totals.stock+"</td></tr></tbody></table>";
    h+="<div class='sig'><div class='sig-box'>مسؤول الانتاج</div><div class='sig-box'>المدير</div></div>";printPage("خط الانتاج",h,{factoryName:config.factoryName,logo:config.logo})};

  const printSalesReport=()=>{const{from,to}=reportRange;const type=rptType;
    let totalDel=0,totalRet=0,totalVal=0;const custMap={};const modelMap={};
    orders.forEach(o=>{const sp=Number(o.sellPrice)||0;const mn=o.modelNo||"—";
      (o.customerDeliveries||[]).forEach(d=>{if(from&&d.date<from)return;if(to&&d.date>to)return;
        if(type==="customer"&&rptCust&&d.custId!==rptCust)return;if(type==="model"&&rptModel&&o.id!==rptModel)return;
        const q=Number(d.qty)||0;totalDel+=q;const cn=d.custName||"—";
        /* V15.45: Use per-delivery price when available (discounted sales) */
        const effPrice=Number(d.price)||sp;
        if(!custMap[cn])custMap[cn]={del:0,ret:0,val:0,models:{}};custMap[cn].del+=q;custMap[cn].val+=q*effPrice;if(!custMap[cn].models[mn])custMap[cn].models[mn]={del:0,ret:0,price:sp};custMap[cn].models[mn].del+=q;
        if(!modelMap[mn])modelMap[mn]={del:0,ret:0,price:sp};modelMap[mn].del+=q});
      (o.customerReturns||[]).forEach(r=>{if(from&&r.date<from)return;if(to&&r.date>to)return;
        if(type==="customer"&&rptCust&&r.custId!==rptCust)return;if(type==="model"&&rptModel&&o.id!==rptModel)return;
        const q=Number(r.qty)||0;totalRet+=q;const cn=r.custName||"—";
        if(!custMap[cn])custMap[cn]={del:0,ret:0,val:0,models:{}};custMap[cn].ret+=q;custMap[cn].val-=q*sp;if(!custMap[cn].models[mn])custMap[cn].models[mn]={del:0,ret:0,price:sp};custMap[cn].models[mn].ret+=q;
        if(!modelMap[mn])modelMap[mn]={del:0,ret:0,price:sp};modelMap[mn].ret+=q})});
    const totalNet=totalDel-totalRet;Object.values(modelMap).forEach(m=>{const net=m.del-m.ret;totalVal+=net*m.price});
    if(totalDel===0&&totalRet===0){showToast("⚠️ لا توجد بيانات");return}
    const titleParts=["📊 تقرير المبيعات"];
    if(type==="customer"&&rptCust){const c=customers.find(x=>x.id===rptCust);if(c)titleParts.push("عميل: "+c.name)}
    if(type==="model"&&rptModel){const m=stockModels.find(x=>x.id===rptModel);if(m)titleParts.push("موديل: "+m.modelNo)}
    if(from||to)titleParts.push((from||"...")+" → "+(to||"..."));
    let h="<h2 style='text-align:center'>"+titleParts.join(" — ")+"</h2>";
    h+="<table style='margin:0 auto 16px'><tr><th>اجمالي التسليم</th><td><b style='color:#0EA5E9'>"+fmt(totalDel)+"</b></td><th>المرتجع</th><td><b style='color:#EF4444'>"+fmt(totalRet)+"</b></td></tr>";
    h+="<tr><th>الصافي</th><td><b style='color:#10B981;font-size:14px'>"+fmt(totalNet)+"</b></td><th>القيمة الصافية</th><td><b style='color:#8B5CF6;font-size:14px'>"+fmt(r2(totalVal))+" ج.م</b></td></tr></table>";
    if(type==="model"||type==="all"){
      h+="<h3>حسب الموديل</h3><table><thead><tr><th>الموديل</th><th>سعر</th><th>تسليم</th><th>مرتجع</th><th>صافي</th><th>القيمة</th></tr></thead><tbody>";
      Object.entries(modelMap).sort((a,b)=>(b[1].del-b[1].ret)-(a[1].del-a[1].ret)).forEach(([n,d])=>{const net=d.del-d.ret;h+="<tr><td style='font-weight:800'>"+n+"</td><td>"+d.price+"</td><td style='text-align:center'>"+fmt(d.del)+"</td><td style='text-align:center;color:#EF4444'>"+(d.ret||"—")+"</td><td style='text-align:center;font-weight:800'>"+fmt(net)+"</td><td style='text-align:center;font-weight:800;color:#0284C7'>"+fmt(r2(net*d.price))+"</td></tr>"});
      h+="<tr style='background:#F1F5F9;font-weight:800'><td colspan='2'>الاجمالي</td><td style='text-align:center'>"+fmt(totalDel)+"</td><td style='text-align:center;color:#EF4444'>"+fmt(totalRet)+"</td><td style='text-align:center;font-size:14px'>"+fmt(totalNet)+"</td><td style='text-align:center;color:#8B5CF6;font-size:14px'>"+fmt(r2(totalVal))+" ج.م</td></tr></tbody></table>"}
    if(type==="customer"||type==="all"){
      if(type==="customer"&&rptCust){/* Specific customer — show model breakdown */
        const cn=Object.keys(custMap)[0];const cd=custMap[cn];if(cd){h+="<h3>تفصيل مبيعات — "+cn+"</h3><table><thead><tr><th>الموديل</th><th>سعر</th><th>تسليم</th><th>مرتجع</th><th>صافي</th><th>القيمة</th></tr></thead><tbody>";
          Object.entries(cd.models).sort((a,b)=>(b[1].del-b[1].ret)-(a[1].del-a[1].ret)).forEach(([mn,d])=>{const net=d.del-d.ret;h+="<tr><td style='font-weight:800'>"+mn+"</td><td>"+d.price+"</td><td style='text-align:center'>"+d.del+"</td><td style='text-align:center;color:#EF4444'>"+(d.ret||"—")+"</td><td style='text-align:center;font-weight:800'>"+net+"</td><td style='text-align:center;font-weight:700;color:#8B5CF6'>"+fmt(r2(net*d.price))+"</td></tr>"});
          const cNet=cd.del-cd.ret;h+="<tr style='background:#F1F5F9;font-weight:800'><td colspan='2'>الاجمالي</td><td style='text-align:center'>"+fmt(cd.del)+"</td><td style='text-align:center;color:#EF4444'>"+fmt(cd.ret)+"</td><td style='text-align:center;font-size:14px'>"+fmt(cNet)+"</td><td style='text-align:center;color:#8B5CF6;font-size:14px'>"+fmt(r2(cd.val))+" ج.م</td></tr></tbody></table>"}
      }else{/* All customers — show each customer total only */
        h+="<h3>حسب العميل</h3><table><thead><tr><th>العميل</th><th>تسليم</th><th>مرتجع</th><th>صافي</th><th>القيمة</th></tr></thead><tbody>";
        Object.entries(custMap).sort((a,b)=>(b[1].del-b[1].ret)-(a[1].del-a[1].ret)).forEach(([n,d])=>{const net=d.del-d.ret;h+="<tr><td style='font-weight:700'>"+n+"</td><td style='text-align:center'>"+fmt(d.del)+"</td><td style='text-align:center;color:#EF4444'>"+(d.ret||"—")+"</td><td style='text-align:center;font-weight:800'>"+fmt(net)+"</td><td style='text-align:center;font-weight:700;color:#8B5CF6'>"+fmt(r2(d.val))+" ج.م</td></tr>"});
        h+="<tr style='background:#F1F5F9;font-weight:800'><td>الاجمالي</td><td style='text-align:center'>"+fmt(totalDel)+"</td><td style='text-align:center;color:#EF4444'>"+fmt(totalRet)+"</td><td style='text-align:center;font-size:14px'>"+fmt(totalNet)+"</td><td style='text-align:center;color:#8B5CF6;font-size:14px'>"+fmt(r2(totalVal))+" ج.م</td></tr></tbody></table>"}}
    h+="<div class='sig'><div class='sig-box'>مسؤول المبيعات</div><div class='sig-box'>المدير</div></div>";
    printPage(titleParts.join(" — "),h,{factoryName:config.factoryName,logo:config.logo});setShowReport(false)};

  /* Shipping label */
  const printShippingLabel=async(cust,sessDate,items,total,shipN)=>{
    const pw=openPrintWindow();if(!pw){tell("المتصفح يمنع الطباعة","فعّل النوافذ المنبثقة وحاول مرة أخرى",{danger:true});return}
    let pages="";for(let i=1;i<=shipN;i++){
      pages+="<div class='pg'><div class='from'><b>CLARK</b></div><div class='to'><div class='tn'>"+cust.name+"</div><div class='tp'>"+ltrPhone(cust.phone||"")+"</div>"+(cust.address?"<div class='ta'>"+cust.address+"</div>":"")+"</div>"
      +"<div class='dd'>"+sessDate+"</div>"
      +"<table><thead><tr><th>الموديل</th><th>الوصف</th><th>الكمية</th></tr></thead><tbody>";
      items.forEach(it=>{if(it.qty>0)pages+="<tr><td class='mn'>"+it.no+"</td><td class='ds'>"+(it.desc||"")+"</td><td class='qt'>"+it.qty+"</td></tr>"});
      pages+="<tr class='tt'><td colspan='2'>الاجمالي</td><td class='qt'>"+total+"</td></tr></tbody></table>"
      +"<div class='bb'><div class='sl'>عدد الشحنات</div><div class='sn'>"+i+"/"+shipN+"</div></div>"
      +"</div>"+(i<shipN?"<div style='page-break-after:always'></div>":"")
    }
    pw.document.write("<!DOCTYPE html><html dir='rtl'><head><meta charset='utf-8'/><link href='https://fonts.googleapis.com/css2?family=Cairo:wght@600;800&display=swap' rel='stylesheet'/><style>"
    +"@page{size:10cm 15cm;margin:0}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Cairo',sans-serif;color:#000}"
    +".pg{width:10cm;height:15cm;padding:4mm;display:flex;flex-direction:column;border:1px dashed #ccc}"
    +".from{text-align:center;font-size:14pt;font-weight:900;padding:2mm;border-bottom:2px solid #000;margin-bottom:2mm;letter-spacing:3px;color:#000}"
    +".to{text-align:center;padding:3mm;border:3px solid #000;border-radius:8px;margin-bottom:2mm;color:#000}"
    +".tn{font-size:16pt;font-weight:800;color:#000}.tp{font-size:10pt;color:#000}.ta{font-size:8pt;color:#000}"
    +".dd{text-align:center;font-size:9pt;color:#000;margin-bottom:2mm}"
    +"table{width:100%;border-collapse:collapse;margin:2mm 0}th{padding:1.5mm 2mm;border:1px solid #000;font-weight:800;font-size:9pt;background:#f0f0f0;color:#000}td{padding:1.5mm 2mm;border:1px solid #000;font-size:9pt;color:#000}"
    +".mn{font-weight:800;font-size:10pt}.ds{font-size:8pt;color:#000}.qt{text-align:center;font-weight:800;font-size:11pt;color:#000}"
    +".tt td{background:#eee;font-weight:800;font-size:11pt;color:#000}"
    +".bb{margin:auto 0;padding:3mm 0;text-align:center}"
    +".sl{font-size:9pt;font-weight:700;color:#000;margin-bottom:1mm}"
    +".sn{font-size:28pt;font-weight:800;border:3px solid #000;border-radius:8px;padding:2mm 8mm;display:inline-block;color:#000}"
    +".pbar{position:sticky;top:0;background:#fff;padding:4px;display:none;justify-content:center;gap:6px;border-bottom:2px solid #ccc}"
    +".pbar button{padding:5px 14px;border-radius:6px;border:1px solid #000;cursor:pointer;font-family:'Cairo';font-size:11px;font-weight:700;background:#fff}.pbar .pr{background:#000;color:#fff}"
    +"@media(max-width:1024px){.pbar{display:flex}}@media print{.pbar{display:none}}"
    +"</style></head><body><div class='pbar'><button onclick='window.close()'>↩</button><button class='pr' onclick='window.print()'>🖨</button></div>"+pages+"</body></html>");
    pw.document.close();if(window.innerWidth>1024)setTimeout(()=>{pw.focus();pw.print()},500)};

  /* Customer QR */
  const showCustQR=async(c)=>{try{const QR=await loadQR();if(QR){const src=await QR.toDataURL(window.location.origin+"?cust="+encodeURIComponent(c.name),{width:300,margin:2});setCustQR({name:c.name,phone:c.phone,src})}}catch(e){}};

  /* ── Sales Audit (جرد المبيعات) ── */
  const audits=config.salesAudits||[];
  const sortedAudits=[...audits].sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""));
  /* Models that have been delivered to customers */
  const auditModels=stockModels.filter(m=>m.custDel>0);
  /* Customers that received deliveries */
  const auditCusts=customers.filter(c=>getCustTotal(c.id)>0);
  const activeAud=audits.find(a=>a.id===activeAudit);
  const aAudGrid=activeAud?.grid||{};

  const createAudit=()=>{if(!auditDate){showToast("⚠️ اختر تاريخ الجرد");return}
    const selIds=Object.entries(auditSelCusts).filter(([,v])=>v).map(([k])=>k);if(selIds.length===0){showToast("⚠️ اختر عميل واحد على الأقل");return}
    const aud={id:gid(),date:auditDate,fromDate:auditFrom,toDate:auditTo||auditDate,notes:auditNote,createdBy:userName||"",createdAt:nowISO(),grid:{}};
    upConfig(d=>{if(!d.salesAudits)d.salesAudits=[];d.salesAudits.unshift(aud)});
    setAuditInclude(selIds);setActiveAudit(aud.id);setShowNewAudit(false);setAuditNote("");setAuditSelCusts({});showToast("✓ تم إنشاء الجرد")};

  const saveAuditCell=(audId,orderId,custId,val)=>{const q=Math.max(0,Number(val)||0);
    upConfig(d=>{const ai=(d.salesAudits||[]).findIndex(a=>a.id===audId);if(ai>=0){if(!d.salesAudits[ai].grid)d.salesAudits[ai].grid={};d.salesAudits[ai].grid[orderId+"_"+custId]=q}})};

  const delAudit=(audId)=>{upConfig(d=>{d.salesAudits=(d.salesAudits||[]).filter(a=>a.id!==audId)});if(activeAudit===audId)setActiveAudit(null);showToast("✓ تم الحذف")};

  const scanAuditImage=async(file,custId)=>{if(!file||!activeAudit)return;setOcrLoading(true);setOcrResult(null);
    try{
      /* V15.64: Store image URL for side-by-side review */
      const previewUrl=URL.createObjectURL(file);
      setOcrImageUrl(previewUrl);
      const b64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=()=>rej();r.readAsDataURL(file)});
      const cust=auditCusts.find(c=>c.id===custId);
      const custName=cust?.name||"العميل";
      /* V15.64: List models WITH delivered quantities so AI can sanity-check */
      const modelRefs=auditModels.map(m=>{
        const o=orders.find(x=>x.id===m.id);
        const del=o?(o.customerDeliveries||[]).filter(d=>d.custId===custId).reduce((s,d)=>s+(Number(d.qty)||0),0):0;
        return{num:m.modelNo,delivered:del}
      });
      const modelListWithMax=modelRefs.map(r=>r.num+" (max "+r.delivered+")").join(", ");
      /* V15.64: Much more specific, step-by-step prompt with examples */
      const prompt="You are an expert at reading hand-written Arabic sales inventory reports for customer: "+custName+".\n\n"
        +"TASK: Extract ONLY model numbers and their SALES/SOLD quantities. DO NOT make up numbers.\n\n"
        +"STEP-BY-STEP INSTRUCTIONS:\n"
        +"1. First, identify the table structure. Look for column headers like:\n"
        +"   - المبيعات / مبيعات / منصرف / باع / sold / sales (THIS is the column you want)\n"
        +"   - الكمية / قلتي / استلم / delivered (NOT this one)\n"
        +"   - الرصيد / باقي / balance / remaining (NOT this one either)\n"
        +"2. Read each row carefully, ONE digit at a time.\n"
        +"3. Pay attention to Arabic/Indic numerals: ٠=0 ١=1 ٢=2 ٣=3 ٤=4 ٥=5 ٦=6 ٧=7 ٨=8 ٩=9\n"
        +"4. Also handle Eastern Arabic: ۰=0 ۱=1 ۲=2 ۳=3 ۴=4 ۵=5 ۶=6 ۷=7 ۸=8 ۹=9\n"
        +"5. If handwriting is unclear, SET confidence to 'low' — do NOT guess.\n"
        +"6. Cross-check: a sales quantity CANNOT be greater than what was delivered.\n"
        +"7. If no explicit sales column exists, calculate: sales = delivered - remaining_balance\n\n"
        +"SANITY CHECK — our records show delivered quantities per model:\n"+modelListWithMax+"\n\n"
        +"If you read a sales number HIGHER than 'max', something is wrong — lower confidence.\n\n"
        +"OUTPUT FORMAT: Return ONLY a valid JSON array, no markdown fences, no explanation.\n"
        +"Each item must have:\n"
        +"- model: the model number as read from image\n"
        +"- qty: the sales quantity (integer)\n"
        +"- confidence: \"high\" (clearly readable), \"medium\" (some uncertainty), or \"low\" (unclear/guessed)\n\n"
        +"EXAMPLE OUTPUT:\n"
        +"[{\"model\":\"3262101\",\"qty\":28,\"confidence\":\"high\"},{\"model\":\"3261115\",\"qty\":14,\"confidence\":\"medium\"}]\n\n"
        +"If you cannot read the image clearly, return: []";
      const res=await fetch("/api/ai",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({system:"You are a meticulous OCR assistant specialized in reading Arabic hand-written sales inventory tables. You NEVER invent numbers. When uncertain, you mark confidence as 'low'. You always return valid JSON only, no markdown.",messages:[{role:"user",content:[{type:"image",source:{type:"base64",media_type:file.type||"image/jpeg",data:b64}},{type:"text",text:prompt}]}]})});
      const data2=await res.json();if(data2.error){showToast("⚠️ خطأ: "+(data2.error.message||""));setOcrLoading(false);return}
      const txt=(data2.content||[]).map(c=>c.text||"").join("").trim();
      const clean=txt.replace(/```json|```/g,"").trim();
      let items;
      try{items=JSON.parse(clean)}catch(e){items=[]}
      if(!Array.isArray(items)||items.length===0){
        showToast("⚠️ الصورة غير واضحة — جرب صورة أوضح");
        setOcrLoading(false);return;
      }
      /* V15.64: Match + flag suspicious values */
      const matched=items.map(it=>{
        const m=auditModels.find(x=>x.modelNo===it.model)||auditModels.find(x=>x.modelNo.includes(it.model)||it.model.includes(x.modelNo));
        const qty=Number(it.qty)||0;
        const confidence=it.confidence||"medium";
        /* Check if qty exceeds delivered */
        let warning=null;
        if(m){
          const o=orders.find(x=>x.id===m.id);
          const del=o?(o.customerDeliveries||[]).filter(d=>d.custId===custId).reduce((s,d)=>s+(Number(d.qty)||0),0):0;
          if(qty>del)warning="⚠️ الرقم أكبر من المسلم ("+del+")";
          else if(qty<0)warning="⚠️ رقم سالب";
        }
        return{input:it.model,qty,confidence,matched:m?m.modelNo:null,matchedId:m?m.id:null,warning};
      });
      setOcrResult({custId,items:matched})
    }catch(e){showToast("⚠️ فشل قراءة الصورة: "+(e.message||""))}
    setOcrLoading(false)};

  const applyOcr=async()=>{if(!ocrResult||!activeAudit)return;const{custId,items}=ocrResult;
    /* V15.64: Warn if low-confidence items still exist */
    const lowConf=items.filter(it=>it.matchedId&&it.confidence==="low");
    if(lowConf.length>0){
      if(!await ask("ثقة منخفضة","فيه "+lowConf.length+" رقم بثقة منخفضة — متأكد إنك راجعتهم؟",{confirmText:"متأكد"}))return;
    }
    upConfig(d=>{const ai=(d.salesAudits||[]).findIndex(a=>a.id===activeAudit);if(ai>=0){if(!d.salesAudits[ai].grid)d.salesAudits[ai].grid={};items.filter(it=>it.matchedId).forEach(it=>{d.salesAudits[ai].grid[it.matchedId+"_"+custId]=it.qty})}});
    const count=items.filter(it=>it.matchedId).length;
    showToast("✓ تم تسجيل "+count+" موديل");
    setOcrResult(null);setOcrCust(null);
    if(ocrImageUrl){URL.revokeObjectURL(ocrImageUrl);setOcrImageUrl(null)}
  };

  /* V16.72: Standalone helper for fetching the HMAC signature used in the
     delivery-confirmation QR. Called twice now:
       1. Pre-fetch when the user opens shipPopup (orange 🏷️ click below)
       2. As a fallback inside the print handler if no pre-fetch is in flight
     Returns {sig, err} (never throws) so callers can render the label even
     when signing failed (the QR is just omitted in that case). */
  const fetchDeliverySig=async(custId,sessionId)=>{
    try{
      const _u=auth.currentUser;
      if(!_u)return{sig:"",err:"يرجى تسجيل الدخول"};
      const _tok=await _u.getIdToken();
      const r=await fetch("/api/delivery-sign",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+_tok},body:JSON.stringify({pairs:[{sessionId,custId}]})});
      const j=await r.json();
      if(r.ok&&j.signatures&&j.signatures[0])return{sig:j.signatures[0].sig||"",err:""};
      return{sig:"",err:(j&&j.error)?j.error:"HTTP "+r.status};
    }catch(e){return{sig:"",err:"Network: "+(e.message||e)}}
  };

  /* V16.71: Removed `printCustLabels` — replaced by printSalesDeliveryLabel
     called from the shipPopup print button. The new flow produces a richer
     label (full customer info + prices + totals + confirmation QR) and reuses
     the existing 10×15 thermal layout instead of maintaining a second one. */

  return<div className="sales-page-buttons">
    {/* ═══ PROFESSIONAL SALES ACTION BAR — V14.45 ═══ */}
    <style>{`
      .sales-page-buttons button{font-size:1.15em;padding:10px 20px}
      .sales-page-buttons button[style*="padding: 4px"],.sales-page-buttons button[style*="padding:4px"]{padding:6px 14px !important}
      .sales-page-buttons button[style*="padding: 6px 12px"],.sales-page-buttons button[style*="padding:6px 12px"]{padding:8px 16px !important}
      .sales-page-buttons button[style*="padding: 7px 16px"],.sales-page-buttons button[style*="padding:7px 16px"]{padding:9px 20px !important}
      .sales-page-buttons button[style*="padding: 9px 18px"],.sales-page-buttons button[style*="padding:9px 18px"]{padding:12px 24px !important}
      /* V16.38: Duotone primary buttons — subtle hover, no white sweep
         (the pastel background doesn't suit a white shimmer effect). */
      .sales-primary-btn{position:relative;transition:all 0.2s cubic-bezier(0.4,0,0.2,1)}
      .sales-primary-btn:hover{transform:translateY(-2px);box-shadow:0 6px 12px -4px rgba(0,0,0,0.10)}
      .sales-primary-btn:active{transform:translateY(0)}
      .sales-secondary-btn{transition:all 0.15s ease}
      .sales-secondary-btn:hover{transform:translateY(-2px);box-shadow:0 6px 12px -4px rgba(0,0,0,0.1)}
      .sales-group-title{font-size:${FS-1}px;font-weight:800;color:${T.textSec};margin:0 0 10px;padding:0 4px;display:flex;align-items:center;gap:8px;text-transform:uppercase;letter-spacing:0.5px}
      .sales-group-title::after{content:"";flex:1;height:1px;background:linear-gradient(to left,${T.brd},transparent);margin-right:4px}
    `}</style>
    {/* V21.11.1: hubView يتحكم في الأقسام لما الصفحة جوّه هَب المبيعات.
       null = سلوك قديم (كله ظاهر، شاشة كاملة) — backward compatible.
       V21.19.0: توزيع المجموعات على تابات الهَب —
         quickActions = إجراءات أساسية + أدوات أخرى
         overview     = العملاء (+ إحصائيات التسليم)
         reports      = التقارير والتحليل
         warehouse    = المخزن والجرد (+ المنتجات) */}
    {(!hubView||["quickActions","overview","reports","warehouse"].includes(hubView))&&(()=>{
      /* ═══ SVG ICONS — professional inline icons ═══ */
      const ICON=(path,size=26,strokeWidth=2)=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={{display:"block"}}>{path}</svg>;
      const I={
        scan:ICON(<><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><path d="M15 13h3v3h-3z M18 18h3v3h-3z M13 13h2 M13 18h2 M13 20v-2"/></>),
        truck:ICON(<><path d="M14 16V6a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h1"/><path d="M14 9h4l3 3v4a1 1 0 0 1-1 1h-1"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/><path d="M9 18h6"/></>),
        undo:ICON(<><path d="M9 14l-4-4 4-4"/><path d="M5 10h11a4 4 0 0 1 0 8h-1"/></>),
        users:ICON(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>),
        fileText:ICON(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></>),
        receipt:ICON(<><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><path d="M8 7h8"/><path d="M8 11h8"/><path d="M8 15h5"/></>),
        chart:ICON(<><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><path d="M2 20h20"/></>),
        trophy:ICON(<><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 4h3v3a3 3 0 0 1-3 3"/><path d="M7 4H4v3a3 3 0 0 0 3 3"/></>),
        calendarReport:ICON(<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h2 M14 14h2 M8 18h2 M14 18h2"/></>),
        history:ICON(<><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></>),
        activity:ICON(<><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>),
        warehouse:ICON(<><path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35a2 2 0 0 1 1.26-1.86l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35z"/><path d="M6 18V10"/><path d="M18 18V10"/><path d="M6 14h12"/></>),
        clipboard:ICON(<><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 12h6 M9 16h6"/></>),
        package:ICON(<><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></>),
        inbox:ICON(<><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></>),
        tag:ICON(<><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></>),
        arrowReturn:ICON(<><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></>),
        refresh:ICON(<><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/></>)
      };

      /* ═══ V16.38 Primary action button — Duotone (Option C):
         - pastel background (15% of color)
         - solid filled icon container in full color
         - dark text label, color text subtitle
         - single-line text using ellipsis on overflow
         - badge: solid color circle on the corner
      */
      const primaryBtn=(icon,label,subtitle,bgColor,darkColor,onClick,badge)=><div onClick={onClick} className="sales-primary-btn" style={{background:bgColor+"15",borderRadius:14,padding:isMob?"10px 12px":"14px 16px",cursor:"pointer",display:"flex",flexDirection:"row",alignItems:"center",gap:isMob?10:14,minHeight:isMob?72:88,position:"relative",transition:"transform 0.15s, box-shadow 0.15s"}}>
        <div style={{background:bgColor,color:"#fff",borderRadius:12,width:isMob?44:52,height:isMob?44:52,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:"0 4px 8px -2px "+bgColor+"40"}}>{icon}</div>
        <div style={{flex:1,textAlign:"start",minWidth:0,overflow:"hidden"}}>
          <div style={{fontSize:isMob?FS:FS+2,fontWeight:800,lineHeight:1.2,color:darkColor,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{label}</div>
          {subtitle&&<div style={{fontSize:FS-3,color:bgColor,fontWeight:600,marginTop:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{subtitle}</div>}
        </div>
        {badge!=null&&badge>0&&<div style={{position:"absolute",top:-6,insetInlineStart:-6,background:bgColor,color:"#fff",minWidth:22,height:22,borderRadius:11,padding:"0 7px",fontSize:11,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 2px 6px "+bgColor+"60"}}>{badge}</div>}
      </div>;

      /* ═══ Secondary action button — grouped tiles ═══ */
      const secBtn=(icon,label,color,onClick,badge)=><div onClick={onClick} className="sales-secondary-btn" style={{background:T.cardSolid,borderRadius:10,padding:isMob?"10px 6px":"12px 8px",border:"1px solid "+color+"25",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6,minHeight:isMob?72:80,position:"relative"}}>
        {badge&&<span style={{position:"absolute",top:-6,left:-6,background:T.err,color:"#fff",borderRadius:"50%",minWidth:20,height:20,fontSize:10,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 5px",border:"2px solid "+T.cardSolid}}>{badge}</span>}
        <div style={{color,display:"flex",alignItems:"center",justifyContent:"center"}}>{icon}</div>
        <div style={{fontSize:isMob?10:FS-2,fontWeight:700,color:T.text,textAlign:"center",lineHeight:1.2}}>{label}</div>
      </div>;

      /* ═══ Orphan sessions count for recovery button ═══ */
      const existingIds=new Set(sessions.map(s=>s.id));const orphans={};
      orders.forEach(o=>{(o.customerDeliveries||[]).forEach(d=>{if(d.sessionId&&!existingIds.has(d.sessionId)){
        if(!orphans[d.sessionId])orphans[d.sessionId]={id:d.sessionId,custIds:new Set(),modelIds:new Set(),grid:{},dates:[],total:0};
        const orp=orphans[d.sessionId];orp.custIds.add(d.custId);orp.modelIds.add(o.id);
        const k=o.id+"_"+d.custId;orp.grid[k]=(orp.grid[k]||0)+(Number(d.qty)||0);
        if(d.date)orp.dates.push(d.date);orp.total+=(Number(d.qty)||0)}})});
      const oList=Object.values(orphans);
      /* V16.27: count orders with non-zero pending — matches the popup filter
         (entries with qty=0 are stale leftovers that don't appear in the list). */
      const pendingRcvCount=orders.reduce((s,o)=>{
        const totalPending=(o.deliveries||[]).filter(d=>d.status==="pending").reduce((ss,d)=>ss+(Number(d.qty)||0),0);
        return s+(totalPending>0?1:0);
      },0);

      const recoverAction=async()=>{
        if(!await ask("استعادة التوزيعات","تم العثور على "+oList.length+" توزيعة محذوفة ("+oList.reduce((s,o)=>s+o.total,0)+" قطعة).\n\nهل تريد استعادتها؟",{confirmText:"استعادة"}))return;
        oList.forEach(orp=>{const date=orp.dates.sort()[0]||cairoDateStr();
          upSales(d=>{if(!d.custDeliverySessions)d.custDeliverySessions=[];
            d.custDeliverySessions.push({id:orp.id,date,modelIds:[...orp.modelIds],custIds:[...orp.custIds],grid:orp.grid,
              status:"جاري التجهيز",saleConfirmed:true,createdBy:"RECOVERY",createdAt:nowISO(),recoveredAt:nowISO()})})});
        showToast("✅ تم استعادة "+oList.length+" توزيعة بنجاح");
      };

      /* ═══ Count visible secondary items per group to maintain consistent layout ═══ */
      return<div style={{marginBottom:18}}>
        {/* ── PRIMARY ACTIONS (quickActions فقط) ── */}
        {canEdit&&(!hubView||hubView==="quickActions")&&(()=>{
          /* V21.21.49: توحيد كل الإجراءات السريعة (شاملة أزرار «أدوات أخرى»
             سابقاً) في صف واحد على الديسكتوب / عمودين على الموبايل، بألوان
             احترافية مميزة لكل زر. «استعادة توزيعات» تظهر فقط عند وجود توزيعات
             يتيمة (حفاظاً على ميزة الاسترجاع بعد إزالة كارت «أدوات أخرى»). */
          const quickBtns=[
            {key:"sale",   icon:I.scan,        label:"بيع سريع",          sub:"مسح QR وتسجيل البيع",  bg:"#10B981",dark:"#059669",show:true,                          onClick:()=>setQrSale({mode:"sale",custId:null,items:[],note:""})},
            {key:"session",icon:I.truck,       label:"سجل توزيع جديد",    sub:"إنشاء جلسة توزيعة",    bg:"#0EA5E9",dark:"#0284C7",show:true,                          onClick:()=>{setSelModels({});setSelCusts({});setShowNewSession(true)}},
            {key:"retScan",icon:I.undo,        label:"مرتجع سريع - Scan", sub:"مسح QR وتسجيل مرتجع",  bg:"#EF4444",dark:"#DC2626",show:true,                          onClick:()=>setQrSale({mode:"return",custId:null,items:[],note:"",linkedSession:"free"})},
            {key:"retFree",icon:I.arrowReturn, label:"مرتجع حر",          sub:"اختيار يدوي للمرتجع",  bg:"#F43F5E",dark:"#E11D48",show:true,                          onClick:()=>{setFreeReturn("pick");setFreeRetItems({});setFreeRetNote("")}},
            {key:"receive",icon:I.inbox,       label:"تأكيد استلام",       sub:"مسح QR كسيري أو قطعة",  bg:"#F59E0B",dark:"#D97706",show:true,badge:pendingRcvCount,    onClick:()=>setPendingRcv({items:{},scanMode:"series"})},
            {key:"label",  icon:I.tag,         label:"ليبل - QR",         sub:"طباعة ليبل المنتج",    bg:"#8B5CF6",dark:"#7C3AED",show:stockModels.length>0,          onClick:()=>setCustomLabel("pick")},
            {key:"recover",icon:I.refresh,     label:"استعادة توزيعات",    sub:"استرجاع جلسات محذوفة", bg:"#0D9488",dark:"#0F766E",show:oList.length>0,badge:oList.length,onClick:recoverAction},
          ].filter(b=>b.show);
          return<>
            <div className="sales-group-title">⚡ إجراءات سريعة</div>
            <div style={{display:"grid",gridTemplateColumns:isMob?"repeat(2,1fr)":"repeat("+quickBtns.length+",1fr)",gap:isMob?8:10,marginBottom:18}}>
              {quickBtns.map(b=><div key={b.key} style={{minWidth:0}}>{primaryBtn(b.icon,b.label,b.sub,b.bg,b.dark,b.onClick,b.badge)}</div>)}
            </div>
          </>;
        })()}

        {/* V19.76.6: secondary tool groups on a 2-column grid (1 col on mobile) — each
            group is its own rectangle card with title above the buttons, side-by-side
            so the page is more compact without shrinking the icons.
            Card style is reused below for each of the 4 groups. */}
        {(()=>{
          const cardStyle = {
            border: "1px solid " + T.brd,
            borderRadius: 12,
            background: T.cardSolid,
            padding: 12,
            display: "flex",
            flexDirection: "column",
          };
          const titleStyle = {
            fontSize: FS - 1,
            fontWeight: 800,
            color: T.text,
            marginBottom: 10,
            paddingBottom: 8,
            borderBottom: "1px solid " + T.brd,
          };
          const btnsGrid = {
            display: "grid",
            gridTemplateColumns: isMob ? "repeat(2,1fr)" : "repeat(auto-fill,minmax(110px,1fr))",
            gap: 8,
          };
          return <div style={{display:"grid",gridTemplateColumns:(!hubView&&!isMob)?"repeat(2,1fr)":"1fr",gap:12,marginBottom:8}}>
            {/* GROUP 1: CUSTOMERS → تاب نظرة عامة */}
            {(!hubView||hubView==="overview")&&<div style={cardStyle}>
              <div style={titleStyle}>👥 العملاء</div>
              <div style={btnsGrid}>
                {canEdit&&secBtn(I.users,"العملاء","#0EA5E9",()=>setShowCustList(true),customers.length||null)}
                {secBtn(I.fileText,"كشف حساب","#0EA5E9",()=>{setCustStatement("pick");setCustFilter("")})}
                {secBtn(I.receipt,"عرض سعر","#8B5CF6",()=>{setShowAllSessQuote(false);setQuoteCust("pickSess")})}
                {secBtn(I.truck||I.fileText,"إذن تسليم","#0EA5E9",()=>{setShowAllSessDeliver(false);setDeliverNote("pickSess")})}
              </div>
            </div>}
            {/* GROUP 2: REPORTS & ANALYSIS → تاب تقارير */}
            {(!hubView||hubView==="reports")&&<div style={cardStyle}>
              <div style={titleStyle}>📊 التقارير والتحليل</div>
              <div style={btnsGrid}>
                {secBtn(I.chart,"تقرير مبيعات","#8B5CF6",()=>{setRptType("all");setRptCust("");setRptModel("");setReportRange({from:"",to:""});setShowReport(true)})}
                {stockModels.length>0&&secBtn(I.trophy,"تحليل مبيعات","#8B5CF6",()=>setSalesAnalysis(true))}
                {secBtn(I.calendarReport,"تقرير الموسم","#EF4444",()=>setSeasonReport(true))}
                {secBtn(I.history,"سجل البيع","#059669",()=>{setCustSalesLog("all");setLogCustF("");setLogModelF("");setLogDateF("");setLogTypeFilter("");setLogLimit(50)})}
                {secBtn(I.activity,"خط الانتاج","#059669",printProductionLine)}
              </div>
            </div>}
            {/* GROUP 3: WAREHOUSE & INVENTORY → تاب المخزن والجرد */}
            {(!hubView||hubView==="warehouse")&&<div style={cardStyle}>
              <div style={titleStyle}>📦 المخزن والجرد</div>
              <div style={btnsGrid}>
                {secBtn(I.tag,"المنتجات","#10B981",()=>{setProductsPrice(true);setPpSearch("");setPpEdits({})})}
                {secBtn(I.scan,"لينك المخزن المتاح","#0EA5E9",()=>setShowStockPortal(true))}
                {secBtn(I.warehouse,"جرد المخزن","#8B5CF6",()=>setInvAudit({items:{},scanning:false}))}
                {canEdit&&secBtn(I.clipboard,"جرد مبيعات","#F59E0B",()=>{setAuditDate(cairoDateStr());setAuditFrom("");setAuditTo("");setAuditNote("");setShowNewAudit(true)})}
                {secBtn(I.package,"الكراتين","#0EA5E9",()=>setPkgPopup("list"))}
                {secBtn(I.inbox,"تأكيد استلام","#10B981",()=>setPendingRcv({items:{}}),pendingRcvCount||null)}
                {secBtn(I.fileText,"سجل الاستلامات","#059669",()=>setShowReceiptLog(true))}
                {secBtn(I.activity,"كارت صنف","#0EA5E9",()=>{setItemCard("pick");setItemCardFilter("")})}
              </div>
            </div>}
            {/* V21.21.49: كارت «أدوات أخرى» (GROUP 4) اتشال — أزراره (ليبل QR /
                مرتجع حر / استعادة توزيعات) اتنقلت لصف الإجراءات السريعة فوق. */}
          </div>;
        })()}
      </div>;
    })()}
    {/* ═══ SALES STATS CARDS ═══ */}
    {(!hubView||hubView==="overview")&&(()=>{
      /* V18.27: Apply per-customer discount to sales/returns/balance.
         Step 1: Build perCust GROSS sales/returns first (no discount).
         Step 2: Build perCust payments (cash/check/other).
         Step 3: For each customer, apply their discount % → compute net values.
         Step 4: Sum across customers for the totals shown in cards. */
      const perCust={};
      /* ── V21.9.191 — Phase 2.5: report respects per-delivery discount ──
         Pre-V21.9.191 the report computed a single discPct from
         customer.discount and applied it to the AGGREGATED gross sum.
         That worked while every delivery used customer.discount, but
         after V21.9.190 (per-customer-per-session override) a single
         customer can have different discounts across sessions — and the
         aggregated-then-discounted math diverged from the actual invoice
         totals.

         Fix: walk each delivery (and return), apply the EFFECTIVE
         discount per-entry (same precedence as the invoice generator),
         and accumulate netted values into `salesNet`/`returnsNet`. The
         totals block then sums those directly. The displayed per-row %
         is a WEIGHTED-AVERAGE effective discount: 1 − (net/gross).
         If a customer has uniform discount, this matches their nominal
         %. If mixed, it shows the actual effective rate they got. */
      const initPerCust = () => ({ sales:0, salesNet:0, returns:0, returnsNet:0, cash:0, check:0 });
      const effDiscPct = (entry, cust) => {
        if (entry && entry.discPct !== undefined && entry.discPct !== null) {
          const n = Number(entry.discPct);
          if (!isNaN(n)) return n;
        }
        if (cust && cust.discount !== undefined && cust.discount !== null) {
          const n = Number(cust.discount);
          if (!isNaN(n)) return n;
        }
        return 10;
      };
      orders.forEach(o=>{const sp=Number(o.sellPrice)||0;
        /* V15.45: Use per-delivery price when set (isDiscounted sales) — falls back to model sellPrice */
        (o.customerDeliveries||[]).forEach(d=>{
          const effPrice=Number(d.price)||sp;
          const gross=(Number(d.qty)||0)*effPrice;
          if(!perCust[d.custId])perCust[d.custId]=initPerCust();
          perCust[d.custId].sales+=gross;
          /* V21.9.191: apply per-delivery discount precedence
             (delivery.discPct → customer.discount → 10) */
          const cust=customers.find(c=>c.id===d.custId);
          const dPct=effDiscPct(d, cust);
          perCust[d.custId].salesNet+=Math.round(gross*(1-dPct/100));
        });
        (o.customerReturns||[]).forEach(r=>{
          const gross=(Number(r.qty)||0)*sp;
          if(!perCust[r.custId])perCust[r.custId]=initPerCust();
          perCust[r.custId].returns+=gross;
          /* Same chain for returns. returnEntry.discPct currently unstamped
             (Phase 2.5 future), so this falls through to customer.discount. */
          const cust=customers.find(c=>c.id===r.custId);
          const dPct=effDiscPct(r, cust);
          perCust[r.custId].returnsNet+=Math.round(gross*(1-dPct/100));
        });
      });
      /* V21.9.167: Two buckets only — check vs non-check. Per customer
         feedback: cash, transfer (تحويل/instapay), and any other non-check
         method all consolidate into "دفعات كاش". The "أخرى" column was
         removed from the printed report (was a 3rd bucket: not-cash &
         not-check). Keeping only `cash` + `check` in perCust[]. */
      (config.custPayments||[]).forEach(p=>{const amt=Number(p.amount)||0;const m=(p.method||"").toLowerCase();
        const isCheck=m.includes("شيك")||m.includes("check");
        if(!perCust[p.custId])perCust[p.custId]=initPerCust();
        if(isCheck)perCust[p.custId].check+=amt;else perCust[p.custId].cash+=amt});
      /* V18.23+V18.24: Include receivable checks ONLY when category = 'دفعة عميل' (real customer payment).
         Excludes: رصيد افتتاحي (carried from old season), تسوية مبالغ, تحويل بين الحسابات, أخرى — none of these are sales-related.
         Empty category defaults to 'دفعة عميل' for receivable checks (matches the helper default). */
      (config.checks||[]).filter(c=>c.type==="receivable"&&c.status!=="مرتد"&&c.status!=="ملغي"&&((c.category||"دفعة عميل")==="دفعة عميل")).forEach(c=>{
        const amt=Number(c.amount)||0;
        if(c.partyId){
          if(!perCust[c.partyId])perCust[c.partyId]=initPerCust();
          perCust[c.partyId].check+=amt;
        }
      });
      /* V21.9.191: aggregate the PRE-NETTED values from per-delivery walk above.
         The displayed discPct per row is the weighted-average effective rate
         (1 − net/gross), which equals the nominal rate when uniform and gives
         a useful indicator when mixed. */
      let totalSales=0,totalReturns=0,totalCashPay=0,totalCheckPay=0;
      let totalSalesGross=0,totalReturnsGross=0;/* For tooltip detail */
      Object.keys(perCust).forEach(cid=>{
        const cust=customers.find(c=>c.id===cid);
        const p=perCust[cid];
        const salesAfter=p.salesNet;
        const returnsAfter=p.returnsNet;
        /* Weighted-avg effective discount %. Fall back to customer.discount
           when there are no sales (avoid div-by-zero); 0 is a valid value. */
        const effDisc = p.sales > 0
          ? Math.round((1 - (p.salesNet / p.sales)) * 100)
          : (cust && cust.discount !== undefined && cust.discount !== null ? Number(cust.discount) : 0);
        totalSalesGross+=p.sales;
        totalReturnsGross+=p.returns;
        totalSales+=salesAfter;
        totalReturns+=returnsAfter;
        totalCashPay+=p.cash;
        totalCheckPay+=p.check;
        /* Annotate perCust for use in print report */
        p.discPct=effDisc;
        p.salesGross=p.sales;
        p.returnsGross=p.returns;
        p.salesAfter=salesAfter;
        p.returnsAfter=returnsAfter;
      });
      /* V21.9.167: balance = sales − returns − cash − check (no "other" anymore,
         transfers etc. now flow into cash) */
      const totalBalance=totalSales-totalReturns-totalCashPay-totalCheckPay;
      const printSalesReport=()=>{const w=openPrintWindow();if(!w){tell("المتصفح يمنع الطباعة","فعّل النوافذ المنبثقة وحاول مرة أخرى",{danger:true});return}
        const logo=(config.logo||"").trim();
        /* V18.27: Use AFTER-discount values per customer for the printed report (balance = sales_after - returns_after - paid) */
        const rows=customers.map(c=>{const p=perCust[c.id]||{sales:0,returns:0,cash:0,check:0,salesAfter:0,returnsAfter:0,discPct:Number(c.discount)||0};
          const sales=p.salesAfter||Math.round(p.sales*(1-(Number(c.discount)||0)/100));
          const returns=p.returnsAfter||Math.round(p.returns*(1-(Number(c.discount)||0)/100));
          /* V21.9.167: balance = sales − returns − cash − check (no "other") */
          const bal=sales-returns-p.cash-p.check;
          return{name:c.name,phone:c.phone||"—",sales,returns,cash:p.cash,check:p.check,discPct:p.discPct||(Number(c.discount)||0),bal}}).filter(r=>r.sales>0||r.returns>0||r.cash>0||r.check>0||r.bal!==0).sort((a,b)=>b.bal-a.bal);
        let html=`<html dir="rtl"><head><meta charset="utf-8"><title>تقرير المبيعات</title>
        <style>@page{size:A4;margin:10mm}*{box-sizing:border-box}body{font-family:'Cairo',Arial,sans-serif;font-size:11px;margin:0;padding:0;color:#1a1a1a}
        .hdr{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:2px solid #0ea5e9;margin-bottom:12px}
        .hdr img{max-height:50px}.hdr h1{font-size:16px;margin:0;color:#0ea5e9}
        .stats{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:14px}
        .stat{padding:10px;border-radius:8px;text-align:center;border:1px solid #e2e8f0}
        .stat .label{font-size:10px;color:#64748b;margin-bottom:4px}.stat .val{font-size:14px;font-weight:800}
        .s-sales{background:#f0f9ff}.s-sales .val{color:#0ea5e9}
        .s-ret{background:#fef2f2}.s-ret .val{color:#ef4444}
        .s-cash{background:#f0fdf4}.s-cash .val{color:#10b981}
        .s-chk{background:#fef3c7}.s-chk .val{color:#f59e0b}
        .s-bal{background:#faf5ff}.s-bal .val{color:#8b5cf6}
        table{width:100%;border-collapse:collapse;font-size:10px}
        th,td{border:1px solid #cbd5e1;padding:5px 7px;text-align:right}
        th{background:#0ea5e9;color:#fff;font-weight:700;text-align:center}
        tr:nth-child(even){background:#f8fafc}
        .num{text-align:center}.pos{color:#10b981;font-weight:700}.neg{color:#ef4444;font-weight:700}
        tfoot tr{background:#0ea5e9;color:#fff;font-weight:800}
        @media print{body{margin:0}}</style></head><body>
        <div class="hdr">${logo?'<img src="'+logo+'"/>':'<div style="font-size:22px;font-weight:900;color:#0ea5e9">CLARK</div>'}
          <div style="text-align:left"><h1>📊 تقرير المبيعات الموسم: ${season}</h1><div style="font-size:10px;color:#64748b">تاريخ: ${cairoDateStr()} • <strong style="color:#0ea5e9">جميع الأرقام بعد تطبيق خصم كل عميل</strong></div></div></div>
        <div class="stats">
          <div class="stat s-sales"><div class="label">اجمالي المبيعات</div><div class="val">${fmt(r2(totalSales))}</div><div style="font-size:8px;color:#94a3b8;margin-top:2px">بعد الخصم</div></div>
          <div class="stat s-ret"><div class="label">المرتجعات</div><div class="val">${fmt(r2(totalReturns))}</div><div style="font-size:8px;color:#94a3b8;margin-top:2px">بعد الخصم</div></div>
          <div class="stat s-cash"><div class="label">دفعات كاش</div><div class="val">${fmt(r2(totalCashPay))}</div></div>
          <div class="stat s-chk"><div class="label">دفعات شيكات</div><div class="val">${fmt(r2(totalCheckPay))}</div></div>
          <div class="stat s-bal"><div class="label">رصيد عند العملاء</div><div class="val">${fmt(r2(totalBalance))}</div><div style="font-size:8px;color:#94a3b8;margin-top:2px">بعد الخصم</div></div>
        </div>
        <table><thead><tr><th>العميل</th><th>تليفون</th><th>الخصم %</th><th>المبيعات بعد الخصم</th><th>مرتجعات بعد الخصم</th><th>دفعات كاش</th><th>دفعات شيكات</th><th>الرصيد</th><th>نسبة مبيعات</th></tr></thead><tbody>`;
        /* V21.9.168: نسبة مبيعات = (sales − returns) / sales × 100
           بمعنى "العميل باع نسبة كام من اللي استلمه" — كل ما النسبة أعلى كل ما
           المرتجعات أقل. لو الـ sales = 0 (مفيش استلام) → نطلع "—" بدل قسمة على صفر.
           Color coding (qualitative bands):
             ≥ 90%  أخضر  (ممتاز، مرتجعات قليلة)
             70-89% أصفر  (متوسط)
             < 70%  أحمر  (مرتجعات كتيرة، يستحق الانتباه) */
        const pctColor = (pct) => pct >= 90 ? "#10b981" : pct >= 70 ? "#f59e0b" : "#ef4444";
        rows.forEach(r=>{
          const pct = r.sales > 0 ? Math.round((r.sales - r.returns) / r.sales * 100) : null;
          html+=`<tr><td>${r.name}</td><td class="num">${ltrPhone(r.phone)}</td>
          <td class="num">${r.discPct>0?r.discPct+"%":"—"}</td>
          <td class="num">${fmt(r2(r.sales))}</td>
          <td class="num ${r.returns>0?"neg":""}">${r.returns>0?fmt(r2(r.returns)):"—"}</td>
          <td class="num ${r.cash>0?"pos":""}">${r.cash>0?fmt(r2(r.cash)):"—"}</td>
          <td class="num ${r.check>0?"pos":""}">${r.check>0?fmt(r2(r.check)):"—"}</td>
          <td class="num" style="font-weight:800;color:${r.bal>0?"#ef4444":r.bal<0?"#10b981":"#64748b"}">${fmt(r2(r.bal))}</td>
          <td class="num" style="font-weight:800;color:${pct===null?"#94a3b8":pctColor(pct)}">${pct===null?"—":pct+"%"}</td></tr>`});
        /* Footer: نسبة المبيعات الإجمالية — (totalSales − totalReturns) / totalSales × 100 */
        const totalPct = totalSales > 0 ? Math.round((totalSales - totalReturns) / totalSales * 100) : null;
        html+=`</tbody><tfoot><tr><td colspan="3" style="text-align:right">الاجمالي</td>
          <td class="num">${fmt(r2(totalSales))}</td>
          <td class="num">${fmt(r2(totalReturns))}</td>
          <td class="num">${fmt(r2(totalCashPay))}</td>
          <td class="num">${fmt(r2(totalCheckPay))}</td>
          <td class="num">${fmt(r2(totalBalance))}</td>
          <td class="num">${totalPct===null?"—":totalPct+"%"}</td></tr></tfoot></table>
        </body></html>`;
        w.document.write(html);w.document.close();setTimeout(()=>w.print(),300)};
      {/* V21.21.8: البطاقات الخمسة اتنقلت لأعلى نظرة عامة المبيعات (جنب «مبيعات الشهر»).
          هنا بقى زر طباعة تقرير المبيعات التفصيلي فقط (نفس الحساب محفوظ أعلاه). */}
      return<div style={{marginBottom:16}}>
        <button onClick={printSalesReport} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 14px",borderRadius:10,background:"#8B5CF60D",border:"1px solid #8B5CF630",color:"#7C3AED",fontWeight:700,cursor:"pointer",fontFamily:"inherit",fontSize:FS-1}} title="طباعة تقرير تفصيلي بكل العملاء (الأرقام بعد الخصم)">
          🖨 طباعة تقرير المبيعات التفصيلي
        </button>
      </div>})()}
    {/* Active Session Matrix - Popup */}
    {activeSess&&aMods.length===0&&aCusts.length===0&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setActiveSession(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,textAlign:"center",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{fontSize:40,marginBottom:8}}>📭</div>
        <div style={{fontSize:FS+1,fontWeight:700,color:T.textSec,marginBottom:12}}>جاري تحميل البيانات...</div>
        <Btn ghost onClick={()=>setActiveSession(null)}>✕ إغلاق</Btn>
      </div>
    </div>}
    {activeSess&&(aMods.length>0||aCusts.length>0)&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:isMob?8:24}} onClick={()=>closeMatrix()}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,width:isMob?"100%":"fit-content",minWidth:isMob?"100%":Math.min(600,220+aMods.length*120),maxWidth:isMob?"100%":Math.min(window.innerWidth-48,240+aMods.length*130+160),maxHeight:"92vh",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)",display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{padding:isMob?"12px 16px":"16px 24px",borderBottom:"1px solid "+T.brd,flexShrink:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:FS+2,fontWeight:800,color:T.accent}}>{"📊 "+activeSess.date+" — جدول التوزيع"+(isSessClosed?" 🔒":"")}</div>
            <div style={{display:"flex",gap:4}}>
              {sessCanEdit&&<Btn small onClick={()=>setAddCustPick({sessId:activeSess.id,sel:{},filter:""})} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30"}} title="اضافة عميل">+ عميل</Btn>}
              {sessCanEdit&&<Btn small onClick={()=>{const existing=new Set(activeSess.modelIds);const avail=stockModels.filter(m=>m.stockQty>0&&!existing.has(m.id));if(avail.length===0){showToast("⚠️ لا توجد موديلات متاحة");return}setAddCustPick({sessId:activeSess.id,sel:{},filter:"",_type:"model",_avail:avail})}} style={{background:"#8B5CF612",color:"#8B5CF6",border:"1px solid #8B5CF630"}} title="اضافة موديل">+ موديل</Btn>}
              <Btn small onClick={()=>printSession(activeSess.id)} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}} title="طباعة">🖨</Btn>
              <Btn ghost small onClick={()=>closeMatrix()} title="إغلاق">✕</Btn>
            </div>
          </div>
          {cellError&&<div style={{padding:"6px 10px",borderRadius:8,background:T.err+"10",border:"1px solid "+T.err+"30",marginTop:8,fontSize:FS-1,fontWeight:700,color:T.err}}>{cellError}</div>}
          <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
            <input value={gridModelF} onChange={e=>setGridModelF(e.target.value)} placeholder="🔍 فلتر موديل..." style={{flex:1,minWidth:100,padding:"5px 10px",borderRadius:8,border:"1px solid "+T.brd,fontSize:FS-2,fontFamily:"inherit",background:T.inputBg,color:T.text}}/>
            <input value={gridCustF} onChange={e=>setGridCustF(e.target.value)} placeholder="🔍 فلتر عميل..." style={{flex:1,minWidth:100,padding:"5px 10px",borderRadius:8,border:"1px solid "+T.brd,fontSize:FS-2,fontFamily:"inherit",background:T.inputBg,color:T.text}}/>
            {(gridModelF||gridCustF)&&<span onClick={()=>{setGridModelF("");setGridCustF("")}} style={{cursor:"pointer",padding:"5px 10px",borderRadius:8,background:T.err+"10",color:T.err,fontSize:FS-2,fontWeight:700}}>✕ مسح</span>}
          </div>
        </div>
        <div style={{flex:1,overflowY:"auto",overflowX:"auto",padding:isMob?"8px 16px 16px":"8px 24px 24px"}}>
        <table style={{width:"100%",borderCollapse:"collapse",minWidth:fMods.length*90+180}}>
          <thead style={{position:"sticky",top:0,zIndex:10,background:T.cardSolid}}><tr>
            {/* V18.22: Sticky customer column — stays visible when scrolling horizontally */}
            <th style={{...TH,minWidth:130,position:"sticky",insetInlineStart:0,zIndex:11,background:T.cardSolid,borderInlineEnd:"2px solid "+T.brd}}>العميل</th>
            {fMods.map(m=>{
              /* V18.22: Compute CURRENT available series (live, after global sales/returns) */
              const oids=m.orderIds||[m.id];
              let gCd=0,gRet=0;
              oids.forEach(oid=>{const o=orders.find(x=>x.id===oid);if(!o)return;
                gCd+=(o.customerDeliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);
                gRet+=(o.customerReturns||[]).reduce((s,r)=>s+(Number(r.qty)||0),0)});
              const currentSeries=(Number(m.seriesQty)||0)-(gCd-gRet);
              return <th key={m.id} style={{...TH,textAlign:"center",minWidth:60,fontSize:FS-2,padding:"4px 6px"}}><div style={{fontWeight:800,color:T.accent,whiteSpace:"nowrap"}}>{m.modelNo}{m.isGrouped&&<span style={{fontSize:FS-3,color:"#8B5CF6",marginInlineStart:4,fontWeight:700}} title={"مدموج من "+m.subOrders.length+" تشغيلات (FIFO)"}>⧉{m.subOrders.length}</span>}</div><div style={{fontSize:FS-3,color:T.textMut,whiteSpace:"nowrap"}}>{(m.rackSize||getRackSize(m.orderIds?.[0]||m.id))+"س"}</div>
              {/* V18.21+V18.22: Series shown is CURRENT available (not gross). Broken stays gross since it doesn't move. */}
              {((m.seriesQty||0)>0||(m.brokenQty||0)>0)&&<div style={{display:"flex",gap:3,justifyContent:"center",marginTop:2,flexWrap:"wrap"}}>
                <span style={{fontSize:FS-3,padding:"1px 5px",borderRadius:4,background:"#0EA5E915",color:"#0EA5E9",fontWeight:700,whiteSpace:"nowrap"}} title="السيري المتاح حالياً للتوزيع (بعد المبيعات والمرتجعات)">📦{currentSeries}</span>
                {(m.brokenQty||0)>0&&<span style={{fontSize:FS-3,padding:"1px 5px",borderRadius:4,background:"#8B5CF615",color:"#8B5CF6",fontWeight:700,whiteSpace:"nowrap"}} title="كسر — مش للتوزيع">🧩{m.brokenQty}</span>}
              </div>}
              {sessCanEdit&&<div onClick={async()=>{
                /* V14.64: Check all sub-orders for deliveries */
                const orderIdsToCheck=m.orderIds||[m.id];
                const hasDeliveries=orderIdsToCheck.some(oid=>orders.some(o=>o.id===oid&&(o.customerDeliveries||[]).some(d=>d.sessionId===activeSess.id)));
                if(hasDeliveries){showToast("⛔ لا يمكن حذف موديل لديه بيع فعلي");return}
                if(!await ask("حذف موديل","حذف موديل "+m.modelNo+(m.isGrouped?" ("+m.subOrders.length+" تشغيلات)":"")+" من التوزيعة؟",{danger:true}))return;
                upSales(d=>{const si=(d.custDeliverySessions||[]).findIndex(s=>s.id===activeSess.id);if(si>=0){
                  d.custDeliverySessions[si].modelIds=d.custDeliverySessions[si].modelIds.filter(id=>!orderIdsToCheck.includes(id));
                  const g=d.custDeliverySessions[si].grid||{};
                  Object.keys(g).forEach(k=>{const[oid]=k.split("_");if(orderIdsToCheck.includes(oid))delete g[k]});
                }});
                showToast("✓ تم حذف "+m.modelNo);
              }} style={{cursor:"pointer",fontSize:9,color:T.err,marginTop:2}}>✕ حذف</div>}
            </th>;
            })}
            <th style={{...TH,textAlign:"center",background:"#0284C715",color:T.accent,fontWeight:800}}>اجمالي</th>
            <th style={{...TH,width:70}}></th>
          </tr></thead>
          <tbody>
            {fCusts.map((c,ci)=>{
              /* V19.70.22: rowTotal reads localGrid (unsaved) — reflects what the user sees */
              const rowTotal=fMods.reduce((s,m)=>s+getGroupQtyLocal(m,c.id),0);
              const rowBg=ci%2===0?T.cardSolid:T.bg;
              return<tr key={c.id} style={{background:ci%2===0?"transparent":T.bg+"80"}}>
                {/* V18.22: Sticky customer column.
                    V19.70.24: added always-visible delete (✕) icon next to the name so the user
                    can remove a customer from the session even when their row is empty. The
                    icon respects the safety check (block if there are committed sales for this
                    customer in this session — those need to be unwound first). */}
                <td style={{...TD,fontWeight:700,position:"sticky",insetInlineStart:0,zIndex:5,background:rowBg,borderInlineEnd:"2px solid "+T.brd}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    {sessCanEdit && (() => {
                      const hasSalesInSess = orders.some(o => (o.customerDeliveries||[]).some(d => d.custId===c.id && d.sessionId===activeSess.id));
                      if (hasSalesInSess) {
                        return <span title="لا يمكن الحذف — لديه بيع فعلي في هذه التوزيعة" style={{cursor:"not-allowed",fontSize:11,color:"#94A3B8",padding:"0 4px",userSelect:"none"}}>🔒</span>;
                      }
                      return <span title={"حذف "+c.name+" من التوزيعة"} onClick={async()=>{
                        if (!await ask("حذف عميل","حذف "+c.name+" من التوزيعة؟",{danger:true})) return;
                        upSales(d => {
                          const si = (d.custDeliverySessions||[]).findIndex(s => s.id === activeSess.id);
                          if (si >= 0) {
                            d.custDeliverySessions[si].custIds = d.custDeliverySessions[si].custIds.filter(id => id !== c.id);
                            const g = d.custDeliverySessions[si].grid || {};
                            Object.keys(g).forEach(k => { if (k.endsWith("_"+c.id)) delete g[k]; });
                          }
                        });
                        /* Also clean from localGrid so the matrix re-render doesn't re-show the row briefly */
                        setLocalGrid(prev => {
                          const next = {...prev};
                          Object.keys(next).forEach(k => { if (k.endsWith("_"+c.id)) delete next[k]; });
                          return next;
                        });
                        showToast("✓ تم حذف "+c.name);
                      }} style={{cursor:"pointer",fontSize:11,color:"#EF4444",padding:"2px 5px",borderRadius:4,background:"#EF444410",border:"1px solid #EF444425",userSelect:"none",lineHeight:1,fontWeight:700}}>✕</span>;
                    })()}
                    <span>{c.name}{(()=>{
                      /* V15.50: Confirmation badge — shows customer's scan result */
                      const cf=(activeSess.confirmations||{})[c.id];
                      if(!cf)return<span title="في انتظار تأكيد العميل" style={{marginInlineStart:6,padding:"1px 6px",borderRadius:6,background:"#94A3B812",color:"#64748B",fontSize:FS-3,fontWeight:700,verticalAlign:"middle"}}>⏳</span>;
                      const ageMs=Date.now()-new Date(cf.at).getTime();
                      const locked=ageMs>=24*60*60*1000;
                      if(cf.status==="confirm")return<span title={"أكد في "+new Date(cf.at).toLocaleString("ar-EG")+(locked?" • مقفول":"")} style={{marginInlineStart:6,padding:"1px 6px",borderRadius:6,background:"#10B98115",color:"#10B981",fontSize:FS-3,fontWeight:700,verticalAlign:"middle"}}>{locked?"🔒":""}✅</span>;
                      return<span title={"أبلغ عن مشكلة: "+(cf.note||"—")+" • "+new Date(cf.at).toLocaleString("ar-EG")} style={{marginInlineStart:6,padding:"1px 6px",borderRadius:6,background:"#EF444415",color:"#EF4444",fontSize:FS-3,fontWeight:700,verticalAlign:"middle"}}>{locked?"🔒":""}⚠️</span>;
                    })()}<div style={{fontSize:FS-3,color:T.textMut}}>{ltrPhone(c.phone)}</div></span>
                  </div>
                  {/* V21.9.190 — Phase 2: per-customer-per-session discount editor.
                      Shows the EFFECTIVE % (live local override > customer default > 10).
                      Editable inline; saved when user clicks the footer "حفظ كل التغييرات".
                      Empty input → revert to fallback. Yellow border if override differs from
                      customer.discount, so the user sees at a glance that an override is set. */}
                  {sessCanEdit && (() => {
                    const eff = getEffectiveDiscount(c, activeSess);
                    const hasOverride = (localCustDisc[c.id] !== undefined && localCustDisc[c.id] !== "" && localCustDisc[c.id] !== null);
                    const overrideDiffersFromCust = hasOverride && Number(localCustDisc[c.id]) !== (Number(c.discount) || 10);
                    return (
                      <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}
                        title="نسبة الخصم لهذا العميل في التوزيعة دي. تـ override الـ default. اتركه فاضي لـ revert.">
                        <span style={{ fontSize: FS - 3, color: T.textMut, fontWeight: 600 }}>خصم</span>
                        <input
                          type="number" min="0" max="100" step="0.5"
                          value={hasOverride ? localCustDisc[c.id] : (Number(c.discount) || 0) === 0 && eff === 10 ? "" : eff}
                          placeholder={String(Number(c.discount) || 10)}
                          onFocus={e => e.target.select()}
                          onChange={e => setCustDiscount(c.id, e.target.value)}
                          style={{
                            width: 48, padding: "2px 4px",
                            borderRadius: 4,
                            border: "1px solid " + (overrideDiffersFromCust ? "#F59E0B" : T.brd),
                            background: overrideDiffersFromCust ? "#F59E0B08" : T.bg,
                            color: T.text, fontSize: FS - 2, fontWeight: 700,
                            textAlign: "center", fontFamily: "inherit",
                            outline: "none", boxSizing: "border-box",
                            MozAppearance: "textfield",
                          }}/>
                        <span style={{ fontSize: FS - 3, color: T.textMut, fontWeight: 600 }}>%</span>
                      </div>
                    );
                  })()}
                </td>
                {/* V19.70.22: each cell is now an always-on input bound to localGrid.
                    No click-to-edit. No per-cell auto-save → no flicker. The save-all
                    button at the footer commits the whole localGrid in one upSales. */}
                {fMods.map((m,mi)=>{
                  const q=getGroupQtyLocal(m,c.id);
                  const cap=availForGroupCell(m,c.id);/* current avail accounting for OTHER customers in localGrid */
                  const exceeds=q>cap;/* validation: warn (don't block) when over capacity */
                  const breakdown=m.isGrouped?getGroupBreakdown(m,c.id):"";
                  /* Compute delivered (committed sales for this session) — read-only context */
                  const orderIds=m.orderIds||[m.id];
                  const delivered=orderIds.reduce((s,oid)=>s+getDeliveredForSess(c.id,activeSess.id,oid),0);
                  return<td key={m.id} style={{...TD,textAlign:"center",padding:2,background:q>0?(exceeds?T.err+"10":T.ok+"04"):"transparent"}}
                    title={(exceeds?("⚠️ تخطى المتاح: "+cap+" قطعة"):(m.isGrouped&&q>0?breakdown:undefined))||undefined}>
                    {sessCanEdit ? (
                      <div style={{display:"flex",flexDirection:"column",alignItems:"stretch",gap:1}}>
                        <input type="number" min="0"
                          value={q || ""}
                          onFocus={e=>e.target.select()}
                          onChange={e=>setLocalCellQty(m, c.id, e.target.value)}
                          onKeyDown={e=>{
                            /* Tab moves to next column (next model) for fast row-fill */
                            if(e.key==="Tab" && !e.shiftKey){
                              const nextMi=mi+1;
                              if(nextMi<fMods.length){
                                e.preventDefault();
                                /* Focus the next input in the same row by querying its data-cell */
                                const nextK=fMods[nextMi].id+"_"+c.id;
                                const nextEl=document.querySelector('input[data-cell="'+nextK+'"]');
                                if(nextEl){nextEl.focus();nextEl.select&&nextEl.select();}
                              }
                            }
                          }}
                          data-cell={m.id+"_"+c.id}
                          style={{
                            width:"100%",textAlign:"center",
                            border:"1px solid "+(exceeds?T.err:(q>0?T.accent+"60":T.brd)),
                            borderRadius:6,padding:"4px 2px",
                            fontSize:FS,fontWeight:q>0?800:500,
                            fontFamily:"inherit",outline:"none",
                            background:exceeds?T.err+"08":(q>0?T.bg:"transparent"),
                            color:exceeds?T.err:(q>0?T.accent:T.text),
                            boxSizing:"border-box",
                            MozAppearance:"textfield",
                            transition:"border-color 0.15s, background-color 0.15s",
                          }}/>
                        {m.isGrouped&&q>0&&<span style={{fontSize:FS-4,color:"#8B5CF6",fontWeight:700}} title={breakdown}>ⓘ مقسّم</span>}
                        {delivered>0&&(()=>{const rem=q-delivered;return<div style={{fontSize:FS-3,lineHeight:1}}><span style={{color:"#10B981"}}>{"✓"+delivered}</span>{rem>0&&<span style={{color:"#F59E0B"}}>{" ⏳"+rem}</span>}</div>;})()}
                        {exceeds&&<span style={{fontSize:FS-4,color:T.err,fontWeight:700}} title={"المتاح: "+cap}>⚠️ تخطى</span>}
                      </div>
                    ) : (
                      /* Read-only fallback for closed sessions — same display as before */
                      <div>
                        <span style={{fontWeight:q>0?800:400,color:q>0?T.accent:T.textMut+"50",fontSize:q>0?FS:FS-2}}>{q||"—"}</span>
                        {m.isGrouped&&q>0&&<span style={{fontSize:FS-4,color:"#8B5CF6",marginInlineStart:3,fontWeight:700}} title={breakdown}>ⓘ</span>}
                        {delivered>0&&(()=>{const rem=q-delivered;return<div style={{fontSize:FS-3,lineHeight:1}}><span style={{color:"#10B981"}}>{"✓"+delivered}</span>{rem>0&&<span style={{color:"#F59E0B"}}>{" ⏳"+rem}</span>}</div>;})()}
                      </div>
                    )}
                  </td>;
                })}
                <td style={{...TD,textAlign:"center",fontWeight:800,color:T.accent,background:"#0284C706",fontSize:FS+1}}>{rowTotal||"—"}</td>
                <td style={{...TD,whiteSpace:"nowrap",padding:"2px 4px"}}>{rowTotal>0&&<div style={{display:"flex",gap:2}}>
                  <Btn small onClick={async()=>{
                    /* V15.50: Per-customer delivery receipt — fetch signed URL, embed QR + prices */
                    /* V16.12: include Firebase ID token (delivery-sign now requires admin/manager) */
                    let sig="";let signErr="";
                    try{
                      const _u=auth.currentUser;
                      if(!_u){signErr="يرجى تسجيل الدخول";throw new Error(signErr)}
                      const _tok=await _u.getIdToken();
                      const r=await fetch("/api/delivery-sign",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+_tok},body:JSON.stringify({pairs:[{sessionId:activeSess.id,custId:c.id}]})});
                      const j=await r.json();
                      if(r.ok&&j.signatures&&j.signatures[0])sig=j.signatures[0].sig||"";
                      else signErr=(j&&j.error)?j.error:"HTTP "+r.status;
                    }catch(e){signErr=signErr||("Network: "+(e.message||e))}
                    /* V15.52: Show clear feedback when signing fails — so Ahmed knows exactly what's wrong */
                    if(!sig){
                      console.error("[CLARK] /api/delivery-sign failed:",signErr);
                      showToast("⚠️ الـ QR مش هيظهر — تفاصيل الخطأ: "+signErr);
                    }
                    const origin=window.location.origin;
                    const confirmUrl=sig?origin+"/?dc=1&s="+encodeURIComponent(activeSess.id)+"&c="+encodeURIComponent(c.id)+"&sig="+encodeURIComponent(sig):"";
                    let h="<h2>🚚 اذن تسليم عميل</h2><table><tr><th>العميل</th><td><b>"+c.name+"</b></td><th>التليفون</th><td>"+ltrPhone(c.phone)+"</td></tr><tr><th>التاريخ</th><td>"+activeSess.date+"</td><th>العنوان</th><td>"+(c.address||"—")+"</td></tr></table><h2>تفاصيل الاستلام</h2><table><thead><tr><th>الموديل</th><th>الوصف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>";
                    let custMoney=0;
                    aMods.forEach(m=>{const q=getGroupQty(m,c.id);if(q>0){
                      const oids=m.orderIds||[m.id];let price=0;
                      for(const oid of oids){const o=orders.find(x=>x.id===oid);if(o){
                        const dd=(o.customerDeliveries||[]).find(d=>d.custId===c.id&&d.sessionId===activeSess.id&&Number(d.price)>0);
                        if(dd){price=Number(dd.price);break}
                        if(Number(o.sellPrice)>0){price=Number(o.sellPrice);break}
                      }}
                      const lineTotal=q*price;custMoney+=lineTotal;
                      h+="<tr><td><b>"+m.modelNo+"</b></td><td>"+(m.modelDesc||"")+"</td><td style='font-weight:800;color:#0284C7'>"+q+"</td><td style='text-align:center'>"+(price?fmt(price):"—")+"</td><td style='text-align:center;font-weight:700'>"+fmt(lineTotal)+"</td></tr>";
                    }});
                    h+="<tr style='background:#F1F5F9'><td colspan='2' style='font-weight:800'>الاجمالي</td><td style='font-weight:800;color:#0284C7;font-size:14px'>"+rowTotal+" قطعة</td><td></td><td style='font-weight:800;color:#0284C7;font-size:14px'>"+fmt(custMoney)+" ج.م</td></tr></tbody></table>";
                    /* V15.55: Discount breakdown from customer card.
                       V21.9.190: precedence sess.custDisc[c.id] > c.discount > 10. */
                    const discPct=getEffectiveDiscount(c, activeSess);
                    const discAmt=Math.round(custMoney*discPct/100);
                    const netAmt=custMoney-discAmt;
                    h+="<div style='margin-top:12px;padding:12px;border:2px solid #000;border-radius:8px'>"
                      +"<div style='display:flex;justify-content:space-between;margin-bottom:6px'><span style='font-weight:700'>الاجمالي قبل الخصم</span><span style='font-weight:800'>"+fmt(custMoney)+" ج.م</span></div>";
                    if(discPct>0){
                      h+="<div style='display:flex;justify-content:space-between;margin-bottom:6px;color:#EF4444'><span style='font-weight:700'>خصم "+discPct+"%</span><span style='font-weight:800'>- "+fmt(discAmt)+" ج.م</span></div>";
                    }
                    h+="<div style='display:flex;justify-content:space-between;padding-top:8px;border-top:2px solid #000'><span style='font-weight:800;font-size:15px'>الصافي المستحق</span><span style='font-weight:900;font-size:17px;color:#059669'>"+fmt(netAmt)+" ج.م</span></div>"
                      +"</div>";
                    /* V15.50: QR block */
                    if(confirmUrl){
                      h+="<div style='margin-top:14px;padding:12px;border:2px dashed #0EA5E9;border-radius:10px;display:flex;align-items:center;gap:14px;background:#F0F9FF;page-break-inside:avoid'>"
                        +"<canvas class='confirm-qr' data-qr='"+confirmUrl.replace(/'/g,"&#39;")+"' style='width:100px;height:100px;flex-shrink:0'></canvas>"
                        +"<div style='flex:1;font-size:12px;line-height:1.6'>"
                        +"<div style='font-size:14px;font-weight:800;color:#0369A1;margin-bottom:3px'>📱 تأكيد الاستلام</div>"
                        +"<div style='color:#475569'>بعد مطابقة البضاعة، امسح الكود للتأكيد أو الإبلاغ عن مشكلة.</div>"
                        +"<div style='color:#94A3B8;font-size:10px;margin-top:3px'>الرابط صالح لمدة 24 ساعة من التأكيد</div>"
                        +"</div></div>";
                    }
                    h+="<div class='sig'><div class='sig-box'>مسؤول التسليم</div><div class='sig-box'>توقيع العميل<br/>"+c.name+"</div></div>";
                    h+="<script src='https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js'></"+"script>";
                    h+="<script>function _renderCLARKqrs(){if(typeof QRCode==='undefined'){setTimeout(_renderCLARKqrs,100);return}document.querySelectorAll('.confirm-qr').forEach(function(c){QRCode.toCanvas(c,c.dataset.qr,{width:200,margin:0,errorCorrectionLevel:'M'},function(){})})}_renderCLARKqrs();</"+"script>";
                    printPage("اذن تسليم — "+c.name,h,{factoryName:config.factoryName,logo:config.logo});
                  }} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30",fontSize:9,padding:"2px 5px"}} title="طباعة">🖨</Btn>
                  {/* V16.71: Removed the purple V16.57 thermal sales-delivery button.
                      Its full-detail label (customer info, items with prices, totals,
                      QR) is now produced by the orange 🏷️ button below via the
                      shipPopup flow — which adds shipment count + WhatsApp on top.
                      Two side-by-side 🏷️ buttons doing similar things was
                      confusing UX, so the simpler/incomplete one was removed. */}
                  <Btn small onClick={()=>{
                    /* V15.55: Validate phone first */
                    let rawPhone=(c.phone||"").replace(/[^0-9]/g,"");
                    if(!rawPhone){showToast("⚠️ "+c.name+" — مفيش رقم تليفون");return}
                    /* Normalize Egyptian numbers: if starts with "0" (local), prepend "2" for country code */
                    if(rawPhone.length===11&&rawPhone.startsWith("0"))rawPhone="2"+rawPhone;
                    else if(rawPhone.length===10&&!rawPhone.startsWith("20"))rawPhone="20"+rawPhone;
                    /* Build detailed message with prices if available */
                    let custMoney=0;
                    const linesArr=aMods.map(m=>{const q=getGroupQty(m,c.id);if(q<=0)return null;
                      const oids=m.orderIds||[m.id];let price=0;
                      for(const oid of oids){const o=orders.find(x=>x.id===oid);if(o){
                        const dd=(o.customerDeliveries||[]).find(d=>d.custId===c.id&&d.sessionId===activeSess.id&&Number(d.price)>0);
                        if(dd){price=Number(dd.price);break}
                        if(Number(o.sellPrice)>0){price=Number(o.sellPrice);break}
                      }}
                      custMoney+=q*price;
                      return"• *"+m.modelNo+"*: "+q+" قطعة"+(price?" × "+fmt(price)+" = "+fmt(q*price)+" ج.م":"");
                    }).filter(Boolean);
                    const lines=linesArr.join("\n");
                    let msg="*CLARK — اذن تسليم عميل*\n\n• العميل: *"+c.name+"*\n• التاريخ: *"+activeSess.date+"*\n\n─────────────────\n"+lines+"\n─────────────────\n• الاجمالي: *"+rowTotal+"* قطعة";
                    if(custMoney>0){
                      /* V15.55: Include discount breakdown matching the delivery receipt
                         V21.9.190: precedence sess.custDisc[c.id] > c.discount > 10. */
                      const discPct=getEffectiveDiscount(c, activeSess);
                      const discAmt=Math.round(custMoney*discPct/100);
                      const netAmt=custMoney-discAmt;
                      msg+="\n• الاجمالي: *"+fmt(custMoney)+"* ج.م";
                      if(discPct>0){
                        msg+="\n• خصم "+discPct+"%: *-"+fmt(discAmt)+"* ج.م";
                        msg+="\n• *الصافي المستحق: "+fmt(netAmt)+" ج.م*";
                      }
                    }
                    msg+="\n\n📱 *برجاء مسح كود QR في إذن التسليم للتأكيد باستلام البضاعة كاملة*";
                    /* V18.33: Append account summary footer if enabled in settings */
                    msg+=formatCustomerSummaryWA(buildCustomerSummary(c.id,data),(data?.printSettings||{}).whatsappSummary);
                    const waUrl="https://wa.me/"+rawPhone+"?text="+encodeURIComponent(msg);
                    openWA(waUrl);
                  }} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630",fontSize:9,padding:"2px 5px"}} title="ارسال واتساب">📱</Btn>
                  <Btn small onClick={()=>{
                    setShipPopup({cust:c,total:rowTotal});setShipCount(1);
                    /* V16.72: kick off the delivery-sign fetch immediately so
                       it overlaps with the user filling in the shipment count.
                       Stored in a ref (not state) — we don't need re-renders. */
                    sigPromiseRef.current=fetchDeliverySig(c.id,activeSess.id);
                  }} style={{background:"#F59E0B12",color:"#F59E0B",border:"1px solid #F59E0B30",fontSize:9,padding:"2px 5px"}} title="طباعة ليبل">🏷️</Btn>
                  {sessCanEdit&&(()=>{const hasSalesInSess=orders.some(o=>(o.customerDeliveries||[]).some(d=>d.custId===c.id&&d.sessionId===activeSess.id));
                    return hasSalesInSess?<Btn small disabled style={{background:"#EF444406",color:"#ccc",border:"1px solid #EF444415",fontSize:9,padding:"2px 5px",cursor:"not-allowed"}} title="لا يمكن الحذف — لديه بيع فعلي">🔒</Btn>
                    :<Btn small onClick={async()=>{if(!await ask("حذف عميل","حذف "+c.name+" من التوزيعة؟",{danger:true}))return;upSales(d=>{const si=(d.custDeliverySessions||[]).findIndex(s=>s.id===activeSess.id);if(si>=0){d.custDeliverySessions[si].custIds=d.custDeliverySessions[si].custIds.filter(id=>id!==c.id);const g=d.custDeliverySessions[si].grid||{};Object.keys(g).forEach(k=>{if(k.endsWith("_"+c.id))delete g[k]})}});showToast("✓ تم حذف "+c.name)}} style={{background:"#EF444412",color:"#EF4444",border:"1px solid #EF444430",fontSize:9,padding:"2px 5px"}} title="حذف العميل">🗑</Btn>})()}
                </div>}</td>
              </tr>})}
            {/* V19.70.22: column totals + grand total now read localGrid (live, unsaved) */}
            <tr style={{background:T.ok+"08"}}><td style={{...TD,fontWeight:800,color:T.ok,position:"sticky",insetInlineStart:0,zIndex:5,background:T.cardSolid,borderInlineEnd:"2px solid "+T.brd}}>اجمالي توزيع</td>
              {fMods.map(m=>{const mt=fCusts.reduce((s,c)=>s+getGroupQtyLocal(m,c.id),0);return<td key={m.id} style={{...TD,textAlign:"center",fontWeight:800,color:T.ok}}>{mt||"—"}</td>})}
              <td style={{...TD,textAlign:"center",fontWeight:800,fontSize:FS+2,color:"#fff",background:T.ok}}>{fCusts.reduce((s,c)=>s+fMods.reduce((ss,m)=>ss+getGroupQtyLocal(m,c.id),0),0)}</td><td style={TD}></td></tr>
            {/* V18.21: All rows use seriesQty (broken excluded from distribution).
                 - رصيد توزيع uses series_initial_stock = current_series_stock + this_session_net_sold
                 - مباع فعلي = this_session_net_sold (filtered by sessionId)
                 - رصيد متاح للبيع = current_series_stock (live; reaches 0 when all session sales confirmed) */}
            {/* رصيد توزيع = (الرصيد السيري الحالي + مبيعات التوزيعة) − اجمالي التوزيع */}
            <tr><td style={{...TD,fontWeight:700,color:"#0EA5E9",position:"sticky",insetInlineStart:0,zIndex:5,background:T.cardSolid,borderInlineEnd:"2px solid "+T.brd}}>رصيد توزيع</td>
              {aMods.map(m=>{
                const oids=m.orderIds||[m.id];
                let gCd=0,gRet=0,sCd=0,sRet=0;
                oids.forEach(oid=>{const o=orders.find(x=>x.id===oid);if(!o)return;
                  (o.customerDeliveries||[]).forEach(d=>{const q=Number(d.qty)||0;gCd+=q;if(d.sessionId===activeSess.id)sCd+=q});
                  (o.customerReturns||[]).forEach(r=>{const q=Number(r.qty)||0;gRet+=q;if((r.sessId||r.sessionId)===activeSess.id)sRet+=q})});
                /* V18.21: Use seriesQty (broken excluded) — sales/returns assumed to come from series
                   V19.70.22: plan reads localGrid so رصيد توزيع reacts live as the user types */
                const currentSeries=(Number(m.seriesQty)||0)-(gCd-gRet);
                const sessNet=sCd-sRet;
                const sessInitSeries=currentSeries+sessNet;
                const plan=aCusts.reduce((s,c)=>s+getGroupQtyLocal(m,c.id),0);
                const bal=sessInitSeries-plan;
                return<td key={m.id} style={{...TD,textAlign:"center",fontWeight:700,color:bal>=0?"#0EA5E9":"#EF4444"}}>{bal}</td>;
              })}
              <td style={{...TD,textAlign:"center",fontWeight:700,color:"#0EA5E9"}}>{(()=>{let total=0;aMods.forEach(m=>{const oids=m.orderIds||[m.id];let gCd=0,gRet=0,sCd=0,sRet=0;oids.forEach(oid=>{const o=orders.find(x=>x.id===oid);if(!o)return;(o.customerDeliveries||[]).forEach(d=>{const q=Number(d.qty)||0;gCd+=q;if(d.sessionId===activeSess.id)sCd+=q});(o.customerReturns||[]).forEach(r=>{const q=Number(r.qty)||0;gRet+=q;if((r.sessId||r.sessionId)===activeSess.id)sRet+=q})});const currentSeries=(Number(m.seriesQty)||0)-(gCd-gRet);const sessInitSeries=currentSeries+(sCd-sRet);const plan=aCusts.reduce((s,c)=>s+getGroupQtyLocal(m,c.id),0);total+=sessInitSeries-plan});return total})()}</td><td style={TD}></td></tr>
            {/* مباع فعلي = this_session_net_sold (NO change from V18.18) */}
            <tr><td style={{...TD,fontWeight:700,color:"#8B5CF6",position:"sticky",insetInlineStart:0,zIndex:5,background:T.cardSolid,borderInlineEnd:"2px solid "+T.brd}}>مباع فعلي</td>
              {aMods.map(m=>{
                const oids=m.orderIds||[m.id];
                let cd=0,ret=0;
                oids.forEach(oid=>{const o=orders.find(x=>x.id===oid);if(!o)return;
                  cd+=(o.customerDeliveries||[]).filter(d=>d.sessionId===activeSess.id).reduce((s,d)=>s+(Number(d.qty)||0),0);
                  ret+=(o.customerReturns||[]).filter(r=>(r.sessId||r.sessionId)===activeSess.id).reduce((s,r)=>s+(Number(r.qty)||0),0)});
                const net=cd-ret;
                return<td key={m.id} style={{...TD,textAlign:"center",fontWeight:700,color:net>0?"#8B5CF6":T.textMut}}>{net||"—"}{ret>0&&<span style={{fontSize:FS-3,color:T.ok}}>{" +"+ret+" مرتجع"}</span>}</td>;
              })}
              <td style={{...TD,textAlign:"center",fontWeight:700,color:"#8B5CF6"}}>{(()=>{let total=0;aMods.forEach(m=>{const oids=m.orderIds||[m.id];oids.forEach(oid=>{const o=orders.find(x=>x.id===oid);if(!o)return;const cd=(o.customerDeliveries||[]).filter(d=>d.sessionId===activeSess.id).reduce((s,d)=>s+(Number(d.qty)||0),0);const ret=(o.customerReturns||[]).filter(r=>(r.sessId||r.sessionId)===activeSess.id).reduce((s,r)=>s+(Number(r.qty)||0),0);total+=(cd-ret)})});return total||"—"})()}</td><td style={TD}></td></tr>
            {/* رصيد متاح للبيع = الرصيد السيري الفعلي الحالي = seriesQty − global_net_sold */}
            <tr style={{background:"#F59E0B06"}}><td style={{...TD,fontWeight:800,color:T.warn,position:"sticky",insetInlineStart:0,zIndex:5,background:T.cardSolid,borderInlineEnd:"2px solid "+T.brd}}>رصيد متاح للبيع</td>
              {aMods.map(m=>{
                const oids=m.orderIds||[m.id];
                let gCd=0,gRet=0;
                oids.forEach(oid=>{const o=orders.find(x=>x.id===oid);if(!o)return;
                  gCd+=(o.customerDeliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);
                  gRet+=(o.customerReturns||[]).reduce((s,r)=>s+(Number(r.qty)||0),0)});
                /* V18.21: Use seriesQty (broken excluded from sale availability) */
                const currentSeries=(Number(m.seriesQty)||0)-(gCd-gRet);
                return<td key={m.id} style={{...TD,textAlign:"center",fontWeight:800,fontSize:FS+1,color:currentSeries>0?"#F59E0B":currentSeries<0?"#EF4444":T.textMut}}>{currentSeries}</td>;
              })}
              <td style={{...TD,textAlign:"center",fontWeight:800,color:T.warn}}>{(()=>{let total=0;aMods.forEach(m=>{const oids=m.orderIds||[m.id];let gCd=0,gRet=0;oids.forEach(oid=>{const o=orders.find(x=>x.id===oid);if(!o)return;gCd+=(o.customerDeliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);gRet+=(o.customerReturns||[]).reduce((s,r)=>s+(Number(r.qty)||0),0)});total+=((Number(m.seriesQty)||0)-(gCd-gRet))});return total})()}</td><td style={TD}></td></tr>
            {sessCanEdit&&<tr><td style={{...TD,fontWeight:700,color:"#8B5CF6",position:"sticky",insetInlineStart:0,zIndex:5,background:T.cardSolid,borderInlineEnd:"2px solid "+T.brd}}>💰 سعر البيع <span style={{color:T.err,fontSize:FS-2}}>*</span></td>
              {aMods.map(m=>{
                /* V15.37: Use draft value if present, else the saved price */
                const draftVal=sellPriceDrafts[m.key];
                const curVal=draftVal!==undefined?draftVal:(m.sellPrice||"");
                const isDirty=draftVal!==undefined&&String(draftVal)!==String(m.sellPrice||"");
                const isEmpty=!curVal||Number(curVal)<=0;
                return<td key={m.id} style={{...TD,textAlign:"center",padding:2}}>
                  <input type="number" value={curVal} onChange={e=>setSellPriceDrafts(p=>({...p,[m.key]:e.target.value}))} placeholder="0"
                    title={m.sellPriceMixed?"⚠️ الأسعار مختلفة بين التشغيلات — الحفظ يوحّدها":""}
                    style={{width:"100%",textAlign:"center",border:"1px solid "+(isEmpty?T.err+"60":isDirty?"#F59E0B":T.brd),borderRadius:4,padding:"2px",fontSize:FS-2,fontWeight:700,fontFamily:"inherit",background:isEmpty?T.err+"08":isDirty?"#F59E0B10":T.bg,color:"#8B5CF6"}}/>
                  {m.sellPriceMixed&&!isDirty&&<div style={{fontSize:FS-3,color:T.warn,fontWeight:700,marginTop:2}} title="الأسعار مختلفة بين الأوردرات">⚠️ مختلط</div>}
                </td>;
              })}
              {/* V15.30: Total sell value — uses getGroupQty for group-aware quantity.
                  V19.70.22: switched to getGroupQtyLocal so the total reflects live unsaved edits. */}
              <td style={{...TD,textAlign:"center",fontWeight:800,color:"#8B5CF6",minWidth:120,whiteSpace:"nowrap"}}>{fmt(aCusts.reduce((s,c)=>s+aMods.reduce((ss,m)=>{const effPrice=sellPriceDrafts[m.key]!==undefined?(Number(sellPriceDrafts[m.key])||0):(m.sellPrice||0);return ss+getGroupQtyLocal(m,c.id)*effPrice},0),0))+" ج.م"}</td><td style={TD}></td></tr>}
            {/* V15.37: Save/cancel row — shows only when there are draft changes */}
            {sessCanEdit&&Object.keys(sellPriceDrafts).length>0&&<tr style={{background:"#F59E0B08"}}>
              <td colSpan={fMods.length+2} style={{...TD,padding:"8px 12px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                  <div style={{fontSize:FS-1,color:T.warn,fontWeight:700}}>
                    ⚠️ لديك {Object.keys(sellPriceDrafts).length} تعديل غير محفوظ في الأسعار
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <Btn small onClick={cancelSellPriceDrafts} style={{background:T.bg,color:T.textSec,border:"1px solid "+T.brd,fontSize:FS-2}}>إلغاء</Btn>
                    <Btn small onClick={saveSellPrices} style={{background:"#8B5CF6",color:"#fff",border:"none",fontSize:FS-2,fontWeight:700}}>💾 حفظ الأسعار + مزامنة البيع</Btn>
                  </div>
                </div>
              </td>
            </tr>}
          </tbody>
        </table>
      </div>
      <div style={{display:"flex",gap:10,justifyContent:"center",alignItems:"center",padding:"12px 24px",borderTop:"1px solid "+T.brd,flexShrink:0,flexWrap:"wrap"}}>
        {/* V19.70.22: dirty indicator + explicit save button. The save button lights
            up only when there are unsaved local edits. Clicking it commits the entire
            localGrid in one upSales call — no per-cell flicker. */}
        {sessCanEdit && localGridDirty && (
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"4px 10px",borderRadius:8,background:T.warn+"15",border:"1px solid "+T.warn+"40"}}>
            <span style={{fontSize:FS-2,color:T.warn,fontWeight:700}}>● تغييرات غير محفوظة</span>
          </div>
        )}
        {sessCanEdit && (
          <Btn onClick={()=>saveAllLocalGrid(activeSess.id)} disabled={!localGridDirty}
            style={{background:localGridDirty?T.ok:T.bg,color:localGridDirty?"#fff":T.textMut,border:"none",fontWeight:700,padding:"8px 24px",opacity:localGridDirty?1:0.6}}>
            💾 حفظ التغييرات
          </Btn>
        )}
        <Btn onClick={()=>printSession(activeSess.id)} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30",padding:"8px 20px"}} title="طباعة جدول التوزيع">🖨 طباعة الجدول</Btn>
        <Btn onClick={()=>{const sel={};aCusts.forEach(c=>{sel[c.id]=true});setGroupPrint({sessId:activeSess.id,selCusts:sel,receiver:""})}} style={{background:"#8B5CF612",color:"#8B5CF6",border:"1px solid #8B5CF630",padding:"8px 20px"}}>🖨 طباعة مجمعة</Btn>
        <Btn ghost onClick={()=>closeMatrix(true)} style={{padding:"8px 20px"}}>✕ إغلاق</Btn>
      </div>
    </div></div>}
    {/* Grouped Print Popup */}
    {groupPrint&&(()=>{const sess=sessions.find(s=>s.id===groupPrint.sessId);if(!sess)return null;
      /* V15.32: Use grouped models so same modelNo merges (matches matrix popup behavior) */
      const gCusts=sess.custIds.map(id=>customers.find(c=>c.id===id)).filter(Boolean);
      const gMods=groupSessionModels(sess);
      const g=sess.grid||{};const selCount=Object.values(groupPrint.selCusts).filter(Boolean).length;
      const selTotal=gCusts.filter(c=>groupPrint.selCusts[c.id]).reduce((s,c)=>gMods.reduce((ss,m)=>ss+getGroupQtyForPrint(m,c.id,g),0)+s,0);
      /* V19.80.22: removed buildOneCustomerPayload (the input adapter for the
         broken jsPDF + custom-Arabic-shaper engine) — see the import comment
         at the top of this file for the full background. The active path is
         now buildOneCustomerHTML + htmlToPdfBase64 (html2canvas → jsPDF image),
         which mirrors the per-row print receipt's HTML and renders Arabic
         natively via the browser instead of trying to pre-shape glyphs in JS. */

      /* V19.70.12: helper — build the per-customer receipt HTML block.
         V19.70.13: rewritten to mirror the existing per-row print output EXACTLY
         (the same HTML the user gets when clicking 🖨 on a single customer row),
         wrapped with the CLARK header/footer + inline styles needed since we render
         offscreen (not via printPage which adds them automatically). QR is embedded
         as a data URL (pre-generated via the qrcode library) so html2canvas captures
         it without async CDN dependency. Returns: { html, totals }.
         V19.80.22: this is now the ACTIVE path again (jsPDF approach removed). */
      const buildOneCustomerHTML = async (c, sigStr, opts) => {
        const noP = (opts && opts.noPrices) || groupPrint.noPrices === true;
        const origin = window.location.origin;
        const confirmUrl = sigStr ? origin+"/?dc=1&s="+encodeURIComponent(sess.id)+"&c="+encodeURIComponent(c.id)+"&sig="+encodeURIComponent(sigStr) : "";
        /* Pre-generate QR as data URL (no CDN race conditions) */
        let qrDataUrl = "";
        if (confirmUrl) {
          try {
            const QRCode = (await import("qrcode")).default;
            qrDataUrl = await QRCode.toDataURL(confirmUrl, { width: 200, errorCorrectionLevel: 'M', margin: 1 });
          } catch (_) { /* skip QR — receipt still works */ }
        }
        /* Compute totals while building items */
        let custMoney = 0, rowTotal = 0;
        let itemsHTML = "";
        gMods.forEach(m => {
          const q = getGroupQtyForPrint(m, c.id, g);
          if (q > 0) {
            rowTotal += q;
            const oids = m.orderIds || [m.id];
            let price = 0;
            for (const oid of oids) {
              const o = orders.find(x => x.id === oid);
              if (o) {
                const dd = (o.customerDeliveries || []).find(d => d.custId === c.id && d.sessionId === sess.id && Number(d.price) > 0);
                if (dd) { price = Number(dd.price); break; }
                if (Number(o.sellPrice) > 0) { price = Number(o.sellPrice); break; }
              }
            }
            const lineTotal = q * price;
            custMoney += lineTotal;
            itemsHTML += "<tr><td><b>"+m.modelNo+"</b></td><td>"+(m.modelDesc||"")+"</td><td style='font-weight:800;color:#0284C7;text-align:center'>"+q+"</td>"+(noP?"":"<td style='text-align:center'>"+(price?fmt(price):"—")+"</td><td style='text-align:center;font-weight:700'>"+fmt(lineTotal)+"</td>")+"</tr>";
          }
        });
        /* V21.9.190: prefer session-level override (sess.custDisc[c.id]) so
           the receipt matches what the user typed in the Plan tab. Falls back
           to c.discount → 10. */
        const discPct = getEffectiveDiscount(c, sess);
        const discAmt = Math.round(custMoney * discPct / 100);
        const netAmt = custMoney - discAmt;
        const factoryName = config.factoryName || "CLARK ERP System";
        const factoryLogo = config.logo || "";
        const factoryAddr = config.address || "";
        const factoryPhone = config.phone || "";
        const today = new Date().toLocaleDateString("ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
        const timeStr = new Date().toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
        const title = "اذن تسليم — " + c.name;
        let brandSub = "نظام إدارة مصانع الملابس";
        if (factoryAddr) brandSub = factoryAddr;
        if (factoryAddr && factoryPhone) brandSub = factoryAddr + " • " + factoryPhone;
        else if (factoryPhone) brandSub = factoryPhone;
        /* V19.80.22: Inline styles — Arial-first font stack per user request.
           Arial covers Latin/digits with familiar shapes; Tahoma is Windows's
           standard Arabic-supporting fallback (visually similar to Arial for
           Arabic, which Arial itself doesn't ship glyphs for); 'Segoe UI'
           covers Windows 10+ Arabic; 'GeezaPro' covers macOS Arabic; sans-serif
           is the final fallback. The browser auto-selects the first family
           that has a glyph for each character — Arabic chars hit Tahoma/Segoe
           while Latin chars stay on Arial. No CDN font download needed.

           The print version (per-row 🖨 button) uses a separate path inside
           printPage that may still use Cairo — that's intentional, only the
           auto-WhatsApp PDF was broken and is what's getting fixed here. */
        const styles =
          "*{margin:0;padding:0;box-sizing:border-box}"+
          "body{font-family:Arial,Tahoma,'Segoe UI','GeezaPro',sans-serif;padding:24px 28px;font-size:12px;direction:rtl;color:#1E293B;line-height:1.5}"+
          "h2{font-size:15px;color:#0284C7;margin:14px 0 8px;padding-bottom:4px;border-bottom:2px solid #E2E8F0}"+
          "table{width:100%;border-collapse:collapse;margin:8px 0 14px;border:1px solid #94A3B8}"+
          /* V19.70.19: structural workaround for the persistent Arabic shaping bug.
             Three previous attempts failed (V19.70.14 link/document.fonts.load,
             V19.70.15 FontFace API, V19.70.16 system fonts). The bug is specifically
             scoped to <th> elements inside html2canvas's internal iframe — body <td>
             cells render Arabic correctly with the SAME font and SAME weight. So
             instead of fighting html2canvas's <th> handling, we drop <th> entirely
             and use <td class='h'> styled to look like a header. Structurally a body
             cell (which is known to work), visually identical to the old header.
             User's idea: "تجميد العناوين زي الكتابة النصية الثابتة" — exactly this. */
          "td{padding:4px 8px;text-align:right;border:1px solid #CBD5E1;font-size:11px}"+
          /* V19.80.23: removed letter-spacing:0.3px from .h — it broke Arabic
             ligatures in html2canvas (chars couldn't join, headers rendered
             as overlapping isolated glyphs like "لعمميل" instead of "العميل").
             Tahoma moved BEFORE Arial because Arial Latin has no Arabic glyphs;
             when html2canvas falls back, the timing race can leave headers in
             a partial-glyph state. Tahoma has Arabic natively on every Windows
             since XP, so the browser commits to it immediately. font-weight
             reduced from 700 to 600 to avoid synthetic-bold thickening that
             also broke joining at small font-sizes. */
          ".h{background:linear-gradient(180deg,#E2E8F0,#CBD5E1)!important;font-family:Tahoma,Arial,'Segoe UI','GeezaPro',sans-serif;font-weight:600;font-size:10px;color:#1E293B;padding:5px 8px;text-align:right;border:1px solid #94A3B8}"+
          "tr:nth-child(even){background:#F8FAFC}"+
          ".hdr{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #0284C7;padding-bottom:14px;margin-bottom:20px;gap:16px}"+
          ".hdr-brand{display:flex;align-items:center;gap:12px;flex:1}"+
          ".hdr-brand img{height:50px;max-width:90px;object-fit:contain}"+
          ".hdr-brand-text{line-height:1.3}"+
          ".hdr-brand-name{font-size:17px;font-weight:800;color:#0F172A}"+
          ".hdr-brand-sub{font-size:10px;color:#64748B;font-weight:600;margin-top:2px}"+
          ".hdr-title{text-align:left;flex-shrink:0;padding:8px 14px;background:#F0F9FF;border:1px solid #BAE6FD;border-radius:8px;min-width:160px}"+
          ".hdr-title-main{font-size:14px;font-weight:800;color:#0369A1;line-height:1.2}"+
          ".hdr-title-date{font-size:10px;color:#64748B;font-weight:600;margin-top:4px;font-family:monospace}"+
          ".sig{margin-top:40px;display:flex;justify-content:space-around;gap:20px}"+
          ".sig-box{text-align:center;min-width:150px;border-top:2px solid #1E293B;padding-top:10px;font-weight:700;font-size:12px}"+
          ".foot{margin-top:30px;padding-top:10px;border-top:2px solid #CBD5E1;text-align:center;font-size:9px;color:#64748B;font-weight:600;display:flex;justify-content:space-between;gap:10px}"+
          ".foot-brand{font-weight:800;color:#0284C7}"+
          ".foot-meta{color:#94A3B8;font-weight:500}";
        /* Build full HTML — header + body + footer (mirrors printPage output) */
        let h = "<style>" + styles + "</style>";
        /* Header */
        h += "<div class='hdr'>"
          + "<div class='hdr-brand'>"
            + (factoryLogo ? "<img src='"+factoryLogo+"'/>" : "")
            + "<div class='hdr-brand-text'>"
              + "<div class='hdr-brand-name'>"+factoryName+"</div>"
              + "<div class='hdr-brand-sub'>"+brandSub+"</div>"
            + "</div>"
          + "</div>"
          + "<div class='hdr-title'>"
            + "<div class='hdr-title-main'>"+title+"</div>"
            + "<div class='hdr-title-date'>"+today+" • "+timeStr+"</div>"
          + "</div>"
        + "</div>";
        /* Body — same structure as the per-row print HTML */
        h += "<h2>🚚 اذن تسليم عميل</h2>";
        /* V19.70.19: <th> → <td class='h'> — same visual, structurally a body cell.
           html2canvas renders Arabic in <td> correctly, but breaks shaping inside <th>. */
        h += "<table><tr><td class='h'>العميل</td><td><b>"+c.name+"</b></td><td class='h'>التليفون</td><td>"+ltrPhone(c.phone||"")+"</td></tr><tr><td class='h'>التاريخ</td><td>"+sess.date+"</td><td class='h'>العنوان</td><td>"+(c.address||"—")+"</td></tr></table>";
        h += "<h2>تفاصيل الاستلام</h2>";
        h += "<table><thead><tr><td class='h'>الموديل</td><td class='h'>الوصف</td><td class='h'>الكمية</td>"+(noP?"":"<td class='h'>السعر</td><td class='h'>الإجمالي</td>")+"</tr></thead><tbody>";
        h += itemsHTML;
        h += "<tr style='background:#F1F5F9'><td colspan='2' style='font-weight:800'>الاجمالي</td><td style='font-weight:800;color:#0284C7;font-size:14px;text-align:center'>"+rowTotal+" قطعة</td>"+(noP?"":"<td></td><td style='font-weight:800;color:#0284C7;font-size:14px;text-align:center'>"+fmt(custMoney)+" ج.م</td>")+"</tr></tbody></table>";
        if (!noP) {
          h += "<div style='margin-top:12px;padding:12px;border:2px solid #000;border-radius:8px'>"
            + "<div style='display:flex;justify-content:space-between;margin-bottom:6px'><span style='font-weight:700'>الاجمالي قبل الخصم</span><span style='font-weight:800'>"+fmt(custMoney)+" ج.م</span></div>";
          if (discPct > 0) {
            h += "<div style='display:flex;justify-content:space-between;margin-bottom:6px;color:#EF4444'><span style='font-weight:700'>خصم "+discPct+"%</span><span style='font-weight:800'>- "+fmt(discAmt)+" ج.م</span></div>";
          }
          h += "<div style='display:flex;justify-content:space-between;padding-top:8px;border-top:2px solid #000'><span style='font-weight:800;font-size:15px'>الصافي المستحق</span><span style='font-weight:900;font-size:17px;color:#059669'>"+fmt(netAmt)+" ج.م</span></div>"
            + "</div>";
        }
        if (qrDataUrl) {
          h += "<div style='margin-top:14px;padding:12px;border:2px dashed #0EA5E9;border-radius:10px;display:flex;align-items:center;gap:14px;background:#F0F9FF;page-break-inside:avoid'>"
            + "<img src='"+qrDataUrl+"' style='width:100px;height:100px;flex-shrink:0' alt='QR'/>"
            + "<div style='flex:1;font-size:12px;line-height:1.6'>"
            + "<div style='font-size:14px;font-weight:800;color:#0369A1;margin-bottom:3px'>📱 تأكيد الاستلام</div>"
            + "<div style='color:#475569'>بعد مطابقة البضاعة، امسح الكود للتأكيد أو الإبلاغ عن مشكلة.</div>"
            + "<div style='color:#94A3B8;font-size:10px;margin-top:3px'>الرابط صالح لمدة 24 ساعة من التأكيد</div>"
            + "</div></div>";
        }
        h += "<div class='sig'><div class='sig-box'>مسؤول التسليم</div><div class='sig-box'>توقيع العميل<br/>"+c.name+"</div></div>";
        h += "<div class='foot'><span class='foot-brand'>"+factoryName+"</span><span class='foot-meta'>"+today+" • Powered by CLARK ERP System</span></div>";
        return { html: h, totals: { qty: rowTotal, money: custMoney, netMoney: netAmt, discAmt, discPct } };
      };

      /* V19.70.12: send WhatsApp delivery receipt to selected customers.
         For each selected customer with phone:
         1. Generate per-customer HTML
         2. Convert to PDF base64 via html2canvas + jsPDF (lazy-loaded)
         3. POST to bridge /send with text summary + PDF media attachment
         4. Update waSent status (badge in the list) */
      const doSendWhatsApp = async () => {
        const selC = gCusts.filter(c=>groupPrint.selCusts[c.id]);
        if (selC.length === 0) { showToast("⚠️ اختار عميل واحد على الأقل"); return; }
        const withPhone = selC.filter(c => c.phone && String(c.phone).trim());
        if (withPhone.length === 0) { showToast("⚠️ مفيش عميل عنده رقم تليفون مسجّل"); return; }
        const noPhoneCount = selC.length - withPhone.length;
        const bridgeUrl = (data.campaignBridge||{}).url || "";
        const bridgeToken = (data.campaignBridge||{}).token || "";
        if (!bridgeUrl) { showToast("⛔ الـbridge URL غير مضبوط — افتح Campaigns → Bridge Settings أولاً"); return; }
        /* V19.70.17: PDF inclusion toggleable via groupPrint.includePdf.
           V19.70.23: default flipped to ON. V19.70.24: reverted back to OFF after the
           Cairo TTF CDN returned 403 (the fontsource fallbacks now handle that, but
           the user prefers explicit opt-in for the PDF — text-only is fast and reliable). */
        const includePdf = groupPrint.includePdf === true;
        const confirm = await ask(
          "إرسال واتساب لـ"+withPhone.length+" عميل",
          (noPhoneCount>0 ? "⚠️ "+noPhoneCount+" عميل بدون رقم — هيتم تخطيهم.\n\n" : "")+
          "هيتم إرسال "+(includePdf ? "إذن استلام (PDF) + رسالة تفاصيل" : "رسالة تفاصيل (نصية فقط — بدون PDF)")+" لكل عميل عبر الـbridge. الإرسال سيكون متتالي مع delays لتجنب الحظر."
        );
        if (!confirm) return;

        /* Mark all targets as pending */
        setGroupPrint(p => ({ ...p, waSent: withPhone.reduce((a,c)=>{a[c.id]="pending";return a;},{...(p.waSent||{})}), waSending: true }));

        /* V19.80.22: load html2canvas + jsPDF (the active PDF stack again,
           replacing the V19.70.23 jsPDF-text + custom-shaper approach that
           rendered Arabic backwards). Only when includePdf is on. */
        if (includePdf) {
          try { await loadPdfLibs(); }
          catch (e) {
            showToast("⛔ فشل تحميل مكتبات الـPDF: "+(e.message||e));
            setGroupPrint(p => ({ ...p, waSending: false }));
            return;
          }
        }

        /* V19.70.17: signatures are only needed for the QR inside the PDF.
           Skip the network round-trip if the user opted out of PDF attachment. */
        let signatures = {};
        if (includePdf) {
          try {
            const _u = auth.currentUser;
            if (_u) {
              const _tok = await _u.getIdToken();
              const pairs = withPhone.map(c=>({sessionId:sess.id,custId:c.id}));
              const r = await fetch("/api/delivery-sign", {method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+_tok},body:JSON.stringify({pairs})});
              const j = await r.json();
              if (r.ok && Array.isArray(j.signatures)) j.signatures.forEach(s=>{signatures[s.custId]=s.sig});
            }
          } catch (_) { /* signatures optional — receipts still work without QR */ }
        }

        let okCount = 0, failCount = 0;
        for (const c of withPhone) {
          /* Mark sending */
          setGroupPrint(p => ({ ...p, waSent: { ...(p.waSent||{}), [c.id]: "sending" } }));
          try {
            /* V19.70.17: build PDF only if the user opted in. The text body is the
               primary content either way — the PDF is decorative supplementary info.
               V19.80.22: reverted to HTML → html2canvas → PDF. The V19.70.23
               jsPDF-text approach with the in-house Arabic shaper rendered every
               Arabic word backwards (e.g. "احمد" → "دمحا") because the shaper
               reversed without applying contextual forms. The HTML approach
               leans on the browser's native RTL/shaping engine — which is the
               same path the per-row print receipt uses, so the auto-PDF and the
               manual print look identical now. */
            let pdfBase64 = "";
            let totals;
            if (includePdf) {
              const out = await buildOneCustomerHTML(c, signatures[c.id]||"", {noPrices:groupPrint.noPrices,receiver:groupPrint.receiver});
              totals = out.totals;
              pdfBase64 = await htmlToPdfBase64(out.html, {
                fontFamily: "Arial, Tahoma, 'Segoe UI', 'GeezaPro', sans-serif",
              });
            } else {
              /* Build totals without HTML — just walk the items once for the text body */
              let qty = 0, money = 0;
              gMods.forEach(m => {
                const q = getGroupQtyForPrint(m, c.id, g);
                if (q > 0) {
                  qty += q;
                  const oids = m.orderIds || [m.id];
                  let price = 0;
                  for (const oid of oids) {
                    const o = orders.find(x => x.id === oid);
                    if (o) {
                      const dd = (o.customerDeliveries || []).find(d => d.custId === c.id && d.sessionId === sess.id && Number(d.price) > 0);
                      if (dd) { price = Number(dd.price); break; }
                      if (Number(o.sellPrice) > 0) { price = Number(o.sellPrice); break; }
                    }
                  }
                  money += q * price;
                }
              });
              /* V21.9.190: same session-aware discount resolution as the HTML path */
              const discPct = getEffectiveDiscount(c, sess);
              const discAmt = Math.round(money * discPct / 100);
              totals = { qty, money, discPct, discAmt, netMoney: money - discAmt };
            }
            /* V19.70.13: build text message in the EXACT same format as the per-row
               WhatsApp button — keeps the customer's experience consistent regardless
               of whether they got the receipt one-at-a-time or via this bulk send. */
            const noP = groupPrint.noPrices === true;
            const linesArr = gMods.map(m => {
              const q = getGroupQtyForPrint(m, c.id, g);
              if (q <= 0) return null;
              const oids = m.orderIds || [m.id];
              let price = 0;
              for (const oid of oids) {
                const o = orders.find(x => x.id === oid);
                if (o) {
                  const dd = (o.customerDeliveries || []).find(d => d.custId === c.id && d.sessionId === sess.id && Number(d.price) > 0);
                  if (dd) { price = Number(dd.price); break; }
                  if (Number(o.sellPrice) > 0) { price = Number(o.sellPrice); break; }
                }
              }
              return "• *"+m.modelNo+"*: "+q+" قطعة"+(price?" × "+fmt(price)+" = "+fmt(q*price)+" ج.م":"");
            }).filter(Boolean);
            let message = "*CLARK — اذن تسليم عميل*\n\n• العميل: *"+c.name+"*\n• التاريخ: *"+sess.date+"*";
            /* V19.70.17: include phone + address in text-only mode so the receipt
               is self-contained without the PDF. */
            if (!includePdf) {
              if (c.phone) message += "\n• التليفون: "+c.phone;
              if (c.address) message += "\n• العنوان: "+c.address;
            }
            message += "\n\n─────────────────\n"+linesArr.join("\n")+"\n─────────────────\n• الاجمالي: *"+totals.qty+"* قطعة";
            if (totals.money > 0 && !noP) {
              message += "\n• الاجمالي: *"+fmt(totals.money)+"* ج.م";
              if (totals.discPct > 0) {
                message += "\n• خصم "+totals.discPct+"%: *-"+fmt(totals.discAmt)+"* ج.م";
                message += "\n• *الصافي المستحق: "+fmt(totals.netMoney)+" ج.م*";
              }
            }
            /* V19.70.17: QR confirmation note only makes sense when the PDF (with QR)
               is attached. In text-only mode, drop it. */
            if (includePdf) {
              message += "\n\n📱 *برجاء مسح كود QR في إذن التسليم للتأكيد باستلام البضاعة كاملة*";
            }
            /* V18.33: optional account-summary footer (controlled by printSettings) */
            try { message += formatCustomerSummaryWA(buildCustomerSummary(c.id, data), (data?.printSettings||{}).whatsappSummary); }
            catch (_) { /* skip footer if helper fails */ }
            /* POST to bridge /send. V19.70.17: media payload omitted in text-only mode. */
            const headers = { "Content-Type":"application/json" };
            if (bridgeToken) headers["Authorization"] = "Bearer "+bridgeToken;
            const messageBody = { phone: c.phone, message };
            if (includePdf) {
              const fileName = "اذن_استلام_"+c.name.replace(/[^؀-ۿa-zA-Z0-9_-]/g,"_")+"_"+sess.date+".pdf";
              messageBody.media = [{ base64: pdfBase64, mime: "application/pdf", name: fileName }];
            }
            /* V21.9.91 (WhatsApp audit Bug #1): AbortController + timeout.
               Pre-V21.9.91 the bridge fetch had no timeout. If the bridge
               hung, the await would hold the function until the Vercel
               function-kill window (~10s hobby) → no clean failure path →
               orphan inFlight state in the WhatsApp pipeline. Documented
               in CLAUDE.md §10 as the V21.9.41 anti-pattern. */
            const _ctrl = new AbortController();
            const _timeout = setTimeout(() => _ctrl.abort(), 8_000);
            let r, j;
            try {
              r = await fetch(bridgeUrl.replace(/\/+$/,"")+"/send", {
                method:"POST", headers,
                body: JSON.stringify({ messages: [messageBody] }),
                signal: _ctrl.signal,
              });
              j = await r.json().catch(()=>({}));
            } finally {
              clearTimeout(_timeout);
            }
            if (!r.ok) throw new Error(j.error || ("HTTP "+r.status));
            okCount++;
            setGroupPrint(p => ({ ...p, waSent: { ...(p.waSent||{}), [c.id]: "sent" } }));
          } catch (e) {
            failCount++;
            const errMsg = e?.name === "AbortError" ? "timeout (8s)" : (e.message||String(e));
            setGroupPrint(p => ({ ...p, waSent: { ...(p.waSent||{}), [c.id]: "failed", waLastErr: { ...(p.waLastErr||{}), [c.id]: errMsg } } }));
          }
        }
        setGroupPrint(p => ({ ...p, waSending: false }));
        showToast("✓ "+okCount+" نجحت • "+(failCount?("⛔ "+failCount+" فشلت"):""));
      };

      const doPrintGroup=async()=>{const selC=gCusts.filter(c=>groupPrint.selCusts[c.id]);if(selC.length===0){showToast("⚠️ اختار عميل واحد على الأقل");return}
        /* V15.50: Fetch signed URLs from backend — one per customer */
        /* V16.12: include Firebase ID token (delivery-sign now requires admin/manager) */
        let signatures={};let signErr="";
        try{
          const _u=auth.currentUser;
          if(!_u){signErr="يرجى تسجيل الدخول";throw new Error(signErr)}
          const _tok=await _u.getIdToken();
          const pairs=selC.map(c=>({sessionId:sess.id,custId:c.id}));
          const r=await fetch("/api/delivery-sign",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+_tok},body:JSON.stringify({pairs})});
          const j=await r.json();
          if(r.ok&&Array.isArray(j.signatures)){
            j.signatures.forEach(s=>{signatures[s.custId]=s.sig});
          }else{
            signErr=(j&&j.error)?j.error:"HTTP "+r.status;
          }
        }catch(e){
          signErr=signErr||("Network: "+(e.message||e));
        }
        /* V15.52: Clear diagnostic feedback */
        if(Object.keys(signatures).length===0){
          console.error("[CLARK] /api/delivery-sign failed:",signErr);
          showToast("⚠️ QR مش هيظهر — "+signErr);
        }
        const origin=window.location.origin;
        const noP=groupPrint.noPrices===true;/* V18.58: hide prices when delivering for warehouse */
        let h="<h2 style='text-align:center'>CLARK — "+(noP?"إذن تسليم مخزن":"إذن تسليم")+"</h2>";
        h+="<table style='margin:0 auto 16px;font-size:12px'><tr><td style='padding:4px 12px;font-weight:700'>التاريخ</td><td style='padding:4px 12px'>"+sess.date+"</td>"+(groupPrint.receiver?"<td style='padding:4px 12px;font-weight:700'>المستلم</td><td style='padding:4px 12px;font-weight:800;font-size:14px'>"+groupPrint.receiver+"</td>":"")+"</tr></table>";
        let grandTotal=0,grandMoney=0,grandNetMoney=0;
        selC.forEach((c,ci)=>{let custTotal=0,custMoney=0;
          const sig=signatures[c.id]||"";
          const confirmUrl=sig?origin+"/?dc=1&s="+encodeURIComponent(sess.id)+"&c="+encodeURIComponent(c.id)+"&sig="+encodeURIComponent(sig):"";
          const pageBreak=ci>0?"page-break-before:always;":"";
          h+="<div style='"+pageBreak+"padding-top:10px'>";
          h+="<h3 style='margin-top:14px;padding:4px 8px;background:#EFF6FF;border-right:4px solid #0EA5E9'>"+c.name+(c.phone?"  <span style='font-size:11px;color:#64748B;font-weight:600'>"+ltrPhone(c.phone)+"</span>":"")+"</h3>";
          /* V18.58: Conditional table headers */
          h+="<table><thead><tr><th>الموديل</th><th>الوصف</th><th>الكمية</th>"+(noP?"":"<th>السعر</th><th>الإجمالي</th>")+"</tr></thead><tbody>";
          gMods.forEach(m=>{const q=getGroupQtyForPrint(m,c.id,g);if(q>0){
            /* Price: use the first matching order's sellPrice (or per-delivery price if one exists) */
            const oids=m.orderIds||[m.id];
            let price=0;
            for(const oid of oids){const o=orders.find(x=>x.id===oid);if(o){
              /* Check for discounted delivery in this session for this customer first */
              const dd=(o.customerDeliveries||[]).find(d=>d.custId===c.id&&d.sessionId===sess.id&&Number(d.price)>0);
              if(dd){price=Number(dd.price);break}
              if(Number(o.sellPrice)>0){price=Number(o.sellPrice);break}
            }}
            const lineTotal=q*price;custTotal+=q;custMoney+=lineTotal;
            h+="<tr><td style='font-weight:800'>"+m.modelNo+(m.isGrouped?" <span style='font-size:9px;color:#8B5CF6'>⧉"+m.orderIds.length+"</span>":"")+"</td><td>"+m.modelDesc+"</td><td style='text-align:center;font-weight:800;color:#0EA5E9'>"+q+"</td>"+(noP?"":"<td style='text-align:center'>"+(price?fmt(price):"—")+"</td><td style='text-align:center;font-weight:700'>"+fmt(lineTotal)+"</td>")+"</tr>";
          }});
          /* V18.58: Conditional totals row */
          h+="<tr style='background:#F0F9FF;font-weight:800'><td colspan='2'>اجمالي "+c.name+"</td><td style='text-align:center;color:#0EA5E9'>"+custTotal+"</td>"+(noP?"":"<td></td><td style='text-align:center;color:#0EA5E9'>"+fmt(custMoney)+"</td>")+"</tr></tbody></table>";
          /* V15.55: Discount breakdown from customer card — V18.58: hidden when noPrices.
             V21.9.190: precedence sess.custDisc[c.id] > c.discount > 10. */
          const discPct=getEffectiveDiscount(c, sess);
          const discAmt=Math.round(custMoney*discPct/100);
          const netAmt=custMoney-discAmt;
          if(!noP){
            h+="<div style='margin-top:10px;padding:10px;border:2px solid #000;border-radius:8px;page-break-inside:avoid'>"
              +"<div style='display:flex;justify-content:space-between;margin-bottom:5px'><span style='font-weight:700'>الاجمالي قبل الخصم</span><span style='font-weight:800'>"+fmt(custMoney)+" ج.م</span></div>";
            if(discPct>0){
              h+="<div style='display:flex;justify-content:space-between;margin-bottom:5px;color:#EF4444'><span style='font-weight:700'>خصم "+discPct+"%</span><span style='font-weight:800'>- "+fmt(discAmt)+" ج.م</span></div>";
            }
            h+="<div style='display:flex;justify-content:space-between;padding-top:6px;border-top:2px solid #000'><span style='font-weight:800;font-size:14px'>الصافي المستحق</span><span style='font-weight:900;font-size:16px;color:#059669'>"+fmt(netAmt)+" ج.م</span></div>"
              +"</div>";
          }
          /* V15.50: QR confirmation block — one per customer */
          if(confirmUrl){
            h+="<div style='margin-top:12px;padding:10px;border:2px dashed #0EA5E9;border-radius:10px;display:flex;align-items:center;gap:14px;background:#F0F9FF;page-break-inside:avoid'>"
              +"<canvas class='confirm-qr' data-qr='"+confirmUrl.replace(/'/g,"&#39;")+"' style='width:80px;height:80px;flex-shrink:0'></canvas>"
              +"<div style='flex:1;font-size:11px;line-height:1.6'>"
              +"<div style='font-size:13px;font-weight:800;color:#0369A1;margin-bottom:3px'>📱 تأكيد الاستلام</div>"
              +"<div style='color:#475569'>بعد مطابقة البضاعة، امسح الكود للتأكيد أو الإبلاغ عن مشكلة.</div>"
              +"<div style='color:#94A3B8;font-size:10px;margin-top:3px'>الرابط صالح لمدة 24 ساعة من التأكيد</div>"
              +"</div></div>";
          }
          grandTotal+=custTotal;grandMoney+=custMoney;grandNetMoney+=netAmt;
          h+="</div>";/* end per-customer block */
        });
        const grandDisc=grandMoney-grandNetMoney;
        if(noP){
          /* V18.58: noPrices = simple count-only summary */
          h+="<div style='margin-top:16px;padding:12px;background:#F1F5F9;border-radius:8px;text-align:center'>"
            +"<div style='font-weight:800;font-size:16px'>الإجمالي: "+selC.length+" عملاء | "+grandTotal+" قطعة</div>"
            +"</div>";
        } else {
          h+="<div style='margin-top:16px;padding:12px;background:#F1F5F9;border-radius:8px;text-align:center'>"
            +"<div style='font-weight:800;font-size:14px;margin-bottom:4px'>الاجمالي الكلي: "+selC.length+" عملاء | "+grandTotal+" قطعة</div>"
            +"<div style='font-weight:700;font-size:13px;color:#475569'>قبل الخصم: "+fmt(grandMoney)+" ج.م"
            +(grandDisc>0?" • الخصم: <span style='color:#EF4444'>-"+fmt(grandDisc)+" ج.م</span>":"")
            +"</div>"
            +"<div style='font-weight:900;font-size:18px;color:#059669;margin-top:6px'>الصافي المستحق: "+fmt(grandNetMoney)+" ج.م</div>"
            +"</div>";
        }
        h+="<div class='sig'><div class='sig-box'>مسؤول التسليم</div><div class='sig-box'>المستلم"+(groupPrint.receiver?"<br><b>"+groupPrint.receiver+"</b>":"")+"</div><div class='sig-box'>المراجع</div></div>";
        /* V15.50: Load QRCode.js and render all QR canvases */
        h+="<script src='https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js'></"+"script>";
        h+="<script>function _renderCLARKqrs(){if(typeof QRCode==='undefined'){setTimeout(_renderCLARKqrs,100);return}document.querySelectorAll('.confirm-qr').forEach(function(c){QRCode.toCanvas(c,c.dataset.qr,{width:160,margin:0,errorCorrectionLevel:'M'},function(){})})}_renderCLARKqrs();</"+"script>";
        printPage((noP?"إذن تسليم مخزن — ":"تسليم مجمع — ")+sess.date,h,{factoryName:config.factoryName,logo:config.logo});setGroupPrint(null)};
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setGroupPrint(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:450,maxHeight:"85vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:FS+2,fontWeight:800,color:"#8B5CF6"}}>🖨 طباعة مجمعة</div>
            <Btn ghost small onClick={()=>setGroupPrint(null)}>✕</Btn>
          </div>
          <div style={{fontSize:FS-1,fontWeight:700,color:T.text,marginBottom:8}}>اختار العملاء:</div>
          <div style={{display:"flex",gap:6,marginBottom:8}}>
            <Btn small onClick={()=>setGroupPrint(p=>{const sel={};gCusts.forEach(c=>{sel[c.id]=true});return{...p,selCusts:sel}})} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30",fontSize:FS-2}}>اختار الكل</Btn>
            <Btn small onClick={()=>setGroupPrint(p=>({...p,selCusts:{}}))} style={{background:T.bg,color:T.textSec,border:"1px solid "+T.brd,fontSize:FS-2}}>إلغاء الكل</Btn>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:12}}>
            {gCusts.map(c=>{const t=gMods.reduce((s,m)=>s+getGroupQtyForPrint(m,c.id,g),0);if(t<=0)return null;
              /* V19.70.12: WhatsApp send status badge per customer */
              const waStatus = (groupPrint.waSent||{})[c.id];
              const noPhone = !c.phone || !String(c.phone).trim();
              return<div key={c.id} onClick={()=>setGroupPrint(p=>({...p,selCusts:{...p.selCusts,[c.id]:!p.selCusts[c.id]}}))} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",borderRadius:10,cursor:"pointer",border:"1px solid "+(groupPrint.selCusts[c.id]?"#8B5CF640":T.brd),background:groupPrint.selCusts[c.id]?"#8B5CF608":"transparent"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                  <span style={{fontSize:16}}>{groupPrint.selCusts[c.id]?"☑":"☐"}</span>
                  <span style={{fontWeight:700,color:groupPrint.selCusts[c.id]?"#8B5CF6":T.text}}>{c.name}</span>
                  {/* V19.70.12: WhatsApp status badges */}
                  {waStatus === "sent" && <span style={{padding:"2px 8px",borderRadius:6,fontSize:FS-3,fontWeight:700,background:"#10B98115",color:"#10B981",border:"1px solid #10B98140"}}>✓ تم الإرسال</span>}
                  {waStatus === "sending" && <span style={{padding:"2px 8px",borderRadius:6,fontSize:FS-3,fontWeight:700,background:T.warn+"15",color:T.warn,border:"1px solid "+T.warn+"40"}}>⏳ جاري...</span>}
                  {waStatus === "failed" && <span style={{padding:"2px 8px",borderRadius:6,fontSize:FS-3,fontWeight:700,background:T.err+"15",color:T.err,border:"1px solid "+T.err+"40"}} title={(groupPrint.waLastErr||{})[c.id]||""}>⛔ فشل</span>}
                  {noPhone && !waStatus && <span style={{padding:"2px 8px",borderRadius:6,fontSize:FS-3,fontWeight:700,background:T.textMut+"15",color:T.textMut,border:"1px solid "+T.textMut+"40"}} title="مفيش رقم تليفون مسجّل">📵 بدون رقم</span>}
                </div>
                <span style={{fontWeight:700,color:T.accent}}>{t+" قطعة"}</span>
              </div>})}
          </div>
          
    <div style={{marginBottom:12}}><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>اسم المستلم</label><Inp value={groupPrint.receiver} onChange={v=>setGroupPrint(p=>({...p,receiver:v}))} placeholder="اسم المندوب / المستلم..."/></div>
          {/* V18.58: Print without prices toggle (delivery permit for warehouse) */}
          <div onClick={()=>setGroupPrint(p=>({...p,noPrices:!p.noPrices}))} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,cursor:"pointer",border:"2px solid "+(groupPrint.noPrices?"#F59E0B":T.brd),background:groupPrint.noPrices?"#F59E0B08":"transparent",marginBottom:8}}>
            <span style={{fontSize:18,color:groupPrint.noPrices?"#F59E0B":T.textMut}}>{groupPrint.noPrices?"☑":"☐"}</span>
            <div style={{flex:1}}>
              <div style={{fontSize:FS-1,fontWeight:700,color:groupPrint.noPrices?"#F59E0B":T.text}}>📦 إذن تسليم بدون أسعار</div>
              <div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>للمخزن والسائق — يخفي أعمدة السعر والإجمالي والخصم</div>
            </div>
          </div>
          {/* V19.70.17/24: WhatsApp PDF attachment toggle. Default OFF — explicit opt-in.
              When ON, the V19.70.23 jsPDF + Cairo TTF + Arabic shaper pipeline is used
              (vector output, no html2canvas). The user must tick this box explicitly,
              acknowledging that PDF generation takes ~3-5s/customer + downloads ~80KB
              of Cairo TTFs on first send. */}
          <div onClick={()=>setGroupPrint(p=>({...p,includePdf:!p.includePdf}))} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,cursor:"pointer",border:"2px solid "+(groupPrint.includePdf?"#25D366":T.brd),background:groupPrint.includePdf?"#25D36608":"transparent",marginBottom:12}}>
            <span style={{fontSize:18,color:groupPrint.includePdf?"#25D366":T.textMut}}>{groupPrint.includePdf?"☑":"☐"}</span>
            <div style={{flex:1}}>
              <div style={{fontSize:FS-1,fontWeight:700,color:groupPrint.includePdf?"#25D366":T.text}}>📎 إرفاق نسخة PDF مع رسالة الواتس</div>
              <div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>{groupPrint.includePdf?"PDF + رسالة تفاصيل لكل عميل (vector PDF بـArabic shaping صحيح)":"رسالة تفاصيل نصية فقط (افتراضي — أسرع وأخف)"}</div>
            </div>
          </div>
          <div style={{padding:10,borderRadius:10,background:T.bg,textAlign:"center",marginBottom:12}}>
            <span style={{fontWeight:800,color:"#8B5CF6"}}>{selCount+" عملاء"}</span><span style={{color:T.textMut}}>{" | "}</span><span style={{fontWeight:800,color:T.accent}}>{selTotal+" قطعة"}</span>
          </div>
          {/* V19.70.12: WhatsApp send progress summary */}
          {(() => {
            const sentCount = Object.values(groupPrint.waSent||{}).filter(s=>s==="sent").length;
            const failCount = Object.values(groupPrint.waSent||{}).filter(s=>s==="failed").length;
            if (sentCount > 0 || failCount > 0) {
              return <div style={{padding:8,borderRadius:8,background:"#25D36608",border:"1px solid #25D36630",textAlign:"center",marginBottom:10,fontSize:FS-2}}>
                <span style={{color:"#10B981",fontWeight:700}}>✓ {sentCount} تم الإرسال</span>
                {failCount > 0 && <span style={{marginRight:10,color:T.err,fontWeight:700}}>⛔ {failCount} فشلت</span>}
              </div>;
            }
            return null;
          })()}
          {/* V19.70.12: action buttons row — Print + WhatsApp */}
          <div style={{display:"flex",gap:8}}>
            <Btn onClick={doPrintGroup} disabled={groupPrint.waSending} style={{flex:1,background:"#8B5CF6",color:"#fff",border:"none",fontWeight:700}}>🖨 طباعة</Btn>
            <Btn onClick={doSendWhatsApp} disabled={groupPrint.waSending} style={{flex:1,background:groupPrint.waSending?"#94A3B8":"#25D366",color:"#fff",border:"none",fontWeight:700}}>
              {groupPrint.waSending ? "⏳ جاري الإرسال..." : "📤 إرسال واتساب"}
            </Btn>
          </div>
        </div>
      </div>})()}
    {/* Add Customer to Session Popup */}
    {addCustPick&&(()=>{const sess=sessions.find(s=>s.id===addCustPick.sessId);if(!sess)return null;
      const isModel=addCustPick._type==="model";
      const selCount=Object.values(addCustPick.sel).filter(Boolean).length;
      if(isModel){
        const mAvail=addCustPick._avail||[];const filtered=mAvail.filter(m=>{if(!addCustPick.filter?.trim())return true;const q=addCustPick.filter.trim().toLowerCase();return(m.modelNo||"").includes(q)||(m.modelDesc||"").toLowerCase().includes(q)});
        const doAddModels=()=>{const ids=Object.entries(addCustPick.sel).filter(([,v])=>v).map(([k])=>k);if(ids.length===0){showToast("⚠️ اختار موديل واحد على الأقل");return}
          upSales(d=>{const si=(d.custDeliverySessions||[]).findIndex(s=>s.id===addCustPick.sessId);if(si>=0){ids.forEach(id=>{if(!d.custDeliverySessions[si].modelIds.includes(id))d.custDeliverySessions[si].modelIds.push(id)})}});
          showToast("✅ تم اضافة "+ids.length+" موديل");setAddCustPick(null)};
        return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setAddCustPick(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:420,maxHeight:"80vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontSize:FS+2,fontWeight:800,color:"#8B5CF6"}}>+ اضافة موديلات للتوزيعة</div>
              <Btn ghost small onClick={()=>setAddCustPick(null)}>✕</Btn>
            </div>
            <div style={{marginBottom:10}}><Inp value={addCustPick.filter||""} onChange={v=>setAddCustPick(p=>({...p,filter:v}))} placeholder="بحث برقم الموديل أو الوصف..."/></div>
            {mAvail.length===0?<div style={{textAlign:"center",padding:20,color:T.textMut}}>كل الموديلات المتاحة مضافة</div>:
            <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:12}}>
              {filtered.map(m=><div key={m.id} onClick={()=>setAddCustPick(p=>({...p,sel:{...p.sel,[m.id]:!p.sel[m.id]}}))} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderRadius:10,cursor:"pointer",border:"1px solid "+(addCustPick.sel[m.id]?"#8B5CF640":T.brd),background:addCustPick.sel[m.id]?"#8B5CF608":"transparent"}}>
                <span style={{fontSize:16}}>{addCustPick.sel[m.id]?"☑":"☐"}</span>
                <div style={{flex:1}}><div style={{fontWeight:700,color:addCustPick.sel[m.id]?"#8B5CF6":T.accent}}>{m.modelNo}</div><div style={{fontSize:FS-3,color:T.textMut}}>{m.modelDesc}</div></div>
                <span style={{fontWeight:700,color:T.ok,fontSize:FS-1}}>{m.avail+" قطعة"}</span>
              </div>)}
            </div>}
            {selCount>0&&<Btn onClick={doAddModels} style={{background:"#8B5CF6",color:"#fff",border:"none",fontWeight:700,width:"100%"}}>{"✅ اضافة "+selCount+" موديل"}</Btn>}
          </div>
        </div>
      }
      const existing=new Set(sess.custIds);const avail=customers.filter(c=>!existing.has(c.id));
      const filtered=avail.filter(c=>{if(!addCustPick.filter?.trim())return true;const q=addCustPick.filter.trim().toLowerCase();return(c.name||"").toLowerCase().includes(q)||(c.phone||"").includes(q)});
      const doAdd=()=>{const ids=Object.entries(addCustPick.sel).filter(([,v])=>v).map(([k])=>k);if(ids.length===0){showToast("⚠️ اختار عميل واحد على الأقل");return}
        upSales(d=>{const si=(d.custDeliverySessions||[]).findIndex(s=>s.id===addCustPick.sessId);if(si>=0){ids.forEach(id=>{if(!d.custDeliverySessions[si].custIds.includes(id))d.custDeliverySessions[si].custIds.push(id)})}});
        showToast("✅ تم اضافة "+ids.length+" عميل");setAddCustPick(null)};
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setAddCustPick(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:420,maxHeight:"80vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:FS+2,fontWeight:800,color:T.ok}}>+ اضافة عملاء للتوزيعة</div>
            <Btn ghost small onClick={()=>setAddCustPick(null)}>✕</Btn>
          </div>
          <div style={{marginBottom:10}}><Inp value={addCustPick.filter||""} onChange={v=>setAddCustPick(p=>({...p,filter:v}))} placeholder="بحث بالاسم أو التليفون..."/></div>
          {avail.length===0?<div style={{textAlign:"center",padding:20,color:T.textMut}}>كل العملاء مضافين للتوزيعة</div>:
          <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:12}}>
            {filtered.map(c=><div key={c.id} onClick={()=>setAddCustPick(p=>({...p,sel:{...p.sel,[c.id]:!p.sel[c.id]}}))} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderRadius:10,cursor:"pointer",border:"1px solid "+(addCustPick.sel[c.id]?T.ok+"40":T.brd),background:addCustPick.sel[c.id]?T.ok+"08":"transparent"}}>
              <span style={{fontSize:16}}>{addCustPick.sel[c.id]?"☑":"☐"}</span>
              <div style={{flex:1}}><div style={{fontWeight:700,color:addCustPick.sel[c.id]?T.ok:T.text}}>{c.name}</div><div style={{fontSize:FS-3,color:T.textMut}}>{c.phone||""}{c.type?" | "+c.type:""}</div></div>
            </div>)}
          </div>}
          {selCount>0&&<Btn onClick={doAdd} style={{background:T.ok,color:"#fff",border:"none",fontWeight:700,width:"100%"}}>{"✅ اضافة "+selCount+" عميل"}</Btn>}
        </div>
      </div>})()}
    {/* ══ Sales Dashboard + Stale Alerts ══ */}
    {(!hubView||hubView==="overview")&&(()=>{const totalStock=stockModels.reduce((s,m)=>s+m.stockQty,0);const totalSold=stockModels.reduce((s,m)=>s+m.custDel,0);
      /* V19.70.22: filter avail > 0 to match the popup's totalAvail. Previously this
         summed ALL stockModels including over-sold ones (avail < 0) which made the
         dashboard tile show a smaller number than the popup's "الإجمالي" — the user
         flagged the inconsistency. Now both compute the same way: positive availability
         only. Over-sold models still appear in the matrix with a red indicator
         elsewhere; they just don't dilute the headline number. */
      const totalRemain=stockModels.filter(m=>m.avail>0).reduce((s,m)=>s+m.avail,0);
      const pct=totalStock?Math.round(totalSold/totalStock*100):0;
      const totalRevenue=stockModels.reduce((s,m)=>s+m.custDel*(Number(orders.find(o=>o.id===m.id)?.sellPrice)||0),0);
      const totalCost=orders.reduce((s,o)=>{const t=calcOrder(o);return s+(t.totalCost||0)},0);
      const now=new Date();
      /* Stale models: in stock > 14 days with no sales */
      const staleModels=stockModels.filter(m=>{if(m.avail<=0)return false;const o=orders.find(x=>x.id===m.id);if(!o)return false;
        const lastSaleDate=(o.customerDeliveries||[]).reduce((latest,d)=>d.date>latest?d.date:latest,"");
        const lastStockDate=(o.deliveries||[]).reduce((latest,d)=>d.date>latest?d.date:latest,"");
        const refDate=lastSaleDate||lastStockDate||o.date;const days=Math.floor((now-new Date(refDate))/86400000);return days>=14}).map(m=>{
        const o=orders.find(x=>x.id===m.id);const lastSaleDate=(o?.customerDeliveries||[]).reduce((latest,d)=>d.date>latest?d.date:latest,"");
        const lastStockDate=(o?.deliveries||[]).reduce((latest,d)=>d.date>latest?d.date:latest,"");
        const refDate=lastSaleDate||lastStockDate||o?.date||"";const days=Math.floor((now-new Date(refDate))/86400000);
        return{...m,days,lastDate:refDate}}).sort((a,b)=>b.days-a.days);
      return<div style={{marginBottom:16}}>
        <div style={{display:"grid",gridTemplateColumns:isMob?"repeat(2,1fr)":"repeat(4,1fr)",gap:isMob?8:12,marginBottom:14}}>
          <div style={{padding:12,borderRadius:12,background:T.accent+"08",border:"1px solid "+T.accent+"15",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>تسليم مخزن جاهز</div><div style={{fontSize:isMob?18:24,fontWeight:800,color:T.accent}}>{fmt(totalStock)}</div></div>
          <div style={{padding:12,borderRadius:12,background:T.ok+"08",border:"1px solid "+T.ok+"15",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>المبيعات</div><div style={{fontSize:isMob?18:24,fontWeight:800,color:T.ok}}>{fmt(totalSold)}</div><div style={{fontSize:FS-3,color:T.ok}}>{pct+"%"}</div></div>
          {/* V19.70.20: clickable — opens the model-by-model breakdown popup with print + WA PDF */}
          <div onClick={()=>setAvailPopup({search:""})} style={{padding:12,borderRadius:12,background:T.warn+"08",border:"1px solid "+T.warn+"15",textAlign:"center",cursor:"pointer",transition:"transform 0.15s, box-shadow 0.15s",position:"relative"}}
            onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 4px 12px "+T.warn+"30"}}
            onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow=""}}>
            <div style={{fontSize:FS-2,color:T.textSec}}>رصيد متاح</div>
            <div style={{fontSize:isMob?18:24,fontWeight:800,color:T.warn}}>{fmt(totalRemain)}</div>
            <div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>👆 اضغط للتفاصيل</div>
          </div>
          <div style={{padding:12,borderRadius:12,background:"#8B5CF608",border:"1px solid #8B5CF615",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>الإيرادات</div><div style={{fontSize:isMob?18:24,fontWeight:800,color:"#8B5CF6"}}>{fmt(totalRevenue)}</div><div style={{fontSize:FS-3,color:T.textMut}}>ج.م</div></div>
        </div>
        {/* V16.17: Stale-models alert moved to bottom of page (rendered before closing div) */}
      </div>})()}
    {/* V19.70.20: Available stock breakdown popup. Triggered by clicking the رصيد متاح dashboard card.
        Lists all models with avail>0, splitting series-vs-broken pieces. Sales deplete series first
        (matching the existing رصيد متاح للبيع computation in the matrix), so:
          availSeries = max(0, seriesQty - custDel)
          availBroken = avail - availSeries
        Supports search/filter, browser-native print, and WhatsApp PDF send to ownerPhones from the
        automation config. The PDF uses <td class='h'> headers (V19.70.19 fix) so Arabic shapes correctly. */}
    {availPopup && (()=>{
      const q = String(availPopup.search||"").trim().toLowerCase();
      /* Build the rows. Sort by avail descending so the highest-stock models appear first. */
      const allRows = stockModels
        .filter(m => m.avail > 0)
        .map(m => {
          const seriesQty = Number(m.seriesQty)||0;
          const brokenQty = Number(m.brokenQty)||0;
          const custDel = Number(m.custDel)||0;
          /* Sales deplete series first (matches existing matrix logic). */
          const availSeries = Math.max(0, seriesQty - custDel);
          const availBroken = Math.max(0, m.avail - availSeries);
          const rackSize = Number(m.rackSize)||0;
          const seriesSets = rackSize > 0 ? Math.floor(availSeries / rackSize) : 0;
          return { ...m, availSeries, availBroken, seriesSets, rackSize };
        })
        .sort((a,b) => b.avail - a.avail);
      const rows = q
        ? allRows.filter(r => String(r.modelNo||"").toLowerCase().includes(q) || String(r.modelDesc||"").toLowerCase().includes(q))
        : allRows;
      const totalSeries = rows.reduce((s,r)=>s+r.availSeries,0);
      const totalBroken = rows.reduce((s,r)=>s+r.availBroken,0);
      const totalAvail = rows.reduce((s,r)=>s+r.avail,0);

      /* Build the HTML used by both print and WA-PDF. Same layout, single source of truth. */
      const buildReportHTML = () => {
        const factoryName = config.factoryName || "CLARK ERP System";
        const factoryLogo = config.logo || "";
        const today = new Date().toLocaleDateString("ar-EG", { weekday:"long", year:"numeric", month:"long", day:"numeric" });
        const timeStr = new Date().toLocaleTimeString("ar-EG", { hour:"2-digit", minute:"2-digit" });
        const styles =
          "*{margin:0;padding:0;box-sizing:border-box}"+
          "body{font-family:'Cairo',Arial,sans-serif;padding:20px 24px;font-size:12px;direction:rtl;color:#1E293B;line-height:1.5}"+
          "h2{font-size:16px;color:#F59E0B;margin:14px 0 8px;padding-bottom:4px;border-bottom:2px solid #FED7AA}"+
          "table{width:100%;border-collapse:collapse;margin:8px 0 14px;border:1px solid #94A3B8}"+
          "td{padding:5px 8px;text-align:right;border:1px solid #CBD5E1;font-size:11px}"+
          /* V19.70.19/.20: header cells via <td class='h'> — bypasses html2canvas <th> Arabic bug */
          ".h{background:linear-gradient(180deg,#FEF3C7,#FDE68A)!important;font-family:'Cairo',sans-serif;font-weight:700;font-size:10px;color:#78350F;padding:6px 8px;text-align:center;border:1px solid #D97706;letter-spacing:0.3px}"+
          "tr:nth-child(even){background:#FFFBEB}"+
          ".totals{background:#FEF3C7;font-weight:800;color:#92400E}"+
          ".hdr{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #F59E0B;padding-bottom:14px;margin-bottom:18px;gap:16px}"+
          ".hdr-brand{display:flex;align-items:center;gap:12px;flex:1}"+
          ".hdr-brand img{height:50px;max-width:90px;object-fit:contain}"+
          ".hdr-brand-name{font-size:17px;font-weight:800;color:#0F172A}"+
          ".hdr-title{text-align:left;flex-shrink:0;padding:8px 14px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;min-width:170px}"+
          ".hdr-title-main{font-size:14px;font-weight:800;color:#92400E}"+
          ".hdr-title-date{font-size:10px;color:#A16207;font-weight:600;margin-top:4px;font-family:monospace}"+
          ".summary{display:flex;justify-content:space-around;padding:12px;background:#FEF3C7;border:1px solid #FDE68A;border-radius:10px;margin-bottom:14px}"+
          ".summary-item{text-align:center}"+
          ".summary-label{font-size:10px;color:#78350F;font-weight:600}"+
          ".summary-val{font-size:20px;font-weight:800;color:#92400E;margin-top:2px}";
        let h = "<style>"+styles+"</style>";
        h += "<div class='hdr'>"
          + "<div class='hdr-brand'>"
            + (factoryLogo ? "<img src='"+factoryLogo+"'/>" : "")
            + "<div><div class='hdr-brand-name'>"+factoryName+"</div></div>"
          + "</div>"
          + "<div class='hdr-title'>"
            + "<div class='hdr-title-main'>📦 الموديلات المتاحة</div>"
            + "<div class='hdr-title-date'>"+today+" • "+timeStr+"</div>"
          + "</div>"
        + "</div>";
        h += "<div class='summary'>"
          + "<div class='summary-item'><div class='summary-label'>إجمالي المتاح</div><div class='summary-val'>"+fmt(totalAvail)+"</div></div>"
          + "<div class='summary-item'><div class='summary-label'>سيري</div><div class='summary-val'>"+fmt(totalSeries)+"</div></div>"
          + "<div class='summary-item'><div class='summary-label'>كسر</div><div class='summary-val'>"+fmt(totalBroken)+"</div></div>"
          + "<div class='summary-item'><div class='summary-label'>عدد الموديلات</div><div class='summary-val'>"+rows.length+"</div></div>"
        + "</div>";
        h += "<table><thead><tr>"
          + "<td class='h'>#</td>"
          + "<td class='h'>صورة</td>"
          + "<td class='h'>الموديل</td>"
          + "<td class='h'>الوصف</td>"
          + "<td class='h'>سيري</td>"
          + "<td class='h'>كسر</td>"
          + "<td class='h'>الإجمالي</td>"
        + "</tr></thead><tbody>";
        rows.forEach((r,i) => {
          h += "<tr>"
            + "<td style='text-align:center;color:#94A3B8'>"+(i+1)+"</td>"
            + "<td style='text-align:center;padding:3px'>"+(r.image?"<img src='"+r.image+"' style='width:38px;height:auto;max-height:52px;object-fit:contain;border-radius:4px;border:1px solid #CBD5E1'/>":"—")+"</td>"
            + "<td style='font-weight:700'>"+r.modelNo+"</td>"
            + "<td>"+(r.modelDesc||"—")+"</td>"
            + "<td style='text-align:center;color:#0EA5E9;font-weight:700'>"+r.availSeries+(r.rackSize>0?" <span style=\"color:#94A3B8;font-size:9px\">("+r.seriesSets+"×"+r.rackSize+")</span>":"")+"</td>"
            + "<td style='text-align:center;color:"+(r.availBroken>0?"#EF4444":"#94A3B8")+";font-weight:700'>"+r.availBroken+"</td>"
            + "<td style='text-align:center;color:#F59E0B;font-weight:800;font-size:13px'>"+r.avail+"</td>"
          + "</tr>";
        });
        h += "<tr class='totals'><td colspan='4' style='text-align:left;font-weight:800'>الإجمالي ("+rows.length+" موديل)</td>"
          + "<td style='text-align:center;font-weight:800;color:#0EA5E9'>"+fmt(totalSeries)+"</td>"
          + "<td style='text-align:center;font-weight:800;color:#EF4444'>"+fmt(totalBroken)+"</td>"
          + "<td style='text-align:center;font-weight:800;color:#92400E;font-size:14px'>"+fmt(totalAvail)+"</td></tr>";
        h += "</tbody></table>";
        return h;
      };

      const doPrintReport = () => {
        const html = buildReportHTML();
        printPage("📦 الموديلات المتاحة — "+season, html, {factoryName:config.factoryName,logo:config.logo});
      };

      /* V19.70.22: doSendWA function removed (WhatsApp PDF button taken out per user request).
         The arabicPdf engine remains imported and is still wired up to buildReportHTML for
         print fidelity, but the bulk-send path is gone. */

      return <div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setAvailPopup(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:780,maxHeight:"88vh",display:"flex",flexDirection:"column",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          {/* Header */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div>
              <div style={{fontSize:FS+2,fontWeight:800,color:T.warn}}>📦 الموديلات المتاحة</div>
              <div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>{rows.length} موديل · {fmt(totalAvail)} قطعة إجمالي</div>
            </div>
            <Btn ghost small onClick={()=>setAvailPopup(null)}>✕</Btn>
          </div>
          {/* Summary chips */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
            <div style={{padding:"8px 10px",borderRadius:10,background:T.warn+"08",border:"1px solid "+T.warn+"20",textAlign:"center"}}>
              <div style={{fontSize:FS-3,color:T.textSec}}>الإجمالي</div>
              <div style={{fontSize:FS+4,fontWeight:800,color:T.warn}}>{fmt(totalAvail)}</div>
            </div>
            <div style={{padding:"8px 10px",borderRadius:10,background:T.accent+"08",border:"1px solid "+T.accent+"20",textAlign:"center"}}>
              <div style={{fontSize:FS-3,color:T.textSec}}>سيري</div>
              <div style={{fontSize:FS+4,fontWeight:800,color:T.accent}}>{fmt(totalSeries)}</div>
            </div>
            <div style={{padding:"8px 10px",borderRadius:10,background:T.err+"08",border:"1px solid "+T.err+"20",textAlign:"center"}}>
              <div style={{fontSize:FS-3,color:T.textSec}}>كسر</div>
              <div style={{fontSize:FS+4,fontWeight:800,color:T.err}}>{fmt(totalBroken)}</div>
            </div>
          </div>
          {/* V19.70.22: search + print only — WhatsApp PDF button removed per user request
              ("ماله لازمة الطباعة تكفي"). The doSendWA function below is also removed for
              cleanliness. If the user changes their mind, the V19.70.21 jsPDF engine
              (buildAvailableStockPdfBase64) is still wired up in the imports. */}
          <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
            <div style={{flex:1,minWidth:200}}>
              <Inp value={availPopup.search||""} onChange={v=>setAvailPopup(p=>({...p,search:v}))} placeholder="🔍 بحث بالموديل أو الوصف..."/>
            </div>
            <Btn onClick={doPrintReport} style={{background:"#8B5CF6",color:"#fff",border:"none",fontWeight:700}}>🖨 طباعة</Btn>
          </div>
          {/* Table */}
          <div style={{flex:1,overflowY:"auto",border:"1px solid "+T.brd,borderRadius:10}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:FS-1}}>
              <thead style={{position:"sticky",top:0,zIndex:1}}>
                <tr style={{background:T.warn+"15",borderBottom:"2px solid "+T.warn+"40"}}>
                  <td style={{padding:"8px 10px",fontWeight:700,color:T.text,textAlign:"center",fontSize:FS-2,width:40}}>#</td>
                  <td style={{padding:"8px 6px",fontWeight:700,color:T.text,textAlign:"center",fontSize:FS-2,width:56}}>صورة</td>
                  <td style={{padding:"8px 10px",fontWeight:700,color:T.text,fontSize:FS-2}}>الموديل</td>
                  <td style={{padding:"8px 10px",fontWeight:700,color:T.text,fontSize:FS-2}}>الوصف</td>
                  <td style={{padding:"8px 10px",fontWeight:700,color:T.text,textAlign:"center",fontSize:FS-2,width:90}}>سيري</td>
                  <td style={{padding:"8px 10px",fontWeight:700,color:T.text,textAlign:"center",fontSize:FS-2,width:60}}>كسر</td>
                  <td style={{padding:"8px 10px",fontWeight:700,color:T.text,textAlign:"center",fontSize:FS-2,width:80}}>الإجمالي</td>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={7} style={{padding:20,textAlign:"center",color:T.textMut}}>{q?"مفيش نتائج بحث":"مفيش موديلات متاحة"}</td></tr>
                ) : rows.map((r,i)=>(
                  <tr key={r.id} style={{borderBottom:"1px solid "+T.brd,background:i%2===1?T.bg:"transparent"}}>
                    <td style={{padding:"7px 10px",textAlign:"center",color:T.textMut,fontSize:FS-2}}>{i+1}</td>
                    <td style={{padding:"4px 6px",textAlign:"center"}}>{r.image?<img src={r.image} alt="" loading="lazy" style={{width:42,height:"auto",maxHeight:58,objectFit:"contain",borderRadius:6,verticalAlign:"middle",border:"1px solid "+T.brd}}/>:<span style={{color:T.textMut,fontSize:FS-2}}>—</span>}</td>
                    <td style={{padding:"7px 10px",fontWeight:700,color:T.text}}>{r.modelNo}</td>
                    <td style={{padding:"7px 10px",color:T.textSec,fontSize:FS-2}}>{r.modelDesc||"—"}</td>
                    <td style={{padding:"7px 10px",textAlign:"center",fontWeight:700,color:T.accent}}>
                      {r.availSeries}
                      {r.rackSize>0 && r.seriesSets>0 && <div style={{fontSize:FS-3,color:T.textMut,fontWeight:500,marginTop:2}}>{r.seriesSets}×{r.rackSize}</div>}
                    </td>
                    <td style={{padding:"7px 10px",textAlign:"center",fontWeight:700,color:r.availBroken>0?T.err:T.textMut}}>{r.availBroken}</td>
                    <td style={{padding:"7px 10px",textAlign:"center",fontWeight:800,color:T.warn,fontSize:FS}}>{r.avail}</td>
                  </tr>
                ))}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr style={{background:T.warn+"10",borderTop:"2px solid "+T.warn+"40",position:"sticky",bottom:0}}>
                    <td colSpan={4} style={{padding:"8px 10px",fontWeight:800,color:T.text,fontSize:FS-2}}>الإجمالي ({rows.length} موديل)</td>
                    <td style={{padding:"8px 10px",textAlign:"center",fontWeight:800,color:T.accent}}>{fmt(totalSeries)}</td>
                    <td style={{padding:"8px 10px",textAlign:"center",fontWeight:800,color:T.err}}>{fmt(totalBroken)}</td>
                    <td style={{padding:"8px 10px",textAlign:"center",fontWeight:800,color:T.warn,fontSize:FS}}>{fmt(totalAvail)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>;
    })()}
    {/* Season Report Popup */}
    {seasonReport&&(()=>{
      const totalCut=orders.reduce((s,o)=>s+calcOrder(o).cutQty,0);
      const totalWsDel=orders.reduce((s,o)=>s+(o.workshopDeliveries||[]).reduce((ss,wd)=>ss+(Number(wd.qty)||0),0),0);
      const totalWsRcv=orders.reduce((s,o)=>s+(o.workshopDeliveries||[]).reduce((ss,wd)=>(wd.receives||[]).reduce((sss,r)=>sss+(Number(r.qty)||0),0)+ss,0),0);
      const totalStockDel=orders.reduce((s,o)=>s+getConfirmedStock(o),0);
      const totalCustDel=orders.reduce((s,o)=>s+(o.customerDeliveries||[]).reduce((ss,d)=>ss+(Number(d.qty)||0),0),0);
      const totalCustRet=orders.reduce((s,o)=>s+(o.customerReturns||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0),0);
      const netSold=totalCustDel-totalCustRet;const staleCount=stockModels.filter(m=>m.avail>0).length;
      const totalRevenue=orders.reduce((s,o)=>{const price=Number(o.sellPrice)||0;const net=(o.customerDeliveries||[]).reduce((ss,d)=>ss+(Number(d.qty)||0),0)-(o.customerReturns||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0);return s+net*price},0);
      const totalCost=orders.reduce((s,o)=>s+(calcOrder(o).totalCost||0),0);
      const profit=totalRevenue-totalCost;const profitPct=totalRevenue?Math.round(profit/totalRevenue*100):0;
      const topModels=[...orders].map(o=>{const del=(o.customerDeliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);return{modelNo:o.modelNo,desc:o.modelDesc,sold:del,price:Number(o.sellPrice)||0,revenue:del*(Number(o.sellPrice)||0)}}).filter(m=>m.sold>0).sort((a,b)=>b.sold-a.sold).slice(0,5);
      const topCusts=[...customers].map(c=>({name:c.name,total:getCustTotal(c.id)})).filter(c=>c.total>0).sort((a,b)=>b.total-a.total).slice(0,5);
      const worstModels=[...stockModels].filter(m=>m.avail>0).sort((a,b)=>b.avail-a.avail).slice(0,5);
      const printSeason=()=>{let h="<h2 style='text-align:center'>📋 تقرير نهاية الموسم — "+season+"</h2>";
        h+="<h3>ملخص الانتاج</h3><table><tbody>";
        h+="<tr><td style='font-weight:700'>عدد الموديلات</td><td style='font-weight:800'>"+orders.length+"</td><td style='font-weight:700'>اجمالي القص</td><td style='font-weight:800'>"+fmt(totalCut)+"</td></tr>";
        h+="<tr><td style='font-weight:700'>تسليم ورش</td><td>"+fmt(totalWsDel)+"</td><td style='font-weight:700'>استلام ورش</td><td>"+fmt(totalWsRcv)+"</td></tr>";
        h+="<tr><td style='font-weight:700'>مخزن جاهز</td><td>"+fmt(totalStockDel)+"</td><td style='font-weight:700'>نسبة الانجاز</td><td style='font-weight:800;color:#0EA5E9'>"+(totalCut?Math.round(totalStockDel/totalCut*100):0)+"%</td></tr>";
        h+="</tbody></table>";
        h+="<h3>ملخص المبيعات</h3><table><tbody>";
        h+="<tr><td style='font-weight:700'>اجمالي المبيعات</td><td style='font-weight:800;color:#10B981'>"+fmt(netSold)+" قطعة</td><td style='font-weight:700'>المرتجعات</td><td style='color:#EF4444'>"+fmt(totalCustRet)+" ("+(totalCustDel?Math.round(totalCustRet/totalCustDel*100):0)+"%)</td></tr>";
        h+="<tr><td style='font-weight:700'>الرصيد المتبقي</td><td style='color:#F59E0B;font-weight:700'>"+fmt(totalStockDel-netSold)+" قطعة</td><td style='font-weight:700'>نسبة البيع</td><td style='font-weight:800;color:#8B5CF6'>"+(totalStockDel?Math.round(netSold/totalStockDel*100):0)+"%</td></tr>";
        h+="</tbody></table>";
        h+="<h3>الأداء المالي</h3><table><tbody>";
        h+="<tr><td style='font-weight:700'>اجمالي الإيرادات</td><td style='font-weight:800;color:#0EA5E9'>"+fmt(totalRevenue)+" ج.م</td></tr>";
        h+="<tr><td style='font-weight:700'>اجمالي التكاليف</td><td>"+fmt(r2(totalCost))+" ج.م</td></tr>";
        h+="<tr><td style='font-weight:700'>صافي الربح</td><td style='font-weight:800;color:"+(profit>=0?"#10B981":"#EF4444")+"'>"+fmt(r2(profit))+" ج.م ("+profitPct+"%)</td></tr>";
        h+="</tbody></table>";
        h+="<h3>أفضل 5 موديلات مبيعاً</h3><table><thead><tr><th>#</th><th>الموديل</th><th>الوصف</th><th>المبيعات</th><th>الإيراد</th></tr></thead><tbody>";
        topModels.forEach((m,i)=>{h+="<tr><td>"+(i+1)+"</td><td style='font-weight:800'>"+m.modelNo+"</td><td>"+m.desc+"</td><td style='text-align:center;font-weight:700'>"+m.sold+"</td><td style='text-align:center'>"+fmt(m.revenue)+"</td></tr>"});
        h+="</tbody></table>";
        h+="<h3>أفضل 5 عملاء</h3><table><thead><tr><th>#</th><th>العميل</th><th>اجمالي القطع</th></tr></thead><tbody>";
        topCusts.forEach((c,i)=>{h+="<tr><td>"+(i+1)+"</td><td style='font-weight:700'>"+c.name+"</td><td style='text-align:center;font-weight:800;color:#0EA5E9'>"+c.total+"</td></tr>"});
        h+="</tbody></table>";
        if(worstModels.length>0){h+="<h3>موديلات راكدة (أعلى رصيد)</h3><table><thead><tr><th>#</th><th>الموديل</th><th>الوصف</th><th>الرصيد</th></tr></thead><tbody>";
          worstModels.forEach((m,i)=>{h+="<tr style='background:#FEF2F2'><td>"+(i+1)+"</td><td style='font-weight:800'>"+m.modelNo+"</td><td>"+m.modelDesc+"</td><td style='text-align:center;font-weight:800;color:#EF4444'>"+m.avail+"</td></tr>"});
          h+="</tbody></table>"}
        printPage("تقرير الموسم — "+season,h,{factoryName:config.factoryName,logo:config.logo})};
      const mc=(label,val,color,sub)=><div style={{padding:12,borderRadius:12,background:color+"08",border:"1px solid "+color+"15",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>{label}</div><div style={{fontSize:isMob?16:22,fontWeight:800,color}}>{val}</div>{sub&&<div style={{fontSize:FS-3,color:T.textMut}}>{sub}</div>}</div>;
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:isMob?8:16}} onClick={()=>setSeasonReport(false)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:isMob?16:24,width:"100%",maxWidth:isMob?"100%":800,maxHeight:"92vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:FS+4,fontWeight:900,color:"#EF4444"}}>{"📋 تقرير الموسم — "+season}</div>
            <div style={{display:"flex",gap:4}}><Btn small onClick={printSeason} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>🖨</Btn><Btn ghost small onClick={()=>setSeasonReport(false)}>✕</Btn></div>
          </div>
          <div style={{fontSize:FS,fontWeight:700,color:T.textSec,marginBottom:8}}>ملخص الانتاج</div>
          <div style={{display:"grid",gridTemplateColumns:isMob?"repeat(2,1fr)":"repeat(4,1fr)",gap:8,marginBottom:14}}>
            {mc("الموديلات",orders.length,"#0EA5E9")}
            {mc("القص",fmt(totalCut),T.accent)}
            {mc("ورش تسليم",fmt(totalWsDel),"#F59E0B")}
            {mc("ورش استلام",fmt(totalWsRcv),"#10B981")}
            {mc("مخزن جاهز",fmt(totalStockDel),"#059669")}
            {mc("المبيعات",fmt(netSold),"#10B981",(totalStockDel?Math.round(netSold/totalStockDel*100):0)+"%")}
            {mc("المرتجعات",fmt(totalCustRet),"#EF4444",(totalCustDel?Math.round(totalCustRet/totalCustDel*100):0)+"%")}
            {mc("الراكد",fmt(totalStockDel-netSold),"#F59E0B",staleCount+" موديل")}
          </div>
          <div style={{fontSize:FS,fontWeight:700,color:T.textSec,marginBottom:8}}>الأداء المالي</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14}}>
            {mc("الإيرادات",fmt(totalRevenue)+" ج","#0EA5E9")}
            {mc("التكاليف",fmt(r2(totalCost))+" ج","#F59E0B")}
            <div style={{padding:12,borderRadius:12,background:profit>=0?"#10B98108":"#EF444408",border:"1px solid "+(profit>=0?"#10B98115":"#EF444415"),textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>صافي الربح</div><div style={{fontSize:isMob?16:22,fontWeight:800,color:profit>=0?"#10B981":"#EF4444"}}>{fmt(r2(profit))+" ج"}</div><div style={{fontSize:FS-3,color:T.textMut}}>{profitPct+"%"}</div></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:12}}>
            <div><div style={{fontSize:FS,fontWeight:700,color:"#10B981",marginBottom:6}}>🏆 أفضل 5 موديلات</div>
              {topModels.map((m,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",padding:"6px 10px",borderRadius:8,background:i%2===0?T.bg+"80":"transparent"}}><span style={{fontWeight:700,color:T.accent}}>{(i+1)+". "+m.modelNo}</span><span style={{fontWeight:700,color:"#10B981"}}>{m.sold+" ق"}</span></div>)}
            </div>
            <div><div style={{fontSize:FS,fontWeight:700,color:"#0EA5E9",marginBottom:6}}>👥 أفضل 5 عملاء</div>
              {topCusts.map((c,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",padding:"6px 10px",borderRadius:8,background:i%2===0?T.bg+"80":"transparent"}}><span style={{fontWeight:700}}>{(i+1)+". "+c.name}</span><span style={{fontWeight:700,color:"#0EA5E9"}}>{c.total+" ق"}</span></div>)}
            </div>
          </div>
          {worstModels.length>0&&<div style={{marginTop:12}}><div style={{fontSize:FS,fontWeight:700,color:"#EF4444",marginBottom:6}}>⚠️ أعلى رصيد راكد</div>
            {worstModels.map((m,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",padding:"6px 10px",borderRadius:8,background:"#FEF2F2"}}><span style={{fontWeight:700,color:T.accent}}>{m.modelNo+" — "+m.modelDesc}</span><span style={{fontWeight:800,color:"#EF4444"}}>{m.avail+" قطعة"}</span></div>)}
          </div>}
        </div>
      </div>})()}
    {/* Customer Statement Popup */}
    {custStatement==="pick"&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setCustStatement(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"auto",maxWidth:isMob?"100%":"min(92vw, 720px)",minWidth:isMob?"auto":420,maxHeight:"85vh",overflowY:"auto",overflowX:"hidden",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,gap:10}}>
          <div style={{fontSize:FS+2,fontWeight:800,color:T.accent,whiteSpace:"nowrap"}}>📄 كشف حساب — اختر العميل</div>
          <Btn ghost small onClick={()=>setCustStatement(null)} title="إغلاق">✕</Btn>
        </div>
        <div style={{marginBottom:10}}><Inp value={custFilter} onChange={setCustFilter} placeholder="بحث بالاسم أو التليفون..."/></div>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          {customers.filter(c=>{
            /* V18.16: Hide archived from picker — admin can still view via customers-list popup with toggle */
            if(c.archived)return false;
            if(!custFilter.trim())return true;const q=custFilter.trim().toLowerCase();return(c.name||"").toLowerCase().includes(q)||(c.phone||"").includes(q)
          }).map(c=>{
            /* V18.7: Compute rating for picker row */
            const dr=custDelRetMap.get(c.id)||{del:0,ret:0};
            const rating=getCustRating(dr.del,dr.ret);
            return<div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",borderRadius:10,border:"1px solid "+T.brd,gap:10,flexWrap:"nowrap"}} onMouseEnter={e=>e.currentTarget.style.background=T.accent+"08"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <div onClick={()=>{setCustStatement(c.id);setCustFilter("")}} style={{flex:1,minWidth:0,cursor:"pointer",overflow:"hidden",whiteSpace:"nowrap"}}>
              <div style={{textOverflow:"ellipsis",overflow:"hidden"}}><span style={{fontWeight:700}}>{c.name}</span>{c.type&&<span style={{fontSize:FS-3,color:T.textMut,marginRight:6}}>{" ("+c.type+")"}</span>}</div>
              {rating.rated&&<div style={{display:"flex",alignItems:"center",gap:5,marginTop:2}}>
                <Stars value={rating.stars} size={11} gap={1}/>
                <span style={{fontSize:FS-3,fontWeight:700,color:rating.color,direction:"ltr"}}>{rating.stars}</span>
              </div>}
            </div>
            <span onClick={()=>{setCustStatement(c.id);setCustFilter("")}} style={{fontSize:FS-1,color:T.accent,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>{"صافي: "+getCustTotal(c.id)}</span>
            {canEdit&&<Btn small onClick={(e)=>{e.stopPropagation();generatePortalUrl(c.id,c.name)}} style={{background:"#8B5CF615",color:"#8B5CF6",border:"1px solid #8B5CF640",whiteSpace:"nowrap"}} title="رابط الحساب للعميل">📱 رابط</Btn>}
          </div>})}
        </div>
      </div>
    </div>}
    {custStatement&&custStatement!=="pick"&&(()=>{const cust=customers.find(c=>c.id===custStatement);if(!cust)return null;
      /* ── V21.9.193 — per-delivery discount aggregation ──────────────────
         Pre-V21.9.193 the statement summed gross sales/returns per ROW
         (per model) and then applied customer.discount ONCE to the
         aggregated total. After V21.9.190 added per-customer-per-session
         overrides, this produced wrong numbers for any customer with
         mixed-discount sessions:

           Example (the bug report): customer with one invoice at 40%
           and others at 10% would still see EVERYTHING discounted at
           customer.discount (e.g. 10%) on the statement page + portal.
           The card showed "10%" as a hardcoded badge.

         Fix: walk each delivery / return entry once, apply its OWN
         effective discount (entry.discPct → customer.discount → 10)
         via the same chain used by invoices.js, accumulate net values.
         Card displays the AMOUNT (sum of per-delivery discounts) — no
         single % badge anymore since percentages vary across invoices.
         A small "متوسط X%" hint shows the weighted-average effective
         rate for context, not as a multiplier. */
      /* ── V21.9.196 — Invoice-based aggregation (source of truth) ─────────
         V21.9.193 walked deliveries and read `delivery.discPct`. But for
         LEGACY deliveries (committed before V21.9.190 + revised later in
         the Plan tab), the entry's discPct is undefined — even though the
         invoice's discountPct was correctly updated to e.g. 40% via the
         upsert merge logic. So the statement would fall back to
         customer.discount (10%) and produce a wrong total while the
         invoice clearly showed 40%.

         The correct source of truth is the INVOICE. Walk:
           - All non-void salesInvoices for this customer  → sales gross + discount
           - All non-void salesCreditNotes for this customer → returns gross + discount
         Then catch any delivery / return NOT covered by an invoice / CN
         (legacy direct-post mode, or pending invoices) via fallback
         (per-entry discPct → customer.discount → 10).

         The rows[] table (per-model display) still walks deliveries, since
         it shows quantities and gross — not affected by the discount bug. */
      const pickDiscPct = (entry) => {
        if (entry && entry.discPct !== undefined && entry.discPct !== null) {
          const n = Number(entry.discPct);
          if (!isNaN(n)) return n;
        }
        if (cust.discount !== undefined && cust.discount !== null) {
          const n = Number(cust.discount);
          if (!isNaN(n)) return n;
        }
        return 10;
      };

      /* Build sets of delivery / return references that ARE covered by an
         invoice or credit note, so we know which raw entries to skip in the
         fallback pass. Match by _key (preferred — unique per entry) OR by
         (orderId, custId, sessionId) composite. */
      const customerInvoices = (config.salesInvoices || []).filter(inv =>
        inv && inv.status !== "void" && String(inv.customerId) === String(custStatement)
      );
      const customerCreditNotes = (config.salesCreditNotes || []).filter(cn =>
        cn && cn.status !== "void" && String(cn.customerId) === String(custStatement)
      );
      const buildRefKey = (ref) => {
        if (!ref) return "";
        if (ref._key) return "k:" + ref._key;
        return "c:" + (ref.orderId || "") + "|" + (ref.custId || "") + "|" + (ref.sessionId || "");
      };
      const invoicedDeliveryKeys = new Set();
      customerInvoices.forEach(inv => {
        (inv.deliveryRefs || []).forEach(ref => { const k = buildRefKey(ref); if (k) invoicedDeliveryKeys.add(k); });
        if (inv.deliveryRef) { const k = buildRefKey(inv.deliveryRef); if (k) invoicedDeliveryKeys.add(k); }
      });
      const cnReturnKeys = new Set();
      customerCreditNotes.forEach(cn => {
        (cn.returnRefs || []).forEach(ref => { const k = buildRefKey(ref); if (k) cnReturnKeys.add(k); });
        if (cn.returnRef) { const k = buildRefKey(cn.returnRef); if (k) cnReturnKeys.add(k); }
      });

      const rows = []; let totalDel = 0, totalRet = 0;
      let totalValGross = 0, totalSalesAfterDisc = 0;
      let retVal = 0, retValAfterDisc = 0;

      /* Pass 1 — INVOICES (the source of truth for what was billed) */
      customerInvoices.forEach(inv => {
        totalValGross += Number(inv.subtotal) || 0;
        totalSalesAfterDisc += Number(inv.total) || 0;
      });
      let extraDiscTotal = 0; /* V21.21.59: خصومات إضافية (kind=discount) منفصلة عن المرتجعات */
      customerCreditNotes.forEach(cn => {
        if(cn.kind === "discount"){ extraDiscTotal += Number(cn.total) || 0; return; }
        retVal += Number(cn.subtotal) || 0;
        retValAfterDisc += Number(cn.total) || 0;
      });

      /* Pass 2 — DELIVERIES / RETURNS not covered by Pass 1 (legacy
         direct-post mode, deliveries pending invoice creation, or
         orphaned entries). Apply fallback discount chain. */
      orders.forEach(o => {
        const sp = Number(o.sellPrice) || 0;
        const dels = (o.customerDeliveries || []).filter(d => d.custId === custStatement);
        const rets = (o.customerReturns || []).filter(r => r.custId === custStatement);
        const del = dels.reduce((s, d) => s + (Number(d.qty) || 0), 0);
        const ret = rets.reduce((s, r) => s + (Number(r.qty) || 0), 0);
        if (del > 0 || ret > 0) {
          totalDel += del;
          totalRet += ret;
          rows.push({ modelNo: o.modelNo, modelDesc: o.modelDesc, delivered: del, returned: ret, net: del - ret, sellPrice: sp });
        }
        dels.forEach(d => {
          const refKey = buildRefKey({ _key: d._key, orderId: o.id, custId: d.custId, sessionId: d.sessionId });
          const altKey = "c:" + o.id + "|" + d.custId + "|" + (d.sessionId || "");
          if (invoicedDeliveryKeys.has(refKey) || invoicedDeliveryKeys.has(altKey)) return; /* covered by invoice */
          const gross = (Number(d.qty) || 0) * sp;
          const dPct = pickDiscPct(d);
          totalValGross += gross;
          totalSalesAfterDisc += Math.round(gross * (1 - dPct / 100));
        });
        rets.forEach(r => {
          const refKey = buildRefKey({ _key: r._key, orderId: o.id, custId: r.custId });
          if (cnReturnKeys.has(refKey)) return; /* covered by credit note */
          const gross = (Number(r.qty) || 0) * sp;
          const dPct = pickDiscPct(r);
          retVal += gross;
          retValAfterDisc += Math.round(gross * (1 - dPct / 100));
        });
      });

      const totalNet = totalDel - totalRet;
      /* Card display + balance math:
           totalValGross         = invoice subtotals + orphan-delivery gross
           totalGrossAfterDisc   = invoice totals     + orphan-delivery net
           retVal                = CN subtotals       + orphan-return gross
           retValAfterDisc       = CN totals          + orphan-return net
           discAmt               = derived (gross − net)
           totalAfterDisc        = salesAfterDisc − returnsAfterDisc
                                   (matches invoice − credit-note math) */
      const totalGrossAfterDisc = totalSalesAfterDisc;
      const discAmt = totalValGross - totalGrossAfterDisc;
      /* V21.21.59: الخصومات الإضافية تقلّل الرصيد (زي المرتجعات في الأثر) بس متّسجّلة منفصلة */
      const totalAfterDisc = totalGrossAfterDisc - retValAfterDisc - extraDiscTotal;
      const totalVal = totalValGross - retVal; /* legacy alias */
      const discPct = totalValGross > 0
        ? Math.round((1 - (totalGrossAfterDisc / totalValGross)) * 100)
        : (Number(cust.discount) || 0);
      const hasMixedDiscounts = (() => {
        if (customerInvoices.length > 1) {
          const firstPct = Number(customerInvoices[0].discountPct) || 0;
          for (let i = 1; i < customerInvoices.length; i++) {
            if ((Number(customerInvoices[i].discountPct) || 0) !== firstPct) return true;
          }
        }
        return false;
      })();
      /* Customer payments */
      const custPayments=(config.custPayments||[]).filter(p=>p.custId===custStatement).sort((a,b)=>(b.date||"").localeCompare(a.date||""));
      /* V18.23+V18.24: Include receivable checks for this customer where category = 'دفعة عميل' only */
      const custReceivableChecks=(config.checks||[]).filter(c=>c.type==="receivable"&&c.partyId===custStatement&&c.status!=="مرتد"&&c.status!=="ملغي"&&((c.category||"دفعة عميل")==="دفعة عميل"));
      const totalReceivableChecks=custReceivableChecks.reduce((s,c)=>s+(Number(c.amount)||0),0);
      /* V18.64 HOTFIX — Treasury / custPayments desync recovery
         ──────────────────────────────────────────────────────
         Some cash payments end up in the treasury collection but never make
         it into custPayments. Possible causes:
           (a) A treasury entry registered without a linked customer in earlier
               versions (linkedCustId was missing/null at write time)
           (b) Partial restore from a backup that brought back treasuryDays
               but not factory/config.custPayments
           (c) Direct edits to a treasury entry that adopted a custId after
               the original push (V16.68 sync repaired most of these but not
               historic ones)
         
         Fix: read ALL treasury "in" entries linked to this customer and find
         the ones NOT yet represented in custPayments (no matching
         treasuryTxId). Treat them as cash payments for ALL display + balance
         math. The reconcile button below can write them back into
         custPayments permanently. */
      const _knownTreasuryTxIds=new Set(custPayments.map(p=>p.treasuryTxId).filter(Boolean));
      /* V19.11: tombstones — treasury IDs that were explicitly deleted via
         delCustPay must NEVER appear as orphan-payments in the kashf, even
         if the underlying treasury entry temporarily persists (sync race). */
      const _tombstoneIds=new Set(config._deletedCustPayTreasuryIds||[]);
      const orphanTreasuryPayments=(config.treasury||[]).filter(t=>
        t.type==="in" &&
        String(t.custId||"")===String(custStatement) &&
        t.id &&
        !_knownTreasuryTxIds.has(t.id) &&
        !_tombstoneIds.has(t.id) &&
        t.sourceType!=="check_bounce"  /* check-bounce reversals are NOT payments */
      );
      /* V21.9.85 (CustDeliver audit Bug #4): r2() consistency — round at every
         accumulation point to prevent float drift. Pre-V21.9.85 the orphan
         total accumulated raw floats then was only r2'd at the final balance
         step → fractional-cent drift could surface in reconciliation. */
      const orphanTreasuryTotal=r2(orphanTreasuryPayments.reduce((s,t)=>s+(Number(t.amount)||0),0));
      const _custPayTotal=r2(custPayments.reduce((s,p)=>s+(Number(p.amount)||0),0));
      const totalPaidFromCustPayments=r2(_custPayTotal+orphanTreasuryTotal);
      const totalPaid=r2(totalPaidFromCustPayments+totalReceivableChecks);
      /* V18.1+V18.23: Split paid into checks (custPayments method=شيك + receivable checks) vs cash.
         V18.64: Orphan treasury entries are always cash (treasury entries don't carry method). */
      const totalPaidChecksFromPayments=custPayments.filter(p=>(p.method||"")==="شيك").reduce((s,p)=>s+(Number(p.amount)||0),0);
      const totalPaidChecks=totalPaidChecksFromPayments+totalReceivableChecks;
      const totalPaidCash=totalPaidFromCustPayments-totalPaidChecksFromPayments;
      /* FIXED: totalVal already excludes returns, so balance = afterDisc - paid (no -retVal) */
      const custBalance=r2(totalAfterDisc-totalPaid);
      /* V18.64 — Reconcile button handler: copy each orphan treasury entry into
         custPayments so they appear properly going forward. Uses the same
         treasuryTxId pointer so deletions stay linked correctly. */
      const reconcileOrphanPayments=async()=>{
        if(orphanTreasuryPayments.length===0)return;
        const ok=await ask(
          "مزامنة الدفعات",
          "هتم نقل "+orphanTreasuryPayments.length+" دفعة من الخزنة لكشف العميل دلوقتي.\n\nالأرقام في الخزنة مش بتتغير — بس بنحط مرجع لها في كشف الحساب.\n\nمتابعة؟",
          {danger:false}
        );
        if(!ok)return;
        upConfig(d=>{
          if(!d.custPayments)d.custPayments=[];
          orphanTreasuryPayments.forEach(t=>{
            /* Defensive: re-check the orphan condition INSIDE the upConfig callback
               in case another tab raced and already added it. */
            const alreadyExists=(d.custPayments||[]).some(p=>p.treasuryTxId===t.id);
            if(alreadyExists)return;
            d.custPayments.push({
              id:gid(),
              custId:custStatement,
              custName:cust.name||"",
              amount:Number(t.amount)||0,
              date:t.date||"",
              note:(t.notes||t.desc||"دفعة مزامنة من الخزنة"),
              method:"كاش",
              account:t.account||"SUB CASH",
              by:t.by||userName,
              treasuryTxId:t.id,
              reconciledFromTreasury:true,
              reconciledAt:nowISO(),
              createdAt:t.createdAt||nowISO(),
            });
          });
        });
        showToast("✓ تم مزامنة "+orphanTreasuryPayments.length+" دفعة");
      };
      const addCustPayment=()=>{const amt=parseFloat(payAmt);if(!amt||amt<=0){playBeep("error");return}
        /* V15.9: Link payment to treasury via shared IDs — needed for clean deletion later */
        const payId=gid();const txId=gid();
        /* V19.11: Use the user-selected account (or default to MAIN CASH if none picked).
           Previously hardcoded to "SUB CASH" — this routed all customer payments to one
           account regardless of which treasury the cash was actually deposited into. */
        const _resolvedAcc=payAccount||"MAIN CASH";
        /* V18.44: capture treasury account on the payment so accounting can route to the right CoA sub-account */
        const _newPayment={id:payId,custId:custStatement,custName:cust.name,amount:amt,date:payDate_,note:payNote_,method:payMethod,account:_resolvedAcc,by:userName,treasuryTxId:txId,createdAt:nowISO()};
        upConfig(d=>{if(!d.custPayments)d.custPayments=[];
          d.custPayments.push(_newPayment);
          /* Auto-register in treasury as income — linked to the payment */
          if(!d.treasury)d.treasury=[];
          d.treasury.unshift({id:txId,type:"in",amount:amt,desc:"دفعة من عميل "+cust.name+(payNote_?" — "+payNote_:""),notes:payMethod,category:"دفعة عميل",account:_resolvedAcc,season:d.activeSeason||"",date:payDate_,day:dayName(payDate_),sourceType:"cust_payment",custPaymentId:payId,custId:custStatement,by:userName,createdAt:nowISO()})});
        /* V18.35: auto-post journal entry */
        autoPost.customerPay(data, _newPayment, cust, userName).catch(()=>{});
        setPayAmt_("");setPayNote_("");showToast("✓ تم تسجيل الدفعة في حساب العميل وخزنة "+_resolvedAcc)};
      const delCustPay=(pid)=>{
        /* V18.35: capture the payment for accounting reversal BEFORE we delete it */
        const _payToReverse=(data.custPayments||[]).find(p=>p.id===pid);
        upConfig(d=>{
          /* V15.9: Delete linked treasury transaction to keep cashbox in sync */
          const pay=(d.custPayments||[]).find(p=>p.id===pid);
          d.custPayments=(d.custPayments||[]).filter(p=>p.id!==pid);
          if(pay){
            if(pay.treasuryTxId&&d.treasury)d.treasury=d.treasury.filter(t=>t.id!==pay.treasuryTxId);
            /* Legacy fallback: payments before V15.9 didn't have treasuryTxId — match by desc+amount+date */
            else if(d.treasury){
              d.treasury=d.treasury.filter(t=>!(t.category==="دفعة عميل"&&t.custId===pay.custId&&Math.abs((Number(t.amount)||0)-(Number(pay.amount)||0))<0.01&&t.date===pay.date));
            }
            /* V19.11: tombstone — record the deleted treasury IDs so V19.9 recovery
               (which scans treasury for orphan customer payments) won't accidentally
               re-create the deleted payment if its treasury entry persists for any
               reason (sync race, partial delete, legacy doc). The recovery effect
               in TreasuryPg checks this set before re-linking. */
            if(!d._deletedCustPayTreasuryIds)d._deletedCustPayTreasuryIds=[];
            if(pay.treasuryTxId)d._deletedCustPayTreasuryIds.push(pay.treasuryTxId);
            /* V21.9.251: dedup + cap رفعته 200→1000 — الـ FIFO القديم كان ممكن يطرد tombstone لسه محتاجينه */
            d._deletedCustPayTreasuryIds=[...new Set(d._deletedCustPayTreasuryIds)];if(d._deletedCustPayTreasuryIds.length>1000)d._deletedCustPayTreasuryIds=d._deletedCustPayTreasuryIds.slice(-1000);
          }
        });
        /* V18.35: reverse the journal entry if it exists */
        if(_payToReverse) autoPost.reverse(data,"customerPay",_payToReverse.id,_payToReverse.date,"حذف الدفعة",userName).catch(()=>{});
        showToast("✓ تم حذف الدفعة من العميل والخزنة")};
      /* ── V21.9.200 — group this customer's deliveries / returns by session
         into invoice rows (mirrors the customer-portal `buildInvoices`). Used
         by the "سجل حركات" tab AND the detailed print so both match the portal.
         Returns store the session id as `sessId` (not `sessionId`). */
      const buildSessionInvoices=(kind)=>{
        const groups={};
        orders.forEach(o=>{
          const sp=Number(o.sellPrice)||0;
          const list=(kind==="sale"?(o.customerDeliveries||[]):(o.customerReturns||[])).filter(e=>e.custId===custStatement);
          list.forEach(e=>{
            const qty=Number(e.qty)||0;if(qty<=0)return;
            const sid=e.sessionId||e.sessId||("بدون جلسة — "+(e.date||"؟"));
            if(!groups[sid])groups[sid]={sessionId:sid,date:e.date||"",qty:0,value:0,valueAfterDisc:0};
            const price=Number(e.price)||sp;const gross=qty*price;const dPct=pickDiscPct(e);
            groups[sid].qty+=qty;groups[sid].value+=gross;groups[sid].valueAfterDisc+=Math.round(gross*(1-dPct/100));
            if(e.date&&(!groups[sid].date||e.date<groups[sid].date))groups[sid].date=e.date;
          });
        });
        const arr=Object.values(groups).sort((a,b)=>(a.date||"").localeCompare(b.date||""));
        arr.forEach((inv,i)=>{inv.invoiceNo=i+1;});
        return arr.reverse();/* newest first for display */
      };
      const salesSessionInvoices=buildSessionInvoices("sale");
      const returnSessionInvoices=buildSessionInvoices("return");
      /* V21.9.200 — unified payments list (custPayments + receivable checks +
         orphan-treasury), newest first. Used by the "دفعات" tab + detailed
         print so the payment log matches the "إجمالي المدفوع" card exactly. */
      const allPaymentsList=[
        ...custPayments.map(p=>({date:p.date||"",amount:Number(p.amount)||0,method:p.method||"كاش",note:p.note||p.notes||"",by:p.by||""})),
        ...custReceivableChecks.map(c=>({date:c.date||c.dueDate||"",amount:Number(c.amount)||0,method:"شيك",note:("شيك"+(c.checkNo?" #"+c.checkNo:"")+(c.bank?" — "+c.bank:"")+(c.status&&c.status!=="محصل"?" ("+c.status+")":"")),by:""})),
        ...orphanTreasuryPayments.map(t=>({date:t.date||"",amount:Number(t.amount)||0,method:"كاش (خزنة)",note:t.desc||t.note||"",by:t.by||""})),
      ].sort((a,b)=>(b.date||"").localeCompare(a.date||""));
      /* ── V21.9.200 — professional print: shared header + financial summary,
         then two modes — ملخص (summary only) and تفصيلي (+ invoices + payments). */
      const _stmtHeader="<h2 style='text-align:center'>📄 كشف حساب عميل</h2><table style='margin:0 auto 16px'><tr><th style='text-align:right;padding:4px 12px'>العميل</th><td style='padding:4px 12px;font-weight:800'>"+cust.name+"</td><th style='text-align:right;padding:4px 12px'>النوع</th><td style='padding:4px 12px'>"+(cust.type||"—")+"</td></tr><tr><th style='text-align:right;padding:4px 12px'>التليفون</th><td style='padding:4px 12px'>"+cust.phone+"</td><th style='text-align:right;padding:4px 12px'>العنوان</th><td style='padding:4px 12px'>"+(cust.address||"—")+"</td></tr></table>";
      const _stmtFinancialSummary=(()=>{
        let s="<h3>💳 ملخص الحساب</h3><table>";
        s+="<tr><td>"+(discAmt>0?"إجمالي فواتير المبيعات (قبل الخصم)":"إجمالي فواتير المبيعات")+"</td><td style='font-weight:800'>"+fmt(totalValGross)+" ج.م</td></tr>";
        if(discAmt>0){
          s+="<tr><td>قيمة الخصم</td><td style='color:#F59E0B;font-weight:700'>-"+fmt(discAmt)+" ج.م</td></tr>";
          s+="<tr><td>إجمالي فواتير المبيعات (بعد الخصم)</td><td style='font-weight:800;color:#0284C7'>"+fmt(totalGrossAfterDisc)+" ج.م</td></tr>";
          if(retVal>0)s+="<tr><td>قيمة المرتجعات (بعد الخصم)<div style='font-size:9px;color:#64748B'>قبل الخصم: "+fmt(retVal)+" ج.م</div></td><td style='color:#EF4444'>-"+fmt(retValAfterDisc)+" ج.م</td></tr>";
        }else if(retVal>0){
          s+="<tr><td>قيمة المرتجعات</td><td style='color:#EF4444'>-"+fmt(retVal)+" ج.م</td></tr>";
        }
        s+="<tr><td>اجمالي المدفوع (نقدي "+fmt(totalPaidCash)+" + شيكات "+fmt(totalPaidChecks)+")</td><td style='color:#10B981'>-"+fmt(totalPaid)+" ج.م</td></tr>";
        s+="<tr style='font-size:16px;font-weight:800'><td>الرصيد المتبقي</td><td style='color:"+(custBalance>0?"#10B981":custBalance<0?"#EF4444":"#64748B")+"'>"+fmt(custBalance)+" ج.م</td></tr></table>";
        return s;
      })();
      const _logStatementPrint=(mode)=>{
        /* V21.9.88: audit trail of when each kashf was shared (mode = summary|detailed). */
        upConfig(d=>{
          const c=(d.customers||[]).find(x=>x.id===custStatement);
          if(!c)return;
          if(!Array.isArray(c.statementsPrintedLog))c.statementsPrintedLog=[];
          c.statementsPrintedLog.push({at:new Date().toISOString(),by:userName||"",balance:custBalance,mode:mode||"summary"});
          if(c.statementsPrintedLog.length>50)c.statementsPrintedLog=c.statementsPrintedLog.slice(-50);
        });
      };
      const printStatementSummary=()=>{
        let h=_stmtHeader+_stmtFinancialSummary;
        h+="<div class='sig'><div class='sig-box'>مسؤول المبيعات</div><div class='sig-box'>العميل: "+cust.name+"</div></div>";
        printPage("كشف حساب (ملخص) — "+cust.name,h,{factoryName:config.factoryName,logo:config.logo});
        _logStatementPrint("summary");
      };
      const printStatementDetailed=()=>{
        let h=_stmtHeader+_stmtFinancialSummary;
        /* Sales invoices (grouped by session) */
        h+="<h3>🛒 فواتير المبيعات ("+salesSessionInvoices.length+")</h3><table><thead><tr><th>#</th><th>التاريخ</th><th>الكمية</th><th>قبل الخصم</th><th>بعد الخصم</th></tr></thead><tbody>";
        if(salesSessionInvoices.length===0)h+="<tr><td colspan='5' style='text-align:center;color:#94A3B8'>لا توجد مبيعات</td></tr>";
        salesSessionInvoices.forEach(inv=>{h+="<tr><td style='text-align:center;font-weight:800;color:#059669'>#"+inv.invoiceNo+"</td><td style='text-align:center'>"+(inv.date||"—")+"</td><td style='text-align:center;font-weight:700'>"+fmt(inv.qty)+"</td><td style='text-align:center'>"+fmt(inv.value)+"</td><td style='text-align:center;font-weight:800;color:#059669'>"+fmt(inv.valueAfterDisc)+"</td></tr>";});
        if(salesSessionInvoices.length>0)h+="<tr style='background:#ECFDF5;font-weight:800'><td colspan='2'>الإجمالي</td><td style='text-align:center;color:#059669'>"+fmt(salesSessionInvoices.reduce((a,x)=>a+x.qty,0))+"</td><td style='text-align:center'>"+fmt(salesSessionInvoices.reduce((a,x)=>a+x.value,0))+"</td><td style='text-align:center;color:#059669'>"+fmt(salesSessionInvoices.reduce((a,x)=>a+x.valueAfterDisc,0))+"</td></tr>";
        h+="</tbody></table>";
        /* Returns (grouped by session) — only if any */
        if(returnSessionInvoices.length>0){
          h+="<h3>↩️ المرتجعات ("+returnSessionInvoices.length+")</h3><table><thead><tr><th>#</th><th>التاريخ</th><th>الكمية</th><th>قبل الخصم</th><th>بعد الخصم</th></tr></thead><tbody>";
          returnSessionInvoices.forEach(inv=>{h+="<tr><td style='text-align:center;font-weight:800;color:#EF4444'>#"+inv.invoiceNo+"</td><td style='text-align:center'>"+(inv.date||"—")+"</td><td style='text-align:center;font-weight:700'>"+fmt(inv.qty)+"</td><td style='text-align:center'>"+fmt(inv.value)+"</td><td style='text-align:center;font-weight:800;color:#EF4444'>"+fmt(inv.valueAfterDisc)+"</td></tr>";});
          h+="<tr style='background:#FEF2F2;font-weight:800'><td colspan='2'>الإجمالي</td><td style='text-align:center;color:#EF4444'>"+fmt(returnSessionInvoices.reduce((a,x)=>a+x.qty,0))+"</td><td style='text-align:center'>"+fmt(returnSessionInvoices.reduce((a,x)=>a+x.value,0))+"</td><td style='text-align:center;color:#EF4444'>"+fmt(returnSessionInvoices.reduce((a,x)=>a+x.valueAfterDisc,0))+"</td></tr>";
          h+="</tbody></table>";
        }
        /* Payments log (all sources) */
        h+="<h3>💰 سجل الدفعات ("+allPaymentsList.length+")</h3><table><thead><tr><th>التاريخ</th><th>المبلغ</th><th>الطريقة</th><th>ملاحظات</th></tr></thead><tbody>";
        if(allPaymentsList.length===0)h+="<tr><td colspan='4' style='text-align:center;color:#94A3B8'>لا توجد دفعات</td></tr>";
        allPaymentsList.forEach(p=>{h+="<tr><td style='text-align:center'>"+(p.date||"—")+"</td><td style='text-align:center;font-weight:700;color:#10B981'>"+fmt(p.amount)+"</td><td style='text-align:center'>"+p.method+"</td><td>"+(p.note||"")+"</td></tr>";});
        if(allPaymentsList.length>0)h+="<tr style='background:#ECFDF5;font-weight:800'><td>الإجمالي</td><td style='text-align:center;color:#10B981'>"+fmt(totalPaid)+"</td><td colspan='2'></td></tr>";
        h+="</tbody></table>";
        h+="<div class='sig'><div class='sig-box'>مسؤول المبيعات</div><div class='sig-box'>العميل: "+cust.name+"</div></div>";
        printPage("كشف حساب (تفصيلي) — "+cust.name,h,{factoryName:config.factoryName,logo:config.logo});
        _logStatementPrint("detailed");
      };
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:isMob?8:16}} onClick={()=>setCustStatement(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:isMob?16:24,width:"100%",maxWidth:isMob?"100%":750,maxHeight:"90vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4,flexWrap:"wrap",gap:8}}>
            <div>
              <div style={{fontSize:FS+2,fontWeight:800,color:T.accent}}>{"📄 كشف حساب — "+cust.name}</div>
              <div style={{fontSize:FS-2,color:T.textMut}}>{(cust.type||"")+" | "+ltrPhone(cust.phone)}</div>
              {/* V18.7: Customer rating in statement header — V18.11: simplified */}
              {(()=>{const rating=getCustRating(totalDel,totalRet);if(!rating.rated)return null;return<div style={{marginTop:6,display:"inline-flex",alignItems:"center",gap:6,padding:"4px 12px",background:rating.color+"12",borderRadius:999,border:"1px solid "+rating.color+"30"}}>
                <Stars value={rating.stars} size={13} gap={1}/>
                <span style={{fontSize:FS-3,fontWeight:800,color:rating.color,direction:"ltr"}}>{rating.stars}</span>
              </div>})()}
            </div>
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
              {/* V16.3: Customer stats toggle */}
              <Btn small onClick={()=>setShowCustStats(!showCustStats)} style={{background:showCustStats?T.accent:T.accent+"15",color:showCustStats?"#fff":T.accent,border:"1px solid "+T.accent+"40"}} title="إحصاءات تفصيلية">📊 إحصاءات</Btn>
              {/* V16.3: Generate portal URL */}
              {canEdit&&<Btn small onClick={()=>generatePortalUrl(cust.id,cust.name)} style={{background:"#8B5CF615",color:"#8B5CF6",border:"1px solid #8B5CF640"}} title="رابط الحساب للعميل">📱 رابط العميل</Btn>}
              {/* V21.9.200 — two professional print modes: ملخص (financial
                  summary only) and تفصيلي (+ session invoices + payments log). */}
              <Btn small onClick={printStatementSummary} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة كشف ملخص (الملخص المالي + الرصيد)">🖨 ملخص</Btn>
              <Btn small onClick={printStatementDetailed} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"40"}} title="طباعة كشف تفصيلي (+ الفواتير + سجل الدفعات)">🖨 تفصيلي</Btn>
              <Btn ghost small onClick={()=>setCustStatement("pick")}>← رجوع</Btn>
              <Btn ghost small onClick={()=>setCustStatement(null)} title="إغلاق">✕</Btn>
            </div>
          </div>
          {/* V16.3: Customer Stats Widget */}
          {showCustStats&&<CustomerStatsWidget data={config} custId={cust.id}/>}
          {/* V18.64: Orphan-treasury warning banner — shown only when there are
              cash payments in the treasury for this customer that haven't been
              copied into custPayments. Cards below already include them in the
              math; this banner just makes the situation visible and offers a
              one-click reconcile. */}
          {orphanTreasuryPayments.length>0&&<div style={{
            margin:"10px 0",padding:"10px 14px",borderRadius:10,
            background:T.warn+"10",border:"1px solid "+T.warn+"40",
            display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"
          }}>
            <span style={{fontSize:18}}>⚠️</span>
            <div style={{flex:1,minWidth:200,fontSize:FS-1,lineHeight:1.6,color:T.text}}>
              <b style={{color:T.warn}}>{orphanTreasuryPayments.length} دفعة في الخزنة مش متزامنة مع كشف العميل</b>
              <div style={{fontSize:FS-2,color:T.textSec,marginTop:2}}>
                المبلغ: {fmt(orphanTreasuryTotal)} ج.م — تم تضمينها في الإجمالي تلقائياً.
                {canEdit?" اضغط 'مزامنة' لإصلاحها بشكل دائم.":""}
              </div>
            </div>
            {canEdit&&<Btn small onClick={reconcileOrphanPayments} style={{
              background:T.warn,color:"#fff",border:"none",fontWeight:800
            }}>🔧 مزامنة</Btn>}
          </div>}
          {/* V18.4: Card 1 uses GROSS delivery value (totalValGross), not net */}
          <div style={{display:"grid",gridTemplateColumns:isMob?"repeat(2,1fr)":"repeat(auto-fit, minmax(180px, 1fr))",gap:10,margin:"12px 0"}}>
            {/* Card 1: Total sales invoices (GROSS delivery, before/after discount) */}
            <div style={{padding:12,borderRadius:12,background:"linear-gradient(135deg,"+T.accent+"12,"+T.accent+"04)",border:"1px solid "+T.accent+"30"}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8,fontSize:FS-2,color:T.textSec,fontWeight:700}}><span>📤</span><span>إجمالي فواتير المبيعات</span></div>
              <div style={{fontSize:18,fontWeight:800,color:T.accent,lineHeight:1.2}}>{fmt(totalValGross)} <span style={{fontSize:FS-2,fontWeight:600,color:T.textMut}}>ج.م</span></div>
              <div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>{discPct>0?"قبل الخصم":"إجمالي التسليم"}</div>
              {discPct>0&&<div style={{marginTop:6,paddingTop:6,borderTop:"1px dashed "+T.accent+"30"}}>
                <div style={{fontSize:FS-1,fontWeight:800,color:T.accent}}>{fmt(totalGrossAfterDisc)} <span style={{fontSize:FS-3,fontWeight:600,color:T.textMut}}>ج.م</span></div>
                <div style={{fontSize:FS-3,color:T.textMut}}>بعد الخصم</div>
              </div>}
            </div>
            {/* Card 2: Total returns (before/after discount) */}
            <div style={{padding:12,borderRadius:12,background:"linear-gradient(135deg,"+T.err+"10,"+T.err+"03)",border:"1px solid "+T.err+"30"}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8,fontSize:FS-2,color:T.textSec,fontWeight:700}}><span>↩️</span><span>إجمالي المرتجعات</span></div>
              <div style={{fontSize:18,fontWeight:800,color:T.err,lineHeight:1.2}}>{fmt(retVal)} <span style={{fontSize:FS-2,fontWeight:600,color:T.textMut}}>ج.م</span></div>
              <div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>{discPct>0?"قبل الخصم":"قيمة المرتجعات"}</div>
              {discPct>0&&<div style={{marginTop:6,paddingTop:6,borderTop:"1px dashed "+T.err+"30"}}>
                <div style={{fontSize:FS-1,fontWeight:800,color:T.err}}>{fmt(retValAfterDisc)} <span style={{fontSize:FS-3,fontWeight:600,color:T.textMut}}>ج.م</span></div>
                <div style={{fontSize:FS-3,color:T.textMut}}>بعد الخصم</div>
              </div>}
            </div>
            {/* Card 3: Total discount — V21.9.194: clean amount-only display.
                Per Ahmed: no percentage hint at all (since per-invoice rates
                can differ, any single % shown is misleading). The amount is
                derived from per-delivery aggregation so it's always accurate. */}
            {discAmt>0&&<div style={{padding:12,borderRadius:12,background:"linear-gradient(135deg,"+T.warn+"12,"+T.warn+"03)",border:"1px solid "+T.warn+"30"}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8,fontSize:FS-2,color:T.textSec,fontWeight:700}}>
                <span>🏷️</span><span>إجمالي الخصم</span>
              </div>
              <div style={{fontSize:18,fontWeight:800,color:T.warn,lineHeight:1.2}}>{fmt(discAmt)} <span style={{fontSize:FS-2,fontWeight:600,color:T.textMut}}>ج.م</span></div>
              <div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>قيمة الخصم المطبق</div>
            </div>}
            {/* Card 4: Total paid (cash + checks split) */}
            <div style={{padding:12,borderRadius:12,background:"linear-gradient(135deg,"+T.ok+"10,"+T.ok+"03)",border:"1px solid "+T.ok+"30"}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8,fontSize:FS-2,color:T.textSec,fontWeight:700}}><span>💰</span><span>إجمالي المدفوع</span></div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:3}}>
                <span style={{fontSize:FS-2,color:T.textMut}}>💵 نقدي</span>
                <span style={{fontSize:FS-1,fontWeight:800,color:T.ok}}>{fmt(totalPaidCash)}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:6}}>
                <span style={{fontSize:FS-2,color:T.textMut}}>📝 شيكات</span>
                <span style={{fontSize:FS-1,fontWeight:800,color:T.ok}}>{fmt(totalPaidChecks)}</span>
              </div>
              <div style={{paddingTop:6,borderTop:"1px solid "+T.ok+"30",display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                <span style={{fontSize:FS-2,color:T.textSec,fontWeight:700}}>الإجمالي</span>
                <span style={{fontSize:16,fontWeight:800,color:T.ok}}>{fmt(totalPaid)} <span style={{fontSize:FS-3,fontWeight:600,color:T.textMut}}>ج.م</span></span>
              </div>
            </div>
            {/* Card 5: Current balance — V18.1 flipped: positive=GREEN (customer owes), negative=RED (factory owes) — V18.4: corrected labels */}
            <div style={{padding:12,borderRadius:12,background:custBalance>0?"linear-gradient(135deg,"+T.ok+"15,"+T.ok+"05)":custBalance<0?"linear-gradient(135deg,"+T.err+"15,"+T.err+"05)":T.bg,border:"2px solid "+(custBalance>0?T.ok:custBalance<0?T.err:T.brd)+"50"}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8,fontSize:FS-2,color:T.textSec,fontWeight:700}}><span>⚖️</span><span>الرصيد الحالي</span></div>
              <div style={{fontSize:22,fontWeight:900,color:custBalance>0?T.ok:custBalance<0?T.err:T.text,lineHeight:1.1}}>{fmt(custBalance)} <span style={{fontSize:FS-1,fontWeight:600,color:T.textMut}}>ج.م</span></div>
              <div style={{fontSize:FS-3,color:T.textMut,marginTop:4,fontWeight:600}}>{custBalance>0?"💚 مستحق للمصنع":custBalance<0?"❤️ مستحق للعميل":"✓ متعادل"}</div>
            </div>
            {/* Card 6: Net sold quantity — V18.4 renamed */}
            <div style={{padding:12,borderRadius:12,background:"linear-gradient(135deg,"+T.accent+"08,"+T.accent+"02)",border:"1px solid "+T.accent+"20"}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8,fontSize:FS-2,color:T.textSec,fontWeight:700}}><span>📦</span><span>صافي الكمية المباعة</span></div>
              <div style={{fontSize:22,fontWeight:900,color:T.accent,lineHeight:1.1}}>{fmt(totalNet)}</div>
              <div style={{fontSize:FS-3,color:T.textMut,marginTop:4}}>قطعة (تسليم - مرتجع)</div>
            </div>
          </div>
          {/* Add payment form */}
          {canEdit&&<div style={{padding:12,borderRadius:12,background:T.ok+"06",border:"1px solid "+T.ok+"20",marginBottom:12}}>
            <div style={{fontSize:FS-1,fontWeight:700,color:T.ok,marginBottom:8}}>💳 تسجيل دفعة</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
              <div><label style={{fontSize:FS-3,color:T.textSec}}>المبلغ</label><input type="number" value={payAmt} onChange={e=>setPayAmt_(e.target.value)} placeholder="0" style={{display:"block",width:100,padding:"6px 8px",borderRadius:8,border:"1px solid "+T.brd,fontSize:FS,fontFamily:"inherit",background:T.inputBg,color:T.text}}/></div>
              <div><label style={{fontSize:FS-3,color:T.textSec}}>الطريقة</label><select value={payMethod} onChange={e=>setPayMethod(e.target.value)} style={{display:"block",padding:"6px 8px",borderRadius:8,border:"1px solid "+T.brd,fontSize:FS-1,fontFamily:"inherit",background:T.inputBg,color:T.text}}><option>كاش</option><option>تحويل بنكي</option><option>محفظة</option><option>شيك</option></select></div>
              {/* V19.11: account picker — let the user choose which treasury account
                  the payment lands in. Defaults to MAIN CASH if user doesn't change it.
                  Reads from config.treasuryAccounts (same source the Treasury page uses). */}
              <div><label style={{fontSize:FS-3,color:T.textSec}}>الخزنة</label><select value={payAccount} onChange={e=>setPayAccount(e.target.value)} style={{display:"block",padding:"6px 8px",borderRadius:8,border:"1px solid "+T.brd,fontSize:FS-1,fontFamily:"inherit",background:T.inputBg,color:T.text,minWidth:110}}>
                <option value="">MAIN CASH</option>
                {(()=>{
                  const accs=config.treasuryAccounts||[];
                  const names=new Set();
                  accs.forEach(a=>{const n=typeof a==="string"?a:(a&&a.name);if(n&&n!=="MAIN CASH")names.add(n)});
                  /* Always include SUB CASH as fallback if not already an explicit account */
                  if(!names.has("SUB CASH"))names.add("SUB CASH");
                  return [...names].map(n=><option key={n} value={n}>{n}</option>);
                })()}
              </select></div>
              <div><label style={{fontSize:FS-3,color:T.textSec}}>التاريخ</label><input type="date" value={payDate_} onChange={e=>setPayDate_(e.target.value)} style={{display:"block",padding:"6px 8px",borderRadius:8,border:"1px solid "+T.brd,fontSize:FS-1,fontFamily:"inherit",background:T.inputBg,color:T.text}}/></div>
              <div style={{flex:1,minWidth:80}}><label style={{fontSize:FS-3,color:T.textSec}}>ملاحظات</label><input value={payNote_} onChange={e=>setPayNote_(e.target.value)} placeholder="..." style={{display:"block",width:"100%",padding:"6px 8px",borderRadius:8,border:"1px solid "+T.brd,fontSize:FS-1,fontFamily:"inherit",background:T.inputBg,color:T.text}}/></div>
              <Btn primary small onClick={addCustPayment}>💰 تسجيل</Btn>
            </div>
            {/* V21.21.59: خصم إضافي — مبلغ يقلّل رصيد العميل (مش دفعة) */}
            <div style={{marginTop:10,paddingTop:10,borderTop:"1px dashed "+T.brd}}>
              <Btn small onClick={()=>setShowCustDiscount(true)} style={{background:"#DB277712",color:"#DB2777",border:"1px solid #DB277740",fontWeight:700}}>🏷️ خصم إضافي (يقلّل الرصيد — مش دفعة)</Btn>
            </div>
          </div>}
          {/* V21.21.60: قائمة الخصومات الإضافية للعميل + إلغاء/حذف */}
          {canEdit&&<DiscountsManager data={data} upConfig={upConfig} user={user} customerId={custStatement} accent="#DB2777"/>}
          {showCustDiscount&&<DiscountModal data={data} upConfig={upConfig} user={user} fixedCustomerId={custStatement} onClose={()=>setShowCustDiscount(false)}/>}
          {/* V18.63: Payments log REMOVED — moved to Accounting → دفعات tab.
              The "Add Payment" form above stays as a convenient entry point. */}

          {/* V18.63: Tab switcher between Summary and Movement Log */}
          <div style={{display:"flex",gap:0,marginTop:8,marginBottom:14,borderBottom:"2px solid "+T.brd}}>
            {[
              {key:"summary",label:"📊 ملخص",hint:"الموديلات والكميات بفلتر"},
              {key:"log",label:"📋 سجل حركات",hint:"الفواتير (مبيعات ومرتجعات) مجمّعة بالجلسة — زي البورتال"},
              {key:"payments",label:"💳 دفعات",hint:"كل الدفعات: كاش + شيكات + الخزنة"},
            ].map(t=>{
              const isActive=statementTab===t.key;
              return<div key={t.key} onClick={()=>setStatementTab(t.key)} title={t.hint} style={{
                padding:isMob?"8px 12px":"10px 18px",
                cursor:"pointer",
                fontSize:isMob?FS-1:FS,
                fontWeight:isActive?800:600,
                color:isActive?T.accent:T.textSec,
                borderBottom:isActive?"3px solid "+T.accent:"3px solid transparent",
                marginBottom:-2,
                transition:"all 0.15s",
                userSelect:"none",
              }}>{t.label}</div>;
            })}
          </div>

          {/* V18.63: SUMMARY TAB — current state of models + sales/returns aggregated
              with a model filter on top */}
          {statementTab==="summary"&&(()=>{
            const filter=(statementModelFilter||"").trim().toLowerCase();
            const filteredRows=filter
              ?rows.filter(r=>(r.modelNo||"").toLowerCase().includes(filter)||(r.modelDesc||"").toLowerCase().includes(filter))
              :rows;
            const fDel=filteredRows.reduce((s,r)=>s+r.delivered,0);
            const fRet=filteredRows.reduce((s,r)=>s+r.returned,0);
            const fNet=filteredRows.reduce((s,r)=>s+r.net,0);
            const fVal=filteredRows.reduce((s,r)=>s+r.net*r.sellPrice,0);
            return<>
              {/* Model filter */}
              {rows.length>0&&<div style={{marginBottom:10,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <div style={{flex:1,minWidth:200}}>
                  <Inp value={statementModelFilter} onChange={setStatementModelFilter} placeholder="🔍 فلترة بالموديل أو الوصف..."/>
                </div>
                {filter&&<Btn ghost small onClick={()=>setStatementModelFilter("")} title="مسح الفلتر">✕</Btn>}
                {filter&&<div style={{fontSize:FS-2,color:T.textMut,fontWeight:600}}>
                  {filteredRows.length} من {rows.length}
                </div>}
              </div>}
              {/* Items table */}
              {filteredRows.length>0?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["الموديل","الوصف","تسليم","مرتجع","صافي","سعر","القيمة"].map(h=><th key={h} style={{...TH,fontSize:FS-2}}>{h}</th>)}</tr></thead><tbody>
                {filteredRows.map((r,i)=><tr key={i} style={{background:i%2===0?"transparent":T.bg+"80"}}>
                  <td style={{...TD,fontWeight:700,color:T.accent}}>{r.modelNo}</td>
                  <td style={TD}>{r.modelDesc}</td>
                  <td style={{...TD,textAlign:"center"}}>{r.delivered}</td>
                  <td style={{...TD,textAlign:"center",color:r.returned?T.err:T.textMut}}>{r.returned||"—"}</td>
                  <td style={{...TD,textAlign:"center",fontWeight:800}}>{r.net}</td>
                  <td style={{...TD,textAlign:"center"}}>{r.sellPrice||"—"}</td>
                  <td style={{...TD,textAlign:"center",fontWeight:700}}>{fmt(r.net*r.sellPrice)}</td>
                </tr>)}
                <tr style={{background:T.accent+"08"}}>
                  <td colSpan={2} style={{...TD,fontWeight:800}}>{filter?"الاجمالي (مفلتر)":"الاجمالي"}</td>
                  <td style={{...TD,textAlign:"center",fontWeight:800,color:T.accent}}>{fDel}</td>
                  <td style={{...TD,textAlign:"center",fontWeight:800,color:T.err}}>{fRet}</td>
                  <td style={{...TD,textAlign:"center",fontWeight:800,fontSize:FS+2}}>{fNet}</td>
                  <td style={TD}></td>
                  <td style={{...TD,textAlign:"center",fontWeight:800,color:T.accent}}>{fmt(fVal)+" ج.م"}</td>
                </tr>
              </tbody></table></div>:<div style={{textAlign:"center",padding:20,color:T.textMut}}>{rows.length===0?"لا توجد حركات لهذا العميل":"لا توجد نتائج للفلتر"}</div>}
            </>;
          })()}

          {/* V21.9.200: MOVEMENT LOG TAB — invoice-grouped (by session) like the
              customer portal. salesSessionInvoices / returnSessionInvoices are
              computed at the modal level (mirror of portal buildInvoices). */}
          {statementTab==="log"&&(()=>{
            const invTable=(list,color,bg,emptyMsg)=>(
              list.length>0?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr>{["#","التاريخ","الكمية","قبل الخصم","بعد الخصم"].map(h=><th key={h} style={{...TH,fontSize:FS-2}}>{h}</th>)}</tr></thead>
                <tbody>
                  {list.map((inv,i)=><tr key={inv.sessionId} style={{background:i%2===0?"transparent":T.bg+"80"}}>
                    <td style={{...TD,textAlign:"center",fontWeight:800,color}}>#{inv.invoiceNo}</td>
                    <td style={{...TD,fontSize:FS-2,whiteSpace:"nowrap"}}>{inv.date||"—"}</td>
                    <td style={{...TD,textAlign:"center",fontWeight:800,color}}>{inv.qty}</td>
                    <td style={{...TD,textAlign:"center",fontWeight:700}}>{fmt(inv.value)}</td>
                    <td style={{...TD,textAlign:"center",fontWeight:800,color}}>{fmt(inv.valueAfterDisc)}</td>
                  </tr>)}
                  <tr style={{background:bg}}>
                    <td colSpan={2} style={{...TD,fontWeight:800}}>الاجمالي</td>
                    <td style={{...TD,textAlign:"center",fontWeight:800,fontSize:FS+1,color}}>{list.reduce((a,x)=>a+x.qty,0)}</td>
                    <td style={{...TD,textAlign:"center",fontWeight:800,fontSize:FS+1}}>{fmt(list.reduce((a,x)=>a+x.value,0))}</td>
                    <td style={{...TD,textAlign:"center",fontWeight:800,fontSize:FS+1,color}}>{fmt(list.reduce((a,x)=>a+x.valueAfterDisc,0))}</td>
                  </tr>
                </tbody>
              </table></div>:<div style={{textAlign:"center",padding:16,color:T.textMut,fontSize:FS-1,background:T.bg,borderRadius:8}}>{emptyMsg}</div>
            );
            return<>
              {/* Sales invoices (one row per session) */}
              <div style={{marginBottom:18}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,padding:"6px 10px",background:T.accent+"08",borderRadius:8,border:"1px solid "+T.accent+"20"}}>
                  <span style={{fontSize:FS,fontWeight:800,color:T.accent}}>🛒 فواتير المبيعات</span>
                  <span style={{fontSize:FS-2,color:T.textMut}}>({salesSessionInvoices.length} فاتورة)</span>
                </div>
                {invTable(salesSessionInvoices,T.accent,T.accent+"10","لا توجد مبيعات")}
              </div>
              {/* Returns invoices (one row per session) */}
              <div>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,padding:"6px 10px",background:T.err+"08",borderRadius:8,border:"1px solid "+T.err+"20"}}>
                  <span style={{fontSize:FS,fontWeight:800,color:T.err}}>↩️ المرتجعات</span>
                  <span style={{fontSize:FS-2,color:T.textMut}}>({returnSessionInvoices.length})</span>
                </div>
                {invTable(returnSessionInvoices,T.err,T.err+"10","لا توجد مرتجعات")}
              </div>
            </>;
          })()}

          {/* V21.9.200: PAYMENTS TAB — 3 summary cards + full payments log
              (cash + checks + orphan-treasury). Mirrors the customer portal. */}
          {statementTab==="payments"&&(()=>{
            return<>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
                {[{icon:"💵",label:"نقدي",val:totalPaidCash,color:T.ok},{icon:"📝",label:"شيكات",val:totalPaidChecks,color:"#0EA5E9"},{icon:"💰",label:"إجمالي",val:totalPaid,color:T.accent}].map(c=>(
                  <div key={c.label} style={{padding:10,borderRadius:10,background:c.color+"08",border:"1px solid "+c.color+"25",textAlign:"center"}}>
                    <div style={{fontSize:FS-2,color:T.textSec,fontWeight:700,marginBottom:4}}>{c.icon} {c.label}</div>
                    <div style={{fontSize:16,fontWeight:800,color:c.color}}>{fmt(c.val)} <span style={{fontSize:FS-3,fontWeight:600,color:T.textMut}}>ج.م</span></div>
                  </div>
                ))}
              </div>
              {allPaymentsList.length>0?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr>{["التاريخ","المبلغ","الطريقة","ملاحظات"].map(h=><th key={h} style={{...TH,fontSize:FS-2}}>{h}</th>)}</tr></thead>
                <tbody>
                  {allPaymentsList.map((p,i)=><tr key={i} style={{background:i%2===0?"transparent":T.bg+"80"}}>
                    <td style={{...TD,fontSize:FS-2,whiteSpace:"nowrap"}}>{p.date||"—"}</td>
                    <td style={{...TD,textAlign:"center",fontWeight:800,color:T.ok}}>{fmt(p.amount)}</td>
                    <td style={{...TD,textAlign:"center",fontSize:FS-2}}>{(p.method==="شيك"?"📝 ":p.method.indexOf("خزنة")>=0?"🏦 ":"💵 ")+p.method}</td>
                    <td style={{...TD,fontSize:FS-2,color:T.textSec}}>{p.note||"—"}</td>
                  </tr>)}
                  <tr style={{background:T.ok+"10"}}>
                    <td style={{...TD,fontWeight:800}}>الاجمالي</td>
                    <td style={{...TD,textAlign:"center",fontWeight:800,fontSize:FS+1,color:T.ok}}>{fmt(totalPaid)}</td>
                    <td colSpan={2} style={TD}></td>
                  </tr>
                </tbody>
              </table></div>:<div style={{textAlign:"center",padding:20,color:T.textMut}}>لا توجد دفعات مسجّلة لهذا العميل</div>}
            </>;
          })()}
        </div>
      </div>})()}
    {/* Sales Analysis Popup */}
    {salesAnalysis&&(()=>{const topCusts=[...customers].map(c=>({...c,total:getCustTotal(c.id)})).filter(c=>c.total>0).sort((a,b)=>b.total-a.total);const totalStockAll=stockModels.reduce((s,m)=>s+m.stockQty,0);
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:isMob?8:16}} onClick={()=>setSalesAnalysis(false)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:isMob?16:24,width:"100%",maxWidth:isMob?"100%":window.innerWidth-48,maxHeight:"90vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div style={{fontSize:FS+2,fontWeight:800,color:"#8B5CF6"}}>🏆 تحليل مبيعات العملاء</div>
            <Btn ghost small onClick={()=>setSalesAnalysis(false)} title="إغلاق">✕</Btn>
          </div>
          {topCusts.length>0?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["#","العميل","النوع","تسليم","مرتجع","صافي","% من المخزن"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
              {topCusts.map((c,i)=>{const ret=orders.reduce((s,o)=>(o.customerReturns||[]).filter(r=>r.custId===c.id).reduce((ss,r)=>ss+(Number(r.qty)||0),s),0);return<tr key={c.id} style={{background:i%2===0?"transparent":T.bg+"80"}}><td style={TD}>{i+1}</td><td style={{...TD,fontWeight:700}}>{c.name}</td><td style={{...TD,fontSize:FS-2,color:T.textMut}}>{c.type||"—"}</td><td style={{...TD,textAlign:"center",fontWeight:700,color:T.accent}}>{fmt(c.total+ret)}</td><td style={{...TD,textAlign:"center",color:ret?T.err:T.textMut}}>{ret||"—"}</td><td style={{...TD,textAlign:"center",fontWeight:800}}>{fmt(c.total)}</td><td style={{...TD,textAlign:"center",fontWeight:700,color:"#8B5CF6"}}>{(totalStockAll?Math.round(c.total/totalStockAll*100):0)+"%"}</td></tr>})}
            </tbody></table></div>:<div style={{textAlign:"center",padding:30,color:T.textMut}}>لا توجد مبيعات</div>}
        </div>
      </div>})()}
    {/* Customer List - toggled */}
    {showCustList&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:isMob?8:24}} onClick={()=>setShowCustList(false)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:isMob?16:24,width:isMob?"100%":"auto",maxWidth:isMob?"100%":"95vw",minWidth:isMob?"auto":420,maxHeight:"85vh",overflowY:"auto",overflowX:"hidden",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,gap:10}}>
          <div style={{fontSize:FS+2,fontWeight:800,color:T.accent,whiteSpace:"nowrap"}}>{"👥 العملاء ("+customers.length+")"}</div>
          <div style={{display:"flex",gap:4}}>
            {canEdit&&<Btn small primary onClick={()=>{setCName("");setCPhone("");setCAddr("");setCType("مكتب");setCDiscount(10);setCArchived(false);setCTags([]);setCPriceTier("");setCEditId(null);setShowCustForm(true)}}>+ عميل جديد</Btn>}
            <Btn ghost small onClick={()=>setShowCustList(false)} title="إغلاق">✕</Btn>
          </div>
        </div>
        <div style={{marginBottom:10,display:"flex",gap:8,alignItems:"center"}}>
          <div style={{flex:1}}><Inp value={custFilter} onChange={setCustFilter} placeholder="بحث بالاسم أو رقم التليفون..."/></div>
          {/* V18.16: Toggle to show archived customers (admin convenience for review) */}
          <Btn small onClick={()=>setShowArchivedCusts(!showArchivedCusts)} style={{background:showArchivedCusts?T.err+"15":T.bg,color:showArchivedCusts?T.err:T.textSec,border:"1px solid "+(showArchivedCusts?T.err+"40":T.brd),whiteSpace:"nowrap"}} title="إظهار/إخفاء العملاء الموقوفين">{showArchivedCusts?"🔒 يظهر الموقوفين":"إظهار الموقوفين"}</Btn>
        </div>
        {/* V21.9.105: Tag filter strip — only renders if there's at least one
            applicable tag in the registry. Otherwise stays hidden so existing
            users don't see UI noise before they create any tags. */}
        <TagFilter
          entityType="customer"
          registry={data.tagRegistry||[]}
          selectedTags={custTagFilter}
          mode={custTagFilterMode}
          onChange={(ids,m)=>{setCustTagFilter(ids);setCustTagFilterMode(m)}}
          compact
        />
        {(()=>{const fcRaw=customers.filter(c=>{
          /* V21.9.57 DEFENSIVE FILTER: hide pseudo-customers (id starts with "_")
             from the customer list display. These are system-internal markers
             (e.g., "_adjust" for inventory audit stock corrections) that should
             never have been promoted to real customers, but the V21.9.57 fixes
             to the recovery scan + safeDelete may not catch already-stuck records.
             The data record stays in d.customers for backward compat (some screens
             might still resolve the name via c.id lookup), but they're hidden
             from the user-facing list. To clean up the record permanently, click
             the × button — safeDelete will remove it. */
          if(typeof c.id === "string" && c.id.startsWith("_")) return false;
          /* V18.16: Hide archived unless toggle is on */
          if(c.archived&&!showArchivedCusts)return false;
          if(!custFilter.trim())return true;const q=custFilter.trim().toLowerCase();return(c.name||"").toLowerCase().includes(q)||(c.phone||"").includes(q)||(c.type||"").includes(q)
        });
          /* V21.9.105: chain tag filter AFTER text/archive filter.
             filterByTags returns the input untouched when selectedTags is empty,
             so this is a no-op when no tag chip is selected. */
          const fc=filterByTags(fcRaw,custTagFilter,custTagFilterMode);
          return fc.length>0?<table style={{width:"auto",borderCollapse:"collapse",whiteSpace:"nowrap"}}><thead><tr>{["#","الاسم","التاجز","النوع","التليفون","العنوان","اجمالي",...(canEdit?[""]:[])] .map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
          {fc.map((c,i)=>{const total=getCustTotal(c.id);return<tr key={c.id} style={{background:c.archived?T.err+"06":(i%2===0?"transparent":T.bg+"80"),opacity:c.archived?0.7:1}}><td style={TD}>{i+1}</td><td style={{...TD,fontWeight:700}}><span style={{textDecoration:c.archived?"line-through":"none"}}>{c.name}</span>{c.archived&&<span style={{marginInlineStart:6,padding:"1px 6px",borderRadius:4,background:T.err+"20",color:T.err,fontSize:FS-3,fontWeight:800}}>🔒 موقوف</span>}</td><td style={TD}><TagChips tagIds={c.tags||[]} registry={data.tagRegistry||[]} small max={3}/></td><td style={{...TD,fontSize:FS-2,color:T.textSec}}>{c.type==="محل"?"🏪 محل":c.type==="أونلاين"?"🌐 أونلاين":c.type==="أخرى"?"📦 أخرى":"🏢 مكتب"}</td><td style={TD}>{c.phone}</td><td style={TD}>{c.address||"—"}</td><td style={{...TD,fontWeight:700,color:T.accent}}>{total||"—"}</td>
            {canEdit&&<td style={TD}><div style={{display:"flex",gap:3}}>
              <Btn small onClick={()=>setCustSalesLog(c.id)} style={{background:"#059669"+"12",color:"#059669",border:"1px solid #05966930"}} title="سجل مبيعات">📋</Btn>
              <Btn small onClick={()=>{setCName(c.name);setCPhone(c.phone);setCAddr(c.address||"");setCType(c.type||"مكتب");setCDiscount(Number(c.discount)||0);setCArchived(!!c.archived);setCTags(Array.isArray(c.tags)?c.tags.slice():[]);setCPriceTier(c.priceTier||"");setCEditId(c.id);setShowCustForm(true)}} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}} title="تعديل">✏️</Btn>
              <Btn small onClick={()=>showCustQR(c)} style={{background:"#8B5CF612",color:"#8B5CF6",border:"1px solid #8B5CF630"}} title="عرض كود QR">QR</Btn>
              <Btn small onClick={()=>generatePortalUrl(c.id,c.name)} style={{background:"#0EA5E912",color:"#0EA5E9",border:"1px solid #0EA5E930"}} title="رابط حساب العميل">📱</Btn>
              <DelBtn onConfirm={()=>safeDelete("customers",c.id,"عميل")} blocked={getDeleteBlocker(data,"customer",c.id)}/>
            </div></td>}</tr>})}
        </tbody></table>:<div style={{textAlign:"center",padding:20,color:T.textMut}}>{(custFilter||custTagFilter.length>0)?"لا توجد نتائج":"سجّل عملاء أولاً"}</div>})()}
      </div>
    </div>}
    {/* V17.9: Tabs for the 4 main lists — instead of stacking them vertically (which forced scrolling) */}
    {(()=>{
      /* Pre-compute counts for tab labels */
      const sessCount=sessions.length;
      const _allRet=[];orders.forEach(o=>{(o.customerReturns||[]).forEach(r=>_allRet.push(r))});
      const _retCustIds=new Set(_allRet.map(r=>r.custId||"_unknown"));
      const retCustCount=_retCustIds.size;
      const retTotalQty=_allRet.reduce((s,r)=>s+(Number(r.qty)||0),0);
      const audCount=audits.length;
      /* Stale models: in stock 14+ days without sale */
      const _now=new Date();
      const _stale=stockModels.filter(m=>{if(m.avail<=0)return false;const o=orders.find(x=>x.id===m.id);if(!o)return false;
        const lastSaleDate=(o.customerDeliveries||[]).reduce((latest,d)=>d.date>latest?d.date:latest,"");
        const lastStockDate=(o.deliveries||[]).reduce((latest,d)=>d.date>latest?d.date:latest,"");
        const refDate=lastSaleDate||lastStockDate||o.date;const days=Math.floor((_now-new Date(refDate))/86400000);
        return days>=14;
      });
      const staleCount=_stale.length;
      const tabs=[
        {key:"sessions",label:"📦 سجل التسليمات",count:sessCount,color:T.accent},
        {key:"returns",label:"↩️ سجل المرتجعات",count:retCustCount>0?retCustCount+" عميل ("+retTotalQty+")":0,color:T.err},
        {key:"audits",label:"📋 جرد المبيعات",count:audCount,color:"#F59E0B"},
        {key:"stale",label:"⚠️ موديلات راكدة",count:staleCount,color:"#EF4444",hidden:staleCount===0},
      ];
      return hubView?null:<div style={{display:"flex",gap:0,marginBottom:12,borderRadius:12,overflow:"hidden",border:"1px solid "+T.brd,background:T.cardSolid,boxShadow:T.shadow,flexWrap:isMob?"wrap":"nowrap"}}>
        {tabs.filter(t=>!t.hidden).map(t=>{const isActive=salesTab===t.key;
          return<div key={t.key} onClick={()=>setSalesTab(t.key)} style={{flex:1,minWidth:isMob?"50%":"auto",padding:isMob?"10px 8px":"12px 14px",cursor:"pointer",textAlign:"center",fontWeight:isActive?800:600,fontSize:isMob?FS-2:FS-1,background:isActive?t.color+"12":"transparent",color:isActive?t.color:T.textSec,borderBottom:isActive?"3px solid "+t.color:"3px solid transparent",transition:"all 0.15s",userSelect:"none"}} onMouseEnter={e=>{if(!isActive)e.currentTarget.style.background=T.bg+"50"}} onMouseLeave={e=>{if(!isActive)e.currentTarget.style.background="transparent"}}>
            <div>{t.label}</div>
            {t.count!==0&&<div style={{fontSize:FS-3,marginTop:2,fontWeight:isActive?800:700,opacity:isActive?1:0.7}}>{typeof t.count==="number"?"("+t.count+")":t.count}</div>}
          </div>})}
      </div>;
    })()}
    {/* Sessions Log */}
    {(hubView?hubView==="deliveryLog":salesTab==="sessions")&&<Card title={"📦 سجل التسليمات ("+sessions.length+")"}>
      <div style={{marginBottom:10}}><Inp value={sessFilterQ} onChange={setSessFilterQ} placeholder="فلتر بالتاريخ أو اسم العميل أو رقم الموديل..."/></div>
      {(()=>{const fSess=sortedSessions.filter(s=>{if(!sessFilterQ.trim())return true;const q=sessFilterQ.trim().toLowerCase();const mNos=s.modelIds.map(id=>{const o=orders.find(x=>x.id===id);return o?.modelNo||""}).join(" ").toLowerCase();const cNames=s.custIds.map(id=>{const c=customers.find(x=>x.id===id);return c?.name||""}).join(" ").toLowerCase();return(s.date||"").includes(q)||mNos.includes(q)||cNames.includes(q)});
        return fSess.length>0?<div style={{display:"flex",flexDirection:"column",gap:8}}>
        {fSess.slice(0,sessLimit).map(s=>{const totalQty=Object.values(s.grid||{}).reduce((sum,v)=>sum+(Number(v)||0),0);const isActive=activeSession===s.id;const st=s.status||"جاري التجهيز";const stColor=st==="تم التسليم"?"#EF4444":st==="تم الشحن"?"#0EA5E9":"#F59E0B";
          const confirmed=s.saleConfirmed;const isFree=s.freeSale;const isClosed=st==="تم التسليم";
          return<div key={s.id} style={{padding:"12px 16px",borderRadius:12,background:isClosed?"#FEF2F2":isActive?T.accent+"08":T.cardSolid,border:isActive?"2px solid "+T.accent:isClosed?"1px solid #EF444430":confirmed?"1px solid #10B98130":"1px solid "+T.brd,cursor:"pointer",transition:"all 0.15s",opacity:isClosed?0.7:1}} onClick={()=>setActiveSession(isActive?null:s.id)}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:18}}>{isClosed?"🔒":isFree?"🔓":"📦"}</span>
                <div><div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}><span style={{fontWeight:700,fontSize:FS,color:isClosed?"#EF4444":T.text,textDecoration:isClosed?"line-through":"none"}}>{(isFree?"بيع حر":"سجل توزيع")+" — "+s.date}</span><span style={{fontSize:FS-3,fontWeight:700,color:stColor,background:stColor+"15",padding:"1px 8px",borderRadius:6,border:"1px solid "+stColor+"30"}}>{st}</span>
                    {confirmed&&<span style={{fontSize:FS-3,fontWeight:700,color:"#10B981",background:"#10B98110",padding:"1px 8px",borderRadius:6}}>✅ بيع فعلي</span>}
                    {!confirmed&&!isFree&&<span style={{fontSize:FS-3,fontWeight:700,color:"#F59E0B",background:"#F59E0B10",padding:"1px 8px",borderRadius:6}}>⏳ خطة</span>}
                  </div>
                  <div style={{fontSize:FS-2,color:T.textMut}}>{(()=>{const actualSales=orders.reduce((sum,o)=>sum+(o.customerDeliveries||[]).filter(d=>d.sessionId===s.id).reduce((ss,d)=>ss+(Number(d.qty)||0),0),0);const diff=totalQty-actualSales;
                    return<>{(s.modelIds?.length||0)+" موديل × "+(s.custIds?.length||0)+" عميل"}{" | "}<span style={{color:"#94A3B8"}}>{"خطة: "+totalQty}</span>{actualSales>0&&<>{" | "}<span style={{color:"#10B981"}}>{"بيع: "+actualSales}</span>{diff!==0&&<span style={{color:"#EF4444",fontWeight:700}}>{" (فرق: "+diff+")"}</span>}</>}</>})()}</div></div>
              </div>
              <div style={{display:"flex",gap:4,alignItems:"center"}} onClick={e=>e.stopPropagation()}>
                <select value={st} onChange={e=>updateSessStatus(s.id,e.target.value)} style={{padding:"3px 6px",borderRadius:6,border:"1px solid "+T.brd,fontSize:FS-2,fontFamily:"inherit",fontWeight:700,background:T.bg,color:stColor,cursor:"pointer"}}>{SESS_STATUSES.map(ss=><option key={ss} value={ss}>{ss}</option>)}</select>
                {(()=>{const hasSales=orders.some(o=>(o.customerDeliveries||[]).some(d=>d.sessionId===s.id));return hasSales?<Btn small onClick={()=>confirmSessionSalesOrders(s.id)} style={{background:"#10B98115",color:"#059669",border:"1px solid #10B98140"}} title="تأكيد البيع — توليد أوامر بيع من التوزيعة">🧾</Btn>:null})()}
                <Btn small onClick={()=>printSession(s.id)} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}} title="طباعة">🖨</Btn>
                {canEdit&&<DelBtn onConfirm={()=>delSession(s.id)} blocked={(()=>{const hs=orders.some(o=>(o.customerDeliveries||[]).some(d=>d.sessionId===s.id));return hs?"بها حركات بيع":null})()}/>}
              </div>
            </div>
          </div>})}
      {fSess.length>sessLimit&&<div onClick={()=>setSessLimit(l=>l+25)} style={{textAlign:"center",padding:"10px",marginTop:4,borderRadius:10,background:T.accentBg,color:T.accent,fontWeight:800,cursor:"pointer",fontSize:FS-1,border:"1px solid "+T.accent+"30"}}>⬇️ عرض المزيد ({fSess.length-sessLimit} متبقي)</div>}
      </div>:<div style={{textAlign:"center",padding:20,color:T.textMut}}>لا توجد تسليمات — اضغط "🚚 تسليم جديد"</div>})()}
    </Card>}
    {/* ── V17.7: Returns Log — grouped by customer ── */}
    {(hubView?hubView==="returnsLog":salesTab==="returns")&&(()=>{const allReturns=[];orders.forEach(o=>{(o.customerReturns||[]).forEach(r=>{allReturns.push({...r,orderId:o.id,modelNo:o.modelNo,modelDesc:o.modelDesc})})});
      if(allReturns.length===0)return<Card title={"↩️ سجل المرتجعات"}><div style={{textAlign:"center",padding:30,color:T.textMut}}>لا توجد مرتجعات بعد</div></Card>;
      /* Group by custId — collect each customer's full return history */
      const byCust={};
      allReturns.forEach(r=>{
        const cid=r.custId||"_unknown";
        if(!byCust[cid]){byCust[cid]={custId:cid,custName:r.custName||"غير محدد",returns:[],totalQty:0,lastDate:""}}
        byCust[cid].returns.push(r);
        byCust[cid].totalQty+=(Number(r.qty)||0);
        if((r.date||"")>byCust[cid].lastDate)byCust[cid].lastDate=r.date||"";
      });
      let custList=Object.values(byCust);
      /* Filter by search */
      if(returnsLogFilter.trim()){
        const q=returnsLogFilter.trim().toLowerCase();
        custList=custList.filter(c=>(c.custName||"").toLowerCase().includes(q));
      }
      /* Sort by total qty descending */
      custList.sort((a,b)=>b.totalQty-a.totalQty);
      const grandTotal=custList.reduce((s,c)=>s+c.totalQty,0);
      const grandOps=custList.reduce((s,c)=>s+c.returns.length,0);
      /* Print: full report — customers + each customer's details */
      const printAll=()=>{
        let h="<h2 style='text-align:center;margin-bottom:4px'>↩️ سجل المرتجعات حسب العميل</h2>";
        h+="<div style='text-align:center;color:#666;margin-bottom:16px'>اجمالي: "+grandTotal+" قطعة | "+grandOps+" عملية مرتجع | "+custList.length+" عميل</div>";
        h+="<table><thead><tr><th>#</th><th>العميل</th><th>عدد العمليات</th><th>اجمالي الكمية</th><th>آخر مرتجع</th></tr></thead><tbody>";
        custList.forEach((c,i)=>{
          h+="<tr style='background:"+(i%2===0?"transparent":"#f8f8f8")+"'><td style='text-align:center'>"+(i+1)+"</td><td style='font-weight:800'>"+c.custName+"</td><td style='text-align:center;font-weight:700'>"+c.returns.length+"</td><td style='text-align:center;font-weight:800;color:#EF4444;font-size:14px'>"+c.totalQty+"</td><td style='text-align:center;color:#666'>"+(c.lastDate||"—")+"</td></tr>";
        });
        h+="<tr style='background:#FEF2F2;font-weight:800'><td colspan='2'>الاجمالي ("+custList.length+" عميل)</td><td style='text-align:center'>"+grandOps+"</td><td style='text-align:center;color:#EF4444;font-size:16px'>"+grandTotal+"</td><td></td></tr></tbody></table>";
        /* Per-customer details */
        custList.forEach(c=>{
          const sortedRets=[...c.returns].sort((a,b)=>(b.date||"").localeCompare(a.date||""));
          h+="<h3 style='margin-top:24px;color:#0EA5E9;border-bottom:2px solid #0EA5E930;padding-bottom:6px'>👤 "+c.custName+" — "+c.totalQty+" قطعة ("+c.returns.length+" عملية)</h3>";
          h+="<table><thead><tr><th>#</th><th>التاريخ</th><th>الموديل</th><th>الوصف</th><th>الكمية</th><th>ملاحظات</th><th>بواسطة</th></tr></thead><tbody>";
          sortedRets.forEach((r,i)=>{
            h+="<tr style='background:"+(i%2===0?"transparent":"#f8f8f8")+"'><td style='text-align:center'>"+(i+1)+"</td><td>"+(r.date||"—")+"</td><td style='font-weight:800;color:#0EA5E9'>"+r.modelNo+"</td><td style='font-size:10px'>"+(r.modelDesc||"")+"</td><td style='font-weight:800;color:#EF4444;text-align:center'>"+r.qty+"</td><td>"+(r.note||"—")+"</td><td style='color:#888;font-size:10px'>"+(r.createdBy||"—")+"</td></tr>";
          });
          h+="</tbody></table>";
        });
        h+="<div class='sig'><div class='sig-box'>مسؤول المبيعات</div><div class='sig-box'>المراجع</div></div>";
        printPage("سجل المرتجعات",h,{factoryName:config.factoryName,logo:config.logo});
      };
      return<Card title={"↩️ سجل المرتجعات — "+custList.length+" عميل ("+grandTotal+" قطعة)"} extra={<Btn small onClick={printAll} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة السجل الكامل">🖨</Btn>}>
        <div style={{marginBottom:10}}><Inp value={returnsLogFilter} onChange={setReturnsLogFilter} placeholder="🔍 ابحث باسم العميل..."/></div>
        {custList.length>0?<div style={{display:"flex",flexDirection:"column",gap:8}}>
          {custList.map(c=><div key={c.custId} onClick={()=>setReturnsPopupCustId(c.custId)} style={{padding:"12px 16px",borderRadius:12,background:T.cardSolid,border:"1px solid "+T.err+"30",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6,transition:"all 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background=T.err+"06"} onMouseLeave={e=>e.currentTarget.style.background=T.cardSolid}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:22}}>👤</span>
              <div>
                <div style={{fontWeight:800,fontSize:FS+1,color:T.text}}>{c.custName}</div>
                <div style={{fontSize:FS-2,color:T.textMut,marginTop:2}}>{c.returns.length+" عملية مرتجع | آخر مرتجع: "+(c.lastDate||"—")}</div>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{textAlign:"left"}}>
                <div style={{fontSize:FS-3,color:T.textMut,fontWeight:600}}>إجمالي الكمية</div>
                <div style={{fontSize:FS+5,fontWeight:900,color:T.err,lineHeight:1}}>{c.totalQty}</div>
              </div>
              <span style={{fontSize:18,color:T.textMut}}>‹</span>
            </div>
          </div>)}
        </div>:<div style={{textAlign:"center",padding:20,color:T.textMut}}>{returnsLogFilter?"لا توجد نتائج":"لا توجد مرتجعات"}</div>}
      </Card>})()}
    {/* V17.7: Returns popup — full history for one customer */}
    {returnsPopupCustId&&(()=>{
      const allRetForCust=[];
      orders.forEach(o=>{(o.customerReturns||[]).filter(r=>r.custId===returnsPopupCustId).forEach((r,idx)=>{allRetForCust.push({...r,orderId:o.id,modelNo:o.modelNo,modelDesc:o.modelDesc,_origIdx:idx})})});
      if(allRetForCust.length===0){setReturnsPopupCustId(null);return null}
      allRetForCust.sort((a,b)=>(b.date||"").localeCompare(a.date||""));
      const cust=customers.find(c=>c.id===returnsPopupCustId);
      const custName=cust?.name||allRetForCust[0]?.custName||"غير محدد";
      const totalQty=allRetForCust.reduce((s,r)=>s+(Number(r.qty)||0),0);
      const printOne=()=>{
        let h="<h2 style='text-align:center;margin-bottom:4px'>↩️ سجل مرتجعات — "+custName+"</h2>";
        h+="<div style='text-align:center;color:#666;margin-bottom:16px'>اجمالي: "+totalQty+" قطعة | "+allRetForCust.length+" عملية مرتجع</div>";
        if(cust){
          h+="<table style='margin:0 auto 12px;border:1px solid #ddd'><tr><th style='padding:6px 12px;background:#F0F9FF'>العميل</th><td style='padding:6px 12px;font-weight:800'>"+cust.name+"</td>";
          if(cust.phone)h+="<th style='padding:6px 12px;background:#F0F9FF'>التليفون</th><td style='padding:6px 12px'>"+ltrPhone(cust.phone)+"</td>";
          h+="</tr></table>";
        }
        h+="<table><thead><tr><th>#</th><th>التاريخ</th><th>الموديل</th><th>الوصف</th><th>الكمية</th><th>ملاحظات</th><th>بواسطة</th></tr></thead><tbody>";
        allRetForCust.forEach((r,i)=>{
          h+="<tr style='background:"+(i%2===0?"transparent":"#f8f8f8")+"'><td style='text-align:center'>"+(i+1)+"</td><td>"+(r.date||"—")+"</td><td style='font-weight:800;color:#0EA5E9'>"+r.modelNo+"</td><td style='font-size:10px'>"+(r.modelDesc||"")+"</td><td style='font-weight:800;color:#EF4444;text-align:center;font-size:13px'>"+r.qty+"</td><td>"+(r.note||"—")+"</td><td style='color:#888;font-size:10px'>"+(r.createdBy||"—")+"</td></tr>";
        });
        h+="<tr style='background:#FEF2F2;font-weight:800'><td colspan='4' style='text-align:left'>الاجمالي</td><td style='text-align:center;color:#EF4444;font-size:16px'>"+totalQty+"</td><td colspan='2'></td></tr></tbody></table>";
        h+="<div class='sig'><div class='sig-box'>مسؤول المبيعات</div><div class='sig-box'>العميل: "+custName+"</div></div>";
        printPage("سجل مرتجعات — "+custName,h,{factoryName:config.factoryName,logo:config.logo});
      };
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={()=>setReturnsPopupCustId(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:0,width:"100%",maxWidth:780,maxHeight:"90vh",display:"flex",flexDirection:"column",border:"2px solid "+T.err+"50",boxShadow:"0 25px 70px rgba(0,0,0,0.4)",overflow:"hidden"}}>
          <div style={{padding:"16px 20px",borderBottom:"2px solid "+T.err+"20",background:T.err+"04",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
            <div>
              <div style={{fontSize:FS+3,fontWeight:900,color:T.err,display:"flex",alignItems:"center",gap:8}}>
                <span>↩️</span><span>{"سجل مرتجعات — "+custName}</span>
              </div>
              <div style={{fontSize:FS-1,color:T.textMut,marginTop:4}}>{allRetForCust.length+" عملية | اجمالي: "+totalQty+" قطعة"}</div>
            </div>
            <div style={{display:"flex",gap:6}}>
              <Btn small onClick={printOne} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30",fontWeight:700}} title="طباعة / PDF">🖨 طباعة</Btn>
              <Btn ghost small onClick={()=>setReturnsPopupCustId(null)}>✕</Btn>
            </div>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:16}}>
            <div style={{overflowX:"auto",border:"1px solid "+T.brd,borderRadius:10}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead style={{position:"sticky",top:0,background:T.cardSolid,zIndex:1}}>
                  <tr>{["#","التاريخ","الموديل","الوصف","الكمية","ملاحظات","بواسطة",...(canEdit?[""]:[])] .map(h=><th key={h} style={{...TH,fontSize:FS-2}}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {allRetForCust.map((r,i)=>{const isEd=editRetIdx===("popup_"+i);
                    return<tr key={i} style={{background:isEd?T.warn+"08":i%2===0?"transparent":T.bg+"80",borderBottom:"1px solid "+T.brd}}>
                      <td style={{...TD,textAlign:"center",color:T.textMut}}>{i+1}</td>
                      <td style={{...TD,whiteSpace:"nowrap"}}>{r.date||"—"}</td>
                      <td style={{...TD,fontWeight:700,color:T.accent}}>{r.modelNo}</td>
                      <td style={{...TD,fontSize:FS-2,color:T.textMut}}>{r.modelDesc||"—"}</td>
                      <td style={{...TD,fontWeight:800,color:T.err,textAlign:"center",fontSize:FS+1}}>{isEd?<input type="number" value={editRetQty} onChange={e=>setEditRetQty(Number(e.target.value)||0)} style={{width:60,textAlign:"center",border:"2px solid "+T.warn,borderRadius:4,padding:"2px",fontSize:FS,fontWeight:700,fontFamily:"inherit"}}/>:r.qty}</td>
                      <td style={{...TD,fontSize:FS-2}}>{isEd?<input value={editRetNote} onChange={e=>setEditRetNote(e.target.value)} placeholder="ملاحظات" style={{width:"100%",border:"1px solid "+T.brd,borderRadius:4,padding:"2px 4px",fontSize:FS-2,fontFamily:"inherit"}}/>:(r.note||"—")}</td>
                      <td style={{...TD,fontSize:FS-3,color:T.textMut}}>{r.createdBy||"—"}</td>
                      {canEdit&&<td style={{...TD,whiteSpace:"nowrap"}}><div style={{display:"flex",gap:3}}>
                        {isEd?<>
                          <Btn small primary onClick={()=>{if(editRetQty<=0){showToast("⚠️ كمية غير صالحة");return}updOrder(r.orderId,o=>{const ret=(o.customerReturns||[]).find(x=>x.custId===r.custId&&x.date===r.date&&(x.note||"")===(r.note||""));if(ret){ret.qty=editRetQty;ret.note=editRetNote}});setEditRetIdx(null);showToast("✓ تم التعديل")}} title="حفظ">💾</Btn>
                          <Btn ghost small onClick={()=>setEditRetIdx(null)} title="إلغاء">✕</Btn>
                        </>:<>
                          <Btn small onClick={()=>{const h="<h2 style='text-align:center'>↩️ إذن مرتجع</h2><table style='margin:0 auto 16px'><tr><th style='text-align:right;padding:4px 12px'>العميل</th><td style='padding:4px 12px;font-weight:800'>"+(r.custName||"—")+"</td><th style='text-align:right;padding:4px 12px'>التاريخ</th><td style='padding:4px 12px'>"+r.date+"</td></tr></table><table><thead><tr><th>الموديل</th><th>الوصف</th><th>الكمية</th><th>ملاحظات</th></tr></thead><tbody><tr><td style='font-weight:800;color:#0EA5E9'>"+r.modelNo+"</td><td>"+(r.modelDesc||"")+"</td><td style='font-weight:800;color:#EF4444;text-align:center;font-size:16px'>"+r.qty+"</td><td>"+(r.note||"—")+"</td></tr></tbody></table><div style='margin-top:8px;font-size:11px;color:#888'>بواسطة: "+(r.createdBy||"—")+"</div><div class='sig'><div class='sig-box'>مسؤول المبيعات</div><div class='sig-box'>العميل</div></div>";printPage("إذن مرتجع — "+(r.custName||""),h,{factoryName:config.factoryName,logo:config.logo})}} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}} title="طباعة إذن مرتجع">🖨</Btn>
                          <Btn small onClick={()=>{setEditRetIdx("popup_"+i);setEditRetQty(r.qty);setEditRetNote(r.note||"")}} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}} title="تعديل">✏️</Btn>
                          <DelBtn onConfirm={()=>{updOrder(r.orderId,o=>{o.customerReturns=(o.customerReturns||[]).filter(x=>!(x.custId===r.custId&&x.date===r.date&&(x.note||"")===(r.note||"")))});showToast("✓ تم حذف المرتجع")}}/>
                        </>}
                      </div></td>}
                    </tr>})}
                  <tr style={{background:T.err+"10",fontWeight:800,borderTop:"2px solid "+T.err+"40"}}>
                    <td colSpan={4} style={{...TD,textAlign:"left"}}>الاجمالي</td>
                    <td style={{...TD,textAlign:"center",fontWeight:900,fontSize:FS+3,color:T.err}}>{totalQty}</td>
                    <td colSpan={canEdit?3:2} style={TD}></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>;
    })()}
    {/* ── Sales Audits Section ── */}
    {(hubView?hubView==="audits":salesTab==="audits")&&<Card title={"📋 جرد المبيعات ("+audits.length+")"} style={{marginBottom:16}}>
      {sortedAudits.length>0?<div style={{display:"flex",flexDirection:"column",gap:8}}>
        {sortedAudits.map(a=>{const totalQ=Object.values(a.grid||{}).reduce((s,v)=>s+(Number(v)||0),0);const isActive=activeAudit===a.id;
          return<div key={a.id} style={{padding:"10px 14px",borderRadius:10,background:isActive?T.accent+"08":T.cardSolid,border:isActive?"2px solid "+T.accent:"1px solid "+T.brd,cursor:"pointer"}} onClick={()=>{if(isActive){setActiveAudit(null);setAuditInclude(null)}else{setActiveAudit(a.id);const g=a.grid||{};const custIds=[...new Set(Object.keys(g).map(k=>k.split("_")[1]))].filter(id=>auditCusts.some(c=>c.id===id));setAuditInclude(custIds.length>0?custIds:null)}}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:16}}>📋</span>
                <div><div style={{fontWeight:700,fontSize:FS}}>{"جرد "+a.date+(a.notes?" — "+a.notes:"")}</div>
                  <div style={{fontSize:FS-2,color:T.textMut}}>{(a.fromDate||"")+(a.fromDate?" → "+(a.toDate||""):"")+" | "+totalQ+" قطعة مباعة"}</div></div>
              </div>
              <div style={{display:"flex",gap:4}} onClick={e=>e.stopPropagation()}>
                <Btn small onClick={()=>setShowAuditAnalysis(a.id)} style={{background:"#8B5CF612",color:"#8B5CF6",border:"1px solid #8B5CF630"}} title="تحليل المبيعات">📊</Btn>
                {canEdit&&<DelBtn onConfirm={()=>delAudit(a.id)}/>}
              </div>
            </div>
          </div>})}
      </div>:<div style={{textAlign:"center",padding:20,color:T.textMut}}>لا يوجد جرد — اضغط "📋 جرد مبيعات"</div>}
    </Card>}
    {/* Audit Matrix Popup */}
    {activeAud&&!auditInclude&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setActiveAudit(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:450,maxHeight:"80vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{fontSize:FS+2,fontWeight:800,color:"#F59E0B",marginBottom:4}}>📋 اختر عملاء الجرد</div>
        <div style={{fontSize:FS-2,color:T.textMut,marginBottom:12}}>اختر العملاء اللي بعتوا جرد المبيعات</div>
        <div style={{display:"flex",gap:6,marginBottom:10}}>
          <Btn small onClick={()=>{const all={};auditCusts.forEach(c=>{all[c.id]=true});setAuditSelCusts(all)}} style={{background:T.bg,color:T.textSec,border:"1px solid "+T.brd}}>☑ اختار الكل</Btn>
          <Btn small onClick={()=>setAuditSelCusts({})} style={{background:T.bg,color:T.textSec,border:"1px solid "+T.brd}}>☐ الغاء الكل</Btn>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:14}}>
          {auditCusts.map(c=><div key={c.id} onClick={()=>setAuditSelCusts(p=>({...p,[c.id]:!p[c.id]}))} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderRadius:8,cursor:"pointer",background:auditSelCusts[c.id]?"#F59E0B08":"transparent",border:"1px solid "+(auditSelCusts[c.id]?"#F59E0B30":T.brd)}}>
            <span style={{fontSize:16}}>{auditSelCusts[c.id]?"☑":"☐"}</span>
            <span style={{fontWeight:600,fontSize:FS}}>{c.name}</span>
            <span style={{fontSize:FS-2,color:T.textMut,marginRight:"auto"}}>{"(استلم: "+getCustTotal(c.id)+")"}</span>
          </div>)}
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <Btn ghost onClick={()=>setActiveAudit(null)}>الغاء</Btn>
          <Btn onClick={()=>{const ids=Object.entries(auditSelCusts).filter(([,v])=>v).map(([k])=>k);if(ids.length===0){showToast("⚠️ اختر عميل واحد على الأقل");return}setAuditInclude(ids)}} disabled={Object.values(auditSelCusts).filter(Boolean).length===0} style={{background:"#F59E0B",color:"#fff",border:"none",fontWeight:700}}>{"📋 فتح الجرد ("+Object.values(auditSelCusts).filter(Boolean).length+" عميل)"}</Btn>
        </div>
      </div>
    </div>}
    {activeAud&&auditInclude&&(()=>{
      const visCusts=auditCusts.filter(c=>auditInclude.includes(c.id));
      /* V19.70.22: shared close handler that auto-saves unsaved edits to the audit grid. */
      const closeAudit = () => {
        if (localAudGridDirty && activeAud) saveAllLocalAudGrid(activeAud.id);
        setActiveAudit(null); setAuditInclude(null);
      };
      /* V19.70.24: width fits content. Each customer column ~90mm (~340px),
         model column ~140px, summary 3 cols ~180px, side padding ~50px.
         Cap at viewport - 48px so it never overflows on small screens. */
      const audMaxW = isMob ? "100%" : Math.min(window.innerWidth - 48, 240 + visCusts.length * 95 + 200);
      const audMinW = isMob ? "100%" : Math.min(window.innerWidth - 48, 480);
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:isMob?8:24}} onClick={closeAudit}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,width:isMob?"100%":"fit-content",minWidth:audMinW,maxWidth:audMaxW,maxHeight:"92vh",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)",display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{padding:isMob?"12px 16px":"16px 24px",borderBottom:"1px solid "+T.brd,flexShrink:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:FS+2,fontWeight:800,color:"#F59E0B"}}>{"📋 جرد "+activeAud.date+(activeAud.notes?" — "+activeAud.notes:"")}</div>
            <div style={{display:"flex",gap:4}}><Btn small onClick={()=>setShowAuditAnalysis(activeAud.id)} style={{background:"#8B5CF612",color:"#8B5CF6",border:"1px solid #8B5CF630"}} title="تحليل المبيعات">📊 تحليل</Btn><Btn ghost small onClick={closeAudit} title="إغلاق">✕</Btn></div>
          </div>
        </div>
        <div id="audit-matrix-table" style={{flex:1,overflowY:"auto",overflowX:"auto",padding:isMob?"8px 16px 16px":"8px 24px 24px"}}>
          <table style={{width:"100%",borderCollapse:"collapse",whiteSpace:"nowrap"}}>
            <thead style={{position:"sticky",top:0,zIndex:10,background:T.cardSolid}}><tr>
              <th style={{...TH,minWidth:120}}>الموديل</th>
              {visCusts.map(c=><th key={c.id} style={{...TH,textAlign:"center",minWidth:80,fontSize:FS-2}}>
                <div style={{fontWeight:700}}>{c.name}</div>
                {canEdit&&<div style={{marginTop:2}}><span onClick={e=>{e.stopPropagation();setOcrCust(c.id);setOcrResult(null)}} style={{cursor:"pointer",fontSize:10,padding:"1px 4px",borderRadius:4,background:"#8B5CF610",color:"#8B5CF6"}} title="تصوير جرد بالذكاء الاصطناعي">📸</span></div>}
              </th>)}
              <th style={{...TH,textAlign:"center",background:"#F59E0B15",color:"#F59E0B",fontWeight:800}}>اجمالي</th>
              <th style={{...TH,textAlign:"center",fontSize:FS-2}}>تم تسليمه</th>
              <th style={{...TH,textAlign:"center",fontSize:FS-2}}>% البيع</th>
            </tr></thead>
            <tbody>
              {/* V19.70.22: audit cells now read/write localAudGrid (unsaved local state).
                  Always-on inputs replace the click-to-edit. The footer save button commits all
                  changes via one upConfig. Tab key navigates to next column for fast row-fill. */}
              {auditModels.map((m,mi)=>{const rowTotal=visCusts.reduce((s,c)=>s+(Number(localAudGrid[m.id+"_"+c.id])||0),0);const pct=m.custDel>0?Math.round(rowTotal/m.custDel*100):0;
                return<tr key={m.id} style={{background:mi%2===0?"transparent":T.bg+"80"}}>
                  <td style={{...TD,fontWeight:700}}><div style={{fontWeight:800,color:T.accent}}>{m.modelNo}</div><div style={{fontSize:FS-3,color:T.textMut}}>{m.modelDesc}</div></td>
                  {visCusts.map((c,ci)=>{const k=m.id+"_"+c.id;const q=Number(localAudGrid[k])||0;
                    return<td key={c.id} style={{...TD,textAlign:"center",padding:2,background:q>0?"#F59E0B04":"transparent"}}>
                      {canEdit ? (
                        <input type="number" min="0" value={q || ""}
                          onFocus={e=>e.target.select()}
                          onChange={e=>{
                            const v = Math.max(0, Number(e.target.value) || 0);
                            setLocalAudGrid(prev => {
                              const next = { ...prev };
                              if (v > 0) next[k] = v;
                              else delete next[k];
                              return next;
                            });
                            setLocalAudGridDirty(true);
                          }}
                          onKeyDown={e=>{
                            if (e.key === "Tab" && !e.shiftKey) {
                              const nextCi = ci + 1;
                              if (nextCi < visCusts.length) {
                                e.preventDefault();
                                const nk = m.id + "_" + visCusts[nextCi].id;
                                const nextEl = document.querySelector('input[data-aud-cell="'+nk+'"]');
                                if (nextEl) { nextEl.focus(); nextEl.select && nextEl.select(); }
                              }
                            }
                          }}
                          data-aud-cell={k}
                          style={{
                            width:"100%",textAlign:"center",
                            border:"1px solid "+(q>0?"#F59E0B60":T.brd),
                            borderRadius:6,padding:"4px 2px",
                            fontSize:FS,fontWeight:q>0?700:500,
                            fontFamily:"inherit",outline:"none",
                            background:q>0?T.bg:"transparent",
                            color:q>0?"#F59E0B":T.text,
                            boxSizing:"border-box",
                            transition:"border-color 0.15s, background-color 0.15s",
                          }}/>
                      ) : (
                        <span style={{fontWeight:q>0?700:400,color:q>0?"#F59E0B":T.textMut}}>{q||"—"}</span>
                      )}
                    </td>;
                  })}
                  <td style={{...TD,textAlign:"center",fontWeight:800,color:"#F59E0B",background:"#F59E0B08"}}>{rowTotal||"—"}</td>
                  <td style={{...TD,textAlign:"center",fontSize:FS-2,color:T.textSec}}>{m.custDel}</td>
                  <td style={{...TD,textAlign:"center",fontWeight:700,color:pct>=50?T.ok:pct>=20?T.warn:T.err}}>{pct+"%"}</td>
                </tr>;})}
              <tr style={{background:"#F59E0B10"}}><td style={{...TD,fontWeight:800,color:"#F59E0B"}}>اجمالي المبيعات</td>
                {visCusts.map(c=>{const ct=auditModels.reduce((s,m)=>s+(Number(localAudGrid[m.id+"_"+c.id])||0),0);return<td key={c.id} style={{...TD,textAlign:"center",fontWeight:800,color:"#F59E0B"}}>{ct||"—"}</td>})}
                <td style={{...TD,textAlign:"center",fontWeight:800,fontSize:FS+2,color:"#fff",background:"#F59E0B"}}>{auditModels.reduce((s,m)=>s+visCusts.reduce((ss,c)=>ss+(Number(localAudGrid[m.id+"_"+c.id])||0),0),0)}</td>
                <td style={TD}></td><td style={TD}></td>
              </tr>
              <tr style={{background:T.accent+"06"}}><td style={{...TD,fontWeight:700,color:T.accent,fontSize:FS-1}}>اجمالي الاستلام</td>
                {visCusts.map(c=>{const del=getCustTotal(c.id);return<td key={c.id} style={{...TD,textAlign:"center",fontWeight:700,color:T.accent}}>{del||"—"}</td>})}
                <td style={{...TD,textAlign:"center",fontWeight:800,color:T.accent}}>{visCusts.reduce((s,c)=>s+getCustTotal(c.id),0)}</td>
                <td style={TD}></td><td style={TD}></td>
              </tr>
              <tr style={{background:T.warn+"06"}}><td style={{...TD,fontWeight:700,color:T.warn,fontSize:FS-1}}>رصيد العميل</td>
                {visCusts.map(c=>{const del=getCustTotal(c.id);const sold=auditModels.reduce((s,m)=>s+(Number(localAudGrid[m.id+"_"+c.id])||0),0);const bal=del-sold;return<td key={c.id} style={{...TD,textAlign:"center",fontWeight:700,color:bal>0?T.warn:T.ok}}>{bal}</td>})}
                <td style={TD}></td><td style={TD}></td><td style={TD}></td>
              </tr>
              <tr style={{background:"#8B5CF608"}}><td style={{...TD,fontWeight:700,color:"#8B5CF6",fontSize:FS-2}}>% مبيعات</td>
                {visCusts.map(c=>{const ct=auditModels.reduce((s,m)=>s+(Number(localAudGrid[m.id+"_"+c.id])||0),0);const delivered=getCustTotal(c.id);const pct=delivered>0?Math.round(ct/delivered*100):0;return<td key={c.id} style={{...TD,textAlign:"center",fontWeight:800,fontSize:FS-1,color:pct>=50?T.ok:pct>=20?"#F59E0B":T.err}}>{pct+"%"}</td>})}
                <td style={TD}></td><td style={TD}></td><td style={TD}></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{display:"flex",gap:10,justifyContent:"center",alignItems:"center",padding:"12px 24px",borderTop:"1px solid "+T.brd,flexShrink:0,flexWrap:"wrap"}}>
          {/* V19.70.22: dirty indicator + explicit save button. Auto-save on close too. */}
          {canEdit && localAudGridDirty && (
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"4px 10px",borderRadius:8,background:T.warn+"15",border:"1px solid "+T.warn+"40"}}>
              <span style={{fontSize:FS-2,color:T.warn,fontWeight:700}}>● تغييرات غير محفوظة</span>
            </div>
          )}
          {canEdit && (
            <Btn onClick={()=>saveAllLocalAudGrid(activeAud.id)} disabled={!localAudGridDirty}
              style={{background:localAudGridDirty?T.ok:T.bg,color:localAudGridDirty?"#fff":T.textMut,border:"none",fontWeight:700,opacity:localAudGridDirty?1:0.6}}>
              💾 حفظ التغييرات
            </Btn>
          )}
          <Btn onClick={()=>{const sel={};(auditInclude||[]).forEach(id=>{sel[id]=true});setAuditSelCusts(sel);setAuditInclude(null)}} style={{background:T.bg,color:T.textSec,border:"1px solid "+T.brd}}>👥 تغيير العملاء</Btn>
          <Btn onClick={()=>setShowAuditAnalysis(activeAud.id)} style={{background:"#8B5CF612",color:"#8B5CF6",border:"1px solid #8B5CF630"}} title="تحليل المبيعات">📊 تحليل</Btn>
          <Btn onClick={()=>{
            /* Auto-save unsaved edits on close */
            if (localAudGridDirty) saveAllLocalAudGrid(activeAud.id);
            setActiveAudit(null);setAuditInclude(null);
          }} style={{background:T.ok,color:"#fff",border:"none",fontWeight:700}}>✓ إغلاق</Btn>
        </div>
      </div>
    </div>})()}
    {/* Audit Analysis Popup */}
    {showAuditAnalysis&&(()=>{const aud=audits.find(a=>a.id===showAuditAnalysis);if(!aud)return null;const g=aud.grid||{};
      const modelSales={};const custSales={};let total=0;
      auditModels.forEach(m=>{let mTotal=0;auditCusts.forEach(c=>{const q=Number(g[m.id+"_"+c.id])||0;mTotal+=q;if(!custSales[c.name])custSales[c.name]=0;custSales[c.name]+=q});if(mTotal>0)modelSales[m.modelNo]={qty:mTotal,delivered:m.custDel,pct:m.custDel>0?Math.round(mTotal/m.custDel*100):0};total+=mTotal});
      const topModels=Object.entries(modelSales).sort((a,b)=>b[1].qty-a[1].qty);
      const topCusts=Object.entries(custSales).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
      const maxModelQty=topModels[0]?.[1]?.qty||1;const maxCustQty=topCusts[0]?.[1]||1;
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowAuditAnalysis(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:isMob?500:700,maxHeight:"85vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div style={{fontSize:FS+2,fontWeight:800,color:"#8B5CF6"}}>{"📊 تحليل جرد — "+aud.date}</div>
            <div style={{display:"flex",gap:4}}><Btn small onClick={()=>{const el=document.getElementById("audit-analysis-content");if(el)printPage("📊 تحليل جرد مبيعات — "+aud.date,el.innerHTML)}} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨</Btn><Btn ghost small onClick={()=>setShowAuditAnalysis(null)} title="إغلاق">✕</Btn></div>
          </div>
          <div id="audit-analysis-content">
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16}}>
            <div style={{padding:10,borderRadius:10,background:"#F59E0B08",border:"1px solid #F59E0B15",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>اجمالي المبيعات</div><div style={{fontSize:20,fontWeight:800,color:"#F59E0B"}}>{fmt(total)}</div></div>
            <div style={{padding:10,borderRadius:10,background:T.accent+"08",border:"1px solid "+T.accent+"15",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>عدد الموديلات</div><div style={{fontSize:20,fontWeight:800,color:T.accent}}>{topModels.length}</div></div>
            <div style={{padding:10,borderRadius:10,background:T.ok+"08",border:"1px solid "+T.ok+"15",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>عدد العملاء</div><div style={{fontSize:20,fontWeight:800,color:T.ok}}>{topCusts.length}</div></div>
          </div>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:FS,fontWeight:700,color:T.text,marginBottom:8}}>🏆 أعلى موديلات مبيعاً</div>
            {topModels.slice(0,5).map(([name,d],i)=><div key={name} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
              <span style={{fontWeight:800,color:i===0?"#F59E0B":i===1?"#94A3B8":i===2?"#CD7F32":T.textSec,fontSize:FS}}>{i<3?["🥇","🥈","🥉"][i]:(i+1)+"."}</span>
              <div style={{flex:1}}><div style={{display:"flex",justifyContent:"space-between",fontSize:FS-1}}><span style={{fontWeight:700}}>{name}</span><span style={{fontWeight:800,color:"#F59E0B"}}>{d.qty+" قطعة ("+d.pct+"%)"}</span></div>
                <div style={{height:6,borderRadius:3,background:T.brd,marginTop:3}}><div style={{height:6,borderRadius:3,background:"linear-gradient(90deg,#F59E0B,#F97316)",width:Math.round(d.qty/maxModelQty*100)+"%"}}/></div></div>
            </div>)}
          </div>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:FS,fontWeight:700,color:T.text,marginBottom:8}}>👥 أعلى عملاء مبيعاً</div>
            {topCusts.slice(0,5).map(([name,qty],i)=><div key={name} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
              <span style={{fontWeight:800,color:i===0?"#F59E0B":i===1?"#94A3B8":i===2?"#CD7F32":T.textSec,fontSize:FS}}>{i<3?["🥇","🥈","🥉"][i]:(i+1)+"."}</span>
              <div style={{flex:1}}><div style={{display:"flex",justifyContent:"space-between",fontSize:FS-1}}><span style={{fontWeight:700}}>{name}</span><span style={{fontWeight:800,color:T.ok}}>{qty+" قطعة ("+(total?Math.round(qty/total*100):0)+"%)"}</span></div>
                <div style={{height:6,borderRadius:3,background:T.brd,marginTop:3}}><div style={{height:6,borderRadius:3,background:"linear-gradient(90deg,#10B981,#059669)",width:Math.round(qty/maxCustQty*100)+"%"}}/></div></div>
            </div>)}
          </div>
          {topModels.filter(([,d])=>d.pct<20).length>0&&<div style={{padding:10,borderRadius:10,background:T.warn+"08",border:"1px solid "+T.warn+"15"}}>
            <div style={{fontSize:FS-1,fontWeight:700,color:T.warn,marginBottom:4}}>⚠️ موديلات بطيئة البيع (أقل من 20%)</div>
            {topModels.filter(([,d])=>d.pct<20).map(([name,d])=><div key={name} style={{fontSize:FS-2,color:T.textSec}}>{"• "+name+" — تسليم "+d.delivered+" → مبيعات "+d.qty+" ("+d.pct+"%)"}</div>)}
          </div>}
          </div>
        </div>
      </div>})()}
    {/* OCR Audit Popup — V15.64 Enhanced */}
    {ocrCust&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>{setOcrCust(null);setOcrResult(null);if(ocrImageUrl){URL.revokeObjectURL(ocrImageUrl);setOcrImageUrl(null)}}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:ocrResult?780:500,maxHeight:"92vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:FS+1,fontWeight:800,color:"#8B5CF6"}}>{"📸 قراءة جرد — "+(auditCusts.find(c=>c.id===ocrCust)?.name||"")}</div>
          <Btn ghost small onClick={()=>{setOcrCust(null);setOcrResult(null);if(ocrImageUrl){URL.revokeObjectURL(ocrImageUrl);setOcrImageUrl(null)}}} title="إغلاق">✕</Btn>
        </div>
        {!ocrResult&&!ocrLoading&&<div>
          {/* V15.64: Pre-scan tips for better accuracy */}
          <div style={{padding:"10px 12px",borderRadius:10,background:"#F0F9FF",border:"1px solid #BAE6FD",marginBottom:12}}>
            <div style={{fontSize:FS-1,fontWeight:800,color:"#0369A1",marginBottom:6}}>📋 نصائح لدقة أعلى:</div>
            <div style={{fontSize:FS-2,color:"#0C4A6E",lineHeight:1.7}}>
              • صوّر في إضاءة جيدة بدون ظلال<br/>
              • اتأكد إن الصورة واضحة ومش مايلة<br/>
              • قرّب الصورة لعمود المبيعات بس<br/>
              • اكتب الأرقام بخط واضح ومنفصل
            </div>
          </div>
          <div style={{border:"2px dashed "+T.brd,borderRadius:12,padding:30,textAlign:"center",cursor:"pointer",background:T.bg}} onClick={()=>ocrRef.current?.click()}>
            <div style={{fontSize:32,marginBottom:8}}>📸</div>
            <div style={{fontSize:FS,fontWeight:700,color:T.text}}>صوّر جرد العميل أو اختار صورة</div>
            <div style={{fontSize:FS-2,color:T.textMut,marginTop:4}}>البرنامج هيقرأ عمود المبيعات تلقائياً</div>
          </div>
          <input ref={ocrRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)scanAuditImage(f,ocrCust);e.target.value=""}}/>
        </div>}
        {ocrLoading&&<div style={{textAlign:"center",padding:30}}>
          <div style={{display:"flex",justifyContent:"center",marginBottom:10}}>
            <Spinner size="large" color={T.accent}/>
          </div>
          <div style={{fontSize:FS,fontWeight:700,color:T.accent}}>جاري قراءة الجرد بالذكاء الاصطناعي...</div>
          <div style={{fontSize:FS-2,color:T.textMut,marginTop:4}}>قد يستغرق بضع ثواني</div>
        </div>}
        {ocrResult&&(()=>{
          const highCount=ocrResult.items.filter(it=>it.confidence==="high").length;
          const medCount=ocrResult.items.filter(it=>it.confidence==="medium").length;
          const lowCount=ocrResult.items.filter(it=>it.confidence==="low").length;
          const warnCount=ocrResult.items.filter(it=>it.warning).length;
          return <div>
          <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10,flexWrap:"wrap"}}>
            <div style={{fontSize:FS,fontWeight:800,color:T.ok}}>{"✅ "+ocrResult.items.length+" موديل"}</div>
            {highCount>0&&<span style={{padding:"2px 8px",borderRadius:6,background:"#10B98118",color:"#10B981",fontSize:FS-2,fontWeight:700}}>{"🟢 ثقة عالية: "+highCount}</span>}
            {medCount>0&&<span style={{padding:"2px 8px",borderRadius:6,background:"#F59E0B18",color:"#F59E0B",fontSize:FS-2,fontWeight:700}}>{"🟡 ثقة متوسطة: "+medCount}</span>}
            {lowCount>0&&<span style={{padding:"2px 8px",borderRadius:6,background:"#EF444418",color:"#EF4444",fontSize:FS-2,fontWeight:700}}>{"🔴 ثقة منخفضة: "+lowCount}</span>}
            {warnCount>0&&<span style={{padding:"2px 8px",borderRadius:6,background:"#DC262618",color:"#DC2626",fontSize:FS-2,fontWeight:700}}>{"⚠️ تحذيرات: "+warnCount}</span>}
          </div>
          <div style={{fontSize:FS-2,color:T.warn,marginBottom:10,fontWeight:600}}>⚠️ راجع الأرقام الملونة (الصفراء والحمراء) وعدّل قبل التسجيل</div>
          {/* V15.64: Side-by-side image + results */}
          <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":ocrImageUrl?"1fr 1fr":"1fr",gap:12,marginBottom:12}}>
            {ocrImageUrl&&<div style={{border:"1px solid "+T.brd,borderRadius:10,overflow:"hidden",background:T.bg,maxHeight:400,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <img src={ocrImageUrl} alt="الجرد" style={{maxWidth:"100%",maxHeight:400,objectFit:"contain"}}/>
            </div>}
            <div style={{maxHeight:400,overflowY:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><th style={TH}>الموديل</th><th style={TH}>المطابقة</th><th style={TH}>المبيعات</th><th style={TH}>ثقة</th></tr></thead><tbody>
                {ocrResult.items.map((it,i)=>{
                  const confColor=it.confidence==="high"?"#10B981":it.confidence==="low"?"#EF4444":"#F59E0B";
                  const confIcon=it.confidence==="high"?"🟢":it.confidence==="low"?"🔴":"🟡";
                  const rowBg=it.warning?"#FEE2E220":it.confidence==="low"?"#FEE2E210":it.confidence==="medium"?"#FEF3C710":(i%2===0?"transparent":T.bg+"80");
                  return <tr key={i} style={{background:rowBg}}>
                    <td style={{...TD,fontWeight:600}}>{it.input}</td>
                    <td style={TD}>{it.matched?<span style={{color:T.ok,fontWeight:700,fontSize:FS-2}}>{"✅ "+it.matched}</span>:<span style={{color:T.err,fontWeight:700,fontSize:FS-2}}>⚠️ غير موجود</span>}</td>
                    <td style={{...TD,textAlign:"center"}}>
                      <input type="number" value={it.qty} onChange={e=>{const v=Number(e.target.value)||0;setOcrResult(p=>{const n={...p,items:[...p.items]};n.items[i]={...n.items[i],qty:v,confidence:"high"/*manual edit = high confidence*/};return n})}} style={{width:70,textAlign:"center",border:"2px solid "+confColor,borderRadius:6,padding:"4px",fontSize:FS,fontWeight:800,fontFamily:"inherit",background:"#FFF",color:confColor}}/>
                      {it.warning&&<div style={{fontSize:FS-3,color:"#DC2626",marginTop:3,fontWeight:700}}>{it.warning}</div>}
                    </td>
                    <td style={{...TD,textAlign:"center",fontSize:FS-1}}>{confIcon}</td>
                  </tr>;
                })}
              </tbody></table>
            </div>
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
            <Btn ghost onClick={()=>{setOcrResult(null);if(ocrImageUrl){URL.revokeObjectURL(ocrImageUrl);setOcrImageUrl(null)}}}>📸 صورة أخرى</Btn>
            <Btn onClick={applyOcr} style={{background:"#F59E0B",color:"#fff",border:"none",fontWeight:700}}>{"✓ تسجيل "+ocrResult.items.filter(it=>it.matchedId).length+" موديل"}</Btn>
          </div>
        </div>})()}
      </div>
    </div>}
    {/* Sales Detail Popup */}
    {salesDetail&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setSalesDetail(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:isMob?400:550,maxHeight:"80vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:FS+1,fontWeight:800,color:salesDetail.color}}>{salesDetail.title}</div>
          <Btn ghost small onClick={()=>setSalesDetail(null)} title="إغلاق">✕</Btn>
        </div>
        <table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><th style={TH}>#</th><th style={TH}>البيان</th><th style={TH}>الكمية</th></tr></thead><tbody>
          {(salesDetail.items||[]).map((d,i)=><tr key={i} style={{background:i%2===0?"transparent":T.bg+"80"}}><td style={TD}>{i+1}</td><td style={{...TD,fontWeight:700}}>{d.name}</td><td style={{...TD,textAlign:"center",fontWeight:800,color:salesDetail.color}}>{fmt(d.qty)}</td></tr>)}
          <tr style={{background:salesDetail.color+"10"}}><td style={TD}></td><td style={{...TD,fontWeight:800}}>الاجمالي</td><td style={{...TD,textAlign:"center",fontWeight:800,fontSize:FS+2,color:salesDetail.color}}>{fmt(salesDetail.total)}</td></tr>
        </tbody></table>
      </div>
    </div>}
    {/* New Audit Popup */}
    {showNewAudit&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowNewAudit(false)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:480,maxHeight:"85vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{fontSize:FS+2,fontWeight:800,color:"#F59E0B",marginBottom:16}}>📋 جرد مبيعات جديد</div>
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:14}}>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>تاريخ الجرد *</label><Inp type="date" value={auditDate} onChange={setAuditDate}/></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>من تاريخ</label><Inp type="date" value={auditFrom} onChange={setAuditFrom}/></div>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>إلى تاريخ</label><Inp type="date" value={auditTo} onChange={setAuditTo}/></div>
          </div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>ملاحظات</label><Inp value={auditNote} onChange={setAuditNote} placeholder="مثال: جرد أسبوع 2"/></div>
        </div>
        <div style={{fontSize:FS,fontWeight:700,color:T.text,marginBottom:8}}>👥 اختر العملاء:</div>
        <div style={{display:"flex",gap:6,marginBottom:8}}>
          <Btn small onClick={()=>{const all={};auditCusts.forEach(c=>{all[c.id]=true});setAuditSelCusts(all)}} style={{background:T.bg,color:T.textSec,border:"1px solid "+T.brd,fontSize:FS-2}}>☑ الكل</Btn>
          <Btn small onClick={()=>setAuditSelCusts({})} style={{background:T.bg,color:T.textSec,border:"1px solid "+T.brd,fontSize:FS-2}}>☐ لا شيء</Btn>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:14,maxHeight:200,overflowY:"auto"}}>
          {auditCusts.map(c=><div key={c.id} onClick={()=>setAuditSelCusts(p=>({...p,[c.id]:!p[c.id]}))} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderRadius:8,cursor:"pointer",background:auditSelCusts[c.id]?"#F59E0B08":"transparent",border:"1px solid "+(auditSelCusts[c.id]?"#F59E0B30":T.brd+"60")}}>
            <span style={{fontSize:14}}>{auditSelCusts[c.id]?"☑":"☐"}</span>
            <span style={{fontWeight:600,fontSize:FS-1,flex:1}}>{c.name}</span>
            <span style={{fontSize:FS-2,color:T.textMut}}>{"استلم: "+getCustTotal(c.id)}</span>
          </div>)}
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn ghost onClick={()=>setShowNewAudit(false)}>الغاء</Btn><Btn onClick={createAudit} disabled={Object.values(auditSelCusts).filter(Boolean).length===0} style={{background:"#F59E0B",color:"#fff",border:"none",fontWeight:700}}>{"📋 إنشاء ("+Object.values(auditSelCusts).filter(Boolean).length+" عميل)"}</Btn></div>
      </div>
    </div>}
    {/* Free Return Popup */}
    {freeReturn==="pick"&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setFreeReturn(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:450,maxHeight:"80vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{fontSize:FS+2,fontWeight:800,color:T.err,marginBottom:12}}>↩️ مرتجع مبيعات — اختر العميل</div>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          {customers.filter(c=>getCustTotal(c.id)>0).map(c=><div key={c.id} onClick={()=>{setFreeReturn(c.id);setFreeRetItems({});setFreeRetNote("")}} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",borderRadius:10,cursor:"pointer",border:"1px solid "+T.brd,background:T.cardSolid}} onMouseEnter={e=>e.currentTarget.style.background=T.err+"06"} onMouseLeave={e=>e.currentTarget.style.background=T.cardSolid}>
            <span style={{fontWeight:700,fontSize:FS}}>{c.name}</span>
            <span style={{fontSize:FS-1,color:T.accent,fontWeight:600}}>{"استلم: "+getCustTotal(c.id)}</span>
          </div>)}
        </div>
      </div>
    </div>}
    {freeReturn&&freeReturn!=="pick"&&(()=>{const cust=customers.find(c=>c.id===freeReturn);if(!cust)return null;
      const custModels=[];orders.forEach(o=>{const del=(o.customerDeliveries||[]).filter(d=>d.custId===freeReturn).reduce((s,d)=>s+(Number(d.qty)||0),0);const ret=(o.customerReturns||[]).filter(r=>r.custId===freeReturn).reduce((s,r)=>s+(Number(r.qty)||0),0);const net=del-ret;if(net>0)custModels.push({id:o.id,modelNo:o.modelNo,modelDesc:o.modelDesc,delivered:del,returned:ret,net})});
      const totalRet=Object.values(freeRetItems).reduce((s,v)=>s+(Number(v)||0),0);
      const saveFreeReturn=()=>{if(totalRet<=0){showToast("⚠️ ادخل كمية المرتجع");return}
        Object.entries(freeRetItems).forEach(([orderId,qty])=>{const q=Number(qty)||0;if(q<=0)return;
          updOrder(orderId,o=>{if(!o.customerReturns)o.customerReturns=[];
            /* V21.9.192: stamp discPct from the most-recent sale for this
               customer on this order (no session — free return). */
            const retEntry={custId:freeReturn,custName:cust.name,qty:q,note:freeRetNote||"مرتجع حر",date:cairoDateStr(),createdBy:userName||""};
            const matchedDisc=findMatchingSaleDiscPct(o,freeReturn,null);
            if(matchedDisc!==undefined)retEntry.discPct=matchedDisc;
            o.customerReturns.push(retEntry);
          })});
        showToast("✓ تم تسجيل مرتجع "+totalRet+" قطعة من "+cust.name);setFreeReturn(null)};
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setFreeReturn(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:isMob?420:550,maxHeight:"85vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
            <div style={{fontSize:FS+2,fontWeight:800,color:T.err}}>{"↩️ مرتجع — "+cust.name}</div>
            <Btn ghost small onClick={()=>setFreeReturn(null)} title="إغلاق">✕</Btn>
          </div>
          <div style={{fontSize:FS-2,color:T.textMut,marginBottom:12}}>{"استلم "+getCustTotal(freeReturn)+" قطعة خلال الموسم"}</div>
          <table style={{width:"100%",borderCollapse:"collapse",marginBottom:12}}><thead><tr>{["الموديل","تسليم","مرتجع سابق","صافي","كمية المرتجع"].map(h=><th key={h} style={{...TH,fontSize:FS-2}}>{h}</th>)}</tr></thead><tbody>
            {custModels.map((m,i)=>{const retQ=Number(freeRetItems[m.id])||0;return<tr key={m.id} style={{background:i%2===0?"transparent":T.bg+"80"}}>
              <td style={{...TD,fontWeight:700}}><div style={{color:T.accent}}>{m.modelNo}</div><div style={{fontSize:FS-3,color:T.textMut}}>{m.modelDesc}</div></td>
              <td style={{...TD,textAlign:"center"}}>{m.delivered}</td>
              <td style={{...TD,textAlign:"center",color:m.returned>0?T.err:T.textMut}}>{m.returned||"—"}</td>
              <td style={{...TD,textAlign:"center",fontWeight:700}}>{m.net}</td>
              <td style={{...TD,textAlign:"center",width:90}}><input type="number" value={retQ||""} onChange={e=>{const v=Math.min(Math.max(0,Number(e.target.value)||0),m.net);setFreeRetItems(p=>({...p,[m.id]:v}))}} placeholder="0" style={{width:70,textAlign:"center",border:"2px solid "+(retQ>0?T.err:T.brd),borderRadius:6,padding:"4px",fontSize:FS,fontWeight:700,fontFamily:"inherit",background:retQ>0?T.err+"06":"transparent",color:retQ>0?T.err:T.text}}/></td>
            </tr>})}
          </tbody></table>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>ملاحظات</label><Inp value={freeRetNote} onChange={setFreeRetNote} placeholder="سبب المرتجع..."/></div>
          {totalRet>0&&<div style={{padding:10,borderRadius:8,background:T.err+"08",border:"1px solid "+T.err+"20",marginTop:10,textAlign:"center"}}>
            <span style={{fontWeight:800,color:T.err,fontSize:FS+1}}>{"اجمالي المرتجع: "+totalRet+" قطعة"}</span>
          </div>}
          <div style={{display:"flex",gap:8,justifyContent:"center",marginTop:12}}>
            <Btn ghost onClick={()=>setFreeReturn("pick")}>← تغيير العميل</Btn>
            <Btn onClick={saveFreeReturn} disabled={totalRet<=0} style={{background:T.err,color:"#fff",border:"none",fontWeight:700}}>{"↩️ تسجيل مرتجع ("+totalRet+")"}</Btn>
          </div>
        </div>
      </div>})()}
    {/* QR Quick Sale/Return Popup */}
    {qrSale&&(()=>{const isSale=qrSale.mode==="sale";const title=isSale?"📦 بيع سريع":"↩️ مرتجع سريع";const color=isSale?"#10B981":"#8B5CF6";
      const getCustDelivered=(orderId)=>{const o=orders.find(x=>x.id===orderId);return(o?.customerDeliveries||[]).filter(d=>d.custId===qrSale.custId).reduce((s,d)=>s+(Number(d.qty)||0),0)};
      const getCustReturned=(orderId)=>{const o=orders.find(x=>x.id===orderId);return(o?.customerReturns||[]).filter(r=>r.custId===qrSale.custId).reduce((s,r)=>s+(Number(r.qty)||0),0)};
      const getAvailStock=(orderId)=>{const sm=stockModels.find(m=>m.id===orderId);if(!sm)return 0;return sm.avail};
      const handleScan=(text)=>{try{
        /* Check for package QR */
        try{const j=JSON.parse(text);if(j.app==="clark"&&j.type==="pkg"){const pkg=(config.packages||[]).find(p=>p.id===j.id);
          if(!pkg||pkg.status==="مغلقة"){playBeep("error");showToast("⛔ كرتونة غير متاحة");return}
          if(isSale){const newItems=[];let blocked=false;const currentActual={};qrSale.items.forEach(it=>{currentActual[it.orderId]=(currentActual[it.orderId]||0)+(Number(it.qty)||0)});
            pkg.items.forEach(it=>{const o=orders.find(x=>x.id===it.orderId);if(!o)return;
            const avail=getAvailStock(it.orderId);const alreadyInCart=(currentActual[it.orderId]||0);
            if(alreadyInCart+it.qty>avail){showToast("⚠️ "+it.modelNo+": المتاح ("+avail+") أقل من المطلوب ("+(alreadyInCart+it.qty)+")");blocked=true;return}
            for(let s=0;s<it.count;s++){newItems.push({orderId:it.orderId,modelNo:it.modelNo,modelDesc:o.modelDesc||"",rackSize:it.rackSize,qty:it.rackSize})}});
            if(blocked)return;if(newItems.length===0){playBeep("error");showToast("⛔ الكرتونة فارغة");return}
            playBeep("done");showToast("✅ تم اضافة كرتونة "+j.num+" ("+pkg.items.reduce((s,it)=>s+it.qty,0)+" قطعة)");
            setQrSale(p=>({...p,items:[...p.items,...newItems],_pkgId:pkg.id,_pkgNum:j.num}))}
          else{playBeep("error");showToast("⛔ لا يمكن مرتجع كرتونة كاملة")}return}}catch(e2){}
        /* Regular model QR */
        const parts=text.split(":");if(parts[0]!=="CLARK"||parts.length<3)return;const orderId=parts[1];const qrRs=Number(parts[2])||1;
        const o=orders.find(x=>x.id===orderId);if(!o){playBeep("error");showToast("⛔ موديل غير موجود");return}
        /* Always scan as full series: max(QR value, pcsPerSeries from sizeSet) — V15.30 uses source of truth */
        const info=getSizesFromSet(o,data);
        const rs=info.expectedCount>1?Math.max(qrRs,info.expectedCount):qrRs;
        /* V15.36: FIFO Auto-Distribution — if multiple orders share the same modelNo,
           distribute requested qty across them (oldest first). Only when prices are consistent. */
        let sameModelOrders=getSameModelOrders(orderId);
        /* V15.41 FIX: When linked to a distribution session, restrict FIFO to orders in that session only.
           Otherwise, the FIFO can allocate to orders outside the session (e.g., older orders with same modelNo),
           which then fails confirmSale's group-planned check. */
        if(isSale&&qrSale.linkedSession&&qrSale.linkedSession!=="free"){
          const _sess=sessions.find(s=>s.id===qrSale.linkedSession);
          if(_sess){
            /* V19.59 BUGFIX: same fix as the dropdown — match by modelNo, not order id.
               linkedSess.modelIds stores SPECIFIC order ids; if a re-cut produced a new
               order with the same modelNo, sameModelOrders contains the new order id but
               the session's modelIds doesn't, so the filter would empty the list. */
            const sessModelNos=new Set();
            for(const oid of (_sess.modelIds||[])){
              const oo=orders.find(x=>x.id===oid);
              if(oo&&oo.modelNo)sessModelNos.add(oo.modelNo);
            }
            const filtered=sameModelOrders.filter(o=>sessModelNos.has(o.modelNo));
            if(filtered.length===0){
              playBeep("error");
              showToast("⛔ "+o.modelNo+": الموديل غير موجود في سجل التوزيع الحالي");
              return;
            }
            sameModelOrders=filtered;
          }
        }
        const isGrouped=sameModelOrders.length>1;
        if(isGrouped){
          const priceCheck=checkGroupPriceConsistent(sameModelOrders);
          if(!priceCheck.consistent){
            playBeep("error");
            showToast("⛔ "+o.modelNo+": الأسعار مختلفة في التشغيلات ("+priceCheck.prices.join("، ")+" ج) — لا يمكن الدمج. راجع أسعار الأوردرات.");
            return;
          }
        }
        const currentCart={};qrSale.items.forEach(it=>{currentCart[it.orderId]=(currentCart[it.orderId]||0)+(Number(it.qty)||0)});
        if(isSale){
          /* Pass session context for planned-limit cap */
          const _ls=qrSale.linkedSession&&qrSale.linkedSession!=="free"?sessions.find(s=>s.id===qrSale.linkedSession):null;
          const cartWithCtx={...currentCart,__custId:qrSale.custId,__sessId:_ls?_ls.id:null};
          const dist=distributeFIFO(sameModelOrders,rs,"sale",cartWithCtx,_ls?(_ls.grid||{}):null,null,qrSale.override===true);
          if(!dist.ok){playBeep("error");showToast(dist.error);return}
          /* Success — add one item per allocation (keeps per-order accounting correct for pricing) */
          playBeep("ok");
          if(qrSale.override===true)showToast("⚠️ "+o.modelNo+" — بيع طوارئ (خارج الخطة)");
          setQrSale(p=>{const newItems=[...p.items];dist.allocations.forEach(a=>{const oo=orders.find(x=>x.id===a.orderId);newItems.push({orderId:a.orderId,modelNo:oo.modelNo,modelDesc:oo.modelDesc,rackSize:rs,qty:a.qty,isOverride:qrSale.override===true})});return{...p,items:newItems}});
        }else{/* return */
          const dist=distributeFIFO(sameModelOrders,rs,"return",currentCart,null,qrSale.custId);
          if(!dist.ok){playBeep("error");showToast(dist.error.replace(/المتاح/g,"المسلّم للعميل"));return}
          playBeep("ok");
          setQrSale(p=>{const newItems=[...p.items];dist.allocations.forEach(a=>{const oo=orders.find(x=>x.id===a.orderId);newItems.push({orderId:a.orderId,modelNo:oo.modelNo,modelDesc:oo.modelDesc,rackSize:rs,qty:a.qty})});return{...p,items:newItems}});
        }
        }catch(e){
          /* V21.21.31 (تحصين 1.4): الـ catch ده كان فاضي — أي خطأ غير متوقع
             أثناء إضافة المسح للسلة كان بيضيع بصمت: لا صوت ولا رسالة، والقطعة
             المتسلّمة فعلياً ماتتسجلش على العميل (نقص محاسبي صامت). دلوقتي
             المستخدم بيتنبه فوراً ويعيد المسح. */
          playBeep("error");
          showToast("⛔ خطأ غير متوقع أثناء تسجيل المسح — أعد مسح القطعة ("+(e?.message||e)+")");
          console.warn("[CLARK qr-sale addModel]",e);
        }};
      const total=qrSale.items.reduce((s,it)=>s+(Number(it.qty)||0),0);
      const updateQty=(idx,v)=>setQrSale(p=>{const items=[...p.items];items[idx]={...items[idx],qty:Math.max(0,Number(v)||0)};return{...p,items}});
      const removeItem=(idx)=>setQrSale(p=>({...p,items:p.items.filter((_,i)=>i!==idx)}));
      /* V15.36: Group cart items by (modelNo + rackSize) so FIFO-distributed items appear as one merged row */
      const groupedCartItems=(()=>{
        const groups={};const order=[];
        qrSale.items.forEach((it,idx)=>{
          const key=(it.modelNo||"")+"__"+(it.rackSize||0);
          if(!groups[key]){groups[key]={key,modelNo:it.modelNo,modelDesc:it.modelDesc,rackSize:it.rackSize,isBroken:it.isBroken,isOverride:it.isOverride,indices:[],totalQty:0,items:[]};order.push(key)}
          groups[key].indices.push(idx);
          groups[key].items.push(it);
          groups[key].totalQty+=(Number(it.qty)||0);
          if(it.isOverride)groups[key].isOverride=true;
        });
        return order.map(k=>groups[k]);
      })();
      const removeGroup=(grp)=>{const idxSet=new Set(grp.indices);setQrSale(p=>({...p,items:p.items.filter((_,i)=>!idxSet.has(i))}))};
      const updateGroupQty=(grp,newTotal)=>{
        const nt=Math.max(0,Number(newTotal)||0);
        if(nt===0){removeGroup(grp);return}
        /* Redistribute FIFO across the same orderIds (preserve ordering by createdAt) */
        const orderedIds=grp.items.map(it=>it.orderId);
        /* Sort by createdAt to guarantee FIFO */
        const orderedOrders=orderedIds.map(id=>orders.find(x=>x.id===id)).filter(Boolean).sort((a,b)=>((a.createdAt||a.id||"")+"").localeCompare(((b.createdAt||b.id||"")+"")));
        /* Build current-cart EXCLUDING this group (so the capacity check is fair) */
        const otherCart={};qrSale.items.forEach((it,i)=>{if(grp.indices.includes(i))return;otherCart[it.orderId]=(otherCart[it.orderId]||0)+(Number(it.qty)||0)});
        const _ls=isSale&&qrSale.linkedSession&&qrSale.linkedSession!=="free"?sessions.find(s=>s.id===qrSale.linkedSession):null;
        const cartWithCtx={...otherCart,__custId:qrSale.custId,__sessId:_ls?_ls.id:null};
        const dist=distributeFIFO(orderedOrders,nt,isSale?"sale":"return",cartWithCtx,isSale&&_ls?(_ls.grid||{}):null,!isSale?qrSale.custId:null);
        if(!dist.ok){playBeep("error");showToast(dist.error);return}
        /* Replace the group's items with the new allocations (preserve modelNo/rackSize/isBroken) */
        setQrSale(p=>{const kept=p.items.filter((_,i)=>!grp.indices.includes(i));const newAllocs=dist.allocations.map(a=>{const oo=orders.find(x=>x.id===a.orderId);return{orderId:a.orderId,modelNo:oo.modelNo,modelDesc:oo.modelDesc,rackSize:grp.rackSize,qty:a.qty,isBroken:grp.isBroken||false}});return{...p,items:[...kept,...newAllocs]}});
      };
      const closeQrSale=()=>{try{const v=document.getElementById("qr-sale-video");if(v&&v.srcObject){v.srcObject.getTracks().forEach(t=>t.stop());v.srcObject=null}}catch(e){}setQrScanActive(false);setQrSale(null)};
      const linkedSess=isSale&&qrSale.linkedSession&&qrSale.linkedSession!=="free"?sessions.find(s=>s.id===qrSale.linkedSession):null;
      const plannedByModel={};if(linkedSess){Object.entries(linkedSess.grid||{}).forEach(([k,v])=>{const[oid,cid]=k.split("_");if(cid===qrSale.custId){plannedByModel[oid]=(plannedByModel[oid]||0)+(Number(v)||0)}})}
      const actualByModel={};qrSale.items.forEach(it=>{actualByModel[it.orderId]=(actualByModel[it.orderId]||0)+(Number(it.qty)||0)});
      const confirmSale=()=>{if(!qrSale.custId||total<=0)return;
        /* V19.66: double-submit guard — prevent duplicate deliveries on rapid double-tap.
           Pre-V19.66 the only guard was `total<=0` — two synchronous taps both passed,
           both pushed to customerDeliveries (qty doubled in order's delivery list while
           accounting stayed single-posted via _key idempotency). The ref auto-releases
           after 800ms regardless of the return path (validation fail or write success). */
        if(qrSaleSubmittingRef.current)return;
        qrSaleSubmittingRef.current=true;
        setTimeout(()=>{qrSaleSubmittingRef.current=false},800);
        const cust=customers.find(c=>c.id===qrSale.custId);if(!cust)return;
        const byOrder={};qrSale.items.forEach(it=>{if(!byOrder[it.orderId])byOrder[it.orderId]=0;byOrder[it.orderId]+=(Number(it.qty)||0)});
        /* V15.37: For sales, require sellPrice > 0 on every order */
        if(isSale){
          const missingPrice=[];
          for(const oid of Object.keys(byOrder)){
            const o=orders.find(x=>x.id===oid);
            if(!o)continue;
            if(!Number(o.sellPrice))missingPrice.push(o.modelNo||oid);
          }
          if(missingPrice.length>0){
            playBeep("error");
            showToast("⛔ لازم تحط سعر بيع في جدول التوزيعة قبل البيع: "+[...new Set(missingPrice)].join("، "));
            return;
          }
        }
        /* Final validation — V15.40: Group-level (not per-order) + override-aware */
        if(isSale){
          const linkSess=(qrSale.linkedSession&&qrSale.linkedSession!=="free")?sessions.find(s=>s.id===qrSale.linkedSession):null;
          const isOverride=qrSale.override===true;
          /* Group byOrder by modelNo to match FIFO logic */
          const byModel={};
          Object.entries(byOrder).forEach(([oid,qty])=>{const o=orders.find(x=>x.id===oid);if(!o)return;const k=o.modelNo||oid;if(!byModel[k])byModel[k]={modelNo:o.modelNo,orderIds:[],totalQty:0};byModel[k].orderIds.push(oid);byModel[k].totalQty+=qty;});
          for(const[modelNo,grp] of Object.entries(byModel)){
            if(linkSess&&!isOverride){
              /* Sum planned across all sub-orders for this customer */
              const totalPlanned=grp.orderIds.reduce((s,oid)=>s+(Number(linkSess.grid?.[oid+"_"+qrSale.custId])||0),0);
              const totalAlreadySold=grp.orderIds.reduce((s,oid)=>{const o=orders.find(x=>x.id===oid);return s+(o?.customerDeliveries||[]).filter(d=>d.sessionId===linkSess.id&&d.custId===qrSale.custId).reduce((ss,d)=>ss+(Number(d.qty)||0),0)},0);
              const remaining=totalPlanned-totalAlreadySold;
              if(totalPlanned<=0){showToast("⛔ "+modelNo+": لم يوزّع في هذه الجلسة — فعّل وضع الطوارئ للبيع");return}
              if(grp.totalQty>remaining){showToast("⛔ "+modelNo+": الكمية ("+grp.totalQty+") أكبر من المتبقي في الخطة ("+remaining+" من "+totalPlanned+") — فعّل وضع الطوارئ للبيع خارج الخطة");return}
            }else if(!linkSess||isOverride){
              /* Free sale or override: check stock only (group-level) */
              const totalStock=grp.orderIds.reduce((s,oid)=>s+getAvailStock(oid),0);
              /* Plus already-sold-in-cart deductions not needed (getAvailStock already excludes customerDeliveries) */
              if(grp.totalQty>totalStock){showToast("⛔ "+modelNo+": الكمية ("+grp.totalQty+") أكبر من المتاح في المخزن ("+totalStock+")");return}
            }
          }
        }
        else{for(const[oid,qty] of Object.entries(byOrder)){const delivered=getCustDelivered(oid);const returned=getCustReturned(oid);const net=delivered-returned;const o=orders.find(x=>x.id===oid);
          if(delivered<=0){showToast("⛔ العميل لم يستلم "+o?.modelNo);return}
          if(qty>net){showToast("⚠️ "+o?.modelNo+": المرتجع ("+qty+") أكبر من الصافي ("+net+")");return}}}
        if(isSale){
          /* V19.70.4: pre-generate delivery IDs so we can fire instant saleCompleted
             events with stable idempotency keys after upConfig commits. Each entry
             below in the forEach uses its assigned ID. */
          const _instantSale_deliveryIds = {};/* {orderId: id} */
          Object.keys(byOrder).forEach(oid => { _instantSale_deliveryIds[oid] = gid(); });
          const sessId=linkedSess?linkedSess.id:gid();const modelIds=[...new Set(qrSale.items.map(it=>it.orderId))];
          if(!linkedSess){const grid={};Object.entries(byOrder).forEach(([oid,qty])=>{grid[oid+"_"+qrSale.custId]=qty});
            upSales(d=>{if(!d.custDeliverySessions)d.custDeliverySessions=[];d.custDeliverySessions.push({id:sessId,date:cairoDateStr(),modelIds,custIds:[qrSale.custId],grid,createdBy:userName,createdAt:nowISO(),status:"تم التسليم",freeSale:true,saleConfirmed:true})})}
          else{upSales(d=>{const si=(d.custDeliverySessions||[]).findIndex(s=>s.id===sessId);if(si>=0){d.custDeliverySessions[si].actualSales=byOrder;d.custDeliverySessions[si].actualSaleDate=cairoDateStr();d.custDeliverySessions[si].actualSaleBy=userName;d.custDeliverySessions[si].saleConfirmed=true}})}
          Object.entries(byOrder).forEach(([oid,qty])=>{updOrder(oid,o=>{if(!o.customerDeliveries)o.customerDeliveries=[];
            /* V15.45: Record custom price for free/discounted sales — enables accurate revenue reporting */
            /* V19.63: clamp negative input — `-50` would store negative price → negative AR debit */
            /* V21.9.85 (CustDeliver audit Bug #1 + #6): ALWAYS snapshot the
               effective price on the delivery. Pre-V21.9.85, full-price
               deliveries left `entry.price` undefined → downstream balance
               calcs fell back to the order's CURRENT sellPrice. When the
               admin corrected order.sellPrice later, historical customer
               balances changed retroactively. The snapshot freezes the
               price at delivery time so the audit trail is permanent. */
            const cp=Math.max(0,Number(qrSale.customPrice)||0);
            const snapshotPrice=cp>0?cp:(Number(o.sellPrice)||0);
            const entry={id:_instantSale_deliveryIds[oid],custId:qrSale.custId,custName:cust.name,qty,price:snapshotPrice,date:cairoDateStr(),sessionId:sessId,createdBy:userName,createdAt:nowISO()};
            if(qrSale.override===true){entry.isOverride=true;entry.overrideReason="بيع طوارئ خارج الخطة"}
            if(cp>0){entry.isDiscounted=true;entry.originalPrice=Number(o.sellPrice)||0}
            /* V21.9.190 — Phase 2: snapshot the per-customer-per-session
               discount on the delivery entry. The invoice generator
               (`buildSalesInvoiceFromDelivery`) reads `entry.discPct` first,
               so this stamp lets a single customer take different discounts
               on different sessions without rewriting customer.discount.
               Frozen at sale time (same rationale as `price` above) so an
               admin editing the session's custDisc later doesn't mutate
               historical financial records. */
            entry.discPct=getEffectiveDiscount(cust, activeSess);
            /* V19.66: include timestamp so legitimate re-sales (same cust/session/order/day)
               don't collide on the journal idempotency key. Pre-V19.66 a 2nd sale with
               identical key was silently de-duped by autoPost — the qty appeared in
               customerDeliveries but never made it to the journal = silent over-sale. */
            entry._key=oid+":saleDelivery:"+sessId+":"+qrSale.custId+":"+entry.date+":"+Date.now();
            o.customerDeliveries.push(entry);
            /* V18.50: Invoice-based posting mode toggle.
               If autoPostFromInvoice=true, skip direct journal posting (the
               invoice handles it when posted by user) and create a draft
               invoice automatically. Otherwise legacy direct posting. */
            const invoiceMode=(data.invoiceSettings||{}).autoPostFromInvoice===true;
            if(!invoiceMode){
              /* V18.35: auto-post sale journal entry */
              autoPost.sale(data, entry, cust, o, userName).catch(()=>{});
              /* V18.40: COGS companion entry (Dr COGS / Cr finished inventory) */
              autoPost.saleCogs(data, entry, o, userName).catch(()=>{});
            } else {
              /* V18.65: upsert — consolidates same-day same-customer drafts */
              const autoPostOnCreate = (data.invoiceSettings||{}).autoPostOnCreate === true;
              let createdInv = null;
              let isNewInvoice = false;
              upConfig(d=>{
                const res = upsertSalesInvoiceFromDelivery(d, entry, o, cust, userName);
                createdInv = res.invoice;
                isNewInvoice = res.isNew;
                /* V18.65: Only auto-post BRAND NEW invoices. Merged drafts stay draft. */
                if(autoPostOnCreate && createdInv && isNewInvoice){
                  const idx = (d.salesInvoices||[]).findIndex(i => i.id === createdInv.id);
                  if(idx >= 0){
                    d.salesInvoices[idx].status = "posted";
                    d.salesInvoices[idx].postedAt = nowISO();
                    d.salesInvoices[idx].postedBy = userName;
                  }
                }
              });
              /* V18.51: if auto-post on create, also fire the journal entry (new only) */
              if(autoPostOnCreate && createdInv && isNewInvoice){
                autoPost.salesInvoicePosted(data, createdInv, cust, o, userName).then(res => {
                  if(res && res.main && res.main.ok && res.main.entry){
                    upConfig(d => {
                      const idx = (d.salesInvoices||[]).findIndex(i => i.id === createdInv.id);
                      if(idx >= 0){
                        d.salesInvoices[idx].postedJournalRef = {
                          date: res.main.entry.date,
                          entryId: res.main.entry.id,
                          refNo: res.main.entry.refNo,
                        };
                      }
                    });
                  }
                }).catch(()=>{});
              }
            }
          })});
          playBeep("done");showToast((qrSale.override===true?"⚠️ بيع طوارئ ":"✓ تم تسجيل بيع ")+total+" قطعة لـ "+cust.name);
          /* V19.70.4: instant saleCompleted fire (one event per order delivery).
             Same fire-and-forget pattern as TreasuryPg V19.70.3. The cron remains
             fallback — idempotency via `sale:${id}` prevents double-send. */
          if(cust?.phone && user && typeof user.getIdToken === "function"){
            (async ()=>{
              try{
                const idToken = await user.getIdToken();
                const orders = data.orders||[];
                await Promise.all(Object.entries(byOrder).map(([oid,qty])=>{
                  const order = orders.find(o=>o.id===oid)||{};
                  const deliveryId = _instantSale_deliveryIds[oid];
                  const cp = Math.max(0, Number(qrSale.customPrice)||0);
                  const price = cp>0 ? cp : (Number(order.sellPrice)||0);
                  return fetch("/api/event-trigger", {
                    method:"POST",
                    headers:{"Content-Type":"application/json","Authorization":"Bearer "+idToken},
                    body: JSON.stringify({
                      eventType:"saleCompleted",
                      payload:{
                        customerName: cust.name||"—",
                        qty, modelNo: order.modelNo||oid,
                        value: qty*price,
                        date: cairoDateStr(),
                        salesperson: userName||"—",
                        portalLink: "",
                      },
                      customerPhone: cust.phone,
                      idempotencyKey: "sale:"+deliveryId,
                    }),
                  }).catch(()=>{/* silent — cron fallback */});
                }));
              }catch(e){
                console.warn("[V19.70.4] instant saleCompleted fire failed (cron will retry):", e?.message||e);
              }
            })();
          }
          /* Archive package if sale was from package */
          if(qrSale._pkgId){upSales(d=>{const pi=(d.packages||[]).findIndex(p=>p.id===qrSale._pkgId);if(pi>=0){d.packages[pi].status="مباعة";d.packages[pi].closedAt=nowISO();if(!d.packages[pi].movements)d.packages[pi].movements=[];d.packages[pi].movements.push({date:cairoDateStr(),type:"sell",custName:cust.name,totalQty:total,by:userName||""})}})}
        }else{
          Object.entries(byOrder).forEach(([oid,qty])=>{updOrder(oid,o=>{if(!o.customerReturns)o.customerReturns=[];
            const retEntry={custId:qrSale.custId,custName:cust.name,qty,note:qrSale.note||"مرتجع سريع",date:cairoDateStr(),createdBy:userName};
            /* V19.66: carry over original sale price for discount-aware return posting.
               Find the most recent matching delivery (same customer; same session if linked)
               and copy its price if it was a discounted/custom-price sale. Without this,
               returns of discounted sales credited AR at list price → permanent debit drift. */
            const dels=(o.customerDeliveries||[]).filter(d=>d.custId===qrSale.custId&&(qrSale.linkedSession?d.sessionId===qrSale.linkedSession:true));
            const lastDiscountedDel=dels.reverse().find(d=>d&&Number(d.price)>0&&d.isDiscounted);
            if(lastDiscountedDel)retEntry.price=Number(lastDiscountedDel.price)||0;
            /* V21.9.192: also propagate the session's discPct. After the
               reverse() above, `dels` is newest-first within the scope
               (same customer + linked session if any). Pick the most
               recent delivery that has a discPct stamped on it (i.e.,
               sales after V21.9.190). For legacy deliveries without
               discPct, falls through to customer.discount in the
               credit-note generator via resolveDiscountPct. */
            const lastSaleWithDisc=dels.find(d=>d&&d.discPct!==undefined&&d.discPct!==null);
            if(lastSaleWithDisc){const n=Number(lastSaleWithDisc.discPct);if(!isNaN(n))retEntry.discPct=n;}
            retEntry._key=oid+":saleReturn:"+(qrSale.linkedSession||gid())+":"+qrSale.custId+":"+retEntry.date;
            o.customerReturns.push(retEntry);
            /* V18.51: invoice mode → create credit note draft instead of direct posting */
            const invoiceMode=(data.invoiceSettings||{}).autoPostFromInvoice===true;
            if(!invoiceMode){
              /* V18.35: auto-post return journal entry */
              autoPost.saleReturn(data, retEntry, cust, o, userName).catch(()=>{});
              /* V18.40: COGS reversal companion entry (Dr finished inventory / Cr COGS) */
              autoPost.saleReturnCogs(data, retEntry, o, userName).catch(()=>{});
            } else {
              /* V18.65: upsert — consolidates same-day same-customer draft CNs */
              upConfig(d=>{
                upsertCreditNoteFromReturn(d, retEntry, o, cust, userName);
              });
            }
          })});
          playBeep("done");showToast("✓ تم تسجيل مرتجع "+total+" قطعة من "+cust.name)
        }closeQrSale()};
      /* Step 1: Pick session first (sale only) */
      if(isSale&&qrSale.linkedSession===undefined){const openSessions=sessions.filter(s=>s.status!=="تم التسليم"&&Object.keys(s.grid||{}).some(k=>Number(s.grid[k])>0));
        return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={closeQrSale}>
          <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:500,maxHeight:"80vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontSize:FS+2,fontWeight:800,color}}>📦 اختر سجل التوزيع</div>
              <Btn ghost small onClick={closeQrSale}>✕</Btn>
            </div>
            {openSessions.length>0&&<div style={{marginBottom:12}}>
              <div style={{fontSize:FS,fontWeight:700,color:T.text,marginBottom:6}}>📋 سجلات التوزيع المفتوحة:</div>
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {openSessions.map(s=>{const totalQ=Object.values(s.grid||{}).reduce((sum,v)=>sum+(Number(v)||0),0);const custCount=s.custIds?.length||0;
                  return<div key={s.id} onClick={()=>setQrSale(p=>({...p,linkedSession:s.id}))} style={{padding:"10px 14px",borderRadius:10,cursor:"pointer",border:"1px solid "+T.accent+"30",background:T.accent+"04"}} onMouseEnter={e=>e.currentTarget.style.background=T.accent+"10"} onMouseLeave={e=>e.currentTarget.style.background=T.accent+"04"}>
                    <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontWeight:700}}>{"📦 "+s.date}</span><span style={{fontWeight:800,color:T.accent}}>{totalQ+" قطعة"}</span></div>
                    <div style={{fontSize:FS-2,color:T.textMut}}>{(s.modelIds?.length||0)+" موديل × "+custCount+" عميل"}</div>
                  </div>})}
              </div>
            </div>}
            <div onClick={()=>setQrSale(p=>({...p,linkedSession:"free"}))} style={{padding:14,borderRadius:12,border:"1px solid "+color+"30",background:color+"06",cursor:"pointer",textAlign:"center",marginTop:8}} onMouseEnter={e=>e.currentTarget.style.background=color+"12"} onMouseLeave={e=>e.currentTarget.style.background=color+"06"}>
              <div style={{fontSize:FS,fontWeight:700,color}}>🔓 بيع حر (بدون ربط)</div>
              <div style={{fontSize:FS-2,color:T.textMut}}>بيع مباشر بدون مقارنة بسجل</div>
            </div>
          </div>
        </div>}
      /* Step 2: Pick customer (filtered to session if linked) */
      if(!qrSale.custId){const sessForCust=qrSale.linkedSession&&qrSale.linkedSession!=="free"?sessions.find(s=>s.id===qrSale.linkedSession):null;
        const custList=sessForCust?sessForCust.custIds.map(id=>customers.find(c=>c.id===id)).filter(Boolean):customers;
        return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={closeQrSale}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:450,maxHeight:"80vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div><div style={{fontSize:FS+2,fontWeight:800,color}}>{title+" — اختر العميل"}</div>{sessForCust&&<div style={{fontSize:FS-2,color:T.textMut}}>{"سجل "+sessForCust.date+" — "+custList.length+" عميل"}</div>}</div>
            <div style={{display:"flex",gap:4}}>{isSale&&<Btn ghost small onClick={()=>setQrSale(p=>({...p,linkedSession:undefined}))}>← سجل</Btn>}<Btn ghost small onClick={closeQrSale}>✕</Btn></div>
          </div>
          <div style={{marginBottom:10}}><Inp value={custFilter} onChange={setCustFilter} placeholder="بحث بالاسم أو التليفون..."/></div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {custList.filter(c=>{if(!custFilter.trim())return true;const q=custFilter.trim().toLowerCase();return(c.name||"").toLowerCase().includes(q)||(c.phone||"").includes(q)}).map(c=>{
              const sessGrid=sessForCust?.grid||{};const custPlanned=sessForCust?sessForCust.modelIds.reduce((s,mid)=>s+(Number(sessGrid[mid+"_"+c.id])||0),0):0;
              const custDelivered=sessForCust?sessForCust.modelIds.reduce((s,mid)=>s+getDeliveredForSess(c.id,sessForCust.id,mid),0):0;
              const custRemaining=custPlanned-custDelivered;
              return<div key={c.id} onClick={()=>{setQrSale(p=>({...p,custId:c.id}));setCustFilter("")}} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",borderRadius:10,cursor:"pointer",border:"1px solid "+(custRemaining<=0&&sessForCust?"#10B98130":T.brd),background:custRemaining<=0&&sessForCust?"#10B98108":"transparent",opacity:custRemaining<=0&&sessForCust?0.5:1}} onMouseEnter={e=>{if(custRemaining>0||!sessForCust)e.currentTarget.style.background=color+"08"}} onMouseLeave={e=>e.currentTarget.style.background=custRemaining<=0&&sessForCust?"#10B98108":"transparent"}>
                <div><span style={{fontWeight:700}}>{c.name}</span>{sessForCust&&<div style={{fontSize:FS-3,color:custRemaining>0?"#F59E0B":"#10B981"}}>{custRemaining>0?"⏳ باقي "+custRemaining+" قطعة":"✅ تم التسليم بالكامل"}</div>}</div>
                <span style={{fontSize:FS-1,color:sessForCust?(custRemaining>0?T.accent:"#10B981"):T.accent}}>{sessForCust?(custDelivered>0?custDelivered+"/"+custPlanned:custPlanned+" قطعة"):"صافي: "+getCustTotal(c.id)}</span>
              </div>})}
          </div>
        </div>
      </div>}
      const custName=customers.find(c=>c.id===qrSale.custId)?.name||"";
      /* V15.40: Emergency override — toggled per-sale, disappears when popup closes */
      const isOverride=qrSale.override===true;
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:isMob?8:16}} onClick={closeQrSale}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:isMob?16:24,width:"100%",maxWidth:isMob?420:600,minHeight:isMob?"75vh":"60vh",maxHeight:"92vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"+(isOverride?",inset 0 0 0 3px #EF4444":"")}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div><div style={{fontSize:FS+2,fontWeight:800,color:isOverride?"#EF4444":color}}>{title}{isOverride&&<span style={{fontSize:FS-1,marginInlineStart:8,padding:"2px 8px",background:"#EF4444",color:"#fff",borderRadius:6}}>🚨 طوارئ</span>}</div><div style={{fontSize:FS-1,color:T.textMut}}>{custName+(linkedSess?" — مربوط بسجل "+linkedSess.date:isSale?" — بيع حر":"")}</div></div>
            <div style={{display:"flex",gap:4}}><Btn ghost small onClick={()=>setQrSale(p=>({...p,linkedSession:undefined,custId:null,items:[]}))}>{isSale?"← سجل":"← عميل"}</Btn><Btn ghost small onClick={closeQrSale}>✕</Btn></div>
          </div>
          {/* V15.40: Emergency Override toggle — only for linked sales */}
          {isSale&&linkedSess&&<div onClick={()=>setQrSale(p=>({...p,override:!p.override}))} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",marginBottom:10,borderRadius:10,cursor:"pointer",background:isOverride?"#EF444410":T.bg+"60",border:"1.5px solid "+(isOverride?"#EF4444":T.brd)}}>
            <div style={{width:22,height:22,borderRadius:"50%",border:"2px solid "+(isOverride?"#EF4444":T.brd),background:isOverride?"#EF4444":"transparent",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:12,fontWeight:800,flexShrink:0}}>{isOverride?"✓":""}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:FS-1,fontWeight:700,color:isOverride?"#EF4444":T.text}}>🚨 وضع الطوارئ — تجاوز الخطة</div>
              <div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>{isOverride?"⚠️ الفحص مغلق — البيع يعتمد على المخزن فقط":"البيع محدود بخطة العميل في الجلسة"}</div>
            </div>
          </div>}
          {/* V15.45: Price override — appears in emergency mode OR free sale (for end-of-season discounted resale) */}
          {isSale&&(isOverride||qrSale.linkedSession==="free")&&(()=>{
            /* Compute "reference" original price from items (weighted avg when mixed) */
            const itemPrices=qrSale.items.map(it=>{const o=orders.find(x=>x.id===it.orderId);return{qty:Number(it.qty)||0,price:Number(o?.sellPrice)||0}}).filter(x=>x.price>0);
            const origTotal=itemPrices.reduce((s,x)=>s+x.qty*x.price,0);
            const origQty=itemPrices.reduce((s,x)=>s+x.qty,0);
            const origAvg=origQty>0?Math.round(origTotal/origQty):0;
            const cp=Number(qrSale.customPrice)||0;
            const pct=origAvg>0&&cp>0?Math.round((cp/origAvg)*100):null;
            const lowWarn=pct!==null&&pct<50;
            return<div style={{padding:"10px 12px",marginBottom:10,borderRadius:10,background:"#F59E0B08",border:"1.5px dashed #F59E0B50"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                <span style={{fontSize:FS-1,fontWeight:700,color:"#B45309"}}>💰 سعر البيع المخفض (اختياري)</span>
                {origAvg>0&&<span style={{fontSize:FS-3,color:T.textMut}}>السعر الأصلي: <b style={{color:T.text}}>{fmt(origAvg)}</b></span>}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                <input type="number" min="0" value={qrSale.customPrice||""} onChange={e=>setQrSale(p=>({...p,customPrice:e.target.value}))} placeholder={origAvg>0?"السعر الأصلي: "+fmt(origAvg):"أدخل السعر لكل قطعة"} style={{flex:1,minWidth:140,padding:"6px 10px",borderRadius:8,border:"1px solid "+T.brd,fontSize:FS,fontFamily:"inherit",background:T.inputBg,color:T.text}}/>
                {cp>0&&<span style={{fontSize:FS-2,color:T.textMut,fontWeight:600}}>ج.م × {total} = <b style={{color:"#B45309"}}>{fmt(cp*total)}</b></span>}
                {cp>0&&<span onClick={()=>setQrSale(p=>({...p,customPrice:""}))} style={{cursor:"pointer",fontSize:FS-2,color:T.err,fontWeight:700}} title="إلغاء السعر المخفض">✕</span>}
              </div>
              {lowWarn&&<div style={{marginTop:6,padding:"4px 8px",borderRadius:6,background:T.err+"12",color:T.err,fontSize:FS-2,fontWeight:700}}>⚠️ السعر ({pct}% من الأصلي) أقل من نصف السعر الأصلي — تأكد إن ده قصدك</div>}
              {cp>0&&!lowWarn&&pct!==null&&<div style={{marginTop:4,fontSize:FS-3,color:T.textMut}}>الخصم: <b style={{color:"#B45309"}}>{100-pct}%</b> من السعر الأصلي</div>}
              {cp===0&&<div style={{marginTop:4,fontSize:FS-3,color:T.textMut}}>فارغ = استخدام السعر الأصلي للموديل</div>}
            </div>
          })()}
          {linkedSess&&(()=>{
            /* V15.39: Group planned models by modelNo — same merging logic as distribution matrix.
               Each row represents ONE model (sum of planned/delivered/cart across all sub-orders). */
            const groups={};
            const orderedKeys=[];
            linkedSess.modelIds.forEach(oid=>{
              const o=orders.find(x=>x.id===oid);if(!o)return;
              const planned=Number((linkedSess.grid||{})[oid+"_"+qrSale.custId])||0;
              if(planned<=0)return;
              const key=o.modelNo||oid;
              if(!groups[key]){
                groups[key]={key,modelNo:o.modelNo||"?",orderIds:[],totalPlanned:0,subOrders:[]};
                orderedKeys.push(key);
              }
              groups[key].orderIds.push(oid);
              groups[key].totalPlanned+=planned;
              groups[key].subOrders.push({oid,createdAt:o.createdAt||o.id||""});
            });
            /* Sort sub-orders FIFO inside each group — matches distributeFIFO ordering */
            Object.values(groups).forEach(g=>g.subOrders.sort((a,b)=>(a.createdAt||"").localeCompare(b.createdAt||"")));
            const allGrouped=orderedKeys.map(k=>groups[k]);
            if(allGrouped.length===0)return null;
            return<div style={{border:"1px solid "+T.brd,borderRadius:10,overflow:"hidden",marginBottom:10}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><th style={{...TH,fontSize:FS-2}}>الموديل</th><th style={{...TH,fontSize:FS-2}}>الخطة</th><th style={{...TH,fontSize:FS-2}}>تسليم</th><th style={{...TH,fontSize:FS-2}}>الحالي</th><th style={{...TH,fontSize:FS-2}}>الباقي</th></tr></thead><tbody>
                {allGrouped.map(grp=>{
                  const prevDel=grp.orderIds.reduce((s,oid)=>s+getDeliveredForSess(qrSale.custId,linkedSess.id,oid),0);
                  const cartQty=grp.orderIds.reduce((s,oid)=>s+(actualByModel[oid]||0),0);
                  const totalDel=prevDel+cartQty;
                  const remaining=grp.totalPlanned-totalDel;
                  const isGrouped=grp.orderIds.length>1;
                  return<tr key={grp.key} style={{background:remaining<=0?"#10B98108":remaining<grp.totalPlanned?"#0EA5E908":"transparent"}}>
                    <td style={{...TD,fontWeight:700,color:T.accent}}>{grp.modelNo}{isGrouped&&<span style={{fontSize:FS-3,color:"#8B5CF6",marginInlineStart:4,fontWeight:700}} title={"مدموج من "+grp.orderIds.length+" تشغيلات (FIFO)"}>⧉{grp.orderIds.length}</span>}</td>
                    <td style={{...TD,textAlign:"center"}}>{grp.totalPlanned}</td>
                    <td style={{...TD,textAlign:"center"}}>{prevDel>0?<span style={{color:"#10B981"}}>{prevDel}</span>:"—"}</td>
                    <td style={{...TD,textAlign:"center",fontWeight:800,color:"#0EA5E9"}}>{cartQty||"—"}</td>
                    <td style={{...TD,textAlign:"center",fontWeight:700,color:remaining<=0?"#10B981":remaining<grp.totalPlanned?"#F59E0B":"#EF4444"}}>{remaining<=0?"✅":"⏳ "+remaining}</td>
                  </tr>;
                })}
              </tbody></table>
            </div>;
          })()}
          {qrScanActive?<div style={{marginBottom:12}}>
            <div style={{position:"relative",width:"100%",maxWidth:300,margin:"0 auto",borderRadius:12,overflow:"hidden",background:"#000"}}>
              <video id="qr-sale-video" playsInline muted autoPlay style={{width:"100%",display:"block"}}/>
              <canvas id="qr-sale-canvas" style={{display:"none"}}/>
              <div style={{position:"absolute",top:"35%",left:"50%",transform:"translate(-50%,-50%)",width:160,height:160,border:"2px solid "+color,borderRadius:12,boxShadow:"0 0 0 999px rgba(0,0,0,0.4)"}}/>
            </div>
            <div style={{textAlign:"center",marginTop:8}}><Btn small onClick={()=>{setQrScanActive(false);try{const v=document.getElementById("qr-sale-video");if(v&&v.srcObject){v.srcObject.getTracks().forEach(t=>t.stop());v.srcObject=null}}catch(e){}}} style={{background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30"}}>⏹ Stop</Btn></div></div>
          :<div style={{textAlign:"center",marginBottom:12}}><Btn onClick={()=>{setQrScanActive(true);setTimeout(()=>{const startCam=async()=>{try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment",width:{ideal:640}}});
            const v=document.getElementById("qr-sale-video");if(!v){stream.getTracks().forEach(t=>t.stop());return}v.srcObject=stream;
            loadJsQR();let lastScan="";let lastTime=0;
            const scan=async()=>{if(!v.srcObject)return;const c=document.getElementById("qr-sale-canvas");if(!c||v.readyState<2){requestAnimationFrame(scan);return}
              c.width=v.videoWidth;c.height=v.videoHeight;c.getContext("2d").drawImage(v,0,0);
              {const _qr=await scanQR(c);if(_qr){const now=Date.now();if(_qr!==lastScan||now-lastTime>2000){lastScan=_qr;lastTime=now;handleScan(_qr)}}}
              if(v.srcObject)requestAnimationFrame(scan)};setTimeout(scan,500)}catch(e){showToast("⚠️ تعذر فتح الكاميرا")}};startCam()},300)}} style={{background:color+"12",color,border:"1px solid "+color+"30",padding:"12px 24px",fontSize:FS+1}}>📷 فتح الماسح</Btn>
            <div style={{fontSize:FS-2,color:T.textMut,marginTop:6}}>أو أضف يدوياً</div></div>}
          <div style={{marginBottom:12,display:"flex",gap:6,alignItems:"end"}}>
            <div style={{flex:1}}><SearchSel value="" onChange={v=>{if(!v)return;
              /* V15.36: Manual add — use the earliest order's id, then FIFO-distribute across same-modelNo orders */
              const pickedO=orders.find(x=>x.id===v);if(!pickedO)return;
              const rs=getRackSize(v);const customQty=Number(qrSale._manualQty)||0;const qty=customQty>0?customQty:rs;
              let sameModel=getSameModelOrders(v);
              /* V15.41 FIX: Restrict to session orders when linked */
              if(isSale&&qrSale.linkedSession&&qrSale.linkedSession!=="free"){
                const _sess=sessions.find(s=>s.id===qrSale.linkedSession);
                if(_sess){
                  /* V19.59 BUGFIX: match by modelNo not order id — see dropdown filter
                     above for the full reasoning (re-cuts produce new order ids). */
                  const sessModelNos=new Set();
                  for(const oid of (_sess.modelIds||[])){
                    const oo=orders.find(x=>x.id===oid);
                    if(oo&&oo.modelNo)sessModelNos.add(oo.modelNo);
                  }
                  const filtered=sameModel.filter(o=>sessModelNos.has(o.modelNo));
                  if(filtered.length===0){playBeep("error");showToast("⛔ "+pickedO.modelNo+": الموديل غير موجود في سجل التوزيع الحالي");return}
                  sameModel=filtered;
                }
              }
              if(sameModel.length>1){
                const pc=checkGroupPriceConsistent(sameModel);
                if(!pc.consistent){playBeep("error");showToast("⛔ "+pickedO.modelNo+": الأسعار مختلفة ("+pc.prices.join("، ")+" ج) — لا يمكن الدمج");return}
              }
              const currentCart={};qrSale.items.forEach(it=>{currentCart[it.orderId]=(currentCart[it.orderId]||0)+(Number(it.qty)||0)});
              const _ls=isSale&&qrSale.linkedSession&&qrSale.linkedSession!=="free"?sessions.find(s=>s.id===qrSale.linkedSession):null;
              const cartWithCtx={...currentCart,__custId:qrSale.custId,__sessId:_ls?_ls.id:null};
              const dist=distributeFIFO(sameModel,qty,isSale?"sale":"return",cartWithCtx,isSale&&_ls?(_ls.grid||{}):null,!isSale?qrSale.custId:null,isSale&&qrSale.override===true);
              if(!dist.ok){playBeep("error");showToast(isSale?dist.error:dist.error.replace(/المتاح/g,"المسلّم للعميل"));return}
              playBeep("ok");
              if(isSale&&qrSale.override===true)showToast("⚠️ "+pickedO.modelNo+" — بيع طوارئ (خارج الخطة)");
              setQrSale(p=>{const newItems=[...p.items];dist.allocations.forEach(a=>{const oo=orders.find(x=>x.id===a.orderId);newItems.push({orderId:a.orderId,modelNo:oo.modelNo,modelDesc:oo.modelDesc,rackSize:qty,qty:a.qty,isOverride:isSale&&qrSale.override===true})});return{...p,items:newItems,_manualQty:0}});
              }} options={(()=>{
                /* V15.36: Group options by modelNo — show each unique model once with total avail across sub-orders (FIFO). value = earliest order id.
                   V17.6 FIX: For RETURN mode, show models the customer has actually bought (delivered minus returned > 0), 
                             NOT models with available stock. The previous logic filtered by stockModels.avail > 0,
                             which excluded models that were entirely sold to the customer (avail=0) — making them
                             impossible to return through this dropdown. The fix uses customer-specific delivered/returned counts. */
                let baseList;
                if (isSale) {
                  /* SALE: filter by available stock (existing logic).
                     V19.59 BUGFIX: when there's a linked session, the previous filter used
                     `linkedSess.modelIds.includes(m.id)` — comparing by ORDER id. But the
                     same modelNo can have different order ids across seasons / re-cuts.
                     Symptom: model appears in the customer's plan table but the dropdown
                     says "لا توجد نتائج" because the latest order id with stock isn't the
                     one stored in the session's modelIds. Fix: build a Set of modelNos from
                     the session's order ids, then match by modelNo on stockModels. */
                  if (linkedSess) {
                    const sessModelNos = new Set();
                    for (const oid of (linkedSess.modelIds || [])) {
                      const o = orders.find(x => x.id === oid);
                      if (o && o.modelNo) sessModelNos.add(o.modelNo);
                    }
                    baseList = stockModels.filter(m => m.avail > 0 && sessModelNos.has(m.modelNo));
                  } else {
                    baseList = stockModels.filter(m => m.avail > 0);
                  }
                } else {
                  /* RETURN: filter by what THIS customer still has (delivered to them minus already returned).
                     Search across ALL orders, not just stockModels — a fully-sold-out model still appears here. */
                  const custId = qrSale.custId;
                  baseList = orders.filter(o => {
                    const cd = (o.customerDeliveries || []).filter(d => d.custId === custId).reduce((s, d) => s + (Number(d.qty) || 0), 0);
                    const ret = (o.customerReturns || []).filter(r => r.custId === custId).reduce((s, r) => s + (Number(r.qty) || 0), 0);
                    return (cd - ret) > 0;
                  }).map(o => ({
                    /* shape compatible with stockModels for the grouping below */
                    id: o.id,
                    modelNo: o.modelNo,
                    modelDesc: o.modelDesc,
                    /* For return: "avail" = what's still with this customer */
                    avail: (o.customerDeliveries || []).filter(d => d.custId === custId).reduce((s, d) => s + (Number(d.qty) || 0), 0)
                         - (o.customerReturns || []).filter(r => r.custId === custId).reduce((s, r) => s + (Number(r.qty) || 0), 0),
                  }));
                }
                const grouped={};
                baseList.forEach(m=>{const o=orders.find(x=>x.id===m.id);if(!o)return;const key=o.modelNo||m.id;
                  if(!grouped[key])grouped[key]={modelNo:o.modelNo,modelDesc:m.modelDesc,items:[]};
                  grouped[key].items.push({orderId:m.id,avail:m.avail,createdAt:o.createdAt||o.id||""});
                });
                return Object.values(grouped).map(g=>{
                  g.items.sort((a,b)=>((a.createdAt+"").localeCompare(b.createdAt+"")));
                  const totalAvail=g.items.reduce((s,x)=>s+x.avail,0);
                  const earliest=g.items[0].orderId;
                  return{value:earliest,label:g.modelNo+" — "+g.modelDesc+" ("+totalAvail+")"+(g.items.length>1?" ⧉"+g.items.length:"")};
                });
              })()} placeholder={isSale?(linkedSess?"موديلات التوزيعة...":"اختر موديل..."):"موديلات اشتراها العميل..."}/></div>
            <div style={{width:70}}><Inp type="number" value={qrSale._manualQty||""} onChange={v=>setQrSale(p=>({...p,_manualQty:Number(v)||0}))} placeholder="كمية"/></div>
            {/* V17.6 FIX: Hide "كسر" button in return mode — broken sale doesn't apply to returns */}
            {isSale&&<Btn small onClick={async()=>{const result=await askForm("بيع كسر",[{key:"modelNo",label:"رقم الموديل",required:true,validate:v=>{const o=orders.find(x=>x.modelNo===v||x.id===v);return o?null:"موديل غير موجود"}},{key:"qty",label:"الكمية",type:"number",required:true,defaultValue:"1",validate:v=>{const n=Number(v);return n>0?null:"الكمية يجب أن تكون أكبر من صفر"}}]);if(!result)return;const o=orders.find(x=>x.modelNo===result.modelNo||x.id===result.modelNo);const q=Number(result.qty)||0;
              setQrSale(p=>({...p,items:[...p.items,{orderId:o.id,modelNo:o.modelNo,modelDesc:o.modelDesc||"",rackSize:q,qty:q,isBroken:true}]}));playBeep("ok");showToast("✅ كسر "+o.modelNo+" × "+q)}} style={{background:"#F59E0B12",color:"#F59E0B",border:"1px solid #F59E0B30",whiteSpace:"nowrap",fontSize:FS-2}}>🧩 كسر</Btn>}
          </div>
          {qrSale.items.length>0&&<div style={{border:"1px solid "+T.brd,borderRadius:12,overflow:"hidden",marginBottom:10}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><th style={{...TH,fontSize:FS-2}}>الموديل</th><th style={{...TH,fontSize:FS-2}}>السيري</th><th style={{...TH,fontSize:FS-2}}>الكمية</th><th style={{...TH,width:30}}></th></tr></thead><tbody>
              {/* V15.36: Render grouped by modelNo+rackSize to merge FIFO allocations */}
              {groupedCartItems.map((grp,i)=><tr key={grp.key} style={{background:i%2===0?"transparent":T.bg+"80"}}>
                <td style={{...TD,fontWeight:700,color:T.accent}}>{grp.modelNo}{grp.items.length>1&&<span style={{fontSize:FS-3,color:"#8B5CF6",marginInlineStart:6,fontWeight:700}} title={"موزع FIFO على "+grp.items.length+" تشغيل بنفس الموديل"}>⧉{grp.items.length}</span>}{grp.isBroken&&<span style={{fontSize:FS-3,color:"#F59E0B",marginInlineStart:6,fontWeight:700}} title="كسر">🧩</span>}{grp.isOverride&&<span style={{fontSize:FS-3,color:"#EF4444",marginInlineStart:6,fontWeight:700}} title="بيع طوارئ — خارج الخطة">🚨</span>}</td>
                <td style={{...TD,textAlign:"center"}}>{grp.rackSize}</td>
                <td style={{...TD,textAlign:"center"}}><input type="number" value={grp.totalQty} onChange={e=>updateGroupQty(grp,e.target.value)} style={{width:60,textAlign:"center",border:"1px solid "+T.brd,borderRadius:4,padding:"2px",fontSize:FS,fontWeight:700,fontFamily:"inherit",background:T.cardSolid,color:T.text}}/></td>
                <td style={{...TD,textAlign:"center"}}><span onClick={()=>removeGroup(grp)} style={{cursor:"pointer",color:T.err,fontSize:14}}>🗑️</span></td>
              </tr>)}
              <tr style={{background:color+"10"}}><td style={{...TD,fontWeight:800}}>الاجمالي</td><td style={TD}></td><td style={{...TD,textAlign:"center",fontWeight:800,fontSize:FS+2,color}}>{total}</td><td style={TD}></td></tr>
            </tbody></table>
          </div>}
          {!isSale&&<div style={{marginBottom:10}}><Inp value={qrSale.note||""} onChange={v=>setQrSale(p=>({...p,note:v}))} placeholder="سبب المرتجع..."/></div>}
          {qrSale.items.length>0&&(()=>{const grouped={};qrSale.items.forEach(it=>{if(!grouped[it.modelNo])grouped[it.modelNo]={modelNo:it.modelNo,scans:0,totalQty:0};grouped[it.modelNo].scans++;grouped[it.modelNo].totalQty+=(Number(it.qty)||0)});const gArr=Object.values(grouped);
            return<div style={{padding:10,borderRadius:10,background:color+"06",border:"1px solid "+color+"20",marginBottom:10}}>
              <div style={{fontSize:FS-1,fontWeight:700,color,marginBottom:6}}>📊 ملخص:</div>
              {gArr.map(g=><div key={g.modelNo} style={{display:"flex",justifyContent:"space-between",padding:"3px 8px",fontSize:FS-1}}>
                <span style={{fontWeight:700,color:T.accent}}>{g.modelNo}</span><span style={{color:T.textSec}}>{g.scans+" سيري"}</span><span style={{fontWeight:800,color}}>{g.totalQty+" ق"}</span></div>)}
              <div style={{borderTop:"1px solid "+color+"20",marginTop:4,paddingTop:4,display:"flex",justifyContent:"space-between",fontSize:FS,fontWeight:800}}>
                <span>{gArr.reduce((s,g)=>s+g.scans,0)+" سيري"}</span><span style={{color}}>{total+" قطعة"}</span></div>
            </div>})()}
          <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
            <Btn ghost onClick={closeQrSale}>الغاء</Btn>
            {isSale&&total>0&&<Btn onClick={()=>{const cust=customers.find(c=>c.id===qrSale.custId);if(!cust)return;
              const byOid={};qrSale.items.forEach(it=>{byOid[it.orderId]=(byOid[it.orderId]||0)+(Number(it.qty)||0)});
              const rows=[];let grandTotal=0;let missingPrice=false;
              Object.entries(byOid).forEach(([oid,qty])=>{const o=orders.find(x=>x.id===oid);const price=Number(o?.sellPrice)||0;
                if(!price){showToast("⚠️ ادخل سعر البيع لموديل "+(o?.modelNo||""));missingPrice=true;return}
                const lineTotal=qty*price;grandTotal+=lineTotal;rows.push({no:o?.modelNo,desc:o?.modelDesc||"",qty,price,total:lineTotal})});
              if(missingPrice)return;
              const disc=Math.round(grandTotal*0.1);const net=grandTotal-disc;
              let h="<h2 style='text-align:center'>CLARK — عرض سعر</h2>";
              h+="<table style='margin:0 auto 12px'><tr><td style='padding:4px 12px;font-weight:700'>العميل</td><td style='padding:4px 12px;font-weight:800'>"+cust.name+"</td><td style='padding:4px 12px;font-weight:700'>التاريخ</td><td style='padding:4px 12px'>"+cairoDateStr()+"</td></tr></table>";
              h+="<table><thead><tr><th>الموديل</th><th>الوصف</th><th>الكمية</th><th>سعر القطعة</th><th>الاجمالي</th></tr></thead><tbody>";
              rows.forEach(r=>{h+="<tr><td style='font-weight:800'>"+r.no+"</td><td>"+r.desc+"</td><td style='text-align:center;font-weight:700'>"+r.qty+"</td><td style='text-align:center'>"+fmt(r.price)+"</td><td style='text-align:center;font-weight:800'>"+fmt(r.total)+"</td></tr>"});
              h+="</tbody></table>";
              h+="<div style='margin-top:16px;padding:12px;border:2px solid #000;border-radius:8px'>";
              h+="<div style='display:flex;justify-content:space-between;margin-bottom:6px'><span style='font-weight:700'>الاجمالي قبل الخصم</span><span style='font-weight:800;font-size:14px'>"+fmt(grandTotal)+" ج.م</span></div>";
              h+="<div style='display:flex;justify-content:space-between;margin-bottom:6px;color:#EF4444'><span style='font-weight:700'>خصم 10%</span><span style='font-weight:800'>- "+fmt(disc)+" ج.م</span></div>";
              h+="<div style='display:flex;justify-content:space-between;padding-top:8px;border-top:2px solid #000'><span style='font-weight:800;font-size:16px'>المستحق</span><span style='font-weight:900;font-size:18px;color:#059669'>"+fmt(net)+" ج.م</span></div>";
              h+="</div>";
              h+="<div class='sig'><div class='sig-box'>مسؤول المبيعات</div><div class='sig-box'>العميل: "+cust.name+"</div></div>";
              printPage("عرض سعر — "+cust.name,h,{factoryName:config.factoryName,logo:config.logo})}} style={{background:"#8B5CF612",color:"#8B5CF6",border:"1px solid #8B5CF630"}}>{"🧾 عرض سعر"}</Btn>}
            <Btn onClick={confirmSale} disabled={total<=0} style={{background:isOverride?"#EF4444":color,color:"#fff",border:"none",fontWeight:700}}>{(isOverride?"🚨 تأكيد بيع طوارئ":(isSale?"📦 تأكيد البيع":"↩️ تأكيد المرتجع"))+" ("+total+")"}</Btn>
          </div>
        </div>
      </div>})()}
    {/* Package System */}
    {pkgPopup==="list"&&(()=>{const packages=config.packages||[];const filtered=packages.filter(p=>{if(!pkgSearch.trim())return true;const q=pkgSearch.trim().toLowerCase();return(p.number||"").toLowerCase().includes(q)||(p.note||"").toLowerCase().includes(q)||p.items?.some(it=>(it.modelNo||"").includes(q))});
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:isMob?8:16}} onClick={()=>setPkgPopup(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:isMob?16:24,width:"100%",maxWidth:isMob?"100%":700,maxHeight:"90vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:FS+2,fontWeight:800,color:"#0EA5E9"}}>{"📦 الكراتين ("+packages.length+")"}</div>
            <div style={{display:"flex",gap:4}}>
              {packages.length>0&&<Btn small onClick={()=>{let h="<h2 style='text-align:center'>📦 تقرير سجل الكراتين</h2><div style='text-align:center;color:#666;margin-bottom:16px'>"+packages.length+" كرتونة | "+packages.reduce((s,p)=>s+(p.items||[]).reduce((ss,it)=>ss+(Number(it.qty)||0),0),0)+" قطعة اجمالي</div>";
                packages.sort((a,b)=>(b.date||"").localeCompare(a.date||"")).forEach((p,pi)=>{const tq=(p.items||[]).reduce((s,it)=>s+(Number(it.qty)||0),0);
                  h+="<h3 style='margin-top:16px;color:#0EA5E9'>📦 "+p.number+" — "+p.date+"</h3>";
                  if(p.note)h+="<div style='color:#666;margin-bottom:6px'>"+p.note+"</div>";
                  h+="<table><thead><tr><th>الموديل</th><th>السيري</th><th>سيريهات</th><th>الكمية</th></tr></thead><tbody>";
                  (p.items||[]).forEach((it,i)=>{h+="<tr style='background:"+(i%2===0?"transparent":"#f8f8f8")+"'><td style='font-weight:700'>"+it.modelNo+"</td><td style='text-align:center'>"+it.rackSize+"</td><td style='text-align:center'>"+it.count+"</td><td style='text-align:center;font-weight:800;color:#0EA5E9'>"+it.qty+"</td></tr>"});
                  h+="<tr style='background:#EFF6FF;font-weight:800'><td colspan='2'>اجمالي</td><td style='text-align:center'>"+(p.items||[]).reduce((s,it)=>s+(it.count||0),0)+"</td><td style='text-align:center;color:#0EA5E9'>"+tq+"</td></tr></tbody></table>"});
                printPage("سجل الكراتين",h)}} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة التقرير">🖨</Btn>}
              {canEdit&&<Btn small primary onClick={()=>{setPkgPopup("create");setPkgItems([]);setPkgNote("")}}>+ كرتونة</Btn>}<Btn ghost small onClick={()=>setPkgPopup(null)}>✕</Btn></div>
          </div>
          <div style={{marginBottom:10}}><Inp value={pkgSearch} onChange={setPkgSearch} placeholder="بحث برقم الكرتونة أو الموديل..."/></div>
          {filtered.length>0?<div style={{display:"flex",flexDirection:"column",gap:6}}>
            {filtered.sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(p=>{const totalQ=p.items?.reduce((s,it)=>s+(Number(it.qty)||0),0)||0;const isClosed=p.status==="مغلقة"||p.status==="مباعة";const isSold=p.status==="مباعة";
              return<div key={p.id} onClick={()=>setPkgPopup("view_"+p.id)} style={{padding:"12px 16px",borderRadius:12,border:"1px solid "+(isClosed?(isSold?"#8B5CF630":"#EF444430"):T.brd),cursor:"pointer",transition:"background 0.15s",background:isClosed?(isSold?"#8B5CF606":"#EF444406"):"transparent",opacity:isClosed?0.7:1}} onMouseEnter={e=>e.currentTarget.style.background=isClosed?(isSold?"#8B5CF610":"#EF444410"):T.accent+"06"} onMouseLeave={e=>e.currentTarget.style.background=isClosed?(isSold?"#8B5CF606":"#EF444406"):"transparent"}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div><span style={{fontWeight:800,color:isSold?"#8B5CF6":isClosed?"#EF4444":"#0EA5E9",textDecoration:isClosed?"line-through":"none"}}>{"📦 "+p.number}</span><span style={{fontSize:FS-2,color:T.textMut,marginRight:8}}>{" — "+p.date}</span>{isSold&&<span style={{fontSize:FS-3,color:"#8B5CF6",fontWeight:700}}>💰 مباعة</span>}{isClosed&&!isSold&&<span style={{fontSize:FS-3,color:"#EF4444",fontWeight:700}}>🔒 مغلقة</span>}</div>
                  <span style={{fontWeight:700,color:isClosed?(isSold?"#8B5CF6":"#EF4444"):T.accent}}>{totalQ+" قطعة"}</span>
                </div>
                <div style={{fontSize:FS-2,color:T.textMut}}>{p.items?.map(it=>it.modelNo+"("+it.qty+")").join(" | ")||"فارغة"}</div>
              </div>})}
          </div>:<div style={{textAlign:"center",padding:20,color:T.textMut}}>{pkgSearch?"لا توجد نتائج":"لا توجد كراتين — أنشئ كرتونة جديدة"}</div>}
        </div>
      </div>})()}
    {pkgPopup==="create"&&(()=>{const existingNums=(config.packages||[]).map(p=>{const m=p.number?.match(/\d+/);return m?Number(m[0]):0});const nextNum=Math.max(0,...existingNums)+1;const pkgNum="CTN-"+String(nextNum).padStart(3,"0");
      const totalQ=pkgItems.reduce((s,it)=>s+(Number(it.qty)||0),0);
      const addModel=(orderId)=>{const o=orders.find(x=>x.id===orderId);if(!o)return;const rs=getRackSize(orderId);
        setPkgItems(p=>{const existing=p.findIndex(it=>it.orderId===orderId);if(existing>=0){const items=[...p];items[existing]={...items[existing],count:items[existing].count+1,qty:(items[existing].count+1)*items[existing].rackSize};return items}return[...p,{orderId,modelNo:o.modelNo,modelDesc:o.modelDesc,rackSize:rs,count:1,qty:rs}]})};
      const updateItem=(idx,f,v)=>setPkgItems(p=>{const items=[...p];items[idx]={...items[idx],[f]:Number(v)||0};if(f==="count")items[idx].qty=items[idx].count*items[idx].rackSize;return items});
      const stopPkgCam=()=>{setPkgScan(false);try{const v=document.getElementById("pkg-scan-video");if(v&&v.srcObject){v.srcObject.getTracks().forEach(t=>t.stop());v.srcObject=null}}catch(e){}};
      const closePkgCreate=()=>{stopPkgCam();setPkgPopup("list")};
      const savePkg=()=>{if(pkgItems.length===0){showToast("⚠️ أضف موديل واحد على الأقل");return}
        const pkg={id:gid(),number:pkgNum,date:cairoDateStr(),note:pkgNote,items:pkgItems.map(it=>({orderId:it.orderId,modelNo:it.modelNo,rackSize:it.rackSize,count:it.count,qty:it.qty})),createdBy:userName,status:"مخزن"};
        upSales(d=>{if(!d.packages)d.packages=[];d.packages.push(pkg)});
        /* Print QR */
        const qrData=JSON.stringify({app:"clark",type:"pkg",id:pkg.id,num:pkgNum});
        printPkgLabel(pkgNum,pkg.date,pkgNote,pkgItems.map(it=>({...it,desc:orders.find(o=>o.id===it.orderId)?.modelDesc||""})),[],pkg.status,userName,qrData,data?.printSettings,CLARK_LOGO_PRINT);
        playBeep("done");showToast("✓ تم حفظ كرتونة "+pkgNum);closePkgCreate()};
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:isMob?8:16}} onClick={()=>setPkgPopup("list")}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:isMob?16:24,width:"100%",maxWidth:isMob?420:550,maxHeight:"90vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div><div style={{fontSize:FS+2,fontWeight:800,color:"#0EA5E9"}}>📦 كرتونة جديدة</div><div style={{fontSize:FS-1,color:T.textMut}}>{"رقم: "+pkgNum}</div></div>
            <Btn ghost small onClick={closePkgCreate}>← رجوع</Btn>
          </div>
          <div style={{marginBottom:10}}><label style={{fontSize:FS-2,color:T.textSec}}>ملاحظات</label><Inp value={pkgNote} onChange={setPkgNote} placeholder="مثال: كرتونة سيلا — شحنة 1"/></div>
          <div style={{marginBottom:10}}><label style={{fontSize:FS-2,color:T.textSec}}>اضف موديل</label>
            <div style={{display:"flex",gap:6,marginBottom:6}}>
              <div style={{flex:1}}><SearchSel value="" onChange={v=>{if(v)addModel(v)}} options={stockModels.filter(m=>m.avail>0).map(m=>({value:m.id,label:m.modelNo+" — "+m.modelDesc+" ("+m.avail+")"}))} placeholder="اختر موديل..."/></div>
              <Btn small onClick={()=>{if(pkgScan){try{const v=document.getElementById("pkg-scan-video");if(v&&v.srcObject){v.srcObject.getTracks().forEach(t=>t.stop());v.srcObject=null}}catch(e){}}setPkgScan(!pkgScan)}} style={{background:pkgScan?"#EF444412":"#0EA5E912",color:pkgScan?"#EF4444":"#0EA5E9",border:"1px solid "+(pkgScan?"#EF444430":"#0EA5E930"),whiteSpace:"nowrap"}}>{pkgScan?"⏹":"📷"}</Btn>
            </div>
            {pkgScan&&<div style={{marginBottom:8}}>
              <div style={{position:"relative",width:"100%",maxWidth:260,margin:"0 auto",borderRadius:12,overflow:"hidden",background:"#000"}}>
                <video id="pkg-scan-video" playsInline muted autoPlay style={{width:"100%",display:"block"}} ref={el=>{if(!el||el.srcObject)return;(async()=>{try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment",width:{ideal:640}}});el.srcObject=stream;
                  const hasBD=typeof BarcodeDetector!=="undefined";const detector=hasBD?new BarcodeDetector({formats:["qr_code"]}):null;const canvas=document.createElement("canvas");let lastScan="";let lastTime=0;
                  const scan=async()=>{if(!el.srcObject)return;if(el.readyState<2){requestAnimationFrame(scan);return}canvas.width=el.videoWidth;canvas.height=el.videoHeight;canvas.getContext("2d").drawImage(el,0,0);
                    {const _qr=await scanQR(canvas);if(_qr){const now=Date.now();if(_qr!==lastScan||now-lastTime>2000){lastScan=_qr;lastTime=now;try{const parts=_qr.split(":");if(parts[0]==="CLARK"&&parts[1]){addModel(parts[1]);playBeep("ok")}}catch(e){}}}}
                    if(el.srcObject)requestAnimationFrame(scan)};setTimeout(scan,500)}catch(e){showToast("⚠️ تعذر فتح الكاميرا");setPkgScan(false)}})()}}/>
                <div style={{position:"absolute",top:"35%",left:"50%",transform:"translate(-50%,-50%)",width:120,height:120,border:"2px solid #0EA5E9",borderRadius:10,boxShadow:"0 0 0 999px rgba(0,0,0,0.4)"}}/>
              </div>

            </div>}
          </div>
          {pkgItems.length>0&&<div style={{border:"1px solid "+T.brd,borderRadius:12,overflow:"hidden",marginBottom:12}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["الموديل","السيري","عدد سيريهات","الكمية",""].map(h=><th key={h} style={{...TH,fontSize:FS-2}}>{h}</th>)}</tr></thead><tbody>
              {pkgItems.map((it,i)=><tr key={i} style={{background:i%2===0?"transparent":T.bg+"80"}}><td style={{...TD,fontWeight:700,color:T.accent}}>{it.modelNo}</td><td style={{...TD,textAlign:"center"}}>{it.rackSize}</td>
                <td style={{...TD,textAlign:"center"}}><input type="number" min="1" value={it.count} onChange={e=>updateItem(i,"count",e.target.value)} style={{width:50,textAlign:"center",border:"1px solid "+T.brd,borderRadius:4,padding:"2px",fontSize:FS,fontWeight:700,fontFamily:"inherit"}}/></td>
                <td style={{...TD,textAlign:"center",fontWeight:800,color:"#0EA5E9"}}>{it.qty}</td>
                <td style={{...TD,textAlign:"center"}}><span onClick={()=>setPkgItems(p=>p.filter((_,j)=>j!==i))} style={{cursor:"pointer",color:T.err}}>🗑️</span></td></tr>)}
              <tr style={{background:"#0EA5E908"}}><td colSpan={3} style={{...TD,fontWeight:800}}>الاجمالي</td><td style={{...TD,textAlign:"center",fontWeight:800,fontSize:FS+2,color:"#0EA5E9"}}>{totalQ}</td><td style={TD}></td></tr>
            </tbody></table>
          </div>}
          <div style={{display:"flex",gap:8,justifyContent:"center"}}><Btn ghost onClick={closePkgCreate}>الغاء</Btn><Btn onClick={savePkg} disabled={pkgItems.length===0} style={{background:"#0EA5E9",color:"#fff",border:"none",fontWeight:700}}>{"📦 حفظ + طباعة QR ("+totalQ+" قطعة)"}</Btn></div>
        </div>
      </div>})()}
    {pkgPopup&&pkgPopup.startsWith("view_")&&(()=>{const pkgId=pkgPopup.replace("view_","");const pkg=(config.packages||[]).find(p=>p.id===pkgId);if(!pkg)return null;
      const totalQ=pkg.items?.reduce((s,it)=>s+(Number(it.qty)||0),0)||0;const totalSeries=pkg.items?.reduce((s,it)=>s+(Number(it.count)||0),0)||0;
      const addToPkg=(orderId)=>{const o=orders.find(x=>x.id===orderId);if(!o)return;const rs=getRackSize(orderId);
        upSales(d=>{const pi=d.packages.findIndex(p=>p.id===pkgId);if(pi<0)return;
          const existing=d.packages[pi].items.findIndex(it=>it.orderId===orderId);
          if(existing>=0){d.packages[pi].items[existing].count++;d.packages[pi].items[existing].qty=d.packages[pi].items[existing].count*d.packages[pi].items[existing].rackSize}
          else{d.packages[pi].items.push({orderId,modelNo:o.modelNo,rackSize:rs,count:1,qty:rs})}
          if(!d.packages[pi].movements)d.packages[pi].movements=[];
          d.packages[pi].movements.push({date:cairoDateStr(),type:"add",modelNo:o.modelNo,count:1,qty:rs,by:userName||""});
          d.packages[pi].status="مخزن"});playBeep("ok")};
      const updatePkgItem=(idx,newCount)=>{upSales(d=>{const pi=d.packages.findIndex(p=>p.id===pkgId);if(pi<0)return;const it=d.packages[pi].items[idx];if(!it)return;
        const oldCount=it.count;const diff=newCount-oldCount;it.count=Math.max(0,newCount);it.qty=it.count*it.rackSize;
        if(!d.packages[pi].movements)d.packages[pi].movements=[];
        if(diff!==0)d.packages[pi].movements.push({date:cairoDateStr(),type:diff>0?"add":"remove",modelNo:it.modelNo,count:Math.abs(diff),qty:Math.abs(diff)*it.rackSize,by:userName||""});
        if(it.count<=0){d.packages[pi].items.splice(idx,1)}
        const totalRemain=d.packages[pi].items.reduce((s,x)=>s+(x.qty||0),0);
        if(totalRemain<=0){d.packages[pi].status="مغلقة";d.packages[pi].closedAt=nowISO()}})};
      const removePkgItem=(idx)=>{upSales(d=>{const pi=d.packages.findIndex(p=>p.id===pkgId);if(pi<0)return;const it=d.packages[pi].items[idx];
        if(!d.packages[pi].movements)d.packages[pi].movements=[];
        if(it)d.packages[pi].movements.push({date:cairoDateStr(),type:"remove",modelNo:it.modelNo,count:it.count,qty:it.qty,by:userName||""});
        d.packages[pi].items.splice(idx,1);
        const totalRemain=d.packages[pi].items.reduce((s,x)=>s+(x.qty||0),0);
        if(totalRemain<=0){d.packages[pi].status="مغلقة";d.packages[pi].closedAt=nowISO()}});showToast("✓ تم الحذف")};
      const reprintQR=()=>{const qrData=JSON.stringify({app:"clark",type:"pkg",id:pkg.id,num:pkg.number});
        printPkgLabel(pkg.number,pkg.date,pkg.note||"",(pkg.items||[]).map(it=>({...it,desc:orders.find(o=>o.id===it.orderId)?.modelDesc||""})),pkg.movements||[],pkg.status||"مخزن",pkg.createdBy||"",qrData,data?.printSettings,CLARK_LOGO_PRINT)};
      const printContents=()=>{const qrData=JSON.stringify({app:"clark",type:"pkg",id:pkg.id,num:pkg.number});
        printPkgLabel(pkg.number,pkg.date,pkg.note||"",(pkg.items||[]).map(it=>({...it,desc:orders.find(o=>o.id===it.orderId)?.modelDesc||""})),pkg.movements||[],pkg.status||"مخزن",pkg.createdBy||"",qrData,data?.printSettings,CLARK_LOGO_PRINT)};
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:isMob?8:16}} onClick={()=>setPkgPopup("list")}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:isMob?16:24,width:"100%",maxWidth:isMob?"100%":600,maxHeight:"90vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div><div style={{fontSize:FS+2,fontWeight:800,color:"#0EA5E9"}}>{"📦 "+pkg.number}</div><div style={{fontSize:FS-2,color:T.textMut}}>{pkg.date+(pkg.note?" — "+pkg.note:"")+(pkg.createdBy?" | "+pkg.createdBy:"")}</div></div>
            <div style={{display:"flex",gap:4}}>
              <Btn small onClick={reprintQR} style={{background:"#0EA5E912",color:"#0EA5E9",border:"1px solid #0EA5E930"}}>QR</Btn>
              <Btn small onClick={printContents} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>🖨</Btn>
              {canEdit&&<DelBtn onConfirm={async()=>{
                /* V15.9: Warn if package has items or movements */
                const itemCount=(pkg.items||[]).length;
                const movCount=(pkg.movements||[]).length;
                if(itemCount>0||movCount>0){
                  const ok=await ask("⚠️ حذف كرتونة غير فارغة",
                    "الكرتونة فيها "+itemCount+" موديل"+(movCount>0?" و "+movCount+" حركة":"")+".\n\nهل تريد المتابعة؟",
                    {type:"danger",confirmText:"حذف"});
                  if(!ok)return;
                }
                upSales(d=>{d.packages=(d.packages||[]).filter(p=>p.id!==pkgId)});
                setPkgPopup("list");showToast("✓ تم الحذف");
              }}/>}
              <Btn ghost small onClick={()=>setPkgPopup("list")}>← رجوع</Btn>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:10}}>
            <div style={{padding:8,borderRadius:10,background:T.accent+"08",textAlign:"center"}}><div style={{fontSize:FS-3,color:T.textSec}}>التاريخ</div><div style={{fontSize:FS-1,fontWeight:700}}>{pkg.date}</div></div>
            <div style={{padding:8,borderRadius:10,background:"#0EA5E908",textAlign:"center"}}><div style={{fontSize:FS-3,color:T.textSec}}>موديلات</div><div style={{fontSize:FS+1,fontWeight:800,color:"#0EA5E9"}}>{pkg.items?.length||0}</div></div>
            <div style={{padding:8,borderRadius:10,background:"#8B5CF608",textAlign:"center"}}><div style={{fontSize:FS-3,color:T.textSec}}>سيريهات</div><div style={{fontSize:FS+1,fontWeight:800,color:"#8B5CF6"}}>{totalSeries}</div></div>
            <div style={{padding:8,borderRadius:10,background:T.ok+"08",textAlign:"center"}}><div style={{fontSize:FS-3,color:T.textSec}}>قطع</div><div style={{fontSize:FS+1,fontWeight:800,color:T.ok}}>{totalQ}</div></div>
          </div>
          {/* Edit: add model */}
          {canEdit&&<div style={{marginBottom:10,padding:10,borderRadius:10,border:"1px dashed "+T.accent+"40",background:T.accent+"04"}}>
            <div style={{fontSize:FS-1,fontWeight:700,color:T.accent,marginBottom:6}}>➕ اضف موديل</div>
            <div style={{display:"flex",gap:6}}>
              <div style={{flex:1}}><SearchSel value="" onChange={v=>{if(v)addToPkg(v)}} options={stockModels.filter(m=>m.avail>0).map(m=>({value:m.id,label:m.modelNo+" — "+m.modelDesc}))} placeholder="اختر موديل..."/></div>
              <Btn small onClick={()=>{if(pkgScan){try{const v=document.getElementById("pkg-scan-video");if(v&&v.srcObject){v.srcObject.getTracks().forEach(t=>t.stop());v.srcObject=null}}catch(e){}}setPkgScan(!pkgScan)}} style={{background:pkgScan?"#EF444412":"#0EA5E912",color:pkgScan?"#EF4444":"#0EA5E9",border:"1px solid "+(pkgScan?"#EF444430":"#0EA5E930")}}>{pkgScan?"⏹":"📷"}</Btn>
            </div>
            {pkgScan&&<div style={{marginTop:8}}>
              <div style={{position:"relative",width:"100%",maxWidth:240,margin:"0 auto",borderRadius:12,overflow:"hidden",background:"#000"}}>
                <video id="pkg-scan-video" playsInline muted autoPlay style={{width:"100%",display:"block"}} ref={el=>{if(!el||el.srcObject)return;(async()=>{try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment",width:{ideal:640}}});el.srcObject=stream;
                  const hasBD=typeof BarcodeDetector!=="undefined";const detector=hasBD?new BarcodeDetector({formats:["qr_code"]}):null;const canvas=document.createElement("canvas");let lastScan="";let lastTime=0;
                  const scan=async()=>{if(!el.srcObject)return;if(el.readyState<2){requestAnimationFrame(scan);return}canvas.width=el.videoWidth;canvas.height=el.videoHeight;canvas.getContext("2d").drawImage(el,0,0);
                    {const _qr=await scanQR(canvas);if(_qr){const now=Date.now();if(_qr!==lastScan||now-lastTime>2000){lastScan=_qr;lastTime=now;try{const parts=_qr.split(":");if(parts[0]==="CLARK"&&parts[1]){addToPkg(parts[1])}}catch(e){}}}}
                    if(el.srcObject)requestAnimationFrame(scan)};setTimeout(scan,500)}catch(e){showToast("⚠️ تعذر فتح الكاميرا");setPkgScan(false)}})()}}/>
                <div style={{position:"absolute",top:"35%",left:"50%",transform:"translate(-50%,-50%)",width:110,height:110,border:"2px solid #0EA5E9",borderRadius:10,boxShadow:"0 0 0 999px rgba(0,0,0,0.4)"}}/>
              </div>

            </div>}
          </div>}
          {/* Contents table with edit */}
          <div style={{border:"1px solid "+T.brd,borderRadius:12,overflow:"hidden"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["الموديل","الوصف","السيري","سيريهات","الكمية",...(canEdit?[""]:[])] .map(h=><th key={h} style={{...TH,fontSize:FS-2}}>{h}</th>)}</tr></thead><tbody>
              {(pkg.items||[]).map((it,i)=>{const o=orders.find(x=>x.id===it.orderId);return<tr key={i} style={{background:i%2===0?"transparent":T.bg+"80"}}><td style={{...TD,fontWeight:700,color:T.accent}}>{it.modelNo}</td><td style={{...TD,fontSize:FS-2}}>{o?.modelDesc||"—"}</td><td style={{...TD,textAlign:"center"}}>{it.rackSize}</td>
                <td style={{...TD,textAlign:"center"}}>{canEdit?<input type="number" min="1" value={it.count} onChange={e=>updatePkgItem(i,Number(e.target.value)||1)} style={{width:45,textAlign:"center",border:"1px solid "+T.brd,borderRadius:4,padding:"2px",fontSize:FS,fontWeight:700,fontFamily:"inherit"}}/>:it.count}</td>
                <td style={{...TD,textAlign:"center",fontWeight:800,color:"#0EA5E9"}}>{it.qty}</td>
                {canEdit&&<td style={{...TD,textAlign:"center"}}><span onClick={()=>removePkgItem(i)} style={{cursor:"pointer",color:T.err,fontSize:12}}>🗑️</span></td>}</tr>})}
              <tr style={{background:"#0EA5E908"}}><td colSpan={3} style={{...TD,fontWeight:800}}>الاجمالي</td><td style={{...TD,textAlign:"center",fontWeight:800}}>{totalSeries}</td><td style={{...TD,textAlign:"center",fontWeight:800,fontSize:FS+2,color:"#0EA5E9"}}>{totalQ}</td>{canEdit&&<td style={TD}></td>}</tr>
            </tbody></table>
          </div>
          {/* Movement timeline */}
          {(pkg.movements||[]).length>0&&<div style={{marginTop:12}}>
            <div style={{fontSize:FS,fontWeight:700,color:T.text,marginBottom:6}}>📋 سجل الحركات:</div>
            <div style={{maxHeight:150,overflowY:"auto",border:"1px solid "+T.brd,borderRadius:10,padding:8}}>
              {(pkg.movements||[]).slice().reverse().map((m,i)=><div key={i} style={{display:"flex",gap:8,alignItems:"center",padding:"4px 0",borderBottom:i<(pkg.movements.length-1)?"1px solid "+T.brd+"40":"none",fontSize:FS-2}}>
                <span style={{color:T.textMut,flexShrink:0}}>{m.date}</span>
                <span style={{fontWeight:800,color:m.type==="add"?"#10B981":m.type==="sell"?"#8B5CF6":"#EF4444",flexShrink:0}}>{m.type==="add"?"📥":m.type==="sell"?"💰":"📤"}</span>
                <span style={{fontWeight:700,color:m.type==="sell"?"#8B5CF6":T.accent}}>{m.type==="sell"?"بيع لـ "+m.custName:m.modelNo}</span>
                <span style={{color:T.textSec}}>{m.type==="sell"?m.totalQty+" ق":"× "+m.count}</span>
                {m.type!=="sell"&&<span style={{fontWeight:800,color:m.type==="add"?"#10B981":"#EF4444"}}>{(m.type==="add"?"+":"-")+m.qty+" ق"}</span>}
                {m.by&&<span style={{color:T.textMut,fontSize:FS-3}}>{m.by}</span>}
              </div>)}
            </div>
          </div>}
          {/* Closed status */}
          {(pkg.status==="مغلقة"||pkg.status==="مباعة")&&<div style={{marginTop:12,padding:10,borderRadius:10,background:(pkg.status==="مباعة"?"#8B5CF6":"#EF4444")+"10",border:"1px solid "+(pkg.status==="مباعة"?"#8B5CF6":"#EF4444")+"30",textAlign:"center"}}>
            <div style={{fontSize:FS,fontWeight:800,color:pkg.status==="مباعة"?"#8B5CF6":"#EF4444"}}>{pkg.status==="مباعة"?"💰 تم البيع":"🔒 كرتونة مغلقة"}</div>
            <div style={{fontSize:FS-2,color:T.textMut}}>{pkg.closedAt?"تم الإغلاق: "+pkg.closedAt.split("T")[0]:""}</div>
          </div>}
        </div>
      </div>})()}
    {/* Stock Receive from Finishing - تسليم مخزن جاهز */}
    {stockRcv&&(()=>{const rcvItems=stockRcv.items||{};
      /* V16.18: compute once and filter on the same value displayed.
         Old code had filter+map run rcvFromWs-allDel twice, which can drift
         and let zero-balance rows leak in if the data has any inconsistency. */
      const available=orders.map(o=>{
        const wds=o.workshopDeliveries||[];
        const rcvFromWs=wds.reduce((s,wd)=>s+(wd.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0),0);
        const allDel=(o.deliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);
        const pending=(o.deliveries||[]).filter(d=>d.status==="pending").reduce((s,d)=>s+(Number(d.qty)||0),0);
        const fromFinishing=Math.max(0,Math.round(rcvFromWs-allDel));
        return{id:o.id,modelNo:o.modelNo,modelDesc:o.modelDesc,fromFinishing,pendingQty:pending,rackSize:getRackSize(o.id)};
      }).filter(m=>m.fromFinishing>0);
      const stockScanMode=stockRcv.scanMode||"series";/* "series" | "piece" */
      /* Update module-level variable (not a hook — safe inside IIFE) */
      _stockRcvScanMode=stockScanMode;
      const handleStockScan=(text)=>{try{const parts=text.split(":");if(parts[0]!=="CLARK"||!parts[1])return;const orderId=parts[1];const qrRs=Number(parts[2])||1;
        const o=orders.find(x=>x.id===orderId);if(!o){playBeep("error");showToast("⛔ موديل غير موجود");return}
        const _sz=parseSizes(o.sizeLabel);const rs=_sz.length>1?Math.max(qrRs,_sz.length):qrRs;
        /* Read current mode from module-level variable */
        const currentMode=_stockRcvScanMode;
        const addQty=currentMode==="piece"?1:rs;
        setStockRcv(p=>({...p,items:{...p.items,[orderId]:(p.items[orderId]||0)+addQty}}));playBeep("ok");showToast("✅ "+o.modelNo+" +"+(currentMode==="piece"?"1 قطعة":rs+" سيري"))}
        catch(e){
          /* V21.21.31: كان catch فاضي — فشل تسجيل استلام المخزن كان يضيع بصمت */
          playBeep("error");showToast("⛔ خطأ في تسجيل الاستلام — أعد المسح ("+(e?.message||e)+")");console.warn("[CLARK stock-rcv scan]",e);
        }};
      const closeStockCam=()=>{try{const v=document.getElementById("stock-rcv-video");if(v&&v.srcObject){v.srcObject.getTracks().forEach(t=>t.stop());v.srcObject=null}}catch(e){}setStockRcv(p=>({...p,scanning:false}))};
      const totalRcv=Object.values(rcvItems).reduce((s,v)=>s+v,0);
      const confirmStockRcv=()=>{if(totalRcv<=0){showToast("⚠️ لا توجد كميات للاستلام");return}
        Object.entries(rcvItems).forEach(([oid,qty])=>{if(qty<=0)return;updOrder(oid,o=>{if(!o.deliveries)o.deliveries=[];o.deliveries.push({date:cairoDateStr(),qty,notes:"تسليم للمخزن",createdBy:userName||"",status:"pending"})})});
        playBeep("done");showToast("⏳ تم تسجيل "+totalRcv+" قطعة — في انتظار تأكيد أمين المخزن");closeStockCam();setStockRcv(null)};
      const printStockRcv=()=>{let h="<h2 style='text-align:center'>📥 إذن تسليم مخزن جاهز — "+cairoDateStr()+"</h2>";
        h+="<table><thead><tr><th>الموديل</th><th>الوصف</th><th>متاح من التشطيب</th><th>تسليم مخزن جاهز</th><th>الفرق</th></tr></thead><tbody>";
        available.forEach(m=>{const rcv=rcvItems[m.id]||0;const diff=rcv-m.fromFinishing;h+="<tr><td style='font-weight:800'>"+m.modelNo+"</td><td>"+m.modelDesc+"</td><td style='text-align:center'>"+m.fromFinishing+"</td><td style='text-align:center;font-weight:800;color:#0EA5E9'>"+rcv+"</td><td style='text-align:center;font-weight:800;color:"+(diff===0?"#10B981":diff>0?"#0EA5E9":"#EF4444")+"'>"+diff+"</td></tr>"});
        h+="<tr style='background:#F1F5F9;font-weight:800'><td colspan='3'>الاجمالي</td><td style='text-align:center;color:#0EA5E9'>"+totalRcv+"</td><td></td></tr></tbody></table>";
        h+="<div class='sig'><div class='sig-box'>مسؤول التشطيب</div><div class='sig-box'>أمين المخزن<br/>"+(userName||"")+"</div></div>";printPage("تسليم مخزن جاهز",h)};
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:isMob?8:16}} onClick={()=>{closeStockCam();setStockRcv(null)}}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,width:"100%",maxWidth:isMob?"100%":650,maxHeight:"92vh",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)",display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <div style={{padding:isMob?"12px 16px":"16px 24px",borderBottom:"1px solid "+T.brd,flexShrink:0}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{fontSize:FS+2,fontWeight:800,color:"#0EA5E9"}}>📥 استلام مخزن الجاهز</div>
              <div style={{display:"flex",gap:4}}><Btn small onClick={printStockRcv} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>🖨</Btn><Btn ghost small onClick={()=>{closeStockCam();setStockRcv(null)}}>✕</Btn></div>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
              <Btn small onClick={()=>{if(stockRcv.scanning){closeStockCam()}else{setStockRcv(p=>({...p,scanning:true}))}}} style={{background:stockRcv.scanning?"#EF444412":"#0EA5E912",color:stockRcv.scanning?"#EF4444":"#0EA5E9",border:"1px solid "+(stockRcv.scanning?"#EF444430":"#0EA5E930")}}>{stockRcv.scanning?"⏹ Stop":"📷 Scan"}</Btn>
              <div style={{display:"flex",gap:0,borderRadius:8,overflow:"hidden",border:"1px solid "+T.brd}}>
                {[{k:"series",l:"سيري",ic:"📦"},{k:"piece",l:"قطعة",ic:"👕"}].map(m=><div key={m.k} onClick={()=>setStockRcv(p=>({...p,scanMode:m.k}))} style={{padding:"4px 10px",fontSize:FS-2,fontWeight:700,cursor:"pointer",background:stockScanMode===m.k?"#0EA5E9":"transparent",color:stockScanMode===m.k?"#fff":T.textSec,transition:"all 0.15s"}}>{m.ic+" "+m.l}</div>)}
              </div>
              <div style={{flex:1,minWidth:150}}><SearchSel value="" onChange={v=>{if(!v)return;const _o=orders.find(x=>x.id===v);const _szz=parseSizes(_o?.sizeLabel);const rs=_szz.length>1?Math.max(getRackSize(v),_szz.length):getRackSize(v);const addQty=stockScanMode==="piece"?1:rs;setStockRcv(p=>({...p,items:{...p.items,[v]:(p.items[v]||0)+addQty}}));playBeep("ok")}} options={available.map(m=>({value:m.id,label:m.modelNo+" — "+m.modelDesc+" ("+m.fromFinishing+")"}))} placeholder="اضف يدوي..."/></div>
            </div>
            {stockRcv.scanning&&<div style={{marginTop:8}}>
              <div style={{position:"relative",width:"100%",maxWidth:200,margin:"0 auto",borderRadius:12,overflow:"hidden",background:"#000"}}>
                <video id="stock-rcv-video" playsInline muted autoPlay style={{width:"100%",display:"block"}} ref={el=>{if(!el||el.srcObject)return;(async()=>{try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment",width:{ideal:640}}});el.srcObject=stream;
                  const hasBD=typeof BarcodeDetector!=="undefined";const detector=hasBD?new BarcodeDetector({formats:["qr_code"]}):null;const canvas=document.createElement("canvas");let lastScan="";let lastTime=0;
                  const scan=async()=>{if(!el.srcObject)return;if(el.readyState<2){requestAnimationFrame(scan);return}canvas.width=el.videoWidth;canvas.height=el.videoHeight;canvas.getContext("2d").drawImage(el,0,0);
                    {const _qr=await scanQR(canvas);if(_qr){const now=Date.now();if(_qr!==lastScan||now-lastTime>2000){lastScan=_qr;lastTime=now;handleStockScan(_qr)}}}
                    if(el.srcObject)requestAnimationFrame(scan)};setTimeout(scan,500)}catch(e){showToast("⚠️ تعذر فتح الكاميرا");closeStockCam()}})()}}/>
                <div style={{position:"absolute",top:"35%",left:"50%",transform:"translate(-50%,-50%)",width:100,height:100,border:"2px solid #0EA5E9",borderRadius:10,boxShadow:"0 0 0 999px rgba(0,0,0,0.4)"}}/>
              </div>
            </div>}
          </div>
          <div style={{flex:1,overflowY:"auto",overflowX:"auto",padding:isMob?"8px 16px 16px":"8px 24px 24px"}}>
          <div style={{border:"1px solid "+T.brd,borderRadius:12,overflow:"hidden"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["الموديل","الوصف","من التشطيب","تسليم مخزن جاهز","الفرق","الحالة"].map(h=><th key={h} style={{...TH,fontSize:FS-2}}>{h}</th>)}</tr></thead><tbody>
              {available.map((m,i)=>{const rcv=rcvItems[m.id]||0;const diff=rcv-m.fromFinishing;
                return<tr key={m.id} style={{background:i%2===0?"transparent":T.bg+"80"}}>
                  <td style={{...TD,fontWeight:700,color:T.accent}}>{m.modelNo}</td>
                  <td style={{...TD,fontSize:FS-3,color:T.textMut}}>{m.modelDesc}</td>
                  <td style={{...TD,textAlign:"center",fontWeight:700,color:"#F59E0B"}}>{m.fromFinishing}</td>
                  <td style={{...TD,textAlign:"center"}}><input type="number" value={rcv||""} onChange={e=>setStockRcv(p=>({...p,items:{...p.items,[m.id]:Math.max(0,Number(e.target.value)||0)}}))} placeholder="0" style={{width:55,textAlign:"center",border:"2px solid "+(rcv?"#0EA5E9":T.brd),borderRadius:4,padding:"2px",fontSize:FS,fontWeight:700,fontFamily:"inherit",background:rcv?"#0EA5E906":"transparent"}}/></td>
                  <td style={{...TD,textAlign:"center",fontWeight:800,color:diff===0?"#10B981":diff>0?"#0EA5E9":"#EF4444"}}>{diff}</td>
                  <td style={{...TD,textAlign:"center",fontSize:FS-2}}>{!rcv?"—":diff===0?"✅ مطابق":diff>0?"🔵 زيادة":"⚠️ عجز"}</td>
                </tr>})}
              {available.length===0&&<tr><td colSpan={6} style={{...TD,textAlign:"center",color:T.textMut,padding:20}}>لا توجد كميات متاحة من التشطيب</td></tr>}
              {available.length>0&&<tr style={{background:"#0EA5E908"}}><td colSpan={3} style={{...TD,fontWeight:800}}>الاجمالي</td><td style={{...TD,textAlign:"center",fontWeight:800,color:"#0EA5E9"}}>{totalRcv}</td><td colSpan={2} style={TD}></td></tr>}
            </tbody></table>
          </div>
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"center",padding:"12px 24px",borderTop:"1px solid "+T.brd,flexShrink:0}}>
            <Btn onClick={confirmStockRcv} style={{background:"#0EA5E9",color:"#fff",border:"none",fontWeight:700}}>📥 تأكيد الاستلام ({totalRcv} قطعة)</Btn>
            <Btn ghost onClick={()=>{closeStockCam();setStockRcv(null)}}>الغاء</Btn>
          </div>
        </div>
      </div>})()}
    {/* Inventory Audit - جرد المخزن */}
    {invAudit&&(()=>{const auditItems=invAudit.items||{};
      const scanMode=invAudit.scanMode||"series";/* "series" | "piece" | "auto" */
      /* Update module-level variable on every render so scanner closure reads latest value.
         This is safe — it's not a hook, just a plain assignment to a module variable. */
      _auditScanMode=scanMode;
      const allStock=stockModels.filter(m=>m.stockQty>0||auditItems[m.id]);
      const handleAuditScan=(text)=>{try{
        /* 1. Try package QR (carton) */
        try{const j=JSON.parse(text);if(j.app==="clark"&&j.type==="pkg"){
          const pkg=(config.packages||[]).find(p=>p.id===j.id);
          if(!pkg){playBeep("error");showToast("⛔ كرتونة غير موجودة");return}
          setInvAudit(p=>{const items={...p.items};(pkg.items||[]).forEach(it=>{items[it.orderId]=(items[it.orderId]||0)+(Number(it.qty)||0)});return{...p,items}});
          playBeep("ok");showToast("📦 كرتونة "+j.num+" — "+(pkg.items||[]).length+" موديل");return}}catch(e2){}
        /* 2. Model QR: CLARK:orderId:rackSize */
        const parts=text.split(":");if(parts[0]!=="CLARK"||!parts[1])return;const orderId=parts[1];const qrRs=Number(parts[2])||1;
        const o=orders.find(x=>x.id===orderId);if(!o){playBeep("error");showToast("⛔ موديل غير موجود");return}
        const _sz=parseSizes(o.sizeLabel);const rs=_sz.length>1?Math.max(qrRs,_sz.length):qrRs;
        /* Read current scan mode from module-level variable (always current) */
        const currentMode=_auditScanMode;
        const addQty=currentMode==="piece"?1:rs;
        setInvAudit(p=>{const items={...p.items};items[orderId]=(items[orderId]||0)+addQty;return{...p,items}});playBeep("ok");showToast("✅ "+o.modelNo+" +"+(currentMode==="piece"?"1 قطعة":rs+" سيري"))}
        catch(e){
          /* V21.21.31: كان catch فاضي — فشل تسجيل عدّة الجرد كان يضيع بصمت
             والجرد يطلع ناقص → تسوية خاطئة تمسح مخزوناً حقيقياً. */
          playBeep("error");showToast("⛔ خطأ في تسجيل الجرد — أعد المسح ("+(e?.message||e)+")");console.warn("[CLARK inv-audit scan]",e);
        }};
      const closeAuditCam=()=>{try{const v=document.getElementById("audit-scan-video");if(v&&v.srcObject){v.srcObject.getTracks().forEach(t=>t.stop());v.srcObject=null}}catch(e){}setInvAudit(p=>({...p,scanning:false}))};
      const totalSystem=allStock.reduce((s,m)=>s+m.avail,0);const totalCounted=allStock.reduce((s,m)=>s+(auditItems[m.id]||0),0);const totalDiff=totalCounted-totalSystem;
      const applyAdjust=()=>{let adj=0;allStock.forEach(m=>{const counted=auditItems[m.id];if(counted===undefined)return;const diff=counted-m.avail;if(diff===0)return;adj++;
        const adjustQty=diff;updOrder(m.id,o=>{if(!o.deliveries)o.deliveries=[];if(adjustQty>0){o.deliveries.push({date:cairoDateStr(),qty:adjustQty,notes:"تسوية جرد (زيادة)",createdBy:userName||"",isAdjustment:true})}
          else{const absAdj=Math.abs(adjustQty);const existing=getConfirmedStock(o);const custDel=(o.customerDeliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);const custRet=(o.customerReturns||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);
            if(!o.customerDeliveries)o.customerDeliveries=[];o.customerDeliveries.push({custId:"_adjust",custName:"تسوية جرد",qty:absAdj,date:cairoDateStr(),createdBy:userName||"",isAdjustment:true})}})});
        upTasks(d=>{if(!d.inventoryAudits)d.inventoryAudits=[];d.inventoryAudits.push({id:Date.now().toString(36),date:cairoDateStr(),by:userName||"",items:{...auditItems},adjustments:adj})});
        showToast("✅ تم حفظ الجرد وتسوية "+adj+" موديل");closeAuditCam();setInvAudit(null)};
      const printAudit=()=>{let h="<h2 style='text-align:center'>📋 تقرير جرد المخزن — "+cairoDateStr()+"</h2>";
        h+="<table style='margin:0 auto 12px'><tr><th>النظام</th><td style='font-weight:800'>"+totalSystem+"</td><th>الجرد</th><td style='font-weight:800'>"+totalCounted+"</td><th>الفرق</th><td style='font-weight:800;color:"+(totalDiff===0?"#10B981":totalDiff>0?"#0EA5E9":"#EF4444")+"'>"+totalDiff+"</td></tr></table>";
        h+="<table><thead><tr><th>الموديل</th><th>الوصف</th><th>النظام</th><th>الجرد</th><th>الفرق</th><th>الحالة</th></tr></thead><tbody>";
        allStock.forEach(m=>{const counted=auditItems[m.id]||0;const diff=counted-m.avail;h+="<tr style='background:"+(diff<0?"#FEF2F2":diff>0?"#EFF6FF":"transparent")+"'><td style='font-weight:800'>"+m.modelNo+"</td><td>"+m.modelDesc+"</td><td style='text-align:center'>"+m.avail+"</td><td style='text-align:center;font-weight:800'>"+counted+"</td><td style='text-align:center;font-weight:800;color:"+(diff===0?"#10B981":diff>0?"#0EA5E9":"#EF4444")+"'>"+diff+"</td><td style='text-align:center'>"+(diff===0?"✅ مطابق":diff>0?"🔵 زيادة":"⚠️ عجز")+"</td></tr>"});
        h+="</tbody></table><div class='sig'><div class='sig-box'>أمين المخزن</div><div class='sig-box'>المدير</div></div>";printPage("جرد المخزن",h)};
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:isMob?8:16}} onClick={()=>{closeAuditCam();setInvAudit(null)}}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:isMob?16:24,width:"100%",maxWidth:isMob?"100%":700,maxHeight:"92vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:FS+2,fontWeight:800,color:"#8B5CF6"}}>🏪 جرد المخزن</div>
            <div style={{display:"flex",gap:4}}><Btn small onClick={printAudit} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>🖨</Btn><Btn ghost small onClick={()=>{closeAuditCam();setInvAudit(null)}}>✕</Btn></div>
          </div>
          {/* Audit Tabs */}
          {(()=>{const auditTab=invAudit.tab||"compare";
          return<div>
          <div style={{display:"flex",gap:0,marginBottom:12,borderRadius:10,overflow:"hidden",border:"1px solid "+T.brd}}>
            <div onClick={()=>setInvAudit(p=>({...p,tab:"compare"}))} style={{flex:1,padding:"8px 0",textAlign:"center",cursor:"pointer",fontWeight:700,fontSize:FS-1,background:auditTab==="compare"?"#8B5CF6":T.cardSolid,color:auditTab==="compare"?"#fff":T.textSec}}>📊 جرد مقارنة</div>
            <div onClick={()=>setInvAudit(p=>({...p,tab:"physical"}))} style={{flex:1,padding:"8px 0",textAlign:"center",cursor:"pointer",fontWeight:700,fontSize:FS-1,background:auditTab==="physical"?"#059669":T.cardSolid,color:auditTab==="physical"?"#fff":T.textSec}}>📋 جرد مادي</div>
          </div>
          {/* Summary cards */}
          {auditTab==="compare"?<div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:10}}>
            <div style={{padding:8,borderRadius:10,background:T.accent+"08",textAlign:"center"}}><div style={{fontSize:FS-3,color:T.textSec}}>النظام</div><div style={{fontSize:FS+2,fontWeight:800,color:T.accent}}>{totalSystem}</div></div>
            <div style={{padding:8,borderRadius:10,background:"#8B5CF608",textAlign:"center"}}><div style={{fontSize:FS-3,color:T.textSec}}>الجرد</div><div style={{fontSize:FS+2,fontWeight:800,color:"#8B5CF6"}}>{totalCounted}</div></div>
            <div style={{padding:8,borderRadius:10,background:(totalDiff===0?"#10B981":totalDiff>0?"#0EA5E9":"#EF4444")+"08",textAlign:"center"}}><div style={{fontSize:FS-3,color:T.textSec}}>الفرق</div><div style={{fontSize:FS+2,fontWeight:800,color:totalDiff===0?"#10B981":totalDiff>0?"#0EA5E9":"#EF4444"}}>{totalDiff}</div></div>
          </div>:<div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:10}}>
            <div style={{padding:8,borderRadius:10,background:"#05966908",textAlign:"center"}}><div style={{fontSize:FS-3,color:T.textSec}}>عدد الموديلات</div><div style={{fontSize:FS+2,fontWeight:800,color:"#059669"}}>{Object.keys(auditItems).filter(k=>auditItems[k]>0).length}</div></div>
            <div style={{padding:8,borderRadius:10,background:"#05966908",textAlign:"center"}}><div style={{fontSize:FS-3,color:T.textSec}}>إجمالي القطع</div><div style={{fontSize:FS+2,fontWeight:800,color:"#059669"}}>{totalCounted}</div></div>
          </div>}
          {/* Scan + mode selector */}
          <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
            <Btn small onClick={()=>{if(invAudit.scanning){closeAuditCam()}else{setInvAudit(p=>({...p,scanning:true}))}}} style={{background:invAudit.scanning?"#EF444412":"#8B5CF612",color:invAudit.scanning?"#EF4444":"#8B5CF6",border:"1px solid "+(invAudit.scanning?"#EF444430":"#8B5CF630")}}>{invAudit.scanning?"⏹ Stop":"📷 Scan"}</Btn>
            <div style={{display:"flex",gap:0,borderRadius:8,overflow:"hidden",border:"1px solid "+T.brd}}>
              {[{k:"series",l:"سيري",ic:"📦"},{k:"piece",l:"قطعة",ic:"👕"}].map(m=><div key={m.k} onClick={()=>setInvAudit(p=>({...p,scanMode:m.k}))} style={{padding:"4px 10px",fontSize:FS-2,fontWeight:700,cursor:"pointer",background:scanMode===m.k?"#8B5CF6":"transparent",color:scanMode===m.k?"#fff":T.textSec,transition:"all 0.15s"}}>{m.ic+" "+m.l}</div>)}
            </div>
            <span style={{fontSize:FS-3,color:T.textMut}}>📦 كرتونة/Package = أوتو</span>
            <div style={{flex:1}}><SearchSel value="" onChange={v=>{if(!v)return;const _o2=orders.find(x=>x.id===v);const _szz2=parseSizes(_o2?.sizeLabel);const rs=_szz2.length>1?Math.max(getRackSize(v),_szz2.length):getRackSize(v);const addQty=scanMode==="piece"?1:rs;setInvAudit(p=>{const items={...p.items};items[v]=(items[v]||0)+addQty;return{...p,items}});playBeep("ok")}} options={(auditTab==="compare"?stockModels:orders).map(m=>({value:m.id,label:(m.modelNo||"")+" — "+(m.modelDesc||"")+(auditTab==="compare"?" ("+m.avail+")":"")}))} placeholder="اضف يدوي..."/></div>
          </div>
          {invAudit.scanning&&<div style={{marginBottom:10}}>
            <div style={{position:"relative",width:"100%",maxWidth:260,margin:"0 auto",borderRadius:12,overflow:"hidden",background:"#000"}}>
              <video id="audit-scan-video" playsInline muted autoPlay style={{width:"100%",display:"block"}} ref={el=>{if(!el||el.srcObject)return;(async()=>{try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment",width:{ideal:640}}});el.srcObject=stream;
                const canvas=document.createElement("canvas");let lastScan="";let lastTime=0;
                const scan=async()=>{if(!el.srcObject)return;if(el.readyState<2){requestAnimationFrame(scan);return}canvas.width=el.videoWidth;canvas.height=el.videoHeight;canvas.getContext("2d").drawImage(el,0,0);
                  {const _qr=await scanQR(canvas);if(_qr){const now=Date.now();if(_qr!==lastScan||now-lastTime>2000){lastScan=_qr;lastTime=now;handleAuditScan(_qr)}}}
                  if(el.srcObject)requestAnimationFrame(scan)};setTimeout(scan,300)}catch(e){showToast("⚠️ تعذر فتح الكاميرا");closeAuditCam()}})()}}/>
              <div style={{position:"absolute",top:"35%",left:"50%",transform:"translate(-50%,-50%)",width:130,height:130,border:"2px solid "+(auditTab==="compare"?"#8B5CF6":"#059669"),borderRadius:10,boxShadow:"0 0 0 999px rgba(0,0,0,0.4)"}}/>
            </div>
          </div>}
          {/* ═══ COMPARE TABLE ═══ */}
          {auditTab==="compare"&&<div>
          <div style={{border:"1px solid "+T.brd,borderRadius:12,overflow:"hidden"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["الموديل","الوصف","النظام","الجرد","الفرق","الحالة"].map(h=><th key={h} style={{...TH,fontSize:FS-2}}>{h}</th>)}</tr></thead><tbody>
              {allStock.map((m,i)=>{const counted=auditItems[m.id]||0;const diff=counted-m.avail;
                return<tr key={m.id} style={{background:diff<0?"#FEF2F208":diff>0?"#EFF6FF":i%2===0?"transparent":T.bg+"80"}}>
                  <td style={{...TD,fontWeight:700,color:T.accent}}>{m.modelNo}</td>
                  <td style={{...TD,fontSize:FS-3,color:T.textMut}}>{m.modelDesc}</td>
                  <td style={{...TD,textAlign:"center"}}>{m.avail}</td>
                  <td style={{...TD,textAlign:"center"}}><input type="number" value={counted||""} onChange={e=>setInvAudit(p=>({...p,items:{...p.items,[m.id]:Math.max(0,Number(e.target.value)||0)}}))} placeholder="0" style={{width:60,textAlign:"center",border:"2px solid "+(counted?"#8B5CF6":T.brd),borderRadius:4,padding:"2px",fontSize:FS,fontWeight:700,fontFamily:"inherit",background:counted?"#8B5CF606":"transparent"}}/></td>
                  <td style={{...TD,textAlign:"center",fontWeight:800,color:diff===0?"#10B981":diff>0?"#0EA5E9":"#EF4444"}}>{diff}</td>
                  <td style={{...TD,textAlign:"center",fontSize:FS-2}}>{counted===0&&!auditItems[m.id]?"—":diff===0?"✅":diff>0?"🔵 +"+diff:"⚠️ "+diff}</td>
                </tr>})}
            </tbody></table>
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"center",marginTop:12}}>
            <Btn onClick={async()=>{const hasChanges=Object.keys(auditItems).some(id=>{const m=stockModels.find(x=>x.id===id);return m&&auditItems[id]!==m.avail});
              if(!hasChanges){showToast("✅ لا توجد فروقات — المخزن مطابق");return}if(await ask("تأكيد التسوية","سيتم تعديل أرصدة المخزن.\n\nهل تريد المتابعة؟",{confirmText:"تأكيد التسوية"}))applyAdjust()}} style={{background:"#8B5CF6",color:"#fff",border:"none",fontWeight:700}}>🔧 تسوية الفروقات</Btn>
            <Btn ghost onClick={()=>{closeAuditCam();setInvAudit(null)}}>الغاء</Btn>
          </div>
          </div>}
          {/* ═══ PHYSICAL COUNT TABLE ═══ */}
          {auditTab==="physical"&&(()=>{
            const physItems=Object.entries(auditItems).filter(([k,v])=>v>0).map(([id,qty])=>{const o=orders.find(x=>x.id===id);return{id,modelNo:o?.modelNo||"—",modelDesc:o?.modelDesc||"",qty}}).sort((a,b)=>a.modelNo.localeCompare(b.modelNo));
            const physTotal=physItems.reduce((s,i)=>s+i.qty,0);
            const printPhysical=()=>{let h="<h2 style='text-align:center'>📋 جرد مادي — "+cairoDateStr()+"</h2>";
              h+="<table style='margin:0 auto 12px'><tr><th>عدد الموديلات</th><td style='font-weight:800'>"+physItems.length+"</td><th>إجمالي القطع</th><td style='font-weight:800'>"+physTotal+"</td></tr></table>";
              h+="<table><thead><tr><th>#</th><th>الموديل</th><th>الوصف</th><th>الكمية</th></tr></thead><tbody>";
              physItems.forEach((it,i)=>{h+="<tr><td style='text-align:center'>"+(i+1)+"</td><td style='font-weight:800'>"+it.modelNo+"</td><td>"+it.modelDesc+"</td><td style='text-align:center;font-weight:800;color:#059669'>"+it.qty+"</td></tr>"});
              h+="<tr style='background:#ECFDF5;font-weight:800'><td colspan='3' style='text-align:center'>الإجمالي</td><td style='text-align:center;font-size:16px;color:#059669'>"+fmt(physTotal)+"</td></tr></tbody></table>";
              h+="<div class='sig'><div class='sig-box'>أمين المخزن</div><div class='sig-box'>المدير</div></div>";printPage("جرد مادي",h)};
            return<div>
            <div style={{border:"1px solid "+T.brd,borderRadius:12,overflow:"hidden"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["#","الموديل","الوصف","الكمية",""].map(h=><th key={h} style={{...TH,fontSize:FS-2}}>{h}</th>)}</tr></thead><tbody>
                {physItems.length>0?physItems.map((it,i)=><tr key={it.id} style={{borderBottom:"1px solid "+T.brd,background:i%2===0?"transparent":T.bg+"80"}}>
                  <td style={{...TD,textAlign:"center",color:T.textMut}}>{i+1}</td>
                  <td style={{...TD,fontWeight:700,color:"#059669"}}>{it.modelNo}</td>
                  <td style={{...TD,fontSize:FS-3,color:T.textMut}}>{it.modelDesc}</td>
                  <td style={{...TD,textAlign:"center"}}><input type="number" value={it.qty||""} onChange={e=>setInvAudit(p=>({...p,items:{...p.items,[it.id]:Math.max(0,Number(e.target.value)||0)}}))} style={{width:60,textAlign:"center",border:"2px solid #059669",borderRadius:4,padding:"2px",fontSize:FS,fontWeight:700,fontFamily:"inherit",background:"#05966906"}}/></td>
                  <td style={{...TD,textAlign:"center"}}><span onClick={()=>setInvAudit(p=>{const items={...p.items};delete items[it.id];return{...p,items}})} style={{cursor:"pointer",color:T.err,fontSize:FS-2}}>✕</span></td>
                </tr>):<tr><td colSpan={5} style={{...TD,textAlign:"center",color:T.textMut,padding:30}}>اسكان QR أو أضف يدوي لبدء الجرد</td></tr>}
                {physItems.length>0&&<tr style={{background:"#ECFDF5"}}><td colSpan={3} style={{...TD,fontWeight:800,textAlign:"center"}}>الإجمالي</td><td style={{...TD,textAlign:"center",fontWeight:900,fontSize:FS+2,color:"#059669"}}>{fmt(physTotal)}</td><td/></tr>}
              </tbody></table>
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"center",marginTop:12}}>
              <Btn onClick={printPhysical} style={{background:"#059669",color:"#fff",border:"none",fontWeight:700}}>🖨 طباعة تقرير الجرد</Btn>
              <Btn ghost onClick={()=>{closeAuditCam();setInvAudit(null)}}>الغاء</Btn>
            </div>
            </div>})()}
          </div>})()}
        </div>
      </div>})()}
    {/* Customer Sales Log */}
                {pendingRcv&&(()=>{
      /* Group pending by orderId. V16.21: filter out entries whose pending qty
         is zero. V19.76.7: also split each pending entry by `type` (series vs
         broken) so the receipt screen shows the two stacked. Legacy entries
         without `type` default to "series" — matches getConfirmedBrokenStock. */
      const pendingMap={};orders.forEach(o=>{(o.deliveries||[]).forEach((d,di)=>{if(d.status==="pending"){const key=o.id;if(!pendingMap[key])pendingMap[key]={orderId:o.id,modelNo:o.modelNo,modelDesc:o.modelDesc||"",pendingQty:0,pendingSeriesQty:0,pendingBrokenQty:0,pendingSeriesIdxs:[],pendingBrokenIdxs:[],date:d.date,by:d.createdBy||"",rackSize:getRackSize(o.id)};
        const isBroken=d.type==="broken";
        const q=Number(d.qty)||0;
        pendingMap[key].pendingQty+=q;
        if(isBroken){pendingMap[key].pendingBrokenQty+=q;pendingMap[key].pendingBrokenIdxs.push(di)}
        else{pendingMap[key].pendingSeriesQty+=q;pendingMap[key].pendingSeriesIdxs.push(di)}
      }})});
      const pendings=Object.values(pendingMap).filter(p=>p.pendingQty>0).sort((a,b)=>(b.date||"").localeCompare(a.date||""));
      const rcvItems=pendingRcv.items||{};
      /* V19.76.7: rcvItems values are now {series:N, broken:N}. Legacy plain numbers
         are accepted (treated as all-series) for backward compat with in-flight state. */
      const itemQty=v=>(typeof v==="object"&&v?(Number(v.series)||0)+(Number(v.broken)||0):(Number(v)||0));
      const itemSeries=v=>(typeof v==="object"&&v?(Number(v.series)||0):(Number(v)||0));
      const itemBroken=v=>(typeof v==="object"&&v?(Number(v.broken)||0):0);
      const totalRcv=Object.values(rcvItems).reduce((s,v)=>s+itemQty(v),0);const totalPending=pendings.reduce((s,p)=>s+p.pendingQty,0);
      const closePendCam=()=>{try{const v=document.getElementById("pend-rcv-video");if(v&&v.srcObject){v.srcObject.getTracks().forEach(t=>t.stop());v.srcObject=null}}catch(e){}setPendingRcv(p=>({...p,scanning:false}))};
      const confirmPending=()=>{if(totalRcv<=0){showToast("⚠️ ادخل كمية واحدة على الأقل");return}
        /* V14.59: Build report data BEFORE the update (to capture pending qty)
           V19.76.7: process series and broken pending entries separately so the
           type metadata is preserved when status flips to confirmed. */
        const reportItems=[];
        pendings.forEach(p=>{
          const v=rcvItems[p.orderId];
          const qtySeries=itemSeries(v);
          const qtyBroken=itemBroken(v);
          const qty=qtySeries+qtyBroken;
          if(qty<=0)return;
          reportItems.push({orderId:p.orderId,modelNo:p.modelNo,modelDesc:p.modelDesc,pendingQty:p.pendingQty,confirmedQty:qty,diff:qty-p.pendingQty});
          updOrder(p.orderId,o=>{
            const consume=(idxs,need)=>{let remaining=need;idxs.forEach(idx=>{if(o.deliveries&&o.deliveries[idx]&&remaining>0){const dQty=Number(o.deliveries[idx].qty)||0;const take=Math.min(remaining,dQty);o.deliveries[idx].status="confirmed";o.deliveries[idx].confirmedQty=take;o.deliveries[idx].confirmedBy=userName||"";o.deliveries[idx].confirmedAt=nowISO();if(take!==dQty)o.deliveries[idx].notes=(o.deliveries[idx].notes||"")+" | فرق: "+(dQty-take);o.deliveries[idx].qty=take;remaining-=take}});return remaining};
            consume(p.pendingSeriesIdxs,qtySeries);
            consume(p.pendingBrokenIdxs,qtyBroken);
            o.deliveredQty=getConfirmedStock(o);o.status=recomputeStatus(o);
          });
        });
        playBeep("done");showToast("✅ تم تأكيد استلام "+totalRcv+" قطعة — الرصيد تحدّث");closePendCam();setPendingRcv(null);
        /* Show the report automatically */
        setLastReceiptReport({
          items:reportItems,
          total:totalRcv,
          totalPending:pendings.reduce((s,p)=>s+p.pendingQty,0),
          confirmedBy:userName||"",
          at:nowISO()
        });
      };
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:isMob?8:16}} onClick={()=>{closePendCam();setPendingRcv(null)}}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,width:"100%",maxWidth:isMob?"100%":650,maxHeight:"92vh",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)",display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <div style={{padding:isMob?"12px 16px":"16px 24px",borderBottom:"1px solid "+T.brd,flexShrink:0}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{fontSize:FS+2,fontWeight:800,color:"#10B981"}}>{"📥 تأكيد استلام المخزن"}</div>
              <Btn ghost small onClick={()=>{closePendCam();setPendingRcv(null)}}>✕</Btn>
            </div>
            {/* V14.62: Series/Piece toggle — controls how QR values are interpreted */}
            {(()=>{const curMode=pendingRcv.scanMode||"series";
              return<div style={{display:"flex",gap:0,marginBottom:10,borderRadius:10,overflow:"hidden",border:"2px solid "+(curMode==="series"?"#10B981":"#8B5CF6")}}>
                <div onClick={()=>setPendingRcv(p=>({...p,scanMode:"series"}))} style={{flex:1,textAlign:"center",padding:"10px 0",cursor:"pointer",fontWeight:800,fontSize:FS-1,background:curMode==="series"?"#10B981":"transparent",color:curMode==="series"?"#fff":T.textSec,transition:"all 0.15s"}}>
                  📦 سيري {curMode==="series"?<span style={{fontSize:FS-3,opacity:0.9,marginInlineStart:6}}>(يضيف الكمية في QR)</span>:""}
                </div>
                <div onClick={()=>setPendingRcv(p=>({...p,scanMode:"piece"}))} style={{flex:1,textAlign:"center",padding:"10px 0",cursor:"pointer",fontWeight:800,fontSize:FS-1,background:curMode==="piece"?"#8B5CF6":"transparent",color:curMode==="piece"?"#fff":T.textSec,transition:"all 0.15s"}}>
                  🔹 قطعة {curMode==="piece"?<span style={{fontSize:FS-3,opacity:0.9,marginInlineStart:6}}>(قطعة واحدة لكل مسح)</span>:""}
                </div>
              </div>;
            })()}
            <div style={{display:"flex",gap:6}}>
              <Btn small onClick={()=>{if(pendingRcv.scanning){closePendCam()}else{setPendingRcv(p=>({...p,scanning:true}))}}} style={{background:pendingRcv.scanning?"#EF444412":"#10B98112",color:pendingRcv.scanning?"#EF4444":"#10B981",border:"1px solid "+(pendingRcv.scanning?"#EF444430":"#10B98130")}}>{pendingRcv.scanning?"⏹ Stop":"📷 Scan"}</Btn>
              <div style={{flex:1}}><SearchSel value="" onChange={v=>{if(!v)return;const p=pendings.find(x=>x.orderId===v);if(p){const mode=pendingRcv.scanMode||"series";const isBroken=mode==="piece";const addQty=isBroken?1:(p.rackSize||1);setPendingRcv(pr=>{const cur=pr.items[v];const curSeries=itemSeries(cur);const curBroken=itemBroken(cur);return{...pr,items:{...pr.items,[v]:{series:curSeries+(isBroken?0:addQty),broken:curBroken+(isBroken?addQty:0)}}}});playBeep("ok")}else{showToast("⚠️ هذا الموديل ليس معلّق")}}} options={pendings.map(p=>({value:p.orderId,label:p.modelNo+" — "+p.modelDesc+" (⏳"+p.pendingQty+")"}))} placeholder="اضف يدوي..."/></div>
            </div>
            {pendingRcv.scanning&&<div style={{marginTop:8}}>
              <div style={{position:"relative",width:"100%",maxWidth:200,margin:"0 auto",borderRadius:12,overflow:"hidden",background:"#000"}}>
                <video id="pend-rcv-video" playsInline muted autoPlay style={{width:"100%",display:"block"}} ref={el=>{if(!el||el.srcObject)return;(async()=>{try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment",width:{ideal:640}}});el.srcObject=stream;
                  loadJsQR();const canvas=document.createElement("canvas");let lastScan="";let lastTime=0;
                  const scan=async()=>{if(!el.srcObject)return;if(el.readyState<2){requestAnimationFrame(scan);return}canvas.width=el.videoWidth;canvas.height=el.videoHeight;canvas.getContext("2d").drawImage(el,0,0);
                    {const _qr=await scanQR(canvas);if(_qr){const now=Date.now();if(_qr!==lastScan||now-lastTime>2000){lastScan=_qr;lastTime=now;
                      try{const parts=_qr.split(":");if(parts[0]==="CLARK"&&parts[1]){const oid=parts[1];const rs=Number(parts[2])||1;const p=pendings.find(x=>x.orderId===oid);
                        if(p){
                          /* V14.62: Use scanMode to determine qty.
                             V19.76.7: split into series/broken slots — scanMode "piece" → broken. */
                          const curMode=pendingRcv.scanMode||"series";
                          const isBroken=curMode==="piece";
                          const addQty=isBroken?1:rs;
                          setPendingRcv(pr=>{const cur=pr.items[oid];const curSeries=itemSeries(cur);const curBroken=itemBroken(cur);return{...pr,items:{...pr.items,[oid]:{series:curSeries+(isBroken?0:addQty),broken:curBroken+(isBroken?addQty:0)}}}});
                          playBeep("ok");
                          showToast("✅ "+p.modelNo+" +"+addQty+(isBroken?" كسر":" سيري"));
                        }
                        else{playBeep("error");showToast("⚠️ موديل غير معلّق")}}}catch(e){}}}}
                    requestAnimationFrame(scan)};scan()}catch(e){}})()}}/>
              </div></div>}
          </div>
          <div style={{flex:1,overflowY:"auto",padding:isMob?"8px 12px":"12px 24px"}}>
            {pendings.length>0?<div>
              <table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["الموديل","معلّق","مباع للعميل","تسليم مخزن جاهز","الفرق"].map(h=><th key={h} style={{...TH,fontSize:FS-2}}>{h}</th>)}</tr></thead><tbody>
                {pendings.map(p=>{
                  const v=rcvItems[p.orderId];
                  const valSeries=itemSeries(v);
                  const valBroken=itemBroken(v);
                  const val=valSeries+valBroken;
                  const diffSeries=valSeries-p.pendingSeriesQty;
                  const diffBroken=valBroken-p.pendingBrokenQty;
                  const diff=val-p.pendingQty;
                  const hasVal=val>0;
                  /* V15.68: Detect already-sold pending — if the model has been distributed to customers beyond what's confirmed in stock */
                  const o=orders.find(x=>x.id===p.orderId);
                  const custDel=o?(o.customerDeliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0):0;
                  const custRet=o?(o.customerReturns||[]).reduce((s,r)=>s+(Number(r.qty)||0),0):0;
                  const netSold=custDel-custRet;
                  const confirmedStock=o?getConfirmedStock(o):0;
                  const isAlreadySold=netSold>=confirmedStock+p.pendingQty;
                  const bg=isAlreadySold?"#FEE2E2":(hasVal&&diff!==0?"#FEF2F2":hasVal?"#F0FDF4":"transparent");
                  /* V19.76.7: stacked series/broken styling — small label + value in two rows */
                  const stackCellStyle={...TDB,padding:"4px 6px",verticalAlign:"middle"};
                  const stackInnerStyle={display:"flex",flexDirection:"column",gap:3,alignItems:"center"};
                  const lineStyle=(active,color)=>({display:"flex",alignItems:"center",gap:5,fontSize:FS-2,fontWeight:active?800:600,color:active?color:T.textMut,whiteSpace:"nowrap"});
                  const tagStyle=(color)=>({fontSize:FS-4,padding:"1px 5px",borderRadius:4,background:color+"15",color:color,fontWeight:800,minWidth:30,textAlign:"center"});
                  return<tr key={p.orderId} style={{background:bg}}>
                    <td style={{...TD,fontWeight:800,color:T.accent}}>
                      <div>{p.modelNo}</div>
                      <div style={{fontSize:FS-3,color:T.textMut,fontWeight:500,marginTop:2}}>{p.modelDesc}</div>
                      {isAlreadySold&&<div style={{fontSize:FS-3,color:"#DC2626",fontWeight:700,marginTop:3}}>⚠️ تسليم قديم — الموديل اتباع بالفعل</div>}
                    </td>
                    {/* معلّق — series stacked above broken */}
                    <td style={stackCellStyle}>
                      <div style={stackInnerStyle}>
                        <div style={lineStyle(p.pendingSeriesQty>0,"#10B981")}><span style={tagStyle("#10B981")}>📦 سيري</span><span>{p.pendingSeriesQty}</span></div>
                        <div style={lineStyle(p.pendingBrokenQty>0,"#8B5CF6")}><span style={tagStyle("#8B5CF6")}>🧩 كسر</span><span>{p.pendingBrokenQty}</span></div>
                      </div>
                    </td>
                    {/* مباع للعميل — kept flat (customerDeliveries don't carry series/broken type) */}
                    <td style={{...TDB,fontSize:FS-1,fontWeight:700,color:netSold>0?"#10B981":T.textMut}}>{netSold}</td>
                    {/* تسليم مخزن جاهز — TWO inputs stacked */}
                    <td style={{...TD,textAlign:"center",padding:4}}>
                      <div style={{display:"flex",flexDirection:"column",gap:4,alignItems:"center"}}>
                        <div style={{display:"flex",alignItems:"center",gap:4}}>
                          <span style={tagStyle("#10B981")}>📦</span>
                          <input type="number" value={valSeries||""} onChange={e=>{const nv=Math.max(0,Number(e.target.value)||0);setPendingRcv(pr=>{const cur=pr.items[p.orderId];return{...pr,items:{...pr.items,[p.orderId]:{series:nv,broken:itemBroken(cur)}}}})}} placeholder="0" style={{width:60,textAlign:"center",border:"2px solid "+(isAlreadySold?"#EF4444":"#10B981"),borderRadius:6,padding:"4px",fontSize:FS,fontWeight:800,fontFamily:"inherit",background:T.bg,color:T.text}}/>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:4}}>
                          <span style={tagStyle("#8B5CF6")}>🧩</span>
                          <input type="number" value={valBroken||""} onChange={e=>{const nv=Math.max(0,Number(e.target.value)||0);setPendingRcv(pr=>{const cur=pr.items[p.orderId];return{...pr,items:{...pr.items,[p.orderId]:{series:itemSeries(cur),broken:nv}}}})}} placeholder="0" style={{width:60,textAlign:"center",border:"2px solid #8B5CF6",borderRadius:6,padding:"4px",fontSize:FS,fontWeight:800,fontFamily:"inherit",background:T.bg,color:T.text}}/>
                        </div>
                      </div>
                    </td>
                    {/* الفرق — series diff stacked above broken diff */}
                    <td style={stackCellStyle}>
                      <div style={stackInnerStyle}>
                        <div style={lineStyle(valSeries>0,diffSeries<0?"#EF4444":diffSeries===0?"#10B981":"#0EA5E9")}><span style={tagStyle("#10B981")}>📦</span><span>{valSeries>0?(diffSeries>0?"+"+diffSeries:diffSeries):"—"}</span></div>
                        <div style={lineStyle(valBroken>0,diffBroken<0?"#EF4444":diffBroken===0?"#10B981":"#0EA5E9")}><span style={tagStyle("#8B5CF6")}>🧩</span><span>{valBroken>0?(diffBroken>0?"+"+diffBroken:diffBroken):"—"}</span></div>
                      </div>
                    </td>
                  </tr>;
                })}
              </tbody></table>
            </div>:<div style={{textAlign:"center",padding:30,color:T.textMut}}>✅ لا توجد تسليمات معلّقة</div>}
          </div>
          <div style={{padding:"12px 24px",borderTop:"1px solid "+T.brd,flexShrink:0,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:FS,color:T.textMut}}>{"معلّق: "+totalPending+" | تسليم مخزن جاهز: "+totalRcv}</div>
            <Btn onClick={confirmPending} disabled={totalRcv<=0} style={{background:"#10B981",color:"#fff",border:"none",fontWeight:700,padding:"8px 24px"}}>{"✅ تأكيد الاستلام ("+totalRcv+")"}</Btn>
          </div>
        </div></div>})()}

    {/* ══ V14.59: RECEIPT REPORT POPUP — shown after confirmation ══ */}
    {lastReceiptReport&&(()=>{
      const rep=lastReceiptReport;
      const dateStr=new Date(rep.at).toLocaleString("ar-EG");
      const dateShort=new Date(rep.at).toISOString().split("T")[0];
      /* Build shareable text summary (for WhatsApp) */
      const buildWaMsg=()=>{
        const lines=[
          "*📦 CLARK — تقرير استلام مخزن الجاهز*",
          "━━━━━━━━━━━━━━━━",
          "📅 التاريخ: "+dateStr,
          "👤 بواسطة: "+(rep.confirmedBy||"—"),
          "",
          "*الإجمالي:*",
          "• تسليم معلّق: *"+rep.totalPending+"* قطعة",
          "• تم استلام: *"+rep.total+"* قطعة",
          "• الفرق: *"+(rep.total-rep.totalPending)+"* قطعة",
          "",
          "*التفاصيل:*"
        ];
        rep.items.forEach(it=>{
          lines.push("• *"+it.modelNo+"* — "+it.modelDesc);
          lines.push("  معلّق: "+it.pendingQty+" | تسليم مخزن جاهز: "+it.confirmedQty+(it.diff!==0?" | فرق: "+(it.diff>0?"+":"")+it.diff:""));
        });
        lines.push("");
        lines.push("🏭 CLARK ERP System");
        return lines.join("\n");
      };
      /* Print as thermal/A4 report */
      const doPrint=()=>{
        let rows="";
        rep.items.forEach(it=>{
          const diffColor=it.diff===0?"#10B981":it.diff<0?"#EF4444":"#0EA5E9";
          const diffLabel=it.diff===0?"مطابق":it.diff>0?"زيادة +"+it.diff:"نقص "+it.diff;
          rows+="<tr><td style='border:1px solid #ccc;padding:6px;font-weight:800;color:#0284C7'>"+it.modelNo+"</td><td style='border:1px solid #ccc;padding:6px;font-size:10px;color:#555'>"+it.modelDesc+"</td><td style='border:1px solid #ccc;padding:6px;text-align:center;font-weight:700;color:#F59E0B'>"+it.pendingQty+"</td><td style='border:1px solid #ccc;padding:6px;text-align:center;font-weight:700;color:#10B981'>"+it.confirmedQty+"</td><td style='border:1px solid #ccc;padding:6px;text-align:center;font-weight:800;color:"+diffColor+"'>"+diffLabel+"</td></tr>";
        });
        const html="<html dir='rtl'><head><meta charset='utf-8'><title>تقرير استلام — "+dateShort+"</title><link href='https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;800&display=swap' rel='stylesheet'/><style>@page{size:A4;margin:12mm}body{font-family:'Cairo',sans-serif;padding:0;color:#1E293B;line-height:1.6;font-size:11px}.hdr{text-align:center;border-bottom:3px solid #10B981;padding-bottom:10px;margin-bottom:14px}.hdr h1{color:#10B981;font-size:20px;margin-bottom:6px}.hdr .sub{font-size:14px;color:#0EA5E9;font-weight:700}.meta{display:flex;justify-content:space-between;margin-bottom:12px;font-size:11px;color:#475569}.summary{display:flex;gap:10px;margin-bottom:14px;justify-content:center}.card{padding:10px 16px;border-radius:10px;border:1px solid #ddd;text-align:center;min-width:120px}.card .lbl{font-size:10px;color:#666}.card .val{font-size:18px;font-weight:800;margin-top:4px}table{width:100%;border-collapse:collapse;margin:10px 0}th{background:#F0FDF4;border:1px solid #10B98140;padding:8px;font-weight:800;text-align:right;color:#059669}.sig{margin-top:50px;display:flex;justify-content:space-around;gap:20px}.sig-box{text-align:center;min-width:150px;border-top:2px solid #1E293B;padding-top:10px;font-weight:700;font-size:12px}.foot{margin-top:30px;padding-top:10px;border-top:1px solid #ccc;display:flex;justify-content:space-between;font-size:10px;color:#94A3B8}.pbar{position:sticky;top:0;background:#fff;padding:8px;border-bottom:2px solid #ccc;display:flex;justify-content:center;gap:10px;z-index:99}.pbar button{padding:6px 16px;border-radius:6px;border:1px solid #000;cursor:pointer;font-family:'Cairo';font-size:12px;font-weight:700;background:#fff}.pbar .pr{background:#10B981;color:#fff;border-color:#10B981}@media print{.pbar{display:none}}</style></head><body><div class='pbar'><button onclick='window.close()'>↩ رجوع</button><button class='pr' onclick='window.print()'>🖨 طباعة</button></div><div class='hdr'><h1>📦 تقرير استلام مخزن الجاهز</h1><div class='sub'>"+dateShort+"</div></div><div class='meta'><span>👤 بواسطة: <b>"+(rep.confirmedBy||"—")+"</b></span><span>📅 "+dateStr+"</span></div><div class='summary'><div class='card'><div class='lbl'>تسليم معلّق</div><div class='val' style='color:#F59E0B'>"+rep.totalPending+"</div></div><div class='card'><div class='lbl'>تم استلام</div><div class='val' style='color:#10B981'>"+rep.total+"</div></div><div class='card'><div class='lbl'>الفرق</div><div class='val' style='color:"+(rep.total===rep.totalPending?"#10B981":rep.total<rep.totalPending?"#EF4444":"#0EA5E9")+"'>"+(rep.total-rep.totalPending)+"</div></div></div><table><thead><tr><th>الموديل</th><th>الوصف</th><th style='text-align:center'>معلّق</th><th style='text-align:center'>تسليم مخزن جاهز</th><th style='text-align:center'>الفرق</th></tr></thead><tbody>"+rows+"</tbody></table><div class='sig'><div class='sig-box'>أمين المخزن</div><div class='sig-box'>المدير</div></div><div class='foot'><span>CLARK ERP System</span><span>"+dateStr+"</span></div></body></html>";
        const pw=openPrintWindow();if(!pw){tell("المتصفح يمنع الطباعة","فعّل النوافذ المنبثقة وحاول مرة أخرى",{danger:true});return}pw.document.write(html);pw.document.close();setTimeout(()=>{try{pw.print()}catch(e){}},500);
      };
      /* Share via WhatsApp */
      const doWhatsapp=()=>{
        const msg=encodeURIComponent(buildWaMsg());
        openWA("https://wa.me/?text="+msg,"_blank");
      };
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",zIndex:10002,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setLastReceiptReport(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:20,width:"100%",maxWidth:640,maxHeight:"92vh",display:"flex",flexDirection:"column",border:"2px solid #10B981",boxShadow:"0 25px 70px rgba(0,0,0,0.45)"}}>
          {/* Header */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,paddingBottom:10,borderBottom:"2px solid #10B98125"}}>
            <div style={{fontSize:FS+2,fontWeight:900,color:"#10B981",display:"flex",alignItems:"center",gap:8}}>
              <span>📦</span><span>تقرير استلام — {dateShort}</span>
            </div>
            <span onClick={()=>setLastReceiptReport(null)} style={{cursor:"pointer",fontSize:22,color:T.textMut,padding:4}}>✕</span>
          </div>
          {/* Meta */}
          <div style={{display:"flex",gap:8,marginBottom:12,fontSize:FS-1,color:T.textMut,flexWrap:"wrap"}}>
            <span>👤 <b style={{color:T.text}}>{rep.confirmedBy||"—"}</b></span>
            <span>•</span>
            <span>📅 {dateStr}</span>
          </div>
          {/* Summary */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>
            <div style={{padding:"10px 12px",borderRadius:10,background:"#F59E0B08",border:"1px solid #F59E0B30",textAlign:"center"}}>
              <div style={{fontSize:FS-3,color:T.textMut,fontWeight:600}}>تسليم معلّق</div>
              <div style={{fontSize:FS+5,fontWeight:900,color:"#F59E0B"}}>{rep.totalPending}</div>
            </div>
            <div style={{padding:"10px 12px",borderRadius:10,background:"#10B98108",border:"1px solid #10B98130",textAlign:"center"}}>
              <div style={{fontSize:FS-3,color:T.textMut,fontWeight:600}}>تم استلام</div>
              <div style={{fontSize:FS+5,fontWeight:900,color:"#10B981"}}>{rep.total}</div>
            </div>
            <div style={{padding:"10px 12px",borderRadius:10,background:(rep.total===rep.totalPending?"#10B98108":rep.total<rep.totalPending?"#EF444408":"#0EA5E908"),border:"1px solid "+(rep.total===rep.totalPending?"#10B98130":rep.total<rep.totalPending?"#EF444430":"#0EA5E930"),textAlign:"center"}}>
              <div style={{fontSize:FS-3,color:T.textMut,fontWeight:600}}>الفرق</div>
              <div style={{fontSize:FS+5,fontWeight:900,color:rep.total===rep.totalPending?"#10B981":rep.total<rep.totalPending?"#EF4444":"#0EA5E9"}}>{rep.total-rep.totalPending>0?"+":""}{rep.total-rep.totalPending}</div>
            </div>
          </div>
          {/* Items table */}
          <div style={{flex:1,overflowY:"auto",background:T.bg,borderRadius:10,border:"1px solid "+T.brd,padding:4,marginBottom:12}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr style={{background:"#10B98108"}}>{["الموديل","الوصف","معلّق","تسليم مخزن جاهز","الفرق"].map(h=><th key={h} style={{padding:"7px",textAlign:h==="الموديل"||h==="الوصف"?"right":"center",fontSize:FS-2,color:T.textSec,borderBottom:"1px solid #10B98130",fontWeight:700}}>{h}</th>)}</tr></thead><tbody>
              {rep.items.map((it,i)=><tr key={i} style={{background:i%2===1?T.bg:"transparent",borderBottom:"1px solid "+T.brd}}>
                <td style={{padding:"7px",fontWeight:800,color:T.accent,fontSize:FS-1}}>{it.modelNo}</td>
                <td style={{padding:"7px",fontSize:FS-2,color:T.textMut}}>{it.modelDesc}</td>
                <td style={{padding:"7px",textAlign:"center",fontWeight:700,color:"#F59E0B"}}>{it.pendingQty}</td>
                <td style={{padding:"7px",textAlign:"center",fontWeight:800,color:"#10B981"}}>{it.confirmedQty}</td>
                <td style={{padding:"7px",textAlign:"center",fontWeight:800,color:it.diff===0?T.ok:it.diff<0?T.err:"#0EA5E9"}}>{it.diff===0?"✓":(it.diff>0?"+":"")+it.diff}</td>
              </tr>)}
            </tbody></table>
          </div>
          {/* Actions */}
          <div style={{display:"flex",gap:8,justifyContent:"flex-end",paddingTop:10,borderTop:"1px solid "+T.brd}}>
            <Btn onClick={doWhatsapp} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630",fontWeight:700}}>📱 واتساب</Btn>
            <Btn onClick={doPrint} style={{background:"#10B98112",color:"#10B981",border:"1px solid #10B98130",fontWeight:700}}>🖨 طباعة / PDF</Btn>
            <Btn ghost onClick={()=>setLastReceiptReport(null)}>إغلاق</Btn>
          </div>
        </div>
      </div>;
    })()}

    {/* ══ V18.21: ITEM CARD (كارت صنف) — merged by modelNo + series/broken split ══ */}
    {itemCard&&(()=>{
      /* Build map: modelNo → { orders[], totalSeries, totalBroken, totalSold, totalRet, currentBal } */
      const modelMap={};
      orders.forEach(o=>{
        const hasRcv=(o.deliveries||[]).length>0;
        const hasSale=(o.customerDeliveries||[]).length>0;
        const hasRet=(o.customerReturns||[]).length>0;
        if(!hasRcv&&!hasSale&&!hasRet)return;
        const key=o.modelNo||o.id;/* fallback to id if no modelNo */
        if(!modelMap[key])modelMap[key]={key,modelNo:o.modelNo||"—",modelDesc:o.modelDesc||"",orderIds:[],totalSeries:0,totalBroken:0,totalRcv:0,totalSold:0,totalRet:0};
        modelMap[key].orderIds.push(o.id);
        if(!modelMap[key].modelDesc&&o.modelDesc)modelMap[key].modelDesc=o.modelDesc;
        modelMap[key].totalSeries+=getConfirmedSeriesStock(o);
        modelMap[key].totalBroken+=getConfirmedBrokenStock(o);
        modelMap[key].totalRcv+=getConfirmedStock(o);
        modelMap[key].totalSold+=(o.customerDeliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);
        modelMap[key].totalRet+=(o.customerReturns||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);
      });
      Object.values(modelMap).forEach(m=>{m.currentBal=m.totalRcv-(m.totalSold-m.totalRet);m.currentSeries=m.totalSeries-(m.totalSold-m.totalRet)/* assume sales come from series */});
      const allModels=Object.values(modelMap).sort((a,b)=>(a.modelNo||"").localeCompare(b.modelNo||""));
      /* Picker view */
      if(itemCard==="pick"){
        const filtered=itemCardFilter.trim()
          ? allModels.filter(m=>(m.modelNo||"").toLowerCase().includes(itemCardFilter.trim().toLowerCase())||(m.modelDesc||"").toLowerCase().includes(itemCardFilter.trim().toLowerCase()))
          : allModels;
        return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:isMob?8:24}} onClick={()=>setItemCard(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:isMob?14:20,width:"100%",maxWidth:560,maxHeight:"85vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontSize:FS+2,fontWeight:800,color:"#0EA5E9",display:"flex",alignItems:"center",gap:8}}>📇 <span>كارت صنف — اختر الموديل</span></div>
              <Btn ghost small onClick={()=>setItemCard(null)}>✕</Btn>
            </div>
            <div style={{marginBottom:10}}><Inp value={itemCardFilter} onChange={setItemCardFilter} placeholder="🔍 ابحث برقم الموديل أو الوصف..."/></div>
            {filtered.length===0?<div style={{textAlign:"center",padding:24,color:T.textMut}}>{itemCardFilter?"لا توجد نتائج":"لا توجد موديلات بحركات"}</div>:
              <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:"60vh",overflowY:"auto"}}>
                {filtered.map(m=>{
                  return<div key={m.key} onClick={()=>setItemCard({modelNo:m.key})} style={{padding:"10px 12px",borderRadius:10,background:T.bg,border:"1px solid "+T.brd,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}} onMouseEnter={e=>e.currentTarget.style.background="#0EA5E912"} onMouseLeave={e=>e.currentTarget.style.background=T.bg}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:FS,fontWeight:800,color:T.text,display:"flex",alignItems:"center",gap:6}}>
                        <span>{m.modelNo}</span>
                        {m.orderIds.length>1&&<span style={{fontSize:FS-3,padding:"1px 6px",borderRadius:4,background:"#8B5CF615",color:"#8B5CF6",fontWeight:700}} title={"مدموج من "+m.orderIds.length+" تشغيلات"}>⧉{m.orderIds.length}</span>}
                      </div>
                      <div style={{fontSize:FS-2,color:T.textMut,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{m.modelDesc||"—"}</div>
                      {(m.totalSeries>0||m.totalBroken>0)&&<div style={{display:"flex",gap:4,marginTop:3}}>
                        {m.totalSeries>0&&<span style={{fontSize:FS-3,padding:"1px 6px",borderRadius:4,background:"#0EA5E915",color:"#0EA5E9",fontWeight:700}}>📦{m.totalSeries}</span>}
                        {m.totalBroken>0&&<span style={{fontSize:FS-3,padding:"1px 6px",borderRadius:4,background:"#8B5CF615",color:"#8B5CF6",fontWeight:700}}>🧩{m.totalBroken}</span>}
                      </div>}
                    </div>
                    <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
                      <div style={{textAlign:"center"}}><div style={{fontSize:FS-3,color:T.textMut}}>الرصيد</div><div style={{fontSize:FS+1,fontWeight:800,color:m.currentBal>0?T.ok:m.currentBal<0?T.err:T.textMut}}>{m.currentBal}</div></div>
                      <span style={{color:T.accent,fontSize:FS}}>←</span>
                    </div>
                  </div>;
                })}
              </div>}
          </div>
        </div>;
      }
      /* Detail view: aggregate all orders sharing this modelNo */
      const m=modelMap[itemCard.modelNo];
      if(!m){setItemCard("pick");return null;}
      const ordsList=m.orderIds.map(id=>orders.find(x=>x.id===id)).filter(Boolean);
      /* Build chronological movement log across ALL orders */
      const movements=[];
      ordsList.forEach(o=>{
        (o.deliveries||[]).filter(d=>d.status!=="pending").forEach(d=>{
          const dType=d.type||"series";
          movements.push({date:d.date||"",type:dType==="broken"?"كسر":"رصيد",qty:Number(d.qty)||0,sign:1,note:d.notes||(d.isAdjustment?"تسوية جرد":""),by:d.createdBy||"",order:o.modelNo+(ordsList.length>1?" #"+(o.id||"").slice(-4):"")});
        });
        (o.customerDeliveries||[]).forEach(d=>movements.push({date:d.date||"",type:"بيع",qty:Number(d.qty)||0,sign:-1,note:d.note||(d.isAdjustment?"تسوية جرد":""),by:d.createdBy||"",party:d.custName||"",order:o.modelNo+(ordsList.length>1?" #"+(o.id||"").slice(-4):"")}));
        (o.customerReturns||[]).forEach(r=>movements.push({date:r.date||"",type:"مرتجع",qty:Number(r.qty)||0,sign:1,note:r.note||"",by:r.createdBy||"",party:r.custName||"",order:o.modelNo+(ordsList.length>1?" #"+(o.id||"").slice(-4):"")}));
      });
      movements.sort((a,b)=>(a.date||"").localeCompare(b.date||""));
      let running=0;movements.forEach(mv=>{running+=mv.sign*mv.qty;mv.balance=running});
      const totalRcv=m.totalRcv,totalSold=m.totalSold,totalRet=m.totalRet,currentBal=m.currentBal,totalSeries=m.totalSeries,totalBroken=m.totalBroken;
      const printItemCard=()=>{
        let h="<h2 style='text-align:center;margin:0 0 6px'>📇 كارت صنف</h2>";
        h+="<div style='text-align:center;font-size:14px;font-weight:700;color:#0EA5E9;margin-bottom:14px'>"+(m.modelNo||"—")+(m.orderIds.length>1?" (مدموج من "+m.orderIds.length+" تشغيلات)":"")+"</div>";
        h+="<table style='margin:0 auto 14px;font-size:12px'><tr><th style='padding:4px 12px;text-align:right'>الوصف</th><td style='padding:4px 12px'>"+(m.modelDesc||"—")+"</td></tr></table>";
        h+="<table style='margin:0 auto 16px'><thead><tr>";
        h+="<th>📦 سيري</th><th>🧩 كسر</th><th>إجمالي وارد</th><th>إجمالي مبيعات</th><th>إجمالي مرتجعات</th><th>الرصيد الحالي</th>";
        h+="</tr></thead><tbody><tr style='font-weight:800;font-size:14px;text-align:center'>";
        h+="<td style='color:#0EA5E9'>"+totalSeries+"</td>";
        h+="<td style='color:#8B5CF6'>"+totalBroken+"</td>";
        h+="<td style='color:#0EA5E9'>"+totalRcv+"</td>";
        h+="<td style='color:#EF4444'>"+totalSold+"</td>";
        h+="<td style='color:#10B981'>"+totalRet+"</td>";
        h+="<td style='color:"+(currentBal>0?"#0EA5E9":"#94A3B8")+";background:#FEF3C7'>"+currentBal+"</td>";
        h+="</tr></tbody></table>";
        h+="<h3 style='margin:16px 0 6px'>📋 سجل الحركات ("+movements.length+")</h3>";
        h+="<table><thead><tr><th>التاريخ</th><th>النوع</th><th>الجهة</th><th>الكمية</th><th>الرصيد</th><th>ملاحظة</th></tr></thead><tbody>";
        movements.forEach((mv,i)=>{
          const typeColor=mv.type==="رصيد"?"#0EA5E9":mv.type==="كسر"?"#8B5CF6":mv.type==="بيع"?"#EF4444":"#10B981";
          const typeIcon=mv.type==="رصيد"?"📥":mv.type==="كسر"?"🧩":mv.type==="بيع"?"📤":"↩";
          h+="<tr style='background:"+(i%2===0?"transparent":"#f8f8f8")+"'>";
          h+="<td style='text-align:center;direction:ltr'>"+(mv.date||"—")+"</td>";
          h+="<td style='text-align:center;color:"+typeColor+";font-weight:700'>"+typeIcon+" "+mv.type+"</td>";
          h+="<td>"+(mv.party||"—")+"</td>";
          h+="<td style='text-align:center;font-weight:700;color:"+(mv.sign>0?"#10B981":"#EF4444")+"'>"+(mv.sign>0?"+":"-")+mv.qty+"</td>";
          h+="<td style='text-align:center;font-weight:800'>"+mv.balance+"</td>";
          h+="<td style='font-size:11px;color:#666'>"+(mv.note||"—")+"</td>";
          h+="</tr>";
        });
        h+="</tbody></table>";
        h+="<div class='sig'><div class='sig-box'>أمين المخزن</div><div class='sig-box'>المدير</div></div>";
        printPage("كارت صنف — "+(m.modelNo||""),h,{factoryName:data.factoryName,logo:data.logo});
      };
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:isMob?6:24}} onClick={()=>setItemCard(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:isMob?12:20,width:"100%",maxWidth:780,maxHeight:"92vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          {/* Header */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,gap:8,flexWrap:"wrap"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,flex:1,minWidth:0}}>
              <Btn ghost small onClick={()=>{setItemCard("pick");setItemCardFilter("")}} title="رجوع للقائمة">←</Btn>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:FS+2,fontWeight:800,color:"#0EA5E9",display:"flex",alignItems:"center",gap:6}}>📇 <span>كارت صنف</span></div>
                <div style={{fontSize:FS-1,fontWeight:700,color:T.text,marginTop:2,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                  <span>{m.modelNo||"—"}</span>
                  {m.orderIds.length>1&&<span style={{fontSize:FS-3,padding:"2px 6px",borderRadius:4,background:"#8B5CF615",color:"#8B5CF6",fontWeight:700}} title={"مدموج من "+m.orderIds.length+" تشغيلات"}>⧉ مدموج {m.orderIds.length}</span>}
                </div>
                <div style={{fontSize:FS-2,color:T.textMut,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{m.modelDesc||""}</div>
              </div>
            </div>
            <div style={{display:"flex",gap:6}}>
              <Btn small onClick={printItemCard} style={{background:"#0EA5E912",color:"#0EA5E9",border:"1px solid #0EA5E930"}}>🖨 طباعة</Btn>
              <Btn ghost small onClick={()=>setItemCard(null)}>✕</Btn>
            </div>
          </div>
          {/* Summary cards: 6 cards now (added series + broken) */}
          <div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"repeat(6,1fr)",gap:8,marginBottom:14}}>
            <div style={{padding:"10px 12px",borderRadius:10,background:"#0EA5E908",border:"1px solid #0EA5E920",textAlign:"center"}}><div style={{fontSize:FS-3,color:T.textSec}}>📦 سيري</div><div style={{fontSize:FS+3,fontWeight:800,color:"#0EA5E9"}}>{totalSeries}</div></div>
            <div style={{padding:"10px 12px",borderRadius:10,background:"#8B5CF608",border:"1px solid #8B5CF620",textAlign:"center"}}><div style={{fontSize:FS-3,color:T.textSec}}>🧩 كسر</div><div style={{fontSize:FS+3,fontWeight:800,color:"#8B5CF6"}}>{totalBroken}</div></div>
            <div style={{padding:"10px 12px",borderRadius:10,background:"#0EA5E908",border:"1px solid #0EA5E920",textAlign:"center"}}><div style={{fontSize:FS-3,color:T.textSec}}>📥 إجمالي وارد</div><div style={{fontSize:FS+3,fontWeight:800,color:"#0EA5E9"}}>{totalRcv}</div></div>
            <div style={{padding:"10px 12px",borderRadius:10,background:"#EF444408",border:"1px solid #EF444420",textAlign:"center"}}><div style={{fontSize:FS-3,color:T.textSec}}>📤 مبيعات</div><div style={{fontSize:FS+3,fontWeight:800,color:"#EF4444"}}>{totalSold}</div></div>
            <div style={{padding:"10px 12px",borderRadius:10,background:"#10B98108",border:"1px solid #10B98120",textAlign:"center"}}><div style={{fontSize:FS-3,color:T.textSec}}>↩ مرتجعات</div><div style={{fontSize:FS+3,fontWeight:800,color:"#10B981"}}>{totalRet}</div></div>
            <div style={{padding:"10px 12px",borderRadius:10,background:"#FEF3C7",border:"1px solid #F59E0B40",textAlign:"center"}}><div style={{fontSize:FS-3,color:T.textSec,fontWeight:700}}>📦 الرصيد</div><div style={{fontSize:FS+3,fontWeight:900,color:currentBal>0?"#0EA5E9":currentBal<0?"#EF4444":T.textMut}}>{currentBal}</div></div>
          </div>
          {/* Movements log */}
          <div style={{fontSize:FS-1,fontWeight:800,color:T.text,marginBottom:8,paddingTop:8,borderTop:"1px solid "+T.brd}}>📋 سجل الحركات ({movements.length})</div>
          {movements.length===0?<div style={{textAlign:"center",padding:20,color:T.textMut}}>لا توجد حركات</div>:
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:FS-1}}>
                <thead><tr style={{background:T.bg}}>
                  {["التاريخ","النوع","الجهة","الكمية","الرصيد","ملاحظة"].map(h=><th key={h} style={{...TH,fontSize:FS-2,padding:"6px 8px"}}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {movements.map((mv,i)=>{
                    const typeColor=mv.type==="رصيد"?"#0EA5E9":mv.type==="كسر"?"#8B5CF6":mv.type==="بيع"?"#EF4444":"#10B981";
                    const typeIcon=mv.type==="رصيد"?"📥":mv.type==="كسر"?"🧩":mv.type==="بيع"?"📤":"↩";
                    return<tr key={i} style={{background:i%2===0?"transparent":T.bg+"60"}}>
                      <td style={{...TD,fontSize:FS-2,direction:"ltr",textAlign:"center"}}>{mv.date||"—"}</td>
                      <td style={{...TD,textAlign:"center",fontWeight:700,color:typeColor}}>{typeIcon} {mv.type}</td>
                      <td style={{...TD,fontSize:FS-2}}>{mv.party||"—"}</td>
                      <td style={{...TD,textAlign:"center",fontWeight:800,color:mv.sign>0?T.ok:T.err}}>{mv.sign>0?"+":"-"}{mv.qty}</td>
                      <td style={{...TD,textAlign:"center",fontWeight:800}}>{mv.balance}</td>
                      <td style={{...TD,fontSize:FS-3,color:T.textMut}}>{mv.note||"—"}</td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>}
        </div>
      </div>;
    })()}

    {/* ══ V21.19.0: PRODUCTS + SELL-PRICE EDITOR ══
        كل المنتج الجاهز بالكمية المتاحة + سعر البيع (قابل للتعديل). الحفظ
        يكتب order.sellPrice → بيظهر تلقائياً في المبيعات وتقييم المخزون. */}
    {productsPrice&&(()=>{
      const q=ppSearch.trim().toLowerCase();
      const rows=stockModels
        .filter(m=>(m.avail>0)||(Number(m.sellPrice)||0)>0)
        .filter(m=>!q||((m.modelNo||"")+" "+(m.modelDesc||"")).toLowerCase().includes(q))
        .sort((a,b)=>b.avail-a.avail);
      const savePrice=(m)=>{
        const raw=ppEdits[m.id];
        const v=Number(raw);
        if(raw===undefined||isNaN(v)||v<0){showToast("⛔ سعر غير صالح");return}
        updOrder(m.id,o=>{o.sellPrice=v});
        setPpEdits(p=>{const n={...p};delete n[m.id];return n});
        showToast("✓ تم تسجيل سعر بيع "+(m.modelNo||""));
      };
      const TH={padding:"8px 10px",fontSize:FS-2,fontWeight:800,color:T.textSec,borderBottom:"2px solid "+T.brd,textAlign:"right",whiteSpace:"nowrap"};
      const TD={padding:"6px 10px",fontSize:FS-1,borderBottom:"1px solid "+T.brd};
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:isMob?8:24,overflowY:"auto"}} onClick={e=>{if(e.target===e.currentTarget){setProductsPrice(false);}}}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,width:"100%",maxWidth:820,margin:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{position:"sticky",top:0,background:T.cardSolid,padding:"14px 18px",borderBottom:"1px solid "+T.brd,display:"flex",justifyContent:"space-between",alignItems:"center",zIndex:2,borderRadius:"16px 16px 0 0"}}>
            <div>
              <div style={{fontSize:FS+2,fontWeight:800,color:"#10B981"}}>🏷️ المنتجات وأسعار البيع</div>
              <div style={{fontSize:FS-2,color:T.textMut,marginTop:2}}>السعر اللي تسجّله هنا بيظهر تلقائياً في المبيعات وتقييم المخزون</div>
            </div>
            <Btn ghost small onClick={()=>setProductsPrice(false)}>✕</Btn>
          </div>
          <div style={{padding:isMob?12:18}}>
            <div style={{marginBottom:10,maxWidth:340}}><Inp value={ppSearch} onChange={setPpSearch} placeholder="🔎 ابحث بالموديل أو الوصف..."/></div>
            <div style={{overflowX:"auto",border:"1px solid "+T.brd,borderRadius:10}}>
              <table style={{width:"100%",borderCollapse:"collapse",minWidth:520}}>
                <thead><tr style={{background:T.bg}}>
                  <th style={TH}>الموديل</th>
                  <th style={{...TH,textAlign:"center",width:90}}>المتاح</th>
                  <th style={{...TH,textAlign:"center",width:140}}>سعر البيع</th>
                  <th style={{...TH,textAlign:"center",width:80}}></th>
                </tr></thead>
                <tbody>
                  {rows.length===0?<tr><td colSpan={4} style={{...TD,textAlign:"center",color:T.textMut,padding:24}}>لا توجد منتجات</td></tr>
                  :rows.map(m=>{
                    const cur=ppEdits[m.id]!==undefined?ppEdits[m.id]:String(Number(m.sellPrice)||0);
                    const changed=ppEdits[m.id]!==undefined&&Number(ppEdits[m.id])!==(Number(m.sellPrice)||0);
                    return<tr key={m.id}>
                      <td style={TD}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          {m.image?<img src={m.image} alt="" style={{width:34,height:34,borderRadius:6,objectFit:"cover",flexShrink:0}}/>:null}
                          <div><div style={{fontWeight:700,color:T.text}}>{m.modelNo||"—"}</div>{m.modelDesc?<div style={{fontSize:FS-3,color:T.textMut}}>{m.modelDesc}</div>:null}</div>
                        </div>
                      </td>
                      <td style={{...TD,textAlign:"center",fontWeight:700,color:m.avail>0?T.text:T.textMut}}>{fmt(m.avail||0)}</td>
                      <td style={{...TD,textAlign:"center"}}>
                        <input type="number" value={cur} disabled={!canEdit} onChange={e=>setPpEdits(p=>({...p,[m.id]:e.target.value}))}
                          onKeyDown={e=>{if(e.key==="Enter"&&changed)savePrice(m)}}
                          style={{width:110,padding:"6px 8px",border:"2px solid "+(changed?"#10B981":T.brd),borderRadius:8,fontSize:FS,fontFamily:"inherit",textAlign:"center",background:T.cardSolid,color:T.text,outline:"none"}}/>
                      </td>
                      <td style={{...TD,textAlign:"center"}}>
                        {canEdit?<Btn small onClick={()=>savePrice(m)} disabled={!changed} style={{background:changed?"#10B981":T.bg,color:changed?"#fff":T.textMut,border:"none",padding:"5px 10px"}}>💾 حفظ</Btn>:<span style={{fontSize:FS-3,color:T.textMut}}>—</span>}
                      </td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
            <div style={{fontSize:FS-3,color:T.textMut,marginTop:8}}>* «المتاح» = الرصيد المتاح في المخزن (سيري + كسر). السعر بيتطبّق على الموديل كله.</div>
          </div>
        </div>
      </div>;
    })()}

    {/* ══ V14.59: RECEIPT LOG POPUP — all historical receipts ══ */}
    {showReceiptLog&&(()=>{
      /* Build log: all confirmed deliveries grouped by date */
      const allConfirmed=[];
      orders.forEach(o=>{(o.deliveries||[]).forEach(d=>{
        if(d.confirmedAt){
          allConfirmed.push({
            orderId:o.id,modelNo:o.modelNo,modelDesc:o.modelDesc||"",
            qty:Number(d.confirmedQty||d.qty)||0,
            originalQty:Number(d.qty)||0,
            date:d.date||"",
            confirmedAt:d.confirmedAt,
            confirmedBy:d.confirmedBy||"",
            createdBy:d.createdBy||"",
            notes:d.notes||""
          });
        }
      })});
      allConfirmed.sort((a,b)=>(b.confirmedAt||"").localeCompare(a.confirmedAt||""));
      /* Group by model for totals */
      const modelTotals={};
      allConfirmed.forEach(r=>{
        if(!modelTotals[r.orderId])modelTotals[r.orderId]={modelNo:r.modelNo,modelDesc:r.modelDesc,totalDelivered:0,totalConfirmed:0,count:0};
        modelTotals[r.orderId].totalConfirmed+=r.qty;
        modelTotals[r.orderId].totalDelivered+=r.originalQty;
        modelTotals[r.orderId].count++;
      });
      const sortedModels=Object.values(modelTotals).sort((a,b)=>b.totalConfirmed-a.totalConfirmed);
      /* Print full log */
      const printLog=()=>{
        let summRows="";
        sortedModels.forEach(m=>{
          const diff=m.totalConfirmed-m.totalDelivered;
          summRows+="<tr><td style='border:1px solid #ccc;padding:6px;font-weight:800;color:#0284C7'>"+m.modelNo+"</td><td style='border:1px solid #ccc;padding:6px;font-size:10px;color:#555'>"+m.modelDesc+"</td><td style='border:1px solid #ccc;padding:6px;text-align:center;font-weight:700;color:#F59E0B'>"+m.totalDelivered+"</td><td style='border:1px solid #ccc;padding:6px;text-align:center;font-weight:800;color:#10B981'>"+m.totalConfirmed+"</td><td style='border:1px solid #ccc;padding:6px;text-align:center;font-weight:800;color:"+(diff===0?"#10B981":diff<0?"#EF4444":"#0EA5E9")+"'>"+(diff===0?"✓":(diff>0?"+":"")+diff)+"</td><td style='border:1px solid #ccc;padding:6px;text-align:center;color:#666'>"+m.count+"</td></tr>";
        });
        let detRows="";
        allConfirmed.forEach(r=>{
          const dStr=new Date(r.confirmedAt).toLocaleString("ar-EG");
          const diff=r.qty-r.originalQty;
          detRows+="<tr><td style='border:1px solid #eee;padding:5px;font-size:9px'>"+dStr+"</td><td style='border:1px solid #eee;padding:5px;font-weight:700;color:#0284C7'>"+r.modelNo+"</td><td style='border:1px solid #eee;padding:5px;font-size:9px;color:#555'>"+r.modelDesc+"</td><td style='border:1px solid #eee;padding:5px;text-align:center;font-weight:700;color:#F59E0B'>"+r.originalQty+"</td><td style='border:1px solid #eee;padding:5px;text-align:center;font-weight:700;color:#10B981'>"+r.qty+"</td><td style='border:1px solid #eee;padding:5px;text-align:center;font-weight:700;color:"+(diff===0?"#10B981":diff<0?"#EF4444":"#0EA5E9")+"'>"+(diff===0?"✓":(diff>0?"+":"")+diff)+"</td><td style='border:1px solid #eee;padding:5px;font-size:9px;color:#666'>"+(r.confirmedBy||"—")+"</td></tr>";
        });
        const html="<html dir='rtl'><head><meta charset='utf-8'><title>سجل الاستلامات</title><link href='https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;800&display=swap' rel='stylesheet'/><style>@page{size:A4;margin:12mm}body{font-family:'Cairo',sans-serif;color:#1E293B;font-size:11px;line-height:1.6}.hdr{text-align:center;border-bottom:3px solid #10B981;padding-bottom:10px;margin-bottom:14px}.hdr h1{color:#10B981;font-size:20px}table{width:100%;border-collapse:collapse;margin:10px 0;font-size:11px}th{background:#F0FDF4;border:1px solid #10B98140;padding:7px;font-weight:800;text-align:right;color:#059669}.detail th{background:#EFF6FF;border:1px solid #0EA5E940;padding:5px;font-size:10px}h2{color:#0284C7;font-size:14px;margin:14px 0 8px;padding-bottom:4px;border-bottom:2px solid #0284C730}.foot{margin-top:20px;padding-top:10px;border-top:1px solid #ccc;text-align:center;font-size:10px;color:#94A3B8}.pbar{position:sticky;top:0;background:#fff;padding:8px;border-bottom:2px solid #ccc;display:flex;justify-content:center;gap:10px}.pbar button{padding:6px 16px;border-radius:6px;border:1px solid #000;cursor:pointer;font-family:'Cairo';font-size:12px;font-weight:700;background:#fff}.pbar .pr{background:#10B981;color:#fff;border-color:#10B981}@media print{.pbar{display:none}}</style></head><body><div class='pbar'><button onclick='window.close()'>↩ رجوع</button><button class='pr' onclick='window.print()'>🖨 طباعة</button></div><div class='hdr'><h1>📦 سجل الاستلامات الكامل</h1><div style='font-size:12px;color:#666'>"+new Date().toLocaleDateString("ar-EG")+" — "+sortedModels.length+" موديل • "+allConfirmed.length+" استلام</div></div><h2>📊 الإجماليات لكل موديل</h2><table><thead><tr><th>الموديل</th><th>الوصف</th><th style='text-align:center'>تسليم</th><th style='text-align:center'>تسليم مخزن جاهز</th><th style='text-align:center'>الفرق</th><th style='text-align:center'>عدد مرات</th></tr></thead><tbody>"+summRows+"</tbody></table><h2>📋 التفاصيل (بالتاريخ)</h2><table class='detail'><thead><tr><th>التاريخ</th><th>الموديل</th><th>الوصف</th><th style='text-align:center'>تسليم</th><th style='text-align:center'>تسليم مخزن جاهز</th><th style='text-align:center'>فرق</th><th>بواسطة</th></tr></thead><tbody>"+detRows+"</tbody></table><div class='foot'>CLARK ERP System — سجل الاستلامات — "+new Date().toLocaleString("ar-EG")+"</div></body></html>";
        const pw=openPrintWindow();if(!pw){tell("المتصفح يمنع الطباعة","فعّل النوافذ المنبثقة وحاول مرة أخرى",{danger:true});return}pw.document.write(html);pw.document.close();setTimeout(()=>{try{pw.print()}catch(e){}},500);
      };
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:10001,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowReceiptLog(false)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:20,width:"100%",maxWidth:isMob?"100%":900,maxHeight:"92vh",display:"flex",flexDirection:"column",border:"2px solid #10B981",boxShadow:"0 25px 70px rgba(0,0,0,0.45)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,paddingBottom:10,borderBottom:"2px solid #10B98125"}}>
            <div style={{fontSize:FS+2,fontWeight:900,color:"#10B981",display:"flex",alignItems:"center",gap:8}}>
              <span>📋</span><span>سجل الاستلامات</span>
            </div>
            <div style={{display:"flex",gap:8}}>
              <Btn small onClick={printLog} disabled={allConfirmed.length===0} style={{background:"#10B98112",color:"#10B981",border:"1px solid #10B98130",fontWeight:700}}>🖨 طباعة السجل</Btn>
              <span onClick={()=>setShowReceiptLog(false)} style={{cursor:"pointer",fontSize:22,color:T.textMut,padding:4}}>✕</span>
            </div>
          </div>
          {allConfirmed.length===0?<div style={{padding:40,textAlign:"center",color:T.textMut,fontSize:FS}}>لا توجد استلامات مؤكدة حتى الآن</div>:
            <div style={{flex:1,overflowY:"auto"}}>
              {/* Model totals */}
              <div style={{fontSize:FS,fontWeight:800,color:T.accent,marginBottom:8,padding:"6px 10px",borderRadius:8,background:T.accent+"08"}}>📊 الإجماليات لكل موديل ({sortedModels.length})</div>
              <div style={{overflowX:"auto",marginBottom:16}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:FS-2}}><thead><tr style={{background:"#10B98108"}}>{["الموديل","الوصف","تسليم","تسليم مخزن جاهز","الفرق","مرات"].map(h=><th key={h} style={{padding:"6px",textAlign:h==="الموديل"||h==="الوصف"?"right":"center",fontWeight:800,color:T.textSec,borderBottom:"2px solid #10B98130"}}>{h}</th>)}</tr></thead>
                <tbody>{sortedModels.map(m=>{const diff=m.totalConfirmed-m.totalDelivered;
                  return<tr key={m.modelNo} style={{borderBottom:"1px solid "+T.brd}}>
                    <td style={{padding:"6px",fontWeight:800,color:T.accent}}>{m.modelNo}</td>
                    <td style={{padding:"6px",color:T.textMut}}>{m.modelDesc}</td>
                    <td style={{padding:"6px",textAlign:"center",fontWeight:700,color:"#F59E0B"}}>{m.totalDelivered}</td>
                    <td style={{padding:"6px",textAlign:"center",fontWeight:800,color:"#10B981"}}>{m.totalConfirmed}</td>
                    <td style={{padding:"6px",textAlign:"center",fontWeight:800,color:diff===0?T.ok:diff<0?T.err:"#0EA5E9"}}>{diff===0?"✓":(diff>0?"+":"")+diff}</td>
                    <td style={{padding:"6px",textAlign:"center",color:T.textMut}}>{m.count}</td>
                  </tr>})}</tbody></table>
              </div>
              {/* Details */}
              <div style={{fontSize:FS,fontWeight:800,color:"#0EA5E9",marginBottom:8,padding:"6px 10px",borderRadius:8,background:"#0EA5E908"}}>📋 التفاصيل ({allConfirmed.length} استلام)</div>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:FS-2}}><thead><tr style={{background:"#0EA5E908"}}>{["التاريخ","الموديل","تسليم","تسليم مخزن جاهز","فرق","بواسطة"].map(h=><th key={h} style={{padding:"6px",textAlign:h==="الموديل"?"right":"center",fontWeight:800,color:T.textSec,borderBottom:"2px solid #0EA5E930"}}>{h}</th>)}</tr></thead>
                <tbody>{allConfirmed.slice(0,100).map((r,i)=>{const diff=r.qty-r.originalQty;
                  return<tr key={i} style={{borderBottom:"1px solid "+T.brd,background:i%2===1?T.bg:"transparent"}}>
                    <td style={{padding:"5px",fontSize:FS-3,color:T.textMut,textAlign:"center",whiteSpace:"nowrap"}}>{new Date(r.confirmedAt).toLocaleString("ar-EG",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"})}</td>
                    <td style={{padding:"5px",fontWeight:700,color:T.accent}}>{r.modelNo}</td>
                    <td style={{padding:"5px",textAlign:"center",fontWeight:700,color:"#F59E0B"}}>{r.originalQty}</td>
                    <td style={{padding:"5px",textAlign:"center",fontWeight:800,color:"#10B981"}}>{r.qty}</td>
                    <td style={{padding:"5px",textAlign:"center",fontWeight:700,color:diff===0?T.ok:diff<0?T.err:"#0EA5E9"}}>{diff===0?"✓":(diff>0?"+":"")+diff}</td>
                    <td style={{padding:"5px",fontSize:FS-3,color:T.textMut}}>{r.confirmedBy||"—"}</td>
                  </tr>})}</tbody></table>
                {allConfirmed.length>100&&<div style={{padding:8,textAlign:"center",fontSize:FS-2,color:T.textMut}}>يظهر أحدث 100 استلام — اضغط "🖨 طباعة السجل" للسجل الكامل</div>}
              </div>
            </div>}
        </div>
      </div>;
    })()}

    {balReview&&(()=>{
      const rows=orders.filter(o=>{const t=calcOrder(o);return t.cutQty>0}).map(o=>{
        const t=calcOrder(o);const wds=o.workshopDeliveries||[];
        const fromWs=wds.reduce((s,wd)=>s+(wd.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0),0);
        const toStock=getConfirmedStock(o);
        const sold=(o.customerDeliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);
        const ret=(o.customerReturns||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);
        const avail=toStock-(sold-ret);const gap=fromWs-toStock;
        let status="";if(toStock===0&&fromWs>0)status="لم يسجّل استلام";
        else if(gap>0)status="فرق "+gap;
        else if(avail<0)status="رصيد سالب!";
        else status="✅";
        return{id:o.id,no:o.modelNo,desc:o.modelDesc||"",cut:t.cutQty,fromWs,toStock,sold,ret,avail,gap,status}}).sort((a,b)=>b.gap-a.gap);
      const issues=rows.filter(r=>r.status!=="✅");
      const printRev=()=>{let h="<h2 style='text-align:center'>📊 مراجعة أرصدة المخزن</h2>";
        h+="<div style='text-align:center;margin-bottom:12px'><span style='color:#EF4444;font-weight:800'>"+issues.length+" موديل يحتاج مراجعة</span> من "+rows.length+"</div>";
        h+="<table><thead><tr><th>الموديل</th><th>الوصف</th><th>القص</th><th>من الورش</th><th>المخزن</th><th>مباع</th><th>مرتجع</th><th>رصيد</th><th>فرق</th><th>الحالة</th></tr></thead><tbody>";
        rows.forEach(r=>{const isErr=r.status!=="✅";h+="<tr style='background:"+(isErr?"#FEF2F2":"transparent")+"'><td style='font-weight:800'>"+r.no+"</td><td style='font-size:10px'>"+r.desc+"</td><td style='text-align:center'>"+r.cut+"</td><td style='text-align:center'>"+r.fromWs+"</td><td style='text-align:center;font-weight:800;color:#0EA5E9'>"+r.toStock+"</td><td style='text-align:center'>"+r.sold+"</td><td style='text-align:center;color:#EF4444'>"+(r.ret||"-")+"</td><td style='text-align:center;font-weight:800;color:"+(r.avail>=0?"#10B981":"#EF4444")+"'>"+r.avail+"</td><td style='text-align:center;font-weight:800;color:"+(r.gap>0?"#F59E0B":"#10B981")+"'>"+(r.gap||"-")+"</td><td style='font-weight:700;color:"+(isErr?"#EF4444":"#10B981")+"'>"+r.status+"</td></tr>"});
        h+="</tbody></table>";printPage("مراجعة أرصدة المخزن",h)};
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:isMob?8:16}} onClick={()=>setBalReview(false)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:isMob?16:24,width:"100%",maxWidth:isMob?"100%":900,maxHeight:"90vh",overflowY:"auto",border:"1px solid "+T.brd}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:FS+2,fontWeight:800,color:"#EC4899"}}>{"📊 مراجعة الأرصدة ("+rows.length+" موديل)"}</div>
            <div style={{display:"flex",gap:4}}><Btn small onClick={printRev} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>🖨</Btn><Btn ghost small onClick={()=>setBalReview(false)}>✕</Btn></div>
          </div>
          {issues.length>0&&<div style={{padding:10,borderRadius:10,background:"#FEF2F2",border:"1px solid #FECACA",marginBottom:12,fontWeight:700,color:"#EF4444"}}>{"⚠️ "+issues.length+" موديل يحتاج مراجعة"}</div>}
          <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",whiteSpace:"nowrap"}}><thead><tr>{["الموديل","الوصف","القص","من الورش","مخزن جاهز","مباع","مرتجع","رصيد متاح","فرق","الحالة"].map(h=><th key={h} style={{...TH,fontSize:FS-2}}>{h}</th>)}</tr></thead><tbody>
            {rows.map((r,i)=>{const isErr=r.status!=="✅";return<tr key={r.id} style={{background:isErr?"#FEF2F2":i%2===0?"transparent":T.bg+"80"}}>
              <td style={{...TD,fontWeight:800,color:T.accent}}>{r.no}</td>
              <td style={{...TD,fontSize:FS-3,color:T.textMut,maxWidth:120,overflow:"hidden",textOverflow:"ellipsis"}}>{r.desc}</td>
              <td style={{...TDB}}>{r.cut}</td>
              <td style={{...TDB,color:"#8B5CF6"}}>{r.fromWs}</td>
              <td style={{...TDB,fontWeight:800,color:"#0EA5E9"}}>{r.toStock}</td>
              <td style={{...TDB}}>{r.sold}</td>
              <td style={{...TDB,color:r.ret?"#EF4444":T.textMut}}>{r.ret||"—"}</td>
              <td style={{...TDB,fontWeight:800,color:r.avail>=0?"#10B981":"#EF4444"}}>{r.avail}</td>
              <td style={{...TDB,fontWeight:800,color:r.gap>0?"#F59E0B":"#10B981"}}>{r.gap||"—"}</td>
              <td style={{...TD,fontWeight:700,fontSize:FS-2,color:isErr?"#EF4444":"#10B981"}}>{r.status}</td>
            </tr>})}
          </tbody></table></div>
          <div style={{marginTop:12,padding:10,borderRadius:10,background:T.bg,fontSize:FS-2,color:T.textSec}}>
            <div><b>من الورش</b> = اجمالي الاستلام من الورش (تشطيب)</div>
            <div><b>مخزن جاهز</b> = المسجّل كاستلام في المخزن (deliveries)</div>
            <div><b>الفرق</b> = من الورش − مخزن جاهز (لو موجب = فيه كمية لم تسجّل)</div>
            <div><b>رصيد متاح</b> = مخزن جاهز − مباع + مرتجع</div>
          </div>
        </div></div>})()}

    {/* ═══════════════════════════════════════════════════════════════
        V18.63: DELIVERY-NOTE POPUP (إذن تسليم — كميات فقط بدون أسعار)
        ───────────────────────────────────────────────────────────────
        Same 3-step flow as the quote popup:
          1. Pick a session (last 10 by default + "عرض المزيد")
          2. Pick a customer from that session (with name filter)
          3. Print a delivery note showing QUANTITIES ONLY — no prices.
        Mirrors the row-level delivery-note button on each session row,
        but reachable from the top-level Sales menu without scrolling
        through the active session.
        ═══════════════════════════════════════════════════════════════ */}
    {deliverNote&&(()=>{
      if(deliverNote==="pickSess"){
        const allValidSessions=sessions
          .filter(s=>Object.values(s.grid||{}).some(v=>Number(v)>0))
          .slice()
          .sort((a,b)=>(b.date||"").localeCompare(a.date||""));
        const sessToShow=showAllSessDeliver?allValidSessions:allValidSessions.slice(0,10);
        const hasMore=allValidSessions.length>sessToShow.length;
        return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:isMob?8:16}} onClick={()=>setDeliverNote(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:isMob?16:24,width:"100%",maxWidth:500,maxHeight:"85vh",overflowY:"auto",border:"1px solid "+T.brd}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontSize:FS+2,fontWeight:800,color:"#0EA5E9"}}>🚚 إذن تسليم — اختر التوزيعة</div>
              <Btn ghost small onClick={()=>setDeliverNote(null)}>✕</Btn>
            </div>
            {!showAllSessDeliver&&allValidSessions.length>10&&<div style={{fontSize:FS-2,color:T.textMut,marginBottom:8,padding:"4px 0"}}>
              عرض آخر 10 توزيعات من إجمالي {allValidSessions.length}
            </div>}
            {sessToShow.map(s=>{const total=Object.values(s.grid||{}).reduce((sum,v)=>sum+(Number(v)||0),0);const custCount=s.custIds.length;
              return<div key={s.id} onClick={()=>setDeliverNote({sessId:s.id,custFilter:""})} style={{padding:"10px 14px",borderRadius:10,border:"1px solid "+T.brd,marginBottom:6,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}} onMouseEnter={e=>e.currentTarget.style.background="#0EA5E906"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <div><div style={{fontWeight:700}}>{"📦 "+s.date}</div><div style={{fontSize:FS-2,color:T.textMut}}>{custCount+" عميل | "+fmt(total)+" قطعة"}</div></div>
                <div style={{fontWeight:800,color:"#0EA5E9"}}>{s.status==="تم التسليم"?"🔒":""}</div>
              </div>})}
            {hasMore&&<div style={{textAlign:"center",marginTop:10,paddingTop:10,borderTop:"1px solid "+T.brd}}>
              <Btn onClick={()=>setShowAllSessDeliver(true)} style={{background:"#0EA5E912",color:"#0EA5E9",border:"1px solid #0EA5E940",fontWeight:700}}>
                ⬇ عرض المزيد ({allValidSessions.length-sessToShow.length} توزيعة)
              </Btn>
            </div>}
            {sessToShow.length===0&&<div style={{textAlign:"center",padding:24,color:T.textMut}}>لا توجد توزيعات</div>}
          </div></div>;
      }
      /* Customer picker — sessId set, custId not */
      if(deliverNote?.sessId&&!deliverNote.custId){
        const sess=sessions.find(s=>s.id===deliverNote.sessId);if(!sess)return null;
        /* Only customers in this session who actually received >0 pieces */
        const sessCusts=sess.custIds
          .map(id=>customers.find(c=>c.id===id))
          .filter(Boolean)
          .map(c=>{
            const total=sess.modelIds.reduce((s,mid)=>s+(Number((sess.grid||{})[mid+"_"+c.id])||0),0);
            return{...c,_total:total};
          })
          .filter(c=>c._total>0);
        const filter=(deliverNote.custFilter||"").trim().toLowerCase();
        const filtered=filter
          ?sessCusts.filter(c=>(c.name||"").toLowerCase().includes(filter)||(c.phone||"").includes(filter))
          :sessCusts;
        return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:isMob?8:16}} onClick={()=>setDeliverNote(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:isMob?16:24,width:"100%",maxWidth:500,maxHeight:"85vh",overflowY:"auto",border:"1px solid "+T.brd}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontSize:FS+2,fontWeight:800,color:"#0EA5E9"}}>{"🚚 إذن تسليم — "+sess.date+" — اختر العميل"}</div>
              <div style={{display:"flex",gap:4}}><Btn ghost small onClick={()=>setDeliverNote("pickSess")}>← التوزيعات</Btn><Btn ghost small onClick={()=>setDeliverNote(null)}>✕</Btn></div>
            </div>
            <div style={{marginBottom:10}}>
              <Inp value={deliverNote.custFilter||""} onChange={v=>setDeliverNote({...deliverNote,custFilter:v})} placeholder="🔍 ابحث بالاسم أو التليفون..."/>
            </div>
            {filtered.length===0?<div style={{textAlign:"center",padding:24,color:T.textMut}}>{filter?"لا توجد نتائج":"لا يوجد عملاء في هذه التوزيعة"}</div>
            :filtered.map(c=>{
              return<div key={c.id} onClick={()=>setDeliverNote({sessId:deliverNote.sessId,custId:c.id})} style={{padding:"10px 14px",borderRadius:10,border:"1px solid "+T.brd,marginBottom:6,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}} onMouseEnter={e=>e.currentTarget.style.background="#0EA5E906"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <div><div style={{fontWeight:700}}>{c.name}</div><div style={{fontSize:FS-2,color:T.textMut}}>{c.type||"مكتب"}{c.phone?" | "+c.phone:""}</div></div>
                <div style={{fontWeight:800,color:"#0EA5E9"}}>{fmt(c._total)+" قطعة"}</div>
              </div>;
            })}
          </div></div>;
      }
      /* Render the delivery note (quantities only) */
      const dSessId=deliverNote?.sessId;const dCustId=deliverNote?.custId;
      const cust=customers.find(c=>c.id===dCustId);if(!cust)return null;
      const dSess=sessions.find(s=>s.id===dSessId);if(!dSess)return null;
      const rows=[];let totalQty=0;
      dSess.modelIds.forEach(mid=>{
        const qty=Number((dSess.grid||{})[mid+"_"+dCustId])||0;
        if(qty<=0)return;
        const o=orders.find(x=>x.id===mid);
        rows.push({no:o?.modelNo||"?",desc:o?.modelDesc||"",qty});
        totalQty+=qty;
      });
      const printDeliveryNote=()=>{
        let h="<h2 style='text-align:center;margin:0 0 12px'>🚚 إذن تسليم عميل</h2>";
        h+="<table style='margin:0 auto 14px;border-collapse:collapse'>"
          +"<tr><th style='text-align:right;padding:4px 12px;background:#F1F5F9'>العميل</th><td style='padding:4px 12px;font-weight:800'>"+cust.name+"</td>"
          +"<th style='text-align:right;padding:4px 12px;background:#F1F5F9'>التليفون</th><td style='padding:4px 12px'>"+(cust.phone?ltrPhone(cust.phone):"—")+"</td></tr>"
          +"<tr><th style='text-align:right;padding:4px 12px;background:#F1F5F9'>التاريخ</th><td style='padding:4px 12px'>"+dSess.date+"</td>"
          +"<th style='text-align:right;padding:4px 12px;background:#F1F5F9'>العنوان</th><td style='padding:4px 12px'>"+(cust.address||"—")+"</td></tr>"
          +"</table>";
        h+="<h3 style='margin:12px 0 6px'>تفاصيل الاستلام</h3>";
        h+="<table style='width:100%;border-collapse:collapse'><thead><tr style='background:#F1F5F9'>"
          +"<th style='padding:6px 8px;border:1px solid #CBD5E1'>الموديل</th>"
          +"<th style='padding:6px 8px;border:1px solid #CBD5E1'>الوصف</th>"
          +"<th style='padding:6px 8px;border:1px solid #CBD5E1'>الكمية</th>"
          +"</tr></thead><tbody>";
        rows.forEach(r=>{
          h+="<tr><td style='padding:6px 8px;border:1px solid #CBD5E1;font-weight:800;text-align:center'>"+r.no+"</td>"
            +"<td style='padding:6px 8px;border:1px solid #CBD5E1'>"+r.desc+"</td>"
            +"<td style='padding:6px 8px;border:1px solid #CBD5E1;text-align:center;font-weight:800;color:#0284C7;font-size:15px'>"+r.qty+"</td></tr>";
        });
        h+="<tr style='background:#F1F5F9'>"
          +"<td colspan='2' style='padding:8px;border:1px solid #CBD5E1;font-weight:800;text-align:right'>إجمالي القطع</td>"
          +"<td style='padding:8px;border:1px solid #CBD5E1;font-weight:900;color:#0284C7;font-size:17px;text-align:center'>"+totalQty+"</td>"
          +"</tr></tbody></table>";
        h+="<div style='margin-top:14px;padding:10px 14px;border:1px dashed #94A3B8;border-radius:8px;font-size:12px;color:#475569;text-align:center'>"
          +"📋 إذن تسليم بالكميات فقط — للحساب راجع كشف الحساب أو عرض السعر"
          +"</div>";
        h+="<div class='sig'><div class='sig-box'>مسؤول التسليم</div><div class='sig-box'>توقيع العميل<br/>"+cust.name+"</div></div>";
        printPage("إذن تسليم — "+cust.name,h,{factoryName:config.factoryName,logo:config.logo});
      };
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:isMob?8:16}} onClick={()=>setDeliverNote(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:isMob?16:24,width:"100%",maxWidth:600,maxHeight:"90vh",overflowY:"auto",border:"1px solid "+T.brd}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,gap:8,flexWrap:"wrap"}}>
            <div>
              <div style={{fontSize:FS+2,fontWeight:800,color:"#0EA5E9"}}>{"🚚 إذن تسليم — "+cust.name}</div>
              <div style={{fontSize:FS-2,color:T.textMut}}>{(cust.phone?ltrPhone(cust.phone):"")+(cust.type?" | "+cust.type:"")+" | 📅 "+dSess.date}</div>
            </div>
            <div style={{display:"flex",gap:4}}>
              <Btn small onClick={printDeliveryNote} style={{background:"#0EA5E912",color:"#0EA5E9",border:"1px solid #0EA5E940",fontWeight:700}}>🖨 طباعة</Btn>
              <Btn ghost small onClick={()=>setDeliverNote({sessId:deliverNote.sessId,custFilter:""})}>← العملاء</Btn>
              <Btn ghost small onClick={()=>setDeliverNote(null)}>✕</Btn>
            </div>
          </div>
          <div style={{padding:10,borderRadius:8,background:"#0EA5E908",border:"1px solid #0EA5E930",marginBottom:10,fontSize:FS-2,color:"#0369A1",fontWeight:600}}>
            ℹ️ هذا الإذن بالكميات فقط — بدون أسعار. للأسعار استخدم زرار "عرض سعر"
          </div>
          {rows.length>0?<div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr>{["الموديل","الوصف","الكمية"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((r,i)=><tr key={i} style={{background:i%2===0?"transparent":T.bg+"80"}}>
                  <td style={{...TD,fontWeight:800,textAlign:"center"}}>{r.no}</td>
                  <td style={{...TD,fontSize:FS-2}}>{r.desc}</td>
                  <td style={{...TDB,fontWeight:800,fontSize:FS+2,color:"#0284C7"}}>{r.qty}</td>
                </tr>)}
                <tr style={{background:"#0EA5E908"}}>
                  <td colSpan={2} style={{...TD,fontWeight:800,textAlign:"right"}}>إجمالي القطع</td>
                  <td style={{...TDB,fontWeight:900,fontSize:FS+4,color:"#0284C7"}}>{totalQty}</td>
                </tr>
              </tbody>
            </table>
          </div>:<div style={{textAlign:"center",padding:20,color:T.textMut}}>لا توجد كميات لهذا العميل في هذه التوزيعة</div>}
        </div>
      </div>;
    })()}

    {quoteCust&&(()=>{
      if(quoteCust==="pickSess"){
        /* V18.63: Show last 10 sessions only by default; "عرض المزيد" reveals all.
           Sessions are sorted by date descending (newest first). */
        const allValidSessions=sessions
          .filter(s=>Object.values(s.grid||{}).some(v=>Number(v)>0))
          .slice()
          .sort((a,b)=>(b.date||"").localeCompare(a.date||""));
        const sessToShow=showAllSessQuote?allValidSessions:allValidSessions.slice(0,10);
        const hasMore=allValidSessions.length>sessToShow.length;
        return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:isMob?8:16}} onClick={()=>setQuoteCust(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:isMob?16:24,width:"100%",maxWidth:500,maxHeight:"85vh",overflowY:"auto",border:"1px solid "+T.brd}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontSize:FS+2,fontWeight:800,color:"#8B5CF6"}}>🧾 عرض سعر — اختر التوزيعة</div>
              <Btn ghost small onClick={()=>setQuoteCust(null)}>✕</Btn>
            </div>
            {!showAllSessQuote&&allValidSessions.length>10&&<div style={{fontSize:FS-2,color:T.textMut,marginBottom:8,padding:"4px 0"}}>
              عرض آخر 10 توزيعات من إجمالي {allValidSessions.length}
            </div>}
            {sessToShow.map(s=>{const total=Object.values(s.grid||{}).reduce((sum,v)=>sum+(Number(v)||0),0);const custCount=s.custIds.length;
              return<div key={s.id} onClick={()=>setQuoteCust({sessId:s.id})} style={{padding:"10px 14px",borderRadius:10,border:"1px solid "+T.brd,marginBottom:6,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}} onMouseEnter={e=>e.currentTarget.style.background="#8B5CF606"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <div><div style={{fontWeight:700}}>{"📦 "+s.date}</div><div style={{fontSize:FS-2,color:T.textMut}}>{custCount+" عميل | "+fmt(total)+" قطعة"}</div></div>
                <div style={{fontWeight:800,color:"#8B5CF6"}}>{s.status==="تم التسليم"?"🔒":""}</div>
              </div>})}
            {hasMore&&<div style={{textAlign:"center",marginTop:10,paddingTop:10,borderTop:"1px solid "+T.brd}}>
              <Btn onClick={()=>setShowAllSessQuote(true)} style={{background:"#8B5CF612",color:"#8B5CF6",border:"1px solid #8B5CF640",fontWeight:700}}>
                ⬇ عرض المزيد ({allValidSessions.length-sessToShow.length} توزيعة)
              </Btn>
            </div>}
            {sessToShow.length===0&&<div style={{textAlign:"center",padding:24,color:T.textMut}}>لا توجد توزيعات</div>}
          </div></div>}
      if(quoteCust?.sessId&&!quoteCust.custId){const sess=sessions.find(s=>s.id===quoteCust.sessId);if(!sess)return null;
        const sessCusts=sess.custIds.map(id=>customers.find(c=>c.id===id)).filter(Boolean);
        return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:isMob?8:16}} onClick={()=>setQuoteCust(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:isMob?16:24,width:"100%",maxWidth:500,maxHeight:"85vh",overflowY:"auto",border:"1px solid "+T.brd}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontSize:FS+2,fontWeight:800,color:"#8B5CF6"}}>{"🧾 عرض سعر — "+sess.date+" — اختر عميل"}</div>
              <div style={{display:"flex",gap:4}}><Btn ghost small onClick={()=>setQuoteCust("pickSess")}>← التوزيعات</Btn><Btn ghost small onClick={()=>setQuoteCust(null)}>✕</Btn></div>
            </div>
            {sessCusts.map(c=>{const custTotal=sess.modelIds.reduce((s,mid)=>s+(Number((sess.grid||{})[mid+"_"+c.id])||0),0);
              return<div key={c.id} onClick={()=>setQuoteCust({sessId:quoteCust.sessId,custId:c.id})} style={{padding:"10px 14px",borderRadius:10,border:"1px solid "+T.brd,marginBottom:6,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}} onMouseEnter={e=>e.currentTarget.style.background="#8B5CF606"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <div><div style={{fontWeight:700}}>{c.name}</div><div style={{fontSize:FS-2,color:T.textMut}}>{c.type||"مكتب"}{c.phone?" | "+c.phone:""}</div></div>
                <div style={{fontWeight:800,color:"#8B5CF6"}}>{fmt(custTotal)+" قطعة"}</div>
              </div>})}
          </div></div>}
      const qSessId=quoteCust?.sessId;const qCustId=quoteCust?.custId;
      const cust=customers.find(c=>c.id===qCustId);if(!cust)return null;
      const qSess=sessions.find(s=>s.id===qSessId);
      const rows=[];let grandTotal=0;let missingPrice=false;
      if(qSess){/* Use session grid */
        qSess.modelIds.forEach(mid=>{const qty=Number((qSess.grid||{})[mid+"_"+qCustId])||0;if(qty<=0)return;const o=orders.find(x=>x.id===mid);const price=Number(o?.sellPrice)||0;if(!price)missingPrice=true;const lineTotal=qty*price;grandTotal+=lineTotal;rows.push({no:o?.modelNo||"?",desc:o?.modelDesc||"",qty,price,total:lineTotal})});
      }else{orders.forEach(o=>{const cd=(o.customerDeliveries||[]).filter(d=>d.custId===qCustId).reduce((s,d)=>s+(Number(d.qty)||0),0);const ret=(o.customerReturns||[]).filter(r=>r.custId===qCustId).reduce((s,r)=>s+(Number(r.qty)||0),0);const net=cd-ret;
        if(net>0){const price=Number(o.sellPrice)||0;if(!price)missingPrice=true;const lineTotal=net*price;grandTotal+=lineTotal;rows.push({no:o.modelNo,desc:o.modelDesc||"",qty:net,price,total:lineTotal})}});}
      const discPct=Number(cust.discount)||0;const disc=Math.round(grandTotal*discPct/100);const netTotal=grandTotal-disc;
      const printQuote=()=>{let h="<h2 style='text-align:center'>CLARK — عرض سعر</h2>";
        h+="<table style='margin:0 auto 12px'><tr><td style='padding:4px 12px;font-weight:700'>العميل</td><td style='padding:4px 12px;font-weight:800'>"+cust.name+"</td><td style='padding:4px 12px;font-weight:700'>التاريخ</td><td style='padding:4px 12px'>"+cairoDateStr()+"</td></tr></table>";
        h+="<table><thead><tr><th>الموديل</th><th>الوصف</th><th>الكمية</th><th>سعر القطعة</th><th>الاجمالي</th></tr></thead><tbody>";
        rows.forEach(r=>{h+="<tr><td style='font-weight:800'>"+r.no+"</td><td>"+r.desc+"</td><td style='text-align:center;font-weight:700'>"+r.qty+"</td><td style='text-align:center'>"+fmt(r.price)+"</td><td style='text-align:center;font-weight:800'>"+fmt(r.total)+"</td></tr>"});
        h+="</tbody></table><div style='margin-top:16px;padding:12px;border:2px solid #000;border-radius:8px'>";
        h+="<div style='display:flex;justify-content:space-between;margin-bottom:6px'><span style='font-weight:700'>الاجمالي قبل الخصم</span><span style='font-weight:800;font-size:14px'>"+fmt(grandTotal)+" ج.م</span></div>";
        if(discPct>0)h+="<div style='display:flex;justify-content:space-between;margin-bottom:6px;color:#EF4444'><span style='font-weight:700'>خصم "+discPct+"%</span><span style='font-weight:800'>- "+fmt(disc)+" ج.م</span></div>";
        h+="<div style='display:flex;justify-content:space-between;padding-top:8px;border-top:2px solid #000'><span style='font-weight:800;font-size:16px'>المستحق</span><span style='font-weight:900;font-size:18px;color:#059669'>"+fmt(netTotal)+" ج.م</span></div></div>";
        h+="<div class='sig'><div class='sig-box'>مسؤول المبيعات</div><div class='sig-box'>العميل: "+cust.name+"</div></div>";
        printPage("عرض سعر — "+cust.name,h,{factoryName:config.factoryName,logo:config.logo})};
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:isMob?8:16}} onClick={()=>setQuoteCust(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:isMob?16:24,width:"100%",maxWidth:600,maxHeight:"90vh",overflowY:"auto",border:"1px solid "+T.brd}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div><div style={{fontSize:FS+2,fontWeight:800,color:"#8B5CF6"}}>{"🧾 عرض سعر — "+cust.name}</div><div style={{fontSize:FS-2,color:T.textMut}}>{cust.phone?ltrPhone(cust.phone):""}{cust.type?" | "+cust.type:""}</div></div>
            <div style={{display:"flex",gap:4}}><Btn small onClick={printQuote} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>🖨</Btn><Btn ghost small onClick={()=>setQuoteCust(null)}>✕</Btn></div>
          </div>
          {missingPrice&&<div style={{padding:8,borderRadius:8,background:"#FEF2F2",border:"1px solid #FECACA",marginBottom:10,fontSize:FS-1,color:"#EF4444",fontWeight:700}}>⚠️ بعض الموديلات بدون سعر — ادخل الأسعار من جدول التوزيع</div>}
          {rows.length>0?<div>
            <div style={{overflowX:"auto",marginBottom:12}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["الموديل","الوصف","الكمية","سعر القطعة","الاجمالي"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
              {rows.map((r,i)=><tr key={i} style={{background:i%2===0?"transparent":T.bg+"80"}}><td style={{...TD,fontWeight:800}}>{r.no}</td><td style={{...TD,fontSize:FS-2}}>{r.desc}</td><td style={{...TDB,fontWeight:700}}>{r.qty}</td><td style={{...TDB}}>{r.price?fmt(r.price):<span style={{color:"#EF4444"}}>—</span>}</td><td style={{...TDB,fontWeight:800,color:T.accent}}>{r.total?fmt(r.total):"—"}</td></tr>)}
            </tbody></table></div>
            <div style={{padding:14,borderRadius:12,border:"2px solid "+T.brd,background:T.bg}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><span style={{fontWeight:700}}>الاجمالي قبل الخصم</span><span style={{fontWeight:800,fontSize:FS+2}}>{fmt(grandTotal)+" ج.م"}</span></div>
              {discPct>0&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:8,color:"#EF4444"}}><span style={{fontWeight:700}}>{"خصم "+discPct+"%"}</span><span style={{fontWeight:800}}>{"- "+fmt(disc)+" ج.م"}</span></div>}
              {discPct===0&&<div style={{padding:"6px 10px",borderRadius:6,background:T.warn+"08",border:"1px dashed "+T.warn+"30",fontSize:FS-2,color:T.textMut,marginBottom:8}}>💡 لا يوجد خصم — يمكنك تحديده من كارت العميل</div>}
              <div style={{display:"flex",justifyContent:"space-between",paddingTop:10,borderTop:"2px solid "+T.brd}}><span style={{fontWeight:800,fontSize:FS+2}}>المستحق</span><span style={{fontWeight:900,fontSize:FS+4,color:"#059669"}}>{fmt(netTotal)+" ج.م"}</span></div>
            </div>
          </div>:<div style={{textAlign:"center",padding:20,color:T.textMut}}>لا توجد مبيعات لهذا العميل</div>}
        </div></div>})()}

    {custSalesLog&&(()=>{const isAll=custSalesLog==="all";const cust=isAll?{name:"جميع العملاء",phone:"",type:""}:customers.find(c=>c.id===custSalesLog);if(!cust)return null;
      const moves=[];orders.forEach(o=>{
        (o.customerDeliveries||[]).filter(d=>isAll||d.custId===custSalesLog).forEach((d,di)=>{moves.push({type:"sale",orderId:o.id,modelNo:o.modelNo,modelDesc:o.modelDesc,qty:Number(d.qty)||0,date:d.date,sessId:d.sessionId,by:d.createdBy||"",idx:di,rackSize:Number(o.rackSize)||1,custName:d.custName||"",price:Number(d.price)||0,isDiscounted:d.isDiscounted===true,originalPrice:Number(d.originalPrice)||Number(o.sellPrice)||0,isOverride:d.isOverride===true})});
        (o.customerReturns||[]).filter(r=>isAll||r.custId===custSalesLog).forEach((r,ri)=>{moves.push({type:"return",orderId:o.id,modelNo:o.modelNo,modelDesc:o.modelDesc,qty:Number(r.qty)||0,date:r.date,note:r.note||"",by:r.createdBy||"",idx:ri,custName:r.custName||""})})});
      moves.sort((a,b)=>(b.date||"").localeCompare(a.date||""));
      const totalDel=moves.filter(m=>m.type==="sale").reduce((s,m)=>s+m.qty,0);
      const totalRet=moves.filter(m=>m.type==="return").reduce((s,m)=>s+m.qty,0);
      const saveEdit=(m)=>{const newQty=Math.max(0,editSaleQty);
        if(m.type==="sale"){updOrder(m.orderId,o=>{if(o.customerDeliveries&&o.customerDeliveries[m.idx]){o.customerDeliveries[m.idx].qty=newQty}})}
        else{updOrder(m.orderId,o=>{if(o.customerReturns&&o.customerReturns[m.idx]){o.customerReturns[m.idx].qty=newQty}})}
        setEditSaleIdx(null);showToast("✓ تم تعديل الكمية — المخزن محدّث")};
      const delMove=(m)=>{if(m.type==="sale"){updOrder(m.orderId,o=>{if(o.customerDeliveries)o.customerDeliveries.splice(m.idx,1)})}
        else{updOrder(m.orderId,o=>{if(o.customerReturns)o.customerReturns.splice(m.idx,1)})}showToast("✓ تم الحذف")};
      const printLog=()=>{let h="<h2 style='text-align:center'>📋 سجل مبيعات — "+cust.name+"</h2>";
        h+="<table style='margin:0 auto 12px'><tr><th>اجمالي البيع</th><td style='font-weight:800;color:#0EA5E9'>"+totalDel+"</td><th>المرتجع</th><td style='font-weight:800;color:#EF4444'>"+totalRet+"</td><th>الصافي</th><td style='font-weight:800;color:#10B981'>"+(totalDel-totalRet)+"</td></tr></table>";
        h+="<table><thead><tr><th>التاريخ</th><th>النوع</th><th>الموديل</th><th>الوصف</th><th>الكمية</th><th>بواسطة</th></tr></thead><tbody>";
        moves.forEach(m=>{const isRet=m.type==="return";h+="<tr style='background:"+(isRet?"#FEF2F2":"transparent")+"'><td>"+m.date+"</td><td style='font-weight:800;color:"+(isRet?"#EF4444":"#10B981")+"'>"+(isRet?"↩️ مرتجع":"💰 بيع")+"</td><td style='font-weight:700'>"+m.modelNo+"</td><td style='font-size:10px'>"+m.modelDesc+"</td><td style='text-align:center;font-weight:800;color:"+(isRet?"#EF4444":"#0EA5E9")+"'>"+(isRet?"-":"")+m.qty+"</td><td>"+(m.by||"—")+"</td></tr>"});
        h+="</tbody></table>";printPage("سجل مبيعات — "+cust.name,h,{factoryName:config.factoryName,logo:config.logo})};
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:isMob?8:16}} onClick={()=>{setCustSalesLog(null);setEditSaleIdx(null)}}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:isMob?16:24,width:"100%",maxWidth:isMob?"100%":700,maxHeight:"90vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div><div style={{fontSize:FS+2,fontWeight:800,color:"#059669"}}>{isAll?"📋 سجل حركات البيع":"📋 سجل مبيعات — "+cust.name}</div><div style={{fontSize:FS-2,color:T.textMut}}>{cust.phone?ltrPhone(cust.phone):""}{cust.type?" | "+cust.type:""}</div></div>
            <div style={{display:"flex",gap:4}}><Btn small onClick={printLog} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>🖨</Btn><Btn ghost small onClick={()=>{setCustSalesLog(null);setEditSaleIdx(null)}}>✕</Btn></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:10}}>
            <div style={{padding:8,borderRadius:10,background:"#0EA5E908",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>بيع</div><div style={{fontSize:FS+2,fontWeight:800,color:"#0EA5E9"}}>{totalDel}</div></div>
            <div style={{padding:8,borderRadius:10,background:"#EF444408",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>مرتجع</div><div style={{fontSize:FS+2,fontWeight:800,color:"#EF4444"}}>{totalRet}</div></div>
            <div style={{padding:8,borderRadius:10,background:"#10B98108",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>صافي</div><div style={{fontSize:FS+2,fontWeight:800,color:"#10B981"}}>{totalDel-totalRet}</div></div>
          </div>
          <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
            {isAll&&<div style={{flex:1,minWidth:100}}><Inp value={logCustF} onChange={v=>{setLogCustF(v);setLogLimit(50)}} placeholder="العميل"/></div>}
            <div style={{flex:1,minWidth:100}}><Inp value={logModelF} onChange={v=>{setLogModelF(v);setLogLimit(50)}} placeholder="الموديل"/></div>
            <div style={{minWidth:100}}><Inp type="date" value={logDateF} onChange={v=>{setLogDateF(v);setLogLimit(50)}}/></div>
            <Sel value={logTypeFilter} onChange={v=>{setLogTypeFilter(v);setLogLimit(50)}}><option value="">الكل</option><option value="sale">بيع</option><option value="return">مرتجع</option></Sel>
          </div>
          {(()=>{const fMoves=moves.filter(m=>{if(logTypeFilter&&m.type!==logTypeFilter)return false;if(logCustF.trim()&&!(m.custName||"").toLowerCase().includes(logCustF.trim().toLowerCase()))return false;if(logModelF.trim()&&!(m.modelNo||"").includes(logModelF.trim())&&!(m.modelDesc||"").toLowerCase().includes(logModelF.trim().toLowerCase()))return false;if(logDateF&&(m.date||"")!==logDateF)return false;return true});
            const fDel=fMoves.filter(m=>m.type==="sale").reduce((s,m)=>s+m.qty,0);const fRet=fMoves.filter(m=>m.type==="return").reduce((s,m)=>s+m.qty,0);
            const shown=fMoves.slice(0,logLimit);const hasMore=fMoves.length>logLimit;
            return fMoves.length>0?<div>
              {(logCustF||logModelF||logDateF||logTypeFilter)&&<div style={{fontSize:FS-2,color:T.textMut,marginBottom:6}}>{"نتائج الفلتر: "+fMoves.length+" حركة | بيع: "+fDel+" | مرتجع: "+fRet+" | صافي: "+(fDel-fRet)}</div>}
              <div style={{border:"1px solid "+T.brd,borderRadius:12,overflow:"hidden"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{[...(isAll?["العميل"]:[]),"التاريخ","النوع","الموديل","الوصف","الكمية","بواسطة",""].map(h=><th key={h} style={{...TH,fontSize:FS-2}}>{h}</th>)}</tr></thead><tbody>
            {shown.map((m,i)=>{const isRet=m.type==="return";const isEditing=editSaleIdx===m.type+"_"+m.orderId+"_"+m.idx;const key=m.type+"_"+m.orderId+"_"+m.idx;
              return<tr key={key} style={{background:isRet?"#FEF2F2":i%2===0?"transparent":T.bg+"80"}}>
                {isAll&&<td style={{...TD,fontWeight:600,fontSize:FS-2,color:T.text}}>{m.custName||"—"}</td>}
                <td style={{...TD,fontSize:FS-2}}>{m.date}</td>
                <td style={{...TD,fontWeight:800,color:isRet?"#EF4444":"#10B981",fontSize:FS-1}}>{isRet?"↩️ مرتجع":"💰 بيع"}</td>
                <td style={{...TD,fontWeight:700,color:T.accent}}>{m.modelNo}{m.isDiscounted&&<span style={{marginInlineStart:6,padding:"1px 6px",borderRadius:8,background:"#F59E0B18",color:"#B45309",fontSize:FS-3,fontWeight:700}} title={"سعر مخفض: "+fmt(m.price)+(m.originalPrice?" (الأصلي: "+fmt(m.originalPrice)+")":"")}>💰 خصم</span>}{m.isOverride&&<span style={{marginInlineStart:4,padding:"1px 5px",borderRadius:8,background:"#EF444418",color:"#DC2626",fontSize:FS-3,fontWeight:700}} title="بيع طوارئ خارج الخطة">🚨</span>}</td>
                <td style={{...TD,fontSize:FS-3,color:T.textMut}}>{m.modelDesc}</td>
                <td style={{...TD,textAlign:"center"}}>{isEditing?<input type="number" value={editSaleQty} onChange={e=>setEditSaleQty(Number(e.target.value)||0)} style={{width:55,textAlign:"center",border:"2px solid "+T.accent,borderRadius:4,padding:"2px",fontSize:FS,fontWeight:700,fontFamily:"inherit"}} autoFocus/>:<span style={{fontWeight:800,color:isRet?"#EF4444":"#0EA5E9"}}>{(isRet?"-":"")+m.qty}</span>}</td>
                <td style={{...TD,fontSize:FS-3,color:T.textMut}}>{m.by||"—"}</td>
                <td style={{...TD,textAlign:"center"}}>{canEdit&&<div style={{display:"flex",gap:2}}>
                  {isEditing?<><span onClick={()=>saveEdit(m)} style={{cursor:"pointer",fontSize:14}}>💾</span><span onClick={()=>setEditSaleIdx(null)} style={{cursor:"pointer",fontSize:14}}>✕</span></>
                  :<><span onClick={()=>{setEditSaleIdx(key);setEditSaleQty(m.qty)}} style={{cursor:"pointer",fontSize:12}}>✏️</span><DelBtn small onConfirm={()=>delMove(m)}/></>}
                </div>}</td>
              </tr>})}
          </tbody></table></div>
          {hasMore&&<div style={{textAlign:"center",padding:10}}><Btn onClick={()=>setLogLimit(l=>l+25)} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}}>{"عرض المزيد ("+Math.min(25,fMoves.length-logLimit)+" من "+(fMoves.length-logLimit)+" متبقي)"}</Btn></div>}
          <div style={{fontSize:FS-2,color:T.textMut,textAlign:"center",marginTop:6}}>{"عرض "+Math.min(logLimit,fMoves.length)+" من "+fMoves.length+" حركة"}</div>
          </div>:<div style={{textAlign:"center",padding:20,color:T.textMut}}>{logCustF||logModelF||logDateF||logTypeFilter?"لا توجد نتائج":"لا توجد حركات"}</div>})()}
        </div>
      </div>})()}
    {/* Package Action Menu (from QR scan) */}
    {pkgAction?.mode==="menu"&&(()=>{const pkg=(config.packages||[]).find(p=>p.id===pkgAction.id);if(!pkg)return null;const totalQ=pkg.items?.reduce((s,it)=>s+(Number(it.qty)||0),0)||0;
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setPkgAction(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:420,border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{textAlign:"center",marginBottom:16}}>
            <div style={{fontSize:FS+4,fontWeight:900,color:"#0EA5E9"}}>{"📦 "+pkg.number}</div>
            <div style={{fontSize:FS,color:T.textMut}}>{pkg.date+" | "+(pkg.items?.length||0)+" موديل | "+totalQ+" قطعة"}</div>
            {pkg.status==="مغلقة"&&<div style={{fontSize:FS,fontWeight:800,color:"#EF4444",marginTop:4}}>🔒 مغلقة</div>}
          </div>
          {[
            {icon:"📋",label:"عرض المحتويات",desc:"الموديلات والكميات وسجل الحركات",color:T.accent,action:()=>{setPkgAction(null);setPkgPopup("view_"+pkg.id)}},
            ...(pkg.status!=="مغلقة"?[
              {icon:"📥",label:"اضافة للكرتونة",desc:"اسكان QR موديل → يضاف تلقائي",color:"#10B981",action:()=>setPkgAction({id:pkg.id,mode:"add"})},
              {icon:"📤",label:"سحب من الكرتونة",desc:"اسكان QR موديل → ينقص من الكرتونة",color:"#F59E0B",action:()=>setPkgAction({id:pkg.id,mode:"remove"})},
              {icon:"💰",label:"بيع محتويات الكرتونة",desc:"اختار عميل → بيع كل المحتويات + أرشيف",color:"#8B5CF6",action:()=>{setPkgAction(null);setQrSale({mode:"sale",custId:null,items:pkg.items.map(it=>({orderId:it.orderId,modelNo:it.modelNo,modelDesc:orders.find(o=>o.id===it.orderId)?.modelDesc||"",rackSize:it.rackSize,qty:it.qty})),note:"",_pkgId:pkg.id,_pkgNum:pkg.number})}},
            ]:[]),
            {icon:"🖨",label:"طباعة",desc:"طباعة QR + محتويات الكرتونة",color:T.text,action:()=>{setPkgAction(null);setPkgPopup("view_"+pkg.id)}},
          ].map(op=><div key={op.label} onClick={op.action} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:12,cursor:"pointer",border:"1px solid "+op.color+"20",marginBottom:6}} onMouseEnter={e=>e.currentTarget.style.background=op.color+"08"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <div style={{width:42,height:42,borderRadius:10,background:op.color+"12",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{op.icon}</div>
            <div><div style={{fontWeight:700,fontSize:FS,color:op.color}}>{op.label}</div><div style={{fontSize:FS-2,color:T.textMut}}>{op.desc}</div></div>
          </div>)}
          <div style={{textAlign:"center",marginTop:8}}><Btn ghost onClick={()=>setPkgAction(null)}>الغاء</Btn></div>
        </div>
      </div>})()}
    {/* Package Scan Add/Remove */}
    {pkgAction&&(pkgAction.mode==="add"||pkgAction.mode==="remove")&&(()=>{const pkg=(config.packages||[]).find(p=>p.id===pkgAction.id);if(!pkg)return null;
      const isAdd=pkgAction.mode==="add";const color=isAdd?"#10B981":"#F59E0B";const title=isAdd?"📥 اضافة لكرتونة ":"📤 سحب من كرتونة ";
      const totalQ=pkg.items?.reduce((s,it)=>s+(Number(it.qty)||0),0)||0;
      const handlePkgScan=(text)=>{try{const parts=text.split(":");if(parts[0]!=="CLARK"||!parts[1])return;const orderId=parts[1];const o=orders.find(x=>x.id===orderId);if(!o){playBeep("error");showToast("⛔ موديل غير موجود");return}
        const rs=getRackSize(orderId);
        if(isAdd){upSales(d=>{const pi=d.packages.findIndex(p=>p.id===pkgAction.id);if(pi<0)return;
          const existing=d.packages[pi].items.findIndex(it=>it.orderId===orderId);
          if(existing>=0){d.packages[pi].items[existing].count++;d.packages[pi].items[existing].qty=d.packages[pi].items[existing].count*d.packages[pi].items[existing].rackSize}
          else{d.packages[pi].items.push({orderId,modelNo:o.modelNo,rackSize:rs,count:1,qty:rs})}
          if(!d.packages[pi].movements)d.packages[pi].movements=[];
          d.packages[pi].movements.push({date:cairoDateStr(),type:"add",modelNo:o.modelNo,count:1,qty:rs,by:userName||""})});
          playBeep("ok");showToast("✅ "+o.modelNo+" +1 سيري")}
        else{upSales(d=>{const pi=d.packages.findIndex(p=>p.id===pkgAction.id);if(pi<0)return;
          const existing=d.packages[pi].items.findIndex(it=>it.orderId===orderId);
          if(existing<0){playBeep("error");showToast("⛔ "+o.modelNo+" غير موجود في الكرتونة");return}
          if(d.packages[pi].items[existing].count<=0){playBeep("error");showToast("⛔ "+o.modelNo+" الكمية = 0");return}
          d.packages[pi].items[existing].count--;d.packages[pi].items[existing].qty=d.packages[pi].items[existing].count*d.packages[pi].items[existing].rackSize;
          if(!d.packages[pi].movements)d.packages[pi].movements=[];
          d.packages[pi].movements.push({date:cairoDateStr(),type:"remove",modelNo:o.modelNo,count:1,qty:rs,by:userName||""});
          if(d.packages[pi].items[existing].count<=0)d.packages[pi].items.splice(existing,1);
          const totalRemain=d.packages[pi].items.reduce((s,x)=>s+(x.qty||0),0);
          if(totalRemain<=0){d.packages[pi].status="مغلقة";d.packages[pi].closedAt=nowISO();playBeep("done");showToast("🔒 الكرتونة فارغة — تم الإغلاق")}else{playBeep("ok");showToast("📤 "+o.modelNo+" -1 سيري")}})}
      }catch(e){
        /* V21.21.31: كان catch فاضي — فشل تسجيل حركة الكرتونة كان بيضيع بصمت
           وعدّاد الكراتين ينحرف عن الواقع. */
        playBeep("error");
        showToast("⛔ خطأ غير متوقع في تسجيل حركة الكرتونة — أعد المسح ("+(e?.message||e)+")");
        console.warn("[CLARK pkg-scan]",e);
      }};
      const closePkgScan=()=>{try{const v=document.getElementById("pkg-action-video");if(v&&v.srcObject){v.srcObject.getTracks().forEach(t=>t.stop());v.srcObject=null}}catch(e){}setPkgAction(null)};
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:isMob?8:16}} onClick={closePkgScan}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:isMob?16:24,width:"100%",maxWidth:isMob?420:500,maxHeight:"90vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div><div style={{fontSize:FS+2,fontWeight:800,color}}>{title+pkg.number}</div><div style={{fontSize:FS-1,color:T.textMut}}>{totalQ+" قطعة حالياً"}</div></div>
            <div style={{display:"flex",gap:4}}><Btn ghost small onClick={()=>setPkgAction({id:pkgAction.id,mode:"menu"})}>← رجوع</Btn><Btn ghost small onClick={closePkgScan}>✕</Btn></div>
          </div>
          <div style={{position:"relative",width:"100%",maxWidth:280,margin:"0 auto 12px",borderRadius:12,overflow:"hidden",background:"#000"}}>
            <video id="pkg-action-video" playsInline muted autoPlay style={{width:"100%",display:"block"}} ref={el=>{if(!el||el.srcObject)return;(async()=>{try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment",width:{ideal:640}}});el.srcObject=stream;
              const hasBD=typeof BarcodeDetector!=="undefined";const detector=hasBD?new BarcodeDetector({formats:["qr_code"]}):null;const canvas=document.createElement("canvas");let lastScan="";let lastTime=0;
              const scan=async()=>{if(!el.srcObject)return;if(el.readyState<2){requestAnimationFrame(scan);return}canvas.width=el.videoWidth;canvas.height=el.videoHeight;canvas.getContext("2d").drawImage(el,0,0);
                {const _qr=await scanQR(canvas);if(_qr){const now=Date.now();if(_qr!==lastScan||now-lastTime>2000){lastScan=_qr;lastTime=now;/* V21.21.39 (ESLint): كان handlePkgScan(t) و t غير معرّفة → مسح كاميرا الكرتونة كان بينهار بصمت */handlePkgScan(_qr)}}}
                if(el.srcObject)requestAnimationFrame(scan)};setTimeout(scan,500)}catch(e){showToast("⚠️ تعذر فتح الكاميرا");setPkgAction({id:pkgAction.id,mode:"menu"})}})()}}/>
            <div style={{position:"absolute",top:"35%",left:"50%",transform:"translate(-50%,-50%)",width:140,height:140,border:"2px solid "+color,borderRadius:12,boxShadow:"0 0 0 999px rgba(0,0,0,0.4)"}}/>
          </div>
          <div style={{textAlign:"center",fontSize:FS-1,color:T.textMut,marginBottom:10}}>{isAdd?"وجّه الكاميرا على QR الموديل للاضافة":"وجّه الكاميرا على QR الموديل للسحب"}</div>
          {pkg.items?.length>0&&<div style={{border:"1px solid "+T.brd,borderRadius:10,overflow:"hidden"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><th style={{...TH,fontSize:FS-2}}>الموديل</th><th style={{...TH,fontSize:FS-2}}>سيريهات</th><th style={{...TH,fontSize:FS-2}}>الكمية</th></tr></thead><tbody>
              {pkg.items.map((it,i)=><tr key={i}><td style={{...TD,fontWeight:700,color:T.accent}}>{it.modelNo}</td><td style={{...TD,textAlign:"center"}}>{it.count}</td><td style={{...TD,textAlign:"center",fontWeight:800,color:"#0EA5E9"}}>{it.qty}</td></tr>)}
              <tr style={{background:color+"10"}}><td style={{...TD,fontWeight:800}}>الاجمالي</td><td style={{...TD,textAlign:"center",fontWeight:800}}>{pkg.items.reduce((s,it)=>s+(it.count||0),0)}</td><td style={{...TD,textAlign:"center",fontWeight:800,color}}>{totalQ}</td></tr>
            </tbody></table>
          </div>}
        </div>
      </div>})()}
    {/* Custom Label Print */}
    {customLabel==="pick"&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setCustomLabel(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:450,maxHeight:"80vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontSize:FS+2,fontWeight:800,color:"#F59E0B"}}>🏷️ ليبلات QR — اختر موديل</div>
          <Btn ghost small onClick={()=>setCustomLabel(null)} title="إغلاق">✕</Btn>
        </div>
        <div style={{marginBottom:10}}><Inp value={custFilter} onChange={setCustFilter} placeholder="فلتر بالموديل أو الوصف..."/></div>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          {stockModels.filter(m=>{if(!custFilter.trim())return true;const q=custFilter.trim().toLowerCase();return(m.modelNo||"").toLowerCase().includes(q)||(m.modelDesc||"").toLowerCase().includes(q)}).map(m=><div key={m.id} onClick={()=>{setCustomLabel(m.id);setCustFilter("")}} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",borderRadius:10,cursor:"pointer",border:"1px solid "+T.brd}} onMouseEnter={e=>e.currentTarget.style.background="#F59E0B08"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <div><div style={{fontWeight:700,color:T.accent}}>{m.modelNo}</div><div style={{fontSize:FS-2,color:T.textMut}}>{m.modelDesc}</div></div>
            <div style={{textAlign:"left",fontSize:FS-1}}><div style={{fontWeight:700}}>{"رصيد: "+m.avail}</div><div style={{color:T.textMut}}>{"سيري: "+m.rackSize}</div></div>
          </div>)}
        </div>
      </div>
    </div>}
    {customLabel&&customLabel!=="pick"&&(()=>{const clId=typeof customLabel==="object"?customLabel._id:customLabel;const o=orders.find(x=>x.id===clId);if(!o)return null;const rs=getRackSize(o.id);const sm=stockModels.find(m=>m.id===o.id);const totalLabels=sm?Math.ceil(sm.stockQty/rs):0;
      const clQty=(typeof customLabel==="object"?customLabel._qty:null)||rs;
      const clCopies=(typeof customLabel==="object"?customLabel._copies:null)||1;
      const setClField=(f,v)=>setCustomLabel(p=>{const base=typeof p==="object"?p:{_id:p};return{...base,[f]:v}});
      const printQRLabels=(qty,copies)=>{const qrText="CLARK:"+o.id+":"+qty;const ps=config.printSettings||{};const lw=ps.labelWidth||40;const lh=ps.labelHeight||50;const mg=ps.margins||2;const fl=ps.fields||{};
        const qrMM=Math.min(lw-mg*2,lh-mg*2)-8;
        let h="";for(let i=0;i<copies;i++){h+="<div class='lbl'>";
          if(fl.brand?.show)h+="<div style='font-weight:900;font-size:"+((fl.brand?.size||14)/2.5)+"mm;letter-spacing:2px;line-height:1'>CLARK</div>";
          if(fl.modelNo?.show!==false)h+="<div style='font-weight:800;font-size:"+((fl.modelNo?.size||12)/2.5)+"mm;line-height:1.1'>"+o.modelNo+"</div>";
          if(fl.desc?.show)h+="<div style='font-size:"+((fl.desc?.size||10)/2.5)+"mm;color:#444;line-height:1'>"+o.modelDesc+"</div>";
          if(fl.qr?.show!==false)h+="<div style='flex:1;display:flex;align-items:center;justify-content:center'><img class='qr-img' data-text='"+qrText+"' style='width:"+qrMM+"mm;height:"+qrMM+"mm'/></div>";
          if(fl.series?.show!==false)h+="<div style='font-weight:700;font-size:"+((fl.series?.size||12)/2.5)+"mm;line-height:1'>سيري: "+qty+"</div>";
          if(fl.sizeLabel?.show)h+="<div style='font-size:"+((fl.sizeLabel?.size||10)/2.5)+"mm;line-height:1'>"+(o.sizeLabel||"—")+"</div>";
          if(fl.price?.show)h+="<div style='font-size:"+((fl.price?.size||10)/2.5)+"mm;line-height:1'>"+((Number(o.sellPrice)||0)||"—")+" ج.م</div>";
          h+="</div>"}
        const qrOpts2=JSON.stringify({width:400,margin:ps.qrMargin??1,errorCorrectionLevel:ps.qrLevel||"M",color:{dark:ps.qrColor||"#000000",light:"#ffffff"}});
        const w=openPrintWindow();if(!w){tell("المتصفح يمنع الطباعة","فعّل النوافذ المنبثقة وحاول مرة أخرى",{danger:true});return}w.document.write("<html dir='rtl'><head><title>QR</title><script src='https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js'></"+"script><style>@page{size:"+lw+"mm "+lh+"mm;margin:"+mg+"mm}*{margin:0;padding:0}body{margin:0;padding:0;font-family:'Cairo',Arial,sans-serif}.lbl{width:"+(lw-mg*2)+"mm;height:"+(lh-mg*2)+"mm;page-break-after:always;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;overflow:hidden"+(ps.showBorder?";border:1px dashed #999":"")+"}</style></head><body>"+h+"<script>var qrOpts="+qrOpts2+";document.querySelectorAll('.qr-img').forEach(function(img){QRCode.toDataURL(img.dataset.text,qrOpts).then(function(url){img.src=url}).catch(function(){})});setTimeout(function(){window.print()},800)</"+"script></body></html>");w.document.close()};
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setCustomLabel(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:420,border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
            <div style={{fontSize:FS+2,fontWeight:800,color:"#F59E0B"}}>🏷️ ليبلات QR</div>
            <Btn ghost small onClick={()=>setCustomLabel("pick")}>← رجوع</Btn>
          </div>
          <div style={{fontSize:FS-1,color:T.textMut,marginBottom:16}}>{o.modelNo+" — "+o.modelDesc+" (سيري: "+rs+")"}</div>
          <div style={{textAlign:"center",marginBottom:16}}><QRImg text={"CLARK:"+o.id+":"+rs} size={120}/></div>
          {totalLabels>0&&<div onClick={()=>{printQRLabels(rs,totalLabels);setCustomLabel(null);showToast("✓ تم طباعة "+totalLabels+" ليبل")}} style={{padding:14,borderRadius:12,border:"1px solid #F59E0B30",background:"#F59E0B06",cursor:"pointer",textAlign:"center",marginBottom:8}} onMouseEnter={e=>e.currentTarget.style.background="#F59E0B12"} onMouseLeave={e=>e.currentTarget.style.background="#F59E0B06"}>
            <div style={{fontSize:FS,fontWeight:700,color:"#F59E0B"}}>{"🖨 طباعة كل الليبلات ("+totalLabels+" ليبل)"}</div>
            <div style={{fontSize:FS-2,color:T.textMut}}>{sm.stockQty+" قطعة ÷ "+rs+" سيري = "+totalLabels+" ليبل"}</div>
          </div>}
          <div style={{padding:14,borderRadius:12,border:"1px solid "+T.brd,background:T.bg+"40"}}>
            <div style={{fontSize:FS,fontWeight:700,color:T.text,marginBottom:8}}>🏷️ ليبل مخصص</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div><label style={{fontSize:FS-2,color:T.textSec}}>عدد القطع</label><Sel value={clQty} onChange={v=>setClField("_qty",Number(v))}>{Array.from({length:20},(_,i)=>(i+1)*rs).map(n=><option key={n} value={n}>{n+" قطعة"}</option>)}</Sel></div>
              <div><label style={{fontSize:FS-2,color:T.textSec}}>عدد النسخ</label><Sel value={clCopies} onChange={v=>setClField("_copies",Number(v))}>{Array.from({length:20},(_,i)=>i+1).map(n=><option key={n} value={n}>{n}</option>)}</Sel></div>
            </div>
            <Btn onClick={()=>{printQRLabels(clQty,clCopies);setCustomLabel(null);showToast("✓ تم الطباعة")}} style={{background:"#F59E0B",color:"#fff",border:"none",fontWeight:700,width:"100%"}}>{"🖨 طباعة "+clCopies+" ليبل بكمية "+clQty}</Btn>
          </div>
        </div>
      </div>})()}
    {/* Register Customer Popup */}
    {showCustForm&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowCustForm(false)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:420,border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{fontSize:FS+2,fontWeight:800,color:T.accent,marginBottom:16}}>{cEditId?"✏️ تعديل عميل":"+ تسجيل عميل جديد"}</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>اسم العميل *</label><Inp value={cName} onChange={setCName} placeholder="الاسم بالكامل..."/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>رقم التليفون *</label><Inp value={cPhone} onChange={setCPhone} placeholder="+201xxxxxxxxx" style={{direction:"ltr",textAlign:"left",fontFamily:"monospace"}}/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>نوع العميل</label><Sel value={cType} onChange={setCType}><option value="مكتب">🏢 مكتب</option><option value="محل">🏪 محل</option><option value="أونلاين">🌐 أونلاين</option><option value="أخرى">📦 أخرى</option></Sel></div>
          {/* V21.21.54: نوع التسعير الافتراضي — بيتطبّق تلقائياً على أسعار البنود في البيع */}
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>نوع التسعير <span style={{fontSize:FS-3,color:T.textMut,fontWeight:400}}>— سعر الصنف يتعبّى تلقائي حسبه</span></label>
            <Sel value={cPriceTier} onChange={setCPriceTier}>
              <option value="">سعر عادي (سعر البيع الأساسي)</option>
              {getPriceTiers(data).map(t=><option key={t} value={t}>{t}</option>)}
            </Sel>
          </div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>العنوان</label><Inp value={cAddr} onChange={setCAddr} placeholder="اختياري..."/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>الخصم (%) <span style={{fontSize:FS-3,color:T.textMut,fontWeight:400}}>— يطبق على إذن التسليم وبيان السعر</span></label>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <input type="number" min={0} max={100} step="0.5" value={cDiscount} onChange={e=>setCDiscount(e.target.value)} placeholder="10" style={{flex:1,padding:"8px 12px",borderRadius:8,border:"1px solid "+T.brd,fontSize:FS,fontFamily:"inherit",background:T.inputBg,color:T.text,boxSizing:"border-box"}}/>
              <span style={{fontSize:FS,color:T.textMut,fontWeight:700}}>%</span>
            </div>
          </div>
          {/* V21.9.105: Customer tags picker (Slice 4b of Universal Tagging).
              IDs from data.tagRegistry; soft-create gates duplicate names automatically.
              Registry changes (inline create) write through upConfig — same flow as
              the picker on every other entity will use in Slices 5-7. */}
          <div>
            <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>التاجز <span style={{fontSize:FS-3,color:T.textMut,fontWeight:400}}>— لتصنيف العميل (VIP، جملة، إلخ)</span></label>
            <TagPicker
              entityType="customer"
              registry={data.tagRegistry||[]}
              value={cTags}
              onChange={setCTags}
              onRegistryChange={(newReg)=>upConfig(d=>{d.tagRegistry=newReg})}
              allowCreate={canEdit}
              currentUser={user}
              placeholder="إضافة تاج..."
            />
          </div>
          {/* V18.16: Archive toggle — block customer from new transactions, hide from lists/portal */}
          {cEditId&&<div style={{padding:10,borderRadius:10,background:cArchived?T.err+"08":T.bg,border:"1px solid "+(cArchived?T.err+"30":T.brd),display:"flex",alignItems:"center",gap:10}}>
            <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",flex:1}}>
              <input type="checkbox" checked={cArchived} onChange={e=>setCArchived(e.target.checked)} style={{width:18,height:18,cursor:"pointer",accentColor:T.err}}/>
              <span style={{fontSize:FS-1,fontWeight:700,color:cArchived?T.err:T.text}}>{cArchived?"🔒 موقوف":"🔓 نشط"} — إيقاف التعامل مع العميل</span>
            </label>
          </div>}
          {cEditId&&cArchived&&<div style={{fontSize:FS-3,color:T.textMut,padding:"4px 8px",lineHeight:1.6}}>⚠️ العميل الموقوف هيختفي من القوائم والتقارير، ولو فتح رابط حسابه هيظهر رسالة "تم إيقاف التعامل". الكشف الكامل لسه متاح للمراجعة من الأدمن.</div>}
          {/* V21.9.124: Attachments — only on existing customers. ID مطلوب للـ path. */}
          {cEditId && (
            <AttachmentList
              entityType="customers"
              entityId={cEditId}
              user={user}
              canEdit={canEdit}
              label="مستندات العميل (السجل التجاري، البطاقة الضريبية، إلخ)"
              compact
            />
          )}
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn ghost onClick={()=>setShowCustForm(false)}>الغاء</Btn><Btn primary onClick={saveCust} title="حفظ التعديلات">💾 حفظ</Btn></div>
        </div>
      </div>
    </div>}
    {/* New Session Popup */}
    {showNewSession&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowNewSession(false)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:550,maxHeight:"85vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:FS+2,fontWeight:800,color:"#059669"}}>🚚 تسليم جديد</div>
          <Btn ghost onClick={()=>setShowNewSession(false)} title="إغلاق">✕</Btn>
        </div>
        <div style={{marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,gap:8,flexWrap:"wrap"}}>
            <div style={{fontSize:FS,fontWeight:700,color:T.text}}>📦 اختر الموديلات:</div>
            <Inp value={newSessModelFilter} onChange={v=>setNewSessModelFilter(v)} placeholder="🔍 فلتر موديل..." style={{maxWidth:200,fontSize:FS-2}}/>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:200,overflowY:"auto"}}>
            {(()=>{
              const f=newSessModelFilter.trim().toLowerCase();
              const list=stockModels.filter(m=>m.avail>0).filter(m=>!f||(m.modelNo||"").toLowerCase().includes(f)||(m.modelDesc||"").toLowerCase().includes(f));
              if(list.length===0)return<div style={{padding:"12px 8px",color:T.textMut,fontSize:FS-2,textAlign:"center"}}>{f?"لا يوجد موديل مطابق":"لا توجد موديلات متاحة"}</div>;
              return list.map(m=><label key={m.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderRadius:10,background:selModels[m.id]?T.accent+"08":T.bg,border:"1px solid "+(selModels[m.id]?T.accent+"30":T.brd),cursor:"pointer"}}>
                <input type="checkbox" checked={!!selModels[m.id]} onChange={e=>setSelModels(p=>({...p,[m.id]:e.target.checked}))} style={{width:18,height:18}}/>
                <span style={{fontWeight:700,color:T.accent}}>{m.modelNo}</span>
                <span style={{fontSize:FS-2,color:T.textSec,flex:1}}>{m.modelDesc}</span>
                <span style={{fontSize:FS-2,fontWeight:700,color:T.ok}}>{"متاح: "+m.avail}</span>
                <span style={{fontSize:FS-3,color:T.textMut}}>{"سيري: "+m.rackSize}</span>
              </label>);
            })()}
          </div>
        </div>
        <div style={{marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,gap:8,flexWrap:"wrap"}}>
            <div style={{fontSize:FS,fontWeight:700,color:T.text}}>👥 اختر العملاء:</div>
            <Inp value={newSessCustFilter} onChange={v=>setNewSessCustFilter(v)} placeholder="🔍 فلتر عميل..." style={{maxWidth:200,fontSize:FS-2}}/>
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,maxHeight:200,overflowY:"auto"}}>
            {(()=>{
              const f=newSessCustFilter.trim().toLowerCase();
              const list=customers.filter(c=>!f||(c.name||"").toLowerCase().includes(f)||(c.phone||"").toLowerCase().includes(f));
              if(list.length===0)return<div style={{padding:"12px 8px",color:T.textMut,fontSize:FS-2,textAlign:"center",width:"100%"}}>{f?"لا يوجد عميل مطابق":"لا يوجد عملاء"}</div>;
              return list.map(c=><label key={c.id} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:10,background:selCusts[c.id]?"#05966908":T.bg,border:"1px solid "+(selCusts[c.id]?"#05966930":T.brd),cursor:"pointer",fontSize:FS-1}}>
                <input type="checkbox" checked={!!selCusts[c.id]} onChange={e=>setSelCusts(p=>({...p,[c.id]:e.target.checked}))} style={{width:16,height:16}}/>
                <span style={{fontWeight:600}}>{c.name}</span>
              </label>);
            })()}
          </div>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <Btn ghost onClick={()=>setShowNewSession(false)}>الغاء</Btn>
          <Btn onClick={createSession} style={{background:"#059669",color:"#fff",border:"none",fontWeight:700}}>✓ انشاء وفتح الجدول</Btn>
        </div>
      </div>
    </div>}
    {/* Shipment Labels Popup */}
    {shipPopup&&activeSess&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShipPopup(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:380,border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{fontSize:FS+2,fontWeight:800,color:"#F59E0B",marginBottom:12}}>{"🏷️ طباعة ليبل — "+shipPopup.cust.name}</div>
        <div style={{padding:12,borderRadius:10,background:T.bg,border:"1px solid "+T.brd,marginBottom:12}}>
          <div style={{fontSize:FS-1,color:T.textSec,marginBottom:4}}>الاجمالي: <b style={{color:T.accent}}>{shipPopup.total+" قطعة"}</b></div>
          {aMods.map(m=>{const q=Number(aGrid[m.id+"_"+shipPopup.cust.id])||0;return q>0?<div key={m.id} style={{fontSize:FS-2,color:T.text}}>{"• "+m.modelNo+": "+q+" قطعة"}</div>:null})}
        </div>
        <div style={{marginBottom:16}}>
          <label style={{fontSize:FS,fontWeight:700,color:T.text}}>عدد الشحنات (الأكياس)</label>
          <Inp type="number" value={shipCount} onChange={v=>setShipCount(Math.max(1,Number(v)||1))}/>
          <div style={{fontSize:FS-2,color:T.textMut,marginTop:4}}>{"سيتم طباعة "+shipCount+" ليبل مرقمة (1/"+shipCount+" ... "+shipCount+"/"+shipCount+")"}</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <Btn ghost onClick={()=>setShipPopup(null)}>الغاء</Btn>
          <Btn onClick={async()=>{
            /* V16.71: Replaced the old printCustLabels (bare-bones name/items/total)
               with printSalesDeliveryLabel — same full thermal layout that the
               (now-removed) purple V16.57 button used: customer info, prices,
               totals, discount, confirmation QR — repeated shipCount times with
               a "i/N" badge on each. The popup blocker workaround from V16.70
               applies here too: open the print window synchronously BEFORE any
               await, write a loading placeholder, then hand the window to
               printSalesDeliveryLabel after the /api/delivery-sign fetch. */
            const cust=shipPopup.cust;
            const sessDate=activeSess.date;
            const shipN=shipCount;
            setShipPopup(null);  /* close popup immediately so the user sees the print window */
            /* STEP 1 — open window synchronously, before any await */
            const pw=openPrintWindow();
            if(!pw){tell("المتصفح يمنع الطباعة","فعّل النوافذ المنبثقة وحاول مرة أخرى",{danger:true});return}
            try{
              pw.document.write("<!DOCTYPE html><html dir='rtl'><head><meta charset='utf-8'/><title>جاري التحضير…</title><style>body{font-family:Cairo,Arial,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8fafc;color:#475569}.box{text-align:center}.sp{display:inline-block;width:36px;height:36px;border:4px solid #E2E8F0;border-top-color:#F59E0B;border-radius:50%;animation:s 0.8s linear infinite;margin-bottom:12px}@keyframes s{to{transform:rotate(360deg)}}</style></head><body><div class='box'><div class='sp'></div><div style='font-size:14px;font-weight:700'>جاري تحضير ليبل التسليم…</div></div></body></html>");
            }catch(e){}
            /* STEP 2 — await the pre-fetched delivery signature (V16.72).
               The fetch was started when the orange 🏷️ button opened this
               popup, so by the time the user clicked print it's usually done.
               Fallback: if the ref is empty (e.g., HMR or direct popup open),
               start the fetch now. Either way `sigPromiseRef.current` resolves
               to {sig, err}. */
            let sigP=sigPromiseRef.current;
            if(!sigP)sigP=fetchDeliverySig(cust.id,activeSess.id);
            sigPromiseRef.current=null;/* consume so a second print doesn't reuse a stale sig */
            const{sig,err:signErr}=await sigP;
            if(!sig){console.error("[CLARK] /api/delivery-sign failed:",signErr);showToast("⚠️ الـ QR مش هيظهر — تفاصيل الخطأ: "+signErr)}
            const origin=window.location.origin;
            const confirmUrl=sig?origin+"/?dc=1&s="+encodeURIComponent(activeSess.id)+"&c="+encodeURIComponent(cust.id)+"&sig="+encodeURIComponent(sig):"";
            /* STEP 3 — build items[] with prices (same loop the deleted purple button used) */
            const items=[];let custMoney=0;
            aMods.forEach(m=>{const q=getGroupQty(m,cust.id);if(q>0){
              const oids=m.orderIds||[m.id];let price=0;
              for(const oid of oids){const o=orders.find(x=>x.id===oid);if(o){
                const dd=(o.customerDeliveries||[]).find(d=>d.custId===cust.id&&d.sessionId===activeSess.id&&Number(d.price)>0);
                if(dd){price=Number(dd.price);break}
                if(Number(o.sellPrice)>0){price=Number(o.sellPrice);break}
              }}
              const lineTotal=q*price;custMoney+=lineTotal;
              items.push({modelNo:m.modelNo,modelDesc:m.modelDesc||"",qty:q,price:price,total:lineTotal});
            }});
            const discPct=Number(cust.discount)||0;
            const discAmt=Math.round(custMoney*discPct/100);
            const netAmt=custMoney-discAmt;
            /* STEP 4 — render full label N times (existingWin = pw, shipN = shipCount) */
            printSalesDeliveryLabel(cust.name,cust.phone||"",cust.address||"",sessDate,items,{gross:custMoney,discPct,discAmt,netAmt},confirmUrl,data?.printSettings,CLARK_LOGO_PRINT,pw,shipN);
          }} style={{background:"#F59E0B",color:"#fff",border:"none",fontWeight:700}}>{"🖨 طباعة "+shipCount+" ليبل"}</Btn>
          <Btn onClick={()=>{const lines=aMods.map(m=>{const q=Number(aGrid[m.id+"_"+shipPopup.cust.id])||0;return q>0?"• موديل *"+m.modelNo+"*: *"+q+"* قطعة":null}).filter(Boolean).join("%0A");
            let msg="*CLARK — تسليم عميل*%0A%0A• العميل: *"+shipPopup.cust.name+"*%0A• التاريخ: *"+activeSess.date+"*%0A• عدد الشحنات: *"+shipCount+"* شحنة%0A%0A─────────────────%0A"+lines+"%0A─────────────────%0A• الاجمالي: *"+shipPopup.total+"* قطعة%0A%0A⚠️ *برجاء التأكد من استلام "+shipCount+" شحنات كاملة*%0A%0A*برجاء التأكيد*";
            /* V18.33: Append account summary (URL-encode newlines because msg uses %0A) */
            const summary=formatCustomerSummaryWA(buildCustomerSummary(shipPopup.cust.id,data),(data?.printSettings||{}).whatsappSummary);
            if(summary)msg+=encodeURIComponent(summary);
            openWA("https://wa.me/"+(shipPopup.cust.phone?shipPopup.cust.phone.replace(/[^0-9]/g,""):"")+"?text="+msg,"_blank");setShipPopup(null)}} style={{background:"#25D366",color:"#fff",border:"none",fontWeight:700}} title="ارسال عبر واتساب">📱 واتساب</Btn>
        </div>
      </div>
    </div>}
    {/* Sales Report Popup */}
    {showReport&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowReport(false)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:isMob?500:600,maxHeight:"85vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:FS+2,fontWeight:800,color:"#8B5CF6"}}>📊 تقرير مبيعات</div>
          <Btn ghost small onClick={()=>setShowReport(false)} title="إغلاق">✕</Btn>
        </div>
        <div style={{marginBottom:14}}>
          <label style={{fontSize:FS-1,fontWeight:700,color:T.text,marginBottom:6,display:"block"}}>نوع التقرير</label>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {[{k:"all",l:"📋 كل المبيعات",c:"#8B5CF6"},{k:"customer",l:"👤 حسب عميل",c:"#059669"},{k:"model",l:"📦 حسب موديل",c:T.accent}].map(t=>
              <div key={t.k} onClick={()=>setRptType(t.k)} style={{padding:"8px 14px",borderRadius:10,cursor:"pointer",fontWeight:700,fontSize:FS-1,background:rptType===t.k?t.c+"15":T.bg,color:rptType===t.k?t.c:T.textMut,border:"1.5px solid "+(rptType===t.k?t.c+"40":T.brd),transition:"all 0.15s"}}>{t.l}</div>)}
          </div>
        </div>
        {rptType==="customer"&&<div style={{marginBottom:12}}>
          <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>العميل</label>
          <SearchSel value={rptCust} onChange={setRptCust} options={[{value:"",label:"كل العملاء"},...customers.map(c=>({value:c.id,label:c.name}))]} placeholder="ابحث عن عميل..."/>
        </div>}
        {rptType==="model"&&<div style={{marginBottom:12}}>
          <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>الموديل</label>
          <SearchSel value={rptModel} onChange={setRptModel} options={[{value:"",label:"كل الموديلات"},...stockModels.map(m=>({value:m.id,label:m.modelNo+" — "+m.modelDesc}))]} placeholder="ابحث عن موديل..."/>
        </div>}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>من تاريخ (اختياري)</label><Inp type="date" value={reportRange.from} onChange={v=>setReportRange(p=>({...p,from:v}))}/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>إلى تاريخ (اختياري)</label><Inp type="date" value={reportRange.to} onChange={v=>setReportRange(p=>({...p,to:v}))}/></div>
        </div>
        <div style={{padding:10,borderRadius:8,background:T.bg,border:"1px solid "+T.brd,marginBottom:16,fontSize:FS-2,color:T.textSec}}>
          {"💡 "+(rptType==="all"?"تقرير شامل — موديلات + عملاء":rptType==="customer"?(rptCust?"تفصيل مبيعات العميل بالموديلات":"كل عميل باجمالي مبيعاته"):(rptModel?"بيانات الموديل المحدد فقط":"كل الموديلات ومبيعاتها"))+(reportRange.from||reportRange.to?" — في الفترة المحددة":" — كل الفترات")}
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <Btn ghost onClick={()=>setShowReport(false)}>الغاء</Btn>
          <Btn onClick={printSalesReport} style={{background:"#8B5CF6",color:"#fff",border:"none",fontWeight:700}}>🖨 طباعة التقرير</Btn>
        </div>
      </div>
    </div>}
    {/* Return Popup */}
    {returnPopup&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setReturnPopup(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:420,border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><div style={{fontSize:FS+2,fontWeight:800,color:T.err}}>{"↩️ مرتجع — "+returnPopup.custName}</div><Btn ghost small onClick={()=>setReturnPopup(null)}>✕</Btn></div>
        {returnPopup.models&&returnPopup.models.length>1&&<div style={{marginBottom:10}}><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>اختر الموديل</label>
          <Sel value={returnPopup.orderId} onChange={v=>{const m=returnPopup.models.find(x=>x.id===v);setReturnPopup(p=>({...p,orderId:v,modelNo:m?.modelNo||""}))}}>
            {returnPopup.models.map(m=><option key={m.id} value={m.id}>{m.modelNo}</option>)}
          </Sel></div>}
        <div style={{fontSize:FS-1,color:T.textSec,marginBottom:8}}>{"موديل: "+returnPopup.modelNo}</div>
        <div style={{marginBottom:10}}><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>الكمية المرتجعة</label><Inp type="number" value={retQty} onChange={v=>setRetQty(Number(v)||0)}/></div>
        <div style={{marginBottom:16}}><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>ملاحظة</label><Inp value={retNote} onChange={setRetNote} placeholder="سبب المرتجع..."/></div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn ghost onClick={()=>setReturnPopup(null)}>الغاء</Btn><Btn onClick={doReturn} disabled={retQty<=0} style={{background:T.err,color:"#fff",border:"none",fontWeight:700}}>↩️ تسجيل مرتجع</Btn></div>
      </div>
    </div>}
    {/* Customer QR Popup */}
    {custQR&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setCustQR(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:320,border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)",textAlign:"center"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><div style={{fontSize:FS+2,fontWeight:800,color:T.accent}}>{"👤 "+custQR.name}</div><Btn ghost small onClick={()=>setCustQR(null)}>✕</Btn></div>
        <div style={{fontSize:FS-1,color:T.textMut,marginBottom:12}}>{ltrPhone(custQR.phone)}</div>
        <img src={custQR.src} style={{width:200,height:200,borderRadius:12,border:"1px solid "+T.brd}}/>
        <div style={{marginTop:12,fontSize:FS-2,color:T.textMut}}>مسح الكود = فتح تسليمات العميل</div>
        <div style={{marginTop:12}}><Btn onClick={()=>{printPage("QR — "+custQR.name,"<div style='text-align:center;padding:20px'><h2 style='margin-bottom:10px'>"+custQR.name+"</h2><p style='margin-bottom:16px'>"+ltrPhone(custQR.phone)+"</p><img src='"+custQR.src+"' style='width:200px'/></div>")}} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}}>🖨 طباعة QR</Btn></div>
      </div>
    </div>}
    {/* V21.21.68: Stock portal link modal */}
    {showStockPortal&&<StockPortalLinkModal T={T} FS={FS} isMob={isMob} showToast={showToast} onClose={()=>setShowStockPortal(false)}/>}
    {/* V16.3: Portal URL popup */}
    {portalUrlPopup&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:100000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(6px)"}} onClick={()=>setPortalUrlPopup(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:22,width:"100%",maxWidth:520,border:"2px solid #8B5CF6",boxShadow:"0 25px 80px rgba(0,0,0,0.4)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,paddingBottom:12,borderBottom:"1px solid "+T.brd}}>
          <div style={{fontSize:FS+2,fontWeight:800,color:"#8B5CF6",display:"flex",alignItems:"center",gap:8}}>
            <span>📱</span><span>رابط حساب العميل</span>
          </div>
          <Btn ghost small onClick={()=>setPortalUrlPopup(null)}>✕</Btn>
        </div>
        <div style={{fontSize:FS-1,color:T.textSec,marginBottom:14,lineHeight:1.6}}>
          <b>{portalUrlPopup.custName}</b>
          <div style={{fontSize:FS-2,color:T.textMut,marginTop:4}}>
            يمكنك إرسال هذا الرابط للعميل عبر الواتساب. الرابط يعرض حسابه للقراءة فقط.
          </div>
        </div>
        {portalUrlPopup.loading?<div style={{padding:20,textAlign:"center"}}><Spinner size="medium"/><div style={{marginTop:8,fontSize:FS-1,color:T.textSec}}>جاري التوليد...</div></div>:
         portalUrlPopup.error?<div style={{padding:14,borderRadius:10,background:T.err+"10",border:"1px solid "+T.err+"30",color:T.err,fontSize:FS-1}}>⛔ {portalUrlPopup.error}</div>:
         portalUrlPopup.url?<div>
          <div style={{padding:12,borderRadius:10,background:T.bg,border:"1px solid "+T.brd,fontSize:FS-2,fontFamily:"monospace",direction:"ltr",textAlign:"right",wordBreak:"break-all",color:T.text,marginBottom:12}}>
            {portalUrlPopup.url}
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <Btn primary onClick={()=>{
              try{navigator.clipboard.writeText(portalUrlPopup.url);showToast("✓ تم نسخ الرابط")}
              catch(e){showToast("⛔ فشل النسخ")}
            }} style={{flex:1,minWidth:120}}>📋 نسخ الرابط</Btn>
            <Btn onClick={()=>{
              const cust=customers.find(c=>c.name===portalUrlPopup.custName);
              const phone=cust?(cust.phone||"").replace(/[^\d]/g,""):"";
              const msg=encodeURIComponent("أهلاً "+portalUrlPopup.custName+"،\n\nيمكنك متابعة حسابك معنا من خلال الرابط التالي:\n"+portalUrlPopup.url+"\n\nالرابط خاص بك ويعرض آخر البيانات.");
              const wa=phone?"https://wa.me/"+(phone.startsWith("20")?phone:"20"+phone.replace(/^0+/,""))+"?text="+msg:"https://wa.me/?text="+msg;
              const a=document.createElement("a");a.href=wa;a.target="_blank";a.rel="noopener noreferrer";a.click();
            }} style={{background:"#25D366",color:"#fff",border:"none",flex:1,minWidth:120}}>💬 واتساب</Btn>
          </div>
          <div style={{marginTop:12,fontSize:FS-3,color:T.textMut,lineHeight:1.6,padding:10,background:T.warn+"08",borderRadius:8}}>
            💡 الرابط ثابت لهذا العميل. يمكنك مشاركته مرة واحدة. لن يحتاج تسجيل دخول.
          </div>
        </div>:null}
      </div>
    </div>}
    {/* V16.17: Stale models alert — V17.9: now in its own tab */}
    {(hubView?hubView==="stale":salesTab==="stale")&&(()=>{
      const now=new Date();
      const staleModels=stockModels.filter(m=>{if(m.avail<=0)return false;const o=orders.find(x=>x.id===m.id);if(!o)return false;
        const lastSaleDate=(o.customerDeliveries||[]).reduce((latest,d)=>d.date>latest?d.date:latest,"");
        const lastStockDate=(o.deliveries||[]).reduce((latest,d)=>d.date>latest?d.date:latest,"");
        const refDate=lastSaleDate||lastStockDate||o.date;const days=Math.floor((now-new Date(refDate))/86400000);return days>=14}).map(m=>{
        const o=orders.find(x=>x.id===m.id);const lastSaleDate=(o?.customerDeliveries||[]).reduce((latest,d)=>d.date>latest?d.date:latest,"");
        const lastStockDate=(o?.deliveries||[]).reduce((latest,d)=>d.date>latest?d.date:latest,"");
        const refDate=lastSaleDate||lastStockDate||o?.date||"";const days=Math.floor((now-new Date(refDate))/86400000);
        return{...m,days,lastDate:refDate}}).sort((a,b)=>b.days-a.days);
      if(staleModels.length===0)return<Card title="⚠️ موديلات راكدة"><div style={{textAlign:"center",padding:30,color:T.textMut}}>✅ مفيش موديلات راكدة — كل المخزون عليه حركة في آخر 14 يوم</div></Card>;
      return<Card title={"⚠️ موديلات راكدة ("+staleModels.length+")"} extra={<Btn small onClick={()=>{let h="<h2>⚠️ تقرير الموديلات الراكدة</h2><p style='margin-bottom:12px'>موديلات في المخزن بدون حركة بيع لأكثر من 14 يوم</p>";
            h+="<table><thead><tr><th>الموديل</th><th>الوصف</th><th>الرصيد</th><th>آخر حركة</th><th>الأيام</th><th>الحالة</th></tr></thead><tbody>";
            staleModels.forEach(m=>{h+="<tr style='background:"+(m.days>=30?"#FEF2F2":"transparent")+"'><td style='font-weight:800'>"+m.modelNo+"</td><td>"+m.modelDesc+"</td><td style='text-align:center;font-weight:700;color:#F59E0B'>"+m.avail+"</td><td style='text-align:center'>"+m.lastDate+"</td><td style='text-align:center;font-weight:800;color:"+(m.days>=30?"#EF4444":"#F59E0B")+"'>"+m.days+"</td><td style='text-align:center'>"+(m.days>=30?"🔴 حرج":"🟡 تحذير")+"</td></tr>"});
            h+="</tbody></table>";printPage("تقرير الموديلات الراكدة",h,{factoryName:config.factoryName,logo:config.logo})}} style={{background:"#EF444412",color:"#EF4444",border:"1px solid #EF444430"}}>🖨 طباعة</Btn>}>
        <div style={{fontSize:FS-2,color:T.textMut,marginBottom:10,padding:"6px 10px",background:"#FEF2F2",borderRadius:8,border:"1px solid #EF444420"}}>
          ℹ️ موديلات في المخزن بدون حركة بيع لأكثر من 14 يوم — راجعها وفكر في طريقة تصريفها
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {staleModels.map(m=><div key={m.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",borderRadius:10,background:m.days>=30?"#FEF2F2":T.cardSolid,border:"1px solid "+(m.days>=30?"#EF444430":"#F59E0B30")}}>
            <div style={{flex:1}}>
              <div style={{fontWeight:800,color:T.accent,fontSize:FS}}>{m.modelNo}</div>
              <div style={{fontSize:FS-2,color:T.textMut,marginTop:2}}>{m.modelDesc}</div>
              <div style={{fontSize:FS-3,color:T.textMut,marginTop:4}}>{"آخر حركة: "+(m.lastDate||"—")}</div>
            </div>
            <div style={{display:"flex",gap:12,alignItems:"center"}}>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:FS-3,color:T.textMut,fontWeight:600}}>الرصيد</div>
                <div style={{fontSize:FS+2,fontWeight:800,color:"#F59E0B"}}>{m.avail}</div>
              </div>
              <div style={{textAlign:"center",padding:"4px 10px",borderRadius:8,background:m.days>=30?"#EF444415":"#F59E0B15"}}>
                <div style={{fontSize:FS-3,fontWeight:700,color:m.days>=30?"#EF4444":"#F59E0B"}}>{m.days>=30?"🔴 حرج":"🟡 تحذير"}</div>
                <div style={{fontSize:FS,fontWeight:800,color:m.days>=30?"#EF4444":"#F59E0B"}}>{m.days+" يوم"}</div>
              </div>
            </div>
          </div>)}
        </div>
      </Card>;
    })()}
  </div>
}

/* ═══ V16.3: CUSTOMER STATS WIDGET — comprehensive analytics for one customer ═══ */
function CustomerStatsWidget({data,custId}){
  const stats=useMemo(()=>analyzeCustomer(custId,data),[custId,data]);
  if(!stats)return null;
  const {sales,finance,topModels,monthly,peakMonth,tier,growth}=stats;
  /* Last 6 months for mini chart */
  const recentMonths=monthly.slice(-6);
  const maxMonthValue=recentMonths.reduce((m,x)=>Math.max(m,x.value),0)||1;

  return<div style={{padding:14,borderRadius:14,background:"linear-gradient(135deg, "+T.accent+"05, "+T.bg+")",border:"1px solid "+T.accent+"25",marginBottom:14}}>
    {/* Header — Tier + Growth */}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,marginBottom:12}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:28}}>{tier.emoji}</span>
        <div>
          <div style={{fontSize:FS,fontWeight:800,color:tier.color}}>{tier.label}</div>
          <div style={{fontSize:FS-2,color:T.textMut}}>{sales.netPieces.toLocaleString()} قطعة • {sales.orderCount} أوردر</div>
        </div>
      </div>
      {growth!==null&&<div style={{padding:"6px 12px",borderRadius:8,background:growth>=0?T.ok+"15":T.err+"15",color:growth>=0?T.ok:T.err,fontSize:FS-1,fontWeight:800}}>
        {growth>=0?"📈 +":"📉 "}{growth}%
        <div style={{fontSize:FS-4,fontWeight:500}}>vs الفترة السابقة</div>
      </div>}
    </div>

    {/* Quick metrics row */}
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(120px, 1fr))",gap:8,marginBottom:12}}>
      <div style={{padding:"10px 12px",borderRadius:10,background:T.cardSolid,border:"1px solid "+T.brd,textAlign:"center"}}>
        <div style={{fontSize:FS-3,color:T.textMut,fontWeight:600}}>متوسط الأوردر</div>
        <div style={{fontSize:FS+1,fontWeight:800,color:T.accent,direction:"ltr"}}>{fmt(sales.avgOrderValue)} ج</div>
      </div>
      <div style={{padding:"10px 12px",borderRadius:10,background:T.cardSolid,border:"1px solid "+T.brd,textAlign:"center"}}>
        <div style={{fontSize:FS-3,color:T.textMut,fontWeight:600}}>سعر القطعة</div>
        <div style={{fontSize:FS+1,fontWeight:800,color:"#0EA5E9",direction:"ltr"}}>{fmt(sales.avgPieceValue)} ج</div>
      </div>
      {finance.avgPaymentCycle!==null&&<div style={{padding:"10px 12px",borderRadius:10,background:T.cardSolid,border:"1px solid "+T.brd,textAlign:"center"}}>
        <div style={{fontSize:FS-3,color:T.textMut,fontWeight:600}}>متوسط الدفع</div>
        <div style={{fontSize:FS+1,fontWeight:800,color:"#8B5CF6"}}>{finance.avgPaymentCycle} يوم</div>
      </div>}
      {finance.daysSinceLastPayment!==null&&<div style={{padding:"10px 12px",borderRadius:10,background:T.cardSolid,border:"1px solid "+(finance.daysSinceLastPayment>45?T.err:T.brd),textAlign:"center"}}>
        <div style={{fontSize:FS-3,color:T.textMut,fontWeight:600}}>آخر دفعة منذ</div>
        <div style={{fontSize:FS+1,fontWeight:800,color:finance.daysSinceLastPayment>45?T.err:T.ok}}>{finance.daysSinceLastPayment} يوم</div>
      </div>}
    </div>

    {/* 2-column: Top models + Monthly chart */}
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(260px, 1fr))",gap:12}}>
      {/* Top models */}
      {topModels.length>0&&<div style={{padding:12,borderRadius:10,background:T.cardSolid,border:"1px solid "+T.brd}}>
        <div style={{fontSize:FS-1,fontWeight:800,marginBottom:8,color:T.text}}>🏆 أكثر الموديلات</div>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          {topModels.slice(0,4).map((m,i)=>{
            const pct=topModels[0].pieces>0?(m.pieces/topModels[0].pieces)*100:0;
            return<div key={i} style={{position:"relative"}}>
              <div style={{position:"absolute",inset:0,background:T.accent+"10",width:pct+"%",borderRadius:6,transition:"width 0.3s"}}/>
              <div style={{position:"relative",padding:"6px 10px",display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:FS-2}}>
                <span style={{fontWeight:700,color:T.text,direction:"ltr",textAlign:"right"}}>{m.modelNo||"—"}</span>
                <span style={{fontWeight:800,color:T.accent,fontFamily:"monospace"}}>{m.pieces} قطعة</span>
              </div>
            </div>;
          })}
        </div>
      </div>}

      {/* Monthly mini-chart */}
      {recentMonths.length>0&&<div style={{padding:12,borderRadius:10,background:T.cardSolid,border:"1px solid "+T.brd}}>
        <div style={{fontSize:FS-1,fontWeight:800,marginBottom:8,color:T.text}}>📅 آخر {recentMonths.length} أشهر</div>
        <div style={{display:"flex",alignItems:"flex-end",gap:4,height:60,marginBottom:6}}>
          {recentMonths.map((m,i)=>{
            const h=Math.max(4,(m.value/maxMonthValue)*100);
            return<div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}} title={fmtMonth(m.month)+": "+fmt(Math.round(m.value))+" ج"}>
              <div style={{width:"100%",height:h+"%",background:"linear-gradient(to top,"+T.accent+","+T.accent+"80)",borderRadius:"4px 4px 0 0",minHeight:4}}/>
            </div>;
          })}
        </div>
        <div style={{display:"flex",gap:4,fontSize:FS-4,color:T.textMut,textAlign:"center",direction:"ltr"}}>
          {recentMonths.map((m,i)=><div key={i} style={{flex:1}}>{m.month.slice(5)}</div>)}
        </div>
        {peakMonth&&<div style={{marginTop:8,fontSize:FS-3,color:T.textMut,textAlign:"center"}}>
          🎯 أعلى شهر: <b>{fmtMonth(peakMonth.month)}</b> ({fmt(peakMonth.value)} ج)
        </div>}
      </div>}
    </div>
  </div>;
}

/* ═══ PO Migration Confirmation Component — V14.48 ═══ */
