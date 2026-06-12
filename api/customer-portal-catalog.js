/* ═══════════════════════════════════════════════════════════════
   CLARK — Customer Portal Catalog API (V21.21.71)

   GET /api/customer-portal-catalog?c=<custId>&sig=<hmac>&t=<ts>

   كتالوج المخزن الجاهز المتاح لتاب «اطلب» في بورتال العميل — صورة + كمية
   متاحة + سيريهات + مقاسات + سعر الجملة + تفاصيل الموديل. بيتحمّل lazy لما
   العميل يفتح التاب (مفيش عبء على باقي البورتال).

   نفس توقيع بورتال العميل (HMAC) — العميل لازم يكون عنده اللينك الموقّع.
   بيعيد استخدام buildStockCatalog (مصدر الحقيقة الموحّد).
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, readSplitCollection, readPartitionedCollection, readPartitionedDoc } from "./_firebase.js";
import { verifyCustomerSig } from "./customer-portal.js";
import { buildStockCatalog } from "../src/utils/stockCatalog.js";

const MAX_ITEMS = 200;

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const { c: custId, sig, t: ts } = req.query;
    if (!custId || !sig) return res.status(400).json({ ok: false, error: "البيانات ناقصة" });
    if (!verifyCustomerSig(custId, sig, ts)) {
      return res.status(403).json({ ok: false, error: "رابط غير صالح أو منتهي الصلاحية" });
    }

    const db = getDb();
    const configSnap = await db.collection("factory").doc("config").get();
    if (!configSnap.exists) return res.status(500).json({ ok: false, error: "البيانات غير متاحة" });
    const config = configSnap.data();

    /* العميل لازم موجود وغير موقوف — V21.21.76: قراءة مستند العميل مباشرة (perf) */
    let customer = null;
    if (config._partitionedV1957Done) {
      customer = await readPartitionedDoc("customersDocs", custId);
      if (!customer) { const all = await readPartitionedCollection("customersDocs"); customer = all.find(c => String(c.id) === String(custId)) || null; }
    } else {
      customer = (config.customers || []).find(c => String(c.id) === String(custId)) || null;
    }
    if (!customer) return res.status(404).json({ ok: false, error: "العميل غير موجود" });
    if (customer.archived) return res.status(403).json({ ok: false, error: "🔒 تم إيقاف التعامل، تواصل مع المصنع", archived: true });

    /* أوامر الموسم النشط + أوامر البيع (للمحجوز) */
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

    const allItems = buildStockCatalog(
      { orders, salesOrders },
      { includeProduction: true, includeSeries: true, includeColors: true, sizeSets: Array.isArray(config.sizeSets) ? config.sizeSets : [] }
    );

    /* تعقيم: نخلّي id (للسلّة) + الحقول المعروضة. */
    const items = allItems.slice(0, MAX_ITEMS).map(i => ({
      id: i.id,
      modelNo: i.modelNo,
      modelDesc: i.modelDesc,
      image: i.image || "",
      status: i.status,
      avail: i.status === "available" ? i.avail : 0,
      expected: i.status === "soon" ? (i.expected || 0) : 0,
      seriesQty: i.seriesQty || 0,
      seriesSize: Math.max(1, Number(i.seriesSize) || 1),
      sizesLabel: i.sizesLabel || "",
      sizes: i.sizes || [],
      colors: Array.isArray(i.colors) ? i.colors : [],
      price: i.sellPrice,
    }));

    /* كاش خاص بالمتصفح 30ث — يخفّف إعادة التحميل عند ريفرش الصفحة (الكاش
       داخل الجلسة في العميل بيغطّي التنقّل بين التابات). */
    res.setHeader("Cache-Control", "private, max-age=30");
    return res.status(200).json({
      ok: true,
      factory: { name: config.factoryName || "CLARK", logo: config.logo || "" },
      customer: { id: customer.id, name: customer.name || "" },
      items,
      total: allItems.length,
      capped: allItems.length > MAX_ITEMS,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("customer-portal-catalog error:", err);
    return res.status(500).json({ ok: false, error: "خطأ في الخادم: " + (err.message || "unknown") });
  }
}
