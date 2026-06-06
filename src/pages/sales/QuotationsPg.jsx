/* ═══════════════════════════════════════════════════════════════════════
   CLARK · QuotationsPg (V21.10.0 — Phase 12a)
   قائمة عروض الأسعار + فلاتر + إحصائيات + إنشاء/تعديل/حالة/حذف.
   standalone — صفر مساس بالمخزون/المحاسبة. التحويل لأمر بيع في Slice 2.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { Btn, Card, Inp, Sel, SearchSel } from "../../components/ui.jsx";
import { T } from "../../theme.js";
import { FS } from "../../constants/index.js";
import { fmt } from "../../utils/format.js";
import { ask, showToast } from "../../utils/popups.js";
import {
  saveQuotationMutator, setQuotationStatusMutator, sendQuotationMutator,
  deleteQuotationMutator, displayStatus,
} from "../../utils/sales/quotations.js";
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

  const handleDelete = async (q) => {
    const ok = await ask("حذف العرض", "متأكد تحذف " + (q.quoteNo || "العرض") + " نهائياً؟", { danger: true, confirmText: "حذف" });
    if(!ok) return;
    upConfig(d => deleteQuotationMutator(d, q.id));
    setActiveQuote(null);
    showToast("✓ تم حذف العرض");
  };

  return (
    <div style={{ padding: isMob ? 12 : 20 }}>
      {/* رأس + إنشاء */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontWeight: 800, fontSize: FS + 4, color: T.text }}>📋 عروض الأسعار</div>
        {canEdit && <Btn primary onClick={openNew} style={{ background: "#0EA5E9" }}>+ عرض جديد</Btn>}
      </div>

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
          {filtered.map(q => {
            const ds = displayStatus(q, today);
            const meta = STATUS_META[ds] || STATUS_META.draft;
            return (
              <div key={q.id} onClick={() => setActiveQuote(q)} style={{ cursor: "pointer", padding: "12px 14px", borderRadius: 10, background: T.cardSolid, border: "1px solid " + T.brd, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 800, color: T.text, fontSize: FS }}>{q.quoteNo}</span>
                    <span style={{ fontSize: FS - 4, fontWeight: 700, color: meta.color, background: meta.bg, padding: "1px 8px", borderRadius: 20 }}>{meta.label}</span>
                  </div>
                  <div style={{ fontSize: FS - 2, color: T.textSec, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {q.customerName || q.customerNameAdHoc || "—"} · {q.date}{q.validUntil ? " · صالح حتى " + q.validUntil : ""}
                  </div>
                </div>
                <div style={{ fontWeight: 800, color: T.text, fontSize: FS + 1, whiteSpace: "nowrap" }}>{fmt(q.total)}</div>
              </div>
            );
          })}
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
          onDelete={() => handleDelete(activeQuote)}
          onClose={() => setActiveQuote(null)}
        />
      )}
    </div>
  );
}
