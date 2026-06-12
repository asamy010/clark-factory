/* ═══════════════════════════════════════════════════════════════
   CLARK — Customer Portal Order Request API (V21.21.71)

   POST /api/customer-portal-order
   Body: { c:<custId>, sig, t, items:[{id,qty}], note? }

   العميل بيبعت «طلب أوردر» من تاب «اطلب» في بورتاله. مبدأ الأمان:
   ──────────────────────────────────────────────────────────────
   - الجانب العام يعمل «طلب/Lead» فقط — مايلمسش المخزون ولا الفلوس.
   - الـ endpoint بيعيد بناء الكتالوج server-side ويتحقق من الكميات ضد
     المتاح الفعلي (مايثقش في كمية/سعر العميل — السعر من الكتالوج).
   - بيكتب الطلب في orderRequestsDays (daily-split §2) + إشعار للمالك.
   - المالك يراجع ويأكّد → ساعتها بس يتحوّل لمسودة أمر بيع داخلياً.
   - حارس إساءة: حد للطلبات المعلّقة لكل عميل في اليوم.
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, readSplitCollection, readPartitionedCollection, readPartitionedDoc, appendToSplitDay } from "./_firebase.js";
import { verifyCustomerSig } from "./customer-portal.js";
import { buildStockCatalog } from "../src/utils/stockCatalog.js";
import { validateOrderRequest, buildOrderRequestEntry } from "../src/utils/orderRequests.js";

const MAX_PENDING_PER_CUSTOMER_PER_DAY = 8; /* حارس إساءة */

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const body = (typeof req.body === "string") ? JSON.parse(req.body || "{}") : (req.body || {});
    const { c: custId, sig, t: ts, items: reqItems, note } = body;
    if (!custId || !sig) return res.status(400).json({ ok: false, error: "البيانات ناقصة" });
    if (!verifyCustomerSig(custId, sig, ts)) {
      return res.status(403).json({ ok: false, error: "رابط غير صالح أو منتهي الصلاحية" });
    }
    if (!Array.isArray(reqItems) || reqItems.length === 0) {
      return res.status(400).json({ ok: false, error: "السلّة فاضية" });
    }

    const db = getDb();
    const configSnap = await db.collection("factory").doc("config").get();
    if (!configSnap.exists) return res.status(500).json({ ok: false, error: "البيانات غير متاحة" });
    const config = configSnap.data();

    /* V21.21.76: قراءة مستند العميل مباشرة (perf) بدل مسح كل العملاء */
    let customer = null;
    if (config._partitionedV1957Done) {
      customer = await readPartitionedDoc("customersDocs", custId);
      if (!customer) { const all = await readPartitionedCollection("customersDocs"); customer = all.find(c => String(c.id) === String(custId)) || null; }
    } else {
      customer = (config.customers || []).find(c => String(c.id) === String(custId)) || null;
    }
    if (!customer) return res.status(404).json({ ok: false, error: "العميل غير موجود" });
    if (customer.archived) return res.status(403).json({ ok: false, error: "🔒 تم إيقاف التعامل، تواصل مع المصنع" });

    /* حارس إساءة — حد الطلبات المعلّقة لهذا العميل في يوم النهاردة */
    const today = new Date().toISOString().slice(0, 10);
    const dayRef = db.collection("orderRequestsDays").doc(today);
    const daySnap = await dayRef.get();
    const todayEntries = (daySnap.exists && Array.isArray(daySnap.data().entries)) ? daySnap.data().entries : [];
    const pendingForCust = todayEntries.filter(e => e && String(e.custId) === String(custId) && e.status === "pending").length;
    if (pendingForCust >= MAX_PENDING_PER_CUSTOMER_PER_DAY) {
      return res.status(429).json({ ok: false, error: "عندك طلبات كتير معلّقة — استنى المصنع يراجعها الأول" });
    }

    /* إعادة بناء الكتالوج server-side + التحقق (مصدر الحقيقة، مش كمية/سعر العميل) */
    const activeSeason = config.activeSeason;
    const orders = [];
    if (activeSeason) {
      try {
        const snaps = await db.collection("seasons").doc(activeSeason).collection("orders").get();
        snaps.forEach(doc => { const o = doc.data(); if (o && o.id) orders.push(o); });
      } catch (e) { /* تجاهل */ }
    }
    const salesOrders = config._splitDaysV21101Done
      ? await readSplitCollection("salesOrdersDays")
      : (config.salesOrders || []);

    const catalog = buildStockCatalog(
      { orders, salesOrders },
      { includeProduction: false, includeSeries: true, includeColors: true, sizeSets: Array.isArray(config.sizeSets) ? config.sizeSets : [] }
    );

    const validated = validateOrderRequest(reqItems, catalog);
    if (!validated.ok) {
      return res.status(400).json({ ok: false, error: "مفيش أصناف متاحة في طلبك — يمكن اتباعت بالفعل. حدّث الصفحة.", rejected: validated.rejected });
    }

    const nowISO = new Date().toISOString();
    const reqId = "req_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
    const entry = buildOrderRequestEntry({
      id: reqId,
      custId: customer.id,
      custName: customer.name || "",
      custPhone: customer.phone || "",
      validated,
      note,
      nowISO,
    });

    /* كتابة الطلب (daily-split) */
    await appendToSplitDay("orderRequestsDays", entry);

    /* إشعار للمالك/المحاسبين — نفس نمط delivery-confirm (V19.53) */
    const notifEntry = {
      id: "ntor_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7),
      type: "order_request",
      msg: "🛒 طلب أوردر جديد من " + (customer.name || "عميل") + " — " + validated.totalQty + " قطعة · " + validated.totalValue + " ج.م",
      toEmail: "all",
      link: "orderRequests",
      custId: customer.id,
      requestId: reqId,
      createdAt: nowISO,
      severity: "info",
    };
    try {
      if (config._splitDaysV1953Done) {
        await appendToSplitDay("notificationsDays", notifEntry);
      } else {
        const configRef = db.collection("factory").doc("config");
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(configRef);
          const data = snap.exists ? snap.data() : {};
          const list = Array.isArray(data.notifications) ? data.notifications : [];
          tx.set(configRef, { notifications: [notifEntry, ...list].slice(0, 500) }, { merge: true });
        });
      }
    } catch (e) { console.error("order-request notif failed:", e); /* الطلب اتسجّل برضه */ }

    return res.status(200).json({
      ok: true,
      requestId: reqId,
      totalQty: validated.totalQty,
      totalValue: validated.totalValue,
      lines: validated.items.length,
      rejected: validated.rejected,
      message: "تم استلام طلبك بنجاح ✅ هنتواصل معاك قريباً لتأكيد الأوردر.",
    });
  } catch (err) {
    console.error("customer-portal-order error:", err);
    return res.status(500).json({ ok: false, error: "خطأ في الخادم: " + (err.message || "unknown") });
  }
}
