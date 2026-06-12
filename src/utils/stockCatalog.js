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

import { calcOrder, getConfirmedStock } from "./orders.js";

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

/* كتالوج المخزن الجاهز للعرض/البورتال.
   opts.includeProduction=true → يضيف أصناف «تحت التشغيل/قريباً»
   (مقصوصة لكن لسه مفيش مخزون جاهز متاح — مش مقفولة ولا مباعة بالكامل). */
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
      items.push({ ...base, status: "available", avail, stockQty });
    } else if(o.includeProduction){
      let cut = 0;
      try { cut = Number(calcOrder(ord).cutQty) || 0; } catch(_) {}
      /* مقصوص لكن المخزون المؤكّد لسه أقل من المقصوص → شغّال/قريباً */
      if(cut > 0 && stockQty < cut){
        items.push({ ...base, status: "soon", avail: 0, stockQty, expected: cut });
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
