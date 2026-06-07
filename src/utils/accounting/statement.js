/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Account Statement builder (V21.15.0 — Phase 13a)
   ───────────────────────────────────────────────────────────────────────
   كشف حساب تراكمي محاسبي (مدين / دائن / رصيد تراكمي) للعملاء والموردين.
   view-only — pure functions، صفر mutation، صفر I/O. بيستهلك الـ merged
   `data` (App.jsx) — مايعملش refetch (CLAUDE.md §2 / spec).

   ─── وضعان (toggle) — نفس الأعمدة/الإشارة، بيختلف المصدر بس ───
     • "accounting"  = فواتير مرحّلة + إشعارات + دفعات (الطبقة المحاسبية).
                       المسودات تظهر باهتة (draft:true) ومش داخلة الرصيد.
     • "operational" = التسليمات/الاستلامات الفعلية + الدفعات (يطابق رصيد
                       الشاشات الحالية: buildCustomerSummary/buildSupplierSummary).

   ─── الإشارة (موحّدة للوضعين) ───
     • العميل: مدين = مبيعات/فواتير · دائن = خصم/مرتجع/دفعة.
       رصيد موجب = مستحق علينا للعميل (العميل مدين لنا).
     • المورد: مدين = فواتير/استلامات · دائن = خصم/مرتجع/دفعة.
       رصيد موجب = مستحق للمورد (نحن مدينون له).

   كل عملية حسابية بـ r2() لتفادي float drift (الـ balance خلاف مالي).
   ═══════════════════════════════════════════════════════════════════════ */

import { r2, fmt } from "../format.js";

/* تصنيف نوع الحركة لفلتر النوع (فواتير/مرتجعات/دفعات) */
const TYPE_GROUP = {
  sales_invoice: "invoices", sales_invoice_disc: "invoices",
  purchase_invoice: "invoices", purchase_invoice_disc: "invoices",
  delivery: "invoices", delivery_disc: "invoices",
  receipt: "invoices", receipt_paid: "payments",
  credit_note: "returns", return: "returns", debit_note: "returns",
  payment: "payments", check: "payments", treasury: "payments",
};

/* ── دفعات العميل المشتركة بين الوضعين (custPayments + شيكات + خزنة يتيمة) ── */
function gatherCustomerPayments(data, custId){
  const out = [];
  /* custPayments (بنستثني الشيكات — بتتعدّ من data.checks زي buildCustomerSummary) */
  (data.custPayments || []).forEach(p => {
    if(p.custId !== custId) return;
    const m = (p.method || "").toLowerCase();
    if(m.includes("شيك") || m.includes("check")) return;
    out.push({ date: p.date, createdAt: p.createdAt, type: "payment", ref: p.id, refId: p.id,
      desc: "دفعة " + (p.method || "نقدي"), debit: 0, credit: r2(Number(p.amount) || 0), raw: p });
  });
  /* شيكات القبض (دفعة عميل) */
  (data.checks || []).forEach(c => {
    if(c.type !== "receivable") return;
    if(c.partyId !== custId) return;
    if(c.status === "مرتد" || c.status === "ملغي") return;
    if((c.category || "دفعة عميل") !== "دفعة عميل") return;
    out.push({ date: c.date || c.dueDate || "", createdAt: c.createdAt, type: "check", ref: c.checkNo || c.id, refId: c.id,
      desc: "شيك" + (c.checkNo ? " " + c.checkNo : ""), debit: 0, credit: r2(Number(c.amount) || 0), raw: c });
  });
  /* دفعات خزنة يتيمة (in) للعميل مش متسجّلة في custPayments */
  const known = new Set((data.custPayments || []).map(p => p.treasuryTxId).filter(Boolean));
  (data.treasury || []).forEach(t => {
    if(!t || !t.id || t.type !== "in") return;
    if(t.custId !== custId) return;
    if(known.has(t.id)) return;
    out.push({ date: t.date, createdAt: t.createdAt, type: "treasury", ref: t.id, refId: t.id,
      desc: "دفعة (خزنة)", debit: 0, credit: r2(Number(t.amount) || 0), raw: t });
  });
  return out;
}

function gatherCustomerEntries(data, custId, mode){
  const entries = [];
  if(mode === "accounting"){
    /* صف واحد لكل فاتورة بالصافي (الخصم داخل السطر مش سطر لوحده) */
    (data.salesInvoices || []).forEach(inv => {
      if(inv.customerId !== custId || inv.type === "purchase") return;
      if(inv.status === "void") return;
      const draft = inv.status !== "posted";
      const subtotal = r2(Number(inv.subtotal) || Number(inv.total) || 0);
      const total = r2(inv.total != null ? Number(inv.total) : subtotal);
      const disc = r2(Number(inv.discount) || (subtotal - total));
      entries.push({ date: inv.date, createdAt: inv.createdAt, type: "sales_invoice", ref: inv.invoiceNo, refId: inv.id,
        desc: "مبيعات — فاتورة " + (inv.invoiceNo || ""),
        sub: (inv.items || []).length + " بند" + (disc > 0 ? " · قبل الخصم " + fmt(subtotal) + " · بعد الخصم " + fmt(total) : ""),
        debit: total, credit: 0, draft, detail: { kind: "invoice", items: inv.items || [] }, raw: inv });
    });
    (data.salesCreditNotes || []).forEach(cn => {
      if(cn.customerId !== custId || cn.status === "void") return;
      entries.push({ date: cn.date, createdAt: cn.createdAt, type: "credit_note", ref: cn.creditNoteNo, refId: cn.id,
        desc: "مرتجع — إشعار دائن " + (cn.creditNoteNo || ""),
        sub: cn.linkedInvoiceNo ? "فاتورة " + cn.linkedInvoiceNo : "",
        debit: 0, credit: r2(Number(cn.total) || 0), draft: cn.status !== "posted", raw: cn });
    });
  } else {
    /* operational — تجميع بالـ session زي سجل بورتال العميل / CustDeliverPg buildSessionInvoices:
       صف واحد لكل تسليم (مش لكل موديل)، بالصافي مباشرة + خصم per-delivery (discPct→cust.discount→10) */
    const cust = (data.customers || []).find(c => c.id === custId);
    const pickDiscPct = (e) => {
      if(e && e.discPct != null){ const n = Number(e.discPct); if(!isNaN(n)) return n; }
      if(cust && cust.discount != null){ const n = Number(cust.discount); if(!isNaN(n)) return n; }
      return 10;
    };
    const buildGroups = (kind) => {
      const groups = {};
      (data.orders || []).forEach(o => {
        const sp = Number(o.sellPrice) || 0;
        const list = (kind === "sale" ? (o.customerDeliveries || []) : (o.customerReturns || [])).filter(e => e.custId === custId);
        list.forEach(e => {
          const qty = Number(e.qty) || 0; if(qty <= 0) return;
          const sid = e.sessionId || e.sessId || ("بدون جلسة — " + (e.date || "؟"));
          if(!groups[sid]) groups[sid] = { sessionId: sid, date: e.date || "", qty: 0, value: 0, valueAfterDisc: 0, lines: [] };
          const price = Number(e.price) || sp; const gross = qty * price; const dPct = pickDiscPct(e);
          groups[sid].qty += qty; groups[sid].value += gross; groups[sid].valueAfterDisc += Math.round(gross * (1 - dPct / 100));
          groups[sid].lines.push({ modelNo: o.modelNo || "—", modelDesc: o.modelDesc || "", qty, price: r2(price), gross: r2(gross), dPct, net: Math.round(gross * (1 - dPct / 100)) });
          if(e.date && (!groups[sid].date || e.date < groups[sid].date)) groups[sid].date = e.date;
        });
      });
      const arr = Object.values(groups).sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
      arr.forEach((g, i) => { g.invoiceNo = i + 1; }); /* رقم التسليم — #1 = الأقدم (للتراكمي) */
      return arr;
    };
    buildGroups("sale").forEach(g => {
      entries.push({ date: g.date, type: "delivery", ref: "#" + g.invoiceNo, refId: g.sessionId, order: g.invoiceNo,
        desc: "مبيعات — تسليم #" + g.invoiceNo,
        sub: fmt(g.qty) + " قطعة · قبل الخصم " + fmt(r2(g.value)) + " · بعد الخصم " + fmt(r2(g.valueAfterDisc)),
        debit: r2(g.valueAfterDisc), credit: 0, detail: { kind: "session", lines: g.lines }, raw: g });
    });
    buildGroups("return").forEach(g => {
      entries.push({ date: g.date, type: "return", ref: "#" + g.invoiceNo, refId: g.sessionId, order: g.invoiceNo,
        desc: "مرتجع — #" + g.invoiceNo,
        sub: fmt(g.qty) + " قطعة · قبل الخصم " + fmt(r2(g.value)) + " · بعد الخصم " + fmt(r2(g.valueAfterDisc)),
        debit: 0, credit: r2(g.valueAfterDisc), detail: { kind: "session", lines: g.lines }, raw: g });
    });
  }
  return entries.concat(gatherCustomerPayments(data, custId));
}

function gatherSupplierEntries(data, supId, mode){
  const entries = [];
  if(mode === "accounting"){
    (data.purchaseInvoices || []).forEach(inv => {
      if(inv.supplierId !== supId || inv.status === "void") return;
      const draft = inv.status !== "posted";
      const subtotal = r2(Number(inv.subtotal) || Number(inv.total) || 0);
      const total = r2(inv.total != null ? Number(inv.total) : subtotal);
      const disc = r2(Number(inv.discount) || (subtotal - total));
      entries.push({ date: inv.date, createdAt: inv.createdAt, type: "purchase_invoice", ref: inv.invoiceNo, refId: inv.id,
        desc: "مشتريات — فاتورة " + (inv.invoiceNo || ""),
        sub: (inv.items || []).length + " بند" + (disc > 0 ? " · قبل الخصم " + fmt(subtotal) + " · بعد الخصم " + fmt(total) : ""),
        debit: total, credit: 0, draft, detail: { kind: "invoice", items: inv.items || [] }, raw: inv });
    });
    (data.purchaseDebitNotes || []).forEach(dn => {
      if(dn.supplierId !== supId || dn.status === "void") return;
      entries.push({ date: dn.date, createdAt: dn.createdAt, type: "debit_note", ref: dn.debitNoteNo, refId: dn.id,
        desc: "مرتجع مشتريات — إشعار مدين " + (dn.debitNoteNo || ""),
        sub: dn.linkedInvoiceNo ? "فاتورة " + dn.linkedInvoiceNo : "",
        debit: 0, credit: r2(Number(dn.total) || 0), draft: dn.status !== "posted", raw: dn });
    });
    /* كل دفعات المورد (في المحاسبي الفواتير ماتحملش paidAmount) */
    (data.supplierPayments || []).forEach(p => {
      if(p.supplierId !== supId) return;
      entries.push({ date: p.date, createdAt: p.createdAt, type: "payment", ref: p.id, refId: p.id,
        desc: "دفعة للمورد " + (p.method ? "(" + p.method + ")" : ""), debit: 0, credit: r2(Number(p.amount) || 0), raw: p });
    });
  } else {
    /* operational — استلامات + المدفوع عند الاستلام + دفعات مستقلة */
    (data.purchaseReceipts || []).forEach(rc => {
      if(rc.supplierId !== supId) return;
      entries.push({ date: rc.date, createdAt: rc.createdAt, type: "receipt", ref: rc.receiptNo, refId: rc.id,
        desc: "مشتريات — استلام " + (rc.receiptNo || ""), sub: (rc.items || []).length + " بند", debit: r2(Number(rc.totalAmount) || 0), credit: 0, detail: { kind: "invoice", items: rc.items || [] }, raw: rc });
      const paid = r2(Number(rc.paidAmount) || 0);
      if(paid > 0) entries.push({ date: rc.date, createdAt: rc.createdAt, type: "receipt_paid", ref: rc.receiptNo, refId: rc.id,
        desc: "مدفوع عند الاستلام " + (rc.receiptNo || ""), debit: 0, credit: paid, order: 1, raw: rc });
    });
    (data.supplierPayments || []).forEach(p => {
      if(p.supplierId !== supId || p.receiptId) return; /* المرتبطة باستلام اتعدّت فوق */
      entries.push({ date: p.date, createdAt: p.createdAt, type: "payment", ref: p.id, refId: p.id,
        desc: "دفعة للمورد " + (p.method ? "(" + p.method + ")" : ""), debit: 0, credit: r2(Number(p.amount) || 0), raw: p });
    });
  }
  /* دفعات خزنة يتيمة (out) للمورد — مشتركة بين الوضعين (مع احترام tombstones) */
  const known = new Set((data.supplierPayments || []).map(p => p.treasuryTxId).filter(Boolean));
  const tombstones = new Set(data._deletedSupplierPayTreasuryIds || []);
  (data.treasury || []).forEach(t => {
    if(!t || !t.id || t.type !== "out") return;
    if(t.supplierId !== supId) return;
    if(known.has(t.id) || tombstones.has(t.id)) return;
    if(t.sourceType === "check_bounce") return;
    entries.push({ date: t.date, createdAt: t.createdAt, type: "treasury", ref: t.id, refId: t.id,
      desc: "دفعة للمورد (خزنة)", debit: 0, credit: r2(Number(t.amount) || 0), raw: t });
  });
  return entries;
}

/* ترتيب: التاريخ ASC ثم createdAt ثم order (subtotal قبل discount) */
function sortEntries(entries){
  return entries.slice().sort((a, b) => {
    const d = String(a.date || "").localeCompare(String(b.date || ""));
    if(d !== 0) return d;
    const c = String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
    if(c !== 0) return c;
    return (a.order || 0) - (b.order || 0);
  });
}

function typeAllowed(type, tf){
  if(!tf) return true;
  const g = TYPE_GROUP[type] || "invoices";
  if(g === "invoices") return tf.invoices !== false;
  if(g === "returns") return tf.returns !== false;
  if(g === "payments") return tf.payments !== false;
  return true;
}

/* ── الـ API الرئيسي ── */
export function buildAccountStatement(data, args = {}){
  const { partyId, partyType = "customer", mode = "accounting",
    fromDate = "", toDate = "", invoiceNoFilter = "", typeFilters = null,
    includeOpening = true } = args;
  if(partyId == null) return { rows: [], openingBalance: 0, totals: { debit: 0, credit: 0, net: 0, closing: 0, count: 0 }, partyType, mode };

  const all = sortEntries(partyType === "customer"
    ? gatherCustomerEntries(data, partyId, mode)
    : gatherSupplierEntries(data, partyId, mode));

  /* الرصيد الافتتاحي = كل الحركات (غير المسودة) قبل from-date — بغضّ النظر عن فلتر النوع */
  let openingBalance = 0;
  if(includeOpening && fromDate){
    for(const e of all){
      if(e.draft) continue;
      if(String(e.date || "") < fromDate) openingBalance = r2(openingBalance + (e.debit || 0) - (e.credit || 0));
    }
  }

  /* فلترة المدى + النوع + رقم الفاتورة */
  const inRange = all.filter(e => {
    if(fromDate && String(e.date || "") < fromDate) return false;
    if(toDate && String(e.date || "") > toDate) return false;
    if(!typeAllowed(e.type, typeFilters)) return false;
    if(invoiceNoFilter && invoiceNoFilter.trim()){
      if(!String(e.ref || "").toLowerCase().includes(invoiceNoFilter.trim().toLowerCase())) return false;
    }
    return true;
  });

  let balance = r2(openingBalance);
  const rows = [];
  for(const e of inRange){
    if(e.draft){ rows.push({ ...e, balance: null }); continue; } /* مسودة: مش داخلة الرصيد */
    balance = r2(balance + (e.debit || 0) - (e.credit || 0));
    rows.push({ ...e, balance });
  }

  const posted = rows.filter(r => !r.draft);
  const debit = r2(posted.reduce((s, r) => s + (r.debit || 0), 0));
  const credit = r2(posted.reduce((s, r) => s + (r.credit || 0), 0));
  return {
    rows, openingBalance: r2(openingBalance),
    totals: { debit, credit, net: r2(debit - credit), closing: balance, count: rows.length },
    partyType, mode,
  };
}

/* صف الإكسيل (للتصدير في Slice 4) */
export function statementToAOA(result, party){
  const head = ["التاريخ", "البيان", "المرجع", "مدين", "دائن", "الرصيد"];
  const rows = [
    ["كشف حساب: " + (party?.name || "")],
    ["الوضع:", result.mode === "accounting" ? "محاسبي" : "تشغيلي"],
    [],
    head,
  ];
  if(result.openingBalance) rows.push(["", "رصيد افتتاحي", "", "", "", result.openingBalance]);
  result.rows.forEach(r => rows.push([r.date || "", (r.desc || "") + (r.sub ? " — " + r.sub : ""), r.ref || "", r.debit || "", r.credit || "", r.draft ? "(مسودة)" : (r.balance ?? "")]));
  rows.push([]);
  rows.push(["", "الإجمالي", "", result.totals.debit, result.totals.credit, result.totals.closing]);
  return rows;
}
