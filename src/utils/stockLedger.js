/* ═══════════════════════════════════════════════════════════════════════
   CLARK · stockLedger (V21.27.94)
   ───────────────────────────────────────────────────────────────────────
   مصدر الحقيقة الموحّد لـ«صافي رصيد أصناف المخزن» (خامات/إكسسوار/منتج عام)
   من حركات الـ ledger — بدل `item.stock` المخزّن اللي ممكن يدرِف.

   القاعدة (نفس PurchasePg.stockNetMap — V21.27.77):
     in / opening → + qty
     out          → − qty
     adjust       → set = abs(qty)   (تسوية = تعيين القيمة المطلقة)
   مع استبعاد حركات الجاهز (itemType:"order" — حجز/تسليم أوامر البيع؛ دي
   مالهاش علاقة بأرصدة الخامات).

   الفرز بالـ createdAt قبل التطبيق عشان الـ adjust (set) يتطبّق بالترتيب الصح.
   pure تماماً — آمن للاستيراد في أي مكان.

   استُخرج في V21.27.94 لتوحيد «المخزن والجرد» (WarehousePg) مع «المشتريات ←
   المخزن» (PurchasePg) — كانوا بيعرضوا رصيدين مختلفين لنفس الصنف (الأول من
   item.stock، التاني من الـ ledger).
   ═══════════════════════════════════════════════════════════════════════ */

/* Map: String(itemId) → صافي الرصيد من الحركات (مستبعد itemType:"order"). */
export function computeStockNetMap(stockMovements){
  const m = new Map();
  const moves = (stockMovements || [])
    .filter(mv => mv && mv.itemType !== "order" && mv.itemId != null)
    .slice()
    .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  for(const mv of moves){
    const k = String(mv.itemId);
    const q = Math.abs(Number(mv.qty) || 0);
    const cur = m.get(k) || 0;
    if(mv.type === "adjust") m.set(k, q);
    else if(mv.type === "out") m.set(k, cur - q);
    else m.set(k, cur + q); /* in | opening */
  }
  return m;
}

/* رصيد صنف واحد: الصافي من الـ ledger لو له حركات، وإلا item.stock
   (صنف قديم/مفيش له حركات مسجّلة). */
export function netStockOf(netMap, item){
  if(!item) return 0;
  return netMap.has(String(item.id)) ? netMap.get(String(item.id)) : (Number(item.stock) || 0);
}

/* V21.27.183: إعادة حساب رصيد صنف + متوسط تكلفته من الحركات (بعد تعديل/حذف
   إذن مخزني). بيمشي بنفس قاعدة computeStockNetMap للرصيد، ومتوسط التكلفة =
   المتوسط المرجّح لكل حركات الإدخال (in + opening). بيرجّع:
     { stock, avgCost }   — avgCost = null لو مفيش أي إدخال (الكولر يحتفظ بالقديم).
   pure — قابل للاختبار + يستخدمه delete/edit في StockPermitsTab كـ source of truth. */
export function recomputeItemFromMovements(stockMovements, itemId){
  const id = String(itemId);
  const moves = (stockMovements || [])
    .filter(mv => mv && mv.itemType !== "order" && String(mv.itemId) === id)
    .slice()
    .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  let stock = 0, inQty = 0, inVal = 0;
  for(const mv of moves){
    const q = Math.abs(Number(mv.qty) || 0);
    if(mv.type === "adjust") stock = q;
    else if(mv.type === "out") stock -= q;
    else { stock += q; inQty += q; inVal += q * (Number(mv.price) || 0); } /* in | opening */
  }
  const round2 = n => Math.round((Number(n) || 0) * 100) / 100;
  return { stock: round2(stock), avgCost: inQty > 0 ? round2(inVal / inQty) : null };
}
