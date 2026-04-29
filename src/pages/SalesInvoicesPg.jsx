/* ═══════════════════════════════════════════════════════════════════════
   CLARK · SalesInvoicesPg (V18.49)
   ───────────────────────────────────────────────────────────────────────
   Lists all sales invoices with filtering by date / customer / status.
   Click an invoice to see details. Supports posting drafts and voiding
   posted invoices.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { Btn, Card, Inp, Sel } from "../components/ui.jsx";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { fmt } from "../utils/format.js";
import { ask, showToast } from "../utils/popups.js";
import {
  postInvoiceMutator, voidInvoiceMutator, deleteDraftInvoiceMutator,
  getInvoiceStats, buildSalesInvoiceFromDelivery, findInvoiceByDelivery,
} from "../utils/invoices.js";
import { autoPost } from "../utils/accounting/autoPost.js";
import { printInvoice } from "../utils/printInvoice.js";

const STATUS_META = {
  draft:  { label: "مسودة",  color: "#6B7280", bg: "#6B728015" },
  posted: { label: "مرحّل",  color: "#10B981", bg: "#10B98115" },
  void:   { label: "ملغية",  color: "#EF4444", bg: "#EF444415" },
};

export function SalesInvoicesPg({data, upConfig, isMob, user}){
  const today = new Date().toISOString().split("T")[0];
  const monthStart = today.slice(0,7) + "-01";
  const [from, setFrom]   = useState(monthStart);
  const [to, setTo]       = useState(today);
  const [status, setStatus] = useState("all");
  const [partyId, setPartyId] = useState("");
  const [search, setSearch]   = useState("");
  const [activeInvoice, setActiveInvoice] = useState(null);

  const invoices = data.salesInvoices || [];
  const customers = data.customers || [];
  const userName = user?.displayName || (user?.email||"").split("@")[0] || "";

  /* Filter invoices */
  const filtered = useMemo(() => {
    let list = invoices;
    if(from) list = list.filter(i => (i.date||"") >= from);
    if(to)   list = list.filter(i => (i.date||"") <= to);
    if(status !== "all") list = list.filter(i => i.status === status);
    if(partyId) list = list.filter(i => i.customerId === partyId);
    if(search.trim()){
      const q = search.trim().toLowerCase();
      list = list.filter(i =>
        (i.invoiceNo||"").toLowerCase().includes(q) ||
        (i.customerName||"").toLowerCase().includes(q)
      );
    }
    return list.slice().sort((a,b) => (b.date||"").localeCompare(a.date||"") || (b.invoiceNo||"").localeCompare(a.invoiceNo||""));
  }, [invoices, from, to, status, partyId, search]);

  const stats = useMemo(() => getInvoiceStats(data, "sales", {from, to, partyId, status}), [data, from, to, partyId, status]);

  const handlePost = async (inv) => {
    if(!await ask("ترحيل الفاتورة", "ترحيل الفاتورة "+inv.invoiceNo+" بمبلغ "+fmt(inv.total.toFixed(2))+"؟\n\nسيتم إنشاء قيد محاسبي تلقائياً.", {confirmText:"ترحيل"})) return;
    /* V18.50: First update status to posted, then trigger auto-post.
       The auto-post reads the invoice's posted state, so the status must
       be persisted first via upConfig. */
    const customer = (data.customers||[]).find(c => c.id === inv.customerId);
    const orderId = inv.deliveryRef && inv.deliveryRef.orderId;
    const order = orderId ? (data.orders||[]).find(o => o.id === orderId) : null;

    upConfig(d => { postInvoiceMutator(d, inv.id, "sales", userName); });

    /* Build the posted invoice object for auto-post (status is now "posted") */
    const postedInv = {...inv, status:"posted", postedAt: new Date().toISOString(), postedBy: userName};
    autoPost.salesInvoicePosted(data, postedInv, customer, order, userName).then(res => {
      /* Persist the journal ref back onto the invoice */
      if(res && res.main && res.main.ok && res.main.entry){
        upConfig(d => {
          const idx = (d.salesInvoices||[]).findIndex(i => i.id === inv.id);
          if(idx >= 0){
            d.salesInvoices[idx].postedJournalRef = {
              date: res.main.entry.date,
              entryId: res.main.entry.id,
              refNo: res.main.entry.refNo,
            };
          }
        });
      }
    }).catch(e => console.warn("[salesInvoicePosted] failed:", e));
    showToast("✓ تم الترحيل");
    setActiveInvoice(null);
  };
  const handleVoid = async (inv) => {
    if(!await ask("إلغاء الفاتورة", "إلغاء الفاتورة "+inv.invoiceNo+"؟\n\nسيتم إنشاء قيد عكسي للقيد الأصلي.", {danger:true,confirmText:"إلغاء الفاتورة"})) return;
    upConfig(d => { voidInvoiceMutator(d, inv.id, "sales", userName, "إلغاء يدوي"); });
    /* Reverse the journal entries (main + cogs) */
    if(inv.postedJournalRef){
      autoPost.invoiceVoided(data, inv, "salesInvoice", userName).catch(e => console.warn("[void main] failed:", e));
      autoPost.invoiceVoided(data, inv, "salesInvoiceCogs", userName).catch(e => console.warn("[void cogs] failed:", e));
    }
    showToast("✓ تم الإلغاء");
    setActiveInvoice(null);
  };
  const handleDelete = async (inv) => {
    if(!await ask("حذف المسودة", "حذف مسودة الفاتورة "+inv.invoiceNo+"؟", {danger:true,confirmText:"حذف"})) return;
    upConfig(d => { deleteDraftInvoiceMutator(d, inv.id, "sales"); });
    showToast("✓ تم الحذف");
    setActiveInvoice(null);
  };

  /* V18.49: Compute uninvoiced deliveries.
     Goes through every order's customerDeliveries[] and finds entries that
     don't yet have a corresponding invoice (matched by sessionId+orderId+custId). */
  const uninvoicedDeliveries = useMemo(() => {
    const orders = data.orders || [];
    const out = [];
    orders.forEach(o => {
      (o.customerDeliveries || []).forEach(del => {
        const existing = findInvoiceByDelivery(data, del.sessionId||null, o.id, del.custId);
        if(!existing && (Number(del.qty)||0) > 0){
          out.push({ delivery: del, order: o });
        }
      });
    });
    return out;
  }, [data, invoices]);

  const handleBulkCreate = async () => {
    if(uninvoicedDeliveries.length === 0){
      showToast("لا توجد تسليمات بدون فواتير");
      return;
    }
    if(!await ask("إنشاء فواتير جماعية",
      "سيتم إنشاء "+uninvoicedDeliveries.length+" فاتورة مسودة لكل التسليمات اللي لسه ما ليهاش فواتير.\n\nالفواتير ستكون بحالة 'مسودة' وممكن تراجعها وترحلها بعدين.",
      {confirmText:"إنشاء"})) return;
    upConfig(d => {
      if(!Array.isArray(d.salesInvoices)) d.salesInvoices = [];
      uninvoicedDeliveries.forEach(({delivery, order}) => {
        const customer = (d.customers||[]).find(c => c.id === delivery.custId);
        const inv = buildSalesInvoiceFromDelivery(d, delivery, order, customer, userName);
        d.salesInvoices.unshift(inv);
      });
    });
    showToast("✓ تم إنشاء "+uninvoicedDeliveries.length+" فاتورة مسودة");
  };

  return <div style={{padding:isMob?12:20, maxWidth:1400, margin:"0 auto"}}>
    {/* Header */}
    <div style={{display:"flex", alignItems:"center", gap:12, marginBottom:16, flexWrap:"wrap"}}>
      <span style={{fontSize:isMob?22:28}}>📄</span>
      <div style={{flex:1, minWidth:200}}>
        <div style={{fontSize:isMob?18:22, fontWeight:800, color:T.text}}>فواتير المبيعات</div>
        <div style={{fontSize:FS-2, color:T.textSec}}>عرض وإدارة فواتير المبيعات (مسودة / مرحّل / ملغية)</div>
      </div>
      {uninvoicedDeliveries.length > 0 && <Btn primary onClick={handleBulkCreate} style={{background:"#10B981",color:"#fff",border:"none",fontWeight:800}}>
        ➕ إنشاء فواتير من {uninvoicedDeliveries.length} تسليم
      </Btn>}
    </div>

    {/* Stats cards */}
    <div style={{display:"grid", gridTemplateColumns:isMob?"repeat(2,1fr)":"repeat(4,1fr)", gap:8, marginBottom:14}}>
      <div style={{padding:10, background:T.cardSolid, borderRadius:8, border:"1px solid "+T.brd, textAlign:"center"}}>
        <div style={{fontSize:FS-3, color:T.textSec, fontWeight:600}}>إجمالي</div>
        <div style={{fontSize:FS+4, fontWeight:800, color:T.text}}>{stats.total}</div>
      </div>
      <div style={{padding:10, background:STATUS_META.draft.bg, borderRadius:8, border:"1px solid "+STATUS_META.draft.color+"40", textAlign:"center"}}>
        <div style={{fontSize:FS-3, color:STATUS_META.draft.color, fontWeight:600}}>مسودة</div>
        <div style={{fontSize:FS+2, fontWeight:800, color:STATUS_META.draft.color}}>{stats.draftCount}</div>
        <div style={{fontSize:FS-3, color:T.textMut, direction:"ltr"}}>{fmt(stats.draftAmount.toFixed(0))}</div>
      </div>
      <div style={{padding:10, background:STATUS_META.posted.bg, borderRadius:8, border:"1px solid "+STATUS_META.posted.color+"40", textAlign:"center"}}>
        <div style={{fontSize:FS-3, color:STATUS_META.posted.color, fontWeight:600}}>مرحّل</div>
        <div style={{fontSize:FS+2, fontWeight:800, color:STATUS_META.posted.color}}>{stats.postedCount}</div>
        <div style={{fontSize:FS-3, color:T.textMut, direction:"ltr"}}>{fmt(stats.postedAmount.toFixed(0))}</div>
      </div>
      <div style={{padding:10, background:STATUS_META.void.bg, borderRadius:8, border:"1px solid "+STATUS_META.void.color+"40", textAlign:"center"}}>
        <div style={{fontSize:FS-3, color:STATUS_META.void.color, fontWeight:600}}>ملغية</div>
        <div style={{fontSize:FS+2, fontWeight:800, color:STATUS_META.void.color}}>{stats.voidCount}</div>
      </div>
    </div>

    {/* Filters */}
    <Card style={{marginBottom:14}}>
      <div style={{display:"grid", gridTemplateColumns:isMob?"1fr 1fr":"repeat(5,1fr)", gap:8, alignItems:"end"}}>
        <div>
          <label style={{fontSize:FS-3, color:T.textSec, fontWeight:600, display:"block", marginBottom:3}}>من تاريخ</label>
          <Inp type="date" value={from} onChange={setFrom}/>
        </div>
        <div>
          <label style={{fontSize:FS-3, color:T.textSec, fontWeight:600, display:"block", marginBottom:3}}>إلى تاريخ</label>
          <Inp type="date" value={to} onChange={setTo}/>
        </div>
        <div>
          <label style={{fontSize:FS-3, color:T.textSec, fontWeight:600, display:"block", marginBottom:3}}>الحالة</label>
          <Sel value={status} onChange={setStatus}>
            <option value="all">الكل</option>
            <option value="draft">مسودة</option>
            <option value="posted">مرحّل</option>
            <option value="void">ملغية</option>
          </Sel>
        </div>
        <div>
          <label style={{fontSize:FS-3, color:T.textSec, fontWeight:600, display:"block", marginBottom:3}}>العميل</label>
          <Sel value={partyId} onChange={setPartyId}>
            <option value="">كل العملاء</option>
            {customers.filter(c => !c.archived).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Sel>
        </div>
        <div style={{gridColumn: isMob ? "1/3" : "auto"}}>
          <label style={{fontSize:FS-3, color:T.textSec, fontWeight:600, display:"block", marginBottom:3}}>بحث</label>
          <Inp value={search} onChange={setSearch} placeholder="رقم فاتورة / اسم عميل..."/>
        </div>
      </div>
    </Card>

    {/* Invoice list */}
    {filtered.length === 0 ? <Card>
      <div style={{padding:30, textAlign:"center", color:T.textMut, fontSize:FS-1}}>
        💡 لا توجد فواتير في هذه الفترة. لإنشاء فواتير، روح صفحة <b>تسليم العملاء</b> واضغط "تحويل لفاتورة" داخل التسليمات.
      </div>
    </Card>
      : <div style={{display:"flex", flexDirection:"column", gap:6}}>
        {filtered.map(inv => {
          const meta = STATUS_META[inv.status] || STATUS_META.draft;
          return <div key={inv.id} onClick={() => setActiveInvoice(inv)} style={{
            background: T.cardSolid, border:"1px solid "+T.brd, borderRadius:8,
            padding:"10px 12px", cursor:"pointer", display:"flex", alignItems:"center", gap:10, flexWrap:"wrap"
          }} onMouseEnter={e => e.currentTarget.style.background = T.bg}
             onMouseLeave={e => e.currentTarget.style.background = T.cardSolid}>
            <div style={{minWidth: isMob?100:140}}>
              <div style={{fontFamily:"monospace", fontSize:FS-1, fontWeight:800, color:T.accent}}>{inv.invoiceNo}</div>
              <div style={{fontSize:FS-3, color:T.textMut, fontFamily:"monospace"}}>{inv.date}</div>
            </div>
            <div style={{flex:1, minWidth:120}}>
              <div style={{fontSize:FS-1, fontWeight:700, color:T.text}}>{inv.customerName}</div>
              <div style={{fontSize:FS-3, color:T.textSec}}>{inv.items.length} بند • {inv.items.reduce((s,it)=>s+it.qty,0)} قطعة</div>
            </div>
            <div style={{textAlign:"left", direction:"ltr", minWidth:100}}>
              <div style={{fontSize:FS, fontWeight:800, color:T.text}}>{fmt(inv.total.toFixed(2))}</div>
              {inv.discount > 0 && <div style={{fontSize:FS-3, color:T.textMut}}>خصم {fmt(inv.discount.toFixed(0))}</div>}
            </div>
            <span style={{padding:"4px 10px", borderRadius:6, fontSize:FS-2, fontWeight:700, background:meta.bg, color:meta.color, border:"1px solid "+meta.color+"30"}}>{meta.label}</span>
          </div>;
        })}
      </div>}

    {/* Invoice detail modal */}
    {activeInvoice && <InvoiceDetailModal
      invoice={activeInvoice} type="sales"
      data={data}
      onClose={() => setActiveInvoice(null)}
      onPost={handlePost} onVoid={handleVoid} onDelete={handleDelete}
      isMob={isMob}
    />}
  </div>;
}

/* ═══ Invoice Detail Modal ═══
   Used for both sales and purchase invoices (type prop). */
export function InvoiceDetailModal({invoice, type, data, onClose, onPost, onVoid, onDelete, isMob}){
  const meta = STATUS_META[invoice.status] || STATUS_META.draft;
  const isPurchase = type === "purchase";
  const partyName = isPurchase ? invoice.supplierName : invoice.customerName;

  return <div style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.65)", zIndex:10001, display:"flex", alignItems:"center", justifyContent:"center", padding:16}} onClick={onClose}>
    <div onClick={e => e.stopPropagation()} style={{
      background:T.cardSolid, borderRadius:14, padding:isMob?16:24,
      width:"100%", maxWidth:800, maxHeight:"90vh", overflowY:"auto",
      border:"1px solid "+T.brd, boxShadow:"0 25px 70px rgba(0,0,0,0.4)"
    }}>
      {/* Header */}
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16, paddingBottom:12, borderBottom:"2px solid "+T.brd, gap:10, flexWrap:"wrap"}}>
        <div>
          <div style={{display:"flex", alignItems:"center", gap:10, flexWrap:"wrap"}}>
            <span style={{fontSize:24}}>{isPurchase?"📥":"📤"}</span>
            <div>
              <div style={{fontSize:FS-1, color:T.textSec, fontWeight:600}}>{isPurchase?"فاتورة مشتريات":"فاتورة مبيعات"}</div>
              <div style={{fontFamily:"monospace", fontSize:FS+4, fontWeight:800, color:T.accent}}>{invoice.invoiceNo}</div>
            </div>
          </div>
        </div>
        <span style={{padding:"6px 14px", borderRadius:8, fontSize:FS, fontWeight:800, background:meta.bg, color:meta.color, border:"2px solid "+meta.color+"40"}}>{meta.label}</span>
      </div>

      {/* Header info */}
      <div style={{display:"grid", gridTemplateColumns:isMob?"1fr 1fr":"repeat(3,1fr)", gap:8, marginBottom:14}}>
        <div style={{padding:8, background:T.bg, borderRadius:6}}>
          <div style={{fontSize:FS-3, color:T.textSec, fontWeight:600}}>{isPurchase?"المورد":"العميل"}</div>
          <div style={{fontSize:FS-1, fontWeight:700, color:T.text}}>{partyName}</div>
        </div>
        <div style={{padding:8, background:T.bg, borderRadius:6}}>
          <div style={{fontSize:FS-3, color:T.textSec, fontWeight:600}}>التاريخ</div>
          <div style={{fontSize:FS-1, fontWeight:700, color:T.text, fontFamily:"monospace"}}>{invoice.date}</div>
        </div>
        <div style={{padding:8, background:T.bg, borderRadius:6, gridColumn: isMob?"1/3":"auto"}}>
          <div style={{fontSize:FS-3, color:T.textSec, fontWeight:600}}>أنشأها</div>
          <div style={{fontSize:FS-1, fontWeight:700, color:T.text}}>{invoice.createdBy||"—"}</div>
        </div>
      </div>

      {/* Items table */}
      <div style={{border:"1px solid "+T.brd, borderRadius:8, overflow:"hidden", marginBottom:14}}>
        <table style={{width:"100%", borderCollapse:"collapse", fontSize:FS-1}}>
          <thead>
            <tr style={{background:T.accent+"08"}}>
              <th style={{padding:"8px 10px", textAlign:"right", color:T.textSec, fontWeight:800, fontSize:FS-2, borderBottom:"2px solid "+T.brd}}>الصنف</th>
              <th style={{padding:"8px 10px", textAlign:"center", color:T.textSec, fontWeight:800, fontSize:FS-2, borderBottom:"2px solid "+T.brd, width:80}}>الكمية</th>
              <th style={{padding:"8px 10px", textAlign:"center", color:T.textSec, fontWeight:800, fontSize:FS-2, borderBottom:"2px solid "+T.brd, width:100}}>السعر</th>
              <th style={{padding:"8px 10px", textAlign:"center", color:T.textSec, fontWeight:800, fontSize:FS-2, borderBottom:"2px solid "+T.brd, width:120}}>الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {(invoice.items||[]).map((it,i) => <tr key={i} style={{borderTop:"1px solid "+T.brd}}>
              <td style={{padding:"8px 10px"}}>
                <div style={{fontWeight:700, color:T.text}}>{isPurchase ? it.name : (it.modelNo||"—")}</div>
                {!isPurchase && it.modelDesc && <div style={{fontSize:FS-3, color:T.textMut}}>{it.modelDesc}</div>}
              </td>
              <td style={{padding:"8px 10px", textAlign:"center", direction:"ltr", fontWeight:600}}>{fmt(it.qty)}</td>
              <td style={{padding:"8px 10px", textAlign:"center", direction:"ltr", color:T.textSec}}>{fmt(it.unitPrice.toFixed(2))}</td>
              <td style={{padding:"8px 10px", textAlign:"center", direction:"ltr", fontWeight:800, color:T.text}}>{fmt(it.lineTotal.toFixed(2))}</td>
            </tr>)}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div style={{display:"flex", justifyContent:"flex-end", marginBottom:14}}>
        <div style={{minWidth:280, padding:12, background:T.bg, borderRadius:8, border:"1px solid "+T.brd}}>
          <div style={{display:"flex", justifyContent:"space-between", padding:"4px 0", fontSize:FS-1}}>
            <span style={{color:T.textSec}}>الإجمالي قبل الخصم</span>
            <span style={{fontWeight:700, direction:"ltr"}}>{fmt(invoice.subtotal.toFixed(2))}</span>
          </div>
          {invoice.discount > 0 && <div style={{display:"flex", justifyContent:"space-between", padding:"4px 0", fontSize:FS-1, color:T.err}}>
            <span>الخصم {invoice.discountPct?(`(${invoice.discountPct.toFixed(1)}%)`):""}</span>
            <span style={{fontWeight:700, direction:"ltr"}}>-{fmt(invoice.discount.toFixed(2))}</span>
          </div>}
          <div style={{display:"flex", justifyContent:"space-between", padding:"8px 0", fontSize:FS+2, borderTop:"2px solid "+T.brd, marginTop:6}}>
            <span style={{fontWeight:800, color:T.text}}>الإجمالي المستحق</span>
            <span style={{fontWeight:800, color:T.accent, direction:"ltr"}}>{fmt(invoice.total.toFixed(2))}</span>
          </div>
        </div>
      </div>

      {/* Notes */}
      {invoice.notes && <div style={{padding:10, background:T.bg, borderRadius:6, marginBottom:14, fontSize:FS-1}}>
        <div style={{fontSize:FS-3, color:T.textSec, fontWeight:600, marginBottom:4}}>ملاحظات</div>
        <div style={{whiteSpace:"pre-wrap"}}>{invoice.notes}</div>
      </div>}

      {/* Status timeline */}
      <div style={{padding:10, background:T.bg, borderRadius:6, marginBottom:14, fontSize:FS-2}}>
        <div style={{display:"flex", flexDirection:"column", gap:4}}>
          <div>📝 أُنشئت: <b>{(invoice.createdAt||"").split("T")[0]}</b> {invoice.createdBy && <>بواسطة <b>{invoice.createdBy}</b></>}</div>
          {invoice.postedAt && <div>✅ مُرحّلة: <b>{invoice.postedAt.split("T")[0]}</b> {invoice.postedBy && <>بواسطة <b>{invoice.postedBy}</b></>}</div>}
          {invoice.voidedAt && <div style={{color:T.err}}>❌ مُلغية: <b>{invoice.voidedAt.split("T")[0]}</b> {invoice.voidedBy && <>بواسطة <b>{invoice.voidedBy}</b></>} {invoice.voidReason && <>— {invoice.voidReason}</>}</div>}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{display:"flex", gap:8, justifyContent:"flex-end", flexWrap:"wrap"}}>
        <Btn ghost onClick={onClose}>إغلاق</Btn>
        {/* V18.51: Print button — works in any status */}
        <Btn onClick={() => {
          const partyList = isPurchase ? (data.suppliers||[]) : (data.customers||[]);
          const partyId = isPurchase ? invoice.supplierId : invoice.customerId;
          const party = partyList.find(p => p.id === partyId);
          const factoryInfo = data.factoryInfo || data.businessSettings || {};
          printInvoice(invoice, party, factoryInfo, type);
        }} style={{background:T.accent+"12", color:T.accent, border:"1px solid "+T.accent+"30"}}>🖨️ طباعة</Btn>
        {invoice.status === "draft" && <>
          <Btn onClick={() => onDelete(invoice)} style={{background:T.err+"15", color:T.err, border:"1px solid "+T.err+"40"}}>🗑 حذف المسودة</Btn>
          <Btn primary onClick={() => onPost(invoice)} style={{background:STATUS_META.posted.color, color:"#fff", border:"none"}}>✅ ترحيل</Btn>
        </>}
        {invoice.status === "posted" && <Btn onClick={() => onVoid(invoice)} style={{background:T.err+"15", color:T.err, border:"1px solid "+T.err+"40"}}>❌ إلغاء</Btn>}
      </div>
    </div>
  </div>;
}
