/* ═══════════════════════════════════════════════════════════════
   CLARK — Portal Reservations (V21.21.90) — عرض فقط (display-only)

   الطلب المؤكّد في البورتال = «حجز» معروض على المخزن (تنبيه إن القطع دي
   متطلوبة) — **من غير ما يقلّل المتاح فعلياً** في أي حساب تاني. الحجز
   مُشتقّ من حالة الطلب: مؤكّد وغير متحوّل لأمر بيع. أي إلغاء/رجوع لمعلّق/
   رفض → الطلب مابقاش «مؤكّد» → الحجز بيختفي تلقائياً عند إعادة الجلب.

   القاعدة الذهبية لمنع الحجز المزدوج: الطلب اللي اتحوّل لأمر بيع
   (salesOrderId موجود) **مايتعدّش هنا** — أمر البيع بيحجزه عبر
   computeSoReserved. (display-only فمفيش تأثير على المتاح أصلاً، بس
   نمنع التكرار في العرض كمان.)
   ═══════════════════════════════════════════════════════════════ */

/* تجميع حجوزات البورتال حسب الأوردر:
   { [orderId]: [{ reqId, date, custName, custPhone, qty, colors:[{color,qty}] }] } */
export function groupPortalReservations(requests) {
  const byOrder = {};
  (Array.isArray(requests) ? requests : []).forEach(req => {
    if (!req || req.status !== "confirmed" || req.salesOrderId) return;
    (req.items || []).forEach(it => {
      const oid = it && it.orderId;
      if (!oid) return;
      const qty = Number(it.qty) || 0;
      if (qty <= 0) return;
      if (!byOrder[oid]) byOrder[oid] = [];
      byOrder[oid].push({
        reqId: req.id || "",
        date: req.date || String(req.createdAt || "").split("T")[0] || "",
        custName: req.custName || "عميل",
        custPhone: req.custPhone || "",
        qty,
        colors: (Array.isArray(it.colors) ? it.colors : [])
          .filter(c => c && c.color)
          .map(c => ({ color: c.color, qty: Number(c.qty) || 0 })),
      });
    });
  });
  return byOrder;
}

/* إجمالي الكمية المحجوزة لأوردر واحد. */
export function reservedQtyForOrder(byOrder, orderId) {
  return ((byOrder && byOrder[orderId]) || []).reduce((s, r) => s + (Number(r.qty) || 0), 0);
}

/* جلب الحجوزات من الـ admin API مع كاش بسيط بـ TTL — يمنع تكرار الطلب مع كل
   تنقّل بين الأوامر، ويفضل طازة بعد الإلغاء خلال ثوانٍ. (side-effecting —
   منفصل عن الـ helpers النقية فوق.) */
let _resCache = { at: 0, byOrder: {} };
export async function fetchPortalReservations(token, opts) {
  const o = opts || {};
  const ttlMs = o.ttlMs != null ? o.ttlMs : 20000;
  const now = Date.now();
  if (!o.force && (now - _resCache.at) < ttlMs) return _resCache.byOrder;
  const r = await fetch("/api/order-requests", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adminToken: token, action: "list", status: "confirmed", limit: 500 }),
  });
  const j = await r.json();
  if (j && j.ok) _resCache = { at: now, byOrder: groupPortalReservations(j.requests || []) };
  return _resCache.byOrder;
}
