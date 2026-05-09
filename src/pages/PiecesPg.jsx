/* ════════════════════════════════════════════════════════════════════════
   CLARK · PiecesPg — V19.81.0 (Phase 1) + V19.82.0 (Phase 2)
   ──────────────────────────────────────────────────────────────────────
   Three tabs:
     🔍 استعلام     — scan/paste a QR → see piece details + lifecycle timeline
     📦 تسليم        — bulk-scan pieces for a chosen customer; confirm = mark
                       all sold (markSold) atomically. Double-scan rejected.
     ↩️ إرجاع        — scan one returned piece; system shows the last customer
                       it was sold to; confirm + reason = markReturned.

   Shared helpers + UI primitives at the bottom (Pill, Timeline, ResultCard).
   Cancel-release semantics: scans only mutate Firestore on confirm; closing
   the tab/popup before confirm leaves all DB state untouched.
   ════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from "react";
import { Btn, Card, Inp, SearchSel } from "../components/ui.jsx";
import { QrScanner } from "../components/QrScanner.jsx";
import { parseQr, lookupQr, searchByModel, getPiece, markSold, markReturned, markReturnedBulk, markScrapped, linkPiecesToSeries, getCurrentPiecesForCustomer, getAggregatedStats } from "../utils/pieces.js";
import { fmt } from "../utils/format.js";
import { showToast, ask } from "../utils/popups.js";
/* V19.86.0 — Phase 6 deep integration: scan-to-sell now writes real
   customerDeliveries + custDeliverySessions and triggers autoPost so the
   sale shows in the customer KASF, the trial balance, and the seasonal
   reports. Without this hook the scan workflow was a parallel ledger. */
import { autoPost } from "../utils/accounting/autoPost.js";

const Pill = ({ color, bg, children, style }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: "3px 10px", borderRadius: 999,
    background: bg, color, fontWeight: 700, fontSize: 12,
    ...style,
  }}>{children}</span>
);

const STATUS_LABEL = {
  in_warehouse: { label: "في المخزن", color: "#10B981", bg: "#D1FAE5", icon: "📦" },
  with_customer: { label: "مع عميل", color: "#0EA5E9", bg: "#E0F2FE", icon: "🛒" },
  scrapped: { label: "تالف/ملغى", color: "#EF4444", bg: "#FEE2E2", icon: "🗑" },
};

const ACTION_LABEL = {
  produced: { label: "اتنتجت", color: "#64748B", icon: "🏭" },
  sold: { label: "اتباعت", color: "#0EA5E9", icon: "📦" },
  returned: { label: "رجعت", color: "#F59E0B", icon: "↩️" },
  released: { label: "اتـ release", color: "#8B5CF6", icon: "🔓" },
  scrapped: { label: "اتلفت", color: "#EF4444", icon: "🗑" },
};

function _fmtDateTime(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toISOString().slice(0, 10) + " · " + d.toTimeString().slice(0, 5);
  } catch (_) { return iso; }
}

const TABS = [
  { key: "lookup",    label: "🔍 استعلام",     color: "#0EA5E9" },
  { key: "sell",      label: "📦 تسليم",        color: "#10B981" },
  { key: "return",    label: "↩️ إرجاع",         color: "#F59E0B" },
  { key: "customer",  label: "👥 سجل العميل",   color: "#8B5CF6" },
  { key: "packing",   label: "🔗 تعبئة",        color: "#06B6D4" },
  { key: "analytics", label: "📊 إحصائيات",     color: "#EC4899" },
];

export function PiecesPg({ data, isMob, T, FS, user, upConfig, upSales, updOrder }) {
  const _T = T || { text: "#1E293B", textSec: "#64748B", textMut: "#94A3B8", brd: "#E2E8F0", bg: "#F8FAFC", cardSolid: "#FFF", accent: "#0EA5E9", inputBg: "#FFF" };
  const _FS = FS || 14;
  const [tab, setTab] = useState("lookup");

  return <div style={{ direction: "rtl", padding: isMob ? 12 : 20, maxWidth: 900, margin: "0 auto" }}>
    <div style={{ marginBottom: 14 }}>
      <h1 style={{ fontSize: _FS + 8, fontWeight: 800, color: _T.text, marginBottom: 4 }}>🔍 تتبع القطع (QR)</h1>
      <div style={{ fontSize: _FS - 1, color: _T.textSec, lineHeight: 1.6 }}>
        امسح الـ QR لتعرف القطعة دي راحت لمين، رجعت إمتى، أو سلّم/استرد قطع عبر الـ scanner.
      </div>
    </div>

    {/* Tab bar */}
    <div style={{ display: "flex", gap: 6, marginBottom: 14, borderBottom: "2px solid " + _T.brd, overflowX: "auto" }}>
      {TABS.map(t => <div key={t.key} onClick={() => setTab(t.key)} style={{
        padding: "10px 16px", cursor: "pointer", fontWeight: 800, fontSize: _FS - 1,
        color: tab === t.key ? t.color : _T.textSec,
        borderBottom: "3px solid " + (tab === t.key ? t.color : "transparent"),
        marginBottom: -2, whiteSpace: "nowrap", transition: "all 0.15s",
      }}>{t.label}</div>)}
    </div>

    {tab === "lookup"    && <LookupTab    data={data} T={_T} FS={_FS} />}
    {tab === "sell"      && <SellTab      data={data} T={_T} FS={_FS} user={user} upSales={upSales} updOrder={updOrder} />}
    {tab === "return"    && <ReturnTab    data={data} T={_T} FS={_FS} user={user} updOrder={updOrder} />}
    {tab === "packing"   && <PackingTab   data={data} T={_T} FS={_FS} user={user} />}
    {tab === "customer"  && <CustomerTab  data={data} T={_T} FS={_FS} />}
    {tab === "analytics" && <AnalyticsTab data={data} T={_T} FS={_FS} />}
  </div>;
}

/* ═══════════════════════════════════════════════════════════════
   TAB 1 — Lookup (existing functionality from V19.81.0)
   ═══════════════════════════════════════════════════════════════ */
function LookupTab({ data, T, FS }) {
  const [scanActive, setScanActive] = useState(false);
  const [manualQr, setManualQr] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [searchModel, setSearchModel] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);

  const orders = (data && data.orders) || [];

  async function doLookup(rawQr) {
    if (!rawQr) return;
    setLoading(true); setErrMsg(""); setResult(null);
    try {
      const parsed = parseQr(rawQr);
      const r = await lookupQr(parsed, { orders });
      setResult({ raw: rawQr, ...r });
    } catch (e) {
      setErrMsg("خطأ في الاستعلام: " + (e?.message || e));
    } finally { setLoading(false); }
  }

  /* V19.87.0 — listen for the smart-scanner hand-off. App.jsx sets
     window.__piecesLookup + dispatches "pieces-lookup" when a CLARK:P:* QR
     gets scanned globally; we pick that up, pre-fill the input, run the
     lookup. Also runs on mount in case the event fired before this component
     listened (race during tab switch). */
  useEffect(() => {
    const consume = () => {
      const url = window.__piecesLookup;
      if (!url) return;
      delete window.__piecesLookup;
      setManualQr(url);
      doLookup(url);
    };
    consume();
    window.addEventListener("pieces-lookup", consume);
    return () => window.removeEventListener("pieces-lookup", consume);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  async function reLookup() {
    if (manualQr) await doLookup(manualQr);
  }

  async function handleScrap(pieceId, modelNo) {
    const reason = window.prompt("سبب الإتلاف (اختياري):", "");
    if (reason === null) return; /* user cancelled */
    if (!window.confirm("هل تريد فعلاً إتلاف هذه القطعة؟ الإجراء ده ما ينعكس بسهولة.")) return;
    try {
      const r = await markScrapped(pieceId, { reason: reason || "غير محدد", by: "" });
      if (r.ok) {
        showToast("🗑 تم إتلاف القطعة" + (r.cascade ? " (شامل " + r.cascade + " قطعة في السيري)" : ""));
        await reLookup();
      } else {
        showToast("⛔ فشل الإتلاف");
      }
    } catch (e) {
      showToast("⛔ خطأ: " + (e?.message || e));
    }
  }

  function handleScan(text) {
    setManualQr(text);
    setScanActive(false);
    doLookup(text);
  }

  async function doModelSearch() {
    if (!searchModel) return;
    setSearching(true); setSearchResults(null);
    try {
      const order = orders.find(o => o.modelNo === searchModel || o.id === searchModel);
      const modelNo = order ? order.modelNo : searchModel;
      const results = await searchByModel(modelNo, { limit: 50 });
      setSearchResults({ modelNo, results });
    } catch (e) {
      setErrMsg("خطأ في البحث: " + (e?.message || e));
    } finally { setSearching(false); }
  }

  return <div>
    <Card style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <Btn small onClick={() => { setScanActive(s => !s); setResult(null); }} style={{
          background: scanActive ? "#EF4444" : "#0EA5E9", color: "#FFF", fontWeight: 700,
        }}>{scanActive ? "✕ إيقاف الكاميرا" : "📷 فتح الكاميرا"}</Btn>
        <div style={{ flex: 1, minWidth: 200, display: "flex", gap: 6 }}>
          <Inp value={manualQr} onChange={setManualQr} placeholder="أو الصق/اكتب الـ QR هنا (CLARK:P:p_xxx)" />
          <Btn small onClick={() => doLookup(manualQr)} disabled={loading || !manualQr} style={{
            background: T.accent, color: "#FFF", fontWeight: 700, whiteSpace: "nowrap",
          }}>{loading ? "..." : "🔍 ابحث"}</Btn>
        </div>
      </div>
      {scanActive && <div style={{ marginBottom: 12 }}>
        <QrScanner active={scanActive} onScan={handleScan} onError={msg => setErrMsg(msg)} height={280} />
      </div>}
      {errMsg && <div style={{ padding: 10, borderRadius: 8, background: "#FEE2E2", color: "#B91C1C", wordBreak: "break-all", overflowWrap: "anywhere", fontWeight: 700, fontSize: FS - 2 }}>
        ⚠️ {errMsg}
      </div>}
    </Card>

    {result && <ResultCard result={result} T={T} FS={FS} onScrap={handleScrap} />}

    <Card style={{ marginTop: 16 }}>
      <div style={{ marginBottom: 8 }}>
        <h3 style={{ fontSize: FS + 2, fontWeight: 800, color: T.text, marginBottom: 4 }}>
          🛠 البحث اليدوي (لو الـ sticker مكسور)
        </h3>
        <div style={{ fontSize: FS - 2, color: T.textSec }}>
          اختر موديل واطبع آخر القطع اللي اتنتجت منه.
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <SearchSel value={searchModel} onChange={setSearchModel}
            options={orders.map(o => ({ value: o.modelNo, label: o.modelNo + " — " + (o.modelDesc || "") }))}
            placeholder="اختر موديل..." />
        </div>
        <Btn small onClick={doModelSearch} disabled={searching || !searchModel} style={{
          background: "#8B5CF6", color: "#FFF", fontWeight: 700,
        }}>{searching ? "..." : "ابحث"}</Btn>
      </div>
      {searchResults && <SearchResultsList results={searchResults} T={T} FS={FS} onPick={p => doLookup(p.qrCode)} />}
    </Card>
  </div>;
}

/* ═══════════════════════════════════════════════════════════════
   TAB 2 — Sell (V19.82.0): scan pieces → assign to customer
   ═══════════════════════════════════════════════════════════════ */
function SellTab({ data, T, FS, user, upSales, updOrder }) {
  const customers = (data && data.customers) || [];
  const orders = (data && data.orders) || [];
  const [custId, setCustId] = useState("");
  const [scanActive, setScanActive] = useState(false);
  /* Scanned pieces collected in this session — pure local state, NO Firestore
     writes happen until "Confirm" so cancel = release-by-default. The Set
     prevents duplicate scans within the session (the user's main complaint). */
  const [scanned, setScanned] = useState([]); /* [{piece, scannedAt}] */
  const [confirming, setConfirming] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  const cust = customers.find(c => c.id === custId);
  const custName = cust?.name || "";
  const scannedIds = new Set(scanned.map(s => s.piece.id));

  async function handleScan(text) {
    setErrMsg("");
    const parsed = parseQr(text);
    if (parsed.kind !== "piece") {
      const msg = parsed.kind === "legacy" ? "⚠️ ده QR قديم بدون تتبع — اطبع QR جديد للقطعة" : "⚠️ ده مش CLARK QR";
      setErrMsg(msg); showToast(msg);
      return;
    }
    /* Double-scan prevention — same piece in same session */
    if (scannedIds.has(parsed.pieceId)) {
      showToast("⚠️ القطعة دي اتعملها scan قبل كده في الجلسة دي");
      return;
    }
    try {
      const piece = await getPiece(parsed.pieceId);
      if (!piece) { showToast("❌ القطعة مش موجودة في النظام"); return; }
      if (piece.status === "with_customer") {
        showToast("⚠️ القطعة دي مع " + (piece.currentCustomerName || "عميل تاني") + " — اعملها إرجاع الأول");
        return;
      }
      if (piece.status === "scrapped") {
        showToast("❌ القطعة ملغية/تالفة"); return;
      }
      /* V19.83.0 — if this is a series with linked pieces, prevent
         double-coverage with already-scanned individual pieces. Same for the
         reverse case: scanning an individual piece whose parent series was
         already scanned. */
      if (piece.type === "series" && Array.isArray(piece.containedPieceIds)) {
        const overlap = piece.containedPieceIds.find(cid => scannedIds.has(cid));
        if (overlap) {
          showToast("⚠️ في قطعة ضمن السيري ده اتعملها scan قبل كده (" + overlap + ") — شيلها الأول لو عايز السيري كامل");
          return;
        }
      }
      if (piece.parentSeriesId && scannedIds.has(piece.parentSeriesId)) {
        showToast("⚠️ السيري ده اتعملها scan قبل كده — السيري كامل بيشمل القطعة دي تلقائي");
        return;
      }
      setScanned(prev => [...prev, { piece, scannedAt: Date.now() }]);
    } catch (e) {
      setErrMsg("خطأ في القراءة: " + (e?.message || e));
    }
  }

  function removeScan(pieceId) {
    setScanned(prev => prev.filter(s => s.piece.id !== pieceId));
  }

  async function confirmSale() {
    if (!custId) { showToast("⚠️ اختر العميل أولاً"); return; }
    if (scanned.length === 0) { showToast("⚠️ مفيش قطع متعملها scan"); return; }
    /* V19.86.0 — financial preview before confirming. If at least one order
       has a sellPrice, show the user the impact on KASF before they commit. */
    const previewByOrder = {};
    scanned.forEach(s => {
      const oid = s.piece.orderId; if (!oid) return;
      const containedQty = (s.piece.type === "series" && Array.isArray(s.piece.containedPieceIds))
        ? s.piece.containedPieceIds.length : 1;
      if (!previewByOrder[oid]) previewByOrder[oid] = { qty: 0 };
      previewByOrder[oid].qty += containedQty;
    });
    let totalQty = 0, totalValue = 0;
    Object.entries(previewByOrder).forEach(([oid, info]) => {
      const o = orders.find(x => x.id === oid);
      const p = Number(o?.sellPrice) || 0;
      totalQty += info.qty;
      totalValue += info.qty * p;
    });
    const integrationOn = !!(upSales && updOrder);
    const proceed = await ask(
      "تأكيد التسليم",
      "هتسلم " + totalQty + " قطعة لـ " + custName +
      (totalValue > 0 ? " بقيمة ~" + fmt(totalValue) + " ج.م" : "") +
      (integrationOn ? ".\n✅ هـ يتم تسجيل البيع في كشف العميل + المحاسبة." : ".\n⚠️ التسجيل في الـ pieces فقط (مش هـ يأثر على KASF).")
    );
    if (!proceed) return;
    setConfirming(true);
    const deliveryId = "scan_del_" + Date.now().toString(36);
    const sessionId = "scan_sess_" + Date.now().toString(36);
    const by = user?.email || user?.displayName || "";

    /* Step 1: mark each piece sold (cascades for series). */
    let okCount = 0, failCount = 0;
    const failures = [];
    const succeeded = [];
    for (const s of scanned) {
      try {
        const r = await markSold(s.piece.id, { customerId: custId, customerName: custName, deliveryId, sessionId, by });
        if (r.ok) { okCount++; succeeded.push(s); }
        else { failCount++; failures.push({ piece: s.piece, error: r.error }); }
      } catch (e) {
        failCount++; failures.push({ piece: s.piece, error: e?.message || String(e) });
      }
    }

    /* Step 2 (V19.86.0) — KASF + accounting integration. Only runs for the
       pieces that succeeded in step 1. If upSales/updOrder weren't provided
       (e.g. legacy renderer), this is a no-op and pieces are still tracked. */
    if (succeeded.length > 0 && upSales && updOrder) {
      const today = new Date().toISOString().slice(0, 10);
      /* Group successful pieces by orderId so each order gets a single
         customerDelivery entry summarizing the qty shipped from that model. */
      const byOrder = {};
      succeeded.forEach(s => {
        const oid = s.piece.orderId; if (!oid) return;
        const containedQty = (s.piece.type === "series" && Array.isArray(s.piece.containedPieceIds))
          ? s.piece.containedPieceIds.length : 1;
        if (!byOrder[oid]) byOrder[oid] = { qty: 0, pieceIds: [] };
        byOrder[oid].qty += containedQty;
        byOrder[oid].pieceIds.push(s.piece.id);
      });
      const orderIds = Object.keys(byOrder);
      if (orderIds.length > 0) {
        try {
          /* Create the session in the sales doc */
          const grid = {};
          orderIds.forEach(oid => { grid[oid + "_" + custId] = byOrder[oid].qty; });
          upSales(d => {
            if (!d.custDeliverySessions) d.custDeliverySessions = [];
            d.custDeliverySessions.push({
              id: sessionId,
              date: today,
              modelIds: orderIds,
              custIds: [custId],
              grid,
              createdBy: by,
              createdAt: new Date().toISOString(),
              status: "تم التسليم",
              saleConfirmed: true,
              fromScanner: true, /* marker — distinguishable from matrix sessions */
              scannedPieceIds: succeeded.map(s => s.piece.id),
            });
          });
          /* Push customerDeliveries + autoPost per order */
          const cust = customers.find(c => c.id === custId);
          for (const oid of orderIds) {
            const order = orders.find(o => o.id === oid);
            if (!order) continue;
            const sellPrice = Number(order.sellPrice) || 0;
            const entry = {
              id: "del_" + Date.now().toString(36) + "_" + oid.slice(-4),
              custId, custName,
              qty: byOrder[oid].qty,
              date: today,
              sessionId,
              createdBy: by,
              createdAt: new Date().toISOString(),
              fromScanner: true,
              scannedPieceIds: byOrder[oid].pieceIds,
            };
            if (sellPrice > 0) entry.price = sellPrice;
            entry._key = oid + ":saleDelivery:" + sessionId + ":" + custId + ":" + today + ":" + Date.now();
            try { await updOrder(oid, o => {
              if (!o.customerDeliveries) o.customerDeliveries = [];
              o.customerDeliveries.push(entry);
            }); } catch (e) { console.warn("[scan-to-sell] updOrder failed:", oid, e?.message); }
            /* Fire-and-forget autoPost — failures are recorded in
               accountingPostFailures, not surfaced here. */
            if (sellPrice > 0 && cust) {
              autoPost.sale(data, entry, cust, order, by).catch(()=>{});
              autoPost.saleCogs(data, entry, order, by).catch(()=>{});
            }
          }
        } catch (e) {
          console.error("[scan-to-sell] integration write failed:", e);
          showToast("⚠️ القطع اتسجلت لكن فشل تسجيل البيع في KASF: " + (e?.message || e));
        }
      }
    }

    setConfirming(false);
    if (failCount === 0) {
      showToast("✓ تم تسليم " + okCount + " قطعة لـ " + custName + (integrationOn ? " (مع KASF)" : ""));
      setScanned([]); setCustId("");
    } else {
      showToast("⚠️ " + okCount + " ناجح، " + failCount + " فشل — راجع القائمة");
      setScanned(prev => prev.filter(s => !failures.some(f => f.piece.id === s.piece.id)));
      setErrMsg(failCount + " قطعة فشلت: " + failures.slice(0, 3).map(f => f.piece.id + " (" + f.error + ")").join(" · "));
    }
  }

  /* Aggregate by modelNo for the summary badges. V19.83.0 — series with
     contained pieces count as N items in the summary (not 1). */
  const summary = {};
  let totalPieces = 0;
  scanned.forEach(s => {
    if (s.piece.type === "series" && Array.isArray(s.piece.containedPieceIds)) {
      const n = s.piece.containedPieceIds.length;
      totalPieces += n + 1; /* the series itself + its pieces */
      const k = s.piece.modelNo + " (سيري ×" + n + ")";
      summary[k] = (summary[k] || 0) + 1;
    } else {
      totalPieces += 1;
      const k = s.piece.modelNo + (s.piece.size ? "/" + s.piece.size : "");
      summary[k] = (summary[k] || 0) + 1;
    }
  });

  return <div>
    <Card style={{ marginBottom: 14 }}>
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: FS - 1, fontWeight: 700, color: T.textSec, marginBottom: 4, display: "block" }}>العميل</label>
        <SearchSel value={custId} onChange={v => { setCustId(v); setScanned([]); }}
          options={customers.map(c => ({ value: c.id, label: c.name + (c.phone ? " — " + c.phone : "") }))}
          placeholder="اختر العميل..." />
      </div>
      {custId && <>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
          <Btn small onClick={() => setScanActive(s => !s)} style={{
            background: scanActive ? "#EF4444" : "#10B981", color: "#FFF", fontWeight: 700,
          }}>{scanActive ? "✕ إيقاف الكاميرا" : "📷 ابدأ الـ scan"}</Btn>
          <div style={{ fontSize: FS - 2, color: T.textSec, flex: 1, minWidth: 100 }}>
            امسح كل قطعة هتتسلم لـ <b style={{ color: T.text }}>{custName}</b>. الـ QR المكرر هـ يترفض تلقائياً.
          </div>
        </div>
        {scanActive && <div style={{ marginBottom: 10 }}>
          <QrScanner active={scanActive} onScan={handleScan} onError={msg => setErrMsg(msg)} height={260} />
        </div>}
        {errMsg && <div style={{ padding: 8, borderRadius: 6, background: "#FEE2E2", color: "#B91C1C", wordBreak: "break-all", overflowWrap: "anywhere", fontSize: FS - 2, marginBottom: 8 }}>
          ⚠️ {errMsg}
        </div>}
      </>}
    </Card>

    {scanned.length > 0 && <Card style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: FS, fontWeight: 800, color: T.text }}>
          📦 {scanned.length} عنصر · إجمالي {totalPieces} قطعة (مع السيريهات)
        </div>
        <Btn small onClick={confirmSale} disabled={confirming} style={{
          background: "#10B981", color: "#FFF", fontWeight: 800, fontSize: FS,
        }}>{confirming ? "⏳ جاري الحفظ..." : "✓ تأكيد التسليم لـ " + custName}</Btn>
      </div>
      {/* Summary by model+size */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {Object.entries(summary).map(([k, n]) => (
          <Pill key={k} color="#10B981" bg="#D1FAE5">{k} × {n}</Pill>
        ))}
      </div>
      {/* Scanned list (newest first) */}
      <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid " + T.brd, borderRadius: 8 }}>
        {[...scanned].reverse().map(s => {
          const isSeries = s.piece.type === "series";
          const containedCount = Array.isArray(s.piece.containedPieceIds) ? s.piece.containedPieceIds.length : 0;
          return <div key={s.piece.id} style={{
            padding: "8px 12px", borderBottom: "1px solid " + T.brd, fontSize: FS - 2,
            display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
            background: isSeries && containedCount > 0 ? "#0EA5E908" : "transparent",
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: T.text, fontWeight: 700 }}>
                {isSeries && containedCount > 0 ? "🔗 " : ""}
                {s.piece.modelNo}
                {s.piece.size ? " · مقاس " + s.piece.size : ""}
                {isSeries ? " · سيري" : ""}
                {isSeries && containedCount > 0 && (
                  <span style={{ marginInlineStart: 6, padding: "2px 8px", borderRadius: 999, background: "#0EA5E920", color: "#0369A1", fontSize: FS - 3 }}>
                    +{containedCount} قطعة جواه
                  </span>
                )}
              </div>
              <div style={{ fontFamily: "monospace", color: T.textMut, fontSize: FS - 3 }}>{s.piece.id}</div>
            </div>
            <span onClick={() => removeScan(s.piece.id)} style={{
              cursor: "pointer", padding: "3px 8px", borderRadius: 6, background: "#EF444415",
              color: "#EF4444", fontWeight: 700, fontSize: FS - 2,
            }}>✕</span>
          </div>;
        })}
      </div>
    </Card>}

    {scanned.length === 0 && custId && <div style={{
      padding: 24, textAlign: "center", color: T.textMut, fontSize: FS - 1,
      background: T.bg, borderRadius: 10, border: "1px dashed " + T.brd,
    }}>📷 افتح الكاميرا وامسح القطع المراد تسليمها لـ {custName}</div>}
  </div>;
}

/* ═══════════════════════════════════════════════════════════════
   TAB 3 — Return (V19.85.0): bulk scan → mark all returned in one batch
   ═══════════════════════════════════════════════════════════════
   Pre-V19.85 this was single-piece-at-a-time. The user pointed out that
   real returns often come in groups (10 pieces from one customer), so
   confirming each one was friction. New behavior mirrors the Sell tab:
   keep scanning, build up a list, enter a single reason, confirm-all.
   Each scan still validates (must be tracked, must be with_customer,
   no duplicates). Cancel-release: nothing writes to Firestore until
   the confirm button. */
function ReturnTab({ data, T, FS, user, updOrder }) {
  const [scanActive, setScanActive] = useState(false);
  const [scanned, setScanned] = useState([]); /* [{piece, scannedAt, cascadeSeries}] */
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [lastSummary, setLastSummary] = useState(null);

  const orders = (data && data.orders) || [];
  const customers = (data && data.customers) || [];
  const scannedIds = new Set(scanned.map(s => s.piece.id));

  async function handleScan(text) {
    setErrMsg(""); setLastSummary(null);
    const parsed = parseQr(text);
    if (parsed.kind !== "piece") {
      const msg = parsed.kind === "legacy" ? "⚠️ ده QR قديم بدون تتبع" : "⚠️ ده مش CLARK QR";
      setErrMsg(msg); showToast(msg); return;
    }
    if (scannedIds.has(parsed.pieceId)) {
      showToast("⚠️ القطعة دي اتعملها scan قبل كده في الجلسة دي"); return;
    }
    try {
      const p = await getPiece(parsed.pieceId);
      if (!p) { showToast("❌ القطعة مش موجودة"); return; }
      if (p.status !== "with_customer") {
        showToast("⚠️ القطعة في الحالة: " + (STATUS_LABEL[p.status]?.label || p.status) + " — مش ممكن إرجاعها");
        return;
      }
      /* Series-vs-piece overlap detection — same logic as SellTab */
      if (p.type === "series" && Array.isArray(p.containedPieceIds)) {
        const overlap = p.containedPieceIds.find(cid => scannedIds.has(cid));
        if (overlap) {
          showToast("⚠️ في قطعة ضمن السيري ده اتعملها scan قبل كده");
          return;
        }
      }
      if (p.parentSeriesId && scannedIds.has(p.parentSeriesId)) {
        showToast("⚠️ السيري ده اتعملها scan قبل كده — السيري كامل بيشمل القطعة دي");
        return;
      }
      /* Default cascade=true for series; user can flip per piece */
      setScanned(prev => [...prev, { piece: p, scannedAt: Date.now(), cascadeSeries: true }]);
    } catch (e) {
      setErrMsg("خطأ: " + (e?.message || e));
    }
  }

  function removeScan(pieceId) {
    setScanned(prev => prev.filter(s => s.piece.id !== pieceId));
  }
  function toggleCascade(pieceId) {
    setScanned(prev => prev.map(s => s.piece.id === pieceId ? { ...s, cascadeSeries: !s.cascadeSeries } : s));
  }

  async function confirmAll() {
    if (scanned.length === 0) { showToast("⚠️ مفيش قطع متعملها scan"); return; }
    const proceed = await ask(
      "تأكيد إرجاع",
      "هتـ return " + scanned.length + " قطعة" + (reason ? " بسبب: " + reason : "") + ". الإجراء ده هـ يشيل الربط بالعميل ويرجّع القطع للمخزن."
    );
    if (!proceed) return;
    setConfirming(true);
    const by = user?.email || user?.displayName || "";
    let ok = 0, fail = 0;
    const fromCustomers = new Set();
    const failures = [];
    /* V19.87.0 — collect successful returns grouped by (orderId, customerId)
       so we can post a saleReturn JE for each combination after step 1. */
    const returnedByOrderCust = {}; /* "oid::custId" → { qty, orderId, custId, custName, pieceIds } */

    for (const s of scanned) {
      try {
        const r = await markReturned(s.piece.id, {
          reason: reason || "بدون سبب محدد",
          by,
          cascadeSeries: s.piece.type === "series" ? s.cascadeSeries : false,
        });
        if (r.ok) {
          ok++;
          if (r.fromCustomerName) fromCustomers.add(r.fromCustomerName);
          /* Capture for accounting integration. The customer info comes from
             the piece's pre-return state, which markReturned echoes back via
             r.fromCustomerName + the piece's previous currentCustomerId. */
          const oid = s.piece.orderId;
          const custId = s.piece.currentCustomerId;
          if (oid && custId) {
            const k = oid + "::" + custId;
            const containedQty = (s.piece.type === "series" && Array.isArray(s.piece.containedPieceIds) && s.cascadeSeries)
              ? s.piece.containedPieceIds.length
              : 1;
            if (!returnedByOrderCust[k]) returnedByOrderCust[k] = {
              qty: 0, orderId: oid, custId,
              custName: r.fromCustomerName || s.piece.currentCustomerName,
              pieceIds: [],
            };
            returnedByOrderCust[k].qty += containedQty;
            returnedByOrderCust[k].pieceIds.push(s.piece.id);
          }
        } else {
          fail++; failures.push({ piece: s.piece, error: r.error });
        }
      } catch (e) {
        fail++; failures.push({ piece: s.piece, error: e?.message || String(e) });
      }
    }

    /* V19.87.0 — KASF integration for returns. Mirrors V19.86.0 sell flow.
       For each (orderId, customerId) group, push a customerReturn entry
       to the order + fire autoPost.saleReturn so the journal sees the
       credit. updOrder is optional — without it, returns stay tracked
       in the pieces collection only. */
    if (updOrder && Object.keys(returnedByOrderCust).length > 0) {
      const today = new Date().toISOString().slice(0, 10);
      for (const k of Object.keys(returnedByOrderCust)) {
        const g = returnedByOrderCust[k];
        const order = orders.find(o => o.id === g.orderId);
        if (!order) continue;
        const cust = customers.find(c => c.id === g.custId);
        const sellPrice = Number(order.sellPrice) || 0;
        const retEntry = {
          id: "ret_" + Date.now().toString(36) + "_" + g.orderId.slice(-4),
          custId: g.custId, custName: g.custName,
          qty: g.qty,
          date: today,
          createdBy: by,
          createdAt: new Date().toISOString(),
          fromScanner: true,
          scannedPieceIds: g.pieceIds,
          reason: reason || "",
        };
        if (sellPrice > 0) retEntry.price = sellPrice;
        retEntry._key = g.orderId + ":saleReturn:" + g.custId + ":" + today + ":" + Date.now();
        try {
          await updOrder(g.orderId, o => {
            if (!o.customerReturns) o.customerReturns = [];
            o.customerReturns.push(retEntry);
          });
          if (sellPrice > 0 && cust) {
            autoPost.saleReturn(data, retEntry, cust, order, by).catch(()=>{});
            autoPost.saleReturnCogs(data, retEntry, order, by).catch(()=>{});
          }
        } catch (e) {
          console.warn("[scan-to-return] updOrder failed:", g.orderId, e?.message);
        }
      }
    }

    setConfirming(false);
    setLastSummary({ ok, fail, fromCustomers: [...fromCustomers], failures });
    if (fail === 0) {
      showToast("✓ تم استلام " + ok + " إرجاع من " + fromCustomers.size + " عميل");
      setScanned([]); setReason("");
    } else {
      showToast("⚠️ " + ok + " ناجح، " + fail + " فشل");
      setScanned(prev => prev.filter(s => !failures.some(f => f.piece.id === s.piece.id)));
    }
  }

  /* Group scanned by current customer for display */
  const byCustomer = {};
  scanned.forEach(s => {
    const k = s.piece.currentCustomerName || "—";
    if (!byCustomer[k]) byCustomer[k] = [];
    byCustomer[k].push(s);
  });

  return <div>
    <Card style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
        <Btn small onClick={() => setScanActive(s => !s)} style={{
          background: scanActive ? "#EF4444" : "#F59E0B", color: "#FFF", fontWeight: 700,
        }}>{scanActive ? "✕ إيقاف الكاميرا" : "📷 ابدأ scan الإرجاعات"}</Btn>
        <div style={{ fontSize: FS - 2, color: T.textSec, flex: 1, minWidth: 100 }}>
          امسح كل قطعة مرتجعة. هتشوفها في القائمة مع اسم العميل اللي راحت له. ضغط "تأكيد" يعمل return للكل دفعة واحدة.
        </div>
      </div>
      {scanActive && <div style={{ marginBottom: 10 }}>
        <QrScanner active={scanActive} onScan={handleScan} onError={msg => setErrMsg(msg)} height={260} />
      </div>}
      {errMsg && <div style={{ padding: 8, borderRadius: 6, background: "#FEE2E2", color: "#B91C1C", wordBreak: "break-all", overflowWrap: "anywhere", fontSize: FS - 2, marginBottom: 8 }}>
        ⚠️ {errMsg}
      </div>}
    </Card>

    {lastSummary && lastSummary.fail === 0 && lastSummary.ok > 0 && (
      <Card style={{ marginBottom: 14, background: "#D1FAE5", border: "1px solid #10B981" }}>
        <div style={{ fontSize: FS + 2, fontWeight: 800, color: "#065F46" }}>
          ✓ تم استلام {lastSummary.ok} إرجاع
        </div>
        <div style={{ fontSize: FS - 1, color: "#065F46", marginTop: 4 }}>
          من {lastSummary.fromCustomers.length} عميل: <b>{lastSummary.fromCustomers.join("، ")}</b>
        </div>
        <div style={{ fontSize: FS - 3, color: "#047857", marginTop: 6 }}>
          كل القطع رجعت للمخزن وممكن تتباع لعملاء تانيين.
        </div>
      </Card>
    )}

    {scanned.length > 0 && <Card style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: FS, fontWeight: 800, color: T.text }}>
          ↩️ {scanned.length} قطعة مرتجعة في الجلسة
        </div>
        <Btn small onClick={confirmAll} disabled={confirming} style={{
          background: "#F59E0B", color: "#FFF", fontWeight: 800, fontSize: FS,
        }}>{confirming ? "⏳ جاري الحفظ..." : "✓ تأكيد إرجاع الكل"}</Btn>
      </div>

      {/* Single reason field for the whole batch */}
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: FS - 2, fontWeight: 700, color: T.textSec, display: "block", marginBottom: 4 }}>
          سبب الإرجاع (اختياري — لكل القطع في الجلسة)
        </label>
        <Inp value={reason} onChange={setReason} placeholder="مقاس غلط / عيب / إلخ..." />
      </div>

      {/* List grouped by customer */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {Object.entries(byCustomer).map(([custName, items]) => (
          <div key={custName} style={{ border: "1px solid " + T.brd, borderRadius: 8, overflow: "hidden" }}>
            <div style={{ padding: "8px 12px", background: "#F59E0B15", fontSize: FS - 1, fontWeight: 800, color: "#92400E" }}>
              👤 {custName} · {items.length} قطعة
            </div>
            {items.map(s => {
              const isSeries = s.piece.type === "series";
              const containedCount = Array.isArray(s.piece.containedPieceIds) ? s.piece.containedPieceIds.length : 0;
              return <div key={s.piece.id} style={{
                padding: "8px 12px", borderTop: "1px solid " + T.brd, fontSize: FS - 2,
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
                background: isSeries && containedCount > 0 ? "#F59E0B05" : "transparent",
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: T.text, fontWeight: 700 }}>
                    {isSeries && containedCount > 0 ? "🔗 " : ""}
                    {s.piece.modelNo}
                    {s.piece.size ? " · مقاس " + s.piece.size : ""}
                    {isSeries ? " · سيري" : ""}
                    {isSeries && containedCount > 0 && (
                      <label style={{ marginInlineStart: 8, fontSize: FS - 3, cursor: "pointer", color: s.cascadeSeries ? "#0EA5E9" : T.textMut }}>
                        <input type="checkbox" checked={s.cascadeSeries} onChange={() => toggleCascade(s.piece.id)} style={{ marginInlineEnd: 3, accentColor: "#0EA5E9" }} />
                        {s.cascadeSeries ? "إرجاع كامل (+" + containedCount + " قطعة)" : "إرجاع السيري بس"}
                      </label>
                    )}
                  </div>
                  <div style={{ fontFamily: "monospace", color: T.textMut, fontSize: FS - 3 }}>{s.piece.id}</div>
                </div>
                <span onClick={() => removeScan(s.piece.id)} style={{
                  cursor: "pointer", padding: "3px 8px", borderRadius: 6, background: "#EF444415",
                  color: "#EF4444", fontWeight: 700, fontSize: FS - 2,
                }}>✕</span>
              </div>;
            })}
          </div>
        ))}
      </div>
    </Card>}

    {scanned.length === 0 && !lastSummary && <div style={{
      padding: 24, textAlign: "center", color: T.textMut, fontSize: FS - 1,
      background: T.bg, borderRadius: 10, border: "1px dashed " + T.brd,
    }}>📷 افتح الكاميرا وامسح القطع المرتجعة (واحدة أو أكتر)</div>}
  </div>;
}

/* ═══════════════════════════════════════════════════════════════
   TAB 5 — Analytics (V19.85.0): aggregate stats over recent pieces
   ═══════════════════════════════════════════════════════════════
   Reads up to 1000 most recent pieces and aggregates client-side. Surfaces
   four lenses on the data:
     • Status snapshot (in_warehouse / with_customer / scrapped)
     • Top customers (by piece count currently held)
     • Top models (by production count)
     • Return rate per model (returned / sold), ordered desc
   For factories beyond 1000 pieces this reflects the most recent slice;
   server-side rollup would be needed for full historical aggregates. */
function AnalyticsTab({ T, FS }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  async function load() {
    setLoading(true); setErrMsg(""); setStats(null);
    try {
      const s = await getAggregatedStats({ limit: 1000 });
      setStats(s);
    } catch (e) {
      setErrMsg("خطأ في القراءة: " + (e?.message || e));
    } finally { setLoading(false); }
  }

  /* Auto-load on first mount */
  if (!stats && !loading && !errMsg) {
    setTimeout(load, 0);
  }

  return <div>
    <Card style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: FS - 1, color: T.textSec, lineHeight: 1.6, flex: 1, minWidth: 200 }}>
          إحصائيات شاملة على آخر 1000 قطعة منتجة. للـ factories بأكتر من ده، الأرقام بتعكس آخر شريحة من الإنتاج.
        </div>
        <Btn small onClick={load} disabled={loading} style={{
          background: "#EC4899", color: "#FFF", fontWeight: 700,
        }}>{loading ? "⏳ جاري التحميل..." : "🔄 تحديث"}</Btn>
      </div>
      {errMsg && <div style={{ marginTop: 8, padding: 8, borderRadius: 6, background: "#FEE2E2", color: "#B91C1C", wordBreak: "break-all", overflowWrap: "anywhere", fontSize: FS - 2 }}>
        ⚠️ {errMsg}
      </div>}
    </Card>

    {stats && <>
      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 14 }}>
        <KPICard color="#0EA5E9" label="إجمالي القطع" value={stats.total} hint={"عينة من " + stats.sampleSize + " doc"} />
        <KPICard color="#10B981" label="📦 في المخزن" value={stats.byStatus.in_warehouse || 0} />
        <KPICard color="#F59E0B" label="🛒 مع عملاء" value={stats.byStatus.with_customer || 0} />
        <KPICard color="#EF4444" label="🗑 تالفة/ملغية" value={stats.byStatus.scrapped || 0} />
        <KPICard color="#8B5CF6" label="🔗 سيريهات" value={stats.seriesTotal} />
      </div>

      {/* Top customers + Top models */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginBottom: 14 }}>
        <Card>
          <div style={{ fontSize: FS, fontWeight: 800, color: T.text, marginBottom: 10 }}>👥 أعلى 5 عملاء (قطع حالياً)</div>
          {Object.keys(stats.byCustomer).length === 0 ? <div style={{ color: T.textMut, fontSize: FS - 2, textAlign: "center", padding: 12 }}>مفيش قطع مع عملاء حالياً</div>
            : <RankList items={Object.entries(stats.byCustomer).map(([k, v]) => ({ label: k, count: v }))} top={5} color="#8B5CF6" T={T} FS={FS} />}
        </Card>
        <Card>
          <div style={{ fontSize: FS, fontWeight: 800, color: T.text, marginBottom: 10 }}>🏷 أعلى 5 موديلات (إنتاج)</div>
          {Object.keys(stats.byModel).length === 0 ? <div style={{ color: T.textMut, fontSize: FS - 2, textAlign: "center", padding: 12 }}>مفيش بيانات إنتاج</div>
            : <RankList items={Object.entries(stats.byModel).map(([k, v]) => ({ label: k, count: v.count, sub: v.modelDesc }))} top={5} color="#0EA5E9" T={T} FS={FS} />}
        </Card>
      </div>

      {/* Return rate per model */}
      <Card>
        <div style={{ fontSize: FS, fontWeight: 800, color: T.text, marginBottom: 10 }}>↩️ نسبة الإرجاع لكل موديل</div>
        <div style={{ fontSize: FS - 3, color: T.textMut, marginBottom: 8 }}>عدد الإرجاعات ÷ عدد البيعات. الأعلى نسبة في الأول — مؤشر محتمل لعيوب أو مشاكل في الموديل.</div>
        <ReturnRateTable returns={stats.returnsByModel} T={T} FS={FS} />
      </Card>
    </>}
  </div>;
}

function KPICard({ color, label, value, hint }) {
  return <div style={{
    padding: "12px 14px", borderRadius: 10,
    background: color + "0F", border: "1px solid " + color + "30",
  }}>
    <div style={{ fontSize: 11, color: color, fontWeight: 700, marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 900, color: color }}>{Number(value || 0).toLocaleString()}</div>
    {hint && <div style={{ fontSize: 9, color: "#94A3B8", marginTop: 2 }}>{hint}</div>}
  </div>;
}

function RankList({ items, top, color, T, FS }) {
  const sorted = items.sort((a, b) => b.count - a.count).slice(0, top || 5);
  const max = sorted[0]?.count || 1;
  return <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    {sorted.map((item, idx) => {
      const pct = (item.count / max) * 100;
      return <div key={item.label} style={{ position: "relative", padding: "8px 10px", borderRadius: 8, background: T.bg, overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, width: pct + "%", background: color + "15", transition: "width 0.4s" }} />
        <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: FS - 1, fontWeight: 700, color: T.text }}>
              <span style={{ color: color, fontWeight: 900, marginInlineEnd: 6 }}>#{idx + 1}</span>
              {item.label}
            </div>
            {item.sub && <div style={{ fontSize: FS - 4, color: T.textMut }}>{item.sub}</div>}
          </div>
          <div style={{ fontSize: FS, fontWeight: 800, color: color, whiteSpace: "nowrap" }}>{item.count}</div>
        </div>
      </div>;
    })}
  </div>;
}

function ReturnRateTable({ returns, T, FS }) {
  const rows = Object.entries(returns)
    .filter(([_, v]) => v.sold > 0)
    .map(([modelNo, v]) => ({
      modelNo,
      modelDesc: v.modelDesc,
      sold: v.sold,
      returned: v.returned,
      rate: v.sold > 0 ? (v.returned / v.sold) * 100 : 0,
    }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 15);

  if (rows.length === 0) return <div style={{ color: T.textMut, fontSize: FS - 2, textAlign: "center", padding: 12 }}>
    مفيش بيعات مسجّلة في العينة الحالية — استخدم تاب 📦 تسليم لتسجيل البيعات.
  </div>;

  return <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    {rows.map(r => {
      const color = r.rate >= 30 ? "#EF4444" : r.rate >= 15 ? "#F59E0B" : "#10B981";
      return <div key={r.modelNo} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid " + T.brd, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: FS - 1, fontWeight: 700, color: T.text }}>{r.modelNo}</div>
          {r.modelDesc && <div style={{ fontSize: FS - 4, color: T.textMut }}>{r.modelDesc}</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: FS - 3, color: T.textSec, whiteSpace: "nowrap" }}>
            {r.returned} / {r.sold}
          </div>
          <Pill color={color} bg={color + "20"} style={{ fontSize: FS - 1, minWidth: 56, textAlign: "center", justifyContent: "center" }}>
            {r.rate.toFixed(1)}%
          </Pill>
        </div>
      </div>;
    })}
  </div>;
}

/* ═══════════════════════════════════════════════════════════════
   TAB 4 — Customer history (V19.84.0): all pieces currently with X
   ═══════════════════════════════════════════════════════════════
   Pick a customer → see every tracked piece they're currently holding,
   grouped by model+size. Lets the warehouse keeper sanity-check a return
   ("does this customer even have a size 12?") and gives a quick glance at
   the customer's outstanding items. Pricing is best-effort — pulled from
   the parent order's sellPrice when available, otherwise hidden.
   ═══════════════════════════════════════════════════════════════ */
function CustomerTab({ data, T, FS }) {
  const customers = (data && data.customers) || [];
  const orders = (data && data.orders) || [];
  const [custId, setCustId] = useState("");
  const [pieces, setPieces] = useState(null); /* null = not loaded, [] = loaded but empty */
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  const cust = customers.find(c => c.id === custId);
  const custName = cust?.name || "";

  async function loadPieces() {
    if (!custId) return;
    setLoading(true); setErrMsg(""); setPieces(null);
    try {
      const list = await getCurrentPiecesForCustomer(custId, { limit: 500 });
      setPieces(list);
    } catch (e) {
      setErrMsg("خطأ في القراءة: " + (e?.message || e));
      setPieces([]);
    } finally { setLoading(false); }
  }

  /* Auto-load when customer changes */
  if (custId && pieces === null && !loading) {
    /* Defer to next tick so we don't trigger inside render */
    setTimeout(loadPieces, 0);
  }

  /* Group by modelNo + size for the summary card */
  const groups = {};
  let totalCount = 0;
  let totalValue = 0;
  let valueIsExact = true;
  (pieces || []).forEach(p => {
    if (p.type === "series") return; /* avoid double-counting (the series + its pieces both come back) */
    totalCount++;
    const k = p.modelNo + (p.size ? " · مقاس " + p.size : "");
    if (!groups[k]) groups[k] = { count: 0, modelNo: p.modelNo, size: p.size, ids: [] };
    groups[k].count++;
    groups[k].ids.push(p.id);
    const order = orders.find(o => o.id === p.orderId);
    const price = Number(order?.sellPrice) || 0;
    if (price > 0) totalValue += price;
    else valueIsExact = false;
  });

  return <div>
    <Card style={{ marginBottom: 14 }}>
      <div style={{ marginBottom: 6, fontSize: FS - 1, color: T.textSec, lineHeight: 1.6 }}>
        اختر عميل وشوف كل القطع اللي عنده دلوقتي. مفيد بعد scan لمرتجع مجهول — تعرف العميل، تيجي هنا تتأكد من اللي عنده وتحدد لو الإرجاع منطقي.
      </div>
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: FS - 1, fontWeight: 700, color: T.textSec, marginBottom: 4, display: "block" }}>العميل</label>
        <SearchSel value={custId} onChange={v => { setCustId(v); setPieces(null); }}
          options={customers.map(c => ({ value: c.id, label: c.name + (c.phone ? " — " + c.phone : "") }))}
          placeholder="اختر عميل..." />
      </div>
      {custId && <div style={{ display: "flex", gap: 8 }}>
        <Btn small onClick={loadPieces} disabled={loading} style={{
          background: "#8B5CF6", color: "#FFF", fontWeight: 700,
        }}>{loading ? "⏳ جاري التحميل..." : "🔄 تحديث"}</Btn>
      </div>}
      {errMsg && <div style={{ marginTop: 8, padding: 8, borderRadius: 6, background: "#FEE2E2", color: "#B91C1C", wordBreak: "break-all", overflowWrap: "anywhere", fontSize: FS - 2 }}>
        ⚠️ {errMsg}
      </div>}
    </Card>

    {custId && pieces !== null && pieces.length === 0 && !loading && (
      <Card style={{ padding: 24, textAlign: "center", color: T.textMut }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>📭</div>
        <div style={{ fontSize: FS, fontWeight: 700 }}>مفيش قطع تتبع حالياً مع <b style={{ color: T.text }}>{custName}</b></div>
        <div style={{ fontSize: FS - 2, marginTop: 6 }}>
          إما إن العميل ده ما اشتراش قطع متتبَّعة (ممكن قطع legacy)، أو القطع اتـ return-ت بالفعل.
        </div>
      </Card>
    )}

    {pieces !== null && pieces.length > 0 && <>
      {/* Summary card */}
      <Card style={{ marginBottom: 14, background: "#8B5CF608", border: "1px solid #8B5CF625" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontSize: FS + 2, fontWeight: 800, color: T.text }}>
              📊 {custName}
            </div>
            <div style={{ fontSize: FS - 2, color: T.textSec }}>
              {totalCount} قطعة في {Object.keys(groups).length} موديل/مقاس
            </div>
          </div>
          {totalValue > 0 && <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: FS - 2, color: T.textMut }}>إجمالي تقريبي</div>
            <div style={{ fontSize: FS + 4, fontWeight: 900, color: "#8B5CF6" }}>
              {fmt(totalValue)} ج.م
              {!valueIsExact && <span style={{ fontSize: FS - 3, color: T.textMut, fontWeight: 400, marginInlineStart: 4 }}>(تقريبي)</span>}
            </div>
          </div>}
        </div>
      </Card>

      {/* Grouped breakdown */}
      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontSize: FS, fontWeight: 800, color: T.text, marginBottom: 10 }}>📋 التوزيع حسب الموديل/المقاس</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {Object.entries(groups).sort((a, b) => b[1].count - a[1].count).map(([k, g]) => {
            const order = orders.find(o => o.modelNo === g.modelNo);
            const price = Number(order?.sellPrice) || 0;
            const value = price * g.count;
            return <div key={k} style={{
              padding: "10px 12px", borderRadius: 8, background: T.bg, border: "1px solid " + T.brd,
              display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: FS, fontWeight: 700, color: T.text }}>{k}</div>
                {order?.modelDesc && <div style={{ fontSize: FS - 3, color: T.textMut }}>{order.modelDesc}</div>}
              </div>
              <div style={{ textAlign: "left" }}>
                <Pill color="#8B5CF6" bg="#EDE9FE" style={{ fontSize: FS }}>× {g.count}</Pill>
                {price > 0 && <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 2 }}>{fmt(value)} ج.م</div>}
              </div>
            </div>;
          })}
        </div>
      </Card>

      {/* Detailed pieces list */}
      <Card>
        <div style={{ fontSize: FS, fontWeight: 800, color: T.text, marginBottom: 8 }}>
          🔍 تفاصيل كل القطع ({totalCount})
        </div>
        <div style={{ maxHeight: 460, overflowY: "auto", border: "1px solid " + T.brd, borderRadius: 8 }}>
          {(pieces || []).filter(p => p.type !== "series").map(p => {
            const order = orders.find(o => o.id === p.orderId);
            const lastSold = (p.history || []).filter(h => h.action === "sold").pop();
            return <div key={p.id} style={{
              padding: "10px 12px", borderBottom: "1px solid " + T.brd, fontSize: FS - 2,
              display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: T.text, fontWeight: 700 }}>
                  {p.modelNo}
                  {p.size ? " · مقاس " + p.size : ""}
                  {p.parentSeriesId ? <span style={{ marginInlineStart: 6, fontSize: FS - 4, color: "#0EA5E9" }}>🔗 ضمن سيري</span> : null}
                </div>
                {order?.modelDesc && <div style={{ fontSize: FS - 3, color: T.textMut }}>{order.modelDesc}</div>}
                <div style={{ fontFamily: "monospace", fontSize: FS - 4, color: T.textMut, marginTop: 2 }}>{p.id}</div>
              </div>
              {lastSold && <div style={{ fontSize: FS - 3, color: T.textSec, textAlign: "left" }}>
                اتباعت: {(lastSold.date || "").slice(0, 10)}
              </div>}
            </div>;
          })}
        </div>
      </Card>
    </>}
  </div>;
}

/* ═══════════════════════════════════════════════════════════════
   TAB 6 — Packing (V19.87.0): link existing piece QRs to a series
   ═══════════════════════════════════════════════════════════════
   Scenario this fixes: pieces were printed in piece-mode (not linked-series),
   then later need to be packed into a box that has its own series QR. The
   user scans the series QR first, then the piece QRs going into it. Confirm
   writes parentSeriesId on each piece + extends containedPieceIds on the
   series — same shape as if they were printed via the linked-series mode.

   Validation: pieces must be in_warehouse and not already in another series;
   series must be in_warehouse and have type="series". Atomic batch write. */
function PackingTab({ T, FS, user }) {
  const [series, setSeries] = useState(null);     /* { piece doc } */
  const [pieces, setPieces] = useState([]);       /* [{piece, scannedAt}] */
  const [scanActive, setScanActive] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [success, setSuccess] = useState(null);

  const scannedIds = new Set(pieces.map(p => p.piece.id));

  async function handleScan(text) {
    setErrMsg(""); setSuccess(null);
    const parsed = parseQr(text);
    if (parsed.kind !== "piece") {
      const msg = parsed.kind === "legacy" ? "⚠️ ده QR قديم بدون تتبع" : "⚠️ ده مش CLARK QR";
      setErrMsg(msg); showToast(msg); return;
    }
    try {
      const p = await getPiece(parsed.pieceId);
      if (!p) { showToast("❌ القطعة مش موجودة"); return; }
      if (p.status !== "in_warehouse") {
        showToast("⚠️ القطعة في الحالة: " + (STATUS_LABEL[p.status]?.label || p.status) + " — مش ممكن تعبئتها");
        return;
      }
      /* First scan must be a series */
      if (!series) {
        if (p.type !== "series") {
          showToast("⚠️ امسح أولاً QR السيري (الكرتونة الخارجية)");
          return;
        }
        setSeries(p);
        showToast("📦 تم اختيار السيري — كمل scan للقطع جواه");
        return;
      }
      /* Subsequent scans must be pieces */
      if (p.type === "series") {
        showToast("⚠️ ده QR سيري تاني — مش ممكن تحطه جوا سيري");
        return;
      }
      if (p.parentSeriesId && p.parentSeriesId !== series.id) {
        showToast("⚠️ القطعة دي ضمن سيري تاني (" + p.parentSeriesId + ") — مش ممكن نقلها");
        return;
      }
      if (scannedIds.has(p.id)) {
        showToast("⚠️ القطعة دي اتعملها scan قبل كده في الجلسة دي"); return;
      }
      /* Already linked? Skip */
      const alreadyContained = Array.isArray(series.containedPieceIds) && series.containedPieceIds.includes(p.id);
      if (alreadyContained) {
        showToast("ℹ️ القطعة مرتبطة بالسيري ده فعلاً — مفيش حاجة للتغيير"); return;
      }
      setPieces(prev => [...prev, { piece: p, scannedAt: Date.now() }]);
    } catch (e) {
      setErrMsg("خطأ: " + (e?.message || e));
    }
  }

  function removeScan(pieceId) {
    setPieces(prev => prev.filter(p => p.piece.id !== pieceId));
  }

  async function reset() {
    setSeries(null); setPieces([]); setErrMsg(""); setSuccess(null); setScanActive(false);
  }

  async function confirmPacking() {
    if (!series) { showToast("⚠️ اختر السيري أولاً"); return; }
    if (pieces.length === 0) { showToast("⚠️ مفيش قطع في السيري"); return; }
    const ok = await ask(
      "تأكيد التعبئة",
      "هتربط " + pieces.length + " قطعة بالسيري " + series.id + ". الإجراء ده يـ update الـ DB."
    );
    if (!ok) return;
    setConfirming(true);
    try {
      const r = await linkPiecesToSeries(series.id, pieces.map(p => p.piece.id), { by: user?.email || "" });
      if (r.ok) {
        setSuccess({ packed: r.packed, totalInSeries: r.totalInSeries, seriesId: series.id });
        showToast("✓ تم تعبئة " + r.packed + " قطعة في السيري — إجمالي " + r.totalInSeries);
        await reset();
      } else {
        showToast("⛔ فشلت التعبئة: " + r.error + (r.conflicts ? " (" + r.conflicts.length + " conflicts)" : ""));
        if (r.conflicts) setErrMsg("Conflicts: " + r.conflicts.slice(0, 3).map(c => c.id + " (" + c.reason + ")").join(" · "));
      }
    } catch (e) {
      showToast("⛔ خطأ: " + (e?.message || e));
    } finally {
      setConfirming(false);
    }
  }

  return <div>
    <Card style={{ marginBottom: 14 }}>
      <div style={{ fontSize: FS - 1, color: T.textSec, lineHeight: 1.6, marginBottom: 10 }}>
        💡 اربط قطع منفصلة بسيري موجود (post-print packing). امسح أولاً QR السيري (الكرتونة) ثم QR كل قطعة هتدخل جواه. مفيد لو طبعت السيريهات والقطع منفصلين وعاوز تربطهم وقت التعبئة.
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Btn small onClick={() => setScanActive(s => !s)} style={{
          background: scanActive ? "#EF4444" : "#06B6D4", color: "#FFF", fontWeight: 700,
        }}>{scanActive ? "✕ إيقاف الكاميرا" : (series ? "📷 مسح القطع" : "📷 ابدأ بمسح السيري")}</Btn>
        {(series || pieces.length > 0) && <Btn small onClick={reset} style={{
          background: "transparent", color: T.textSec, border: "1px solid " + T.brd,
        }}>🔄 إعادة التعيين</Btn>}
      </div>
      {scanActive && <div style={{ marginTop: 10 }}>
        <QrScanner active={scanActive} onScan={handleScan} onError={msg => setErrMsg(msg)} height={240} />
      </div>}
      {errMsg && <div style={{ marginTop: 8, padding: 8, borderRadius: 6, background: "#FEE2E2", color: "#B91C1C", wordBreak: "break-all", overflowWrap: "anywhere", fontSize: FS - 2 }}>
        ⚠️ {errMsg}
      </div>}
    </Card>

    {success && <Card style={{ marginBottom: 14, background: "#D1FAE5", border: "1px solid #10B981" }}>
      <div style={{ fontSize: FS + 2, fontWeight: 800, color: "#065F46" }}>
        ✓ تم التعبئة بنجاح
      </div>
      <div style={{ fontSize: FS - 1, color: "#065F46", marginTop: 4 }}>
        ربطنا <b>{success.packed}</b> قطعة جديدة بالسيري — إجمالي القطع المرتبطة دلوقتي: <b>{success.totalInSeries}</b>
      </div>
    </Card>}

    {series && <Card style={{ marginBottom: 14, border: "2px solid #06B6D4" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: FS, fontWeight: 800, color: "#06B6D4" }}>📦 السيري المختار</div>
          <div style={{ fontSize: FS + 2, fontWeight: 900, color: T.text, marginTop: 4 }}>{series.modelNo}</div>
          <div style={{ fontSize: FS - 2, color: T.textSec, marginTop: 2 }}>{series.modelDesc || "—"}</div>
          <div style={{ fontFamily: "monospace", fontSize: FS - 3, color: T.textMut, marginTop: 4 }}>{series.id}</div>
        </div>
        <div style={{ textAlign: "left" }}>
          <div style={{ fontSize: FS - 3, color: T.textMut }}>قطع مرتبطة دلوقتي</div>
          <div style={{ fontSize: FS + 4, fontWeight: 900, color: "#06B6D4" }}>
            {(series.containedPieceIds || []).length} → {(series.containedPieceIds || []).length + pieces.length}
          </div>
        </div>
      </div>

      {pieces.length > 0 && <div style={{ borderTop: "1px solid " + T.brd, paddingTop: 10 }}>
        <div style={{ fontSize: FS - 1, fontWeight: 700, color: T.text, marginBottom: 6 }}>
          🔗 قطع جديدة هتنضاف للسيري ({pieces.length})
        </div>
        <div style={{ maxHeight: 240, overflowY: "auto", border: "1px solid " + T.brd, borderRadius: 8 }}>
          {[...pieces].reverse().map(s => (
            <div key={s.piece.id} style={{
              padding: "8px 12px", borderBottom: "1px solid " + T.brd, fontSize: FS - 2,
              display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: T.text, fontWeight: 700 }}>
                  {s.piece.modelNo}
                  {s.piece.size ? " · مقاس " + s.piece.size : ""}
                </div>
                <div style={{ fontFamily: "monospace", color: T.textMut, fontSize: FS - 3 }}>{s.piece.id}</div>
              </div>
              <span onClick={() => removeScan(s.piece.id)} style={{
                cursor: "pointer", padding: "3px 8px", borderRadius: 6, background: "#EF444415",
                color: "#EF4444", fontWeight: 700, fontSize: FS - 2,
              }}>✕</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <Btn small onClick={confirmPacking} disabled={confirming} style={{
            background: "#06B6D4", color: "#FFF", fontWeight: 800, fontSize: FS,
          }}>{confirming ? "⏳ جاري الحفظ..." : "✓ تأكيد التعبئة (" + pieces.length + " قطعة)"}</Btn>
        </div>
      </div>}
    </Card>}

    {!series && pieces.length === 0 && !success && <div style={{
      padding: 24, textAlign: "center", color: T.textMut, fontSize: FS - 1,
      background: T.bg, borderRadius: 10, border: "1px dashed " + T.brd,
    }}>📷 افتح الكاميرا وابدأ بمسح QR السيري (الكرتونة الخارجية)</div>}
  </div>;
}

/* ═══════════════════════════════════════════════════════════════
   Shared cards
   ═══════════════════════════════════════════════════════════════ */
function ResultCard({ result, T, FS, onScrap }) {
  if (result.kind === "unknown") {
    return <Card style={{ padding: 16, background: "#FEF3C7", border: "1px solid #FDE68A" }}>
      <div style={{ fontSize: FS, fontWeight: 800, color: "#92400E", marginBottom: 4 }}>⚠️ QR غير معروف</div>
      <div style={{ fontSize: FS - 2, color: "#78350F" }}>
        النص اللي اتـ scan: <code style={{ fontFamily: "monospace", padding: "2px 6px", background: "#FEF9C3", borderRadius: 4 }}>{result.raw}</code>
      </div>
    </Card>;
  }
  if (result.kind === "legacy") {
    return <Card style={{ padding: 16, background: "#F1F5F9", border: "1px solid " + T.brd }}>
      <div style={{ fontSize: FS + 2, fontWeight: 800, color: T.text, marginBottom: 6 }}>🏷 QR قديم (بدون تتبع فردي)</div>
      {result.found ? <div>
        <div style={{ fontSize: FS - 1, color: T.textSec, marginBottom: 4 }}>
          الموديل: <b style={{ color: T.text }}>{result.modelNo}</b> — {result.modelDesc || ""}
        </div>
        <div style={{ fontSize: FS - 1, color: T.textSec }}>الكمية: <b>{result.qty}</b></div>
      </div> : <div style={{ fontSize: FS - 2, color: T.textMut }}>الـ orderId غير موجود.</div>}
      <div style={{ marginTop: 10, padding: 10, background: "#FEF3C7", borderRadius: 8, fontSize: FS - 2, color: "#78350F", lineHeight: 1.6 }}>
        💡 الـ QR ده اتطبع قبل V19.81. لتفعيل التتبع لقطع جديدة، اطبع QR جديد من زر <b>"طباعة QR"</b> في الصفحة الرئيسية.
      </div>
    </Card>;
  }
  if (result.kind === "piece") {
    if (!result.found) {
      return <Card style={{ padding: 16, background: "#FEE2E2", border: "1px solid #FCA5A5" }}>
        <div style={{ fontSize: FS + 1, fontWeight: 800, color: "#991B1B" }}>❌ القطعة غير موجودة</div>
        <div style={{ fontSize: FS - 2, color: "#7F1D1D", marginTop: 6 }}>
          الـ pieceId: <code>{result.pieceId}</code>
        </div>
      </Card>;
    }
    const p = result.piece;
    const status = STATUS_LABEL[p.status] || STATUS_LABEL.in_warehouse;
    return <Card style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: FS + 4, fontWeight: 900, color: T.accent }}>{p.modelNo}</div>
          <div style={{ fontSize: FS - 1, color: T.textSec }}>{p.modelDesc || "—"}</div>
          <div style={{ fontSize: FS - 2, color: T.textMut, marginTop: 4 }}>
            {p.type === "series" ? "🎁 سيري كامل" : "👕 قطعة"}
            {p.size ? " · مقاس: " + p.size : ""}
            {p.seriesQty ? " · " + p.seriesQty + " قطعة" : ""}
            {p.isSecondGrade ? " · " : ""}
            {p.isSecondGrade ? <Pill color="#92400E" bg="#FEF3C7">QC-2</Pill> : null}
          </div>
        </div>
        <Pill color={status.color} bg={status.bg} style={{ fontSize: FS }}>
          {status.icon} {status.label}
          {p.currentCustomerName ? " — " + p.currentCustomerName : ""}
        </Pill>
      </div>
      {/* V19.83.0 — show contained pieces if this is a linked series */}
      {p.type === "series" && Array.isArray(p.containedPieceIds) && p.containedPieceIds.length > 0 && (
        <div style={{ borderTop: "1px solid " + T.brd, paddingTop: 12, marginTop: 8 }}>
          <div style={{ fontSize: FS - 2, color: T.textSec, marginBottom: 6, fontWeight: 700 }}>
            🔗 السيري ده فيه {p.containedPieceIds.length} قطعة مرتبطة:
          </div>
          {Array.isArray(result.containedPieces) && result.containedPieces.length > 0 ? (
            <div style={{ border: "1px solid " + T.brd, borderRadius: 8, overflow: "hidden" }}>
              {result.containedPieces.map(cp => {
                const cs = STATUS_LABEL[cp.status] || STATUS_LABEL.in_warehouse;
                return <div key={cp.id} style={{
                  padding: "6px 10px", borderBottom: "1px solid " + T.brd, fontSize: FS - 2,
                  display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: T.text, fontWeight: 700 }}>
                      {cp.size ? "مقاس " + cp.size : "قطعة"}
                      {cp.currentCustomerName ? " · مع " + cp.currentCustomerName : ""}
                    </div>
                    <div style={{ fontFamily: "monospace", color: T.textMut, fontSize: FS - 3 }}>{cp.id}</div>
                  </div>
                  <Pill color={cs.color} bg={cs.bg}>{cs.icon} {cs.label}</Pill>
                </div>;
              })}
            </div>
          ) : <div style={{ fontSize: FS - 3, color: T.textMut }}>(جاري قراءة بيانات القطع...)</div>}
        </div>
      )}
      {/* V19.83.0 — if this piece is INSIDE a series, link back to the series */}
      {p.parentSeriesId && (
        <div style={{ marginTop: 8, padding: "6px 10px", background: "#0EA5E908", border: "1px solid #0EA5E925", borderRadius: 6, fontSize: FS - 2, color: T.textSec }}>
          🔗 القطعة دي ضمن سيري — <code style={{ fontFamily: "monospace", fontSize: FS - 3 }}>{p.parentSeriesId}</code>
        </div>
      )}
      <div style={{ borderTop: "1px solid " + T.brd, paddingTop: 12, marginTop: 8 }}>
        <div style={{ fontSize: FS - 2, color: T.textSec, marginBottom: 8, fontWeight: 700 }}>
          📜 دورة حياة القطعة ({(p.history || []).length} حدث)
        </div>
        <Timeline events={p.history || []} T={T} FS={FS} />
      </div>
      <div style={{ marginTop: 12, fontSize: FS - 3, color: T.textMut, fontFamily: "monospace" }}>
        ID: {p.id} · Order: {p.orderId || "—"} · أُنتجت: {p.productionDate || "—"}
      </div>
      {/* V19.87.0 — Scrap action. Hide if already scrapped. */}
      {onScrap && p.status !== "scrapped" && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed " + T.brd, display: "flex", justifyContent: "flex-end" }}>
          <Btn small onClick={() => onScrap(p.id, p.modelNo)} style={{
            background: "#FEE2E2", color: "#991B1B", border: "1px solid #FCA5A5", fontWeight: 700,
          }}>🗑 إتلاف القطعة</Btn>
        </div>
      )}
    </Card>;
  }
  return null;
}

function Timeline({ events, T, FS }) {
  if (!events || events.length === 0) return <div style={{ color: T.textMut, fontSize: FS - 2 }}>—</div>;
  const ordered = [...events].reverse();
  return <div style={{ borderInlineStart: "2px solid " + T.brd, paddingInlineStart: 12, marginInlineStart: 8 }}>
    {ordered.map((e, i) => {
      const meta = ACTION_LABEL[e.action] || { label: e.action, color: T.textSec, icon: "•" };
      return <div key={i} style={{ position: "relative", paddingBottom: 14 }}>
        <span style={{
          position: "absolute", insetInlineStart: -22, top: 2, width: 18, height: 18, borderRadius: 99,
          background: meta.color + "20", color: meta.color, fontSize: 11,
          display: "inline-flex", alignItems: "center", justifyContent: "center", border: "2px solid #FFF",
        }}>{meta.icon}</span>
        <div style={{ fontSize: FS - 1, fontWeight: 700, color: meta.color }}>{meta.label}</div>
        <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 2 }}>{_fmtDateTime(e.date)}</div>
        {e.action === "sold" && <div style={{ fontSize: FS - 2, color: T.textSec, marginTop: 3 }}>
          العميل: <b style={{ color: T.text }}>{e.customerName || "—"}</b>
          {e.deliveryId ? <span style={{ fontFamily: "monospace", fontSize: FS - 3, color: T.textMut, marginInlineStart: 6 }}>· delivery: {e.deliveryId}</span> : null}
        </div>}
        {e.action === "returned" && <div style={{ fontSize: FS - 2, color: T.textSec, marginTop: 3 }}>
          من العميل: <b style={{ color: T.text }}>{e.fromCustomerName || "—"}</b>
          {e.reason ? <div style={{ marginTop: 2 }}>السبب: {e.reason}</div> : null}
        </div>}
        {e.action === "released" && <div style={{ fontSize: FS - 2, color: T.textSec, marginTop: 3 }}>
          {e.note || "— release"}
          {e.fromCustomerName ? <div style={{ marginTop: 2 }}>كانت محجوزة لـ {e.fromCustomerName}</div> : null}
        </div>}
        {e.by && <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 2 }}>بواسطة: {e.by}</div>}
      </div>;
    })}
  </div>;
}

function SearchResultsList({ results, T, FS, onPick }) {
  if (!results) return null;
  const arr = results.results || [];
  if (arr.length === 0) return <div style={{ marginTop: 10, padding: 10, fontSize: FS - 2, color: T.textMut, textAlign: "center" }}>
    لا توجد قطع متتبَّعة لموديل <b>{results.modelNo}</b>.
  </div>;
  return <div style={{ marginTop: 10 }}>
    <div style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, marginBottom: 6 }}>
      آخر {arr.length} قطعة من الموديل <b style={{ color: T.text }}>{results.modelNo}</b>:
    </div>
    <div style={{ maxHeight: 280, overflowY: "auto", border: "1px solid " + T.brd, borderRadius: 8 }}>
      {arr.map(p => {
        const status = STATUS_LABEL[p.status] || STATUS_LABEL.in_warehouse;
        return <div key={p.id} onClick={() => onPick(p)} style={{
          padding: "8px 12px", borderBottom: "1px solid " + T.brd, cursor: "pointer", fontSize: FS - 2,
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "monospace", color: T.textMut, fontSize: FS - 3 }}>{p.id}</div>
            <div style={{ color: T.text }}>
              {p.size ? "مقاس " + p.size : (p.type === "series" ? "سيري كامل" : "قطعة")}
              {p.currentCustomerName ? " · مع " + p.currentCustomerName : ""}
            </div>
          </div>
          <Pill color={status.color} bg={status.bg}>
            {status.icon} {status.label}
          </Pill>
        </div>;
      })}
    </div>
  </div>;
}
