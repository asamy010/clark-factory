/* ═══════════════════════════════════════════════════════════════════════
   CLARK · QuickTreasuryModal (V21.9.159)
   ───────────────────────────────────────────────────────────────────────
   Ultra-fast cash entry modal — opened from the FAB on mobile (and reusable
   elsewhere). Per user feedback:

     "عاوز زر يعمل حركة وارد أو منصرف سريعة جداً — مش يفتح زي الطبيعي"

   Design:
   - LARGE +وارد / -منصرف toggle at the top (one tap to choose)
   - Big amount input, auto-focused, numeric keypad on mobile
   - Account dropdown (defaults to "MAIN CASH" or first available)
   - Optional 1-line note
   - HUGE save button colored by type (green/red)
   - Closes immediately on save — no extra prompts

   Writes the entry exactly the same shape as TreasuryPg.saveTx() so the
   day-doc split, autoPost.treasury, and reporting all see it identically.
   Skips the auto-link logic (workshop/employee/supplier/customer matching)
   that the full form supports — those are advanced; quick entry is for
   simple cash in/out on the go.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef, useMemo } from "react";
import { Btn, Inp, Sel } from "./ui.jsx";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { gid, dayName, fmt } from "../utils/format.js";
import { showToast } from "../utils/popups.js";
import { autoPost } from "../utils/accounting/autoPost.js";
import { nowISO, cairoDateStr } from "../utils/serverTime.js";

export function QuickTreasuryModal({ open, onClose, data, upConfig, user, defaultType }) {
  const [type, setType] = useState(defaultType === "out" ? "out" : "in");
  const [amount, setAmount] = useState("");
  const [account, setAccount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const amountRef = useRef(null);

  /* Normalize the accounts list — supports both legacy string entries and
     the V19+ object shape `{id, name, ownerEmail, type}`. */
  const accounts = useMemo(() => {
    const raw = Array.isArray(data?.treasuryAccounts) ? data.treasuryAccounts : [];
    return raw
      .map(a => typeof a === "string" ? { id: a, name: a } : a)
      .filter(a => a && a.name);
  }, [data?.treasuryAccounts]);

  /* When the modal opens — choose the default account (prefer MAIN CASH),
     reset fields if they were stale, and focus the amount input. */
  useEffect(() => {
    if (!open) return;
    if (accounts.length > 0 && !account) {
      const main = accounts.find(a => a.name === "MAIN CASH") || accounts[0];
      setAccount(main.name);
    }
    /* Auto-focus the amount so the user can start typing immediately */
    setTimeout(() => { amountRef.current?.focus?.(); }, 50);
  }, [open]);

  /* Live balance preview for the chosen account — gives the user instant
     confidence that they're hitting the right drawer + visibility into
     where the balance lands AFTER the entry. */
  const currentBalance = useMemo(() => {
    if (!account || !Array.isArray(data?.treasury)) return 0;
    let bal = 0;
    for (const t of data.treasury) {
      if ((t.account || "").trim() !== account) continue;
      const a = Number(t.amount) || 0;
      if (t.type === "in") bal += a;
      else if (t.type === "out") bal -= a;
    }
    return bal;
  }, [account, data?.treasury]);

  const amtNum = Number(amount) || 0;
  const projectedBalance = type === "in"
    ? currentBalance + amtNum
    : currentBalance - amtNum;

  const handleSave = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { showToast("⚠️ ادخل مبلغ أكبر من صفر"); return; }
    if (!account) { showToast("⚠️ اختر الخزنة"); return; }

    /* Confirm overdraft only for out-of-pocket cash drawers going negative. */
    if (type === "out" && projectedBalance < 0) {
      const proceed = window.confirm(
        "تحذير: الرصيد بعد العملية هـ يكون " + fmt(projectedBalance) +
        ". تتابع؟"
      );
      if (!proceed) return;
    }

    setSaving(true);
    const userName = user?.displayName || (user?.email || "").split("@")[0] || "";
    const today = cairoDateStr();
    const txId = gid();
    const entry = {
      id: txId,
      type,
      amount: amt,
      desc: notes.trim() || (type === "in" ? "إيراد سريع" : "مصروف سريع"),
      notes: notes.trim(),
      category: type === "in" ? "إيراد عام" : "مصروف عام",
      account,
      season: data?.activeSeason || "",
      date: today,
      day: dayName(today),
      custId: null,
      supplierId: null,
      empId: null,
      by: userName,
      createdAt: nowISO(),
      /* Marker for downstream filters/reports if they want to distinguish
         quick entries from full-form entries. Non-functional otherwise. */
      source: "quick-entry",
    };

    try {
      upConfig(d => {
        if (!Array.isArray(d.treasury)) d.treasury = [];
        d.treasury.unshift(entry);
      });
      /* Fire autoPost.treasury (per the saveTx pattern in TreasuryPg) — keeps
         the accounting ledger in sync. Wrapped defensively so a posting error
         doesn't block the cash write itself. */
      try {
        const r = autoPost.treasury(data, entry, userName);
        if (r && typeof r.then === "function") r.catch(() => {});
      } catch(_) {}
      showToast(type === "in" ? "✓ تم تسجيل وارد " + fmt(amt) : "✓ تم تسجيل منصرف " + fmt(amt));
      /* Reset for the next entry — keep the account selection (likely the
         same drawer) so consecutive quick entries are even faster. */
      setAmount("");
      setNotes("");
      onClose();
    } catch (e) {
      showToast("⛔ فشل الحفظ: " + (e?.message || ""));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const accentColor = type === "in" ? "#10b981" : "#dc2626";
  const accentBg    = type === "in" ? "#d1fae5" : "#fee2e2";

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100000,
        background: "rgba(15,23,42,0.6)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        animation: "qtFade .15s ease",
      }}
    >
      <style>{`
        @keyframes qtFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes qtSlide { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          width: "100%",
          maxWidth: 480,
          borderRadius: "20px 20px 0 0",
          padding: "12px 16px calc(env(safe-area-inset-bottom, 0px) + 16px)",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.25)",
          animation: "qtSlide .25s cubic-bezier(.16,1,.3,1)",
          maxHeight: "92vh",
          overflowY: "auto",
        }}
      >
        {/* Drag handle */}
        <div style={{
          width: 40, height: 4,
          background: "#cbd5e1",
          borderRadius: 2,
          margin: "0 auto 14px",
        }} />

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: FS + 3, fontWeight: 800, color: T.text }}>⚡ حركة خزنة سريعة</div>
          <Btn ghost small onClick={onClose}>✕</Btn>
        </div>

        {/* Type toggle — huge tap targets */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          marginBottom: 14,
        }}>
          <button
            onClick={() => setType("in")}
            style={{
              padding: "16px 12px",
              borderRadius: 14,
              background: type === "in" ? "#10b981" : "#f3f4f6",
              color: type === "in" ? "#fff" : "#6b7280",
              border: type === "in" ? "2px solid #10b981" : "2px solid #e5e7eb",
              fontFamily: "inherit",
              fontSize: FS + 2,
              fontWeight: 800,
              cursor: "pointer",
              transition: "all .15s",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <div style={{ fontSize: 28, lineHeight: 1, marginBottom: 4 }}>⬇</div>
            وارد
          </button>
          <button
            onClick={() => setType("out")}
            style={{
              padding: "16px 12px",
              borderRadius: 14,
              background: type === "out" ? "#dc2626" : "#f3f4f6",
              color: type === "out" ? "#fff" : "#6b7280",
              border: type === "out" ? "2px solid #dc2626" : "2px solid #e5e7eb",
              fontFamily: "inherit",
              fontSize: FS + 2,
              fontWeight: 800,
              cursor: "pointer",
              transition: "all .15s",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <div style={{ fontSize: 28, lineHeight: 1, marginBottom: 4 }}>⬆</div>
            منصرف
          </button>
        </div>

        {/* Amount — extra-large input */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: FS - 1, color: T.textSec, fontWeight: 700, display: "block", marginBottom: 6 }}>
            المبلغ (ج.م)
          </label>
          <input
            ref={amountRef}
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0"
            style={{
              width: "100%",
              padding: "16px 14px",
              fontSize: 28,
              fontWeight: 800,
              textAlign: "center",
              border: "2px solid " + accentColor,
              borderRadius: 12,
              background: accentBg,
              color: accentColor,
              fontFamily: "inherit",
              boxSizing: "border-box",
              outline: "none",
            }}
          />
        </div>

        {/* Account */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: FS - 1, color: T.textSec, fontWeight: 700, display: "block", marginBottom: 6 }}>
            الخزنة
          </label>
          <Sel value={account} onChange={setAccount}>
            {accounts.length === 0
              ? <option value="">— لا توجد خزائن —</option>
              : accounts.map(a => (
                  <option key={a.id || a.name} value={a.name}>{a.name}</option>
                ))}
          </Sel>
          {account && (
            <div style={{
              fontSize: FS - 2,
              color: T.textMut,
              marginTop: 6,
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              padding: "8px 12px",
              background: "#f9fafb",
              borderRadius: 8,
              border: "1px solid #f1f5f9",
            }}>
              <span>الرصيد الحالي: <b style={{ color: T.text }}>{fmt(currentBalance)}</b></span>
              {amtNum > 0 && (
                <>
                  <span style={{ opacity: 0.6 }}>→</span>
                  <span>بعد العملية: <b style={{ color: projectedBalance < 0 ? "#dc2626" : "#0369a1" }}>{fmt(projectedBalance)}</b></span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Note (optional, 1 line) */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: FS - 1, color: T.textSec, fontWeight: 700, display: "block", marginBottom: 6 }}>
            ملاحظة (اختياري)
          </label>
          <Inp value={notes} onChange={setNotes} placeholder="مثلاً: من العميل أحمد، إيداع بنك..." />
        </div>

        {/* Save — huge */}
        <button
          onClick={handleSave}
          disabled={saving || !amtNum || !account}
          style={{
            width: "100%",
            padding: "16px",
            borderRadius: 14,
            background: (!amtNum || !account || saving) ? "#cbd5e1" : accentColor,
            color: "#fff",
            border: "none",
            fontFamily: "inherit",
            fontSize: FS + 3,
            fontWeight: 800,
            cursor: (!amtNum || !account || saving) ? "not-allowed" : "pointer",
            transition: "all .15s",
            WebkitTapHighlightColor: "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          {saving ? "⏳ جاري الحفظ..." : (
            <>
              <span style={{ fontSize: 22 }}>💾</span>
              <span>حفظ {type === "in" ? "وارد" : "منصرف"} {amtNum > 0 ? fmt(amtNum) + " ج" : ""}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
