/* ═══════════════════════════════════════════════════════════════
   CLARK — Stock Portal API (V21.21.68)

   GET /api/stock-portal?s=<sig>

   بورتال عام (بدون login) لـ«المخزن الجاهز المتاح» — بيرجّع للعميل:
     - أصناف المخزن الجاهز المتاح (صورة + اسم الموديل + الكمية المتاحة
       الفعلية + سعر الجملة) + أصناف «تحت التشغيل/قريباً».
     - بطاقات KPIs (عدد الموديلات · إجمالي القطع المتاحة · القيمة بالجملة).

   الأمان: HMAC signature على مفتاح متجدّد (config.stockPortalKey).
   تدوير المفتاح من /api/stock-portal-sign يلغي كل اللينكات القديمة فوراً
   (revocable). نفس باترن customer-portal — مفيش enumeration.

   بيستهلك stockCatalog.js (مصدر الحقيقة الموحّد مع الشاشة الداخلية —
   منع الدرِفت زي درس بورتال العملاء V21.21.46).
   ═══════════════════════════════════════════════════════════════ */

import crypto from "crypto";
import { getDb, setCors, readSplitCollection } from "./_firebase.js";
import { buildStockCatalog, buildStockKpis } from "../src/utils/stockCatalog.js";

/* سرّ موقّع — يعيد استخدام أسرار البورتال الموجودة (مفيش env جديد مطلوب). */
function getStockSecret() {
  const s = process.env.STOCK_PORTAL_SECRET
    || process.env.CUSTOMER_PORTAL_SECRET
    || process.env.DELIVERY_CONFIRM_SECRET;
  if (!s || s.length < 16) {
    throw new Error("STOCK_PORTAL_SECRET / CUSTOMER_PORTAL_SECRET not set (min 16 chars)");
  }
  return s;
}

/* توقيع 96-bit كـ base64url (16 char) — نفس صيغة customer-portal. */
export function signStockKey(stockKey) {
  return crypto.createHmac("sha256", getStockSecret())
    .update("stockportal:" + stockKey).digest()
    .slice(0, 12).toString("base64url");
}

function verifyStockSig(stockKey, sig) {
  if (!stockKey || !sig || sig.length !== 16) return false;
  const expected = signStockKey(stockKey);
  try {
    const a = Buffer.from(sig, "base64url");
    const b = Buffer.from(expected, "base64url");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (e) { return false; }
}

/* سقف الأصناف — يحمي حجم الـ response (الصور base64 ممكن تكون كبيرة).
   الترتيب «المتاح أولاً بالأكبر كمية» مطبّق في buildStockCatalog فالسقف
   بيحافظ على أهم الأصناف. لو احتجنا أكتر → pagination مرحلة لاحقة. */
const MAX_ITEMS = 120;

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const sig = req.query.s || req.query.sig;
    if (!sig) return res.status(400).json({ ok: false, error: "الرابط غير صالح" });

    const db = getDb();
    /* مفتاح البورتال + رقم الواتساب في دوكيومنت منفصل (§10 — معزول عن
       كتابات factory/config المتزامنة من العميل). */
    const [configSnap, portalSnap] = await Promise.all([
      db.collection("factory").doc("config").get(),
      db.collection("factory").doc("stockPortal").get(),
    ]);
    if (!configSnap.exists) return res.status(500).json({ ok: false, error: "البيانات غير متاحة" });
    const config = configSnap.data();
    const portal = portalSnap.exists ? portalSnap.data() : {};

    const stockKey = portal.key;
    if (!stockKey || !verifyStockSig(stockKey, sig)) {
      return res.status(403).json({ ok: false, error: "الرابط غير صالح أو تم إلغاؤه" });
    }

    /* أوامر الموسم النشط فقط (مطابقة الشاشة الداخلية CustDeliverPg) */
    const activeSeason = config.activeSeason;
    const orders = [];
    if (activeSeason) {
      try {
        const snaps = await db.collection("seasons").doc(activeSeason).collection("orders").get();
        snaps.forEach(doc => { const o = doc.data(); if (o && o.id) orders.push(o); });
      } catch (e) { /* موسم بدون أوامر — تجاهل */ }
    }

    /* أوامر البيع (للمحجوز) — salesOrdersDays مقسّمة بالتاريخ (V21.10.1) */
    const salesOrders = config._splitDaysV21101Done
      ? await readSplitCollection("salesOrdersDays")
      : (config.salesOrders || []);

    /* V21.27.134: includeColors → ألوان كل موديل (اسم + hex swatch + صورة لو
       متاحة) عشان البورتال التفصيلي يعرضها تحت الموديل.
       V21.27.137: sizeSets → مقاسات كل موديل (sizesLabel) للينكات الـ٣. */
    const allItems = buildStockCatalog({ orders, salesOrders }, {
      includeProduction: true,
      includeColors: true,
      sizeSets: Array.isArray(config.sizeSets) ? config.sizeSets : [],
    });
    const kpis = buildStockKpis(allItems);

    /* تعقيم الـ payload — نطلّع بس اللي العميل المفروض يشوفه (مفيش id داخلي
       ولا stockQty الإجمالي): صورة + اسم + المتاح/المتوقّع + سعر الجملة +
       الألوان (اسم/hex/صورة). */
    const items = allItems.slice(0, MAX_ITEMS).map(i => ({
      modelNo: i.modelNo,
      modelDesc: i.modelDesc,
      image: i.image || "",
      status: i.status,
      avail: i.status === "available" ? i.avail : 0,
      expected: i.status === "soon" ? (i.expected || 0) : 0,
      price: i.sellPrice,
      sizes: i.sizesLabel || "",
      colors: Array.isArray(i.colors)
        ? i.colors.map(c => ({ name: c.name || "", hex: c.hex || "", image: c.image || "" })).filter(c => c.name)
        : [],
    }));

    return res.status(200).json({
      ok: true,
      factory: {
        name: config.factoryName || "CLARK",
        logo: config.logo || "",
        phone: portal.phone || "",
      },
      kpis,
      items,
      total: allItems.length,
      capped: allItems.length > MAX_ITEMS,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("stock-portal error:", err);
    return res.status(500).json({ ok: false, error: "خطأ في الخادم: " + (err.message || "unknown") });
  }
}
