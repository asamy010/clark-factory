/* ═══════════════════════════════════════════════════════════════════════
   CLARK · PurchaseReturnPickerModal (V19.41)
   ───────────────────────────────────────────────────────────────────────
   Opens from the "↪️ ارتجاع للمورد" button on a POSTED purchase invoice.
   Lets the user:
     - tick which line items to return
     - adjust the qty per line (capped at original qty)
     - set the return date (defaults to today)
     - optionally add a reason

   On confirm, calls upsertDebitNoteFromReturn — which means consecutive
   returns from the same supplier on the same day get consolidated into
   a single draft debit note (saves journal noise).

   The returned price for each item is the original invoice's unitPrice,
   which is also what resolvePurchaseReturnUnitPrice would resolve to —
   we pass it explicitly here for clarity and to avoid re-resolution.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { Btn, Card, Inp } from "./ui.jsx";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { fmt } from "../utils/format.js";
import { ask, showToast, tell } from "../utils/popups.js";
import { upsertDebitNoteFromReturn } from "../utils/invoices.js";

export function PurchaseReturnPickerModal({invoice, supplier, data, upConfig, onClose, onCreated, isMob, user}){
  const today = new Date().toISOString().split("T")[0];
  const userName = user?.displayName || (user?.email||"").split("@")[0] || "";

  /* Per-line state: { selected: bool, qty: number, max: number } keyed by line index */
  const initialLines = useMemo(() => {
    return (invoice.items || []).map((it, i) => ({
      idx: i,
      selected: false,
      qty: 0,
      max: Number(it.qty) || 0,
      itemType: it.itemType,
      itemId: it.itemId,
      name: it.name || "",
      unitPrice: Number(it.unitPrice) || 0,
    }));
  }, [invoice.items]);

  const [lines, setLines] = useState(initialLines);
  const [date, setDate] = useState(invoice.date || today);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  /* Derived totals — recompute whenever lines change */
  const { selectedCount, totalAmount } = useMemo(() => {
    let count = 0, amt = 0;
    lines.forEach(l => {
      if(l.selected && l.qty > 0){
        count++;
        amt += l.qty * l.unitPrice;
      }
    });
    return { selectedCount: count, totalAmount: amt };
  }, [lines]);

  const updateLine = (idx, patch) => {
    setLines(prev => prev.map((l, i) => i === idx ? {...l, ...patch} : l));
  };

  const toggleSelect = (idx) => {
    setLines(prev => prev.map((l, i) => {
      if(i !== idx) return l;
      const nextSelected = !l.selected;
      /* When selecting, default qty to max (full return). When deselecting, qty=0. */
      return {...l, selected: nextSelected, qty: nextSelected ? l.max : 0};
    }));
  };

  const setQty = (idx, val) => {
    const num = Number(val) || 0;
    setLines(prev => prev.map((l, i) => {
      if(i !== idx) return l;
      const clamped = Math.min(Math.max(0, num), l.max);
      /* Auto-deselect if qty drops to 0, auto-select if qty > 0 */
      return {...l, qty: clamped, selected: clamped > 0};
    }));
  };

  const handleConfirm = async () => {
    const picked = lines.filter(l => l.selected && l.qty > 0);
    if(picked.length === 0){
      await tell("اختار صنف", "محدّدش أي صنف للارتجاع. علّم على الأصناف اللي عاوز ترجعها وحدّد الكميات.", {type:"warning"});
      return;
    }
    const ok = await ask(
      "تأكيد إنشاء إشعار مدين",
      `هتعمل إشعار مدين بـ${picked.length} صنف بإجمالي ${fmt(totalAmount.toFixed(2))} ج.م.\n\n💡 لو في إشعار مسودة لنفس المورد ولنفس التاريخ، هيتم الدمج تلقائياً.\n\n⚠️ بعد الترحيل، الإشعار هيقلل ما تدين به للمورد ويسجل المرتجع كـ contra-expense.`,
      {confirmText:"تأكيد"}
    );
    if(!ok) return;

    setSubmitting(true);
    try {
      let result = { isNew: true, debitNote: null };
      upConfig(d => {
        const returnEntry = {
          supplierId: invoice.supplierId,
          supplierName: invoice.supplierName,
          date,
          linkedInvoiceId: invoice.id,
          items: picked.map(p => ({
            itemType: p.itemType,
            itemId: p.itemId,
            name: p.name,
            qty: p.qty,
            unitPrice: p.unitPrice,
          })),
          notes: notes.trim() || `مرتجع من فاتورة ${invoice.invoiceNo}`,
        };
        result = upsertDebitNoteFromReturn(d, returnEntry, supplier, userName);
      });
      showToast(
        result.isNew
          ? `✓ إشعار مدين جديد ${result.debitNote?.debitNoteNo || ""}`
          : `✓ تم الإضافة لإشعار قائم ${result.debitNote?.debitNoteNo || ""}`
      );
      if(onCreated) onCreated(result.debitNote);
      onClose();
    } catch(e){
      console.error("[V19.41] purchase return failed:", e);
      await tell("فشل إنشاء الإشعار", e?.message || String(e), {type:"error"});
    } finally {
      setSubmitting(false);
    }
  };

  return <div style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:10002, display:"flex", alignItems:"center", justifyContent:"center", padding:16}} onClick={onClose}>
    <div onClick={e => e.stopPropagation()} style={{
      background:T.cardSolid, borderRadius:14, padding:isMob?16:24,
      width:"100%", maxWidth:780, maxHeight:"90vh", overflowY:"auto",
      border:"1px solid "+T.brd, boxShadow:"0 25px 70px rgba(0,0,0,0.45)"
    }}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, paddingBottom:10, borderBottom:"2px solid "+T.brd, gap:10, flexWrap:"wrap"}}>
        <div style={{display:"flex", alignItems:"center", gap:10}}>
          <span style={{fontSize:24}}>↪️</span>
          <div>
            <div style={{fontSize:FS+2, fontWeight:800, color:"#3B82F6"}}>ارتجاع للمورد</div>
            <div style={{fontSize:FS-2, color:T.textSec}}>اختر الأصناف والكميات اللي راجعة من فاتورة <span style={{fontFamily:"monospace", fontWeight:700, color:T.accent}}>{invoice.invoiceNo}</span></div>
          </div>
        </div>
      </div>

      <Card style={{marginBottom:12}}>
        <div style={{display:"grid", gridTemplateColumns:isMob?"1fr 1fr":"1fr 1fr 2fr", gap:10, alignItems:"end"}}>
          <div>
            <label style={{fontSize:FS-3, color:T.textSec, fontWeight:600, display:"block", marginBottom:3}}>تاريخ الإرجاع</label>
            <Inp type="date" value={date} onChange={setDate}/>
          </div>
          <div>
            <label style={{fontSize:FS-3, color:T.textSec, fontWeight:600, display:"block", marginBottom:3}}>المورد</label>
            <div style={{padding:"8px 10px", background:T.bg, borderRadius:6, fontWeight:700, color:T.text}}>
              {invoice.supplierName||"—"}
            </div>
          </div>
          <div style={{gridColumn: isMob?"1/3":"auto"}}>
            <label style={{fontSize:FS-3, color:T.textSec, fontWeight:600, display:"block", marginBottom:3}}>السبب (اختياري)</label>
            <Inp value={notes} onChange={setNotes} placeholder="بضاعة تالفة / مواصفات غلط / إلخ..."/>
          </div>
        </div>
      </Card>

      <div style={{fontSize:FS-1, fontWeight:700, color:T.text, marginBottom:6}}>الأصناف ({lines.length})</div>
      <div style={{border:"1px solid "+T.brd, borderRadius:8, overflow:"hidden", marginBottom:12}}>
        <table style={{width:"100%", borderCollapse:"collapse", fontSize:FS-1}}>
          <thead>
            <tr style={{background:"#3B82F608"}}>
              <th style={{padding:"8px 10px", width:36}}></th>
              <th style={{padding:"8px 10px", textAlign:"right", color:T.textSec, fontWeight:800, fontSize:FS-2, borderBottom:"2px solid "+T.brd}}>الصنف</th>
              <th style={{padding:"8px 10px", textAlign:"center", color:T.textSec, fontWeight:800, fontSize:FS-2, borderBottom:"2px solid "+T.brd, width:100}}>الكمية الأصلية</th>
              <th style={{padding:"8px 10px", textAlign:"center", color:T.textSec, fontWeight:800, fontSize:FS-2, borderBottom:"2px solid "+T.brd, width:120}}>المرتجع</th>
              <th style={{padding:"8px 10px", textAlign:"center", color:T.textSec, fontWeight:800, fontSize:FS-2, borderBottom:"2px solid "+T.brd, width:90}}>السعر</th>
              <th style={{padding:"8px 10px", textAlign:"center", color:T.textSec, fontWeight:800, fontSize:FS-2, borderBottom:"2px solid "+T.brd, width:120}}>الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const lineTotal = l.qty * l.unitPrice;
              return <tr key={i} style={{borderTop:"1px solid "+T.brd, background: l.selected ? "#3B82F608" : "transparent"}}>
                <td style={{padding:"8px 10px", textAlign:"center"}}>
                  <input type="checkbox" checked={l.selected} onChange={() => toggleSelect(i)}
                    style={{width:18, height:18, cursor:"pointer", accentColor:"#3B82F6"}}/>
                </td>
                <td style={{padding:"8px 10px"}}>
                  <div style={{fontWeight:700, color:T.text}}>{l.name||"—"}</div>
                  {l.itemType && <div style={{fontSize:FS-3, color:T.textMut}}>{l.itemType}</div>}
                </td>
                <td style={{padding:"8px 10px", textAlign:"center", direction:"ltr", color:T.textSec}}>{fmt(l.max)}</td>
                <td style={{padding:"4px 8px", textAlign:"center"}}>
                  <Inp
                    type="number"
                    value={l.qty}
                    onChange={v => setQty(i, v)}
                    min={0}
                    max={l.max}
                    style={{width:"100%", textAlign:"center", direction:"ltr"}}
                  />
                </td>
                <td style={{padding:"8px 10px", textAlign:"center", direction:"ltr", color:T.textSec}}>{fmt(l.unitPrice.toFixed(2))}</td>
                <td style={{padding:"8px 10px", textAlign:"center", direction:"ltr", fontWeight:700, color: l.selected ? "#3B82F6" : T.textMut}}>{fmt(lineTotal.toFixed(2))}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>

      {/* Summary footer */}
      <div style={{padding:12, background:"#3B82F608", borderRadius:8, border:"1px solid #3B82F625", marginBottom:14, display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8}}>
        <div>
          <div style={{fontSize:FS-2, color:T.textSec}}>المختار</div>
          <div style={{fontSize:FS+1, fontWeight:800, color:T.text}}>
            {selectedCount} <span style={{fontSize:FS-2, fontWeight:600, color:T.textSec}}>صنف</span>
          </div>
        </div>
        <div style={{textAlign:"left"}}>
          <div style={{fontSize:FS-2, color:T.textSec}}>إجمالي قيمة المرتجع</div>
          <div style={{fontSize:FS+3, fontWeight:800, color:"#3B82F6", direction:"ltr"}}>{fmt(totalAmount.toFixed(2))} ج</div>
        </div>
      </div>

      <div style={{display:"flex", gap:8, justifyContent:"flex-end", flexWrap:"wrap"}}>
        <Btn ghost onClick={onClose} disabled={submitting}>إلغاء</Btn>
        <Btn primary onClick={handleConfirm} disabled={submitting || selectedCount === 0}
             style={{background:"#3B82F6", color:"#fff", border:"none", fontWeight:800}}>
          {submitting ? "⏳ جاري الإنشاء..." : "↪️ إنشاء إشعار مدين"}
        </Btn>
      </div>
    </div>
  </div>;
}
