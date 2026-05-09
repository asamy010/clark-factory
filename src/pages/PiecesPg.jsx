/* ════════════════════════════════════════════════════════════════════════
   CLARK · PiecesPg — V19.81.0
   ──────────────────────────────────────────────────────────────────────
   Lookup page for tracked pieces. Scan a QR (or paste/type the id) and see:
     - production info (model, size, order, date)
     - current status (in warehouse / with customer / scrapped)
     - full lifecycle timeline (every produced/sold/returned/released event)
     - when scanning a legacy QR (CLARK:orderId:qty pre-V19.81), display the
       order info + a hint to print a new tracked QR

   Manual fallback: search by modelNo for cases where the sticker is damaged.
   Returns the most recent N pieces of that model so the user can pick the
   one most likely shipped to the customer in question.
   ════════════════════════════════════════════════════════════════════════ */

import { useState } from "react";
import { Btn, Card, Inp, SearchSel } from "../components/ui.jsx";
import { QrScanner } from "../components/QrScanner.jsx";
import { parseQr, lookupQr, searchByModel } from "../utils/pieces.js";
import { fmt } from "../utils/format.js";

/* Tiny typed-icon tag — same style language as TreasuryPg badges. */
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
    const date = d.toISOString().slice(0, 10);
    const time = d.toTimeString().slice(0, 5);
    return date + " · " + time;
  } catch (_) { return iso; }
}

export default function PiecesPg({ data, isMob, T, FS }) {
  const _T = T || { text: "#1E293B", textSec: "#64748B", textMut: "#94A3B8", brd: "#E2E8F0", bg: "#F8FAFC", cardSolid: "#FFF", accent: "#0EA5E9", inputBg: "#FFF" };
  const _FS = FS || 14;

  const [scanActive, setScanActive] = useState(false);
  const [manualQr, setManualQr] = useState("");
  const [result, setResult] = useState(null);     /* the lookup result for display */
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [searchModel, setSearchModel] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);

  const orders = (data && data.orders) || [];

  async function doLookup(rawQr) {
    if (!rawQr) return;
    setLoading(true);
    setErrMsg("");
    setResult(null);
    try {
      const parsed = parseQr(rawQr);
      const r = await lookupQr(parsed, { orders });
      setResult({ raw: rawQr, ...r });
    } catch (e) {
      setErrMsg("خطأ في الاستعلام: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  function handleScan(text) {
    setManualQr(text);
    setScanActive(false); /* close camera after first successful scan */
    doLookup(text);
  }

  async function doModelSearch() {
    if (!searchModel) return;
    setSearching(true);
    setSearchResults(null);
    try {
      const order = orders.find(o => o.modelNo === searchModel || o.id === searchModel);
      const modelNo = order ? order.modelNo : searchModel;
      const results = await searchByModel(modelNo, { limit: 50 });
      setSearchResults({ modelNo, results });
    } catch (e) {
      setErrMsg("خطأ في البحث: " + (e?.message || e));
    } finally {
      setSearching(false);
    }
  }

  return <div style={{ direction: "rtl", padding: isMob ? 12 : 20, maxWidth: 900, margin: "0 auto" }}>
    {/* ── Page header ── */}
    <div style={{ marginBottom: 16 }}>
      <h1 style={{ fontSize: _FS + 8, fontWeight: 800, color: _T.text, marginBottom: 6 }}>🔍 استعلام عن قطعة</h1>
      <div style={{ fontSize: _FS - 1, color: _T.textSec, lineHeight: 1.6 }}>
        امسح الـ QR أو ادخل رقمه يدوياً — هتعرف وصلت لمين، رجعت إمتى، واتباعت تاني لمين.
      </div>
    </div>

    {/* ── Scan + manual input ── */}
    <Card style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <Btn small onClick={() => { setScanActive(s => !s); setResult(null); }} style={{
          background: scanActive ? "#EF4444" : "#0EA5E9", color: "#FFF", fontWeight: 700,
        }}>
          {scanActive ? "✕ إيقاف الكاميرا" : "📷 فتح الكاميرا"}
        </Btn>
        <div style={{ flex: 1, minWidth: 200, display: "flex", gap: 6 }}>
          <Inp value={manualQr} onChange={setManualQr} placeholder="أو الصق/اكتب الـ QR هنا (CLARK:P:p_xxx)" />
          <Btn small onClick={() => doLookup(manualQr)} disabled={loading || !manualQr} style={{
            background: _T.accent, color: "#FFF", fontWeight: 700, whiteSpace: "nowrap",
          }}>
            {loading ? "..." : "🔍 ابحث"}
          </Btn>
        </div>
      </div>

      {scanActive && <div style={{ marginBottom: 12 }}>
        <QrScanner active={scanActive} onScan={handleScan} onError={msg => setErrMsg(msg)} height={280} />
      </div>}

      {errMsg && <div style={{ padding: 10, borderRadius: 8, background: "#FEE2E2", color: "#B91C1C", fontWeight: 700, fontSize: _FS - 2 }}>
        ⚠️ {errMsg}
      </div>}
    </Card>

    {/* ── Result display ── */}
    {result && <ResultCard result={result} T={_T} FS={_FS} />}

    {/* ── Manual fallback: search by modelNo ── */}
    <Card style={{ marginTop: 16 }}>
      <div style={{ marginBottom: 8 }}>
        <h3 style={{ fontSize: _FS + 2, fontWeight: 800, color: _T.text, marginBottom: 4 }}>
          🛠 البحث اليدوي (لو الـ sticker مكسور)
        </h3>
        <div style={{ fontSize: _FS - 2, color: _T.textSec }}>
          اختر موديل واطبع آخر القطع اللي اتنتجت منه — تقدر تختار اللي راحت لعميل معين بناءً على التاريخ.
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
        }}>
          {searching ? "..." : "ابحث"}
        </Btn>
      </div>
      {searchResults && <SearchResultsList results={searchResults} T={_T} FS={_FS} onPick={p => doLookup(p.qrCode)} />}
    </Card>
  </div>;
}

function ResultCard({ result, T, FS }) {
  if (result.kind === "unknown") {
    return <Card style={{ padding: 16, background: "#FEF3C7", border: "1px solid #FDE68A" }}>
      <div style={{ fontSize: FS, fontWeight: 800, color: "#92400E", marginBottom: 4 }}>⚠️ QR غير معروف</div>
      <div style={{ fontSize: FS - 2, color: "#78350F" }}>
        النص اللي اتـ scan: <code style={{ fontFamily: "monospace", padding: "2px 6px", background: "#FEF9C3", borderRadius: 4 }}>{result.raw}</code>
      </div>
      <div style={{ fontSize: FS - 2, color: "#78350F", marginTop: 6 }}>
        ده مش CLARK QR. تأكد إنك بتمسح الـ QR الصح.
      </div>
    </Card>;
  }

  if (result.kind === "legacy") {
    return <Card style={{ padding: 16, background: "#F1F5F9", border: "1px solid " + T.brd }}>
      <div style={{ fontSize: FS + 2, fontWeight: 800, color: T.text, marginBottom: 6 }}>
        🏷 QR قديم (بدون تتبع فردي)
      </div>
      {result.found ? <div>
        <div style={{ fontSize: FS - 1, color: T.textSec, marginBottom: 4 }}>
          الموديل: <b style={{ color: T.text }}>{result.modelNo}</b> — {result.modelDesc || ""}
        </div>
        <div style={{ fontSize: FS - 1, color: T.textSec }}>الكمية المعنية: <b>{result.qty}</b></div>
      </div> : <div style={{ fontSize: FS - 2, color: T.textMut }}>الـ orderId غير موجود في قاعدة البيانات.</div>}
      <div style={{ marginTop: 10, padding: 10, background: "#FEF3C7", borderRadius: 8, fontSize: FS - 2, color: "#78350F", lineHeight: 1.6 }}>
        💡 الـ QR ده اتطبع قبل V19.81 ومش مرتبط بقطعة فردية. لتفعيل تتبع كامل لقطع جديدة من الموديل ده، اطبع QR جديد من زر <b>"طباعة QR"</b> في الصفحة الرئيسية.
      </div>
    </Card>;
  }

  if (result.kind === "piece") {
    if (!result.found) {
      return <Card style={{ padding: 16, background: "#FEE2E2", border: "1px solid #FCA5A5" }}>
        <div style={{ fontSize: FS + 1, fontWeight: 800, color: "#991B1B" }}>❌ القطعة غير موجودة</div>
        <div style={{ fontSize: FS - 2, color: "#7F1D1D", marginTop: 6 }}>
          الـ pieceId: <code>{result.pieceId}</code>. ممكن تكون اتـ delete من النظام أو مش معمول لها doc أصلاً.
        </div>
      </Card>;
    }
    const p = result.piece;
    const status = STATUS_LABEL[p.status] || STATUS_LABEL.in_warehouse;
    return <Card style={{ padding: 16 }}>
      {/* Header */}
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

      <div style={{ borderTop: "1px solid " + T.brd, paddingTop: 12 }}>
        <div style={{ fontSize: FS - 2, color: T.textSec, marginBottom: 8, fontWeight: 700 }}>
          📜 دورة حياة القطعة ({(p.history || []).length} حدث)
        </div>
        <Timeline events={p.history || []} T={T} FS={FS} />
      </div>

      <div style={{ marginTop: 12, fontSize: FS - 3, color: T.textMut, fontFamily: "monospace" }}>
        ID: {p.id} · Order: {p.orderId || "—"} · أُنتجت: {p.productionDate || "—"}
      </div>
    </Card>;
  }
  return null;
}

function Timeline({ events, T, FS }) {
  if (!events || events.length === 0) return <div style={{ color: T.textMut, fontSize: FS - 2 }}>—</div>;
  /* Show newest at top so the customer's most recent destination is obvious. */
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
    لا توجد قطع متتبَّعة لموديل <b>{results.modelNo}</b> في قاعدة البيانات.
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
