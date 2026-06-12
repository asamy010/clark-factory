/* ═══════════════════════════════════════════════════════════════════════
   CLARK · orderRequests (V21.21.71)
   ───────────────────────────────────────────────────────────────────────
   منطق طلبات العملاء (B2B wholesale) — pure، آمن للـ serverless bundle.

   مبدأ الأمان (قرار Ahmed): الجانب العام يعمل «طلب/Lead» فقط — مايلمسش
   المخزون ولا الفلوس. الـ endpoint بيعيد بناء الكتالوج server-side ويتحقق
   من الكميات ضد المتاح الفعلي (مايثقش في كمية/سعر العميل). المالك يراجع
   ويأكّد → ساعتها بس يتحوّل لمسودة أمر بيع عبر النظام الداخلي.
   ═══════════════════════════════════════════════════════════════════════ */

const MAX_LINES = 60;        /* حد بنود الطلب — حماية من الإساءة */

/* تحقق وتطبيع طلب عميل ضد كتالوج المتاح (المبني server-side).
   requested: [{ id, colors:[{color,qty}] }] — أو legacy [{ id, qty }].
   catalogItems: ناتج buildStockCatalog (id/avail/sellPrice/seriesSize/colors...).
   قواعد:
   - الكمية بالسيري: كل سطر لون بيتقرّب لأسفل لأقرب مضاعف seriesSize.
   - إجمالي الموديل مقصوص على المتاح الفعلي (سيري-محاذى) — مايثقش في العميل.
   - السعر من الكتالوج، ومعلومات اللون (hex/صورة) من الكتالوج.
   يرجّع { ok, items, totalQty, totalValue, rejected }. */
export function validateOrderRequest(requested, catalogItems) {
  const byId = new Map();
  (Array.isArray(catalogItems) ? catalogItems : []).forEach(it => {
    if (it && it.id != null) byId.set(String(it.id), it);
  });

  const items = [];
  const rejected = [];
  let totalQty = 0, totalValue = 0;

  const list = Array.isArray(requested) ? requested.slice(0, MAX_LINES) : [];
  for (const r of list) {
    if (!r || r.id == null) continue;
    const cat = byId.get(String(r.id));
    if (!cat || cat.status !== "available") {
      rejected.push({ id: r && r.id, reason: "غير متاح" });
      continue;
    }

    const seriesSize = Math.max(1, Number(cat.seriesSize) || 1);
    const avail = Math.max(0, Number(cat.avail) || 0);
    const availSeries = Math.floor(avail / seriesSize) * seriesSize; /* أكبر مضاعف سيري ≤ المتاح */
    const unitPrice = Number(cat.sellPrice) || 0;
    const colorMeta = new Map((Array.isArray(cat.colors) ? cat.colors : []).map(c => [String(c.name), c]));

    /* سطور الألوان — أو سطر واحد بدون لون لو الطلب legacy (qty مباشرة) */
    let colorLines = Array.isArray(r.colors) ? r.colors : [{ color: "", qty: r.qty }];

    let modelTotal = 0, requestedTotal = 0;
    const outColors = [];
    for (const cl of colorLines.slice(0, 40)) {
      let q = Math.max(0, Math.floor(Number(cl && cl.qty) || 0));
      requestedTotal += q;
      if (seriesSize > 1) q = Math.floor(q / seriesSize) * seriesSize; /* تقريب لأسفل لمضاعف سيري */
      const remaining = availSeries - modelTotal;                       /* قصّ على المتبقّي المتاح */
      if (q > remaining) q = Math.max(0, remaining);
      if (q <= 0) continue;
      modelTotal += q;
      const name = (cl && cl.color != null) ? String(cl.color) : "";
      const meta = colorMeta.get(name);
      outColors.push({ color: name, hex: meta ? meta.hex : "", image: meta ? meta.image : "", qty: q });
    }

    if (modelTotal <= 0) {
      rejected.push({ id: r.id, reason: avail <= 0 ? "نفد المتاح" : "كمية غير صالحة" });
      continue;
    }

    const lineValue = modelTotal * unitPrice;
    totalQty += modelTotal;
    totalValue += lineValue;
    items.push({
      orderId: cat.id,
      modelNo: cat.modelNo || "—",
      modelDesc: cat.modelDesc || "",
      image: cat.image || "",
      sizesLabel: cat.sizesLabel || "",
      seriesSize,
      unitPrice,
      colors: outColors,
      qty: modelTotal,
      lineValue,
      requestedQty: requestedTotal, /* الأصلي قبل القصّ — للشفافية */
    });
  }

  return {
    ok: items.length > 0,
    items,
    totalQty,
    totalValue: Math.round(totalValue),
    rejected,
  };
}

/* بناء كائن طلب عميل جاهز للتخزين (orderRequestsDays). pure — التوقيت/الـ id
   بيتمرّروا من الـ endpoint عشان يفضل قابل للاختبار. */
export function buildOrderRequestEntry({ id, custId, custName, custPhone, validated, note, nowISO }) {
  return {
    id,
    custId: custId != null ? String(custId) : "",
    custName: custName || "",
    custPhone: custPhone || "",
    items: validated.items,
    totalQty: validated.totalQty,
    totalValue: validated.totalValue,
    note: (note || "").slice(0, 500),
    status: "pending",
    createdAt: nowISO,
    date: String(nowISO).slice(0, 10),
    handledAt: null,
    handledBy: "",
  };
}
