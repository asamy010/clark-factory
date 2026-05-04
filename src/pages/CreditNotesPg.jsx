/* ═══════════════════════════════════════════════════════════════════════
   CLARK · CreditNotesPg (V18.51)
   ───────────────────────────────────────────────────────────────────────
   Lists sales credit notes (إشعارات دائنة = مرتجعات المبيعات).
   Same UX as SalesInvoicesPg with a similar workflow:
     Draft → Posted → Void
   The credit note creates reversed accounting entries when posted.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { Btn, Card, Inp, Sel } from "../components/ui.jsx";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { fmt } from "../utils/format.js";
import { ask, showToast } from "../utils/popups.js";
import {
  postCreditNoteMutator, voidCreditNoteMutator, deleteDraftCreditNoteMutator,
  getCreditNoteStats, buildCreditNoteFromReturn, upsertCreditNoteFromReturn, findCreditNoteByReturn,
} from "../utils/invoices.js";
import { autoPost } from "../utils/accounting/autoPost.js";
import { printCreditNote } from "../utils/printInvoice.js";
/* V19.39: Bulk-post toolbar shared with SalesInvoicesPg + PurchaseInvoicesPg */
import { BulkPostHeader, RowCheckbox, BulkPostBar } from "../components/BulkPostBar.jsx";

const STATUS_META = {
  draft:  { label: "مسودة",  color: "#6B7280", bg: "#6B728015" },
  posted: { label: "مرحّل",  color: "#10B981", bg: "#10B98115" },
  void:   { label: "ملغي",    color: "#EF4444", bg: "#EF444415" },
};

export function CreditNotesPg({data, upConfig, isMob, user}){
  const today = new Date().toISOString().split("T")[0];
  const monthStart = today.slice(0,7) + "-01";
  const [from, setFrom]   = useState(monthStart);
  const [to, setTo]       = useState(today);
  const [status, setStatus] = useState("all");
  const [partyId, setPartyId] = useState("");
  const [search, setSearch]   = useState("");
  const [activeCN, setActiveCN] = useState(null);
  /* V19.39: Multi-select for bulk posting */
  const [selectedIds, setSelectedIds] = useState(new Set());

  const creditNotes = data.salesCreditNotes || [];
  const customers = data.customers || [];
  const userName = user?.displayName || (user?.email||"").split("@")[0] || "";

  const filtered = useMemo(() => {
    let list = creditNotes;
    if(from) list = list.filter(c => (c.date||"") >= from);
    if(to)   list = list.filter(c => (c.date||"") <= to);
    if(status !== "all") list = list.filter(c => c.status === status);
    if(partyId) list = list.filter(c => c.customerId === partyId);
    if(search.trim()){
      const q = search.trim().toLowerCase();
      list = list.filter(c =>
        (c.creditNoteNo||"").toLowerCase().includes(q) ||
        (c.customerName||"").toLowerCase().includes(q) ||
        (c.linkedInvoiceNo||"").toLowerCase().includes(q)
      );
    }
    return list.slice().sort((a,b) => (b.date||"").localeCompare(a.date||"") || (b.creditNoteNo||"").localeCompare(a.creditNoteNo||""));
  }, [creditNotes, from, to, status, partyId, search]);

  const stats = useMemo(() => getCreditNoteStats(data, {from, to, partyId, status}), [data, from, to, partyId, status]);

  const handlePost = async (cn, opts = {}) => {
    /* V19.39: silent mode used by bulk-post bar */
    const silent = opts.silent === true;
    if(!silent){
      if(!await ask("ترحيل إشعار دائن", "ترحيل إشعار "+cn.creditNoteNo+" بمبلغ "+fmt(cn.total.toFixed(2))+"؟\n\nسيتم إنشاء قيد محاسبي عكسي للبيع الأصلي.", {confirmText:"ترحيل"})) return;
    }
    const customer = (data.customers||[]).find(c => c.id === cn.customerId);
    const orderId = cn.returnRef && cn.returnRef.orderId;
    const order = orderId ? (data.orders||[]).find(o => o.id === orderId) : null;

    upConfig(d => { postCreditNoteMutator(d, cn.id, userName); });

    const postedCN = {...cn, status:"posted", postedAt: new Date().toISOString(), postedBy: userName};
    const postPromise = autoPost.creditNotePosted(data, postedCN, customer, order, userName).then(res => {
      if(res && res.main && res.main.ok && res.main.entry){
        upConfig(d => {
          const idx = (d.salesCreditNotes||[]).findIndex(c => c.id === cn.id);
          if(idx >= 0){
            d.salesCreditNotes[idx].postedJournalRef = {
              date: res.main.entry.date,
              entryId: res.main.entry.id,
              refNo: res.main.entry.refNo,
            };
          }
        });
      }
    }).catch(e => console.warn("[creditNotePosted] failed:", e));
    if(!silent){
      showToast("✓ تم الترحيل");
      setActiveCN(null);
    }
    return postPromise;
  };
  const handleVoid = async (cn) => {
    if(!await ask("إلغاء إشعار دائن", "إلغاء إشعار "+cn.creditNoteNo+"؟\n\nسيتم إنشاء قيد عكسي.", {danger:true,confirmText:"إلغاء"})) return;
    upConfig(d => { voidCreditNoteMutator(d, cn.id, userName, "إلغاء يدوي"); });
    if(cn.postedJournalRef){
      autoPost.creditNoteVoided(data, cn, "creditNote", userName).catch(e => console.warn("[void cn main] failed:", e));
      autoPost.creditNoteVoided(data, cn, "creditNoteCogs", userName).catch(e => console.warn("[void cn cogs] failed:", e));
    }
    showToast("✓ تم الإلغاء");
    setActiveCN(null);
  };
  const handleDelete = async (cn) => {
    if(!await ask("حذف المسودة", "حذف مسودة الإشعار "+cn.creditNoteNo+"؟", {danger:true,confirmText:"حذف"})) return;
    upConfig(d => { deleteDraftCreditNoteMutator(d, cn.id); });
    showToast("✓ تم الحذف");
    setActiveCN(null);
  };

  /* Bulk-create from existing returns that aren't yet credited */
  const uncreditedReturns = useMemo(() => {
    const orders = data.orders || [];
    const out = [];
    orders.forEach(o => {
      (o.customerReturns || []).forEach(ret => {
        const existing = findCreditNoteByReturn(data, o.id, ret.custId, ret._key);
        if(!existing && (Number(ret.qty)||0) > 0){
          out.push({ ret, order: o });
        }
      });
    });
    return out;
  }, [data, creditNotes]);

  const handleBulkCreate = async () => {
    if(uncreditedReturns.length === 0){
      showToast("لا توجد مرتجعات بدون إشعارات دائنة");
      return;
    }
    if(!await ask("إنشاء إشعارات دائنة جماعية",
      "سيتم إنشاء "+uncreditedReturns.length+" إشعار دائن مسودة لكل المرتجعات اللي لسه ما لهاش إشعارات.",
      {confirmText:"إنشاء"})) return;
    upConfig(d => {
      uncreditedReturns.forEach(({ret, order}) => {
        const customer = (d.customers||[]).find(c => c.id === ret.custId);
        /* V18.65: upsert merges same-day same-customer drafts into one CN */
        upsertCreditNoteFromReturn(d, ret, order, customer, userName);
      });
    });
    showToast("✓ تم إنشاء "+uncreditedReturns.length+" إشعار دائن");
  };

  return <div style={{padding:isMob?12:20, maxWidth:1400, margin:"0 auto"}}>
    <div style={{display:"flex", alignItems:"center", gap:12, marginBottom:16, flexWrap:"wrap"}}>
      <span style={{fontSize:isMob?22:28}}>↩️</span>
      <div style={{flex:1, minWidth:200}}>
        <div style={{fontSize:isMob?18:22, fontWeight:800, color:T.text}}>الإشعارات الدائنة (مرتجع المبيعات)</div>
        <div style={{fontSize:FS-2, color:T.textSec}}>إشعارات دائنة لمرتجعات العملاء — قيد محاسبي عكسي للبيع الأصلي</div>
      </div>
      {uncreditedReturns.length > 0 && <Btn primary onClick={handleBulkCreate} style={{background:"#EF4444",color:"#fff",border:"none",fontWeight:800}}>
        ➕ إنشاء إشعارات من {uncreditedReturns.length} مرتجع
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
        <div style={{fontSize:FS-3, color:STATUS_META.void.color, fontWeight:600}}>ملغي</div>
        <div style={{fontSize:FS+2, fontWeight:800, color:STATUS_META.void.color}}>{stats.voidCount}</div>
      </div>
    </div>

    <Card style={{marginBottom:14}}>
      <div style={{display:"grid", gridTemplateColumns:isMob?"1fr 1fr":"repeat(5,1fr)", gap:8, alignItems:"end"}}>
        <div>
          <label style={{fontSize:FS-3, color:T.textSec, fontWeight:600, display:"block", marginBottom:3}}>من</label>
          <Inp type="date" value={from} onChange={setFrom}/>
        </div>
        <div>
          <label style={{fontSize:FS-3, color:T.textSec, fontWeight:600, display:"block", marginBottom:3}}>إلى</label>
          <Inp type="date" value={to} onChange={setTo}/>
        </div>
        <div>
          <label style={{fontSize:FS-3, color:T.textSec, fontWeight:600, display:"block", marginBottom:3}}>الحالة</label>
          <Sel value={status} onChange={setStatus}>
            <option value="all">الكل</option>
            <option value="draft">مسودة</option>
            <option value="posted">مرحّل</option>
            <option value="void">ملغي</option>
          </Sel>
        </div>
        <div>
          <label style={{fontSize:FS-3, color:T.textSec, fontWeight:600, display:"block", marginBottom:3}}>العميل</label>
          <Sel value={partyId} onChange={setPartyId}>
            <option value="">كل العملاء</option>
            {customers.filter(c => !c.archived).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Sel>
        </div>
        <div style={{gridColumn: isMob?"1/3":"auto"}}>
          <label style={{fontSize:FS-3, color:T.textSec, fontWeight:600, display:"block", marginBottom:3}}>بحث</label>
          <Inp value={search} onChange={setSearch} placeholder="رقم إشعار / فاتورة / عميل..."/>
        </div>
      </div>
    </Card>

    {filtered.length === 0 ? <Card>
      <div style={{padding:30, textAlign:"center", color:T.textMut, fontSize:FS-1}}>
        💡 لا توجد إشعارات دائنة في هذه الفترة. الإشعارات بتتعمل تلقائياً مع كل مرتجع لما "الترحيل من الفاتورة" مفعّل في الإعدادات.
      </div>
    </Card>
      : <div style={{display:"flex", flexDirection:"column", gap:6}}>
        {/* V19.39: bulk-post header */}
        <BulkPostHeader
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          draftItems={filtered.filter(c => c.status === "draft")}
          isMob={isMob}
        />
        {filtered.map(cn => {
          const meta = STATUS_META[cn.status] || STATUS_META.draft;
          const isDraft = cn.status === "draft";
          return <div key={cn.id} onClick={() => setActiveCN(cn)} style={{
            background: T.cardSolid, border:"1px solid "+T.brd, borderRadius:8,
            padding:"10px 12px", cursor:"pointer", display:"flex", alignItems:"center", gap:10, flexWrap:"wrap"
          }} onMouseEnter={e => e.currentTarget.style.background = T.bg}
             onMouseLeave={e => e.currentTarget.style.background = T.cardSolid}>
            {/* V19.39: per-row checkbox */}
            <RowCheckbox id={cn.id} isDraft={isDraft} selectedIds={selectedIds} setSelectedIds={setSelectedIds}/>
            <div style={{minWidth: isMob?100:140}}>
              <div style={{fontFamily:"monospace", fontSize:FS-1, fontWeight:800, color:"#EF4444"}}>{cn.creditNoteNo}</div>
              <div style={{fontSize:FS-3, color:T.textMut, fontFamily:"monospace"}}>{cn.date}</div>
            </div>
            <div style={{flex:1, minWidth:120}}>
              <div style={{fontSize:FS-1, fontWeight:700, color:T.text}}>{cn.customerName}</div>
              <div style={{fontSize:FS-3, color:T.textSec}}>
                {cn.items.length} بند • {cn.items.reduce((s,it)=>s+it.qty,0)} قطعة
                {cn.linkedInvoiceNo && <span style={{marginInlineStart:8, color:T.accent, fontFamily:"monospace"}}>↩ {cn.linkedInvoiceNo}</span>}
              </div>
            </div>
            <div style={{textAlign:"left", direction:"ltr", minWidth:100}}>
              <div style={{fontSize:FS, fontWeight:800, color:T.text}}>{fmt(cn.total.toFixed(2))}</div>
            </div>
            <span style={{padding:"4px 10px", borderRadius:6, fontSize:FS-2, fontWeight:700, background:meta.bg, color:meta.color, border:"1px solid "+meta.color+"30"}}>{meta.label}</span>
          </div>;
        })}
      </div>}

    {activeCN && <CreditNoteDetailModal
      creditNote={activeCN} data={data}
      onClose={() => setActiveCN(null)}
      onPost={handlePost} onVoid={handleVoid} onDelete={handleDelete}
      isMob={isMob}
    />}
    {/* V19.39: Floating bulk-post bar */}
    <BulkPostBar
      selectedIds={selectedIds}
      setSelectedIds={setSelectedIds}
      allItems={filtered}
      postOne={handlePost}
      itemLabel="إشعار دائن"
      isMob={isMob}
    />
  </div>;
}

function CreditNoteDetailModal({creditNote, data, onClose, onPost, onVoid, onDelete, isMob}){
  const meta = STATUS_META[creditNote.status] || STATUS_META.draft;

  return <div style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.65)", zIndex:10001, display:"flex", alignItems:"center", justifyContent:"center", padding:16}} onClick={onClose}>
    <div onClick={e => e.stopPropagation()} style={{
      background:T.cardSolid, borderRadius:14, padding:isMob?16:24,
      width:"100%", maxWidth:800, maxHeight:"90vh", overflowY:"auto",
      border:"1px solid "+T.brd, boxShadow:"0 25px 70px rgba(0,0,0,0.4)"
    }}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16, paddingBottom:12, borderBottom:"2px solid "+T.brd, gap:10, flexWrap:"wrap"}}>
        <div>
          <div style={{display:"flex", alignItems:"center", gap:10, flexWrap:"wrap"}}>
            <span style={{fontSize:24}}>↩️</span>
            <div>
              <div style={{fontSize:FS-1, color:T.textSec, fontWeight:600}}>إشعار دائن (مرتجع مبيعات)</div>
              <div style={{fontFamily:"monospace", fontSize:FS+4, fontWeight:800, color:"#EF4444"}}>{creditNote.creditNoteNo}</div>
              {creditNote.linkedInvoiceNo && <div style={{fontSize:FS-2, color:T.textSec, marginTop:2}}>للفاتورة: <span style={{fontFamily:"monospace", color:T.accent, fontWeight:700}}>{creditNote.linkedInvoiceNo}</span></div>}
            </div>
          </div>
        </div>
        <span style={{padding:"6px 14px", borderRadius:8, fontSize:FS, fontWeight:800, background:meta.bg, color:meta.color, border:"2px solid "+meta.color+"40"}}>{meta.label}</span>
      </div>

      <div style={{display:"grid", gridTemplateColumns:isMob?"1fr 1fr":"repeat(3,1fr)", gap:8, marginBottom:14}}>
        <div style={{padding:8, background:T.bg, borderRadius:6}}>
          <div style={{fontSize:FS-3, color:T.textSec, fontWeight:600}}>العميل</div>
          <div style={{fontSize:FS-1, fontWeight:700, color:T.text}}>{creditNote.customerName}</div>
        </div>
        <div style={{padding:8, background:T.bg, borderRadius:6}}>
          <div style={{fontSize:FS-3, color:T.textSec, fontWeight:600}}>التاريخ</div>
          <div style={{fontSize:FS-1, fontWeight:700, color:T.text, fontFamily:"monospace"}}>{creditNote.date}</div>
        </div>
        <div style={{padding:8, background:T.bg, borderRadius:6, gridColumn: isMob?"1/3":"auto"}}>
          <div style={{fontSize:FS-3, color:T.textSec, fontWeight:600}}>أنشأها</div>
          <div style={{fontSize:FS-1, fontWeight:700, color:T.text}}>{creditNote.createdBy||"—"}</div>
        </div>
      </div>

      <div style={{border:"1px solid "+T.brd, borderRadius:8, overflow:"hidden", marginBottom:14}}>
        <table style={{width:"100%", borderCollapse:"collapse", fontSize:FS-1}}>
          <thead>
            <tr style={{background:"#EF444408"}}>
              <th style={{padding:"8px 10px", textAlign:"right", color:T.textSec, fontWeight:800, fontSize:FS-2, borderBottom:"2px solid "+T.brd}}>الصنف المُرتجع</th>
              <th style={{padding:"8px 10px", textAlign:"center", color:T.textSec, fontWeight:800, fontSize:FS-2, borderBottom:"2px solid "+T.brd, width:80}}>الكمية</th>
              <th style={{padding:"8px 10px", textAlign:"center", color:T.textSec, fontWeight:800, fontSize:FS-2, borderBottom:"2px solid "+T.brd, width:100}}>السعر</th>
              <th style={{padding:"8px 10px", textAlign:"center", color:T.textSec, fontWeight:800, fontSize:FS-2, borderBottom:"2px solid "+T.brd, width:120}}>الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {(creditNote.items||[]).map((it,i) => <tr key={i} style={{borderTop:"1px solid "+T.brd}}>
              <td style={{padding:"8px 10px"}}>
                <div style={{fontWeight:700, color:T.text}}>{it.modelNo||"—"}</div>
                {it.modelDesc && <div style={{fontSize:FS-3, color:T.textMut}}>{it.modelDesc}</div>}
              </td>
              <td style={{padding:"8px 10px", textAlign:"center", direction:"ltr", fontWeight:600}}>{fmt(it.qty)}</td>
              <td style={{padding:"8px 10px", textAlign:"center", direction:"ltr", color:T.textSec}}>{fmt(it.unitPrice.toFixed(2))}</td>
              <td style={{padding:"8px 10px", textAlign:"center", direction:"ltr", fontWeight:800, color:"#EF4444"}}>{fmt(it.lineTotal.toFixed(2))}</td>
            </tr>)}
          </tbody>
        </table>
      </div>

      <div style={{display:"flex", justifyContent:"flex-end", marginBottom:14}}>
        <div style={{minWidth:280, padding:12, background:"#EF444408", borderRadius:8, border:"1px solid #EF444440"}}>
          <div style={{display:"flex", justifyContent:"space-between", padding:"4px 0", fontSize:FS-1}}>
            <span style={{color:T.textSec}}>الإجمالي قبل الخصم</span>
            <span style={{fontWeight:700, direction:"ltr"}}>{fmt(creditNote.subtotal.toFixed(2))}</span>
          </div>
          {creditNote.discount > 0 && <div style={{display:"flex", justifyContent:"space-between", padding:"4px 0", fontSize:FS-1, color:T.textMut}}>
            <span>الخصم {creditNote.discountPct?(`(${creditNote.discountPct.toFixed(1)}%)`):""}</span>
            <span style={{fontWeight:700, direction:"ltr"}}>-{fmt(creditNote.discount.toFixed(2))}</span>
          </div>}
          <div style={{display:"flex", justifyContent:"space-between", padding:"8px 0", fontSize:FS+2, borderTop:"2px solid #EF4444", marginTop:6}}>
            <span style={{fontWeight:800, color:T.text}}>الإجمالي المستحق رد</span>
            <span style={{fontWeight:800, color:"#EF4444", direction:"ltr"}}>{fmt(creditNote.total.toFixed(2))}</span>
          </div>
        </div>
      </div>

      {creditNote.notes && <div style={{padding:10, background:T.bg, borderRadius:6, marginBottom:14, fontSize:FS-1}}>
        <div style={{fontSize:FS-3, color:T.textSec, fontWeight:600, marginBottom:4}}>سبب المرتجع</div>
        <div style={{whiteSpace:"pre-wrap"}}>{creditNote.notes}</div>
      </div>}

      <div style={{padding:10, background:T.bg, borderRadius:6, marginBottom:14, fontSize:FS-2}}>
        <div style={{display:"flex", flexDirection:"column", gap:4}}>
          <div>📝 أُنشئ: <b>{(creditNote.createdAt||"").split("T")[0]}</b> {creditNote.createdBy && <>بواسطة <b>{creditNote.createdBy}</b></>}</div>
          {creditNote.postedAt && <div>✅ مُرحّل: <b>{creditNote.postedAt.split("T")[0]}</b> {creditNote.postedBy && <>بواسطة <b>{creditNote.postedBy}</b></>}</div>}
          {creditNote.voidedAt && <div style={{color:T.err}}>❌ مُلغى: <b>{creditNote.voidedAt.split("T")[0]}</b> {creditNote.voidedBy && <>بواسطة <b>{creditNote.voidedBy}</b></>} {creditNote.voidReason && <>— {creditNote.voidReason}</>}</div>}
        </div>
      </div>

      <div style={{display:"flex", gap:8, justifyContent:"flex-end", flexWrap:"wrap"}}>
        <Btn ghost onClick={onClose}>إغلاق</Btn>
        {/* V18.51: print button */}
        <Btn onClick={() => {
          const customer = (data.customers||[]).find(c => c.id === creditNote.customerId);
          const factoryInfo = data.factoryInfo || data.businessSettings || {};
          printCreditNote(creditNote, customer, factoryInfo);
        }} style={{background:T.accent+"12", color:T.accent, border:"1px solid "+T.accent+"30"}}>🖨️ طباعة</Btn>
        {creditNote.status === "draft" && <>
          <Btn onClick={() => onDelete(creditNote)} style={{background:T.err+"15", color:T.err, border:"1px solid "+T.err+"40"}}>🗑 حذف المسودة</Btn>
          <Btn primary onClick={() => onPost(creditNote)} style={{background:STATUS_META.posted.color, color:"#fff", border:"none"}}>✅ ترحيل</Btn>
        </>}
        {creditNote.status === "posted" && <Btn onClick={() => onVoid(creditNote)} style={{background:T.err+"15", color:T.err, border:"1px solid "+T.err+"40"}}>❌ إلغاء</Btn>}
      </div>
    </div>
  </div>;
}
