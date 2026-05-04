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

import { useMemo } from "react";
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

  if(selectedItems.length === 0) return null;

  const totalAmount = selectedItems.reduce((s, it) => s + (Number(it[totalKey]) || 0), 0);

  const runBulkPost = async () => {
    const n = selectedItems.length;
    const ok = await ask(
      `ترحيل ${n} ${itemLabel}`,
      `هترحل ${n} ${itemLabel} بإجمالي ${fmt(totalAmount.toFixed(2))} جنيه.\n\nالعملية ممكن تاخد عدة ثواني (كل ${itemLabel} بترحل بقيد محاسبي مستقل). متخرجش من الصفحة لحد ما تخلص.`,
      { confirmText: "ترحيل الكل" }
    );
    if(!ok) return;

    /* Sequential, not parallel — the accounting layer mutates a journal counter
       inside upConfig and parallel writes would race. Sequential is plenty fast
       for typical N (5-50 invoices) and avoids any cross-invoice corruption. */
    let okCount = 0, failCount = 0;
    for(const item of selectedItems){
      try {
        await postOne(item, { silent: true });   /* silent = no toast per item */
        okCount++;
      } catch(e){
        console.error("[bulk-post] failed for", item.id || item.invoiceNo, e);
        failCount++;
      }
    }

    /* Clear the selection after the run, regardless of outcome */
    setSelectedIds(new Set());

    if(failCount === 0){
      showToast(`✓ تم ترحيل ${okCount} ${itemLabel}`);
    } else if(okCount === 0){
      showToast(`✕ فشل ترحيل ${failCount} ${itemLabel}`);
    } else {
      showToast(`⚠ ترحيل ${okCount} نجح، ${failCount} فشل — راجع الـ console`);
    }
  };

  return <div style={{
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
  </div>;
}
