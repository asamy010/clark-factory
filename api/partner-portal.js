/* ═══════════════════════════════════════════════════════════════
   CLARK — Partner Portal API (V21.21.69)

   GET /api/partner-portal?s=<sig>

   بورتال عام للشريك (بدون login) — يعرض «كل شيء زي لوحة التحكم» حسب
   إعدادات العرض اللي حدّدها المالك:
     - المبيعات/المرتجعات/التحصيلات/الرصيد
     - المشتريات + المستحق للموردين
     - تقييم المخزون + الأرباح
     - حالة الأوامر (تحت التشغيل/مكتملة) + معدل الإنجاز
     - تفصيل أرصدة العملاء (عليهم لينا) + الموردين (علينا ليهم) بالأسماء

   الأمان: HMAC على مفتاح متجدّد (factory/partnerPortal.key) — قابل للإلغاء
   بالتدوير. نفس باترن بورتال المخزن/العملاء.

   الأداء: كل الـ collections بتتحمّل بالتوازي (Promise.all) فالزمن = أبطأ
   قراءة واحدة مش مجموعها. الحساب بيعيد استخدام computeDashboardKpis (نفس
   رياضة الداش بورد — مصدر حقيقة واحد، مفيش drift).
   ═══════════════════════════════════════════════════════════════ */

import crypto from "crypto";
import { getDb, setCors, readSplitCollection, readPartitionedCollection } from "./_firebase.js";
import { buildPartnerPortalData, defaultVisibility } from "../src/utils/partnerPortal.js";

function getPartnerSecret() {
  const s = process.env.PARTNER_PORTAL_SECRET
    || process.env.CUSTOMER_PORTAL_SECRET
    || process.env.DELIVERY_CONFIRM_SECRET;
  if (!s || s.length < 16) {
    throw new Error("PARTNER_PORTAL_SECRET / CUSTOMER_PORTAL_SECRET not set (min 16 chars)");
  }
  return s;
}

export function signPartnerKey(key) {
  return crypto.createHmac("sha256", getPartnerSecret())
    .update("partnerportal:" + key).digest()
    .slice(0, 12).toString("base64url");
}

function verifyPartnerSig(key, sig) {
  if (!key || !sig || sig.length !== 16) return false;
  const expected = signPartnerKey(key);
  try {
    const a = Buffer.from(sig, "base64url");
    const b = Buffer.from(expected, "base64url");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (e) { return false; }
}

/* قاعدة موحّدة مستقلة عن الـ flags: اقرأ الـ split/partitioned؛ لو فيها
   داتا استخدمها، وإلا fallback لمصفوفة config (قبل/بعد الـ migration). */
async function loadSplit(config, field, splitName) {
  const split = await readSplitCollection(splitName);
  if (split && split.length) return split;
  return Array.isArray(config[field]) ? config[field] : [];
}
async function loadPart(config, field, collName) {
  const part = await readPartitionedCollection(collName);
  if (part && part.length) return part;
  return Array.isArray(config[field]) ? config[field] : [];
}

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const sig = req.query.s || req.query.sig;
    if (!sig) return res.status(400).json({ ok: false, error: "الرابط غير صالح" });

    const db = getDb();
    const [configSnap, portalSnap] = await Promise.all([
      db.collection("factory").doc("config").get(),
      db.collection("factory").doc("partnerPortal").get(),
    ]);
    if (!configSnap.exists) return res.status(500).json({ ok: false, error: "البيانات غير متاحة" });
    const config = configSnap.data();
    const portal = portalSnap.exists ? portalSnap.data() : {};

    const key = portal.key;
    if (!key || !verifyPartnerSig(key, sig)) {
      return res.status(403).json({ ok: false, error: "الرابط غير صالح أو تم إلغاؤه" });
    }

    const activeSeason = config.activeSeason;
    /* تحميل كل الـ collections بالتوازي — حرج للأداء (الزمن = أبطأ قراءة). */
    const [
      customers, suppliers, fabrics, accessories,
      treasury, custPayments, supplierPayments, wsPayments, checks,
      salesInvoices, purchaseInvoices, purchaseReceipts,
      salesCreditNotes, purchaseDebitNotes, salesOrders, stockMovements,
      ordersSnap,
    ] = await Promise.all([
      loadPart(config, "customers", "customersDocs"),
      loadPart(config, "suppliers", "suppliersDocs"),
      loadPart(config, "fabrics", "fabricsDocs"),
      loadPart(config, "accessories", "accessoriesDocs"),
      loadSplit(config, "treasury", "treasuryDays"),
      loadSplit(config, "custPayments", "custPaymentsDays"),
      loadSplit(config, "supplierPayments", "supplierPaymentsDays"),
      loadSplit(config, "wsPayments", "wsPaymentsDays"),
      loadSplit(config, "checks", "checksDays"),
      loadSplit(config, "salesInvoices", "salesInvoicesDays"),
      loadSplit(config, "purchaseInvoices", "purchaseInvoicesDays"),
      loadSplit(config, "purchaseReceipts", "purchaseReceiptsDays"),
      loadSplit(config, "salesCreditNotes", "salesCreditNotesDays"),
      loadSplit(config, "purchaseDebitNotes", "purchaseDebitNotesDays"),
      loadSplit(config, "salesOrders", "salesOrdersDays"),
      loadSplit(config, "stockMovements", "stockMovementsDays"),
      activeSeason
        ? db.collection("seasons").doc(activeSeason).collection("orders").get()
        : Promise.resolve({ forEach() {} }),
    ]);

    const orders = [];
    ordersSnap.forEach(doc => { const o = doc.data(); if (o && o.id) orders.push(o); });

    /* بناء كائن data بنفس أسماء حقول التطبيق عشان computeDashboardKpis يلاقيها */
    const data = {
      orders, customers, suppliers, fabrics, accessories,
      treasury, custPayments, supplierPayments, wsPayments, checks,
      salesInvoices, purchaseInvoices, purchaseReceipts,
      salesCreditNotes, purchaseDebitNotes, salesOrders, stockMovements,
      inventoryItems: Array.isArray(config.inventoryItems) ? config.inventoryItems : [],
      itemCategories: Array.isArray(config.itemCategories) ? config.itemCategories : [],
      profitSettings: config.profitSettings || {},
      printSettings: config.printSettings || {},
    };

    const visibility = { ...defaultVisibility(), ...(portal.visibility || {}) };
    const payload = buildPartnerPortalData(data, visibility);

    return res.status(200).json({
      ok: true,
      factory: { name: config.factoryName || "CLARK", logo: config.logo || "" },
      activeSeason: activeSeason || "",
      ...payload,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("partner-portal error:", err);
    return res.status(500).json({ ok: false, error: "خطأ في الخادم: " + (err.message || "unknown") });
  }
}
