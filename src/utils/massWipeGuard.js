/* ═══════════════════════════════════════════════════════════════════════
   CLARK · حارس المسح الجماعي (Mass-Wipe Guard) — V21.21.41
   ───────────────────────────────────────────────────────────────────────
   منطق نقي مستخرَج من شبكة الأمان في App.jsx upConfig (V19.62/63 + V21.9.67).
   الغرض: اكتشاف «مسح جماعي» مشبوه لمصفوفة متقسّمة/مجزّأة — أي حقل عدده
   كان ≥2 وبقى 0 في نفس الكتابة. ده غالباً عَرَض لـ bug في الترطيب
   (hydration) بيفضّي collection بالغلط، مش فعل مستخدم.

   ─── ثغرة V21.21.41 اللي الدالة دي بتصلحها ───
   الافتراض القديم في الشبكة كان: «واجهات الحذف المجمّع بتحذف عنصر-عنصر»
   فأي ≥2→0 = bug. لكن bulkDeleteChecks/bulkDeleteTxs بيحذفوا الكل في
   نداء upConfig واحد. فحذف كل الشيكات (العدد → 0) كان بيتمنع بصمت بينما
   الواجهة بتقول «تم الحذف» → الشيكات ترجع بعد الريفريش (المستخدم بلّغ).

   الحل: allowEmpty — قائمة الحقول اللي المستخدم **أكّد** تفريغها صراحةً
   (وراء dialog تأكيد). الشبكة بتفضل تمنع تفريغ أي حقل **مش** في القائمة
   دي — فلو bug ترطيب فضّى collection تاني غير مقصود في نفس الكتابة، لسه
   بيتمسك. حماية مستهدفة بدل بطّالة عامة.

   countBefore: دالة (field) → عدد العناصر قبل الكتابة (App.jsx بيقرأها من
   splitDataRef/partitionedDataRef؛ الاختبارات بتمرّر map بسيطة).
   ═══════════════════════════════════════════════════════════════════════ */

export function collectMassWipes(fields, countBefore, afterObj, allowEmpty, label){
  const allow = new Set(Array.isArray(allowEmpty) ? allowEmpty : []);
  const wipes = [];
  for(const f of (fields || [])){
    /* نفحص بس الحقول الداخلة في الكتابة دي (موجودة في afterObj) */
    if(!afterObj || !(f in afterObj)) continue;
    const before = Number(countBefore(f)) || 0;
    const after = Array.isArray(afterObj[f]) ? afterObj[f].length : 0;
    if(before >= 2 && after === 0 && !allow.has(f)){
      wipes.push(`${f}: ${before} → 0 (${label})`);
    }
  }
  return wipes;
}
