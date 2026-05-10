/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Shopify Daily Report Generator (V19.98 Phase 6)
   ───────────────────────────────────────────────────────────────────────
   Builds a plain-text WhatsApp-friendly summary of the day's Shopify
   activity. Reusable from:
     • The "Send Daily Report" button in Reconciliation tab
     • The Automation tab (if user adds it as a custom report)
     • A future cron that auto-sends at 11pm

   Output: a string, ready to copy or send via WhatsApp bridge.
   Uses minimal markdown that WhatsApp renders (single * for bold).
   ═══════════════════════════════════════════════════════════════════════ */

import { fmt } from "../format.js";

const DEFAULT_SHOP_NAME = "Shopify Store";

/* Build the daily report. Pass `data` (factory/config) and optional
   `forDate` (Date object — defaults to today). Returns a string. */
export function buildShopifyDailyReport(data, forDate){
  const date = forDate || new Date();
  const cfg = data?.shopifyConfig || {};
  const shopName = cfg.shop_name || DEFAULT_SHOP_NAME;
  const orders = Array.isArray(data?.shopifyPendingOrders) ? data.shopifyPendingOrders : [];
  const invoices = (Array.isArray(data?.salesInvoices) ? data.salesInvoices : [])
    .filter(i => i.source === "shopify");
  const creditNotes = (Array.isArray(data?.salesCreditNotes) ? data.salesCreditNotes : [])
    .filter(c => c.source === "shopify");
  const reservations = Array.isArray(data?.stockReservations) ? data.stockReservations : [];
  const products = Array.isArray(data?.shopifyProducts) ? data.shopifyProducts : [];

  /* Day boundaries */
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  const dayStart = startOfDay.getTime();
  const dayEnd = endOfDay.getTime();

  const dateLabel = date.toLocaleDateString("ar-EG", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });

  /* Compute today's slice */
  const newOrders = orders.filter(o => {
    if(!o.shopify_created_at) return false;
    const t = new Date(o.shopify_created_at).getTime();
    return t >= dayStart && t <= dayEnd;
  });
  const deliveredToday = orders.filter(o => {
    if(!o.delivered_at) return false;
    const t = new Date(o.delivered_at).getTime();
    return t >= dayStart && t <= dayEnd;
  });
  const refusedToday = orders.filter(o => {
    if(!o.refused_at) return false;
    const t = new Date(o.refused_at).getTime();
    return t >= dayStart && t <= dayEnd;
  });
  const returnedToday = orders.filter(o => {
    if(!o.returned_at) return false;
    const t = new Date(o.returned_at).getTime();
    return t >= dayStart && t <= dayEnd;
  });

  /* Aggregates */
  const todayRevenue = deliveredToday.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const todayShipping = deliveredToday.reduce((s, o) => s + (Number(o.shipping_fee) || 0), 0);
  const todayRefunds = returnedToday.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const netRevenue = todayRevenue - todayRefunds;

  /* Pending health */
  const allPending = orders.filter(o => o.status === "pending_delivery");
  const timeoutDays = Number(cfg.pending_order_timeout_days) || 7;
  const cutoff = Date.now() - timeoutDays * 86400000;
  const stalePending = allPending.filter(o => o.shopify_created_at && new Date(o.shopify_created_at).getTime() < cutoff);
  const pendingValue = allPending.reduce((s, o) => s + (Number(o.total) || 0), 0);

  /* Reservations */
  const activeReservations = reservations.filter(r => r.status === "active");
  const reservationQty = activeReservations.reduce((s, r) => s + (Number(r.qty) || 0), 0);
  const unmatchedReservations = activeReservations.filter(r => r.unmatched).length;

  /* Products mismatch */
  const mismatchedProducts = products.filter(p => p.mapping_status !== "matched").length;

  /* Conversion rate today */
  const convRate = newOrders.length > 0
    ? Math.round((deliveredToday.length / newOrders.length) * 100)
    : null;

  /* Top product today */
  const skuQty = new Map();
  deliveredToday.forEach(o => {
    (o.line_items || []).forEach(li => {
      const sku = li.sku || "(no-sku)";
      const cur = skuQty.get(sku) || { qty: 0, title: li.title || sku };
      cur.qty += Number(li.quantity) || 0;
      skuQty.set(sku, cur);
    });
  });
  const topProducts = Array.from(skuQty.entries())
    .map(([sku, info]) => ({ sku, ...info }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 3);

  /* Build the message */
  const lines = [];
  lines.push("🛍 *تقرير Shopify اليومي*");
  lines.push("🏪 " + shopName);
  lines.push("📅 " + dateLabel);
  lines.push("");
  lines.push("━━━━━━━━━━━━━━━━━━━━");
  lines.push("📊 *النشاط*");
  lines.push("• 🛒 طلبات جديدة: *" + newOrders.length + "*");
  lines.push("• ✅ تم الاستلام: *" + deliveredToday.length + "* — " + fmt(todayRevenue) + " ج");
  if(refusedToday.length > 0){
    lines.push("• ❌ تم الرفض: *" + refusedToday.length + "*");
  }
  if(returnedToday.length > 0){
    lines.push("• ↩️ مرتجعات: *" + returnedToday.length + "* — " + fmt(todayRefunds) + " ج");
  }
  if(convRate !== null){
    lines.push("• 📈 Conversion rate: *" + convRate + "%*");
  }
  lines.push("");

  lines.push("💰 *الإيرادات*");
  lines.push("• إجمالي مبيعات اليوم: *" + fmt(todayRevenue) + " ج*");
  if(todayShipping > 0){
    lines.push("• شحن: " + fmt(todayShipping) + " ج");
  }
  if(todayRefunds > 0){
    lines.push("• مرتجعات: −" + fmt(todayRefunds) + " ج");
  }
  if(todayRefunds > 0){
    lines.push("• 💵 *صافي: " + fmt(netRevenue) + " ج*");
  }
  lines.push("");

  if(allPending.length > 0){
    lines.push("📋 *الطلبات Pending*");
    lines.push("• إجمالي: " + allPending.length + " طلب");
    lines.push("• قيمتها: " + fmt(pendingValue) + " ج");
    if(stalePending.length > 0){
      lines.push("• ⚠️ *" + stalePending.length + " طلب أكثر من " + timeoutDays + " أيام* (محتاج متابعة)");
    }
    lines.push("");
  }

  if(activeReservations.length > 0){
    lines.push("📦 *المخزون المحجوز*");
    lines.push("• " + reservationQty + " قطعة في " + activeReservations.length + " reservation");
    if(unmatchedReservations > 0){
      lines.push("• ⚠️ " + unmatchedReservations + " منهم SKU مش معروف لـ CLARK");
    }
    lines.push("");
  }

  if(topProducts.length > 0){
    lines.push("🔥 *أكتر مبيعاً اليوم*");
    topProducts.forEach((p, i) => {
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉";
      lines.push(medal + " " + p.title + " — " + p.qty + " قطعة");
    });
    lines.push("");
  }

  /* Alerts */
  const alerts = [];
  if(stalePending.length > 0){
    alerts.push("🔴 " + stalePending.length + " طلب pending قديم");
  }
  if(mismatchedProducts > 0){
    alerts.push("🟡 " + mismatchedProducts + " منتج Shopify مش مربوط بـ CLARK");
  }
  if(unmatchedReservations > 0){
    alerts.push("🟡 " + unmatchedReservations + " reservation بـ unmatched SKU");
  }
  if(alerts.length > 0){
    lines.push("⚠️ *تنبيهات*");
    alerts.forEach(a => lines.push("• " + a));
    lines.push("");
  }

  lines.push("━━━━━━━━━━━━━━━━━━━━");
  lines.push("🤖 _Generated by CLARK_");

  return lines.join("\n");
}

/* Compact summary for one-line notifications (e.g. "Today: 12 orders, 8 delivered, 4 pending") */
export function buildShopifyDailySummaryShort(data){
  const orders = Array.isArray(data?.shopifyPendingOrders) ? data.shopifyPendingOrders : [];
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const dayStart = startOfDay.getTime();

  const newOrders = orders.filter(o =>
    o.shopify_created_at && new Date(o.shopify_created_at).getTime() >= dayStart
  );
  const deliveredToday = orders.filter(o =>
    o.delivered_at && new Date(o.delivered_at).getTime() >= dayStart
  );
  const todayRevenue = deliveredToday.reduce((s, o) => s + (Number(o.total) || 0), 0);

  return `Shopify اليوم: ${newOrders.length} طلب · ${deliveredToday.length} تسلّم · ${fmt(todayRevenue)} ج`;
}
