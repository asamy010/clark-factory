/* ═══════════════════════════════════════════════════════════════════════
   CLARK · DocItemsTable + DocTotals (V21.21.45)
   جدول بنود موحّد + بلوك إجماليات/تفقيط موحّد لكل المستندات (مبيعات/مشتريات).
   ٩ أعمدة: الكود | اسم الصنف | الوحدة | الكمية | السعر | قبل الخصم |
            نسبة الخصم | الخصم | بعد الخصم
   الخصم الكلي بيتوزّع على الصفوف (راجع utils/docColumns.js — طبقة عرض بحتة).
   ═══════════════════════════════════════════════════════════════════════ */
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { fmt } from "../utils/format.js";
import { buildDocColumns, fmtQtyByUnit } from "../utils/docColumns.js";
import { tafqitEGP } from "../utils/tafqit.js";

export function DocItemsTable({ items, headerDiscountPct, headerDiscountAmount, accent = "#0EA5E9" }){
  const { rows, totals } = buildDocColumns(items, { headerDiscountPct, headerDiscountAmount });
  /* V21.21.45: خط أكبر (FS-1/FS-2) بدل FS-3/FS-4 السابق */
  const th = { padding: "8px 7px", fontSize: FS - 2, whiteSpace: "nowrap", fontWeight: 700, color: T.textSec };
  const td = { padding: "8px 7px", fontSize: FS - 1 };
  const pct = (p) => (p > 0 ? p + "%" : "—");
  return (
    <div style={{ border: "1px solid " + T.brd, borderRadius: 10, overflowX: "auto", marginBottom: 12 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
        <thead><tr style={{ background: T.bg }}>
          <th style={{ ...th, textAlign: "center" }}>الكود</th>
          <th style={{ ...th, textAlign: "right" }}>اسم الصنف</th>
          <th style={{ ...th, textAlign: "center" }}>الوحدة</th>
          <th style={{ ...th, textAlign: "center" }}>الكمية</th>
          <th style={{ ...th, textAlign: "left" }}>السعر</th>
          <th style={{ ...th, textAlign: "left" }}>قبل الخصم</th>
          <th style={{ ...th, textAlign: "center" }}>نسبة الخصم</th>
          <th style={{ ...th, textAlign: "left" }}>الخصم</th>
          <th style={{ ...th, textAlign: "left" }}>بعد الخصم</th>
        </tr></thead>
        <tbody>
          {rows.map((r, i) => r.isSection ? (
            <tr key={i} style={{ borderTop: "1px solid " + T.brd, background: accent + "0c" }}>
              <td colSpan={9} style={{ padding: "8px 8px", fontWeight: 800, color: accent, fontSize: FS - 1 }}>📑 {r.title || ""}</td>
            </tr>
          ) : (
            <tr key={i} style={{ borderTop: "1px solid " + T.brd }}>
              <td style={{ ...td, textAlign: "center", color: T.textSec }}>{r.code || "—"}</td>
              <td style={{ ...td, textAlign: "right", color: T.text }}>{r.name || "—"}</td>
              <td style={{ ...td, textAlign: "center", color: T.textMut }}>{r.unit || "—"}</td>
              <td style={{ ...td, textAlign: "center", color: T.textSec }}>{fmt(r.qty)}</td>
              <td style={{ ...td, textAlign: "left", color: T.textSec }}>{fmt(r.price)}</td>
              <td style={{ ...td, textAlign: "left", color: T.textSec }}>{fmt(r.subBefore)}</td>
              <td style={{ ...td, textAlign: "center", color: r.discountPct > 0 ? T.err : T.textMut }}>{pct(r.discountPct)}</td>
              <td style={{ ...td, textAlign: "left", color: r.discount > 0 ? T.err : T.textMut }}>{r.discount > 0 ? "− " + fmt(r.discount) : "—"}</td>
              <td style={{ ...td, textAlign: "left", fontWeight: 700, color: T.text }}>{fmt(r.subAfter)}</td>
            </tr>
          ))}
        </tbody>
        {/* V21.27.107: صف إجمالي الكمية تحت عمود الكمية (مجمّع حسب الوحدة) */}
        {rows.some(r => !r.isSection) && (
          <tfoot>
            <tr style={{ borderTop: "2px solid " + T.brd, background: T.bg }}>
              <td style={{ ...td }}></td>
              <td style={{ ...td, textAlign: "right", fontWeight: 800, color: T.text }}>الإجمالي</td>
              <td style={{ ...td }}></td>
              <td style={{ ...td, textAlign: "center", fontWeight: 800, color: T.text, whiteSpace: "nowrap" }}>{fmtQtyByUnit(totals.qtyByUnit)}</td>
              <td style={{ ...td }} colSpan={5}></td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/* بلوك الإجماليات الموحّد + التفقيط تحتها. بيحسب من نفس buildDocColumns عشان
   يطابق الجدول بالظبط (نسبة الخصم جنب «إجمالي الخصومات» لو فيه خصم). */
export function DocTotals({ items, headerDiscountPct, headerDiscountAmount, accent = "#0EA5E9", extraRows = null }){
  const { totals } = buildDocColumns(items, { headerDiscountPct, headerDiscountAmount });
  const row = (label, value, opts = {}) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
      <span style={{ fontSize: opts.big ? FS : FS - 1, color: opts.big ? T.text : T.textSec, fontWeight: opts.big ? 800 : 600 }}>{label}</span>
      <span style={{ fontSize: opts.big ? FS + 3 : FS, color: opts.color || T.text, fontWeight: 800, direction: "ltr" }}>{value}</span>
    </div>
  );
  return (
    <div style={{ background: T.bg, borderRadius: 10, padding: 14, border: "1px solid " + T.brd, marginBottom: 12 }}>
      {row("الإجمالي قبل الخصم", fmt(totals.subBefore))}
      {row("إجمالي الخصومات" + (totals.discountPct > 0 ? " (" + totals.discountPct + "%)" : ""), (totals.discount > 0 ? "− " : "") + fmt(totals.discount), { color: T.err })}
      {extraRows}
      <div style={{ height: 1, background: T.brd, margin: "7px 0" }} />
      {row("الإجمالي", fmt(totals.subAfter) + " ج.م", { big: true, color: accent })}
      {/* V21.21.45: التفقيط تحت الإجماليات */}
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed " + T.brd, fontSize: FS - 1, fontWeight: 700, color: T.textSec, lineHeight: 1.7 }}>
        {tafqitEGP(totals.subAfter)}
      </div>
    </div>
  );
}
