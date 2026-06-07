/* ═══════════════════════════════════════════════════════════════════════
   CLARK · SalesOrdersPg (V21.10.1 — Phase 12b)
   قائمة أوامر البيع + فلاتر + إحصائيات + إلغاء (مع استرجاع مخزون).
   الأوامر بتتولّد من عروض الأسعار (Quote → SO). الفوترة في Slice 3.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo, useEffect } from "react";
import { Btn, Card, Inp, SearchSel } from "../../components/ui.jsx";
import { T } from "../../theme.js";
import { FS } from "../../constants/index.js";
import { fmt } from "../../utils/format.js";
import { ask, showToast } from "../../utils/popups.js";
import { cancelSalesOrderMutator, createInvoiceFromSalesOrderMutator, createSalesOrderDirectMutator, nextSalesOrderNo } from "../../utils/sales/salesOrders.js";
import { postInvoiceMutator } from "../../utils/invoices.js";
import { autoPost } from "../../utils/accounting/autoPost.js";
import { SalesOrderDetailModal } from "../../components/sales/SalesOrderDetailModal.jsx";
import { QuotationFormModal } from "../../components/sales/QuotationFormModal.jsx";

const STATUS_META = {
  confirmed:         { label: "مؤكّد",        color: "#0EA5E9", bg: "#0EA5E915" },
  partial_delivered: { label: "تسليم جزئي",   color: "#F59E0B", bg: "#F59E0B15" },
  delivered:         { label: "مُسلّم",        color: "#10B981", bg: "#10B98115" },
  invoiced:          { label: "مفوتر",        color: "#8B5CF6", bg: "#8B5CF615" },
  cancelled:         { label: "ملغي",         color: "#EF4444", bg: "#EF444415" },
};

export function SalesOrdersPg({ data, upConfig, isMob, user, canEdit }){
  const today = new Date().toISOString().split("T")[0];
  const monthStart = today.slice(0, 7) + "-01";
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [status, setStatus] = useState("all");
  const [partyId, setPartyId] = useState("");
  const [search, setSearch] = useState("");
  const [activeSO, setActiveSO] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const orders = data.salesOrders || [];
  const customers = data.customers || [];
  const userName = user?.displayName || (user?.email || "").split("@")[0] || "";

  const filtered = useMemo(() => {
    let list = orders.slice();
    if(from) list = list.filter(o => (o.date || "") >= from);
    if(to) list = list.filter(o => (o.date || "") <= to);
    if(partyId) list = list.filter(o => o.customerId === partyId);
    if(status !== "all") list = list.filter(o => (o.status || "confirmed") === status);
    if(search.trim()){
      const s = search.trim().toLowerCase();
      list = list.filter(o =>
        (o.orderNo || "").toLowerCase().includes(s) ||
        (o.fromQuotationNo || "").toLowerCase().includes(s) ||
        (o.customerName || "").toLowerCase().includes(s) ||
        (o.customerNameAdHoc || "").toLowerCase().includes(s)
      );
    }
    return list.sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || ""));
  }, [orders, from, to, partyId, status, search]);

  const stats = useMemo(() => {
    const acc = { confirmed: 0, partial_delivered: 0, delivered: 0, invoiced: 0, cancelled: 0, total: 0 };
    orders.forEach(o => { const s = o.status || "confirmed"; if(acc[s] != null) acc[s]++; acc.total++; });
    return acc;
  }, [orders]);

  /* V21.10.8 (#1): deep-link — open a sales order by id from a cross-link. */
  useEffect(() => {
    const open = (id) => { const so = (data.salesOrders || []).find(x => x && x.id === id); if(so){ setShowForm(false); setActiveSO(so); return true; } return false; };
    try { const p = window.__clarkOpenSalesDoc; if(p && p.kind === "salesOrder" && open(p.id)) delete window.__clarkOpenSalesDoc; } catch(e) {}
    const h = (e) => { if(e?.detail?.kind === "salesOrder" && e.detail.id) open(e.detail.id); };
    window.addEventListener("clark-open-sales-doc", h);
    return () => window.removeEventListener("clark-open-sales-doc", h);
  }, [data.salesOrders]);

  const handleCreateDirect = (payload) => {
    const ps = data.purchaseSettings || {};
    const opts = { stockEnabled: !!ps.stockEnabled, blockOnInsufficientStock: ps.blockOnInsufficientStock !== false };
    let res = { ok: true };
    upConfig(d => { res = createSalesOrderDirectMutator(d, payload, userName, opts); });
    if(res && res.ok){
      setShowForm(false);
      showToast("✓ اتعمل أمر البيع " + (res.salesOrder?.orderNo || "") + (opts.stockEnabled && res.salesOrder?.stockDeducted ? " وخصم المخزون" : ""));
    } else {
      showToast("⛔ " + (res?.error || "تعذّر إنشاء الأمر"));
    }
  };

  const handleCreateInvoice = async (so) => {
    const autoPostOn = (data.invoiceSettings || {}).autoPostOnSalesInvoiceCreate === true;
    const ok = await ask("إنشاء فاتورة", "هيتعمل فاتورة مبيعات من " + (so.orderNo || "الأمر") + (autoPostOn ? " وهتترحّل تلقائياً (قيد محاسبي)." : " (مسودة — ترحّلها بعدين من «فواتير المبيعات»).") + " متأكد؟", { confirmText: "إنشاء" });
    if(!ok) return;
    let res = { ok: true };
    await upConfig(d => { res = createInvoiceFromSalesOrderMutator(d, so.id, userName); });
    if(!res || !res.ok){ showToast("⛔ " + (res?.error || "تعذّر إنشاء الفاتورة")); return; }
    const inv = res.invoice;
    setActiveSO(prev => prev && prev.id === so.id ? { ...prev, status: "invoiced", salesInvoiceId: inv.id, salesInvoiceNo: inv.invoiceNo } : prev);

    if(!autoPostOn){ showToast("✓ اتعملت الفاتورة " + inv.invoiceNo + " (مسودة)"); return; }

    /* ترحيل تلقائي — نفس مسار handlePost في SalesInvoicesPg (order=null زي فواتير الخدمات) */
    try {
      await upConfig(d => { postInvoiceMutator(d, inv.id, "sales", userName); });
      const postedInv = { ...inv, status: "posted", postedAt: new Date().toISOString(), postedBy: userName };
      const cust = (data.customers || []).find(c => c.id === inv.customerId);
      const pres = await autoPost.salesInvoicePosted(data, postedInv, cust, null, userName);
      if(pres && pres.main && pres.main.ok && pres.main.entry){
        await upConfig(d => {
          const i = (d.salesInvoices || []).findIndex(x => x.id === inv.id);
          if(i >= 0) d.salesInvoices[i].postedJournalRef = { date: pres.main.entry.date, entryId: pres.main.entry.id, refNo: pres.main.entry.refNo };
        });
      }
      showToast("✓ اتعملت الفاتورة " + inv.invoiceNo + " واترحّلت");
    } catch(e){
      showToast("✓ اتعملت الفاتورة " + inv.invoiceNo + " — لكن الترحيل التلقائي فشل، رحّلها يدوياً");
    }
  };

  const handleCancel = async (so) => {
    const ok = await ask("إلغاء أمر البيع", "إلغاء " + (so.orderNo || "الأمر") + (so.stockDeducted ? " هيرجّع المخزون المخصوم للأصناف." : ".") + " متأكد؟", { danger: true, confirmText: "إلغاء الأمر" });
    if(!ok) return;
    let res = { ok: true };
    upConfig(d => { res = cancelSalesOrderMutator(d, so.id, userName, "إلغاء يدوي"); });
    if(res && res.ok){ setActiveSO(null); showToast("✓ تم إلغاء الأمر" + (so.stockDeducted ? " واسترجاع المخزون" : "")); }
    else showToast("⛔ " + (res?.error || "تعذّر الإلغاء"));
  };

  return (
    <div style={{ padding: isMob ? 12 : 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontWeight: 800, fontSize: FS + 4, color: T.text }}>📑 أوامر البيع</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: FS - 2, color: T.textMut }}>أو بتتولّد من «عروض الأسعار»</span>
          {canEdit && <Btn primary onClick={() => setShowForm(true)} style={{ background: "#0EA5E9" }}>+ أمر بيع جديد</Btn>}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {["confirmed", "partial_delivered", "delivered", "invoiced", "cancelled"].map(k => (
          <div key={k} onClick={() => setStatus(status === k ? "all" : k)} style={{ cursor: "pointer", padding: "6px 12px", borderRadius: 8, background: status === k ? STATUS_META[k].color : STATUS_META[k].bg, color: status === k ? "#fff" : STATUS_META[k].color, fontWeight: 700, fontSize: FS - 2 }}>
            {STATUS_META[k].label}: {stats[k]}
          </div>
        ))}
      </div>

      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr 1fr" : "1fr 1fr 1fr 1.5fr", gap: 8 }}>
          <div><label style={{ fontSize: FS - 3, color: T.textMut, fontWeight: 600 }}>من</label><Inp type="date" value={from} onChange={setFrom} /></div>
          <div><label style={{ fontSize: FS - 3, color: T.textMut, fontWeight: 600 }}>إلى</label><Inp type="date" value={to} onChange={setTo} /></div>
          <div><label style={{ fontSize: FS - 3, color: T.textMut, fontWeight: 600 }}>العميل</label><SearchSel value={partyId} onChange={setPartyId} options={[{ value: "", label: "الكل" }, ...customers.map(c => ({ value: c.id, label: c.name }))]} placeholder="الكل" showAllOnFocus maxResults={12} /></div>
          <div><label style={{ fontSize: FS - 3, color: T.textMut, fontWeight: 600 }}>بحث</label><Inp value={search} onChange={setSearch} placeholder="رقم الأمر / العرض / العميل..." /></div>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 16px", color: T.textMut, background: T.bg, borderRadius: 12, border: "1px dashed " + T.brd }}>
          مفيش أوامر بيع في النطاق ده. حوّل عرض سعر مقبول لأمر بيع من شاشة «عروض الأسعار».
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(o => {
            const meta = STATUS_META[o.status] || STATUS_META.confirmed;
            return (
              <div key={o.id} onClick={() => setActiveSO(o)} style={{ cursor: "pointer", padding: "12px 14px", borderRadius: 10, background: T.cardSolid, border: "1px solid " + T.brd, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 800, color: T.text, fontSize: FS }}>{o.orderNo}</span>
                    <span style={{ fontSize: FS - 4, fontWeight: 700, color: meta.color, background: meta.bg, padding: "1px 8px", borderRadius: 20 }}>{meta.label}</span>
                    {o.fromQuotationNo && <span style={{ fontSize: FS - 4, color: T.textMut }}>← {o.fromQuotationNo}</span>}
                  </div>
                  <div style={{ fontSize: FS - 2, color: T.textSec, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {o.customerName || o.customerNameAdHoc || "—"} · {o.date}
                  </div>
                </div>
                <div style={{ fontWeight: 800, color: T.text, fontSize: FS + 1, whiteSpace: "nowrap" }}>{fmt(o.total)}</div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <QuotationFormModal
          data={data}
          mode="order"
          previewNo={nextSalesOrderNo(data)}
          userName={userName}
          onSave={handleCreateDirect}
          onClose={() => setShowForm(false)}
          isMob={isMob}
        />
      )}
      {activeSO && !showForm && (
        <SalesOrderDetailModal
          so={activeSO}
          data={data}
          canEdit={canEdit}
          onCancelOrder={() => handleCancel(activeSO)}
          onCreateInvoice={() => handleCreateInvoice(activeSO)}
          onClose={() => setActiveSO(null)}
        />
      )}
    </div>
  );
}
