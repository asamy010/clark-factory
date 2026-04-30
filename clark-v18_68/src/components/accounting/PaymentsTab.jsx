/* ════════════════════════════════════════════════════════════════════════
   CLARK V18.63 · Accounting · PaymentsTab
   ══════════════════════════════════════════════════════════════════════════
   
   Comprehensive log of ALL payments — combines:
     • Customer cash payments    (config.custPayments[])
     • Supplier cash payments    (config.supplierPayments[])
     • Receivable checks         (config.checks[] where type="receivable")
     • Payable checks            (config.checks[] where type="payable")
   
   Filters:
     • Direction:  all / incoming (in) / outgoing (out)
     • Channel:    all / cash / check
     • Status:     all / cleared / pending  (checks only)
     • Date range
     • Free-text search on party name + notes
   
   Why this lives in Accounting (V18.63):
   ─────────────────────────────────────
   Pre-V18.63 the per-customer payments log lived inside the customer-statement
   popup in Sales. Users wanted a single global view of ALL payments (cash +
   checks, customers + suppliers) for accounting reconciliation. This tab is
   that view.
   ════════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { Btn, Card, Inp, Sel } from "../ui.jsx";
import { fmt } from "../../utils/format.js";

const DIRECTIONS = [
  {key:"all", label:"الكل",       icon:"📊"},
  {key:"in",  label:"وارد",       icon:"📥", color:"#10B981"},
  {key:"out", label:"صادر",       icon:"📤", color:"#EF4444"},
];

const CHANNELS = [
  {key:"all",   label:"الكل"},
  {key:"cash",  label:"نقدي"},
  {key:"check", label:"شيك"},
];

const STATUSES = [
  {key:"all",     label:"الكل"},
  {key:"cleared", label:"محصلة/مدفوعة"},
  {key:"pending", label:"معلقة"},
];

/* Cash-payment "method" values that count as a cheque rather than cash */
const CHEQUE_METHODS = new Set(["شيك"]);

export function PaymentsTab({ config, T, FS, isMob, showToast }){
  const today = new Date().toISOString().split("T")[0];
  const yearStart = today.slice(0,4) + "-01-01";

  const [direction, setDirection] = useState("all");
  const [channel, setChannel]     = useState("all");
  const [status, setStatus]       = useState("all");
  const [from, setFrom]           = useState(yearStart);
  const [to, setTo]               = useState(today);
  const [search, setSearch]       = useState("");

  /* Build a unified, normalized payment stream out of three sources. */
  const allPayments = useMemo(() => {
    const out = [];

    /* 1. Customer cash payments (incoming) */
    (config.custPayments || []).forEach(p => {
      const isCheque = CHEQUE_METHODS.has(p.method || "");
      out.push({
        _kind: "custPay",
        id: p.id,
        direction: "in",
        channel: isCheque ? "check" : "cash",
        date: p.date || "",
        amount: Number(p.amount) || 0,
        partyType: "عميل",
        partyName: p.custName || "—",
        partyId: p.custId || "",
        method: p.method || "كاش",
        status: "cleared", /* cash payments are always settled at time of recording */
        note: p.note || "",
        account: p.account || "",
        by: p.by || "",
        sourceLabel: "💵 دفعة عميل (نقدي/تحويل)",
      });
    });

    /* 2. Supplier cash payments (outgoing) */
    (config.supplierPayments || []).forEach(p => {
      const isCheque = CHEQUE_METHODS.has(p.method || "");
      out.push({
        _kind: "supPay",
        id: p.id,
        direction: "out",
        channel: isCheque ? "check" : "cash",
        date: p.date || "",
        amount: Number(p.amount) || 0,
        partyType: "مورد",
        partyName: p.supplierName || "—",
        partyId: p.supplierId || "",
        method: p.method || "كاش",
        status: "cleared",
        note: p.note || "",
        account: p.account || "",
        by: p.by || "",
        sourceLabel: "💸 دفعة مورد (نقدي/تحويل)",
      });
    });

    /* 3. Checks (both receivable and payable) */
    (config.checks || []).forEach(c => {
      const isReceivable = c.type === "receivable";
      const st = c.status || "معلق";
      /* Map the workflow status to our 3-state vocabulary */
      let normStatus = "pending";
      if (isReceivable) {
        if (st === "محصل" || st === "مُظهّر") normStatus = "cleared";
        else if (st === "مرتد" || st === "ملغي") normStatus = "cancelled";
        else normStatus = "pending";
      } else {
        if (st === "مدفوع") normStatus = "cleared";
        else if (st === "ملغي" || st === "مرتجع") normStatus = "cancelled";
        else normStatus = "pending";
      }
      out.push({
        _kind: "check",
        id: c.id,
        direction: isReceivable ? "in" : "out",
        channel: "check",
        /* Use due date for forward planning; fall back to issue date */
        date: c.date || c.dueDate || "",
        dueDate: c.dueDate || "",
        amount: Number(c.amount) || 0,
        partyType: isReceivable ? "عميل/طرف" : "مورد/طرف",
        partyName: c.party || "—",
        partyId: c.partyId || "",
        method: "شيك",
        status: normStatus,
        rawStatus: st,
        note: c.notes || "",
        bank: c.bank || "",
        checkNo: c.checkNo || "",
        category: c.category || "",
        statusDate: c.statusDate || "",
        by: c.by || "",
        sourceLabel: isReceivable ? "📝 شيك مستحق (وارد)" : "📝 شيك واجب الدفع (صادر)",
      });
    });

    /* 4. V18.64 — Orphan treasury entries (linked to a customer/supplier but
       NOT yet reflected in custPayments / supplierPayments).
       
       These are real cash flows the treasury has recorded but never made it
       into the per-party payment arrays — usually because of historic data
       desyncs (older versions, partial restores, manual edits). Surfacing
       them here so accounting can see the FULL payment history. */
    const knownTreasuryTxIds = new Set();
    (config.custPayments || []).forEach(p => p.treasuryTxId && knownTreasuryTxIds.add(p.treasuryTxId));
    (config.supplierPayments || []).forEach(p => p.treasuryTxId && knownTreasuryTxIds.add(p.treasuryTxId));
    (config.treasury || []).forEach(t => {
      if (!t.id) return;
      if (knownTreasuryTxIds.has(t.id)) return;
      if (t.sourceType === "check_bounce") return;/* check-bounce reversals aren't payments */
      /* Orphan customer payment (incoming, has custId) */
      if (t.type === "in" && t.custId) {
        const c = (config.customers || []).find(x => x.id === t.custId);
        out.push({
          _kind: "treasuryOrphanCust",
          id: "tcust:" + t.id,
          direction: "in",
          channel: "cash",
          date: t.date || "",
          amount: Number(t.amount) || 0,
          partyType: "عميل",
          partyName: c ? c.name : "(عميل غير معروف)",
          partyId: t.custId,
          method: t.notes || "كاش",
          status: "cleared",
          note: t.notes || t.desc || "",
          account: t.account || "",
          by: t.by || "",
          sourceLabel: "⚠️ خزنة فقط (غير مزامنة في كشف العميل)",
          _orphan: true,
        });
      }
      /* Orphan supplier payment (outgoing, has supplierId) */
      if (t.type === "out" && t.supplierId) {
        const s = (config.suppliers || []).find(x => x.id === t.supplierId);
        out.push({
          _kind: "treasuryOrphanSup",
          id: "tsup:" + t.id,
          direction: "out",
          channel: "cash",
          date: t.date || "",
          amount: Number(t.amount) || 0,
          partyType: "مورد",
          partyName: s ? s.name : "(مورد غير معروف)",
          partyId: t.supplierId,
          method: t.notes || "كاش",
          status: "cleared",
          note: t.notes || t.desc || "",
          account: t.account || "",
          by: t.by || "",
          sourceLabel: "⚠️ خزنة فقط (غير مزامنة في كشف المورد)",
          _orphan: true,
        });
      }
    });

    /* Newest first */
    out.sort((a,b) => (b.date||"").localeCompare(a.date||""));
    return out;
  }, [config.custPayments, config.supplierPayments, config.checks, config.treasury, config.customers, config.suppliers]);

  /* Apply filters */
  const filtered = useMemo(() => {
    const q = (search||"").trim().toLowerCase();
    return allPayments.filter(p => {
      if (direction !== "all" && p.direction !== direction) return false;
      if (channel !== "all" && p.channel !== channel) return false;
      if (status !== "all") {
        if (status === "cleared" && p.status !== "cleared") return false;
        if (status === "pending" && p.status !== "pending") return false;
      }
      if (from && p.date && p.date < from) return false;
      if (to   && p.date && p.date > to)   return false;
      if (q) {
        const hay = ((p.partyName||"") + " " + (p.note||"") + " " + (p.checkNo||"") + " " + (p.bank||"")).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allPayments, direction, channel, status, from, to, search]);

  /* Aggregates */
  const stats = useMemo(() => {
    const incoming      = filtered.filter(p => p.direction === "in").reduce((s,p) => s + p.amount, 0);
    const outgoing      = filtered.filter(p => p.direction === "out").reduce((s,p) => s + p.amount, 0);
    const cashIncoming  = filtered.filter(p => p.direction === "in"  && p.channel === "cash").reduce((s,p) => s + p.amount, 0);
    const cashOutgoing  = filtered.filter(p => p.direction === "out" && p.channel === "cash").reduce((s,p) => s + p.amount, 0);
    const checkIncoming = filtered.filter(p => p.direction === "in"  && p.channel === "check").reduce((s,p) => s + p.amount, 0);
    const checkOutgoing = filtered.filter(p => p.direction === "out" && p.channel === "check").reduce((s,p) => s + p.amount, 0);
    const pendingChecks = filtered.filter(p => p.channel === "check" && p.status === "pending").reduce((s,p) => s + p.amount, 0);
    return {
      count: filtered.length,
      incoming, outgoing,
      cashIncoming, cashOutgoing,
      checkIncoming, checkOutgoing,
      pendingChecks,
      net: incoming - outgoing,
    };
  }, [filtered]);

  const TH_BASE = { padding:"8px 10px", fontSize:FS-2, fontWeight:800, color:T.textSec, textAlign:"right", borderBottom:"2px solid "+T.brd, whiteSpace:"nowrap" };
  const TD_BASE = { padding:"7px 10px", fontSize:FS-1, color:T.text, borderBottom:"1px solid "+T.brd };

  return <Card title="💰 سجل الدفعات الكامل" style={{marginBottom:16}}>
    <div style={{fontSize:FS-2, color:T.textSec, marginBottom:14, lineHeight:1.7}}>
      💡 سجل موحّد لكل الدفعات: نقدي وشيكات، عملاء وموردين — بفلاتر اتجاه/قناة/حالة/تاريخ/بحث.
    </div>

    {/* Filter row */}
    <div style={{display:"grid", gridTemplateColumns: isMob ? "1fr 1fr" : "auto auto auto 1fr 1fr 2fr", gap:8, marginBottom:14, alignItems:"end"}}>
      <div>
        <label style={{fontSize:FS-3, color:T.textSec, fontWeight:700, display:"block", marginBottom:3}}>الاتجاه</label>
        <Sel value={direction} onChange={setDirection}>
          {DIRECTIONS.map(d => <option key={d.key} value={d.key}>{d.icon+" "+d.label}</option>)}
        </Sel>
      </div>
      <div>
        <label style={{fontSize:FS-3, color:T.textSec, fontWeight:700, display:"block", marginBottom:3}}>القناة</label>
        <Sel value={channel} onChange={setChannel}>
          {CHANNELS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </Sel>
      </div>
      <div>
        <label style={{fontSize:FS-3, color:T.textSec, fontWeight:700, display:"block", marginBottom:3}}>الحالة</label>
        <Sel value={status} onChange={setStatus}>
          {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </Sel>
      </div>
      <div>
        <label style={{fontSize:FS-3, color:T.textSec, fontWeight:700, display:"block", marginBottom:3}}>من</label>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{display:"block", width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid "+T.brd, fontSize:FS-1, fontFamily:"inherit", background:T.inputBg||T.cardSolid, color:T.text}}/>
      </div>
      <div>
        <label style={{fontSize:FS-3, color:T.textSec, fontWeight:700, display:"block", marginBottom:3}}>إلى</label>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{display:"block", width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid "+T.brd, fontSize:FS-1, fontFamily:"inherit", background:T.inputBg||T.cardSolid, color:T.text}}/>
      </div>
      <div>
        <label style={{fontSize:FS-3, color:T.textSec, fontWeight:700, display:"block", marginBottom:3}}>بحث</label>
        <Inp value={search} onChange={setSearch} placeholder="🔍 الطرف، البنك، رقم الشيك، ملاحظات..."/>
      </div>
    </div>

    {/* Stats cards */}
    <div style={{display:"grid", gridTemplateColumns: isMob ? "repeat(2, 1fr)" : "repeat(auto-fit, minmax(160px, 1fr))", gap:10, marginBottom:14}}>
      <div style={{padding:"10px 12px", borderRadius:10, background:"linear-gradient(135deg, #10B98112, #10B98103)", border:"1px solid #10B98130"}}>
        <div style={{fontSize:FS-3, color:T.textSec, fontWeight:700, marginBottom:4}}>📥 الوارد</div>
        <div style={{fontSize:FS+3, fontWeight:800, color:"#10B981"}}>{fmt(stats.incoming)} <span style={{fontSize:FS-2, fontWeight:600, color:T.textMut}}>ج.م</span></div>
        <div style={{fontSize:FS-3, color:T.textMut, marginTop:2}}>نقدي: {fmt(stats.cashIncoming)} | شيكات: {fmt(stats.checkIncoming)}</div>
      </div>
      <div style={{padding:"10px 12px", borderRadius:10, background:"linear-gradient(135deg, #EF444412, #EF444403)", border:"1px solid #EF444430"}}>
        <div style={{fontSize:FS-3, color:T.textSec, fontWeight:700, marginBottom:4}}>📤 الصادر</div>
        <div style={{fontSize:FS+3, fontWeight:800, color:"#EF4444"}}>{fmt(stats.outgoing)} <span style={{fontSize:FS-2, fontWeight:600, color:T.textMut}}>ج.م</span></div>
        <div style={{fontSize:FS-3, color:T.textMut, marginTop:2}}>نقدي: {fmt(stats.cashOutgoing)} | شيكات: {fmt(stats.checkOutgoing)}</div>
      </div>
      <div style={{padding:"10px 12px", borderRadius:10, background:"linear-gradient(135deg, "+T.accent+"12, "+T.accent+"03)", border:"1px solid "+T.accent+"30"}}>
        <div style={{fontSize:FS-3, color:T.textSec, fontWeight:700, marginBottom:4}}>⚖️ الصافي</div>
        <div style={{fontSize:FS+3, fontWeight:800, color:stats.net>=0?"#10B981":"#EF4444"}}>{fmt(stats.net)} <span style={{fontSize:FS-2, fontWeight:600, color:T.textMut}}>ج.م</span></div>
        <div style={{fontSize:FS-3, color:T.textMut, marginTop:2}}>{stats.count} حركة</div>
      </div>
      <div style={{padding:"10px 12px", borderRadius:10, background:"linear-gradient(135deg, #F59E0B12, #F59E0B03)", border:"1px solid #F59E0B30"}}>
        <div style={{fontSize:FS-3, color:T.textSec, fontWeight:700, marginBottom:4}}>⏳ شيكات معلقة</div>
        <div style={{fontSize:FS+3, fontWeight:800, color:"#F59E0B"}}>{fmt(stats.pendingChecks)} <span style={{fontSize:FS-2, fontWeight:600, color:T.textMut}}>ج.م</span></div>
        <div style={{fontSize:FS-3, color:T.textMut, marginTop:2}}>غير محصلة/مدفوعة بعد</div>
      </div>
    </div>

    {/* Payments table */}
    {filtered.length === 0 ? <div style={{textAlign:"center", padding:"36px 12px", color:T.textMut, background:T.bg, borderRadius:10}}>
      <div style={{fontSize:32, marginBottom:8}}>📭</div>
      <div style={{fontSize:FS-1, fontWeight:600}}>لا توجد دفعات مطابقة للفلاتر</div>
    </div>
    : <div style={{overflowX:"auto", border:"1px solid "+T.brd, borderRadius:10}}>
      <table style={{width:"100%", borderCollapse:"collapse", minWidth:isMob?700:0}}>
        <thead>
          <tr style={{background:T.bg}}>
            <th style={TH_BASE}>التاريخ</th>
            <th style={TH_BASE}>الاتجاه</th>
            <th style={TH_BASE}>القناة</th>
            <th style={TH_BASE}>الطرف</th>
            <th style={TH_BASE}>المبلغ</th>
            <th style={TH_BASE}>الحالة</th>
            <th style={TH_BASE}>تفاصيل</th>
            <th style={TH_BASE}>بواسطة</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((p, i) => {
            const dirColor = p.direction === "in" ? "#10B981" : "#EF4444";
            const dirLabel = p.direction === "in" ? "↘ وارد" : "↗ صادر";
            const isCheque = p.channel === "check";
            const isOrphan = !!p._orphan;
            const statusColor = p.status === "cleared" ? "#10B981" : p.status === "pending" ? "#F59E0B" : "#94A3B8";
            const statusLabel = p.status === "cleared" ? "✓ تم" : p.status === "pending" ? "⏳ معلق" : (p.rawStatus || "—");
            return <tr key={p._kind+":"+p.id} style={{
              background: isOrphan ? "#F59E0B08" : (i % 2 === 0 ? "transparent" : T.bg+"60"),
              borderInlineStart: isOrphan ? "3px solid #F59E0B" : "none",
            }} title={isOrphan ? "هذه الحركة موجودة في الخزنة لكن غير مزامنة في كشف الطرف. للمزامنة: افتح كشف العميل/المورد واضغط 'مزامنة'." : ""}>
              <td style={{...TD_BASE, fontSize:FS-2, whiteSpace:"nowrap"}}>{p.date || "—"}{p.dueDate && p.dueDate !== p.date ? <div style={{fontSize:FS-3, color:T.textMut}}>استحقاق: {p.dueDate}</div> : null}</td>
              <td style={{...TD_BASE, color:dirColor, fontWeight:700, fontSize:FS-2}}>{dirLabel}</td>
              <td style={{...TD_BASE, fontSize:FS-2}}>
                <span style={{padding:"2px 8px", borderRadius:6, background: isCheque?"#8B5CF615":"#0EA5E915", color:isCheque?"#8B5CF6":"#0EA5E9", fontWeight:700}}>{isCheque ? "📝 شيك" : "💵 "+(p.method||"نقدي")}</span>
              </td>
              <td style={{...TD_BASE, fontWeight:700}}>
                {p.partyName}
                <div style={{fontSize:FS-3, color:T.textMut, fontWeight:400}}>{p.partyType}</div>
              </td>
              <td style={{...TD_BASE, textAlign:"center", fontWeight:800, color:dirColor, fontSize:FS}}>{fmt(p.amount)}</td>
              <td style={{...TD_BASE, fontSize:FS-2}}>
                {isOrphan
                  ? <span style={{padding:"2px 8px", borderRadius:6, background:"#F59E0B15", color:"#F59E0B", fontWeight:700, whiteSpace:"nowrap"}} title="هذه الحركة في الخزنة فقط — غير مزامنة في كشف الطرف">⚠️ غير مزامنة</span>
                  : <span style={{padding:"2px 8px", borderRadius:6, background:statusColor+"15", color:statusColor, fontWeight:700, whiteSpace:"nowrap"}}>{statusLabel}</span>
                }
              </td>
              <td style={{...TD_BASE, fontSize:FS-3, color:T.textSec, maxWidth:240}}>
                {isCheque && <div>
                  {p.bank && <span style={{padding:"1px 6px", borderRadius:4, background:T.bg, marginInlineEnd:4}}>🏦 {p.bank}</span>}
                  {p.checkNo && <span style={{padding:"1px 6px", borderRadius:4, background:T.bg, fontFamily:"monospace"}}>#{p.checkNo}</span>}
                </div>}
                {p.note && <div style={{marginTop:isCheque?4:0, color:T.textMut}}>{p.note}</div>}
                {!isCheque && p.account && <div style={{fontSize:FS-3, color:T.textMut}}>حساب: {p.account}</div>}
              </td>
              <td style={{...TD_BASE, fontSize:FS-3, color:T.textMut}}>{p.by || "—"}</td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>}

    <div style={{marginTop:10, fontSize:FS-3, color:T.textMut, padding:"6px 10px", background:T.bg, borderRadius:8, textAlign:"center"}}>
      💡 لإضافة دفعة جديدة: من شاشة المبيعات (دفعة عميل) أو الخزنة (دفعة مورد) أو إدارة الشيكات في الخزنة.
    </div>
  </Card>;
}
