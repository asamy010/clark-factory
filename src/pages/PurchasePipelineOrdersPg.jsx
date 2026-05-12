/* ═══════════════════════════════════════════════════════════════════════
   CLARK · PurchasePipelineOrdersPg (V21.10.6 — #3 Slices 7+8)
   ───────────────────────────────────────────────────────────────────────
   Pipeline Purchase Orders (PPO-YYYY-NNNN) — distinct from V19.50 receipt-
   based purchaseOrders. Created from RFQ conversion or direct. Receive
   stock + generate PINV from this page.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { Btn, Card, Inp, Sel } from "../components/ui.jsx";
import { T } from "../theme.js";
import { FS, PRINT_CSS } from "../constants/index.js";
import { fmt } from "../utils/format.js";
import { ask, tell, showToast } from "../utils/popups.js";
import {
  receivePipelinePOMutator, cancelPipelinePOMutator,
  deleteDraftPipelinePOMutator, getPipelinePOStats,
  createPurchaseInvoiceFromPipelinePOMutator,
} from "../utils/purchase/purchasePipelineOrders.js";
import { postInvoiceMutator } from "../utils/invoices.js";
import { autoPost } from "../utils/accounting/autoPost.js";

const STATUS_META = {
  draft:              { label: "مسودة",         color: "#6B7280", bg: "#6B728015" },
  confirmed:          { label: "مؤكد",           color: "#0EA5E9", bg: "#0EA5E915" },
  partial_received:   { label: "استلام جزئي",   color: "#F59E0B", bg: "#F59E0B15" },
  fully_received:     { label: "تم الاستلام",    color: "#10B981", bg: "#10B98115" },
  invoiced:           { label: "مفوتر",           color: "#8B5CF6", bg: "#8B5CF615" },
  cancelled:          { label: "ملغي",            color: "#EF4444", bg: "#EF444415" },
};

export function PurchasePipelineOrdersPg({ data, upConfig, isMob, canEdit, user }){
  const today = new Date().toISOString().split("T")[0];
  const monthStart = today.slice(0,7) + "-01";
  const [from, setFrom]       = useState(monthStart);
  const [to, setTo]           = useState(today);
  const [status, setStatus]   = useState("all");
  const [partyId, setPartyId] = useState("");
  const [search, setSearch]   = useState("");
  const [activePPO, setActivePPO] = useState(null);

  const userName = user?.displayName || (user?.email || "").split("@")[0] || "";
  const orders = data.purchasePipelineOrders || [];
  const suppliers = (data.suppliers || []).filter(s => !s.archived);

  const filtered = useMemo(() => {
    let list = orders;
    if(from) list = list.filter(o => (o.date || "") >= from);
    if(to)   list = list.filter(o => (o.date || "") <= to);
    if(status !== "all") list = list.filter(o => o.status === status);
    if(partyId) list = list.filter(o => o.supplierId === partyId);
    if(search.trim()){
      const s = search.trim().toLowerCase();
      list = list.filter(o =>
        (o.orderNo || "").toLowerCase().includes(s) ||
        (o.supplierName || "").toLowerCase().includes(s) ||
        (o.fromRFQNo || "").toLowerCase().includes(s)
      );
    }
    return list.slice().sort(
      (a,b) => (b.date || "").localeCompare(a.date || "") ||
               (b.orderNo || "").localeCompare(a.orderNo || "")
    );
  }, [orders, from, to, status, partyId, search]);

  const stats = useMemo(() => getPipelinePOStats(data, { from, to, partyId, status }), [data, from, to, partyId, status]);

  const handleReceive = async (ppo) => {
    if(!await ask("استلام أمر شراء", `استلام ${ppo.orderNo}؟\nالإجمالي: ${fmt(ppo.total)} ج.م\n\nهيتم إضافة الكميات للمخزون.`, { confirmText: "استلام + إضافة للمخزون" })) return;
    try {
      await upConfig(d => { receivePipelinePOMutator(d, ppo.id, userName); });
      showToast("✓ تم استلام أمر الشراء وإضافة المخزون");
      setActivePPO(null);
    } catch(e){ tell("خطأ في الاستلام", e.message, { danger: true }); }
  };

  const handleCancel = async (ppo) => {
    const reason = prompt("سبب الإلغاء (اختياري):") || "";
    if(reason === null) return;
    if(!await ask("إلغاء أمر شراء", `إلغاء ${ppo.orderNo}؟ هيتم عكس المخزون.`, { confirmText: "إلغاء", danger: true })) return;
    try {
      await upConfig(d => { cancelPipelinePOMutator(d, ppo.id, userName, reason); });
      showToast("✓ تم الإلغاء");
      setActivePPO(null);
    } catch(e){ tell("خطأ", e.message, { danger: true }); }
  };

  const handleDelete = async (ppo) => {
    if(!await ask("حذف مسودة", `حذف ${ppo.orderNo}؟`, { confirmText: "حذف", danger: true })) return;
    try {
      await upConfig(d => { deleteDraftPipelinePOMutator(d, ppo.id); });
      showToast("✓ تم الحذف");
      setActivePPO(null);
    } catch(e){ tell("خطأ", e.message, { danger: true }); }
  };

  const handleCreateInvoice = async (ppo) => {
    const autoPost_on = !!data.invoiceSettings?.autoPostOnCreate;
    const msg = autoPost_on
      ? `إنشاء فاتورة شراء من ${ppo.orderNo} + ترحيل + قيد محاسبي؟\nالإجمالي: ${fmt(ppo.total)} ج.م`
      : `إنشاء فاتورة شراء مسودة من ${ppo.orderNo}؟\nالإجمالي: ${fmt(ppo.total)} ج.م`;
    if(!await ask("إنشاء فاتورة شراء", msg, { confirmText: autoPost_on ? "إنشاء + ترحيل" : "إنشاء" })) return;
    try {
      let createdInv = null;
      await upConfig(d => {
        createdInv = createPurchaseInvoiceFromPipelinePOMutator(d, ppo.id, userName);
        if(autoPost_on){
          postInvoiceMutator(d, createdInv.id, userName);
        }
      });
      /* V21.10.6 — Slice 10: autoPost for purchase if flag set */
      if(autoPost_on && createdInv){
        const supplier = (data.suppliers || []).find(s => s.id === createdInv.supplierId);
        try {
          await autoPost.purchaseInvoicePosted(
            data,
            { ...createdInv, status: "posted", postedAt: new Date().toISOString(), postedBy: userName },
            supplier,
            userName
          );
        } catch(e){ console.warn("[V21.10.6] autoPost.purchaseInvoicePosted failed (recoverable):", e?.message); }
      }
      showToast(`✓ تم إنشاء الفاتورة ${createdInv?.invoiceNo || ""}` + (autoPost_on ? " (مرحّلة تلقائياً)" : ""));
      setActivePPO(null);
    } catch(e){ tell("فشل الإنشاء", e.message, { danger: true }); }
  };

  const handlePrint = (ppo) => {
    const html = buildPrintHtml(ppo, data);
    const w = window.open("", "_blank");
    if(!w){ showToast("⚠️ الـ popup blocker قافل النافذة"); return; }
    w.document.write(html); w.document.close();
  };

  return <div style={{padding: isMob ? 8 : 16, maxWidth: 1400, margin: "0 auto"}}>
    <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 12, flexWrap:"wrap", gap: 8}}>
      <div>
        <h2 style={{margin: 0, fontSize: FS+6, color: T.text}}>📑 أوامر الشراء (Pipeline)</h2>
        <div style={{fontSize: FS-2, color: T.textMut, marginTop: 2}}>
          {stats.count} أمر • القيمة {fmt(stats.totalValue)} ج.م
        </div>
      </div>
      <div style={{fontSize: FS-2, color: T.textMut}}>
        🔗 تُنشأ من <strong>عروض الموردين</strong> (زرار "حوّل لأمر شراء")
      </div>
    </div>

    <div style={{display:"flex", gap: 6, marginBottom: 12, flexWrap:"wrap", fontSize: FS-2}}>
      {Object.entries(STATUS_META).map(([k, meta]) => (
        <span key={k} onClick={() => setStatus(status === k ? "all" : k)}
          style={{padding:"4px 10px", borderRadius: 6, cursor:"pointer",
            background: status === k ? meta.color : meta.bg,
            color: status === k ? "#fff" : meta.color, fontWeight: 700}}>
          {meta.label}: {stats[k] || 0}
        </span>
      ))}
    </div>

    <Card style={{padding: 12, marginBottom: 12, display:"flex", gap: 8, flexWrap:"wrap"}}>
      <div style={{minWidth: 140}}><label style={{fontSize: FS-3, color: T.textMut}}>من</label><Inp type="date" value={from} onChange={setFrom}/></div>
      <div style={{minWidth: 140}}><label style={{fontSize: FS-3, color: T.textMut}}>إلى</label><Inp type="date" value={to} onChange={setTo}/></div>
      <div style={{minWidth: 160}}>
        <label style={{fontSize: FS-3, color: T.textMut}}>المورد</label>
        <Sel value={partyId} onChange={setPartyId}>
          <option value="">— الكل —</option>
          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Sel>
      </div>
      <div style={{minWidth: 140}}>
        <label style={{fontSize: FS-3, color: T.textMut}}>الحالة</label>
        <Sel value={status} onChange={setStatus}>
          <option value="all">الكل</option>
          {Object.entries(STATUS_META).map(([k,m]) => <option key={k} value={k}>{m.label}</option>)}
        </Sel>
      </div>
      <div style={{flex: 1, minWidth: 200}}><label style={{fontSize: FS-3, color: T.textMut}}>بحث</label><Inp value={search} onChange={setSearch} placeholder="رقم الأمر، المورد، أو رقم الطلب..."/></div>
    </Card>

    {filtered.length === 0 ? (
      <Card style={{padding: 40, textAlign:"center", color: T.textMut}}>
        مفيش أوامر شراء في النطاق ده — حوّل عرض مورد موافق عليه
      </Card>
    ) : (
      <Card style={{padding: 0, overflow:"hidden"}}>
        <table style={{width:"100%", borderCollapse:"collapse", fontSize: FS-1}}>
          <thead>
            <tr style={{background: T.bg, borderBottom: "1px solid " + T.brd}}>
              <th style={{padding:"10px 8px", textAlign:"right"}}>الرقم</th>
              <th style={{padding:"10px 8px", textAlign:"right"}}>التاريخ</th>
              <th style={{padding:"10px 8px", textAlign:"right"}}>المورد</th>
              <th style={{padding:"10px 8px", textAlign:"right"}}>من طلب</th>
              <th style={{padding:"10px 8px", textAlign:"right"}}>بنود</th>
              <th style={{padding:"10px 8px", textAlign:"left"}}>الإجمالي</th>
              <th style={{padding:"10px 8px", textAlign:"center"}}>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(ppo => {
              const meta = STATUS_META[ppo.status] || STATUS_META.draft;
              return <tr key={ppo.id} onClick={() => setActivePPO(ppo)} style={{borderBottom: "1px solid " + T.brd, cursor:"pointer"}}>
                <td style={{padding:"8px", fontWeight: 700, color: T.accent}}>{ppo.orderNo}</td>
                <td style={{padding:"8px"}}>{ppo.date}</td>
                <td style={{padding:"8px"}}>{ppo.supplierName}</td>
                <td style={{padding:"8px", fontSize: FS-2, color: T.textMut}}>{ppo.fromRFQNo || "—"}</td>
                <td style={{padding:"8px", textAlign:"center"}}>{(ppo.items || []).length}</td>
                <td style={{padding:"8px", textAlign:"left", fontWeight: 700}}>{fmt(ppo.total)}</td>
                <td style={{padding:"8px", textAlign:"center"}}>
                  <span style={{padding:"3px 10px", borderRadius: 6, fontSize: FS-3,
                    background: meta.bg, color: meta.color, fontWeight: 700}}>{meta.label}</span>
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </Card>
    )}

    {activePPO && <PPODetailModal
      ppo={activePPO} data={data}
      onClose={() => setActivePPO(null)}
      onReceive={handleReceive} onCancel={handleCancel} onDelete={handleDelete}
      onCreateInvoice={handleCreateInvoice} onPrint={handlePrint}
      canEdit={canEdit}
    />}
  </div>;
}

function PPODetailModal({ ppo, data, onClose, onReceive, onCancel, onDelete, onCreateInvoice, onPrint, canEdit }){
  const meta = STATUS_META[ppo.status] || STATUS_META.draft;
  const stockMovements = (data.stockMovements || []).filter(m =>
    (ppo.stockMovementIds || []).includes(m.id)
  );

  return <div className="pop-overlay" onClick={onClose}
    style={{position:"fixed", inset: 0, background:"rgba(0,0,0,0.5)", zIndex: 99998,
            display:"flex", alignItems:"center", justifyContent:"center", padding: 16}}>
    <div onClick={e => e.stopPropagation()} style={{
      background: T.cardSolid, borderRadius: 16, padding: 20,
      width:"100%", maxWidth: 800, maxHeight:"92vh", overflowY:"auto",
      boxShadow:"0 20px 60px rgba(0,0,0,0.3)"
    }}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom: 12}}>
        <div>
          <h3 style={{margin: 0, fontSize: FS+4, color: T.accent}}>{ppo.orderNo}</h3>
          <div style={{fontSize: FS-2, color: T.textMut, marginTop: 4}}>
            {ppo.supplierName} • {ppo.date}
            {ppo.fromRFQNo && <> • من الطلب <strong style={{color: T.accent}}>{ppo.fromRFQNo}</strong></>}
          </div>
        </div>
        <div style={{display:"flex", gap: 6, alignItems:"center"}}>
          <span style={{padding:"4px 12px", borderRadius: 6, fontSize: FS-2,
            background: meta.bg, color: meta.color, fontWeight: 700}}>{meta.label}</span>
          <Btn ghost small onClick={onClose}>✕</Btn>
        </div>
      </div>

      {(ppo.fromRFQNo || ppo.purchaseInvoiceNo) && (
        <div style={{padding: "8px 12px", marginBottom: 12, background: T.bg, borderRadius: 8,
          fontSize: FS-2, display: "flex", gap: 12, flexWrap: "wrap"}}>
          {ppo.fromRFQNo && <span>🔗 الطلب الأصلي: <strong>{ppo.fromRFQNo}</strong></span>}
          {ppo.purchaseInvoiceNo && <span>🧾 الفاتورة: <strong>{ppo.purchaseInvoiceNo}</strong></span>}
        </div>
      )}

      <table style={{width:"100%", borderCollapse:"collapse", fontSize: FS-1, marginBottom: 12}}>
        <thead>
          <tr style={{background: T.bg, borderBottom: "1px solid " + T.brd}}>
            <th style={{padding:"8px", textAlign:"right", width: 30}}>#</th>
            <th style={{padding:"8px", textAlign:"right"}}>البند</th>
            <th style={{padding:"8px", textAlign:"center"}}>كمية</th>
            <th style={{padding:"8px", textAlign:"center"}}>مستلم</th>
            <th style={{padding:"8px", textAlign:"left"}}>سعر</th>
            <th style={{padding:"8px", textAlign:"left"}}>إجمالي</th>
          </tr>
        </thead>
        <tbody>
          {(ppo.items || []).map((it, i) => (
            <tr key={i} style={{borderBottom: "1px solid " + T.brd}}>
              <td style={{padding:"8px"}}>{i+1}</td>
              <td style={{padding:"8px"}}>
                {it.modelNo && <span style={{fontWeight: 700}}>{it.modelNo} </span>}
                <span style={{color: T.textMut}}>{it.description || ""}</span>
                {it.sourceType === "generalProduct" && <span style={{fontSize: FS-3, color: T.warn, marginRight: 6}}>📦 منتج عام</span>}
                {it.sourceType === "fabric" && <span style={{fontSize: FS-3, color: T.accent, marginRight: 6}}>🧵 قماش</span>}
                {it.sourceType === "accessory" && <span style={{fontSize: FS-3, color: "#8B5CF6", marginRight: 6}}>🔧 إكسسوار</span>}
                {it.sourceType === "service" && <span style={{fontSize: FS-3, color: T.textMut, marginRight: 6}}>🛠 خدمة</span>}
              </td>
              <td style={{padding:"8px", textAlign:"center"}}>{fmt(it.qty)}</td>
              <td style={{padding:"8px", textAlign:"center", color: Number(it.receivedQty) > 0 ? T.ok : T.textMut, fontWeight: 700}}>
                {fmt(Number(it.receivedQty) || 0)}
              </td>
              <td style={{padding:"8px", textAlign:"left"}}>{fmt(it.unitPrice)}</td>
              <td style={{padding:"8px", textAlign:"left", fontWeight: 700}}>{fmt(it.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{background: T.bg, padding: 12, borderRadius: 8, marginBottom: 12,
        display:"grid", gridTemplateColumns: "1fr auto", gap: 4, fontSize: FS-1}}>
        <div>الإجمالي قبل الخصم:</div>
        <div style={{textAlign:"left"}}>{fmt(ppo.subtotal)} ج.م</div>
        {ppo.totalDiscount > 0 && <>
          <div style={{color: T.warn}}>إجمالي الخصومات:</div>
          <div style={{textAlign:"left", color: T.warn}}>{fmt(ppo.totalDiscount)} ج.م</div>
        </>}
        <div style={{fontWeight: 800, fontSize: FS+1, color: T.accent, paddingTop: 6, borderTop: "1px solid " + T.brd}}>الإجمالي:</div>
        <div style={{textAlign:"left", fontWeight: 800, fontSize: FS+1, color: T.accent, paddingTop: 6, borderTop: "1px solid " + T.brd}}>{fmt(ppo.total)} ج.م</div>
      </div>

      {stockMovements.length > 0 && (
        <div style={{padding: 10, background: "#10B98108", borderRadius: 8, marginBottom: 12, fontSize: FS-2}}>
          <div style={{fontWeight: 700, color: T.ok, marginBottom: 6}}>📦 حركات المخزون ({stockMovements.length}):</div>
          {stockMovements.map(m => (
            <div key={m.id} style={{display:"flex", justifyContent:"space-between", padding:"2px 0"}}>
              <span>{m.itemName}</span>
              <span style={{color: m.type === "in" ? T.ok : T.err, fontWeight: 700}}>
                {m.type === "in" ? "+" : "−"}{fmt(m.qty)} {m.unit}
              </span>
            </div>
          ))}
        </div>
      )}

      {ppo.notes && (
        <div style={{padding: 10, background: T.bg, borderRadius: 8, marginBottom: 12, fontSize: FS-1}}>
          <div style={{color: T.textMut, fontSize: FS-3, marginBottom: 4}}>ملاحظات:</div>
          {ppo.notes}
        </div>
      )}

      {ppo.cancelReason && (
        <div style={{padding: 10, background: "#EF444410", borderRadius: 8, marginBottom: 12, fontSize: FS-1, color: T.err}}>
          <strong>سبب الإلغاء:</strong> {ppo.cancelReason}
        </div>
      )}

      <div style={{display:"flex", gap: 6, flexWrap:"wrap", justifyContent:"flex-end"}}>
        <Btn small onClick={() => onPrint(ppo)}>🖨 طباعة</Btn>
        {canEdit && ppo.status === "draft" && (
          <>
            <Btn small danger onClick={() => onDelete(ppo)}>🗑 حذف</Btn>
            <Btn small primary onClick={() => onReceive(ppo)}>📥 استلام + إضافة للمخزون</Btn>
          </>
        )}
        {canEdit && ["fully_received","partial_received"].includes(ppo.status) && !ppo.purchaseInvoiceId && (
          <Btn small style={{background: "#10B981", color: "#fff"}} onClick={() => onCreateInvoice(ppo)}>🧾 إنشاء فاتورة شراء</Btn>
        )}
        {canEdit && ["draft","confirmed","partial_received","fully_received"].includes(ppo.status) && (
          <Btn small style={{background: T.err, color: "#fff"}} onClick={() => onCancel(ppo)}>❌ إلغاء</Btn>
        )}
      </div>
    </div>
  </div>;
}

function buildPrintHtml(ppo, data){
  const factoryName = data.factoryName || "CLARK";
  const logo = data.logo || "";
  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
<title>${ppo.orderNo}</title>
<style>${PRINT_CSS || ""}</style></head><body>
<div class="hdr">
  ${logo ? `<img src="${logo}"/>` : `<div style="font-weight:800;font-size:18px;color:#0284C7">${factoryName}</div>`}
  <div class="hdr-info">
    <div>أمر شراء</div>
    <div style="font-size:14px;color:#0284C7;font-weight:800">${ppo.orderNo}</div>
    <div>${ppo.date}</div>
  </div>
</div>
<h2>المورد</h2>
<table>
  <tr><td><strong>الاسم:</strong></td><td>${ppo.supplierName}</td>
      ${ppo.fromRFQNo ? `<td><strong>من الطلب:</strong></td><td>${ppo.fromRFQNo}</td>` : "<td></td><td></td>"}
  </tr>
</table>
<h2>البنود</h2>
<table>
  <thead><tr><th>#</th><th>البند</th><th>كمية</th><th>سعر الوحدة</th><th>إجمالي</th></tr></thead>
  <tbody>
    ${(ppo.items || []).map((it, i) => `<tr>
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
  <tr><td><strong>الإجمالي قبل الخصم:</strong></td><td>${Number(ppo.subtotal).toLocaleString("en-EG")} ج.م</td></tr>
  ${ppo.totalDiscount > 0 ? `<tr><td><strong>إجمالي الخصومات:</strong></td><td class="warn">${Number(ppo.totalDiscount).toLocaleString("en-EG")} ج.م</td></tr>` : ""}
  <tr><td><strong style="font-size:14px">الإجمالي:</strong></td><td class="info" style="font-size:14px">${Number(ppo.total).toLocaleString("en-EG")} ج.م</td></tr>
</table>
<div class="foot">أمر شراء ${ppo.orderNo} — ${ppo.date}</div>
<script>window.onload = () => setTimeout(() => window.print(), 200);</script>
</body></html>`;
}

export default PurchasePipelineOrdersPg;
