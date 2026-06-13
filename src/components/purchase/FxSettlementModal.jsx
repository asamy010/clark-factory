/* ═══════════════════════════════════════════════════════════════
   CLARK — FX Settlement Modal (V21.21.85)

   تسوية فرق صرف لفاتورة مشتريات بعملة أجنبية. المالك يختار الفاتورة
   (المرحّلة، الأجنبية)، يكتب سعر الصرف الفعلي يوم الدفع + المبلغ الأجنبي
   اللي اتسوّى → النظام يعرض الفرق (مكسب/خسارة) ويرحّله قيد مستقل:
     • خسارة (سعر أعلى): Dr 5910 / Cr موردون
     • مكسب  (سعر أقل):  Dr موردون / Cr 4910
   إجراء معزول — مايلمسش فورم الدفع/الخزنة. الدائن/المدين بالجنيه دايماً.
   ═══════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { Btn, Inp } from "../ui.jsx";
import { T } from "../../theme.js";
import { FS } from "../../constants/index.js";
import { ask, showToast } from "../../utils/popups.js";
import { fmt, r2 } from "../../utils/format.js";
import { autoPost } from "../../utils/accounting/autoPost.js";

export function FxSettlementModal({ invoice, data, upConfig, user, onClose }) {
  const userName = user?.displayName || (user?.email || "").split("@")[0] || "";
  const invRate = Number(invoice.fxRate) || 0;
  const fcTotal = Number(invoice.fcTotal) || 0;
  const settledFc = useMemo(() => (invoice.fxSettlements || []).reduce((s, x) => s + (Number(x.fcAmount) || 0), 0), [invoice.fxSettlements]);
  const remaining = r2(Math.max(0, fcTotal - settledFc));

  const [settleRate, setSettleRate] = useState("");
  const [fcAmount, setFcAmount] = useState(remaining > 0 ? String(remaining) : "");
  const [busy, setBusy] = useState(false);

  const _rate = Number(settleRate) || 0;
  const _fc = Number(fcAmount) || 0;
  const diff = r2(_fc * (_rate - invRate));    /* جنيه، موجب = خسارة */
  const isLoss = diff > 0;
  const valid = _rate > 0 && _fc > 0 && _fc <= remaining + 0.001 && diff !== 0;

  const submit = async () => {
    if (busy || !valid) return;
    const supplier = (data.suppliers || []).find(s => s.id === invoice.supplierId) || null;
    const ok = await ask("تسوية فرق صرف",
      "هيتعمل قيد " + (isLoss ? "خسارة" : "مكسب") + " فرق صرف بقيمة " + fmt(Math.abs(diff).toFixed(2)) + " ج.م لفاتورة " + invoice.invoiceNo + ".\n\n" +
      "(" + invoice.currency + " " + _fc + " × فرق السعر " + invRate + "→" + _rate + ")\n\nتمام؟", { confirmText: "ترحيل التسوية" });
    if (!ok) return;
    setBusy(true);
    try {
      const settlementId = "fxs_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6);
      const date = new Date().toISOString().split("T")[0];
      const res = await autoPost.fxSettlement(data, invoice, { settleRate: _rate, fcAmount: _fc, settlementId, date }, supplier, userName);
      if (!res || !res.ok) {
        showToast("⛔ " + (res?.error || "تعذّر ترحيل التسوية") + (res?.error && res.error.includes("4910") ? " — ازرع حسابات فرق الصرف من شجرة الحسابات" : ""));
        setBusy(false);
        return;
      }
      await upConfig(d => {
        const idx = (d.purchaseInvoices || []).findIndex(i => i.id === invoice.id);
        if (idx >= 0) {
          if (!Array.isArray(d.purchaseInvoices[idx].fxSettlements)) d.purchaseInvoices[idx].fxSettlements = [];
          d.purchaseInvoices[idx].fxSettlements.push({
            settlementId, settleRate: _rate, fcAmount: _fc, diff, isLoss,
            entryId: res.entry?.id || "", refNo: res.entry?.refNo || "", date, by: userName,
          });
        }
      });
      showToast("✓ اتعملت تسوية فرق الصرف (" + (isLoss ? "خسارة" : "مكسب") + " " + fmt(Math.abs(diff).toFixed(2)) + " ج.م)");
      onClose();
    } catch (e) {
      showToast("⛔ " + (e?.message || "خطأ"));
      setBusy(false);
    }
  };

  const row = (lbl, val, color) => <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px dashed " + T.brd }}>
    <span style={{ fontSize: FS - 1, color: T.textSec }}>{lbl}</span>
    <span style={{ fontSize: FS, fontWeight: 700, color: color || T.text, direction: "ltr" }}>{val}</span>
  </div>;

  return <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 10002, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
    <div onClick={e => e.stopPropagation()} style={{ background: T.cardSolid, borderRadius: 16, width: "min(460px,100%)", border: "1px solid " + T.brd, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid " + T.brd, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: FS + 2, fontWeight: 800, color: T.text }}>💱 تسوية فرق صرف</div>
        <Btn ghost small onClick={onClose}>✕</Btn>
      </div>
      <div style={{ padding: 18 }}>
        <div style={{ fontSize: FS - 1, color: T.textSec, marginBottom: 10 }}>فاتورة <b style={{ color: T.accent }}>{invoice.invoiceNo}</b> — {invoice.supplierName}</div>
        {row("عملة الفاتورة", invoice.currency + " × " + invRate)}
        {row("الإجمالي الأجنبي", fmt(fcTotal.toFixed(2)) + " " + invoice.currency)}
        {settledFc > 0 && row("اتسوّى قبل كده", fmt(settledFc.toFixed(2)) + " " + invoice.currency, T.textMut)}
        {row("المتبقّي للتسوية", fmt(remaining.toFixed(2)) + " " + invoice.currency, "#0EA5E9")}

        {remaining <= 0 ? <div style={{ marginTop: 14, padding: 14, textAlign: "center", color: T.ok, background: T.ok + "10", borderRadius: 10, fontWeight: 700 }}>✓ اتسوّى بالكامل</div>
        : <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
            <div>
              <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 600, display: "block", marginBottom: 3 }}>سعر الصرف الفعلي (يوم الدفع)</label>
              <Inp type="number" value={settleRate} onChange={setSettleRate} placeholder={"مثال: " + (invRate + 1)} />
            </div>
            <div>
              <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 600, display: "block", marginBottom: 3 }}>المبلغ ({invoice.currency})</label>
              <Inp type="number" value={fcAmount} onChange={setFcAmount} placeholder={String(remaining)} />
            </div>
          </div>

          {_rate > 0 && _fc > 0 && <div style={{ marginTop: 14, padding: 14, borderRadius: 10, background: (diff === 0 ? T.bg : isLoss ? "#FEF2F2" : "#F0FDF4"), border: "1px solid " + (diff === 0 ? T.brd : isLoss ? "#FECACA" : "#BBF7D0") }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: FS - 1, color: T.textSec }}>{diff === 0 ? "مفيش فرق" : isLoss ? "📉 خسارة فرق صرف" : "📈 مكسب فرق صرف"}</span>
              <span style={{ fontSize: FS + 3, fontWeight: 900, color: diff === 0 ? T.textMut : isLoss ? "#DC2626" : "#059669", direction: "ltr" }}>{fmt(Math.abs(diff).toFixed(2))} ج.م</span>
            </div>
            <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 4 }}>{isLoss ? "Dr فرق صرف خسائر (5910) / Cr موردون" : diff === 0 ? "—" : "Dr موردون / Cr فرق صرف مكاسب (4910)"}</div>
          </div>}

          <button onClick={submit} disabled={!valid || busy} style={{ width: "100%", marginTop: 16, padding: "12px", borderRadius: 10, border: "none", background: !valid || busy ? T.textMut : "#0EA5E9", color: "#fff", fontSize: FS + 1, fontWeight: 800, cursor: !valid || busy ? "default" : "pointer", fontFamily: "inherit" }}>
            {busy ? "...جاري الترحيل" : "ترحيل التسوية"}
          </button>
        </>}
      </div>
    </div>
  </div>;
}
