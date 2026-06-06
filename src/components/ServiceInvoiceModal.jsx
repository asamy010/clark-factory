/* ═══════════════════════════════════════════════════════════════════════
   CLARK · ServiceInvoiceModal (V18.85)
   ───────────────────────────────────────────────────────────────────────
   Modal for creating a "service" invoice — a direct invoice for services
   that don't pass through inventory (shipping, maintenance, consultations,
   rent, etc.).

   Mode: "sales" or "purchase".
   Each line: description (free text), qty, unitPrice, lineTotal,
   accountId (optional, for auto-post — revenue for sales, expense for purchase).

   Saves to data.salesInvoices or data.purchaseInvoices with subtype:"service".
   Status starts "draft" — admin posts later from the invoice list.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { Btn, Inp, Sel } from "./ui.jsx";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { fmt } from "../utils/format.js";
import { ask, showToast } from "../utils/popups.js";
import { buildSalesServiceInvoice, buildPurchaseServiceInvoice } from "../utils/invoices.js";
import { AccountSelector } from "./accounting/AccountSelector.jsx";

export function ServiceInvoiceModal({mode, data, upConfig, user, onClose}){
  const isSales = mode === "sales";
  const today = new Date().toISOString().split("T")[0];
  const userName = user?.displayName || (user?.email||"").split("@")[0] || "";

  const parties = isSales ? (data.customers||[]) : (data.suppliers||[]);
  const coa = data.coa || [];

  const [date, setDate] = useState(today);
  const [partyId, setPartyId] = useState("");
  const [partyAdHoc, setPartyAdHoc] = useState("");
  const [discountPct, setDiscountPct] = useState(0);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState([
    {id: 1, description:"", qty:1, unitPrice:0, accountId:""}
  ]);

  const addLine = () => {
    setItems([...items, {id: Date.now(), description:"", qty:1, unitPrice:0, accountId:""}]);
  };
  const removeLine = (id) => {
    if(items.length === 1){ showToast("لا يمكن حذف آخر بند"); return; }
    setItems(items.filter(it => it.id !== id));
  };
  const updLine = (id, field, value) => {
    setItems(items.map(it => it.id === id ? {...it, [field]: value} : it));
  };

  const subtotal = useMemo(() =>
    items.reduce((s, it) => s + (Number(it.qty)||1)*(Number(it.unitPrice)||0), 0)
  , [items]);
  const discount = subtotal * (Number(discountPct)||0) / 100;
  const total = subtotal - discount;

  const canSave = useMemo(() => {
    if(!date) return false;
    if(!partyId && !partyAdHoc.trim()) return false;
    if(items.length === 0) return false;
    /* Every line must have description + valid amount */
    for(const it of items){
      if(!it.description.trim()) return false;
      if(!(Number(it.unitPrice)>0)) return false;
      if(!(Number(it.qty)>0)) return false;
    }
    return true;
  }, [date, partyId, partyAdHoc, items]);

  const save = async () => {
    if(!canSave) return;
    /* Resolve accountName for each line */
    const itemsWithNames = items.map(it => {
      const acc = it.accountId ? coa.find(a => a.id === it.accountId) : null;
      return {
        description: it.description,
        qty: Number(it.qty)||1,
        unitPrice: Number(it.unitPrice)||0,
        accountId: it.accountId || "",
        accountName: acc ? (acc.code+" — "+acc.name) : "",
      };
    });
    const payload = {
      date,
      [isSales?"customerId":"supplierId"]: partyId || null,
      [isSales?"customerNameAdHoc":"supplierNameAdHoc"]: partyId ? "" : partyAdHoc.trim(),
      items: itemsWithNames,
      discountPct: Number(discountPct)||0,
      notes,
    };
    upConfig(d => {
      const inv = isSales
        ? buildSalesServiceInvoice(d, payload, userName)
        : buildPurchaseServiceInvoice(d, payload, userName);
      const key = isSales ? "salesInvoices" : "purchaseInvoices";
      if(!Array.isArray(d[key])) d[key] = [];
      d[key].push(inv);
    });
    showToast("✓ تم حفظ فاتورة الخدمات (مسودة)");
    onClose();
  };

  const partyLabel = isSales ? "العميل" : "المورد";
  const titleColor = isSales ? T.accent : "#8B5CF6";
  const titleEmoji = isSales ? "🛠" : "🛠";

  return <div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:9000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={(e)=>{if(e.target===e.currentTarget)onClose()}}>
    <div style={{background:T.bg,borderRadius:14,maxWidth:900,width:"100%",maxHeight:"92vh",overflow:"auto",border:"2px solid "+titleColor+"30",boxShadow:"0 25px 70px rgba(0,0,0,0.4)"}}>
      {/* Header */}
      <div style={{position:"sticky",top:0,background:T.bg,padding:"14px 18px",borderBottom:"1px solid "+T.brd,display:"flex",justifyContent:"space-between",alignItems:"center",zIndex:1}}>
        <div>
          <div style={{fontSize:FS+3,fontWeight:900,color:titleColor}}>
            {titleEmoji} فاتورة خدمات {isSales?"(مبيعات)":"(مشتريات)"}
          </div>
          <div style={{fontSize:FS-2,color:T.textSec,marginTop:2}}>للخدمات اللي مش بتدخل المخزن: شحن، صيانة، استشارات، إيجار، إلخ.</div>
        </div>
        <Btn ghost onClick={onClose}>✕</Btn>
      </div>

      <div style={{padding:18,display:"flex",flexDirection:"column",gap:14}}>
        {/* Date + Party */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:12}}>
          <div>
            <label style={{fontSize:FS-2,color:T.textSec,fontWeight:700}}>التاريخ *</label>
            <Inp type="date" value={date} onChange={setDate}/>
          </div>
          <div>
            <label style={{fontSize:FS-2,color:T.textSec,fontWeight:700}}>{partyLabel} *</label>
            <Sel value={partyId} onChange={(v)=>{setPartyId(v); if(v)setPartyAdHoc("")}}>
              <option value="">— اختر من القائمة أو اكتب اسم عابر —</option>
              {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Sel>
            {!partyId && <div style={{marginTop:6}}>
              <Inp value={partyAdHoc} onChange={setPartyAdHoc} placeholder={"أو اكتب اسم "+partyLabel+" يدوياً (لطرف عابر)"}/>
            </div>}
          </div>
        </div>

        {/* Items table */}
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <label style={{fontSize:FS-1,color:T.text,fontWeight:800}}>البنود</label>
            <Btn small onClick={addLine} style={{background:titleColor+"15",color:titleColor,border:"1px solid "+titleColor+"30"}}>➕ إضافة بند</Btn>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {items.map((it, idx) => (
              <div key={it.id} style={{padding:10,borderRadius:10,background:T.cardSolid,border:"1px solid "+T.brd}}>
                <div style={{display:"grid",gridTemplateColumns:"30px 1fr 80px 110px 110px 30px",gap:8,alignItems:"center"}}>
                  <div style={{fontSize:FS-2,color:T.textMut,fontWeight:700,textAlign:"center"}}>{idx+1}</div>
                  <Inp value={it.description} onChange={(v)=>updLine(it.id,"description",v)} placeholder="وصف الخدمة (مثال: شحن للإسكندرية)"/>
                  <Inp type="number" value={it.qty} onChange={(v)=>updLine(it.id,"qty",v)} placeholder="الكمية"/>
                  <Inp type="number" value={it.unitPrice} onChange={(v)=>updLine(it.id,"unitPrice",v)} placeholder="السعر"/>
                  <div style={{padding:"6px 8px",borderRadius:6,background:T.bg,border:"1px solid "+T.brd,fontSize:FS-1,fontWeight:700,textAlign:"center",color:T.text}}>
                    {fmt((Number(it.qty)||1)*(Number(it.unitPrice)||0))}
                  </div>
                  <Btn small ghost onClick={()=>removeLine(it.id)} style={{color:T.err}} title="حذف البند">✕</Btn>
                </div>
                {/* Account selector — optional */}
                <div style={{marginTop:6,display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:FS-2,color:T.textMut,whiteSpace:"nowrap"}}>الحساب المحاسبي (اختياري):</span>
                  <div style={{flex:1}}>
                    <AccountSelector
                      value={it.accountId}
                      onChange={(id)=>updLine(it.id,"accountId",id)}
                      coa={coa}
                      T={T}
                      FS={FS-1}
                      placeholder={isSales?"اختر حساب إيراد...":"اختر حساب مصروف..."}
                      filterType={isSales?"income":"expense"}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Totals */}
        <div style={{padding:12,borderRadius:10,background:titleColor+"08",border:"1px solid "+titleColor+"20"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,alignItems:"center"}}>
            <div>
              <label style={{fontSize:FS-2,color:T.textSec,fontWeight:700}}>نسبة الخصم %</label>
              <Inp type="number" value={discountPct} onChange={setDiscountPct} placeholder="0"/>
            </div>
            <div style={{textAlign:"end"}}>
              <div style={{fontSize:FS-2,color:T.textSec}}>إجمالي البنود: <b style={{color:T.text}}>{fmt(subtotal)}</b></div>
              {discount>0&&<div style={{fontSize:FS-2,color:T.textSec}}>خصم: <b style={{color:T.err}}>−{fmt(discount)}</b></div>}
              <div style={{fontSize:FS+3,fontWeight:900,color:titleColor,marginTop:4}}>{fmt(total)} ج</div>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label style={{fontSize:FS-2,color:T.textSec,fontWeight:700}}>ملاحظات</label>
          <Inp value={notes} onChange={setNotes} placeholder="ملاحظات اختيارية..."/>
        </div>

        {/* Actions */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,paddingTop:10,borderTop:"1px solid "+T.brd}}>
          <div style={{fontSize:FS-2,color:T.textSec}}>
            ⓘ هتُحفظ كـ<b>مسودة</b>. الترحيل المحاسبي يحصل لما تضغط "ترحيل" من قائمة الفواتير.
          </div>
          <div style={{display:"flex",gap:8}}>
            <Btn ghost onClick={onClose}>إلغاء</Btn>
            <Btn onClick={save} disabled={!canSave} style={{background:canSave?titleColor:T.brd,color:"#fff",fontWeight:700,opacity:canSave?1:0.5}}>💾 حفظ</Btn>
          </div>
        </div>
      </div>
    </div>
  </div>;
}
