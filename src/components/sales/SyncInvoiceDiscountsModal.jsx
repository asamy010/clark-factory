/* ═══════════════════════════════════════════════════════════════════════
   CLARK · SyncInvoiceDiscountsModal (V21.26.17)
   ───────────────────────────────────────────────────────────────────────
   أداة صيانة: مزامنة خصومات فواتير المبيعات مع خصم التوزيعة (مصدر الحقيقة).
   مراجعة قبل التطبيق (dry-run) → تأكيد صريح → تطبيق على المسودات فقط.

   سلامة مالية (CLAUDE.md §0.1) — الفواتير المرحّلة لها قيود يومية، فالأداة
   مابتعدّلهاش (بتعرضها للإلغاء وإعادة الإصدار اليدوي). التفاصيل في
   src/utils/sales/syncInvoiceDiscounts.js.
   ═══════════════════════════════════════════════════════════════════════ */

import { useMemo, useState } from "react";
import { Btn, BlockingOverlay } from "../ui.jsx";
import { T } from "../../theme.js";
import { FS } from "../../constants/index.js";
import { fmt } from "../../utils/format.js";
import { ask, showToast } from "../../utils/popups.js";
import { computeInvoiceDiscountDiffs, applyDraftDiscountSyncMutator } from "../../utils/sales/syncInvoiceDiscounts.js";

export function SyncInvoiceDiscountsModal({ data, upConfig, onClose, isMob = false }){
  const diffs = useMemo(() => computeInvoiceDiscountDiffs(data), [data.salesInvoices, data.custDeliverySessions]);
  const [busy, setBusy] = useState(false);

  const apply = async () => {
    if(diffs.draft.length === 0) return;
    const ok = await ask(
      "مزامنة خصومات الفواتير المسودة",
      "هتطابق خصم " + diffs.draft.length + " فاتورة مسودة مع خصم التوزيعة، ويعاد حساب الإجمالي. الفواتير المرحّلة مش هتتغيّر. تمام؟"
    );
    if(!ok) return;
    setBusy(true);
    try {
      /* snapshot للأثر — نمرّر صفوف draft فقط؛ الـ mutator نفسه بيتأكد status==="draft" */
      const rows = diffs.draft;
      let applied = 0;
      await upConfig(d => { applied = applyDraftDiscountSyncMutator(d, rows); });
      showToast("✅ تمت مزامنة " + applied + " فاتورة مسودة مع خصم التوزيعة");
      onClose();
    } catch(e){
      showToast("⛔ فشلت المزامنة — " + (e?.message || "خطأ غير متوقع"));
    } finally {
      setBusy(false);
    }
  };

  const Pct = ({ v }) => <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{v}%</span>;
  const Money = ({ v }) => <span style={{ direction: "ltr", display: "inline-block", fontFamily: "monospace" }}>{fmt(Number(v).toFixed(0))}</span>;

  const Row = ({ r, kind }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, background: T.cardSolid, border: "1px solid " + T.brd, flexWrap: "wrap", fontSize: FS - 2 }}>
      <div style={{ minWidth: isMob ? 90 : 120 }}>
        <div style={{ fontFamily: "monospace", fontWeight: 800, color: T.accent }}>{r.invoiceNo || r.id}</div>
        <div style={{ fontSize: FS - 3, color: T.textMut }}>{r.date}</div>
      </div>
      <div style={{ flex: 1, minWidth: 110, fontWeight: 700, color: T.text }}>{r.customerName || "—"}</div>
      {kind === "ambiguous"
        ? <div style={{ fontSize: FS - 3, color: "#B45309" }}>خصم حالي <Pct v={r.currentPct} /> · مرتبطة بأكتر من توزيعة بخصومات مختلفة</div>
        : <>
            <div style={{ minWidth: 120 }}>
              <span style={{ color: T.textMut }}><Pct v={r.currentPct} /></span>
              <span style={{ margin: "0 6px", color: T.textSec }}>→</span>
              <span style={{ color: "#10B981" }}><Pct v={r.newPct} /></span>
            </div>
            <div style={{ textAlign: "left", minWidth: 130 }}>
              <span style={{ color: T.textMut, textDecoration: "line-through" }}><Money v={r.currentTotal} /></span>
              <span style={{ margin: "0 6px", color: T.textSec }}>→</span>
              <span style={{ fontWeight: 800, color: T.text }}><Money v={r.newTotal} /></span>
            </div>
          </>}
    </div>
  );

  const Section = ({ title, color, hint, rows, kind }) => rows.length === 0 ? null : (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: FS - 1, fontWeight: 800, color }}>{title} ({rows.length})</div>
      {hint && <div style={{ fontSize: FS - 3, color: T.textSec, marginBottom: 2 }}>{hint}</div>}
      {rows.map(r => <Row key={r.id} r={r} kind={kind} />)}
    </div>
  );

  const nothing = diffs.draft.length === 0 && diffs.posted.length === 0 && diffs.ambiguous.length === 0;

  return <div className="pop-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={(e) => { if(e.target === e.currentTarget && !busy) onClose(); }}>
    <div style={{ background: T.bg, borderRadius: 14, maxWidth: 880, width: "100%", maxHeight: "92vh", overflow: "auto", border: "2px solid " + T.accent + "30", boxShadow: "0 25px 70px rgba(0,0,0,0.4)" }}>
      <div style={{ position: "sticky", top: 0, background: T.bg, padding: "14px 18px", borderBottom: "1px solid " + T.brd, display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 3 }}>
        <div>
          <div style={{ fontSize: FS + 3, fontWeight: 900, color: T.accent }}>🔄 مزامنة خصومات الفواتير من التوزيعات</div>
          <div style={{ fontSize: FS - 2, color: T.textSec, marginTop: 2 }}>تطابق خصم الفاتورة مع خصم التوزيعة المتّفق عليه (مصدر الحقيقة)</div>
        </div>
        <Btn ghost onClick={() => { if(!busy) onClose(); }}>✕</Btn>
      </div>

      <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* ملخّص */}
        <div style={{ display: "grid", gridTemplateColumns: isMob ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: 8 }}>
          {[["تم فحصها", diffs.scanned, T.textSec], ["مرتبطة بتوزيعة", diffs.linked, T.accent], ["مسودات للمطابقة", diffs.draft.length, "#10B981"], ["مرحّلة مختلفة", diffs.posted.length, "#EF4444"]].map(([l, v, c]) => (
            <div key={l} style={{ padding: 10, background: T.cardSolid, borderRadius: 8, border: "1px solid " + T.brd, textAlign: "center" }}>
              <div style={{ fontSize: FS - 3, color: c, fontWeight: 600 }}>{l}</div>
              <div style={{ fontSize: FS + 4, fontWeight: 800, color: c }}>{v}</div>
            </div>
          ))}
        </div>

        {nothing && <div style={{ padding: 24, textAlign: "center", color: T.textMut, fontSize: FS - 1 }}>
          ✅ كل الفواتير المرتبطة بتوزيعات خصمها مطابق للتوزيعة. لا حاجة لأي مزامنة.
        </div>}

        <Section
          title="✅ فواتير مسودة هتتطابق"
          color="#10B981"
          hint="آمنة — لسه مفيش قيود محاسبية. الخصم والإجمالي هيتعادوا من قيمة ما قبل الخصم."
          rows={diffs.draft}
          kind="draft"
        />

        <Section
          title="⚠️ فواتير مرحّلة بخصم مختلف — تحتاج إلغاء وإعادة إصدار يدوي"
          color="#EF4444"
          hint="ليها قيود يومية (إيراد/عملاء/خصم + تكلفة). الأداة مابتعدّلهاش حفاظاً على ميزان المراجعة — ألغِها من تفاصيل الفاتورة ثم أعد إصدارها لتأخذ خصم التوزيعة."
          rows={diffs.posted}
          kind="posted"
        />

        <Section
          title="🟡 فواتير مرتبطة بأكتر من توزيعة بخصومات مختلفة — تتخطّى"
          color="#B45309"
          hint="مفيش خصم واحد صحيح نطابق بيه — عدّلها يدوياً لو لزم."
          rows={diffs.ambiguous}
          kind="ambiguous"
        />
      </div>

      <div style={{ position: "sticky", bottom: 0, background: T.bg, padding: "12px 18px", borderTop: "1px solid " + T.brd, display: "flex", justifyContent: "flex-end", gap: 10, zIndex: 3 }}>
        <Btn ghost onClick={() => { if(!busy) onClose(); }}>إغلاق</Btn>
        {diffs.draft.length > 0 && <Btn primary onClick={apply} style={{ background: "#10B981", color: "#fff", border: "none", fontWeight: 800 }}>
          🔄 تطبيق المزامنة على {diffs.draft.length} مسودة
        </Btn>}
      </div>
    </div>

    <BlockingOverlay show={busy} text="جاري مزامنة الخصومات..." sub="من فضلك انتظر — لا تغلق الصفحة" />
  </div>;
}
