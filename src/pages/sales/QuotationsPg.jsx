/* ═══════════════════════════════════════════════════════════════════════
   CLARK · QuotationsPg (V21.10.0 — Phase 12a)
   قائمة عروض الأسعار + فلاتر + إحصائيات + إنشاء/تعديل/حالة/حذف.
   standalone — صفر مساس بالمخزون/المحاسبة. التحويل لأمر بيع في Slice 2.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo, useEffect } from "react";
import { Btn, Card, Inp, Sel, SearchSel, BlockingOverlay } from "../../components/ui.jsx";
import { T } from "../../theme.js";
import { FS } from "../../constants/index.js";
import { fmt } from "../../utils/format.js";
import { ask, showToast, tell } from "../../utils/popups.js";
import {
  saveQuotationMutator, setQuotationStatusMutator, sendQuotationMutator,
  deleteQuotationMutator, displayStatus,
} from "../../utils/sales/quotations.js";
import { convertQuotationToSalesOrderMutator } from "../../utils/sales/salesOrders.js";
import { QuotationFormModal } from "../../components/sales/QuotationFormModal.jsx";
import { QuotationDetailModal } from "../../components/sales/QuotationDetailModal.jsx";

const STATUS_META = {
  draft:     { label: "مسودة",   color: "#6B7280", bg: "#6B728015" },
  sent:      { label: "مُرسل",    color: "#F59E0B", bg: "#F59E0B15" },
  accepted:  { label: "مقبول",   color: "#10B981", bg: "#10B98115" },
  rejected:  { label: "مرفوض",   color: "#EF4444", bg: "#EF444415" },
  converted: { label: "متحوّل",   color: "#8B5CF6", bg: "#8B5CF615" },
  expired:   { label: "منتهي",    color: "#94A3B8", bg: "#94A3B815" },
};

export function QuotationsPg({ data, upConfig, isMob, user, canEdit }){
  const today = new Date().toISOString().split("T")[0];
  const monthStart = today.slice(0, 7) + "-01";
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [status, setStatus] = useState("all");
  const [partyId, setPartyId] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editQuote, setEditQuote] = useState(null);
  const [activeQuote, setActiveQuote] = useState(null);

  const quotations = data.salesQuotations || [];
  const customers = data.customers || [];
  const userName = user?.displayName || (user?.email || "").split("@")[0] || "";
  const defaultValidityDays = (data.invoiceSettings && Number(data.invoiceSettings.defaultQuoteValidityDays)) || 14;

  const filtered = useMemo(() => {
    let list = quotations.slice();
    if(from) list = list.filter(q => (q.date || "") >= from);
    if(to) list = list.filter(q => (q.date || "") <= to);
    if(partyId) list = list.filter(q => q.customerId === partyId);
    if(status !== "all") list = list.filter(q => displayStatus(q, today) === status);
    if(search.trim()){
      const s = search.trim().toLowerCase();
      list = list.filter(q =>
        (q.quoteNo || "").toLowerCase().includes(s) ||
        (q.customerName || "").toLowerCase().includes(s) ||
        (q.customerNameAdHoc || "").toLowerCase().includes(s)
      );
    }
    return list.sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || ""));
  }, [quotations, from, to, partyId, status, search, today]);

  const stats = useMemo(() => {
    const acc = { draft: 0, sent: 0, accepted: 0, rejected: 0, converted: 0, expired: 0, total: 0 };
    quotations.forEach(q => { const ds = displayStatus(q, today); if(acc[ds] != null) acc[ds]++; acc.total++; });
    return acc;
  }, [quotations, today]);

  /* V21.10.8 (#3): عروض قربت تنتهي صلاحيتها (خلال 3 أيام، لسه draft/sent) */
  const expiringSoon = useMemo(() => {
    const limit = new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0];
    return quotations.filter(q => {
      const ds = displayStatus(q, today);
      return (ds === "draft" || ds === "sent") && q.validUntil && q.validUntil >= today && q.validUntil <= limit;
    });
  }, [quotations, today]);

  /* V21.10.8 (#1): deep-link — open a quotation by id when navigated to from
     another document's cross-link. */
  useEffect(() => {
    const open = (id) => { const q = (data.salesQuotations || []).find(x => x && x.id === id); if(q){ setShowForm(false); setActiveQuote(q); return true; } return false; };
    try { const p = window.__clarkOpenSalesDoc; if(p && p.kind === "quotation" && open(p.id)) delete window.__clarkOpenSalesDoc; } catch(e) {}
    const h = (e) => { if(e?.detail?.kind === "quotation" && e.detail.id) open(e.detail.id); };
    window.addEventListener("clark-open-sales-doc", h);
    return () => window.removeEventListener("clark-open-sales-doc", h);
  }, [data.salesQuotations]);

  /* ── actions ── */
  const openNew = () => { setEditQuote(null); setShowForm(true); };
  const openEdit = (q) => { setActiveQuote(null); setEditQuote(q); setShowForm(true); };

  const handleSave = (payload) => {
    let savedNo = "";
    upConfig(d => { const saved = saveQuotationMutator(d, payload, userName); savedNo = saved?.quoteNo || ""; });
    setShowForm(false); setEditQuote(null);
    showToast(payload.id ? "✓ تم تعديل العرض" : "✓ تم إنشاء العرض " + savedNo);
  };

  const handleStatus = (id, st) => {
    upConfig(d => setQuotationStatusMutator(d, id, st, userName));
    setActiveQuote(prev => prev && prev.id === id ? { ...prev, status: st } : prev);
    showToast("✓ تم تحديث الحالة");
  };

  const handleSend = (id, channel) => {
    upConfig(d => sendQuotationMutator(d, id, channel, userName));
    setActiveQuote(prev => prev && prev.id === id ? { ...prev, status: prev.status === "draft" ? "sent" : prev.status, sentChannel: channel } : prev);
  };

  const handleConvert = async (q) => {
    const ps = data.purchaseSettings || {};
    const stockEnabled = !!ps.stockEnabled;
    const ok = await ask(
      "تحويل لأمر بيع",
      "هيتعمل أمر بيع من " + (q.quoteNo || "العرض") + "." + (stockEnabled ? " الأصناف (من المخزن) هيتخصم رصيدها فعلياً." : "") + " متأكد؟",
      { confirmText: "حوّل" }
    );
    if(!ok) return;
    let res = { ok: true };
    upConfig(d => { res = convertQuotationToSalesOrderMutator(d, q.id, userName, { stockEnabled, blockOnInsufficientStock: ps.blockOnInsufficientStock !== false }); });
    if(res && res.ok){
      setActiveQuote(null);
      showToast("✓ اتعمل أمر البيع " + (res.salesOrder?.orderNo || "") + (stockEnabled && res.salesOrder?.stockDeducted ? " وخصم المخزون" : ""));
    } else {
      showToast("⛔ " + (res?.error || "تعذّر التحويل"));
    }
  };

  const handleDelete = async (q) => {
    const ok = await ask("حذف العرض", "متأكد تحذف " + (q.quoteNo || "العرض") + " نهائياً؟", { danger: true, confirmText: "حذف" });
    if(!ok) return;
    let res; upConfig(d => { res = deleteQuotationMutator(d, q.id); });
    if(res && res.ok){ setActiveQuote(null); showToast("✓ تم حذف العرض"); }
    else showToast("⛔ " + ((res && res.error) || "تعذّر الحذف"));
  };

  const [showN, setShowN] = useState(50);/* V21.21.3: pagination — 50 + «عرض المزيد» */
  /* V21.21.5: تحديد متعدد + حذف مجمّع */
  const [sel, setSel] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const visibleIds = filtered.slice(0, showN).map(q => q.id);
  const allVisSelected = visibleIds.length > 0 && visibleIds.every(id => sel.has(id));
  const toggleSel = (id) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAllVis = () => setSel(s => { const n = new Set(s); if(allVisSelected) visibleIds.forEach(id => n.delete(id)); else visibleIds.forEach(id => n.add(id)); return n; });
  const bulkDelete = async () => {
    const ids = [...sel]; if(ids.length === 0) return;
    if(!await ask("حذف مجمّع", "متأكد تحذف " + ids.length + " عرض سعر نهائياً؟ مش هينفع تتراجع.", { danger: true, confirmText: "حذف الكل" })) return;
    setBusy(true); let deleted = 0; const blocked = [];
    try {
      await upConfig(d => {
        for(const id of ids){
          const q = (d.salesQuotations || []).find(x => x && x.id === id);
          const res = deleteQuotationMutator(d, id);
          if(res && res.ok) deleted++; else blocked.push((q?.quoteNo || id) + ": " + ((res && res.error) || "تعذّر"));
        }
      });
    } finally { setBusy(false); }
    setSel(new Set());
    if(blocked.length === 0) showToast("✓ اتحذف " + deleted + " عرض");
    else await tell("نتيجة الحذف المجمّع", "✓ اتحذف: " + deleted + "\n⛔ اتمنع: " + blocked.length + " (بسبب التسلسل المستندي)\n\n" + blocked.slice(0, 12).join("\n") + (blocked.length > 12 ? "\n…" : ""), { type: "warning" });
  };

  return (
    <div style={{ padding: isMob ? 12 : 20 }}>
      {/* رأس + إنشاء */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontWeight: 800, fontSize: FS + 4, color: T.text }}>📋 عروض الأسعار</div>
        {canEdit && <Btn primary onClick={openNew} style={{ background: "#0EA5E9" }}>+ عرض جديد</Btn>}
      </div>

      {/* تنبيه: عروض قربت تنتهي */}
      {expiringSoon.length > 0 && <div onClick={() => setStatus("sent")} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", marginBottom: 12, borderRadius: 10, background: "#F59E0B12", border: "1px solid #F59E0B35", cursor: "pointer" }}>
        <span style={{ fontSize: 18 }}>⏰</span>
        <div style={{ flex: 1, fontSize: FS - 1, color: T.text, fontWeight: 600 }}><b style={{ color: "#D97706" }}>{expiringSoon.length}</b> عرض سعر قربت تنتهي صلاحيتهم (خلال 3 أيام)</div>
      </div>}

      {/* إحصائيات */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {["draft", "sent", "accepted", "rejected", "converted", "expired"].map(k => (
          <div key={k} onClick={() => setStatus(status === k ? "all" : k)} style={{ cursor: "pointer", padding: "6px 12px", borderRadius: 8, background: status === k ? STATUS_META[k].color : STATUS_META[k].bg, color: status === k ? "#fff" : STATUS_META[k].color, fontWeight: 700, fontSize: FS - 2 }}>
            {STATUS_META[k].label}: {stats[k]}
          </div>
        ))}
      </div>

      {/* فلاتر */}
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr 1fr" : "1fr 1fr 1fr 1.5fr", gap: 8 }}>
          <div><label style={{ fontSize: FS - 3, color: T.textMut, fontWeight: 600 }}>من</label><Inp type="date" value={from} onChange={setFrom} /></div>
          <div><label style={{ fontSize: FS - 3, color: T.textMut, fontWeight: 600 }}>إلى</label><Inp type="date" value={to} onChange={setTo} /></div>
          <div><label style={{ fontSize: FS - 3, color: T.textMut, fontWeight: 600 }}>العميل</label><SearchSel value={partyId} onChange={setPartyId} options={[{ value: "", label: "الكل" }, ...customers.map(c => ({ value: c.id, label: c.name }))]} placeholder="الكل" showAllOnFocus maxResults={12} /></div>
          <div><label style={{ fontSize: FS - 3, color: T.textMut, fontWeight: 600 }}>بحث</label><Inp value={search} onChange={setSearch} placeholder="رقم العرض / اسم العميل..." /></div>
        </div>
      </Card>

      {/* القائمة */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 16px", color: T.textMut, background: T.bg, borderRadius: 12, border: "1px dashed " + T.brd }}>
          مفيش عروض في النطاق ده.{canEdit ? " اضغط «+ عرض جديد» للبدء." : ""}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {canEdit && <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 4px", flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: FS - 2, color: T.textSec, fontWeight: 600 }}>
              <input type="checkbox" checked={allVisSelected} onChange={toggleAllVis} style={{ width: 16, height: 16, cursor: "pointer" }} />تحديد الكل المعروض
            </label>
            {sel.size > 0 && <>
              <button onClick={bulkDelete} style={{ background: "#EF4444", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontWeight: 700, fontFamily: "inherit", fontSize: FS - 1 }}>🗑 حذف المحدد ({sel.size})</button>
              <button onClick={() => setSel(new Set())} style={{ background: T.bg, color: T.textSec, border: "1px solid " + T.brd, borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontFamily: "inherit", fontSize: FS - 1 }}>إلغاء التحديد</button>
            </>}
          </div>}
          {filtered.slice(0, showN).map(q => {
            const ds = displayStatus(q, today);
            const meta = STATUS_META[ds] || STATUS_META.draft;
            return (
              <div key={q.id} onClick={() => setActiveQuote(q)} style={{ cursor: "pointer", padding: "12px 14px", borderRadius: 10, background: sel.has(q.id) ? T.accent + "0D" : T.cardSolid, border: "1px solid " + (sel.has(q.id) ? T.accent + "66" : T.brd), display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                {canEdit && <input type="checkbox" checked={sel.has(q.id)} onClick={e => e.stopPropagation()} onChange={() => toggleSel(q.id)} style={{ width: 16, height: 16, cursor: "pointer", flexShrink: 0 }} />}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 800, color: T.text, fontSize: FS }}>{q.quoteNo}</span>
                    <span style={{ fontSize: FS - 4, fontWeight: 700, color: meta.color, background: meta.bg, padding: "1px 8px", borderRadius: 20 }}>{meta.label}</span>
                  </div>
                  <div style={{ fontSize: FS - 2, color: T.textSec, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {q.customerName || q.customerNameAdHoc || "—"} · {q.date}{q.validUntil ? " · صالح حتى " + q.validUntil : ""}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ fontWeight: 800, color: T.text, fontSize: FS + 1, whiteSpace: "nowrap" }}>{fmt(q.total)}</div>
                  {canEdit && <button onClick={e => { e.stopPropagation(); handleDelete(q); }} title="حذف العرض" style={{ background: "#EF444412", color: "#EF4444", border: "1px solid #EF444433", borderRadius: 8, padding: "4px 8px", cursor: "pointer", fontSize: FS }}>🗑</button>}
                </div>
              </div>
            );
          })}
          {filtered.length > showN && <button onClick={() => setShowN(n => n + 50)} style={{ marginTop: 4, padding: "10px", borderRadius: 10, border: "1px dashed " + T.brd, background: T.bg, color: T.accent, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>عرض المزيد ({filtered.length - showN} متبقي)</button>}
        </div>
      )}

      {/* مودالات */}
      {showForm && (
        <QuotationFormModal
          data={data}
          editQuote={editQuote}
          defaultValidityDays={defaultValidityDays}
          userName={userName}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditQuote(null); }}
          isMob={isMob}
        />
      )}
      {activeQuote && !showForm && (
        <QuotationDetailModal
          data={data}
          config={data}
          quote={activeQuote}
          canEdit={canEdit}
          onEdit={openEdit}
          onStatus={(st) => handleStatus(activeQuote.id, st)}
          onSend={(ch) => handleSend(activeQuote.id, ch)}
          onConvert={() => handleConvert(activeQuote)}
          onDelete={() => handleDelete(activeQuote)}
          onClose={() => setActiveQuote(null)}
        />
      )}
      <BlockingOverlay show={busy} text="جاري حذف العروض..." sub="من فضلك انتظر — لا تغلق الصفحة" />
    </div>
  );
}
