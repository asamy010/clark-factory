/* ═══════════════════════════════════════════════════════════════════════
   CLARK · التفقيط — المبلغ بالحروف العربية (V21.21.44)
   ───────────────────────────────────────────────────────────────────────
   tafqitEGP(amount) → "فقط ألف وخمسمائة جنيهاً مصرياً لا غير"
   مع القروش → "... جنيهاً مصرياً وخمسون قرشاً لا غير"

   الصيغة تتبع العُرف المالي المصري المعتمد في الفواتير والشيكات (زي
   ما طلب Ahmed): البادئة «فقط» + المبلغ بالحروف + اسم العملة + «لا غير».
   اسم العملة ثابت «جنيهاً مصرياً» / «قرشاً» — العُرف السائد (مش إعراب
   تمييز كامل) عشان يطابق المثال المطلوب بالظبط.

   النطاق: 0 → 999,999,999,999.99 (لحد مئات المليارات + قرشين عشريين).
   دالة نقية صفر I/O — قابلة للاختبار بالكامل.
   ═══════════════════════════════════════════════════════════════════════ */

const ONES  = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
const TEENS = ["عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
const TENS  = ["", "عشرة", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const HUNDREDS = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];

/* أعداد المجموعات (ألف/مليون/مليار) — مفرد · مثنى · جمع(3-10) · تمييز(11+) */
const SCALES = [
  { single: "ألف",   dual: "ألفان",   plural: "آلاف",   many: "ألف" },
  { single: "مليون", dual: "مليونان", plural: "ملايين", many: "مليوناً" },
  { single: "مليار", dual: "ملياران", plural: "مليارات", many: "ملياراً" },
];

/* 0–999 بالحروف */
function below1000(n){
  n = Math.floor(n);
  if(n === 0) return "";
  if(n < 10) return ONES[n];
  if(n < 20) return TEENS[n - 10];
  if(n < 100){
    const o = n % 10, t = Math.floor(n / 10);
    return o > 0 ? (ONES[o] + " و" + TENS[t]) : TENS[t];
  }
  const h = Math.floor(n / 100), rest = n % 100;
  return rest > 0 ? (HUNDREDS[h] + " و" + below1000(rest)) : HUNDREDS[h];
}

/* مجموعة مقياس (ألف/مليون/مليار) بصيغتها الصحيحة حسب العدد */
function scaleGroup(count, scaleIdx){
  if(count === 0) return "";
  const s = SCALES[scaleIdx];
  if(count === 1) return s.single;
  if(count === 2) return s.dual;
  if(count >= 3 && count <= 10) return below1000(count) + " " + s.plural;
  return below1000(count) + " " + s.many;
}

/* عدد صحيح كامل (0 → مئات المليارات) بالحروف */
export function integerToArabicWords(num){
  num = Math.floor(Math.abs(Number(num) || 0));
  if(num === 0) return "صفر";
  const groups = [];/* [آحاد, آلاف, ملايين, مليارات] */
  let rem = num;
  for(let i = 0; i < 4; i++){ groups.push(rem % 1000); rem = Math.floor(rem / 1000); }
  const parts = [];
  if(groups[3] > 0) parts.push(scaleGroup(groups[3], 2));/* مليار */
  if(groups[2] > 0) parts.push(scaleGroup(groups[2], 1));/* مليون */
  if(groups[1] > 0) parts.push(scaleGroup(groups[1], 0));/* ألف */
  if(groups[0] > 0) parts.push(below1000(groups[0]));    /* آحاد */
  return parts.join(" و");
}

/* التفقيط الكامل للجنيه المصري.
   opts.currency = اسم العملة المفرد (افتراضي "جنيهاً مصرياً")
   opts.fraction = اسم الكسر (افتراضي "قرشاً") */
export function tafqitEGP(amount, opts = {}){
  const currency = opts.currency || "جنيهاً مصرياً";
  const fraction = opts.fraction || "قرشاً";
  const n = Math.abs(Number(amount) || 0);
  const pounds = Math.floor(n);
  const piasters = Math.round((n - pounds) * 100);
  /* تقريب القرش لو طلع 100 (مثلاً 0.999 → 1.00) */
  let p = pounds, pi = piasters;
  if(pi === 100){ p += 1; pi = 0; }

  if(p === 0 && pi === 0) return "فقط صفر " + currency + " لا غير";

  const segs = [];
  if(p > 0) segs.push(integerToArabicWords(p) + " " + currency);
  if(pi > 0) segs.push(integerToArabicWords(pi) + " " + fraction);
  return "فقط " + segs.join(" و") + " لا غير";
}
