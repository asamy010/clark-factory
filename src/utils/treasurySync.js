/* ═══════════════════════════════════════════════════════════════════════
   CLARK · مزامنة دفعات الخزنة اليتيمة للعملاء (V21.21.32)
   ───────────────────────────────────────────────────────────────────────
   «اليتيمة» = حركة خزنة وارد (type:"in") متسجلة باسم عميل (custId) من غير
   صف مقابل في custPayments (مفيش custPayment.treasuryTxId بيشاور عليها).

   المشكلة: بعد V21.21.30 اليتيمة بتتحسب في كشف الحساب وملخص العميل،
   لكن بوابة العميل (api/customer-portal.js) بتقرأ custPayments بس ولا
   تقرأ الخزنة إطلاقاً (قراءة كل treasuryDays في السيرفر مكلفة) → رصيد
   البوابة يخالف الكشف. الحل الجذري (قرار Ahmed): تجسيد اليتيمة كدفعة
   رسمية في custPayments مرة واحدة — فتظهر في كل الشاشات والبوابة من
   نفس مصدر البيانات. (نمط V19.14 بتاع الموردين، مُحسَّن بمعرّفات حتمية.)

   ضمانات الأمان:
   • id حتمي = "tsync-" + معرّف حركة الخزنة (نمط V21.9.249): جهازان
     يشغّلان المزامنة في نفس اللحظة هيمنتجوا نفس الـ id → دمج الـ split
     collection بيستبدل بدل ما يكرّر → مستحيل تتعدّ الدفعة مرتين.
   • idempotent هيكلياً: أول تشغيل بيربط (treasuryTxId) — التشغيلات
     التالية تتخطى. صفر تأثير على الرصيد (المبلغ كان محسوباً بالفعل
     في الكشف/الملخص — بيتنقل من بند «يتيمة» لبند «دفعة رسمية»).
   • استثناءات مطابقة لمنطق الكشف (statement.js) والملخص حرفياً:
     حركات الشيكات (check_collect/check_pay) مستبعدة — الشيك متعدّ
     من data.checks (قاعدة V21.21.14).
   ═══════════════════════════════════════════════════════════════════════ */

/* فحص نقي رخيص: يرجّع حركات الخزنة اليتيمة (للقرار "هل فيه شغل؟" قبل
   أي كتابة). نفس الشروط المستخدمة في المُنفّذ تحت. */
export function findOrphanCustTreasury(treasury, custPayments) {
  const known = new Set((custPayments || []).map(p => p && p.treasuryTxId).filter(Boolean));
  const existingIds = new Set((custPayments || []).map(p => p && p.id).filter(Boolean));
  return (treasury || []).filter(t => {
    if (!t || !t.id || t.type !== "in") return false;
    if (!t.custId) return false;
    if (known.has(t.id)) return false;
    if (t.sourceType === "check_collect" || t.sourceType === "check_pay") return false;
    if (existingIds.has("tsync-" + t.id)) return false;/* اتجسّدت قبل كده */
    return true;
  });
}

/* المُنفّذ — يُمرَّر لـ upConfig. يجسّد كل يتيمة كدفعة عميل رسمية.
   يرجّع { created, totalAmount } للتقرير. */
export function syncOrphanCustTreasuryMutator(d) {
  const orphans = findOrphanCustTreasury(d.treasury, d.custPayments);
  if (orphans.length === 0) return { created: 0, totalAmount: 0 };
  if (!Array.isArray(d.custPayments)) d.custPayments = [];
  const now = new Date().toISOString();
  let totalAmount = 0;
  orphans.forEach(t => {
    const cust = (d.customers || []).find(c => c && c.id === t.custId);
    const amount = Number(t.amount) || 0;
    totalAmount += amount;
    d.custPayments.push({
      /* id حتمي — راجع ضمانات الأمان فوق */
      id: "tsync-" + t.id,
      custId: t.custId,
      custName: cust ? cust.name : (t.custName || ""),
      amount,
      /* التاريخ = تاريخ حركة الخزنة (يحدد day-doc الصحيح في custPaymentsDays) */
      date: t.date || String(t.createdAt || "").slice(0, 10) || new Date().toISOString().split("T")[0],
      method: "خزنة",
      notes: (t.notes || t.desc || "") + " — مزامنة تلقائية من الخزنة",
      treasuryTxId: t.id,
      createdBy: t.by || "v212132-auto-sync",
      createdAt: now,
      _v212132AutoSync: now,
    });
  });
  return { created: orphans.length, totalAmount };
}
