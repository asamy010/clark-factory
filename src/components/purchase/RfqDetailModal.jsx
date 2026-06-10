/* ═══════════════════════════════════════════════════════════════════════
   CLARK · RfqDetailModal (V21.12.1) — عرض طلب عروض أسعار + إجراءات
   ═══════════════════════════════════════════════════════════════════════ */

import { Btn } from "../ui.jsx";
import { T } from "../../theme.js";
import { FS } from "../../constants/index.js";
import { fmt, ltrPhone } from "../../utils/format.js";
import { displayStatus } from "../../utils/purchase/rfq.js";
import { openPurchaseDoc } from "../../utils/purchase/navDoc.js";

const STATUS_META = {
  draft:     { label: "مسودة",   color: "#6B7280", bg: "#6B728015" },
  sent:      { label: "مُرسل",    color: "#0EA5E9", bg: "#0EA5E915" },
  received:  { label: "وصل العرض", color: "#8B5CF6", bg: "#8B5CF615" },
  converted: { label: "محوّل لأمر شراء", color: "#10B981", bg: "#10B98115" },
  rejected:  { label: "مرفوض",   color: "#EF4444", bg: "#EF444415" },
  expired:   { label: "منتهي",   color: "#D97706", bg: "#D9770615" },
};

export function RfqDetailModal({ rfq, data, userName, canEdit, onClose, onEdit, onStatus, onSend, onConvert, onDelete }){
  if(!rfq) return null;
  const ds = displayStatus(rfq);
  const meta = STATUS_META[ds] || STATUS_META.draft;
  const supName = rfq.supplierName || rfq.supplierNameAdHoc || "—";
  const phone = rfq.supplierPhone || (data.suppliers || []).find(s => String(s.id) === String(rfq.supplierId))?.phone || "";
  const isConverted = !!rfq.convertedToPoId;
  const canConvert = canEdit && !isConverted && ds !== "rejected";

  const waSend = () => {
    onSend("whatsapp");
    if(phone){
      const digits = String(phone).replace(/[^0-9]/g, "");
      let _n = 0;
      const lines = (rfq.items || []).map((it) => it.isSection ? `📑 ${it.title || ""}` : `${++_n}. ${it.description || it.modelNo || ""} — ${it.qty} ${it.unit || ""}`).join("\n");
      const text = `طلب عروض أسعار ${rfq.rfqNo}\nالأصناف المطلوب تسعيرها:\n${lines}\n\nبرجاء إفادتنا بالأسعار. شكراً.`;
      const win = window.open("about:blank", "_blank");
      const url = "https://wa.me/" + digits + "?text=" + encodeURIComponent(text);
      if(win) win.location.href = url; else window.location.href = url;
    }
  };

  const printRfq = () => {
    let _pn = 0;
    const rows = (rfq.items || []).map((it) => it.isSection ? `<tr><td colspan="5" style="background:#FEF3C7;font-weight:800">📑 ${it.title || ""}</td></tr>` : `<tr><td>${++_pn}</td><td>${it.description || it.modelNo || ""}</td><td>${it.qty || 0}</td><td>${it.unit || ""}</td><td></td></tr>`).join("");
    const w = window.open("", "_blank");
    if(!w) return;
    w.document.write(`<html dir="rtl"><head><meta charset="UTF-8"><title>${rfq.rfqNo}</title>
      <style>body{font-family:Tahoma,sans-serif;padding:24px;color:#1e293b}h1{font-size:20px;color:#D97706}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #cbd5e1;padding:8px;text-align:right;font-size:13px}th{background:#FEF3C7}.info{color:#64748b;font-size:12px}</style></head><body>
      <h1>💬 طلب عروض أسعار — ${rfq.rfqNo}</h1>
      <div class="info">التاريخ: ${rfq.date} ${rfq.validUntil ? "• مهلة الرد: " + rfq.validUntil : ""}</div>
      <div class="info">المورد: ${supName}${phone ? " — " + phone : ""}</div>
      <table><thead><tr><th>#</th><th>الصنف</th><th>الكمية</th><th>الوحدة</th><th>سعر الوحدة (يُملأ من المورد)</th></tr></thead><tbody>${rows}</tbody></table>
      ${rfq.notes ? `<p style="margin-top:12px;padding:8px;background:#FEF3C7;border-radius:6px">${rfq.notes}</p>` : ""}
      <p style="margin-top:24px;color:#64748b;font-size:12px">CLARK — برجاء إفادتنا بالأسعار والمواعيد.</p>
      <script>setTimeout(function(){window.print()},400)</`+`script></body></html>`);
    w.document.close();
  };

  const row = (lab, val) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid " + T.brd, fontSize: FS - 1 }}>
      <span style={{ color: T.textSec }}>{lab}</span><span style={{ color: T.text, fontWeight: 700 }}>{val}</span>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 10001, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.cardSolid, borderRadius: 16, width: "min(720px,100%)", maxHeight: "92vh", overflowY: "auto", border: "1px solid " + T.brd, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid " + T.brd }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontWeight: 800, fontSize: FS + 2, color: T.text }}>💬 {rfq.rfqNo}</div>
            <span style={{ padding: "3px 10px", borderRadius: 7, fontSize: FS - 2, fontWeight: 800, background: meta.bg, color: meta.color }}>{meta.label}</span>
          </div>
          <Btn ghost onClick={onClose}>✕</Btn>
        </div>

        <div style={{ padding: 20 }}>
          {row("المورد", supName)}
          {phone && row("التليفون", ltrPhone(phone))}
          {row("التاريخ", rfq.date)}
          {rfq.validUntil && row("مهلة الرد", rfq.validUntil)}
          {isConverted && (
            <div onClick={() => { onClose(); openPurchaseDoc("po", rfq.convertedToPoId); }}
              style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid " + T.brd, fontSize: FS - 1, cursor: "pointer" }}>
              <span style={{ color: T.textSec }}>أمر الشراء</span>
              <span style={{ color: "#10B981", fontWeight: 700 }}>{rfq.convertedToPoNo} ↗</span>
            </div>
          )}

          <div style={{ fontSize: FS - 1, fontWeight: 800, color: T.text, margin: "14px 0 6px" }}>الأصناف ({(rfq.items || []).length})</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FS - 1 }}>
            <thead><tr style={{ background: T.bg }}>
              <th style={{ textAlign: "right", padding: 8, color: T.textSec }}>الصنف</th>
              <th style={{ padding: 8, color: T.textSec }}>الكمية</th>
              <th style={{ padding: 8, color: T.textSec }}>الوحدة</th>
              <th style={{ padding: 8, color: T.textSec, direction: "ltr" }}>سعر متوقع</th>
            </tr></thead>
            <tbody>
              {(rfq.items || []).map((it, i) => it.isSection ? (
                <tr key={i} style={{ borderBottom: "1px solid " + T.brd, background: "#D977060c" }}>
                  <td colSpan={4} style={{ padding: 8, fontWeight: 800, color: "#D97706" }}>📑 {it.title || ""}</td>
                </tr>
              ) : (
                <tr key={i} style={{ borderBottom: "1px solid " + T.brd }}>
                  <td style={{ padding: 8, color: T.text }}>{it.description || it.modelNo}{it.notes ? <span style={{ color: T.textMut, fontSize: FS - 3 }}> — {it.notes}</span> : ""}</td>
                  <td style={{ padding: 8, textAlign: "center", color: T.text }}>{it.qty}</td>
                  <td style={{ padding: 8, textAlign: "center", color: T.textMut }}>{it.unit || "—"}</td>
                  <td style={{ padding: 8, textAlign: "left", color: T.text, direction: "ltr" }}>{Number(it.unitPrice) > 0 ? fmt(Number(it.unitPrice).toFixed(2)) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, padding: "10px 14px", borderRadius: 10, background: "#D9770610" }}>
            <span style={{ fontWeight: 700, color: T.textSec }}>الإجمالي التقديري</span>
            <span style={{ fontSize: FS + 3, fontWeight: 800, color: "#D97706", direction: "ltr" }}>{fmt(Number(rfq.total || 0).toFixed(2))}</span>
          </div>

          {rfq.notes && <div style={{ marginTop: 12, padding: 10, background: "#FEF3C7", borderRadius: 8, fontSize: FS - 1, color: T.text }}>📝 {rfq.notes}</div>}
        </div>

        {/* actions */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", padding: "14px 20px", borderTop: "1px solid " + T.brd }}>
          <Btn small onClick={printRfq} style={{ background: T.accentBg, color: T.accent }}>🖨 طباعة</Btn>
          {canEdit && !isConverted && ds !== "rejected" && <Btn small onClick={waSend} style={{ background: "#25D36615", color: "#1DA851", border: "1px solid #25D36640" }}>📤 إرسال للمورد</Btn>}
          {canEdit && (ds === "sent") && <Btn small onClick={() => onStatus("received")} style={{ background: "#8B5CF615", color: "#8B5CF6", border: "1px solid #8B5CF640" }}>✓ وصل العرض</Btn>}
          {canConvert && <Btn small primary onClick={onConvert} style={{ background: "#10B981" }}>➡️ تحويل لأمر شراء</Btn>}
          {canEdit && !isConverted && <Btn small onClick={onEdit} style={{ background: T.bg, color: T.text, border: "1px solid " + T.brd }}>✏️ تعديل</Btn>}
          {canEdit && !isConverted && ds !== "rejected" && <Btn small ghost onClick={() => onStatus("rejected")} style={{ color: T.err }}>رفض</Btn>}
          {canEdit && !isConverted && <Btn small ghost onClick={onDelete} style={{ color: T.err }}>🗑 حذف</Btn>}
        </div>
      </div>
    </div>
  );
}
