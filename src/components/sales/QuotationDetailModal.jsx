/* ═══════════════════════════════════════════════════════════════════════
   CLARK · QuotationDetailModal (V21.10.0 — Phase 12a)
   تفاصيل العرض + إجراءات الحالة + طباعة + واتساب + لوحة الـ cross-links
   (فاضية دلوقتي — تتفعّل في Slice 2). زرار "حوّل لأمر بيع" معطّل لحد Slice 2.
   ═══════════════════════════════════════════════════════════════════════ */

import { Btn } from "../ui.jsx";
import { T } from "../../theme.js";
import { FS } from "../../constants/index.js";
import { fmt } from "../../utils/format.js";
import { displayStatus } from "../../utils/sales/quotations.js";
import { openSalesDoc } from "../../utils/sales/navDoc.js";

const STATUS_META = {
  draft:     { label: "مسودة",   color: "#6B7280", bg: "#6B728015" },
  sent:      { label: "مُرسل",    color: "#F59E0B", bg: "#F59E0B15" },
  accepted:  { label: "مقبول",   color: "#10B981", bg: "#10B98115" },
  rejected:  { label: "مرفوض",   color: "#EF4444", bg: "#EF444415" },
  converted: { label: "متحوّل",   color: "#8B5CF6", bg: "#8B5CF615" },
  expired:   { label: "منتهي",    color: "#94A3B8", bg: "#94A3B815" },
};

function buildQuoteHTML(q, config){
  const brand = (config && config.factoryName) || "CLARK";
  let _n = 0;
  const rows = (q.items || []).map((it) => it.isSection ? `
    <tr><td colspan="6" style="background:#F1F5F9;font-weight:800;color:#0369A1">📑 ${escapeHtml(it.title || "")}</td></tr>`
    : `
    <tr>
      <td style="text-align:center">${++_n}</td>
      <td>${escapeHtml((it.modelNo || "") + (it.description ? " — " + it.description : "") + (it.unit ? " (" + it.unit + ")" : ""))}</td>
      <td style="text-align:center">${it.qty}</td>
      <td style="text-align:left">${fmt(it.unitPrice)}</td>
      <td style="text-align:left">${it.lineDiscount ? "− " + fmt(it.lineDiscount) : "—"}</td>
      <td style="text-align:left"><b>${fmt(it.lineTotal)}</b></td>
    </tr>`).join("");
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
    <title>${escapeHtml(q.quoteNo || "عرض سعر")}</title>
    <style>
      *{font-family:'Cairo',Arial,sans-serif;box-sizing:border-box}
      body{padding:28px;color:#1E293B}
      h1{font-size:22px;margin:0}
      .muted{color:#64748B;font-size:13px}
      table{width:100%;border-collapse:collapse;margin-top:16px}
      th,td{border:1px solid #CBD5E1;padding:8px 10px;font-size:13px}
      th{background:#F1F5F9;text-align:right}
      .tot{margin-top:14px;width:280px;margin-inline-start:auto}
      .tot div{display:flex;justify-content:space-between;padding:4px 0;font-size:14px}
      .tot .big{font-weight:800;font-size:17px;border-top:2px solid #1E293B;padding-top:8px;margin-top:4px}
      @media print{body{padding:0}}
    </style></head><body>
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div><h1>عرض سعر</h1><div class="muted">${escapeHtml(brand)}</div></div>
      <div style="text-align:left">
        <div style="font-weight:800;font-size:16px">${escapeHtml(q.quoteNo || "")}</div>
        <div class="muted">التاريخ: ${escapeHtml(q.date || "")}</div>
        <div class="muted">صالح حتى: ${escapeHtml(q.validUntil || "—")}</div>
      </div>
    </div>
    <div style="margin-top:10px;font-size:14px"><b>العميل:</b> ${escapeHtml(q.customerName || q.customerNameAdHoc || "—")}${q.customerPhone ? " · " + escapeHtml(q.customerPhone) : ""}</div>
    <table>
      <thead><tr><th style="width:36px">#</th><th>البند</th><th style="width:60px">كمية</th><th style="width:90px">السعر</th><th style="width:90px">خصم</th><th style="width:100px">الإجمالي</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="tot">
      <div><span>الإجمالي قبل الخصم</span><span>${fmt(q.subtotal)}</span></div>
      <div><span>إجمالي الخصومات</span><span>− ${fmt(q.totalDiscount)}</span></div>
      <div class="big"><span>الإجمالي</span><span>${fmt(q.total)}</span></div>
    </div>
    ${q.notes ? `<div style="margin-top:16px;font-size:13px;color:#475569"><b>ملاحظات:</b> ${escapeHtml(q.notes)}</div>` : ""}
    <script>window.onload=function(){setTimeout(function(){window.print()},250)}</script>
  </body></html>`;
}

function escapeHtml(s){
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function QuotationDetailModal({ data, quote, config, canEdit, onEdit, onStatus, onSend, onConvert, onDelete, onClose }){
  if(!quote) return null;
  const ds = displayStatus(quote);
  const meta = STATUS_META[ds] || STATUS_META.draft;
  const canMutate = canEdit && quote.status !== "converted";
  /* V21.20.1: السماح بحذف العرض في أي حالة (حتى المتحوّل) — الحذف بيفكّ ربط
     أمر البيع تلقائياً، وبعدها يبقى الأمر قابل للحذف. */
  const canDelete = canEdit;
  /* V21.10.2: SO is "orphaned" if the quote points to one that no longer exists
     (partial write). Allow re-conversion in that case. */
  const soExists = !!(quote.convertedToSalesOrderId && (data?.salesOrders || []).some(s => s && s.id === quote.convertedToSalesOrderId));
  const isOrphan = !!quote.convertedToSalesOrderId && !soExists;
  const canConvert = canEdit && quote.status !== "rejected" && !soExists;

  const handlePrint = () => {
    /* فتح النافذة synchronously (popup-safety §7) — ده click مباشر فـ آمن */
    const win = window.open("", "_blank");
    if(!win){ return; }
    win.document.write(buildQuoteHTML(quote, config));
    win.document.close();
  };

  const handleWhatsApp = () => {
    const phone = String(quote.customerPhone || "").replace(/[^0-9]/g, "");
    const lines = [
      "عرض سعر " + (quote.quoteNo || ""),
      "العميل: " + (quote.customerName || quote.customerNameAdHoc || ""),
      "التاريخ: " + (quote.date || ""),
      "صالح حتى: " + (quote.validUntil || "—"),
      "",
      ...(quote.items || []).map(it => it.isSection ? "📑 " + (it.title || "") : ("• " + (it.modelNo || it.description || "") + (it.unit ? " (" + it.unit + ")" : "") + " × " + it.qty + " = " + fmt(it.lineTotal))),
      "",
      "الإجمالي: " + fmt(quote.total),
    ];
    const text = encodeURIComponent(lines.join("\n"));
    const url = phone ? ("https://wa.me/" + phone + "?text=" + text) : ("https://wa.me/?text=" + text);
    const win = window.open(url, "_blank");
    /* علّم العرض كـ مُرسل عبر واتساب */
    if(win) onSend && onSend("whatsapp");
  };

  return (
    <div className="pop-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 99998, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => { if(e.target === e.currentTarget) onClose(); }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.cardSolid, borderRadius: 16, width: "100%", maxWidth: 620, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ position: "sticky", top: 0, background: T.cardSolid, padding: "16px 18px", borderBottom: "1px solid " + T.brd, display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontWeight: 800, fontSize: FS + 2, color: T.text }}>{quote.quoteNo}</div>
            <span style={{ fontSize: FS - 3, fontWeight: 700, color: meta.color, background: meta.bg, padding: "2px 10px", borderRadius: 20 }}>{meta.label}</span>
          </div>
          <Btn ghost small onClick={onClose}>✕</Btn>
        </div>

        <div style={{ padding: 18 }}>
          {/* العميل + التواريخ */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: FS - 1, marginBottom: 14 }}>
            <div><span style={{ color: T.textMut }}>العميل: </span><b style={{ color: T.text }}>{quote.customerName || quote.customerNameAdHoc || "—"}</b></div>
            <div><span style={{ color: T.textMut }}>الهاتف: </span><span style={{ color: T.text }}>{quote.customerPhone || "—"}</span></div>
            <div><span style={{ color: T.textMut }}>التاريخ: </span><span style={{ color: T.text }}>{quote.date}</span></div>
            <div><span style={{ color: T.textMut }}>صالح حتى: </span><span style={{ color: ds === "expired" ? T.err : T.text }}>{quote.validUntil || "—"}</span></div>
          </div>

          {/* البنود */}
          <div style={{ border: "1px solid " + T.brd, borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FS - 2 }}>
              <thead><tr style={{ background: T.bg }}>
                <th style={{ textAlign: "right", padding: "8px 10px" }}>البند</th>
                <th style={{ textAlign: "center", padding: "8px 6px" }}>كمية</th>
                <th style={{ textAlign: "left", padding: "8px 10px" }}>السعر</th>
                <th style={{ textAlign: "left", padding: "8px 10px" }}>الإجمالي</th>
              </tr></thead>
              <tbody>
                {(quote.items || []).map((it, i) => it.isSection ? (
                  <tr key={i} style={{ borderTop: "1px solid " + T.brd, background: "#0EA5E90c" }}>
                    <td colSpan={4} style={{ padding: "8px 10px", fontWeight: 800, color: "#0EA5E9" }}>📑 {it.title || ""}</td>
                  </tr>
                ) : (
                  <tr key={i} style={{ borderTop: "1px solid " + T.brd }}>
                    <td style={{ padding: "8px 10px", color: T.text }}>{(it.modelNo || it.description || "—")}{it.unit ? <span style={{ color: T.textMut, fontSize: FS - 4 }}> / {it.unit}</span> : null}{it.lineDiscount ? <span style={{ color: T.err, fontSize: FS - 4 }}> (خصم {fmt(it.lineDiscount)})</span> : null}</td>
                    <td style={{ textAlign: "center", padding: "8px 6px", color: T.textSec }}>{it.qty}</td>
                    <td style={{ textAlign: "left", padding: "8px 10px", color: T.textSec }}>{fmt(it.unitPrice)}</td>
                    <td style={{ textAlign: "left", padding: "8px 10px", fontWeight: 700, color: T.text }}>{fmt(it.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* الإجماليات */}
          <div style={{ background: T.bg, borderRadius: 10, padding: 12, border: "1px solid " + T.brd, marginBottom: 12 }}>
            <Row label="الإجمالي قبل الخصم" value={fmt(quote.subtotal)} />
            <Row label="إجمالي الخصومات" value={"− " + fmt(quote.totalDiscount)} color={T.err} />
            <div style={{ height: 1, background: T.brd, margin: "6px 0" }} />
            <Row label="الإجمالي" value={fmt(quote.total)} big />
          </div>

          {/* cross-links (Slice 2+) */}
          <div style={{ background: "#8B5CF608", border: "1px dashed #8B5CF630", borderRadius: 10, padding: "10px 12px", marginBottom: 12, fontSize: FS - 2 }}>
            <div style={{ fontWeight: 700, color: "#8B5CF6", marginBottom: 4 }}>🔗 المستندات المرتبطة</div>
            {soExists
              ? <div onClick={() => openSalesDoc("salesOrder", quote.convertedToSalesOrderId)} style={{ color: "#8B5CF6", cursor: "pointer", fontWeight: 600 }}>أمر البيع: <b>{quote.convertedToSalesOrderNo}</b> ↗</div>
              : isOrphan
                ? <div style={{ color: T.err }}>⚠️ أمر البيع ({quote.convertedToSalesOrderNo}) مكانش اتحفظ — اضغط «إعادة التحويل»</div>
                : <div style={{ color: T.textMut }}>— لسه مفيش أمر بيع</div>}
          </div>

          {quote.notes && <div style={{ fontSize: FS - 2, color: T.textSec, marginBottom: 12 }}><b>ملاحظات:</b> {quote.notes}</div>}

          {/* سجل الحالة */}
          {Array.isArray(quote.statusHistory) && quote.statusHistory.length > 0 && (
            <details style={{ marginBottom: 8 }}>
              <summary style={{ cursor: "pointer", fontSize: FS - 2, color: T.textMut, fontWeight: 600 }}>سجل الحالة ({quote.statusHistory.length})</summary>
              <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
                {quote.statusHistory.map((h, i) => (
                  <div key={i} style={{ fontSize: FS - 3, color: T.textMut }}>{(STATUS_META[h.to]?.label || h.to)} — {h.by || "—"} · {(h.at || "").slice(0, 16).replace("T", " ")}</div>
                ))}
              </div>
            </details>
          )}
        </div>

        {/* الإجراءات */}
        <div style={{ position: "sticky", bottom: 0, background: T.cardSolid, padding: "12px 18px", borderTop: "1px solid " + T.brd, display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Btn ghost small onClick={handlePrint}>🖨 طباعة</Btn>
          <Btn ghost small onClick={handleWhatsApp}>📱 واتساب</Btn>
          {canMutate && <Btn ghost small onClick={() => onEdit(quote)}>✏️ تعديل</Btn>}
          {canMutate && ds !== "accepted" && <Btn ghost small onClick={() => onStatus("accepted")} style={{ color: "#10B981" }}>✓ مقبول</Btn>}
          {canMutate && ds !== "rejected" && <Btn ghost small onClick={() => onStatus("rejected")} style={{ color: T.err }}>✗ مرفوض</Btn>}
          {canDelete && <Btn ghost small onClick={onDelete} style={{ color: T.err }}>🗑 حذف</Btn>}
          {canConvert
            ? <Btn small onClick={() => onConvert && onConvert(quote)} style={{ background: "#8B5CF6", color: "#fff" }}>🔄 {isOrphan ? "إعادة التحويل لأمر بيع" : "حوّل لأمر بيع"}</Btn>
            : soExists
              ? <span style={{ alignSelf: "center", fontSize: FS - 2, color: "#8B5CF6", fontWeight: 700 }}>✓ {quote.convertedToSalesOrderNo}</span>
              : null}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, color, big }){
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0" }}>
      <span style={{ fontSize: big ? FS : FS - 2, color: big ? T.text : T.textSec, fontWeight: big ? 800 : 600 }}>{label}</span>
      <span style={{ fontSize: big ? FS + 2 : FS - 1, color: color || T.text, fontWeight: 800 }}>{value}</span>
    </div>
  );
}
