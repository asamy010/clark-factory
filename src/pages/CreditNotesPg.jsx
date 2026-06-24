/* ═══════════════════════════════════════════════════════════════════════
   CLARK · CreditNotesPg (V18.51)
   ───────────────────────────────────────────────────────────────────────
   Lists sales credit notes (إشعارات دائنة = مرتجعات المبيعات).
   Same UX as SalesInvoicesPg with a similar workflow:
     Draft → Posted → Void
   The credit note creates reversed accounting entries when posted.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { Btn, Card, Inp, Sel, SearchSel } from "../components/ui.jsx";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { fmt } from "../utils/format.js";
import { sumQtyByUnit, fmtQtyByUnit } from "../utils/docColumns.js";
import { ask, showToast } from "../utils/popups.js";
import {
  postCreditNoteMutator, creditNotePostBlocker, voidCreditNoteMutator, deleteDraftCreditNoteMutator,
  getCreditNoteStats, buildCreditNoteFromReturn, upsertCreditNoteFromReturn, findCreditNoteByReturn,
  postInvoiceMutator,
} from "../utils/invoices.js";
import { autoPost } from "../utils/accounting/autoPost.js";
import { removeOperationalReturnForCreditNote, computeDirectSoReturnables, returnFromDirectSalesOrderMutator } from "../utils/sales/salesOrders.js";
import { printCreditNote } from "../utils/printInvoice.js";
/* V19.39: Bulk-post toolbar shared with SalesInvoicesPg + PurchaseInvoicesPg */
import { BulkPostHeader, RowCheckbox, BulkPostBar } from "../components/BulkPostBar.jsx";

const STATUS_META = {
  draft:  { label: "مسودة",  color: "#6B7280", bg: "#6B728015" },
  posted: { label: "مرحّل",  color: "#10B981", bg: "#10B98115" },
  void:   { label: "ملغي",    color: "#EF4444", bg: "#EF444415" },
};

export function CreditNotesPg({data, upConfig, updOrder, isMob, user}){
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
  /* V21.21.48: guided "add return" popup (إضافة مرتجع) */
  const [showAddReturn, setShowAddReturn] = useState(false);

  const creditNotes = data.salesCreditNotes || [];
  const customers = data.customers || [];
  const userName = user?.displayName || (user?.email||"").split("@")[0] || "";

  const filtered = useMemo(() => {
    /* V21.21.59: إشعارات الخصم (kind=discount) مش مرتجعات — تتعرض في كشف الحساب
       فقط، مش في صفحة المرتجعات دي. */
    let list = creditNotes.filter(c => c && c.kind !== "discount");
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

  /* V21.27.64: ترحيل فاتورة مبيعات مربوطة بإشعار دائن — يكرّر مسار
     SalesInvoicesPg.handlePost بالظبط (mutator → autoPost → postedJournalRef)
     عشان الفاتورة تترحّل بقيودها الكاملة (إيراد + COGS) مش مجرد قلب الحالة.
     بيرمي Error واضح لو فشل الحفظ أو لو الفاتورة مش قابلة للترحيل. */
  const postLinkedSalesInvoice = async (inv) => {
    const invCustomer = (data.customers||[]).find(c => c.id === inv.customerId);
    const invOrderId = inv.deliveryRef && inv.deliveryRef.orderId;
    const invOrder = invOrderId ? (data.orders||[]).find(o => o.id === invOrderId) : null;
    /* نقرأ الحالة من d الطازج جوّه الـ mutator (مش من prop data القديمة) عشان
       نتعامل مع حالة الـ cascade المكرّر: إشعارين على نفس الفاتورة في ترحيل
       جماعي — الأول يرحّلها، التاني يلاقيها «مرحّلة» فيتعامل معاها كنجاح idempotent
       بدل ما يرمي خطأ. */
    let invResult = "";
    const ri = await upConfig(d => {
      const it = (d.salesInvoices||[]).find(i => i.id === inv.id);
      if(!it){ invResult = "not-found"; return; }
      if(it.status === "posted"){ invResult = "already-posted"; return; }
      invResult = postInvoiceMutator(d, inv.id, "sales", userName) ? "posted" : "blocked";
    });
    if(ri && ri.ok === false){
      throw new Error("فشل حفظ ترحيل الفاتورة " + (inv.invoiceNo || "") + (ri.error ? " — " + ri.error : ""));
    }
    if(invResult === "already-posted") return; /* اتعملت في cascade سابق — القيود موجودة */
    if(invResult !== "posted"){
      throw new Error("تعذّر ترحيل الفاتورة المرتبطة " + (inv.invoiceNo || "") + " — تأكد إنها مسودة وبعميل صالح.");
    }
    const postedInv = {...inv, status:"posted", postedAt: new Date().toISOString(), postedBy: userName};
    const res = await autoPost.salesInvoicePosted(data, postedInv, invCustomer, invOrder, userName);
    if(res && res.main && res.main.ok && res.main.entry){
      await upConfig(d => {
        const idx = (d.salesInvoices||[]).findIndex(i => i.id === inv.id);
        if(idx >= 0){
          d.salesInvoices[idx].postedJournalRef = {
            date: res.main.entry.date,
            entryId: res.main.entry.id,
            refNo: res.main.entry.refNo,
            cogsDate: res.cogs && res.cogs.entry ? res.cogs.entry.date : null,
            cogsEntryId: res.cogs && res.cogs.entry ? res.cogs.entry.id : null,
            cogsRefNo: res.cogs && res.cogs.entry ? res.cogs.entry.refNo : null,
          };
        }
      });
    }
  };

  const handlePost = async (cn, opts = {}) => {
    /* V19.39: silent mode used by bulk-post bar */
    const silent = opts.silent === true;
    if(!silent){
      if(!await ask("ترحيل إشعار دائن", "ترحيل إشعار "+cn.creditNoteNo+" بمبلغ "+fmt(cn.total.toFixed(2))+"؟\n\nسيتم إنشاء قيد محاسبي عكسي للبيع الأصلي.", {confirmText:"ترحيل"})) return;
    }
    const customer = (data.customers||[]).find(c => c.id === cn.customerId);
    const orderId = cn.returnRef && cn.returnRef.orderId;
    const order = orderId ? (data.orders||[]).find(o => o.id === orderId) : null;
    /* V21.27.63: تشخيص دقيق قبل الترحيل — بدل رسالة الفشل المبهمة، نحدد السبب
       بالظبط (الفاتورة المرتبطة مش مرحّلة / مش مسودة / لسه بتحمّل). أكثر سبب
       شيوعاً هو guard V21.9.92: الإشعار مربوط بفاتورة مش مرحّلة. */
    let cascadedInvoiceNo = null; /* V21.27.64: لو رحّلنا الفاتورة المرتبطة كمان */
    const blocker = creditNotePostBlocker(data, cn.id);
    if(blocker){
      /* V21.27.64: لو السبب الوحيد إن الفاتورة المرتبطة لسه مسودة (الإشعار نفسه
         مسودة)، نعرض «رحّل الفاتورة + الإشعار معاً» بدل ما نرفض. ده اختيار Ahmed —
         بيحافظ على حماية V21.9.92 (الفاتورة بتترحّل فعلاً الأول بقيودها الكاملة)
         ويوفّر خطوتين. الفردي بيسأل تأكيد؛ الجماعي بيعمل cascade تلقائي. */
      const linkedInv = cn.linkedInvoiceId ? (data.salesInvoices||[]).find(i => i.id === cn.linkedInvoiceId) : null;
      const cascadeable = cn.status === "draft" && linkedInv && linkedInv.status === "draft";
      if(cascadeable){
        let cascade = silent; /* الجماعي = موافقة ضمنية على الـ cascade */
        if(!silent){
          cascade = await ask(
            "الفاتورة المرتبطة لسه مسودة",
            "الإشعار الدائن " + cn.creditNoteNo + " مربوط بالفاتورة " + (linkedInv.invoiceNo || cn.linkedInvoiceId) + " وهي لسه مسودة.\n\nأرحّل الفاتورة الأصلية أولاً (بقيودها المحاسبية) ثم الإشعار الدائن؟",
            {confirmText:"رحّل الاتنين"}
          );
        }
        if(!cascade){
          if(!silent) showToast("اتلغى — لازم ترحّل الفاتورة الأصلية الأول.");
          throw new Error(blocker);
        }
        /* رحّل الفاتورة المرتبطة بنفس مسار SalesInvoicesPg.handlePost الكامل.
           بعد الترحيل ما نعيدش الفحص ضد `data` (إنها prop قديمة لسه ما اتحدّثتش)؛
           postCreditNoteMutator التالي بيقرأ d الطازج فبيشوف الفاتورة «مرحّلة». */
        await postLinkedSalesInvoice(linkedInv);
        cascadedInvoiceNo = linkedInv.invoiceNo || cn.linkedInvoiceId;
      } else {
        if(!silent) showToast("⛔ تعذّر ترحيل " + cn.creditNoteNo + ": " + blocker);
        throw new Error(blocker);
      }
    }
    /* V19.56: AWAIT every write — see SalesInvoicesPg.handlePost for reasoning. */
    try {
      /* V21.27.62: ما نقولش «تم الترحيل» إلا لما الحفظ يثبت فعلاً على السيرفر.
         upConfig بيرجّع {ok:false} لو الكتابة فشلت — أهمها إن مستند يوم الإشعار
         (salesCreditNotesDays/{date}) تعدّى حد 1 ميجا. قبل كده النتيجة كانت
         بتتجاهل → رسالة نجاح كاذبة + قيد محاسبي يتيم. */
      let posted = false;
      const r1 = await upConfig(d => { posted = postCreditNoteMutator(d, cn.id, userName); });
      if(r1 && r1.ok === false){
        const sizeHint = (r1.phase === "split-sync" || r1.phase === "fallback-sync");
        throw new Error("فشل الحفظ على السيرفر" + (sizeHint
          ? " — غالباً مستند يوم الإشعار (" + (cn.date || "؟") + ") تعدّى حد 1 ميجا. راجع «التشخيص ← إشعارات دائنة (يومي)»."
          : (r1.error ? " — " + r1.error : "")));
      }
      if(!posted){
        /* وصلنا هنا رغم اجتياز الـ blocker → حالة سباق نادرة (البيانات اتغيّرت
           بين الفحص والكتابة). نعيد الفحص لرسالة دقيقة. */
        throw new Error(creditNotePostBlocker(data, cn.id) || "الإشعار لم يُرحّل لسبب غير متوقّع — أعد المحاولة.");
      }
      const postedCN = {...cn, status:"posted", postedAt: new Date().toISOString(), postedBy: userName};
      const res = await autoPost.creditNotePosted(data, postedCN, customer, order, userName);
      if(res && res.main && res.main.ok && res.main.entry){
        await upConfig(d => {
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
      if(!silent){
        showToast(cascadedInvoiceNo ? "✓ تم ترحيل الفاتورة " + cascadedInvoiceNo + " + الإشعار الدائن" : "✓ تم الترحيل");
        setActiveCN(null);
      }
    } catch(e){
      console.warn("[creditNotePost] failed for", cn.creditNoteNo, e);
      if(!silent) showToast("⚠ تعذّر ترحيل "+cn.creditNoteNo+(e?.message?": "+e.message:""));
      throw e;
    }
  };
  const handleVoid = async (cn) => {
    /* V21.27.101 (issue #4): ربط ثنائي — إلغاء الإشعار بيشيل المرتجع التشغيلي
       المرتبط كمان (يرجّع المخزون والرصيد) عشان الكشفين يفضلوا متطابقين. */
    if(!await ask("إلغاء إشعار دائن", "إلغاء إشعار "+cn.creditNoteNo+"؟\n\nسيتم إنشاء قيد عكسي + إلغاء المرتجع التشغيلي المرتبط (يرجّع المخزون وحساب العميل).", {danger:true,confirmText:"إلغاء"})) return;
    upConfig(d => { removeOperationalReturnForCreditNote(d, cn.id); voidCreditNoteMutator(d, cn.id, userName, "إلغاء يدوي"); });
    if(cn.postedJournalRef){
      autoPost.creditNoteVoided(data, cn, "creditNote", userName).catch(e => console.warn("[void cn main] failed:", e));
      autoPost.creditNoteVoided(data, cn, "creditNoteCogs", userName).catch(e => console.warn("[void cn cogs] failed:", e));
    }
    showToast("✓ تم الإلغاء — رجع المرتجع التشغيلي والمخزون");
    setActiveCN(null);
  };
  const handleDelete = async (cn) => {
    if(!await ask("حذف المسودة", "حذف مسودة الإشعار "+cn.creditNoteNo+"؟\n\nهيتلغي المرتجع التشغيلي المرتبط كمان (يرجّع المخزون والرصيد).", {danger:true,confirmText:"حذف"})) return;
    upConfig(d => { removeOperationalReturnForCreditNote(d, cn.id); deleteDraftCreditNoteMutator(d, cn.id); });
    showToast("✓ تم الحذف — رجع المرتجع التشغيلي والمخزون");
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
      {/* V21.21.48: إضافة مرتجع موجّه — اختيار العميل + الموديلات + ترحيل من نفس البوب اب */}
      <Btn primary onClick={() => setShowAddReturn(true)} style={{background:"#6366F1",color:"#fff",border:"none",fontWeight:800}}>
        ➕ إضافة مرتجع
      </Btn>
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
    {showAddReturn && <AddReturnModal
      data={data} userName={userName} isMob={isMob}
      upConfig={upConfig} updOrder={updOrder} onPost={handlePost}
      onClose={() => setShowAddReturn(false)}
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
          {/* V21.27.107: إجمالي الكمية المُرتجعة (مجمّع حسب الوحدة) */}
          {(creditNote.items||[]).length > 0 && <tfoot>
            <tr style={{borderTop:"2px solid "+T.brd, background:"#EF444408"}}>
              <td style={{padding:"8px 10px", fontWeight:800, color:T.text}}>الإجمالي</td>
              <td style={{padding:"8px 10px", textAlign:"center", direction:"ltr", fontWeight:800, color:T.text, whiteSpace:"nowrap"}}>{fmtQtyByUnit(sumQtyByUnit(creditNote.items))}</td>
              <td></td><td></td>
            </tr>
          </tfoot>}
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

/* ═══════════════════════════════════════════════════════════════════════
   V21.21.48 · AddReturnModal — «إضافة مرتجع» موجّه (بوب اب واحد)
   ───────────────────────────────────────────────────────────────────────
   مرحلتان:
   1) إنشاء: اختيار العميل → إضافة الموديلات اللي استلمها/لسه عنده منها كمية.
      تحت كل موديل: تواريخ التسليم + الكمية المُسلّمة لكل جلسة، رقم الفاتورة
      لو موجودة، صافي المتاح للإرجاع (= مُسلّم − مُرتجع سابق)، وحقل الكمية.
   2) تم: يظهر الإشعار الدائن المُنشأ مع أزرار: طباعة إذن المرتجع/PDF،
      ترحيل حسابات (من نفس البوب اب)، إغلاق.

   ▸ «تأكيد المرتجع» بيكتب على o.customerReturns (عبر updOrder) → ده اللي
     بينزّل من حساب العميل التشغيلي (statement.js / buildCustomerSummary)،
     وبيعمل مسودة إشعار دائن (upsertCreditNoteFromReturn). كله reuse للمنطق
     المالي المجرّب — مفيش حساب مالي جديد.
   ▸ حارس الإرجاع الزائد: الكمية ≤ صافي المُسلّم (إجمالي العميل لكل أوردر).
   ═══════════════════════════════════════════════════════════════════════ */
function AddReturnModal({ data, userName, isMob, upConfig, updOrder, onPost, onClose }){
  const orders = data.orders || [];
  const customers = (data.customers || []).filter(c => c && !c.archived);
  const [custId, setCustId]   = useState("");
  const [lines, setLines]     = useState([]);    /* [{orderId}] — صف لكل موديل */
  const [qtys, setQtys]       = useState({});     /* {orderId: "qty"} */
  const [note, setNote]       = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [busy, setBusy]       = useState(false);
  const [createdCN, setCreatedCN] = useState(null);  /* مرحلة «تم» */
  const [posting, setPosting] = useState(false);
  const [posted, setPosted]   = useState(false);
  /* V21.27.40: بوب اب عرض مستند مرتبط (فاتورة / أمر بيع) — قراءة فقط */
  const [docView, setDocView] = useState(null);  /* {kind:"invoice"|"so", doc} */

  const customer = customers.find(c => String(c.id) === String(custId)) || null;
  const custOpts = customers.map(c => ({ value: c.id, label: c.name + (c.phone ? " — " + c.phone : "") }));

  /* الموديلات القابلة للإرجاع لهذا العميل: صافي مُسلّم > 0 */
  const returnable = useMemo(() => {
    if(!custId) return [];
    const out = [];
    orders.forEach(o => {
      const dels = (o.customerDeliveries || []).filter(d => d.custId === custId);
      if(dels.length === 0) return;
      const rets = (o.customerReturns || []).filter(r => r.custId === custId);
      const delQty = dels.reduce((s, d) => s + (Number(d.qty) || 0), 0);
      const retQty = rets.reduce((s, r) => s + (Number(r.qty) || 0), 0);
      const net = delQty - retQty;
      if(net <= 0) return;
      /* تجميع التسليمات بالجلسة (تاريخ + كمية) */
      const bySess = {};
      dels.forEach(d => {
        const sid = d.sessionId || ("free_" + (d.date || ""));
        if(!bySess[sid]) bySess[sid] = { date: d.date || "", qty: 0 };
        bySess[sid].qty += Number(d.qty) || 0;
        if(d.date && (!bySess[sid].date || d.date < bySess[sid].date)) bySess[sid].date = d.date;
      });
      const sessions = Object.values(bySess).sort((a, b) => String(a.date).localeCompare(String(b.date)));
      /* فاتورة مرتبطة (غير ملغاة) لنفس العميل + الأوردر، إن وُجدت */
      const inv = (data.salesInvoices || []).find(i =>
        i && i.status !== "void" && i.customerId === custId &&
        Array.isArray(i.items) && i.items.some(it => it.orderId === o.id)
      );
      /* V21.27.40: أمر بيع مرتبط (غير ملغى) لنفس العميل + الأوردر، إن وُجد.
         بنود أمر البيع بتربط بالأوردر عبر sourceId (sourceType="order"). */
      const so = (data.salesOrders || []).find(s =>
        s && s.status !== "cancelled" &&
        (String(s.customerId) === String(custId) || String(s.custId) === String(custId)) &&
        Array.isArray(s.items) && s.items.some(it => it.sourceId === o.id || it.orderId === o.id)
      );
      out.push({
        orderId: o.id, modelNo: o.modelNo || "—", modelDesc: o.modelDesc || "",
        sellPrice: Number(o.sellPrice) || 0, net, delQty, retQty,
        sessions, invoiceNo: inv ? inv.invoiceNo : null, invoice: inv || null,
        salesOrder: so || null, image: o.image || null,
        kind: "dist",
      });
    });
    /* V21.27.112 (BUG FIX): الموديلات/الأصناف المباعة بـ «أمر بيع مباشر» — دي
       مابتعملش customerDeliveries (بتحجز المخزون فقط)، فكانت بتختفي تمامًا من
       «إضافة مرتجع» (اللي كان بيقرأ من customerDeliveries بس). دلوقتي بنضيفها من
       computeDirectSoReturnables: net = المُباع − اللي اترجّع. orderId = مفتاح
       مميّز ("direct:"+key) عشان مايتلخبطش مع مرتجع التوزيعة. */
    const dr = computeDirectSoReturnables(data.salesOrders)[custId];
    if(dr){
      const pushDirect = (m, itemType) => {
        const net = Math.max(0, (m.sold || 0) - (m.returned || 0));
        if(net <= 0) return;
        const ord = orders.find(x => x && x.id === m.sourceId) || null;
        out.push({
          orderId: "direct:" + (m.sourceId || m.modelNo || m.name),
          direct: true, kind: "direct", sourceId: m.sourceId,
          modelNo: m.modelNo || m.name || "—", modelDesc: m.modelDesc || (itemType ? (itemType === "generalProduct" ? "منتج عام" : itemType === "service" ? "خدمة" : "صنف مخزون") : ""),
          sellPrice: ord ? (Number(ord.sellPrice) || 0) : 0, net, delQty: m.sold || 0, retQty: m.returned || 0,
          sessions: [], invoiceNo: null, invoice: null, salesOrder: null, image: ord ? (ord.image || null) : null,
        });
      };
      Object.values(dr.models || {}).forEach(m => pushDirect(m, null));
      Object.values(dr.invItems || {}).forEach(m => pushDirect(m, m.itemType));
    }
    return out.sort((a, b) => String(a.modelNo).localeCompare(String(b.modelNo)));
  }, [custId, orders, data.salesInvoices, data.salesOrders]);

  const returnableMap = useMemo(() => Object.fromEntries(returnable.map(r => [r.orderId, r])), [returnable]);
  const searchResults = useMemo(() => {
    const inLines = new Set(lines.map(l => l.orderId));
    const q = modelSearch.trim().toLowerCase();
    return returnable.filter(r => !inLines.has(r.orderId) &&
      (!q || String(r.modelNo).toLowerCase().includes(q) || String(r.modelDesc).toLowerCase().includes(q)));
  }, [returnable, lines, modelSearch]);

  const addModel = (orderId) => { setLines(p => [...p, { orderId }]); setQtys(p => ({ ...p, [orderId]: "" })); setModelSearch(""); };
  const removeLine = (orderId) => { setLines(p => p.filter(l => l.orderId !== orderId)); setQtys(p => { const n = { ...p }; delete n[orderId]; return n; }); };
  const setQty = (orderId, v) => setQtys(p => ({ ...p, [orderId]: v.replace(/[^0-9]/g, "") }));

  const lineErr = (orderId) => {
    const r = returnableMap[orderId]; const q = Number(qtys[orderId]) || 0;
    if(q <= 0) return "أدخل كمية";
    if(r && q > r.net) return "أقصى مرتجع " + r.net;
    return null;
  };
  const totalQty = lines.reduce((s, l) => s + (Number(qtys[l.orderId]) || 0), 0);
  const valid = !!custId && lines.length > 0 && lines.every(l => !lineErr(l.orderId));

  const factoryInfo = data.factoryInfo || data.businessSettings || {};

  /* تأكيد: سجّل المرتجع على كل أوردر (يخصم من الحساب) + اعمل مسودة إشعار دائن */
  const confirmReturn = async () => {
    if(!valid || busy) return;
    if(typeof updOrder !== "function"){ showToast("⛔ تعذّر الكتابة على الأوردر — أعد فتح الصفحة"); return; }
    if(!await ask("تأكيد المرتجع", "تسجيل مرتجع " + totalQty + " قطعة لـ " + (customer?.name || "") + "؟\n\nهيُخصم من حساب العميل + يتعمل إشعار دائن مسودة.", { confirmText: "تأكيد" })) return;
    setBusy(true);
    try {
      const date = new Date().toISOString().split("T")[0];
      /* V21.27.112: افصل بين مرتجع التوزيعة (customerReturns) ومرتجع أمر البيع
         المباشر (so.returns عبر returnFromDirectSalesOrderMutator). */
      const distLines = lines.filter(l => !returnableMap[l.orderId]?.direct);
      const directLines = lines.filter(l => returnableMap[l.orderId]?.direct);
      const built = [];
      for(const l of distLines){
        const o = orders.find(x => x.id === l.orderId);
        if(!o) continue;
        const q = Number(qtys[l.orderId]) || 0;
        if(q <= 0) continue;
        /* اختم discPct من آخر تسليم لنفس العميل عليه خصم (مطابقة مرتجع سريع) */
        const dels = (o.customerDeliveries || []).filter(d => d.custId === custId);
        let discPct;
        const lastWithDisc = [...dels].reverse().find(d => d && d.discPct !== undefined && d.discPct !== null);
        if(lastWithDisc){ const n = Number(lastWithDisc.discPct); if(!isNaN(n)) discPct = n; }
        const retEntry = { custId, custName: customer?.name || "", qty: q, note: note.trim(), date, createdBy: userName || "" };
        if(discPct !== undefined) retEntry.discPct = discPct;
        retEntry._key = o.id + ":addReturn:" + custId + ":" + date + ":" + Math.random().toString(36).slice(2, 8);
        built.push({ order: o, retEntry });
        /* (أ) سجّل المرتجع على الأوردر → يخصم من حساب العميل التشغيلي */
        await updOrder(o.id, ord => { if(!ord.customerReturns) ord.customerReturns = []; ord.customerReturns.push(retEntry); });
      }
      /* (ب) مسودة إشعار دائن للتوزيعات — بتتدمج في إشعار واحد لنفس العميل/التاريخ */
      let cn = null;
      if(built.length){
        upConfig(d => {
          for(const b of built){
            const cust = (d.customers || []).find(c => c.id === custId) || customer;
            const res = upsertCreditNoteFromReturn(d, b.retEntry, b.order, cust, userName);
            if(res && res.creditNote) cn = res.creditNote;
          }
        });
      }
      /* (ج) مرتجع أوامر البيع المباشرة → so.returns + إشعار دائن (مستند منفصل) */
      let directCnId = null, directBlocked = [];
      if(directLines.length){
        const soReturns = directLines
          .map(l => ({ sourceId: returnableMap[l.orderId].sourceId, qty: Number(qtys[l.orderId]) || 0, note: note.trim() }))
          .filter(r => r.sourceId && r.qty > 0);
        if(soReturns.length){
          let res = null;
          upConfig(d => { res = returnFromDirectSalesOrderMutator(d, { customerId: custId, returns: soReturns }, userName); });
          if(res && res.ok){
            directBlocked = res.blocked || [];
            if(res.creditNotes && res.creditNotes.length) directCnId = res.creditNotes[res.creditNotes.length - 1].id;
          } else if(res && res.error){ showToast("⛔ " + res.error); }
        }
      }
      /* الإشعار المعروض في مرحلة «تم»: المباشر لو موجود (له items من المُولّد)، وإلا التوزيعة */
      setCreatedCN(directCnId ? { id: directCnId } : (cn ? JSON.parse(JSON.stringify(cn)) : null));
      showToast("✓ تم تسجيل المرتجع — اتخصم من حساب العميل" + (directBlocked.length ? " (بعض الكميات تجاوزت المتاح واتجاهلت)" : ""));
    } catch(e){
      showToast("⛔ تعذّر تسجيل المرتجع: " + (e?.message || e));
    } finally { setBusy(false); }
  };

  /* الإشعار من أحدث data (بعد ما الـ snapshot يحدّث)، fallback للنسخة المُلتقطة */
  const freshCN = createdCN ? ((data.salesCreditNotes || []).find(c => c.id === createdCN.id) || createdCN) : null;

  const doPrint = () => {
    if(!freshCN) return;
    printCreditNote(freshCN, customer, factoryInfo);
  };
  const doPost = async () => {
    if(!freshCN || posting || posted) return;
    if(freshCN.status === "posted"){ setPosted(true); return; }
    setPosting(true);
    try {
      await onPost(freshCN, { silent: true });
      setPosted(true);
      showToast("✓ تم ترحيل الإشعار للحسابات");
    } catch(e){
      showToast("⛔ تعذّر الترحيل: " + (e?.message || e));
    } finally { setPosting(false); }
  };

  const th = { padding: "7px 8px", textAlign: "center", color: T.textSec, fontWeight: 800, fontSize: FS - 2, borderBottom: "2px solid " + T.brd };
  const overlay = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 10002, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: isMob ? 8 : 24, overflowY: "auto" };
  const box = { background: T.cardSolid, borderRadius: 14, padding: isMob ? 14 : 22, width: "100%", maxWidth: 760, margin: "auto", border: "1px solid " + T.brd, boxShadow: "0 25px 70px rgba(0,0,0,0.4)", direction: "rtl" };

  /* ─── مرحلة «تم» ─── */
  if(createdCN) return <div style={overlay} onClick={onClose}>
    <div style={box} onClick={e => e.stopPropagation()}>
      <div style={{ textAlign: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 40 }}>✅</div>
        <div style={{ fontSize: FS + 4, fontWeight: 800, color: T.text }}>تم تسجيل المرتجع</div>
        <div style={{ fontSize: FS - 1, color: T.textSec }}>اتخصم من حساب <b>{customer?.name}</b> + اتعمل إشعار دائن مسودة</div>
      </div>
      <div style={{ border: "1px solid " + T.brd, borderRadius: 10, padding: 12, marginBottom: 14, background: T.bg }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          <div><span style={{ color: T.textSec, fontSize: FS - 2 }}>رقم الإشعار: </span><b style={{ color: "#EF4444", fontFamily: "monospace" }}>{freshCN.creditNoteNo}</b></div>
          <div><span style={{ color: T.textSec, fontSize: FS - 2 }}>الإجمالي المستحق رد: </span><b style={{ color: "#EF4444", direction: "ltr" }}>{fmt((Number(freshCN.total) || 0).toFixed(2))}</b></div>
          <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: FS - 2, fontWeight: 700, background: (STATUS_META[freshCN.status] || STATUS_META.draft).bg, color: (STATUS_META[freshCN.status] || STATUS_META.draft).color }}>{(STATUS_META[freshCN.status] || STATUS_META.draft).label}</span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FS - 1 }}>
          <thead><tr><th style={{ ...th, textAlign: "right" }}>الموديل</th><th style={th}>الكمية</th><th style={th}>السعر</th><th style={th}>الإجمالي</th></tr></thead>
          <tbody>{(freshCN.items || []).map((it, i) => <tr key={i} style={{ borderTop: "1px solid " + T.brd }}>
            <td style={{ padding: "6px 8px" }}><b>{it.modelNo || "—"}</b>{it.modelDesc ? <span style={{ color: T.textMut, fontSize: FS - 3 }}> — {it.modelDesc}</span> : ""}</td>
            <td style={{ padding: "6px 8px", textAlign: "center", direction: "ltr" }}>{fmt(it.qty)}</td>
            <td style={{ padding: "6px 8px", textAlign: "center", direction: "ltr", color: T.textSec }}>{fmt((Number(it.unitPrice) || 0).toFixed(2))}</td>
            <td style={{ padding: "6px 8px", textAlign: "center", direction: "ltr", fontWeight: 700, color: "#EF4444" }}>{fmt((Number(it.lineTotal) || 0).toFixed(2))}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <Btn ghost onClick={onClose}>إغلاق</Btn>
        <Btn onClick={doPrint} style={{ background: T.accent + "12", color: T.accent, border: "1px solid " + T.accent + "30" }}>🖨️ طباعة إذن المرتجع / PDF</Btn>
        {(freshCN.status === "draft" && !posted) ? <Btn primary onClick={doPost} disabled={posting} style={{ background: STATUS_META.posted.color, color: "#fff", border: "none" }}>{posting ? "⏳ جاري الترحيل..." : "✅ ترحيل حسابات"}</Btn>
          : <Btn disabled style={{ background: STATUS_META.posted.bg, color: STATUS_META.posted.color, border: "1px solid " + STATUS_META.posted.color + "40" }}>✓ مُرحّل للحسابات</Btn>}
      </div>
    </div>
  </div>;

  /* ─── مرحلة «إنشاء» ─── */
  return <div style={overlay} onClick={busy ? undefined : onClose}>
    <div style={box} onClick={e => e.stopPropagation()}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, paddingBottom: 10, borderBottom: "2px solid " + T.brd }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 24 }}>↩️</span>
          <div>
            <div style={{ fontSize: FS + 3, fontWeight: 800, color: "#6366F1" }}>إضافة مرتجع</div>
            <div style={{ fontSize: FS - 2, color: T.textSec }}>اختر العميل والموديلات اللي استلمها — هيتخصم من حسابه</div>
          </div>
        </div>
        <Btn ghost small onClick={onClose}>✕</Btn>
      </div>

      {/* اختيار العميل */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 600, display: "block", marginBottom: 4 }}>العميل</label>
        <SearchSel value={custId} onChange={v => { setCustId(v); setLines([]); setQtys({}); }} options={custOpts} placeholder="اختر العميل..." showAllOnFocus maxResults={20} />
      </div>

      {custId && <>
        {/* إضافة موديل */}
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 600, display: "block", marginBottom: 4 }}>أضف موديل اشتراه العميل (المتاح للإرجاع فقط)</label>
          <Inp value={modelSearch} onChange={setModelSearch} placeholder="🔍 ابحث برقم الموديل / الوصف..." />
          {modelSearch.trim() && <div style={{ border: "1px solid " + T.brd, borderRadius: 8, marginTop: 4, maxHeight: 180, overflowY: "auto", background: T.cardSolid }}>
            {searchResults.length === 0 ? <div style={{ padding: 12, textAlign: "center", color: T.textMut, fontSize: FS - 2 }}>لا يوجد موديل متاح للإرجاع بهذا البحث</div> :
              searchResults.slice(0, 25).map(r => <div key={r.orderId} onClick={() => addModel(r.orderId)} style={{ padding: "8px 10px", cursor: "pointer", borderTop: "1px solid " + T.brd, display: "flex", justifyContent: "space-between", gap: 8 }}
                onMouseEnter={e => e.currentTarget.style.background = T.bg} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <span style={{ fontWeight: 700, color: T.text }}>{r.modelNo}{r.direct ? <span style={{ marginInlineStart: 5, fontSize: FS - 4, fontWeight: 700, color: "#8B5CF6", background: "#8B5CF612", padding: "1px 6px", borderRadius: 20 }}>🧾 أمر مباشر</span> : ""}{r.modelDesc ? <span style={{ color: T.textMut, fontSize: FS - 3 }}> — {r.modelDesc}</span> : ""}</span>
                <span style={{ fontSize: FS - 2, color: T.ok, fontWeight: 700, whiteSpace: "nowrap" }}>متاح {r.net}</span>
              </div>)}
          </div>}
          {returnable.length === 0 && <div style={{ fontSize: FS - 2, color: T.textMut, marginTop: 6 }}>💡 العميل ده مفيش عنده موديلات متاحة للإرجاع (كل المُسلّم مُرتجع بالفعل).</div>}
        </div>

        {/* صفوف الموديلات المختارة */}
        {lines.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {lines.map(l => {
            const r = returnableMap[l.orderId]; if(!r) return null;
            const err = lineErr(l.orderId);
            return <div key={l.orderId} style={{ border: "1px solid " + (err ? T.err + "55" : T.brd), borderRadius: 10, padding: 10, background: T.bg }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 800, color: T.text }}>{r.modelNo}{r.modelDesc ? <span style={{ color: T.textMut, fontSize: FS - 3, fontWeight: 400 }}> — {r.modelDesc}</span> : ""}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: FS - 2, color: T.textSec }}>الكمية:</span>
                  <input value={qtys[l.orderId] || ""} onChange={e => setQty(l.orderId, e.target.value)} inputMode="numeric" placeholder={"≤ " + r.net}
                    style={{ width: 70, padding: "6px 8px", borderRadius: 7, border: "1px solid " + (err ? T.err : T.brd), textAlign: "center", direction: "ltr", fontWeight: 700, background: T.cardSolid, color: T.text, fontFamily: "inherit" }} />
                  <Btn ghost small onClick={() => removeLine(l.orderId)} style={{ color: T.err }}>🗑</Btn>
                </div>
              </div>
              {/* السياق: تسليمات (تاريخ + كمية) · فاتورة · صافي متاح */}
              <div style={{ marginTop: 8, fontSize: FS - 2, color: T.textSec, display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
                <span>📦 صافي متاح للإرجاع: <b style={{ color: T.ok }}>{r.net}</b> <span style={{ color: T.textMut }}>(مُسلّم {r.delQty} − مُرتجع {r.retQty})</span></span>
                {/* V21.27.40: لينك الفاتورة يفتح بوب اب قراءة فقط */}
                {r.invoice && <span onClick={() => setDocView({ kind: "invoice", doc: r.invoice })} title="اعرض الفاتورة" style={{ cursor: "pointer" }}>🧾 الفاتورة: <b style={{ color: T.accent, fontFamily: "monospace", textDecoration: "underline" }}>{r.invoiceNo}</b></span>}
                {/* V21.27.40: لينك أمر البيع (لو موجود) يفتح بوب اب قراءة فقط */}
                {r.salesOrder && <span onClick={() => setDocView({ kind: "so", doc: r.salesOrder })} title="اعرض أمر البيع" style={{ cursor: "pointer" }}>📄 أمر بيع: <b style={{ color: "#6366F1", fontFamily: "monospace", textDecoration: "underline" }}>{r.salesOrder.orderNo}</b></span>}
                <span>💰 السعر: <b style={{ direction: "ltr" }}>{fmt(r.sellPrice)}</b></span>
              </div>
              <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
                {r.sessions.map((s, i) => {
                  /* V21.27.40: كام يوم من تاريخ التسليم لحد النهاردة (أحمر) — يبيّن الصنف اتستلم من إمتى. */
                  const days = s.date ? Math.floor((Date.now() - new Date(s.date).getTime()) / 86400000) : null;
                  return <span key={i} style={{ fontSize: FS - 3, padding: "2px 8px", borderRadius: 6, background: T.accent + "10", color: T.accent, border: "1px solid " + T.accent + "25" }}>
                    📅 تسليم {s.date || "—"} · {s.qty} قطعة
                    {days != null && days >= 0 && <b style={{ color: T.err, marginInlineStart: 5 }}>· من {days} يوم</b>}
                  </span>;
                })}
              </div>
              {err && <div style={{ marginTop: 6, fontSize: FS - 3, color: T.err, fontWeight: 700 }}>⛔ {err}</div>}
            </div>;
          })}
        </div>}

        {/* سبب المرتجع */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 600, display: "block", marginBottom: 4 }}>سبب المرتجع (اختياري)</label>
          <Inp value={note} onChange={setNote} placeholder="سبب المرتجع..." />
        </div>
      </>}

      <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontSize: FS - 1, color: T.textSec }}>{lines.length > 0 && <>الإجمالي: <b style={{ color: T.text }}>{totalQty}</b> قطعة</>}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn ghost onClick={onClose} disabled={busy}>إلغاء</Btn>
          <Btn primary onClick={confirmReturn} disabled={!valid || busy} style={{ background: valid ? "#6366F1" : T.brd, color: "#fff", border: "none", fontWeight: 800 }}>{busy ? "⏳ جاري التسجيل..." : "↩️ تأكيد المرتجع (" + totalQty + ")"}</Btn>
        </div>
      </div>

      {/* V21.27.40: بوب اب عرض مستند مرتبط (فاتورة / أمر بيع) — قراءة فقط، فوق المودال */}
      {docView && (() => {
        const dv = docView.doc; const isInv = docView.kind === "invoice";
        const items = Array.isArray(dv.items) ? dv.items : [];
        const paid = Number(dv.paidAmount) || 0;
        const total = Number(dv.total) || 0;
        const remaining = total - paid;
        return <div onClick={() => setDocView(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.cardSolid, borderRadius: 16, padding: 20, width: "100%", maxWidth: 540, maxHeight: "85vh", overflowY: "auto", border: "1px solid " + T.brd, boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid " + T.brd }}>
              <div style={{ fontSize: FS + 1, fontWeight: 800, color: isInv ? T.accent : "#6366F1" }}>
                {isInv ? "🧾 فاتورة " : "📄 أمر بيع "}<span style={{ fontFamily: "monospace" }}>{isInv ? dv.invoiceNo : dv.orderNo}</span>
              </div>
              <Btn ghost small onClick={() => setDocView(null)}>✕</Btn>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", fontSize: FS - 2, color: T.textSec, marginBottom: 12 }}>
              <span>👤 {dv.customerName || customer?.name || "—"}</span>
              <span>📅 {dv.date || "—"}</span>
              {dv.status && <span>الحالة: <b style={{ color: T.text }}>{dv.status}</b></span>}
            </div>
            <div style={{ border: "1px solid " + T.brd, borderRadius: 8, overflow: "hidden" }}>
              <div style={{ display: "flex", padding: "6px 10px", background: T.bg, fontSize: FS - 3, fontWeight: 700, color: T.textSec }}>
                <span style={{ flex: 1 }}>الموديل</span><span style={{ width: 50, textAlign: "center" }}>كمية</span><span style={{ width: 70, textAlign: "left" }}>سعر</span><span style={{ width: 80, textAlign: "left" }}>إجمالي</span>
              </div>
              {items.length === 0 ? <div style={{ padding: 12, textAlign: "center", color: T.textMut, fontSize: FS - 2 }}>لا توجد بنود</div> :
                items.map((it, i) => {
                  const q = Number(it.qty) || 0;
                  const price = Number(it.unitPrice != null ? it.unitPrice : (it.price != null ? it.price : it.sellPrice)) || 0;
                  const lt = Number(it.total != null ? it.total : it.lineTotal) || (q * price);
                  return <div key={i} style={{ display: "flex", padding: "6px 10px", borderTop: "1px solid " + T.brd, fontSize: FS - 2, color: T.text }}>
                    <span style={{ flex: 1 }}>{it.modelNo || it.model || it.description || "—"}</span>
                    <span style={{ width: 50, textAlign: "center" }}>{q}</span>
                    <span style={{ width: 70, textAlign: "left", direction: "ltr" }}>{fmt(price)}</span>
                    <span style={{ width: 80, textAlign: "left", direction: "ltr", fontWeight: 700 }}>{fmt(lt)}</span>
                  </div>;
                })}
            </div>
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 4, fontSize: FS - 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: T.textSec }}>الإجمالي</span><b style={{ direction: "ltr" }}>{fmt(total)}</b></div>
              {isInv && paid > 0 && <>
                <div style={{ display: "flex", justifyContent: "space-between", color: T.ok }}><span>المدفوع</span><b style={{ direction: "ltr" }}>{fmt(paid)}</b></div>
                <div style={{ display: "flex", justifyContent: "space-between", color: remaining > 0 ? T.err : T.textSec }}><span>المتبقي</span><b style={{ direction: "ltr" }}>{fmt(remaining)}</b></div>
              </>}
            </div>
          </div>
        </div>;
      })()}
    </div>
  </div>;
}
