/* ═══════════════════════════════════════════════════════════════════════
   CLARK · SalesOrdersPg (V21.10.1 — #3 Slice 2)
   ───────────────────────────────────────────────────────────────────────
   Lists Sales Orders + view/confirm/cancel/delete actions.
   Sales Orders are created via "Convert to SO" on the Quotations page —
   this page is read-mostly + workflow controls. No standalone "New SO"
   yet (the source of truth is always a Quotation).
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { Btn, Card, Inp, Sel } from "../components/ui.jsx";
import { T } from "../theme.js";
import { FS, PRINT_CSS } from "../constants/index.js";
import { fmt } from "../utils/format.js";
import { ask, tell, showToast } from "../utils/popups.js";
import {
  confirmSalesOrderMutator, cancelSalesOrderMutator,
  deleteDraftSalesOrderMutator, getSalesOrderStats,
  /* V21.10.2 — Slice 3 */
  createInvoiceFromSalesOrderMutator,
} from "../utils/sales/salesOrders.js";
/* V21.10.4 — Slice 5: respect autoPostOnCreate when creating invoices from SO */
import { postInvoiceMutator } from "../utils/invoices.js";
import { autoPost } from "../utils/accounting/autoPost.js";

const STATUS_META = {
  draft:              { label: "مسودة",       color: "#6B7280", bg: "#6B728015" },
  confirmed:          { label: "مؤكد",         color: "#0EA5E9", bg: "#0EA5E915" },
  partial_delivered:  { label: "تسليم جزئي",   color: "#F59E0B", bg: "#F59E0B15" },
  delivered:          { label: "تم التسليم",   color: "#10B981", bg: "#10B98115" },
  invoiced:           { label: "مفوتر",         color: "#8B5CF6", bg: "#8B5CF615" },
  cancelled:          { label: "ملغي",          color: "#EF4444", bg: "#EF444415" },
};

export function SalesOrdersPg({ data, upConfig, isMob, canEdit, user }){
  const today = new Date().toISOString().split("T")[0];
  const monthStart = today.slice(0,7) + "-01";
  const [from, setFrom]       = useState(monthStart);
  const [to, setTo]           = useState(today);
  const [status, setStatus]   = useState("all");
  const [partyId, setPartyId] = useState("");
  const [search, setSearch]   = useState("");
  const [activeSO, setActiveSO] = useState(null);

  const userName = user?.displayName || (user?.email || "").split("@")[0] || "";
  const orders = data.salesOrders || [];
  const customers = (data.customers || []).filter(c => !c.archived);

  const filtered = useMemo(() => {
    let list = orders;
    if(from) list = list.filter(o => (o.date || "") >= from);
    if(to)   list = list.filter(o => (o.date || "") <= to);
    if(status !== "all") list = list.filter(o => o.status === status);
    if(partyId) list = list.filter(o => o.customerId === partyId);
    if(search.trim()){
      const s = search.trim().toLowerCase();
      list = list.filter(o =>
        (o.orderNo || "").toLowerCase().includes(s) ||
        (o.customerName || "").toLowerCase().includes(s) ||
        (o.fromQuotationNo || "").toLowerCase().includes(s)
      );
    }
    return list.slice().sort(
      (a,b) => (b.date || "").localeCompare(a.date || "") ||
               (b.orderNo || "").localeCompare(a.orderNo || "")
    );
  }, [orders, from, to, status, partyId, search]);

  const stats = useMemo(
    () => getSalesOrderStats(data, { from, to, partyId, status }),
    [data, from, to, partyId, status]
  );

  const handleConfirm = async (so) => {
    const msg = `تأكيد ${so.orderNo}؟\nإجمالي: ${fmt(so.total)} ج.م\n\nهيتم خصم المخزون للمنتجات العامة (إن وُجدت).`;
    if(!await ask("تأكيد أمر البيع", msg, { confirmText: "تأكيد" })) return;
    try {
      await upConfig(d => { confirmSalesOrderMutator(d, so.id, userName); });
      showToast("✓ تم تأكيد أمر البيع");
      setActiveSO(null);
    } catch(e){ tell("خطأ في التأكيد", e.message, { danger: true }); }
  };

  const handleCancel = async (so) => {
    const reason = prompt("سبب الإلغاء (اختياري):") || "";
    if(reason === null) return;
    if(!await ask("إلغاء أمر بيع", `إلغاء ${so.orderNo}؟ هيتم استعادة المخزون.`, { confirmText: "إلغاء", danger: true })) return;
    try {
      await upConfig(d => { cancelSalesOrderMutator(d, so.id, userName, reason); });
      showToast("✓ تم الإلغاء");
      setActiveSO(null);
    } catch(e){ tell("خطأ", e.message, { danger: true }); }
  };

  const handleDelete = async (so) => {
    if(!await ask("حذف مسودة", `حذف ${so.orderNo}؟`, { confirmText: "حذف", danger: true })) return;
    try {
      await upConfig(d => { deleteDraftSalesOrderMutator(d, so.id); });
      showToast("✓ تم الحذف");
      setActiveSO(null);
    } catch(e){ tell("خطأ", e.message, { danger: true }); }
  };

  /* V21.10.2 — Slice 3: Create a draft invoice from this Sales Order.
     V21.10.4 — Slice 5: respect the existing invoiceSettings.autoPostOnCreate
     flag (added in V18.51 for the delivery-based flow). When true, we
     immediately post the new invoice + trigger autoPost.salesInvoicePosted
     so the journal entry lands in the same upConfig cycle. */
  const handleCreateInvoice = async (so) => {
    const autoPost_on = !!data.invoiceSettings?.autoPostOnCreate;
    const msg = autoPost_on
      ? `إنشاء فاتورة من ${so.orderNo} + ترحيل تلقائي + قيد محاسبي؟\nالإجمالي: ${fmt(so.total)} ج.م`
      : `إنشاء فاتورة مسودة من ${so.orderNo}؟\nالإجمالي: ${fmt(so.total)} ج.م\n\nالفاتورة هتدخل في حالة "مسودة" وتتم الترحيل من صفحة الفواتير.`;
    if(!await ask("إنشاء فاتورة", msg, { confirmText: autoPost_on ? "إنشاء + ترحيل" : "إنشاء" })) return;
    try {
      let createdInv = null;
      await upConfig(d => {
        createdInv = createInvoiceFromSalesOrderMutator(d, so.id, userName);
        if(autoPost_on){
          postInvoiceMutator(d, createdInv.id, userName);
        }
      });
      /* If we auto-posted, also drop the journal entry. autoPost handles its
         own errors (writes to accountingPostFailures) so a failure here
         won't undo the invoice — admin can retry post manually. */
      if(autoPost_on && createdInv){
        const customer = (data.customers || []).find(c => c.id === createdInv.customerId);
        try {
          await autoPost.salesInvoicePosted(
            data,
            { ...createdInv, status: "posted", postedAt: new Date().toISOString(), postedBy: userName },
            customer,
            null,
            userName
          );
        } catch(e){ console.warn("[V21.10.4] autoPost.salesInvoicePosted failed (recoverable):", e?.message); }
      }
      showToast(`✓ تم إنشاء الفاتورة ${createdInv?.invoiceNo || ""}` + (autoPost_on ? " (مرحّلة تلقائياً)" : ""));
      setActiveSO(null);
    } catch(e){ tell("فشل الإنشاء", e.message, { danger: true }); }
  };

  const handlePrint = (so) => {
    const html = buildPrintHtml(so, data);
    const w = window.open("", "_blank");
    if(!w){ showToast("⚠️ الـ popup blocker قافل النافذة"); return; }
    w.document.write(html);
    w.document.close();
  };

  return <div style={{padding: isMob ? 8 : 16, maxWidth: 1400, margin: "0 auto"}}>
    {/* Header */}
    <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 12, flexWrap:"wrap", gap: 8}}>
      <div>
        <h2 style={{margin: 0, fontSize: FS+6, color: T.text}}>📑 أوامر البيع</h2>
        <div style={{fontSize: FS-2, color: T.textMut, marginTop: 2}}>
          {stats.count} أمر • القيمة {fmt(stats.totalValue)} ج.م
        </div>
      </div>
      <div style={{fontSize: FS-2, color: T.textMut}}>
        🔗 أوامر البيع تُنشأ من <strong>عروض الأسعار</strong> (زرار "حوّل لأمر بيع")
      </div>
    </div>

    {/* Status badges */}
    <div style={{display:"flex", gap: 6, marginBottom: 12, flexWrap:"wrap", fontSize: FS-2}}>
      {Object.entries(STATUS_META).map(([k, meta]) => (
        <span key={k} onClick={() => setStatus(status === k ? "all" : k)}
          style={{
            padding:"4px 10px", borderRadius: 6, cursor:"pointer",
            background: status === k ? meta.color : meta.bg,
            color: status === k ? "#fff" : meta.color,
            fontWeight: 700,
          }}>
          {meta.label}: {stats[k] || 0}
        </span>
      ))}
    </div>

    {/* Filters */}
    <Card style={{padding: 12, marginBottom: 12, display:"flex", gap: 8, flexWrap:"wrap"}}>
      <div style={{minWidth: 140}}>
        <label style={{fontSize: FS-3, color: T.textMut}}>من</label>
        <Inp type="date" value={from} onChange={setFrom}/>
      </div>
      <div style={{minWidth: 140}}>
        <label style={{fontSize: FS-3, color: T.textMut}}>إلى</label>
        <Inp type="date" value={to} onChange={setTo}/>
      </div>
      <div style={{minWidth: 160}}>
        <label style={{fontSize: FS-3, color: T.textMut}}>العميل</label>
        <Sel value={partyId} onChange={setPartyId}>
          <option value="">— الكل —</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Sel>
      </div>
      <div style={{minWidth: 140}}>
        <label style={{fontSize: FS-3, color: T.textMut}}>الحالة</label>
        <Sel value={status} onChange={setStatus}>
          <option value="all">الكل</option>
          {Object.entries(STATUS_META).map(([k,m]) => <option key={k} value={k}>{m.label}</option>)}
        </Sel>
      </div>
      <div style={{flex: 1, minWidth: 200}}>
        <label style={{fontSize: FS-3, color: T.textMut}}>بحث</label>
        <Inp value={search} onChange={setSearch} placeholder="رقم الأمر، العميل، أو رقم العرض..."/>
      </div>
    </Card>

    {/* List */}
    {filtered.length === 0 ? (
      <Card style={{padding: 40, textAlign:"center", color: T.textMut}}>
        مفيش أوامر بيع في النطاق ده — حوّل عرض سعر مقبول لأمر بيع
      </Card>
    ) : (
      <Card style={{padding: 0, overflow:"hidden"}}>
        <table style={{width:"100%", borderCollapse:"collapse", fontSize: FS-1}}>
          <thead>
            <tr style={{background: T.bg, borderBottom: "1px solid " + T.brd}}>
              <th style={{padding:"10px 8px", textAlign:"right"}}>الرقم</th>
              <th style={{padding:"10px 8px", textAlign:"right"}}>التاريخ</th>
              <th style={{padding:"10px 8px", textAlign:"right"}}>العميل</th>
              <th style={{padding:"10px 8px", textAlign:"right"}}>من عرض</th>
              <th style={{padding:"10px 8px", textAlign:"right"}}>بنود</th>
              <th style={{padding:"10px 8px", textAlign:"left"}}>الإجمالي</th>
              <th style={{padding:"10px 8px", textAlign:"center"}}>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(so => {
              const meta = STATUS_META[so.status] || STATUS_META.draft;
              return <tr key={so.id} onClick={() => setActiveSO(so)}
                style={{borderBottom: "1px solid " + T.brd, cursor:"pointer"}}>
                <td style={{padding:"8px", fontWeight: 700, color: T.accent}}>{so.orderNo}</td>
                <td style={{padding:"8px"}}>{so.date}</td>
                <td style={{padding:"8px"}}>{so.customerName}</td>
                <td style={{padding:"8px", fontSize: FS-2, color: T.textMut}}>{so.fromQuotationNo || "—"}</td>
                <td style={{padding:"8px", textAlign:"center"}}>{(so.items || []).length}</td>
                <td style={{padding:"8px", textAlign:"left", fontWeight: 700}}>{fmt(so.total)}</td>
                <td style={{padding:"8px", textAlign:"center"}}>
                  <span style={{
                    padding:"3px 10px", borderRadius: 6, fontSize: FS-3,
                    background: meta.bg, color: meta.color, fontWeight: 700,
                  }}>{meta.label}</span>
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </Card>
    )}

    {/* Detail modal */}
    {activeSO && <SalesOrderDetailModal
      so={activeSO}
      data={data}
      onClose={() => setActiveSO(null)}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      onDelete={handleDelete}
      onPrint={handlePrint}
      onCreateInvoice={handleCreateInvoice}
      canEdit={canEdit}
    />}
  </div>;
}

/* ─────────────── Detail Modal ─────────────── */
function SalesOrderDetailModal({ so, data, onClose, onConfirm, onCancel, onDelete, onPrint, onCreateInvoice, canEdit }){
  const meta = STATUS_META[so.status] || STATUS_META.draft;
  const stockMovements = (data.stockMovements || []).filter(m =>
    (so.stockMovementIds || []).includes(m.id)
  );

  return <div className="pop-overlay" onClick={onClose}
    style={{position:"fixed", inset: 0, background:"rgba(0,0,0,0.5)", zIndex: 99998,
            display:"flex", alignItems:"center", justifyContent:"center", padding: 16}}>
    <div onClick={e => e.stopPropagation()} style={{
      background: T.cardSolid, borderRadius: 16, padding: 20,
      width:"100%", maxWidth: 800, maxHeight:"92vh", overflowY:"auto",
      boxShadow:"0 20px 60px rgba(0,0,0,0.3)"
    }}>
      {/* Header */}
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom: 12}}>
        <div>
          <h3 style={{margin: 0, fontSize: FS+4, color: T.accent}}>{so.orderNo}</h3>
          <div style={{fontSize: FS-2, color: T.textMut, marginTop: 4}}>
            {so.customerName} • {so.date}
            {so.fromQuotationNo && <> • من العرض <strong style={{color: T.accent}}>{so.fromQuotationNo}</strong></>}
          </div>
        </div>
        <div style={{display:"flex", gap: 6, alignItems:"center"}}>
          <span style={{
            padding:"4px 12px", borderRadius: 6, fontSize: FS-2,
            background: meta.bg, color: meta.color, fontWeight: 700,
          }}>{meta.label}</span>
          <Btn ghost small onClick={onClose}>✕</Btn>
        </div>
      </div>

      {/* Cross-links bar */}
      {(so.fromQuotationNo || so.salesInvoiceNo) && (
        <div style={{
          padding: "8px 12px", marginBottom: 12, background: T.bg, borderRadius: 8,
          fontSize: FS-2, display: "flex", gap: 12, flexWrap: "wrap",
        }}>
          {so.fromQuotationNo && <span>🔗 العرض الأصلي: <strong>{so.fromQuotationNo}</strong></span>}
          {so.salesInvoiceNo && <span>🧾 الفاتورة: <strong>{so.salesInvoiceNo}</strong></span>}
        </div>
      )}

      {/* Items */}
      <table style={{width:"100%", borderCollapse:"collapse", fontSize: FS-1, marginBottom: 12}}>
        <thead>
          <tr style={{background: T.bg, borderBottom: "1px solid " + T.brd}}>
            <th style={{padding:"8px", textAlign:"right", width: 30}}>#</th>
            <th style={{padding:"8px", textAlign:"right"}}>البند</th>
            <th style={{padding:"8px", textAlign:"center"}}>كمية</th>
            <th style={{padding:"8px", textAlign:"left"}}>سعر</th>
            <th style={{padding:"8px", textAlign:"left"}}>إجمالي</th>
          </tr>
        </thead>
        <tbody>
          {(so.items || []).map((it, i) => (
            <tr key={i} style={{borderBottom: "1px solid " + T.brd}}>
              <td style={{padding:"8px"}}>{i+1}</td>
              <td style={{padding:"8px"}}>
                {it.modelNo && <span style={{fontWeight: 700}}>{it.modelNo} </span>}
                <span style={{color: T.textMut}}>{it.description || ""}</span>
                {it.sourceType === "generalProduct" && <span style={{fontSize: FS-3, color: T.warn, marginRight: 6}}>📦 منتج عام</span>}
                {it.sourceType === "order" && <span style={{fontSize: FS-3, color: T.accent, marginRight: 6}}>👕 موديل</span>}
                {it.sourceType === "service" && <span style={{fontSize: FS-3, color: T.textMut, marginRight: 6}}>🛠 خدمة</span>}
              </td>
              <td style={{padding:"8px", textAlign:"center"}}>{fmt(it.qty)}</td>
              <td style={{padding:"8px", textAlign:"left"}}>{fmt(it.unitPrice)}</td>
              <td style={{padding:"8px", textAlign:"left", fontWeight: 700}}>{fmt(it.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div style={{
        background: T.bg, padding: 12, borderRadius: 8, marginBottom: 12,
        display:"grid", gridTemplateColumns: "1fr auto", gap: 4, fontSize: FS-1,
      }}>
        <div>الإجمالي قبل الخصم:</div>
        <div style={{textAlign:"left"}}>{fmt(so.subtotal)} ج.م</div>
        {so.totalDiscount > 0 && <>
          <div style={{color: T.warn}}>إجمالي الخصومات:</div>
          <div style={{textAlign:"left", color: T.warn}}>{fmt(so.totalDiscount)} ج.م</div>
        </>}
        <div style={{fontWeight: 800, fontSize: FS+1, color: T.accent, paddingTop: 6, borderTop: "1px solid " + T.brd}}>
          الإجمالي:
        </div>
        <div style={{textAlign:"left", fontWeight: 800, fontSize: FS+1, color: T.accent, paddingTop: 6, borderTop: "1px solid " + T.brd}}>
          {fmt(so.total)} ج.م
        </div>
      </div>

      {/* Stock impact (if confirmed) */}
      {stockMovements.length > 0 && (
        <div style={{padding: 10, background: "#0EA5E908", borderRadius: 8, marginBottom: 12, fontSize: FS-2}}>
          <div style={{fontWeight: 700, color: T.accent, marginBottom: 6}}>📦 تأثير المخزون ({stockMovements.length} حركة):</div>
          {stockMovements.map(m => (
            <div key={m.id} style={{display:"flex", justifyContent:"space-between", padding:"2px 0"}}>
              <span>{m.itemName}</span>
              <span style={{color: m.type === "out" ? T.err : T.ok, fontWeight: 700}}>
                {m.type === "out" ? "−" : "+"}{fmt(m.qty)} {m.unit}
              </span>
            </div>
          ))}
        </div>
      )}

      {so.notes && (
        <div style={{padding: 10, background: T.bg, borderRadius: 8, marginBottom: 12, fontSize: FS-1}}>
          <div style={{color: T.textMut, fontSize: FS-3, marginBottom: 4}}>ملاحظات:</div>
          {so.notes}
        </div>
      )}

      {so.cancelReason && (
        <div style={{padding: 10, background: "#EF444410", borderRadius: 8, marginBottom: 12, fontSize: FS-1, color: T.err}}>
          <strong>سبب الإلغاء:</strong> {so.cancelReason}
        </div>
      )}

      {/* Actions */}
      <div style={{display:"flex", gap: 6, flexWrap:"wrap", justifyContent:"flex-end"}}>
        <Btn small onClick={() => onPrint(so)}>🖨 طباعة</Btn>
        {canEdit && so.status === "draft" && (
          <>
            <Btn small danger onClick={() => onDelete(so)}>🗑 حذف</Btn>
            <Btn small primary onClick={() => onConfirm(so)}>✅ تأكيد + خصم المخزون</Btn>
          </>
        )}
        {/* V21.10.2 — Slice 3: create invoice (drafted, posted manually later) */}
        {canEdit && ["confirmed","partial_delivered","delivered"].includes(so.status) && !so.salesInvoiceId && (
          <Btn small style={{background: "#10B981", color: "#fff"}} onClick={() => onCreateInvoice(so)}>🧾 إنشاء فاتورة</Btn>
        )}
        {canEdit && ["draft","confirmed","partial_delivered"].includes(so.status) && (
          <Btn small style={{background: T.err, color: "#fff"}} onClick={() => onCancel(so)}>❌ إلغاء</Btn>
        )}
      </div>
    </div>
  </div>;
}

/* ─────────────── Print helper ─────────────── */
function buildPrintHtml(so, data){
  const factoryName = data.factoryName || "CLARK";
  const logo = data.logo || "";
  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
<title>${so.orderNo}</title>
<style>${PRINT_CSS || ""}</style></head><body>
<div class="hdr">
  ${logo ? `<img src="${logo}"/>` : `<div style="font-weight:800;font-size:18px;color:#0284C7">${factoryName}</div>`}
  <div class="hdr-info">
    <div>أمر بيع</div>
    <div style="font-size:14px;color:#0284C7;font-weight:800">${so.orderNo}</div>
    <div>${so.date}</div>
  </div>
</div>
<h2>بيانات العميل</h2>
<table>
  <tr><td><strong>الاسم:</strong></td><td>${so.customerName}</td>
      ${so.fromQuotationNo ? `<td><strong>من العرض:</strong></td><td>${so.fromQuotationNo}</td>` : "<td></td><td></td>"}
  </tr>
  ${so.customerPhone ? `<tr><td><strong>تليفون:</strong></td><td>${so.customerPhone}</td><td></td><td></td></tr>` : ""}
</table>
<h2>البنود</h2>
<table>
  <thead><tr><th>#</th><th>البند</th><th>كمية</th><th>سعر الوحدة</th><th>إجمالي</th></tr></thead>
  <tbody>
    ${(so.items || []).map((it, i) => `<tr>
      <td>${i+1}</td>
      <td>${it.modelNo ? `<strong>${it.modelNo}</strong> — ` : ""}${it.description || ""}</td>
      <td>${it.qty}</td>
      <td>${Number(it.unitPrice).toLocaleString("en-EG")}</td>
      <td><strong>${Number(it.lineTotal).toLocaleString("en-EG")}</strong></td>
    </tr>`).join("")}
  </tbody>
</table>
<h2>الإجماليات</h2>
<table>
  <tr><td><strong>الإجمالي قبل الخصم:</strong></td><td>${Number(so.subtotal).toLocaleString("en-EG")} ج.م</td></tr>
  ${so.totalDiscount > 0 ? `<tr><td><strong>إجمالي الخصومات:</strong></td><td class="warn">${Number(so.totalDiscount).toLocaleString("en-EG")} ج.م</td></tr>` : ""}
  <tr><td><strong style="font-size:14px">الإجمالي:</strong></td><td class="info" style="font-size:14px">${Number(so.total).toLocaleString("en-EG")} ج.م</td></tr>
</table>
${so.notes ? `<h2>ملاحظات</h2><p style="padding:8px;background:#F8FAFC;border-radius:6px">${so.notes}</p>` : ""}
<div class="sig">
  <div class="sig-box">المسؤول<br/>${so.salesPerson || ""}</div>
  <div class="sig-box">العميل<br/>&nbsp;</div>
</div>
<div class="foot">أمر بيع رقم ${so.orderNo} — تم إنشاؤه ${so.date} • طُبع: ${new Date().toISOString().split("T")[0]}</div>
<script>window.onload = () => setTimeout(() => window.print(), 200);</script>
</body></html>`;
}

export default SalesOrdersPg;
