/* ═══════════════════════════════════════════════════════════════════════
   CLARK · DocItemsTable (V21.21.42)
   جدول بنود موحّد لبوب-اب تفاصيل أي مستند (عرض سعر · أمر · فاتورة · RFQ ·
   أمر شراء · استلام). ٨ أعمدة:
     الكود | اسم الصنف | الوحدة | الكمية | السعر | قبل الخصم | الخصم | بعد الخصم
   خصم الرأس بيتوزّع على الصفوف (راجع utils/docColumns.js — طبقة عرض بحتة).
   ═══════════════════════════════════════════════════════════════════════ */
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { fmt } from "../utils/format.js";
import { buildDocColumns } from "../utils/docColumns.js";
import { tafqitEGP } from "../utils/tafqit.js";

export function DocItemsTable({ items, headerDiscountPct, headerDiscountAmount, accent = "#0EA5E9", tafqit = true }){
  const { rows, totals } = buildDocColumns(items, { headerDiscountPct, headerDiscountAmount });
  const th = { padding: "7px 6px", fontSize: FS - 4, whiteSpace: "nowrap", fontWeight: 700, color: T.textSec };
  const td = { padding: "7px 6px", fontSize: FS - 3 };
  return (
    <div style={{ border: "1px solid " + T.brd, borderRadius: 10, overflowX: "auto", marginBottom: 12 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 580 }}>
        <thead><tr style={{ background: T.bg }}>
          <th style={{ ...th, textAlign: "center" }}>الكود</th>
          <th style={{ ...th, textAlign: "right" }}>اسم الصنف</th>
          <th style={{ ...th, textAlign: "center" }}>الوحدة</th>
          <th style={{ ...th, textAlign: "center" }}>الكمية</th>
          <th style={{ ...th, textAlign: "left" }}>السعر</th>
          <th style={{ ...th, textAlign: "left" }}>قبل الخصم</th>
          <th style={{ ...th, textAlign: "left" }}>الخصم</th>
          <th style={{ ...th, textAlign: "left" }}>بعد الخصم</th>
        </tr></thead>
        <tbody>
          {rows.map((r, i) => r.isSection ? (
            <tr key={i} style={{ borderTop: "1px solid " + T.brd, background: accent + "0c" }}>
              <td colSpan={8} style={{ padding: "7px 8px", fontWeight: 800, color: accent, fontSize: FS - 2 }}>📑 {r.title || ""}</td>
            </tr>
          ) : (
            <tr key={i} style={{ borderTop: "1px solid " + T.brd }}>
              <td style={{ ...td, textAlign: "center", color: T.textSec }}>{r.code || "—"}</td>
              <td style={{ ...td, textAlign: "right", color: T.text }}>{r.name || "—"}</td>
              <td style={{ ...td, textAlign: "center", color: T.textMut }}>{r.unit || "—"}</td>
              <td style={{ ...td, textAlign: "center", color: T.textSec }}>{fmt(r.qty)}</td>
              <td style={{ ...td, textAlign: "left", color: T.textSec }}>{fmt(r.price)}</td>
              <td style={{ ...td, textAlign: "left", color: T.textSec }}>{fmt(r.subBefore)}</td>
              <td style={{ ...td, textAlign: "left", color: r.discount > 0 ? T.err : T.textMut }}>{r.discount > 0 ? "− " + fmt(r.discount) : "—"}</td>
              <td style={{ ...td, textAlign: "left", fontWeight: 700, color: T.text }}>{fmt(r.subAfter)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {tafqit && (
        <div style={{ padding: "8px 10px", borderTop: "1px solid " + T.brd, background: T.bg, fontSize: FS - 3, fontWeight: 700, color: T.textSec, lineHeight: 1.7 }}>
          {tafqitEGP(totals.subAfter)}
        </div>
      )}
    </div>
  );
}
