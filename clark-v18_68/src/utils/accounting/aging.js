/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · Aging Report (V18.54)
   ───────────────────────────────────────────────────────────────────────
   Builds aging analysis for receivables (customers) and payables
   (suppliers + workshops) by walking through the journal entries.

   Algorithm:
     1. Read all journal entries from accountingDays/{date}/entries[]
     2. Filter lines where account is a receivable (1110) or payable (2110/2120)
     3. Group by partyId
     4. Each line is either a charge (debit for AR, credit for AP) or
        a payment (the opposite)
     5. Apply payments to oldest charges first (FIFO)
     6. Remaining unpaid charge balances are bucketed by age:
          - Current  (not yet due, or 0-30 days old)
          - 0-30     (overdue 0-30 days)
          - 31-60    (overdue 31-60 days)
          - 61-90    (overdue 61-90 days)
          - 90+      (overdue 90+ days)
     7. Total per party + grand total

   For simplicity this version uses **charge date** as the basis (no due
   dates). 90+ means "charged more than 90 days ago and unpaid".

   Public API:
     buildAgingReport(entries, asOfDate, side) → {parties: [...], totals: {...}}
   ═══════════════════════════════════════════════════════════════════════ */

/* Default account codes for AR/AP — match coaDefaults.js */
const AR_CODES = ["1110"];           /* العملاء */
const AP_CODES = ["2110", "2120"];   /* موردون خامات + ورش تشغيل */

/* Difference in whole days between two YYYY-MM-DD strings. */
function daysBetween(from, to){
  if(!from || !to) return 0;
  const a = new Date(from + "T00:00:00Z").getTime();
  const b = new Date(to   + "T00:00:00Z").getTime();
  return Math.floor((b - a) / 86400000);
}

/* Bucket a number of overdue days into one of the 5 categories. */
function bucketFor(daysOverdue){
  if(daysOverdue < 0)  return "current";
  if(daysOverdue <= 30) return "b0_30";
  if(daysOverdue <= 60) return "b31_60";
  if(daysOverdue <= 90) return "b61_90";
  return "b90_plus";
}

/* Build the aging report.
   entries: all journal entries collected from accountingDays
   asOfDate: "YYYY-MM-DD" — anchor for age calculation
   side: "receivable" (customers) or "payable" (suppliers/workshops) */
export function buildAgingReport(entries, asOfDate, side){
  const isReceivable = side === "receivable";
  const targetCodes  = isReceivable ? AR_CODES : AP_CODES;

  /* Collect transactions per (partyId, partyName) */
  const partyMap = new Map();

  (entries || []).forEach(entry => {
    if(!entry || entry.status === "void") return;
    const date = entry.date || "";
    if(!date || (asOfDate && date > asOfDate)) return;/* skip future entries */

    (entry.lines || []).forEach(line => {
      if(!targetCodes.includes(String(line.accountCode||""))) return;
      const partyId   = line.partyId   || "_unknown";
      const partyName = line.partyName || "غير مُسمى";
      if(!partyMap.has(partyId)){
        partyMap.set(partyId, { id: partyId, name: partyName, txns: [] });
      }
      const debit  = Number(line.debit)  || 0;
      const credit = Number(line.credit) || 0;
      /* For receivables (asset): debit = charge, credit = payment */
      /* For payables  (liability): credit = charge, debit = payment */
      const charge  = isReceivable ? debit  : credit;
      const payment = isReceivable ? credit : debit;
      partyMap.get(partyId).txns.push({
        date, charge, payment,
        narration: entry.narration || "",
        refNo: entry.refNo || "",
      });
    });
  });

  /* For each party, apply FIFO matching of payments to oldest charges */
  const parties = [];
  const totals = { current: 0, b0_30: 0, b31_60: 0, b61_90: 0, b90_plus: 0, grand: 0 };

  partyMap.forEach((p) => {
    /* Sort by date ascending */
    const sorted = p.txns.slice().sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    /* Open charges queue */
    const open = [];/* [{date, remaining}] */
    let totalPayments = 0;
    sorted.forEach(t => {
      if(t.charge > 0){
        open.push({ date: t.date, remaining: t.charge });
      }
      if(t.payment > 0){
        let toApply = t.payment;
        totalPayments += t.payment;
        while(toApply > 0 && open.length > 0){
          const head = open[0];
          if(head.remaining <= toApply){
            toApply -= head.remaining;
            open.shift();
          } else {
            head.remaining -= toApply;
            toApply = 0;
          }
        }
        /* If toApply still > 0, customer overpaid (credit balance) — we ignore
           overpayment in aging buckets; it'd show as negative grand total. */
      }
    });

    /* Bucket open charges by age */
    const buckets = { current: 0, b0_30: 0, b31_60: 0, b61_90: 0, b90_plus: 0 };
    open.forEach(o => {
      const days = daysBetween(o.date, asOfDate);
      buckets[bucketFor(days)] += o.remaining;
    });

    const grand = buckets.current + buckets.b0_30 + buckets.b31_60 + buckets.b61_90 + buckets.b90_plus;
    if(grand > 0.01 || totalPayments > 0.01){
      parties.push({
        id: p.id,
        name: p.name,
        ...buckets,
        grand,
        totalPayments,
      });
      totals.current   += buckets.current;
      totals.b0_30     += buckets.b0_30;
      totals.b31_60    += buckets.b31_60;
      totals.b61_90    += buckets.b61_90;
      totals.b90_plus  += buckets.b90_plus;
      totals.grand     += grand;
    }
  });

  /* Sort by grand total descending */
  parties.sort((a, b) => b.grand - a.grand);

  return { parties, totals, asOfDate, side };
}
