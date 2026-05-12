/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Statement of Account Utility (V21.11.0 — Feature #4)
   ───────────────────────────────────────────────────────────────────────
   Pure functions that build a cumulative debit/credit/running-balance
   statement for a customer or supplier. Merges six daily-split data
   sources into a chronologically-ordered timeline.

   --- Conventions (CRITICAL) ---
   For CUSTOMER (sales side — receivables):
     sales_invoice_subtotal → DEBIT (raises what customer owes us)
     sales_invoice_discount → CREDIT (reduces what customer owes)
     sales_credit_note     → CREDIT (return reduces owed)
     customer_payment      → CREDIT (cash received reduces owed)
   Running balance: POSITIVE = customer owes us; NEGATIVE = we owe customer

   For SUPPLIER (purchase side — payables) — opposite convention:
     purchase_invoice_subtotal → CREDIT (raises what we owe supplier)
     purchase_invoice_discount → DEBIT (reduces what we owe)
     purchase_debit_note     → DEBIT (return reduces owed)
     supplier_payment        → DEBIT (cash paid reduces owed)
   Running balance: POSITIVE = supplier owes us; NEGATIVE = we owe supplier

   --- Float drift protection ---
   Every arithmetic op uses r2() so the running balance is bit-exact even
   over thousands of transactions. CLARK had a documented float-drift bug
   pre-V19.66; we don't repeat it.

   --- Public API ---
   buildAccountStatement(data, args) → { rows, openingBalance, totals,
                                          legacyFragmentation }
     args = { partyId, partyType: "customer"|"supplier",
              fromDate?, toDate?, invoiceNoFilter?,
              typeFilters?: {invoices, creditNotes, payments},
              includeOpeningBalance?: bool,
              statusFilter?: "posted"|"all" (default "posted") }
   ═══════════════════════════════════════════════════════════════════════ */

import { r2 } from "../format.js";

/* Build a flat list of statement entries from the data sources. Each entry
   has { date, type, refNo, description, debit, credit, refId, sessionId,
   linkedQuoteNo, linkedSONo, linkedPPONo, linkedRFQNo }. */
function collectEntries(data, partyId, partyType, statusFilter){
  const out = [];
  const onlyPosted = statusFilter !== "all";

  if(partyType === "customer"){
    /* 1. Sales invoices — split into subtotal + discount lines */
    (data.salesInvoices || []).forEach(inv => {
      if(inv.customerId !== partyId) return;
      if(onlyPosted && inv.status !== "posted") return;
      const subtotal = Number(inv.subtotal) || 0;
      const discount = Number(inv.discount) || 0;
      const groupId = "inv_" + inv.id;
      const linkRefs = {
        linkedQuoteNo: inv.fromQuotationNo || "",
        linkedSONo: inv.fromSalesOrderNo || "",
      };
      out.push({
        date: inv.date || "",
        sortKey: (inv.createdAt || inv.date || ""),
        type: "sales_invoice_subtotal",
        refNo: inv.invoiceNo,
        description: `فاتورة مبيعات ${inv.invoiceNo} — ${(inv.items || []).length} بند`,
        debit: subtotal,
        credit: 0,
        refId: inv.id,
        groupId,
        sourceType: "sales_invoice",
        status: inv.status,
        ...linkRefs,
      });
      if(discount > 0){
        out.push({
          date: inv.date || "",
          sortKey: (inv.createdAt || inv.date || "") + "_d",/* discount sorts AFTER subtotal */
          type: "sales_invoice_discount",
          refNo: inv.invoiceNo,
          description: `خصم فاتورة ${inv.invoiceNo}`,
          debit: 0,
          credit: discount,
          refId: inv.id,
          groupId,
          sourceType: "sales_invoice_discount",
          status: inv.status,
          ...linkRefs,
        });
      }
    });
    /* 2. Credit notes (sales returns) */
    (data.salesCreditNotes || []).forEach(cn => {
      if(cn.customerId !== partyId) return;
      if(onlyPosted && cn.status !== "posted") return;
      out.push({
        date: cn.date || "",
        sortKey: (cn.createdAt || cn.date || ""),
        type: "sales_credit_note",
        refNo: cn.creditNoteNo,
        description: `مرتجع مبيعات ${cn.creditNoteNo}` + (cn.linkedInvoiceNo ? ` (فاتورة ${cn.linkedInvoiceNo})` : ""),
        debit: 0,
        credit: Number(cn.total) || 0,
        refId: cn.id,
        sourceType: "sales_credit_note",
        status: cn.status,
      });
    });
    /* 3. Customer payments */
    (data.custPayments || []).forEach(p => {
      if(p.custId !== partyId) return;
      if(p.voided) return;
      if(p.type !== "payment") return;
      const methodLabel = p.method === "cash" ? "كاش" : p.method === "bank" ? "تحويل بنكي" : p.method === "check" ? "شيك" : (p.method || "");
      out.push({
        date: p.date || "",
        sortKey: (p.createdAt || p.date || ""),
        type: "customer_payment",
        refNo: p.paymentNo || ("PAY-" + (p.id || "").slice(-6)),
        description: `دفعة ${methodLabel}` + (p.linkedInvoiceNo ? ` على فاتورة ${p.linkedInvoiceNo}` : ""),
        debit: 0,
        credit: Number(p.amount) || 0,
        refId: p.id,
        sourceType: "customer_payment",
        linkedInvoiceNo: p.linkedInvoiceNo || "",
        linkedSONo: p.linkedSalesOrderNo || "",
        linkedQuoteNo: p.linkedQuotationNo || "",
      });
    });
  } else if(partyType === "supplier"){
    /* 4. Purchase invoices */
    (data.purchaseInvoices || []).forEach(inv => {
      if(inv.supplierId !== partyId) return;
      if(onlyPosted && inv.status !== "posted") return;
      const subtotal = Number(inv.subtotal) || 0;
      const discount = Number(inv.discount) || 0;
      const groupId = "pinv_" + inv.id;
      const linkRefs = {
        linkedRFQNo: inv.fromRFQNo || "",
        linkedPPONo: inv.fromPipelinePONo || "",
      };
      out.push({
        date: inv.date || "",
        sortKey: (inv.createdAt || inv.date || ""),
        type: "purchase_invoice_subtotal",
        refNo: inv.invoiceNo,
        description: `فاتورة مشتريات ${inv.invoiceNo} — ${(inv.items || []).length} بند`,
        debit: 0,
        credit: subtotal,
        refId: inv.id,
        groupId,
        sourceType: "purchase_invoice",
        status: inv.status,
        ...linkRefs,
      });
      if(discount > 0){
        out.push({
          date: inv.date || "",
          sortKey: (inv.createdAt || inv.date || "") + "_d",
          type: "purchase_invoice_discount",
          refNo: inv.invoiceNo,
          description: `خصم فاتورة ${inv.invoiceNo}`,
          debit: discount,
          credit: 0,
          refId: inv.id,
          groupId,
          sourceType: "purchase_invoice_discount",
          status: inv.status,
          ...linkRefs,
        });
      }
    });
    /* 5. Debit notes (purchase returns) */
    (data.purchaseDebitNotes || []).forEach(dn => {
      if(dn.supplierId !== partyId) return;
      if(onlyPosted && dn.status !== "posted") return;
      out.push({
        date: dn.date || "",
        sortKey: (dn.createdAt || dn.date || ""),
        type: "purchase_debit_note",
        refNo: dn.debitNoteNo,
        description: `مرتجع مشتريات ${dn.debitNoteNo}` + (dn.linkedInvoiceNo ? ` (فاتورة ${dn.linkedInvoiceNo})` : ""),
        debit: Number(dn.total) || 0,
        credit: 0,
        refId: dn.id,
        sourceType: "purchase_debit_note",
        status: dn.status,
      });
    });
    /* 6. Supplier payments */
    (data.supplierPayments || []).forEach(p => {
      if(p.supplierId !== partyId) return;
      if(p.voided) return;
      if(p.type !== "payment") return;
      const methodLabel = p.method === "cash" ? "كاش" : p.method === "bank" ? "تحويل بنكي" : p.method === "check" ? "شيك" : (p.method || "");
      out.push({
        date: p.date || "",
        sortKey: (p.createdAt || p.date || ""),
        type: "supplier_payment",
        refNo: p.paymentNo || ("PAY-" + (p.id || "").slice(-6)),
        description: `سداد ${methodLabel}` + (p.linkedInvoiceNo ? ` على فاتورة ${p.linkedInvoiceNo}` : ""),
        debit: Number(p.amount) || 0,
        credit: 0,
        refId: p.id,
        sourceType: "supplier_payment",
        linkedInvoiceNo: p.linkedInvoiceNo || "",
        linkedPPONo: p.linkedPipelinePONo || "",
        linkedRFQNo: p.linkedRFQNo || "",
      });
    });
  }

  /* Sort chronologically: by date ASC, then createdAt ASC, with discount
     lines after their subtotal (sortKey ends with "_d"). */
  out.sort((a, b) => {
    if((a.date || "") !== (b.date || "")) return (a.date || "").localeCompare(b.date || "");
    return (a.sortKey || "").localeCompare(b.sortKey || "");
  });

  return out;
}

/* Compute opening balance from all entries before `fromDate`. */
function computeOpeningBalance(allEntries, fromDate){
  if(!fromDate) return 0;
  let bal = 0;
  for(const e of allEntries){
    if((e.date || "") >= fromDate) break;
    bal = r2(bal + (Number(e.debit) || 0) - (Number(e.credit) || 0));
  }
  return bal;
}

/* Detect legacy fragmented sessions — multiple invoices for the same
   delivery session (pre-V21.x fix). For UI banner. */
function detectFragmentedSessions(invoices){
  const sessionMap = new Map();
  invoices.forEach(inv => {
    (inv.deliveryRefs || []).forEach(ref => {
      if(!ref.sessionId) return;
      const key = ref.sessionId;
      if(!sessionMap.has(key)) sessionMap.set(key, []);
      sessionMap.get(key).push({ invoiceId: inv.id, invoiceNo: inv.invoiceNo, status: inv.status });
    });
  });
  const fragmented = [];
  sessionMap.forEach((invs, sessionId) => {
    if(invs.length > 1){
      fragmented.push({ sessionId, invoices: invs });
    }
  });
  return fragmented;
}

/* Main public function. */
export function buildAccountStatement(data, args = {}){
  const {
    partyId,
    partyType = "customer",
    fromDate,
    toDate,
    invoiceNoFilter,
    typeFilters = { invoices: true, creditNotes: true, payments: true },
    includeOpeningBalance = true,
    statusFilter = "posted",
  } = args;

  if(!partyId) return { rows: [], openingBalance: 0, totals: {}, legacyFragmentation: [] };

  const allEntries = collectEntries(data, partyId, partyType, statusFilter);

  /* Opening balance based on ALL entries before fromDate (not type-filtered). */
  const openingBalance = (fromDate && includeOpeningBalance)
    ? computeOpeningBalance(allEntries, fromDate)
    : 0;

  /* Apply date + invoiceNo + type filters to the visible rows */
  let visible = allEntries;
  if(fromDate) visible = visible.filter(e => (e.date || "") >= fromDate);
  if(toDate) visible = visible.filter(e => (e.date || "") <= toDate);
  if(invoiceNoFilter && invoiceNoFilter.trim()){
    const q = invoiceNoFilter.trim().toLowerCase();
    visible = visible.filter(e => (e.refNo || "").toLowerCase().includes(q));
  }
  if(typeFilters){
    visible = visible.filter(e => {
      const t = e.sourceType || "";
      if(t.includes("invoice")) return !!typeFilters.invoices;
      if(t.includes("credit_note") || t.includes("debit_note")) return !!typeFilters.creditNotes;
      if(t.includes("payment")) return !!typeFilters.payments;
      return true;
    });
  }

  /* Build rows with running balance */
  let bal = r2(openingBalance);
  const rows = visible.map(e => {
    bal = r2(bal + (Number(e.debit) || 0) - (Number(e.credit) || 0));
    return {
      ...e,
      debit: r2(e.debit),
      credit: r2(e.credit),
      balance: bal,
    };
  });

  /* Totals over the visible range */
  const totalDebit = r2(rows.reduce((s, r) => s + (r.debit || 0), 0));
  const totalCredit = r2(rows.reduce((s, r) => s + (r.credit || 0), 0));
  const totals = {
    rowCount: rows.length,
    totalDebit,
    totalCredit,
    netMovement: r2(totalDebit - totalCredit),
    closingBalance: bal,
  };

  /* Detect fragmented sessions in the source invoices for the banner */
  const partyInvoices = partyType === "customer"
    ? (data.salesInvoices || []).filter(i => i.customerId === partyId)
    : (data.purchaseInvoices || []).filter(i => i.supplierId === partyId);
  const legacyFragmentation = detectFragmentedSessions(partyInvoices);

  return { rows, openingBalance, totals, legacyFragmentation };
}

/* Compose a short WhatsApp message summarizing the statement. */
export function buildStatementWhatsAppMessage(party, statementResult){
  const { totals, openingBalance } = statementResult;
  const closing = totals.closingBalance || 0;
  const direction = closing > 0 ? "عليكم لنا" : closing < 0 ? "لكم علينا" : "متسوّي";
  const absVal = Math.abs(closing).toLocaleString("en-EG", { minimumFractionDigits: 2 });
  return [
    `*كشف حساب ${party.name || ""}*`,
    `الرصيد الافتتاحي: ${(openingBalance).toLocaleString("en-EG")} ج.م`,
    `إجمالي مدين: ${(totals.totalDebit || 0).toLocaleString("en-EG")} ج.م`,
    `إجمالي دائن: ${(totals.totalCredit || 0).toLocaleString("en-EG")} ج.م`,
    `الرصيد الختامي: *${absVal} ج.م ${direction}*`,
    "",
    "تفاصيل الكشف الكامل في البورتال الخاص بك.",
  ].join("\n");
}
