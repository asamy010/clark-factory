/* ═══════════════════════════════════════════════════════════════════════
   CLARK · DiscountsManager (V21.21.60) — قائمة الخصومات الإضافية + إلغاء/حذف
   بتظهر للعميل المحدّد في شاشة العميل وكشف الحساب. الإلغاء بيعكس القيد
   ويأرشف السجل؛ الحذف بيشيله نهائياً (مع عكس القيد).
   ═══════════════════════════════════════════════════════════════════════ */

import { useMemo, useState } from "react";
import { Btn } from "../ui.jsx";
import { T } from "../../theme.js";
import { FS } from "../../constants/index.js";
import { fmt } from "../../utils/format.js";
import { ask, showToast } from "../../utils/popups.js";
import { voidCustomerDiscount, deleteCustomerDiscount } from "../../utils/sales/discounts.js";

export function DiscountsManager({ data, upConfig, user, customerId, accent = "#DB2777" }){
  const [busyId, setBusyId] = useState(null);
  const userName = (user && (user.name || user.email)) || "";

  const list = useMemo(() => (data.salesCreditNotes || [])
    .filter(c => c && c.kind === "discount" && String(c.customerId) === String(customerId))
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.creditNoteNo || "").localeCompare(a.creditNoteNo || "")),
    [data.salesCreditNotes, customerId]);

  if(!list.length) return null;

  const doVoid = async (dn) => {
    if(!await ask("إلغاء الخصم", "إلغاء خصم " + (dn.creditNoteNo || "") + " بمبلغ " + fmt(dn.total) + " ج.م؟\n\nهيرجع رصيد العميل ويتعكس القيد المحاسبي (السجل بيفضل مؤرشف).", { danger: true, confirmText: "إلغاء الخصم" })) return;
    setBusyId(dn.id);
    const r = await voidCustomerDiscount(data, upConfig, dn, userName);
    setBusyId(null);
    showToast(r.ok ? "✓ تم إلغاء الخصم — رجع رصيد العميل" : "⛔ " + (r.error || "تعذّر الإلغاء"));
  };
  const doDelete = async (dn) => {
    if(!await ask("حذف الخصم نهائياً", "حذف خصم " + (dn.creditNoteNo || "") + " بمبلغ " + fmt(dn.total) + " ج.م نهائياً؟\n\nهيتشال من السجل بالكامل ويتعكس القيد المحاسبي.", { danger: true, confirmText: "حذف نهائي" })) return;
    setBusyId(dn.id);
    const r = await deleteCustomerDiscount(data, upConfig, dn, userName);
    setBusyId(null);
    showToast(r.ok ? "✓ تم حذف الخصم نهائياً" : "⛔ " + (r.error || "تعذّر الحذف"));
  };

  return (
    <div style={{ padding: 12, borderRadius: 12, background: accent + "08", border: "1px solid " + accent + "22", marginBottom: 12 }}>
      <div style={{ fontSize: FS - 1, fontWeight: 700, color: accent, marginBottom: 8 }}>🏷️ الخصومات الإضافية ({list.length})</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {list.map(dn => {
          const isVoid = dn.status === "void";
          return (
            <div key={dn.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "6px 10px", borderRadius: 8, background: T.cardSolid, border: "1px solid " + T.brd, opacity: isVoid ? 0.55 : 1 }}>
              <span style={{ fontWeight: 800, color: isVoid ? T.textMut : accent, textDecoration: isVoid ? "line-through" : "none" }}>{fmt(dn.total)} ج.م</span>
              <span style={{ fontSize: FS - 3, color: T.textSec }}>{dn.creditNoteNo || ""}</span>
              <span style={{ fontSize: FS - 3, color: T.textMut }}>{dn.date || ""}</span>
              {dn.reason ? <span style={{ fontSize: FS - 3, color: T.textMut, flex: 1, minWidth: 80 }}>— {dn.reason}</span> : <span style={{ flex: 1 }} />}
              {isVoid ? (
                <span style={{ fontSize: FS - 3, fontWeight: 700, color: T.err }}>ملغى</span>
              ) : (
                <Btn small ghost disabled={busyId === dn.id} onClick={() => doVoid(dn)} style={{ color: T.warn }}>إلغاء</Btn>
              )}
              <Btn small ghost disabled={busyId === dn.id} onClick={() => doDelete(dn)} style={{ color: T.err }}>🗑 حذف</Btn>
            </div>
          );
        })}
      </div>
    </div>
  );
}
