/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Purchase document deep-linking (V21.21.21)
   ───────────────────────────────────────────────────────────────────────
   تنقّل قابل للضغط بين مستندات سلسلة المشتريات
   (عرض سعر RFQ ↔ أمر شراء PO ↔ استلام ↔ فاتورة). نظير openSalesDoc.
   الآلية: نسجّل الطلب في window + نطلق clark-open-purchase-tab (الهَب بيبدّل
   التب الداخلي) + clark-open-purchase-doc (الصفحة الهدف بتفتح المودال).
   ═══════════════════════════════════════════════════════════════════════ */

const KIND_TAB = {
  rfq:     "rfq",
  po:      "orders",
  receipt: "receipts",
  invoice: "invoices",
};

export function openPurchaseDoc(kind, id){
  if(!id) return;
  const tab = KIND_TAB[kind];
  if(!tab) return;
  try { window.__clarkOpenPurchaseDoc = { kind, id, ts: Date.now() }; } catch(e) {}
  try { window.dispatchEvent(new CustomEvent("clark-open-purchase-tab", { detail: tab })); } catch(e) {}
  try { window.dispatchEvent(new CustomEvent("clark-open-purchase-doc", { detail: { kind, id } })); } catch(e) {}
}

export function consumePendingPurchaseDoc(kind){
  try {
    const p = window.__clarkOpenPurchaseDoc;
    if(p && p.kind === kind && p.id){ delete window.__clarkOpenPurchaseDoc; return p.id; }
  } catch(e) {}
  return null;
}
