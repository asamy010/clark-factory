/* ═══════════════════════════════════════════════════════════════════════
   CLARK · PurchaseRFQsPg (V21.10.5 — #3 Slice 6)
   ───────────────────────────────────────────────────────────────────────
   Mirror of QuotationsPg for the Purchase side. Lists RFQs (Request for
   Quotation) — pre-PO documents requesting supplier pricing.
   Standalone for now — conversion to Pipeline PO comes in Slice 7.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo, useEffect } from "react";
import { Btn, Card, Inp, Sel } from "../components/ui.jsx";
import { T } from "../theme.js";
import { FS, PRINT_CSS } from "../constants/index.js";
import { fmt } from "../utils/format.js";
import { ask, tell, showToast } from "../utils/popups.js";
import {
  buildRFQ, computeRFQTotals, validateRFQ,
  markRFQSentMutator, markRFQReceivedMutator, markRFQAcceptedMutator,
  markRFQRejectedMutator, deleteDraftRFQMutator,
  autoExpireRFQsMutator, getRFQStats,
} from "../utils/purchase/rfqs.js";
/* V21.10.6 — Slice 7: convert RFQ → Pipeline PO */
import { convertRFQToPipelinePOMutator } from "../utils/purchase/purchasePipelineOrders.js";

const STATUS_META = {
  draft:     { label: "مسودة",   color: "#6B7280", bg: "#6B728015" },
  sent:      { label: "مُرسل",    color: "#0EA5E9", bg: "#0EA5E915" },
  received:  { label: "وصل عرض", color: "#F59E0B", bg: "#F59E0B15" },
  accepted:  { label: "موافق",    color: "#10B981", bg: "#10B98115" },
  rejected:  { label: "مرفوض",   color: "#EF4444", bg: "#EF444415" },
  converted: { label: "محوّل",    color: "#8B5CF6", bg: "#8B5CF615" },
  expired:   { label: "منتهي",   color: "#F59E0B", bg: "#F59E0B15" },
};

export function PurchaseRFQsPg({ data, upConfig, isMob, canEdit, user }){
  const today = new Date().toISOString().split("T")[0];
  const monthStart = today.slice(0,7) + "-01";
  const [from, setFrom]       = useState(monthStart);
  const [to, setTo]           = useState(today);
  const [status, setStatus]   = useState("all");
  const [partyId, setPartyId] = useState("");
  const [search, setSearch]   = useState("");
  const [activeR, setActiveR] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const userName = user?.displayName || (user?.email || "").split("@")[0] || "";
  const rfqs = data.purchaseRFQs || [];
  const suppliers = (data.suppliers || []).filter(s => !s.archived);

  useEffect(() => {
    if(!canEdit) return;
    const stale = rfqs.filter(r =>
      ["draft","sent","received"].includes(r.status) && r.validUntil && r.validUntil < today
    );
    if(stale.length === 0) return;
    upConfig(d => { autoExpireRFQsMutator(d); });
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  const filtered = useMemo(() => {
    let list = rfqs;
    if(from) list = list.filter(r => (r.date || "") >= from);
    if(to)   list = list.filter(r => (r.date || "") <= to);
    if(status !== "all") list = list.filter(r => r.status === status);
    if(partyId) list = list.filter(r => r.supplierId === partyId);
    if(search.trim()){
      const s = search.trim().toLowerCase();
      list = list.filter(r =>
        (r.rfqNo || "").toLowerCase().includes(s) ||
        (r.supplierName || "").toLowerCase().includes(s)
      );
    }
    return list.slice().sort(
      (a,b) => (b.date || "").localeCompare(a.date || "") ||
               (b.rfqNo || "").localeCompare(a.rfqNo || "")
    );
  }, [rfqs, from, to, status, partyId, search]);

  const stats = useMemo(
    () => getRFQStats(data, { from, to, partyId, status }),
    [data, from, to, partyId, status]
  );

  const handleSend = async (r) => {
    if(!await ask("إرسال للمورد", `إرسال ${r.rfqNo} لـ ${r.supplierName}؟`, { confirmText: "إرسال" })) return;
    try {
      await upConfig(d => { markRFQSentMutator(d, r.id, "manual", userName); });
      showToast("✓ تم تحديد الطلب كمُرسل");
      setActiveR(null);
    } catch(e){ tell("خطأ", e.message, { danger: true }); }
  };

  const handleReceived = async (r) => {
    if(!await ask("استلام عرض المورد", `المورد رد بعرض على ${r.rfqNo}؟`, { confirmText: "نعم" })) return;
    try {
      await upConfig(d => { markRFQReceivedMutator(d, r.id, userName); });
      showToast("✓ تم تحديد استلام العرض");
    } catch(e){ tell("خطأ", e.message, { danger: true }); }
  };

  const handleAccept = async (r) => {
    if(!await ask("الموافقة على العرض", `الموافقة على ${r.rfqNo}؟`, { confirmText: "موافق" })) return;
    try {
      await upConfig(d => { markRFQAcceptedMutator(d, r.id, userName); });
      showToast("✓ تم الموافقة — اضغط 'حوّل لأمر شراء' للخطوة التالية");
    } catch(e){ tell("خطأ", e.message, { danger: true }); }
  };

  /* V21.10.6 — Slice 7: convert RFQ → Pipeline PO */
  const handleConvert = async (r) => {
    if(!await ask("تحويل لأمر شراء", `تحويل ${r.rfqNo} لأمر شراء جديد؟\nأمر الشراء هـ يدخل بحالة "مسودة" — الاستلام + إضافة المخزون لاحقاً.`, { confirmText: "تحويل" })) return;
    try {
      let createdNo = "";
      await upConfig(d => {
        const ppo = convertRFQToPipelinePOMutator(d, r.id, userName);
        createdNo = ppo.orderNo;
      });
      showToast(`✓ تم إنشاء أمر الشراء ${createdNo}`);
      setActiveR(null);
    } catch(e){ tell("فشل التحويل", e.message, { danger: true }); }
  };

  const handleReject = async (r) => {
    const reason = prompt("سبب الرفض (اختياري):") || "";
    if(reason === null) return;
    try {
      await upConfig(d => { markRFQRejectedMutator(d, r.id, userName, reason); });
      showToast("✓ تم الرفض");
    } catch(e){ tell("خطأ", e.message, { danger: true }); }
  };

  const handleDelete = async (r) => {
    if(!await ask("حذف مسودة", `حذف ${r.rfqNo}؟`, { confirmText: "حذف", danger: true })) return;
    try {
      await upConfig(d => { deleteDraftRFQMutator(d, r.id); });
      showToast("✓ تم الحذف");
      setActiveR(null);
    } catch(e){ tell("خطأ", e.message, { danger: true }); }
  };

  const handlePrint = (r) => {
    const html = buildPrintHtml(r, data);
    const w = window.open("", "_blank");
    if(!w){ showToast("⚠️ الـ popup blocker قافل النافذة"); return; }
    w.document.write(html); w.document.close();
  };

  return <div style={{padding: isMob ? 8 : 16, maxWidth: 1400, margin: "0 auto"}}>
    <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 12, flexWrap:"wrap", gap: 8}}>
      <div>
        <h2 style={{margin: 0, fontSize: FS+6, color: T.text}}>📋 عروض الموردين (RFQs)</h2>
        <div style={{fontSize: FS-2, color: T.textMut, marginTop: 2}}>
          {stats.count} طلب • القيمة {fmt(stats.totalValue)} ج.م
        </div>
      </div>
      {canEdit && <Btn primary onClick={() => setShowForm(true)}>➕ طلب عرض جديد</Btn>}
    </div>

    <div style={{display:"flex", gap: 6, marginBottom: 12, flexWrap:"wrap", fontSize: FS-2}}>
      {Object.entries(STATUS_META).map(([k, meta]) => (
        <span key={k} onClick={() => setStatus(status === k ? "all" : k)}
          style={{
            padding:"4px 10px", borderRadius: 6, cursor:"pointer",
            background: status === k ? meta.color : meta.bg,
            color: status === k ? "#fff" : meta.color, fontWeight: 700,
          }}>
          {meta.label}: {stats[k === "draft" ? "drafts" : k] || 0}
        </span>
      ))}
    </div>

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
      <div style={{flex: 1, minWidth: 200}}>
        <label style={{fontSize: FS-3, color: T.textMut}}>بحث</label>
        <Inp value={search} onChange={setSearch} placeholder="رقم الطلب أو اسم المورد..."/>
      </div>
    </Card>

    {filtered.length === 0 ? (
      <Card style={{padding: 40, textAlign:"center", color: T.textMut}}>
        مفيش طلبات عروض في النطاق ده
      </Card>
    ) : (
      <Card style={{padding: 0, overflow:"hidden"}}>
        <table style={{width:"100%", borderCollapse:"collapse", fontSize: FS-1}}>
          <thead>
            <tr style={{background: T.bg, borderBottom: "1px solid " + T.brd}}>
              <th style={{padding:"10px 8px", textAlign:"right"}}>الرقم</th>
              <th style={{padding:"10px 8px", textAlign:"right"}}>التاريخ</th>
              <th style={{padding:"10px 8px", textAlign:"right"}}>صلاحية</th>
              <th style={{padding:"10px 8px", textAlign:"right"}}>المورد</th>
              <th style={{padding:"10px 8px", textAlign:"right"}}>بنود</th>
              <th style={{padding:"10px 8px", textAlign:"left"}}>الإجمالي</th>
              <th style={{padding:"10px 8px", textAlign:"center"}}>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => {
              const meta = STATUS_META[r.status] || STATUS_META.draft;
              return <tr key={r.id} onClick={() => setActiveR(r)}
                style={{borderBottom: "1px solid " + T.brd, cursor:"pointer"}}>
                <td style={{padding:"8px", fontWeight: 700, color: T.accent}}>{r.rfqNo}</td>
                <td style={{padding:"8px"}}>{r.date}</td>
                <td style={{padding:"8px", color: r.validUntil < today ? T.err : T.text}}>{r.validUntil}</td>
                <td style={{padding:"8px"}}>{r.supplierName}</td>
                <td style={{padding:"8px", textAlign:"center"}}>{(r.items || []).length}</td>
                <td style={{padding:"8px", textAlign:"left", fontWeight: 700}}>{fmt(r.total)}</td>
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

    {activeR && <RFQDetailModal
      rfq={activeR}
      onClose={() => setActiveR(null)}
      onSend={handleSend} onReceived={handleReceived}
      onAccept={handleAccept} onReject={handleReject}
      onDelete={handleDelete} onPrint={handlePrint}
      onConvert={handleConvert}
      canEdit={canEdit}
    />}

    {showForm && <RFQFormModal
      data={data} upConfig={upConfig} userName={userName}
      onClose={() => setShowForm(false)}
      onCreated={(no) => { setShowForm(false); showToast(`✓ تم إنشاء الطلب ${no}`); }}
    />}
  </div>;
}

function RFQDetailModal({ rfq, onClose, onSend, onReceived, onAccept, onReject, onDelete, onPrint, onConvert, canEdit }){
  const meta = STATUS_META[rfq.status] || STATUS_META.draft;
  return <div className="pop-overlay" onClick={onClose}
    style={{position:"fixed", inset: 0, background:"rgba(0,0,0,0.5)", zIndex: 99998,
            display:"flex", alignItems:"center", justifyContent:"center", padding: 16}}>
    <div onClick={e => e.stopPropagation()} style={{
      background: T.cardSolid, borderRadius: 16, padding: 20,
      width:"100%", maxWidth: 700, maxHeight:"90vh", overflowY:"auto",
      boxShadow:"0 20px 60px rgba(0,0,0,0.3)"
    }}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom: 12}}>
        <div>
          <h3 style={{margin: 0, fontSize: FS+4, color: T.accent}}>{rfq.rfqNo}</h3>
          <div style={{fontSize: FS-2, color: T.textMut, marginTop: 4}}>
            {rfq.supplierName} • {rfq.date} • صلاحية {rfq.validUntil}
          </div>
        </div>
        <div style={{display:"flex", gap: 6, alignItems:"center"}}>
          <span style={{padding:"4px 12px", borderRadius: 6, fontSize: FS-2,
            background: meta.bg, color: meta.color, fontWeight: 700}}>{meta.label}</span>
          <Btn ghost small onClick={onClose}>✕</Btn>
        </div>
      </div>

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
          {(rfq.items || []).map((it, i) => (
            <tr key={i} style={{borderBottom: "1px solid " + T.brd}}>
              <td style={{padding:"8px"}}>{i+1}</td>
              <td style={{padding:"8px"}}>
                {it.modelNo && <span style={{fontWeight: 700}}>{it.modelNo} </span>}
                <span style={{color: T.textMut}}>{it.description || ""}</span>
              </td>
              <td style={{padding:"8px", textAlign:"center"}}>{fmt(it.qty)}</td>
              <td style={{padding:"8px", textAlign:"left"}}>{fmt(it.unitPrice)}</td>
              <td style={{padding:"8px", textAlign:"left", fontWeight: 700}}>{fmt(it.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{background: T.bg, padding: 12, borderRadius: 8, marginBottom: 12,
        display:"grid", gridTemplateColumns: "1fr auto", gap: 4, fontSize: FS-1}}>
        <div>الإجمالي قبل الخصم:</div>
        <div style={{textAlign:"left"}}>{fmt(rfq.subtotal)} ج.م</div>
        {rfq.totalDiscount > 0 && <>
          <div style={{color: T.warn}}>إجمالي الخصومات:</div>
          <div style={{textAlign:"left", color: T.warn}}>{fmt(rfq.totalDiscount)} ج.م</div>
        </>}
        <div style={{fontWeight: 800, fontSize: FS+1, color: T.accent, paddingTop: 6, borderTop: "1px solid " + T.brd}}>الإجمالي:</div>
        <div style={{textAlign:"left", fontWeight: 800, fontSize: FS+1, color: T.accent, paddingTop: 6, borderTop: "1px solid " + T.brd}}>{fmt(rfq.total)} ج.م</div>
      </div>

      {rfq.notes && (
        <div style={{padding: 10, background: T.bg, borderRadius: 8, marginBottom: 12, fontSize: FS-1}}>
          <div style={{color: T.textMut, fontSize: FS-3, marginBottom: 4}}>ملاحظات:</div>
          {rfq.notes}
        </div>
      )}

      <div style={{display:"flex", gap: 6, flexWrap:"wrap", justifyContent:"flex-end"}}>
        <Btn small onClick={() => onPrint(rfq)}>🖨 طباعة</Btn>
        {canEdit && rfq.status === "draft" && (
          <>
            <Btn small danger onClick={() => onDelete(rfq)}>🗑 حذف</Btn>
            <Btn small primary onClick={() => onSend(rfq)}>📤 إرسال للمورد</Btn>
          </>
        )}
        {canEdit && ["sent","draft"].includes(rfq.status) && (
          <Btn small style={{background: "#F59E0B", color: "#fff"}} onClick={() => onReceived(rfq)}>📩 وصل عرض</Btn>
        )}
        {canEdit && ["draft","sent","received"].includes(rfq.status) && (
          <>
            <Btn small onClick={() => onReject(rfq)}>❌ رفض</Btn>
            <Btn small style={{background: "#10B981", color: "#fff"}} onClick={() => onAccept(rfq)}>✅ موافقة</Btn>
          </>
        )}
        {/* V21.10.6 — Slice 7: convert RFQ to Pipeline PO */}
        {canEdit && ["draft", "sent", "received", "accepted"].includes(rfq.status) && !rfq.convertedToPipelinePOId && (
          <Btn small style={{background: "#8B5CF6", color: "#fff"}} onClick={() => onConvert(rfq)}>📑 حوّل لأمر شراء</Btn>
        )}
        {rfq.convertedToPipelinePONo && (
          <span style={{padding:"6px 12px", background:"#8B5CF615", color:"#8B5CF6", borderRadius: 6, fontWeight: 700, fontSize: FS-2}}>
            🔗 محوّل لـ {rfq.convertedToPipelinePONo}
          </span>
        )}
      </div>
    </div>
  </div>;
}

function RFQFormModal({ data, upConfig, userName, onClose, onCreated }){
  const [supplierId, setSupplierId] = useState("");
  const [items, setItems] = useState([
    { sourceType: "service", modelNo: "", description: "", qty: 1, unitPrice: 0, discountType: "", discountValue: 0 }
  ]);
  const [docDiscount, setDocDiscount] = useState(0);
  const [validity, setValidity] = useState(Number(data.rfqSettings?.defaultValidityDays) || 30);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const suppliers = (data.suppliers || []).filter(s => !s.archived);
  const generalProducts = data.generalProducts || [];
  const fabrics = data.fabrics || [];
  const accessories = data.accessories || [];

  const totals = useMemo(() => computeRFQTotals(items, docDiscount), [items, docDiscount]);

  const updateItem = (idx, field, value) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };
  const addItem = () => setItems(prev => [...prev, { sourceType: "service", modelNo: "", description: "", qty: 1, unitPrice: 0, discountType: "", discountValue: 0 }]);
  const removeItem = (idx) => setItems(prev => prev.length > 1 ? prev.filter((_,i) => i !== idx) : prev);
  const pickSource = (idx, sourceType, sourceId) => {
    let modelNo = "", description = "", unitPrice = 0;
    if(sourceType === "generalProduct"){
      const p = generalProducts.find(x => x.id === sourceId);
      if(p){ modelNo = p.code || ""; description = p.name || ""; unitPrice = Number(p.avgCost) || Number(p.price) || 0; }
    } else if(sourceType === "fabric"){
      const f = fabrics.find(x => x.id === sourceId);
      if(f){ modelNo = ""; description = f.name || ""; unitPrice = Number(f.price) || 0; }
    } else if(sourceType === "accessory"){
      const a = accessories.find(x => x.id === sourceId);
      if(a){ modelNo = ""; description = a.name || ""; unitPrice = Number(a.price) || 0; }
    }
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, sourceType, sourceId, modelNo, description, unitPrice } : it));
  };

  const handleSave = async () => {
    const supplier = suppliers.find(s => s.id === supplierId);
    const validation = validateRFQ({ supplier, items });
    if(!validation.ok){
      tell("بيانات ناقصة", validation.errors.join("\n"), { danger: true });
      return;
    }
    setSaving(true);
    try {
      let createdNo = "";
      await upConfig(d => {
        const r = buildRFQ(d, {
          supplier, items, documentDiscountPct: docDiscount,
          validityDays: validity, notes, requestedBy: userName, userName,
        });
        if(!Array.isArray(d.purchaseRFQs)) d.purchaseRFQs = [];
        d.purchaseRFQs.push(r);
        createdNo = r.rfqNo;
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
        <h3 style={{margin: 0, fontSize: FS+3}}>📋 طلب عرض سعر جديد</h3>
        <Btn ghost small onClick={onClose}>✕</Btn>
      </div>

      <div style={{display:"grid", gridTemplateColumns:"2fr 1fr", gap: 8, marginBottom: 12}}>
        <div>
          <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 600}}>المورد *</label>
          <Sel value={supplierId} onChange={setSupplierId}>
            <option value="">— اختر المورد —</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Sel>
        </div>
        <div>
          <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 600}}>صلاحية (يوم)</label>
          <Inp type="number" value={validity} onChange={v => setValidity(Number(v) || 30)}/>
        </div>
      </div>

      <div style={{marginBottom: 8, fontSize: FS-1, fontWeight: 700, color: T.text}}>البنود</div>
      {items.map((it, idx) => (
        <Card key={idx} style={{padding: 10, marginBottom: 8, background: T.bg}}>
          <div style={{display:"grid", gridTemplateColumns:"1fr 2fr auto", gap: 8, marginBottom: 8}}>
            <div>
              <label style={{fontSize: FS-3, color: T.textMut}}>النوع</label>
              <Sel value={it.sourceType} onChange={v => pickSource(idx, v, "")}>
                <option value="service">خدمة / حر</option>
                <option value="generalProduct">منتج عام</option>
                <option value="fabric">قماش</option>
                <option value="accessory">إكسسوار</option>
              </Sel>
            </div>
            <div>
              <label style={{fontSize: FS-3, color: T.textMut}}>الصنف</label>
              {it.sourceType === "generalProduct" ? (
                <Sel value={it.sourceId || ""} onChange={v => pickSource(idx, "generalProduct", v)}>
                  <option value="">— اختر —</option>
                  {generalProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Sel>
              ) : it.sourceType === "fabric" ? (
                <Sel value={it.sourceId || ""} onChange={v => pickSource(idx, "fabric", v)}>
                  <option value="">— اختر —</option>
                  {fabrics.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </Sel>
              ) : it.sourceType === "accessory" ? (
                <Sel value={it.sourceId || ""} onChange={v => pickSource(idx, "accessory", v)}>
                  <option value="">— اختر —</option>
                  {accessories.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
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
              <label style={{fontSize: FS-3, color: T.textMut}}>سعر</label>
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
              <label style={{fontSize: FS-3, color: T.textMut}}>إجمالي</label>
              <div style={{padding:"8px 10px", fontWeight: 700, color: T.accent}}>
                {fmt(totals.items[idx]?.lineTotal || 0)}
              </div>
            </div>
          </div>
        </Card>
      ))}
      <Btn small onClick={addItem} style={{marginBottom: 12}}>➕ بند</Btn>

      <div style={{display:"grid", gridTemplateColumns:"1fr 2fr", gap: 8, marginBottom: 12}}>
        <div>
          <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 600}}>خصم إضافي (%)</label>
          <Inp type="number" value={docDiscount} onChange={v => setDocDiscount(Number(v) || 0)}/>
        </div>
        <div>
          <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 600}}>ملاحظات</label>
          <Inp value={notes} onChange={setNotes} placeholder="شروط، تسليم، أي تفاصيل..."/>
        </div>
      </div>

      <div style={{background: T.bg, padding: 12, borderRadius: 8, marginBottom: 12,
        display:"grid", gridTemplateColumns: "1fr auto", gap: 4, fontSize: FS-1}}>
        <div>الإجمالي قبل الخصم:</div>
        <div style={{textAlign:"left"}}>{fmt(totals.subtotal)} ج.م</div>
        {totals.totalDiscount > 0 && <>
          <div style={{color: T.warn}}>إجمالي الخصومات:</div>
          <div style={{textAlign:"left", color: T.warn}}>{fmt(totals.totalDiscount)} ج.م</div>
        </>}
        <div style={{fontWeight: 800, fontSize: FS+1, color: T.accent, paddingTop: 6, borderTop: "1px solid " + T.brd}}>الإجمالي:</div>
        <div style={{textAlign:"left", fontWeight: 800, fontSize: FS+1, color: T.accent, paddingTop: 6, borderTop: "1px solid " + T.brd}}>{fmt(totals.total)} ج.م</div>
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

function buildPrintHtml(r, data){
  const factoryName = data.factoryName || "CLARK";
  const logo = data.logo || "";
  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
<title>${r.rfqNo}</title>
<style>${PRINT_CSS || ""}</style></head><body>
<div class="hdr">
  ${logo ? `<img src="${logo}"/>` : `<div style="font-weight:800;font-size:18px;color:#0284C7">${factoryName}</div>`}
  <div class="hdr-info">
    <div>طلب عرض سعر</div>
    <div style="font-size:14px;color:#0284C7;font-weight:800">${r.rfqNo}</div>
    <div>${r.date}</div>
  </div>
</div>
<h2>المورد</h2>
<table>
  <tr><td><strong>الاسم:</strong></td><td>${r.supplierName}</td>
      <td><strong>صلاحية حتى:</strong></td><td>${r.validUntil}</td></tr>
  ${r.supplierPhone ? `<tr><td><strong>تليفون:</strong></td><td>${r.supplierPhone}</td><td></td><td></td></tr>` : ""}
</table>
<h2>البنود</h2>
<table>
  <thead><tr><th>#</th><th>البند</th><th>كمية</th><th>سعر متوقع</th><th>إجمالي</th></tr></thead>
  <tbody>
    ${(r.items || []).map((it, i) => `<tr>
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
  <tr><td><strong>الإجمالي:</strong></td><td class="info">${Number(r.total).toLocaleString("en-EG")} ج.م</td></tr>
</table>
${r.notes ? `<h2>ملاحظات</h2><p style="padding:8px;background:#F8FAFC;border-radius:6px">${r.notes}</p>` : ""}
<div class="foot">طلب عرض سعر صالح حتى ${r.validUntil} — برجاء الرد بأفضل سعر وشروط التسليم</div>
<script>window.onload = () => setTimeout(() => window.print(), 200);</script>
</body></html>`;
}

export default PurchaseRFQsPg;
