/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Customer additional discount (خصم إضافي) — V21.21.59
   ───────────────────────────────────────────────────────────────────────
   خصم إضافي للعميل (آخر الموسم مثلاً) — مبلغ بيقلّل رصيد العميل، مش دفعة
   (مفيش حركة خزنة) ومش مرتجع (مفيش بضاعة). بيتخزّن كـ «إشعار خصم» داخل
   salesCreditNotes بعلامة kind:"discount" (يعيد استخدام بنية الـ split +
   الترحيل المحاسبي الموجودة — صفر migration).

   الترحيل المحاسبي: نعيد استخدام autoPost.creditNotePosted نفسه بـ order=null
   → بيتخطّى COGS تلقائياً ويعمل القيد: Dr مرتجع المبيعات / Cr ذمم العميل
   (= عكس إيراد + تقليل المستحق = أثر الخصم بالظبط).
   ═══════════════════════════════════════════════════════════════════════ */

import { r2 } from "../format.js";
import { nowISO } from "../serverTime.js";
import { reserveDiscountNo, postCreditNoteMutator } from "../invoices.js";
import { autoPost } from "../accounting/autoPost.js";

/* هل الإشعار ده «إشعار خصم» (مش مرتجع)؟ */
export function isDiscountNote(cn){
  return !!cn && cn.kind === "discount";
}

/* يبني كائن إشعار الخصم (status=draft) — لازم يتنادى داخل upConfig لأنه بيحجز رقم. */
export function buildDiscountNote(d, { customerId, customerName, amount, date, reason }, userName){
  const amt = r2(Number(amount) || 0);
  const today = new Date().toISOString().split("T")[0];
  const no = reserveDiscountNo(d);
  return {
    id: "disc_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7),
    creditNoteNo: no,
    kind: "discount",                 /* ← يميّزه عن المرتجعات */
    customerId, customerName: customerName || "",
    date: date || today,
    items: [],                        /* خصم — مفيش بنود */
    subtotal: amt, discountPct: 0, discount: 0, total: amt,
    reason: reason || "خصم إضافي",
    notes: reason || "خصم إضافي",
    status: "draft",
    createdBy: userName || "",
    createdAt: nowISO(),
  };
}

/* الفلو الكامل: إنشاء (draft) → ترحيل (posted) → قيد محاسبي → خزن postedJournalRef.
   يحاكي CreditNotesPg.handlePost بالظبط بس بـ order=null (مفيش COGS).
   لا يرمي — بيرجّع { ok, cn?, error? }. */
export async function createCustomerDiscount(data, upConfig, input, customer, userName){
  try {
    const amt = r2(Number(input && input.amount) || 0);
    if(!input || !input.customerId || amt <= 0) return { ok: false, error: "اختر العميل وأدخل مبلغ صحيح" };

    /* 1) إنشاء المسودة (يحجز الرقم داخل upConfig) */
    let cn = null;
    const r1 = await upConfig(d => {
      if(!Array.isArray(d.salesCreditNotes)) d.salesCreditNotes = [];
      cn = buildDiscountNote(d, input, userName);
      d.salesCreditNotes.push(cn);
    });
    if(r1 && r1.ok === false) return { ok: false, error: r1.error || "فشل الحفظ" };
    if(!cn) return { ok: false, error: "تعذّر إنشاء إشعار الخصم" };

    /* 2) ترحيل (status=posted) */
    await upConfig(d => { postCreditNoteMutator(d, cn.id, userName); });
    const postedCN = { ...cn, status: "posted", postedAt: nowISO(), postedBy: userName || "" };

    /* 3) قيد محاسبي — نفس مسار الإشعار الدائن، order=null → بدون COGS */
    let ref = null;
    try {
      const res = await autoPost.creditNotePosted(data, postedCN, customer || null, null, userName);
      if(res && res.main && res.main.ok && res.main.entry){
        ref = { date: res.main.entry.date, entryId: res.main.entry.id, refNo: res.main.entry.refNo };
      }
    } catch(e){ console.warn("[createCustomerDiscount] autoPost failed:", e?.message || e); }

    /* 4) خزن postedJournalRef (لو اترحّل) */
    if(ref){
      await upConfig(d => {
        const idx = (d.salesCreditNotes || []).findIndex(c => c.id === cn.id);
        if(idx >= 0) d.salesCreditNotes[idx].postedJournalRef = ref;
      });
    }
    return { ok: true, cn: postedCN };
  } catch(e){
    console.error("[createCustomerDiscount] failed:", e);
    return { ok: false, error: e?.message || String(e) };
  }
}
