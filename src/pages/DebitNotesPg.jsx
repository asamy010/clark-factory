/* ═══════════════════════════════════════════════════════════════════════
   CLARK · DebitNotesPg (V19.41)
   ───────────────────────────────────────────────────────────────────────
   Lists purchase debit notes (إشعارات مدينة = مرتجعات المشتريات).
   Mirror of CreditNotesPg with the supplier-side accounting:
     Draft → Posted → Void
   When posted, generates a journal entry that reduces what we owe the
   supplier (Dr موردون) and credits the contra-expense account
   (Cr مرتجع المشتريات), reducing our COGS.

   Entry points to this page:
     1) Direct nav from sidebar ("إشعارات مدينة")
     2) "↪️ ارتجاع للمورد" button on a posted purchase invoice (V19.41)
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo, useEffect } from "react";
import { Btn, Card, Inp, Sel } from "../components/ui.jsx";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { fmt } from "../utils/format.js";
import { ask, showToast } from "../utils/popups.js";
import {
  postDebitNoteMutator, debitNotePostBlocker, voidDebitNoteMutator, deleteDraftDebitNoteMutator,
  getDebitNoteStats,
} from "../utils/invoices.js";
import { autoPost } from "../utils/accounting/autoPost.js";
import { printDebitNote } from "../utils/printInvoice.js";
import { FreeSupplierReturnModal } from "../components/purchase/FreeSupplierReturnModal.jsx";/* V21.27.81: مرتجع مورد حر */
import { PrintPriceChoiceModal } from "../components/PrintPriceChoiceModal.jsx";/* V21.27.84: طباعة مع/بدون أسعار */
/* V19.39: Bulk-post toolbar shared with the other invoice pages */
import { BulkPostHeader, RowCheckbox, BulkPostBar } from "../components/BulkPostBar.jsx";

const STATUS_META = {
  draft:  { label: "مسودة",  color: "#6B7280", bg: "#6B728015" },
  posted: { label: "مرحّل",  color: "#10B981", bg: "#10B98115" },
  void:   { label: "ملغي",    color: "#EF4444", bg: "#EF444415" },
};

export function DebitNotesPg({data, upConfig, isMob, user}){
  const today = new Date().toISOString().split("T")[0];
  const monthStart = today.slice(0,7) + "-01";
  const [from, setFrom]   = useState(monthStart);
  const [to, setTo]       = useState(today);
  const [status, setStatus] = useState("all");
  const [partyId, setPartyId] = useState("");
  const [search, setSearch]   = useState("");
  const [activeDN, setActiveDN] = useState(null);
  const [showAddReturn, setShowAddReturn] = useState(false);/* V21.27.81: مودال المرتجع الحر */
  /* V19.39 — multi-select for bulk posting */
  const [selectedIds, setSelectedIds] = useState(new Set());

  const debitNotes = data.purchaseDebitNotes || [];
  const suppliers = data.suppliers || [];
  const userName = user?.displayName || (user?.email||"").split("@")[0] || "";

  const filtered = useMemo(() => {
    let list = debitNotes;
    if(from) list = list.filter(dn => (dn.date||"") >= from);
    if(to)   list = list.filter(dn => (dn.date||"") <= to);
    if(status !== "all") list = list.filter(dn => dn.status === status);
    if(partyId) list = list.filter(dn => dn.supplierId === partyId);
    if(search.trim()){
      const q = search.trim().toLowerCase();
      list = list.filter(dn =>
        (dn.debitNoteNo||"").toLowerCase().includes(q) ||
        (dn.supplierName||"").toLowerCase().includes(q) ||
        (dn.linkedInvoiceNo||"").toLowerCase().includes(q)
      );
    }
    return list.slice().sort((a,b) => (b.date||"").localeCompare(a.date||"") || (b.debitNoteNo||"").localeCompare(a.debitNoteNo||""));
  }, [debitNotes, from, to, status, partyId, search]);

  const stats = useMemo(() => getDebitNoteStats(data, {from, to, partyId, status}), [data, from, to, partyId, status]);

  /* V18.90: Listen for notification deep-links */
  useEffect(() => {
    const handler = (e) => {
      const d = e?.detail;
      if(!d || d.type !== "debitNote") return;
      const dn = debitNotes.find(x => x.id === d.debitNoteId);
      if(dn) setActiveDN(dn);
    };
    window.addEventListener("notif-deeplink", handler);
    return () => window.removeEventListener("notif-deeplink", handler);
  }, [debitNotes]);

  const handlePost = async (dn, opts = {}) => {
    /* V19.39: silent mode — used by bulk-post bar */
    const silent = opts.silent === true;
    if(!silent){
      if(!await ask(
        "ترحيل إشعار مدين",
        "ترحيل إشعار "+dn.debitNoteNo+" بمبلغ "+fmt(dn.total.toFixed(2))+"؟\n\nسيتم إنشاء قيد محاسبي يقلل ما نحن مدينون به للمورد ويسجل المرتجع كـ contra-expense.",
        {confirmText:"ترحيل"}
      )) return;
    }
    const supplier = (data.suppliers||[]).find(s => s.id === dn.supplierId);
    /* V21.27.63: تشخيص دقيق قبل الترحيل (نظير الإشعارات الدائنة). */
    const blocker = debitNotePostBlocker(data, dn.id);
    if(blocker){
      if(!silent) showToast("⛔ تعذّر ترحيل " + dn.debitNoteNo + ": " + blocker);
      throw new Error(blocker);
    }
    /* V19.56: AWAIT every write — see SalesInvoicesPg.handlePost for reasoning. */
    try {
      /* V21.27.62: نفس إصلاح الإشعارات الدائنة — ما نقولش «تم الترحيل» إلا لما
         الحفظ يثبت على السيرفر. upConfig {ok:false} (أهمها: مستند يوم الإشعار
         تعدّى 1 ميجا). */
      let posted = false;
      const r1 = await upConfig(d => { posted = postDebitNoteMutator(d, dn.id, userName); });
      if(r1 && r1.ok === false){
        const sizeHint = (r1.phase === "split-sync" || r1.phase === "fallback-sync");
        throw new Error("فشل الحفظ على السيرفر" + (sizeHint
          ? " — غالباً مستند يوم الإشعار (" + (dn.date || "؟") + ") تعدّى حد 1 ميجا. راجع «التشخيص ← إشعارات مدينة (يومي)»."
          : (r1.error ? " — " + r1.error : "")));
      }
      if(!posted){
        throw new Error(debitNotePostBlocker(data, dn.id) || "الإشعار لم يُرحّل لسبب غير متوقّع — أعد المحاولة.");
      }
      const postedDN = {...dn, status:"posted", postedAt: new Date().toISOString(), postedBy: userName};
      const res = await autoPost.debitNotePosted(data, postedDN, supplier, userName);
      if(res && res.ok && res.entry){
        await upConfig(d => {
          const idx = (d.purchaseDebitNotes||[]).findIndex(x => x.id === dn.id);
          if(idx >= 0){
            d.purchaseDebitNotes[idx].postedJournalRef = {
              date: res.entry.date,
              entryId: res.entry.id,
              refNo: res.entry.refNo,
            };
          }
        });
      }
      if(!silent){
        showToast("✓ تم الترحيل");
        setActiveDN(null);
      }
    } catch(e){
      console.warn("[debitNotePost] failed for", dn.debitNoteNo, e);
      if(!silent) showToast("⚠ تعذّر ترحيل "+dn.debitNoteNo+(e?.message?": "+e.message:""));
      throw e;
    }
  };

  const handleVoid = async (dn) => {
    if(!await ask("إلغاء إشعار مدين", "إلغاء إشعار "+dn.debitNoteNo+"؟\n\nسيتم إنشاء قيد عكسي.", {danger:true,confirmText:"إلغاء"})) return;
    upConfig(d => { voidDebitNoteMutator(d, dn.id, userName, "إلغاء يدوي"); });
    if(dn.postedJournalRef){
      autoPost.debitNoteVoided(data, dn, userName).catch(e => console.warn("[void dn] failed:", e));
    }
    showToast("✓ تم الإلغاء");
    setActiveDN(null);
  };

  const handleDelete = async (dn) => {
    if(!await ask("حذف المسودة", "حذف مسودة الإشعار "+dn.debitNoteNo+"؟", {danger:true,confirmText:"حذف"})) return;
    upConfig(d => { deleteDraftDebitNoteMutator(d, dn.id); });
    showToast("✓ تم الحذف");
    setActiveDN(null);
  };

  return <div style={{padding:isMob?12:20, maxWidth:1400, margin:"0 auto"}}>
    <div style={{display:"flex", alignItems:"center", gap:12, marginBottom:16, flexWrap:"wrap"}}>
      <span style={{fontSize:isMob?22:28}}>↪️</span>
      <div style={{flex:1, minWidth:200}}>
        <div style={{fontSize:isMob?18:22, fontWeight:800, color:T.text}}>إشعارات مدينة (مرتجعات المشتريات)</div>
        <div style={{fontSize:FS-2, color:T.textSec}}>عرض وإدارة مرتجعات المشتريات للموردين (مسودة / مرحّل / ملغية)</div>
      </div>
      {/* V21.27.81: مرتجع مورد حر — مش مربوط باستلام واحد */}
      <Btn primary onClick={()=>setShowAddReturn(true)} style={{background:"#3B82F6",color:"#fff",border:"none",fontWeight:800,whiteSpace:"nowrap"}}>➕ إضافة مرتجع</Btn>
    </div>

    {showAddReturn && <FreeSupplierReturnModal
      data={data} upConfig={upConfig} user={user} isMob={isMob}
      onClose={()=>setShowAddReturn(false)}
      onCreated={()=>setShowAddReturn(false)}
    />}

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
          <Inp value={search} onChange={setSearch} placeholder="رقم إشعار / اسم مورد / رقم فاتورة..."/>
        </div>
      </div>
    </Card>

    {filtered.length === 0 ? <Card>
      <div style={{padding:30, textAlign:"center", color:T.textMut, fontSize:FS-1}}>
        💡 لا توجد إشعارات مدينة في هذه الفترة. لإنشاء إشعار، افتح فاتورة شراء مرحّلة في <b>فواتير المشتريات</b> واضغط "↪️ ارتجاع للمورد".
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
        {filtered.map(dn => {
          const meta = STATUS_META[dn.status] || STATUS_META.draft;
          const isDraft = dn.status === "draft";
          return <div key={dn.id} onClick={() => setActiveDN(dn)} style={{
            background: T.cardSolid, border:"1px solid "+T.brd, borderRadius:8,
            padding:"10px 12px", cursor:"pointer", display:"flex", alignItems:"center", gap:10, flexWrap:"wrap"
          }} onMouseEnter={e => e.currentTarget.style.background = T.bg}
             onMouseLeave={e => e.currentTarget.style.background = T.cardSolid}>
            <RowCheckbox id={dn.id} isDraft={isDraft} selectedIds={selectedIds} setSelectedIds={setSelectedIds}/>
            <div style={{minWidth: isMob?100:140}}>
              <div style={{fontFamily:"monospace", fontSize:FS-1, fontWeight:800, color:"#3B82F6"}}>{dn.debitNoteNo}</div>
              <div style={{fontSize:FS-3, color:T.textMut, fontFamily:"monospace"}}>{dn.date}</div>
            </div>
            <div style={{flex:1, minWidth:120}}>
              <div style={{fontSize:FS-1, fontWeight:700, color:T.text}}>{dn.supplierName}</div>
              <div style={{fontSize:FS-3, color:T.textSec}}>
                {(dn.items||[]).length} بند • {(dn.items||[]).reduce((s,it)=>s+(Number(it.qty)||0),0)} وحدة
                {dn.linkedInvoiceNo && <span style={{marginInlineStart:8, color:T.accent, fontFamily:"monospace"}}>↩ {dn.linkedInvoiceNo}</span>}
              </div>
            </div>
            <div style={{textAlign:"left", direction:"ltr", minWidth:100}}>
              <div style={{fontSize:FS, fontWeight:800, color:T.text}}>{fmt((Number(dn.total)||0).toFixed(2))}</div>
            </div>
            <span style={{padding:"4px 10px", borderRadius:6, fontSize:FS-2, fontWeight:700, background:meta.bg, color:meta.color, border:"1px solid "+meta.color+"30"}}>{meta.label}</span>
          </div>;
        })}
      </div>}

    {activeDN && <DebitNoteDetailModal
      debitNote={activeDN} data={data}
      onClose={() => setActiveDN(null)}
      onPost={handlePost} onVoid={handleVoid} onDelete={handleDelete}
      isMob={isMob}
    />}
    {/* V19.39: Floating bulk-post bar */}
    <BulkPostBar
      selectedIds={selectedIds}
      setSelectedIds={setSelectedIds}
      allItems={filtered}
      postOne={handlePost}
      itemLabel="إشعار مدين"
      isMob={isMob}
    />
  </div>;
}

function DebitNoteDetailModal({debitNote, data, onClose, onPost, onVoid, onDelete, isMob}){
  const meta = STATUS_META[debitNote.status] || STATUS_META.draft;
  const [printChoice, setPrintChoice] = useState(false);/* V21.27.84: اختيار مع/بدون أسعار */

  return <div style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.65)", zIndex:10001, display:"flex", alignItems:"center", justifyContent:"center", padding:16}} onClick={onClose}>
    {printChoice && <PrintPriceChoiceModal title={"طباعة المرتجع "+(debitNote.debitNoteNo||"")} onPick={(sp)=>{ setPrintChoice(false); const supplier=(data.suppliers||[]).find(s=>s.id===debitNote.supplierId); const factoryInfo=data.factoryInfo||data.businessSettings||{}; printDebitNote(debitNote, supplier, factoryInfo, sp); }} onClose={()=>setPrintChoice(false)} />}
    <div onClick={e => e.stopPropagation()} style={{
      background:T.cardSolid, borderRadius:14, padding:isMob?16:24,
      width:"100%", maxWidth:800, maxHeight:"90vh", overflowY:"auto",
      border:"1px solid "+T.brd, boxShadow:"0 25px 70px rgba(0,0,0,0.4)"
    }}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16, paddingBottom:12, borderBottom:"2px solid "+T.brd, gap:10, flexWrap:"wrap"}}>
        <div>
          <div style={{display:"flex", alignItems:"center", gap:10, flexWrap:"wrap"}}>
            <span style={{fontSize:24}}>↪️</span>
            <div>
              <div style={{fontSize:FS-1, color:T.textSec, fontWeight:600}}>إشعار مدين (مرتجع مشتريات)</div>
              <div style={{fontFamily:"monospace", fontSize:FS+4, fontWeight:800, color:"#3B82F6"}}>{debitNote.debitNoteNo}</div>
              {debitNote.linkedInvoiceNo && <div style={{fontSize:FS-2, color:T.textSec, marginTop:2}}>للفاتورة: <span style={{fontFamily:"monospace", color:T.accent, fontWeight:700}}>{debitNote.linkedInvoiceNo}</span></div>}
            </div>
          </div>
        </div>
        <span style={{padding:"6px 14px", borderRadius:8, fontSize:FS, fontWeight:800, background:meta.bg, color:meta.color, border:"2px solid "+meta.color+"40"}}>{meta.label}</span>
      </div>

      <div style={{display:"grid", gridTemplateColumns:isMob?"1fr 1fr":"repeat(3,1fr)", gap:8, marginBottom:14}}>
        <div style={{padding:8, background:T.bg, borderRadius:6}}>
          <div style={{fontSize:FS-3, color:T.textSec, fontWeight:600}}>المورد</div>
          <div style={{fontSize:FS-1, fontWeight:700, color:T.text}}>{debitNote.supplierName}</div>
        </div>
        <div style={{padding:8, background:T.bg, borderRadius:6}}>
          <div style={{fontSize:FS-3, color:T.textSec, fontWeight:600}}>التاريخ</div>
          <div style={{fontSize:FS-1, fontWeight:700, color:T.text, fontFamily:"monospace"}}>{debitNote.date}</div>
        </div>
        <div style={{padding:8, background:T.bg, borderRadius:6, gridColumn: isMob?"1/3":"auto"}}>
          <div style={{fontSize:FS-3, color:T.textSec, fontWeight:600}}>أنشأها</div>
          <div style={{fontSize:FS-1, fontWeight:700, color:T.text}}>{debitNote.createdBy||"—"}</div>
        </div>
      </div>

      <div style={{border:"1px solid "+T.brd, borderRadius:8, overflow:"hidden", marginBottom:14}}>
        <table style={{width:"100%", borderCollapse:"collapse", fontSize:FS-1}}>
          <thead>
            <tr style={{background:"#3B82F608"}}>
              <th style={{padding:"8px 10px", textAlign:"right", color:T.textSec, fontWeight:800, fontSize:FS-2, borderBottom:"2px solid "+T.brd}}>الصنف المُرتجع</th>
              <th style={{padding:"8px 10px", textAlign:"center", color:T.textSec, fontWeight:800, fontSize:FS-2, borderBottom:"2px solid "+T.brd, width:80}}>الكمية</th>
              <th style={{padding:"8px 10px", textAlign:"center", color:T.textSec, fontWeight:800, fontSize:FS-2, borderBottom:"2px solid "+T.brd, width:100}}>السعر</th>
              <th style={{padding:"8px 10px", textAlign:"center", color:T.textSec, fontWeight:800, fontSize:FS-2, borderBottom:"2px solid "+T.brd, width:120}}>الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {(debitNote.items||[]).map((it,i) => <tr key={i} style={{borderTop:"1px solid "+T.brd}}>
              <td style={{padding:"8px 10px"}}>
                <div style={{fontWeight:700, color:T.text}}>{it.name||"—"}</div>
                {it.itemType && <div style={{fontSize:FS-3, color:T.textMut}}>{it.itemType}</div>}
              </td>
              <td style={{padding:"8px 10px", textAlign:"center", direction:"ltr", fontWeight:600}}>{fmt(it.qty)}</td>
              <td style={{padding:"8px 10px", textAlign:"center", direction:"ltr", color:T.textSec}}>{fmt(Number(it.unitPrice||0).toFixed(2))}</td>
              <td style={{padding:"8px 10px", textAlign:"center", direction:"ltr", fontWeight:700, color:"#3B82F6"}}>{fmt(Number(it.lineTotal||0).toFixed(2))}</td>
            </tr>)}
          </tbody>
        </table>
      </div>

      <div style={{display:"flex", justifyContent:"flex-end", marginBottom:14}}>
        <div style={{minWidth:isMob?"100%":300, padding:14, background:"#3B82F608", borderRadius:8, border:"1px solid #3B82F625"}}>
          <div style={{display:"flex", justifyContent:"space-between", padding:"4px 0", fontSize:FS-1}}>
            <span style={{color:T.textSec}}>الإجمالي قبل الخصم</span>
            <span style={{fontWeight:700, direction:"ltr"}}>{fmt(Number(debitNote.subtotal||0).toFixed(2))}</span>
          </div>
          {(Number(debitNote.discount)||0) > 0 && <div style={{display:"flex", justifyContent:"space-between", padding:"4px 0", fontSize:FS-1, color:T.textMut}}>
            <span>الخصم{debitNote.discountPct ? ` (${(Number(debitNote.discountPct)||0).toFixed(1)}%)` : ""}</span>
            <span style={{fontWeight:700, direction:"ltr"}}>-{fmt(Number(debitNote.discount||0).toFixed(2))}</span>
          </div>}
          <div style={{display:"flex", justifyContent:"space-between", padding:"8px 0", fontSize:FS+2, borderTop:"2px solid #3B82F6", marginTop:6}}>
            <span style={{fontWeight:800, color:T.text}}>المستحق رد من المورد</span>
            <span style={{fontWeight:800, color:"#3B82F6", direction:"ltr"}}>{fmt(Number(debitNote.total||0).toFixed(2))}</span>
          </div>
        </div>
      </div>

      {debitNote.notes && <div style={{padding:10, background:T.bg, borderRadius:6, marginBottom:14, fontSize:FS-1}}>
        <div style={{fontSize:FS-3, color:T.textSec, fontWeight:600, marginBottom:4}}>سبب المرتجع</div>
        <div style={{whiteSpace:"pre-wrap"}}>{debitNote.notes}</div>
      </div>}

      <div style={{padding:10, background:T.bg, borderRadius:6, marginBottom:14, fontSize:FS-2}}>
        <div style={{display:"flex", flexDirection:"column", gap:4}}>
          <div>📝 أُنشئ: <b>{(debitNote.createdAt||"").split("T")[0]}</b> {debitNote.createdBy && <>بواسطة <b>{debitNote.createdBy}</b></>}</div>
          {debitNote.postedAt && <div>✅ مُرحّل: <b>{debitNote.postedAt.split("T")[0]}</b> {debitNote.postedBy && <>بواسطة <b>{debitNote.postedBy}</b></>}</div>}
          {debitNote.voidedAt && <div style={{color:T.err}}>❌ مُلغى: <b>{debitNote.voidedAt.split("T")[0]}</b> {debitNote.voidedBy && <>بواسطة <b>{debitNote.voidedBy}</b></>} {debitNote.voidReason && <>— {debitNote.voidReason}</>}</div>}
        </div>
      </div>

      <div style={{display:"flex", gap:8, justifyContent:"flex-end", flexWrap:"wrap"}}>
        <Btn ghost onClick={onClose}>إغلاق</Btn>
        <Btn onClick={() => setPrintChoice(true)} style={{background:T.accent+"12", color:T.accent, border:"1px solid "+T.accent+"30"}}>🖨️ طباعة</Btn>
        {debitNote.status === "draft" && <>
          <Btn onClick={() => onDelete(debitNote)} style={{background:T.err+"15", color:T.err, border:"1px solid "+T.err+"40"}}>🗑 حذف المسودة</Btn>
          <Btn primary onClick={() => onPost(debitNote)} style={{background:STATUS_META.posted.color, color:"#fff", border:"none"}}>✅ ترحيل</Btn>
        </>}
        {debitNote.status === "posted" && <Btn onClick={() => onVoid(debitNote)} style={{background:T.err+"15", color:T.err, border:"1px solid "+T.err+"40"}}>❌ إلغاء</Btn>}
      </div>
    </div>
  </div>;
}
