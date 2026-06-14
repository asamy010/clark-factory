/* ════════════════════════════════════════════════════════════════════════
   CLARK V21.21.54 — Multi-price (pricelist tiers) — Phase B
   ════════════════════════════════════════════════════════════════════════
   أنواع التسعير (قطاعي/جملة/...) قائمة عامة في `config.priceTiers` (strings).
   كل صنف ممكن يحط سعر لكل نوع في `item.prices = [{ tier, value }]`.
   العميل ليه نوع تسعير افتراضي `customer.priceTier`.

   ─── منطق السعر عند البيع ───
   لو العميل له نوع تسعير، والصنف له سعر للنوع ده → ياخد السعر ده.
   غير كده → سعر البيع الأساسي للصنف.
   (fallback كامل → صفر regression للعملاء/الأصناف اللي مالهاش أنواع تسعير.)
   ════════════════════════════════════════════════════════════════════════ */

export const DEFAULT_PRICE_TIERS = ["جملة", "قطاعي"];

/* القائمة العامة لأنواع التسعير — زي getUnits بالظبط. */
export function getPriceTiers(config) {
  const stored = config && Array.isArray(config.priceTiers) ? config.priceTiers : null;
  if (stored) {
    const clean = stored.map(t => String(t || "").trim()).filter(Boolean);
    return Array.from(new Set(clean));
  }
  return [...DEFAULT_PRICE_TIERS];
}

/* item.prices (array) → map { tier: value } لسهولة التحرير في الفورم. */
export function pricesArrToMap(arr) {
  const m = {};
  (Array.isArray(arr) ? arr : []).forEach(p => {
    if (p && p.tier != null) m[String(p.tier)] = p.value;
  });
  return m;
}

/* map { tier: value } → array [{ tier, value }] — يتخزّن على الصنف.
   بيستبعد القيم الفاضية/صفر (السعر الفاضي = استخدم سعر البيع الأساسي). */
export function pricesMapToArr(map) {
  return Object.entries(map || {})
    .map(([tier, value]) => ({ tier: String(tier).trim(), value: Number(value) || 0 }))
    .filter(p => p.tier && p.value > 0);
}

/* سعر نوع تسعير معيّن للصنف (أو null لو مش متحدد/فاضي). */
export function tierPriceOf(item, tierName) {
  const t = String(tierName || "").trim();
  if (!t || !item || !Array.isArray(item.prices)) return null;
  const e = item.prices.find(p => p && String(p.tier || "").trim() === t);
  if (!e) return null;
  const v = Number(e.value);
  return (e.value !== "" && e.value != null && isFinite(v) && v > 0) ? v : null;
}

/* سعر البيع الأساسي للصنف حسب نوع المصدر:
   - generalProduct: price هو سعر البيع (احتياطي salePrice).
   - inventoryItem (قماش/إكسسوار): salePrice هو سعر البيع؛ price = تكلفة legacy
     (احتياطي أخير عشان التوافق مع السلوك القديم — صفر regression). */
export function baseSalePriceOf(item, sourceType) {
  if (!item) return 0;
  if (sourceType === "generalProduct") return Number(item.price ?? item.salePrice ?? 0) || 0;
  return Number(item.salePrice ?? item.price ?? 0) || 0;
}

/* السعر النهائي عند البيع لعميل معيّن:
   tier price لو العميل له نوع تسعير والصنف له سعر للنوع ده، وإلا سعر البيع الأساسي. */
export function salePriceForCustomer(item, sourceType, customer) {
  const tp = tierPriceOf(item, customer && customer.priceTier);
  if (tp != null) return tp;
  return baseSalePriceOf(item, sourceType);
}
