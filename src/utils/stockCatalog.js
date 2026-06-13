/* ═══════════════════════════════════════════════════════════════════════
   CLARK · stockCatalog (V21.21.67)
   ───────────────────────────────────────────────────────────────────────
   مصدر الحقيقة الموحّد لـ«المخزن الجاهز المتاح» — يغذّي:
     • شاشة التسليمات الداخلية (CustDeliverPg.jsx stockModels)
     • بورتال المخزن العام (api/stock-portal.js)

   الدرس من V21.21.46 (بورتال العملاء): البورتال **مايعيدش حساب** المتاح
   بطريقة منفصلة عن الشاشة الداخلية — الاتنين بيدرِفوا ويختلفوا. فالصيغة
   الحرجة (المتاح) متعرّفة هنا **مرة واحدة** ويستهلكها الطرفين.

   الصيغة (مطابقة CustDeliverPg.jsx:511 — V21.20.5/V21.21.1):
     المتاح = المخزون المؤكّد − [(المُسلَّم − المرتجع) + المحجوز بأوامر البيع]
   حيث «المحجوز» = كميات أوامر البيع المباشرة (مش مرايا التوزيعات) اللي
   بتشير للأمر (item.sourceType==="order"). المرايا (sourceDistributionId)
   متخطّاة لأن التوزيعة نفسها بتخصم المتاح (منع الحساب المزدوج — §14.1).

   pure تماماً (مفيش browser refs) → آمن للاستيراد في الـ serverless bundle.
   ═══════════════════════════════════════════════════════════════════════ */

import { calcOrder, getConfirmedStock, getConfirmedSeriesStock } from "./orders.js";
import { getSizesFromSet } from "./format.js";

/* المحجوز بأوامر البيع لكل أمر — نسخة طبق الأصل من
   CustDeliverPg.jsx soReservedByOrder (V21.20.5/V21.21.1). */
export function computeSoReserved(salesOrders){
  const m = {};
  (salesOrders || []).forEach(so => {
    if(!so || so.status === "cancelled") return;
    if(so.sourceDistributionId) return; /* مرآة توزيعة — التوزيعة بتخصم بالفعل */
    (so.items || []).forEach(it => {
      if(it && it.sourceType === "order" && it.sourceId){
        m[it.sourceId] = (m[it.sourceId] || 0) + (Number(it.qty) || 0);
      }
    });
  });
  return m;
}

/* المتاح الفعلي لأمر واحد. يرجّع المخزون والمُسلَّم والمرتجع كمان عشان
   المستهلك يحسب net/custDel من غير إعادة reduce. */
export function computeOrderAvail(o, soReserved){
  const sd = getConfirmedStock(o);
  const cd = (o.customerDeliveries || []).reduce((s, d) => s + (Number(d.qty) || 0), 0);
  const ret = (o.customerReturns || []).reduce((s, r) => s + (Number(r.qty) || 0), 0);
  const reserved = (soReserved && soReserved[o.id]) || 0;
  const net = (cd - ret) + reserved;
  return { stockQty: sd, avail: sd - net, delivered: cd, returned: ret, reserved };
}

/* مفاتيح الأقمشة A..H — كل واحد له مصفوفة ألوان order["colors"+k] (§4). */
const FAB_KEYS = ["A", "B", "C", "D", "E", "F", "G", "H"];

/* هل الخامة k ليها ألوان فعلية؟ */
function _fabricHasColors(ord, k) {
  const arr = ord["colors" + k];
  return Array.isArray(arr) && arr.some(c => String((typeof c === "string" ? c : (c && (c.color || c.n || c.name))) || "").trim());
}

/* ألوان الأوردر = ألوان **خامة المصدر الواحدة** (نفس تاب «لون/مقاس»
   ColorSizeMatrixTab + شوبيفاي) — مش دمج كل الخامات. المصدر:
   shopify_meta.color_source_fabric، وإلا أول خامة ليها ألوان، وإلا "A".
   الصورة من color_images[name].url لو متاحة، وإلا swatch (colorHex). */
function getOrderColors(ord) {
  const imgs = (ord && ord.shopify_meta && ord.shopify_meta.color_images) || {};
  let sourceKey = ord && ord.shopify_meta && ord.shopify_meta.color_source_fabric;
  if (!sourceKey || !_fabricHasColors(ord, sourceKey)) {
    sourceKey = FAB_KEYS.find(k => _fabricHasColors(ord, k)) || "A";
  }
  const arr = ord["colors" + sourceKey];
  const seen = new Set();
  const out = [];
  if (Array.isArray(arr)) arr.forEach(c => {
    const name = (typeof c === "string" ? c : (c && c.color) || "").trim();
    if (!name || seen.has(name.toLowerCase())) return;
    seen.add(name.toLowerCase());
    out.push({
      name,
      hex: (typeof c === "object" && c.colorHex) ? c.colorHex : "",
      image: (imgs[name] && imgs[name].url) ? imgs[name].url : "",
    });
  });
  return out;
}

/* إثراء اختياري لصنف الكتالوج بالسيريهات والمقاسات والألوان (للبورتال التفصيلي).
   opts.includeSeries → seriesQty (السيري المتاح). opts.sizeSets → sizes/sizesLabel/
   seriesSize (عدد القطع/سيري). opts.includeColors → colors[]. كله pure/server-safe. */
function enrichItem(item, ord, o) {
  if (o.includeSeries) {
    try { item.seriesQty = getConfirmedSeriesStock(ord); } catch (_) {}
  }
  if (Array.isArray(o.sizeSets)) {
    try {
      const r = getSizesFromSet(ord, { sizeSets: o.sizeSets });
      item.sizes = r.sizes || [];
      item.sizesLabel = r.label || "";
      item.seriesSize = Math.max(1, Number(r.expectedCount) || (r.sizes ? r.sizes.length : 0) || 1);
    } catch (_) { item.sizes = []; item.sizesLabel = ""; item.seriesSize = 1; }
  }
  if (o.includeColors) {
    try { item.colors = getOrderColors(ord); } catch (_) { item.colors = []; }
  }
  return item;
}

/* كتالوج المخزن الجاهز للعرض/البورتال.
   opts.includeProduction=true → يضيف أصناف «تحت التشغيل/قريباً»
   (مقصوصة لكن لسه مفيش مخزون جاهز متاح — مش مقفولة ولا مباعة بالكامل).
   opts.includeSeries / opts.sizeSets → إثراء بالسيريهات والمقاسات. */
export function buildStockCatalog(data, opts){
  const d = data || {};
  const o = opts || {};
  const orders = Array.isArray(d.orders) ? d.orders : [];
  const soReserved = computeSoReserved(d.salesOrders);
  const items = [];
  orders.forEach(ord => {
    if(!ord || ord.cancelled || ord.status === "cancelled") return;
    const { stockQty, avail } = computeOrderAvail(ord, soReserved);
    const base = {
      id: ord.id,
      modelNo: ord.modelNo || "—",
      modelDesc: ord.modelDesc || "",
      image: ord.image || "",
      sellPrice: Number(ord.sellPrice) || 0,
    };
    if(avail > 0){
      items.push(enrichItem({ ...base, status: "available", avail, stockQty }, ord, o));
    } else if(o.includeProduction){
      let cut = 0;
      try { cut = Number(calcOrder(ord).cutQty) || 0; } catch(_) {}
      /* مقصوص لكن المخزون المؤكّد لسه أقل من المقصوص → شغّال/قريباً */
      if(cut > 0 && stockQty < cut){
        items.push(enrichItem({ ...base, status: "soon", avail: 0, stockQty, expected: cut }, ord, o));
      }
    }
  });
  /* المتاح أولاً (الأكبر كمية)، بعدين «قريباً» */
  items.sort((a, b) => {
    if(a.status !== b.status) return a.status === "available" ? -1 : 1;
    return ((b.avail || b.expected || 0) - (a.avail || a.expected || 0));
  });
  return items;
}

/* إجماليات بطاقات الـ KPIs (المتاح الفعلي فقط — «قريباً» مش متاح للبيع). */
export function buildStockKpis(items){
  const list = Array.isArray(items) ? items : [];
  const avail = list.filter(i => i.status === "available");
  const pieces = avail.reduce((s, i) => s + (Number(i.avail) || 0), 0);
  const value = avail.reduce((s, i) => s + (Number(i.avail) || 0) * (Number(i.sellPrice) || 0), 0);
  return {
    models: avail.length,
    pieces,
    value: Math.round(value),
    soonModels: list.filter(i => i.status === "soon").length,
  };
}
