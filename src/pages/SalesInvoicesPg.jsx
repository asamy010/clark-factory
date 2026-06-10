/* ═══════════════════════════════════════════════════════════════════════
   CLARK · SalesInvoicesPg (V18.49)
   ───────────────────────────────────────────────────────────────────────
   Lists all sales invoices with filtering by date / customer / status.
   Click an invoice to see details. Supports posting drafts and voiding
   posted invoices.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo, useEffect } from "react";
import { Btn, Card, Inp, Sel, BlockingOverlay } from "../components/ui.jsx";
import { DocItemsTable } from "../components/DocItemsTable.jsx";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { fmt } from "../utils/format.js";
import { ask, showToast, tell } from "../utils/popups.js";
import {
  postInvoiceMutator, voidInvoiceMutator, deleteDraftInvoiceMutator,
  getInvoiceStats, buildSalesInvoiceFromDelivery, upsertSalesInvoiceFromDelivery, findInvoiceByDelivery,
} from "../utils/invoices.js";
import { autoPost } from "../utils/accounting/autoPost.js";
import { printInvoice } from "../utils/printInvoice.js";
/* V21.10.4 — Payment from invoice (Phase 12d) */
import { recordInvoicePaymentMutator, invoiceBalance } from "../utils/sales/invoicePayments.js";
import { PaymentFromInvoiceModal } from "../components/sales/PaymentFromInvoiceModal.jsx";
import { openSalesDoc } from "../utils/sales/navDoc.js";
import { openPurchaseDoc } from "../utils/purchase/navDoc.js";
import { ServiceInvoiceModal } from "../components/ServiceInvoiceModal.jsx";
/* V21.9.128: Universal Attachments — InvoiceDetailModal is shared by sales + purchase invoice pages.
   The entityType is derived dynamically from invoice.type (sales vs purchase). */
import { AttachmentList } from "../components/attachments/AttachmentList.jsx";
import { ReviewRequestModal } from "../components/ReviewRequestModal.jsx";
import { ReviewRequestBanner } from "../components/ReviewRequestBanner.jsx";
/* V19.39: Bulk-post toolbar shared with PurchaseInvoicesPg + CreditNotesPg */
import { BulkPostHeader, RowCheckbox, BulkPostBar } from "../components/BulkPostBar.jsx";
/* V19.41: Purchase return picker — opens from a posted purchase invoice */
import { PurchaseReturnPickerModal } from "../components/PurchaseReturnPickerModal.jsx";

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
  const [showN, setShowN] = useState(50);/* V21.21.3: pagination — 50 + «عرض المزيد» */
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

  /* V21.10.8 (#1): deep-link — open an invoice by id from a cross-link. */
  useEffect(() => {
    const open = (id) => { const inv = (data.salesInvoices || []).find(x => x && x.id === id); if(inv){ setActiveInvoice(inv); return true; } return false; };
    try { const p = window.__clarkOpenSalesDoc; if(p && p.kind === "invoice" && open(p.id)) delete window.__clarkOpenSalesDoc; } catch(e) {}
    const h = (e) => { if(e?.detail?.kind === "invoice" && e.detail.id) open(e.detail.id); };
    window.addEventListener("clark-open-sales-doc", h);
    return () => window.removeEventListener("clark-open-sales-doc", h);
  }, [data.salesInvoices]);

  /* V21.10.8 (#3): unpaid posted sales invoices (aging alert) */
  const unpaid = useMemo(() => {
    const list = invoices.filter(i => i.status === "posted" && invoiceBalance(i) > 0.01);
    const total = list.reduce((s, i) => s + invoiceBalance(i), 0);
    return { count: list.length, total };
  }, [invoices]);

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
              /* V21.9.90 (Sales audit Bug #1): also store the COGS entry's
                 date+id+refNo so handleVoid can reverse it even if the order
                 is later deleted (the builder needs the order to rebuild
                 the entry; storing the ID lets us reverse without rebuild). */
              cogsDate: res.cogs && res.cogs.entry ? res.cogs.entry.date : null,
              cogsEntryId: res.cogs && res.cogs.entry ? res.cogs.entry.id : null,
              cogsRefNo: res.cogs && res.cogs.entry ? res.cogs.entry.refNo : null,
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
  /* V21.21.5: حذف مجمّع للمسودات المحددة (selectedIds = مسودات فقط — RowCheckbox) */
  const [bulkBusy, setBulkBusy] = useState(false);
  const bulkDelete = async () => {
    const ids = [...selectedIds]; if(ids.length === 0) return;
    if(!await ask("حذف مجمّع", "متأكد تحذف " + ids.length + " مسودة فاتورة نهائياً؟ مش هينفع تتراجع.", { danger: true, confirmText: "حذف الكل" })) return;
    setBulkBusy(true); let deleted = 0; const blocked = [];
    try {
      await upConfig(d => {
        for(const id of ids){
          const inv = (d.salesInvoices || []).find(x => x && x.id === id);
          const ok = deleteDraftInvoiceMutator(d, id, "sales");
          if(ok) deleted++; else blocked.push((inv?.invoiceNo || id) + ": مش مسودة");
        }
      }, { allowEmptyFields: ["salesInvoices"] });/* V21.21.41 */
    } finally { setBulkBusy(false); }
    setSelectedIds(new Set());
    if(blocked.length === 0) showToast("✓ اتحذف " + deleted + " مسودة");
    else await tell("نتيجة الحذف المجمّع", "✓ اتحذف: " + deleted + "\n⛔ اتمنع: " + blocked.length + " (مرحّلة — استخدم الإلغاء)\n\n" + blocked.slice(0, 12).join("\n"), { type: "warning" });
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

    {/* V21.10.8 (#3): unpaid posted invoices alert — click filters to posted */}
    {unpaid.count > 0 && <div onClick={() => setStatus("posted")} style={{display:"flex", alignItems:"center", gap:10, padding:"10px 14px", marginBottom:14, borderRadius:10, background:"#EF444410", border:"1px solid #EF444430", cursor:"pointer"}}>
      <span style={{fontSize:18}}>💸</span>
      <div style={{flex:1, fontSize:FS-1, color:T.text, fontWeight:600}}>
        <b style={{color:T.err}}>{unpaid.count}</b> فاتورة مرحّلة لسه عليها متبقي — إجمالي المتبقي <b style={{color:T.err, direction:"ltr", display:"inline-block"}}>{fmt(unpaid.total.toFixed(2))}</b>
      </div>
      <span style={{fontSize:FS-2, color:T.err, fontWeight:700}}>عرض ↗</span>
    </div>}

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
        {selectedIds.size > 0 && <div style={{display:"flex",alignItems:"center",gap:10,padding:"6px 2px",flexWrap:"wrap"}}>
          <button onClick={bulkDelete} style={{background:"#EF4444",color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontWeight:700,fontFamily:"inherit",fontSize:FS-1}}>🗑 حذف المسودات المحددة ({selectedIds.size})</button>
          <button onClick={()=>setSelectedIds(new Set())} style={{background:T.bg,color:T.textSec,border:"1px solid "+T.brd,borderRadius:8,padding:"6px 12px",cursor:"pointer",fontFamily:"inherit",fontSize:FS-1}}>إلغاء التحديد</button>
        </div>}
        {filtered.slice(0, showN).map(inv => {
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
            {isDraft && <button onClick={e => { e.stopPropagation(); handleDelete(inv); }} title="حذف المسودة" style={{background:"#EF444412", color:"#EF4444", border:"1px solid #EF444433", borderRadius:8, padding:"4px 8px", cursor:"pointer", fontSize:FS}}>🗑</button>}
          </div>;
        })}
        {filtered.length > showN && <button onClick={() => setShowN(n => n + 50)} style={{marginTop:4, padding:"10px", borderRadius:10, border:"1px dashed "+T.brd, background:T.bg, color:T.accent, fontWeight:700, cursor:"pointer", fontFamily:"inherit"}}>عرض المزيد ({filtered.length - showN} متبقي)</button>}
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
      mode="sales" data={data} upConfig={upConfig} user={user} isMob={isMob}
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
    <BlockingOverlay show={bulkBusy} text="جاري حذف المسودات..." sub="من فضلك انتظر — لا تغلق الصفحة" />
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
  /* V21.10.4 — payment-from-invoice modal */
  const [showPay, setShowPay] = useState(false);
  const paidAmount = Number(invoice.paidAmount) || 0;
  const balanceDue = invoiceBalance(invoice);
  const canPay = !isPurchase && invoice.status === "posted" && balanceDue > 0 && !!invoice.customerId && !!upConfig;
  const userName = user?.displayName || (user?.email || "").split("@")[0] || "";
  const handleRecordPayment = (args) => {
    let res = { ok: true };
    upConfig(d => { res = recordInvoicePaymentMutator(d, { invoiceId: invoice.id, type, ...args, userName }); });
    if(res && res.ok){
      /* القيد المحاسبي (Cash Dr / AR Cr) — fire-and-forget بعد الـ upConfig، نفس نمط CustDeliverPg */
      try {
        const cust = (data.customers || []).find(c => c.id === invoice.customerId);
        autoPost.customerPay(data, res.payment, cust, userName).catch(() => {});
      } catch(e){ /* non-fatal */ }
      setShowPay(false);
      showToast("✓ تم تسجيل الدفعة " + fmt(args.amount));
    } else {
      showToast("⛔ " + (res?.error || "تعذّر تسجيل الدفعة"));
    }
  };
  /* V18.58: Free discount editor — local state, applied to invoice on change */
  const [discountType, setDiscountType] = useState(invoice.discountType || (invoice.discountPct ? "pct" : "amount"));
  const [discountValue, setDiscountValue] = useState(
    invoice.discountType === "amount" ? invoice.discount :
    (invoice.discountPct || 0)
  );

  /* Recompute totals from current discount inputs.
     V19.63: clamp at zero — pre-V19.63 a negative discountValue (typed `-50` or pasted)
     produced a negative discount → total = subtotal - (-x) = inflated total → overcharge. */
  /* V21.9.90 (Sales audit Bug #2): guarded total calc. Pre-V21.9.90 a
     malformed subtotal (NaN, missing) would produce NaN or negative
     computedTotal, then saved to the invoice → journal entry imbalance.
     Now: explicit numeric guards + r2() + clamp >= 0 to ensure the saved
     total is always a valid non-negative number. */
  const computedDiscount = useMemo(() => {
    const sub = Number(invoice.subtotal) || 0;
    const v = Math.max(0, Number(discountValue) || 0);
    if(!isFinite(sub) || sub < 0) return 0;
    if(discountType === "pct"){
      return Math.min(sub * v / 100, sub);/* clamp at subtotal */
    } else {
      return Math.min(v, sub);/* clamp at subtotal */
    }
  }, [invoice.subtotal, discountType, discountValue]);
  const computedTotal = useMemo(() => {
    const sub = Number(invoice.subtotal) || 0;
    if(!isFinite(sub) || sub < 0) return 0;
    const t = sub - computedDiscount;
    return Math.max(0, isFinite(t) ? t : 0);
  }, [invoice.subtotal, computedDiscount]);

  /* Save discount change back to the invoice (only when draft) */
  const saveDiscountChange = () => {
    if(!isDraft || !upConfig) return;
    /* V21.9.90: reject NaN / negative totals before save. */
    if(!isFinite(computedTotal) || computedTotal < 0){
      console.warn("[V21.9.90 saveDiscountChange] computed total invalid, abort save",{computedTotal,subtotal:invoice.subtotal});
      return;
    }
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

      {/* V21.21.21: روابط السلسلة لفاتورة المشتريات — أمر الشراء + الاستلام */}
      {isPurchase && (()=>{
        const refs = (invoice.receiptRefs && invoice.receiptRefs.length) ? invoice.receiptRefs : (invoice.receiptRef ? [invoice.receiptRef] : []);
        const recs = refs.map(rf => (data.purchaseReceipts||[]).find(r => r && r.id === rf.receiptId)).filter(Boolean);
        const poIds = [...new Set(recs.map(r => r._poId).filter(Boolean))];
        const pos = poIds.map(id => (data.purchaseOrders||[]).find(p => p && p.id === id)).filter(Boolean);
        if(recs.length === 0 && pos.length === 0) return null;
        return <div style={{display:"flex", gap:8, flexWrap:"wrap", marginBottom:12}}>
          {pos.map(p => <span key={p.id} onClick={()=>{onClose&&onClose();openPurchaseDoc("po",p.id)}} style={{cursor:"pointer",fontSize:FS-2,fontWeight:700,color:"#8B5CF6",background:"#8B5CF610",border:"1px solid #8B5CF630",borderRadius:8,padding:"4px 10px"}}>📋 أمر الشراء: {p.poNo} ↗</span>)}
          {recs.map(r => <span key={r.id} onClick={()=>{onClose&&onClose();openPurchaseDoc("receipt",r.id)}} style={{cursor:"pointer",fontSize:FS-2,fontWeight:700,color:"#0284C7",background:"#0284C710",border:"1px solid #0284C730",borderRadius:8,padding:"4px 10px"}}>📥 استلام: {r.receiptNo} ↗</span>)}
        </div>;
      })()}

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

      {/* V21.18.0: لينك قيد اليومية — للفواتير المرحّلة. الضغط يفتح القيد في المحاسبة. */}
      {invoice.status === "posted" && invoice.postedJournalRef && invoice.postedJournalRef.entryId && (() => {
        const ref = invoice.postedJournalRef;
        const openJE = (jDate, eid) => {
          if(!eid) return;
          try { window.__clarkOpenJournalEntry = { date: jDate, entryId: eid }; } catch(_){}
          window.dispatchEvent(new CustomEvent("goto-tab", { detail: "accounting" }));
          setTimeout(() => window.dispatchEvent(new CustomEvent("clark-open-journal-entry", { detail: { date: jDate, entryId: eid } })), 220);
          onClose && onClose();
        };
        return <div style={{display:"flex", gap:10, flexWrap:"wrap", marginBottom:14, padding:"8px 12px", background:T.accent+"08", border:"1px dashed "+T.accent+"40", borderRadius:8, fontSize:FS-2, alignItems:"center"}}>
          <span style={{fontWeight:700, color:T.accent}}>📔 قيد اليومية:</span>
          <span onClick={()=>openJE(ref.date, ref.entryId)} style={{color:T.accent, cursor:"pointer", fontWeight:800, fontFamily:"monospace", textDecoration:"underline", textUnderlineOffset:2}}>{ref.refNo || "عرض القيد"} ↗</span>
          {ref.cogsEntryId && <span onClick={()=>openJE(ref.cogsDate, ref.cogsEntryId)} style={{color:T.accent, cursor:"pointer", fontWeight:600, fontFamily:"monospace"}}>· قيد التكلفة {ref.cogsRefNo || ""} ↗</span>}
        </div>;
      })()}

      {/* V21.10.3: cross-links — shown only for invoices generated from the
          Odoo-style document chain (Sales Order / Quotation). Read-only. */}
      {(invoice.fromSalesOrderNo || invoice.fromQuotationNo) && (
        <div style={{display:"flex", gap:8, flexWrap:"wrap", marginBottom:14, padding:"8px 12px", background:"#8B5CF608", border:"1px dashed #8B5CF630", borderRadius:8, fontSize:FS-2}}>
          <span style={{fontWeight:700, color:"#8B5CF6"}}>🔗 مصدر الفاتورة:</span>
          {invoice.fromSalesOrderNo && <span onClick={()=>openSalesDoc("salesOrder", invoice.fromSalesOrderId)} style={{color:"#8B5CF6", cursor:"pointer", fontWeight:600}}>أمر البيع <b>{invoice.fromSalesOrderNo}</b> ↗</span>}
          {invoice.fromQuotationNo && <span onClick={()=>openSalesDoc("quotation", invoice.fromQuotationId)} style={{color:"#8B5CF6", cursor:"pointer", fontWeight:600}}>· عرض السعر <b>{invoice.fromQuotationNo}</b> ↗</span>}
        </div>
      )}

      {/* Items table — V21.21.42: أعمدة موحّدة + توزيع الخصم الكلي على الصفوف.
          للمسودّة بنمرّر الخصم الحيّ من المحرّر تحت فالتوزيع بيتحدّث وانت بتكتب. */}
      <DocItemsTable items={invoice.items} headerDiscountAmount={isDraft ? computedDiscount : (Number(invoice.discount) || 0)} accent={T.accent} />

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
          {/* V21.10.4: paid / balance (sales invoices, once any payment recorded) */}
          {!isPurchase && paidAmount > 0 && <>
            <div style={{display:"flex", justifyContent:"space-between", padding:"3px 0", fontSize:FS-1, color:"#10B981"}}>
              <span>المدفوع</span><span style={{fontWeight:700, direction:"ltr"}}>{fmt(paidAmount.toFixed(2))}</span>
            </div>
            <div style={{display:"flex", justifyContent:"space-between", padding:"3px 0", fontSize:FS-1, color:balanceDue>0?T.err:T.textSec}}>
              <span>المتبقي</span><span style={{fontWeight:800, direction:"ltr"}}>{fmt(balanceDue.toFixed(2))}</span>
            </div>
          </>}
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

      {/* V21.9.128: Attachments — shared by sales + purchase invoices via this modal.
          entityType derived from invoice type. ID is invoice.id (always exists in this modal). */}
      {invoice.id && (
        <div style={{marginBottom: 14}}>
          <AttachmentList
            entityType={isPurchase ? "purchaseInvoices" : "salesInvoices"}
            entityId={invoice.id}
            user={user}
            canEdit={isDraft}
            label={isPurchase ? "مرفقات الفاتورة (فاتورة المورد، الإيصال)" : "مرفقات الفاتورة (ختم العميل، صورة)"}
            compact
          />
        </div>
      )}

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
        {canPay && <Btn onClick={() => setShowPay(true)} style={{background:"#10B98115", color:"#10B981", border:"1px solid #10B98140", fontWeight:700}}>💵 ادفع</Btn>}
        {invoice.status === "posted" && <Btn onClick={() => onVoid(invoice)} style={{background:T.err+"15", color:T.err, border:"1px solid "+T.err+"40"}}>❌ إلغاء</Btn>}
      </div>
    </div>
    {/* V21.10.4: Payment-from-invoice modal */}
    {showPay && <PaymentFromInvoiceModal
      invoice={invoice}
      data={data}
      onSubmit={handleRecordPayment}
      onClose={() => setShowPay(false)}
    />}
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
