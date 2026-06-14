/* ═══════════════════════════════════════════════════════════════════════
   CLARK · AccountTransferPg (V21.22.20 — «تحميل حساب»)
   ───────────────────────────────────────────────────────────────────────
   نقل رصيد طرف (الطرف الأول/المصدر) إلى طرف آخر (الطرف التاني/الوجهة).
   الطرفان أي مزيج من عميل/مورد. بيصفّر المصدر ويزود/يقلّل الوجهة حسب
   طبيعة الرصيد — والقيود بتظهر في كشف حساب الطرفين (method="تحميل حساب").

   الحالة الأساسية: مورد بيسدّد حسابات عملاء من رصيده → رصيد العميل (المدين)
   ورصيد المورد (الدائن) كلاهما بيقلّ — مفيش حركة خزنة (زي مقاصة).

   كل الحساب المالي في src/utils/contacts.js (transferPartyBalance +
   previewPartyTransfer + reversePartyTransfer) — هنا UI بس.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo, useEffect } from "react";
import { Btn, Inp, SearchSel } from "../../components/ui.jsx";
import { T } from "../../theme.js";
import { FS } from "../../constants/index.js";
import { fmt } from "../../utils/format.js";
import { ask, showToast } from "../../utils/popups.js";
import {
  partyAccountBalance, previewPartyTransfer,
  transferPartyBalance, reversePartyTransfer, listAccountTransfers,
} from "../../utils/contacts.js";

const PT = [
  { key: "customer", label: "عميل", icon: "👥", color: "#0EA5E9" },
  { key: "supplier", label: "مورد", icon: "🏭", color: "#F59E0B" },
];

/* وصف اتجاه الرصيد بالعربي حسب نوع الطرف وإشارته */
function balanceLabel(type, bal){
  const a = fmt(Math.abs(bal));
  if(Math.abs(bal) < 0.01) return { text: "الرصيد صفر", color: T.textMut };
  if(type === "customer")
    return bal > 0 ? { text: "مدين لك بـ " + a, color: "#0EA5E9" } : { text: "أنت مدين له بـ " + a, color: T.err };
  /* supplier */
  return bal > 0 ? { text: "أنت مدين له بـ " + a, color: "#F59E0B" } : { text: "مدين لك بـ " + a, color: "#0EA5E9" };
}

export function AccountTransferPg({ data, upConfig, user, isMob, canEdit }){
  const [fromType, setFromType] = useState("supplier");
  const [fromId, setFromId] = useState("");
  const [toType, setToType] = useState("customer");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");
  const [touchedAmt, setTouchedAmt] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  /* خيارات السيرش — أسماء فقط (مفيش حساب رصيد per-option؛ §15 أداء) */
  const optsFor = (type) => (type === "customer" ? (data.customers || []) : (data.suppliers || []))
    .filter(p => p && p.id)
    .map(p => ({ value: String(p.id), label: p.name || "(بدون اسم)" }));
  const fromOpts = useMemo(() => optsFor(fromType), [fromType, data.customers, data.suppliers]);
  const toOpts   = useMemo(() => optsFor(toType),   [toType,   data.customers, data.suppliers]);

  const fromName = useMemo(() => (fromOpts.find(o => o.value === fromId) || {}).label || "", [fromOpts, fromId]);
  const toName   = useMemo(() => (toOpts.find(o => o.value === toId) || {}).label || "", [toOpts, toId]);

  const fromBal = useMemo(() => fromId ? partyAccountBalance(fromType, fromId, data) : 0, [fromType, fromId, data]);
  const toBal   = useMemo(() => toId   ? partyAccountBalance(toType,   toId,   data) : 0, [toType, toId, data]);

  /* لما يتغيّر المصدر — افتراضي = الرصيد الكامل (تصفير المصدر) */
  useEffect(() => { setTouchedAmt(false); setAmount(fromId ? String(Math.abs(fromBal) || "") : ""); }, [fromType, fromId]);

  const pv = useMemo(() => previewPartyTransfer(
    { fromType, fromId, toType, toId, amount: touchedAmt ? amount : undefined }, data),
    [fromType, fromId, toType, toId, amount, touchedAmt, data]);

  const sameParty = fromType === toType && fromId && fromId === toId;
  const amtNum = Math.round((Number(amount) || 0) * 100) / 100;
  const ready = canEdit && fromId && toId && !sameParty && pv.ok && amtNum > 0;

  const transfers = useMemo(() => listAccountTransfers(data), [data.custPayments, data.supplierPayments]);

  const errMsg = (e) => ({
    SAME_PARTY: "لا يمكن النقل لنفس الطرف",
    SOURCE_ZERO: "رصيد الطرف الأول صفر — مفيش حاجة تتنقل",
    AMOUNT_INVALID: "المبلغ غير صالح",
    AMOUNT_OVER_MAX: "المبلغ أكبر من رصيد الطرف الأول",
    INCOMPLETE: "اختر الطرفين",
  })[e] || "";

  const doTransfer = async () => {
    if(!ready){ showToast("⚠️ " + (errMsg(pv.error) || "راجع البيانات")); return; }
    const yes = await ask(
      "تأكيد تحميل الحساب",
      "نقل " + fmt(amtNum) + " ج.م من «" + fromName + "» إلى «" + toName + "».\n\n" +
      "بعد التنفيذ:\n" +
      "• " + fromName + ": " + fmt(fromBal) + " ← " + fmt(pv.fromAfter) + "\n" +
      "• " + toName + ": " + fmt(toBal) + " ← " + fmt(pv.toAfter) + "\n\n" +
      "مفيش حركة خزنة — القيود هتظهر في كشف حساب الطرفين.",
      { confirmText: "تنفيذ النقل" }
    );
    if(!yes) return;
    setSubmitting(true);
    try {
      const { patch } = transferPartyBalance(
        { fromType, fromId, toType, toId, amount: amtNum, date, notes: notes.trim() }, data, user);
      upConfig(d => { for(const k of Object.keys(patch)) d[k] = patch[k]; });
      showToast("✓ تم تحميل الحساب — راجع كشف الطرفين");
      setNotes(""); setTouchedAmt(false); setAmount(""); setFromId(""); setToId("");
    } catch(e){
      const m = (e && e.message) || "";
      showToast("⛔ " + (errMsg(m.replace(/^TRANSFER_/, "")) || "خطأ — راجع الـ console"));
      if(!errMsg(m.replace(/^TRANSFER_/, ""))) console.error("[AccountTransfer] error:", e);
    } finally { setSubmitting(false); }
  };

  const reverse = async (t) => {
    if(!canEdit){ showToast("⚠️ مفيش صلاحية"); return; }
    const yes = await ask("عكس تحميل الحساب",
      "عكس نقل " + fmt(t.magnitude) + " ج.م بين «" + ((t.from && t.from.name) || "—") + "» و«" + ((t.to && t.to.name) || "—") + "»؟\n\n" +
      "هيتشال القيدان من كشف الطرفين وترجع الأرصدة زي ما كانت.",
      { danger: true, confirmText: "عكس النقل" });
    if(!yes) return;
    try {
      const { patch } = reversePartyTransfer(t.transferId, data);
      upConfig(d => { for(const k of Object.keys(patch)) d[k] = patch[k]; });
      showToast("↩️ تم عكس تحميل الحساب");
    } catch(e){
      showToast("⛔ " + (((e && e.message) === "TRANSFER_NOT_FOUND") ? "التحويل غير موجود" : "خطأ — راجع الـ console"));
    }
  };

  /* ── party picker block ── */
  const PartyPicker = ({ title, type, setType, id, setId, opts, bal, name }) => {
    const bl = id ? balanceLabel(type, bal) : null;
    return (
      <div style={{ flex: 1, minWidth: isMob ? "100%" : 280, background: T.cardSolid, border: "1px solid " + T.brd, borderRadius: 14, padding: 16, boxShadow: T.shadow }}>
        <div style={{ fontSize: FS - 1, fontWeight: 800, color: T.textSec, marginBottom: 10 }}>{title}</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {PT.map(p => (
            <div key={p.key} onClick={() => { setType(p.key); setId(""); }}
              style={{ flex: 1, textAlign: "center", padding: "8px 0", borderRadius: 10, cursor: "pointer", fontSize: FS - 1, fontWeight: 800,
                color: type === p.key ? "#fff" : T.textSec, background: type === p.key ? p.color : T.bg,
                border: "1px solid " + (type === p.key ? p.color : T.brd) }}>
              {p.icon} {p.label}
            </div>
          ))}
        </div>
        <SearchSel value={id} onChange={setId} options={opts} showAllOnFocus maxResults={8}
          placeholder={"🔍 اختر " + (type === "customer" ? "العميل" : "المورد") + "..."} />
        {id && bl && (
          <div style={{ marginTop: 10, padding: "10px 12px", background: T.bg, borderRadius: 10, border: "1px solid " + T.brd }}>
            <div style={{ fontSize: FS, fontWeight: 800, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
            <div style={{ fontSize: FS - 1, fontWeight: 700, color: bl.color, marginTop: 3 }}>الرصيد الحالي: {bl.text}</div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ width: "100%" }}>
      {/* header */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: FS + 4, fontWeight: 800, color: T.text }}>💱 تحميل حساب</div>
        <div style={{ fontSize: FS - 1, color: T.textSec, marginTop: 3, lineHeight: 1.7 }}>
          انقل رصيد طرف بالكامل أو جزئياً إلى طرف آخر — يصفّر الأول، يزود/يقلّل التاني،
          والقيود بتظهر في كشف حساب الطرفين. مثال: مورد بيسدّد حساب عميل من رصيده.
        </div>
      </div>

      {!canEdit && (
        <div style={{ padding: "10px 14px", background: T.warn + "12", border: "1px solid " + T.warn + "33", borderRadius: 10, color: T.warn, fontSize: FS - 1, marginBottom: 14 }}>
          🔒 ليس لديك صلاحية تنفيذ تحميل الحساب (عرض فقط).
        </div>
      )}

      {/* the two parties */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "stretch" }}>
        <PartyPicker title="① الطرف الأول (المنقول منه)" type={fromType} setType={setFromType} id={fromId} setId={setFromId} opts={fromOpts} bal={fromBal} name={fromName} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, color: T.accent, padding: isMob ? "0" : "0 2px", width: isMob ? "100%" : "auto", transform: isMob ? "rotate(90deg)" : "none" }}>⟸</div>
        <PartyPicker title="② الطرف التاني (المحوّل إليه)" type={toType} setType={setToType} id={toId} setId={setToId} opts={toOpts} bal={toBal} name={toName} />
      </div>

      {/* amount + date */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 14 }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700 }}>المبلغ المنقول (افتراضي = رصيد الطرف الأول كامل)</label>
          <Inp type="number" value={amount} onChange={(v) => { setTouchedAmt(true); setAmount(v); }} placeholder="0" />
          {fromId && pv.maxMag > 0 && (
            <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 4 }}>
              الحد الأقصى: {fmt(pv.maxMag)} ج.م
              <span onClick={() => { setTouchedAmt(true); setAmount(String(pv.maxMag)); }} style={{ marginInlineStart: 8, color: T.accent, cursor: "pointer", fontWeight: 700 }}>الكل</span>
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700 }}>التاريخ</label>
          <Inp value={date} onChange={setDate} />
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700 }}>ملاحظات (اختياري)</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="سبب النقل..."
          style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid " + T.brd, fontSize: FS - 1, fontFamily: "inherit", background: T.cardSolid, color: T.text, boxSizing: "border-box", resize: "vertical", minHeight: 46, outline: "none" }} />
      </div>

      {/* preview */}
      {fromId && toId && !sameParty && (
        <div style={{ marginTop: 14, padding: "12px 14px", background: pv.ok ? T.ok + "0D" : T.err + "0D", border: "1px solid " + (pv.ok ? T.ok + "33" : T.err + "33"), borderRadius: 12 }}>
          {pv.ok ? (
            <div style={{ display: "flex", flexDirection: isMob ? "column" : "row", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700 }}>① {fromName}</div>
                <div style={{ fontSize: FS, marginTop: 2 }}>
                  <span style={{ color: T.textMut }}>{fmt(fromBal)}</span>
                  <span style={{ margin: "0 6px", color: T.accent }}>←</span>
                  <strong style={{ color: T.ok }}>{fmt(pv.fromAfter)}</strong>
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700 }}>② {toName}</div>
                <div style={{ fontSize: FS, marginTop: 2 }}>
                  <span style={{ color: T.textMut }}>{fmt(toBal)}</span>
                  <span style={{ margin: "0 6px", color: T.accent }}>←</span>
                  <strong style={{ color: T.text }}>{fmt(pv.toAfter)}</strong>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ color: T.err, fontSize: FS - 1, fontWeight: 700 }}>⚠️ {errMsg(pv.error) || "راجع البيانات"}</div>
          )}
        </div>
      )}

      {/* action */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
        <Btn primary onClick={doTransfer} disabled={!ready || submitting}>{submitting ? "..." : "💱 تنفيذ تحميل الحساب"}</Btn>
      </div>

      {/* history */}
      <div style={{ marginTop: 26 }}>
        <div style={{ fontSize: FS + 1, fontWeight: 800, color: T.text, marginBottom: 10 }}>📜 سجل تحميلات الحساب</div>
        {transfers.length === 0 ? (
          <div style={{ textAlign: "center", padding: "30px 16px", color: T.textMut, fontSize: FS - 1 }}>مفيش تحميلات حساب لسه.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {transfers.map(t => (
              <div key={t.transferId} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "11px 14px", background: T.cardSolid, border: "1px solid " + T.brd, borderRadius: 12 }}>
                <div style={{ minWidth: 84 }}>
                  <div style={{ fontSize: FS + 2, fontWeight: 800, color: T.text }}>{fmt(t.magnitude)}</div>
                  <div style={{ fontSize: FS - 3, color: T.textMut }}>ج.م</div>
                </div>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: FS - 1, color: T.text, fontWeight: 700 }}>
                    {(t.from && t.from.name) || "—"} <span style={{ color: T.accent, margin: "0 4px" }}>⟸</span> {(t.to && t.to.name) || "—"}
                  </div>
                  <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 2 }}>{t.date || ""}{t.note ? " · " + t.note : ""}</div>
                </div>
                {canEdit && <Btn small onClick={() => reverse(t)} style={{ background: T.err + "12", color: T.err, border: "1px solid " + T.err + "30" }}>↩️ عكس</Btn>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AccountTransferPg;
