/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · مصدر واحد لتكلفة الوحدة (V21.21.38)
   ───────────────────────────────────────────────────────────────────────
   كانت الدالة دي منسوخة نسختين متطابقتين:
   - autoPost.js:resolveUnitCost
   - postingRules.js:_resolveUnitCost  (نسخة محلية «لتجنب الاستيراد
     الدائري autoPost ↔ postingRules» — V21.9.87، مع تعليق «لو غيّرت
     واحدة غيّر التانية»)
   النسختان المتطابقتان يدوياً = انحراف مضمون مع الوقت (نفس صنف مشكلة
   V21.9.87 نفسها). الحل: موديول مستقل صغير يستورده الاتنان — الدائرة
   اتكسرت من غير نسخ.

   أولوية مصدر التكلفة (accountingSettings.cogsCostSource):
     "manual"   → order.costPrice فقط
     "computed" → calcOrder().costPer فقط
     "auto"     → اليدوي لو > 0، وإلا المحسوب (الافتراضي)
   ═══════════════════════════════════════════════════════════════════════ */
import { calcOrder } from "../orders.js";

export function resolveUnitCost(order, config){
  if(!order) return 0;
  const source = (config?.accountingSettings?.cogsCostSource) || "auto";
  const manual = Number(order.costPrice) || 0;
  let computed = 0;
  try {
    const calc = calcOrder(order);
    computed = Number(calc?.costPer) || 0;
  } catch(e){
    computed = 0;
  }
  if(source === "manual") return manual;
  if(source === "computed") return computed;
  return manual > 0 ? manual : computed;
}
