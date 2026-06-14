/* ═══════════════════════════════════════════════════════════════
   CLARK — modelStock.js (V21.22.7 — المرحلة ب: البيع/الجرد بالموديل)

   تجميع المخزون الجاهز بالموديل (modelNo) + توزيع البيع FIFO على أوامره.

   الفكرة (متفّق عليها مع Ahmed): الوحدة القابلة للبيع = الموديل، لكن كل
   أوردر = "لوط" بتكلفته الخاصة. البيعة بالموديل بتتوزّع FIFO (الأقدم أولاً)
   على اللوطات → كل قطعة تحمل تكلفة أوردرها الحقيقية → COGS دقيق مع الحفاظ
   على التخزين per-order.

   ⚠️ دوال نقية فقط (صفر I/O / mutation) — الأساس المُختبَر للمرحلة ب.
   الربط بواجهة البيع (CustDeliverPg) خطوة لاحقة منفصلة.
   ═══════════════════════════════════════════════════════════════ */

/* مفتاح تجميع الموديل: modelNo المتشذّب، وإلا fallback على id الأوردر
   (عشان أوردر بلا modelNo مايتجمّعش بالغلط مع غيره). */
export function modelKeyOf(order){
  const mn = String((order && order.modelNo) || "").trim();
  return mn || ("#" + ((order && order.id) || ""));
}

/* ترتيب FIFO: الأقدم أولاً (createdAt ثم date كـ fallback). */
function fifoCmp(a, b){
  const ka = String(a.createdAt || a.date || "");
  const kb = String(b.createdAt || b.date || "");
  if(ka && kb) return ka.localeCompare(kb);
  return 0;
}

/* يبني خريطة { modelKey: { modelNo, modelDesc, totalAvail, lots:[...] } }.
   availOf(order) → الكمية المتاحة للبيع للأوردر ده (≥0؛ بيتجاهل ≤0).
   lots مرتبة FIFO (الأقدم أولاً). */
export function buildModelStock(orders, availOf){
  const map = {};
  (Array.isArray(orders) ? orders : []).forEach(o => {
    if(!o || !o.id) return;
    const avail = Math.max(0, Number(availOf ? availOf(o) : o.avail) || 0);
    if(avail <= 0) return;
    const key = modelKeyOf(o);
    if(!map[key]) map[key] = { modelKey: key, modelNo: o.modelNo || "—", modelDesc: o.modelDesc || "", totalAvail: 0, lots: [] };
    map[key].totalAvail += avail;
    map[key].lots.push({ orderId: o.id, poNumber: o.poNumber || "", avail, date: o.date || "", createdAt: o.createdAt || "" });
  });
  Object.values(map).forEach(m => m.lots.sort(fifoCmp));
  return map;
}

/* يوزّع بيعة بكمية qty على لوطات موديل (مرتبة FIFO) → الأقدم أولاً.
   returns: { allocations: [{ orderId, qty }], allocated, shortfall }.
   shortfall > 0 معناه المتاح أقل من المطلوب. */
export function allocateModelSale(lots, qty){
  let remaining = Math.max(0, Number(qty) || 0);
  const requested = remaining;
  const allocations = [];
  for(const lot of (Array.isArray(lots) ? lots : [])){
    if(remaining <= 0) break;
    const take = Math.min(remaining, Math.max(0, Number(lot && lot.avail) || 0));
    if(take > 0){ allocations.push({ orderId: lot.orderId, qty: take }); remaining -= take; }
  }
  return { allocations, allocated: requested - remaining, shortfall: remaining };
}
