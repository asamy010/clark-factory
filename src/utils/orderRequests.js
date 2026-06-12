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
const MAX_QTY_PER_LINE = 100000;

/* تحقق وتطبيع طلب عميل ضد كتالوج المتاح (المبني server-side).
   requested: [{ id, qty }] من العميل (id = orderId، qty مطلوبة).
   catalogItems: ناتج buildStockCatalog (فيه id/avail/sellPrice/modelNo...).
   يرجّع { ok, items, totalQty, totalValue, rejected } — الكمية مقصوصة على
   المتاح، والسعر من الكتالوج (مش من العميل). */
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
    let qty = Math.floor(Number(r.qty) || 0);
    if (!cat || cat.status !== "available") {
      rejected.push({ id: r && r.id, reason: "غير متاح" });
      continue;
    }
    if (qty <= 0) { rejected.push({ id: r.id, reason: "كمية غير صالحة" }); continue; }
    /* قصّ الكمية على المتاح الفعلي (مايثقش في كمية العميل) */
    const avail = Math.max(0, Number(cat.avail) || 0);
    if (qty > avail) qty = avail;
    if (qty <= 0) { rejected.push({ id: r.id, reason: "نفد المتاح" }); continue; }
    if (qty > MAX_QTY_PER_LINE) qty = MAX_QTY_PER_LINE;

    const unitPrice = Number(cat.sellPrice) || 0;
    const lineValue = qty * unitPrice;
    totalQty += qty;
    totalValue += lineValue;
    items.push({
      orderId: cat.id,
      modelNo: cat.modelNo || "—",
      modelDesc: cat.modelDesc || "",
      image: cat.image || "",
      qty,
      unitPrice,
      lineValue,
      sizesLabel: cat.sizesLabel || "",
      requestedQty: Math.floor(Number(r.qty) || 0), /* الأصلي قبل القصّ — للشفافية */
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
