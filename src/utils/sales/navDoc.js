/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Sales document deep-linking (V21.10.8 — #1)
   ───────────────────────────────────────────────────────────────────────
   تنقّل قابل للضغط بين مستندات سلسلة المبيعات (عرض ↔ أمر بيع ↔ فاتورة).
   الآلية: نسجّل الطلب في window + نطلق goto-tab (App.jsx بيبدّل التب) +
   حدث clark-open-sales-doc. الصفحة الهدف بتسمع الحدث + بتشيك الـ window
   عند الـ mount (عشان لو اتـ mount بعد الحدث) وتفتح المودال المناسب.
   ═══════════════════════════════════════════════════════════════════════ */

const KIND_TAB = {
  quotation:  "salesQuotations",
  salesOrder: "salesOrders",
  invoice:    "salesInvoices",
};

/* افتح مستند مبيعات بنوعه + id (يبدّل التب ويفتح المودال). */
export function openSalesDoc(kind, id){
  if(!id) return;
  const tab = KIND_TAB[kind];
  if(!tab) return;
  try { window.__clarkOpenSalesDoc = { kind, id, ts: Date.now() }; } catch(e) {}
  try { window.dispatchEvent(new CustomEvent("goto-tab", { detail: tab })); } catch(e) {}
  try { window.dispatchEvent(new CustomEvent("clark-open-sales-doc", { detail: { kind, id } })); } catch(e) {}
}

/* استهلاك طلب فتح معلّق لنوع معيّن. بترجّع id لو فيه طلب مطابق (وتمسحه)،
   أو null. تُستخدم في الصفحة الهدف عند الـ mount. */
export function consumePendingSalesDoc(kind){
  try {
    const p = window.__clarkOpenSalesDoc;
    if(p && p.kind === kind && p.id){
      delete window.__clarkOpenSalesDoc;
      return p.id;
    }
  } catch(e) {}
  return null;
}
