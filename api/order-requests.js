/* ═══════════════════════════════════════════════════════════════
   CLARK — Order Requests admin API (V21.21.71)

   POST /api/order-requests
   Body: { adminToken, action, ... }

   admin/manager فقط. action:
     - "list"    → قائمة طلبات العملاء (status? + limit) من orderRequestsDays.
     - "confirm" → تعليم الطلب مؤكّد (بعد ما المالك يعمل مسودة أمر البيع
                   client-side). Body: { requestId, date, salesOrderId? }.
     - "reject"  → تعليم الطلب مرفوض. Body: { requestId, date, reason? }.

   ملاحظة: تحويل الطلب لمسودة أمر بيع بيحصل client-side (الجانب الموثوق)
   باستخدام نظام أوامر البيع الموجود — الـ endpoint ده بيحدّث الحالة بس.
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, readSplitCollection, verifyAdminToken } from "./_firebase.js";

async function setStatus(db, date, requestId, patch) {
  if (!date || !requestId) throw new Error("requestId و date مطلوبين");
  const ref = db.collection("orderRequestsDays").doc(String(date));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("الطلب غير موجود");
    const entries = Array.isArray(snap.data().entries) ? snap.data().entries : [];
    const idx = entries.findIndex(e => e && e.id === requestId);
    if (idx < 0) throw new Error("الطلب غير موجود");
    entries[idx] = { ...entries[idx], ...patch };
    tx.set(ref, { entries }, { merge: true });
    return entries[idx];
  });
}

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const body = (typeof req.body === "string") ? JSON.parse(req.body || "{}") : (req.body || {});
    const { adminToken, action } = body;

    const auth = await verifyAdminToken(adminToken);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

    const db = getDb();

    if (action === "list") {
      const all = await readSplitCollection("orderRequestsDays");
      let list = Array.isArray(all) ? all : [];
      if (body.status) list = list.filter(r => r && r.status === body.status);
      list.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      const limit = Math.min(Math.max(Number(body.limit) || 200, 1), 500);
      const pendingCount = (Array.isArray(all) ? all : []).filter(r => r && r.status === "pending").length;
      return res.status(200).json({ ok: true, requests: list.slice(0, limit), total: list.length, pendingCount });
    }

    if (action === "confirm") {
      const updated = await setStatus(db, body.date, body.requestId, {
        status: "confirmed",
        handledAt: new Date().toISOString(),
        handledBy: auth.email || "",
        salesOrderId: body.salesOrderId || null,
      });
      return res.status(200).json({ ok: true, request: updated });
    }

    if (action === "reject") {
      const updated = await setStatus(db, body.date, body.requestId, {
        status: "rejected",
        handledAt: new Date().toISOString(),
        handledBy: auth.email || "",
        rejectReason: (body.reason || "").slice(0, 300),
      });
      return res.status(200).json({ ok: true, request: updated });
    }

    return res.status(400).json({ ok: false, error: "action غير معروف" });
  } catch (err) {
    console.error("order-requests error:", err);
    return res.status(500).json({ ok: false, error: err.message || "خطأ في الخادم" });
  }
}
