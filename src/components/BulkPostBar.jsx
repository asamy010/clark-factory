/* ═══════════════════════════════════════════════════════════════════════
   CLARK · BulkPostBar (V19.39)
   ───────────────────────────────────────────────────────────────────────
   Reusable selection toolbar shared by SalesInvoicesPg, PurchaseInvoicesPg,
   and CreditNotesPg. Handles:
     - "Select all drafts" toggle in the page header
     - A floating bottom bar showing N selected + total + bulk-post button
     - Confirmation prompt before posting
     - Sequential posting with progress feedback (one-by-one so the
       accounting auto-post can run cleanly per invoice without race
       conditions on the journal counter)

   The host page provides:
     - selectedIds: Set<string>
     - setSelectedIds: setter
     - draftItems: filtered list of items where status === "draft"
     - postOne: async (item) => void   (page's existing single-post handler)
     - itemLabel: "فاتورة" | "إشعار دائن"  (for confirmation copy)
     - totalKey: "total"  (in case some entity ever uses a different field)
   ═══════════════════════════════════════════════════════════════════════ */

import { useMemo, useState } from "react";
import { Btn } from "./ui.jsx";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { fmt } from "../utils/format.js";
import { ask, showToast } from "../utils/popups.js";

/* Header checkbox + counter — sits above the list. */
export function BulkPostHeader({selectedIds, setSelectedIds, draftItems, isMob}){
  const allSelected = draftItems.length > 0 && draftItems.every(it => selectedIds.has(it.id));
  const someSelected = !allSelected && draftItems.some(it => selectedIds.has(it.id));

  if(draftItems.length === 0) return null;

  const toggleAll = () => {
    if(allSelected){
      /* Deselect ONLY the visible drafts — preserves selections on items the
         filter is currently hiding, in case the user changes filters mid-flow. */
      setSelectedIds(prev => {
        const next = new Set(prev);
        draftItems.forEach(it => next.delete(it.id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        draftItems.forEach(it => next.add(it.id));
        return next;
      });
    }
  };

  return <div style={{
    display:"flex", alignItems:"center", gap:10, padding:"8px 12px",
    borderRadius:8, background:T.accent+"08", border:"1px solid "+T.accent+"25",
    marginBottom:8, fontSize:FS-1, flexWrap:"wrap"
  }}>
    <label style={{display:"flex", alignItems:"center", gap:8, cursor:"pointer", userSelect:"none"}}>
      <input
        type="checkbox"
        checked={allSelected}
        ref={el => { if(el) el.indeterminate = someSelected; }}
        onChange={toggleAll}
        style={{width:18, height:18, cursor:"pointer", accentColor:T.accent}}
      />
      <span style={{fontWeight:700, color:T.text}}>
        تحديد كل المسودات ({draftItems.length})
      </span>
    </label>
    {!isMob && <span style={{fontSize:FS-2, color:T.textMut, marginInlineStart:"auto"}}>
      💡 اضغط على الـ checkbox لكل مسودة تختار اللي عاوز ترحلها مرة واحدة
    </span>}
  </div>;
}

/* Single-row checkbox — host page renders this inside each invoice row.
   Stops click propagation so clicking the checkbox doesn't open the detail modal. */
export function RowCheckbox({id, isDraft, selectedIds, setSelectedIds}){
  if(!isDraft){
    /* Spacer so column widths stay aligned with checked rows */
    return <div style={{width:24, flexShrink:0}}/>;
  }
  const checked = selectedIds.has(id);
  return <input
    type="checkbox"
    checked={checked}
    onClick={e => e.stopPropagation()}
    onChange={e => {
      e.stopPropagation();
      setSelectedIds(prev => {
        const next = new Set(prev);
        if(e.target.checked) next.add(id);
        else next.delete(id);
        return next;
      });
    }}
    style={{width:20, height:20, cursor:"pointer", accentColor:T.accent, flexShrink:0}}
  />;
}

/* Floating action bar — appears at the bottom when any item is selected. */
export function BulkPostBar({selectedIds, setSelectedIds, allItems, postOne, itemLabel, totalKey="total", isMob}){
  /* Resolve the actual selected items (filtering out any IDs whose item is no longer a draft —
     could happen if user posted one individually while having a bulk selection). */
  const selectedItems = useMemo(
    () => allItems.filter(it => selectedIds.has(it.id) && it.status === "draft"),
    [allItems, selectedIds]
  );

  /* V19.54: Progress UI state. While `progress` is non-null we show a blocking
     full-screen modal so the user can't navigate away or trigger other actions
     mid-batch. Cancel flag is read each iteration; setting it stops the loop
     after the current item finishes (already-posted items stay posted). */
  const [progress, setProgress] = useState(null);

  const totalAmount = selectedItems.reduce((s, it) => s + (Number(it[totalKey]) || 0), 0);

  const runBulkPost = async () => {
    if(progress) return;/* defensive — already running */
    const n = selectedItems.length;
    if(n === 0) return;
    const ok = await ask(
      `ترحيل ${n} ${itemLabel}`,
      `هترحل ${n} ${itemLabel} بإجمالي ${fmt(totalAmount.toFixed(2))} جنيه.\n\nالعملية ممكن تاخد عدة ثواني (كل ${itemLabel} بترحل بقيد محاسبي مستقل). الشاشة هتتقفل لحد ما الترحيل يخلص.`,
      { confirmText: "ترحيل الكل" }
    );
    if(!ok) return;

    /* Snapshot the selection — selectedItems may re-memoize during the run as
       items flip from draft → posted. The snapshot is the source of truth for
       the loop. */
    const items = [...selectedItems];
    /* Cancel flag stored in a closure-captured object so the modal's cancel
       button can flip it without forcing a re-render dance. */
    const cancelRef = { cancelled: false };
    setProgress({
      total: items.length,
      done: 0,
      ok: 0,
      fail: 0,
      currentLabel: "",
      cancel: () => { cancelRef.cancelled = true; },
    });

    /* Sequential, not parallel — the accounting layer mutates a journal counter
       inside upConfig and parallel writes would race. Sequential is plenty fast
       for typical N (5-50 invoices) and avoids any cross-invoice corruption. */
    let okCount = 0, failCount = 0, cancelledAt = -1;
    /* V21.27.63: نجمّع أسباب الفشل (reason → عدد) عشان نعرضها للمستخدم في
       الملخّص بدل «راجع الـ console» — ده كان بيخفي السبب الحقيقي (مثلاً:
       الفاتورة المرتبطة مش مرحّلة) في الترحيل الجماعي. */
    const failReasons = new Map();
    for(let i = 0; i < items.length; i++){
      if(cancelRef.cancelled){ cancelledAt = i; break; }
      const item = items[i];
      const label = item.invoiceNo || item.id || ("#" + (i + 1));
      setProgress(p => p ? ({ ...p, currentLabel: label, done: i }) : p);
      try {
        await postOne(item, { silent: true });   /* silent = no toast per item */
        okCount++;
      } catch(e){
        console.error("[bulk-post] failed for", item.id || item.invoiceNo, e);
        failCount++;
        const reason = (e && e.message) ? e.message : "سبب غير معروف";
        failReasons.set(reason, (failReasons.get(reason) || 0) + 1);
      }
      setProgress(p => p ? ({ ...p, ok: okCount, fail: failCount, done: i + 1 }) : p);
    }
    /* أبرز سبب فشل (الأكثر تكراراً) لعرضه في التوست */
    let topReason = "";
    if(failReasons.size){
      topReason = [...failReasons.entries()].sort((a,b) => b[1] - a[1])[0][0];
    }

    /* Show final state for ~700ms then close + clear selection. */
    setProgress(p => p ? ({
      ...p,
      done: cancelledAt >= 0 ? cancelledAt : items.length,
      ok: okCount, fail: failCount,
      finished: true,
      cancelled: cancelledAt >= 0,
    }) : p);
    await new Promise(r => setTimeout(r, 700));
    setProgress(null);
    setSelectedIds(new Set());

    if(cancelledAt >= 0){
      showToast(`⚠ تم الإيقاف — ${okCount} اترحلوا، ${items.length - cancelledAt} مش اتعملوا`);
    } else if(failCount === 0){
      showToast(`✓ تم ترحيل ${okCount} ${itemLabel}`);
    } else if(okCount === 0){
      showToast(`✕ فشل ترحيل ${failCount} ${itemLabel}${topReason ? " — " + topReason : ""}`);
    } else {
      showToast(`⚠ ترحيل ${okCount} نجح، ${failCount} فشل${topReason ? " — السبب الأكثر: " + topReason : " — راجع الـ console"}`);
    }
  };

  /* Render order: progress modal (when running) overlays everything; selection
     bar shown otherwise. Modal returns its own JSX that can co-exist with the
     bar staying mounted under it. */
  return <>
    {progress && <BulkPostProgressModal progress={progress} itemLabel={itemLabel} isMob={isMob}/>}
    {selectedItems.length > 0 && !progress && <div style={{
      position:"fixed", bottom:16, insetInlineStart:16, insetInlineEnd:16,
      zIndex:100, background:T.cardSolid, border:"2px solid "+T.accent,
      borderRadius:12, padding:isMob?"10px 12px":"12px 18px",
      boxShadow:"0 8px 24px rgba(0,0,0,0.18)",
      display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap"
    }}>
      <div style={{display:"flex", alignItems:"center", gap:10, flex:1, minWidth:200}}>
        <span style={{
          background:T.accent, color:"#fff", fontWeight:900,
          padding:"4px 10px", borderRadius:8, fontSize:FS,
        }}>{selectedItems.length}</span>
        <div>
          <div style={{fontSize:FS-1, fontWeight:700, color:T.text}}>
            {itemLabel} مختارة
          </div>
          <div style={{fontSize:FS-2, color:T.textMut, fontFamily:"monospace"}}>
            الإجمالي: {fmt(totalAmount.toFixed(2))} ج
          </div>
        </div>
      </div>
      <div style={{display:"flex", gap:8}}>
        <Btn ghost small onClick={() => setSelectedIds(new Set())}>إلغاء التحديد</Btn>
        <Btn primary small onClick={runBulkPost} style={{background:"#10B981", fontWeight:800}}>
          ✓ ترحيل المحدد ({selectedItems.length})
        </Btn>
      </div>
    </div>}
  </>;
}

/* V19.54: Full-screen blocking modal shown during bulk-post.
   - Backdrop dims the page and prevents click-through.
   - Progress bar + counters update live (current item, done/total, ok/fail).
   - Cancel button flips the cancel flag → loop breaks after current item finishes.
   - Once finished, "تم" badge shows briefly before auto-close. */
function BulkPostProgressModal({progress, itemLabel, isMob}){
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const finished = !!progress.finished;
  const cancelled = !!progress.cancelled;
  return <div
    role="dialog"
    aria-modal="true"
    aria-label={"ترحيل " + itemLabel}
    style={{
      position:"fixed", inset:0, zIndex:1000,
      background:"rgba(0,0,0,0.55)",
      display:"flex", alignItems:"center", justifyContent:"center",
      padding:16,
    }}
    onClick={e => e.stopPropagation()}
  >
    <div style={{
      background:T.cardSolid, borderRadius:14, border:"2px solid "+T.accent+"40",
      padding:isMob?"18px 20px":"24px 28px",
      width:"100%", maxWidth:480, boxShadow:"0 16px 48px rgba(0,0,0,0.3)",
    }}>
      <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:14}}>
        <span style={{fontSize:24}}>{finished ? (cancelled ? "⏹" : (progress.fail > 0 ? "⚠️" : "✅")) : "⏳"}</span>
        <div style={{flex:1}}>
          <div style={{fontWeight:800, fontSize:FS+1, color:T.text}}>
            {finished ? (cancelled ? "تم الإيقاف" : "تم الترحيل") : `جاري ترحيل ${itemLabel}…`}
          </div>
          <div style={{fontSize:FS-2, color:T.textMut, marginTop:2}}>
            {progress.done} من {progress.total} • {progress.ok > 0 && <span style={{color:"#10B981", fontWeight:700}}>{progress.ok} ✓</span>}
            {progress.ok > 0 && progress.fail > 0 && <span> • </span>}
            {progress.fail > 0 && <span style={{color:"#EF4444", fontWeight:700}}>{progress.fail} ✕</span>}
          </div>
        </div>
        <span style={{fontWeight:900, fontSize:FS+4, color:T.accent, fontFamily:"monospace"}}>{pct}%</span>
      </div>
      {/* Progress bar */}
      <div style={{height:10, borderRadius:5, background:T.bg, overflow:"hidden", border:"1px solid "+T.brd, marginBottom:12}}>
        <div style={{
          height:"100%",
          width:pct+"%",
          background: finished
            ? (cancelled ? "#F59E0B" : (progress.fail > 0 ? "#F59E0B" : "#10B981"))
            : T.accent,
          transition:"width 0.25s ease-out",
        }}/>
      </div>
      {/* Current item label */}
      {!finished && progress.currentLabel && (
        <div style={{
          fontSize:FS-2, color:T.textSec, padding:"8px 10px",
          background:T.accent+"08", borderRadius:6, marginBottom:12,
          fontFamily:"monospace", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
        }}>
          🔄 {progress.currentLabel}
        </div>
      )}
      {/* Warning to user — don't navigate away */}
      {!finished && (
        <div style={{fontSize:FS-3, color:T.textMut, lineHeight:1.5, marginBottom:14, textAlign:"center"}}>
          متخرجش من الصفحة ولا تقفل التطبيق لحد ما الترحيل يخلص.
        </div>
      )}
      {/* Action button: Cancel (during) / nothing (after — auto-closes) */}
      {!finished && (
        <div style={{display:"flex", justifyContent:"center"}}>
          <Btn ghost small onClick={progress.cancel} style={{color:"#EF4444"}}>
            ⏹ إيقاف بعد الفاتورة الحالية
          </Btn>
        </div>
      )}
    </div>
  </div>;
}
