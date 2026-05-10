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

import { useState } from "react";
import { Btn, Card, LoadingBtn } from "./ui.jsx";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { ask, showToast } from "../utils/popups.js";
import { fetchDiagnostics, splitShopifyCollections } from "../utils/shopify/shopifyClient.js";

export function DiagnosticsPanel({ data, canEdit, user, isMob }){
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [splitBusy, setSplitBusy] = useState(false);
  const [splitResult, setSplitResult] = useState(null);

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

  const docPct = report?.storage?.config_doc_pct_of_max || 0;
  const splitDone = !!data?._partitionedV2192Done;
  const showSplitWarning = docPct >= 50 && !splitDone;

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
