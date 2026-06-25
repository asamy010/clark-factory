/* ═══════════════════════════════════════════════════════════════════════
   CLARK · سياسات تقييم المخزون (V21.27.130)
   ───────────────────────────────────────────────────────────────────────
   تقييم رصيد صنف المخزن (خامة/إكسسوار/منتج) حسب سياسة تسعير مختارة، عند
   اختلاف أسعار الشراء وتقادم المخزون. كله pure — صفر mutation.

   السياسات (تقييم المخزون الختامي = الرصيد المتبقّي):
   • none    — بدون سياسة: الرصيد × التكلفة المخزّنة (avgCost ‖ price).
   • average — المتوسط المرجّح (AVCO): الرصيد × (إجمالي تكلفة الاستلامات ÷
               إجمالي كمياتها). يُنعّم تقلّب الأسعار.
   • fifo    — الوارد أولًا صادر أولًا: المصروف يستهلك أقدم الطبقات، فالرصيد
               المتبقّي يُقيَّم بـ«أحدث» أسعار الشراء. (ارتفاع الأسعار → تقييم
               أعلى، COGS أقل.) مسموح IFRS.
   • lifo    — الوارد أخيرًا صادر أولًا: المصروف يستهلك أحدث الطبقات، فالرصيد
               المتبقّي يُقيَّم بـ«أقدم» أسعار الشراء. (تقييم أحفظ.) مش مسموح
               IFRS (US-GAAP فقط) — للعرض/التحليل الداخلي.

   التنفيذ: «محرّك طبقات» (ledger layers) يطبّق الحركات بالترتيب الزمني، يدفع
   طبقة لكل وارد {qty, price}، ويستهلك من المقدّمة (FIFO) أو المؤخّرة (LIFO)
   لكل صادر. الطبقات المتبقّية = المخزون الختامي → قيمته = Σ(qty × price).
   التسوية (adjust) = تعيين الرصيد → إعادة ضبط لطبقة واحدة بالتكلفة المرجعية.
   ═══════════════════════════════════════════════════════════════════════ */

import { r2 } from "../format.js";

export const VALUATION_POLICIES = [
  { key: "none",    label: "بدون سياسة تسعير",      short: "بدون",   desc: "التكلفة المخزّنة للصنف × الرصيد (الافتراضي)." },
  { key: "average", label: "المتوسط المرجّح (Average)", short: "Average", desc: "متوسط تكلفة كل الاستلامات (مرجّح بالكمية) — يُنعّم تقلّب الأسعار." },
  { key: "fifo",    label: "الوارد أولًا (FIFO)",     short: "FIFO",   desc: "المصروف من الأقدم؛ الرصيد المتبقّي بأحدث أسعار الشراء." },
  { key: "lifo",    label: "الوارد أخيرًا (LIFO)",    short: "LIFO",   desc: "المصروف من الأحدث؛ الرصيد المتبقّي بأقدم أسعار الشراء." },
];

export function isValidPolicy(p){ return VALUATION_POLICIES.some(x => x.key === p); }

/* حركات صنف واحد مرتّبة زمنيًا (الأقدم أولًا)، مستبعد حركات الجاهز (itemType:"order"). */
function itemMoves(itemId, movements){
  const id = String(itemId);
  return (movements || [])
    .filter(m => m && m.itemType !== "order" && m.itemId != null && String(m.itemId) === id)
    .slice()
    .sort((a, b) => String(a.createdAt || a.date || "").localeCompare(String(b.createdAt || b.date || "")));
}

/* محرّك الطبقات: يطبّق الحركات ويستهلك الطبقات حسب السياسة (fifo|lifo)،
   ويرجّع الطبقات المتبقّية = المخزون الختامي. الطبقات بترتيب زمني (الأقدم index 0). */
function runLayers(moves, policy, fallbackCost){
  const layers = []; /* [{qty, price}] */
  for(const m of moves){
    const q = Math.abs(Number(m.qty) || 0);
    if(m.type === "adjust"){
      layers.length = 0;
      if(q > 0) layers.push({ qty: q, price: fallbackCost });
    } else if(m.type === "out"){
      let need = q;
      if(policy === "lifo"){
        for(let i = layers.length - 1; i >= 0 && need > 1e-9; i--){
          const take = Math.min(layers[i].qty, need);
          layers[i].qty -= take; need -= take;
          if(layers[i].qty <= 1e-9) layers.splice(i, 1);
        }
      } else { /* fifo */
        while(layers.length && need > 1e-9){
          const take = Math.min(layers[0].qty, need);
          layers[0].qty -= take; need -= take;
          if(layers[0].qty <= 1e-9) layers.shift();
        }
      }
    } else { /* in | opening | permit-in */
      if(q > 0) layers.push({ qty: q, price: Number(m.price) || fallbackCost });
    }
  }
  return layers;
}

/* قيمة رصيد صنف حسب السياسة.
   item      : {id, avgCost?, price?}
   netStock  : الرصيد الصافي المعروض (من computeStockNetMap) — مرجع للاتساق
   movements : data.stockMovements
   policy    : "none" | "average" | "fifo" | "lifo"
   → { qty, unitCost, value } */
export function valuateItem(item, netStock, movements, policy){
  const qty = Number(netStock) || 0;
  const fallbackCost = Number(item && item.avgCost) || Number(item && item.price) || 0;

  if(policy === "none" || !isValidPolicy(policy)){
    return { qty, unitCost: r2(fallbackCost), value: r2(qty * fallbackCost) };
  }

  const moves = itemMoves(item && item.id, movements);
  if(moves.length === 0 || qty === 0){
    return { qty, unitCost: r2(fallbackCost), value: r2(qty * fallbackCost) };
  }

  if(policy === "average"){
    let totQ = 0, totC = 0;
    for(const m of moves){
      if(m.type === "out" || m.type === "adjust") continue;
      const q = Math.abs(Number(m.qty) || 0);
      totQ += q; totC += q * (Number(m.price) || fallbackCost);
    }
    const avg = totQ > 0 ? totC / totQ : fallbackCost;
    return { qty, unitCost: r2(avg), value: r2(qty * avg) };
  }

  /* fifo | lifo */
  const layers = runLayers(moves, policy, fallbackCost);
  let simQty = 0, simVal = 0;
  for(const l of layers){ simQty += l.qty; simVal += l.qty * l.price; }
  /* توفيق الكمية المُحاكاة مع الرصيد المعروض (الفرق النادر بسبب حالات الحافة
     يُقيَّم بالتكلفة المرجعية) حتى تبقى الكمية = الرصيد المعروض دايمًا. */
  let value = simVal;
  if(Math.abs(simQty - qty) > 1e-6) value = simVal + (qty - simQty) * fallbackCost;
  const unitCost = qty > 0 ? value / qty : fallbackCost;
  return { qty, unitCost: r2(unitCost), value: r2(value) };
}
