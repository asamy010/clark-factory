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

import { r2 } from "../format.js";

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
    (data.salesInvoices || []).forEach(inv => {
      if(inv.customerId !== custId || inv.type === "purchase") return;
      if(inv.status === "void") return;
      const draft = inv.status !== "posted";
      const sub = r2(Number(inv.subtotal) || Number(inv.total) || 0);
      const disc = r2(Number(inv.discount) || 0);
      entries.push({ date: inv.date, createdAt: inv.createdAt, type: "sales_invoice", ref: inv.invoiceNo, refId: inv.id,
        desc: "فاتورة مبيعات " + (inv.invoiceNo || "") + " — " + ((inv.items || []).length) + " بند", debit: sub, credit: 0, draft, order: 0, raw: inv });
      if(disc > 0) entries.push({ date: inv.date, createdAt: inv.createdAt, type: "sales_invoice_disc", ref: inv.invoiceNo, refId: inv.id,
        desc: "خصم فاتورة " + (inv.invoiceNo || ""), debit: 0, credit: disc, draft, order: 1, raw: inv });
    });
    (data.salesCreditNotes || []).forEach(cn => {
      if(cn.customerId !== custId || cn.status === "void") return;
      entries.push({ date: cn.date, createdAt: cn.createdAt, type: "credit_note", ref: cn.creditNoteNo, refId: cn.id,
        desc: "مرتجع مبيعات " + (cn.creditNoteNo || "") + (cn.linkedInvoiceNo ? " (فاتورة " + cn.linkedInvoiceNo + ")" : ""), debit: 0, credit: r2(Number(cn.total) || 0), draft: cn.status !== "posted", raw: cn });
    });
  } else {
    /* operational — تسليمات/مرتجعات فعلية بالخصم */
    const cust = (data.customers || []).find(c => c.id === custId);
    const cdisc = Number(cust?.discount) || 0;
    (data.orders || []).forEach(o => {
      const sp = Number(o.sellPrice) || 0;
      (o.customerDeliveries || []).forEach(d => {
        if(d.custId !== custId) return;
        const gross = r2((Number(d.qty) || 0) * (Number(d.price) || sp));
        const disc = (d.discPct != null ? Number(d.discPct) : cdisc) || 0;
        entries.push({ date: d.date, createdAt: d.createdAt, type: "delivery", ref: o.modelNo, refId: o.id,
          desc: "تسليم — " + (o.modelNo || "") + " (" + (Number(d.qty) || 0) + " قطعة)", debit: gross, credit: 0, order: 0, raw: { ...d, _order: o } });
        if(disc > 0) entries.push({ date: d.date, createdAt: d.createdAt, type: "delivery_disc", ref: o.modelNo, refId: o.id,
          desc: "خصم تسليم " + (o.modelNo || "") + " (" + disc + "%)", debit: 0, credit: r2(gross * disc / 100), order: 1, raw: { ...d, _order: o } });
      });
      (o.customerReturns || []).forEach(rt => {
        if(rt.custId !== custId) return;
        const gross = r2((Number(rt.qty) || 0) * sp);
        const disc = (rt.discPct != null ? Number(rt.discPct) : cdisc) || 0;
        entries.push({ date: rt.date, createdAt: rt.createdAt, type: "return", ref: o.modelNo, refId: o.id,
          desc: "مرتجع — " + (o.modelNo || "") + " (" + (Number(rt.qty) || 0) + " قطعة)", debit: 0, credit: r2(gross * (1 - disc / 100)), raw: { ...rt, _order: o } });
      });
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
      const sub = r2(Number(inv.subtotal) || Number(inv.total) || 0);
      const disc = r2(Number(inv.discount) || 0);
      entries.push({ date: inv.date, createdAt: inv.createdAt, type: "purchase_invoice", ref: inv.invoiceNo, refId: inv.id,
        desc: "فاتورة مشتريات " + (inv.invoiceNo || "") + " — " + ((inv.items || []).length) + " بند", debit: sub, credit: 0, draft, order: 0, raw: inv });
      if(disc > 0) entries.push({ date: inv.date, createdAt: inv.createdAt, type: "purchase_invoice_disc", ref: inv.invoiceNo, refId: inv.id,
        desc: "خصم فاتورة " + (inv.invoiceNo || ""), debit: 0, credit: disc, draft, order: 1, raw: inv });
    });
    (data.purchaseDebitNotes || []).forEach(dn => {
      if(dn.supplierId !== supId || dn.status === "void") return;
      entries.push({ date: dn.date, createdAt: dn.createdAt, type: "debit_note", ref: dn.debitNoteNo, refId: dn.id,
        desc: "مرتجع مشتريات " + (dn.debitNoteNo || "") + (dn.linkedInvoiceNo ? " (فاتورة " + dn.linkedInvoiceNo + ")" : ""), debit: 0, credit: r2(Number(dn.total) || 0), draft: dn.status !== "posted", raw: dn });
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
        desc: "استلام " + (rc.receiptNo || "") + " — " + ((rc.items || []).length) + " بند", debit: r2(Number(rc.totalAmount) || 0), credit: 0, raw: rc });
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
  result.rows.forEach(r => rows.push([r.date || "", r.desc || "", r.ref || "", r.debit || "", r.credit || "", r.draft ? "(مسودة)" : (r.balance ?? "")]));
  rows.push([]);
  rows.push(["", "الإجمالي", "", result.totals.debit, result.totals.credit, result.totals.closing]);
  return rows;
}
