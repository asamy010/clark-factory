/* ═══════════════════════════════════════════════════════════════════════
   CLARK · SalesInvoicesPg (V18.49)
   ───────────────────────────────────────────────────────────────────────
   Lists all sales invoices with filtering by date / customer / status.
   Click an invoice to see details. Supports posting drafts and voiding
   posted invoices.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo, useEffect } from "react";
import { Btn, Card, Inp, Sel } from "../components/ui.jsx";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { fmt } from "../utils/format.js";
import { ask, showToast } from "../utils/popups.js";
import {
  postInvoiceMutator, voidInvoiceMutator, deleteDraftInvoiceMutator,
  getInvoiceStats, buildSalesInvoiceFromDelivery, upsertSalesInvoiceFromDelivery, findInvoiceByDelivery,
} from "../utils/invoices.js";
import { autoPost } from "../utils/accounting/autoPost.js";
import { printInvoice } from "../utils/printInvoice.js";
import { ServiceInvoiceModal } from "../components/ServiceInvoiceModal.jsx";
import { ReviewRequestModal } from "../components/ReviewRequestModal.jsx";
import { ReviewRequestBanner } from "../components/ReviewRequestBanner.jsx";
/* V19.39: Bulk-post toolbar shared with PurchaseInvoicesPg + CreditNotesPg */
import { BulkPostHeader, RowCheckbox, BulkPostBar } from "../components/BulkPostBar.jsx";
/* V19.41: Purchase return picker — opens from a posted purchase invoice */
import { PurchaseReturnPickerModal } from "../components/PurchaseReturnPickerModal.jsx";
/* V21.10.3 — Slice 4: pay from invoice (sales + purchase via shared modal) */
import { recordInvoicePaymentMutator, computeInvoiceBalance } from "../utils/sales/invoicePayments.js";
import { recordPurchaseInvoicePaymentMutator, computePurchaseInvoiceBalance } from "../utils/purchase/invoicePayments.js";

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
  /* V18.85: Service invoice modal */
  const [showServiceModal, setShowServiceModal] = useState(false);
  /* V19.39: Multi-select for bulk posting */
  const [selectedIds, setSelectedIds] = useState(new Set());

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

  /* V18.90: Listen for notification deep-links — open the matching invoice. */
  useEffect(() => {
    const handler = (e) => {
      const d = e?.detail;
      if(!d || d.type !== "invoice" || d.subType !== "sales") return;
      const inv = invoices.find(i => i.id === d.invoiceId);
      if(inv) setActiveInvoice(inv);
    };
    window.addEventListener("notif-deeplink", handler);
    return () => window.removeEventListener("notif-deeplink", handler);
  }, [invoices]);

  const handlePost = async (inv, opts = {}) => {
    /* V19.39: silent mode used by bulk-post bar — skips the per-invoice
       confirmation prompt and toast since the bulk bar shows its own UX. */
    const silent = opts.silent === true;
    if(!silent){
      if(!await ask("ترحيل الفاتورة", "ترحيل الفاتورة "+inv.invoiceNo+" بمبلغ "+fmt(inv.total.toFixed(2))+"؟\n\nسيتم إنشاء قيد محاسبي تلقائياً.", {confirmText:"ترحيل"})) return;
    }
    /* V18.50: First update status to posted, then trigger auto-post.
       The auto-post reads the invoice's posted state, so the status must
       be persisted first via upConfig. */
    const customer = (data.customers||[]).find(c => c.id === inv.customerId);
    const orderId = inv.deliveryRef && inv.deliveryRef.orderId;
    const order = orderId ? (data.orders||[]).find(o => o.id === orderId) : null;

    /* V19.56: AWAIT every write so the bulk-post progress reflects reality.
       Pre-V19.56 these were fire-and-forget — the bulk loop's "await postOne"
       resolved after the optimistic UI update only, while the actual setDocs
       were still queued and flushing slowly. Symptoms reported by user:
       "rest 80 invoices showed posted instantly, but came back as draft after
       5s and trickled away 1-2 at a time over minutes". Now each write is
       awaited so the bulk loop genuinely advances one invoice at a time. */
    try {
      await upConfig(d => { postInvoiceMutator(d, inv.id, "sales", userName); });
      const postedInv = {...inv, status:"posted", postedAt: new Date().toISOString(), postedBy: userName};
      const res = await autoPost.salesInvoicePosted(data, postedInv, customer, order, userName);
      if(res && res.main && res.main.ok && res.main.entry){
        await upConfig(d => {
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
      if(!silent){
        showToast("✓ تم الترحيل");
        setActiveInvoice(null);
      }
    } catch(e){
      /* V19.56: surface the failure to the bulk loop. Pre-V19.56 the .catch
         here swallowed errors silently → loop counted them as success → fake
         "all posted" toast. Now we throw so the loop's catch increments
         failCount and the modal shows accurate ok/fail counts. */
      console.warn("[salesInvoicePost] failed for", inv.invoiceNo, e);
      if(!silent) showToast("⚠ تعذّر ترحيل "+inv.invoiceNo+(e?.message?": "+e.message:""));
      throw e;
    }
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
      uninvoicedDeliveries.forEach(({delivery, order}) => {
        const customer = (d.customers||[]).find(c => c.id === delivery.custId);
        /* V18.65: upsert merges same-day same-customer drafts into one invoice */
        upsertSalesInvoiceFromDelivery(d, delivery, order, customer, userName);
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
      {/* V18.85: Direct service invoice */}
      <Btn onClick={()=>setShowServiceModal(true)} style={{background:T.accent+"15",color:T.accent,border:"1px solid "+T.accent+"40",fontWeight:700}}>
        🛠 فاتورة خدمات
      </Btn>
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
        {/* V19.39: bulk-post header — toggles "select all drafts" */}
        <BulkPostHeader
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          draftItems={filtered.filter(i => i.status === "draft")}
          isMob={isMob}
        />
        {filtered.map(inv => {
          const meta = STATUS_META[inv.status] || STATUS_META.draft;
          const isDraft = inv.status === "draft";
          return <div key={inv.id} onClick={() => setActiveInvoice(inv)} style={{
            background: T.cardSolid, border:"1px solid "+T.brd, borderRadius:8,
            padding:"10px 12px", cursor:"pointer", display:"flex", alignItems:"center", gap:10, flexWrap:"wrap"
          }} onMouseEnter={e => e.currentTarget.style.background = T.bg}
             onMouseLeave={e => e.currentTarget.style.background = T.cardSolid}>
            {/* V19.39: per-row checkbox (only renders for drafts; renders a spacer otherwise) */}
            <RowCheckbox id={inv.id} isDraft={isDraft} selectedIds={selectedIds} setSelectedIds={setSelectedIds}/>
            <div style={{minWidth: isMob?100:140}}>
              <div style={{fontFamily:"monospace", fontSize:FS-1, fontWeight:800, color:T.accent}}>
                {inv.invoiceNo}
                {inv.subtype==="service" && <span style={{marginInlineStart:6,fontSize:FS-3,padding:"1px 5px",borderRadius:4,background:T.accent+"20",color:T.accent,fontWeight:700}}>🛠 خدمات</span>}
              </div>
              <div style={{fontSize:FS-3, color:T.textMut, fontFamily:"monospace"}}>{inv.date}</div>
            </div>
            <div style={{flex:1, minWidth:120}}>
              <div style={{fontSize:FS-1, fontWeight:700, color:T.text}}>{inv.customerName}</div>
              <div style={{fontSize:FS-3, color:T.textSec}}>{inv.items.length} بند{inv.subtype!=="service"?" • "+inv.items.reduce((s,it)=>s+(Number(it.qty)||0),0)+" قطعة":""}</div>
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
      data={data} upConfig={upConfig}
      onClose={() => setActiveInvoice(null)}
      onPost={handlePost} onVoid={handleVoid} onDelete={handleDelete}
      isMob={isMob}
      user={user}
    />}
    {/* V18.85: Service invoice modal */}
    {showServiceModal && <ServiceInvoiceModal
      mode="sales" data={data} upConfig={upConfig} user={user}
      onClose={()=>setShowServiceModal(false)}
    />}
    {/* V19.39: Floating bulk-post bar (only renders when items are selected) */}
    <BulkPostBar
      selectedIds={selectedIds}
      setSelectedIds={setSelectedIds}
      allItems={filtered}
      postOne={handlePost}
      itemLabel="فاتورة"
      isMob={isMob}
    />
  </div>;
}

/* ═══ Invoice Detail Modal ═══
   Used for both sales and purchase invoices (type prop). */
export function InvoiceDetailModal({invoice, type, data, upConfig, onClose, onPost, onVoid, onDelete, isMob, user}){
  const meta = STATUS_META[invoice.status] || STATUS_META.draft;
  const isDraft = invoice.status === "draft";
  const isPurchase = type === "purchase";
  /* V18.90: Review request modal toggle */
  const [showReview, setShowReview] = useState(false);
  /* V19.41: Purchase return picker toggle (only relevant for posted purchase invoices) */
  const [showReturnPicker, setShowReturnPicker] = useState(false);
  /* V21.10.3 — Slice 4: pay-from-invoice modal toggle */
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  /* V18.58: Free discount editor — local state, applied to invoice on change */
  const [discountType, setDiscountType] = useState(invoice.discountType || (invoice.discountPct ? "pct" : "amount"));
  const [discountValue, setDiscountValue] = useState(
    invoice.discountType === "amount" ? invoice.discount :
    (invoice.discountPct || 0)
  );

  /* Recompute totals from current discount inputs.
     V19.63: clamp at zero — pre-V19.63 a negative discountValue (typed `-50` or pasted)
     produced a negative discount → total = subtotal - (-x) = inflated total → overcharge. */
  const computedDiscount = useMemo(() => {
    const sub = Number(invoice.subtotal) || 0;
    const v = Math.max(0, Number(discountValue) || 0);
    if(discountType === "pct"){
      return Math.min(sub * v / 100, sub);/* clamp at subtotal */
    } else {
      return Math.min(v, sub);/* clamp at subtotal */
    }
  }, [invoice.subtotal, discountType, discountValue]);
  const computedTotal = (Number(invoice.subtotal) || 0) - computedDiscount;

  /* Save discount change back to the invoice (only when draft) */
  const saveDiscountChange = () => {
    if(!isDraft || !upConfig) return;
    const listKey = isPurchase ? "purchaseInvoices" : "salesInvoices";
    upConfig(d => {
      if(!Array.isArray(d[listKey])) return;
      const idx = d[listKey].findIndex(i => i.id === invoice.id);
      if(idx < 0) return;
      const v = Math.max(0, Number(discountValue) || 0);/* V19.63: clamp negative input */
      d[listKey][idx] = {
        ...d[listKey][idx],
        discountType,
        discountValue: v,
        discountPct: discountType === "pct" ? v : 0,
        discount: computedDiscount,
        total: computedTotal,
      };
    });
  };
  /* Apply on change with debounce-like effect */
  useEffect(() => {
    if(isDraft && upConfig){
      const t = setTimeout(saveDiscountChange, 300);
      return () => clearTimeout(t);
    }
  /* eslint-disable-next-line */
  }, [discountType, discountValue]);
  const partyName = isPurchase ? invoice.supplierName : invoice.customerName;

  return <div style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.65)", zIndex:10001, display:"flex", alignItems:"center", justifyContent:"center", padding:16}} onClick={onClose}>
    <div onClick={e => e.stopPropagation()} style={{
      background:T.cardSolid, borderRadius:14, padding:isMob?16:24,
      width:"100%", maxWidth:800, maxHeight:"90vh", overflowY:"auto",
      border:"1px solid "+T.brd, boxShadow:"0 25px 70px rgba(0,0,0,0.4)"
    }}>
      {/* V18.94: Review-request banner — visible only to the sender if there's an active request */}
      <ReviewRequestBanner
        linkType="invoice"
        linkId={invoice.id}
        linkSubType={type}
        data={data} upConfig={upConfig} user={user}
      />
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
                <div style={{fontWeight:700, color:T.text}}>{invoice.subtype==="service" ? (it.description||"—") : (isPurchase ? it.name : (it.modelNo||"—"))}</div>
                {invoice.subtype!=="service" && !isPurchase && it.modelDesc && <div style={{fontSize:FS-3, color:T.textMut}}>{it.modelDesc}</div>}
                {invoice.subtype==="service" && it.accountName && <div style={{fontSize:FS-3, color:T.textMut}}>📊 {it.accountName}</div>}
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
        <div style={{minWidth:300, padding:12, background:T.bg, borderRadius:8, border:"1px solid "+T.brd}}>
          <div style={{display:"flex", justifyContent:"space-between", padding:"4px 0", fontSize:FS-1}}>
            <span style={{color:T.textSec}}>الإجمالي قبل الخصم</span>
            <span style={{fontWeight:700, direction:"ltr"}}>{fmt(invoice.subtotal.toFixed(2))}</span>
          </div>
          {/* V18.58: Free discount editor (only editable on draft) */}
          {isDraft && upConfig ? <div style={{padding:"6px 0", borderTop:"1px dashed "+T.brd, marginTop:6}}>
            <div style={{fontSize:FS-3, color:T.textSec, fontWeight:600, marginBottom:4}}>الخصم</div>
            <div style={{display:"flex", gap:6, alignItems:"center"}}>
              <select value={discountType} onChange={e=>setDiscountType(e.target.value)} style={{padding:"4px 6px", fontSize:FS-2, borderRadius:6, border:"1px solid "+T.brd, background:T.cardSolid, color:T.text, fontFamily:"inherit"}}>
                <option value="pct">%</option>
                <option value="amount">ج.م</option>
              </select>
              <input type="number" value={discountValue} onChange={e=>setDiscountValue(e.target.value)}
                style={{flex:1, padding:"4px 8px", fontSize:FS-1, borderRadius:6, border:"1px solid "+T.brd, background:T.cardSolid, color:T.text, fontFamily:"inherit", direction:"ltr", textAlign:"left"}}
                placeholder="0"/>
              <span style={{fontSize:FS-2, color:T.err, fontWeight:700, direction:"ltr", minWidth:80, textAlign:"left"}}>-{fmt(computedDiscount.toFixed(2))}</span>
            </div>
          </div> : (invoice.discount > 0 && <div style={{display:"flex", justifyContent:"space-between", padding:"4px 0", fontSize:FS-1, color:T.err}}>
            <span>الخصم {invoice.discountType==="pct" && invoice.discountValue ? "("+Number(invoice.discountValue).toFixed(1)+"%)" : invoice.discountPct ? "("+invoice.discountPct.toFixed(1)+"%)" : ""}</span>
            <span style={{fontWeight:700, direction:"ltr"}}>-{fmt(invoice.discount.toFixed(2))}</span>
          </div>)}
          <div style={{display:"flex", justifyContent:"space-between", padding:"8px 0", fontSize:FS+2, borderTop:"2px solid "+T.brd, marginTop:6}}>
            <span style={{fontWeight:800, color:T.text}}>الإجمالي المستحق</span>
            <span style={{fontWeight:800, color:T.accent, direction:"ltr"}}>{fmt((isDraft ? computedTotal : invoice.total).toFixed(2))}</span>
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
        {/* V18.90: Request review */}
        <Btn onClick={() => setShowReview(true)} style={{background:"#8B5CF615", color:"#8B5CF6", border:"1px solid #8B5CF640"}}>📌 طلب مراجعة</Btn>
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
        {/* V19.41: Return-to-supplier — only for POSTED purchase invoices.
            Voiding a whole invoice would reverse all goods; this lets the user
            return only specific items/qtys, which is the common case (damaged
            on receipt, partial spec mismatch, etc.) */}
        {invoice.status === "posted" && isPurchase && (invoice.subtype !== "service") && (
          <Btn onClick={() => setShowReturnPicker(true)}
               style={{background:"#3B82F615", color:"#3B82F6", border:"1px solid #3B82F640", fontWeight:700}}>
            ↪️ ارتجاع للمورد
          </Btn>
        )}
        {/* V21.10.3+V21.10.6 — Slice 4+9: pay from invoice (sales OR purchase, posted, balance > 0) */}
        {invoice.status === "posted" && (() => {
          const { balance } = isPurchase
            ? computePurchaseInvoiceBalance(invoice, data.supplierPayments || [])
            : computeInvoiceBalance(invoice, data.custPayments || []);
          return balance > 0.001;
        })() && (
          <Btn onClick={() => setShowPaymentModal(true)} style={{background:"#10B98115", color:"#10B981", border:"1px solid #10B98140", fontWeight:700}}>
            💵 {isPurchase ? "سداد للمورد" : "ادفع"}
          </Btn>
        )}
        {invoice.status === "posted" && <Btn onClick={() => onVoid(invoice)} style={{background:T.err+"15", color:T.err, border:"1px solid "+T.err+"40"}}>❌ إلغاء</Btn>}
      </div>

      {/* V21.10.3 — Payment from invoice modal (works for both sales + purchase) */}
      {showPaymentModal && <PaymentFromInvoiceModal
        invoice={invoice}
        isPurchase={isPurchase}
        data={data}
        upConfig={upConfig}
        user={user}
        onClose={() => setShowPaymentModal(false)}
        onSaved={() => { setShowPaymentModal(false); }}
      />}
    </div>
    {/* V18.90: Review request modal */}
    {showReview && <ReviewRequestModal
      link={{
        type:"invoice",
        id:invoice.id,
        subType:type,
        label:(isPurchase?"فاتورة شراء ":"فاتورة بيع ")+invoice.invoiceNo,
      }}
      defaultMsg={"راجع فاتورة "+invoice.invoiceNo+" من فضلك"}
      data={data} upConfig={upConfig} user={user}
      onClose={()=>setShowReview(false)}
    />}
    {/* V19.41: Purchase return picker. Closing it after a successful create
        also closes the parent invoice modal so the user lands back on the
        list, where they can see the new debit note in the badges (no need
        to navigate to the debit notes tab manually). */}
    {showReturnPicker && isPurchase && (() => {
      const supplier = (data.suppliers||[]).find(s => s.id === invoice.supplierId);
      return <PurchaseReturnPickerModal
        invoice={invoice}
        supplier={supplier}
        data={data}
        upConfig={upConfig}
        user={user}
        isMob={isMob}
        onClose={() => setShowReturnPicker(false)}
        onCreated={() => onClose()}
      />;
    })()}
  </div>;
}

/* ═══════════════════════════════════════════════════════════════════════
   PaymentFromInvoiceModal (V21.10.3 — Slice 4)
   Pay an invoice's outstanding balance in one go. Creates custPayment +
   treasury deposit + updates invoice.paidAmount/balanceDue via the
   recordInvoicePaymentMutator.
   ═══════════════════════════════════════════════════════════════════════ */
function PaymentFromInvoiceModal({ invoice, isPurchase, data, upConfig, user, onClose, onSaved }){
  const userName = user?.displayName || (user?.email||"").split("@")[0] || "";
  /* V21.10.6 — Slice 9: same modal serves both sales AND purchase invoices.
     Compute balance from the appropriate payments array; on save, dispatch
     to the appropriate mutator. */
  const { paid, balance } = isPurchase
    ? computePurchaseInvoiceBalance(invoice, data.supplierPayments || [])
    : computeInvoiceBalance(invoice, data.custPayments || []);
  const treasuryAccounts = data.treasuryAccounts || [];

  const [amount, setAmount] = useState(balance);
  const [method, setMethod] = useState("cash");
  const [treasuryAccountId, setTreasuryAccountId] = useState(treasuryAccounts[0]?.id || "");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await upConfig(d => {
        if(isPurchase){
          recordPurchaseInvoicePaymentMutator(d, {
            invoiceId: invoice.id,
            amount: Number(amount), method, treasuryAccountId, date, notes, userName,
          });
        } else {
          recordInvoicePaymentMutator(d, {
            invoiceId: invoice.id,
            amount: Number(amount), method, treasuryAccountId, date, notes, userName,
          });
        }
      });
      showToast(`✓ تم تسجيل ${isPurchase ? "السداد" : "الدفعة"} ${fmt(amount)} ج.م`);
      onSaved();
    } catch(e){
      alert("⚠️ " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return <div className="pop-overlay" onClick={onClose}
    style={{position:"fixed", inset: 0, background:"rgba(0,0,0,0.5)", zIndex: 99999,
            display:"flex", alignItems:"center", justifyContent:"center", padding: 16}}>
    <div onClick={e => e.stopPropagation()} style={{
      background: T.cardSolid, borderRadius: 16, padding: 20,
      width:"100%", maxWidth: 500, boxShadow:"0 20px 60px rgba(0,0,0,0.3)"
    }}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 12}}>
        <h3 style={{margin: 0, fontSize: FS+3, color:"#10B981"}}>💵 {isPurchase ? "سداد للمورد" : "سداد فاتورة"}</h3>
        <Btn ghost small onClick={onClose}>✕</Btn>
      </div>

      <div style={{background: T.bg, padding: 10, borderRadius: 8, marginBottom: 12, fontSize: FS-1}}>
        <div>الفاتورة: <strong>{invoice.invoiceNo}</strong> — {isPurchase ? invoice.supplierName : invoice.customerName}</div>
        <div>الإجمالي: {fmt(invoice.total)} ج.م</div>
        <div>المدفوع سابقاً: {fmt(paid)} ج.م</div>
        <div style={{fontWeight: 800, color:"#10B981"}}>الرصيد المتبقي: {fmt(balance)} ج.م</div>
      </div>

      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap: 8, marginBottom: 8}}>
        <div>
          <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 600}}>المبلغ *</label>
          <Inp type="number" value={amount} onChange={v => setAmount(Number(v) || 0)}/>
        </div>
        <div>
          <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 600}}>التاريخ</label>
          <Inp type="date" value={date} onChange={setDate}/>
        </div>
      </div>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap: 8, marginBottom: 8}}>
        <div>
          <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 600}}>طريقة الدفع *</label>
          <Sel value={method} onChange={setMethod}>
            <option value="cash">💵 كاش</option>
            <option value="bank">🏦 تحويل بنكي</option>
            <option value="check">📄 شيك</option>
          </Sel>
        </div>
        <div>
          <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 600}}>حساب الخزنة *</label>
          <Sel value={treasuryAccountId} onChange={setTreasuryAccountId}>
            <option value="">— اختر —</option>
            {treasuryAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Sel>
        </div>
      </div>
      <div style={{marginBottom: 12}}>
        <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 600}}>ملاحظات</label>
        <Inp value={notes} onChange={setNotes} placeholder="اختياري..."/>
      </div>

      <div style={{display:"flex", gap: 8, justifyContent:"flex-end"}}>
        <Btn onClick={onClose}>إلغاء</Btn>
        <Btn primary onClick={handleSave} disabled={saving || !(amount > 0) || !treasuryAccountId}
          style={{background:"#10B981", color:"#fff"}}>
          {saving ? "...جاري الحفظ" : "💾 تسجيل الدفعة"}
        </Btn>
      </div>
    </div>
  </div>;
}
