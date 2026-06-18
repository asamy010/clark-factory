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
import { reserveDiscountNo, postCreditNoteMutator, voidCreditNoteMutator } from "../invoices.js";
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

    /* 3) قيد محاسبي مخصّص — Dr خصم مسموح به (4110) / Cr عملاء (1210). بدون COGS. */
    let posted = false;
    try {
      const res = await autoPost.discountPosted(data, postedCN, customer || null, userName);
      posted = !!(res && res.ok);
    } catch(e){ console.warn("[createCustomerDiscount] autoPost failed:", e?.message || e); }

    /* 4) خزن مرجع القيد (للإلغاء لاحقاً — العكس بيتلاقى بـ date+sourceType+sourceId).
       _buildAndPost ما بيرجّعش الـ entry فبنبني المرجع من القيم المعروفة. */
    if(posted){
      await upConfig(d => {
        const idx = (d.salesCreditNotes || []).findIndex(c => c.id === cn.id);
        if(idx >= 0) d.salesCreditNotes[idx].postedJournalRef = { date: cn.date, sourceType: "salesDiscount", sourceId: cn.id };
      });
    }
    return { ok: true, cn: postedCN };
  } catch(e){
    console.error("[createCustomerDiscount] failed:", e);
    return { ok: false, error: e?.message || String(e) };
  }
}

/* V21.27.52: تعديل خصم إضافي «في المكان» — نفس السجل ونفس القيد. postEntry
   idempotent بيلاقي القيد بـ (sourceType=salesDiscount, sourceId=cn.id) ويحدّث
   سطوره بنفس الـ refNo (مفيش قيد جديد). لو التاريخ اتغيّر بس: القيد بيتنقل ليوم
   تاني، فنعكس القديم في يومه الأصلي الأول ثم نرحّل في اليوم الجديد.
   بيعدّل: المبلغ + السبب + التاريخ. لا يرمي — بيرجّع { ok, error? }. */
export async function editCustomerDiscount(data, upConfig, oldCN, input, customer, userName){
  try {
    if(!oldCN || oldCN.kind !== "discount") return { ok: false, error: "ليس إشعار خصم" };
    if(oldCN.status === "void") return { ok: false, error: "الخصم ملغى — لا يمكن تعديله" };
    const amt = r2(Number(input && input.amount) || 0);
    if(amt <= 0) return { ok: false, error: "أدخل مبلغ صحيح" };
    const newDate = String(input.date || oldCN.date || "").slice(0, 10);
    const newReason = String(input.reason || "خصم إضافي").slice(0, 200);
    const dateChanged = !!newDate && newDate !== oldCN.date;

    /* لو التاريخ اتغيّر: اعكس القيد القديم في يومه الأصلي (postEntry بيدوّر باليوم؛
       اليوم الجديد مش هيلاقي القديم → نعكسه يدوي عشان مايفضلش يتيم). */
    if(dateChanged){
      try { await autoPost.discountVoided(data, oldCN, userName); }
      catch(e){ console.warn("[editCustomerDiscount] reverse(old date) failed:", e?.message || e); }
    }

    /* حدّث السجل في المكان — نفس id/رقم/حالة */
    let updatedCN = null;
    await upConfig(d => {
      const idx = (d.salesCreditNotes || []).findIndex(c => c.id === oldCN.id);
      if(idx < 0) return;
      const cn = d.salesCreditNotes[idx];
      cn.subtotal = amt; cn.total = amt;
      cn.reason = newReason; cn.notes = newReason;
      cn.date = newDate;
      cn.editedAt = nowISO(); cn.editedBy = userName || "";
      cn.postedJournalRef = { date: newDate, sourceType: "salesDiscount", sourceId: cn.id };
      updatedCN = { ...cn };
    });
    if(!updatedCN) return { ok: false, error: "السجل غير موجود" };

    /* أعِد الترحيل — نفس التاريخ → postEntry بيحدّث القيد نفسه (نفس refNo)؛
       التاريخ اتغيّر → قيد جديد في اليوم الجديد (القديم اتعكس فوق). */
    try { await autoPost.discountPosted(data, updatedCN, customer || null, userName); }
    catch(e){ console.warn("[editCustomerDiscount] re-post failed:", e?.message || e); }

    return { ok: true, cn: updatedCN };
  } catch(e){
    console.error("[editCustomerDiscount] failed:", e);
    return { ok: false, error: e?.message || String(e) };
  }
}

/* إلغاء خصم — بيفضل في السجل (status=void، للأرشيف) + بيعكس القيد المحاسبي.
   الخصم الملغى مش بيأثّر على الرصيد (مستبعد من الكشف والملخص). */
export async function voidCustomerDiscount(data, upConfig, discountNote, userName){
  try {
    if(!discountNote || discountNote.kind !== "discount") return { ok: false, error: "ليس إشعار خصم" };
    if(discountNote.status === "void") return { ok: true }; /* ملغى بالفعل */
    /* اعكس القيد أولاً (بيتلاقى بـ date+sourceType+sourceId) */
    try { await autoPost.discountVoided(data, discountNote, userName); }
    catch(e){ console.warn("[voidCustomerDiscount] reverse failed:", e?.message || e); }
    /* علّمه ملغى */
    await upConfig(d => { voidCreditNoteMutator(d, discountNote.id, userName, "إلغاء خصم إضافي"); });
    return { ok: true };
  } catch(e){
    console.error("[voidCustomerDiscount] failed:", e);
    return { ok: false, error: e?.message || String(e) };
  }
}

/* حذف خصم نهائياً — بيشيل السجل بالكامل + بيعكس القيد المحاسبي (لو لسه مرحّل). */
export async function deleteCustomerDiscount(data, upConfig, discountNote, userName){
  try {
    if(!discountNote || discountNote.kind !== "discount") return { ok: false, error: "ليس إشعار خصم" };
    /* اعكس القيد لو لسه مرحّل (لو ملغى قبل كده، القيد متعكوس بالفعل) */
    if(discountNote.status === "posted"){
      try { await autoPost.discountVoided(data, discountNote, userName); }
      catch(e){ console.warn("[deleteCustomerDiscount] reverse failed:", e?.message || e); }
    }
    /* شيل السجل نهائياً */
    await upConfig(d => {
      if(Array.isArray(d.salesCreditNotes)){
        const i = d.salesCreditNotes.findIndex(c => c.id === discountNote.id);
        if(i >= 0) d.salesCreditNotes.splice(i, 1);
      }
    });
    return { ok: true };
  } catch(e){
    console.error("[deleteCustomerDiscount] failed:", e);
    return { ok: false, error: e?.message || String(e) };
  }
}
