/* ═══════════════════════════════════════════════════════════════════════
   CLARK · QuotationsPg (V21.10.0 — #3 Slice 1)
   ───────────────────────────────────────────────────────────────────────
   Sales Quotations list page + create/edit/view modals (inline).
   Standalone — no Sales Order conversion yet (Slice 2).
   Same UX pattern as SalesInvoicesPg / CreditNotesPg.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo, useEffect } from "react";
import { Btn, Card, Inp, Sel } from "../components/ui.jsx";
import { T } from "../theme.js";
import { FS, PRINT_CSS } from "../constants/index.js";
import { fmt, r2 } from "../utils/format.js";
import { ask, tell, showToast } from "../utils/popups.js";
import {
  buildQuotation, computeQuotationTotals, validateQuotation,
  markQuotationSentMutator, markQuotationAcceptedMutator,
  markQuotationRejectedMutator, deleteDraftQuotationMutator,
  autoExpireQuotationsMutator, getQuotationStats,
} from "../utils/sales/quotations.js";

const STATUS_META = {
  draft:     { label: "مسودة",   color: "#6B7280", bg: "#6B728015" },
  sent:      { label: "مُرسل",    color: "#0EA5E9", bg: "#0EA5E915" },
  accepted:  { label: "موافق",    color: "#10B981", bg: "#10B98115" },
  rejected:  { label: "مرفوض",   color: "#EF4444", bg: "#EF444415" },
  converted: { label: "محوّل",    color: "#8B5CF6", bg: "#8B5CF615" },
  expired:   { label: "منتهي",   color: "#F59E0B", bg: "#F59E0B15" },
};

export function QuotationsPg({ data, upConfig, isMob, canEdit, user }){
  const today = new Date().toISOString().split("T")[0];
  const monthStart = today.slice(0,7) + "-01";
  const [from, setFrom]       = useState(monthStart);
  const [to, setTo]           = useState(today);
  const [status, setStatus]   = useState("all");
  const [partyId, setPartyId] = useState("");
  const [search, setSearch]   = useState("");
  const [activeQ, setActiveQ] = useState(null);  /* quotation being viewed */
  const [showForm, setShowForm] = useState(false); /* create modal */

  const userName = user?.displayName || (user?.email || "").split("@")[0] || "";
  const quotations = data.salesQuotations || [];
  const customers = (data.customers || []).filter(c => !c.archived);

  /* Auto-expire stale drafts on mount. Idempotent — only fires if any flips. */
  useEffect(() => {
    if(!canEdit) return;
    const stale = quotations.filter(q =>
      ["draft","sent"].includes(q.status) && q.validUntil && q.validUntil < today
    );
    if(stale.length === 0) return;
    upConfig(d => { autoExpireQuotationsMutator(d); });
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  const filtered = useMemo(() => {
    let list = quotations;
    if(from) list = list.filter(q => (q.date || "") >= from);
    if(to)   list = list.filter(q => (q.date || "") <= to);
    if(status !== "all") list = list.filter(q => q.status === status);
    if(partyId) list = list.filter(q => q.customerId === partyId);
    if(search.trim()){
      const s = search.trim().toLowerCase();
      list = list.filter(q =>
        (q.quoteNo || "").toLowerCase().includes(s) ||
        (q.customerName || "").toLowerCase().includes(s)
      );
    }
    return list.slice().sort(
      (a,b) => (b.date || "").localeCompare(a.date || "") ||
               (b.quoteNo || "").localeCompare(a.quoteNo || "")
    );
  }, [quotations, from, to, status, partyId, search]);

  const stats = useMemo(
    () => getQuotationStats(data, { from, to, partyId, status }),
    [data, from, to, partyId, status]
  );

  const handleSend = async (q) => {
    if(!await ask("إرسال العرض", `تأكيد إرسال ${q.quoteNo} لـ ${q.customerName}؟`, { confirmText: "إرسال" })) return;
    try {
      await upConfig(d => { markQuotationSentMutator(d, q.id, "manual", userName); });
      showToast("✓ تم تحديد العرض كمُرسل");
      setActiveQ(null);
    } catch(e){ tell("خطأ", e.message, { danger: true }); }
  };

  const handleAccept = async (q) => {
    if(!await ask("موافقة العميل", `العميل وافق على ${q.quoteNo}؟`, { confirmText: "نعم" })) return;
    try {
      await upConfig(d => { markQuotationAcceptedMutator(d, q.id, userName); });
      showToast("✓ تم تحديد العرض كموافق عليه");
    } catch(e){ tell("خطأ", e.message, { danger: true }); }
  };

  const handleReject = async (q) => {
    const reason = prompt("سبب الرفض (اختياري):") || "";
    if(reason === null) return;
    try {
      await upConfig(d => { markQuotationRejectedMutator(d, q.id, userName, reason); });
      showToast("✓ تم رفض العرض");
    } catch(e){ tell("خطأ", e.message, { danger: true }); }
  };

  const handleDelete = async (q) => {
    if(!await ask("حذف مسودة", `حذف العرض ${q.quoteNo}؟ (لا يمكن التراجع)`, { confirmText: "حذف", danger: true })) return;
    try {
      await upConfig(d => { deleteDraftQuotationMutator(d, q.id); });
      showToast("✓ تم الحذف");
      setActiveQ(null);
    } catch(e){ tell("خطأ", e.message, { danger: true }); }
  };

  const handlePrint = (q) => {
    const html = buildPrintHtml(q, data);
    const w = window.open("", "_blank");
    if(!w){ showToast("⚠️ الـ popup blocker قافل النافذة"); return; }
    w.document.write(html);
    w.document.close();
  };

  return <div style={{padding: isMob ? 8 : 16, maxWidth: 1400, margin: "0 auto"}}>
    {/* Header */}
    <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 12, flexWrap:"wrap", gap: 8}}>
      <div>
        <h2 style={{margin: 0, fontSize: FS+6, color: T.text}}>📋 عروض الأسعار</h2>
        <div style={{fontSize: FS-2, color: T.textMut, marginTop: 2}}>
          {stats.count} عرض • القيمة {fmt(stats.totalValue)} ج.م
        </div>
      </div>
      {canEdit && <Btn primary onClick={() => setShowForm(true)}>➕ عرض جديد</Btn>}
    </div>

    {/* Status badges row */}
    <div style={{display:"flex", gap: 6, marginBottom: 12, flexWrap:"wrap", fontSize: FS-2}}>
      {Object.entries(STATUS_META).map(([k, meta]) => (
        <span key={k} onClick={() => setStatus(status === k ? "all" : k)}
          style={{
            padding:"4px 10px", borderRadius: 6, cursor:"pointer",
            background: status === k ? meta.color : meta.bg,
            color: status === k ? "#fff" : meta.color,
            fontWeight: 700,
          }}>
          {meta.label}: {stats[k === "draft" ? "drafts" : k] || 0}
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
        <Inp value={search} onChange={setSearch} placeholder="رقم العرض أو اسم العميل..."/>
      </div>
    </Card>

    {/* List */}
    {filtered.length === 0 ? (
      <Card style={{padding: 40, textAlign:"center", color: T.textMut}}>
        مفيش عروض في النطاق ده
      </Card>
    ) : (
      <Card style={{padding: 0, overflow:"hidden"}}>
        <table style={{width:"100%", borderCollapse:"collapse", fontSize: FS-1}}>
          <thead>
            <tr style={{background: T.bg, borderBottom: "1px solid " + T.brd}}>
              <th style={{padding:"10px 8px", textAlign:"right"}}>الرقم</th>
              <th style={{padding:"10px 8px", textAlign:"right"}}>التاريخ</th>
              <th style={{padding:"10px 8px", textAlign:"right"}}>صلاحية</th>
              <th style={{padding:"10px 8px", textAlign:"right"}}>العميل</th>
              <th style={{padding:"10px 8px", textAlign:"right"}}>بنود</th>
              <th style={{padding:"10px 8px", textAlign:"left"}}>الإجمالي</th>
              <th style={{padding:"10px 8px", textAlign:"center"}}>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(q => {
              const meta = STATUS_META[q.status] || STATUS_META.draft;
              return <tr key={q.id} onClick={() => setActiveQ(q)}
                style={{borderBottom: "1px solid " + T.brd, cursor:"pointer"}}>
                <td style={{padding:"8px", fontWeight: 700, color: T.accent}}>{q.quoteNo}</td>
                <td style={{padding:"8px"}}>{q.date}</td>
                <td style={{padding:"8px", color: q.validUntil < today ? T.err : T.text}}>{q.validUntil}</td>
                <td style={{padding:"8px"}}>{q.customerName}</td>
                <td style={{padding:"8px", textAlign:"center"}}>{(q.items || []).length}</td>
                <td style={{padding:"8px", textAlign:"left", fontWeight: 700}}>{fmt(q.total)}</td>
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
    {activeQ && <QuotationDetailModal
      quote={activeQ}
      onClose={() => setActiveQ(null)}
      onSend={handleSend}
      onAccept={handleAccept}
      onReject={handleReject}
      onDelete={handleDelete}
      onPrint={handlePrint}
      canEdit={canEdit}
    />}

    {/* Create modal */}
    {showForm && <QuotationFormModal
      data={data}
      upConfig={upConfig}
      userName={userName}
      onClose={() => setShowForm(false)}
      onCreated={(quoteNo) => {
        setShowForm(false);
        showToast(`✓ تم إنشاء العرض ${quoteNo}`);
      }}
    />}
  </div>;
}

/* ─────────────── Detail Modal ─────────────── */
function QuotationDetailModal({ quote, onClose, onSend, onAccept, onReject, onDelete, onPrint, canEdit }){
  const meta = STATUS_META[quote.status] || STATUS_META.draft;
  return <div className="pop-overlay" onClick={onClose}
    style={{position:"fixed", inset: 0, background:"rgba(0,0,0,0.5)", zIndex: 99998,
            display:"flex", alignItems:"center", justifyContent:"center", padding: 16}}>
    <div onClick={e => e.stopPropagation()} style={{
      background: T.cardSolid, borderRadius: 16, padding: 20,
      width:"100%", maxWidth: 700, maxHeight:"90vh", overflowY:"auto",
      boxShadow:"0 20px 60px rgba(0,0,0,0.3)"
    }}>
      {/* Header */}
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom: 12}}>
        <div>
          <h3 style={{margin: 0, fontSize: FS+4, color: T.accent}}>{quote.quoteNo}</h3>
          <div style={{fontSize: FS-2, color: T.textMut, marginTop: 4}}>
            {quote.customerName} • {quote.date} • ينتهي {quote.validUntil}
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

      {/* Items table */}
      <table style={{width:"100%", borderCollapse:"collapse", fontSize: FS-1, marginBottom: 12}}>
        <thead>
          <tr style={{background: T.bg, borderBottom: "1px solid " + T.brd}}>
            <th style={{padding:"8px", textAlign:"right", width: 30}}>#</th>
            <th style={{padding:"8px", textAlign:"right"}}>البند</th>
            <th style={{padding:"8px", textAlign:"center"}}>كمية</th>
            <th style={{padding:"8px", textAlign:"left"}}>سعر</th>
            <th style={{padding:"8px", textAlign:"left"}}>خصم</th>
            <th style={{padding:"8px", textAlign:"left"}}>إجمالي</th>
          </tr>
        </thead>
        <tbody>
          {(quote.items || []).map((it, i) => (
            <tr key={i} style={{borderBottom: "1px solid " + T.brd}}>
              <td style={{padding:"8px"}}>{i+1}</td>
              <td style={{padding:"8px"}}>
                {it.modelNo && <span style={{fontWeight: 700}}>{it.modelNo} </span>}
                <span style={{color: T.textMut}}>{it.description || ""}</span>
              </td>
              <td style={{padding:"8px", textAlign:"center"}}>{fmt(it.qty)}</td>
              <td style={{padding:"8px", textAlign:"left"}}>{fmt(it.unitPrice)}</td>
              <td style={{padding:"8px", textAlign:"left", color: it.lineDiscount > 0 ? T.warn : T.textMut}}>
                {it.lineDiscount > 0 ? fmt(it.lineDiscount) : "—"}
              </td>
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
        <div style={{textAlign:"left"}}>{fmt(quote.subtotal)} ج.م</div>
        {quote.totalDiscount > 0 && <>
          <div style={{color: T.warn}}>إجمالي الخصومات:</div>
          <div style={{textAlign:"left", color: T.warn}}>{fmt(quote.totalDiscount)} ج.م</div>
        </>}
        <div style={{fontWeight: 800, fontSize: FS+1, color: T.accent, paddingTop: 6, borderTop: "1px solid " + T.brd}}>
          الإجمالي:
        </div>
        <div style={{textAlign:"left", fontWeight: 800, fontSize: FS+1, color: T.accent, paddingTop: 6, borderTop: "1px solid " + T.brd}}>
          {fmt(quote.total)} ج.م
        </div>
      </div>

      {quote.notes && (
        <div style={{padding: 10, background: T.bg, borderRadius: 8, marginBottom: 12, fontSize: FS-1}}>
          <div style={{color: T.textMut, fontSize: FS-3, marginBottom: 4}}>ملاحظات:</div>
          {quote.notes}
        </div>
      )}

      {/* Actions */}
      <div style={{display:"flex", gap: 6, flexWrap:"wrap", justifyContent:"flex-end"}}>
        <Btn small onClick={() => onPrint(quote)}>🖨 طباعة</Btn>
        {canEdit && quote.status === "draft" && (
          <>
            <Btn small danger onClick={() => onDelete(quote)}>🗑 حذف</Btn>
            <Btn small primary onClick={() => onSend(quote)}>📤 إرسال</Btn>
          </>
        )}
        {canEdit && ["draft", "sent"].includes(quote.status) && (
          <>
            <Btn small onClick={() => onReject(quote)}>❌ رفض</Btn>
            <Btn small style={{background: "#10B981", color: "#fff"}} onClick={() => onAccept(quote)}>✅ موافقة</Btn>
          </>
        )}
      </div>
    </div>
  </div>;
}

/* ─────────────── Form Modal (create new quote) ─────────────── */
function QuotationFormModal({ data, upConfig, userName, onClose, onCreated }){
  const [customerId, setCustomerId] = useState("");
  const [items, setItems] = useState([
    { sourceType: "service", modelNo: "", description: "", qty: 1, unitPrice: 0, discountType: "", discountValue: 0 }
  ]);
  const [docDiscount, setDocDiscount] = useState(0);
  const [validity, setValidity] = useState(Number(data.quotationSettings?.defaultValidityDays) || 14);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const customers = (data.customers || []).filter(c => !c.archived);
  const orders = (data.orders || []).filter(o => !o.closed);
  const generalProducts = data.generalProducts || [];

  const totals = useMemo(() => computeQuotationTotals(items, docDiscount), [items, docDiscount]);

  const updateItem = (idx, field, value) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };
  const addItem = () => {
    setItems(prev => [...prev, { sourceType: "service", modelNo: "", description: "", qty: 1, unitPrice: 0, discountType: "", discountValue: 0 }]);
  };
  const removeItem = (idx) => {
    setItems(prev => prev.length > 1 ? prev.filter((_,i) => i !== idx) : prev);
  };
  /* Item type picker — when user changes the sourceType to "order" or "generalProduct",
     pre-fill modelNo + unitPrice from the picked entity. */
  const pickSource = (idx, sourceType, sourceId) => {
    let modelNo = "", description = "", unitPrice = 0;
    if(sourceType === "order"){
      const o = orders.find(x => x.id === sourceId);
      if(o){ modelNo = o.modelNo || ""; description = o.modelDesc || ""; unitPrice = Number(o.sellPrice) || 0; }
    } else if(sourceType === "generalProduct"){
      const p = generalProducts.find(x => x.id === sourceId);
      if(p){ modelNo = p.code || ""; description = p.name || ""; unitPrice = Number(p.price) || 0; }
    }
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, sourceType, sourceId, modelNo, description, unitPrice } : it));
  };

  const handleSave = async () => {
    const customer = customers.find(c => c.id === customerId);
    const validation = validateQuotation({ customer, items });
    if(!validation.ok){
      tell("بيانات ناقصة", validation.errors.join("\n"), { danger: true });
      return;
    }
    setSaving(true);
    try {
      let createdNo = "";
      await upConfig(d => {
        const q = buildQuotation(d, {
          customer, items, documentDiscountPct: docDiscount,
          validityDays: validity, notes, salesPerson: userName, userName,
        });
        if(!Array.isArray(d.salesQuotations)) d.salesQuotations = [];
        d.salesQuotations.push(q);
        createdNo = q.quoteNo;
      });
      onCreated(createdNo);
    } catch(e){
      tell("فشل الحفظ", e.message, { danger: true });
    } finally {
      setSaving(false);
    }
  };

  return <div className="pop-overlay" onClick={onClose}
    style={{position:"fixed", inset: 0, background:"rgba(0,0,0,0.5)", zIndex: 99998,
            display:"flex", alignItems:"center", justifyContent:"center", padding: 16}}>
    <div onClick={e => e.stopPropagation()} style={{
      background: T.cardSolid, borderRadius: 16, padding: 20,
      width:"100%", maxWidth: 900, maxHeight:"92vh", overflowY:"auto",
      boxShadow:"0 20px 60px rgba(0,0,0,0.3)"
    }}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 12}}>
        <h3 style={{margin: 0, fontSize: FS+3}}>📋 عرض سعر جديد</h3>
        <Btn ghost small onClick={onClose}>✕</Btn>
      </div>

      {/* Customer + validity row */}
      <div style={{display:"grid", gridTemplateColumns:"2fr 1fr", gap: 8, marginBottom: 12}}>
        <div>
          <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 600}}>العميل *</label>
          <Sel value={customerId} onChange={setCustomerId}>
            <option value="">— اختر العميل —</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Sel>
        </div>
        <div>
          <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 600}}>صلاحية (يوم)</label>
          <Inp type="number" value={validity} onChange={v => setValidity(Number(v) || 14)}/>
        </div>
      </div>

      {/* Items */}
      <div style={{marginBottom: 8, fontSize: FS-1, fontWeight: 700, color: T.text}}>البنود</div>
      {items.map((it, idx) => (
        <Card key={idx} style={{padding: 10, marginBottom: 8, background: T.bg}}>
          <div style={{display:"grid", gridTemplateColumns:"1fr 2fr auto", gap: 8, marginBottom: 8}}>
            <div>
              <label style={{fontSize: FS-3, color: T.textMut}}>النوع</label>
              <Sel value={it.sourceType} onChange={v => pickSource(idx, v, "")}>
                <option value="service">خدمة / حر</option>
                <option value="order">موديل</option>
                <option value="generalProduct">منتج عام</option>
              </Sel>
            </div>
            <div>
              <label style={{fontSize: FS-3, color: T.textMut}}>
                {it.sourceType === "order" ? "الموديل" :
                 it.sourceType === "generalProduct" ? "المنتج" : "الوصف"}
              </label>
              {it.sourceType === "order" ? (
                <Sel value={it.sourceId || ""} onChange={v => pickSource(idx, "order", v)}>
                  <option value="">— اختر —</option>
                  {orders.map(o => <option key={o.id} value={o.id}>{o.modelNo} — {o.modelDesc || ""}</option>)}
                </Sel>
              ) : it.sourceType === "generalProduct" ? (
                <Sel value={it.sourceId || ""} onChange={v => pickSource(idx, "generalProduct", v)}>
                  <option value="">— اختر —</option>
                  {generalProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Sel>
              ) : (
                <Inp value={it.description} onChange={v => updateItem(idx, "description", v)} placeholder="وصف البند..."/>
              )}
            </div>
            <div style={{display:"flex", alignItems:"flex-end"}}>
              <Btn small danger onClick={() => removeItem(idx)} disabled={items.length === 1}>🗑</Btn>
            </div>
          </div>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr", gap: 8, alignItems:"flex-end"}}>
            <div>
              <label style={{fontSize: FS-3, color: T.textMut}}>كمية</label>
              <Inp type="number" value={it.qty} onChange={v => updateItem(idx, "qty", Number(v) || 0)}/>
            </div>
            <div>
              <label style={{fontSize: FS-3, color: T.textMut}}>سعر الوحدة</label>
              <Inp type="number" value={it.unitPrice} onChange={v => updateItem(idx, "unitPrice", Number(v) || 0)}/>
            </div>
            <div>
              <label style={{fontSize: FS-3, color: T.textMut}}>خصم</label>
              <Sel value={it.discountType || ""} onChange={v => updateItem(idx, "discountType", v)}>
                <option value="">بدون</option>
                <option value="pct">نسبة %</option>
                <option value="amount">مبلغ</option>
              </Sel>
            </div>
            <div>
              <label style={{fontSize: FS-3, color: T.textMut}}>قيمة الخصم</label>
              <Inp type="number" value={it.discountValue || 0} disabled={!it.discountType}
                onChange={v => updateItem(idx, "discountValue", Number(v) || 0)}/>
            </div>
            <div>
              <label style={{fontSize: FS-3, color: T.textMut}}>إجمالي السطر</label>
              <div style={{padding:"8px 10px", fontWeight: 700, color: T.accent, fontSize: FS}}>
                {fmt(totals.items[idx]?.lineTotal || 0)}
              </div>
            </div>
          </div>
        </Card>
      ))}
      <Btn small onClick={addItem} style={{marginBottom: 12}}>➕ بند جديد</Btn>

      {/* Doc discount + Notes + Totals */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 2fr", gap: 8, marginBottom: 12}}>
        <div>
          <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 600}}>خصم إضافي على الإجمالي (%)</label>
          <Inp type="number" value={docDiscount} onChange={v => setDocDiscount(Number(v) || 0)}/>
        </div>
        <div>
          <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 600}}>ملاحظات</label>
          <Inp value={notes} onChange={setNotes} placeholder="شروط الدفع، التسليم، أي تفاصيل..."/>
        </div>
      </div>

      <div style={{
        background: T.bg, padding: 12, borderRadius: 8, marginBottom: 12,
        display:"grid", gridTemplateColumns: "1fr auto", gap: 4, fontSize: FS-1,
      }}>
        <div>الإجمالي قبل الخصم:</div>
        <div style={{textAlign:"left"}}>{fmt(totals.subtotal)} ج.م</div>
        {totals.totalDiscount > 0 && <>
          <div style={{color: T.warn}}>إجمالي الخصومات:</div>
          <div style={{textAlign:"left", color: T.warn}}>{fmt(totals.totalDiscount)} ج.م</div>
        </>}
        <div style={{fontWeight: 800, fontSize: FS+1, color: T.accent, paddingTop: 6, borderTop: "1px solid " + T.brd}}>
          الإجمالي:
        </div>
        <div style={{textAlign:"left", fontWeight: 800, fontSize: FS+1, color: T.accent, paddingTop: 6, borderTop: "1px solid " + T.brd}}>
          {fmt(totals.total)} ج.م
        </div>
      </div>

      <div style={{display:"flex", gap: 8, justifyContent:"flex-end"}}>
        <Btn onClick={onClose}>إلغاء</Btn>
        <Btn primary onClick={handleSave} disabled={saving}>
          {saving ? "...جاري الحفظ" : "💾 حفظ كمسودة"}
        </Btn>
      </div>
    </div>
  </div>;
}

/* ─────────────── Print helper ─────────────── */
function buildPrintHtml(q, data){
  const factoryName = data.factoryName || "CLARK";
  const logo = data.logo || "";
  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
<title>${q.quoteNo}</title>
<style>${PRINT_CSS || ""}</style></head><body>
<div class="hdr">
  ${logo ? `<img src="${logo}"/>` : `<div style="font-weight:800;font-size:18px;color:#0284C7">${factoryName}</div>`}
  <div class="hdr-info">
    <div>عرض سعر</div>
    <div style="font-size:14px;color:#0284C7;font-weight:800">${q.quoteNo}</div>
    <div>${q.date}</div>
  </div>
</div>
<h2>بيانات العميل</h2>
<table>
  <tr><td><strong>الاسم:</strong></td><td>${q.customerName}</td>
      <td><strong>صلاحية العرض حتى:</strong></td><td>${q.validUntil}</td></tr>
  ${q.customerPhone ? `<tr><td><strong>تليفون:</strong></td><td>${q.customerPhone}</td><td></td><td></td></tr>` : ""}
</table>
<h2>البنود</h2>
<table>
  <thead><tr>
    <th>#</th><th>البند</th><th>كمية</th><th>سعر الوحدة</th><th>خصم</th><th>إجمالي</th>
  </tr></thead>
  <tbody>
    ${(q.items || []).map((it, i) => `<tr>
      <td>${i+1}</td>
      <td>${it.modelNo ? `<strong>${it.modelNo}</strong> — ` : ""}${it.description || ""}</td>
      <td>${it.qty}</td>
      <td>${Number(it.unitPrice).toLocaleString("en-EG")}</td>
      <td>${it.lineDiscount > 0 ? Number(it.lineDiscount).toLocaleString("en-EG") : "—"}</td>
      <td><strong>${Number(it.lineTotal).toLocaleString("en-EG")}</strong></td>
    </tr>`).join("")}
  </tbody>
</table>
<h2>الإجماليات</h2>
<table>
  <tr><td><strong>الإجمالي قبل الخصم:</strong></td><td>${Number(q.subtotal).toLocaleString("en-EG")} ج.م</td></tr>
  ${q.totalDiscount > 0 ? `<tr><td><strong>إجمالي الخصومات:</strong></td><td class="warn">${Number(q.totalDiscount).toLocaleString("en-EG")} ج.م</td></tr>` : ""}
  <tr><td><strong style="font-size:14px">الإجمالي:</strong></td><td class="info" style="font-size:14px">${Number(q.total).toLocaleString("en-EG")} ج.م</td></tr>
</table>
${q.notes ? `<h2>ملاحظات</h2><p style="padding:8px;background:#F8FAFC;border-radius:6px">${q.notes}</p>` : ""}
<div class="sig">
  <div class="sig-box">المسؤول<br/>${q.salesPerson || ""}</div>
  <div class="sig-box">العميل<br/>&nbsp;</div>
</div>
<div class="foot">عرض سعر صالح حتى ${q.validUntil} — تم إنشاؤه في ${q.date} • طُبع: ${new Date().toISOString().split("T")[0]}</div>
<script>window.onload = () => setTimeout(() => window.print(), 200);</script>
</body></html>`;
}

export default QuotationsPg;
