/* ═══════════════════════════════════════════════════════════════════════
   CLARK · QuickTreasuryModal (V21.9.162)
   ───────────────────────────────────────────────────────────────────────
   Mobile-optimized cash entry — matches the FULL form's behavior but with
   a tighter layout. Per user feedback (V21.9.162):
     - field order: النوع → المبلغ → نوع الحركة → (conditional party) → التاريخ
     - searchable category dropdown
     - when category implies a party (دفعة عميل / دفعة مورد / مرتبات / تشغيل
       خارجي / مشتريات) → show customer / supplier / employee / workshop picker
     - hide "current balance" preview (was too noisy)

   Writes the same entry shape as TreasuryPg.saveTx() AND auto-creates the
   linked custPayments / supplierPayments / hrLog / wsPayments records — so
   the party's running balance updates immediately, just like the full form.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef, useMemo } from "react";
import { Btn, Inp, Sel, SearchSel } from "./ui.jsx";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { gid, dayName, fmt } from "../utils/format.js";
import { showToast } from "../utils/popups.js";
import { autoPost } from "../utils/accounting/autoPost.js";
import { nowISO, cairoDateStr } from "../utils/serverTime.js";

/* Default categories — mirror TreasuryPg's OUT_CATS / IN_CATS so quick mode
   and full mode share the same vocabulary. We also include the REQUIRED set
   (دفعة عميل / دفعة مورد / etc.) to guarantee party-linking still works
   even if the user's treasurySettings list is missing them. */
const DEFAULT_OUT_CATS = ["دفعة مورد","مشتريات","مرتبات","تشغيل خارجي","تكلفة","قطع غيار","صيانة ماكينات","خيط","نقل","كهرباء","ضيافة","ايجار المصنع","نثريات","اكسسوار","مستلزمات تشغيل","ورق ماركر","خدمات","أصول ثابتة","تكاليف أخرى","تحويل داخلي"];
const DEFAULT_IN_CATS  = ["دفعة عميل","وارد","إيرادات","رأس مال","تحويل","تحويل داخلي"];
const REQUIRED_OUT     = ["دفعة مورد","تشغيل خارجي","مرتبات","تحويل داخلي"];
const REQUIRED_IN      = ["دفعة عميل","تحويل داخلي"];

/* Categories that imply a linked party (and which entity to pick). The
   condition also gates by type (in vs out) since e.g. دفعة عميل is only
   meaningful on an "in" entry. */
function getPartyTypeForCategory(category, type) {
  if (type === "in" && category === "دفعة عميل") return "customer";
  if (type === "out" && category === "دفعة مورد") return "supplier";
  if (type === "out" && category === "مشتريات") return "supplier";/* per TreasuryPg.saveTx:970 */
  if (type === "out" && category === "مرتبات") return "employee";
  if (type === "out" && category === "تشغيل خارجي") return "workshop";
  return null;
}

export function QuickTreasuryModal({ open, onClose, data, upConfig, user, defaultType }) {
  const [type, setType]             = useState(defaultType === "out" ? "out" : "in");
  const [amount, setAmount]         = useState("");
  const [category, setCategory]     = useState("");
  const [partyId, setPartyId]       = useState("");
  const [date, setDate]             = useState(() => cairoDateStr());
  const [account, setAccount]       = useState("");
  const [notes, setNotes]           = useState("");
  const [saving, setSaving]         = useState(false);
  const amountRef = useRef(null);

  /* Accounts list — handles both legacy string entries and V19+ objects */
  const accounts = useMemo(() => {
    const raw = Array.isArray(data?.treasuryAccounts) ? data.treasuryAccounts : [];
    return raw
      .map(a => typeof a === "string" ? { id: a, name: a } : a)
      .filter(a => a && a.name);
  }, [data?.treasuryAccounts]);

  /* Resolved categories by type, including REQUIRED items (handles users
     who pruned them from treasurySettings without realizing it would break
     the party-linking flows). */
  const categoryOptions = useMemo(() => {
    const settings = data?.treasurySettings || {};
    if (type === "out") {
      const saved = Array.isArray(settings.outCategories) && settings.outCategories.length > 0
        ? [...settings.outCategories]
        : [...DEFAULT_OUT_CATS];
      REQUIRED_OUT.forEach(c => { if (!saved.includes(c)) saved.push(c); });
      return saved.map(c => ({ value: c, label: c }));
    }
    const saved = Array.isArray(settings.inCategories) && settings.inCategories.length > 0
      ? [...settings.inCategories]
      : [...DEFAULT_IN_CATS];
    REQUIRED_IN.forEach(c => { if (!saved.includes(c)) saved.push(c); });
    return saved.map(c => ({ value: c, label: c }));
  }, [data?.treasurySettings, type]);

  /* The party type (customer/supplier/employee/workshop) implied by the chosen category. */
  const partyKind = getPartyTypeForCategory(category, type);

  /* Party options list (filtered by kind). */
  const partyOptions = useMemo(() => {
    if (!partyKind) return [];
    if (partyKind === "customer") {
      return (data?.customers || []).filter(c => !c.archived).map(c => ({
        value: c.id, label: c.name + (c.phone ? " — " + c.phone : ""),
      }));
    }
    if (partyKind === "supplier") {
      return (data?.suppliers || []).map(s => ({
        value: s.id, label: s.name + (s.phone ? " — " + s.phone : ""),
      }));
    }
    if (partyKind === "employee") {
      return (data?.employees || []).filter(e => !e.inactive).map(e => ({
        value: e.id, label: e.name + (e.code ? " #" + e.code : "") + (e.job ? " — " + e.job : ""),
      }));
    }
    if (partyKind === "workshop") {
      /* Workshops use NAME as the key, not id (per TreasuryPg auto-link logic) */
      return (data?.workshops || []).map(w => ({
        value: w.name, label: w.name + (w.owner ? " — " + w.owner : ""),
      }));
    }
    return [];
  }, [partyKind, data?.customers, data?.suppliers, data?.employees, data?.workshops]);

  /* Reset partyId when the category changes (avoid stale references). */
  useEffect(() => {
    setPartyId("");
  }, [category, type]);

  /* When the modal opens — set default account (MAIN CASH), reset stale
     fields, and focus the amount input. */
  useEffect(() => {
    if (!open) return;
    if (accounts.length > 0 && !account) {
      const main = accounts.find(a => a.name === "MAIN CASH") || accounts[0];
      setAccount(main.name);
    }
    setTimeout(() => { amountRef.current?.focus?.(); }, 50);
  }, [open]);

  const amtNum = Number(amount) || 0;

  const handleSave = async () => {
    if (!amtNum || amtNum <= 0) { showToast("⚠️ ادخل مبلغ أكبر من صفر"); return; }
    if (!account) { showToast("⚠️ اختر الخزنة"); return; }
    if (!category) { showToast("⚠️ اختر نوع الحركة"); return; }
    /* If the category implies a party, require the user to pick one — keeps
       data clean (no orphan "دفعة عميل" with custId=null). */
    if (partyKind && !partyId) {
      const partyLabel = partyKind === "customer" ? "العميل"
                      : partyKind === "supplier" ? "المورد"
                      : partyKind === "employee" ? "الموظف"
                      : partyKind === "workshop" ? "الورشة" : "الجهة";
      showToast("⚠️ اختر " + partyLabel);
      return;
    }

    setSaving(true);
    const userName = user?.displayName || (user?.email || "").split("@")[0] || "";
    const txDate = date || cairoDateStr();
    const txId = gid();
    const txMethod = "نقدي كاش";/* Quick mode defaults to cash; full form lets user change */

    /* Resolve linked entity IDs based on partyKind */
    const linkedCustId     = (partyKind === "customer") ? partyId : null;
    const linkedSupplierId = (partyKind === "supplier") ? partyId : null;
    const linkedEmpId      = (partyKind === "employee") ? partyId : null;
    const linkedWsName     = (partyKind === "workshop") ? partyId : null;

    /* Compose a helpful default description if user didn't type a note */
    const partyName = (() => {
      const opt = partyOptions.find(o => o.value === partyId);
      if (!opt) return "";
      /* Strip suffix " — ..." to keep just the name */
      return opt.label.split(" — ")[0];
    })();
    const finalDesc = notes.trim() || (partyName ? category + ": " + partyName : category);

    const baseEntry = {
      id: txId,
      type,
      amount: amtNum,
      desc: finalDesc,
      notes: notes.trim(),
      category,
      account,
      season: data?.activeSeason || "",
      date: txDate,
      day: dayName(txDate),
      custId: linkedCustId,
      supplierId: linkedSupplierId,
      empId: linkedEmpId,
      by: userName,
      createdAt: nowISO(),
      source: "quick-entry",
    };

    try {
      upConfig(d => {
        if (!Array.isArray(d.treasury)) d.treasury = [];

        /* ─── Auto-link records — mirror TreasuryPg.saveTx lines 1124-1143 ─── */
        if (linkedCustId && type === "in") {
          if (!Array.isArray(d.custPayments)) d.custPayments = [];
          const c = (d.customers || []).find(x => x.id === linkedCustId);
          d.custPayments.push({
            id: gid(),
            custId: linkedCustId,
            custName: c ? c.name : "",
            amount: amtNum,
            date: txDate,
            note: notes.trim() || finalDesc,
            method: txMethod,
            by: userName,
            treasuryTxId: txId,
            createdAt: nowISO(),
          });
        }
        if (linkedSupplierId && type === "out") {
          if (!Array.isArray(d.supplierPayments)) d.supplierPayments = [];
          const s = (d.suppliers || []).find(x => x.id === linkedSupplierId);
          d.supplierPayments.push({
            id: gid(),
            supplierId: linkedSupplierId,
            supplierName: s ? s.name : "",
            amount: amtNum,
            date: txDate,
            note: notes.trim() || finalDesc,
            method: txMethod,
            by: userName,
            treasuryTxId: txId,
            createdAt: nowISO(),
          });
        }
        if (linkedEmpId && type === "out") {
          if (!Array.isArray(d.hrLog)) d.hrLog = [];
          const emp = (d.employees || []).find(x => x.id === linkedEmpId);
          const logId = gid();
          d.hrLog.unshift({
            id: logId,
            type: "advance",
            empId: linkedEmpId,
            empName: emp ? emp.name : "",
            amount: amtNum,
            desc: notes.trim() || finalDesc || "سلفة",
            weekId: "",
            date: txDate,
            by: userName,
            createdAt: nowISO(),
          });
          baseEntry.sourceType = "hr_advance";
          baseEntry.hrLogId = logId;
        }
        if (linkedWsName && type === "out") {
          if (!Array.isArray(d.wsPayments)) d.wsPayments = [];
          const w = (d.workshops || []).find(x => x.name === linkedWsName);
          const wsPayId = gid();
          d.wsPayments.push({
            id: wsPayId,
            wsName: linkedWsName,
            wsId: w ? w.id : null,
            amount: amtNum,
            type: category === "مشتريات" ? "purchase" : "payment",
            notes: notes.trim(),
            date: txDate,
            createdBy: userName,
            treasuryTxId: txId,
            createdAt: nowISO(),
          });
          baseEntry.wsPaymentId = wsPayId;
          baseEntry.wsName = linkedWsName;
          baseEntry.sourceType = "ws_payment";
        }

        d.treasury.unshift(baseEntry);
      });

      /* autoPost.treasury — only for plain entries (linked ones have their
         own posting rules handled by the auto-link side effects). */
      if (!baseEntry.sourceType) {
        try {
          const r = autoPost.treasury(data, baseEntry, userName);
          if (r && typeof r.then === "function") r.catch(() => {});
        } catch(_) {}
      }

      showToast((type === "in" ? "✓ وارد " : "✓ منصرف ") + fmt(amtNum) + " — " + category);
      /* Reset for the next entry but keep account + date for consecutive entries */
      setAmount("");
      setNotes("");
      setCategory("");
      setPartyId("");
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
  const partyLabel  = partyKind === "customer" ? "العميل"
                    : partyKind === "supplier" ? "المورد"
                    : partyKind === "employee" ? "الموظف"
                    : partyKind === "workshop" ? "الورشة" : null;

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

        {/* النوع — in / out toggle (huge tap targets) */}
        <div style={{ marginBottom: 14 }}>
          <label style={fieldLabelStyle}>النوع</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <button
              onClick={() => setType("in")}
              style={typeBtn(type === "in", "#10b981")}
            >
              <div style={{ fontSize: 26, lineHeight: 1, marginBottom: 4 }}>⬇</div>
              وارد
            </button>
            <button
              onClick={() => setType("out")}
              style={typeBtn(type === "out", "#dc2626")}
            >
              <div style={{ fontSize: 26, lineHeight: 1, marginBottom: 4 }}>⬆</div>
              منصرف
            </button>
          </div>
        </div>

        {/* المبلغ */}
        <div style={{ marginBottom: 14 }}>
          <label style={fieldLabelStyle}>المبلغ (ج.م)</label>
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

        {/* نوع الحركة — searchable */}
        <div style={{ marginBottom: 14 }}>
          <label style={fieldLabelStyle}>نوع الحركة</label>
          <SearchSel
            value={category}
            onChange={setCategory}
            options={categoryOptions}
            placeholder="اكتب أو اختر..."
            showAllOnFocus
            /* V21.27.148: كان 20 — البنود المضافة بعد الـ20 ما كانتش بتظهر عند الفتح */
            maxResults={999}
          />
        </div>

        {/* جهة (conditional — depends on category) */}
        {partyKind && (
          <div style={{ marginBottom: 14 }}>
            <label style={fieldLabelStyle}>{partyLabel}</label>
            <SearchSel
              value={partyId}
              onChange={setPartyId}
              options={partyOptions}
              placeholder={"اكتب اسم " + partyLabel + " أو اختر..."}
              showAllOnFocus
              maxResults={15}
            />
            {partyOptions.length === 0 && (
              <div style={{ fontSize: FS - 3, color: T.warn, marginTop: 4 }}>
                ⚠️ لا توجد {partyLabel === "العميل" ? "عملاء" : partyLabel === "المورد" ? "موردين" : partyLabel === "الموظف" ? "موظفين" : "ورش"} مسجلين بعد
              </div>
            )}
          </div>
        )}

        {/* التاريخ */}
        <div style={{ marginBottom: 14 }}>
          <label style={fieldLabelStyle}>التاريخ</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{
              width: "100%",
              padding: "12px 14px",
              fontSize: FS + 1,
              fontWeight: 600,
              border: "1px solid " + T.brd,
              borderRadius: 10,
              background: T.cardSolid,
              color: T.text,
              fontFamily: "inherit",
              boxSizing: "border-box",
              outline: "none",
            }}
          />
        </div>

        {/* الخزنة */}
        <div style={{ marginBottom: 14 }}>
          <label style={fieldLabelStyle}>الخزنة</label>
          <Sel value={account} onChange={setAccount}>
            {accounts.length === 0
              ? <option value="">— لا توجد خزائن —</option>
              : accounts.map(a => (
                  <option key={a.id || a.name} value={a.name}>{a.name}</option>
                ))}
          </Sel>
        </div>

        {/* ملاحظة (optional) */}
        <div style={{ marginBottom: 14 }}>
          <label style={fieldLabelStyle}>ملاحظة (اختياري)</label>
          <Inp value={notes} onChange={setNotes} placeholder="تفاصيل إضافية..." />
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving || !amtNum || !account || !category || (partyKind && !partyId)}
          style={{
            width: "100%",
            padding: "16px",
            borderRadius: 14,
            background: (!amtNum || !account || !category || (partyKind && !partyId) || saving) ? "#cbd5e1" : accentColor,
            color: "#fff",
            border: "none",
            fontFamily: "inherit",
            fontSize: FS + 3,
            fontWeight: 800,
            cursor: (!amtNum || !account || !category || (partyKind && !partyId) || saving) ? "not-allowed" : "pointer",
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

const fieldLabelStyle = {
  fontSize: 12,
  color: "#64748b",
  fontWeight: 700,
  display: "block",
  marginBottom: 6,
};

function typeBtn(active, color) {
  return {
    padding: "16px 12px",
    borderRadius: 14,
    background: active ? color : "#f3f4f6",
    color: active ? "#fff" : "#6b7280",
    border: active ? ("2px solid " + color) : "2px solid #e5e7eb",
    fontFamily: "inherit",
    fontSize: 16,
    fontWeight: 800,
    cursor: "pointer",
    transition: "all .15s",
    WebkitTapHighlightColor: "transparent",
  };
}
