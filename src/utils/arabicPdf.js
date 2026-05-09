/* ════════════════════════════════════════════════════════════════════════
   CLARK · arabicPdf.js — DEAD CODE (V19.80.22 onwards)
   ════════════════════════════════════════════════════════════════════════
   This file used to provide jsPDF-based delivery receipt rendering with a
   custom Arabic shaper (`ar()`) that pre-shaped FE-range presentation forms
   and reversed strings into visual order. It was the auto-WhatsApp PDF path
   from V19.70.23 through V19.80.21.

   Why it's dead: the shaper had unfixable bugs in mixed-script and table
   contexts. After V19.80.14 removed `pdf.setR2L(true)` to stop reversing
   Latin/digits, Arabic ended up reversed letter-by-letter without contextual
   shaping (e.g. "احمد سامي" → "يماس دمحا"). Every patch attempt either
   re-broke Latin, re-broke digits, or re-broke shaping.

   The replacement: V19.80.22 routes auto-PDF through `htmlToPdfBase64`
   (html2canvas → jsPDF image), reusing the browser's native RTL/shaping
   engine. Same path as the per-row 🖨 print receipt, so auto-PDF and manual
   print are now visually identical.

   This file is kept on disk only to avoid breaking any third-party scripts
   that might import from it. The exports throw helpful errors if anyone
   tries to use them. Remove entirely once you're sure nothing else imports.
   ════════════════════════════════════════════════════════════════════════ */

const _DEAD = "arabicPdf.js was removed in V19.80.22 — use htmlToPdfBase64 from htmlToPdf.js with fontFamily option instead.";

export function loadArabicPdfLibs() {
  return Promise.reject(new Error(_DEAD));
}

export function buildDeliveryReceiptPdfBase64() {
  throw new Error(_DEAD);
}
