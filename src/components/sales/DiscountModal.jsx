/* ═══════════════════════════════════════════════════════════════════════
   CLARK · DiscountModal (V21.21.59) — خصم إضافي للعميل
   مبلغ بيقلّل رصيد العميل (مش دفعة ومش مرتجع). مشترك بين شاشة العميل
   (CustDeliverPg) وكشف الحساب (AccountStatementView).
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { Btn, Inp, SearchSel } from "../ui.jsx";
import { T } from "../../theme.js";
import { FS } from "../../constants/index.js";
import { fmt, r2, ltrPhone } from "../../utils/format.js";
import { showToast } from "../../utils/popups.js";
import { createCustomerDiscount } from "../../utils/sales/discounts.js";

export function DiscountModal({ data, upConfig, user, fixedCustomerId = null, onClose, onDone }){
  const customers = useMemo(() => (data.customers || []).filter(c => !c.archived), [data.customers]);
  const today = new Date().toISOString().split("T")[0];
  const [customerId, setCustomerId] = useState(fixedCustomerId != null ? String(fixedCustomerId) : "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const cust = customers.find(c => String(c.id) === String(customerId)) || null;
  const userName = (user && (user.name || user.email)) || "";

  const save = async () => {
    const amt = r2(parseFloat(amount) || 0);
    if(!customerId){ showToast("⛔ اختر العميل"); return; }
    if(amt <= 0){ showToast("⛔ أدخل مبلغ خصم صحيح"); return; }
    setBusy(true);
    const res = await createCustomerDiscount(
      data, upConfig,
      { customerId, customerName: cust?.name || "", amount: amt, date, reason: reason.trim() },
      cust, userName
    );
    setBusy(false);
    if(res.ok){
      showToast("✓ تم تسجيل خصم إضافي " + fmt(amt) + " ج.م — قلّل رصيد العميل");
      onDone && onDone();
      onClose && onClose();
    } else {
      showToast("⛔ " + (res.error || "تعذّر تسجيل الخصم"));
    }
  };

  const lbl = { fontSize: FS - 2, color: T.textSec, fontWeight: 600, display: "block", marginBottom: 4 };

  return (
    <div className="pop-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100003, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => { if(!busy) onClose && onClose(); }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.cardSolid, borderRadius: 16, padding: 20, width: "100%", maxWidth: 440, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontSize: FS + 2, fontWeight: 800, color: "#0EA5E9" }}>🏷️ خصم إضافي للعميل</div>
          <Btn ghost small onClick={() => !busy && onClose && onClose()}>✕</Btn>
        </div>
        <div style={{ fontSize: FS - 2, color: T.textMut, marginBottom: 14, lineHeight: 1.6 }}>
          مبلغ بيقلّل رصيد العميل (مش دفعة ومش مرتجع). بيتسجّل كإشعار خصم وبيعمل قيد محاسبي عكسي للبيع.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {fixedCustomerId == null ? (
            <div>
              <label style={lbl}>العميل <span style={{ color: T.err }}>*</span></label>
              <SearchSel value={customerId} onChange={setCustomerId} options={customers.map(c => ({ value: c.id, label: c.name + (c.phone ? " — " + ltrPhone(c.phone) : "") }))} placeholder="اختر عميل..." showAllOnFocus maxResults={15} />
            </div>
          ) : (
            <div style={{ padding: "8px 12px", borderRadius: 8, background: T.bg, fontWeight: 700, color: T.text }}>👤 {cust?.name || "—"}</div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={lbl}>مبلغ الخصم (ج.م) <span style={{ color: T.err }}>*</span></label>
              <Inp type="number" value={amount} onChange={setAmount} placeholder="0" />
            </div>
            <div>
              <label style={lbl}>التاريخ</label>
              <Inp type="date" value={date} onChange={setDate} />
            </div>
          </div>
          <div>
            <label style={lbl}>السبب / ملاحظة (اختياري)</label>
            <Inp value={reason} onChange={setReason} placeholder="مثال: خصم آخر الموسم على الكمية الموجودة" />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <Btn ghost onClick={() => !busy && onClose && onClose()}>إلغاء</Btn>
          <Btn primary onClick={save} disabled={busy} style={{ background: busy ? T.textMut : "#0EA5E9", color: "#fff", border: "none" }}>
            {busy ? "...جارٍ الحفظ" : "💾 تسجيل الخصم"}
          </Btn>
        </div>
      </div>
    </div>
  );
}
