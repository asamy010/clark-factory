/* ═══════════════════════════════════════════════════════════════════════
   CLARK · PurchaseInvoicesPg (V18.49)
   ───────────────────────────────────────────────────────────────────────
   Mirror of SalesInvoicesPg for purchase invoices. Reuses the
   InvoiceDetailModal from SalesInvoicesPg.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo, useEffect } from "react";
import { Btn, Card, Inp, Sel } from "../components/ui.jsx";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { fmt } from "../utils/format.js";
import { ask, showToast } from "../utils/popups.js";
import {
  postInvoiceMutator, voidInvoiceMutator, deleteDraftInvoiceMutator,
  getInvoiceStats, buildPurchaseInvoiceFromReceipt, findInvoiceByReceipt,
} from "../utils/invoices.js";
import { InvoiceDetailModal } from "./SalesInvoicesPg.jsx";
import { ServiceInvoiceModal } from "../components/ServiceInvoiceModal.jsx";
import { autoPost } from "../utils/accounting/autoPost.js";

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
  const [status, setStatus] = useState("all");
  const [partyId, setPartyId] = useState("");
  const [search, setSearch]   = useState("");
  const [activeInvoice, setActiveInvoice] = useState(null);
  /* V18.85: Service invoice modal */
  const [showServiceModal, setShowServiceModal] = useState(false);

  const invoices = data.purchaseInvoices || [];
  const suppliers = data.suppliers || [];
  const userName = user?.displayName || (user?.email||"").split("@")[0] || "";

  const filtered = useMemo(() => {
    let list = invoices;
    if(from) list = list.filter(i => (i.date||"") >= from);
    if(to)   list = list.filter(i => (i.date||"") <= to);
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
  }, [invoices, from, to, status, partyId, search]);

  const stats = useMemo(() => getInvoiceStats(data, "purchase", {from, to, partyId, status}), [data, from, to, partyId, status]);

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

  const handlePost = async (inv) => {
    if(!await ask("ترحيل الفاتورة", "ترحيل الفاتورة "+inv.invoiceNo+" بمبلغ "+fmt(inv.total.toFixed(2))+"؟\n\nسيتم إنشاء قيد محاسبي تلقائياً.", {confirmText:"ترحيل"})) return;
    const supplier = (data.suppliers||[]).find(s => s.id === inv.supplierId);
    upConfig(d => { postInvoiceMutator(d, inv.id, "purchase", userName); });
    const postedInv = {...inv, status:"posted", postedAt: new Date().toISOString(), postedBy: userName};
    autoPost.purchaseInvoicePosted(data, postedInv, supplier, userName).then(res => {
      if(res && res.ok && res.entry){
        upConfig(d => {
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
    }).catch(e => console.warn("[purchaseInvoicePosted] failed:", e));
    showToast("✓ تم الترحيل");
    setActiveInvoice(null);
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
      "سيتم إنشاء "+uninvoicedReceipts.length+" فاتورة مسودة لكل إذونات الاستلام اللي لسه ما ليهاش فواتير.",
      {confirmText:"إنشاء"})) return;
    upConfig(d => {
      if(!Array.isArray(d.purchaseInvoices)) d.purchaseInvoices = [];
      uninvoicedReceipts.forEach(receipt => {
        const supplier = (d.suppliers||[]).find(s => s.id === receipt.supplierId);
        const inv = buildPurchaseInvoiceFromReceipt(d, receipt, supplier, userName);
        d.purchaseInvoices.unshift(inv);
      });
    });
    showToast("✓ تم إنشاء "+uninvoicedReceipts.length+" فاتورة مسودة");
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
    </div>

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

    {filtered.length === 0 ? <Card>
      <div style={{padding:30, textAlign:"center", color:T.textMut, fontSize:FS-1}}>
        💡 لا توجد فواتير مشتريات في هذه الفترة. لإنشاء فواتير، روح صفحة <b>المشتريات → إذونات الاستلام</b> واضغط "تحويل لفاتورة".
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
              <div style={{fontFamily:"monospace", fontSize:FS-1, fontWeight:800, color:T.accent}}>
                {inv.invoiceNo}
                {inv.subtype==="service" && <span style={{marginInlineStart:6,fontSize:FS-3,padding:"1px 5px",borderRadius:4,background:"#8B5CF620",color:"#8B5CF6",fontWeight:700}}>🛠 خدمات</span>}
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
          </div>;
        })}
      </div>}

    {activeInvoice && <InvoiceDetailModal
      invoice={activeInvoice} type="purchase"
      data={data} upConfig={upConfig}
      onClose={() => setActiveInvoice(null)}
      onPost={handlePost} onVoid={handleVoid} onDelete={handleDelete}
      isMob={isMob}
      user={user}
    />}
    {/* V18.85: Service invoice modal */}
    {showServiceModal && <ServiceInvoiceModal
      mode="purchase" data={data} upConfig={upConfig} user={user}
      onClose={()=>setShowServiceModal(false)}
    />}
  </div>;
}
