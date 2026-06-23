/* ═══════════════════════════════════════════════════════════════════════
   CLARK · PurchaseInvoicesPg (V18.49)
   ───────────────────────────────────────────────────────────────────────
   Mirror of SalesInvoicesPg for purchase invoices. Reuses the
   InvoiceDetailModal from SalesInvoicesPg.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo, useEffect } from "react";
import { Btn, Card, Inp, Sel, BlockingOverlay } from "../components/ui.jsx";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { fmt } from "../utils/format.js";
import { ask, showToast, tell } from "../utils/popups.js";
import {
  postInvoiceMutator, voidInvoiceMutator, deleteDraftInvoiceMutator,
  getInvoiceStats, buildPurchaseInvoiceFromReceipt, upsertPurchaseInvoiceFromReceipt, findInvoiceByReceipt,
  setInvoiceArchivedMutator,
} from "../utils/invoices.js";
import { InvoiceDetailModal } from "./SalesInvoicesPg.jsx";
import { FxSettlementModal } from "../components/purchase/FxSettlementModal.jsx";
import { consumePendingPurchaseDoc } from "../utils/purchase/navDoc.js";
import { ServiceInvoiceModal } from "../components/ServiceInvoiceModal.jsx";
import { autoPost } from "../utils/accounting/autoPost.js";
/* V19.39: Bulk-post toolbar shared with SalesInvoicesPg + CreditNotesPg */
import { BulkPostHeader, RowCheckbox, BulkPostBar } from "../components/BulkPostBar.jsx";

const STATUS_META = {
  draft:  { label: "مسودة",  color: "#6B7280", bg: "#6B728015" },
  posted: { label: "مرحّل",  color: "#10B981", bg: "#10B98115" },
  void:   { label: "ملغية",  color: "#EF4444", bg: "#EF444415" },
};

export function PurchaseInvoicesPg({data, upConfig, isMob, user}){
  const today = new Date().toISOString().split("T")[0];
  const monthStart = today.slice(0,7) + "-01";
  const [from, setFrom]   = useState(monthStart);
  const [to, setTo]       = useState(today);
  const [showN, setShowN] = useState(50);/* V21.21.4: pagination — 50 + «عرض المزيد» */
  const [status, setStatus] = useState("all");
  const [partyId, setPartyId] = useState("");
  const [search, setSearch]   = useState("");
  const [showArchived, setShowArchived] = useState(false);/* V21.27.102: عرض الفواتير الملغية المؤرشفة */
  const [activeInvoice, setActiveInvoice] = useState(null);
  const [fxInvoice, setFxInvoice] = useState(null);/* V21.21.85: تسوية فرق صرف */
  /* V18.85: Service invoice modal */
  const [showServiceModal, setShowServiceModal] = useState(false);
  /* V19.39: Multi-select for bulk posting */
  const [selectedIds, setSelectedIds] = useState(new Set());

  const invoices = data.purchaseInvoices || [];
  const suppliers = data.suppliers || [];
  const userName = user?.displayName || (user?.email||"").split("@")[0] || "";

  /* V21.27.102: عدد الفواتير الملغية المؤرشفة (كل الفترات) — لزر «المؤرشفة». */
  const archivedCount = useMemo(() => invoices.filter(i => i && i.archived).length, [invoices]);

  const filtered = useMemo(() => {
    let list = invoices;
    /* V21.27.102: وضع «المؤرشفة» = الملغية المؤرشفة فقط (يتجاهل فلتر التاريخ)؛
       الوضع العادي = يستبعد المؤرشفة. */
    if(showArchived){
      list = list.filter(i => i && i.archived);
    } else {
      list = list.filter(i => !i || !i.archived);
      if(from) list = list.filter(i => (i.date||"") >= from);
      if(to)   list = list.filter(i => (i.date||"") <= to);
    }
    if(status !== "all") list = list.filter(i => i.status === status);
    if(partyId) list = list.filter(i => i.supplierId === partyId);
    if(search.trim()){
      const q = search.trim().toLowerCase();
      list = list.filter(i =>
        (i.invoiceNo||"").toLowerCase().includes(q) ||
        (i.supplierName||"").toLowerCase().includes(q)
      );
    }
    return list.slice().sort((a,b) => (b.date||"").localeCompare(a.date||"") || (b.invoiceNo||"").localeCompare(a.invoiceNo||""));
  }, [invoices, from, to, status, partyId, search, showArchived]);

  const stats = useMemo(() => getInvoiceStats(data, "purchase", {from, to, partyId, status}), [data, from, to, partyId, status]);

  /* V21.27.102: أرشفة / استرجاع الفواتير الملغية */
  const handleArchiveVoid = async () => {
    const ids = filtered.filter(i => i.status === "void" && !i.archived).map(i => i.id);
    if(ids.length === 0){ showToast("لا توجد فواتير ملغية للأرشفة في النطاق الحالي"); return; }
    if(!await ask("أرشفة الفواتير الملغية", "أرشفة "+ids.length+" فاتورة ملغية؟\n\nهتختفي من السجل النشط بس هتفضل موجودة، وتقدر ترجعها من زر «المؤرشفة».", {confirmText:"أرشفة"})) return;
    upConfig(d => { setInvoiceArchivedMutator(d, "purchase", ids, true, userName); });
    setSelectedIds(new Set());
    showToast("✓ تم أرشفة "+ids.length+" فاتورة ملغية");
  };
  const handleToggleArchive = (inv, archived) => {
    upConfig(d => { setInvoiceArchivedMutator(d, "purchase", [inv.id], archived, userName); });
    setActiveInvoice(null);
    showToast(archived ? "📦 تم نقل الفاتورة للأرشيف" : "↩️ تم استرجاع الفاتورة من الأرشيف");
  };

  /* V18.90: Listen for notification deep-links — open the matching invoice. */
  useEffect(() => {
    const handler = (e) => {
      const d = e?.detail;
      if(!d || d.type !== "invoice" || d.subType !== "purchase") return;
      const inv = invoices.find(i => i.id === d.invoiceId);
      if(inv) setActiveInvoice(inv);
    };
    window.addEventListener("notif-deeplink", handler);
    return () => window.removeEventListener("notif-deeplink", handler);
  }, [invoices]);

  /* V21.21.21: cross-link deep-link — افتح فاتورة المشتريات من مستند تاني */
  useEffect(() => {
    const open = (id) => { const inv = invoices.find(i => i && i.id === id); if(inv){ setActiveInvoice(inv); return true; } return false; };
    const pid = consumePendingPurchaseDoc("invoice"); if(pid) open(pid);
    const h = (e) => { const d = e?.detail; if(d && d.kind === "invoice" && d.id) open(d.id); };
    window.addEventListener("clark-open-purchase-doc", h);
    return () => window.removeEventListener("clark-open-purchase-doc", h);
  }, [invoices]);

  const handlePost = async (inv, opts = {}) => {
    /* V19.39: silent mode used by bulk-post bar */
    const silent = opts.silent === true;
    if(!silent){
      if(!await ask("ترحيل الفاتورة", "ترحيل الفاتورة "+inv.invoiceNo+" بمبلغ "+fmt(inv.total.toFixed(2))+"؟\n\nسيتم إنشاء قيد محاسبي تلقائياً.", {confirmText:"ترحيل"})) return;
    }
    const supplier = (data.suppliers||[]).find(s => s.id === inv.supplierId);
    /* V19.56: AWAIT every write so the bulk-post progress reflects reality.
       See SalesInvoicesPg.handlePost for the full reasoning. */
    try {
      await upConfig(d => { postInvoiceMutator(d, inv.id, "purchase", userName); });
      const postedInv = {...inv, status:"posted", postedAt: new Date().toISOString(), postedBy: userName};
      const res = await autoPost.purchaseInvoicePosted(data, postedInv, supplier, userName);
      if(res && res.ok && res.entry){
        await upConfig(d => {
          const idx = (d.purchaseInvoices||[]).findIndex(i => i.id === inv.id);
          if(idx >= 0){
            d.purchaseInvoices[idx].postedJournalRef = {
              date: res.entry.date,
              entryId: res.entry.id,
              refNo: res.entry.refNo,
            };
          }
        });
      }
      if(!silent){
        showToast("✓ تم الترحيل");
        setActiveInvoice(null);
      }
    } catch(e){
      console.warn("[purchaseInvoicePost] failed for", inv.invoiceNo, e);
      if(!silent) showToast("⚠ تعذّر ترحيل "+inv.invoiceNo+(e?.message?": "+e.message:""));
      throw e;
    }
  };
  const handleVoid = async (inv) => {
    if(!await ask("إلغاء الفاتورة", "إلغاء الفاتورة "+inv.invoiceNo+"؟\n\nسيتم إنشاء قيد عكسي للقيد الأصلي.", {danger:true,confirmText:"إلغاء الفاتورة"})) return;
    upConfig(d => { voidInvoiceMutator(d, inv.id, "purchase", userName, "إلغاء يدوي"); });
    if(inv.postedJournalRef){
      autoPost.invoiceVoided(data, inv, "purchaseInvoice", userName).catch(e => console.warn("[void purchase] failed:", e));
    }
    showToast("✓ تم الإلغاء");
    setActiveInvoice(null);
  };
  const handleDelete = async (inv) => {
    if(!await ask("حذف المسودة", "حذف مسودة الفاتورة "+inv.invoiceNo+"؟", {danger:true,confirmText:"حذف"})) return;
    upConfig(d => { deleteDraftInvoiceMutator(d, inv.id, "purchase"); });
    showToast("✓ تم الحذف");
    setActiveInvoice(null);
  };
  /* V21.21.5: حذف مجمّع للمسودات المحددة */
  const [bulkBusy, setBulkBusy] = useState(false);
  const bulkDelete = async () => {
    const ids = [...selectedIds]; if(ids.length === 0) return;
    if(!await ask("حذف مجمّع", "متأكد تحذف " + ids.length + " مسودة فاتورة نهائياً؟ مش هينفع تتراجع.", { danger: true, confirmText: "حذف الكل" })) return;
    setBulkBusy(true); let deleted = 0; const blocked = [];
    try {
      await upConfig(d => {
        for(const id of ids){
          const inv = (d.purchaseInvoices || []).find(x => x && x.id === id);
          const ok = deleteDraftInvoiceMutator(d, id, "purchase");
          if(ok) deleted++; else blocked.push((inv?.invoiceNo || id) + ": مش مسودة");
        }
      });
    } finally { setBulkBusy(false); }
    setSelectedIds(new Set());
    if(blocked.length === 0) showToast("✓ اتحذف " + deleted + " مسودة");
    else await tell("نتيجة الحذف المجمّع", "✓ اتحذف: " + deleted + "\n⛔ اتمنع: " + blocked.length + " (مرحّلة — استخدم الإلغاء)\n\n" + blocked.slice(0, 12).join("\n"), { type: "warning" });
  };

  /* V18.49: receipts without invoices */
  const uninvoicedReceipts = useMemo(() => {
    const receipts = data.purchaseReceipts || [];
    return receipts.filter(r => {
      if(r._orphaned) return false;
      return !findInvoiceByReceipt(data, r.id);
    });
  }, [data, invoices]);

  const handleBulkCreate = async () => {
    if(uninvoicedReceipts.length === 0){
      showToast("لا توجد إذونات استلام بدون فواتير");
      return;
    }
    if(!await ask("إنشاء فواتير جماعية",
      "سيتم إنشاء فواتير مسودة من "+uninvoicedReceipts.length+" إذن استلام.\n\n💡 V19.39: الإذونات اللي لنفس المورد في نفس اليوم هتتدمج في فاتورة واحدة تلقائياً.",
      {confirmText:"إنشاء"})) return;
    let createdCount = 0;
    let mergedCount = 0;
    upConfig(d => {
      if(!Array.isArray(d.purchaseInvoices)) d.purchaseInvoices = [];
      uninvoicedReceipts.forEach(receipt => {
        const supplier = (d.suppliers||[]).find(s => s.id === receipt.supplierId);
        /* V19.39: upsert merges receipts for same supplier on same day */
        const result = upsertPurchaseInvoiceFromReceipt(d, receipt, supplier, userName);
        if(result.isNew) createdCount++; else mergedCount++;
      });
    });
    showToast(
      mergedCount === 0
        ? `✓ تم إنشاء ${createdCount} فاتورة مسودة`
        : `✓ تم إنشاء ${createdCount} فاتورة + دمج ${mergedCount} في فواتير قائمة`
    );
  };

  return <div style={{padding:isMob?12:20, maxWidth:1400, margin:"0 auto"}}>
    <div style={{display:"flex", alignItems:"center", gap:12, marginBottom:16, flexWrap:"wrap"}}>
      <span style={{fontSize:isMob?22:28}}>📥</span>
      <div style={{flex:1, minWidth:200}}>
        <div style={{fontSize:isMob?18:22, fontWeight:800, color:T.text}}>فواتير المشتريات</div>
        <div style={{fontSize:FS-2, color:T.textSec}}>عرض وإدارة فواتير المشتريات (مسودة / مرحّل / ملغية)</div>
      </div>
      {/* V18.85: Direct service invoice */}
      <Btn onClick={()=>setShowServiceModal(true)} style={{background:"#8B5CF615",color:"#8B5CF6",border:"1px solid #8B5CF640",fontWeight:700}}>
        🛠 فاتورة خدمات
      </Btn>
      {uninvoicedReceipts.length > 0 && <Btn primary onClick={handleBulkCreate} style={{background:"#F59E0B",color:"#fff",border:"none",fontWeight:800}}>
        ➕ إنشاء فواتير من {uninvoicedReceipts.length} استلام
      </Btn>}
      {/* V21.27.102: زر «المؤرشفة» — يفتح/يقفل عرض الفواتير الملغية المؤرشفة */}
      <Btn onClick={()=>{setShowArchived(s=>!s);setSelectedIds(new Set());}} style={{background:showArchived?"#8B5CF6":"#8B5CF615",color:showArchived?"#fff":"#8B5CF6",border:"1px solid #8B5CF640",fontWeight:700}} title="الفواتير الملغية المؤرشفة">
        {showArchived ? "→ رجوع للسجل النشط" : "📂 المؤرشفة"+(archivedCount>0?" ("+archivedCount+")":"")}
      </Btn>
    </div>

    {/* V21.27.102: شريط وضع الأرشيف */}
    {showArchived && <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",marginBottom:14,borderRadius:10,background:"#8B5CF610",border:"1px solid #8B5CF630"}}>
      <span style={{fontSize:18}}>📂</span>
      <div style={{flex:1,fontSize:FS-1,color:T.text,fontWeight:600}}>أرشيف الفواتير الملغية — <b style={{color:"#8B5CF6"}}>{filtered.length}</b> فاتورة. مش بتظهر في السجل النشط؛ استخدم «↩️ استرجاع» لإرجاع أي فاتورة.</div>
    </div>}

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
          <label style={{fontSize:FS-3, color:T.textSec, fontWeight:600, display:"block", marginBottom:3}}>المورد</label>
          <Sel value={partyId} onChange={setPartyId}>
            <option value="">كل الموردين</option>
            {suppliers.filter(s => !s.archived).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Sel>
        </div>
        <div style={{gridColumn: isMob?"1/3":"auto"}}>
          <label style={{fontSize:FS-3, color:T.textSec, fontWeight:600, display:"block", marginBottom:3}}>بحث</label>
          <Inp value={search} onChange={setSearch} placeholder="رقم فاتورة / اسم مورد..."/>
        </div>
      </div>
    </Card>

    {/* V21.27.102: زر أرشفة الفواتير الملغية (السجل النشط فقط) */}
    {!showArchived && (() => { const n = filtered.filter(i => i.status === "void" && !i.archived).length; return n > 0 ? (
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
        <Btn onClick={handleArchiveVoid} style={{background:"#8B5CF615",color:"#8B5CF6",border:"1px solid #8B5CF640",fontWeight:700}} title="نقل الفواتير الملغية للأرشيف — تختفي من السجل وتفضل موجودة">
          📦 أرشفة الملغية ({n})
        </Btn>
      </div>
    ) : null; })()}

    {filtered.length === 0 ? <Card>
      <div style={{padding:30, textAlign:"center", color:T.textMut, fontSize:FS-1}}>
        {showArchived ? "📂 مفيش فواتير ملغية مؤرشفة." : <>💡 لا توجد فواتير مشتريات في هذه الفترة. لإنشاء فواتير، روح صفحة <b>المشتريات → إذونات الاستلام</b> واضغط "تحويل لفاتورة".</>}
      </div>
    </Card>
      : <div style={{display:"flex", flexDirection:"column", gap:6}}>
        {/* V19.39: bulk-post header */}
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
            {/* V19.39: per-row checkbox */}
            <RowCheckbox id={inv.id} isDraft={isDraft} selectedIds={selectedIds} setSelectedIds={setSelectedIds}/>
            <div style={{minWidth: isMob?100:140}}>
              <div style={{fontFamily:"monospace", fontSize:FS-1, fontWeight:800, color:T.accent}}>
                {inv.invoiceNo}
                {inv.subtype==="service" && <span style={{marginInlineStart:6,fontSize:FS-3,padding:"1px 5px",borderRadius:4,background:"#8B5CF620",color:"#8B5CF6",fontWeight:700}}>🛠 خدمات</span>}
                {inv.currency && inv.currency!=="EGP" && <span title={"بعملة "+inv.currency+" × "+(inv.fxRate||0)+" — الإجمالي الأجنبي: "+(inv.fcTotal||0)+" "+inv.currency} style={{marginInlineStart:6,fontSize:FS-3,padding:"1px 6px",borderRadius:4,background:"#0EA5E920",color:"#0EA5E9",fontWeight:700}}>💱 {inv.currency} × {inv.fxRate||0}</span>}
              </div>
              <div style={{fontSize:FS-3, color:T.textMut, fontFamily:"monospace"}}>{inv.date}</div>
            </div>
            <div style={{flex:1, minWidth:120}}>
              <div style={{fontSize:FS-1, fontWeight:700, color:T.text}}>{inv.supplierName}</div>
              <div style={{fontSize:FS-3, color:T.textSec}}>{inv.items.length} بند</div>
            </div>
            <div style={{textAlign:"left", direction:"ltr", minWidth:100}}>
              <div style={{fontSize:FS, fontWeight:800, color:T.text}}>{fmt(inv.total.toFixed(2))}</div>
              {inv.discount > 0 && <div style={{fontSize:FS-3, color:T.textMut}}>خصم {fmt(inv.discount.toFixed(0))}</div>}
            </div>
            <span style={{padding:"4px 10px", borderRadius:6, fontSize:FS-2, fontWeight:700, background:meta.bg, color:meta.color, border:"1px solid "+meta.color+"30"}}>{meta.label}</span>
            {inv.status==="posted" && inv.currency && inv.currency!=="EGP" && Number(inv.fcTotal)>0 && <button onClick={e => { e.stopPropagation(); setFxInvoice(inv); }} title="تسوية فرق صرف" style={{background:"#0EA5E912", color:"#0EA5E9", border:"1px solid #0EA5E933", borderRadius:8, padding:"4px 8px", cursor:"pointer", fontSize:FS, fontWeight:700}}>💱</button>}
            {isDraft && <button onClick={e => { e.stopPropagation(); handleDelete(inv); }} title="حذف المسودة" style={{background:"#EF444412", color:"#EF4444", border:"1px solid #EF444433", borderRadius:8, padding:"4px 8px", cursor:"pointer", fontSize:FS}}>🗑</button>}
            {/* V21.27.102: في وضع الأرشيف — زر استرجاع سريع */}
            {inv.archived && <button onClick={e => { e.stopPropagation(); handleToggleArchive(inv, false); }} title="استرجاع من الأرشيف" style={{background:"#8B5CF612", color:"#8B5CF6", border:"1px solid #8B5CF633", borderRadius:8, padding:"4px 8px", cursor:"pointer", fontSize:FS}}>↩️</button>}
          </div>;
        })}
        {filtered.length > showN && <button onClick={() => setShowN(n => n + 50)} style={{marginTop:4, padding:"10px", borderRadius:10, border:"1px dashed "+T.brd, background:T.bg, color:T.accent, fontWeight:700, cursor:"pointer", fontFamily:"inherit"}}>عرض المزيد ({filtered.length - showN} متبقي)</button>}
      </div>}

    {activeInvoice && <InvoiceDetailModal
      invoice={activeInvoice} type="purchase"
      data={data} upConfig={upConfig}
      onClose={() => setActiveInvoice(null)}
      onPost={handlePost} onVoid={handleVoid} onDelete={handleDelete} onArchive={handleToggleArchive}
      isMob={isMob}
      user={user}
    />}
    {fxInvoice && <FxSettlementModal invoice={fxInvoice} data={data} upConfig={upConfig} user={user} onClose={() => setFxInvoice(null)} />}
    {/* V18.85: Service invoice modal */}
    {showServiceModal && <ServiceInvoiceModal
      mode="purchase" data={data} upConfig={upConfig} user={user} isMob={isMob}
      onClose={()=>setShowServiceModal(false)}
    />}
    {/* V19.39: Floating bulk-post bar */}
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
