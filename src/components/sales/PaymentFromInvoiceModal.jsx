/* ═══════════════════════════════════════════════════════════════════════
   CLARK · PaymentFromInvoiceModal (V21.10.4 — Phase 12d)
   تسجيل دفعة على فاتورة مرحّلة. بيجمّع المبلغ + الطريقة + حساب الخزنة +
   التاريخ + ملاحظات، وبينده onSubmit(args). الـ parent بيعمل upConfig +
   autoPost. الدفع متاح للفاتورة المرحّلة (posted) والمتبقي > 0.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { Btn, Inp, Sel } from "../ui.jsx";
import { T } from "../../theme.js";
import { FS } from "../../constants/index.js";
import { fmt } from "../../utils/format.js";
import { showToast } from "../../utils/popups.js";
import { invoiceBalance } from "../../utils/sales/invoicePayments.js";

export function PaymentFromInvoiceModal({ invoice, data, onSubmit, onClose }){
  const balance = invoiceBalance(invoice);
  const accounts = useMemo(() => {
    const list = (data.treasuryAccounts || []).map(a => a.name || a.id).filter(Boolean);
    return list.length ? list : ["MAIN CASH", "SUB CASH"];
  }, [data.treasuryAccounts]);

  const [amount, setAmount] = useState(balance);
  const [method, setMethod] = useState("نقدي كاش");
  const [account, setAccount] = useState(accounts[0] || "SUB CASH");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");

  const submit = () => {
    const amt = Number(amount) || 0;
    if(amt <= 0){ showToast("⛔ المبلغ لازم يكون أكبر من صفر"); return; }
    if(amt > balance + 0.01){ showToast("⛔ المبلغ أكبر من المتبقي (" + fmt(balance) + ")"); return; }
    onSubmit({ amount: amt, method, account, date, notes });
  };

  return (
    <div className="pop-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10002, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => { if(e.target === e.currentTarget) onClose(); }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.cardSolid, borderRadius: 16, width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
        <div style={{ padding: "16px 18px", borderBottom: "1px solid " + T.brd, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 800, fontSize: FS + 1, color: T.text }}>💵 دفعة على {invoice.invoiceNo}</div>
          <Btn ghost small onClick={onClose}>✕</Btn>
        </div>
        <div style={{ padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: T.bg, borderRadius: 8, marginBottom: 12, fontSize: FS - 1 }}>
            <span style={{ color: T.textSec }}>المتبقي على الفاتورة</span>
            <b style={{ color: T.accent }}>{fmt(balance)}</b>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 600 }}>المبلغ</label>
            <Inp type="number" value={amount} onChange={setAmount} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 600 }}>الطريقة</label>
              <Sel value={method} onChange={setMethod}>
                <option value="نقدي كاش">نقدي كاش</option>
                <option value="تحويل بنكي">تحويل بنكي</option>
                <option value="محفظة إلكترونية">محفظة إلكترونية</option>
                <option value="انستاباي">انستاباي</option>
              </Sel>
            </div>
            <div>
              <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 600 }}>حساب الخزنة</label>
              <Sel value={account} onChange={setAccount}>
                {accounts.map(a => <option key={a} value={a}>{a}</option>)}
              </Sel>
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 600 }}>التاريخ</label>
            <Inp type="date" value={date} onChange={setDate} />
          </div>
          <div style={{ marginBottom: 4 }}>
            <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 600 }}>ملاحظات</label>
            <Inp value={notes} onChange={setNotes} placeholder="اختياري..." />
          </div>
        </div>
        <div style={{ padding: "12px 18px", borderTop: "1px solid " + T.brd, display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn ghost onClick={onClose}>إلغاء</Btn>
          <Btn primary onClick={submit} style={{ background: "#10B981" }}>💵 سجّل الدفعة</Btn>
        </div>
      </div>
    </div>
  );
}
