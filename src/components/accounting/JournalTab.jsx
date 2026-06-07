/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · JournalTab
   ───────────────────────────────────────────────────────────────────────
   Per-day journal viewer + manual entry editor. Reads the day's document
   from accountingDays/{YYYY-MM-DD} when the date changes.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from "react";
import { Btn, Card, Inp, Sel } from "../ui.jsx";
import { JournalEntryModal } from "./JournalEntryModal.jsx";
import { readDay, mutateDay, voidEntry, toDayId } from "../../utils/accounting/dayDoc.js";
import { postManualEntry, postEntry, reverseEntry, buildRefNo } from "../../utils/accounting/posting.js";
import { fmt, gid } from "../../utils/format.js";
import { ask, tell } from "../../utils/popups.js";
/* V21.9.188: cross-page action handoff (Dashboard "+ قيد جديد" button). */
import { consumePendingAction } from "../../utils/pendingAction.js";

export function JournalTab({coa, config, T, FS, isMob, showToast, userName, openTarget}){
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);
  const [day, setDay]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);/* null | "new" | <existingEntry> */
  const [highlightId, setHighlightId] = useState(null);/* V21.18.0: deep-link highlight */

  /* V21.18.0: عند الوصول من لينك (فاتورة/دفتر أستاذ) — انتقل لتاريخ القيد وأبرزه */
  useEffect(() => {
    if(!openTarget || !openTarget.entryId) return;
    if(openTarget.date && openTarget.date !== date) setDate(openTarget.date);
    setHighlightId(openTarget.entryId);
    const t = setTimeout(() => setHighlightId(null), 4000);
    return () => clearTimeout(t);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [openTarget?.entryId, openTarget?.ts]);

  /* Load whenever date changes */
  const loadDay = async (d) => {
    setLoading(true);
    try {
      const result = await readDay(d);
      setDay(result);
    } catch(e){
      console.error("[CLARK accounting] load day failed:", e);
      showToast("⚠️ فشل التحميل");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { loadDay(date); /* eslint-disable-next-line */ }, [date]);

  /* V21.9.188: consume pending action from Accounting Dashboard's "متنوع"
     card. The tab key uses a namespaced form ("accounting-journal") because
     JournalTab is rendered INSIDE AccountingPg — we want the action to fire
     only when the user explicitly clicks the journal "+ قيد جديد" button,
     not on every tab switch within AccountingPg. */
  useEffect(() => {
    const act = consumePendingAction("accounting-journal");
    if (!act) return;
    if (act.action === "new") {
      setEditing("new");
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  const handleSave = async (entry) => {
    try {
      if(editing && editing !== "new" && editing.id){
        /* edit existing manual entry */
        await mutateDay(editing.date || date, (cur) => {
          const idx = cur.findIndex(e => e.id === editing.id);
          if(idx<0) throw new Error("القيد غير موجود");
          const next = [...cur];
          next[idx] = {
            ...next[idx],
            narration: entry.narration,
            lines: entry.lines.map(l => ({
              accountId: l.accountId, accountCode: l.accountCode||"", accountName: l.accountName||"",
              debit: Number(l.debit)||0, credit: Number(l.credit)||0,
              ...(l.note ? {note:l.note} : {}),
              /* V18.41 — preserve foreign currency dimension */
              ...(l.fcCurrency && l.fcCurrency !== "EGP" && Number(l.fcAmount)
                ? {fcCurrency: l.fcCurrency, fcAmount: Number(l.fcAmount), fxRate: Number(l.fxRate)||1}
                : {}),
            })),
            editedAt: new Date().toISOString(),
            editedBy: userName||"",
          };
          return next;
        });
        showToast("✓ تم تحديث القيد");
      } else {
        await postManualEntry({
          date: entry.date,
          narration: entry.narration,
          lines: entry.lines,
          coa,
          createdBy: userName||"",
        });
        showToast("✓ تم حفظ القيد");
      }
      setEditing(null);
      /* Move date to where the entry actually was saved (if user changed it) */
      if(entry.date !== date) setDate(entry.date);
      else loadDay(date);
    } catch(e){
      console.error(e);
      await tell("فشل الحفظ", e.message||String(e), {danger:true});
    }
  };

  const handleVoid = async (entry) => {
    if(!await ask("إلغاء القيد", "إلغاء القيد "+entry.refNo+"؟\n\nسيتم إنشاء قيد عكسي (مش هيتم الحذف الفعلي).", {danger:true, confirmText:"إلغاء القيد"})) return;
    try {
      if(entry.sourceType && entry.sourceType !== "manual"){
        /* Auto-posted: use reverseEntry which preserves source link */
        await reverseEntry({
          date: date, sourceType: entry.sourceType, sourceId: entry.sourceId,
          reason:"إلغاء يدوي من شاشة اليومية", createdBy: userName||""
        });
      } else {
        /* Manual: just mark void (no reversal entry, since it's not auto-tied) */
        await voidEntry(date, entry.id, null);
      }
      showToast("✓ تم الإلغاء");
      loadDay(date);
    } catch(e){
      await tell("فشل الإلغاء", e.message||String(e), {danger:true});
    }
  };

  const goPrevDay = () => {
    const d = new Date(date); d.setDate(d.getDate()-1);
    setDate(toDayId(d));
  };
  const goNextDay = () => {
    const d = new Date(date); d.setDate(d.getDate()+1);
    setDate(toDayId(d));
  };

  const entries = day?.entries || [];
  /* Sort entries: voided last, then by createdAt */
  const sorted = [...entries].sort((a,b) => {
    const av = a.status==="void" ? 1 : 0;
    const bv = b.status==="void" ? 1 : 0;
    if(av !== bv) return av - bv;
    return (a.createdAt||"").localeCompare(b.createdAt||"");
  });

  const totals = entries.filter(e => e.status!=="void").reduce((acc, e) => {
    (e.lines||[]).forEach(l => {
      acc.debit += Number(l.debit)||0;
      acc.credit += Number(l.credit)||0;
    });
    return acc;
  }, {debit:0, credit:0});

  return <Card title={"📔 دفتر اليومية — "+date} style={{marginBottom:16}}>
    {/* Toolbar */}
    <div style={{display:"flex", flexWrap:"wrap", gap:8, alignItems:"center", marginBottom:14}}>
      <Btn ghost onClick={goPrevDay}>◀ يوم</Btn>
      <Inp type="date" value={date} onChange={setDate} style={{maxWidth:170}}/>
      <Btn ghost onClick={goNextDay}>يوم ▶</Btn>
      <Btn ghost onClick={() => setDate(today)}>اليوم</Btn>
      <div style={{flex:1}}/>
      <Btn primary onClick={() => setEditing("new")} style={{background:T.ok, color:"#fff", border:"none", fontWeight:800}}>➕ قيد جديد</Btn>
    </div>

    {/* Day totals */}
    {!loading && entries.length > 0 && <div style={{display:"grid", gridTemplateColumns:isMob?"1fr 1fr 1fr":"repeat(4,1fr)", gap:8, marginBottom:14}}>
      <div style={{padding:10, background:T.accent+"08", borderRadius:8, textAlign:"center"}}>
        <div style={{fontSize:FS-2, color:T.textSec}}>عدد القيود</div>
        <div style={{fontSize:FS+2, fontWeight:800, color:T.accent}}>{entries.filter(e=>e.status!=="void").length}</div>
      </div>
      <div style={{padding:10, background:T.ok+"08", borderRadius:8, textAlign:"center"}}>
        <div style={{fontSize:FS-2, color:T.textSec}}>إجمالي مدين</div>
        <div style={{fontSize:FS+1, fontWeight:800, color:T.ok, direction:"ltr"}}>{fmt(totals.debit.toFixed(2))}</div>
      </div>
      <div style={{padding:10, background:T.err+"08", borderRadius:8, textAlign:"center"}}>
        <div style={{fontSize:FS-2, color:T.textSec}}>إجمالي دائن</div>
        <div style={{fontSize:FS+1, fontWeight:800, color:T.err, direction:"ltr"}}>{fmt(totals.credit.toFixed(2))}</div>
      </div>
      <div style={{padding:10, background: Math.abs(totals.debit-totals.credit)<0.01 ? T.ok+"08" : T.warn+"08", borderRadius:8, textAlign:"center"}}>
        <div style={{fontSize:FS-2, color:T.textSec}}>الفرق</div>
        <div style={{fontSize:FS+1, fontWeight:800, color: Math.abs(totals.debit-totals.credit)<0.01 ? T.ok : T.warn, direction:"ltr"}}>{fmt(Math.abs(totals.debit-totals.credit).toFixed(2))}</div>
      </div>
    </div>}

    {/* Entries list */}
    {loading ? <div style={{padding:30, textAlign:"center", color:T.textMut}}>⏳ جاري التحميل...</div>
      : entries.length === 0 ? <div style={{padding:30, textAlign:"center", color:T.textMut, background:T.bg, borderRadius:10, border:"1px dashed "+T.brd}}>
        لا توجد قيود في هذا اليوم. <span onClick={() => setEditing("new")} style={{color:T.accent, cursor:"pointer", fontWeight:700, textDecoration:"underline"}}>أضف قيد جديد</span>
      </div>
      : sorted.map(e => <div key={e.id} ref={highlightId===e.id ? (el)=>{ if(el) setTimeout(()=>el.scrollIntoView({behavior:"smooth", block:"center"}), 60); } : null} style={{
        marginBottom:8, border:"2px solid "+(highlightId===e.id ? T.accent : T.brd), borderRadius:8, overflow:"hidden",
        opacity: e.status==="void" ? 0.55 : 1,
        boxShadow: highlightId===e.id ? "0 0 0 3px "+T.accent+"33" : "none",
        transition:"box-shadow .3s, border-color .3s",
      }}>
        <div style={{display:"flex", flexWrap:"wrap", alignItems:"center", gap:8, padding:"8px 12px", background:T.accent+"06", borderBottom:"1px solid "+T.brd}}>
          <span style={{fontFamily:"monospace", fontSize:FS-2, fontWeight:800, color:T.accent}}>{e.refNo}</span>
          <span style={{fontSize:FS-1, fontWeight:700, color:T.text, flex:1}}>{e.narration}</span>
          {e.sourceType && e.sourceType !== "manual" && <span style={{fontSize:FS-3, color:T.textMut, padding:"2px 8px", background:T.bg, borderRadius:4, fontWeight:700, border:"1px solid "+T.brd}} title="مرحّل تلقائياً من عملية">🔗 {e.sourceType}</span>}
          {e.status === "void" && <span style={{fontSize:FS-3, color:T.err, padding:"2px 8px", background:T.err+"12", borderRadius:4, fontWeight:800}}>ملغى</span>}
          {e.status !== "void" && <>
            {e.sourceType === "manual" && <Btn small ghost onClick={() => setEditing({...e, date})}>✏️</Btn>}
            <Btn small ghost onClick={() => handleVoid(e)} style={{color:T.err}}>🗑 إلغاء</Btn>
          </>}
        </div>
        <table style={{width:"100%", borderCollapse:"collapse", fontSize:FS-1}}>
          <thead><tr style={{background:T.bg}}>
            <th style={{padding:"6px 10px", textAlign:"right", color:T.textSec, fontWeight:700, fontSize:FS-2}}>الحساب</th>
            {!isMob && <th style={{padding:"6px 10px", textAlign:"right", color:T.textSec, fontWeight:700, fontSize:FS-2}}>ملاحظة</th>}
            <th style={{padding:"6px 10px", textAlign:"center", color:T.textSec, fontWeight:700, fontSize:FS-2, width:120}}>مدين</th>
            <th style={{padding:"6px 10px", textAlign:"center", color:T.textSec, fontWeight:700, fontSize:FS-2, width:120}}>دائن</th>
          </tr></thead>
          <tbody>{(e.lines||[]).map((l,i) => <tr key={i} style={{borderTop:"1px solid "+T.brd}}>
            <td style={{padding:"6px 10px"}}>
              <div style={{display:"flex", alignItems:"center", gap:6}}>
                <span style={{fontFamily:"monospace", fontSize:FS-2, color:T.accent, fontWeight:800}}>{l.accountCode}</span>
                <span style={{fontWeight:600}}>{l.accountName}</span>
              </div>
              {l.partyName && <div style={{fontSize:FS-3, color:T.textMut, marginTop:1}}>👤 {l.partyName}</div>}
              {/* V18.41 — show foreign currency dimension if present */}
              {l.fcCurrency && l.fcCurrency !== "EGP" && l.fcAmount > 0 && <div style={{fontSize:FS-3, color:T.accent, marginTop:1, padding:"2px 6px", background:T.accent+"08", borderRadius:4, display:"inline-block", direction:"ltr", fontWeight:700}}>
                💱 {l.fcCurrency} {fmt(Number(l.fcAmount).toFixed(2))} × {Number(l.fxRate||1).toFixed(4)}
              </div>}
            </td>
            {!isMob && <td style={{padding:"6px 10px", color:T.textSec, fontSize:FS-2}}>{l.note||"—"}</td>}
            <td style={{padding:"6px 10px", textAlign:"center", direction:"ltr", fontWeight: l.debit>0?700:400, color: l.debit>0?T.ok:T.textMut}}>{l.debit>0 ? fmt(Number(l.debit).toFixed(2)) : "—"}</td>
            <td style={{padding:"6px 10px", textAlign:"center", direction:"ltr", fontWeight: l.credit>0?700:400, color: l.credit>0?T.err:T.textMut}}>{l.credit>0 ? fmt(Number(l.credit).toFixed(2)) : "—"}</td>
          </tr>)}</tbody>
        </table>
      </div>)}

    {editing && <JournalEntryModal
      existing={editing === "new" ? null : editing}
      defaultDate={date}
      coa={coa} config={config} T={T} FS={FS} isMob={isMob}
      onSave={handleSave}
      onCancel={() => setEditing(null)}
    />}
  </Card>;
}
